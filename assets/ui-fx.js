/* ===========================================================================
   XENITH CAPITAL — living surface effects

   Decorative motion never changes application state. Committed field changes
   are owned by main.js; local layer selections only focus the corresponding
   particle subsystem. This lane owns panel specular light, label decoding,
   and uptime telemetry.
   ========================================================================== */
(function () {
  'use strict';

  var DECODE_GLYPHS = '▓▒░<>/|\\=+*#%&@01';
  var DECODE_MS = 420;
  var DECODE_STEP_MS = 34;
  var reduceMotionMQ = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  var hoverMQ = window.matchMedia
    ? window.matchMedia('(hover: hover) and (pointer: fine)')
    : { matches: false };

  function motionOK() { return !reduceMotionMQ.matches && hoverMQ.matches; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function fx(method, value) {
    try {
      var controller = window.XENITH_FX;
      if (controller && typeof controller[method] === 'function') controller[method](value);
    } catch (err) { /* visual state is non-blocking */ }
  }

  function panelMove(panel, e) {
    if (!motionOK()) return;
    var r = panel.getBoundingClientRect();
    if (!r.width || !r.height) return;
    panel.style.setProperty('--gx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
    panel.style.setProperty('--gy', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
  }

  function bindPanels() {
    var panels = document.querySelectorAll('.xs-panel-l, .xs-panel-r, #x-field-menu');
    for (var i = 0; i < panels.length; i++) {
      (function (panel) {
        panel.addEventListener('pointermove', function (e) { panelMove(panel, e); });
      })(panels[i]);
    }
  }

  function decode(el) {
    if (!motionOK() || el.getAttribute('data-xdecoding') === '1') return;
    var original = el.textContent;
    if (!original || original.length > 40) return;
    el.setAttribute('data-xdecoding', '1');
    var start = performance.now();
    var len = original.length;
    function tick(now) {
      var progress = (now - start) / DECODE_MS;
      if (progress >= 1 || !el.isConnected) {
        el.textContent = original;
        el.removeAttribute('data-xdecoding');
        return;
      }
      var solved = Math.floor(progress * len);
      var out = '';
      for (var i = 0; i < len; i++) {
        var ch = original.charAt(i);
        out += (i < solved || ch === ' ')
          ? ch
          : DECODE_GLYPHS.charAt((Math.random() * DECODE_GLYPHS.length) | 0);
      }
      el.textContent = out;
      setTimeout(function () { requestAnimationFrame(tick); }, DECODE_STEP_MS);
    }
    requestAnimationFrame(tick);
  }

  function bindDecodeGroup(selector, labelSelector) {
    var controls = document.querySelectorAll(selector);
    for (var i = 0; i < controls.length; i++) {
      (function (control) {
        var label = control.querySelector(labelSelector);
        if (label) control.addEventListener('mouseenter', function () { decode(label); });
      })(controls[i]);
    }
  }

  /* FOCUS_MAP[scene][layer] -> particle group. Formation morphing is reserved
     for committed field changes; this focus is a quiet local highlight. */
  var FOCUS_MAP = {
    1: [1, 3, 0, 2],
    2: [0, 1, 2, 2],
    3: [0, 1, 2, 3],
    4: [0, 1, 2, 3]
  };

  function onLayerSelected(e) {
    var detail = (e && e.detail) || {};
    var map = FOCUS_MAP[detail.scene];
    var idx = parseInt(detail.index, 10);
    if (!map || isNaN(idx) || idx < 0 || idx >= map.length) return;
    fx('focus', map[idx]);
  }

  function bindUptime() {
    var el = document.getElementById('x-uptime');
    if (!el) return;
    var started = Date.now();
    function tick() {
      var seconds = Math.floor((Date.now() - started) / 1000);
      var hours = Math.floor(seconds / 3600);
      var minutes = Math.floor((seconds % 3600) / 60);
      el.textContent = 'T+' + pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds % 60);
    }
    tick();
    setInterval(tick, 1000);
  }

  function init() {
    bindPanels();
    bindDecodeGroup('.xfm-item', '.xfm-name');
    bindDecodeGroup('.xi-layer-tab', '.xo-name');
    bindUptime();
    document.addEventListener('x:layer-selected', onLayerSelected);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
