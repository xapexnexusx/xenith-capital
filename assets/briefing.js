/* Xenith Capital · BRIEFING
   The scope: rings, a sweep, blips that light as the sweep passes.
   The block: six lines decrypt into view, one at a time. A press completes a line; a press between lines moves on.
   Six in, the scope locks and the channel opens: the question and the door.
   No network, no storage, no cookies.
/* 10·12·26 */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('live')) return;

  var cv, ctx, W = 0, H = 0, DPR = 1, raf = 0, last = 0, dt = 0.016;
  var t = 0, seed = Math.random() * 1000;
  var open = false, openAt = 0;
  var blips = [], sweep = 0;
  var CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789<>/\\|·—';

  function hash(n) { var x = Math.sin(n * 127.1 + seed) * 43758.5453; return x - Math.floor(x); }
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function lerp(a, b, p) { return a + (b - a) * p; }

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function initBlips() {
    blips = [];
    for (var i = 0; i < 9; i++) {
      blips.push({
        a0: hash(i * 7 + 1) * Math.PI * 2,      // resting angle
        a: 0,                                   // current angle
        r: 0.25 + 0.68 * hash(i * 13 + 2),      // ring fraction of scope R
        al: 0.35 + 0.4 * hash(i * 17 + 3),      // base alpha
        ph: hash(i * 19 + 4) * 6,               // drift phase
        fl: 0, cd: 0                            // flash + refractory
      });
    }
  }

  function scope(dt) {
    var cx = W / 2, cy = H * 0.5;
    var R = Math.min(W, H) * (W < 700 ? 0.4 : 0.33);
    // the scope
    ctx.save();
    ctx.lineWidth = 1;
    for (var i = 1; i <= 3; i++) {
      var rr = R * i / 3;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(51,230,255,' + (0.045 + 0.05 * (i / 3) + (open ? 0.06 : 0)).toFixed(3) + ')';
      ctx.stroke();
    }
    // crosshair
    ctx.strokeStyle = 'rgba(239,233,223,0.06)';
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    // bearing ticks
    ctx.strokeStyle = 'rgba(239,233,223,0.14)';
    for (var k = 0; k < 36; k++) {
      var ta = k * Math.PI / 18;
      var r1 = R, r2 = R - (k % 9 === 0 ? 9 : 4);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ta) * r1, cy + Math.sin(ta) * r1);
      ctx.lineTo(cx + Math.cos(ta) * r2, cy + Math.sin(ta) * r2);
      ctx.stroke();
    }
    // the sweep: a wedge of light trailing the beam
    var sp = open ? 1.5 : 0.55;
    sweep += (W < 700 ? 0.8 : 1) * sp * dt;
    if (sweep > Math.PI * 2) sweep -= Math.PI * 2;
    var trail = Math.PI * 0.5;
    for (var s = 24; s > 0; s--) {
      var a0 = sweep - trail * (s / 24) - trail / 24;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a0 + trail / 24);
      ctx.closePath();
      ctx.fillStyle = 'rgba(51,230,255,' + (0.055 * (1 - s / 24) * (1 - s / 24) * (open ? 1.6 : 1)).toFixed(4) + ')';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    ctx.strokeStyle = 'rgba(51,233,255,' + (open ? 0.5 : 0.3).toFixed(2) + ')';
    ctx.stroke();
    // blips: light as the sweep passes them; settle into a ring when the channel opens
    var lock = open ? ease(Math.min(1, (performance.now() - openAt) / 1400)) : 0;
    for (var b = 0; b < blips.length; b++) {
      var bl = blips[b];
      var drift = Math.sin(t * 0.11 + bl.ph) * 0.1;
      var ta2 = bl.a0 + drift;
      var ra = bl.r * R;
      // locked ring position: even spacing, mid ring
      var la = b / blips.length * Math.PI * 2 - Math.PI / 2;
      var la2 = lerp(ta2, la, lock);
      var lr = lerp(ra, R * 0.55, lock);
      var x = cx + Math.cos(la2) * lr, y = cy + Math.sin(la2) * lr;
      // flash when the beam crosses this blip (one-frame hit + refractory period)
      bl.fl = 0;
      if (bl.cd > 0) bl.cd--;
      else {
        var d = Math.abs(((sweep - la2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
        if (d < 0.14) { bl.fl = 1; bl.cd = 70; }
      }
      bl.a = la2;
      var a = bl.al * (0.35 + 0.25 * Math.sin(t * 2 + bl.ph)) + bl.fl * 0.55;
      ctx.beginPath(); ctx.arc(x, y, 2 + bl.fl * 2.5 + lock, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239,233,223,' + Math.min(1, a).toFixed(3) + ')'; ctx.fill();
      if (bl.fl > 0.25) {
        ctx.beginPath(); ctx.arc(x, y, 7 + bl.fl * 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239,233,223,' + (bl.fl * 0.3).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // the heart: center, pink, slow pulse
    var pulse = 0.5 + 0.5 * Math.sin(t * (open ? 1.6 : 0.9));
    var cr = (open ? 4 : 3) + pulse * 2;
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 5);
    cg.addColorStop(0, 'rgba(255,61,154,' + (0.5 + 0.3 * pulse).toFixed(3) + ')');
    cg.addColorStop(1, 'rgba(255,61,154,0)');
    ctx.fillStyle = cg; ctx.fillRect(cx - cr * 5, cy - cr * 5, cr * 10, cr * 10);
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,199,224,' + (0.75 + 0.25 * pulse).toFixed(3) + ')'; ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    raf = 0;
    dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, W, H);
    // vignette
    var v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    scope(dt);
    raf = requestAnimationFrame(frame);
  }

  /* ---------- the six lines ---------- */
  var blocks = [], step = 0, holdTimer = 0, started = false;
  var stn, holdring;

  function scramble(el, text, dur, done) {
    var n = text.length, t0 = performance.now(), id = 0;
    function fr(now) {
      if (id !== (scramble.cur || 0)) return;
      var p = Math.min(1, (now - t0) / dur);
      var settle = Math.floor(ease(p) * n), s = '';
      for (var i = 0; i < n; i++) {
        var c = text[i];
        s += (i < settle || c === ' ') ? c : CH[(Math.random() * CH.length) | 0];
      }
      el.textContent = s;
      if (p < 1) requestAnimationFrame(fr);
      else { el.textContent = text; done && done(); }
    }
    id = (scramble.cur = (scramble.cur || 0) + 1);
    requestAnimationFrame(fr);
  }

  function stamp() {
    if (!stn) return;
    var n = step < blocks.length ? step + 1 : 6;
    stn.textContent = (n < 10 ? '0' + n : '' + n) + '/06';
  }

  function startLine(i) {
    step = i;
    blocks.forEach(function (b) { b.classList.remove('on'); });
    var b = blocks[i];
    b.classList.add('on');
    var p = b.querySelector('p');
    scramble(p, p.getAttribute('data-text'), 1500 + i * 180, function () {
      stamp();
      holdTimer = setTimeout(next, 1050);
    });
  }

  function next() {
    clearTimeout(holdTimer); holdTimer = 0;
    if (step < blocks.length - 1) startLine(step + 1);
    else openChannel();
  }

  function engage() {
    if (open || !started) return;
    if (holdTimer) next();           // press: the line lands, the next begins
  }

  function openChannel() {
    open = true; openAt = performance.now();
    root.classList.add('open');
    if (stn) stn.textContent = 'OPEN';
    if (holdring) holdring.classList.add('gone');
  }

  /* ---------- clock ---------- */
  var clk;
  function tickClock() {
    if (!clk) return;
    try {
      var s = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' }).format(new Date());
      clk.textContent = s.replace(' ', ' · ');
    } catch (e) {}
  }

  function exit() {
    root.classList.remove('live', 'open');
    if (raf) cancelAnimationFrame(raf); raf = 0;
  }

  function boot() {
    cv = document.getElementById('field'); ctx = cv && cv.getContext('2d', { alpha: false });
    if (!ctx) return;
    stn = document.getElementById('stn');
    holdring = document.getElementById('holdring');
    clk = document.getElementById('clk');
    blocks = Array.prototype.slice.call(document.querySelectorAll('#blocks .block'));
    size(); initBlips();
    tickClock(); setInterval(tickClock, 1000);

    window.addEventListener('resize', function () { size(); });
    window.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('a,button')) return;
      if (holdring && holdring.classList.contains('gone')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (holdring) holdring.classList.add('holding');
      engage();
    });
    window.addEventListener('pointerup', function () { if (holdring) holdring.classList.remove('holding'); });
    window.addEventListener('pointercancel', function () { if (holdring) holdring.classList.remove('holding'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') exit();
      var onCtl = e.target instanceof Element && e.target.closest && e.target.closest('a,button,[contenteditable]');
      if ((e.key === 'Enter' || e.key === ' ') && !open && !onCtl) { e.preventDefault(); engage(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (root.classList.contains('live') && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    var endb = document.getElementById('endbtn');
    if (endb) endb.addEventListener('click', function (e) { e.preventDefault(); exit(); });
    if (holdring) holdring.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      holdring.classList.add('holding');
      engage();
    });

    root.classList.add('booted');
    last = performance.now(); raf = requestAnimationFrame(frame);
    // first line after the scope has had a moment to be seen
    started = true;
    setTimeout(function () { startLine(0); }, 1100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
