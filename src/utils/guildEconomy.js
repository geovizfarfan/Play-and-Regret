/**
 * src/utils/guildEconomy.js
 * ─────────────────────────────────────────────────────────────────────────
 * Guild-aware economy client — talks to Veloura's shared per-guild currency
 * system (economy_groups / guild_balances / guild_config) instead of this
 * bot's own local `users` table. Every server's games now play in whatever
 * currency that server set up in Veloura via /currency setup — The Board
 * Princess and the staging server share one "Sins" wallet, other servers
 * get their own isolated wallet, and none of them interfere with each other.
 *
 * Shaped to match the old local `economy` object's method names so call
 * sites mostly just add a guildId (and username, needed for display in
 * Veloura's balance table) rather than rewrite their logic.
 * ─────────────────────────────────────────────────────────────────────────
 */
const veloura = require('./velouraDb');

async function resolveGroup(guildId) {
  const res = await veloura.query('SELECT economy_group_id FROM guild_config WHERE guild_id=$1', [guildId]);
  return res.rows[0]?.economy_group_id || guildId;
}

async function getCurrencyName(guildId) {
  const groupId = await resolveGroup(guildId);
  const res = await veloura.query('SELECT currency_name, currency_emoji FROM economy_groups WHERE group_id=$1', [groupId]);
  return {
    name: res.rows[0]?.currency_name || 'Coins',
    emoji: res.rows[0]?.currency_emoji || null,
  };
}

async function getBalance(guildId, userId) {
  const groupId = await resolveGroup(guildId);
  const res = await veloura.query('SELECT balance FROM guild_balances WHERE group_id=$1 AND user_id=$2', [groupId, userId]);
  return res.rows[0] ? Number(res.rows[0].balance) : 0;
}

async function adjust(guildId, userId, username, amount, reason = '') {
  const groupId = await resolveGroup(guildId);
  const earnedDelta = amount > 0 ? amount : 0;
  const spentDelta  = amount < 0 ? Math.abs(amount) : 0;
  const res = await veloura.query(`
    INSERT INTO guild_balances (group_id, user_id, username, balance, total_earned, total_spent)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (group_id, user_id) DO UPDATE SET
      balance = guild_balances.balance + EXCLUDED.balance,
      total_earned = guild_balances.total_earned + EXCLUDED.total_earned,
      total_spent = guild_balances.total_spent + EXCLUDED.total_spent,
      username = EXCLUDED.username
    RETURNING balance
  `, [groupId, userId, username, amount, earnedDelta, spentDelta]);
  const newBalance = res.rows[0] ? Number(res.rows[0].balance) : null;
  if (newBalance !== null) {
    await veloura.query(
      `INSERT INTO currency_transactions (guild_id, user_id, username, amount, reason, new_balance) VALUES ($1,$2,$3,$4,$5,$6)`,
      [guildId, userId, username, amount, reason, newBalance]
    ).catch(err => console.error('[guildEconomy] Failed to log transaction:', err.message));
  }
  return newBalance;
}

async function addFunds(guildId, userId, username, amount, reason = '') {
  return adjust(guildId, userId, username, amount, reason);
}

async function removeFunds(guildId, userId, username, amount, reason = '') {
  const bal = await getBalance(guildId, userId);
  if (bal < amount) return false;
  await adjust(guildId, userId, username, -amount, reason);
  return true;
}

async function setFunds(guildId, userId, username, amount) {
  const groupId = await resolveGroup(guildId);
  await veloura.query(`
    INSERT INTO guild_balances (group_id, user_id, username, balance)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (group_id, user_id) DO UPDATE SET balance = $4, username = $3
  `, [groupId, userId, username, amount]);
}

async function transfer(guildId, fromId, fromUsername, toId, toUsername, amount, reason = '') {
  const bal = await getBalance(guildId, fromId);
  if (bal < amount) return false;
  await adjust(guildId, fromId, fromUsername, -amount, reason);
  await adjust(guildId, toId, toUsername, amount, reason);
  return true;
}

async function getLeaderboard(guildId, limit = 10) {
  const groupId = await resolveGroup(guildId);
  const res = await veloura.query(
    'SELECT user_id, username, balance FROM guild_balances WHERE group_id=$1 ORDER BY balance DESC LIMIT $2',
    [groupId, limit]
  );
  return res.rows.map(r => ({ user_id: r.user_id, username: r.username, balance: Number(r.balance) }));
}

async function getHistory(guildId, userId, limit = 20) {
  const res = await veloura.query(
    'SELECT amount, reason, created_at FROM currency_transactions WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT $3',
    [guildId, userId, limit]
  );
  return res.rows;
}

module.exports = { getBalance, addFunds, removeFunds, setFunds, transfer, getCurrencyName, resolveGroup, getLeaderboard, getHistory };
