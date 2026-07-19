/* XENITH v5 — disclosures drawer mechanics (lane 7, edge surfaces)
   Self-contained IIFE. Zero globals. No dependencies.
   Opens/closes #x-disc, traps focus, veils background siblings,
   locks body scroll. #x-disc-open sits in the page footer; the drawer
   floats above the dossier via the existing #x-disc z-layer contract in
   xenith.css (no JS z-index work here).
   All motion-deferred steps are instant under prefers-reduced-motion. */
(function () {
  'use strict';

  var TRANSITION_MS = 450; // must match .x-disc-panel transition in xenith.css
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function init() {
    var disc = document.getElementById('x-disc');
    var openBtn = document.getElementById('x-disc-open');
    var closeBtn = document.getElementById('x-disc-close');
    if (!disc || !openBtn || !closeBtn) return;

    var panel = disc.querySelector('.x-disc-panel');
    if (!panel) return;

    // Background siblings veiled with aria-hidden while the dialog is open.
    // v5 body children: #x-boot, canvas#fx-bg, .x-scanlines, .x-watermark,
    // header#x-topbar, aside#x-rail, main#x-main, footer#x-footer (holds
    // #x-disc-open), #x-disc, noscript.
    // #x-boot/canvas/scanlines are decorative and already aria-hidden in
    // markup; #x-rail and .x-watermark arrive aria-hidden as well, so each
    // node's pre-open state is captured and restored rather than assumed.
    // Missing nodes are skipped silently by setLandmarksHidden.
    var landmarks = [
      document.getElementById('x-topbar'),
      document.getElementById('x-rail'),
      document.querySelector('.x-watermark'),
      document.getElementById('x-main'),
      document.getElementById('x-disc-open')
    ];
    var landmarkWasHidden = [];

    // Live media query — evaluated at close time so an OS-level toggle
    // mid-session is honored.
    var reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

    var isOpen = false;
    var closeTimer = null;
    var panelEndHandler = null;

    function setLandmarksHidden(hide) {
      for (var i = 0; i < landmarks.length; i++) {
        var el = landmarks[i];
        if (!el) continue;
        if (hide) {
          // Capture pre-open state so decorative nodes that carry
          // aria-hidden in markup (#x-rail, .x-watermark) restore to
          // hidden — never to an exposed state they never had.
          landmarkWasHidden[i] = el.hasAttribute('aria-hidden');
          el.setAttribute('aria-hidden', 'true');
        } else if (landmarkWasHidden[i]) {
          el.setAttribute('aria-hidden', 'true');
        } else {
          // These elements carry no aria-hidden in markup; removal is the restore.
          el.removeAttribute('aria-hidden');
        }
      }
    }

    function cancelPendingClose() {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (panelEndHandler) {
        panel.removeEventListener('transitionend', panelEndHandler);
        panelEndHandler = null;
      }
    }

    function finishClose() {
      if (isOpen) return; // reopened mid-close — stay open
      disc.setAttribute('hidden', '');
    }

    function visibleFocusable() {
      var nodes = disc.querySelectorAll(FOCUSABLE);
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.disabled) continue;
        if (el.getClientRects().length === 0) continue; // display:none or hidden ancestor
        out.push(el);
      }
      return out;
    }

    function openDisc() {
      if (isOpen) return;
      isOpen = true;
      cancelPendingClose(); // a rapid re-open must not inherit a stale hide timer

      disc.removeAttribute('hidden');
      // Force synchronous layout so .is-open transitions from the hidden state.
      void panel.offsetWidth;
      disc.classList.add('is-open');
      document.body.classList.add('x-disc-lock');
      setLandmarksHidden(true);
      openBtn.setAttribute('aria-expanded', 'true');
      closeBtn.focus();
    }

    function closeDisc() {
      if (!isOpen) return;
      isOpen = false;

      disc.classList.remove('is-open');
      document.body.classList.remove('x-disc-lock');
      setLandmarksHidden(false);
      openBtn.setAttribute('aria-expanded', 'false');
      openBtn.focus();

      if (reduceMotion.matches) {
        finishClose(); // instant — no transition to wait for
        return;
      }

      // Re-add hidden after the panel transition, with a timeout fallback in
      // case transitionend never fires (e.g. tab throttling, style change).
      var settled = false;
      var settle = function () {
        if (settled) return;
        settled = true;
        cancelPendingClose();
        finishClose();
      };
      panelEndHandler = function (e) {
        if (e.target === panel) settle();
      };
      panel.addEventListener('transitionend', panelEndHandler);
      closeTimer = setTimeout(settle, TRANSITION_MS + 60);
    }

    function onKeydown(e) {
      if (!isOpen) return;

      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        closeDisc();
        return;
      }

      if (e.key !== 'Tab') return;

      // Focus trap: cycle visible focusables inside #x-disc
      // (close button + doc links). Shift+Tab walks backwards.
      var items = visibleFocusable();
      if (!items.length) {
        e.preventDefault();
        return;
      }
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;
      var outside = !disc.contains(active);

      if (e.shiftKey) {
        if (outside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (outside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    openBtn.addEventListener('click', openDisc);
    closeBtn.addEventListener('click', closeDisc);
    // Backdrop click: #x-disc is the fixed inset layer; the panel sits inside it.
    disc.addEventListener('click', function (e) {
      if (e.target === disc) closeDisc();
    });
    document.addEventListener('keydown', onKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
