const CACHE_NAME = 'todo-pwa-v1';
const STATIC_CACHE = 'static-cache-v1';
const DYNAMIC_CACHE = 'dynamic-cache-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './firebaseConfig.js',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.0/firebase-firestore.js'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(DYNAMIC_CACHE)
    ])
  );
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First with Cache Fallback for API, Cache First for Static Assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle static assets - Cache First
  if (STATIC_ASSETS.includes(url.pathname) || event.request.url.includes('icon')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
    return;
  }

  // Handle API requests - Network First with Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response before using it
        const responseClone = response.clone();
        
        // Open dynamic cache and store the response
        caches.open(DYNAMIC_CACHE)
          .then(cache => {
            cache.put(event.request, responseClone);
          });
        
        return response;
      })
      .catch(() => {
        // If network fails, try to get from cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If no cache exists, return a default offline response
            if (event.request.url.includes('tasks')) {
              return new Response(JSON.stringify([]), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return new Response('Offline');
          });
      })
  );
});

// Handle offline sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncTasks());
  }
});

// Background sync for tasks
async function syncTasks() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  
  for (const request of requests) {
    if (request.url.includes('/tasks')) {
      try {
        const response = await fetch(request);
        const data = await response.json();
        // Handle the synced data here
        console.log('Synced task:', data);
      } catch (error) {
        console.error('Error syncing task:', error);
      }
    }
  }
}
  