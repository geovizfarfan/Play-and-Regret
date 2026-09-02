// ─────────────────────────────────────────────────────────────────────────────
// FAFO wager limits — 2%-10% of balance, clamped to absolute floor/cap, rounded clean.
// ─────────────────────────────────────────────────────────────────────────────
const { roundClean } = require('../../utils/wager');
const { CONFIG } = require('./rounds');

/**
 * @param {number} balance
 * @returns {{min: number, max: number} | null} null if balance too low to play
 */
function calcWagerLimits(balance) {
  if (balance < CONFIG.minBalanceToPlay) return null;

  let min = Math.max(CONFIG.absoluteMinWager, roundClean(balance * CONFIG.wagerMinPct));
  let max = Math.min(CONFIG.absoluteMaxWager, roundClean(balance * CONFIG.wagerMaxPct));

  max = Math.min(max, balance);
  if (min > max) min = max;

  return { min, max };
}

module.exports = { calcWagerLimits };
