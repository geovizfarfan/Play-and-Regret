/**
 * guineapig.js — Find the Cuy!
 * ─────────────────────────────────────────────────────────────────────────────
 * A cuy hides in a random cell of a 3x3 grid each round. First to click it scores.
 * A wrong click locks that player out for the round and marks the cell for everyone.
 * Rounds keep going until someone reaches the target number of cuys.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats } = require('../utils/database');
const guildEconomy = require('../utils/guildEconomy');
const jackpot = require('../utils/jackpot');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const activeGames     = new Map();

const CUY            = '<a:GuineaPig_tbpbots:1544900084410490910>';
const CUY_EMOJI_OBJ  = { id: '1544900084410490910', name: 'GuineaPig_tbpbots', animated: true };
const GRID_SIZE      = 9;    // 3x3
const MAX_DRY_ROUNDS = 5;    // this many rounds in a row with no find → game ends
const MAX_TOTAL_ROUNDS = 150; // hard safety cap
const ROUND_MS       = 10000;

const WAITING_MSGS = [
  'The cuy is hiding... 👀',
  'Shh... something is rustling in the bushes...',
  'The cuy is somewhere nearby...',
  'Stay focused. It could appear any second...',
  'Is that a squeak? No... not yet.',
  'The arena is quiet. Too quiet.',
  'The cuy is plotting its escape route...',
  'Keep your eyes on the grid...',
];

const WHACK_MSGS = [
  (u) => `💥 **${u}** found the cuy first!`,
  (u) => `🔨 **${u}** found it! Lightning fast!`,
  (u) => `👊 **${u}** sniffed out the cuy!`,
  (u) => `⚡ **${u}** clicked so fast it broke the laws of physics!`,
  (u) => `<a:trophies:1507765453299122387> **${u}** got there before anyone blinked!`,
];

const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return require('../utils/hostAccess').canHost(member);
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
// wrongCells: cells somebody already clicked this round (shown ❌ for everyone)
function buildGrid(gameId, round, cuyPos, { revealed = false, wrongCells = new Set(), disabled = false } = {}) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const btns = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const b = new ButtonBuilder().setCustomId(`cuy_${gameId}_${round}_${idx}`);
      if (revealed && idx === cuyPos) {
        b.setEmoji(CUY_EMOJI_OBJ).setStyle(ButtonStyle.Success).setDisabled(true);
      } else if (wrongCells.has(idx)) {
        b.setLabel('❌').setStyle(ButtonStyle.Danger).setDisabled(true);
      } else {
        b.setLabel('⬜').setStyle(ButtonStyle.Secondary).setDisabled(revealed || disabled);
      }
      btns.push(b);
    }
    rows.push(new ActionRowBuilder().addComponents(btns));
  }
  return rows;
}

async function refundPlayers(channel, players, bet, reason) {
  if (bet > 0) {
    for (const p of players) {
      await guildEconomy.addFunds(channel.guild.id, p.id, p.username, bet, reason).catch(err => console.error('[cuy refund]', err.message));
    }
  }
  await economy.untrackGameChannel(channel.id).catch(() => {});
}

// ─── Run game ─────────────────────────────────────────────────────────────────
async function runCuyGame(channel, players, bet, target, points, state) {
  if (players.length > 1) await require('../utils/pingPlayers').pingPlayers(channel, players.map(p => p.id), '🔔 **Find the Cuy** is starting — get ready!');
  const pot    = bet * players.length;
  const score  = new Map(players.map(p => [p.id, 0]));
  const gameId = `${channel.id}_${Date.now()}`;
  const nameOf = id => players.find(p => p.id === id)?.username || 'Someone';
  const scoreStr = () => players.slice().sort((a, b) => score.get(b.id) - score.get(a.id))
    .map(p => `**${p.username}** ${score.get(p.id)}/${target}`).join(' • ');

  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#C9B1FF')
      .setTitle(`${CUY} FIND THE CUY — Game Starting!`)
      .setDescription(
        `**${players.length} players** entered the arena!\n\n` +
        players.map(p => `• **${p.username}**`).join('\n') +
        (bet > 0 ? `\n\n<a:moneybag:1479268556687540345> Pot: **${pot.toLocaleString()} sins**` : '') +
        `\n<a:trophies:1507765453299122387> First to **${target}** cuy${target !== 1 ? 's' : ''} wins${points > 1 ? ` (each find = ${points})` : ''}!\n\n` +
        `*A cuy hides in one of 9 cells. Click it first to score — but a wrong click locks you out for the round!*`
      )
  ]});
  await sleep(3000);

  let winnerId = null, round = 0, dry = 0;

  while (!winnerId && !state.cancelled && round < MAX_TOTAL_ROUNDS && dry < MAX_DRY_ROUNDS) {
    round++;
    const delay  = 2000 + Math.floor(Math.random() * 5000);
    const cuyPos = Math.floor(Math.random() * GRID_SIZE);

    const waitMsg = await channel.send({
      embeds: [new EmbedBuilder().setColor('#555555')
        .setTitle(`${CUY} Round ${round} — Get Ready!`)
        .setDescription(`${pick(WAITING_MSGS)}\n\n${scoreStr()}`)],
      components: buildGrid(gameId, round, cuyPos, { disabled: true }),
    });
    await sleep(delay);
    if (state.cancelled) break;

    const wrongCells = new Set();
    const locked     = new Set();
    let roundOver = false, finderId = null;
    const liveEmbed = () => new EmbedBuilder().setColor('#FF6B6B')
      .setTitle(`${CUY} Round ${round} — WHERE IS THE CUY?!`)
      .setDescription(`**Click the cell hiding the cuy!** Wrong click = locked out this round.\n\n${scoreStr()}`);

    await waitMsg.edit({ embeds: [liveEmbed()], components: buildGrid(gameId, round, cuyPos, { wrongCells }) }).catch(() => {});
    const roundStart = Date.now();

    await new Promise((resolve) => {
      const collector = waitMsg.createMessageComponentCollector({
        filter: i => i.customId.startsWith(`cuy_${gameId}_${round}_`),
        time: ROUND_MS,
      });

      collector.on('collect', async (i) => {
        // ── everything that decides the outcome happens synchronously, before any await ──
        const clicker = players.find(p => p.id === i.user.id);
        if (!clicker)      return i.reply({ content: "You're not in this game.", ephemeral: true }).catch(() => {});
        if (roundOver)     return i.deferUpdate().catch(() => {});
        if (locked.has(clicker.id)) return i.reply({ content: '❌ You already guessed wrong this round!', ephemeral: true }).catch(() => {});

        const idx = parseInt(i.customId.split('_').pop(), 10);
        if (idx === cuyPos) {
          roundOver = true; finderId = clicker.id;
          score.set(clicker.id, score.get(clicker.id) + points);
          collector.stop('found');
          i.deferUpdate().catch(() => {});
          return;
        }
        locked.add(clicker.id);
        wrongCells.add(idx);
        const allOut = locked.size >= players.length;
        if (allOut) { roundOver = true; collector.stop('allout'); }
        i.reply({ content: '❌ Not there! You\'re locked out for this round.', ephemeral: true }).catch(() => {});
        if (!allOut) waitMsg.edit({ embeds: [liveEmbed()], components: buildGrid(gameId, round, cuyPos, { wrongCells }) }).catch(() => {});
      });

      collector.on('end', () => resolve());
    });

    const ms = Date.now() - roundStart;
    if (finderId) {
      dry = 0;
      const total = score.get(finderId);
      await waitMsg.edit({
        embeds: [new EmbedBuilder().setColor('#FFD700')
          .setTitle(`💥 Round ${round} — CUY FOUND!`)
          .setDescription(`${pick(WHACK_MSGS)(nameOf(finderId))}\n⚡ **${ms}ms**\n\n${scoreStr()}`)],
        components: buildGrid(gameId, round, cuyPos, { revealed: true, wrongCells }),
      }).catch(() => {});
      if (total >= target) winnerId = finderId;
    } else {
      dry++;
      await waitMsg.edit({
        embeds: [new EmbedBuilder().setColor('#555555')
          .setTitle(`${CUY} Round ${round} — The Cuy Escaped!`)
          .setDescription(`Nobody found it! It was hiding where the ${CUY} is.\n\n${scoreStr()}`)],
        components: buildGrid(gameId, round, cuyPos, { revealed: true, wrongCells }),
      }).catch(() => {});
    }
    if (!winnerId && !state.cancelled) await sleep(2500);
  }

  if (state.cancelled) return;

  // ── Resolve: target reached → that player; otherwise (cuy kept escaping) → whoever leads; no finds at all → refund ──
  const max = Math.max(...score.values());
  let winners = winnerId ? [winnerId] : (max > 0 ? players.filter(p => score.get(p.id) === max).map(p => p.id) : []);

  if (!winners.length) {
    state.paid = true;
    await refundPlayers(channel, players, bet, 'Cuy refund (nobody found it)');
    return channel.send({ embeds: [new EmbedBuilder().setColor('#555555')
      .setTitle(`${CUY} FIND THE CUY — The Cuy Won`)
      .setDescription(`Nobody found the cuy in ${round} rounds.${bet > 0 ? ' Everyone has been refunded.' : ''}`)] });
  }

  const tax   = Math.floor(pot * 0.10);
  const share = Math.floor((pot - tax) / winners.length);
  state.paid = true;                              // set before awaiting → no double payout
  for (const id of winners) {
    if (share > 0) await guildEconomy.addFunds(channel.guild.id, id, nameOf(id), share, 'Cuy win');
    stats.increment(id, 'cuy_wins').catch(() => {});
  }
  for (const p of players) {
    if (!winners.includes(p.id)) stats.increment(p.id, 'cuy_losses').catch(() => {});
    stats.increment(p.id, 'cuy_games').catch(() => {});
  }
  if (tax > 0) await jackpot.addToDrawFund(tax).catch(() => {});
  await economy.untrackGameChannel(channel.id).catch(() => {});

  const lines = players.slice().sort((a, b) => score.get(b.id) - score.get(a.id)).map((p, i) =>
    `${['🥇','🥈','🥉'][i] || `${i + 1}.`} **${p.username}** — ${score.get(p.id)}/${target} ${CUY}`).join('\n');
  const tie = winners.length > 1;
  await channel.send({ embeds: [new EmbedBuilder().setColor('#FFD700')
    .setTitle('<a:congrats:1478999022072238222> FIND THE CUY — GAME OVER!')
    .setDescription(
      `${lines}\n\n` +
      (winnerId ? '' : `*The cuy kept escaping — highest score wins.*\n`) +
      (share > 0 ? `<a:moneybag:1479268556687540345> **${winners.map(nameOf).join(' & ')}** ${tie ? 'tie' : 'wins'} **${share.toLocaleString()} sins**!\n` : `👑 **${winners.map(nameOf).join(' & ')}** ${tie ? 'tie' : 'wins'}!\n`) +
      (tax > 0 ? `<a:jackpot:1479203793806557385> **${tax} sins** → jackpot` : ''))] });
}

// ─── Launcher ─────────────────────────────────────────────────────────────────
async function launchCuy(channel, bet, target, points, triggeredBy, hostId) {
  const channelId = channel.id;
  if (activeGames.has(channelId)) return channel.send('<:wrong:1495666083594502174> There\'s already a Cuy game running here!');

  const joinId  = `cuy_join_${channelId}`;
  const startId = `cuy_start_${channelId}`;
  const rulesId = `cuy_rules_${channelId}`;
  const game    = { players: [], bet, phase: 'signup', hostId, triggeredBy, cancelled: false, paid: false };
  activeGames.set(channelId, game);

  const rulesText = `${CUY} **Find the Cuy — Rules**\nA cuy hides in one of 9 cells each round. Click the cell you think it's in — first to find it scores${points > 1 ? ` ${points}` : ' 1'}. A wrong click locks you out for that round. First to **${target}** wins the pot!`;

  const makeEmbed = () => new EmbedBuilder()
    .setColor('#C9B1FF')
    .setTitle(`${CUY} FIND THE CUY — Signups!`)
    .setDescription(
      `**Find the cuy hiding in the grid before everyone else!**\n\n` +
      (bet > 0 ? `<a:moneybag:1479268556687540345> Entry: **${bet} sins** per player\n` : `<a:moneybag:1479268556687540345> Free entry\n`) +
      `<a:trophies:1507765453299122387> First to **${target}** cuy${target !== 1 ? 's' : ''} wins!\n` +
      `<:members:1479293571709534311> Min 2 players\n\nClick **Join** to enter!`
    )
    .addFields({
      name: `<:members:1479293571709534311> Signed Up (${game.players.length})`,
      value: game.players.length > 0 ? game.players.map(p => `• **${p.username}**`).join('\n') : 'Nobody yet... scared of a cuy?',
    })
    .setFooter({ text: `Host: ${triggeredBy} • Host can start once 2+ players join` });

  const makeButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setEmoji(CUY_EMOJI_OBJ).setLabel('Join').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(rulesId).setEmoji({ id: '1511510712986632352', name: 'rules', animated: true }).setLabel('Rules').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(startId).setEmoji({ id: '1511506717584920696', name: 'sparkle', animated: true }).setLabel('Start').setStyle(ButtonStyle.Success),
  );

  const gameMsg = await channel.send({ embeds: [makeEmbed()], components: [makeButtons()] });
  game.message  = gameMsg;
  const collector = gameMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });

  collector.on('collect', async (interaction) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    if (interaction.customId === startId) {
      if (interaction.user.id !== g.hostId && !hasHostRole(interaction.member)) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> Only **${g.triggeredBy}** can start!`, ephemeral: true });
      }
      if (g.players.length < 2) return interaction.reply({ content: `<:wrong:1495666083594502174> Need at least **2 players**!`, ephemeral: true });
      await interaction.deferUpdate();
      collector.stop('forcestart');
      return;
    }
    if (interaction.customId === rulesId) return interaction.reply({ content: rulesText, ephemeral: true });
    if (interaction.customId !== joinId) return;
    await interaction.deferUpdate();

    if (g.players.find(p => p.id === interaction.user.id)) {
      return interaction.followUp({ content: `<a:Warning:1497476844860215366> Already joined!`, ephemeral: true });
    }
    if (bet > 0) {
      const ok = await guildEconomy.removeFunds(interaction.guild.id, interaction.user.id, interaction.user.username, bet, 'Cuy entry');
      if (!ok) return interaction.followUp({ content: `<:wrong:1495666083594502174> Need **${bet} sins**!`, ephemeral: true });
      await economy.trackGameEntry(interaction.user.id, interaction.user.username, channelId, 'Find the Cuy', bet).catch(() => {});
    }
    g.players.push({ id: interaction.user.id, username: interaction.user.username });
    await gameMsg.edit({ embeds: [makeEmbed()], components: [makeButtons()] }).catch(() => {});
    await interaction.followUp({ content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** joined! Player **${g.players.length}**`, ephemeral: true });
  });

  collector.on('end', async () => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(joinId).setEmoji({ id: '1511506715453947904', name: 'RojasClock', animated: true }).setLabel('Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(startId).setLabel('▶️ Started').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await gameMsg.edit({ components: [closed] }).catch(() => {});

    if (g.players.length < 2) {
      await refundPlayers(channel, g.players, bet, 'Cuy refund');
      activeGames.delete(channelId);
      return channel.send(`<:wrong:1495666083594502174> Not enough players.${bet > 0 ? ' Refunded.' : ''}`);
    }

    g.phase = 'running';
    try {
      await runCuyGame(channel, g.players, bet, target, points, g);
    } catch (err) {
      console.error('[cuy game error]', err.stack || err);
      if (!g.paid) {
        g.paid = true;
        await refundPlayers(channel, g.players, bet, 'Cuy refund (error)');
        channel.send('<:wrong:1495666083594502174> Something broke — everyone has been refunded.').catch(() => {});
      }
    } finally {
      await economy.untrackGameChannel(channelId).catch(() => {});   // never leave rows for the startup refund to "recover"
      activeGames.delete(channelId);
    }
  });
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'guineapig',
  activeGames,

  async handleSlash(interaction, commandName) {
    if (commandName === 'findthecuy') {
      const feeOpt = interaction.options.getBoolean('fee');
      const feeEnabled = feeOpt !== null ? feeOpt : true;
      const bet    = feeEnabled ? (interaction.options.getInteger('bet') || 50) : 0;
      const target = interaction.options.getInteger('target') || interaction.options.getInteger('rounds') || 5;
      const points = interaction.options.getInteger('points') || 1;
      try {
        await interaction.deferReply({ ephemeral: true });
        await launchCuy(interaction.channel, bet, target, points, interaction.user.username, interaction.user.id);
        await interaction.editReply({ content: `${CUY} Find the Cuy game opened!` });
      } catch (err) {
        console.error('[cuy error]', err.stack || err);
        await interaction.editReply({ content: `<:wrong:1495666083594502174> Error: ${err.message}` }).catch(() => {});
      }
    }
  },

  async handleCommand(message, args) {
    const feeMatch = args.join(' ').match(/fee:(on|off)/i);
    const feeEnabled = feeMatch ? feeMatch[1].toLowerCase() === 'on' : true;
    const bet    = feeEnabled ? (parseInt(args[0]) || 50) : 0;
    const target = parseInt(args[1]) || 5;
    if (feeEnabled && bet < 10) return message.reply('<:wrong:1495666083594502174> Minimum bet is 10 sins!');
    await launchCuy(message.channel, bet, target, 1, message.author.username, message.author.id);
  },
};
