// OxyOS Service Worker - Safe Passthrough Mode
// Strategy: Zero caching for pages (fixes Next.js buffering). 
// Push notifications are still fully handled.
// Static icons ARE cached for fast loading.

const ICON_CACHE = 'oxyos-icons-v1';
const ICON_URLS = [
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install: cache only icons and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ICON_CACHE).then((cache) => cache.addAll(ICON_URLS))
  );
  self.skipWaiting();
});

// Activate: Delete ALL previous caches (kills old v3/v4 shell caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== ICON_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: 
// - Icons: serve from cache (fast loading)
// - EVERYTHING else: pure network, no caching (prevents chunk mismatches)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Serve cached icons
  if (
    url.pathname.endsWith('.png') &&
    (url.pathname.includes('icon') || url.pathname.includes('favicon'))
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Everything else: straight to network, no caching at all
  // This is the safest approach for Next.js with Vercel deployments
  return; // Let browser handle natively
});

// Push Notification handler - preserved fully
self.addEventListener('push', function (event) {
  const data = event.data?.json() ?? {};
  const title = data.title || 'OxyOS Notification';
  const options = {
    body: data.body || 'New update from OxyOS.',
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: data.url || '/dashboard',
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler - preserved fully
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
