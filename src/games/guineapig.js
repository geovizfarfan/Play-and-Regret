/**
 * guineapig.js — Find the Cuy!
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuy hides randomly in a grid of buttons.
 * First player to click the right button wins the round.
 * Random delay + random position keeps everyone guessing!
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats } = require('../../utils/database');
const jackpot = require('../../utils/jackpot');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const activeGames     = new Map();

const CUY_EMOJI   = '🐹';
const DECOY_EMOJIS = ['🌿', '🥕', '🌀', '⬛', '🎋', '🪨', '🍃', '🌾', '🪵', '🫙'];
const GRID_SIZE   = 9; // 3x3 grid

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
  (u) => `💥 **${u}** WHACKED the cuy first!`,
  (u) => `🔨 **${u}** found it! Lightning fast!`,
  (u) => `👊 **${u}** absolutely destroyed the cuy!`,
  (u) => `🐹💨 **${u}** was too fast — the cuy never stood a chance!`,
  (u) => `⚡ **${u}** clicked so fast it broke the laws of physics!`,
  (u) => `<a:trophies:1507765453299122387> **${u}** whacked it before anyone blinked!`,
];

const WRONG_MSGS = [
  '<:wrong:1495666083594502174> Not there! Keep looking!',
  '<:wrong:1495666083594502174> Wrong spot! The cuy laughs at you.',
  '<:wrong:1495666083594502174> Nope! Try again!',
  '<:wrong:1495666083594502174> The cuy wasn\'t hiding there!',
  '<:wrong:1495666083594502174> Miss! The cuy is mocking you.',
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

// ─── Build grid ───────────────────────────────────────────────────────────────
function buildGrid(gameId, round, cuyPos, revealed = false) {
  const rows = [];
  const cols = 3;

  for (let r = 0; r < 3; r++) {
    const btns = [];
    for (let c2 = 0; c2 < cols; c2++) {
      const idx   = r * cols + c2;
      const isCuy = idx === cuyPos;

      if (!revealed) {
        // All buttons show ⬜ — cuy is invisible
        btns.push(
          new ButtonBuilder()
            .setCustomId(`cuy_${gameId}_${round}_${idx}`)
            .setLabel('⬜')
            .setStyle(ButtonStyle.Secondary)
        );
      } else {
        // Reveal — show 💥 where cuy was, ⬜ elsewhere
        btns.push(
          new ButtonBuilder()
            .setCustomId(`cuy_done_${idx}`)
            .setLabel(isCuy ? '💥' : '⬜')
            .setStyle(isCuy ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setDisabled(true)
        );
      }
    }
    rows.push(new ActionRowBuilder().addComponents(btns));
  }
  return rows;
}

// ─── Run game ─────────────────────────────────────────────────────────────────
async function runCuyGame(channel, players, bet, totalRounds) {
  const pot    = bet * players.length;
  const wins   = new Map(players.map(p => [p.id, 0]));
  const gameId = `cuy_${channel.id}_${Date.now()}`;

  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🐹 FIND THE CUY — Game Starting!')
      .setDescription(
        `**${players.length} players** entered the arena!\n\n` +
        players.map(p => `• **${p.username}**`).join('\n') +
        `\n\n<a:moneybag:1479268556687540345> Pot: **${pot.toLocaleString()} sins**\n` +
        `<a:trophies:1507765453299122387> **${totalRounds} rounds** — most whacks wins the pot!\n\n` +
        `*The cuy will hide in a random spot in the grid. Click it first to score!*`
      )
  ]});

  await sleep(3000);

  for (let round = 1; round <= totalRounds; round++) {
    const delay  = 2000 + Math.floor(Math.random() * 5000);
    const cuyPos = Math.floor(Math.random() * GRID_SIZE);
    const scoreStr = () => [...wins.entries()].map(([id, w]) => `**${players.find(p=>p.id===id).username}**: ${w}`).join(' • ');

    // Show waiting grid (all hidden, disabled)
    const waitingGrid = [];
    for (let r = 0; r < 3; r++) {
      const btns = [];
      for (let c2 = 0; c2 < 3; c2++) {
        btns.push(new ButtonBuilder().setCustomId(`cuy_wait_${round}_${r*3+c2}`).setLabel('⬜').setStyle(ButtonStyle.Secondary).setDisabled(true));
      }
      waitingGrid.push(new ActionRowBuilder().addComponents(btns));
    }

    const waitMsg = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#555555')
          .setTitle(`🐹 Round ${round}/${totalRounds} — Get Ready!`)
          .setDescription(`${pick(WAITING_MSGS)}\n\n*Score: ${scoreStr()}*`)
      ],
      components: waitingGrid,
    });

    await sleep(delay);

    // Reveal grid — cuy is hidden among decoys, all look like ❓ still
    // Enable buttons so players can click
    await waitMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle(`🐹 Round ${round}/${totalRounds} — WHERE IS THE CUY?!`)
          .setDescription(`# 🐹❓❓❓\n**FIND AND FIND THE CUY!**\n\n*Score: ${scoreStr()}*`)
      ],
      components: buildGrid(gameId, round, cuyPos, false),
    });

    const roundStart = Date.now();
    let   roundOver  = false;
    const wrongClickers = new Set();

    // Collect clicks
    await new Promise((resolve) => {
      const collector = waitMsg.createMessageComponentCollector({
        filter: i => i.customId.startsWith(`cuy_${gameId}_${round}_`) && players.some(p => p.id === i.user.id),
        time: 8000,
      });

      collector.on('collect', async (interaction) => {
        if (roundOver) return interaction.deferUpdate().catch(() => {});

        const clickedIdx = parseInt(interaction.customId.split('_').pop());
        const isCuy      = clickedIdx === cuyPos;
        const ms         = Date.now() - roundStart;
        const clicker    = players.find(p => p.id === interaction.user.id);

        await interaction.deferUpdate();

        if (isCuy) {
          // Winner!
          roundOver = true;
          wins.set(clicker.id, wins.get(clicker.id) + 1);
          collector.stop('found');

          await waitMsg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`💥 Round ${round} — CUY WHACKED!`)
                .setDescription(
                  `${pick(WHACK_MSGS)(clicker.username)}\n` +
                  `⚡ Reaction time: **${ms}ms**\n\n` +
                  `*Score: ${scoreStr()}*`
                )
            ],
            components: buildGrid(gameId, round, cuyPos, true),
          }).catch(() => {});
        }
        // Wrong clicks are silently ignored — no hint given, round keeps going
      });

      collector.on('end', async (_, reason) => {
        if (!roundOver) {
          // Nobody found it — reveal where it was
          await waitMsg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor('#555555')
                .setTitle(`🐹 Round ${round} — The Cuy Escaped!`)
                .setDescription(`Nobody found the cuy in time! It was hiding at the 🐹 button.\n\n*Score: ${scoreStr()}*`)
            ],
            components: buildGrid(gameId, round, cuyPos, true),
          }).catch(() => {});
        }
        resolve();
      });
    });

    if (round < totalRounds) await sleep(2500);
  }

  // ── Final results ──
  activeGames.delete(channel.id);

  const maxWins  = Math.max(...wins.values());
  const winners  = players.filter(p => wins.get(p.id) === maxWins);
  const isTie    = winners.length > 1;
  const tax      = Math.floor(pot * 0.10);
  const share    = Math.floor((pot - tax) / winners.length);

  for (const w of winners) {
    await economy.addFunds(w.id, share, 'Cuy win');
    await economy.untrackGameChannel(channelId).catch(()=>{});
    stats.increment(w.id, 'cuy_wins').catch(() => {});
  }
  for (const p of players) {
    if (!winners.find(w => w.id === p.id)) stats.increment(p.id, 'cuy_losses').catch(() => {});
    stats.increment(p.id, 'cuy_games').catch(() => {});
  }
  await jackpot.addToDrawFund(tax);

  const scoreLines = [...wins.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, w], i) => {
      const p     = players.find(p => p.id === id);
      const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
      return `${medal} **${p.username}** — ${w} whack${w !== 1 ? 's' : ''}`;
    }).join('\n');

  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('<a:congrats:1478999022072238222> FIND THE CUY — GAME OVER!')
      .setDescription(
        `${scoreLines}\n\n` +
        `<a:moneybag:1479268556687540345> **${winners.map(w => w.username).join(' & ')}** ${isTie ? 'tie' : 'wins'} **${share.toLocaleString()} sins**!\n` +
        `<a:jackpot:1479203793806557385> **${tax} sins** → jackpot\n\n` +
        `*The cuy has been thoroughly whacked. ${totalRounds} times.*`
      )
  ]});
}

// ─── Launcher ─────────────────────────────────────────────────────────────────
async function launchCuy(channel, bet, rounds, triggeredBy, hostId) {
  const channelId = channel.id;
  if (activeGames.has(channelId)) return channel.send('<:wrong:1495666083594502174> There\'s already a Cuy game running here!');

  const joinId  = `cuy_join_${channelId}`;
  const startId = `cuy_start_${channelId}`;
  const game    = { players: [], bet, phase: 'signup', hostId, triggeredBy };
  activeGames.set(channelId, game);

  const makeEmbed = () => new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('<a:guineapig:1511512778542813214> FIND THE CUY — Signups!')
    .setDescription(
      `**Find and click the 🐹 cuy hiding in the grid before everyone else!**\n\n` +
      `<a:moneybag:1479268556687540345> Entry: **${bet} sins** per player\n` +
      `<a:trophies:1507765453299122387> **${rounds} rounds** — most whacks wins the pot!\n` +
      `<:members:1479293571709534311> Min 2 players\n\n` +
      `Click **🐹 Join** to enter!`
    )
    .addFields({
      name: `<:members:1479293571709534311> Signed Up (${game.players.length})`,
      value: game.players.length > 0 ? game.players.map(p => `• **${p.username}**`).join('\n') : 'Nobody yet... scared of a cuy?',
    })
    .setFooter({ text: `Host: ${triggeredBy} • Host can start once 2+ players join` });

  const makeButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setEmoji({ id: '1511512778542813214', name: 'guineapig', animated: true }).setLabel('Join').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(rulesId || 'cuy_rules').setEmoji({ id: '1511510712986632352', name: 'rules', animated: true }).setLabel('Rules').setStyle(ButtonStyle.Secondary),
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
      if (g.players.length < 2) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> Need at least **2 players**!`, ephemeral: true });
      }
      await interaction.deferUpdate();
      collector.stop('forcestart');
      return;
    }

    if (interaction.customId !== joinId) return;
    await interaction.deferUpdate();

    if (g.players.find(p => p.id === interaction.user.id)) {
      return interaction.followUp({ content: `<a:Warning:1497476844860215366> Already joined!`, ephemeral: true });
    }
    await economy.getUser(interaction.user.id, interaction.user.username);
    const bal = await economy.getBalance(interaction.user.id);
    if (bal < bet) return interaction.followUp({ content: `<:wrong:1495666083594502174> Need **${bet} sins**!`, ephemeral: true });

    await economy.removeFunds(interaction.user.id, bet, 'Cuy entry');
    await economy.trackGameEntry(interaction.user.id, interaction.user.username, interaction.channel.id, 'Find the Cuy', bet).catch(()=>{});
    g.players.push({ id: interaction.user.id, username: interaction.user.username });
    await gameMsg.edit({ embeds: [makeEmbed()], components: [makeButtons()] });
    await interaction.followUp({ content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** joined! Player **${g.players.length}**` });
  });

  collector.on('end', async (_, reason) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(joinId).setLabel('⏰ Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(startId).setLabel('▶️ Started').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await gameMsg.edit({ components: [closed] }).catch(() => {});

    if (g.players.length < 2) {
      for (const p of g.players) await economy.addFunds(p.id, bet, 'Cuy refund');
      activeGames.delete(channelId);
      return channel.send(`<:wrong:1495666083594502174> Not enough players. Refunded.`);
    }

    g.phase = 'running';
    await runCuyGame(channel, g.players, bet, rounds);
  });
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'guineapig',
  activeGames,

  async handleSlash(interaction, commandName) {
    if (commandName === 'findthecuy') {
      const bet    = interaction.options.getInteger('bet') || 50;
      const rounds = interaction.options.getInteger('rounds') || 5;
      try {
        await interaction.deferReply({ ephemeral: true });
        await launchCuy(interaction.channel, bet, rounds, interaction.user.username, interaction.user.id);
        await interaction.editReply({ content: `🐹 Find the Cuy game opened!` });
      } catch (err) {
        console.error('[whack error]', err.stack || err);
        await interaction.editReply({ content: `<:wrong:1495666083594502174> Error: ${err.message}` }).catch(() => {});
      }
    }
  },

  async handleCommand(message, args) {
    const bet    = parseInt(args[0]) || 50;
    const rounds = parseInt(args[1]) || 5;
    if (bet < 10) return message.reply('<:wrong:1495666083594502174> Minimum bet is 10 sins!');
    await launchCuy(message.channel, bet, rounds, message.author.username, message.author.id);
  },
};
