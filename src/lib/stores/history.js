// Race history store
import { writable, derived } from 'svelte/store';
import { persistedStore } from './persistence.js';

// History store - array of past races
export const history = persistedStore('history', []);

/**
 * Add a race to history
 * @param {object} raceData - Race result data
 */
export function addRaceToHistory(raceData) {
  history.update(h => {
    const newHistory = [raceData, ...h];

    // Limit to last 50 races to prevent storage bloat
    if (newHistory.length > 50) {
      return newHistory.slice(0, 50);
    }

    return newHistory;
  });
}

/**
 * Clear all history
 */
export function clearHistory() {
  history.set([]);
}

// Per-monster record: { [monsterId]: { appearances, wins } }
export const monsterHistory = derived(history, $history => {
  const record = {};
  for (const race of $history) {
    for (const monster of (race.monsters || [])) {
      if (!record[monster.id]) record[monster.id] = { appearances: 0, wins: 0 };
      record[monster.id].appearances++;
      if (race.winner?.id === monster.id) record[monster.id].wins++;
    }
  }
  return record;
});

// Race-level statistics — single pass over history for efficiency.
export const historyStats = derived(history, $history => {
  let wins = 0, losses = 0, totalWagered = 0, totalWon = 0;
  let biggestWin = 0, biggestLoss = 0;
  let racesWithBetCount = 0;

  for (const r of $history) {
    if (!r.bet) continue;
    racesWithBetCount++;
    totalWagered += r.bet.amount;
    if (r.won) {
      wins++;
      totalWon += r.payout || 0;
      const profit = (r.payout || 0) - r.bet.amount;
      if (profit > biggestWin) biggestWin = profit;
    } else {
      losses++;
      if (r.bet.amount > biggestLoss) biggestLoss = r.bet.amount;
    }
  }

  return {
    totalRaces: $history.length,
    racesWithBet: racesWithBetCount,
    wins,
    losses,
    winRate: racesWithBetCount > 0 ? (wins / racesWithBetCount * 100).toFixed(1) : 0,
    totalWagered,
    totalWon,
    netProfit: totalWon - totalWagered,
    biggestWin,
    biggestLoss,
  };
});
