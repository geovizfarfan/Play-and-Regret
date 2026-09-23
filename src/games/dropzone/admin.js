// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — admin controls.
// Gifting, manual spawns, enable/disable, channel config, stats.
// ─────────────────────────────────────────────────────────────────────────────
const { db } = require('../../utils/database');
const { CONFIG } = require('./config');
const { getMonster, getMonstersBySeason, isEnabled, setOverride } = require('./monsters');
const { rollMonster } = require('./rarity');
const { postSpawn } = require('./spawn');

async function getConfig(guildId) {
  const row = await db.get('SELECT * FROM dropzone_config WHERE guild_id = ?', [guildId]);
  if (row) return row;
  await db.run('INSERT INTO dropzone_config (guild_id, enabled, current_season) VALUES (?, true, ?) ON CONFLICT (guild_id) DO NOTHING', [guildId, CONFIG.currentSeason]);
  return { guild_id: guildId, enabled: true, current_season: CONFIG.currentSeason, exchange_channel_id: null };
}

async function setGuildEnabled(guildId, enabled) {
  await db.run(
    `INSERT INTO dropzone_config (guild_id, enabled) VALUES (?, ?) ON CONFLICT (guild_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [guildId, enabled]
  );
}

async function setSpawnChannel(guildId, channelId, allow) {
  if (allow) {
    await db.run('INSERT INTO dropzone_spawn_channels (guild_id, channel_id) VALUES (?, ?) ON CONFLICT (guild_id, channel_id) DO NOTHING', [guildId, channelId]);
  } else {
    await db.run('DELETE FROM dropzone_spawn_channels WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
  }
}
async function getSpawnChannels(guildId) {
  return db.all('SELECT channel_id FROM dropzone_spawn_channels WHERE guild_id = ?', [guildId]);
}
async function isSpawnChannelAllowed(guildId, channelId) {
  const rows = await getSpawnChannels(guildId);
  if (!rows.length) return true; // no allow-list configured yet — allow everywhere by default
  return rows.some(r => r.channel_id === channelId);
}

async function setExchangeChannel(guildId, channelId) {
  await db.run(
    `INSERT INTO dropzone_config (guild_id, exchange_channel_id) VALUES (?, ?) ON CONFLICT (guild_id) DO UPDATE SET exchange_channel_id = EXCLUDED.exchange_channel_id`,
    [guildId, channelId]
  );
}

async function setPingRole(guildId, roleId) {
  await db.run(
    `INSERT INTO dropzone_config (guild_id, ping_role_id) VALUES (?, ?) ON CONFLICT (guild_id) DO UPDATE SET ping_role_id = EXCLUDED.ping_role_id`,
    [guildId, roleId]
  );
}

/** Gift a specific sticker (any season, any enabled state) to a user. */
async function giftSticker(targetUserId, monsterId, quantity = 1) {
  const monster = getMonster(monsterId);
  if (!monster) return { error: 'unknown_sticker' };
  const result = await db.get(
    `INSERT INTO dropzone_collections (user_id, monster_id, season, quantity, first_caught_at)
     VALUES (?, ?, ?, ?, NOW())
     ON CONFLICT (user_id, monster_id, season) DO UPDATE SET quantity = dropzone_collections.quantity + ?
     RETURNING quantity`,
    [targetUserId, monsterId, monster.season, quantity, quantity]
  );
  return { success: true, monster, newQuantity: result.quantity };
}

/** Remove copies of a sticker from a user — never lets quantity go negative. */
async function removeSticker(targetUserId, monsterId, quantity = 1) {
  const monster = getMonster(monsterId);
  if (!monster) return { error: 'unknown_sticker' };
  const existing = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [targetUserId, monsterId, monster.season]);
  if (!existing) return { error: 'dont_own' };
  const newQty = Math.max(0, existing.quantity - quantity);
  if (newQty === 0) {
    await db.run('DELETE FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [targetUserId, monsterId, monster.season]);
  } else {
    await db.run('UPDATE dropzone_collections SET quantity = ? WHERE user_id = ? AND monster_id = ? AND season = ?', [newQty, targetUserId, monsterId, monster.season]);
  }
  return { success: true, monster, newQuantity: newQty };
}

/** Force a manual spawn — a specific monster if given, otherwise a normal weighted roll. */
async function manualSpawn(channel, guildId, season, monsterId) {
  const monster = monsterId ? getMonster(monsterId) : rollMonster(season);
  if (!monster) return { error: 'no_monster_available' };
  const cfg = await getConfig(guildId);
  const spawnId = await postSpawn(channel, guildId, monster, 'ADMIN', cfg.ping_role_id);
  return { success: true, spawnId, monster };
}

async function setMonsterEnabled(monsterId, enabled) {
  const monster = getMonster(monsterId);
  if (!monster) return { error: 'unknown_sticker' };
  await setOverride(db, monsterId, enabled);
  return { success: true, monster };
}

async function getStats(guildId, season) {
  const totalCaught = await db.get(`SELECT COALESCE(SUM(quantity),0) AS n FROM dropzone_collections WHERE season = ?`, [season]);
  const naturalSpawns = await db.get(`SELECT COUNT(*) AS n FROM dropzone_spawns WHERE guild_id = ? AND season = ? AND spawn_type = 'NATURAL'`, [guildId, season]);
  const adminSpawns = await db.get(`SELECT COUNT(*) AS n FROM dropzone_spawns WHERE guild_id = ? AND season = ? AND spawn_type = 'ADMIN'`, [guildId, season]);
  const escaped = await db.get(`SELECT COUNT(*) AS n FROM dropzone_spawns WHERE guild_id = ? AND season = ? AND status = 'ESCAPED'`, [guildId, season]);
  const activeCollectors = await db.get(`SELECT COUNT(DISTINCT user_id) AS n FROM dropzone_collections WHERE season = ?`, [season]);
  const mostCaught = await db.get(
    `SELECT monster_id, SUM(quantity) AS n FROM dropzone_collections WHERE season = ? GROUP BY monster_id ORDER BY n DESC LIMIT 1`, [season]
  );

  return {
    totalCaught: totalCaught?.n || 0,
    naturalSpawns: naturalSpawns?.n || 0,
    adminSpawns: adminSpawns?.n || 0,
    escaped: escaped?.n || 0,
    activeCollectors: activeCollectors?.n || 0,
    mostCaught: mostCaught ? { monster: getMonster(mostCaught.monster_id), count: mostCaught.n } : null,
  };
}

module.exports = {
  getConfig, setGuildEnabled, setSpawnChannel, getSpawnChannels, isSpawnChannelAllowed,
  setExchangeChannel, setPingRole, giftSticker, removeSticker, manualSpawn, setMonsterEnabled, getStats,
};
