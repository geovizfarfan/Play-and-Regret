/**
 * manager.js — Squid Games tournament manager + /squid command (stage 1 / 6)
 * Modular on purpose: a game is just an engine  run(channel, players, ctx) → { survivors, eliminated }.
 * To add Marbles, Jump Rope, Tug of War… later: write the engine, add one line to ENGINES,
 * and list it in a sequence — custom tournaments are just a different sequence.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy } = require('../../utils/database');
const guildEconomy = require('../../utils/guildEconomy');
const jackpot = require('../../utils/jackpot');
const { BRAND, COLORS, sleep, secureInt, names } = require('./common');
const { runLobby, refundEveryone, hasHostRole } = require('./lobby');
const registry = require('./registry');
const redlight = require('../redlight/redlight');
const mingle = require('./mingle');
const glassbridge = require('./glassbridge');
const roulette = require('./roulette');

const sessions = new Map();   // channelId → session
const TAX = 0.10;

const ENGINES = {
  redlight:    { label: 'Red Light, Green Light', emoji: '🚦', run: redlight.playRedLight,
    rules: '🚦 **Red Light, Green Light** — GREEN: every *original* message you type = 1 step (max 1/sec; repeats, copy-paste and tiny edits earn nothing). RED: send *anything* and you\'re eliminated. Reach the finish line!' },
  mingle:      { label: 'Mingle', emoji: '🎠', run: mingle.run,
    rules: '🎠 **Mingle** — a group size is announced. Run into a room with **exactly** that many people before the doors lock (you can switch rooms). Full rooms survive, everyone else is out.' },
  glassbridge: { label: 'Glass Bridge', emoji: '🌉', run: glassbridge.run,
    rules: '🌉 **Glass Bridge** — go one at a time in random order, picking LEFT or RIGHT. One panel per row shatters. Revealed rows stay revealed. Early players get one free private scan.' },
  roulette:    { label: 'The Final Regret', emoji: '🎰', run: roulette.run,
    rules: '🎰 **The Final Regret** — a six-chamber wheel of fate. Every spin is an independent, equal draw. Last sinner standing wins.' },
};
const TOURNAMENT = ['redlight', 'mingle', 'glassbridge', 'roulette'];

const modeLabel = mode => mode === 'tournament' ? 'Full Tournament' : ENGINES[mode].label;

// ─── Between games (tournament): summary, countdown, host pause / start-now ──
async function between(session, finished, nextKey, res, alive, all) {
  const { channel } = session;
  const out = res.eliminated.length;
  const next = ENGINES[nextKey];
  const wait = session.auto ? 20 : null;
  let paused = false, remaining = wait, startNow = false;
  const mk = () => new EmbedBuilder().setColor(COLORS.gold)
    .setTitle(`✅ ${ENGINES[finished].label} complete`)
    .setDescription(
      `**${alive.length}** survive • **${out}** eliminated\n` +
      `Qualified: ${names(all, alive.map(p => p.id), 15)}\n\n` +
      `**Next up:** ${next.emoji} ${next.label}\n` +
      (paused ? '⏸️ **Paused by the host.**' : session.auto ? `Starting in **${remaining}s**` : 'Waiting for the host to press **Start next game**.'))
    .setFooter({ text: BRAND });
  const buttons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sqm_go_${channel.id}`).setLabel('Start next game').setEmoji('▶️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sqm_pause_${channel.id}`).setLabel(paused ? 'Resume' : 'Pause').setEmoji(paused ? '⏯️' : '⏸️').setStyle(ButtonStyle.Secondary));
  const msg = await channel.send({ embeds: [mk()], components: [buttons()] });
  const col = msg.createMessageComponentCollector({ time: 60 * 60 * 1000 });
  col.on('collect', async (i) => {
    if (i.user.id !== session.hostId && !hasHostRole(i.member)) return i.reply({ content: '<:wrong:1495666083594502174> Only the host or an Event Host.', ephemeral: true }).catch(() => {});
    if (i.customId.startsWith('sqm_go_')) { startNow = true; col.stop('go'); return i.deferUpdate().catch(() => {}); }
    paused = !paused;
    if (!paused && wait) remaining = Math.max(remaining, 10);
    await i.update({ embeds: [mk()], components: [buttons()] }).catch(() => {});
  });
  session.state.onCancel = () => col.stop('cancel');
  let tick = 0;
  while (!startNow && !session.state.cancelled && col.ended !== true) {
    await sleep(1000);
    if (session.state.cancelled || startNow) break;
    if (session.auto && !paused) {
      remaining--;
      if (remaining <= 0) break;
      if (++tick % 5 === 0) await msg.edit({ embeds: [mk()] }).catch(() => {});
    }
  }
  col.stop('done');
  await msg.edit({ components: [] }).catch(() => {});
}

// ─── Payout (once) ──────────────────────────────────────────────────────────
async function payChampion(session, winner) {
  if (session.paid) return;
  session.paid = true;                                           // before any await → no double payout
  const pot = session.bet * session.players.length;
  const tax = Math.floor(pot * TAX);
  const prize = pot - tax + (session.prize || 0);
  if (prize > 0) await guildEconomy.addFunds(session.channel.guild.id, winner.id, winner.username, prize, `${session.gameLabel} win`);
  if (tax > 0) await jackpot.addToDrawFund(tax).catch(() => {});
  await economy.untrackGameChannel(session.channel.id).catch(() => {});
  return { prize, tax };
}

async function runSession(session) {
  const { channel } = session;
  const ctx = { mode: session.mode === 'tournament' ? 'tournament' : 'standalone', state: session.state, fast: session.fast };
  const sequence = session.mode === 'tournament' ? TOURNAMENT : [session.mode];
  let alive = session.players.slice();
  const all = session.players.slice();
  session.phase = 'running';

  for (let i = 0; i < sequence.length && !session.state.cancelled; i++) {
    const key = sequence[i];
    if (alive.length <= 1) break;                                // exactly one left → champion early
    session.stage = key;
    const before = alive.length;
    const res = await ENGINES[key].run(channel, alive, ctx);
    if (session.state.cancelled) return;
    let surv = (res?.survivors || []);
    if (!surv.length) surv = [alive[secureInt(alive.length)].id];   // safety net: an engine should never wipe the field
    const nextAlive = alive.filter(p => surv.includes(p.id));
    session.history.push({ game: key, from: before, to: nextAlive.length });
    alive = nextAlive;
    if (i < sequence.length - 1 && alive.length > 1) await between(session, key, sequence[i + 1], { eliminated: res?.eliminated || [] }, alive, all);
  }
  if (session.state.cancelled) return;

  const winner = alive.length === 1 ? alive[0] : alive[secureInt(alive.length)];
  const paid = await payChampion(session, winner);
  const e = new EmbedBuilder().setColor(COLORS.gold)
    .setTitle(session.mode === 'tournament' ? '👑 SQUID REGRET — ULTIMATE CHAMPION!' : `👑 ${modeLabel(session.mode)} — WINNER!`)
    .setDescription(
      `**${winner.username}** ${session.mode === 'tournament' ? 'survived every game and is the one and only champion' : 'wins'}!\n\n` +
      session.history.map(h => `${ENGINES[h.game].emoji} ${ENGINES[h.game].label}: ${h.from} → **${h.to}**`).join('\n') +
      (paid?.prize ? `\n\n<a:moneybag:1479268556687540345> **${paid.prize.toLocaleString()} sins** to the winner` : '') +
      (paid?.tax ? `\n<a:jackpot:1479203793806557385> **${paid.tax.toLocaleString()} sins** → jackpot` : ''))
    .setFooter({ text: BRAND });
  await channel.send({ embeds: [e] }).catch(() => {});
}

function cleanup(session) {
  sessions.delete(session.channel.id);
  registry.busy.delete(session.channel.id);
}

async function startSession(interaction, opts) {
  const channel = interaction.channel;
  if (sessions.has(channel.id) || registry.busy.has(channel.id) || redlight.activeGames.has(channel.id)) {
    return interaction.editReply({ content: '<:wrong:1495666083594502174> A game is already running in this channel.' });
  }
  const mode = opts.mode;
  const hostName = interaction.member?.displayName || interaction.user.username;
  const session = {
    channel, mode, hostId: interaction.user.id, hostName,
    bet: opts.bet, prize: opts.prize, signupSec: opts.signup, minPlayers: opts.min, maxPlayers: opts.max, auto: opts.auto,
    phase: 'lobby', players: [], history: [], state: { cancelled: false, onCancel: null }, paid: false, fast: !!opts.fast,
    gameLabel: `Squid Games — ${modeLabel(mode)}`,
    title: `PLAY & REGRET — SQUID GAMES: ${modeLabel(mode)}`,
    blurb: mode === 'tournament'
      ? 'Four games, one champion: 🚦 Red Light, Green Light → 🎠 Mingle → 🌉 Glass Bridge → 🎰 The Final Regret.\nRegister once — survivors advance automatically.'
      : ENGINES[mode].rules,
    rules: mode === 'tournament'
      ? `👑 **Full Tournament** — register once, survive four games, one champion.\n\n${TOURNAMENT.map(k => ENGINES[k].rules).join('\n\n')}`
      : ENGINES[mode].rules,
  };
  // Host-funded prize: taken up front (with an affordability check) and tracked so a crash refunds it
  if (session.prize > 0) {
    const ok = await guildEconomy.removeFunds(interaction.guild.id, session.hostId, hostName, session.prize, `${session.gameLabel} prize`);
    if (!ok) return interaction.editReply({ content: `<:wrong:1495666083594502174> You need **${session.prize.toLocaleString()} sins** to fund that prize.` });
    await economy.trackGameEntry(session.hostId, hostName, channel.id, `${session.gameLabel} (host prize)`, session.prize).catch(() => {});
  }
  sessions.set(channel.id, session);
  registry.busy.add(channel.id);
  await interaction.editReply({ content: '😈 Squid Games lobby opened!' });

  try {
    const ok = await runLobby(session);
    if (session.state.cancelled) return;
    if (!ok) {
      await refundEveryone(session, `${session.gameLabel} refund`);
      await channel.send(`<:wrong:1495666083594502174> Not enough players (need ${session.minPlayers}).${session.bet > 0 ? ' Entries refunded.' : ''}`).catch(() => {});
      return;
    }
    await runSession(session);
  } catch (err) {
    console.error('[squid error]', err.stack || err);
    if (!session.paid) {
      await refundEveryone(session, `${session.gameLabel} refund (error)`);
      channel.send('<:wrong:1495666083594502174> Something broke — everyone has been refunded.').catch(() => {});
    }
  } finally {
    if (session.prizeUnpaidGuard) { /* reserved */ }
    cleanup(session);
  }
}

async function cancel(channel, userId, member) {
  const s = sessions.get(channel.id);
  if (!s) return { ok: false, msg: 'No Squid Games session here.' };
  if (s.hostId !== userId && !hasHostRole(member)) return { ok: false, blocked: true, msg: '<:wrong:1495666083594502174> Only the host or an Event Host can cancel.' };
  s.state.cancelled = true; s.cancelled = true;
  try { s.state.onCancel?.(); } catch {}
  try { s.stopLobby?.('cancel'); } catch {}
  await refundEveryone(s, `${s.gameLabel} cancelled`);
  cleanup(s);
  return { ok: true, msg: '<:checkmark:1495666088417956002> Squid Games cancelled. Entry fees and the host prize were refunded.' };
}

// ─── /squid ───────────────────────────────────────────────────────────────────
async function handleSlash(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'rules') {
    const mode = interaction.options.getString('game') || 'tournament';
    const text = mode === 'tournament'
      ? `👑 **Full Tournament** — register once, survive four games, one champion.\n\n${TOURNAMENT.map(k => ENGINES[k].rules).join('\n\n')}`
      : ENGINES[mode].rules;
    return interaction.reply({ content: text, ephemeral: true });
  }
  if (sub === 'status') {
    const s = sessions.get(interaction.channelId);
    if (!s) return interaction.reply({ content: 'No Squid Games session in this channel.', ephemeral: true });
    return interaction.reply({ ephemeral: true, content:
      `**${modeLabel(s.mode)}** — phase: **${s.phase}**${s.stage ? ` • now: ${ENGINES[s.stage].label}` : ''}\nPlayers signed up: **${s.players.length}** • entry: ${s.bet > 0 ? `${s.bet} sins` : 'free'} • host: ${s.hostName}\n` +
      (s.history.length ? s.history.map(h => `${ENGINES[h.game].label}: ${h.from} → ${h.to}`).join(' • ') : '') });
  }
  if (sub === 'cancel') {
    const member = interaction.member;
    const r = await cancel(interaction.channel, interaction.user.id, member);
    return interaction.reply({ content: r.msg, ephemeral: !r.ok });
  }
  if (sub === 'host') {
    if (!hasHostRole(interaction.member)) return interaction.reply({ content: '<:wrong:1495666083594502174> Only Event Hosts and admins can host Squid Games.', ephemeral: true });
    const feeOpt = interaction.options.getBoolean('fee');
    const min = interaction.options.getInteger('min') || 2;
    const max = interaction.options.getInteger('max') || 50;
    if (min > max) return interaction.reply({ content: '<:wrong:1495666083594502174> Min players can\'t be above max players.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    return startSession(interaction, {
      mode: interaction.options.getString('game') || 'tournament',
      bet: feeOpt === false ? 0 : (interaction.options.getInteger('bet') || 50),
      prize: interaction.options.getInteger('prize') || 0,
      signup: interaction.options.getInteger('signup') || 90,
      min, max,
      auto: interaction.options.getBoolean('auto') !== false,
    });
  }
}

module.exports = { handleSlash, cancel, sessions, ENGINES, TOURNAMENT, _test: { startSession, runSession, between } };
