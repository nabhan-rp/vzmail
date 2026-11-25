/// <reference lib="webworker" />

// VZ Mail (mail.vz.gay) & VZ Links (links.vz.gay) Multi-OS PWA Service Worker
const CACHE_NAME = 'vz-pwa-v1.2.0';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest-mail.webmanifest',
  '/manifest-links.webmanifest',
  '/favicon.svg',
  '/icons/mail-192.png',
  '/icons/mail-512.png',
  '/icons/mail-maskable.png',
  '/icons/apple-touch-icon-mail.png',
  '/icons/links-192.png',
  '/icons/links-512.png',
  '/icons/links-maskable.png',
  '/icons/apple-touch-icon-links.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(PRECACHE_ASSETS.map((asset) => cache.add(asset)))
      )
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Precache warning:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Only handle standard HTTP(S) GET requests
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1b. Never intercept Vite dev / HMR module paths
  if (
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // 2. PRIVACY GUARANTEE: Never cache ephemeral /api/* mail or link routes
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // 3. Never cache Auth0 authentication redirects or tokens
  if (url.hostname.includes('auth0') || url.hostname === 'accounts.vz.gay') {
    event.respondWith(fetch(req));
    return;
  }

  // 4. HTML Navigation requests: Network-First with offline cached SPA fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          return (
            fallback ||
            new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        })
    );
    return;
  }

  // 5. Static Assets (JS, CSS, Icons, Fonts, Manifests): Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.webmanifest') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes.status === 200) {
              const copy = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return networkRes;
          })
          .catch(
            () =>
              cached ||
              new Response('', {
                status: 504,
                statusText: 'Offline',
              })
          );

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 6. Default fallback
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).catch(
          () =>
            new Response('', {
              status: 504,
              statusText: 'Offline',
            })
        )
    )
  );
});
