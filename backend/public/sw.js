const CACHE_NAME = 'brobroli-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/client',
  '/admin',
  '/cockpit',
  '/badge',
  '/assets/logo.jpg',
  '/assets/hero.jpg',
  '/assets/cat-marche.jpg',
  '/assets/cat-menage.jpg',
  '/assets/cat-cuisine.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Notifications Push
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Brobroli', body: 'Nouvelle notification' };
  const options = {
    body: data.body || 'Mise à jour de votre course',
    icon: '/assets/logo.jpg',
    badge: '/assets/logo.jpg',
    vibrate: [300, 100, 300, 100, 500],
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Brobroli', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
