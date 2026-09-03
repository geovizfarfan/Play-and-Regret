// ─────────────────────────────────────────────────────────────────────────────
// Red Flag Rumble abilities — collectible, persistent inventory items.
// One is randomly awarded to a random active player each round (after round 1).
// ─────────────────────────────────────────────────────────────────────────────

const ABILITIES = {
  green_flag: { emoji: '💚', name: 'Green Flag', desc: 'Remove 1 red flag from yourself.' },
  receipts: { emoji: '🧾', name: 'Receipts', desc: 'Reveal who a player voted to flag this round.' },
  uno_reverse: { emoji: '🔄', name: 'Uno Reverse', desc: 'The next flag you\'d receive gets redirected to a random other player instead.' },
  run: { emoji: '🏃', name: 'Run', desc: 'If you\'re a suspect this round, remove yourself from the accusation pool.' },
  background_check: { emoji: '👀', name: 'Background Check', desc: 'Privately see who currently has the most votes this round.' },
  double_flag: { emoji: '🚩', name: 'Double Flag', desc: 'Your next vote counts twice.' },
  nda: { emoji: '🤐', name: 'NDA', desc: 'Blocks anyone from using Receipts on you.' },
};

const ABILITY_KEYS = Object.keys(ABILITIES);

function grantRandomAbility(game, playerId) {
  const key = ABILITY_KEYS[Math.floor(Math.random() * ABILITY_KEYS.length)];
  const p = game.players.get(playerId);
  if (!p) return null;
  p.abilities.push(key);
  return key;
}

module.exports = { ABILITIES, ABILITY_KEYS, grantRandomAbility };
