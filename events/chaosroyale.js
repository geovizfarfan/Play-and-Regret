/**
 * chaosroyale.js — Dodge Loser
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats } = require('../utils/database');
const jackpot = require('../utils/jackpot');
const E = require('../utils/emojis');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const activeGames = new Map();

const SIGNUP_DURATIONS = {
  '1':  { label: '1 minute',   seconds: 60   },
  '5':  { label: '5 minutes',  seconds: 300  },
  '15': { label: '15 minutes', seconds: 900  },
  '30': { label: '30 minutes', seconds: 1800 },
};

const ROUND_GIFS = [
  'https://media.giphy.com/media/3oEjHGr1Fhz0kyv8Ig/giphy.gif',
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
  'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyc/giphy.gif',
  'https://media.giphy.com/media/xT9IgG50Lg7russbDa/giphy.gif',
  'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif',
  'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
  'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif',
  'https://media.giphy.com/media/l0IylOPCNkiqOgMyA/giphy.gif',
  'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
];
const START_GIF  = 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif';
const WINNER_GIF = 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif';

const THROWN_OBJECTS = [
  ['a water bottle','a shoe','a half-eaten sandwich','a TV remote','a 2-liter of soda','a stapler','a dictionary','a folding chair','a bag of chips','a flip flop'],
  ['a microwave','a full rotisserie chicken','a traffic cone','a bowling ball','a shopping cart','a broken umbrella','a bag of frozen peas','a literal raccoon','a garden gnome','a printer (it was out of ink anyway)'],
  ['a vending machine','a porta-potty','a small car','a wedding cake','an entire couch','a trampoline','a 65-inch TV','a full Christmas tree','a riding lawnmower','a canoe'],
  ['a 1997 Honda Civic','a shipping container','a satellite dish','a zamboni','an entire Applebee\'s','a functioning trebuchet','the concept of time itself','a baby grand piano','a cruise ship anchor','the moon (somehow)'],
];

const ELIM_FUNNY = [
  '{A} casually picked up {OBJ} and yeeted it directly at {B}. Clean hit. Gone.',
  '{A} launched {OBJ} at {B} with zero hesitation. {B} didn\'t even see it coming.',
  '{A} looked {B} dead in the eyes, grabbed {OBJ}, and let it fly. Bye.',
  '{B} thought they were safe until {A} appeared from behind a bush with {OBJ}.',
  '{A} said "this one\'s for you" and hurled {OBJ} at {B}. Devastating.',
  '{A} missed the first throw, apologized, then hit {B} with {OBJ} on the second try.',
];
const ELIM_DRAMATIC = [
  'With trembling hands, {A} hoisted {OBJ} above their head. Time slowed. {B} screamed. The arena fell silent. Then it hit. {B} is no more.',
  '{B} made the fatal mistake of making eye contact with {A}. Moments later, {OBJ} was in the air. The crowd gasped. It was over.',
  'In what historians will call "the most unhinged moment of the event," {A} somehow obtained {OBJ} and used it to send {B} into the void.',
  '{A} cried a single tear as they threw {OBJ} at {B}. "It\'s not personal," they whispered. {B} was eliminated anyway.',
  'Nobody expected {A} to have {OBJ}. Nobody expected {B} to survive it either. One of those expectations was correct.',
  'The crowd erupted as {A} unleashed {OBJ} upon {B}. Cameras captured every frame. {B}\'s face said it all. It was over.',
];
const ELIM_CHAOTIC = [
  '{A} slipped on a banana peel, accidentally threw {OBJ}, and somehow still eliminated {B}. Talent.',
  '{B} was minding their business when {A} appeared from INSIDE {OBJ} and eliminated them. How? Nobody knows.',
  '{A} threw {OBJ} backwards over their shoulder while looking at their phone. Direct hit on {B}. Unreal.',
  'Security tried to stop {A} from using {OBJ} but they threw it anyway. {B} is gone. {A} has no regrets.',
  '{A} ordered {OBJ} online, it arrived same-day, and they immediately threw it at {B}. Efficiency.',
  'In a shocking twist, {OBJ} was thrown by {A} and it hit {B} on the bounce. Physics said yes.',
];
const SURVIVE = [
  '{A} ducked behind a trash can and avoided three separate projectiles.',
  '{A} caught a flying {OBJ} midair and set it down politely. Unbothered.',
  '{A} sidestepped everything thrown at them with the energy of someone who does not care.',
  'Nothing hit {A} this round. Whether it was skill or luck remains unclear.',
  '{A} tripped, fell, and somehow avoided every single incoming object.',
  '{A} entered a porta-potty at exactly the right moment. Gross, but effective.',
];
const ROUND_OPENERS = [
  '🌀 The chaos continues. Objects are flying. Nobody is safe.',
  '💥 Round {R}: Things have escalated considerably.',
  '😤 Round {R}: The arena is littered with debris. And people.',
  '🎪 Round {R}: Somehow this is still going. Incredible.',
  '🔥 Round {R}: The throwers have found bigger objects.',
  '😱 Round {R}: At this point the arena just IS projectiles.',
];

const pick    = arr => arr[Math.floor(Math.random() * arr.length)];
const pickObj = round => pick(THROWN_OBJECTS[Math.min(round - 1, THROWN_OBJECTS.length - 1)]);
const sleep   = ms => new Promise(r => setTimeout(r, ms));

function fmtElim(A, B, round) {
  const obj  = pickObj(round);
  return pick([...ELIM_FUNNY, ...ELIM_DRAMATIC, ...ELIM_CHAOTIC])
    .replace(/{A}/g, `**${A}**`).replace(/{B}/g, `**${B}**`).replace(/{OBJ}/g, `**${obj}**`);
}
function fmtSurvive(A, round) {
  return pick(SURVIVE).replace(/{A}/g, `**${A}**`).replace(/{OBJ}/g, `**${pickObj(round)}**`);
}
function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

async function runThrowdownGames(channel, players, bet) {
  let alive = [...players];
  let round = 1;
  const elimCounts = new Map();

  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('<a:purplesparkle:1479210541691175054> DODGE LOSER BEGINS!')
      .setDescription(
        `**${alive.length} competitors** have entered the arena.\n\n` +
        alive.map(p => `• **${p.username}**`).join('\n') +
        `\n\n<a:moneybag:1479268556687540345> Prize Pool: **${(bet * alive.length).toLocaleString()} oops**\n\n` +
        `*Objects will be thrown. People will fall. Only one survives.*`
      )
      .setImage(START_GIF)
      .setFooter({ text: 'May your reflexes be better than your decision-making.' })
  ]});

  while (alive.length > 1) {
    await sleep(5000);
    const events   = [];
    const toRemove = new Set();
    alive.sort(() => Math.random() - 0.5);

    let i = 0;
    while (i < alive.length) {
      if (alive.length - toRemove.size <= 1) break;
      if (toRemove.has(alive[i].id)) { i++; continue; }
      const roll    = Math.random();
      const hasNext = alive.slice(i + 1).find(p => !toRemove.has(p.id));
      if (roll < 0.55 && hasNext) {
        events.push(`💥 ` + fmtElim(alive[i].username, hasNext.username, round));
        elimCounts.set(alive[i].id, (elimCounts.get(alive[i].id) || 0) + 1);
        toRemove.add(hasNext.id);
        i++;
      } else if (roll < 0.70 && hasNext && alive.length - toRemove.size > 2) {
        events.push(`💀 **${alive[i].username}** and **${hasNext.username}** both threw **${pickObj(round)}** at each other at the exact same time. Both eliminated. Incredible.`);
        toRemove.add(alive[i].id); toRemove.add(hasNext.id); i++;
      } else {
        events.push(`✅ ` + fmtSurvive(alive[i].username, round));
        i++;
      }
    }

    alive = alive.filter(p => !toRemove.has(p.id));
    const opener = pick(ROUND_OPENERS).replace('{R}', round);

    await channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(opener)
        .setDescription(events.join('\n\n') || '*Everyone just stared at each other.*')
        .setImage(pick(ROUND_GIFS))
        .addFields({
          name: `<:members:1479293571709534311> Still Standing (${alive.length})`,
          value: alive.length > 0 ? alive.map(p => `**${p.username}**`).join(', ') : 'Nobody 💀',
        })
    ]});

    round++;
    if (alive.length === 0) break;
  }

  return { winners: alive, elimCounts };
}

async function startGame(channel, g, bet, channelId) {
  g.phase = 'running';
  const pot = bet * g.players.length;
  const { winners, elimCounts } = await runThrowdownGames(channel, g.players, bet);

  for (const p of g.players) stats.increment(p.id, 'dodgeloser_participations').catch(() => {});

  if (winners && winners.length > 0) {
    const tax      = Math.floor(pot * 0.10);
    const afterTax = pot - tax;
    const share    = Math.floor(afterTax / winners.length);
    await jackpot.addToDrawFund(tax);
    for (const w of winners) {
      await economy.addFunds(w.id, share, 'Dodge Loser victory');
      stats.increment(w.id, 'dodgeloser_wins').catch(() => {});
    }
    for (const p of g.players) {
      if (!winners.find(w => w.id === p.id)) stats.increment(p.id, 'dodgeloser_losses').catch(() => {});
    }

    const isTie      = winners.length > 1;
    const winnerList = winners.map(w => `<@${w.id}> (**${w.username}**)`).join(', ');
    const prizeText  = isTie
      ? `<a:moneybag:1479268556687540345> Pot split ${winners.length} ways — **${share.toLocaleString()} oops** each\n<a:jackpot:1479203793806557385> **${tax.toLocaleString()} oops** taxed to the jackpot`
      : `<a:moneybag:1479268556687540345> **${share.toLocaleString()} oops** to the last one standing *(after 10% jackpot tax)*\n<a:jackpot:1479203793806557385> **${tax.toLocaleString()} oops** added to the jackpot`;
    const elimStats  = winners.map(w =>
      `🎯 **${w.username}** — ${elimCounts.get(w.id) || 0} elimination${(elimCounts.get(w.id) || 0) !== 1 ? 's' : ''}`
    ).join('\n');

    await channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('<a:congrats:1478999022072238222> DODGE LOSER CHAMPION!')
        .setDescription(`${winnerList} ${isTie ? 'survive' : 'survives'} Dodge Loser!\n\n${prizeText}\n\n${elimStats}`)
        .setImage(WINNER_GIF)
        .setFooter({ text: 'The arena is a mess. Somebody clean this up.' })
    ]});
  } else {
    for (const p of g.players) await economy.addFunds(p.id, bet, 'Dodge Loser refund — no survivors');
    await channel.send(`💀 **Everyone was eliminated!** Absolute carnage. All fees refunded.`);
  }

  activeGames.delete(channelId);
}

async function launchThrowdownGames(channel, bet, durationKey, triggeredBy, hostId, customMins = null) {
  const channelId = channel.id;
  if (activeGames.has(channelId)) return channel.send('❌ There\'s already a Throwdown Game running here!');

  // Custom minutes overrides the dropdown
  const duration = customMins
    ? { label: `${customMins} minute${customMins !== 1 ? 's' : ''}`, seconds: customMins * 60 }
    : (SIGNUP_DURATIONS[durationKey] || SIGNUP_DURATIONS['5']);
  const joinId   = `tdg_join_${channelId}`;
  const startId  = `tdg_start_${channelId}`;

  const game = { bet, players: [], phase: 'signup', channelId, triggeredBy, hostId };
  activeGames.set(channelId, game);

  const makeEmbed = (players) => new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('<a:purplesparkle:1479210541691175054> DODGE LOSER — Signups Open!')
    .setDescription(
      `**Things will be thrown. People will be eliminated.**\n\n` +
      `<a:moneybag:1479268556687540345> Entry Fee: **${bet} oops** — winner takes the entire pot!\n` +
      `<:Clocktime:1479304295022071931> Signups close in **${duration.label}**\n` +
      `<:members:1479293571709534311> No player limit — the more chaotic the better\n` +
      `<a:jackpot:1479203793806557385> Current Pot: **${(bet * players.length).toLocaleString()} oops**\n\n` +
      `Click **⚔️ Enter Dodge Loser** to join!`
    )
    .addFields({
      name: '<:members:1479293571709534311> Signed Up',
      value: players.length > 0 ? players.map(p => `• **${p.username}**`).join('\n') : 'Nobody yet... are you scared?',
    })
    .setFooter({ text: `Host: ${triggeredBy} • Signup window: ${duration.label}` });

  const makeButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('⚔️ Enter Dodge Loser').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(startId).setLabel('▶️ Start Now').setStyle(ButtonStyle.Success)
  );

  const gameMsg = await channel.send({ embeds: [makeEmbed([])], components: [makeButtons()] });
  game.message  = gameMsg;

  const collector = gameMsg.createMessageComponentCollector({ time: duration.seconds * 1000 });

  collector.on('collect', async (interaction) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    if (interaction.customId === startId) {
      if (interaction.user.id !== g.hostId) {
        return interaction.reply({ content: `❌ Only the host (**${g.triggeredBy}**) can force start!`, ephemeral: true });
      }
      if (g.players.length < 2) {
        return interaction.reply({ content: `❌ Need at least **2 players** to start!`, ephemeral: true });
      }
      await interaction.deferUpdate();
      collector.stop('forcestart');
      return;
    }

    if (interaction.customId !== joinId) return;
    await interaction.deferUpdate();

    if (g.players.find(p => p.id === interaction.user.id)) {
      return interaction.followUp({ content: `⚠️ You're already in Dodge Loser!`, ephemeral: true });
    }
    await economy.getUser(interaction.user.id, interaction.user.username);
    const bal = await economy.getBalance(interaction.user.id);
    if (bal < bet) {
      return interaction.followUp({ content: `❌ You need **${bet} oops** to enter!`, ephemeral: true });
    }
    await economy.removeFunds(interaction.user.id, bet, 'Dodge Loser entry');
    g.players.push({ id: interaction.user.id, username: interaction.user.username });
    await gameMsg.edit({ embeds: [makeEmbed(g.players)], components: [makeButtons()] });
    await interaction.followUp({ content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** entered Dodge Loser! Player **${g.players.length}**` });
  });

  collector.on('end', async (_, reason) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(joinId).setLabel('⏰ Signups Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(startId).setLabel('▶️ Started').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await gameMsg.edit({ components: [closed] }).catch(() => {});

    if (g.players.length < 2) {
      for (const p of g.players) await economy.addFunds(p.id, bet, 'Dodge Loser refund — not enough players');
      activeGames.delete(channelId);
      return channel.send(`❌ **Dodge Loser** cancelled — not enough players. Fee refunded.`);
    }

    await startGame(channel, g, bet, channelId);
  });
}

module.exports = {
  name: 'chaosroyale',
  activeGames,

  async handleSlash(interaction, commandName) {
    if (commandName === 'dodgeloser') {
      const bet         = interaction.options.getInteger('bet') || 50;
      const durationKey = interaction.options.getString('duration') || '5';
      const customMins  = interaction.options.getInteger('minutes');
      await interaction.reply({ content: `<a:purplesparkle:1479210541691175054> Opening Dodge Loser signups...`, ephemeral: true });
      await launchThrowdownGames(interaction.channel, bet, durationKey, interaction.user.username, interaction.user.id, customMins);
    } else if (commandName === 'canceldodge') {
      await interaction.reply({ content: 'Cancelling...', ephemeral: true });
      const fakeMessage = {
        author: interaction.user, member: interaction.member,
        channel: interaction.channel, guild: interaction.guild,
        reply: async (d) => interaction.followUp(typeof d === 'string' ? { content: d, ephemeral: true } : { ...d, ephemeral: true }),
      };
      await this.cancelGame(fakeMessage);
    }
  },

  async handleCommand(message, args, command) {
    if (command === 'dodgeloser' || command === 'chaos') {
      const bet         = parseInt(args[0]) || 50;
      const durationKey = args[1] || '5';
      if (bet < 10) return message.reply('❌ Minimum entry bet is 10 oops!');
      await launchThrowdownGames(message.channel, bet, durationKey, message.author.username, message.author.id);
    } else if (command === 'canceldodge') {
      await this.cancelGame(message);
    }
  },

  async cancelGame(message) {
    if (!hasHostRole(message.member)) return message.reply(`❌ You need the **${EVENT_HOST_ROLE}** role to cancel!`);
    const g = activeGames.get(message.channel.id);
    if (!g) return message.reply('❌ No Throwdown Game running in this channel.');
    if (g.phase === 'running') return message.reply('❌ The game is mid-chaos and cannot be cancelled.');
    for (const p of g.players) await economy.addFunds(p.id, g.bet, 'Dodge Loser cancelled by host');
    if (g.message) g.message.edit({ components: [] }).catch(() => {});
    activeGames.delete(message.channel.id);
    return message.reply(`✅ Dodge Loser cancelled. **${g.players.length}** player(s) refunded.`);
  },
};
