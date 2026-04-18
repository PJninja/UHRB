// Horror generation logic (server — uses seeded RNG)
import { namePrefixes, nameSuffixes, locations } from '../data/nameData.js';
import { descriptions, blurbs, racingStyles } from '../data/bioData.js';
import { bodyTypes, distinctiveFeatures, temperaments } from '../data/appearanceData.js';
import { randomInt, selectRandom, shuffle, generateUUID, rollChance } from '../utils/random.js';

/**
 * Calculate luck stat from letter variety.
 * More unique letters across all selections = higher luck.
 * @param {string[]} letters
 * @returns {number} 1–10
 */
function calculateLuck(letters) {
  const uniqueCount = new Set(letters).size;
  return Math.min(10, Math.max(1, Math.round(uniqueCount * 2.5)));
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
  const desc        = selectRandom(descriptions);
  const blurb       = selectRandom(blurbs);
  const racingStyle = selectRandom(racingStyles);
  const bodyType    = selectRandom(bodyTypes);
  const features    = selectRandom(distinctiveFeatures);
  const temperament = selectRandom(temperaments);

  // Name: 70% compound (prefix + suffix), 30% single word
  let name;
  let nameLetters;
  if (rollChance(70)) {
    const prefix = selectRandom(namePrefixes);
    const suffix  = selectRandom(nameSuffixes);
    name = `${prefix.text} ${suffix.text}`;
    nameLetters = [prefix.letter, suffix.letter];
  } else {
    const single = selectRandom([...namePrefixes, ...nameSuffixes]);
    name = single.text;
    nameLetters = [single.letter];
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

  return {
    id:          generateUUID(),
    name,
    location:    selectRandom(locations),  // plain string, cosmetic only
    description: desc.text,
    blurb:       blurb.text,
    racingStyle: racingStyle.text,
    bodyType:    bodyType.text,
    features:    features.text,
    height:      randomInt(0, 300),
    weight:      randomInt(0, 1000),
    temperament: temperament.text,
    traits,
  };
}

/**
 * Generate monsters for a race.
 * @param {number|null} count - Number of monsters (4–6); null for random
 * @param {object[]} previousMonsters - From the previous race (optional returners)
 * @param {object|null} previousWinner - Always included in the next race
 */
// Each time the champion returns their crowd favor grows, reducing their effective payout.
const CHAMPION_FAVOR_BOOST = 20;

export function generateRaceMonsters(count = null, previousMonsters = null, previousWinner = null) {
  const monsterCount = count || randomInt(4, 6);

  // The returning champion always gets a slot, with a favor boost (value reduction).
  let monsters;
  if (previousWinner) {
    const boostedChampion = {
      ...previousWinner,
      traits: {
        ...previousWinner.traits,
        value: Math.max(1, previousWinner.traits.value - CHAMPION_FAVOR_BOOST),
      },
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
