/* ==========================================================================
   XENITH CAPITAL — UPLINK TERMINAL v5 (CLASSIFIED DOSSIER)
   assets/terminal.js — owns #x-terminal inside #uplink. Vanilla JS, zero deps.
   Public API: window.XenithTerminal = { init(sel, opts), boot(), version }

   v5: the uplink is a dossier surface. The v4 multi-step clearance
   protocol — its state machine, persistence keys, and external event
   wiring — is deleted. What remains is the dossier uplink.

   LAZY BOOT: nothing initializes at DOMContentLoaded. The terminal boots on
   IntersectionObserver of #uplink (threshold .25, once), or on the first
   focus/click/touch into the terminal — whichever comes first. boot() is
   idempotent and never steals focus on a scroll-driven boot.

   AUTHENTICATE — one question: 'what survives contact: signal or noise?'
   Answer 'signal' → analyst verified: sessionStorage xv_auth=granted, and
   both x:auth-granted and x:clearance-granted (legacy listener) dispatch.
   Anything else → denied, retry allowed; ESC aborts. contact and mandate
   stay SEALED until granted. inquiry@xenithcap.io exists ONLY inside the
   contact/mandate flows (guided mandate: name → email → capital band
   [1] $1M–$5M [2] $5M–$25M [3] $25M+ [4] below $1M — band 4 prints the
   fixed not-a-fit line and closes gracefully; bands 1–3 hand off to the
   mail client).

   Kept from v4: ordered print pipeline + per-character typing, reduced-
   motion instant print, hidden-tab rain pause, uptime clock, scan, matrix
   rain, disclosures (both SEC URLs), whoami, banner, clear, exit, iddqd,
   xyzzy. Line classes (.xt-line/.xt-user/.xt-ok/.xt-err) and the rain
   overlay (.xt-rain) are styled by the injected block below.
   ========================================================================== */
(function () {
  'use strict';

  var VERSION = '5.0.0';
  var DEFAULT_EMAIL = 'inquiry@xenithcap.io';
  var TYPE_MS = 12;            /* per-character cadence for system lines */
  var BOOT_GAP_MS = 130;       /* stagger between boot lines */
  var SEND_DELAY_MS = 1500;    /* pause before handing off to the mail client */
  var SCAN_GAP_MS = 400;       /* stagger between doctrinal scan lines */
  var MATRIX_TICK_MS = 90;     /* rain re-render cadence */
  var MATRIX_MS = 8000;        /* total rain duration */
  var STYLE_ID = 'xt-line-styles';
  var IDLE_PLACEHOLDER = "type 'help'";
  var IDLE_ARIA = 'Terminal input. Type help for commands.';
  var STORAGE_AUTH = 'xv_auth';
  var AUTH_ANSWER = 'signal';
  var AUTH_QUESTION = 'what survives contact: signal or noise?';

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

  /* Full-width glyphs keep the rain grid aligned in the mono font. */
  var RAIN_GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ' +
    'ハヒフヘホマミムメモヤユヨラリルレロワヲン０１２３４５６７８９';
  var RAIN_COL_PX = 12;
  var RAIN_ROW_PX = 15;

  /* Capital bands live ONLY inside this mandate flow — never on a screen. */
  var BAND_LABELS = {
    '1': '$1M–$5M',
    '2': '$5M–$25M',
    '3': '$25M+',
    '4': 'below $1M'
  };

  var BAND_MENU = [
    '  [1] $1M–$5M',
    '  [2] $5M–$25M',
    '  [3] $25M+',
    '  [4] below $1M'
  ];

  /* Band 4 prints exactly this line, then the flow ends gracefully. */
  var BAND4_LINE = 'xenith is built for concentrated evidence-directed mandates; below $1M the fit is usually wrong — the doctrine is free, take it with you.';

  var EMAIL_RE = /.+@.+\..+/;

  /* Guided-flow steps: name → email → capital band → objective. */
  var STEPS = [
    { key: 'name',      prompt: 'step 1/4 — full name:',            placeholder: 'full name' },
    { key: 'email',     prompt: 'step 2/4 — contact email:',        placeholder: 'you@domain.tld' },
    { key: 'band',      prompt: 'step 3/4 — capital band:',         placeholder: 'enter 1-4' },
    { key: 'objective', prompt: 'step 4/4 — objective (one line):', placeholder: 'one-line objective' }
  ];

  /* ONE style block, scoped strictly to this widget's own line classes and
     the rain overlay. Colors mirror the v5 palette (phosphor cyan / alert
     amber); alert red stays on the chrome owned by xenith.css. */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent =
      '.xt-line{color:inherit;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.xt-user{color:#00f0ff}' +
      '.xt-ok{color:#00f0ff}' +
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

  /* One dispatch path for page-level contract events. */
  function emit(name, detail) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;
    document.dispatchEvent(new CustomEvent(name,
      detail === undefined ? undefined : { detail: detail }));
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

    function clear() {
      body.textContent = '';
    }

    return { print: print, printAll: printAll, wait: wait, clear: clear };
  }

  function createTerminal(root, opts) {
    var body = root.querySelector('.x-term-body');
    var form = root.querySelector('form.x-term-form');
    var input = root.querySelector('#x-term-input');
    if (!body || !form || !input) return null;

    var email = (opts && opts.email) || DEFAULT_EMAIL;
    var printer = makePrinter(body);

    /* State machine: { mode:'idle' } | { mode:'auth' } |
       { mode:'mandate', step:0..3, data }. */
    var state = { mode: 'idle', step: -1, data: {} };

    /* Clearance gate: per-tab persistence. */
    var granted = storageGet(STORAGE_AUTH) === 'granted';

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

    /* v5.0 banner — printed once per page view, on lazy boot. */
    function bootLines() {
      return [
        'XENITH CAPITAL // UPLINK v5.0',
        'secure channel: READY',
        "type 'help' for command list"
      ];
    }

    function bootBanner() {
      var lines = bootLines();
      for (var i = 0; i < lines.length; i++) {
        if (i > 0) printer.wait(BOOT_GAP_MS);
        printer.print(lines[i]);
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

    /* ---------------- authenticate (one question) ---------------- */

    function startAuth() {
      if (granted) {
        printer.print('channel already open — analyst verified', 'xt-ok');
        printer.print("type 'contact' or 'mandate'");
        return;
      }
      state.mode = 'auth';
      setPlaceholder('signal or noise');
      printer.print('AUTHENTICATE // one question', 'xt-ok');
      printer.print(AUTH_QUESTION);
    }

    function handleAuthInput(v) {
      v = v.toLowerCase();
      if (!v) { printer.print(AUTH_QUESTION); return; }
      if (v !== AUTH_ANSWER) {
        printer.print('clearance denied. think like an analyst.', 'xt-err');
        printer.print(AUTH_QUESTION);
        return;
      }
      state.mode = 'idle';
      setPlaceholder(null);
      granted = true;
      storageSet(STORAGE_AUTH, 'granted');
      printer.print('analyst verified. channel open.', 'xt-ok');
      printer.print("type 'contact' for the direct channel — 'mandate' for the guided inquiry");
      emit('x:auth-granted');
      emit('x:clearance-granted'); /* legacy listener (toast lane) */
    }

    function abortAuth() {
      state.mode = 'idle';
      input.value = '';
      setPlaceholder(null);
      printer.print('authentication aborted — channel remains sealed', 'xt-err');
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
          if (v === '4') {
            /* Below-fit band: print the exact not-a-fit line and end the
               flow gracefully — no transmission prepared, no mail handoff. */
            state.mode = 'idle';
            state.step = -1;
            state.data = {};
            setPlaceholder(null);
            printer.print(BAND4_LINE);
            printer.print('mandate flow closed — no transmission sent');
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

    /* ---------------- idle-mode command dispatch ---------------- */

    function sealLine() {
      printer.print('channel sealed — type authenticate', 'xt-err');
    }

    function helpLines() {
      var gate = granted ? 'OPEN' : 'SEALED';
      return [
        'command       function',
        '-------       --------',
        'help          show this command list',
        'authenticate  verify analyst clearance',
        'contact       direct contact channel [' + gate + ']',
        'mandate       guided mandate inquiry [' + gate + ']',
        'disclosures   regulatory disclosures',
        'scan          doctrinal exposure sweep',
        'matrix        signal saturation (8s)',
        'whoami        analyst identity + clearance state',
        'uptime        uplink clock readout',
        'banner        reprint boot banner',
        'clear         clear terminal output',
        'exit          close session'
      ];
    }

    function printContact() {
      printer.printAll([
        'direct channel: ' + email,
        'every transmission read personally'
      ]);
    }

    function runCommand(cmd) {
      switch (cmd) {
        case 'help':
          printer.printAll(helpLines());
          break;
        case 'whoami':
          printer.print('ANALYST // CLEARANCE: ' +
            (granted ? 'GRANTED' : 'NONE'));
          break;
        case 'authenticate':
          startAuth();
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
          bootBanner();
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
            : 'channel remains sealed — type authenticate');
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
      if (state.mode === 'auth') {
        printer.print('> ' + raw, 'xt-user');
        handleAuthInput(raw.trim());
        return;
      }
      var cmd = raw.trim();
      if (!cmd) return;
      printer.print('> ' + raw, 'xt-user');
      runCommand(cmd.toLowerCase());
    });

    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (state.mode === 'mandate') {
        abortMandate();
      } else if (state.mode === 'auth') {
        abortAuth();
      }
    });

    /* Freeze the rain while the tab is hidden; the uptime tick skips hidden
       frames inside its own interval. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseRain(); else resumeRain();
    });

    root.addEventListener('click', function () {
      input.focus();
    });

    function focusInput() {
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
    }

    startUplink();

    return {
      boot: bootBanner,
      clear: printer.clear,
      print: printer.print,
      focus: focusInput
    };
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

  /* ---------------- v5 lazy boot ---------------- */

  var termApi = null;
  var booted = false;

  /* Idempotent: the first trigger initializes the terminal and prints the
     banner; every later trigger is a no-op. Never steals focus — scroll-
     driven boots stay passive, and click/focus boots already have the
     user's cursor. */
  function boot() {
    if (!termApi) termApi = init('#x-terminal', { email: DEFAULT_EMAIL });
    if (termApi && !booted) {
      booted = true;
      termApi.boot();
    }
    return termApi;
  }

  var rootEl = document.getElementById('x-terminal');
  var uplinkEl = document.getElementById('uplink');

  /* Direct engagement beats the observer: if the user reaches the terminal
     before it scrolls a quarter into view, boot on first contact. */
  if (rootEl) {
    rootEl.addEventListener('focusin', boot);
    rootEl.addEventListener('click', boot);
    rootEl.addEventListener('touchstart', boot, { passive: true });
  }

  if (uplinkEl && typeof IntersectionObserver === 'function') {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          boot();
          break;
        }
      }
    }, { threshold: 0.25 });
    io.observe(uplinkEl);
  } else if (rootEl && typeof IntersectionObserver !== 'function') {
    /* Legacy engines without an observer boot immediately. */
    boot();
  }

  window.XenithTerminal = { init: init, boot: boot, version: VERSION };
})();
