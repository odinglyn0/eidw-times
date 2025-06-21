/// <reference lib="webworker" />

const CACHE_NAME = 'dublin-airport-security-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/globals.css',
  '/images/favicon.png',
  '/images/Dublin_airport_logo.svg.png',
  '/images/plane.svg',
  '/manifest.json'
  // Add other critical assets here
];

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching essential assets');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Service Worker: Failed to cache during install:', error);
      })
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
          return null;
        }).filter(Boolean)
      );
    })
  );
  // Ensure the service worker takes control of the page immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event: FetchEvent) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // For API calls (Supabase Edge Functions), use network-first strategy
  // This ensures we always try to get the latest data
  if (event.request.url.includes('/functions/v1/invoke/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If network request succeeds, cache it and return
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try to serve from cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // For other assets (HTML, CSS, JS, images), use cache-first strategy
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(fetchResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        });
      });
    }).catch(() => {
      // Fallback for navigation requests if offline and not in cache
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html'); // Serve offline page if available
      }
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});