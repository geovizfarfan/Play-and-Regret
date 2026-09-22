// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — rarity roll engine.
// Rolls rarity FIRST (weighted), then picks a random ENABLED monster within
// that rarity for the current season. If a rolled rarity has zero enabled
// monsters, falls back to the next-best rarity with something available
// rather than crashing or producing an invalid spawn.
// ─────────────────────────────────────────────────────────────────────────────
const { RARITY_ORDER, RARITY_META } = require('./config');
const { getEnabledMonstersByRarity } = require('./monsters');

function rollRarity() {
  const total = RARITY_ORDER.reduce((sum, r) => sum + RARITY_META[r].weight, 0);
  let roll = Math.random() * total;
  for (const rarity of RARITY_ORDER) {
    roll -= RARITY_META[rarity].weight;
    if (roll <= 0) return rarity;
  }
  return RARITY_ORDER[RARITY_ORDER.length - 1];
}

/**
 * Rolls a rarity, then picks a random enabled monster of that rarity for the
 * given season. Falls back through nearby rarities (closest weight first) if
 * the rolled tier has nothing enabled yet, so a half-released season never
 * produces a dead spawn.
 */
function rollMonster(season) {
  const rolled = rollRarity();
  const tryOrder = [rolled, ...RARITY_ORDER.filter(r => r !== rolled)];

  for (const rarity of tryOrder) {
    const pool = getEnabledMonstersByRarity(rarity, season);
    if (pool.length) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return null; // nothing enabled anywhere for this season — caller must handle
}

module.exports = { rollRarity, rollMonster };
