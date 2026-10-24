// Time Studio PWA Service Worker · v1.0
const CACHE_NAME = 'timestudio-static-v102';
const STATIC_ASSETS = [
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('timestudio-static-') && key !== CACHE_NAME) {
        await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Security rule: NEVER cache /api, session tokens, or sensitive client data
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Handle navigation requests
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (response.ok && STATIC_ASSETS.some(a => url.pathname.endsWith(a.replace('./', '')))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
