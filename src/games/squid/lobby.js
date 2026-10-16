/**
 * lobby.js — one signup lobby for every Squid Games mode.
 * Players join with a button (once), pay the optional entry fee (tracked so a crash refunds them),
 * and the host (or the timer) starts it. Returns the players or null if it fell through.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy } = require('../../utils/database');
const guildEconomy = require('../../utils/guildEconomy');
const { BRAND, COLORS } = require('./common');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

/**
 * @param session  { channel, hostId, hostName, bet, signupSec, minPlayers, maxPlayers, title, blurb, gameLabel, players:[], cancelled }
 * @returns {Promise<boolean>} true → enough players, ready to run
 */
async function runLobby(session) {
  const { channel, bet, signupSec, minPlayers, maxPlayers } = session;
  const id = channel.id;
  const joinId = `sq_join_${id}`, leaveId = `sq_leave_${id}`, rulesId = `sq_rules_${id}`, startId = `sq_start_${id}`;
  session.players = [];
  const endsAt = Math.floor((Date.now() + signupSec * 1000) / 1000);

  const embed = () => new EmbedBuilder().setColor(COLORS.purple)
    .setTitle(`😈 ${session.title} — Signups!`)
    .setDescription(
      `${session.blurb}\n\n` +
      (bet > 0 ? `<a:moneybag:1479268556687540345> Entry: **${bet} sins**\n` : `<a:moneybag:1479268556687540345> Free entry\n`) +
      (session.prize > 0 ? `<a:trophies:1507765453299122387> Host prize: **${session.prize.toLocaleString()} sins**\n` : '') +
      `Players: **${minPlayers}–${maxPlayers}** • Signups close <t:${endsAt}:R>`)
    .addFields({ name: `Signed up (${session.players.length})`, value: session.players.length ? session.players.map(p => `• **${p.username}**`).slice(0, 40).join('\n') : 'Nobody yet…' })
    .setFooter({ text: `Host: ${session.hostName} • ${BRAND}` });
  const buttons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('Join').setEmoji('😈').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(leaveId).setLabel('Leave').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(rulesId).setLabel('Rules').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(startId).setLabel('Start').setEmoji('▶️').setStyle(ButtonStyle.Primary),
  );

  const msg = await channel.send({ embeds: [embed()], components: [buttons()] });
  session.lobbyMessage = msg;
  const collector = msg.createMessageComponentCollector({ time: signupSec * 1000 });
  session.stopLobby = (reason) => collector.stop(reason);
  const refresh = () => msg.edit({ embeds: [embed()], components: [buttons()] }).catch(() => {});

  collector.on('collect', async (i) => {
    if (session.phase !== 'lobby') return i.reply({ content: 'Signups are closed.', ephemeral: true }).catch(() => {});
    try {
      if (i.customId === rulesId) return i.reply({ content: session.rules, ephemeral: true });
      if (i.customId === startId) {
        if (i.user.id !== session.hostId && !hasHostRole(i.member)) return i.reply({ content: `<:wrong:1495666083594502174> Only **${session.hostName}** or an Event Host can start.`, ephemeral: true });
        if (session.players.length < minPlayers) return i.reply({ content: `<:wrong:1495666083594502174> Need at least **${minPlayers} players**!`, ephemeral: true });
        await i.deferUpdate();
        return collector.stop('forcestart');
      }
      if (i.customId === leaveId) {
        const idx = session.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: "You're not signed up.", ephemeral: true });
        const [p] = session.players.splice(idx, 1);
        await i.deferUpdate();
        if (bet > 0) {
          await guildEconomy.addFunds(i.guild.id, p.id, p.username, bet, `${session.gameLabel} leave refund`);
          await economy.untrackGameEntry(p.id, id).catch(() => {});
        }
        await refresh();
        return i.followUp({ content: `🚪 You left${bet > 0 ? ` and got **${bet} sins** back` : ''}.`, ephemeral: true });
      }
      if (i.customId !== joinId) return;
      await i.deferUpdate();
      if (session.players.find(p => p.id === i.user.id)) return i.followUp({ content: '<a:Warning:1497476844860215366> Already joined!', ephemeral: true });
      if (session.players.length >= maxPlayers) return i.followUp({ content: '<:wrong:1495666083594502174> The lobby is full.', ephemeral: true });
      if (bet > 0) {
        const ok = await guildEconomy.removeFunds(i.guild.id, i.user.id, i.user.username, bet, `${session.gameLabel} entry`);
        if (!ok) return i.followUp({ content: `<:wrong:1495666083594502174> Need **${bet} sins**!`, ephemeral: true });
        await economy.trackGameEntry(i.user.id, i.user.username, id, session.gameLabel, bet).catch(() => {});
      }
      session.players.push({ id: i.user.id, username: i.member?.displayName || i.user.username });
      await refresh();
      await i.followUp({ content: `😈 You're in! Don't blink.`, ephemeral: true });
    } catch (err) { console.error('[squid lobby]', err); }
  });

  await new Promise(resolve => collector.on('end', resolve));
  await msg.edit({ components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('Closed').setStyle(ButtonStyle.Secondary).setDisabled(true))] }).catch(() => {});
  if (session.cancelled) return false;
  return session.players.length >= minPlayers;
}

/** Refund every entry fee (once) and clear crash-tracking for the channel. */
async function refundEveryone(session, reason) {
  if (session.refunded || session.paid) return;
  session.refunded = true;
  if (session.bet > 0) {
    for (const p of session.players) {
      await guildEconomy.addFunds(session.channel.guild.id, p.id, p.username, session.bet, reason).catch(err => console.error('[squid refund]', err.message));
    }
  }
  if (session.prize > 0 && !session.prizeReturned) {
    session.prizeReturned = true;
    await guildEconomy.addFunds(session.channel.guild.id, session.hostId, session.hostName, session.prize, `${session.gameLabel} prize returned`).catch(() => {});
  }
  await economy.untrackGameChannel(session.channel.id).catch(() => {});
}

module.exports = { runLobby, refundEveryone, hasHostRole };
