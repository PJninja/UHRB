// Race simulation logic (server version with seeded RNG)
import { randomInt, random } from '../utils/random.js';

/**
 * Calculate a monster's race performance score
 * Combines stats with randomness to determine race outcome
 * Uses seeded RNG for deterministic results
 * @param {object} monster - Monster object with traits
 * @returns {number} Performance score
 */
function calculatePerformance(monster) {
  const { speed, endurance, madness, strength, luck } = monster.traits;

  // Visible stat score — madness excluded (it controls chaos range, not power)
  const statScore = (speed * 2.5) + (endurance * 1.5) + (strength * 1.0) + (luck * 1.5);

  // Madness scales the chaos range: high madness = wilder outcomes, same average
  const chaosMin = Math.max(10, 100 - madness * 5);  // madness 1 → 95,  madness 10 → 50
  const chaosMax = 100 + madness * 5;                 // madness 1 → 105, madness 10 → 150
  const chaosScore = randomInt(chaosMin, chaosMax);

  return statScore + chaosScore;
}

/**
 * Simulate a race and generate frame-by-frame progress
 * Uses seeded RNG for deterministic outcome
 * @param {object[]} monsters - Array of racing monsters
 * @param {number} duration - Race duration in milliseconds (default 8000)
 * @returns {object} Race results with frames and winner
 */
export function simulateRace(monsters, duration = 8000) {
  // Calculate performance for each monster
  const performances = monsters.map(monster => ({
    id: monster.id,
    monster,
    performance: calculatePerformance(monster),
    finalPosition: 0,
  }));

  // Determine final positions based on performance
  performances.sort((a, b) => b.performance - a.performance);
  performances.forEach((perf, index) => {
    perf.finalPosition = index + 1;
  });

  // Generate animation frames (60 FPS)
  const fps = 60;
  const frameCount = Math.floor((duration / 1000) * fps);
  const frames = [];

  for (let frameIndex = 0; frameIndex <= frameCount; frameIndex++) {
    const progress = frameIndex / frameCount; // 0 to 1
    const frameData = {};

    performances.forEach(perf => {
      // Calculate position with some variation during the race
      let position;

      if (progress < 0.1) {
        // Start: Everyone close together
        position = progress * 10 + (random() * 0.02);
      } else if (progress < 0.9) {
        // Middle: Positions diverge based on performance
        const basePosition = progress * 100;
        const performanceModifier = (perf.performance / performances[0].performance) * progress * 20;
        const variation = (random() - 0.5) * 5;
        position = basePosition + performanceModifier + variation;
      } else {
        // End: Lock into final positions
        const finalProgress = (progress - 0.9) / 0.1; // 0 to 1 in last 10%
        const currentPosition = progress * 100;
        const targetPosition = 100;
        position = currentPosition + (targetPosition - currentPosition) * (perf.finalPosition === 1 ? finalProgress * 1.2 : finalProgress);
      }

      // Ensure position doesn't exceed 100
      position = Math.min(100, Math.max(0, position));

      frameData[perf.id] = {
        position,
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

/**
 * Calculate odds for each monster based on visible stats
 * (Does not use hidden 'value' stat)
 * @param {object[]} monsters - Array of monsters
 * @returns {object} Map of monsterId to odds ratio
 */
export function calculateOdds(monsters) {
  const odds = {};

  // Stats component: relative visible stat share determines win probability.
  // Higher stats = lower stat-odds (more likely to win).
  const statTotals = monsters.map(monster => {
    const { speed, endurance, strength, luck } = monster.traits;
    return { id: monster.id, total: speed + endurance + strength + luck };
  });
  const grandTotal = statTotals.reduce((sum, m) => sum + m.total, 0);

  // Odds range [1.5, 10]. Value maps linearly across the full range:
  // value=1 (Beloved) → 1.5× (low payout), value=100 (Despised) → 10× (high payout).
  // Final odds = 30% stats component + 70% value component.
  monsters.forEach(monster => {
    const { value } = monster.traits;
    const statTotal = statTotals.find(s => s.id === monster.id).total;

    const winProbability = statTotal / grandTotal;
    const statsOdds = Math.min(10, Math.max(1.5, 1 / winProbability));
    const valueOdds  = 1.5 + (value / 100) * 8.5;

    const blended = 0.3 * statsOdds + 0.7 * valueOdds;
    odds[monster.id] = Math.round(Math.min(10, Math.max(1.5, blended)) * 100) / 100;
  });

  return odds;
}
