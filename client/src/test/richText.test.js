import { describe, it, expect } from 'vitest';
import { parseRichText, EFFECTS } from '../../src/lib/utils/richText.js';

describe('parseRichText', () => {
  // ─── Falsy inputs ──────────────────────────────────────────────────────────

  it('returns [] for empty string', () => {
    expect(parseRichText('')).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(parseRichText(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseRichText(undefined)).toEqual([]);
  });

  // ─── Plain text ───────────────────────────────────────────────────────────

  it('returns a single null-effect segment for plain text', () => {
    expect(parseRichText('plain text')).toEqual([{ text: 'plain text', effect: null }]);
  });

  // ─── Single tag ───────────────────────────────────────────────────────────

  it('parses a single tag into one segment with the correct effect', () => {
    const result = parseRichText('<glow>shining</glow>');
    expect(result).toEqual([{ text: 'shining', effect: 'glow' }]);
  });

  it('preserves text before a tag as a null-effect segment', () => {
    const result = parseRichText('before <blood>crimson</blood>');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'before ', effect: null });
    expect(result[1]).toEqual({ text: 'crimson', effect: 'blood' });
  });

  it('preserves text after a tag as a null-effect segment', () => {
    const result = parseRichText('<void>shadow</void> after');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'shadow', effect: 'void' });
    expect(result[1]).toEqual({ text: ' after', effect: null });
  });

  it('preserves text surrounding a tag', () => {
    const result = parseRichText('start <gold>treasure</gold> end');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: 'start ', effect: null });
    expect(result[1]).toEqual({ text: 'treasure', effect: 'gold' });
    expect(result[2]).toEqual({ text: ' end', effect: null });
  });

  // ─── Multiple tags ────────────────────────────────────────────────────────

  it('parses adjacent tags as separate segments', () => {
    const result = parseRichText('<glow>glow</glow><blood>blood</blood>');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: 'glow', effect: 'glow' });
    expect(result[1]).toEqual({ text: 'blood', effect: 'blood' });
  });

  it('parses multiple tags with text between them', () => {
    const result = parseRichText('<madness>mad</madness> — <ancient>old</ancient>');
    expect(result).toHaveLength(3);
    expect(result[0].effect).toBe('madness');
    expect(result[1].effect).toBeNull();
    expect(result[2].effect).toBe('ancient');
  });

  // ─── All supported tags ───────────────────────────────────────────────────

  const allTags = Object.keys(EFFECTS);

  it.each(allTags)('recognises the <%s> tag', (tag) => {
    const result = parseRichText(`<${tag}>content</${tag}>`);
    expect(result).toHaveLength(1);
    expect(result[0].effect).toBe(EFFECTS[tag]);
    expect(result[0].text).toBe('content');
  });

  // ─── Unknown/unmatched tags ───────────────────────────────────────────────

  it('treats unknown tags as plain text (no match)', () => {
    const result = parseRichText('<unknown>text</unknown>');
    expect(result).toHaveLength(1);
    expect(result[0].effect).toBeNull();
    expect(result[0].text).toContain('text');
  });

  it('returns plain text if tag is not closed', () => {
    const result = parseRichText('<glow>unclosed');
    expect(result).toHaveLength(1);
    expect(result[0].effect).toBeNull();
  });

  // ─── Case insensitivity ───────────────────────────────────────────────────

  it('is case-insensitive for tag names', () => {
    const result = parseRichText('<GLOW>bright</GLOW>');
    expect(result).toHaveLength(1);
    expect(result[0].effect).toBe('glow');
  });

  // ─── Multiline content ────────────────────────────────────────────────────

  it('handles multiline content inside a tag', () => {
    const result = parseRichText('<eldritch>line one\nline two</eldritch>');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('line one\nline two');
  });
});
