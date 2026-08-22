const CACHE_NAME = 'static-cache-v1';

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
