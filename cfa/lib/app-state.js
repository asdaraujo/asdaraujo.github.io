/**
 * AppState — a tiny wrapper around IndexedDB for sharing state between
 * a PWA's client pages and its service worker.
 *
 * Works everywhere with zero dependencies (raw IndexedDB API), so it can be
 * loaded via importScripts() in a classic-script service worker, a plain
 * <script> tag, or an ES module import — no bundler required.
 *
 * Usage:
 *   const state = new AppState();
 *   await state.set('syncStatus', 'complete');
 *   const value = await state.get('syncStatus');
 *   await state.delete('syncStatus');
 *   const allKeys = await state.keys();
 */
class AppState {
  constructor(dbName = 'app-state', storeName = 'state', version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this._dbPromise = null;
  }

  _openDB() {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this._dbPromise;
  }

  async _withStore(mode, callback) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode);
      const store = tx.objectStore(this.storeName);
      const request = callback(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Get a value by key. Returns undefined if the key doesn't exist. */
  async get(key, defaultValue) {
    return this._withStore('readonly', (store) => store.get(key)).then((value) => {
      if (value === undefined && defaultValue !== undefined) {
        return defaultValue;
      }
      return value;
    });
  }

  /** Set a value for a key (creates or overwrites). */
  async set(key, value) {
    await this._withStore('readwrite', (store) => store.put(value, key));
    return value;
  }

  /** Delete a key. */
  async delete(key) {
    return this._withStore('readwrite', (store) => store.delete(key));
  }

  /** Clear all keys in the store. */
  async clear() {
    return this._withStore('readwrite', (store) => store.clear());
  }

  /** List all keys currently stored. */
  async keys() {
    return this._withStore('readonly', (store) => store.getAllKeys());
  }

  /** Get all values currently stored (same order as keys()). */
  async values() {
    return this._withStore('readonly', (store) => store.getAll());
  }
}

// Make available in both classic-script service workers (importScripts)
// and browser <script> tags, where there's no module system.
if (typeof self !== 'undefined') {
  self.AppState = AppState;
}

// Also support ES module import, e.g.:
//   import { AppState } from './app-state.js';
//export { AppState };
