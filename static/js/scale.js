/* Text size follows the window: --s = 1 up to about 1440 x 820 px, larger on bigger screens (at most 1.6).
 * hri.css sizes text as calc(<size> * var(--s)), so text stays easy to read on any screen. */
(function () {
  function set() {
    var s = Math.min(window.innerWidth / 1440, window.innerHeight / 820);
    s = Math.max(1, Math.min(1.6, s));
    document.documentElement.style.setProperty('--s', s.toFixed(3));
  }
  set();
  window.addEventListener('resize', set);
})();
