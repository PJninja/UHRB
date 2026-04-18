// LocalStorage persistence utilities
const STORAGE_PREFIX = 'uhrb_';

/**
 * Save data to localStorage
 * @param {string} key - Storage key (will be prefixed with 'uhrb_')
 * @param {any} value - Data to save (will be JSON stringified)
 */
export function saveToStorage(key, value) {
  try {
    const storageKey = STORAGE_PREFIX + key;
    const serialized = JSON.stringify(value);
    localStorage.setItem(storageKey, serialized);
  } catch (error) {
    console.error(`Error saving to localStorage (${key}):`, error);
  }
}

/**
 * Load data from localStorage
 * @param {string} key - Storage key (will be prefixed with 'uhrb_')
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {any} Loaded data or default value
 */
export function loadFromStorage(key, defaultValue = null) {
  try {
    const storageKey = STORAGE_PREFIX + key;
    const serialized = localStorage.getItem(storageKey);

    if (serialized === null) {
      return defaultValue;
    }

    return JSON.parse(serialized);
  } catch (error) {
    console.error(`Error loading from localStorage (${key}):`, error);
    return defaultValue;
  }
}

/**
 * Remove data from localStorage
 * @param {string} key - Storage key (will be prefixed with 'uhrb_')
 */
export function removeFromStorage(key) {
  try {
    const storageKey = STORAGE_PREFIX + key;
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.error(`Error removing from localStorage (${key}):`, error);
  }
}

/**
 * Clear all UHRB data from localStorage
 */
export function clearAllStorage() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
}

/**
 * Create a persisted Svelte store
 * @param {string} key - Storage key
 * @param {any} initialValue - Initial value
 * @param {number} debounceMs - Debounce time for saves (default 1000ms)
 * @returns {object} Writable store with persistence
 */
export function persistedStore(key, initialValue, debounceMs = 1000) {
  // Load initial value from storage or use provided initial value
  const stored = loadFromStorage(key, initialValue);

  // Create a simple writable store implementation
  let value = stored;
  let subscribers = [];
  let saveTimeout = null;

  const set = (newValue) => {
    value = newValue;

    // Notify subscribers
    subscribers.forEach(subscriber => subscriber(value));

    // Debounced save to localStorage
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveToStorage(key, value);
    }, debounceMs);
  };

  const update = (fn) => {
    set(fn(value));
  };

  const subscribe = (subscriber) => {
    subscribers.push(subscriber);
    subscriber(value); // Call immediately with current value

    return () => {
      const index = subscribers.indexOf(subscriber);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    };
  };

  return {
    subscribe,
    set,
    update
  };
}
