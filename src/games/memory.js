/**
 * memorygame.js — Button-based Memory Game
 * Cards are Discord buttons. Click to flip. Find all pairs!
 * Uses server custom emojis automatically.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats, db } = require('../../utils/database');
const jackpot = require('../../utils/jackpot');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const activeGames     = new Map();

// ─── Board sizes (max 25 buttons = 5x5, but 4x4=16 fits cleanly) ─────────────
const BOARD_SIZES = {
  small:  { pairs: 6,  cols: 4, label: '3×4 (6 pairs)',  time: 90  },
  medium: { pairs: 8,  cols: 4, label: '4×4 (8 pairs)',  time: 120 },
};

const HIDDEN_LABEL = '❓';
const MATCHED_LABEL = '✓'; // plain text for matched buttons
const MATCHED_EMOJI  = { id: '1495666088417956002', name: 'checkmark', animated: false };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Get server emojis ────────────────────────────────────────────────────────
function getServerEmojis(guild, count) {
  const all = [...guild.emojis.cache.values()].filter(e => !e.animated);
  const picked = shuffle(all).slice(0, count);
  // Return as { id, label } objects — label is the emoji string, id is emoji.id
  return picked.map(e => ({ emojiStr: `<:${e.name}:${e.id}>`, emojiId: e.id, name: e.name }));
}

// ─── Build board ──────────────────────────────────────────────────────────────
function buildBoard(emojiObjs) {
  const cards = shuffle([...emojiObjs, ...emojiObjs]);
  return cards.map((e, i) => ({
    idx:      i,
    emojiStr: e.emojiStr,
    emojiId:  e.emojiId,
    name:     e.name,
    revealed: false,
    matched:  false,
  }));
}

// ─── Build button rows from board ─────────────────────────────────────────────
function buildComponents(board, gameId, cols, lockedIdx = []) {
  const rows = [];
  const total = board.length;
  const numRows = Math.ceil(total / cols);

  for (let r = 0; r < numRows; r++) {
    const rowBtns = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= total) break;
      const card = board[idx];
      const locked = lockedIdx.includes(idx);

      let btn;
      if (card.matched) {
        btn = new ButtonBuilder()
          .setCustomId(`mem_${gameId}_${idx}`)
          .setLabel(MATCHED_LABEL)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true);
      } else if (card.revealed || locked) {
        btn = new ButtonBuilder()
          .setCustomId(`mem_${gameId}_${idx}`)
          .setEmoji(card.emojiId)
          .setLabel('\u200b')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(locked);
      } else {
        btn = new ButtonBuilder()
          .setCustomId(`mem_${gameId}_${idx}`)
          .setLabel(HIDDEN_LABEL)
          .setStyle(ButtonStyle.Secondary);
      }
      rowBtns.push(btn);
    }
    rows.push(new ActionRowBuilder().addComponents(rowBtns));
  }
  return rows;
}

// ─── DB setup ─────────────────────────────────────────────────────────────────
async function initMemoryTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS memory_leaderboard (
    user_id TEXT, username TEXT, size TEXT,
    time_secs INTEGER, moves INTEGER, date TEXT,
    PRIMARY KEY (user_id, size)
  )`).catch(() => {});
}

async function saveScore(userId, username, size, timeSecs, moves) {
  const existing = await db.get('SELECT time_secs FROM memory_leaderboard WHERE user_id = ? AND size = ?', [userId, size]);
  if (!existing || timeSecs < existing.time_secs) {
    await db.run(
      'INSERT OR REPLACE INTO memory_leaderboard (user_id, username, size, time_secs, moves, date) VALUES (?,?,?,?,?,?)',
      [userId, username, size, timeSecs, moves, new Date().toISOString().slice(0, 10)]
    );
  }
}

async function getLeaderboard(size) {
  return db.all(
    'SELECT username, time_secs, moves, date FROM memory_leaderboard WHERE size = ? ORDER BY time_secs ASC LIMIT 10',
    [size]
  );
}

// ─── Core game runner (shared solo + multi) ───────────────────────────────────
async function runGame(channel, players, bet, sizeKey, guild, mode) {
  const size    = BOARD_SIZES[sizeKey];
  const gameId  = `${channel.id}_${Date.now()}`;
  const emojis  = getServerEmojis(guild, size.pairs);

  if (emojis.length < size.pairs) {
    return channel.send(`<:wrong:1495666083594502174> Not enough server emojis! Need at least **${size.pairs}** static emojis. Add more to the server first.`);
  }

  const board     = buildBoard(emojis);
  const pot       = bet * players.length;
  const startTime = Date.now();
  const scores    = new Map(players.map(p => [p.id, 0]));
  let   currIdx   = 0;
  let   firstPick = null;
  let   moves     = 0;
  let   streak    = 0;
  let   bonusEarned = 0;
  let   locked    = false;

  const currentPlayer = () => players[currIdx % players.length];

  const makeEmbed = (status = '') => {
    const scoreStr = mode === 'multi'
      ? players.map(p => `**${p.username}**: ${scores.get(p.id)} pairs`).join(' • ')
      : `<a:target:1495665634279821485> **${moves}** moves${streak >= 2 ? ` • <a:purplefire:1479219348353716415> **${streak} streak!**` : ''}`;

    return new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle(`<a:brain:1511530555588612126> Memory Game${mode === 'multi' ? ' — Multiplayer' : ` — ${players[0].username}`}`)
      .setDescription(
        (mode === 'multi' ? `**${currentPlayer().username}'s turn!**\n` : '') +
        `${scoreStr}\n` +
        `<a:moneybag:1479268556687540345> Pot: **${pot.toLocaleString()} sins**` +
        (status ? `\n\n${status}` : '')
      );
  };

  const gameMsg = await channel.send({
    embeds: [makeEmbed('Click a ❓ card to flip it!')],
    components: buildComponents(board, gameId, size.cols),
  });

  activeGames.set(channel.id, { board, phase: 'playing', players, gameId });

  // Timer for solo
  let timeLeft = size.time;
  let timerInterval = null;
  if (mode === 'solo') {
    timerInterval = setInterval(async () => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        collector.stop('timeout');
      }
    }, 1000);
  }

  const collector = gameMsg.createMessageComponentCollector({
    filter: i => i.customId.startsWith(`mem_${gameId}_`),
    time: mode === 'solo' ? size.time * 1000 : 15 * 60 * 1000,
  });

  collector.on('collect', async (interaction) => {
    // Check it's the right player
    if (mode === 'multi' && interaction.user.id !== currentPlayer().id) {
      return interaction.reply({ content: `<a:Warning:1497476844860215366> It's **${currentPlayer().username}'s** turn!`, ephemeral: true });
    }
    if (mode === 'solo' && interaction.user.id !== players[0].id) {
      return interaction.reply({ content: `<a:Warning:1497476844860215366> This isn't your game!`, ephemeral: true });
    }
    if (locked) return interaction.deferUpdate().catch(() => {});

    const idx  = parseInt(interaction.customId.split('_').pop());
    const card = board[idx];
    if (card.matched || card.revealed) return interaction.deferUpdate().catch(() => {});

    await interaction.deferUpdate();
    card.revealed = true;
    moves++;

    if (firstPick === null) {
      // First card of pair
      firstPick = idx;
      await gameMsg.edit({
        embeds: [makeEmbed('👆 Now pick the matching card!')],
        components: buildComponents(board, gameId, size.cols),
      }).catch(() => {});
    } else {
      // Second card — check match
      const first = firstPick;
      firstPick = null;
      locked = true;

      await gameMsg.edit({
        embeds: [makeEmbed()],
        components: buildComponents(board, gameId, size.cols, [first, idx]),
      }).catch(() => {});

      await new Promise(r => setTimeout(r, 1200));

      if (board[first].emojiId === board[idx].emojiId) {
        // <:checkmark:1495666088417956002> Match!
        board[first].matched = true;
        board[idx].matched   = true;
        scores.set(currentPlayer().id, scores.get(currentPlayer().id) + 1);
        streak++;

        let bonusMsg = '';
        if (mode === 'solo') {
          if (streak === 3)     { bonusEarned += Math.floor(bet * 0.25); bonusMsg = `<a:purplefire:1479219348353716415> 3 streak! +${Math.floor(bet * 0.25)} bonus!`; }
          else if (streak === 5){ bonusEarned += Math.floor(bet * 0.50); bonusMsg = `<a:purplefire:1479219348353716415><a:purplefire:1479219348353716415> 5 streak! +${Math.floor(bet * 0.50)} bonus!`; }
          else if (streak >= 7) { bonusEarned += Math.floor(bet);        bonusMsg = `<a:purplefire:1479219348353716415><a:purplefire:1479219348353716415><a:purplefire:1479219348353716415> ${streak} streak! +${Math.floor(bet)} bonus!`; }
        }

        const totalMatched = [...scores.values()].reduce((a, b) => a + b, 0);
        locked = false;

        await gameMsg.edit({
          embeds: [makeEmbed(`<:checkmark:1495666088417956002> **Match!**${bonusMsg ? ' ' + bonusMsg : ''} ${mode === 'multi' ? currentPlayer().username + ' goes again!' : ''}`)],
          components: buildComponents(board, gameId, size.cols),
        }).catch(() => {});

        if (totalMatched === size.pairs) collector.stop('won');
      } else {
        // <:wrong:1495666083594502174> No match
        streak = 0;
        board[first].revealed = false;
        board[idx].revealed   = false;
        if (mode === 'multi') currIdx++;
        locked = false;

        await gameMsg.edit({
          embeds: [makeEmbed(`<:wrong:1495666083594502174> No match!${mode === 'multi' ? ` **${currentPlayer().username}'s** turn!` : ''}`)],
          components: buildComponents(board, gameId, size.cols),
        }).catch(() => {});
      }
    }
  });

  collector.on('end', async (_, reason) => {
    clearInterval(timerInterval);
    activeGames.delete(channel.id);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    // Disable all buttons
    const disabledRows = board.reduce((rows, card, idx) => {
      const rowIdx = Math.floor(idx / size.cols);
      if (!rows[rowIdx]) rows[rowIdx] = [];
      rows[rowIdx].push(
        new ButtonBuilder()
          .setCustomId(`mem_done_${idx}`)
          .setLabel(card.matched ? MATCHED_LABEL : (card.revealed ? card.name.slice(0,1) : HIDDEN_LABEL))
          .setStyle(card.matched ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      );
      return rows;
    }, []).map(btns => new ActionRowBuilder().addComponents(btns));

    await gameMsg.edit({ components: disabledRows }).catch(() => {});

    if (reason === 'won' || reason === 'time' || reason === 'timeout') {
      if (mode === 'solo') {
        const totalMatched = scores.get(players[0].id);
        if (totalMatched === size.pairs) {
          // Won!
          const tax     = Math.floor(bet * 0.10);
          const base    = bet * 2 - tax;
          const total   = base + bonusEarned;
          await economy.addFunds(players[0].id, total, 'Memory Game win');
          await economy.untrackGameChannel(channel.id).catch(()=>{});
          await jackpot.addToDrawFund(tax);
          await saveScore(players[0].id, players[0].username, sizeKey, elapsed, moves);
          stats.increment(players[0].id, 'memory_wins').catch(() => {});
          await channel.send({ embeds: [
            new EmbedBuilder().setColor('#FFD700')
              .setTitle('<a:congrats:1478999022072238222> Memory Complete!')
              .setDescription(
                `<a:brain:1511530555588612126> **${players[0].username}** solved it in **${fmtTime(elapsed)}** with **${moves}** moves!\n\n` +
                `<a:moneybag:1479268556687540345> Won: **${total.toLocaleString()} sins**` +
                (bonusEarned > 0 ? ` *(+${bonusEarned} streak bonus)*` : '') + `\n` +
                `<a:jackpot:1479203793806557385> **${Math.floor(bet * 0.10)} sins** → jackpot`
              )
          ]});
        } else {
          stats.increment(players[0].id, 'memory_losses').catch(() => {});
          await channel.send({ embeds: [
            new EmbedBuilder().setColor('#555555')
              .setTitle('⏰ Time\'s Up!')
              .setDescription(`**${players[0].username}** found **${totalMatched}/${size.pairs}** pairs in **${moves}** moves.\n💸 Bet lost.`)
          ]});
        }
      } else {
        // Multiplayer results
        const maxScore = Math.max(...scores.values());
        const winners  = players.filter(p => scores.get(p.id) === maxScore);
        const isTie    = winners.length > 1;
        const tax      = Math.floor(pot * 0.10);
        const share    = Math.floor((pot - tax) / winners.length);
        for (const w of winners) await economy.addFunds(w.id, share, 'Memory Game win');
        await economy.untrackGameChannel(channel.id).catch(()=>{});
        await jackpot.addToDrawFund(tax);

        const lines = [...scores.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, s], i) => {
            const p = players.find(p => p.id === id);
            return `${['🥇','🥈','🥉'][i] || `${i+1}.`} **${p.username}** — ${s} pairs`;
          }).join('\n');

        await channel.send({ embeds: [
          new EmbedBuilder().setColor('#FFD700')
            .setTitle('<a:congrats:1478999022072238222> Memory Game Over!')
            .setDescription(
              `${lines}\n\n` +
              `<a:moneybag:1479268556687540345> **${winners.map(w => w.username).join(' & ')}** ${isTie ? 'tie' : 'wins'} **${share.toLocaleString()} sins**!\n` +
              `<a:jackpot:1479203793806557385> **${tax} sins** → jackpot`
            )
        ]});
      }
    }
  });
}

// ─── Launcher ─────────────────────────────────────────────────────────────────
async function launchMemory(channel, bet, sizeKey, mode, triggeredBy, hostId, guild) {
  const channelId = channel.id;
  if (activeGames.has(channelId)) return channel.send('<:wrong:1495666083594502174> There\'s already a Memory Game running here!');
  await initMemoryTable();

  if (mode === 'solo') {
    await economy.getUser(hostId, triggeredBy);
    const bal = await economy.getBalance(hostId);
    if (bal < bet) return channel.send(`<:wrong:1495666083594502174> **${triggeredBy}** needs **${bet} sins** to play!`);
    await economy.removeFunds(hostId, bet, 'Memory Game entry');
    await economy.trackGameEntry(hostId, triggeredBy || 'unknown', channelId, 'Memory', bet).catch(()=>{});
    await runGame(channel, [{ id: hostId, username: triggeredBy }], bet, sizeKey, guild, 'solo');
    return;
  }

  // Multiplayer signup
  const joinId  = `memjoin_${channelId}`;
  const startId = `memstart_${channelId}`;
  const players = [];
  const game    = { players, bet, phase: 'signup', hostId };
  activeGames.set(channelId, game);

  const makeSignupEmbed = () => new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('<a:brain:1511530555588612126> Memory Game — Signups!')
    .setDescription(
      `**Find matching emoji pairs before your opponents!**\n\n` +
      `<a:moneybag:1479268556687540345> Bet: **${bet} sins** per player\n` +
      `📐 Board: **${BOARD_SIZES[sizeKey].label}**\n\n` +
      `Click **<a:brain:1511530555588612126> Join** to play!`
    )
    .addFields({
      name: `<:members:1479293571709534311> Joined (${players.length})`,
      value: players.length > 0 ? players.map(p => `• **${p.username}**`).join('\n') : 'Nobody yet...',
    });

  const makeButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('<a:brain:1511530555588612126> Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(startId).setLabel('▶️ Start Now').setStyle(ButtonStyle.Success),
  );

  const signupMsg = await channel.send({ embeds: [makeSignupEmbed()], components: [makeButtons()] });

  const collector = signupMsg.createMessageComponentCollector({ time: 60000 });

  collector.on('collect', async (interaction) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    if (interaction.customId === startId) {
      if (interaction.user.id !== g.hostId && !hasHostRole(interaction.member)) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> Only the host can force start!`, ephemeral: true });
      }
      if (g.players.length < 2) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> Need at least 2 players!`, ephemeral: true });
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
    await economy.removeFunds(interaction.user.id, bet, 'Memory Game entry');
    await economy.trackGameEntry(interaction.user.id, interaction.user.username, interaction.channel?.id || channelId, 'Memory', bet).catch(()=>{});
    g.players.push({ id: interaction.user.id, username: interaction.user.username });
    await signupMsg.edit({ embeds: [makeSignupEmbed()], components: [makeButtons()] });
    await interaction.followUp({ content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** joined! Player **${g.players.length}**` });
  });

  collector.on('end', async (_, reason) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;
    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(joinId).setLabel('⏰ Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(startId).setLabel('▶️ Started').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await signupMsg.edit({ components: [closed] }).catch(() => {});
    if (g.players.length < 2) {
      for (const p of g.players) await economy.addFunds(p.id, bet, 'Memory refund');
      activeGames.delete(channelId);
      return channel.send(`<:wrong:1495666083594502174> Not enough players. Refunded.`);
    }
    g.phase = 'playing';
    await runGame(channel, g.players, bet, sizeKey, guild, 'multi');
  });
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'memorygame',
  activeGames,

  async handleSlash(interaction, commandName) {
    if (commandName === 'memory') {
      const bet     = interaction.options.getInteger('bet') || 50;
      const sizeKey = interaction.options.getString('size') || 'medium';
      const mode    = interaction.options.getString('mode') || 'solo';
      try {
        await interaction.deferReply({ ephemeral: true });
        await launchMemory(interaction.channel, bet, sizeKey, mode, interaction.user.username, interaction.user.id, interaction.guild);
        await interaction.editReply({ content: `<a:brain:1511530555588612126> Memory Game started!` });
      } catch (err) {
        console.error('[memory error]', err.stack || err);
        await interaction.editReply({ content: `<:wrong:1495666083594502174> Error: ${err.message}` }).catch(() => {});
      }
    } else if (commandName === 'memoryleaderboard') {
      const sizeKey = interaction.options.getString('size') || 'medium';
      await interaction.deferReply();
      await initMemoryTable();
      const rows = await getLeaderboard(sizeKey);
      const size = BOARD_SIZES[sizeKey];
      if (!rows || rows.length === 0) return interaction.editReply(`No scores yet for **${size.label}**!`);
      const lines = rows.map((r, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
        return `${medal} **${r.username}** — ${fmtTime(r.time_secs)} • ${r.moves} moves`;
      }).join('\n');
      await interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle(`<a:brain:1511530555588612126> Memory Leaderboard — ${size.label}`)
          .setDescription(lines)
      ]});
    }
  },

  async handleCommand(message, args) {
    const bet     = parseInt(args[0]) || 50;
    const sizeKey = args[1] || 'medium';
    const mode    = args[2] || 'solo';
    await launchMemory(message.channel, bet, sizeKey, mode, message.author.username, message.author.id, message.guild);
  },
};
