// Session management for anonymous players
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';

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
 * @returns {object} Session object with id and expiry
 */
export function createSession() {
  const sessionId = `session_${nanoid()}`;
  const now = Date.now();

  const session = {
    id: sessionId,
    connectedAt: now,
    lastSeen: now,
    expiresAt: now + SESSION_TTL_MS,
    currentBet: null, // { raceId, monsterId, amount }
    wsConnection: null, // Will be set in Phase 2
  };

  sessions.set(sessionId, session);

  log.debug({ sessionId }, 'session created');

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
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
