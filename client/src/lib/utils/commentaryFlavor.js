/**
 * Pick one template at random and slot in a monster's own racingStyle/temperament,
 * so event commentary narrates the specific field racing rather than generic beats.
 * @param {object} monster
 * @param {(ctx: {name: string, style: string, temperament: string}) => string} [] templates
 * @returns {string}
 */
export function flavorLine(monster, templates) {
  const ctx = {
    name: monster.name,
    style: (monster.racingStyle || '').toLowerCase(),
    temperament: (monster.temperament || '').toLowerCase(),
  };
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template(ctx);
}
