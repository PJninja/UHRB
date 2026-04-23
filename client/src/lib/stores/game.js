// Game state store (refactored for server synchronization)
import { writable, derived, get } from 'svelte/store';
import { persistedStore } from './persistence.js';
import { placeBet as apiBet } from '../services/api.js';
import { sessionId } from './session.js';

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
    // Sync to server
    await apiBet(raceState.raceId, session, monsterId, amount);
  } catch (error) {
    // Rollback on error
    console.error('Server bet failed:', error);
    clearBet();
    throw error;
  }
}

/**
 * Clear current bet
 */
export function clearBet() {
  gameState.update(state => ({
    ...state,
    currentBet: null,
  }));
}

/**
 * Update candies after race (handles win/loss)
 * @param {number} payout - Payout amount (0 if lost)
 */
export function updateCandies(payout) {
  gameState.update(state => {
    let newCandies = state.candies;

    if (state.currentBet) {
      // Deduct bet
      newCandies -= state.currentBet.amount;
      // Add payout
      newCandies += payout;
    }

    // Bankruptcy protection
    const MERCY_CANDIES = 10;
    if (newCandies <= 0) {
      newCandies = MERCY_CANDIES;
      console.log('Mercy candies! The void takes pity on you.');
    }

    return {
      ...state,
      candies: newCandies,
      currentBet: null,
    };
  });
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
