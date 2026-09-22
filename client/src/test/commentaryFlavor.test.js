import { describe, it, expect } from 'vitest';
import { flavorLine } from '../../src/lib/utils/commentaryFlavor.js';
import { parseRichText } from '../../src/lib/utils/richText.js';

function makeMonster(overrides = {}) {
  return {
    name: 'Grimlock',
    racingStyle: 'Crawls',
    temperament: '<blood>Aggressive</blood>',
    ...overrides,
  };
}

describe('flavorLine', () => {
  it('interpolates the monster name into the resulting line', () => {
    const line = flavorLine(makeMonster(), [
      ({ name }) => `${name} surges forward.`,
    ]);
    expect(line).toBe('Grimlock surges forward.');
  });

  it('lowercases racingStyle before interpolating', () => {
    const line = flavorLine(makeMonster(), [
      ({ name, style }) => `${name} ${style} into the lead.`,
    ]);
    expect(line).toBe('Grimlock crawls into the lead.');
  });

  it('lowercases temperament before interpolating', () => {
    const line = flavorLine(makeMonster(), [
      ({ name, temperament }) => `${name} presses on, ${temperament}.`,
    ]);
    expect(line).toBe('Grimlock presses on, <blood>aggressive</blood>.');
  });

  it('falls back to an empty string when racingStyle/temperament are missing', () => {
    const line = flavorLine(makeMonster({ racingStyle: undefined, temperament: undefined }), [
      ({ style, temperament }) => `[${style}][${temperament}]`,
    ]);
    expect(line).toBe('[][]');
  });

  it('picks one of the given templates', () => {
    const templates = [
      () => 'template-a',
      () => 'template-b',
    ];
    for (let i = 0; i < 20; i++) {
      expect(templates.map(t => t())).toContain(flavorLine(makeMonster(), templates));
    }
  });

  it('output with embedded tags round-trips cleanly through parseRichText', () => {
    const line = flavorLine(makeMonster(), [
      ({ name, temperament }) => `${name} presses on, ${temperament}.`,
    ]);
    const segments = parseRichText(line);
    expect(segments.some(s => s.effect === 'blood' && s.text === 'aggressive')).toBe(true);
  });
});
