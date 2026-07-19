/* ==========================================================================
   XENITH CAPITAL — TACTICAL DISPLAY ENGINE (fx.js) v5
   CLASSIFIED DOSSIER command-deck backdrop. Renders into #fx-bg (fixed,
   full-viewport; positioning/z-index owned by xenith.css). Vanilla JS,
   zero dependencies. Public API: window.XENITH_FX = { start, stop,
   setIntensity, burst }.

   Frame assembly (back to front):
     1. void clear (#04060a)
     2. grid backdrop — 48px hairlines, very low alpha, fixed
     3. data rain — v3 sprite pipeline (baked glyph/token sprites, cyan
        dominant, occasional red head, ~25% of v3 density, low alpha),
        subtle scroll parallax
     4. radar — right-of-center (portrait: upper third): 3 concentric
        hairline rings + cross hairs + dial ticks, rotating sweep (baked
        40deg wedge, quadratic trailing fade, 1 rev / 7s, additive),
        contact blips (bright ping then 2s fade, hard pool of 6)
     5. three pulsing nodes — cyan at radar center, amber on the west
        quadrant, ALERT RED on the Austin sector marker — each emits an
        expanding ring (0 -> 60px over 2.4s, staggered phases; the red
        node runs a faster 1.4s period at double brightness)
     6. burst ring — one big red pulse from the alert node (burst())
     7. edge vignette

   Scroll parallax: radar rings + nodes and rain columns shift subtly with
   scrollY (exponentially smoothed, hard-clamped). Grid stays fixed.

   burst(): one second of sweep speed x3 plus one expanding red ring from
   the alert node. No-op under reduced motion or a halted loop.

   Hard constraints honored: DPR cap 2; zero allocations in the steady-
   state frame loop (preallocated pools, Int16Array rain cells, module-
   scope color constants; every fade rides globalAlpha; strings/gradients/
   sprites are baked at init or resize only); rAF paused on hidden tabs;
   prefers-reduced-motion renders one static frame (grid + frozen rings +
   frozen blips — no sweep, no rain, no pulses); under 760px width rain
   density halves and the radar shrinks.
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
  var RED = '#ff2d3c';        /* pulsing alert red — CONTRACT token */
  var AMBER = '#ffb000';
  var HEAD_CYAN = '#eafdff';
  var HEAD_RED = '#ffe3e6';

  /* ---------- tuning ---------- */
  var TAU = Math.PI * 2;
  var MAX_DPR = 2;
  var MOBILE_W = 760;         /* below this width: halved rain, smaller radar */

  /* grid backdrop */
  var GRID_CELL = 48;         /* css px */
  var GRID_ALPHA = 0.04;      /* very low alpha per spec */

  /* radar geometry + motion */
  var RADAR_R_MIN = 52;
  var RADAR_R_MAX = 200;
  var SWEEP_REV = 7;                       /* seconds per revolution */
  var SWEEP_OM = TAU / SWEEP_REV;
  var SWEEP_ARC = 40 * Math.PI / 180;      /* ~40deg wedge */
  var SWEEP_SLICES = 56;                   /* bake-time gradient steps */
  var SWEEP_PEAK_A = 0.30;                 /* wedge alpha at the leading edge */
  var BLIP_POOL = 6;                       /* max alive, per spec */
  var BLIP_LIFE = 2.0;                     /* ping + fade, seconds */
  var BLIP_PING = 0.15;                    /* bright ping phase, seconds */
  var BLIP_MIN_GAP = 0.9;
  var BLIP_MAX_GAP = 2.4;

  /* pulsing nodes */
  var NODE_RING_R = 60;       /* expanding ring radius 0 -> 60px */
  var NODE_PERIOD = 2.4;      /* seconds per pulse, cyan + amber */
  var NODE_RED_PERIOD = 1.4;  /* alert node pulses faster */
  var NODE_RED_BRIGHT = 2;    /* ...and twice as bright */

  /* burst */
  var BURST_TIME = 1.0;       /* seconds */
  var BURST_R = 150;          /* big red ring radius from the alert node */
  var BURST_SWEEP_MULT = 3;   /* sweep speed multiplier during a burst */

  /* data rain (v3 pipeline, ~25% density: 4x the column spacing) */
  var SPRITE_SCALE = 2;       /* sprite supersample factor, crisp on retina */
  var GLYPH_BASE = 30;        /* canonical css px size sprites are baked at */
  var COL_SPACING = 128;      /* v3 used 32 at full density */
  var MAX_INTENSITY = 2;
  var MAX_POOL = 64;
  var MAX_TRAIL = 20;
  var TOKEN_PROB = 0.035;
  var RED_HEAD_PROB = 0.08;   /* occasional red head glyph */
  var FONT_STACK = '"JetBrains Mono", ui-monospace, monospace';

  /* scroll parallax (smoothed, clamped) */
  var PAR_RING = 0.04;        /* radar/node shift per px of smoothed scrollY */
  var PAR_RAIN = 0.02;        /* rain shift per px of smoothed scrollY */
  var PAR_RING_CLAMP = 0.06;  /* bound as a fraction of height */
  var PAR_RAIN_CLAMP = 0.04;

  /* digits + abstract marks for the trail; intel-discipline tags instead of
     market tickers — dossier-flavored, and names no tradable instruments */
  var GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%', '$', '▲', '▼'];
  var TOKENS = ['SIGINT', 'ELINT', 'OSINT', 'GEOINT', 'HUMINT', 'MASINT', 'IMINT', 'COMINT'];

  /* ---------- state ---------- */
  var W = 1, H = 1, DPR = 1;
  var running = false, rafId = 0, lastT = 0, wasRunning = false;
  var tNow = 0;               /* loop clock; frozen under reduced motion */
  var intensity = 1;
  var portrait = false, isMobile = false;

  /* radar geometry (rebuilt on resize) */
  var rx = 0, ry = 0, radarR = 120;
  var sweepAngle = 0;
  var sweepSprite = null;

  /* blips: preallocated hard pool (never grows) */
  var blips = [];
  var blipTimer = 0.6;
  var BLIP_COLORS = [CYAN, AMBER, RED];

  /* pulsing nodes: fixed tactical positions, x/y rebuilt on resize */
  var nodes = [
    { color: CYAN, period: NODE_PERIOD, phase: 0.0, bright: 1, x: 0, y: 0 },            /* radar center */
    { color: AMBER, period: NODE_PERIOD, phase: 0.8, bright: 1, x: 0, y: 0 },           /* west quadrant */
    { color: RED, period: NODE_RED_PERIOD, phase: 0.5, bright: NODE_RED_BRIGHT, x: 0, y: 0 } /* Austin sector marker */
  ];
  var NODE_ALERT = 2;

  /* burst countdown; > 0 while a burst is live */
  var burstT = 0;

  /* rain */
  var columns = [];
  var activeCols = 0;
  var sprites = { trail: [], token: [], headCyan: [], headRed: [] };
  var measureCtx = document.createElement('canvas').getContext('2d');

  /* scroll parallax state */
  var targetScroll = 0;       /* raw scrollY target, set by the listener */
  var parY = 0;               /* smoothed scroll position */
  var ringShift = 0;          /* clamped radar/node offset, css px */
  var rainShift = 0;          /* clamped rain offset, css px */

  var vignette = null;

  /* frozen contacts for the reduced-motion frame: angle, radius factor, kind */
  var FROZEN_A = [0.62, 2.35, 4.40];
  var FROZEN_R = [0.34, 0.58, 0.80];
  var FROZEN_K = [0, 1, 2];

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = mq ? mq.matches : false;

  function rand(a, b) { return a + Math.random() * (b - a); }

  for (var pi = 0; pi < BLIP_POOL; pi++) blips.push({ on: false, dx: 0, dy: 0, t0: 0, kind: 0 });

  /* ---------- sprite pre-render (v3 pipeline; shadowBlur at bake only) ---------- */
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
    sprites.token.length = 0;
    sprites.headCyan.length = 0;
    sprites.headRed.length = 0;
    for (i = 0; i < GLYPHS.length; i++) {
      sprites.trail.push(makeSprite(GLYPHS[i], CYAN, null, 400));
      sprites.headCyan.push(makeSprite(GLYPHS[i], HEAD_CYAN, CYAN, 700));
      sprites.headRed.push(makeSprite(GLYPHS[i], HEAD_RED, RED, 700));
    }
    for (i = 0; i < TOKENS.length; i++) {
      sprites.token.push(makeSprite(TOKENS[i], CYAN, null, 700));
    }
  }

  /* ---------- sweep wedge: baked once per resize, rotated per frame ---------- */
  function buildSweep() {
    var SS = SPRITE_SCALE;
    var size = Math.ceil(radarR * 2 * SS);
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var g = c.getContext('2d');
    var cc = size / 2;
    var rr = radarR * SS;
    var slice = SWEEP_ARC / SWEEP_SLICES;
    /* quadratic trailing fade: 56 thin pie slices, alpha -> peak at the lead */
    for (var i = 0; i < SWEEP_SLICES; i++) {
      var f = (i + 1) / SWEEP_SLICES;
      var a0 = -SWEEP_ARC + i * slice;
      g.fillStyle = 'rgba(0,240,255,' + (f * f * SWEEP_PEAK_A).toFixed(4) + ')';
      g.beginPath();
      g.moveTo(cc, cc);
      g.arc(cc, cc, rr, a0, a0 + slice + 0.005);
      g.closePath();
      g.fill();
    }
    /* radial falloff: dimmer hub, full brightness at the rim */
    g.globalCompositeOperation = 'destination-in';
    var grad = g.createRadialGradient(cc, cc, 0, cc, cc, rr);
    grad.addColorStop(0, 'rgba(0,0,0,0.30)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'source-over';
    sweepSprite = c;
  }

  /* ---------- data rain ---------- */
  function newCell(col) {
    if (col.size >= 13 && Math.random() < TOKEN_PROB) {
      return 100 + ((Math.random() * TOKENS.length) | 0);
    }
    return (Math.random() * GLYPHS.length) | 0;
  }

  function resetColumn(col, initial) {
    col.size = rand(11, 19);
    col.rowH = col.size * 1.18;
    col.speed = col.size * rand(3.2, 6.8);
    col.len = 7 + ((Math.random() * (MAX_TRAIL - 7)) | 0);
    col.alpha = rand(0.05, 0.13);   /* low alpha per spec */
    col.headRed = Math.random() < RED_HEAD_PROB;
    col.y = initial ? rand(-H * 0.5, H) : -rand(30, H * 0.3);
    col.mutateT = rand(0.05, 0.3);
    for (var i = 0; i < col.len; i++) col.cells[i] = newCell(col);
  }

  function computeActive() {
    var base = Math.max(1, Math.round(W / COL_SPACING));
    var n = Math.round(base * intensity * (isMobile ? 0.5 : 1));
    activeCols = Math.min(columns.length, Math.max(0, n));
  }

  function layoutRain() {
    computeActive();
    if (activeCols < 1) return;
    for (var i = 0; i < activeCols; i++) {
      columns[i].x = (i + 0.15 + Math.random() * 0.7) * (W / activeCols);
    }
  }

  function buildColumns() {
    var base = Math.max(1, Math.round(W / COL_SPACING));
    var pool = Math.min(MAX_POOL, Math.max(4, base * MAX_INTENSITY));
    columns.length = 0;
    for (var i = 0; i < pool; i++) {
      var col = {
        x: 0, y: 0, speed: 60, size: 12, rowH: 14, alpha: 0.1,
        len: 10, cells: new Int16Array(MAX_TRAIL), headRed: false, mutateT: 0.1
      };
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
    var scale, col, i, y, id, sp, fade, dw, dh;
    for (var k = 0; k < activeCols; k++) {
      col = columns[k];
      scale = col.size / GLYPH_BASE;
      for (i = col.len - 1; i >= 1; i--) {
        y = col.y - i * col.rowH + rainShift;
        if (y < -40 || y > H + 40) continue;
        id = col.cells[i];
        sp = id < 100 ? sprites.trail[id] : sprites.token[id - 100];
        fade = 1 - i / col.len;
        ctx.globalAlpha = col.alpha * (0.2 + 0.8 * fade * fade);
        dw = sp.w * scale;
        dh = sp.h * scale;
        ctx.drawImage(sp.c, col.x - dw / 2, y - dh / 2, dw, dh);
      }
      y = col.y + rainShift;
      if (y > -40 && y < H + 40) {
        id = col.cells[0];
        ctx.globalAlpha = Math.min(0.55, col.alpha * 3.2);
        if (id < 100) {
          sp = col.headRed ? sprites.headRed[id] : sprites.headCyan[id];
          dw = sp.w * scale;
          dh = sp.h * scale;
          ctx.drawImage(sp.c, col.x - dw / 2, y - dh / 2, dw, dh);
        } else {
          /* token at the head position: brighten it additively instead of a baked halo */
          sp = sprites.token[id - 100];
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

  /* ---------- grid backdrop ---------- */
  function drawGrid() {
    ctx.strokeStyle = CYAN;
    ctx.globalAlpha = GRID_ALPHA;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0.5; x <= W; x += GRID_CELL) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (var y = 0.5; y <= H; y += GRID_CELL) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ---------- radar ---------- */
  function drawRadarBase() {
    var cy = ry + ringShift;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1;
    /* 3 concentric hairline rings */
    ctx.globalAlpha = 0.13;
    ctx.beginPath(); ctx.arc(rx, cy, radarR / 3, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.11;
    ctx.beginPath(); ctx.arc(rx, cy, radarR * 2 / 3, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.20;
    ctx.beginPath(); ctx.arc(rx, cy, radarR, 0, TAU); ctx.stroke();
    /* dial ticks on the outer ring, every 30deg */
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    for (var i = 0; i < 12; i++) {
      var a = i * (TAU / 12);
      var c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(rx + c * radarR, cy + s * radarR);
      ctx.lineTo(rx + c * (radarR - 6), cy + s * (radarR - 6));
    }
    ctx.stroke();
    /* cross hairs, extending just past the outer ring */
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.moveTo(rx - radarR * 1.15, cy); ctx.lineTo(rx + radarR * 1.15, cy);
    ctx.moveTo(rx, cy - radarR * 1.15); ctx.lineTo(rx, cy + radarR * 1.15);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawSweep() {
    if (!sweepSprite) return;
    ctx.save();
    ctx.translate(rx, ry + ringShift);
    ctx.rotate(sweepAngle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.drawImage(sweepSprite, -radarR, -radarR, radarR * 2, radarR * 2);
    /* live leading edge: stays crisp at any rotation */
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radarR, 0);
    ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function spawnBlip() {
    var slot = null;
    for (var i = 0; i < BLIP_POOL; i++) {
      if (!blips[i].on) { slot = blips[i]; break; }
    }
    if (!slot) return;   /* pool cap reached: max 6 alive */
    var a = Math.random() * TAU;
    var r = Math.sqrt(Math.random()) * radarR * 0.92;   /* uniform over the disc */
    slot.on = true;
    slot.dx = Math.cos(a) * r;
    slot.dy = Math.sin(a) * r;
    slot.t0 = tNow;
    var roll = Math.random();
    slot.kind = roll < 0.72 ? 0 : (roll < 0.88 ? 1 : 2);   /* cyan / amber / red */
  }

  function drawBlips() {
    var cy = ry + ringShift;
    ctx.lineWidth = 1;
    for (var i = 0; i < BLIP_POOL; i++) {
      var b = blips[i];
      if (!b.on) continue;
      var age = tNow - b.t0;
      if (age >= BLIP_LIFE) { b.on = false; continue; }
      var a, rr;
      if (age < BLIP_PING) {
        /* bright ping: near-full alpha, slight radius pop */
        var f = age / BLIP_PING;
        a = 0.60 + 0.35 * f;
        rr = 3.5 - f;
      } else {
        /* 2s fade tail */
        var k = (age - BLIP_PING) / (BLIP_LIFE - BLIP_PING);
        a = 0.85 * Math.pow(1 - k, 1.5);
        rr = 2.2 + k * 1.6;
      }
      var x = rx + b.dx, y = cy + b.dy;
      var color = BLIP_COLORS[b.kind];
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = a * 0.45;
      ctx.beginPath(); ctx.arc(x, y, rr + 3.5, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* deterministic frozen contacts for the reduced-motion frame */
  function drawFrozenBlips() {
    ctx.lineWidth = 1;
    for (var i = 0; i < 3; i++) {
      var r = radarR * FROZEN_R[i];
      var x = rx + Math.cos(FROZEN_A[i]) * r;
      var y = ry + Math.sin(FROZEN_A[i]) * r;
      var color = BLIP_COLORS[FROZEN_K[i]];
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- pulsing nodes ---------- */
  function drawNodes() {
    ctx.lineWidth = 1.5;
    for (var i = 0; i < 3; i++) {
      var n = nodes[i];
      var ny = n.y + ringShift;
      var p = ((tNow + n.phase) % n.period) / n.period;
      var fade = 1 - p;
      var a = fade * fade * 0.5 * n.bright;
      if (a > 1) a = 1;
      /* expanding ring 0 -> 60px */
      ctx.strokeStyle = n.color;
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(n.x, ny, p * NODE_RING_R, 0, TAU); ctx.stroke();
      /* core dot + tight halo */
      ctx.fillStyle = n.color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(n.x - 1.5, ny - 1.5, 3, 3);
      a = 0.35 * n.bright;
      if (a > 1) a = 1;
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(n.x, ny, 5.5, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- burst: one big red pulse from the alert node ---------- */
  function drawBurst() {
    if (burstT <= 0) return;
    var n = nodes[NODE_ALERT];
    var ny = n.y + ringShift;
    var bp = 1 - burstT / BURST_TIME;
    var fade = 1 - bp;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = RED;
    ctx.globalAlpha = fade * fade * 0.9;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(n.x, ny, bp * BURST_R, 0, TAU); ctx.stroke();
    /* inner echo ring */
    ctx.globalAlpha = fade * fade * 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(n.x, ny, bp * BURST_R * 0.72, 0, TAU); ctx.stroke();
    /* alert node flash */
    ctx.fillStyle = RED;
    ctx.globalAlpha = fade * 0.95;
    var fs = 3 + fade * 5;
    ctx.fillRect(n.x - fs / 2, ny - fs / 2, fs, fs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /* ---------- update (never runs under reduced motion) ---------- */
  function step(dt) {
    tNow += dt;

    /* smoothed, hard-clamped scroll parallax */
    var kp = 1 - Math.exp(-4 * dt);
    parY += (targetScroll - parY) * kp;
    var rc = H * PAR_RING_CLAMP;
    var nc = H * PAR_RAIN_CLAMP;
    ringShift = parY * PAR_RING;
    if (ringShift > rc) ringShift = rc; else if (ringShift < -rc) ringShift = -rc;
    rainShift = parY * PAR_RAIN;
    if (rainShift > nc) rainShift = nc; else if (rainShift < -nc) rainShift = -nc;

    /* sweep: 1 rev per 7s, x3 while a burst is live */
    sweepAngle += SWEEP_OM * (burstT > 0 ? BURST_SWEEP_MULT : 1) * dt;
    if (sweepAngle > TAU) sweepAngle -= TAU;

    if (burstT > 0) {
      burstT -= dt;
      if (burstT < 0) burstT = 0;
    }

    /* contact spawn cadence (intensity scales the rate, capped by the pool) */
    blipTimer -= dt;
    if (blipTimer <= 0) {
      blipTimer = rand(BLIP_MIN_GAP, BLIP_MAX_GAP) / (intensity > 0.3 ? intensity : 0.3);
      spawnBlip();
    }

    updateRain(dt);
  }

  /* ---------- frame assembly ---------- */
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, W, H);

    drawGrid();
    drawRain();
    drawRadarBase();
    drawSweep();
    drawBlips();
    drawNodes();
    drawBurst();

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawStatic() {
    /* reduced-motion frame: grid + frozen radar rings + frozen blips.
       No sweep, no rain, no pulses, no parallax. */
    ringShift = 0;
    rainShift = 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, W, H);

    drawGrid();
    drawRadarBase();
    drawFrozenBlips();

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
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
  }

  /* ---------- layout / sizing ---------- */
  function layout() {
    isMobile = W < MOBILE_W;
    portrait = H > W;
    if (portrait) {
      rx = W * 0.5;
      ry = H * 0.30;                    /* upper third on phones */
      radarR = Math.min(W, H) * 0.16;   /* smaller radar on mobile */
    } else {
      rx = W * 0.66;                    /* centered right-of-center */
      ry = H * 0.52;
      radarR = Math.min(W, H) * 0.20;
    }
    if (radarR < RADAR_R_MIN) radarR = RADAR_R_MIN;
    else if (radarR > RADAR_R_MAX) radarR = RADAR_R_MAX;

    /* fixed tactical node positions */
    nodes[0].x = rx;                    /* cyan rides the radar center */
    nodes[0].y = ry;
    if (portrait) {
      nodes[1].x = W * 0.22; nodes[1].y = H * 0.62;   /* amber, west quadrant */
      nodes[2].x = W * 0.74; nodes[2].y = H * 0.44;   /* ALERT RED: Austin sector */
    } else {
      nodes[1].x = W * 0.20; nodes[1].y = H * 0.70;
      nodes[2].x = W * 0.82; nodes[2].y = H * 0.74;
    }
  }

  function buildGradients() {
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
    syncScroll();
    parY = targetScroll;   /* snap on resize so parallax never drifts after reflow */
    layout();
    buildSweep();
    buildGradients();
    buildColumns();
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
  }

  function setIntensity(n) {
    n = Number(n);
    if (!isFinite(n)) return;
    intensity = Math.max(0, Math.min(MAX_INTENSITY, n));
    layoutRain();
  }

  function burst() {
    /* one big red pulse from the alert node + sweep x3 for 1s */
    if (reduced || !running) return;
    burstT = BURST_TIME;
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
      burstT = 0;
      drawStatic();
    } else {
      start();
    }
  }

  function init() {
    buildSprites();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', syncScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onMotionPref);
      else if (mq.addListener) mq.addListener(onMotionPref);
    }
    /* re-bake once the webfont lands so rain glyphs use JetBrains Mono */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { buildSprites(); });
    }
    /* two contacts on the scope from the first frame */
    spawnBlip();
    spawnBlip();
    if (reduced) drawStatic(); else start();
  }

  window.XENITH_FX = {
    start: start,
    stop: stop,
    setIntensity: setIntensity,
    burst: burst
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
