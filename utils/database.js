const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open (or create) the database file
const db = new sqlite3.Database(path.join(__dirname, '..', 'boardbucks.db'));

// Helper: run a query that modifies data (INSERT, UPDATE, DELETE, CREATE)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}

// Helper: get one row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper: get all rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper: run multiple statements (for schema init)
function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Initialize tables
async function initDB() {
  await exec(`
    CREATE TABLE IF NOT EXISTS economy (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      balance INTEGER DEFAULT 500,
      total_earned INTEGER DEFAULT 500,
      total_spent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_daily DATETIME
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user TEXT,
      to_user TEXT,
      amount INTEGER,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      outcome TEXT,
      polymarket_id TEXT,
      total_pool INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closes_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS bet_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bet_id INTEGER,
      user_id TEXT,
      username TEXT,
      side TEXT,
      amount INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(bet_id) REFERENCES bets(id)
    );

    CREATE TABLE IF NOT EXISTS game_stats (
      user_id TEXT PRIMARY KEY,
      loteria_wins INTEGER DEFAULT 0,
      loteria_losses INTEGER DEFAULT 0,
      cuarenta_wins INTEGER DEFAULT 0,
      cuarenta_losses INTEGER DEFAULT 0,
      tictactoe_wins INTEGER DEFAULT 0,
      win_streak INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      tictactoe_losses INTEGER DEFAULT 0,
      tictactoe_draws INTEGER DEFAULT 0,
      hunger_games_wins INTEGER DEFAULT 0,
      hunger_games_participations INTEGER DEFAULT 0,
      rumble_wins INTEGER DEFAULT 0,
      rumble_participations INTEGER DEFAULT 0
    );
  `);

  // Migrations — add columns to existing tables if they don't exist yet
  await run('ALTER TABLE game_stats ADD COLUMN win_streak INTEGER DEFAULT 0').catch(() => {});
  await run('ALTER TABLE game_stats ADD COLUMN best_streak INTEGER DEFAULT 0').catch(() => {});
  await run('ALTER TABLE game_stats ADD COLUMN tictactoe_draws INTEGER DEFAULT 0').catch(() => {});
  await run('ALTER TABLE game_stats ADD COLUMN hunger_games_wins INTEGER DEFAULT 0').catch(() => {});
  await run('ALTER TABLE game_stats ADD COLUMN hunger_games_participations INTEGER DEFAULT 0').catch(() => {});
  await run('ALTER TABLE game_stats ADD COLUMN rumble_wins INTEGER DEFAULT 0').catch(() => {});
  await run('ALTER TABLE game_stats ADD COLUMN rumble_participations INTEGER DEFAULT 0').catch(() => {});
}

// ─── Economy functions ────────────────────────────────────────────────────────
const economy = {
  async getUser(userId, username) {
    let user = await get('SELECT * FROM economy WHERE user_id = ?', [userId]);
    if (!user) {
      await run('INSERT INTO economy (user_id, username, balance) VALUES (?, ?, 500)', [userId, username || userId]);
      user = await get('SELECT * FROM economy WHERE user_id = ?', [userId]);
    }
    return user;
  },

  async getBalance(userId) {
    const user = await get('SELECT balance FROM economy WHERE user_id = ?', [userId]);
    return user ? user.balance : 0;
  },

  async addFunds(userId, amount, reason = 'Admin grant') {
    const user = await get('SELECT * FROM economy WHERE user_id = ?', [userId]);
    if (!user) return false;
    await run('UPDATE economy SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?', [amount, amount, userId]);
    await run('INSERT INTO transactions (from_user, to_user, amount, reason) VALUES (?, ?, ?, ?)', ['SYSTEM', userId, amount, reason]);
    return true;
  },

  async removeFunds(userId, amount, reason = 'Admin removal') {
    const user = await get('SELECT * FROM economy WHERE user_id = ?', [userId]);
    if (!user || user.balance < amount) return false;
    await run('UPDATE economy SET balance = balance - ?, total_spent = total_spent + ? WHERE user_id = ?', [amount, amount, userId]);
    await run('INSERT INTO transactions (from_user, to_user, amount, reason) VALUES (?, ?, ?, ?)', [userId, 'SYSTEM', amount, reason]);
    return true;
  },

  async transfer(fromId, toId, amount, reason = 'Transfer') {
    const from = await get('SELECT balance FROM economy WHERE user_id = ?', [fromId]);
    if (!from || from.balance < amount) return false;
    await run('UPDATE economy SET balance = balance - ?, total_spent = total_spent + ? WHERE user_id = ?', [amount, amount, fromId]);
    await run('UPDATE economy SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?', [amount, amount, toId]);
    await run('INSERT INTO transactions (from_user, to_user, amount, reason) VALUES (?, ?, ?, ?)', [fromId, toId, amount, reason]);
    return true;
  },

  async setFunds(userId, amount) {
    await run('UPDATE economy SET balance = ? WHERE user_id = ?', [amount, userId]);
  },

  async getLeaderboard(limit = 10) {
    return all('SELECT user_id, username, balance FROM economy ORDER BY balance DESC LIMIT ?', [limit]);
  },

  async claimDaily(userId) {
    const user = await get('SELECT * FROM economy WHERE user_id = ?', [userId]);
    if (!user) return { success: false, reason: 'no_account' };

    const now = new Date();
    const lastDaily = user.last_daily ? new Date(user.last_daily) : null;

    if (lastDaily) {
      const hours = (now - lastDaily) / (1000 * 60 * 60);
      if (hours < 24) {
        const remaining = 24 - hours;
        return { success: false, reason: 'cooldown', hours: Math.floor(remaining), minutes: Math.floor((remaining % 1) * 60) };
      }
    }

    const reward = Math.floor(Math.random() * 200) + 100;
    await run('UPDATE economy SET balance = balance + ?, total_earned = total_earned + ?, last_daily = ? WHERE user_id = ?',
      [reward, reward, now.toISOString(), userId]);
    return { success: true, amount: reward };
  }
};

// ─── Stats functions ──────────────────────────────────────────────────────────
const stats = {
  async get(userId) {
    let s = await get('SELECT * FROM game_stats WHERE user_id = ?', [userId]);
    if (!s) {
      await run('INSERT OR IGNORE INTO game_stats (user_id) VALUES (?)', [userId]);
      s = await get('SELECT * FROM game_stats WHERE user_id = ?', [userId]);
    }
    return s;
  },

  async getStreak(userId) {
    const s = await get('SELECT win_streak FROM game_stats WHERE user_id = ?', [userId]);
    return s ? (s.win_streak || 0) : 0;
  },

  async incrementStreak(userId) {
    await run('INSERT OR IGNORE INTO game_stats (user_id) VALUES (?)', [userId]);
    await run('UPDATE game_stats SET win_streak = win_streak + 1, best_streak = MAX(best_streak, win_streak + 1) WHERE user_id = ?', [userId]);
  },

  async resetStreak(userId) {
    await run('INSERT OR IGNORE INTO game_stats (user_id) VALUES (?)', [userId]);
    await run('UPDATE game_stats SET win_streak = 0 WHERE user_id = ?', [userId]);
  },

  async increment(userId, field, amount = 1) {
    await run('INSERT OR IGNORE INTO game_stats (user_id) VALUES (?)', [userId]);
    await run(`UPDATE game_stats SET ${field} = ${field} + ? WHERE user_id = ?`, [amount, userId]);
  }
};

// ─── Raw query helpers exposed for betting.js etc. ───────────────────────────
const dbHelpers = {
  prepare(sql) {
    // Compatibility shim — returns an object mimicking better-sqlite3's API
    return {
      run:  (...params) => run(sql, params.flat()),
      get:  (...params) => get(sql, params.flat()),
      all:  (...params) => all(sql, params.flat()),
    };
  },
  run,
  get,
  all,
  exec,
};

module.exports = { db: dbHelpers, economy, stats, initDB };
