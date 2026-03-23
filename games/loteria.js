const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { economy, stats } = require('../utils/database');
const E = require('../utils/emojis');
const jackpot = require('../utils/jackpot');

// ─── Cards ────────────────────────────────────────────────────────────────────
const LOTERIA_CARDS = [
  { name:'El Gallo',       emoji:'🐓', n:1  }, { name:'El Diablito',    emoji:'😈', n:2  },
  { name:'La Dama',        emoji:'👑', n:3  }, { name:'El Catrín',      emoji:'🎩', n:4  },
  { name:'El Paraguas',    emoji:'☂️', n:5  }, { name:'La Sirena',      emoji:'🧜', n:6  },
  { name:'La Escalera',    emoji:'🪜', n:7  }, { name:'La Botella',     emoji:'🍾', n:8  },
  { name:'El Barril',      emoji:'🛢️', n:9  }, { name:'El Árbol',       emoji:'🌳', n:10 },
  { name:'El Melón',       emoji:'🍈', n:11 }, { name:'El Valiente',    emoji:'🗡️', n:12 },
  { name:'El Gorrito',     emoji:'🎓', n:13 }, { name:'La Muerte',      emoji:'💀', n:14 },
  { name:'La Pera',        emoji:'🍐', n:15 }, { name:'La Bandera',     emoji:'🏁', n:16 },
  { name:'El Bandolón',    emoji:'🎸', n:17 }, { name:'El Violoncello', emoji:'🎻', n:18 },
  { name:'La Garza',       emoji:'🦢', n:19 }, { name:'El Pájaro',      emoji:'🐦', n:20 },
  { name:'La Mano',        emoji:'✋', n:21 }, { name:'La Bota',        emoji:'👢', n:22 },
  { name:'La Luna',        emoji:'🌙', n:23 }, { name:'El Cotorro',     emoji:'🦜', n:24 },
  { name:'El Borracho',    emoji:'🍺', n:25 }, { name:'El Negrito',     emoji:'🎭', n:26 },
  { name:'El Corazón',     emoji:'❤️', n:27 }, { name:'La Sandía',      emoji:'🍉', n:28 },
  { name:'El Tambor',      emoji:'🥁', n:29 }, { name:'El Camarón',     emoji:'🦐', n:30 },
  { name:'Las Jaras',      emoji:'🏹', n:31 }, { name:'El Músico',      emoji:'🎶', n:32 },
  { name:'La Araña',       emoji:'🕷️', n:33 }, { name:'El Soldado',     emoji:'💂', n:34 },
  { name:'La Estrella',    emoji:'⭐', n:35 }, { name:'El Cazo',        emoji:'🍳', n:36 },
  { name:'El Mundo',       emoji:'🌍', n:37 }, { name:'El Apache',      emoji:'🪶', n:38 },
  { name:'El Nopal',       emoji:'🌵', n:39 }, { name:'El Alacrán',     emoji:'🦂', n:40 },
  { name:'La Rosa',        emoji:'🌹', n:41 }, { name:'La Calavera',    emoji:'☠️', n:42 },
  { name:'La Campana',     emoji:'🔔', n:43 }, { name:'El Cantarito',   emoji:'🏺', n:44 },
  { name:'El Venado',      emoji:'🦌', n:45 }, { name:'El Sol',         emoji:'☀️', n:46 },
  { name:'La Corona',      emoji:'👑', n:47 }, { name:'La Chalupa',     emoji:'🛶', n:48 },
  { name:'El Pino',        emoji:'🌲', n:49 }, { name:'El Pescado',     emoji:'🐟', n:50 },
  { name:'La Palma',       emoji:'🌴', n:51 }, { name:'La Maceta',      emoji:'🪴', n:52 },
  { name:'El Arpa',        emoji:'🎵', n:53 }, { name:'La Rana',        emoji:'🐸', n:54 },
];

const activeGames = new Map();

// ─── Image renderer ───────────────────────────────────────────────────────────
const RENDERER = path.join(__dirname, '..', 'utils', 'render_board.py');

const WRAPPER = path.join(__dirname, '..', 'utils', 'render_board_wrapper.sh');

// Python binary candidates — tries each until one works
const PYTHON_BINS = [
  'python3',
  'python',
  '/usr/bin/python3',
  '/usr/local/bin/python3',
  '/Library/Developer/CommandLineTools/usr/bin/python3',
];

// Build env with user site-packages on PATH so macOS Pillow is found
function buildEnv() {
  const home = process.env.HOME || os.homedir();
  const extra = [
    `${home}/Library/Python/3.9/lib/python/site-packages`,
    `${home}/Library/Python/3.10/lib/python/site-packages`,
    `${home}/Library/Python/3.11/lib/python/site-packages`,
    `${home}/Library/Python/3.12/lib/python/site-packages`,
  ].join(path.delimiter);
  const existing = process.env.PYTHONPATH || '';
  return { ...process.env, PYTHONPATH: existing ? `${extra}${path.delimiter}${existing}` : extra };
}

async function renderBoardImage(board, markedSet, username) {
  return new Promise((resolve) => {
    const outPath = path.join(os.tmpdir(), `lot_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    const payload = JSON.stringify({
      board:  board.map(c => ({ n: c.n, name: c.name })),
      marked: [...markedSet],
      username,
    });
    const env = buildEnv();

    function tryBin(bins) {
      if (bins.length === 0) {
        console.error('[Loteria] No working python3 with Pillow found');
        return resolve(null);
      }
      const bin = bins[0];
      execFile(bin, [RENDERER, payload, outPath], { timeout: 15000, env }, (err) => {
        if (err) {
          console.warn(`[Loteria] "${bin}" failed: ${err.message}`);
          return tryBin(bins.slice(1));
        }
        if (!fs.existsSync(outPath)) {
          console.error('[Loteria] Renderer ran but no output file created');
          return resolve(null);
        }
        try {
          const buf = fs.readFileSync(outPath);
          fs.unlinkSync(outPath);
          resolve(new AttachmentBuilder(buf, { name: 'board.png' }));
        } catch (e) {
          console.error('[Loteria] File read error:', e.message);
          resolve(null);
        }
      });
    }

    tryBin([...PYTHON_BINS]);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function generateBoard() { return shuffle(LOTERIA_CARDS).slice(0, 16); }

function checkWin(marked) {
  for (let r = 0; r < 4; r++) if ([0,1,2,3].every(c => marked.has(r*4+c))) return 'row';
  for (let c = 0; c < 4; c++) if ([0,1,2,3].every(r => marked.has(r*4+c))) return 'column';
  if ([0,5,10,15].every(i => marked.has(i))) return 'diagonal';
  if ([3,6,9,12].every(i => marked.has(i)))  return 'diagonal';
  if (marked.size === 16) return 'full card';
  return null;
}

// Render 4x4 emoji grid
function renderGrid(board, marked, drawnCards) {
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += '\n';
    const c = board[i];
    if (marked.has(i))                            out += '✅ ';
    else if (drawnCards.some(d => d.n === c.n))   out += '🔶 ';
    else                                           out += `${c.emoji} `;
  }
  return out;
}

// 4 rows x 4 buttons for manual mode
function buildSelectButtons(board, marked, drawnCards) {
  const rows = [];
  for (let r = 0; r < 4; r++) {
    const row = new ActionRowBuilder();
    for (let c2 = 0; c2 < 4; c2++) {
      const i    = r * 4 + c2;
      const card = board[i];
      const isMarked = marked.has(i);
      const isCalled = drawnCards.some(d => d.n === card.n);
      const short    = card.name.replace(/^(El |La |Las )/,'').slice(0, 8);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`lot_sel_${i}`)
          .setLabel(isMarked ? '✅' : `${card.emoji} ${short}`)
          .setStyle(isMarked ? ButtonStyle.Success : isCalled ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(isMarked)
      );
    }
    rows.push(row);
  }
  return rows;
}

// Build ephemeral board message with rendered image
async function buildBoardMsg(pd, drawnCards, isManual = false) {
  const recent = drawnCards.slice(-5).map(c => `${c.emoji} ${c.name}`).join(' · ') || 'None yet';
  const attachment = await renderBoardImage(pd.board, pd.marked, pd.username);

  const embed = new EmbedBuilder()
    .setColor('#C8F0FF')
    .setTitle(`🎴 Your Lotería Board`)
    .addFields(
      { name: '🃏 Last 5 Called', value: recent },
      { name: '📊 Marked',        value: `${pd.marked.size} / 16`, inline: true },
    )
    .setFooter({ text: isManual
      ? '🔵 = ready to mark · Click a card to mark it! · Grey = not called yet'
      : '✅ = auto-marked · Cards mark themselves when called' });

  if (attachment) {
    embed.setImage('attachment://board.png');
  } else {
    // Fallback to emoji grid if image generation failed
    embed.setDescription(renderGrid(pd.board, pd.marked, drawnCards));
    embed.addFields({ name: '⚠️ Note', value: 'Board image unavailable — showing emoji grid instead' });
  }

  const components = isManual ? buildSelectButtons(pd.board, pd.marked, drawnCards) : [];
  const files = attachment ? [attachment] : [];
  return { embeds: [embed], components, files, ephemeral: true };
}

function lobbyButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lot_join').setLabel('🎴 Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('lot_board').setLabel('👁 My Board').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lot_rules').setLabel('📖 Rules').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('lot_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  )];
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'loteria',
  activeGames,

  async handleCommand(message, args, command) {
    if (command === 'loteria')                                      return this.startGame(message, args, 'auto');
    if (command === 'loteria-manual' || command === 'loteriamanu')  return this.startGame(message, args, 'manual');
    if (command === 'loteria-rules'  || command === 'loteriarules') return this.showRules(message);
    if (command === 'cancelloteria')
      return this.cancelGame(message.channel.id, message.author.id, m => message.reply(m));
  },

  // ─── Start game ───────────────────────────────────────────────────────────
  async startGame(message, args, mode, speedSec = 10) {
    const channelId = message.channel.id;
    if (activeGames.has(channelId))
      return message.reply(`${E.ERROR} A Lotería game is already running here!`);

    const bet = parseInt(args[0]) || 50;
    if (bet < 10) return message.reply(`${E.ERROR} Minimum bet is 10 oops!`);

    // Parse speed from args: !loteria 50 1m 10  (10s per card)
    const speedArg = parseInt(args[2]);
    const cardSpeedMs = [8,10,12,15].includes(speedArg) ? speedArg * 1000 : speedSec * 1000;
    const cardSpeedLabel = `${cardSpeedMs/1000}s per card`;

    const dm = (args[1] || '').match(/^(\d+)m$/i);
    const delayMins  = dm ? Math.min(parseInt(dm[1]), 60) : 1;
    const delayMs    = delayMins * 60 * 1000;
    const delayLabel = `${delayMins} min${delayMins !== 1 ? 's' : ''}`;

    const gameMsg = await message.channel.send({
      embeds: [new EmbedBuilder().setColor('#C8F0FF')
        .setTitle(`🎴 ¡LOTERÍA! — ${mode === 'manual' ? 'Manual' : 'Auto'} Mode`)
        .setDescription(
          `**${message.author.username}** is starting Lotería!\n\n` +
          `${E.BB_COIN} Entry: **${bet} oops**  ·  Starts in **${delayLabel}** or when 8 players join  ·  🕐 **${cardSpeedLabel}**\n\n` +
          `✍️ Click **blue cards** on your board to mark them when they're called.\n👁 Press **My Board** on each drawn card — you can catch up on any missed cards anytime!`
        )
        .setFooter({ text: '¡Buena suerte! 🌟' })
      ],
      components: lobbyButtons(),
    });

    const game = {
      mode, bet, channelId,
      players:    new Map(),
      deck:       shuffle(LOTERIA_CARDS),
      drawnCards: [],
      phase:      'lobby',
      host:       message.author.id,
      lobbyMsg:   gameMsg,
      interval:   null,
      startTimer: null,
      cardSpeedMs,
    };
    activeGames.set(channelId, game);

    game.startTimer = setTimeout(() => this._tryStart(channelId, message.channel), delayMs);

    // ONE collector on the lobby message, lives for 4 hours — handles EVERYTHING
    const col = gameMsg.createMessageComponentCollector({ time: 4 * 60 * 60 * 1000 });

    col.on('collect', async inter => {
      try {
        const g = activeGames.get(channelId);
        const id = inter.customId;

        // Rules
        if (id === 'lot_rules')
          return inter.reply({ content: this.getRulesText(), ephemeral: true });

        // Cancel
        if (id === 'lot_cancel') {
          const isHost  = inter.user.id === game.host;
          const isAdmin = inter.member?.permissions?.has('Administrator') ||
                          inter.member?.roles?.cache?.some(r => r.name === (process.env.ADMIN_ROLE || 'Admin'));
          if (!isHost && !isAdmin)
            return inter.reply({ content: `${E.ERROR} Only the host or an admin can cancel!`, ephemeral: true });
          await inter.deferUpdate().catch(() => {});
          col.stop('cancelled');
          return this.cancelGame(channelId, inter.user.id, m => inter.channel.send(m));
        }

        // My Board
        if (id === 'lot_board') {
          if (!g) return inter.reply({ content: 'No active game.', ephemeral: true });
          if (!g.players.has(inter.user.id))
            return inter.reply({ content: `${E.ERROR} You haven't joined yet! Press **🎴 Join** first.`, ephemeral: true });
          return inter.reply(await buildBoardMsg(g.players.get(inter.user.id), g.drawnCards, g.mode === 'manual'));
        }

        // Join
        if (id === 'lot_join') {
          if (!g)
            return inter.reply({ content: 'Game no longer active.', ephemeral: true });
          if (g.phase !== 'lobby')
            return inter.reply({ content: `Game already started! Press **👁 My Board** to see your card.`, ephemeral: true });
          if (g.players.has(inter.user.id))
            return inter.reply({ content: `✅ Already joined! Press **👁 My Board** to see your card.`, ephemeral: true });

          await economy.getUser(inter.user.id, inter.user.username);
          if (await economy.getBalance(inter.user.id) < g.bet)
            return inter.reply({ content: `${E.ERROR} You need **${g.bet} oops** to join!`, ephemeral: true });

          await economy.removeFunds(inter.user.id, g.bet, 'Lotería entry');
          g.players.set(inter.user.id, {
            username: inter.user.username,
            board:    generateBoard(),
            marked:   new Set(),
          });

          await inter.reply({
            content: `✅ Joined! **${g.players.size}** player${g.players.size !== 1 ? 's' : ''} so far.\n\n👁 Press **My Board** above to see your card!`,
            ephemeral: true,
          });
          await inter.channel.send(`✅ **${inter.user.username}** joined Lotería! (${g.players.size} players)`);

          if (g.players.size >= 8) {
            clearTimeout(g.startTimer);
            col.stop('full');
            await this._tryStart(channelId, inter.channel);
          }
          return;
        }

        // Manual card selection
        if (id.startsWith('lot_sel_')) {
          if (!g || g.phase !== 'playing' || g.mode !== 'manual')
            return inter.reply({ content: `${E.ERROR} This only works in Manual mode!`, ephemeral: true });
          if (!g.players.has(inter.user.id))
            return inter.reply({ content: `${E.ERROR} You're not in this game!`, ephemeral: true });

          const idx  = parseInt(id.replace('lot_sel_', ''));
          const pd   = g.players.get(inter.user.id);
          const card = pd.board[idx];

          if (pd.marked.has(idx))
            return inter.reply({ content: `Already marked!`, ephemeral: true });

          if (!g.drawnCards.some(d => d.n === card.n))
            return inter.reply({
              content: `❌ **${card.emoji} ${card.name}** hasn't been called yet! Wait for it.`,
              ephemeral: true,
            });

          pd.marked.add(idx);
          const win = checkWin(pd.marked);

          if (win) {
            clearInterval(g.interval);
            g.phase = 'finished';
            const pot = g.bet * g.players.size;
            activeGames.delete(channelId);
            col.stop('winner');

            await economy.addFunds(inter.user.id, pot, 'Lotería win');
            await stats.increment(inter.user.id, 'loteria_wins');
            for (const [uid] of g.players)
              if (uid !== inter.user.id) await stats.increment(uid, 'loteria_losses');

            await inter.reply({
              embeds: [new EmbedBuilder().setColor('#FFB3B3')
                .setTitle('🎊 ¡LOTERÍA! You won!')
                .setDescription(renderGrid(pd.board, pd.marked, g.drawnCards))
                .setFooter({ text: `+${pot.toLocaleString()} oops added to your balance!` })],
              components: [],
              ephemeral: true,
            });

            return inter.channel.send({ embeds: [new EmbedBuilder().setColor('#FFB3B3')
              .setTitle(`🏆 ¡LOTERÍA!`)
              .setDescription(`🎊 <@${inter.user.id}> wins with a **${win}**!\n${E.BB_COIN} Prize: **${pot.toLocaleString()} oops**!`)
              .setFooter({ text: '¡Felicidades! 🎊' })] });
          }

          // Show updated board
          return inter.reply(await buildBoardMsg(pd, g.drawnCards, true));
        }

      } catch (err) {
        console.error('[Loteria collector error]', err);
      }
    });

    col.on('end', (_, reason) => {
      if (reason !== 'winner' && reason !== 'cancelled' && reason !== 'full') {
        const g = activeGames.get(channelId);
        if (g) this.cancelGame(channelId, null, () => {});
      }
    });
  },

  // ─── Start playing ────────────────────────────────────────────────────────
  async _tryStart(channelId, channel) {
    const game = activeGames.get(channelId);
    if (!game || game.phase !== 'lobby') return;

    if (game.players.size < 2) {
      for (const [uid] of game.players)
        await economy.addFunds(uid, game.bet, 'Lotería refund — not enough players');
      activeGames.delete(channelId);
      return channel.send(`${E.ERROR} Lotería cancelled — not enough players! Bets refunded.`);
    }

    game.phase = 'playing';
    const pot  = game.bet * game.players.size;

    await channel.send({ embeds: [new EmbedBuilder().setColor('#FFF5C0')
      .setTitle(`🎴 ¡Lotería Begins! — ${game.mode === 'manual' ? 'Manual' : 'Auto'} Mode`)
      .setDescription(
        `**${game.players.size} players** competing!\n${E.BB_COIN} Prize Pool: **${pot.toLocaleString()} oops**\n\n` +
        (game.mode === 'auto'
          ? `🤖 Your board **marks itself automatically** when cards are called!\n👁 Press **My Board** on any card to check your progress.`
          : `✍️ Press **👁 My Board** on each drawn card to open your board and **click blue cards to mark them**.\nYou can mark any called card at any time — even ones you missed!`)
      )] });

    game.interval = setInterval(() => this._drawCard(channelId, channel), game.cardSpeedMs);
  },

  // ─── Draw card ────────────────────────────────────────────────────────────
  async _drawCard(channelId, channel) {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'playing') return;

    if (g.deck.length === 0) {
      clearInterval(g.interval);
      activeGames.delete(channelId);
      for (const [uid] of g.players) await economy.addFunds(uid, g.bet, 'Lotería refund — no winner');
      const noWinPot = game.bet * game.players.size;
      if (noWinPot > 0) await jackpot.addToPot(noWinPot, 'Loteria no winner');
      const newPot = await jackpot.getPot();
      return channel.send({ embeds: [
        new EmbedBuilder().setColor('#D8D8D8')
          .setTitle('😮 No Winner — Lotería Over!')
          .setDescription(
            'All 54 cards drawn with no winner!\n' +
            '<a:jackpot:1479203793806557385> **' + noWinPot.toLocaleString() + ' oops** added to the Jackpot Pot!\n' +
            '> Pot is now **' + newPot.toLocaleString() + ' oops** — use `/jackpot` to enter the weekly lottery!'
          )
      ]});
    }

    const drawn = g.deck.pop();
    g.drawnCards.push(drawn);

    const recent = g.drawnCards.slice(-6).reverse().map(c => `${c.emoji} ${c.name}`).join('\n');

    // Each card draw has its own 👁 My Board button that lasts until next card
    const cardRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`lot_view_${channelId}`).setLabel('👁 My Board').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lot_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
    );
    const cardMsg = await channel.send({
      embeds: [new EmbedBuilder().setColor('#FFD4A0')
        .setTitle(`🎴 Card #${g.drawnCards.length} — ${drawn.emoji} **${drawn.name}**`)
        .addFields({ name: '🃏 Recent Cards', value: recent })
        .setFooter({ text: `${g.drawnCards.length}/54 called · Click 👁 My Board to see your card!` })
      ],
      components: [cardRow],
    });

    // Collector lasts until just before next card (speed - 1s)
    const colTime = Math.max(5000, (g.cardSpeedMs || 15000) - 1000);
    const cardCol = cardMsg.createMessageComponentCollector({ time: colTime });
    cardCol.on('collect', async inter => {
      try {
        const gNow = activeGames.get(channelId);
        if (!gNow) return inter.reply({ content: 'Game has ended.', ephemeral: true });
        if (!gNow.players.has(inter.user.id))
          return inter.reply({ content: `❌ You're not in this game!`, ephemeral: true });
        return inter.reply(await buildBoardMsg(gNow.players.get(inter.user.id), gNow.drawnCards, gNow.mode === 'manual'));
      } catch(e) { console.error('[card collector]', e); }
    });
    cardCol.on('end', () => {
      cardMsg.edit({ components: [] }).catch(() => {});
    });

    // Auto mode: mark cards and check for winners automatically
    if (g.mode !== 'auto') return;

    const pot     = g.bet * g.players.size;
    const winners = [];
    for (const [uid, pd] of g.players) {
      const idx = pd.board.findIndex(c => c.n === drawn.n);
      if (idx !== -1) {
        pd.marked.add(idx);
        if (checkWin(pd.marked)) winners.push({ uid, pd });
      }
    }
    if (winners.length === 0) return;

    clearInterval(g.interval);
    g.phase = 'finished';
    activeGames.delete(channelId);

    const share = Math.floor(pot / winners.length);
    for (const w of winners) {
      await economy.addFunds(w.uid, share, 'Lotería win');
      await stats.increment(w.uid, 'loteria_wins');
    }
    for (const [uid] of g.players)
      if (!winners.find(w => w.uid === uid)) await stats.increment(uid, 'loteria_losses');

    const names = winners.map(w => `<@${w.uid}>`).join(', ');
    await channel.send({ embeds: [new EmbedBuilder().setColor('#FFB3B3')
      .setTitle('🏆 ¡LOTERÍA!')
      .setDescription(`🎊 ${names} wins!\n${E.BB_COIN} Each gets **${share.toLocaleString()} oops**!`)
      .setFooter({ text: '¡Felicidades! 🎊' })] });
  },

  // ─── Cancel ───────────────────────────────────────────────────────────────
  async cancelGame(channelId, requesterId, replyFn) {
    const game = activeGames.get(channelId);
    if (!game) return replyFn(`${E.ERROR} No active Lotería game here.`);

    clearInterval(game.interval);
    clearTimeout(game.startTimer);
    game.phase = 'cancelled';
    activeGames.delete(channelId);

    for (const [uid] of game.players)
      await economy.addFunds(uid, game.bet, 'Lotería cancelled — refund');

    if (game.lobbyMsg) game.lobbyMsg.edit({ components: [] }).catch(() => {});

    replyFn(`✅ Lotería cancelled. **${game.players.size}** player${game.players.size !== 1 ? 's' : ''} refunded **${game.bet} oops** each.`);
  },

  // ─── Slash ────────────────────────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    if (commandName === 'loteriarules')
      return interaction.reply({ content: this.getRulesText(), ephemeral: true });

    if (commandName === 'cancelloteria') {
      await interaction.deferReply({ ephemeral: true });
      return this.cancelGame(
        interaction.channel.id, interaction.user.id,
        m => interaction.editReply({ content: m })
      );
    }

    const bet      = interaction.options.getInteger('bet') || 50;
    const delayOpt = interaction.options.getString('delay') || '5m';
    const mode     = interaction.options.getString('mode') || 'auto';
    const speedSec = parseInt(interaction.options.getString('speed') || '10');

    await interaction.reply({ content: `✅ Starting ${mode === 'manual' ? 'Manual' : 'Auto'} Lotería! (${speedSec}s per card)`, ephemeral: true });

    const fakeMsg = {
      author:  interaction.user,
      channel: interaction.channel,
      reply:   async (data) => interaction.channel.send(typeof data === 'string' ? { content: data } : data),
    };
    return this.startGame(fakeMsg, [String(bet), delayOpt], mode, speedSec);
  },

  getRulesText() {
    return [
      `**🎴 Lotería Rules**\n`,
      `**🤖 Auto Mode** — Cards called every 8s, your board marks itself. Press **👁 My Board** on the lobby message to see your card privately.\n`,
      `**✍️ Manual Mode** — Cards called every 8s. Press **👁 My Board** on the lobby message to open your card and click matching cards to mark them. 🔵 blue = called & ready to mark!\n`,
      `**🏆 Win** — First to complete a row, column, or diagonal of 4 wins the pot!\n`,
      `**⏱️ Delay** — \`1m\` \`5m\` \`10m\` \`20m\` · Up to 8 players\n`,
      `**❌ Cancel** — Host or admin presses Cancel in the lobby. All players refunded.`,
    ].join('\n');
  },

  async showRules(message) {
    return message.reply({ embeds: [new EmbedBuilder().setColor('#C8F0FF')
      .setTitle('🎴 Lotería Rules').setDescription(this.getRulesText())] });
  },
};
