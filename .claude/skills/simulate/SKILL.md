---
name: simulate
description: Run server/scripts/simulate.js, parse and analyze the output, and report balance findings
argument-hint: save, quick, 500 (or any number)
---

## Purpose

Use this skill after changing `calculateOdds`, `calculatePerformance`, `generateRaceMonsters`, stat weights, or value multipliers. Unit tests verify correctness; this skill catches balance issues that only emerge at scale.

## Step 1 — Run the simulator

Run two passes: a quick summary pass and a JSON pass for deep analysis.

```bash
# Quick summary (1000 races, deterministic seed)
node server/scripts/simulate.js --races 1000 --seed balance-check --quiet

# JSON output for detailed stat analysis
node server/scripts/simulate.js --races 1000 --seed balance-check --format json --output tmp_sim_results.json
```

Use `--seed balance-check` (or any fixed string) so results are reproducible and comparable across runs. Increase `--races` to 1000 when investigating a suspected issue that needs more statistical confidence.

## Step 2 — Parse the summary output

The table summary prints:

```
════════════════════════════════════════════════════════
SUMMARY  (1000 races, seed base: balance-check)
════════════════════════════════════════════════════════
Avg winner odds: 1.74×

Top winners:
  <Name>                               <N> wins  (X.X%)
  ...

Most appearances:
  <Name>                                <N> races
  ...
```

Read these values and note them before moving to analysis.

## Step 3 — Analyze the JSON output

Parse `/tmp/sim_results.json` to extract deeper signals. Each entry in the array has:

```json
{
  "race": 1,
  "seed": "balance-check-race-1",
  "winner": "Name",
  "winnerLegendary": false,
  "winnerOdds": 1.82,
  "winnerTraits": { "speed": 8, "endurance": 5, "strength": 4, "madness": 3, "luck": 2 },
  "rankings": [
    { "position": 1, "name": "...", "legendary": false, "odds": 1.82, "traits": {...} },
    ...
  ]
}
```

Compute these derived metrics from the JSON:

**Legendary win rate** — count races where `winnerLegendary === true`, divide by total. Expected: roughly proportional to legendary appearance rate (legendaries are ~5% of spawns in normal mode, ~100% in TEST_MODE).

**Champion retention rate** — count consecutive races where `winner` is the same as the previous race's `winner`. Healthy range: 10–30%. Much higher signals a dynasty problem.

**Odds spread for winners** — bucket `winnerOdds` into ranges: <1.5×, 1.5–2.0×, 2.0–2.5×, >2.5×. A healthy distribution has mass in all buckets; clustering below 1.5× means heavy favorites dominate; clustering above 2.5× means the cap logic isn't constraining upsets.

**Stat dominance** — for each winner, find the dominant stat (highest value in `winnerTraits`). Tally how often each stat (speed, endurance, strength, madness, luck) is the winner's top stat. No single stat should account for >40% of wins. Luck is cosmetic and should not correlate with wins.

**Odds range per race** — for each race, compute `max(odds) - min(odds)`. If this spread is consistently <0.3× the field is too compressed; consistently >2.0× suggests an outlier-stat monster is overwhelming the field. There can be outliers, as long as they aren't consistently out of range.

## Step 4 — Health thresholds

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Avg winner odds | 1.4×–3.5× | 1.2×–1.4× or 3.5×–4.5× | <1.2× or >4.5× |
| Top winner win rate | <8% | 8–12% | >12% |
| Champion retention | 15–35% | 10–15% or 35–45% | <10% or >45% |
| Legendary win rate | within 2× of appearance rate | 2×–4× | >4× |
| Single-stat dominance | no stat >35% | 35–40% | >40% |
| Beloved cap working | Beloved winners avg ≤1.5× | — | Beloved winners avg >1.5× |
| Legendary cap working | Legendary winners avg ≤2.0× | — | Legendary winners avg >2.0× |

## Step 5 — Report findings

Structure the report as follows:

**1. Run parameters** — races, seed, timestamp of the run.

**2. Summary numbers** — avg winner odds, top winner's win rate, champion retention rate.

**3. Traffic-light status** — one line per metric from Step 4, color-coded Green/Yellow/Red.

**4. Notable findings** — anything that fell Yellow or Red, with the specific numbers. If everything is Green, say so explicitly.

**5. Likely cause** — if there is a Red, name the most probable code location:
  - Odds too low → `calculateOdds` stat weight (70% side) or value cap logic
  - Champion retention too high → returning-champion boost in `generateRaceMonsters` or `calculateOdds`
  - Stat dominance → `calculatePerformance` weight coefficients in `raceSimulator.js`
  - Legendary over-winning → legendary stat multiplier in `monsterGenerator.js` or the 2.0× cap in `calculateOdds`

**6. Recommendation** — one concrete action (e.g., "reduce the speed coefficient in `calculatePerformance` from 1.4 to 1.2 and re-run").

## Quick-reference: key code locations

| Concern | File | What to look at |
|---------|------|-----------------|
| Odds formula | `server/src/services/raceSimulator.js` | `calculateOdds` — 70/30 split, Beloved cap, legendary cap |
| Race outcome weights | `server/src/services/raceSimulator.js` | `calculatePerformance` — per-stat coefficients |
| Monster generation | `server/src/services/monsterGenerator.js` | `generateRaceMonsters` — champion return, legendary injection, value assignment |
| Stat letter encoding | `server/data/bioData.js`, `appearanceData.js` | letter frequency directly sets monster stat totals |

## Arguments
`--500` - number of race iterations to run (default: 1000)

`--save` - whether to save the JSON output to a file in a local, non-temp, directory with date and time (default: false). Output to the directory /saved/{filename}.json if true. Delete the tmp .json if false.

`--quick` - skip providing 5. Likely cause and 6. Recommendation in the report, for a faster but less actionable summary (default: false)

## Example invocation

```
/simulate
```
Run with no arguments; the skill will execute both simulator passes, parse the results, and deliver a structured report.

or

```
/simulate --500 --save
```
Run with 500 races and save the json to a local file for later analysis.

