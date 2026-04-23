// Test-mode admin endpoints — only registered when TEST_MODE=true.
// These expose internal race state and allow forcing phase transitions,
// enabling fast automated testing without waiting for real timers.
import { getCurrentRace, forceAdvance, scheduleNextRace, racePayload } from '../services/raceScheduler.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'testAdmin' });

export async function registerTestAdminRoutes(fastify) {
  // Immediately transition to the next race phase:
  // waiting/closed → racing → finished → waiting
  fastify.post('/api/test/advance', async () => {
    log.info({ state: getCurrentRace().state }, 'test: force advance');
    forceAdvance();
    return racePayload(getCurrentRace());
  });

  // Discard current race and schedule a fresh one immediately
  fastify.post('/api/test/reset', async () => {
    log.info('test: reset race state');
    scheduleNextRace();
    return racePayload(getCurrentRace());
  });

  // Full unsanitised race state — includes hidden fields (value, raw traits, etc.)
  fastify.get('/api/test/state', async () => {
    return getCurrentRace();
  });
}
