// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — collection queries.
// Shared logic for /stickers book, /stickers missing, /stickers leaderboard,
// trading (duplicate-only, with counts), and the duplicate → sins exchange
// (either all duplicates at once, or one specific sticker).
// ─────────────────────────────────────────────────────────────────────────────
const { db } = require('../../utils/database');
const { RARITY_ORDER, RARITY_META, CONFIG } = require('./config');
const { getMonstersBySeason, getMonster, isEnabled } = require('./monsters');

async function getUserCollection(userId, season) {
  const rows = await db.all('SELECT * FROM dropzone_collections WHERE user_id = ? AND season = ?', [userId, season]);
  const map = new Map(rows.map(r => [r.monster_id, r]));
  return map;
}

/** Full breakdown for /stickers book — per-rarity counts, total unique, completion %. */
async function buildCollectionSummary(userId, season) {
  const collection = await getUserCollection(userId, season);
  const allMonsters = getMonstersBySeason(season).filter(isEnabled);

  const byRarity = {};
  for (const rarity of RARITY_ORDER) {
    const monstersOfRarity = allMonsters.filter(m => m.rarity === rarity);
    const owned = monstersOfRarity.filter(m => collection.has(m.id));
    byRarity[rarity] = { owned: owned.length, total: monstersOfRarity.length };
  }

  const uniqueOwned = allMonsters.filter(m => collection.has(m.id)).length;
  const totalCatches = [...collection.values()].reduce((sum, r) => sum + r.quantity, 0);
  const duplicates = [...collection.values()].reduce((sum, r) => sum + Math.max(0, r.quantity - 1), 0);

  return {
    uniqueOwned,
    totalMonsters: allMonsters.length,
    completionPct: allMonsters.length ? (uniqueOwned / allMonsters.length * 100) : 0,
    byRarity,
    totalCatches,
    duplicates,
    collection,
  };
}

/** List of monster names the user doesn't have yet (enabled + current season only). */
async function getMissing(userId, season) {
  const collection = await getUserCollection(userId, season);
  const allMonsters = getMonstersBySeason(season).filter(isEnabled);
  return allMonsters.filter(m => !collection.has(m.id));
}

/** Top collectors — by unique count, total catches, or rare+ catches. */
async function getLeaderboard(season, mode = 'unique', limit = 10) {
  if (mode === 'unique') {
    const rows = await db.all(
      `SELECT user_id, COUNT(DISTINCT monster_id) AS score FROM dropzone_collections WHERE season = ? GROUP BY user_id ORDER BY score DESC LIMIT ?`,
      [season, limit]
    );
    return rows;
  }
  if (mode === 'catches') {
    const rows = await db.all(
      `SELECT user_id, SUM(quantity) AS score FROM dropzone_collections WHERE season = ? GROUP BY user_id ORDER BY score DESC LIMIT ?`,
      [season, limit]
    );
    return rows;
  }
  if (mode === 'rare') {
    const rareIds = getMonstersBySeason(season).filter(m => ['legendary', 'mythic'].includes(m.rarity)).map(m => m.id);
    if (!rareIds.length) return [];
    const placeholders = rareIds.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT user_id, SUM(quantity) AS score FROM dropzone_collections WHERE season = ? AND monster_id IN (${placeholders}) GROUP BY user_id ORDER BY score DESC LIMIT ?`,
      [season, ...rareIds, limit]
    );
    return rows;
  }
  return [];
}

/** List of the user's duplicates (quantity > 1) with exact counts — for the trade offer picker and /stickers duplicates. */
async function getDuplicates(userId, season) {
  const collection = await getUserCollection(userId, season);
  const dupes = [];
  for (const row of collection.values()) {
    if (row.quantity <= 1) continue;
    const monster = getMonster(row.monster_id);
    if (!monster) continue;
    dupes.push({ monster, quantity: row.quantity, spareCount: row.quantity - 1 });
  }
  return dupes.sort((a, b) => a.monster.number - b.monster.number);
}

/** How many spare (duplicate) copies of one specific sticker a user has beyond their first. */
async function getSpareCount(userId, monsterId, season) {
  const row = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [userId, monsterId, season]);
  return row ? Math.max(0, row.quantity - 1) : 0;
}

/** Exchange every duplicate (quantity > 1) of a user's stickers for sins, for the given season. */
async function exchangeDuplicates(userId, season) {
  const collection = await getUserCollection(userId, season);
  let sinsEarned = 0;
  let itemsExchanged = 0;
  const breakdown = {};

  for (const row of collection.values()) {
    const dupeCount = row.quantity - 1;
    if (dupeCount <= 0) continue;
    const monster = getMonster(row.monster_id);
    if (!monster) continue;
    const perDupe = CONFIG.dupeSinsValue[monster.rarity] || 0;
    sinsEarned += perDupe * dupeCount;
    itemsExchanged += dupeCount;
    breakdown[monster.rarity] = (breakdown[monster.rarity] || 0) + dupeCount;

    await db.run(
      'UPDATE dropzone_collections SET quantity = 1 WHERE user_id = ? AND monster_id = ? AND season = ?',
      [userId, row.monster_id, season]
    );
  }

  return { sinsEarned, itemsExchanged, breakdown };
}

/** Exchange duplicates of ONE specific sticker for sins — up to `amount` spares (defaults to all spares of that sticker). */
async function exchangeSpecificSticker(userId, monsterId, season, amount = null) {
  const monster = getMonster(monsterId);
  if (!monster) return { error: 'unknown_sticker' };

  const row = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [userId, monsterId, season]);
  const spareCount = row ? Math.max(0, row.quantity - 1) : 0;
  if (spareCount <= 0) return { error: 'no_duplicates' };

  const toExchange = amount ? Math.min(amount, spareCount) : spareCount;
  if (toExchange <= 0) return { error: 'no_duplicates' };

  const perDupe = CONFIG.dupeSinsValue[monster.rarity] || 0;
  const sinsEarned = perDupe * toExchange;
  const newQty = row.quantity - toExchange;

  await db.run('UPDATE dropzone_collections SET quantity = ? WHERE user_id = ? AND monster_id = ? AND season = ?', [newQty, userId, monsterId, season]);

  return { success: true, monster, sinsEarned, itemsExchanged: toExchange, remainingSpares: newQty - 1 };
}

module.exports = {
  getUserCollection, buildCollectionSummary, getMissing, getLeaderboard,
  getDuplicates, getSpareCount, exchangeDuplicates, exchangeSpecificSticker,
};
