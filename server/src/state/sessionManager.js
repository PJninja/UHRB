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
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(id);
  }
}, 60 * 60 * 1000); // every hour

/**
 * Create a new anonymous session
 * @param {number} [claimedBalance] - Optional balance hint from client localStorage fallback
 * @returns {object} Session object with id, expiry, and starting balance
 */
export function createSession(claimedBalance) {
  const sessionId = `session_${nanoid()}`;
  const now = Date.now();

  const validClaim = Number.isFinite(claimedBalance) && claimedBalance > 0;
  const candyBalance = validClaim
    ? Math.min(Math.floor(claimedBalance), config.maxClaimedBalance)
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
 * Get the current candy balance for a session.
 * @param {string} sessionId
 * @returns {number|null}
 */
export function getBalance(sessionId) {
  const session = getSession(sessionId);
  return session ? session.candyBalance : null;
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
