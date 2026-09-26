/**
 * src/utils/velouraDb.js
 * ─────────────────────────────────────────────────────────────────────────
 * Read/write connection into Veloura's database — the mirror image of
 * Veloura's own playAndRegretDb.js. Veloura now owns every server's
 * currency (economy_groups / guild_balances / guild_config /
 * currency_transactions); this bot's games read and write balances through
 * here instead of the old local `users` table.
 * ─────────────────────────────────────────────────────────────────────────
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.VELOURA_DB_URL,
  ssl: process.env.VELOURA_DB_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

module.exports = { query, pool };
