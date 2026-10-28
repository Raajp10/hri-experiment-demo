/*
 * Offline stand-in for the PsiTurk server, for the Mac demo only (demo/README.md).
 * The real experiment code (psiturk/static/js/task.js) runs unchanged; this file provides the same
 * PsiTurk API it calls and keeps every record in the browser (localStorage) instead of the server DB.
 *
 * Condition assignment copies PsiTurk's get_random_condcount(): count the sessions in each of the
 * 2 x 2 cells (condition x counterbalance) and pick randomly among the least-filled cells.
 */
var DEMO_KEY = 'hri_demo_sessions_v1';

var DemoStore = {
  all: function () {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'); } catch (e) { return DemoStore._mem || {}; }
  },
  save: function (s) {
    DemoStore._mem = s;
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch (e) { /* private window: memory only */ }
  },
  get: function (id) { return DemoStore.all()[id]; },
  put: function (id, sess) { var s = DemoStore.all(); s[id] = sess; DemoStore.save(s); },
  clear: function () { DemoStore.save({}); },
  // PsiTurk's balanced assignment (experiment.py get_random_condcount)
  assign: function () {
    var counts = {'0,0': 0, '0,1': 0, '1,0': 0, '1,1': 0};
    var s = DemoStore.all();
    Object.keys(s).forEach(function (k) { var key = s[k].condition + ',' + s[k].counterbalance; if (key in counts) counts[key]++; });
    var min = Math.min.apply(null, Object.values(counts));
    var minima = Object.keys(counts).filter(function (k) { return counts[k] === min; });
    var pick = minima[Math.floor(Math.random() * minima.length)].split(',');
    return {condition: +pick[0], counterbalance: +pick[1], counts: counts};
  }
};

function PsiTurk(uniqueId) {
  var sess = DemoStore.get(uniqueId) || {uniqueid: uniqueId, condition: condition, counterbalance: counterbalance,
                                        status: 'started', begin: new Date().toISOString(), data: [], questiondata: {}};
  DemoStore.put(uniqueId, sess);
  this.recordTrialData = function (trialdata) {
    sess.data.push({uniqueid: uniqueId, current_trial: sess.data.length, dateTime: Date.now(), trialdata: trialdata});
  };
  this.recordUnstructuredData = function (k, v) { sess.questiondata[k] = v; };
  this.saveData = function (cb) {
    DemoStore.put(uniqueId, sess);
    if (cb && cb.success) setTimeout(cb.success, 50);
  };
  this.completeHIT = function () {
    sess.status = 'completed'; sess.end = new Date().toISOString();
    DemoStore.put(uniqueId, sess);
    window.location.href = 'index.html?worker=' + encodeURIComponent(uniqueId) + '#data';
  };
}

// Globals the experiment page normally gets from PsiTurk's exp.html template.
(function () {
  var q = new URLSearchParams(window.location.search);
  window.uniqueId = q.get('worker') || ('demo' + Date.now().toString(36));
  var existing = DemoStore.get(window.uniqueId);
  if (existing) { window.condition = existing.condition; window.counterbalance = existing.counterbalance; }
  else if (q.has('cond') && q.has('counter')) { window.condition = +q.get('cond'); window.counterbalance = +q.get('counter'); }
  else { var a = DemoStore.assign(); window.condition = a.condition; window.counterbalance = a.counterbalance; }
  window.adServerLoc = '';
  // 'debug' lets task.js honour ?start=block1 (skip to Robot 1); otherwise identical behaviour
  window.mode = q.get('start') ? 'debug' : 'demo';
})();
