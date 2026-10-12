/* Xenith Capital: the command hub engine.
   Dot-matrix globe with live data arcs, regime gauge, allocation bars, intercept feed, glitch layer, readouts.
   Everything on screen is an illustrative simulation. No network calls, no storage, no cookies. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('live')) return;
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var GL = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&@*+=<>/\\';
  var CY = '#00f0ff', PK = '#ff2bd6', AC = '#b6ff3b', VI = '#8a5cff';

  /* ---------- decrypt text ---------- */
  function decrypt(el, text, ms) {
    if (!el) return;
    if (RM) { el.textContent = text; return; }
    var t0 = performance.now(), dur = ms || 420;
    if (el._dk) cancelAnimationFrame(el._dk);
    (function step(now) {
      var k = clamp((now - t0) / dur, 0, 1), n = Math.floor(text.length * k), s = text.slice(0, n);
      for (var i = n; i < text.length; i++) s += text[i] === ' ' ? ' ' : GL[(Math.random() * GL.length) | 0];
      el.textContent = s;
      if (k < 1) el._dk = requestAnimationFrame(step); else { el.textContent = text; el._dk = 0; }
    })(t0);
  }

  /* ---------- clocks ---------- */
  var clocks = $$('.ck b').map(function (b) {
    var f; try { f = new Intl.DateTimeFormat('en-GB', { timeZone: b.getAttribute('data-tz'), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { f = null; }
    return { el: b, f: f };
  });
  function tick() { var d = new Date(); clocks.forEach(function (c) { if (c.f) c.el.textContent = c.f.format(d); }); }
  tick(); setInterval(tick, 1000);

  /* ---------- redacted name flicker (random glyphs only; the real name is never on the page) ---------- */
  var reds = $$('.rd');
  function leak() {
    var el = pick(reds), base = '██████', s = '';
    for (var i = 0; i < base.length; i++) s += Math.random() < 0.38 ? GL[(Math.random() * 24) | 0] : '█';
    el.textContent = s; el.classList.add('leak');
    setTimeout(function () { el.textContent = base; el.classList.remove('leak'); }, rnd(70, 190));
    setTimeout(leak, rnd(900, 2600));
  }
  if (!RM) setTimeout(leak, 1200);

  /* ---------- screen tear + headline burst ---------- */
  var hub = $('#hub'), h1 = $('.glitch'), tears = $$('.tears i');
  function tear() {
    hub.classList.add('tear'); h1.classList.add('burst');
    tears.forEach(function (t) {
      if (Math.random() < 0.7) {
        t.style.top = rnd(4, 94) + '%'; t.style.height = rnd(2, 16) + 'px';
        t.style.transform = 'translateX(' + rnd(-30, 30) + 'px)'; t.style.opacity = '1';
      }
    });
    setTimeout(function () { hub.classList.remove('tear'); tears.forEach(function (t) { t.style.opacity = '0'; }); }, 190);
    setTimeout(function () { h1.classList.remove('burst'); }, 320);
    setTimeout(tear, rnd(3800, 8500));
  }
  if (!RM) setTimeout(tear, 2600);

  /* ---------- regime: signals + gauge ---------- */
  var sigRows = $$('#sig li').map(function (li) { return { bar: $('s i', li), num: $('b', li), v: rnd(-0.6, 0.6) }; });
  var post = $('#posture'), gauge = $('#gauge'), gctx = gauge.getContext('2d');
  var regT = 0, regV = 0, lastPost = '';
  var W8 = [0.22, 0.14, 0.2, 0.16, 0.18, 0.1];
  function postureOf(v) { return v < -0.5 ? 'RISK-OFF' : v < -0.15 ? 'DEFENSIVE' : v < 0.15 ? 'NEUTRAL' : v < 0.5 ? 'CONSTRUCTIVE' : 'RISK-ON'; }
  function stepSignals() {
    var drift = rnd(-0.25, 0.25), sum = 0;
    sigRows.forEach(function (r, i) {
      r.v = clamp(r.v * 0.86 + drift * 0.5 + rnd(-0.32, 0.32), -1, 1);
      var w = Math.abs(r.v) * 50;
      r.bar.style.width = w + '%'; r.bar.style.left = (r.v < 0 ? 50 - w : 50) + '%';
      r.bar.classList.toggle('n', r.v < 0);
      decrypt(r.num, (r.v >= 0 ? '+' : '−') + Math.abs(r.v).toFixed(2), 300);
      sum += r.v * W8[i];
    });
    regT = clamp(sum * 1.7, -1, 1);
    var p = postureOf(regT);
    if (p !== lastPost) { decrypt(post, p, 520); lastPost = p; }
  }
  function sizeCanvas(c, ctx) {
    var r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d));
    ctx.setTransform(d, 0, 0, d, 0, 0); return { w: r.width, h: r.height };
  }
  var gs = { w: 1, h: 1 };
  function drawGauge(t) {
    var w = gs.w, h = gs.h; gctx.clearRect(0, 0, w, h);
    var R = Math.min(w / 2 - 6, h - 12), cx = w / 2, cy = h - 4;
    if (R < 10) return;
    var N = 44, a0 = Math.PI, val = (regV + 1) / 2;
    for (var i = 0; i < N; i++) {
      var f = i / (N - 1), a = a0 + f * Math.PI, on = f <= val;
      var col = f < 0.5 ? mix([255, 43, 214], [138, 92, 255], f * 2) : mix([138, 92, 255], [0, 240, 255], (f - 0.5) * 2);
      gctx.strokeStyle = 'rgba(' + col + ',' + (on ? 0.95 : 0.26) + ')';
      gctx.lineWidth = Math.max(2, R * 0.11);
      gctx.beginPath(); gctx.arc(cx, cy, R * 0.86, a + 0.012, a + Math.PI / N - 0.012); gctx.stroke();
    }
    gctx.strokeStyle = 'rgba(0,240,255,.25)'; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.arc(cx, cy, R * 0.68, Math.PI, 2 * Math.PI); gctx.stroke();
    for (var k = 0; k <= 10; k++) {
      var ta = Math.PI + k / 10 * Math.PI, r1 = R * 0.62, r2 = R * (k % 5 ? 0.66 : 0.7);
      gctx.beginPath(); gctx.moveTo(cx + Math.cos(ta) * r1, cy + Math.sin(ta) * r1); gctx.lineTo(cx + Math.cos(ta) * r2, cy + Math.sin(ta) * r2); gctx.stroke();
    }
    var na = Math.PI + val * Math.PI + (RM ? 0 : Math.sin(t * 9) * 0.006);
    gctx.shadowColor = '#fff'; gctx.shadowBlur = 12; gctx.strokeStyle = '#fff'; gctx.lineWidth = 2;
    gctx.beginPath(); gctx.moveTo(cx, cy); gctx.lineTo(cx + Math.cos(na) * R * 0.94, cy + Math.sin(na) * R * 0.94); gctx.stroke();
    gctx.shadowBlur = 0; gctx.fillStyle = '#fff'; gctx.beginPath(); gctx.arc(cx, cy, 3.5, 0, 7); gctx.fill();
    gctx.fillStyle = 'rgba(0,240,255,.8)'; gctx.font = '600 ' + Math.max(9, R * 0.16) + 'px "JetBrains Mono",monospace'; gctx.textAlign = 'center';
    gctx.fillText((regV >= 0 ? '+' : '−') + Math.abs(regV).toFixed(2), cx, cy - R * 0.3);
  }
  function mix(a, b, f) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * f); }).join(','); }

  /* ---------- allocation ---------- */
  var alRows = $$('#al li').map(function (li) { return { b: $('b', li), em: $('em', li), bar: $('s i', li), w: 25 }; });
  var stack = $$('#stack i'), tiltEl = $('#tilt');
  function stepAlloc() {
    var v = regT;
    var tg = [34 + 12 * v, 22 - 3 * v, 18 + 3 * v, 16 - 7 * v, 10 - 5 * v].map(function (x) { return Math.max(2, x + rnd(-2, 2)); });
    var s = tg.reduce(function (a, b) { return a + b; }, 0), moved = false;
    tg = tg.map(function (x) { return Math.round(x / s * 100); });
    tg[0] += 100 - tg.reduce(function (a, b) { return a + b; }, 0);
    alRows.forEach(function (r, i) {
      var d = tg[i] - r.w; r.w = tg[i];
      if (d) moved = true;
      decrypt(r.b, tg[i] + '%', 380);
      r.em.textContent = d > 0 ? '▲' : d < 0 ? '▼' : '·';
      r.em.className = d > 0 ? 'up' : d < 0 ? 'dn' : '';
      r.bar.style.width = tg[i] + '%';
      stack[i].style.flexBasis = tg[i] + '%';
    });
    decrypt(tiltEl, moved ? pick(['REBALANCING', 'TILTING', 'REWEIGHTING']) : 'HOLD', 420);
    setTimeout(function () { decrypt(tiltEl, 'ARMED', 300); }, 1500);
  }

  /* ---------- intercept feed ---------- */
  var feed = $('#lines');
  var N = function (a, b) { return Math.round(rnd(a, b)).toLocaleString('en-US'); };
  var hex = function () { return (Math.random() * 0xffff | 0).toString(16).toUpperCase().padStart(4, '0'); };
  var T = [
    function () { return ['c', 'INGEST', N(3900, 4400) + ' SERIES … <span class="ok">OK</span>']; },
    function () { return ['c', 'PARSE', N(120, 480) + ' FILINGS · 10-K / 10-Q / 8-K']; },
    function () { return ['v', 'MODEL', 'CONSENSUS ' + rnd(0.52, 0.88).toFixed(2) + ' · ' + ((Math.random() * 3 | 0) + 4) + '/7 AGREE']; },
    function () { return ['p', 'DISSENT', 'FLAGGED · MODEL ' + pick(['B', 'C', 'E', 'F']) + ' · CONFIDENCE ' + rnd(0.3, 0.6).toFixed(2)]; },
    function () { return ['w', 'ANALYST', 'REVIEW · HUMAN IN THE LOOP']; },
    function () { var hx = hex(), ls = document.getElementById('lastsig'); if (ls) decrypt(ls, '#' + hx, 400); return ['a', 'DECISION', 'LOGGED · #' + hx + ' · SIGNED']; },
    function () { return ['c', 'REGIME', 'RECOMPUTE · POSTURE ' + postureOf(regT)]; },
    function () { return ['v', 'CORR', 'CROSS-ASSET SCAN · ' + N(900, 1600) + ' PAIRS']; },
    function () { return ['g', 'RATES', 'CURVE 2s10s · ' + (rnd(-40, 80) | 0) + 'bp']; },
    function () { return ['c', 'CREDIT', 'SPREADS · HY OAS ' + (rnd(280, 520) | 0) + 'bp']; },
    function () { return ['p', 'LINK', pick(['NYC', 'LON', 'FRA', 'TYO', 'HKG', 'CHI']) + ' ⇄ ' + pick(['AUS', 'NYC', 'LON', 'TYO']) + ' · ' + (rnd(8, 190) | 0) + 'ms']; },
    function () { return ['w', 'OVERRIDE', 'ANALYST REJECTS ' + ((Math.random() * 4 | 0) + 1) + ' MODEL CALL' + (Math.random() < .5 ? '' : 'S')]; },
    function () { return ['a', 'HANDOFF', 'MACHINE → FIDUCIARY · NO AUTONOMOUS TRADES']; },
    function () { return ['v', 'SCORE', 'MODEL CALIBRATION · DRIFT ' + rnd(0, 0.04).toFixed(3)]; }
  ];
  var seq = [0, 1, 2, 3, 4, 5], qi = 0;
  function nextLine() {
    var tpl = qi < seq.length ? T[seq[qi++]] : pick(T), r = tpl();
    var d = new Date(), ts = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(function (x) { return x < 10 ? '0' + x : '' + x; }).join(':');
    var li = document.createElement('li');
    li.innerHTML = '<span class="ts">' + ts + 'Z</span><span class="t ' + r[0] + '">' + r[1] + '</span><span class="m"></span>';
    $$('.cur', feed).forEach(function (x) { x.classList.remove('cur'); });
    li.classList.add('cur');
    feed.appendChild(li);
    var m = $('.m', li), tmp = document.createElement('span'); tmp.innerHTML = r[2];
    var plain = tmp.textContent;
    if (RM) m.innerHTML = r[2];
    else {
      decrypt(m, plain, 360);
      setTimeout(function () { m.innerHTML = r[2]; }, 400);
    }
    while (feed.children.length > 18) feed.removeChild(feed.firstChild);
    setTimeout(nextLine, RM ? 2600 : rnd(420, 1150));
  }

  /* ---------- readouts ---------- */
  var veil = $('#veil'), openRo = null, lastFocus = null;
  function openReadout(id) {
    var ro = document.getElementById(id); if (!ro || openRo) return;
    lastFocus = document.activeElement; openRo = ro;
    ro.classList.add('open'); veil.classList.add('on'); hub.inert = true;
    $$('[data-d]', ro).forEach(function (el) { if (!el._t) el._t = el.textContent; decrypt(el, el._t, 520); });
    var x = $('.x', ro); if (x) x.focus();
  }
  function closeReadout() {
    if (!openRo) return;
    openRo.classList.remove('open'); veil.classList.remove('on'); hub.inert = false; openRo = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$('.pn, .chip').forEach(function (el) {
    if (el.classList.contains('pn')) { el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-haspopup', 'dialog'); }
    el.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) return;
      openReadout(el.getAttribute('data-ro'));
    });
    el.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); openReadout(el.getAttribute('data-ro')); }
    });
  });
  $$('.ro .x').forEach(function (b) { b.addEventListener('click', closeReadout); });
  veil.addEventListener('click', closeReadout);
  document.addEventListener('keydown', function (e) {
    if (!openRo) return;
    if (e.key === 'Escape') { e.preventDefault(); closeReadout(); return; }
    if (e.key === 'Tab') {
      var f = $$('a,button', openRo); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  /* ---------- phone tabs ---------- */
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('.tab').forEach(function (x) { x.classList.toggle('act', x === t); });
      $$('.pn').forEach(function (p) { p.classList.toggle('act', p.id === t.getAttribute('data-p')); });
      resize();
    });
  });

  /* ---------- the globe ---------- */
  var fx = $('#fx'), ctx = fx.getContext('2d'), core = $('#core'), kick = $('.kick', core), low = $('.low', core);
  var raw = atob(window.XG || ''), n = raw.length >> 2;
  var PC = new Float32Array(n), PS = new Float32Array(n), PL = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var la = ((raw.charCodeAt(4 * i) | raw.charCodeAt(4 * i + 1) << 8) << 16 >> 16) / 100;
    var lo = ((raw.charCodeAt(4 * i + 2) | raw.charCodeAt(4 * i + 3) << 8) << 16 >> 16) / 100;
    la *= Math.PI / 180; PC[i] = Math.cos(la); PS[i] = Math.sin(la); PL[i] = lo * Math.PI / 180;
  }
  function vec(lat, lon) { lat *= Math.PI / 180; lon *= Math.PI / 180; return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]; }
  var CITIES = [
    { k: 'NYC', v: vec(40.71, -74.01) }, { k: 'LON', v: vec(51.51, -0.13) }, { k: 'FRA', v: vec(50.11, 8.68) },
    { k: 'TYO', v: vec(35.68, 139.69) }, { k: 'HKG', v: vec(22.32, 114.17) }, { k: 'CHI', v: vec(41.88, -87.63) },
    { k: 'AUS', v: vec(30.27, -97.74), hq: 1 }
  ];
  var rot = 0.95, TILT = 0.36, ct = Math.cos(TILT), st = Math.sin(TILT);
  var G = { cx: 0, cy: 0, R: 100 }, VW = 1, VH = 1;
  // project a unit (or lifted) vector in globe frame -> [sx, sy, z, visible]
  function proj(x, y, z, out) {
    var cr = Math.cos(rot), sr = Math.sin(rot);
    var x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
    var y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
    out[0] = G.cx + x1 * G.R; out[1] = G.cy - y2 * G.R; out[2] = z2;
    out[3] = z2 > 0 || (x1 * x1 + y2 * y2) > 1 ? 1 : 0;
    return out;
  }
  function slerp(a, b, t, h, out) {
    var d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1), w = Math.acos(d), s = Math.sin(w) || 1e-6;
    var ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s, lift = 1 + h * Math.sin(Math.PI * t);
    out[0] = (a[0] * ka + b[0] * kb) * lift; out[1] = (a[1] * ka + b[1] * kb) * lift; out[2] = (a[2] * ka + b[2] * kb) * lift;
    return out;
  }
  var arcs = [], spawnT = 0, bursts = [], lock = { i: 6, age: 0, hold: 2.4 }, sat = 0;
  function spawnArc() {
    var a = Math.random() < 0.35 ? CITIES[6] : pick(CITIES), b = pick(CITIES);
    if (a === b) return;
    var d = Math.acos(clamp(a.v[0] * b.v[0] + a.v[1] * b.v[1] + a.v[2] * b.v[2], -1, 1));
    var r = Math.random();
    arcs.push({ a: a.v, b: b.v, h: 0.06 + 0.32 * d / Math.PI, age: 0, life: rnd(4.5, 8), col: r < 0.5 ? CY : r < 0.88 ? PK : AC, sp: rnd(0.32, 0.55), ph: Math.random() });
  }
  var tmpA = [0, 0, 0], tmpB = [0, 0, 0, 0], tmpC = [0, 0, 0, 0];
  function drawArc(A, dt) {
    A.age += dt;
    var grow = clamp(A.age / 0.9, 0, 1), fade = clamp((A.life - A.age) / 0.8, 0, 1), alpha = fade;
    if (A.age > A.life) return false;
    if (!A.hit && A.age > 0.9) { A.hit = 1; bursts.push({ v: A.b, age: 0, col: A.col }); }
    var S = 46, end = Math.floor(S * grow);
    ctx.strokeStyle = A.col; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.9 * alpha; ctx.shadowColor = A.col; ctx.shadowBlur = 10;
    ctx.beginPath(); var pen = false;
    for (var s = 0; s <= end; s++) {
      slerp(A.a, A.b, s / S, A.h, tmpA); proj(tmpA[0], tmpA[1], tmpA[2], tmpB);
      if (tmpB[3]) { if (pen) ctx.lineTo(tmpB[0], tmpB[1]); else { ctx.moveTo(tmpB[0], tmpB[1]); pen = true; } } else pen = false;
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    if (grow >= 1) {
      for (var q = 0; q < 3; q++) {
        var tp = ((A.age * A.sp + A.ph + q / 3) % 1);
        for (var tr = 0; tr < 9; tr++) {
          var tt = tp - tr * 0.011; if (tt < 0) continue;
          slerp(A.a, A.b, tt, A.h, tmpA); proj(tmpA[0], tmpA[1], tmpA[2], tmpC);
          if (!tmpC[3]) continue;
          ctx.globalAlpha = alpha * (1 - tr / 9);
          ctx.fillStyle = tr ? A.col : '#fff';
          var sz = tr ? 3.4 - tr * 0.3 : 4;
          ctx.fillRect(tmpC[0] - sz / 2, tmpC[1] - sz / 2, sz, sz);
          if (!tr) { ctx.shadowColor = A.col; ctx.shadowBlur = 18; ctx.fillRect(tmpC[0] - 2, tmpC[1] - 2, 4, 4); ctx.shadowBlur = 0; }
        }
      }
    }
    ctx.globalAlpha = 1;
    return true;
  }
  /* background: dot grid + drifting data columns */
  var bg = document.createElement('canvas'), bgx = bg.getContext('2d'), cols = [];
  function buildBg(w, h, d) {
    bg.width = Math.round(w * d); bg.height = Math.round(h * d); bgx.setTransform(d, 0, 0, d, 0, 0);
    bgx.fillStyle = 'rgba(0,240,255,.07)';
    for (var x = 12; x < w; x += 26) for (var y = 12; y < h; y += 26) bgx.fillRect(x, y, 1, 1);
    cols = [];
    var nc = Math.max(6, Math.round(w / 110));
    for (var c = 0; c < nc; c++) cols.push({ x: rnd(0, w), y: rnd(-h, h), v: rnd(18, 60), s: '' + Array.apply(null, Array(18)).map(function () { return GL[(Math.random() * GL.length) | 0]; }).join(''), c: Math.random() < 0.5 ? VI : CY });
  }
  function resize() {
    var d = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth; VH = window.innerHeight;
    fx.width = Math.round(VW * d); fx.height = Math.round(VH * d); ctx.setTransform(d, 0, 0, d, 0, 0);
    buildBg(VW, VH, d);
    var cr = core.getBoundingClientRect(), kr = kick.getBoundingClientRect(), lr = low.getBoundingClientRect();
    var top = (kr.height ? kr.bottom : cr.top) + 6, bot = lr.top + lr.height * 0.18, avail = bot - top;
    var R = Math.min(cr.width / 2 / 1.3, avail / 2 / 1.12);
    G.cx = cr.left + cr.width / 2; G.cy = top + avail / 2; G.R = Math.max(60, R);
    root.setAttribute('data-g', [Math.round(G.cx), Math.round(G.cy), Math.round(G.R)].join(','));
    gs = sizeCanvas(gauge, gctx);
  }
  var pt = [0, 0, 0, 0];
  function drawGlobe(t, dt) {
    var cx = G.cx, cy = G.cy, R = G.R;
    // atmosphere
    var g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.35);
    g.addColorStop(0, 'rgba(0,240,255,.10)'); g.addColorStop(0.72, 'rgba(0,240,255,.07)'); g.addColorStop(0.75, 'rgba(138,92,255,.10)'); g.addColorStop(1, 'rgba(138,92,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(2,6,16,.55)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    // graticule (lat lines)
    ctx.strokeStyle = 'rgba(0,240,255,.13)'; ctx.lineWidth = 1;
    for (var mo = -180; mo < 180; mo += 30) {
      ctx.beginPath(); var pm = false;
      for (var ml = -80; ml <= 80; ml += 5) {
        var mv = vec(ml, mo); proj(mv[0], mv[1], mv[2], pt);
        if (pt[2] > 0) { if (pm) ctx.lineTo(pt[0], pt[1]); else { ctx.moveTo(pt[0], pt[1]); pm = true; } } else pm = false;
      }
      ctx.stroke();
    }
    for (var la = -60; la <= 60; la += 30) {
      ctx.beginPath(); var pen = false;
      for (var lo = -180; lo <= 180; lo += 6) {
        var v = vec(la, lo); proj(v[0], v[1], v[2], pt);
        if (pt[2] > 0) { if (pen) ctx.lineTo(pt[0], pt[1]); else { ctx.moveTo(pt[0], pt[1]); pen = true; } } else pen = false;
      }
      ctx.stroke();
    }
    // land dots: back faint, front bright by depth
    var cr = Math.cos(rot), sr = Math.sin(rot), sz = Math.max(1.3, R / 165);
    var buckets = [[], [], [], []], back = [];
    for (var i = 0; i < n; i++) {
      var x = PC[i] * Math.sin(PL[i]), y = PS[i], z = PC[i] * Math.cos(PL[i]);
      var x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
      var y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      var sx = cx + x1 * R, sy = cy - y2 * R;
      if (z2 > 0) buckets[Math.min(3, (z2 * 4) | 0)].push(sx, sy); else back.push(sx, sy);
    }
    ctx.fillStyle = 'rgba(138,92,255,.16)';
    for (var b = 0; b < back.length; b += 2) ctx.fillRect(back[b], back[b + 1], sz * 0.7, sz * 0.7);
    var al = [0.38, 0.62, 0.85, 1];
    for (var k = 0; k < 4; k++) {
      ctx.fillStyle = k === 3 ? 'rgba(170,252,255,1)' : 'rgba(0,240,255,' + al[k] + ')';
      var B = buckets[k];
      for (var j = 0; j < B.length; j += 2) ctx.fillRect(B[j] - sz / 2, B[j + 1] - sz / 2, sz, sz);
    }
    // rim
    ctx.strokeStyle = 'rgba(0,240,255,.55)'; ctx.lineWidth = 1.2; ctx.shadowColor = CY; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
    // arcs + packets
    spawnT -= dt;
    if (spawnT <= 0 && arcs.length < 11) { spawnArc(); spawnT = rnd(0.2, 0.6); }
    arcs = arcs.filter(function (A) { return drawArc(A, dt); });
    // cities
    ctx.font = '600 ' + Math.max(9, Math.min(11, R / 22)) + 'px "JetBrains Mono",monospace'; ctx.textAlign = 'left';
    CITIES.forEach(function (c, ci) {
      proj(c.v[0], c.v[1], c.v[2], pt); if (pt[2] <= 0.04) return;
      var col = c.hq ? AC : PK, pul = (t * 0.8 + ci * 0.37) % 1;
      ctx.globalAlpha = (1 - pul) * 0.8; ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 3 + pul * 14, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.fillRect(pt[0] - 2.5, pt[1] - 2.5, 5, 5); ctx.shadowBlur = 0;
      var lb = c.k + (c.hq ? ' · HQ' : ''), lw = ctx.measureText(lb).width, fs = Math.max(9, Math.min(11, R / 22));
      ctx.globalAlpha = Math.min(1, (pt[2] - 0.04) * 5);
      ctx.fillStyle = 'rgba(3,4,10,.82)'; ctx.fillRect(pt[0] + 7, pt[1] - fs - 7, lw + 8, fs + 6);
      ctx.fillStyle = col; ctx.fillRect(pt[0] + 7, pt[1] - fs - 7, 2, fs + 6);
      ctx.fillStyle = '#eef4ff'; ctx.fillText(lb, pt[0] + 12, pt[1] - 5.5);
      ctx.globalAlpha = 1;
    });
    // arrival bursts
    bursts = bursts.filter(function (B) {
      B.age += dt; if (B.age > 0.9) return false;
      proj(B.v[0], B.v[1], B.v[2], pt); if (pt[2] <= 0) return true;
      var k = B.age / 0.9;
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = B.col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 4 + k * 26, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 2 + k * 12, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1; return true;
    });
    // target lock: a reticle that hops between visible nodes
    lock.age += dt;
    if (lock.age > lock.hold) {
      var vis = CITIES.map(function (c, ci) { proj(c.v[0], c.v[1], c.v[2], pt); return pt[2] > 0.25 ? ci : -1; }).filter(function (x) { return x >= 0 && x !== lock.i; });
      if (vis.length) { lock.i = pick(vis); lock.age = 0; lock.hold = rnd(1.8, 3.2); }
    }
    var LC = CITIES[lock.i]; proj(LC.v[0], LC.v[1], LC.v[2], pt);
    if (pt[2] > 0.05) {
      var lk = clamp(lock.age / 0.35, 0, 1), rr = 34 - 18 * lk, gap = rr * 0.45;
      ctx.strokeStyle = lk < 1 ? PK : '#ffffff'; ctx.lineWidth = 1.4; ctx.globalAlpha = lk < 1 ? 0.6 + 0.4 * Math.sin(t * 60) : 0.95;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        ctx.beginPath(); ctx.moveTo(pt[0] + q[0] * rr, pt[1] + q[1] * (rr - gap)); ctx.lineTo(pt[0] + q[0] * rr, pt[1] + q[1] * rr); ctx.lineTo(pt[0] + q[0] * (rr - gap), pt[1] + q[1] * rr); ctx.stroke();
      });
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(pt[0] - rr - 10, pt[1]); ctx.lineTo(pt[0] - rr + 2, pt[1]); ctx.moveTo(pt[0] + rr - 2, pt[1]); ctx.lineTo(pt[0] + rr + 10, pt[1]); ctx.stroke();
      ctx.globalAlpha = 1;
      if (lk >= 1) {
        var fs2 = Math.max(9, Math.min(10.5, R / 24)), lat = Math.asin(LC.v[1]) * 180 / Math.PI, lon = Math.atan2(LC.v[0], LC.v[2]) * 180 / Math.PI;
        ctx.font = '600 ' + fs2 + 'px "JetBrains Mono",monospace'; ctx.textAlign = 'left';
        var l1 = 'LOCK ' + LC.k + ' · ' + Math.abs(lat).toFixed(2) + (lat >= 0 ? 'N ' : 'S ') + Math.abs(lon).toFixed(2) + (lon >= 0 ? 'E' : 'W');
        var l2 = 'FEED ' + (40 + ((t * 7 + lock.i * 13) % 50) | 0) + 'ms · SYNC';
        var bx = pt[0] + rr + 14, by = pt[1] + rr + 4, bw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 12;
        if (bx + bw > VW - 4) bx = pt[0] - rr - 14 - bw;
        ctx.fillStyle = 'rgba(3,4,10,.86)'; ctx.fillRect(bx, by, bw, fs2 * 2 + 12);
        ctx.strokeStyle = 'rgba(255,43,214,.7)'; ctx.lineWidth = 1; ctx.strokeRect(bx + .5, by + .5, bw - 1, fs2 * 2 + 11);
        ctx.fillStyle = '#fff'; ctx.fillText(l1, bx + 6, by + fs2 + 3);
        ctx.fillStyle = AC; ctx.fillText(l2, bx + 6, by + fs2 * 2 + 7);
      }
    }
    // orbiting satellite
    sat += dt * (RM ? 0.05 : 0.32);
    var so = [Math.cos(sat) * 1.22, Math.sin(sat) * 0.42, Math.sin(sat) * 1.15];
    proj(so[0], so[1], so[2], pt);
    if (pt[2] > 0 || Math.hypot(pt[0] - cx, pt[1] - cy) > R) {
      ctx.fillStyle = AC; ctx.shadowColor = AC; ctx.shadowBlur = 12; ctx.fillRect(pt[0] - 2.5, pt[1] - 2.5, 5, 5); ctx.shadowBlur = 0;
      ctx.font = '500 9px "JetBrains Mono",monospace'; ctx.fillStyle = 'rgba(182,255,59,.85)'; ctx.textAlign = 'left'; ctx.fillText('XS-1', pt[0] + 7, pt[1] + 3);
    }
    // HUD rings
    var R2 = R * 1.1, R3 = R * 1.17;
    ctx.strokeStyle = 'rgba(0,240,255,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R2, 0, 7); ctx.stroke();
    for (var a = 0; a < 72; a++) {
      var an = a / 72 * Math.PI * 2, l = a % 6 ? 4 : 9;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * R2, cy + Math.sin(an) * R2); ctx.lineTo(cx + Math.cos(an) * (R2 + l), cy + Math.sin(an) * (R2 + l)); ctx.stroke();
    }
    ctx.lineWidth = 2;
    var sp = RM ? 0 : t * 0.35;
    ctx.strokeStyle = 'rgba(0,240,255,.8)'; ctx.beginPath(); ctx.arc(cx, cy, R3, sp, sp + 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R3, sp + Math.PI, sp + Math.PI + 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,43,214,.85)'; ctx.beginPath(); ctx.arc(cx, cy, R3 + 6, -sp * 1.6 + 2, -sp * 1.6 + 2.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(138,92,255,.6)'; ctx.setLineDash([2, 6]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.27, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // crosshair
    ctx.strokeStyle = 'rgba(0,240,255,.25)';
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      ctx.beginPath(); ctx.moveTo(cx + d[0] * R * 1.3, cy + d[1] * R * 1.3); ctx.lineTo(cx + d[0] * R * 1.42, cy + d[1] * R * 1.42); ctx.stroke();
    });
    // scan line sweeping down the globe
    if (!RM) {
      var sy2 = cy - R + ((t * 0.22) % 1) * 2 * R, hw = Math.sqrt(Math.max(0, R * R - (sy2 - cy) * (sy2 - cy)));
      var lg = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
      lg.addColorStop(0, 'rgba(255,43,214,0)'); lg.addColorStop(0.5, 'rgba(255,43,214,.55)'); lg.addColorStop(1, 'rgba(255,43,214,0)');
      ctx.fillStyle = lg; ctx.fillRect(cx - hw, sy2, hw * 2, 1.2);
    }
    // readout text
    var lonC = (((-rot * 180 / Math.PI) % 360) + 540) % 360 - 180;
    ctx.font = '500 ' + Math.max(8, Math.min(10, R / 26)) + 'px "JetBrains Mono",monospace'; ctx.fillStyle = 'rgba(135,146,170,.9)';
    ctx.textAlign = 'right'; ctx.fillText('GLOBAL LINK MAP', cx - R * 0.86, cy - R * 0.86); ctx.fillText(CITIES.length + ' NODES', cx - R * 0.86, cy - R * 0.86 + 13);
    ctx.textAlign = 'left'; ctx.fillText('LON ' + (lonC >= 0 ? '+' : '−') + Math.abs(lonC).toFixed(2) + '°', cx + R * 0.86, cy - R * 0.86); ctx.fillText('LINKS ' + arcs.length + ' · LIVE', cx + R * 0.86, cy - R * 0.86 + 13);
  }
  function drawBg(t, dt) {
    ctx.drawImage(bg, 0, 0, VW, VH);
    ctx.font = '500 11px "JetBrains Mono",monospace'; ctx.textAlign = 'left';
    cols.forEach(function (c) {
      c.y += c.v * dt; if (c.y > VH + 200) { c.y = -260; c.x = rnd(0, VW); }
      if (Math.random() < 0.08) { var k = (Math.random() * c.s.length) | 0; c.s = c.s.slice(0, k) + GL[(Math.random() * GL.length) | 0] + c.s.slice(k + 1); }
      for (var i = 0; i < c.s.length; i++) {
        ctx.globalAlpha = 0.12 * (i / c.s.length);
        ctx.fillStyle = i === c.s.length - 1 ? '#fff' : c.c;
        ctx.fillText(c.s[i], c.x, c.y + i * 13);
      }
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- loop ---------- */
  var last = performance.now(), t = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    rot += (RM ? 0.02 : 0.085) * dt;
    regV += (regT - regV) * Math.min(1, dt * 1.6);
    ctx.clearRect(0, 0, VW, VH);
    if (!RM) drawBg(t, dt); else ctx.drawImage(bg, 0, 0, VW, VH);
    drawGlobe(t, dt);
    drawGauge(t);
    requestAnimationFrame(frame);
  }

  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(resize, 80); });
  resize();
  stepSignals(); stepAlloc();
  setInterval(stepSignals, RM ? 6000 : 2200);
  setInterval(stepAlloc, RM ? 8000 : 3100);
  nextLine();
  root.classList.add('booted');
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
})();
