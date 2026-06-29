'use strict';
/**
 * src/games/regretgames.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAY & REGRET: THE REGRET GAMES — "You Chose This."
 *
 * Multi-day survival game. Players pay entry, survive daily events,
 * vote each other out, betray alliances, buy power-ups.
 * Last player standing wins 90% of the pot. 10% goes to jackpot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { db, economy } = require('../utils/database');
const jackpot = require('../utils/jackpot');
const story   = require('./rg_story');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const JACKPOT_TAX   = 0.10;
const ROUND_MS      = 30  * 1000;  // 30 sec after Day 1 before Day 2
const VOTE_MS       = 3  * 60 * 1000;  // 3 min voting window
const activeRGGames = new Map();        // guildId → timer handles

// ─── DAY NAMES ────────────────────────────────────────────────────────────────
const DAY_NAMES = [
  null, // index 0 unused
  'Confession Phase',
  'Hunger Sets In',
  'Betrayal Wave',
  'Chaos & Massacre',
  'Regret Roulette',
  'Chaos & Betrayal',
  'The Final Day',
];

// ─── GIF URLS ─────────────────────────────────────────────────────────────────
const GIFS = {
  massacre:        'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeDg2eHdoNGZ4eHVsZXJnd3lxaHdhdnZjazRtN281cTlhM3BpNGVtNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/meureda0Lf9l7oj79s/giphy.gif',
  winner:          'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExanZlNTdqaHBkZHN2NTlhaDhwZ3g5bDA2eTlyMDBieWE1c3c2MjM4eiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/e3C5EBaE2mS0YKj2Pe/giphy.gif',
  day1:            'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWZwcjJvcTk1bW1rajRoNXRkMHZ6Z2oybTFqOXJsMWY3d3FtdWJkNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/etMl0Pc2dgqRroVn4h/giphy.gif',
  day2:            'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzViMjR5cXB2ejR4YjNjb21kOXl2d3M5a2s1MTBjbHJuMnptcDN5NSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/BnMHx8Mi4hkicYF69h/giphy.gif',
  day3:            'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExYjhvNTZieGs3emt4cDQ1ZHViemN4dWlhNmYxenRuNjQ2bGFncmo1MSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/bjGHlr6e0YVCu1ipRk/giphy.gif',
  day4:            'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExNnNreHNreHcyMWU5bTBjY2ZrMXN6eDY1MndneDNsZ2RnYmUwaXgxMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/f2M3cJukRcucmYOiOJ/giphy.gif',
  day5:            'https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMHAxam90eW4yZzJqdjNzcDhraTA2bXR3anczN3pmNnh4YjAweXpwMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/nViUeypEXXM0pvZv2B/giphy.gif',
  day6:            'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTBqZzlqcHZyMmQ4M25raGZmc2xtMjJtdDY0MjY3ZHBsdnBiamlhdCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/TCcDFRHaiymm5iU8BJ/giphy.gif',
  day7_blessing:   'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWFsazA3MHRyeG82Y3kwZzlldTFjbTA3cHR6NWFtcThjbHF2a3o3ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4e1DovJU64hl1tmEHW/giphy.gif',
  day7_roulette:   'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWwwOGVlb2c4dGdjOTR0MHZ4eGNhOW90NHZwYWFxeTJzYXpwcDVieSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/md1iaUs3ofUhiiXrge/giphy.gif',
};

function getDayGif(day) {
  return [GIFS.day1, GIFS.day2, GIFS.day3, GIFS.day4, GIFS.day5, GIFS.day6, GIFS.day7][day - 1] || null;
}

function getDayName(day) {
  return DAY_NAMES[day] ? `Day ${day}: ${DAY_NAMES[day]}` : `Day ${day}`;
}
const DEFAULT_FEE   = 500;
const COOLDOWNS     = new Map(); // key: `${userId}:${action}` → timestamp

// ─── SHOP ITEMS ───────────────────────────────────────────────────────────────
const SHOP_ITEMS = {
  crown_shield:     { name: 'Crown Shield',            cost: 500,  desc: 'Blocks one event-based attack. Consumed on use.' },
  rotten_favor:     { name: 'Rotten Favor',            cost: 300,  desc: 'Reduces REGRET from the next event that hits you by 50%.' },
  fake_apology:     { name: 'Fake Apology',            cost: 250,  desc: 'Reduces your REGRET by 100.' },
  snake_pass:       { name: 'Snake Pass',              cost: 400,  desc: 'Betray without REGRET penalty.' },
  hunger_crumb:     { name: 'Hunger Crumb',            cost: 150,  desc: 'Prevents starvation for one day.' },
  humiliation_pass: { name: 'Public Humiliation Pass', cost: 600,  desc: 'Bot publicly roasts a target.' },
  last_laugh:       { name: 'Last Laugh',              cost: 800,  desc: 'When you die, deal 200 REGRET to a random survivor.' },
  queens_insurance: { name: "Queen\'s Insurance",       cost: 1200, desc: 'One-time save from elimination.' },
};

// ─── EVENT TYPES (for dropdown) ───────────────────────────────────────────────
const EVENT_TYPES = {
  hunger:    { label: '<a:BBQ:1497476838367170710> Hunger Event',      desc: 'Players without food lose REGRET and SINS.' },
  chaos:     { label: '<:purp_caveira50:1495665632845369354> Chaos Event',       desc: 'Bot randomly targets 1-3 players with negative effects.' },
  betrayal:  { label: '<a:snake12:1497477227963613334> Betrayal Wave',     desc: 'Random alliances are exposed or broken.' },
  blessing:  { label: '<a:purplesparkle:1479210541691175054> Queen\'s Blessing', desc: 'Bot randomly boosts 1-2 players.' },
  massacre:  { label: '<:sword:1495666991187361943> Massacre',          desc: 'Bot eliminates 2-3 random players dramatically.' },
  roulette:  { label: '<a:jackpot:1479203793806557385> Regret Roulette',   desc: 'Random player gains or loses massive REGRET.' },
  theft:     { label: '<a:583778moneyfly:1479271753392853023> Mass Theft',        desc: 'Random player has their SINS redistributed.' },
  confession:{ label: '<a:SS_PurpleCandles:1497476841433464873> Confession Phase',  desc: 'Bot reveals random betrayals and vote history.' },
};

// ─── INSULT POOLS ─────────────────────────────────────────────────────────────
const INSULTS_LOW = [
  'You joined. That was your first mistake.',
  'Bold of you to participate with that strategy.',
  'Confidence detected. Evidence not found.',
  'You clicked the button like consequences don\'t exist.',
  'You\'re doing your best. Unfortunately.',
  'The arena noticed you. It was disappointed.',
  'You survived. Barely. Don\'t make it your personality.',
  'Regret has entered the chat.',
  'You are currently useful as background noise.',
  'Your villain arc has budget cuts.',
  'You have potential. Unfortunately, so does mold.',
  'You thought this was casual. That\'s adorable.',
  'The bot is watching. Not impressed.',
  'You are not in danger. You are the inconvenience.',
];

const INSULTS_MED = [
  'You keep making decisions like you\'re unsupervised.',
  'Your plan has the structural integrity of wet paper.',
  'Someone has to be the example. It\'s looking like you.',
  'You are currently surviving on delusion and crumbs.',
  'Your strategy is giving "panic with accessories."',
  'You survived the round. Somehow, that feels illegal.',
  'You are not the main character. You are plot filler.',
  'You aimed for power and landed in public shame.',
  'You\'re playing chess. Everyone else brought fire.',
  'Your confidence needs a refund.',
  'Every move you make becomes evidence.',
  'You trusted someone. Rookie behavior.',
];

const INSULTS_HIGH = [
  'You\'re not losing. You\'re decomposing competitively.',
  'Your alliance has you on mute spiritually.',
  'You entered the arena and became a cautionary tale.',
  'You have the survival instincts of a decorative pillow.',
  'You are one betrayal away from becoming server lore.',
  'Your downfall has pacing issues, but we\'re invested.',
  'You are getting dragged by math and consequences.',
  'You\'re not targeted because you\'re dangerous. You\'re convenient.',
  'Your gameplay is a group project nobody wants credit for.',
  'You\'re surviving like a roach with Wi-Fi.',
  'You are the reason warning labels exist.',
  'Your regret is no longer a stat. It\'s a lifestyle.',
];

const INSULTS_MAX = [
  'You are the final form of bad choices.',
  'The arena did not eliminate you. It corrected itself.',
  'Your legacy is "joined, suffered, became content."',
  'Nobody avenged you. Please sit with that.',
  'You were not robbed. You were repossessed.',
  'Your entire run was a sponsored ad for consequences.',
  'You have achieved maximum regret. Horrifying. Iconic.',
  'You are no longer a player. You are evidence.',
  'Your downfall came pre-approved.',
  'You lost so loudly it became atmospheric.',
  'You did not survive. You were tolerated temporarily.',
  'You thought you ate. The plate was empty.',
  'Congratulations. You honored the name: Play & Regret.',
];

const TITLES = [
  'Community Warning Sign',
  'Professional Victim',
  'Decorative Threat',
  'Betrayal Intern',
  'Main Character by Accident',
  'Spiritually Eliminated',
  'Surviving Incorrectly',
  'Crown Clown',
  'Tax Write-Off',
  'Certified Problem',
  'Public Mistake',
  'Villain With No Budget',
  'Emotionally Repossessed',
  'The Final Bad Decision',
  'Regret in Progress',
  'Professionally Eliminated',
  'Lost the Plot',
  'Came for the Drama',
  'Budget Villain',
  'Tried Their Best',
];


// ─── HELPERS ──────────────────────────────────────────────────────────────────
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms  => new Promise(r => setTimeout(r, ms));

function getInsult(regret) {
  if (regret < 300)  return pick(INSULTS_LOW);
  if (regret < 700)  return pick(INSULTS_MED);
  if (regret < 1200) return pick(INSULTS_HIGH);
  return pick(INSULTS_MAX);
}

function setCooldown(userId, action, ms) {
  COOLDOWNS.set(`${userId}:${action}`, Date.now() + ms);
}

function getCooldownLeft(userId, action) {
  const exp = COOLDOWNS.get(`${userId}:${action}`) || 0;
  return Math.max(0, exp - Date.now());
}

function fmtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const staffRoles = ['Admin', 'Mod', 'Staff', 'Event Host', process.env.ADMIN_ROLE].filter(Boolean);
  return member.roles.cache.some(r => staffRoles.includes(r.name));
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
async function getActiveSeason(guildId) {
  return db.get("SELECT * FROM rg_seasons WHERE guild_id = $1 AND status != 'ended' ORDER BY id DESC LIMIT 1", [guildId]);
}

async function getPlayer(seasonId, userId) {
  return db.get('SELECT * FROM rg_players WHERE season_id = $1 AND user_id = $2', [seasonId, userId]);
}

async function getAlivePlayers(seasonId) {
  return db.all("SELECT * FROM rg_players WHERE season_id = $1 AND status = 'alive' ORDER BY regret DESC", [seasonId]);
}

async function getAllPlayers(seasonId) {
  return db.all('SELECT * FROM rg_players WHERE season_id = $1 ORDER BY regret DESC', [seasonId]);
}

async function updatePlayer(seasonId, userId, fields) {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const vals = [...Object.values(fields), seasonId, userId];
  return db.run(`UPDATE rg_players SET ${sets} WHERE season_id = $1 AND user_id = $2`, vals);
}

async function addRegret(seasonId, userId, amount) {
  return db.run('UPDATE rg_players SET regret = regret + $1 WHERE season_id = $2 AND user_id = $3', [amount, seasonId, userId]);
}

async function addSins(seasonId, userId, amount) {
  return db.run('UPDATE rg_players SET sins_earned = sins_earned + $1 WHERE season_id = $2 AND user_id = $3', [amount, seasonId, userId]);
}

async function eliminatePlayer(seasonId, userId, cause) {
  return db.run(
    "UPDATE rg_players SET status = 'eliminated', elim_cause = $1, elim_day = (SELECT current_day FROM rg_seasons WHERE id = $2) WHERE season_id = $3 AND user_id = $4",
    [cause, seasonId, seasonId, userId]
  );
}

async function getInventory(seasonId, userId) {
  const rows = await db.all('SELECT * FROM rg_inventory WHERE season_id = $1 AND user_id = $2', [seasonId, userId]);
  const inv = {};
  for (const row of rows) inv[row.item_id] = row.qty;
  return inv;
}

async function hasItem(seasonId, userId, itemId) {
  const row = await db.get('SELECT qty FROM rg_inventory WHERE season_id = $1 AND user_id = $2 AND item_id = $3', [seasonId, userId, itemId]);
  return row && row.qty > 0;
}

async function removeItem(seasonId, userId, itemId) {
  return db.run('UPDATE rg_inventory SET qty = qty - 1 WHERE season_id = $1 AND user_id = $2 AND item_id = $3 AND qty > 0', [seasonId, userId, itemId]);
}

async function addItem(seasonId, userId, itemId) {
  const existing = await db.get('SELECT id FROM rg_inventory WHERE season_id = $1 AND user_id = $2 AND item_id = $3', [seasonId, userId, itemId]);
  if (existing) return db.run('UPDATE rg_inventory SET qty = qty + 1 WHERE season_id = $1 AND user_id = $2 AND item_id = $3', [seasonId, userId, itemId]);
  return db.run('INSERT INTO rg_inventory (season_id, user_id, item_id, qty) VALUES ($1, $2, $3, 1)', [seasonId, userId, itemId]);
}

async function getAlliance(seasonId, userA, userB) {
  return db.get(
    "SELECT * FROM rg_alliances WHERE season_id = $1 AND ((user_a = $2 AND user_b = $3) OR (user_a = $4 AND user_b = $5)) AND status = 'active'",
    [seasonId, userA, userB, userB, userA]
  );
}

async function getPlayerAlliance(seasonId, userId) {
  return db.get(
    "SELECT * FROM rg_alliances WHERE season_id = $1 AND (user_a = $2 OR user_b = $3) AND status = 'active'",
    [seasonId, userId, userId]
  );
}

async function getArenaChannel(season, client) {
  try { return await client.channels.fetch(season.arena_channel_id); } catch { return null; }
}

async function getVotesChannel(season, client) {
  try { return await client.channels.fetch(season.votes_channel_id); } catch { return null; }
}

// ─── BOUNTY RESOLUTION ────────────────────────────────────────────────────────
async function resolveRGBounties(channelId, eliminatedId, eliminatedName, eliminatorId, eliminatorName, cause, channel) {
  try {
    const bounties = await db.all(
      "SELECT * FROM rs_bounties WHERE channel_id = $1 AND claimed_at IS NULL",
      [channelId]
    );
    if (!bounties.length) return;

    const claimed = [];
    const voided  = [];

    for (const b of bounties) {
      // Kill bounty — someone eliminated the target
      if (b.type === 'kill' && b.target_id === eliminatedId && eliminatorId) {
        await db.run(
          "UPDATE rs_bounties SET claimed_by = $1, claimed_name = $2, claimed_at = NOW() WHERE id = $3",
          [eliminatorId, eliminatorName, b.id]
        );
        claimed.push({ b, claimerName: eliminatorName });
      }
      // Death bounty — Nth person to die (tracked by checking total elims)
      else if (b.type === 'death' && b.target_id === eliminatedId) {
        await db.run(
          "UPDATE rs_bounties SET claimed_by = $1, claimed_name = $2, claimed_at = NOW() WHERE id = $3",
          [eliminatedId, eliminatedName, b.id]
        );
        claimed.push({ b, claimerName: eliminatedName });
      }
      // Void — target eliminated by chaos/event (no killer)
      else if (b.type === 'kill' && b.target_id === eliminatedId && !eliminatorId) {
        const voidReason = cause || 'eliminated by chaos';
        await db.run(
          "UPDATE rs_bounties SET claimed_by = 'void', claimed_name = 'void', claimed_at = NOW(), void_reason = $1 WHERE id = $2",
          [voidReason, b.id]
        );
        voided.push({ b, reason: voidReason });
      }
      // Winner bounty — check at game end separately
    }

    if (claimed.length || voided.length) {
      const lines = [
        ...claimed.map(({ b, claimerName }) =>
          `<:checkmark:1495666088417956002> **${claimerName}** claimed bounty on **${b.target_name}** → prize: **${b.prize}** (from: ${b.payee || 'n/a'})`
        ),
        ...voided.map(({ b, reason }) =>
          `VOID — @${b.target_name} (${reason}) → prize: **${b.prize}** (from: ${b.payee || 'n/a'})`
        ),
      ];
      await channel.send({ embeds: [
        new EmbedBuilder().setColor('#FF00AA')
          .setTitle('<a:target:1495665634279821485> Bounty Update')
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Bounty rewards are paid manually by the listed payee.' })
      ]}).catch(() => {});
    }
  } catch(e) {
    console.error('[RG] bounty resolve error:', e);
  }
}

async function resolveRGWinnerBounties(channelId, winnerId, winnerName, channel) {
  try {
    const bounties = await db.all(
      "SELECT * FROM rs_bounties WHERE channel_id = $1 AND type = 'winner' AND claimed_at IS NULL",
      [channelId]
    );
    if (!bounties.length) return;

    for (const b of bounties) {
      await db.run(
        "UPDATE rs_bounties SET claimed_by = $1, claimed_name = $2, claimed_at = NOW() WHERE id = $3",
        [winnerId, winnerName, b.id]
      );
    }

    const lines = bounties.map(b =>
      `<:checkmark:1495666088417956002> **${winnerName}** won the match → prize: **${b.prize}** (from: ${b.payee || 'n/a'})`
    );

    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FF00AA')
        .setTitle('<a:target:1495665634279821485> Winner Bounty Claimed')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Bounty rewards are paid manually by the listed payee.' })
    ]}).catch(() => {});
  } catch(e) {
    console.error('[RG] winner bounty resolve error:', e);
  }
}

// ─── STORY LINE POOLS ─────────────────────────────────────────────────────────

const HUNGER_OPENERS = [
  'The food ran out. The arena is not apologizing.',
  'Rations: gone. Dignity: going. The chaos has started and it smells like hunger.',
  'Nobody ate today. Some by choice. Most by consequence.',
  'The hunger hit different today. So did the attitude.',
  'The arena cut the food supply. No warning. No explanation. Classic.',
  'There is nothing left to eat. There is plenty left to regret.',
  'Day started with empty stomachs and full resentment. As expected.',
];

const HUNGER_DRAMA = [
  (a, b) => `*Earlier, **${a}** ate the last snack and didn\'t offer **${b}** any. **${b}** has not forgotten. Will not forget.*`,
  (a, b) => `***${a}** found a granola bar in their pocket. **${b}** watched them eat it in silence. The silence was violent.*`,
  (a, b) => `***${b}** asked **${a}** if they had food. **${a}** said no. They were lying. There were crumbs on their shirt.*`,
  (a, b) => `***${a}** and **${b}** made a deal to split food. **${a}** ate it all at 3am. **${b}** woke up and noticed.*`,
  (a, b) => `*Someone stole **${b}**\'s last snack. **${a}** has crumbs on their face. Nobody said anything. Everyone noticed.*`,
  (a, b) => `***${a}** offered **${b}** a piece of bread. It was stale. **${b}** ate it and said thank you. Inside they were furious.*`,
  (a, b) => `***${b}** was so hungry they bit **${a}**\'s arm. **${a}** screamed. **${b}** said sorry. They were not sorry.*`,
  (a, b) => `***${a}** licked the last crumbs off a wrapper while **${b}** watched. **${b}** is now reconsidering every alliance.*`,
  (a, b) => `***${a}** and **${b}** both reached for the last piece of food at the same time. They stared at each other. **${a}** won. Barely.*`,
  (a, b) => `***${b}** cried a little. **${a}** handed them a napkin. It was sweet until **${a}** ate the last cracker right after.*`,
  (a, b) => `***${a}** said they weren\'t hungry. **${b}** believed them. **${a}** ate an entire hidden snack in the bathroom at midnight.*`,
  (a, b) => `***${b}** smelled something. It was **${a}** eating secretly in the corner. **${b}** watched. Said nothing. Remembered everything.*`,
];

const HUNGER_SURVIVE = [
  p => `<a:purplesparkle:1479210541691175054> **${p}** pulled a snack from somewhere suspicious and ate it aggressively. Survived. Zero regrets. Zero explanations.`,
  p => `<a:purplesparkle:1479210541691175054> **${p}** had a Hunger Crumb hidden in their sock. Nobody asked. They ate it. They\'re fine.`,
  p => `<a:purplesparkle:1479210541691175054> **${p}** came prepared. Hunger Crumb consumed. The others stared. **${p}** did not share.`,
  p => `<a:purplesparkle:1479210541691175054> **${p}** produced a snack like a magician. Ate it in front of everyone. Survived. Smiled. Annoying.`,
  p => `<a:purplesparkle:1479210541691175054> **${p}** survived hunger. Didn\'t explain how. The others are suspicious and also jealous.`,
];

const HUNGER_STARVE = [
  p => `<:purp_caveira50:1495665632845369354> **${p}** starved. +90 REGRET. -50 sins. The arena logged this under "predictable outcome."`,
  p => `<:purp_caveira50:1495665632845369354> **${p}** had nothing. Ate their dignity instead. It was not filling. +90 REGRET. -50 sins.`,
  p => `<:purp_caveira50:1495665632845369354> **${p}** looked around for food. Found consequences. +90 REGRET. -50 sins.`,
  p => `<:purp_caveira50:1495665632845369354> **${p}** starved and had the nerve to look surprised. +90 REGRET. -50 sins.`,
  p => `<:purp_caveira50:1495665632845369354> **${p}** is starving. Someone nearby considered helping. Reconsidered. Walked away. +90 REGRET. -50 sins.`,
  p => `<:purp_caveira50:1495665632845369354> **${p}** announced they were fine. They were not fine. +90 REGRET. -50 sins.`,
  p => `<:purp_caveira50:1495665632845369354> **${p}** tried to steal food and found nothing. Pride: gone. Sins: -50. Regret: +90.`,
  p => `<:purp_caveira50:1495665632845369354> **${p}** sobbed quietly into their empty bowl. The arena watched. The arena felt nothing. +90 REGRET. -50 sins.`,
];

const HUNGER_CLOSINGS = [
  (a, b) => `*Later, **${a}** and **${b}** stared at each other across the arena. Nobody spoke. Both were already planning.*`,
  (a, b) => `***${a}** patted **${b}**\'s shoulder and said "we\'ll get through this." **${b}** nodded. **${a}** is already plotting.*`,
  (a, b) => `*The hunger made alliances feel closer and threats feel closer too. **${a}** is watching **${b}**. **${b}** knows.*`,
  (a, b) => `***${a}** hugged **${b}** for comfort. It was a real hug. The arena didn\'t trust it.*`,
  (a, b) => `*At some point **${a}** kissed **${b}** on the cheek and said "for luck." **${b}** blushed. Both are still starving.*`,
  (a, b) => `*The only thing keeping **${a}** and **${b}** from fighting is the fact that neither has the energy. Yet.*`,
  (a, b) => `***${b}** cried. **${a}** held them. Then immediately started thinking about how to vote them out.*`,
  (a, b) => `*Somewhere in the dark, **${a}** whispered something to **${b}**. The arena caught none of it. That\'s the point.*`,
];

const CHAOS_OPENERS = [
  'The arena decided it was time to intervene. Personally.',
  'Chaos arrived without a schedule. It never does.',
  'Something shifted. The unlucky ones felt it first.',
  'The arena picked today to be dramatic. Nobody was ready.',
  'No warning. No reason. Just consequences.',
  'The arena got bored and pointed at people. As it does.',
  'Today the arena woke up violent. Some of you paid for it.',
];

const CHAOS_HIT_REGRET = [
  (p, w) => `<:purp_caveira50:1495665632845369354> **${p}** was hit by chaos. +150 REGRET. **${w}** watched and took a quiet step backwards.`,
  (p, w) => `<:purp_caveira50:1495665632845369354> The arena pointed at **${p}**. +150 REGRET. **${w}** made eye contact with them and immediately looked away.`,
  (p, w) => `<:purp_caveira50:1495665632845369354> **${p}** got chaos-targeted. +150 REGRET. Somewhere, **${w}** exhaled. It wasn\'t them. This time.`,
  (p, w) => `<:purp_caveira50:1495665632845369354> **${p}** felt something go wrong before they could react. +150 REGRET. **${w}** nodded like they expected it.`,
  (p, w) => `<:purp_caveira50:1495665632845369354> **${p}** got hit. +150 REGRET. **${w}** sent them a sympathetic look. It was mostly fake.`,
  (p, w) => `<:purp_caveira50:1495665632845369354> The chaos found **${p}** specifically. +150 REGRET. **${w}** said "that\'s rough." Did not help.`,
  (p, w) => `<:purp_caveira50:1495665632845369354> **${p}** got caught in the chaos radius. +150 REGRET. **${w}** whispered "glad it wasn\'t me" under their breath.`,
];

const CHAOS_HIT_SINS = [
  (p, w) => `<a:moneybag:1479268556687540345> **${p}** lost 100 sins to chaos. **${w}** nearby pretended not to notice. They absolutely noticed.`,
  (p, w) => `<a:moneybag:1479268556687540345> The arena taxed **${p}** 100 sins. **${w}** saw it happen and immediately started recalculating alliances.`,
  (p, w) => `<a:moneybag:1479268556687540345> **${p}**\'s sins went somewhere. The arena won\'t say where. **${w}** has a guess. -100 sins.`,
  (p, w) => `<a:moneybag:1479268556687540345> **${p}** lost 100 sins. **${w}** patted them on the back. Kept their hand there a second too long. Suspicious.`,
  (p, w) => `<a:moneybag:1479268556687540345> 100 sins left **${p}**\'s account in a way they didn\'t consent to. **${w}** watched and said "that sucks." Moved on immediately.`,
];

const CHAOS_CLOSINGS = [
  (w, h) => `*The chaos passed. **${w}** looked at **${h}** and said nothing. But they were thinking everything.*`,
  (w, h) => `***${w}** grabbed **${h}**\'s arm and pulled them close after the chaos hit. "We\'re okay," they said. Neither of them was okay.*`,
  (w, h) => `*After the chaos, **${h}** and **${w}** sat together in silence. It was either solidarity or strategy. Probably both.*`,
  (w, h) => `***${w}** leaned against **${h}**\'s shoulder. **${h}** let them. The arena filed this under "temporary."*`,
  (w, h) => `***${h}** whispered something to **${w}** right after the chaos. **${w}** laughed. Nobody else knew what was said.*`,
  (w, h) => `*The dust settled. **${w}** was already making a list. **${h}** was already on it.*`,
];

const BLESSING_OPENERS = [
  'The arena decided to be kind today. Do not get used to it.',
  'The Queen blessed someone. The jealousy is already spreading.',
  'Favor fell on the undeserving. As it tends to.',
  'The arena gave someone a gift. The others received the gift of resentment.',
  'Today someone got lucky. The others got to watch.',
  'Unexpected generosity from the arena. Everyone is suspicious.',
];

const BLESSING_LINES = [
  (p, j) => `<a:purplesparkle:1479210541691175054> **${p}** received the Queen\'s blessing. +200 sins. **${j}** clapped slowly. Once. With no enthusiasm.`,
  (p, j) => `<a:purplesparkle:1479210541691175054> The arena chose **${p}**. +200 sins. **${j}** watched and immediately started questioning every life choice.`,
  (p, j) => `<a:purplesparkle:1479210541691175054> **${p}** got blessed. +200 sins. They looked surprised. **${j}** was not surprised. **${j}** was furious.`,
  (p, j) => `<a:purplesparkle:1479210541691175054> **${p}** got 200 sins dropped in their lap. **${j}** smiled through it. The smile did not reach the eyes.`,
  (p, j) => `<a:purplesparkle:1479210541691175054> The blessing landed on **${p}**. +200 sins. **${j}** said "you deserve it!" and then went and cried in private.`,
  (p, j) => `<a:purplesparkle:1479210541691175054> **${p}** was chosen. +200 sins. **${j}** hugged them and said congrats. Made a mental note to vote them out tomorrow.`,
  (p, j) => `<a:purplesparkle:1479210541691175054> The Queen smiled at **${p}** specifically. +200 sins. **${j}** asked "why them?" The arena did not respond.`,
];

const BLESSING_ENVY = [
  (j, p) => `*Later, **${j}** asked **${p}** if they\'d share the blessing. **${p}** said "of course." They did not share.*`,
  (j, p) => `***${j}** and **${p}** hugged after the blessing was announced. It was warm. **${j}** was seething internally.*`,
  (j, p) => `***${j}** stared at **${p}** for a long moment. Then said "good for you" and walked away with the energy of someone planning something.*`,
  (j, p) => `*The jealousy in **${j}**\'s eyes could power a small city. **${p}** chose not to notice.*`,
  (j, p) => `***${j}** kissed **${p}** on the cheek to congratulate them. It felt like a threat.*`,
  (j, p) => `***${p}** offered to split the blessing with **${j}**. **${j}** said no out of pride. Immediately regretted it.*`,
  (j, p) => `*The arena watched **${j}** write **${p}**\'s name on an invisible list. The pen was metaphorical. The list was real.*`,
];

const MASSACRE_OPENERS = [
  'The arena grew impatient. The numbers needed to go down.',
  'Nobody saw it coming. The arena planned it that way.',
  'The massacre announcement came without warning. That was intentional.',
  'The arena decided some people needed to go. It made a list. It checked it once.',
  'Too many players. Not enough drama. The arena corrected this.',
  'The arena scheduled a cleanup. It did not ask for input.',
  'The arena got tired of waiting. So it stopped waiting.',
];

const MASSACRE_ELIMINATED = [
  (p, sur, regret, title) => `<:purp_caveira50:1495665632845369354> **${p}** was selected.\n> *${regret}*\n> **${sur}** watched it happen. Said nothing. Already planning who\'s next.\n> Final title: **${title}**`,
  (p, sur, regret, title) => `<:purp_caveira50:1495665632845369354> **${p}** got called.\n> *${regret}*\n> **${sur}** turned away. Couldn\'t watch. Or didn\'t want to be associated.\n> Final title: **${title}**`,
  (p, sur, regret, title) => `<:purp_caveira50:1495665632845369354> The arena picked **${p}**.\n> *${regret}*\n> **${sur}** reached out to touch their arm as they left. **${p}** didn\'t look back.\n> Final title: **${title}**`,
  (p, sur, regret, title) => `<:purp_caveira50:1495665632845369354> **${p}** didn\'t see it coming.\n> *${regret}*\n> **${sur}** had seen it coming since Day 1. Said nothing.\n> Final title: **${title}**`,
  (p, sur, regret, title) => `<:purp_caveira50:1495665632845369354> **${p}** was eliminated without ceremony.\n> *${regret}*\n> **${sur}** whispered "I\'m sorry" under their breath. Immediately started calculating odds.\n> Final title: **${title}**`,
];

const MASSACRE_SURVIVOR = [
  (s, v) => `*The arena went quiet. **${s}** looked at where **${v}** used to be standing. Looked away. Kept moving.*`,
  (s, v) => `***${s}** picked up something **${v}** left behind. Pocketed it. Didn\'t mention it.*`,
  (s, v) => `***${s}** had three seconds of genuine emotion about **${v}**. Then the game continued. The emotions did not.*`,
  (s, v) => `*The survivors didn\'t mourn. They calculated. **${s}** was already doing the math.*`,
  (s, v) => `***${s}** hugged the person next to them after **${v}** was gone. It was the kind of hug that says "I\'m still here" and also "don\'t forget that."*`,
  (s, v) => `*Some of them cried. **${s}** didn\'t. **${s}** is playing a different game.*`,
  (s, v) => `***${s}** said "I\'ll finish what you started, **${v}**." Nobody believed them. The arena appreciated the drama.*`,
];

const ROULETTE_OPENERS = [
  'The arena spun a wheel. It stopped on someone. The wheel doesn\'t explain itself.',
  'Regret roulette. One player. Random outcome. Everyone else watches.',
  'The wheel came out. Everyone hoped it wouldn\'t land on them.',
  'The arena invented a new way to make one person\'s day worse or better. Spun it. Got a result.',
  'The roulette wheel appeared. The arena doesn\'t ask who wants to spin.',
];

const ROULETTE_WIN = [
  (t, w) => `<a:purplesparkle:1479210541691175054> **${t}** spun the wheel and won. -${w} REGRET.\n*The arena giveth. **${t}** looked relieved. The others looked sick.*`,
  (t, w) => `<a:purplesparkle:1479210541691175054> **${t}** walked away from roulette lighter. -${w} REGRET.\n*Someone nearby made a noise that wasn\'t quite a cheer.*`,
  (t, w) => `<a:purplesparkle:1479210541691175054> The wheel blessed **${t}**. -${w} REGRET.\n*The universe decided **${t}** deserved a break. Everyone else disagrees.*`,
  (t, w) => `<a:purplesparkle:1479210541691175054> **${t}** got lucky on the roulette. -${w} REGRET.\n*Three people clapped. Two were lying. One was planning.*`,
];

const ROULETTE_LOSE = [
  (t, w) => `<:purp_caveira50:1495665632845369354> **${t}** spun the wheel and lost. +${w} REGRET.\n*The arena taketh. Nobody said a word. Two people smiled. They hid it badly.*`,
  (t, w) => `<:purp_caveira50:1495665632845369354> The wheel landed on **${t}**\'s worst case scenario. +${w} REGRET.\n*Someone patted their shoulder. Left immediately after.*`,
  (t, w) => `<:purp_caveira50:1495665632845369354> **${t}** lost the roulette. +${w} REGRET.\n*The arena has no favorites. The results suggest otherwise.*`,
  (t, w) => `<:purp_caveira50:1495665632845369354> **${t}** spun. Lost. Hard. +${w} REGRET.\n*A nearby player offered a hug. Held on slightly too long. Suspicious.*`,
];

const ROULETTE_REACT = [
  (w, t) => `*Afterwards, **${w}** found **${t}** and said "I would have shared it." Nobody verified this claim.*`,
  (w, t) => `***${w}** watched **${t}**\'s roulette result and immediately went to go find an alliance.*`,
  (w, t) => `*The wheel stopped and **${t}** looked at **${w}**. **${w}** shrugged. It was the most dishonest shrug in the arena.*`,
  (w, t) => `***${t}** took the roulette result silently. **${w}** kissed them on the forehead after. The arena said nothing. That was new.*`,
  (w, t) => `***${w}** said "the wheel is rigged." They were wrong. They were also suspicious.*`,
];

const THEFT_OPENERS = [
  'The arena facilitated a transaction. One party didn\'t consent. The arena doesn\'t require consent.',
  'Wealth redistribution. Arena-style. The details are messy.',
  'Someone\'s sins changed hands. The arena selected the hands.',
  'A theft occurred. The arena watched. The arena approved.',
  'The arena decided someone had too much and someone else had too little. It fixed this.',
  'Mass theft event triggered. The arena chose the thief and the victim. In that order.',
];

const THEFT_LINES = [
  (thief, victim, amt) => `<a:moneybag:1479268556687540345> **${thief}** walked away with **${amt} sins** that used to belong to **${victim}**.\n*The arena chose the thief. **${victim}** has opinions. The opinions don\'t change the outcome.*`,
  (thief, victim, amt) => `<a:moneybag:1479268556687540345> **${victim}**\'s **${amt} sins** ended up in **${thief}**\'s pocket.\n***${thief}** acted confused when confronted. Nobody believed it.*`,
  (thief, victim, amt) => `<a:moneybag:1479268556687540345> **${thief}** stole **${amt} sins** from **${victim}** with the energy of someone who has done this before.\n***${victim}** screamed internally. Externally they nodded.*`,
  (thief, victim, amt) => `<a:moneybag:1479268556687540345> **${amt} sins** disappeared from **${victim}** and appeared in **${thief}**\'s account.\n***${thief}** said "I don\'t know how that happened." The arena does.*`,
  (thief, victim, amt) => `<a:moneybag:1479268556687540345> The arena moved **${amt} sins** from **${victim}** to **${thief}**.\n***${victim}** and **${thief}** made eye contact. It was a long look. Nothing was said.*`,
  (thief, victim, amt) => `<a:moneybag:1479268556687540345> **${thief}** robbed **${victim}** of **${amt} sins** and had the nerve to wave at them afterwards.\n***${victim}** waved back. Both smiled. Neither meant it.*`,
];

const THEFT_WITNESS = [
  (w, thief, victim) => `***${w}** saw what **${thief}** did to **${victim}**. Decided not to get involved. Started planning how to use this information.*`,
  (w, thief, victim) => `***${w}** witnessed the whole thing. Will absolutely bring this up at the worst possible moment.*`,
  (w, thief, victim) => `***${w}** watched **${thief}** steal from **${victim}** and immediately went to tell someone. Whether that someone is **${victim}** depends on what\'s in it for **${w}**.*`,
  (w, thief, victim) => `*The only witness was **${w}**. **${thief}** made eye contact with **${w}**. **${w}** looked away first. Smart.*`,
  (w, thief, victim) => `***${w}** saw everything. Said nothing. Hugged **${victim}** after. Did not mention what they saw.*`,
  (w, thief, victim) => `***${w}** clocked it from across the arena. Made a note. Filed it under "useful later."*`,
];

const BETRAYAL_OPENERS = [
  'The arena found an alliance. The arena exposed it. The arena feels nothing about this.',
  'Someone\'s partnership got selected for public destruction. The arena has no favorites.',
  'Alliances are only useful until the arena decides they aren\'t.',
  'The arena opened the receipts. Somebody\'s alliance didn\'t survive the read.',
  'The betrayal wave arrived. Whatever was built between two players just got broken.',
  'Trust is a limited resource. The arena just reduced the supply.',
];

const BETRAYAL_EXPOSED = [
  (a, b, oth) => `<:purp_caveira50:1495665632845369354> The alliance between **${a}** and **${b}** has been exposed and dissolved. Both get +150 REGRET.\n*The arena aired it out. **${oth}** already knew. They\'ve been waiting for this.*`,
  (a, b, oth) => `<:purp_caveira50:1495665632845369354> **${a}** and **${b}** thought their alliance was private. It wasn\'t. +150 REGRET each.\n***${oth}** nodded slowly when the announcement came. Like they\'d predicted it.*`,
  (a, b, oth) => `<:purp_caveira50:1495665632845369354> The **${a}**/**${b}** alliance collapsed publicly. +150 REGRET each.\n***${oth}** started laughing. Stopped when they realized they might be next.*`,
  (a, b, oth) => `<:purp_caveira50:1495665632845369354> **${a}** and **${b}** were exposed. +150 REGRET each.\n*They looked at each other after the announcement. It was the kind of look that ends things.*`,
  (a, b, oth) => `<:purp_caveira50:1495665632845369354> The arena broke **${a}** and **${b}**\'s alliance in front of everyone. +150 REGRET each.\n***${oth}** immediately slid into the gap and started talking to both of them separately.*`,
  (a, b, oth) => `<:purp_caveira50:1495665632845369354> **${a}** and **${b}**\'s partnership just became public knowledge. +150 REGRET each.\n***${a}** tried to hug **${b}** to smooth it over. **${b}** took a step back.*`,
];

const CONFESSION_OPENERS = [
  'The arena opened the vault. Everything in here is real. Names are attached.',
  'The confession booth is open. The votes have been archived. Let\'s see who voted for who.',
  'No more secrets. The arena doesn\'t store secrets for free.',
  'Time for transparency. The arena enjoys this part.',
  'The arena decided everyone deserves to know who voted for them. The arena was wrong but it\'s doing it anyway.',
  'Today the arena reads the votes out loud. In public. With no filter.',
];

const CONFESSION_REACT = [
  (p) => `***${p}** read the votes and went very quiet. The quiet is scarier than anything they could have said.*`,
  (p) => `***${p}** already knew. They\'ve known. They just waited to see if the arena would confirm it.*`,
  (p) => `***${p}** laughed when they saw the votes. Not the good kind.*`,
  (p) => `***${p}** looked around the room after the confessions. Made eye contact with three people. Held each one.*`,
  (p) => `***${p}** said "interesting" and sat down. That\'s somehow the most threatening response possible.*`,
  (p) => `***${p}** didn\'t react. That\'s the part that worries everyone else.*`,
  (p) => `***${p}** kissed someone on the cheek after the confessions. Either making peace or marking a target. Unclear.*`,
  (p) => `***${p}** cried a little. Nobody knew if it was real. The arena has its theories.*`,
];

// ─── EVENT PROCESSORS ─────────────────────────────────────────────────────────

async function processHungerEvent(season, alive, arenaChannel) {
  const dayName = getDayName(season.current_day);
  const lines   = [`*${pick(HUNGER_OPENERS)}*\n`];

  if (alive.length >= 2) {
    const a = pick(alive);
    const b = pick(alive.filter(p => p.user_id !== a.user_id));
    lines.push(pick(HUNGER_DRAMA)(a.username, b.username) + '\n');
  }

  for (const p of alive) {
    const inv = await getInventory(season.id, p.user_id);
    if (inv.hunger_crumb > 0) {
      await removeItem(season.id, p.user_id, 'hunger_crumb');
      lines.push(pick(HUNGER_SURVIVE)(p.username));
    } else {
      await addRegret(season.id, p.user_id, 90);
      await economy.removeFunds(p.user_id, 50, 'Regret Games hunger').catch(() => {});
      lines.push(pick(HUNGER_STARVE)(p.username));
    }
  }

  if (alive.length >= 2) {
    const a = pick(alive);
    const b = pick(alive.filter(p => p.user_id !== a.user_id));
    lines.push('\n' + pick(HUNGER_CLOSINGS)(a.username, b.username));
  }

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#CC5500')
      .setTitle(`<a:BBQ:1497476838367170710> ${dayName} — Hunger Event`)
      .setDescription(lines.join('\n'))
      .setImage(GIFS.hunger)
      .setFooter({ text: 'Buy Hunger Crumbs in the shop. Or don\'t. See what happens.' })
  ]});
}

async function processChaosEvent(season, alive, arenaChannel) {
  const dayName = getDayName(season.current_day);
  const count   = Math.floor(Math.random() * 3) + 1;
  const picked  = [...alive].sort(() => Math.random() - 0.5).slice(0, Math.min(count, alive.length));
  const others  = alive.filter(p => !picked.find(pp => pp.user_id === p.user_id));
  const lines   = [`*${pick(CHAOS_OPENERS)}*\n`];

  for (const p of picked) {
    const watcher = others.length > 0 ? pick(others).username : 'the arena';
    // Rotten Favor — reduces REGRET from event by 50%
    const hasFavor = await hasItem(season.id, p.user_id, 'rotten_favor');
    if (hasFavor) await removeItem(season.id, p.user_id, 'rotten_favor');
    const regretMult = hasFavor ? 0.5 : 1;
    if (Math.random() < 0.5) {
      await addRegret(season.id, p.user_id, Math.floor(150 * regretMult));
      lines.push(pick(CHAOS_HIT_REGRET)(p.username, watcher));
    } else {
      await economy.removeFunds(p.user_id, 100, 'Chaos event').catch(() => {});
      lines.push(pick(CHAOS_HIT_SINS)(p.username, watcher));
    }
  }

  if (others.length >= 2) {
    const w = pick(others);
    const h = pick(others.filter(o => o.user_id !== w.user_id));
    lines.push('\n' + pick(CHAOS_CLOSINGS)(w.username, h.username));
  }

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#7A0000')
      .setTitle(`<:purp_caveira50:1495665632845369354> ${dayName} — Chaos Event`)
      .setDescription(lines.join('\n'))
      .setImage(GIFS.chaos)
      .setFooter({ text: 'The arena picks targets. No appeals process.' })
  ]});
}

async function processBlessingEvent(season, alive, arenaChannel) {
  const dayName = getDayName(season.current_day);
  const count   = Math.floor(Math.random() * 2) + 1;
  const picked  = [...alive].sort(() => Math.random() - 0.5).slice(0, Math.min(count, alive.length));
  const others  = alive.filter(p => !picked.find(pp => pp.user_id === p.user_id));
  const lines   = [`*${pick(BLESSING_OPENERS)}*\n`];

  for (const p of picked) {
    const jealous = others.length > 0 ? pick(others).username : 'the rest';
    await economy.addFunds(p.user_id, 200, 'Queen\'s Blessing').catch(() => {});
    await db.run('UPDATE rg_players SET sins_earned = sins_earned + 200 WHERE season_id = $1 AND user_id = $2', [season.id, p.user_id]);
    lines.push(pick(BLESSING_LINES)(p.username, jealous));
  }

  if (others.length > 0 && picked.length > 0) {
    const j = pick(others);
    const p = pick(picked);
    lines.push('\n' + pick(BLESSING_ENVY)(j.username, p.username));
  }

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#9D00FF')
      .setTitle(`<a:purplesparkle:1479210541691175054> ${dayName} — Queen\'s Blessing`)
      .setDescription(lines.join('\n'))
      .setImage(GIFS.blessing)
      .setFooter({ text: 'The Queen blesses who she chooses. The jealousy is your problem.' })
  ]});
}

async function processMassacreEvent(season, alive, arenaChannel) {
  const dayName = getDayName(season.current_day);
  if (alive.length <= 2) {
    return arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#000000')
        .setTitle(`<:sword:1495666991187361943> ${dayName} — Massacre Refused`)
        .setDescription('*Too few players remain. The arena spares them. For now. The finale needs witnesses.*')
    ]});
  }

  const count    = Math.min(Math.floor(Math.random() * 2) + 2, alive.length - 1);
  const picked   = [...alive].sort(() => Math.random() - 0.5).slice(0, count);
  const survAlive = alive.filter(p => !picked.find(pp => pp.user_id === p.user_id));
  const lines    = [`*${pick(MASSACRE_OPENERS)}*\n`];
  const actualElim = [];

  for (const p of picked) {
    if (await hasItem(season.id, p.user_id, 'queens_insurance')) {
      await removeItem(season.id, p.user_id, 'queens_insurance');
      lines.push(`<a:purplesparkle:1479210541691175054> **${p.username}** was selected — pulled out Queen\'s Insurance at the last second. Survived. The arena was briefly annoyed.`);
      continue;
    }
    const regret  = p.regret || 0;
    const title   = pick(TITLES);
    const witness = survAlive.length > 0 ? pick(survAlive).username : 'the remaining players';
    await eliminatePlayer(season.id, p.user_id, 'Massacre');
    await db.run('UPDATE rg_players SET title = $1 WHERE season_id = $2 AND user_id = $3', [title, season.id, p.user_id]);
    actualElim.push(p);
    lines.push(pick(MASSACRE_ELIMINATED)(p.username, witness, getInsult(regret), title));
  }

  if (survAlive.length > 0 && actualElim.length > 0) {
    const s = pick(survAlive);
    const v = pick(actualElim);
    lines.push('\n' + pick(MASSACRE_SURVIVOR)(s.username, v.username));
  }

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#000000')
      .setTitle(`<:sword:1495666991187361943> ${dayName} — MASSACRE`)
      .setDescription(lines.join('\n\n'))
      .setImage(GIFS.massacre)
      .setFooter({ text: 'The arena cleans house on its own schedule.' })
  ]});
}

async function processRouletteEvent(season, alive, arenaChannel) {
  const dayName = getDayName(season.current_day);
  const target  = pick(alive);
  const others  = alive.filter(p => p.user_id !== target.user_id);
  const watcher = others.length > 0 ? pick(others) : null;
  const gain    = Math.random() < 0.5;
  const amount  = Math.floor(Math.random() * 400) + 200;
  const opener  = pick(ROULETTE_OPENERS);

  if (gain) {
    await db.run('UPDATE rg_players SET regret = GREATEST(0, regret - $1) WHERE season_id = $2 AND user_id = $3', [amount, season.id, target.user_id]);
    const mainLine = pick(ROULETTE_WIN)(target.username, amount);
    const reactLine = watcher ? '\n' + pick(ROULETTE_REACT)(watcher.username, target.username) : '';
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#8A2BE2')
        .setTitle(`<a:jackpot:1479203793806557385> ${dayName} — Regret Roulette`)
        .setDescription(`*${opener}*\n\n${mainLine}${reactLine}`)
        .setImage(GIFS.roulette)
    ]});
  } else {
    await addRegret(season.id, target.user_id, amount);
    const mainLine = pick(ROULETTE_LOSE)(target.username, amount);
    const reactLine = watcher ? '\n' + pick(ROULETTE_REACT)(watcher.username, target.username) : '';
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#8A2BE2')
        .setTitle(`<a:jackpot:1479203793806557385> ${dayName} — Regret Roulette`)
        .setDescription(`*${opener}*\n\n${mainLine}${reactLine}`)
        .setImage(GIFS.roulette)
    ]});
  }
}

async function processTheftEvent(season, alive, arenaChannel) {
  const dayName = getDayName(season.current_day);
  if (alive.length < 2) return;

  const thief   = pick(alive);
  const victim  = pick(alive.filter(p => p.user_id !== thief.user_id));
  const amount  = Math.floor(Math.random() * 200) + 100;
  const others  = alive.filter(p => p.user_id !== thief.user_id && p.user_id !== victim.user_id);
  const witness = others.length > 0 ? pick(others) : null;

  await economy.removeFunds(victim.user_id, amount, 'Mass Theft event').catch(() => {});
  await economy.addFunds(thief.user_id, amount, 'Mass Theft event').catch(() => {});

  const mainLine    = pick(THEFT_LINES)(thief.username, victim.username, amount);
  const witnessLine = witness ? '\n' + pick(THEFT_WITNESS)(witness.username, thief.username, victim.username) : '';

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#5A0F2E')
      .setTitle(`<a:583778moneyfly:1479271753392853023> ${dayName} — Mass Theft`)
      .setDescription(`*${pick(THEFT_OPENERS)}*\n\n${mainLine}${witnessLine}`)
      .setImage(GIFS.theft)
  ]});
}

async function processBetrayalEvent(season, alive, arenaChannel) {
  const dayName   = getDayName(season.current_day);
  const alliances = await db.all("SELECT * FROM rg_alliances WHERE season_id = $1 AND status = 'active'", [season.id]);

  if (!alliances.length) {
    const loner = alive.length > 0 ? pick(alive) : null;
    return arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#5A0F2E').setTitle(`<a:snake12:1497477227963613334> ${dayName} — Betrayal Wave`)
        .setDescription(
          `*No active alliances found. Nobody trusted anyone enough.*\n\n` +
          (loner ? `***${loner.username}** stood alone and looked around. The arena looked back.*` : '')
        )
    ]});
  }

  const target = pick(alliances);
  await db.run("UPDATE rg_alliances SET status = 'broken' WHERE id = $1", [target.id]);
  await addRegret(season.id, target.user_a, 150);
  await addRegret(season.id, target.user_b, 150);

  const others  = alive.filter(p => p.user_id !== target.user_a && p.user_id !== target.user_b);
  const witness = others.length > 0 ? pick(others).username : 'everyone watching';
  const mainLine = pick(BETRAYAL_EXPOSED)(target.username_a, target.username_b, witness);

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#5A0F2E')
      .setTitle(`<a:snake12:1497477227963613334> ${dayName} — BETRAYAL WAVE`)
      .setDescription(`*${pick(BETRAYAL_OPENERS)}*\n\n${mainLine}`)
      .setImage(GIFS.betrayal)
      .setFooter({ text: 'The arena has the receipts. Always.' })
  ]});
}

async function processConfessionEvent(season, alive, arenaChannel) {
  const dayName = getDayName(season.current_day);
  const votes   = await db.all('SELECT * FROM rg_votes WHERE season_id = $1 ORDER BY day DESC LIMIT 10', [season.id]);

  if (!votes.length) {
    return arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF').setTitle(`<a:SS_PurpleCandles:1497476841433464873> ${dayName} — Confession Phase`)
        .setDescription('*No votes have been cast yet. Nothing to expose. The arena is disappointed in all of you.*')
        .setImage(GIFS.confession)
    ]});
  }

  const lines   = votes.slice(0, 6).map(v => `• **${v.voter_name}** voted to eliminate **${v.target_name}** on Day ${v.day}`);
  const exposed = alive.length > 0 ? pick(alive) : null;
  const reactLine = exposed ? '\n\n' + pick(CONFESSION_REACT)(exposed.username) : '';

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#C9B1FF')
      .setTitle(`<a:SS_PurpleCandles:1497476841433464873> ${dayName} — CONFESSION PHASE`)
      .setDescription(
        `*${pick(CONFESSION_OPENERS)}*\n\n` +
        lines.join('\n') +
        reactLine
      )
      .setImage(GIFS.confession)
      .setFooter({ text: 'The arena has no secrets. Only yours.' })
  ]});
}

// ─── LAUNCH HELPER ────────────────────────────────────────────────────────────
async function launchRGGame(season, client, guildId, arenaChannel) {
  const players = await db.all('SELECT * FROM rg_players WHERE season_id = $1', [season.id]);
  if (players.length < 2) {
    await arenaChannel.send('<:wrong:1495666083594502174> Not enough players. Regret Games cancelled.').catch(() => {});
    await db.run("UPDATE rg_seasons SET status = 'ended' WHERE id = $1", [season.id]);
    return;
  }

  const tax   = Math.floor(season.pot * JACKPOT_TAX);
  const prize = season.pot - tax;
  await db.run("UPDATE rg_seasons SET status = 'active', current_day = 0, prize_pot = $1 WHERE id = $2", [prize, season.id]);
  await jackpot.addToDrawFund(tax).catch(() => {});

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#CC0000')
      .setTitle('<:sword:1495666991187361943> THE REGRET GAMES BEGIN')
      .setDescription(
        `**${players.length} players** entered.
` +
        `<a:moneybag:1479268556687540345> **Prize Pot:** ${prize.toLocaleString()} sins
` +
        `<a:hmmdevil:1495665623219306647> **Jackpot Tax:** ${tax.toLocaleString()} sins

` +
        `*Signups are closed. The game is running. Good luck. You will need it.*`
      )
  ]}).catch(() => {});

  activeRGGames.set(guildId, []);
  const freshSeason = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [season.id]);
  const t = setTimeout(async () => {
    try { await runAutoDay(freshSeason, client, 1); }
    catch(e) { console.error('[RG] Day 1 error:', e); }
  }, 3000);
  activeRGGames.get(guildId).push(t);
}

// ─── STANDALONE WINNER RESOLVER ──────────────────────────────────────────────
async function resolveWinnerAuto(season, client) {
  const alive      = await getAlivePlayers(season.id);
  const arenaChannel = await getArenaChannel(season, client);
  await db.run("UPDATE rg_seasons SET status = 'ended' WHERE id = $1", [season.id]);

  // Clear timers
  const timers = activeRGGames.get(season.guild_id) || [];
  timers.forEach(t => clearTimeout(t));
  activeRGGames.delete(season.guild_id);

  if (!alive.length) {
    if (arenaChannel) await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#000000')
        .setTitle('<a:larry_cry:1497476839608815706> NO SURVIVORS')
        .setDescription('*Everyone was eliminated. There is no winner. The arena is satisfied.*')
    ]}).catch(() => {});
    return;
  }

  const winner     = alive[0];
  const prize      = season.prize_pot || season.pot;
  const allPlayers = await getAllPlayers(season.id);

  await economy.addFunds(winner.user_id, prize, 'Regret Games winner');
  await db.run("UPDATE rg_players SET title = 'Regret Royalty' WHERE season_id = $1 AND user_id = $2", [season.id, winner.user_id]);
  if (arenaChannel) await resolveRGWinnerBounties(season.arena_channel_id, winner.user_id, winner.username, arenaChannel);

  // Announce winner with a standalone message first so it's unmissable
  if (arenaChannel) await arenaChannel.send(
    `# <a:MVP24:1495665626688131183> ${winner.username.toUpperCase()} WINS THE REGRET GAMES <a:MVP24:1495665626688131183>`
  ).catch(() => {});

  if (arenaChannel) await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#FF00AA')
      .setTitle('👑 REGRET GAMES — WINNER')
      .setDescription(
        `# ${winner.username}\n` +
        `*Not because you were good. Because everyone else was worse.*\n\n` +
        `<a:moneybag:1479268556687540345> **+${prize.toLocaleString()} sins**\n` +
        `<a:hmmdevil:1495665623219306647> **Final REGRET:** ${winner.regret}\n` +
        `<a:purplesparkle:1479210541691175054> **Title:** Regret Royalty\n\n` +
        `**Season Results:**\n` +
        allPlayers.map((p, i) => {
          const medals = ['<a:1stplace:1487504691880263791>','<a:2ndplace:1487504692874580048>','<a:3rdplace:1487504694191456336>'];
          return `${medals[i] || '<:purp_caveira50:1495665632845369354>'} **${p.username}** — ${p.regret} REGRET`;
        }).join('\n')
      )
      .setImage(GIFS.winner)
      .setFooter({ text: 'Congratulations. You are still questionable.' })
  ]}).catch(() => {});
}

// ─── AUTO GAME RUNNER ─────────────────────────────────────────────────────────

async function runAutoDay(season, client, day) {
  const updated = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [season.id]);
  if (!updated || updated.status !== 'active') return;

  let alive = await getAlivePlayers(season.id);
  if (alive.length <= 1) { await resolveWinnerAuto(updated, client); return; }

  await db.run('UPDATE rg_seasons SET current_day = $1 WHERE id = $2', [day, season.id]);
  const refreshed     = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [season.id]);
  const arenaChannel  = await getArenaChannel(refreshed, client);
  const votesChannel  = await getVotesChannel(refreshed, client);
  if (!arenaChannel) return;

  // ── Day Recap ──────────────────────────────────────────────────────────────


  const DAY_INTROS = [null,
    '*The arena opened. Everyone walked in willingly. Nobody has left yet.*',
    '*The hunger arrived before the sun did. People are making decisions.*',
    '*Nobody slept. Nobody trusted anyone. Day 3 started before it was ready.*',
    '*The alliances are cracking. The smiles stopped working yesterday.*',
    '*The roulette wheel is spinning. One player will feel it personally.*',
    '*The chaos returned. So did the betrayals. Some people never learn.*',
    '*This is the last day. One person walks out. Everyone else becomes a story.*',
  ];

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#6B2FA0')
      .setTitle(`<a:xddd:1497476845577437316> ${getDayName(day)}`)
      .setDescription(`# ${getDayName(day)}\n\n` + (DAY_INTROS[day]||'*The game continues.*'))
      .setDescription(DAY_INTROS[day]||'*The game continues.*')
      .setImage(getDayGif(day)||'')
      .addFields(
        { name: '<:member:1495666085121491024> Alive',  value: `**${alive.length}**`, inline: true },
        { name: '<a:moneybag:1479268556687540345> Prize Pot', value: `**${(refreshed.prize_pot||refreshed.pot).toLocaleString()} sins**`, inline: true },
      )
      .setFooter({ text: 'Survive today. Regret tomorrow.' })
  ]}).catch(()=>{});

  await sleep(1000);
  if (day >= 7) { await runDay7Finale(refreshed, alive, arenaChannel, client); return; }

  // ── Day Story Beats (every player does something) ─────────────────────────
  const others = [...alive].sort(()=>Math.random()-0.5);
  const storyLines = alive.map((p, i) => {
    const otherNames = others.filter(o=>o.user_id!==p.user_id).map(o=>o.username);
    return story.pick(story.DAY_BEATS)(p.username, otherNames);
  });

  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#4B0082')
      .setTitle(`<a:purplefire:1479219348353716415> Day ${day} — The Arena Watches`)
      .setDescription(storyLines.join('\n'))
  ]}).catch(()=>{});

  await sleep(800);

  // ── Day-specific event ────────────────────────────────────────────────────
  const deadToday = [];
  if (day === 1) {
    await runDay1Confession(refreshed, alive, arenaChannel);
  } else if (day === 2) {
    await runDay2Hunger(refreshed, alive, arenaChannel, deadToday, client);
  } else if (day === 3) {
    await runDay3BetrayalTheft(refreshed, alive, arenaChannel, deadToday, client);
  } else if (day === 4) {
    await runDay4ChaosMassacre(refreshed, alive, arenaChannel, deadToday, client);
  } else if (day === 5) {
    await runDay5Roulette(refreshed, alive, arenaChannel, deadToday, client);
  } else if (day === 6) {
    await runDay6ChaosBetrayal(refreshed, alive, arenaChannel, deadToday, client);
  }

  alive = await getAlivePlayers(season.id);
  if (alive.length <= 1) { await resolveWinnerAuto(refreshed, client); return; }

  // ── Vote (skip Day 1) ─────────────────────────────────────────────────────
  if (day > 1) {
    await db.run('UPDATE rg_seasons SET vote_open = 1 WHERE id = $1', [season.id]);
    const voteChannel = votesChannel || arenaChannel;
    const freshAlive  = await getAlivePlayers(season.id);
    const voteOptions = freshAlive.map(p=>({ label: p.username, value: p.user_id, description: `REGRET: ${p.regret||0}` }));
    const voteRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rg_vote:${season.id}`)
        .setPlaceholder('Vote to eliminate...')
        .addOptions(voteOptions.slice(0,25))
    );
    const pingList    = freshAlive.map(p=>`<@${p.user_id}>`).join(' ');
    const voteEndsAt  = Math.floor((Date.now()+VOTE_MS)/1000);
    await voteChannel.send({ content: `${pingList}\n<a:Warning:1497476844860215366> **Time to vote!** Closes <t:${voteEndsAt}:R>` }).catch(()=>{});
    await voteChannel.send({ embeds: [
      new EmbedBuilder().setColor('#CC0000')
        .setTitle(`<a:purplesparkle:1479210541691175054> ${getDayName(day)} — Voting Opens`)
        .setDescription(`Pick someone to eliminate.\n*Or don\'t. Let fate decide.*\n\n<a:calendar:1479266779837632562> Closes <t:${voteEndsAt}:R>`)
    ], components: [voteRow] }).catch(()=>{});

    setTimeout(async () => {
      try {
        await db.run('UPDATE rg_seasons SET vote_open = 0 WHERE id = $1', [season.id]);
        await autoCloseVote(refreshed, day, arenaChannel, voteChannel, client, deadToday);
      } catch(e) { console.error('[RG] vote close error:', e); }
    }, VOTE_MS);
  } else {
    // Day 1 — no vote, schedule Day 2
    const t = setTimeout(async()=>{
      try { await runAutoDay(season, client, 2); }
      catch(e){ console.error('[RG] Day 2 error:', e); }
    }, ROUND_MS);
    const gk = refreshed.guild_id||'';
    if (gk){ if(!activeRGGames.has(gk)) activeRGGames.set(gk,[]); activeRGGames.get(gk).push(t); }
  }
}

// ─── DAY STORY LINE POOLS ─────────────────────────────────────────────────────

const DAY1_ALLIANCE_LINES = [
  (a, b) => `*In a corner of the arena, **${a}** leaned over to **${b}** and whispered something. An alliance was born. The arena noted it.*`,
  (a, b) => `***${a}** and **${b}** shook hands. In the Regret Games, that means nothing. But they tried.*`,
  (a, b) => `*Nobody trusted each other yet. Except **${a}** and **${b}**, who immediately started plotting together. Red flag.*`,
  (a, b) => `***${b}** sidled up to **${a}** and said "you and me." **${a}** said "sure." Both were lying. They didn\'t know that yet.*`,
  (a, b) => `*The arena watched **${a}** and **${b}** exchange a look. A deal was struck. Whether it lasts is another question.*`,
  (a, b) => `***${a}** pulled **${b}** aside and said "let\'s work together." **${b}** nodded. Somewhere, the arena started a countdown.*`,
  (a, b) => `*Day 1 and **${a}** already has an ally. **${b}** thinks they found a friend. **${a}** thinks they found a shield.*`,
  (a, b) => `***${b}** and **${a}** made eye contact across the arena and both nodded. Nobody else saw it. The arena did.*`,
];

const DAY1_SIZING_LINES = [
  (a, b) => `***${a}** clocked **${b}** immediately. Filed under: threat. Will not say this out loud.*`,
  (a, b) => `***${b}** looked at **${a}** and smiled. **${a}** smiled back. Neither meant it.*`,
  (a, b) => `***${a}** assessed **${b}** in three seconds. The assessment was not flattering.*`,
  (a, b) => `*First thing **${b}** did was find out who **${a}** was allied with. The answer concerned them.*`,
  (a, b) => `***${a}** and **${b}** haven\'t spoken yet. The silence is doing more work than any alliance could.*`,
];

const DAY2_DRAMA_LINES = [
  (dead, a, b) => `*While **${dead}** starved, **${a}** and **${b}** were spotted sharing food privately. The arena filed this under "relevant later."*`,
  (dead, a, b) => `***${a}** offered **${b}** the last ration. **${dead}** watched from across the arena and added both names to a mental list.*`,
  (dead, a, b) => `*The starvation exposed who prepared and who didn\'t. **${a}** and **${b}** prepared. **${dead}** assumed someone else would handle it.*`,
  (dead, a, b) => `***${b}** and **${a}** ate quietly in the corner while **${dead}** got increasingly desperate. The dynamic shifted permanently.*`,
];

const DAY3_BETRAYAL_LINES = [
  (dead, a, b) => `*The elimination exposed something. **${a}** and **${b}** had a deal. **${dead}** knew about it. Now everyone does.*`,
  (dead, a, b) => `*With **${dead}** gone, **${a}** and **${b}** recalculated their positions. The math changed. So did the alliances.*`,
  (dead, a, b) => `***${a}** watched **${dead}** get eliminated without intervening. **${b}** noticed. So did **${dead}**.*`,
];

const DAY4_AFTERMATH_LINES = [
  (a, b) => `***${a}** looked at **${b}** after the massacre. Two survivors of something brutal. The game suddenly felt real.*`,
  (a, b) => `*The bodies were metaphorical. The damage wasn\'t. **${a}** and **${b}** are what\'s left of something that started larger.*`,
  (a, b) => `***${b}** reached for **${a}**\'s hand after Day 4. **${a}** let them. The arena watched. Filed nothing.*`,
];

// ── Helper: kill N players, returns list of dead ────────────────────────────
async function killPlayers(season, count, cause, arenaChannel, deadToday) {
  const alive = await getAlivePlayers(season.id);
  const toKill = [...alive].sort(() => Math.random() - 0.5).slice(0, Math.min(count, Math.max(0, alive.length - 1)));
  for (const victim of toKill) {
    if (await hasItem(season.id, victim.user_id, 'queens_insurance')) {
      await removeItem(season.id, victim.user_id, 'queens_insurance');
      await arenaChannel.send(`<a:purplesparkle:1479210541691175054> **${victim.username}** was targeted but used Queen\'s Insurance. Survived.`).catch(() => {});
      continue;
    }
    if (await hasItem(season.id, victim.user_id, 'crown_shield')) {
      await removeItem(season.id, victim.user_id, 'crown_shield');
      await arenaChannel.send(`<a:purplesparkle:1479210541691175054> **${victim.username}** was targeted but their Crown Shield blocked the attack. Shield destroyed.`).catch(() => {});
      continue;
    }
    const remaining = await getAlivePlayers(season.id);
    const killerPool = remaining.filter(p => p.user_id !== victim.user_id);
    if (!killerPool.length) continue;
    const killer   = pick(killerPool);
    const killLine = story.pick(story.KILL_LINES)(killer.username, victim.username);
    const title    = pick(TITLES);
    await eliminatePlayer(season.id, victim.user_id, `Killed by ${killer.username} — ${cause}`);
    await db.run('UPDATE rg_players SET title=$1 WHERE season_id=$2 AND user_id=$3', [title, season.id, victim.user_id]);
    await resolveRGBounties(season.arena_channel_id, victim.user_id, victim.username, killer.user_id, killer.username, cause, arenaChannel);
    // Last Laugh — deal 200 REGRET to a random survivor
    if (await hasItem(season.id, victim.user_id, 'last_laugh')) {
      await removeItem(season.id, victim.user_id, 'last_laugh');
      const survivors = await getAlivePlayers(season.id);
      if (survivors.length > 0) {
        const target = pick(survivors);
        await addRegret(season.id, target.user_id, 200);
        await arenaChannel.send(`<a:hmmdevil:1495665623219306647> **${victim.username}** used their Last Laugh from beyond — **${target.username}** gains +200 REGRET.`).catch(() => {});
      }
    }
    deadToday.push({ ...victim, title });
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#7A0000')
        .setDescription(`${killLine}
> *${getInsult(victim.regret||0)}* — **${title}**`)
    ]}).catch(() => {});
    await sleep(500);
  }
}

function killCount(alive, pct) {
  return Math.max(1, Math.round(alive * pct));
}

// ── Day 1: Confession Phase — alliances form, no deaths ─────────────────────
async function runDay1Confession(season, alive, arenaChannel) {
  // Confessions — reveal something about random players
  const confessionLines = [];
  const shuffled = [...alive].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(5, shuffled.length); i++) {
    const p = shuffled[i];
    const others = shuffled.filter(o => o.user_id !== p.user_id).map(o => o.username);
    confessionLines.push(story.pick(story.DAY_BEATS)(p.username, others));
  }
  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('<a:SS_PurpleCandles:1497476841433464873> Day 1 — Confessions')
      .setDescription(confessionLines.join('\n'))
  ]}).catch(() => {});
  await sleep(800);

  // Form 2-4 alliances
  const allianceLines = [];
  const apairs = [...alive].sort(() => Math.random() - 0.5);
  const count  = Math.min(Math.floor(alive.length / 4), 4);
  for (let i = 0; i < count; i++) {
    const a = apairs[i*2], b = apairs[i*2+1];
    if (!a || !b) continue;
    allianceLines.push(pick(DAY1_ALLIANCE_LINES)(a.username, b.username));
    await db.run(
      "INSERT INTO rg_alliances (season_id,user_a,username_a,user_b,username_b,status) VALUES ($1,$2,$3,$4,$5,'active') ON CONFLICT DO NOTHING",
      [season.id, a.user_id, a.username, b.user_id, b.username]
    ).catch(() => {});
  }
  allianceLines.push('\n*Day 1 ends without blood. The arena is patient. Tomorrow it won\'t be.*');
  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#6B2FA0')
      .setTitle('<a:purplesparkle:1479210541691175054> Alliances Form')
      .setDescription(allianceLines.join('\n'))
  ]}).catch(() => {});
}

// ── Day 2: Hunger Sets In — 10% deaths ──────────────────────────────────────
async function runDay2Hunger(season, alive, arenaChannel, deadToday, client) {
  await processHungerEvent(season, alive, arenaChannel);
  await sleep(800);
  const fresh = await getAlivePlayers(season.id);
  const kills = killCount(fresh.length, 0.10);
  await killPlayers(season, kills, 'Hunger Day 2', arenaChannel, deadToday);
  await sleep(600);
  const survivors = await getAlivePlayers(season.id);
  if (survivors.length >= 2) {
    const [a,b] = survivors.sort(() => Math.random() - 0.5);
    await arenaChannel.send(pick(DAY2_DRAMA_LINES)(deadToday[0]?.username||'the fallen', a.username, b.username)).catch(() => {});
  }
}

// ── Day 3: Betrayal Wave + Mass Theft — 15% deaths ──────────────────────────
async function runDay3BetrayalTheft(season, alive, arenaChannel, deadToday, client) {
  await processBetrayalEvent(season, alive, arenaChannel);
  await sleep(800);
  const fresh3 = await getAlivePlayers(season.id);
  await processTheftEvent(season, fresh3, arenaChannel);
  await sleep(800);
  const fresh3b = await getAlivePlayers(season.id);
  const kills   = killCount(fresh3b.length, 0.15);
  await killPlayers(season, kills, 'Betrayal Day 3', arenaChannel, deadToday);
  await sleep(600);
  const survivors = await getAlivePlayers(season.id);
  if (survivors.length >= 3) {
    const [a,b,c] = survivors.sort(() => Math.random() - 0.5);
    await arenaChannel.send(pick(DAY3_BETRAYAL_LINES)(deadToday[deadToday.length-1]?.username||'someone', a.username, b.username)).catch(() => {});
  }
}

// ── Day 4: Chaos + Massacre — 25% deaths ────────────────────────────────────
async function runDay4ChaosMassacre(season, alive, arenaChannel, deadToday, client) {
  await processChaosEvent(season, alive, arenaChannel);
  await sleep(800);
  const fresh4 = await getAlivePlayers(season.id);
  if (fresh4.length <= 2) return;
  const kills  = killCount(fresh4.length, 0.25);
  await killPlayers(season, kills, 'Massacre Day 4', arenaChannel, deadToday);
  await sleep(600);
  const survivors = await getAlivePlayers(season.id);
  if (survivors.length >= 2) {
    const [a,b] = survivors.sort(() => Math.random() - 0.5);
    await arenaChannel.send(pick(DAY4_AFTERMATH_LINES)(a.username, b.username)).catch(() => {});
  }
}

// ── Day 5: Regret Roulette — 30% deaths ─────────────────────────────────────
async function runDay5Roulette(season, alive, arenaChannel, deadToday, client) {
  // Everyone spins
  const lines = [];
  for (const p of alive) {
    const gain = Math.random() < 0.45;
    const amt  = Math.floor(Math.random() * 300) + 100;
    if (gain) {
      await db.run('UPDATE rg_players SET regret = GREATEST(0, regret - $1) WHERE season_id=$2 AND user_id=$3', [amt, season.id, p.user_id]);
      lines.push(`<a:jackpot:1479203793806557385> **${p.username}** spun and won. -${amt} REGRET.`);
    } else {
      await addRegret(season.id, p.user_id, amt);
      lines.push(`<:purp_caveira50:1495665632845369354> **${p.username}** spun and lost. +${amt} REGRET.`);
    }
  }
  await arenaChannel.send({ embeds: [
    new EmbedBuilder().setColor('#8A2BE2')
      .setTitle('<a:jackpot:1479203793806557385> Day 5 — Regret Roulette')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'The wheel has no favorites.' })
  ]}).catch(() => {});
  await sleep(800);
  // 30% deaths — highest REGRET players die first
  const fresh5  = await getAlivePlayers(season.id);
  const kills   = killCount(fresh5.length, 0.30);
  const sorted  = [...fresh5].sort((a,b) => (b.regret||0)-(a.regret||0));
  const toKill  = sorted.slice(0, Math.min(kills, sorted.length - 1));
  for (const victim of toKill) {
    const killerPool = fresh5.filter(p => p.user_id !== victim.user_id && !toKill.find(k => k.user_id === p.user_id));
    const killer = killerPool.length > 0 ? pick(killerPool) : pick(fresh5.filter(p => p.user_id !== victim.user_id));
    const killLine = story.pick(story.KILL_LINES)(killer.username, victim.username);
    const title    = pick(TITLES);
    await eliminatePlayer(season.id, victim.user_id, `Killed by ${killer.username} Day 5`);
    await db.run('UPDATE rg_players SET title=$1 WHERE season_id=$2 AND user_id=$3', [title, season.id, victim.user_id]);
    await resolveRGBounties(season.arena_channel_id, victim.user_id, victim.username, killer.user_id, killer.username, 'roulette', arenaChannel);
    deadToday.push({ ...victim, title });
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#8A2BE2')
        .setDescription(`${killLine}
> Final title: **${title}**`)
    ]}).catch(() => {});
    await sleep(500);
  }
}

// ── Day 6: Chaos + Betrayal — 35% deaths ────────────────────────────────────
async function runDay6ChaosBetrayal(season, alive, arenaChannel, deadToday, client) {
  await processChaosEvent(season, alive, arenaChannel);
  await sleep(800);
  const fresh6 = await getAlivePlayers(season.id);
  await processBetrayalEvent(season, fresh6, arenaChannel);
  await sleep(800);
  const fresh6b = await getAlivePlayers(season.id);
  if (fresh6b.length <= 2) return;
  const kills   = killCount(fresh6b.length, 0.35);
  await killPlayers(season, kills, 'Chaos Day 6', arenaChannel, deadToday);
}

// ── autoCloseVote ─────────────────────────────────────────────────────────────// ── autoCloseVote ─────────────────────────────────────────────────────────────
async function autoCloseVote(season, day, arenaChannel, voteChannel, client, deadToday=[]) {
  const votes = await db.all(
    'SELECT target_id, target_name, COUNT(*) as total FROM rg_votes WHERE season_id=$1 AND day=$2 GROUP BY target_id,target_name ORDER BY total DESC',
    [season.id, day]
  );
  const alive = await getAlivePlayers(season.id);
  let voteVictim = null;

  if (!votes.length) {
    if (alive.length > 1) {
      const unlucky = pick(alive);
      const killer  = pick(alive.filter(p=>p.user_id!==unlucky.user_id));
      const killLine = story.pick(story.KILL_LINES)(killer.username, unlucky.username);
      const title    = pick(TITLES);
      await eliminatePlayer(season.id, unlucky.user_id, `Killed by ${killer.username} (no votes)`);
      await db.run('UPDATE rg_players SET title=$1 WHERE season_id=$2 AND user_id=$3', [title, season.id, unlucky.user_id]);
      await resolveRGBounties(season.arena_channel_id, unlucky.user_id, unlucky.username, killer.user_id, killer.username, 'vote', arenaChannel);
      deadToday.push(unlucky);
      voteVictim = unlucky;
      await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#CC0000')
          .setTitle('<a:larry_cry:1497476839608815706> No Votes — Arena Decides')
          .setDescription(`${killLine}\n\n> *${getInsult(unlucky.regret||0)}*\n> Final title: **${title}**`)
      ]}).catch(()=>{});
    }
  } else {
    const topVotes = votes[0].total;
    const topTied  = votes.filter(v=>v.total===topVotes);
    const elim     = pick(topTied);

    // Vote results to vote channel
    await voteChannel.send({ embeds: [
      new EmbedBuilder().setColor('#333333')
        .setTitle(`<a:purplesparkle:1479210541691175054> Vote Results — ${getDayName(day)}`)
        .setDescription(votes.map(v=>`• **${v.target_name}** — ${v.total} vote(s)`).join('\n'))
        .setFooter(topTied.length>1 ? { text: 'Tie broken randomly.' } : null)
    ]}).catch(()=>{});

    if (await hasItem(season.id, elim.target_id, 'queens_insurance')) {
      await removeItem(season.id, elim.target_id, 'queens_insurance');
      await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#9D00FF')
          .setTitle('<a:MVP24:1495665626688131183> SAVED — Queen\'s Insurance')
          .setDescription(`**${elim.target_name}** had the most votes but used Queen\'s Insurance. Survived.`)
      ]}).catch(()=>{});
    } else {
      const player   = await getPlayer(season.id, elim.target_id);
      const killer   = pick(alive.filter(p=>p.user_id!==elim.target_id));
      const killLine = story.pick(story.KILL_LINES)(killer?.username||'the group', elim.target_name);
      const title    = pick(TITLES);
      await eliminatePlayer(season.id, elim.target_id, `Voted out Day ${day}`);
      await db.run('UPDATE rg_players SET title=$1 WHERE season_id=$2 AND user_id=$3', [title, season.id, elim.target_id]);
      await resolveRGBounties(season.arena_channel_id, elim.target_id, elim.target_name, killer?.user_id||null, killer?.username||null, 'voted out', arenaChannel);
      deadToday.push(player||{ user_id: elim.target_id, username: elim.target_name, regret: 0 });
      voteVictim = player;
      await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#CC0000')
          .setTitle('<a:larry_cry:1497476839608815706> VOTED OUT')
          .setDescription(`${killLine}\n\n> *${getInsult(player?.regret||0)}*\n> Final title: **${title}**`)
          .setFooter({ text: 'Thank you for being content.' })
      ]}).catch(()=>{});
    }
  }

  await sleep(800);

  // ── Post-vote drama ───────────────────────────────────────────────────────
  if (voteVictim) {
    const survivors = await getAlivePlayers(season.id);
    if (survivors.length >= 2) {
      const shuffled = survivors.sort(()=>Math.random()-0.5);
      const killer   = shuffled[0], witness = shuffled[1];
      const dramaLine = story.pick(story.POST_VOTE_DRAMA)(killer.username, voteVictim.username, witness.username);
      await arenaChannel.send(dramaLine).catch(()=>{});
      await sleep(600);
      // Maybe 1 extra death from drama (25% chance if 4+ players)
      if (survivors.length >= 4 && Math.random() < 0.25) {
        const extra  = pick(survivors.filter(p=>p.user_id!==killer.user_id&&p.user_id!==witness.user_id));
        const exKill = story.pick(story.KILL_LINES)(killer.username, extra.username);
        const exTitle = pick(TITLES);
        await eliminatePlayer(season.id, extra.user_id, `Killed in post-vote drama Day ${day}`);
        await db.run('UPDATE rg_players SET title=$1 WHERE season_id=$2 AND user_id=$3', [exTitle, season.id, extra.user_id]);
        deadToday.push(extra);
        await arenaChannel.send({ embeds: [
          new EmbedBuilder().setColor('#5A0F2E')
            .setTitle('<:purp_caveira50:1495665632845369354> Post-Vote — More Blood')
            .setDescription(`${exKill}\n> Final title: **${exTitle}**`)
        ]}).catch(()=>{});
      }
    }
  }

  await sleep(800);

  // ── Night phase ───────────────────────────────────────────────────────────
  const nightAlive = await getAlivePlayers(season.id);
  if (nightAlive.length > 0) {
    const nightLines = nightAlive.map(p => {
      const others = nightAlive.filter(o=>o.user_id!==p.user_id).map(o=>o.username);
      // 40% chance of interacting with a dead player
      if (deadToday.length > 0 && Math.random() < 0.4) {
        const dead = pick(deadToday);
        return story.pick(story.NIGHT_BEATS_WITH_DEAD)(p.username, dead.username);
      }
      return story.pick(story.NIGHT_BEATS_SURVIVOR)(p.username, others.length > 0 ? others : ['the darkness']);
    });
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#1a0033')
        .setTitle('<a:SS_PurpleCandles:1497476841433464873> Night Falls')
        .setDescription(nightLines.join('\n'))
        .setFooter({ text: 'Sleep lightly. Most of them aren\'t.' })
    ]}).catch(()=>{});
    await sleep(800);
  }

  // ── THE DEAD ──────────────────────────────────────────────────────────────
  if (deadToday.length > 0) {
    const names = deadToday.map(p=>`<:purp_caveira50:1495665632845369354> **${p.username}**`).join('\n');
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#000000')
        .setTitle(`☠️ THE DEAD — ${getDayName(day)}`)
        .setDescription(names || 'Nobody died today.')
    ]}).catch(()=>{});
    await sleep(800);
  }

  // ── Check win + schedule next day ─────────────────────────────────────────
  const remaining = await getAlivePlayers(season.id);
  if (remaining.length <= 1) { await resolveWinnerAuto(season, client); return; }

  const nextDay = day + 1;
  const t = setTimeout(async()=>{
    try { await runAutoDay(season, client, nextDay); }
    catch(e){ console.error('[RG] next day error:', e); }
  }, 5000);
  const freshS = await db.get('SELECT guild_id FROM rg_seasons WHERE id=$1', [season.id]).catch(()=>null);
  const gk = freshS?.guild_id||season.guild_id||'';
  if (gk){ if(!activeRGGames.has(gk)) activeRGGames.set(gk,[]); activeRGGames.get(gk).push(t); }
}

// ── Day 7: Final Day — kill to 2-3, then Queen's Blessing or Roulette ──────
async function runDay7Finale(season, alive, arenaChannel, client) {
  const target = Math.random() < 0.5 ? 2 : 3;

  // Step 1: Kill down to 2-3
  let current = await getAlivePlayers(season.id);
  if (current.length > target) {
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#CC0000')
        .setTitle('<:sword:1495666991187361943> Day 7 — The Final Hours')
        .setDescription(`*${current.length} remain. Only **${target}** will see the finale.*`)
    ]}).catch(() => {});
    await sleep(800);

    const sorted = [...current].sort((a,b) => (b.regret||0)-(a.regret||0));
    const toKill = sorted.slice(0, current.length - target);
    for (const victim of toKill) {
      const pool   = current.filter(p => !toKill.find(k=>k.user_id===p.user_id) && p.user_id !== victim.user_id);
      const killer = pool.length > 0 ? pick(pool) : pick(current.filter(p=>p.user_id!==victim.user_id));
      const killLine = story.pick(story.KILL_LINES)(killer.username, victim.username);
      const title    = pick(TITLES);
      await eliminatePlayer(season.id, victim.user_id, `Killed by ${killer.username} Final Day`);
      await db.run('UPDATE rg_players SET title=$1 WHERE season_id=$2 AND user_id=$3', [title, season.id, victim.user_id]);
      await resolveRGBounties(season.arena_channel_id, victim.user_id, victim.username, killer.user_id, killer.username, 'finale', arenaChannel);
      await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#CC0000').setDescription(`${killLine}\n> Final title: **${title}**`)
      ]}).catch(() => {});
      await sleep(600);
    }
  }

  await sleep(800);
  current = await getAlivePlayers(season.id);

  // Step 2: Queen's Blessing OR Final Roulette
  const isBlessing = Math.random() < 0.5;
  if (isBlessing) {
    const blessed = pick(current);
    await economy.addFunds(blessed.user_id, 500, "Queen's Final Blessing").catch(() => {});
    await db.run('UPDATE rg_players SET regret = GREATEST(0, regret - 300) WHERE season_id=$1 AND user_id=$2', [season.id, blessed.user_id]);
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#9D00FF')
        .setTitle("<a:purplesparkle:1479210541691175054> Queen\'s Final Blessing")
        .setImage(GIFS.day7_blessing)
        .setDescription(
          `*${current.map(p=>`**${p.username}**`).join(' and ')} stand at the end.*\n\n` +
          `The Queen chose **${blessed.username}**. +500 sins. -300 REGRET.\n*The others remembered this.*`
        )
    ]}).catch(() => {});
  } else {
    const rlines = [];
    for (const p of current) {
      const gain = Math.random() < 0.5;
      const amt  = Math.floor(Math.random() * 500) + 200;
      if (gain) {
        await db.run('UPDATE rg_players SET regret = GREATEST(0, regret - $1) WHERE season_id=$2 AND user_id=$3', [amt, season.id, p.user_id]);
        rlines.push(`<a:jackpot:1479203793806557385> **${p.username}** — -${amt} REGRET`);
      } else {
        await addRegret(season.id, p.user_id, amt);
        rlines.push(`<:purp_caveira50:1495665632845369354> **${p.username}** — +${amt} REGRET`);
      }
    }
    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#8A2BE2')
        .setTitle('<a:jackpot:1479203793806557385> Final Roulette')
        .setDescription(`*One last spin.*\n\n${rlines.join('\n')}`)
        .setImage(GIFS.day7_roulette)
    ]}).catch(() => {});
  }

  await sleep(1000);

  // Step 3: Eliminate all but lowest REGRET
  current = await getAlivePlayers(season.id);
  if (current.length > 1) {
    const sorted = [...current].sort((a,b) => (a.regret||0)-(b.regret||0));
    const winner = sorted[0];
    for (const p of sorted.slice(1)) {
      const killLine = story.pick(story.KILL_LINES)(winner.username, p.username);
      const title    = pick(TITLES);
      await eliminatePlayer(season.id, p.user_id, 'Final Day');
      await db.run('UPDATE rg_players SET title=$1 WHERE season_id=$2 AND user_id=$3', [title, season.id, p.user_id]);
      await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#CC0000').setDescription(`${killLine}\n> Final title: **${title}**`)
      ]}).catch(() => {});
      await sleep(600);
    }
  }
  await sleep(1000);
  await resolveWinnerAuto(season, client);
}

// ─── MAIN MODULE ──────────────────────────────────────────────────────────────
module.exports = {
  activeRGGames,

  // ── Setup ─────────────────────────────────────────────────────────────────
  async startGame(interaction) {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '<:wrong:1495666083594502174> Staff only.', ephemeral: true });

    // Clear any stuck seasons first
    await db.run("UPDATE rg_seasons SET status = 'ended' WHERE guild_id = $1 AND status IN ('signup','active')", [interaction.guild.id]).catch(() => {});

    // Parse optional timestamp
    const fee     = interaction.options.getInteger('fee') || DEFAULT_FEE;
    const timeStr = interaction.options.getString('time') || null;
    // Only auto-start if timestamp explicitly given
    let startDelay = 0;
    if (timeStr) {
      const tsMatch = timeStr.match(/<t:(\d+)/);
      if (tsMatch) {
        const startAt = parseInt(tsMatch[1]) * 1000;
        startDelay = Math.max(0, startAt - Date.now());
      }
    }



    // Upsert season using current channel
    const channelId = interaction.channel.id;
    await db.run(
      "INSERT INTO rg_seasons (guild_id, arena_channel_id, votes_channel_id, entry_fee, status, current_day, pot) VALUES ($1, $2, $2, $3, 'signup', 0, 0) ON CONFLICT(guild_id) DO UPDATE SET arena_channel_id = $2, votes_channel_id = $2, entry_fee = $3, status = 'signup', current_day = 0, pot = 0",
      [interaction.guild.id, channelId, fee]
    );
    const season = await db.get("SELECT * FROM rg_seasons WHERE guild_id = $1", [interaction.guild.id]);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> Failed to create season. Try again.', ephemeral: true });
    // Clear old players, votes, alliances from previous season
    await db.run('DELETE FROM rg_players WHERE season_id = $1', [season.id]).catch(() => {});
    await db.run('DELETE FROM rg_votes WHERE season_id = $1', [season.id]).catch(() => {});
    await db.run('DELETE FROM rg_alliances WHERE season_id = $1', [season.id]).catch(() => {});
    await db.run('DELETE FROM rg_inventory WHERE season_id = $1', [season.id]).catch(() => {});

    const arenaChannel = interaction.channel;

    const joinRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rg_join:${season.id}`).setLabel('Join the Mistake').setStyle(ButtonStyle.Danger).setEmoji('<:purp_caveira50:1495665632845369354>'),
      new ButtonBuilder().setCustomId(`rg_rules:${season.id}`).setLabel('View Rules').setStyle(ButtonStyle.Secondary),
    );

    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#CC0000')
        .setTitle('<a:MVP24:1495665626688131183> PLAY & REGRET: THE REGRET GAMES')
        .setDescription(
          '*You are entering voluntarily. That makes this worse.*\n\n' +
          'A multi-day survival game. Survive events, vote out enemies, betray your friends.\n' +
          'Last player standing wins the pot.\n\n' +
          `<:Sins:1478993005187698789> **Entry Fee:** ${fee} sins\n` +
          '<a:purplesparkle:1479210541691175054> **Prize Pot:** 90% of all entry fees\n' +
          '<:purp_caveira50:1495665632845369354> **Risk:** REGRET, betrayal, public embarrassment\n\n' +
          '*Nobody forced you to click join.*'
        )
        .setFooter({ text: 'The Queen may rig events for entertainment.' })
    ], components: [joinRow] });

    // If timestamp given, schedule auto-start — otherwise stay open
    if (startDelay > 0) {
      const client2 = interaction.client;
      const guildId2 = interaction.guild.id;
      const t2 = setTimeout(async () => {
        try { await launchRGGame(season, client2, guildId2, arenaChannel); }
        catch(e) { console.error('[RG] auto start error:', e); }
      }, startDelay);
      activeRGGames.set(guildId2, [t2]);
      await interaction.reply({ content: `<:checkmark:1495666088417956002> Regret Games open! Auto-starts <t:${Math.floor((Date.now() + startDelay) / 1000)}:R>. Players can join now.`, ephemeral: true });
    } else {
      await interaction.reply({ content: '<:checkmark:1495666088417956002> Regret Games open! Run /rg go when ready to start.', ephemeral: true });
    }
  },

  // ── Go (manually fire) ──────────────────────────────────────────────────────
  async go(interaction) {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '<:wrong:1495666083594502174> Staff only.', ephemeral: true });

    const season = await db.get("SELECT * FROM rg_seasons WHERE guild_id = $1 AND status = 'signup'", [interaction.guild.id]);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No open signups. Run `/rg startgame fee:500` first.', ephemeral: true });

    const players = await db.all('SELECT * FROM rg_players WHERE season_id = $1', [season.id]);
    if (players.length < 2) return interaction.reply({ content: `<:wrong:1495666083594502174> Need at least 2 players. Only **${players.length}** joined so far.`, ephemeral: true });

    await interaction.reply({ content: `<:checkmark:1495666088417956002> Starting with **${players.length} players**!`, ephemeral: true });
    const arenaChannel = await interaction.client.channels.fetch(season.arena_channel_id).catch(() => interaction.channel);
    await launchRGGame(season, interaction.client, interaction.guild.id, arenaChannel);
  },

  // ── Join (button handler) ─────────────────────────────────────────────────
  async handleJoinButton(interaction, seasonId) {
    const season = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [seasonId]);
    if (!season || season.status !== 'signup')
      return interaction.reply({ content: '<:wrong:1495666083594502174> Signups are closed.', ephemeral: true });

    const existing = await db.get('SELECT id FROM rg_players WHERE season_id = $1 AND user_id = $2', [seasonId, interaction.user.id]);
    if (existing)
      return interaction.reply({ content: '<a:Warning:1497476844860215366> You\'re already in the Regret Games.', ephemeral: true });

    await economy.getUser(interaction.user.id, interaction.user.username);
    const bal = await economy.getBalance(interaction.user.id);
    if (bal < season.entry_fee)
      return interaction.reply({ content: `<:wrong:1495666083594502174> You need **${season.entry_fee} sins** but only have **${bal}**.`, ephemeral: true });

    await economy.removeFunds(interaction.user.id, season.entry_fee, 'Regret Games entry');
    await db.run('UPDATE rg_seasons SET pot = pot + $1 WHERE id = $2', [season.entry_fee, seasonId]);
    await db.run(
      'INSERT INTO rg_players (season_id, user_id, username, status, regret, sins_earned, food, has_shield) VALUES ($1, $2, $3, \'alive\', 0, 0, 1, 0)',
      [seasonId, interaction.user.id, interaction.user.username]
    );

    const arenaChannel = await interaction.client.channels.fetch(season.arena_channel_id).catch(() => null);

    // Update player count on the signup embed
    const playerCount = await db.get('SELECT COUNT(*) as cnt FROM rg_players WHERE season_id = $1', [seasonId]);
    const count = playerCount?.cnt || 1;

    if (arenaChannel) {
      // Try to edit the original signup message to update count
      try {
        const messages = await arenaChannel.messages.fetch({ limit: 20 });
        const signupMsg = messages.find(m =>
          m.author.id === interaction.client.user.id &&
          m.components?.length > 0 &&
          m.embeds?.[0]?.title?.includes('REGRET GAMES')
        );
        if (signupMsg) {
          const updatedEmbed = new EmbedBuilder()
            .setColor('#CC0000')
            .setTitle('<a:MVP24:1495665626688131183> PLAY & REGRET: THE REGRET GAMES')
            .setDescription(
              '*You are entering voluntarily. That makes this worse.*\n\n' +
              'A multi-day survival game. Survive events, vote out enemies, betray your friends.\n' +
              'Last player standing wins the pot.\n\n' +
              `<:Sins:1478993005187698789> **Entry Fee:** ${season.entry_fee} sins\n` +
              '<a:purplesparkle:1479210541691175054> **Prize Pot:** 90% of all entry fees\n' +
              '<:purp_caveira50:1495665632845369354> **Risk:** REGRET, betrayal, public embarrassment\n\n' +
              `<:member:1495666085121491024> **Players joined: ${count}**\n\n` +
              '*Nobody forced you to click join.*'
            )
            .setFooter({ text: 'The Queen may rig events for entertainment.' });
          await signupMsg.edit({ embeds: [updatedEmbed], components: signupMsg.components }).catch(() => {});
        }
      } catch(e) {}

      await arenaChannel.send(
        `<:purp_caveira50:1495665632845369354> **${interaction.user.username}** joined the Regret Games. *${pick(INSULTS_LOW)}*`
      );
    }

    return interaction.reply({ embeds: [
      new EmbedBuilder().setColor('#6B2FA0')
        .setTitle('<a:hmmdevil:1495665623219306647> You\'re In — Regret Games')
        .setDescription(
          `Entry fee of **${season.entry_fee} sins** deducted.\n\n` +
          `*${pick(INSULTS_LOW)}*\n\n` +
          'The game starts when the host runs /rg go. Stay tuned.'
        )
    ], ephemeral: true });
  },

  // ── Next Day ──────────────────────────────────────────────────────────────
  async nextDay(interaction) {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '<:wrong:1495666083594502174> Staff only.', ephemeral: true });

    const season = await getActiveSeason(interaction.guild.id);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Regret Games.', ephemeral: true });

    // Move from signup to active on day 1
    if (season.status === 'signup') {
      const players = await db.all('SELECT * FROM rg_players WHERE season_id = $1', [season.id]);
      if (players.length < 2) return interaction.reply({ content: '<:wrong:1495666083594502174> Need at least 2 players to start.', ephemeral: true });

      // Take 10% jackpot tax
      const tax = Math.floor(season.pot * JACKPOT_TAX);
      const prize = season.pot - tax;
      await db.run("UPDATE rg_seasons SET status = 'active', current_day = 1, prize_pot = $1 WHERE id = $2", [prize, season.id]);
      await jackpot.addToDrawFund(tax).catch(() => {});
      await interaction.reply({ content: `<:checkmark:1495666088417956002> Regret Games started! Day 1 begins. Tax of **${tax} sins** sent to jackpot.`, ephemeral: true });
    } else {
      await db.run('UPDATE rg_seasons SET current_day = current_day + 1 WHERE id = $1', [season.id]);
      await interaction.reply({ content: `<:checkmark:1495666088417956002> Advanced to Day ${season.current_day + 1}.`, ephemeral: true });
    }

    // Re-fetch updated season
    const updated = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [season.id]);
    const alive   = await getAlivePlayers(season.id);
    const arenaChannel = await getArenaChannel(updated, interaction.client);
    if (!arenaChannel) return;

    // Force 1 survivor by day 5
    if (updated.current_day >= 5 && alive.length > 1) {
      // Keep eliminating until 1 remains
      const toElim = [...alive].sort((a, b) => (b.regret || 0) - (a.regret || 0)).slice(0, alive.length - 1);
      for (const p of toElim) {
        const title = pick(TITLES);
        await eliminatePlayer(season.id, p.user_id, 'Final Day — arena intervention');
        await db.run('UPDATE rg_players SET title = $1 WHERE season_id = $2 AND user_id = $3', [title, season.id, p.user_id]);
      }
      await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#CC0000')
          .setTitle('<a:larry_cry:1497476839608815706> FINAL DAY — Arena Intervention')
          .setDescription(
            `*It is Day 5. The arena has no patience for a slow finish.*

` +
            toElim.map(p => `<:purp_caveira50:1495665632845369354> **${p.username}** — eliminated by the arena. Final title: **${p.title || pick(TITLES)}**`).join('\n') +
            `

*One remains. As promised.*`
          )
      ]});
      // Trigger win condition
      await module.exports._checkWinCondition(season, arenaChannel.client || { channels: { fetch: async () => arenaChannel } });
      return;
    }

    const dayEmbedLines = alive.map(p => {
      const insult = getInsult(p.regret || 0);
      return `<a:MVP24:1495665626688131183> **${p.username}** — ${p.regret || 0} REGRET — *${insult}*`;
    });

    const DAY_INTROS = [
      null,
      '*The arena opened its doors. Everyone walked in willingly. That says something.*',
      '*The food ran low. The trust ran lower. Day 2 began with hungry eyes.*',
      '*Nobody slept well. They shouldn\'t have. Day 3 is when the real game starts.*',
      '*The alliances are cracking. The smiles are fake. Nobody is safe and everyone knows it.*',
      '*This is the last day. One of you walks out. The rest become content.*',
    ];
    const intro = DAY_INTROS[updated.current_day] || '*The arena continues. The survivors are fewer. The tension is not.*';

    await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#6B2FA0')
        .setTitle(`<a:xddd:1497476845577437316> ${getDayName(updated.current_day)}`)
        .setImage(getDayGif(updated.current_day) || '')
        .setDescription(
          `${intro}\n\n` +
          dayEmbedLines.join('\n')
        )
        .addFields(
          { name: '<:member:1495666085121491024> Alive',     value: `**${alive.length}** players`, inline: true },
          { name: '<a:purplesparkle:1479210541691175054> Prize Pot', value: `**${updated.prize_pot || updated.pot} sins**`, inline: true },
        )
        .setFooter({ text: 'Survive today. Regret tomorrow.' })
    ]});
  },

  // ── Open Vote ─────────────────────────────────────────────────────────────
  async openVote(interaction) {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '<:wrong:1495666083594502174> Staff only.', ephemeral: true });

    const season = await getActiveSeason(interaction.guild.id);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Regret Games.', ephemeral: true });
    if (season.vote_open) return interaction.reply({ content: '<:wrong:1495666083594502174> Voting is already open.', ephemeral: true });

    await db.run('UPDATE rg_seasons SET vote_open = 1 WHERE id = $1', [season.id]);

    const alive   = await getAlivePlayers(season.id);
    const votesChannel = await getVotesChannel(season, interaction.client);
    if (!votesChannel) return interaction.reply({ content: '<:wrong:1495666083594502174> Votes channel not found.', ephemeral: true });

    const options = alive.map(p => ({ label: p.username, value: p.user_id, description: `REGRET: ${p.regret || 0}` }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rg_vote:${season.id}`)
        .setPlaceholder('Vote to eliminate...')
        .addOptions(options.slice(0, 25))
    );

    await votesChannel.send({ embeds: [
      new EmbedBuilder().setColor('#CC0000')
        .setTitle('<a:purplesparkle:1479210541691175054> VOTING IS OPEN')
        .setDescription(
          `**${getDayName(season.current_day)} — Vote**\n\n` +
          `Pick someone to eliminate. Choose wisely.\n` +
          `*Or don\'t. We\'re watching either way.*`
        )
        .setFooter({ text: 'One vote per player. Voting closes when the host says so.' })
    ], components: [row] });

    return interaction.reply({ content: '<:checkmark:1495666088417956002> Voting opened!', ephemeral: true });
  },

  // ── Vote handler (select menu) ────────────────────────────────────────────
  async handleVote(interaction, seasonId) {
    const season = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [seasonId]);
    if (!season || !season.vote_open)
      return interaction.reply({ content: '<:wrong:1495666083594502174> Voting is not open right now.', ephemeral: true });

    const voter = await getPlayer(season.id, interaction.user.id);
    if (!voter)
      return interaction.reply({ content: '<:wrong:1495666083594502174> You\'re not in this game.', ephemeral: true });

    const targetId = interaction.values[0];
    if (targetId === interaction.user.id)
      return interaction.reply({ content: '<:wrong:1495666083594502174> You can\'t vote for yourself. Nice try.', ephemeral: true });

    // Check existing vote this day
    const existingVote = await db.get(
      'SELECT id FROM rg_votes WHERE season_id = $1 AND voter_id = $2 AND day = $3',
      [season.id, interaction.user.id, season.current_day]
    );
    if (existingVote)
      return interaction.reply({ content: '<:wrong:1495666083594502174> You already voted today.', ephemeral: true });

    const target = await getPlayer(season.id, targetId);
    if (!target) return interaction.reply({ content: '<:wrong:1495666083594502174> Player not found.', ephemeral: true });

    // Check alliance — allies can\'t vote each other without breaking it first
    const alliance = await getAlliance(season.id, interaction.user.id, targetId);
    if (alliance) {
      return interaction.reply({
        content: `<:wrong:1495666083594502174> You\'re allied with **${target.username}**. Use \`/regret breakally\` first.`,
        ephemeral: true
      });
    }

    await db.run(
      'INSERT INTO rg_votes (season_id, voter_id, voter_name, target_id, target_name, day) VALUES (?, ?, ?, ?, ?, ?)',
      [season.id, interaction.user.id, interaction.user.username, targetId, target.username, season.current_day]
    );

    await addRegret(season.id, targetId, 120);

    const votesChannel = await getVotesChannel(season, interaction.client);
    if (votesChannel) {
      await votesChannel.send(
        `<:purp_caveira50:1495665632845369354> **${interaction.user.username}** cast a vote. The tension rises.`
      );
    }

    return interaction.reply({ content: `<:checkmark:1495666088417956002> Vote cast. **${target.username}** gained +120 REGRET.`, ephemeral: true });
  },

  // ── Close Vote ────────────────────────────────────────────────────────────
  async closeVote(interaction) {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '<:wrong:1495666083594502174> Staff only.', ephemeral: true });

    const season = await getActiveSeason(interaction.guild.id);
    if (!season || !season.vote_open)
      return interaction.reply({ content: '<:wrong:1495666083594502174> Voting is not open.', ephemeral: true });

    await db.run('UPDATE rg_seasons SET vote_open = 0 WHERE id = $1', [season.id]);

    const votes = await db.all(
      'SELECT target_id, target_name, COUNT(*) as total FROM rg_votes WHERE season_id = $1 AND day = $2 GROUP BY target_id, target_name ORDER BY total DESC',
      [season.id, season.current_day]
    );

    const arenaChannel = await getArenaChannel(season, interaction.client);
    const votesChannel = await getVotesChannel(season, interaction.client);

    if (!votes.length) {
      if (votesChannel) await votesChannel.send({ embeds: [
        new EmbedBuilder().setColor('#333333').setTitle('<a:purplesparkle:1479210541691175054> Voting Closed').setDescription('No votes were cast. Nobody was eliminated. How anticlimactic.')
      ]});
      return interaction.reply({ content: 'Voting closed. No votes.', ephemeral: true });
    }

    // Top vote-getter is eliminated
    const topVotes  = votes[0].total;
    const topTied   = votes.filter(v => v.total === topVotes);
    const eliminated = pick(topTied); // random tiebreaker

    // Check Queen\'s Insurance
    if (await hasItem(season.id, eliminated.target_id, 'queens_insurance')) {
      await removeItem(season.id, eliminated.target_id, 'queens_insurance');
      if (arenaChannel) await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#9D00FF')
          .setTitle('<a:MVP24:1495665626688131183> VOTE RESULT — SAVED')
          .setDescription(
            `**${eliminated.target_name}** received the most votes with **${topVotes}** votes.\n\n` +
            `<a:purplesparkle:1479210541691175054> But they used **Queen\'s Insurance**. Saved.\n*The arena is displeased.*`
          )
      ]});
      return interaction.reply({ content: 'Vote closed. Player was saved by insurance.', ephemeral: true });
    }

    const player = await getPlayer(season.id, eliminated.target_id);
    const regret  = player?.regret || 0;
    const title   = pick(TITLES);
    await eliminatePlayer(season.id, eliminated.target_id, `Voted out on Day ${season.current_day}`);
    await db.run('UPDATE rg_players SET title = $1 WHERE season_id = $2 AND user_id = $3', [title, season.id, eliminated.target_id]);

    const voteLines = votes.map(v => `• **${v.target_name}** — ${v.total} vote(s)`).join('\n');

    if (arenaChannel) await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#CC0000')
        .setTitle('<a:larry_cry:1497476839608815706> ELIMINATED BY VOTE')
        .setDescription(
          `**${eliminated.target_name}** has been voted out.\n\n` +
          `*${getInsult(regret)}*\n\n` +
          `**Final Title:** ${title}\n` +
          `**Final REGRET:** ${regret}`
        )
        .setFooter({ text: 'Thank you for being content.' })
    ]});

    if (votesChannel) await votesChannel.send({ embeds: [
      new EmbedBuilder().setColor('#333333')
        .setTitle('<a:purplesparkle:1479210541691175054> Vote Results — Day ' + season.current_day)
        .setDescription(voteLines)
        .setFooter(topTied.length > 1 ? { text: 'Tie resolved randomly.' } : null)
    ]});

    await this._checkWinCondition(season, interaction.client);
    return interaction.reply({ content: `<:checkmark:1495666088417956002> **${eliminated.target_name}** eliminated.`, ephemeral: true });
  },

  // ── Trigger Event (dropdown) ──────────────────────────────────────────────
  async triggerEventMenu(interaction) {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '<:wrong:1495666083594502174> Staff only.', ephemeral: true });

    const season = await getActiveSeason(interaction.guild.id);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Regret Games.', ephemeral: true });

    const options = Object.entries(EVENT_TYPES).map(([key, val]) => {
      const match = val.label.match(/^(<a?:\w+:\d+>)\s*(.*)$/);
      return {
        label: match ? match[2] : val.label,
        value: key,
        description: val.desc,
        emoji: match ? match[1] : undefined,
      };
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rg_event:${season.id}:${interaction.user.id}`)
        .setPlaceholder('Pick an event type...')
        .addOptions(options)
    );

    return interaction.reply({ embeds: [
      new EmbedBuilder().setColor('#9D00FF')
        .setTitle('<a:MVP24:1495665626688131183> Trigger a Regret Games Event')
        .setDescription('Pick the event type. The bot will choose who it affects.')
    ], components: [row], ephemeral: true });
  },

  // ── Handle Event Select ───────────────────────────────────────────────────
  async handleEventSelect(interaction, seasonId, hostId) {
    if (interaction.user.id !== hostId)
      return interaction.reply({ content: '<:wrong:1495666083594502174> This menu isn\'t for you.', ephemeral: true });

    const season = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [seasonId]);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> Season not found.', ephemeral: true });

    const eventType    = interaction.values[0];
    const alive        = await getAlivePlayers(season.id);
    const arenaChannel = await getArenaChannel(season, interaction.client);

    await interaction.deferUpdate();

    if (!alive.length || !arenaChannel) return;

    switch (eventType) {
      case 'hunger':    await processHungerEvent(season, alive, arenaChannel);   break;
      case 'chaos':     await processChaosEvent(season, alive, arenaChannel);    break;
      case 'blessing':  await processBlessingEvent(season, alive, arenaChannel); break;
      case 'massacre':  await processMassacreEvent(season, alive, arenaChannel); break;
      case 'roulette':  await processRouletteEvent(season, alive, arenaChannel); break;
      case 'theft':     await processTheftEvent(season, alive, arenaChannel);    break;
      case 'betrayal':  await processBetrayalEvent(season, alive, arenaChannel); break;
      case 'confession':await processConfessionEvent(season, alive, arenaChannel); break;
    }

    await this._checkWinCondition(season, interaction.client);
    await interaction.followUp({ content: `<:checkmark:1495666088417956002> **${EVENT_TYPES[eventType]?.label}** triggered.`, ephemeral: true });
  },

  // ── End Game ──────────────────────────────────────────────────────────────
  async endGame(interaction) {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '<:wrong:1495666083594502174> Staff only.', ephemeral: true });

    const season = await getActiveSeason(interaction.guild.id);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Regret Games.', ephemeral: true });

    await this._resolveWinner(season, interaction.client, true);
    return interaction.reply({ content: '<:checkmark:1495666088417956002> Regret Games ended.', ephemeral: true });
  },

  // ── Win Condition Check ───────────────────────────────────────────────────
  async _checkWinCondition(season, client) {
    const alive = await getAlivePlayers(season.id);
    if (alive.length <= 1) await this._resolveWinner(season, client, false);
  },

  async _resolveWinner(season, client, forced) {
    const alive = await getAlivePlayers(season.id);
    const arenaChannel = await getArenaChannel(season, client);

    await db.run("UPDATE rg_seasons SET status = 'ended' WHERE id = $1", [season.id]);

    if (!alive.length) {
      if (arenaChannel) await arenaChannel.send({ embeds: [
        new EmbedBuilder().setColor('#000000').setTitle('<a:larry_cry:1497476839608815706> NO SURVIVORS')
          .setDescription('Everyone was eliminated. There is no winner. The arena is satisfied.')
          .setFooter({ text: 'Congratulations. You honored the name: Play & Regret.' })
      ]});
      return;
    }

    const winner   = alive[0];
    const prize    = season.prize_pot || season.pot;
    const allPlayers = await getAllPlayers(season.id);

    await economy.addFunds(winner.user_id, prize, 'Regret Games winner');
    await db.run('UPDATE rg_players SET title = $1 WHERE season_id = $2 AND user_id = $3', ['Regret Royalty', season.id, winner.user_id]);

    if (arenaChannel) await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#FF00AA')
        .setTitle('<a:MVP24:1495665626688131183> REGRET GAMES WINNER')
        .setImage(GIFS.winner)
        .setDescription(
          `**${winner.username}** survived.\n\n` +
          `*Not because you were good. Because everyone else was worse.*\n\n` +
          `<:Sins:1478993005187698789> **+${prize.toLocaleString()} sins**\n` +
          `<a:hmmdevil:1495665623219306647> **Final REGRET:** ${winner.regret}\n` +
          `<a:purplesparkle:1479210541691175054> **Title:** Regret Royalty\n\n` +
          `**Season Results:**\n` +
          allPlayers.map((p, i) => `${i === 0 ? '<a:MVP24:1495665626688131183>' : '<:purp_caveira50:1495665632845369354>'} **${p.username}** — ${p.regret} REGRET${p.title ? ` — ${p.title}` : ''}`).join('\n')
        )
        .setFooter({ text: 'Congratulations. You are still questionable.' })
    ]});
  },

  // ── Player: Join ──────────────────────────────────────────────────────────
  async join(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season || season.status !== 'signup')
      return interaction.reply({ content: '<:wrong:1495666083594502174> No open signups right now.', ephemeral: true });
    // Redirect to button flow
    return interaction.reply({ content: 'Head to the arena channel and click the **Join the Mistake** button!', ephemeral: true });
  },

  // ── Player: Vote ─────────────────────────────────────────────────────────
  async vote(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season || !season.vote_open)
      return interaction.reply({ content: '<:wrong:1495666083594502174> Voting isn\'t open right now.', ephemeral: true });
    return interaction.reply({ content: 'Head to the votes channel to cast your vote!', ephemeral: true });
  },

  // ── Player: Steal ─────────────────────────────────────────────────────────
  async steal(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season || season.status !== 'active')
      return interaction.reply({ content: '<:wrong:1495666083594502174> No active game.', ephemeral: true });

    const cd = getCooldownLeft(interaction.user.id, 'steal');
    if (cd > 0) return interaction.reply({ content: `<:wrong:1495666083594502174> Steal cooldown: **${fmtTime(cd)}** remaining.`, ephemeral: true });

    const player = await getPlayer(season.id, interaction.user.id);
    if (!player || player.status !== 'alive')
      return interaction.reply({ content: '<:wrong:1495666083594502174> You\'re not in the game.', ephemeral: true });

    const target = interaction.options.getUser('user');
    if (target.id === interaction.user.id)
      return interaction.reply({ content: '<:wrong:1495666083594502174> You can\'t steal from yourself.', ephemeral: true });

    const targetPlayer = await getPlayer(season.id, target.id);
    if (!targetPlayer || targetPlayer.status !== 'alive')
      return interaction.reply({ content: '<:wrong:1495666083594502174> That player isn\'t in the game.', ephemeral: true });

    setCooldown(interaction.user.id, 'steal', 12 * 60 * 60 * 1000);

    const success = Math.random() < 0.5;
    const arenaChannel = await getArenaChannel(season, interaction.client);

    if (success) {
      const amount = Math.floor(Math.random() * 150) + 50;
      await economy.removeFunds(target.id, amount, 'Regret Games steal').catch(() => {});
      await economy.addFunds(interaction.user.id, amount, 'Regret Games steal').catch(() => {});
      if (arenaChannel) await arenaChannel.send(
        `<a:moneybag:1479268556687540345> **${interaction.user.username}** stole **${amount} sins** from **${targetPlayer.username}**. *Shameless.*`
      );
      return interaction.reply({ content: `<:checkmark:1495666088417956002> Stole **${amount} sins** from **${targetPlayer.username}**.`, ephemeral: true });
    } else {
      await addRegret(season.id, interaction.user.id, 80);
      if (arenaChannel) await arenaChannel.send(
        `<:wrong:1495666083594502174> **${interaction.user.username}** tried to steal from **${targetPlayer.username}** and failed. +80 REGRET. *Embarrassing.*`
      );
      return interaction.reply({ content: '<:wrong:1495666083594502174> Steal failed. +80 REGRET.', ephemeral: true });
    }
  },

  // ── Player: Betray ────────────────────────────────────────────────────────
  async betray(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season || season.status !== 'active')
      return interaction.reply({ content: '<:wrong:1495666083594502174> No active game.', ephemeral: true });

    const cd = getCooldownLeft(interaction.user.id, 'betray');
    if (cd > 0) return interaction.reply({ content: `<:wrong:1495666083594502174> Betray cooldown: **${fmtTime(cd)}** remaining.`, ephemeral: true });

    const player = await getPlayer(season.id, interaction.user.id);
    if (!player || player.status !== 'alive')
      return interaction.reply({ content: '<:wrong:1495666083594502174> You\'re not in the game.', ephemeral: true });

    const target       = interaction.options.getUser('user');
    const targetPlayer = await getPlayer(season.id, target.id);
    if (!targetPlayer || targetPlayer.status !== 'alive')
      return interaction.reply({ content: '<:wrong:1495666083594502174> That player isn\'t in the game.', ephemeral: true });

    const alliance = await getAlliance(season.id, interaction.user.id, target.id);
    if (!alliance)
      return interaction.reply({ content: '<:wrong:1495666083594502174> You\'re not allied with that player.', ephemeral: true });

    await db.run("UPDATE rg_alliances SET status = 'broken' WHERE id = $1", [alliance.id]);
    setCooldown(interaction.user.id, 'betray', 24 * 60 * 60 * 1000);

    const hasSnakePass = await hasItem(season.id, interaction.user.id, 'snake_pass');
    const regretPenalty = hasSnakePass ? 0 : 150;
    if (hasSnakePass) await removeItem(season.id, interaction.user.id, 'snake_pass');

    await addRegret(season.id, interaction.user.id, regretPenalty);
    await addRegret(season.id, target.id, 150);
    await economy.addFunds(interaction.user.id, 300, 'Betrayal reward').catch(() => {});

    const arenaChannel = await getArenaChannel(season, interaction.client);
    if (arenaChannel) await arenaChannel.send({ embeds: [
      new EmbedBuilder().setColor('#5A0F2E')
        .setTitle('<a:snake12:1497477227963613334> BETRAYAL DETECTED')
        .setDescription(
          `**${interaction.user.username}** betrayed **${targetPlayer.username}**.\n\n` +
          `*You traded loyalty for survival. It worked. It still looks ugly.*\n\n` +
          `<a:moneybag:1479268556687540345> **Reward:** +300 sins\n` +
          `<a:hmmdevil:1495665623219306647> **Penalty:** +${regretPenalty} REGRET${hasSnakePass ? ' (waived — Snake Pass used)' : ''}\n` +
          `<:purp_caveira50:1495665632845369354> **${targetPlayer.username}:** +150 REGRET`
        )
        .setFooter({ text: 'Friendship was never in the rules.' })
    ]});

    return interaction.reply({ content: `<:checkmark:1495666088417956002> Betrayal complete. +300 sins.`, ephemeral: true });
  },

  // ── Player: Ally ──────────────────────────────────────────────────────────
  async ally(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season || season.status !== 'active')
      return interaction.reply({ content: '<:wrong:1495666083594502174> No active game.', ephemeral: true });

    const cd = getCooldownLeft(interaction.user.id, 'ally');
    if (cd > 0) return interaction.reply({ content: `<:wrong:1495666083594502174> Ally cooldown: **${fmtTime(cd)}** remaining.`, ephemeral: true });

    const player = await getPlayer(season.id, interaction.user.id);
    if (!player || player.status !== 'alive')
      return interaction.reply({ content: '<:wrong:1495666083594502174> You\'re not in the game.', ephemeral: true });

    const target       = interaction.options.getUser('user');
    const targetPlayer = await getPlayer(season.id, target.id);
    if (!targetPlayer || targetPlayer.status !== 'alive')
      return interaction.reply({ content: '<:wrong:1495666083594502174> That player isn\'t in the game.', ephemeral: true });

    const existing = await getPlayerAlliance(season.id, interaction.user.id);
    if (existing) return interaction.reply({ content: '<:wrong:1495666083594502174> You already have an alliance. Break it first.', ephemeral: true });

    await db.run(
      'INSERT INTO rg_alliances (season_id, user_a, username_a, user_b, username_b, status) VALUES (?, ?, ?, ?, ?, \'active\')',
      [season.id, interaction.user.id, interaction.user.username, target.id, targetPlayer.username]
    );

    setCooldown(interaction.user.id, 'ally', 6 * 60 * 60 * 1000);

    const arenaChannel = await getArenaChannel(season, interaction.client);
    if (arenaChannel) await arenaChannel.send(
      `<a:purplesparkle:1479210541691175054> **${interaction.user.username}** and **${targetPlayer.username}** formed an alliance. *Trust nobody. Especially each other.*`
    );

    return interaction.reply({ content: `<:checkmark:1495666088417956002> Allied with **${targetPlayer.username}**. Don\'t make it weird.`, ephemeral: true });
  },

  // ── Player: Break Alliance ────────────────────────────────────────────────
  async breakAlly(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No active game.', ephemeral: true });

    const alliance = await getPlayerAlliance(season.id, interaction.user.id);
    if (!alliance) return interaction.reply({ content: '<:wrong:1495666083594502174> You don\'t have an active alliance.', ephemeral: true });

    const cd = getCooldownLeft(interaction.user.id, 'breakally');
    if (cd > 0) return interaction.reply({ content: `<:wrong:1495666083594502174> Break ally cooldown: **${fmtTime(cd)}** remaining.`, ephemeral: true });

    await db.run("UPDATE rg_alliances SET status = 'broken' WHERE id = $1", [alliance.id]);
    await addRegret(season.id, interaction.user.id, 100);
    setCooldown(interaction.user.id, 'breakally', 12 * 60 * 60 * 1000);

    const arenaChannel = await getArenaChannel(season, interaction.client);
    const allyName = alliance.user_a === interaction.user.id ? alliance.username_b : alliance.username_a;
    if (arenaChannel) await arenaChannel.send(
      `<:wrong:1495666083594502174> **${interaction.user.username}** publicly broke their alliance with **${allyName}**. +100 REGRET. *Cold.*`
    );

    return interaction.reply({ content: `<:checkmark:1495666088417956002> Alliance broken. +100 REGRET.`, ephemeral: true });
  },

  // ── Player: Shop ──────────────────────────────────────────────────────────
  async shop(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    const items = Object.entries(SHOP_ITEMS).map(([id, item]) =>
      `• **${item.name}** — ${item.cost} sins\n  *${item.desc}*`
    ).join('\n\n');
    const embed = new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('<:pd_zPurple_Pin:1495665628672037046> Regret Games Shop')
      .setDescription((season ? items : '*No active Regret Games.*') + '\n\nUse `/rg buy` to purchase.');
    try {
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({ embeds: [embed], ephemeral: true });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {}
  },

  // ── Player: Buy ───────────────────────────────────────────────────────────
  async buy(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season || season.status !== 'active')
      return interaction.reply({ content: '<:wrong:1495666083594502174> No active game.', ephemeral: true });

    const player = await getPlayer(season.id, interaction.user.id);
    if (!player || player.status !== 'alive')
      return interaction.reply({ content: '<:wrong:1495666083594502174> You\'re not in the game.', ephemeral: true });

    const options = Object.entries(SHOP_ITEMS).map(([id, item]) => ({
      label: item.name,
      value: id,
      description: `${item.cost} sins — ${item.desc}`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rg_buy:${season.id}:${interaction.user.id}`)
        .setPlaceholder('Pick an item...')
        .addOptions(options)
    );

    return interaction.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:moneybag:1479268556687540345> Buy an Item')
        .setDescription('Select an item to purchase:')
    ], components: [row], ephemeral: true });
  },

  // ── Handle Buy Select ─────────────────────────────────────────────────────
  async handleBuy(interaction, seasonId, userId) {
    if (interaction.user.id !== userId)
      return interaction.reply({ content: '<:wrong:1495666083594502174> This menu isn\'t for you.', ephemeral: true });

    const season = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [seasonId]);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> Season not found.', ephemeral: true });

    const itemId = interaction.values[0];
    const item   = SHOP_ITEMS[itemId];
    if (!item) return interaction.reply({ content: '<:wrong:1495666083594502174> Invalid item.', ephemeral: true });

    const cd = getCooldownLeft(userId, 'buy');
    if (cd > 0) return interaction.reply({ content: `<:wrong:1495666083594502174> Shop cooldown: **${fmtTime(cd)}** remaining.`, ephemeral: true });

    await economy.getUser(userId, interaction.user.username);
    const bal = await economy.getBalance(userId);
    if (bal < item.cost)
      return interaction.reply({ content: `<:wrong:1495666083594502174> You need **${item.cost} sins** but only have **${bal}**.`, ephemeral: true });

    // Handle fake_apology immediately
    if (itemId === 'fake_apology') {
      await db.run('UPDATE rg_players SET regret = GREATEST(0, regret - 100) WHERE season_id = $1 AND user_id = $2', [season.id, userId]);
      await economy.removeFunds(userId, item.cost, 'Regret Games shop');
      setCooldown(userId, 'buy', 10 * 60 * 1000);
      return interaction.reply({ content: `<:checkmark:1495666088417956002> Used **Fake Apology**. -100 REGRET.`, ephemeral: true });
    }

    // Handle humiliation pass immediately
    if (itemId === 'humiliation_pass') {
      // Show target selection dropdown
      const alivePlayers = await getAlivePlayers(season.id);
      const targetOptions = alivePlayers
        .filter(p => p.user_id !== userId)
        .map(p => ({ label: p.username, value: p.user_id, description: `REGRET: ${p.regret || 0}` }));
      if (!targetOptions.length) return interaction.reply({ content: '<:wrong:1495666083594502174> No targets available.', ephemeral: true });
      const targetRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rg_humil:${season.id}:${userId}`)
          .setPlaceholder('Pick your target...')
          .addOptions(targetOptions.slice(0, 25))
      );
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('<a:hmmdevil:1495665623219306647> Public Humiliation Pass')
          .setDescription('Select who to publicly humiliate:')
      ], components: [targetRow], ephemeral: true });
    }

    await addItem(season.id, userId, itemId);
    await economy.removeFunds(userId, item.cost, 'Regret Games shop');
    setCooldown(userId, 'buy', 10 * 60 * 1000);

    return interaction.reply({ content: `<:checkmark:1495666088417956002> Purchased **${item.name}**. It\'s now in your inventory.`, ephemeral: true });
  },

  // ── Leaderboard ───────────────────────────────────────────────────────────
  async leaderboard(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Regret Games.', ephemeral: true });

    const players = await getAllPlayers(season.id);
    if (!players.length) return interaction.reply({ content: 'No players yet.', ephemeral: true });

    const medals = ['<a:1stplace:1487504691880263791>', '<a:2ndplace:1487504692874580048>', '<a:3rdplace:1487504694191456336>'];
    const lines  = players.map((p, i) => {
      const status = p.status === 'alive' ? '<a:purplesparkle:1479210541691175054>' : '<:purp_caveira50:1495665632845369354>';
      return `${medals[i] || `${i + 1}.`} ${status} **${p.username}** — ${p.regret} REGRET${p.title ? ` — *${p.title}*` : ''}`;
    });

    return interaction.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:purplefire:1479219348353716415> REGRET LEADERBOARD')
        .setDescription(
          '*A public list of people making increasingly worse decisions.*\n\n' +
          lines.join('\n')
        )
        .setFooter({ text: 'Shame is temporary. Screenshots are forever.' })
    ]});
  },

  // ── Recap ────────────────────────────────────────────────────────────────────
  async recap(interaction) {
    const season = await db.get(
      "SELECT * FROM rg_seasons WHERE guild_id = $1 AND status != 'ended' ORDER BY id DESC LIMIT 1",
      [interaction.guild.id]
    );
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No Regret Games found.', ephemeral: true });

    const players  = await getAllPlayers(season.id);
    const votes    = await db.all('SELECT * FROM rg_votes WHERE season_id = $1 ORDER BY day, created_at', [season.id]);
    const alliances = await db.all('SELECT * FROM rg_alliances WHERE season_id = $1', [season.id]);

    const elims = players.filter(p => p.status === 'eliminated')
      .sort((a, b) => (a.elim_day || 0) - (b.elim_day || 0));
    const alive = players.filter(p => p.status === 'alive');

    // Build elimination timeline
    const timeline = elims.map(p =>
      `<:purp_caveira50:1495665632845369354> **Day ${p.elim_day || '?'}** — **${p.username}** — ${p.elim_cause || 'eliminated'} — *${p.title || 'no title'}*`
    ).join('\n') || '*No eliminations yet.*';

    // Build vote summary
    const voteGroups = {};
    for (const v of votes) {
      const key = `Day ${v.day}`;
      if (!voteGroups[key]) voteGroups[key] = [];
      voteGroups[key].push(`  • **${v.voter_name}** → **${v.target_name}**`);
    }
    const voteSummary = Object.entries(voteGroups)
      .map(([day, vs]) => `**${day}:**
${vs.join('\n')}`)
      .join('\n') || '*No votes cast yet.*';

    // Betrayals
    const betrayals = alliances.filter(a => a.status === 'broken');
    const betrayalLines = betrayals.map(a =>
      `<a:snake12:1497477227963613334> **${a.username_a}** ↔ **${a.username_b}** — alliance broken`
    ).join('\n') || '*No betrayals recorded.*';

    return interaction.reply({ embeds: [
      new EmbedBuilder().setColor('#6B2FA0')
        .setTitle('<:pd_zPurple_Pin:1495665628672037046> Regret Games Recap')
        .addFields(
          { name: '<a:larry_cry:1497476839608815706> Elimination Order', value: timeline.slice(0, 1024), inline: false },
          { name: '<a:purplesparkle:1479210541691175054> Still Alive',   value: alive.map(p => `**${p.username}** — ${p.regret} REGRET`).join('\n') || 'Nobody.', inline: false },
          { name: '<a:purplesparkle:1479210541691175054> Vote History',  value: voteSummary.slice(0, 1024), inline: false },
          { name: '<a:snake12:1497477227963613334> Betrayals',          value: betrayalLines.slice(0, 1024), inline: false },
        )
        .setFooter({ text: `Season Day ${season.current_day} • ${season.status}` })
    ]});
  },

  // ── Status ────────────────────────────────────────────────────────────────
  async status(interaction) {
    const season = await getActiveSeason(interaction.guild.id);
    if (!season) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Regret Games. Start one with `/rg startgame fee:500`.', ephemeral: true });

    const alive = await getAlivePlayers(season.id);
    const all   = await getAllPlayers(season.id);

    return interaction.reply({ embeds: [
      new EmbedBuilder().setColor('#6B2FA0')
        .setTitle('<:pd_zPurple_Pin:1495665628672037046> Regret Games Status')
        .addFields(
          { name: 'Day',           value: `**${season.current_day}**`,             inline: true },
          { name: 'Status',        value: season.status,                           inline: true },
          { name: 'Prize Pot',     value: `**${(season.prize_pot || season.pot).toLocaleString()} sins**`, inline: true },
          { name: 'Alive',         value: `**${alive.length}** of **${all.length}**`, inline: true },
          { name: 'Voting',        value: season.vote_open ? '<:greendot:1497477975925588100> Open' : '<:reddot:1497477977171300473> Closed', inline: true },
        )
        .setDescription(alive.map(p => `<a:purplesparkle:1479210541691175054> **${p.username}** — ${p.regret} REGRET`).join('\n') || 'No players alive.')
    ]});
  },

  // ── Init (register interactions) ──────────────────────────────────────────
  init(client) {
    client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isButton()) {
          if (interaction.customId.startsWith('rg_join:')) {
            const seasonId = interaction.customId.split(':')[1];
            return await this.handleJoinButton(interaction, seasonId);
          }
          if (interaction.customId.startsWith('rg_rules:')) {
            return interaction.reply({ content:
              '**Regret Games Rules:**\n' +
              '• Pay the entry fee to join\n' +
              '• Survive daily events\n' +
              '• Vote to eliminate other players\n' +
              '• Form and betray alliances\n' +
              '• Buy items to protect yourself\n' +
              '• Last one standing wins 90% of the pot\n' +
              '• 10% goes to the jackpot\n\n' +
              '*Good luck. You will need it.*',
              ephemeral: true
            });
          }
        }
        if (interaction.isStringSelectMenu()) {
          if (interaction.customId.startsWith('rg_vote:')) {
            const seasonId = interaction.customId.split(':')[1];
            return await this.handleVote(interaction, seasonId);
          }
          if (interaction.customId.startsWith('rg_event:')) {
            const [, seasonId, hostId] = interaction.customId.split(':');
            return await this.handleEventSelect(interaction, seasonId, hostId);
          }
          if (interaction.customId.startsWith('rg_buy:')) {
            const [, seasonId, userId] = interaction.customId.split(':');
            return await this.handleBuy(interaction, seasonId, userId);
          }
          if (interaction.customId.startsWith('rg_humil:')) {
            const [, seasonId, hostId] = interaction.customId.split(':');
            if (interaction.user.id !== hostId)
              return interaction.reply({ content: '<:wrong:1495666083594502174> This menu is not for you.', ephemeral: true });
            const targetId   = interaction.values[0];
            const season     = await db.get('SELECT * FROM rg_seasons WHERE id = $1', [seasonId]);
            const target     = await getPlayer(seasonId, targetId);
            const arenaChannel = season ? await getArenaChannel(season, interaction.client) : interaction.channel;
            // Deduct cost and consume item
            await economy.removeFunds(hostId, SHOP_ITEMS.humiliation_pass.cost, 'Regret Games humiliation').catch(() => {});
            if (arenaChannel && target) {
              await arenaChannel.send(
                `<a:hmmdevil:1495665623219306647> **${target.username}** has been publicly humiliated by an anonymous source.\n*${getInsult(target.regret || 0)}*`
              ).catch(() => {});
            }
            return interaction.reply({ content: '<:checkmark:1495666088417956002> Humiliation delivered.', ephemeral: true });
          }
        }
      } catch (err) {
        console.error('[RegretGames] interaction error:', err);
        try {
          const msg = `<:wrong:1495666083594502174> Something went wrong: ${err.message}`;
          if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
          else await interaction.reply({ content: msg, ephemeral: true });
        } catch (_) {}
      }
    });
  },
};
