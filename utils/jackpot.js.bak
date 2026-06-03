const { db } = require('./database');

const ENTRY_COST = 400;
const NUMBER_MIN = 1;
const NUMBER_MAX = 100;

const jackpot = {
  async init() {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS jackpot_draw_fund (
        id     INTEGER PRIMARY KEY CHECK (id = 1),
        amount INTEGER DEFAULT 0
      );
      INSERT OR IGNORE INTO jackpot_draw_fund (id, amount) VALUES (1, 0);

      CREATE TABLE IF NOT EXISTS jackpot_sessions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL DEFAULT 'Jackpot',
        status     TEXT DEFAULT 'active',
        channel_id TEXT,
        pot        INTEGER DEFAULT 0,
        starts_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        ends_at    DATETIME NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jackpot_entries (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        user_id    TEXT NOT NULL,
        username   TEXT NOT NULL,
        number     INTEGER NOT NULL,
        entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS jackpot_history (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   INTEGER,
        session_name TEXT,
        winner_id    TEXT,
        winner_name  TEXT,
        winning_num  INTEGER,
        amount_won   INTEGER,
        drawn_at     DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Migrations for old installs
    await db.run("ALTER TABLE jackpot_sessions ADD COLUMN name TEXT NOT NULL DEFAULT 'Jackpot'").catch(() => {});
    await db.run("ALTER TABLE jackpot_sessions ADD COLUMN pot INTEGER DEFAULT 0").catch(() => {});
    await db.run("ALTER TABLE jackpot_history ADD COLUMN session_name TEXT").catch(() => {});
    await db.run("ALTER TABLE jackpot_history ADD COLUMN session_id INTEGER").catch(() => {});
  },

  // ── Draw fund (persistent — survives across sessions, fed by game draws) ───
  async getDrawFund() {
    const row = await db.get('SELECT amount FROM jackpot_draw_fund WHERE id = 1');
    return row ? row.amount : 0;
  },

  async addToDrawFund(amount) {
    await db.run('UPDATE jackpot_draw_fund SET amount = amount + ? WHERE id = 1', [amount]);
    return this.getDrawFund();
  },

  // Pull all accumulated draw fund into a session when it starts
  async drainDrawFundIntoSession(sessionId) {
    const fund = await this.getDrawFund();
    if (fund > 0) {
      await db.run('UPDATE jackpot_sessions SET pot = pot + ? WHERE id = ?', [fund, sessionId]);
      await db.run('UPDATE jackpot_draw_fund SET amount = 0 WHERE id = 1');
    }
    return fund;
  },

  // ── Sessions ───────────────────────────────────────────────────────────────
  async startSession(name, endsAt, channelId) {
    const result = await db.run(
      'INSERT INTO jackpot_sessions (name, status, channel_id, pot, ends_at) VALUES (?, ?, ?, 0, ?)',
      [name, 'active', channelId, endsAt]
    );
    const session = await db.get('SELECT * FROM jackpot_sessions WHERE id = ?', [result.lastInsertRowid]);
    // Pull any accumulated draw fund into this session
    await this.drainDrawFundIntoSession(session.id);
    return db.get('SELECT * FROM jackpot_sessions WHERE id = ?', [session.id]);
  },

  async endSession(sessionId) {
    await db.run("UPDATE jackpot_sessions SET status='ended' WHERE id = ?", [sessionId]);
  },

  // Refund all entry fees and return draw fund portion back to the draw fund
  async refundAndEndSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return { refunded: [], drawFundRestored: 0 };

    const entries    = await this.getEntries(sessionId);
    const entryTotal = entries.length * ENTRY_COST;
    // Anything above entry fees came from the draw fund — return it
    const drawFundPortion = Math.max(0, (session.pot || 0) - entryTotal);

    if (drawFundPortion > 0) {
      await db.run('UPDATE jackpot_draw_fund SET amount = amount + ? WHERE id = 1', [drawFundPortion]);
    }
    await this.endSession(sessionId);
    return { refunded: entries, drawFundRestored: drawFundPortion };
  },

  async getActiveSessions() {
    return db.all("SELECT * FROM jackpot_sessions WHERE status='active' ORDER BY starts_at ASC");
  },

  async getSession(sessionId) {
    return db.get('SELECT * FROM jackpot_sessions WHERE id = ?', [sessionId]);
  },

  // ── Per-session pot ────────────────────────────────────────────────────────
  async getPot(sessionId) {
    const row = await db.get('SELECT pot FROM jackpot_sessions WHERE id = ?', [sessionId]);
    return row ? row.pot : 0;
  },

  // Add to a specific session, or to the persistent draw fund if no session active
  async addToPot(amount, reason, sessionId) {
    if (sessionId) {
      await db.run('UPDATE jackpot_sessions SET pot = pot + ? WHERE id = ?', [amount, sessionId]);
      return this.getPot(sessionId);
    }
    // No session specified — game draws always go to the persistent draw fund
    return this.addToDrawFund(amount);
  },

  // ── Entries ────────────────────────────────────────────────────────────────
  async hasEntered(userId, sessionId) {
    const row = await db.get(
      'SELECT id FROM jackpot_entries WHERE user_id = ? AND session_id = ?',
      [userId, sessionId]
    );
    return !!row;
  },

  async enter(userId, username, number, sessionId) {
    await db.run(
      'INSERT OR IGNORE INTO jackpot_entries (session_id, user_id, username, number) VALUES (?, ?, ?, ?)',
      [sessionId, userId, username, number]
    );
  },

  async getEntries(sessionId) {
    return db.all(
      'SELECT * FROM jackpot_entries WHERE session_id = ? ORDER BY entered_at ASC',
      [sessionId]
    );
  },

  // ── Draw ───────────────────────────────────────────────────────────────────
  async draw(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const entries = await this.getEntries(sessionId);
    const pot     = session.pot;

    if (!entries.length) return { winner: null, pot, winningNum: null, entries: [], session };

    const winningNum = Math.floor(Math.random() * NUMBER_MAX) + NUMBER_MIN;
    let minDiff = Infinity;
    for (const e of entries) {
      const diff = Math.abs(e.number - winningNum);
      if (diff < minDiff) minDiff = diff;
    }
    const tied   = entries.filter(e => Math.abs(e.number - winningNum) === minDiff);
    const winner = tied[Math.floor(Math.random() * tied.length)];

    await db.run(
      'INSERT INTO jackpot_history (session_id, session_name, winner_id, winner_name, winning_num, amount_won, week) VALUES (?,?,?,?,?,?,?)',
      [sessionId, session.name, winner.user_id, winner.username, winningNum, pot, new Date().toISOString().slice(0, 10)]
    );
    await db.run('UPDATE jackpot_sessions SET pot = 0 WHERE id = ?', [sessionId]);
    return { winner, pot, winningNum, entries, tied: tied.length > 1, session };
  },

  async getHistory(limit = 5) {
    return db.all('SELECT * FROM jackpot_history ORDER BY drawn_at DESC LIMIT ?', [limit]);
  },

  currentWeek() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const week  = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
  },

  ENTRY_COST,
  NUMBER_MIN,
  NUMBER_MAX,
};

module.exports = jackpot;
