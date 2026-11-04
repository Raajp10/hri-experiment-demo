/*
 * Stand-in for the PsiTurk server on the web (GitHub Pages) version of the study.
 * The experiment code (static/js/task.js) runs unchanged: this file provides the PsiTurk API it calls.
 *
 * Every saveData() writes the whole session to Firestore, sessions/{uniqueid}, in the same shape PsiTurk
 * keeps it (data = trialdata records, questiondata = one key per answer). Participants can only create and
 * update their own session; only the researcher can read sessions (firebase/firestore.rules). The researcher
 * downloads trialdata.csv and questiondata.csv in PsiTurk's format from data.html.
 *
 * Condition assignment copies PsiTurk's balanced rotation: the least-filled cell, counted in Firestore
 * meta/counts (random if the database cannot be reached). It happens on the consent page, so the experiment
 * page cannot be opened without consent.
 *
 * Researcher walk-through: index.html?tools=1 (optionally &cond=0..3) gives a "debug..." ID, which is not
 * counted for assignment and is hidden from the downloads unless asked for.
 */
var Study = (function () {
  var SESSION_KEY = 'hri_session';
  var DONE_KEY = 'hri_done';
  var q = new URLSearchParams(window.location.search);
  var tools = q.get('tools') === '1';
  var design = (typeof STUDY_DESIGN !== 'undefined' && STUDY_DESIGN === 'between') ? 'between' : 'within';
  // 4 cells either way: between = condition 0-3; within = condition 0/1 x counterbalance 0/1
  var cellOf = function (i) { return design === 'between' ? [i, 0] : [i >> 1, i & 1]; };
  var KEYS = ['c0', 'c1', 'c2', 'c3'];

  var db = null;
  try {
    if (window.firebase && window.FIREBASE_CONFIG && FIREBASE_CONFIG.projectId) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
    }
  } catch (e) { console.warn('Database unavailable', e); }

  function store(k, v) {
    try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }
  function load(k) {
    try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function randomId(prefix) {
    var a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return prefix + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, ms); })]);
  }
  // Firestore rejects undefined values; PsiTurk's JSON export drops them too.
  function clean(o) { return JSON.parse(JSON.stringify(o)); }
  function write(sess) {
    if (!db) return Promise.reject(new Error('no database'));
    return db.collection('sessions').doc(sess.uniqueid).set(clean(sess));
  }

  // PsiTurk's balanced assignment (experiment.py get_random_condcount): random among the least-filled cells.
  function assign() {
    if (!db) return Promise.reject(new Error('no database'));
    var ref = db.collection('meta').doc('counts');
    return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var c = snap.exists ? snap.data() : {};
        var counts = KEYS.map(function (k) { return +c[k] || 0; });
        var min = Math.min.apply(null, counts);
        var minima = counts.map(function (n, i) { return n === min ? i : -1; }).filter(function (i) { return i >= 0; });
        var pick = minima[Math.floor(Math.random() * minima.length)];
        var next = {};
        KEYS.forEach(function (k, i) { next[k] = counts[i] + (i === pick ? 1 : 0); });
        tx.set(ref, next);
        return pick;
      });
    });
  }

  // Consent page: "I agree" -> new participant with a condition -> experiment page.
  function begin() {
    var forced = tools && q.has('cond') ? +q.get('cond') : null;
    var pick = forced !== null ? Promise.resolve(design === 'between' ? forced : forced * 2 + (+q.get('counter') || 0))
      : tools ? Promise.resolve(Math.floor(Math.random() * 4))
      : withTimeout(assign(), 8000).catch(function (e) { console.warn('Balanced assignment failed, random cell', e); return Math.floor(Math.random() * 4); });
    return pick.then(function (i) {
      var cell = cellOf(i);
      var sess = {uniqueid: randomId(tools ? 'debug' : 'p'), condition: cell[0], counterbalance: cell[1], design: design,
                  status: 'started', consent: true, begin: new Date().toISOString(), data: [], questiondata: {}};
      store(DONE_KEY, null);
      store(SESSION_KEY, {uniqueid: sess.uniqueid, condition: sess.condition, counterbalance: sess.counterbalance,
                          begin: sess.begin, tools: tools});
      return withTimeout(write(sess), 8000).catch(function (e) { console.warn('Could not create the session yet', e); });
    });
  }

  // Experiment page: no consent in this tab -> back to the consent page.
  function current() {
    var s = load(SESSION_KEY);
    if (!s) {
      window.location.replace((load(DONE_KEY) === 'completed' ? 'done.html' : 'index.html') + (tools ? '?tools=1' : ''));
      throw new Error('No consent in this tab: back to the consent page.');
    }
    return s;
  }

  function PsiTurk(uniqueId) {
    var s = load(SESSION_KEY) || {};
    // A reload starts the study again in the same condition, with a clean record.
    var sess = {uniqueid: uniqueId, condition: s.condition, counterbalance: s.counterbalance, design: design,
                status: 'started', consent: true, begin: s.begin || new Date().toISOString(), data: [], questiondata: {}};
    this.recordTrialData = function (trialdata) {
      sess.data.push({uniqueid: uniqueId, current_trial: sess.data.length, dateTime: Date.now(), trialdata: trialdata});
    };
    this.recordUnstructuredData = function (k, v) { sess.questiondata[k] = v; };
    this.saveData = function (cb) {
      withTimeout(write(sess), 10000).then(function () { if (cb && cb.success) cb.success(); },
        function (e) { console.warn('Save failed', e); if (cb && cb.error) cb.error(e); });
    };
    this.completeHIT = function () {
      sess.status = 'completed';
      sess.end = new Date().toISOString();
      var go = function () {
        store(SESSION_KEY, null);
        store(DONE_KEY, 'completed');
        window.location.href = 'done.html' + (tools ? '?tools=1' : '');
      };
      withTimeout(write(sess), 10000).then(go, go);
    };
    // Leaving the study: the answers are removed; only the fact that someone left is kept.
    this.withdraw = function () {
      var w = {uniqueid: uniqueId, condition: sess.condition, counterbalance: sess.counterbalance, design: design,
               status: 'withdrawn', consent: true, begin: sess.begin, end: new Date().toISOString(), data: [], questiondata: {}};
      store(SESSION_KEY, null);
      store(DONE_KEY, 'withdrawn');
      write(w).catch(function (e) { console.warn('Could not record leaving', e); });
    };
  }

  return {begin: begin, current: current, PsiTurk: PsiTurk, tools: tools, design: design, db: function () { return db; }};
})();

// Globals the experiment page normally gets from PsiTurk's exp.html template.
if (window.STUDY_PAGE === 'experiment') {
  (function () {
    var s = Study.current();
    window.uniqueId = s.uniqueid;
    window.condition = s.condition;
    window.counterbalance = s.counterbalance;
    window.adServerLoc = '';
    window.mode = s.tools ? 'debug' : 'live';
    window.PsiTurk = Study.PsiTurk;
  })();
}
