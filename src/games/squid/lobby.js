/**
 * lobby.js — the signup lobby for every Squid Games mode (persistent version).
 * The lobby is just a message + a collector with NO timer of its own: the manager's scheduler decides
 * when it starts / expires, and after a restart the same message is re-attached (attachLobby).
 * Entry fees are taken at join and recorded in the database (NOT in the crash-refund table), so a
 * restart never refunds or loses anyone.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const guildEconomy = require('../../utils/guildEconomy');
const { BRAND, COLORS } = require('./common');
const store = require('./store');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

// Join-button emoji per mode
const JOIN_EMOJI = {
  tournament: { id: '1560791854981709877', name: 'pot', animated: true },
  mingle: { id: '1560787248902053958', name: 'thanos', animated: true },
  glassbridge: { id: '1560789535330144286', name: 'bridge', animated: true },
  roulette: { id: '1560790984839790732', name: 'russianroulette', animated: true },
};
const SEMAFORO = { id: '1560779249248641095', name: 'semaforo', animated: true };

const ids = s => ({ join: `sq_join_${s.channel.id}`, leave: `sq_leave_${s.channel.id}`, rules: `sq_rules_${s.channel.id}`, start: `sq_start_${s.channel.id}` });

function lobbyEmbed(s) {
  const ts = s.startAt ? Math.floor(s.startAt / 1000) : null;
  return new EmbedBuilder().setColor(COLORS.purple)
    .setTitle(`😈 ${s.title} — Signups!`)
    .setDescription(
      (s.bet > 0 ? `<a:moneybag:1479268556687540345> Entry: **${s.bet} sins** (refunded if you leave or it's cancelled)\n` : `<a:moneybag:1479268556687540345> Free entry\n`) +
      (s.prize > 0 ? `<a:trophies:1507765453299122387> Host prize: **${s.prize.toLocaleString()} sins**\n` : '') +
      `Players: **${s.minPlayers}–${s.maxPlayers}** • ${ts ? `Starts <t:${ts}:F> (<t:${ts}:R>)` : 'Starts when the host presses **Start Game** — everyone who joined gets pinged'}`)
    .addFields({ name: `<:member:1495666085121491024> Signed up (${s.players.length})`, value: s.players.length ? s.players.map(p => `• **${p.username}**`).slice(0, 40).join('\n') : 'Nobody yet…' })
    .setFooter({ text: `Host: ${s.hostName} • ${BRAND}` });
}
function lobbyButtons(s, closed = false) {
  const i = ids(s);
  if (closed) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(i.join).setLabel('Closed').setStyle(ButtonStyle.Secondary).setDisabled(true))];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(i.join).setLabel('Join').setEmoji(JOIN_EMOJI[s.mode] || SEMAFORO).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(i.rules).setLabel('Rules').setEmoji({ id: '1511510712986632352', name: 'rules', animated: true }).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(i.start).setLabel('Start Game').setEmoji({ id: '1532595713010040972', name: 'CheckCheckmarkSticker', animated: true }).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(i.leave).setLabel('Leave').setEmoji({ id: '1552118083777208420', name: 'escape', animated: true }).setStyle(ButtonStyle.Danger))];
}

/** Post a fresh lobby message (or re-use `msg`) and listen for clicks. */
async function attachLobby(s, msg) {
  if (!msg) {
    msg = await s.channel.send({ embeds: [lobbyEmbed(s)], components: lobbyButtons(s) });
    s.lobbyMessageId = msg.id;
  } else {
    await msg.edit({ embeds: [lobbyEmbed(s)], components: lobbyButtons(s) }).catch(() => {});
  }
  s.lobbyMessage = msg;
  const i = ids(s);
  const collector = msg.createMessageComponentCollector();          // no timer — the scheduler owns time
  s.lobbyCollector = collector;
  const refresh = () => msg.edit({ embeds: [lobbyEmbed(s)], components: lobbyButtons(s) }).catch(() => {});
  s.refreshLobby = refresh;

  collector.on('collect', async (ix) => {
    if (s.phase !== 'lobby') return ix.reply({ content: 'Signups are closed.', ephemeral: true }).catch(() => {});
    try {
      if (ix.customId === i.rules) return ix.reply({ content: s.rules, ephemeral: true });
      if (ix.customId === i.start) {
        if (ix.user.id !== s.hostId && !hasHostRole(ix.member)) return ix.reply({ content: `<:wrong:1495666083594502174> Only **${s.hostName}** or an Event Host can start.`, ephemeral: true });
        if (s.players.length < s.minPlayers) return ix.reply({ content: `<:wrong:1495666083594502174> Need at least **${s.minPlayers} players**!`, ephemeral: true });
        await ix.deferUpdate();
        return s.onStart && s.onStart();
      }
      if (ix.customId === i.leave) {
        const idx = s.players.findIndex(p => p.id === ix.user.id);
        if (idx === -1) return ix.reply({ content: "You're not signed up.", ephemeral: true });
        const [p] = s.players.splice(idx, 1);
        await ix.deferUpdate();
        await store.save(s);                                         // saved first: leaving is final
        if (s.bet > 0) await guildEconomy.addFunds(s.guildId, p.id, p.username, s.bet, `${s.gameLabel} leave refund #${s.id}`);
        await refresh();
        return ix.followUp({ content: `🚪 You left${s.bet > 0 ? ` and got **${s.bet} sins** back` : ''}.`, ephemeral: true });
      }
      if (ix.customId !== i.join) return;
      await ix.deferUpdate();
      if (s.players.find(p => p.id === ix.user.id)) return ix.followUp({ content: '<a:Warning:1497476844860215366> Already joined!', ephemeral: true });
      if (s.players.length >= s.maxPlayers) return ix.followUp({ content: '<:wrong:1495666083594502174> The lobby is full.', ephemeral: true });
      const player = { id: ix.user.id, username: ix.member?.displayName || ix.user.username };
      if (s.bet > 0) {
        const ok = await guildEconomy.removeFunds(s.guildId, player.id, ix.user.username, s.bet, `${s.gameLabel} entry #${s.id}`);
        if (!ok) return ix.followUp({ content: `<:wrong:1495666083594502174> Need **${s.bet} sins**!`, ephemeral: true });
      }
      s.players.push(player);
      await store.save(s);                                           // fee taken → record it right away
      await refresh();
      await ix.followUp({ content: `😈 You're in! Don't blink.`, ephemeral: true });
    } catch (err) { console.error('[squid lobby]', err); }
  });
  return msg;
}

function closeLobby(s) {
  try { s.lobbyCollector?.stop('closed'); } catch {}
  return s.lobbyMessage?.edit({ components: lobbyButtons(s, true) }).catch(() => {});
}

/** Has this user already got a ledger row with this exact reason since the session began? (idempotent payouts) */
async function hasTx(s, userId, reason) {
  try {
    const rows = await guildEconomy.getHistory(s.guildId, userId, 50);
    const since = s.createdAt ? new Date(s.createdAt).getTime() - 60000 : 0;
    return rows.some(r => r.reason === reason && new Date(r.created_at).getTime() >= since);
  } catch { return false; }
}

/** Refund every entry fee + the host prize, exactly once each, surviving a crash half-way. */
async function refundEveryone(s, reason) {
  if (s.paid) return;
  s.phase = 'cancelling';
  s.settings.refunded = s.settings.refunded || [];
  await store.save(s);
  if (s.bet > 0) {
    for (const p of s.players) {
      if (s.settings.refunded.includes(p.id)) continue;
      const why = `${reason} #${s.id}`;
      if (!(await hasTx(s, p.id, why))) {
        await guildEconomy.addFunds(s.guildId, p.id, p.username, s.bet, why).catch(err => console.error('[squid refund]', err.message));
      }
      s.settings.refunded.push(p.id);
      await store.save(s);
    }
  }
  if (s.prize > 0 && s.prizeHeld) {
    const why = `${s.gameLabel} prize returned #${s.id}`;
    if (!(await hasTx(s, s.hostId, why))) await guildEconomy.addFunds(s.guildId, s.hostId, s.hostName, s.prize, why).catch(() => {});
    s.prizeHeld = false;
  }
  s.phase = 'cancelled';
  await store.save(s);
}

module.exports = { attachLobby, closeLobby, refundEveryone, hasHostRole, hasTx, lobbyEmbed };
