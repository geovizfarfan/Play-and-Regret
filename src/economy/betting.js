const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { db, economy } = require('../../utils/database');
const E = require('../../utils/emojis');
const axios = require('axios');

// Letter emojis for labeling options A, B, C, D...
const LETTER_EMOJI = ['🅰️','🅱️','🅲️','🅳️','🅴️','🅵️','🅶️','🅷️','🅸️','🅹️'];

module.exports = {
  name: 'betting',

  async handleCommand(message, args, command) {
    switch (command) {
      case 'createbet': case 'newbet':          return this.createBet(message, args);
      case 'bet':                               return this.placeBetPrompt(message, args);
      case 'bets': case 'openbets':             return this.listBets(message);
      case 'resolvebet': case 'endbet':         return this.resolveBetPrompt(message, args);
      case 'betinfo':                           return this.betInfo(message, args);
      case 'cancelbet':                         return this.cancelBet(message, args);
      case 'mybets':                            return this.myBets(message);
      case 'polymarket': case 'poly':           return this.polymarketFetch(message, args);
    }
  },

  // Parse "Ecuador, Mexico, Draw" into a clean array
  parseOptions(raw) {
    return raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  },

  async createBet(message, args) {
    const fullText = args.join(' ');
    const matches  = fullText.match(/"([^"]+)"/g);
    if (!matches || matches.length < 1) {
      return message.reply(`${E.ERROR} Usage: \`!createbet "Bet Title" "Description" [hours] | option1, option2\`\nExample: \`!createbet "Who wins?" "World Cup Final" 24 | Ecuador, Mexico\``);
    }

    const title       = matches[0].replace(/"/g, '');
    const description = matches[1] ? matches[1].replace(/"/g, '') : '';
    const afterQuotes = fullText.replace(/"[^"]*"/g, '');
    const hoursMatch   = afterQuotes.match(/\d+/);
    const hours        = hoursMatch ? parseInt(hoursMatch[0]) : 24;
    const optMatch      = fullText.match(/\|\s*(.+)$/);
    const options       = optMatch ? this.parseOptions(optMatch[1]) : [];

    if (options.length < 2) {
      return message.reply(`${E.ERROR} You need at least 2 options! Add them after a \`|\`, e.g. \`| Ecuador, Mexico\``);
    }

    return this._createBetCore(message.author, message.channel, title, description, hours, options,
      async (msg) => message.reply(msg));
  },

  async createBetDirect(interaction, title, desc, hours, optionsRaw) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
    const options = this.parseOptions(optionsRaw || '');
    if (options.length < 2) {
      return interaction.editReply(`${E.ERROR} You need at least 2 options! Separate them with commas, e.g. \`Ecuador, Mexico\`.`);
    }
    return this._createBetCore(interaction.user, interaction.channel, title, desc, hours, options,
      async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg } : msg));
  },

  // ── Shared bet-creation core ──────────────────────────────────────────────
  async _createBetCore(author, channel, title, desc, hours, options, replyFn) {
    const closesAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    await db.run(
      'INSERT INTO bets (title, description, creator_id, closes_at, options) VALUES (?, ?, ?, ?, ?)',
      [title, desc, author.id, closesAt, options]
    );
    const lastRow = await db.get('SELECT id FROM bets ORDER BY id DESC LIMIT 1');
    const betId   = lastRow?.id;

    const optionLines = options.map((opt, i) => `${LETTER_EMOJI[i] || '•'} **${opt}** — 0 sins`).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#FFB3A0')
      .setTitle(`${title}`)
      .setDescription(
        `${desc ? desc + '\n\n' : ''}` +
        `<a:moneybag:1479268556687540345> **Total Pool: 0 sins**\n\n${optionLines}`
      )
      .addFields(
        { name: `${E.CLOCK} Closes In`, value: `${hours} hours`, inline: true },
        { name: '🆔 Bet ID',            value: `#${betId}`,       inline: true },
      )
      .setFooter({ text: `Created by ${author.username}` });

    const buttonRow = new ActionRowBuilder().addComponents(
      ...options.slice(0, 4).map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(`bet_pick_${betId}_${i}`)
          .setLabel(opt.slice(0, 20))
          .setEmoji(LETTER_EMOJI[i] || '⚪')
          .setStyle(ButtonStyle.Primary)
      ),
    );
    const cancelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bet_cancel_${betId}`).setLabel('Cancel Bet').setEmoji('<:wrong:1495666083594502174>').setStyle(ButtonStyle.Secondary),
    );

    // If more than 4 options, use a select menu instead of buttons (Discord limits 5 per row)
    let components;
    if (options.length > 4) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`bet_select_${betId}`)
        .setPlaceholder('Pick an outcome to bet on...')
        .addOptions(options.map((opt, i) => ({
          label: opt.slice(0, 100),
          value: String(i),
          emoji: LETTER_EMOJI[i] || undefined,
        })));
      components = [new ActionRowBuilder().addComponents(select), cancelRow];
    } else {
      components = [buttonRow, cancelRow];
    }

    await replyFn(`<:checkmark:1495666088417956002> Bet **"${title}"** created! (#${betId})`);
    const msg = await channel.send({ embeds: [embed], components });

    this._attachCollectors(msg, betId, title, desc, hours, options, author);
    return msg;
  },

  // ── Collectors for picking an option, then an amount ──────────────────────
  _attachCollectors(msg, betId, title, desc, hours, options, author) {
    const collector = msg.createMessageComponentCollector({ time: hours * 60 * 60 * 1000 });

    collector.on('collect', async (i) => {
      // Cancel button
      if (i.customId === `bet_cancel_${betId}`) {
        if (i.user.id !== author.id && !i.member?.permissions.has('Administrator')) {
          return i.reply({ content: `<:wrong:1495666083594502174> Only the bet creator or an admin can cancel this bet!`, ephemeral: true });
        }
        await i.deferReply({ ephemeral: true });
        const entries = await db.all('SELECT * FROM bet_entries WHERE bet_id = ?', [betId]);
        for (const entry of entries) {
          await economy.addFunds(entry.user_id, entry.amount, `Bet #${betId} cancelled — refund`);
        }
        await db.run("UPDATE bets SET status = 'cancelled' WHERE id = ?", [betId]);

        const disabled = msg.components.map(row => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components.forEach(c => c.setDisabled(true));
          return newRow;
        });
        await msg.edit({ components: disabled }).catch(() => {});

        const refundLines = entries.map(e => `• **${e.username}** — ${e.amount.toLocaleString()} sins`).join('\n');
        await i.editReply({ content: `<:checkmark:1495666088417956002> Bet **#${betId}** cancelled!${entries.length > 0 ? `\n\n**Refunded:**\n${refundLines}` : '\nNo bets were placed.'}` });
        await i.channel.send(`<:wrong:1495666083594502174> **Bet #${betId} "${title}"** has been cancelled. ${entries.length} player(s) refunded.`);
        collector.stop('cancelled');
        return;
      }

      // Determine which option index was picked (button or select menu)
      let optionIdx = null;
      if (i.customId === `bet_select_${betId}` && i.isStringSelectMenu()) {
        optionIdx = parseInt(i.values[0]);
      } else {
        const m = i.customId.match(new RegExp(`^bet_pick_${betId}_(\\d+)$`));
        if (m) optionIdx = parseInt(m[1]);
      }
      if (optionIdx === null) return;

      const bal = await economy.getBalance(i.user.id);
      if (bal < 10) return i.reply({ content: `${E.ERROR} You need at least 10 sins to bet!`, ephemeral: true });

      const existing = await db.get('SELECT * FROM bet_entries WHERE bet_id = ? AND user_id = ?', [betId, i.user.id]);
      if (existing) return i.reply({ content: `<a:Warning:1497476844860215366> You already placed a bet on this one!`, ephemeral: true });

      const amountRow = new ActionRowBuilder().addComponents(
        ...[10, 25, 50, 100, 250].map(amt =>
          new ButtonBuilder()
            .setCustomId(`bet_amt_${betId}_${optionIdx}_${amt}`)
            .setLabel(`${amt} sins`)
            .setStyle(ButtonStyle.Secondary)
        )
      );
      await i.reply({
        content: `${LETTER_EMOJI[optionIdx] || ''} **${options[optionIdx]}** — How much do you want to bet?`,
        components: [amountRow],
        ephemeral: true,
      });
    });

    msg.client.on('interactionCreate', async (i) => {
      if (!i.isButton()) return;
      const match = i.customId.match(/^bet_amt_(\d+)_(\d+)_(\d+)$/);
      if (!match) return;
      const [, id, optIdxStr, amountStr] = match;
      if (parseInt(id) !== betId) return;
      const optionIdx = parseInt(optIdxStr);
      const amount    = parseInt(amountStr);

      await i.deferReply({ ephemeral: true }).catch(() => {});

      const bal = await economy.getBalance(i.user.id);
      if (bal < amount) return i.editReply({ content: `${E.ERROR} You need **${amount} sins** but only have **${bal.toLocaleString()}**!` });

      const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
      if (!bet || bet.status !== 'open') return i.editReply({ content: `${E.ERROR} This bet is no longer open!` });

      const existing = await db.get('SELECT * FROM bet_entries WHERE bet_id = ? AND user_id = ?', [betId, i.user.id]);
      if (existing) return i.editReply({ content: `<a:Warning:1497476844860215366> You already placed a bet on this one!` });

      const side = options[optionIdx];
      await economy.removeFunds(i.user.id, amount, `Bet #${betId} (${side})`);
      await db.run(
        'INSERT INTO bet_entries (bet_id, user_id, username, side, amount) VALUES (?, ?, ?, ?, ?)',
        [betId, i.user.id, i.user.username, side, amount]
      );
      await db.run('UPDATE bets SET total_pool = total_pool + ? WHERE id = ?', [amount, betId]);

      // Rebuild embed with live totals per option
      const updatedBet = await db.get('SELECT total_pool FROM bets WHERE id = ?', [betId]);
      const optionLines = await Promise.all(options.map(async (opt, idx) => {
        const row = await db.get('SELECT SUM(amount) as t FROM bet_entries WHERE bet_id = ? AND side = ?', [betId, opt]);
        return `${LETTER_EMOJI[idx] || '•'} **${opt}** — ${(row?.t || 0).toLocaleString()} sins`;
      }));

      const updatedEmbed = new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`${title}`)
        .setDescription(
          `${desc ? desc + '\n\n' : ''}` +
          `<a:moneybag:1479268556687540345> **Total Pool: ${(updatedBet?.total_pool || 0).toLocaleString()} sins**\n\n${optionLines.join('\n')}`
        )
        .addFields(
          { name: `${E.CLOCK} Closes In`, value: `${hours} hours`, inline: true },
          { name: '🆔 Bet ID',            value: `#${betId}`,       inline: true },
        )
        .setFooter({ text: `Created by ${author.username}` });
      await msg.edit({ embeds: [updatedEmbed] }).catch(() => {});

      await i.editReply({
        content: `${LETTER_EMOJI[optionIdx] || ''} **${i.user.username}** bet **${amount} sins** on **${side}** for bet #${betId}!`,
      });
    });
  },

  // ── Prefix-command equivalents for placing/resolving (prompt for option) ──
  async placeBetPrompt(message, args) {
    const betId  = parseInt(args[0]);
    const amount = parseInt(args[1]);
    if (!betId) return message.reply(`${E.ERROR} Usage: \`!bet <id> <amount>\` then pick your outcome from the buttons.`);

    const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);
    if (bet.status !== 'open') return message.reply(`${E.ERROR} Bet #${betId} is already **${bet.status}**!`);

    const options = bet.options || [];
    if (!options.length) return message.reply(`${E.ERROR} This bet has no options configured.`);

    const row = new ActionRowBuilder().addComponents(
      ...options.slice(0, 5).map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(`bet_quick_${betId}_${i}_${amount || 0}`)
          .setLabel(opt.slice(0, 20))
          .setEmoji(LETTER_EMOJI[i] || '⚪')
          .setStyle(ButtonStyle.Primary)
      )
    );
    return message.reply({ content: `Pick your outcome for **${bet.title}**:`, components: [row] });
  },

  async resolveBetPrompt(message, args) {
    if (!this.isAdmin(message)) return message.reply(`${E.ERROR} Only admins can resolve bets!`);
    const betId = parseInt(args[0]);
    if (!betId) return message.reply(`${E.ERROR} Usage: \`!resolvebet <id>\` then pick the winning outcome.`);

    const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);
    if (bet.status !== 'open') return message.reply(`${E.ERROR} Bet #${betId} is already **${bet.status}**!`);

    const options = bet.options || [];
    const row = new ActionRowBuilder().addComponents(
      ...options.slice(0, 4).map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(`bet_resolve_${betId}_${i}`)
          .setLabel(opt.slice(0, 20))
          .setEmoji(LETTER_EMOJI[i] || '⚪')
          .setStyle(ButtonStyle.Success)
      ),
      new ButtonBuilder().setCustomId(`bet_resolve_${betId}_cancel`).setLabel('Cancel Bet').setStyle(ButtonStyle.Danger),
    );
    return message.reply({ content: `Which outcome won for **${bet.title}**?`, components: [row] });
  },

  // Generic resolve, called by either the button collector or directly
  async resolveBetByOption(betId, winningOption, replyFn, channelSendFn) {
    const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
    if (!bet) return replyFn(`${E.ERROR} Bet #${betId} not found!`);
    if (bet.status !== 'open') return replyFn(`${E.ERROR} Bet #${betId} is already **${bet.status}**!`);

    const entries = await db.all('SELECT * FROM bet_entries WHERE bet_id = ?', [betId]);

    if (winningOption === 'cancel') {
      for (const entry of entries) await economy.addFunds(entry.user_id, entry.amount, `Bet #${betId} cancelled`);
      await db.run("UPDATE bets SET status = 'cancelled' WHERE id = ?", [betId]);
      return replyFn(`<:checkmark:1495666088417956002> Bet #${betId} cancelled. All ${entries.length} bettors refunded!`);
    }

    await db.run("UPDATE bets SET status = 'resolved', outcome = ? WHERE id = ?", [winningOption, betId]);
    const winEntries = entries.filter(e => e.side === winningOption);
    const winPool     = winEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalPool    = entries.reduce((sum, e) => sum + e.amount, 0);

    if (winEntries.length === 0) {
      return (channelSendFn || replyFn)({ embeds: [
        new EmbedBuilder()
          .setColor('#FFB3A0')
          .setTitle(`Bet #${betId} Resolved — ${winningOption} wins!`)
          .setDescription(`No one bet on **${winningOption}**. No payouts.`)
      ]});
    }

    const payoutLines = [];
    for (const entry of winEntries) {
      const payout = Math.floor((entry.amount / winPool) * totalPool);
      await economy.addFunds(entry.user_id, payout, `Bet #${betId} win (${winningOption})`);
      payoutLines.push(`${entry.username}: +${payout.toLocaleString()} sins`);
    }

    return (channelSendFn || replyFn)({ embeds: [
      new EmbedBuilder()
        .setColor('#FFE4A0')
        .setTitle(`${E.TROPHY} Bet #${betId} Resolved!`)
        .setDescription(`**${bet.title}**\n\nOutcome: **${winningOption}**\n\n**Payouts:**\n${payoutLines.join('\n')}`)
        .setFooter({ text: `Total pot: ${totalPool.toLocaleString()} sins` })
    ]});
  },

  async cancelBet(message, args) {
    const betId = parseInt(args[0]);
    if (!this.isAdmin(message)) return message.reply(`${E.ERROR} Only admins can cancel bets!`);
    return this.resolveBetByOption(betId, 'cancel', (msg) => message.reply(msg));
  },

  async myBets(message) {
    const entries = await db.all(`
      SELECT be.*, b.title, b.status, b.outcome
      FROM bet_entries be JOIN bets b ON be.bet_id = b.id
      WHERE be.user_id = ? ORDER BY be.placed_at DESC LIMIT 10
    `, [message.author.id]);

    if (entries.length === 0) return message.reply(`${E.INFO} You haven't placed any bets yet!`);

    const lines = entries.map(e => {
      let result = '';
      if (e.status === 'resolved') result = e.outcome === e.side ? ` <:checkmark:1495666088417956002> WON` : ` <:wrong:1495666083594502174> LOST`;
      else if (e.status === 'cancelled') result = ' ↩️ REFUNDED';
      return `**#${e.bet_id}** ${e.title.substring(0, 40)} — **${e.side}** for **${e.amount} sins**${result}`;
    });

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`${message.author.username}'s Bets`)
        .setDescription(lines.join('\n'))
    ]});
  },

  async listBets(message) {
    const bets = await db.all("SELECT * FROM bets WHERE status = 'open' ORDER BY id DESC LIMIT 10");
    if (!bets.length) return message.reply(`${E.INFO} No open bets right now! Create one with \`/createbet\`.`);

    const lines = bets.map(b => `**#${b.id}** ${b.title} — ${(b.options || []).join(' vs ')} — Pool: ${b.total_pool.toLocaleString()} sins`);
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#FFB3A0').setTitle('📋 Open Bets').setDescription(lines.join('\n'))
    ]});
  },

  async betInfo(message, args) {
    const betId = parseInt(args[0]);
    const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);

    const options = bet.options || [];
    const lines = await Promise.all(options.map(async (opt, idx) => {
      const row = await db.get('SELECT SUM(amount) as t, COUNT(*) as c FROM bet_entries WHERE bet_id = ? AND side = ?', [betId, opt]);
      return `${LETTER_EMOJI[idx] || '•'} **${opt}** — ${(row?.t || 0).toLocaleString()} sins (${row?.c || 0} bettors)`;
    }));

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`Bet #${betId}: ${bet.title}`)
        .setDescription(`${bet.description || ''}\n\n${lines.join('\n')}`)
        .addFields(
          { name: 'Status', value: bet.status, inline: true },
          { name: 'Total Pool', value: `${bet.total_pool.toLocaleString()} sins`, inline: true },
        )
    ]});
  },

  async polymarketFetch(message) {
    try {
      const res = await axios.get('https://gamma-api.polymarket.com/markets?limit=5&active=true&closed=false');
      const markets = res.data;
      if (!markets || !markets.length) return message.reply(`${E.ERROR} No active Polymarket markets found.`);
      const lines = markets.map(m => `**${m.question}**`).join('\n');
      return message.reply({ embeds: [
        new EmbedBuilder().setColor('#FFB3A0').setTitle('📊 Polymarket — Active Markets').setDescription(lines)
      ]});
    } catch (e) {
      return message.reply(`${E.ERROR} Couldn't fetch Polymarket markets right now.`);
    }
  },

  // ── Slash command entry point ─────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    if (commandName === 'createbet') {
      const title   = interaction.options.getString('title');
      const desc    = interaction.options.getString('description') || '';
      const hours   = interaction.options.getInteger('hours') || 24;
      const options = interaction.options.getString('options');
      return this.createBetDirect(interaction, title, desc, hours, options);
    }

    await interaction.deferReply({ ephemeral: true });

    const fakeMessage = {
      author:  interaction.user,
      member:  interaction.member,
      channel: interaction.channel,
      guild:   interaction.guild,
      reply:   async (data) => interaction.editReply(typeof data === 'string' ? { content: data } : data),
    };

    let args = [];
    if (commandName === 'bet') {
      args = [String(interaction.options.getInteger('id')), String(interaction.options.getInteger('amount'))];
    } else if (commandName === 'betinfo') {
      args = [String(interaction.options.getInteger('id'))];
    } else if (commandName === 'resolvebet') {
      args = [String(interaction.options.getInteger('id'))];
    } else if (commandName === 'cancelbet') {
      args = [String(interaction.options.getInteger('id'))];
    }

    await this.handleCommand(fakeMessage, args, commandName);
  },

  // ── Button handler for resolve/quick-bet prompts (registered globally) ───
  async handleButton(interaction) {
    const id = interaction.customId;

    // Resolve buttons: bet_resolve_<id>_<optionIdx|cancel>
    const resolveMatch = id.match(/^bet_resolve_(\d+)_(\d+|cancel)$/);
    if (resolveMatch) {
      if (!this.isAdmin({ member: interaction.member }))
        return interaction.reply({ content: `${E.ERROR} Only admins can resolve bets!`, ephemeral: true });
      await interaction.deferUpdate().catch(() => {});
      const betId = parseInt(resolveMatch[1]);
      const bet   = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
      const winningOption = resolveMatch[2] === 'cancel' ? 'cancel' : (bet?.options || [])[parseInt(resolveMatch[2])];
      return this.resolveBetByOption(betId, winningOption,
        async (msg) => interaction.followUp(typeof msg === 'string' ? { content: msg } : msg),
        async (msg) => interaction.channel.send(msg));
    }

    // Quick-bet buttons from !bet prompt: bet_quick_<id>_<optionIdx>_<amount>
    const quickMatch = id.match(/^bet_quick_(\d+)_(\d+)_(\d+)$/);
    if (quickMatch) {
      const [, betIdStr, optIdxStr, amountStr] = quickMatch;
      const betId = parseInt(betIdStr);
      const bet   = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
      if (!bet || bet.status !== 'open') return interaction.reply({ content: `${E.ERROR} This bet is no longer open!`, ephemeral: true });
      const side = (bet.options || [])[parseInt(optIdxStr)];
      let amount = parseInt(amountStr);

      if (!amount) {
        const amountRow = new ActionRowBuilder().addComponents(
          ...[10, 25, 50, 100, 250].map(amt =>
            new ButtonBuilder().setCustomId(`bet_amt_${betId}_${optIdxStr}_${amt}`).setLabel(`${amt} sins`).setStyle(ButtonStyle.Secondary)
          )
        );
        return interaction.reply({ content: `How much do you want to bet on **${side}**?`, components: [amountRow], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const bal = await economy.getBalance(interaction.user.id);
      if (bal < amount) return interaction.editReply(`${E.ERROR} You need **${amount} sins** but only have **${bal.toLocaleString()}**!`);
      const existing = await db.get('SELECT * FROM bet_entries WHERE bet_id = ? AND user_id = ?', [betId, interaction.user.id]);
      if (existing) return interaction.editReply(`<a:Warning:1497476844860215366> You already placed a bet on this one!`);

      await economy.removeFunds(interaction.user.id, amount, `Bet #${betId} (${side})`);
      await db.run('INSERT INTO bet_entries (bet_id, user_id, username, side, amount) VALUES (?, ?, ?, ?, ?)', [betId, interaction.user.id, interaction.user.username, side, amount]);
      await db.run('UPDATE bets SET total_pool = total_pool + ? WHERE id = ?', [amount, betId]);
      return interaction.editReply(`<:checkmark:1495666088417956002> Bet **${amount} sins** on **${side}** for bet #${betId}!`);
    }
  },

  isAdmin(message) {
    const adminRole = process.env.ADMIN_ROLE || 'Admin';
    return message.member && (
      message.member.permissions.has('Administrator') ||
      message.member.roles.cache.some(r => r.name === adminRole)
    );
  }
};
