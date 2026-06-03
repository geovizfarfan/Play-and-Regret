/**
 * utils/jackpot.js
 * PostgreSQL version — mirrors the original SQLite API exactly.
 */
const { db } = require('./database');

let ENTRY_COST = 50;
const NUMBER_MIN = 1;
const NUMBER_MAX = 100;

const jackpot = {
  // init() is now a no-op — tables are created in initDB()
  async init() {},

  // ── Draw fund ──────────────────────────────────────────────────────────────
  async getDrawFund() {
    const row = await db.get('SELECT amount FROM jackpot_draw_fund WHERE id = 1');
    return row ? Number(row.amount) : 0;
  },

  async addToDrawFund(amount) {
    // If there's an active session, add directly to it
    const active = await db.get("SELECT id FROM jackpot_sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1").catch(() => null);
    if (active) {
      await db.run('UPDATE jackpot_sessions SET pot = pot + ? WHERE id = ?', [amount, active.id]);
    } else {
      // No active session — hold in draw fund until one starts
      await db.run('UPDATE jackpot_draw_fund SET amount = amount + ? WHERE id = 1', [amount]);
    }
    return this.getDrawFund();
  },

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
    const id = result.lastInsertRowid;
    await this.drainDrawFundIntoSession(id);
    return db.get('SELECT * FROM jackpot_sessions WHERE id = ?', [id]);
  },

  async saveLiveMessageId(sessionId, messageId) {
    return db.run('UPDATE jackpot_sessions SET live_message_id = ? WHERE id = ?', [messageId, sessionId]);
  },

  async endSession(sessionId) {
    await db.run("UPDATE jackpot_sessions SET status = 'ended' WHERE id = ?", [sessionId]);
  },

  async refundAndEndSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return { refunded: [], drawFundRestored: 0 };
    const entries        = await this.getEntries(sessionId);
    const entryTotal     = entries.length * ENTRY_COST;
    const drawFundPortion = Math.max(0, (Number(session.pot) || 0) - entryTotal);
    if (drawFundPortion > 0) {
      await db.run('UPDATE jackpot_draw_fund SET amount = amount + ? WHERE id = 1', [drawFundPortion]);
    }
    await this.endSession(sessionId);
    return { refunded: entries, drawFundRestored: drawFundPortion };
  },

  async getActiveSessions() {
    return db.all("SELECT * FROM jackpot_sessions WHERE status = 'active' ORDER BY starts_at ASC");
  },

  async getSession(sessionId) {
    return db.get('SELECT * FROM jackpot_sessions WHERE id = ?', [sessionId]);
  },

  // ── Pot ────────────────────────────────────────────────────────────────────
  async getPot(sessionId) {
    const row = await db.get('SELECT pot FROM jackpot_sessions WHERE id = ?', [sessionId]);
    return row ? Number(row.pot) : 0;
  },

  async addToPot(amount, reason, sessionId) {
    if (sessionId) {
      await db.run('UPDATE jackpot_sessions SET pot = pot + ? WHERE id = ?', [amount, sessionId]);
      return this.getPot(sessionId);
    }
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
      'INSERT INTO jackpot_entries (session_id, user_id, username, number) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
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
    const pot     = Number(session.pot);

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
      'INSERT INTO jackpot_history (session_id, session_name, winner_id, winner_name, winning_num, amount_won) VALUES (?,?,?,?,?,?)',
      [sessionId, session.name, winner.user_id, winner.username, winningNum, pot]
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
