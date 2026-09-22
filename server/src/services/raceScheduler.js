// Race lifecycle scheduler - manages the automatic race timer and simulation
import { nanoid } from 'nanoid';
import { setSeed, resetSeed, randomInt, rollChance } from '../utils/random.js';
import { config } from '../config.js';
import { generateRaceMonsters } from './monsterGenerator.js';
import { simulateRace, calculateOdds } from './raceSimulator.js';
import { broadcast } from './broadcaster.js';
import { resolveRaceBets } from '../state/sessionManager.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'raceScheduler' });

/**
 * Strip server-only and bio-only fields from a monster before sending to clients.
 * Removes `value` (hidden payout modifier), bio prose fields (fetched on demand via
 * GET /api/monster/:id), and marks the returning champion.
 * @param {object} monster
 * @param {boolean} isChampion
 */
export function sanitizeMonster(monster, isChampion = monster.isReturningChampion ?? false) {
  const { value, ...visibleTraits } = monster.traits;
  // value 1–20 = favor 1 (Despised/underdog = higher payout), value 81–100 = favor 5 (Beloved/crowd favourite = lower payout).
  // High favor = crowd expects them to win = lower payout. Low favor = underdog = higher payout.
  const audienceFavor = Math.min(5, Math.ceil(value / 20));
  const { description, blurb, height, weight, features, ...rest } = monster;
  return {
    ...rest,
    traits: visibleTraits,
    statVisibility: monster.statVisibility,
    isReturningChampion: isChampion,
    audienceFavor,
  };
}

export function racePayload(race) {
  return {
    raceId: race.id,
    monsters: race.monsters.map(m => sanitizeMonster(m)),
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
    winner: race.winner ? sanitizeMonster(race.winner) : null,
    rankings: race.rankings
      ? race.rankings.map(r => ({
          position: r.position,
          monster: sanitizeMonster(r.monster),
        }))
      : [],
    // Rare guaranteed-margin events, mirroring winner/rankings' reveal timing —
    // only populated once racing (after betting has closed).
    events: race.events || null,
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
  events: null,
  odds: {},
  betTotals: {}, // Track total candies bet on each monster { monsterId: totalAmount }
  bettingClosed: false,
};

let previousMonsters = [];
let previousWinner = null;
let lastFinishedRace = null;
let raceTimeout = null;         // waiting → racing
let closeBettingTimeout = null; // waiting → closed
let finishTimeout = null;       // racing  → finished
let nextRaceTimeout = null;     // finished → next schedule
let timerInterval = null;
let betBroadcastTimeout = null;
let phantomBetTimeouts = [];    // staggered ambient "crowd" bet chunks for the current race

/**
 * Cancel every pending lifecycle timer. Called whenever a phase transition
 * happens so a stale timer from a superseded phase can never fire against
 * the wrong race (e.g. a leftover finish timer finishing the *next* race).
 */
function clearLifecycleTimers() {
  if (raceTimeout)         { clearTimeout(raceTimeout);         raceTimeout = null; }
  if (closeBettingTimeout) { clearTimeout(closeBettingTimeout); closeBettingTimeout = null; }
  if (finishTimeout)       { clearTimeout(finishTimeout);       finishTimeout = null; }
  if (nextRaceTimeout)     { clearTimeout(nextRaceTimeout);     nextRaceTimeout = null; }
  if (timerInterval)       { clearInterval(timerInterval);      timerInterval = null; }
  phantomBetTimeouts.forEach(clearTimeout);
  phantomBetTimeouts = [];
}

/**
 * Audience favor tier (1-5) for a monster, mirroring sanitizeMonster's bucketing
 * of the hidden `value` stat. Used internally to pick crowd favorites — never sent to clients.
 * @param {object} monster
 */
function favorOf(monster) {
  return Math.min(5, Math.ceil(monster.traits.value / 20));
}

/**
 * Every monster sharing the race's highest audience-favor tier (usually one,
 * but ties are possible since favor buckets a 1-100 value into 5 tiers).
 * @param {object[]} monsters
 * @returns {object[]}
 */
function pickCrowdFavorites(monsters) {
  const maxFavor = Math.max(...monsters.map(favorOf));
  return monsters.filter(m => favorOf(m) === maxFavor);
}

/**
 * Split `total` into `count` positive integer chunks that sum exactly to `total`.
 * @param {number} total
 * @param {number} count
 * @returns {number[]}
 */
function splitIntoChunks(total, count) {
  const chunks = [];
  let remaining = total;
  for (let i = 0; i < count; i++) {
    const chunksLeftAfterThis = count - i - 1;
    if (chunksLeftAfterThis === 0) {
      chunks.push(remaining);
    } else {
      const amount = randomInt(1, Math.max(1, remaining - chunksLeftAfterThis));
      chunks.push(amount);
      remaining -= amount;
    }
  }
  return chunks;
}

/**
 * Schedule ambient "crowd" bets on every crowd-favorite horror in the race.
 * Purely cosmetic — applied through the same addBetToTotal() path a real bet
 * uses, so it gets the existing debounced broadcast for free and never touches
 * odds/payout. Each favorite independently has a phantomBetSkipChance% chance
 * of getting nothing at all; otherwise it gets its own 10-300 candy total,
 * delivered as several staggered chunks across the betting window.
 * @param {string} raceId
 * @param {object[]} monsters
 * @param {number} delayMs - ms until the race auto-starts (the betting window length)
 */
function scheduleCrowdFavoriteBets(raceId, monsters, delayMs) {
  const favorites = pickCrowdFavorites(monsters);
  const maxDelayWindow = Math.max(0, delayMs - config.bettingCloseBeforeMs);

  favorites.forEach(monster => {
    // Rolled independently per favorite, so a tie doesn't always light up every
    // horror sharing the top tier — one can go quiet while the other draws money.
    if (rollChance(config.phantomBetSkipChance)) {
      log.debug({ raceId, monsterId: monster.id }, 'crowd favorite bet skipped');
      return;
    }

    const total = randomInt(config.phantomBetMin, config.phantomBetMax);
    const chunkCount = randomInt(config.phantomBetChunksMin, config.phantomBetChunksMax);
    const chunks = splitIntoChunks(total, chunkCount);

    log.info({ raceId, monsterId: monster.id, total, chunkCount }, 'crowd favorite bet scheduled');

    chunks.forEach(amount => {
      const fireAt = randomInt(0, maxDelayWindow);
      const timeout = setTimeout(() => {
        if (currentRace.id !== raceId) return; // stale — race moved on before this chunk fired
        addBetToTotal(monster.id, amount);
        log.debug({ raceId, monsterId: monster.id, amount }, 'phantom bet chunk applied');
      }, fireAt);
      phantomBetTimeouts.push(timeout);
    });
  });
}

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

export function getLastFinishedRace() {
  return lastFinishedRace;
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

  // Generate monsters: winner always returns, 20% chance others do too.
  // Stamp isReturningChampion here while previousWinner still refers to the
  // prior race's winner — finishRace updates previousWinner after this point.
  const monsters = generateRaceMonsters(null, previousMonsters, previousWinner);
  monsters.forEach(m => { m.isReturningChampion = previousWinner?.id === m.id; });
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
    events: null,
    odds,
    betTotals,
  };

  log.info({ raceId, delayMs: delay, monsterCount: monsters.length }, 'race scheduled');
  broadcast('race:update', racePayload(currentRace));

  // Replace any timers from the previous race before arming new ones
  clearLifecycleTimers();

  closeBettingTimeout = setTimeout(() => {
    closeBetting();
  }, Math.max(0, delay - config.bettingCloseBeforeMs));

  // Auto-start race when timer expires
  raceTimeout = setTimeout(() => {
    startRace();
  }, delay);

  scheduleCrowdFavoriteBets(raceId, monsters, delay);

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
  // Guard against stale timers / double invocation — only a waiting or closed
  // race can start. Anything else means this call belongs to a superseded race.
  if (currentRace.state !== 'waiting' && currentRace.state !== 'closed') {
    log.warn({ raceId: currentRace.id, state: currentRace.state }, 'startRace ignored — race not in startable state');
    return;
  }

  log.info({ raceId: currentRace.id }, 'race starting');

  clearLifecycleTimers();

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
  currentRace.events = raceResult.events;

  log.info({ raceId: currentRace.id, durationMs: raceDuration, winner: raceResult.winner.name }, 'race started');

  broadcast('race:update', racePayload(currentRace));

  // Schedule race finish
  finishTimeout = setTimeout(() => {
    finishRace();
  }, raceDuration);
}

/**
 * Finish the race and schedule next one
 */
export function finishRace() {
  // Guard against stale timers / double invocation — only a racing race can
  // finish. A duplicate call would resolve bets and reschedule a second time.
  if (currentRace.state !== 'racing') {
    log.warn({ raceId: currentRace.id, state: currentRace.state }, 'finishRace ignored — race not racing');
    return;
  }

  log.info({ raceId: currentRace.id, winner: currentRace.winner.name }, 'race finished');

  clearLifecycleTimers();

  lastFinishedRace = null; // clear previous before setting new
  currentRace.state = 'finished';
  lastFinishedRace = currentRace;
  previousWinner = currentRace.winner?.isLegendary ? null : currentRace.winner;

  // Resolve all pending bets server-side immediately. Payouts must never depend
  // on the client calling the validate endpoint while the race is still retrievable.
  const resolved = resolveRaceBets(currentRace.id, currentRace.winner.id, currentRace.odds);
  if (resolved > 0) log.info({ raceId: currentRace.id, resolved }, 'bets resolved');

  broadcast('race:update', racePayload(currentRace));

  // Schedule next race after a brief cooldown (5 seconds)
  nextRaceTimeout = setTimeout(() => {
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
 * Decrement the bet total for a specific monster (when bet is canceled)
 * @param {string} monsterId
 * @param {number} amount
 */
export function decrementBetTotal(monsterId, amount) {
  if (!currentRace || !currentRace.betTotals) return;
  currentRace.betTotals[monsterId] = Math.max(0, (currentRace.betTotals[monsterId] || 0) - amount);

  // Debounced broadcast
  clearTimeout(betBroadcastTimeout);
  betBroadcastTimeout = setTimeout(() => {
    broadcast('race:update', racePayload(currentRace));
  }, 300);
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
