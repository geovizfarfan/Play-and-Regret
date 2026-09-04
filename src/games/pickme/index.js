// ─────────────────────────────────────────────────────────────────────────────
// Pick Me Pit — every round, 2-4 random players get tagged with a fictional
// "pick me" accusation. Everyone votes who deserves The Pit. No threshold —
// one elimination per round. Last one standing wins. Free to join; host can
// optionally set a sins prize.
//
// Same pattern as Walkin Red Flag / FAFO: round decisions via ONE public
// message with a select menu + powers button, not DMs.
// ─────────────────────────────────────────────────────────────────────────────
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { db, economy } = require('../../utils/database');
const { awardRegret } = require('../../utils/regret');
const { POWERS, POWER_KEYS, grantRandomPower } = require('./powers');
const S = require('./scenarios');

const activeGames = new Map(); // channelId -> game

const CONFIG = {
  lobbyDurationMs: 90 * 1000,
  roundDecisionMs: 60 * 1000,
  minPlayers: 3,
  maxPlayers: 12,
  interRoundDelayMs: 8 * 1000,
  lateGameThreshold: 3, // when <= this many players remain, elimination counts as "late" for regret
};

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
  await db.run('INSERT INTO pickme_stats (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [userId]);
}
async function bumpStat(userId, column) {
  await ensureStats(userId);
  await db.run(`UPDATE pickme_stats SET ${column} = ${column} + 1 WHERE user_id = ?`, [userId]).catch(() => {});
}
function newPlayer(userId, username) {
  return { userId, username, powers: [], immune: false, extraVoteNext: false, eliminated: false };
}
function activePlayers(game) {
  return [...game.players.values()].filter(p => !p.eliminated);
}

// ── Lobby ───────────────────────────────────────────────────────────────────
async function startLobby(channel, hostId, hostName, prize) {
  if (activeGames.has(channel.id)) return null;

  const feeConfig = await economy.getEntryFeeConfig('pickme');
  const feeAmount = feeConfig.enabled ? feeConfig.defaultAmount : 0;

  const game = {
    channelId: channel.id, hostId, hostName, prize: prize || 0,
    feeEnabled: feeConfig.enabled, feeAmount, collectedFees: 0,
    phase: 'lobby', round: 0,
    players: new Map(), lobbyMsg: null, lobbyTimer: null,
  };
  activeGames.set(channel.id, game);

  const embed = new EmbedBuilder()
    .setColor('#D4537E')
    .setTitle('<a:kiss:1545098398565142601> PICK ME PIT')
    .setDescription(
      `<@${hostId}> opened a Pick Me Pit.\n\n` +
      `Every round, someone gets exposed for the most "pick me" behavior imaginable. Vote who deserves The Pit.\n\n` +
      (feeConfig.enabled ? `<a:SINS:1522338223613804724> Entry: **${feeAmount.toLocaleString()} sins**\n` : '') +
      (game.prize > 0 ? `<a:SINS:1522338223613804724> Prize: **${game.prize.toLocaleString()} sins** to the winner${feeConfig.enabled ? ' (plus entry fees collected)' : ''}\n\n` : (feeConfig.enabled ? '\n' : 'Free to play — bragging rights only.\n\n'))
    )
    .addFields({ name: '<:member:1495666085121491024> Joined', value: '**0** players' })
    .setFooter({ text: 'Use !cancel to end this early' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pm_join:${channel.id}`).setLabel('Join').setEmoji('<a:kiss:1545098398565142601>').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pm_viewmembers:${channel.id}`).setLabel('View Members').setEmoji('<:member:1495666085121491024>').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pm_start:${channel.id}`).setLabel('Start Game').setEmoji('<a:CheckCheckmarkSticker:1532595713010040972>').setStyle(ButtonStyle.Success),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  game.lobbyMsg = msg;
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
  if (!game) return interaction.reply({ content: '<:wrong:1495666083594502174> No active Pick Me Pit here.', ephemeral: true });

  if (action === 'pm_join') {
    if (game.phase !== 'lobby') return interaction.reply({ content: '<:wrong:1495666083594502174> This game already started.', ephemeral: true });
    if (game.players.has(interaction.user.id)) return interaction.reply({ content: '<a:Warning:1497476844860215366> You already joined.', ephemeral: true });
    if (game.players.size >= CONFIG.maxPlayers) return interaction.reply({ content: '<:wrong:1495666083594502174> Lobby\'s full.', ephemeral: true });
    if (game.feeEnabled) {
      await economy.getUser(interaction.user.id, interaction.user.username);
      const balance = await economy.getBalance(interaction.user.id);
      if (balance < game.feeAmount) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> You need **${game.feeAmount.toLocaleString()} sins** to join. You have **${balance.toLocaleString()}**.`, ephemeral: true });
      }
      await economy.removeFunds(interaction.user.id, game.feeAmount, 'Pick Me Pit entry fee');
      game.collectedFees += game.feeAmount;
    }
    const p = newPlayer(interaction.user.id, interaction.user.username);
    p.paidFee = game.feeEnabled;
    game.players.set(interaction.user.id, p);
    await ensureStats(interaction.user.id);
    await refreshLobbyEmbed(game);
    return interaction.reply({ content: `<:checkmark:1495666088417956002> You're in${game.feeEnabled ? ` — **${game.feeAmount.toLocaleString()} sins** paid` : ''}. Try not to be the most pick me person here.`, ephemeral: true });
  }

  if (action === 'pm_viewmembers') {
    const list = game.players.size ? [...game.players.values()].map((p, i) => `**${i + 1}.** ${p.username}`).join('\n') : 'Nobody yet.';
    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#D4537E').setTitle('<:member:1495666085121491024> Joined').setDescription(list)], ephemeral: true });
  }

  if (action === 'pm_start') {
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
    await channel.send(`<:wrong:1495666083594502174> Not enough players joined Pick Me Pit (need ${CONFIG.minPlayers}).`);
    return;
  }

  game.phase = 'playing';
  await game.lobbyMsg?.edit({ components: [] }).catch(() => {});
  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#D4537E').setTitle('<a:kiss:1545098398565142601> THE PIT OPENS')
      .setDescription(`**${game.players.size}** players. Someone here is exhausting. Let's find out who.`)
  ] });
  await runRound(channel, game);
}

// ── Round loop ────────────────────────────────────────────────────────────
async function runRound(channel, game) {
  const active = activePlayers(game);
  if (active.length <= 1) return endGame(channel, game, active[0] || null);

  game.round++;
  const eligible = active.filter(p => !p.immune);
  const pool = eligible.length >= 2 ? eligible : active;
  const nomineeCount = Math.min(4, Math.max(2, Math.floor(pool.length / 2)));
  const nominees = [...pool].sort(() => Math.random() - 0.5).slice(0, nomineeCount);
  for (const p of active) p.immune = false;

  // Auto-vote for anyone who used Try Harder last round
  const forcedVotes = [];
  for (const p of active) {
    if (p.extraVoteNext) { forcedVotes.push(p.userId); p.extraVoteNext = false; }
  }

  let powerLine = '';
  if (game.round > 1) {
    const luckyPlayer = active[Math.floor(Math.random() * active.length)];
    const key = grantRandomPower(game, luckyPlayer.userId);
    if (key) powerLine = `\n${POWERS[key].emoji} **${luckyPlayer.username}** found a **${POWERS[key].name}** card!\n`;
  }

  const accusationLines = nominees.map(n => `<@${n.userId}> — *"${S.pick(S.ACCUSATIONS)}"*`);
  const roundTag = `pm_r${game.round}_${channel.id}_${Date.now()}`;
  const votes = new Map(); // voterId -> { target, weight }
  const votesCancelled = new Set(); // targets whose next vote gets cancelled (by 'please')

  const embed = new EmbedBuilder()
    .setColor('#D4537E')
    .setTitle('<a:kiss:1545098398565142601> NOMINATIONS')
    .setDescription(
      `${accusationLines.join('\n')}${powerLine}\n\n` +
      `Vote who deserves The Pit. **${Math.floor(CONFIG.roundDecisionMs / 1000)}s.**`
    );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`pm_vote:${roundTag}`).setPlaceholder('Vote for the Pit...')
      .addOptions(nominees.map(n => ({ label: n.username, value: n.userId })))
  );
  const powerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pm_usepower:${roundTag}`).setLabel('Use Power').setEmoji('<a:ability:1545092941666721954>').setStyle(ButtonStyle.Primary)
  );

  const roundMsg = await channel.send({ embeds: [embed], components: [selectRow, powerRow] });

  await new Promise((resolve) => {
    const collector = roundMsg.createMessageComponentCollector({ time: CONFIG.roundDecisionMs });

    collector.on('collect', async (i) => {
      try {
        if (i.customId === `pm_vote:${roundTag}`) {
          const targetId = i.values[0];
          if (i.user.id === targetId) return i.reply({ content: '<:wrong:1495666083594502174> Can\'t vote for yourself.', ephemeral: true });
          if (!game.players.has(i.user.id) || game.players.get(i.user.id).eliminated) return i.reply({ content: '<:wrong:1495666083594502174> You\'re not in this game.', ephemeral: true });
          votes.set(i.user.id, { target: targetId, weight: 1 });
          return i.reply({ content: `<:checkmark:1495666088417956002> Voted for **${game.players.get(targetId)?.username}**.`, ephemeral: true });
        }

        if (i.customId === `pm_usepower:${roundTag}`) {
          const p = game.players.get(i.user.id);
          if (!p || p.eliminated) return i.reply({ content: '<:wrong:1495666083594502174> You\'re not in this game.', ephemeral: true });
          if (!p.powers.length) return i.reply({ content: '<a:Warning:1497476844860215366> You don\'t have any powers.', ephemeral: true });
          const row = new ActionRowBuilder().addComponents(
            ...p.powers.slice(0, 5).map(key =>
              new ButtonBuilder().setCustomId(`pm_power:${roundTag}:${key}`).setLabel(POWERS[key].name).setEmoji(POWERS[key].emoji).setStyle(ButtonStyle.Primary)
            )
          );
          return i.reply({ content: 'Use which power?', components: [row], ephemeral: true });
        }

        if (i.customId.startsWith(`pm_power:${roundTag}:`)) {
          const key = i.customId.split(':')[2];
          const p = game.players.get(i.user.id);
          const idx = p.powers.indexOf(key);
          if (idx === -1) return i.update({ content: 'Already used.', components: [] });
          p.powers.splice(idx, 1);
          await bumpStat(i.user.id, 'powers_used');

          if (key === 'not_me_babe') {
            p.immune = true;
            await i.update({ content: '<a:yeah_and:1545091816674689044> You\'re immune this round.', components: [] });
          } else if (key === 'try_harder') {
            if (nominees.some(n => n.userId === i.user.id)) {
              votesCancelled.add(i.user.id); // marks self as removed from this round's danger
              p.extraVoteNext = true;
              await i.update({ content: '<a:kiss:1545098398565142601> Out of danger now — but you\'re auto-flagged next round.', components: [] });
            } else {
              p.powers.push(key);
              await i.update({ content: '<:wrong:1495666083594502174> You\'re not nominated this round.', components: [] });
            }
          } else if (key === 'receipts' || key === 'look_at_yourself' || key === 'please') {
            // These target another player — show a quick target picker
            const targets = active.filter(a => a.userId !== i.user.id);
            const targetRow = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder().setCustomId(`pm_target:${roundTag}:${key}`).setPlaceholder('Pick a target...')
                .addOptions(targets.slice(0, 25).map(t => ({ label: t.username, value: t.userId })))
            );
            p.powers.push(key); // refund until target chosen
            await i.update({ content: `Choose a target for **${POWERS[key].name}**:`, components: [targetRow] });
          }
        }

        if (i.customId.startsWith(`pm_target:${roundTag}:`)) {
          const key = i.customId.split(':')[2];
          const targetId = i.values[0];
          const p = game.players.get(i.user.id);
          const idx = p.powers.indexOf(key);
          if (idx !== -1) p.powers.splice(idx, 1);

          if (key === 'receipts') {
            game._doubleVoteTarget = targetId; // whoever votes for this target counts double — simplified as: target's own vote (if any) counts double next tally
            await i.update({ content: `<a:receipt:1545092059587940484> **${game.players.get(targetId)?.username}**'s votes will count double this round.`, components: [] });
          } else if (key === 'please') {
            votesCancelled.add(targetId);
            await i.update({ content: `<a:please:1545099154621993110> One vote against **${game.players.get(targetId)?.username}** will be cancelled.`, components: [] });
          } else if (key === 'look_at_yourself') {
            game._redirectMap = game._redirectMap || new Map();
            game._redirectMap.set(i.user.id, targetId);
            await i.update({ content: `<a:mirror:1545098431557795841> If you're voted this round, it redirects to **${game.players.get(targetId)?.username}**.`, components: [] });
          }
        }
      } catch (e) { console.error('[pickme round error]', e); }
    });

    collector.on('end', () => { roundMsg.edit({ components: [] }).catch(() => {}); resolve(); });
  });

  for (const uid of forcedVotes) {
    if (!votes.has(uid) && nominees.length) votes.set(uid, { target: nominees[0].userId, weight: 1 });
  }

  await resolveRound(channel, game, nominees, votes, votesCancelled);
}

async function resolveRound(channel, game, nominees, votes, votesCancelled) {
  const tally = {};
  for (const n of nominees) tally[n.userId] = 0;

  let cancelledOnce = new Set(votesCancelled);
  for (const [, v] of votes.entries()) {
    if (!(v.target in tally)) continue;
    if (cancelledOnce.has(v.target)) { cancelledOnce.delete(v.target); continue; } // cancel exactly one vote against them
    const weight = (game._doubleVoteTarget === v.target) ? 2 : v.weight;
    tally[v.target] = (tally[v.target] || 0) + weight;
  }
  game._doubleVoteTarget = null;

  let leaderId = nominees.reduce((a, b) => (tally[b.userId] || 0) > (tally[a.userId] || 0) ? b : a).userId;

  // Look At Yourself redirect
  if (game._redirectMap?.has(leaderId)) {
    const redirectTo = game._redirectMap.get(leaderId);
    if (activePlayers(game).some(p => p.userId === redirectTo)) {
      const oldLeader = game.players.get(leaderId).username;
      leaderId = redirectTo;
      await channel.send({ embeds: [
        new EmbedBuilder().setColor('#D4537E').setDescription(`<a:mirror:1545098431557795841> **${oldLeader}** redirected the vote to **${game.players.get(leaderId).username}**.`)
      ]});
    }
  }
  game._redirectMap = null;

  const eliminated = game.players.get(leaderId);
  eliminated.eliminated = true;
  await bumpStat(leaderId, 'times_eliminated');
  for (const n of nominees) await bumpStat(n.userId, 'times_nominated');
  await bumpStat(leaderId, 'votes_received');

  const remaining = activePlayers(game);
  const isLate = remaining.length <= CONFIG.lateGameThreshold;
  const tier = isLate ? 'moderate' : 'minor';
  const regretAmt = await awardRegret(leaderId, tier, 'pickme', `Eliminated round ${game.round}`);
  await db.run('UPDATE pickme_stats SET regrets_earned = regrets_earned + ? WHERE user_id = ?', [regretAmt, leaderId]).catch(() => {});

  await channel.send({ embeds: [
    new EmbedBuilder().setColor('#D4537E').setTitle('<a:kiss:1545098398565142601> THE PIT DECIDES')
      .setDescription(`*${S.pick(S.VOTE_RESULT_LINES)}*\n\n<a:kiss:1545098398565142601> *${S.pick(S.ELIMINATION_LINES)}* **${eliminated.username}** enters The Pit. **+${regretAmt} regret.**`)
  ]});

  if (remaining.length <= 1) {
    setTimeout(() => endGame(channel, game, remaining[0] || null).catch(() => {}), CONFIG.interRoundDelayMs);
  } else {
    setTimeout(() => runRound(channel, game).catch(() => {}), CONFIG.interRoundDelayMs);
  }
}

async function endGame(channel, game, winner) {
  activeGames.delete(channel.id);
  if (winner) {
    await bumpStat(winner.userId, 'games_won');
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#FFD700').setTitle('<a:crowned:1544882007652438077> LEAST EMBARRASSING PERSON ALIVE')
        .setDescription(`**${winner.username}** wins Pick Me Pit.`)
    ]});
    const totalPrize = game.prize + game.collectedFees;
    if (totalPrize > 0) {
      await economy.addFunds(winner.userId, totalPrize, 'Pick Me Pit prize').catch(() => {});
      await channel.send(`<a:SINS:1522338223613804724> **${winner.username}** takes home **${totalPrize.toLocaleString()} sins**.`);
    }
  }
  for (const p of game.players.values()) await bumpStat(p.userId, 'games_played');
}

// ── Cancel / stats ──────────────────────────────────────────────────────
async function cancelViaUniversal(channel, userId, member) {
  const game = activeGames.get(channel.id);
  if (!game) return null;
  if (!canCancel(member, game.hostId, userId)) return { blocked: true };
  if (game.phase !== 'lobby') return { blocked: true, reason: 'running' };
  clearTimeout(game.lobbyTimer);
  if (game.feeEnabled) {
    for (const p of game.players.values()) {
      if (p.paidFee) await economy.addFunds(p.userId, game.feeAmount, 'Pick Me Pit cancelled — refund').catch(() => {});
    }
  }
  activeGames.delete(channel.id);
  await game.lobbyMsg?.edit({ components: [] }).catch(() => {});
  return { blocked: false };
}

async function showStats(message, targetUser) {
  const target = targetUser || message.author;
  await ensureStats(target.id);
  const s = await db.get('SELECT * FROM pickme_stats WHERE user_id = ?', [target.id]);
  return message.reply({ embeds: [
    new EmbedBuilder().setColor('#D4537E').setTitle(`<a:kiss:1545098398565142601> ${target.username.toUpperCase()}'S PICK ME RECORD`)
      .addFields(
        { name: '<a:crowned:1544882007652438077> Wins', value: `${s.games_won}`, inline: true },
        { name: '💀 Times Eliminated', value: `${s.times_eliminated}`, inline: true },
        { name: '<a:kiss:1545098398565142601> Times Nominated', value: `${s.times_nominated}`, inline: true },
        { name: '<a:ability:1545092941666721954> Powers Used', value: `${s.powers_used}`, inline: true },
        { name: '<:purp_caveira50:1495665632845369354> Regrets', value: `${s.regrets_earned}`, inline: true },
      )
      .setFooter({ text: `${s.games_played} games played` })
  ]});
}

module.exports = {
  name: 'pickme',
  activeGames,

  async handleCommand(message, args, command) {
    if (command !== 'pickme') return;
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'stats') {
      const target = message.mentions?.users?.first() || message.author;
      return showStats(message, target);
    }
    if (!isHost(message.member)) return message.reply(`<:wrong:1495666083594502174> You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start Pick Me Pit.`);
    if (activeGames.has(message.channel.id)) return message.reply('<:wrong:1495666083594502174> Already running here.');
    const prize = parseInt(args[0]) || 0;
    await startLobby(message.channel, message.author.id, message.author.username, prize);
  },

  async handleSlash(interaction, commandName) {
    if (commandName !== 'pickme') return;
    if (!isHost(interaction.member)) return interaction.reply({ content: `<:wrong:1495666083594502174> You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to start Pick Me Pit.`, ephemeral: true });
    if (activeGames.has(interaction.channel.id)) return interaction.reply({ content: '<:wrong:1495666083594502174> Already running here.', ephemeral: true });
    const prize = interaction.options.getInteger('prize') || 0;
    await interaction.reply({ content: '<:checkmark:1495666088417956002> Opening the pit...', ephemeral: true });
    await startLobby(interaction.channel, interaction.user.id, interaction.user.username, prize);
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith('pm_join:') || interaction.customId.startsWith('pm_viewmembers:') || interaction.customId.startsWith('pm_start:')) {
      return handleLobbyButton(interaction);
    }
  },

  cancelViaUniversal,
};
