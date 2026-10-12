/* Xenith Capital: choose the live command-hub mode before first paint.
   Live needs a canvas and enough room; otherwise the page stays a plain readable document.
   Falls back to the document if the engine never boots. */
(function () {
  try {
    var mm = window.matchMedia;
    var room = !mm || mm('(min-height: 34em) and (min-width: 20em)').matches;
    var hasCanvas = !!document.createElement('canvas').getContext;
    var r = document.documentElement;
    if (room && hasCanvas) {
      r.classList.add('live');
      var fallback = function () { if (!r.classList.contains('booted')) r.classList.remove('live'); };
      setTimeout(fallback, 3000);
    }
  } catch (e) {}
})();
