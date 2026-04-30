import { describe, it, expect } from 'vitest';
import { formatOdds } from '../lib/utils/odds.js';

describe('formatOdds', () => {
  it('returns — for falsy values', () => {
    expect(formatOdds(null)).toBe('—');
    expect(formatOdds(undefined)).toBe('—');
    expect(formatOdds(0)).toBe('—');
  });

  it('returns — for multiplier at or below 1', () => {
    expect(formatOdds(1)).toBe('—');
    expect(formatOdds(0.5)).toBe('—');
  });

  it('formats x:1 ratios for integer multipliers', () => {
    expect(formatOdds(2.0)).toBe('1:1');
    expect(formatOdds(3.0)).toBe('2:1');
    expect(formatOdds(4.0)).toBe('3:1');
    expect(formatOdds(10.0)).toBe('9:1');
    expect(formatOdds(50.0)).toBe('49:1');
  });

  it('formats x:2 ratios for half-integer multipliers', () => {
    expect(formatOdds(1.5)).toBe('1:2');
    expect(formatOdds(2.5)).toBe('3:2');
    expect(formatOdds(3.5)).toBe('5:2');
    expect(formatOdds(4.5)).toBe('7:2');
    expect(formatOdds(10.5)).toBe('19:2');
    expect(formatOdds(20.5)).toBe('39:2');
  });
});
