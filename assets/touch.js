/* Xenith Capital · TOUCH
   Two lines of light. A point of pink breathes where they almost touch.
   Hold, and they find each other and wind together until a sentence surfaces.
   Every place a sentence was earned stays lit. No buttons, no words of instruction, no network, no storage, no cookies. */
/* 10·03·26 */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('live')) return;

  var cv, ctx, W = 0, H = 0, DPR = 1, raf = 0, last = 0, doneAt = 0;
  var LINES = [];
  var step = 0, finished = false;
  var say, face, stage;
  var px = -1, cx = -1, hov = 0, near = 0;
  var holding = false, holdId = null, holdStart = 0, join = 0, cling = 0, earned = false, earnedAt = 0;
  var marks = [], secret = 0, phase = 0, fin = 0;
  var dotX = -1, dotA = 0;
  var spd = 0, lmx = -1, lmt = 0, flee = 0;                 // a point that won't be rushed
  var night = 0, nightOn = false, tscale = 1, tt = 0;       // the small hours
  var pts = {}, npts = 0, duo = 0, braided = 0;             // two fingers
  var knotA = 0, knotAt = 0, knotted = false;               // the knot
  var reachAt = -1e9, lastPh = 0;
  var PK = '255,61,154', PKN = '255,92,138';
  var HOLD_MS = 3400, STEP = 5;
  var t0 = performance.now();
  var seed = Math.random() * 1000;
  var bufM, bufH, bufP, N = 0;

  function pink() { return night > 0.5 ? PKN : PK; }
  function hash(n) { var x = Math.sin(n * 127.1 + seed) * 43758.5453; return x - Math.floor(x); }
  function vnoise(x) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); return hash(i) * (1 - f) + hash(i + 1) * f; }
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function smooth(cur, to, rate, dt) { return cur + (to - cur) * (1 - Math.exp(-rate * dt)); }   // frame-rate independent
  function beat(ph) { var p = ph % 1; return Math.exp(-Math.pow((p - 0.08) / 0.035, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.28) / 0.045, 2)); }
  function at(a, x) { return a[Math.max(0, Math.min(N - 1, Math.round(x / STEP)))]; }

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    STEP = W < 700 ? 6 : 5;
    N = Math.ceil(W / STEP) + 1;
    bufM = new Float32Array(N); bufH = new Float32Array(N); bufP = new Float32Array(N);
    if (dotX < 0) dotX = W / 2;
  }

  function path(a) { ctx.beginPath(); ctx.moveTo(0, a[0]); for (var i = 1; i < N; i++) ctx.lineTo(i * STEP, a[i]); }
  function glow(a, rgb, w, alpha) {
    path(a);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (alpha * 0.16).toFixed(3) + ')'; ctx.lineWidth = w * 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')'; ctx.lineWidth = w; ctx.stroke();
  }
  function dot(x, y, r, a, rgb) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + (rgb || pink()) + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + pink() + ',0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function draw(t) {
    ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, W, H);
    var ef = ease(fin);
    var mid = H * (0.64 - 0.26 * ef);                // glides up at the end; never snaps, never follows the finger's height
    var amp = Math.min(H * 0.1, 84);
    var hb = beat(phase);
    var c = cx < 0 ? W / 2 : cx;
    var reach = Math.max(W * 0.22, 150) + join * W * 0.9;
    var r2 = 2 * reach * reach, l2 = 2 * 150 * 150, d2 = 2 * 46 * 46;
    var braid = ((36 * join * (1 - join)) * (1 - ef) + (2 + 9 * secret) * ef + 22 * duo) / amp;
    var lean = near * (1 - join) * 0.5;
    var pull = 0.85 * dotA * (0.88 + 0.12 * hb);       // where they almost touch

    for (var i = 0; i < N; i++) {
      var x = i * STEP, d = x - c, dd = x - dotX;
      var hy = Math.sin(x * 0.0072 + t * 0.5) * 0.75 + Math.sin(x * 0.0021 + t * 0.19) * 0.25;
      var my = Math.sin(x * 0.014 + t * 1.6) * 0.45 + (vnoise(x * 0.08 + t * 7) - 0.5) * 1.5;
      var g = Math.exp(-(d * d) / r2);
      var k = Math.min(1, cling * g * 1.15 + lean * Math.exp(-(d * d) / l2) + pull * Math.exp(-(dd * dd) / d2));
      k = k + (1 - k) * Math.max(ef, duo * 0.9);
      var kn = knotA * Math.exp(-((x - W / 2) * (x - W / 2)) / (2 * 70 * 70));
      var m = my + (hy - my) * k;
      var tw = Math.sin(x * 0.045 - t * 1.3) * braid * (g * (1 - ef) + ef);
      bufM[i] = mid + (m + tw) * amp * (1 - kn); bufH[i] = mid + (hy - tw) * amp * (1 - kn); bufP[i] = mid + ((m + hy) / 2) * amp * (1 - kn);
    }

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var fade = (1 - Math.min(0.65, join * 0.65)) * (1 - ef) + (0.3 + 0.4 * secret) * ef;
    glow(bufH, '255,183,128', 2, 0.22 + 0.55 * fade);
    path(bufM); ctx.strokeStyle = 'rgba(51,230,255,' + (0.34 + 0.5 * fade).toFixed(3) + ')'; ctx.lineWidth = 1.3; ctx.stroke();

    var pk = Math.max(join, ef);
    if (pk > 0.02) {
      var w = 1.2 + pk * 1.8 + hb * 1.3 * pk;
      if (ef > 0.01) glow(bufP, pink(), w, (0.55 + 0.3 * hb) * ef);
      var jb = join * (1 - ef);
      if (jb > 0.02) {
        var a = Math.min(1, jb * 1.1) * (0.7 + 0.3 * hb);
        var g1 = ctx.createLinearGradient(c - reach * 1.6, 0, c + reach * 1.6, 0);
        g1.addColorStop(0, 'rgba(' + pink() + ',0)'); g1.addColorStop(0.5, 'rgba(' + pink() + ',' + (a * 0.18).toFixed(3) + ')'); g1.addColorStop(1, 'rgba(' + pink() + ',0)');
        path(bufP); ctx.strokeStyle = g1; ctx.lineWidth = w * 6; ctx.stroke();
        var g2 = ctx.createLinearGradient(c - reach * 1.6, 0, c + reach * 1.6, 0);
        g2.addColorStop(0, 'rgba(' + pink() + ',0)'); g2.addColorStop(0.5, 'rgba(' + pink() + ',' + a.toFixed(3) + ')'); g2.addColorStop(1, 'rgba(' + pink() + ',0)');
        ctx.strokeStyle = g2; ctx.lineWidth = w; ctx.stroke();
        dot(c, at(bufP, c), 40 + 60 * jb, 0.16 * jb * (0.6 + 0.4 * hb));
      }
    }
    // the point that waits for you
    if (dotA > 0.01) {
      var dy = at(bufP, dotX);
      dot(dotX, dy, 44 + 16 * hb, 0.14 * dotA * (0.55 + 0.45 * hb));
      dot(dotX, dy, 26 + 14 * hb, 0.6 * dotA * (0.5 + 0.5 * hb));
      dot(dotX, dy, 6.5, dotA, '255,226,240');
    }
    // every place a sentence was earned stays warm
    for (var j = 0; j < marks.length; j++) dot(marks[j].x, at(bufP, marks[j].x), 9 + 5 * hb, 0.5 * marks[j].a);
    if (secret > 0.55) {
      ctx.font = '300 11px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(' + pink() + ',' + Math.min(0.85, (secret - 0.55) * 2.2).toFixed(3) + ')';
      ctx.fillText('10 \u00b7 03 \u00b7 26', W / 2, mid - amp * 1.25 - 14);
    }
    // two fingers: the lines braid tight and write the day
    if (braided > 0.02) {
      var by = at(bufP, W / 2);
      ctx.font = '300 ' + Math.round(Math.min(30, W * 0.07)) + 'px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(' + pink() + ',0.9)'; ctx.shadowBlur = 18 * braided;
      ctx.fillStyle = 'rgba(' + pink() + ',' + (braided * (0.75 + 0.25 * hb)).toFixed(3) + ')';
      ctx.fillText('10 \u00b7 03 \u00b7 26', W / 2, by - amp * 0.9 - 10);
      ctx.shadowBlur = 0;
    }
    // the knot: one loop, one heartbeat, then apart
    if (knotA > 0.02) {
      var R0 = 24 + 6 * hb, ky = mid - R0;
      ctx.beginPath(); ctx.arc(W / 2, ky, R0 * knotA, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + pink() + ',' + (0.18 * knotA).toFixed(3) + ')'; ctx.lineWidth = 12; ctx.stroke();
      ctx.strokeStyle = 'rgba(' + pink() + ',' + (0.9 * knotA).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke();
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

  function finish() {
    finished = true;
    hide(); stage.classList.remove('portrait');
    setTimeout(function () { root.classList.add('done'); doneAt = performance.now(); }, 1800);
  }

  function loop(now) {
    raf = 0;
    if (!root.classList.contains('live')) return;
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    tt += dt * tscale; var t = tt;
    if (px >= 0) cx = cx < 0 ? px : smooth(cx, px, 12, dt);
    hov *= Math.exp(-0.7 * dt);
    near = smooth(near, holding ? 1 : hov, holding ? 6 : 1.5, dt);
    if (holding && !finished) {
      var p = Math.min(1, (now - holdStart) / HOLD_MS);
      join = smooth(join, ease(p), 9, dt);
      if (p >= 1 && !earned) { earned = true; earnedAt = now; show(step); marks.push({ x: cx, a: 0 }); }
    } else if (!finished) {
      // let go too soon and the lines follow a moment, reluctant, then relax
      join = smooth(join, 0, now - reachAt < 1100 ? 0.12 : (night > 0.5 ? 0.45 : 0.8), dt);
    }
    if (holding && npts >= 2 && !finished) holdStart += dt * 1000;   // two fingers is a pause, not progress
    duo = smooth(duo, npts >= 2 ? 1 : 0, npts >= 2 ? 2.4 : 1.6, dt);
    braided = smooth(braided, npts >= 2 && duo > 0.6 ? 1 : 0, npts >= 2 ? 1.1 : 1.8, dt);
    // the knot
    if (finished && holding && secret > 0.93 && !knotted) { knotted = true; knotAt = now; }
    if (!holding && knotted && now - knotAt > 3200) knotted = false;
    var ke = knotted ? (now - knotAt) / 1000 : 9;
    knotA = ke < 0.7 ? ease(ke / 0.7) : ke < 1.9 ? 1 : ke < 3 ? 1 - ease((ke - 1.9) / 1.1) : 0;
    // the machine line holds on longer than the warm one lets go
    cling = holding ? Math.max(cling, join) : smooth(cling, 0, 0.3, dt);
    if (finished) fin = smooth(fin, 1, 0.9, dt);
    // the waiting point: wanders, drifts toward a nearby cursor, goes to the finger, hides while held
    var wx = W / 2 + Math.sin(t * 0.13) * W * 0.16;
    var tx = holding ? cx : wx + ((cx < 0 ? wx : cx) - wx) * near * 0.85;
    // come at it fast and it slips away; come slowly and it lets you have it
    spd *= Math.exp(-4 * dt);
    var prox = cx < 0 ? 0 : Math.exp(-((cx - dotX) * (cx - dotX)) / (2 * 110 * 110));
    flee = smooth(flee, holding ? 0 : Math.min(1, Math.max(0, (spd - 500) / 900)) * prox, 6, dt);
    if (flee > 0.01) tx = dotX + (dotX >= cx ? 1 : -1) * 150 * flee;
    tx = Math.max(W * 0.08, Math.min(W * 0.92, tx));
    dotX = smooth(dotX, tx, holding ? 8 : (flee > 0.05 ? 5 : 0.9), dt);
    dotA = smooth(dotA, (!finished && !holding && t > 1.2 && join < 0.3) ? 1 : 0, holding ? 5 : 0.9, dt);
    var bpm = 52 - 6 * night + 16 * join + (earned && holding ? Math.min(14, (now - earnedAt) / 1000 * 3) : 0) + (finished ? 22 * secret : 0);
    phase += dt * bpm / 60;
    // the same double beat, in the hand that holds it (where the browser allows)
    if (holding && join > 0.2 && navigator.vibrate) {
      var f0 = lastPh % 1, f1 = phase % 1;
      var cross = function (b) { return f1 >= f0 ? (f0 < b && f1 >= b) : (f0 < b || f1 >= b); };
      try { if (cross(0.08)) navigator.vibrate(14); else if (cross(0.28)) navigator.vibrate(8); } catch (x) {}
    }
    lastPh = phase;
    for (var j = 0; j < marks.length; j++) marks[j].a = smooth(marks[j].a, (holding && j === marks.length - 1) || finished ? 1 : 0.45, 2, dt);
    if (finished) secret = smooth(secret, holding ? 1 : 0, holding ? 0.45 : 1.4, dt);
    draw(t);
    if (doneAt && fin > 0.999 && !holding && secret < 0.01 && knotA < 0.01 && braided < 0.01 && now - doneAt > 5000) return;   // settle and stop
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && root.classList.contains('live')) { last = performance.now(); raf = requestAnimationFrame(loop); } }

  function onMove(e) {
    if (holdId !== null && e.pointerId !== holdId) return;
    var n = e.timeStamp || performance.now();
    if (lmx >= 0 && n - lmt >= 8) { spd = Math.max(spd * 0.6, Math.abs(e.clientX - lmx) / ((n - lmt) / 1000)); lmx = e.clientX; lmt = n; }
    else if (lmx < 0) { lmx = e.clientX; lmt = n; }
    px = e.clientX;
    if (e.pointerType === 'mouse') { hov = Math.min(1, hov + 0.2); kick(); }
  }
  function down(e) { if (e.pointerType === 'touch') { if (!pts[e.pointerId]) npts++; pts[e.pointerId] = 1; } press(e); }
  function up(e) { if (pts[e.pointerId]) { delete pts[e.pointerId]; npts = Math.max(0, npts - 1); } release(e); }
  function inUi(e) { return e.target && e.target.closest && e.target.closest('a,button'); }
  function press(e) {
    if (holding && npts >= 2 && e.cancelable) e.preventDefault();
    if (!root.classList.contains('live') || inUi(e) || holding) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holdId = e.pointerId;
    try { document.body.setPointerCapture(e.pointerId); } catch (x) {}
    if (e.cancelable) e.preventDefault();
    px = e.clientX; if (cx < 0) cx = px;
    holding = true; holdStart = performance.now(); earned = false;
    kick();
  }
  function release(e) {
    if (!holding) return;
    if (e && e.pointerId !== undefined && holdId !== null && e.pointerId !== holdId) return;
    holding = false; holdId = null; pts = {}; npts = 0;
    if (finished) return;
    if (!earned) reachAt = performance.now();
    if (earned) {
      step++;
      setTimeout(hide, 900);
      if (step >= LINES.length) setTimeout(finish, 1200);
    }
  }

  var stopExtras = function () {};
  function toStatic() { stopExtras(); root.classList.remove('live', 'done'); if (raf) cancelAnimationFrame(raf); raf = 0; }

  function boot() {
    cv = document.getElementById('field'); ctx = cv && cv.getContext('2d', { alpha: false });
    if (!ctx) { root.classList.remove('live'); return; }
    say = document.getElementById('say'); face = document.getElementById('face'); stage = document.getElementById('stage');
    var src = document.querySelectorAll('#lines li');
    for (var i = 0; i < src.length; i++) { var c = src[i].cloneNode(true); var w = c.querySelector('.who'); if (w) w.parentNode.removeChild(w); LINES.push(c.textContent.trim()); }
    size();
    var rz = 0; window.addEventListener('resize', function () { if (rz) return; rz = requestAnimationFrame(function () { rz = 0; size(); kick(); }); });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', function () { lmx = -1; spd = 0; release(); });
    window.addEventListener('lostpointercapture', release);
    document.addEventListener('contextmenu', function (e) { if (root.classList.contains('live') && !inUi(e)) e.preventDefault(); });
    document.addEventListener('pointerleave', function () { hov = 0; lmx = -1; spd = 0; });
    var im = face.querySelector('img'); if (im) { im.loading = 'eager'; if (im.decode) im.decode().catch(function () {}); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) release(); else kick(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Tab' && !finished) toStatic(); });
    if (window.matchMedia) {
      var q1 = window.matchMedia('(prefers-reduced-motion: reduce)'), q2 = window.matchMedia('(min-height: 36em) and (min-width: 20em)');
      var chk = function () { if (q1.matches || !q2.matches) toStatic(); };
      if (q1.addEventListener) { q1.addEventListener('change', chk); q2.addEventListener('change', chk); }
    }
    var hour = function () { var h = new Date().getHours(); nightOn = h >= 1 && h < 5; night = nightOn ? 1 : 0; tscale = nightOn ? 0.72 : 1; };
    hour(); var hi = setInterval(hour, 60000);
    // while they're away, the tab keeps one small pink point breathing
    var fav = document.querySelector('link[rel="icon"]'), home = fav && fav.getAttribute('href'), ft = 0, fb = 0;
    document.addEventListener('visibilitychange', function () {
      if (!fav || !home || !root.classList.contains('live')) return;
      if (document.hidden) { if (!ft) ft = setInterval(function () { fb ^= 1; fav.setAttribute('href', fb ? '/assets/away-b.svg' : '/assets/away-a.svg'); }, 1150); }
      else { clearInterval(ft); ft = 0; fav.setAttribute('href', home); }
    });
    stopExtras = function () { clearInterval(hi); clearInterval(ft); ft = 0; if (fav && home) fav.setAttribute('href', home); };
    root.classList.add('booted');
    kick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
