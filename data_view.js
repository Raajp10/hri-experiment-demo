/* Demo data viewer, shared by the demo hub (index.html) and the experiment-only demo (exp_index.html).
 * Shows one session the way PsiTurk exports it: trialdata (experimental records) and questiondata
 * (demographics, questionnaires, open-ended answer), and downloads both files in PsiTurk's CSV format.
 * Uses DemoStore (mock_psiturk.js). */
var DemoData = (function () {
  var CELLNAME = {'0,0': 'Reliable · low first', '0,1': 'Reliable · mid first',
                  '1,0': 'Unreliable · low first', '1,1': 'Unreliable · mid first'};
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); };

  function sessions() {
    var s = DemoStore.all();
    return Object.keys(s).map(function (k) { return s[k]; }).filter(function (x) { return !x.simulated; })
      .sort(function (a, b) { return a.begin < b.begin ? -1 : 1; });
  }

  function trialRow(i, t) {
    var ph = t.phase, what = '';
    if (ph === 'trial') {
      var ok = t.robot_correct ? '<span class="ok">robot correct</span>' : '<span class="bad">robot WRONG</span>';
      var ans = t.autonomy === 'low'
        ? (t.response === 'accept' ? 'participant <b>confirmed</b> Room ' + t.chosen_room : 'participant <b>corrected</b> to Room ' + t.chosen_room) +
          (t.accepted_wrong ? ' <span class="bad">(accepted a wrong room = over-trust)</span>' : '')
        : '"Did the robot reach the correct room?" → <b>' + t.detect_response + '</b>' +
          (t.missed_error ? ' <span class="bad">(missed the error)</span>' : (t.detect_correct ? ' <span class="ok">(correct judgement)</span>' : ''));
      what = '<b>' + t.robot + '</b> · ' + t.autonomy + ' autonomy · delivery ' + t.trial + ' · target Room ' + t.target +
             ' → robot went/suggested Room ' + t.robot_room + ' ' + ok + '<br>' + ans + ' · decision ' + t.decision_rt_ms +
             ' ms · trust <b>' + t.trust + '</b>/7 · clip <code>' + esc(t.clip) + '</code>';
    } else if (ph === 'practice') {
      what = 'practice robot Pip: ' + t.response + ' → Room ' + t.chosen_room + ' · question answered ' + t.detect_response + ' · trust ' + t.trust;
    } else if (ph === 'block_start') {
      what = 'Robot ' + t.block + ': <b>' + t.robot + '</b>, ' + t.autonomy + ' autonomy';
    } else if (ph === 'sound_check') {
      what = 'test sound played ' + t.plays + '×';
    } else if (ph === 'training') {
      what = 'training video watched (' + Math.round(t.watch_ms / 1000) + ' s)';
    } else if (ph === 'start') {
      what = 'session started';
    } else if (ph === 'finish') {
      what = 'study finished';
    } else {
      what = '<code>' + esc(JSON.stringify(t).slice(0, 160)) + '</code>';
    }
    return '<tr class="ph-' + ph + '"><td>' + i + '</td><td>' + ph + '</td><td>' + what + '</td></tr>';
  }

  // questiondata keys, grouped for reading
  function section(k) {
    if (/^(age|gender|psiturk_before|robots_before|education|robot_experience|game_frequency|demographics_rt_ms)$/.test(k)) return 'Demographics (before the experiment)';
    if (/^nars/.test(k)) return 'Attitudes toward robots, NARS (before the experiment)';
    if (/^b1_/.test(k)) return 'Questionnaire after Robot 1';
    if (/^b2_/.test(k)) return 'Questionnaire after Robot 2';
    if (/^(group|autonomy_order)$/.test(k)) return 'Condition';
    return 'End of study (open-ended answer, attention checks)';
  }

  function render(s, info, trialsEl, questionsEl) {
    if (!s) { info.innerHTML = ''; trialsEl.innerHTML = '<p class="muted">No session yet: run the experiment first.</p>'; questionsEl.innerHTML = ''; return; }
    var q = s.questiondata || {};
    info.innerHTML = '<div class="info"><span>PsiTurk ID <code>' + esc(s.uniqueid) + '</code> (same in both files)</span>' +
      '<span>condition = <b>' + s.condition + '</b> (' + (s.condition ? 'unreliable' : 'reliable') + ')</span>' +
      '<span>counterbalance = <b>' + s.counterbalance + '</b> (' + (s.counterbalance ? 'mid autonomy first' : 'low autonomy first') + ')</span>' +
      '<span>status: <b>' + s.status + '</b></span>' +
      ('attention_all_pass' in q ? '<span>attention checks: <b>' + (q.attention_all_pass ? 'all passed' : 'failed → excluded') + '</b></span>' : '') + '</div>';
    trialsEl.innerHTML = '<table class="rec"><tr><th>#</th><th>Phase</th><th>What was recorded</th></tr>' +
      s.data.map(function (d, i) { return trialRow(i, d.trialdata); }).join('') + '</table>';
    var keys = Object.keys(q), groups = [], by = {};
    keys.forEach(function (k) { var g = section(k); if (!by[g]) { by[g] = []; groups.push(g); } by[g].push(k); });
    questionsEl.innerHTML = keys.length ? '<table class="rec qd"><tr><th>Question (key)</th><th>Answer</th></tr>' + groups.map(function (g) {
      return '<tr class="qgroup"><td colspan="2">' + g + '</td></tr>' + by[g].map(function (k) {
        return '<tr><td><code>' + esc(k) + '</code></td><td>' + esc(q[k]) + '</td></tr>';
      }).join('');
    }).join('') + '</table>' : '<p class="muted">No answers yet.</p>';
  }

  function csvCell(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv'}));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  // PsiTurk formats (no header): trialdata.csv = uniqueid,index,timestamp,json; questiondata.csv = uniqueid,key,value
  function downloadTrialdata(list) {
    var lines = [];
    list.forEach(function (s) { s.data.forEach(function (d) { lines.push([s.uniqueid, d.current_trial, d.dateTime, csvCell(JSON.stringify(d.trialdata))].join(',')); }); });
    download('trialdata.csv', lines.join('\n') + '\n');
  }
  function downloadQuestiondata(list) {
    var lines = [];
    list.forEach(function (s) { var q = s.questiondata || {}; Object.keys(q).forEach(function (k) { lines.push([s.uniqueid, k, csvCell(q[k])].join(',')); }); });
    download('questiondata.csv', lines.join('\n') + '\n');
  }

  // Wires a session <select>, the tables and the download buttons (ids given by the page).
  function mount(ids) {
    var $ = function (id) { return document.getElementById(id); };
    function draw() {
      var list = sessions(), sel = $(ids.select);
      var want = new URLSearchParams(location.search).get('worker') || sel.value;
      sel.innerHTML = list.length ? list.slice().reverse().map(function (s) {
        return '<option value="' + esc(s.uniqueid) + '"' + (s.uniqueid === want ? ' selected' : '') + '>' +
               esc(s.begin.slice(0, 16).replace('T', ' ')) + ' · ' + CELLNAME[s.condition + ',' + s.counterbalance] + ' · ' + s.status + '</option>';
      }).join('') : '<option>No sessions yet: run the experiment first</option>';
      render(DemoStore.get(sel.value), $(ids.info), $(ids.trials), $(ids.questions));
    }
    $(ids.select).onchange = function () { render(DemoStore.get(this.value), $(ids.info), $(ids.trials), $(ids.questions)); };
    $(ids.dlTrial).onclick = function () { downloadTrialdata(sessions()); };
    $(ids.dlQuestion).onclick = function () { downloadQuestiondata(sessions()); };
    return draw;
  }

  return {mount: mount, sessions: sessions, CELLNAME: CELLNAME};
})();
