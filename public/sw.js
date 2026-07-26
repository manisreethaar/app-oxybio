// OxyOS Service Worker
// Handles push notifications natively — works even when app is closed or user is logged out.

const ICON_CACHE = 'oxyos-icons-v3';
const ICON_URLS = [
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ── Install: cache icons and activate immediately ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ICON_CACHE).then((cache) => cache.addAll(ICON_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== ICON_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: serve icons from cache, everything else from network ───────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.pathname.endsWith('.png') &&
    (url.pathname.includes('icon') || url.pathname.includes('favicon'))
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() =>
      new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );
});

// ── Push Notification Handler ──────────────────────────────────────────────
// This fires even when the app is CLOSED or the user is NOT logged in.
// The browser keeps the service worker alive to handle incoming pushes.
self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'OxyOS', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'OxyOS';
  const options = {
    body: data.body || 'You have a new update.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    image: data.image || undefined,
    vibrate: [200, 100, 200],
    tag: data.tag || 'oxyos-notification',      // replaces older notification with same tag
    renotify: true,                              // vibrate/alert even if same tag
    requireInteraction: false,                   // auto-dismiss after a few seconds on desktop
    silent: false,
    data: {
      url: data.url || '/dashboard',
      timestamp: Date.now(),
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click Handler ─────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // Handle action buttons
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, navigate and focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Push Subscription Change ───────────────────────────────────────────────
// Fired when browser auto-rotates the push subscription (rare but important)
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription
        ? event.oldSubscription.options.applicationServerKey
        : null,
    }).then((newSubscription) => {
      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: newSubscription }),
        credentials: 'include',
      });
    })
  );
});
