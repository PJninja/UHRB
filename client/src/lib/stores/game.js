// Game state store (refactored for server synchronization)
import { writable, derived, get } from 'svelte/store';
import { persistedStore } from './persistence.js';
import { placeBet as apiBet, cancelBet as apiCancelBet, validatePayout as apiValidatePayout } from '../services/api.js';
import { sessionId, balanceToken } from './session.js';

// Client-managed game state (candies and current bet)
const initialGameState = {
  candies: 100,
  currentBet: null,  // { raceId, monsterId, amount }
};

// Create persisted store for client state
export const gameState = persistedStore('gameState', initialGameState);

// Server race state (received from polling)
export const serverRaceState = writable({
  raceId: null,
  monsters: [],
  nextRaceTime: null,
  state: 'waiting',  // 'waiting' | 'closed' | 'racing' | 'finished'
  odds: {},
  betTotals: {},  // Total candies bet on each monster
  timeRemaining: 0,
  winner: null,
  rankings: [],
  raceDuration: null,
  raceStartedAt: null,
});

/**
 * Update server race state from polling
 * @param {object} raceData - Race data from server
 */
export function updateServerRaceState(raceData) {
  const state = get(gameState);

  // Auto-clear any stale bet from a previous race when new race data arrives.
  // The server resolved it at race finish — fetch the result so a credited
  // payout reaches the local balance even if the player missed the race page.
  if (state.currentBet && state.currentBet.raceId !== raceData.raceId) {
    const staleBet = state.currentBet;
    gameState.update(s => ({ ...s, currentBet: null }));
    const session = get(sessionId);
    apiValidatePayout(staleBet.raceId, session, staleBet)
      .then(r => {
        if (typeof r.candyBalance === 'number') setCandyBalance(r.candyBalance, r.balanceToken);
      })
      .catch(() => {
        // Server may not know this race anymore — balance syncs on next bet/validate
      });
  }

  serverRaceState.set({
    raceId: raceData.raceId,
    monsters: raceData.monsters,
    nextRaceTime: raceData.nextRaceTime,
    state: raceData.state,
    odds: raceData.odds,
    betTotals: raceData.betTotals || {},
    timeRemaining: raceData.timeRemaining,
    winner: raceData.winner || null,
    rankings: raceData.rankings || [],
    raceDuration: raceData.raceDuration || null,
    raceStartedAt: raceData.raceStartedAt || null,
  });
}

/**
 * Place a bet (calls server API)
 * @param {string} monsterId
 * @param {number} amount
 */
export async function placeBet(monsterId, amount) {
  const state = get(gameState);
  const raceState = get(serverRaceState);
  const session = get(sessionId);

  // Client-side validation
  if (amount < 1 || amount > state.candies) {
    throw new Error('Invalid bet amount');
  }

  if (raceState.state !== 'waiting') {
    throw new Error('Betting is closed');
  }

  if (!session) {
    throw new Error('No session ID');
  }

  // Optimistically update local state
  gameState.update(s => ({
    ...s,
    currentBet: { raceId: raceState.raceId, monsterId, amount },
  }));

  try {
    const response = await apiBet(raceState.raceId, session, monsterId, amount);
    setCandyBalance(response.candyBalance, response.balanceToken);
  } catch (error) {
    console.error('Server bet failed:', error);
    clearBet();
    throw error;
  }
}

/**
 * Clear current bet and refund to balance (calls server)
 */
export async function clearBet() {
  const state = get(gameState);
  const raceState = get(serverRaceState);
  const session = get(sessionId);

  const bet = state.currentBet;

  // If no bet, just clear local state
  if (!bet) {
    gameState.update(s => ({ ...s, currentBet: null }));
    return;
  }

  // If bet is for a different race (stale), clear locally without API call
  if (bet.raceId !== raceState.raceId) {
    gameState.update(s => ({ ...s, currentBet: null }));
    return;
  }

  // Optimistically clear local bet immediately for responsive UI
  gameState.update(s => ({ ...s, currentBet: null }));

  try {
    const response = await apiCancelBet(bet.raceId, session);
    setCandyBalance(response.candyBalance, response.balanceToken);
  } catch (error) {
    console.error('Failed to cancel bet on server:', error);
    // Re-instate the bet if server call failed AND bet is for current race
    const currentRaceState = get(serverRaceState);
    if (currentRaceState.raceId === bet.raceId) {
      gameState.update(s => ({ ...s, currentBet: bet }));
    }
    throw error;
  }
}

/**
 * Overwrite the local candy balance with the server-authoritative value.
 * Also persists the signed token so the next session creation can carry it over.
 * @param {number} balance
 * @param {string} [token] - Server-issued balance token
 */
export function setCandyBalance(balance, token) {
  gameState.update(s => ({ ...s, candies: balance }));
  if (token) balanceToken.set(token);
}

/**
 * Sync candy balance from a server payout response and clear the active bet.
 * @param {number} serverBalance - Authoritative balance returned by the server
 * @param {string} [token] - Server-issued balance token
 */
export function syncBalanceFromPayout(serverBalance, token) {
  gameState.update(s => ({ ...s, candies: serverBalance, currentBet: null }));
  if (token) balanceToken.set(token);
}

/**
 * Reset game to initial state (keeps server state separate)
 */
export function resetGame() {
  gameState.set(initialGameState);
}

// Derived stores for convenience
export const candies = derived(gameState, $state => $state.candies);
export const currentBet = derived(gameState, $state => $state.currentBet);

// Server race state derived stores
export const raceState = derived(serverRaceState, $state => $state.state);
export const nextRaceTime = derived(serverRaceState, $state => $state.nextRaceTime);
export const currentRaceId = derived(serverRaceState, $state => $state.raceId);
