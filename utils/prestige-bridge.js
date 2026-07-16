/**
 * prestige-bridge.js
 * Add this file to Play & Regret's utils/ folder
 * It writes game events to Prestige Tracker's database
 * 
 * Setup: Add PRESTIGE_DB_URL to Play & Regret's Railway environment variables
 * (copy the DATABASE_URL from Prestige Tracker's Postgres service)
 */

const { Pool } = require('pg');

let prestigePool = null;

function getPrestigePool() {
  if (!prestigePool && process.env.PRESTIGE_DB_URL) {
    prestigePool = new Pool({
      connectionString: process.env.PRESTIGE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 3, // Small pool — this is a secondary DB
    });
  }
  return prestigePool;
}

async function logGameEvent(data) {
  const pool = getPrestigePool();
  if (!pool) return; // PRESTIGE_DB_URL not set — skip silently

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_events (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        event_type TEXT NOT NULL,
        killer TEXT,
        killer_id TEXT,
        victim TEXT,
        victim_id TEXT,
        winner TEXT,
        winner_id TEXT,
        game_session_id TEXT,
        processed INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      INSERT INTO game_events (guild_id, channel_id, game_type, event_type, killer, killer_id, victim, victim_id, winner, winner_id, game_session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      data.guildId, data.channelId, data.gameType, data.eventType,
      data.killer || null, data.killerId || null,
      data.victim || null, data.victimId || null,
      data.winner || null, data.winnerId || null,
      data.gameSessionId || null,
    ]);
  } catch (err) {
    // Never crash Play & Regret over Prestige Tracker issues
    console.error('[Prestige Bridge] Failed to log event:', err.message);
  }
}

// Convenience functions
async function logWinner(guildId, channelId, gameType, winner, winnerId) {
  return logGameEvent({ guildId, channelId, gameType, eventType: 'winner', winner, winnerId });
}

async function logKill(guildId, channelId, gameType, killer, killerId, victim, victimId) {
  return logGameEvent({ guildId, channelId, gameType, eventType: 'kill', killer, killerId, victim, victimId });
}

async function logSuicide(guildId, channelId, gameType, victim, victimId) {
  return logGameEvent({ guildId, channelId, gameType, eventType: 'suicide', victim, victimId });
}

module.exports = { logGameEvent, logWinner, logKill, logSuicide };
