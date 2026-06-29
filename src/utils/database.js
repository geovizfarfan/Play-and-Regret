/**
 * src/utils/database.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL database layer for Play & Regret.
 * Currency: sins
 * Exports: { db, economy, stats, initDB }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

// ─── Raw query helpers ────────────────────────────────────────────────────────
const db = {
  async get(sql, params = []) {
    const { rows } = await pool.query(toPostgres(sql), params);
    return rows[0] || null;
  },
  async all(sql, params = []) {
    const { rows } = await pool.query(toPostgres(sql), params);
    return rows;
  },
  async run(sql, params = []) {
    let q = toPostgres(sql);
    // Only append RETURNING id for tables that have a serial id column
    // Tables using user_id or other PKs must not get this appended
    const hasSerialId = /INTO\s+(transactions|bets|bet_entries|jackpot_sessions|jackpot_entries|jackpot_history|shop_inventory|rs_inventory|rs_matches|rs_match_players|rs_schedules|rs_schedule_players)/i;
    if (/^\s*INSERT/i.test(q) && !/RETURNING/i.test(q) && hasSerialId.test(q)) {
      q += ' RETURNING id';
    }
    const { rows, rowCount } = await pool.query(q, params);
    return { rowCount, lastInsertRowid: rows[0]?.id ?? null };
  },
  async exec(sql) {
    await pool.query(sql);
  },
};

function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ─── Economy ──────────────────────────────────────────────────────────────────
const economy = {
  async getUser(userId, username) {
    await db.run(
      `INSERT INTO users (user_id, username) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
      [userId, username]
    );
    return db.get('SELECT * FROM users WHERE user_id = ?', [userId]);
  },

  async getBalance(userId) {
    const row = await db.get('SELECT balance FROM users WHERE user_id = ?', [userId]);
    return row ? Number(row.balance) : 0;
  },

  async addFunds(userId, amount, reason = '') {
    await db.run(
      `UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?`,
      [amount, amount, userId]
    );
    await db.run(
      'INSERT INTO transactions (user_id, amount, reason) VALUES (?, ?, ?)',
      [userId, amount, reason]
    );
  },

  async removeFunds(userId, amount, reason = '') {
    const bal = await this.getBalance(userId);
    if (bal < amount) return false;
    await db.run(
      `UPDATE users SET balance = balance - ?, total_spent = total_spent + ? WHERE user_id = ?`,
      [amount, amount, userId]
    );
    await db.run(
      'INSERT INTO transactions (user_id, amount, reason) VALUES (?, ?, ?)',
      [userId, -amount, reason]
    );
    return true;
  },

  async setFunds(userId, amount) {
    await db.run('UPDATE users SET balance = ? WHERE user_id = ?', [amount, userId]);
  },

  async transfer(fromId, toId, amount, reason = '') {
    const bal = await this.getBalance(fromId);
    if (bal < amount) return false;
    await db.run(
      'UPDATE users SET balance = balance - ?, total_spent = total_spent + ? WHERE user_id = ?',
      [amount, amount, fromId]
    );
    await db.run(
      'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?',
      [amount, amount, toId]
    );
    return true;
  },

  async claimDaily(userId) {
    const row = await db.get('SELECT last_daily, daily_streak FROM users WHERE user_id = ?', [userId]);
    if (!row) return { success: false, reason: 'no_user' };

    const now      = Date.now();
    const last     = row.last_daily ? new Date(row.last_daily).getTime() : 0;
    const diff     = now - last;
    const cooldown = 24 * 3_600_000;

    if (diff < cooldown) {
      const remaining = cooldown - diff;
      return {
        success: false,
        reason:  'cooldown',
        hours:   Math.floor(remaining / 3_600_000),
        minutes: Math.floor((remaining % 3_600_000) / 60_000),
      };
    }

    const streak = diff < 48 * 3_600_000 ? (Number(row.daily_streak) || 0) + 1 : 1;
    const base   = 100;
    const bonus  = Math.min(streak - 1, 6) * 25;
    const amount = base + bonus;

    // Regret increases with streak — you cannot escape
    // Regret scaling — threatening but not absurd
    // Stays below sins at healthy play, creeps up with long streaks
    let regretGain;
    if (streak <= 6)       regretGain = 30 + Math.floor(Math.random() * 20);       // 30–50
    else if (streak <= 13) regretGain = 60 + Math.floor(Math.random() * 30);       // 60–90
    else if (streak <= 29) regretGain = 100 + Math.floor(Math.random() * 50);      // 100–150
    else                   regretGain = 180 + Math.floor(Math.random() * 70);      // 180–250
    await db.run(
      `UPDATE users
       SET balance = balance + ?, total_earned = total_earned + ?,
           last_daily = NOW(), daily_streak = ?,
           regret = regret + ?
       WHERE user_id = ?`,
      [amount, amount, streak, regretGain, userId]
    );
    return { success: true, amount, streak, regretGain };
  },

  async getLeaderboard(limit = 10) {
    return db.all(
      'SELECT user_id, username, balance FROM users ORDER BY balance DESC LIMIT ?',
      [limit]
    );
  },

  async getRegret(userId) {
    const row = await db.get('SELECT regret FROM users WHERE user_id = ?', [userId]);
    return row ? Number(row.regret) : 0;
  },

  async addRegret(userId, amount) {
    await db.run('UPDATE users SET regret = GREATEST(0, regret + ?) WHERE user_id = ?', [amount, userId]);
    return this.getRegret(userId);
  },

  async setRegret(userId, amount) {
    await db.run('UPDATE users SET regret = GREATEST(0, ?) WHERE user_id = ?', [Math.max(0, amount), userId]);
  },

  // ── Active game tracking ──────────────────────────────────────────────────
  async trackGameEntry(userId, username, channelId, game, bet) {
    await db.run(
      'INSERT INTO active_game_players (user_id, username, channel_id, game, bet) VALUES ($1,$2,$3,$4,$5)',
      [userId, username, channelId, game, bet]
    ).catch(() => {});
  },
  async untrackGameEntry(userId, channelId) {
    await db.run('DELETE FROM active_game_players WHERE user_id=$1 AND channel_id=$2', [userId, channelId]).catch(() => {});
  },
  async untrackGameChannel(channelId) {
    await db.run('DELETE FROM active_game_players WHERE channel_id=$1', [channelId]).catch(() => {});
  },
  async getPendingRefunds() {
    return db.all('SELECT * FROM active_game_players ORDER BY joined_at ASC');
  },
  async run(sql, params) {
    return db.run(sql, params);
  },
};

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  async get(userId) {
    let row = await db.get('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
    if (!row) {
      await db.run('INSERT INTO user_stats (user_id) VALUES (?) ON CONFLICT DO NOTHING', [userId]);
      row = await db.get('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
    }
    return row || {};
  },

  async increment(userId, field, amount = 1) {
    const allowed = [
      'cuarenta_wins','cuarenta_losses',
      'loteria_wins','loteria_losses',
      'tictactoe_wins','tictactoe_losses','tictactoe_draws',
      'blackjack_wins','blackjack_losses','blackjack_games',
      'cuy_wins','cuy_losses','cuy_games',
      'memory_wins','memory_losses',
      'rumble_wins','rumble_losses','rumble_participations',
    ];
    if (!allowed.includes(field)) return;
    await db.run(
      `INSERT INTO user_stats (user_id, ${field}) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET ${field} = user_stats.${field} + ?`,
      [userId, amount, amount]
    );
    if (field.endsWith('_wins'))   await this._updateStreak(userId, true);
    if (field.endsWith('_losses')) await this._updateStreak(userId, false);
  },

  async incrementStreak(userId) { await this._updateStreak(userId, true);  },
  async resetStreak(userId)     { await this._updateStreak(userId, false); },

  async getStreak(userId) {
    const row = await db.get('SELECT win_streak FROM user_stats WHERE user_id = ?', [userId]);
    return row?.win_streak || 0;
  },

  async _updateStreak(userId, won) {
    if (won) {
      await db.run(
        `INSERT INTO user_stats (user_id, win_streak, best_streak) VALUES (?, 1, 1)
         ON CONFLICT (user_id) DO UPDATE
           SET win_streak  = user_stats.win_streak + 1,
               best_streak = GREATEST(user_stats.best_streak, user_stats.win_streak + 1)`,
        [userId]
      );
    } else {
      await db.run(
        `INSERT INTO user_stats (user_id, win_streak) VALUES (?, 0)
         ON CONFLICT (user_id) DO UPDATE SET win_streak = 0`,
        [userId]
      );
    }
  },
};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       TEXT PRIMARY KEY,
      username      TEXT NOT NULL DEFAULT '',
      balance       BIGINT NOT NULL DEFAULT 0,
      total_earned  BIGINT NOT NULL DEFAULT 0,
      total_spent   BIGINT NOT NULL DEFAULT 0,
      last_daily    TIMESTAMPTZ,
      daily_streak  INT NOT NULL DEFAULT 0,
      regret        BIGINT NOT NULL DEFAULT 0,
      last_cleanse  TIMESTAMPTZ,
      last_confess  TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id         BIGSERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      amount     BIGINT NOT NULL,
      reason     TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      user_id              TEXT PRIMARY KEY,
      cuarenta_wins        INT DEFAULT 0,
      cuarenta_losses      INT DEFAULT 0,
      loteria_wins         INT DEFAULT 0,
      loteria_losses       INT DEFAULT 0,
      tictactoe_wins       INT DEFAULT 0,
      tictactoe_losses     INT DEFAULT 0,
      tictactoe_draws      INT DEFAULT 0,
      blackjack_wins       INT DEFAULT 0,
      blackjack_losses     INT DEFAULT 0,
      rumble_wins          INT DEFAULT 0,
      rumble_losses        INT DEFAULT 0,
      rumble_participations INT DEFAULT 0,
      blackjack_games      INT DEFAULT 0,
      cuy_wins             INT DEFAULT 0,
      cuy_losses           INT DEFAULT 0,
      cuy_games            INT DEFAULT 0,
      memory_wins          INT DEFAULT 0,
      memory_losses        INT DEFAULT 0,
      win_streak           INT DEFAULT 0,
      best_streak          INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bets (
      id          BIGSERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT DEFAULT '',
      creator_id  TEXT NOT NULL,
      status      TEXT DEFAULT 'open',
      outcome     TEXT,
      total_pool  BIGINT DEFAULT 0,
      closes_at   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bet_entries (
      id        BIGSERIAL PRIMARY KEY,
      bet_id    BIGINT NOT NULL,
      user_id   TEXT NOT NULL,
      username  TEXT NOT NULL,
      side      TEXT NOT NULL,
      amount    BIGINT NOT NULL,
      placed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(bet_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS jackpot_draw_fund (
      id     INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      amount BIGINT DEFAULT 0
    );
    INSERT INTO jackpot_draw_fund (id, amount) VALUES (1, 0) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS jackpot_sessions (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT 'Jackpot',
      status     TEXT DEFAULT 'active',
      channel_id TEXT,
      pot        BIGINT DEFAULT 0,
      starts_at  TIMESTAMPTZ DEFAULT NOW(),
      ends_at    TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jackpot_entries (
      id         BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL,
      user_id    TEXT NOT NULL,
      username   TEXT NOT NULL,
      number     INT NOT NULL,
      entered_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(session_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS jackpot_history (
      id           BIGSERIAL PRIMARY KEY,
      session_id   BIGINT,
      session_name TEXT,
      winner_id    TEXT,
      winner_name  TEXT,
      winning_num  INT,
      amount_won   BIGINT,
      drawn_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shop_inventory (
      id        BIGSERIAL PRIMARY KEY,
      user_id   TEXT NOT NULL,
      token_id  TEXT NOT NULL,
      bought_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, token_id)
    );

    CREATE TABLE IF NOT EXISTS shop_equipped (
      user_id  TEXT NOT NULL,
      slot     TEXT NOT NULL,
      token_id TEXT NOT NULL,
      PRIMARY KEY (user_id, slot)
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      user_id   TEXT NOT NULL,
      item_type TEXT NOT NULL,
      emoji     TEXT NOT NULL,
      equipped  INT DEFAULT 1,
      bought_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, item_type)
    );

    CREATE TABLE IF NOT EXISTS rs_players (
      user_id             TEXT PRIMARY KEY,
      username            TEXT NOT NULL DEFAULT '',
      emoji_tag           TEXT DEFAULT '👑',
      extra_emoji         TEXT DEFAULT '',
      xp                  INT DEFAULT 0,
      total_xp            INT DEFAULT 0,
      level               INT DEFAULT 1,
      power               INT DEFAULT 10,
      wins                INT DEFAULT 0,
      losses              INT DEFAULT 0,
      games_played        INT DEFAULT 0,
      equipped_weapon_id  TEXT DEFAULT NULL,
      backpacks_basic     INT DEFAULT 0,
      backpacks_royal     INT DEFAULT 0,
      backpacks_cursed    INT DEFAULT 0,
      rig_level           TEXT DEFAULT 'none',
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rs_inventory (
      id           BIGSERIAL PRIMARY KEY,
      user_id      TEXT NOT NULL,
      item_id      TEXT NOT NULL,
      item_name    TEXT NOT NULL,
      item_type    TEXT NOT NULL,
      rarity       TEXT DEFAULT 'common',
      power_bonus  INT DEFAULT 0,
      effect       TEXT DEFAULT 'none',
      effect_value INT DEFAULT 0,
      description  TEXT DEFAULT '',
      acquired_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rs_settings (
      id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      rigrandom     BOOLEAN DEFAULT FALSE,
      riggedmode    TEXT DEFAULT 'hidden',
      staff_role_id TEXT DEFAULT NULL
    );
    INSERT INTO rs_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS rs_matches (
      id           BIGSERIAL PRIMARY KEY,
      channel_id   TEXT NOT NULL,
      played_at    TIMESTAMPTZ DEFAULT NOW(),
      player_count INT NOT NULL DEFAULT 0,
      pot          BIGINT NOT NULL DEFAULT 0,
      winner_id    TEXT,
      winner_name  TEXT
    );

    CREATE TABLE IF NOT EXISTS rs_match_players (
      id           BIGSERIAL PRIMARY KEY,
      match_id     BIGINT NOT NULL REFERENCES rs_matches(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL,
      username     TEXT NOT NULL,
      finish_pos   INT NOT NULL,
      death_type   TEXT DEFAULT 'normal',
      sins_won     BIGINT DEFAULT 0,
      regret_added BIGINT DEFAULT 0,
      kills        INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rs_rigged_roles (
      role_id   TEXT PRIMARY KEY,
      role_name TEXT NOT NULL,
      rig_level TEXT NOT NULL DEFAULT 'petty'
    );

    CREATE TABLE IF NOT EXISTS rs_schedules (
      id         BIGSERIAL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      bet        INT NOT NULL DEFAULT 50,
      fire_at    TIMESTAMPTZ,
      host_id    TEXT NOT NULL,
      host_name  TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(channel_id)
    );

    CREATE TABLE IF NOT EXISTS rs_match_kills (
      id          BIGSERIAL PRIMARY KEY,
      match_id    BIGINT NOT NULL,
      kill_order  INT NOT NULL,
      killer_id   TEXT,
      killer_name TEXT,
      victim_id   TEXT NOT NULL,
      victim_name TEXT NOT NULL,
      kill_type   TEXT DEFAULT 'normal',
      round_num   INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS memory_leaderboard (
      id         BIGSERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      username   TEXT NOT NULL,
      size       TEXT NOT NULL,
      time_secs  INT NOT NULL,
      moves      INT DEFAULT 0,
      date       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, size)
    );

    CREATE TABLE IF NOT EXISTS rs_bounties (
      id           BIGSERIAL PRIMARY KEY,
      channel_id   TEXT NOT NULL,
      type         TEXT NOT NULL,
      target_id    TEXT,
      target_name  TEXT,
      death_number INT,
      prize        TEXT NOT NULL,
      payee        TEXT,
      claimed_by   TEXT,
      claimed_name TEXT,
      claimed_at   TIMESTAMPTZ,
      match_id     BIGINT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rs_schedule_players (
      id          BIGSERIAL PRIMARY KEY,
      schedule_id BIGINT NOT NULL REFERENCES rs_schedules(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL,
      username    TEXT NOT NULL,
      joined_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(schedule_id, user_id)
    );
  `);

  // Migrations — safely add columns to existing tables
  const migrations = [
    // Match tracking tables (added v2.1)
    `CREATE TABLE IF NOT EXISTS rs_matches (
      id BIGSERIAL PRIMARY KEY, channel_id TEXT NOT NULL,
      played_at TIMESTAMPTZ DEFAULT NOW(), player_count INT DEFAULT 0,
      pot BIGINT DEFAULT 0, winner_id TEXT, winner_name TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rs_match_players (
      id BIGSERIAL PRIMARY KEY, match_id BIGINT NOT NULL REFERENCES rs_matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, username TEXT NOT NULL, finish_pos INT NOT NULL,
      death_type TEXT DEFAULT 'normal', sins_won BIGINT DEFAULT 0,
      regret_added BIGINT DEFAULT 0, kills INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS rs_match_kills (
      id BIGSERIAL PRIMARY KEY, match_id BIGINT NOT NULL,
      kill_order INT NOT NULL, killer_id TEXT, killer_name TEXT,
      victim_id TEXT NOT NULL, victim_name TEXT NOT NULL,
      kill_type TEXT DEFAULT 'normal', round_num INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS memory_leaderboard (
      id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
      size TEXT NOT NULL, time_secs INT NOT NULL, moves INT DEFAULT 0,
      date TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, size)
    )`,
    `CREATE TABLE IF NOT EXISTS rs_bounties (
      id BIGSERIAL PRIMARY KEY, channel_id TEXT NOT NULL,
      type TEXT NOT NULL, target_id TEXT, target_name TEXT,
      death_number INT, prize TEXT NOT NULL, payee TEXT,
      claimed_by TEXT, claimed_name TEXT, claimed_at TIMESTAMPTZ,
      match_id BIGINT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    'ALTER TABLE rs_settings ADD COLUMN IF NOT EXISTS bounty_role_id TEXT DEFAULT NULL',
    'ALTER TABLE rs_settings ADD COLUMN IF NOT EXISTS log_channel_id TEXT DEFAULT NULL',
    `CREATE TABLE IF NOT EXISTS active_game_players (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL,
      username    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      game        TEXT NOT NULL,
      bet         BIGINT NOT NULL DEFAULT 0,
      joined_at   TIMESTAMPTZ DEFAULT NOW()
    )`,
    'ALTER TABLE rs_settings ADD COLUMN IF NOT EXISTS log_channel_id TEXT DEFAULT NULL',
    'ALTER TABLE rs_bounties ADD COLUMN IF NOT EXISTS void_reason TEXT DEFAULT NULL',

    // ── Regret Games ───────────────────────────────────────────────────────────
    'CREATE TABLE IF NOT EXISTS rg_seasons (id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL UNIQUE, arena_channel_id TEXT, votes_channel_id TEXT, entry_fee INTEGER DEFAULT 500, status TEXT DEFAULT \'setup\', current_day INTEGER DEFAULT 0, pot INTEGER DEFAULT 0, prize_pot INTEGER DEFAULT 0, vote_open INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS rg_players (id SERIAL PRIMARY KEY, season_id INTEGER NOT NULL, user_id TEXT NOT NULL, username TEXT, status TEXT DEFAULT \'alive\', regret INTEGER DEFAULT 0, sins_earned INTEGER DEFAULT 0, food INTEGER DEFAULT 1, has_shield INTEGER DEFAULT 0, title TEXT, elim_cause TEXT, elim_day INTEGER, UNIQUE(season_id, user_id))',
    'CREATE TABLE IF NOT EXISTS rg_alliances (id SERIAL PRIMARY KEY, season_id INTEGER NOT NULL, user_a TEXT NOT NULL, username_a TEXT, user_b TEXT NOT NULL, username_b TEXT, status TEXT DEFAULT \'active\', created_at TIMESTAMP DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS rg_votes (id SERIAL PRIMARY KEY, season_id INTEGER NOT NULL, voter_id TEXT NOT NULL, voter_name TEXT, target_id TEXT NOT NULL, target_name TEXT, day INTEGER NOT NULL, created_at TIMESTAMP DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS rg_inventory (id SERIAL PRIMARY KEY, season_id INTEGER NOT NULL, user_id TEXT NOT NULL, item_id TEXT NOT NULL, qty INTEGER DEFAULT 1, UNIQUE(season_id, user_id, item_id))',
    'ALTER TABLE jackpot_sessions ADD COLUMN IF NOT EXISTS live_message_id TEXT DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS regret BIGINT NOT NULL DEFAULT 0',
    'ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS blackjack_games INT DEFAULT 0',
    'ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS cuy_wins INT DEFAULT 0',
    'ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS cuy_losses INT DEFAULT 0',
    'ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS cuy_games INT DEFAULT 0',
    'ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS memory_wins INT DEFAULT 0',
    'ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS memory_losses INT DEFAULT 0',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_cleanse TIMESTAMPTZ',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_confess TIMESTAMPTZ',
    'ALTER TABLE bets ADD COLUMN IF NOT EXISTS options TEXT[] DEFAULT NULL',
  ];
  for (const m of migrations) {
    await pool.query(m).catch(() => {});
  }

  console.log('[DB] All tables ready.');
}

module.exports = { db, economy, stats, initDB };
