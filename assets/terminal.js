/* ==========================================================================
   XENITH CAPITAL — SECURE CHANNEL TERMINAL v7 (FIELD INSTRUMENT)
   assets/terminal.js — owns #x-terminal inside #uplink (scene 05). Vanilla
   JS, zero deps.
   Public API: window.XenithTerminal = { init(sel), boot(), version }

   v7: the uplink is the console's secure-channel surface inside the FIELD
   INSTRUMENT scene grammar. The v4 multi-step clearance protocol — its
   state machine, persistence keys, and external event wiring — stays
   retired. What remains is the single-question analyst uplink.

   LAZY BOOT: nothing initializes at DOMContentLoaded. The terminal boots on
   IntersectionObserver of #uplink (threshold .2, once), or on the first
   focus/click/touch into the terminal — whichever comes first. boot() is
   idempotent and never steals focus on a scroll-driven boot.

   CHROME SYNC (runs at load, ahead of the lazy boot): the terminal title and
   session readout stay synchronized with the channel state. Authorization is
   session-scoped and never initializes the terminal before the scene is used.

   AUTHENTICATE — one local-console question: 'what survives contact: signal
   or noise?' Answer 'signal' marks the session verified and dispatches the
   existing visual event. The public console has no contact, inquiry, form,
   application, transmission, or mailto path.

   Kept from v4: ordered print pipeline + per-character typing, reduced-
   motion instant print, hidden-tab rain pause, uptime clock, scan, matrix
   rain, disclosures (both SEC URLs), whoami, banner, clear, exit, iddqd,
   xyzzy. Line classes (.xt-line/.xt-user/.xt-ok/.xt-err) and the rain
   overlay (.xt-rain) are styled by the injected block below.
   ========================================================================== */
(function () {
  'use strict';

  var VERSION = '7.1.0';
  var TYPE_MS = 12;            /* per-character cadence for system lines */
  var BOOT_GAP_MS = 130;       /* stagger between boot lines */
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
    'Xenith Capital is an investment adviser registered with the Texas State Securities Board.',
    'Registration does not imply a certain level of skill or training.',
    'Informational only — not an offer or solicitation.',
    'Investing involves risk. Past performance is not indicative of future results.',
    'Form ADV public filing: https://reports.adviserinfo.sec.gov/reports/ADV/316844/PDF/316844.pdf',
    'Public firm record (SEC IAPD): https://adviserinfo.sec.gov/firm/summary/316844'
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

  /* Inspector auth chip: #xi-auth-state lives in the scene-05 inspector,
     outside the terminal root. Flips SEALED → VERIFIED on grant, and
     restores at load when the tab already holds the grant. Idempotent. */
  function setAuthChipVerified() {
    var chip = document.getElementById('xi-auth-state');
    if (!chip) return;
    chip.textContent = 'VERIFIED';
    if (chip.classList) chip.classList.add('is-verified');
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
    var generation = 0;

    function scroll() {
      body.scrollTop = body.scrollHeight;
    }

    function makeLine(cls) {
      var el = document.createElement('div');
      el.className = 'xt-line' + (cls ? ' ' + cls : '');
      body.appendChild(el);
      return el;
    }

    function typeInto(el, text, ticket, done) {
      var i = 0;
      var timer = window.setInterval(function () {
        if (ticket !== generation) {
          window.clearInterval(timer);
          done();
          return;
        }
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
      var ticket = generation;
      chain = chain.then(function () {
        return new Promise(function (resolve) {
          if (ticket !== generation) {
            resolve();
            return;
          }
          var el = makeLine(cls);
          if (instant) {
            el.textContent = text;
            scroll();
            resolve();
          } else {
            typeInto(el, text, ticket, resolve);
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
      generation += 1;
      chain = Promise.resolve();
      body.textContent = '';
    }

    return { print: print, printAll: printAll, wait: wait, clear: clear };
  }

  function createTerminal(root) {
    var body = root.querySelector('.x-term-body');
    var form = root.querySelector('form.x-term-form');
    var input = root.querySelector('#x-term-input');
    if (!body || !form || !input) return null;

    var printer = makePrinter(body);

    /* State machine: idle or the local analyst-verification question. */
    var state = { mode: 'idle' };

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

    /* Appends a live session counter into the terminal title. The span is
       decorative chrome, so it is hidden from assistive tech; the 1s tick
       formats as mm:ss under an hour, then h:mm:ss. No work while hidden. */
    function startUplink() {
      var title = root.querySelector('.x-term-title');
      if (!title) return;
      var clock = document.createElement('span');
      clock.setAttribute('aria-hidden', 'true');
      clock.textContent = ' · SESSION 00:00';
      title.appendChild(clock);
      window.setInterval(function () {
        if (document.hidden) return;
        var s = Math.floor((Date.now() - uplinkT0) / 1000);
        clock.textContent = ' · SESSION ' + formatUplink(s);
      }, 1000);
    }

  /* v7 banner — printed once per page view, on lazy boot. */
    function bootLines() {
      return [
        'channel state: READY',
        'direct to: XENITH CAPITAL',
        "type 'help' to inspect the command set"
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
        printer.print('local research console ready');
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
      setAuthChipVerified();
      printer.print('analyst verified. channel open.', 'xt-ok');
      printer.print('local research console unlocked — no outbound channel connected');
      emit('x:auth-granted');
      emit('x:clearance-granted'); /* legacy listener (toast lane) */
    }

    function abortAuth() {
      state.mode = 'idle';
      input.value = '';
      setPlaceholder(null);
      printer.print('authentication aborted — channel remains sealed', 'xt-err');
    }

    /* ---------------- idle-mode command dispatch ---------------- */

    function helpLines() {
      return [
        'command       function',
        '-------       --------',
        'help          show this command list',
        'authenticate  verify analyst clearance',
        'fields        list the console fields',
        'go <field>    navigate to a field',
        'disclosures   regulatory disclosures',
        'scan          doctrinal exposure sweep',
        'matrix        signal saturation (8s)',
        'whoami        analyst identity + clearance state',
        'uptime        session clock readout',
        'banner        reprint boot banner',
        'clear         clear terminal output',
        'exit          close session'
      ];
    }

    /* ---------------- field navigation (x:navigate -> main.js) ---------- */

    var FIELD_ROUTES = [
      { n: 1, slug: 'architecture', name: 'PORTFOLIO ARCHITECTURE' },
      { n: 2, slug: 'research',     name: 'RESEARCH ENGINE' },
      { n: 3, slug: 'risk',         name: 'RISK DOCTRINE' },
      { n: 4, slug: 'firm',         name: 'THE FIRM' },
      { n: 5, slug: 'channel',      name: 'DIRECT CHANNEL' }
    ];

    function printFields() {
      printer.print('field  route         name');
      printer.print('-----  -----         ----');
      for (var i = 0; i < FIELD_ROUTES.length; i++) {
        var f = FIELD_ROUTES[i];
        printer.print('0' + f.n + '     ' +
          (f.slug + '             ').slice(0, 14) + f.name);
      }
      printer.print("navigate: go <route|number> — e.g. 'go risk' or 'go 3'");
    }

    function runGo(arg) {
      if (!arg) {
        printer.print("usage: go <field> — type 'fields' for the map", 'xt-err');
        return;
      }
      var target = null;
      for (var i = 0; i < FIELD_ROUTES.length; i++) {
        var f = FIELD_ROUTES[i];
        if (arg === String(f.n) || arg === '0' + f.n || f.slug.indexOf(arg) === 0) {
          target = f;
          break;
        }
      }
      if (!target) {
        printer.print("unknown field '" + arg + "' — type 'fields'", 'xt-err');
        return;
      }
      printer.print('navigating: field 0' + target.n + ' / ' + target.name, 'xt-ok');
      emit('x:navigate', { scene: target.n });
    }

    function runCommand(cmd) {
      if (cmd === 'go' || cmd.indexOf('go ') === 0) {
        runGo(cmd.slice(2).trim());
        return;
      }
      switch (cmd) {
        case 'help':
          printer.printAll(helpLines());
          break;
        case 'fields':
          printFields();
          break;
        case 'whoami':
          printer.print('ANALYST // CLEARANCE: ' +
            (granted ? 'GRANTED' : 'NONE'));
          break;
        case 'authenticate':
          startAuth();
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
          printer.print('session ' +
            formatUplink(Math.floor((Date.now() - uplinkT0) / 1000)) +
            ' // sys.online');
          break;
        case 'banner':
          bootBanner();
          break;
        case 'clear':
          printer.clear();
          break;
        case 'iddqd':
          printer.print('IDDQD: narrative immunity already active', 'xt-ok');
          if (window.XENITH_FX && window.XENITH_FX.burst) {
            window.XENITH_FX.burst();
          }
          break;
        case 'xyzzy':
          printer.print('a hollow voice says: EVIDENCE.');
          break;
        case 'exit':
          printer.print('local session remains ' +
            (granted ? 'verified' : 'sealed') + ' — no outbound channel connected');
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
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else {
          var submit = form.querySelector('[type="submit"]');
          if (submit) submit.click();
        }
        return;
      }
      if (e.key === 'Escape' && state.mode === 'auth') abortAuth();
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

  function init(sel) {
    var root = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!root || !root.querySelector) return null;
    if (root.__xenithTerminal) return root.__xenithTerminal;
    injectStyles();
    var api = createTerminal(root);
    if (api) root.__xenithTerminal = api;
    return api;
  }

  /* ---------------- v7 lazy boot ---------------- */

  var termApi = null;
  var booted = false;

  /* Idempotent: the first trigger initializes the terminal and prints the
     banner; every later trigger is a no-op. Never steals focus — scroll-
     driven boots stay passive, and click/focus boots already have the
     user's cursor. */
  function boot() {
    if (!termApi) termApi = init('#x-terminal');
    if (termApi && !booted) {
      booted = true;
      termApi.boot();
    }
    return termApi;
  }

  var rootEl = document.getElementById('x-terminal');
  var uplinkEl = document.getElementById('uplink');

  /* v7 chrome sync at load, ahead of the lazy boot: the scene markup is
     frozen with the v5 title, so it is corrected from here; a tab that
     already holds the grant gets the VERIFIED chip immediately — both are
     visible the first time scene 05 enters, booted or not. */
  var titleEl = rootEl ? rootEl.querySelector('.x-term-title') : null;
  if (titleEl) titleEl.textContent = 'XENITH // SECURE CHANNEL v7.1';
  if (storageGet(STORAGE_AUTH) === 'granted') setAuthChipVerified();

  /* Direct engagement beats the observer: if the user reaches the terminal
     before the scene scrolls into view, boot on first contact. */
  if (rootEl) {
    rootEl.addEventListener('focusin', boot);
    rootEl.addEventListener('click', boot);
    rootEl.addEventListener('touchstart', boot, { passive: true });
  }

  function channelActive() {
    return !!(uplinkEl && !uplinkEl.hasAttribute('aria-hidden'));
  }

  document.addEventListener('x:field-selected', function (e) {
    if (e && e.detail && e.detail.scene === 5) boot();
  });

  if (uplinkEl && typeof IntersectionObserver === 'function') {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting && channelActive()) {
          io.disconnect();
          boot();
          break;
        }
      }
    }, { threshold: 0.2 });
    io.observe(uplinkEl);
  } else if (rootEl && typeof IntersectionObserver !== 'function' && channelActive()) {
    /* Legacy engines still respect the active-field gate. */
    boot();
  }

  window.XenithTerminal = { init: init, boot: boot, version: VERSION };
})();
