/* ===========================================================================
   XENITH CAPITAL — assets/sound.js (ui audio lane)

   Subtle interface audio, OFF BY DEFAULT. No audio files — every cue is a
   short Web Audio oscillator envelope, quiet by design (peak gain ≤ .07).
   The terminal 'sound' command is the only switch (a user gesture, which
   also satisfies the browser's autoplay policy for creating/resuming the
   AudioContext). Preference persists in localStorage 'xv_sound'.

   Public API (contract): window.XENITH_SOUND = { enabled(), set(on), toggle() }
   Listens (never owns state): x:field-selected, x:layer-selected,
   x:map-toggled, x:auth-granted, x:konami.
   =========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'xv_sound';
  var ctx = null;
  var on = false;

  function storageGet() {
    try { return window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null; }
    catch (e) { return null; }
  }

  function storageSet(v) {
    try { if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, v); }
    catch (e) { /* private mode: preference simply does not persist */ }
  }

  on = storageGet() === 'on';

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  /* One cue: oscillator with a fast attack and exponential decay. Optional
     frequency glide gives the "morph" cues their sweep. */
  function blip(freq, ms, type, gain, glideTo, delayMs) {
    if (!on) return;
    var c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) { return; } }
    try {
      var t0 = c.currentTime + (delayMs ? delayMs / 1000 : 0);
      var t1 = t0 + ms / 1000;
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t1);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(g).connect(c.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    } catch (e) { /* audio is decoration — never throws outward */ }
  }

  /* ------------------------------- cues ---------------------------------- */

  function cueField()   { blip(420, 140, 'triangle', 0.05, 640); }
  function cueLayer()   { blip(740, 60, 'sine', 0.03); }
  function cueMap(open) { blip(open ? 880 : 620, 45, 'square', 0.028); }
  function cueAuth() {
    blip(660, 130, 'sine', 0.06);
    blip(880, 130, 'sine', 0.06, null, 130);
    blip(1174, 210, 'sine', 0.065, null, 260);
  }
  function cueKonami()  { blip(220, 320, 'sawtooth', 0.045, 1320); }

  /* ------------------------------ wiring --------------------------------- */

  document.addEventListener('x:field-selected', cueField);
  document.addEventListener('x:layer-selected', cueLayer);
  document.addEventListener('x:map-toggled', function (e) {
    cueMap(!!(e && e.detail && e.detail.open));
  });
  document.addEventListener('x:auth-granted', cueAuth);
  document.addEventListener('x:konami', cueKonami);

  window.XENITH_SOUND = {
    enabled: function () { return on; },
    set: function (v) {
      on = !!v;
      storageSet(on ? 'on' : 'off');
      if (on) {
        ensureCtx();
        blip(880, 70, 'sine', 0.05); /* confirmation tick, proves the path */
      }
      return on;
    },
    toggle: function () { return window.XENITH_SOUND.set(!on); }
  };
})();
