/**
 * events/rumbleslaughter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * RUMBLE SLAUGHTER: YOU THOUGHT YOU ATE
 * ─────────────────────────────────────────────────────────────────────────────
 * A chaotic, sarcastic, slightly unfair battle royale inside Play & Regret.
 *
 * COMMANDS (prefix ! or slash /)
 *   !rumbleslaughter <bet> [<t:timestamp:F>]  — start signup / schedule
 *   !rsprofile [@user]                        — view profile (public embed)
 *   !rsleaderboard                            — top players by XP
 *   !openbackpack                             — open your oldest backpack (ephemeral)
 *   !rsinventory                              — view your inventory (ephemeral)
 *   !rsequip <itemid>                         — equip a weapon
 *   !rsjoin                                   — join open game
 *   !startgame                                — manually fire scheduled game
 *   !cancelevent                              — cancel with refunds
 *   !rschedule                                — show scheduled game in channel
 *
 * ADMIN ONLY
 *   !rig @user <petty|favorite|maincharacter> — rig a player
 *   !unrig @user                              — remove rig
 *   !rigrole @role <petty|favorite|maincharacter|off> — rig a role
 *   !rigrandom <on|off>                       — secret random chosen menace
 *   !riggedmode <public|hidden>               — announce rigged or keep silent
 *   !staffrole @role                          — set the staff role for Staff vs Members
 *   !givebackpack @user <basic|royal|cursed> [amount] — give backpacks
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, economy } = require('../utils/database');
const jackpot = require('../utils/jackpot');
const E = require('../utils/emojis');
const { resolveEra, getEra, listEras, ERAS } = require('./rs_eras');

// ─── Constants ────────────────────────────────────────────────────────────────
const JACKPOT_TAX     = 0.10; // 10% of winnings → jackpot
const MIN_PLAYERS     = 3;
const ROUND_DELAY_MS  = 5000;

const XP = {
  PARTICIPATE: 10,
  SURVIVE_ROUND: 5,
  ELIMINATE: 15,
  WIN: 50,
  LOSE: 5,
};

// XP → backpack milestones: [xpThreshold, backpackType]
const BACKPACK_MILESTONES = [
  [100,  'basic'],
  [300,  'basic'],
  [600,  'royal'],
  [1000, 'cursed'],
];
const BACKPACK_RECURRING_INTERVAL = 500; // every 500 XP after 1000 → royal

const RIG_FIGHT_BONUS = { none: 0, petty: 10, favorite: 20, maincharacter: 35 };
const RIG_LOOT_BONUS  = { none: 0, petty: 5,  favorite: 10, maincharacter: 18 };
const RIG_IMMUNITY    = { none: 0, petty: 0,  favorite: 1,  maincharacter: 2  };

// In-memory active game state per channel
const activeGames  = new Map();
const pendingEras  = new Map(); // channelId → eraKey set via /setera

// ─── NARRATIVE POOLS ─────────────────────────────────────────────────────────
const WIN_LINES = [
  '@winner wins somehow.',
  '@winner survived. confused.',
  '@winner takes the crown. don\'t get comfortable.',
  '@winner wins. deserved? absolutely not.',
  '@winner really said I\'m built different and nobody stopped them.',
  '@winner wins. the bar was low but still.',
  '@winner is your champion. embarrassing for everyone else.',
  '@winner didn\'t play fair they played effective.',
  '@winner wins. report them if you\'re mad.',
  '@winner stood on business. the rest stood on nothing.',
  '@winner wins. you all allowed this.',
  '@winner survives purely out of spite.',
  '@winner wins and yes they will be insufferable now.',
  '@winner is the main character today. unfortunately.',
  '@winner wins. the arena regrets it.',
  '@winner ate. finally someone did.',
  '@winner wins. barely. we\'ll count it.',
  '@winner wins. don\'t ask how.',
  '@winner wins. the rest delete your accounts.',
  '@winner wins. everyone else go reflect.',
  '@winner really said not today and meant it. disgusting.',
  '@winner is built different. unfortunately for all of us.',
  '@winner did that with zero remorse. respect the audacity.',
  '@winner said I came here to win and somehow wasn\'t lying.',
  '@winner won. we\'re all processing it differently.',
  '@winner really said hold my sins and delivered.',
  '@winner survived everything the arena threw. still insufferable.',
  '@winner wins. the arena is personally embarrassed.',
  '@winner did that. and will absolutely bring it up forever.',
  '@winner wins. therapy is cheaper than entering this again.',
  '@winner said it\'s giving champion and they were right.',
  '@winner really got up and chose violence and it worked.',
  '@winner wins. nobody is happy about this. especially them.',
  '@winner is dangerous and should be studied.',
  '@winner did the bare minimum and still won. somehow.',
];

const ELIM_LINES = [
  '@user thought they ate they didn\'t.',
  '@user got eliminated by vibes alone.',
  '@user tripped over nothing. tragic.',
  '@user blinked and it was over.',
  '@user tried. that was the problem.',
  '@user got humbled immediately.',
  '@user was never a real contender.',
  '@user got eliminated mid-thought.',
  '@user really came here for this outcome?',
  '@user embarrassed themselves and left.',
  '@user had potential. keyword: had.',
  '@user got eliminated by bad decisions.',
  '@user was just here for decoration.',
  '@user got folded instantly.',
  '@user said watch this and we did.',
  '@user lasted 3 seconds. impressive? no.',
  '@user got eliminated before we learned their name.',
  '@user tried to be bold. that was a mistake.',
  '@user lost. loudly.',
  '@user got removed from existence.',
  '@user simply stopped being relevant.',
  '@user was eliminated for being annoying.',
  '@user thought confidence equals skill.',
  '@user got sent home with nothing.',
  '@user never stood a chance.',
  '@user logged in just to lose.',
  '@user got eliminated by the tutorial.',
  '@user lost to themselves.',
  '@user really thought today was their day.',
  '@user got packed up.',
  '@user got turned into a lesson.',
  '@user got dropped immediately.',
  '@user was eliminated out of disrespect.',
  '@user tried to fight why.',
  '@user got deleted.',
  '@user fumbled the easiest round.',
  '@user got sent back to the lobby.',
  '@user is no longer with us. thankfully.',
  '@user got eliminated by existing wrong.',
  '@user got outplayed by nothing.',
  '@user really showed up for this? brave. wrong. but brave.',
  '@user got eliminated mid-sentence.',
  '@user ran into the arena and immediately regretted it.',
  '@user said let\'s go and then immediately didn\'t.',
  '@user got clapped and didn\'t even see it coming.',
  '@user game plan was hope for the best. it failed.',
  '@user got eliminated so fast the server barely noticed.',
  '@user came in loud and left quiet. character arc.',
  '@user was fighting the wrong battle the whole time.',
  '@user got outclassed by someone half paying attention.',
  '@user didn\'t read the room and the room read them.',
  '@user made one decision and it was the wrong one.',
  '@user lost before the round fully started.',
  '@user got violated and said thank you.',
  '@user was a casualty of their own confidence.',
  '@user showed up. that\'s honestly the most impressive part.',
  '@user tried a different strategy. it was also wrong.',
  '@user got eliminated mid-comeback story.',
  '@user thought they were built different. they were just different.',
  '@user got eliminated so clean it was almost respectful.',
  '@user left no impact. the arena already forgot.',
  '@user is gone. the vibes improved slightly.',
  '@user came prepared. just not for this.',
  '@user really peaked at joining.',
  '@user didn\'t lose. they just ran out of winning.',
  '@user left with nothing but regret and lessons.',
  '@user got cooked. seasoned. served.',
  '@user fumbled their entrance middle and exit.',
  '@user got eliminated for crimes the arena won\'t specify.',
];

const HUMILIATION_LINES = [
  '@user lost so badly it\'s being studied.',
  '@user should log off after that.',
  '@user will never recover.',
  '@user got embarrassed in 4K.',
  '@user just became a warning.',
  '@user lost in a way that felt personal.',
  '@user should pretend this didn\'t happen.',
  '@user got humbled beyond repair.',
  '@user reputation just died.',
  '@user experienced character development.',
  '@user got eliminated so hard the arena felt bad. briefly.',
  '@user lost in a way that requires a formal apology.',
  '@user should delete their account and start fresh.',
  '@user got cooked plated and served to the crowd.',
  '@user just became a case study in what not to do.',
  '@user lost so publicly the arena is still cringing.',
  '@user got eliminated and somehow made it worse by trying.',
  '@user ancestors felt that.',
  '@user just put on a masterclass in losing.',
  '@user got done so dirty the arena needs therapy.',
  '@user really stood on something and it collapsed.',
  '@user got ethered in front of everyone.',
  '@user game plan was a war crime against strategy.',
  '@user lost in a way that defies basic physics.',
  '@user got eliminated so thoroughly it felt scripted.',
];

const FIGHT_LINES = [
  '@attacker absolutely destroyed @target.',
  '@attacker swung first and it showed.',
  '@attacker didn\'t hesitate. @target did.',
  '@attacker hit @target with unnecessary force.',
  '@attacker really woke up violent.',
  '@attacker caught @target lacking.',
  '@attacker pressed @target for no reason.',
  '@attacker made it personal.',
  '@attacker said it\'s me or you it was you.',
  '@attacker left no crumbs.',
  '@attacker applied pressure immediately.',
  '@attacker violated @target respectfully.',
  '@attacker didn\'t even break a sweat.',
  '@attacker ended that quickly.',
  '@attacker chose violence today.',
  '@attacker said enough is enough.',
  '@attacker dominated @target.',
  '@attacker made @target regret joining.',
  '@attacker turned @target into content.',
  '@attacker handled that.',
  '@attacker said this one and pointed at @target specifically.',
  '@attacker eliminated @target with zero emotional investment.',
  '@attacker didn\'t even look at @target while winning.',
  '@attacker sent @target home and kept moving.',
  '@attacker said bye mid-fight and was right.',
  '@attacker ran through @target like they weren\'t even there.',
  '@attacker made @target look like a tutorial enemy.',
  '@attacker removed @target from the equation.',
  '@attacker saw @target and said easy.',
  '@attacker folded @target like a receipt.',
  '@attacker beat @target so bad they felt it spiritually.',
  '@attacker said nothing and did everything to @target.',
  '@attacker clocked @target without breaking stride.',
  '@attacker turned @target into a footnote.',
  '@attacker eliminated @target mid-comeback attempt.',
  '@attacker found @target lacking in every measurable way.',
  '@attacker destroyed @target and looked bored doing it.',
  '@attacker sent @target to the shadow realm.',
];

const BACKPACK_LINES = [
  '@user opened a backpack let\'s see if it was worth it.',
  '@user got something not good but something.',
  '@user pulled a rare item. finally some luck.',
  '@user got absolute garbage. congrats.',
  '@user found a sword. don\'t get excited.',
  '@user opened a backpack and regrets it.',
  '@user got a boost. try not to waste it.',
  '@user pulled something decent. shocking.',
  '@user found nothing useful.',
  '@user got a weapon. now they\'re dangerous (barely).',
  '@user opened a backpack and got humbled.',
  '@user got lucky. it won\'t last.',
  '@user got scammed by their own backpack.',
  '@user found power. use it wisely (you won\'t).',
  '@user got something shiny. useless but shiny.',
  '@user opened the backpack and immediately questioned their choices.',
  '@user found something cursed. they\'re keeping it anyway.',
  '@user got an item. the item is judging them.',
  '@user opened a backpack like it owed them something.',
  '@user found loot. the loot found them first.',
  '@user got a weapon that\'s seen better days.',
  '@user opened a backpack and sighed audibly.',
  '@user pulled something rare. don\'t read into it.',
  '@user found power and immediately looked dangerous.',
];

const CHAOS_EVENTS = [
  { text: 'Everyone trips. Multiple eliminations. embarrassing.',                      type: 'mass_elim',   count: 2 },
  { text: 'The arena glitched. Random player eliminated.',                             type: 'random_elim', count: 1 },
  { text: 'The crowd turns on you. chaos ensues.',                                     type: 'random_elim', count: 2 },
  { text: 'A random explosion. nobody saw it coming.',                                 type: 'random_elim', count: 1 },
  { text: 'Sudden death mode activated. good luck.',                                   type: 'mass_elim',   count: 3 },
  { text: 'The arena got bored. people disappear.',                                    type: 'random_elim', count: 1 },
  { text: 'Everyone panics. nobody survives comfortably.',                             type: 'mass_elim',   count: 2 },
  { text: 'The vibes shifted. bad for some of you.',                                   type: 'random_elim', count: 1 },
  { text: 'Random eliminations. stay mad.',                                            type: 'random_elim', count: 2 },
  { text: 'The game said not today to several players.',                               type: 'mass_elim',   count: 2 },
  { text: 'Chaos event triggered. survival not guaranteed.',                           type: 'random_elim', count: 1 },
  { text: 'The arena chose violence.',                                                 type: 'random_elim', count: 2 },
  { text: 'Everything goes wrong at once.',                                            type: 'mass_elim',   count: 3 },
  { text: 'A mysterious force removes players.',                                       type: 'random_elim', count: 1 },
  { text: 'Nobody is safe. especially you.',                                           type: 'random_elim', count: 2 },
  { text: 'The arena just decided. sorry not sorry.',                                  type: 'random_elim', count: 1 },
  { text: 'Gravity stopped working for some people.',                                  type: 'random_elim', count: 2 },
  { text: 'Someone angered the arena. everyone pays.',                                 type: 'mass_elim',   count: 2 },
  { text: 'The floor is lava. some of you forgot.',                                    type: 'random_elim', count: 1 },
  { text: 'An act of god. specifically targeting certain players.',                    type: 'random_elim', count: 1 },
  { text: 'The arena sneezed. casualties occurred.',                                   type: 'random_elim', count: 2 },
  { text: 'Someone made a noise. the arena did not appreciate it.',                    type: 'random_elim', count: 1 },
  { text: 'The simulation got tired of pretending.',                                   type: 'mass_elim',   count: 2 },
  { text: 'Spontaneous elimination. no reason given.',                                 type: 'random_elim', count: 1 },
  { text: 'The arena rolled dice. you lost.',                                          type: 'random_elim', count: 2 },
  { text: 'Unannounced execution. the arena apologizes to nobody.',                    type: 'random_elim', count: 1 },
  { text: 'Selected for elimination. the process felt personal.',                      type: 'random_elim', count: 1 },
  { text: 'Mass chaos event. the arena is not explaining itself.',                     type: 'mass_elim',   count: 3 },
  { text: 'The arena got emotional. people got eliminated.',                           type: 'random_elim', count: 2 },
  { text: 'Targeted elimination. the arena has favorites.',                            type: 'random_elim', count: 1 },
];

// ─── REVIVE LINES ─────────────────────────────────────────────────────────────
const REVIVE_LINES = [
  '@user said nah to being dead. back in the arena with full audacity.',
  'wait. @user is getting back up?? the audacity. the NERVE.',
  '@user refused to stay eliminated. deeply concerning.',
  'the arena tried to remove @user. @user said no.',
  '@user crawled back from the dead like nothing happened. terrifying.',
  'PLOT TWIST: @user is not done. somehow.',
  '@user just got a second life. please use it better than the first.',
  'the dead have returned. specifically @user. the arena is upset.',
  '@user was eliminated and then became everyone\'s problem again.',
  'somehow @user is still here. the universe made a mistake.',
  '@user said I\'m not done yet and the arena had to respect it.',
  '@user just disrespected death itself. back in the fight.',
  'the elimination didn\'t take. @user has returned. god help us.',
  '@user got eliminated and said lol no. back in the arena.',
  'REVIVED: @user is back. more dangerous. more unhinged.',
  '@user was dead for 3 seconds and came back petty.',
  'nobody told @user they were supposed to stay dead. they\'re back.',
  '@user just pulled off the most disrespectful comeback in arena history.',
  'the arena is shaking. @user refused the elimination.',
  '@user clocked out of death and clocked back in. terrifying energy.',
];

const AUTO_REVIVE_LINES = [
  '🎰 the arena spun the wheel of chaos and landed on @user. they\'re back. nobody asked.',
  '<a:eyes:1511507447704191026> the arena looked at @user\'s corpse and said not yet. terrifying.',
  '<a:dice_roll:1507764402013868154> luck intervened specifically for @user. the odds were wrong. they\'re alive.',
  '💀 @user was eliminated but the arena changed its mind. chaos reigns.',
  '🩸 @user got a free pass from the arena. don\'t read into it.',
  '<a:eyes:1511507447704191026> something happened and @user is alive again. the arena won\'t explain.',
  '🎰 random revival activated. @user is somehow still your problem.',
  '💀 the arena glitched in @user\'s favor. they\'re back. stay mad.',
  '<a:dice_roll:1507764402013868154> @user was dead for exactly 0.3 seconds. the arena had other plans.',
  '<a:eyes:1511507447704191026> @user got lucky. disgustingly unfairly lucky. they\'re alive.',
  '🩸 the arena resurrected @user for sport. enjoy the chaos.',
  '🎰 revival rolled. @user won the worst lottery. they\'re back.',
  '💀 @user got un-eliminated. this is not standard procedure.',
  '<a:dice_roll:1507764402013868154> the arena decided @user\'s story wasn\'t over. questionable decision.',
  '<a:eyes:1511507447704191026> @user should be dead. they are not. nobody is explaining this.',
];

const STAFF_VS_MEMBERS_LINES = [
  '<a:MVP24:1495665626688131183> **STAFF VS MEMBERS EVENT!** The arena just got political.',
  '<:sword:1495666991187361943> Staff have entered the chat. This is not a drill.',
  '<a:hmmdevil:1495665623219306647> The privileged have joined the battlefield. good luck.',
  '<a:MVP24:1495665626688131183> Staff vs Members round triggered. May the least embarrassing team win.',
];

// ─── ITEMS ───────────────────────────────────────────────────────────────────
const ITEMS = {
  weapons: {
    common:    [
      { id: 'rusty_sword',    name: 'Rusty Sword',    type: 'weapon', rarity: 'common',    powerBonus: 2 },
      { id: 'plastic_knife',  name: 'Plastic Knife',  type: 'weapon', rarity: 'common',    powerBonus: 1 },
      { id: 'training_sword', name: 'Training Sword', type: 'weapon', rarity: 'common',    powerBonus: 3 },
    ],
    rare:      [
      { id: 'princess_blade', name: 'Princess Blade', type: 'weapon', rarity: 'rare',      powerBonus: 6 },
      { id: 'diamond_dagger', name: 'Diamond Dagger', type: 'weapon', rarity: 'rare',      powerBonus: 7 },
      { id: 'crown_cutter',   name: 'Crown Cutter',   type: 'weapon', rarity: 'rare',      powerBonus: 6 },
    ],
    epic:      [
      { id: 'golden_guillotine', name: 'Golden Guillotine', type: 'weapon', rarity: 'epic', powerBonus: 10 },
      { id: 'blood_rose_blade',  name: 'Blood Rose Blade',  type: 'weapon', rarity: 'epic', powerBonus: 11 },
    ],
    legendary: [
      { id: 'thronebreaker', name: 'Thronebreaker', type: 'weapon', rarity: 'legendary', powerBonus: 15 },
      { id: 'queens_wrath',  name: "Queen's Wrath", type: 'weapon', rarity: 'legendary', powerBonus: 17 },
    ],
  },
  boosts: [
    { id: 'revive_token',        name: 'Revive Token',        type: 'boost', rarity: 'epic',   effect: 'revive',      value: 1,  desc: 'Come back from death once. at 50% power.' },
    { id: 'energy_drink',       name: 'Energy Drink',       type: 'boost', rarity: 'common', effect: 'temp_power',  value: 2,  desc: 'One round power boost.' },
    { id: 'plot_armor_spray',   name: 'Plot Armor Spray',   type: 'boost', rarity: 'epic',   effect: 'immunity',    value: 1,  desc: 'Immune for one round.' },
    { id: 'crown_polish',       name: 'Crown Polish',       type: 'boost', rarity: 'rare',   effect: 'loot_bonus',  value: 10, desc: '+10% better loot next pack.' },
  ],
  junk: [
    { id: 'expired_juice',     name: 'Expired Juice',      type: 'junk', rarity: 'common', effect: 'none',        value: 0,  desc: 'Smells illegal.' },
    { id: 'wet_sock',          name: 'Wet Sock',           type: 'junk', rarity: 'common', effect: 'none',        value: 0,  desc: 'Emotionally devastating.' },
    { id: 'clown_certificate', name: 'Clown Certificate',  type: 'junk', rarity: 'common', effect: 'none',        value: 0,  desc: 'Officially embarrassing.' },
    { id: 'spilled_juice',     name: 'Spilled Juice',      type: 'junk', rarity: 'rare',   effect: 'temp_power',  value: -2, desc: 'Sticky and unfortunate.' },
    { id: 'loud_outfit',       name: 'Loud Outfit',        type: 'junk', rarity: 'rare',   effect: 'aggro',       value: 1,  desc: 'Too noticeable for survival.' },
    { id: 'fake_crown',        name: 'Fake Crown',         type: 'junk', rarity: 'rare',   effect: 'hidden_power',value: 3,  desc: 'Looks cheap, hits hard.' },
    { id: 'lucky_sock',        name: 'Lucky Sock',         type: 'junk', rarity: 'rare',   effect: 'survival',    value: 5,  desc: 'Do not question it.' },
  ],
  wildcards: [
    { id: 'delete_button', name: 'Delete Button', type: 'wildcard', effect: 'random_eliminate', desc: 'Someone is getting sent home.' },
    { id: 'plot_twist',    name: 'Plot Twist',    type: 'wildcard', effect: 'swap_power',       desc: 'The producers interfered.' },
    { id: 'rigged_script', name: 'Rigged Script', type: 'wildcard', effect: 'grant_rig',        desc: 'You got producer privileges.' },
  ],
  titles: [
    { id: 'main_character',        name: 'Main Character' },
    { id: 'certified_menace',      name: 'Certified Menace' },
    { id: 'public_embarrassment',  name: 'Public Embarrassment' },
    { id: 'the_chosen_one',        name: 'The Chosen One' },
    { id: 'plot_armor_survivor',   name: 'Plot Armor Survivor' },
  ],
};

const RARITY_EMOJI = { revive: '💀', common: '<:3152simpjuice:1495998540193861642>', rare: '<a:17279sockslinebearish:1495998541120667769>', epic: '🟣', legendary: '🟡', junk: '🗑️', boost: '<a:fire1:1495666086534844516>', wildcard: '<a:cards:1511530261551124561>' };

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
async function ensureRSUser(userId, username) {
  await db.run(`
    INSERT INTO rs_players (user_id, username)
    VALUES (?, ?)
    ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username
  `, [userId, username]);
  return db.get('SELECT * FROM rs_players WHERE user_id = ?', [userId]);
}

async function getPlayer(userId) {
  return db.get('SELECT * FROM rs_players WHERE user_id = ?', [userId]);
}

async function getInventory(userId) {
  return db.all('SELECT * FROM rs_inventory WHERE user_id = ? ORDER BY acquired_at ASC', [userId]);
}

async function addItem(userId, item) {
  await db.run(
    'INSERT INTO rs_inventory (user_id, item_id, item_name, item_type, rarity, power_bonus, effect, effect_value, description) VALUES (?,?,?,?,?,?,?,?,?)',
    [userId, item.id, item.name, item.type, item.rarity || 'common', item.powerBonus || 0, item.effect || 'none', item.value || 0, item.desc || '']
  );
}

async function getSettings() {
  const row = await db.get('SELECT * FROM rs_settings WHERE id = 1');
  return row || { rigrandom: false, riggedmode: 'hidden', staff_role_id: null };
}

async function getLogChannel(client, fallbackChannel) {
  try {
    const settings = await db.get('SELECT log_channel_id FROM rs_settings WHERE id = 1');
    if (settings?.log_channel_id) {
      const ch = await client.channels.fetch(settings.log_channel_id).catch(() => null);
      if (ch) return ch;
    }
  } catch(e) {}
  return fallbackChannel;
}

async function getSetting(key) {
  const row = await db.get('SELECT value FROM rs_settings WHERE id = 1');
  return row ? row[key] : null;
}

async function setSetting(key, value) {
  await db.run(`
    INSERT INTO rs_settings (id, ${key}) VALUES (1, ?)
    ON CONFLICT (id) DO UPDATE SET ${key} = EXCLUDED.${key}
  `, [value]);
}

async function getRiggedRole(roleId) {
  return db.get('SELECT * FROM rs_rigged_roles WHERE role_id = ?', [roleId]);
}

// ─── XP & PROGRESSION ────────────────────────────────────────────────────────
function xpNeededForLevel(level) {
  return 50 * level + level * level * 10;
}

async function awardXP(userId, username, amount) {
  const player = await ensureRSUser(userId, username);
  let xp       = Number(player.xp) + amount;
  let level    = Number(player.level);
  let power    = Number(player.power);
  const oldTotalXp = Number(player.total_xp);
  const newTotalXp = oldTotalXp + amount;
  const backpacksToGrant = [];

  // Level up
  while (xp >= xpNeededForLevel(level)) {
    xp -= xpNeededForLevel(level);
    level++;
    power += 2;
  }

  // Check backpack milestones
  for (const [threshold, type] of BACKPACK_MILESTONES) {
    if (oldTotalXp < threshold && newTotalXp >= threshold) {
      backpacksToGrant.push(type);
    }
  }
  // Recurring milestone every 500 XP after 1000
  if (newTotalXp > 1000) {
    const prevSlots = Math.floor((oldTotalXp - 1000) / BACKPACK_RECURRING_INTERVAL);
    const newSlots  = Math.floor((newTotalXp  - 1000) / BACKPACK_RECURRING_INTERVAL);
    for (let i = prevSlots; i < newSlots; i++) backpacksToGrant.push('royal');
  }

  const oldLevel = Number(player.level);
  await db.run(
    'UPDATE rs_players SET xp = ?, level = ?, power = ?, total_xp = ? WHERE user_id = ?',
    [xp, level, power, newTotalXp, userId]
  );

  // Level-up unlock announcements (returned so caller can post in channel)
  const levelUnlocks = [];
  if (oldLevel < 10 && level >= 10) {
    levelUnlocks.push(`<a:confetti:1495667283870089307> **${username}** hit **level 10** and unlocked **animated emojis**! Use \`!pickemoji\` to choose your arena emoji. ✨`);
  }
  if (oldLevel < 20 && level >= 20) {
    levelUnlocks.push(`<a:confetti:1495667283870089307> **${username}** hit **level 20** and unlocked a **second emoji slot**! Use \`!addemoji\` to set it.`);
  }

  // Grant backpacks
  for (const type of backpacksToGrant) {
    const col = `backpacks_${type}`;
    await db.run(`UPDATE rs_players SET ${col} = ${col} + 1 WHERE user_id = ?`, [userId]);
  }

  return { backpacksToGrant, leveledUp: level > oldLevel, newLevel: level, levelUnlocks };
}

// ─── ITEM HELPERS ─────────────────────────────────────────────────────────────
function rollBackpack(type, rigLevel = 'none') {
  const bonus = RIG_LOOT_BONUS[rigLevel] || 0;
  const weights = {
    basic:  [
      { bucket: 'junk',      w: Math.max(1, 60 - bonus) },
      { bucket: 'common',    w: 25 },
      { bucket: 'rare',      w: 10 + Math.floor(bonus / 2) },
      { bucket: 'boost',     w: 5  + Math.floor(bonus / 3) },
    ],
    royal:  [
      { bucket: 'rare',      w: 35 },
      { bucket: 'boost',     w: 25 },
      { bucket: 'epic',      w: 15 + Math.floor(bonus / 2) },
      { bucket: 'legendary', w: 5  + Math.floor(bonus / 3) },
      { bucket: 'wildcard',  w: 5 },
    ],
    cursed: [
      { bucket: 'junk',      w: Math.max(1, 35 - bonus) },
      { bucket: 'rare',      w: 25 },
      { bucket: 'epic',      w: 20 + Math.floor(bonus / 3) },
      { bucket: 'legendary', w: 10 + Math.floor(bonus / 4) },
      { bucket: 'wildcard',  w: 10 },
    ],
  };

  const pool   = weights[type] || weights.basic;
  const total  = pool.reduce((s, e) => s + e.w, 0);
  let roll     = Math.random() * total;
  let bucket   = pool[pool.length - 1].bucket;
  for (const e of pool) { roll -= e.w; if (roll <= 0) { bucket = e.bucket; break; } }

  return resolveItemBucket(bucket);
}

function resolveItemBucket(bucket) {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  switch (bucket) {
    case 'common':    return pick(ITEMS.weapons.common);
    case 'rare':      return pick(ITEMS.weapons.rare);
    case 'epic':      return pick(ITEMS.weapons.epic);
    case 'legendary': return pick(ITEMS.weapons.legendary);
    case 'boost':     return pick(ITEMS.boosts);
    case 'wildcard':  return pick(ITEMS.wildcards);
    case 'junk':
    default:          return pick(ITEMS.junk);
  }
}

function getWeaponBonus(equippedId) {
  if (!equippedId) return 0;
  const all = [
    ...ITEMS.weapons.common, ...ITEMS.weapons.rare,
    ...ITEMS.weapons.epic,   ...ITEMS.weapons.legendary,
  ];
  return all.find(w => w.id === equippedId)?.powerBonus || 0;
}

// ─── ANIMATED EMOJI POOL ─────────────────────────────────────────────────────
const ANIMATED_EMOJI_POOL = [
  { id: 'pinkflyinghearts',      emoji: '<a:PinkFlyingHearts:1495641953310740543>',        name: 'Pink Flying Hearts' },
  { id: 'bluebow',               emoji: '<a:BlueBow:1495641954606776341>',                  name: 'Blue Bow' },
  { id: 'loveshot',              emoji: '<a:LoveShot:1495641955902816306>',                 name: 'Love Shot' },
  { id: 'whiteflyingbutterflies',emoji: '<a:WhiteFlyingButterflies:1495641956569583776>',   name: 'White Flying Butterflies' },
  { id: 'blackbutterfly',        emoji: '<a:BlackButterfly:1495641958192775199>',           name: 'Black Butterfly' },
  { id: 'bearangry',             emoji: '<a:BearAngry:1495641959493140552>',                name: 'Bear Angry' },
  { id: 'blackspinheart',        emoji: '<a:BlackSpinHeart:1495641960948437112>',           name: 'Black Spin Heart' },
  { id: 'blueflyinghearts',      emoji: '<a:BlueFlyingHearts:1495641962047606886>',         name: 'Blue Flying Hearts' },
  { id: 'robotdance',            emoji: '<a:RobotDance:1495641963452436560>',               name: 'Robot Dance' },
  { id: 'blackbrokenheart',      emoji: '<a:BlackBrokenHeart:1495641964648075426>',         name: 'Black Broken Heart' },
  { id: 'bluespinheart',         emoji: '<a:BlueSpinHeart:1495641966296301641>',            name: 'Blue Spin Heart' },
  { id: 'whiteflyinghearts',     emoji: '<a:WhiteFlyingHearts:1495641967382761552>',        name: 'White Flying Hearts' },
  { id: 'evil',                  emoji: '<a:Evil:1495641968452042862>',                     name: 'Evil' },
  { id: 'diamond',               emoji: '<a:Diamond:1495641969685168229>',                  name: 'Diamond' },
  { id: 'spaceship',             emoji: '<a:SpaceShip:1495641971409162260>',                name: 'Space Ship' },
  { id: 'ffflyingheartsbr',      emoji: '<a:ffflyingheartsbr:1495641972277248061>',         name: 'Flying Hearts' },
  { id: 'fire',                  emoji: '<a:Fire:1495641973128691803>',                     name: 'Fire' },
  { id: 'bluefire',              emoji: '<a:BlueFire:1495641974319878304>',                 name: 'Blue Fire' },
  { id: 'fogofire',              emoji: '<a:FogoFire:1495641977465733200>',                 name: 'Fogo Fire' },
  { id: 'trioheart',             emoji: '<a:TrioHeart:1495641979944439880>',                name: 'Trio Heart' },
  { id: 'gunsie',                emoji: '<a:Gunsie:1495641980712128643>',                   name: 'Gunsie' },
  { id: 'fuscsifire',            emoji: '<a:FuscsiaFire:1495641981311914077>',              name: 'Fuscia Fire' },
  { id: 'redbrokenheart',        emoji: '<a:RedBrokenHeart:1495641982368878622>',           name: 'Red Broken Heart' },
  { id: 'bluebutterfly',         emoji: '<a:BlueButterfly:1495641983769772062>',            name: 'Blue Butterfly' },
  { id: 'hipaw',                 emoji: '<a:HiPaw:1495641984998707252>',                    name: 'Hi Paw' },
  { id: 'pepebangbang',          emoji: '<a:PepeBangBang:1495641985749487726>',             name: 'Pepe Bang Bang' },
  { id: 'pepedance',             emoji: '<a:PepeDance:1495641986785349642>',                name: 'Pepe Dance' },
  { id: 'pinkflame',             emoji: '<a:PinkFlame:1495641987104247899>',                name: 'Pink Flame' },
  { id: 'palnet',                emoji: '<a:Palnet:1495641988215738561>',                   name: 'Planet' },
  { id: 'purplespinheart',       emoji: '<a:PurpleSpinHeart:1495641989998313593>',          name: 'Purple Spin Heart' },
  { id: 'dogwave',               emoji: '<a:DogWave:1495641990992494622>',                  name: 'Dog Wave' },
  { id: 'whitehearts',           emoji: '<a:WhiteHearts:1495641991889817831>',              name: 'White Hearts' },
  { id: 'twinklingstars',        emoji: '<a:TwinklingStas:1495641992779005993>',            name: 'Twinkling Stars' },
  { id: 'aliendance',            emoji: '<a:AlienDance:1495641993802678362>',               name: 'Alien Dance' },
  { id: 'greenflyinghearts',     emoji: '<a:GreenFlyingHearts:1495641994624503919>',        name: 'Green Flying Hearts' },
  { id: 'wavetata',              emoji: '<a:Wave_Tata:1495641996243763330>',                name: 'Wave Tata' },
  { id: 'animatedweed',          emoji: '<a:Animated_Weed:1495641998236061748>',            name: 'Animated Weed' },
  { id: 'yellowflyinghearts',    emoji: '<a:YellowFlyingHearts:1495641998735179858>',       name: 'Yellow Flying Hearts' },
];

function getDisplayName(player) {
  // Animated emoji wraps both sides: emoji @user emoji
  if (player.extra_emoji) {
    const anim = ANIMATED_EMOJI_POOL.find(e => e.id === player.extra_emoji || e.emoji === player.extra_emoji);
    if (anim) return `${anim.emoji} ${player.username} ${anim.emoji}`;
  }
  // Static emoji tag on left only
  const tag = player.emoji_tag || '';
  return tag ? `${tag} ${player.username}` : player.username;
}

// ─── FIGHT RESOLUTION ────────────────────────────────────────────────────────
function resolveDuel(playerA, playerB, round, immuneIds = new Set()) {
  // Immune players cannot be eliminated
  if (immuneIds.has(playerB.user_id)) return { winner: playerA, loser: null, immune: true };
  if (immuneIds.has(playerA.user_id)) return { winner: playerB, loser: null, immune: true };

  const powerA = Number(playerA.power) + getWeaponBonus(playerA.equipped_weapon_id) + (RIG_FIGHT_BONUS[playerA.rig_level] || 0);
  const powerB = Number(playerB.power) + getWeaponBonus(playerB.equipped_weapon_id) + (RIG_FIGHT_BONUS[playerB.rig_level] || 0);

  const total = powerA + powerB + 20; // +20 base so zero-power players still have a chance
  const rollA = Math.random() * total;

  if (rollA <= powerA) return { winner: playerA, loser: playerB };
  return { winner: playerB, loser: playerA };
}

// ─── PARSE DISCORD TIMESTAMP ─────────────────────────────────────────────────
function parseTimestamp(str) {
  if (!str) return null;
  const match = str.match(/<t:(\d+)(?::[A-Za-z])?>/);
  if (match) return new Date(parseInt(match[1]) * 1000);
  const n = parseInt(str);
  if (!isNaN(n) && n > 1_000_000_000) return new Date(n * 1000);
  return null;
}

// ─── PERMISSION HELPERS ───────────────────────────────────────────────────────
function isHost(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  if (member.guild?.ownerId === member.id) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}

function canCancel(member, hostId) {
  if (!member) return false;
  if (member.id === hostId) return true;
  return isHost(member);
}

// Bounty managers: admins, event hosts, or the designated bounty role
async function isBountyManager(member) {
  if (!member) return false;
  if (isHost(member)) return true;
  const settings = await db.get('SELECT bounty_role_id FROM rs_settings WHERE id = 1').catch(() => null);
  if (settings?.bounty_role_id) {
    return member.roles.cache.some(r => r.id === settings.bounty_role_id);
  }
  return false;
}

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── GAME ENGINE ──────────────────────────────────────────────────────────────
async function runGame(channel, game) {
  const { players, bet, hostId } = game;
  let alive = [...players];
  let round = 1;
  const settings  = await getSettings();
  const staffRole = settings.staff_role_id;
  // Get log channel — falls back to arena channel if not set
  const logChannel = await getLogChannel(channel.client, channel);

  // Era color palette — drives every embed color for the rest of the match
  const eraData      = getEra(game.era || 'default');
  const eraColors     = eraData.colors || {};
  const ERA_PRIMARY   = eraColors.primary   || eraData.color || '#6B2FA0';
  const ERA_DANGER    = eraColors.danger    || eraData.color || '#6B2FA0';
  const ERA_HIGHLIGHT = eraColors.highlight || eraData.color || '#6B2FA0';
  const ERA_GOLD      = eraColors.gold      || eraData.color || '#6B2FA0';

  // Determine rig status per player
  for (const p of alive) {
    // Role-based rig check
    if (!p.rig_level || p.rig_level === 'none') {
      const member = await channel.guild.members.fetch(p.user_id).catch(() => null);
      if (member && staffRole && member.roles.cache.has(staffRole)) {
        p.rig_level = 'petty'; // staff get petty by default in Staff vs Members
      }
      // Check rigged roles table
      if (member) {
        for (const role of member.roles.cache.values()) {
          const riggedRole = await getRiggedRole(role.id).catch(() => null);
          if (riggedRole && riggedRole.rig_level !== 'none') {
            p.rig_level = riggedRole.rig_level;
            break;
          }
        }
      }
    }
  }

  // Rigrandom: pick one secret chosen menace
  let chosenMenace = null;
  if (settings.rigrandom) {
    const unrigged = alive.filter(p => !p.rig_level || p.rig_level === 'none');
    if (unrigged.length) {
      chosenMenace = pick(unrigged);
      chosenMenace.rig_level = 'petty';
    }
  }

  // Check Staff vs Members
  const staffPlayers   = alive.filter(p => p.rig_level && p.rig_level !== 'none');
  const memberPlayers  = alive.filter(p => !p.rig_level || p.rig_level === 'none');
  const hasStaffVsMembers = staffPlayers.length > 0 && memberPlayers.length > 0;

  // Public rig announcement
  if (settings.riggedmode === 'public') {
    const riggedPlayers = alive.filter(p => p.rig_level && p.rig_level !== 'none');
    if (riggedPlayers.length) {
      const lines = riggedPlayers.map(p => {
        const labels = { petty: 'Petty Privilege', favorite: 'Producer\'s Favorite', maincharacter: 'Main Character Pass' };
        return `${getDisplayName(p)} — **${labels[p.rig_level] || p.rig_level}**`;
      });
      await channel.send({ embeds: [
        new EmbedBuilder().setColor(ERA_DANGER)
          .setTitle('<a:MVP24:1495665626688131183> Rigged Mode Enabled. Cry About It.')
          .setDescription(lines.join('\n') + '\n\n*This round has been legally compromised.*')
      ]});
    }
  }

  // Staff vs Members announcement
  const forcedSvM = game.mode === 'staffvsmembers';
  if (hasStaffVsMembers || forcedSvM) {
    await channel.send({ embeds: [
      new EmbedBuilder().setColor(ERA_PRIMARY)
        .setTitle('<:sword:1495666991187361943> STAFF VS MEMBERS')
        .setDescription(
          forcedSvM
            ? `**This is an official Staff vs Members battle.**\nStaff are on one side. Everyone else is on the other.\nThe arena has taken sides. yours is already chosen.`
            : pick(STAFF_VS_MEMBERS_LINES)
        )
    ]}).catch(() => {});
    await sleep(2000);
  }

  // Track stats for XP distribution
  // Load era-specific message pools
  const ERA_FIGHT   = (eraData.fight   && eraData.fight.length)   ? eraData.fight   : FIGHT_LINES;
  const ERA_WIN     = (eraData.win     && eraData.win.length)     ? eraData.win     : WIN_LINES;
  const ERA_ELIM    = (eraData.elim    && eraData.elim.length)    ? eraData.elim    : ELIM_LINES;
  const ERA_CHAOS   = (eraData.chaos   && eraData.chaos.length)   ? eraData.chaos   : CHAOS_EVENTS;
  const ERA_HUMIL   = (eraData.humiliation && eraData.humiliation.length) ? eraData.humiliation : HUMILIATION_LINES;
  const ERA_REVIVE  = (eraData.revive  && eraData.revive.length)  ? eraData.revive  : REVIVE_LINES;
  const ERA_AREVIVE = (eraData.autoRevive && eraData.autoRevive.length)   ? eraData.autoRevive  : AUTO_REVIVE_LINES;

  const elimCounts      = new Map();
  const survived        = new Set();
  const revivedPlayers  = new Set(); // userIds that have been revived (max once per player)
  const postGameMilestones = [];     // XP/backpack announcements collected for post-game

  // Era intro announcement
  if (eraData.intro && eraData.intro.length) {
    await channel.send({ embeds: [
      new EmbedBuilder()
        .setColor(ERA_PRIMARY)
        .setTitle(`✨ ${eraData.name}`)
        .setDescription(`*${pick(eraData.intro)}*`)
    ]}).catch(() => {});
  }
  // deathOrder: array of { userId, username, type: 'normal'|'chaos'|'self' }
  // index 0 = first to die
  const deathOrder = [];
  // killLog: array of { killerId, killerName, victimId, victimName, round }
  const killLog = [];

  // ── Round loop ──────────────────────────────────────────────────────────────
  while (alive.length > 1) {
    await sleep(ROUND_DELAY_MS);

    const events    = [];
    const logEvents  = [];
    const toElim    = new Set();
    const immuneIds = new Set();

    // Calculate immunity for this round
    for (const p of alive) {
      const immunity = RIG_IMMUNITY[p.rig_level || 'none'];
      if (immunity > 0 && round <= immunity) immuneIds.add(p.user_id);
    }

    // Chaos event (20% chance per round, only if enough players)
    if (alive.length > 3 && Math.random() < 0.20) {
      const chaos = pick(ERA_CHAOS);
      let elimCount = Math.min(chaos.count, alive.length - 1);
      const shuffled = [...alive].sort(() => Math.random() - 0.5)
        .filter(p => !immuneIds.has(p.user_id));
      for (let i = 0; i < Math.min(elimCount, shuffled.length); i++) {
        toElim.add(shuffled[i].user_id);
        deathOrder.push({ userId: shuffled[i].user_id, username: shuffled[i].username, type: 'chaos' });
        logEvents.push(`<:purp_caveira50:1495665632845369354> ${chaos.text.replace('@user', `**${getDisplayName(shuffled[i])}**`)}`);
      }
    }

    // Normal duels
    const shuffled = [...alive].sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      if (alive.length - toElim.size <= 1) break;
      const a = shuffled[i];
      const b = shuffled[i + 1];
      if (toElim.has(a.user_id) || toElim.has(b.user_id)) continue;

      const { winner, loser, immune } = resolveDuel(a, b, round, immuneIds);
      if (immune) continue;

      if (loser) {
        toElim.add(loser.user_id);
        deathOrder.push({ userId: loser.user_id, username: loser.username, type: 'normal' });
        killLog.push({ killerId: winner.user_id, killerName: winner.username, victimId: loser.user_id, victimName: loser.username, round });
        elimCounts.set(winner.user_id, (elimCounts.get(winner.user_id) || 0) + 1);

        // Backpack drop event (30% chance)
        if (Math.random() < 0.30) {
          const item  = rollBackpack('basic', winner.rig_level || 'none');
          await addItem(winner.user_id, item).catch(() => {});
          const bLine = pick(BACKPACK_LINES).replace('@user', `**${getDisplayName(winner)}**`);
          events.push(`🎒 ${bLine} → got **${item.name}** ${RARITY_EMOJI[item.rarity || item.type] || ''}`);
        }

        // Avenger check — did the winner avenge someone?
        const avengedKill = killLog.find(k => k.victimId === winner.user_id && k.killerId === loser.user_id);
        // Actually check: did loser previously kill someone, and winner now kills loser?
        const priorVictim = killLog.find(k => k.killerId === loser.user_id);
        if (priorVictim) {
          await logChannel.send(
            `<a:fire1:1495666086534844516> **${getDisplayName(winner)}** avenged **${priorVictim.victimName}** by eliminating **${getDisplayName(loser)}**! <:purp_caveira50:1495665632845369354>`
          ).catch(() => {});
        }

        // Fight line
        const isHumiliation = Math.random() < 0.15;
        const fightLine = isHumiliation
          ? pick(ERA_HUMIL).replace('@user', `**${getDisplayName(loser)}**`)
          : pick(ERA_FIGHT)
              .replace('@attacker', `**${getDisplayName(winner)}**`)
              .replace('@target', `**${getDisplayName(loser)}**`);
        events.push(fightLine);
      }
    }

    // Ensure every eliminated player got a message
    for (const p of players) {
      if (toElim.has(p.user_id) && !events.some(e => e.includes(getDisplayName(p)))) {
        logEvents.push(`<:purp_caveira50:1495665632845369354> **${getDisplayName(p)}** was eliminated.`);
      }
    }
    // ── REVIVE SYSTEM ──────────────────────────────────────────────────────────
    const eliminated = players.filter(p => toElim.has(p.user_id));
    const reviveQueue = []; // players who might get revived

    for (const p of eliminated) {
      const deathInfo = deathOrder.find(d => d.userId === p.user_id);
      const canRevive = !revivedPlayers.has(p.user_id) &&
                        (deathInfo?.type === 'normal' || deathInfo?.type === 'self');

      if (canRevive) {
        // Check if player has revive token in inventory
        const reviveItem = await db.get(
          "SELECT id FROM rs_inventory WHERE user_id = ? AND item_id = 'revive_token' LIMIT 1",
          [p.user_id]
        ).catch(() => null);

        if (reviveItem) {
          // Player-triggered revive — send them a 30s window button
          await db.run('DELETE FROM rs_inventory WHERE id = ?', [reviveItem.id]).catch(() => {});
          revivedPlayers.add(p.user_id);
          toElim.delete(p.user_id);
          deathOrder.splice(deathOrder.findIndex(d => d.userId === p.user_id), 1);
          const reviveLine = pick(ERA_REVIVE).replace('@user', `**${getDisplayName(p)}**`);
          await channel.send(`💀 ${reviveLine} *(used revive token — returned at 50% power)* *(revived)*`).catch(() => {});
          // Reduce power by 50%
          p.power = Math.max(1, Math.floor((p.power || 10) * 0.5));
          await economy.addRegret(p.user_id, 100).catch(() => {});
          continue;
        }

        // Bot auto-revive — 30% chance, only if not already revived
        if (Math.random() < 0.30 && !revivedPlayers.has(p.user_id)) {
          revivedPlayers.add(p.user_id);
          toElim.delete(p.user_id);
          deathOrder.splice(deathOrder.findIndex(d => d.userId === p.user_id), 1);
          const autoLine = pick(ERA_AREVIVE).replace('@user', `**${getDisplayName(p)}**`);
          await channel.send(`${autoLine} *(returned at 50% power)* *(revived)*`).catch(() => {});
          p.power = Math.max(1, Math.floor((p.power || 10) * 0.5));
          await economy.addRegret(p.user_id, 100).catch(() => {});
        }
      }
    }

    alive = alive.filter(p => !toElim.has(p.user_id));
    for (const p of alive) survived.add(p.user_id);

    // Round embed — fight lines go to arena, elimination lines go to log
    const arenaEmbed = new EmbedBuilder()
      .setColor(ERA_PRIMARY)
      .setTitle(`<:purp_caveira50:1495665632845369354> Round ${round}`)
      .setDescription(events.join('\n') || '*The arena holds its breath. Nobody moves. Embarrassing.*')
      .addFields({ name: `<a:purplefire:1479219348353716415> Still Alive (${alive.length})`, value: alive.map(p => revivedPlayers.has(p.user_id) ? getDisplayName(p) + ' *(revived)*' : getDisplayName(p)).join(', ') || 'Nobody.' });

    await channel.send({ embeds: [arenaEmbed] });

    if (logEvents.length > 0) {
      const logEmbed = new EmbedBuilder()
        .setColor(ERA_HIGHLIGHT)
        .setTitle(`📋 Round ${round} — Eliminations`)
        .setDescription(logEvents.join('\n'));
      await logChannel.send({ embeds: [logEmbed] });
    }
    round++;

    if (alive.length === 0) break;
  }

  // ── Game over ────────────────────────────────────────────────────────────────
  const pot    = bet * players.length;
  const tax    = Math.floor(pot * JACKPOT_TAX);
  const payout = pot - tax;

  await jackpot.addToDrawFund(tax);

  // ── Save match to DB ─────────────────────────────────────────────────────────
  const matchResult = await db.run(
    'INSERT INTO rs_matches (channel_id, player_count, pot, winner_id, winner_name) VALUES (?, ?, ?, ?, ?)',
    [channel.id, players.length, pot,
     alive[0]?.user_id || null,
     alive[0]?.username || null]
  );
  const matchId = matchResult.lastInsertRowid;

  // ── Regret on death ──────────────────────────────────────────────────────────
  // deathOrder[i] = userId of i-th person eliminated (0 = first to die)
  const REGRET_NORMAL   = 50;
  const REGRET_CHAOS    = 100;
  const REGRET_FIRST    = 150;  // first to die bonus
  const REGRET_SELF     = 200;
  const REGRET_WINNER   = 25;

  // ── XP & Stats ───────────────────────────────────────────────────────────────
  let finishPos = players.length; // losers count down from total, winner = 1

  // Save kill log to DB
  if (matchId) {
    for (let i = 0; i < killLog.length; i++) {
      const k = killLog[i];
      await db.run(
        'INSERT INTO rs_match_kills (match_id, kill_order, killer_id, killer_name, victim_id, victim_name, kill_type, round_num) VALUES (?,?,?,?,?,?,?,?)',
        [matchId, i+1, k.killerId, k.killerName, k.victimId, k.victimName, k.type || 'normal', k.round || 0]
      ).catch(() => {});
    }
    // Save chaos deaths too (no killer)
    let killOffset = killLog.length;
    for (const d of deathOrder.filter(d => d.type === 'chaos' || d.type === 'self')) {
      if (!killLog.find(k => k.victimId === d.userId)) {
        await db.run(
          'INSERT INTO rs_match_kills (match_id, kill_order, killer_id, killer_name, victim_id, victim_name, kill_type, round_num) VALUES (?,?,?,?,?,?,?,?)',
          [matchId, ++killOffset, null, null, d.userId, d.username, d.type, 0]
        ).catch(() => {});
      }
    }
  }

  // Process losers first (in elimination order — deathOrder[0] = first to die)
  const loserIds = deathOrder.map(d => d.userId);
  for (let i = 0; i < loserIds.length; i++) {
    const p = players.find(pl => pl.user_id === loserIds[i]);
    if (!p) continue;

    const isFirstToDie = i === 0;
    const deathInfo    = deathOrder[i];
    const isChaos      = deathInfo.type === 'chaos';
    const isSelf       = deathInfo.type === 'self';

    let regretPenalty = isSelf ? REGRET_SELF : isChaos ? REGRET_CHAOS : REGRET_NORMAL;
    if (isFirstToDie) regretPenalty += REGRET_FIRST;

    await economy.addRegret(p.user_id, regretPenalty).catch(() => {});

    const xpGain = XP.PARTICIPATE + XP.LOSE + (elimCounts.get(p.user_id) || 0) * XP.ELIMINATE
                 + (survived.has(p.user_id) ? XP.SURVIVE_ROUND : 0);
    const xpResult = await awardXP(p.user_id, p.username, xpGain).catch(() => null);

    await db.run(
      'UPDATE rs_players SET losses = losses + 1, games_played = games_played + 1 WHERE user_id = ?',
      [p.user_id]
    );

    // Save to match_players
    if (matchId) {
      await db.run(
        'INSERT INTO rs_match_players (match_id, user_id, username, finish_pos, death_type, sins_won, regret_added, kills) VALUES (?,?,?,?,?,?,?,?)',
        [matchId, p.user_id, p.username, finishPos, deathInfo.type, 0, regretPenalty, elimCounts.get(p.user_id) || 0]
      ).catch(() => {});
    }
    finishPos--;

    if (xpResult?.backpacksToGrant?.length) {
      for (const type of xpResult.backpacksToGrant) {
        postGameMilestones.push(`🎒 **${getDisplayName(p)}** earned a **${type} backpack**! Use \`!openbackpack ${type}\` to open it.`);
      }
    }
    if (xpResult?.levelUnlocks?.length) {
      for (const msg of xpResult.levelUnlocks) {
        postGameMilestones.push(msg);
      }
    }

    // First to die special callout
    if (isFirstToDie) {
      const FIRST_DEATH_LINES = [
        `<:purp_caveira50:1495665632845369354> **FIRST BLOOD (on themselves)** — **${getDisplayName(p)}** was the first to go. incredible. **+${regretPenalty} regret** <a:hmmdevil:1495665623219306647>`,
        `🤡 **${getDisplayName(p)}** didn't even make it past round 1. first to go. **+${regretPenalty} regret** <:purp_caveira50:1495665632845369354>`,
        `😬 pour one out for **${getDisplayName(p)}** — first eliminated. loudly. **+${regretPenalty} regret**`,
        `<:purp_caveira50:1495665632845369354> **${getDisplayName(p)}** speedran elimination. first to die. not a flex. **+${regretPenalty} regret** <a:hmmdevil:1495665623219306647>`,
        `<a:purplefire:1479219348353716415> **${getDisplayName(p)}** — first out. the arena barely remembered your name. **+${regretPenalty} regret**`,
        `<a:hmmdevil:1495665623219306647> the award for "fastest exit" goes to **${getDisplayName(p)}**. **+${regretPenalty} regret** <:purp_caveira50:1495665632845369354>`,
      ];
      await channel.send(pick(FIRST_DEATH_LINES)).catch(() => {});
    }
  }

  // ── Process winner ────────────────────────────────────────────────────────────
  if (!alive.length) {
    await jackpot.addToDrawFund(payout);
    await channel.send({ embeds: [
      new EmbedBuilder().setColor(ERA_DANGER)
        .setTitle('<:purp_caveira50:1495665632845369354> Everyone died. Even the arena is embarrassed.')
        .setDescription(`**${pot.toLocaleString()} sins** goes to the jackpot. Nobody deserved it anyway.`)
    ]});
  } else {
    // ── Role vs Role win logic ────────────────────────────────────────────────
    const isRvR = game.mode === 'rolevrole' || game.mode === 'rolevs' || game.mode === 'rolevroле';
    if (isRvR && (game.teamA.length || game.teamB.length)) {
      // Determine winning team by who has survivors
      const aliveIds    = new Set(alive.map(p => p.user_id));
      const teamASurv   = (game.teamA || []).filter(p => aliveIds.has(p.user_id));
      const teamBSurv   = (game.teamB || []).filter(p => aliveIds.has(p.user_id));
      const winTeam     = teamASurv.length >= teamBSurv.length ? teamASurv : teamBSurv;
      const winTeamName = winTeam === teamASurv ? `<@&${game.roleAId}>` : `<@&${game.roleBId}>`;
      const share       = winTeam.length > 0 ? Math.floor(payout / winTeam.length) : 0;

      for (const w of winTeam) {
        await economy.getUser(w.user_id, w.username);
        await economy.addFunds(w.user_id, share, 'Rumble Slaughter RvR win');
        await economy.addRegret(w.user_id, REGRET_WINNER).catch(() => {});
      }
      if (share === 0) await jackpot.addToDrawFund(payout);

      await channel.send({ embeds: [
        new EmbedBuilder().setColor(ERA_HIGHLIGHT)
          .setTitle('<a:MVP24:1495665626688131183> ROLE VS ROLE — WINNERS')
          .setDescription(
            `${winTeamName} **wins the match!**\n\n` +
            `<a:SINS:1522338223613804724> **+${share.toLocaleString()} sins** each\n` +
            `Winners: ${winTeam.map(p => getDisplayName(p)).join(', ')}\n\n` +
            `*${players.length} entered. The roles have settled it.*`
          )
      ]});

    } else {
    // ── Normal / Staff vs Members win logic ──────────────────────────────────
    const winner = alive[0];
    const share  = Math.floor(payout / alive.length);

    for (const w of alive) {
      await economy.getUser(w.user_id, w.username);
      await economy.addFunds(w.user_id, share, 'Rumble Slaughter win');
      await economy.addRegret(w.user_id, REGRET_WINNER).catch(() => {});
    }

    const xpGain = XP.PARTICIPATE + XP.WIN + (elimCounts.get(winner.user_id) || 0) * XP.ELIMINATE;
    const xpResult = await awardXP(winner.user_id, winner.username, xpGain).catch(() => null);

    await db.run(
      'UPDATE rs_players SET wins = wins + 1, games_played = games_played + 1 WHERE user_id = ?',
      [winner.user_id]
    );

    if (matchId) {
      await db.run(
        'INSERT INTO rs_match_players (match_id, user_id, username, finish_pos, death_type, sins_won, regret_added, kills) VALUES (?,?,?,?,?,?,?,?)',
        [matchId, winner.user_id, winner.username, 1, 'winner', share, REGRET_WINNER, elimCounts.get(winner.user_id) || 0]
      ).catch(() => {});
    }

    // Chosen menace reveal
    if (chosenMenace && settings.riggedmode === 'public') {
      await channel.send(`🎬 **Plot twist:** ${getDisplayName(chosenMenace)} was the producer's favorite. You're welcome.`);
    }

    // Win streak
    const winnerStats = await db.get('SELECT wins FROM rs_players WHERE user_id = ?', [winner.user_id]);
    const totalWins   = Number(winnerStats?.wins || 1);
    const streakLines = [
      `you've won ${totalWins} time${totalWins !== 1 ? 's' : ''} now. the arena is getting tired of you. <a:hmmdevil:1495665623219306647>`,
      `${totalWins} win${totalWins !== 1 ? 's' : ''}. it's not impressive anymore. it's just expected. <:purp_caveira50:1495665632845369354>`,
      `win number ${totalWins}. the others should be embarrassed. 🤡`,
      `${totalWins} time${totalWins !== 1 ? 's' : ''} you've done this. when does it stop. 😐`,
    ];

    const winLine = pick(ERA_WIN).replace('@winner', `**${getDisplayName(winner)}**`);
    await channel.send(`# <a:MVP24:1495665626688131183> ${getDisplayName(winner).toUpperCase()} IS THE CHAMPION <a:MVP24:1495665626688131183>`).catch(()=>{});
    await channel.send({ embeds: [
      new EmbedBuilder().setColor(ERA_HIGHLIGHT)
        .setTitle('<a:MVP24:1495665626688131183> RUMBLE SLAUGHTER — CHAMPION')
        .setDescription(
          `${winLine}\n\n` +
          `<a:SINS:1522338223613804724> **+${share.toLocaleString()} sins** <a:hmmdevil:1495665623219306647>\n` +
          `<:purp_caveira50:1495665632845369354> **+${REGRET_WINNER} regret** (winning here isn't clean)\n` +
          `<a:moneybag:1479268556687540345> **${tax.toLocaleString()} sins** → jackpot (10% tax)\n\n` +
          `*${pick(streakLines)}*\n\n` +
          `*${players.length} entered. ${players.length - alive.length} got humbled.*`
        )
        .addFields(
          { name: '<a:1stplace:1487504691880263791> Total Wins', value: `${totalWins}`, inline: true },
          { name: '<:sword:1495666991187361943> Kills This Match', value: `${elimCounts.get(winner.user_id) || 0}`, inline: true },
        )
    ]});

    if (xpResult?.backpacksToGrant?.length) {
      for (const type of xpResult.backpacksToGrant) {
        postGameMilestones.push(`🎒 **${getDisplayName(winner)}** earned a **${type} backpack**! Use \`!openbackpack ${type}\` to open it.`);
      }
    }
    if (xpResult?.levelUnlocks?.length) {
      for (const msg of xpResult.levelUnlocks) {
        postGameMilestones.push(msg);
      }
    }
  }

  } // close RvR else / normal win block

  // ── Process bounties ─────────────────────────────────────────────────────────────
  const bounties = await db.all(
    "SELECT * FROM rs_bounties WHERE channel_id = ? AND claimed_at IS NULL",
    [channel.id]
  ).catch(() => []);

  if (bounties.length) {
    const claimedBounties = [];

    // Void kill/avenge bounties where target never joined OR survived
    const playerIds  = new Set(players.map(p => p.user_id));
    const survivorIds = new Set(alive.map(p => p.user_id));
    for (const bounty of bounties) {
      if ((bounty.type === 'kill' || bounty.type === 'avenge') && bounty.target_id) {
        const neverJoined = !playerIds.has(bounty.target_id);
        const survived    = survivorIds.has(bounty.target_id);
        if (neverJoined || survived) {
          const reason = neverJoined ? 'never joined the match' : 'survived the match';
          const voidReason = neverJoined ? 'never joined' : 'survived the match';
          await db.run(
            "UPDATE rs_bounties SET claimed_by = 'void', claimed_name = 'void', claimed_at = NOW(), match_id = ?, void_reason = ? WHERE id = ?",
            [matchId, voidReason, bounty.id]
          ).catch(() => {});
          channel.send(
            `VOID — @${bounty.target_name} ${voidReason}.`
          ).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
        }
      }
    }

    for (const bounty of bounties) {
      let claimerId = null, claimerName = null;

      if (bounty.type === 'kill') {
        // Who killed the target?
        const killEntry = killLog.find(k => k.victimId === bounty.target_id);
        if (killEntry) { claimerId = killEntry.killerId; claimerName = killEntry.killerName; }

      } else if (bounty.type === 'avenge') {
        // Check how the target died first
        const targetDeath = deathOrder.find(d => d.userId === bounty.target_id);
        if (targetDeath && (targetDeath.type === 'self' || targetDeath.type === 'chaos')) {
          // Void — target died by self/chaos, nobody to avenge
          const scReason = targetDeath.type === 'self' ? 'eliminated themselves' : 'eliminated by chaos';
          await db.run(
            "UPDATE rs_bounties SET claimed_by = 'void', claimed_name = 'void', claimed_at = NOW(), match_id = ?, void_reason = ? WHERE id = ?",
            [matchId, scReason, bounty.id]
          ).catch(() => {});
          // Announce void in channel
          const voidMsg = targetDeath.type === 'self'
            ? `VOID — @${bounty.target_name} eliminated themselves. no avenger needed.`
            : `VOID — @${bounty.target_name} was eliminated by chaos. no avenger needed.`;
          channel.send(voidMsg).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
          continue;
        }
        // Normal avenge — who killed the person who killed the target?
        const targetWasKilledBy = killLog.find(k => k.victimId === bounty.target_id);
        if (targetWasKilledBy) {
          const avenger = killLog.find(k => k.victimId === targetWasKilledBy.killerId);
          if (avenger) { claimerId = avenger.killerId; claimerName = avenger.killerName; }
        }

      } else if (bounty.type === 'death') {
        // Who IS the Nth person to die?
        const deathIdx = Number(bounty.death_number) - 1;
        if (deathIdx >= 0 && deathIdx < deathOrder.length) {
          claimerId   = deathOrder[deathIdx].userId;
          claimerName = deathOrder[deathIdx].username;
        }

      } else if (bounty.type === 'winner') {
        // Match winner
        if (alive.length > 0) { claimerId = alive[0].user_id; claimerName = alive[0].username; }
      }

      if (claimerId) {
        await db.run(
          'UPDATE rs_bounties SET claimed_by = ?, claimed_name = ?, claimed_at = NOW(), match_id = ? WHERE id = ?',
          [claimerId, claimerName, matchId, bounty.id]
        ).catch(() => {});
        claimedBounties.push({ bounty, claimerId, claimerName });

        // Avenger announcement in real time already handled below
      }
    }

    if (claimedBounties.length || true) {
      const typeLabels = { kill: '<a:target:1495665634279821485> Kill', avenge: '<a:fire1:1495666086534844516> Avenge', death: '<:purp_caveira50:1495665632845369354> Death', winner: '<a:MVP24:1495665626688131183> Winner' };

      // Separate claimed vs voided
      const claimedOnly   = claimedBounties.filter(({ bounty }) => bounty.claimed_name !== 'void');
      const voidedBounties = await db.all(
        "SELECT * FROM rs_bounties WHERE channel_id = ? AND claimed_name = 'void' AND match_id = ?",
        [channel.id, matchId]
      ).catch(() => []);

      if (!claimedOnly.length && !voidedBounties.length) return;

      const claimedLines = claimedOnly.map(({ bounty, claimerName }) => {
        const n   = bounty.death_number;
        const ord = n ? (n===1?'st':n===2?'nd':n===3?'rd':'th') : null;
        if (bounty.type === 'kill') {
          return `${typeLabels.kill} **@${claimerName}** killed → **@${bounty.target_name}** → prize: **${bounty.prize}**${bounty.payee ? ` (from: ${bounty.payee})` : ''}`;
        } else if (bounty.type === 'avenge') {
          return `${typeLabels.avenge} **@${claimerName}** avenged → **@${bounty.target_name}** → prize: **${bounty.prize}**${bounty.payee ? ` (from: ${bounty.payee})` : ''}`;
        } else if (bounty.type === 'death') {
          return `${typeLabels.death} **@${claimerName}** was the **${n}${ord} death** → prize: **${bounty.prize}**${bounty.payee ? ` (from: ${bounty.payee})` : ''}`;
        } else {
          return `${typeLabels.winner} **@${claimerName}** won the match → prize: **${bounty.prize}**${bounty.payee ? ` (from: ${bounty.payee})` : ''}`;
        }
      });

      const voidLines = voidedBounties.map(b =>
        'VOID — @' + b.target_name + ' (' + (b.void_reason || 'cancelled') + ') → prize: **' + b.prize + '**' + (b.payee ? ' (from: ' + b.payee + ')' : '')
      );

      const embed = new EmbedBuilder().setColor(ERA_GOLD).setTitle('<a:target:1495665634279821485> Bounty Results');
      if (claimedLines.length) embed.addFields({ name: '<:checkmark:1495666088417956002> Winners', value: claimedLines.join('\n'), inline: false });
      if (voidLines.length)   embed.addFields({ name: '<:wrong:1495666083594502174> Voided',  value: voidLines.join('\n'),   inline: false });
      embed.setDescription('*Huge thanks to everyone who added bounties! <a:confetti:1495667283870089307>*\n*Bounty rewards are paid out by the players who donated them.*')
           .setFooter({ text: 'bounties are paid manually by the listed payee' });

      await logChannel.send({ embeds: [embed] });
    }
  }

  // Wipe any remaining unclaimed bounties after match
  await db.run(
    "UPDATE rs_bounties SET claimed_by = 'expired', claimed_name = 'expired', claimed_at = NOW() WHERE channel_id = ? AND claimed_at IS NULL",
    [channel.id]
  ).catch(() => {});

  // XP/backpack milestones — sent standalone now that the Post-Game Regret Report is gone
  if (postGameMilestones.length) {
    await channel.send({ embeds: [
      new EmbedBuilder().setColor(ERA_HIGHLIGHT)
        .setTitle('<a:purplecheck:1478983961450643538> Match Milestones')
        .setDescription(postGameMilestones.join('\n'))
    ]}).catch(() => {});
  }
}

// ─── LAUNCH SIGNUP ────────────────────────────────────────────────────────────
async function launchSignup(channel, bet, hostId, hostName, fireAt, scheduleId, matchConfig = {}) {
  if (activeGames.has(channel.id)) return null;

  const eraKey = (matchConfig.era && matchConfig.era !== 'default') ? matchConfig.era : (pendingEras.get(channel.id) || matchConfig.era || 'default');
  const era    = getEra(eraKey);
  const gameMode      = matchConfig.mode || null;
  const roleRestrict  = matchConfig.roleRestrict || null;
  const roleAId       = matchConfig.roleA || null;
  const roleBId       = matchConfig.roleB || null;

  // Hard wipe ALL bounties for this channel — fresh slate every match
  await db.run('DELETE FROM rs_bounties WHERE channel_id = ?', [channel.id]).catch(() => {});

  const tsUnix = fireAt ? Math.floor(fireAt.getTime() / 1000) : null;
  const lobbyColor = (era.colors && era.colors.primary) || era.color || '#CC0000';
  const embed  = new EmbedBuilder()
    .setColor(lobbyColor)
    .setTitle('<:sword:1495666991187361943> RUMBLE SLAUGHTER: You Thought You Ate <:sword:1495666991187361943>')
    .setDescription(
      `**${hostName}** opened the arena.\n\n` +
      `Welcome to the most disrespectful arena in existence.\n` +
      `Join the fight. Gain power. Collect weapons. Or get eliminated in the most embarrassing way possible.\n\n` +
      `<a:SINS:1522338223613804724> Entry fee: **${bet} sins**\n` +
      (eraKey && eraKey !== 'default' ? `<a:sparkle:1511506717584920696> Era: **${era.name || eraKey}**\n` : '') +
      (gameMode === 'staffvsmembers' ? `<:sword:1495666991187361943> **Mode: Staff vs Members** — teams auto-assigned\n` : '') +
      ((gameMode === 'rolevrole' || gameMode === 'rolevs' || gameMode === 'rolevroле') && roleAId && roleBId ? `<:sword:1495666991187361943> **Mode: Role vs Role** — <@&${roleAId}> vs <@&${roleBId}>\n` : '') +
      (roleRestrict ? `🔒 **Restricted:** <@&${roleRestrict}> members only\n` : '') +
      `${tsUnix ? `<a:RojasClock:1511506715453947904> **Starts:** <t:${tsUnix}:F> (<t:${tsUnix}:R>)` : '<a:purplesparkle:1479210541691175054> Host will start manually with `!rumble`'}\n\n` +
      `*Most of you will lose. Loudly.*`
    )
    .addFields({ name: '<:member:1495666085121491024> Signed Up', value: '**0** players' })
    .setFooter({ text: `Min ${MIN_PLAYERS} players • !rsjoin to enter • /addbounty to add bounties` });

  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rs_join:${channel.id}`)
      .setEmoji('<:sword:1495666991187361943>').setLabel('Join the Arena')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`rs_start:${channel.id}`)
      .setEmoji('<a:fire1:1495666086534844516>').setLabel('Start Game')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rs_viewmembers:${channel.id}`)
      .setEmoji('<a:purplecheck:1478983961450643538>').setLabel('View Members')
      .setStyle(ButtonStyle.Secondary),
  );

  const msg = await channel.send({ embeds: [embed], components: [btn] });

  const game = {
    scheduleId, channelId: channel.id,
    bet, hostId, hostName, fireAt,
    era: eraKey,
    mode: gameMode,
    roleRestrict,
    roleAId,
    roleBId,
    teamA: [], teamB: [],
    players: [], phase: 'signup',
    message: msg, timer: null,
  };

  activeGames.set(channel.id, game);

  if (fireAt) {
    const delay = fireAt.getTime() - Date.now();
    game.timer = setTimeout(() => fireGame(channel), Math.max(delay, 1000));
  }

  return game;
}

// ─── FIRE GAME ────────────────────────────────────────────────────────────────
async function fireGame(channel) {
  const game = activeGames.get(channel.id);
  if (!game || game.phase === 'running') return;

  if (game.players.length < MIN_PLAYERS) {
    for (const p of game.players) {
      await economy.addFunds(p.user_id, game.bet, 'Rumble Slaughter cancelled — not enough players').catch(() => {});
    }
    activeGames.delete(channel.id);
    if (game.scheduleId) await db.run("UPDATE rs_schedules SET status = 'cancelled' WHERE id = ?", [game.scheduleId]).catch(() => {});
    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rs_join:${channel.id}`).setLabel('Arena Closed').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await game.message?.edit({ components: [disabledBtn] }).catch(() => {});
    await channel.send(`<:wrong:1495666083594502174> **Rumble Slaughter** cancelled — only **${game.players.length}** showed up (need ${MIN_PLAYERS}). Everyone refunded. Embarrassing turnout.`);
    return;
  }

  game.phase = 'running';
  if (game.timer) clearTimeout(game.timer);
  if (game.scheduleId) await db.run("UPDATE rs_schedules SET status = 'running' WHERE id = ?", [game.scheduleId]).catch(() => {});

  const disabledBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rs_join:${channel.id}`).setLabel('Arena Closed').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
  await game.message?.edit({ components: [disabledBtn] }).catch(() => {});

  const sealedEra   = getEra(game.era || 'default');
  const sealedColor = (sealedEra.colors && sealedEra.colors.danger) || sealedEra.color || '#8B0000';

  await channel.send({ embeds: [
    new EmbedBuilder().setColor(sealedColor)
      .setTitle('<:sword:1495666991187361943> THE ARENA IS SEALED.')
      .setDescription(
        `**${game.players.length} competitors** have entered.\n\n` +
        game.players.map((p, i) => `**${i + 1}.** ${getDisplayName(p)}`).join('\n') +
        `\n\n<a:SINS:1522338223613804724> Prize Pool: **${(game.bet * game.players.length).toLocaleString()} sins**\n` +
        `<a:moneybag:1479268556687540345> Jackpot Tax: **${Math.floor(game.bet * game.players.length * JACKPOT_TAX).toLocaleString()} sins**\n\n` +
        `*The rest of you… good luck. You'll need it.*`
      )
  ]});

  try {
    await runGame(channel, game);
  } catch (err) {
    console.error('[RumbleSlaughter] Game error:', err.message, err.stack);
    for (const p of game.players) await economy.addFunds(p.user_id, game.bet, 'Rumble Slaughter error refund').catch(() => {});
    await channel.send(`<:wrong:1495666083594502174> The arena collapsed. Everyone refunded. Error: ${err.message}`).catch(() => {});
  } finally {
    activeGames.delete(channel.id);
    if (game.scheduleId) await db.run("UPDATE rs_schedules SET status = 'finished' WHERE id = ?", [game.scheduleId]).catch(() => {});
  }
}

// ─── MODULE EXPORTS ───────────────────────────────────────────────────────────
module.exports = {
  name: 'rumbleslaughter',

  // Called from index.js on ready — restores scheduled games + registers button handler
  async init(client) {
    // Button handler
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      // Start button
      if (interaction.customId.startsWith('rs_start:')) {
        const channelId = interaction.customId.split(':')[1];
        const game = activeGames.get(channelId);
        if (!game || game.phase !== 'signup')
          return interaction.reply({ content: '<:wrong:1495666083594502174> No open game to start.', ephemeral: true });
        const isHost  = interaction.user.id === game.hostId;
        const isAdmin = interaction.member?.permissions?.has('Administrator') ||
                        interaction.member?.roles?.cache?.some(r => r.name === (process.env.ADMIN_ROLE || 'Admin'));
        if (!isHost && !isAdmin)
          return interaction.reply({ content: '<:wrong:1495666083594502174> Only the host or an admin can start the game!', ephemeral: true });
        await interaction.deferUpdate();
        return fireGame(interaction.channel);
      }

      if (interaction.customId.startsWith('rs_viewmembers:')) {
        const channelId = interaction.customId.split(':')[1];
        const game      = activeGames.get(channelId);
        if (!game) {
          return interaction.reply({ content: '<:wrong:1495666083594502174> No open game in this channel right now.', ephemeral: true });
        }
        const list = game.players.length
          ? game.players.map((p, i) => `**${i + 1}.** ${getDisplayName(p)}`).join('\n')
          : 'Nobody yet.';
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor('#6B2FA0')
            .setTitle('<a:purplecheck:1478983961450643538> Signed up')
            .setDescription(list)],
          ephemeral: true,
        });
      }

      if (!interaction.customId.startsWith('rs_join:')) return;

      const channelId = interaction.customId.split(':')[1];
      const game      = activeGames.get(channelId);

      if (!game || game.phase !== 'signup') {
        return interaction.reply({ content: '<:wrong:1495666083594502174> No open game in this channel right now.', ephemeral: true });
      }
      if (game.players.find(p => p.user_id === interaction.user.id)) {
        return interaction.reply({ content: '<a:Warning:1497476844860215366> You\'re already in! Sit down.', ephemeral: true });
      }

      await interaction.deferUpdate();
      await economy.getUser(interaction.user.id, interaction.user.username);
      const bal = await economy.getBalance(interaction.user.id);
      if (bal < game.bet) {
        return interaction.followUp({ content: `<:wrong:1495666083594502174> You need **${game.bet} sins** to enter. Go earn some first.`, ephemeral: true });
      }

      await economy.removeFunds(interaction.user.id, game.bet, 'Rumble Slaughter entry');
      const player = await ensureRSUser(interaction.user.id, interaction.user.username);
      game.players.push(player);

      if (game.scheduleId) {
        await db.run(
          'INSERT INTO rs_schedule_players (schedule_id, user_id, username) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
          [game.scheduleId, interaction.user.id, interaction.user.username]
        ).catch(() => {});
      }

      // Update embed
      if (game.message?.embeds?.[0]) {
        const updated = EmbedBuilder.from(game.message.embeds[0]).spliceFields(0, 1, {
          name: '<a:purplecheck:1478983961450643538> Signed Up',
          value: `**${game.players.length}** player${game.players.length !== 1 ? 's' : ''}`,
        });
        await game.message.edit({ embeds: [updated] }).catch(() => {});
      }
      await interaction.followUp({ content: `<a:SINS:1522338223613804724> **${interaction.user.username}** entered the arena. (${game.players.length} signed up)`, ephemeral: true });
    });

    // Handle animated emoji picker select menu
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      if (!interaction.customId.startsWith('rs_pickemoji:')) return;

      const [, userId] = interaction.customId.split(':');
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: '<:wrong:1495666083594502174> This picker is not for you.', ephemeral: true });
      }

      await interaction.deferUpdate().catch(() => {});
      const chosenId = interaction.values[0];
      const emoji    = ANIMATED_EMOJI_POOL.find(e => e.id === chosenId);
      if (!emoji) return interaction.followUp({ content: '<:wrong:1495666083594502174> Emoji not found.', ephemeral: true });

      await db.run('UPDATE rs_players SET extra_emoji = ? WHERE user_id = ?', [chosenId, userId]);

      return interaction.followUp({
        content:
          `<:checkmark:1495666088417956002> Animated emoji set to **${emoji.name}**!

` +
          `Your arena name now looks like:
` +
          `${emoji.emoji} **${interaction.user.username}** ${emoji.emoji}

` +
          `*This shows in every Rumble Slaughter battle. <a:hmmdevil:1495665623219306647>*`,
        ephemeral: true,
      });
    });

    // Handle era picker select menu
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      if (!interaction.customId.startsWith('rs_era:')) return;

      const [, userId, channelId] = interaction.customId.split(':');
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: '<:wrong:1495666083594502174> This menu is not for you.', ephemeral: true });
      }

      await interaction.deferUpdate().catch(() => {});
      const chosenEra = interaction.values[0];
      const eraData   = getEra(chosenEra);

      // Store the selected era for this channel (host can then start game)
      pendingEras.set(channelId, chosenEra);

      return interaction.followUp({
        content: `<:checkmark:1495666088417956002> Era set to **${eraData.name}**!\nJust run \`!rumbleslaughter <bet>\` — the era will be applied automatically.`,
        ephemeral: true,
      });
    });

    // Handle weapon equip select menu
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      if (!interaction.customId.startsWith('rs_equip:')) return;

      const [, userId] = interaction.customId.split(':');
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: '<:wrong:1495666083594502174> This menu is not for you.', ephemeral: true });
      }

      await interaction.deferUpdate().catch(() => {});
      const itemId = interaction.values[0];
      const inv    = await getInventory(userId);
      const item   = inv.find(i => i.item_id === itemId);
      if (!item) return interaction.followUp({ content: '<:wrong:1495666083594502174> Item not found.', ephemeral: true });

      await db.run('UPDATE rs_players SET equipped_weapon_id = ? WHERE user_id = ?', [itemId, userId]);

      return interaction.followUp({
        content: `<:checkmark:1495666088417956002> Equipped **${item.item_name}** (+${item.power_bonus} power). <:sword:1495666991187361943>
It will affect your duels in the next Rumble Slaughter match.`,
        ephemeral: true,
      });
    });

    // Restore pending schedules from DB
    const pending = await db.all("SELECT * FROM rs_schedules WHERE status = 'pending'").catch(() => []);
    for (const row of pending) {
      try {
        const channel = await client.channels.fetch(row.channel_id);
        if (!channel?.isTextBased()) continue;
        const savedPlayers = await db.all('SELECT * FROM rs_players WHERE user_id IN (SELECT user_id FROM rs_schedule_players WHERE schedule_id = ?)', [row.id]);
        const fireAt = row.fire_at ? new Date(row.fire_at) : null;

        const msg = await channel.send({ embeds: [
          new EmbedBuilder().setColor('#6B2FA0')
            .setTitle('♻️ Rumble Slaughter — Restored')
            .setDescription(`Bot restarted but the arena is still open.\n\n<a:SINS:1522338223613804724> Entry: **${row.bet} sins** — use \`!rsjoin\` or click Join.\n${fireAt ? `<a:RojasClock:1511506715453947904> Starts: <t:${Math.floor(fireAt.getTime()/1000)}:F>` : 'Use `!startgame` to fire.'}`)
            .addFields({ name: '<a:purplecheck:1478983961450643538> Already In', value: savedPlayers.length ? savedPlayers.map(p => getDisplayName(p)).join(', ') : 'Nobody yet' })
        ], components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rs_join:${row.channel_id}`).setEmoji('<:sword:1495666991187361943>').setLabel('Join the Arena').setStyle(ButtonStyle.Danger)
          )
        ]});

        const game = {
          scheduleId: row.id, channelId: row.channel_id,
          bet: row.bet, hostId: row.host_id, hostName: row.host_name,
          fireAt, players: savedPlayers, phase: 'signup',
          message: msg, timer: null,
        };
        activeGames.set(row.channel_id, game);
        if (fireAt) {
          const delay = fireAt.getTime() - Date.now();
          game.timer = setTimeout(() => fireGame(channel), Math.max(delay, 1000));
        }
      } catch (err) {
        console.warn('[RumbleSlaughter] Could not restore schedule:', err.message);
      }
    }
  },

  // ── Slash handler ─────────────────────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    const fakeMsg = {
      author:  interaction.user,
      member:  interaction.member,
      channel: interaction.channel,
      guild:   interaction.guild,
      reply:   async (data) => {
        if (interaction.replied || interaction.deferred)
          return interaction.followUp(typeof data === 'string' ? { content: data } : data);
        return interaction.reply(typeof data === 'string' ? { content: data, ephemeral: true } : { ...data, ephemeral: true });
      },
    };
    if (!interaction.replied && !interaction.deferred) await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const opts = interaction.options;
    if (commandName === 'rumbleslaughter') {
      const bet          = opts.getInteger('bet') || 50;
      const ts           = opts.getString('timestamp') || '';
      const eraOpt       = opts.getString('era') || '';
      const modeOpt      = opts.getString('mode') || '';
      const roleRestrict = opts.getRole('rolerestrict');
      const roleA        = opts.getRole('rolea');
      const roleB        = opts.getRole('roleb');

      const extraArgs = [
        ts,
        eraOpt   ? `era:${eraOpt}` : '',
        modeOpt  ? `--mode ${modeOpt}` : '',
        roleRestrict ? `role:<@&${roleRestrict.id}>` : '',
        (roleA && roleB) ? `<@&${roleA.id}> vs <@&${roleB.id}>` : '',
      ].filter(Boolean);

      return this.handleCommand(fakeMsg, [String(bet), ...extraArgs], 'rumbleslaughter');
    }
    if (commandName === 'rsprofile') {
      const target = opts.getUser('user') || interaction.user;
      return this.showProfile(interaction.channel, target, interaction);
    }
    if (commandName === 'rsleaderboard')   return this.showLeaderboard(fakeMsg);
    if (commandName === 'openbackpack')    return this.openBackpackCmd(interaction);
    if (commandName === 'rsinventory')     return this.showInventory(interaction);
    if (commandName === 'rsjoin')          return this.handleCommand(fakeMsg, [], 'rsjoin');
    if (commandName === 'addbounty') {
      if (!await isBountyManager(interaction.member)) return interaction.editReply('<:wrong:1495666083594502174> You need the bounty manager role, Event Host, or Admin to add bounties.');
      const bType     = opts.getString('type');
      const bPrize    = opts.getString('prize');
      const bPayee    = opts.getString('payee');
      const bTarget   = opts.getUser('target');
      const bDeathNum = parseInt(opts.getString('deathnumber') || '0') || null;

      // Validate required fields per type
      if ((bType === 'kill' || bType === 'avenge') && !bTarget)
        return interaction.editReply('<:wrong:1495666083594502174> Kill and Avenge bounties require a **target** player.');
      if ((bType === 'kill' || bType === 'avenge') && !bPayee)
        return interaction.editReply('<:wrong:1495666083594502174> Kill and Avenge bounties require a **payee**.');
      if (bType === 'death' && !bDeathNum)
        return interaction.editReply('<:wrong:1495666083594502174> Death bounties require a **death number** (e.g. 5).');
      if (bType === 'death' && !bPayee)
        return interaction.editReply('<:wrong:1495666083594502174> Death bounties require a **payee**.');
      if (bType === 'winner' && !bPayee)
        return interaction.editReply('<:wrong:1495666083594502174> Winner bounties require a **payee**.');

      let targetId = null, targetName = null;
      if (bTarget) { targetId = bTarget.id; targetName = bTarget.username; }

      await db.run(
        'INSERT INTO rs_bounties (channel_id, type, target_id, target_name, death_number, prize, payee) VALUES (?,?,?,?,?,?,?)',
        [interaction.channel.id, bType, targetId, targetName, bDeathNum, bPrize, bPayee]
      );

      const typeLabels = { kill: '<a:target:1495665634279821485> Kill', avenge: '<a:fire1:1495666086534844516> Avenge', death: '<:purp_caveira50:1495665632845369354> Death', winner: '<a:MVP24:1495665626688131183> Winner' };
      const n = bDeathNum;
      const ord = n ? (n===1?'st':n===2?'nd':n===3?'rd':'th') : null;
      const targetStr = targetName ? `@${targetName}` : n ? `${n}${ord} death` : 'match winner';

      return interaction.editReply({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('<a:target:1495665634279821485> Bounty Added!')
          .setDescription(
            bType === 'kill'   ? `<a:target:1495665634279821485> Kill **@${targetName}** → prize: **${bPrize}** (from: ${bPayee})` :
            bType === 'avenge' ? `<a:fire1:1495666086534844516> Avenge **@${targetName}** → prize: **${bPrize}** (from: ${bPayee})` :
            bType === 'death'  ? `<:purp_caveira50:1495665632845369354> Cause the **${n}${ord} death** → prize: **${bPrize}** (from: ${bPayee})` :
                                 `<a:MVP24:1495665626688131183> Win the match → prize: **${bPrize}** (from: ${bPayee})`
          )
          .setFooter({ text: 'use /bounties to see all active bounties • resets on new match' })
      ]});
    }
    if (commandName === 'clearbounties') {
      if (!await isBountyManager(interaction.member)) return interaction.editReply('<:wrong:1495666083594502174> You need the bounty manager role to clear bounties.');
      await db.run("DELETE FROM rs_bounties WHERE channel_id = ? AND claimed_at IS NULL", [interaction.channel.id]);
      return interaction.editReply('<:checkmark:1495666088417956002> All unclaimed bounties cleared for this channel.');
    }
    if (commandName === 'bounties') {
      const fakeMsg2 = { channel: interaction.channel, reply: async (data) => interaction.editReply(data) };
      return this.showBounties(fakeMsg2);
    }
    if (commandName === 'setbountyrole') {
      if (!isHost(interaction.member)) return interaction.editReply('<:wrong:1495666083594502174> Admin only.');
      const role = opts.getRole('role');
      await db.run('UPDATE rs_settings SET bounty_role_id = ? WHERE id = 1', [role.id]);
      return interaction.editReply(`<:checkmark:1495666088417956002> Bounty manager role set to **${role.name}**. Members with this role can add, remove, and modify bounty prizes.`);
    }
    if (commandName === 'modifybounty') {
      if (!await isBountyManager(interaction.member)) return interaction.editReply('<:wrong:1495666083594502174> You need the bounty manager role.');
      const bountyId = opts.getInteger('id');
      const newPrize = opts.getString('prize');
      const bounty = await db.get('SELECT * FROM rs_bounties WHERE id = ? AND channel_id = ? AND claimed_at IS NULL', [bountyId, interaction.channel.id]);
      if (!bounty) return interaction.editReply('<:wrong:1495666083594502174> Bounty not found or already claimed.');
      await db.run('UPDATE rs_bounties SET prize = ? WHERE id = ?', [newPrize, bountyId]);
      return interaction.editReply(`<:checkmark:1495666088417956002> Bounty #${bountyId} prize updated to **${newPrize}**.`);
    }
    if (commandName === 'setera')         return this.setEraDropdown(interaction);
    if (commandName === 'rsmatchstats')    return this.handleCommand(fakeMsg, [], 'rsmatchstats');
    if (commandName === 'rsstats')         return this.handleCommand(fakeMsg, [opts.getUser('user')?.id ? `<@${opts.getUser('user').id}>` : ''], 'rsstats');
    if (commandName === 'rshalloffame')    return this.handleCommand(fakeMsg, [], 'rshalloffame');
    if (commandName === 'startgame')       return this.handleCommand(fakeMsg, [], 'startgame');
    if (commandName === 'cancelevent')     return this.handleCommand(fakeMsg, [], 'cancelevent');
    if (commandName === 'rig')             return this.handleCommand(fakeMsg, [`<@${opts.getUser('user').id}>`, opts.getString('level')], 'rig');
    if (commandName === 'unrig')           return this.handleCommand(fakeMsg, [`<@${opts.getUser('user').id}>`], 'unrig');
    if (commandName === 'rigrole')         return this.handleCommand(fakeMsg, [`<@&${opts.getRole('role').id}>`, opts.getString('level')], 'rigrole');
    if (commandName === 'rigrandom')       return this.handleCommand(fakeMsg, [opts.getString('state')], 'rigrandom');
    if (commandName === 'riggedmode')      return this.handleCommand(fakeMsg, [opts.getString('mode')], 'riggedmode');
    if (commandName === 'staffrole')       return this.handleCommand(fakeMsg, [`<@&${opts.getRole('role').id}>`], 'staffrole');
    if (commandName === 'givebackpack') {
      const targetUser = opts.getUser('user');
      const bpType     = opts.getString('type');
      const bpAmount   = opts.getInteger('amount') || 1;
      if (!targetUser) return interaction.editReply('<:wrong:1495666083594502174> You must tag a user.');
      if (!['basic','royal','cursed'].includes(bpType)) return interaction.editReply('<:wrong:1495666083594502174> Type must be basic, royal, or cursed.');
      await ensureRSUser(targetUser.id, targetUser.username);
      const col = `backpacks_${bpType}`;
      await db.run(`UPDATE rs_players SET ${col} = ${col} + ? WHERE user_id = ?`, [bpAmount, targetUser.id]);
      return interaction.editReply(`<:checkmark:1495666088417956002> Gave **${bpAmount} ${bpType}** backpack(s) to **${targetUser.username}**.`);
    }
    if (commandName === 'setemoji')        return this.setEmojiCmd(interaction, opts.getString('emoji'));
    if (commandName === 'addemoji')        return this.addEmojiCmd(interaction, opts.getString('emoji'));
    if (commandName === 'pickemoji')       return this.pickAnimatedEmojiSlash(interaction);
  },

  // ── Prefix handler ─────────────────────────────────────────────────────────────
  async handleCommand(message, args, command) {
    switch (command) {
      case 'rumbleslaughter': case 'rs':  return this.startGame(message, args);
      case 'rsjoin': case 'rsenter':      return this.joinGame(message);
      case 'rsprofile': case 'rsp':       return this.showProfile(message.channel, args[0] ? message.mentions?.users?.first() || null : message.author, message);
      case 'rsleaderboard': case 'rslb':  return this.showLeaderboard(message);
      case 'openbackpack': case 'rsbag':  return this.openBackpackMsg(message, args[0]);
      case 'rsinventory': case 'rsinv':   return this.showInventoryMsg(message);
      case 'startgame':
      case 'rumble':                     return this.manualFire(message);
      case 'cancelevent':                 return this.cancelGame(message);
      case 'rschedule':                   return this.showSchedule(message);
      case 'addbounty':                    return this.addBounty(message, args);
      case 'clearbounties':                return this.clearBounties(message);
      case 'bounties': case 'rsbounties':  return this.showBounties(message);
      case 'eras': case 'rseras':          return this.listErasCmd(message);
      case 'rsmatchstats': case 'rsrecap': return this.matchStats(message);
      case 'rsstats':                      return this.playerStats(message, args);
      case 'rshalloffame': case 'rshof':   return this.hallOfFame(message);
      case 'rig':                         return this.rigPlayer(message, args);
      case 'unrig':                       return this.unrigPlayer(message, args);
      case 'rigrole':                     return this.rigRole(message, args);
      case 'rigrandom':                   return this.setRigRandom(message, args);
      case 'riggedmode':                  return this.setRiggedMode(message, args);
      case 'staffrole':                   return this.setStaffRole(message, args);
      case 'givebackpack':                return this.giveBackpack(message, args);
      case 'setemoji':                    return this.setEmojiMsg(message, args[0]);
      case 'setlogchannel':               return this.setLogChannel(message, args);
      case 'addemoji':                    return this.addEmojiMsg(message, args[0]);
      case 'pickemoji': case 'animemoji':  return this.pickAnimatedEmoji(message);
    }
  },

  // ── Set Log Channel ──────────────────────────────────────────────────────────
  async setLogChannel(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Staff only.');
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('<:wrong:1495666083594502174> Mention a channel. Example: `!setlogchannel #rs-log`');
    await db.run('UPDATE rs_settings SET log_channel_id = $1 WHERE id = 1', [ch.id]);
    return message.reply(`<:checkmark:1495666088417956002> Log channel set to <#${ch.id}>. Kill/elim/avenge messages will go there.`);
  },

  // ── Start game ────────────────────────────────────────────────────────────────
  async startGame(message, args) {
    if (!isHost(message.member)) return message.reply(`<:wrong:1495666083594502174> You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start Rumble Slaughter.`);
    if (activeGames.has(message.channel.id)) return message.reply('<:wrong:1495666083594502174> There\'s already a game open here. Use `!cancelevent` first.');

    const bet    = parseInt(args[0]) || 50;
    if (bet < 10) return message.reply('<:wrong:1495666083594502174> Minimum bet is 10 sins.');

    const rawArgs = args.slice(1).join(' ');

    // Parse era
    const eraMatch = rawArgs.match(/(?:--era\s+|era:)(['"]?)([^'"<]+?)\1(?:\s+--|$)/i) || rawArgs.match(/(?:--era\s+|era:)(.+?)(?:\s+--|$)/i);
    const eraInput = eraMatch ? eraMatch[2]?.trim() || eraMatch[1]?.trim() : null;
    const resolvedEra = eraInput ? resolveEra(eraInput) : null;
    if (eraInput && !resolvedEra) return message.reply(`<:wrong:1495666083594502174> Unknown era **${eraInput}**. Use \`!eras\` to see available eras.`);
    // Fall back to /setera selection for this channel, then default
    const eraKey = resolvedEra || pendingEras.get(message.channel.id) || 'default';
    if (pendingEras.has(message.channel.id)) pendingEras.delete(message.channel.id); // consume it

    // Parse mode: --mode staffvsmembers | --mode rolevroле
    const modeMatch = rawArgs.match(/--mode\s+(\S+)/i);
    const mode = modeMatch ? modeMatch[1].toLowerCase() : null;
    const validModes = ['staffvsmembers', 'rolevroле', 'rolevrole', 'rolevs', null];

    // Parse role-restricted: role:@RoleName or --role @RoleName
    const roleRestrictMatch = rawArgs.match(/(?:^|\s)role:<@&(\d+)>/i);
    const roleRestrictId = roleRestrictMatch ? roleRestrictMatch[1] : null;

    // Parse role vs role: @RoleA vs @RoleB
    const rvrMatch = rawArgs.match(/<@&(\d+)>\s+vs\s+<@&(\d+)>/i);
    const roleAId = rvrMatch ? rvrMatch[1] : null;
    const roleBId = rvrMatch ? rvrMatch[2] : null;

    // Validate role vs role mode
    if ((mode === 'rolevroле' || mode === 'rolevrole' || mode === 'rolevs') && (!roleAId || !roleBId)) {
      return message.reply('<:wrong:1495666083594502174> Role vs Role requires two roles: `!rumbleslaughter 50 --mode rolevs @TeamA vs @TeamB`');
    }

    // Parse timestamp (strip all other args first)
    let tsRaw = rawArgs
      .replace(/(?:--era|era:)\s*['"]?[^'"<\s][^'"<]*/gi, '')
      .replace(/--mode\s+\S+/gi, '')
      .replace(/(?:^|\s)role:<@&\d+>/gi, '')
      .replace(/<@&\d+>\s+vs\s+<@&\d+>/gi, '')
      .trim();
    const fireAt = parseTimestamp(tsRaw);
    if (tsRaw && !fireAt) return message.reply('<:wrong:1495666083594502174> Invalid timestamp! Use a Discord timestamp like `<t:1776177600:F>`.');
    if (fireAt && fireAt.getTime() <= Date.now()) return message.reply('<:wrong:1495666083594502174> That timestamp is in the past!');

    // Build match config
    const matchConfig = {
      era: eraKey,
      mode: mode,
      roleRestrict: roleRestrictId,
      roleA: roleAId,
      roleB: roleBId,
    };

    // Save schedule
    const result = await db.run(
      `INSERT INTO rs_schedules (channel_id, bet, fire_at, host_id, host_name, status)
       VALUES (?, ?, ?, ?, ?, 'pending')
       ON CONFLICT (channel_id) DO UPDATE SET bet = EXCLUDED.bet, fire_at = EXCLUDED.fire_at, host_id = EXCLUDED.host_id, host_name = EXCLUDED.host_name, status = 'pending'`,
      [message.channel.id, bet, fireAt?.toISOString() || null, message.author.id, message.author.username]
    );
    const scheduleId = (await db.get('SELECT id FROM rs_schedules WHERE channel_id = ?', [message.channel.id]))?.id;

    await launchSignup(message.channel, bet, message.author.id, message.author.username, fireAt, scheduleId, matchConfig);
    if (fireAt) {
      await message.reply(`<:checkmark:1495666088417956002> **Rumble Slaughter** scheduled! Signups open now — arena fires at <t:${Math.floor(fireAt.getTime()/1000)}:F>.`);
    } else {
      await message.reply(`<:checkmark:1495666088417956002> **Rumble Slaughter** signup open! Use \`!startgame\` when ready to fire.`);
    }
  },

  // ── Join game ──────────────────────────────────────────────────────────────────
  async joinGame(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('<:wrong:1495666083594502174> No open game in this channel. A host can start one with `!rumbleslaughter <bet>`.');
    if (game.phase !== 'signup') return message.reply('<:wrong:1495666083594502174> Signups are closed — the arena is already running!');
    if (game.players.find(p => p.user_id === message.author.id)) return message.reply('<a:Warning:1497476844860215366> You\'re already in!');

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);

    // Role-restricted match check
    if (game.roleRestrict) {
      const hasRole = member?.roles.cache.has(game.roleRestrict);
      if (!hasRole) {
        return message.channel.send(
          `<:wrong:1495666083594502174> **${message.author.username}** tried to join but doesn\'t have the required role. 😬 sit this one out.`
        );
      }
    }

    // Role vs Role check
    const isRvR = game.mode === 'rolevrole' || game.mode === 'rolevs' || game.mode === 'rolevroле';
    let assignedTeam = null;
    if (isRvR) {
      const hasRoleA = member?.roles.cache.has(game.roleAId);
      const hasRoleB = member?.roles.cache.has(game.roleBId);
      if (!hasRoleA && !hasRoleB) {
        return message.channel.send(
          `<:wrong:1495666083594502174> **${message.author.username}** tried to join the Role vs Role but is on neither team. 😬 not your battle.`
        );
      }
      // First role listed wins the tiebreaker
      const roleOrder = [...(member?.roles.cache.values() || [])];
      const firstMatch = roleOrder.find(r => r.id === game.roleAId || r.id === game.roleBId);
      assignedTeam = firstMatch?.id === game.roleAId ? 'A' : 'B';
    }

    await economy.getUser(message.author.id, message.author.username);
    const bal = await economy.getBalance(message.author.id);
    if (bal < game.bet) return message.reply(`<:wrong:1495666083594502174> You need **${game.bet} sins** to enter. Check \`!balance\`.`);

    await economy.removeFunds(message.author.id, game.bet, 'Rumble Slaughter entry');
    const player = await ensureRSUser(message.author.id, message.author.username);
    if (assignedTeam === 'A') game.teamA.push(player);
    if (assignedTeam === 'B') game.teamB.push(player);
    game.players.push(player);

    if (game.scheduleId) {
      await db.run('INSERT INTO rs_schedule_players (schedule_id, user_id, username) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
        [game.scheduleId, message.author.id, message.author.username]).catch(() => {});
    }

    if (game.message?.embeds?.[0]) {
      const updated = EmbedBuilder.from(game.message.embeds[0]).spliceFields(0, 1, {
        name: '<a:purplecheck:1478983961450643538> Signed Up', value: `**${game.players.length}** player${game.players.length !== 1 ? 's' : ''}`,
      });
      await game.message.edit({ embeds: [updated] }).catch(() => {});
    }
    const joinMsg = await message.reply(`<a:SINS:1522338223613804724> **${message.author.username}** entered the arena! (${game.players.length} signed up)`);
    setTimeout(() => joinMsg.delete().catch(() => {}), 5000);
    return joinMsg;
  },

  // ── Manual fire ───────────────────────────────────────────────────────────────
  async manualFire(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('<:wrong:1495666083594502174> No game scheduled in this channel.');
    if (!canCancel(message.member, game.hostId)) return message.reply('<:wrong:1495666083594502174> Only the host or an admin can start early.');
    if (game.phase === 'running') return message.reply('<:wrong:1495666083594502174> Already running!');
    if (game.timer) clearTimeout(game.timer);
    await message.reply('<:sword:1495666991187361943> Sealing the arena now...');
    fireGame(message.channel);
  },

  // ── Cancel ────────────────────────────────────────────────────────────────────
  async cancelGame(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('<:wrong:1495666083594502174> No active Rumble Slaughter in this channel.');
    if (!canCancel(message.member, game.hostId)) return message.reply('<:wrong:1495666083594502174> Only the host, admins, or server Owner can cancel.');
    if (game.phase === 'running') return message.reply('<:wrong:1495666083594502174> The game is already running. Too late.');
    if (game.timer) clearTimeout(game.timer);
    for (const p of game.players) await economy.addFunds(p.user_id, game.bet, 'Rumble Slaughter cancelled').catch(() => {});
    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rs_join:${message.channel.id}`).setLabel('Cancelled').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await game.message?.edit({ components: [btn] }).catch(() => {});
    activeGames.delete(message.channel.id);
    if (game.scheduleId) await db.run("UPDATE rs_schedules SET status = 'cancelled' WHERE id = ?", [game.scheduleId]).catch(() => {});
    return message.reply(`<:checkmark:1495666088417956002> Rumble Slaughter cancelled. **${game.players.length}** player(s) refunded.`);
  },

  // ── Profile ───────────────────────────────────────────────────────────────────
  async showProfile(channel, user, messageOrInteraction) {
    if (!user) user = messageOrInteraction.author || messageOrInteraction.user;
    const player = await ensureRSUser(user.id, user.username);
    const inv    = await getInventory(user.id);
    const equipped = inv.find(i => i.item_id === player.equipped_weapon_id);

    const totalPower = Number(player.power) + getWeaponBonus(player.equipped_weapon_id) + (RIG_FIGHT_BONUS[player.rig_level] || 0);

    const embed = new EmbedBuilder()
      .setColor('#6B2FA0')
      .setTitle(`${getDisplayName(player)} — Rumble Slaughter Profile`)
      .setThumbnail(user.displayAvatarURL?.() || null)
      .addFields(
        { name: '<:sword:1495666991187361943> Power',       value: `**${totalPower}** (base ${player.power} + weapon ${getWeaponBonus(player.equipped_weapon_id)} + rig ${RIG_FIGHT_BONUS[player.rig_level] || 0})`, inline: false },
        { name: '📈 Level / XP',  value: `Level **${player.level}** — **${player.xp}/${xpNeededForLevel(Number(player.level))} XP**`, inline: true },
        { name: '<a:1stplace:1487504691880263791> Wins',        value: `**${player.wins}**`,         inline: true },
        { name: '<:purp_caveira50:1495665632845369354> Losses',      value: `**${player.losses}**`,       inline: true },
        { name: '🎒 Backpacks',   value: `Basic **${player.backpacks_basic}** | Royal **${player.backpacks_royal}** | Cursed **${player.backpacks_cursed}**`, inline: false },
        { name: '<:sword:1495666991187361943> Equipped',    value: equipped ? `${equipped.item_name} (+${equipped.power_bonus} power)` : 'Nothing. embarrassing.', inline: true },
        { name: '<a:MVP24:1495665626688131183> Rig Level',   value: player.rig_level || 'none', inline: true },
        { name: '🎨 Emoji',       value: `${player.emoji_tag || '—'} ${player.extra_emoji || ''}`.trim() || '—', inline: true },
      )
      .setFooter({ text: `Total XP earned: ${player.total_xp} • Games played: ${player.games_played}` });

    const reply = messageOrInteraction.reply?.bind(messageOrInteraction) || (data => channel.send(data));
    return reply({ embeds: [embed] });
  },

  // ── Leaderboard ───────────────────────────────────────────────────────────────
  async showLeaderboard(message) {
    const top = await db.all('SELECT * FROM rs_players ORDER BY total_xp DESC LIMIT 10');
    if (!top.length) return message.reply('<:wrong:1495666083594502174> No players yet!');
    const medals = ['🥇', '🥈', '🥉'];
    const rows   = top.map((p, i) =>
      `${medals[i] || `**${i+1}.**`} ${getDisplayName(p)} — **${p.total_xp} XP** | Lv **${p.level}** | **${p.wins}W ${p.losses}L**`
    ).join('\n');
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#FFD700')
        .setTitle('<a:MVP24:1495665626688131183> Rumble Slaughter — XP Leaderboard')
        .setDescription(rows)
        .setFooter({ text: 'Top 10 by total XP earned' })
    ]});
  },

  // ── Open backpack (ephemeral slash) ──────────────────────────────────────────
  async openBackpackCmd(interaction) {
    const type   = interaction.options.getString('type');
    const player = await ensureRSUser(interaction.user.id, interaction.user.username);
    const col    = `backpacks_${type}`;
    if (!player[col] || Number(player[col]) <= 0) {
      return interaction.editReply(`<:wrong:1495666083594502174> You don't have any **${type}** backpacks! Play more games to earn them.`);
    }
    await db.run(`UPDATE rs_players SET ${col} = ${col} - 1 WHERE user_id = ?`, [interaction.user.id]);
    const item = rollBackpack(type, player.rig_level || 'none');
    await addItem(interaction.user.id, item);
    const line = pick(BACKPACK_LINES).replace('@user', `**${player.username}**`);
    return interaction.editReply({
      content:
        `🎒 ${line}\n\n` +
        `${RARITY_EMOJI[item.rarity || item.type] || '📦'} **${item.name}** *(${item.rarity || item.type})*\n` +
        `${item.powerBonus ? `<:sword:1495666991187361943> +${item.powerBonus} power\n` : ''}` +
        `${item.desc ? `*${item.desc}*` : ''}`,
    });
  },

  async openBackpackMsg(message, type) {
    const player = await ensureRSUser(message.author.id, message.author.username);
    if (!['basic', 'royal', 'cursed'].includes(type)) {
      const basic   = Number(player.backpacks_basic  || 0);
      const royal   = Number(player.backpacks_royal  || 0);
      const cursed  = Number(player.backpacks_cursed || 0);
      const total   = basic + royal + cursed;
      if (total === 0) return message.reply('<:wrong:1495666083594502174> You have no backpacks. Play Rumble Slaughter to earn some!');
      return message.reply(
        `🎒 **Your Backpacks:**
` +
        `• Basic: **${basic}**
` +
        `• Royal: **${royal}**
` +
        `• Cursed: **${cursed}**

` +
        `Use \`!openbackpack basic\`, \`!openbackpack royal\`, or \`!openbackpack cursed\` to open one.`
      );
    }
    const col = `backpacks_${type}`;
    if (!player[col] || Number(player[col]) <= 0) return message.reply(`<:wrong:1495666083594502174> You don't have any **${type}** backpacks!`);
    await db.run(`UPDATE rs_players SET ${col} = ${col} - 1 WHERE user_id = ?`, [message.author.id]);
    const item = rollBackpack(type, player.rig_level || 'none');
    await addItem(message.author.id, item);
    const line = pick(BACKPACK_LINES).replace('@user', `**${player.username}**`);
    return message.reply(
      `🎒 ${line}\n\n` +
      `${RARITY_EMOJI[item.rarity || item.type] || '📦'} **${item.name}** *(${item.rarity || item.type})*\n` +
      `${item.powerBonus ? `<:sword:1495666991187361943> +${item.powerBonus} power\n` : ''}` +
      `${item.desc ? `*${item.desc}*` : ''}`
    );
  },

  // ── Inventory ─────────────────────────────────────────────────────────────────
  async showInventory(interaction) {
    return this._showInventoryPicker(interaction.user, async (data) => interaction.editReply(data));
  },

  async showInventoryMsg(message) {
    return this._showInventoryPicker(message.author, async (data) => message.reply(data));
  },

  async _showInventoryPicker(user, replyFn) {
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
    const inv    = await getInventory(user.id);
    const player = await ensureRSUser(user.id, user.username);

    if (!inv.length) {
      return replyFn({ content: '<:wrong:1495666083594502174> Your inventory is empty. Open backpacks to get weapons. <:purp_caveira50:1495665632845369354>', ephemeral: true });
    }

    const weapons = inv.filter(i => i.item_type === 'weapon');
    const others  = inv.filter(i => i.item_type !== 'weapon');
    const equipped = weapons.find(i => i.item_id === player.equipped_weapon_id);

    const embed = new EmbedBuilder()
      .setColor('#6B2FA0')
      .setTitle('<:sword:1495666991187361943> Your Rumble Slaughter Inventory')
      .setDescription(
        equipped
          ? `**Equipped:** ${RARITY_EMOJI[equipped.rarity] || '📦'} **${equipped.item_name}** +${equipped.power_bonus}<:sword:1495666991187361943>`
          : '**Equipped:** nothing. embarrassing.'
      )
      .addFields(
        { name: '<:sword:1495666991187361943> Weapons', value: weapons.length
          ? weapons.map(i => `${RARITY_EMOJI[i.rarity] || '📦'} **${i.item_name}** +${i.power_bonus}<:sword:1495666991187361943>${player.equipped_weapon_id === i.item_id ? ' <:checkmark:1495666088417956002>' : ''}`).join('\n')
          : 'None yet.', inline: false },
        { name: '🎒 Other Items', value: others.length
          ? others.map(i => `${RARITY_EMOJI[i.rarity || i.item_type] || '📦'} **${i.item_name}**${i.description ? ` — *${i.description}*` : ''}`).join('\n').slice(0, 1024)
          : 'None.', inline: false },
      )
      .setFooter({ text: 'pick a weapon from the menu below to equip it' });

    const components = [];
    if (weapons.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`rs_equip:${user.id}`)
        .setPlaceholder('<:sword:1495666991187361943> Pick a weapon to equip...')
        .addOptions(weapons.slice(0, 25).map(i => ({
          label: `${i.item_name} (+${i.power_bonus} power)`,
          value: i.item_id,
          description: `${i.rarity} weapon${player.equipped_weapon_id === i.item_id ? ' — currently equipped' : ''}`,
          default: player.equipped_weapon_id === i.item_id,
        })));
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    return replyFn({ embeds: [embed], components, ephemeral: true });
  },

  // ── Emoji commands ─────────────────────────────────────────────────────────────
  async setEmojiCmd(interaction, emoji) {
    const player   = await ensureRSUser(interaction.user.id, interaction.user.username);
    const isAnimated = /^<a?:\w+:\d+>$/.test(emoji);
    if (isAnimated && Number(player.level) < 10) return interaction.editReply(`<:wrong:1495666083594502174> Animated emojis unlock at level 10. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET emoji_tag = ? WHERE user_id = ?', [emoji, interaction.user.id]);
    return interaction.editReply(`<:checkmark:1495666088417956002> Primary emoji set to ${emoji}!`);
  },

  async setEmojiMsg(message, emoji) {
    if (!emoji) return message.reply('<:wrong:1495666083594502174> Usage: `!setemoji <emoji>`');
    const player   = await ensureRSUser(message.author.id, message.author.username);
    const isAnimated = /^<a?:\w+:\d+>$/.test(emoji);
    if (isAnimated && Number(player.level) < 10) return message.reply(`<:wrong:1495666083594502174> Animated emojis unlock at level 10. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET emoji_tag = ? WHERE user_id = ?', [emoji, message.author.id]);
    return message.reply(`<:checkmark:1495666088417956002> Primary emoji set to ${emoji}!`);
  },

  async addEmojiCmd(interaction, emoji) {
    const player = await ensureRSUser(interaction.user.id, interaction.user.username);
    if (Number(player.level) < 20) return interaction.editReply(`<:wrong:1495666083594502174> Second emoji slot unlocks at level 20. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET extra_emoji = ? WHERE user_id = ?', [emoji, interaction.user.id]);
    return interaction.editReply(`<:checkmark:1495666088417956002> Extra emoji set to ${emoji}!`);
  },

  async addEmojiMsg(message, emoji) {
    if (!emoji) return message.reply('<:wrong:1495666083594502174> Usage: `!addemoji <emoji>`');
    const player = await ensureRSUser(message.author.id, message.author.username);
    if (Number(player.level) < 20) return message.reply(`<:wrong:1495666083594502174> Second emoji slot unlocks at level 20. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET extra_emoji = ? WHERE user_id = ?', [emoji, message.author.id]);
    return message.reply(`<:checkmark:1495666088417956002> Extra emoji set to ${emoji}!`);
  },

  // ── Animated Emoji Picker ─────────────────────────────────────────────────────
  async pickAnimatedEmoji(message) {
    const player = await ensureRSUser(message.author.id, message.author.username);
    if (Number(player.level) < 10) {
      return message.reply(`<:wrong:1495666083594502174> Animated emojis unlock at **level 10**. You're level **${player.level}**. Keep playing to level up! <:purp_caveira50:1495665632845369354>`);
    }
    return this._showEmojiPicker(message.author, async (data) => message.reply(data));
  },

  async pickAnimatedEmojiSlash(interaction) {
    const player = await ensureRSUser(interaction.user.id, interaction.user.username);
    if (Number(player.level) < 10) {
      return interaction.editReply(`<:wrong:1495666083594502174> Animated emojis unlock at **level 10**. You're level **${player.level}**. Keep playing! <:purp_caveira50:1495665632845369354>`);
    }
    return this._showEmojiPicker(interaction.user, async (data) => interaction.editReply(data));
  },

  async _showEmojiPicker(user, replyFn) {
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

    // Split into chunks of 25 (Discord limit)
    const chunks = [];
    for (let i = 0; i < ANIMATED_EMOJI_POOL.length; i += 25) {
      chunks.push(ANIMATED_EMOJI_POOL.slice(i, i + 25));
    }

    const rows = chunks.map((chunk, idx) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rs_pickemoji:${user.id}:${idx}`)
          .setPlaceholder(idx === 0 ? '✨ Pick your animated emoji (1-25)...' : `✨ Pick your animated emoji (${idx * 25 + 1}-${Math.min((idx + 1) * 25, ANIMATED_EMOJI_POOL.length)})...`)
          .addOptions(chunk.map(e => ({
            label: e.name,
            value: e.id,
            description: 'Wraps both sides of your name in battle',
          })))
      )
    );

    const embed = new EmbedBuilder()
      .setColor('#C9B1FF')
      .setTitle('✨ Pick Your Animated Arena Emoji')
      .setDescription(
        'Your chosen emoji will wrap your name in battle like this:\n\n' +
        '**emoji** YourName **emoji**\n\n' +
        `*You unlocked this at level 10. Choose wisely. or don't. <:purp_caveira50:1495665632845369354>*`
      )
      .setFooter({ text: 'only you can see this • pick from the menu below' });

    await replyFn({ embeds: [embed], components: rows.slice(0, 5), ephemeral: true });
  },

  // ── Admin: rig ─────────────────────────────────────────────────────────────────
  async rigPlayer(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
    const target = message.mentions?.users?.first();
    const level  = args[1]?.toLowerCase();
    if (!target || !['petty','favorite','maincharacter','none'].includes(level))
      return message.reply('<:wrong:1495666083594502174> Usage: `!rig @user <petty|favorite|maincharacter|none>`');
    await ensureRSUser(target.id, target.username);
    await db.run('UPDATE rs_players SET rig_level = ? WHERE user_id = ?', [level, target.id]);
    return message.reply(`<:checkmark:1495666088417956002> **${target.username}** rig level set to **${level}**.`);
  },

  async unrigPlayer(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
    const target = message.mentions?.users?.first();
    if (!target) return message.reply('<:wrong:1495666083594502174> Usage: `!unrig @user`');
    await db.run('UPDATE rs_players SET rig_level = ? WHERE user_id = ?', ['none', target.id]);
    return message.reply(`<:checkmark:1495666088417956002> **${target.username}** is no longer rigged.`);
  },

  async rigRole(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
    const role  = message.mentions?.roles?.first();
    const level = args[1]?.toLowerCase();
    if (!role || !['petty','favorite','maincharacter','off','none'].includes(level))
      return message.reply('<:wrong:1495666083594502174> Usage: `!rigrole @role <petty|favorite|maincharacter|off>`');
    if (level === 'off' || level === 'none') {
      await db.run('DELETE FROM rs_rigged_roles WHERE role_id = ?', [role.id]);
      return message.reply(`<:checkmark:1495666088417956002> Rig removed from role **${role.name}**.`);
    }
    await db.run(
      'INSERT INTO rs_rigged_roles (role_id, role_name, rig_level) VALUES (?, ?, ?) ON CONFLICT (role_id) DO UPDATE SET rig_level = EXCLUDED.rig_level',
      [role.id, role.name, level]
    );
    return message.reply(`<:checkmark:1495666088417956002> Role **${role.name}** rigged to **${level}**.`);
  },

  async setRigRandom(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
    const state = args[0]?.toLowerCase() === 'on';
    await setSetting('rigrandom', state);
    return message.reply(`<:checkmark:1495666088417956002> Rigrandom is now **${state ? 'ON' : 'OFF'}**. ${state ? 'One secret chosen menace will be picked each game.' : ''}`);
  },

  async setRiggedMode(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
    const mode = args[0]?.toLowerCase();
    if (!['public','hidden'].includes(mode)) return message.reply('<:wrong:1495666083594502174> Usage: `!riggedmode <public|hidden>`');
    await setSetting('riggedmode', mode);
    return message.reply(`<:checkmark:1495666088417956002> Rigged mode announcements set to **${mode}**.`);
  },

  async setStaffRole(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
    const role = message.mentions?.roles?.first();
    if (!role) return message.reply('<:wrong:1495666083594502174> Usage: `!staffrole @role`');
    await setSetting('staff_role_id', role.id);
    return message.reply(`<:checkmark:1495666088417956002> Staff role set to **${role.name}**. They'll get Petty privileges in Staff vs Members events.`);
  },

  async giveBackpack(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');

    // Support both slash (args[0] = <@id>) and prefix (@mention)
    let targetId, targetName;
    const mentionMatch = args[0]?.match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
      targetId = mentionMatch[1];
      const fetched = await message.client.users.fetch(targetId).catch(() => null);
      targetName = fetched?.username || targetId;
    } else {
      const target = message.mentions?.users?.first();
      if (!target) return message.reply('<:wrong:1495666083594502174> Usage: `!givebackpack @user <basic|royal|cursed> [amount]`');
      targetId   = target.id;
      targetName = target.username;
    }

    const type   = args[1]?.toLowerCase();
    const amount = parseInt(args[2]) || 1;

    if (!['basic','royal','cursed'].includes(type))
      return message.reply('<:wrong:1495666083594502174> Usage: `!givebackpack @user <basic|royal|cursed> [amount]`');

    await ensureRSUser(targetId, targetName);
    const col = `backpacks_${type}`;
    await db.run(`UPDATE rs_players SET ${col} = ${col} + ? WHERE user_id = ?`, [amount, targetId]);
    return message.reply(`<:checkmark:1495666088417956002> Gave **${amount} ${type}** backpack(s) to **${targetName}**.`);
  },

  // ── Match Stats ──────────────────────────────────────────────────────────────────
  async matchStats(message) {
    const match = await db.get(
      'SELECT * FROM rs_matches WHERE channel_id = ? ORDER BY played_at DESC LIMIT 1',
      [message.channel.id]
    );
    if (!match) return message.reply('<:wrong:1495666083594502174> No matches played in this channel yet.');

    const players = await db.all(
      'SELECT * FROM rs_match_players WHERE match_id = ? ORDER BY finish_pos ASC',
      [match.id]
    );
    const kills = await db.all(
      'SELECT * FROM rs_match_kills WHERE match_id = ? ORDER BY kill_order ASC',
      [match.id]
    ).catch(() => []);

    const winner    = players.find(p => p.finish_pos === 1);
    const firstDead = players.find(p => p.finish_pos === match.player_count);

    // Build finish order
    const finishLines = players
      .sort((a, b) => a.finish_pos - b.finish_pos)
      .map(p => {
        const medal = p.finish_pos === 1 ? '<a:MVP24:1495665626688131183>' : p.finish_pos === match.player_count ? '<:purp_caveira50:1495665632845369354>' : `**#${p.finish_pos}**`;
        const deathTag = p.death_type === 'chaos' ? ' *(chaos)*' : p.death_type === 'self' ? ' *(self)* <:purp_caveira50:1495665632845369354>' : '';
        const firstTag = p.finish_pos === match.player_count ? ' ← first to die 😬' : '';
        const winTag   = p.finish_pos === 1 ? ' ← winner <a:MVP24:1495665626688131183>' : '';
        return `${medal} **${p.username}** — ${p.kills} kill${p.kills !== 1 ? 's' : ''} +${p.regret_added} regret${deathTag}${firstTag}${winTag}`;
      });

    // Build kill chain
    const killLines = kills.map((k, i) => {
      // Check if this kill was an avenge
      const priorVictim = kills.slice(0, i).find(prev => prev.killer_id === k.victim_id);
      const avengeTag   = priorVictim ? ` <a:fire1:1495666086534844516> *(avenged ${priorVictim.victim_name})*` : '';
      const chaosTag    = k.kill_type === 'chaos' ? ' 🌀' : k.kill_type === 'self' ? ' <:purp_caveira50:1495665632845369354> *(self)*' : '';
      return `${i+1}. **${k.killer_name}** → **${k.victim_name}**${chaosTag}${avengeTag}`;
    });

    // Bounty results
    const claimedBounties = await db.all(
      'SELECT * FROM rs_bounties WHERE match_id = ? AND claimed_at IS NOT NULL AND claimed_name != ?',
      [match.id, 'reset']
    ).catch(() => []);

    const embeds = [
      new EmbedBuilder().setColor('#2ECC40')
        .setTitle('<a:purplecheck:1478983961450643538> Match Recap — Rumble Slaughter')
        .addFields(
          { name: '<a:MVP24:1495665626688131183> Winner',     value: winner?.username || 'nobody',    inline: true },
          { name: '<:purp_caveira50:1495665632845369354> First Dead', value: firstDead?.username || 'nobody', inline: true },
          { name: '<:member:1495666085121491024> Players',    value: `${match.player_count}`,         inline: true },
          { name: '<a:SINS:1522338223613804724> Pot',        value: `${Number(match.pot).toLocaleString()} sins`, inline: true },
        )
        .addFields({ name: '<a:1stplace:1487504691880263791> Finish Order', value: finishLines.join('\n') || 'no data', inline: false })
        .setFooter({ text: `Played: ${new Date(match.played_at).toLocaleString()}` }),
    ];

    if (killLines.length) {
      embeds[0].addFields({ name: '<:sword:1495666991187361943> Kill Chain', value: killLines.join('\n').slice(0, 1024), inline: false });
    }

    if (claimedBounties.length) {
      const typeLabels = { kill: '<a:target:1495665634279821485>', avenge: '<a:fire1:1495666086534844516>', death: '<:purp_caveira50:1495665632845369354>', winner: '<a:MVP24:1495665626688131183>' };
      const bLines = claimedBounties.map(b => {
        const n = b.death_number;
        const ord = n ? (n===1?'st':n===2?'nd':n===3?'rd':'th') : null;
        const target = b.target_name ? `@${b.target_name}` : n ? `${n}${ord} Death` : 'Winner';
        return `${typeLabels[b.type] || '<a:target:1495665634279821485>'} **@${b.claimed_name}** — ${target} → **${b.prize}**${b.payee ? ` *(${b.payee})*` : ''}`;
      });
      embeds[0].addFields({ name: '<a:target:1495665634279821485> Bounties Claimed', value: bLines.join('\n'), inline: false });
    }

    return message.reply({ embeds });
  },

  // ── Player Stats ──────────────────────────────────────────────────────────────
  async playerStats(message, args) {
    const target = message.mentions?.users?.first() || message.author;
    const player = await db.get('SELECT * FROM rs_players WHERE user_id = ?', [target.id]);
    if (!player) return message.reply(`<:wrong:1495666083594502174> **${target.username}** hasn't played Rumble Slaughter yet.`);

    const matches = await db.all(
      'SELECT mp.*, m.channel_id, m.played_at FROM rs_match_players mp JOIN rs_matches m ON mp.match_id = m.id WHERE mp.user_id = ? ORDER BY m.played_at DESC LIMIT 20',
      [target.id]
    );

    const totalMatches   = matches.length;
    const wins           = matches.filter(m => m.finish_pos === 1).length;
    const firstDeaths    = matches.filter(m => m.finish_pos === Number(m.player_count) || m.death_type !== 'winner').length;
    const totalKills     = matches.reduce((s, m) => s + Number(m.kills), 0);
    const totalRegret    = matches.reduce((s, m) => s + Number(m.regret_added), 0);
    const chaosDiaths    = matches.filter(m => m.death_type === 'chaos').length;

    // Times died first
    const firstDeadCount = await db.all(
      `SELECT mp.match_id FROM rs_match_players mp
       JOIN rs_matches m ON mp.match_id = m.id
       WHERE mp.user_id = ? AND mp.finish_pos = m.player_count`,
      [target.id]
    );

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#6B2FA0')
        .setTitle(`<:sword:1495666991187361943> ${target.username} — Rumble Slaughter Stats`)
        .setThumbnail(target.displayAvatarURL?.() || null)
        .addFields(
          { name: '<a:1stplace:1487504691880263791> Wins',             value: `${player.wins}`,                      inline: true },
          { name: '<:purp_caveira50:1495665632845369354> Losses',            value: `${player.losses}`,                    inline: true },
          { name: '<:conroller:1511532204415778897> Games Played',      value: `${player.games_played}`,              inline: true },
          { name: '<:sword:1495666991187361943> Total Kills',       value: `${totalKills}`,                       inline: true },
          { name: '😬 First to Die',      value: `${firstDeadCount.length} time${firstDeadCount.length !== 1 ? 's' : ''}`, inline: true },
          { name: '🌀 Chaos Deaths',      value: `${chaosDiaths}`,                      inline: true },
          { name: '<:purp_caveira50:1495665632845369354> Regret From RS',    value: `${totalRegret.toLocaleString()}`,      inline: true },
          { name: '<a:fire1:1495666086534844516> Power Level',       value: `${player.power}`,                     inline: true },
          { name: '📈 Level',             value: `${player.level}`,                     inline: true },
        )
        .setFooter({ text: 'use /rsleaderboard for the full rankings' })
    ]});
  },

  // ── Hall of Fame ──────────────────────────────────────────────────────────────
  async hallOfFame(message) {
    // Most wins overall
    const topWins = await db.all(
      'SELECT user_id, username, wins FROM rs_players ORDER BY wins DESC LIMIT 5'
    );

    // Most wins in this channel
    const topChannel = await db.all(
      `SELECT mp.user_id, mp.username, COUNT(*) as wins
       FROM rs_match_players mp
       JOIN rs_matches m ON mp.match_id = m.id
       WHERE m.channel_id = ? AND mp.finish_pos = 1
       GROUP BY mp.user_id, mp.username
       ORDER BY wins DESC LIMIT 5`,
      [message.channel.id]
    );

    // Wall of shame — most times died first
    const wallOfShame = await db.all(
      `SELECT mp.user_id, mp.username, COUNT(*) as first_deaths
       FROM rs_match_players mp
       JOIN rs_matches m ON mp.match_id = m.id
       WHERE mp.finish_pos = m.player_count AND mp.death_type != 'winner'
       GROUP BY mp.user_id, mp.username
       ORDER BY first_deaths DESC LIMIT 5`
    );

    const medals = ['🥇','🥈','🥉','4.','5.'];

    const topWinsText    = topWins.length
      ? topWins.map((p, i) => `${medals[i]} **${p.username}** — ${p.wins} win${p.wins !== 1 ? 's' : ''}`).join('\n')
      : 'No data yet.';

    const topChannelText = topChannel.length
      ? topChannel.map((p, i) => `${medals[i]} **${p.username}** — ${p.wins} win${p.wins !== 1 ? 's' : ''}`).join('\n')
      : 'No wins in this channel yet.';

    const shameText      = wallOfShame.length
      ? wallOfShame.map((p, i) => `${medals[i]} **${p.username}** — died first ${p.first_deaths} time${p.first_deaths !== 1 ? 's' : ''} <:purp_caveira50:1495665632845369354>`).join('\n')
      : 'Nobody has died first yet. somehow.';

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:1stplace:1487504691880263791> Rumble Slaughter — Hall of Fame')
        .addFields(
          { name: '<a:MVP24:1495665626688131183> Most Wins (Overall)',        value: topWinsText,    inline: false },
          { name: `<a:MVP24:1495665626688131183> Most Wins (This Channel)`,   value: topChannelText, inline: false },
          { name: '<:purp_caveira50:1495665632845369354> Wall of Shame (First to Die)', value: shameText,    inline: false },
        )
        .setFooter({ text: '!rsstats @user for personal history • !rsmatchstats for last match' })
    ]});
  },

  // ── Bounty System ────────────────────────────────────────────────────────────────
  async addBounty(message, args) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin/staff only.');

    const type = args[0]?.toLowerCase();
    if (!['kill','avenge','death','winner'].includes(type)) {
      return message.reply(
        `<:wrong:1495666083594502174> Usage:\n` +
        `\`!addbounty kill @user <prize> [payee]\`\n` +
        `\`!addbounty avenge @user <prize> [payee]\`\n` +
        `\`!addbounty death <number> <prize> [payee]\`\n` +
        `\`!addbounty winner <prize> [payee]\``
      );
    }

    let targetId = null, targetName = null, deathNum = null, prize, payee;

    if (type === 'kill' || type === 'avenge') {
      const target = message.mentions?.users?.first();
      if (!target) return message.reply('<:wrong:1495666083594502174> Tag a target player.');
      targetId   = target.id;
      targetName = target.username;
      prize  = args.slice(2).join(' ').split('|')[0].trim();
      payee  = args.slice(2).join(' ').split('|')[1]?.trim() || null;
    } else if (type === 'death') {
      deathNum = parseInt(args[1]);
      if (!deathNum || deathNum < 1) return message.reply('<:wrong:1495666083594502174> Usage: `!addbounty death <number> <prize> [payee]`');
      prize  = args.slice(2).join(' ').split('|')[0].trim();
      payee  = args.slice(2).join(' ').split('|')[1]?.trim() || null;
    } else {
      prize  = args.slice(1).join(' ').split('|')[0].trim();
      payee  = args.slice(1).join(' ').split('|')[1]?.trim() || null;
    }

    if (!prize) return message.reply('<:wrong:1495666083594502174> You need to specify a prize!');

    await db.run(
      'INSERT INTO rs_bounties (channel_id, type, target_id, target_name, death_number, prize, payee) VALUES (?,?,?,?,?,?,?)',
      [message.channel.id, type, targetId, targetName, deathNum, prize, payee]
    );

    const typeLabels = { kill: '<a:target:1495665634279821485> Kill', avenge: '<a:fire1:1495666086534844516> Avenge', death: '<:purp_caveira50:1495665632845369354> Death', winner: '<a:MVP24:1495665626688131183> Winner' };
    const targetStr  = targetName ? `**@${targetName}**` : deathNum ? `**${deathNum}${deathNum===1?'st':deathNum===2?'nd':deathNum===3?'rd':'th'} death**` : 'match winner';

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:target:1495665634279821485> Bounty Added!')
        .addFields(
          { name: 'Type',    value: typeLabels[type],        inline: true },
          { name: 'Target',  value: targetStr,               inline: true },
          { name: 'Prize',   value: prize,                   inline: true },
          { name: 'Payee',   value: payee || 'not specified', inline: true },
        )
        .setFooter({ text: 'use !bounties to see all active bounties • resets on new match' })
    ]});
  },

  async clearBounties(message) {
    if (!isHost(message.member)) return message.reply('<:wrong:1495666083594502174> Admin/staff only.');
    await db.run('DELETE FROM rs_bounties WHERE channel_id = ? AND claimed_at IS NULL', [message.channel.id]);
    return message.reply('<:checkmark:1495666088417956002> All unclaimed bounties cleared for this channel.');
  },

  async showBounties(message) {
    const bounties = await db.all(
      "SELECT * FROM rs_bounties WHERE channel_id = ? AND claimed_at IS NULL ORDER BY created_at ASC",
      [message.channel.id]
    );

    if (!bounties.length) {
      return message.reply('<:wrong:1495666083594502174> No active bounties in this channel. Staff can add them with `!addbounty`.');
    }

    const sections = {
      kill:   bounties.filter(b => b.type === 'kill'),
      avenge: bounties.filter(b => b.type === 'avenge'),
      death:  bounties.filter(b => b.type === 'death'),
      winner: bounties.filter(b => b.type === 'winner'),
    };

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('<a:target:1495665634279821485> Active Bounties — This Match');

    if (sections.kill.length) {
      embed.addFields({ name: '<a:target:1495665634279821485> Kill Bounties', value: sections.kill.map(b =>
        `• [#${b.id}] Kill **@${b.target_name}** → prize: **${b.prize}** (from: ${b.payee || 'n/a'})`
      ).join('\n'), inline: false });
    }
    if (sections.avenge.length) {
      embed.addFields({ name: '<a:fire1:1495666086534844516> Avenge Bounties', value: sections.avenge.map(b =>
        `• [#${b.id}] Avenge **@${b.target_name}** → prize: **${b.prize}** (from: ${b.payee || 'n/a'})`
      ).join('\n'), inline: false });
    }
    if (sections.death.length) {
      embed.addFields({ name: '<:purp_caveira50:1495665632845369354> Death Bounties', value: sections.death.map(b => {
        const n = Number(b.death_number);
        const ord = n===1?'st':n===2?'nd':n===3?'rd':'th';
        return `• [#${b.id}] **${n}${ord} Death** → prize: **${b.prize}** (from: ${b.payee || 'n/a'})`;
      }).join('\n'), inline: false });
    }
    if (sections.winner.length) {
      embed.addFields({ name: '<a:MVP24:1495665626688131183> Winner Bounties', value: sections.winner.map(b =>
        `• [#${b.id}] Match winner → prize: **${b.prize}** (from: ${b.payee || 'n/a'})`
      ).join('\n'), inline: false });
    }

    embed.setFooter({ text: 'bounties are claimed automatically when conditions are met' });
    return message.reply({ embeds: [embed] });
  },

  // ── Set Era Dropdown ──────────────────────────────────────────────────────────
  async setEraDropdown(interaction) {
    if (!isHost(interaction.member)) {
      return interaction.reply({ content: '<:wrong:1495666083594502174> Only hosts can set the era.', ephemeral: true });
    }
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

    const eraEntries = Object.entries(ERAS).filter(([k]) => k !== 'default');
    // Split into chunks of 25
    const chunks = [];
    for (let i = 0; i < eraEntries.length; i += 25) chunks.push(eraEntries.slice(i, i + 25));

    const rows = chunks.map((chunk, idx) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rs_era:${interaction.user.id}:${interaction.channel.id}`)
          .setPlaceholder(idx === 0 ? '✨ Pick an era...' : `✨ More eras (${idx * 25 + 1}-${Math.min((idx+1)*25, eraEntries.length)})...`)
          .addOptions(chunk.map(([key, era]) => ({
            label: era.name,
            value: key,
            description: era.intro ? era.intro[0].slice(0, 100) : key,
          })))
      )
    );

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('✨ Select an Era')
        .setDescription('Pick the era for your next Rumble Slaughter match.\nAfter selecting, start with `!rumbleslaughter <bet>` — the era will auto-apply.')
      ],
      components: rows.slice(0, 5),
      ephemeral: true,
    });
  },

  // ── List Eras ─────────────────────────────────────────────────────────────────
  async listErasCmd(message) {
    const eraList = Object.entries(ERAS)
      .filter(([k]) => k !== 'default')
      .map(([k, v]) => `• **${v.name}** — \`era:${k}\``)
      .join('\n');
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('✨ Available Eras — Rumble Slaughter')
        .setDescription(eraList + '\n\n**Usage:** `!rumbleslaughter 50 era:gut feeling era`\nor `!rumbleslaughter 50 --era "Baddie Body Count"`')
        .setFooter({ text: 'default era used if no era is specified' })
    ]});
  },

  // ── Schedule info ──────────────────────────────────────────────────────────────
  async showSchedule(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('<:wrong:1495666083594502174> No Rumble Slaughter scheduled in this channel.\n\nStart one with `!rumbleslaughter <bet> [timestamp]`.');
    const tsUnix = game.fireAt ? Math.floor(game.fireAt.getTime() / 1000) : null;
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#6B2FA0')
        .setTitle('<:sword:1495666991187361943> Rumble Slaughter — Schedule')
        .addFields(
          { name: '<a:SINS:1522338223613804724> Entry',     value: `${game.bet} sins`,            inline: true },
          { name: '<:member:1495666085121491024> Signed Up', value: `${game.players.length}`,       inline: true },
          { name: '<a:marked:1511508970882465832> Phase',     value: game.phase,                     inline: true },
          { name: '<a:RojasClock:1511506715453947904> Fires At',  value: tsUnix ? `<t:${tsUnix}:F> (<t:${tsUnix}:R>)` : 'Manual (`!startgame`)', inline: false },
          { name: '👤 Host',      value: game.hostName,                  inline: true },
        )
        .setFooter({ text: '!startgame to fire now • !cancelevent to cancel' })
    ]});
  },
};
