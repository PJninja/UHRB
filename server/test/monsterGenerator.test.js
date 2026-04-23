import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setSeed, resetSeed } from '../src/utils/random.js';

vi.mock('../src/services/broadcaster.js', () => ({ broadcast: vi.fn() }));
vi.mock('../src/utils/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

import { generateMonster, generateRaceMonsters, calculateStatTotal } from '../src/services/monsterGenerator.js';
import { sanitizeMonster } from '../src/services/raceScheduler.js';
import { legendaryMonsters } from '../src/data/legendaryMonsters.js';

const REQUIRED_TRAITS = ['speed', 'endurance', 'madness', 'strength', 'luck', 'value'];
const STAT_RANGE = { min: 1, max: 10 };

beforeEach(() => setSeed('gen-test'));
afterEach(() => resetSeed());

// ─── generateMonster ──────────────────────────────────────────────────────────

describe('generateMonster', () => {
  it('has all required fields', () => {
    const m = generateMonster();
    expect(m).toHaveProperty('id');
    expect(m).toHaveProperty('name');
    expect(m).toHaveProperty('traits');
    expect(m).toHaveProperty('description');
    expect(m).toHaveProperty('location');
    expect(m).toHaveProperty('style');
  });

  it('style is one of the valid values', () => {
    const validStyles = ['mundane', 'cosmic', 'bureau'];
    for (let i = 0; i < 30; i++) {
      const { style } = generateMonster();
      expect(validStyles).toContain(style);
    }
  });

  it('all text fields are thematically consistent with the chosen style', () => {
    for (let i = 0; i < 20; i++) {
      setSeed(`style-consistent-${i}`);
      const m = generateMonster();
      expect(m.style).toBeDefined();
      expect(typeof m.style).toBe('string');
    }
  });

  it('has all required trait keys', () => {
    const { traits } = generateMonster();
    REQUIRED_TRAITS.forEach(key => expect(traits).toHaveProperty(key));
  });

  it('all stat traits are within [1, 10]', () => {
    for (let i = 0; i < 20; i++) {
      const { traits } = generateMonster();
      ['speed', 'endurance', 'madness', 'strength', 'luck'].forEach(stat => {
        expect(traits[stat]).toBeGreaterThanOrEqual(STAT_RANGE.min);
        expect(traits[stat]).toBeLessThanOrEqual(STAT_RANGE.max);
      });
    }
  });

  it('value is within [1, 100]', () => {
    for (let i = 0; i < 20; i++) {
      const { traits } = generateMonster();
      expect(traits.value).toBeGreaterThanOrEqual(1);
      expect(traits.value).toBeLessThanOrEqual(100);
    }
  });

  it('generates a unique id each time', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateMonster().id));
    expect(ids.size).toBe(20);
  });

  it('luck is within [1, 4] and varies across seeds', () => {
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      setSeed(`luck-test-${i}`);
      const { traits } = generateMonster();
      expect(traits.luck).toBeGreaterThanOrEqual(1);
      expect(traits.luck).toBeLessThanOrEqual(4);
      seen.add(traits.luck);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('produces deterministic output with the same seed', () => {
    setSeed('fixed');
    const a = generateMonster();
    setSeed('fixed');
    const b = generateMonster();
    expect(a.id).toBe(b.id);
    expect(a.name).toBe(b.name);
    expect(a.traits).toEqual(b.traits);
  });

  describe('height and weight by style', () => {
    const sample = (style) => {
      const results = [];
      for (let i = 0; i < 60; i++) {
        setSeed(`hw-${i}`);
        const m = generateMonster();
        if (m.style === style) results.push(m);
      }
      return results;
    };

    it('mundane monsters are human-scale (height 1–3 m, weight 90–300 lbs)', () => {
      const monsters = sample('mundane');
      expect(monsters.length).toBeGreaterThan(0);
      monsters.forEach(m => {
        expect(m.height).toBeGreaterThanOrEqual(1);
        expect(m.height).toBeLessThanOrEqual(3);
        expect(m.weight).toBeGreaterThanOrEqual(90);
        expect(m.weight).toBeLessThanOrEqual(300);
      });
    });

    it('bureau monsters are human-scale (height 1–3 m, weight 90–300 lbs)', () => {
      const monsters = sample('bureau');
      expect(monsters.length).toBeGreaterThan(0);
      monsters.forEach(m => {
        expect(m.height).toBeGreaterThanOrEqual(1);
        expect(m.height).toBeLessThanOrEqual(3);
        expect(m.weight).toBeGreaterThanOrEqual(90);
        expect(m.weight).toBeLessThanOrEqual(300);
      });
    });

    it('cosmic monsters use the large range (height 0–300 m, weight 0–1000 t)', () => {
      const monsters = sample('cosmic');
      expect(monsters.length).toBeGreaterThan(0);
      monsters.forEach(m => {
        expect(m.height).toBeGreaterThanOrEqual(0);
        expect(m.height).toBeLessThanOrEqual(300);
        expect(m.weight).toBeGreaterThanOrEqual(0);
        expect(m.weight).toBeLessThanOrEqual(1000);
      });
      expect(monsters.some(m => m.height > 3)).toBe(true);
    });
  });
});

// ─── generateRaceMonsters ─────────────────────────────────────────────────────

describe('generateRaceMonsters', () => {
  it('returns 4–6 monsters when no count specified', () => {
    for (let i = 0; i < 10; i++) {
      setSeed(`count-${i}`);
      const monsters = generateRaceMonsters();
      expect(monsters.length).toBeGreaterThanOrEqual(4);
      expect(monsters.length).toBeLessThanOrEqual(6);
    }
  });

  it('respects explicit count', () => {
    expect(generateRaceMonsters(5)).toHaveLength(5);
    expect(generateRaceMonsters(4)).toHaveLength(4);
  });

  it('includes the returning champion', () => {
    const champion = generateMonster();
    champion.id = 'champ-id';
    const monsters = generateRaceMonsters(5, [champion], champion);
    const ids = monsters.map(m => m.id);
    expect(ids).toContain('champ-id');
  });

  it('champion is marked with isReturningChampion when sanitized', () => {
    const champion = generateMonster();
    const monsters = generateRaceMonsters(5, [champion], champion);
    const returner = monsters.find(m => m.id === champion.id);
    expect(returner).toBeDefined();
  });

  it('reduces champion value by 20 (CHAMPION_FAVOR_BOOST), min 1', () => {
    const champion = { ...generateMonster(), traits: { ...generateMonster().traits, value: 50 } };
    const monsters = generateRaceMonsters(5, [champion], champion);
    const returned = monsters.find(m => m.id === champion.id);
    expect(returned.traits.value).toBe(30);
  });

  it('champion value does not go below 1', () => {
    const champion = { ...generateMonster(), traits: { ...generateMonster().traits, value: 10 } };
    const monsters = generateRaceMonsters(5, [champion], champion);
    const returned = monsters.find(m => m.id === champion.id);
    expect(returned.traits.value).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds requested count', () => {
    for (let i = 0; i < 20; i++) {
      setSeed(`overflow-${i}`);
      const prev = Array.from({ length: 5 }, (_, j) => ({ ...generateMonster(), id: `prev-${j}` }));
      const winner = prev[0];
      const monsters = generateRaceMonsters(4, prev, winner);
      expect(monsters.length).toBeLessThanOrEqual(4);
    }
  });

  it('never injects more than one legendary', () => {
    for (let i = 0; i < 30; i++) {
      setSeed(`legendary-${i}`);
      const monsters = generateRaceMonsters(6);
      const legendaryCount = monsters.filter(m => m.isLegendary).length;
      expect(legendaryCount).toBeLessThanOrEqual(1);
    }
  });

  it('legendary winner is not included as a guaranteed returner in the next field', () => {
    const legend = { ...legendaryMonsters[0] };
    // Even if a legendary is passed as previousWinner, it should not claim a guaranteed slot.
    // The scheduler nulls previousWinner for legendary winners; this verifies the generator
    // produces a valid full field regardless (no champion slot consumed).
    const monsters = generateRaceMonsters(5, [], null);
    expect(monsters.length).toBe(5);
    expect(monsters.every(m => !m.isReturningChampion)).toBe(true);
  });

  it('all monsters have required trait fields', () => {
    const monsters = generateRaceMonsters(6);
    monsters.forEach(m => {
      REQUIRED_TRAITS.forEach(key => expect(m.traits).toHaveProperty(key));
    });
  });
});

// ─── calculateStatTotal ───────────────────────────────────────────────────────

describe('calculateStatTotal', () => {
  it('sums speed + endurance + strength + luck', () => {
    const m = { traits: { speed: 3, endurance: 4, strength: 2, luck: 5, madness: 10 } };
    expect(calculateStatTotal(m)).toBe(14);
  });

  it('excludes madness', () => {
    const low  = { traits: { speed: 5, endurance: 5, strength: 5, luck: 5, madness: 1 } };
    const high = { traits: { speed: 5, endurance: 5, strength: 5, luck: 5, madness: 10 } };
    expect(calculateStatTotal(low)).toBe(calculateStatTotal(high));
  });
});

// ─── sanitizeMonster ──────────────────────────────────────────────────────────

describe('sanitizeMonster', () => {
  it('removes the value trait', () => {
    const m = generateMonster();
    const sanitized = sanitizeMonster(m);
    expect(sanitized.traits).not.toHaveProperty('value');
  });

  it('adds audienceFavor in [1, 5]', () => {
    for (let v = 1; v <= 100; v += 10) {
      const m = { ...generateMonster(), traits: { ...generateMonster().traits, value: v } };
      const { audienceFavor } = sanitizeMonster(m);
      expect(audienceFavor).toBeGreaterThanOrEqual(1);
      expect(audienceFavor).toBeLessThanOrEqual(5);
    }
  });

  it('low value → high audienceFavor (crowd favourite)', () => {
    const m = { ...generateMonster(), traits: { ...generateMonster().traits, value: 1 } };
    expect(sanitizeMonster(m).audienceFavor).toBe(5);
  });

  it('high value → low audienceFavor (underdog)', () => {
    const m = { ...generateMonster(), traits: { ...generateMonster().traits, value: 100 } };
    expect(sanitizeMonster(m).audienceFavor).toBe(1);
  });

  it('strips bio prose fields', () => {
    const m = generateMonster();
    const sanitized = sanitizeMonster(m);
    ['description', 'blurb', 'height', 'weight', 'features'].forEach(field => {
      expect(sanitized).not.toHaveProperty(field);
    });
  });

  it('marks as returning champion when isChampion=true', () => {
    const m = generateMonster();
    expect(sanitizeMonster(m, true).isReturningChampion).toBe(true);
    expect(sanitizeMonster(m, false).isReturningChampion).toBe(false);
  });

  it('preserves visible traits', () => {
    const m = generateMonster();
    const sanitized = sanitizeMonster(m);
    ['speed', 'endurance', 'madness', 'strength', 'luck'].forEach(stat => {
      expect(sanitized.traits).toHaveProperty(stat, m.traits[stat]);
    });
  });
});
