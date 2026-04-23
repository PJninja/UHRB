/**
 * Supported rich text tags and their effect names.
 * Add new tags here — no other changes needed.
 */
export const EFFECTS = {
  glow:    'glow',    // Eldritch purple pulse
  gold:    'gold',    // Tarnished gold shimmer
  blood:   'blood',   // Deep red, slightly dripping
  void:    'void',    // Nearly invisible, fades in on hover
  madness: 'madness', // Unstable flicker
  ancient: 'ancient', // Aged sepia with texture
  eldritch:'eldritch',// Sickly green
  cosmic:  'cosmic',  // Deep indigo cold drift — vast, unknowable
  infernal:'infernal',// Orange-amber fire flicker — heat and hunger
  spectral:'spectral',// Pale blue-white fade — ghostly presence
  hex:     'hex',     // Sickly yellow-green pulse — cursed aura
};

const TAG_PATTERN = new RegExp(
  `<(${Object.keys(EFFECTS).join('|')})>([\\s\\S]*?)<\\/\\1>`,
  'gi'
);

/**
 * Parse a string with rich text tags into segments.
 * @param {string} text
 * @returns {{ text: string, effect: string|null }[]}
 */
export function parseRichText(text) {
  if (!text) return [];

  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_PATTERN)) {
    const [full, tag, inner] = match;
    const start = match.index;

    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), effect: null });
    }

    segments.push({ text: inner, effect: EFFECTS[tag.toLowerCase()] });
    lastIndex = start + full.length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), effect: null });
  }

  return segments;
}
