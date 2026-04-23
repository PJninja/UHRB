// Horrors store - receives monsters from server
import { writable, get } from 'svelte/store';

// Store for current race horrors (from server)
const monstersStore = writable([]);

/**
 * Set monsters from server
 * @param {Array} monstersArray - Array of monster objects from server
 */
export function setMonsters(monstersArray) {
  monstersStore.set(monstersArray || []);
}

/**
 * Get a specific horror by ID
 * @param {string} monsterId
 * @returns {object|null}
 */
export function getMonsterById(monsterId) {
  const monsters = get(monstersStore);
  return monsters.find(m => m.id === monsterId) || null;
}

/**
 * Clear all horrors
 */
export function clearMonsters() {
  monstersStore.set([]);
}

// Export the store
export const monsters = monstersStore;
