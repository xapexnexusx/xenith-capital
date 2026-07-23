/* ============================================================================
   XENITH CAPITAL — field navigation + scene state

   One global hierarchy:
   - #x-field-trigger opens the five-field map.
   - A committed field change morphs the formation and changes the scene.
   - Each scene's .xi-layer-tab list changes only its inspector and subsystem.
   - URL state is #field/layer; browser history traverses fields, not every
     layer inspection. The selected layer is retained independently per field.
   ========================================================================== */
(function () {
  'use strict';

  var SCENE_COUNT = 5;
  var TRANSITION_MS = 400;
  var INSPECTOR_SWAP_MS = 240;
  var WHEEL_DEBOUNCE_MS = 700;
  var WHEEL_MIN_DELTA = 24;
  var SWIPE_MIN_PX = 48;
  var GESTURE_GATE_MS = 400;
  var COUNT_MS = 1400;
  var BOOT_FAILSAFE_MS = 8000;
  var MENU_LEAVE_MS = 380;

  var NAMES = [
    'PORTFOLIO ARCHITECTURE',
    'RESEARCH ENGINE',
    'RISK DOCTRINE',
    'THE FIRM',
    'DIRECT CHANNEL'
  ];

  var SHORT_NAMES = ['ARCHITECTURE', 'RESEARCH', 'RISK', 'THE FIRM', 'CHANNEL'];
  var SCENE_SLUGS = ['architecture', 'research', 'risk', 'firm', 'channel'];
  var LAYER_SLUGS = [
    null,
    ['mandate', 'evidence', 'construction', 'review'],
    ['sources', 'signals', 'synthesis', 'positions'],
    ['risk-budget', 'drawdown', 'liquidity', 'concentration'],
    ['independence', 'access', 'continuity', 'alignment']
  ];

  var OBJECTS = [
    null,
    [
      { name: 'Mandate', question: 'What must the capital accomplish?', operation: 'Objectives, constraints, horizon, liquidity, tax context, and risk tolerance are defined before securities enter the conversation.', effect: 'Narrows the opportunity set before preference can distort it.' },
      { name: 'Evidence', question: 'What evidence earns consideration?', operation: 'Independent fundamental sources are cross-verified, with the strongest disconfirming evidence tested before conviction advances.', effect: 'Limits construction to theses that survive a real countercase.' },
      { name: 'Construction', question: 'What role does each position serve?', operation: 'Selection, size, concentration, correlation, and portfolio fit are decided together rather than security by security.', effect: 'Turns individual theses into one coherent allocation.' },
      { name: 'Review', question: 'What evidence would change the decision?', operation: 'Thesis conditions, portfolio drift, and mandate constraints remain visible after capital is committed.', effect: 'Makes revision evidence-led instead of reactionary.' }
    ],
    [
      { name: 'Sources', question: 'What is known first-hand?', operation: 'Filings, transcripts, macro data, and primary documents establish the evidence base before interpretation begins.', effect: 'Separates observable fact from inherited narrative.' },
      { name: 'Signals', question: 'Which changes are decision-relevant?', operation: 'Evidence is tested for durability, materiality, and contradiction rather than rewarded for novelty or volume.', effect: 'Ranks what deserves deeper work—and what should stop.' },
      { name: 'Synthesis', question: 'How do the pieces interact?', operation: 'Company evidence is placed beside valuation, macro regime, correlation, concentration, and mandate constraints.', effect: 'Exposes portfolio consequences that a standalone thesis cannot.' },
      { name: 'Positions', question: 'How much conviction has been earned?', operation: 'Evidence strength informs size only inside the portfolio’s risk, liquidity, and concentration boundaries.', effect: 'Translates research into exposure without surrendering judgment.' }
    ],
    [
      { name: 'Risk Budget', question: 'How much loss can the mandate absorb?', operation: 'The portfolio’s risk capacity is defined before position-level return expectations are allowed to influence size.', effect: 'Turns tolerance into a construction boundary.' },
      { name: 'Drawdown', question: 'What can break the compounding path?', operation: 'Scenario behavior and recovery requirements are considered before an attractive upside case can dominate the decision.', effect: 'Protects the mandate from losses it cannot practically endure.' },
      { name: 'Liquidity', question: 'Can the position be changed when the thesis changes?', operation: 'Exit conditions, market depth, account size, and implementation constraints are evaluated before entry.', effect: 'Keeps judgment actionable when evidence moves.' },
      { name: 'Concentration', question: 'Where can one error become a portfolio error?', operation: 'Position weight, shared drivers, and role overlap are tested across the full portfolio rather than in isolation.', effect: 'Contains the damage one incorrect thesis can create.' }
    ],
    [
      { name: 'Independence', question: 'Who sets the agenda?', operation: 'No parent platform or product shelf dictates the portfolio. Evidence and the mandate determine the opportunity set.', effect: 'Reduces structural pressure to own what does not belong.' },
      { name: 'Access', question: 'Who explains the decision?', operation: 'The person with decision authority is the person accountable for the rationale. There is no service layer between them.', effect: 'Questions travel directly to judgment.' },
      { name: 'Continuity', question: 'What keeps the process coherent?', operation: 'Research, construction, monitoring, and explanation remain inside one accountable investment process.', effect: 'Preserves the thesis from origin through review.' },
      { name: 'Alignment', question: 'What is the firm built to serve?', operation: 'The operating structure centers the advisory mandate rather than transactions, proprietary products, or asset gathering.', effect: 'Keeps decision ownership attached to the portfolio.' }
    ]
  ];

  var KONAMI_SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var reduceMotionMQ = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  var fineHoverMQ = window.matchMedia
    ? window.matchMedia('(hover: hover) and (pointer: fine)')
    : { matches: false };

  var state = { current: 1, obj: 0, layers: [0, 0, 0, 0, 0, 0] };
  var initialRoute = null;
  var booted = false;
  var sceneEls = [];
  var fieldBtns = [];
  var fieldLabelEl = null;
  var pagerEl = null;
  var discEl = null;
  var fieldNavEl = null;
  var fieldTriggerEl = null;
  var fieldMenuEl = null;
  var navIndexEl = null;
  var navNameEl = null;
  var fieldProgressEl = null;
  var menuOpen = false;
  var menuPinned = false;
  var menuLeaveTimer = 0;
  var restoringLocation = false;
  var pending = [];

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function onMQChange(mql, handler) {
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', handler);
    else if (typeof mql.addListener === 'function') mql.addListener(handler);
  }

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

  function fxCall(method, arg) {
    try {
      var fx = window.XENITH_FX;
      if (fx && typeof fx[method] === 'function') {
        if (arg === undefined) fx[method]();
        else fx[method](arg);
      }
    } catch (err) { /* decorative effects never own navigation */ }
  }

  function dispatch(type, detail) {
    try { document.dispatchEvent(new CustomEvent(type, { detail: detail })); }
    catch (err) { /* listeners are isolated from navigation */ }
  }

  function clampScene(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) return state.current;
    return Math.max(1, Math.min(SCENE_COUNT, n));
  }

  function currentLayerIndex(sceneN) {
    var model = OBJECTS[sceneN];
    if (!model) return 0;
    var idx = parseInt(state.layers[sceneN], 10);
    if (isNaN(idx) || idx < 0 || idx >= model.length) idx = 0;
    return idx;
  }

  function routeHash(sceneN, layerIndex) {
    var hash = '#' + SCENE_SLUGS[sceneN - 1];
    if (OBJECTS[sceneN]) hash += '/' + LAYER_SLUGS[sceneN][layerIndex];
    return hash;
  }

  function parseRoute(hash) {
    var raw = String(hash || '').replace(/^#/, '').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!raw) return { scene: 1, layer: 0, explicit: false };
    var parts = raw.split('/');
    var aliases = {
      's-architecture': 'architecture',
      's-research': 'research',
      's-doctrine': 'risk',
      's-firm': 'firm',
      'uplink': 'channel'
    };
    var field = aliases[parts[0]] || parts[0];
    var sceneN = SCENE_SLUGS.indexOf(field) + 1;
    if (sceneN < 1) return { scene: 1, layer: 0, explicit: false };
    var layer = 0;
    if (OBJECTS[sceneN] && parts[1]) {
      var found = LAYER_SLUGS[sceneN].indexOf(parts[1]);
      if (found >= 0) layer = found;
    }
    return { scene: sceneN, layer: layer, explicit: true };
  }

  function writeRoute(mode) {
    if (restoringLocation || !window.history || typeof window.history[mode + 'State'] !== 'function') return;
    var hash = routeHash(state.current, currentLayerIndex(state.current));
    if (window.location.hash === hash && mode === 'replace') return;
    window.history[mode + 'State']({ xenith: true, scene: state.current }, '',
      window.location.pathname + window.location.search + hash);
  }

  function syncChrome(n) {
    var layerIndex = currentLayerIndex(n);
    var layer = OBJECTS[n] ? OBJECTS[n][layerIndex].name.toUpperCase() : '';
    if (fieldLabelEl) {
      fieldLabelEl.textContent = 'FIELD ' + pad2(n) + ' / ' + SHORT_NAMES[n - 1] +
        (layer ? ' · LAYER ' + pad2(layerIndex + 1) + ' / ' + layer : '');
    }
    if (pagerEl) pagerEl.textContent = pad2(n) + ' / ' + pad2(SCENE_COUNT);
    if (navIndexEl) navIndexEl.textContent = pad2(n);
    if (navNameEl) navNameEl.textContent = SHORT_NAMES[n - 1];
    if (fieldProgressEl) fieldProgressEl.textContent = pad2(n) + ' / ' + pad2(SCENE_COUNT);
    for (var i = 0; i < fieldBtns.length; i++) {
      var active = parseInt(fieldBtns[i].getAttribute('data-scene'), 10) === n;
      fieldBtns[i].classList.toggle('is-active', active);
      if (active) fieldBtns[i].setAttribute('aria-current', 'page');
      else fieldBtns[i].removeAttribute('aria-current');
    }
  }

  function setField(root, selector, text) {
    var el = root.querySelector(selector);
    if (el) el.textContent = text;
  }

  function applyInspector(sceneEl, sceneN, idx, obj) {
    var insp = sceneEl.querySelector('.x-insp');
    var content = sceneEl.querySelector('.xi-content');
    if (!insp || !content) return;
    setField(content, '.xi-head', NAMES[sceneN - 1] + ' / ' + obj.name.toUpperCase());
    setField(content, '.xi-title', obj.name);
    setField(content, '.xi-role', obj.question);
    setField(content, '.xi-desc', obj.operation);
    setField(content, '.xi-system-v', obj.effect);
    setField(insp, '.xi-nav-count', pad2(idx + 1) + ' / ' + pad2(OBJECTS[sceneN].length));
    var tab = sceneEl.querySelector('.xi-layer-tab[data-obj="' + idx + '"]');
    if (tab && tab.id) content.setAttribute('aria-labelledby', tab.id);
  }

  function animateInspector(sceneEl) {
    var content = sceneEl.querySelector('.xi-content');
    if (!content || reduceMotionMQ.matches || document.hidden) return;
    content.classList.remove('xi-swap');
    void content.offsetWidth;
    content.classList.add('xi-swap');
    after(INSPECTOR_SWAP_MS, function () { content.classList.remove('xi-swap'); });
  }

  function renderObject(sceneEl, sceneN, idx, options) {
    options = options || {};
    var model = OBJECTS[sceneN];
    if (!sceneEl || !model || !model.length) return;
    idx = ((idx % model.length) + model.length) % model.length;
    state.obj = idx;
    state.layers[sceneN] = idx;

    var tabs = sceneEl.querySelectorAll('.xi-layer-tab');
    for (var i = 0; i < tabs.length; i++) {
      var selected = tabs[i].getAttribute('data-obj') === String(idx);
      tabs[i].classList.toggle('is-sel', selected);
      tabs[i].setAttribute('aria-selected', selected ? 'true' : 'false');
      tabs[i].setAttribute('tabindex', selected ? '0' : '-1');
    }

    var obj = model[idx];
    applyInspector(sceneEl, sceneN, idx, obj); // semantic state changes atomically
    syncChrome(sceneN);
    if (options.animate) animateInspector(sceneEl);
    if (options.user || options.focus) {
      dispatch('x:layer-selected', { scene: sceneN, index: idx, obj: obj.name });
    }
    if (options.user) {
      writeRoute('replace');
    }
  }

  var countersDone = false;
  var countActive = [];

  function finishCount(entry) {
    if (entry.raf !== null) cancelAnimationFrame(entry.raf);
    entry.raf = null;
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
      if (t >= 1) { finishCount(entry); return; }
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      entry.raf = requestAnimationFrame(step);
    }
    entry.raf = requestAnimationFrame(step);
  }

  function runCounters(sceneEl) {
    if (countersDone || !sceneEl) return;
    countersDone = true;
    var els = sceneEl.querySelectorAll('[data-count]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].classList.contains('x-fact-word')) continue;
      var target = parseInt(els[i].getAttribute('data-count'), 10);
      if (isNaN(target) || target < 0) continue;
      if (reduceMotionMQ.matches) els[i].textContent = String(target);
      else runCount(els[i], target);
    }
  }

  function syncSceneAccess(n) {
    for (var i = 0; i < sceneEls.length; i++) {
      var active = i === n - 1;
      if (!sceneEls[i]) continue;
      if (active) {
        sceneEls[i].removeAttribute('aria-hidden');
        sceneEls[i].removeAttribute('inert');
      } else {
        sceneEls[i].setAttribute('aria-hidden', 'true');
        sceneEls[i].setAttribute('inert', '');
      }
    }
  }

  function show(n, options) {
    options = options || {};
    n = clampScene(n);
    var from = state.current;
    if (n === from) {
      if (OBJECTS[n]) renderObject(sceneEls[n - 1], n, currentLayerIndex(n), { animate: false });
      syncChrome(n);
      return;
    }

    flushPending();
    state.current = n;
    state.obj = currentLayerIndex(n);
    syncSceneAccess(n);
    var outEl = sceneEls[from - 1] || null;
    var inEl = sceneEls[n - 1] || null;
    var animate = options.animate !== false && !reduceMotionMQ.matches && !document.hidden;

    if (outEl) {
      if (animate) {
        outEl.classList.add('is-out');
        after(TRANSITION_MS, function () {
          outEl.classList.remove('is-out');
          outEl.classList.remove('is-active');
        });
      } else {
        outEl.classList.remove('is-active', 'is-in', 'is-out');
      }
    }
    if (inEl) {
      inEl.classList.add('is-active');
      if (animate) {
        inEl.classList.add('is-in');
        after(TRANSITION_MS, function () { inEl.classList.remove('is-in'); });
      }
    }

    syncChrome(n);
    fxCall('morphTo', n); // a morph means one thing: committed field change
    if (inEl && OBJECTS[n]) renderObject(inEl, n, currentLayerIndex(n), { animate: false, focus: true });
    if (n === 4) runCounters(inEl);
    dispatch('x:field-selected', { scene: n, name: SHORT_NAMES[n - 1] });
    if (options.history === 'push') writeRoute('push');
    else if (options.history === 'replace') writeRoute('replace');
  }

  function setFieldMenu(open, pinned) {
    if (!fieldMenuEl || !fieldTriggerEl || !fieldNavEl) return;
    clearTimeout(menuLeaveTimer);
    menuLeaveTimer = 0;
    menuOpen = !!open;
    menuPinned = menuOpen && !!pinned;
    fieldNavEl.classList.toggle('is-open', menuOpen);
    fieldMenuEl.classList.toggle('is-open', menuOpen);
    /* the veil blurs the console behind the open map (#x-veil, xenith.css) */
    document.body.classList.toggle('x-map-open', menuOpen);
    fieldTriggerEl.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    fieldTriggerEl.setAttribute('aria-label', menuOpen ? 'Close field map' : 'Open field map');
    fieldMenuEl.setAttribute('aria-hidden', menuOpen ? 'false' : 'true');
    if (menuOpen) fieldMenuEl.removeAttribute('inert');
    else fieldMenuEl.setAttribute('inert', '');
    dispatch('x:map-toggled', { open: menuOpen }); /* sound lane listens */
  }

  function openFieldMenu(pinned) { setFieldMenu(true, pinned); }

  function closeFieldMenu(returnFocus) {
    if (!menuOpen) return;
    if (returnFocus && fieldTriggerEl) fieldTriggerEl.focus();
    else if (fieldMenuEl && fieldMenuEl.contains(document.activeElement) && fieldTriggerEl) fieldTriggerEl.focus();
    setFieldMenu(false, false);
  }

  function scheduleMenuClose() {
    if (menuPinned) return;
    clearTimeout(menuLeaveTimer);
    menuLeaveTimer = setTimeout(function () { closeFieldMenu(false); }, MENU_LEAVE_MS);
  }

  function enterInitial() {
    var route = initialRoute || parseRoute(window.location.hash);
    state.current = route.scene;
    state.layers[route.scene] = route.layer;
    state.obj = route.layer;
    for (var i = 0; i < sceneEls.length; i++) {
      if (sceneEls[i]) sceneEls[i].classList.remove('is-active', 'is-in', 'is-out');
    }
    var sceneEl = sceneEls[state.current - 1] || null;
    if (sceneEl) sceneEl.classList.add('is-active');
    syncSceneAccess(state.current);
    syncChrome(state.current);
    fxCall('morphTo', state.current);
    if (sceneEl && OBJECTS[state.current]) renderObject(sceneEl, state.current, route.layer, { animate: false, focus: true });
    if (state.current === 4) runCounters(sceneEl);
    dispatch('x:field-selected', { scene: state.current, name: SHORT_NAMES[state.current - 1] });
    writeRoute('replace');
    if (sceneEl && !reduceMotionMQ.matches && !document.hidden) {
      requestAnimationFrame(function () {
        sceneEl.classList.add('is-in');
        after(TRANSITION_MS, function () { sceneEl.classList.remove('is-in'); });
      });
    }
  }

  function onBootDone() {
    if (booted) return;
    booted = true;
    if (document.body) document.body.classList.remove('x-preload');
    if (fieldTriggerEl) fieldTriggerEl.removeAttribute('disabled');
    enterInitial();
  }

  function discOpen() { return !!(discEl && !discEl.hasAttribute('hidden')); }
  function inside(node, selector) { return !!(node && typeof node.closest === 'function' && node.closest(selector)); }
  function isEditable(node) {
    if (!node) return false;
    var tag = node.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!node.isContentEditable;
  }
  function blocksSceneGesture(node) {
    return inside(node, '#x-terminal, #x-disc, #x-field-nav, .xs-panel-l, .xs-panel-r, button, a, input, textarea, select, [role="tablist"]');
  }

  var lastWheelAt = -WHEEL_DEBOUNCE_MS;
  function onWheel(e) {
    if (!booted || discOpen() || menuOpen || blocksSceneGesture(e.target)) return;
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33;
    else if (e.deltaMode === 2) dy *= (window.innerHeight || 800);
    if (Math.abs(dy) <= WHEEL_MIN_DELTA) return;
    var now = Date.now();
    if (now - lastWheelAt < WHEEL_DEBOUNCE_MS) return;
    var target = clampScene(state.current + (dy > 0 ? 1 : -1));
    if (target === state.current) return;
    lastWheelAt = now;
    show(target, { history: 'push' });
  }

  var touchX = 0;
  var touchY = 0;
  var touchTracking = false;
  var lastGestureNavAt = -GESTURE_GATE_MS;
  function onTouchStart(e) {
    touchTracking = false;
    if (!booted || discOpen() || menuOpen || !e.touches || e.touches.length !== 1 || blocksSceneGesture(e.target)) return;
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
    if (Math.abs(dy) <= SWIPE_MIN_PX || Math.abs(dy) <= Math.abs(dx)) return;
    var now = Date.now();
    if (now - lastGestureNavAt < GESTURE_GATE_MS) return;
    var target = clampScene(state.current + (dy < 0 ? 1 : -1));
    if (target === state.current) return;
    lastGestureNavAt = now;
    show(target, { history: 'push' });
  }

  function onKeydown(e) {
    if (!booted || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditable(e.target) || inside(e.target, '#x-terminal, #x-field-nav, .xi-tabs') || discOpen() || menuOpen) return;
    var k = e.key;
    /* number row: 1-5 jumps straight to a field */
    if (k >= '1' && k <= '5') {
      e.preventDefault();
      var direct = parseInt(k, 10);
      if (direct !== state.current) show(direct, { history: 'push' });
      return;
    }
    if (k !== 'ArrowDown' && k !== 'PageDown' && k !== 'ArrowUp' && k !== 'PageUp') return;
    e.preventDefault();
    var now = Date.now();
    if (now - lastGestureNavAt < GESTURE_GATE_MS) return;
    var target = clampScene(state.current + ((k === 'ArrowDown' || k === 'PageDown') ? 1 : -1));
    if (target === state.current) return;
    lastGestureNavAt = now;
    show(target, { history: 'push' });
  }

  var konamiProgress = 0;
  function onKonami(e) {
    if (!booted) return;
    if (isEditable(e.target) || inside(e.target, '#x-terminal') || discOpen()) { konamiProgress = 0; return; }
    var key = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konamiProgress = key === KONAMI_SEQ[konamiProgress]
      ? konamiProgress + 1
      : (key === KONAMI_SEQ[0] ? 1 : 0);
    if (konamiProgress === KONAMI_SEQ.length) {
      konamiProgress = 0;
      fxCall('burst');
      dispatch('x:konami');
    }
  }

  function bindFieldMenu() {
    if (!fieldNavEl || !fieldTriggerEl || !fieldMenuEl) return;
    fieldTriggerEl.addEventListener('click', function () {
      if (!booted) return;
      if (!menuOpen) openFieldMenu(true);
      else if (menuPinned) closeFieldMenu(false);
      else openFieldMenu(true);
    });
    fieldTriggerEl.addEventListener('keydown', function (e) {
      var key = e.key;
      if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
      e.preventDefault();
      if (!booted || !fieldBtns.length) return;
      openFieldMenu(true);
      var idx = (key === 'ArrowUp' || key === 'End') ? fieldBtns.length - 1 : 0;
      fieldBtns[idx].focus();
    });
    fieldNavEl.addEventListener('mouseenter', function () {
      if (!fineHoverMQ.matches) return;
      /* re-entry MUST cancel any pending leave-close, or the menu closes
         under a cursor that already came back */
      clearTimeout(menuLeaveTimer);
      menuLeaveTimer = 0;
      if (booted && !menuOpen) openFieldMenu(false);
    });
    fieldNavEl.addEventListener('mouseleave', function () {
      if (fineHoverMQ.matches) scheduleMenuClose();
    });
    fieldNavEl.addEventListener('focusin', function () {
      clearTimeout(menuLeaveTimer);
      menuLeaveTimer = 0;
      if (booted && !menuOpen) openFieldMenu(false);
    });
    fieldNavEl.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!fieldNavEl.contains(document.activeElement)) closeFieldMenu(false);
      }, 0);
    });

    for (var i = 0; i < fieldBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (!booted) return;
          var n = parseInt(btn.getAttribute('data-scene'), 10);
          var changed = n !== state.current;
          show(n, { history: changed ? 'push' : null });
          closeFieldMenu(true);
        });
        btn.addEventListener('keydown', function (e) {
          var key = e.key;
          if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
          e.preventDefault();
          var idx = Array.prototype.indexOf.call(fieldBtns, btn);
          if (key === 'Home') idx = 0;
          else if (key === 'End') idx = fieldBtns.length - 1;
          else idx = (idx + (key === 'ArrowDown' ? 1 : -1) + fieldBtns.length) % fieldBtns.length;
          fieldBtns[idx].focus();
        });
      })(fieldBtns[i]);
    }

    document.addEventListener('pointerdown', function (e) {
      if (menuOpen && !fieldNavEl.contains(e.target)) closeFieldMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) {
        e.preventDefault();
        closeFieldMenu(true);
      }
    });
    /* command-surface toggle: ⌘K / Ctrl+K opens the field map pinned */
    document.addEventListener('keydown', function (e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || (e.key !== 'k' && e.key !== 'K')) return;
      if (!booted || discOpen()) return;
      e.preventDefault();
      if (menuOpen) {
        closeFieldMenu(true);
      } else {
        openFieldMenu(true);
        if (fieldBtns.length) fieldBtns[0].focus();
      }
    });
  }

  function bindLayerTabs() {
    for (var s = 1; s <= SCENE_COUNT; s++) {
      (function (sceneEl, sceneN) {
        if (!sceneEl || !OBJECTS[sceneN]) return;
        var tabs = sceneEl.querySelectorAll('.xi-layer-tab');
        for (var i = 0; i < tabs.length; i++) {
          (function (tab) {
            tab.addEventListener('click', function () {
              if (!booted || sceneN !== state.current) return;
              var idx = parseInt(tab.getAttribute('data-obj'), 10);
              if (isNaN(idx) || idx === currentLayerIndex(sceneN)) return;
              renderObject(sceneEl, sceneN, idx, { user: true, animate: true });
            });
            tab.addEventListener('keydown', function (e) {
              var key = e.key;
              if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return;
              e.preventDefault();
              e.stopPropagation();
              var idx = Array.prototype.indexOf.call(tabs, tab);
              if (key === 'Home') idx = 0;
              else if (key === 'End') idx = tabs.length - 1;
              else idx = (idx + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              renderObject(sceneEl, sceneN, idx, { user: true, animate: true });
              tabs[idx].focus();
            });
          })(tabs[i]);
        }
      })(sceneEls[s - 1], s);
    }
  }

  function restoreFromLocation() {
    var route = parseRoute(window.location.hash);
    if (!booted) { initialRoute = route; return; }
    restoringLocation = true;
    state.layers[route.scene] = route.layer;
    if (route.scene === state.current) {
      state.obj = route.layer;
      renderObject(sceneEls[route.scene - 1], route.scene, route.layer, { animate: false, focus: true });
    } else {
      show(route.scene, { animate: true });
    }
    restoringLocation = false;
    writeRoute('replace');
  }

  function init() {
    var scenes = document.querySelectorAll('.x-scene');
    for (var i = 0; i < scenes.length; i++) {
      var n = parseInt(scenes[i].getAttribute('data-scene'), 10);
      if (n >= 1 && n <= SCENE_COUNT) sceneEls[n - 1] = scenes[i];
    }
    fieldBtns = document.querySelectorAll('.xfm-item');
    fieldLabelEl = document.getElementById('x-field-label');
    pagerEl = document.getElementById('x-scene-pager');
    discEl = document.getElementById('x-disc');
    fieldNavEl = document.getElementById('x-field-nav');
    fieldTriggerEl = document.getElementById('x-field-trigger');
    fieldMenuEl = document.getElementById('x-field-menu');
    navIndexEl = document.getElementById('x-nav-index');
    navNameEl = document.getElementById('x-nav-name');
    fieldProgressEl = document.getElementById('x-field-progress');
    initialRoute = parseRoute(window.location.hash);
    state.layers[initialRoute.scene] = initialRoute.layer;

    bindFieldMenu();
    bindLayerTabs();
    document.addEventListener('x:boot-done', onBootDone);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('keydown', onKonami);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) flushPending(); });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', function () { touchTracking = false; }, { passive: true });
    window.addEventListener('popstate', restoreFromLocation);
    window.addEventListener('hashchange', restoreFromLocation);
    /* cross-lane navigation contract: terminal.js 'go <field>' dispatches this */
    document.addEventListener('x:navigate', function (e) {
      if (!booted || !e || !e.detail) return;
      var n = clampScene(e.detail.scene);
      if (n !== state.current) show(n, { history: 'push' });
    });

    onMQChange(reduceMotionMQ, function () {
      if (!reduceMotionMQ.matches) return;
      var list = countActive.slice(0);
      for (var i = 0; i < list.length; i++) finishCount(list[i]);
    });
    onMQChange(fineHoverMQ, function () { if (!fineHoverMQ.matches && menuOpen && !menuPinned) closeFieldMenu(false); });

    if (!document.getElementById('x-boot')) setTimeout(onBootDone, 50);
    setTimeout(onBootDone, BOOT_FAILSAFE_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
