# Delivery Robot Study (web version)

Participant link: https://raajp10.github.io/hri-experiment-demo/ (starts on the consent page).

- Design: between-subjects, 4 groups (reliable/unreliable × low/mid autonomy); each participant meets one robot,
  Nova (`static/js/design.js`). Groups are filled in turn, least-filled first, like PsiTurk.
- Data: every page is saved to the Firestore database of Firebase project `hri-trust-study-rp`
  (`sessions/{id}`, same records as PsiTurk). Participants can only write their own session; only the researcher
  can read (`firebase/firestore.rules`). Nothing is kept in the participant's browser.
- Download (researcher): `python3 firebase/download_data.py` → `study_data/trialdata.csv`, `questiondata.csv`
  (PsiTurk format) and a full JSON backup. Then `analysis/jasp_export.py --trialdata study_data/trialdata.csv`.
- Researcher walk-through: `index.html?tools=1` (add `&cond=0..3` for a group): video-speed bar, "debug" IDs that
  are not counted and are left out of the downloads.
- Participants can leave at any time ("Leave study" in the header); their answers are removed.
- Earlier versions: git tags `v1-first-demo`, `v2-after-review`.
