self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => 
      Promise.all(cacheNames.map((cache) => caches.delete(cache)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // We explicitly do not try to serve anything from the cache 
  // to prevent stale bugs, while simply satisfying Chrome's "is a PWA" requirement.
  return; 
});

self.addEventListener('push', function (event) {
  const data = event.data?.json() ?? {};
  const title = data.title || "OxyOS Notification";
  const options = {
    body: data.body || "Current Activity Updated.",
    icon: data.icon || "/icon-192x192.png",
    badge: "/icon-192x192.png",
    data: data.url || "/dashboard",
    vibrate: [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data || '/dashboard';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
