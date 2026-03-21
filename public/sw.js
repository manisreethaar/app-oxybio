// OxyOS Service Worker - App Shell Pattern
// Version: 4 - bumped to force update on all devices and fix Next.js chunk mismatches
const CACHE_NAME = 'oxyos-shell-v4';

// These are the ONLY files we cache - the minimal app shell.
// All data/API calls always go to the live network.
const SHELL_URLS = [
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.json',
];

// On install: cache the app shell immediately and activate
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// On activate: delete ALL old caches, then claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME) // keep only the current cache
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - For page navigations (HTML), serve from cache first, then network
// - For API calls and Supabase requests, ALWAYS go to network (never cache)
// - For static assets (_next/static), serve from cache if available
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER intercept Supabase, API routes, or auth requests - always live network
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack') ||
    event.request.method !== 'GET'
  ) {
    return; // let the browser handle it directly
  }

  // For page navigations: NETWORK FIRST, NO CACHE FALLBACK (prevents chunk 404s)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline completely, try to serve root if exists, but typically let browser handle offline
        return caches.match('/');
      })
    );
    return;
  }

  // For _next/static assets: cache-first (they are content-hashed, safe to cache forever)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
});

// Push Notification handler
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

// Notification click handler
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
