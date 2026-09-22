import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
vi.mock('../src/services/broadcaster.js', () => ({ broadcast: vi.fn() }));
vi.mock('../src/state/sessionManager.js', () => ({ resolveRaceBets: vi.fn(() => 0) }));
vi.mock('../src/services/raceSimulator.js', () => ({
  calculateOdds: vi.fn(() => ({})),
  // Never actually reached in these tests (they stop advancing timers before
  // the race auto-starts), but must not blow up if a raceTimeout does fire.
  simulateRace: vi.fn(() => ({ winner: { id: 'x', name: 'x', isLegendary: false }, rankings: [] })),
}));
vi.mock('../src/services/monsterGenerator.js', () => ({
  generateRaceMonsters: vi.fn(),
}));
vi.mock('../src/utils/random.js', () => ({
  setSeed: vi.fn(),
  resetSeed: vi.fn(),
  randomInt: vi.fn(),
  rollChance: vi.fn(),
  selectRandom: vi.fn(arr => arr[0]),
}));

import { generateRaceMonsters } from '../src/services/monsterGenerator.js';
import { randomInt, rollChance, selectRandom } from '../src/utils/random.js';
import { scheduleNextRace, getCurrentRace } from '../src/services/raceScheduler.js';
import { venues } from '../src/data/venueData.js';
import { config } from '../src/config.js';

function makeMonster(id, value) {
  return {
    id,
    name: id,
    traits: { speed: 1, endurance: 1, madness: 1, strength: 1, luck: 1, value },
    isReturningChampion: false,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  randomInt.mockReset();
  // Default: behave like the real randomInt (inclusive range) so tests that
  // don't queue explicit values still get sane, bounded numbers. Tests that
  // need exact control layer mockReturnValueOnce() on top of this.
  randomInt.mockImplementation((min, max) => min + Math.floor(Math.random() * (max - min + 1)));
  rollChance.mockReset();
  // Default: never skip, so tests unrelated to the skip roll stay deterministic.
  rollChance.mockReturnValue(false);
  generateRaceMonsters.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// Advance just far enough to let every phantom-bet chunk land, without
// reaching the race's own auto-start timer (which would otherwise fire
// startRace()/finishRace() and reschedule a second race mid-assertion).
function settlePhantomBets(scheduledRace) {
  const window = Math.max(0, scheduledRace.nextRaceTime - Date.now() - config.bettingCloseBeforeMs);
  vi.advanceTimersByTime(window);
}

describe('crowd favorite phantom bets', () => {
  it('applies a phantom bet only to the single highest-favor horror', () => {
    generateRaceMonsters.mockReturnValue([
      makeMonster('a', 95), // favor 5
      makeMonster('b', 50), // favor 3
      makeMonster('c', 10), // favor 1
    ]);

    settlePhantomBets(scheduleNextRace());

    const race = getCurrentRace();
    expect(race.betTotals.a).toBeGreaterThanOrEqual(config.phantomBetMin);
    expect(race.betTotals.a).toBeLessThanOrEqual(config.phantomBetMax);
    expect(race.betTotals.b).toBe(0);
    expect(race.betTotals.c).toBe(0);
  });

  it('gives every horror tied for the top favor tier its own independent phantom bet', () => {
    generateRaceMonsters.mockReturnValue([
      makeMonster('a', 90), // favor 5
      makeMonster('b', 85), // favor 5 (tied with a)
      makeMonster('c', 40), // favor 2
    ]);

    settlePhantomBets(scheduleNextRace());

    const race = getCurrentRace();
    [race.betTotals.a, race.betTotals.b].forEach(total => {
      expect(total).toBeGreaterThanOrEqual(config.phantomBetMin);
      expect(total).toBeLessThanOrEqual(config.phantomBetMax);
    });
    expect(race.betTotals.c).toBe(0);
  });

  it('falls back to a lower favor tier when no horror reaches favor 5', () => {
    generateRaceMonsters.mockReturnValue([
      makeMonster('a', 65), // favor 4
      makeMonster('b', 70), // favor 4 (tied with a)
      makeMonster('c', 45), // favor 3
    ]);

    settlePhantomBets(scheduleNextRace());

    const race = getCurrentRace();
    [race.betTotals.a, race.betTotals.b].forEach(total => {
      expect(total).toBeGreaterThanOrEqual(config.phantomBetMin);
      expect(total).toBeLessThanOrEqual(config.phantomBetMax);
    });
    expect(race.betTotals.c).toBe(0);
  });

  it('delivers the phantom bet as multiple staggered chunks, not all at once', () => {
    generateRaceMonsters.mockReturnValue([makeMonster('a', 95)]);

    randomInt
      .mockReturnValueOnce(10000) // race delay
      .mockReturnValueOnce(100)   // phantom total
      .mockReturnValueOnce(3)     // chunk count
      .mockReturnValueOnce(40)    // split: chunk 1
      .mockReturnValueOnce(30)    // split: chunk 2 (chunk 3 is the remainder, no call)
      .mockReturnValueOnce(0)     // fireAt: chunk 1
      .mockReturnValueOnce(2000)  // fireAt: chunk 2
      .mockReturnValueOnce(4000); // fireAt: chunk 3

    scheduleNextRace();

    vi.advanceTimersByTime(0);
    expect(getCurrentRace().betTotals.a).toBe(40);

    vi.advanceTimersByTime(2000);
    expect(getCurrentRace().betTotals.a).toBe(70);

    vi.advanceTimersByTime(2000);
    expect(getCurrentRace().betTotals.a).toBe(100);
  });

  it('cancels pending phantom chunks from a superseded race when a new race is scheduled', () => {
    // Race 1: two chunks scheduled late in its window (never allowed to fire).
    generateRaceMonsters.mockReturnValueOnce([makeMonster('shared', 95)]);
    randomInt
      .mockReturnValueOnce(10000) // race 1 delay
      .mockReturnValueOnce(100)   // phantom total
      .mockReturnValueOnce(2)     // chunk count
      .mockReturnValueOnce(50)    // split: chunk 1 (chunk 2 is the remainder)
      .mockReturnValueOnce(9000)  // fireAt: chunk 1
      .mockReturnValueOnce(9500); // fireAt: chunk 2
    scheduleNextRace();

    // Race 2 scheduled immediately after (same monster id, to prove no leakage).
    generateRaceMonsters.mockReturnValueOnce([makeMonster('shared', 95)]);
    randomInt
      .mockReturnValueOnce(10000) // race 2 delay
      .mockReturnValueOnce(60)    // phantom total
      .mockReturnValueOnce(1)     // chunk count (single chunk = the whole total)
      .mockReturnValueOnce(500);  // fireAt: chunk 1
    scheduleNextRace();

    // Stop just short of race 2's own raceTimeout (also armed at 10000ms) so
    // this test stays isolated to the phantom-bet mechanism.
    vi.advanceTimersByTime(9999);

    // If race 1's timers weren't cancelled, this would be 160 (100 + 60).
    expect(getCurrentRace().betTotals.shared).toBe(60);
  });

  it('skips a tied favorite that loses its independent skip roll while the other still gets a bet', () => {
    generateRaceMonsters.mockReturnValue([
      makeMonster('a', 90), // favor 5
      makeMonster('b', 85), // favor 5 (tied with a)
      makeMonster('c', 40), // favor 2, never eligible either way
    ]);
    // pickCrowdFavorites preserves array order, so the first roll is for 'a', second for 'b'.
    rollChance.mockReturnValueOnce(true).mockReturnValueOnce(false);

    settlePhantomBets(scheduleNextRace());

    const race = getCurrentRace();
    expect(race.betTotals.a).toBe(0); // skipped by its roll
    expect(race.betTotals.b).toBeGreaterThanOrEqual(config.phantomBetMin);
    expect(race.betTotals.b).toBeLessThanOrEqual(config.phantomBetMax);
    expect(race.betTotals.c).toBe(0);
  });

  it('rolls the skip chance independently, so the other tied favorite can be the one skipped instead', () => {
    generateRaceMonsters.mockReturnValue([
      makeMonster('a', 90), // favor 5
      makeMonster('b', 85), // favor 5 (tied with a)
    ]);
    rollChance.mockReturnValueOnce(false).mockReturnValueOnce(true);

    settlePhantomBets(scheduleNextRace());

    const race = getCurrentRace();
    expect(race.betTotals.a).toBeGreaterThanOrEqual(config.phantomBetMin);
    expect(race.betTotals.a).toBeLessThanOrEqual(config.phantomBetMax);
    expect(race.betTotals.b).toBe(0); // skipped by its roll
  });

  it('calls rollChance with the configured skip percentage', () => {
    generateRaceMonsters.mockReturnValue([makeMonster('a', 95)]);

    settlePhantomBets(scheduleNextRace());

    expect(rollChance).toHaveBeenCalledWith(config.phantomBetSkipChance);
  });
});

describe('venues data', () => {
  it('every venue has the required fields', () => {
    venues.forEach(venue => {
      expect(typeof venue.id).toBe('string');
      expect(typeof venue.name).toBe('string');
      expect(typeof venue.flavorLine).toBe('string');
      expect(typeof venue.accent).toBe('string');
      expect(typeof venue.backdrop).toBe('string');
    });
  });
});

describe('race venue', () => {
  it('assigns a venue from the venues list to a newly scheduled race', () => {
    generateRaceMonsters.mockReturnValue([makeMonster('a', 50)]);

    scheduleNextRace();

    const race = getCurrentRace();
    expect(race.venue).toBeTruthy();
    expect(venues.map(v => v.id)).toContain(race.venue.id);
  });

  it('rolls the venue via selectRandom against the full venues list', () => {
    generateRaceMonsters.mockReturnValue([makeMonster('a', 50)]);

    scheduleNextRace();

    expect(selectRandom).toHaveBeenCalledWith(venues);
  });

  it('picks the same venue for the same mocked RNG sequence (determinism)', () => {
    generateRaceMonsters.mockReturnValue([makeMonster('a', 50)]);
    selectRandom.mockReturnValueOnce(venues[3]);

    scheduleNextRace();

    expect(getCurrentRace().venue).toEqual(venues[3]);
  });
});
