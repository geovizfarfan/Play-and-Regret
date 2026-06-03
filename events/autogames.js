/**
 * events/autogames.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto Games: Hunger Games, Rumble, Dodge Loser, Lotería
 *
 * SCHEDULING
 *   Commands accept an optional Discord timestamp as the last argument:
 *     !hungergames 50 <t:1776177600:F>
 *     !rumble 50 <t:1776177600:F>
 *     !dodgeloser 50 <t:1776177600:F>
 *     !loteria 50 <t:1776177600:F>
 *
 *   • Signups open IMMEDIATELY and stay open until the timestamp fires.
 *   • 1 scheduled/active game per channel; unlimited across channels.
 *   • Schedules persist in PostgreSQL — survive bot restarts.
 *   • If the bot was down when the timestamp fired, host/admin can run
 *     !startgame to fire it manually.
 *
 * CANCELLATION
 *   !cancelevent — works for the host who created it, Event Host role,
 *                  Administrator permission, or the server Owner.
 *
 * OTHER COMMANDS
 *   !signup / !enter  — join the open game in this channel
 *   !startgame        — manually fire a scheduled game now
 *   !schedule         — show what's pending in this channel
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats, db } = require('../utils/database');
const jackpot = require('../utils/jackpot');
const E = require('../utils/emojis');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const MIN_PLAYERS     = parseInt(process.env.MIN_PLAYERS) || 4;

// In-memory map of active signup phases: channelId → eventObject
// eventObject shape:
// {
//   scheduleId, channelId, type, bet, hostId, hostName,
//   fireAt (Date|null), players [], phase ('signup'|'running'),
//   message (Discord Message), timer (setTimeout handle)
// }
const activeEvents = new Map();

// ─── Permission helpers ───────────────────────────────────────────────────────
function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  if (member.guild?.ownerId === member.id) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

function canCancel(member, hostId) {
  if (!member) return false;
  if (member.id === hostId) return true;
  return hasHostRole(member);
}

// ─── Timestamp parser ─────────────────────────────────────────────────────────
// Accepts a Discord timestamp like <t:1776177600:F> or raw Unix seconds
function parseTimestamp(str) {
  if (!str) return null;
  const match = str.match(/<t:(\d+)(?::[A-Za-z])?>/);
  if (match) return new Date(parseInt(match[1]) * 1000);
  const n = parseInt(str);
  if (!isNaN(n) && n > 1_000_000_000) return new Date(n * 1000);
  return null;
}

// ─── Narrative pools ──────────────────────────────────────────────────────────
const HG = {
  kill: [
    '{A} tracked {B} to their camp and eliminated them before dawn.',
    '{A} poisoned {B}\'s water supply. {B} didn\'t make it.',
    '{A} lured {B} into a trap and struck from the shadows.',
    '{A} outmaneuvered {B} in a fierce battle near the river.',
    '{A} ambushed {B} while they slept.',
    '{A} and {B} fought for supplies — only {A} walked away.',
    '{A} pushed {B} off the edge of the cliff.',
    '{A} discovered {B}\'s hiding spot and made their move.',
    '{A} fired an arrow from the treetops. {B} never saw it coming.',
    '{A} outsmarted {B} using a decoy and struck when {B} was distracted.',
  ],
  survive: [
    '{A} found a cache of food and survived another night.',
    '{A} hid in the trees all day, avoiding all danger.',
    '{A} treated their wounds using plants from the forest.',
    '{A} formed a temporary alliance that kept them safe.',
    '{A} set clever traps and waited patiently.',
    '{A} navigated a minefield without triggering anything.',
    '{A} discovered a secret bunker and restocked supplies.',
    '{A} stayed perfectly still as danger passed right by.',
  ],
  mutual: [
    '{A} and {B} fought to the death — neither survived.',
    '{A} and {B} simultaneously struck each other down.',
    '{A} and {B} were caught in a trap that took both of them out.',
    '{A} and {B} fell off the cliff together in their struggle.',
  ],
};

const RUMBLE = {
  elim: [
    '{A} clotheslined {B} over the top rope!',
    '{A} dropkicked {B} out of the ring!',
    '{A} hit {B} with a devastating suplex and tossed them out!',
    '{A} slammed {B} into the steel post and threw them over!',
    '{A} spun {B} around and launched them into the crowd!',
    '{A} countered {B}\'s finisher and dumped them over the rope!',
    '{A} caught {B} mid-air and hurled them out!',
  ],
  survive: [
    '{A} held on to the ropes with one hand, barely surviving!',
    '{A} dodged a double-team attempt and stayed alive!',
    '{A} took a massive hit but refused to go over the rope!',
    '{A} rolled back in under the bottom rope — still alive!',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt   = (t, A, B) => t.replace('{A}', `**${A}**`).replace('{B}', `**${B}**`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Game runners ─────────────────────────────────────────────────────────────
async function runHungerGames(channel, players, bet) {
  let alive = [...players];
  let round = 1;
  const kills = new Map();

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#8B0000')
      .setTitle('🏹 The Hunger Games Begin!')
      .setDescription(
        `**${alive.length} tributes** enter the arena.\n\n` +
        alive.map(p => `• ${p.username}`).join('\n') +
        `\n\n💰 Prize Pool: **${(bet * alive.length).toLocaleString()} oops**\n\n*Let the games begin...*`
      )
      .setFooter({ text: 'May the odds be ever in your favor.' })
  ]});

  while (alive.length > 1) {
    await sleep(4500);
    const events  = [];
    const toRemove = new Set();
    alive.sort(() => Math.random() - 0.5);

    let i = 0;
    while (i < alive.length) {
      if (alive.length - toRemove.size <= 1) break;
      const roll    = Math.random();
      const hasNext = i + 1 < alive.length;

      if (roll < 0.30 && hasNext) {
        events.push(`${E.HG_MUTUAL} ` + fmt(pick(HG.mutual), alive[i].username, alive[i+1].username));
        toRemove.add(alive[i].id); toRemove.add(alive[i+1].id);
        i += 2;
      } else if (roll < 0.65 && hasNext) {
        const [a, b] = [alive[i], alive[i+1]];
        events.push(`${E.HG_KILL} ` + fmt(pick(HG.kill), a.username, b.username));
        kills.set(a.id, (kills.get(a.id) || 0) + 1);
        toRemove.add(b.id);
        i += 2;
      } else {
        events.push(`${E.HG_SURVIVE} ` + fmt(pick(HG.survive), alive[i].username, ''));
        i++;
      }
    }

    alive = alive.filter(p => !toRemove.has(p.id));

    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#8B0000')
        .setTitle(`🏹 Day ${round} — The Arena`)
        .setDescription(events.join('\n') || '*(A tense silence falls over the arena...)*')
        .addFields({ name: `👥 Survivors (${alive.length})`, value: alive.map(p => p.username).join(', ') || 'None' })
    ]});

    round++;
    if (alive.length === 0) break;
  }
  return { winners: alive, kills };
}

async function runRumble(channel, players, bet) {
  let remaining = [...players].sort(() => Math.random() - 0.5);
  let round = 1;
  const eliminations = new Map();

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#FF6600')
      .setTitle('⚔️ BATTLE ROYALE RUMBLE!')
      .setDescription(
        `**${remaining.length} competitors** enter the ring!\n\n` +
        remaining.map((p, i) => `**${i+1}.** ${p.username}`).join('\n') +
        `\n\n💰 Prize Pool: **${(bet * remaining.length).toLocaleString()} oops**\n\n*THE RUMBLE BEGINS!*`
      )
      .setFooter({ text: 'Last one standing wins!' })
  ]});

  while (remaining.length > 1) {
    await sleep(4000);
    const events     = [];
    const eliminated = new Set();
    remaining.sort(() => Math.random() - 0.5);

    for (let i = 0; i < remaining.length; i++) {
      if (remaining.length - eliminated.size <= 1) break;
      if (eliminated.has(remaining[i].id)) continue;
      const next = remaining.find((p, j) => j > i && !eliminated.has(p.id));

      if (Math.random() < 0.50 && next) {
        events.push(`${E.RUMBLE_ELIM} ` + fmt(pick(RUMBLE.elim), remaining[i].username, next.username));
        eliminations.set(remaining[i].id, (eliminations.get(remaining[i].id) || 0) + 1);
        eliminated.add(next.id);
      } else {
        events.push(`${E.RUMBLE_SURVIVE} ` + fmt(pick(RUMBLE.survive), remaining[i].username, ''));
      }
    }

    remaining = remaining.filter(p => !eliminated.has(p.id));

    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FF6600')
        .setTitle(`⚔️ Round ${round}`)
        .setDescription(events.join('\n') || '*(The competitors circle each other warily...)*')
        .addFields({ name: `💪 Still Standing (${remaining.length})`, value: remaining.map(p => p.username).join(', ') || 'None' })
    ]});
    round++;
  }
  return { winners: remaining, eliminations };
}

// ─── Finish a game and pay out ────────────────────────────────────────────────
async function finishGame(channel, ev, result) {
  const { type, players, bet } = ev;
  const pot = bet * players.length;

  // Stats
  for (const p of players) {
    if (type === 'hungergames') stats.increment(p.id, 'hunger_games_participations').catch(() => {});
    if (type === 'rumble')      stats.increment(p.id, 'rumble_participations').catch(() => {});
  }

  const winners = result.winners;

  if (!winners || winners.length === 0) {
    await jackpot.addToDrawFund(pot);
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#555555')
        .setTitle('💀 No Survivors')
        .setDescription(`Everyone eliminated — **${pot.toLocaleString()} oops** goes to the jackpot fund.`)
    ]});
    return;
  }

  const share = Math.floor(pot / winners.length);
  for (const w of winners) {
    await economy.getUser(w.id, w.username);
    await economy.addFunds(w.id, share, `${type} winnings`);
    if (type === 'hungergames') stats.increment(w.id, 'hunger_games_wins').catch(() => {});
    if (type === 'rumble')      stats.increment(w.id, 'rumble_wins').catch(() => {});
  }
  for (const p of players) {
    if (!winners.find(w => w.id === p.id)) {
      if (type === 'hungergames') stats.increment(p.id, 'hunger_games_losses').catch(() => {});
      if (type === 'rumble')      stats.increment(p.id, 'rumble_losses').catch(() => {});
    }
  }

  const label = type === 'hungergames' ? '🏹 Victor' : '⚔️ Champion';
  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(`${E.TROPHY} ${label}${winners.length > 1 ? 's' : ''}!`)
      .setDescription(
        winners.map(w => `🏆 **${w.username}**`).join('\n') +
        `\n\n💰 Each wins **${share.toLocaleString()} oops**!`
      )
  ]});
}

// ─── Launch signup phase ──────────────────────────────────────────────────────
async function launchSignup(channel, type, bet, hostId, hostName, fireAt, scheduleId) {
  if (activeEvents.has(channel.id)) return null;

  const isHG     = type === 'hungergames';
  const isDodge  = type === 'dodgeloser';
  const isLoteria = type === 'loteria';
  const isRumble = type === 'rumble';

  const labels = {
    hungergames: { title: `${E.HG_HEADER} Hunger Games`, color: '#8B0000', icon: '🏹' },
    rumble:      { title: `${E.RUMBLE_HEADER} Rumble`,   color: '#FF6600', icon: '⚔️' },
    dodgeloser:  { title: '💨 Dodge Loser',               color: '#3498DB', icon: '💨' },
    loteria:     { title: `${E.LOTERIA || '🎴'} Lotería`, color: '#E74C3C', icon: '🎴' },
  };
  const L = labels[type] || labels.hungergames;

  const tsDisplay = fireAt
    ? `\n\n⏰ **Starts:** <t:${Math.floor(fireAt.getTime() / 1000)}:F> (<t:${Math.floor(fireAt.getTime() / 1000)}:R>)`
    : '\n\n▶️ **Starts:** when host runs `!startgame`';

  const embed = new EmbedBuilder()
    .setColor(L.color)
    .setTitle(`${L.title} — Signups Open!`)
    .setDescription(
      `**${hostName}** is hosting a **${L.title}** game!\n\n` +
      `💰 Entry fee: **${bet} oops**\n` +
      `Click **Join** or type \`!signup\` to enter.` +
      tsDisplay
    )
    .addFields({ name: '📋 Signed Up', value: '**0** players' })
    .setFooter({ text: `Min ${MIN_PLAYERS} players to start • Host: ${hostName}` });

  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`autogame_join:${channel.id}`)
      .setLabel(`${L.icon} Join`)
      .setStyle(ButtonStyle.Primary)
  );

  const msg = await channel.send({ embeds: [embed], components: [btn] });

  const ev = {
    scheduleId, channelId: channel.id, type, bet,
    hostId, hostName, fireAt,
    players: [], phase: 'signup',
    message: msg, timer: null,
  };

  activeEvents.set(channel.id, ev);

  // Schedule auto-fire
  if (fireAt) {
    const delay = fireAt.getTime() - Date.now();
    if (delay > 0) {
      ev.timer = setTimeout(() => fireGame(channel), delay);
    } else {
      // Timestamp already passed — fire immediately
      setTimeout(() => fireGame(channel), 1000);
    }
  }

  return ev;
}

// ─── Fire the game (auto or manual) ──────────────────────────────────────────
async function fireGame(channel) {
  const ev = activeEvents.get(channel.id);
  if (!ev || ev.phase === 'running') return;

  if (ev.players.length < MIN_PLAYERS) {
    // Refund and cancel
    for (const p of ev.players) {
      await economy.getUser(p.id, p.username);
      await economy.addFunds(p.id, ev.bet, 'Game cancelled — not enough players');
    }
    activeEvents.delete(channel.id);
    if (ev.scheduleId) await db.run("UPDATE scheduled_games SET status = 'cancelled' WHERE id = ?", [ev.scheduleId]).catch(() => {});

    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`autogame_join:${channel.id}`)
        .setLabel('Cancelled')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await ev.message?.edit({ components: [disabledBtn] }).catch(() => {});
    await channel.send(`❌ **${ev.type}** cancelled — only **${ev.players.length}** player(s) signed up (need ${MIN_PLAYERS}). Everyone has been refunded.`);
    return;
  }

  ev.phase = 'running';
  if (ev.timer) clearTimeout(ev.timer);
  if (ev.scheduleId) await db.run("UPDATE scheduled_games SET status = 'running' WHERE id = ?", [ev.scheduleId]).catch(() => {});

  // Disable join button
  const disabledBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`autogame_join:${channel.id}`)
      .setLabel('Signups Closed')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  await ev.message?.edit({ components: [disabledBtn] }).catch(() => {});
  await channel.send(`🚀 **Signups closed!** Starting with **${ev.players.length}** players...`);

  try {
    let result;
    if (ev.type === 'hungergames') result = await runHungerGames(channel, ev.players, ev.bet);
    else if (ev.type === 'rumble') result = await runRumble(channel, ev.players, ev.bet);
    else if (ev.type === 'dodgeloser') result = await runDodgeLoser(channel, ev.players, ev.bet);
    else if (ev.type === 'loteria')    result = await runLoteriaAuto(channel, ev.players, ev.bet);
    else result = await runHungerGames(channel, ev.players, ev.bet);

    if (ev.type === 'hungergames' || ev.type === 'rumble') {
      await finishGame(channel, ev, result);
    }
  } catch (err) {
    console.error(`[AutoGames] Error running ${ev.type}:`, err);
    await channel.send('❌ Something went wrong during the game. Players have been refunded.').catch(() => {});
    for (const p of ev.players) {
      await economy.addFunds(p.id, ev.bet, 'Game error refund').catch(() => {});
    }
  } finally {
    activeEvents.delete(channel.id);
    if (ev.scheduleId) await db.run("UPDATE scheduled_games SET status = 'finished' WHERE id = ?", [ev.scheduleId]).catch(() => {});
  }
}

// ─── Dodge Loser runner ───────────────────────────────────────────────────────
// Delegates to chaosroyale module's game logic by re-using its narrative
async function runDodgeLoser(channel, players, bet) {
  // Simplified inline version so we don't need to import chaosroyale
  const THROWN = [
    ['a water bottle','a shoe','a half-eaten sandwich','a TV remote'],
    ['a microwave','a full rotisserie chicken','a traffic cone','a bowling ball'],
    ['a vending machine','a porta-potty','a small car','a wedding cake'],
    ['a 1997 Honda Civic','a shipping container','a zamboni','the concept of time itself'],
  ];
  const ELIM = [
    '{A} grabbed {OBJ} and launched it at {B}. Direct hit.',
    '{A} nailed {B} with {OBJ}. {B} is out.',
    '{A} sent {OBJ} flying at {B}. Devastating.',
    '{B} made eye contact with {A}. Big mistake. {OBJ} followed.',
  ];

  let alive = [...players].sort(() => Math.random() - 0.5);
  let round = 1;

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#3498DB')
      .setTitle('💨 DODGE LOSER BEGINS!')
      .setDescription(
        `**${alive.length} players** enter the arena!\n\n` +
        alive.map((p, i) => `**${i+1}.** ${p.username}`).join('\n') +
        `\n\n💰 Prize Pool: **${(bet * alive.length).toLocaleString()} oops**`
      )
  ]});

  while (alive.length > 1) {
    await sleep(3500);
    const events  = [];
    const toRemove = new Set();
    alive.sort(() => Math.random() - 0.5);

    for (let i = 0; i < alive.length - 1; i += 2) {
      if (alive.length - toRemove.size <= 1) break;
      if (Math.random() < 0.55) {
        const tier = Math.min(Math.floor(round / 3), THROWN.length - 1);
        const obj  = pick(THROWN[tier]);
        const tmpl = pick(ELIM).replace('{OBJ}', `**${obj}**`);
        events.push(fmt(tmpl, alive[i].username, alive[i+1].username));
        toRemove.add(alive[i+1].id);
        stats.increment(alive[i].id, 'dodgeloser_wins').catch(() => {});
        stats.increment(alive[i+1].id, 'dodgeloser_losses').catch(() => {});
      }
    }

    alive = alive.filter(p => !toRemove.has(p.id));
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#3498DB')
        .setTitle(`💨 Round ${round}`)
        .setDescription(events.join('\n') || '*Everyone ducked this round...*')
        .addFields({ name: '🏃 Still Alive', value: alive.map(p => p.username).join(', ') || 'None' })
    ]});
    round++;
  }

  const winner = alive[0] || null;
  if (winner) {
    const prize = bet * players.length;
    await economy.getUser(winner.id, winner.username);
    await economy.addFunds(winner.id, prize, 'Dodge Loser win');
    stats.increment(winner.id, 'dodgeloser_participations').catch(() => {});
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FFD700')
        .setTitle('🏆 Dodge Loser Champion!')
        .setDescription(`**${winner.username}** is the last one standing!\n\n💰 Wins **${prize.toLocaleString()} oops**!`)
    ]});
  } else {
    await jackpot.addToDrawFund(bet * players.length);
    await channel.send('💀 Everyone got hit! The pot goes to the jackpot fund.');
  }

  for (const p of players) stats.increment(p.id, 'dodgeloser_participations').catch(() => {});
  return { winners: winner ? [winner] : [] };
}

// ─── Lotería auto runner ──────────────────────────────────────────────────────
async function runLoteriaAuto(channel, players, bet) {
  // Auto-play version: the bot draws cards and marks boards automatically,
  // then checks for winners after each card.
  const CARDS = [
    {name:'El Gallo',n:1},{name:'El Diablito',n:2},{name:'La Dama',n:3},
    {name:'El Catrín',n:4},{name:'El Paraguas',n:5},{name:'La Sirena',n:6},
    {name:'La Escalera',n:7},{name:'La Botella',n:8},{name:'El Barril',n:9},
    {name:'El Árbol',n:10},{name:'El Melón',n:11},{name:'El Valiente',n:12},
    {name:'El Gorrito',n:13},{name:'La Muerte',n:14},{name:'La Pera',n:15},
    {name:'La Bandera',n:16},{name:'El Bandolón',n:17},{name:'El Violoncello',n:18},
    {name:'La Garza',n:19},{name:'El Pájaro',n:20},{name:'La Mano',n:21},
    {name:'La Bota',n:22},{name:'La Luna',n:23},{name:'El Cotorro',n:24},
    {name:'El Borracho',n:25},{name:'El Negrito',n:26},{name:'El Corazón',n:27},
    {name:'La Sandía',n:28},{name:'El Tambor',n:29},{name:'El Camarón',n:30},
    {name:'Las Jaras',n:31},{name:'El Músico',n:32},{name:'La Araña',n:33},
    {name:'El Soldado',n:34},{name:'La Estrella',n:35},{name:'El Cazo',n:36},
    {name:'El Mundo',n:37},{name:'El Apache',n:38},{name:'El Nopal',n:39},
    {name:'El Alacran',n:40},{name:'La Rosa',n:41},{name:'La Calavera',n:42},
    {name:'El Cantarito',n:43},{name:'El Venado',n:44},{name:'El Sol',n:45},
    {name:'La Corona',n:46},{name:'La Chalupa',n:47},{name:'El Pino',n:48},
    {name:'El Pescado',n:49},{name:'La Palma',n:50},{name:'La Maceta',n:51},
    {name:'El Arpa',n:52},{name:'La Rana',n:53},{name:'El Catrin',n:54},
  ];

  // Give each player a random 4x4 board
  const makeBoard = () => {
    const deck = [...CARDS].sort(() => Math.random() - 0.5);
    return deck.slice(0, 16);
  };

  const boards  = new Map(players.map(p => [p.id, { player: p, board: makeBoard(), marked: new Set() }]));
  const deck    = [...CARDS].sort(() => Math.random() - 0.5);
  const called  = [];
  const winners = [];

  const checkWin = (marked) => {
    if (marked.size < 4) return false;
    const m = [...marked];
    // rows
    for (let r = 0; r < 4; r++) if ([0,1,2,3].every(c => m.includes(r*4+c))) return true;
    // cols
    for (let c = 0; c < 4; c++) if ([0,1,2,3].every(r => m.includes(r*4+c))) return true;
    // diagonals
    if ([0,5,10,15].every(i => m.includes(i))) return true;
    if ([3,6,9,12].every(i => m.includes(i))) return true;
    return false;
  };

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#E74C3C')
      .setTitle(`${E.LOTERIA || '🎴'} Lotería — Game Starting!`)
      .setDescription(
        `**${players.length} players** have their boards!\n\n` +
        players.map(p => `• ${p.username}`).join('\n') +
        `\n\n💰 Prize Pool: **${(bet * players.length).toLocaleString()} oops**\n\n*Drawing cards...*`
      )
  ]});

  for (const card of deck) {
    if (winners.length > 0) break;
    await sleep(10000); // 10s between cards
    called.push(card.n);

    // Mark boards
    for (const [, bd] of boards) {
      bd.board.forEach((c, idx) => { if (c.n === card.n) bd.marked.add(idx); });
    }

    await channel.send(`🎴 **${card.name}** (card #${card.n})`);

    // Check for winners
    for (const [uid, bd] of boards) {
      if (checkWin(bd.marked)) winners.push(bd.player);
    }

    if (winners.length > 0) {
      await channel.send(`🎉 **¡LOTERÍA!** ${winners.map(w => `**${w.username}**`).join(', ')} called it!`);
      break;
    }
  }

  const prize = Math.floor((bet * players.length) / Math.max(winners.length, 1));
  for (const w of winners) {
    await economy.getUser(w.id, w.username);
    await economy.addFunds(w.id, prize, 'Lotería win');
    stats.increment(w.id, 'loteria_wins').catch(() => {});
  }
  for (const p of players) {
    if (!winners.find(w => w.id === p.id)) stats.increment(p.id, 'loteria_losses').catch(() => {});
  }

  if (winners.length === 0) {
    await jackpot.addToDrawFund(bet * players.length);
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#555555')
        .setTitle('🎴 All cards drawn — no winner!')
        .setDescription(`The **${(bet * players.length).toLocaleString()} oops** pot goes to the jackpot fund.`)
    ]});
  } else {
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FFD700')
        .setTitle('🎴 Lotería — Final Result!')
        .setDescription(winners.map(w => `🏆 **${w.username}**`).join('\n') + `\n\n💰 Each wins **${prize.toLocaleString()} oops**!`)
    ]});
  }

  return { winners };
}

// ─── DB helpers for scheduled games ──────────────────────────────────────────
async function saveSchedule(channelId, type, bet, hostId, hostName, fireAt) {
  // Upsert — one per channel
  await db.run(
    `INSERT INTO scheduled_games (channel_id, game_type, bet, fire_at, host_id, host_name, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT (channel_id) DO UPDATE
       SET game_type = EXCLUDED.game_type,
           bet       = EXCLUDED.bet,
           fire_at   = EXCLUDED.fire_at,
           host_id   = EXCLUDED.host_id,
           host_name = EXCLUDED.host_name,
           status    = 'pending'`,
    [channelId, type, bet, fireAt ? fireAt.toISOString() : null, hostId, hostName]
  );
  const row = await db.get('SELECT id FROM scheduled_games WHERE channel_id = ?', [channelId]);
  return row?.id;
}

async function savePlayers(scheduleId, players) {
  for (const p of players) {
    await db.run(
      `INSERT INTO scheduled_game_players (schedule_id, user_id, username) VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [scheduleId, p.id, p.username]
    ).catch(() => {});
  }
}

async function loadPendingSchedules(client) {
  const rows = await db.all(
    "SELECT * FROM scheduled_games WHERE status = 'pending' OR status = 'running'"
  ).catch(() => []);

  for (const row of rows) {
    if (activeEvents.has(row.channel_id)) continue;
    try {
      const channel = await client.channels.fetch(row.channel_id);
      if (!channel?.isTextBased()) continue;

      const players = await db.all(
        'SELECT user_id, username FROM scheduled_game_players WHERE schedule_id = ?',
        [row.id]
      );

      const fireAt = row.fire_at ? new Date(row.fire_at) : null;

      // Re-announce that signups are still open (bot restarted)
      const msg = await channel.send({ embeds: [
        new EmbedBuilder().setColor('#7289DA')
          .setTitle(`♻️ Game Restored — ${row.game_type}`)
          .setDescription(
            `The bot restarted but this game is still on!\n\n` +
            `💰 Entry: **${row.bet} oops** — type \`!signup\` to join.\n` +
            (fireAt ? `⏰ **Starts:** <t:${Math.floor(fireAt.getTime()/1000)}:F> (<t:${Math.floor(fireAt.getTime()/1000)}:R>)` : 'Use `!startgame` to start manually.')
          )
          .addFields({ name: '📋 Already Signed Up', value: players.length ? players.map(p => p.username).join(', ') : 'Nobody yet' })
      ], components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`autogame_join:${row.channel_id}`)
            .setLabel('Join')
            .setStyle(ButtonStyle.Primary)
        )
      ]});

      const ev = {
        scheduleId: row.id,
        channelId:  row.channel_id,
        type:       row.game_type,
        bet:        row.bet,
        hostId:     row.host_id,
        hostName:   row.host_name,
        fireAt,
        players:    players.map(p => ({ id: p.user_id, username: p.username })),
        phase:      'signup',
        message:    msg,
        timer:      null,
      };

      activeEvents.set(row.channel_id, ev);

      if (fireAt) {
        const delay = fireAt.getTime() - Date.now();
        ev.timer = setTimeout(() => fireGame(channel), Math.max(delay, 1000));
      }

      console.log(`[AutoGames] Restored ${row.game_type} in channel ${row.channel_id} (${players.length} players)`);
    } catch (err) {
      console.warn(`[AutoGames] Could not restore schedule ${row.id}:`, err.message);
    }
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────
module.exports = {
  name: 'autogames',

  // Called from index.js on ready
  async initScheduler(client) {
    await loadPendingSchedules(client);

    // Handle join button clicks
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith('autogame_join:')) return;

      const channelId = interaction.customId.split(':')[1];
      const ev = activeEvents.get(channelId);

      if (!ev || ev.phase !== 'signup') {
        return interaction.reply({ content: '❌ No open game in this channel right now.', ephemeral: true });
      }
      if (ev.players.find(p => p.id === interaction.user.id)) {
        return interaction.reply({ content: '⚠️ You\'re already signed up!', ephemeral: true });
      }

      await interaction.deferUpdate();

      await economy.getUser(interaction.user.id, interaction.user.username);
      const bal = await economy.getBalance(interaction.user.id);
      if (bal < ev.bet) {
        return interaction.followUp({ content: `❌ You need **${ev.bet} oops** to join. Check \`!balance\`.`, ephemeral: true });
      }

      await economy.removeFunds(interaction.user.id, ev.bet, `${ev.type} entry fee`);
      ev.players.push({ id: interaction.user.id, username: interaction.user.username });
      if (ev.scheduleId) await savePlayers(ev.scheduleId, [{ id: interaction.user.id, username: interaction.user.username }]);

      // Update embed player count
      const embed = ev.message.embeds[0];
      if (embed) {
        const updated = EmbedBuilder.from(embed).spliceFields(0, 1, {
          name: '📋 Signed Up',
          value: `**${ev.players.length}** player${ev.players.length !== 1 ? 's' : ''}`,
        });
        await ev.message.edit({ embeds: [updated] }).catch(() => {});
      }

      await interaction.followUp({ content: `✅ **${interaction.user.username}** joined! (${ev.players.length} signed up)`, ephemeral: false });
    });
  },

  // ── Slash handler ────────────────────────────────────────────────────────────
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

    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }

    if (['hungergames','rumble','dodgeloser','loteria'].includes(commandName)) {
      const bet       = interaction.options.getInteger('bet') || 50;
      const tsOption  = interaction.options.getString('timestamp') || '';
      return this.handleCommand(fakeMsg, [String(bet), tsOption].filter(Boolean), commandName);
    }
    if (commandName === 'signup')      return this.handleCommand(fakeMsg, [], 'signup');
    if (commandName === 'cancelevent') return this.handleCommand(fakeMsg, [], 'cancelevent');
    if (commandName === 'startgame')   return this.handleCommand(fakeMsg, [], 'startgame');
    if (commandName === 'schedule')    return this.handleCommand(fakeMsg, [], 'schedule');
  },

  // ── Prefix handler ────────────────────────────────────────────────────────────
  async handleCommand(message, args, command) {
    switch (command) {
      case 'hungergames': case 'hg':
        return this.startGame(message, args, 'hungergames');
      case 'rumble':
        return this.startGame(message, args, 'rumble');
      case 'dodgeloser': case 'chaos':
        return this.startGame(message, args, 'dodgeloser');
      case 'loteria': case 'lotería':
        return this.startGame(message, args, 'loteria');
      case 'signup': case 'enter': case 'event':
        return this.playerSignup(message);
      case 'startgame':
        return this.manualFire(message);
      case 'cancelevent':
        return this.cancelEvent(message);
      case 'schedule': case 'eventschedule':
        return this.showSchedule(message);
    }
  },

  // ── Start (immediate or scheduled) ───────────────────────────────────────────
  async startGame(message, args, type) {
    if (!hasHostRole(message.member)) {
      return message.reply(`❌ You need the **${EVENT_HOST_ROLE}** role (or Administrator) to start events!`);
    }
    if (activeEvents.has(message.channel.id)) {
      return message.reply('❌ There\'s already a game open in this channel! Use `!cancelevent` first.');
    }

    const bet = parseInt(args[0]) || 50;
    if (bet < 10) return message.reply('❌ Minimum entry bet is 10 oops!');

    // Parse optional timestamp from remaining args
    const tsRaw   = args.slice(1).join(' ');
    const fireAt  = parseTimestamp(tsRaw);

    if (tsRaw && !fireAt) {
      return message.reply('❌ Invalid timestamp! Use a Discord timestamp like `<t:1776177600:F>` or leave it blank to start signups now (use `!startgame` to fire manually).');
    }

    if (fireAt && fireAt.getTime() <= Date.now()) {
      return message.reply('❌ That timestamp is in the past! Provide a future time.');
    }

    // Save to DB for restart survival
    const scheduleId = await saveSchedule(
      message.channel.id, type, bet,
      message.author.id, message.author.username,
      fireAt
    );

    await launchSignup(
      message.channel, type, bet,
      message.author.id, message.author.username,
      fireAt, scheduleId
    );

    if (fireAt) {
      await message.reply(
        `✅ **${type}** scheduled! Signups are open now — game fires at <t:${Math.floor(fireAt.getTime()/1000)}:F>.`
      );
    } else {
      await message.reply(`✅ **${type}** signup phase started! Use \`!startgame\` when you're ready to begin.`);
    }
  },

  // ── Player signup via command ─────────────────────────────────────────────────
  async playerSignup(message) {
    const ev = activeEvents.get(message.channel.id);
    if (!ev) {
      return message.reply('❌ No game open in this channel! A host can start one with `!hungergames`, `!rumble`, `!dodgeloser`, or `!loteria`.');
    }
    if (ev.phase !== 'signup') {
      return message.reply('❌ Signups are closed — the game is already running!');
    }
    if (ev.players.find(p => p.id === message.author.id)) {
      return message.reply('⚠️ You\'re already signed up!');
    }

    await economy.getUser(message.author.id, message.author.username);
    const bal = await economy.getBalance(message.author.id);
    if (bal < ev.bet) {
      return message.reply(`❌ You need **${ev.bet} oops** to join. Check \`!balance\`.`);
    }

    await economy.removeFunds(message.author.id, ev.bet, `${ev.type} entry fee`);
    ev.players.push({ id: message.author.id, username: message.author.username });
    if (ev.scheduleId) await savePlayers(ev.scheduleId, [{ id: message.author.id, username: message.author.username }]);

    // Update embed
    if (ev.message?.embeds?.[0]) {
      const updated = EmbedBuilder.from(ev.message.embeds[0]).spliceFields(0, 1, {
        name: '📋 Signed Up',
        value: `**${ev.players.length}** player${ev.players.length !== 1 ? 's' : ''}`,
      });
      await ev.message.edit({ embeds: [updated] }).catch(() => {});
    }

    return message.reply(`✅ You're in, **${message.author.username}**! (${ev.players.length} signed up)`);
  },

  // ── Manual fire ───────────────────────────────────────────────────────────────
  async manualFire(message) {
    const ev = activeEvents.get(message.channel.id);
    if (!ev) return message.reply('❌ No game scheduled in this channel.');
    if (!canCancel(message.member, ev.hostId)) {
      return message.reply(`❌ Only the host, **${EVENT_HOST_ROLE}** role, or an admin can start the game early.`);
    }
    if (ev.phase === 'running') return message.reply('❌ The game is already running!');

    if (ev.timer) clearTimeout(ev.timer);
    await message.reply('🚀 Starting the game now!');
    fireGame(message.channel);
  },

  // ── Cancel event ──────────────────────────────────────────────────────────────
  async cancelEvent(message) {
    const ev = activeEvents.get(message.channel.id);
    if (!ev) return message.reply('❌ No active game in this channel.');
    if (!canCancel(message.member, ev.hostId)) {
      return message.reply(`❌ Only the host, **${EVENT_HOST_ROLE}** role, Admins, or the server Owner can cancel.`);
    }
    if (ev.phase === 'running') return message.reply('❌ The game is already running and cannot be cancelled.');

    if (ev.timer) clearTimeout(ev.timer);

    // Refund
    for (const p of ev.players) {
      await economy.getUser(p.id, p.username);
      await economy.addFunds(p.id, ev.bet, 'Event cancelled by host');
    }

    // Disable button
    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`autogame_join:${message.channel.id}`)
        .setLabel('Cancelled')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await ev.message?.edit({ components: [disabledBtn] }).catch(() => {});
    activeEvents.delete(message.channel.id);
    if (ev.scheduleId) await db.run("UPDATE scheduled_games SET status = 'cancelled' WHERE id = ?", [ev.scheduleId]).catch(() => {});

    return message.reply(`✅ Event cancelled. **${ev.players.length}** player(s) refunded.`);
  },

  // ── Show schedule ─────────────────────────────────────────────────────────────
  async showSchedule(message) {
    const ev = activeEvents.get(message.channel.id);
    if (!ev) {
      return message.reply({ embeds: [
        new EmbedBuilder().setColor('#7289DA')
          .setTitle('📅 Event Schedule')
          .setDescription('No game scheduled in this channel.\n\nUse `!hungergames`, `!rumble`, `!dodgeloser`, or `!loteria` to start one — optionally with a Discord timestamp:\n```!hungergames 50 <t:1776177600:F>```')
      ]});
    }

    const tsUnix = ev.fireAt ? Math.floor(ev.fireAt.getTime() / 1000) : null;
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#7289DA')
        .setTitle('📅 Event Schedule — This Channel')
        .addFields(
          { name: '🎮 Game',       value: ev.type,                                                         inline: true },
          { name: '💰 Entry',      value: `${ev.bet} oops`,                                                inline: true },
          { name: '👥 Signed Up',  value: `${ev.players.length}`,                                          inline: true },
          { name: '🕑 Fires At',   value: tsUnix ? `<t:${tsUnix}:F> (<t:${tsUnix}:R>)` : 'Manual (`!startgame`)', inline: false },
          { name: '👤 Host',       value: ev.hostName,                                                     inline: true },
          { name: '📊 Phase',      value: ev.phase,                                                        inline: true },
        )
        .setFooter({ text: 'Use !startgame to fire now • !cancelevent to cancel' })
    ]});
  },
};
