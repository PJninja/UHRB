// UHRB Server - Entry point
import { config } from './config.js';
import { buildApp } from './app.js';
import { initializeScheduler, getCurrentRace } from './services/raceScheduler.js';
import { getActiveSessions } from './state/sessionManager.js';

const fastify = await buildApp();

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
  await fastify.listen({ port: config.port, host: config.host });

  fastify.log.info(`Server listening on ${config.host}:${config.port}`);
  fastify.log.info(`Environment: ${config.nodeEnv}`);
  fastify.log.info(`CORS origin: ${config.corsOrigin}`);
  if (config.testMode) fastify.log.warn('TEST MODE enabled — race timing is accelerated');

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
