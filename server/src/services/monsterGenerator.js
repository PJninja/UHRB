// Horror generation logic (server — uses seeded RNG)
import { namePrefixes, nameSuffixes, locations } from '../data/nameData.js';
import { descriptions, blurbs, racingStyles } from '../data/bioData.js';
import { bodyTypes, distinctiveFeatures, temperaments } from '../data/appearanceData.js';
import { randomInt, random, selectRandom, shuffle, generateUUID, rollChance } from '../utils/random.js';
import { legendaryMonsters } from '../data/legendaryMonsters.js';
import { config } from '../config.js';

const STYLES = ['mundane', 'cosmic', 'bureau'];

function filterByStyle(pool, style) {
  const filtered = pool.filter(entry => entry.style === style);
  return filtered.length >= 6 ? filtered : pool;
}

/**
 * Calculate luck stat from letter variety.
 * More unique letters across all selections = higher luck.
 * @param {string[]} letters
 * @returns {number} 1–4
 */
function calculateLuck(letters) {
  const uniqueCount = new Set(letters).size;
  return Math.min(10, Math.max(1, uniqueCount));
}

/**
 * Count occurrences of a letter, clamped to 1–10.
 */
function countLetter(letters, target) {
  const count = letters.filter(l => l === target).length;
  return Math.min(10, Math.max(1, count));
}

/**
 * Generate a single horror.
 * Each text field is a { text, letter } pair — the letter encodes the stat contribution.
 * Stats are derived entirely from the letters of the selected entries.
 */
export function generateMonster() {
  const roll = random();
  const style = roll < 0.5 ? 'cosmic' : roll < 0.75 ? 'mundane' : 'bureau';

  const desc        = selectRandom(filterByStyle(descriptions, style));
  const blurb       = selectRandom(filterByStyle(blurbs, style));
  const racingStyle = selectRandom(filterByStyle(racingStyles, style));
  const bodyType    = selectRandom(filterByStyle(bodyTypes, style));
  const features    = selectRandom(filterByStyle(distinctiveFeatures, style));
  const temperament = selectRandom(filterByStyle(temperaments, style));

  // Name: 70% compound (prefix + suffix), 30% single word
  const filteredPrefixes = filterByStyle(namePrefixes, style);
  const filteredSuffixes = filterByStyle(nameSuffixes, style);
  let name;
  let nameLetters;
  if (rollChance(70)) {
    const prefix = selectRandom(filteredPrefixes);
    const suffix  = selectRandom(filteredSuffixes);
    name = `${prefix.text} ${suffix.text}`;
    nameLetters = [suffix.letter];
  } else {
    const single = selectRandom([...filteredPrefixes, ...filteredSuffixes]);
    name = single.text;
    nameLetters = single.letter ? [single.letter] : [];
  }

  // All letters from selected entries — this is the full stat genome
  const allLetters = [
    desc.letter,
    blurb.letter,
    racingStyle.letter,
    bodyType.letter,
    features.letter,
    temperament.letter,
    ...nameLetters,
  ];

  const traits = {
    speed:     countLetter(allLetters, 'A'),
    endurance: countLetter(allLetters, 'C'),
    madness:   countLetter(allLetters, 'G'),
    strength:  countLetter(allLetters, 'T'),
    luck:      calculateLuck(allLetters),
    value:     randomInt(1, 100),  // hidden — affects payout only, never sent to client
  };

  // Determine which stats are visible (1–4 hidden)
  // Distribution: heavily weighted toward 2 hidden
  const visibilityRoll = random();
  let hiddenCount;
  if (visibilityRoll < 0.05) {
    hiddenCount = 4;  // 5% - all hidden
  } else if (visibilityRoll < 0.30) {
    hiddenCount = 3;  // 25% - three hidden
  } else if (visibilityRoll < 0.80) {
    hiddenCount = 2;  // 50% - two hidden (most common)
  } else {
    hiddenCount = 1;  // 20% - one hidden
  }

  // Randomly select which stats are hidden
  const statKeys = ['speed', 'endurance', 'madness', 'strength'];
  const shuffledStats = shuffle([...statKeys]);
  const hiddenStats = shuffledStats.slice(0, hiddenCount);

  const statVisibility = {};
  statKeys.forEach(stat => {
    statVisibility[stat] = !hiddenStats.includes(stat);
  });

  return {
    id:          generateUUID(),
    name,
    location:    selectRandom(filterByStyle(locations, style)).text,
    description: desc.text,
    blurb:       blurb.text,
    racingStyle: racingStyle.text,
    bodyType:       bodyType.text,
    bodyTypeLetter: bodyType.letter,
    features:    features.text,
    height:      style === 'cosmic' ? randomInt(0, 300)                                       : randomInt(1, 3),
    weight:      style === 'cosmic' ? randomInt(0, 1000) : randomInt(90, 300),
    temperament: temperament.text,
    style,
    traits,
    statVisibility,
  };
}

/**
 * Generate monsters for a race.
 * @param {number|null} count - Number of monsters (4–6); null for random
 * @param {object[]} previousMonsters - From the previous race (optional returners)
 * @param {object|null} previousWinner - Always included in the next race
 */
// Each time the champion returns their crowd favor grows, increasing value (capped at 100).
const CHAMPION_FAVOR_BOOST = 20;

export function generateRaceMonsters(count = null, previousMonsters = null, previousWinner = null) {
  if (previousWinner?.isLegendary) previousWinner = null;
  const monsterCount = count || randomInt(4, 6);

  // The returning champion always gets a slot, with a favor boost (value increase).
  let monsters;
  if (previousWinner) {
    const boostedChampion = {
      ...previousWinner,
      traits: {
        ...previousWinner.traits,
        value: Math.min(100, previousWinner.traits.value + CHAMPION_FAVOR_BOOST),
      },
      statVisibility: previousWinner.statVisibility,  // Preserve visibility
    };
    monsters = [boostedChampion];
  } else {
    monsters = [];
  }

  // 20% chance to also bring back 1–2 other runners (excluding the winner)
  const eligible = (previousMonsters || []).filter(
    m => !previousWinner || m.id !== previousWinner.id
  );
  if (eligible.length > 0 && rollChance(20)) {
    const maxReturners = Math.min(2, eligible.length, monsterCount - monsters.length - 1);
    if (maxReturners > 0) {
      const reuseCount = randomInt(1, maxReturners);
      const shuffled = shuffle(eligible);
      monsters.push(...shuffled.slice(0, reuseCount));
    }
  }

  // Inject a legendary if: roll hits, one isn't already in the pool (e.g. as returning
  // champion), and at least one slot remains for it.
  const hasLegendary = monsters.some(m => m.isLegendary);
  if (!hasLegendary && rollChance(config.legendaryChance) && monsterCount - monsters.length > 0) {
    monsters.push(selectRandom(legendaryMonsters));
  }

  // Fill remaining slots with fresh horrors
  const remaining = monsterCount - monsters.length;
  for (let i = 0; i < remaining; i++) {
    monsters.push(generateMonster());
  }

  return shuffle(monsters);
}

/**
 * Calculate total visible stats for odds calculation.
 * Madness excluded — it governs chaos variance, not raw power.
 */
export function calculateStatTotal(monster) {
  const { speed, endurance, strength, luck } = monster.traits;
  return speed + endurance + strength + luck;
}
