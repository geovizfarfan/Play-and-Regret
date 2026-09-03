// ─────────────────────────────────────────────────────────────────────────────
// Red Flag Rumble abilities — collectible, persistent inventory items.
// One is randomly awarded to a random active player each round (after round 1).
// ─────────────────────────────────────────────────────────────────────────────

const ABILITIES = {
  green_flag: { emoji: '<a:greenflag:1545091809473069066>', name: 'Green Flag', desc: 'Remove 1 red flag from yourself.' },
  receipts: { emoji: '<a:receipt:1545092059587940484>', name: 'Receipts', desc: 'Reveal who a player voted to flag this round.' },
  uno_reverse: { emoji: '<a:reverse:1545091814770348145>', name: 'Uno Reverse', desc: 'The next flag you\'d receive gets redirected to a random other player instead.' },
  run: { emoji: '<a:runn:1545091905027707032>', name: 'Run', desc: 'If you\'re a suspect this round, remove yourself from the accusation pool.' },
  background_check: { emoji: '<a:eyes:1511507447704191026>', name: 'Background Check', desc: 'Privately see who currently has the most votes this round.' },
  double_flag: { emoji: '<a:redflag:1545091812924858469>', name: 'Double Flag', desc: 'Your next vote counts twice.' },
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
