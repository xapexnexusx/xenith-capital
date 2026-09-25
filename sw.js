/* Xenith Capital: retires the service worker installed by the 2026-07-23 site.
   That worker cached pages for offline use. This one deletes those caches and unregisters itself.
   The current site registers no service worker. */
'use strict';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
  );
});
