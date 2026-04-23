// WebSocket client for race state updates — replaces REST polling
import { markConnected, markDisconnected } from '../stores/connection.js';

const WS_BASE = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return apiUrl.replace(/\/api$/, '').replace(/^http/, 'ws');
})();

let socket = null;
let onUpdateCallback = null;
let reconnectTimeout = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;
let active = false;

export function startSocket(onUpdate) {
  onUpdateCallback = onUpdate;
  active = true;
  connect();
}

export function stopSocket() {
  active = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  onUpdateCallback = null;
}

function connect() {
  socket = new WebSocket(`${WS_BASE}/ws`);

  socket.addEventListener('open', () => {
    console.log('[RaceSocket] Connected');
    markConnected();
    reconnectDelay = 1000;
  });

  socket.addEventListener('message', (event) => {
    try {
      const { type, data } = JSON.parse(event.data);
      if (type === 'race:update' && onUpdateCallback) {
        onUpdateCallback(data);
      }
    } catch (e) {
      console.error('[RaceSocket] Failed to parse message:', e);
    }
  });

  socket.addEventListener('close', () => {
    if (!active) return;
    console.warn(`[RaceSocket] Disconnected — reconnecting in ${reconnectDelay}ms`);
    markDisconnected(new Error('WebSocket closed'));
    reconnectTimeout = setTimeout(() => {
      // Jitter ±2s prevents thundering herd when many clients reconnect simultaneously.
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY) + Math.random() * 2000;
      connect();
    }, reconnectDelay);
  });

  socket.addEventListener('error', () => {
    // close event fires after error; reconnect is handled there
  });
}
