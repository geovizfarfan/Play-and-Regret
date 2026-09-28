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

// ── SEASON 2 — FALL DROP (starts Nov 1, 2026 12:00am Eastern — see config.js SEASON_SCHEDULE) ──
const SEASON_2 = [
  // ── Common ──────────────────────────────────────────────────────────────
  { id: 'pumpkin_patch', number: 1, name: 'Pumpkin Patch', rarity: 'common', flavorText: "Grown with love. Photographed by everyone." },
  { id: 'apple_harvest', number: 2, name: 'Apple Harvest', rarity: 'common', flavorText: "One for the basket, two for the crisp." },
  { id: 'cozy_cabin', number: 3, name: 'Cozy Cabin', rarity: 'common', flavorText: "Zero bars of signal. Zero regrets." },
  { id: 'fall_coffee', number: 4, name: 'Fall Coffee', rarity: 'common', flavorText: "Not a personality, but it's carrying yours." },
  { id: 'pecan_pie', number: 5, name: 'Pecan Pie', rarity: 'common', flavorText: "Pronounce it however you want. Just pass it." },
  { id: 'pumpkin_pie', number: 6, name: 'Pumpkin Pie', rarity: 'common', flavorText: "Whipped cream is not optional." },
  { id: 'hay_ride', number: 7, name: 'Hay Ride', rarity: 'common', flavorText: "Bumpy, itchy, and somehow the best part of the day." },
  { id: 'corn_maze', number: 8, name: 'Corn Maze', rarity: 'common', flavorText: "You said you knew the way. Twenty minutes ago." },
  { id: 'leaf_pile', number: 9, name: 'Leaf Pile', rarity: 'common', flavorText: "Raked with care. Destroyed in four seconds." },
  { id: 'sweater_weather', number: 10, name: 'Sweater Weather', rarity: 'common', flavorText: "The temperature dropped. Your standards did not." },

  // ── Uncommon ────────────────────────────────────────────────────────────
  { id: 'football_season', number: 11, name: 'Football Season', rarity: 'uncommon', flavorText: "Your weekends belong to the couch now." },
  { id: 'tailgate_time', number: 12, name: 'Tailgate Time', rarity: 'uncommon', flavorText: "Arrived at 8 AM for a 4 PM kickoff. Worth it." },
  { id: 'grill_master', number: 13, name: 'Grill Master', rarity: 'uncommon', flavorText: "Says he's 'almost done' for an hour and a half." },
  { id: 'sunday_funday', number: 14, name: 'Sunday Funday', rarity: 'uncommon', flavorText: "Monday is a rumor. Nobody's confirmed it." },
  { id: 'game_day_grub', number: 15, name: 'Game Day Grub', rarity: 'uncommon', flavorText: "Nobody watched the game. Everybody ate." },
  { id: 'touchdown', number: 16, name: 'Touchdown', rarity: 'uncommon', flavorText: "Somebody just spilled a whole dip. Worth it." },
  { id: 'basketball_vibes', number: 17, name: 'Basketball Vibes', rarity: 'uncommon', flavorText: "Wet court, big dreams, zero jump shot." },
  { id: 'golf_season', number: 18, name: 'Golf Season', rarity: 'uncommon', flavorText: "A long walk ruined on purpose." },
  { id: 'hockey_nights', number: 19, name: 'Hockey Nights', rarity: 'uncommon', flavorText: "Cold rink, hot takes, missing teeth." },
  { id: 'soccer_season', number: 20, name: 'Soccer Season', rarity: 'uncommon', flavorText: "Ninety minutes for one goal. Cinema." },

  // ── Rare ────────────────────────────────────────────────────────────────
  { id: 'hunting_season', number: 21, name: 'Hunting Season', rarity: 'rare', flavorText: "Sat in a tree for six hours. Saw a squirrel." },
  { id: 'fishing_trip', number: 22, name: 'Fishing Trip', rarity: 'rare', flavorText: "The fish were never the point. There were no fish." },
  { id: 'mud_life', number: 23, name: 'Mud Life', rarity: 'rare', flavorText: "It was clean this morning. It was a mistake." },
  { id: 'motorcycle_season', number: 24, name: 'Motorcycle Season', rarity: 'rare', flavorText: "Last ride before the snow. He says that every week." },
  { id: 'uggs_and_coffee', number: 25, name: 'Uggs & Coffee', rarity: 'rare', flavorText: "The unofficial uniform of every October." },
  { id: 'brown_stanley', number: 26, name: 'Brown Stanley', rarity: 'rare', flavorText: "Holds forty ounces and every opinion you have." },
  { id: 'pumpkin_spice', number: 27, name: 'Pumpkin Spice', rarity: 'rare', flavorText: "Judge it all you want. You're still ordering it." },
  { id: 'dunkin_run', number: 28, name: "Dunkin' Run", rarity: 'rare', flavorText: "Just a quick stop. It was never a quick stop." },
  { id: 'starbies_run', number: 29, name: 'Starbies Run', rarity: 'rare', flavorText: "Your name is spelled wrong again. You answered anyway." },
  { id: 'dutch_run', number: 30, name: 'Dutch Run', rarity: 'rare', flavorText: "The line is thirty cars deep and nobody's leaving." },

  // ── Epic ────────────────────────────────────────────────────────────────
  { id: 'fall_kicks', number: 31, name: 'Fall Kicks', rarity: 'epic', flavorText: "Too clean to wear. Wearing them anyway." },
  { id: 'hoodie_season', number: 32, name: 'Hoodie Season', rarity: 'epic', flavorText: "Officially a lifestyle from now until March." },
  { id: 'gaming_mode', number: 33, name: 'Gaming Mode', rarity: 'epic', flavorText: "Do not disturb. This includes dinner." },
  { id: 'cozy_gamer', number: 34, name: 'Cozy Gamer', rarity: 'epic', flavorText: "Rain outside. Blanket on. Nobody leaves." },
  { id: 'camp_crystal', number: 35, name: 'Camp Crystal', rarity: 'epic', flavorText: "The counselors were warned. Repeatedly." },
  { id: 'dream_stalker', number: 36, name: 'Dream Stalker', rarity: 'epic', flavorText: "Falling asleep at a scary movie was a mistake." },
  { id: 'the_shape', number: 37, name: 'The Shape', rarity: 'epic', flavorText: "Never runs. Always arrives." },
  { id: 'bonfire_nights', number: 38, name: 'Bonfire Nights', rarity: 'epic', flavorText: "Smells like smoke, tastes like s'mores, lasts until 2 AM." },

  // ── Legendary ───────────────────────────────────────────────────────────
  { id: 'thanksgiving_feast', number: 39, name: 'Thanksgiving Feast', rarity: 'legendary', flavorText: "Pants were a choice you made this morning." },
  { id: 'autumn_horsepower', number: 40, name: 'Autumn Horsepower', rarity: 'legendary', flavorText: "Parked at the overlook. Sunset is just the backdrop." },
  { id: 'sunday_legend', number: 41, name: 'Sunday Legend', rarity: 'legendary', flavorText: "Ten seconds left. Nobody breathes." },
  { id: 'fall_baking', number: 42, name: 'Fall Baking', rarity: 'legendary', flavorText: "The kitchen is a disaster. The results are not." },

  // ── Mythic (Staff) ──────────────────────────────────────────────────────
  { id: 'jess_gobblin_screamin', number: 43, name: "Jess Gobblin' & Screamin'", rarity: 'mythic', flavorText: "Haunting the Kirbys since day one. No refunds." },
  { id: 'shorty_mcgobble', number: 44, name: 'Shorty McGobble', rarity: 'mythic', flavorText: "Small in stature. Follows Jess anyway." },
  { id: 'silent_but_turkey', number: 45, name: 'Silent But Turkey', rarity: 'mythic', flavorText: "Appeared after hours of silence. Has one question." },
  { id: 'vale_the_pipe_gobbler', number: 46, name: 'Vale the Pipe Gobbler', rarity: 'mythic', flavorText: "Here to fix your pipes. Or bother you. Both." },
  { id: 'wuera_never_sleeps', number: 47, name: 'Wuera Never Sleeps', rarity: 'mythic', flavorText: "It's 3 AM. Another raffle just started." },
  { id: 'yasmin_crafty_clucker', number: 48, name: 'Yasmin Crafty Clucker', rarity: 'mythic', flavorText: "Lesson plans by day. Designs for fun by night." },
  { id: 'nicole_on_the_gobble', number: 49, name: 'Nicole on the Gobble', rarity: 'mythic', flavorText: "Checklist done. Next game already queued." },
  { id: 'geoviz_exe_has_vanished', number: 50, name: 'Geoviz.exe Has Vanished', rarity: 'mythic', flavorText: "Mid-fix. Mid-pixel. Back in five. Maybe." },
];

// season, enabled, limitedEdition, eventTag, image path — applied uniformly here
// rather than repeated on every entry above. Each season's art lives in
// assets/season-N/NNN.png (numbers restart at 001 every season).
function withDefaults(list, season) {
  return list.map(m => ({
    ...m,
    season,
    enabled: true,
    limitedEdition: false,
    eventTag: null,
    image: `assets/season-${season}/${String(m.number).padStart(3, '0')}.png`,
  }));
}

const MONSTERS = [...withDefaults(SEASON_1, 1), ...withDefaults(SEASON_2, 2)];

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
