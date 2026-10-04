/* Xenith Capital · IN PHASE
   Two lines of light. Cyan: fast, restless. Warm: slow, deliberate.
   Hold and they pull into phase; where they meet turns pink and a sentence forms.
   No network, no storage, no cookies. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('live')) return;

  var LINES = [];
  var cv, ctx, W = 0, H = 0, DPR = 1;
  var lock = 0;            // 0 = out of phase, 1 = locked
  var holding = false;
  var step = 0;            // which sentence is next
  var shown = -1;
  var t0 = performance.now();
  var arc, say, face, stage, dots, lbl, btn;
  var HOLD_MS = [1700, 1900, 2100, 2200, 2300, 2500];
  var holdStart = 0;
  var finished = false;
  var raf = 0;

  function el(id) { return document.getElementById(id); }

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* cheap deterministic noise for the machine's jitter */
  function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
  function vnoise(x) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); return hash(i) * (1 - f) + hash(i + 1) * f; }

  function machineY(x, t, amp, k) {
    var base = Math.sin(x * 0.012 * k + t * 1.7) * 0.45 + Math.sin(x * 0.031 + t * 3.1) * 0.25;
    var jit = (vnoise(x * 0.09 + t * 9) - 0.5) * 1.6 * (1 - lock) + (vnoise(x * 0.25 + t * 14) - 0.5) * 0.5 * (1 - lock * 0.9);
    return base * (0.35 + 0.65 * (1 - lock)) + jit;
  }
  function humanY(x, t) {
    return Math.sin(x * 0.0075 + t * 0.55) * 0.8 + Math.sin(x * 0.002 + t * 0.21) * 0.2;
  }

  function draw(now) {
    var t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    var mid = H * (finished ? 0.5 : 0.6);
    var amp = Math.min(H * 0.11, 90);
    var N = Math.ceil(W / 3) + 1;
    var m = new Array(N), h = new Array(N);
    for (var i = 0; i < N; i++) {
      var x = i * 3;
      var hy = humanY(x, t);
      var my = machineY(x, t, amp, 1 + lock);
      /* lock pulls the machine onto the human's path */
      var ym = my * (1 - lock) + hy * lock + (machineY(x, t, amp, 1) * 0.06) * lock;
      h[i] = mid + hy * amp;
      m[i] = mid + ym * amp;
    }

    /* static between them, fading as they lock */
    var stat = (1 - lock) * 0.5;
    if (stat > 0.02) {
      for (var s = 0; s < 220 * stat; s++) {
        var sx = Math.random() * W, si = Math.min(N - 1, Math.floor(sx / 3));
        var lo = Math.min(m[si], h[si]) - 6, hi = Math.max(m[si], h[si]) + 6;
        ctx.fillStyle = 'rgba(200,220,230,' + (Math.random() * 0.25 * stat).toFixed(3) + ')';
        ctx.fillRect(sx, lo + Math.random() * (hi - lo), 1.2, 1.2);
      }
    }

    function stroke(arr, color, width, blur) {
      ctx.beginPath();
      ctx.moveTo(0, arr[0]);
      for (var i = 1; i < N; i++) ctx.lineTo(i * 3, arr[i]);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = blur;
      ctx.stroke();
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    stroke(h, 'rgba(255,179,122,' + (0.85 - lock * 0.35) + ')', 2.2, 14);
    stroke(m, 'rgba(51,230,255,' + (0.85 - lock * 0.35) + ')', 1.4, 12);

    /* where they meet: pink */
    if (lock > 0.05) {
      ctx.beginPath();
      ctx.moveTo(0, (m[0] + h[0]) / 2);
      for (var j = 1; j < N; j++) ctx.lineTo(j * 3, (m[j] + h[j]) / 2);
      ctx.strokeStyle = 'rgba(255,61,154,' + Math.min(1, lock * 1.2) + ')';
      ctx.lineWidth = 1.5 + lock * 2.5; ctx.shadowColor = '#ff3d9a'; ctx.shadowBlur = 10 + lock * 28;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function showSentence(i) {
    if (i === shown) return;
    var prev = shown;
    shown = i;
    say.classList.remove('on');
    setTimeout(function () {
      say.textContent = LINES[i].text;
      say.classList.remove('intro');
      say.classList.toggle('pk', i === 2);
      var portrait = i === 4;
      stage.classList.toggle('portrait', portrait);
      face.classList.toggle('on', portrait);
      say.classList.add('on');
    }, 450);
    var ds = dots.children;
    for (var d = 0; d < ds.length; d++) ds[d].classList.toggle('on', d <= i);
  }

  function finish() {
    if (finished) return;
    finished = true;
    root.classList.add('done');
    if (document.activeElement === btn || document.activeElement === document.body) { var g = document.querySelector('#apply .go'); if (g) { try { g.focus({ preventScroll: true }); } catch (e) {} } }
    face.classList.remove('on'); stage.classList.remove('portrait');
    say.classList.remove('on');
    setTimeout(function () { say.textContent = 'In phase.'; say.classList.remove('pk'); say.classList.add('on'); }, 500);
  }

  function loop(now) {
    if (!root.classList.contains('live')) return;
    var target = holding ? 1 : (finished ? 1 : 0);
    if (holding) {
      var need = HOLD_MS[Math.min(step, HOLD_MS.length - 1)];
      var p = Math.min(1, (now - holdStart) / need);
      lock += (p - lock) * 0.12;
      arc.style.strokeDashoffset = String(132 * (1 - p));
      if (p >= 1 && step < LINES.length) {
        showSentence(step);
        step++;
        holdStart = now;
        if (step >= LINES.length) { release(); setTimeout(finish, 2600); }
      }
    } else {
      lock += (target - lock) * (finished ? 0.04 : 0.035);
      arc.style.strokeDashoffset = '132';
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function press(e) {
    if (finished) return;
    if (e && e.pointerType === 'mouse' && e.button !== 0) return;
    if (e && e.cancelable) e.preventDefault();
    holding = true; holdStart = performance.now();
    btn.classList.add('on'); lbl.textContent = 'Holding';
  }
  function release() {
    if (!holding) return;
    holding = false; btn.classList.remove('on'); lbl.textContent = 'Hold';
  }

  function readAll() {
    root.classList.remove('live', 'done');
    cancelAnimationFrame(raf);
    history.replaceState(null, '', '#read');
    var l = el('lines');
    if (l) { l.setAttribute('tabindex', '-1'); try { l.focus({ preventScroll: true }); } catch (e) {} l.scrollIntoView(); }
  }

  function boot() {
    cv = el('field'); ctx = cv && cv.getContext('2d');
    if (!ctx) { root.classList.remove('live'); return; }
    arc = el('arc'); say = el('say'); face = el('face'); stage = el('stage'); dots = el('dots'); lbl = el('lbl'); btn = el('hold');
    var src = document.querySelectorAll('#lines li');
    for (var i = 0; i < src.length; i++) {
      var c = src[i].cloneNode(true); var w = c.querySelector('.who'); if (w) w.parentNode.removeChild(w);
      LINES.push({ text: c.textContent.trim() });
    }
    say.textContent = '';
    var a1 = document.createTextNode('A machine and a person. Out of phase.');
    var sm = document.createElement('span'); sm.className = 'sm'; sm.textContent = 'Xenith Capital';
    say.appendChild(a1); say.appendChild(sm);
    say.classList.add('intro');
    setTimeout(function () { say.classList.add('on'); }, 300);
    size();
    window.addEventListener('resize', size);
    btn.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(e); });
    btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') release(); });
    btn.addEventListener('blur', release);
    el('all').addEventListener('click', readAll);
    var ap = document.querySelectorAll('a[href="#apply"]');
    for (var k = 0; k < ap.length; k++) ap[k].addEventListener('click', function (e) {
      if (finished) return; e.preventDefault(); readAll();
      var a = el('apply'); if (a) { a.scrollIntoView(); var g = a.querySelector('.go'); if (g) g.focus({ preventScroll: true }); }
    });
    if (window.matchMedia) {
      var q1 = window.matchMedia('(prefers-reduced-motion: reduce)'), q2 = window.matchMedia('(min-height: 36em) and (min-width: 20em)');
      var chk = function () { if (q1.matches || !q2.matches) readAll(); };
      if (q1.addEventListener) { q1.addEventListener('change', chk); q2.addEventListener('change', chk); }
    }
    root.classList.add('booted');
    document.addEventListener('visibilitychange', function () { if (document.hidden) release(); });
    raf = requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
