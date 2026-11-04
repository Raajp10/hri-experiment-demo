#!/usr/bin/env python3
"""Download the web study's data from Firestore as PsiTurk files (only works with the researcher's login).

    firebase login                      # once, as the researcher (owner of project hri-trust-study-rp)
    python3 firebase/download_data.py   # -> study_data/trialdata.csv, questiondata.csv, sessions.csv,
                                        #    sessions_backup.json

trialdata.csv / questiondata.csv: COMPLETED sessions only (use --all to include unfinished ones), in the format
of `psiturk download_datafiles` (no header): uniqueid,index,timestamp,json and uniqueid,key,value.
Then: analysis/jasp_export.py --trialdata study_data/trialdata.csv
sessions.csv: one labelled row per session (status completed / started = unfinished / withdrawn, attempt).
sessions_backup.json: everything, as stored.
Test runs ("debug..." IDs from index.html?tools=1) are left out unless --with-tests.

Unfinished sessions (window closed, or an earlier attempt before a reload) are not analysed. With
--delete-unfinished the script deletes those older than 24 hours from the database and leaves them out of the backup.
Uses the Firebase CLI's login (the database rules let no one else read).
"""
import argparse
import csv
import datetime
import json
import os
import subprocess
import sys
import urllib.request

PROJECT = 'hri-trust-study-rp'
CLI_TOKENS = os.path.expanduser('~/.config/configstore/firebase-tools.json')


def access_token():
    # Any Firebase CLI call refreshes the stored login token if it has expired.
    subprocess.run(['firebase', 'projects:list'], capture_output=True, check=False)
    try:
        return json.load(open(CLI_TOKENS))['tokens']['access_token']
    except (OSError, KeyError, ValueError):
        sys.exit('Not logged in: run  firebase login  first.')


def value(v):
    """Firestore REST value -> Python"""
    if 'mapValue' in v:
        return {k: value(x) for k, x in v['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in v:
        return [value(x) for x in v['arrayValue'].get('values', [])]
    if 'integerValue' in v:
        return int(v['integerValue'])
    if 'doubleValue' in v:
        return v['doubleValue']
    if 'nullValue' in v:
        return None
    return next(iter(v.values()))


def sessions(token):
    out, page = [], ''
    while True:
        url = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/sessions'
               f'?pageSize=300' + (f'&pageToken={page}' if page else ''))
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        d = json.load(urllib.request.urlopen(req))
        out += [value({'mapValue': doc}) for doc in d.get('documents', [])]
        page = d.get('nextPageToken')
        if not page:
            return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default='study_data')
    ap.add_argument('--with-tests', action='store_true')
    ap.add_argument('--all', action='store_true', help='also put unfinished sessions into the CSV files')
    ap.add_argument('--delete-unfinished', action='store_true',
                    help='delete sessions still unfinished 24 hours after they began')
    a = ap.parse_args()
    token = access_token()
    allsess = sorted(sessions(token), key=lambda s: s.get('begin', ''))
    shown = [s for s in allsess if a.with_tests or not str(s['uniqueid']).startswith('debug')]
    keep = [s for s in shown if a.all or s.get('status') == 'completed']
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, 'sessions.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['uniqueid', 'status', 'condition', 'counterbalance', 'design', 'attempt', 'first_id', 'begin', 'end',
                    'records', 'answers'])
        for s in shown:
            q = s.get('questiondata', {})
            w.writerow([s['uniqueid'], s.get('status'), s.get('condition'), s.get('counterbalance'), s.get('design'),
                        q.get('attempt', 1), q.get('first_id', s['uniqueid']), s.get('begin'), s.get('end', ''),
                        len(s.get('data', [])), len(q)])
    with open(os.path.join(a.out, 'trialdata.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        for s in keep:
            for d in s.get('data', []):
                w.writerow([s['uniqueid'], d['current_trial'], d['dateTime'], json.dumps(d['trialdata'])])
    with open(os.path.join(a.out, 'questiondata.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        for s in keep:
            for k, v in s.get('questiondata', {}).items():
                w.writerow([s['uniqueid'], k, json.dumps(v) if isinstance(v, (dict, list)) else
                            ('true' if v is True else 'false' if v is False else v)])
    old = []
    if a.delete_unfinished:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)).isoformat()
        old = [s for s in allsess if s.get('status') == 'started' and s.get('begin', '') < cutoff]
    json.dump([s for s in allsess if s not in old], open(os.path.join(a.out, 'sessions_backup.json'), 'w'), indent=1)
    status = {}
    for s in shown:
        status[s.get('status')] = status.get(s.get('status'), 0) + 1
    print(f'{len(shown)} sessions {status}; {len(keep)} in trialdata.csv/questiondata.csv -> {a.out}/')
    if a.delete_unfinished:
        for s in old:
            url = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/sessions/'
                   f"{s['uniqueid']}")
            urllib.request.urlopen(urllib.request.Request(url, method='DELETE', headers={'Authorization': f'Bearer {token}'}))
        print(f'deleted {len(old)} unfinished sessions older than 24 hours (not kept in the backup either)')


if __name__ == '__main__':
    main()
