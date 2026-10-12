/* Xenith Capital: pick the live instrument before first paint. Needs JavaScript, WebGL2 and room;
   otherwise the page stays a calm readable document. Falls back if the engine never boots. */
(function () {
  try {
    var mm = window.matchMedia, r = document.documentElement;
    var room = !mm || mm('(min-height: 30em) and (min-width: 20em)').matches;
    var c = document.createElement('canvas');
    var ok = !!(window.WebGL2RenderingContext && c.getContext);
    if (room && ok) {
      r.classList.add('live');
      setTimeout(function () { if (!r.classList.contains('booted')) r.classList.remove('live'); }, 3500);
    }
  } catch (e) {}
})();
