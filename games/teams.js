/**
 * teams.js — Team Randomizer with Roles
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const activeSessions  = new Map();
const pointsRoles     = new Set(); // role IDs allowed to add points

function canAddPoints(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  if (member.roles.cache.some(r => r.name === EVENT_HOST_ROLE)) return true;
  return member.roles.cache.some(r => pointsRoles.has(r.id));
}

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

function teamTotal(team) {
  return team.members.reduce((sum, m) => sum + (m.points || 0), 0);
}

// ─── Get or create a role ─────────────────────────────────────────────────────
async function getOrCreateRole(guild, name, color) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (!role) {
    role = await guild.roles.create({
      name,
      color: color || '#9B59B6',
      reason: 'Team Randomizer auto-created role',
    });
  }
  return role;
}

// ─── Assign team roles to members ─────────────────────────────────────────────
async function assignRoles(guild, teams) {
  const COLORS = ['#9B59B6', '#E74C3C', '#2ECC71', '#F39C12'];
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const role = await getOrCreateRole(guild, team.name, COLORS[i]);
    team.roleId = role.id;
    for (const member of team.members) {
      const guildMember = await guild.members.fetch(member.id).catch(() => null);
      if (guildMember) await guildMember.roles.add(role).catch(() => {});
    }
  }
}

// ─── Remove team roles ────────────────────────────────────────────────────────
async function removeRoles(guild, teams) {
  for (const team of teams) {
    if (!team.roleId) continue;
    for (const member of team.members) {
      const guildMember = await guild.members.fetch(member.id).catch(() => null);
      if (guildMember) {
        const role = guild.roles.cache.get(team.roleId);
        if (role) await guildMember.roles.remove(role).catch(() => {});
      }
    }
  }
}

function assignTeams(players, teamNames) {
  const shuffled = shuffle(players);
  const teams    = teamNames.map((name, i) => ({
    name, emoji: TEAM_EMOJIS[i], members: [], wins: 0, roleId: null
  }));
  shuffled.forEach((p, i) => teams[i % teams.length].members.push({ ...p, points: 0 }));
  return teams;
}

// ─── Embeds ───────────────────────────────────────────────────────────────────
function makeSignupEmbed(session) {
  return new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('<a:purplesparkle:1479210541691175054> Team Randomizer — Signups Open!')
    .setDescription(
      `**${session.hostName}** is setting up teams!\n\n` +
      `<:members:1479293571709534311> **Teams:** ${session.teamNames.join(' • ')}\n` +
      `<:Clocktime:1479304295022071931> Signups close in **${session.signupLabel}**\n\n` +
      `Click **⚔️ Join** to enter!\nUse \`/teamadd\` to add someone manually.`
    )
    .addFields({
      name: `<:members:1479293571709534311> Signed Up (${session.players.length})`,
      value: session.players.length > 0 ? session.players.map(p => `• **${p.username}**`).join('\n') : 'Nobody yet...',
    })
    .setFooter({ text: 'Use /startteams to assign teams early' });
}

function makeTeamsEmbed(session) {
  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle(`<a:purplesparkle:1479210541691175054> ${session.sessionName || 'Team Assignments'}`)
    .setDescription('Teams assigned! Roles have been given. ⚔️\n\nUse `/teamadd player:name team:name` to add late joiners.');
  for (const team of session.teams) {
    embed.addFields({
      name: `${team.emoji} **${team.name}** (${team.members.length})`,
      value: team.members.length > 0 ? team.members.map(p => `• <@${p.id}>`).join('\n') : '*No players*',
      inline: true,
    });
  }
  return embed;
}

function makeScoreEmbed(session) {
  const sorted = [...session.teams].sort((a, b) => teamTotal(b) - teamTotal(a));
  const standing = sorted.map((t, i) => {
    const medal = ['<a:1stplace:1487504691880263791>','<a:2ndplace:1487504692874580048>','<a:3rdplace:1487504694191456336>'][i] || `${i+1}.`;
    return `${medal} ${t.emoji} **${t.name}** — **${teamTotal(t)} pts** (${t.wins} win${t.wins !== 1 ? 's' : ''})`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(`🏆 ${session.sessionName || 'Team Scores'}`)
    .setDescription(standing);

  for (const team of sorted) {
    const lines = [...team.members]
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .map(p => `• **${p.username}** — ${p.points || 0} pts`)
      .join('\n');
    embed.addFields({
      name: `${team.emoji} ${team.name} — ${teamTotal(team)} pts`,
      value: lines || '*No scores yet*',
      inline: true,
    });
  }
  embed.setFooter({ text: '/teampoints • /teamwin • /teamadd • /teamend' });
  return embed;
}

// ─── Start teams (shared logic) ───────────────────────────────────────────────
async function startTeams(channel, guild, s) {
  s.teams = assignTeams(s.players, s.teamNames);

  // Assign Discord roles
  try {
    await assignRoles(guild, s.teams);
  } catch (e) {
    await channel.send(`⚠️ Could not assign roles — make sure the bot has **Manage Roles** permission and its role is above team roles.`);
  }

  // Close signup buttons
  if (s.signupMsg) {
    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('teams_join_done').setLabel('⏰ Signups Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('teams_cancel_done').setLabel('🚫 Cancel').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await s.signupMsg.edit({ components: [closed] }).catch(() => {});
  }

  await channel.send({ embeds: [makeTeamsEmbed(s)] });

  // Post live join button for late joiners
  const lateJoinId = `teams_late_${channel.id}`;
  const lateMsg = await channel.send({
    content: `🔔 **Late joiners:** Click below or use \`/teamadd\` to be added to a team!`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(lateJoinId).setLabel('⚔️ Join Late').setStyle(ButtonStyle.Primary)
    )]
  });
  s.lateMsg = lateMsg;

  // Late join collector
  const lateCollector = lateMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
  lateCollector.on('collect', async (interaction) => {
    const sess = activeSessions.get(channel.id);
    if (!sess || !sess.teams) return;
    if (sess.players.find(p => p.id === interaction.user.id)) {
      return interaction.reply({ content: `⚠️ You're already on a team!`, ephemeral: true });
    }
    // Assign to smallest team
    const smallest = [...sess.teams].sort((a, b) => a.members.length - b.members.length)[0];
    const newMember = { id: interaction.user.id, username: interaction.user.username, points: 0 };
    smallest.members.push(newMember);
    sess.players.push(newMember);

    // Assign role
    const guildMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (guildMember && smallest.roleId) {
      const role = guild.roles.cache.get(smallest.roleId);
      if (role) await guildMember.roles.add(role).catch(() => {});
    }

    await interaction.reply({
      content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** joined **${smallest.emoji} ${smallest.name}**!`,
    });
    await sess.scoreMsg?.edit({ embeds: [makeScoreEmbed(sess)] }).catch(() => {});
  });

  const scoreMsg = await channel.send({ embeds: [makeScoreEmbed(s)] });
  s.scoreMsg = scoreMsg;
  s.lateCollector = lateCollector;
}

// ─── Launcher ─────────────────────────────────────────────────────────────────
async function launchTeams(channel, guild, teamNames, sessionName, signupSecs, triggeredBy, hostId) {
  const channelId  = channel.id;
  if (activeSessions.has(channelId)) return channel.send('❌ There\'s already a team session running here!');

  const signupLabel = signupSecs < 60 ? `${signupSecs} seconds` : `${Math.round(signupSecs/60)} minute${Math.round(signupSecs/60) !== 1 ? 's' : ''}`;
  const joinId      = `teams_join_${channelId}`;
  const cancelId    = `teams_cancel_${channelId}`;

  const session = { teamNames, sessionName, teams: [], players: [], hostId, hostName: triggeredBy, signupLabel, scoreMsg: null, signupMsg: null, collector: null, guild };
  activeSessions.set(channelId, session);

  const makeButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('⚔️ Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(cancelId).setLabel('🚫 Cancel').setStyle(ButtonStyle.Danger),
  );

  const signupMsg = await channel.send({ embeds: [makeSignupEmbed(session)], components: [makeButtons()] });
  session.signupMsg = signupMsg;

  const collector = signupMsg.createMessageComponentCollector({ time: signupSecs * 1000 });
  session.collector = collector;

  collector.on('collect', async (interaction) => {
    const s = activeSessions.get(channelId);
    if (!s) return;

    if (interaction.customId === cancelId) {
      if (interaction.user.id !== s.hostId && !hasHostRole(interaction.member)) {
        return interaction.reply({ content: `❌ Only the host can cancel!`, ephemeral: true });
      }
      await interaction.deferUpdate();
      collector.stop('cancelled');
      activeSessions.delete(channelId);
      const closed = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(joinId).setLabel('🚫 Cancelled').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(cancelId).setLabel('🚫 Cancelled').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );
      await signupMsg.edit({ components: [closed] }).catch(() => {});
      return channel.send(`❌ Team session cancelled by **${interaction.user.username}**.`);
    }

    if (interaction.customId !== joinId) return;
    await interaction.deferUpdate();
    if (s.players.find(p => p.id === interaction.user.id)) {
      return interaction.followUp({ content: `⚠️ Already joined!`, ephemeral: true });
    }
    s.players.push({ id: interaction.user.id, username: interaction.user.username });
    await signupMsg.edit({ embeds: [makeSignupEmbed(s)], components: [makeButtons()] });
    await interaction.followUp({ content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** joined! (${s.players.length} in)` });
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'cancelled') return;
    const s = activeSessions.get(channelId);
    if (!s || s.teams.length > 0) return; // already started
    s.collector = null;
    if (s.players.length < 2) {
      activeSessions.delete(channelId);
      return channel.send(`❌ Not enough players. Cancelled.`);
    }
    await startTeams(channel, guild, s);
  });
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'teams',
  activeSessions,

  async handleSlash(interaction, commandName) {
    const channelId = interaction.channel.id;
    const s         = activeSessions.get(channelId);

    // /teams
    if (commandName === 'teams') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      const team1       = interaction.options.getString('team1');
      const team2       = interaction.options.getString('team2');
      const team3       = interaction.options.getString('team3');
      const team4       = interaction.options.getString('team4');
      const sessionName = interaction.options.getString('name') || 'Team Session';
      const durationKey = interaction.options.getString('duration');
      const customSecs  = interaction.options.getInteger('timer');
      const signupSecs  = customSecs || (durationKey ? parseInt(durationKey) : 60);
      const teamNames   = [team1, team2, team3, team4].filter(Boolean);
      if (teamNames.length < 2) return interaction.reply({ content: `❌ Need at least 2 team names!`, ephemeral: true });
      await interaction.reply({ content: `<a:purplesparkle:1479210541691175054> Setting up teams...`, ephemeral: true });
      await launchTeams(interaction.channel, interaction.guild, teamNames, sessionName, signupSecs, interaction.user.username, interaction.user.id);

    // /startteams
    } else if (commandName === 'startteams') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      if (!s) return interaction.reply({ content: `❌ No team signup running here!`, ephemeral: true });
      if (s.teams.length > 0) return interaction.reply({ content: `❌ Teams already assigned!`, ephemeral: true });
      if (s.players.length < 2) return interaction.reply({ content: `❌ Need at least **2 players**!`, ephemeral: true });
      s.collector?.stop('manualstart');
      await interaction.reply({ content: `▶️ Starting teams now!`, ephemeral: true });
      await startTeams(interaction.channel, interaction.guild, s);

    // /cancelteams
    } else if (commandName === 'cancelteams') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      if (!s) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      s.collector?.stop('cancelled');
      s.lateCollector?.stop();
      activeSessions.delete(channelId);
      if (s.signupMsg) await s.signupMsg.edit({ components: [] }).catch(() => {});
      if (s.lateMsg) await s.lateMsg.edit({ components: [] }).catch(() => {});
      await interaction.reply({ content: `✅ Team session cancelled.` });

    // /teamadd
    } else if (commandName === 'teamadd') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      if (!s || !s.teams.length) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      const user     = interaction.options.getUser('player');
      const teamName = interaction.options.getString('team');
      const team     = s.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
      if (!team) return interaction.reply({ content: `❌ Team **${teamName}** not found. Teams: ${s.teams.map(t=>t.name).join(', ')}`, ephemeral: true });
      if (s.players.find(p => p.id === user.id)) return interaction.reply({ content: `⚠️ **${user.username}** is already on a team!`, ephemeral: true });
      const newMember = { id: user.id, username: user.username, points: 0 };
      team.members.push(newMember);
      s.players.push(newMember);
      // Assign role
      const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (guildMember && team.roleId) {
        const role = interaction.guild.roles.cache.get(team.roleId);
        if (role) await guildMember.roles.add(role).catch(() => {});
      }
      await interaction.reply({ content: `<:purpleverified:1479305124336767147> **${user.username}** added to **${team.emoji} ${team.name}**!` });
      await s.scoreMsg?.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});

    // /teampoints
    } else if (commandName === 'teampoints') {
      if (!canAddPoints(interaction.member)) return interaction.reply({ content: `❌ You don't have permission to add points!`, ephemeral: true });
      if (!s || !s.teams.length) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      const user   = interaction.options.getUser('player');
      const pts    = interaction.options.getInteger('points');
      const reason = interaction.options.getString('reason') || '';
      let found = false;
      for (const team of s.teams) {
        const member = team.members.find(m => m.id === user.id);
        if (member) {
          member.points = (member.points || 0) + pts;
          found = true;
          await interaction.reply({
            content: `<:purpleverified:1479305124336767147> **${pts > 0 ? '+' : ''}${pts} pts** to **${member.username}** (${team.emoji} ${team.name})${reason ? ` — ${reason}` : ''}\n📊 ${team.emoji} **${team.name}** team total: **${teamTotal(team)} pts**`,
          });
          await s.scoreMsg?.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});
          if (s.standingsMsg) {
            const sorted2 = [...s.teams].sort((a, b) => teamTotal(b) - teamTotal(a));
            const standEmbed = new EmbedBuilder()
              .setColor('#9B59B6')
              .setTitle(`🏆 ${s.sessionName || 'Team Standings'}`)
              .setDescription(sorted2.map((t, i) => {
                const medal = ['<a:1stplace:1487504691880263791>','<a:2ndplace:1487504692874580048>','<a:3rdplace:1487504694191456336>'][i] || `${i+1}.`;
                const bar   = '█'.repeat(Math.min(10, Math.max(0, Math.round(teamTotal(t) / Math.max(1, teamTotal(sorted2[0])) * 10))));
                const empty = '░'.repeat(10 - bar.length);
                return `${medal} ${t.emoji} **${t.name}**\n${bar}${empty} **${teamTotal(t)} pts**`;
              }).join('\n\n'))
              .setFooter({ text: 'Updates live as points are added' });
            await s.standingsMsg.edit({ embeds: [standEmbed] }).catch(() => {});
          }
          break;
        }
      }
      if (!found) return interaction.reply({ content: `❌ <@${user.id}> is not in any team. Use \`/teamadd\` to add them first.`, ephemeral: true });

    // /teamwin
    } else if (commandName === 'teamwin') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      if (!s || !s.teams.length) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      const teamName = interaction.options.getString('team');
      const team     = s.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
      if (!team) return interaction.reply({ content: `❌ Team **${teamName}** not found.`, ephemeral: true });
      team.wins++;
      await interaction.reply({ content: `🏆 **${team.emoji} ${team.name}** wins! (${team.wins} total wins)` });
      await s.scoreMsg?.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});

    // /teamreroll
    } else if (commandName === 'teamreroll') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      if (!s) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      // Remove old roles first
      try { await removeRoles(interaction.guild, s.teams); } catch(e) {}
      s.teams = assignTeams(s.players, s.teamNames);
      try { await assignRoles(interaction.guild, s.teams); } catch(e) {}
      await interaction.reply({ embeds: [makeTeamsEmbed(s)] });
      await s.scoreMsg?.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});

    // /teamscores
    } else if (commandName === 'teamscores') {
      if (!s || !s.teams.length) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      await interaction.reply({ embeds: [makeScoreEmbed(s)] });

    // /teamstandings — live team totals only
    } else if (commandName === 'teamstandings') {
      if (!s || !s.teams.length) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      const sorted = [...s.teams].sort((a, b) => teamTotal(b) - teamTotal(a));
      const embed  = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`🏆 ${s.sessionName || 'Team Standings'}`)
        .setDescription(
          sorted.map((t, i) => {
            const medal = ['<a:1stplace:1487504691880263791>','<a:2ndplace:1487504692874580048>','<a:3rdplace:1487504694191456336>'][i] || `${i+1}.`;
            const bar   = '█'.repeat(Math.min(10, Math.max(0, Math.round(teamTotal(t) / Math.max(1, teamTotal(sorted[0])) * 10))));
            const empty = '░'.repeat(10 - bar.length);
            return medal + ' ' + t.emoji + ' **' + t.name + '**\n' + bar + empty + ' **' + teamTotal(t) + ' pts**';
          }).join('\n\n')
        )
        .setFooter({ text: 'Updates live as points are added' });

      // If there's already a standings msg, update it; otherwise post new
      if (!s.standingsMsg) {
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        s.standingsMsg = msg;
      } else {
        await s.standingsMsg.edit({ embeds: [embed] }).catch(() => {});
        await interaction.reply({ content: `✅ Standings updated!`, ephemeral: true });
      }

    // /teamleave — player removes themselves
    } else if (commandName === 'teamleave') {
      if (!s || !s.teams.length) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      let found = false;
      for (const team of s.teams) {
        const idx = team.members.findIndex(m => m.id === interaction.user.id);
        if (idx !== -1) {
          team.members.splice(idx, 1);
          const pi = s.players.findIndex(p => p.id === interaction.user.id);
          if (pi !== -1) s.players.splice(pi, 1);
          // Remove role
          const guildMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
          if (guildMember && team.roleId) {
            const role = interaction.guild.roles.cache.get(team.roleId);
            if (role) await guildMember.roles.remove(role).catch(() => {});
          }
          found = true;
          await interaction.reply({ content: `✅ **${interaction.user.username}** has left **${team.emoji} ${team.name}**.` });
          await s.scoreMsg?.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});
          break;
        }
      }
      if (!found) return interaction.reply({ content: `❌ You are not in any team!`, ephemeral: true });

    // /teamremove — host removes someone
    } else if (commandName === 'teamremove') {
      if (!hasHostRole(interaction.member) && !canAddPoints(interaction.member)) {
        return interaction.reply({ content: `❌ You don't have permission to remove players!`, ephemeral: true });
      }
      if (!s || !s.teams.length) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });
      const user = interaction.options.getUser('player');
      let found = false;
      for (const team of s.teams) {
        const idx = team.members.findIndex(m => m.id === user.id);
        if (idx !== -1) {
          team.members.splice(idx, 1);
          const pi = s.players.findIndex(p => p.id === user.id);
          if (pi !== -1) s.players.splice(pi, 1);
          // Remove role
          const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (guildMember && team.roleId) {
            const role = interaction.guild.roles.cache.get(team.roleId);
            if (role) await guildMember.roles.remove(role).catch(() => {});
          }
          found = true;
          await interaction.reply({ content: `✅ **${user.username}** removed from **${team.emoji} ${team.name}**.` });
          await s.scoreMsg?.edit({ embeds: [makeScoreEmbed(s)] }).catch(() => {});
          break;
        }
      }
      if (!found) return interaction.reply({ content: `❌ <@${user.id}> is not in any team.`, ephemeral: true });

    // /teampointsrole
    } else if (commandName === 'teampointsrole') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      const role   = interaction.options.getRole('role');
      const action = interaction.options.getString('action') || 'add';
      if (action === 'remove') {
        pointsRoles.delete(role.id);
        return interaction.reply({ content: `✅ **${role.name}** can no longer add team points.` });
      } else {
        pointsRoles.add(role.id);
        return interaction.reply({ content: `✅ **${role.name}** can now use \`/teampoints\`!` });
      }

    // /teamend
    } else if (commandName === 'teamend') {
      if (!hasHostRole(interaction.member)) return interaction.reply({ content: `❌ Admins only!`, ephemeral: true });
      if (!s) return interaction.reply({ content: `❌ No active team session here!`, ephemeral: true });

      // Ask about roles
      const keepId   = `teamend_keep_${channelId}`;
      const removeId = `teamend_remove_${channelId}`;
      await interaction.reply({
        content: `🏁 **End the team session?**\nWhat should happen to the team roles?`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(keepId).setLabel('✅ Keep Roles').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(removeId).setLabel('❌ Remove Roles').setStyle(ButtonStyle.Danger),
        )],
        ephemeral: true,
      });

      const msg = await interaction.fetchReply();
      const btnCollector = msg.createMessageComponentCollector({ time: 30000, max: 1 });

      btnCollector.on('collect', async (i) => {
        const removeRolesOnEnd = i.customId === removeId;
        await i.deferUpdate();

        activeSessions.delete(channelId);
        s.collector?.stop('ended');
        s.lateCollector?.stop();
        if (s.lateMsg) await s.lateMsg.edit({ components: [] }).catch(() => {});

        if (removeRolesOnEnd) {
          try { await removeRoles(interaction.guild, s.teams); } catch(e) {}
        }

        const sorted = [...s.teams].sort((a, b) => teamTotal(b) - teamTotal(a));
        const winner = sorted[0];
        const finalEmbed = makeScoreEmbed(s);
        finalEmbed.setTitle(`🏁 Final Results — ${s.sessionName || 'Team Session'}`);
        finalEmbed.setDescription(
          `🏆 **${winner.emoji} ${winner.name}** wins with **${teamTotal(winner)} pts**!\n\n` +
          sorted.map((t, idx) => {
            const medal = ['<a:1stplace:1487504691880263791>','<a:2ndplace:1487504692874580048>','<a:3rdplace:1487504694191456336>'][idx] || `${idx+1}.`;
            return `${medal} ${t.emoji} **${t.name}** — **${teamTotal(t)} pts** (${t.wins} win${t.wins !== 1 ? 's' : ''})`;
          }).join('\n') +
          (removeRolesOnEnd ? '\n\n*Team roles removed.*' : '\n\n*Team roles kept.*')
        );
        finalEmbed.setFooter({ text: 'Session ended' });
        await s.scoreMsg?.edit({ embeds: [finalEmbed] }).catch(() => {});
        await interaction.channel.send({ embeds: [finalEmbed] });
      });
    }
  },

  async handleCommand(message, args) {
    if (!hasHostRole(message.member)) return message.reply(`❌ Admins only!`);
    const names = args.join(' ').match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, ''));
    if (!names || names.length < 2) return message.reply('❌ Usage: `!teams "Team A" "Team B"`');
    await launchTeams(message.channel, message.guild, names, 'Team Session', 60, message.author.username, message.author.id);
  },
};
