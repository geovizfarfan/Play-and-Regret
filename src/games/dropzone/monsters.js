// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — monster/sticker data.
// One centralized table. Add a new sticker by adding an entry here — nothing
// else needs to change. `enabled: false` keeps a sticker hidden from natural
// drops and from /stickers missing until you flip it on.
// ─────────────────────────────────────────────────────────────────────────────

const SEASON_1 = [
  // ── Common ──────────────────────────────────────────────────────────────
  { id: 'skeleton', number: 1, name: 'Skeleton', rarity: 'common', flavorText: "Found his own arm. Kept it as a weapon." },
  { id: 'zombie', number: 2, name: 'Zombie', rarity: 'common', flavorText: "Manners died with him." },
  { id: 'ghost', number: 3, name: 'Ghost', rarity: 'common', flavorText: "Redecorating, one broken vase at a time." },
  { id: 'pumpkin_monster', number: 4, name: 'Pumpkin Monster', rarity: 'common', flavorText: "Seasonal depression, but make it violent." },
  { id: 'goblin', number: 5, name: 'Goblin', rarity: 'common', flavorText: "Grave robbing is a hustle, not a hobby." },
  { id: 'spider_monster', number: 6, name: 'Spider Monster', rarity: 'common', flavorText: "Eight legs, zero chill." },
  { id: 'bat_monster', number: 7, name: 'Bat Monster', rarity: 'common', flavorText: "Upside down and still judging you." },
  { id: 'graveyard_ghoul', number: 8, name: 'Graveyard Ghoul', rarity: 'common', flavorText: "Finders keepers, corpse's problem." },
  { id: 'scarecrow', number: 9, name: 'Scarecrow', rarity: 'common', flavorText: "The crows stopped listening years ago." },
  { id: 'haunted_doll', number: 10, name: 'Haunted Doll', rarity: 'common', flavorText: "She was here before you moved in." },
  { id: 'black_cat_monster', number: 11, name: 'Black Cat Monster', rarity: 'common', flavorText: "Bad luck has a face now." },
  { id: 'eyeball_monster', number: 12, name: 'Eyeball Monster', rarity: 'common', flavorText: "Seeing everything. Judging most of it." },

  // ── Uncommon ────────────────────────────────────────────────────────────
  { id: 'frankenstein_monster', number: 13, name: 'Frankenstein-Inspired Monster', rarity: 'uncommon', flavorText: "Built from spare parts. Runs on spite." },
  { id: 'mummy', number: 14, name: 'Mummy', rarity: 'uncommon', flavorText: "3,000 years old and still has better posture than you." },
  { id: 'witch', number: 15, name: 'Witch', rarity: 'uncommon', flavorText: "The cauldron's just for show. She already knows how this ends." },
  { id: 'swamp_monster', number: 16, name: 'Swamp Monster', rarity: 'uncommon', flavorText: "Smells like regret and pond water." },
  { id: 'headless_horseman', number: 17, name: 'Headless Horseman', rarity: 'uncommon', flavorText: "Lost his head. Kept the attitude." },
  { id: 'mad_scientist', number: 18, name: 'Mad Scientist', rarity: 'uncommon', flavorText: "Science said no. He did it anyway." },
  { id: 'monster_clown', number: 19, name: 'Monster Clown', rarity: 'uncommon', flavorText: "The carnival closed years ago. He didn't get the memo." },
  { id: 'living_gargoyle', number: 20, name: 'Living Gargoyle', rarity: 'uncommon', flavorText: "Been judging you from that ledge since 1850." },
  { id: 'bog_witch', number: 21, name: 'Bog Witch', rarity: 'uncommon', flavorText: "The swamp answers to her. So should you." },
  { id: 'voodoo_doll_monster', number: 22, name: 'Voodoo Doll Monster', rarity: 'uncommon', flavorText: "Somebody's having a very bad day right now." },

  // ── Rare ────────────────────────────────────────────────────────────────
  { id: 'vampire_lord', number: 23, name: 'Vampire Lord', rarity: 'rare', flavorText: "Immortal, unbothered, extremely dramatic about it." },
  { id: 'werewolf', number: 24, name: 'Werewolf', rarity: 'rare', flavorText: "Full moon, zero impulse control." },
  { id: 'electric_monster_bride', number: 25, name: 'Electric Monster Bride', rarity: 'rare', flavorText: "Reanimated and still dressed better than everyone at the wedding." },
  { id: 'grim_reaper', number: 26, name: 'Grim Reaper', rarity: 'rare', flavorText: "Not here for you specifically. Probably." },
  { id: 'banshee', number: 27, name: 'Banshee', rarity: 'rare', flavorText: "The scream is a warning. You didn't listen." },
  { id: 'phantom_knight', number: 28, name: 'Phantom Knight', rarity: 'rare', flavorText: "Nobody's home. The armor fights anyway." },
  { id: 'yeti', number: 29, name: 'Yeti', rarity: 'rare', flavorText: "Cold, hungry, and out of patience." },
  { id: 'creature_of_the_deep', number: 30, name: 'Creature of the Deep', rarity: 'rare', flavorText: "The ocean kept something down there for a reason." },
  { id: 'boogeyman', number: 31, name: 'Boogeyman', rarity: 'rare', flavorText: "Checked under the bed once. Big mistake." },

  // ── Epic ────────────────────────────────────────────────────────────────
  { id: 'vampire_queen', number: 32, name: 'Vampire Queen', rarity: 'epic', flavorText: "The Lord answers to her. Everyone does." },
  { id: 'alpha_werewolf', number: 33, name: 'Alpha Werewolf', rarity: 'epic', flavorText: "The pack doesn't move until he does." },
  { id: 'frankenstein_titan', number: 34, name: 'Frankenstein Titan', rarity: 'epic', flavorText: "The original was a prototype. This is the finished product." },
  { id: 'mummy_pharaoh', number: 35, name: 'Mummy Pharaoh', rarity: 'epic', flavorText: "Ruled an empire. Still acts like it." },
  { id: 'demon_witch', number: 36, name: 'Demon Witch', rarity: 'epic', flavorText: "Four arms, zero mercy, immaculate eyeliner." },
  { id: 'cerberus', number: 37, name: 'Cerberus', rarity: 'epic', flavorText: "Three heads. One very bad attitude." },
  { id: 'bone_dragon', number: 38, name: 'Bone Dragon', rarity: 'epic', flavorText: "Died centuries ago. Never got the memo to stay down." },
  { id: 'nightmare_scarecrow', number: 39, name: 'Nightmare Scarecrow', rarity: 'epic', flavorText: "The crows don't just watch anymore. They obey." },

  // ── Legendary ───────────────────────────────────────────────────────────
  { id: 'ancient_vampire_king', number: 40, name: 'Ancient Vampire King', rarity: 'legendary', flavorText: "Every vampire on this list answers to him. Every one." },
  { id: 'werewolf_king', number: 41, name: 'Werewolf King', rarity: 'legendary', flavorText: "The mountain is his. The pack is his. Your evening is his." },
  { id: 'lich_king', number: 42, name: 'Lich King', rarity: 'legendary', flavorText: "Collects souls the way other people collect regrets." },
  { id: 'demon_king', number: 43, name: 'Demon King', rarity: 'legendary', flavorText: "The throne is real. The fire is real. Run." },
  { id: 'ancient_hydra', number: 44, name: 'Ancient Hydra', rarity: 'legendary', flavorText: "Cut off one head, it just gets louder." },
  { id: 'death_dragon', number: 45, name: 'Death Dragon', rarity: 'legendary', flavorText: "An entire kingdom fell. This is what was left standing." },
  { id: 'monster_king', number: 46, name: 'Monster King', rarity: 'legendary', flavorText: "Every monster on this list is a piece of him." },

  // ── Mythic ──────────────────────────────────────────────────────────────
  { id: 'eclipse_demon', number: 47, name: 'Eclipse Demon', rarity: 'mythic', flavorText: "Blocked out the sun on the way in. Didn't apologize." },
  { id: 'prismatic_dragon', number: 48, name: 'Prismatic Dragon', rarity: 'mythic', flavorText: "Every element at once. Pick your ending." },
  { id: 'monster_of_the_void', number: 49, name: 'Monster of the Void', rarity: 'mythic', flavorText: "Tore a hole in reality just to say hello." },
  { id: 'the_first_monster', number: 50, name: 'The First Monster', rarity: 'mythic', flavorText: "Everything on this list came from it. It came from nothing." },
];

// season, enabled, limitedEdition, eventTag, image path — applied uniformly here
// rather than repeated 50 times above.
const MONSTERS = SEASON_1.map(m => ({
  ...m,
  season: 1,
  enabled: true,
  limitedEdition: false,
  eventTag: null,
  image: `assets/season-${1}/${String(m.number).padStart(3, '0')}.png`,
}));

function getMonster(id) {
  return MONSTERS.find(m => m.id === id) || null;
}
function getMonstersBySeason(season) {
  return MONSTERS.filter(m => m.season === season);
}
function getMonstersByRarity(rarity, season) {
  return MONSTERS.filter(m => m.rarity === rarity && (season === undefined || m.season === season));
}

// ── Runtime enabled/disabled overrides ───────────────────────────────────
// monsters.js itself stays a static data table; admin enable/disable toggles
// are layered on top here and persisted to dropzone_monster_overrides so they
// survive restarts. isEnabled() is synchronous and cheap — safe to call from
// the rarity roll hot path — because overrides are loaded into memory once at
// startup and kept in sync on every toggle, never queried per-roll.
const overrides = new Map(); // monsterId -> boolean

async function loadOverrides(db) {
  const rows = await db.all('SELECT * FROM dropzone_monster_overrides').catch(() => []);
  overrides.clear();
  for (const row of rows) overrides.set(row.monster_id, !!row.enabled);
}

async function setOverride(db, monsterId, enabled) {
  await db.run(
    `INSERT INTO dropzone_monster_overrides (monster_id, enabled) VALUES (?, ?)
     ON CONFLICT (monster_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [monsterId, enabled]
  );
  overrides.set(monsterId, enabled);
}

function isEnabled(monster) {
  return overrides.has(monster.id) ? overrides.get(monster.id) : monster.enabled;
}

function getEnabledMonstersByRarity(rarity, season) {
  return getMonstersByRarity(rarity, season).filter(isEnabled);
}

module.exports = {
  MONSTERS, getMonster, getMonstersBySeason, getMonstersByRarity, getEnabledMonstersByRarity,
  isEnabled, loadOverrides, setOverride,
};
