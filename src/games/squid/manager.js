/**
 * manager.js — Squid Games tournament manager + /squid command (stage 1 / 6)
 * Modular on purpose: a game is just an engine  run(channel, players, ctx) → { survivors, eliminated }.
 * To add Marbles, Jump Rope, Tug of War… later: write the engine, add one line to ENGINES,
 * and list it in a sequence — custom tournaments are just a different sequence.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const guildEconomy = require('../../utils/guildEconomy');
const jackpot = require('../../utils/jackpot');
const { BRAND, COLORS, sleep, secureInt, names, ping } = require('./common');
const { attachLobby, closeLobby, refundEveryone, hasHostRole, hasTx } = require('./lobby');
const store = require('./store');
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
  await ping(channel, alive.map(p => p.id), `🔔 **${next.label}** is next — qualified sinners, get ready!`);
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

// ─── Payout (exactly once, even across a restart) ───────────────────────────
async function payChampion(session, winner) {
  const pot = session.bet * session.players.length;
  const tax = Math.floor(pot * TAX);
  const prize = pot - tax + (session.prize || 0);
  const why = `${session.gameLabel} win #${session.id}`;
  if (session.settings.paidOut) return { prize, tax };
  if (prize > 0 && !(await hasTx(session, winner.id, why))) await guildEconomy.addFunds(session.guildId, winner.id, winner.username, prize, why);
  if (tax > 0 && !session.settings.taxed) { session.settings.taxed = true; await jackpot.addToDrawFund(tax).catch(() => {}); }
  session.settings.paidOut = true;
  session.paid = true;
  await store.save(session);
  return { prize, tax };
}

async function announceWinner(session, winner, paid) {
  const e = new EmbedBuilder().setColor(COLORS.gold)
    .setTitle(session.mode === 'tournament' ? '👑 SQUID REGRET — ULTIMATE CHAMPION!' : `👑 ${modeLabel(session.mode)} — WINNER!`)
    .setDescription(
      `**${winner.username}** ${session.mode === 'tournament' ? 'survived every game and is the one and only champion' : 'wins'}!\n\n` +
      session.history.map(h => `${ENGINES[h.game].emoji} ${ENGINES[h.game].label}: ${h.from} → **${h.to}**`).join('\n') +
      (paid?.prize ? `\n\n<a:moneybag:1479268556687540345> **${paid.prize.toLocaleString()} sins** to the winner` : '') +
      (paid?.tax ? `\n<a:jackpot:1479203793806557385> **${paid.tax.toLocaleString()} sins** → jackpot` : ''))
    .setFooter({ text: BRAND });
  await session.channel.send({ embeds: [e] }).catch(() => {});
}

async function finish(session, winner) {
  session.phase = 'paying';
  session.winnerId = winner.id;
  session.settings.winnerName = winner.username;
  await store.save(session);
  const paid = await payChampion(session, winner);
  session.phase = 'done';
  session.prizeHeld = false;
  await store.save(session);
  await announceWinner(session, winner, paid);
}

async function runSession(session, resume = false) {
  const { channel } = session;
  const ctx = { mode: session.mode === 'tournament' ? 'tournament' : 'standalone', state: session.state, fast: session.fast, overrides: session.settings.steps ? { finish: session.settings.steps } : null };
  const sequence = session.mode === 'tournament' ? TOURNAMENT : [session.mode];
  const all = session.players.slice();
  let alive = session.alive ? all.filter(p => session.alive.includes(p.id)) : all.slice();
  session.phase = 'running';
  if (!session.alive) { session.alive = alive.map(p => p.id); }
  await store.save(session);
  if (resume) {
    await ping(channel, alive.map(p => p.id), `♻️ **The bot restarted — your game was saved!** Resuming ${sequence[session.stageIndex] ? ENGINES[sequence[session.stageIndex]].label : 'now'} with **${alive.length}** sinners in 15 seconds.`);
    await sleep(session.fast ? 30 : 15000);
  } else {
    await ping(channel, alive.map(p => p.id), `🚨 **${modeLabel(session.mode)} is starting in 10 seconds!** Get to this channel, sinners.`);
    await sleep(session.fast ? 30 : 10000);
  }

  for (let i = session.stageIndex || 0; i < sequence.length && !session.state.cancelled; i++) {
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
    session.alive = alive.map(p => p.id);
    session.stageIndex = i + 1;
    await store.save(session);                                    // checkpoint: a restart resumes from the NEXT game
    if (i < sequence.length - 1 && alive.length > 1) await between(session, key, sequence[i + 1], { eliminated: res?.eliminated || [] }, alive, all);
  }
  if (session.state.cancelled) return;
  const winner = alive.length === 1 ? alive[0] : alive[secureInt(alive.length)];
  await finish(session, winner);
}

function cleanup(session) {
  session.dead = true;
  sessions.delete(session.channel.id);
  registry.busy.delete(session.channel.id);
}

// ─── Lobby → start / expire ───────────────────────────────────────────────────
const LOBBY_MAX_MS = 24 * 60 * 60 * 1000;      // an open-ended lobby nobody starts is closed (and refunded) after 24h
const MAX_RESUMES = 3;                          // a game that keeps crashing the bot is refunded instead of looping forever

async function lobbyDone(session) {
  if (session.phase !== 'lobby' && session.phase !== 'starting') return;
  if (session.starting) return;
  session.starting = true;                      // one start only (button + timer can race)
  session.phase = 'starting';
  try {
    await closeLobby(session);
    if (session.players.length < session.minPlayers) {
      await refundEveryone(session, `${session.gameLabel} refund`);
      await session.channel.send(`<:wrong:1495666083594502174> Not enough players (need ${session.minPlayers}).${session.bet > 0 ? ' Entries refunded.' : ''}`).catch(() => {});
      return;
    }
    await runSession(session, false);
  } catch (err) { await failSession(session, err); }
  finally { if (['done', 'cancelled'].includes(session.phase)) cleanup(session); }
}

async function failSession(session, err) {
  console.error('[squid error]', err.stack || err);
  if (session.phase === 'done' || session.settings.paidOut) { cleanup(session); return; }
  await refundEveryone(session, `${session.gameLabel} refund (error)`).catch(e => console.error('[squid refund]', e.message));
  session.channel.send('<:wrong:1495666083594502174> Something broke — everyone has been refunded.').catch(() => {});
  cleanup(session);
}

function wire(session) {
  session.onStart = () => lobbyDone(session);
  sessions.set(session.channel.id, session);
  registry.busy.add(session.channel.id);
}

function blank(channel, o) {
  const mode = o.mode;
  return {
    channel, guildId: channel.guild.id, mode, hostId: o.hostId, hostName: o.hostName,
    bet: o.bet, prize: o.prize || 0, prizeHeld: false, minPlayers: o.min, maxPlayers: o.max, auto: o.auto,
    startAt: o.startAt || null, phase: 'lobby', players: [], alive: null, history: [], stageIndex: 0,
    reminded: {}, settings: o.steps ? { steps: o.steps } : {}, state: { cancelled: false, onCancel: null }, paid: false, fast: !!o.fast,
    gameLabel: `Squid Games — ${modeLabel(mode)}`,
    title: `PLAY & REGRET — SQUID GAMES: ${modeLabel(mode)}`,
    blurb: mode === 'tournament'
      ? 'Four games, one champion: 🚦 Red Light, Green Light → 🎠 Mingle → 🌉 Glass Bridge → 🎰 The Final Regret.\nRegister once — survivors advance automatically.'
      : ENGINES[mode].rules,
    rules: mode === 'tournament'
      ? `👑 **Full Tournament** — register once, survive four games, one champion.\n\n${TOURNAMENT.map(k => ENGINES[k].rules).join('\n\n')}`
      : ENGINES[mode].rules,
  };
}

async function startSession(interaction, opts) {
  const channel = interaction.channel;
  if (!store.isReady()) return interaction.editReply({ content: '<:wrong:1495666083594502174> Squid Games storage is unavailable right now, so I won\'t start a game that could be lost. Try again in a minute.' });
  if (sessions.has(channel.id) || registry.busy.has(channel.id) || redlight.activeGames.has(channel.id)) {
    return interaction.editReply({ content: '<:wrong:1495666083594502174> A game is already running in this channel.' });
  }
  const hostName = interaction.member?.displayName || interaction.user.username;
  const session = blank(channel, { ...opts, hostId: interaction.user.id, hostName });
  // Host-funded prize: taken up front (affordability checked) and returned if the game is cancelled
  if (session.prize > 0) {
    const ok = await guildEconomy.removeFunds(session.guildId, session.hostId, hostName, session.prize, `${session.gameLabel} prize`);
    if (!ok) return interaction.editReply({ content: `<:wrong:1495666083594502174> You need **${session.prize.toLocaleString()} sins** to fund that prize.` });
    session.prizeHeld = true;
  }
  try {
    session.id = await store.insert(session);
    session.createdAt = Date.now();
  } catch (err) {
    console.error('[squid insert]', err);
    if (session.prizeHeld) await guildEconomy.addFunds(session.guildId, session.hostId, hostName, session.prize, `${session.gameLabel} prize returned`).catch(() => {});
    return interaction.editReply({ content: '<:wrong:1495666083594502174> Couldn\'t save the game, so I didn\'t start it. (Your prize was returned.)' });
  }
  wire(session);
  try {
    await attachLobby(session, null);
    await store.save(session);
  } catch (err) { await failSession(session, err); return interaction.editReply({ content: '<:wrong:1495666083594502174> Couldn\'t open the lobby.' }); }
  const when = session.startAt ? ` It starts <t:${Math.floor(session.startAt / 1000)}:F>.` : '';
  return interaction.editReply({ content: `😈 Squid Games lobby opened and saved — it survives bot restarts.${when}` });
}

// ─── Scheduler: scheduled starts, reminders, expiry ───────────────────────────
const REMINDERS = [
  { key: 'd1', ms: 24 * 3600e3, text: 'in **24 hours**' },
  { key: 'h1', ms: 3600e3, text: 'in **1 hour**' },
  { key: 'm10', ms: 10 * 60e3, text: 'in **10 minutes**' },
];
let timer = null;
async function tick() {
  for (const s of [...sessions.values()]) {
    if (s.phase !== 'lobby' || s.dead) continue;
    try {
      const now = Date.now();
      if (s.startAt) {
        if (now >= s.startAt) { lobbyDone(s); continue; }
        for (const r of REMINDERS) {
          const left = s.startAt - now;
          // fire a reminder once when we're inside its window (skip ones already past at signup time)
          if (left <= r.ms && !s.reminded[r.key] && (s.startAt - s.createdAt) > r.ms) {
            s.reminded[r.key] = true;
            await store.save(s);
            await ping(s.channel, s.players.map(p => p.id), `⏰ **${modeLabel(s.mode)}** starts ${r.text} — <t:${Math.floor(s.startAt / 1000)}:R>. Be here, sinners!`);
          }
        }
      } else if (now - s.createdAt > LOBBY_MAX_MS) {
        s.phase = 'starting'; s.starting = true;
        await closeLobby(s);
        await refundEveryone(s, `${s.gameLabel} refund`);
        await s.channel.send(`<:wrong:1495666083594502174> Nobody started the lobby within 24 hours, so it was closed.${s.bet > 0 ? ' Entries refunded.' : ''}`).catch(() => {});
        cleanup(s);
      }
    } catch (err) { console.error('[squid tick]', err); }
  }
}
function startScheduler() { if (!timer) { timer = setInterval(() => tick().catch(() => {}), 15000); timer.unref?.(); } }

// ─── Restore after a restart / redeploy ───────────────────────────────────────
async function restore(client) {
  const ok = await store.init();
  if (!ok) return 0;
  startScheduler();
  let rows = [];
  try { rows = await store.loadOpen(); } catch (err) { console.error('[squid restore]', err.message); return 0; }
  let n = 0;
  for (const r of rows) {
    try {
      if (sessions.has(r.channel_id)) continue;
      const channel = await client.channels.fetch(r.channel_id).catch(() => null);
      const stub = channel || { id: r.channel_id, guild: { id: r.guild_id }, send: async () => null };
      const mode = r.mode;
      const s = blank(stub, { mode, hostId: r.host_id, hostName: r.host_name, bet: r.bet, prize: r.prize, min: r.min_players, max: r.max_players, auto: r.auto_progress });
      Object.assign(s, {
        id: r.id, guildId: r.guild_id, startAt: r.start_at ? new Date(r.start_at).getTime() : null, createdAt: new Date(r.created_at).getTime(),
        phase: r.phase, players: r.players || [], alive: r.alive || null, history: r.history || [], stageIndex: r.stage_index || 0,
        winnerId: r.winner_id, prizeHeld: !!r.prize_held, reminded: r.reminded || {}, settings: r.settings || {}, lobbyMessageId: r.lobby_message_id,
      });
      wire(s);
      n++;
      if (s.phase === 'cancelling' || !channel) {                       // finish an interrupted refund (or the channel is gone)
        await refundEveryone(s, `${s.gameLabel} refund`); cleanup(s); continue;
      }
      if (s.phase === 'paying') {                                       // payout was in flight: pay (idempotent) and announce
        const winner = s.players.find(p => p.id === s.winnerId) || s.players[0];
        const paid = await payChampion(s, winner);
        s.phase = 'done'; s.prizeHeld = false; await store.save(s);
        await announceWinner(s, winner, paid); cleanup(s); continue;
      }
      if (s.phase === 'running') {
        s.settings.resumes = (s.settings.resumes || 0) + 1;
        if (s.settings.resumes > MAX_RESUMES) {
          await refundEveryone(s, `${s.gameLabel} refund (kept crashing)`);
          await channel.send('<:wrong:1495666083594502174> This game was interrupted too many times, so everyone has been refunded.').catch(() => {});
          cleanup(s); continue;
        }
        await store.save(s);
        s.starting = true;
        runSession(s, true).catch(err => failSession(s, err)).finally(() => { if (['done', 'cancelled'].includes(s.phase)) cleanup(s); });
        continue;
      }
      // lobby / starting → re-attach the lobby message with the same buttons
      s.phase = 'lobby'; s.starting = false;
      let msg = null;
      if (s.lobbyMessageId) msg = await channel.messages.fetch(s.lobbyMessageId).catch(() => null);
      await attachLobby(s, msg);
      await store.save(s);
    } catch (err) { console.error('[squid restore row]', r.id, err.stack || err); }
  }
  if (n) console.log(`[squid] restored ${n} saved game(s)`);
  return n;
}

async function cancel(channel, userId, member) {
  const s = sessions.get(channel.id);
  if (!s) return { ok: false, msg: 'No Squid Games session here.' };
  if (s.hostId !== userId && !hasHostRole(member)) return { ok: false, blocked: true, msg: '<:wrong:1495666083594502174> Only the host or an Event Host can cancel.' };
  if (s.settings.paidOut) return { ok: false, msg: 'That game is already finished.' };
  s.state.cancelled = true; s.cancelled = true;
  try { s.state.onCancel?.(); } catch {}
  await closeLobby(s);
  await refundEveryone(s, `${s.gameLabel} cancelled`);
  cleanup(s);
  return { ok: true, msg: '<:checkmark:1495666088417956002> Squid Games cancelled. Entry fees and the host prize were refunded.' };
}

/** "30m" / "2h" / "3d" / "1w" → absolute ms timestamp (null = open-ended). Legacy `signup` seconds still work. */
function parseStart(str, signupSec) {
  if (str) {
    const m = /^\s*(\d+)\s*(m|min|h|hr|d|w)\s*$/i.exec(str);
    if (!m) return 'bad';
    const mult = { m: 60e3, min: 60e3, h: 3600e3, hr: 3600e3, d: 86400e3, w: 7 * 86400e3 }[m[2].toLowerCase()];
    const ms = Number(m[1]) * mult;
    if (ms < 60e3 || ms > 14 * 86400e3) return 'bad';
    return Date.now() + ms;
  }
  return signupSec ? Date.now() + signupSec * 1000 : null;
}

/** /redlight is now just Squid Games' Red Light mode — so it is saved & restart-proof like everything else. */
async function handleRedlightSlash(interaction) {
  if (!hasHostRole(interaction.member)) return interaction.reply({ content: '<:wrong:1495666083594502174> Only Event Hosts and admins can start this game.', ephemeral: true });
  const feeOpt = interaction.options.getBoolean('fee');
  await interaction.deferReply({ ephemeral: true });
  return startSession(interaction, {
    mode: 'redlight', bet: feeOpt === false ? 0 : (interaction.options.getInteger('bet') || 50), prize: 0,
    startAt: parseStart(interaction.options.getString('start'), interaction.options.getInteger('signup')),
    min: 2, max: 100, auto: true, steps: interaction.options.getInteger('steps') || null,
  });
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
  if (sub === 'leaderboard') {
    const rows = await store.leaderboard(interaction.guildId).catch(() => []);
    if (!rows.length) return interaction.reply({ content: 'No Squid Games winners yet.', ephemeral: true });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setTitle('👑 Squid Games — Hall of Champions')
      .setDescription(rows.map((r, i) => `**${i + 1}.** ${r.name || `<@${r.winner_id}>`} — ${r.wins} win${r.wins === 1 ? '' : 's'}${r.championships ? ` (${r.championships} 👑 tournament)` : ''}`).join('\n')).setFooter({ text: BRAND })] });
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
    const startAt = parseStart(interaction.options.getString('start'), interaction.options.getInteger('signup'));
    if (startAt === 'bad') return interaction.reply({ content: '<:wrong:1495666083594502174> Couldn\'t read that start time. Use things like `30m`, `2h`, `3d`, `1w` (max 14 days).', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    return startSession(interaction, {
      mode: interaction.options.getString('game') || 'tournament',
      bet: feeOpt === false ? 0 : (interaction.options.getInteger('bet') || 50),
      prize: interaction.options.getInteger('prize') || 0,
      startAt,
      min, max,
      auto: interaction.options.getBoolean('auto') !== false,
    });
  }
}

module.exports = { handleSlash, handleRedlightSlash, cancel, restore, sessions, ENGINES, TOURNAMENT, _test: { startSession, runSession, between, tick, lobbyDone, restore, blank, wire, parseStart } };
