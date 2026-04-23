// Race simulation logic
import { randomInt } from './random.js';

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
 * Simulate a race and generate frame-by-frame progress
 * @param {object[]} monsters - Array of racing monsters
 * @param {number} duration - Race duration in milliseconds (default 8000)
 * @param {object[]|null} serverRankings - Rankings from the server ({ position, monster }[]).
 *   When provided, final positions are taken directly from the server rather than re-rolled
 *   locally, guaranteeing the visual outcome matches the authoritative result.
 * @returns {object} Race results with frames and winner
 */
export function simulateRace(monsters, duration = 8000, serverRankings = null) {
  let performances;

  // Finishing spread: each rank behind the winner is 3% further from the line.
  // Winner = 100%, 2nd = 97%, …, 6th = 85%. Tight enough that all monsters
  // are still visibly running in the home stretch, not frozen waiting for the winner.
  const FINISH_SPREAD = 0.03;

  if (serverRankings && serverRankings.length > 0) {
    const localById = Object.fromEntries(monsters.map(m => [m.id, m]));

    performances = serverRankings.map(r => ({
      id: r.monster.id,
      monster: localById[r.monster.id] ?? r.monster,
      normalizedPerf: 1.0 - (r.position - 1) * FINISH_SPREAD,
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
      p.normalizedPerf = 1.0 - i * FINISH_SPREAD;
    });
    performances = perfs;
  }

  // Generate animation frames (60 FPS)
  const fps = 60;
  const frameCount = Math.floor((duration / 1000) * fps);
  const frames = [];

  // Pre-compute easing table once — avoids calling easeInOut() inside the inner loop
  // (up to 1,800 calls per monster at 30s × 60fps).
  const easeTable = new Float64Array(frameCount + 1);
  for (let i = 0; i <= frameCount; i++) easeTable[i] = easeInOut(i / frameCount);

  // Pre-compute position curves for each monster.
  //
  // Two-phase strategy:
  //   Phase 1 (0 → DIVERGE_PHASE): all monsters run freely, each normalised so they
  //     would all finish at 100 — no outcome bias, any monster can lead at any point.
  //   Phase 2 (DIVERGE_PHASE → 1): each monster interpolates forward from wherever
  //     they actually are at the diverge frame to their authoritative finish position.
  //     Because targetFinal (85–100%) is always ≥ the typical free position at diverge
  //     (~79%), this always moves forward — no freezing.
  const DIVERGE_PHASE = 0.68;
  const divergeFrame  = Math.floor(DIVERGE_PHASE * frameCount);
  const easeAtDiverge = easeTable[divergeFrame];
  const easeRemaining = easeTable[frameCount] - easeAtDiverge; // remaining ease budget

  const positionCurves = {};
  const velocityCurves = {};
  performances.forEach(perf => {
    const { normalizedPerf } = perf;
    const { speed, endurance, strength } = perf.monster.traits;

    const speedBias   = ((speed     - 1) / 9) * 0.25;
    const noiseScale  = 0.20 * (1 - ((endurance - 1) / 9) * 0.65);
    const maxVelocity = 1.5 + ((strength - 1) / 9) * 1.5;

    const raw = new Array(frameCount + 1);
    const velocities = new Array(frameCount + 1);
    raw[0] = 0;
    velocities[0] = 1.0;
    let velocityMult = 1.0;

    for (let i = 1; i <= frameCount; i++) {
      const baseStep = (easeTable[i] - easeTable[i - 1]) * 100;
      velocityMult += (Math.random() - (0.5 - speedBias)) * noiseScale;
      velocityMult = Math.max(0.35, Math.min(maxVelocity, velocityMult));
      raw[i] = raw[i - 1] + baseStep * velocityMult;
      velocities[i] = velocityMult;
    }

    const rawFinal = raw[frameCount];
    const targetFinal = normalizedPerf * 100; // e.g. winner=100, 2nd=97, last≈85

    // Phase 1: free curve — all normalised to end at 100 so order is unpredictable.
    const positionCurve = new Array(frameCount + 1);
    for (let i = 0; i <= divergeFrame; i++) {
      positionCurve[i] = (raw[i] / rawFinal) * 100;
    }

    // Phase 2: interpolate forward from the diverge position to targetFinal.
    // Because targetFinal ≥ ~85 and freePos at diverge ≈ 79, this is always forward.
    // Monotonic clamp handles the rare case where a leading monster finishes lower.
    const freeAtDiverge = positionCurve[divergeFrame];
    for (let i = divergeFrame + 1; i <= frameCount; i++) {
      const t2 = (easeTable[i] - easeAtDiverge) / easeRemaining; // 0 → 1
      const target = freeAtDiverge + t2 * (targetFinal - freeAtDiverge);
      positionCurve[i] = Math.max(positionCurve[i - 1], target);
    }

    positionCurves[perf.id] = positionCurve;
    velocityCurves[perf.id] = velocities;
  });

  for (let frameIndex = 0; frameIndex <= frameCount; frameIndex++) {
    const frameData = {};
    performances.forEach(perf => {
      frameData[perf.id] = {
        position: positionCurves[perf.id][frameIndex],
        velocityMult: velocityCurves[perf.id][frameIndex],
        monster: perf.monster,
      };
    });
    frames.push({
      timestamp: (frameIndex / fps) * 1000,
      positions: frameData,
    });
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
  };
}

/** Smooth ease-in-out curve: maps t ∈ [0,1] → [0,1]. */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

