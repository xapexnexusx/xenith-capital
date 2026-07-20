/* ==========================================================================
   XENITH CAPITAL — assets/ui-fx.js (v7 "LIVING INSTRUMENT")
   Hover intelligence layer. Vanilla JS, zero dependencies, strict IIFE,
   zero globals. Purely decorative: every effect degrades to nothing under
   reduced motion, on touch devices, or if XENITH_FX is absent. Navigation
   and inspector state stay 100% owned by main.js — this lane never
   changes scenes, selection, or copy.

   Owns:
   - RAIL PREVIEW: hovering (or keyboard-focusing) a rail scene button
     live-morphs the formation toward that scene's shape via
     XENITH_FX.preview(n); leaving glides it back via previewEnd(). The
     topbar field label shows 'XC / PREVIEW 0N — NAME' during the hover
     and is rebuilt from the active rail button on exit (never restored
     from a stale snapshot).
   - CARD ENERGY: object cards tilt in 3D toward the pointer (--tx/--ty),
     carry a cursor-tracked specular (--gx/--gy), and pull formation
     particles toward the card center via XENITH_FX.excite(x, y) —
     refreshed while hovered, decays on leave.
   - PANEL SPECULAR: the liquid-glass panels' glare highlight follows the
     pointer (--gx/--gy); xenith.css raises --glare on :hover.
   - DECODE: mono labels (rail names, card names) scramble-decode on
     hover — 420ms, guaranteed to land on the original text, one run at
     a time per element.
   - TELEMETRY: #x-uptime ticks 'T+HH:MM:SS' once per second.

   Boot gate: effects arm only after body.x-preload lifts (main.js removes
   it on x:boot-done), checked live — no duplicated boot state.
   ========================================================================== */
(function () {
  'use strict';

  var NAMES = [
    'PORTFOLIO ARCHITECTURE',
    'RESEARCH ENGINE',
    'RISK DOCTRINE',
    'THE FIRM',
    'UPLINK'
  ];

  var DECODE_GLYPHS = '▓▒░<>/|\\=+*#%&@01';
  var DECODE_MS = 420;
  var DECODE_STEP_MS = 34;

  var reduceMotionMQ = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  var hoverMQ = window.matchMedia
    ? window.matchMedia('(hover: hover) and (pointer: fine)')
    : { matches: false };

  function motionOK() {
    return !reduceMotionMQ.matches && hoverMQ.matches;
  }

  function booted() {
    return !(document.body && document.body.classList.contains('x-preload'));
  }

  function fx(method, a, b, c) {
    try {
      var f = window.XENITH_FX;
      if (f && typeof f[method] === 'function') f[method](a, b, c);
    } catch (err) { /* decorative — never throws outward */ }
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ------------------------------ rail preview --------------------------- */

  var fieldLabelEl = null;
  var railBtns = [];
  var previewScene = 0;

  function activeSceneLabel() {
    for (var i = 0; i < railBtns.length; i++) {
      if (railBtns[i].classList.contains('is-active')) {
        var n = parseInt(railBtns[i].getAttribute('data-scene'), 10);
        if (n >= 1 && n <= 5) return 'XC / FIELD ' + pad2(n) + ' — ' + NAMES[n - 1];
      }
    }
    return '';
  }

  function railEnter(btn) {
    if (!motionOK() || !booted()) return;
    var n = parseInt(btn.getAttribute('data-scene'), 10);
    if (!(n >= 1 && n <= 5)) return;
    if (btn.classList.contains('is-active')) return;
    previewScene = n;
    fx('preview', n);
    if (fieldLabelEl) fieldLabelEl.textContent = 'XC / PREVIEW ' + pad2(n) + ' — ' + NAMES[n - 1];
  }

  function railLeave() {
    if (!previewScene) return;
    previewScene = 0;
    fx('previewEnd');
    /* rebuild — never restore a snapshot main.js may have replaced */
    if (fieldLabelEl) {
      var label = activeSceneLabel();
      if (label) fieldLabelEl.textContent = label;
    }
  }

  function bindRail() {
    for (var i = 0; i < railBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('mouseenter', function () { railEnter(btn); });
        btn.addEventListener('mouseleave', railLeave);
        btn.addEventListener('focus', function () { railEnter(btn); });
        btn.addEventListener('blur', railLeave);
        /* click commits: main.js takes over; drop the preview instantly */
        btn.addEventListener('click', function () {
          previewScene = 0;
          /* main.js morphTo() cancels the preview inside fx */
        });
      })(railBtns[i]);
    }
  }

  /* --------------------------- card tilt + energy ------------------------ */

  var TILT_X_MAX = 7;    /* deg */
  var TILT_Y_MAX = 9;

  function cardMove(card, e) {
    if (!motionOK()) return;
    var r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var rx = (e.clientX - r.left) / r.width;
    var ry = (e.clientY - r.top) / r.height;
    if (rx < 0) rx = 0; else if (rx > 1) rx = 1;
    if (ry < 0) ry = 0; else if (ry > 1) ry = 1;
    card.style.setProperty('--tx', ((0.5 - ry) * TILT_X_MAX).toFixed(2) + 'deg');
    card.style.setProperty('--ty', ((rx - 0.5) * TILT_Y_MAX).toFixed(2) + 'deg');
    card.style.setProperty('--gx', (rx * 100).toFixed(1) + '%');
    card.style.setProperty('--gy', (ry * 100).toFixed(1) + '%');
    fx('excite', r.left + r.width * 0.5, r.top + r.height * 0.5, 1);
  }

  function cardLeave(card) {
    card.style.setProperty('--tx', '0deg');
    card.style.setProperty('--ty', '0deg');
  }

  function bindCards() {
    var cards = document.querySelectorAll('.xo-card');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener('pointermove', function (e) { cardMove(card, e); });
        card.addEventListener('pointerleave', function () { cardLeave(card); });
      })(cards[i]);
    }
  }

  /* ----------------------------- panel specular -------------------------- */

  function panelMove(panel, e) {
    if (!motionOK()) return;
    var r = panel.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var rx = (e.clientX - r.left) / r.width * 100;
    var ry = (e.clientY - r.top) / r.height * 100;
    panel.style.setProperty('--gx', rx.toFixed(1) + '%');
    panel.style.setProperty('--gy', ry.toFixed(1) + '%');
  }

  function bindPanels() {
    var panels = document.querySelectorAll('.xs-panel-l, .xs-panel-r');
    for (var i = 0; i < panels.length; i++) {
      (function (panel) {
        panel.addEventListener('pointermove', function (e) { panelMove(panel, e); });
      })(panels[i]);
    }
  }

  /* -------------------------------- decode ------------------------------- */

  function decode(el) {
    if (!motionOK()) return;
    if (el.getAttribute('data-xdecoding') === '1') return;
    var original = el.textContent;
    if (!original || original.length > 40) return;
    el.setAttribute('data-xdecoding', '1');
    var start = performance.now();
    var len = original.length;

    function tick(now) {
      var p = (now - start) / DECODE_MS;
      if (p >= 1) {
        el.textContent = original;
        el.removeAttribute('data-xdecoding');
        return;
      }
      var out = '';
      var solved = Math.floor(p * len);
      for (var i = 0; i < len; i++) {
        var ch = original.charAt(i);
        if (i < solved || ch === ' ') {
          out += ch;
        } else {
          out += DECODE_GLYPHS.charAt((Math.random() * DECODE_GLYPHS.length) | 0);
        }
      }
      el.textContent = out;
      setTimeout(function () { requestAnimationFrame(tick); }, DECODE_STEP_MS);
    }
    requestAnimationFrame(tick);
  }

  function bindDecode() {
    var i;
    var rails = document.querySelectorAll('.xr-item');
    for (i = 0; i < rails.length; i++) {
      (function (btn) {
        var name = btn.querySelector('.xr-name');
        if (name) btn.addEventListener('mouseenter', function () { decode(name); });
      })(rails[i]);
    }
    var cards = document.querySelectorAll('.xo-card');
    for (i = 0; i < cards.length; i++) {
      (function (card) {
        var name = card.querySelector('.xo-name');
        if (name) card.addEventListener('mouseenter', function () { decode(name); });
      })(cards[i]);
    }
  }

  /* ------------------------------- telemetry ----------------------------- */

  function bindUptime() {
    var el = document.getElementById('x-uptime');
    if (!el) return;
    var t0 = Date.now();
    function tickUptime() {
      var s = Math.floor((Date.now() - t0) / 1000);
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      el.textContent = 'T+' + pad2(h) + ':' + pad2(m) + ':' + pad2(s % 60);
    }
    tickUptime();
    setInterval(tickUptime, 1000);
  }

  /* --------------------------------- init -------------------------------- */

  function init() {
    fieldLabelEl = document.getElementById('x-field-label');
    railBtns = document.querySelectorAll('.xr-item');
    bindRail();
    bindCards();
    bindPanels();
    bindDecode();
    bindUptime();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
