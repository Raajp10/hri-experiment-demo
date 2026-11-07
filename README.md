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
- Before the experiment (second review, 2026-11-04): about you (2 pages; age checked as it is typed, 18–80), an
  audio/video check (the clip shows one word and a voice says another; the participant types both, clips made by
  `scripts/make_av_check.py`), then 10 instruction pages marked "Instructions · not a trial" with no clock. The clock
  appears from the first delivery on. The header names the part and page, e.g. "Instructions — Page 2 of 10".
  NARS was removed (social-robot items); robot experience is asked on an experience scale. Saved as
  `onboarding_version` in questiondata.
- The study switches the browser to full screen at the participant's first click ("Full screen" button in the
  header to switch it off/on). Instruction pages show short points beside a large video. "How Nova works" uses
  `instr_mode_*_nova.mp4`: the mode clips with the robot's top painted Nova blue (`scripts/make_nova_mode_clips.py`).
- Measures (Dr. Roy, 2026-11-07; questiondata `measures_version` = v4-2026-11-07): no trust question after each
  delivery. The answer after each delivery is situational-awareness data: trialdata `sa_correct` (low autonomy:
  confirmed a right room or changed a wrong one; mid: Yes/No matched whether Nova was right), per participant
  `b1_sa_correct` (0-3) and `b1_sa_accuracy`. Trust is measured once after the 3 deliveries with the MDMT Capacity
  Trust subscale (Reliable + Capable items, 0-7, "Does not fit" left out): `b1_mdmt_*`, `b1_capacity_trust`,
  `b1_capacity_reliable`, `b1_capacity_capable`.
- Earlier versions: git tags `v1-first-demo`, `v2-after-review`.
