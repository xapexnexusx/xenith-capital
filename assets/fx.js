/* ==========================================================================
   XENITH CAPITAL — THE FORMATION (fx.js) v6
   FIELD INSTRUMENT centerpiece: a living 2D canvas particle formation that
   morphs shape per scene. Renders into #fx-bg (fixed, full-viewport;
   positioning/z-index owned by xenith.css). Vanilla JS, zero dependencies.

   Public API: window.XENITH_FX = { start, stop, setIntensity, burst,
   morphTo, pulse }.

     morphTo(scene) — scene NUMBER 1..5, matching the DOM (data-scene, the
       rail, the pager). Shape order: 1 TORUS, 2 STREAM, 3 SHELL, 4 CORE,
       5 BEAM. A bare 0 is tolerated as shape 0 (TORUS) for 0-based callers.
       Every particle glides from its current home to its new target over
       ~1.4s total: per-particle 1.05s easeInOutCubic window plus a
       deterministic per-particle stagger delay of seed*0.35s.
     pulse() — one bright radial flash ring expanding from the formation
       center (object selection feedback; called by main.js).
     burst() — morph jitter: every particle gets a random impulse on its
       displacement velocity and springs back, plus the flash ring.
     setIntensity(n) — 0..2, scales the live particle count (default 1).
     start()/stop() — rAF lifecycle; auto-started on boot.

   Formations (parametric samplers, formation center slightly right of
   viewport center; portrait viewports: upper third):
     TORUS  — ring-torus band, R = .26*min(W,H), tube = .09R, a 3-wave
              radius undulation baked in so the slow spin reads as swirl.
     STREAM — ascending double-helix column, h = .6H, r = .10W, constant
              upward drift (particles wrap top -> bottom).
     SHELL  — sphere surface, r = .24*min, five latitude bands with gaps.
     CORE   — tight bright sphere, r = .10*min (auto core-white by the
              radius color rule) + a sparse orbital ring at 2.2r.
     BEAM   — thin vertical column, w = 40px, h = .66H, + radiating tick
              particles (14 rows x 2 sides x 3 outward bands).

   Continuous life: per-shape slow rotation (torus spins, shell precesses,
   core orbitals orbit; stream rises instead), breathing (global scale
   1 +/- .02, 6s sine), per-particle alpha twinkle, and a pointer vortex
   well: particles within 140px of the pointer feel a tangential pull
   proportional to proximity (capped) plus a slight inward attraction.

   Color: per-particle by radius from the formation center, lerped
   core-white -> #4f9fff -> #00f0ff at the edges, quantized into a 16-entry
   cache of prebuilt rgba strings (zero string work per frame). ~3% of
   particles are bright cyan sparks; on scene 5 (BEAM) a further ~2% render
   as red sparks (#ff2d3c).

   Particle model (preallocated typed pools, POOL_MAX = 2600; ~2600 desktop
   / ~1200 mobile under 760px): each particle carries base/home local
   position (bX,bY), morph start (mSX,mSY), morph target (mTX,mTY),
   vortex displacement offset (dX,dY) with velocity (dVX,dVY), size and
   seed — the spec's {x,y,tx,ty,vx,vy,size,seed}: live screen position is
   derived per frame as transform(base) + displacement.

   Hard constraints honored: DPR cap 2; ZERO allocations in the frame loop
   (all state in module-scope typed arrays, colors from the 16-entry cache,
   no objects/strings/arrays created per frame); rAF paused on hidden tabs;
   prefers-reduced-motion renders a static formation (morphTo snaps
   instantly; no rotation, breathing, twinkle, pulse/burst, or pointer
   response); dt clamped to 50ms; particles culled offscreen.
   ========================================================================== */
(function () {
  'use strict';

  var API_STUB = {
    start: function () {},
    stop: function () {},
    setIntensity: function () {},
    burst: function () {},
    morphTo: function () {},
    pulse: function () {}
  };

  var canvas = document.getElementById('fx-bg');
  if (!canvas || !canvas.getContext) { window.XENITH_FX = API_STUB; return; }
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { window.XENITH_FX = API_STUB; return; }

  /* ---------- palette ---------- */
  var VOID = '#04060a';
  var CORE_WHITE = [242, 249, 255];   /* core-white gradient anchor */
  var BLUE = [79, 159, 255];          /* #4f9fff */
  var CYAN = [0, 240, 255];           /* #00f0ff */
  var SPARK_CYAN = 'rgba(207,250,255,0.95)';
  var SPARK_RED = 'rgba(255,45,60,0.92)';   /* #ff2d3c accents, scene 5 only */
  var PULSE_COL = 'rgba(215,246,255,1)';

  /* ---------- tuning ---------- */
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var MAX_DPR = 2;
  var MOBILE_W = 760;                 /* below this width: 1200 particles */
  var POOL_MAX = 2600;
  var DESKTOP_N = 2600;
  var MOBILE_N = 1200;
  var MIN_N = 160;                    /* intensity floor */
  var MAX_INTENSITY = 2;

  /* shapes */
  var TORUS = 0, STREAM = 1, SHELL = 2, CORE = 3, BEAM = 4;
  var ROT_SPEED = [0.22, 0.0, 0.08, 0.25, 0.0];   /* rad/s per shape */
  var STREAM_RISE = 46;              /* px/s upward drift */
  var STREAM_TURNS = 3.5;            /* helix turns over the column height */

  /* morph */
  var MORPH_DUR = 1.05;              /* per-particle ease window, seconds */
  var MORPH_STAGGER = 0.35;          /* max delay, deterministic by seed */
  var MORPH_TOTAL = MORPH_DUR + MORPH_STAGGER;    /* ~1.4s overall */

  /* life */
  var BREATHE_AMP = 0.02;
  var BREATHE_PERIOD = 6;            /* seconds */
  var VORTEX_R = 140;
  var VORTEX_R2 = VORTEX_R * VORTEX_R;
  var VORTEX_TAN = 340;              /* tangential accel at zero dist, px/s^2 */
  var VORTEX_ATT = 90;               /* inward attraction accel, px/s^2 */
  var DISP_SPRING = 16;              /* displacement spring back to home */
  var DISP_DAMP = 6;                 /* 1/s exponential damping */
  var DISP_CAP = 72;                 /* px, hard cap on vortex displacement */
  var DISP_CAP2 = DISP_CAP * DISP_CAP;

  var PULSE_DUR = 0.9;               /* seconds */
  var COLOR_BUCKETS = 16;

  /* ---------- state ---------- */
  var W = 1, H = 1, DPR = 1;
  var running = false, rafId = 0, lastT = 0, wasRunning = false;
  var tNow = 0;
  var frameDt = 0.016;
  var intensity = 1;
  var portrait = false;

  /* formation geometry (rebuilt on resize) */
  var cx = 0, cy = 0, minDim = 1;
  var torusR = 100, torusTube = 9;
  var streamH = 400, streamR = 80;
  var shellR = 100;
  var coreR = 40;
  var beamW = 40, beamH = 400;
  var colorR = 120;                  /* radius mapped to the cyan edge */

  var shape = TORUS;
  var rotA = 0;                      /* global formation rotation angle */
  var riseAcc = 0;                   /* stream upward drift accumulator */
  var activeN = POOL_MAX;
  var morphing = false, morphElapsed = 0;
  var pulseT = 0;

  /* pointer vortex */
  var pX = 0, pY = 0, spX = 0, spY = 0, pointerOn = false;

  /* baked decorations (rebuilt on resize only) */
  var glowGrad = null, vignette = null;

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = mq ? mq.matches : false;

  /* ---------- preallocated typed pools (never grow, never realloc) ---------- */
  var bX = new Float32Array(POOL_MAX);    /* base/home position, shape-local */
  var bY = new Float32Array(POOL_MAX);
  var mSX = new Float32Array(POOL_MAX);   /* morph start snapshot */
  var mSY = new Float32Array(POOL_MAX);
  var mTX = new Float32Array(POOL_MAX);   /* morph target */
  var mTY = new Float32Array(POOL_MAX);
  var dX = new Float32Array(POOL_MAX);    /* vortex displacement offset */
  var dY = new Float32Array(POOL_MAX);
  var dVX = new Float32Array(POOL_MAX);   /* displacement velocity */
  var dVY = new Float32Array(POOL_MAX);
  var pSize = new Float32Array(POOL_MAX);
  var pSeed = new Float32Array(POOL_MAX);
  var pSpark = new Uint8Array(POOL_MAX);  /* 0 none, 1 cyan, 2 red-on-beam */

  /* 16-entry quantized color cache: prebuilt strings, zero per-frame work */
  var COLORS = [];

  function lerpC(a, b, t) { return Math.round(a + (b - a) * t); }

  function buildColors() {
    COLORS.length = 0;
    for (var i = 0; i < COLOR_BUCKETS; i++) {
      var t = i / (COLOR_BUCKETS - 1);
      var r, g, b, u;
      if (t < 0.5) {
        u = t * 2;
        r = lerpC(CORE_WHITE[0], BLUE[0], u);
        g = lerpC(CORE_WHITE[1], BLUE[1], u);
        b = lerpC(CORE_WHITE[2], BLUE[2], u);
      } else {
        u = (t - 0.5) * 2;
        r = lerpC(BLUE[0], CYAN[0], u);
        g = lerpC(BLUE[1], CYAN[1], u);
        b = lerpC(BLUE[2], CYAN[2], u);
      }
      COLORS.push('rgba(' + r + ',' + g + ',' + b + ',0.9)');
    }
  }

  function initPool() {
    for (var i = 0; i < POOL_MAX; i++) {
      var s = Math.random();
      pSeed[i] = s;
      pSpark[i] = s < 0.03 ? 1 : (s < 0.05 ? 2 : 0);
      pSize[i] = pSpark[i] ? 2.2 + Math.random() * 1.6 : 1.1 + Math.random() * 2.0;
    }
  }

  /* ---------- shape samplers (shape-local coords, centered on 0,0) ----------
     Every sampler distributes uniformly across the index range so any
     first-N subset (mobile count, intensity scale) is a valid sample. */
  function sampleTorus(tX, tY, n) {
    var R = torusR, tube = torusTube;
    for (var i = 0; i < n; i++) {
      var u = Math.random() * TAU;
      /* 3-wave undulation: the spin reads as swirl instead of a static ring */
      var rr = R + Math.sin(u * 3) * tube * 1.4 + (Math.random() * 2 - 1) * tube * 0.6;
      tX[i] = Math.cos(u) * rr;
      tY[i] = Math.sin(u) * rr;
    }
  }

  function sampleStream(tX, tY, n) {
    var h = streamH, r = streamR;
    for (var i = 0; i < n; i++) {
      var yy = (Math.random() * 2 - 1) * h * 0.5;
      var th = (yy / h) * STREAM_TURNS * TAU + Math.random() * 0.5;
      var side = pSeed[i] < 0.5 ? 0 : Math.PI;   /* double helix */
      tX[i] = Math.sin(th + side) * r + (Math.random() * 2 - 1) * r * 0.16;
      tY[i] = yy;
    }
  }

  function sampleShell(tX, tY, n) {
    var r = shellR;
    for (var i = 0; i < n; i++) {
      var band = (Math.random() * 5) | 0;                    /* 5 bands, gaps between */
      var lat = (-60 + band * 30) * DEG + (Math.random() * 2 - 1) * 9 * DEG;
      var lon = Math.random() * TAU;
      var cl = Math.cos(lat);
      tX[i] = r * cl * Math.cos(lon);
      tY[i] = r * Math.sin(lat);
    }
  }

  function sampleCore(tX, tY, n) {
    var r = coreR;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU;
      var rr;
      if (pSeed[i] < 0.82) {
        rr = r * Math.sqrt(Math.random());                   /* tight bright disc */
      } else {
        rr = r * 2.2 + (Math.random() * 2 - 1) * r * 0.14;   /* sparse orbital ring */
      }
      tX[i] = Math.cos(a) * rr;
      tY[i] = Math.sin(a) * rr;
    }
  }

  function sampleBeam(tX, tY, n) {
    var w = beamW, h = beamH;
    var rows = 14;
    for (var i = 0; i < n; i++) {
      if (pSeed[i] < 0.72) {
        /* center-weighted thin column */
        var g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        tX[i] = g * w * 0.5;
        tY[i] = (Math.random() * 2 - 1) * h * 0.5;
      } else {
        /* radiating tick particles: rows x 2 sides x 3 outward bands */
        var side = pSeed[i] < 0.86 ? -1 : 1;
        var row = (Math.random() * rows) | 0;
        var band = (Math.random() * 3) | 0;
        tX[i] = side * (w * 0.5 + 4 + band * 8 + Math.random() * 3);
        tY[i] = -h * 0.5 + ((row + 0.5) / rows) * h;
      }
    }
  }

  function sampleShape(tX, tY, idx, n) {
    if (idx === TORUS) sampleTorus(tX, tY, n);
    else if (idx === STREAM) sampleStream(tX, tY, n);
    else if (idx === SHELL) sampleShell(tX, tY, n);
    else if (idx === CORE) sampleCore(tX, tY, n);
    else sampleBeam(tX, tY, n);
  }

  /* ---------- morph ---------- */
  function normScene(i) {
    i = Number(i);
    if (!isFinite(i)) return -1;
    i = Math.round(i);
    if (i >= 1 && i <= 5) return i - 1;   /* v6 scene numbers (data-scene) */
    if (i === 0) return 0;                /* tolerate a 0-based caller */
    return -1;
  }

  function snapToTarget() {
    for (var i = 0; i < POOL_MAX; i++) { bX[i] = mTX[i]; bY[i] = mTY[i]; }
    morphing = false;
  }

  function beginMorph() {
    for (var i = 0; i < POOL_MAX; i++) { mSX[i] = bX[i]; mSY[i] = bY[i]; }
    if (reduced) { snapToTarget(); drawStatic(); return; }
    morphElapsed = 0;
    morphing = true;
  }

  function morphTo(i) {
    var idx = normScene(i);
    if (idx < 0 || idx === shape) return;
    shape = idx;
    sampleShape(mTX, mTY, shape, POOL_MAX);
    beginMorph();
  }

  function easeInOutCubic(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function stepMorph(dt) {
    if (!morphing) return;
    morphElapsed += dt;
    for (var i = 0; i < POOL_MAX; i++) {
      var p = (morphElapsed - pSeed[i] * MORPH_STAGGER) / MORPH_DUR;
      if (p <= 0) { bX[i] = mSX[i]; bY[i] = mSY[i]; continue; }
      if (p >= 1) { bX[i] = mTX[i]; bY[i] = mTY[i]; continue; }
      var e = easeInOutCubic(p);
      bX[i] = mSX[i] + (mTX[i] - mSX[i]) * e;
      bY[i] = mSY[i] + (mTY[i] - mSY[i]) * e;
    }
    if (morphElapsed >= MORPH_TOTAL) snapToTarget();
  }

  /* ---------- update (never runs under reduced motion) ---------- */
  function step(dt) {
    tNow += dt;
    frameDt = dt;

    rotA += ROT_SPEED[shape] * dt;
    if (rotA > TAU) rotA -= TAU;

    if (shape === STREAM) {
      riseAcc += STREAM_RISE * dt;
      if (riseAcc > streamH) riseAcc -= streamH;
    }

    stepMorph(dt);

    /* exponentially smoothed pointer so the well glides instead of snapping */
    var k = 1 - Math.exp(-10 * dt);
    spX += (pX - spX) * k;
    spY += (pY - spY) * k;

    if (pulseT > 0) {
      pulseT -= dt;
      if (pulseT < 0) pulseT = 0;
    }
  }

  /* ---------- particle pass (zero allocations) ---------- */
  function drawParticles(live) {
    var n = activeN;
    var breathe = live ? 1 + BREATHE_AMP * Math.sin(TAU * tNow / BREATHE_PERIOD) : 1;
    var cA = Math.cos(rotA) * breathe;
    var sA = Math.sin(rotA) * breathe;
    var isStream = shape === STREAM;
    var hh = streamH;
    var dampF = Math.exp(-DISP_DAMP * frameDt);
    var px = spX, py = spY;
    var vortex = live && pointerOn;
    var t = tNow;
    var x1 = W + 8, y1 = H + 8;
    var buckets = COLOR_BUCKETS - 1;

    for (var i = 0; i < n; i++) {
      var bx = bX[i], by = bY[i];
      if (isStream && live) {
        by -= riseAcc;
        by = ((by + hh * 0.5) % hh + hh) % hh - hh * 0.5;   /* wrap: rise forever */
      }
      var hx = cx + bx * cA - by * sA;
      var hy = cy + bx * sA + by * cA;

      var ox = dX[i], oy = dY[i];
      if (live) {
        var vx = dVX[i], vy = dVY[i];
        if (vortex) {
          var wx = hx + ox - px, wy = hy + oy - py;
          var d2 = wx * wx + wy * wy;
          if (d2 < VORTEX_R2 && d2 > 0.01) {
            var d = Math.sqrt(d2);
            var f = (1 - d / VORTEX_R) / d;   /* proximity factor, pre-divided */
            vx += (-wy * f * VORTEX_TAN - wx * f * VORTEX_ATT) * frameDt;
            vy += (wx * f * VORTEX_TAN - wy * f * VORTEX_ATT) * frameDt;
          }
        }
        /* spring the displacement back to home, always */
        vx += -ox * DISP_SPRING * frameDt;
        vy += -oy * DISP_SPRING * frameDt;
        vx *= dampF; vy *= dampF;
        ox += vx * frameDt; oy += vy * frameDt;
        var od2 = ox * ox + oy * oy;
        if (od2 > DISP_CAP2) {
          var sc = DISP_CAP / Math.sqrt(od2);
          ox *= sc; oy *= sc;
        }
        dX[i] = ox; dY[i] = oy; dVX[i] = vx; dVY[i] = vy;
      }

      var x = hx + ox, y = hy + oy;
      if (x < -8 || x > x1 || y < -8 || y > y1) continue;

      var spark = pSpark[i];
      var size = pSize[i];
      if (spark === 1) {
        ctx.fillStyle = SPARK_CYAN;
      } else if (spark === 2 && shape === BEAM) {
        ctx.fillStyle = SPARK_RED;
      } else {
        var rx = hx - cx, ry = hy - cy;
        var q = Math.sqrt(rx * rx + ry * ry) / colorR;
        var bucket = (q * COLOR_BUCKETS) | 0;
        if (bucket > buckets) bucket = buckets;
        ctx.fillStyle = COLORS[bucket];
      }

      ctx.globalAlpha = live
        ? 0.66 + 0.3 * Math.sin(t * (0.5 + pSeed[i] * 1.3) + pSeed[i] * TAU)
        : 0.85;
      ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- pulse: one bright radial flash ring from the center ---------- */
  function drawPulse() {
    if (pulseT <= 0) return;
    var p = 1 - pulseT / PULSE_DUR;
    var e = 1 - Math.pow(1 - p, 3);          /* easeOutCubic */
    var rr = e * colorR * 1.25;
    var a = (1 - p) * (1 - p);
    ctx.strokeStyle = PULSE_COL;
    ctx.lineWidth = 2;
    ctx.globalAlpha = a * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = PULSE_COL;
    ctx.globalAlpha = a * 0.10;
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.55, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ---------- frame assembly ---------- */
  function paintBase() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, W, H);
  }

  function paintVignette() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function render() {
    paintBase();
    ctx.globalCompositeOperation = 'lighter';
    drawParticles(true);
    drawPulse();
    paintVignette();
  }

  function drawStatic() {
    /* reduced-motion frame: the formation, frozen. No rotation, breathing,
       twinkle, drift, pulse, or pointer response. */
    paintBase();
    ctx.globalCompositeOperation = 'lighter';
    drawParticles(false);
    paintVignette();
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
    portrait = H > W;
    minDim = Math.min(W, H);
    if (portrait) {
      cx = W * 0.5;
      cy = H * 0.33;                    /* upper third on phones */
    } else {
      cx = W * 0.60;                    /* slightly right of viewport center */
      cy = H * 0.52;
    }
    torusR = minDim * 0.26;
    torusTube = torusR * 0.09;
    streamH = H * 0.6;
    streamR = W * 0.10;
    shellR = minDim * 0.24;
    coreR = minDim * 0.10;
    beamW = 40;
    beamH = H * 0.66;
    /* keep tall columns inside the viewport on short/portrait screens */
    var maxHalf = Math.min(cy - 24, H - cy - 24);
    if (streamH * 0.5 > maxHalf) streamH = maxHalf * 2;
    if (beamH * 0.5 > maxHalf) beamH = maxHalf * 2;
    colorR = minDim * 0.30;
  }

  function buildGradients() {
    glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, colorR * 1.7);
    glowGrad.addColorStop(0, 'rgba(79,159,255,0.10)');
    glowGrad.addColorStop(0.55, 'rgba(0,240,255,0.035)');
    glowGrad.addColorStop(1, 'rgba(4,6,10,0)');
    vignette = ctx.createRadialGradient(W / 2, H / 2, minDim * 0.38, W / 2, H / 2, Math.max(W, H) * 0.72);
    vignette.addColorStop(0, 'rgba(2,4,8,0)');
    vignette.addColorStop(1, 'rgba(2,4,8,0.55)');
  }

  function retargetCount() {
    var base = W < MOBILE_W ? MOBILE_N : DESKTOP_N;
    var n = Math.round(base * intensity);
    if (n < MIN_N) n = MIN_N;
    else if (n > POOL_MAX) n = POOL_MAX;
    activeN = n;
  }

  var resizeTimer = 0;
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
    layout();
    buildGradients();
    retargetCount();
    if (!pointerOn) { spX = pX = cx; spY = pY = cy; }   /* idle well parks at center */
    /* re-sample the current shape for the new geometry and glide there */
    sampleShape(mTX, mTY, shape, POOL_MAX);
    beginMorph();
  }

  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 140);
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
    retargetCount();
    if (reduced) drawStatic();
  }

  function pulse() {
    /* one bright radial flash ring from the formation center */
    if (reduced || !running) return;
    pulseT = PULSE_DUR;
  }

  function burst() {
    /* morph jitter + flash: random impulse per particle, springs back */
    if (reduced || !running) return;
    for (var i = 0; i < activeN; i++) {
      var a = Math.random() * TAU;
      var m = 70 + Math.random() * 150;
      dVX[i] += Math.cos(a) * m;
      dVY[i] += Math.sin(a) * m;
    }
    pulseT = PULSE_DUR;
  }

  function onPointerMove(e) {
    pX = e.clientX;
    pY = e.clientY;
    pointerOn = true;
  }

  function onPointerOff() {
    pointerOn = false;
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

  function zeroDisplacements() {
    for (var i = 0; i < POOL_MAX; i++) {
      dX[i] = 0; dY[i] = 0; dVX[i] = 0; dVY[i] = 0;
    }
  }

  function onMotionPref() {
    reduced = mq ? mq.matches : false;
    if (reduced) {
      stop();
      pulseT = 0;
      zeroDisplacements();
      if (morphing) snapToTarget();
      drawStatic();
    } else {
      start();
    }
  }

  function init() {
    buildColors();
    initPool();
    resize();   /* measures, lays out, samples TORUS, blooms in from center */
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerOff);
    window.addEventListener('blur', onPointerOff);
    document.addEventListener('visibilitychange', onVisibility);
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onMotionPref);
      else if (mq.addListener) mq.addListener(onMotionPref);
    }
    if (reduced) drawStatic(); else start();
  }

  window.XENITH_FX = {
    start: start,
    stop: stop,
    setIntensity: setIntensity,
    burst: burst,
    morphTo: morphTo,
    pulse: pulse
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
