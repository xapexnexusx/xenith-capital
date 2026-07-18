/* ============================================================================
   XENITH CAPITAL — assets/games.js  (v4, Lane 4: the four stage games)
   Vanilla JS, zero dependencies, single strict IIFE, no globals. The only
   outward surface is `x:stage-passed` CustomEvents dispatched on document
   (detail: { n }) — stage.js owns pips, unlock, and the auto-advance.

   LV.01 ASSEMBLE (#alv-game)  — budget 100 across 4 sleeves under per-sleeve
     bounds. ±5 steppers with hold-to-repeat (400ms delay, 90ms tick). Live
     values, total, meter, per-sleeve violation tint, contextual verdict,
     COMMIT gated on full validity.
   LV.02 SIGNAL/NOISE (#qz-game) — 5-item deck, 4/5 to clear, else a 3-item
     retry deck needing 3/3, else the main deck reshuffles (no lockout here).
     220ms slide/fade card swap (instant under reduced motion), streak dots,
     per-answer verdict lines.
   LV.03 THE HOLD (#hold-game) — press-and-hold 8s (retry 6s) on #hold-btn,
     SVG ring (r=70, 2πr ≈ 439.8) driven by rAF off performance.now(). Early
     release = impulse; 2 attempts; double fail = 10s lockout (pauses on
     hidden tabs) then back to 2 attempts. OS interruptions (pointercancel,
     window blur, hidden tab) break the hold WITHOUT burning an attempt.
   LV.04 JUDGMENT (#jg-game) — 2 scenarios, accept/verify/reject, one retry
     per scenario with the why-line shown; burning the retry resets the desk.

   CSS HOOKS THIS FILE OWNS (Lane 1 styles them; sizes/touch targets ≥44px
   are all CSS-side):
     #alv-game.is-valid .is-over .is-accepted
     .alv-sleeve.is-violation .is-denied        #alv-meter.is-valid
     #alv-verdict.is-good .is-bad
     #qz-game.is-retry .is-cleared              #qz-card.is-swap-out
     .qz-dot.is-hit .is-miss .is-spare          #qz-verdict.is-good .is-bad
     #hold-game.is-holding .is-locked .is-cleared   #hold-btn.is-holding
     #hold-status.is-good .is-bad
     #jg-game.is-cleared  .jg-choice.is-correct .is-wrong
     #jg-verdict.is-good .is-bad

   SPEC NOTE (ASSEMBLE): the brief clamps each sleeve 0–100 and lists
   "total may not exceed 100" among the stepper mechanics, but also ships the
   verdict line "over budget. cut something." A hard total clamp would make
   that line unreachable, so the total is treated as a RULE, not a clamp:
   overshoot is possible, flagged (game.is-over + verdict), and never valid —
   the player cuts back with the − steppers. Every assigned verdict line
   stays reachable.

   Timing hygiene: hold-to-repeat disarms on hidden tabs; the HOLD ring is
   rAF-driven (auto-pauses hidden) and interrupted cleanly; the 10s lockout
   runs on a pausable timer that freezes while the tab is hidden. Reduced
   motion: quiz card swaps go instant; HOLD is input-timed and unaffected.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ shared bits ---------------------------- */

  var reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  function reduced() {
    return !!(reduceMotionMQ && reduceMotionMQ.matches);
  }

  function nowMs() {
    return window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
  }

  function dispatchPass(n) {
    document.dispatchEvent(new CustomEvent('x:stage-passed', { detail: { n: n } }));
  }

  function setLine(el, text, tone) {
    el.classList.remove('is-good', 'is-bad');
    if (tone) el.classList.add(tone);
    el.textContent = text;
  }

  /* Pausable timeout registry: pending callbacks freeze while the tab is
     hidden and resume with their remaining time on return (10s HOLD lockout
     must not tick down in a background tab). */
  var pendingTimers = [];

  function armTimer(h) {
    h.armed = true;
    h.started = nowMs();
    h.id = window.setTimeout(function () {
      h.armed = false;
      dropTimer(h);
      h.fn();
    }, h.remaining);
  }

  function dropTimer(h) {
    var i = pendingTimers.indexOf(h);
    if (i !== -1) pendingTimers.splice(i, 1);
  }

  function pausable(fn, ms) {
    var h = { fn: fn, remaining: ms, started: 0, id: 0, armed: false };
    pendingTimers.push(h);
    armTimer(h);
    return {
      cancel: function () {
        if (h.armed) window.clearTimeout(h.id);
        h.armed = false;
        dropTimer(h);
      }
    };
  }

  document.addEventListener('visibilitychange', function () {
    var i, h;
    if (document.hidden) {
      for (i = 0; i < pendingTimers.length; i++) {
        h = pendingTimers[i];
        if (!h.armed) continue;
        window.clearTimeout(h.id);
        h.armed = false;
        h.remaining = Math.max(0, h.remaining - (nowMs() - h.started));
      }
    } else {
      var copy = pendingTimers.slice(); // callbacks may register new timers
      for (i = 0; i < copy.length; i++) {
        if (!copy[i].armed) armTimer(copy[i]);
      }
    }
  });

  /* ============================ LV.01 // ASSEMBLE ========================== */

  var ALV_STEP = 5;
  var ALV_REPEAT_DELAY_MS = 400; // hold this long before auto-repeat kicks in
  var ALV_REPEAT_TICK_MS = 90;   // repeat cadence while held
  var ALV_DENIED_MS = 250;       // .is-denied flash length at a clamp wall

  /* Bounds per sleeve + verdict line per breach. `over` lines exist only
     where the upper bound sits below the 100 per-sleeve clamp. */
  var ALV_SLEEVES = [
    { key: 'core',  min: 30, max: 60,
      under: 'core is under 30 — the engine is starved.',
      over:  'core is over 60 — concentration without ballast.' },
    { key: 'asym',  min: 10, max: 40,
      under: 'asym is under 10 — no convexity in the book.',
      over:  'asym is over 40 — the satellites outweigh the core.' },
    { key: 'cash',  min: 10, max: 100,
      under: 'cash is under 10 — no dry powder.' },
    { key: 'hedge', min: 5,  max: 100,
      under: 'hedge is under 5 — the book is naked.' }
  ];

  function initAssemble() {
    var game = document.getElementById('alv-game');
    if (!game) return;
    var totalEl = document.getElementById('alv-total');
    var meter = document.getElementById('alv-meter');
    var meterFill = document.getElementById('alv-meter-fill');
    var verdict = document.getElementById('alv-verdict');
    var commit = document.getElementById('alv-commit');
    if (!totalEl || !meter || !meterFill || !verdict || !commit) return;

    var rows = {};
    for (var i = 0; i < ALV_SLEEVES.length; i++) {
      var row = game.querySelector('.alv-sleeve[data-sleeve="' + ALV_SLEEVES[i].key + '"]');
      if (!row) return;
      rows[ALV_SLEEVES[i].key] = {
        row: row,
        val: row.querySelector('.alv-val'),
        minus: row.querySelector('.alv-minus'),
        plus: row.querySelector('.alv-plus')
      };
    }

    verdict.setAttribute('aria-live', 'polite');

    var state = { core: 0, asym: 0, cash: 0, hedge: 0 };
    var passed = false;
    var deniedTimer = null;
    var repeatDelay = null;
    var repeatTick = null;

    function total() {
      return state.core + state.asym + state.cash + state.hedge;
    }

    function violationOf(key) {
      for (var i = 0; i < ALV_SLEEVES.length; i++) {
        if (ALV_SLEEVES[i].key !== key) continue;
        var v = state[key];
        if (v < ALV_SLEEVES[i].min) return 'under';
        if (v > ALV_SLEEVES[i].max) return 'over';
        return null;
      }
      return null;
    }

    function firstViolationLine() {
      for (var i = 0; i < ALV_SLEEVES.length; i++) {
        var s = ALV_SLEEVES[i];
        var kind = violationOf(s.key);
        if (kind === 'under') return s.under;
        if (kind === 'over' && s.over) return s.over;
      }
      return null;
    }

    function isValid() {
      return total() === 100 && firstViolationLine() === null;
    }

    function render() {
      var t = total();
      for (var i = 0; i < ALV_SLEEVES.length; i++) {
        var key = ALV_SLEEVES[i].key;
        rows[key].val.textContent = String(state[key]);
        rows[key].row.classList.toggle('is-violation', violationOf(key) !== null);
      }
      totalEl.textContent = t + ' / 100';
      meterFill.style.width = Math.min(t, 100) + '%';

      var valid = isValid();
      meter.classList.toggle('is-valid', valid);   // cyan when coherent, amber else
      game.classList.toggle('is-valid', valid);
      game.classList.toggle('is-over', t > 100);
      commit.disabled = !valid || passed;

      if (passed) return; // the accepted line owns the verdict from here

      if (t === 0) {
        setLine(verdict, 'the budget is empty. allocate.', null);
      } else if (t > 100) {
        setLine(verdict, 'over budget. cut something.', 'is-bad');
      } else if (t < 100) {
        setLine(verdict, (100 - t) + ' remaining.', null);
      } else {
        var line = firstViolationLine();
        if (line) setLine(verdict, line, 'is-bad');
        else setLine(verdict, 'allocation coherent. commit it.', 'is-good');
      }
    }

    function flashDenied(row) {
      row.classList.add('is-denied');
      if (deniedTimer !== null) window.clearTimeout(deniedTimer);
      deniedTimer = window.setTimeout(function () {
        deniedTimer = null;
        for (var i = 0; i < ALV_SLEEVES.length; i++) {
          rows[ALV_SLEEVES[i].key].row.classList.remove('is-denied');
        }
      }, ALV_DENIED_MS);
    }

    function step(key, dir) {
      if (passed) return;
      var next = state[key] + dir * ALV_STEP;
      if (next < 0) next = 0;
      if (next > 100) next = 100;
      if (next === state[key]) { // clamp wall: nudge the row, change nothing
        flashDenied(rows[key].row);
        return;
      }
      state[key] = next;
      render();
    }

    function disarmRepeat() {
      if (repeatDelay !== null) { window.clearTimeout(repeatDelay); repeatDelay = null; }
      if (repeatTick !== null) { window.clearInterval(repeatTick); repeatTick = null; }
    }

    function wireStepper(btn, key, dir) {
      if (!btn) return;
      /* Press steps immediately on pointerdown (long-press friendly); holding
         past 400ms auto-repeats every 90ms until release/leave/cancel. */
      btn.addEventListener('pointerdown', function (e) {
        if (passed || btn.disabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return; // primary only
        step(key, dir);
        disarmRepeat();
        repeatDelay = window.setTimeout(function () {
          repeatDelay = null;
          repeatTick = window.setInterval(function () { step(key, dir); }, ALV_REPEAT_TICK_MS);
        }, ALV_REPEAT_DELAY_MS);
      });
      btn.addEventListener('pointerup', disarmRepeat);
      btn.addEventListener('pointercancel', disarmRepeat);
      btn.addEventListener('pointerleave', disarmRepeat);
      /* Keyboard activation (Enter/Space) fires click with detail 0 — step
         there. Pointer clicks (detail ≥ 1) already stepped on pointerdown. */
      btn.addEventListener('click', function (e) {
        if (e.detail !== 0) return;
        step(key, dir);
      });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    for (var j = 0; j < ALV_SLEEVES.length; j++) {
      var k = ALV_SLEEVES[j].key;
      wireStepper(rows[k].minus, k, -1);
      wireStepper(rows[k].plus, k, +1);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) disarmRepeat();
    });

    commit.addEventListener('click', function () {
      if (passed || commit.disabled || !isValid()) return;
      passed = true;
      disarmRepeat();
      commit.disabled = true;
      for (var i = 0; i < ALV_SLEEVES.length; i++) {
        if (rows[ALV_SLEEVES[i].key].minus) rows[ALV_SLEEVES[i].key].minus.disabled = true;
        if (rows[ALV_SLEEVES[i].key].plus) rows[ALV_SLEEVES[i].key].plus.disabled = true;
      }
      game.classList.add('is-accepted');
      setLine(verdict, 'ALLOCATION ACCEPTED. the system approves.', 'is-good');
      dispatchPass(1);
    });

    render();
  }

  /* ========================= LV.02 // SIGNAL OR NOISE ====================== */

  var QZ_SWAP_MS = 220; // card slide/fade, out then in

  var QZ_DECK = [
    { t: 'A CEO posts a rocket emoji after earnings.', a: 'n' },
    { t: 'Third consecutive quarter of declining free cash flow in the 10-K.', a: 's' },
    { t: 'A viral thread promises 40% guaranteed.', a: 'n' },
    { t: 'Cluster of insider buys at a 52-week low.', a: 's' },
    { t: 'Your gym group chat is all-in on one ticker.', a: 'n' }
  ];

  var QZ_RETRY = [
    { t: 'Management raises guidance and funds it with buybacks.', a: 's' },
    { t: "'This time it's different.' — prime-time segment.", a: 'n' },
    { t: 'Receivables growing 3x revenue, buried in note 14.', a: 's' }
  ];

  function initQuiz() {
    var game = document.getElementById('qz-game');
    if (!game) return;
    var card = document.getElementById('qz-card');
    var itemEl = card ? card.querySelector('.qz-item') : null;
    var progress = document.getElementById('qz-progress');
    var streak = document.getElementById('qz-streak');
    var verdict = document.getElementById('qz-verdict');
    var btnSignal = document.getElementById('qz-signal');
    var btnNoise = document.getElementById('qz-noise');
    if (!itemEl || !progress || !streak || !verdict || !btnSignal || !btnNoise) return;

    var dots = progress.querySelectorAll('.qz-dot');
    verdict.setAttribute('aria-live', 'polite');

    var deck = QZ_DECK;
    var retryMode = false;
    var index = 0;
    var score = 0;
    var busy = false; // true during the 220ms swap: input is ignored
    var passed = false;
    var swapTimer = null;

    function renderStreak() {
      streak.textContent = 'STREAK ' + score + ' · NEED ' + (retryMode ? '3/3' : '4/5');
    }

    function resetDots() {
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.remove('is-hit', 'is-miss');
        dots[i].classList.toggle('is-spare', i >= deck.length); // retry trims to 3
      }
    }

    function showCard() {
      itemEl.textContent = deck[index].t;
    }

    function advanceCard() {
      if (reduced()) { showCard(); return; } // reduced motion: instant swap
      busy = true;
      card.classList.add('is-swap-out');
      swapTimer = window.setTimeout(function () {
        swapTimer = null;
        showCard();
        card.classList.remove('is-swap-out'); // CSS transitions it back in
        busy = false;
      }, QZ_SWAP_MS);
    }

    function pass() {
      passed = true;
      busy = false;
      btnSignal.disabled = true;
      btnNoise.disabled = true;
      game.classList.add('is-cleared');
      setLine(verdict, 'RESEARCH ENGINE CLEARED.', 'is-good');
      dispatchPass(2);
    }

    function armRetry() {
      retryMode = true;
      deck = QZ_RETRY;
      index = 0;
      score = 0;
      game.classList.add('is-retry');
      resetDots();
      renderStreak();
      setLine(verdict, 'below threshold — retry deck armed: 3/3, last chance.', 'is-bad');
      advanceCard();
    }

    function reshuffle() {
      retryMode = false;
      deck = QZ_DECK;
      index = 0;
      score = 0;
      game.classList.remove('is-retry');
      resetDots();
      renderStreak();
      setLine(verdict, 'threshold missed. the deck reshuffles — run it again.', 'is-bad');
      advanceCard();
    }

    function finishDeck() {
      if (!retryMode) {
        if (score >= 4) pass(); else armRetry();
      } else {
        if (score >= 3) pass(); else reshuffle();
      }
    }

    function answer(choice) {
      if (passed || busy) return;
      var item = deck[index];
      var right = choice === item.a;
      if (right) score += 1;
      if (dots[index]) dots[index].classList.add(right ? 'is-hit' : 'is-miss');
      renderStreak();
      setLine(
        verdict,
        right ? 'correct — narrative is not sizing input.'
              : (item.a === 's' ? 'wrong — that was signal.' : 'wrong — that was noise.'),
        right ? 'is-good' : 'is-bad'
      );
      index += 1;
      if (index < deck.length) advanceCard();
      else finishDeck();
    }

    btnSignal.addEventListener('click', function () { answer('s'); });
    btnNoise.addEventListener('click', function () { answer('n'); });

    resetDots();
    renderStreak();
    showCard(); // replaces the 'press start.' placeholder with item one
  }

  /* ============================ LV.03 // THE HOLD ========================== */

  var HOLD_FULL_MS = 8000;   // attempt one
  var HOLD_RETRY_MS = 6000;  // attempt two
  var HOLD_LOCK_MS = 10000;  // lockout after a double fail
  var HOLD_CIRC = 2 * Math.PI * 70; // r=70 ring ≈ 439.8

  function initHold() {
    var game = document.getElementById('hold-game');
    if (!game) return;
    var btn = document.getElementById('hold-btn');
    var fill = document.getElementById('hold-fill');
    var status = document.getElementById('hold-status');
    var attemptsEl = document.getElementById('hold-attempts');
    if (!btn || !fill || !status || !attemptsEl) return;

    status.setAttribute('aria-live', 'polite');
    fill.setAttribute('stroke-dasharray', HOLD_CIRC.toFixed(1));

    var attemptsLeft = 2;
    var holding = false;
    var passed = false;
    var locked = false;
    var source = null; // 'pointer' | 'key'
    var rafId = null;
    var startTs = 0;
    var duration = HOLD_FULL_MS;

    function renderAttempts() {
      attemptsEl.textContent = 'ATTEMPTS: ' + attemptsLeft;
    }

    function setProgress(p) {
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      fill.setAttribute('stroke-dashoffset', (HOLD_CIRC * (1 - p)).toFixed(1));
    }

    function cancelRaf() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function holdVisualsOff() {
      game.classList.remove('is-holding');
      btn.classList.remove('is-holding');
    }

    function tick() {
      if (!holding) { rafId = null; return; }
      var p = (nowMs() - startTs) / duration;
      if (p >= 1) { rafId = null; succeed(); return; }
      setProgress(p);
      rafId = window.requestAnimationFrame(tick);
    }

    function startHold(src) {
      if (holding || passed || locked || btn.disabled) return;
      holding = true;
      source = src;
      duration = attemptsLeft === 2 ? HOLD_FULL_MS : HOLD_RETRY_MS;
      startTs = nowMs();
      setProgress(0);
      game.classList.add('is-holding');
      btn.classList.add('is-holding');
      setLine(status, 'holding… do not release.', null);
      cancelRaf();
      rafId = window.requestAnimationFrame(tick);
    }

    function succeed() {
      holding = false;
      source = null;
      cancelRaf();
      setProgress(1);
      holdVisualsOff();
      passed = true;
      game.classList.add('is-cleared');
      setLine(status, 'DISCIPLINE CONFIRMED — you won by not playing.', 'is-good');
      dispatchPass(3);
    }

    /* Early release: the player chose to let go — burns an attempt. */
    function impulse() {
      if (!holding) return;
      holding = false;
      source = null;
      cancelRaf();
      setProgress(0);
      holdVisualsOff();
      attemptsLeft -= 1;
      renderAttempts();
      if (attemptsLeft > 0) {
        setLine(status, 'impulse detected. again.', 'is-bad');
      } else {
        lockout();
      }
    }

    /* OS-level interruption (pointer cancel, window blur, hidden tab): the
       player never chose to release — no attempt burned, ring resets. */
    function interrupt() {
      if (!holding) return;
      holding = false;
      source = null;
      cancelRaf();
      setProgress(0);
      holdVisualsOff();
      setLine(status, 'press and hold.', null);
    }

    function lockout() {
      locked = true;
      btn.disabled = true;
      game.classList.add('is-locked');
      setLine(status, 'protocol locks this level for 10s — breathe.', 'is-bad');
      pausable(function () {
        locked = false;
        attemptsLeft = 2;
        renderAttempts();
        btn.disabled = false;
        game.classList.remove('is-locked');
        setLine(status, 'press and hold.', null);
      }, HOLD_LOCK_MS);
    }

    btn.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return; // primary only
      startHold('pointer');
    });
    btn.addEventListener('pointerup', function () {
      if (holding && source === 'pointer') impulse();
    });
    btn.addEventListener('pointerleave', function () {
      if (holding && source === 'pointer') impulse();
    });
    btn.addEventListener('pointercancel', interrupt);
    /* Mouse path: releasing anywhere off the button still ends the hold
       (touch holds implicit capture, so touch pointerup reaches the button). */
    window.addEventListener('pointerup', function () {
      if (holding && source === 'pointer') impulse();
    });
    window.addEventListener('blur', interrupt);

    /* Keyboard hold: Space/Enter down starts, up releases. Held keys auto-
       repeat keydown — e.repeat guards re-entry; default is suppressed so
       Space can't scroll and neither key emits a synthetic activation. */
    btn.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) startHold('key');
    });
    btn.addEventListener('keyup', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (holding && source === 'key') impulse();
    });
    btn.addEventListener('blur', interrupt); // focus lost mid key-hold

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) interrupt();
    });

    setProgress(0);
    renderAttempts();
  }

  /* =========================== LV.04 // JUDGMENT =========================== */

  var JG_ADVANCE_MS = 450; // beat to read the why-line before the next scenario

  var JG_SCENARIOS = [
    { t: '"Our model predicted the last three crashes."',
      win: 'verify',
      why: 'claims get verified, never worshipped.' },
    { t: '"This mandate guarantees twenty percent annually."',
      win: 'reject',
      why: 'guaranteed returns are narrative fiction.' }
  ];

  function initJudgment() {
    var game = document.getElementById('jg-game');
    if (!game) return;
    var scenarioEl = document.getElementById('jg-scenario');
    var verdict = document.getElementById('jg-verdict');
    var choices = game.querySelectorAll('.jg-choice');
    if (!scenarioEl || !verdict || choices.length === 0) return;

    verdict.setAttribute('aria-live', 'polite');

    var idx = 0;
    var retry = false;
    var busy = false; // true during the 450ms advance beat
    var passed = false;

    function clearMarks() {
      for (var i = 0; i < choices.length; i++) {
        choices[i].classList.remove('is-correct', 'is-wrong');
      }
    }

    function showScenario() {
      scenarioEl.textContent = JG_SCENARIOS[idx].t;
    }

    function pass() {
      passed = true;
      game.classList.add('is-cleared');
      for (var i = 0; i < choices.length; i++) choices[i].disabled = true;
      setLine(verdict, 'JUDGMENT CLEARED.', 'is-good');
      dispatchPass(4);
    }

    function choose(btn) {
      if (passed || busy) return;
      var sc = JG_SCENARIOS[idx];
      var choice = btn.getAttribute('data-choice');
      if (choice === sc.win) {
        if (idx === JG_SCENARIOS.length - 1) {
          clearMarks();
          btn.classList.add('is-correct');
          pass();
          return;
        }
        busy = true;
        clearMarks();
        btn.classList.add('is-correct');
        setLine(verdict, 'correct — ' + sc.why, 'is-good');
        window.setTimeout(function () {
          busy = false;
          idx += 1;
          retry = false;
          clearMarks();
          showScenario();
        }, JG_ADVANCE_MS);
        return;
      }
      clearMarks();
      btn.classList.add('is-wrong');
      if (!retry) {
        /* one retry: show the why, same scenario stays up for a second click */
        retry = true;
        setLine(verdict, 'wrong — ' + sc.why + ' one retry.', 'is-bad');
        return;
      }
      /* retry burned: the desk resets — both scenarios from the top */
      busy = true;
      setLine(verdict, 'wrong again — the desk resets. run it from the top.', 'is-bad');
      window.setTimeout(function () {
        busy = false;
        idx = 0;
        retry = false;
        clearMarks();
        showScenario();
      }, JG_ADVANCE_MS);
    }

    for (var i = 0; i < choices.length; i++) {
      choices[i].addEventListener('click', function () { choose(this); });
    }

    showScenario();
  }

  /* --------------------------------- boot -------------------------------- */

  function init() {
    initAssemble();
    initQuiz();
    initHold();
    initJudgment();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
