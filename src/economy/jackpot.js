const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { economy } = require('../utils/database');
const jackpot = require('../utils/jackpot');
const E = require('../utils/emojis');

const CURRENCY = 'sins';
const POT_NAME = 'Jackpot';

// Live display: channelId → { sessionId, messageId }
const liveChannels = new Map();
// Per-session draw timers: sessionId → timeout
const drawTimers   = new Map();

// ── Streak bonuses ─────────────────────────────────────────────────────────
const STREAK_BONUSES = [
  { min: 2,  bonus: 50,   label: '<a:purplefire:1479219348353716415> 2-Win Streak Bonus!'     },
  { min: 3,  bonus: 100,  label: '<a:purplefire:1479219348353716415><a:purplefire:1479219348353716415> 3-Win Streak Bonus!'   },
  { min: 5,  bonus: 250,  label: '⚡ 5-Win Streak Bonus!'     },
  { min: 10, bonus: 600,  label: '💎 10-Win Streak Bonus!'    },
  { min: 20, bonus: 1500, label: '👑 LEGENDARY STREAK Bonus!' },
];

function getStreakBonus(streak) {
  let best = null;
  for (const tier of STREAK_BONUSES) { if (streak >= tier.min) best = tier; }
  return best;
}

function buildJoinButton(sessionId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sins_rich_join:${sessionId}`)
      .setLabel('Enter Jackpot!')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

// Build a select menu to pick among active sessions
function buildSessionPicker(sessions, customId, placeholder) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(sessions.map(s => {
      const label = s.name.length > 25 ? s.name.slice(0, 22) + '...' : s.name;
      const endsAt = new Date(s.ends_at);
      const timeLeft = formatTimeLeft(endsAt - Date.now());
      return new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setDescription(`Pot: ${s.pot.toLocaleString()} sins • Draws in: ${timeLeft}`)
        .setValue(String(s.id));
    }));
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  name: 'jackpot',
  _client: null,

  async handleCommand(message, args, command) {
    if (['jackpot', 'richpot', 'lottery'].includes(command))          return this.showJackpot(message);
    if (['enter', 'lotteryenter'].includes(command))                   return this.enter(message, args);
    if (command === 'jackpotdraw')                                     return this.adminDraw(message, args);
    if (command === 'jackpothistory')                                  return this.history(message);
    if (command === 'jackpotstart')                                    return this.adminStart(message, args);
    if (command === 'jackpotstop')                                     return this.adminStop(message, args);
    if (['jackpotentries', 'potentries'].includes(command))            return this.viewEntries(message, args);
  },

  async handleSlash(interaction) {
    const cmd = interaction.commandName;
    if (cmd === 'richpot')         return this.showJackpotSlash(interaction);
    if (cmd === 'lotteryjoin')     return this.enterSlash(interaction);
    if (cmd === 'jackpotdraw')     return this.adminDrawSlash(interaction);
    if (cmd === 'jackpothistory')  return this.historySlash(interaction);
    if (cmd === 'jackpotstart')    return this.adminStartSlash(interaction);
    if (cmd === 'jackpotstop')     return this.adminStopSlash(interaction);
    if (cmd === 'jackpotentries')  return this.viewEntriesSlash(interaction);
  },

  // ── Button handler ─────────────────────────────────────────────────────────
  async handleButton(interaction) {
    if (interaction.customId.startsWith('sins_rich_join:')) {
      const sessionId = parseInt(interaction.customId.split(':')[1]);
      return this._showJoinModal(interaction, sessionId);
    }
  },

  // ── Select menu handler ────────────────────────────────────────────────────
  async handleSelect(interaction) {
    const [action, ...rest] = interaction.customId.split(':');

    if (action === 'richpot_view') {
      const sessionId = parseInt(interaction.values[0]);
      await interaction.deferUpdate();
      const session = await jackpot.getSession(sessionId);
      if (!session) return interaction.followUp({ content: `${E.ERROR} Pot not found.`, ephemeral: true });
      const entries = await jackpot.getEntries(sessionId);
      const { embed, row } = buildSessionEmbed(session, entries);
      return interaction.editReply({ embeds: [embed], components: row ? [row] : [] });
    }

    if (action === 'richpot_draw') {
      await interaction.deferReply({ ephemeral: true });
      const sessionId = parseInt(interaction.values[0]);
      return this._runDraw(interaction.channel, sessionId, async (msg) => interaction.editReply(msg));
    }

    if (action === 'richpot_stop') {
      await interaction.deferReply({ ephemeral: true });
      const sessionId = parseInt(interaction.values[0]);
      return this._stopAndRefund(sessionId, async (msg) => interaction.editReply(msg));
    }

    if (action === 'richpot_entries') {
      await interaction.deferReply({ ephemeral: true });
      const sessionId = parseInt(interaction.values[0]);
      const isAdmin   = this._isAdmin(interaction.member, interaction.user.id);
      return this._showEntriesForSession(sessionId, isAdmin, async (msg) => interaction.editReply(msg));
    }

    if (action === 'richpot_live') {
      await interaction.deferReply({ ephemeral: true });
      const sessionId = parseInt(interaction.values[0]);
      const channel   = interaction.channel;
      await this._activateLiveChannel(channel, sessionId);
      return interaction.editReply(`<:checkmark:1495666088417956002> Live display pinned in <#${channel.id}>!`);
    }
  },

  // ── Modal handler ──────────────────────────────────────────────────────────
  async handleModal(interaction) {
    if (interaction.customId.startsWith('sins_rich_modal:')) {
      const sessionId = parseInt(interaction.customId.split(':')[1]);
      const raw       = interaction.fields.getTextInputValue('sins_rich_number');
      const number    = parseInt(raw);
      return this._processEnter(interaction.user, number, sessionId, async (msg) => {
        if (interaction.replied || interaction.deferred)
          return interaction.followUp(typeof msg === 'string' ? { content: msg, ephemeral: true } : { ...msg, ephemeral: true });
        return interaction.reply(typeof msg === 'string' ? { content: msg, ephemeral: true } : { ...msg, ephemeral: true });
      });
    }
  },

  async _showJoinModal(interaction, sessionId) {
    const session = await jackpot.getSession(sessionId);
    if (!session || session.status !== 'active')
      return interaction.reply({ content: `${E.ERROR} This pot is no longer active!`, ephemeral: true });
    if (await jackpot.hasEntered(interaction.user.id, sessionId))
      return interaction.reply({ content: `${E.ERROR} You already entered **${session.name}**! Good luck 🤞`, ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`sins_rich_modal:${sessionId}`)
      .setTitle(`Enter: ${session.name}`.slice(0, 45));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sins_rich_number')
        .setLabel('Pick a number between 1 and 100')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 42')
        .setMinLength(1).setMaxLength(3).setRequired(true)
    ));
    await interaction.showModal(modal);
  },

  // ── Show pot overview ─────────────────────────────────────────────────────
  async showJackpot(message) {
    const { embeds, components } = await buildOverviewPayload();
    return message.reply({ embeds, components });
  },
  async showJackpotSlash(interaction) {
    const { embeds, components } = await buildOverviewPayload();
    await interaction.reply({ embeds, components });
  },

  // ── Enter ─────────────────────────────────────────────────────────────────
  async enter(message, args) {
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return message.reply(`${E.ERROR} No active pots right now!`);
    if (sessions.length === 1) {
      return this._processEnter(message.author, parseInt(args[0]), sessions[0].id,
        async (msg) => message.reply(msg));
    }
    // Multiple pots — ask which one: !enter <number> <sessionId>
    const sessionId = parseInt(args[1]);
    if (!sessionId) {
      const names = sessions.map((s, i) => `**${i + 1}.** ${s.name} (ID: ${s.id})`).join('\n');
      return message.reply(`Multiple pots are running! Use \`!enter <number> <potID>\`:\n${names}`);
    }
    return this._processEnter(message.author, parseInt(args[0]), sessionId,
      async (msg) => message.reply(msg));
  },
  async enterSlash(interaction) {
    const number  = interaction.options.getInteger('number');
    const sessions = await jackpot.getActiveSessions();
    await interaction.deferReply({ ephemeral: true });
    if (!sessions.length)
      return interaction.editReply(`${E.ERROR} No active pots right now!`);
    if (sessions.length === 1)
      return this._processEnter(interaction.user, number, sessions[0].id,
        async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg } : msg));
    // Show picker
    const picker = buildSessionPicker(sessions, 'richpot_join_pick', 'Which pot do you want to enter?');
    // Store number temporarily via customId hack — we handle this in select
    picker.components[0].setCustomId(`richpot_join_pick:${number}`);
    return interaction.editReply({ content: 'Which pot do you want to enter?', components: [picker] });
  },

  async _processEnter(user, number, sessionId, replyFn) {
    const session = await jackpot.getSession(sessionId);
    if (!session || session.status !== 'active')
      return replyFn(`${E.ERROR} That pot is no longer active!`);
    if (!number || number < jackpot.NUMBER_MIN || number > jackpot.NUMBER_MAX)
      return replyFn(`${E.ERROR} Pick a number between **${jackpot.NUMBER_MIN}** and **${jackpot.NUMBER_MAX}**!`);
    if (await jackpot.hasEntered(user.id, sessionId))
      return replyFn(`${E.ERROR} You already entered **${session.name}**!`);

    await economy.getUser(user.id, user.username);
    const bal = await economy.getBalance(user.id);
    if (bal < jackpot.ENTRY_COST)
      return replyFn(`${E.ERROR} You need **${jackpot.ENTRY_COST} ${CURRENCY}** but only have **${bal}**.`);

    await economy.removeFunds(user.id, jackpot.ENTRY_COST, `Entry: ${session.name}`);
    await jackpot.addToPot(jackpot.ENTRY_COST, `Entry by ${user.username}`, sessionId);
    await jackpot.enter(user.id, user.username, number, sessionId);
    await this.updateLiveChannels();

    const pot     = await jackpot.getPot(sessionId);
    const entries = await jackpot.getEntries(sessionId);
    const timeLeft = formatTimeLeft(new Date(session.ends_at) - Date.now());

    return replyFn({ embeds: [
      new EmbedBuilder()
        .setColor('#B5EAC8')
        .setTitle(`🎟️ You're In — ${session.name}!`)
        .setDescription(
          `You picked **#${number}**!\n\n` +
          `A random number 1-100 will be drawn — whoever is **closest wins the whole pot!**\n` +
          `It's like a lottery — one lucky player walks away rich. <a:moneybag:1479268556687540345> <a:purplesparkle:1479210541691175054>`
        )
        .addFields(
          { name: '<a:target:1495665634279821485> Your Number',    value: `**${number}**`,                          inline: true },
          { name: `${E.BB_COIN} Pot`, value: `**${pot.toLocaleString()} ${CURRENCY}**`, inline: true },
          { name: '<:member:1495666085121491024> Entries',        value: `**${entries.length}** players`,           inline: true },
          { name: '<a:calendar:1479266779837632562> Draw In',         value: timeLeft,                                 inline: true },
        )
        .setFooter({ text: 'May the closest number win!' })
    ]});
  },

  // ── Admin: Start ──────────────────────────────────────────────────────────
  async adminStart(message, args) {
    if (!this._isAdmin(message.member, message.author.id))
      return message.reply(`${E.ERROR} Only admins can start a pot!`);

    // Parse: !jackpotstart [name] [mode] [entry:<amount>]
    // e.g. !jackpotstart Weekly Jackpot weekly entry:300
    const rawArgs = args.join(' ');
    const entryMatch = rawArgs.match(/entry:(\d+)/i);
    const entryCost  = entryMatch ? parseInt(entryMatch[1]) : null;
    const isOwner    = message.author.id === process.env.OWNER_ID;

    if (entryCost && !isOwner && !message.member?.permissions?.has('Administrator'))
      return message.reply(`${E.ERROR} Only the owner can set a custom entry cost.`);

    const cleanArgs  = rawArgs.replace(/entry:\d+/i, '').trim().split(/\s+/);
    const name   = cleanArgs.slice(0, -1).join(' ') || 'Weekly Jackpot';
    const mode   = cleanArgs[cleanArgs.length - 1] || 'weekly';
    return this._startJackpot(name, mode, message.channel, null, async (msg) => message.channel.send(msg), entryCost);
  },
  async adminStartSlash(interaction) {
    if (!this._isAdmin(interaction.member, interaction.user.id))
      return interaction.reply({ content: `${E.ERROR} Only admins can start a pot!`, ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const name      = interaction.options.getString('name') || 'Weekly Jackpot';
    const mode      = interaction.options.getString('mode') || 'weekly';
    const roleRaw   = interaction.options.getString('pingrole') || null;
    const roleId    = roleRaw ? (roleRaw.match(/\d{17,19}/) || [])[0] || null : null;
    const channel   = interaction.options.getChannel('channel') || interaction.channel;
    const entryCost = interaction.options.getInteger('entrycost') || null;
    const isOwner   = interaction.user.id === process.env.OWNER_ID;

    if (entryCost && !isOwner && !interaction.member?.permissions?.has('Administrator')) {
      return interaction.editReply(`${E.ERROR} Only the owner can set a custom entry cost.`);
    }

    await interaction.editReply(`<a:jackpot:1479203793806557385> Starting **${name}** (${mode}) in <#${channel.id}>...`);
    return this._startJackpot(name, mode, channel, roleId, async () => {}, entryCost);
  },

  async _startJackpot(name, mode, channel, roleId, replyFn, customEntryCost = null) {
    const durations = { weekly: 7*24*60*60*1000, biweekly: 15*24*60*60*1000, monthly: 30*24*60*60*1000 };
    const modeKey = (mode || 'weekly').trim().toLowerCase();
    const ms     = durations[modeKey] || durations.weekly;
    const label  = modeKey === 'monthly' ? '1 Month (30 days)' : modeKey === 'biweekly' ? '15 Days' : '1 Week (7 days)';
    const endsAt = new Date(Date.now() + ms);

    if (customEntryCost) jackpot.ENTRY_COST = customEntryCost;
    const session = await jackpot.startSession(name, endsAt.toISOString(), channel.id);

    const drawFund = await jackpot.getDrawFund();
    const entries0 = await jackpot.getEntries(session.id);
    const embed = new EmbedBuilder()
      .setColor('#D8B4FE')
      .setDescription(
        `**What is this?**\n` +
        `It's a jackpot lottery! Pay **${jackpot.ENTRY_COST} Sins** to enter and pick a number 1-100.\n` +
        `When time is up, we draw a random number — whoever's pick is **closest wins the entire pot!** <a:confetti:1495667283870089307>\n\n` +
        `<a:583778moneyfly:1479271753392853023> Game ties (game draws feed into the pot automatically)\n\n` +
        `<a:calendar:1479266779837632562> Draw in: **${label}** · Ends: <t:${Math.floor(endsAt.getTime()/1000)}:F>`
      )
      .addFields(
        { name: '<:pd_zPurple_Pin:1495665628672037046> How to Win', value: 'Pick the closest number to the draw — you win the whole pot!', inline: false },
        { name: '<:member:1495666085121491024> Entries', value: `**${entries0.length}**`, inline: true },
      )
      .setFooter({ text: `Entry: ${jackpot.ENTRY_COST} Sins • Click the button to enter!` });

    const ping = roleId ? `<@&${roleId}>` : '';
    const titleLine = ping
      ? `# ${name} — LIVE!
${ping}`
      : `# ${name} — LIVE!`;
    const startMsg = await channel.send({
      content: titleLine,
      embeds: [embed],
      components: [buildJoinButton(session.id)],
    });
    const key = `${channel.id}:${session.id}`;
    liveChannels.set(key, { messageId: startMsg.id, sessionId: session.id, channelId: channel.id });
    await jackpot.saveLiveMessageId(session.id, startMsg.id).catch(() => {});
    await this.updateLiveChannels();
    this._scheduleAutoDraw(session.id, ms, channel);
    return replyFn(`<:checkmark:1495666088417956002> **${name}** started!`);
  },

  _scheduleAutoDraw(sessionId, ms, channel) {
    if (drawTimers.has(sessionId)) return; // already scheduled
    const channelId = channel?.id || channel;
    const timer = setTimeout(async () => {
      const ch = this._client
        ? await this._client.channels.fetch(channelId).catch(() => null)
        : (typeof channel === 'object' ? channel : null);
      if (ch) await this._runDraw(ch, sessionId);
      drawTimers.delete(sessionId);
    }, ms);
    drawTimers.set(sessionId, timer);
  },

  // ── Admin: Stop ───────────────────────────────────────────────────────────
  async adminStop(message, args) {
    if (!this._isAdmin(message.member, message.author.id))
      return message.reply(`${E.ERROR} Only admins can stop a pot!`);
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return message.reply(`${E.ERROR} No active pots!`);
    if (sessions.length === 1) {
      return this._stopAndRefund(sessions[0].id, async (msg) => message.reply(msg));
    }
    const picker = buildSessionPicker(sessions, 'richpot_stop', 'Which pot do you want to stop?');
    return message.reply({ content: 'Which pot do you want to stop?', components: [picker] });
  },
  async adminStopSlash(interaction) {
    if (!this._isAdmin(interaction.member, interaction.user.id))
      return interaction.reply({ content: `${E.ERROR} Only admins can stop a pot!`, ephemeral: true });
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return interaction.reply({ content: `${E.ERROR} No active pots!`, ephemeral: true });
    if (sessions.length === 1) {
      await interaction.deferReply({ ephemeral: true });
      return this._stopAndRefund(sessions[0].id, async (msg) => interaction.editReply(msg));
    }
    await interaction.reply({
      content: 'Which pot do you want to stop?',
      components: [buildSessionPicker(sessions, 'richpot_stop', 'Pick a pot to stop')],
      ephemeral: true,
    });
  },

  // ── Admin: Draw ───────────────────────────────────────────────────────────
  async adminDraw(message, args) {
    if (!this._isAdmin(message.member, message.author.id))
      return message.reply(`${E.ERROR} Only admins can trigger a draw!`);
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return message.reply(`${E.ERROR} No active pots!`);
    if (sessions.length === 1) return this._runDraw(message.channel, sessions[0].id);
    const picker = buildSessionPicker(sessions, 'richpot_draw', 'Which pot do you want to draw?');
    return message.reply({ content: 'Which pot do you want to draw?', components: [picker] });
  },
  async adminDrawSlash(interaction) {
    if (!this._isAdmin(interaction.member, interaction.user.id))
      return interaction.reply({ content: `${E.ERROR} Only admins can draw!`, ephemeral: true });
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return interaction.reply({ content: `${E.ERROR} No active pots!`, ephemeral: true });
    if (sessions.length === 1) {
      await interaction.deferReply();
      return this._runDraw(interaction.channel, sessions[0].id, async (msg) => interaction.editReply(msg));
    }
    await interaction.reply({
      content: 'Which pot do you want to draw?',
      components: [buildSessionPicker(sessions, 'richpot_draw', 'Pick a pot to draw')],
      ephemeral: true,
    });
  },

  async _runDraw(channel, sessionId, replyFn) {
    const result = await jackpot.draw(sessionId);
    if (!result) { const m = `${E.ERROR} Pot not found.`; return replyFn ? replyFn(m) : channel.send(m); }

    await jackpot.endSession(sessionId);
    const timer = drawTimers.get(sessionId);
    if (timer) { clearTimeout(timer); drawTimers.delete(sessionId); }

    const name = result.session?.name || POT_NAME;

    if (!result.winner) {
      // No entries — pot goes back to draw fund so it carries into the next session
      await jackpot.addToDrawFund(result.pot);
      const msg = `<a:jackpot:1479203793806557385> **${name} Draw** — No entries! **${result.pot.toLocaleString()} ${CURRENCY}** saved to the draw fund for the next pot.`;
      await this.updateLiveChannels();
      return replyFn ? replyFn(msg) : channel.send(msg);
    }

    await economy.getUser(result.winner.user_id, result.winner.username);
    await economy.addFunds(result.winner.user_id, result.pot, `${name} win`);

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setDescription(
        `# ${name} — RESULTS\n\n` +
        `<a:dice_roll:1507764402013868154> The winning number was: <:greendot:1497477975925588100> **${result.winningNum}**\n\n` +
        `<a:trophies:1507765453299122387> **<@${result.winner.user_id}> wins the pot!**\n` +
        `Their pick **#${result.winner.number}** was the closest!\n\n` +
        `<a:moneybag:1479268556687540345> **${result.pot.toLocaleString()} Sins** added to their balance!` +
        (result.tied ? `\n\n*(Tiebreaker applied)*` : '')
      )
      .addFields(
        { name: '<:greendot:1497477975925588100> Winning #',              value: `**${result.winningNum}**`,          inline: true },
        { name: '<a:trophies:1507765453299122387> Winner',                value: `<@${result.winner.user_id}>`,       inline: true },
        { name: '<a:target:1495665634279821485> Their Pick',              value: `**${result.winner.number}**`,       inline: true },
      );

    const msg = { content: `<@${result.winner.user_id}> <a:moneybag:1479268556687540345> You won the Jackpot!`, embeds: [embed] };
    await this.updateLiveChannels();
    return replyFn ? replyFn(msg) : channel.send(msg);
  },

  // ── Entries ───────────────────────────────────────────────────────────────
  async viewEntries(message, args) {
    const isAdmin  = this._isAdmin(message.member, message.author.id);
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return message.reply(`${E.ERROR} No active pots!`);
    if (sessions.length === 1)
      return this._showEntriesForSession(sessions[0].id, isAdmin, async (msg) => message.reply(msg));
    const picker = buildSessionPicker(sessions, 'richpot_entries', 'Which pot\'s entries do you want to see?');
    return message.reply({ content: 'Which pot?', components: [picker] });
  },
  async viewEntriesSlash(interaction) {
    const isAdmin  = this._isAdmin(interaction.member, interaction.user.id);
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return interaction.reply({ content: `${E.ERROR} No active pots!`, ephemeral: true });
    if (sessions.length === 1) {
      await interaction.deferReply({ ephemeral: true });
      return this._showEntriesForSession(sessions[0].id, isAdmin, async (msg) => interaction.editReply(msg));
    }
    await interaction.reply({
      content: 'Which pot\'s entries do you want to see?',
      components: [buildSessionPicker(sessions, 'richpot_entries', 'Pick a pot')],
      ephemeral: true,
    });
  },

  async _showEntriesForSession(sessionId, isAdmin, replyFn) {
    const session = await jackpot.getSession(sessionId);
    const entries = await jackpot.getEntries(sessionId);
    if (!entries.length)
      return replyFn({ embeds: [new EmbedBuilder().setColor('#D8B4FE')
        .setTitle(`<a:moneybag:1479268556687540345> ${session?.name} — Participants`)
        .setDescription('No entries yet! Be the first 🎟️')
        .addFields({ name: `${E.BB_COIN} Pot`, value: `**${session?.pot?.toLocaleString() || 0} Sins**`, inline: true })]});

    const lines = isAdmin
      ? entries.map((e, i) => `${i+1}. <@${e.user_id}> — picked **#${e.number}**`).join('\n')
      : entries.map((e, i) => `${i+1}. <@${e.user_id}>`).join('\n');

    return replyFn({ embeds: [
      new EmbedBuilder()
        .setColor('#D8B4FE')
        .setTitle(`<a:moneybag:1479268556687540345> ${session?.name} — Participants`)
        .setDescription(isAdmin
          ? `**Admin view — picks shown** 🔒\n\n${lines}`
          : `${entries.length} player${entries.length !== 1 ? 's' : ''} entered! Numbers are secret until the draw 🤫\n\n${lines}`)
        .addFields(
          { name: `${E.BB_COIN} Pot`,  value: `**${session?.pot?.toLocaleString() || 0} Sins**`, inline: true },
          { name: '<:member:1495666085121491024> Total Entries',   value: `**${entries.length}**`,                           inline: true },
        )
        .setFooter({ text: isAdmin ? 'Admin view' : 'Numbers revealed after the draw' })
    ]});
  },

  // ── History ───────────────────────────────────────────────────────────────
  async history(message) {
    return this._showHistory(async (msg) => message.reply(msg));
  },
  async historySlash(interaction) {
    await interaction.deferReply({ ephemeral: true });
    return this._showHistory(async (msg) => interaction.editReply(msg));
  },
  async _showHistory(replyFn) {
    const rows = await jackpot.getHistory(5);
    if (!rows.length) return replyFn('<a:moneybag:1479268556687540345> No draws yet!');
    const lines = rows.map(r =>
      `**${r.session_name || 'Pot'}** (${r.drawn_at?.slice(0,10)}) — <a:target:1495665634279821485> #${r.winning_num} → <@${r.winner_id}> won **${r.amount_won?.toLocaleString()} ${CURRENCY}**`
    ).join('\n');
    return replyFn({ embeds: [
      new EmbedBuilder().setColor('#D8B4FE').setTitle('<a:moneybag:1479268556687540345> Jackpot — History')
        .setDescription(lines).setFooter({ text: 'Last 5 draws' })
    ]});
  },

  // ── Live channel ──────────────────────────────────────────────────────────
  async setLiveChannel(message, args) {
    if (!this._isAdmin(message.member, message.author.id))
      return message.reply(`${E.ERROR} Only admins can set the live channel!`);
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return message.reply(`${E.ERROR} No active pots!`);
    if (sessions.length === 1) {
      await this._activateLiveChannel(message.channel, sessions[0].id);
      return message.reply(`<:checkmark:1495666088417956002> Live display for **${sessions[0].name}** pinned here!`);
    }
    const picker = buildSessionPicker(sessions, 'richpot_live', 'Which pot do you want to display here?');
    return message.reply({ content: 'Which pot do you want to display?', components: [picker] });
  },
  async setLiveChannelSlash(interaction) {
    if (!this._isAdmin(interaction.member, interaction.user.id))
      return interaction.reply({ content: `${E.ERROR} Only admins can set the live channel!`, ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    if (!this._client) this._client = interaction.client;
    const sessions = await jackpot.getActiveSessions();
    if (!sessions.length) return interaction.editReply(`${E.ERROR} No active pots!`);
    const channel   = interaction.options.getChannel('channel') || interaction.channel;
    if (sessions.length === 1) {
      await this._activateLiveChannel(channel, sessions[0].id);
      return interaction.editReply(`<:checkmark:1495666088417956002> Live display for **${sessions[0].name}** pinned in <#${channel.id}>!`);
    }
    await interaction.editReply({
      content: `Which pot do you want to display in <#${channel.id}>?`,
      components: [buildSessionPicker(sessions, 'richpot_live', 'Pick a pot to display')],
    });
  },

  async _activateLiveChannel(channel, sessionId) {
    const session = await jackpot.getSession(sessionId);
    const entries = await jackpot.getEntries(sessionId);
    const { embed, row } = buildSessionEmbed(session, entries);

    const key      = `${channel.id}:${sessionId}`;
    const existing = liveChannels.get(key);
    if (existing) {
      try {
        const oldMsg = await channel.messages.fetch(existing.messageId);
        await oldMsg.edit({ embeds: [embed], components: row ? [row] : [] });
        return;
      } catch(e) {}
    }
    const msg = await channel.send({ embeds: [embed], components: row ? [row] : [] });
    try { await msg.pin(); } catch(e) {}
    liveChannels.set(key, { messageId: msg.id, sessionId, channelId: channel.id });
    // Persist message ID so it survives restarts
    await jackpot.saveLiveMessageId(sessionId, msg.id).catch(() => {});
  },

  async updateLiveChannels(client) {
    if (!liveChannels.size) return;
    const c = client || this._client;
    if (!c) return;
    for (const [key, data] of liveChannels) {
      try {
        const session = await jackpot.getSession(data.sessionId);
        const entries = await jackpot.getEntries(data.sessionId);
        const { embed, row } = buildSessionEmbed(session, entries);
        const channel = await c.channels.fetch(data.channelId);
        const msg     = await channel.messages.fetch(data.messageId);
        await msg.edit({ embeds: [embed], components: row ? [row] : [] });
      } catch(e) { liveChannels.delete(key); }
    }
  },

  // ── Scheduler ─────────────────────────────────────────────────────────────
  initScheduler(client) {
    this._client = client;

    // Restore live channel map from DB on startup
    jackpot.getActiveSessions().then(sessions => {
      for (const session of sessions) {
        if (session.live_message_id && session.channel_id) {
          const key = `${session.channel_id}:${session.id}`;
          liveChannels.set(key, {
            messageId:  session.live_message_id,
            sessionId:  session.id,
            channelId:  session.channel_id,
          });
        }
      }
      console.log(`[RichPot] Restored ${liveChannels.size} live channel(s).`);
    }).catch(() => {});

    // Restore timers for any sessions that were active before a restart
    jackpot.getActiveSessions().then(sessions => {
      for (const session of sessions) {
        const msLeft = new Date(session.ends_at) - Date.now();
        if (msLeft > 0) {
          // Session still has time — reschedule its draw
          this._scheduleAutoDraw(session.id, msLeft,
            { id: session.channel_id, client, send: async (msg) => {
              const ch = await client.channels.fetch(session.channel_id).catch(() => null);
              if (ch) ch.send(msg);
            }}
          );
          console.log(`[RichPot] Restored timer for "${session.name}" — draws in ${Math.round(msLeft/3600000)}h`);
        } else {
          // Already expired while bot was offline — draw now
          client.channels.fetch(session.channel_id).then(ch => {
            if (ch) this._runDraw(ch, session.id);
          }).catch(() => {});
        }
      }
    }).catch(() => {});

    // Fallback check every 5 minutes for any sessions that slipped through
    setInterval(async () => {
      const sessions = await jackpot.getActiveSessions().catch(() => []);
      for (const session of sessions) {
        if (new Date(session.ends_at) <= new Date() && !drawTimers.has(session.id)) {
          const channel = await client.channels.fetch(session.channel_id).catch(() => null);
          if (channel) await this._runDraw(channel, session.id);
        }
      }
    }, 5 * 60 * 1000); // every 5 minutes, not every 60 seconds

    setInterval(() => this.updateLiveChannels(client), 5 * 60 * 1000);
    console.log('[RichPot] Multi-session scheduler active.');
  },

  // ── Streak bonus ──────────────────────────────────────────────────────────
  async awardStreakBonus(userId, username, streak, channel) {
    const tier = getStreakBonus(streak);
    if (!tier) return;
    await economy.getUser(userId, username);
    await economy.addFunds(userId, tier.bonus, `Streak bonus (${streak} wins)`);
    if (channel) await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FFD4A8').setTitle(tier.label)
        .setDescription(`<@${userId}> is on a **${streak}-win streak** in Tic-Tac-Bruh!\n${E.BB_COIN} **+${tier.bonus} Sins** streak bonus!`)
        .setFooter({ text: STREAK_BONUSES.map(t => `${t.min} wins = +${t.bonus} sins`).join(' • ') })
    ]});
  },

  async _stopAndRefund(sessionId, replyFn) {
    const session = await jackpot.getSession(sessionId);
    if (!session) return replyFn(`${E.ERROR} Pot not found.`);

    const { refunded, drawFundRestored } = await jackpot.refundAndEndSession(sessionId);
    const timer = drawTimers.get(sessionId);
    if (timer) { clearTimeout(timer); drawTimers.delete(sessionId); }
    await this.updateLiveChannels();

    // Refund each player their entry fee
    for (const entry of refunded) {
      await economy.getUser(entry.user_id, entry.username);
      await economy.addFunds(entry.user_id, jackpot.ENTRY_COST, `Refund: ${session.name} stopped`);
    }

    const drawFundNote = drawFundRestored > 0
      ? `\n<a:583778moneyfly:1479271753392853023> **${drawFundRestored.toLocaleString()} Sins** from game draws saved to the draw fund for the next pot.`
      : '';

    return replyFn({ embeds: [
      new EmbedBuilder()
        .setColor('#D8D8D8')
        .setTitle(`🛑 ${session.name} Stopped`)
        .setDescription(
          refunded.length > 0
            ? `**${refunded.length} player${refunded.length !== 1 ? 's' : ''}** refunded **${jackpot.ENTRY_COST} Sins** each.` + drawFundNote
            : `No entries to refund.` + drawFundNote
        )
        .addFields(
          { name: '<:member:1495666085121491024> Players Refunded', value: `**${refunded.length}**`,                                             inline: true },
          { name: '<a:moneybag:1479268556687540345> Total Refunded',   value: `**${(refunded.length * jackpot.ENTRY_COST).toLocaleString()} Sins**`, inline: true },
        )
        .setFooter({ text: 'Start a new pot anytime with /jackpotstart' })
    ]});
  },

  _isAdmin(member, userId) {
    if (userId === process.env.OWNER_ID) return true;
    return member?.permissions?.has('Administrator') ||
           member?.roles?.cache?.some(r => r.name === (process.env.ADMIN_ROLE || 'Admin'));
  },

  STREAK_BONUSES,
  getStreakBonus,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTimeLeft(ms) {
  if (ms <= 0) return 'Drawing soon...';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function buildSessionEmbed(session, entries) {
  const active   = session?.status === 'active';
  const pot      = session?.pot || 0;
  const endsAt   = session ? new Date(session.ends_at) : null;
  const msLeft   = endsAt ? endsAt - Date.now() : 0;
  const timeLeft = endsAt ? formatTimeLeft(msLeft) : null;
  const color    = '#D8B4FE';
  const name     = session?.name || POT_NAME;

  // Visual pot fill bar (10 blocks, fills as pot grows toward 10,000 sins)
  const filled = Math.min(Math.round((pot / 10000) * 10), 10);
  const potBar = '🟨'.repeat(filled) + '⬛'.repeat(10 - filled);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(active ? `<a:moneybag:1479268556687540345> ${name} — LIVE!` : `<a:moneybag:1479268556687540345> ${name} — Ended`)
    .setDescription(active
      ? `The pot is growing! Every game draw feeds into it.\nA winner will be drawn when the countdown hits zero. <a:jackpot:1479203793806557385>`
      : `This pot has ended.`
    )
    .addFields(
      { name: `${E.BB_COIN || '<a:moneybag:1479268556687540345>'} Current Pot`, value: `**${pot.toLocaleString()} Sins**`, inline: true },
      { name: '<:member:1495666085121491024> Players Entered',                value: `**${entries.length}**`,            inline: true },
      { name: '<a:calendar:1479266779837632562> Draw In',                         value: timeLeft ? `**${timeLeft}**` : '—', inline: true },
      { name: '<a:purplefire:1479219348353716415> Pot Level',                       value: potBar,                             inline: false },
    )
    .setTimestamp()
    .setFooter({ text: active ? 'Updates automatically • Click below to enter!' : 'This pot has ended.' });

  const row = active ? buildJoinButton(session.id) : null;
  return { embed, row };
}


async function buildOverviewPayload() {
  const sessions = await jackpot.getActiveSessions();

  if (!sessions.length) {
    return {
      embeds: [new EmbedBuilder().setColor('#D8D8D8')
        .setTitle('<a:moneybag:1479268556687540345> Jackpot')
        .setDescription('No active pots right now. An admin will start one soon!\n\nGame ties still feed the pot in the background.')
        .setFooter({ text: 'Admin: /jackpotstart to begin a new pot' })],
      components: [],
    };
  }

  // Show all active sessions as cards
  const embeds = sessions.map(s => {
    const color    = '#D8B4FE';
    const timeLeft = formatTimeLeft(new Date(s.ends_at) - Date.now());
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`<a:moneybag:1479268556687540345> ${s.name} — LIVE!`)
      .addFields(
        { name: `${E.BB_COIN || '<a:moneybag:1479268556687540345>'} Pot`, value: `**${s.pot.toLocaleString()} Sins**`, inline: true },
        { name: '<a:calendar:1479266779837632562> Draws In',               value: timeLeft,                             inline: true },
      )
      .setFooter({ text: `Pot ID: ${s.id} • Entry: ${jackpot.ENTRY_COST} Sins` });
  });

  // If multiple pots, add a "view" picker
  const components = sessions.length > 1
    ? [buildSessionPicker(sessions, 'richpot_view', 'View a specific pot in detail')]
    : [buildJoinButton(sessions[0].id)];

  return { embeds, components };
}

module.exports.buildSessionEmbed = buildSessionEmbed;
