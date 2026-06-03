const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, economy } = require('../utils/database');
const E = require('../utils/emojis');
const axios = require('axios');

module.exports = {
  name: 'betting',

  async handleCommand(message, args, command) {
    switch (command) {
      case 'createbet': case 'newbet':   return this.createBet(message, args);
      case 'bet':                        return this.placeBet(message, args);
      case 'bets': case 'openbets':      return this.listBets(message);
      case 'resolvebet': case 'endbet':  return this.resolveBet(message, args);
      case 'betinfo':                    return this.betInfo(message, args);
      case 'cancelbet':                  return this.cancelBet(message, args);
      case 'mybets':                     return this.myBets(message);
      case 'polymarket': case 'poly':    return this.polymarketFetch(message);
    }
  },

  async createBet(message, args) {
    const fullText = args.join(' ');
    const matches  = fullText.match(/"([^"]+)"/g);
    if (!matches || matches.length < 1) {
      return message.reply(`${E.ERROR} Usage: \`!createbet "Bet Title" "Description" [hours]\`\nExample: \`!createbet "Will it rain tomorrow?" "Based on the forecast" 24\``);
    }
    const title       = matches[0].replace(/"/g, '');
    const description = matches[1] ? matches[1].replace(/"/g, '') : '';
    const hoursMatch  = fullText.replace(/"[^"]*"/g, '').match(/\d+/);
    const hours       = hoursMatch ? parseInt(hoursMatch[0]) : 24;
    const closesAt    = new Date(Date.now() + hours * 3_600_000).toISOString();

    const result = await db.run(
      'INSERT INTO bets (title, description, creator_id, closes_at) VALUES (?, ?, ?, ?)',
      [title, description, message.author.id, closesAt]
    );
    const betId = result.lastInsertRowid;

    return message.channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`Bet & Regret — New Bet Created!`)
        .setDescription(`**#${betId}: ${title}**\n\n${description || ''}`)
        .addFields(
          { name: `${E.CLOCK} Closes In`, value: `${hours} hours`,                                                  inline: true },
          { name: '🆔 Bet ID',            value: `#${betId}`,                                                        inline: true },
          { name: '📋 How to Bet',        value: `\`!bet ${betId} yes <amount>\` or \`!bet ${betId} no <amount>\`` }
        )
        .setFooter({ text: `Created by ${message.author.username}` })
    ]});
  },

  async placeBet(message, args) {
    const betId  = parseInt(args[0]);
    const side   = args[1]?.toLowerCase();
    const amount = parseInt(args[2]);

    if (!betId || !side || !amount) return message.reply(`${E.ERROR} Usage: \`!bet <id> <yes|no> <amount>\``);
    if (!['yes', 'no'].includes(side)) return message.reply(`${E.ERROR} Side must be \`yes\` or \`no\`!`);
    if (amount < 10) return message.reply(`${E.ERROR} Minimum bet is 10 oops!`);

    const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);
    if (bet.status !== 'open') return message.reply(`${E.ERROR} Bet #${betId} is already **${bet.status}**!`);
    if (new Date(bet.closes_at) < new Date()) return message.reply(`${E.ERROR} This bet has already closed!`);

    const existing = await db.get('SELECT id FROM bet_entries WHERE bet_id = ? AND user_id = ?', [betId, message.author.id]);
    if (existing) return message.reply(`${E.ERROR} You already bet on this one!`);

    await economy.getUser(message.author.id, message.author.username);
    const bal = await economy.getBalance(message.author.id);
    if (bal < amount) return message.reply(`${E.ERROR} You don't have enough oops!`);

    await economy.removeFunds(message.author.id, amount, `Bet #${betId} (${side})`);
    await db.run(
      'INSERT INTO bet_entries (bet_id, user_id, username, side, amount) VALUES (?, ?, ?, ?, ?)',
      [betId, message.author.id, message.author.username, side, amount]
    );
    await db.run('UPDATE bets SET total_pool = total_pool + ? WHERE id = ?', [amount, betId]);

    const totals     = await this.getBetTotals(betId);
    const sideEmoji  = side === 'yes' ? E.BET_YES : E.BET_NO;

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(side === 'yes' ? '#B5EAC8' : '#FFB3CC')
        .setTitle(`Bet Placed!`)
        .setDescription(`**${message.author.username}** bet **${amount} oops** on **${sideEmoji} ${side.toUpperCase()}** for:\n*${bet.title}*`)
        .addFields(
          { name: `${E.BET_YES} YES pool`,  value: `${totals.yes} oops`,                             inline: true },
          { name: `${E.BET_NO} NO pool`,    value: `${totals.no} oops`,                              inline: true },
          { name: `${E.BB_COIN} Total`,     value: `${totals.total} oops`,                           inline: true },
          { name: '📈 Potential payout',    value: `~${this.calcPayout(amount, side, totals)} oops`, inline: true }
        )
    ]});
  },

  async getBetTotals(betId) {
    const entries = await db.all(
      'SELECT side, SUM(amount) as total FROM bet_entries WHERE bet_id = ? GROUP BY side',
      [betId]
    );
    const yes = Number(entries.find(e => e.side === 'yes')?.total || 0);
    const no  = Number(entries.find(e => e.side === 'no')?.total  || 0);
    return { yes, no, total: yes + no };
  },

  calcPayout(amount, side, totals) {
    const winPool = side === 'yes' ? totals.yes : totals.no;
    if (winPool === 0) return amount;
    return Math.floor((amount / winPool) * totals.total);
  },

  async listBets(message) {
    const bets = await db.all("SELECT * FROM bets WHERE status = 'open' ORDER BY created_at DESC LIMIT 10");
    if (!bets.length) return message.reply(`${E.INFO} No open bets right now! Create one with \`!createbet "Title" "Description"\``);

    const embed = new EmbedBuilder().setColor('#FFB3A0').setTitle(`Bet & Regret — Open Bets`);
    for (const bet of bets) {
      const totals   = await this.getBetTotals(bet.id);
      const timeLeft = Math.max(0, Math.floor((new Date(bet.closes_at) - Date.now()) / 3_600_000));
      embed.addFields({
        name:  `#${bet.id}: ${bet.title}`,
        value: `Pool: **${totals.total} oops** | ${E.BET_YES} YES: ${totals.yes} | ${E.BET_NO} NO: ${totals.no} | ${E.CLOCK} ${timeLeft}h left\n\`!bet ${bet.id} yes/no <amount>\``
      });
    }
    return message.reply({ embeds: [embed] });
  },

  async betInfo(message, args) {
    const betId = parseInt(args[0]);
    if (!betId) return message.reply(`${E.ERROR} Usage: \`!betinfo <id>\``);

    const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);

    const totals  = await this.getBetTotals(betId);
    const entries = await db.all('SELECT * FROM bet_entries WHERE bet_id = ? ORDER BY amount DESC', [betId]);
    const yesBettors = entries.filter(e => e.side === 'yes').map(e => `${e.username}: ${e.amount} oops`).join('\n') || 'None';
    const noBettors  = entries.filter(e => e.side === 'no').map(e =>  `${e.username}: ${e.amount} oops`).join('\n') || 'None';

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`Bet #${betId}: ${bet.title}`)
        .setDescription(bet.description || '')
        .addFields(
          { name: '📊 Status',         value: bet.status,          inline: true },
          { name: `${E.BB_COIN} Pool`, value: `${totals.total} oops`, inline: true },
          { name: `${E.BET_YES} YES`,  value: `${totals.yes} oops`,   inline: true },
          { name: `${E.BET_NO} NO`,    value: `${totals.no} oops`,    inline: true },
          { name: `${E.BET_YES} YES Bettors`, value: yesBettors.substring(0, 1024) },
          { name: `${E.BET_NO} NO Bettors`,   value: noBettors.substring(0, 1024)  },
        )
        .setFooter({ text: `Closes: ${new Date(bet.closes_at).toLocaleString()}` })
    ]});
  },

  async resolveBet(message, args) {
    if (!this.isAdmin(message)) return message.reply(`${E.ERROR} Only admins can resolve bets!`);
    const betId   = parseInt(args[0]);
    const outcome = args[1]?.toLowerCase();
    if (!betId || !['yes', 'no', 'cancel'].includes(outcome))
      return message.reply(`${E.ERROR} Usage: \`!resolvebet <id> <yes|no|cancel>\``);

    const bet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);
    if (bet.status !== 'open') return message.reply(`${E.ERROR} Bet #${betId} is already **${bet.status}**!`);

    const entries = await db.all('SELECT * FROM bet_entries WHERE bet_id = ?', [betId]);
    const totals  = await this.getBetTotals(betId);

    if (outcome === 'cancel') {
      for (const e of entries) await economy.addFunds(e.user_id, e.amount, `Bet #${betId} cancelled`);
      await db.run("UPDATE bets SET status = 'cancelled' WHERE id = ?", [betId]);
      return message.reply(`${E.SUCCESS} Bet #${betId} cancelled. All ${entries.length} bettors refunded!`);
    }

    await db.run('UPDATE bets SET status = $1, outcome = $2 WHERE id = $3', [outcome, outcome, betId]);
    const winEntries = entries.filter(e => e.side === outcome);
    const winPool    = outcome === 'yes' ? totals.yes : totals.no;

    if (!winEntries.length) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor('#FFB3A0')
          .setTitle(`Bet #${betId} Resolved — ${outcome.toUpperCase()} wins!`)
          .setDescription(`No one bet on ${outcome}. No payouts.`)
      ]});
    }

    const payoutLines = [];
    for (const entry of winEntries) {
      const payout = Math.floor((entry.amount / winPool) * totals.total);
      await economy.addFunds(entry.user_id, payout, `Bet #${betId} win (${outcome})`);
      payoutLines.push(`${entry.username}: +${payout} oops`);
    }

    return message.channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#FFE4A0')
        .setTitle(`${E.TROPHY} Bet #${betId} Resolved!`)
        .setDescription(`**${bet.title}**\n\n${outcome === 'yes' ? E.BET_YES : E.BET_NO} Outcome: **${outcome.toUpperCase()}**\n\n**Payouts:**\n${payoutLines.join('\n')}`)
        .setFooter({ text: `Total pot: ${totals.total} oops` })
    ]});
  },

  async cancelBet(message, args) {
    return this.resolveBet(message, [args[0], 'cancel']);
  },

  async myBets(message) {
    const entries = await db.all(`
      SELECT be.*, b.title, b.status, b.outcome
      FROM bet_entries be JOIN bets b ON be.bet_id = b.id
      WHERE be.user_id = ? ORDER BY be.placed_at DESC LIMIT 10
    `, [message.author.id]);

    if (!entries.length) return message.reply(`${E.INFO} You haven't placed any bets yet!`);

    const lines = entries.map(e => {
      let result = '';
      if (e.status === 'resolved')  result = e.outcome === e.side ? ` ${E.BET_YES} WON` : ` ${E.BET_NO} LOST`;
      if (e.status === 'cancelled') result = ' ↩️ REFUNDED';
      return `**#${e.bet_id}** ${e.title.substring(0, 40)} — **${e.side.toUpperCase()}** for **${e.amount} oops**${result}`;
    });

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`${message.author.username}'s Bets`)
        .setDescription(lines.join('\n'))
    ]});
  },

  async polymarketFetch(message) {
    if (process.env.POLYMARKET_ENABLED !== 'true') {
      return message.reply(`${E.INFO} Polymarket integration is disabled. Set \`POLYMARKET_ENABLED=true\` in Railway variables.`);
    }
    try {
      const response = await axios.get('https://gamma-api.polymarket.com/markets?limit=5&active=true&closed=false', { timeout: 10000 });
      const markets  = response.data;
      if (!markets?.length) return message.reply('No active Polymarket markets found.');

      const embed = new EmbedBuilder()
        .setColor('#B3C8FF')
        .setTitle(`${E.POLYMARKET} Polymarket — Trending Markets`)
        .setDescription('Mirror one with `!createbet "Title" "Description"`');

      for (const market of markets.slice(0, 5)) {
        const yesPrice = market.outcomePrices ? JSON.parse(market.outcomePrices)[0] : null;
        embed.addFields({
          name:  (market.question || 'Unknown').substring(0, 100),
          value: `${E.BET_YES} YES: **${yesPrice ? Math.round(yesPrice * 100) : '?'}%** | Volume: $${(market.volume || 0).toLocaleString()}\n[View on Polymarket](https://polymarket.com/event/${market.slug})`
        });
      }
      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Polymarket fetch error:', err.message);
      return message.reply(`${E.ERROR} Failed to fetch Polymarket data.`);
    }
  },

  // ── Slash handler ─────────────────────────────────────────────────────────────
  async createBetDirect(interaction, title, desc, hours) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
    const closesAt = new Date(Date.now() + hours * 3_600_000).toISOString();

    const result = await db.run(
      'INSERT INTO bets (title, description, creator_id, closes_at) VALUES (?, ?, ?, ?)',
      [title, desc, interaction.user.id, closesAt]
    );
    const betId = result.lastInsertRowid;

    const embed = new EmbedBuilder()
      .setColor('#FFB3A0')
      .setTitle(`${title}`)
      .setDescription(`${desc ? desc + '\n\n' : ''}<a:moneybag:1479268556687540345> **Total Pool: 0 oops**\n✅ YES: **0 oops** • ❌ NO: **0 oops**`)
      .addFields(
        { name: `${E.CLOCK} Closes In`, value: `${hours} hours`, inline: true },
        { name: '🆔 Bet ID',            value: `#${betId}`,       inline: true },
        { name: '📋 To Resolve',        value: `\`/resolvebet id:${betId} outcome:yes/no\``, inline: false },
      )
      .setFooter({ text: `Created by ${interaction.user.username}` });

    const yesId    = `bet_yes_${betId}`;
    const noId     = `bet_no_${betId}`;
    const cancelId = `bet_cancel_${betId}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(yesId).setLabel('✅ Bet YES').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(noId).setLabel('❌ Bet NO').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel('🚫 Cancel Bet').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ content: `✅ Bet **"${title}"** created! (#${betId})` });
    const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ time: hours * 3_600_000 });

    collector.on('collect', async (i) => {
      // Cancel
      if (i.customId === cancelId) {
        if (i.user.id !== interaction.user.id && !i.member?.permissions.has('Administrator')) {
          return i.reply({ content: `❌ Only the bet creator or an admin can cancel this!`, ephemeral: true });
        }
        await i.deferReply({ ephemeral: true });
        const entries = await db.all('SELECT * FROM bet_entries WHERE bet_id = ?', [betId]);
        for (const e of entries) await economy.addFunds(e.user_id, e.amount, `Bet #${betId} cancelled`);
        await db.run("UPDATE bets SET status = 'cancelled' WHERE id = ?", [betId]);

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(yesId).setLabel('✅ Bet YES').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(noId).setLabel('❌ Bet NO').setStyle(ButtonStyle.Danger).setDisabled(true),
          new ButtonBuilder().setCustomId(cancelId).setLabel('🚫 Cancelled').setStyle(ButtonStyle.Secondary).setDisabled(true),
        );
        await msg.edit({ components: [disabledRow] }).catch(() => {});
        const refundLines = entries.map(e => `• **${e.username}** — ${Number(e.amount).toLocaleString()} oops`).join('\n');
        await i.editReply({ content: `✅ Bet **#${betId}** cancelled!${entries.length > 0 ? `\n\n**Refunded:**\n${refundLines}` : '\nNo bets placed.'}` });
        await i.channel.send(`🚫 **Bet #${betId} "${title}"** cancelled. ${entries.length} player(s) refunded.`);
        collector.stop('cancelled');
        return;
      }

      // Place bet — show amount picker
      const side = i.customId === yesId ? 'yes' : 'no';
      const bal  = await economy.getBalance(i.user.id);
      if (bal < 10) return i.reply({ content: '❌ You need at least 10 oops to bet!', ephemeral: true });

      const amountRow = new ActionRowBuilder().addComponents(
        ...[10, 25, 50, 100, 250].map(amt =>
          new ButtonBuilder()
            .setCustomId(`bet_amt_${betId}_${side}_${amt}`)
            .setLabel(`${amt} oops`)
            .setStyle(ButtonStyle.Secondary)
        )
      );
      await i.reply({
        content: `**${side === 'yes' ? '✅ YES' : '❌ NO'}** — How much do you want to bet?`,
        components: [amountRow],
        ephemeral: true,
      });
    });

    // Handle amount button clicks
    interaction.client.on('interactionCreate', async (i) => {
      if (!i.isButton()) return;
      const match = i.customId.match(/^bet_amt_(\d+)_(yes|no)_(\d+)$/);
      if (!match) return;
      const [, id, side, amtStr] = match;
      if (parseInt(id) !== betId) return;
      const amount = parseInt(amtStr);

      await i.deferReply({ ephemeral: true }).catch(() => {});

      const bal = await economy.getBalance(i.user.id);
      if (bal < amount) return i.editReply({ content: `❌ You need **${amount} oops** but only have **${bal.toLocaleString()}**!` });

      const freshBet = await db.get('SELECT * FROM bets WHERE id = ?', [betId]);
      if (!freshBet || freshBet.status !== 'open') return i.editReply({ content: `❌ This bet is no longer open!` });

      const existing = await db.get('SELECT id FROM bet_entries WHERE bet_id = ? AND user_id = ?', [betId, i.user.id]);
      if (existing) return i.editReply({ content: `⚠️ You already placed a bet on this one!` });

      await economy.getUser(i.user.id, i.user.username);
      await economy.removeFunds(i.user.id, amount, `Bet #${betId}`);
      await db.run(
        'INSERT INTO bet_entries (bet_id, user_id, username, side, amount) VALUES (?, ?, ?, ?, ?)',
        [betId, i.user.id, i.user.username, side, amount]
      );
      await db.run('UPDATE bets SET total_pool = total_pool + ? WHERE id = ?', [amount, betId]);

      // Update live embed
      const updatedBet = await db.get('SELECT total_pool FROM bets WHERE id = ?', [betId]);
      const yesRow     = await db.get("SELECT SUM(amount) as t FROM bet_entries WHERE bet_id = ? AND side = 'yes'", [betId]);
      const noRow      = await db.get("SELECT SUM(amount) as t FROM bet_entries WHERE bet_id = ? AND side = 'no'",  [betId]);
      const updatedEmbed = new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`${title}`)
        .setDescription(
          `${desc ? desc + '\n\n' : ''}` +
          `<a:moneybag:1479268556687540345> **Total Pool: ${Number(updatedBet?.total_pool || 0).toLocaleString()} oops**\n` +
          `✅ YES: **${Number(yesRow?.t || 0).toLocaleString()} oops** • ❌ NO: **${Number(noRow?.t || 0).toLocaleString()} oops**`
        )
        .addFields(
          { name: `${E.CLOCK} Closes In`, value: `${hours} hours`, inline: true },
          { name: '🆔 Bet ID',            value: `#${betId}`,       inline: true },
        )
        .setFooter({ text: `Created by ${interaction.user.username}` });
      await msg.edit({ embeds: [updatedEmbed] }).catch(() => {});

      await i.editReply({
        content: `${side === 'yes' ? '✅' : '❌'} **${i.user.username}** bet **${amount} oops** on **${side.toUpperCase()}** for bet #${betId}!`,
      });
    });
  },

  async handleSlash(interaction, commandName) {
    await interaction.deferReply({ ephemeral: true });

    const fakeMessage = {
      author:   interaction.user,
      member:   interaction.member,
      channel:  interaction.channel,
      guild:    interaction.guild,
      mentions: { users: { first: () => null } },
      reply:    async (data) => interaction.editReply(typeof data === 'string' ? { content: data } : data),
    };

    if (commandName === 'createbet') {
      const title = interaction.options.getString('title');
      const desc  = interaction.options.getString('description') || '';
      const hours = interaction.options.getInteger('hours') || 24;
      return this.createBetDirect(interaction, title, desc, hours);
    }

    let args = [];
    if (commandName === 'bet') {
      args = [
        String(interaction.options.getInteger('id')),
        interaction.options.getString('side'),
        String(interaction.options.getInteger('amount')),
      ];
    } else if (commandName === 'betinfo') {
      args = [String(interaction.options.getInteger('id'))];
    } else if (commandName === 'resolvebet') {
      args = [
        String(interaction.options.getInteger('id')),
        interaction.options.getString('outcome'),
      ];
    }

    await this.handleCommand(fakeMessage, args, commandName);
  },

  isAdmin(message) {
    const adminRole = process.env.ADMIN_ROLE || 'Admin';
    return message.member && (
      message.member.permissions.has('Administrator') ||
      message.member.roles.cache.some(r => r.name === adminRole)
    );
  },
};
