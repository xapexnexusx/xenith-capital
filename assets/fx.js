/* ==========================================================================
   XENITH CAPITAL — THE FORMATION (fx.js) v7 "LIVING INSTRUMENT"
   Full 3D particle formation engine. Renders into #fx-bg (fixed, full
   viewport; positioning/z-index owned by xenith.css). Vanilla JS, zero deps.

   v7 core upgrades over v6:
   - TRUE 3D: every particle carries (x,y,z); a per-group rotation matrix +
     perspective projection (depth-scaled size and alpha fog) makes every
     formation volumetric. Additive blending keeps draw order irrelevant.
   - CENTERED + LARGE: the formation sits at the visual center of the
     console (cx = W*.5) and spans ~72% of the smaller viewport dimension.
     Glass panels float OVER it; the formation reads through them.
   - FIVE INTELLIGENCE FORMATIONS (one per scene, each a story):
       1 ORBITAL FRAME  — grand ring-torus + 6 structural struts + hub +
                          counter-rotating tilted halo + survey dust.
       2 SIGNAL FUNNEL  — wide noise field collapsing through a helix
                          funnel into one tight ascending signal column.
       3 GYRO SHIELD    — three orthogonal segmented rings spinning on
                          their own axes around a protected core sphere.
       4 SINGULARITY    — dense core + accretion disc, four satellite
                          clusters on connection spokes, polar jets.
       5 TRANSMIT ARRAY — tall beam, data packets streaming upward,
                          expanding broadcast rings, receiver dish arc.
   - CONSTELLATION LINKS: the first NODE_N particles are "nodes"; each
     frame, nearby node pairs are joined by faint cyan lines — a living
     analysis graph laid over every formation.
   - PERSPECTIVE GRID FLOOR: a subtle converging-line floor with depth
     rows drifting toward the viewer, below the formation.
   - HOVER API for the ui lane:
       preview(scene)  — non-committal morph toward a scene's formation
                         (rail hover); faster morph window.
       previewEnd()    — glide back to the committed scene formation.
       excite(x,y,s)   — short-lived attraction well at a screen point
                         (object-card hover); refreshed while hovered.
     Committed state is only changed by morphTo (main.js on scene change).

   Public API: window.XENITH_FX = { start, stop, setIntensity, burst,
   morphTo, pulse, preview, previewEnd, excite }.
   morphTo(scene) takes scene NUMBER 1..5 (data-scene); 0 tolerated as 1.

   Hard constraints honored: DPR cap 2; ZERO allocations in the frame loop
   (typed pools, prebuilt color cache, module-scope matrix temps); rAF
   paused on hidden tabs; prefers-reduced-motion renders a static frozen
   formation (instant morphs, no rotation/rise/pulse/links drift/pointer
   response); dt clamped to 50ms; offscreen particles culled.
   ========================================================================== */
(function () {
  'use strict';

  var API_STUB = {
    start: function () {},
    stop: function () {},
    setIntensity: function () {},
    burst: function () {},
    morphTo: function () {},
    pulse: function () {},
    preview: function () {},
    previewEnd: function () {},
    excite: function () {},
    focus: function () {}
  };

  var canvas = document.getElementById('fx-bg');
  if (!canvas || !canvas.getContext) { window.XENITH_FX = API_STUB; return; }
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { window.XENITH_FX = API_STUB; return; }

  /* ---------- palette ---------- */
  var VOID = '#04060a';
  var CORE_WHITE = [242, 249, 255];
  var BLUE = [79, 159, 255];          /* #4f9fff */
  var CYAN = [0, 240, 255];           /* #00f0ff */
  var SPARK_CYAN = 'rgba(207,250,255,0.95)';
  var SPARK_RED = 'rgba(255,45,60,0.92)';   /* scene 5 accent only */
  var PULSE_COL = 'rgba(215,246,255,1)';
  var LINK_COL = 'rgba(120,220,255,1)';
  var GRID_COL = 'rgba(79,159,255,1)';

  /* ---------- tuning ---------- */
  var TAU = Math.PI * 2;
  var MAX_DPR = 2;
  var MOBILE_W = 760;
  var POOL_MAX = 3200;
  var DESKTOP_N = 3200;
  var MOBILE_N = 1500;
  var MIN_N = 160;
  var MAX_INTENSITY = 2;
  var NODE_N = 120;                  /* constellation node particles */
  var G_MAX = 4;                     /* particle groups per formation */

  var MORPH_DUR = 1.05;              /* committed morph ease window, s */
  var MORPH_STAGGER = 0.35;
  var MORPH_FAST = 0.55;             /* preview morph ease window, s */
  var MORPH_FAST_STAGGER = 0.16;

  var BREATHE_AMP = 0.02;
  var BREATHE_PERIOD = 6;

  var VORTEX_R = 160;
  var VORTEX_R2 = VORTEX_R * VORTEX_R;
  var VORTEX_TAN = 360;
  var VORTEX_ATT = 100;

  var EXCITE_R = 250;
  var EXCITE_R2 = EXCITE_R * EXCITE_R;
  var EXCITE_ATT = 520;
  var EXCITE_TAN = 140;
  var EXCITE_TTL = 0.45;             /* refreshed while hovered */

  var DISP_SPRING = 16;
  var DISP_DAMP = 6;
  var DISP_CAP = 84;
  var DISP_CAP2 = DISP_CAP * DISP_CAP;

  var PULSE_DUR = 0.9;
  var COLOR_BUCKETS = 16;

  var LINK_MAX_PER_NODE = 3;
  var LINK_ALPHA = 0.17;

  var GRID_SPOKES = 13;              /* converging floor lines */
  var GRID_ROWS = 9;                 /* depth rows drifting toward viewer */
  var GRID_SPEED = 0.045;            /* row drift, cycles/s */

  /* shape ids follow scenes 1..5 -> 0..4 */
  var S_FRAME = 0, S_FUNNEL = 1, S_GYRO = 2, S_SINGUL = 3, S_ARRAY = 4;

  /* Per-shape motion doctrine. Groups: yaw (rad/s, whole-group orbit around
     the vertical axis), spin (rad/s around spinAxis: 0 none 1 X 2 Y 3 Z —
     visible on segmented rings), rise (px/s along local Y, negative = up
     the screen... rise is applied as y -= riseA then wrapped in the group's
     band), pulse (cycles/s: XZ radial expand + alpha fade — broadcast).
     tilt: fixed X-axis camera tilt per shape (the 3D reveal). */
  var DOCTRINE = [
    { tilt: -0.78, groups: [
      { yaw: 0.16, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.16, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: -0.07, spinAxis: 0, spin: 0,   rise: 0,   pulse: 0 },
      { yaw: 0.02, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 } ] },
    { tilt: -0.30, groups: [
      { yaw: 0.05, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.52, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.30, spinAxis: 0, spin: 0,    rise: 62,  pulse: 0 },
      { yaw: 0.05, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 } ] },
    { tilt: -0.34, groups: [
      { yaw: 0.12, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.12, spinAxis: 2, spin: 0.55, rise: 0,   pulse: 0 },
      { yaw: 0.12, spinAxis: 3, spin: 0.42, rise: 0,   pulse: 0 },
      { yaw: 0.12, spinAxis: 1, spin: 0.66, rise: 0,   pulse: 0 } ] },
    { tilt: -0.60, groups: [
      { yaw: 0.22, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.36, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.05, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.22, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 } ] },
    { tilt: -0.26, groups: [
      { yaw: 0.10, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 },
      { yaw: 0.10, spinAxis: 0, spin: 0,    rise: 128, pulse: 0 },
      { yaw: 0.10, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0.34 },
      { yaw: 0.06, spinAxis: 0, spin: 0,    rise: 0,   pulse: 0 } ] }
  ];

  /* ---------- state ---------- */
  var W = 1, H = 1, DPR = 1;
  var running = false, rafId = 0, lastT = 0, wasRunning = false;
  var tNow = 0, frameDt = 0.016;
  var intensity = 1;
  var portrait = false;

  var cx = 0, cy = 0, minDim = 1;
  var baseR = 200;                   /* master formation radius */
  var colorR = 240;
  var FOV = 900;
  var linkR = 90, linkR2 = 8100;
  var horizonY = 0;
  var gridSpread = 80;

  var shape = S_FRAME;               /* displayed shape */
  var committedShape = S_FRAME;      /* scene-owned shape (morphTo) */
  var previewing = false;

  var activeN = POOL_MAX;
  var morphing = false, morphElapsed = 0;
  var morphDur = MORPH_DUR, morphStagger = MORPH_STAGGER, morphTotal = MORPH_DUR + MORPH_STAGGER;
  var pulseT = 0;

  var pX = 0, pY = 0, spX = 0, spY = 0, pointerOn = false;
  var exX = 0, exY = 0, exT = 0, exStr = 1;

  /* subsystem focus: the inspector inspects. focus(g) spotlights particle
     group g (others recede); cleared on any shape change. */
  var focusG = -1;
  var focusBlend = 0;

  var glowGrad = null, vignette = null;

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = mq ? mq.matches : false;

  /* ---------- preallocated typed pools ---------- */
  var bX = new Float32Array(POOL_MAX);   /* home, shape-local 3D */
  var bY = new Float32Array(POOL_MAX);
  var bZ = new Float32Array(POOL_MAX);
  var mSX = new Float32Array(POOL_MAX);  /* morph start */
  var mSY = new Float32Array(POOL_MAX);
  var mSZ = new Float32Array(POOL_MAX);
  var mTX = new Float32Array(POOL_MAX);  /* morph target */
  var mTY = new Float32Array(POOL_MAX);
  var mTZ = new Float32Array(POOL_MAX);
  var dX = new Float32Array(POOL_MAX);   /* screen-space displacement */
  var dY = new Float32Array(POOL_MAX);
  var dVX = new Float32Array(POOL_MAX);
  var dVY = new Float32Array(POOL_MAX);
  var sX = new Float32Array(POOL_MAX);   /* projected screen cache */
  var sY = new Float32Array(POOL_MAX);
  var sA = new Float32Array(POOL_MAX);   /* drawn alpha cache (0 = culled) */
  var pSize = new Float32Array(POOL_MAX);
  var pSeed = new Float32Array(POOL_MAX);
  var pSeed2 = new Float32Array(POOL_MAX);
  var pSpark = new Uint8Array(POOL_MAX);
  var pGroup = new Uint8Array(POOL_MAX);

  /* per-frame group state (rebuilt each frame, preallocated) */
  var MAT = new Float32Array(G_MAX * 9);
  var yawA = new Float32Array(G_MAX);
  var spinA = new Float32Array(G_MAX);
  var riseA = new Float32Array(G_MAX);
  var pulseP = new Float32Array(G_MAX);
  var gScale = new Float32Array(G_MAX);
  var gAlpha = new Float32Array(G_MAX);
  var gFocusA = new Float32Array(G_MAX);   /* focus alpha factor per group */
  var gFocusS = new Float32Array(G_MAX);   /* focus size factor per group */
  var riseH = new Float32Array(G_MAX);   /* wrap band height for current shape */
  var riseC = new Float32Array(G_MAX);   /* wrap band center for current shape */

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
      pSeed2[i] = Math.random();
      pSpark[i] = s < 0.03 ? 1 : (s < 0.05 ? 2 : 0);
      if (i < NODE_N) {
        pSize[i] = 2.6 + Math.random() * 1.3;      /* constellation nodes */
      } else {
        pSize[i] = pSpark[i] ? 2.5 + Math.random() * 1.8 : 1.3 + Math.random() * 2.3;
      }
    }
  }

  /* ---------- 3D shape samplers -----------------------------------------
     Local coords centered on (0,0,0); +y is DOWN the screen (canvas), so
     "up" is negative y. Each sampler sets pGroup[i] and writes into the
     provided target triplet. Group membership keys off pSeed2 so the
     first-N node subset and any intensity cut stay proportional. */

  function sampleFrame(tX, tY, tZ, n) {
    var R = baseR, tube = R * 0.072;
    for (var i = 0; i < n; i++) {
      var q = pSeed2[i], u, v, rr, k, t;
      if (q < 0.62) {                       /* g0: grand torus band */
        pGroup[i] = 0;
        u = Math.random() * TAU;
        v = Math.random() * TAU;
        rr = R + Math.cos(v) * tube * (1 + 0.28 * Math.sin(u * 3))
               + Math.sin(u * 3) * tube * 0.55;
        tX[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        tY[i] = Math.sin(v) * tube * 1.5;
      } else if (q < 0.80) {                /* g1: 6 struts + hub ring */
        pGroup[i] = 1;
        if (pSeed[i] < 0.7) {
          k = (Math.random() * 6) | 0;
          u = k / 6 * TAU;
          t = 0.25 + Math.random() * 0.75;
          tX[i] = Math.cos(u) * R * t + (Math.random() * 2 - 1) * 3;
          tZ[i] = Math.sin(u) * R * t + (Math.random() * 2 - 1) * 3;
          tY[i] = (Math.random() * 2 - 1) * 4;
        } else {
          u = Math.random() * TAU;
          rr = R * 0.25 + (Math.random() * 2 - 1) * 4;
          tX[i] = Math.cos(u) * rr;
          tZ[i] = Math.sin(u) * rr;
          tY[i] = (Math.random() * 2 - 1) * 5;
        }
      } else if (q < 0.95) {                /* g2: tilted counter halo */
        pGroup[i] = 2;
        u = Math.random() * TAU;
        rr = R * 1.2 + (Math.random() * 2 - 1) * 4;
        var hx = Math.cos(u) * rr, hz = Math.sin(u) * rr;
        tX[i] = hx;
        tY[i] = -Math.sin(0.55) * hz;
        tZ[i] = Math.cos(0.55) * hz;
      } else {                              /* g3: survey dust shell */
        pGroup[i] = 3;
        u = Math.random() * TAU;
        v = Math.acos(2 * Math.random() - 1);
        rr = R * (1.08 + Math.random() * 0.35);
        tX[i] = rr * Math.sin(v) * Math.cos(u);
        tY[i] = rr * Math.cos(v) * 0.55;
        tZ[i] = rr * Math.sin(v) * Math.sin(u);
      }
    }
  }

  function sampleFunnel(tX, tY, tZ, n) {
    var R = baseR;
    var colC = -R * 0.52, colH = R * 1.05;   /* signal column band (up) */
    for (var i = 0; i < n; i++) {
      var q = pSeed2[i], u, rr, t;
      if (q < 0.34) {                       /* g0: raw noise field (below) */
        pGroup[i] = 0;
        u = Math.random() * TAU;
        rr = R * (0.35 + Math.random() * 0.85);
        tX[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        tY[i] = R * 0.42 + (Math.random() * 2 - 1) * R * 0.30;
      } else if (q < 0.70) {                /* g1: helix funnel (converges up) */
        pGroup[i] = 1;
        t = Math.random();                  /* 0 wide bottom -> 1 tight top */
        rr = R * (0.92 - 0.86 * t * (2 - t)) * (0.9 + Math.random() * 0.2);
        u = t * 4.5 * TAU + pSeed[i] * TAU;
        tX[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        tY[i] = R * 0.48 - t * R * 0.48;
      } else {                              /* g2: tight signal column (rises) */
        pGroup[i] = 2;
        var gx = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        var gz = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        u = Math.random() * TAU;
        tX[i] = gx * R * 0.05 + Math.cos(u) * 2;
        tZ[i] = gz * R * 0.05 + Math.sin(u) * 2;
        tY[i] = colC + (Math.random() - 0.5) * colH;
      }
    }
  }

  function sampleGyro(tX, tY, tZ, n) {
    var R = baseR;
    for (var i = 0; i < n; i++) {
      var q = pSeed2[i], u, v, rr, seg;
      if (q < 0.32) {                       /* g0: protected core sphere */
        pGroup[i] = 0;
        u = Math.random() * TAU;
        v = Math.acos(2 * Math.random() - 1);
        rr = R * 0.32 * (0.55 + 0.45 * Math.pow(Math.random(), 0.33));
        tX[i] = rr * Math.sin(v) * Math.cos(u);
        tY[i] = rr * Math.cos(v);
        tZ[i] = rr * Math.sin(v) * Math.sin(u);
      } else if (q < 0.55) {                /* g1: ring XZ (spins about Y) */
        pGroup[i] = 1;
        seg = (Math.random() * 10) | 0;
        u = (seg + Math.random() * 0.68) / 10 * TAU;
        rr = R * 0.80 + (Math.random() * 2 - 1) * 5;
        tX[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        tY[i] = (Math.random() * 2 - 1) * 4;
      } else if (q < 0.78) {                /* g2: ring XY (spins about Z) */
        pGroup[i] = 2;
        seg = (Math.random() * 8) | 0;
        u = (seg + Math.random() * 0.66) / 8 * TAU;
        rr = R * 0.62 + (Math.random() * 2 - 1) * 5;
        tX[i] = Math.cos(u) * rr;
        tY[i] = Math.sin(u) * rr;
        tZ[i] = (Math.random() * 2 - 1) * 4;
      } else {                              /* g3: ring YZ (spins about X) */
        pGroup[i] = 3;
        seg = (Math.random() * 12) | 0;
        u = (seg + Math.random() * 0.7) / 12 * TAU;
        rr = R * 0.94 + (Math.random() * 2 - 1) * 5;
        tY[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        tX[i] = (Math.random() * 2 - 1) * 4;
      }
    }
  }

  function sampleSingularity(tX, tY, tZ, n) {
    var R = baseR;
    for (var i = 0; i < n; i++) {
      var q = pSeed2[i], u, v, rr, k, t;
      if (q < 0.46) {                       /* g0: core + accretion disc */
        pGroup[i] = 0;
        if (pSeed[i] < 0.5) {
          u = Math.random() * TAU;
          v = Math.acos(2 * Math.random() - 1);
          rr = R * 0.14 * Math.pow(Math.random(), 0.5);
          tX[i] = rr * Math.sin(v) * Math.cos(u);
          tY[i] = rr * Math.cos(v);
          tZ[i] = rr * Math.sin(v) * Math.sin(u);
        } else {
          u = Math.random() * TAU;
          rr = R * (0.19 + Math.random() * 0.26);
          tX[i] = Math.cos(u) * rr;
          tZ[i] = Math.sin(u) * rr;
          tY[i] = (Math.random() * 2 - 1) * R * 0.016;
        }
      } else if (q < 0.72) {                /* g1: 4 satellites + spokes */
        pGroup[i] = 1;
        k = (Math.random() * 4) | 0;
        u = k / 4 * TAU;
        var nx = Math.cos(u) * R * 0.78, nz = Math.sin(u) * R * 0.78;
        if (pSeed[i] < 0.6) {
          v = Math.random() * TAU;
          rr = R * 0.055 * Math.pow(Math.random(), 0.4);
          var vv = Math.acos(2 * Math.random() - 1);
          tX[i] = nx + rr * Math.sin(vv) * Math.cos(v);
          tY[i] = rr * Math.cos(vv);
          tZ[i] = nz + rr * Math.sin(vv) * Math.sin(v);
        } else {
          t = 0.16 + Math.random() * 0.84;
          tX[i] = nx * t + (Math.random() * 2 - 1) * 2.5;
          tZ[i] = nz * t + (Math.random() * 2 - 1) * 2.5;
          tY[i] = (Math.random() * 2 - 1) * 2.5;
        }
      } else if (q < 0.88) {                /* g2: far dust ring */
        pGroup[i] = 2;
        u = Math.random() * TAU;
        rr = R * (1.0 + Math.random() * 0.24);
        tX[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        tY[i] = (Math.random() * 2 - 1) * R * 0.04;
      } else {                              /* g3: polar jets */
        pGroup[i] = 3;
        var sgn = pSeed[i] < 0.5 ? -1 : 1;
        t = 0.28 + Math.random() * 0.6;
        tY[i] = sgn * R * t;
        tX[i] = (Math.random() * 2 - 1) * R * 0.022 * (1 + t);
        tZ[i] = (Math.random() * 2 - 1) * R * 0.022 * (1 + t);
      }
    }
  }

  function sampleArray(tX, tY, tZ, n) {
    var R = baseR;
    var span = R * 1.5, top = -R * 0.95;    /* beam extent */
    for (var i = 0; i < n; i++) {
      var q = pSeed2[i], u, rr, k, t;
      if (q < 0.30) {                       /* g0: main beam */
        pGroup[i] = 0;
        var gx = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        var gz = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        tX[i] = gx * R * 0.045;
        tZ[i] = gz * R * 0.045;
        tY[i] = top + Math.random() * span;
      } else if (q < 0.56) {                /* g1: packets streaming up */
        pGroup[i] = 1;
        u = Math.random() * TAU;
        rr = R * (0.055 + Math.random() * 0.03);
        tX[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        k = (Math.random() * 12) | 0;       /* packet rows read as dashes */
        tY[i] = top + (k + Math.random() * 0.35) / 12 * span;
      } else if (q < 0.84) {                /* g2: broadcast rings (pulse) */
        pGroup[i] = 2;
        k = (Math.random() * 3) | 0;
        u = Math.random() * TAU;
        rr = R * 0.5 * (0.92 + Math.random() * 0.16);
        tX[i] = Math.cos(u) * rr;
        tZ[i] = Math.sin(u) * rr;
        tY[i] = (-0.55 + k * 0.40) * R;
      } else {                              /* g3: receiver dish arc */
        pGroup[i] = 3;
        u = Math.random() * TAU;
        var vv = (0.55 + Math.random() * 0.45) * Math.PI * 0.5;
        rr = R * 0.62;
        tX[i] = rr * Math.sin(vv) * Math.cos(u);
        tZ[i] = rr * Math.sin(vv) * Math.sin(u);
        tY[i] = R * 0.62 - rr * Math.cos(vv) * 0.9 + R * 0.1;
      }
    }
  }

  function sampleShape(tX, tY, tZ, idx, n) {
    if (idx === S_FRAME) sampleFrame(tX, tY, tZ, n);
    else if (idx === S_FUNNEL) sampleFunnel(tX, tY, tZ, n);
    else if (idx === S_GYRO) sampleGyro(tX, tY, tZ, n);
    else if (idx === S_SINGUL) sampleSingularity(tX, tY, tZ, n);
    else sampleArray(tX, tY, tZ, n);
  }

  /* rise wrap bands per shape/group (rebuilt on layout + shape switch) */
  function buildRiseBands() {
    var R = baseR, g;
    for (g = 0; g < G_MAX; g++) { riseH[g] = 0; riseC[g] = 0; }
    if (shape === S_FUNNEL) { riseH[2] = R * 1.05; riseC[2] = -R * 0.52; }
    else if (shape === S_ARRAY) { riseH[1] = R * 1.5; riseC[1] = -R * 0.2; }
  }

  /* ---------- morph ---------- */
  function normScene(i) {
    i = Number(i);
    if (!isFinite(i)) return -1;
    i = Math.round(i);
    if (i >= 1 && i <= 5) return i - 1;
    if (i === 0) return 0;
    return -1;
  }

  function snapToTarget() {
    for (var i = 0; i < POOL_MAX; i++) { bX[i] = mTX[i]; bY[i] = mTY[i]; bZ[i] = mTZ[i]; }
    morphing = false;
  }

  function beginMorph(fast) {
    for (var i = 0; i < POOL_MAX; i++) { mSX[i] = bX[i]; mSY[i] = bY[i]; mSZ[i] = bZ[i]; }
    buildRiseBands();
    if (reduced) { snapToTarget(); drawStatic(); return; }
    morphDur = fast ? MORPH_FAST : MORPH_DUR;
    morphStagger = fast ? MORPH_FAST_STAGGER : MORPH_STAGGER;
    morphTotal = morphDur + morphStagger;
    morphElapsed = 0;
    morphing = true;
  }

  function setDisplayedShape(idx, fast) {
    if (idx === shape) return;
    shape = idx;
    focusG = -1;                        /* a new formation enters unfocused */
    sampleShape(mTX, mTY, mTZ, shape, POOL_MAX);
    beginMorph(fast);
  }

  function morphTo(i) {
    var idx = normScene(i);
    if (idx < 0) return;
    committedShape = idx;
    previewing = false;
    setDisplayedShape(idx, false);
  }

  function preview(i) {
    if (reduced) return;                    /* previews are motion-only sugar */
    var idx = normScene(i);
    if (idx < 0 || idx === shape) return;
    previewing = true;
    setDisplayedShape(idx, true);
  }

  function previewEnd() {
    if (!previewing) return;
    previewing = false;
    setDisplayedShape(committedShape, true);
  }

  function easeInOutCubic(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function stepMorph(dt) {
    if (!morphing) return;
    morphElapsed += dt;
    for (var i = 0; i < POOL_MAX; i++) {
      var p = (morphElapsed - pSeed[i] * morphStagger) / morphDur;
      if (p <= 0) { bX[i] = mSX[i]; bY[i] = mSY[i]; bZ[i] = mSZ[i]; continue; }
      if (p >= 1) { bX[i] = mTX[i]; bY[i] = mTY[i]; bZ[i] = mTZ[i]; continue; }
      var e = easeInOutCubic(p);
      bX[i] = mSX[i] + (mTX[i] - mSX[i]) * e;
      bY[i] = mSY[i] + (mTY[i] - mSY[i]) * e;
      bZ[i] = mSZ[i] + (mTZ[i] - mSZ[i]) * e;
    }
    if (morphElapsed >= morphTotal) snapToTarget();
  }

  /* ---------- per-frame group matrices (zero alloc) ---------- */
  function buildGroupMatrices(breathe) {
    var doc = DOCTRINE[shape];
    var tilt = doc.tilt;
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    for (var g = 0; g < G_MAX; g++) {
      var gd = doc.groups[g];
      var cyw = Math.cos(yawA[g]), syw = Math.sin(yawA[g]);
      /* start: R = Ry(yaw) */
      var m00 = cyw, m01 = 0, m02 = syw;
      var m10 = 0,   m11 = 1, m12 = 0;
      var m20 = -syw, m21 = 0, m22 = cyw;
      /* own-axis spin FIRST (object space): R = Ry * Spin */
      var sp = gd.spinAxis;
      if (sp) {
        var cs = Math.cos(spinA[g]), ss = Math.sin(spinA[g]);
        var a00 = m00, a01 = m01, a02 = m02,
            a10 = m10, a11 = m11, a12 = m12,
            a20 = m20, a21 = m21, a22 = m22;
        if (sp === 1) {          /* Rx(spin) */
          m01 = a01 * cs + a02 * ss; m02 = -a01 * ss + a02 * cs;
          m11 = a11 * cs + a12 * ss; m12 = -a11 * ss + a12 * cs;
          m21 = a21 * cs + a22 * ss; m22 = -a21 * ss + a22 * cs;
        } else if (sp === 2) {   /* Ry(spin) */
          m00 = a00 * cs - a02 * ss; m02 = a00 * ss + a02 * cs;
          m10 = a10 * cs - a12 * ss; m12 = a10 * ss + a12 * cs;
          m20 = a20 * cs - a22 * ss; m22 = a20 * ss + a22 * cs;
        } else {                 /* Rz(spin) */
          m00 = a00 * cs + a01 * ss; m01 = -a00 * ss + a01 * cs;
          m10 = a10 * cs + a11 * ss; m11 = -a10 * ss + a11 * cs;
          m20 = a20 * cs + a21 * ss; m21 = -a20 * ss + a21 * cs;
        }
      }
      /* camera tilt LAST: R = Rx(tilt) * (Ry * Spin) */
      var b10 = ct * m10 - st * m20, b11 = ct * m11 - st * m21, b12 = ct * m12 - st * m22;
      var b20 = st * m10 + ct * m20, b21 = st * m11 + ct * m21, b22 = st * m12 + ct * m22;
      m10 = b10; m11 = b11; m12 = b12;
      m20 = b20; m21 = b21; m22 = b22;
      var o = g * 9;
      MAT[o] = m00 * breathe; MAT[o + 1] = m01 * breathe; MAT[o + 2] = m02 * breathe;
      MAT[o + 3] = m10 * breathe; MAT[o + 4] = m11 * breathe; MAT[o + 5] = m12 * breathe;
      MAT[o + 6] = m20 * breathe; MAT[o + 7] = m21 * breathe; MAT[o + 8] = m22 * breathe;
      /* pulse groups: radial XZ expand + fade */
      var pu = gd.pulse;
      if (pu > 0) {
        var ph = pulseP[g];
        gScale[g] = 0.55 + ph * 0.95;
        gAlpha[g] = (1 - ph) * (1 - ph) * 1.4;
        if (gAlpha[g] > 1) gAlpha[g] = 1;
      } else {
        gScale[g] = 1;
        gAlpha[g] = 1;
      }
      /* subsystem focus: spotlight one group, recede the rest */
      if (focusBlend > 0.005 && focusG >= 0) {
        if (g === focusG) {
          gFocusA[g] = 1 + 0.18 * focusBlend;
          gFocusS[g] = 1 + 0.16 * focusBlend;
        } else {
          gFocusA[g] = 1 - 0.60 * focusBlend;
          gFocusS[g] = 1 - 0.07 * focusBlend;
        }
      } else {
        gFocusA[g] = 1;
        gFocusS[g] = 1;
      }
    }
  }

  /* ---------- update ---------- */
  function step(dt) {
    tNow += dt;
    frameDt = dt;
    var doc = DOCTRINE[shape];
    for (var g = 0; g < G_MAX; g++) {
      var gd = doc.groups[g];
      yawA[g] += gd.yaw * dt;
      if (yawA[g] > TAU) yawA[g] -= TAU; else if (yawA[g] < -TAU) yawA[g] += TAU;
      if (gd.spinAxis) {
        spinA[g] += gd.spin * dt;
        if (spinA[g] > TAU) spinA[g] -= TAU;
      }
      if (gd.rise) {
        riseA[g] += gd.rise * dt;
        if (riseH[g] > 0 && riseA[g] > riseH[g]) riseA[g] -= riseH[g];
      }
      if (gd.pulse) {
        pulseP[g] += gd.pulse * dt;
        if (pulseP[g] > 1) pulseP[g] -= 1;
      }
    }
    stepMorph(dt);
    var k = 1 - Math.exp(-10 * dt);
    spX += (pX - spX) * k;
    spY += (pY - spY) * k;
    if (pulseT > 0) { pulseT -= dt; if (pulseT < 0) pulseT = 0; }
    if (exT > 0) { exT -= dt; if (exT < 0) exT = 0; }
    var fTarget = focusG >= 0 ? 1 : 0;
    focusBlend += (fTarget - focusBlend) * (1 - Math.exp(-7 * dt));
  }

  /* ---------- particle pass (zero allocations) ---------- */
  function drawParticles(live) {
    var n = activeN;
    var breathe = live ? 1 + BREATHE_AMP * Math.sin(TAU * tNow / BREATHE_PERIOD) : 1;
    buildGroupMatrices(breathe);
    var dampF = Math.exp(-DISP_DAMP * frameDt);
    var px = spX, py = spY;
    var vortex = live && pointerOn;
    var excite = live && exT > 0;
    var exx = exX, exy = exY;
    var exFade = exT / EXCITE_TTL;
    if (exFade > 1) exFade = 1;
    var t = tNow;
    var x1 = W + 8, y1 = H + 8;
    var buckets = COLOR_BUCKETS - 1;
    var fov = FOV;
    var colR = colorR;

    for (var i = 0; i < n; i++) {
      var g = pGroup[i];
      var lx = bX[i], ly = bY[i], lz = bZ[i];

      /* group rise (wrap inside the group band, local space) */
      var hgt = riseH[g];
      if (hgt > 0 && live) {
        var rel = ly - riseC[g] - riseA[g] + hgt * 0.5;
        rel = (rel % hgt + hgt) % hgt;
        ly = riseC[g] + rel - hgt * 0.5;
      }
      /* group radial pulse (XZ) */
      var gs = gScale[g];
      if (gs !== 1) { lx *= gs; lz *= gs; }

      var o = g * 9;
      var rx = MAT[o] * lx + MAT[o + 1] * ly + MAT[o + 2] * lz;
      var ry = MAT[o + 3] * lx + MAT[o + 4] * ly + MAT[o + 5] * lz;
      var rz = MAT[o + 6] * lx + MAT[o + 7] * ly + MAT[o + 8] * lz;

      var persp = fov / (fov + rz);
      var hx = cx + rx * persp;
      var hy = cy + ry * persp;

      var ox = dX[i], oy = dY[i];
      if (live) {
        var vx = dVX[i], vy = dVY[i];
        if (vortex) {
          var wx = hx + ox - px, wy = hy + oy - py;
          var d2 = wx * wx + wy * wy;
          if (d2 < VORTEX_R2 && d2 > 0.01) {
            var d = Math.sqrt(d2);
            var f = (1 - d / VORTEX_R) / d;
            vx += (-wy * f * VORTEX_TAN - wx * f * VORTEX_ATT) * frameDt;
            vy += (wx * f * VORTEX_TAN - wy * f * VORTEX_ATT) * frameDt;
          }
        }
        if (excite) {
          var ewx = hx + ox - exx, ewy = hy + oy - exy;
          var ed2 = ewx * ewx + ewy * ewy;
          if (ed2 < EXCITE_R2 && ed2 > 0.01) {
            var ed = Math.sqrt(ed2);
            var ef = (1 - ed / EXCITE_R) / ed * exFade * exStr;
            vx += (-ewx * ef * EXCITE_ATT - ewy * ef * EXCITE_TAN) * frameDt;
            vy += (-ewy * ef * EXCITE_ATT + ewx * ef * EXCITE_TAN) * frameDt;
          }
        }
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
      if (x < -8 || x > x1 || y < -8 || y > y1 || persp <= 0.1) {
        sA[i] = 0;
        continue;
      }

      /* depth fog: far = dim, near = bright */
      var depthA = 0.40 + (persp - 0.70) * 1.45;
      if (depthA > 1) depthA = 1; else if (depthA < 0.16) depthA = 0.16;

      var spark = pSpark[i];
      if (spark === 1) {
        ctx.fillStyle = SPARK_CYAN;
      } else if (spark === 2 && shape === S_ARRAY) {
        ctx.fillStyle = SPARK_RED;
      } else {
        var q = Math.sqrt(rx * rx + ry * ry) / colR;
        var bucket = (q * COLOR_BUCKETS) | 0;
        if (bucket > buckets) bucket = buckets;
        ctx.fillStyle = COLORS[bucket];
      }

      var tw = live
        ? 0.70 + 0.28 * Math.sin(t * (0.5 + pSeed[i] * 1.3) + pSeed[i] * TAU)
        : 0.85;
      var a = tw * depthA * gAlpha[g] * gFocusA[g];
      if (a > 1) a = 1;
      var size = pSize[i] * (0.50 + persp * 0.68) * gFocusS[g];

      ctx.globalAlpha = a;
      ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
      if (i < NODE_N) {
        /* soft bloom halo behind constellation nodes */
        var hs = size * 3.1;
        ctx.globalAlpha = a * 0.16;
        ctx.fillRect(x - hs * 0.5, y - hs * 0.5, hs, hs);
      }

      sX[i] = x; sY[i] = y; sA[i] = a;
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- constellation links (node pairs) ---------- */
  function drawLinks() {
    var lim = NODE_N < activeN ? NODE_N : activeN;
    ctx.strokeStyle = LINK_COL;
    ctx.lineWidth = 1;
    for (var i = 0; i < lim; i++) {
      var ai = sA[i];
      if (ai <= 0.02) continue;
      var xi = sX[i], yi = sY[i];
      var made = 0;
      for (var j = i + 1; j < lim; j++) {
        var aj = sA[j];
        if (aj <= 0.02) continue;
        var dx = sX[j] - xi, dy = sY[j] - yi;
        var d2 = dx * dx + dy * dy;
        if (d2 > linkR2 || d2 < 1) continue;
        var d = Math.sqrt(d2);
        var la = (1 - d / linkR) * LINK_ALPHA * (ai < aj ? ai : aj) * 2.2;
        if (la > 0.22) la = 0.22;
        ctx.globalAlpha = la;
        ctx.beginPath();
        ctx.moveTo(xi, yi);
        ctx.lineTo(sX[j], sY[j]);
        ctx.stroke();
        if (++made >= LINK_MAX_PER_NODE) break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- perspective grid floor ---------- */
  function drawGrid(live) {
    var hz = horizonY;
    if (hz >= H - 20) return;
    var depth = H + 30 - hz;
    ctx.strokeStyle = GRID_COL;
    ctx.lineWidth = 1;
    var k;
    /* converging spokes */
    for (k = 0; k < GRID_SPOKES; k++) {
      var c = (k / (GRID_SPOKES - 1)) * 2 - 1;      /* -1..1 */
      ctx.globalAlpha = 0.045 * (1 - Math.abs(c) * 0.5);
      ctx.beginPath();
      ctx.moveTo(cx + c * gridSpread * 0.14, hz);
      ctx.lineTo(cx + c * gridSpread, H + 30);
      ctx.stroke();
    }
    /* depth rows drifting toward the viewer */
    var drift = live ? (tNow * GRID_SPEED) % 1 : 0.35;
    for (k = 0; k < GRID_ROWS; k++) {
      var ph = (k / GRID_ROWS + drift) % 1;
      var y = hz + Math.pow(ph, 1.75) * depth;
      if (y > H + 10) continue;
      ctx.globalAlpha = 0.055 * ph;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- pulse ring (object selection feedback) ---------- */
  function drawPulse() {
    if (pulseT <= 0) return;
    var p = 1 - pulseT / PULSE_DUR;
    var e = 1 - Math.pow(1 - p, 3);
    var rr = e * colorR * 1.15;
    var a = (1 - p) * (1 - p);
    ctx.strokeStyle = PULSE_COL;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = a * 0.8;
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(cx, cy, rr, rr * 0.62, 0, 0, TAU);
    else ctx.arc(cx, cy, rr, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = PULSE_COL;
    ctx.globalAlpha = a * 0.08;
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(cx, cy, rr * 0.55, rr * 0.34, 0, 0, TAU);
    else ctx.arc(cx, cy, rr * 0.55, 0, TAU);
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
    drawGrid(true);
    drawParticles(true);
    drawLinks();
    drawPulse();
    paintVignette();
  }

  function drawStatic() {
    /* reduced-motion frame: frozen formation, no drift/links animation */
    paintBase();
    ctx.globalCompositeOperation = 'lighter';
    drawGrid(false);
    drawParticles(false);
    drawLinks();
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
      cy = H * 0.42;
      baseR = minDim * 0.30;
    } else {
      cx = W * 0.5;                   /* v7: dead center — the instrument IS the page */
      cy = H * 0.485;
      baseR = minDim * 0.365;
    }
    colorR = baseR * 1.12;
    FOV = minDim * 1.15;
    linkR = minDim * 0.085;
    linkR2 = linkR * linkR;
    horizonY = cy + baseR * 1.18;
    if (horizonY > H - 26) horizonY = H - 26;
    gridSpread = W * 0.75;
    buildRiseBands();
  }

  function buildGradients() {
    glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, colorR * 1.85);
    glowGrad.addColorStop(0, 'rgba(79,159,255,0.11)');
    glowGrad.addColorStop(0.5, 'rgba(0,240,255,0.04)');
    glowGrad.addColorStop(1, 'rgba(4,6,10,0)');
    vignette = ctx.createRadialGradient(W / 2, H / 2, minDim * 0.42, W / 2, H / 2, Math.max(W, H) * 0.74);
    vignette.addColorStop(0, 'rgba(2,4,8,0)');
    vignette.addColorStop(1, 'rgba(2,4,8,0.5)');
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
    if (!pointerOn) { spX = pX = cx; spY = pY = cy; }
    previewing = false;
    focusG = -1;
    shape = committedShape;
    sampleShape(mTX, mTY, mTZ, shape, POOL_MAX);
    beginMorph(false);
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
    if (reduced || !running) return;
    pulseT = PULSE_DUR;
  }

  function burst() {
    if (reduced || !running) return;
    for (var i = 0; i < activeN; i++) {
      var a = Math.random() * TAU;
      var m = 70 + Math.random() * 150;
      dVX[i] += Math.cos(a) * m;
      dVY[i] += Math.sin(a) * m;
    }
    pulseT = PULSE_DUR;
  }

  function excite(x, y, strength) {
    if (reduced || !running) return;
    x = Number(x); y = Number(y);
    if (!isFinite(x) || !isFinite(y)) return;
    exX = x; exY = y;
    exStr = isFinite(Number(strength)) ? Math.max(0, Math.min(2, Number(strength))) : 1;
    exT = EXCITE_TTL;
  }

  function focus(g) {
    /* spotlight particle group g of the CURRENT formation; -1 releases.
       State, not motion sugar — applies under reduced motion too (as a
       static re-render). */
    g = Number(g);
    if (!isFinite(g)) return;
    g = Math.round(g);
    if (g < 0 || g >= G_MAX) g = -1;
    if (g === focusG) return;
    if (focusG >= 0 && g >= 0) focusBlend *= 0.55;   /* soft dip on switch */
    focusG = g;
    if (reduced) {
      focusBlend = g >= 0 ? 1 : 0;
      drawStatic();
    }
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
      exT = 0;
      zeroDisplacements();
      previewing = false;
      focusBlend = focusG >= 0 ? 1 : 0;   /* freeze focus at its resolved state */
      if (shape !== committedShape) {
        shape = committedShape;
        sampleShape(mTX, mTY, mTZ, shape, POOL_MAX);
      }
      if (morphing) snapToTarget();
      drawStatic();
    } else {
      start();
    }
  }

  function init() {
    buildColors();
    initPool();
    resize();   /* measures, samples scene 1, blooms out from center */
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
    pulse: pulse,
    preview: preview,
    previewEnd: previewEnd,
    excite: excite,
    focus: focus
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
