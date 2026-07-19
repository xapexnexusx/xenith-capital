/* ============================================================================
   XENITH CAPITAL — assets/main.js
   v5 CLASSIFIED DOSSIER — scroll engine (Lane 3). Vanilla JS, zero
   dependencies, single strict IIFE, zero globals. Replaces the v4
   interaction core (old files kept on disk as reference only, never loaded).

   Owns:
   - Reveals: [data-reveal] -> .is-visible exactly once via one shared
     IntersectionObserver (threshold 0.15). CSS gates the hidden state on
     html.js so no-JS renders everything; no IntersectionObserver support
     falls back to reveal-all.
   - Title decode: every h2.xb-title[data-scramble] is split into span.xw
     word wrappers (nowrap) of span.xs-l letters seeded with noise glyphs
     ('█▓▒░<>/\|=+*'); on reveal each letter cycles 12-28 frames of glyphs,
     then locks with a left-to-right ~35ms stagger, scaled so a full run
     lands in the ~600-700ms band. Runs once per title, never twice.
     Reduced motion: no split at all, server text untouched.
   - #x-typer phrase rotator (55ms type / 2.2s hold / 28ms backspace over
     its data-phrases JSON), static first phrase under reduced motion,
     paused on hidden tabs.
   - #x-utc clock: 'HH:MM:SSZ', 1s tick, paused on hidden tabs.
   - Scroll chrome: #x-scrollpct '000%'-'100%' plus #x-topbar.is-scrolled
     past 40px, rAF-throttled passive listeners.
   - [data-nav] anchor routing: smooth scroll (instant under reduced
     motion), tabindex + focus hand-off for assistive tech, hash sync.
   - #x-reticle: lerped cursor shadow (0.2) with .is-lock over
     a / button / .x-chip; fine pointers and full motion only; the native
     cursor is never hidden.
   - Redaction bars: .xv-redact -> .is-open once in view, then an
     x:redacted CustomEvent {detail:{file}} carrying the parent card's
     .xv-tag text (e.g. 'EXHIBIT A') for the toast lane.
   - [data-count] numerals count up on reveal (plain integers, no
     separators; .x-fact-word entries skipped), instant under RM.
   - body.x-preload lifted on window load (4s failsafe).
   All timed work pauses on hidden tabs: rAF loops idle natively and the
   two interval timers are torn down and re-armed on visibilitychange.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ constants ------------------------------ */

  var reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Reticle is dropped for touch/coarse pointers or reduced motion.
  var finePointerMQ = window.matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)');

  var REVEAL_THRESHOLD = 0.15;
  var SCROLLED_PX = 40;

  var GLYPHS = '█▓▒░<>/\\|=+*';
  var FRAME_MS = 1000 / 60;      // one animation frame in ms
  var SCRAMBLE_SWEEP_MS = 640;   // budget for the left-to-right resolve sweep
  var SCRAMBLE_STAGGER_MS = 35;  // nominal per-letter stagger
  var SPIN_MIN_FRAMES = 12;      // min glyph-cycle frames before a letter locks
  var SPIN_MAX_FRAMES = 28;      // max glyph-cycle frames before a letter locks

  var TYPE_MS = 55;    // typer: per character while typing
  var HOLD_MS = 2200;  // typer: pause on a complete phrase
  var BACK_MS = 28;    // typer: per character while backspacing

  var RETICLE_LERP = 0.2;
  var RETICLE_LOCK_SELECTOR = 'a, button, .x-chip';

  var COUNT_MS = 1400; // numeral count-up duration

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

  function pad3(n) {
    if (n < 10) return '00' + n;
    if (n < 100) return '0' + n;
    return '' + n;
  }

  function trimText(s) {
    return (s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  /* ------------------------- once-in-view helper ------------------------- */
  // One shared IntersectionObserver for every reveal-style trigger. Each
  // element fires its callback exactly once, then is unobserved. Without IO
  // support every callback fires on the next tick instead (reveal-all) —
  // deferred so later scripts in the bundle have attached their listeners.

  var viewIO = null;
  var viewHandlers = typeof WeakMap === 'function' ? new WeakMap() : null;

  if ('IntersectionObserver' in window && viewHandlers) {
    viewIO = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var el = entries[i].target;
        var cb = viewHandlers.get(el);
        viewHandlers['delete'](el);
        viewIO.unobserve(el);
        if (cb) cb(el);
      }
    }, { threshold: REVEAL_THRESHOLD });
  }

  function onceInView(el, cb) {
    if (!el || typeof cb !== 'function') return;
    if (!viewIO) {
      window.setTimeout(function () { cb(el); }, 0); // no-IO fallback: reveal-all
      return;
    }
    viewHandlers.set(el, cb);
    viewIO.observe(el);
  }

  /* -------------------------------- reveals ------------------------------ */
  // [data-reveal] -> .is-visible once. CSS hides these only under html.js,
  // so a no-JS page renders fully and a JS page animates on scroll.

  function initReveals() {
    var els = document.querySelectorAll('[data-reveal]');
    for (var i = 0; i < els.length; i++) {
      onceInView(els[i], function (el) {
        el.classList.add('is-visible');
      });
    }
  }

  /* ------------------------------ title decode --------------------------- */
  // h2.xb-title[data-scramble]: letters live in span.xs-l inside span.xw
  // word wrappers (words never break across lines). Letters are seeded with
  // noise glyphs at split time so an unrevealed title reads as redacted;
  // on reveal the decode runs exactly once — glyphs cycle per letter, then
  // lock left-to-right. Full original text preserved on aria-label.
  // Reduced motion: split is skipped entirely, plain text stays.

  var scrambleRecords = [];  // every split title: {el, letters, finals, state}
  var decodeJobs = [];       // titles currently animating
  var decodeRaf = null;

  function randomGlyph() {
    return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
  }

  function splitTitle(title) {
    var raw = trimText(title.textContent);
    if (!raw) return null;

    var words = raw.split(' ');
    var frag = document.createDocumentFragment();
    var letters = [];
    var finals = [];

    title.setAttribute('aria-label', raw);
    title.textContent = '';

    for (var w = 0; w < words.length; w++) {
      var word = document.createElement('span');
      word.className = 'xw';
      word.setAttribute('aria-hidden', 'true');
      for (var c = 0; c < words[w].length; c++) {
        var ch = words[w].charAt(c);
        var ls = document.createElement('span');
        ls.className = 'xs-l';
        ls.textContent = randomGlyph(); // seeded noise state until decode
        word.appendChild(ls);
        letters.push(ls);
        finals.push(ch);
      }
      frag.appendChild(word);
      if (w < words.length - 1) frag.appendChild(document.createTextNode(' '));
    }
    title.appendChild(frag);

    return { el: title, letters: letters, finals: finals, state: 'idle', job: null };
  }

  // Instantly land a title on its final text: mid-flight decode or seeded
  // noise alike. Used by the reduced-motion escape hatch.
  function finishRecord(rec) {
    for (var i = 0; i < rec.letters.length; i++) {
      rec.letters[i].textContent = rec.finals[i];
      rec.letters[i].classList.add('is-resolved');
      rec.letters[i].classList.add('is-set');
    }
    rec.state = 'done';
    rec.job = null;
    rec.el.classList.remove('is-decoding');
    rec.el.classList.add('is-decoded');
  }

  function startDecode(rec) {
    if (!rec || rec.state !== 'idle') return; // idempotent: one run per title
    rec.state = 'running';

    var n = rec.letters.length;
    // Stagger targets ~35ms but scales down so the whole sweep stays inside
    // the ~600-700ms band for longer titles.
    var stagger = n > 1 ? Math.min(SCRAMBLE_STAGGER_MS, SCRAMBLE_SWEEP_MS / n) : 0;
    var resolve = [];
    for (var i = 0; i < n; i++) {
      var spinFrames = SPIN_MIN_FRAMES +
        Math.floor(Math.random() * (SPIN_MAX_FRAMES - SPIN_MIN_FRAMES + 1));
      // A letter locks at the later of the sweep front and its own minimum
      // glyph-cycle run: the sweep reads left-to-right, the spin floor keeps
      // every letter visibly cycling before it resolves.
      resolve.push(Math.max(i * stagger, spinFrames * FRAME_MS));
    }

    rec.job = { start: -1, resolve: resolve, locked: [], frame: 0 };
    rec.el.classList.add('is-decoding');
    decodeJobs.push(rec);
    if (decodeRaf === null) decodeRaf = window.requestAnimationFrame(tickDecodes);
  }

  function tickDecodes(now) {
    decodeRaf = null;
    for (var j = decodeJobs.length - 1; j >= 0; j--) {
      var rec = decodeJobs[j];
      var job = rec.job;
      if (!job) { decodeJobs.splice(j, 1); continue; } // finished out of band
      if (job.start < 0) job.start = now;
      var t = now - job.start;
      var allLocked = true;

      for (var i = 0; i < rec.letters.length; i++) {
        if (job.locked[i]) continue;
        if (t >= job.resolve[i]) {
          job.locked[i] = true;
          rec.letters[i].textContent = rec.finals[i];
          rec.letters[i].classList.add('is-resolved');
      rec.letters[i].classList.add('is-set');
        } else {
          allLocked = false;
          if ((job.frame + i) % 2 === 0) { // ~30Hz per letter, desynced
            rec.letters[i].textContent = randomGlyph();
          }
        }
      }
      job.frame += 1;

      if (allLocked) {
        rec.state = 'done';
        rec.job = null;
        rec.el.classList.remove('is-decoding');
        rec.el.classList.add('is-decoded');
        decodeJobs.splice(j, 1);
      }
    }
    if (decodeJobs.length > 0) decodeRaf = window.requestAnimationFrame(tickDecodes);
  }

  function forceFinishAllTitles() {
    for (var i = 0; i < scrambleRecords.length; i++) {
      if (scrambleRecords[i].state !== 'done') finishRecord(scrambleRecords[i]);
    }
    decodeJobs.length = 0;
    if (decodeRaf !== null) {
      window.cancelAnimationFrame(decodeRaf);
      decodeRaf = null;
    }
  }

  function initScramble() {
    if (reduceMotionMQ.matches) return; // no split: server text is final
    var titles = document.querySelectorAll('h2.xb-title[data-scramble]');
    for (var i = 0; i < titles.length; i++) {
      (function (title) {
        var rec = splitTitle(title);
        if (!rec) return;
        scrambleRecords.push(rec);
        onceInView(rec.el, function () { startDecode(rec); });
      })(titles[i]);
    }
    // Reduced motion toggled on mid-session: every title lands on final text.
    onMQChange(reduceMotionMQ, function () {
      if (reduceMotionMQ.matches) forceFinishAllTitles();
    });
  }

  /* --------------------------------- typer ------------------------------- */
  // #x-typer rotates phrases from its data-phrases JSON (55ms type / 2.2s
  // hold / 28ms backspace). The .x-typer-caret sibling is styled by CSS; only
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

    var index = 0;
    var pos = list[0].length;
    var mode = 'hold'; // 'hold' -> 'back' -> 'type' -> 'hold' ...
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
        mode = 'back';
        schedule(BACK_MS);
        return;
      }

      if (mode === 'back') {
        pos -= 1;
        if (pos <= 0) {
          pos = 0;
          index = (index + 1) % list.length;
          mode = 'type';
          el.textContent = '';
          schedule(TYPE_MS);
        } else {
          el.textContent = phrase.slice(0, pos);
          schedule(BACK_MS);
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

  /* ------------------------------- UTC clock ----------------------------- */
  // #x-utc shows 'HH:MM:SSZ' on a 1s tick. The interval is torn down while
  // the tab is hidden and re-armed (with an immediate repaint) on return.
  function initUtcClock() {
    var el = document.getElementById('x-utc');
    if (!el) return;

    var timer = null;

    function render() {
      var d = new Date();
      el.textContent = pad2(d.getUTCHours()) + ':' +
                       pad2(d.getUTCMinutes()) + ':' +
                       pad2(d.getUTCSeconds()) + 'Z';
    }

    function start() {
      if (timer !== null) return;
      render();
      timer = window.setInterval(render, 1000);
    }

    function stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    start();
  }

  /* ------------------------------ scroll chrome -------------------------- */
  // #x-scrollpct reads '000%'-'100%' of total scroll depth; #x-topbar gains
  // .is-scrolled past 40px. Scroll/resize only set a flag; a single pending
  // rAF does the DOM writes, so handlers stay passive and cheap.
  function initScrollChrome() {
    var pctEl = document.getElementById('x-scrollpct');
    var topbar = document.getElementById('x-topbar');
    if (!pctEl && !topbar) return;

    var rafId = null;
    var lastPct = -1;
    var lastScrolled = null;

    function apply() {
      rafId = null;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;

      if (pctEl) {
        var doc = document.documentElement;
        var height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
        var max = height - window.innerHeight;
        var pct = max > 0 ? Math.round((y / max) * 100) : 0;
        pct = Math.max(0, Math.min(100, pct));
        if (pct !== lastPct) {
          lastPct = pct;
          pctEl.textContent = pad3(pct) + '%';
        }
      }

      if (topbar) {
        var scrolled = y > SCROLLED_PX;
        if (scrolled !== lastScrolled) {
          lastScrolled = scrolled;
          topbar.classList.toggle('is-scrolled', scrolled);
        }
      }
    }

    function request() {
      if (rafId === null) rafId = window.requestAnimationFrame(apply);
    }

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    window.addEventListener('load', request, { once: true }); // fonts/images settle
    apply(); // initial paint
  }

  /* -------------------------------- nav routing -------------------------- */
  // [data-nav] anchors: smooth-scroll to the hash target (instant under
  // reduced motion), hand focus to the section for assistive tech, and sync
  // the hash so the position is linkable. preventDefault only fires when the
  // target actually exists — dead hashes keep native behavior.
  function initNav() {
    var links = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < links.length; i++) {
      (function (link) {
        link.addEventListener('click', function (e) {
          var href = link.getAttribute('href');
          if (!href || href.charAt(0) !== '#' || href.length < 2) return;
          var target = document.getElementById(href.slice(1));
          if (!target) return;
          e.preventDefault();

          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.scrollIntoView({
            behavior: reduceMotionMQ.matches ? 'auto' : 'smooth',
            block: 'start'
          });
          try {
            target.focus({ preventScroll: true });
          } catch (err) {
            try { target.focus(); } catch (err2) { /* older engines: skip focus */ }
          }
          try {
            window.history.pushState(null, '', href);
          } catch (err3) { /* restricted contexts: hash sync is cosmetic */ }
        });
      })(links[i]);
    }
  }

  /* -------------------------------- reticle ------------------------------ */
  // #x-reticle shadows the pointer with a 0.2 lerp and gains .is-lock over
  // a / button / .x-chip. Fine pointers with full motion only — coarse
  // pointers and reduced motion keep it hidden and listener-free. JS owns
  // only transform + opacity inline; every other visual is CSS. The native
  // cursor is never touched.
  function initReticle() {
    var el = document.getElementById('x-reticle');
    if (!el) return;

    var tx = 0;   // pointer target
    var ty = 0;
    var cx = 0;   // reticle position
    var cy = 0;
    var rafId = null;
    var active = false;
    var seen = false;

    el.style.opacity = '0'; // hidden until the first pointer sighting

    function place(x, y) {
      el.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) translate(-50%, -50%)';
    }

    function loop() {
      cx += (tx - cx) * RETICLE_LERP;
      cy += (ty - cy) * RETICLE_LERP;
      place(cx, cy);
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
        rafId = window.requestAnimationFrame(loop);
      } else {
        rafId = null; // settled: idle until the pointer moves again
      }
    }

    function onPointerMove(e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!seen) { // first sighting: snap to the pointer, no corner fly-in
        seen = true;
        cx = tx;
        cy = ty;
        place(cx, cy);
        el.style.opacity = '1';
      }
      if (rafId === null) rafId = window.requestAnimationFrame(loop);
    }

    function lockTarget(node) {
      return node && typeof node.closest === 'function'
        ? node.closest(RETICLE_LOCK_SELECTOR)
        : null;
    }

    function onPointerOver(e) {
      var to = lockTarget(e.target);
      if (!to) return;
      if (lockTarget(e.relatedTarget) === to) return; // moving within target
      el.classList.add('is-lock');
    }

    function onPointerOut(e) {
      var from = lockTarget(e.target);
      if (!from) return;
      if (lockTarget(e.relatedTarget) === from) return; // still inside it
      el.classList.remove('is-lock');
    }

    function enable() {
      if (active) return;
      active = true;
      seen = false;
      el.style.opacity = '0';
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerover', onPointerOver, { passive: true });
      document.addEventListener('pointerout', onPointerOut, { passive: true });
    }

    function disable() {
      if (!active) return;
      active = false;
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      el.classList.remove('is-lock');
      el.style.opacity = '0';
    }

    function apply() {
      if (finePointerMQ.matches) disable(); else enable();
    }

    apply();
    onMQChange(finePointerMQ, apply); // live re-check (e.g. RM toggle mid-session)
  }

  /* ------------------------------ redaction bars ------------------------- */
  // .xv-redact dissolves (.is-open) the first time it scrolls into view,
  // then announces x:redacted {detail:{file}} with the parent card's
  // .xv-tag text ('EXHIBIT A', ...) so the toast lane can mark the file.
  function initRedactions() {
    var bars = document.querySelectorAll('.xv-redact');
    for (var i = 0; i < bars.length; i++) {
      onceInView(bars[i], function (el) {
        el.classList.add('is-open');
        var file = '';
        var card = typeof el.closest === 'function' ? el.closest('.xv-file') : null;
        var tag = card ? card.querySelector('.xv-tag') : null;
        if (tag) file = trimText(tag.textContent);
        try {
          document.dispatchEvent(new CustomEvent('x:redacted', { detail: { file: file } }));
        } catch (err) {
          // A throwing listener must never take the reveal down.
        }
      });
    }
  }

  /* -------------------------------- counters ----------------------------- */
  // [data-count] numerals count from 0 to the attribute value on reveal
  // (plain integers, no separators). .x-fact-word entries are static text,
  // skipped outright. Reduced motion: final value immediately, no loop.
  var countActive = [];

  function finishCount(entry) {
    if (entry.raf !== null) {
      window.cancelAnimationFrame(entry.raf);
      entry.raf = null;
    }
    entry.el.textContent = String(entry.target);
    entry.done = true;
    var i = countActive.indexOf(entry);
    if (i !== -1) countActive.splice(i, 1);
  }

  function runCount(el, target) {
    var entry = { el: el, target: target, raf: null, done: false, start: -1 };
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
      entry.raf = window.requestAnimationFrame(step);
    }

    entry.raf = window.requestAnimationFrame(step);
  }

  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        if (el.classList.contains('x-fact-word')) return; // static wordmarks
        var target = parseInt(el.getAttribute('data-count'), 10);
        if (isNaN(target) || target < 0) return;
        if (reduceMotionMQ.matches) {
          el.textContent = String(target);
          return;
        }
        onceInView(el, function () { runCount(el, target); });
      })(els[i]);
    }
    // Reduced motion toggled on mid-count: land on final values.
    onMQChange(reduceMotionMQ, function () {
      if (!reduceMotionMQ.matches) return;
      var pending = countActive.slice(0);
      for (var i = 0; i < pending.length; i++) finishCount(pending[i]);
    });
  }

  /* ------------------------------- preload ------------------------------- */
  // body.x-preload gates CSS transitions/animations while assets settle.
  // Lifted on window load, with a failsafe so a hung resource can never
  // trap the page behind preload chrome.
  function initPreload() {
    var done = false;
    function lift() {
      if (done) return;
      done = true;
      if (document.body) document.body.classList.remove('x-preload');
    }
    if (document.readyState === 'complete') {
      lift();
    } else {
      window.addEventListener('load', lift, { once: true });
    }
    window.setTimeout(lift, 4000);
  }

  /* --------------------------------- konami ------------------------------- */
  // ↑↑↓↓←→←→ b a — fx burst + toast via x:konami (game.js listens).
  var KONAMI_SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  function initKonami() {
    var progress = 0;
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented) return;
      var key = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      progress = (key === KONAMI_SEQ[progress]) ? progress + 1 : (key === KONAMI_SEQ[0] ? 1 : 0);
      if (progress === KONAMI_SEQ.length) {
        progress = 0;
        try { if (window.XENITH_FX && window.XENITH_FX.burst) window.XENITH_FX.burst(); } catch (err) { /* fx optional */ }
        document.dispatchEvent(new CustomEvent('x:konami'));
      }
    }, { passive: true });
  }

  /* --------------------------------- init -------------------------------- */

  function init() {
    initPreload();
    initReveals();
    initScramble();
    initTyper();
    initUtcClock();
    initScrollChrome();
    initNav();
    initReticle();
    initRedactions();
    initCounters();
    initKonami();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
