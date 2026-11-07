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
 * Procedure (revised after Dr. Roy's second review, 2026-11-04): consent (first page) -> about you (2 pages:
 * age/gender/education, then robot and game experience; NARS removed) -> audio/video check (type the word seen
 * and the word heard) -> instructions (9 pages, each marked "Instructions · not a trial", no clock: 5 short
 * pages with a piece of the training video, "what you will do", then per robot: meet the robot, how it works
 * (its own mode only), what you will see) -> per robot: 3 deliveries (target, video + decision; the decision is
 * scored as situational awareness), questionnaire (4 pages: MDMT Capacity Trust on 2, reliance, checks) ->
 * open-ended question -> debrief. (No trust question after each delivery since 2026-11-07.)
 * No practice trial. Every page fits on the screen without scrolling.
 *
 * Data: experimental records go to trialdata via record(); all pre- and post-experiment questions go to
 * questiondata via saveQuestions(), one key per answer. From the first delivery on, every page shows a
 * countdown in the header (soft limit: pages that ran over are listed in questiondata 'pages_over_time');
 * the pages before it (about you, audio/video check, instructions) have no clock.
 */
/* global PsiTurk, uniqueId, adServerLoc, mode, condition, counterbalance, CLIP_SPEC, CLIP_CUES, STUDY_DESIGN,
   MDMT_ITEMS */

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
  clearMarksOnAnswer();
  $c().classList.remove('wide');
  $c().innerHTML = html;
  window.scrollTo(0, 0);
  psiTurk.saveData();
}

// A question marked "missing" in red loses the mark as soon as it is answered.
var marksWired = false;
function clearMarksOnAnswer() {
  if (marksWired) return;
  marksWired = true;
  ['input', 'change'].forEach(function (ev) {
    $c().addEventListener(ev, function (e) {
      if (e.target.dataset && e.target.dataset.check === 'age') return;   // the age box has its own check
      for (var el = e.target; el && el !== $c(); el = el.parentElement) {
        if (el.dataset && el.dataset.item) el.classList.remove('missing');
      }
    });
  });
}

// ------------------------------------------------------------------ full screen
// The study runs in the browser's full screen: it switches on with the participant's first click on a button
// (browsers only allow it after a click), and the "Full screen" button in the header switches it on or off.
function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
function enterFullscreen() {
  var el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!f || fsElement()) return;
  try { var p = f.call(el); if (p && p.catch) p.catch(function () {}); } catch (e) { /* not allowed: stay in the window */ }
}
function exitFullscreen() {
  var f = document.exitFullscreen || document.webkitExitFullscreen;
  if (f && fsElement()) { try { var p = f.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ } }
}
function fullscreenButton() {
  var head = document.querySelector('.app-head .inner');
  var can = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  if (!head || !can || document.getElementById('fs')) return;
  var b = document.createElement('button');
  b.id = 'fs';
  b.type = 'button';
  b.className = 'leave fs';
  var label = function () { b.textContent = fsElement() ? 'Exit full screen' : 'Full screen'; };
  b.onclick = function () { if (fsElement()) exitFullscreen(); else enterFullscreen(); };
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, label); });
  label();
  head.appendChild(b);
  // first click on any button in the study turns full screen on
  document.addEventListener('click', function first(e) {
    if (!e.target.closest || !e.target.closest('#container-exp .btn')) return;
    document.removeEventListener('click', first, true);
    enterFullscreen();
  }, true);
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
  ['leave-box', 'leave', 'fs', 'timer'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
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

// ------------------------------------------------------------------ progress (header)
// The label names the part of the study and the page within that part, e.g. "Instructions — Page 2 of 10" or
// "Experiment — Delivery 1 of 3" ("Step 4 of 6" was unclear, Dr. Roy's review 2026-11-04). The thin bar under
// the header shows progress through the whole study and never moves back.
var INSTR_GENERAL = 6;                          // 5 video pages + "What you will do"
var INSTR_ROBOT = 3;                            // meet the robot, how it works, what you will see
var INSTR_TOTAL = INSTR_GENERAL + INSTR_ROBOT;  // instruction pages before the first delivery
// share of the bar for each part of the study
var PART = {about: [0, 0.06], check: [0.06, 0.1], instr: [0.1, 0.3], robots: [0.3, 0.92], finish: [0.92, 1]};
var barAt = 0;
function partAt(part, f) { var p = PART[part]; return p[0] + (p[1] - p[0]) * Math.min(1, f || 0); }
function blockAt(block, f) { return partAt('robots', (block - 1 + f) / NBLOCKS); }
function setProgress(label, frac) {
  var bar = document.getElementById('progress-bar'), lab = document.getElementById('step-label');
  barAt = Math.max(barAt, frac);
  if (bar) bar.style.width = Math.round(100 * barAt) + '%';
  if (lab) lab.textContent = label;
}
function pageOf(part, n, total) { return part + ' — Page ' + n + ' of ' + total; }

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
// The clock is shown only during the experiment (deliveries) and the questionnaires after it. Pages before the
// first delivery (about you, audio/video check, instructions) have no clock, so they do not look like trials.
var clockOn = false;
function hideClock() {
  stopCountdown();
  var el = document.getElementById('timer');
  if (el) el.remove();
}
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
  if (!clockOn) return;
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
      if (!v.isConnected) return;   // the page has moved on; a late event from the old video does nothing
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

// Age: whole years from 18 to 80, digits only. Returns an error message, or null when the age is valid.
var AGE_MIN = 18, AGE_MAX = 80;
function ageProblem(s) {
  s = String(s || '').trim();
  if (s === '') return 'Please enter your age.';
  if (!/^\d+$/.test(s)) return 'Please enter your age as a whole number, using digits only (for example 25).';
  var n = Number(s);
  if (n < AGE_MIN || n > AGE_MAX) return 'Please enter an age between ' + AGE_MIN + ' and ' + AGE_MAX + '.';
  return null;
}

// Collects radio/select/number/text inputs; returns null and highlights missing ones if incomplete.
function collect(names) {
  var out = {}, missing = [];
  names.forEach(function (n) {
    var el = document.querySelector('[name="' + n + '"]');
    var val = null;
    if (el && el.dataset.check === 'age') {
      var problem = ageProblem(el.value);
      val = problem ? null : String(Number(el.value.trim()));
      var m = document.getElementById('age-msg');
      if (m) m.textContent = problem || '';
    } else if (el && el.type === 'number') {
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
    msg.textContent = 'Please answer the questions marked in red.';
  }
}

var NEXT = '<p id="form-msg" class="err"></p><div class="actions"><button class="btn big" id="next">Next</button></div>';

// Shows the page's countdown, or no clock at all when `seconds` is null (pages before the experiment).
function pageClock(seconds, page) { if (seconds) countdown(seconds, page); else hideClock(); }

// One form page: shows it, starts the countdown, waits for complete answers. `keep(answers)` puts the page's
// answers into questiondata straight away (saved with the next page), so no answered page is lost.
async function formPage(html, names, seconds, page, keep) {
  show(html + NEXT);
  pageClock(seconds, page);
  var answers = await submitWhenComplete(names, '#next');
  if (keep) keep(answers);
  return answers;
}

// A page with only text (and pictures) and a button. `wide` uses the wide page (instruction pages with pictures).
async function textPage(html, seconds, page, label, wide) {
  show(html + '<div class="actions"><button class="btn big" id="go">' + (label || 'Next') + '</button></div>');
  if (wide) $c().classList.add('wide');
  pageClock(seconds, page);
  await clicked('#go');
}

// Top of every instruction page: says plainly that this is not a trial.
function instrBanner(n, total) {
  return '<div class="instr-banner"><span class="tag">Instructions · not a trial</span>' +
    '<span>Page ' + n + ' of ' + total + '. Read and watch. Nothing on this page is scored.</span></div>';
}

// An instruction page (no clock): the heading and short points on the left, a large video on the right (stacked
// on narrow windows). `points` is a list of short sentences. While the video plays, the robot bar says that "Next"
// comes at the end; then "Watch again" and "Next" appear there.
function pointsHTML(points) {
  return '<ul class="instr-points">' + points.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
}
async function videoPage(n, total, title, points, clip, page, robot) {
  hideClock();
  show(instrBanner(n, total) + '<div class="instr-grid"><div class="instr-text"><h2>' + title + '</h2>' +
    pointsHTML(points) + '</div><div class="instr-media">' + playerHTML(robot || EXAMPLE, null, '', 'instr') +
    '</div></div>');
  $c().classList.add('wide');
  var bb = document.getElementById('bar-buttons');
  bb.innerHTML = '<span class="bar-wait">“Next” appears when the video ends</span>';
  var ms = await playClip(clip), replays = 0;
  while (true) {
    bb.innerHTML = '<button class="btn alt" id="again">Watch again</button><button class="btn" id="next">Next</button>';
    var b = await clicked('#again, #next');
    if (b.id === 'next') break;
    replays++;
    bb.innerHTML = '<span class="bar-wait">“Next” appears when the video ends</span>';
    await playClip(clip);
  }
  record({phase: 'instructions', page: page, clip: clip, watch_ms: ms, replays: replays});
}

// ------------------------------------------------------------------ before the experiment
// Version of the pages before the experiment, saved with the answers (questiondata 'onboarding_version').
// v3 (Dr. Roy's review, 2026-11-04): NARS and "robots_before" removed; robot_experience now asks about robots of
// any kind on an experience scale (was: "How much have you used or talked to robots?", Never ... Expert);
// mobile_robot_experience added; gender_self / education_other added; audio/video check replaces the sound check.
var ONBOARDING_VERSION = 'v3-2026-11-04';
// Measures version (questiondata 'measures_version'). v4 (Dr. Roy, 2026-11-07): no trust question after each delivery;
// the answer after each delivery is scored as situational awareness (trialdata sa_correct, questiondata b1_sa_*);
// trust = MDMT Capacity Trust after the 3 deliveries (b1_capacity_trust). Earlier sessions: per-delivery trust + full MDMT.
var MEASURES_VERSION = 'v4-2026-11-07';

// About you, page 1: one column, every question with its label above the answer box. The age is checked while
// it is typed; "Prefer to self-describe" and "Other" open a text box.
async function aboutYouPage1() {
  setProgress(pageOf('About you', 1, 2), partAt('about', 0));
  show('<div class="eyebrow">About you</div><h2>A few questions about you</h2>' +
    '<p class="hint fs-note">The study switches to full screen when you click “Next”. You can leave full screen at any ' +
    'time with the button at the top or the Esc key.</p>' +
    '<div class="fields">' +
    '<div class="q field" data-item="age"><label for="f-age">How old are you?</label>' +
    '<input type="text" id="f-age" name="age" data-check="age" inputmode="numeric" autocomplete="off" maxlength="3" ' +
    'placeholder="Age in years (18–80)" aria-describedby="age-msg"><p class="field-msg" id="age-msg" aria-live="polite"></p></div>' +
    '<div class="q field" data-item="gender"><label for="f-gender">What is your gender?</label>' +
    '<select id="f-gender" name="gender"><option value="">— select —</option>' +
    '<option>Woman</option><option>Man</option><option>Non-binary</option><option>Prefer to self-describe</option>' +
    '<option>Prefer not to say</option></select>' +
    '<div class="sub-field" id="gender-self" hidden><input type="text" id="f-gender-self" name="gender_self" ' +
    'maxlength="60" autocomplete="off" placeholder="Please describe (optional)" aria-label="Please describe your gender (optional)"></div></div>' +
    '<div class="q field" data-item="education"><label for="f-edu">What is the highest level of education you have completed?</label>' +
    '<select id="f-edu" name="education"><option value="">— select —</option>' +
    '<option>High school or less</option><option>Some college</option><option>Bachelor\'s degree</option>' +
    '<option>Master\'s degree</option><option>Doctorate</option><option>Other</option></select>' +
    '<div class="sub-field" id="edu-other" data-item="education_other" hidden><input type="text" id="f-edu-other" ' +
    'name="education_other" maxlength="60" autocomplete="off" placeholder="Please write your highest education" ' +
    'aria-label="Please write your highest education"></div></div>' +
    '</div>' + NEXT);
  hideClock();

  var age = document.getElementById('f-age'), ageMsg = document.getElementById('age-msg');
  var ageRow = document.querySelector('[data-item="age"]'), next = document.getElementById('next');
  // Flags an impossible age right away. While the first digit is being typed it waits for the second one;
  // when the participant leaves the box, any invalid age is flagged. "Next" stays off while the age is wrong.
  function checkAge(final) {
    var v = age.value.trim();
    var problem = v === '' ? null : ageProblem(v);
    if (problem && !final && /^\d$/.test(v)) problem = null;
    ageMsg.textContent = problem || '';
    ageRow.classList.toggle('missing', !!problem);
    age.setAttribute('aria-invalid', problem ? 'true' : 'false');
    next.disabled = !!problem;
  }
  age.addEventListener('input', function () { checkAge(false); });
  age.addEventListener('blur', function () { checkAge(true); });
  var gender = document.getElementById('f-gender'), edu = document.getElementById('f-edu');
  gender.addEventListener('change', function () {
    document.getElementById('gender-self').hidden = gender.value !== 'Prefer to self-describe';
  });
  edu.addEventListener('change', function () {
    document.getElementById('edu-other').hidden = edu.value !== 'Other';
  });

  var msg = document.getElementById('form-msg');
  while (true) {
    var btn = await clicked('#next');
    var names = ['age', 'gender', 'education'].concat(edu.value === 'Other' ? ['education_other'] : []);
    var d = collect(names);
    if (d) {
      var self = document.getElementById('f-gender-self').value.trim();
      d.gender_self = d.gender === 'Prefer to self-describe' ? self : '';
      d.education_other = d.education === 'Other' ? d.education_other : '';
      return d;
    }
    btn.disabled = !!ageProblem(age.value) && age.value.trim() !== '';
    msg.textContent = 'Please answer the questions marked in red.';
  }
}

var EXPERIENCE_SCALE = [{value: 1, label: 'No experience'}, {value: 2, label: 'Slight experience'},
  {value: 3, label: 'Moderate experience'}, {value: 4, label: 'Considerable experience'},
  {value: 5, label: 'Extensive experience'}];

async function demographics() {
  var t0 = performance.now(), data = {onboarding_version: ONBOARDING_VERSION, measures_version: MEASURES_VERSION};
  Object.assign(data, await aboutYouPage1());
  saveQuestions(data);
  setProgress(pageOf('About you', 2, 2), partAt('about', 0.5));
  // General robot experience (the study robot is a delivery robot, not a social robot), rated on an experience
  // scale so that people who have never used a robot can answer too.
  Object.assign(data, await formPage('<div class="eyebrow">About you</div><h2>Your experience with robots and games</h2>' +
    '<div class="q"><p><b>How much experience do you have with…</b></p><div class="matrix-wrap">' +
    matrix([{id: 'robot_experience', text: 'robots of any kind?',
             hint: 'for example robot vacuum cleaners, delivery robots, robot arms or robot toys'},
            {id: 'mobile_robot_experience', text: 'robots that move around by themselves?',
             hint: 'for example delivery robots or warehouse robots'}], EXPERIENCE_SCALE, 'experience') + '</div></div>' +
    '<div class="q inline" data-item="game_frequency"><p><b>How often do you play video games?</b></p>' +
    radioRow('game_frequency', [{value: 1, label: 'Never'}, {value: 2, label: 'Less than monthly'},
      {value: 3, label: 'Monthly'}, {value: 4, label: 'Weekly'}, {value: 5, label: 'Daily'}]) + '</div>' +
    '<div class="q inline" data-item="psiturk_before"><p><b>Have you taken part in a PsiTurk study before?</b></p>' +
    radioRow('psiturk_before', [{value: 'yes', label: 'Yes'}, {value: 'no', label: 'No'}]) + '</div>',
    ['robot_experience', 'mobile_robot_experience', 'game_frequency', 'psiturk_before'], null, 'demographics_2', saveQuestions));
  data.demographics_rt_ms = Math.round(performance.now() - t0);
  saveQuestions(data);
  save();
}

// Audio/video check (Dr. Roy's review, 2026-11-04). A short clip SHOWS one word and a voice SAYS a different word;
// the participant types both, which shows they can see the videos and hear their sound. After a wrong answer a
// new clip with new words is used. The clips are made by scripts/make_av_check.py (keep the words the same).
// Nothing about the robot or the study groups is shown; no camera or microphone is used.
var AV_CHECKS = [{clip: 'av_check_1.mp4', seen: 'apple', heard: 'garden'},
                 {clip: 'av_check_2.mp4', seen: 'pencil', heard: 'river'}];
function wordOf(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

async function avCheck() {
  setProgress('Audio & video check', partAt('check', 0));
  hideClock();
  show('<div class="eyebrow">Audio &amp; video check</div><h2>Can you see and hear the videos?</h2>' +
    '<p class="lead tight">The study has videos with sound. Please turn on your sound or put on headphones, then click ' +
    '<b>Play</b>. The video <b>shows</b> one word, and a voice <b>says</b> a different word. Type both words.</p>' +
    '<div class="av-wrap"><div class="av-screen"><video id="av" playsinline preload="auto"' + (FAST ? ' muted' : '') + '></video>' +
    '<button type="button" class="btn big av-play" id="av-play">▶ Play</button></div>' +
    '<div class="av-form">' +
    '<div class="q field" data-item="av_seen"><label for="av-seen">The word you <b>saw</b> in the video</label>' +
    '<input type="text" id="av-seen" name="av_seen" maxlength="30" autocomplete="off" disabled></div>' +
    '<div class="q field" data-item="av_heard"><label for="av-heard">The word you <b>heard</b></label>' +
    '<input type="text" id="av-heard" name="av_heard" maxlength="30" autocomplete="off" disabled></div>' +
    '<p class="hint" id="av-hint">Play the video first. The boxes open when it ends.</p>' +
    '<p id="form-msg" class="err" aria-live="polite"></p>' +
    '<div class="actions"><button type="button" class="btn big" id="av-go" disabled>Check my answers</button></div>' +
    '</div></div>');

  var v = document.getElementById('av'), play = document.getElementById('av-play');
  var seen = document.getElementById('av-seen'), heard = document.getElementById('av-heard');
  var go = document.getElementById('av-go'), msg = document.getElementById('form-msg');
  var t0 = performance.now(), attempt = 0, plays = 0, log = [];
  var item = AV_CHECKS[0];
  function load(k) {
    item = AV_CHECKS[k % AV_CHECKS.length];
    v.src = VIDEO_DIR + item.clip;
    play.textContent = '▶ Play';
    play.hidden = false;
    seen.value = heard.value = '';
    seen.disabled = heard.disabled = go.disabled = true;
    document.getElementById('av-hint').textContent = 'Play the video first. The boxes open when it ends.';
  }
  play.onclick = function () {
    plays++;
    play.hidden = true;
    v.currentTime = 0;
    if (FAST) v.playbackRate = 16;
    var p = v.play();
    if (p && p.catch) p.catch(function () { play.hidden = false; });
  };
  v.addEventListener('ended', function () {
    play.textContent = '↻ Play again';
    play.hidden = false;
    seen.disabled = heard.disabled = go.disabled = false;
    document.getElementById('av-hint').textContent = 'You can play the video again if you need to.';
    if (!seen.value) seen.focus();
  });
  v.addEventListener('error', function () {
    msg.textContent = 'The video did not load. Please check your internet connection and reload the page.';
    record({phase: 'error', clip: item.clip, error: 'video_load_failed'});
  });
  load(0);

  while (true) {
    await clicked('#av-go');
    var s = wordOf(seen.value), h = wordOf(heard.value);
    if (!s || !h) {
      go.disabled = false;
      document.querySelector('[data-item="av_seen"]').classList.toggle('missing', !s);
      document.querySelector('[data-item="av_heard"]').classList.toggle('missing', !h);
      msg.textContent = 'Please type both words.';
      continue;
    }
    attempt++;
    var seenOk = s === item.seen, heardOk = h === item.heard;
    log.push({attempt: attempt, clip: item.clip, seen_ok: seenOk, heard_ok: heardOk});
    if (seenOk && heardOk) break;
    document.querySelectorAll('.av-form .q').forEach(function (q) { q.classList.remove('missing'); });
    msg.textContent = (!seenOk && !heardOk ? 'Neither word is right.'
      : !seenOk ? 'The word you saw is not right. Please make sure you can see the video.'
      : 'The word you heard is not right. Please check that your sound is on and turned up.') +
      ' Here is a new video with new words: click Play and try again.' +
      (attempt >= 3 ? ' If you still cannot see or hear the video, you cannot do this study; you can click “Leave study” at the top.' : '');
    load(attempt);
  }
  v.pause();
  msg.textContent = '';
  record({phase: 'av_check', passed: true, attempts: attempt, plays: plays, tries: log,
          rt_ms: Math.round(performance.now() - t0)});
  saveQuestions({av_check_attempts: attempt, av_check_plays: plays});
  save();
}

// Instructions, part 1: the training video in six short pieces (scripts/make_instruction_clips.py), then
// "What you will do". Written text says what happens and what the participant does; no clock on these pages.
async function howItWorks() {
  var pages = [
    ['Welcome to the warehouse', ['This is a big warehouse.', 'A delivery robot carries boxes to different places in it.',
      'Just watch. You do not need to do anything on this page.'], 'instr_1_warehouse.mp4'],
    ['Zones and rooms', ['The warehouse has six zones, A to F.',
      'The robot calls a zone a <b>room</b>: “Room C” means Zone C.', 'The robot starts at its dock.'], 'instr_2_dock.mp4'],
    ['A delivery', ['Here the robot drives to Room E.', 'In each delivery, you first see which room the box must go to.',
      'Then you watch the robot drive there.'], 'instr_3_drive.mp4'],
    ['Oh no, a box!', ['Sometimes a box blocks the way.',
      'The robot stops and tells you in the <b>speech bubble</b> under the video.'], 'instr_4_blocked.mp4'],
    ['Around the box', ['The robot goes around the box another way.', 'Then it finishes the trip.'], 'instr_5_finish.mp4']
  ];   // (the "Your trust" page was removed with the trust question after each delivery, 2026-11-07)
  for (var i = 0; i < pages.length; i++) {
    setProgress(pageOf('Instructions', i + 1, INSTR_TOTAL), partAt('instr', i / INSTR_TOTAL));
    await videoPage(i + 1, INSTR_TOTAL, pages[i][0], pages[i][1], pages[i][2], 'how_' + (i + 1));
  }
  setProgress(pageOf('Instructions', INSTR_GENERAL, INSTR_TOTAL), partAt('instr', (INSTR_GENERAL - 1) / INSTR_TOTAL));
  await textPage(instrBanner(INSTR_GENERAL, INSTR_TOTAL) + '<h2>What you will do in each delivery</h2>' +
    '<ul class="steps big"><li><span class="n">1</span><span>A card shows which room the box must go to. ' +
    '<b>Remember this room.</b></span></li>' +
    '<li><span class="n">2</span><span>You watch a video of the robot driving. The robot talks to you in the speech ' +
    'bubble under the video.</span></li>' +
    '<li><span class="n">3</span><span>You answer a question about the trip, using the buttons under the video. ' +
    'The next pages show this question for your robot.</span></li>' +
    '<li><span class="n">4</span><span>After all 3 deliveries, you answer a few questions about the robot.</span></li></ul>' +
    '<p class="hint">During the deliveries, a clock at the top of the screen shows how long you have to answer. ' +
    'Please answer before it runs out.</p>', null, 'your_job');
}

// ------------------------------------------------------------------ the robots
// "How <robot> works" clip. The mode clips come from the training video (plain white example robot); for Nova there
// is a copy with Nova's blue top (scripts/make_nova_mode_clips.py), so the robot looks like Nova in the deliveries.
// It uses the cues of the original clip, and the robot's bubble shows the same message as in the deliveries.
function modeClip(robot, autonomy) {
  var base = 'instr_mode_' + autonomy + '.mp4';
  if (robot.name !== 'Nova' || typeof CLIP_CUES === 'undefined' || !CLIP_CUES[base]) return base;
  var name = 'instr_mode_' + autonomy + '_nova.mp4';
  if (!CLIP_CUES[name]) {
    CLIP_CUES[name] = JSON.parse(JSON.stringify(CLIP_CUES[base]));
    CLIP_CUES[name].cues.forEach(function (c) { c.message = 'Path blocked, need to reroute.'; });
  }
  return name;
}

// Instructions for this robot's autonomy level only (participants never read about the other level).
// For the first robot these are pages 7-9 of the instructions; a second robot (within design) gets its own 3 pages.
async function meetRobot(block, robot, autonomy) {
  var first = block === 1;
  var base = first ? INSTR_GENERAL : 0, total = first ? INSTR_TOTAL : INSTR_ROBOT;
  var part = first ? 'Instructions' : 'Instructions for Robot 2';
  var at = function (i) { return first ? partAt('instr', (base + i) / total) : blockAt(block, 0.03 * i); };
  clockOn = false;
  hideClock();
  setProgress(pageOf(part, base + 1, total), at(0));
  await textPage(instrBanner(base + 1, total) +
    '<h2>' + (first ? 'Meet ' : 'Now meet ') + robot.name + '</h2>' +
    '<div class="robot-card" style="--rc:' + robot.colour + '">' + robotPic(robot, 'big') + '<div>' +
    '<div class="rname">' + robot.name + '</div>' +
    '<p>' + robot.name + ' is the delivery robot you will work with.' + (first ? '' : ' It is a different robot.') + '</p>' +
    '<p style="margin:0">You will watch ' + robot.name + ' make 3 deliveries.</p></div></div>', null, 'meet_' + block);
  setProgress(pageOf(part, base + 2, total), at(1));
  var R = robot.name;
  await videoPage(base + 2, total, 'How ' + R + ' works', autonomy === 'low'
    ? ['In this video, a box blocks ' + R + '’s way, so ' + R + ' stops.', R + ' then suggests a room and asks you.',
       '<b>You decide</b>: accept the suggestion, or send ' + R + ' to the other room.']
    : ['In this video, a box blocks ' + R + '’s way, so ' + R + ' stops.',
       R + ' then picks a room <b>by itself</b> and drives there.',
       'After the trip, you say whether ' + R + ' went to the right room.'],
    modeClip(robot, autonomy), 'mode_' + block, robot);
  setProgress(pageOf(part, base + 3, total), at(2));
  var steps = autonomy === 'low'
    ? ['Look at the delivery card and remember the room.',
       'Watch ' + robot.name + ' drive. When the way is blocked, ' + robot.name + ' suggests a room and two buttons appear under the video.',
       'Click <b>Confirm</b> to accept the suggestion, or <b>Choose Room … instead</b> to send ' + robot.name +
       ' to the other room. ' + robot.name + ' then drives to the room you picked.',
       'After all 3 deliveries, you answer a few questions about ' + robot.name + '.']
    : ['Look at the delivery card and remember the room.',
       'Watch ' + robot.name + ' drive. When the way is blocked, ' + robot.name + ' picks a room by itself and finishes the trip.',
       'After the trip, answer “Did ' + robot.name + ' go to the right room?” with <b>Yes</b> or <b>No</b>.',
       'After all 3 deliveries, you answer a few questions about ' + robot.name + '.'];
  await textPage(instrBanner(base + 3, total) + '<h2>What you will see and do</h2>' +
    '<div class="instr-split"><figure class="instr-shot"><img src="' + IMG_DIR + 'instr_' + robot.name.toLowerCase() + '_' +
    autonomy + '.jpg" alt="Example of the delivery screen" onerror="this.parentNode.remove()"></figure>' +
    '<ol class="steps">' + steps.map(function (s, i) {
      return '<li><span class="n">' + (i + 1) + '</span><span>' + s + '</span></li>';
    }).join('') + '</ol></div>' +
    '<div class="callout"><b>End of the instructions.</b> Click “Start the experiment” to begin the ' +
    (first ? '' : 'next ') + '3 real deliveries (there is no practice round).</div>',
    null, 'what_you_see_' + block, 'Start the experiment', true);
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

async function runTrial(block, robot, autonomy, t, k) {
  var outcome = PATTERN[k];
  var info = t.clips[outcome];
  var robotRoom = info.room;
  // From here on the clock is shown (experiment pages keep their response windows).
  clockOn = true;
  setProgress('Experiment — ' + (NBLOCKS === 2 ? 'Robot ' + block + ', ' : '') + 'Delivery ' + (k + 1) + ' of 3',
              blockAt(block, 0.1 + k * 0.22));
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
  // Situational awareness (Dr. Roy, 2026-11-07): the answer after each delivery shows whether the participant
  // followed what happened. Correct = they judged Nova's room right: low autonomy, they confirmed a right room or
  // changed a wrong one (same as final_correct); mid autonomy, their Yes/No matched whether Nova was right.
  rec.sa_correct = autonomy === 'low' ? rec.final_correct : rec.detect_correct;
  record(rec);
  save();
  return rec;
}

// Questionnaire about the robot, after all 3 deliveries: MDMT Capacity Trust (Reliable + Capable items, with the
// attention check) on 2 pages, then reliance, then the manipulation checks (Dr. Roy, 2026-11-07: trust is measured
// here only; no trust question after each delivery).
async function postBlock(block, robot, autonomy) {
  var t0 = performance.now(), data = {};
  var scale = [];
  for (var i = 0; i <= 7; i++) scale.push({value: i, label: i + (i === 0 ? '<br><small>Not at all</small>' : i === 7 ? '<br><small>Very</small>' : '')});
  scale.push({value: 'NA', label: 'Does not fit'});
  var head = function (n) { return '<div class="eyebrow">About ' + robot.name + ' · ' + n + ' of 4</div>'; };
  var qLabel = function (n) { return pageOf(NBLOCKS === 2 ? 'Questionnaire about Robot ' + block : 'Questionnaire', n, 4); };
  // answers kept per page under the same keys as the summary below (b1_mdmt_reliable, b1_reliance, ...)
  var keep = function (d) { saveQuestions(d, 'b' + block + '_'); };
  var keepMdmt = function (d) {
    var o = {};
    Object.keys(d).forEach(function (k) { o[k.indexOf('mdmt_') === 0 ? k : 'mdmt_' + k] = d[k]; });
    keep(o);
  };
  var cuts = [[0, 5], [5, MDMT_CAPACITY.length]];
  for (var p = 0; p < cuts.length; p++) {
    setProgress(qLabel(p + 1), blockAt(block, 0.76 + p * 0.06));
    var items = MDMT_CAPACITY.slice(cuts[p][0], cuts[p][1]).map(function (it) { return {id: it.id, text: it.text, hint: it.hint}; });
    Object.assign(data, await formPage(head(p + 1) + '<h2>How well does each word describe ' + robot.name + '?</h2>' +
      '<p class="lead tight">0 = not at all, 7 = very much. If a word does not make sense for a robot, pick "Does not fit".</p>' +
      '<div class="matrix-wrap">' + matrix(items, scale, 'mdmt') + '</div>',
      items.map(function (it) { return it.id; }), 120, 'mdmt_' + block + '_' + (p + 1), keepMdmt));
  }
  setProgress(qLabel(3), blockAt(block, 0.9));
  Object.assign(data, await formPage(head(3) + '<h2>Next time</h2>' +
    '<div class="q"><p><b>Would you let ' + robot.name + ' make the next delivery on its own, with nobody watching?</b></p>' +
    radioRow('reliance', [{value: 'yes', label: 'Yes'}, {value: 'no', label: 'No'}]) + '</div>',
    ['reliance'], 45, 'reliance_' + block, keep));
  setProgress(qLabel(4), blockAt(block, 0.96));
  Object.assign(data, await formPage(head(4) + '<h2>Two last questions about ' + robot.name + '</h2>' +
    '<div class="q scale7"><p><b>How often was ' + robot.name + ' right?</b></p>' + radioRow('mc_correct', seven('Never', 'Always')) + '</div>' +
    '<div class="q scale7"><p><b>How much did ' + robot.name + ' decide by itself?</b></p>' + radioRow('mc_autonomy', seven('Not at all', 'Completely')) + '</div>',
    ['mc_correct', 'mc_autonomy'], 60, 'checks_' + block, keep));
  var pass = data.mdmt_attn === '7';
  attention['block' + block] = pass;
  var out = {robot: robot.name, autonomy: autonomy, reliance: data.reliance, mc_correct: data.mc_correct,
             mc_autonomy: data.mc_autonomy, attention_pass: pass, rt_ms: Math.round(performance.now() - t0)};
  MDMT_CAPACITY.forEach(function (it) { out[it.id.indexOf('mdmt_') === 0 ? it.id : 'mdmt_' + it.id] = data[it.id]; });
  // Capacity Trust score: mean of the 8 items (0-7), "Does not fit" left out (MDMT scoring); also its two parts
  var mean = function (sub) {
    var v = MDMT_CAPACITY.filter(function (it) { return !it.attention && (!sub || it.sub === sub); })
      .map(function (it) { return data[it.id]; }).filter(function (x) { return x !== 'NA'; }).map(Number);
    return v.length ? Math.round(1000 * v.reduce(function (a, b) { return a + b; }, 0) / v.length) / 1000 : null;
  };
  out.capacity_trust = mean();
  out.capacity_reliable = mean('Reliable');
  out.capacity_capable = mean('Capable');
  out.capacity_na_count = MDMT_CAPACITY.filter(function (it) { return !it.attention && data[it.id] === 'NA'; }).length;
  saveQuestions(out, 'b' + block + '_');   // e.g. b1_mdmt_reliable, b1_capacity_trust, b1_reliance
  save();
}

async function runBlock(block) {
  var robot = robotOf(block);
  var autonomy = ORDER[block - 1];
  record({phase: 'block_start', block: block, robot: robot.name, autonomy: autonomy});
  await meetRobot(block, robot, autonomy);
  var sa = 0;
  for (var k = 0; k < 3; k++) if ((await runTrial(block, robot, autonomy, robot.trials[k], k)).sa_correct) sa++;
  // situational awareness over the 3 deliveries (number and share of deliveries judged correctly)
  saveQuestions({sa_correct: sa, sa_accuracy: Math.round(1000 * sa / 3) / 1000}, 'b' + block + '_');
  await postBlock(block, robot, autonomy);
}

// ------------------------------------------------------------------ the end
// Open-ended question (required, Dr. Roy's checklist).
async function openEnded() {
  setProgress(pageOf('Finish', 1, 2), partAt('finish', 0));
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
  setProgress(pageOf('Finish', 2, 2), partAt('finish', 0.5));
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
  saveQuestions({comments: comments, attention_block1: attention.block1,
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
  fullscreenButton();
  leaveButton();
  record({phase: 'start', user_agent: navigator.userAgent});
  if (START === 'block1' || (START === 'block2' && NBLOCKS === 2)) {
    await runBlock(START === 'block1' ? 1 : 2);
    show('<h2>Preview finished</h2><p>(debug mode, start=' + START + ')</p>');
    return;
  }
  await demographics();
  await avCheck();
  await howItWorks();
  for (var b = 1; b <= NBLOCKS; b++) await runBlock(b);
  await openEnded();
  await debrief();
}

window.addEventListener('load', function () { experiment(); });
