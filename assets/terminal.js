/* ==========================================================================
   XENITH CAPITAL — mandate-uplink terminal
   assets/terminal.js — owns #x-terminal. Vanilla JS, zero dependencies.
   Public API: window.XenithTerminal = { init(sel, opts), version }
   Auto-initializes on DOMContentLoaded against #x-terminal.
   Line classes (.xt-line/.xt-user/.xt-ok/.xt-err) and the matrix-rain overlay
   class (.xt-rain) are owned by this file; every contract selector stays with
   xenith.css.
   v2 additions: scan / matrix commands, uplink uptime clock, ADV + CRS links.
   ========================================================================== */
(function () {
  'use strict';

  var VERSION = '2.1.0';
  var DEFAULT_EMAIL = 'logan@xenithcap.io';
  var TYPE_MS = 12;          /* per-character cadence for system lines */
  var BOOT_GAP_MS = 130;     /* stagger between boot lines */
  var SEND_DELAY_MS = 1500;  /* pause before handing off to the mail client */
  var SCAN_GAP_MS = 400;     /* stagger between doctrinal scan lines */
  var MATRIX_TICK_MS = 90;   /* rain re-render cadence */
  var MATRIX_MS = 8000;      /* total rain duration */
  var STYLE_ID = 'xt-line-styles';
  var IDLE_PLACEHOLDER = "type 'help'";
  var IDLE_ARIA = 'Terminal input. Type help for commands.';

  var BOOT_LINES = [
    'XENITH CAPITAL // MANDATE UPLINK v2.1',
    'secure channel: ESTABLISHED',
    'encryption: TLS-GRADE // client-side only',
    "type 'help' for command list"
  ];

  var HELP_LINES = [
    'command       function',
    '-------       --------',
    'help          show this command list',
    'whoami        channel identity + clearance',
    'contact       direct contact channel',
    'disclosures   regulatory disclosures',
    'scan          doctrinal exposure sweep',
    'matrix        signal saturation (8s)',
    'mandate       begin guided mandate inquiry',
    'banner        reprint boot banner',
    'clear         clear terminal output',
    'exit          close session'
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
  var SCAN_CLEAN_LINE = '0 narrative positions found — portfolio CLEAN';

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
     the rain overlay. Colors mirror the design tokens (cyan / magenta / amber). */
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

    /* State machine: { mode:'idle' } or { mode:'mandate', step:0..3, data }. */
    var state = { mode: 'idle', step: -1, data: {} };

    /* Active matrix rain handle: { overlay, timer, endTimer } or null. */
    var rain = null;

    function setPlaceholder(text) {
      input.placeholder = text || IDLE_PLACEHOLDER;
      input.setAttribute('aria-label', text ? 'Mandate inquiry: ' + text : IDLE_ARIA);
    }

    /* ---------------- uplink uptime clock ---------------- */

    /* Appends a live "· UPLINK …" counter into the window title. The span is
       decorative chrome, so it is hidden from assistive tech; the 1s tick
       formats as mm:ss under an hour, then h:mm:ss. */
    function startUplink() {
      var title = root.querySelector('.x-term-title');
      if (!title) return;
      var t0 = Date.now();
      var clock = document.createElement('span');
      clock.setAttribute('aria-hidden', 'true');
      clock.textContent = ' · UPLINK 00:00:00';
      title.appendChild(clock);
      window.setInterval(function () {
        var s = Math.floor((Date.now() - t0) / 1000);
        var text;
        if (s < 3600) {
          text = pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
        } else {
          text = Math.floor(s / 3600) + ':' +
            pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60);
        }
        clock.textContent = ' · UPLINK ' + text;
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
      window.clearInterval(rain.timer);
      window.clearTimeout(rain.endTimer);
      if (rain.overlay.parentNode) {
        rain.overlay.parentNode.removeChild(rain.overlay);
      }
      rain = null;
      if (finished) printer.print('signal saturation complete', 'xt-ok');
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

    /* ---------------- idle-mode command dispatch ---------------- */

    function runCommand(cmd) {
      switch (cmd) {
        case 'help':
          printer.printAll(HELP_LINES);
          break;
        case 'whoami':
          printer.print('visitor: prospective mandate // clearance: PUBLIC');
          break;
        case 'contact':
          printer.printAll([
            'direct channel: ' + email,
            'every inquiry reviewed personally'
          ]);
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
        case 'banner':
          boot();
          break;
        case 'clear':
          printer.clear();
          break;
        case 'mandate':
          startMandate();
          break;
        case 'exit':
          printer.print('channel remains open — type contact');
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
      var cmd = raw.trim();
      if (!cmd) return;
      printer.print('> ' + raw, 'xt-user');
      runCommand(cmd.toLowerCase());
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.mode === 'mandate') abortMandate();
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
