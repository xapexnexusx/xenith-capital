/* ============================================================================
   XENITH CAPITAL — assets/main.js
   v6 FIELD INSTRUMENT — scene manager + inspector (Lane 3). Vanilla JS,
   zero dependencies, single strict IIFE, zero globals. Full rewrite of the
   v5 scroll engine; the old file lives on only as history.

   Owns:
   - Scene manager: five full-viewport scenes (#x-scene-root .x-scene[1..5]),
     exactly one .is-active. show(n) runs the 400ms cross-transition: the
     outgoing scene keeps .is-active and gains .is-out (both lifted after
     400ms), the incoming scene gains .is-active + .is-in (.is-in lifted
     after 400ms). Any in-flight transition is force-completed before a new
     one starts, and pending cleanups flush early when the tab returns from
     hidden, so transition classes can never pile up. Reduced motion or a
     hidden tab: instant class swap, no transition classes, no timers.
   - Chrome sync on every scene change: rail .is-active (+aria-current),
     #x-field-label 'XC / FIELD 0N — NAME', #x-scene-pager '0N / 05', and
     XENITH_FX.morphTo(n-1) whenever the fx lane exposes it.
   - Input: wheel (700ms debounce, |deltaY| > 24 after line/page
     normalization, down=next up=prev, clamped 1..5), vertical touch swipe
     > 48px (vertical-dominant, up=next), ArrowUp/ArrowDown + PageUp/
     PageDown (400ms gesture gate; ignored with meta/ctrl/alt held, from
     inputs/textareas, while #x-disc is open, or from inside #x-terminal),
     rail button clicks, object card clicks. Wheel/touch listeners stay
     passive and never preventDefault, so the terminal and the disclosure
     drawer keep their native scroll.
   - Inspector: the OBJECTS copy model (contract copy deck, FINAL).
     renderObject swaps .xi-title/.xi-role/.xi-desc/.xi-system-v strictly
     WITHIN the active scene element (those classes repeat per scene),
     behind a 180ms .xi-fade for user selections, and maintains .is-sel
     (+aria-pressed) across the scene's .xo-card row. ArrowLeft/ArrowRight
     cycle with wrap on scenes 1-4 only. The first object is auto-selected
     on every scene enter, including first load — instant and silent.
     User selections (click/tap/arrow keys) dispatch the document event
     x:object-inspected {detail:{scene,obj}} and pulse the formation via
     XENITH_FX.pulse() when present.
   - Scene 4 facts: [data-count] numerals count up once on first enter
     (plain integers — 2021, no separators; .x-fact-word skipped; instant
     under reduced motion; an RM toggle mid-count lands final values).
   - Boot: x:boot-done -> lift body.x-preload + enter(1) with a single
     entrance run of .is-in. Failsafes: no #x-boot node -> boot next tick;
     absolute 8s cap. All navigation input is gated until booted.
   - Konami ↑↑↓↓←→←→ba: XENITH_FX.burst() + document event x:konami.
     Terminal section: no special handling (terminal.js self-boots on IO).
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ constants ------------------------------ */

  var SCENE_COUNT = 5;
  var TRANSITION_MS = 400;      // .is-in/.is-out window (xenith.css owns the look)
  var INSPECTOR_FADE_MS = 180;  // .xi-fade window (xenith.css owns the look)
  var WHEEL_DEBOUNCE_MS = 700;  // minimum gap between wheel-driven scene changes
  var WHEEL_MIN_DELTA = 24;     // |deltaY| must exceed this (px, after mode scaling)
  var SWIPE_MIN_PX = 48;        // vertical swipe distance must exceed this
  var GESTURE_GATE_MS = 400;    // repeat gate for key/swipe scene navigation
  var COUNT_MS = 1400;          // scene-4 numeral count-up duration
  var BOOT_FAILSAFE_MS = 8000;  // absolute cap: the console never stays locked

  var NAMES = [
    'PORTFOLIO ARCHITECTURE',
    'RESEARCH ENGINE',
    'RISK DOCTRINE',
    'THE FIRM',
    'UPLINK'
  ];

  // Inspector copy model — contract copy deck, FINAL. OBJECTS[scene] with
  // scene 1-based; scene 5 (UPLINK) carries the terminal, no objects. The
  // role line is the all-caps twin of the card's .xo-line, matching the
  // server-rendered inspector markup in index.html.
  var OBJECTS = [
    null,
    [ // 01 — PORTFOLIO ARCHITECTURE
      { name: 'Mandate',
        role: 'DEFINE THE JOB OF THE CAPITAL.',
        desc: 'Objectives, constraints, time horizon, liquidity needs, and risk tolerance are defined before holdings are selected.',
        system: 'Sets the portfolio’s purpose and operating boundaries.' },
      { name: 'Research',
        role: 'BUILD THE THESIS FROM EVIDENCE.',
        desc: 'Independent fundamental sources, cross-verified. Disconfirming evidence is weighted first.',
        system: 'Supplies the verified inputs construction may use.' },
      { name: 'Construction',
        role: 'SELECT, SIZE, AND COMBINE.',
        desc: 'Positions sized by conviction within the risk budget; correlation and concentration constrained.',
        system: 'Turns evidence into an allocation.' },
      { name: 'Review',
        role: 'TRACK THE CONDITIONS THAT MATTER.',
        desc: 'Thesis, constraints, and drift monitored at portfolio level.',
        system: 'Keeps the mandate honest over time.' }
    ],
    [ // 02 — RESEARCH ENGINE
      { name: 'Sources',
        role: 'COLLECT THE RAW MATERIAL.',
        desc: 'Filings, transcripts, macro data, primary documents. Independent inputs, cross-verified.',
        system: 'Grounds every thesis in primary evidence.' },
      { name: 'Signals',
        role: 'SCORE THESES AGAINST EVIDENCE.',
        desc: 'Theses scored against evidence, not headlines. Disconfirming data weighted first.',
        system: 'Ranks what deserves capital.' },
      { name: 'Synthesis',
        role: 'SEE THE WHOLE BOARD.',
        desc: 'Portfolio-level view: correlation, concentration, constraint interaction.',
        system: 'Catches what single theses miss.' },
      { name: 'Positions',
        role: 'SIZE BY CONVICTION, CONSTRAINED.',
        desc: 'Sized by conviction within the risk budget. Judgment retains final authority.',
        system: 'Turns signal into exposure.' }
    ],
    [ // 03 — RISK DOCTRINE
      { name: 'Risk Budget',
        role: 'ALLOCATED BEFORE RETURN TARGETS.',
        desc: 'The budget is committed before any position exists. A return target never writes a constraint.',
        system: 'Caps what the portfolio is allowed to lose.' },
      { name: 'Drawdown',
        role: 'SURVIVAL COMPOUNDS.',
        desc: 'Drawdown awareness over return chasing. The first rule of compounding is existing.',
        system: 'Keeps the portfolio alive to compound.' },
      { name: 'Liquidity',
        role: 'EXIT BEFORE ENTRY.',
        desc: 'Liquidity and concentration limits hold at all times. The exit is priced before the entry.',
        system: 'Prevents being trapped in own positions.' },
      { name: 'Concentration',
        role: 'NO SINGLE POINT OF FAILURE.',
        desc: 'Correlation and concentration constrained before return targets are set.',
        system: 'One bad node cannot sink the book.' }
    ],
    [ // 04 — THE FIRM
      { name: 'Independence',
        role: 'NO OUTSIDE AGENDA.',
        desc: 'Founder-owned, fee-aligned, answerable to clients and evidence — not to a parent company’s quarter.',
        system: 'Removes the conflicts structure usually hides.' },
      { name: 'Access',
        role: '1:1 WITH THE DECISION-MAKER.',
        desc: 'You speak with the person who makes the decision. No layers, no hand-offs.',
        system: 'Judgment is one call away.' },
      { name: 'Registration',
        role: 'TEXAS STATE SECURITIES BOARD.',
        desc: 'State-registered investment adviser, Austin, Texas. Records public on SEC IAPD, CRD #316844.',
        system: 'Accountable by statute and by record.' },
      { name: 'Alignment',
        role: 'BUILT AND DEFENDED BY ONE MIND.',
        desc: 'The same mind that builds the research defends the portfolio.',
        system: 'Incentives point one direction.' }
    ]
  ];

  var KONAMI_SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

  var reduceMotionMQ = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function onMQChange(mql, handler) {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handler); // legacy Safari
    }
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  /* -------------------------------- state -------------------------------- */

  var state = { current: 1, obj: 0 };
  var booted = false;

  var sceneEls = [];        // sceneEls[0] -> [data-scene="1"]
  var railBtns = [];
  var fieldLabelEl = null;
  var pagerEl = null;
  var discEl = null;

  /* --------------------- flushable transition timer pool ----------------- */
  // Transition cleanups (.is-in/.is-out/.xi-fade lifts) live here. A hidden
  // tab settles them immediately (nothing is visible anyway); a tab that
  // hides AFTER scheduling gets flushed on return, so no scene can return
  // to view wearing a stale transition class.

  var pending = [];

  function after(ms, fn) {
    if (document.hidden) { fn(); return; }
    var h = { id: 0, fn: fn };
    h.id = setTimeout(function () {
      var i = pending.indexOf(h);
      if (i !== -1) pending.splice(i, 1);
      fn();
    }, ms);
    pending.push(h);
  }

  function flushPending() {
    if (!pending.length) return;
    var list = pending.slice(0);
    pending.length = 0;
    for (var i = 0; i < list.length; i++) {
      clearTimeout(list[i].id);
      list[i].fn();
    }
  }

  function onVisibility() {
    if (!document.hidden) flushPending();
  }

  /* ------------------------------ fx bridge ------------------------------ */
  // XENITH_FX belongs to another lane and may be absent or still booting.
  // Every call is guarded and wrapped: a decorative effect never stops nav.

  function fxCall(method, arg) {
    try {
      var fx = window.XENITH_FX;
      if (fx && typeof fx[method] === 'function') {
        if (arg === undefined) fx[method]();
        else fx[method](arg);
      }
    } catch (err) { /* fx optional */ }
  }

  function dispatch(type, detail) {
    try {
      document.dispatchEvent(new CustomEvent(type, { detail: detail }));
    } catch (err) { /* a throwing listener must never take navigation down */ }
  }

  /* ------------------------------ chrome sync ---------------------------- */

  function syncChrome(n) {
    if (fieldLabelEl) {
      fieldLabelEl.textContent = 'XC / FIELD ' + pad2(n) + ' — ' + NAMES[n - 1];
    }
    if (pagerEl) {
      pagerEl.textContent = pad2(n) + ' / ' + pad2(SCENE_COUNT);
    }
    for (var i = 0; i < railBtns.length; i++) {
      var active = parseInt(railBtns[i].getAttribute('data-scene'), 10) === n;
      railBtns[i].classList.toggle('is-active', active);
      if (active) railBtns[i].setAttribute('aria-current', 'true');
      else railBtns[i].removeAttribute('aria-current');
    }
  }

  /* ------------------------------- inspector ----------------------------- */

  function setField(root, selector, text) {
    var el = root.querySelector(selector);
    if (el) el.textContent = text;
  }

  function applyInspector(insp, obj) {
    setField(insp, '.xi-title', obj.name);
    setField(insp, '.xi-role', obj.role);
    setField(insp, '.xi-desc', obj.desc);
    setField(insp, '.xi-system-v', obj.system);
  }

  // Renders object idx of sceneN into that scene's inspector. User-driven
  // renders fade the panel (180ms), fire x:object-inspected, and pulse the
  // formation; the auto-select on scene enter is instant and silent.
  function renderObject(sceneEl, sceneN, idx, viaUser) {
    var model = OBJECTS[sceneN];
    if (!sceneEl || !model || !model.length) return;
    var count = model.length;
    idx = ((idx % count) + count) % count; // wrap for arrow cycling
    state.obj = idx;
    var obj = model[idx];

    var cards = sceneEl.querySelectorAll('.xo-card');
    for (var i = 0; i < cards.length; i++) {
      var sel = cards[i].getAttribute('data-obj') === String(idx);
      cards[i].classList.toggle('is-sel', sel);
      cards[i].setAttribute('aria-pressed', sel ? 'true' : 'false');
    }

    var insp = sceneEl.querySelector('.x-insp');
    if (insp) {
      if (viaUser && !reduceMotionMQ.matches && !document.hidden) {
        insp.classList.add('xi-fade');
        after(INSPECTOR_FADE_MS, function () {
          applyInspector(insp, obj);
          insp.classList.remove('xi-fade');
        });
      } else {
        applyInspector(insp, obj);
      }
    }

    if (viaUser) {
      dispatch('x:object-inspected', { scene: sceneN, obj: obj.name });
      fxCall('pulse');
    }
  }

  /* -------------------------------- counters ----------------------------- */
  // Scene 4 facts: [data-count] counts from 0 to the attribute value once,
  // on the first enter. Plain integers (2021 is a year — no separators);
  // .x-fact-word entries are static wordmarks, skipped outright.

  var countersDone = false;
  var countActive = [];

  function finishCount(entry) {
    if (entry.raf !== null) {
      cancelAnimationFrame(entry.raf);
      entry.raf = null;
    }
    entry.el.textContent = String(entry.target);
    var i = countActive.indexOf(entry);
    if (i !== -1) countActive.splice(i, 1);
  }

  function runCount(el, target) {
    var entry = { el: el, target: target, raf: null, start: -1 };
    countActive.push(entry);

    function step(now) {
      entry.raf = null;
      if (entry.start < 0) entry.start = now;
      var t = (now - entry.start) / COUNT_MS;
      if (t >= 1) {
        finishCount(entry);
        return;
      }
      var eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.textContent = String(Math.round(target * eased));
      entry.raf = requestAnimationFrame(step);
    }

    entry.raf = requestAnimationFrame(step);
  }

  function runCounters(sceneEl) {
    if (countersDone || !sceneEl) return;
    countersDone = true;
    var els = sceneEl.querySelectorAll('[data-count]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList.contains('x-fact-word')) continue;
      var target = parseInt(el.getAttribute('data-count'), 10);
      if (isNaN(target) || target < 0) continue;
      if (reduceMotionMQ.matches) el.textContent = String(target);
      else runCount(el, target);
    }
  }

  /* ----------------------------- scene manager --------------------------- */

  function clampScene(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) return state.current;
    return Math.max(1, Math.min(SCENE_COUNT, n));
  }

  function show(n) {
    n = clampScene(n);
    var from = state.current;
    if (n === from) return;

    flushPending(); // an in-flight transition settles before the next begins
    state.current = n;

    var outEl = sceneEls[from - 1] || null;
    var inEl = sceneEls[n - 1] || null;
    var animate = !reduceMotionMQ.matches && !document.hidden;

    if (outEl) {
      if (animate) {
        // .is-active stays on for the exit window; both lift after 400ms.
        outEl.classList.add('is-out');
        after(TRANSITION_MS, function () {
          outEl.classList.remove('is-out');
          outEl.classList.remove('is-active');
        });
      } else {
        outEl.classList.remove('is-active');
      }
    }
    if (inEl) {
      inEl.classList.add('is-active');
      if (animate) {
        inEl.classList.add('is-in');
        after(TRANSITION_MS, function () {
          inEl.classList.remove('is-in');
        });
      }
    }

    syncChrome(n);
    fxCall('morphTo', n);

    if (inEl && OBJECTS[n]) renderObject(inEl, n, 0, false); // auto-select, silent
    if (n === 4) runCounters(inEl);
  }

  /* --------------------------------- boot -------------------------------- */

  function enterFirst() {
    var sceneEl = sceneEls[0] || null;
    state.current = 1;
    state.obj = 0;
    if (sceneEl) sceneEl.classList.add('is-active'); // idempotent with SSR
    syncChrome(1);
    fxCall('morphTo', 1);
    if (sceneEl && OBJECTS[1]) renderObject(sceneEl, 1, 0, false);
    if (sceneEl && !reduceMotionMQ.matches && !document.hidden) {
      // One entrance run, a frame after x-preload lifts so the CSS
      // transition is actually armed.
      requestAnimationFrame(function () {
        sceneEl.classList.add('is-in');
        after(TRANSITION_MS, function () {
          sceneEl.classList.remove('is-in');
        });
      });
    }
  }

  function onBootDone() {
    if (booted) return;
    booted = true;
    if (document.body) document.body.classList.remove('x-preload');
    enterFirst();
  }

  /* ------------------------------ input guards --------------------------- */

  function discOpen() {
    return !!(discEl && !discEl.hasAttribute('hidden'));
  }

  function inside(node, selector) {
    return !!(node && typeof node.closest === 'function' && node.closest(selector));
  }

  function isEditable(node) {
    if (!node) return false;
    var tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!node.isContentEditable;
  }

  /* --------------------------------- wheel ------------------------------- */

  var lastWheelAt = -WHEEL_DEBOUNCE_MS;

  function onWheel(e) {
    if (!booted || discOpen()) return;
    if (inside(e.target, '#x-terminal') || inside(e.target, '#x-disc') || inside(e.target, '.xs-panel-l') || inside(e.target, '.xs-panel-r')) return;
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33;                              // lines -> px
    else if (e.deltaMode === 2) dy *= (window.innerHeight || 800); // pages -> px
    if (Math.abs(dy) <= WHEEL_MIN_DELTA) return;
    var now = Date.now();
    if (now - lastWheelAt < WHEEL_DEBOUNCE_MS) return;
    var target = clampScene(state.current + (dy > 0 ? 1 : -1)); // down=next
    if (target === state.current) return; // clamped ends don't burn the debounce
    lastWheelAt = now;
    show(target);
  }

  /* --------------------------------- touch ------------------------------- */

  var touchX = 0;
  var touchY = 0;
  var touchTracking = false;
  var lastGestureNavAt = -GESTURE_GATE_MS;

  function onTouchStart(e) {
    touchTracking = false;
    if (!booted || discOpen()) return;
    if (!e.touches || e.touches.length !== 1) return;
    if (inside(e.target, '#x-terminal') || inside(e.target, '#x-disc') || inside(e.target, '.xs-panel-l') || inside(e.target, '.xs-panel-r')) return;
    touchTracking = true;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (!touchTracking) return;
    touchTracking = false;
    if (!e.changedTouches || !e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dy) <= SWIPE_MIN_PX) return;      // must exceed 48px
    if (Math.abs(dy) <= Math.abs(dx)) return;      // strictly vertical-dominant
    var now = Date.now();
    if (now - lastGestureNavAt < GESTURE_GATE_MS) return;
    var target = clampScene(state.current + (dy < 0 ? 1 : -1)); // swipe up = next
    if (target === state.current) return;
    lastGestureNavAt = now;
    show(target);
  }

  function onTouchCancel() {
    touchTracking = false;
  }

  /* -------------------------------- keyboard ----------------------------- */

  function onKeydown(e) {
    if (!booted || e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // never hijack OS/browser chords
    if (isEditable(e.target) || inside(e.target, '#x-terminal') || discOpen()) return;
    var k = e.key;

    if (k === 'ArrowDown' || k === 'PageDown' || k === 'ArrowUp' || k === 'PageUp') {
      e.preventDefault();
      var now = Date.now();
      if (now - lastGestureNavAt < GESTURE_GATE_MS) return;
      var dir = (k === 'ArrowDown' || k === 'PageDown') ? 1 : -1;
      var target = clampScene(state.current + dir);
      if (target === state.current) return;
      lastGestureNavAt = now;
      show(target);
      return;
    }

    if ((k === 'ArrowRight' || k === 'ArrowLeft') && OBJECTS[state.current]) {
      e.preventDefault();
      var sceneEl = sceneEls[state.current - 1];
      renderObject(sceneEl, state.current,
        state.obj + (k === 'ArrowRight' ? 1 : -1), true);
    }
  }

  /* --------------------------------- konami ------------------------------ */
  // ↑↑↓↓←→←→ b a — fx burst + toast via x:konami (game.js listens). Tracked
  // independently of scene navigation; arrows may also navigate, which is
  // part of the joke.

  var konamiProgress = 0;

  function onKonami(e) {
    if (!booted) return;
    if (isEditable(e.target) || inside(e.target, '#x-terminal') || discOpen()) {
      konamiProgress = 0;
      return;
    }
    var key = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konamiProgress = (key === KONAMI_SEQ[konamiProgress])
      ? konamiProgress + 1
      : (key === KONAMI_SEQ[0] ? 1 : 0);
    if (konamiProgress === KONAMI_SEQ.length) {
      konamiProgress = 0;
      fxCall('burst');
      dispatch('x:konami');
    }
  }

  /* ------------------------------ click wiring --------------------------- */

  function bindRail() {
    for (var i = 0; i < railBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (!booted) return;
          show(parseInt(btn.getAttribute('data-scene'), 10));
        });
      })(railBtns[i]);
    }
  }

  function bindCards() {
    for (var s = 0; s < sceneEls.length; s++) {
      (function (sceneEl, sceneN) {
        if (!sceneEl) return;
        var cards = sceneEl.querySelectorAll('.xo-card');
        for (var i = 0; i < cards.length; i++) {
          (function (card) {
            card.addEventListener('click', function () {
              if (!booted || sceneN !== state.current) return;
              var idx = parseInt(card.getAttribute('data-obj'), 10);
              if (isNaN(idx) || idx === state.obj) return; // re-tap: no-op
              renderObject(sceneEl, sceneN, idx, true);
            });
          })(cards[i]);
        }
      })(sceneEls[s], s + 1);
    }
  }

  /* --------------------------------- init -------------------------------- */

  function init() {
    sceneEls = [];
    var scenes = document.querySelectorAll('.x-scene');
    for (var i = 0; i < scenes.length; i++) {
      var n = parseInt(scenes[i].getAttribute('data-scene'), 10);
      if (n >= 1 && n <= SCENE_COUNT) sceneEls[n - 1] = scenes[i];
    }
    railBtns = document.querySelectorAll('.xr-item');
    fieldLabelEl = document.getElementById('x-field-label');
    pagerEl = document.getElementById('x-scene-pager');
    discEl = document.getElementById('x-disc');

    document.addEventListener('x:boot-done', onBootDone);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('keydown', onKonami);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });

    bindRail();
    bindCards();

    // Reduced motion toggled on mid-count: land on final values.
    onMQChange(reduceMotionMQ, function () {
      if (!reduceMotionMQ.matches) return;
      var list = countActive.slice(0);
      for (var i = 0; i < list.length; i++) finishCount(list[i]);
    });

    // Boot failsafes: the overlay lane missing entirely arms the console on
    // the next tick; otherwise an absolute cap backs up x:boot-done.
    if (!document.getElementById('x-boot')) setTimeout(onBootDone, 50);
    setTimeout(onBootDone, BOOT_FAILSAFE_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
