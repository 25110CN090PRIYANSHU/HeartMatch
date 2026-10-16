// HeartMatch PWA Service Worker (HeartMatch Max Edition)
const CACHE_NAME = 'heartmatch-max-v1';

const PRECACHE_ASSETS = [
  '/',
  '/discover.html',
  '/matches.html',
  '/profile.html',
  '/person.html',
  '/chat.html',
  '/settings.html',
  '/login.html',
  '/signup.html',
  '/offline.html',
  '/css/app.css',
  '/css/animated-ui.css',
  '/css/responsive.css',
  '/css/notification-badge.css',
  '/css/heartmatch-max.css',
  '/js/app.js',
  '/js/animated-ui.js',
  '/js/notification-badge.js',
  '/js/heartmatch-max.js',
  '/manifest.json',
  '/images/icons/icon-192.png',
  '/images/icons/icon-512.png',
  '/images/icons/icon.svg',
  '/images/icons/apple-touch-icon.png'
];

// Install: pre-cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('PWA Precache partial fail (some assets may be optional):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Strategy:
// - /api/ routes: Network first, never store in cache
// - Navigation requests (pages): Network first with offline.html fallback
// - Static assets (css, js, images): Cache first with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and Socket.IO polling / WebSocket
  if (request.method !== 'GET' || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // 1. API Requests -> Network-first (always live)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline', message: 'You are currently offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 2. Navigation Requests (HTML Pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, clone into cache
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          // Check if cached version exists
          const cached = await caches.match(request);
          if (cached) return cached;
          // Fallback to offline page
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // 3. Static Assets (CSS, JS, Fonts, Images) -> Stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => null);

      return cached || fetchPromise;
    })
  );
});

// ==========================================
// 4. WEB PUSH NOTIFICATIONS (LOCK SCREEN)
// ==========================================
self.addEventListener('push', (event) => {
  let data = {
    title: 'HeartMatch ❤️',
    body: 'You have a new notification!',
    icon: '/images/icons/icon-192.png',
    badge: '/images/icons/icon-192.png',
    url: '/discover.html'
  };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (_) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/images/icons/icon-192.png',
    badge: data.badge || '/images/icons/icon-192.png',
    vibrate: [120, 60, 120, 60, 200],
    data: {
      url: data.url || '/matches.html'
    },
    tag: data.tag || 'heartmatch-notification',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/discover.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
