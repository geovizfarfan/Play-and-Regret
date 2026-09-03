// ─────────────────────────────────────────────────────────────────────────────
// FAFO — Fuck Around & Find Out
// Push-your-luck multiplayer game wagering real sins. See rounds.js for the
// escalating risk curve, messages.js for flavor text, wager.js for limits.
//
// Round decisions are made via DM — ephemeral replies only work as a direct
// response to that user's own interaction, and the bot needs to *push* a
// decision prompt to every active player simultaneously each round, so DMs
// are the only way to keep choices private and simultaneous. If a player's
// DMs are closed, they're auto-cashed-out for that round (safe default —
// never auto-risk someone's sins without their input).
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, economy } = require('../../utils/database');
const { promptWager } = require('../../utils/wager');
const { awardRegret } = require('../../utils/regret');
const { ROUNDS, FINAL_FAFO, CONFIG, getRoundConfig } = require('./rounds');
const { calcWagerLimits } = require('./wager');
const M = require('./messages');

const activeSessions = new Map(); // channelId -> session

function isHost(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}

async function ensureStats(userId) {
  await db.run('INSERT INTO fafo_stats (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [userId]);
}

// ── Lobby ───────────────────────────────────────────────────────────────────
async function startLobby(channel, hostId, hostName) {
  if (activeSessions.has(channel.id)) return null;

  const session = {
    channelId: channel.id, hostId, hostName,
    phase: 'lobby', round: 0,
    players: new Map(), // userId -> { userId, username, wager, pot, status, streak }
    lobbyMsg: null, lobbyTimer: null,
  };
  activeSessions.set(channel.id, session);

  const embed = new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle('<a:BlowUpBoom:1544848366377246760> FUCK AROUND & FIND OUT')
    .setDescription(
      `*${M.pick(M.LOBBY_LINES)}*\n\n` +
      `<@${hostId}> opened a FAFO session.\n\n` +
      `Wager your real sins. Push your luck round by round. Cash out whenever — or don't.\n\n` +
      `<a:SINS:1522338223613804724> Need at least **${CONFIG.minBalanceToPlay.toLocaleString()} sins** to play\n` +
      `<a:RojasClock:1511506715453947904> Lobby closes in **${Math.floor(CONFIG.lobbyDurationMs / 1000)}s**`
    )
    .addFields({ name: '<:member:1495666085121491024> Joined', value: '**0** players' })
    .setFooter({ text: 'Wagers are locked in privately — nobody else sees your amount' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fafo_join:${channel.id}`).setLabel('Join').setEmoji('<a:BlowUpBoom:1544848366377246760>').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`fafo_startearly:${channel.id}`).setLabel('Start Early').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fafo_cancel:${channel.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  session.lobbyMsg = msg;
  session.lobbyTimer = setTimeout(() => beginRounds(channel).catch(() => {}), CONFIG.lobbyDurationMs);

  return session;
}

async function refreshLobbyEmbed(session) {
  if (!session.lobbyMsg?.embeds?.[0]) return;
  const updated = EmbedBuilder.from(session.lobbyMsg.embeds[0]).spliceFields(0, 1, {
    name: '<:member:1495666085121491024> Joined',
    value: `**${session.players.size}** player${session.players.size !== 1 ? 's' : ''}`,
  });
  await session.lobbyMsg.edit({ embeds: [updated] }).catch(() => {});
}

// ── Join + wager ──────────────────────────────────────────────────────────
async function handleJoin(interaction) {
  const channelId = interaction.customId.split(':')[1];
  const session = activeSessions.get(channelId);
  if (!session || session.phase !== 'lobby') {
    return interaction.reply({ content: '<:wrong:1495666083594502174> This FAFO session isn\'t taking new players.', ephemeral: true });
  }
  if (session.players.has(interaction.user.id)) {
    return interaction.reply({ content: '<a:Warning:1497476844860215366> You\'re already in this session.', ephemeral: true });
  }

  await economy.getUser(interaction.user.id, interaction.user.username);
  const balance = await economy.getBalance(interaction.user.id);
  const limits = calcWagerLimits(balance);
  if (!limits) {
    return interaction.reply({ content: `<:wrong:1495666083594502174> You need at least **${CONFIG.minBalanceToPlay.toLocaleString()} sins** to play. You have **${balance.toLocaleString()}**.`, ephemeral: true });
  }

  const wager = await promptWager(interaction, {
    min: limits.min, max: limits.max,
    title: `Your balance: ${balance.toLocaleString()} sins — pick your wager`,
    gamePrefix: 'fafo',
  });
  if (!wager) return; // timed out or invalid — promptWager already told them

  // Re-check session still open and re-check balance hasn't changed enough to invalidate (race protection)
  const freshSession = activeSessions.get(channelId);
  if (!freshSession || freshSession.phase !== 'lobby') return;
  const freshBalance = await economy.getBalance(interaction.user.id);
  if (freshBalance < wager) {
    return interaction.followUp({ content: `<:wrong:1495666083594502174> Your balance changed and you can no longer cover **${wager.toLocaleString()} sins**. Join again.`, ephemeral: true });
  }

  await economy.removeFunds(interaction.user.id, wager, 'FAFO wager');
  await ensureStats(interaction.user.id);

  freshSession.players.set(interaction.user.id, {
    userId: interaction.user.id, username: interaction.user.username,
    wager, pot: wager, status: 'active', streak: 0,
  });

  await refreshLobbyEmbed(freshSession);
  await interaction.followUp({ content: `<:checkmark:1495666088417956002> You're in — **${wager.toLocaleString()} sins** wagered. Watch your DMs when the game starts.`, ephemeral: true });
}

async function handleCancel(interaction) {
  const channelId = interaction.customId.split(':')[1];
  const session = activeSessions.get(channelId);
  if (!session) return interaction.reply({ content: '<:wrong:1495666083594502174> No active FAFO session here.', ephemeral: true });
  if (interaction.user.id !== session.hostId && !isHost(interaction.member)) {
    return interaction.reply({ content: '<:wrong:1495666083594502174> Only the host or admins can cancel.', ephemeral: true });
  }
  if (session.phase !== 'lobby') {
    return interaction.reply({ content: '<:wrong:1495666083594502174> Can\'t cancel — the session already started.', ephemeral: true });
  }

  clearTimeout(session.lobbyTimer);
  for (const p of session.players.values()) {
    await economy.addFunds(p.userId, p.wager, 'FAFO cancelled — refund').catch(() => {});
  }
  activeSessions.delete(channelId);
  await session.lobbyMsg?.edit({ components: [] }).catch(() => {});
  return interaction.reply(`<:checkmark:1495666088417956002> FAFO session cancelled. **${session.players.size}** player(s) refunded.`);
}

async function handleStartEarly(interaction) {
  const channelId = interaction.customId.split(':')[1];
  const session = activeSessions.get(channelId);
  if (!session || session.phase !== 'lobby') return interaction.reply({ content: '<:wrong:1495666083594502174> Nothing to start.', ephemeral: true });
  if (interaction.user.id !== session.hostId && !isHost(interaction.member)) {
    return interaction.reply({ content: '<:wrong:1495666083594502174> Only the host or admins can start early.', ephemeral: true });
  }
  if (session.players.size < CONFIG.minPlayers) {
    return interaction.reply({ content: `<:wrong:1495666083594502174> Need at least **${CONFIG.minPlayers}** players.`, ephemeral: true });
  }
  clearTimeout(session.lobbyTimer);
  await interaction.reply({ content: '<:checkmark:1495666088417956002> Starting now!', ephemeral: true });
  await beginRounds(interaction.channel);
}

// ── Round loop ────────────────────────────────────────────────────────────
async function beginRounds(channel) {
  const session = activeSessions.get(channel.id);
  if (!session || session.phase !== 'lobby') return;

  if (session.players.size < CONFIG.minPlayers) {
    for (const p of session.players.values()) {
      await economy.addFunds(p.userId, p.wager, 'FAFO cancelled — not enough players').catch(() => {});
    }
    activeSessions.delete(channel.id);
    await session.lobbyMsg?.edit({ components: [] }).catch(() => {});
    await channel.send(`<:wrong:1495666083594502174> Not enough players joined FAFO (need ${CONFIG.minPlayers}). Everyone refunded.`);
    return;
  }

  session.phase = 'playing';
  await session.lobbyMsg?.edit({ components: [] }).catch(() => {});
  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#8B0000')
      .setTitle('<a:BlowUpBoom:1544848366377246760> THE ARENA IS SEALED')
      .setDescription(`**${session.players.size}** players locked in. Checking your DMs...\n\n*Financial regret begins now.*`)
  ] });

  await runRound(channel, session);
}

async function runRound(channel, session) {
  session.round++;
  const cfg = getRoundConfig(session.round);
  const active = [...session.players.values()].filter(p => p.status === 'active');

  if (!cfg || active.length === 0) return endSession(channel, session);

  // Global event roll (round 2+)
  if (CONFIG.globalEventsEnabled && session.round > 1 && Math.random() < CONFIG.globalEventChance) {
    await runGlobalEvent(channel, session, active);
  }

  const decisionTag = `fafo_r${session.round}_${session.channelId}_${Date.now()}`;
  const stakeLines = active.map(p => {
    const nextPot = Math.floor(p.wager * cfg.multiplier);
    return `<@${p.userId}> — **${p.pot.toLocaleString()}** → **${nextPot.toLocaleString()}** sins if they survive`;
  });

  const embed = new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle(`<a:BlowUpBoom:1544848366377246760> ROUND ${session.round}`)
    .setDescription(
      `<a:skull:1544848392428064888> **Find out chance:** ${Math.round(cfg.findOutChance * 100)}%\n` +
      (cfg.findOutChance >= 0.5 ? `*${M.pick(M.HIGH_RISK_WARNING_LINES)}*\n` : '') +
      `\n${stakeLines.join('\n')}\n\n` +
      `Everyone still in, choose now — **${Math.floor(CONFIG.roundDecisionMs / 1000)}s**.`
    )
    .setFooter({ text: 'Your choice stays hidden from everyone else until the round resolves' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fafo_decide:${decisionTag}:cash`).setLabel('Cash Out').setEmoji('<a:cashout:1544848377009803274>').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fafo_decide:${decisionTag}:fuckaround`).setLabel('Fuck Around').setEmoji('<a:BlowUpBoom:1544848366377246760>').setStyle(ButtonStyle.Danger),
  );

  const roundMsg = await channel.send({ embeds: [embed], components: [row] });
  const pending = new Set(active.map(p => p.userId));
  const decisions = new Map();

  await new Promise((resolve) => {
    const collector = roundMsg.createMessageComponentCollector({
      filter: (i) => i.customId.startsWith(`fafo_decide:${decisionTag}:`),
      time: CONFIG.roundDecisionMs,
    });

    collector.on('collect', async (btn) => {
      if (!pending.has(btn.user.id)) {
        return btn.reply({ content: decisions.has(btn.user.id) ? '<a:Warning:1497476844860215366> You already decided this round.' : '<:wrong:1495666083594502174> You\'re not in this round.', ephemeral: true }).catch(() => {});
      }
      const choice = btn.customId.split(':')[2];
      decisions.set(btn.user.id, choice);
      pending.delete(btn.user.id);
      await btn.reply({ content: choice === 'cash' ? '<a:cashout:1544848377009803274> Locked in: Cash Out.' : '<a:BlowUpBoom:1544848366377246760> Locked in: Fuck Around.', ephemeral: true }).catch(() => {});
      if (pending.size === 0) collector.stop('all_decided');
    });

    collector.on('end', () => {
      for (const uid of pending) decisions.set(uid, 'cash'); // no response = safe auto cash-out
      roundMsg.edit({ components: [] }).catch(() => {});
      resolve();
    });
  });

  await resolveRound(channel, session, cfg, active, decisions);
}

async function resolveRound(channel, session, cfg, active, decisions) {
  const cashLines = [], survLines = [], lostLines = [];

  for (const p of active) {
    const choice = decisions.get(p.userId);
    if (choice === 'cash') {
      p.status = 'cashed';
      await economy.addFunds(p.userId, p.pot, 'FAFO cash out').catch(() => {});
      cashLines.push(`<a:chicken:1544848378741915770> <@${p.userId}> ${M.pick(M.CASH_OUT_LINES)} **(+${p.pot.toLocaleString()} sins)**`);
      await db.run('UPDATE fafo_stats SET chicken_outs = chicken_outs + 1, total_sins_won = total_sins_won + ?, biggest_cash_out = GREATEST(biggest_cash_out, ?) WHERE user_id = ?', [p.pot, p.pot, p.userId]).catch(() => {});
      continue;
    }

    // Fuck around
    await db.run('UPDATE fafo_stats SET fuck_arounds = fuck_arounds + 1 WHERE user_id = ?', [p.userId]).catch(() => {});
    const survived = Math.random() >= cfg.findOutChance;
    if (survived) {
      p.pot = Math.floor(p.wager * cfg.multiplier);
      p.streak++;
      survLines.push(`<a:devil:1544848380805513266> <@${p.userId}> FUCKED AROUND... ${M.pick(M.SURVIVE_LINES)} **(pot: ${p.pot.toLocaleString()})**`);
      await db.run('UPDATE fafo_stats SET highest_round = GREATEST(highest_round, ?), best_streak = GREATEST(best_streak, ?) WHERE user_id = ?', [session.round, p.streak, p.userId]).catch(() => {});
    } else {
      p.status = 'lost';
      const regretAmt = await awardRegret(p.userId, cfg.regretTier, 'fafo', `Found out at round ${session.round}`);
      lostLines.push(`<a:skull:1544848392428064888> <@${p.userId}> ${M.pick(M.FIND_OUT_LINES)} *${M.pick(M.REGRET_LINES)}* **(+${regretAmt} regret)**`);
      await db.run(
        'UPDATE fafo_stats SET find_outs = find_outs + 1, total_sins_lost = total_sins_lost + ?, regrets_earned = regrets_earned + ?, biggest_pot_lost = GREATEST(biggest_pot_lost, ?), biggest_wager_lost = GREATEST(biggest_wager_lost, ?) WHERE user_id = ?',
        [p.wager, regretAmt, p.pot, p.wager, p.userId]
      ).catch(() => {});
    }
  }

  const embed = new EmbedBuilder().setColor('#8B0000').setTitle(`<a:BlowUpBoom:1544848366377246760> ROUND ${session.round} RESULTS`);
  if (cashLines.length) embed.addFields({ name: '<a:cashout:1544848377009803274> Cashed Out', value: cashLines.join('\n'), inline: false });
  if (survLines.length) embed.addFields({ name: '<a:BlowUpBoom:1544848366377246760> Survived', value: survLines.join('\n'), inline: false });
  if (lostLines.length) embed.addFields({ name: '<a:skull:1544848392428064888> Found Out', value: lostLines.join('\n'), inline: false });
  await channel.send({ embeds: [embed] });

  const stillActive = [...session.players.values()].filter(p => p.status === 'active');
  for (const p of session.players.values()) await db.run('UPDATE fafo_stats SET games_played = games_played + 1 WHERE user_id = ?', [p.userId]).catch(() => {});

  if (stillActive.length === 0) return endSession(channel, session);
  if (stillActive.length === 1 && FINAL_FAFO.enabled) return runFinalFafo(channel, session, stillActive[0]);
  if (session.round >= ROUNDS.length) return endSession(channel, session);

  await runRound(channel, session);
}

// ── Final FAFO ────────────────────────────────────────────────────────────
async function runFinalFafo(channel, session, player) {
  const jackpot = Math.min(FINAL_FAFO.maxJackpot, Math.floor(player.pot * FINAL_FAFO.jackpotMultiplier));
  await db.run('UPDATE fafo_stats SET final_fafo_attempts = final_fafo_attempts + 1 WHERE user_id = ?', [player.userId]).catch(() => {});

  const decisionTag = `fafo_final_${session.channelId}_${Date.now()}`;
  const embed = new EmbedBuilder().setColor('#FFD700')
    .setTitle('<a:crowned:1544882007652438077> LAST IDIOT STANDING')
    .setDescription(
      `<@${player.userId}>, everyone else had enough sense to leave.\n\n` +
      `*${M.pick(M.FINAL_ROUND_LINES)}*\n\n` +
      `<a:SINS:1522338223613804724> **Current pot:** ${player.pot.toLocaleString()} sins\n` +
      `<a:crowned:1544882007652438077> **Final jackpot:** ${jackpot.toLocaleString()} sins\n` +
      `<a:skull:1544848392428064888> **Find out chance:** ${Math.round(FINAL_FAFO.findOutChance * 100)}%\n\n` +
      `**${Math.floor(CONFIG.roundDecisionMs / 1000)}s** to decide, <@${player.userId}>.`
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fafo_decide:${decisionTag}:cash`).setLabel(`Take ${player.pot.toLocaleString()}`).setEmoji('<a:cashout:1544848377009803274>').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fafo_decide:${decisionTag}:fuckaround`).setLabel('Final Fuck Around').setEmoji('<a:BlowUpBoom:1544848366377246760>').setStyle(ButtonStyle.Danger),
  );
  const finalMsg = await channel.send({ embeds: [embed], components: [row] });

  let choice = 'cash';
  await new Promise((resolve) => {
    const collector = finalMsg.createMessageComponentCollector({
      filter: (i) => i.customId.startsWith(`fafo_decide:${decisionTag}:`),
      time: CONFIG.roundDecisionMs,
    });
    collector.on('collect', async (btn) => {
      if (btn.user.id !== player.userId) {
        return btn.reply({ content: '<:wrong:1495666083594502174> This isn\'t your decision to make.', ephemeral: true }).catch(() => {});
      }
      choice = btn.customId.split(':')[2];
      await btn.reply({ content: choice === 'cash' ? '<a:cashout:1544848377009803274> Taking the money.' : '<a:BlowUpBoom:1544848366377246760> Going for the jackpot.', ephemeral: true }).catch(() => {});
      collector.stop('decided');
    });
    collector.on('end', () => { finalMsg.edit({ components: [] }).catch(() => {}); resolve(); });
  });

  if (choice === 'cash') {
    await economy.addFunds(player.userId, player.pot, 'FAFO Final cash out').catch(() => {});
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FFD700').setTitle('<a:cashout:1544848377009803274> TOOK THE MONEY')
        .setDescription(`<@${player.userId}> took the **${player.pot.toLocaleString()} sins** and walked. ${M.pick(M.CASH_OUT_LINES)}`)
    ]});
  } else {
    const survived = Math.random() >= FINAL_FAFO.findOutChance;
    if (survived) {
      await economy.addFunds(player.userId, jackpot, 'FAFO Final win').catch(() => {});
      await db.run('UPDATE fafo_stats SET final_fafo_wins = final_fafo_wins + 1, total_sins_won = total_sins_won + ? WHERE user_id = ?', [jackpot, player.userId]).catch(() => {});
      await channel.send({ embeds: [
        new EmbedBuilder().setColor('#FFD700').setTitle('<a:crowned:1544882007652438077> FINAL FAFO — WINNER')
          .setDescription(`<@${player.userId}> WON THE JACKPOT.\n\n**+${jackpot.toLocaleString()} sins**\n\n*${M.pick(M.WINNER_LINES)}*`)
      ]});
    } else {
      const regretAmt = await awardRegret(player.userId, FINAL_FAFO.regretTier, 'fafo', 'Lost the Final FAFO');
      await db.run('UPDATE fafo_stats SET find_outs = find_outs + 1, total_sins_lost = total_sins_lost + ?, regrets_earned = regrets_earned + ? WHERE user_id = ?', [player.wager, regretAmt, player.userId]).catch(() => {});
      await channel.send({ embeds: [
        new EmbedBuilder().setColor('#4B0082').setTitle('<a:skull:1544848392428064888> FINAL FAFO — FOUND OUT')
          .setDescription(`<@${player.userId}> risked it all and lost the jackpot.\n\n*${M.pick(M.REGRET_LINES)}* **(+${regretAmt} regret)**`)
      ]});
    }
  }

  await endSession(channel, session);
}

// ── Global events (light touch — pot modifiers only, never real balance) ──
async function runGlobalEvent(channel, session, active) {
  const events = [
    {
      title: '<a:siren:1544848390632902666> THE IRS HAS ENTERED THE CHAT',
      apply: () => { for (const p of active) p.pot = Math.floor(p.pot * 0.9); },
      desc: 'All active pots just took a 10% haircut.',
    },
    {
      title: '<a:crowned:1544882007652438077> THE PRINCESS IS FEELING GENEROUS',
      apply: () => { for (const p of active) p.pot = Math.floor(p.pot * 1.2); },
      desc: 'All active pots increased by 20%.',
    },
    {
      title: '<a:moneybag:1479268556687540345> STIMULUS CHECK',
      apply: () => { for (const p of active) p.pot += 100; },
      desc: 'Everyone still active gets a small pot bump.',
    },
  ];
  const event = events[Math.floor(Math.random() * events.length)];
  event.apply();
  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#9D00FF').setTitle(event.title).setDescription(event.desc)
  ]});
}

async function endSession(channel, session) {
  activeSessions.delete(channel.id);
  const cashed = [...session.players.values()].filter(p => p.status === 'cashed').length;
  const lost = [...session.players.values()].filter(p => p.status === 'lost').length;
  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#8B0000')
      .setTitle('<a:BlowUpBoom:1544848366377246760> FAFO SESSION OVER')
      .setDescription(`**${session.players.size}** played. **${cashed}** cashed out. **${lost}** found out.\n\n*Regrets have been recorded. They are permanent.*`)
  ]});
}

// ── Stats & leaderboard ─────────────────────────────────────────────────────
async function showStats(message, targetUser) {
  const target = targetUser || message.author;
  await ensureStats(target.id);
  const s = await db.get('SELECT * FROM fafo_stats WHERE user_id = ?', [target.id]);
  const profit = Number(s.total_sins_won) - Number(s.total_sins_lost);
  return message.reply({ embeds: [
    new EmbedBuilder().setColor('#8B0000')
      .setTitle(`<a:BlowUpBoom:1544848366377246760> ${target.username.toUpperCase()}'S POOR DECISIONS`)
      .addFields(
        { name: '<a:SINS:1522338223613804724> FAFO Profit', value: `${profit >= 0 ? '+' : ''}${profit.toLocaleString()} sins`, inline: true },
        { name: '<a:skull:1544848392428064888> Actual Sins Lost', value: `${Number(s.total_sins_lost).toLocaleString()}`, inline: true },
        { name: '<:purp_caveira50:1495665632845369354> Regrets Earned', value: `${s.regrets_earned}`, inline: true },
        { name: '<a:chicken:1544848378741915770> Chicken Outs', value: `${s.chicken_outs}`, inline: true },
        { name: '<a:BlowUpBoom:1544848366377246760> Fuck Arounds', value: `${s.fuck_arounds}`, inline: true },
        { name: '<a:skull:1544848392428064888> Find Outs', value: `${s.find_outs}`, inline: true },
        { name: '<a:fire:1544848389781459085> Highest Round', value: `${s.highest_round}`, inline: true },
        { name: '<a:moneybag:1479268556687540345> Biggest Cash Out', value: `${Number(s.biggest_cash_out).toLocaleString()}`, inline: true },
        { name: '🪦 Biggest Bag Fumbled', value: `${Number(s.biggest_pot_lost).toLocaleString()}`, inline: true },
      )
      .setFooter({ text: `${s.games_played} games played • ${s.final_fafo_wins}/${s.final_fafo_attempts} Final FAFO wins` })
  ]});
}

async function showLeaderboard(message) {
  const rows = await db.all('SELECT user_id, total_sins_won - total_sins_lost AS profit FROM fafo_stats ORDER BY profit DESC LIMIT 10');
  if (!rows.length) return message.reply('<:wrong:1495666083594502174> Nobody has played FAFO yet.');
  const lines = rows.map((r, i) => `${['🥇','🥈','🥉'][i] || `**${i+1}.**`} <@${r.user_id}> — **${Number(r.profit).toLocaleString()} sins** profit`);
  return message.reply({ embeds: [
    new EmbedBuilder().setColor('#FFD700').setTitle('<a:BlowUpBoom:1544848366377246760> FAFO Leaderboard — Biggest Profit').setDescription(lines.join('\n'))
  ]});
}

module.exports = {
  name: 'fafo',
  activeSessions,

  async handleCommand(message, args, command) {
    if (command !== 'fafo') return;
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'stats') {
      const target = message.mentions?.users?.first() || message.author;
      return showStats(message, target);
    }
    if (sub === 'leaderboard') return showLeaderboard(message);
    if (sub === 'cancel') return; // handled via button; prefix cancel not critical for v1

    if (!isHost(message.member)) return message.reply(`<:wrong:1495666083594502174> You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start FAFO.`);
    if (activeSessions.has(message.channel.id)) return message.reply('<:wrong:1495666083594502174> A FAFO session is already running here.');
    await startLobby(message.channel, message.author.id, message.author.username);
  },

  async handleSlash(interaction, commandName) {
    if (commandName !== 'fafo') return;
    const sub = interaction.options.getSubcommand();
    if (sub === 'stats') {
      const target = interaction.options.getUser('user') || interaction.user;
      const fakeMsg = { author: interaction.user, reply: (d) => interaction.reply(d) };
      return showStats(fakeMsg, target);
    }
    if (sub === 'leaderboard') {
      const fakeMsg = { reply: (d) => interaction.reply(d) };
      return showLeaderboard(fakeMsg);
    }
    if (sub === 'start') {
      if (!isHost(interaction.member)) return interaction.reply({ content: `<:wrong:1495666083594502174> You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start FAFO.`, ephemeral: true });
      if (activeSessions.has(interaction.channel.id)) return interaction.reply({ content: '<:wrong:1495666083594502174> A FAFO session is already running here.', ephemeral: true });
      await interaction.reply({ content: '<:checkmark:1495666088417956002> Opening the arena...', ephemeral: true });
      await startLobby(interaction.channel, interaction.user.id, interaction.user.username);
    }
  },

  // ── Button routing (called from index.js's global interaction listener) ──
  // Note: fafo_decide buttons are handled by each round message's own
  // collector inline (in runRound/runFinalFafo), not routed here.
  async handleButton(interaction) {
    if (interaction.customId.startsWith('fafo_join:')) return handleJoin(interaction);
    if (interaction.customId.startsWith('fafo_cancel:')) return handleCancel(interaction);
    if (interaction.customId.startsWith('fafo_startearly:')) return handleStartEarly(interaction);
  },

  // Universal /cancel integration
  async cancelViaUniversal(channel, userId, member) {
    const session = activeSessions.get(channel.id);
    if (!session) return null;
    if (userId !== session.hostId && !isHost(member)) return { blocked: true };
    if (session.phase !== 'lobby') return { blocked: true, reason: 'running' };
    clearTimeout(session.lobbyTimer);
    for (const p of session.players.values()) {
      await economy.addFunds(p.userId, p.wager, 'FAFO cancelled — refund').catch(() => {});
    }
    activeSessions.delete(channel.id);
    await session.lobbyMsg?.edit({ components: [] }).catch(() => {});
    return { blocked: false, refunded: session.players.size };
  },
};
