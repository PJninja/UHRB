import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { history, addRaceToHistory, clearHistory, monsterHistory, historyStats } from '../../src/lib/stores/history.js';

function makeRace(overrides = {}) {
  return {
    raceId: 'race-1',
    monsters: [
      { id: 'monster-a', name: 'Monster A' },
      { id: 'monster-b', name: 'Monster B' },
    ],
    winner: { id: 'monster-a' },
    won: true,
    bet: { amount: 100, monsterId: 'monster-a' },
    payout: 250,
    ...overrides,
  };
}

beforeEach(() => {
  clearHistory();
  localStorage.clear();
});

// ─── monsterHistory ───────────────────────────────────────────────────────────

describe('monsterHistory', () => {
  it('returns an empty object for empty history', () => {
    expect(get(monsterHistory)).toEqual({});
  });

  it('records one appearance per monster in a race', () => {
    addRaceToHistory(makeRace());
    const record = get(monsterHistory);
    expect(record['monster-a'].appearances).toBe(1);
    expect(record['monster-b'].appearances).toBe(1);
  });

  it('accumulates appearances across races', () => {
    addRaceToHistory(makeRace({ raceId: 'race-1' }));
    addRaceToHistory(makeRace({ raceId: 'race-2' }));
    const record = get(monsterHistory);
    expect(record['monster-a'].appearances).toBe(2);
  });

  it('counts wins for the winner only', () => {
    addRaceToHistory(makeRace({ winner: { id: 'monster-a' } }));
    const record = get(monsterHistory);
    expect(record['monster-a'].wins).toBe(1);
    expect(record['monster-b'].wins).toBe(0);
  });

  it('counts zero wins for a monster that never won', () => {
    addRaceToHistory(makeRace({ winner: { id: 'monster-a' } }));
    addRaceToHistory(makeRace({ winner: { id: 'monster-a' } }));
    const record = get(monsterHistory);
    expect(record['monster-b'].wins).toBe(0);
  });

  it('tracks wins across multiple races', () => {
    addRaceToHistory(makeRace({ raceId: 'race-1', winner: { id: 'monster-a' } }));
    addRaceToHistory(makeRace({ raceId: 'race-2', winner: { id: 'monster-b' } }));
    addRaceToHistory(makeRace({ raceId: 'race-3', winner: { id: 'monster-a' } }));
    const record = get(monsterHistory);
    expect(record['monster-a'].wins).toBe(2);
    expect(record['monster-b'].wins).toBe(1);
  });

  it('handles races without monsters gracefully', () => {
    addRaceToHistory({ raceId: 'empty', monsters: null, winner: null });
    expect(() => get(monsterHistory)).not.toThrow();
  });
});

// ─── historyStats ─────────────────────────────────────────────────────────────

describe('historyStats', () => {
  it('returns zeroed stats for empty history', () => {
    const stats = get(historyStats);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.totalWagered).toBe(0);
    expect(stats.totalWon).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.totalRaces).toBe(0);
  });

  it('counts a race without a bet in totalRaces but not racesWithBet', () => {
    addRaceToHistory({ raceId: 'r1', monsters: [], winner: null });
    const stats = get(historyStats);
    expect(stats.totalRaces).toBe(1);
    expect(stats.racesWithBet).toBe(0);
  });

  it('counts wins correctly', () => {
    addRaceToHistory(makeRace({ won: true }));
    addRaceToHistory(makeRace({ raceId: 'r2', won: false, payout: 0 }));
    const stats = get(historyStats);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
  });

  it('sums totalWagered across all bet races', () => {
    addRaceToHistory(makeRace({ bet: { amount: 100, monsterId: 'a' } }));
    addRaceToHistory(makeRace({ raceId: 'r2', bet: { amount: 50, monsterId: 'b' } }));
    expect(get(historyStats).totalWagered).toBe(150);
  });

  it('sums totalWon for winning races', () => {
    addRaceToHistory(makeRace({ won: true, payout: 250 }));
    addRaceToHistory(makeRace({ raceId: 'r2', won: true, payout: 180 }));
    expect(get(historyStats).totalWon).toBe(430);
  });

  it('calculates netProfit as totalWon - totalWagered', () => {
    addRaceToHistory(makeRace({ won: true, bet: { amount: 100, monsterId: 'a' }, payout: 250 }));
    const stats = get(historyStats);
    expect(stats.netProfit).toBe(150); // 250 - 100
  });

  it('win rate is formatted to 1 decimal place as a string', () => {
    addRaceToHistory(makeRace({ won: true }));
    addRaceToHistory(makeRace({ raceId: 'r2', won: false, payout: 0 }));
    const { winRate } = get(historyStats);
    expect(winRate).toBe('50.0');
  });

  it('win rate is 0 (number) when no bets have been placed', () => {
    addRaceToHistory({ raceId: 'r1', monsters: [], winner: null });
    expect(get(historyStats).winRate).toBe(0);
  });

  it('biggestWin is the profit (payout - bet), not the gross payout', () => {
    addRaceToHistory(makeRace({ won: true, bet: { amount: 100, monsterId: 'a' }, payout: 300 }));
    expect(get(historyStats).biggestWin).toBe(200); // 300 - 100
  });

  it('biggestLoss is the bet amount', () => {
    addRaceToHistory(makeRace({ raceId: 'r1', won: false, payout: 0, bet: { amount: 80, monsterId: 'a' } }));
    addRaceToHistory(makeRace({ raceId: 'r2', won: false, payout: 0, bet: { amount: 150, monsterId: 'a' } }));
    expect(get(historyStats).biggestLoss).toBe(150);
  });

  it('handles missing payout field gracefully (treats as 0)', () => {
    addRaceToHistory({ ...makeRace({ won: true }), payout: undefined });
    expect(() => get(historyStats)).not.toThrow();
    expect(get(historyStats).totalWon).toBe(0);
  });

  it('limits history to the last 50 races', () => {
    for (let i = 0; i < 55; i++) {
      addRaceToHistory(makeRace({ raceId: `race-${i}` }));
    }
    expect(get(historyStats).totalRaces).toBe(50);
  });
});
