// Payout validation service (anti-cheat)
import { getCurrentRace } from './raceScheduler.js';
import { getCurrentBet } from '../state/sessionManager.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'payoutValidator' });

/**
 * Validate a payout claim and calculate the actual payout
 * This prevents clients from manipulating bet amounts or odds
 *
 * @param {string} sessionId - Session ID
 * @param {object} claimedBet - Bet data from client (for validation only)
 * @returns {object} Validation result
 */
export function validatePayout(sessionId, claimedBet) {
  // Get the current race (source of truth for winner/odds)
  const race = getCurrentRace();

  // Get the actual bet from server storage (source of truth for bet amount)
  const actualBet = getCurrentBet(sessionId);

  // Validation result object
  const result = {
    valid: false,
    won: false,
    winner: null,
    rankings: [],
    odds: 0,
    payout: 0,
    error: null,
  };

  // Check if race is finished
  if (race.state !== 'finished') {
    result.error = 'Race not finished yet';
    return result;
  }

  // Check if user actually placed a bet
  if (!actualBet) {
    result.error = 'No bet placed';
    result.valid = true; // Valid response, just no bet
    result.winner = race.winner;
    result.rankings = race.rankings || [];
    return result;
  }

  // Check if bet was for this race
  if (actualBet.raceId !== race.id) {
    result.error = 'Bet was for a different race';
    result.valid = true;
    result.winner = race.winner;
    result.rankings = race.rankings || [];
    return result;
  }

  // Verify the claimed bet matches the server's record (anti-cheat)
  if (claimedBet) {
    if (claimedBet.monsterId !== actualBet.monsterId) {
      log.warn({ sessionId, claimed: claimedBet.monsterId, actual: actualBet.monsterId }, 'bet monsterId mismatch');
      // Don't return error, just use server's version
    }

    if (claimedBet.amount !== actualBet.amount) {
      log.warn({ sessionId, claimed: claimedBet.amount, actual: actualBet.amount }, 'bet amount mismatch');
      // Don't return error, just use server's version
    }
  }

  // Check if user won
  const won = actualBet.monsterId === race.winner.id;

  // Payout = bet × odds. Value is already baked into the odds (70% weight),
  // so no separate multiplier is needed here.
  let payout = 0;
  if (won) {
    const odds = race.odds[actualBet.monsterId] || 1.5;
    payout = Math.floor(actualBet.amount * odds);
  }

  log.info({ sessionId, won, betAmount: actualBet.amount, monsterId: actualBet.monsterId, payout }, 'payout validated');

  result.valid = true;
  result.won = won;
  result.winner = race.winner;
  result.rankings = race.rankings || [];
  result.odds = race.odds[actualBet.monsterId] || 0;
  result.payout = payout;
  result.bet = actualBet; // Return the server's version of the bet

  return result;
}
