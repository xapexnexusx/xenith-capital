/* Xenith Capital · THE DUET · no third parties, no storage, no cookies */
(function () {
  'use strict';
  var root = document.documentElement;
  var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

  /* NYSE regular hours, 9:30–16:00 America/New_York, weekdays. Published schedule only; holidays not reflected. */
  function marketOpen() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      var o = {};
      for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
      if (o.weekday === 'Sat' || o.weekday === 'Sun') return false;
      var m = parseInt(o.hour, 10) * 60 + parseInt(o.minute, 10);
      return m >= 570 && m < 960;
    } catch (e) { return false; }
  }
  function paintMarket() {
    var open = marketOpen();
    root.classList.toggle('open', open);
    var st = document.querySelector('#mkt .st');
    if (!st) return;
    st.textContent = '';
    var x = document.createElement('span');
    x.className = 'x';
    x.setAttribute('aria-hidden', 'true');
    x.textContent = 'NYSE · ';
    st.appendChild(x);
    st.appendChild(document.createTextNode(open ? 'OPEN' : 'CLOSED'));
  }

  /* the stamp shows the visitor's own clock: the argument is happening now */
  function paintStamp() {
    var s = document.querySelector('.stamp .g span');
    if (!s) return;
    var d = new Date();
    s.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function showAll() {
    var els = document.querySelectorAll('.thread li, .rise');
    for (var i = 0; i < els.length; i++) els[i].classList.add('in');
    root.classList.add('settled');
  }

  function playThread() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.thread li'));
    if (still) { showAll(); return; }
    var i = 0;
    function next() {
      if (i >= items.length) { setTimeout(function () { root.classList.add('settled'); }, 5000); return; }
      var li = items[i++];
      li.classList.add('in');
      var tx = li.querySelector('.tx');
      if (tx) {
        /* the real text stays in place for assistive technology; a visual copy types over it */
        var full = tx.textContent;
        var tw = document.createElement('span');
        tw.className = 'tw';
        tw.setAttribute('aria-hidden', 'true');
        tx.parentNode.appendChild(tw);
        tx.classList.add('ghost');
        var k = 0;
        var step = function () {
          k += 2;
          tw.textContent = full.slice(0, k);
          if (k < full.length) { setTimeout(step, 14); }
          else { tx.classList.remove('ghost'); tw.parentNode.removeChild(tw); setTimeout(next, 520); }
        };
        step();
      } else {
        setTimeout(next, li.classList.contains('l') ? 900 : 400);
      }
    }
    setTimeout(next, 350);
  }

  function rise() {
    if (still || !('IntersectionObserver' in window)) return;
    var els = document.querySelectorAll('.reveal > *, section > .k, section > h2, .lede, .jobs li, .coda, .card, .portrait, .say > *, .threshold, .fit > *, .nos li, .custody, .q');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var t = e.target;
        t.classList.add('in');
        io.unobserve(t);
        t.addEventListener('transitionend', function () { t.classList.remove('rise'); t.style.transitionDelay = ''; }, { once: true });
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(els, function (el, n) {
      if (el.closest('.duet')) return;
      el.classList.add('rise');
      el.style.transitionDelay = ((n % 4) * 60) + 'ms';
      io.observe(el);
    });
  }

  function tick() { try { paintMarket(); paintStamp(); } catch (e) {} }

  function boot() {
    try { tick(); } catch (e) {}
    try { rise(); } catch (e) {}
    try { playThread(); } catch (e) { showAll(); }
    var d = new Date();
    setTimeout(function () { tick(); setInterval(tick, 60000); }, (60 - d.getSeconds()) * 1000 + 50);
  }

  if (still) root.classList.add('still');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
