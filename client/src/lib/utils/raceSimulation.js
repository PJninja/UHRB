// Race simulation logic
import { randomInt } from './random.js';

function selectOutliers(performances) {
  const hasRunaway   = Math.random() < 0.15;
  const hasStraggler = Math.random() < 0.25;

  let runawayId  = null;
  let stragglerI = null;

  if (hasRunaway && performances.length >= 2) {
    // Exclude last-place finisher — they are already the straggler
    const candidates = performances.filter((_, i) => i < performances.length - 1);
    runawayId = candidates[Math.floor(Math.random() * candidates.length)].id;
  }

  if (hasStraggler && performances.length >= 2) {
    // Exclude 1st-place finisher and runaway monster
    const candidates = performances
      .filter((_, i) => i > 0)
      .filter(p => p.id !== runawayId);
    if (candidates.length > 0) {
      stragglerI = candidates[Math.floor(Math.random() * candidates.length)].id;
    }
  }

  return { runawayId, stragglerI };
}

function selectArchetype() {
  const r = Math.random();
  if (r < 0.20) return 'wire-to-wire';    // winner leads from early on
  if (r < 0.45) return 'late-surge';      // winner lurks then explodes late
  if (r < 0.65) return 'comeback';        // winner starts behind, surges mid-race
  if (r < 0.85) return 'pack-then-split'; // tight first half, natural split after
  return 'chaos';                          // noise doubled, anything can lead
}

function selectFinishPattern() {
  const r = Math.random();
  if (r < 0.20) return 'close';    // all finish within ~2s — neck-and-neck
  if (r < 0.70) return 'split';    // leaders close, rest trail by 2-6s
  return 'blowout';                 // winner way ahead (3-6s), rest scattered
}

/**
 * Get the time offset (in ms after the winner) for a given finishing position.
 * @param {number} position — 1-indexed final position (1 = winner)
 * @param {string} pattern — 'close' | 'split' | 'blowout'
 * @returns {number} milliseconds offset
 */
function getFinishOffset(position, pattern) {
  if (position === 1) return 0;

  const behind = position - 1; // how many positions behind winner

  // Offset ranges per position for each pattern [min, max] in ms
  const ranges = {
    close: [
      [0, 0],         // 1st
      [200, 600],     // 2nd
      [400, 1000],    // 3rd
      [600, 1400],    // 4th
      [800, 1700],    // 5th
      [1000, 2000],   // 6th
    ],
    split: [
      [0, 0],         // 1st
      [200, 800],     // 2nd  (close to winner)
      [1500, 3000],   // 3rd  (big gap)
      [2500, 4000],   // 4th
      [3500, 5000],   // 5th
      [4000, 6000],   // 6th
    ],
    blowout: [
      [0, 0],         // 1st
      [2500, 4500],   // 2nd  (way behind)
      [3500, 5000],   // 3rd
      [4200, 5500],   // 4th
      [4800, 6000],   // 5th
      [5000, 6000],   // 6th
    ],
  };

  const idx = Math.min(behind, ranges[pattern].length - 1);
  const [min, max] = ranges[pattern][idx];
  return min + Math.random() * (max - min);
}

/**
 * Calculate a monster's race performance score
 * Combines stats with randomness to determine race outcome
 * @param {object} monster - Monster object with traits
 * @returns {number} Performance score
 */
function calculatePerformance(monster) {
  const { speed, endurance, madness, strength, luck } = monster.traits;

  // Visible stat score — madness excluded (it controls chaos range, not power)
  const statScore = (speed * 2.5) + (endurance * 1.5) + (strength * 1.0) + (luck * 1.5);

  // Madness scales the chaos range: high madness = wilder outcomes, same average
  const chaosMin = Math.max(10, 100 - madness * 5);
  const chaosMax = 100 + madness * 5;
  const chaosScore = randomInt(chaosMin, chaosMax);

  return statScore + chaosScore;
}

/**
 * Simulate a race and generate frame-by-frame progress.
 *
 * Every monster always moves forward and crosses the finish line (100%).
 * The difference is *when* they cross: winners cross at `duration`, losers
 * cross later based on a per-race finish pattern (close / split / blowout).
 *
 * @param {object[]} monsters - Array of racing monsters
 * @param {number} duration - Race duration in milliseconds (default 8000)
 * @param {object[]|null} serverRankings - Rankings from the server ({ position, monster }[]).
 *   When provided, final positions are taken directly from the server rather than re-rolled
 *   locally, guaranteeing the visual outcome matches the authoritative result.
 * @returns {object} Race results with frames and winner
 */
export function simulateRace(monsters, duration = 8000, serverRankings = null) {
  let performances;

  if (serverRankings && serverRankings.length > 0) {
    const localById = Object.fromEntries(monsters.map(m => [m.id, m]));

    performances = serverRankings.map(r => ({
      id: r.monster.id,
      monster: localById[r.monster.id] ?? r.monster,
      finalPosition: r.position,
    }));

    performances.sort((a, b) => a.finalPosition - b.finalPosition);
  } else {
    const perfs = monsters.map(monster => ({
      id: monster.id,
      monster,
      performance: calculatePerformance(monster),
      finalPosition: 0,
    }));
    perfs.sort((a, b) => b.performance - a.performance);
    perfs.forEach((p, i) => {
      p.finalPosition = i + 1;
    });
    performances = perfs;
  }

  // Select finish pattern and assign time offsets
  const finishPattern = selectFinishPattern();
  const fps = 60;

  performances.forEach(perf => {
    perf.finishOffset = getFinishOffset(perf.finalPosition, finishPattern);
    perf.finishTime = duration + perf.finishOffset;
  });

  const maxFinishTime = Math.max(...performances.map(p => p.finishTime));
  const totalFrames = Math.ceil((maxFinishTime / 1000) * fps);

  // Pre-compute easing table for the full extended duration
  const easeTable = new Float64Array(totalFrames + 1);
  for (let i = 0; i <= totalFrames; i++) {
    easeTable[i] = easeInOut(i / totalFrames);
  }

  const outliers  = selectOutliers(performances);
  const archetype = selectArchetype();

  // Generate raw velocity-based walks and then normalize so each monster
  // reaches exactly 100% at its personal finishTime.
  const positionCurves = {};
  const velocityCurves = {};
  const finishFrames = {};

  performances.forEach(perf => {
    const isRunaway   = perf.id === outliers.runawayId;
    const isStraggler = perf.id === outliers.stragglerI;
    const isWinner    = perf.finalPosition === 1;
    const isSecond    = perf.finalPosition === 2;

    const finishFrame = Math.ceil((perf.finishTime / 1000) * fps);
    finishFrames[perf.id] = finishFrame;

    const { speed, endurance, strength, madness } = perf.monster.traits;

    let speedBias  = ((speed     - 1) / 9) * 0.75;
    let noiseScale = 0.20 * (1 - ((endurance - 1) / 9) * 0.65);

    // Madness shapes how smooth vs erratic the trajectory looks
    const madnessMult = 0.7 + ((madness - 1) / 9) * 0.7; // range 0.70 → 1.40
    noiseScale *= madnessMult;

    const maxVelocity = 1.5 + ((strength - 1) / 9) * 1.5;

    const RUNAWAY_SPEED_BIAS   = 0.80;
    const RUNAWAY_NOISE_MULT   = 0.40;
    const STRAGGLER_SPEED_BIAS = 0.80;
    const STRAGGLER_NOISE_MULT = 0.45;

    if (isRunaway) {
      speedBias  += RUNAWAY_SPEED_BIAS;
      noiseScale *= RUNAWAY_NOISE_MULT;
    } else if (isStraggler) {
      speedBias  -= STRAGGLER_SPEED_BIAS;
      noiseScale *= STRAGGLER_NOISE_MULT;
    } else {
      if (archetype === 'wire-to-wire' && isWinner) {
        speedBias  += 0.35;
        noiseScale *= 0.80;
      } else if (archetype === 'chaos') {
        noiseScale *= 2.0;
        if (isWinner) speedBias += 0.05;
      }
    }

    // Archetype switch points (relative to finishFrame for this monster)
    const surgeFrame   = Math.floor(0.65 * finishFrame);
    const switchFrame  = Math.floor(0.45 * finishFrame);
    const packEndFrame = Math.floor(0.50 * finishFrame);

    const raw = new Array(totalFrames + 1);
    const velocities = new Array(totalFrames + 1);
    raw[0] = 0;
    velocities[0] = 1.0;
    let velocityMult = 1.0;

    for (let i = 1; i <= totalFrames; i++) {
      const baseStep = (easeTable[i] - easeTable[i - 1]) * 100;

      let frameBiasAdd   = 0;
      let frameNoiseMult = 1.0;

      // Archetype modifiers apply for the full duration (not just a diverge phase)
      if (!isRunaway && !isStraggler) {
        if (archetype === 'late-surge') {
          if (isWinner && i >= surgeFrame)  { frameBiasAdd = +0.50; frameNoiseMult = 0.70; }
          else if (isWinner)                { frameBiasAdd = +0.05; frameNoiseMult = 0.90; }
          else if (isSecond && i >= surgeFrame) { frameBiasAdd = -0.05; }
        } else if (archetype === 'comeback') {
          if (isWinner && i < switchFrame)  { frameBiasAdd = -0.25; frameNoiseMult = 1.10; }
          else if (isWinner)                { frameBiasAdd = +0.50; frameNoiseMult = 0.80; }
          else if (isSecond && i >= switchFrame) { frameBiasAdd = -0.10; }
        } else if (archetype === 'pack-then-split') {
          if (i < packEndFrame) frameNoiseMult = 0.35;
        }
      }

      velocityMult += (Math.random() - (0.5 - speedBias - frameBiasAdd)) * (noiseScale * frameNoiseMult);
      velocityMult = Math.max(0.35, Math.min(maxVelocity, velocityMult));
      raw[i] = raw[i - 1] + baseStep * velocityMult;
      velocities[i] = velocityMult;
    }

    // Normalize so the monster reaches exactly 100% at its finishFrame.
    // After that, clamp to 100% so it stays at the finish line.
    const rawAtFinish = Math.max(raw[finishFrame], 0.001); // safeguard
    const scale = 100 / rawAtFinish;

    const positionCurve = new Array(totalFrames + 1);
    for (let i = 0; i <= totalFrames; i++) {
      if (i <= finishFrame) {
        positionCurve[i] = raw[i] * scale;
      } else {
        positionCurve[i] = 100;
      }
    }

    positionCurves[perf.id] = positionCurve;
    velocityCurves[perf.id] = velocities;
  });

  // Build frames
  const frames = [];
  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
    const frameData = {};
    const timestamp = (frameIndex / fps) * 1000;

    performances.forEach(perf => {
      const finishFrame = finishFrames[perf.id];
      const position = positionCurves[perf.id][frameIndex];
      const finished = frameIndex >= finishFrame;

      frameData[perf.id] = {
        position,
        velocityMult: velocityCurves[perf.id][frameIndex],
        finished,
        monster: perf.monster,
      };
    });

    frames.push({ timestamp, positions: frameData });
  }

  // Return race results
  return {
    winner: performances[0].monster,
    rankings: performances.map(p => ({
      position: p.finalPosition,
      monster: p.monster,
    })),
    frames,
    duration,
    visualDuration: maxFinishTime,
    finishPattern,
    outliers,
    archetype,
  };
}

/** Smooth ease-in-out curve: maps t ∈ [0,1] → [0,1]. */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
