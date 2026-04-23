import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setSeed, resetSeed,
  randomInt, random,
  selectRandom, selectMultipleRandom,
  shuffle, generateUUID, rollChance,
} from '../src/utils/random.js';

beforeEach(() => setSeed('test-seed'));
afterEach(() => resetSeed());

describe('randomInt', () => {
  it('returns a value within [min, max] inclusive', () => {
    for (let i = 0; i < 100; i++) {
      const n = randomInt(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('returns exactly min when min === max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it('produces the same sequence given the same seed', () => {
    setSeed('determinism');
    const a = [randomInt(0, 100), randomInt(0, 100), randomInt(0, 100)];
    setSeed('determinism');
    const b = [randomInt(0, 100), randomInt(0, 100), randomInt(0, 100)];
    expect(a).toEqual(b);
  });

  it('produces different sequences with different seeds', () => {
    setSeed('seed-a');
    const a = randomInt(0, 1000000);
    setSeed('seed-b');
    const b = randomInt(0, 1000000);
    expect(a).not.toBe(b);
  });
});

describe('random', () => {
  it('returns a value in [0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('selectRandom', () => {
  it('returns an element from the array', () => {
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 20; i++) {
      expect(arr).toContain(selectRandom(arr));
    }
  });

  it('returns the only element from a single-item array', () => {
    expect(selectRandom(['only'])).toBe('only');
  });
});

describe('selectMultipleRandom', () => {
  it('returns exactly count elements when count < array length', () => {
    const result = selectMultipleRandom([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(3);
  });

  it('returns all elements when count >= array length', () => {
    const result = selectMultipleRandom([1, 2, 3], 10);
    expect(result).toHaveLength(3);
  });

  it('returns no duplicates', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = selectMultipleRandom(arr, 8);
    expect(new Set(result).size).toBe(result.length);
  });

  it('all returned elements exist in the source array', () => {
    const arr = ['x', 'y', 'z'];
    selectMultipleRandom(arr, 2).forEach(el => expect(arr).toContain(el));
  });
});

describe('shuffle', () => {
  it('returns a new array (does not mutate)', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffle(original);
    expect(original).toEqual(copy);
  });

  it('returned array contains all original elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(arr);
    expect(result.sort()).toEqual([...arr].sort());
  });

  it('has the same length as the input', () => {
    const arr = [10, 20, 30];
    expect(shuffle(arr)).toHaveLength(3);
  });

  it('produces the same shuffle given the same seed', () => {
    setSeed('shuffle-seed');
    const a = shuffle([1, 2, 3, 4, 5]);
    setSeed('shuffle-seed');
    const b = shuffle([1, 2, 3, 4, 5]);
    expect(a).toEqual(b);
  });
});

describe('generateUUID', () => {
  it('returns a 36-character string', () => {
    expect(generateUUID()).toHaveLength(36);
  });

  it('matches UUID format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('produces the same UUID given the same seed', () => {
    setSeed('uuid-seed');
    const a = generateUUID();
    setSeed('uuid-seed');
    const b = generateUUID();
    expect(a).toBe(b);
  });

  it('produces different UUIDs on subsequent calls', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });
});

describe('rollChance', () => {
  it('always returns false for 0%', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollChance(0)).toBe(false);
    }
  });

  it('always returns true for 100%', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollChance(100)).toBe(true);
    }
  });

  it('returns a boolean', () => {
    expect(typeof rollChance(50)).toBe('boolean');
  });

  it('rolls true roughly as often as the probability suggests (within 15%)', () => {
    setSeed('chance-test');
    const trials = 1000;
    let hits = 0;
    for (let i = 0; i < trials; i++) hits += rollChance(30) ? 1 : 0;
    expect(hits / trials).toBeCloseTo(0.3, 1);
  });
});
