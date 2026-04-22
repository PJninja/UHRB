// REST API routes
import { createSession, validateSession, storeBet, getSession } from '../state/sessionManager.js';
import { getCurrentRace, isBettingAllowed, addBetToTotal, racePayload } from '../services/raceScheduler.js';
import { validatePayout } from '../services/payoutValidator.js';

/**
 * Register REST API routes
 * @param {FastifyInstance} fastify
 */
export async function registerRestRoutes(fastify) {
  // Health check
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Create a new anonymous session
  fastify.post('/api/session', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const session = createSession();

    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    };
  });

  // Validate a session
  fastify.get('/api/session/:sessionId/validate', async (request, reply) => {
    const { sessionId } = request.params;

    const isValid = validateSession(sessionId);
    const session = isValid ? getSession(sessionId) : null;

    return {
      valid: isValid,
      session: session ? {
        id: session.id,
        connectedAt: session.connectedAt,
        expiresAt: session.expiresAt,
      } : null,
    };
  });

  // Get current race state
  fastify.get('/api/race/current', async (request, reply) => {
    return racePayload(getCurrentRace());
  });

  // Get bio-only fields for a monster in the current race
  fastify.get('/api/monster/:id', async (request, reply) => {
    const { id } = request.params;
    const race = getCurrentRace();
    const monster = race.monsters.find(m => m.id === id);
    if (!monster) {
      return reply.code(404).send({ error: 'Monster not found' });
    }
    return {
      id: monster.id,
      description: monster.description,
      blurb: monster.blurb,
      height: monster.height,
      weight: monster.weight,
      features: monster.features,
    };
  });

  // Place a bet
  fastify.post('/api/race/:raceId/bet', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { raceId } = request.params;
    const { sessionId, monsterId, amount } = request.body;

    // Validate request
    if (!sessionId || !monsterId || !amount) {
      return reply.code(400).send({
        error: 'Missing required fields: sessionId, monsterId, amount',
      });
    }

    // Validate session
    if (!validateSession(sessionId)) {
      return reply.code(401).send({
        error: 'Invalid or expired session',
      });
    }

    // Get current race
    const race = getCurrentRace();

    // Check if race ID matches
    if (race.id !== raceId) {
      return reply.code(404).send({
        error: 'Race not found or already finished',
      });
    }

    // Check if betting is allowed
    if (!isBettingAllowed()) {
      return reply.code(409).send({
        error: 'Betting is closed for this race',
      });
    }

    // Validate monster exists in race
    const monsterExists = race.monsters.some(m => m.id === monsterId);
    if (!monsterExists) {
      return reply.code(400).send({
        error: 'Monster not in this race',
      });
    }

    // Validate amount (basic validation - client manages balance)
    if (amount < 1) {
      return reply.code(400).send({
        error: 'Bet amount must be at least 1',
      });
    }

    // Store bet
    const success = storeBet(sessionId, raceId, monsterId, amount);

    if (!success) {
      return reply.code(500).send({
        error: 'Failed to store bet',
      });
    }

    // Update bet totals for this race
    addBetToTotal(monsterId, amount);

    return {
      success: true,
      bet: {
        raceId,
        monsterId,
        amount,
      },
    };
  });

  // Validate payout (anti-cheat)
  fastify.post('/api/race/:raceId/payout/validate', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { raceId } = request.params;
    const { sessionId, bet } = request.body;

    // Validate request
    if (!sessionId) {
      return reply.code(400).send({
        error: 'Missing required field: sessionId',
      });
    }

    // Validate session
    if (!validateSession(sessionId)) {
      return reply.code(401).send({
        error: 'Invalid or expired session',
      });
    }

    // Validate payout
    const result = validatePayout(sessionId, bet);

    return {
      valid: result.valid,
      won: result.won,
      winner: result.winner,
      rankings: result.rankings,
      odds: result.odds,
      payout: result.payout,
      bet: result.bet,
      error: result.error,
    };
  });
}
