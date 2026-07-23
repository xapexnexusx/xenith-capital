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

  /* Market-session readout — a REAL status, replacing the SYS.ONLINE prop.
     NYSE regular session 09:30–16:00 ET Mon–Fri (cyan, pulsing), extended
     04:00–09:30 PRE / 16:00–20:00 AFTER (amber), otherwise CLOSED (dim,
     still dot). Clock-derived fact; scheduled market holidays are not
     modeled — the title attribute scopes the claim to session hours. */
  function bindMarket() {
    var root = document.getElementById('x-mkt');
    var dot = document.getElementById('x-mkt-dot');
    var label = document.getElementById('x-mkt-label');
    if (!root || !dot || !label) return;

    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
      });
    } catch (err) {
      root.style.display = 'none'; /* no zone data: drop the readout, no lies */
      return;
    }

    function readout() {
      var parts = fmt.formatToParts(new Date());
      var map = {};
      for (var i = 0; i < parts.length; i++) map[parts[i].type] = parts[i].value;
      var wd = map.weekday;
      var mins = (parseInt(map.hour, 10) % 24) * 60 + parseInt(map.minute, 10);
      var weekend = wd === 'Sat' || wd === 'Sun';
      var state, cls;
      if (!weekend && mins >= 570 && mins < 960) { state = 'NYSE&nbsp;&middot;&nbsp;OPEN'; cls = 'open'; }
      else if (!weekend && mins >= 240 && mins < 570) { state = 'NYSE&nbsp;&middot;&nbsp;PRE'; cls = 'ext'; }
      else if (!weekend && mins >= 960 && mins < 1200) { state = 'NYSE&nbsp;&middot;&nbsp;AFTER'; cls = 'ext'; }
      else { state = 'NYSE&nbsp;&middot;&nbsp;CLOSED'; cls = 'closed'; }

      label.innerHTML = state;
      dot.className = 'x-pulse-dot' +
        (cls === 'ext' ? ' x-pulse-amber' : cls === 'closed' ? ' x-pulse-off' : '');
      root.className = 'xtb-status' +
        (cls === 'ext' ? ' is-extended' : cls === 'closed' ? ' is-closed' : '');
    }

    readout();
    setInterval(readout, 30000);
  }

  /* Field-map hover intelligence: hovering a map entry live-morphs the
     formation toward that field's shape; leaving or committing glides back. */
  function bindMenuPreview() {
    var items = document.querySelectorAll('.xfm-item');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var n = parseInt(item.getAttribute('data-scene'), 10);
        if (!(n >= 1 && n <= 5)) return;
        item.addEventListener('mouseenter', function () {
          if (motionOK()) fx('preview', n);
        });
        item.addEventListener('mouseleave', function () { fx('previewEnd'); });
        item.addEventListener('click', function () { fx('previewEnd'); });
      })(items[i]);
    }
  }

  function init() {
    bindPanels();
    bindDecodeGroup('.xfm-item', '.xfm-name');
    bindDecodeGroup('.xi-layer-tab', '.xo-name');
    bindUptime();
    bindMarket();
    bindMenuPreview();
    document.addEventListener('x:layer-selected', onLayerSelected);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
