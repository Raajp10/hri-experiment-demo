/* Demo-only toolbar on the experiment page: video speed, back to the demo menu, condition shown. */
(function () {
  var SPEEDS = [1, 2, 4, 8];
  var speed = 1;
  try { speed = +(sessionStorage.getItem('demo_speed') || 1); } catch (e) { /* ignore */ }

  // every video the experiment starts plays at the chosen speed (task.js itself is unchanged)
  document.addEventListener('play', function (e) {
    if (e.target.tagName === 'VIDEO') e.target.playbackRate = speed;
  }, true);

  var CELL = {'0,0': 'Reliable · low autonomy first', '0,1': 'Reliable · mid autonomy first',
              '1,0': 'Unreliable · low autonomy first', '1,1': 'Unreliable · mid autonomy first'};

  function build() {
    var bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.innerHTML = '<span class="demo-tag">DEMO</span>' +
      '<span class="demo-cell">' + CELL[window.condition + ',' + window.counterbalance] + '</span>' +
      '<span class="demo-sep"></span><span>Video speed</span>' +
      SPEEDS.map(function (s) { return '<button data-s="' + s + '"' + (s === speed ? ' class="on"' : '') + '>' + s + '×</button>'; }).join('') +
      '<span class="demo-sep"></span><a href="index.html?worker=' + encodeURIComponent(window.uniqueId) + '#data">Data so far</a>' +
      '<a href="index.html#run">Menu</a>';
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-s]');
      if (!b) return;
      speed = +b.dataset.s;
      try { sessionStorage.setItem('demo_speed', speed); } catch (err) { /* ignore */ }
      bar.querySelectorAll('button[data-s]').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('video').forEach(function (v) { v.playbackRate = speed; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
