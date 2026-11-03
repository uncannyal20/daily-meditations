/**
 * Devotio Diurna Service Worker
 * Enables PWA installability and offline prayer reading
 */

const CACHE_NAME = 'devotio-diurna-v17';
const ASSETS_TO_CACHE = [
  './',
  './styles.css?v=17',
  './app.js?v=17',
  './assets/vendor/pocketbase.umd.js',
  './manifest.json?v=2',
  './data/meditations.json',
  './assets/icons/icon-192.png?v=2',
  './assets/icons/icon-512.png?v=2',
  './assets/icons/apple-touch-icon.png?v=2',
  './assets/icons/favicon-32.png?v=2',
  './assets/icons/favicon.svg?v=2',
  './assets/audio/bell.mp3',
  './assets/audio/bell.wav'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Some assets could not be pre-cached:', err);
      });
    })
  );
  self.skipWaiting();
});

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
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept writes, the PocketBase API/admin, or the OAuth return URL.
  if (req.method !== 'GET') return;
  if (url.origin === self.location.origin &&
      (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_/'))) return;
  if (url.searchParams.has('code') || url.searchParams.has('state')) return;

  // Network first, fall back to cache (and to the app shell for navigations).
  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
        }
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) =>
          cached || (req.mode === 'navigate' ? caches.match('./') : undefined)
        )
      )
  );
});
