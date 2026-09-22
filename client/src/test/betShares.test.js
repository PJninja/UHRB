import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { betShares, updateServerRaceState } from '../lib/stores/game.js';

function makeRaceData(overrides = {}) {
  return {
    raceId: 'race-1',
    monsters: [
      { id: 'monster-a', name: 'Monster A' },
      { id: 'monster-b', name: 'Monster B' },
    ],
    nextRaceTime: Date.now() + 10000,
    state: 'waiting',
    odds: {},
    betTotals: {},
    timeRemaining: 10,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('betShares', () => {
  it('returns 0% for every monster when nobody has bet', () => {
    updateServerRaceState(makeRaceData({ betTotals: { 'monster-a': 0, 'monster-b': 0 } }));
    const shares = get(betShares);
    expect(shares).toEqual([
      { monsterId: 'monster-a', amount: 0, pct: 0 },
      { monsterId: 'monster-b', amount: 0, pct: 0 },
    ]);
  });

  it('gives a single bettor 100% of the pool', () => {
    updateServerRaceState(makeRaceData({ betTotals: { 'monster-a': 50, 'monster-b': 0 } }));
    const shares = get(betShares);
    expect(shares.find(s => s.monsterId === 'monster-a').pct).toBe(1);
    expect(shares.find(s => s.monsterId === 'monster-b').pct).toBe(0);
  });

  it('splits the pool proportionally across multiple monsters', () => {
    updateServerRaceState(makeRaceData({ betTotals: { 'monster-a': 25, 'monster-b': 75 } }));
    const shares = get(betShares);
    expect(shares.find(s => s.monsterId === 'monster-a').pct).toBeCloseTo(0.25);
    expect(shares.find(s => s.monsterId === 'monster-b').pct).toBeCloseTo(0.75);
  });

  it('treats a monster missing from betTotals as a zero bet', () => {
    updateServerRaceState(makeRaceData({ betTotals: { 'monster-a': 40 } }));
    const shares = get(betShares);
    expect(shares.find(s => s.monsterId === 'monster-b').amount).toBe(0);
    expect(shares.find(s => s.monsterId === 'monster-b').pct).toBe(0);
  });

  it('recomputes shares when a new race arrives with a fresh pool', () => {
    updateServerRaceState(makeRaceData({ betTotals: { 'monster-a': 100, 'monster-b': 0 } }));
    expect(get(betShares).find(s => s.monsterId === 'monster-a').pct).toBe(1);

    updateServerRaceState(makeRaceData({ raceId: 'race-2', betTotals: { 'monster-a': 0, 'monster-b': 0 } }));
    const shares = get(betShares);
    expect(shares.every(s => s.pct === 0)).toBe(true);
  });
});
