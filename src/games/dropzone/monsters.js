// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — monster/drop data.
// One centralized table. Add a new drop by adding an entry here — nothing
// else needs to change. `enabled: false` keeps a drop hidden from natural
// drops and from /cards missing until you flip it on.
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
  { id: 'jess_gobblin_screamin', number: 43, name: 'Jess the Gobblescream', rarity: 'mythic', flavorText: "Haunting the Kirbys since day one. No refunds." },
  { id: 'shorty_mcgobble', number: 44, name: 'Shorty McGobble', rarity: 'mythic', flavorText: "Small in stature. Follows Jess anyway." },
  { id: 'silent_but_turkey', number: 45, name: 'Silent the Shadowgobble', rarity: 'mythic', flavorText: "Appeared after hours of silence. Has one question." },
  { id: 'vale_the_pipe_gobbler', number: 46, name: 'Vale the Pipe Gobbler', rarity: 'mythic', flavorText: "Here to fix your pipes. Or bother you. Both." },
  { id: 'wuera_never_sleeps', number: 47, name: 'Wuera the Sleepless Gobble', rarity: 'mythic', flavorText: "It's 3 AM. Another raffle just started." },
  { id: 'yasmin_crafty_clucker', number: 48, name: 'Yasmin the CraftyGobble', rarity: 'mythic', flavorText: "Lesson plans by day. Designs for fun by night." },
  { id: 'nicole_on_the_gobble', number: 49, name: 'Nicole on the Gobble', rarity: 'mythic', flavorText: "Checklist done. Next game already queued." },
  { id: 'geoviz_exe_has_vanished', number: 50, name: 'Geoviz the BossGobble', rarity: 'mythic', flavorText: "Mid-fix. Mid-pixel. Back in five. Maybe." },
];

// season, enabled, limitedEdition, eventTag, image path — applied uniformly here
// rather than repeated on every entry above.
//
// Numbering is continuous across seasons: Season 1 is #1-50, Season 2 is
// #51-100, and so on. Each season's data above is written 1-50 for
// readability; NUMBER_OFFSET turns that into the global number shown in the
// bot. Art files stay per-season and local: assets/season-N/001.png..050.png.
// To go back to restarting at #1 each season, set every offset to 0.
const NUMBER_OFFSET = { 1: 0, 2: 50, 3: 100 };

function withDefaults(list, season) {
  const offset = NUMBER_OFFSET[season] || 0;
  return list.map(m => ({
    ...m,
    number: m.number + offset,
    season,
    enabled: true,
    limitedEdition: false,
    eventTag: null,
    image: `assets/season-${season}/${String(m.number).padStart(3, '0')}.png`,
  }));
}

// ── SEASON 3 — WINTER DROP (starts Dec 1, 2026 3:00am Eastern — see config.js SEASON_SCHEDULE) ──
// Written 1-N like the others; NUMBER_OFFSET makes them #101+. Art: assets/season-3/001.png..
const SEASON_3 = [
  // ── Common ──────────────────────────────────────────────────────────────
  { id: 'first_snow', number: 1, name: "First Snow", rarity: 'common', flavorText: "Everyone's thrilled for exactly nine minutes." },
  { id: 'candy_cane', number: 2, name: "Candy Cane", rarity: 'common', flavorText: "Sweet, sharp, and somehow always broken in half." },
  { id: 'holly_jolly', number: 3, name: "Holly Jolly", rarity: 'common', flavorText: "Looks festive. Bites back." },
  { id: 'cinnamon_wishes', number: 4, name: "Cinnamon Wishes", rarity: 'common', flavorText: "Smells like a hug. Costs like a candle." },
  { id: 'frosted_pinecone', number: 5, name: "Frosted Pinecone", rarity: 'common', flavorText: "Free decor, collected from a very cold lawn." },
  { id: 'winter_beanie', number: 6, name: "Winter Beanie", rarity: 'common', flavorText: "Hair is optional. Warmth is not." },
  { id: 'frosted_mittens', number: 7, name: "Frosted Mittens", rarity: 'common', flavorText: "You lost one by December 3rd. Everyone does." },
  { id: 'cozy_toes', number: 8, name: "Cozy Toes", rarity: 'common', flavorText: "Nobody's seen your real feet since the reindeer moved in." },
  { id: 'christmas_morning', number: 9, name: "Christmas Morning", rarity: 'common', flavorText: "Matching pajamas. Zero dignity. Full joy." },
  { id: 'peppermint_swirl', number: 10, name: "Peppermint Swirl", rarity: 'common', flavorText: "Found in a coat pocket. Still delicious. Don't ask." },
  { id: 'ginger_snap', number: 11, name: "Ginger Snap", rarity: 'common', flavorText: "He ran. You caught him. Zero regrets." },
  { id: 'sugar_rush', number: 12, name: "Sugar Rush", rarity: 'common', flavorText: "Seven cookies in, and the ceiling looks friendly." },
  { id: 'milk_and_cookies', number: 13, name: "Milk & Cookies", rarity: 'common', flavorText: "Left out for Santa. Mostly gone by midnight." },
  { id: 'holiday_ham', number: 14, name: "Holiday Ham", rarity: 'common', flavorText: "Carved with ceremony. Defended with violence." },
  { id: 'christmas_pudding', number: 15, name: "Christmas Pudding", rarity: 'common', flavorText: "Set on fire on purpose. Somehow it's tradition." },
  { id: 'cocoa_comfort', number: 16, name: "Cocoa Comfort", rarity: 'common', flavorText: "Marshmallows first. Regrets later." },
  { id: 'marshmallow_mountain', number: 17, name: "Marshmallow Mountain", rarity: 'common', flavorText: "Climb it with a spoon. Return with a stomachache." },
  { id: 'the_ugly_sweater', number: 18, name: "The Ugly Sweater", rarity: 'common', flavorText: "Tasteful is for other months." },
  { id: 'merry_bauble', number: 19, name: "Merry Bauble", rarity: 'common', flavorText: "Hung with care. Broken by the cat." },
  { id: 'silent_flame', number: 20, name: "Silent Flame", rarity: 'common', flavorText: "One small flame. Four hundred scented opinions." },
  { id: 'christmas_glow', number: 21, name: "Christmas Glow", rarity: 'common', flavorText: "One bulb dies and the whole string goes with it." },
  { id: 'jingle_bells', number: 22, name: "Jingle Bells", rarity: 'common', flavorText: "Impossible to sneak anywhere. Worth it." },
  { id: 'mistletoe_magic', number: 23, name: "Mistletoe Magic", rarity: 'common', flavorText: "Hung innocently. Used strategically." },
  { id: 'the_christmas_wreath', number: 24, name: "The Christmas Wreath", rarity: 'common', flavorText: "The door's only decoration. The neighbors' only benchmark." },
  { id: 'under_the_tree', number: 25, name: "Under the Tree", rarity: 'common', flavorText: "Shaken, weighed, and guessed at since the 15th." },
  { id: 'stuffed_stocking', number: 26, name: "Stuffed Stocking", rarity: 'common', flavorText: "Candy at the top. A single orange at the bottom." },
  { id: 'chimney_watch', number: 27, name: "Chimney Watch", rarity: 'common', flavorText: "Waiting up all night. Asleep by nine." },
  { id: 'frosted_window', number: 28, name: "Frosted Window", rarity: 'common', flavorText: "Draw a heart. Regret it when it melts." },
  { id: 'winter_lantern', number: 29, name: "Winter Lantern", rarity: 'common', flavorText: "Small light, big mood." },
  { id: 'ice_gliders', number: 30, name: "Ice Gliders", rarity: 'common', flavorText: "Graceful for three seconds. Then gravity." },
  { id: 'snow_day', number: 31, name: "Snow Day", rarity: 'common', flavorText: "Cancelled everything. Cleared nothing." },
  { id: 'special_delivery', number: 32, name: "Special Delivery", rarity: 'common', flavorText: "Postmarked North Pole. Signed for by no one." },
  { id: 'christmas_express', number: 33, name: "Christmas Express", rarity: 'common', flavorText: "All aboard. No refunds on the sugar." },
  { id: 'the_tree_topper', number: 34, name: "The Tree Topper", rarity: 'common', flavorText: "Highest seat in the house. Zero responsibilities." },
  { id: 'winter_wonderland', number: 35, name: "Winter Wonderland", rarity: 'common', flavorText: "Shake it once. Stare for an hour." },
  // ── Uncommon ────────────────────────────────────────────────────────────
  { id: 'snow_angel', number: 36, name: "Snow Angel", rarity: 'uncommon', flavorText: "Flopped in the snow. Not getting up." },
  { id: 'waddle_wonderland', number: 37, name: "Waddle Wonderland", rarity: 'uncommon', flavorText: "Zero grip. Maximum confidence." },
  { id: 'baby_blizzard', number: 38, name: "Baby Blizzard", rarity: 'uncommon', flavorText: "Tiny bear. Whole avalanche." },
  { id: 'reindeer_rookie', number: 39, name: "Reindeer Rookie", rarity: 'uncommon', flavorText: "First day on the job. Already named in a song." },
  { id: 'frosted_paws', number: 40, name: "Frosted Paws", rarity: 'uncommon', flavorText: "Tangled in the lights, blames the tree." },
  { id: 'christmas_corgi', number: 41, name: "Christmas Corgi", rarity: 'uncommon', flavorText: "Stole the ribbon. Stole the show." },
  { id: 'nutty_and_nice', number: 42, name: "Nutty & Nice", rarity: 'uncommon', flavorText: "Hoarding acorns for a winter that's already here." },
  { id: 'cookie_criminal', number: 43, name: "Cookie Criminal", rarity: 'uncommon', flavorText: "Caught mid-crumb. Still chewing." },
  { id: 'snowball_bandit', number: 44, name: "Snowball Bandit", rarity: 'uncommon', flavorText: "Built the fort. Declared war. Won." },
  { id: 'tinsel_trouble', number: 45, name: "Tinsel Trouble", rarity: 'uncommon', flavorText: "One tug and the whole tree is involved." },
  { id: 'penguin_postal_service', number: 46, name: "Penguin Postal Service", rarity: 'uncommon', flavorText: "Neither snow nor ice. Slightly late, though." },
  { id: 'sleigh_all_day', number: 47, name: "Sleigh All Day", rarity: 'uncommon', flavorText: "Hill: conquered. Dignity: left at the top." },
  { id: 'snow_much_fun', number: 48, name: "Snow Much Fun", rarity: 'uncommon', flavorText: "Going down fast. Smiling the whole way." },
  { id: 'alpine_adventure', number: 49, name: "Alpine Adventure", rarity: 'uncommon', flavorText: "Hops first, asks about the slope later." },
  { id: 'snowboard_season', number: 50, name: "Snowboard Season", rarity: 'uncommon', flavorText: "Big air. Bigger wipeout." },
  { id: 'the_skating_duchess', number: 51, name: "The Skating Duchess", rarity: 'uncommon', flavorText: "Spins elegantly. Judges you silently." },
  { id: 'frostbite', number: 52, name: "Frostbite", rarity: 'uncommon', flavorText: "Cool under pressure. Colder everywhere else." },
  { id: 'the_christmas_pickle', number: 53, name: "The Christmas Pickle", rarity: 'uncommon', flavorText: "Hidden deep in the tree. Finder gets a prize. Allegedly." },
  { id: 'the_gingerbread_girl', number: 54, name: "The Gingerbread Girl", rarity: 'uncommon', flavorText: "Sweet, sassy, and absolutely not for eating." },
  { id: 'winter_village_baker', number: 55, name: "Winter Village Baker", rarity: 'uncommon', flavorText: "Pipes frosting with the focus of a surgeon." },
  { id: 'deck_the_halls', number: 56, name: "Deck the Halls", rarity: 'uncommon', flavorText: "The tree decorated itself. Nobody's asking questions." },
  { id: 'the_toy_soldier', number: 57, name: "The Toy Soldier", rarity: 'uncommon', flavorText: "Marches on. Nobody told him the battery died." },
  { id: 'christmas_carriage', number: 58, name: "Christmas Carriage", rarity: 'uncommon', flavorText: "Arrives fashionably late. Leaves with the good seat." },
  { id: 'gingerbread_cottage', number: 59, name: "Gingerbread Cottage", rarity: 'uncommon', flavorText: "Structurally unsound. Emotionally perfect." },
  { id: 'midnight_carousel', number: 60, name: "Midnight Carousel", rarity: 'uncommon', flavorText: "Round and round, until the music stops at 12." },
  // ── Rare ────────────────────────────────────────────────────────────────
  { id: 'the_little_match_girl', number: 61, name: "The Little Match Girl", rarity: 'rare', flavorText: "One tiny flame. One very big daydream." },
  { id: 'tiny_tim', number: 62, name: "Tiny Tim", rarity: 'rare', flavorText: "Smallest in the room. Biggest heart in it." },
  { id: 'bob_cratchit', number: 63, name: "Bob Cratchit", rarity: 'rare', flavorText: "Underpaid, overjoyed, and carrying the whole feast." },
  { id: 'the_little_drummer_boy', number: 64, name: "The Little Drummer Boy", rarity: 'rare', flavorText: "No gift but a beat. Somehow enough." },
  { id: 'olive_the_other_reindeer', number: 65, name: "Olive the Other Reindeer", rarity: 'rare', flavorText: "Not built for the sleigh. Showed up anyway." },
  { id: 'the_gingerbread_man', number: 66, name: "The Gingerbread Man", rarity: 'rare', flavorText: "Catch him if you can. Nobody ever can." },
  { id: 'clara', number: 67, name: "Clara", rarity: 'rare', flavorText: "Hugs a nutcracker. Starts an adventure." },
  { id: 'hermey_the_elf', number: 68, name: "Hermey the Elf", rarity: 'rare', flavorText: "Toys are great. Dentistry is better." },
  { id: 'yukon_cornelius', number: 69, name: "Yukon Cornelius", rarity: 'rare', flavorText: "Mountain climbed. Gold found. Pick-axe overused." },
  { id: 'the_bumble', number: 70, name: "The Bumble", rarity: 'rare', flavorText: "Scary until someone hands him the star." },
  { id: 'elf_on_the_shelf', number: 71, name: "Elf on the Shelf", rarity: 'rare', flavorText: "Watching you. Judging you. Cute about it." },
  { id: 'mrs_claus', number: 72, name: "Mrs. Claus", rarity: 'rare', flavorText: "Runs the North Pole. Bakes in her spare time." },
  { id: 'cindy_lou_who', number: 73, name: "Cindy Lou Who", rarity: 'rare', flavorText: "Tiny, sweet, and impossible to say no to." },
  { id: 'max', number: 74, name: "Max", rarity: 'rare', flavorText: "Pulls the whole sleigh. Gets no credit. Still wags." },
  { id: 'buddy_the_elf', number: 75, name: "Buddy the Elf", rarity: 'rare', flavorText: "Four food groups: candy, candy canes, candy corns, syrup." },
  { id: 'kevin_mccallister', number: 76, name: "Kevin McCallister", rarity: 'rare', flavorText: "Home alone. Fully prepared. Slightly unhinged." },
  { id: 'the_wet_bandits', number: 77, name: "The Wet Bandits", rarity: 'rare', flavorText: "Tangled in lights. Outsmarted by a kid." },
  { id: 'sally', number: 78, name: "Sally", rarity: 'rare', flavorText: "Stitched together. Sweetest thing in town." },
  { id: 'jack_frost', number: 79, name: "Jack Frost", rarity: 'rare', flavorText: "Leaves a trail of frost and a trail of chaos." },
  { id: 'frosty_the_snowman', number: 80, name: "Frosty the Snowman", rarity: 'rare', flavorText: "Dances through town. Runs from the sun." },
  // ── Epic ────────────────────────────────────────────────────────────────
  { id: 'jacob_marley', number: 81, name: "Jacob Marley", rarity: 'epic', flavorText: "Dragging his chains and a very late warning." },
  { id: 'ghost_of_christmas_past', number: 82, name: "Ghost of Christmas Past", rarity: 'epic', flavorText: "Replays your memories. Skips no embarrassing ones." },
  { id: 'ghost_of_christmas_present', number: 83, name: "Ghost of Christmas Present", rarity: 'epic', flavorText: "Throws the feast. Judges your guest list." },
  { id: 'ghost_of_christmas_yet_to_come', number: 84, name: "Ghost of Christmas Yet to Come", rarity: 'epic', flavorText: "Doesn't say a word. Doesn't need to." },
  { id: 'the_mouse_king', number: 85, name: "The Mouse King", rarity: 'epic', flavorText: "Tiny king. Enormous attitude. Wants your nutcracker." },
  { id: 'the_sugar_plum_fairy', number: 86, name: "The Sugar Plum Fairy", rarity: 'epic', flavorText: "Dances on tiptoe. Rules over dessert." },
  { id: 'the_land_of_sweets', number: 87, name: "The Land of Sweets", rarity: 'epic', flavorText: "Every path is edible. Every decision is questionable." },
  { id: 'the_snow_queen', number: 88, name: "The Snow Queen", rarity: 'epic', flavorText: "Cold shoulder, but make it a crown." },
  { id: 'santas_workshop', number: 89, name: "Santa's Workshop", rarity: 'epic', flavorText: "Zero days off. Infinite elves. Questionable labor laws." },
  { id: 'whoville', number: 90, name: "Whoville", rarity: 'epic', flavorText: "Small town. Gigantic holiday spirit." },
  { id: 'the_polar_express', number: 91, name: "The Polar Express", rarity: 'epic', flavorText: "All aboard. Bring a ticket and an open mind." },
  { id: 'the_north_pole', number: 92, name: "The North Pole", rarity: 'epic', flavorText: "Everyone's list is checked here. Twice." },
  // ── Legendary ───────────────────────────────────────────────────────────
  { id: 'krampus', number: 93, name: "Krampus", rarity: 'legendary', flavorText: "Naughty list's personal accountant." },
  { id: 'the_christmas_star', number: 94, name: "The Christmas Star", rarity: 'legendary', flavorText: "Lit the way once. Still outshining every tree topper." },
  { id: 'ebenezer_scrooge', number: 95, name: "Ebenezer Scrooge", rarity: 'legendary', flavorText: "Humbug at midnight. Generous by morning." },
  { id: 'the_nutcracker', number: 96, name: "The Nutcracker", rarity: 'legendary', flavorText: "Cracks nuts, battles mice, never blinks." },
  { id: 'jack', number: 97, name: "Jack", rarity: 'legendary', flavorText: "Pumpkin King by trade. Santa by terrible mistake." },
  { id: 'rudolph', number: 98, name: "Rudolph", rarity: 'legendary', flavorText: "Mocked for his nose. Hired for his nose." },
  { id: 'the_christmas_thief', number: 99, name: "The Christmas Thief", rarity: 'legendary', flavorText: "Hates the noise, noise, noise. Loves the sleigh." },
  { id: 'santa_claus', number: 100, name: "Santa Claus", rarity: 'legendary', flavorText: "Knows if you've been bad or good. Brings cookies anyway." },
  // ── Mythic ──────────────────────────────────────────────────────────────
  { id: 'geovanna_snowflake_duchess', number: 101, name: "Geovanna | The Snowflake Duchess", rarity: 'mythic', flavorText: "Every flake is unique. So is the attitude." },
  { id: 'agustin_midnight_nutcracker', number: 102, name: "Agustin | The Midnight Nutcracker", rarity: 'mythic', flavorText: "Anonymous by choice. Dramatic by nature." },
  { id: 'jessica_miss_mistletoe', number: 103, name: "Jessica | Miss Mistletoe", rarity: 'mythic', flavorText: "Raises a glass. Rules the room." },
  { id: 'yasmin_christmas_wishmaker', number: 104, name: "Yasmin | The Christmas Wishmaker", rarity: 'mythic', flavorText: "Reads every letter. Grants the good ones." },
  { id: 'julie_christmas_duchess', number: 105, name: "Julie | The Christmas Duchess", rarity: 'mythic', flavorText: "Pink, polished, and never underdressed." },
  { id: 'jazzy_peppermint_princess', number: 106, name: "Jazzy | The Peppermint Princess", rarity: 'mythic', flavorText: "Sweet smile. Stripes with a spine." },
  { id: 'katherine_gingerbread_heiress', number: 107, name: "Katherine | The Gingerbread Heiress", rarity: 'mythic', flavorText: "Royalty made of spice and everything nice." },
  { id: 'chardo_arctic_commander', number: 108, name: "Chardo | The Arctic Commander", rarity: 'mythic', flavorText: "Leads the pack. The husky just follows the snacks." },
  { id: 'valorie_holiday_mechanic', number: 109, name: "Valorie | The Holiday Mechanic", rarity: 'mythic', flavorText: "Keeps the sleigh running. Doesn't take questions." },
  { id: 'apryl_sugar_plum_duchess', number: 110, name: "Apryl | The Sugar Plum Duchess", rarity: 'mythic', flavorText: "Sweet enough to rule. Smart enough to stay in charge." },
  { id: 'mariela_christmas_authority', number: 111, name: "Mariela | The Christmas Authority", rarity: 'mythic', flavorText: "Rings the bell. The holiday begins." },
  { id: 'nala_heart_of_winter', number: 112, name: "Nala | The Heart of Winter", rarity: 'mythic', flavorText: "Even the snow animals line up for her." },
  { id: 'nicole_guardian_christmas_chaos', number: 113, name: "Nicole | The Guardian of Christmas Chaos", rarity: 'mythic', flavorText: "Presents everywhere. Everything under control." },
  { id: 'yasmin_weaver_christmas_dreams', number: 114, name: "Yasmin | The Weaver of Christmas Dreams", rarity: 'mythic', flavorText: "Spins wishes into something you can wrap." },
  { id: 'kareena_aurora_empress', number: 115, name: "Kareena | The Aurora Empress", rarity: 'mythic', flavorText: "Northern lights, on her command." },
];

// ── Collector drops ──────────────────────────────────────────────────────
// Special drops that NEVER spawn naturally and can only be given out by an admin
// (/cards-admin gift). They live in their own Collector book (season 0). Members can't trade,
// gift or exchange them. Add one by adding an entry here + its art file:
//   { id: 'founder_crown', season: 2, number: 1, name: 'Founder Crown', flavorText: '...' }
//   art → assets/collector/founder_crown.png  (or set `image:` explicitly)
const COLLECTOR = [
  { id: 'geovanna', number: 1, name: 'Geovanna',           title: 'The Board Princess · Owner',               flavorText: 'The heart and vision behind the kingdom we call home.' },
  { id: 'jessica',  number: 2, name: 'Jessica',            title: 'The Chaos Queen · Co-Owner',               flavorText: 'The chaos, laughter, and energy that keep TBP alive.' },
  { id: 'maria',    number: 3, name: 'Maria',              title: 'The Royal Sweetheart · Admin',             flavorText: 'A gentle heart who brings warmth to every royal gathering.' },
  { id: 'agustin',  number: 4, name: 'Agustin',            title: 'The Shadow Keeper · Admin',                flavorText: 'Quietly lurking, always protecting the kingdom from the shadows.' },
  { id: 'valorie',  number: 5, name: 'Valorie',            title: 'The Chaos Plumber · Moderator',            flavorText: 'Fixing problems, creating chaos, and keeping everyone laughing.' },
  { id: 'kareena',  number: 6, name: 'Kareena',            title: 'The Midnight Guardian · Moderator',        flavorText: 'A caring heart whose dedication never seems to sleep.' },
  { id: 'marie',    number: 7, name: 'Marie',  title: 'The First Guardian · Eternal Court',       flavorText: 'Our first staff member, our forever Wonderwoman.' },
  { id: 'yasmin',   number: 8, name: 'Yasmin',             title: 'The Royal Creator · Game Host',            flavorText: 'Turning creativity and kindness into magic for the kingdom.' },
  { id: 'nicole',   number: 9, name: 'Nicole',             title: 'The Royal Enigma · Game Host',             flavorText: 'A unique spirit who brings mystery and personality to TBP.' },
  { id: 'mariela',  number: 10, name: 'Mariela',            title: 'The Unofficial Authority · Royal Legacy',  flavorText: 'She retired from staff, but never from the kingdom.' },
  { id: 'rudeboy',  number: 11, name: 'Rodolfo',            title: 'The Kingdom Mischief Maker · OG Member',   flavorText: 'Always keeping the kingdom entertained with chaos, loyalty, and messy vibes.' },
];
function collectorDefaults(list) {
  return list.map(m => ({
    season: 0, enabled: true, limitedEdition: true, eventTag: 'collector',      // season 0 = the Collector book, separate from every season
    image: `assets/collector/${m.id}.png`,
    ...m, rarity: 'collector', collector: true,
  }));
}

const MONSTERS = [...withDefaults(SEASON_1, 1), ...withDefaults(SEASON_2, 2), ...withDefaults(SEASON_3, 3), ...collectorDefaults(COLLECTOR)];

function getMonster(id) {
  return MONSTERS.find(m => m.id === id) || null;
}
/** Display label: #049 for normal drops, C#001 for collector cards. */
function fmtNumber(m) {
  return `${m.collector ? 'C' : ''}#${String(m.number).padStart(3, '0')}`;
}
function getCollectorMonsters() {
  return MONSTERS.filter(m => m.collector);
}
function getMonstersBySeason(season) {
  return MONSTERS.filter(m => m.season === season);
}
function getMonstersByRarity(rarity, season) {
  return MONSTERS.filter(m => !m.collector && m.rarity === rarity && (season === undefined || m.season === season));
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
  MONSTERS, getMonster, fmtNumber, getCollectorMonsters, getMonstersBySeason, getMonstersByRarity, getEnabledMonstersByRarity,
  isEnabled, loadOverrides, setOverride,
};
