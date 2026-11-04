# Delivery Robot Study (web version)

Participant link: https://raajp10.github.io/hri-experiment-demo/ (starts on the consent page).

- Design: between-subjects, 4 groups (reliable/unreliable × low/mid autonomy); each participant meets one robot,
  Nova (`static/js/design.js`). Groups are filled in turn, least-filled first, like PsiTurk.
- Data: every page is saved to the Firestore database of Firebase project `hri-trust-study-rp`
  (`sessions/{id}`, same records as PsiTurk). Each participant is signed in with an anonymous Firebase account;
  a session can be written only by that account and only until it is completed or withdrawn. Only the researcher
  can read (`firebase/firestore.rules`). The browser keeps only the participant's ID, group and attempt number
  (sessionStorage, for this tab); answers are not stored in the browser.
- Reloading the experiment page starts a new attempt in the same group (`<id>-r2`); the earlier attempt stays as
  an unfinished session. The "done" page appears only after the database has confirmed the completed session.
- Participants can leave at any time: "Leave study" removes their answers (confirmed by the database before the
  page says so). Closing the window leaves an unfinished session: it is never analysed, and
  `download_data.py --delete-unfinished` deletes those older than 24 hours.
- Download (researcher): `python3 firebase/download_data.py` → `study_data/trialdata.csv`, `questiondata.csv`
  (PsiTurk format, completed sessions only), `sessions.csv` (every session with its status) and a JSON backup.
  Then `analysis/jasp_export.py --trialdata study_data/trialdata.csv` (in the psiTurk project folder).
- Researcher walk-through: `index.html?tools=1` (add `&cond=0..3` for a group): video-speed bar, "debug" IDs that
  are not counted and are left out of the downloads.
- Earlier versions: git tags `v1-first-demo`, `v2-after-review`.
