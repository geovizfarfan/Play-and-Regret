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
const activeGames = new Map();

// ─── NARRATIVE POOLS ─────────────────────────────────────────────────────────
const WIN_LINES = [
  '@winner wins… somehow.',
  '@winner survived. We\'re all confused.',
  '@winner takes the crown. Don\'t get comfortable.',
  '@winner wins. Was it deserved? absolutely not.',
  '@winner really said \'I\'m built different\' and nobody stopped them.',
  '@winner wins. The bar was low but still.',
  '@winner is your champion. This is embarrassing for everyone else.',
  '@winner didn\'t play fair… they played effective.',
  '@winner wins. Report them if you\'re mad.',
  '@winner stood on business. The rest stood on nothing.',
  '@winner wins. You all allowed this.',
  '@winner survives purely out of spite.',
  '@winner wins… and yes they will be insufferable now.',
  '@winner is the main character today. Unfortunately.',
  '@winner wins. The arena regrets it.',
  '@winner ate. Finally someone did.',
  '@winner wins. Barely, but we\'ll count it.',
  '@winner wins. Don\'t ask how.',
  '@winner wins. The rest… delete your accounts.',
  '@winner wins. Everyone else, go reflect.',
];

const ELIM_LINES = [
  '@user thought they ate… they didn\'t.',
  '@user got eliminated by vibes alone.',
  '@user tripped over nothing. tragic.',
  '@user blinked and it was over.',
  '@user tried. That was the problem.',
  '@user got humbled immediately.',
  '@user was never a real contender.',
  '@user got eliminated mid-thought.',
  '@user really came here for this outcome?',
  '@user embarrassed themselves and left.',
  '@user had potential. keyword: had.',
  '@user got eliminated by bad decisions.',
  '@user was just here for decoration.',
  '@user got folded instantly.',
  '@user said \'watch this\'… we did.',
  '@user lasted 3 seconds. impressive? no.',
  '@user got eliminated before we learned their name.',
  '@user tried to be bold. that was a mistake.',
  '@user lost. loudly.',
  '@user got removed from existence.',
  '@user simply stopped being relevant.',
  '@user was eliminated for being annoying.',
  '@user thought confidence = skill.',
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
  '@user tried to fight… why?',
  '@user got deleted.',
  '@user fumbled the easiest round.',
  '@user got sent back to the lobby.',
  '@user is no longer with us. thankfully.',
  '@user got eliminated by existing wrong.',
  '@user got outplayed by nothing.',
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
  '@user\'s reputation just died.',
  '@user experienced character development.',
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
  '@attacker said \'it\'s me or you\'… it was you.',
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
];

const BACKPACK_LINES = [
  '@user opened a backpack… let\'s see if it was worth it.',
  '@user got something… not good, but something.',
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
  '@user got something shiny. useless, but shiny.',
];

const CHAOS_EVENTS = [
  { text: 'Everyone trips. Multiple eliminations. embarrassing.',   type: 'mass_elim',   count: 2 },
  { text: 'The arena glitched. Random player eliminated.',          type: 'random_elim', count: 1 },
  { text: 'The crowd turns on you. chaos ensues.',                  type: 'random_elim', count: 2 },
  { text: 'A random explosion. nobody saw it coming.',              type: 'random_elim', count: 1 },
  { text: 'Sudden death mode activated. good luck.',                type: 'mass_elim',   count: 3 },
  { text: 'The arena got bored. people disappear.',                 type: 'random_elim', count: 1 },
  { text: 'Everyone panics. nobody survives comfortably.',          type: 'mass_elim',   count: 2 },
  { text: 'The vibes shifted. it\'s bad for some of you.',          type: 'random_elim', count: 1 },
  { text: 'Random eliminations. stay mad.',                         type: 'random_elim', count: 2 },
  { text: 'The game said \'not today\' to several players.',        type: 'mass_elim',   count: 2 },
  { text: 'Chaos event triggered. survival not guaranteed.',        type: 'random_elim', count: 1 },
  { text: 'The arena chose violence.',                              type: 'random_elim', count: 2 },
  { text: 'Everything goes wrong at once.',                         type: 'mass_elim',   count: 3 },
  { text: 'A mysterious force removes players.',                    type: 'random_elim', count: 1 },
  { text: 'Nobody is safe. especially you.',                        type: 'random_elim', count: 2 },
];

const STAFF_VS_MEMBERS_LINES = [
  '👑 **STAFF VS MEMBERS EVENT!** The arena just got political.',
  '⚔️ Staff have entered the chat. This is not a drill.',
  '😈 The privileged have joined the battlefield. good luck.',
  '👑 Staff vs Members round triggered. May the least embarrassing team win.',
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

const RARITY_EMOJI = { common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟡', junk: '🗑️', boost: '⚡', wildcard: '🃏' };

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

  await db.run(
    'UPDATE rs_players SET xp = ?, level = ?, power = ?, total_xp = ? WHERE user_id = ?',
    [xp, level, power, newTotalXp, userId]
  );

  // Grant backpacks
  for (const type of backpacksToGrant) {
    const col = `backpacks_${type}`;
    await db.run(`UPDATE rs_players SET ${col} = ${col} + 1 WHERE user_id = ?`, [userId]);
  }

  return { backpacksToGrant, leveledUp: level > Number(player.level), newLevel: level };
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

function getDisplayName(player) {
  const tags = [player.emoji_tag, player.extra_emoji].filter(Boolean).join(' ');
  return `${tags} ${player.username}`.trim();
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

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── GAME ENGINE ──────────────────────────────────────────────────────────────
async function runGame(channel, game) {
  const { players, bet, hostId } = game;
  let alive = [...players];
  let round = 1;
  const settings  = await getSettings();
  const staffRole = settings.staff_role_id;

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
        new EmbedBuilder().setColor('#FF69B4')
          .setTitle('👑 Rigged Mode Enabled. Cry About It.')
          .setDescription(lines.join('\n') + '\n\n*This round has been legally compromised.*')
      ]});
    }
  }

  // Staff vs Members announcement
  if (hasStaffVsMembers) {
    await channel.send(pick(STAFF_VS_MEMBERS_LINES));
    await sleep(2000);
  }

  // Track stats for XP distribution
  const elimCounts = new Map();
  const survived   = new Set();

  // ── Round loop ──────────────────────────────────────────────────────────────
  while (alive.length > 1) {
    await sleep(ROUND_DELAY_MS);

    const events    = [];
    const toElim    = new Set();
    const immuneIds = new Set();

    // Calculate immunity for this round
    for (const p of alive) {
      const immunity = RIG_IMMUNITY[p.rig_level || 'none'];
      if (immunity > 0 && round <= immunity) immuneIds.add(p.user_id);
    }

    // Chaos event (20% chance per round, only if enough players)
    if (alive.length > 3 && Math.random() < 0.20) {
      const chaos = pick(CHAOS_EVENTS);
      let elimCount = Math.min(chaos.count, alive.length - 1);
      const shuffled = [...alive].sort(() => Math.random() - 0.5)
        .filter(p => !immuneIds.has(p.user_id));
      for (let i = 0; i < Math.min(elimCount, shuffled.length); i++) {
        toElim.add(shuffled[i].user_id);
        events.push(`💀 ${chaos.text.replace('@user', `**${getDisplayName(shuffled[i])}**`)}`);
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
        elimCounts.set(winner.user_id, (elimCounts.get(winner.user_id) || 0) + 1);

        // Backpack drop event (30% chance)
        if (Math.random() < 0.30) {
          const item  = rollBackpack('basic', winner.rig_level || 'none');
          await addItem(winner.user_id, item).catch(() => {});
          const bLine = pick(BACKPACK_LINES).replace('@user', `**${getDisplayName(winner)}**`);
          events.push(`🎒 ${bLine} → got **${item.name}** ${RARITY_EMOJI[item.rarity || item.type] || ''}`);
        }

        // Fight line
        const isHumiliation = Math.random() < 0.15;
        const fightLine = isHumiliation
          ? pick(HUMILIATION_LINES).replace('@user', `**${getDisplayName(loser)}**`)
          : pick(FIGHT_LINES)
              .replace('@attacker', `**${getDisplayName(winner)}**`)
              .replace('@target', `**${getDisplayName(loser)}**`);
        events.push(`⚔️ ${fightLine}`);
      }
    }

    alive = alive.filter(p => !toElim.has(p.user_id));
    for (const p of alive) survived.add(p.user_id);

    // Round embed
    const embed = new EmbedBuilder()
      .setColor('#1a0a00')
      .setTitle(`💀 Round ${round}`)
      .setDescription(events.join('\n') || '*The arena holds its breath. Nobody moves. Embarrassing.*')
      .addFields({ name: `🩸 Still Alive (${alive.length})`, value: alive.map(p => getDisplayName(p)).join(', ') || 'Nobody.' });

    await channel.send({ embeds: [embed] });
    round++;

    if (alive.length === 0) break;
  }

  // ── Game over ────────────────────────────────────────────────────────────────
  const pot    = bet * players.length;
  const tax    = Math.floor(pot * JACKPOT_TAX);
  const payout = pot - tax;

  await jackpot.addToDrawFund(tax);

  if (!alive.length) {
    // Everyone died
    await jackpot.addToDrawFund(payout);
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#333333')
        .setTitle('💀 Everyone died. Even the arena is embarrassed.')
        .setDescription(`**${pot.toLocaleString()} oops** goes to the jackpot. Nobody deserved it anyway.`)
    ]});
  } else {
    const winner = alive[0];
    const share  = Math.floor(payout / alive.length);

    // Chosen menace reveal
    if (chosenMenace && settings.riggedmode === 'public') {
      await channel.send(`🎬 **Plot twist:** ${getDisplayName(chosenMenace)} was the producer's favorite this round. You're welcome.`);
    }

    for (const w of alive) {
      await economy.getUser(w.user_id, w.username);
      await economy.addFunds(w.user_id, share, 'Rumble Slaughter win');
    }

    const winLine = pick(WIN_LINES).replace('@winner', `**${getDisplayName(winner)}**`);
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FFD700')
        .setTitle('👑 RUMBLE SLAUGHTER — CHAMPION')
        .setDescription(
          `${winLine}\n\n` +
          `💰 Wins **${share.toLocaleString()} oops**\n` +
          `🎰 **${tax.toLocaleString()} oops** → jackpot (10% tax)\n\n` +
          `*${players.length} entered. ${players.length - alive.length} got humbled. This is the way.*`
        )
    ]});
  }

  // ── XP & Stats ───────────────────────────────────────────────────────────────
  for (const p of players) {
    let xpGain = XP.PARTICIPATE;
    const isWinner = alive.some(w => w.user_id === p.user_id);
    const elimsBy  = elimCounts.get(p.user_id) || 0;

    if (isWinner)  xpGain += XP.WIN;
    else           xpGain += XP.LOSE;
    if (survived.has(p.user_id) && !isWinner) xpGain += XP.SURVIVE_ROUND;
    xpGain += elimsBy * XP.ELIMINATE;

    const xpResult = await awardXP(p.user_id, p.username, xpGain).catch(() => null);

    await db.run(`
      UPDATE rs_players
      SET wins   = wins   + ?,
          losses = losses + ?,
          games_played = games_played + 1
      WHERE user_id = ?
    `, [isWinner ? 1 : 0, isWinner ? 0 : 1, p.user_id]);

    // Announce backpack grants
    if (xpResult?.backpacksToGrant?.length) {
      for (const type of xpResult.backpacksToGrant) {
        await channel.send(
          `🎒 **${getDisplayName(p)}** hit an XP milestone and earned a **${type} backpack**! Use \`!openbackpack ${type}\` to open it.`
        ).catch(() => {});
      }
    }
  }

  // Elim XP for losers lines
  const elimLines = players
    .filter(p => !alive.some(w => w.user_id === p.user_id))
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)
    .map(p => pick(ELIM_LINES).replace('@user', `**${getDisplayName(p)}**`));

  if (elimLines.length) {
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#333333')
        .setTitle('📋 Post-Game Report')
        .setDescription(elimLines.join('\n'))
    ]});
  }
}

// ─── LAUNCH SIGNUP ────────────────────────────────────────────────────────────
async function launchSignup(channel, bet, hostId, hostName, fireAt, scheduleId) {
  if (activeGames.has(channel.id)) return null;

  const tsUnix = fireAt ? Math.floor(fireAt.getTime() / 1000) : null;
  const embed  = new EmbedBuilder()
    .setColor('#1a0a00')
    .setTitle('🗡️ RUMBLE SLAUGHTER: YOU THOUGHT YOU ATE')
    .setDescription(
      `**${hostName}** opened the arena.\n\n` +
      `Welcome to the most disrespectful arena in existence.\n` +
      `Join the fight. Gain power. Collect weapons. Or get eliminated in the most embarrassing way possible.\n\n` +
      `💰 Entry fee: **${bet} oops**\n` +
      `${tsUnix ? `⏰ **Starts:** <t:${tsUnix}:F> (<t:${tsUnix}:R>)` : '▶️ Host will start manually with `!startgame`'}\n\n` +
      `*Most of you will lose. Loudly.*`
    )
    .addFields({ name: '📋 Signed Up', value: '**0** players' })
    .setFooter({ text: `Min ${MIN_PLAYERS} players • !rsjoin to enter • Host: ${hostName}` });

  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rs_join:${channel.id}`)
      .setLabel('🗡️ Join the Arena')
      .setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [btn] });

  const game = {
    scheduleId, channelId: channel.id,
    bet, hostId, hostName, fireAt,
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
    await channel.send(`❌ **Rumble Slaughter** cancelled — only **${game.players.length}** showed up (need ${MIN_PLAYERS}). Everyone refunded. Embarrassing turnout.`);
    return;
  }

  game.phase = 'running';
  if (game.timer) clearTimeout(game.timer);
  if (game.scheduleId) await db.run("UPDATE rs_schedules SET status = 'running' WHERE id = ?", [game.scheduleId]).catch(() => {});

  const disabledBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rs_join:${channel.id}`).setLabel('Arena Closed').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
  await game.message?.edit({ components: [disabledBtn] }).catch(() => {});

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#8B0000')
      .setTitle('🗡️ THE ARENA IS SEALED.')
      .setDescription(
        `**${game.players.length} competitors** have entered.\n\n` +
        game.players.map((p, i) => `**${i + 1}.** ${getDisplayName(p)}`).join('\n') +
        `\n\n💰 Prize Pool: **${(game.bet * game.players.length).toLocaleString()} oops**\n` +
        `🎰 Jackpot Tax: **${Math.floor(game.bet * game.players.length * JACKPOT_TAX).toLocaleString()} oops**\n\n` +
        `*The rest of you… good luck. You'll need it.*`
      )
  ]});

  try {
    await runGame(channel, game);
  } catch (err) {
    console.error('[RumbleSlaughter] Game error:', err);
    for (const p of game.players) await economy.addFunds(p.user_id, game.bet, 'Rumble Slaughter error refund').catch(() => {});
    await channel.send('❌ The arena collapsed. Everyone refunded. The bot is embarrassed.').catch(() => {});
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
      if (!interaction.customId.startsWith('rs_join:')) return;

      const channelId = interaction.customId.split(':')[1];
      const game      = activeGames.get(channelId);

      if (!game || game.phase !== 'signup') {
        return interaction.reply({ content: '❌ No open game in this channel right now.', ephemeral: true });
      }
      if (game.players.find(p => p.user_id === interaction.user.id)) {
        return interaction.reply({ content: '⚠️ You\'re already in! Sit down.', ephemeral: true });
      }

      await interaction.deferUpdate();
      await economy.getUser(interaction.user.id, interaction.user.username);
      const bal = await economy.getBalance(interaction.user.id);
      if (bal < game.bet) {
        return interaction.followUp({ content: `❌ You need **${game.bet} oops** to enter. Go earn some first.`, ephemeral: true });
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
          name: '📋 Signed Up',
          value: `**${game.players.length}** player${game.players.length !== 1 ? 's' : ''}`,
        });
        await game.message.edit({ embeds: [updated] }).catch(() => {});
      }
      await interaction.followUp({ content: `🗡️ **${interaction.user.username}** entered the arena. (${game.players.length} signed up)` });
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
          new EmbedBuilder().setColor('#1a0a00')
            .setTitle('♻️ Rumble Slaughter — Restored')
            .setDescription(`Bot restarted but the arena is still open.\n\n💰 Entry: **${row.bet} oops** — use \`!rsjoin\` or click Join.\n${fireAt ? `⏰ Starts: <t:${Math.floor(fireAt.getTime()/1000)}:F>` : 'Use `!startgame` to fire.'}`)
            .addFields({ name: '📋 Already In', value: savedPlayers.length ? savedPlayers.map(p => getDisplayName(p)).join(', ') : 'Nobody yet' })
        ], components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rs_join:${row.channel_id}`).setLabel('🗡️ Join the Arena').setStyle(ButtonStyle.Danger)
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
      const bet = opts.getInteger('bet') || 50;
      const ts  = opts.getString('timestamp') || '';
      return this.handleCommand(fakeMsg, [String(bet), ts].filter(Boolean), 'rumbleslaughter');
    }
    if (commandName === 'rsprofile') {
      const target = opts.getUser('user') || interaction.user;
      return this.showProfile(interaction.channel, target, interaction);
    }
    if (commandName === 'rsleaderboard')   return this.showLeaderboard(fakeMsg);
    if (commandName === 'openbackpack')    return this.openBackpackCmd(interaction);
    if (commandName === 'rsinventory')     return this.showInventory(interaction);
    if (commandName === 'rsequip')         return this.equipItem(interaction, opts.getString('itemid'));
    if (commandName === 'rsjoin')          return this.handleCommand(fakeMsg, [], 'rsjoin');
    if (commandName === 'startgame')       return this.handleCommand(fakeMsg, [], 'startgame');
    if (commandName === 'cancelevent')     return this.handleCommand(fakeMsg, [], 'cancelevent');
    if (commandName === 'rig')             return this.handleCommand(fakeMsg, [`<@${opts.getUser('user').id}>`, opts.getString('level')], 'rig');
    if (commandName === 'unrig')           return this.handleCommand(fakeMsg, [`<@${opts.getUser('user').id}>`], 'unrig');
    if (commandName === 'rigrole')         return this.handleCommand(fakeMsg, [`<@&${opts.getRole('role').id}>`, opts.getString('level')], 'rigrole');
    if (commandName === 'rigrandom')       return this.handleCommand(fakeMsg, [opts.getString('state')], 'rigrandom');
    if (commandName === 'riggedmode')      return this.handleCommand(fakeMsg, [opts.getString('mode')], 'riggedmode');
    if (commandName === 'staffrole')       return this.handleCommand(fakeMsg, [`<@&${opts.getRole('role').id}>`], 'staffrole');
    if (commandName === 'givebackpack')    return this.handleCommand(fakeMsg, [`<@${opts.getUser('user').id}>`, opts.getString('type'), String(opts.getInteger('amount') || 1)], 'givebackpack');
    if (commandName === 'setemoji')        return this.setEmojiCmd(interaction, opts.getString('emoji'));
    if (commandName === 'addemoji')        return this.addEmojiCmd(interaction, opts.getString('emoji'));
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
      case 'rsequip':                     return this.equipItemMsg(message, args[0]);
      case 'startgame':                   return this.manualFire(message);
      case 'cancelevent':                 return this.cancelGame(message);
      case 'rschedule':                   return this.showSchedule(message);
      case 'rig':                         return this.rigPlayer(message, args);
      case 'unrig':                       return this.unrigPlayer(message, args);
      case 'rigrole':                     return this.rigRole(message, args);
      case 'rigrandom':                   return this.setRigRandom(message, args);
      case 'riggedmode':                  return this.setRiggedMode(message, args);
      case 'staffrole':                   return this.setStaffRole(message, args);
      case 'givebackpack':                return this.giveBackpack(message, args);
      case 'setemoji':                    return this.setEmojiMsg(message, args[0]);
      case 'addemoji':                    return this.addEmojiMsg(message, args[0]);
    }
  },

  // ── Start game ────────────────────────────────────────────────────────────────
  async startGame(message, args) {
    if (!isHost(message.member)) return message.reply(`❌ You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start Rumble Slaughter.`);
    if (activeGames.has(message.channel.id)) return message.reply('❌ There\'s already a game open here. Use `!cancelevent` first.');

    const bet    = parseInt(args[0]) || 50;
    if (bet < 10) return message.reply('❌ Minimum bet is 10 oops.');
    const tsRaw  = args.slice(1).join(' ');
    const fireAt = parseTimestamp(tsRaw);
    if (tsRaw && !fireAt) return message.reply('❌ Invalid timestamp! Use a Discord timestamp like `<t:1776177600:F>`.');
    if (fireAt && fireAt.getTime() <= Date.now()) return message.reply('❌ That timestamp is in the past!');

    // Save schedule
    const result = await db.run(
      `INSERT INTO rs_schedules (channel_id, bet, fire_at, host_id, host_name, status)
       VALUES (?, ?, ?, ?, ?, 'pending')
       ON CONFLICT (channel_id) DO UPDATE SET bet = EXCLUDED.bet, fire_at = EXCLUDED.fire_at, host_id = EXCLUDED.host_id, host_name = EXCLUDED.host_name, status = 'pending'`,
      [message.channel.id, bet, fireAt?.toISOString() || null, message.author.id, message.author.username]
    );
    const scheduleId = (await db.get('SELECT id FROM rs_schedules WHERE channel_id = ?', [message.channel.id]))?.id;

    await launchSignup(message.channel, bet, message.author.id, message.author.username, fireAt, scheduleId);
    if (fireAt) {
      await message.reply(`✅ **Rumble Slaughter** scheduled! Signups open now — arena fires at <t:${Math.floor(fireAt.getTime()/1000)}:F>.`);
    } else {
      await message.reply(`✅ **Rumble Slaughter** signup open! Use \`!startgame\` when ready to fire.`);
    }
  },

  // ── Join game ──────────────────────────────────────────────────────────────────
  async joinGame(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('❌ No open game in this channel. A host can start one with `!rumbleslaughter <bet>`.');
    if (game.phase !== 'signup') return message.reply('❌ Signups are closed — the arena is already running!');
    if (game.players.find(p => p.user_id === message.author.id)) return message.reply('⚠️ You\'re already in!');

    await economy.getUser(message.author.id, message.author.username);
    const bal = await economy.getBalance(message.author.id);
    if (bal < game.bet) return message.reply(`❌ You need **${game.bet} oops** to enter. Check \`!balance\`.`);

    await economy.removeFunds(message.author.id, game.bet, 'Rumble Slaughter entry');
    const player = await ensureRSUser(message.author.id, message.author.username);
    game.players.push(player);

    if (game.scheduleId) {
      await db.run('INSERT INTO rs_schedule_players (schedule_id, user_id, username) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
        [game.scheduleId, message.author.id, message.author.username]).catch(() => {});
    }

    if (game.message?.embeds?.[0]) {
      const updated = EmbedBuilder.from(game.message.embeds[0]).spliceFields(0, 1, {
        name: '📋 Signed Up', value: `**${game.players.length}** player${game.players.length !== 1 ? 's' : ''}`,
      });
      await game.message.edit({ embeds: [updated] }).catch(() => {});
    }
    return message.reply(`🗡️ **${message.author.username}** entered the arena! (${game.players.length} signed up)`);
  },

  // ── Manual fire ───────────────────────────────────────────────────────────────
  async manualFire(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('❌ No game scheduled in this channel.');
    if (!canCancel(message.member, game.hostId)) return message.reply('❌ Only the host or an admin can start early.');
    if (game.phase === 'running') return message.reply('❌ Already running!');
    if (game.timer) clearTimeout(game.timer);
    await message.reply('🗡️ Sealing the arena now...');
    fireGame(message.channel);
  },

  // ── Cancel ────────────────────────────────────────────────────────────────────
  async cancelGame(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('❌ No active Rumble Slaughter in this channel.');
    if (!canCancel(message.member, game.hostId)) return message.reply('❌ Only the host, admins, or server Owner can cancel.');
    if (game.phase === 'running') return message.reply('❌ The game is already running. Too late.');
    if (game.timer) clearTimeout(game.timer);
    for (const p of game.players) await economy.addFunds(p.user_id, game.bet, 'Rumble Slaughter cancelled').catch(() => {});
    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rs_join:${message.channel.id}`).setLabel('Cancelled').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await game.message?.edit({ components: [btn] }).catch(() => {});
    activeGames.delete(message.channel.id);
    if (game.scheduleId) await db.run("UPDATE rs_schedules SET status = 'cancelled' WHERE id = ?", [game.scheduleId]).catch(() => {});
    return message.reply(`✅ Rumble Slaughter cancelled. **${game.players.length}** player(s) refunded.`);
  },

  // ── Profile ───────────────────────────────────────────────────────────────────
  async showProfile(channel, user, messageOrInteraction) {
    if (!user) user = messageOrInteraction.author || messageOrInteraction.user;
    const player = await ensureRSUser(user.id, user.username);
    const inv    = await getInventory(user.id);
    const equipped = inv.find(i => i.item_id === player.equipped_weapon_id);

    const totalPower = Number(player.power) + getWeaponBonus(player.equipped_weapon_id) + (RIG_FIGHT_BONUS[player.rig_level] || 0);

    const embed = new EmbedBuilder()
      .setColor('#1a0a00')
      .setTitle(`${getDisplayName(player)} — Rumble Slaughter Profile`)
      .setThumbnail(user.displayAvatarURL?.() || null)
      .addFields(
        { name: '⚔️ Power',       value: `**${totalPower}** (base ${player.power} + weapon ${getWeaponBonus(player.equipped_weapon_id)} + rig ${RIG_FIGHT_BONUS[player.rig_level] || 0})`, inline: false },
        { name: '📈 Level / XP',  value: `Level **${player.level}** — **${player.xp}/${xpNeededForLevel(Number(player.level))} XP**`, inline: true },
        { name: '🏆 Wins',        value: `**${player.wins}**`,         inline: true },
        { name: '💀 Losses',      value: `**${player.losses}**`,       inline: true },
        { name: '🎒 Backpacks',   value: `Basic **${player.backpacks_basic}** | Royal **${player.backpacks_royal}** | Cursed **${player.backpacks_cursed}**`, inline: false },
        { name: '🗡️ Equipped',    value: equipped ? `${equipped.item_name} (+${equipped.power_bonus} power)` : 'Nothing. embarrassing.', inline: true },
        { name: '👑 Rig Level',   value: player.rig_level || 'none', inline: true },
        { name: '🎨 Emoji',       value: `${player.emoji_tag || '—'} ${player.extra_emoji || ''}`.trim() || '—', inline: true },
      )
      .setFooter({ text: `Total XP earned: ${player.total_xp} • Games played: ${player.games_played}` });

    const reply = messageOrInteraction.reply?.bind(messageOrInteraction) || (data => channel.send(data));
    return reply({ embeds: [embed] });
  },

  // ── Leaderboard ───────────────────────────────────────────────────────────────
  async showLeaderboard(message) {
    const top = await db.all('SELECT * FROM rs_players ORDER BY total_xp DESC LIMIT 10');
    if (!top.length) return message.reply('❌ No players yet!');
    const medals = ['🥇', '🥈', '🥉'];
    const rows   = top.map((p, i) =>
      `${medals[i] || `**${i+1}.**`} ${getDisplayName(p)} — **${p.total_xp} XP** | Lv **${p.level}** | **${p.wins}W ${p.losses}L**`
    ).join('\n');
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#FFD700')
        .setTitle('👑 Rumble Slaughter — XP Leaderboard')
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
      return interaction.editReply(`❌ You don't have any **${type}** backpacks! Play more games to earn them.`);
    }
    await db.run(`UPDATE rs_players SET ${col} = ${col} - 1 WHERE user_id = ?`, [interaction.user.id]);
    const item = rollBackpack(type, player.rig_level || 'none');
    await addItem(interaction.user.id, item);
    const line = pick(BACKPACK_LINES).replace('@user', `**${player.username}**`);
    return interaction.editReply({
      content:
        `🎒 ${line}\n\n` +
        `${RARITY_EMOJI[item.rarity || item.type] || '📦'} **${item.name}** *(${item.rarity || item.type})*\n` +
        `${item.powerBonus ? `⚔️ +${item.powerBonus} power\n` : ''}` +
        `${item.desc ? `*${item.desc}*` : ''}`,
    });
  },

  async openBackpackMsg(message, type) {
    if (!['basic', 'royal', 'cursed'].includes(type)) return message.reply('❌ Usage: `!openbackpack <basic|royal|cursed>`');
    const player = await ensureRSUser(message.author.id, message.author.username);
    const col    = `backpacks_${type}`;
    if (!player[col] || Number(player[col]) <= 0) return message.reply(`❌ You don't have any **${type}** backpacks!`);
    await db.run(`UPDATE rs_players SET ${col} = ${col} - 1 WHERE user_id = ?`, [message.author.id]);
    const item = rollBackpack(type, player.rig_level || 'none');
    await addItem(message.author.id, item);
    const line = pick(BACKPACK_LINES).replace('@user', `**${player.username}**`);
    return message.reply(
      `🎒 ${line}\n\n` +
      `${RARITY_EMOJI[item.rarity || item.type] || '📦'} **${item.name}** *(${item.rarity || item.type})*\n` +
      `${item.powerBonus ? `⚔️ +${item.powerBonus} power\n` : ''}` +
      `${item.desc ? `*${item.desc}*` : ''}`
    );
  },

  // ── Inventory ─────────────────────────────────────────────────────────────────
  async showInventory(interaction) {
    const inv = await getInventory(interaction.user.id);
    const player = await ensureRSUser(interaction.user.id, interaction.user.username);
    if (!inv.length) return interaction.editReply('❌ Your inventory is empty. Go win something.');
    const lines = inv.slice(0, 20).map(i =>
      `${RARITY_EMOJI[i.rarity || i.item_type] || '📦'} **${i.item_name}** \`${i.item_id}\`${i.power_bonus > 0 ? ` +${i.power_bonus}⚔️` : ''}${player.equipped_weapon_id === i.item_id ? ' *(equipped)*' : ''}`
    );
    return interaction.editReply({ content: `🗡️ **Your Inventory:**\n${lines.join('\n')}\n\nUse \`/rsequip <itemid>\` to equip a weapon.` });
  },

  async showInventoryMsg(message) {
    const inv    = await getInventory(message.author.id);
    const player = await ensureRSUser(message.author.id, message.author.username);
    if (!inv.length) return message.reply('❌ Your inventory is empty. Go win something.');
    const lines = inv.slice(0, 20).map(i =>
      `${RARITY_EMOJI[i.rarity || i.item_type] || '📦'} **${i.item_name}** \`${i.item_id}\`${i.power_bonus > 0 ? ` +${i.power_bonus}⚔️` : ''}${player.equipped_weapon_id === i.item_id ? ' *(equipped)*' : ''}`
    );
    return message.reply({ content: `🗡️ **Your Inventory:**\n${lines.join('\n')}\n\nUse \`!rsequip <itemid>\` to equip a weapon.` });
  },

  // ── Equip ─────────────────────────────────────────────────────────────────────
  async equipItem(interaction, itemId) {
    const inv  = await getInventory(interaction.user.id);
    const item = inv.find(i => i.item_id === itemId && i.item_type === 'weapon');
    if (!item) return interaction.editReply('❌ That weapon isn\'t in your inventory.');
    await db.run('UPDATE rs_players SET equipped_weapon_id = ? WHERE user_id = ?', [itemId, interaction.user.id]);
    return interaction.editReply(`✅ Equipped **${item.item_name}** (+${item.power_bonus} power).`);
  },

  async equipItemMsg(message, itemId) {
    if (!itemId) return message.reply('❌ Usage: `!rsequip <itemid>`');
    const inv  = await getInventory(message.author.id);
    const item = inv.find(i => i.item_id === itemId && i.item_type === 'weapon');
    if (!item) return message.reply('❌ That weapon isn\'t in your inventory.');
    await db.run('UPDATE rs_players SET equipped_weapon_id = ? WHERE user_id = ?', [itemId, message.author.id]);
    return message.reply(`✅ Equipped **${item.item_name}** (+${item.power_bonus} power).`);
  },

  // ── Emoji commands ─────────────────────────────────────────────────────────────
  async setEmojiCmd(interaction, emoji) {
    const player   = await ensureRSUser(interaction.user.id, interaction.user.username);
    const isAnimated = /^<a?:\w+:\d+>$/.test(emoji);
    if (isAnimated && Number(player.level) < 10) return interaction.editReply(`❌ Animated emojis unlock at level 10. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET emoji_tag = ? WHERE user_id = ?', [emoji, interaction.user.id]);
    return interaction.editReply(`✅ Primary emoji set to ${emoji}!`);
  },

  async setEmojiMsg(message, emoji) {
    if (!emoji) return message.reply('❌ Usage: `!setemoji <emoji>`');
    const player   = await ensureRSUser(message.author.id, message.author.username);
    const isAnimated = /^<a?:\w+:\d+>$/.test(emoji);
    if (isAnimated && Number(player.level) < 10) return message.reply(`❌ Animated emojis unlock at level 10. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET emoji_tag = ? WHERE user_id = ?', [emoji, message.author.id]);
    return message.reply(`✅ Primary emoji set to ${emoji}!`);
  },

  async addEmojiCmd(interaction, emoji) {
    const player = await ensureRSUser(interaction.user.id, interaction.user.username);
    if (Number(player.level) < 20) return interaction.editReply(`❌ Second emoji slot unlocks at level 20. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET extra_emoji = ? WHERE user_id = ?', [emoji, interaction.user.id]);
    return interaction.editReply(`✅ Extra emoji set to ${emoji}!`);
  },

  async addEmojiMsg(message, emoji) {
    if (!emoji) return message.reply('❌ Usage: `!addemoji <emoji>`');
    const player = await ensureRSUser(message.author.id, message.author.username);
    if (Number(player.level) < 20) return message.reply(`❌ Second emoji slot unlocks at level 20. You're level ${player.level}.`);
    await db.run('UPDATE rs_players SET extra_emoji = ? WHERE user_id = ?', [emoji, message.author.id]);
    return message.reply(`✅ Extra emoji set to ${emoji}!`);
  },

  // ── Admin: rig ─────────────────────────────────────────────────────────────────
  async rigPlayer(message, args) {
    if (!isHost(message.member)) return message.reply('❌ Admin only.');
    const target = message.mentions?.users?.first();
    const level  = args[1]?.toLowerCase();
    if (!target || !['petty','favorite','maincharacter','none'].includes(level))
      return message.reply('❌ Usage: `!rig @user <petty|favorite|maincharacter|none>`');
    await ensureRSUser(target.id, target.username);
    await db.run('UPDATE rs_players SET rig_level = ? WHERE user_id = ?', [level, target.id]);
    return message.reply(`✅ **${target.username}** rig level set to **${level}**.`);
  },

  async unrigPlayer(message, args) {
    if (!isHost(message.member)) return message.reply('❌ Admin only.');
    const target = message.mentions?.users?.first();
    if (!target) return message.reply('❌ Usage: `!unrig @user`');
    await db.run('UPDATE rs_players SET rig_level = ? WHERE user_id = ?', ['none', target.id]);
    return message.reply(`✅ **${target.username}** is no longer rigged.`);
  },

  async rigRole(message, args) {
    if (!isHost(message.member)) return message.reply('❌ Admin only.');
    const role  = message.mentions?.roles?.first();
    const level = args[1]?.toLowerCase();
    if (!role || !['petty','favorite','maincharacter','off','none'].includes(level))
      return message.reply('❌ Usage: `!rigrole @role <petty|favorite|maincharacter|off>`');
    if (level === 'off' || level === 'none') {
      await db.run('DELETE FROM rs_rigged_roles WHERE role_id = ?', [role.id]);
      return message.reply(`✅ Rig removed from role **${role.name}**.`);
    }
    await db.run(
      'INSERT INTO rs_rigged_roles (role_id, role_name, rig_level) VALUES (?, ?, ?) ON CONFLICT (role_id) DO UPDATE SET rig_level = EXCLUDED.rig_level',
      [role.id, role.name, level]
    );
    return message.reply(`✅ Role **${role.name}** rigged to **${level}**.`);
  },

  async setRigRandom(message, args) {
    if (!isHost(message.member)) return message.reply('❌ Admin only.');
    const state = args[0]?.toLowerCase() === 'on';
    await setSetting('rigrandom', state);
    return message.reply(`✅ Rigrandom is now **${state ? 'ON' : 'OFF'}**. ${state ? 'One secret chosen menace will be picked each game.' : ''}`);
  },

  async setRiggedMode(message, args) {
    if (!isHost(message.member)) return message.reply('❌ Admin only.');
    const mode = args[0]?.toLowerCase();
    if (!['public','hidden'].includes(mode)) return message.reply('❌ Usage: `!riggedmode <public|hidden>`');
    await setSetting('riggedmode', mode);
    return message.reply(`✅ Rigged mode announcements set to **${mode}**.`);
  },

  async setStaffRole(message, args) {
    if (!isHost(message.member)) return message.reply('❌ Admin only.');
    const role = message.mentions?.roles?.first();
    if (!role) return message.reply('❌ Usage: `!staffrole @role`');
    await setSetting('staff_role_id', role.id);
    return message.reply(`✅ Staff role set to **${role.name}**. They'll get Petty privileges in Staff vs Members events.`);
  },

  async giveBackpack(message, args) {
    if (!isHost(message.member)) return message.reply('❌ Admin only.');
    const target = message.mentions?.users?.first();
    const type   = args[1]?.toLowerCase();
    const amount = parseInt(args[2]) || 1;
    if (!target || !['basic','royal','cursed'].includes(type))
      return message.reply('❌ Usage: `!givebackpack @user <basic|royal|cursed> [amount]`');
    await ensureRSUser(target.id, target.username);
    const col = `backpacks_${type}`;
    await db.run(`UPDATE rs_players SET ${col} = ${col} + ? WHERE user_id = ?`, [amount, target.id]);
    return message.reply(`✅ Gave **${amount} ${type}** backpack(s) to **${target.username}**.`);
  },

  // ── Schedule info ──────────────────────────────────────────────────────────────
  async showSchedule(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply('❌ No Rumble Slaughter scheduled in this channel.\n\nStart one with `!rumbleslaughter <bet> [timestamp]`.');
    const tsUnix = game.fireAt ? Math.floor(game.fireAt.getTime() / 1000) : null;
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#1a0a00')
        .setTitle('🗡️ Rumble Slaughter — Schedule')
        .addFields(
          { name: '💰 Entry',     value: `${game.bet} oops`,            inline: true },
          { name: '👥 Signed Up', value: `${game.players.length}`,       inline: true },
          { name: '📊 Phase',     value: game.phase,                     inline: true },
          { name: '⏰ Fires At',  value: tsUnix ? `<t:${tsUnix}:F> (<t:${tsUnix}:R>)` : 'Manual (`!startgame`)', inline: false },
          { name: '👤 Host',      value: game.hostName,                  inline: true },
        )
        .setFooter({ text: '!startgame to fire now • !cancelevent to cancel' })
    ]});
  },
};
