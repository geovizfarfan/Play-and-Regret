// ─────────────────────────────────────────────────────────────────────────────
// FAFO round configuration. Everything here is intentionally centralized so the
// curve can be tuned without touching game logic.
// ─────────────────────────────────────────────────────────────────────────────

const ROUNDS = [
  { round: 1, multiplier: 1.25, findOutChance: 0.03, regretTier: 'minor' },
  { round: 2, multiplier: 1.5,  findOutChance: 0.06, regretTier: 'minor' },
  { round: 3, multiplier: 2,    findOutChance: 0.10, regretTier: 'minor' },
  { round: 4, multiplier: 3,    findOutChance: 0.18, regretTier: 'moderate' },
  { round: 5, multiplier: 4,    findOutChance: 0.28, regretTier: 'moderate' },
  { round: 6, multiplier: 6,    findOutChance: 0.40, regretTier: 'moderate' },
  { round: 7, multiplier: 8,    findOutChance: 0.55, regretTier: 'severe' },
  { round: 8, multiplier: 12,   findOutChance: 0.70, regretTier: 'severe' },
  { round: 9, multiplier: 20,   findOutChance: 0.85, regretTier: 'catastrophic' },
];

const FINAL_FAFO = {
  enabled: true,
  findOutChance: 0.75,
  jackpotMultiplier: 3, // relative to current pot when Final FAFO triggers
  maxJackpot: 100000,
  regretTier: 'catastrophic',
};

const CONFIG = {
  minBalanceToPlay: 1000,
  wagerMinPct: 0.02,
  wagerMaxPct: 0.10,
  absoluteMinWager: 100,
  absoluteMaxWager: 25000,
  lobbyDurationMs: 90 * 1000,
  roundDecisionMs: 60 * 1000,
  minPlayers: 2,
  maxPlayers: 15,
  globalEventsEnabled: true,
  globalEventChance: 0.25, // chance per round (after round 1) that an event fires
};

function getRoundConfig(roundNum) {
  return ROUNDS.find(r => r.round === roundNum) || null;
}

module.exports = { ROUNDS, FINAL_FAFO, CONFIG, getRoundConfig };
