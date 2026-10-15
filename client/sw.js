// HeartMatch PWA Service Worker v1.0
const CACHE_NAME = 'heartmatch-pwa-v1';

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
  '/js/app.js',
  '/js/animated-ui.js',
  '/js/notification-badge.js',
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
