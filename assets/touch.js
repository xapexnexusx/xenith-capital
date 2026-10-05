/* Xenith Capital · TOUCH
   Two lines of light. Where you touch, they find each other; hold, and they wind together until a sentence surfaces.
   Every place a sentence was earned stays lit. No buttons, no network, no storage, no cookies. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('live')) return;

  var cv, ctx, W = 0, H = 0, DPR = 1, raf = 0, last = 0, doneAt = 0;
  var LINES = [], HINTS = ['touch', 'again', 'slower', 'stay', 'closer', 'don\u2019t let go'];
  var step = 0, finished = false;
  var say, face, stage, hint;
  var px = -1, cx = -1, hov = 0, near = 0;
  var holding = false, holdId = null, holdStart = 0, join = 0, earned = false, earnedAt = 0;
  var marks = [], secret = 0, phase = 0;
  var HOLD_MS = 3400, STEP = 5;
  var t0 = performance.now();
  var seed = Math.random() * 1000;
  var bufM, bufH, bufP, N = 0;

  function hash(n) { var x = Math.sin(n * 127.1 + seed) * 43758.5453; return x - Math.floor(x); }
  function vnoise(x) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); return hash(i) * (1 - f) + hash(i + 1) * f; }
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  // frame-rate independent approach: same feel at 30, 60 or 120 Hz
  function smooth(cur, to, rate, dt) { return cur + (to - cur) * (1 - Math.exp(-rate * dt)); }
  // a pulse with two beats
  function beat(ph) { var p = ph % 1; return Math.exp(-Math.pow((p - 0.08) / 0.035, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.28) / 0.045, 2)); }

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    STEP = W < 700 ? 6 : 5;
    N = Math.ceil(W / STEP) + 1;
    bufM = new Float32Array(N); bufH = new Float32Array(N); bufP = new Float32Array(N);
  }

  function path(a) { ctx.beginPath(); ctx.moveTo(0, a[0]); for (var i = 1; i < N; i++) ctx.lineTo(i * STEP, a[i]); }
  function glow(a, rgb, w, alpha) {
    path(a);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (alpha * 0.16).toFixed(3) + ')'; ctx.lineWidth = w * 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')'; ctx.lineWidth = w; ctx.stroke();
  }
  function dot(x, y, r, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,61,154,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,61,154,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function draw(t) {
    ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, W, H);
    var mid = H * (finished ? 0.38 : 0.64);         // fixed: the lines never chase the finger's height
    var amp = Math.min(H * 0.1, 84);
    var hb = beat(phase);
    var c = cx < 0 ? W / 2 : cx;
    var reach = Math.max(W * 0.22, 150) + join * W * 0.9;
    var r2 = 2 * reach * reach, l2 = 2 * 150 * 150;
    var braid = (finished ? 2 + 9 * secret : 36 * join * (1 - join)) / amp;
    var lean = near * (1 - join) * 0.5;

    for (var i = 0; i < N; i++) {
      var x = i * STEP, d = x - c;
      var hy = Math.sin(x * 0.0072 + t * 0.5) * 0.75 + Math.sin(x * 0.0021 + t * 0.19) * 0.25;
      var my = Math.sin(x * 0.014 + t * 1.6) * 0.45 + (vnoise(x * 0.08 + t * 7) - 0.5) * 1.5;
      var g = Math.exp(-(d * d) / r2);
      var k = finished ? 1 : Math.min(1, join * g * 1.15 + lean * Math.exp(-(d * d) / l2));
      var m = my + (hy - my) * k;
      var tw = Math.sin(x * 0.045 - t * 1.3) * braid * (finished ? 1 : g);   // they wind around each other
      bufM[i] = mid + (m + tw) * amp; bufH[i] = mid + (hy - tw) * amp; bufP[i] = mid + ((m + hy) / 2) * amp;
    }

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var fade = finished ? 0.3 + 0.4 * secret : 1 - Math.min(0.65, join * 0.65);
    glow(bufH, '255,183,128', 2, 0.22 + 0.55 * fade);
    path(bufM); ctx.strokeStyle = 'rgba(51,230,255,' + (0.34 + 0.5 * fade).toFixed(3) + ')'; ctx.lineWidth = 1.3; ctx.stroke();

    var pk = finished ? 1 : join;
    if (pk > 0.02) {
      var w = 1.2 + pk * 1.8 + hb * 1.3 * pk;
      if (finished) glow(bufP, '255,61,154', w, 0.55 + 0.3 * hb);
      else {
        var a = Math.min(1, pk * 1.1) * (0.7 + 0.3 * hb);
        var g1 = ctx.createLinearGradient(c - reach * 1.6, 0, c + reach * 1.6, 0);
        g1.addColorStop(0, 'rgba(255,61,154,0)'); g1.addColorStop(0.5, 'rgba(255,61,154,' + (a * 0.18).toFixed(3) + ')'); g1.addColorStop(1, 'rgba(255,61,154,0)');
        path(bufP); ctx.strokeStyle = g1; ctx.lineWidth = w * 6; ctx.stroke();
        var g2 = ctx.createLinearGradient(c - reach * 1.6, 0, c + reach * 1.6, 0);
        g2.addColorStop(0, 'rgba(255,61,154,0)'); g2.addColorStop(0.5, 'rgba(255,61,154,' + a.toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,61,154,0)');
        ctx.strokeStyle = g2; ctx.lineWidth = w; ctx.stroke();
        var ci = Math.max(0, Math.min(N - 1, Math.round(c / STEP)));
        dot(c, bufP[ci], 40 + 60 * pk, 0.16 * pk * (0.6 + 0.4 * hb));
      }
    }
    // every place a sentence was earned stays warm
    for (var j = 0; j < marks.length; j++) {
      var mk = marks[j], mi = Math.max(0, Math.min(N - 1, Math.round(mk.x / STEP)));
      dot(mk.x, bufP[mi], 9 + 5 * hb, 0.5 * mk.a);
    }
    if (secret > 0.55) {
      ctx.font = '300 11px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,61,154,' + Math.min(0.85, (secret - 0.55) * 2.2).toFixed(3) + ')';
      ctx.fillText('10 \u00b7 03 \u00b7 26', W / 2, mid - amp * 1.25 - 14);
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
  function hide() { say.classList.remove('on'); face.classList.remove('on'); }
  function cue(i) { hint.textContent = HINTS[Math.min(i, HINTS.length - 1)]; hint.classList.add('on'); }

  function finish() {
    finished = true;
    hide(); stage.classList.remove('portrait');
    setTimeout(function () { root.classList.add('done'); doneAt = performance.now(); }, 1800);
  }

  function loop(now) {
    raf = 0;
    if (!root.classList.contains('live')) return;
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    var t = (now - t0) / 1000;
    if (px >= 0) cx = cx < 0 ? px : smooth(cx, px, 12, dt);
    hov *= Math.exp(-0.7 * dt);
    near = smooth(near, holding ? 1 : hov, holding ? 6 : 1.5, dt);
    if (holding && !finished) {
      var p = Math.min(1, (now - holdStart) / HOLD_MS);
      join = smooth(join, ease(p), 9, dt);
      if (p >= 1 && !earned) { earned = true; earnedAt = now; show(step); marks.push({ x: cx, a: 0 }); }
    } else if (!finished) {
      join = smooth(join, 0, 0.8, dt);                 // let go: it lingers, then lets go
    }
    var bpm = 52 + 16 * join + (earned && holding ? Math.min(14, (now - earnedAt) / 1000 * 3) : 0) + (finished ? 22 * secret : 0);
    phase += dt * bpm / 60;
    for (var j = 0; j < marks.length; j++) marks[j].a = smooth(marks[j].a, (holding && j === marks.length - 1) || finished ? 1 : 0.45, 2, dt);
    if (finished) secret = smooth(secret, holding ? 1 : 0, holding ? 0.45 : 1.4, dt);
    draw(t);
    if (doneAt && !holding && secret < 0.01 && now - doneAt > 5000) return;   // settle and stop
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && root.classList.contains('live')) { last = performance.now(); raf = requestAnimationFrame(loop); } }

  function onMove(e) {
    if (holdId !== null && e.pointerId !== holdId) return;
    px = e.clientX;
    if (e.pointerType === 'mouse') hov = Math.min(1, hov + 0.2);
  }
  function inUi(e) { return e.target && e.target.closest && e.target.closest('a,button'); }
  function press(e) {
    if (!root.classList.contains('live') || inUi(e) || holding) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holdId = e.pointerId;
    try { document.body.setPointerCapture(e.pointerId); } catch (x) {}
    if (e.cancelable) e.preventDefault();
    px = e.clientX; if (cx < 0) cx = px;
    holding = true; holdStart = performance.now(); earned = false;
    hint.classList.remove('on');
    kick();
  }
  function release(e) {
    if (!holding) return;
    if (e && e.pointerId !== undefined && holdId !== null && e.pointerId !== holdId) return;
    holding = false; holdId = null;
    if (finished) return;
    if (earned) {
      step++;
      setTimeout(hide, 900);
      if (step >= LINES.length) setTimeout(finish, 1200);
      else setTimeout(function () { if (!holding) cue(step); }, 4200);
    } else {
      setTimeout(function () { if (!holding && !finished) cue(step); }, 2500);
    }
  }

  function toStatic() { root.classList.remove('live', 'done'); if (raf) cancelAnimationFrame(raf); raf = 0; }

  function boot() {
    cv = document.getElementById('field'); ctx = cv && cv.getContext('2d', { alpha: false });
    if (!ctx) { root.classList.remove('live'); return; }
    say = document.getElementById('say'); face = document.getElementById('face');
    stage = document.getElementById('stage'); hint = document.getElementById('hint');
    var src = document.querySelectorAll('#lines li');
    for (var i = 0; i < src.length; i++) { var c = src[i].cloneNode(true); var w = c.querySelector('.who'); if (w) w.parentNode.removeChild(w); LINES.push(c.textContent.trim()); }
    size();
    var rz = 0; window.addEventListener('resize', function () { if (rz) return; rz = requestAnimationFrame(function () { rz = 0; size(); kick(); }); });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', function () { release(); });
    window.addEventListener('lostpointercapture', release);
    document.addEventListener('contextmenu', function (e) { if (root.classList.contains('live') && !inUi(e)) e.preventDefault(); });
    document.addEventListener('pointerleave', function () { hov = 0; });
    var im = face.querySelector('img'); if (im) { im.loading = 'eager'; if (im.decode) im.decode().catch(function () {}); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) release(); else kick(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Tab' && !finished) toStatic(); });
    if (window.matchMedia) {
      var q1 = window.matchMedia('(prefers-reduced-motion: reduce)'), q2 = window.matchMedia('(min-height: 36em) and (min-width: 20em)');
      var chk = function () { if (q1.matches || !q2.matches) toStatic(); };
      if (q1.addEventListener) { q1.addEventListener('change', chk); q2.addEventListener('change', chk); }
    }
    root.classList.add('booted');
    setTimeout(function () { if (!holding && step === 0) cue(0); }, 2600);
    kick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
