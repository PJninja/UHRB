// REST API client for server communication
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Create a new anonymous session
 * @param {{ claimedBalance?: number }} [opts]
 * @returns {Promise<{sessionId: string, expiresAt: number, candyBalance: number}>}
 */
export async function createSession(opts = {}) {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Validate an existing session
 * @param {string} sessionId
 * @returns {Promise<{valid: boolean, session: object}>}
 */
export async function validateSession(sessionId) {
  const response = await fetch(`${API_BASE}/session/${sessionId}/validate`);

  if (!response.ok) {
    throw new Error(`Failed to validate session: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current race state
 * @returns {Promise<{raceId: string, monsters: array, nextRaceTime: number, state: string, odds: object, timeRemaining: number}>}
 */
export async function getCurrentRace() {
  const response = await fetch(`${API_BASE}/race/current`);

  if (!response.ok) {
    throw new Error(`Failed to get current race: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get bio-only fields for a monster in the current race
 * @param {string} monsterId
 * @returns {Promise<{id: string, description: string, blurb: string, height: number, weight: number, features: string}>}
 */
export async function getMonsterBio(monsterId) {
  const response = await fetch(`${API_BASE}/monster/${monsterId}`);

  if (!response.ok) {
    throw new Error(`Failed to get monster bio: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Place a bet on a monster
 * @param {string} raceId
 * @param {string} sessionId
 * @param {string} monsterId
 * @param {number} amount
 * @returns {Promise<{success: boolean, bet: object}>}
 */
export async function placeBet(raceId, sessionId, monsterId, amount) {
  const response = await fetch(`${API_BASE}/race/${raceId}/bet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      monsterId,
      amount,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to place bet: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Validate payout after race finishes (anti-cheat)
 * @param {string} raceId
 * @param {string} sessionId
 * @param {object} bet - { monsterId, amount }
 * @returns {Promise<{valid: boolean, won: boolean, winner: object, odds: number, payout: number, bet: object}>}
 */
export async function validatePayout(raceId, sessionId, bet) {
  const response = await fetch(`${API_BASE}/race/${raceId}/payout/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      bet,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to validate payout: ${response.statusText}`);
  }

  return response.json();
}
