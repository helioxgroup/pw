const CACHE_NAME = 'heliox-pwgen-v1.3.0';

// Only cache assets we can reliably fetch
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

// CDN assets cached individually so failures don't block install
const cdnAssets = [];

// Listen for skip waiting message
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install event - cache core assets
self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching core files');
        // Cache CDN assets individually — failures won't block install
        cdnAssets.forEach(url => {
          cache.add(url).catch(err => {
            console.warn('Service Worker: Failed to cache CDN asset:', url, err);
          });
        });
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('Service Worker: Clearing old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event — stale-while-revalidate for own assets, cache-first for CDN
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // CDN resources: cache-first (versioned/immutable)
  if (requestUrl.origin !== location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request))
        .catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  // Own assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);

        // Return cached immediately; update in background
        return cached || fetchPromise || caches.match('/index.html');
      });
    })
  );
});
