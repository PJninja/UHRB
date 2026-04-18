// WebSocket client registry and broadcast utility
const WS_OPEN = 1; // WebSocket.OPEN — readyState value for an open connection

const clients = new Set();

export function addClient(socket) {
  clients.add(socket);
}

export function removeClient(socket) {
  clients.delete(socket);
}

/**
 * Broadcast a message to all connected clients.
 * Stale sockets that throw on send are removed automatically.
 * @param {string} type - Event type
 * @param {object} data - Payload
 */
export function broadcast(type, data) {
  if (clients.size === 0) return;
  const message = JSON.stringify({ type, data });
  for (const socket of clients) {
    if (socket.readyState === WS_OPEN) {
      try {
        socket.send(message);
      } catch {
        clients.delete(socket);
      }
    }
  }
}

export function getClientCount() {
  return clients.size;
}
