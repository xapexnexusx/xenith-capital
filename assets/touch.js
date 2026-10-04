/* Xenith Capital · TOUCH
   Two lines of light lean toward you. Where you touch, they meet; pink blooms from that point.
   Each touch must be held until they fully join (slow, eased); then a sentence surfaces and stays while you hold.
   No buttons, no network, no storage, no cookies. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('live')) return;

  var cv, ctx, W = 0, H = 0, DPR = 1, raf = 0;
  var LINES = [], step = 0, finished = false;
  var say, face, stage, hint;
  var px = -1, py = -1, pxS = -1, pyS = -1;   // pointer, and its smoothed follow
  var present = 0;                            // pointer nearby (lean)
  var holding = false, holdId = null, holdStart = 0, idleAt = 0, joinT = 0, join = 0, bloom = 0, earned = false;
  var HOLD_MS = 3400;                         // time to fully join
  var t0 = performance.now();
  var seed = Math.random() * 1000;
  var endPhase = 0;

  function hash(n) { var x = Math.sin(n * 127.1 + seed) * 43758.5453; return x - Math.floor(x); }
  function vnoise(x) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); return hash(i) * (1 - f) + hash(i + 1) * f; }
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  var bufM, bufH, N = 0;
  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    N = Math.ceil(W / 4) + 1; bufM = new Float32Array(N); bufH = new Float32Array(N);
  }

  function draw(now) {
    var t = (now - t0) / 1000;
    ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, W, H);
    var mid = H * (finished ? 0.47 : 0.64);
    var amp = Math.min(H * 0.1, 84);
    var breath = 0.5 + 0.5 * Math.sin(t * 1.25);          // slow pulse, ~5s
    var cx = pxS < 0 ? W / 2 : pxS;
    var reach = Math.max(W * 0.22, 160) + join * W * 0.9;  // how far the joining spreads from the touch
    var lean = present * (1 - join);

    for (var i = 0; i < N; i++) {
      var x = i * 4;
      var hy = Math.sin(x * 0.0072 + t * 0.5 + (finished ? endPhase : 0)) * 0.75 + Math.sin(x * 0.0021 + t * 0.19) * 0.25;
      var my = Math.sin(x * 0.014 + t * 1.6) * 0.45 + (vnoise(x * 0.08 + t * 7) - 0.5) * 1.3 + (vnoise(x * 0.23 + t * 12) - 0.5) * 0.45;
      var d = Math.abs(x - cx);
      var near = Math.exp(-(d * d) / (2 * reach * reach));   // 1 under the finger, falls off
      var k = Math.min(1, join * near * 1.15 + (finished ? 1 : 0));
      // lean: both lines bend gently toward the pointer's height before contact
      var lp = 0;
      if (lean > 0.01 && pyS >= 0) lp = ((pyS - mid) / amp) * 0.35 * lean * near;
      var m = my * (1 - k) * (1 - 0.35 * lean * near) + hy * k + lp;
      var h = hy * (1 - 0.15 * lean * near) + lp * 0.8;
      bufM[i] = mid + m * amp; bufH[i] = mid + h * amp;
    }

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function path(a) { ctx.beginPath(); ctx.moveTo(0, a[0]); for (var i = 1; i < N; i++) ctx.lineTo(i * 4, a[i]); }
    // glow without blur: one wide faint stroke under one crisp stroke (no shadowBlur; cheap on mobile)
    function glow(a, rgb, w, alpha) {
      path(a);
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (alpha * 0.16).toFixed(3) + ')'; ctx.lineWidth = w * 6; ctx.stroke();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')'; ctx.lineWidth = w; ctx.stroke();
    }
    var fade = finished ? 0 : 1 - Math.min(1, join * 0.8);
    if (fade > 0.01) {
      glow(bufH, '255,183,128', 2, 0.25 + 0.55 * fade);
      glow(bufM, '51,230,255', 1.3, 0.22 + 0.58 * fade);
    }
    var pk = Math.max(join, finished ? 1 : 0);
    if (pk > 0.02) {
      for (var j = 0; j < N; j++) bufM[j] = (bufM[j] + bufH[j]) / 2;   // reuse buffer: the meeting line
      var a = Math.min(1, pk * 1.1) * (0.75 + 0.25 * breath);
      var w = 1.4 + pk * 2.2 + breath * 0.6;
      if (finished) { glow(bufM, '255,61,154', w, 0.6 + 0.3 * breath); }
      else {
        var g = ctx.createLinearGradient(cx - reach * 1.6, 0, cx + reach * 1.6, 0);
        g.addColorStop(0, 'rgba(255,61,154,0)'); g.addColorStop(0.5, 'rgba(255,61,154,' + (a * 0.18).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,61,154,0)');
        path(bufM); ctx.strokeStyle = g; ctx.lineWidth = w * 6; ctx.stroke();
        var g2 = ctx.createLinearGradient(cx - reach * 1.6, 0, cx + reach * 1.6, 0);
        g2.addColorStop(0, 'rgba(255,61,154,0)'); g2.addColorStop(0.5, 'rgba(255,61,154,' + a.toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,61,154,0)');
        ctx.strokeStyle = g2; ctx.lineWidth = w; ctx.stroke();
      }
    }
  }

  function show(i) {
    say.classList.remove('on');
    var portrait = i === 4;
    setTimeout(function () {
      say.textContent = LINES[i];
      say.classList.toggle('pk', i === 2);
      say.classList.toggle('sm', portrait);
      stage.classList.toggle('portrait', portrait);
      say.classList.add('on');
      if (portrait) setTimeout(function () { face.classList.add('on'); }, 300);
    }, 500);
  }
  function hide() {
    say.classList.remove('on');
    face.classList.remove('on');
  }

  function finish() {
    finished = true;
    endPhase = Math.PI / 2 - (W / 2 * 0.0072 + (performance.now() - t0) / 1000 * 0.5);
    hide(); stage.classList.remove('portrait');
    setTimeout(function () { root.classList.add('done'); }, 1800);
  }

  function loop(now) {
    if (!root.classList.contains('live')) return;
    // smooth pointer follow
    present *= 0.985;
    if (px >= 0) { pxS = pxS < 0 ? px : pxS + (px - pxS) * 0.35; pyS = pyS < 0 ? py : pyS + (py - pyS) * 0.35; }
    if (holding && !finished) {
      joinT = Math.min(1, (now - holdStart) / HOLD_MS);
      join += (ease(joinT) - join) * 0.18;
      if (joinT >= 1 && !earned) { earned = true; show(step); }
    } else {
      join += (0 - join) * 0.022;            // let go: it fades slowly
    }
    draw(now);
    if (finished && root.classList.contains('done') && !idleAt) idleAt = now;
    if (idleAt && now - idleAt > 4500) return;   // settle and stop: no endless motion
    raf = requestAnimationFrame(loop);
  }

  function onMove(e) { px = e.clientX; py = e.clientY; present = Math.min(1, present + 0.25); }
  function inUi(e) { return e.target && e.target.closest && e.target.closest('a,button'); }
  function press(e) {
    if (!root.classList.contains('live') || finished || inUi(e) || holding) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holdId = e.pointerId;
    try { document.body.setPointerCapture(e.pointerId); } catch (x) {}
    if (e.cancelable) e.preventDefault();
    px = e.clientX; py = e.clientY; present = 1;
    holding = true; holdStart = performance.now(); earned = false;
    hint.classList.remove('on');
  }
  function release(e) {
    if (!holding) return;
    if (e && e.pointerId !== undefined && holdId !== null && e.pointerId !== holdId) return;
    holding = false; holdId = null;
    if (earned) {
      step++;
      setTimeout(hide, 900);                 // the line lingers a moment, then fades
      if (step >= LINES.length) setTimeout(finish, 1200);
      else setTimeout(function () { if (!holding) hint.classList.add('on'); }, 4200);
    }
  }

  function toStatic() { root.classList.remove('live', 'done'); cancelAnimationFrame(raf); }

  function boot() {
    cv = document.getElementById('field'); ctx = cv && (cv.getContext('2d', { alpha: false, desynchronized: true }) || cv.getContext('2d'));
    if (!ctx) { root.classList.remove('live'); return; }
    say = document.getElementById('say'); face = document.getElementById('face');
    stage = document.getElementById('stage'); hint = document.getElementById('hint');
    var src = document.querySelectorAll('#lines li');
    for (var i = 0; i < src.length; i++) { var c = src[i].cloneNode(true); var w = c.querySelector('.who'); if (w) w.parentNode.removeChild(w); LINES.push(c.textContent.trim()); }
    size();
    var rz = 0; window.addEventListener('resize', function () { if (rz) return; rz = requestAnimationFrame(function () { rz = 0; size(); }); });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', function () { release(); });
    window.addEventListener('lostpointercapture', release);
    document.addEventListener('contextmenu', function (e) { if (root.classList.contains('live') && !inUi(e)) e.preventDefault(); });
    document.addEventListener('pointerleave', function () { present = 0; });
    var im = face.querySelector('img'); if (im) { im.loading = 'eager'; if (im.decode) im.decode().catch(function () {}); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) release(); });
    // keyboard users: Tab moves focus into the readable page, which reveals it
    document.addEventListener('keydown', function (e) { if (e.key === 'Tab' && !finished) toStatic(); });
    if (window.matchMedia) {
      var q1 = window.matchMedia('(prefers-reduced-motion: reduce)'), q2 = window.matchMedia('(min-height: 36em) and (min-width: 20em)');
      var chk = function () { if (q1.matches || !q2.matches) toStatic(); };
      if (q1.addEventListener) { q1.addEventListener('change', chk); q2.addEventListener('change', chk); }
    }
    root.classList.add('booted');
    setTimeout(function () { hint.classList.add('on'); }, 2600);
    raf = requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
