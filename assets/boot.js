/* ============================================================================
   XENITH CAPITAL — assets/boot.js
   Boot preloader sequence (Agent F, v2 lane 6). Vanilla JS, zero dependencies,
   single IIFE. Owns: the #x-boot overlay lifecycle — mono log typing, progress
   bar/pct sync, completion gating on BOTH the typed sequence and window load,
   skip interactions, reduced-motion bypass, and a hard runtime failsafe.
   Exposes nothing globally.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ configuration -------------------------- */

  var LINES = [
    '> initializing xenith core…',
    '> loading research engine… OK',
    '> risk doctrine… ARMED',
    '> evidence coverage… 100%',
    '> SYSTEM ONLINE'
  ];

  var TYPE_MS = 10;      // per character while typing
  var LINE_MS = 120;     // pause between completed lines
  var DONE_MS = 600;     // .is-done transition window before node removal
  var FAILSAFE_MS = 4000; // absolute cap on total runtime

  var reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --------------------------------- init -------------------------------- */

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(init);

  function init() {
    var boot = document.getElementById('x-boot');
    if (!boot) return; // overlay absent: silent no-op

    var log = document.getElementById('x-boot-log');
    var fill = document.getElementById('x-boot-fill');
    var pct = document.getElementById('x-boot-pct');

    // Reduced motion: no typing, no sequence — drop the overlay immediately.
    if (reduceMotionMQ.matches) {
      detach();
      return;
    }

    /* ------------------------------ state -------------------------------- */

    var totalChars = 0;
    for (var i = 0; i < LINES.length; i++) totalChars += LINES[i].length;

    var typedDone = false;
    var loadDone = document.readyState === 'complete';
    var finished = false;

    var lineIdx = 0;
    var charIdx = 0;
    var typedChars = 0;
    var currentLineEl = null;

    var timers = [];

    function later(fn, ms) {
      timers.push(window.setTimeout(fn, ms));
    }

    function clearTimers() {
      for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
      timers = [];
    }

    /* ------------------------------ progress ----------------------------- */

    function setProgress(ratio) {
      var p = Math.max(0, Math.min(100, Math.round(ratio * 100)));
      if (fill) fill.style.width = p + '%';
      if (pct) pct.textContent = p + '%';
    }

    /* ------------------------------- typing ------------------------------ */

    function typeStep() {
      if (finished) return;
      if (lineIdx >= LINES.length) {
        typedDone = true;
        maybeFinish();
        return;
      }
      var line = LINES[lineIdx];
      if (charIdx === 0 && log) {
        currentLineEl = document.createElement('div');
        log.appendChild(currentLineEl);
      }
      charIdx++;
      typedChars++;
      if (currentLineEl) currentLineEl.textContent = line.slice(0, charIdx);
      setProgress(typedChars / totalChars);
      if (charIdx >= line.length) {
        lineIdx++;
        charIdx = 0;
        later(typeStep, LINE_MS);
      } else {
        later(typeStep, TYPE_MS);
      }
    }

    // Skip path: dump every line at once so the log reads complete at 100%.
    function dumpAllLines() {
      if (!log) return;
      log.textContent = '';
      for (var i = 0; i < LINES.length; i++) {
        var el = document.createElement('div');
        el.textContent = LINES[i];
        log.appendChild(el);
      }
    }

    /* ------------------------------- finish ------------------------------ */

    function maybeFinish() {
      if (finished || !typedDone || !loadDone) return;
      finish(false);
    }

    function finish(skipped) {
      if (finished) return;
      finished = true;
      clearTimers();
      unbind();
      if (skipped) {
        dumpAllLines();
        setProgress(1);
      }
      boot.classList.add('is-done'); // CSS owns the fade/slide-out
      window.setTimeout(detach, DONE_MS);
    }

    function detach() {
      if (boot.parentNode) boot.parentNode.removeChild(boot);
    }

    // Skip and the failsafe both finish immediately, ignoring the load gate.
    function forceFinish() {
      if (finished) return;
      typedDone = true;
      loadDone = true;
      finish(true);
    }

    /* ------------------------------- events ------------------------------ */

    function onKeydown(e) {
      if (e.key === 'Escape' || e.key === 'Enter') forceFinish();
    }

    function onLoad() {
      loadDone = true;
      maybeFinish();
    }

    function unbind() {
      boot.removeEventListener('click', forceFinish);
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('load', onLoad);
    }

    boot.addEventListener('click', forceFinish);
    document.addEventListener('keydown', onKeydown);
    if (!loadDone) window.addEventListener('load', onLoad, { once: true });

    later(forceFinish, FAILSAFE_MS); // never let the overlay outlive 4s
    later(typeStep, TYPE_MS);
  }
})();
