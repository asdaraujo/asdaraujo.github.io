importScripts('./lib/app-state.js');

const CACHE_NAME = 'static-cache-v1';
const CONFIG_DIR = 'configs';
const CONFIG_LIST_KEY = 'configListItems';

// List all the local files you want to force-cache for offline use
const ASSETS_TO_CACHE = [
    self.registration.scope,
    self.registration.scope + 'images/CanIOrCantI.png',
    self.registration.scope + 'images/CentralFDR.png',
    self.registration.scope + 'images/FireRestrictionsDates.png',
    self.registration.scope + 'images/FireSafetyTranslations.png',
    self.registration.scope + 'images/RegisterYourBurnOff.png',
];

async function assetsToCache() {
  const appState = new self.AppState();
  return appState.get(CONFIG_LIST_KEY).then((items) => ASSETS_TO_CACHE.concat(items.map(i => CONFIG_DIR + '/' + i + '.json')));
}

// 1. Install Event: Save files to the browser's Cache Storage
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Pre-caching static assets...');
            console.log(assetsToCache());
            return assetsToCache()
              .then((items) => items.map(url => new Request(url, { cache: 'reload' })))
              .then((reloadRequests) => cache.addAll(reloadRequests));
        })
    );
});

self.addEventListener('activate', (event) => {
  console.log('SW: Claiming client...');
  event.waitUntil(self.clients.claim()); 
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
        caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
            // Return the cached file if found, otherwise make a network request
            if (cachedResponse) {
              return cachedResponse;
            } else {
              const resp = fetch(event.request);
              return resp;
            }
        }).catch(() => {
            // Optional: Fallback if both cache and network fail (offline)
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});

// 3. Message Event: Let the page ask us to purge the cache and re-fetch
//    everything fresh from the network. Triggered by the refresh button
//    in the settings overlay.
self.addEventListener('message', (event) => {
    const reloadRequests = ASSETS_TO_CACHE.map(url => new Request(url, { cache: 'reload' }));
    if (event.data && event.data.type === 'PURGE_AND_RECACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME)
                .then(() => caches.open(CACHE_NAME))
                .then((cache) => cache.addAll(reloadRequests))
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
