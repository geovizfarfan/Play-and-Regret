/**
 * utils/prestige-bridge.js
 * Writes game events directly to Prestige Tracker's unified tables
 */
const { Pool } = require('pg');

let prestigePool = null;

function getPrestigePool() {
  if (!prestigePool && process.env.PRESTIGE_DB_URL) {
    prestigePool = new Pool({
      connectionString: process.env.PRESTIGE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return prestigePool;
}

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unified_game_wins (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      game_type TEXT NOT NULL,
      channel_id TEXT,
      winner_username TEXT,
      winner_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unified_game_events (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      game_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      killer TEXT,
      victim TEXT,
      winner TEXT,
      avenger TEXT,
      avenged TEXT,
      death_number INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function logWinner(guildId, channelId, gameType, winner, winnerId) {
  const pool = getPrestigePool();
  if (!pool) return;
  try {
    await ensureTables(pool);
    await pool.query(
      `INSERT INTO unified_game_wins (guild_id, game_type, channel_id, winner_username, winner_id) VALUES ($1,$2,$3,$4,$5)`,
      [guildId, gameType, channelId, winner, winnerId || null]
    );
    await pool.query(
      `INSERT INTO unified_game_events (guild_id, channel_id, game_type, event_type, winner) VALUES ($1,$2,$3,'winner',$4)`,
      [guildId, channelId, gameType, winner]
    );
    console.log(`[Prestige Bridge] Logged winner: ${winner} (${gameType})`);
  } catch (err) {
    console.error('[Prestige Bridge] logWinner error:', err.message);
  }
}

async function logKill(guildId, channelId, gameType, killer, killerId, victim, victimId) {
  const pool = getPrestigePool();
  if (!pool) return;
  try {
    await ensureTables(pool);
    await pool.query(
      `INSERT INTO unified_game_events (guild_id, channel_id, game_type, event_type, killer, victim) VALUES ($1,$2,$3,'kill',$4,$5)`,
      [guildId, channelId, gameType, killer, victim || null]
    );
  } catch (err) {
    console.error('[Prestige Bridge] logKill error:', err.message);
  }
}

async function logSuicide(guildId, channelId, gameType, victim, victimId) {
  const pool = getPrestigePool();
  if (!pool) return;
  try {
    await ensureTables(pool);
    await pool.query(
      `INSERT INTO unified_game_events (guild_id, channel_id, game_type, event_type, victim) VALUES ($1,$2,$3,'suicide',$4)`,
      [guildId, channelId, gameType, victim]
    );
  } catch (err) {
    console.error('[Prestige Bridge] logSuicide error:', err.message);
  }
}

module.exports = { logWinner, logKill, logSuicide };
