#!/usr/bin/env python3
"""Download the web study's data from Firestore as PsiTurk files (only works with the researcher's login).

    firebase login                      # once, as the researcher (owner of project hri-trust-study-rp)
    python3 firebase/download_data.py   # -> study_data/trialdata.csv, questiondata.csv, sessions_backup.json

Same format as `psiturk download_datafiles` (no header): trialdata.csv = uniqueid,index,timestamp,json;
questiondata.csv = uniqueid,key,value. Then: analysis/jasp_export.py --trialdata study_data/trialdata.csv
Test runs ("debug..." IDs from index.html?tools=1) are left out unless --with-tests.
Uses the Firebase CLI's login (the database rules let no one else read).
"""
import argparse
import csv
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
    a = ap.parse_args()
    allsess = sorted(sessions(access_token()), key=lambda s: s.get('begin', ''))
    keep = [s for s in allsess if a.with_tests or not str(s['uniqueid']).startswith('debug')]
    os.makedirs(a.out, exist_ok=True)
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
    json.dump(allsess, open(os.path.join(a.out, 'sessions_backup.json'), 'w'), indent=1)
    status = {}
    for s in keep:
        status[s.get('status')] = status.get(s.get('status'), 0) + 1
    print(f'{len(keep)} sessions {status} -> {a.out}/trialdata.csv, questiondata.csv, sessions_backup.json')


if __name__ == '__main__':
    main()
