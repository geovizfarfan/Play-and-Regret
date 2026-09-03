// ─────────────────────────────────────────────────────────────────────────────
// Walkin Red Flag — every round, 2-4 random players get accused of a fictional
// red-flag scenario. Everyone else votes who to flag; the accused get a chance
// to defend themselves. 3 flags = eliminated. Last two face a Final Background
// Check. Free to join; host can optionally set a sins prize for the winner.
//
// Same design as FAFO: round decisions happen via ONE public message, not DMs —
// ephemeral confirmations keep individual choices hidden without needing to DM.
// ─────────────────────────────────────────────────────────────────────────────
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { db, economy } = require('../../utils/database');
const { awardRegret } = require('../../utils/regret');
const { ABILITIES, ABILITY_KEYS, grantRandomAbility } = require('./abilities');
const S = require('./scenarios');

const activeGames = new Map(); // channelId -> game

const CONFIG = {
  eliminationThreshold: 3,
  lobbyDurationMs: 90 * 1000,
  roundDecisionMs: 60 * 1000,
  minPlayers: 3,
  maxPlayers: 12,
  interRoundDelayMs: 8 * 1000,
};

const ALLEGATIONS = [
  'has a folder of screenshots "just in case."',
  'once texted an ex "wyd" at 2am during this game.',
  'has three different group chats about the same argument.',
  'has never once said "I was wrong" unprompted.',
  'still has their situationship\'s location on.',
];

function isHost(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}
function canCancel(member, hostId, userId) {
  if (userId === hostId) return true;
  return isHost(member);
}
async function ensureStats(userId) {
  await db.run('INSERT INTO redflag_stats (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [userId]);
}
function newPlayer(userId, username) {
  return {
    userId, username, flags: 0, abilities: [],
    unoShield: false, ndaShield: false, doubleFlagNext: false, immuneNextRound: false,
    eliminated: false,
  };
}

// ── Lobby ───────────────────────────────────────────────────────────────────
async function startLobby(channel, hostId, hostName, prize) {
  if (activeGames.has(channel.id)) return null;

  const game = {
    channelId: channel.id, hostId, hostName, prize: prize || 0,
    phase: 'lobby', round: 0,
    players: new Map(), lobbyMsg: null, lobbyTimer: null,
  };
  activeGames.set(channel.id, game);

  const embed = new EmbedBuilder()
    .setColor('#CC0000')
    .setTitle('<a:redflag:1545091812924858469> WALKIN RED FLAG')
    .setDescription(
      `<@${hostId}> opened a Walkin Red Flag.\n\n` +
      `Every round, someone gets accused. Vote, defend, collect abilities, survive.\n` +
      `**${CONFIG.eliminationThreshold} red flags and you're back on the market.**\n\n` +
      (game.prize > 0 ? `<a:SINS:1522338223613804724> Prize: **${game.prize.toLocaleString()} sins** to the winner\n\n` : 'Free to play — bragging rights only.\n\n') +
      `<a:RojasClock:1511506715453947904> Lobby closes in **${Math.floor(CONFIG.lobbyDurationMs / 1000)}s**`
    )
    .addFields({ name: '<:member:1495666085121491024> Joined', value: '**0** players' })
    .setFooter({ text: 'Use !cancel to end this early' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rf_join:${channel.id}`).setLabel('Join').setEmoji('<a:redflag:1545091812924858469>').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rf_viewmembers:${channel.id}`).setLabel('View Members').setEmoji('<:member:1495666085121491024>').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rf_start:${channel.id}`).setLabel('Start Game').setEmoji('<a:CheckCheckmarkSticker:1532595713010040972>').setStyle(ButtonStyle.Success),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  game.lobbyMsg = msg;
  game.lobbyTimer = setTimeout(() => beginGame(channel).catch(() => {}), CONFIG.lobbyDurationMs);
  return game;
}

async function refreshLobbyEmbed(game) {
  if (!game.lobbyMsg?.embeds?.[0]) return;
  const updated = EmbedBuilder.from(game.lobbyMsg.embeds[0]).spliceFields(0, 1, {
    name: '<:member:1495666085121491024> Joined',
    value: `**${game.players.size}** player${game.players.size !== 1 ? 's' : ''}`,
  });
  await game.lobbyMsg.edit({ embeds: [updated] }).catch(() => {});
}

async function handleLobbyButton(interaction) {
  const [action, channelId] = interaction.customId.split(':');
  const game = activeGames.get(channelId);
  if (!game) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Walkin Red Flag here.', ephemeral: true });

  if (action === 'rf_join') {
    if (game.phase !== 'lobby') return interaction.reply({ content: '<:wrong:1495666083594502174> This game already started.', ephemeral: true });
    if (game.players.has(interaction.user.id)) return interaction.reply({ content: '<a:Warning:1497476844860215366> You already joined.', ephemeral: true });
    if (game.players.size >= CONFIG.maxPlayers) return interaction.reply({ content: '<:wrong:1495666083594502174> Lobby\'s full.', ephemeral: true });
    game.players.set(interaction.user.id, newPlayer(interaction.user.id, interaction.user.username));
    await ensureStats(interaction.user.id);
    await refreshLobbyEmbed(game);
    return interaction.reply({ content: '<:checkmark:1495666088417956002> You\'re in. Try not to collect flags.', ephemeral: true });
  }

  if (action === 'rf_viewmembers') {
    const list = game.players.size ? [...game.players.values()].map((p, i) => `**${i + 1}.** ${p.username}`).join('\n') : 'Nobody yet.';
    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#CC0000').setTitle('<:member:1495666085121491024> Joined').setDescription(list)], ephemeral: true });
  }

  if (action === 'rf_start') {
    if (interaction.user.id !== game.hostId && !isHost(interaction.member)) {
      return interaction.reply({ content: '<:wrong:1495666083594502174> Only the host or admins can start this.', ephemeral: true });
    }
    if (game.phase !== 'lobby') return interaction.reply({ content: '<:wrong:1495666083594502174> Already started.', ephemeral: true });
    if (game.players.size < CONFIG.minPlayers) return interaction.reply({ content: `<:wrong:1495666083594502174> Need at least ${CONFIG.minPlayers} players.`, ephemeral: true });
    clearTimeout(game.lobbyTimer);
    await interaction.reply({ content: '<:checkmark:1495666088417956002> Starting!', ephemeral: true });
    await beginGame(interaction.channel);
  }
}

async function beginGame(channel) {
  const game = activeGames.get(channel.id);
  if (!game || game.phase !== 'lobby') return;

  if (game.players.size < CONFIG.minPlayers) {
    activeGames.delete(channel.id);
    await game.lobbyMsg?.edit({ components: [] }).catch(() => {});
    await channel.send(`<:wrong:1495666083594502174> Not enough players joined Walkin Red Flag (need ${CONFIG.minPlayers}).`);
    return;
  }

  game.phase = 'playing';
  await game.lobbyMsg?.edit({ components: [] }).catch(() => {});
  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#CC0000').setTitle('<a:redflag:1545091812924858469> THE RUMBLE BEGINS')
      .setDescription(`**${game.players.size}** players. Everyone's got something to hide.`)
  ] });
  await runRound(channel, game);
}

// ── Round loop ────────────────────────────────────────────────────────────
function activePlayers(game) {
  return [...game.players.values()].filter(p => !p.eliminated);
}

async function runRound(channel, game) {
  const active = activePlayers(game);
  if (active.length <= 2) return runFinale(channel, game);

  game.round++;
  const eligible = active.filter(p => !p.immuneNextRound);
  const pool = eligible.length >= 2 ? eligible : active;
  const suspectCount = Math.min(4, Math.max(2, Math.floor(pool.length / 2)));
  const suspects = [...pool].sort(() => Math.random() - 0.5).slice(0, suspectCount);
  for (const p of active) p.immuneNextRound = false;

  // Grant a random ability to a random active player (round 2+)
  let abilityLine = '';
  if (game.round > 1) {
    const luckyPlayer = active[Math.floor(Math.random() * active.length)];
    const key = grantRandomAbility(game, luckyPlayer.userId);
    if (key) abilityLine = `\n${ABILITIES[key].emoji} **${luckyPlayer.username}** found a **${ABILITIES[key].name}** card!\n`;
  }

  const scenario = S.pick(S.SCENARIOS);
  const roundTag = `rf_r${game.round}_${channel.id}_${Date.now()}`;
  const votes = new Map();     // voterId -> suspectId
  const defenses = new Map();  // suspectId -> defense key
  const removedSuspects = new Set();

  const suspectMentions = suspects.map(s => `<@${s.userId}>`).join(', ');
  const embed = new EmbedBuilder()
    .setColor('#CC0000')
    .setTitle('<a:redflag:1545091812924858469> RED FLAG ALERT')
    .setDescription(
      `Someone here allegedly...\n*"${scenario}"*\n\n` +
      `**Possible suspects:** ${suspectMentions}${abilityLine}\n\n` +
      `Vote who to flag below. Suspects, defend yourselves. **${Math.floor(CONFIG.roundDecisionMs / 1000)}s.**`
    );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`rf_vote:${roundTag}`).setPlaceholder('Flag a suspect...')
      .addOptions(suspects.map(s => ({ label: s.username, value: s.userId })))
  );
  const defendRow = new ActionRowBuilder().addComponents(
    ...suspects.map(s => new ButtonBuilder().setCustomId(`rf_defend:${roundTag}:${s.userId}`).setLabel(`${s.username}: Defend`).setStyle(ButtonStyle.Secondary))
  );
  const abilityRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rf_useability:${roundTag}`).setLabel('Use Ability').setEmoji('<a:ability:1545092941666721954>').setStyle(ButtonStyle.Primary)
  );

  const roundMsg = await channel.send({ embeds: [embed], components: [selectRow, defendRow, abilityRow] });

  await new Promise((resolve) => {
    const collector = roundMsg.createMessageComponentCollector({ time: CONFIG.roundDecisionMs });

    collector.on('collect', async (i) => {
      try {
        // Voting
        if (i.customId === `rf_vote:${roundTag}`) {
          const suspectId = i.values[0];
          if (i.user.id === suspectId) return i.reply({ content: '<:wrong:1495666083594502174> Can\'t flag yourself.', ephemeral: true });
          if (!game.players.has(i.user.id) || game.players.get(i.user.id).eliminated) return i.reply({ content: '<:wrong:1495666083594502174> You\'re not in this game.', ephemeral: true });
          const voter = game.players.get(i.user.id);
          votes.set(i.user.id, { target: suspectId, weight: voter.doubleFlagNext ? 2 : 1 });
          if (voter.doubleFlagNext) voter.doubleFlagNext = false;
          voter.accusedCount = (voter.accusedCount || 0) + 1;
          return i.reply({ content: `<:checkmark:1495666088417956002> Flagged **${game.players.get(suspectId)?.username}**.`, ephemeral: true });
        }

        // Defend
        if (i.customId.startsWith(`rf_defend:${roundTag}:`)) {
          const suspectId = i.customId.split(':')[2];
          if (i.user.id !== suspectId) return i.reply({ content: '<:wrong:1495666083594502174> Not your accusation to defend.', ephemeral: true });
          if (defenses.has(suspectId)) return i.reply({ content: '<a:Warning:1497476844860215366> Already defended yourself this round.', ephemeral: true });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rf_def:${roundTag}:innocent`).setLabel("I'm Innocent").setEmoji('<:innocent:1545091807917113454>').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`rf_def:${roundTag}:receipts`).setLabel('Show Receipts').setEmoji('<a:receipt:1545092059587940484>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rf_def:${roundTag}:unoreverse`).setLabel('Uno Reverse').setEmoji('<a:reverse:1545091814770348145>').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`rf_def:${roundTag}:and`).setLabel('And?').setEmoji('<a:yeah_and:1545091816674689044>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rf_def:${roundTag}:wrongperson`).setLabel('Wrong Person').setEmoji('<a:wrongperson:1545091819136884746>').setStyle(ButtonStyle.Secondary),
          );
          return i.reply({ content: 'Pick your defense:', components: [row], ephemeral: true });
        }

        // Defense choice
        if (i.customId.startsWith(`rf_def:${roundTag}:`)) {
          const choice = i.customId.split(':')[2];
          defenses.set(i.user.id, choice);
          if (choice === 'wrongperson' && Math.random() < 0.2) removedSuspects.add(i.user.id);
          if (choice === 'receipts' && Math.random() < 0.15) removedSuspects.add(i.user.id);
          return i.update({ content: `Locked in: **${choice}**.`, components: [] });
        }

        // Use ability
        if (i.customId === `rf_useability:${roundTag}`) {
          const p = game.players.get(i.user.id);
          if (!p || p.eliminated) return i.reply({ content: '<:wrong:1495666083594502174> You\'re not in this game.', ephemeral: true });
          if (!p.abilities.length) return i.reply({ content: '<a:Warning:1497476844860215366> You don\'t have any abilities.', ephemeral: true });
          const row = new ActionRowBuilder().addComponents(
            ...p.abilities.slice(0, 5).map((key, idx) =>
              new ButtonBuilder().setCustomId(`rf_ability:${roundTag}:${key}:${idx}`).setLabel(ABILITIES[key].name).setEmoji(ABILITIES[key].emoji).setStyle(ButtonStyle.Primary)
            )
          );
          return i.reply({ content: 'Use which ability?', components: [row], ephemeral: true });
        }

        // Ability activation
        if (i.customId.startsWith(`rf_ability:${roundTag}:`)) {
          const [, , key, idxStr] = i.customId.split(':');
          const p = game.players.get(i.user.id);
          const idx = p.abilities.indexOf(key);
          if (idx === -1) return i.update({ content: 'Already used.', components: [] });
          p.abilities.splice(idx, 1);

          if (key === 'green_flag') {
            p.flags = Math.max(0, p.flags - 1);
            await i.update({ content: `<a:greenflag:1545091809473069066> Used Green Flag — down to **${p.flags}** flags.`, components: [] });
          } else if (key === 'uno_reverse') {
            p.unoShield = true;
            await i.update({ content: '<a:reverse:1545091814770348145> Uno Reverse armed — your next flag redirects to someone else.', components: [] });
          } else if (key === 'nda') {
            p.ndaShield = true;
            await i.update({ content: '🤐 NDA active — nobody can Receipts you now.', components: [] });
          } else if (key === 'double_flag') {
            p.doubleFlagNext = true;
            await i.update({ content: '<a:redflag:1545091812924858469> Your next vote will count twice.', components: [] });
          } else if (key === 'run') {
            if (suspects.some(s => s.userId === i.user.id)) {
              removedSuspects.add(i.user.id);
              await i.update({ content: '<a:runn:1545091905027707032> You\'re out of this round\'s accusation pool.', components: [] });
            } else {
              p.abilities.push(key); // wasn't a suspect, refund the card
              await i.update({ content: '<:wrong:1495666083594502174> You\'re not a suspect this round.', components: [] });
            }
          } else if (key === 'background_check') {
            const tally = {};
            for (const v of votes.values()) tally[v.target] = (tally[v.target] || 0) + v.weight;
            const leaderId = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
            await i.update({ content: leaderId ? `<a:eyes:1511507447704191026> Current leader: **${game.players.get(leaderId)?.username}**` : '<a:eyes:1511507447704191026> No votes yet.', components: [] });
          } else if (key === 'receipts') {
            const others = suspects.filter(s => s.userId !== i.user.id);
            const target = others[Math.floor(Math.random() * others.length)];
            if (target && game.players.get(target.userId)?.ndaShield) {
              await i.update({ content: `🤐 **${target.username}** has an NDA — Receipts blocked.`, components: [] });
            } else {
              const theirVote = [...votes.entries()].find(([voterId]) => voterId === target?.userId);
              const votedFor = theirVote ? game.players.get(theirVote[1].target)?.username : 'nobody yet';
              await i.update({ content: `<a:receipt:1545092059587940484> **${target?.username}** flagged: **${votedFor}**`, components: [] });
            }
          }
        }
      } catch (e) { console.error('[redflag round error]', e); }
    });

    collector.on('end', () => { roundMsg.edit({ components: [] }).catch(() => {}); resolve(); });
  });

  await resolveRound(channel, game, suspects, votes, defenses, removedSuspects);
}

async function resolveRound(channel, game, suspects, votes, defenses, removedSuspects) {
  const tally = {};
  for (const s of suspects) tally[s.userId] = 0;
  for (const v of votes.values()) {
    if (removedSuspects.has(v.target)) continue;
    tally[v.target] = (tally[v.target] || 0) + v.weight;
  }

  const validSuspects = suspects.filter(s => !removedSuspects.has(s.userId));
  if (!validSuspects.length) {
    await channel.send({ embeds: [new EmbedBuilder().setColor('#CC0000').setTitle('<a:redflag:1545091812924858469> ROUND RESULT').setDescription('Everyone wriggled out of it. No flag this round.')] });
    setTimeout(() => runRound(channel, game).catch(() => {}), CONFIG.interRoundDelayMs);
    return;
  }

  let leaderId = validSuspects.reduce((a, b) => (tally[b.userId] || 0) > (tally[a.userId] || 0) ? b : a).userId;
  const leader = game.players.get(leaderId);
  const leaderDefense = defenses.get(leaderId);

  const lines = [];
  let flagTarget = leaderId;
  let extraFlag = false;
  let backfired = false;

  // Defense: Uno Reverse — redirect to a random accuser if they were actually the leader
  if (leaderDefense === 'unoreverse') {
    const accusers = [...votes.entries()].filter(([, v]) => v.target === leaderId).map(([voterId]) => voterId);
    if (accusers.length) {
      flagTarget = accusers[Math.floor(Math.random() * accusers.length)];
      lines.push(`<a:reverse:1545091814770348145> **${leader.username}** ${S.pick(S.DEFENSE_LINES.unoreverse)} It worked — the flag goes to **${game.players.get(flagTarget)?.username}** instead.`);
      await bumpStat(leaderId, 'uno_reverses');
      await bumpStat(leaderId, 'successful_defenses');
    } else {
      backfired = true;
      lines.push(`<a:reverse:1545091814770348145> **${leader.username}** ${S.pick(S.DEFENSE_LINES.unoreverse)} Nobody to redirect to — it backfires.`);
      await bumpStat(leaderId, 'failed_defenses');
    }
  } else if (leaderDefense === 'and') {
    // AND?: survive = immunity next round, convicted = extra flag
    lines.push(`<a:yeah_and:1545091816674689044> **${leader.username}** ${S.pick(S.DEFENSE_LINES.and)}`);
    extraFlag = true;
    await bumpStat(leaderId, 'failed_defenses');
  } else if (leaderDefense === 'innocent') {
    lines.push(`<:innocent:1545091807917113454> **${leader.username}** ${S.pick(S.DEFENSE_LINES.innocent)}`);
  } else if (leaderDefense === 'receipts') {
    lines.push(`<a:receipt:1545092059587940484> **${leader.username}** ${S.pick(S.DEFENSE_LINES.receipts)}`);
  } else if (leaderDefense === 'wrongperson') {
    lines.push(`<a:wrongperson:1545091819136884746> **${leader.username}** ${S.pick(S.DEFENSE_LINES.wrongperson)}`);
  }

  // Inventory Uno Reverse shield (checked separately, proactive)
  const flaggedPlayer = game.players.get(flagTarget);
  if (flaggedPlayer?.unoShield) {
    flaggedPlayer.unoShield = false;
    const others = activePlayers(game).filter(p => p.userId !== flagTarget);
    if (others.length) {
      const redirectTo = others[Math.floor(Math.random() * others.length)];
      lines.push(`<a:reverse:1545091814770348145> **${flaggedPlayer.username}**'s Uno Reverse card redirects the flag to **${redirectTo.username}**!`);
      flagTarget = redirectTo.userId;
    }
  }

  lines.push(`\n*${S.pick(S.VOTE_RESULT_LINES)}*`);

  const finalTarget = game.players.get(flagTarget);
  const flagsToAdd = extraFlag ? 2 : 1;
  finalTarget.flags += flagsToAdd;
  await bumpStat(flagTarget, 'red_flags_received');

  lines.push(`\n<a:redflag:1545091812924858469> **${finalTarget.username}** receives ${flagsToAdd > 1 ? `**${flagsToAdd} flags**` : 'a flag'}. Total: **${finalTarget.flags}/${CONFIG.eliminationThreshold}**`);

  // Grant immunity next round to any suspect who defended with AND? and survived (wasn't flagged).
  for (const s of validSuspects) {
    if (s.userId !== flagTarget) {
      if (defenses.get(s.userId) === 'and') s.immuneNextRound = true;
    }
  }

  let eliminatedThisRound = null;
  if (finalTarget.flags >= CONFIG.eliminationThreshold) {
    finalTarget.eliminated = true;
    eliminatedThisRound = finalTarget;
    let tier = 'minor';
    if (backfired) tier = 'severe';
    else if (extraFlag) tier = 'moderate';
    const regretAmt = await awardRegret(finalTarget.userId, tier, 'redflag', `Eliminated round ${game.round}`);
    await bumpStat(finalTarget.userId, 'times_eliminated');
    await db.run('UPDATE redflag_stats SET regrets_earned = regrets_earned + ? WHERE user_id = ?', [regretAmt, finalTarget.userId]).catch(() => {});
    lines.push(`\n<a:skull:1544848392428064888> *${S.pick(S.ELIMINATION_ROASTS)}* **${finalTarget.username}** is eliminated. **+${regretAmt} regret.**`);
  }

  await channel.send({ embeds: [new EmbedBuilder().setColor('#CC0000').setTitle('<a:redflag:1545091812924858469> ROUND RESULT').setDescription(lines.join('\n'))] });

  const remaining = activePlayers(game);
  if (remaining.length <= 2) {
    setTimeout(() => runFinale(channel, game).catch(() => {}), CONFIG.interRoundDelayMs);
  } else {
    setTimeout(() => runRound(channel, game).catch(() => {}), CONFIG.interRoundDelayMs);
  }
}

async function bumpStat(userId, column) {
  await ensureStats(userId);
  await db.run(`UPDATE redflag_stats SET ${column} = ${column} + 1 WHERE user_id = ?`, [userId]).catch(() => {});
}

// ── Finale ────────────────────────────────────────────────────────────────
async function runFinale(channel, game) {
  const finalists = activePlayers(game);
  if (finalists.length < 2) return endGame(channel, game, finalists[0] || null);

  const [a, b] = finalists;
  const allegA = S.pick(ALLEGATIONS);
  const allegB = S.pick(ALLEGATIONS);
  const finaleTag = `rf_finale_${channel.id}_${Date.now()}`;
  const choices = new Map();

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#FFD700').setTitle('<a:redsiren:1545091813805658122> FINAL BACKGROUND CHECK')
      .setDescription(`*${S.pick(S.FINAL_ROUND_LINES)}*\n\n<@${a.userId}> vs <@${b.userId}> — check your private messages below.`)
  ] });

  const makeRow = (target) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rf_finale:${finaleTag}:${target.userId}:expose`).setLabel('Expose').setEmoji('<a:receipt:1545092059587940484>').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rf_finale:${finaleTag}:${target.userId}:defend`).setLabel('Defend').setEmoji('<a:shield:1545091817979117718>').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rf_finale:${finaleTag}:${target.userId}:lie`).setLabel('Lie').setEmoji('<a:lie:1545091811247263916>').setStyle(ButtonStyle.Primary),
  );

  const msgA = await channel.send({ content: `<@${a.userId}> — allegation about **${b.username}**: *"${allegB}"*`, components: [makeRow(a)] });
  const msgB = await channel.send({ content: `<@${b.userId}> — allegation about **${a.username}**: *"${allegA}"*`, components: [makeRow(b)] });

  await new Promise((resolve) => {
    const collectorA = msgA.createMessageComponentCollector({ time: CONFIG.roundDecisionMs, max: 1, filter: i => i.user.id === a.userId });
    const collectorB = msgB.createMessageComponentCollector({ time: CONFIG.roundDecisionMs, max: 1, filter: i => i.user.id === b.userId });
    let done = 0;
    const checkDone = () => { done++; if (done >= 2) resolve(); };

    collectorA.on('collect', async (i) => {
      choices.set(a.userId, i.customId.split(':')[3]);
      await i.update({ content: `Locked in.`, components: [] });
    });
    collectorA.on('end', checkDone);
    collectorB.on('collect', async (i) => {
      choices.set(b.userId, i.customId.split(':')[3]);
      await i.update({ content: `Locked in.`, components: [] });
    });
    collectorB.on('end', checkDone);
  });

  const scoreFor = (choice) => {
    if (choice === 'expose') return 0;
    if (choice === 'defend') return 1;
    if (choice === 'lie') return Math.random() < 0.5 ? 3 : 0; // caught lying or got away with it
    return 2; // no response
  };
  const scoreA = scoreFor(choices.get(a.userId));
  const scoreB = scoreFor(choices.get(b.userId));

  let winner, loser;
  if (scoreA === scoreB) {
    [winner, loser] = Math.random() < 0.5 ? [a, b] : [b, a];
  } else {
    [winner, loser] = scoreA < scoreB ? [a, b] : [b, a];
  }

  loser.eliminated = true;
  const regretAmt = await awardRegret(loser.userId, 'catastrophic', 'redflag', 'Lost the Final Background Check');
  await bumpStat(loser.userId, 'times_eliminated');
  await db.run('UPDATE redflag_stats SET regrets_earned = regrets_earned + ? WHERE user_id = ?', [regretAmt, loser.userId]).catch(() => {});

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#FFD700').setTitle('<a:greenflag:1545091809473069066> CERTIFIED NOT TERRIBLE™')
      .setDescription(`**${winner.username}** wins Walkin Red Flag.\n\n**${loser.username}** was the bigger red flag. **+${regretAmt} regret.**`)
  ] });

  await endGame(channel, game, winner);
}

async function endGame(channel, game, winner) {
  activeGames.delete(channel.id);
  if (winner) {
    await bumpStat(winner.userId, 'games_won');
    if (game.prize > 0) {
      await economy.addFunds(winner.userId, game.prize, 'Walkin Red Flag prize').catch(() => {});
      await channel.send(`<a:SINS:1522338223613804724> **${winner.username}** takes home **${game.prize.toLocaleString()} sins**.`);
    }
  }
  for (const p of game.players.values()) await bumpStat(p.userId, 'games_played');
}

// ── Cancel / status ──────────────────────────────────────────────────────
async function cancelViaUniversal(channel, userId, member) {
  const game = activeGames.get(channel.id);
  if (!game) return null;
  if (!canCancel(member, game.hostId, userId)) return { blocked: true };
  if (game.phase !== 'lobby') return { blocked: true, reason: 'running' };
  clearTimeout(game.lobbyTimer);
  activeGames.delete(channel.id);
  await game.lobbyMsg?.edit({ components: [] }).catch(() => {});
  return { blocked: false };
}

async function showStats(message, targetUser) {
  const target = targetUser || message.author;
  await ensureStats(target.id);
  const s = await db.get('SELECT * FROM redflag_stats WHERE user_id = ?', [target.id]);
  return message.reply({ embeds: [
    new EmbedBuilder().setColor('#CC0000').setTitle(`<a:redflag:1545091812924858469> ${target.username.toUpperCase()}'S RED FLAG RECORD`)
      .addFields(
        { name: '🏆 Wins', value: `${s.games_won}`, inline: true },
        { name: '<a:skull:1544848392428064888> Times Eliminated', value: `${s.times_eliminated}`, inline: true },
        { name: '<a:redflag:1545091812924858469> Flags Received', value: `${s.red_flags_received}`, inline: true },
        { name: '<a:greenflag:1545091809473069066> Green Flags Used', value: `${s.green_flags_used}`, inline: true },
        { name: '<a:reverse:1545091814770348145> Uno Reverses', value: `${s.uno_reverses}`, inline: true },
        { name: '<:purp_caveira50:1495665632845369354> Regrets', value: `${s.regrets_earned}`, inline: true },
      )
      .setFooter({ text: `${s.games_played} games played` })
  ]});
}

module.exports = {
  name: 'redflag',
  activeGames,

  async handleCommand(message, args, command) {
    if (command !== 'redflag') return;
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'stats') {
      const target = message.mentions?.users?.first() || message.author;
      return showStats(message, target);
    }
    if (!isHost(message.member)) return message.reply(`<:wrong:1495666083594502174> You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start Walkin Red Flag.`);
    if (activeGames.has(message.channel.id)) return message.reply('<:wrong:1495666083594502174> Already running here.');
    const prize = parseInt(args[0]) || 0;
    await startLobby(message.channel, message.author.id, message.author.username, prize);
  },

  async handleSlash(interaction, commandName) {
    if (commandName !== 'redflag') return;
    if (!isHost(interaction.member)) return interaction.reply({ content: `<:wrong:1495666083594502174> You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start Walkin Red Flag.`, ephemeral: true });
    if (activeGames.has(interaction.channel.id)) return interaction.reply({ content: '<:wrong:1495666083594502174> Already running here.', ephemeral: true });
    const prize = interaction.options.getInteger('prize') || 0;
    await interaction.reply({ content: '<:checkmark:1495666088417956002> Opening the rumble...', ephemeral: true });
    await startLobby(interaction.channel, interaction.user.id, interaction.user.username, prize);
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith('rf_join:') || interaction.customId.startsWith('rf_viewmembers:') || interaction.customId.startsWith('rf_start:')) {
      return handleLobbyButton(interaction);
    }
  },

  cancelViaUniversal,
};
