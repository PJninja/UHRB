// UHRB Server - Entry point
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { registerRestRoutes } from './routes/rest.js';
import { registerWsRoutes } from './routes/ws.js';
import { initializeScheduler, getCurrentRace } from './services/raceScheduler.js';
import { getActiveSessions } from './state/sessionManager.js';

// Use the shared logger so fastify.log and service child loggers share one stream.
const fastify = Fastify({ logger });

// Register CORS
await fastify.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
});

// Global rate limit — 300 req/min per IP
await fastify.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip,
});

// Register WebSocket support
await fastify.register(websocket);

// Register routes
await registerRestRoutes(fastify);
await registerWsRoutes(fastify);

// Graceful shutdown
const shutdown = async () => {
  fastify.log.info('Shutting down server...');

  try {
    await fastify.close();
    fastify.log.info('Server closed successfully');
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
try {
  await fastify.listen({
    port: config.port,
    host: config.host,
  });

  fastify.log.info(`Server listening on ${config.host}:${config.port}`);
  fastify.log.info(`Environment: ${config.nodeEnv}`);
  fastify.log.info(`CORS origin: ${config.corsOrigin}`);

  // Initialize race scheduler
  initializeScheduler();

  // Log status every 30 seconds (for monitoring)
  setInterval(() => {
    const race = getCurrentRace();
    const sessions = getActiveSessions();

    fastify.log.info({
      activeSessions: sessions,
      currentRace: {
        id: race.id,
        state: race.state,
        timeRemaining: race.timeRemaining,
        monsters: race.monsters.length,
      },
    }, 'Server status');
  }, 30000);
} catch (err) {
  fastify.log.error(err, 'Failed to start server');
  process.exit(1);
}
