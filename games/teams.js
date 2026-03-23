/**
 * teams.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Team Randomizer
 * - Host sets 2-4 team names
 * - Players sign up via button
 * - Bot randomly & fairly distributes players across teams
 * - Reroll button for host
 * - Track team wins and individual points
 * - Final summary shows team totals
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { economy, stats } = require('../utils/database');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const activeSessions  = new Map(); // channelId → session

const TEAM_COLORS = ['#9B59B6', '#E74C3C', '#2ECC71', '#F39C12'];
const TEAM_EMOJIS = ['🟣', '🔴', '🟢', '🟡'];

function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignTeams(players, teamNames) {
  const shuffled = shuffle(players);
  const teams    = teamNames.map((name, i) => ({ name, emoji: TEAM_EMOJIS[i], color: TEAM_COLORS[i], members: [], points: 0, wins: 0 }));
  shuffled.forEach((p, i) => teams[i % teams.length].members.push(p));
  return teams;
}

// ─── Embeds ───────────────────────────────────────────────────────────────────
function makeSignupEmbed(session) {
  const { players, teamNames, hostName, signupLabel } = session;
  return new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('<a:purplesparkle:1479210541691175054> Team Randomizer — Signups Open!')
    .setDescription(
      `**${hostName}** is setting up teams!\n\n` +
      `<:members:1479293571709534311> **Teams:** ${teamNames.join(' • ')}\n` +
      `<:Clocktime:1479304295022071931> Signups close in **${signupLabel}**\n\n` +
      `Click **⚔️ Join** to enter the pool — teams will be randomly assigned!`
    )
    .addFields({
      name: `<:members:1479293571709534311> Signed Up (${players.length})`,
      value: players.length > 0 ? players.map(p => `• **${p.username}**`).join('\n') : 'Nobody yet...',
    })
    .setFooter({ text: `Teams will be balanced and randomized automatically` });
}

function makeTeamsEmbed(session) {
  const { teams, sessionName } = session;
  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle(`<a:purplesparkle:1479210541691175054> ${sessionName || 'Team Assignments'}`)
    .setDescription('Teams have been randomly assigned! Good luck everyone. ⚔️');

  for (const team of teams) {
    embed.addFields({
      name: `${team.emoji} **${team.name}** (${team.members.length} players)`,
      value: team.members.length > 0
        ? team.members.map(p => `• <@${p.id}> **${p.username}**`).join('\n')
        : '*No players*',
      inline: true,
    });
  }

  return embed;
}

function makeScoreEmbed(session) {
  const { teams, sessionName, pointLog } = session;
  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(`🏆 ${sessionName || 'Team Scores'}`);

  // Team standings
  const sorted = [...teams].sort((a, b) => b.points - a.points);
  const standing = sorted.map((t, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    return `${medal} ${t.emoji} **${t.name}** — **${t.points} pts** (${t.wins} win${t.wins !== 1 ? 's' : ''})`;
  }).join('\n');
  embed.setDescription(standing);

  // Individual scores per team
  for (const team of sorted) {
    const memberScores = team.members
      .map(p => `• **${p.username}** — ${p.points || 0} pts`)
      .sort((a, b) => {
        const ap = parseInt(a.match(/(\d+) pts/)?.[1] || 0);
        const bp = parseInt(b.match(/(\d+) pts/)?.[1] || 0);
        return bp - ap;
      })
      .join('\n');
    embed.addFields({
      name: `${team.emoji} ${team.name} — Individual`,
      value: memberScores || '*No scores yet*',
      inline: true,
    });
  }

  return embed;
}

// ─── Remove player modal ──────────────────────────────────────────────────────
async function handleRemovePlayer(interaction, session, channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`teams_remove_modal_${channelId}`)
    .setTitle('Remove Player');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Player username to remove (exact)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handleRemoveModal(interaction, session) {
  const username = interaction.fields.getTextInputValue('username').trim();
  let found = false;

  for (const team of session.teams) {
    const idx = team.members.findIndex(p => p.username.toLowerCase() === username.toLowerCase());
    if (idx !== -1) {
      const removed = team.members.splice(idx, 1)[0];
      // Also remove from players pool
      const pi = session.players.findIndex(p => p.id === removed.id);
      if (pi !== -1) session.players.splice(pi, 1);
      found = true;

      await interaction.reply({
        content: `🗑️ **${removed.username}** has been removed from **${team.emoji} ${team.name}**.`,
      });

      // Update both embeds
      if (session.signupMsg) await session.signupMsg.edit({ embeds: [makeSignupEmbed(session)] }).catch(() => {});
      if (session.scoreMsg)  await session.scoreMsg.edit({ embeds: [makeScoreEmbed(session)] }).catch(() => {});

      // Post updated team roster
      await interaction.followUp({ embeds: [makeTeamsEmbed(session)] });
      break;
    }
  }

  if (!found) return interaction.reply({ content: `❌ Player **${username}** not found in any team.`, ephemeral: true });
}

// ─── Score modal ──────────────────────────────────────────────────────────────
async function handleAddPoints(interaction, session) {
  if (!hasHostRole(interaction.member)) {
    return interaction.reply({ content: `❌ Only the host can add points!`, ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`teams_points_${interaction.channel.id}`)
    .setTitle('Add Points');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('username').setLabel('Player username (exact)').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('points').setLabel('Points to add (use - for negative)').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Short).setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

async function handlePointsModal(interaction, session) {
  const username = interaction.fields.getTextInputValue('username').trim();
  const pts      = parseInt(interaction.fields.getTextInputValue('points'));
  const reason   = interaction.fields.getTextInputValue('reason') || '';

  if (isNaN(pts)) return interaction.reply({ content: `❌ Invalid points value.`, ephemeral: true });

  let found = false;
  for (const team of session.teams) {
    const member = team.members.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (member) {
      member.points  = (member.points || 0) + pts;
      team.points   += pts;
      found = true;

      await interaction.reply({
        content: `<:purpleverified:1479305124336767147> **+${pts} pts** to **${member.username}** (${team.emoji} ${team.name})${reason ? ` — ${reason}` : ''}`,
      });

      // Update scoreboard
      if (session.scoreMsg) {
        await session.scoreMsg.edit({ embeds: [makeScoreEmbed(session)] }).catch(() => {});
      }
      break;
    }
  }

  if (!found) return interaction.reply({ content: `❌ Player **${username}** not found in any team.`, ephemeral: true });
}

async function handleAddWin(interaction, session) {
  if (!hasHostRole(interaction.member)) {
    return interaction.reply({ content: `❌ Only the host can record wins!`, ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`teams_win_${interaction.channel.id}`)
    .setTitle('Record Team Win');

  const teamList = session.teams.map((t, i) => `${i+1}. ${t.name}`).join(', ');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('team')
        .setLabel(`Winning team name (${teamList})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handleWinModal(interaction, session) {
  const teamName = interaction.fields.getTextInputValue('team').trim();
  const team     = session.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());

  if (!team) return interaction.reply({ content: `❌ Team **${teamName}** not found.`, ephemeral: true });

  team.wins++;
  team.points += 10; // +10 pts per win
  team.members.forEach(m => { m.points = (m.points || 0) + 10; });

  await interaction.reply({
    content: `🏆 **${team.emoji} ${team.name}** wins! **+10 pts** to all members.`,
  });

  if (session.scoreMsg) {
    await session.scoreMsg.edit({ embeds: [makeScoreEmbed(session)] }).catch(() => {});
  }
}

// ─── Remove player ────────────────────────────────────────────────────────────
async function handleRemovePlayer(interaction, session, channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`teams_remove_modal_${channelId}`)
    .setTitle('Remove Player');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Player username to remove (exact)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handleRemoveModal(interaction, session) {
  const username = interaction.fields.getTextInputValue('username').trim();

  for (const team of session.teams) {
    const idx = team.members.findIndex(p => p.username.toLowerCase() === username.toLowerCase());
    if (idx !== -1) {
      const removed = team.members.splice(idx, 1)[0];
      // Also remove from players pool
      const pi = session.players.findIndex(p => p.id === removed.id);
      if (pi !== -1) session.players.splice(pi, 1);

      await interaction.reply({
        content: `<:purpleverified:1479305124336767147> **${removed.username}** has been removed from **${team.emoji} ${team.name}**.`,
      });

      // Update both embeds
      if (session.scoreMsg) {
        await session.scoreMsg.edit({ embeds: [makeScoreEmbed(session)] }).catch(() => {});
      }
      return;
    }
  }

  return interaction.reply({ content: `❌ Player **${username}** not found in any team.`, ephemeral: true });
}

// ─── Launcher ─────────────────────────────────────────────────────────────────
async function launchTeams(channel, teamNames, sessionName, signupSecs, triggeredBy, hostId) {
  const channelId = channel.id;
  if (activeSessions.has(channelId)) return channel.send('❌ There\'s already a team session running here!');

  const signupLabel = signupSecs < 60 ? `${signupSecs} seconds` : `${Math.round(signupSecs/60)} minute${Math.round(signupSecs/60) !== 1 ? 's' : ''}`;
  const joinId      = `teams_join_${channelId}`;
  const startId     = `teams_start_${channelId}`;

  const session = { teamNames, sessionName, teams: [], players: [], hostId, hostName: triggeredBy, signupLabel, scoreMsg: null };
  activeSessions.set(channelId, session);

  const makeButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('⚔️ Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(startId).setLabel('▶️ Assign Teams Now').setStyle(ButtonStyle.Success),
  );

  const gameMsg = await channel.send({ embeds: [makeSignupEmbed(session)], components: [makeButtons()] });
  session.signupMsg = gameMsg;

  const collector = gameMsg.createMessageComponentCollector({ time: signupSecs * 1000 });

  collector.on('collect', async (interaction) => {
    const s = activeSessions.get(channelId);
    if (!s) return;

    if (interaction.customId === startId) {
      if (interaction.user.id !== s.hostId && !hasHostRole(interaction.member)) {
        return interaction.reply({ content: `❌ Only the host can force start!`, ephemeral: true });
      }
      if (s.players.length < s.teamNames.length) {
        return interaction.reply({ content: `❌ Need at least **${s.teamNames.length}** players (one per team)!`, ephemeral: true });
      }
      await interaction.deferUpdate();
      collector.stop('forcestart');
      return;
    }

    if (interaction.customId !== joinId) return;
    await interaction.deferUpdate();

    if (s.players.find(p => p.id === interaction.user.id)) {
      return interaction.followUp({ content: `❌ You're already signed up and cannot change teams once assigned!`, ephemeral: true });
    }

    s.players.push({ id: interaction.user.id, username: interaction.user.username, points: 0 });
    await gameMsg.edit({ embeds: [makeSignupEmbed(s)], components: [makeButtons()] });
    await interaction.followUp({ content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** joined the pool! (${s.players.length} in)` });
  });

  collector.on('end', async (_, reason) => {
    const s = activeSessions.get(channelId);
    if (!s) return;

    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(joinId).setLabel('⏰ Signups Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(startId).setLabel('▶️ Assigned').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await gameMsg.edit({ components: [closed] }).catch(() => {});

    if (s.players.length < s.teamNames.length) {
      activeSessions.delete(channelId);
      return channel.send(`❌ Not enough players to fill **${s.teamNames.length}** teams. Cancelled.`);
    }

    // Assign teams
    s.teams = assignTeams(s.players, s.teamNames);

    const rerollId  = `teams_reroll_${channelId}`;
    const resetId   = `teams_reset_${channelId}`;
    const removeId  = `teams_remove_${channelId}`;
    const pointsId  = `teams_points_btn_${channelId}`;
    const winId     = `teams_win_btn_${channelId}`;
    const endId     = `teams_end_${channelId}`;

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(rerollId).setLabel('🔀 Reroll').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(removeId).setLabel('❌ Remove Player').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(pointsId).setLabel('➕ Points').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(winId).setLabel('🏆 Win').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(endId).setLabel('🏁 End').setStyle(ButtonStyle.Danger),
    );

    await channel.send({ embeds: [makeTeamsEmbed(s)], components: [controlRow] });

    // Post live scoreboard
    const scoreMsg = await channel.send({ embeds: [makeScoreEmbed(s)] });
    s.scoreMsg = scoreMsg;

    // Control collector — stays active until end
    const ctrlCollector = scoreMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });

    ctrlCollector.on('collect', async (interaction) => {
      const s = activeSessions.get(channelId);
      if (!s) return;

      if (interaction.customId === rerollId) {
        if (interaction.user.id !== s.hostId && !hasHostRole(interaction.member)) {
          return interaction.reply({ content: `❌ Only the host can reroll!`, ephemeral: true });
        }
        s.teams = assignTeams(s.players, s.teamNames);
        // Reset points on reroll
        s.teams.forEach(t => { t.points = 0; t.wins = 0; t.members.forEach(m => m.points = 0); });
        await interaction.deferUpdate();
        await channel.send({ embeds: [makeTeamsEmbed(s)] });
        await scoreMsg.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});

      } else if (interaction.customId === resetId) {
        if (interaction.user.id !== s.hostId && !hasHostRole(interaction.member)) {
          return interaction.reply({ content: `❌ Only the host can reset scores!`, ephemeral: true });
        }
        s.teams.forEach(t => { t.points = 0; t.wins = 0; t.members.forEach(m => m.points = 0); });
        await interaction.deferUpdate();
        await scoreMsg.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});
        await channel.send(`🔄 **Scores have been reset!** Teams stay the same.`);

      } else if (interaction.customId === removeId) {
        if (interaction.user.id !== s.hostId && !hasHostRole(interaction.member)) {
          return interaction.reply({ content: `❌ Only the host or mods can remove players!`, ephemeral: true });
        }
        await handleRemovePlayer(interaction, s, channelId);

      } else if (interaction.customId === pointsId) {
        await handleAddPoints(interaction, s);

      } else if (interaction.customId === winId) {
        await handleAddWin(interaction, s);

      } else if (interaction.customId === endId) {
        if (interaction.user.id !== s.hostId && !hasHostRole(interaction.member)) {
          return interaction.reply({ content: `❌ Only the host can end the session!`, ephemeral: true });
        }
        await interaction.deferUpdate();
        ctrlCollector.stop('ended');
        activeSessions.delete(channelId);

        // Final summary
        const finalEmbed = makeScoreEmbed(s);
        finalEmbed.setTitle(`🏁 Final Results — ${s.sessionName || 'Team Session'}`);
        const winner = [...s.teams].sort((a, b) => b.points - a.points)[0];
        finalEmbed.setDescription(`🏆 **${winner.emoji} ${winner.name}** wins the session with **${winner.points} pts**!\n\n` +
          [...s.teams].sort((a,b) => b.points - a.points).map((t,i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            return `${medal} ${t.emoji} **${t.name}** — **${t.points} pts** (${t.wins} win${t.wins !== 1 ? 's' : ''})`;
          }).join('\n')
        );

        await channel.send({ embeds: [finalEmbed] });

        // Disable buttons
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(rerollId).setLabel('🔀 Reroll').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId(removeId).setLabel('❌ Remove Player').setStyle(ButtonStyle.Danger).setDisabled(true),
          new ButtonBuilder().setCustomId(resetId).setLabel('🔄 Reset Scores').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId(pointsId).setLabel('➕ Points').setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId(winId).setLabel('🏆 Win').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(endId).setLabel('🏁 Session Ended').setStyle(ButtonStyle.Danger).setDisabled(true),
        );
        await scoreMsg.edit({ components: [disabledRow] }).catch(() => {});
      }
    });

    // Handle modal submissions
    channel.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isModalSubmit()) return;
      const s = activeSessions.get(interaction.channel?.id);

      if (interaction.customId === `teams_points_${channelId}` && s) {
        await handlePointsModal(interaction, s);
      } else if (interaction.customId === `teams_win_${channelId}` && s) {
        await handleWinModal(interaction, s);
      } else if (interaction.customId === `teams_remove_modal_${channelId}` && s) {
        await handleRemoveModal(interaction, s);
      }
    });
  });
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'teams',
  activeSessions,

  async handleSlash(interaction, commandName) {
    if (commandName === 'teams') {
      if (!hasHostRole(interaction.member)) {
        return interaction.reply({ content: `❌ Only admins and **${EVENT_HOST_ROLE}** can create teams!`, ephemeral: true });
      }

      const team1      = interaction.options.getString('team1');
      const team2      = interaction.options.getString('team2');
      const team3      = interaction.options.getString('team3');
      const team4      = interaction.options.getString('team4');
      const sessionName = interaction.options.getString('name') || 'Team Randomizer';
      const durationKey = interaction.options.getString('duration') || '60';
      const customSecs  = interaction.options.getInteger('timer');
      const signupSecs  = customSecs || parseInt(durationKey);

      const teamNames = [team1, team2, team3, team4].filter(Boolean);
      if (teamNames.length < 2) return interaction.reply({ content: `❌ You need at least 2 team names!`, ephemeral: true });

      await interaction.reply({ content: `<a:purplesparkle:1479210541691175054> Setting up teams...`, ephemeral: true });
      await launchTeams(interaction.channel, teamNames, sessionName, signupSecs, interaction.user.username, interaction.user.id);
    }
  },

  async handleCommand(message, args) {
    if (!hasHostRole(message.member)) return message.reply(`❌ Only admins and **${EVENT_HOST_ROLE}** can create teams!`);
    // !teams "Team A" "Team B" "Team C"
    const names = args.join(' ').match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, ''));
    if (!names || names.length < 2) return message.reply('❌ Usage: `!teams "Team A" "Team B" "Team C"`');
    await launchTeams(message.channel, names, 'Team Randomizer', 60, message.author.username, message.author.id);
  },
};
