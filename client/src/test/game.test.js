import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { serverRaceState, updateServerRaceState, gameState } from '../../src/lib/stores/game.js';

function makeRaceData(overrides = {}) {
  return {
    raceId: 'race-1',
    monsters: [],
    nextRaceTime: Date.now() + 10000,
    state: 'waiting',
    odds: {},
    betTotals: {},
    timeRemaining: 10,
    winner: null,
    rankings: [],
    events: null,
    venue: null,
    raceDuration: null,
    raceStartedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  gameState.set({ candies: 100, currentBet: null });
});

describe('updateServerRaceState — venue field', () => {
  it('defaults venue to null when the payload has none', () => {
    updateServerRaceState(makeRaceData());
    expect(get(serverRaceState).venue).toBeNull();
  });

  it('propagates the venue object from the payload into the store', () => {
    const venue = { id: 'sunken-amphitheater', name: 'The Sunken Amphitheater', flavorLine: '...', accent: '#5a4a7e', backdrop: 'ruins' };
    updateServerRaceState(makeRaceData({ venue }));
    expect(get(serverRaceState).venue).toEqual(venue);
  });
});
