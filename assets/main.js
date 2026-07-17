/* ============================================================================
   XENITH CAPITAL — assets/main.js
   Core interactions (Agent C, v2 intensity pass). Vanilla JS, zero
   dependencies, single IIFE. Exposes nothing globally.
   v1 (preserved): hero typewriter rotator, scroll-reveal system, animated
   counters, custom cursor (instant dot + lerped ring), nav scroll state,
   smooth anchor scrolling, x-preload gate, IO and reduced-motion fallbacks.
   v2 (added): per-letter split titles (.xl / --i), signal-tape content clone,
   left scroll rail (active section dot + progress height), card tilt, and
   magnetic buttons.
   Honors prefers-reduced-motion in every animation path and idles timed work
   while the tab is hidden (rAF paths idle automatically).
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ shared state --------------------------- */

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

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // 4-digit years up to 2100 render plain: 2021, never 2,021.
  function isYearValue(n) {
    return isFinite(n) && Math.floor(n) === n && n >= 1000 && n <= 2100;
  }

  /* ------------------------------ typewriter ----------------------------- */
  // #x-typer rotates phrases from its data-phrases JSON. The .x-typer-caret
  // sibling is styled and blinked by CSS; only the phrase text is swapped here.
  function initTypewriter() {
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

  /* --------------------------- reveals + counters ------------------------ */

  function setCounterFinal(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;
    el.textContent = isYearValue(target) ? String(target) : target.toLocaleString('en-US');
  }

  function animateCounter(el) {
    if (el.getAttribute('data-counted') === '1') return;
    el.setAttribute('data-counted', '1');

    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;

    if (reduceMotionMQ.matches) {
      setCounterFinal(el);
      return;
    }

    var isYear = isYearValue(target);
    var DURATION = 1400;
    var startTime = null;

    function frame(now) {
      if (startTime === null) startTime = now;
      var t = Math.min((now - startTime) / DURATION, 1);
      var v = Math.round(target * easeOutCubic(t));
      el.textContent = isYear ? String(v) : v.toLocaleString('en-US');
      if (t < 1) {
        window.requestAnimationFrame(frame);
      } else {
        setCounterFinal(el); // land on the exact target
      }
    }
    window.requestAnimationFrame(frame);
  }

  // Reveal one element and flag any .x-title it contains: when a parent
  // .x-section-head reveals, its title gets .is-visible so CSS can stagger
  // the v2 .xl letters in. Harmless for titles that were never split.
  function revealElement(el) {
    el.classList.add('is-visible');
    var titles = el.querySelectorAll('.x-title');
    for (var t = 0; t < titles.length; t++) {
      titles[t].classList.add('is-visible');
    }
  }

  function initReveals() {
    var revealEls = document.querySelectorAll('[data-reveal]');

    // [data-count] drives the counter; .x-fact-word values are static text.
    var counterEls = [];
    var counted = document.querySelectorAll('[data-count]');
    for (var i = 0; i < counted.length; i++) {
      if (!counted[i].classList.contains('x-fact-word')) counterEls.push(counted[i]);
    }

    // No IntersectionObserver: show everything immediately.
    if (!('IntersectionObserver' in window)) {
      for (var j = 0; j < revealEls.length; j++) {
        revealElement(revealEls[j]);
      }
      counterEls.forEach(setCounterFinal);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        if (el.hasAttribute('data-reveal')) revealElement(el);
        if (el.hasAttribute('data-count') && !el.classList.contains('x-fact-word')) {
          animateCounter(el);
        }
        io.unobserve(el); // one-shot
      });
    }, { threshold: 0.15 });

    for (var k = 0; k < revealEls.length; k++) io.observe(revealEls[k]);
    counterEls.forEach(function (el) { io.observe(el); });
  }

  /* ----------------------------- custom cursor --------------------------- */
  // #x-cursor tracks the pointer instantly; #x-cursor-ring trails with a
  // lerp. CSS owns all visuals; JS only moves the pair and toggles .is-hover
  // on the ring over interactive elements. Disabled state adds .x-no-cursor
  // to <html> (CSS hides the pair and restores the native cursor).
  function initCursor() {
    var dot = document.getElementById('x-cursor');
    var ring = document.getElementById('x-cursor-ring');
    if (!dot || !ring) return;

    var LERP = 0.16;
    var HOVER_SELECTOR = 'a, button, input, .x-card, .x-pipe-step';

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
        placed = true; // first sighting: snap the ring, no fly-in from the corner
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
      if (hoverTarget(e.relatedTarget) === to) return; // moving within the same target
      ring.classList.add('is-hover');
    }

    function onPointerOut(e) {
      var from = hoverTarget(e.target);
      if (!from) return;
      if (hoverTarget(e.relatedTarget) === from) return; // still inside the same target
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
    onMQChange(cursorOffMQ, apply); // live re-check (e.g. reduced-motion toggle)
  }

  /* --------------------------------- nav --------------------------------- */

  function initNav() {
    var nav = document.getElementById('x-nav');
    if (nav) {
      var syncScrollState = function () {
        nav.classList.toggle('is-scrolled', window.scrollY > 40);
      };
      window.addEventListener('scroll', syncScrollState, { passive: true });
      syncScrollState(); // page can load already scrolled
    }

    var links = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (e) {
        var href = this.getAttribute('href') || '';
        if (href.charAt(0) !== '#') return;
        var target = href.length > 1 ? document.getElementById(href.slice(1)) : null;
        if (!target) return; // let the browser handle anything unexpected
        e.preventDefault();
        target.scrollIntoView({
          behavior: reduceMotionMQ.matches ? 'auto' : 'smooth',
          block: 'start'
        });
        if (window.history && typeof window.history.pushState === 'function') {
          try {
            window.history.pushState(null, '', href); // keep the URL deep-linkable
          } catch (err) {
            // Non-critical (e.g. file:// restrictions); navigation already ran.
          }
        }
      });
    }
  }

  /* ------------------------------ preload gate --------------------------- */

  function initPreloadGate() {
    function release() {
      if (document.body) document.body.classList.remove('x-preload');
    }
    if (document.readyState === 'complete') {
      release();
    } else {
      window.addEventListener('load', release, { once: true });
    }
  }

  /* ------------------------- v2: letter-split titles --------------------- */
  // Each h2.x-title is split into per-letter <span class="xl"> carrying a --i
  // stagger index; CSS animates .xl once .is-visible lands on the title (the
  // reveal IO adds it when the parent .x-section-head reveals). The .x-glitch
  // data-text attribute is CSS-only and left untouched. Whitespace stays as
  // plain text nodes so wrapping is unchanged. Idempotent via data-split;
  // skipped entirely under reduced motion, leaving titles as v1.
  function splitTitle(title) {
    if (title.getAttribute('data-split') === '1') return;
    title.setAttribute('data-split', '1');

    var index = 0;
    var nodes = Array.prototype.slice.call(title.childNodes);
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      if (node.nodeType !== 3) continue; // leave any element children untouched
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      var word = null; // .xw wrapper keeps each word unbreakable: lines wrap between words only
      function flushWord() {
        if (word && word.childNodes.length) frag.appendChild(word);
        word = null;
      }
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (/\s/.test(ch)) {
          flushWord();
          frag.appendChild(document.createTextNode(ch)); // spaces preserved as-is
        } else {
          if (!word) {
            word = document.createElement('span');
            word.className = 'xw';
          }
          var span = document.createElement('span');
          span.className = 'xl';
          span.style.setProperty('--i', String(index));
          span.textContent = ch;
          index += 1;
          word.appendChild(span);
        }
      }
      flushWord();
      title.replaceChild(frag, node);
    }
  }

  function initSplitTitles() {
    var titles = document.querySelectorAll('h2.x-title');
    function run() {
      if (reduceMotionMQ.matches) return; // reduced motion: titles behave as v1
      for (var i = 0; i < titles.length; i++) splitTitle(titles[i]);
    }
    run();
    // Mid-session upgrade to full motion: split then (splitTitle is idempotent).
    onMQChange(reduceMotionMQ, run);
  }

  /* ------------------------------ v2: tape ------------------------------- */
  // The marquee CSS translates the track 0 -> -50%, so the content must exist
  // twice for a seamless loop. Clone the original children once; clones are
  // marked aria-hidden.
  function initTape() {
    var track = document.getElementById('x-tape-track');
    if (!track) return;
    if (track.getAttribute('data-cloned') === '1') return;
    track.setAttribute('data-cloned', '1');

    var originals = Array.prototype.slice.call(track.children);
    for (var i = 0; i < originals.length; i++) {
      var clone = originals[i].cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }
  }

  /* ------------------------------ v2: rail ------------------------------- */
  // aside#x-rail: the dot matching the section in view gets .is-active, and
  // #x-rail-progress tracks overall scroll progress as a height percentage.
  function initRail() {
    var rail = document.getElementById('x-rail');
    var progress = document.getElementById('x-rail-progress');
    if (!rail || !progress) return;

    var SECTION_IDS = ['hero', 'architecture', 'research', 'risk', 'firm', 'mandate'];
    var sections = [];
    for (var s = 0; s < SECTION_IDS.length; s++) {
      var sec = document.getElementById(SECTION_IDS[s]);
      if (sec) sections.push(sec);
    }
    var links = rail.querySelectorAll('a[data-nav]');

    function setActive(id) {
      for (var i = 0; i < links.length; i++) {
        var on = links[i].getAttribute('href') === '#' + id;
        if (on) links[i].classList.add('is-active');
        else links[i].classList.remove('is-active');
      }
    }

    // Active section: IntersectionObserver where available.
    var hasIO = 'IntersectionObserver' in window;
    if (hasIO && sections.length > 0) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      }, { threshold: 0.3 });
      for (var o = 0; o < sections.length; o++) io.observe(sections[o]);
    }

    var ticking = false;
    function update() {
      ticking = false;
      var docEl = document.documentElement;
      var max = docEl.scrollHeight - window.innerHeight;
      var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      progress.style.height = pct + '%';

      // No-IO fallback: derive the active section from scroll position.
      if (!hasIO && sections.length > 0) {
        var mark = window.innerHeight * 0.35;
        var current = sections[0];
        for (var k = 0; k < sections.length; k++) {
          if (sections[k].getBoundingClientRect().top <= mark) current = sections[k];
        }
        setActive(current.id);
      }
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update(); // page can load already scrolled
  }

  /* ------------------------------ v2: tilt ------------------------------- */
  // Pointer-driven 3D tilt on cards and pipeline steps: inline transform +
  // .is-tilting (CSS stands down its own hover transform while that class is
  // on). Skipped for coarse pointers or reduced motion — cursorOffMQ covers
  // both — and any in-flight tilt is cleared on a live downgrade.
  function initTilt() {
    var els = document.querySelectorAll('.x-card, .x-pipe-step');
    if (els.length === 0) return;

    var MAX_DEG = 6;

    function onMove(e) {
      if (cursorOffMQ.matches) return;
      var el = e.currentTarget;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      var px = (e.clientX - r.left) / r.width - 0.5;  // -0.5 .. 0.5
      var py = (e.clientY - r.top) / r.height - 0.5;  // -0.5 .. 0.5
      var rx = (py * 2 * MAX_DEG).toFixed(2);         // face the pointer
      var ry = (-px * 2 * MAX_DEG).toFixed(2);
      el.style.transform =
        'perspective(700px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
      el.classList.add('is-tilting');
    }

    function onLeave(e) {
      var el = e.currentTarget;
      el.style.transform = '';
      el.classList.remove('is-tilting');
    }

    for (var i = 0; i < els.length; i++) {
      els[i].addEventListener('pointermove', onMove);
      els[i].addEventListener('pointerleave', onLeave);
    }

    onMQChange(cursorOffMQ, function () {
      if (!cursorOffMQ.matches) return;
      for (var j = 0; j < els.length; j++) {
        els[j].style.transform = '';
        els[j].classList.remove('is-tilting');
      }
    });
  }

  /* --------------------------- v2: magnetic buttons ---------------------- */
  // An .x-btn is pulled toward the pointer when the pointer comes within 48px
  // of its edge, up to 6px, eased through a rAF lerp loop; leaving the zone
  // springs it back to rest. Same skip conditions as tilt.
  function initMagnetic() {
    var btns = document.querySelectorAll('.x-btn');
    if (btns.length === 0) return;

    var RANGE = 48;    // activation distance from the button edge (px)
    var MAX_PULL = 6;  // maximum translation (px)
    var LERP = 0.18;

    var items = [];
    for (var b = 0; b < btns.length; b++) {
      items.push({ el: btns[b], tx: 0, ty: 0, cx: 0, cy: 0, applied: false });
    }
    var rafId = null;

    function loop() {
      var alive = false;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        it.cx += (it.tx - it.cx) * LERP;
        it.cy += (it.ty - it.cy) * LERP;
        if (Math.abs(it.tx - it.cx) < 0.05 && Math.abs(it.ty - it.cy) < 0.05) {
          it.cx = it.tx;
          it.cy = it.ty;
        } else {
          alive = true;
        }
        if (it.cx === 0 && it.cy === 0) {
          if (it.applied) {
            it.el.style.transform = '';
            it.applied = false;
          }
        } else {
          it.el.style.transform =
            'translate3d(' + it.cx.toFixed(2) + 'px, ' + it.cy.toFixed(2) + 'px, 0)';
          it.applied = true;
        }
      }
      rafId = alive ? window.requestAnimationFrame(loop) : null;
    }

    function wake() {
      if (rafId === null) rafId = window.requestAnimationFrame(loop);
    }

    function onMove(e) {
      if (cursorOffMQ.matches) return;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var r = it.el.getBoundingClientRect();
        // Undo our own translation so the measurement can't feed back.
        var left = r.left - it.cx;
        var top = r.top - it.cy;
        var right = r.right - it.cx;
        var bottom = r.bottom - it.cy;

        var gapX = Math.max(left - e.clientX, 0, e.clientX - right);
        var gapY = Math.max(top - e.clientY, 0, e.clientY - bottom);
        var dist = Math.sqrt(gapX * gapX + gapY * gapY);

        if (dist < RANGE) {
          var vx = e.clientX - (left + right) / 2;
          var vy = e.clientY - (top + bottom) / 2;
          var len = Math.sqrt(vx * vx + vy * vy);
          if (len > 0) {
            var pull = (1 - dist / RANGE) * MAX_PULL;
            it.tx = (vx / len) * pull;
            it.ty = (vy / len) * pull;
          }
        } else {
          it.tx = 0;
          it.ty = 0;
        }
      }
      wake();
    }

    function onLeave(e) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].el === e.currentTarget) {
          items[i].tx = 0;
          items[i].ty = 0;
        }
      }
      wake();
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('pointerleave', onLeave);
    }

    onMQChange(cursorOffMQ, function () {
      if (!cursorOffMQ.matches) return;
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        it.tx = 0;
        it.ty = 0;
        it.cx = 0;
        it.cy = 0;
        if (it.applied) {
          it.el.style.transform = '';
          it.applied = false;
        }
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }

  /* --------------------------------- boot -------------------------------- */

  function init() {
    initTypewriter();
    initReveals();
    initCursor();
    initNav();
    initPreloadGate();
    // v2 intensity pass
    initSplitTitles();
    initTape();
    initRail();
    initTilt();
    initMagnetic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
