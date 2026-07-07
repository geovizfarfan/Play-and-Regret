const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats } = require('../../utils/database');
const E = require('../../utils/emojis');
const shop = require('../tictactoe/shop');
const jackpot = require('../../utils/jackpot');
const jackpotModule = require('../../economy/jackpot');

const activeGames = new Map();
const BOT_ID = 'TTT_BOT';

function buildEnv() {
  const home = process.env.HOME || os.homedir();
  const extra = [
    `${home}/Library/Python/3.9/lib/python/site-packages`,
    `${home}/Library/Python/3.11/lib/python/site-packages`,
    `${home}/Library/Python/3.12/lib/python/site-packages`,
    `/usr/local/lib/python3.11/site-packages`,
    `/usr/local/lib/python3.12/site-packages`,
  ];
  return { ...process.env, PYTHONPATH: extra.join(':') };
}

function renderBoardImage(board, xEmoji, oEmoji) {
  return new Promise(resolve => {
    const xSrc = xEmoji || E.TTT_X;
    const oSrc = oEmoji || E.TTT_O;
    const xId = (xSrc.match(/:(\d+)>/) || [])[1] || '';
    const oId = (oSrc.match(/:(\d+)>/) || [])[1] || '';
    const payload = JSON.stringify({ board, x_emoji_id: xId, o_emoji_id: oId });
    const outPath = path.join(os.tmpdir(), `ttt_${Date.now()}.png`);
    function tryBin(bins) {
      if (!bins.length) return resolve(null);
      execFile(bins[0], [RENDERER, payload, outPath], { timeout: 12000, env: buildEnv() }, (err) => {
        if (err) return tryBin(bins.slice(1));
        try {
          const buf = fs.readFileSync(outPath);
          fs.unlinkSync(outPath);
          resolve(new AttachmentBuilder(buf, { name: 'ttt_board.png' }));
        } catch(e) { resolve(null); }
      });
    }
    tryBin([...PYTHON_BINS]);
  });
}

function emptyBoard() { return Array(9).fill(null); }

function checkWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(c => c)) return 'draw';
  return null;
}

function renderBoard(board) {
  const symbols = { X: E.TTT_X, O: E.TTT_O, null: '⬜' };
  const rows = [];
  for (let i = 0; i < 9; i += 3)
    rows.push([board[i], board[i+1], board[i+2]].map(c => symbols[c]).join('\u200b'));
  return rows.join('\n');
}

function buildButtons(board, disabled = false, xEmoji, oEmoji) {
  const xE = xEmoji || E.TTT_X;
  const oE = oEmoji || E.TTT_O;
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const idx  = r * 3 + c;
      const cell = board[idx];
      const btn  = new ButtonBuilder()
        .setCustomId(`ttt_${idx}`)
        .setStyle(cell ? (cell === 'X' ? ButtonStyle.Secondary : ButtonStyle.Primary) : ButtonStyle.Secondary)
        .setDisabled(disabled || cell !== null);
      if (cell === 'X')      { btn.setEmoji(xE); btn.setLabel('\u200b'); }
      else if (cell === 'O') { btn.setEmoji(oE); btn.setLabel('\u200b'); }
      else                   { btn.setLabel('⬜'); }
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

function getBotMove(board, botMark, humanMark) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const empty = board.map((c, i) => c === null ? i : null).filter(i => i !== null);
  for (const [a,b,c] of lines) {
    const vals = [board[a], board[b], board[c]];
    if (vals.filter(v => v === botMark).length === 2 && vals.includes(null)) return [a,b,c][vals.indexOf(null)];
  }
  for (const [a,b,c] of lines) {
    const vals = [board[a], board[b], board[c]];
    if (vals.filter(v => v === humanMark).length === 2 && vals.includes(null)) return [a,b,c][vals.indexOf(null)];
  }
  if (board[4] === null) return 4;
  const corners = [0,2,6,8].filter(i => board[i] === null);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return empty[Math.floor(Math.random() * empty.length)];
}

// Build result payload — plain text, no embed
async function buildResultPayload(g, result, bet) {
  const xEmoji = g.xEmoji || E.TTT_X;
  const oEmoji = g.oEmoji || E.TTT_O;
  let content = '';

  if (result === 'draw') {
    const drawPot = (g.players.X !== BOT_ID ? bet : 0) + (g.players.O !== BOT_ID ? bet : 0);
    if (drawPot > 0) {
      await jackpot.addToDrawFund(drawPot).catch(() => {});
      try { const jm = require('../../economy/jackpot'); await jm.updateLiveChannels(); } catch(e) {}
    }
    stats.increment(g.players.X, 'tictactoe_draws');
    if (g.players.O !== BOT_ID) stats.increment(g.players.O, 'tictactoe_draws');
    content = [
      `<a:tictac:1479198394638667897>  **Tic-Tac-Bruh**  <a:tictac:1479198394638667897> — Draw!`,
      `${E.TTT_DRAW} It's a draw!${drawPot > 0 ? ` **${drawPot} sins** added to the <a:jackpot:1479203793806557385> pot!` : ''}`,
      ``,
      `<a:purplesparkle:1479210541691175054> **Hall of Regret** <a:purplesparkle:1479210541691175054>`,
      `${xEmoji} <@${g.players.X}>`,
      `${oEmoji} ` + (g.players.O === BOT_ID ? '<a:robot:1479201564672397463> Bot' : `<@${g.players.O}>`),
    ].join('\n');
  } else {
    const winnerId   = g.players[result];
    const loserId    = g.players[result === 'X' ? 'O' : 'X'];
    const winnerName = g.names[result];
    const isBot      = winnerId === BOT_ID;
    const loserIsBot = loserId === BOT_ID;
    if (!isBot) await economy.addFunds(winnerId, bet * 2, 'TTT win');
    if (!isBot) stats.increment(winnerId, 'tictactoe_wins');
    if (!loserIsBot) stats.increment(loserId, 'tictactoe_losses');
    if (stats.incrementStreak) await stats.incrementStreak(winnerId);
    if (stats.resetStreak)    await stats.resetStreak(loserId);
    const streak = stats.getStreak ? await stats.getStreak(winnerId) : 0;
    if (!isBot && streak >= 2) {
      setTimeout(() => jackpotModule.awardStreakBonus(winnerId, winnerName, streak, g._channel).catch(() => {}), 1500);
    }
    const streakName = isBot ? '<a:robot:1479201564672397463> Bot' : winnerName;
    const streakLine = streak >= 1
      ? `<a:purplefire:1479219348353716415> **${streakName}** is on a **${streak}-win streak!**`
      : '';
    content = [
      `<a:tictac:1479198394638667897>  **Tic-Tac-Bruh**  <a:tictac:1479198394638667897> — Game Over!`,
      isBot
        ? `<a:robot:1479201564672397463> **The Bot wins!** LOSER!`
        : `<a:congrats:1478999022072238222> **Congratulations <@${winnerId}>!** **+${(bet*2).toLocaleString()} sins** <a:SINS:1522338223613804724> added!`,
      streakLine ? `\n${streakLine}\n` : ``,
      `<a:purplesparkle:1479210541691175054> **Hall of Regret** <a:purplesparkle:1479210541691175054>`,
      `${xEmoji} <@${g.players.X}>`,
      `${oEmoji} ` + (g.players.O === BOT_ID ? '<a:robot:1479201564672397463> Bot' : `<@${g.players.O}>`),
    ].filter(line => line !== '').join('\n');
  }
  return { content, embeds: [] };
}

// Build turn payload — plain text, no embed
function buildTurnPayload(g, bet, title) {
  const xEmoji = g.xEmoji || E.TTT_X;
  const oEmoji = g.oEmoji || E.TTT_O;
  const nextId = g.players[g.currentTurn];
  const isBot  = nextId === BOT_ID;
  const pingEmoji = !isBot && g.pingEmojis?.[nextId] ? g.pingEmojis[nextId] + ' ' : '▶️ ';
  const ping   = !isBot ? `<@${nextId}>` : '';
  const content = [
    `<a:tictac:1479198394638667897>  **Tic-Tac-Bruh**  <a:tictac:1479198394638667897>`,
    ``,
    `<a:purplesparkle:1479210541691175054> **Hall of Regret** <a:purplesparkle:1479210541691175054>`,
    `${xEmoji} <@${g.players.X}>`,
    `${oEmoji} ` + (g.players.O === BOT_ID ? '<a:robot:1479201564672397463> Bot' : `<@${g.players.O}>`),
    ``,
    `Turn: ${ping}${pingEmoji}`,
  ].join('\n');
  return { content, embeds: [] };
}


module.exports = {
  name: 'tictactoe',
  activeGames,

  async handleCommand(message, args, command) {
    if (command === 'ttb' || command === 'tictacbruh' || command === 'ttt') {
      const hasMention = message.mentions?.users?.size > 0;
      if (!hasMention) return this.openChallenge(message, args);
      return this.challenge(message, args);
    }
    if (command === 'cancelttb' || command === 'cancelttt' || command === 'ttt-cancel') return this.cancelGame(message);
  },

  async handleSlash(interaction) {
    if (interaction.commandName === 'cancelttb' || interaction.commandName === 'cancelttt' || interaction.commandName === 'canceltictacbruh') return this.cancelGame(interaction);
    const opponent = interaction.options.getUser('opponent');
    const bet      = interaction.options.getInteger('bet') || 10;
    const vsBot    = interaction.options.getBoolean('vsbot') || false;

    if (vsBot) {
      await interaction.reply({ content: `<a:robot:1479201564672397463> Starting Tic-Tac-Bruh vs Bot for **${bet} sins**!`, ephemeral: true });
      return this.startBotGame({ author: interaction.user, channel: interaction.channel }, bet);
    }

    if (!opponent) {
      // Acknowledge slash, then run open challenge in the channel
      await interaction.reply({ content: `<a:tictac:1479198394638667897> Opening challenge for **${bet} sins**...`, ephemeral: true });
      return this.openChallenge({
        author:  interaction.user,
        channel: interaction.channel,
        reply:   async (d) => interaction.followUp(typeof d === 'string' ? { content: d, ephemeral: true } : { ...d, ephemeral: true }),
      }, [String(bet)]);
    }

    // Direct challenge — acknowledge slash first, then post challenge in channel
    await interaction.reply({ content: `<a:tictac:1479198394638667897> Challenge sent!`, ephemeral: true });
    const fakeMessage = {
      author:   interaction.user,
      member:   interaction.member,
      channel:  interaction.channel,
      guild:    interaction.guild,
      mentions: { users: { first: () => opponent } },
      reply:    async (d) => interaction.followUp(typeof d === 'string' ? { content: d, ephemeral: true } : { ...d, ephemeral: true }),
    };
    await this.challenge(fakeMessage, [opponent ? `<@${opponent.id}>` : '', String(bet)]);
  },

  // ── Cancel ─────────────────────────────────────────────────────────────────
  async cancelGame(source) {
    const isInteraction = !!source.commandName || !!source.customId || source.isCommand?.();
    const channelId = source.channel?.id || source.channelId;
    const userId    = source.author?.id  || source.user?.id;
    const game      = activeGames.get(channelId);

    const reply = async (msg) => {
      try {
        if (isInteraction) {
          if (source.deferred || source.replied) return source.editReply(typeof msg === 'string' ? { content: msg } : msg);
          return source.reply(typeof msg === 'string' ? { content: msg, ephemeral: true } : { ...msg, ephemeral: true });
        }
        return source.reply(msg);
      } catch(e) { console.error('cancelGame reply error:', e); }
    };

    if (!game) return reply(`${E.ERROR} No active Tic-Tac-Bruh game in this channel.`);

    const isHost  = game.players.X === userId;
    const isAdmin = source.member?.permissions?.has('Administrator') || source.memberPermissions?.has('Administrator');
    if (!isHost && !isAdmin) return reply(`${E.ERROR} Only the host or admins can cancel.`);

    if (game.players.X !== BOT_ID) economy.addFunds(game.players.X, game.bet, 'TTT cancel refund');
    if (game.players.O !== BOT_ID) economy.addFunds(game.players.O, game.bet, 'TTT cancel refund');
    activeGames.delete(channelId);
    return reply(`🚫 Tic-Tac-Bruh cancelled. **${game.names.X}** and **${game.names.O}** refunded **${game.bet} sins** each.`);
  },

  // ── vs Bot ─────────────────────────────────────────────────────────────────
  async startBotGame(message, bet) {
    const gameKey = message.channel.id;
    if (activeGames.has(gameKey)) return message.channel.send(`${E.ERROR} There's already a game in this channel!`);

    await economy.getUser(message.author.id, message.author.username);
    const bal = await economy.getBalance(message.author.id);
    if (bal < bet)
      return message.channel.send(`${E.ERROR} You need **${bet} sins** but only have **${bal}**!`);

    await economy.removeFunds(message.author.id, bet, 'TTT vs Bot bet');

    const xShopEmoji = await shop.getItem(message.author.id, 'ttt_x');
    const oShopEmoji = await shop.getItem(message.author.id, 'ttt_o');
    const pingShopX  = await shop.getItem(message.author.id, 'ttt_turn');
    const game = {
      board: emptyBoard(), players: { X: message.author.id, O: BOT_ID },
      names: { X: message.author.username, O: '<a:robot:1479201564672397463> Bot' },
      currentTurn: 'X', bet, vsBot: true,
      channelId: gameKey, guildName: message.channel.guild?.name || '',
      _channel: message.channel,
      xEmoji: xShopEmoji?.emoji || null,
      oEmoji: oShopEmoji?.emoji || null,
      pingEmojis: { [message.author.id]: pingShopX?.emoji || null },
    };
    activeGames.set(gameKey, game);

    const startPayload = buildTurnPayload(game, bet, `${E.TTT_HEADER} Tic-Tac-Bruh vs ${E.BOT} Bot`);
    const gameMsg = await message.channel.send({ ...startPayload, components: buildButtons(game.board, false, game.xEmoji, game.oEmoji) });

    const moveCollector = gameMsg.createMessageComponentCollector({ time: 300000 });
    moveCollector.on('collect', async (i) => {
      if (!i.customId.match(/^ttt_\d+$/)) return i.deferUpdate().catch(() => {});
      const g = activeGames.get(gameKey);
      if (!g) return i.deferUpdate().catch(() => {});
      if (i.user.id !== g.players.X)
        return i.reply({ content: `${E.ERROR} This is not your game!`, ephemeral: true });

      const idx = parseInt(i.customId.replace('ttt_', ''));
      if (g.board[idx]) return i.reply({ content: `${E.ERROR} That spot is taken!`, ephemeral: true });

      await i.deferUpdate();

      try {
        g.board[idx] = 'X';
        let result = checkWinner(g.board);
        if (result) {
          moveCollector.stop(); activeGames.delete(gameKey);
          const payload = await buildResultPayload(g, result, g.bet);
          return i.message.edit({ ...payload, components: buildButtons(g.board, true, g.xEmoji, g.oEmoji) });
        }

        const botIdx = getBotMove(g.board, 'O', 'X');
        g.board[botIdx] = 'O';
        result = checkWinner(g.board);
        if (result) {
          moveCollector.stop(); activeGames.delete(gameKey);
          const payload = await buildResultPayload(g, result, g.bet);
          return i.message.edit({ ...payload, components: buildButtons(g.board, true, g.xEmoji, g.oEmoji) });
        }

        const payload = buildTurnPayload(g, g.bet, '');
        await i.message.edit({ ...payload, components: buildButtons(g.board, false, g.xEmoji, g.oEmoji) });
      } catch (err) {
        console.error('[TTT bot move error]', err.stack || err);
        i.message.edit({ content: `${E.ERROR} Something went wrong: ${err.message}`, components: [] }).catch(() => {});
        activeGames.delete(gameKey);
        moveCollector.stop();
      }
    });

    moveCollector.on('end', () => activeGames.delete(gameKey));
  },

  // ── Open challenge — anyone can join ──────────────────────────────────────
  async openChallenge(message, args) {
    const bet     = parseInt(args[0]) || 10;
    const gameKey = message.channel.id;
    if (activeGames.has(gameKey))
      return message.reply(`${E.ERROR} There\'s already a game in this channel!`);

    await economy.getUser(message.author.id, message.author.username);
    const bal = await economy.getBalance(message.author.id);
    if (bal < bet) return message.reply(`${E.ERROR} You need **${bet} sins** to start but only have **${bal}**!`);

    const xShop  = await shop.getItem(message.author.id, 'ttt_x');
    const pingX  = await shop.getItem(message.author.id, 'ttt_turn');
    const xEmoji = xShop?.emoji || null;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ttt_openjoin').setLabel('<:sword:1495666991187361943> Accept Challenge!').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ttt_opendecline').setLabel('<:wrong:1495666083594502174> Cancel').setStyle(ButtonStyle.Danger)
    );

    const content = [
      `<a:tictac:1479198394638667897>  **Tic-Tac-Bruh**  <a:tictac:1479198394638667897>`,
      ``,
      `**${message.author.username}** is looking for a challenger!`,
      `${E.BB_COIN} Bet: **${bet} sins** each — winner takes **${bet * 2} sins**`,
      ``,
      `Anyone can click **Accept Challenge** to play!`,
    ].join('\n');

    const openMsg = await message.channel.send({ content, components: [row] });
    // Mark channel as having a pending open challenge
    activeGames.set(gameKey, { pending: true, host: message.author.id });

    const openCollector = openMsg.createMessageComponentCollector({ time: 120000 });
    openCollector.on('collect', async (interaction) => {
      if (interaction.customId === 'ttt_opendecline') {
        if (interaction.user.id !== message.author.id)
          return interaction.reply({ content: `${E.ERROR} Only the host can cancel!`, ephemeral: true });
        activeGames.delete(gameKey);
        openCollector.stop();
        return openMsg.edit({ content: `<:wrong:1495666083594502174> **${message.author.username}** cancelled the challenge.`, components: [] });
      }

      if (interaction.customId === 'ttt_openjoin') {
        if (interaction.user.id === message.author.id)
          return interaction.reply({ content: `${E.ERROR} You can\'t challenge yourself!`, ephemeral: true });

        openCollector.stop();
        await interaction.deferUpdate();

        const opponent = interaction.user;
        await economy.getUser(opponent.id, opponent.username);
        const oppBal = await economy.getBalance(opponent.id);
        if (oppBal < bet) {
          activeGames.delete(gameKey);
          return openMsg.edit({ content: `${E.ERROR} **${opponent.username}** doesn\'t have enough sins to join!`, components: [] });
        }

        await economy.removeFunds(message.author.id, bet, 'TTT bet');
        await economy.removeFunds(opponent.id, bet, 'TTT bet');

        const oShop  = await shop.getItem(opponent.id, 'ttt_o');
        const pingO  = await shop.getItem(opponent.id, 'ttt_turn');
        const oEmoji = oShop?.emoji || null;
        const pingEmojis = {};
        if (pingX?.emoji) pingEmojis[message.author.id] = pingX.emoji;
        if (pingO?.emoji) pingEmojis[opponent.id] = pingO.emoji;

        const game = {
          board: emptyBoard(),
          players: { X: message.author.id, O: opponent.id },
          names:   { X: message.author.username, O: opponent.username },
          currentTurn: 'X', bet, vsBot: false,
          channelId: gameKey, guildName: message.channel.guild?.name || '',
          _channel: message.channel,
          xEmoji, oEmoji, pingEmojis,
        };
        activeGames.set(gameKey, game);

        const startPayload = buildTurnPayload(game, bet, '');
        await openMsg.edit({ ...startPayload, components: buildButtons(game.board, false, xEmoji, oEmoji) });

        const moveCollector = openMsg.createMessageComponentCollector({ time: 300000 });
        moveCollector.on('collect', async (i) => {
          if (!i.customId.match(/^ttt_\d+$/)) return i.deferUpdate().catch(() => {});
          const g = activeGames.get(gameKey);
          if (!g) return i.deferUpdate().catch(() => {});
          if (i.user.id !== g.players[g.currentTurn])
            return i.reply({ content: `${E.ERROR} It's not your turn!`, ephemeral: true });

          const idx = parseInt(i.customId.replace('ttt_', ''));
          if (g.board[idx]) return i.reply({ content: `${E.ERROR} That spot is taken!`, ephemeral: true });

          await i.deferUpdate();

          try {
            g.board[idx] = g.currentTurn;
            const result = checkWinner(g.board);

            if (result) {
              moveCollector.stop(); activeGames.delete(gameKey);
              const payload = await buildResultPayload(g, result, g.bet);
              return i.message.edit({ ...payload, components: buildButtons(g.board, true, g.xEmoji, g.oEmoji) });
            }
            g.currentTurn = g.currentTurn === 'X' ? 'O' : 'X';
            const turnPayload = buildTurnPayload(g, g.bet, '');
            await i.message.edit({ ...turnPayload, components: buildButtons(g.board, false, g.xEmoji, g.oEmoji) });
          } catch (err) {
            console.error('[TTT open move error]', err.stack || err);
            i.message.edit({ content: `${E.ERROR} Something went wrong: ${err.message}`, components: [] }).catch(() => {});
            activeGames.delete(gameKey);
            moveCollector.stop();
          }
        });
        moveCollector.on('end', () => activeGames.delete(gameKey));
      }
    });

    openCollector.on('end', (_, reason) => {
      if (reason === 'time') {
        activeGames.delete(gameKey);
        openMsg.edit({ content: `<a:RojasClock:1511506715453947904> **${message.author.username}\'s** open challenge expired — no one joined.`, components: [] }).catch(() => {});
      }
    });
  },

  // ── vs Player ──────────────────────────────────────────────────────────────
  async challenge(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply(`${E.ERROR} Challenge someone! Usage: \`!ttt @user <bet>\``);
    if (opponent.id === message.author.id) return message.reply(`${E.ERROR} You can't play yourself!`);
    if (opponent.bot) return message.reply(`${E.ERROR} Use \`/ttt vsbot:True\` to play against the bot!`);

    const bet     = parseInt(args[1]) || 10;
    const gameKey = message.channel.id;
    if (activeGames.has(gameKey)) return message.reply(`${E.ERROR} There's already a game in this channel!`);

    await economy.getUser(message.author.id, message.author.username);
    await economy.getUser(opponent.id, opponent.username);
    const authorBal   = await economy.getBalance(message.author.id);
    const opponentBal = await economy.getBalance(opponent.id);
    if (authorBal < bet)   return message.reply(`${E.ERROR} You need **${bet} sins** but only have **${authorBal}**!`);
    if (opponentBal < bet) return message.reply(`${E.ERROR} **${opponent.username}** needs **${bet} sins** but only has **${opponentBal}**!`);

    const betText = `\n${E.BB_COIN} Bet: **${bet} sins** each — winner takes **${bet*2} sins**`;
    const challengeEmbed = new EmbedBuilder()
      .setColor('#C9B1FF')
      .setTitle(`<a:tictac:1479198394638667897>  Tic-Tac-Bruh Challenge!  <a:tictac:1479198394638667897>`)
      .setDescription(`**${message.author.username}** ${E.TTT_X} vs **${opponent.username}** ${E.TTT_O}${betText}\n\n<@${opponent.id}>, do you accept?`)
      .setFooter({ text: 'Challenge expires in 60 seconds' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ttt_accept').setLabel('<:checkmark:1495666088417956002> Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ttt_decline').setLabel('<:wrong:1495666083594502174> Decline').setStyle(ButtonStyle.Danger)
    );

    const challengeMsg = await message.channel.send({ embeds: [challengeEmbed], components: [row] });
    const collector    = challengeMsg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== opponent.id)
        return interaction.reply({ content: `${E.ERROR} This challenge isn't for you!`, ephemeral: true });

      if (interaction.customId === 'ttt_decline') {
        await interaction.update({ content: `${E.ERROR} **${opponent.username}** declined the challenge!`, embeds: [], components: [] });
        return collector.stop();
      }

      if (interaction.customId === 'ttt_accept') {
        collector.stop();
        await economy.removeFunds(message.author.id, bet, 'TTT bet');
        await economy.removeFunds(opponent.id, bet, 'TTT bet');

        const [xShop, oShop, pingX, pingO] = await Promise.all([
          shop.getItem(message.author.id, 'ttt_x'),
          shop.getItem(opponent.id, 'ttt_o'),
          shop.getItem(message.author.id, 'ttt_turn'),
          shop.getItem(opponent.id, 'ttt_turn'),
        ]);
        const game = {
          board: emptyBoard(), players: { X: message.author.id, O: opponent.id },
          names: { X: message.author.username, O: opponent.username },
          currentTurn: 'X', bet, vsBot: false,
          channelId: gameKey, guildName: message.channel.guild?.name || message.guild?.name || '',
          _channel: message.channel,
          xEmoji: xShop?.emoji || null,
          oEmoji: oShop?.emoji || null,
          pingEmojis: {
            [message.author.id]: pingX?.emoji || null,
            [opponent.id]: pingO?.emoji || null,
          },
        };
        activeGames.set(gameKey, game);

        const startPayload = buildTurnPayload(game, bet, '');
        await interaction.update({ ...startPayload, components: buildButtons(game.board, false, game.xEmoji, game.oEmoji) });

        const moveCollector = challengeMsg.createMessageComponentCollector({ time: 300000 });
        moveCollector.on('collect', async (i) => {
          if (!i.customId.match(/^ttt_\d+$/)) return i.deferUpdate().catch(() => {});
          const g = activeGames.get(gameKey);
          if (!g) return i.deferUpdate().catch(() => {});
          if (i.user.id !== g.players[g.currentTurn])
            return i.reply({ content: `${E.ERROR} It's not your turn!`, ephemeral: true });

          const idx = parseInt(i.customId.replace('ttt_', ''));
          if (g.board[idx]) return i.reply({ content: `${E.ERROR} That spot is taken!`, ephemeral: true });

          await i.deferUpdate();

          try {
            g.board[idx] = g.currentTurn;
            const result = checkWinner(g.board);

            if (result) {
              moveCollector.stop(); activeGames.delete(gameKey);
              const payload = await buildResultPayload(g, result, g.bet);
              return i.message.edit({ ...payload, components: buildButtons(g.board, true, g.xEmoji, g.oEmoji) });
            }

            g.currentTurn = g.currentTurn === 'X' ? 'O' : 'X';
            const turnPayload = buildTurnPayload(g, g.bet, '');
            await i.message.edit({ ...turnPayload, components: buildButtons(g.board, false, g.xEmoji, g.oEmoji) });
          } catch (err) {
            console.error('[TTT pvp move error]', err.stack || err);
            i.message.edit({ content: `${E.ERROR} Something went wrong: ${err.message}`, components: [] }).catch(() => {});
            activeGames.delete(gameKey);
            moveCollector.stop();
          }
        });

        moveCollector.on('end', () => activeGames.delete(gameKey));
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') challengeMsg.edit({ content: '<a:RojasClock:1511506715453947904> Challenge expired.', embeds: [], components: [] }).catch(() => {});
    });
  },
};
