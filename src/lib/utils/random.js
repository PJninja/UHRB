// Random utility functions

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Select a random element from an array
 * @param {Array} array
 * @returns {any}
 */
export function selectRandom(array) {
  return array[randomInt(0, array.length - 1)];
}

/**
 * Shuffle an array (Fisher-Yates algorithm)
 * @param {Array} array
 * @returns {Array} Shuffled copy of the array
 */
export function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate a simple UUID-like ID
 * @returns {string}
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Pick N random elements from an array without replacement
 * @param {Array} array
 * @param {number} count
 * @returns {Array}
 */
export function selectMultipleRandom(array, count) {
  const shuffled = shuffle(array);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Roll a percentage chance (0-100)
 * @param {number} percent - Probability (0-100)
 * @returns {boolean} True if successful
 */
export function rollChance(percent) {
  return Math.random() * 100 < percent;
}
