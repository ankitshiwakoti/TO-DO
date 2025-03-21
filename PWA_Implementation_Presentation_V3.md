# Converting Todo App to PWA
## A Journey from Web to Progressive Web App

---

# What We Built
- Converted existing Todo app to PWA
- Added offline functionality
- Implemented data sync
- Enhanced user experience
- Handles API calls offline

---

# Key Features
- Works without internet
- Stores data locally
- Syncs with Firebase when online
- Installable on devices
- Native app-like experience
- Offline API call handling

---

# How We Achieved It

## 1. Service Worker
```javascript
// sw.js
const CACHE_NAME = 'todo-app-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json'
];

// Handle API calls
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        // Otherwise fetch from network
        return fetch(event.request);
      })
  );
});
```
- Handles offline caching
- Manages network requests
- Enables offline functionality
- Catches and caches API responses

---

# How We Achieved It (Cont.)

## 2. Local Storage (IndexedDB)
```javascript
const dbName = 'todo-db';
const request = indexedDB.open(dbName, dbVersion);

request.onupgradeneeded = (event) => {
  const db = event.target.result;
  db.createObjectStore('tasks', { keyPath: 'id' });
};

// Store API responses
async function storeApiResponse(url, data) {
  const store = await getStore('api-cache');
  await store.put(data, url);
}
```
- Stores tasks locally
- Works offline
- Syncs when online
- Caches API responses

---

# How We Achieved It (Cont.)

## 3. Firebase Integration
- Real-time database
- Authentication
- Cloud functions
- Background sync
- Offline persistence enabled

---

# API Call Handling

## Offline Strategy
1. **Cache First**
   - Check local cache
   - Return cached data if available
   - Fall back to network if needed

2. **Queue System**
   - Store failed API calls
   - Retry when online
   - Handle conflicts

3. **Sync Management**
   - Track sync status
   - Handle conflicts
   - Maintain data consistency

---

# Tools We Used
- Chrome DevTools
- Lighthouse
- Firebase Console
- IndexedDB Explorer
- Network Tab for API monitoring

---

# Testing & Results
- Works offline
- Syncs automatically
- Fast performance
- Cross-browser support
- Reliable API handling

---

# [Screenshot: App in Action]
> Add screenshot showing app working offline and syncing, including API call handling

---

# Thank You
Questions? 