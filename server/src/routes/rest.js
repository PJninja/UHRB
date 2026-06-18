// REST API routes
import { createSession, validateSession, storeBet, getSession, deductBet, creditPayout, getBalance, clearBet, getCurrentBet, refundBet, getLastBetResult } from '../state/sessionManager.js';
import { getCurrentRace, getLastFinishedRace, isBettingAllowed, addBetToTotal, decrementBetTotal, racePayload, sanitizeMonster } from '../services/raceScheduler.js';
import { validatePayout } from '../services/payoutValidator.js';
import { issueToken, verifyToken } from '../utils/balanceToken.js';

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
    const { balanceToken } = request.body ?? {};
    // Only honour a balance carried over from a previous session if the client
    // presents a valid server-issued signed token — never trust raw numbers.
    const verifiedBalance = verifyToken(balanceToken);
    const session = createSession(verifiedBalance ?? undefined);

    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      candyBalance: session.candyBalance,
      balanceToken: issueToken(session.candyBalance),
    };
  });

  // Validate a session
  fastify.get('/api/session/:sessionId/validate', async (request, reply) => {
    const { sessionId } = request.params;

    const isValid = validateSession(sessionId);
    const session = isValid ? getSession(sessionId) : null;

    const balance = isValid ? getBalance(sessionId) : null;
    return {
      valid: isValid,
      candyBalance: balance,
      balanceToken: isValid ? issueToken(balance) : null,
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

    // Validate amount — must be a finite positive integer (rejects floats,
    // numeric strings, NaN, Infinity, which would corrupt the candy balance)
    if (!Number.isInteger(amount) || amount < 1) {
      return reply.code(400).send({
        error: 'Bet amount must be a positive integer',
      });
    }

    // Reject duplicate bets — a second deduction would orphan the first stake
    const existingBet = getCurrentBet(sessionId);
    if (existingBet && existingBet.raceId === raceId) {
      return reply.code(409).send({
        error: 'Bet already placed for this race — cancel it first',
      });
    }
    // A leftover bet for a different race means that race never resolved
    // (e.g. discarded via test reset) — refund it before accepting a new bet
    if (existingBet) {
      refundBet(sessionId, existingBet.amount);
      clearBet(sessionId);
    }

    // Deduct bet from server-side balance
    const deduction = deductBet(sessionId, amount);
    if (!deduction.ok) {
      const status = deduction.reason === 'insufficient_balance' ? 402 : 500;
      return reply.code(status).send({ error: deduction.reason });
    }

    // Store bet
    const success = storeBet(sessionId, raceId, monsterId, amount);

    if (!success) {
      // Deduction already happened — give the candy back before failing
      refundBet(sessionId, amount);
      return reply.code(500).send({
        error: 'Failed to store bet',
      });
    }

    // Update bet totals for this race
    addBetToTotal(monsterId, amount);

    return {
      success: true,
      bet: { raceId, monsterId, amount },
      candyBalance: deduction.candyBalance,
      balanceToken: issueToken(deduction.candyBalance),
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

    const sanitizeRankings = rankings =>
      (rankings || []).map(r => ({ position: r.position, monster: sanitizeMonster(r.monster) }));

    // Bets are resolved server-side at race finish. If this session's bet for
    // the requested race was already resolved, return the stored result —
    // idempotent and immune to double-crediting.
    const stored = getLastBetResult(sessionId);
    if (stored && stored.raceId === raceId) {
      const live = getCurrentRace();
      const last = getLastFinishedRace();
      const race = live?.id === raceId ? live : (last?.id === raceId ? last : null);
      const candyBalance = getBalance(sessionId);

      return {
        valid: true,
        won: stored.won,
        winner: race?.winner ? sanitizeMonster(race.winner) : null,
        rankings: sanitizeRankings(race?.rankings),
        odds: stored.odds,
        payout: stored.payout,
        bet: { raceId: stored.raceId, monsterId: stored.monsterId, amount: stored.amount },
        error: null,
        candyBalance,
        balanceToken: issueToken(candyBalance),
      };
    }

    // Fallback: bet not yet resolved (e.g. validate called in the brief window
    // before race finish processing) — resolve it here
    const result = validatePayout(sessionId, bet);

    let candyBalance = getBalance(sessionId);
    if (result.valid && result.bet) {
      // A real bet was resolved — credit and clear to prevent double-payout
      candyBalance = creditPayout(sessionId, result.payout);
      clearBet(sessionId);
    }

    return {
      valid: result.valid,
      won: result.won,
      winner: result.winner ? sanitizeMonster(result.winner) : null,
      rankings: sanitizeRankings(result.rankings),
      odds: result.odds,
      payout: result.payout,
      bet: result.bet,
      error: result.error,
      candyBalance,
      balanceToken: issueToken(candyBalance),
    };
  });

  // Cancel/clear an active bet
  fastify.delete('/api/race/:raceId/bet', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { raceId } = request.params;
    const { sessionId } = request.body;

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

    // Get current bet
    const currentBet = getCurrentBet(sessionId);

    if (!currentBet) {
      return reply.code(404).send({
        error: 'No active bet to cancel',
      });
    }

    // Validate bet is for the current race
    if (currentBet.raceId !== raceId) {
      return reply.code(400).send({
        error: 'Bet is for a different race',
      });
    }

    // Get current race to check if betting is still open
    const race = getCurrentRace();

    if (!race || race.id !== raceId) {
      return reply.code(404).send({
        error: 'Race not found',
      });
    }

    // Only allow canceling if race hasn't started yet
    if (!isBettingAllowed()) {
      return reply.code(409).send({
        error: 'Cannot cancel bet - race has started',
      });
    }

    // Refund the bet amount
    const refund = refundBet(sessionId, currentBet.amount);

    if (!refund.ok) {
      return reply.code(500).send({
        error: 'Failed to refund bet',
      });
    }

    // Clear the bet from session
    clearBet(sessionId);

    // Decrement bet totals for the monster
    decrementBetTotal(currentBet.monsterId, currentBet.amount);

    return {
      success: true,
      refunded: currentBet.amount,
      candyBalance: refund.candyBalance,
      balanceToken: issueToken(refund.candyBalance),
    };
  });
}
