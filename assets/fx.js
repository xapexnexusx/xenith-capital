/* ==========================================================================
   XENITH CAPITAL — ambient canvas engine (fx.js) v2
   Renders into #fx-bg (fixed, full-viewport, z-index 0). Layers per frame:
     1. perspective neon grid floor (lower ~45%, horizon glow, scroll parallax)
     2. starfield sky (upper ~55%, phase-offset twinkle, scroll parallax)
     3. monospace data rain (glyph + ticker columns, pointer-proximity boost)
     4. lerped pointer glow (additive cyan/magenta blend)
     5. click shockwaves (additive expanding rings, max 3 concurrent)
     6. edge vignette
     7. glitch tear post-pass (random 9–14s timer or on demand, ~120ms)
   Vanilla JS, zero dependencies. Public API: window.XENITH_FX
   ({ start, stop, setIntensity, burst }).
   ========================================================================== */
(function () {
  'use strict';

  var API_STUB = {
    start: function () {},
    stop: function () {},
    setIntensity: function () {},
    burst: function () {}
  };

  var canvas = document.getElementById('fx-bg');
  if (!canvas || !canvas.getContext) { window.XENITH_FX = API_STUB; return; }
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { window.XENITH_FX = API_STUB; return; }

  /* ---------- palette (mirrors CONTRACT tokens) ---------- */
  var VOID = '#04060a';
  var CYAN = '#00f0ff';
  var MAGENTA = '#ff2d78';
  var HEAD_CYAN = '#eafdff';
  var HEAD_MAGENTA = '#ffe6f0';
  var STAR_CYAN = '#d9f6ff';
  var STAR_MAGENTA = '#ffd9ea';

  /* ---------- tuning ---------- */
  var MAX_DPR = 2;
  var SPRITE_SCALE = 2;      /* sprite supersample factor; keeps text crisp on retina */
  var GLYPH_BASE = 30;       /* canonical css px size sprites are pre-rendered at */
  var GRID_ROWS = 13;        /* horizontal floor lines */
  var GRID_SPEED = 0.3;      /* perspective slots per second (drift toward viewer) */
  var HORIZON = 0.55;        /* horizon line position as a fraction of height */
  var COL_SPACING = 32;      /* css px of width per rain column at intensity 1 */
  var MAX_INTENSITY = 3;
  var MAX_POOL = 170;        /* hard bound on the column pool */
  var MAX_TRAIL = 20;        /* hard bound on glyphs per column */
  var TICKER_PROB = 0.035;
  var MAGENTA_HEAD_PROB = 0.12;
  var FONT_STACK = '"JetBrains Mono", ui-monospace, monospace';

  /* ---------- v2 tuning ---------- */
  var STAR_MIN = 90;         /* starfield density bounds */
  var STAR_MAX = 140;
  var STAR_MAGENTA_PROB = 0.12;
  var PAR_GRID = 0.06;       /* grid shift per px of smoothed scrollY */
  var PAR_STAR = 0.03;       /* star shift per px of smoothed scrollY */
  var PAR_CLAMP = 0.22;      /* grid parallax bound as a fraction of height */
  var BURST_MIN = 9;         /* seconds between scheduled glitch bursts (min) */
  var BURST_MAX = 14;        /* seconds between scheduled glitch bursts (max) */
  var BURST_TIME = 0.12;     /* burst duration in seconds (~120ms) */
  var BAND_MAX = 4;          /* hard bound on tear bands per burst */
  var RING_MAX = 3;          /* hard bound on concurrent shockwaves */
  var RING_LIFE = 0.5;       /* shockwave lifetime in seconds (~500ms) */
  var RING_SPEED = 900;      /* shockwave radius growth, css px/s */
  var BOOST_RADIUS = 200;    /* rain proximity-boost radius, css px */
  var BOOST_GAIN = 0.6;      /* +60% alpha at the pointer column, falls to 0 at radius */
  var TAU = 6.2832;

  var GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%', '$', '▲', '▼'];
  var TICKERS = ['SPX', 'BTC', 'ETH', 'GOLD', 'OIL', 'VIX', 'NAS'];

  /* ---------- state ---------- */
  var W = 1, H = 1, DPR = 1;
  var running = false, rafId = 0, lastT = 0;
  var wasRunning = false;
  var gridOffset = 0;
  var intensity = 1;
  var columns = [];
  var activeCols = 0;
  var px = 0, py = 0, tx = 0, ty = 0, pointerReady = false;
  var horizonGlow = null, vignette = null, glowSprite = null;
  var sprites = { trail: [], ticker: [], headCyan: [], headMagenta: [] };
  var measureCtx = document.createElement('canvas').getContext('2d');
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = mq ? mq.matches : false;

  /* v2 state: starfield split into two fixed-tint batches so the frame loop
     only touches globalAlpha (no per-star style string work) */
  var starsC = [], starsM = [];
  var tNow = 0;              /* accumulated loop time, drives star twinkle */
  var targetScroll = 0;      /* raw scrollY target, set by the scroll listener */
  var parY = 0;              /* smoothed scroll position */
  var gridShift = 0;         /* clamped grid parallax offset, css px */
  var starShiftMod = 0;      /* star parallax offset wrapped into the sky zone */
  var gridGlowR = 1;         /* horizon glow disc radius, from buildGradients */
  var burstIn = 0;           /* countdown to the next scheduled burst */
  var burstT = 0;            /* remaining burst time; > 0 means a burst is live */
  var bands = [];            /* preallocated tear-band pool (BAND_MAX) */
  var rings = [];            /* preallocated shockwave pool (RING_MAX) */

  for (var bi = 0; bi < BAND_MAX; bi++) bands.push({ on: false, y: 0, h: 10, dx: 10 });
  for (var ri = 0; ri < RING_MAX; ri++) rings.push({ on: false, x: 0, y: 0, t: 0 });

  function rand(a, b) { return a + Math.random() * (b - a); }

  burstIn = rand(BURST_MIN, BURST_MAX);

  /* ---------- sprite pre-render (shadowBlur is used here only, never per frame) ---------- */
  function fontStr(weight, pxSize) { return weight + ' ' + pxSize + 'px ' + FONT_STACK; }

  function makeSprite(text, fill, glowColor, weight) {
    var fs = GLYPH_BASE * SPRITE_SCALE;
    var glow = !!glowColor;
    measureCtx.font = fontStr(weight, fs);
    var tw = measureCtx.measureText(text).width;
    var pad = glow ? fs * 0.55 : fs * 0.16;
    var cw = Math.max(2, Math.ceil(tw + pad * 2));
    var ch = Math.ceil(fs * 1.2 + pad * 2);
    var c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    var g = c.getContext('2d');
    g.font = fontStr(weight, fs);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fill;
    if (glow) {
      g.shadowColor = glowColor;
      g.shadowBlur = fs * 0.45;
      g.fillText(text, cw / 2, ch / 2);   /* two passes bake a soft neon halo */
      g.fillText(text, cw / 2, ch / 2);
      g.shadowBlur = 0;
    }
    g.fillText(text, cw / 2, ch / 2);     /* crisp core pass */
    return { c: c, w: cw / SPRITE_SCALE, h: ch / SPRITE_SCALE };
  }

  function buildSprites() {
    var i;
    sprites.trail.length = 0;
    sprites.ticker.length = 0;
    sprites.headCyan.length = 0;
    sprites.headMagenta.length = 0;
    for (i = 0; i < GLYPHS.length; i++) {
      sprites.trail.push(makeSprite(GLYPHS[i], CYAN, null, 400));
      sprites.headCyan.push(makeSprite(GLYPHS[i], HEAD_CYAN, CYAN, 700));
      sprites.headMagenta.push(makeSprite(GLYPHS[i], HEAD_MAGENTA, MAGENTA, 700));
    }
    for (i = 0; i < TICKERS.length; i++) {
      sprites.ticker.push(makeSprite(TICKERS[i], CYAN, null, 700));
    }
  }

  function buildGlowSprite() {
    var S = 256;
    var c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(0,240,255,0.50)');
    grad.addColorStop(0.35, 'rgba(80,170,235,0.22)');
    grad.addColorStop(0.7, 'rgba(255,45,120,0.10)');
    grad.addColorStop(1, 'rgba(255,45,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    glowSprite = c;
  }

  /* ---------- starfield (v2) ---------- */
  function buildStars() {
    starsC.length = 0;
    starsM.length = 0;
    var n = Math.max(STAR_MIN, Math.min(STAR_MAX, Math.round(W / 14)));
    var zoneH = H * HORIZON; /* upper ~55% of the viewport, above the floor horizon */
    for (var i = 0; i < n; i++) {
      var s = {
        x: Math.random() * W,
        y: Math.random() * zoneH,
        r: rand(0.5, 1.5),          /* 0.5–1.5px points */
        base: rand(0.10, 0.30),     /* very low alpha ceiling */
        ph: rand(0, TAU),           /* twinkle phase offset */
        sp: rand(0.5, 1.6)          /* slow twinkle rate, rad/s */
      };
      if (Math.random() < STAR_MAGENTA_PROB) starsM.push(s);
      else starsC.push(s);
    }
  }

  function drawStars(twinkle) {
    var zoneH = H * HORIZON;
    var i, s, sy;
    ctx.fillStyle = STAR_CYAN;
    for (i = 0; i < starsC.length; i++) {
      s = starsC[i];
      sy = s.y + starShiftMod;
      if (sy >= zoneH) sy -= zoneH;
      ctx.globalAlpha = twinkle
        ? s.base * (0.55 + 0.45 * Math.sin(tNow * s.sp + s.ph))
        : s.base * 0.8;             /* static frame: fixed low alpha, no twinkle */
      ctx.fillRect(s.x, sy, s.r, s.r);
    }
    ctx.fillStyle = STAR_MAGENTA;
    for (i = 0; i < starsM.length; i++) {
      s = starsM[i];
      sy = s.y + starShiftMod;
      if (sy >= zoneH) sy -= zoneH;
      ctx.globalAlpha = twinkle
        ? s.base * (0.55 + 0.45 * Math.sin(tNow * s.sp + s.ph))
        : s.base * 0.8;
      ctx.fillRect(s.x, sy, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- data rain ---------- */
  function newCell(col) {
    if (col.size >= 13 && Math.random() < TICKER_PROB) {
      return 100 + ((Math.random() * TICKERS.length) | 0);
    }
    return (Math.random() * GLYPHS.length) | 0;
  }

  function resetColumn(col, initial) {
    col.size = rand(11, 19);
    col.rowH = col.size * 1.18;
    col.speed = col.size * rand(3.2, 6.8);
    col.len = 7 + ((Math.random() * (MAX_TRAIL - 7)) | 0);
    col.alpha = rand(0.10, 0.26);
    col.headMag = Math.random() < MAGENTA_HEAD_PROB;
    col.y = initial ? rand(-H * 0.5, H) : -rand(30, H * 0.3);
    col.mutateT = rand(0.05, 0.3);
    col.cells.length = 0;
    for (var i = 0; i < col.len; i++) col.cells.push(newCell(col));
  }

  function layoutRain() {
    var base = Math.max(1, Math.round(W / COL_SPACING));
    activeCols = Math.min(columns.length, Math.round(base * intensity));
    for (var i = 0; i < activeCols; i++) {
      columns[i].x = (i + 0.15 + Math.random() * 0.7) * (W / activeCols);
    }
  }

  function buildColumns() {
    var pool = Math.min(MAX_POOL, Math.max(8, Math.round(W / COL_SPACING) * MAX_INTENSITY));
    columns.length = 0;
    for (var i = 0; i < pool; i++) {
      var col = { x: 0, y: 0, speed: 60, size: 12, rowH: 14, alpha: 0.15, len: 10, cells: [], headMag: false, mutateT: 0.1 };
      resetColumn(col, true);
      columns.push(col);
    }
    layoutRain();
  }

  function updateRain(dt) {
    for (var i = 0; i < activeCols; i++) {
      var col = columns[i];
      col.y += col.speed * dt;
      col.mutateT -= dt;
      if (col.mutateT <= 0) {
        col.mutateT = rand(0.08, 0.3);
        col.cells[(Math.random() * col.len) | 0] = newCell(col);
      }
      /* recycle the column once its whole trail has passed the bottom edge */
      if (col.y - col.len * col.rowH > H + 60) resetColumn(col, false);
    }
  }

  function drawRain() {
    var scale, col, i, y, id, sp, fade, dw, dh, dxp, boost;
    for (var k = 0; k < activeCols; k++) {
      col = columns[k];
      scale = col.size / GLYPH_BASE;
      /* v2: columns within ~200px horizontal of the pointer glow up to +60% alpha */
      dxp = col.x - px;
      if (dxp < 0) dxp = -dxp;
      boost = dxp < BOOST_RADIUS ? 1 + BOOST_GAIN * (1 - dxp / BOOST_RADIUS) : 1;
      for (i = col.len - 1; i >= 1; i--) {
        y = col.y - i * col.rowH;
        if (y < -40 || y > H + 40) continue;
        id = col.cells[i];
        sp = id < 100 ? sprites.trail[id] : sprites.ticker[id - 100];
        fade = 1 - i / col.len;
        ctx.globalAlpha = col.alpha * boost * (0.2 + 0.8 * fade * fade);
        dw = sp.w * scale;
        dh = sp.h * scale;
        ctx.drawImage(sp.c, col.x - dw / 2, y - dh / 2, dw, dh);
      }
      y = col.y;
      if (y > -40 && y < H + 40) {
        id = col.cells[0];
        ctx.globalAlpha = Math.min(0.85, col.alpha * 3.4 * boost);
        if (id < 100) {
          sp = col.headMag ? sprites.headMagenta[id] : sprites.headCyan[id];
          dw = sp.w * scale;
          dh = sp.h * scale;
          ctx.drawImage(sp.c, col.x - dw / 2, y - dh / 2, dw, dh);
        } else {
          /* ticker at the head position: brighten it additively in place of a baked halo */
          sp = sprites.ticker[id - 100];
          dw = sp.w * scale;
          dh = sp.h * scale;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(sp.c, col.x - dw / 2, y - dh / 2, dw, dh);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- perspective grid floor ---------- */
  function drawGrid() {
    var horizon = H * HORIZON + gridShift; /* v2: horizon rides the scroll parallax */
    var cx = W * 0.5;
    var a, f, r, z, yy, dist;

    /* glow gradient is baked around the origin so it can travel with the horizon */
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(cx, horizon);
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(-gridGlowR, -gridGlowR, gridGlowR * 2, gridGlowR * 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineWidth = 1;
    var fanCount = Math.max(14, Math.min(30, Math.round(W / 90)));
    for (f = 0; f <= fanCount; f++) {
      dist = Math.abs(f / fanCount - 0.5) * 2;
      a = 0.10 * (1 - dist * 0.65);
      ctx.strokeStyle = 'rgba(0,240,255,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(cx, horizon);
      ctx.lineTo(cx + (f / fanCount - 0.5) * W * 3, H);
      ctx.stroke();
    }

    for (r = 0; r < GRID_ROWS; r++) {
      z = ((r + gridOffset) % GRID_ROWS) / GRID_ROWS;
      yy = horizon + (H - horizon) * Math.pow(z, 2.7);
      a = 0.05 + 0.15 * z;
      ctx.strokeStyle = 'rgba(0,240,255,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,240,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(0, horizon + 0.5);
    ctx.lineTo(W, horizon + 0.5);
    ctx.stroke();
  }

  /* ---------- pointer glow ---------- */
  function drawPointerGlow() {
    var d = Math.max(W, H) * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42;
    ctx.drawImage(glowSprite, px - d / 2, py - d / 2, d, d);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- click shockwaves (v2) ---------- */
  function spawnRing(x, y) {
    var slot = null, i;
    for (i = 0; i < RING_MAX; i++) {
      if (!rings[i].on) { slot = rings[i]; break; }
    }
    if (!slot) {
      /* pool full: reuse the oldest live ring */
      slot = rings[0];
      for (i = 1; i < RING_MAX; i++) {
        if (rings[i].t > slot.t) slot = rings[i];
      }
    }
    slot.on = true;
    slot.x = x;
    slot.y = y;
    slot.t = 0;
  }

  function drawRings() {
    var i, rg, any = false;
    for (i = 0; i < RING_MAX; i++) if (rings[i].on) { any = true; break; }
    if (!any) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.5;
    for (i = 0; i < RING_MAX; i++) {
      rg = rings[i];
      if (!rg.on) continue;
      var p = rg.t / RING_LIFE;
      var fade = (1 - p) * (1 - p);
      var rr = RING_SPEED * rg.t;
      ctx.globalAlpha = fade * 0.6;
      ctx.strokeStyle = CYAN;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rr, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.35;
      ctx.strokeStyle = MAGENTA;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rr * 0.82, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- glitch bursts (v2) ---------- */
  function triggerBurst() {
    burstT = BURST_TIME;
    var count = 2 + ((Math.random() * 3) | 0); /* 2–4 tear bands */
    for (var i = 0; i < BAND_MAX; i++) {
      var b = bands[i];
      b.on = i < count;
      if (b.on) {
        b.h = 6 + ((Math.random() * 21) | 0);    /* 6–26px tall slices */
        b.y = (Math.random() * Math.max(1, H - b.h - 2)) | 0;
        b.dx = (8 + Math.random() * 10) * (Math.random() < 0.5 ? -1 : 1); /* ±8–18px */
      }
    }
  }

  /* post-pass over the just-composited frame: displaced self-copies via
     drawImage (no pixel reads), plus a faint additive echo and edge fringe */
  function applyGlitch() {
    var cw = canvas.width;
    for (var i = 0; i < BAND_MAX; i++) {
      var b = bands[i];
      if (!b.on) continue;
      var jx = b.dx * (0.7 + 0.6 * Math.random()); /* per-frame jitter on the tear */
      var sy = b.y * DPR, sh = b.h * DPR;
      /* chromatic ghost: the same slice pushed slightly further, added faintly */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.drawImage(canvas, 0, sy, cw, sh, jx * 1.12, b.y, W, b.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      /* the tear itself */
      ctx.drawImage(canvas, 0, sy, cw, sh, jx, b.y, W, b.h);
      /* cyan/magenta edge fringe hugging the displaced slice */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = CYAN;
      ctx.fillRect(jx + 2, b.y, W, 1);
      ctx.fillStyle = MAGENTA;
      ctx.fillRect(jx - 2, b.y + b.h - 1, W, 1);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------- frame assembly ---------- */
  function renderBase() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, W, H);
    drawGrid();
  }

  function render() {
    renderBase();
    drawStars(true);
    drawRain();
    drawPointerGlow();
    drawRings();
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStatic() {
    /* reduced-motion frame: void + grid + static stars + vignette, no loop,
       no parallax, no rain, no bursts, no shockwaves */
    gridShift = 0;
    starShiftMod = 0;
    renderBase();
    drawStars(false);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function step(dt) {
    gridOffset = (gridOffset + dt * GRID_SPEED) % GRID_ROWS;
    var k = 1 - Math.exp(-5.5 * dt);
    px += (tx - px) * k;
    py += (ty - py) * k;
    tNow += dt;

    /* v2: smoothed scroll parallax — grid at ~scrollY*0.06 (clamped so the
       floor composition never breaks), stars at ~scrollY*0.03 (wrapped) */
    var kp = 1 - Math.exp(-4 * dt);
    parY += (targetScroll - parY) * kp;
    var maxShift = H * PAR_CLAMP;
    gridShift = parY * PAR_GRID;
    if (gridShift > maxShift) gridShift = maxShift;
    else if (gridShift < -maxShift) gridShift = -maxShift;
    var zoneH = H * HORIZON;
    var sm = (parY * PAR_STAR) % zoneH;
    starShiftMod = sm < 0 ? sm + zoneH : sm;

    /* v2: glitch scheduler — a burst every 9–14s of live loop time */
    if (burstT > 0) {
      burstT -= dt;
      if (burstT <= 0) {
        burstT = 0;
        burstIn = rand(BURST_MIN, BURST_MAX);
      }
    } else {
      burstIn -= dt;
      if (burstIn <= 0) triggerBurst();
    }

    /* v2: shockwave aging (~500ms life) */
    for (var i = 0; i < RING_MAX; i++) {
      if (rings[i].on) {
        rings[i].t += dt;
        if (rings[i].t >= RING_LIFE) rings[i].on = false;
      }
    }

    updateRain(dt);
  }

  function frame(now) {
    if (!running) { rafId = 0; return; }
    rafId = requestAnimationFrame(frame);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    step(dt);
    render();
    if (burstT > 0) applyGlitch(); /* tears the fully composited frame */
  }

  /* ---------- gradients / sizing ---------- */
  function buildGradients() {
    gridGlowR = Math.max(W, H) * 0.55;
    /* baked around the origin; drawGrid translates it onto the (shifted) horizon */
    horizonGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, gridGlowR);
    horizonGlow.addColorStop(0, 'rgba(0,240,255,0.16)');
    horizonGlow.addColorStop(0.45, 'rgba(0,240,255,0.055)');
    horizonGlow.addColorStop(1, 'rgba(0,240,255,0)');
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.72);
    vignette.addColorStop(0, 'rgba(2,4,8,0)');
    vignette.addColorStop(1, 'rgba(2,4,8,0.55)');
  }

  function syncScroll() {
    targetScroll = window.scrollY || window.pageYOffset || 0;
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var cw = rect.width || window.innerWidth || 1;
    var chh = rect.height || window.innerHeight || 1;
    DPR = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(cw));
    H = Math.max(1, Math.round(chh));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!pointerReady) {
      pointerReady = true;
      px = tx = W * 0.5;
      py = ty = H * 0.42;
    }
    if (px > W) px = W;
    if (py > H) py = H;
    if (tx > W) tx = W;
    if (ty > H) ty = H;
    syncScroll();
    parY = targetScroll; /* snap on resize so parallax never drifts after reflow */
    buildGradients();
    buildColumns();
    buildStars();
    if (reduced) drawStatic();
  }

  /* ---------- public API / lifecycle ---------- */
  function start() {
    if (reduced) { drawStatic(); return; }
    if (running) return;
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    burstT = 0;
    for (var i = 0; i < RING_MAX; i++) rings[i].on = false;
  }

  function setIntensity(n) {
    n = Number(n);
    if (!isFinite(n)) return;
    intensity = Math.max(0, Math.min(MAX_INTENSITY, n));
    layoutRain();
  }

  /* v2: fire a glitch burst on demand (no-op while static or halted) */
  function burst() {
    if (reduced || !running) return;
    triggerBurst();
  }

  function onVisibility() {
    if (document.hidden) {
      wasRunning = running;
      stop();
    } else if (wasRunning) {
      wasRunning = false;
      start();
    }
  }

  function onMotionPref() {
    reduced = mq ? mq.matches : false;
    if (reduced) {
      stop();
      drawStatic();
    } else {
      start();
    }
  }

  function init() {
    buildSprites();
    buildGlowSprite();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', syncScroll, { passive: true });
    window.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    window.addEventListener('pointerdown', function (e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!reduced && running) spawnRing(e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onMotionPref);
      else if (mq.addListener) mq.addListener(onMotionPref);
    }
    if (document.fonts && document.fonts.ready) {
      /* re-bake sprites once JetBrains Mono is actually available */
      document.fonts.ready.then(function () {
        buildSprites();
        if (reduced) drawStatic();
      });
    }
    if (reduced) drawStatic(); else start();
  }

  window.XENITH_FX = { start: start, stop: stop, setIntensity: setIntensity, burst: burst };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
