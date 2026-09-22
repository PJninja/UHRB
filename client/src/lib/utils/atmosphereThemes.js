// Per-venue particle atmosphere configs, consumed by RaceAtmosphere.svelte.
// Keyed by the `backdrop` enum on a server venue record (server/src/data/venueData.js).
// Each shape is a categorically different render (not a palette swap of one
// system) so venues feel drastically different, not just re-tinted.
//
// A theme is `{ layers: [...] }` — most themes have a single particle layer,
// but a theme can combine several layers (e.g. a slow dense fog layer plus a
// faster "dancing" fog layer, or a full-canvas pulsing glow plus a handful of
// drifting gas wisps) to build a more complex scene.
//
// Layer kinds:
//   'particles' — a pool of `count` particles, each independently sized/timed/
//     colored, moving per dyDir/dxDir (+ an optional 'wave' motion — a sine-
//     wave horizontal oscillation layered on top, amplitude/frequency
//     randomized per particle from waveAmpMin/Max, waveFreqMin/Max).
//   'glow' — a single full-width gradient anchored at the canvas edge given by
//     `position`, whose opacity pulses slowly over time between opacityMin/Max.
//
// Opacity values here are intentionally much higher than a typical subtle
// background flourish (e.g. Home.svelte's rune drift) — venues are meant to
// be immediately, obviously different from one race to the next, not a
// barely-there texture.
export const RUNE_GLYPHS = ['ᛟ', 'ᛦ', 'ᛏ', 'ᚦ', 'ᚷ', 'ᚱ', 'ᚢ', 'ᚠ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛒ', 'ᛖ', 'ᛗ'];

export const ATMOSPHERE_THEMES = {
  // Drifting runic glyphs, adapted from Home.svelte's rune background.
  ruins: {
    layers: [
      {
        kind: 'particles', shape: 'rune', count: 55,
        colors: ['#9b87c5', '#c9b8ff'],
        sizeMin: 18, sizeMax: 38,
        speedMin: 0.08, speedMax: 0.28,
        dyDir: -1, dxDir: 0,
        opacityMin: 0.14, opacityMax: 0.38,
        motion: 'straight',
      },
    ],
  },
  // Fast falling red rain streaks.
  bloodRain: {
    layers: [
      {
        kind: 'particles', shape: 'streak', count: 130,
        colors: ['#c85050', '#ff6b6b'],
        sizeMin: 16, sizeMax: 32,
        speedMin: 5, speedMax: 11,
        dyDir: 1, dxDir: 0,
        opacityMin: 0.35, opacityMax: 0.65,
        motion: 'straight',
      },
    ],
  },
  // Soft green fog blobs drifting sideways (Dead Marsh), plus a sparse layer
  // of small, fast, flickering pale wisps darting through it — will-o'-the-wisp
  // spirits, much quicker than the fog itself so they read as something alive
  // moving through the mass rather than more fog.
  fog: {
    layers: [
      {
        kind: 'particles', shape: 'blob', count: 9,
        colors: ['#4fa87a'],
        sizeMin: 160, sizeMax: 320,
        speedMin: 0.08, speedMax: 0.2,
        dyDir: 0, dxDir: 1,
        opacityMin: 0.20, opacityMax: 0.40,
        motion: 'straight',
      },
      {
        kind: 'particles', shape: 'wisp', count: 3,
        colors: ['#bfe8d8', '#8fd8c8'],
        sizeMin: 7, sizeMax: 14,
        stretchMin: 1.0, stretchMax: 1.3, // small, round orbs, not elongated gas
        speedMin: 0.8, speedMax: 1.6,
        opacityMin: 0.35, opacityMax: 0.6,
        motion: 'drift',
        turnRateMin: 0.015, turnRateMax: 0.045,
        flicker: true,
      },
    ],
  },
  // Large translucent vertical ribbons sweeping slowly across, cycling through
  // a full northern-lights spread (green/teal dominant, with blue/violet/pink
  // threaded through) rather than a narrow blue-purple range.
  aurora: {
    layers: [
      {
        kind: 'particles', shape: 'ribbon', count: 7,
        colors: ['#4fd68c', '#3ad6c4', '#5c8ac0', '#9b7cff', '#e06cc4'],
        sizeMin: 220, sizeMax: 460,
        speedMin: 0.04, speedMax: 0.1,
        dyDir: 0, dxDir: 1,
        opacityMin: 0.22, opacityMax: 0.42,
        motion: 'straight',
      },
    ],
  },
  // A slowly pulsing deep-red glow rising from the bottom edge, plus soft
  // gas-like wisps drifting up through it (The Last Ember of a Dead Star) —
  // no discrete sparks at all.
  dyingEmber: {
    layers: [
      {
        kind: 'glow', position: 'bottom',
        color: '#6e1414',
        pulseSpeed: 0.0012,
        opacityMin: 0.16, opacityMax: 0.46,
        heightFrac: 0.55,
      },
      {
        kind: 'particles', shape: 'wisp', count: 10,
        colors: ['#8b2020', '#5c1010', '#a8402f'],
        sizeMin: 70, sizeMax: 150,
        speedMin: 0.04, speedMax: 0.12,
        dyDir: -1, dxDir: 0,
        opacityMin: 0.10, opacityMax: 0.26,
        motion: 'wave',
        waveAmpMin: 0.2, waveAmpMax: 0.8,
        waveFreqMin: 0.008, waveFreqMax: 0.02,
      },
    ],
  },
};
