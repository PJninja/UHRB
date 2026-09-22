// Race venue/atmosphere flavor — cosmetic only, no mechanical effect.
// Picked once per race in raceScheduler.js. Distinct from nameData.js's
// `locations` (a monster's own hometown flavor) — a venue is the shared
// setting the whole race takes place in.
//
// `backdrop` selects which particle system the client's RaceAtmosphere
// component renders (see client/src/lib/utils/atmosphereThemes.js) — kept
// to a handful of enum values so every venue gets a genuinely distinct
// canvas render, while `accent` still lets venues sharing a backdrop read
// slightly differently (glow tint + particle color blend).
export const venues = [
  {
    id: 'sunken-amphitheater',
    name: 'The Sunken Amphitheater',
    flavorLine: 'Water pools in seats that have not been dry since before the first race.',
    accent: '#5a4a7e',
    backdrop: 'ruins',
  },
  {
    id: 'crimson-flats',
    name: 'The Crimson Flats',
    flavorLine: 'The ground here remembers every race that has ever ended badly.',
    accent: '#8b3a3a',
    backdrop: 'bloodRain',
  },
  {
    id: 'dead-marsh',
    name: 'Dead Marsh',
    flavorLine: 'The fog does not lift. It has never lifted. It watches.',
    accent: '#3d7a5c',
    backdrop: 'fog',
  },
  {
    id: 'glass-cathedral',
    name: 'The Glass Cathedral',
    flavorLine: 'Light refracts through the shattered dome in patterns the officials have stopped trying to explain.',
    accent: '#5c6ab0',
    backdrop: 'aurora',
  },
  {
    id: 'last-ember-of-a-dead-star',
    name: 'The Last Ember of a Dead Star',
    flavorLine: 'The light here is older than the crowd watching it burn out.',
    accent: '#ffb347',
    backdrop: 'dyingEmber',
  },
];
