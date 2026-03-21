// OxyOS Service Worker - UNINSTALLER
// This SW immediately unregisters itself and deletes all caches.
// Next.js handles its own chunk management, manual SWs cause infinite buffering.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Delete ALL caches
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    }).then(() => {
      // Unregister the service worker permanently
      self.registration.unregister();
    })
  );
});

// Pass all fetch requests directly to the network without intervention
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
