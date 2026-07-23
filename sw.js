/* ===========================================================================
   XENITH CAPITAL — sw.js (installability + offline shell)

   Strategy: NETWORK-FIRST for every same-origin GET, falling back to the
   cache only when the network fails. Deploys are therefore never masked by
   a stale worker cache; offline visitors get the last-seen console.
   =========================================================================== */
'use strict';

var VERSION = 'xenith-v1';
var CORE = [
  '/',
  '/assets/xenith.css',
  '/assets/fx.js',
  '/assets/boot.js',
  '/assets/main.js',
  '/assets/ui-fx.js',
  '/assets/terminal.js',
  '/assets/game.js',
  '/assets/drawer.js',
  '/assets/sound.js',
  '/assets/favicon.svg',
  '/assets/seal.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      /* best-effort shell prime — a single 404 must not block install */
      return Promise.all(CORE.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('/');
      });
    })
  );
});
