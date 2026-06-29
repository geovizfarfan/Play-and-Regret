const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats, db } = require('../utils/database');
const E = require('../utils/emojis');

const sins = 'sins';
const CURRENCY = 'sins';

// Active drops: channelId → { amount, claimedBy, message, timeout }
const activeDrops = new Map();

// Beg cooldowns: userId → timestamp
const begCooldowns = new Map();
const BEG_COOLDOWN = 60 * 60 * 1000; // 1 hour

// ─── BEG MESSAGE POOLS ───────────────────────────────────────────────────────
// 4 outcomes: paid, ignored, backfire, jackpot pity
// Each pool: (amount, regain) => string

const BEG_PAID = [
  (a, r) => `they showed up. they begged. they got paid. barely. **+${a} sins** 😐`,
  (a, r) => `the audacity was loud enough to work. **+${a} sins** 💸`,
  (a, r) => `someone felt bad for you. don't make it weird. **+${a} sins**`,
  (a, r) => `you begged with zero shame and it actually worked. **+${a} sins** 🤡`,
  (a, r) => `the bot sighed and threw **${a} sins** at you just to make you stop.`,
  (a, r) => `you looked pathetic enough. congratulations. **+${a} sins** 😬`,
  (a, r) => `you got **${a} sins**. it won't last. nothing does.`,
  (a, r) => `they paid you to go away. **+${a} sins** <a:pray:1495665631775817778>`,
  (a, r) => `technically successful. spiritually humiliating. **+${a} sins**`,
  (a, r) => `the universe felt bad for you today. **+${a} sins** 🎲 don't get used to it.`,
  (a, r) => `you asked nicely enough. unfortunately. **+${a} sins** 😈`,
  (a, r) => `this is what rock bottom looks like. **+${a} sins** 💸`,
  (a, r) => `you begged and you received. both are embarrassing. **+${a} sins**`,
  (a, r) => `someone threw sins at you to stop you from talking. **+${a} sins** 🤐`,
  (a, r) => `the sheer persistence paid off. barely. **+${a} sins** 😐`,
  (a, r) => `you came here specifically to beg. and it worked. sit with that. **+${a} sins**`,
  (a, r) => `**${a} sins** acquired. dignity not included. <a:pray:1495665631775817778>`,
  (a, r) => `the bot didn't want to. but here we are. **+${a} sins**`,
  (a, r) => `you beg like it's a lifestyle. because it is. **+${a} sins** 🤡`,
  (a, r) => `someone took pity. don't thank them. just take the **${a} sins** and leave.`,
  (a, r) => `you held out your hand and someone actually put **${a} sins** in it. wild.`,
  (a, r) => `the bar was low. you cleared it. **+${a} sins** 😬`,
  (a, r) => `you begged so hard the system physically couldn't say no. **+${a} sins**`,
  (a, r) => `this pays **${a} sins**. therapy pays more. just saying. <a:pray:1495665631775817778>`,
  (a, r) => `fine. **+${a} sins**. we're not proud of either of us right now.`,
  (a, r) => `you got paid for nothing. capitalism is alive and well. **+${a} sins** 💸`,
  (a, r) => `**${a} sins** for the performance. it wasn't good but it was committed. 🎭`,
  (a, r) => `you're really out here begging huh. **+${a} sins**. this is your life now.`,
  (a, r) => `you asked. it worked. don't analyze it. **+${a} sins** 🎲`,
  (a, r) => `someone handed you **${a} sins** just to get you to stop making that face.`,
];

const BEG_IGNORED = [
  (a, r) => `nobody came. <a:pray:1495665631775817778> **+0 sins** +${r} regret for trying.`,
  (a, r) => `the bot looked at you. then looked away. **+0 sins** 😐 +${r} regret.`,
  (a, r) => `you begged into the void. the void said no. **+0 sins** +${r} regret <a:pray:1495665631775817778>`,
  (a, r) => `your begging was reviewed and rejected. **+0 sins** +${r} regret 🤡`,
  (a, r) => `everyone walked past you. nobody stopped. **+0 sins** +${r} regret.`,
  (a, r) => `you held out your hand. it stayed empty. **+0 sins** +${r} regret 😬`,
  (a, r) => `the economy has spoken. it said no. **+0 sins** +${r} regret <a:pray:1495665631775817778>`,
  (a, r) => `you tried. nobody cared. **+0 sins** +${r} regret. moving on.`,
  (a, r) => `the bot pretended not to see you. **+0 sins** +${r} regret 😈`,
  (a, r) => `your application for sins has been denied. **+0 sins** +${r} regret 📋`,
  (a, r) => `they saw you. they kept scrolling. **+0 sins** +${r} regret <a:pray:1495665631775817778>`,
  (a, r) => `you begged loudly and got nothing loudly back. **+0 sins** +${r} regret.`,
  (a, r) => `the universe is not interested in your problems today. **+0 sins** +${r} regret 😐`,
  (a, r) => `you went unnoticed. which is somehow worse. **+0 sins** +${r} regret 😬`,
  (a, r) => `rejected without comment. **+0 sins** +${r} regret <a:pray:1495665631775817778> standard.`,
  (a, r) => `the answer was no before you even finished asking. **+0 sins** +${r} regret.`,
  (a, r) => `not today. not ever probably. **+0 sins** +${r} regret 🤡`,
  (a, r) => `you begged and received only silence and regret. **+0 sins** +${r} regret <a:pray:1495665631775817778>`,
  (a, r) => `the crowd dispersed. nobody helped. shocking. **+0 sins** +${r} regret.`,
  (a, r) => `your energy was read. then dismissed. **+0 sins** +${r} regret 😈`,
];

const BEG_BACKFIRE = [
  (a, r) => `you begged so badly someone took **${a} sins** from you instead. 😈 +${r} regret.`,
  (a, r) => `the bot was so offended it charged you. **-${a} sins** <a:pray:1495665631775817778> +${r} regret.`,
  (a, r) => `you dropped your wallet while begging. **-${a} sins** 😬 +${r} regret.`,
  (a, r) => `someone pickpocketed you mid-beg. **-${a} sins** 🩸 +${r} regret.`,
  (a, r) => `your begging inspired someone to take from you instead. **-${a} sins** 😈 +${r} regret.`,
  (a, r) => `the system invoiced you for wasting everyone's time. **-${a} sins** <a:pray:1495665631775817778> +${r} regret.`,
  (a, r) => `you begged so loud you attracted the wrong attention. **-${a} sins** 🩸 +${r} regret.`,
  (a, r) => `your performance was so bad they charged you. **-${a} sins** 🤡 +${r} regret.`,
  (a, r) => `the karma tax hit. **-${a} sins** <a:pray:1495665631775817778> +${r} regret. maybe don't beg.`,
  (a, r) => `you reached out and came back with less. **-${a} sins** 😐 +${r} regret.`,
  (a, r) => `backfired spectacularly. **-${a} sins** 🩸 +${r} regret. incredible.`,
  (a, r) => `you tried to gain and lost instead. **-${a} sins** <a:pray:1495665631775817778> +${r} regret. classic.`,
  (a, r) => `the audacity fee was applied. **-${a} sins** 😈 +${r} regret.`,
  (a, r) => `you begged from the wrong person. **-${a} sins** 🩸 +${r} regret.`,
  (a, r) => `the universe corrected you. **-${a} sins** <a:pray:1495665631775817778> +${r} regret. noted.`,
];

const BEG_JACKPOT = [
  (a, r) => `someone felt DEEPLY bad for you. **+${a} sins** 💸 but also **+${r} regret**. mixed feelings.`,
  (a, r) => `pity jackpot unlocked. **+${a} sins** 🎰 **+${r} regret**. they feel weird about it.`,
  (a, r) => `the big pity hit. **+${a} sins** 😬 **+${r} regret**. don't make eye contact.`,
  (a, r) => `you looked so pathetic someone gave you **${a} sins**. **+${r} regret** for the image. <a:pray:1495665631775817778>`,
  (a, r) => `rare pity event triggered. **+${a} sins** 🎲 **+${r} regret**. you won but you lost.`,
  (a, r) => `someone had a moment of weakness. you got **${a} sins** out of it. **+${r} regret** 😈`,
  (a, r) => `big bag. big shame. **+${a} sins** 💸 **+${r} regret**. was it worth it? probably.`,
  (a, r) => `the pity was astronomical today. **+${a} sins** 🩸 **+${r} regret**. go reflect.`,
];

const DAILY_MESSAGES = [
  (a) => `🎁 Daily reward claimed. Please spend it irresponsibly.`,
  (a) => `<:Sins:1478993005187698789> Your daily allowance from the chaos treasury: **${a} sins**`,
  (a) => `<a:MVP24:1495665626688131183> The Board Princess treasury reluctantly gives you **${a} sins**.`,
  (a) => `🎲 Daily gambling funds have been issued. Try not to lose them in 10 seconds.`,
  (a) => `💸 The casino has refilled your bad decisions fund. **${a} sins** loaded.`,
  (a) => `🎁 Daily chaos stipend delivered. The treasury is already regretting it.`,
  (a) => `<a:jackpot:1479203793806557385> Congratulations. You are temporarily solvent. **+${a} sins**`,
  (a) => `<a:MVP24:1495665626688131183> Royal funding has been approved. Spend it unwisely.`,
  (a) => `<:Sins:1478993005187698789> Spend this wisely. (You won't.) **+${a} sins**`,
  (a) => `🎲 Today's budget for regret: **${a} sins**`,
  (a) => `💸 Your daily financial mistake starter pack has arrived. **${a} sins** enclosed.`,
  (a) => `🎁 The treasury regrets this decision already. **+${a} sins**`,
  (a) => `<a:jackpot:1479203793806557385> You are now funded to make poor choices. **${a} sins** disbursed.`,
  (a) => `<a:MVP24:1495665626688131183> A small donation from the royal chaos fund. **${a} sins** — use it to ruin the economy.`,
  (a) => `<:Sins:1478993005187698789> Today's allowance for irresponsible gambling. **${a} sins** — go forth.`,
  (a) => `🎲 Go forth and immediately lose this money. **+${a} sins**`,
  (a) => `💸 Daily funding for questionable decisions: **${a} sins**.`,
  (a) => `🎁 The bot reluctantly hands you **${a} sins**. Don't make it weird.`,
  (a) => `<a:jackpot:1479203793806557385> This money will not survive the day. **+${a} sins**`,
  (a) => `<a:MVP24:1495665626688131183> Use this to ruin the economy. **${a} sins** from the Board Princess.`,
];

module.exports = {
  name: 'economy',

  async handleCommand(message, args, command) {
    switch (command) {
      case 'balance': case 'bal': case 'sins':             return this.balance(message, args);
      case 'give':                             return this.give(message, args);
      case 'taxcalc':                          return this.taxcalc(message, args);
      case 'history':                           return this.history(message, args);
      case 'guide': case 'faq': case 'help':   return this.guide(message);
      case 'take':                             return this.take(message, args);
      case 'transfer':                         return this.transfer(message, args);
      case 'drop':                             return this.drop(message, args);
      case 'beg':                              return this.beg(message);
      case 'daily':                            return this.daily(message);
      case 'leaderboard': case 'lb': case 'richest': return this.leaderboard(message);
      case 'stats': case 'profile':            return this.profile(message, args);
      case 'grantsins':                        return this.grantSins(message, args);
    }
  },

  // ── Balance ──────────────────────────────────────────────────────────────────
  async balance(message, args) {
    // Balance is public
    const target = message.mentions?.users?.first() || message.author;
    await economy.getUser(target.id, target.username);
    const bal    = await economy.getBalance(target.id);
    const user   = await economy.getUser(target.id, target.username);
    const regret = user?.regret || 0;
    const avatar = typeof target.displayAvatarURL === 'function' ? target.displayAvatarURL() : null;
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<:Sins:1478993005187698789> Sins Balance')
        .setThumbnail(avatar)
        .addFields(
          { name: '<:member:1495666085121491024> Player', value: target.username,                 inline: true },
          { name: '<:Sins:1478993005187698789> Sins',     value: `**${bal.toLocaleString()}**`,   inline: true },
          { name: '<a:hmmdevil:1495665623219306647> Regret', value: `**${regret.toLocaleString()}**`, inline: true },
        )
    ]});
  },

  // ── Give (anyone → anyone, 10% jackpot tax, confirm/cancel) ─────────────────
  async give(message, args) {
    const target = message.mentions?.users?.first() || null;
    const amount = parseInt(args[1]);
    if (!target) return message.reply(`${E.ERROR} Usage: \`!give @user <amount>\``);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Enter a valid positive amount!`);
    if (target.id === message.author.id) return message.reply(`${E.ERROR} You cannot give sins to yourself!`);

    const senderBal = await economy.getBalance(message.author.id);
    if (senderBal < amount) return message.reply(`${E.ERROR} You only have **${senderBal.toLocaleString()} sins**!`);

    const tax      = Math.min(10000, Math.max(1, Math.floor(amount * 0.10)));
    const received = amount - tax;

    // Show preview with confirm/cancel
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`give_confirm:${message.author.id}:${target.id}:${amount}`).setLabel('Confirm').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`give_cancel:${message.author.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
    );

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<:Sins:1478993005187698789> Confirm Transfer')
        .setDescription(
          `<a:moneybag:1479268556687540345> **You\'re sending:** ${amount.toLocaleString()} sins\n` +
          `<:wrong:1495666083594502174> **Tax (10%):** ${tax.toLocaleString()} sins\n` +
          `<:checkmark:1495666088417956002> **${target.username} receives:** ${received.toLocaleString()} sins`
        )
    ], components: [confirmRow] });
  },

  async executeGive(senderId, targetId, amount, replyFn, client) {
    const target = await client.users.fetch(targetId).catch(() => null);
    if (!target) return replyFn(`${E.ERROR} User not found.`);
    const senderBal = await economy.getBalance(senderId);
    if (senderBal < amount) return replyFn(`${E.ERROR} You no longer have enough sins!`);
    const tax      = Math.min(10000, Math.max(1, Math.floor(amount * 0.10)));
    const received = amount - tax;
    await economy.removeFunds(senderId, amount, `Give to ${target.username}`);
    await economy.getUser(targetId, target.username);
    await economy.addFunds(targetId, received, `Gift from sender`);
    const jackpot = require('../utils/jackpot');
    await jackpot.addToDrawFund(tax).catch(() => {});
    return replyFn({ embeds: [
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<:Sins:1478993005187698789> Sins Given!')
        .setDescription(
          `Sent **${received.toLocaleString()} sins** to **${target.username}**!\n` +
          `<a:moneybag:1479268556687540345> **${tax.toLocaleString()} sins** (10%) went to the jackpot.`
        )
    ]});
  },

  // ── Take (admin only) ────────────────────────────────────────────────────────
  async take(message, args) {
    if (!this.isAdmin(message) && !this.isOwner(message))
      return message.reply(`${E.ERROR} You need the Admin role to take sins!`);
    const target = message.mentions?.users?.first() || null;
    const amount = parseInt(args[1]);
    if (!target) return message.reply(`${E.ERROR} Usage: \`!take @user <amount>\``);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Enter a valid positive amount!`);

    await economy.getUser(target.id, target.username);
    const success = await economy.removeFunds(target.id, amount, `Taken by ${message.author.username}`);
    if (!success) return message.reply(`${E.ERROR} ${target.username} doesn't have enough sins!`);
    const newBal = await economy.getBalance(target.id);

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#FFB3B3')
        .setTitle(`${E.BB_COIN} sins Taken!`)
        .setDescription(`${E.ADMIN_CROWN} **${message.author.username}** took **${amount.toLocaleString()} sins** from **${target.username}**!`)
        .setFooter({ text: `New balance: ${newBal.toLocaleString()} sins` })
    ]});
  },

  // ── Transfer (player to player, no self-transfer) ────────────────────────────
  async transfer(message, args) {
    const target = message.mentions?.users?.first() || null;
    const amount = parseInt(args[1]);
    if (!target) return message.reply(`${E.ERROR} Usage: \`!transfer @user <amount>\``);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Enter a valid positive amount!`);
    if (target.id === message.author.id) return message.reply(`${E.ERROR} You can't transfer to yourself!`);
    if (target.bot) return message.reply(`${E.ERROR} You can't transfer to a bot!`);

    await economy.getUser(message.author.id, message.author.username);
    await economy.getUser(target.id, target.username);
    const success = await economy.transfer(message.author.id, target.id, amount, 'Player transfer');
    if (!success) return message.reply(`${E.ERROR} You don't have enough sins!`);

    const senderBal = await economy.getBalance(message.author.id);
    const targetBal = await economy.getBalance(target.id);

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#B3D9FF')
        .setTitle(`${E.TRANSFER || '💸'} sins Transferred!`)
        .setDescription(`**${message.author.username}** sent **${amount.toLocaleString()} sins** to **${target.username}**!`)
        .addFields(
          { name: 'Your balance',           value: `${senderBal.toLocaleString()} sins`, inline: true },
          { name: `${target.username}'s balance`, value: `${targetBal.toLocaleString()} sins`, inline: true },
        )
    ]});
  },

  // ── Drop (admin only — drops sins in channel for anyone to claim) ──────────────
  async drop(message, args) {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return message.reply(`${E.ERROR} Usage: \`!drop <amount>\``);

    const channelId = message.channel.id;
    if (activeDrops.has(channelId)) return message.reply(`${E.ERROR} There's already an active drop in this channel!`);

    // Mark drop active immediately
    activeDrops.set(channelId, { amount, claimedBy: null });

    const claimBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('drop_claim').setEmoji({ id: '1478993005187698789', name: 'Sins', animated: false }).setLabel(`Claim ${amount.toLocaleString()} Sins!`).setStyle(ButtonStyle.Success)
    );

    const dropMsg = await message.channel.send({ embeds: [
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<:Sins:1478993005187698789> sins DROP!')
        .setDescription(`**${message.author.username}** dropped **${amount.toLocaleString()} sins**!\n\nFirst to press the button claims it all! 🏃`)
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
            .setDescription(`Nobody claimed the **${amount.toLocaleString()} sins** drop in time. It vanished into thin air!`)
        ], components: [] }).catch(() => {});
      }
    }, 5 * 60 * 1000);

    const collector = dropMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });
    collector.on('collect', async inter => {
      if (inter.customId !== 'drop_claim') return;
      const drop = activeDrops.get(channelId);
      if (!drop || drop.claimedBy) {
        return inter.reply({ content: '<:wrong:1495666083594502174> This drop was already claimed!', ephemeral: true });
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
        new EmbedBuilder().setColor('#D8B4FE')
          .setTitle('<a:confetti:1495667283870089307> Drop Claimed!')
          .setDescription(`**${inter.user.username}** was first and snatched **${amount.toLocaleString()} sins**!`)
          .setFooter({ text: `New balance: ${newBal.toLocaleString()} sins` })
      ], components: [] });
    });
  },

  // ── Beg (member command — random sins, 1hr cooldown) ───────────────────────
  async beg(message) {
    const userId   = message.author.id;
    const username = message.author.username;
    const now      = Date.now();
    const last     = begCooldowns.get(userId) || 0;
    const remaining = BEG_COOLDOWN - (now - last);

    if (remaining > 0) {
      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      const s = Math.floor((remaining % 60_000) / 1_000);
      const timeStr = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
      return message.reply({
        embeds: [new EmbedBuilder().setColor('#333333')
          .setDescription(`<:wrong:1495666083594502174> you just begged. come back in **${timeStr}**.
the shame is still fresh. <a:pray:1495665631775817778>`)
        ]
      });
    }

    await economy.getUser(userId, username);
    begCooldowns.set(userId, now);

    const roll = Math.random();
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    let color, description, sinDelta = 0, regretDelta = 0;

    if (roll < 0.55) {
      // PAID — 55%
      sinDelta   = Math.floor(10 + Math.random() * 140);
      regretDelta = 0;
      await economy.addFunds(userId, sinDelta, 'Beg reward');
      description = pick(BEG_PAID)(sinDelta, regretDelta);
      color = '#C9B1FF';

    } else if (roll < 0.75) {
      // IGNORED — 20%
      regretDelta = Math.floor(20 + Math.random() * 30);
      await economy.addRegret(userId, regretDelta);
      description = pick(BEG_IGNORED)(0, regretDelta);
      color = '#333333';

    } else if (roll < 0.90) {
      // BACKFIRE — 15%
      const bal  = await economy.getBalance(userId);
      sinDelta   = Math.floor(10 + Math.random() * Math.min(50, bal || 50));
      regretDelta = Math.floor(30 + Math.random() * 50);
      if (sinDelta > 0) await economy.removeFunds(userId, sinDelta, 'Beg backfire');
      await economy.addRegret(userId, regretDelta);
      description = pick(BEG_BACKFIRE)(sinDelta, regretDelta);
      color = '#8B0000';

    } else {
      // JACKPOT PITY — 10%
      sinDelta   = Math.floor(200 + Math.random() * 400);
      regretDelta = Math.floor(150 + Math.random() * 200);
      await economy.addFunds(userId, sinDelta, 'Beg jackpot pity');
      await economy.addRegret(userId, regretDelta);
      description = pick(BEG_JACKPOT)(sinDelta, regretDelta);
      color = '#C9B1FF';
    }

    return message.channel.send({ embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(`<a:purplesparkle:1479210541691175054> ${username} is begging <a:beg:1479250632610418850>`)
        .setDescription(description)
        .setFooter({ text: 'cooldown: 1h • this is embarrassing for everyone' })
    ]});
  },

  // ── Daily ────────────────────────────────────────────────────────────────────
  async daily(message) {
    await economy.getUser(message.author.id, message.author.username);
    const result = await economy.claimDaily(message.author.id);
    if (!result.success && result.reason === 'cooldown') {
      return message.reply(`${E.CLOCK} You already claimed your daily! Come back in **${result.hours}h ${result.minutes}m**.`);
    }
    const msgFn = DAILY_MESSAGES[Math.floor(Math.random() * DAILY_MESSAGES.length)];
    return message.channel.send(`<a:calendar:1479266779837632562> <@${message.author.id}> **Daily sins Claimed!**\n<a:moneybag:1479268556687540345> ${msgFn(result.amount.toLocaleString())}`);
  },

  // ── Tax Calculator ───────────────────────────────────────────────────────────
  async taxcalc(message, args) {
    const want = parseInt(args[0]);
    if (isNaN(want) || want <= 0) return message.reply(`${E.ERROR} Usage: \`!taxcalc <amount you want them to receive>\``);
    // Work backwards: received = sent - tax, tax = min(1000, sent * 0.10)
    // If sent * 0.10 <= 1000: received = sent * 0.90 → sent = received / 0.90
    // If sent * 0.10 > 1000 (sent > 10000): received = sent - 1000 → sent = received + 1000
    let mustSend;
    const rawSend = Math.ceil(want / 0.90);
    if (rawSend * 0.10 <= 10000) {
      mustSend = rawSend;
    } else {
      mustSend = want + 10000;
    }
    const tax      = Math.min(1000, Math.floor(mustSend * 0.10));
    const received = mustSend - tax;
    const dismissRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dismiss_taxcalc').setLabel('Dismiss').setStyle(ButtonStyle.Secondary)
    );
    const reply = await message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<:Sins:1478993005187698789> Tax Calculator')
        .setDescription(
          `*To deliver **${want.toLocaleString()} Sins** after tax:*\n\n` +
          `<a:moneybag:1479268556687540345> **You need to send:** ${mustSend.toLocaleString()} Sins\n` +
          `<:wrong:1495666083594502174> **Tax (10%):** ${tax.toLocaleString()} Sins\n` +
          `<:checkmark:1495666088417956002> **They receive:** ${received.toLocaleString()} Sins`
        )
        .setFooter({ text: 'Tax is capped at 10,000 Sins max.' })
    ], components: [dismissRow] });
    const collector = reply.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async i => {
      if (i.customId === 'dismiss_taxcalc') {
        await reply.delete().catch(() => {});
        await i.deferUpdate().catch(() => {});
      }
    });
  },

  // ── Server Guide / FAQ ───────────────────────────────────────────────────────
  async guide(message) {
    const embeds = [
      // Overview
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<a:purplesparkle:1479210541691175054> Play & Regret — Server Guide')
        .setDescription('Everything you need to know about Sins, games, and how the bot works.')
        .addFields(
          { name: '<:Sins:1478993005187698789> Sins', value: 'The server currency. Earn them, spend them, give them, lose them.', inline: true },
          { name: '<:purp_caveira50:1495665632845369354> Regret', value: 'A score that rises when you do questionable things. High Regret = high risk.', inline: true },
          { name: '<a:jackpot:1479203793806557385> Jackpot', value: 'A weekly pot that grows from taxes and game draws. Closest number wins everything.', inline: true },
        ),

      // Economy
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<:Sins:1478993005187698789> Economy Commands')
        .addFields(
          { name: '`!daily`', value: 'Claim your daily Sins. Streak builds for bigger rewards. No Regret added.', inline: false },
          { name: '`!beg`', value: 'Hourly beg. You might earn Sins, lose Sins, or gain Regret. A gamble.', inline: false },
          { name: '`!balance`', value: 'See your Sins and Regret publicly. Use `!balance @user` to check someone else.', inline: false },
          { name: '`!profile`', value: 'Your private stats — total earned, spent, game history. Only you see this.', inline: false },
          { name: '`!history`', value: 'Last 20 transactions with amounts, reasons and timestamps.', inline: false },
          { name: '`!give @user 500`', value: 'Send Sins to someone. 10% tax (capped at 10,000) goes to the jackpot. Shows a confirm/cancel preview.', inline: false },
          { name: '`!taxcalc 900`', value: 'Reverse tax calculator — "I want them to receive 900, how much do I send?" Dismissable.', inline: false },
          { name: '`!drop`', value: 'Staff drops Sins in the channel — first to click claims them. Tax free.', inline: false },
        ),

      // Games
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<a:MVP24:1495665626688131183> Games')
        .addFields(
          { name: 'Blackjack', value: 'Classic card game vs the dealer. Bet Sins, try to hit 21 without busting.', inline: true },
          { name: 'Lotería', value: 'Mexican bingo. First to complete their board wins the pot.', inline: true },
          { name: 'Cuarenta', value: 'Ecuadorian card game. Reach 40 points first to win.', inline: true },
          { name: 'Find the Cuy', value: 'Guess which cup hides the guinea pig. Three tries, Sins on the line.', inline: true },
          { name: 'Memory', value: 'Match all pairs before time runs out. Win Sins based on speed.', inline: true },
          { name: 'Tic-Tac-Bruh', value: 'Tic-tac-toe with Sins on the line. Vs another member or the bot.', inline: true },
        )
        .setFooter({ text: 'Game wins feed a portion of Sins into the jackpot draw fund automatically.' }),

      // Events
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<:sword:1495666991187361943> Server Events')
        .addFields(
          { name: 'Rumble Slaughter', value: 'Battle royale where players fight in rounds until one champion remains. Earn XP and level up your emoji. Bounties, avenge kills, and chaos events make each game different.', inline: false },
          { name: 'Regret Games', value: '7-day survival story. Enter with a fee, survive events, vote out others. The story unfolds automatically — players kill each other, alliances form and break. Winner takes the pot. Dead players can still vote.', inline: false },
          { name: 'Regret Games Shop (`/rg buy`)', value: '**Crown Shield** (500) — blocks one event kill\n**Queens Insurance** (1200) — survive one elimination\n**Last Laugh** (800) — deal 200 Regret to a survivor when you die\n**Fake Apology** (250) — instant -100 Regret\n**Snake Pass** (400) — betray without Regret penalty\n**Rotten Favor** (300) — 50% Regret reduction on next event hit\n**Hunger Crumb** (150) — survive the hunger event\n**Public Humiliation Pass** (600) — pick a target and roast them publicly', inline: false },
        ),

      // Jackpot
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<a:jackpot:1479203793806557385> Jackpot')
        .setDescription('A weekly lottery where the closest number wins the entire pot.')
        .addFields(
          { name: 'How to enter', value: 'Click the **Enter Jackpot!** button when a pot is live. Pay 100 Sins and pick a number 1–100.', inline: false },
          { name: 'How to win', value: 'At the end of the week a random number is drawn. The player whose number is closest wins everything. Ties are broken randomly.', inline: false },
          { name: 'What feeds the pot', value: '<:checkmark:1495666088417956002> 10% tax on every `!give` (capped at 10,000 Sins)\n<:checkmark:1495666088417956002> A portion of every game result\n<:checkmark:1495666088417956002> 100 Sins entry fee per player\n<:checkmark:1495666088417956002> Rollover from previous pots', inline: false },
        )
        .setFooter({ text: 'The draw fund builds up even when no jackpot is running.' }),

      // FAQ
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle('<:pd_zPurple_Pin:1495665628672037046> FAQ')
        .addFields(
          { name: 'Why did I receive less Sins from a give?', value: 'A 10% tax is deducted before you receive Sins. Use `!taxcalc 900` to calculate exactly how much the sender needs to send.', inline: false },
          { name: 'What is Regret and does it do anything?', value: 'Regret goes up when you do risky things. In Regret Games, high Regret players die first. Use `/cleanse` to try to reduce it.', inline: false },
          { name: 'Where did my Sins go?', value: 'Use `!history` to see every transaction with amounts, reasons and timestamps.', inline: false },
          { name: 'Can I give Sins to anyone?', value: 'Yes — any member can use `!give @user amount`. You cannot give to yourself and cannot send more than you have.', inline: false },
          { name: 'What happens to my Regret Games fee when I die?', value: 'Your fee stays in the pot and goes to the winner. You can still vote on eliminations after death.', inline: false },
        ),
    ];
    return message.channel.send({ embeds });
  },

  // ── Transaction History ──────────────────────────────────────────────────────
  async history(message, args) {
    const isAdmin = this.isAdmin(message);
    const target  = (isAdmin && message.mentions?.users?.first()) || message.author;
    const rows    = await db.all(
      'SELECT amount, reason, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [target.id]
    );
    if (!rows.length) return message.reply('<:wrong:1495666083594502174> No transactions found.');
    const lines = rows.map(r => {
      const sign = r.amount >= 0 ? '+' : '';
      const time = new Date(r.created_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      return `\`${sign}${r.amount}\` — ${r.reason || 'no reason'} *(${time})*`;
    });
    const bal = await economy.getBalance(target.id);
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle(`<:member:1495666085121491024> ${target.username}'s Last 20 Transactions`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Current balance: ${bal.toLocaleString()} Sins` })
    ]});
  },

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  async leaderboard(message) {
    const top    = await economy.getLeaderboard(10);
    const medals = [E.MEDAL_1, E.MEDAL_2, E.MEDAL_3];
    const rows   = top.map((u, i) =>
      `${medals[i] || `**${i+1}.**`} <@${u.user_id}> — **${u.balance.toLocaleString()} sins**`
    ).join('\n');
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#D8B4FE')
        .setTitle(`${E.LEADERBOARD || '<a:1stplace:1487504691880263791>'} sins Leaderboard`)
        .setDescription(rows || 'No players yet!')
        .setFooter({ text: 'Top 10 richest players' })
    ]});
  },

  // ── Profile ──────────────────────────────────────────────────────────────────
  async profile(message, args) {
    const target = message.mentions.users.first() || message.author;
    await economy.getUser(target.id, target.username);
    const user   = await economy.getUser(target.id, target.username);
    const s      = await stats.get(target.id);
    const bal    = await economy.getBalance(target.id);
    const regret = await economy.getRegret(target.id);

    // RS profile
    const { db } = require('../utils/database');
    const rsPlayer = await db.get('SELECT * FROM rs_players WHERE user_id = ?', [target.id]).catch(() => null);

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle(`<:member:1495666085121491024> ${target.username}'s Profile`)
        .setThumbnail(target.displayAvatarURL ? target.displayAvatarURL() : null)
        .addFields(
          { name: '<:Sins:1478993005187698789> Balance',    value: `${bal.toLocaleString()} sins`,                    inline: true },
          { name: '<:purp_caveira50:1495665632845369354> Regret', value: `${regret.toLocaleString()}`,               inline: true },
          { name: '<a:purplefire:1479219348353716415> Daily Streak', value: `${user.daily_streak||0} day${(user.daily_streak||0) !== 1 ? 's' : ''}`, inline: true },
          { name: '​', value: '​', inline: false },
          { name: '📈 Total Earned',  value: `${(user.total_earned||0).toLocaleString()} sins`, inline: true },
          { name: '📉 Total Spent',   value: `${(user.total_spent||0).toLocaleString()} sins`,  inline: true },
          { name: '​', value: '​', inline: true },
          { name: '​', value: '​', inline: false },
          { name: `${E.CUARENTA||'🎴'} Cuarenta`,       value: `W: ${s.cuarenta_wins||0} / L: ${s.cuarenta_losses||0}`,                                    inline: true },
          { name: `🎴 Lotería`,                          value: `W: ${s.loteria_wins||0} / L: ${s.loteria_losses||0}`,                                      inline: true },
          { name: `✖️ Tic-Tac-Bruh`,                    value: `W: ${s.tictactoe_wins||0} / D: ${s.tictactoe_draws||0} / L: ${s.tictactoe_losses||0}`,     inline: true },
          { name: `<a:cards:1511530261551124561> Blackjack`,                        value: `W: ${s.blackjack_wins||0} / L: ${s.blackjack_losses||0}`,                                  inline: true },
          { name: `🐹 Find the Cuy`,                     value: `W: ${s.cuy_wins||0} / L: ${s.cuy_losses||0}`,                                              inline: true },
          { name: `<a:brain:1511530555588612126> Memory`,                           value: `W: ${s.memory_wins||0} / L: ${s.memory_losses||0}`,                                        inline: true },
          { name: '​', value: '​', inline: false },
          { name: `<a:MVP24:1495665626688131183> Rumble Slaughter`, value: rsPlayer
            ? `W: ${rsPlayer.wins||0} / L: ${rsPlayer.losses||0} | Level **${rsPlayer.level||1}** | XP **${rsPlayer.xp||0}**`
            : 'No RS games played yet.', inline: false },
        )
        .setFooter({ text: 'use /cleanse to reduce regret • /daily for your streak' })
    ]});
  },

  // ── Set balance (admin) ──────────────────────────────────────────────────────
  async grantSins(message, args) {
    if (!this.isOwner(message))
      return message.reply(`${E.ERROR} Only the server owner can grant sins!`);
    const target = message.mentions?.users?.first() || null;
    const amount = parseInt(args[1]);
    if (!target || isNaN(amount) || amount <= 0)
      return message.reply(`${E.ERROR} Usage: \`!grantsins @user <amount>\``);
    await economy.getUser(target.id, target.username);
    await economy.addFunds(target.id, amount, `Granted by owner`);
    return message.reply(`${E.SUCCESS} Granted **${amount.toLocaleString()} sins** to **${target.username}**! (minted — no balance was deducted)`);
  },

  // ── Slash handler ────────────────────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    try {
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

    const isPublicCmd = ['leaderboard','give','take','grantsins','balance','sins','bal'].includes(commandName); // profile is private
    await interaction.deferReply({ ephemeral: !isPublicCmd });
    fakeMessage.reply = async (data) => interaction.editReply(typeof data === 'string' ? { content: data } : data);
    await this.handleCommand(fakeMessage, args, commandName);
    } catch (err) {
      console.error(`[handleSlash:${commandName}] error:`, err);
      try {
        const msg = `<:wrong:1495666083594502174> Something went wrong: ${err.message}`;
        if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
        else await interaction.reply({ content: msg, ephemeral: true });
      } catch(_) {}
    }
  },

  // ── Permission helpers ───────────────────────────────────────────────────────
  isOwner(message) {
    const ownerId = process.env.OWNER_ID;
    return ownerId && message.author.id === ownerId;
  },

  isAdmin(message) {
    const staffRoles = [
      process.env.ADMIN_ROLE || 'Admin',
      process.env.STAFF_ROLE || 'Staff',
      'Mod', 'Moderator', 'Event Host',
    ];
    return message.member && (
      message.member.permissions.has('Administrator') ||
      message.member.roles.cache.some(r => staffRoles.includes(r.name))
    );
  },

  isAdminById(message, userId) {
    if (!message.guild) return false;
    const staffRoles = [
      process.env.ADMIN_ROLE || 'Admin',
      process.env.STAFF_ROLE || 'Staff',
      'Mod', 'Moderator', 'Event Host',
    ];
    const member = message.guild.members.cache.get(userId);
    return member && (
      member.permissions.has('Administrator') ||
      member.roles.cache.some(r => staffRoles.includes(r.name))
    );
  }
};
