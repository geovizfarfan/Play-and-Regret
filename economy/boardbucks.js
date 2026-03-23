const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats } = require('../utils/database');
const E = require('../utils/emojis');

const oops = 'oops';
const CURRENCY = 'oops';

// Active drops: channelId → { amount, claimedBy, message, timeout }
const activeDrops = new Map();

// Beg cooldowns: userId → timestamp
const begCooldowns = new Map();
const BEG_COOLDOWN = 60 * 60 * 1000; // 1 hour

const BEG_NOTES = [
  `🧎 They got down on one knee... not to propose, just to beg.`,
  `😭 Tears were shed. The bot took pity.`,
  `🎭 Their performance was so dramatic, the bot paid just to make them stop.`,
  `🐕 They begged harder than a golden retriever at dinner time.`,
  `🎪 The circus called — they said keep the money, they already have enough clowns.`,
  `🍕 They claimed they hadn't eaten in days. The bot smelled pizza on their breath.`,
  `🎵 They sang a sad song. It was terrible. The bot paid them to stop.`,
  `😤 They tried to look pitiful but just looked constipated. Still got paid.`,
  `🦆 They made duck noises until the bot gave up and paid them.`,
  `🌚 The bot felt a disturbance in the force... it was just this person's empty wallet.`,
  `🥺 They used the puppy eyes. It worked. Unfortunately.`,
  `📜 They presented a 47-page essay on why they deserve oops. The bot skimmed page 1.`,
  `🎩 They pulled a sad face out of thin air. The bot applauded and paid up.`,
  `🤡 Their financial situation is so bad, even the bot felt bad. Almost.`,
  `🕯️ They lit a candle and prayed to the oops gods. One answered.`,
  `🤸 They did a backflip. The bot was not impressed but paid anyway.`,
  `🧃 They showed up with a juice box and sad eyes. It worked.`,
  `🐧 They waddled in looking pitiful. Even the penguins felt bad.`,
  `🎻 The world's tiniest violin played. The bot donated out of spite.`,
  `🦴 They rattled their empty wallet like a tiny skeleton.`,
  `🪄 They tried to magically manifest wealth. This is the closest it got.`,
  `😔 The sheer audacity of this person begging again was so impressive, the bot caved.`,
  `🧸 They brought a stuffed animal as emotional support. The bot melted slightly.`,
  `🍜 They claimed to be surviving on instant ramen. The bot judged them and paid.`,
];

const DAILY_MESSAGES = [
  (a) => `🎁 Daily reward claimed. Please spend it irresponsibly.`,
  (a) => `💰 Your daily allowance from the chaos treasury: **${a} oops**`,
  (a) => `👑 The Board Princess treasury reluctantly gives you **${a} oops**.`,
  (a) => `🎲 Daily gambling funds have been issued. Try not to lose them in 10 seconds.`,
  (a) => `💸 The casino has refilled your bad decisions fund. **${a} oops** loaded.`,
  (a) => `🎁 Daily chaos stipend delivered. The treasury is already regretting it.`,
  (a) => `<a:jackpot:1479203793806557385> Congratulations. You are temporarily solvent. **+${a} oops**`,
  (a) => `👑 Royal funding has been approved. Spend it unwisely.`,
  (a) => `💰 Spend this wisely. (You won't.) **+${a} oops**`,
  (a) => `🎲 Today's budget for regret: **${a} oops**`,
  (a) => `💸 Your daily financial mistake starter pack has arrived. **${a} oops** enclosed.`,
  (a) => `🎁 The treasury regrets this decision already. **+${a} oops**`,
  (a) => `<a:jackpot:1479203793806557385> You are now funded to make poor choices. **${a} oops** disbursed.`,
  (a) => `👑 A small donation from the royal chaos fund. **${a} oops** — use it to ruin the economy.`,
  (a) => `💰 Today's allowance for irresponsible gambling. **${a} oops** — go forth.`,
  (a) => `🎲 Go forth and immediately lose this money. **+${a} oops**`,
  (a) => `💸 Daily funding for questionable decisions: **${a} oops**.`,
  (a) => `🎁 The bot reluctantly hands you **${a} oops**. Don't make it weird.`,
  (a) => `<a:jackpot:1479203793806557385> This money will not survive the day. **+${a} oops**`,
  (a) => `👑 Use this to ruin the economy. **${a} oops** from the Board Princess.`,
];

module.exports = {
  name: 'economy',

  async handleCommand(message, args, command) {
    switch (command) {
      case 'balance': case 'bal':             return this.balance(message, args);
      case 'give':                             return this.give(message, args);
      case 'take':                             return this.take(message, args);
      case 'transfer':                         return this.transfer(message, args);
      case 'drop':                             return this.drop(message, args);
      case 'beg':                              return this.beg(message);
      case 'daily':                            return this.daily(message);
      case 'leaderboard': case 'lb': case 'richest': return this.leaderboard(message);
      case 'stats': case 'profile':            return this.profile(message, args);
      case 'setbal':                           return this.setBalance(message, args);
    }
  },

  // ── Balance ──────────────────────────────────────────────────────────────────
  async balance(message, args) {
    const target = message.mentions.users.first() || message.author;
    await economy.getUser(target.id, target.username);
    const bal = await economy.getBalance(target.id);
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#FFE4A0')
        .setTitle(`${E.BB_COIN} ${CURRENCY} Balance`)
        .setThumbnail(target.displayAvatarURL ? target.displayAvatarURL() : null)
        .addFields(
          { name: '👤 Player',          value: target.username,                    inline: true },
          { name: `${E.BB_COIN} Balance`, value: `**${bal.toLocaleString()} ${oops}**`, inline: true },
        )
        .setFooter({ text: 'oops • Bet & Regret Economy' })
    ]});
  },

  // ── Give (admin → anyone, owner → admin, no self-give for admin) ─────────────
  async give(message, args) {
    const isOwner = this.isOwner(message);
    const isAdmin = this.isAdmin(message);

    if (!isAdmin && !isOwner) return message.reply(`${E.ERROR} You need the Admin role to give oops!`);

    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target) return message.reply(`${E.ERROR} Usage: \`!give @user <amount>\``);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Enter a valid positive amount!`);

    // Admin cannot give to themselves — only owner can give to themselves or admins
    const targetIsAdmin = this.isAdminById(message, target.id);
    if (isAdmin && !isOwner && target.id === message.author.id)
      return message.reply(`${E.ERROR} Admins cannot give oops to themselves!`);
    if (isAdmin && !isOwner && targetIsAdmin)
      return message.reply(`${E.ERROR} Admins cannot give oops to other admins! Only the Owner can do that.`);

    await economy.getUser(target.id, target.username);
    await economy.addFunds(target.id, amount, `Grant by ${message.author.username}`);
    const newBal = await economy.getBalance(target.id);

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#B5EAC8')
        .setTitle(`${E.BB_COIN} oops Given!`)
        .setDescription(`${E.ADMIN_CROWN} **${message.author.username}** gave **${amount.toLocaleString()} ${oops}** to **${target.username}**!`)
        .setFooter({ text: `New balance: ${newBal.toLocaleString()} oops` })
    ]});
  },

  // ── Take (admin only) ────────────────────────────────────────────────────────
  async take(message, args) {
    if (!this.isAdmin(message) && !this.isOwner(message))
      return message.reply(`${E.ERROR} You need the Admin role to take oops!`);
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target) return message.reply(`${E.ERROR} Usage: \`!take @user <amount>\``);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Enter a valid positive amount!`);

    await economy.getUser(target.id, target.username);
    const success = await economy.removeFunds(target.id, amount, `Taken by ${message.author.username}`);
    if (!success) return message.reply(`${E.ERROR} ${target.username} doesn't have enough oops!`);
    const newBal = await economy.getBalance(target.id);

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#FFB3B3')
        .setTitle(`${E.BB_COIN} oops Taken!`)
        .setDescription(`${E.ADMIN_CROWN} **${message.author.username}** took **${amount.toLocaleString()} ${oops}** from **${target.username}**!`)
        .setFooter({ text: `New balance: ${newBal.toLocaleString()} oops` })
    ]});
  },

  // ── Transfer (player to player, no self-transfer) ────────────────────────────
  async transfer(message, args) {
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target) return message.reply(`${E.ERROR} Usage: \`!transfer @user <amount>\``);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Enter a valid positive amount!`);
    if (target.id === message.author.id) return message.reply(`${E.ERROR} You can't transfer to yourself!`);
    if (target.bot) return message.reply(`${E.ERROR} You can't transfer to a bot!`);

    await economy.getUser(message.author.id, message.author.username);
    await economy.getUser(target.id, target.username);
    const success = await economy.transfer(message.author.id, target.id, amount, 'Player transfer');
    if (!success) return message.reply(`${E.ERROR} You don't have enough oops!`);

    const senderBal = await economy.getBalance(message.author.id);
    const targetBal = await economy.getBalance(target.id);

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#B3D9FF')
        .setTitle(`${E.TRANSFER || '💸'} oops Transferred!`)
        .setDescription(`**${message.author.username}** sent **${amount.toLocaleString()} ${oops}** to **${target.username}**!`)
        .addFields(
          { name: 'Your balance',           value: `${senderBal.toLocaleString()} oops`, inline: true },
          { name: `${target.username}'s balance`, value: `${targetBal.toLocaleString()} oops`, inline: true },
        )
    ]});
  },

  // ── Drop (admin only — drops oops in channel for anyone to claim) ──────────────
  async drop(message, args) {
    if (!this.isAdmin(message) && !this.isOwner(message))
      return message.reply(`${E.ERROR} Only admins can drop oops!`);
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Usage: \`!drop <amount>\``);

    const channelId = message.channel.id;
    if (activeDrops.has(channelId)) return message.reply(`${E.ERROR} There's already an active drop in this channel!`);

    // Mark drop active immediately
    activeDrops.set(channelId, { amount, claimedBy: null });

    const claimBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('drop_claim').setLabel(`💰 Claim ${amount.toLocaleString()} oops!`).setStyle(ButtonStyle.Success)
    );

    const dropMsg = await message.channel.send({ embeds: [
      new EmbedBuilder().setColor('#FFE4A0')
        .setTitle('💰 oops DROP!')
        .setDescription(`**${message.author.username}** dropped **${amount.toLocaleString()} ${oops}**!\n\nFirst to press the button claims it all! 🏃`)
        .setFooter({ text: 'Drop expires in 5 minutes' })
    ], components: [claimBtn] });

    // Timeout: expire after 5 minutes
    const expireTimeout = setTimeout(async () => {
      const drop = activeDrops.get(channelId);
      if (drop && !drop.claimedBy) {
        activeDrops.delete(channelId);
        dropMsg.edit({ embeds: [
          new EmbedBuilder().setColor('#D8D8D8')
            .setTitle('💨 Drop Expired')
            .setDescription(`Nobody claimed the **${amount.toLocaleString()} ${oops}** drop in time. It vanished into thin air!`)
        ], components: [] }).catch(() => {});
      }
    }, 5 * 60 * 1000);

    const collector = dropMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });
    collector.on('collect', async inter => {
      if (inter.customId !== 'drop_claim') return;
      const drop = activeDrops.get(channelId);
      if (!drop || drop.claimedBy) {
        return inter.reply({ content: '❌ This drop was already claimed!', ephemeral: true });
      }
      // Can't claim your own drop
      if (inter.user.id === message.author.id) {
        return inter.reply({ content: `${E.ERROR} You can't claim your own drop!`, ephemeral: true });
      }

      drop.claimedBy = inter.user.id;
      activeDrops.delete(channelId);
      clearTimeout(expireTimeout);
      collector.stop('claimed');

      await economy.getUser(inter.user.id, inter.user.username);
      await economy.addFunds(inter.user.id, amount, `Drop claimed from ${message.author.username}`);
      const newBal = await economy.getBalance(inter.user.id);

      await inter.update({ embeds: [
        new EmbedBuilder().setColor('#B5EAC8')
          .setTitle('🎉 Drop Claimed!')
          .setDescription(`**${inter.user.username}** was first and snatched **${amount.toLocaleString()} ${oops}**!`)
          .setFooter({ text: `New balance: ${newBal.toLocaleString()} oops` })
      ], components: [] });
    });
  },

  // ── Beg (member command — random oops, 1hr cooldown) ───────────────────────
  async beg(message) {
    const userId = message.author.id;
    const now    = Date.now();
    const last   = begCooldowns.get(userId) || 0;
    const remaining = BEG_COOLDOWN - (now - last);

    if (remaining > 0) {
      return message.reply({ content: `${E.ERROR} No.` }).then(m => {
        setTimeout(() => m.delete().catch(() => {}), 5000);
      });
    }

    await economy.getUser(userId, message.author.username);

    const roll   = Math.random();
    const amount = roll < 0.6  ? Math.floor(Math.random() * 20) + 1
                 : roll < 0.85 ? Math.floor(Math.random() * 50) + 21
                 : roll < 0.97 ? Math.floor(Math.random() * 80) + 71
                 : 0;

    begCooldowns.set(userId, now);

    const note = BEG_NOTES[Math.floor(Math.random() * BEG_NOTES.length)];

    if (amount === 0) {
      return message.channel.send(
        `<a:beg:1479250632610418850> **Someone is Begging** <a:beg:1479250632610418850>\n` +
        `<@${userId}> has no dignity\n` +
        `${note}\n` +
        `The bot stared at them and felt **nothing**. **0 ${oops}**.`
      );
    }

    await economy.addFunds(userId, amount, 'Beg reward');

    return message.channel.send(
      `<a:beg:1479250632610418850> **Someone is Begging** <a:beg:1479250632610418850>\n` +
      `<@${userId}> has no dignity\n` +
      `${note}\n` +
      `The bot throws **${amount.toLocaleString()} ${oops}** at them.`
    );
  },

  // ── Daily ────────────────────────────────────────────────────────────────────
  async daily(message) {
    await economy.getUser(message.author.id, message.author.username);
    const result = await economy.claimDaily(message.author.id);
    if (!result.success && result.reason === 'cooldown') {
      return message.reply(`${E.CLOCK} You already claimed your daily! Come back in **${result.hours}h ${result.minutes}m**.`);
    }
    const msgFn = DAILY_MESSAGES[Math.floor(Math.random() * DAILY_MESSAGES.length)];
    return message.channel.send(`<a:calendar:1479266779837632562> <@${message.author.id}> **Daily oops Claimed!**\n<a:moneybag:1479268556687540345> ${msgFn(result.amount.toLocaleString())}`);
  },

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  async leaderboard(message) {
    const top    = await economy.getLeaderboard(10);
    const medals = [E.MEDAL_1, E.MEDAL_2, E.MEDAL_3];
    const rows   = top.map((u, i) =>
      `${medals[i] || `**${i+1}.**`} <@${u.user_id}> — **${u.balance.toLocaleString()} oops**`
    ).join('\n');
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#FFE4A0')
        .setTitle(`${E.LEADERBOARD || '🏆'} oops Leaderboard`)
        .setDescription(rows || 'No players yet!')
        .setFooter({ text: 'Top 10 richest players' })
    ]});
  },

  // ── Profile ──────────────────────────────────────────────────────────────────
  async profile(message, args) {
    const target = message.mentions.users.first() || message.author;
    await economy.getUser(target.id, target.username);
    const user = await economy.getUser(target.id, target.username);
    const s    = await stats.get(target.id);
    const bal  = await economy.getBalance(target.id);
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#D9B3FF')
        .setTitle(`${E.PROFILE || '👤'} ${target.username}'s Profile`)
        .setThumbnail(target.displayAvatarURL ? target.displayAvatarURL() : null)
        .addFields(
          { name: `${E.BB_COIN} Balance`,       value: `${bal.toLocaleString()} oops`,            inline: true },
          { name: '📈 Total Earned',             value: `${(user.total_earned||0).toLocaleString()} oops`, inline: true },
          { name: '📉 Total Spent',              value: `${(user.total_spent||0).toLocaleString()} oops`,  inline: true },
          { name: `${E.CUARENTA} Cuarenta`,      value: `W: ${s.cuarenta_wins||0} / L: ${s.cuarenta_losses||0}`, inline: true },
          { name: `${E.LOTERIA||'🎴'} Lotería`,  value: `W: ${s.loteria_wins||0} / L: ${s.loteria_losses||0}`,   inline: true },
          { name: `${E.TTT_HEADER||'❌'} Ticky Tacky Bruh`, value: `W: ${s.tictactoe_wins||0} / D: ${s.tictactoe_draws||0} / L: ${s.tictactoe_losses||0}`, inline: true },
          { name: '🔥 Win Streak', value: `Current: **${s.win_streak||0}** | Best: **${s.best_streak||0}**`, inline: true },
        )
    ]});
  },

  // ── Set balance (admin) ──────────────────────────────────────────────────────
  async setBalance(message, args) {
    if (!this.isAdmin(message) && !this.isOwner(message))
      return message.reply(`${E.ERROR} You need the Admin role for this!`);
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target || isNaN(amount) || amount < 0)
      return message.reply(`${E.ERROR} Usage: \`!setbal @user <amount>\``);
    await economy.getUser(target.id, target.username);
    await economy.setFunds(target.id, amount);
    return message.reply(`${E.SUCCESS} Set **${target.username}**'s balance to **${amount.toLocaleString()} oops**!`);
  },

  // ── Slash handler ────────────────────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    const fakeMessage = {
      author:  interaction.user,
      member:  interaction.member,
      channel: interaction.channel,
      guild:   interaction.guild,
      reply:   async (data) => {
        if (interaction.replied || interaction.deferred)
          return interaction.followUp(typeof data === 'string' ? { content: data } : data);
        return interaction.reply(typeof data === 'string' ? { content: data, ephemeral: true } : { ...data, ephemeral: true });
      },
      mentions: { users: { first: () => interaction.options.getUser('user') || null } }
    };

    const user   = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const args   = [];
    if (user)   args.push(`<@${user.id}>`);
    if (amount !== null && amount !== undefined) args.push(String(amount));

    if (commandName === 'drop') {
      // Drop needs direct channel access
      await interaction.deferReply({ ephemeral: true });
      fakeMessage.reply = async (data) => interaction.editReply(typeof data === 'string' ? { content: data } : data);
      // Override channel send to use the actual channel
      await this.handleCommand(fakeMessage, [String(amount)], 'drop');
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    fakeMessage.reply = async (data) => interaction.editReply(typeof data === 'string' ? { content: data } : data);
    await this.handleCommand(fakeMessage, args, commandName);
  },

  // ── Permission helpers ───────────────────────────────────────────────────────
  isOwner(message) {
    const ownerId = process.env.OWNER_ID;
    return ownerId && message.author.id === ownerId;
  },

  isAdmin(message) {
    const adminRole = process.env.ADMIN_ROLE || 'Admin';
    return message.member && (
      message.member.permissions.has('Administrator') ||
      message.member.roles.cache.some(r => r.name === adminRole)
    );
  },

  isAdminById(message, userId) {
    if (!message.guild) return false;
    const adminRole = process.env.ADMIN_ROLE || 'Admin';
    const member = message.guild.members.cache.get(userId);
    return member && (
      member.permissions.has('Administrator') ||
      member.roles.cache.some(r => r.name === adminRole)
    );
  }
};
