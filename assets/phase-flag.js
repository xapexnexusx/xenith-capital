/* Xenith Capital: choose the live one-screen mode before first paint.
   Only on a plain visit, with motion allowed, canvas available and enough room; falls back if the engine never boots. */
(function () {
  try {
    var mm = window.matchMedia;
    var still = mm && mm('(prefers-reduced-motion: reduce)').matches;
    var room = !mm || mm('(min-height: 36em) and (min-width: 20em)').matches;
    var hasCanvas = !!document.createElement('canvas').getContext;
    var r = document.documentElement;
    if (!still && room && hasCanvas && !location.hash) {
      r.classList.add('live');
      window.addEventListener('load', function () { if (!r.classList.contains('booted')) r.classList.remove('live'); });
    }
  } catch (e) {}
})();
