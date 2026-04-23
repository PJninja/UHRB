// Connection status tracking
import { writable } from 'svelte/store';

const connectionStore = writable({
  connected: false,
  error: null,
  lastSuccessfulPoll: null,
  consecutiveFailures: 0,
});

/**
 * Mark connection as successful
 */
export function markConnected() {
  connectionStore.update(s => ({
    ...s,
    connected: true,
    error: null,
    lastSuccessfulPoll: Date.now(),
    consecutiveFailures: 0,
  }));
}

/**
 * Mark connection as failed
 * @param {Error} error
 */
export function markDisconnected(error) {
  connectionStore.update(s => ({
    ...s,
    connected: false,
    error: error?.message || 'Connection failed',
    consecutiveFailures: s.consecutiveFailures + 1,
  }));
}

/**
 * Reset connection status
 */
export function resetConnection() {
  connectionStore.set({
    connected: false,
    error: null,
    lastSuccessfulPoll: null,
    consecutiveFailures: 0,
  });
}

export const connection = connectionStore;
