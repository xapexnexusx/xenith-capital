/* ============================================================================
   XENITH CAPITAL — assets/boot.js
   Boot preloader sequence (v4, Lane 6 — SIGNAL TRIALS). Vanilla JS, zero
   dependencies, single IIFE. Owns: the #x-boot overlay lifecycle — game boot
   log typing (7 lines), progress bar/pct sync, blinking PRESS ENTER prompt
   gated on BOTH the typed sequence and window load, Enter/click/Escape finish,
   hard runtime failsafe, reduced-motion bypass, and timer pause while the tab
   is hidden. Every terminal exit (finish, skip, failsafe, reduced-motion
   removal) dispatches the document event `x:boot-done` exactly once —
   stage.js listens for it to enter stage 0. Exposes nothing globally.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ configuration -------------------------- */

  var LINES = [
    '> initializing XENITH core… OK',
    '> loading LEVEL 01 // ARCHITECTURE… OK',
    '> loading LEVEL 02 // RESEARCH… OK',
    '> loading LEVEL 03 // RISK… OK',
    '> loading LEVEL 04 // JUDGMENT… OK',
    '> FINAL LEVEL // CLEARANCE… SEALED',
    '> XENITH // SIGNAL TRIALS — SYSTEM ONLINE'
  ];

  var PROMPT_TEXT = 'PRESS ENTER TO INITIALIZE';

  var TYPE_MS = 10;       // per character while typing
  var LINE_MS = 120;      // pause between completed lines
  var DONE_MS = 600;      // .is-done transition window before node removal
  var FAILSAFE_MS = 8000; // absolute cap on total overlay lifetime

  // One injected style, scoped to .xb-blink only (contract allowance).
  var BLINK_CSS =
    '.xb-blink{animation:xb-blink 1s steps(1,end) infinite}' +
    '@keyframes xb-blink{0%{opacity:1}50%{opacity:0}100%{opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){.xb-blink{animation:none}}';

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

    /* ------------------------------ state -------------------------------- */

    var totalChars = 0;
    for (var i = 0; i < LINES.length; i++) totalChars += LINES[i].length;

    var typedDone = false;
    var loadDone = document.readyState === 'complete';
    var promptShown = false;
    var finished = false;
    var bootDoneSent = false;

    var lineIdx = 0;
    var charIdx = 0;
    var typedChars = 0;
    var currentLineEl = null;
    var styleEl = null;

    /* ------------------------ pausable timer pool ------------------------ */
    // All boot timers live here so they freeze while the tab is hidden.
    // Declared before every code path that can reach detach().

    var timers = [];
    var timersPaused = false;

    // Reduced motion: no typing, no prompt — drop the overlay immediately.
    if (reduceMotionMQ.matches) {
      detach();
      return;
    }

    // Inject the single scoped blink style (removed again on detach).
    styleEl = document.createElement('style');
    styleEl.textContent = BLINK_CSS;
    document.head.appendChild(styleEl);

    function later(fn, ms) {
      var t = { id: 0, fn: fn, due: Date.now() + ms, msLeft: ms };
      t.id = window.setTimeout(function () { runTimer(t); }, ms);
      timers.push(t);
      return t;
    }

    function runTimer(t) {
      var i = timers.indexOf(t);
      if (i !== -1) timers.splice(i, 1);
      t.fn();
    }

    function cancelAllTimers() {
      for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i].id);
      timers = [];
    }

    function pauseTimers() {
      if (timersPaused) return;
      timersPaused = true;
      var now = Date.now();
      for (var i = 0; i < timers.length; i++) {
        window.clearTimeout(timers[i].id);
        timers[i].msLeft = Math.max(0, timers[i].due - now);
      }
    }

    function resumeTimers() {
      if (!timersPaused) return;
      timersPaused = false;
      for (var i = 0; i < timers.length; i++) {
        (function (t) {
          t.due = Date.now() + t.msLeft;
          t.id = window.setTimeout(function () { runTimer(t); }, t.msLeft);
        })(timers[i]);
      }
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
        maybeShowPrompt();
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

    /* -------------------------- PRESS ENTER prompt ----------------------- */

    // Shown only once BOTH the typed sequence and window load have settled.
    function maybeShowPrompt() {
      if (finished || promptShown || !typedDone || !loadDone) return;
      promptShown = true;
      setProgress(1); // guarantee an exact 100% beside the prompt
      if (!log) return;
      var el = document.createElement('div');
      el.className = 'xb-blink';
      el.textContent = PROMPT_TEXT;
      log.appendChild(el);
    }

    /* ------------------------------- finish ------------------------------ */

    function finish() {
      if (finished) return;
      finished = true;
      cancelAllTimers(); // kills typing chain + failsafe
      boot.classList.add('is-done'); // CSS owns the fade/scale-out
      later(detach, DONE_MS);
    }

    // Enter/click/Escape and the failsafe finish immediately, ignoring gates.
    function forceFinish() {
      if (finished) return;
      if (!typedDone) {
        dumpAllLines();
        setProgress(1);
      }
      finish();
    }

    function detach() {
      cancelAllTimers();
      unbind();
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      if (boot.parentNode) boot.parentNode.removeChild(boot);
      announceDone();
    }

    // stage.js enters stage 0 on `x:boot-done`. Fired exactly once from every
    // terminal path (normal finish, skip, failsafe, reduced-motion removal).
    // Deferred by a tick: this script precedes stage.js in the deferred chain,
    // so a synchronous dispatch during initial evaluation (the reduced-motion
    // path) could outrun a listener that is not bound yet.
    function announceDone() {
      if (bootDoneSent) return;
      bootDoneSent = true;
      window.setTimeout(function () {
        document.dispatchEvent(new CustomEvent('x:boot-done'));
      }, 0);
    }

    /* ------------------------------- events ------------------------------ */

    function onKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault(); // consumed by the boot overlay, never the page
        forceFinish();
      } else if (e.key === 'Escape') {
        forceFinish();
      }
    }

    function onLoad() {
      loadDone = true;
      maybeShowPrompt();
    }

    function onVisibility() {
      if (document.hidden) pauseTimers();
      else resumeTimers();
    }

    // Motion preference flipped to reduce mid-boot: remove overlay at once.
    function onMotionPrefChange() {
      if (reduceMotionMQ.matches) detach();
    }

    function unbind() {
      boot.removeEventListener('click', forceFinish);
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('load', onLoad);
      if (reduceMotionMQ.removeEventListener) {
        reduceMotionMQ.removeEventListener('change', onMotionPrefChange);
      }
    }

    boot.addEventListener('click', forceFinish);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    if (!loadDone) window.addEventListener('load', onLoad, { once: true });
    if (reduceMotionMQ.addEventListener) {
      reduceMotionMQ.addEventListener('change', onMotionPrefChange);
    }

    later(forceFinish, FAILSAFE_MS); // never let the overlay outlive 8s
    later(typeStep, TYPE_MS);

    // Loaded into a background tab: hold the whole sequence until visible.
    if (document.hidden) pauseTimers();
  }
})();
