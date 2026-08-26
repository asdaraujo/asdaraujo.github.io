const CACHE_NAME = 'static-cache-v1';
const CONFIG_DIR = 'configs';
const CONFIG_URL_PARAM_KEY = 'cfg';

const DEFAULT_CONFIG_NAME = 'basic';
const CONFIG_LIST_KEY = 'configListItems';
const DEFAULT_CONFIG_KEY = 'defaultConfigId';
const PENDING_RECACHE_KEY = 'pendingRecacheRequest';

const SWIPE_REVEAL_PX = 84;
const SWIPE_OPEN_THRESHOLD_PX = 40;
const SWIPE_DRAG_THRESHOLD_PX = 5;

// Helper functions

function isImageIcon(icon) {
  return /^https?:\/\//i.test(icon) || /\.(png|jpe?g|svg|gif|webp)$/i.test(icon);
}

function getFaviconUrl(pageUrl) {
  try {
    const domain = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  } catch (err) {
    return "";
  }
}

function buildIconMarkup(icon, url) {
  const hasIcon = icon !== null && icon !== undefined && String(icon).trim() !== "";

  if (!hasIcon) {
    const favicon = getFaviconUrl(url);
    return favicon ? `<img src="${favicon}" alt="" loading="lazy">` : "";
  }

  if (isImageIcon(icon)) {
    return `<img src="${icon}" alt="" loading="lazy">`;
  }
  // Treat as emoji / text glyph
  return icon;
}

function setTitle(title) {
  if (title) {
    document.title = title;
    const titleElem = document.getElementById("page-title");
    titleElem.innerHTML = title;
  }
}

function applyBackground(imageUrl) {
  if (imageUrl) {
    document.body.style.setProperty("--bg-image", `url("${imageUrl}")`);
  }
}

function applyLuminosity(luminosity) {
  const overlay = document.getElementById("bg-luminosity-overlay");
  const value = Number(luminosity);

  if (!Number.isFinite(value) || value === 0) {
    overlay.style.backgroundColor = "transparent";
    return;
  }

  // Clamp to the supported range.
  const clamped = Math.max(-1, Math.min(1, value));
  const color = clamped < 0 ? "0, 0, 0" : "255, 255, 255";
  const opacity = Math.abs(clamped);

  overlay.style.backgroundColor = `rgba(${color}, ${opacity})`;
}

function waitForServiceWorkerController(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (navigator.serviceWorker.controller) {
      resolve(navigator.serviceWorker.controller);
      return;
    }
    const onChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(navigator.serviceWorker.controller);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(navigator.serviceWorker.controller); // may still be null if SW never took control
    }, timeoutMs);
  });
}

// Modals

function openImageModal(url) {
  document.getElementById("image-modal-img").src = url;
  document.getElementById("image-modal-overlay").classList.add("open");
}

function closeImageModal() {
  document.getElementById("image-modal-overlay").classList.remove("open");
}

function openMessageModal(text) {
  document.getElementById("message-modal-text").innerHTML = text;
  document.getElementById("message-modal-overlay").classList.add("open");
}

function closeMessageModal() {
  document.getElementById("message-modal-overlay").classList.remove("open");
}

function openSettingsModal() {
  document.getElementById('configs-modal-overlay').classList.add('open');
  loadConfigList();
}

function closeSettingsModal() {
  document.getElementById('configs-modal-overlay').classList.remove('open');
}

// Online/offline state

async function isResourceCached(resourceUrl) {
  const absoluteUrl = new URL(resourceUrl.split('?')[0], document.baseURI);
  const cache = await caches.open(CACHE_NAME);

  // Get all Request objects in this cache
  const requests = await cache.keys();

  return requests.some(request => request.url == absoluteUrl);
}

function refreshLinks() {
  appState.get('offline').then((isOffline) => {
    for (e of document.getElementsByClassName('panel')) {
      if (isOffline) {
        e.classList.add('offline');
      } else {
        e.classList.remove('offline');
      }
    }
  });
}

function setOnlineMode() {
  appState.set('offline', false).then(() => refreshLinks());
}

function setOfflineMode() {
  appState.set('offline', true).then(() => refreshLinks());
  ping();
}

function ping() {
  const pingFreqMs = 1000;
  const timeoutMs = 3000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  //const pingUrl = 'http://asdaraujo.github.io/cfa/'; // for test only
  const pingUrl = 'ping';
  fetch(pingUrl, { method: 'HEAD', signal: controller.signal }).then((result) => {
    setOnlineMode();
  }).catch(() => {
    setTimeout(ping, pingFreqMs);
  }).finally(() => {
    clearTimeout(timeout);
  });
}

// State helper functions

async function getConfigs() {
  const configs = await appState.get(CONFIG_LIST_KEY, []);
  return (Array.isArray(configs) && configs.length > 0) ? configs : [await getDefaultConfig()];
}

async function saveConfigs(configs) {
  await appState.set(CONFIG_LIST_KEY, configs);
}

async function getDefaultConfig() {
  return await appState.get(DEFAULT_CONFIG_KEY, DEFAULT_CONFIG_NAME);
}

async function setDefaultConfig(config) {
  await appState.set(DEFAULT_CONFIG_KEY, config);
}

// Main page functions

async function handleLinkClick(event, url) {
  const link = event.currentTarget;
  event.preventDefault();

  // restore state of the link
  link.classList.remove('is-hovered'); // clear immediately, don't wait for mouseleave

  const timeoutMs = 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let isImage = false;
  let isReachable = false;
  let msg = '';
  try {
    const res = await fetch(url, { method: "HEAD", mode: 'no-cors', signal: controller.signal });
    isReachable = true;
    if (link.classList.contains('not-cached')) {
      setOnlineMode();
    }
    const contentType = res.headers.get("Content-Type") || "";
    isImage = contentType.toLowerCase().startsWith("image/");
  } catch (err) {
    // HEAD request failed (e.g. blocked by CORS, or the server doesn't support it).
    // Fall back to treating it as a normal link.
    isImage = false;
    isReachable = false;
    setOfflineMode();
    msg = 'Error: ' + err.message;
  } finally {
    clearTimeout(timeout);
  }

  if (!isReachable) {
    openMessageModal("It seems you're offline.<br/>Try again later.<br/><br/>" + msg);
  } else if (isImage) {
    openImageModal(url);
  } else {
    window.open(url, link.target, "noopener,noreferrer");
  }
}

function renderLinks(links) {
  const list = document.getElementById("link-list");
  list.innerHTML = "";

  links.forEach(({ text, url, icon, target }) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = url;
    if (target === undefined || target === null)
      a.target = "_blank";
    else
      a.target = target;
    a.rel = "noopener noreferrer";
    a.addEventListener('click', (event) => handleLinkClick(event, url));
    a.addEventListener('mouseenter', () => a.classList.add('is-hovered'));
    a.addEventListener('mouseleave', () => a.classList.remove('is-hovered'));

    isResourceCached(url)
      .then((isCached) => {
        if (!isCached) {
          a.classList.add('not-cached');
        }
      });

    const iconSpan = document.createElement("span");
    iconSpan.className = "icon";
    iconSpan.innerHTML = buildIconMarkup(icon, url);

    const textSpan = document.createElement("span");
    textSpan.className = "text";
    textSpan.textContent = text;

    a.appendChild(iconSpan);
    a.appendChild(textSpan);
    li.appendChild(a);
    list.appendChild(li);
  });
}

function renderAttributionMarkup(name, profileUrl, photoUrl, unsplashUrl) {
  const el = document.getElementById("attribution");
  if (!name) {
    el.innerHTML = "";
    return;
  }
  const nameLink = profileUrl
    ? `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer">${name}</a>`
    : name;
  const unsplashLink = unsplashUrl
    ? `<a href="${unsplashUrl}" target="_blank" rel="noopener noreferrer">Unsplash</a>`
    : "Unsplash";
  el.innerHTML = `Photo by ${nameLink} on ${unsplashLink}`;
}

async function loadAttribution(attribution) {
  if (!attribution) return;

  const { unsplashAccessKey, unsplashPhotoId, photographerName, photographerUrl, photoUrl, unsplashUrl } = attribution;

  // If an Unsplash API access key + photo ID are configured, fetch live data
  // directly from the Unsplash API so credit always reflects Unsplash's current record.
  if (unsplashAccessKey && unsplashPhotoId) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/photos/${unsplashPhotoId}?client_id=${unsplashAccessKey}`
      );
      if (!res.ok) throw new Error(`Unsplash API error: ${res.status}`);
      const data = await res.json();

      const name = data?.user?.name;
      const profileUrl = data?.user?.links?.html
        ? `${data.user.links.html}?utm_source=quick_links_app&utm_medium=referral`
        : photographerUrl;
      const liveePhotoUrl = data?.links?.html
        ? `${data.links.html}?utm_source=quick_links_app&utm_medium=referral`
        : photoUrl;

      renderAttributionMarkup(name, profileUrl, liveePhotoUrl, unsplashUrl);

      // Per Unsplash API guidelines, notify them the photo was used ("hotlinked" download trigger).
      if (data?.links?.download_location) {
        fetch(`${data.links.download_location}&client_id=${unsplashAccessKey}`).catch(() => {});
      }
      return;
    } catch (err) {
      console.warn("Falling back to static Unsplash attribution:", err);
    }
  }

  // Fallback: static attribution details supplied in configuration.
  renderAttributionMarkup(photographerName, photographerUrl, photoUrl, unsplashUrl);
}

// Config overlay functions

function closeAllSwipedItems(except) {
  document.querySelectorAll('.configs-item-content.swiped').forEach((el) => {
    if (el !== except) {
      el.classList.remove('swiped');
      el.style.transform = '';
    }
  });
}

function attachSwipeToDelete(contentEl, onDragStart) {
  let dragging = false;
  let startX = 0;
  let baseX = 0;

  function clampX(x) {
    return Math.max(-SWIPE_REVEAL_PX, Math.min(0, x));
  }

  contentEl.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    baseX = contentEl.classList.contains('swiped') ? -SWIPE_REVEAL_PX : 0;
    contentEl.style.transition = 'none';
    contentEl.setPointerCapture(event.pointerId);
  });

  contentEl.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) > SWIPE_DRAG_THRESHOLD_PX && onDragStart) {
      onDragStart();
    }
    const next = clampX(baseX + delta);
    contentEl.style.transform = `translateX(${next}px)`;
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    contentEl.style.transition = '';

    const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(contentEl.style.transform);
    const finalX = match ? parseFloat(match[1]) : 0;

    if (finalX <= -SWIPE_OPEN_THRESHOLD_PX) {
      contentEl.style.transform = `translateX(-${SWIPE_REVEAL_PX}px)`;
      contentEl.classList.add('swiped');
      closeAllSwipedItems(contentEl);
    } else {
      contentEl.style.transform = '';
      contentEl.classList.remove('swiped');
    }
  }

  contentEl.addEventListener('pointerup', endDrag);
  contentEl.addEventListener('pointercancel', endDrag);
}

function renderConfigList(configs, defaultConfig) {
  const list = document.getElementById('configs-listbox');
  list.innerHTML = '';

  if (configs.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'configs-empty';
    empty.textContent = 'No configs yet.';
    list.appendChild(empty);
    return;
  }

  configs.forEach((config) => {
    const isDefault = config === defaultConfig;

    const li = document.createElement('li');
    li.className = 'configs-item';

    const content = document.createElement('div');
    content.className = 'configs-item-content';

    const tick = document.createElement('span');
    tick.className = 'configs-item-tick';
    tick.textContent = isDefault ? '\u2713' : '';

    const textSpan = document.createElement('span');
    textSpan.className = 'configs-item-text';
    textSpan.textContent = config;

    content.appendChild(tick);
    content.appendChild(textSpan);

    let wasDragged = false;

    content.addEventListener('click', async () => {
      if (wasDragged) {
        wasDragged = false;
        return;
      }
      if (content.classList.contains('swiped')) {
        content.classList.remove('swiped');
        content.style.transform = '';
        return;
      }
      await setDefaultConfig(config);
      closeSettingsModal();
      window.location.reload();
    });

    // The default config has no delete affordance: no swipe, no delete button.
    if (!isDefault) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'configs-item-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const currentConfigs = await getConfigs();
        const filtered = currentConfigs.filter((i) => i !== config);
        await saveConfigs(filtered);
        const currentDefaultConfig = await getDefaultConfig();
        renderConfigList(filtered, currentDefaultConfig);
      });
      li.appendChild(deleteBtn);
      attachSwipeToDelete(content, () => { wasDragged = true; });
    }

    li.appendChild(content);
    list.appendChild(li);
  });
}

async function loadConfigList() {
  const items = await getConfigs();
  const defaultConfig = await getDefaultConfig();
  renderConfigList(items, defaultConfig);
}

//

function registerListeners() {
  document.getElementById("image-modal-overlay").addEventListener("click", closeImageModal);
  document.getElementById("message-modal-overlay").addEventListener("click", closeMessageModal);
  document.getElementById('configs-modal-overlay').addEventListener('click', closeSettingsModal);
  document.getElementById('configs-gear-btn').addEventListener('click', openSettingsModal);
  // Clicks inside the panel (listbox, input, buttons) must not bubble up to the overlay's click-to-close handler.
  document.getElementById('configs-panel').addEventListener('click', (event) => { event.stopPropagation(); });

  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', (event) => { openImageModal('images/QuickLinks.png'); });
  }
  document.getElementById('refresh-btn').addEventListener('click', async (event) => {
    event.stopPropagation();

    const controller = (navigator.serviceWorker && navigator.serviceWorker.controller) || await waitForServiceWorkerController();

    // Ask the active service worker to purge and re-populate its cache.
    if (controller) {
      controller.postMessage({ type: 'PURGE_AND_RECACHE' });
      closeSettingsModal();
    } else {
      // No controller yet — likely the very first load. Reload the page so a
      // fresh navigation gives the worker a real chance to register and take
      // control, and mark that we still owe it a purge once it does.
      await appState.set(PENDING_RECACHE_KEY, true);
      window.location.reload();
    }
  });
  
  const configsInput = document.getElementById('configs-new-item');
  const configsAddBtn = document.getElementById('configs-add-btn');
  
  configsInput.addEventListener('input', async () => {
    const text = configsInput.value.trim();
    const items = await getConfigs();
    configsAddBtn.disabled = text === '' || items.includes(text);
  });
  
  configsAddBtn.addEventListener('click', async () => {
    const text = configsInput.value.trim();
    if (!text) return;
  
    const items = await getConfigs();
    items.push(text);
    await saveConfigs(items);
  
    // The very first item ever added becomes the default.
    let defaultConfig = await getDefaultConfig();
    if (!defaultConfig) {
      defaultConfig = text;
      await setDefaultConfig(defaultConfig);
    }
  
    configsInput.value = '';
    configsAddBtn.disabled = true;
  
    renderConfigList(items, defaultConfig);
  });
  
  navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'REFRESH_APP') {
         console.log('App refreshed');
         window.location.reload();
      }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service worker has taken control!');
    // Re-run any setup logic that depends on navigator.serviceWorker.controller
  });
}

async function init(configUrl) {
  // register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registered!', reg))
        .catch(err => console.error('Registration failed:', err));
    });
  }

  const statusEl = document.getElementById("status-message");
  try {
    const response = await fetch(configUrl, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load ${configUrl}: ${response.status}`);
    }
    const config = await response.json();
    setTitle(config.title);
    applyBackground(config.backgroundImage);
    applyLuminosity(config.backgroundLuminosity);
    renderLinks(Array.isArray(config.links) ? config.links : []);
    await loadAttribution(config.backgroundAttribution);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't load configuration [" + configName + "].";
  }
}

// Call this once during page init, after listeners are wired up.
async function checkPendingRecache() {
  const pending = await appState.get(PENDING_RECACHE_KEY, false);
  if (!pending) return;
  console.log('Processing pending recache...');

  // Clear it immediately so this only ever fires once, even if the
  // controller never shows up and nothing else resets the flag.
  await appState.set(PENDING_RECACHE_KEY, false);

  const controller = (navigator.serviceWorker && navigator.serviceWorker.controller)
    || await waitForServiceWorkerController();

  if (controller) {
    controller.postMessage({ type: 'PURGE_AND_RECACHE' });
  }
  // If still no controller after waiting, just drop it — the user can press
  // refresh again; we don't reload a second time from here.
}
const appState = new self.AppState();

(async () => {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  let configName = urlParams.get(CONFIG_URL_PARAM_KEY);
  if (!configName) {
    configName = await getDefaultConfig();
  }
  const configUrl = CONFIG_DIR + '/' + configName + '.json';
  registerListeners();
  init(configUrl);
  checkPendingRecache();
})()
