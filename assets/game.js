/* ============================================================================
   XENITH CAPITAL — assets/game.js  (v3, Lane 6: achievements + fanfare)
   Achievement toasts + CLEARANCE GRANTED fanfare. Vanilla JS, zero
   dependencies, single IIFE, exposes nothing globally. Injects ONE <style>
   scoped exclusively to .xg-* classes; touches no other lane's selectors.

   Listens on document for CustomEvents dispatched by main.js / terminal.js:
     x:level-cleared      -> toast "LEVEL CLEARED // <label>"
                             (detail.label, falling back to detail.id)
     x:konami             -> toast "ACHIEVEMENT: OLD SCHOOL"
     x:clearance-granted  -> full-screen cyan->magenta sweep (~600ms), then a
                             .xg-win toast "CLEARANCE GRANTED // CHANNEL UNSEALED"

   Toasts: fixed top-right stack below the nav, mono .7rem, cyan hairline
   border, void-translucent bg, slide in from the right, auto-dismiss after
   3.5s, max 3 concurrent (oldest drops). Reduced motion: toasts appear and
   dismiss instantly, sweep suppressed. Every timer pauses while the tab is
   hidden and resumes on return. No-ops silently if no event ever fires.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ constants ------------------------------ */

  var TOAST_MS = 3500;    // visible time before auto-dismiss
  var EXIT_MS = 280;      // slide-out time before the node leaves the DOM
  var MAX_TOASTS = 3;     // concurrent cap; oldest drops
  var SWEEP_MS = 600;     // fanfare sweep duration (must match the CSS)

  var reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  function reduced() {
    return !!(reduceMotionMQ && reduceMotionMQ.matches);
  }

  /* --------------------- injected style (one, .xg-* only) ---------------- */

  var XG_CSS = [
    '.xg-stack{position:fixed;top:4.5rem;right:1rem;z-index:9000;display:flex;',
    'flex-direction:column;align-items:flex-end;gap:.5rem;max-width:min(22rem,calc(100vw - 2rem));pointer-events:none}',
    '.xg-toast{font-family:\'JetBrains Mono\',ui-monospace,monospace;font-size:.7rem;line-height:1.55;',
    'letter-spacing:.09em;text-transform:uppercase;color:#d7e3ee;background:rgba(4,6,10,.88);',
    'border:1px solid rgba(0,240,255,.42);border-left:2px solid #00f0ff;padding:.55rem .85rem;',
    'box-shadow:0 0 14px rgba(0,240,255,.14);opacity:0;transform:translateX(112%);',
    'transition:transform .28s cubic-bezier(.22,1,.36,1),opacity .28s ease;pointer-events:none}',
    '.xg-toast.xg-on{opacity:1;transform:translateX(0)}',
    '.xg-toast.xg-off{opacity:0;transform:translateX(112%)}',
    '.xg-toast.xg-win{color:#ffe4ef;border-color:rgba(255,45,120,.6);border-left-color:#ff2d78;',
    'box-shadow:0 0 16px rgba(255,45,120,.28)}',
    '.xg-sweep{position:fixed;inset:0;z-index:9400;pointer-events:none;',
    'background:linear-gradient(100deg,rgba(0,240,255,.16) 0%,rgba(0,240,255,.05) 45%,rgba(255,45,120,.16) 100%);',
    'opacity:0;transform:scaleY(0);transform-origin:50% 0}',
    '.xg-sweep.xg-run{animation:xg-sweep-anim .6s cubic-bezier(.22,1,.36,1) forwards}',
    '@keyframes xg-sweep-anim{0%{opacity:0;transform:scaleY(0)}18%{opacity:1}62%{opacity:.85;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1)}}',
    '@media (prefers-reduced-motion:reduce){.xg-toast{transition:none}.xg-sweep{display:none}}'
  ].join('\n');

  function injectStyle() {
    if (document.querySelector('style[data-xg]')) return; // already injected
    var style = document.createElement('style');
    style.setAttribute('data-xg', '');
    style.textContent = XG_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* --------------- visibility-aware timers (pause when hidden) ----------- */

  var timers = [];

  function now() {
    return Date.now();
  }

  function detach(h) {
    var i = timers.indexOf(h);
    if (i !== -1) timers.splice(i, 1);
  }

  function arm(h) {
    h.startedAt = now();
    h.id = window.setTimeout(function () {
      h.dead = true;
      detach(h);
      h.fn();
    }, h.remaining);
  }

  // setTimeout replacement: fires after ms of *visible* time.
  function later(fn, ms) {
    var h = { fn: fn, remaining: ms, startedAt: 0, id: 0, dead: false };
    timers.push(h);
    arm(h);
    return h;
  }

  function cancel(h) {
    if (!h || h.dead) return;
    h.dead = true;
    window.clearTimeout(h.id);
    detach(h);
  }

  function onVisibility() {
    var i, h;
    if (document.hidden) {
      for (i = 0; i < timers.length; i++) {
        h = timers[i];
        window.clearTimeout(h.id);
        h.remaining = Math.max(0, h.remaining - (now() - h.startedAt));
      }
    } else {
      for (i = 0; i < timers.length; i++) arm(timers[i]);
    }
  }

  /* ------------------------------ toast stack ---------------------------- */

  var stack = null;
  var toasts = [];

  function ensureStack() {
    if (stack && stack.parentNode) return stack;
    stack = document.createElement('div');
    stack.className = 'xg-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
    return stack;
  }

  function drop(t) { // instant detach: cap enforcement + reduced-motion path
    var i = toasts.indexOf(t);
    if (i !== -1) toasts.splice(i, 1);
    if (t.timer) cancel(t.timer);
    if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
  }

  function beginExit(t) {
    if (reduced()) { drop(t); return; }
    t.el.classList.add('xg-off');
    t.timer = later(function () { drop(t); }, EXIT_MS);
  }

  function pushToast(text, isWin) {
    if (!text) return;
    var parent = ensureStack();
    while (toasts.length >= MAX_TOASTS) drop(toasts[0]); // oldest drops
    var el = document.createElement('div');
    el.className = 'xg-toast' + (isWin ? ' xg-win' : '');
    el.textContent = text;
    parent.appendChild(el);
    var t = { el: el, timer: null };
    toasts.push(t);
    // two frames so the slide-in transition actually runs
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (el.parentNode) el.classList.add('xg-on');
      });
    });
    t.timer = later(function () { beginExit(t); }, TOAST_MS);
  }

  /* ------------------------- clearance fanfare sweep --------------------- */

  function sweep() {
    if (reduced()) return; // no sweep under reduced motion
    var el = document.createElement('div');
    el.className = 'xg-sweep';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    void el.offsetWidth; // flush styles so the sweep starts from scaleY(0)
    el.classList.add('xg-run');
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', onEnd);
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    function onEnd() { finish(); }
    el.addEventListener('animationend', onEnd);
    later(finish, SWEEP_MS + 350); // fallback if animationend never fires
  }

  /* ----------------------------- event wiring ---------------------------- */

  var STAGE_LABELS = { 1: 'LV.01', 2: 'LV.02', 3: 'LV.03', 4: 'LV.04', 5: 'FINAL LEVEL', 6: 'CLEAR' };

  function onLevelCleared(e) {
    var d = (e && e.detail) || {};
    var label = STAGE_LABELS[d.n] || d.label || d.id || '';
    pushToast('LEVEL CLEARED' + (label ? ' // ' + label : ''), false);
  }

  function onKonami() {
    pushToast('ACHIEVEMENT: OLD SCHOOL', false);
  }

  function onClearance() {
    sweep();
    pushToast('CLEARANCE GRANTED // CHANNEL UNSEALED', true);
  }

  function init() {
    if (document.querySelector('.xg-stack')) return; // already running
    injectStyle();
    document.addEventListener('x:stage-passed', onLevelCleared);
    document.addEventListener('x:konami', onKonami);
    document.addEventListener('x:clearance-granted', onClearance);
    document.addEventListener('visibilitychange', onVisibility);
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
