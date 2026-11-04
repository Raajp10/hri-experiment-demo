/*
 * HRI delivery-robot trust study — PsiTurk front end.
 *
 * Globals from exp.html (filled in by PsiTurk): uniqueId, adServerLoc, mode, condition, counterbalance.
 * STUDY_DESIGN comes from static/js/design.js:
 *   'within'  (submitted design): condition 0 = reliable, 1 = unreliable; counterbalance 0 = low autonomy
 *             first, 1 = mid first. Robot 1 = Nova, Robot 2 = Atlas (config.txt: num_conds 2, num_counters 2).
 *   'between': one robot (Nova) at one autonomy level. condition 0 = reliable/low, 1 = reliable/mid,
 *             2 = unreliable/low, 3 = unreliable/mid (config.txt: num_conds 4, num_counters 1).
 * CLIP_SPEC comes from static/js/clip_spec.js, CLIP_CUES from videos/cues.js.
 *
 * Procedure (revised after Dr. Roy's review, 2026-10-29): consent (first page) -> about you (3 pages) ->
 * NARS (3 pages) -> sound check -> how it works (6 short pages, each with a piece of the training video) ->
 * per robot: meet the robot, how it works (its own mode only), what you will see (screenshot), 3 deliveries
 * (target, video + decision, trust), questionnaire (5 pages) -> open-ended question -> debrief.
 * No practice trial. Every page fits on the screen without scrolling.
 *
 * Data: experimental records go to trialdata via record(); all pre- and post-experiment questions go to
 * questiondata via saveQuestions(), one key per answer. Every page shows a countdown in the header (soft
 * limit: pages that ran over are listed in questiondata 'pages_over_time').
 */
/* global PsiTurk, uniqueId, adServerLoc, mode, condition, counterbalance, CLIP_SPEC, CLIP_CUES, STUDY_DESIGN,
   NARS_ITEMS, NARS_SCALE, MDMT_ITEMS */

var psiTurk = new PsiTurk(uniqueId, adServerLoc, mode);
var params = new URLSearchParams(window.location.search);
// Test hooks, only honoured in debug mode: ?fast=1 plays videos at 16x; ?start=block1 / block2 skips straight
// to that robot (to preview trial clips; nothing before it is recorded).
var FAST = (mode === 'debug' && params.get('fast') === '1');
var START = mode === 'debug' ? params.get('start') : null;

var DESIGN = (typeof STUDY_DESIGN !== 'undefined' && STUDY_DESIGN === 'between') ? 'between' : 'within';
var COND = parseInt(condition, 10) || 0;
var COUNTER = parseInt(counterbalance, 10) || 0;
var GROUP, ORDER;
if (DESIGN === 'between') {
  GROUP = COND < 2 ? 'reliable' : 'unreliable';
  ORDER = [COND % 2 ? 'mid' : 'low'];
} else {
  GROUP = COND === 0 ? 'reliable' : 'unreliable';
  ORDER = COUNTER === 0 ? ['low', 'mid'] : ['mid', 'low'];
}
var NBLOCKS = ORDER.length;
var PATTERN = CLIP_SPEC.patterns[GROUP];
var VIDEO_DIR = 'static/videos/';
var IMG_DIR = 'static/images/';
var attention = {};

psiTurk.recordUnstructuredData('design', DESIGN);
psiTurk.recordUnstructuredData('group', GROUP);
psiTurk.recordUnstructuredData('autonomy_order', ORDER.join('-'));

// ------------------------------------------------------------------ helpers
var $c = function () { return document.getElementById('container-exp'); };

// Every new page also saves everything recorded so far, so closing the window loses at most the current page.
function show(html) {
  if (leaving) return;
  $c().innerHTML = html;
  window.scrollTo(0, 0);
  psiTurk.saveData();
}

// ------------------------------------------------------------------ leave the study (any page)
// "Leave study" in the header. It asks once on the page (no browser dialog), then marks the session withdrawn
// (trialdata phase 'withdrawn', questiondata 'withdrawn'); withdrawn sessions are not analysed.
var leaving = false;
function leaveButton() {
  var head = document.querySelector('.app-head .inner');
  if (!head || document.getElementById('leave')) return;
  var b = document.createElement('button');
  b.id = 'leave';
  b.type = 'button';
  b.className = 'leave';
  b.textContent = 'Leave study';
  b.onclick = askLeave;
  head.appendChild(b);
}
function askLeave() {
  if (leaving || document.getElementById('leave-box')) return;
  var box = document.createElement('div');
  box.id = 'leave-box';
  box.className = 'leave-box';
  box.innerHTML = '<div class="leave-card" role="dialog" aria-modal="true" aria-labelledby="leave-t">' +
    '<h2 id="leave-t">Leave the study?</h2><p>You can stop at any time. If you leave now, your answers will not be used.</p>' +
    '<div class="actions"><button class="btn alt" id="leave-no">Keep going</button>' +
    '<button class="btn danger" id="leave-yes">Yes, leave</button></div></div>';
  document.body.appendChild(box);
  document.getElementById('leave-no').onclick = function () { box.remove(); };
  document.getElementById('leave-yes').onclick = leaveStudy;
}
function leaveStudy() {
  stopCountdown();
  document.querySelectorAll('video, audio').forEach(function (m) { m.pause(); });
  record({phase: 'withdrawn'});
  psiTurk.recordUnstructuredData('withdrawn', true);
  leaving = true;
  ['leave-box', 'leave', 'timer'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
  var pb = document.getElementById('progress-bar');
  if (pb) pb.style.width = '0';
  // "You have left" only once the server has the withdrawal; otherwise offer to try again.
  var done = function () {
    $c().innerHTML = '<h2>You have left the study</h2><p class="lead">Thank you for your time. Your answers will not be used. ' +
      'You can close this window now.</p>';
  };
  var failed = function () {
    $c().innerHTML = '<h2>Could not reach the study server</h2><p class="lead">Please check your internet connection.</p>' +
      '<div class="actions"><button class="btn big" id="leave-retry">Try again</button></div>';
    document.getElementById('leave-retry').onclick = send;
  };
  function send() {
    $c().innerHTML = '<h2>Leaving the study…</h2>';
    if (psiTurk.withdraw) psiTurk.withdraw({success: done, error: failed});
    else psiTurk.saveData({success: done, error: failed});
  }
  send();
}

// Progress in the header bar: step label + bar (0-1).
var STEPS = ['About you', 'Your views', 'Sound check', 'How it works']
  .concat(NBLOCKS === 2 ? ['Robot 1', 'Robot 2'] : ['The robot']).concat(['Finish']);
var STEP_ROBOT = 4, STEP_FINISH = STEPS.length - 1;
function setStep(k, within) {
  var bar = document.getElementById('progress-bar'), lab = document.getElementById('step-label');
  if (bar) bar.style.width = Math.round(100 * (k + (within || 0)) / STEPS.length) + '%';
  if (lab) lab.textContent = 'Step ' + (k + 1) + ' of ' + STEPS.length + ' · ' + STEPS[k];
}

function clicked(selector) {
  return new Promise(function (resolve) {
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      el.addEventListener('click', function handler(ev) {
        els.forEach(function (e) { e.disabled = true; });
        resolve(ev.currentTarget);
      }, {once: true});
    });
  });
}

function record(obj) {
  obj.design = DESIGN;
  obj.group = GROUP;
  obj.condition = COND;
  obj.counterbalance = COUNTER;
  obj.autonomy_order = ORDER.join('-');
  psiTurk.recordTrialData(obj);
}

function save() { psiTurk.saveData(); }

// Questionnaire answers -> questiondata, one key per answer (prefix e.g. 'b1_').
function saveQuestions(data, prefix) {
  Object.keys(data).forEach(function (k) { psiTurk.recordUnstructuredData((prefix || '') + k, data[k]); });
}

// ------------------------------------------------------------------ countdown timer (header)
var overTime = [];
var timerId = null;
function timerEl() {
  var el = document.getElementById('timer');
  var head = document.querySelector('.app-head .inner');
  if (!el && head) {
    el = document.createElement('span');
    el.id = 'timer';
    el.className = 'timer';
    head.appendChild(el);
  }
  return el;
}
function mmss(sec) { return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
function stopCountdown() { if (timerId) clearInterval(timerId); timerId = null; }
// Counts down `seconds` for this page. At 0 the timer turns red and asks for an answer; the page stays open.
function countdown(seconds, page) {
  stopCountdown();
  var el = timerEl();
  if (!el) return;
  var end = Date.now() + seconds * 1000;
  function tick() {
    var left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    el.className = 'timer' + (left <= 10 ? ' low' : '');
    el.textContent = 'Time left ' + mmss(left);
    if (left === 0) {
      el.className = 'timer up';
      el.textContent = 'Time is up: please answer';
      if (page && overTime.indexOf(page) < 0) overTime.push(page);
      stopCountdown();
    }
  }
  tick();
  timerId = setInterval(tick, 250);
}
// While a video plays the timer shows how much of the video is left.
function videoCountdown(v) {
  stopCountdown();
  var el = timerEl();
  if (el && v.duration) {
    el.className = 'timer video';
    el.textContent = 'Video ' + mmss(Math.max(0, Math.ceil((v.duration - v.currentTime) / (v.playbackRate || 1))));
  }
}

// ------------------------------------------------------------------ robots
// Pictures are crops of the rendered robot (TurtleBot3 Waffle Pi) from the clips, so they match the videos.
var EXAMPLE = {name: '', colour: '#9aa3b2', img: 'robot_example.jpg'};
function robotOf(block) {
  var r = CLIP_SPEC.robots[String(block)];
  return {name: r.name, colour: r.colour, img: 'robot_' + r.name.toLowerCase() + '.jpg', trials: r.trials};
}
function robotPic(robot, cls) {
  return '<img class="robot-pic ' + (cls || '') + '" src="' + IMG_DIR + robot.img + '" alt="' + (robot.name || 'robot') + '">';
}
function robotBadge(robot) {
  return '<span class="robot-badge" style="--rc:' + robot.colour + '"><span class="dot"></span>' + robot.name + '</span>';
}

// ------------------------------------------------------------------ video player UI
// Title bar (robot + delivery target) above the video; under it a navy bar with the robot's picture, a chat
// bubble showing what the robot says (timed by CLIP_CUES from videos/cues.js) and room for buttons.
// The player is sized so that the whole page fits on the screen (hri.css: .player, .player.short).
function playerHTML(robot, title, right, cls) {
  return '<div class="player ' + (cls || '') + '">' +
    (title === null ? '' : '<div class="player-title"><span class="dot" style="background:' + robot.colour + '"></span>' +
      '<span class="ptitle">' + title + '</span><span class="pright">' + (right || '') + '</span>' +
      '<span class="snd">' + SOUND_ICON + 'Sound on</span></div>') +
    '<div id="stage"></div>' +
    '<div class="robot-bar"><div class="robot-icon">' + robotPic(robot) +
    (robot.name ? '<div class="robot-name">' + robot.name + '</div>' : '') + '</div>' +
    '<div class="bubble empty" id="bubble"></div><div class="bar-buttons" id="bar-buttons"></div></div>' +
    '</div>';
}

function setBubble(text) {
  var b = document.getElementById('bubble');
  if (!b) return;
  if (text && b.textContent !== text) {
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  b.textContent = text || '';
  b.classList.toggle('empty', !text);
}

var SOUND_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor"/>' +
  '<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';

// Plays a clip to the end (no controls, no seeking). Resolves with watch time in ms.
// The robot's messages appear in the chat bubble at the times recorded with the clip.
function playClip(name) {
  return new Promise(function (resolve) {
    var stage = document.getElementById('stage');
    stage.innerHTML = '<div class="screen"><video id="clip" playsinline' + (FAST ? ' muted' : '') + ' preload="auto" src="' + VIDEO_DIR + name +
      '"></video><div class="subtitle" id="subtitle"></div></div><div class="vprog"><div id="vprog"></div></div>' +
      '<p class="hint" id="clip-status"></p>';
    var v = document.getElementById('clip');
    var cues = (typeof CLIP_CUES !== 'undefined' && CLIP_CUES[name]) ? CLIP_CUES[name].cues : [];
    var voice = (typeof CLIP_CUES !== 'undefined' && CLIP_CUES[name] && CLIP_CUES[name].voice) || [];
    var bar = document.querySelector('.robot-bar');
    var shown = -1;
    function updateCues() {
      var tt = v.currentTime;
      videoCountdown(v);
      if (bar) bar.classList.toggle('speaking', !v.ended && voice.some(function (s) { return tt >= s.t && tt < s.t + s.dur; }));
      if (v.duration) document.getElementById('vprog').style.width = (100 * tt / v.duration) + '%';
      var k = -1;
      for (var i = 0; i < cues.length; i++) if (cues[i].t <= v.currentTime + 0.02) k = i;
      if (k === shown || k < 0) return;
      shown = k;
      setBubble(cues[k].message);
      var sub = document.getElementById('subtitle');
      sub.textContent = cues[k].caption || '';
      sub.classList.toggle('on', !!cues[k].caption);
    }
    setBubble('');
    var t0 = performance.now();
    if (FAST) v.playbackRate = 16;
    v.addEventListener('ended', function () {
      v.currentTime = v.duration;
      updateCues();
      if (bar) bar.classList.remove('speaking');
      resolve(Math.round(performance.now() - t0));
    }, {once: true});
    v.addEventListener('error', function () {
      document.getElementById('clip-status').innerHTML =
        '<b>Video failed to load (' + name + ').</b> Please check your internet connection and reload the page.';
      record({phase: 'error', clip: name, error: 'video_load_failed'});
    });
    // Block seeking via keyboard / context menu.
    v.addEventListener('seeking', function () { if (!v.ended && v.currentTime > 0.1) v.currentTime = v._last || 0; });
    v.addEventListener('timeupdate', function () { if (!v.seeking) v._last = v.currentTime; updateCues(); });
    // Full-quality clips can take a moment to load on slow connections.
    var status = document.getElementById('clip-status');
    v.addEventListener('waiting', function () { if (!status.querySelector('button')) status.textContent = 'Loading video…'; });
    v.addEventListener('playing', function () { if (!status.querySelector('button')) status.textContent = ''; });
    var p = v.play();
    if (p && p.catch) {
      p.catch(function () {
        document.getElementById('clip-status').innerHTML =
          '<button class="btn" id="play-btn">▶ Play video (with sound)</button>';
        document.getElementById('play-btn').onclick = function () { v.play(); this.remove(); };
      });
    }
  });
}

// ------------------------------------------------------------------ form helpers
// Radio-button matrix. items: [{id, text}], scale: [{value, label}]
function matrix(items, scale, cls) {
  var h = '<table class="matrix ' + (cls || '') + '"><thead><tr><th></th>';
  scale.forEach(function (s) { h += '<th>' + s.label + '</th>'; });
  h += '</tr></thead><tbody>';
  items.forEach(function (it) {
    h += '<tr data-item="' + it.id + '"><td class="item">' + it.text +
         (it.hint ? '<span class="gloss">' + it.hint + '</span>' : '') + '</td>';
    scale.forEach(function (s) {
      h += '<td><label><input type="radio" name="' + it.id + '" value="' + s.value + '"' +
           ' aria-label="' + s.label + '"></label></td>';
    });
    h += '</tr>';
  });
  return h + '</tbody></table>';
}

function radioRow(name, options) {
  return '<div class="radio-row" data-item="' + name + '">' + options.map(function (o) {
    return '<label class="opt"><input type="radio" name="' + name + '" value="' + o.value + '"> ' +
           '<span>' + String(o.label).replace('<br>', '') + '</span></label>';
  }).join('') + '</div>';
}

function seven(lo, hi) {
  var s = [];
  for (var j = 1; j <= 7; j++) s.push({value: j, label: j + (j === 1 ? '<br><small>' + lo + '</small>' : j === 7 ? '<br><small>' + hi + '</small>' : '')});
  return s;
}

// Collects radio/select/number inputs; returns null and highlights missing ones if incomplete.
function collect(names) {
  var out = {}, missing = [];
  names.forEach(function (n) {
    var el = document.querySelector('[name="' + n + '"]');
    var val = null;
    if (el && el.type === 'number') {
      var x = el.value.trim() === '' ? NaN : Number(el.value);
      val = (isNaN(x) || x < Number(el.min) || x > Number(el.max)) ? null : String(x);
    } else if (el && el.type === 'radio') {
      var chk = document.querySelector('input[name="' + n + '"]:checked');
      val = chk ? chk.value : null;
    } else if (el) {
      val = el.value.trim() === '' ? null : el.value.trim();
    }
    var row = document.querySelector('[data-item="' + n + '"]');
    if (row) row.classList.toggle('missing', val === null);
    if (val === null) missing.push(n); else out[n] = val;
  });
  return missing.length ? null : out;
}

async function submitWhenComplete(names, btnSel) {
  var msg = document.getElementById('form-msg');
  while (true) {
    var btn = await clicked(btnSel);
    var data = collect(names);
    if (data) return data;
    btn.disabled = false;
    msg.textContent = 'Please answer the questions marked in red.' +
      (document.querySelector('.missing [type=number]') ? ' Age must be a number from 18 to 80.' : '');
  }
}

var NEXT = '<p id="form-msg" class="err"></p><div class="actions"><button class="btn big" id="next">Next</button></div>';

// One form page: shows it, starts the countdown, waits for complete answers. `keep(answers)` puts the page's
// answers into questiondata straight away (saved with the next page), so no answered page is lost.
async function formPage(html, names, seconds, page, keep) {
  show(html + NEXT);
  countdown(seconds, page);
  var answers = await submitWhenComplete(names, '#next');
  if (keep) keep(answers);
  return answers;
}

// A page with only text (and pictures) and a button.
async function textPage(html, seconds, page, label) {
  show(html + '<div class="actions"><button class="btn big" id="go">' + (label || 'Next') + '</button></div>');
  countdown(seconds, page);
  await clicked('#go');
}

// A short page with a heading, one or two sentences and a video; "Next" appears in the robot bar at the end.
async function videoPage(title, text, clip, page, robot) {
  show('<h2>' + title + '</h2><p class="lead tight">' + text + '</p>' + playerHTML(robot || EXAMPLE, null, '', 'short'));
  var ms = await playClip(clip);
  record({phase: 'instructions', page: page, clip: clip, watch_ms: ms});
  document.getElementById('bar-buttons').innerHTML = '<button class="btn" id="next">Next</button>';
  countdown(30, page);
  await clicked('#next');
}

// ------------------------------------------------------------------ before the experiment
async function demographics() {
  var t0 = performance.now(), data = {};
  setStep(0);
  Object.assign(data, await formPage('<div class="eyebrow">About you · 1 of 3</div><h2>A few questions about you</h2>' +
    '<div class="form-grid">' +
    '<div class="q" data-item="age"><label>How old are you? <input type="number" name="age" min="18" max="80" step="1"></label></div>' +
    '<div class="q" data-item="gender"><label>Gender: <select name="gender"><option value="">— select —</option>' +
    '<option>Woman</option><option>Man</option><option>Non-binary</option><option>Prefer to self-describe</option>' +
    '<option>Prefer not to say</option></select></label></div>' +
    '<div class="q" data-item="education"><label>Highest education: <select name="education"><option value="">— select —</option>' +
    '<option>High school or less</option><option>Some college</option><option>Bachelor\'s degree</option>' +
    '<option>Master\'s degree</option><option>Doctorate</option><option>Other</option></select></label></div></div>',
    ['age', 'gender', 'education'], 90, 'demographics_1', saveQuestions));
  setStep(0, 0.33);
  var yn = [{value: 'yes', label: 'Yes'}, {value: 'no', label: 'No'}];
  Object.assign(data, await formPage('<div class="eyebrow">About you · 2 of 3</div><h2>Have you done this before?</h2>' +
    '<div class="q"><p>Have you taken part in a PsiTurk study before?</p>' + radioRow('psiturk_before', yn) + '</div>' +
    '<div class="q"><p>Have you worked with robots before?</p>' + radioRow('robots_before', yn) + '</div>',
    ['psiturk_before', 'robots_before'], 60, 'demographics_2', saveQuestions));
  setStep(0, 0.66);
  Object.assign(data, await formPage('<div class="eyebrow">About you · 3 of 3</div><h2>Robots and games</h2>' +
    '<div class="q"><p>How much have you used or talked to robots?</p>' +
    radioRow('robot_experience', [{value: 1, label: 'Never'}, {value: 2, label: 'A little'},
      {value: 3, label: 'Some'}, {value: 4, label: 'A lot'}, {value: 5, label: 'Expert'}]) + '</div>' +
    '<div class="q"><p>How often do you play video games?</p>' +
    radioRow('game_frequency', [{value: 1, label: 'Never'}, {value: 2, label: 'Less than monthly'},
      {value: 3, label: 'Monthly'}, {value: 4, label: 'Weekly'}, {value: 5, label: 'Daily'}]) + '</div>',
    ['robot_experience', 'game_frequency'], 60, 'demographics_3', saveQuestions));
  data.demographics_rt_ms = Math.round(performance.now() - t0);
  saveQuestions(data);
  save();
}

// NARS on 3 pages of 5 statements (item order unchanged; the attention check is on page 2).
async function nars() {
  var t0 = performance.now(), data = {};
  var scale = NARS_SCALE.map(function (l, i) { return {value: i + 1, label: l}; });
  for (var p = 0; p < 3; p++) {
    setStep(1, p / 3);
    var items = NARS_ITEMS.slice(p * 5, p * 5 + 5);
    Object.assign(data, await formPage('<div class="eyebrow">Your views · ' + (p + 1) + ' of 3</div>' +
      '<h2>What do you think about robots?</h2><p class="lead tight">How much do you agree?</p>' +
      '<div class="matrix-wrap">' + matrix(items, scale, 'nars') + '</div>',
      items.map(function (i) { return i.id; }), 90, 'nars_' + (p + 1), saveQuestions));
  }
  var pass = parseInt(data.nars_attn, 10) === 5;
  attention.nars = pass;
  data.nars_attention_pass = pass;
  data.nars_rt_ms = Math.round(performance.now() - t0);
  saveQuestions(data);
  save();
}

// The videos have a voice-over: make sure the participant can hear it.
async function soundCheck() {
  setStep(2);
  show('<div class="eyebrow">Sound</div><h2>Can you hear the robot?</h2>' +
    '<p class="lead">The robot talks in the videos. Please turn on your sound or put on headphones.</p>' +
    '<div class="sound-test"><button class="btn" id="play-sound">' + SOUND_ICON.replace('<svg', '<svg width="20" height="20"') +
    ' Play test sound</button><span id="sound-msg" class="hint">Click to hear the robot.</span></div>' +
    '<audio id="sound-check" preload="auto" src="static/audio/sound_check.m4a"></audio>' +
    '<div class="actions"><button class="btn big" id="go"' + (FAST ? '' : ' disabled') + '>I can hear it</button></div>');
  countdown(90, 'sound_check');
  var plays = 0, a = document.getElementById('sound-check');
  document.getElementById('play-sound').onclick = function () {
    plays++;
    a.currentTime = 0;
    var pr = a.play();
    if (pr && pr.catch) pr.catch(function () {});
    document.getElementById('sound-msg').innerHTML = 'Playing… If you hear nothing, turn up the volume and try again.';
    setTimeout(function () {
      document.getElementById('sound-msg').innerHTML = '<span class="ok">Did you hear it?</span> If not, turn up the volume and play it again.';
      document.getElementById('go').disabled = false;
    }, 1500);
  };
  await clicked('#go');
  record({phase: 'sound_check', plays: plays});
}

// "How it works": the training video in six short pieces (scripts/make_instruction_clips.py).
async function howItWorks() {
  var pages = [
    ['Welcome to the warehouse', 'A robot delivers boxes here.', 'instr_1_warehouse.mp4'],
    ['Zones and rooms', 'Each zone has a letter. The robot calls a zone a room.', 'instr_2_dock.mp4'],
    ['A delivery', 'Watch the robot drive to Room E.', 'instr_3_drive.mp4'],
    ['Oh no, a box!', 'Sometimes a box blocks the way. The robot tells you.', 'instr_4_blocked.mp4'],
    ['Around the box', 'The robot goes around the box and finishes the trip.', 'instr_5_finish.mp4'],
    ['Your trust', 'After each delivery, you tell us how much you trust the robot.', 'instr_6_trust.mp4']
  ];
  for (var i = 0; i < pages.length; i++) {
    setStep(3, i / (pages.length + 1));
    await videoPage(pages[i][0], pages[i][1], pages[i][2], 'how_' + (i + 1));
  }
  setStep(3, 6 / 7);
  await textPage('<div class="eyebrow">How it works</div><h2>Your job</h2>' +
    '<ul class="steps big"><li><span class="n">1</span><span>You see which room the box must go to.</span></li>' +
    '<li><span class="n">2</span><span>You watch the robot try to get there.</span></li>' +
    '<li><span class="n">3</span><span>You answer a question about the trip.</span></li>' +
    '<li><span class="n">4</span><span>You say how much you trust the robot.</span></li></ul>', 45, 'your_job');
}

// ------------------------------------------------------------------ the robots
// Instructions for this robot's autonomy level only (participants never read about the other level).
async function meetRobot(block, robot, autonomy) {
  var first = block === 1;
  setStep(STEP_ROBOT + block - 1);
  await textPage('<div class="eyebrow">' + (NBLOCKS === 2 ? 'Robot ' + block : 'Your robot') + '</div>' +
    '<h2>' + (first ? 'Meet ' : 'Now meet ') + robot.name + '</h2>' +
    '<div class="robot-card" style="--rc:' + robot.colour + '">' + robotPic(robot, 'big') + '<div>' +
    '<div class="rname">' + robot.name + '</div>' +
    '<p>' + robot.name + ' is a delivery robot.' + (first ? '' : ' It is a different robot.') + '</p>' +
    '<p style="margin:0">You will watch ' + robot.name + ' make 3 deliveries.</p></div></div>', 45, 'meet_' + block);
  setStep(STEP_ROBOT + block - 1, 0.05);
  await videoPage('How ' + robot.name + ' works', autonomy === 'low'
    ? 'When the way is blocked, ' + robot.name + ' stops and asks you where to go.'
    : 'When the way is blocked, ' + robot.name + ' picks a room by itself. Then it tells you what it did.',
    'instr_mode_' + autonomy + '.mp4', 'mode_' + block);
  setStep(STEP_ROBOT + block - 1, 0.1);
  await textPage('<div class="eyebrow">' + robot.name + '</div><h2>What you will see</h2>' +
    '<figure class="instr-shot"><img src="' + IMG_DIR + 'instr_' + robot.name.toLowerCase() + '_' + autonomy + '.jpg" ' +
    'alt="" onerror="this.parentNode.remove()"><figcaption>' + (autonomy === 'low'
      ? robot.name + ' asks you. Click <b>Confirm</b> to say yes, or pick the other room.'
      : robot.name + ' picks a room by itself. After the trip, click <b>Yes</b> or <b>No</b>: did it go to the right room?') +
    '</figcaption></figure>', 60, 'what_you_see_' + block, 'Start');
}

async function targetCard(robot, target, k) {
  show('<div class="trial-head">' + robotBadge(robot) + '<span class="trial-title">Delivery ' + (k + 1) + ' of 3</span></div>' +
       '<div class="order"><div class="zone-sign"><span class="zl">ZONE</span><span class="zx">' + target + '</span></div>' +
       '<div><div class="eyebrow">New delivery</div><div class="target-card">Deliver to <b>Room ' + target + '</b></div>' +
       '<div class="sub">Room ' + target + ' is Zone ' + target + ' in the warehouse.</div></div></div>' +
       '<div class="actions"><button class="btn big" id="go">Start delivery</button></div>');
  countdown(20, 'target_' + robot.name + '_' + target);
  await clicked('#go');
}

// Low autonomy: the robot's question is in the chat bubble; the answers are buttons in the robot bar.
async function lowDecision(robot, suggested, alternative) {
  setBubble('I suggest going to Room ' + suggested + '. Confirm?');
  document.getElementById('bar-buttons').innerHTML =
    '<button class="btn choice confirm" data-choice="accept" data-room="' + suggested + '">Confirm</button>' +
    '<button class="btn choice other" data-choice="correct" data-room="' + alternative + '">Choose Room ' + alternative + ' instead</button>';
  var t0 = performance.now();
  countdown(20, 'decision_' + robot.name + '_' + suggested);
  var btn = await clicked('.choice');
  var ms = Math.round(performance.now() - t0);
  document.getElementById('bar-buttons').innerHTML = '';
  setBubble('');
  return {response: btn.dataset.choice, chosen_room: btn.dataset.room, decision_rt_ms: ms};
}

// Mid autonomy: after the trip, the question and Yes/No buttons appear in the robot bar.
async function midDetection(robot, page) {
  document.getElementById('bar-buttons').innerHTML = '<span class="bar-q">Did ' + robot.name + ' go to the right room?</span>' +
    '<button class="btn choice" data-answer="yes">Yes</button><button class="btn choice alt" data-answer="no">No</button>';
  var t0 = performance.now();
  countdown(20, page);
  var btn = await clicked('.choice');
  return {detect_response: btn.dataset.answer, decision_rt_ms: Math.round(performance.now() - t0)};
}

async function askTrust(robot, page) {
  var scale = [];
  for (var i = 1; i <= 7; i++) {
    scale.push({value: i, label: i + (i === 1 ? '<br><small>Not at all</small>' : i === 7 ? '<br><small>Completely</small>' : '')});
  }
  show('<div class="trust-head">' + robotPic(robot, 'mid') + '<h2>How much do you trust ' + robot.name + ' right now?</h2></div>' +
       '<div class="q scale7">' + radioRow('trust', scale) + '</div>' +
       '<p id="form-msg" class="err"></p><div class="actions"><button class="btn big" id="trust-next">Next</button></div>');
  var t0 = performance.now();
  countdown(20, page);
  var d = await submitWhenComplete(['trust'], '#trust-next');
  return {trust: parseInt(d.trust, 10), trust_rt_ms: Math.round(performance.now() - t0)};
}

async function runTrial(block, robot, autonomy, t, k) {
  var outcome = PATTERN[k];
  var info = t.clips[outcome];
  var robotRoom = info.room;
  setStep(STEP_ROBOT + block - 1, 0.15 + k * 0.2);
  await targetCard(robot, t.target, k);
  show(playerHTML(robot, robot.name + ' — Deliver to Zone ' + t.target, 'Delivery ' + (k + 1) + ' of 3'));
  var rec = {phase: 'trial', block: block, robot: robot.name, autonomy: autonomy, trial: k + 1,
             target: t.target, robot_room: robotRoom, robot_correct: robotRoom === t.target, outcome: outcome};
  if (autonomy === 'low') {
    rec.clip = info.low;
    rec.watch_ms = await playClip(info.low);
    var alternative = robotRoom === t.target ? t.other : t.target;
    var d = await lowDecision(robot, robotRoom, alternative);
    Object.assign(rec, d);
    rec.accepted = d.response === 'accept';
    rec.accepted_wrong = rec.accepted && !rec.robot_correct;   // over-trust
    rec.final_room = d.chosen_room;
    rec.final_correct = d.chosen_room === t.target;
    rec.branch_clip = t.branch[d.chosen_room];
    rec.branch_watch_ms = await playClip(rec.branch_clip);
  } else {
    rec.clip = info.mid;
    rec.watch_ms = await playClip(info.mid);
    var m = await midDetection(robot, 'detect_' + robot.name + '_' + (k + 1));
    Object.assign(rec, m);
    rec.final_room = robotRoom;
    rec.final_correct = rec.robot_correct;
    rec.detect_correct = (m.detect_response === 'yes') === rec.robot_correct;
    rec.missed_error = !rec.robot_correct && m.detect_response === 'yes';
  }
  Object.assign(rec, await askTrust(robot, 'trust_' + robot.name + '_' + (k + 1)));
  record(rec);
  save();
}

// Questionnaire about the robot: MDMT on 3 pages, then reliance, then the manipulation checks.
async function postBlock(block, robot, autonomy) {
  var t0 = performance.now(), data = {};
  var scale = [];
  for (var i = 0; i <= 7; i++) scale.push({value: i, label: i + (i === 0 ? '<br><small>Not at all</small>' : i === 7 ? '<br><small>Very</small>' : '')});
  scale.push({value: 'NA', label: 'Does not fit'});
  var head = function (n) { return '<div class="eyebrow">About ' + robot.name + ' · ' + n + ' of 5</div>'; };
  // answers kept per page under the same keys as the summary below (b1_mdmt_reliable, b1_reliance, ...)
  var keep = function (d) { saveQuestions(d, 'b' + block + '_'); };
  var keepMdmt = function (d) {
    var o = {};
    Object.keys(d).forEach(function (k) { o[k.indexOf('mdmt_') === 0 ? k : 'mdmt_' + k] = d[k]; });
    keep(o);
  };
  var cuts = [[0, 6], [6, 12], [12, MDMT_ITEMS.length]];
  for (var p = 0; p < cuts.length; p++) {
    setStep(STEP_ROBOT + block - 1, 0.8 + p * 0.04);
    var items = MDMT_ITEMS.slice(cuts[p][0], cuts[p][1]).map(function (it) { return {id: it.id, text: it.text, hint: it.hint}; });
    Object.assign(data, await formPage(head(p + 1) + '<h2>How well does each word describe ' + robot.name + '?</h2>' +
      '<p class="lead tight">0 = not at all, 7 = very much. If a word does not make sense for a robot, pick "Does not fit".</p>' +
      '<div class="matrix-wrap">' + matrix(items, scale, 'mdmt') + '</div>',
      items.map(function (it) { return it.id; }), 120, 'mdmt_' + block + '_' + (p + 1), keepMdmt));
  }
  Object.assign(data, await formPage(head(4) + '<h2>Next time</h2>' +
    '<div class="q"><p><b>Would you let ' + robot.name + ' make the next delivery on its own, with nobody watching?</b></p>' +
    radioRow('reliance', [{value: 'yes', label: 'Yes'}, {value: 'no', label: 'No'}]) + '</div>',
    ['reliance'], 45, 'reliance_' + block, keep));
  Object.assign(data, await formPage(head(5) + '<h2>Two last questions about ' + robot.name + '</h2>' +
    '<div class="q scale7"><p><b>How often was ' + robot.name + ' right?</b></p>' + radioRow('mc_correct', seven('Never', 'Always')) + '</div>' +
    '<div class="q scale7"><p><b>How much did ' + robot.name + ' decide by itself?</b></p>' + radioRow('mc_autonomy', seven('Not at all', 'Completely')) + '</div>',
    ['mc_correct', 'mc_autonomy'], 60, 'checks_' + block, keep));
  var pass = data.mdmt_attn === '7';
  attention['block' + block] = pass;
  var out = {robot: robot.name, autonomy: autonomy, reliance: data.reliance, mc_correct: data.mc_correct,
             mc_autonomy: data.mc_autonomy, attention_pass: pass, rt_ms: Math.round(performance.now() - t0)};
  MDMT_ITEMS.forEach(function (it) { out[it.id.indexOf('mdmt_') === 0 ? it.id : 'mdmt_' + it.id] = data[it.id]; });
  saveQuestions(out, 'b' + block + '_');   // e.g. b1_mdmt_reliable, b1_reliance
  save();
}

async function runBlock(block) {
  var robot = robotOf(block);
  var autonomy = ORDER[block - 1];
  record({phase: 'block_start', block: block, robot: robot.name, autonomy: autonomy});
  await meetRobot(block, robot, autonomy);
  for (var k = 0; k < 3; k++) await runTrial(block, robot, autonomy, robot.trials[k], k);
  await postBlock(block, robot, autonomy);
}

// ------------------------------------------------------------------ the end
// Open-ended question (required, Dr. Roy's checklist).
async function openEnded() {
  setStep(STEP_FINISH);
  var question = NBLOCKS === 2
    ? 'What made you trust or not trust the two robots? Did it matter that one robot asked you and the other decided by itself?'
    : 'What made you trust or not trust ' + robotOf(1).name + '?';
  show('<div class="eyebrow">Almost done</div><h2>In your own words</h2>' +
    '<div class="q" data-item="open_ended"><p><b>' + question + '</b></p>' +
    '<textarea name="open_ended" rows="5" placeholder="Please write at least one sentence."></textarea></div>' + NEXT);
  countdown(180, 'open_ended');
  var t0 = performance.now();
  while (true) {
    var btn = await clicked('#next');
    var txt = document.querySelector('[name="open_ended"]').value.trim();
    if (txt.length >= 10) break;
    btn.disabled = false;
    document.querySelector('[data-item="open_ended"]').classList.add('missing');
    document.getElementById('form-msg').textContent = 'Please write at least one sentence.';
  }
  saveQuestions({open_ended: txt, open_ended_rt_ms: Math.round(performance.now() - t0)});
  save();
}

async function debrief() {
  setStep(STEP_FINISH, 0.5);
  show('<div class="eyebrow">Thank you!</div><h2>About this study</h2>' +
    '<p>We want to learn if a robot\'s <b>mistakes</b>, and how much it <b>decides by itself</b>, change how much people trust it.</p>' +
    '<p>The videos were made on a computer, a bit like a video game. Everything in them was planned ahead of time. ' +
    'Some people saw robots that always went to the right room. Other people saw robots that made mistakes on purpose.</p>' +
    '<p>Anything else you want to tell us? (You can skip this.)</p><textarea name="comments" rows="2"></textarea>' +
    '<div class="actions"><button class="btn big" id="finish">Submit and finish</button></div>');
  countdown(120, 'debrief');
  await clicked('#finish');
  stopCountdown();
  var lb = document.getElementById('leave');
  if (lb) lb.remove();
  var comments = document.querySelector('[name="comments"]').value;
  var allPass = Object.keys(attention).every(function (k) { return attention[k]; });
  saveQuestions({comments: comments, attention_nars: attention.nars, attention_block1: attention.block1,
                 attention_block2: attention.block2, attention_all_pass: allPass, pages_over_time: overTime.join(' ')});
  record({phase: 'finish'});
  var pb = document.getElementById('progress-bar');
  if (pb) pb.style.width = '100%';
  show('<h2>Saving your answers…</h2><p class="lead">Please do not close this window.</p>');
  var tries = 0;
  (function trySave() {
    psiTurk.saveData({
      success: function () { psiTurk.completeHIT(); },
      error: function () {
        if (++tries < 5) { setTimeout(trySave, 1000); return; }
        show('<h2>Your answers are not saved yet</h2><p class="lead">Please check your internet connection, then click ' +
             '“Try again”. Do not close this window.</p><div class="actions"><button class="btn big" id="save-retry">Try again</button></div>');
        document.getElementById('save-retry').onclick = function () { tries = 0; trySave(); };
      }
    });
  })();
}

async function experiment() {
  leaveButton();
  record({phase: 'start', user_agent: navigator.userAgent});
  if (START === 'block1' || (START === 'block2' && NBLOCKS === 2)) {
    await runBlock(START === 'block1' ? 1 : 2);
    show('<h2>Preview finished</h2><p>(debug mode, start=' + START + ')</p>');
    return;
  }
  await demographics();
  await nars();
  await soundCheck();
  await howItWorks();
  for (var b = 1; b <= NBLOCKS; b++) await runBlock(b);
  await openEnded();
  await debrief();
}

window.addEventListener('load', function () { experiment(); });
