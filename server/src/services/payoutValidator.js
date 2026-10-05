// Payout validation service (anti-cheat)
import { getCurrentRace, getLastFinishedRace } from './raceScheduler.js';
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
  // Prefer the live current race if it's finished; fall back to the last finished race
  // to handle the window where the next race has already been scheduled.
  const livRace = getCurrentRace();
  const race = (livRace.state === 'finished') ? livRace : getLastFinishedRace();

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
    patronOutcome: null,
    error: null,
  };

  // Check if race is finished
  if (!race || race.state !== 'finished') {
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

  // Payout = bet × odds × patron multiplier. Value is already baked into the
  // odds (70% weight); the patron multiplier was locked onto the bet when it
  // was placed — the same value resolveRaceBets reads — so this recompute
  // can never diverge from what was already credited at race finish.
  let payout = 0;
  let patronOutcome = null;
  if (won) {
    const odds = race.odds[actualBet.monsterId] || 1.5;
    const patronMultiplier = actualBet.patronMultiplier ?? 1.0;
    payout = Math.floor(actualBet.amount * odds * patronMultiplier);
    patronOutcome = patronMultiplier > 1 ? 'loyalty' : patronMultiplier < 1 ? 'spite' : null;
  }

  log.info({ sessionId, won, betAmount: actualBet.amount, monsterId: actualBet.monsterId, payout }, 'payout validated');

  result.valid = true;
  result.won = won;
  result.winner = race.winner;
  result.rankings = race.rankings || [];
  result.odds = race.odds[actualBet.monsterId] || 0;
  result.payout = payout;
  result.patronOutcome = patronOutcome;
  result.bet = actualBet; // Return the server's version of the bet

  return result;
}
