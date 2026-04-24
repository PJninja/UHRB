// Race lifecycle scheduler - manages the automatic race timer and simulation
import { nanoid } from 'nanoid';
import { setSeed, resetSeed, randomInt } from '../utils/random.js';
import { config } from '../config.js';
import { generateRaceMonsters } from './monsterGenerator.js';
import { simulateRace, calculateOdds } from './raceSimulator.js';
import { broadcast } from './broadcaster.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'raceScheduler' });

/**
 * Strip server-only and bio-only fields from a monster before sending to clients.
 * Removes `value` (hidden payout modifier), bio prose fields (fetched on demand via
 * GET /api/monster/:id), and marks the returning champion.
 * @param {object} monster
 * @param {boolean} isChampion
 */
export function sanitizeMonster(monster, isChampion = false) {
  const { value, ...visibleTraits } = monster.traits;
  // value 1–20 = favor 1 (Despised/underdog = higher payout), value 81–100 = favor 5 (Beloved/crowd favourite = lower payout).
  // High favor = crowd expects them to win = lower payout. Low favor = underdog = higher payout.
  const audienceFavor = Math.min(5, Math.ceil(value / 20));
  const { description, blurb, height, weight, features, ...rest } = monster;
  return { ...rest, traits: visibleTraits, isReturningChampion: isChampion, audienceFavor };
}

export function racePayload(race) {
  return {
    raceId: race.id,
    monsters: race.monsters.map(m =>
      sanitizeMonster(m, previousWinner?.id === m.id)
    ),
    nextRaceTime: race.nextRaceTime,
    state: race.state,
    odds: race.odds,
    betTotals: race.betTotals,
    // Sent once racing begins so the client animation uses the same duration and
    // can fast-forward to the correct progress when joining mid-race.
    raceDuration: race.raceDuration || null,
    raceStartedAt: race.raceStartedAt || null,
    // Included once the race is running so the client can drive visuals correctly.
    // Betting is closed by then, so revealing the winner early has no gameplay impact.
    winner: race.winner ? sanitizeMonster(race.winner, previousWinner?.id === race.winner.id) : null,
    rankings: race.rankings
      ? race.rankings.map(r => ({
          position: r.position,
          monster: sanitizeMonster(r.monster, previousWinner?.id === r.monster.id),
        }))
      : [],
  };
}

// Global race state
let currentRace = {
  id: null,
  monsters: [],
  nextRaceTime: null,
  state: 'waiting', // 'waiting' | 'closed' | 'racing' | 'finished'
  raceStartedAt: null,
  raceDuration: null,
  winner: null,
  rankings: [],
  odds: {},
  betTotals: {}, // Track total candies bet on each monster { monsterId: totalAmount }
  bettingClosed: false,
};

let previousMonsters = [];
let previousWinner = null;
let raceTimeout = null;
let timerInterval = null;
let betBroadcastTimeout = null;

/**
 * Get current race state (for API responses)
 * @returns {object} Current race object
 */
export function getCurrentRace() {
  return {
    ...currentRace,
    timeRemaining: currentRace.nextRaceTime
      ? Math.max(0, Math.floor((currentRace.nextRaceTime - Date.now()) / 1000))
      : 0,
  };
}

/**
 * Schedule the next race
 * Generates new monsters, sets timer, and schedules auto-start
 */
export function scheduleNextRace() {
  log.info('scheduling next race');

  // Reset RNG to use Math.random for non-deterministic timing
  resetSeed();

  // Generate race ID and seed for deterministic monster generation
  const raceId = nanoid();
  const raceSeed = `${raceId}-${Date.now()}`;

  // Set seed for deterministic monster generation
  setSeed(raceSeed);

  // Generate monsters: winner always returns, 20% chance others do too
  const monsters = generateRaceMonsters(null, previousMonsters, previousWinner);
  previousMonsters = monsters;

  // Calculate odds based on visible stats
  const odds = calculateOdds(monsters);

  // Reset seed after monster generation
  resetSeed();

  const delay = randomInt(config.raceIntervalMin, config.raceIntervalMax);
  const nextRaceTime = Date.now() + delay;

  // Initialize bet totals for each monster
  const betTotals = {};
  monsters.forEach(monster => {
    betTotals[monster.id] = 0;
  });

  // Update race state
  currentRace = {
    id: raceId,
    monsters,
    nextRaceTime,
    state: 'waiting',
    raceStartedAt: null,
    raceDuration: null,
    winner: null,
    rankings: [],
    odds,
    betTotals,
  };

  log.info({ raceId, delayMs: delay, monsterCount: monsters.length }, 'race scheduled');
  broadcast('race:update', racePayload(currentRace));

  // Clear existing timers
  if (raceTimeout) clearTimeout(raceTimeout);
  if (timerInterval) clearInterval(timerInterval);

  setTimeout(() => {
    closeBetting();
  }, Math.max(0, delay - config.bettingCloseBeforeMs));

  // Auto-start race when timer expires
  raceTimeout = setTimeout(() => {
    startRace();
  }, delay);

  // Broadcast event will be added in Phase 2 (WebSocket)
  // For now, just return the race state
  return getCurrentRace();
}

/**
 * Close betting window (5s before race starts)
 */
function closeBetting() {
  if (currentRace.state === 'waiting') {
    log.info({ raceId: currentRace.id }, 'betting closed');
    currentRace.state = 'closed';
    broadcast('race:update', racePayload(currentRace));
  }
}

/**
 * Start the race (called automatically when timer expires)
 */
export function startRace() {
  log.info({ raceId: currentRace.id }, 'race starting');

  // Clear timers
  if (timerInterval) clearInterval(timerInterval);
  if (raceTimeout) clearTimeout(raceTimeout);

  // Set seed for deterministic race simulation
  const raceSeed = `${currentRace.id}-race`;
  setSeed(raceSeed);

  const raceDuration = randomInt(config.raceDurationMin, config.raceDurationMax);

  // Run race simulation
  const raceResult = simulateRace(currentRace.monsters, raceDuration);

  // Reset seed
  resetSeed();

  // Update race state
  currentRace.state = 'racing';
  currentRace.raceStartedAt = Date.now();
  currentRace.raceDuration = raceDuration;
  currentRace.winner = raceResult.winner;
  currentRace.rankings = raceResult.rankings;

  log.info({ raceId: currentRace.id, durationMs: raceDuration, winner: raceResult.winner.name }, 'race started');

  broadcast('race:update', racePayload(currentRace));

  // Schedule race finish
  setTimeout(() => {
    finishRace();
  }, raceDuration);
}

/**
 * Finish the race and schedule next one
 */
export function finishRace() {
  log.info({ raceId: currentRace.id, winner: currentRace.winner.name }, 'race finished');

  currentRace.state = 'finished';
  previousWinner = currentRace.winner?.isLegendary ? null : currentRace.winner;

  broadcast('race:update', racePayload(currentRace));

  // Schedule next race after a brief cooldown (5 seconds)
  setTimeout(() => {
    scheduleNextRace();
  }, 5000);
}

/**
 * Update bet totals when a bet is placed
 * @param {string} monsterId - ID of the monster bet on
 * @param {number} amount - Amount of candies bet
 */
export function addBetToTotal(monsterId, amount) {
  if (currentRace.betTotals[monsterId] !== undefined) {
    currentRace.betTotals[monsterId] += amount;
    log.debug({ monsterId, total: currentRace.betTotals[monsterId] }, 'bet total updated');
    // Debounce: coalesce rapid bets into a single broadcast rather than one per bet.
    clearTimeout(betBroadcastTimeout);
    betBroadcastTimeout = setTimeout(() => {
      broadcast('race:update', racePayload(currentRace));
    }, 300);
  }
}

/**
 * Immediately advance the race to the next phase (test mode only).
 * waiting/closed → racing → finished → waiting
 */
export function forceAdvance() {
  if (currentRace.state === 'waiting' || currentRace.state === 'closed') startRace();
  else if (currentRace.state === 'racing') finishRace();
  else if (currentRace.state === 'finished') scheduleNextRace();
}

/**
 * Initialize the race scheduler (call on server startup)
 */
export function initializeScheduler() {
  log.info('race scheduler initialised');
  scheduleNextRace();
}

/**
 * Get time remaining until next race
 * @returns {number} Seconds remaining
 */
export function getTimeRemaining() {
  if (!currentRace.nextRaceTime) return 0;
  return Math.max(0, Math.floor((currentRace.nextRaceTime - Date.now()) / 1000));
}

/**
 * Validate if betting is allowed for current race
 * @returns {boolean}
 */
export function isBettingAllowed() {
  return currentRace.state === 'waiting';
}
