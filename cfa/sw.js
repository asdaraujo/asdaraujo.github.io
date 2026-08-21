const CACHE_NAME = 'static-cache-v1';

// List all the local files you want to force-cache for offline use
const ASSETS_TO_CACHE = [
    'index.html?cfg=warb',
    'index.html?cfg=qr-codes',
    'warb.json',
    'qr-codes.json',
    'images/CanIOrCantI.png',
//    '/styles.css',      // Add your CSS if you have one
//    '/script.js',      // Add your JS if you have one
//    '/logo.png'         // Add images if needed
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
    console.log('fetch intercepted');
    console.log(event.request);
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Return the cached file if found, otherwise make a network request
            return cachedResponse || fetch(event.request);
        }).catch(() => {
            // Optional: Fallback if both cache and network fail (offline)
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});
