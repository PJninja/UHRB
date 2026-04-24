#!/usr/bin/env node
/**
 * Bulk race simulator — runs N races without a server.
 *
 * Usage:
 *   node server/scripts/simulate.js [options]
 *
 * Options:
 *   --races  <N>              Number of races to run (default: 100)
 *   --seed   <string>         Base seed for reproducible runs
 *   --format <table|json|csv> Output format (default: table)
 *   --output <filepath>       Write output to file instead of stdout
 *   --quiet                   Suppress per-race output; show only summary
 */

import { simulateRace, calculateOdds } from '../src/services/raceSimulator.js';
import { generateRaceMonsters } from '../src/services/monsterGenerator.js';
import { setSeed, resetSeed } from '../src/utils/random.js';
import { createWriteStream } from 'fs';
import { resolve } from 'path';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};
const has = flag => args.includes(flag);

const RACES    = parseInt(get('--races', '100'), 10);
const BASE_SEED = get('--seed', `sim-${Date.now()}`);
const FORMAT   = get('--format', 'table');
const OUTPUT   = get('--output', null);
const QUIET    = has('--quiet');

// ── Output target ─────────────────────────────────────────────────────────────
const outStream = OUTPUT
  ? createWriteStream(resolve(process.cwd(), OUTPUT), { encoding: 'utf8' })
  : process.stdout;
const print = line => outStream.write(line + '\n');
const printRaw = str => outStream.write(str);

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (str, len) => String(str).padEnd(len);
const lpad = (str, len) => String(str).padStart(len);

function statLine(t) {
  return `SPD:${lpad(t.speed,2)} END:${lpad(t.endurance,2)} STR:${lpad(t.strength,2)} MAD:${lpad(t.madness,2)} LCK:${lpad(t.luck,2)}`;
}

function printRace(raceNum, rankings, odds, winner) {
  const sep = '─'.repeat(52);
  print(`\nRace ${raceNum} ${sep}`);
  for (const { position, monster: m } of rankings) {
    const oddsVal = odds[m.id] ? `${odds[m.id].toFixed(2)}×` : '?×';
    const legend  = m.isLegendary ? ' ★' : '';
    print(`  #${position}  ${pad(m.name + legend, 34)} ${statLine(m.traits)}  odds:${lpad(oddsVal,6)}`);
  }
  print(`\n  Winner: ${winner.name}${winner.isLegendary ? ' ★' : ''}`);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
const allResults = [];
const winCounts  = {};
const appCounts  = {};
let   prevWinner = null;
let   prevMonsters = null;
let   totalWinnerOdds = 0;

for (let i = 1; i <= RACES; i++) {
  const raceSeed = `${BASE_SEED}-race-${i}`;
  setSeed(raceSeed);

  const monsters = generateRaceMonsters(null, prevMonsters, prevWinner);
  const odds   = calculateOdds(monsters);
  const result = simulateRace(monsters);
  resetSeed();

  const { winner, rankings } = result;

  // Tally stats
  winCounts[winner.name] = (winCounts[winner.name] ?? 0) + 1;
  for (const { monster: m } of rankings) {
    appCounts[m.name] = (appCounts[m.name] ?? 0) + 1;
  }
  totalWinnerOdds += odds[winner.id] ?? 1;

  const row = {
    race: i,
    seed: raceSeed,
    winner: winner.name,
    winnerLegendary: winner.isLegendary ?? false,
    winnerOdds: odds[winner.id] ?? null,
    winnerTraits: { ...winner.traits },
    rankings: rankings.map(({ position, monster: m }) => ({
      position,
      name: m.name,
      legendary: m.isLegendary ?? false,
      odds: odds[m.id] ?? null,
      traits: { ...m.traits },
    })),
  };
  allResults.push(row);

  if (!QUIET && FORMAT === 'table') printRace(i, rankings, odds, winner);

  prevWinner   = winner;
  prevMonsters = monsters;
}

// ── Output ────────────────────────────────────────────────────────────────────
if (FORMAT === 'json') {
  printRaw(JSON.stringify(allResults, null, 2) + '\n');
} else if (FORMAT === 'csv') {
  print('race,seed,position,name,legendary,odds,speed,endurance,strength,madness,luck,winner');
  for (const r of allResults) {
    for (const entry of r.rankings) {
      const t = entry.traits;
      print([
        r.race, r.seed, entry.position,
        `"${entry.name}"`, entry.legendary ? 1 : 0,
        entry.odds?.toFixed(4) ?? '',
        t.speed, t.endurance, t.strength, t.madness, t.luck,
        entry.name === r.winner ? 1 : 0,
      ].join(','));
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
if (FORMAT === 'table' || QUIET) {
  const topWins = Object.entries(winCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topApps = Object.entries(appCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const avgOdds = (totalWinnerOdds / RACES).toFixed(2);

  print('\n' + '═'.repeat(56));
  print(`SUMMARY  (${RACES} races, seed base: ${BASE_SEED})`);
  print('═'.repeat(56));
  print(`Avg winner odds: ${avgOdds}×`);
  print('\nTop winners:');
  for (const [name, wins] of topWins) {
    const rate = ((wins / RACES) * 100).toFixed(1);
    print(`  ${pad(name, 36)} ${lpad(wins, 4)} wins  (${rate}%)`);
  }
  print('\nMost appearances:');
  for (const [name, apps] of topApps) {
    print(`  ${pad(name, 36)} ${lpad(apps, 4)} races`);
  }
  print('');
}

if (OUTPUT && outStream !== process.stdout) {
  outStream.end(() => console.error(`Output written to ${OUTPUT}`));
}
