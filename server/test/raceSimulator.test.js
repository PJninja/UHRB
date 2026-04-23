import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setSeed, resetSeed } from '../src/utils/random.js';
import { simulateRace, calculateOdds } from '../src/services/raceSimulator.js';

function makeMonster(overrides = {}) {
  return {
    id: overrides.id ?? 'monster-1',
    name: overrides.name ?? 'Test Horror',
    isLegendary: overrides.isLegendary ?? false,
    traits: {
      speed: 5, endurance: 5, madness: 5, strength: 5, luck: 5, value: 50,
      ...(overrides.traits ?? {}),
    },
  };
}

beforeEach(() => setSeed('race-test'));
afterEach(() => resetSeed());

// ─── calculateOdds ────────────────────────────────────────────────────────────

describe('calculateOdds', () => {
  it('returns an odds entry for every monster', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })];
    const odds = calculateOdds(monsters);
    expect(Object.keys(odds)).toHaveLength(2);
    expect(odds).toHaveProperty('a');
    expect(odds).toHaveProperty('b');
  });

  it('all odds are within [1.5, 10.0]', () => {
    const monsters = [
      makeMonster({ id: 'a', traits: { speed: 10, endurance: 10, strength: 10, luck: 10, madness: 1, value: 1 } }),
      makeMonster({ id: 'b', traits: { speed: 1, endurance: 1, strength: 1, luck: 1, madness: 1, value: 100 } }),
      makeMonster({ id: 'c' }),
    ];
    const odds = calculateOdds(monsters);
    Object.values(odds).forEach(o => {
      expect(o).toBeGreaterThanOrEqual(1.5);
      expect(o).toBeLessThanOrEqual(10);
    });
  });

  it('high-value monster has higher odds than low-value monster with equal stats', () => {
    const monsters = [
      makeMonster({ id: 'high', traits: { speed: 5, endurance: 5, strength: 5, luck: 5, madness: 5, value: 95 } }),
      makeMonster({ id: 'low',  traits: { speed: 5, endurance: 5, strength: 5, luck: 5, madness: 5, value: 5 } }),
    ];
    const odds = calculateOdds(monsters);
    expect(odds['high']).toBeGreaterThan(odds['low']);
  });

  it('legendary monster is capped at 2.0×', () => {
    const monsters = [
      makeMonster({ id: 'legend', isLegendary: true, traits: { speed: 1, endurance: 1, strength: 1, luck: 1, madness: 1, value: 1 } }),
      makeMonster({ id: 'normal' }),
    ];
    const odds = calculateOdds(monsters);
    expect(odds['legend']).toBeLessThanOrEqual(2.0);
  });

  it('non-legendary monsters get a boost when a legendary is in the race', () => {
    const withLegendary = [
      makeMonster({ id: 'legend', isLegendary: true }),
      makeMonster({ id: 'rival' }),
    ];
    const withoutLegendary = [
      makeMonster({ id: 'sole' }),
      makeMonster({ id: 'rival' }),
    ];
    const oddsWithLegend = calculateOdds(withLegendary);
    const oddsWithout = calculateOdds(withoutLegendary);
    expect(oddsWithLegend['rival']).toBeGreaterThan(oddsWithout['rival']);
  });

  it('identical monsters produce equal odds', () => {
    const monsters = [
      makeMonster({ id: 'a' }),
      makeMonster({ id: 'b' }),
      makeMonster({ id: 'c' }),
    ];
    const odds = calculateOdds(monsters);
    expect(odds['a']).toBe(odds['b']);
    expect(odds['b']).toBe(odds['c']);
  });

  it('rounds to 2 decimal places', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })];
    const odds = calculateOdds(monsters);
    Object.values(odds).forEach(o => {
      expect(o).toBe(Math.round(o * 100) / 100);
    });
  });
});

// ─── simulateRace ─────────────────────────────────────────────────────────────

describe('simulateRace', () => {
  it('returns winner, rankings, frames and duration', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })];
    const result = simulateRace(monsters, 1000);
    expect(result).toHaveProperty('winner');
    expect(result).toHaveProperty('rankings');
    expect(result).toHaveProperty('frames');
    expect(result).toHaveProperty('duration', 1000);
  });

  it('rankings length matches monster count', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' }), makeMonster({ id: 'c' })];
    const { rankings } = simulateRace(monsters, 2000);
    expect(rankings).toHaveLength(3);
  });

  it('winner is the first-place monster in rankings', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })];
    const { winner, rankings } = simulateRace(monsters, 1000);
    expect(rankings[0].monster.id).toBe(winner.id);
  });

  it('rankings are ordered by finalPosition ascending', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' }), makeMonster({ id: 'c' })];
    const { rankings } = simulateRace(monsters, 1000);
    rankings.forEach((r, i) => expect(r.position).toBe(i + 1));
  });

  it('generates correct number of frames for duration at 60fps', () => {
    const duration = 2000;
    const { frames } = simulateRace([makeMonster({ id: 'a' }), makeMonster({ id: 'b' })], duration);
    const expectedFrames = Math.floor((duration / 1000) * 60) + 1;
    expect(frames).toHaveLength(expectedFrames);
  });

  it('all positions stay within [0, 100]', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' }), makeMonster({ id: 'c' })];
    const { frames } = simulateRace(monsters, 1000);
    for (const frame of frames) {
      for (const entry of Object.values(frame.positions)) {
        expect(entry.position).toBeGreaterThanOrEqual(0);
        expect(entry.position).toBeLessThanOrEqual(100);
      }
    }
  });

  it('produces deterministic results with the same seed', () => {
    const monsters = [makeMonster({ id: 'a' }), makeMonster({ id: 'b' })];
    setSeed('deterministic');
    const first = simulateRace(monsters, 1000);
    setSeed('deterministic');
    const second = simulateRace(monsters, 1000);
    expect(first.winner.id).toBe(second.winner.id);
    expect(first.rankings.map(r => r.monster.id)).toEqual(second.rankings.map(r => r.monster.id));
  });

  it('statistically dominant monster wins more often', () => {
    const strong = makeMonster({ id: 'strong', traits: { speed: 10, endurance: 10, strength: 10, luck: 10, madness: 1, value: 50 } });
    const weak   = makeMonster({ id: 'weak',   traits: { speed: 1,  endurance: 1,  strength: 1,  luck: 1,  madness: 1, value: 50 } });
    let strongWins = 0;
    for (let i = 0; i < 50; i++) {
      setSeed(`trial-${i}`);
      const { winner } = simulateRace([strong, weak], 1000);
      if (winner.id === 'strong') strongWins++;
    }
    expect(strongWins).toBeGreaterThan(35);
  });
});
