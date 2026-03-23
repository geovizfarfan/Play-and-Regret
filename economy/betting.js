const { EmbedBuilder } = require('discord.js');
const { db, economy } = require('../utils/database');
const E = require('../utils/emojis');
const axios = require('axios');

module.exports = {
  name: 'betting',

  async handleCommand(message, args, command) {
    switch (command) {
      case 'createbet': case 'newbet':          return this.createBet(message, args);
      case 'bet':                               return this.placeBet(message, args);
      case 'bets': case 'openbets':             return this.listBets(message);
      case 'resolvebet': case 'endbet':         return this.resolveBet(message, args);
      case 'betinfo':                           return this.betInfo(message, args);
      case 'cancelbet':                         return this.cancelBet(message, args);
      case 'mybets':                            return this.myBets(message);
      case 'polymarket': case 'poly':           return this.polymarketFetch(message, args);
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
    const closesAt    = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    const result = db.prepare(
      'INSERT INTO bets (title, description, created_by, closes_at) VALUES (?, ?, ?, ?)'
    ).run(title, description, message.author.id, closesAt);
    const betId = result.lastInsertRowid;

    return message.channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`${E.BET_DICE} Bet & Regret — New Bet Created!`)
        .setDescription(`**#${betId}: ${title}**\n\n${description || ''}`)
        .addFields(
          { name: `${E.CLOCK} Closes In`, value: `${hours} hours`,                                                   inline: true },
          { name: '🆔 Bet ID',            value: `#${betId}`,                                                          inline: true },
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

    const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);
    if (bet.status !== 'open') return message.reply(`${E.ERROR} Bet #${betId} is already **${bet.status}**!`);
    if (new Date(bet.closes_at) < new Date()) return message.reply(`${E.ERROR} This bet has already closed!`);

    const existing = db.prepare('SELECT * FROM bet_entries WHERE bet_id = ? AND user_id = ?').get(betId, message.author.id);
    if (existing) return message.reply(`${E.ERROR} You already bet on this one!`);

    economy.getUser(message.author.id, message.author.username);
    if (economy.getBalance(message.author.id) < amount) return message.reply(`${E.ERROR} You don't have enough oops!`);

    economy.removeFunds(message.author.id, amount, `Bet #${betId} (${side})`);
    db.prepare('INSERT INTO bet_entries (bet_id, user_id, username, side, amount) VALUES (?, ?, ?, ?, ?)').run(betId, message.author.id, message.author.username, side, amount);
    db.prepare('UPDATE bets SET total_pool = total_pool + ? WHERE id = ?').run(amount, betId);

    const totals = this.getBetTotals(betId);
    const sideEmoji = side === 'yes' ? E.BET_YES : E.BET_NO;

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(side === 'yes' ? '#B5EAC8' : '#FFB3CC')
        .setTitle(`${E.BET_DICE} Bet Placed!`)
        .setDescription(`**${message.author.username}** bet **${amount} oops** on **${sideEmoji} ${side.toUpperCase()}** for:\n*${bet.title}*`)
        .addFields(
          { name: `${E.BET_YES} YES pool`,        value: `${totals.yes} oops`,                             inline: true },
          { name: `${E.BET_NO} NO pool`,           value: `${totals.no} oops`,                              inline: true },
          { name: `${E.BB_COIN} Total Pool`,       value: `${totals.total} oops`,                           inline: true },
          { name: '📈 Potential payout',           value: `~${this.calcPayout(amount, side, totals)} oops`, inline: true }
        )
    ]});
  },

  getBetTotals(betId) {
    const entries = db.prepare('SELECT side, SUM(amount) as total FROM bet_entries WHERE bet_id = ? GROUP BY side').all(betId);
    const yes = entries.find(e => e.side === 'yes')?.total || 0;
    const no  = entries.find(e => e.side === 'no')?.total  || 0;
    return { yes, no, total: yes + no };
  },

  calcPayout(amount, side, totals) {
    const winPool = side === 'yes' ? totals.yes : totals.no;
    if (winPool === 0) return amount;
    return Math.floor((amount / winPool) * totals.total);
  },

  async listBets(message) {
    const bets = db.prepare('SELECT * FROM bets WHERE status = "open" ORDER BY created_at DESC LIMIT 10').all();
    if (bets.length === 0) return message.reply(`${E.INFO} No open bets right now! Create one with \`!createbet "Title" "Description"\``);

    const embed = new EmbedBuilder().setColor('#FFB3A0').setTitle(`${E.BET_DICE} Bet & Regret — Open Bets`);
    for (const bet of bets) {
      const totals    = this.getBetTotals(bet.id);
      const timeLeft  = Math.max(0, Math.floor((new Date(bet.closes_at) - Date.now()) / (1000 * 60 * 60)));
      embed.addFields({
        name:  `#${bet.id}: ${bet.title}`,
        value: `Pool: **${totals.total} oops** | ${E.BET_YES} YES: ${totals.yes} oops | ${E.BET_NO} NO: ${totals.no} oops | ${E.CLOCK} ${timeLeft}h left\n\`!bet ${bet.id} yes/no <amount>\``
      });
    }
    return message.reply({ embeds: [embed] });
  },

  async betInfo(message, args) {
    const betId = parseInt(args[0]);
    if (!betId) return message.reply(`${E.ERROR} Usage: \`!betinfo <id>\``);

    const bet     = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);
    const totals  = this.getBetTotals(betId);
    const entries = db.prepare('SELECT * FROM bet_entries WHERE bet_id = ? ORDER BY amount DESC').all(betId);
    const yesBettors = entries.filter(e => e.side === 'yes').map(e => `${e.username}: ${e.amount} oops`).join('\n') || 'None';
    const noBettors  = entries.filter(e => e.side === 'no').map(e => `${e.username}: ${e.amount} oops`).join('\n')  || 'None';

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`${E.BET_DICE} Bet #${betId}: ${bet.title}`)
        .setDescription(bet.description || '')
        .addFields(
          { name: '📊 Status',           value: bet.status,               inline: true },
          { name: `${E.BB_COIN} Pool`,   value: `${totals.total} oops`,     inline: true },
          { name: `${E.BET_YES} YES`,    value: `${totals.yes} oops`,        inline: true },
          { name: `${E.BET_NO} NO`,      value: `${totals.no} oops`,         inline: true },
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
    if (!betId || !['yes', 'no', 'cancel'].includes(outcome)) return message.reply(`${E.ERROR} Usage: \`!resolvebet <id> <yes|no|cancel>\``);

    const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);
    if (!bet) return message.reply(`${E.ERROR} Bet #${betId} not found!`);
    if (bet.status !== 'open') return message.reply(`${E.ERROR} Bet #${betId} is already **${bet.status}**!`);

    const entries = db.prepare('SELECT * FROM bet_entries WHERE bet_id = ?').all(betId);
    const totals  = this.getBetTotals(betId);

    if (outcome === 'cancel') {
      for (const entry of entries) economy.addFunds(entry.user_id, entry.amount, `Bet #${betId} cancelled`);
      db.prepare('UPDATE bets SET status = "cancelled" WHERE id = ?').run(betId);
      return message.reply(`${E.SUCCESS} Bet #${betId} cancelled. All ${entries.length} bettors refunded!`);
    }

    db.prepare('UPDATE bets SET status = "resolved", outcome = ? WHERE id = ?').run(outcome, betId);
    const winEntries = entries.filter(e => e.side === outcome);
    const winPool    = outcome === 'yes' ? totals.yes : totals.no;

    if (winEntries.length === 0) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor('#FFB3A0')
          .setTitle(`${E.BET_DICE} Bet #${betId} Resolved — ${outcome.toUpperCase()} wins!`)
          .setDescription(`No one bet on ${outcome}. No payouts.`)
      ]});
    }

    const payoutLines = [];
    for (const entry of winEntries) {
      const payout = Math.floor((entry.amount / winPool) * totals.total);
      economy.addFunds(entry.user_id, payout, `Bet #${betId} win (${outcome})`);
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
    const entries = db.prepare(`
      SELECT be.*, b.title, b.status, b.outcome
      FROM bet_entries be JOIN bets b ON be.bet_id = b.id
      WHERE be.user_id = ? ORDER BY be.created_at DESC LIMIT 10
    `).all(message.author.id);

    if (entries.length === 0) return message.reply(`${E.INFO} You haven't placed any bets yet!`);

    const lines = entries.map(e => {
      let result = '';
      if (e.status === 'resolved') result = e.outcome === e.side ? ` ${E.BET_YES} WON` : ` ${E.BET_NO} LOST`;
      else if (e.status === 'cancelled') result = ' ↩️ REFUNDED';
      return `**#${e.bet_id}** ${e.title.substring(0, 40)} — **${e.side.toUpperCase()}** for **${e.amount} oops**${result}`;
    });

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#FFB3A0')
        .setTitle(`${E.BET_DICE} ${message.author.username}'s Bets`)
        .setDescription(lines.join('\n'))
    ]});
  },

  async polymarketFetch(message) {
    if (process.env.POLYMARKET_ENABLED !== 'true') {
      return message.reply(`${E.INFO} Polymarket integration is disabled. Set \`POLYMARKET_ENABLED=true\` in your \`.env\` file.`);
    }
    try {
      const response = await axios.get('https://gamma-api.polymarket.com/markets?limit=5&active=true&closed=false', { timeout: 10000 });
      const markets  = response.data;
      if (!markets?.length) return message.reply('No active Polymarket markets found.');

      const embed = new EmbedBuilder()
        .setColor('#B3C8FF')
        .setTitle(`${E.POLYMARKET} Polymarket — Trending Markets`)
        .setDescription('Mirror one as a server bet with `!createbet "Title" "Description"`');

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


  // ── Slash handler ────────────────────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    await interaction.deferReply({ ephemeral: true });

    const fakeMessage = {
      author:  interaction.user,
      member:  interaction.member,
      channel: interaction.channel,
      guild:   interaction.guild,
      mentions: { users: { first: () => interaction.options.getUser('user') || null } },
      reply:   async (data) => interaction.editReply(typeof data === 'string' ? { content: data } : data),
    };
    // Also allow channel.send for public messages
    interaction.channel.send = interaction.channel.send.bind(interaction.channel);

    let args = [];
    if (commandName === 'createbet') {
      const title = interaction.options.getString('title');
      const desc  = interaction.options.getString('description') || '';
      const hours = interaction.options.getInteger('hours') || 24;
      args = [`"${title}"`, `"${desc}"`, String(hours)];
    } else if (commandName === 'bet') {
      args = [String(interaction.options.getInteger('id')), interaction.options.getString('side'), String(interaction.options.getInteger('amount'))];
    } else if (commandName === 'betinfo') {
      args = [String(interaction.options.getInteger('id'))];
    } else if (commandName === 'resolvebet') {
      args = [String(interaction.options.getInteger('id')), interaction.options.getString('outcome')];
    }

    await this.handleCommand(fakeMessage, args, commandName);
  },

  isAdmin(message) {
    const adminRole = process.env.ADMIN_ROLE || 'Admin';
    return message.member && (
      message.member.permissions.has('Administrator') ||
      message.member.roles.cache.some(r => r.name === adminRole)
    );
  }
};
