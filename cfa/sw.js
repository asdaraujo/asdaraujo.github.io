importScripts('./lib/app-state.js');

const CACHE_NAME = 'static-cache-v1';
const CONFIG_DIR = 'configs';
const CONFIG_LIST_KEY = 'configListItems';

// List all the local files you want to force-cache for offline use
const ASSETS_TO_CACHE = [
    self.registration.scope,
    self.registration.scope + 'index.html',
    self.registration.scope + 'images/CanIOrCantI.png',
    self.registration.scope + 'images/CentralFDR.png',
    self.registration.scope + 'images/FireRestrictionsDates.png',
    self.registration.scope + 'images/FireSafetyTranslations.png',
    self.registration.scope + 'images/QuickLinks.png',
    self.registration.scope + 'images/RegisterYourBurnOff.png',
    self.registration.scope + 'css/app.css',
    self.registration.scope + 'icons/share-white.svg',
    self.registration.scope + 'icons/icon-192.png',
    self.registration.scope + 'icons/icon-512.png',
    self.registration.scope + 'lib/app-state.js',
    self.registration.scope + 'lib/app.js',
];


async function assetsToCache() {
  const appState = new self.AppState();
  return appState.get(CONFIG_LIST_KEY).then((items) => ASSETS_TO_CACHE.concat(items.map(i => CONFIG_DIR + '/' + i + '.json')));
}

// Install Event: Save files to the browser's Cache Storage
self.addEventListener('install', (event) => {
    self.skipWaiting(); // activate this worker as soon as it finishes installing
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Pre-caching static assets...');
            return assetsToCache()
              .then((items) => items.map(url => new Request(url, { cache: 'reload' })))
              .then((reloadRequests) => cache.addAll(reloadRequests));
        })
    );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function listCacheEntries() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();

  requests.forEach(request => {
    console.log('CACHE ENTRY:' + request.url);
  });
}

// Fetch Event: Intercept requests and serve from cache first
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    console.log('EVENT URL:' + url);

    // Don't intercept cross-origin requests (e.g. the CFA SSO link) —
    // let the browser handle them natively in the page context,
    // so the page's CSP (upgrade-insecure-requests) applies consistently.
    if (!url.startsWith(self.location.origin)) {
      console.log('CROSS ORIGIN:' + url + ': do not intercept');
      return; // no respondWith → default network handling in page context
    }

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((cachedResponse) => {
            if (!url.includes('ping')) {
                listCacheEntries();
            }
            console.log('CACHED RESPONSE:' + url + ':' + cachedResponse);
            // Return the cached file if found, otherwise make a network request
            if (cachedResponse) {
              return cachedResponse;
            } else {
              const resp = fetch(event.request);
              return resp;
            }
        }).catch(() => {
            console.log('CACHE MATCH EXCEPTION:' + url);
            // Optional: Fallback if both cache and network fail (offline)
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});

// Message Event: Let the page ask us to purge the cache and re-fetch
// everything fresh from the network. Triggered by the refresh button
// in the settings overlay.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PURGE_AND_RECACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME)
                .then(() => caches.open(CACHE_NAME))
                .then((cache) => {
                  console.log('Reloading static assets...');
                  return assetsToCache()
                    .then((items) => items.map(url => new Request(url, { cache: 'reload' })))
                    .then((reloadRequests) => cache.addAll(reloadRequests));
                })
                .then(() => {
                  console.log('Cache purged and re-populated.');
                  if (event.source) {
                    event.source.postMessage({ type: 'REFRESH_APP' });
                  }
                })
                .catch((err) => console.error('Cache purge/recache failed:', err))
        );
    }
});
