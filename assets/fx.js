/* ==========================================================================
   XENITH CAPITAL — SIGNAL TRIALS :: black-hole engine (fx.js) v4
   Full rewrite for the stage game. Renders into #fx-bg (fixed, full-viewport;
   positioning/z-index owned by xenith.css). Vanilla JS, zero dependencies.

   Frame assembly (back to front):
     1. void clear (#04060a)
     2. 2 nebula sprites — cyan/deep-blue + magenta/deep-purple radial
        gradients, baked once offscreen, peak alpha <= .06, slow independent
        Lissajous drift                                            [lighter]
     3. 3-layer starfield (far/mid/near): per-layer drift speed, pointer
        parallax (far least, near most), phase-offset twinkle, edge wrap
     4. mood-tinted hole glow (radial gradient around origin, rebuilt only
        when the quantized tint changes or on resize)              [lighter]
     5. accretion disk — FAR half (orbits passing behind the hole) [lighter]
     6. dark core: true black fill + 1px void edge
     7. photon ring: bright thin ellipse, tilt -12deg, 3-stroke fake bloom
        (cyan-white core glow)                                     [lighter]
     8. accretion disk — NEAR half (orbits passing in front)       [lighter]
     9. gravitational-lensing shimmer ring at the disk edge (faint,
        breathing radius/alpha)                                    [lighter]
    10. warp rays — radial screen-edge streaks, warp jumps only    [lighter]
    11. edge vignette

   Disk: preallocated pool (600 active desktop / 260 under 760px, scaled by
   setIntensity). Elliptical orbits at 1.2–3.4x core radius, angular speed
   om = KEPLER/sqrt(r) (Kepler-ish), slow orbital decay with respawn at the
   outer rim, ~2x alpha on the approaching side, slow precession.

   API: window.XENITH_FX = { start, stop, setIntensity, burst, warp, setMood }
     warp(midCb) : 450ms suck-in (disk+stars dive toward the core, core grows
                   to ~2.4x, radial screen streaks) -> midCb fired exactly
                   once -> 450ms de-warp back. Reduced motion or halted loop:
                   midCb fires synchronously, no animation. Re-entrant calls
                   while a jump is live are ignored (midCb NOT called).
     setMood(m)  : 'cyan' | 'magenta' | 'amber' — ~0.5s tint lerp of
                   ring/disk/glow. Snaps + repaints under reduced motion.
     burst()     : 150ms disk flare + ring flash.
     setIntensity: 0..2 density multiplier on disk particles + stars.

   Hard constraints honored: DPR cap 2; zero allocations in the steady-state
   frame loop (fixed pools + quantized tint caches; tint strings/gradients
   rebuild only on actual color change); rAF paused on hidden tabs and under
   prefers-reduced-motion (static frame: nebulae + stars + frozen disk +
   core + ring, nothing moves); particle halving under 760px width.
   ========================================================================== */
(function () {
  'use strict';

  var API_STUB = {
    start: function () {},
    stop: function () {},
    setIntensity: function () {},
    burst: function () {},
    warp: function (cb) { if (typeof cb === 'function') cb(); },
    setMood: function () {}
  };

  var canvas = document.getElementById('fx-bg');
  if (!canvas || !canvas.getContext) { window.XENITH_FX = API_STUB; return; }
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { window.XENITH_FX = API_STUB; return; }

  /* ---------- palette ---------- */
  var VOID = '#04060a';
  var CORE_BLACK = '#000000';
  var STAR_FAR = '#7ea9d4';
  var STAR_MID = '#c2e2ff';
  var STAR_NEAR = '#eafdff';

  /* mood endpoints [r,g,b] — lerped as floats, quantized for style caches */
  var MOODS = {
    cyan: [0, 240, 255],
    magenta: [255, 45, 120],
    amber: [255, 176, 0]
  };

  /* ---------- tuning ---------- */
  var TAU = Math.PI * 2;
  var MAX_DPR = 2;
  var TILT = -12 * Math.PI / 180;   /* disk + photon-ring inclination */
  var FLAT = 0.34;                  /* disk flatten (ry/rx) */
  var RING_FLAT = 0.88;             /* photon ring flatten — near-circular */
  var PRECESS = 0.021;              /* disk precession, rad/s */
  var KEPLER = 1.0;                 /* angular speed scale: om = KEPLER/sqrt(r) */
  var R_IN = 1.2;                   /* orbit band inner edge, x core radius */
  var R_OUT = 3.4;                  /* orbit band outer edge / respawn rim */
  var R_KILL = 1.15;                /* decay below this -> respawn */
  var HOT_R = 1.75;                 /* inside this radius particles burn white */
  var POOL = 1200;                  /* hard cap on disk particle pool */
  var DISK_DESKTOP = 600;
  var DISK_MOBILE = 260;
  var MOBILE_W = 760;               /* below this width: halved particle base */
  var WARP_IN = 0.45;               /* suck-in seconds */
  var WARP_OUT = 0.45;              /* de-warp seconds */
  var WARP_CORE = 1.4;              /* core scale = 1 + WARP_CORE*warpK (~2.4x) */
  var WARP_PULL = 0.75;             /* star/disk pull toward the core at warpK=1 */
  var BURST_TIME = 0.15;            /* disk flare seconds */
  var MOOD_TIME = 0.5;              /* mood lerp seconds */
  var RAY_COUNT = 44;               /* warp edge-streak pool */
  var NEB_PX = 256;                 /* nebula sprite bake size */
  var STAR_WRAP = 12;               /* offscreen wrap margin, css px */

  /* ---------- state ---------- */
  var W = 1, H = 1, DPR = 1;
  var running = false, rafId = 0, lastT = 0, wasRunning = false;
  var tNow = 0;                     /* loop clock; frozen under reduced motion */
  var intensity = 1;

  /* hole geometry (rebuilt on resize) */
  var hx = 0, hy = 0, coreR = 40, portrait = false, isMobile = false;

  /* pointer parallax (smoothed) */
  var pxt = 0, pyt = 0, pxs = 0, pys = 0;

  /* disk */
  var disk = [];                    /* preallocated particle pool */
  var activeDisk = 0;
  var diskBase = DISK_DESKTOP;
  var precess = 0;                  /* accumulated precession angle */

  /* warp state machine: 0 idle, 1 suck-in, 2 de-warp */
  var warpState = 0, warpT = 0, warpK = 0;
  var warpCb = null, warpFired = false;

  /* burst flare: counts down, burstK eases 1 -> 0 */
  var burstT = 0, burstK = 0;

  /* mood tint (floats) + quantized caches (ints/strings) */
  var moodName = 'cyan';
  var mr = 0, mg = 240, mb = 255;          /* current tint */
  var mfr = 0, mfg = 240, mfb = 255;       /* lerp from */
  var mtr = 0, mtg = 240, mtb = 255;       /* lerp to */
  var moodT = 1;                           /* 1 = settled */
  var qR = -1, qG = -1, qB = -1;
  var strDisk = 'rgb(0,240,255)';
  var strRing = 'rgb(159,247,255)';
  var strHot = 'rgb(244,252,255)';
  var tintGradDirty = true;

  /* baked resources (rebuilt on resize / tint change only) */
  var nebA = null, nebB = null, nebSize = 1;
  var holeGlow = null, holeGlowR = 1, vignette = null;

  /* warp rays pool */
  var rays = [];

  /* starfield: 3 parallax layers, typed-array pools (no per-frame churn) */
  var starLayers = [
    { cap: 150, baseN: 0, n: 0, par: 3,  vx: -1.6, vy: 0.5, color: STAR_FAR,
      per: 15000, min: 26, rLo: 0.4, rHi: 0.9, aLo: 0.08, aHi: 0.22, tLo: 0.3, tHi: 0.9,
      x: null, y: null, r: null, a: null, ph: null, sp: null },
    { cap: 100, baseN: 0, n: 0, par: 7,  vx: -2.8, vy: 0.9, color: STAR_MID,
      per: 21000, min: 16, rLo: 0.7, rHi: 1.3, aLo: 0.12, aHi: 0.30, tLo: 0.5, tHi: 1.2,
      x: null, y: null, r: null, a: null, ph: null, sp: null },
    { cap: 70,  baseN: 0, n: 0, par: 12, vx: -4.4, vy: 1.4, color: STAR_NEAR,
      per: 34000, min: 10, rLo: 1.0, rHi: 1.8, aLo: 0.18, aHi: 0.42, tLo: 0.8, tHi: 1.6,
      x: null, y: null, r: null, a: null, ph: null, sp: null }
  ];

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = mq ? mq.matches : false;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------- pool allocation (init-time only) ---------- */
  function allocPools() {
    var i, L;
    for (i = 0; i < POOL; i++) {
      disk.push({ r: 0, th: 0, decay: 0, base: 0, sz: 0 });
      respawn(disk[i], true);
    }
    for (i = 0; i < RAY_COUNT; i++) {
      rays.push({ ang: Math.random() * TAU, len: rand(0.7, 1.3), a: rand(0.05, 0.14), w: rand(0.5, 1.4) });
    }
    for (var k = 0; k < starLayers.length; k++) {
      L = starLayers[k];
      L.x = new Float32Array(L.cap);
      L.y = new Float32Array(L.cap);
      L.r = new Float32Array(L.cap);
      L.a = new Float32Array(L.cap);
      L.ph = new Float32Array(L.cap);
      L.sp = new Float32Array(L.cap);
    }
  }

  function respawn(p, initial) {
    p.r = initial ? rand(R_IN, R_OUT) : R_OUT + Math.random() * 0.05;
    p.th = Math.random() * TAU;
    p.decay = rand(0.010, 0.024);   /* core radii per second — ~2min spiral-in */
    p.base = rand(0.22, 0.62);
    p.sz = rand(0.8, 2.2);
  }

  /* ---------- quantized tint caches: strings/gradients rebuild only on change ---------- */
  function syncTint() {
    var r = (mr + 0.5) | 0, g = (mg + 0.5) | 0, b = (mb + 0.5) | 0;
    if (r === qR && g === qG && b === qB) return;
    qR = r; qG = g; qB = b;
    strDisk = 'rgb(' + r + ',' + g + ',' + b + ')';
    /* photon ring: pulled 55% toward cyan-white */
    strRing = 'rgb(' + ((r + (232 - r) * 0.55) | 0) + ',' + ((g + (248 - g) * 0.55) | 0) + ',' + ((b + (255 - b) * 0.55) | 0) + ')';
    /* hot inner disk: pulled 80% toward white */
    strHot = 'rgb(' + ((r + (244 - r) * 0.8) | 0) + ',' + ((g + (252 - g) * 0.8) | 0) + ',' + ((b + (255 - b) * 0.8) | 0) + ')';
    tintGradDirty = true;
  }

  function buildHoleGlow() {
    holeGlowR = coreR * 4.4;
    holeGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, holeGlowR);
    holeGlow.addColorStop(0, 'rgba(' + qR + ',' + qG + ',' + qB + ',0.15)');
    holeGlow.addColorStop(0.4, 'rgba(' + qR + ',' + qG + ',' + qB + ',0.05)');
    holeGlow.addColorStop(1, 'rgba(' + qR + ',' + qG + ',' + qB + ',0)');
    tintGradDirty = false;
  }

  /* ---------- nebula sprites (baked once at init) ---------- */
  function bakeNebula(stops) {
    var c = document.createElement('canvas');
    c.width = NEB_PX;
    c.height = NEB_PX;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(NEB_PX / 2, NEB_PX / 2, 0, NEB_PX / 2, NEB_PX / 2, NEB_PX / 2);
    for (var i = 0; i < stops.length; i++) grad.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, NEB_PX, NEB_PX);
    return c;
  }

  function buildNebulas() {
    /* peak alpha <= .06 everywhere; cyan->deep blue, magenta->deep purple */
    nebA = bakeNebula([
      [0, 'rgba(0,240,255,0.06)'],
      [0.35, 'rgba(30,90,220,0.045)'],
      [0.7, 'rgba(12,32,96,0.02)'],
      [1, 'rgba(4,6,10,0)']
    ]);
    nebB = bakeNebula([
      [0, 'rgba(255,45,120,0.055)'],
      [0.4, 'rgba(150,32,170,0.038)'],
      [0.75, 'rgba(52,16,84,0.018)'],
      [1, 'rgba(4,6,10,0)']
    ]);
  }

  /* ---------- layout ---------- */
  function computeActive() {
    activeDisk = Math.min(POOL, Math.round(diskBase * intensity));
    for (var k = 0; k < starLayers.length; k++) {
      var L = starLayers[k];
      L.n = Math.min(L.cap, Math.round(L.baseN * intensity));
    }
  }

  function layout() {
    isMobile = W < MOBILE_W;
    portrait = H > W;
    if (portrait) { hx = W * 0.5; hy = H * 0.30; }   /* upper-center on phones */
    else { hx = W * 0.62; hy = H * 0.5; }            /* slightly right of center */
    coreR = Math.min(W, H) * 0.07;
    if (coreR < 20) coreR = 20;
    else if (coreR > 80) coreR = 80;
    diskBase = isMobile ? DISK_MOBILE : DISK_DESKTOP;
    nebSize = Math.max(W, H) * 1.5;
    computeActive();
  }

  function buildStars() {
    var area = W * H;
    for (var k = 0; k < starLayers.length; k++) {
      var L = starLayers[k];
      var n = Math.round(area / L.per);
      if (n < L.min) n = L.min;
      if (n > L.cap) n = L.cap;
      L.baseN = n;
      for (var i = 0; i < L.cap; i++) {
        L.x[i] = Math.random() * W;
        L.y[i] = Math.random() * H;
        L.r[i] = rand(L.rLo, L.rHi);
        L.a[i] = rand(L.aLo, L.aHi);
        L.ph[i] = Math.random() * TAU;
        L.sp[i] = rand(L.tLo, L.tHi);
      }
    }
    computeActive();
  }

  /* ---------- update (never runs under reduced motion) ---------- */
  function step(dt) {
    tNow += dt;

    /* smoothed pointer for parallax */
    var k = 1 - Math.exp(-4 * dt);
    pxs += (pxt - pxs) * k;
    pys += (pyt - pys) * k;

    /* warp state machine — midCb fires exactly once at the singularity */
    if (warpState === 1) {
      warpT += dt / WARP_IN;
      if (warpT >= 1) {
        warpT = 1;
        warpState = 2;
        fireWarpCb();
      }
    } else if (warpState === 2) {
      warpT -= dt / WARP_OUT;
      if (warpT <= 0) {
        warpT = 0;
        warpState = 0;
      }
    }
    warpK = warpT * warpT * (3 - 2 * warpT);

    /* mood lerp */
    if (moodT < 1) {
      moodT += dt / MOOD_TIME;
      if (moodT > 1) moodT = 1;
      var e = moodT * moodT * (3 - 2 * moodT);
      mr = mfr + (mtr - mfr) * e;
      mg = mfg + (mtg - mfg) * e;
      mb = mfb + (mtb - mfb) * e;
    }
    syncTint();

    /* burst flare decay */
    if (burstT > 0) {
      burstT -= dt;
      if (burstT < 0) burstT = 0;
    }
    burstK = burstT > 0 ? burstT / BURST_TIME : 0;

    precess += PRECESS * dt;
    if (precess > TAU) precess -= TAU;

    /* starfield drift + edge wrap */
    for (var k2 = 0; k2 < starLayers.length; k2++) {
      var L = starLayers[k2];
      var dx = L.vx * dt, dy = L.vy * dt;
      for (var i = 0; i < L.n; i++) {
        var x = L.x[i] + dx, y = L.y[i] + dy;
        if (x < -STAR_WRAP) x += W + STAR_WRAP * 2;
        else if (x > W + STAR_WRAP) x -= W + STAR_WRAP * 2;
        if (y < -STAR_WRAP) y += H + STAR_WRAP * 2;
        else if (y > H + STAR_WRAP) y -= H + STAR_WRAP * 2;
        L.x[i] = x;
        L.y[i] = y;
      }
    }

    /* accretion disk: Kepler-ish orbit + decay; warp feeds the hole */
    var speedUp = 1 + 5 * warpK;
    var decayUp = 1 + 2.5 * warpK;
    for (var j = 0; j < activeDisk; j++) {
      var p = disk[j];
      p.th += (KEPLER / Math.sqrt(p.r)) * dt * speedUp;
      if (p.th >= TAU) p.th -= TAU;
      p.r -= p.decay * dt * decayUp;
      if (p.r < R_KILL) respawn(p, false);
    }
  }

  /* ---------- draw passes ---------- */
  function drawNebulas() {
    var S = nebSize, half = S / 2;
    /* slow independent Lissajous drift; frozen when tNow never advances */
    var ax = W * 0.28 + Math.sin(tNow * 0.031 + 1.7) * W * 0.04;
    var ay = H * 0.34 + Math.cos(tNow * 0.023) * H * 0.05;
    var bx = W * 0.78 + Math.sin(tNow * 0.019 + 4.2) * W * 0.05;
    var by = H * 0.72 + Math.cos(tNow * 0.027 + 2.1) * H * 0.04;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.drawImage(nebA, ax - half, ay - half, S, S);
    ctx.drawImage(nebB, bx - half, by - half, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStars() {
    var ndx = W > 0 ? (pxs - W * 0.5) / (W * 0.5) : 0;
    var ndy = H > 0 ? (pys - H * 0.5) / (H * 0.5) : 0;
    if (ndx > 1) ndx = 1; else if (ndx < -1) ndx = -1;
    if (ndy > 1) ndy = 1; else if (ndy < -1) ndy = -1;
    var streaking = warpK > 0.01;
    var pull = warpK * WARP_PULL;
    for (var k = 0; k < starLayers.length; k++) {
      var L = starLayers[k];
      var ox = ndx * L.par, oy = ndy * L.par;
      ctx.fillStyle = L.color;
      if (streaking) ctx.beginPath();
      for (var i = 0; i < L.n; i++) {
        var x = L.x[i] + ox, y = L.y[i] + oy;
        var a = L.a[i] * (0.65 + 0.35 * Math.sin(tNow * L.sp[i] + L.ph[i]));
        if (streaking) {
          x += (hx - x) * pull;
          y += (hy - y) * pull;
          var dx = x - hx, dy = y - hy;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1) d = 1;
          var sl = warpK * (14 + L.par * 2.2);
          ctx.moveTo(x, y);
          ctx.lineTo(x + (dx / d) * sl, y + (dy / d) * sl);
        }
        ctx.globalAlpha = a;
        ctx.fillRect(x, y, L.r[i], L.r[i]);
      }
      if (streaking) {
        /* one batched stroke per layer: radial warp streaks */
        ctx.globalAlpha = warpK * 0.55;
        ctx.strokeStyle = L.color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHoleGlow(cs) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(cs, cs);
    ctx.fillStyle = holeGlow;
    ctx.fillRect(-holeGlowR, -holeGlowR, holeGlowR * 2, holeGlowR * 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* one disk hemisphere (behind=true -> far side of the hole) in two color
     batches; per-particle work is pure math on preallocated pool objects */
  function diskHalf(behind, pc, ps, wShrink, alphaBoost) {
    ctx.globalCompositeOperation = 'lighter';
    for (var batch = 0; batch < 2; batch++) {
      ctx.fillStyle = batch === 0 ? strDisk : strHot;
      var wantHot = batch === 1;
      for (var i = 0; i < activeDisk; i++) {
        var p = disk[i];
        var hot = p.r < HOT_R;
        if (hot !== wantHot) continue;
        var sn = Math.sin(p.th);
        if ((sn < 0) !== behind) continue;
        var cn = Math.cos(p.th);
        var rr = p.r * coreR * wShrink;
        var x0 = cn * rr;
        var y0 = sn * rr * FLAT;
        var x = hx + x0 * pc - y0 * ps;
        var y = hy + x0 * ps + y0 * pc;
        /* brightness asymmetry: normalized screen-ward velocity — the side
           rotating toward the viewer runs ~2x alpha */
        var s = -sn * ps + cn * FLAT * pc;
        var a = p.base * (1.5 + 0.5 * s) * alphaBoost;
        if (p.r < 1.8) a *= 1 + (1.8 - p.r) * 0.9;   /* inner heat */
        if (a > 0.95) a = 0.95;
        ctx.globalAlpha = a;
        ctx.fillRect(x - p.sz * 0.5, y - p.sz * 0.5, p.sz, p.sz);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawCore(cs) {
    var cr = coreR * cs;
    ctx.beginPath();
    ctx.arc(hx, hy, cr, 0, TAU);
    ctx.fillStyle = CORE_BLACK;              /* true black fill */
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = VOID;                  /* 1px void edge */
    ctx.stroke();
  }

  function drawRing(cs, ringFlash) {
    var rr = (coreR + 2) * cs;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = strDisk;
    ctx.globalAlpha = 0.10 * ringFlash;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(hx, hy, rr, rr * RING_FLAT, TILT, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = strRing;
    ctx.globalAlpha = 0.28 * ringFlash;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(hx, hy, rr, rr * RING_FLAT, TILT, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, 0.9 * ringFlash);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(hx, hy, rr, rr * RING_FLAT, TILT, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawShimmer() {
    var shR = coreR * 3.55 * (1 + 0.02 * Math.sin(tNow * 1.7));
    var shA = 0.05 * (0.6 + 0.4 * Math.sin(tNow * 2.3)) + burstK * 0.05;
    var rot = TILT + precess * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = strDisk;
    ctx.globalAlpha = shA;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(hx, hy, shR, shR * FLAT, rot, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = shA * 1.6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(hx, hy, shR, shR * FLAT, rot, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawRays(cs) {
    var R0 = coreR * cs * 2.2;
    var maxR = Math.sqrt(W * W + H * H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = strDisk;
    for (var i = 0; i < RAY_COUNT; i++) {
      var ray = rays[i];
      var c = Math.cos(ray.ang), s = Math.sin(ray.ang);
      ctx.globalAlpha = ray.a * warpK;
      ctx.lineWidth = ray.w;
      ctx.beginPath();
      ctx.moveTo(hx + c * R0, hy + s * R0);
      ctx.lineTo(hx + c * maxR * ray.len, hy + s * maxR * ray.len);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /* ---------- frame assembly ---------- */
  function render() {
    if (tintGradDirty) buildHoleGlow();
    var cs = 1 + WARP_CORE * warpK;                 /* core scale (~2.4x peak) */
    var wShrink = 1 - WARP_PULL * warpK;            /* disk dives inward */
    var alphaBoost = 1 + burstK * 1.3 + warpK * 0.8;
    var ringFlash = 1 + burstK * 2 + warpK * 1.2;
    var pcA = TILT + precess;
    var pc = Math.cos(pcA), ps = Math.sin(pcA);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, W, H);

    drawNebulas();
    drawStars();
    drawHoleGlow(cs);
    diskHalf(true, pc, ps, wShrink, alphaBoost);    /* far side behind the hole */
    drawCore(cs);
    drawRing(cs, ringFlash);
    diskHalf(false, pc, ps, wShrink, alphaBoost);   /* near side in front */
    drawShimmer();
    if (warpK > 0.001) drawRays(cs);

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawStatic() {
    /* reduced-motion frame: identical composition, but tNow/warpK/burstK are
       all frozen at rest so nothing moves — no drift, no orbit, no twinkle */
    syncTint();
    render();
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

  /* ---------- gradients / sizing ---------- */
  function buildGradients() {
    buildHoleGlow();
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.72);
    vignette.addColorStop(0, 'rgba(2,4,8,0)');
    vignette.addColorStop(1, 'rgba(2,4,8,0.55)');
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
    pxt = pxs = W * 0.5;
    pyt = pys = H * 0.5;
    layout();
    buildStars();
    buildGradients();
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
    intensity = Math.max(0, Math.min(2, n));
    computeActive();
    if (reduced) drawStatic();
  }

  function burst() {
    if (reduced) return;
    burstT = BURST_TIME;
  }

  function fireWarpCb() {
    if (warpFired) return;
    warpFired = true;
    var cb = warpCb;
    warpCb = null;
    if (!cb) return;
    try { cb(); }
    catch (err) {
      if (window.console && window.console.error) window.console.error(err);
    }
  }

  function warp(midCb) {
    /* reduced motion or halted loop: instant cut, callback synchronous */
    if (reduced || !running) {
      if (typeof midCb === 'function') midCb();
      return;
    }
    if (warpState !== 0) return;   /* one jump at a time */
    warpState = 1;
    warpT = 0;
    warpFired = false;
    warpCb = typeof midCb === 'function' ? midCb : null;
  }

  function setMood(m) {
    if (!MOODS.hasOwnProperty(m)) return;
    if (m === moodName && moodT >= 1) return;
    var t = MOODS[m];
    /* seamless handoff even mid-fade: lerp starts from the live tint */
    mfr = mr; mfg = mg; mfb = mb;
    mtr = t[0]; mtg = t[1]; mtb = t[2];
    moodName = m;
    moodT = 0;
    if (reduced) {
      mr = mtr; mg = mtg; mb = mtb;
      moodT = 1;
      drawStatic();
    }
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
      warpState = 0;
      warpT = 0;
      warpK = 0;
      warpCb = null;
      mr = mtr; mg = mtg; mb = mtb;
      moodT = 1;
      drawStatic();
    } else {
      start();
    }
  }

  function init() {
    allocPools();
    buildNebulas();
    syncTint();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', function (e) {
      pxt = e.clientX;
      pyt = e.clientY;
    }, { passive: true });
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
    warp: warp,
    setMood: setMood
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
