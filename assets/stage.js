/* ============================================================================
   XENITH CAPITAL — assets/stage.js
   v4 SIGNAL TRIALS — stage manager + interaction core (Lane 3). Vanilla JS,
   zero dependencies, single strict IIFE. Replaces v3 main.js (kept on disk as
   reference only).

   Owns:
   - Stage state machine: exactly one .stage.is-active at a time. State
     {current, unlocked}; unlocked persists in sessionStorage xv_unlock
     (default 0, stage 0 always allowed). Stages unlock forward-only via
     x:stage-passed {detail:{n}}; the boot overlay hands over via x:boot-done.
   - Public API: window.XSTAGE = { go(n), next(), current(), onEnter(cb) }.
   - Warp transitions through window.XENITH_FX.warp(midCb) when present:
     .is-warp-out on the exiting stage, midpoint swap of .is-active,
     .is-warp-in on the entering stage for 500ms. Instant swap when fx is
     missing or prefers-reduced-motion is on. x:stage-enter {detail:{n,name}}
     fires only after a transition fully completes.
   - Pip HUD: clicks gated on index <= unlocked && index != current;
     is-active / is-cleared / [disabled] refreshed on every state change.
   - Input: ArrowLeft/ArrowRight (ArrowRight only into unlocked stages, except
     the title's INSERT COIN deal-in), Enter on stage 0 = #x-start-btn click,
     #x-start-btn -> next(), #x-home -> go(0), horizontal touch swipe > 48px,
     #clear-restart + x:replay (wipe xv_unlock + xv_clearance, go(0)).
   - Body scroll lock: overflow hidden on html/body, touchmove overscroll
     blocked except inside .x-term-body / .x-disc-panel which scroll normally.
   - Custom cursor (v2 dot + lerp ring port; disabled on coarse pointers or
     reduced motion; .is-hover over a/button/.x-btn), Konami code
     (XENITH_FX.burst + x:konami), #x-typer rotator (55ms type / 2.2s hold /
     28ms delete, reduced-motion static first phrase, paused while hidden).
   Honors prefers-reduced-motion in every path; timed work idles on hidden
   tabs (rAF idles automatically).
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ constants ------------------------------ */

  var STORAGE_UNLOCK = 'xv_unlock';
  var STORAGE_CLEARANCE = 'xv_clearance'; // owned by terminal.js; wiped on replay
  var MAX_STAGE = 6;
  var FALLBACK_NAMES = ['TITLE', 'LV.01', 'LV.02', 'LV.03', 'LV.04', 'FINAL', 'CLEAR'];
  var PASS_ADVANCE_MS = 900;   // pause between a PASS and the auto-advance
  var WARP_IN_MS = 500;        // .is-warp-in lifetime after the midpoint swap
  var WARP_WATCHDOG_MS = 1600; // fx.warp must hit its midpoint inside this window
  var BOOT_WATCHDOG_MS = 9000; // longer than boot.js's own 8s failsafe
  var BOOT_RECHECK_MS = 2000;  // watchdog re-arm while the overlay is still up
  var SWIPE_MIN_PX = 48;       // minimum horizontal travel for a stage swipe

  var reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Custom cursor is dropped for touch/coarse pointers or reduced motion.
  var cursorOffMQ = window.matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)');

  function onMQChange(mql, handler) {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handler); // legacy Safari
    }
  }

  /* --------------------------- session storage --------------------------- */
  // sessionStorage can throw (file://, hardened privacy modes): every access
  // is wrapped; the game stays playable, it just forgets on reload.

  function storageGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (err) { return null; }
  }

  function storageSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (err) { /* non-fatal */ }
  }

  function storageRemove(key) {
    try { window.sessionStorage.removeItem(key); } catch (err) { /* non-fatal */ }
  }

  function readUnlocked() {
    var raw = parseInt(storageGet(STORAGE_UNLOCK), 10);
    if (isNaN(raw)) return 0;
    return Math.max(0, Math.min(MAX_STAGE, raw));
  }

  /* --------------------------------- state ------------------------------- */

  var current = -1;               // no stage active until the boot handover
  var unlocked = readUnlocked();
  var transition = null;          // in-flight warp descriptor, or null
  var enterCbs = [];              // XSTAGE.onEnter subscribers

  var stages = [];                // index -> section.stage
  var pips = [];                  // index -> button.x-pip
  var names = FALLBACK_NAMES.slice(0);

  /* ------------------------------ dom lookup ----------------------------- */

  function collectDom() {
    var stageEls = document.querySelectorAll('.stage[data-stage]');
    for (var i = 0; i < stageEls.length; i++) {
      var idx = parseInt(stageEls[i].getAttribute('data-stage'), 10);
      if (isNaN(idx) || idx < 0 || idx > MAX_STAGE) continue;
      stages[idx] = stageEls[i];
      stageEls[i].setAttribute('tabindex', '-1'); // focus target on enter
      stageEls[i].setAttribute('aria-hidden', 'true');
    }
    var pipEls = document.querySelectorAll('.x-pip[data-stage]');
    for (var p = 0; p < pipEls.length; p++) {
      var pi = parseInt(pipEls[p].getAttribute('data-stage'), 10);
      if (isNaN(pi) || pi < 0 || pi > MAX_STAGE) continue;
      pips[pi] = pipEls[p];
      var label = (pipEls[p].textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
      if (label) names[pi] = label; // the HTML labels are the source of truth
    }
  }

  function persistUnlocked() {
    storageSet(STORAGE_UNLOCK, String(unlocked));
  }

  // Pip HUD truth, derived fresh on every state change: locked = beyond
  // unlocked ([disabled]), cleared = passed (index < unlocked), active =
  // current. All three are pure functions of {current, unlocked}.
  function refreshPips() {
    for (var i = 0; i <= MAX_STAGE; i++) {
      var pip = pips[i];
      if (!pip) continue;
      pip.disabled = i > unlocked;
      pip.classList.toggle('is-active', i === current);
      pip.classList.toggle('is-cleared', i < unlocked);
      if (i === current) pip.setAttribute('aria-current', 'true');
      else pip.removeAttribute('aria-current');
    }
  }

  function syncAria(n) {
    for (var i = 0; i <= MAX_STAGE; i++) {
      if (!stages[i]) continue;
      if (i === n) stages[i].removeAttribute('aria-hidden');
      else stages[i].setAttribute('aria-hidden', 'true');
    }
  }

  /* ---------------------------- enter dispatch --------------------------- */

  function dispatchEnter(n) {
    var detail = { n: n, name: names[n] || ('STAGE ' + n) };
    try {
      document.dispatchEvent(new CustomEvent('x:stage-enter', { detail: detail }));
    } catch (err) {
      // A throwing listener must never take the stage manager down.
    }
    for (var i = 0; i < enterCbs.length; i++) {
      try { enterCbs[i](detail); } catch (err2) { /* callbacks are isolated */ }
    }
  }

  function focusStage(n) {
    var el = stages[n];
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch (err) {
      try { el.focus(); } catch (err2) { /* older engines: skip focus */ }
    }
  }

  /* --------------------------- transition engine ------------------------- */

  function clearTransitionTimers(t) {
    if (t.cleanupId !== null) {
      window.clearTimeout(t.cleanupId);
      t.cleanupId = null;
    }
    if (t.watchdogId !== null) {
      window.clearTimeout(t.watchdogId);
      t.watchdogId = null;
    }
  }

  // The one place .is-active moves. Also the one place `current` changes.
  function swapActive(n) {
    var fromEl = current >= 0 ? stages[current] : null;
    var toEl = stages[n];
    if (fromEl) fromEl.classList.remove('is-active');
    if (toEl) toEl.classList.add('is-active');
    current = n;
    syncAria(n);
    refreshPips();
  }

  // Transition fully done: strip warp chrome, release the lock, announce.
  function completeTransition() {
    var t = transition;
    if (!t) return;
    clearTransitionTimers(t);
    if (t.fromEl) t.fromEl.classList.remove('is-warp-out');
    if (t.toEl) t.toEl.classList.remove('is-warp-in');
    transition = null;
    refreshPips();
    dispatchEnter(t.target);
    focusStage(t.target);
  }

  // Warp path: fx owns the visual suck-in/de-warp; we own the DOM classes.
  // The midpoint callback must fire exactly once — a watchdog forces the swap
  // if a broken fx never calls back, and a throw falls back to instant.
  function beginWarp(n, fx) {
    var fromEl = current >= 0 ? stages[current] : null;
    var toEl = stages[n];
    var t = {
      target: n,
      fromEl: fromEl,
      toEl: toEl,
      swapped: false,
      cleanupId: null,
      watchdogId: null
    };
    transition = t;
    if (fromEl) fromEl.classList.add('is-warp-out');

    function onMidpoint() {
      if (t.swapped) return; // fx must fire midCb exactly once
      t.swapped = true;
      if (transition !== t) return; // aborted meanwhile
      swapActive(n);
      if (toEl) toEl.classList.add('is-warp-in');
      t.cleanupId = window.setTimeout(function () {
        t.cleanupId = null;
        if (transition === t) completeTransition();
      }, WARP_IN_MS);
    }

    t.watchdogId = window.setTimeout(function () {
      t.watchdogId = null;
      if (transition !== t || t.swapped) return;
      onMidpoint(); // fx went silent: force the swap so play can continue
    }, WARP_WATCHDOG_MS);

    try {
      fx.warp(onMidpoint);
    } catch (err) {
      // Broken fx: recover as a plain swap, no warp chrome left behind.
      clearTransitionTimers(t);
      if (!t.swapped) {
        t.swapped = true;
        if (transition === t) swapActive(n);
      }
      if (transition === t) completeTransition();
    }
  }

  function goInstant(n) {
    swapActive(n);
    dispatchEnter(n);
    focusStage(n);
  }

  // Bail out of an in-flight warp (e.g. replay mid-jump): force the pending
  // swap through, then announce normally so listeners stay consistent.
  function abortTransition() {
    var t = transition;
    if (!t) return;
    clearTransitionTimers(t);
    if (!t.swapped) {
      t.swapped = true;
      swapActive(t.target);
    }
    completeTransition();
  }

  /* ------------------------------ public API ----------------------------- */

  // Low-level mover. Trusted callers only: gating lives in next()/pips/keys.
  function go(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) return false;
    n = Math.max(0, Math.min(MAX_STAGE, n));
    if (n === current) return false;
    if (!stages[n]) return false;
    if (transition) return false; // one jump at a time

    var fx = window.XENITH_FX;
    var canWarp = current >= 0 &&
                  !reduceMotionMQ.matches &&
                  fx && typeof fx.warp === 'function';
    if (canWarp) beginWarp(n, fx);
    else goInstant(n);
    return true;
  }

  // Forward travel is gated: the title's INSERT COIN deal-in is always live
  // (and unlocks LV.01); everywhere else the next stage must be unlocked.
  function canAdvance() {
    if (current < 0 || current >= MAX_STAGE) return false;
    if (current === 0) return true;
    return current + 1 <= unlocked;
  }

  function next() {
    if (!canAdvance()) return false;
    var target = current + 1;
    if (target > unlocked) { // the 0 -> 1 coin drop unlocks LV.01
      unlocked = target;
      persistUnlocked();
      refreshPips();
    }
    return go(target);
  }

  function onEnter(cb) {
    if (typeof cb !== 'function') return function () {};
    enterCbs.push(cb);
    return function unsubscribe() {
      var i = enterCbs.indexOf(cb);
      if (i !== -1) enterCbs.splice(i, 1);
    };
  }

  window.XSTAGE = {
    go: go,
    next: next,
    current: function () { return current; },
    onEnter: onEnter
  };

  /* ------------------------------ pass protocol -------------------------- */
  // Games dispatch x:stage-passed {detail:{n}}. The pip is marked cleared,
  // unlocked moves to n+1 and persists, and after ~900ms the player auto-
  // advances — unless they already walked away from the passed stage.
  function onStagePassed(e) {
    var d = e && e.detail ? e.detail : {};
    var n = parseInt(d.n, 10);
    if (isNaN(n) || n < 0 || n >= MAX_STAGE) return; // passes exist for 0..5
    if (n + 1 > unlocked) {
      unlocked = n + 1;
      persistUnlocked();
    }
    refreshPips();
    window.setTimeout(function () {
      if (current === n && !transition) go(n + 1);
    }, PASS_ADVANCE_MS);
  }

  /* ------------------------------ boot wiring ---------------------------- */

  function onBootDone() {
    if (document.body) document.body.classList.remove('x-preload');
    go(0);
  }

  // Integration drift recovery: if the overlay is gone but x:boot-done never
  // arrived, deal the title anyway. Never strands the player on a dead page.
  function bootWatchdog() {
    if (current !== -1) return;
    if (document.getElementById('x-boot')) {
      window.setTimeout(bootWatchdog, BOOT_RECHECK_MS); // overlay alive: wait
      return;
    }
    onBootDone();
  }

  function armBootWatchdog() {
    window.setTimeout(bootWatchdog, BOOT_WATCHDOG_MS);
  }

  /* ------------------------------ input guards --------------------------- */

  function isFormTarget(t) {
    if (!t || !t.tagName) return false;
    var tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           t.isContentEditable === true;
  }

  function isInteractiveTarget(t) {
    return !!(t && typeof t.closest === 'function' &&
              t.closest('a, button, input, textarea, select'));
  }

  function drawerOpen() {
    return !!(document.body && document.body.classList.contains('x-disc-lock'));
  }

  function bootUp() {
    return !!document.getElementById('x-boot');
  }

  /* -------------------------------- keyboard ----------------------------- */
  // ArrowLeft revisits (always, down to 0); ArrowRight advances through
  // next()'s gate; Enter on the title stage clicks INSERT COIN. The terminal
  // input, form fields, the open disclosures drawer and the boot overlay all
  // keep their keys. Arrows never scroll the (locked) page.
  function onKeydown(e) {
    if (!e || e.defaultPrevented) return; // boot overlay/drawer consumed it
    var key = e.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Enter') return;
    if (bootUp() || drawerOpen()) return;
    var t = e.target;
    if (isFormTarget(t)) return;

    if (key === 'Enter') {
      if (current === 0 && !isInteractiveTarget(t)) {
        var startBtn = document.getElementById('x-start-btn');
        if (startBtn) {
          e.preventDefault();
          startBtn.click();
        }
      }
      return;
    }

    e.preventDefault();
    if (key === 'ArrowLeft') {
      if (current > 0) go(current - 1);
    } else {
      next();
    }
  }

  /* ------------------------------- controls ------------------------------ */

  function initPips() {
    for (var i = 0; i <= MAX_STAGE; i++) {
      if (!pips[i]) continue;
      (function (idx, pip) {
        pip.addEventListener('click', function () {
          if (idx > unlocked || idx === current) return;
          go(idx);
        });
      })(i, pips[i]);
    }
  }

  function initStartButton() {
    var btn = document.getElementById('x-start-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { next(); });
  }

  function initHome() {
    var home = document.getElementById('x-home');
    if (!home) return;
    home.addEventListener('click', function (e) {
      e.preventDefault();
      go(0);
    });
  }

  // Replay the trials: wipe progression + clearance, deal the title again,
  // all without a reload. Terminal state is terminal.js's own concern.
  function restart() {
    storageRemove(STORAGE_UNLOCK);
    storageRemove(STORAGE_CLEARANCE);
    unlocked = 0;
    if (transition) abortTransition();
    refreshPips();
    go(0);
  }

  function initRestart() {
    var btn = document.getElementById('clear-restart');
    if (btn) btn.addEventListener('click', restart);
    document.addEventListener('x:replay', restart);
  }

  /* --------------------------------- swipe ------------------------------- */
  // Horizontal swipe > 48px: left = forward (same gate as ArrowRight),
  // right = revisit (same as ArrowLeft). Vertical-dominant gestures, form
  // fields, and the scrollable terminal/disclosures panels are left alone.
  function initSwipe() {
    var startX = 0;
    var startY = 0;
    var tracking = false;

    document.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
      var t = e.target;
      if (isFormTarget(t)) { tracking = false; return; }
      if (t && typeof t.closest === 'function' &&
          t.closest('.x-term-body, .x-disc-panel')) { tracking = false; return; }
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (bootUp() || drawerOpen()) return;
      var ch = e.changedTouches && e.changedTouches[0];
      if (!ch) return;
      var dx = ch.clientX - startX;
      var dy = ch.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN_PX) return;
      if (Math.abs(dx) < Math.abs(dy)) return; // vertical-ish: not a stage swipe
      if (dx < 0) next();
      else if (current > 0) go(current - 1);
    }, { passive: true });

    document.addEventListener('touchcancel', function () {
      tracking = false;
    }, { passive: true });
  }

  /* ------------------------------ scroll lock ---------------------------- */
  // The game never scrolls: overflow is hard-locked on html/body, and
  // touchmove is blocked everywhere except the two panels that legitimately
  // scroll their own content. Pinch (multi-touch) passes through.
  function initScrollLock() {
    if (document.documentElement) document.documentElement.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';
    document.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length > 1) return;
      var t = e.target;
      if (t && typeof t.closest === 'function' &&
          t.closest('.x-term-body, .x-disc-panel')) return;
      if (e.cancelable !== false) e.preventDefault();
    }, { passive: false });
  }

  /* ----------------------------- custom cursor --------------------------- */
  // Ported from v2 main.js: #x-cursor tracks the pointer instantly,
  // #x-cursor-ring trails with a lerp. CSS owns all visuals; JS only moves
  // the pair and toggles .is-hover over interactive elements. Disabled state
  // adds .x-no-cursor to <html> (CSS hides the pair, restores native cursor).
  function initCursor() {
    var dot = document.getElementById('x-cursor');
    var ring = document.getElementById('x-cursor-ring');
    if (!dot || !ring) return;

    var LERP = 0.16;
    var HOVER_SELECTOR = 'a, button, .x-btn';

    var tx = -100;
    var ty = -100; // pointer target
    var rx = -100;
    var ry = -100; // ring position
    var rafId = null;
    var active = false;
    var placed = false;

    function place(el, x, y) {
      el.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) translate(-50%, -50%)';
    }

    function loop() {
      rx += (tx - rx) * LERP;
      ry += (ty - ry) * LERP;
      place(ring, rx, ry);
      if (Math.abs(tx - rx) > 0.1 || Math.abs(ty - ry) > 0.1) {
        rafId = window.requestAnimationFrame(loop);
      } else {
        rafId = null; // ring settled: idle until the pointer moves again
      }
    }

    function onPointerMove(e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!placed) {
        placed = true; // first sighting: snap the ring, no corner fly-in
        rx = tx;
        ry = ty;
        place(ring, rx, ry);
      }
      place(dot, tx, ty); // dot tracks instantly
      if (rafId === null) rafId = window.requestAnimationFrame(loop);
    }

    function hoverTarget(node) {
      return node && typeof node.closest === 'function' ? node.closest(HOVER_SELECTOR) : null;
    }

    function onPointerOver(e) {
      var to = hoverTarget(e.target);
      if (!to) return;
      if (hoverTarget(e.relatedTarget) === to) return; // moving within target
      ring.classList.add('is-hover');
    }

    function onPointerOut(e) {
      var from = hoverTarget(e.target);
      if (!from) return;
      if (hoverTarget(e.relatedTarget) === from) return; // still inside it
      ring.classList.remove('is-hover');
    }

    function enable() {
      if (active) return;
      active = true;
      document.documentElement.classList.remove('x-no-cursor');
      window.addEventListener('mousemove', onPointerMove, { passive: true });
      document.addEventListener('mouseover', onPointerOver, { passive: true });
      document.addEventListener('mouseout', onPointerOut, { passive: true });
    }

    function disable() {
      document.documentElement.classList.add('x-no-cursor');
      if (!active) return;
      active = false;
      window.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseover', onPointerOver);
      document.removeEventListener('mouseout', onPointerOut);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      ring.classList.remove('is-hover');
    }

    function apply() {
      if (cursorOffMQ.matches) disable(); else enable();
    }

    apply();
    onMQChange(cursorOffMQ, apply); // live re-check (e.g. RM toggle mid-session)
  }

  /* -------------------------------- konami ------------------------------- */
  // Up Up Down Down Left Right Left Right B A: fx.js owns the particle burst
  // (window.XENITH_FX.burst), CSS owns body.x-konami chrome, and an x:konami
  // event goes out for the toast layer. Missing fx skips cleanly — an easter
  // egg, never a dependency.
  var KONAMI_SEQ = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a'
  ];

  function initKonami() {
    var progress = 0;
    var timer = null;

    function stopChrome() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (document.body) document.body.classList.remove('x-konami');
    }

    function fire() {
      var fx = window.XENITH_FX;
      if (!fx || typeof fx.burst !== 'function') return; // skip cleanly, no fx
      try {
        fx.burst();
      } catch (err) {
        // An fx failure must never take interactions down with it.
      }
      stopChrome(); // re-trigger inside the window: restart it cleanly
      if (document.body) document.body.classList.add('x-konami');
      timer = window.setTimeout(function () {
        timer = null;
        if (document.body) document.body.classList.remove('x-konami');
      }, 2000); // body.x-konami lives for exactly 2s
      document.dispatchEvent(new CustomEvent('x:konami'));
    }

    window.addEventListener('keydown', function (e) {
      var key = e.key;
      if (!key) return;
      if (key.length === 1) key = key.toLowerCase(); // b/a, shift- and caps-proof
      if (key === KONAMI_SEQ[progress]) {
        progress += 1;
      } else {
        // Mismatch: the key can still open a fresh attempt (e.g. 3rd Up).
        progress = key === KONAMI_SEQ[0] ? 1 : 0;
      }
      if (progress === KONAMI_SEQ.length) {
        progress = 0;
        fire();
      }
    }, { passive: true });

    // Hidden tab: end the chrome instead of parking a live timer.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopChrome();
    });
  }

  /* -------------------------------- typer -------------------------------- */
  // #x-typer rotates phrases from its data-phrases JSON (55ms type / 2.2s
  // hold / 28ms delete). The .x-typer-caret sibling is styled by CSS; only
  // the phrase text is swapped here. Reduced motion: static first phrase.
  function initTyper() {
    var el = document.getElementById('x-typer');
    if (!el) return;

    var parsed = null;
    try {
      parsed = JSON.parse(el.getAttribute('data-phrases') || '[]');
    } catch (err) {
      parsed = null; // malformed JSON: keep the server-rendered phrase
    }
    if (!parsed || !Array.isArray(parsed)) return;

    var list = [];
    for (var i = 0; i < parsed.length; i++) {
      if (typeof parsed[i] === 'string' && parsed[i].length > 0) list.push(parsed[i]);
    }
    if (list.length === 0) return;

    var TYPE_MS = 55;    // per character while typing
    var HOLD_MS = 2200;  // pause on a complete phrase
    var DELETE_MS = 28;  // per character while backspacing

    var index = 0;
    var pos = list[0].length;
    var mode = 'hold'; // 'hold' -> 'delete' -> 'type' -> 'hold' ...
    var timer = null;
    var running = false;

    function schedule(delay) {
      timer = window.setTimeout(step, delay);
    }

    function cancelScheduled() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function step() {
      timer = null;
      var phrase = list[index];

      if (mode === 'hold') {
        mode = 'delete';
        schedule(DELETE_MS);
        return;
      }

      if (mode === 'delete') {
        pos -= 1;
        if (pos <= 0) {
          pos = 0;
          index = (index + 1) % list.length;
          mode = 'type';
          el.textContent = '';
          schedule(TYPE_MS);
        } else {
          el.textContent = phrase.slice(0, pos);
          schedule(DELETE_MS);
        }
        return;
      }

      // mode === 'type'
      pos += 1;
      el.textContent = phrase.slice(0, pos);
      if (pos >= phrase.length) {
        mode = 'hold';
        schedule(HOLD_MS);
      } else {
        schedule(TYPE_MS);
      }
    }

    function start() {
      if (running) return;
      running = true;
      index = 0;
      pos = list[0].length;
      mode = 'hold';
      el.textContent = list[0];
      schedule(HOLD_MS); // first phrase is already on screen: hold, then rotate
    }

    function stop() {
      running = false;
      cancelScheduled();
      el.textContent = list[0]; // reduced motion: static first phrase, no loop
    }

    el.textContent = list[0];
    if (reduceMotionMQ.matches) stop(); else start();

    // React if the user toggles reduced motion mid-session.
    onMQChange(reduceMotionMQ, function () {
      if (reduceMotionMQ.matches) stop(); else start();
    });

    // Pause the rotation while the tab is hidden; resume gently on return.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        cancelScheduled();
      } else if (running && timer === null) {
        schedule(300);
      }
    });
  }

  /* --------------------------------- init -------------------------------- */

  function init() {
    collectDom();
    refreshPips(); // pips reflect restored xv_unlock before boot completes

    document.addEventListener('x:stage-passed', onStagePassed);
    document.addEventListener('x:boot-done', onBootDone, { once: true });
    window.addEventListener('keydown', onKeydown);

    if (document.readyState === 'complete') {
      armBootWatchdog();
    } else {
      window.addEventListener('load', armBootWatchdog, { once: true });
    }

    initPips();
    initStartButton();
    initHome();
    initRestart();
    initSwipe();
    initScrollLock();
    initCursor();
    initKonami();
    initTyper();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
