// Time Studio PWA Service Worker — v20261030-final3
const CACHE_NAME = 'timestudio-static-v20261030_v21';
const STATIC_ASSETS = [
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(err => {
      console.warn('SW Precache error:', err);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Security rule: NEVER cache /api, session tokens, or sensitive client data
  if (req.method !== 'GET' || url.pathname.includes('/api/')) {
    return;
  }

  // Network-First for HTML and JS to guarantee instant updates without stale cache
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.search.includes('v=')) {
    event.respondWith(
      fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(req).then(cached => cached || caches.match('./index.html'));
      })
    );
    return;
  }

  // Cache-First with Network fallback for static media/icons
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        }
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
