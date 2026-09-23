// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — central configuration. Every tunable value lives
// here so nothing is hard-coded into the game logic.
// ─────────────────────────────────────────────────────────────────────────────

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

const RARITY_META = {
  common:    { label: 'Common',    emoji: '<a:common:1552115281437008073>', weight: 40, color: '#C4C4C4', expireMinutes: 10 },
  uncommon:  { label: 'Uncommon',  emoji: '<a:uncommon:1552115285052624926>', weight: 25, color: '#3CD16B', expireMinutes: 10 },
  rare:      { label: 'Rare',      emoji: '<a:rare:1552115283655655555>', weight: 17, color: '#3B9CF2', expireMinutes: 15 },
  epic:      { label: 'Epic',      emoji: '<a:purplesparkle:1479210541691175054>', weight: 10, color: '#B24BF3', expireMinutes: 20 },
  legendary: { label: 'Legendary', emoji: '<a:sparkle:1511506717584920696>', weight: 6,  color: '#F2C230', expireMinutes: 30 },
  mythic:    { label: 'Mythic',    emoji: '<a:mythic:1552115282619801652>', weight: 2,  color: '#FF63C4', expireMinutes: 45 },
};

const CONFIG = {
  enabled: true,               // master on/off switch
  currentSeason: 1,
  seasonName: 'Drop It Like It\'s Hot — Season 1',

  // Activity → spawn eligibility
  minQualifyingMessages: 10,
  maxQualifyingMessages: 25,   // actual threshold rolled randomly in this range
  minUniqueParticipants: 3,
  spamRepeatWindow: 5,         // how many recent messages checked for repeats/farming

  // Cooldown between natural spawns (per channel-eligible-guild, randomized in range)
  minSpawnCooldownMinutes: 5,
  maxSpawnCooldownMinutes: 15,

  // Catch window — how long after the FIRST click others can still join in
  catchWindowSeconds: 3,

  // Duplicate → sins exchange value, per rarity
  dupeSinsValue: {
    common: 50,
    uncommon: 75,
    rare: 150,
    epic: 350,
    legendary: 700,
    mythic: 1500,
  },

  debug: false,
};

const SEASON_NAMES = {
  1: 'Monster Drops',
};
function getSeasonName(season) {
  return SEASON_NAMES[season] || `Season ${season}`;
}

module.exports = { RARITY_ORDER, RARITY_META, CONFIG, SEASON_NAMES, getSeasonName };
