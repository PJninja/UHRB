// Fastify app factory — separated from index.js so tests can build the app
// without starting a server or calling listen().
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { registerRestRoutes } from './routes/rest.js';
import { registerWsRoutes } from './routes/ws.js';
import { registerTestAdminRoutes } from './routes/testAdmin.js';

/**
 * Build and configure the Fastify app without starting it.
 * @param {object} opts
 * @param {boolean|object} [opts.logger] - Fastify logger option (default: shared pino logger)
 * @param {boolean} [opts.ws] - Register WebSocket routes (default: true)
 * @param {boolean} [opts.rateLimit] - Register rate limiting (default: true; set false in tests)
 */
export async function buildApp(opts = {}) {
  const fastify = Fastify({
    logger: opts.logger !== undefined ? opts.logger : logger,
  });

  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  if (opts.rateLimit !== false) {
    await fastify.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip,
    });
  }

  await fastify.register(websocket);
  await registerRestRoutes(fastify);

  if (opts.ws !== false) {
    await registerWsRoutes(fastify);
  }

  if (config.testMode) {
    await registerTestAdminRoutes(fastify);
  }

  return fastify;
}
