// WebSocket route — sends current race state on connect, then relies on broadcaster
import { addClient, removeClient, getClientCount } from '../services/broadcaster.js';
import { getCurrentRace, racePayload } from '../services/raceScheduler.js';

export async function registerWsRoutes(fastify) {
  fastify.get('/ws', { websocket: true }, (socket, request) => {
    addClient(socket);
    fastify.log.info(`[WS] Client connected (${getClientCount()} total)`);

    // Send current race state immediately so client doesn't wait for next event
    socket.send(JSON.stringify({ type: 'race:update', data: racePayload(getCurrentRace()) }));

    socket.on('close', () => {
      removeClient(socket);
      fastify.log.info(`[WS] Client disconnected (${getClientCount()} remaining)`);
    });
  });
}
