/* ==========================================================================
   XENITH CAPITAL — clearance protocol terminal
   assets/terminal.js — owns #x-terminal. Vanilla JS, zero dependencies.
   Public API: window.XenithTerminal = { init(sel, opts), version }
   Auto-initializes on DOMContentLoaded against #x-terminal.
   Line classes (.xt-line/.xt-user/.xt-ok/.xt-err) and the matrix-rain overlay
   class (.xt-rain) are styled by the injected block below; game chrome
   (.xt-bar/.xt-win) and every other contract selector stay with xenith.css.
   v3 additions: the CLEARANCE PROTOCOL trial game (SIGNAL / PATIENCE /
   VERIFICATION) gating the direct channel, sealed mandate + contact,
   channel key, sessionStorage gate, uptime command, iddqd + xyzzy eggs,
   tab-hidden timer pausing.
   v2 preserved: scan / matrix / disclosures / banner / clear / exit,
   uplink clock, print pipeline and printer ordering.
   ========================================================================== */
(function () {
  'use strict';

  var VERSION = '3.0.0';
  var DEFAULT_EMAIL = 'inquiry@xenithcap.io';
  var TYPE_MS = 12;            /* per-character cadence for system lines */
  var BOOT_GAP_MS = 130;       /* stagger between boot lines */
  var SEND_DELAY_MS = 1500;    /* pause before handing off to the mail client */
  var SCAN_GAP_MS = 400;       /* stagger between doctrinal scan lines */
  var MATRIX_TICK_MS = 90;     /* rain re-render cadence */
  var MATRIX_MS = 8000;        /* total rain duration */
  var HOLD_TICK_MS = 250;      /* hold bar cadence (~4x/s) */
  var HOLD_TICK_RM_MS = 1000;  /* reduced-motion hold bar cadence (1x/s) */
  var HOLD_SECONDS = 12;       /* THE HOLD — full duration */
  var HOLD_RETRY_SECONDS = 10; /* THE HOLD — retry duration */
  var BAR_WIDTH = 24;          /* block width of the hold progress bar */
  var STYLE_ID = 'xt-line-styles';
  var IDLE_PLACEHOLDER = "type 'clearance'";
  var IDLE_ARIA = 'Terminal input. Type help for commands.';
  var STORAGE_GATE = 'xv_clearance';
  var STORAGE_KEY = 'xv_channel_key';

  var BOOT_LINES = [
    'XENITH CAPITAL // CLEARANCE PROTOCOL v3.0',
    'secure channel: SEALED',
    'trials loaded: SIGNAL · PATIENCE · VERIFICATION',
    "type 'clearance' to begin — or 'help'"
  ];

  var DISCLOSURE_LINES = [
    'Xenith Capital is a state-registered investment adviser.',
    'Registration does not imply a certain level of skill or training.',
    'Informational only — not an offer or solicitation.',
    'Investing involves risk. Past performance is not indicative of future results.',
    'Form ADV Part 2 (brochure): https://reports.adviserinfo.sec.gov/reports/ADV/316844/PDF/316844.pdf',
    'Form CRS + firm record: https://adviserinfo.sec.gov/firm/summary/316844'
  ];

  var SCAN_LINES = [
    '> initiating doctrinal scan…',
    '> checking sizing inputs… OK',
    '> checking narrative exposure…',
    '> verifying constraint compliance… OK',
    '> compiling exposure report…'
  ];
  var SCAN_CLEAN_LINE = '0 narrative inputs in doctrine — process CLEAN';

  /* TRIAL 1 // SIGNAL OR NOISE — answer key: s = signal, n = noise. */
  var TRIAL1_ITEMS = [
    { q: 'A CEO posts a rocket emoji after earnings.', a: 'n' },
    { q: 'Third consecutive quarter of declining free cash flow in the 10-K.', a: 's' },
    { q: 'A viral thread promises 40% guaranteed.', a: 'n' },
    { q: 'Cluster of insider buys at a 52-week low.', a: 's' },
    { q: 'Your gym group chat is all-in on one ticker.', a: 'n' }
  ];
  /* Retry set — armed once after a sub-threshold main run; needs 3/3. */
  var TRIAL1_RETRY = [
    { q: 'Management raises guidance and funds it with buybacks.', a: 's' },
    { q: "'This time it's different.' — prime-time segment.", a: 'n' },
    { q: 'Receivables growing 3x revenue, buried in note 14.', a: 's' }
  ];

  /* Full-width glyphs keep the rain grid aligned in the mono font. */
  var RAIN_GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ' +
    'ハヒフヘホマミムメモヤユヨラリルレロワヲン０１２３４５６７８９';
  var RAIN_COL_PX = 12;
  var RAIN_ROW_PX = 15;

  var BAND_LABELS = {
    '1': 'under 250k',
    '2': '250k-1M',
    '3': '1M+',
    '4': 'prefer not to say'
  };

  var BAND_MENU = [
    '  [1] under 250k',
    '  [2] 250k-1M',
    '  [3] 1M+',
    '  [4] prefer not to say'
  ];

  var EMAIL_RE = /.+@.+\..+/;

  /* Guided-flow steps: name → email → capital band → objective. */
  var STEPS = [
    { key: 'name',      prompt: 'step 1/4 — full name:',            placeholder: 'full name' },
    { key: 'email',     prompt: 'step 2/4 — contact email:',        placeholder: 'you@domain.tld' },
    { key: 'band',      prompt: 'step 3/4 — capital band:',         placeholder: 'enter 1-4' },
    { key: 'objective', prompt: 'step 4/4 — objective (one line):', placeholder: 'one-line objective' }
  ];

  /* ONE style block, scoped strictly to this widget's own line classes and
     the rain overlay. Colors mirror the design tokens (cyan / magenta / amber).
     Game chrome (.xt-bar/.xt-win) is owned by xenith.css — never styled here. */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent =
      '.xt-line{color:inherit;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.xt-user{color:#00f0ff}' +
      '.xt-ok{color:#ff2d78}' +
      '.xt-err{color:#ffb000}' +
      '.xt-rain{position:absolute;inset:0;pointer-events:none;overflow:hidden;' +
      'z-index:2;margin:0;color:#00f0ff;opacity:.32;' +
      'font-family:inherit;font-size:12px;line-height:15px;letter-spacing:0;' +
      'white-space:pre;text-shadow:0 0 6px rgba(0,240,255,.45)}';
    document.head.appendChild(el);
  }

  function prefersReduced() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function formatUplink(s) {
    if (s < 3600) return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
    return Math.floor(s / 3600) + ':' +
      pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60);
  }

  /* sessionStorage is best-effort: private modes and file:// can throw. */
  function storageGet(key) {
    try {
      return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(key, value);
    } catch (e) { /* storage unavailable — gate simply does not persist */ }
  }

  /* Channel key: XV-#### — 4 random alphanumerics (ambiguous glyphs dropped). */
  function genKey() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 4; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'XV-' + out;
  }

  /* Output printer: every line funnels through one promise chain so typed
     lines, echoes, and queued responses always render in order. */
  function makePrinter(body) {
    var chain = Promise.resolve();

    function scroll() {
      body.scrollTop = body.scrollHeight;
    }

    function makeLine(cls) {
      var el = document.createElement('div');
      el.className = 'xt-line' + (cls ? ' ' + cls : '');
      body.appendChild(el);
      return el;
    }

    function typeInto(el, text, done) {
      var i = 0;
      var timer = window.setInterval(function () {
        i += 1;
        el.textContent = text.slice(0, i);
        scroll();
        if (i >= text.length) {
          window.clearInterval(timer);
          done();
        }
      }, TYPE_MS);
    }

    /* System lines type at 12ms/char; echoes and error lines render
       instantly; everything renders instantly under reduced motion. */
    function print(text, cls) {
      var instant = prefersReduced() ||
        cls === 'xt-user' || cls === 'xt-err' || !text;
      chain = chain.then(function () {
        return new Promise(function (resolve) {
          var el = makeLine(cls);
          if (instant) {
            el.textContent = text;
            scroll();
            resolve();
          } else {
            typeInto(el, text, resolve);
          }
        });
      });
      return chain;
    }

    function printAll(lines, cls) {
      for (var i = 0; i < lines.length; i++) print(lines[i], cls);
      return chain;
    }

    function wait(ms) {
      if (prefersReduced()) return chain;
      chain = chain.then(function () {
        return new Promise(function (resolve) {
          window.setTimeout(resolve, ms);
        });
      });
      return chain;
    }

    /* Mutable line, created in chain order and handed back for live updates
       (the hold progress bar). Stays inside the same ordered pipeline. */
    function line(cls) {
      var p = chain.then(function () {
        var el = makeLine(cls);
        scroll();
        return el;
      });
      chain = p.then(function () {});
      return p;
    }

    function clear() {
      body.textContent = '';
    }

    return { print: print, printAll: printAll, wait: wait, line: line, clear: clear };
  }

  function createTerminal(root, opts) {
    var body = root.querySelector('.x-term-body');
    var form = root.querySelector('form.x-term-form');
    var input = root.querySelector('#x-term-input');
    if (!body || !form || !input) return null;

    var email = (opts && opts.email) || DEFAULT_EMAIL;
    var printer = makePrinter(body);

    /* State machine: { mode:'idle' } | { mode:'mandate', step:0..3, data } |
       { mode:'trial1'|'hold-confirm'|'hold'|'trial3' } (clearance game). */
    var state = { mode: 'idle', step: -1, data: {} };

    function freshGame() {
      return {
        t1: { index: 0, score: 0, retry: false },
        t3: { retry: false },
        hold: { timer: null, elapsed: 0, last: 0, seconds: 0, bar: null, retryUsed: false },
        locked: false
      };
    }
    var game = freshGame();

    /* Clearance gate: per-tab persistence + channel key. */
    var granted = storageGet(STORAGE_GATE) === 'granted';
    var channelKey = storageGet(STORAGE_KEY);
    if (granted && !channelKey) {
      channelKey = genKey();
      storageSet(STORAGE_KEY, channelKey);
    }

    /* Active matrix rain handle: { overlay, render, timer, endTimer,
       endsAt, remaining } or null. */
    var rain = null;

    var uplinkT0 = Date.now();

    function setPlaceholder(text) {
      input.placeholder = text || IDLE_PLACEHOLDER;
      input.setAttribute('aria-label', text ? 'Terminal input: ' + text : IDLE_ARIA);
    }

    function scrollBody() {
      body.scrollTop = body.scrollHeight;
    }

    /* ---------------- uplink uptime clock ---------------- */

    /* Appends a live "· UPLINK …" counter into the window title. The span is
       decorative chrome, so it is hidden from assistive tech; the 1s tick
       formats as mm:ss under an hour, then h:mm:ss. No work while hidden. */
    function startUplink() {
      var title = root.querySelector('.x-term-title');
      if (!title) return;
      var clock = document.createElement('span');
      clock.setAttribute('aria-hidden', 'true');
      clock.textContent = ' · UPLINK 00:00';
      title.appendChild(clock);
      window.setInterval(function () {
        if (document.hidden) return;
        var s = Math.floor((Date.now() - uplinkT0) / 1000);
        clock.textContent = ' · UPLINK ' + formatUplink(s);
      }, 1000);
    }

    function boot() {
      for (var i = 0; i < BOOT_LINES.length; i++) {
        if (i > 0) printer.wait(BOOT_GAP_MS);
        printer.print(BOOT_LINES[i]);
      }
    }

    /* Hold the boot sequence until the terminal first scrolls into view so
       the staggered typing is actually seen; fall back to immediate boot. */
    function armBoot() {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              io.disconnect();
              boot();
              return;
            }
          }
        }, { threshold: 0.25 });
        io.observe(root);
      } else {
        boot();
      }
    }

    /* ---------------- doctrinal scan ---------------- */

    function runScan() {
      for (var i = 0; i < SCAN_LINES.length; i++) {
        printer.print(SCAN_LINES[i]);
        printer.wait(SCAN_GAP_MS);
      }
      printer.print(SCAN_CLEAN_LINE, 'xt-ok');
    }

    /* ---------------- matrix signal rain ---------------- */

    function stopRain(finished) {
      if (!rain) return;
      if (rain.timer) window.clearInterval(rain.timer);
      if (rain.endTimer) window.clearTimeout(rain.endTimer);
      if (rain.overlay.parentNode) {
        rain.overlay.parentNode.removeChild(rain.overlay);
      }
      rain = null;
      if (finished) printer.print('signal saturation complete', 'xt-ok');
    }

    /* Tab-hidden pause: freeze the render loop and bank the remaining
       duration so background throttling cannot silently consume it. */
    function pauseRain() {
      if (!rain || !rain.timer) return;
      window.clearInterval(rain.timer);
      window.clearTimeout(rain.endTimer);
      rain.timer = null;
      rain.endTimer = null;
      rain.remaining = Math.max(0, rain.endsAt - Date.now());
    }

    function resumeRain() {
      if (!rain || rain.timer) return;
      rain.endsAt = Date.now() + rain.remaining;
      rain.timer = window.setInterval(rain.render, MATRIX_TICK_MS);
      rain.endTimer = window.setTimeout(function () { stopRain(true); },
        rain.remaining);
    }

    function startRain() {
      if (rain) {
        printer.print('matrix rain already in progress', 'xt-err');
        return;
      }
      if (prefersReduced()) {
        printer.print('animation suppressed — reduced motion');
        return;
      }
      /* The body is a scroll container: the overlay is absolutely positioned
         against it and re-anchored to the visible viewport every tick, so it
         cannot drift out of view when new lines auto-scroll the body. */
      if (window.getComputedStyle(body).position === 'static') {
        body.style.position = 'relative';
      }
      var overlay = document.createElement('div');
      overlay.className = 'xt-rain';
      overlay.setAttribute('aria-hidden', 'true');
      body.appendChild(overlay);

      var cols = Math.max(8, Math.floor(body.clientWidth / RAIN_COL_PX));
      var rows = Math.max(6, Math.floor(body.clientHeight / RAIN_ROW_PX));
      var drops = [];
      for (var c = 0; c < cols; c++) {
        drops.push({
          y: -Math.floor(Math.random() * rows),
          speed: 0.5 + Math.random(),
          trail: 4 + Math.floor(Math.random() * 9)
        });
      }

      function render() {
        /* A `clear` command during rain wipes the overlay node; detect the
           detachment and shut the rain down silently. */
        if (!overlay.parentNode) {
          stopRain(false);
          return;
        }
        overlay.style.top = body.scrollTop + 'px';
        overlay.style.height = body.clientHeight + 'px';
        var lines = [];
        for (var r = 0; r < rows; r++) {
          var line = '';
          for (var c2 = 0; c2 < cols; c2++) {
            var d = drops[c2];
            line += (r <= d.y && r > d.y - d.trail)
              ? RAIN_GLYPHS.charAt(Math.floor(Math.random() * RAIN_GLYPHS.length))
              : ' ';
          }
          lines.push(line);
        }
        overlay.textContent = lines.join('\n');
        for (var k = 0; k < cols; k++) {
          var drop = drops[k];
          drop.y += drop.speed;
          if (drop.y - drop.trail > rows) {
            drop.y = -Math.floor(Math.random() * rows);
            drop.speed = 0.5 + Math.random();
            drop.trail = 4 + Math.floor(Math.random() * 9);
          }
        }
      }

      rain = {
        overlay: overlay,
        render: render,
        endsAt: Date.now() + MATRIX_MS,
        remaining: 0,
        timer: window.setInterval(render, MATRIX_TICK_MS),
        endTimer: window.setTimeout(function () { stopRain(true); }, MATRIX_MS)
      };
      render();
    }

    /* ---------------- mandate guided flow ---------------- */

    function askStep() {
      var s = STEPS[state.step];
      printer.print(s.prompt);
      if (s.key === 'band') printer.printAll(BAND_MENU);
      setPlaceholder(s.placeholder);
    }

    function startMandate() {
      state.mode = 'mandate';
      state.step = 0;
      state.data = {};
      printer.print('MANDATE INQUIRY // guided transmission — 4 steps // ESC aborts');
      askStep();
    }

    function abortMandate() {
      state.mode = 'idle';
      state.step = -1;
      state.data = {};
      input.value = '';
      setPlaceholder(null);
      printer.print('mandate flow aborted', 'xt-err');
    }

    function completeMandate() {
      var d = state.data;
      state.mode = 'idle';
      state.step = -1;
      setPlaceholder(null);

      printer.print('TRANSMISSION PREPARED', 'xt-ok');
      printer.printAll([
        '  name ...... ' + d.name,
        '  email ..... ' + d.email,
        '  band ...... ' + d.band,
        '  objective . ' + d.objective
      ]);
      var ready = printer.print('opening secure mail channel → ' + email, 'xt-ok');

      var subject = 'Mandate inquiry — ' + d.name;
      var bodyText = [
        'Name: ' + d.name,
        'Email: ' + d.email,
        'Capital band: ' + d.band,
        'Objective: ' + d.objective,
        '',
        '— composed via the xenithcap.io mandate uplink'
      ].join('\n');

      ready.then(function () {
        window.setTimeout(function () {
          window.location.href = 'mailto:' + email +
            '?subject=' + encodeURIComponent(subject) +
            '&body=' + encodeURIComponent(bodyText);
          printer.print('if no mail client opened, write directly: ' + email);
        }, SEND_DELAY_MS);
      });
    }

    function handleMandateInput(v) {
      var s = STEPS[state.step];
      if (!s) {
        state.mode = 'idle';
        state.step = -1;
        setPlaceholder(null);
        return;
      }
      switch (s.key) {
        case 'name':
          if (!v) { printer.print('name required — full name:', 'xt-err'); return; }
          state.data.name = v;
          break;
        case 'email':
          if (!EMAIL_RE.test(v)) {
            printer.print('invalid email format — expected user@domain.tld:', 'xt-err');
            return;
          }
          state.data.email = v;
          break;
        case 'band':
          if (!BAND_LABELS[v]) {
            printer.print('select a band — 1, 2, 3 or 4:', 'xt-err');
            return;
          }
          state.data.band = BAND_LABELS[v];
          break;
        case 'objective':
          if (!v) { printer.print('objective required — one line:', 'xt-err'); return; }
          state.data.objective = v;
          completeMandate();
          return;
      }
      state.step += 1;
      askStep();
    }

    /* ---------------- clearance protocol game ---------------- */

    function gameActive() {
      return state.mode === 'trial1' || state.mode === 'hold-confirm' ||
        state.mode === 'hold' || state.mode === 'trial3';
    }

    function sealLine() {
      printer.print("channel SEALED — type 'clearance'", 'xt-err');
    }

    function startProtocol() {
      if (granted) {
        printer.print('clearance: GRANTED — protocol already complete', 'xt-ok');
        printer.print("type 'mandate' to open the guided inquiry");
        return;
      }
      if (gameActive()) {
        printer.print('protocol already in progress — ESC aborts', 'xt-err');
        return;
      }
      var wasLocked = game.locked;
      game = freshGame();
      state.mode = 'trial1';
      setPlaceholder('s or n');
      if (wasLocked) printer.print('protocol restart — prior lock cleared');
      printer.print('CLEARANCE PROTOCOL // three trials — signal, patience, verification');
      printer.print('ESC aborts at any point. the channel stays sealed until all three clear.');
      printer.print('TRIAL 1 // SIGNAL OR NOISE', 'xt-ok');
      printer.print('five items. answer [s] signal or [n] noise — 4/5 to clear.');
      askTrial1();
    }

    function trial1Set() {
      return game.t1.retry ? TRIAL1_RETRY : TRIAL1_ITEMS;
    }

    function askTrial1() {
      var item = trial1Set()[game.t1.index];
      var label = game.t1.retry
        ? 'retry ' + (game.t1.index + 1) + '/3'
        : 'item ' + (game.t1.index + 1) + '/5';
      printer.print(label + ' — ' + item.q + '  [s/n]');
    }

    function handleTrial1(v) {
      v = v.toLowerCase();
      if (v !== 's' && v !== 'n') {
        printer.print("answer 's' (signal) or 'n' (noise):", 'xt-err');
        return;
      }
      var set = trial1Set();
      var item = set[game.t1.index];
      var right = v === item.a;
      if (right) game.t1.score += 1;
      printer.print(right ? 'correct' : 'incorrect', right ? 'xt-ok' : 'xt-err');
      game.t1.index += 1;
      if (game.t1.index < set.length) {
        askTrial1();
        return;
      }
      finishTrial1();
    }

    function finishTrial1() {
      if (!game.t1.retry) {
        printer.print('SIGNAL score: ' + game.t1.score + '/5');
        if (game.t1.score >= 4) {
          printer.print('TRIAL 1 CLEARED — signal separated from noise', 'xt-ok');
          startHoldIntro();
        } else {
          game.t1.retry = true;
          game.t1.index = 0;
          game.t1.score = 0;
          printer.print('below threshold — 4/5 required', 'xt-err');
          printer.print('retry set armed: 3 items, 3/3 required. last chance.');
          askTrial1();
        }
      } else {
        printer.print('RETRY score: ' + game.t1.score + '/3');
        if (game.t1.score === 3) {
          printer.print('TRIAL 1 CLEARED — on retry', 'xt-ok');
          startHoldIntro();
        } else {
          lockProtocol('SIGNAL');
        }
      }
    }

    /* --- TRIAL 2 // THE HOLD --- */

    function startHoldIntro() {
      state.mode = 'hold-confirm';
      var seconds = game.hold.retryUsed ? HOLD_RETRY_SECONDS : HOLD_SECONDS;
      setPlaceholder('y to hold');
      printer.print('TRIAL 2 // THE HOLD', 'xt-ok');
      printer.print('Hold position for ' + seconds + ' seconds. Any input is an impulse.');
      printer.print('confirm [y] — ESC aborts');
    }

    function handleHoldConfirm(v) {
      if (v.toLowerCase() !== 'y') {
        printer.print("type 'y' to begin the hold — or ESC to abort", 'xt-err');
        return;
      }
      beginHold(game.hold.retryUsed ? HOLD_RETRY_SECONDS : HOLD_SECONDS);
    }

    function barText(elapsedMs, seconds) {
      var frac = Math.min(1, elapsedMs / (seconds * 1000));
      var filled = Math.round(BAR_WIDTH * frac);
      var bar = '';
      for (var i = 0; i < BAR_WIDTH; i++) bar += i < filled ? '█' : '░';
      var shown = Math.min(seconds, elapsedMs / 1000);
      return '[' + bar + '] ' + shown.toFixed(1) + 's / ' + seconds + '.0s';
    }

    function stopHoldTimer() {
      if (game.hold.timer) {
        window.clearInterval(game.hold.timer);
        game.hold.timer = null;
      }
    }

    function beginHold(seconds) {
      state.mode = 'hold';
      setPlaceholder('HOLD — do not type');
      game.hold.seconds = seconds;
      game.hold.elapsed = 0;
      game.hold.last = Date.now();
      var tickMs = prefersReduced() ? HOLD_TICK_RM_MS : HOLD_TICK_MS;
      /* The bar line is created in printer order, then mutated live; the
         mode guard covers an abort that lands before creation resolves. */
      printer.line('xt-bar').then(function (el) {
        if (state.mode !== 'hold') return;
        game.hold.bar = el;
        el.textContent = barText(0, seconds);
        scrollBody();
        game.hold.timer = window.setInterval(holdTick, tickMs);
      });
    }

    function holdTick() {
      if (state.mode !== 'hold') { stopHoldTimer(); return; }
      var nowTs = Date.now();
      var delta = nowTs - game.hold.last;
      game.hold.last = nowTs;
      if (document.hidden) return;            /* paused while tab hidden */
      var cap = prefersReduced() ? 2000 : 500;
      if (delta > cap) delta = cap;           /* no time-skipping after throttle */
      game.hold.elapsed += delta;
      if (game.hold.elapsed >= game.hold.seconds * 1000) {
        finishHold();
        return;
      }
      if (game.hold.bar) {
        game.hold.bar.textContent = barText(game.hold.elapsed, game.hold.seconds);
        scrollBody();
      }
    }

    function finishHold() {
      stopHoldTimer();
      if (game.hold.bar) {
        game.hold.bar.textContent =
          barText(game.hold.seconds * 1000, game.hold.seconds);
        scrollBody();
        game.hold.bar = null;
      }
      printer.print('discipline confirmed — you won by not playing.', 'xt-ok');
      startTrial3();
    }

    function impulse() {
      if (state.mode !== 'hold') return;
      stopHoldTimer();
      game.hold.bar = null;
      input.value = '';
      printer.print('IMPULSE DETECTED — position broken', 'xt-err');
      if (!game.hold.retryUsed) {
        game.hold.retryUsed = true;
        state.mode = 'hold-confirm';
        setPlaceholder('y to hold');
        printer.print('one retry granted — hold ' + HOLD_RETRY_SECONDS +
          ' seconds. confirm [y]');
      } else {
        lockProtocol('PATIENCE');
      }
    }

    /* --- TRIAL 3 // THE VERIFICATION --- */

    function startTrial3() {
      state.mode = 'trial3';
      setPlaceholder('accept / verify / reject');
      printer.print('TRIAL 3 // THE VERIFICATION', 'xt-ok');
      printer.print('claim on file: "Our model predicted the last three crashes."');
      printer.print('Your move: [accept / verify / reject]');
    }

    function handleTrial3(v) {
      v = v.toLowerCase();
      if (v !== 'accept' && v !== 'verify' && v !== 'reject') {
        printer.print('choose: accept / verify / reject', 'xt-err');
        return;
      }
      if (!game.t3.retry) {
        if (v === 'verify') {
          printer.print('> correct — claims get verified, never worshipped.', 'xt-ok');
          grantClearance();
        } else {
          game.t3.retry = true;
          printer.print('> incorrect — one retry granted.', 'xt-err');
          printer.print('claim on file: "This mandate guarantees 20% annually."');
          printer.print('Your move: [accept / verify / reject]');
        }
      } else {
        if (v === 'reject') {
          printer.print('> correct — guaranteed returns are narrative fiction.', 'xt-ok');
          grantClearance();
        } else {
          lockProtocol('VERIFICATION');
        }
      }
    }

    /* --- game outcomes --- */

    function lockProtocol(trialName) {
      state.mode = 'idle';
      game.locked = true;
      setPlaceholder(null);
      printer.print(trialName + ' trial failed twice — PROTOCOL LOCKED', 'xt-err');
      printer.print("the channel stays sealed. type 'clearance' to restart fresh.", 'xt-err');
    }

    function grantClearance() {
      state.mode = 'idle';
      setPlaceholder(null);
      granted = true;
      channelKey = genKey();
      storageSet(STORAGE_GATE, 'granted');
      storageSet(STORAGE_KEY, channelKey);
      printer.print(
        'CLEARANCE GRANTED — PROTOCOL COMPLETE\n' +
        'trials cleared: SIGNAL · PATIENCE · VERIFICATION\n' +
        'secure channel: UNSEALED',
        'xt-win'
      );
      printer.print('direct channel: ' + email, 'xt-ok');
      printer.print('channel key: ' + channelKey, 'xt-ok');
      printer.print("type 'mandate' to open the guided inquiry — 'contact' reprints the channel");
      if (typeof CustomEvent === 'function' && document.dispatchEvent) {
        document.dispatchEvent(new CustomEvent('x:clearance-granted'));
      }
    }

    function abortGame() {
      stopHoldTimer();
      game = freshGame();
      state.mode = 'idle';
      state.step = -1;
      input.value = '';
      setPlaceholder(null);
      printer.print('protocol aborted — channel remains SEALED', 'xt-err');
    }

    /* ---------------- idle-mode command dispatch ---------------- */

    function helpLines() {
      var gate = granted ? 'OPEN' : 'SEALED';
      return [
        'command       function',
        '-------       --------',
        'help          show this command list',
        'whoami        player identity + clearance state',
        'clearance     begin the clearance protocol (alias: protocol)',
        'contact       direct contact channel [' + gate + ']',
        'disclosures   regulatory disclosures',
        'scan          doctrinal exposure sweep',
        'matrix        signal saturation (8s)',
        'mandate       guided mandate inquiry [' + gate + ']',
        'uptime        uplink clock readout',
        'banner        reprint boot banner',
        'clear         clear terminal output',
        'exit          close session'
      ];
    }

    function printContact() {
      printer.printAll([
        'direct channel: ' + email,
        'channel key: ' + channelKey,
        'every granted channel read personally'
      ]);
    }

    function runCommand(cmd) {
      switch (cmd) {
        case 'help':
          printer.printAll(helpLines());
          break;
        case 'whoami':
          printer.print('PLAYER: EVIDENCE-SEEKER // CLEARANCE: ' +
            (granted ? 'GRANTED' : 'NONE'));
          break;
        case 'clearance':
        case 'protocol':
          startProtocol();
          break;
        case 'contact':
          if (granted) printContact(); else sealLine();
          break;
        case 'disclosures':
          printer.printAll(DISCLOSURE_LINES);
          break;
        case 'scan':
          runScan();
          break;
        case 'matrix':
          startRain();
          break;
        case 'uptime':
          printer.print('uplink ' +
            formatUplink(Math.floor((Date.now() - uplinkT0) / 1000)) +
            ' // sys.online');
          break;
        case 'banner':
          boot();
          break;
        case 'clear':
          printer.clear();
          break;
        case 'mandate':
          if (granted) startMandate(); else sealLine();
          break;
        case 'iddqd':
          printer.print('GOD MODE: narrative immunity already active', 'xt-ok');
          if (window.XENITH_FX && window.XENITH_FX.burst) {
            window.XENITH_FX.burst();
          }
          break;
        case 'xyzzy':
          printer.print('a hollow voice says: EVIDENCE.');
          break;
        case 'exit':
          printer.print(granted
            ? 'channel remains open — type contact'
            : "channel remains SEALED — type 'clearance'");
          break;
        default:
          printer.print("unrecognized command — type 'help'", 'xt-err');
      }
    }

    /* ---------------- events ---------------- */

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = input.value;
      input.value = '';
      if (state.mode === 'mandate') {
        printer.print('> ' + raw, 'xt-user');
        handleMandateInput(raw.trim());
        return;
      }
      if (state.mode === 'trial1') {
        printer.print('> ' + raw, 'xt-user');
        handleTrial1(raw.trim());
        return;
      }
      if (state.mode === 'hold-confirm') {
        printer.print('> ' + raw, 'xt-user');
        handleHoldConfirm(raw.trim());
        return;
      }
      if (state.mode === 'hold') {
        /* THE HOLD: any submitted input is an impulse. */
        if (raw) printer.print('> ' + raw, 'xt-user');
        impulse();
        return;
      }
      if (state.mode === 'trial3') {
        printer.print('> ' + raw, 'xt-user');
        handleTrial3(raw.trim());
        return;
      }
      var cmd = raw.trim();
      if (!cmd) return;
      printer.print('> ' + raw, 'xt-user');
      runCommand(cmd.toLowerCase());
    });

    /* THE HOLD: real text entry counts as an impulse even before Enter. */
    input.addEventListener('input', function () {
      if (state.mode === 'hold') impulse();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (state.mode === 'mandate') {
        abortMandate();
      } else if (gameActive()) {
        abortGame();
      }
    });

    /* Freeze the rain while the tab is hidden; the hold timer pauses
       itself inside holdTick via the same document.hidden check. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseRain(); else resumeRain();
    });

    root.addEventListener('click', function () {
      input.focus();
    });

    startUplink();
    armBoot();

    return { boot: boot, clear: printer.clear, print: printer.print };
  }

  function init(sel, opts) {
    var root = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!root || !root.querySelector) return null;
    if (root.__xenithTerminal) return root.__xenithTerminal;
    injectStyles();
    var api = createTerminal(root, opts || {});
    if (api) root.__xenithTerminal = api;
    return api;
  }

  window.XenithTerminal = { init: init, version: VERSION };

  function autoInit() {
    init('#x-terminal', { email: DEFAULT_EMAIL });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
