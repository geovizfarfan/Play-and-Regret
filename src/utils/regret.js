// ─────────────────────────────────────────────────────────────────────────────
// regret.js — the ONE shared regret system every Play & Regret game uses.
// Four fixed tiers, same amounts everywhere, so losing feels consistent whether
// it happens in FAFO, Rumble Slaughter, or any future game in the ecosystem.
// Also logs to regret_log so a future /regrets stats can break it down by game.
// ─────────────────────────────────────────────────────────────────────────────
const { db, economy } = require('./database');

const REGRET_TIERS = {
  minor:        100,  // normal/early loss
  moderate:     250,  // mid-game or risky choice
  severe:       500,  // late-game / high-risk / avoidable
  catastrophic: 900,  // final round, biggest stakes, self-inflicted
};

/**
 * Award regret using the shared tier system.
 * @param {string} userId
 * @param {'minor'|'moderate'|'severe'|'catastrophic'} tier
 * @param {string} sourceGame - e.g. 'fafo', 'rumbleslaughter'
 * @param {string} reason - short human-readable reason, shown nowhere yet but logged
 * @returns {number} amount actually awarded
 */
async function awardRegret(userId, tier, sourceGame, reason = '') {
  const amount = REGRET_TIERS[tier];
  if (!amount) return 0;
  await economy.addRegret(userId, amount).catch(() => {});
  await db.run(
    'INSERT INTO regret_log (user_id, source_game, tier, amount, reason) VALUES (?, ?, ?, ?, ?)',
    [userId, sourceGame, tier, amount, reason]
  ).catch(() => {});
  return amount;
}

module.exports = { REGRET_TIERS, awardRegret };
