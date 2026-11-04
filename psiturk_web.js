/*
 * Stand-in for the PsiTurk server on the web (GitHub Pages) version of the study.
 * The experiment code (static/js/task.js) runs unchanged: this file provides the PsiTurk API it calls.
 *
 * Every saveData() writes the whole session to Firestore, sessions/{uniqueid}, in the same shape PsiTurk
 * keeps it (data = trialdata records, questiondata = one key per answer). task.js saves on every new page.
 * Each participant is signed in with an anonymous Firebase account; a session can only be written by the
 * account that created it, and only the researcher can read sessions (firebase/firestore.rules).
 *
 * Condition assignment copies PsiTurk's balanced rotation: the least-filled cell, counted in Firestore
 * meta/counts. It happens on the consent page, so the experiment page cannot be opened without consent.
 *
 * Reloading the experiment page starts a new attempt in the same condition under a new ID (<id>-r2, ...);
 * the earlier attempt is left as it was (unfinished). Only completed sessions go into the analysis files.
 * The browser keeps only the participant's ID, condition and attempt number (sessionStorage, this tab).
 *
 * Researcher walk-through: index.html?tools=1 (optionally &cond=0..3) gives a "debug..." ID, which is not
 * counted for assignment and is left out of the downloads unless asked for.
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

  var db = null, auth = null;
  try {
    if (window.firebase && window.FIREBASE_CONFIG && FIREBASE_CONFIG.projectId) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      auth = firebase.auth();
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

  // Anonymous participant account (kept by the browser across reloads). Its uid owns the session in the database.
  var user = null;
  function signIn() {
    if (!auth) return Promise.reject(new Error('no database'));
    if (user) return Promise.resolve(user);
    return new Promise(function (resolve, reject) {
      var off = auth.onAuthStateChanged(function (u) {
        off();
        if (u) { user = u; resolve(u); return; }
        auth.signInAnonymously().then(function (c) { user = c.user; resolve(user); }, reject);
      });
    });
  }

  // Firestore rejects undefined values; PsiTurk's JSON export drops them too.
  function clean(o) { return JSON.parse(JSON.stringify(o)); }
  function write(sess) {
    return signIn().then(function (u) {
      sess.owner = u.uid;
      return db.collection('sessions').doc(sess.uniqueid).set(clean(sess));
    });
  }

  // PsiTurk's balanced assignment (experiment.py get_random_condcount): random among the least-filled cells.
  function assign() {
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

  // Consent page: "I agree" -> signed-in participant with a condition and a saved session -> experiment page.
  // Rejects if the database cannot be reached (the study does not start without a place to save answers).
  function begin() {
    var forced = tools && q.has('cond') ? +q.get('cond') : null;
    return withTimeout(signIn(), 10000).then(function () {
      if (forced !== null) return design === 'between' ? forced : forced * 2 + (+q.get('counter') || 0);
      if (tools) return Math.floor(Math.random() * 4);
      return withTimeout(assign(), 10000);
    }).then(function (i) {
      var cell = cellOf(i);
      var id = randomId(tools ? 'debug' : 'p');
      var sess = {uniqueid: id, condition: cell[0], counterbalance: cell[1], design: design,
                  status: 'started', consent: true, begin: new Date().toISOString(), data: [], questiondata: {}};
      return withTimeout(write(sess), 10000).then(function () {
        store(DONE_KEY, null);
        store(SESSION_KEY, {uniqueid: id, first_id: id, attempt: 1, opened: false, condition: sess.condition,
                            counterbalance: sess.counterbalance, begin: sess.begin, tools: tools});
      });
    });
  }

  // Experiment page: no consent in this tab -> back to the consent page. A reload -> next attempt.
  function current() {
    var s = load(SESSION_KEY);
    if (!s) {
      window.location.replace((load(DONE_KEY) === 'completed' ? 'done.html' : 'index.html') + (tools ? '?tools=1' : ''));
      throw new Error('No consent in this tab: back to the consent page.');
    }
    if (s.opened) {
      s.attempt += 1;
      s.uniqueid = s.first_id + '-r' + s.attempt;
    }
    s.opened = true;
    store(SESSION_KEY, s);
    return s;
  }

  // Shown when the final save cannot reach the server: the participant can try again.
  function retryPage(message, again) {
    var c = document.getElementById('container-exp');
    c.innerHTML = '<h2>Your answers are not saved yet</h2><p class="lead">' + message + '</p>' +
      '<div class="actions"><button class="btn big" id="save-retry">Try again</button></div>';
    document.getElementById('save-retry').onclick = function () {
      c.innerHTML = '<h2>Saving your answers…</h2>';
      again();
    };
  }

  function PsiTurk(uniqueId) {
    var s = load(SESSION_KEY) || {};
    var sess = {uniqueid: uniqueId, condition: s.condition, counterbalance: s.counterbalance, design: design,
                status: 'started', consent: true, begin: new Date().toISOString(), data: [], questiondata: {}};
    if (s.attempt > 1) {
      // earlier attempts stay in the database under their own IDs
      sess.questiondata.attempt = s.attempt;
      sess.questiondata.first_id = s.first_id;
    }
    this.recordTrialData = function (trialdata) {
      sess.data.push({uniqueid: uniqueId, current_trial: sess.data.length, dateTime: Date.now(), trialdata: trialdata});
    };
    this.recordUnstructuredData = function (k, v) { sess.questiondata[k] = v; };
    this.saveData = function (cb) {
      withTimeout(write(sess), 15000).then(function () { if (cb && cb.success) cb.success(); },
        function (e) { console.warn('Save failed', e); if (cb && cb.error) cb.error(e); });
    };
    // The "done" page only after the database has the completed session.
    this.completeHIT = function () {
      var self = this;
      sess.status = 'completed';
      sess.end = new Date().toISOString();
      withTimeout(write(sess), 15000).then(function () {
        store(SESSION_KEY, null);
        store(DONE_KEY, 'completed');
        window.location.href = 'done.html' + (tools ? '?tools=1' : '');
      }, function (e) {
        console.warn('Final save failed', e);
        sess.status = 'started';
        retryPage('Please check your internet connection, then click “Try again”. Do not close this window.',
                  function () { self.completeHIT(); });
      });
    };
    // Leaving the study: the answers are removed; only the fact that someone left is kept.
    this.withdraw = function (cb) {
      var w = {uniqueid: uniqueId, condition: sess.condition, counterbalance: sess.counterbalance, design: design,
               status: 'withdrawn', consent: true, begin: sess.begin, end: new Date().toISOString(), data: [],
               questiondata: s.attempt > 1 ? {attempt: s.attempt, first_id: s.first_id} : {}};
      withTimeout(write(w), 15000).then(function () {
        store(SESSION_KEY, null);
        store(DONE_KEY, 'withdrawn');
        if (cb && cb.success) cb.success();
      }, function (e) { console.warn('Could not record leaving', e); if (cb && cb.error) cb.error(e); });
    };
  }

  return {begin: begin, current: current, PsiTurk: PsiTurk, tools: tools, design: design};
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
