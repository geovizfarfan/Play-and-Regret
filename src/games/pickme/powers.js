// ─────────────────────────────────────────────────────────────────────────────
// Pick Me Pit powers — collectible, persistent inventory items.
// One is randomly awarded to a random active player each round (after round 1).
// ─────────────────────────────────────────────────────────────────────────────

const POWERS = {
  not_me_babe: { emoji: '💅', name: 'Not Me Babe', desc: 'One-round immunity.' },
  look_at_yourself: { emoji: '🪞', name: 'Look At Yourself', desc: 'Redirect one vote you received to another eligible player.' },
  receipts: { emoji: '🧾', name: 'Receipts', desc: 'Make one target\'s votes count double.' },
  try_harder: { emoji: '💋', name: 'Try Harder', desc: 'Remove yourself from danger now, but you auto-receive one vote next round.' },
  please: { emoji: '🙄', name: 'Please', desc: 'Cancel one vote against a player of your choice.' },
};

const POWER_KEYS = Object.keys(POWERS);

function grantRandomPower(game, playerId) {
  const key = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
  const p = game.players.get(playerId);
  if (!p) return null;
  p.powers.push(key);
  return key;
}

module.exports = { POWERS, POWER_KEYS, grantRandomPower };
