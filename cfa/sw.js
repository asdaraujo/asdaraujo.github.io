importScripts('https://cdn.jsdelivr.net/npm/idb@8/build/umd.js');

const CACHE_NAME = 'static-cache-v1';

const dbPromise = idb.openDB('app-state', 1, {
  upgrade(db) {
    db.createObjectStore('state');
  },
});

async function getState(key) {
  return (await dbPromise).get('state', key);
}

async function setState(key, value) {
  return (await dbPromise).put('state', value, key);
}


// List all the local files you want to force-cache for offline use
const ASSETS_TO_CACHE = [
    self.registration.scope + '?cfg=warb',
    self.registration.scope + '?cfg=qr-codes',
    self.registration.scope + 'warb.json',
    self.registration.scope + 'qr-codes.json',
    self.registration.scope + 'images/CanIOrCantI.png',
    self.registration.scope + 'images/CentralFDR.png',
    self.registration.scope + 'images/FireRestrictionsDates.png',
    self.registration.scope + 'images/FireSafetyTranslations.png',
    self.registration.scope + 'images/RegisterYourBurnOff.png',
];

// 1. Install Event: Save files to the browser's Cache Storage
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Pre-caching static assets...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. Fetch Event: Intercept requests and serve from cache first
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Don't intercept cross-origin requests (e.g. the CFA SSO link) —
    // let the browser handle them natively in the page context,
    // so the page's CSP (upgrade-insecure-requests) applies consistently.
    if (!url.startsWith(self.location.origin)) {
      return; // no respondWith → default network handling in page context
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Return the cached file if found, otherwise make a network request
            if (cachedResponse) {
              return cachedResponse;
            } else {
              const resp = fetch(event.request);
              setState('offline', false);
              return resp;
            }
        }).catch(() => {
            setState('offline', true);
            // Optional: Fallback if both cache and network fail (offline)
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});
