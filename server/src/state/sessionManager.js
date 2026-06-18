// Session management for anonymous players
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

const log = logger.child({ module: 'sessionManager' });

// Session storage (in-memory Map for MVP)
// Key: sessionId, Value: session object
const sessions = new Map();

// Session TTL (24 hours)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Purge expired sessions on a background interval rather than on every read.
// unref() so the interval never keeps the process (or test runner) alive.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(id);
  }
}, 60 * 60 * 1000).unref?.();

/**
 * Create a new anonymous session.
 * @param {number} [verifiedBalance] - Pre-verified balance from a signed token. When
 *   omitted or invalid the session starts at config.startingBalance. Raw client input
 *   must never be passed here directly — verify it with verifyToken() first.
 * @returns {object} Session object with id, expiry, and starting balance
 */
export function createSession(verifiedBalance) {
  const sessionId = `session_${nanoid()}`;
  const now = Date.now();

  const valid = Number.isFinite(verifiedBalance) && verifiedBalance > 0;
  const candyBalance = valid
    ? Math.min(Math.floor(verifiedBalance), config.maxClaimedBalance)
    : config.startingBalance;

  const session = {
    id: sessionId,
    connectedAt: now,
    lastSeen: now,
    expiresAt: now + SESSION_TTL_MS,
    candyBalance,
    currentBet: null, // { raceId, monsterId, amount }
    wsConnection: null,
  };

  sessions.set(sessionId, session);

  log.debug({ sessionId, candyBalance }, 'session created');

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    candyBalance: session.candyBalance,
  };
}

/**
 * Get a session by ID
 * @param {string} sessionId
 * @returns {object|null} Session object or null if not found/expired
 */
export function getSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    log.debug({ sessionId }, 'session expired');
    return null;
  }

  // Update last seen
  session.lastSeen = Date.now();

  return session;
}

/**
 * Validate if a session is active
 * @param {string} sessionId
 * @returns {boolean}
 */
export function validateSession(sessionId) {
  return getSession(sessionId) !== null;
}

/**
 * Store a bet for a session
 * @param {string} sessionId
 * @param {string} raceId
 * @param {string} monsterId
 * @param {number} amount
 * @returns {boolean} Success
 */
export function storeBet(sessionId, raceId, monsterId, amount) {
  const session = getSession(sessionId);

  if (!session) {
    log.error({ sessionId }, 'session not found when storing bet');
    return false;
  }

  session.currentBet = {
    raceId,
    monsterId,
    amount,
    placedAt: Date.now(),
  };

  log.debug({ sessionId, monsterId, amount, raceId }, 'bet stored');

  return true;
}

/**
 * Get the current bet for a session
 * @param {string} sessionId
 * @returns {object|null} Bet object or null
 */
export function getCurrentBet(sessionId) {
  const session = getSession(sessionId);
  return session ? session.currentBet : null;
}

/**
 * Clear the bet for a session (after race finishes)
 * @param {string} sessionId
 * @returns {boolean} Success
 */
export function clearBet(sessionId) {
  const session = getSession(sessionId);

  if (!session) {
    return false;
  }

  session.currentBet = null;
  return true;
}

/**
 * Deduct a bet amount from a session's candy balance.
 * @param {string} sessionId
 * @param {number} amount
 * @returns {{ ok: boolean, candyBalance?: number, reason?: string }}
 */
export function deductBet(sessionId, amount) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: 'session_not_found' };
  if (session.candyBalance < amount) return { ok: false, reason: 'insufficient_balance' };
  session.candyBalance -= amount;
  log.debug({ sessionId, amount, candyBalance: session.candyBalance }, 'bet deducted');
  return { ok: true, candyBalance: session.candyBalance };
}

/**
 * Credit a payout to a session's candy balance, applying the mercy floor.
 * @param {string} sessionId
 * @param {number} payout
 * @returns {number|null} New balance, or null if session not found
 */
export function creditPayout(sessionId, payout) {
  const session = getSession(sessionId);
  if (!session) return null;
  session.candyBalance = Math.max(session.candyBalance + payout, config.mercyBalance);
  log.debug({ sessionId, payout, candyBalance: session.candyBalance }, 'payout credited');
  return session.candyBalance;
}

/**
 * Refund a bet amount to a session's candy balance.
 * @param {string} sessionId
 * @param {number} amount
 * @returns {{ ok: boolean, candyBalance?: number, reason?: string }}
 */
export function refundBet(sessionId, amount) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: 'session_not_found' };
  session.candyBalance += amount;
  log.debug({ sessionId, amount, candyBalance: session.candyBalance }, 'bet refunded');
  return { ok: true, candyBalance: session.candyBalance };
}

/**
 * Get the current candy balance for a session.
 * @param {string} sessionId
 * @returns {number|null}
 */
export function getBalance(sessionId) {
  const session = getSession(sessionId);
  return session ? session.candyBalance : null;
}

/**
 * Resolve every pending bet for a finished race. Credits winners (bet × odds,
 * floored), applies the mercy floor, records the outcome on the session, and
 * clears the bet. Called from the race scheduler at race finish so payouts
 * never depend on the client calling the validate endpoint in time.
 * @param {string} raceId
 * @param {string} winnerId
 * @param {Object<string, number>} odds - monsterId → odds multiplier
 * @returns {number} Number of bets resolved
 */
export function resolveRaceBets(raceId, winnerId, odds) {
  let resolved = 0;
  const now = Date.now();

  for (const [id, session] of sessions) {
    if (now > session.expiresAt) continue;
    const bet = session.currentBet;
    if (!bet || bet.raceId !== raceId) continue;

    const won = bet.monsterId === winnerId;
    const betOdds = odds[bet.monsterId] || 1.5;
    const payout = won ? Math.floor(bet.amount * betOdds) : 0;

    session.candyBalance = Math.max(session.candyBalance + payout, config.mercyBalance);
    session.lastBetResult = {
      raceId,
      monsterId: bet.monsterId,
      amount: bet.amount,
      odds: betOdds,
      won,
      payout,
      resolvedAt: now,
    };
    session.currentBet = null;
    resolved++;

    log.info({ sessionId: id, raceId, won, payout, candyBalance: session.candyBalance }, 'bet resolved at race finish');
  }

  return resolved;
}

/**
 * Get the most recently resolved bet result for a session.
 * @param {string} sessionId
 * @returns {object|null} { raceId, monsterId, amount, odds, won, payout } or null
 */
export function getLastBetResult(sessionId) {
  const session = getSession(sessionId);
  return session ? (session.lastBetResult ?? null) : null;
}

/**
 * Get count of active sessions (for debugging/monitoring).
 * Cleanup is handled by the background interval, not here.
 * @returns {number}
 */
export function getActiveSessions() {
  return sessions.size;
}

/**
 * Associate a WebSocket connection with a session (Phase 2)
 * @param {string} sessionId
 * @param {object} wsConnection
 * @returns {boolean} Success
 */
export function setWebSocketConnection(sessionId, wsConnection) {
  const session = getSession(sessionId);

  if (!session) {
    return false;
  }

  session.wsConnection = wsConnection;
  log.debug({ sessionId }, 'websocket associated with session');

  return true;
}

/**
 * Get all sessions with WebSocket connections (for broadcasting)
 * @returns {Array} Array of { sessionId, wsConnection } objects
 */
export function getAllConnectedSessions() {
  const connected = [];

  for (const [id, session] of sessions.entries()) {
    if (session.wsConnection) {
      connected.push({
        sessionId: id,
        wsConnection: session.wsConnection,
      });
    }
  }

  return connected;
}
