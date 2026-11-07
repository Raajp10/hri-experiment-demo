/* Researcher data page (data.html): shows the sessions from the study database the way PsiTurk exports them,
 * trialdata (experimental records) and questiondata (demographics, questionnaires, open-ended answer), and
 * downloads both files in PsiTurk's CSV format for the analysis (supporting_files/analysis, JASP). */
var DemoData = (function () {
  var CELLNAME = {
    between: {'0,0': 'Reliable · low autonomy', '1,0': 'Reliable · mid autonomy',
              '2,0': 'Unreliable · low autonomy', '3,0': 'Unreliable · mid autonomy'},
    within: {'0,0': 'Reliable · low first', '0,1': 'Reliable · mid first',
             '1,0': 'Unreliable · low first', '1,1': 'Unreliable · mid first'}
  };
  var cellName = function (s) { return (CELLNAME[s.design] || CELLNAME.within)[s.condition + ',' + s.counterbalance] || '?'; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); };
  var isTest = function (s) { return /^debug/.test(s.uniqueid); };

  function trialRow(i, t) {
    var ph = t.phase, what = '';
    if (ph === 'trial') {
      var ok = t.robot_correct ? '<span class="ok">robot correct</span>' : '<span class="bad">robot WRONG</span>';
      var ans = t.autonomy === 'low'
        ? (t.response === 'accept' ? 'participant <b>confirmed</b> Room ' + t.chosen_room : 'participant <b>corrected</b> to Room ' + t.chosen_room) +
          (t.accepted_wrong ? ' <span class="bad">(accepted a wrong room = over-trust)</span>' : '')
        : '"Did the robot go to the right room?" → <b>' + t.detect_response + '</b>' +
          (t.missed_error ? ' <span class="bad">(missed the error)</span>' : (t.detect_correct ? ' <span class="ok">(correct judgement)</span>' : ''));
      what = '<b>' + t.robot + '</b> · ' + t.autonomy + ' autonomy · delivery ' + t.trial + ' · target Room ' + t.target +
             ' → robot went/suggested Room ' + t.robot_room + ' ' + ok + '<br>' + ans + ' · decision ' + t.decision_rt_ms +
             ' ms · ' + ('trust' in t ? 'trust <b>' + t.trust + '</b>/7' :
               'situational awareness: ' + (t.sa_correct ? '<span class="ok">correct</span>' : '<span class="bad">wrong</span>')) +
             ' · clip <code>' + esc(t.clip) + '</code>';
    } else if (ph === 'block_start') {
      what = 'Robot ' + t.block + ': <b>' + t.robot + '</b>, ' + t.autonomy + ' autonomy';
    } else if (ph === 'instructions') {
      what = 'instruction page <code>' + esc(t.page) + '</code> (' + Math.round(t.watch_ms / 1000) + ' s video)';
    } else if (ph === 'av_check') {
      what = 'audio/video check passed on attempt ' + t.attempts + ' (video played ' + t.plays + '×)';
    } else if (ph === 'sound_check') {
      what = 'test sound played ' + t.plays + '×';
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
    if (/^(age|gender|gender_self|psiturk_before|robots_before|education|education_other|robot_experience|mobile_robot_experience|game_frequency|demographics_rt_ms|onboarding_version|measures_version)$/.test(k)) return 'Demographics (before the experiment)';
    if (/^av_check/.test(k)) return 'Audio/video check (before the experiment)';
    if (/^nars/.test(k)) return 'Attitudes toward robots, NARS (older sessions only)';
    if (/^b1_/.test(k)) return 'Questionnaire about the robot';
    if (/^b2_/.test(k)) return 'Questionnaire after Robot 2';
    if (/^(design|group|autonomy_order)$/.test(k)) return 'Condition';
    return 'End of study (open-ended answer, attention checks)';
  }

  function render(s, info, trialsEl, questionsEl) {
    if (!s) { info.innerHTML = ''; trialsEl.innerHTML = '<p class="muted">No sessions yet.</p>'; questionsEl.innerHTML = ''; return; }
    var q = s.questiondata || {};
    info.innerHTML = '<div class="info"><span>PsiTurk ID <code>' + esc(s.uniqueid) + '</code> (same in both files)</span>' +
      '<span>condition = <b>' + s.condition + '</b>, counterbalance = <b>' + s.counterbalance + '</b> (' + cellName(s) + ')</span>' +
      '<span>status: <b>' + s.status + '</b></span>' +
      ('attention_all_pass' in q ? '<span>attention checks: <b>' + (q.attention_all_pass ? 'all passed' : 'failed → excluded') + '</b></span>' : '') + '</div>';
    trialsEl.innerHTML = (s.data || []).length ? '<table class="rec"><tr><th>#</th><th>Phase</th><th>What was recorded</th></tr>' +
      s.data.map(function (d, i) { return trialRow(i, d.trialdata); }).join('') + '</table>'
      : '<p class="muted">' + (s.status === 'withdrawn' ? 'This participant left the study; their answers were removed.' : 'No records yet.') + '</p>';
    var keys = Object.keys(q), groups = [], by = {};
    keys.forEach(function (k) { var g = section(k); if (!by[g]) { by[g] = []; groups.push(g); } by[g].push(k); });
    questionsEl.innerHTML = keys.length ? '<table class="rec qd"><tr><th>Question (key)</th><th>Answer</th></tr>' + groups.map(function (g) {
      return '<tr class="qgroup"><td colspan="2">' + g + '</td></tr>' + by[g].map(function (k) {
        return '<tr><td><code>' + esc(k) + '</code></td><td>' + esc(q[k]) + '</td></tr>';
      }).join('');
    }).join('') + '</table>' : '<p class="muted">No answers yet.</p>';
  }

  function csvCell(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: type || 'text/csv'}));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  // PsiTurk formats (no header): trialdata.csv = uniqueid,index,timestamp,json; questiondata.csv = uniqueid,key,value
  function trialdataCSV(list) {
    var lines = [];
    list.forEach(function (s) { (s.data || []).forEach(function (d) { lines.push([s.uniqueid, d.current_trial, d.dateTime, csvCell(JSON.stringify(d.trialdata))].join(',')); }); });
    return lines.join('\n') + '\n';
  }
  function questiondataCSV(list) {
    var lines = [];
    list.forEach(function (s) { var q = s.questiondata || {}; Object.keys(q).forEach(function (k) { lines.push([s.uniqueid, k, csvCell(q[k])].join(',')); }); });
    return lines.join('\n') + '\n';
  }

  return {render: render, cellName: cellName, isTest: isTest, esc: esc, download: download,
          trialdataCSV: trialdataCSV, questiondataCSV: questiondataCSV};
})();
