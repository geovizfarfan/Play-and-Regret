const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { economy, stats } = require('../../utils/database');
const E = require('../../utils/emojis');
const jackpot = require('../../utils/jackpot');

const CARD_IMAGES = Object.fromEntries(Array.from({length: 54}, (_, i) => [i+1, require('path').join(__dirname, '../games/loteria_images', `${i+1}.png`)]));

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
  { name:'El Arpa',        emoji:'<a:Loading:1511506718666784778>', n:53 }, { name:'La Rana',        emoji:'🐸', n:54 },
];

const activeGames = new Map();

// ─── Image renderer (sharp) ──────────────────────────────────────────────────
let sharp = null;
try { sharp = require('sharp'); console.log('[Loteria] sharp loaded OK'); }
catch(e) { console.log('[Loteria] sharp not available:', e.message); }


const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
const pick    = arr => arr[Math.floor(Math.random() * arr.length)];

async function renderBoardImage(board, markedSet, username) {
  if (!sharp) return null;
  try {
    const cols = 4, rows = 4, cardW = 100, cardH = 140, pad = 6, titleH = 44;
    const width  = cols * (cardW + pad) + pad;
    const height = titleH + rows * (cardH + pad) + pad;

    // Build composite: background + card images + overlay for marked
    const nameDisplay = (username || 'Player').replace(/[<>&'"]/g, '').slice(0, 16);

    // Build card composites
    const composites = [];

    for (let i = 0; i < 16; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cardW + pad);
      const y = titleH + pad + row * (cardH + pad);
      const marked = markedSet.has(i);
      const card = board[i];
      const cardPath = card?.n ? CARD_IMAGES[card.n] : null;
      if (cardPath) {
        try {
          const resized = await sharp(cardPath).resize(cardW, cardH).toBuffer();
          composites.push({ input: resized, left: x, top: y });
        } catch(e2) { console.error('[Loteria] card image error:', card?.name, e2.message); }
      } else {
        const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}">
          <rect width="${cardW}" height="${cardH}" fill="#E8D5FF" rx="5"/>
          <rect x="0" y="0" width="${cardW}" height="20" fill="#D48EEF" rx="5"/>
          <rect x="0" y="${cardH-20}" width="${cardW}" height="20" fill="#D48EEF" rx="5"/>
          <text x="${cardW/2}" y="14" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#5B1A7A">${String(card?.n||'').padStart(2,'0')}</text>
          <text x="${cardW/2}" y="${cardH-6}" text-anchor="middle" font-family="Arial" font-size="8" fill="#5B1A7A">${(card?.name||'').slice(0,12)}</text>
        </svg>`;
        composites.push({ input: Buffer.from(fallbackSvg), left: x, top: y });
      }

      if (marked) {
        // Dark overlay + checkmark SVG on top of card
        const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}">
          <rect width="${cardW}" height="${cardH}" fill="rgba(192,132,252,0.7)" rx="4"/>
          <text x="${cardW/2}" y="${cardH/2 + 14}" text-anchor="middle" fill="white" font-family="Arial" font-size="48" font-weight="bold">✓</text>
        </svg>`;
        composites.push({ input: Buffer.from(overlaySvg), left: x, top: y });
      }
    }

    // Title SVG
    const titleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${titleH}">
      <rect width="${width}" height="${titleH}" fill="#E8D5FF" rx="4"/>
      <text x="${width/2}" y="${titleH - 12}" text-anchor="middle" fill="#6B2FA0" font-family="Arial" font-size="14" font-weight="bold">${nameDisplay}'s Board</text>
    </svg>`;
    composites.unshift({ input: Buffer.from(titleSvg), left: 0, top: 0 });

    return await sharp({
      create: { width, height, channels: 4, background: { r: 26, g: 0, b: 51, alpha: 1 } }
    })
      .composite(composites)
      .png()
      .toBuffer();

  } catch(e) { console.error('[Loteria] sharp render error:', e.message); return null; }
}

// ─── Board helpers ────────────────────────────────────────────────────────────
function generateBoard() {
  return shuffle(LOTERIA_CARDS).slice(0, 16);
}

function checkWin(marked) {
  const s = marked;
  const rows    = [[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]];
  const cols    = [[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15]];
  const diags   = [[0,5,10,15],[3,6,9,12]];
  const corners = [[0,3,12,15]];
  const full    = [[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]];
  for (const line of [...rows,...cols,...diags,...corners,...full]) {
    if (line.every(i => s.has(i))) {
      if (line.length === 16) return 'LOTERÍA completa';
      if (corners[0] === line) return 'Las 4 esquinas';
      if (diags.includes(line)) return 'Diagonal';
      if (cols.includes(line)) return 'Columna';
      return 'Línea';
    }
  }
  return null;
}

function renderGrid(board, marked, drawnCards) {
  return board.map((c, i) => {
    const called = drawnCards.some(d => d.n === c.n);
    const isMarked = marked.has(i);
    return isMarked ? `✅` : called ? `🔵` : c.emoji;
  }).reduce((rows, cell, i) => {
    if (i % 4 === 0) rows.push([]);
    rows[rows.length - 1].push(cell);
    return rows;
  }, []).map(row => row.join('')).join('\n');
}

// Build ephemeral board message with rendered image
function buildSelectButtons(board, marked, drawnCards) {
  const rows = [];
  for (let r = 0; r < 4; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c;
      const card = board[i];
      const called = drawnCards.some(d => d.n === card.n);
      const isMarked = marked.has(i);
      const btn = new ButtonBuilder()
        .setCustomId(`lot_sel_${i}`)
        .setLabel(card.name.replace('El ','').replace('La ','').replace('Las ','').slice(0,20))
        .setStyle(isMarked ? ButtonStyle.Success : called ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(isMarked);
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}
async function buildBoardMsg(pd, drawnCards, isManual = false) {
  const recent = drawnCards.slice(-5).map(c => `${c.emoji} ${c.name}`).join(' · ') || 'None yet';
  const attachment = await renderBoardImage(pd.board, pd.marked, pd.username);

  const embed = new EmbedBuilder()
    .setColor('#C8F0FF')
    .setTitle(`<a:mexicoflag:1511506713755516961> Your Lotería Board`)
    .addFields(
      { name: '<a:cards:1511530261551124561> Last 5 Called', value: recent },
      { name: '<a:marked:1511508970882465832> Marked',        value: `${pd.marked.size} / 16`, inline: true },
    )
    .setFooter({ text: isManual
      ? '🔵 = ready to mark · Click a card to mark it! · Grey = not called yet'
      : 'Click 👁 My Board when a card is called, then click blue cards to mark them!' });

  if (attachment) {
    embed.setImage('attachment://board.png');
  } else {
    // Fallback to emoji grid if image generation failed
    embed.setDescription(renderGrid(pd.board, pd.marked, drawnCards));
    embed.addFields({ name: '<a:Warning:1497476844860215366> Note', value: 'Board image unavailable — showing emoji grid instead' });
  }

  const components = isManual ? buildSelectButtons(pd.board, pd.marked, drawnCards) : [];
  const files = attachment ? [attachment] : [];
  return { embeds: [embed], components, files, ephemeral: true };
}

function lobbyButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lot_join').setEmoji({ id: '1511506713755516961', name: 'mexicoflag', animated: true }).setLabel('Join').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('lot_board').setEmoji({ id: '1511507447704191026', name: 'eyes', animated: true }).setLabel('My Board').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lot_rules').setEmoji({ id: '1511510712986632352', name: 'rules', animated: true }).setLabel('Rules').setStyle(ButtonStyle.Secondary),
  )];
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'loteria',
  activeGames,

  async handleCommand(message, args, command) {
    // Handle !loteria go as subcommand
    if (command === 'loteria' && args[0] === 'go') {
      const g = activeGames.get(message.channel.id);
      if (!g || g.phase !== 'lobby') return message.reply(`${E.ERROR} No Lotería lobby to start.`);
      if (message.author.id !== g.host) return message.reply(`${E.ERROR} Only the host can force start.`);
      clearTimeout(g.startTimer);
      return this._tryStart(message.channel.id, message.channel);
    }
    if (command === 'loteria')                                      return this.startGame(message, args, 'auto');
    if (command === 'loteria-manual' || command === 'loteriamanu')  return this.startGame(message, args, 'manual');
    if (['loteria-go','loteriago','loteriamanugo'].includes(command)) {
      const g = activeGames.get(message.channel.id);
      if (!g || g.phase !== 'lobby') return message.reply(`${E.ERROR} No Lotería lobby to start.`);
      if (message.author.id !== g.host) return message.reply(`${E.ERROR} Only the host can force start.`);
      clearTimeout(g.startTimer);
      return this._tryStart(message.channel.id, message.channel);
    }
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
    if (bet < 10) return message.reply(`${E.ERROR} Minimum bet is 10 Sins!`);

    // Parse speed from args e.g. !loteria 100 <t:...> 10
    const rawArgs = message.content.split(' ').slice(1).join(' ');
    const speedMatch = rawArgs.match(/\b(\d+)s\b/);
    const speedVal = speedMatch ? parseInt(speedMatch[1]) : null;
    const cardSpeedMs = (speedVal && speedVal >= 5 && speedVal <= 60)
      ? speedVal * 1000
      : speedSec * 1000;
    const cardSpeedLabel = `${cardSpeedMs/1000}s per card`;

    // Parse Discord timestamp <t:UNIX:F> or <t:UNIX:R> etc.
    const tsMatch = rawArgs.match(/<t:(\d+)(?::[A-Za-z])?>/);
    let fireAt = null;
    let delayMs = null; // no auto-start unless timestamp given
    if (tsMatch) {
      const unix = parseInt(tsMatch[1]) * 1000;
      if (unix <= Date.now()) return message.reply(`${E.ERROR} That timestamp is in the past!`);
      fireAt = new Date(unix);
      delayMs = unix - Date.now();
    }
    const startLabel = fireAt
      ? `<t:${Math.floor(fireAt.getTime()/1000)}:F> (<t:${Math.floor(fireAt.getTime()/1000)}:R>)`
      : 'when host runs `!loteria go`';

    const gameMsg = await message.channel.send({
      embeds: [new EmbedBuilder().setColor('#C9B1FF')
        .setTitle(`<a:mexicoflag:1511506713755516961> ¡LOTERÍA! — ${mode === 'manual' ? 'Manual' : 'Auto'} Mode`)
        .setDescription(
          `**${message.author.username}** is hosting Lotería!\n\n` +
          `<:Sins:1478993005187698789> Entry: **${bet} Sins** · 10% to Jackpot\n` +
          `<a:RojasClock:1511506715453947904> **${cardSpeedLabel}** per card\n` +
          `<a:calendar:1479266779837632562> Starts: ${startLabel}\n\n` +
          `${mode === 'auto'
            ? 'Cards draw automatically. Click 👁 **My Board** to see your board and what has been called.'
            : 'Cards draw automatically but **you** must click your board to mark them. Bot will not mark for you.'}` +
          `
¡Buena suerte! <a:sparkle:1511506717584920696>`
        )
        
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

    game.startTimer = delayMs ? setTimeout(() => this._tryStart(channelId, message.channel), delayMs) : null;

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
            return inter.reply({ content: `<:checkmark:1495666088417956002> Already joined! Press **👁 My Board** to see your card.`, ephemeral: true });

          await economy.getUser(inter.user.id, inter.user.username);
          if (await economy.getBalance(inter.user.id) < g.bet)
            return inter.reply({ content: `${E.ERROR} You need **${g.bet} sins** to join!`, ephemeral: true });

          const lotTax = Math.floor(g.bet * 0.10);
        await economy.removeFunds(inter.user.id, g.bet, 'Lotería entry');
        await economy.trackGameEntry(inter.user.id, inter.user.username, channelId, 'Lotería', g.bet).catch(()=>{});
        await jackpot.addToDrawFund(lotTax).catch(() => {});
          g.players.set(inter.user.id, {
            username: inter.user.username,
            board:    generateBoard(),
            marked:   new Set(),
          });

          await inter.reply({
            content: `<:checkmark:1495666088417956002> Joined! **${g.players.size}** player${g.players.size !== 1 ? 's' : ''} so far.\n\n👁 Press **My Board** above to see your card!`,
            ephemeral: true,
          });
          await inter.channel.send(`<:checkmark:1495666088417956002> **${inter.user.username}** joined Lotería! (${g.players.size} players)`);
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
              content: `<:wrong:1495666083594502174> **${card.emoji} ${card.name}** hasn't been called yet! Wait for it.`,
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
            await economy.untrackGameChannel(channelId).catch(()=>{});
            await stats.increment(inter.user.id, 'loteria_wins');
            for (const [uid] of g.players)
              if (uid !== inter.user.id) await stats.increment(uid, 'loteria_losses');

            await inter.reply({
              embeds: [new EmbedBuilder().setColor('#C9B1FF')
                .setTitle('🏆 ¡LOTERÍA! You won!')
                .setDescription(renderGrid(pd.board, pd.marked, g.drawnCards))
                .setFooter({ text: `+${pot.toLocaleString()} sins added to your balance!` })],
              components: [],
              ephemeral: true,
            });

            return inter.channel.send({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
              .setTitle(`<a:trophies:1507765453299122387> ¡LOTERÍA!`)
              .setDescription(`🏆 <@${inter.user.id}> wins with a **${win}**!\n${E.BB_COIN} Prize: **${pot.toLocaleString()} sins**!`)
              .setFooter({ text: '¡Felicidades! 🏆' })] });
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

    await channel.send({ embeds: [new EmbedBuilder().setColor('#9B6DFF')
      .setTitle(`<a:mexicoflag:1511506713755516961> ¡LOTERÍA! — ${game.mode === 'manual' ? 'Manual' : 'Auto'} Mode`)
      .setDescription(
        `**${game.players.size} players** competing!\n${E.BB_COIN} Prize Pool: **${pot.toLocaleString()} sins**\n\n` +
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
      await economy.untrackGameChannel(channelId).catch(()=>{});
      const noWinPot = g.bet * g.players.size;
      if (noWinPot > 0) await jackpot.addToDrawFund(noWinPot).catch(() => {});
      const newPot = 0;
      return channel.send({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('😮 No Winner — Lotería Over!')
          .setDescription(
            'All 54 cards drawn with no winner!\n' +
            '<a:jackpot:1479203793806557385> **' + noWinPot.toLocaleString() + ' sins** added to the Jackpot Pot!\n' +
            '> Pot is now **' + newPot.toLocaleString() + ' sins** — use `/jackpot` to enter the weekly lottery!'
          )
      ]});
    }

    const drawn = g.deck.pop();
    g.drawnCards.push(drawn);

    // Auto-mark boards in auto mode
    if (g.mode === 'auto') {
      for (const [, pd] of g.players) {
        const idx = pd.board.findIndex(c => c.n === drawn.n);
        if (idx !== -1) pd.marked.add(idx);
      }
    }

    const recent = g.drawnCards.slice(-6).reverse().map(c => `${c.emoji} ${c.name}`).join('\n');

    // Each card draw has its own 👁 My Board button that lasts until next card
    const cardRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`lot_view_${channelId}`).setEmoji({ id: '1511507447704191026', name: 'eyes', animated: true }).setLabel('My Board').setStyle(ButtonStyle.Primary),
    );
    const cardMsg = await channel.send({
      embeds: [new EmbedBuilder().setColor('#7B2FBE')
        .setTitle(`<a:mexicoflag:1511506713755516961> Card #${g.drawnCards.length} — ${drawn.emoji} ${drawn.name}`)
        .addFields({ name: '<a:cards:1511530261551124561> Recent Cards', value: recent })
        .setFooter({ text: `${g.drawnCards.length}/54 called · Click 👁 My Board to see your card!` })
      ],
      components: [cardRow],
    });

    // Collector lasts until just before next card (speed - 1s)
    const colTime = Math.max(30000, (g.cardSpeedMs || 15000) + 30000); // 30s buffer after next card
    const cardCol = cardMsg.createMessageComponentCollector({ time: colTime });
    cardCol.on('collect', async inter => {
      try {
        const gNow = activeGames.get(channelId);
        // Cancel button — let the main lobby collector handle it
        if (inter.customId === 'lot_cancel') {
          if (!gNow) return inter.reply({ content: 'Game has ended.', ephemeral: true });
          const isHost  = inter.user.id === gNow?.host;
          const isAdmin = inter.member?.permissions?.has('Administrator');
          if (!isHost && !isAdmin)
            return inter.reply({ content: '<:wrong:1495666083594502174> Only the host or admin can cancel.', ephemeral: true });
          clearInterval(gNow.interval);
          gNow.phase = 'finished';
          activeGames.delete(channelId);
          await economy.untrackGameChannel(channelId).catch(() => {});
          for (const [uid, pd] of gNow.players)
            await economy.addFunds(uid, gNow.bet, 'Lotería cancelled').catch(() => {});
          return inter.reply({ content: `<:checkmark:1495666088417956002> Lotería cancelled. All players refunded **${gNow.bet} Sins**.` });
        }
        // Board button
        if (!inter.customId.startsWith('lot_view_')) return;
        if (!gNow) return inter.reply({ content: 'Game has ended.', ephemeral: true });
        if (!gNow.players.has(inter.user.id))
          return inter.reply({ content: `<:wrong:1495666083594502174> You're not in this game!`, ephemeral: true });
        return inter.reply(await buildBoardMsg(gNow.players.get(inter.user.id), gNow.drawnCards, gNow.mode === 'manual'));
      } catch(e) { console.error('[card collector]', e); }
    });
    cardCol.on('end', () => {
      cardMsg.edit({ components: [] }).catch(() => {});
    });

    // Check for winners based on manually marked boards
    const pot     = g.bet * g.players.size;
    const winners = [];
    for (const [uid, pd] of g.players) {
      if (checkWin(pd.marked)) winners.push({ uid, pd });
    }
    if (winners.length === 0) return;

    clearInterval(g.interval);
    g.phase = 'finished';
    activeGames.delete(channelId);

    const share = Math.floor(pot / winners.length);
    for (const w of winners) {
      await economy.addFunds(w.uid, share, 'Lotería win');
    await economy.untrackGameChannel(channelId).catch(()=>{});
      await stats.increment(w.uid, 'loteria_wins');
    }
    for (const [uid] of g.players)
      if (!winners.find(w => w.uid === uid)) await stats.increment(uid, 'loteria_losses');

    const names = winners.map(w => `<@${w.uid}>`).join(', ');
    await channel.send({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('<a:trophies:1507765453299122387> ¡LOTERÍA!')
      .setDescription(`🏆 ${names} wins!\n${E.BB_COIN} Each gets **${share.toLocaleString()} sins**!`)
      .setFooter({ text: '¡Felicidades! 🏆' })] });
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

    replyFn(`<:checkmark:1495666088417956002> Lotería cancelled. **${game.players.size}** player${game.players.size !== 1 ? 's' : ''} refunded **${game.bet} sins** each.`);
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

    const bet       = interaction.options.getInteger('bet') || 50;
    const tsRaw     = interaction.options.getString('timestamp') || '';
    const mode      = interaction.options.getString('mode') || 'auto';
    const speedSec  = interaction.options.getInteger('speed') || 10;

    await interaction.reply({ content: `<:checkmark:1495666088417956002> Starting ${mode === 'manual' ? 'Manual' : 'Auto'} Lotería! (${speedSec}s per card)`, ephemeral: true });

    const fakeMsg = {
      author:  interaction.user,
      channel: interaction.channel,
      content: `/loteria ${bet} ${tsRaw} ${speedSec}s`,
      reply:   async (data) => interaction.channel.send(typeof data === 'string' ? { content: data } : data),
    };
    return this.startGame(fakeMsg, [String(bet), tsRaw], mode, speedSec);
  },

  getRulesText() {
    return [
      `**🎴 Lotería Rules**\n`,
      `**🤖 Auto Mode** — Cards called every 8s, your board marks itself. Press **👁 My Board** on the lobby message to see your card privately.\n`,
      `**✍️ Manual Mode** — Cards called every 8s. Press **👁 My Board** on the lobby message to open your card and click matching cards to mark them. 🔵 blue = called & ready to mark!\n`,
      `**<a:trophies:1507765453299122387> Win** — First to complete a row, column, or diagonal of 4 wins the pot!\n`,
      `**⏱️ Delay** — \`1m\` \`5m\` \`10m\` \`20m\` · Up to 8 players\n`,
      `**<:wrong:1495666083594502174> Cancel** — Host or admin presses Cancel in the lobby. All players refunded.`,
    ].join('\n');
  },

  async showRules(message) {
    return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('<a:mexicoflag:1511506713755516961> Lotería Rules').setDescription(this.getRulesText())] });
  },
};
