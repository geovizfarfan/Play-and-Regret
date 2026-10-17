/**
 * redlight.js — Red Light, Green Light (Play & Regret by TBP — Squid Games, stage 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Live typing race. During GREEN every *original* message = one step.
 * During RED any message from a live player = eliminated.
 * The bot's own phase state is the only authority — the GIFs are just visuals.
 *
 * Phases: GREEN_TRANSITION → GREEN_ACTIVE → RED_TRANSITION → RED_ACTIVE → GAME_FINISHED
 * Only GREEN_ACTIVE awards steps. Only RED_ACTIVE eliminates. Transitions are a short
 * grace window (Discord latency / GIF loading) where nothing happens to anyone.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { economy, stats } = require('../../utils/database');
const guildEconomy = require('../../utils/guildEconomy');
const jackpot      = require('../../utils/jackpot');
const { MessageValidator } = require('./validator');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const PREFIX          = process.env.PREFIX || '!';
const activeGames     = new Map();   // channelId → game

const ASSETS = path.join(__dirname, 'assets');
const IMG = {
  greenGif:   'green_light.gif',
  greenStill: 'green_back.png',
  redGif:     'red_light.gif',
  redStill:   'red_front.png',
};
const GIF_MS = 5000;   // both GIFs are 5s long — swap to the still after one play

const CFG = {
  graceMs:   1500,           // transition grace after each light change (no steps, no eliminations)
  greenMin:  5000, greenMax: 9000,
  redMin:    3000, redMax:   6000,
  progressEditMs: 3000,      // never edit the board more often than this
  eliminationFlushMs: 2000,
  taxRate:   0.10,
  introMs:   8000,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

/**
 * Finish line & max rounds by player count.
 * Sizing: a green phase averages ~7s, minus 1.5s grace ≈ 5.5s of typing. A normal mobile typist
 * produces ~0.5–0.6 *different* messages/sec (≈3 steps/round), a fast one ~0.8/sec (≈4.4/round).
 * Finish lines are set so a fast typist needs ≈60% of the rounds and an average one ≈85–90%,
 * with each round ≈15s → 3–5 min games. Bigger lobbies get slightly more room because
 * red-light eliminations thin the field.
 */
function difficultyFor(n) {
  if (n <= 5)  return { finish: 30, rounds: 12 };
  if (n <= 10) return { finish: 35, rounds: 14 };
  if (n <= 20) return { finish: 40, rounds: 16 };
  if (n <= 35) return { finish: 45, rounds: 18 };
  if (n <= 50) return { finish: 50, rounds: 20 };
  return { finish: 55, rounds: 22 };
}

// ─── Images ───────────────────────────────────────────────────────────────────
const assetOk = name => { try { return fs.existsSync(path.join(ASSETS, name)); } catch { return false; } };
const att     = name => new AttachmentBuilder(path.join(ASSETS, name), { name });

// ─── Embeds ───────────────────────────────────────────────────────────────────
const bar = (v, max) => { const f = Math.max(0, Math.min(10, Math.round((v / max) * 10))); return '▰'.repeat(f) + '▱'.repeat(10 - f); };
const activePlayers = g => [...g.players.values()].filter(p => p.status === 'active');

function board(g, limit = 5) {
  const rows = activePlayers(g).sort((a, b) => b.steps - a.steps || a.lastStepAt - b.lastStepAt).slice(0, limit);
  if (!rows.length) return '*Nobody is left standing.*';
  return rows.map((p, i) => `${['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`} **${p.username}** — ${p.steps}/${g.finish}\n${bar(p.steps, g.finish)}`).join('\n');
}

function lightEmbed(g) {
  const green = g.light === 'green';
  const e = new EmbedBuilder()
    .setColor(green ? '#39FF14' : '#FF1744')
    .setTitle(green ? '🟢 GREEN LIGHT — MOVE!' : '🔴 RED LIGHT — FREEZE!')
    .setDescription(green
      ? `**The devil isn't watching.**\nType anything *original* to advance!`
      : `**👁️ The devil is watching...**\nStop typing! Any message = elimination.`)
    .addFields(
      { name: 'Round', value: `${g.round}/${g.maxRounds}`, inline: true },
      { name: 'Standing', value: `${activePlayers(g).length}/${g.players.size}`, inline: true },
    )
    .setFooter({ text: 'Play & Regret by TBP — Squid Games' });
  if (g.roundElims.length) e.addFields({ name: '💀 Chose regret', value: g.roundElims.slice(-10).join(', ') + (g.roundElims.length > 10 ? ` +${g.roundElims.length - 10} more` : '') });
  if (g.imageName) e.setImage(`attachment://${g.imageName}`);
  return e;
}

// ─── Safe Discord edits (never let a failed edit/missing image break the game) ──
async function editBoard(g, payload) {
  if (!g.message) return;
  try { await g.message.edit(payload); g.lastEdit = Date.now(); }
  catch (err) {
    if (payload.files) {                       // image problem → fall back to text-only board
      g.imageName = null;
      try { await g.message.edit({ embeds: [lightEmbed(g)], attachments: [] }); g.lastEdit = Date.now(); } catch {}
    }
  }
}

// Every light change is a NEW message at the bottom of the channel (so it can't get lost in the chat above);
// the previous board message is removed. Progress updates and the GIF→still swap edit the newest one.
async function postLight(g, payload) {
  const old = g.message;
  let sent = null;
  try { sent = await g.channel.send(payload); }
  catch {
    if (payload.files) { g.imageName = null; try { sent = await g.channel.send({ embeds: [lightEmbed(g)] }); } catch {} }
  }
  if (sent) {
    g.message = sent; g.lastEdit = Date.now();
    try { await old?.delete?.(); } catch {}
  } else if (old) {
    await editBoard(g, { ...payload, attachments: [] });      // couldn't post → fall back to editing the old one
  }
}

async function showLight(g, light) {
  g.light = light;
  if (g.swapTimer) clearTimeout(g.swapTimer);
  const gif = light === 'green' ? IMG.greenGif : IMG.redGif;
  const still = light === 'green' ? IMG.greenStill : IMG.redStill;
  g.roundElims = light === 'red' ? [] : g.roundElims;

  if (assetOk(gif)) {
    g.imageName = gif;
    await postLight(g, { embeds: [lightEmbed(g)], files: [att(gif)] });
    // GIFs loop in Discord — replace with the still once it has played, if this light is still on
    g.swapTimer = setTimeout(async () => {
      if (g.over || g.light !== light || g.imageName !== gif || !assetOk(still)) return;
      g.imageName = still;
      await editBoard(g, { embeds: [lightEmbed(g)], files: [att(still)], attachments: [] });
    }, GIF_MS);
  } else {
    g.imageName = null;
    await postLight(g, { embeds: [lightEmbed(g)] });
  }
}

// Milestone callouts instead of a leaderboard: "halfway there" and "reached the finish line"
async function flushMilestones(g) {
  if (!g.channel || g.flushing) return;
  const half = (g.halfQueue || []).splice(0);
  const done = g.mode === 'tournament' ? g.roundQual.splice(0) : [];
  if (!half.length && !done.length) return;
  g.flushing = true;
  try {
    if (half.length) await g.channel.send(`🏃 **${half.join(', ')}** ${half.length === 1 ? 'is' : 'are'} halfway to the finish line!`).catch(() => {});
    if (done.length) await g.channel.send(`🏁 **${done.join(', ')}** reached the finish line${g.mode === 'tournament' ? ' and qualified' : ''}!`).catch(() => {});
  } finally { g.flushing = false; }
}

// Clean the channel after each round: delete the players' typed messages (the bot's callouts stay)
async function purge(g) {
  const ids = (g.trash || []).splice(0);
  if (!ids.length || !g.channel?.bulkDelete) return;
  try {
    for (let i = 0; i < ids.length; i += 100) await g.channel.bulkDelete(ids.slice(i, i + 100), true);
  } catch (err) {
    if (!g.purgeWarned) { g.purgeWarned = true; console.error('[redlight purge] needs Manage Messages:', err.message); }
  }
}

async function refreshBoard(g, force = false) {
  if (!force && Date.now() - (g.lastEdit || 0) < CFG.progressEditMs) return;
  g.dirty = false;
  await editBoard(g, { embeds: [lightEmbed(g)] });   // embed-only edit keeps the current attachment
}

async function waitFor(g, ms, tick, stop) {
  const end = Date.now() + ms;
  while (Date.now() < end && !g.over && !(stop && stop())) {
    await sleep(Math.min(250, Math.max(0, end - Date.now())));
    if (tick) await tick();
  }
}

// ─── Live message handling (synchronous decisions before any await) ───────────
function onMessage(message) {
  const g = activeGames.get(message.channel?.id);
  if (!g || g.phase === 'SIGNUP' || g.over) return;
  if (message.author.bot || message.webhookId) return;
  const p = g.players.get(message.author.id);
  if (p && g.trash) g.trash.push(message.id);                    // every player message gets cleaned up after the round
  if (!p || p.status !== 'active') return;

  if (g.phase === 'RED_ACTIVE') {
    // Anything sent by a live player during RED eliminates — dupes, short messages, attachments, all of it
    p.status = 'eliminated';
    g.eliminatedOrder.push(p.id);
    g.roundElims.push(p.username);
    g.lastWave.push(p.id);
    g.elimQueue.push(p.username);
    scheduleElimFlush(g);
    if (activePlayers(g).length <= 1) g.wake = true;
    return;
  }

  if (g.phase !== 'GREEN_ACTIVE') return;                       // transitions & everything else: ignored
  const text = message.content || '';
  if (!text.trim()) return;                                     // attachment/sticker-only → no step
  if (text.startsWith(PREFIX) || text.startsWith('/')) return;  // commands don't count

  const res = g.validator.check({ id: message.id, userId: p.id, content: text });
  if (res.ok) {
    p.steps++;
    p.lastStepAt = Date.now();
    g.dirty = true;
    if (p.steps === Math.ceil(g.finish / 2) && p.steps < g.finish) (g.halfQueue = g.halfQueue || []).push(p.username);
    if (p.steps >= g.finish && !g.over) {                       // atomic: decided synchronously, in message order
      if (g.mode === 'tournament') {                            // qualify: immune from now on, race continues for everyone else
        p.status = 'finished';
        g.qualified.push(p.id);
        g.roundQual.push(p.username);
        if (activePlayers(g).length === 0) { g.over = true; g.endReason = 'allresolved'; }
      } else {                                                  // standalone: first to cross wins immediately
        g.over = true;
        g.winnerId = p.id;
        g.endReason = 'finish';
      }
    }
  } else if (res.warn || res.locked) {
    message.react(res.locked ? '⏳' : '⚠️').catch(() => {});     // discreet notice, no channel spam
  }
}

function scheduleElimFlush(g) {
  if (g.elimTimer) return;
  g.elimTimer = setTimeout(() => { g.elimTimer = null; g.dirty = true; refreshBoard(g, true).catch(() => {}); }, CFG.eliminationFlushMs);
}

// ─── Core game loop ───────────────────────────────────────────────────────────
async function runGame(channel, g) {
  const { finish, rounds } = { ...difficultyFor(g.players.size), ...(g.overrides || {}) };
  g.finish = finish; g.maxRounds = rounds;
  g.validator = new MessageValidator();

  const intro = new EmbedBuilder()
    .setColor('#7B2CBF')
    .setTitle('😈 RED LIGHT, GREEN LIGHT — Play & Regret by TBP')
    .setDescription(
      `**${g.players.size} sinners** enter. **${finish} steps** to the finish line.\n\n` +
      `🟢 **GREEN** — type *original* messages. Each one = 1 step.\n` +
      `🔴 **RED** — type **anything** and you're out.\n\n` +
      `Repeats, copy-paste and tiny edits (\`hello\`, \`HELLO!\`, \`hello2\`) earn **nothing**. 1 step per second max.\n` +
      `Right after a light changes there's a short grace window — nothing counts until the board says so.\n\n` +
      (g.mode === 'tournament'
        ? `*Reach **${finish} steps** to qualify for the next game. Max ${rounds} rounds — then the top half of whoever is still racing qualifies.*`
        : `*First to ${finish} wins. Max ${rounds} rounds — then most steps wins.*`))
    .setFooter({ text: 'Starting in 8 seconds…' });
  g.channel = channel; g.trash = [];
  g.message = await channel.send({ embeds: [intro] });
  await sleep(CFG.introMs);

  g.light = 'green'; g.round = 0; g.roundElims = [];
  for (let round = 1; round <= rounds && !g.over; round++) {
    g.round = round;

    // 🟢 GREEN
    g.phase = 'GREEN_TRANSITION';
    await showLight(g, 'green');
    await waitFor(g, CFG.graceMs);
    if (g.over) break;
    g.phase = 'GREEN_ACTIVE';
    await waitFor(g, rand(CFG.greenMin, CFG.greenMax), async () => { await flushMilestones(g); if (g.dirty) await refreshBoard(g); });
    if (g.over && g.mode !== 'tournament') break;
    await flushMilestones(g);
    if (g.over) break;
    await refreshBoard(g, true);

    // 🔴 RED
    g.phase = 'RED_TRANSITION';
    g.lastWave = [];
    await showLight(g, 'red');
    await waitFor(g, CFG.graceMs);
    if (g.over) break;
    g.phase = 'RED_ACTIVE';
    g.wake = false;
    await waitFor(g, rand(CFG.redMin, CFG.redMax), null, () => g.wake);   // ends early if ≤1 player is left
    g.phase = 'RED_TRANSITION';      // stop eliminating the instant red ends (late messages are in the grace window)
    if (g.elimTimer) { clearTimeout(g.elimTimer); g.elimTimer = null; }
    const out = g.elimQueue.splice(0);
    if (out.length) {
      await channel.send(`💀 **${out.join(', ')}** moved during RED LIGHT. **${activePlayers(g).length}** left.`).catch(() => {});
    }

    await purge(g);

    const alive = activePlayers(g);
    if (g.mode === 'tournament') {
      if (alive.length === 0) { g.over = true; g.endReason = g.qualified.length ? 'allresolved' : 'wipe'; }
      else if (alive.length === 1 && g.qualified.length === 0) { g.over = true; g.winnerId = alive[0].id; g.endReason = 'last'; }
    } else if (alive.length === 1) { g.over = true; g.winnerId = alive[0].id; g.endReason = 'last'; }
    else if (alive.length === 0) { g.over = true; g.endReason = 'wipe'; }
  }

  g.phase = 'GAME_FINISHED';
  if (g.swapTimer) clearTimeout(g.swapTimer);
  if (g.cancelled) return;

  if (g.mode === 'tournament') return tournamentResult(channel, g);

  // ── Resolve the winner (always exactly one) ──
  let how;
  if (g.endReason === 'finish') how = `crossed the finish line first (**${g.finish} steps**)`;
  else if (g.endReason === 'last') how = 'was the **last sinner standing**';
  else if (g.endReason === 'wipe') {
    // Everyone froze wrong in the same red light → announced tiebreak: most steps among that final wave
    const pool = g.lastWave.map(id => g.players.get(id));
    pool.sort((a, b) => b.steps - a.steps || a.lastStepAt - b.lastStepAt);
    g.winnerId = pool[0].id;
    how = `had the most steps (**${pool[0].steps}**) when the last sinners all got caught — *tiebreak: most steps, then who got there first*`;
  } else {
    // Out of rounds → announced tiebreak: most steps among survivors, then earliest to reach that count
    const pool = activePlayers(g).sort((a, b) => b.steps - a.steps || a.lastStepAt - b.lastStepAt);
    g.winnerId = pool[0].id;
    how = `had the most steps (**${pool[0].steps}**) after ${g.maxRounds} rounds — *tiebreak: most steps, then who got there first*`;
  }
  if (g.engine) {                                              // Squid Games manager pays out, not us
    const win = g.players.get(g.winnerId);
    await channel.send(`👑 **${win.username}** ${how}!`).catch(() => {});
    return { survivors: [g.winnerId], eliminated: [...g.players.keys()].filter(id => id !== g.winnerId) };
  }
  await purge(g);
  await finishGame(channel, g, how);
}

/** Tournament: qualifiers advance. If the rounds ran out, the top half of whoever is still racing qualifies. */
async function tournamentResult(channel, g) {
  const all = [...g.players.values()];
  const qualified = new Set(g.qualified);
  const sorter = (a, b) => b.steps - a.steps || a.lastStepAt - b.lastStepAt;
  let note = '';
  if (!qualified.size && g.endReason === 'wipe') {
    // everyone froze wrong in the same red → the best quarter of that last wave (min 1) qualifies
    const pool = g.lastWave.map(id => g.players.get(id)).sort(sorter);
    pool.slice(0, Math.max(1, Math.ceil(pool.length / 4))).forEach(p => qualified.add(p.id));
    note = '*Everyone got caught on the same red — tiebreak: the best quarter of the last wave by steps qualifies.*';
  } else if (g.endReason === 'last') {
    qualified.add(g.winnerId);
    note = '*Last sinner standing qualifies.*';
  } else if (g.endReason !== 'allresolved') {
    const pool = activePlayers(g).sort(sorter);
    pool.slice(0, Math.max(1, Math.ceil(pool.length / 2))).forEach(p => qualified.add(p.id));
    if (pool.length) note = `*Out of rounds — tiebreak: the top half of those still racing (by steps) qualifies.*`;
  }
  const survivors = all.filter(p => qualified.has(p.id));
  const out = all.filter(p => !qualified.has(p.id));
  await channel.send({ embeds: [new EmbedBuilder().setColor('#39FF14').setTitle('🏁 RED LIGHT, GREEN LIGHT — complete')
    .setDescription(`✅ **${survivors.length}** qualify: ${survivors.map(p => p.username).slice(0, 20).join(', ')}${survivors.length > 20 ? ' …' : ''}\n💀 **${out.length}** eliminated\n${note}`)
    .setFooter({ text: 'Play & Regret by TBP — Squid Games' })] }).catch(() => {});
  await refreshBoard(g, true).catch(() => {});
  return { survivors: survivors.map(p => p.id), eliminated: out.map(p => p.id) };
}

async function finishGame(channel, g, how) {
  const winner = g.players.get(g.winnerId);
  const players = [...g.players.values()];
  const pot = g.bet * players.length;
  const tax = Math.floor(pot * CFG.taxRate);
  const prize = pot - tax;

  if (!g.paid) {
    g.paid = true;                                              // set before awaiting → no double payout
    if (prize > 0) await guildEconomy.addFunds(channel.guild.id, winner.id, winner.username, prize, 'Red Light Green Light win');
    if (tax > 0) await jackpot.addToDrawFund(tax).catch(() => {});
    await economy.untrackGameChannel(channel.id).catch(() => {});
    stats.increment(winner.id, 'redlight_wins').catch(() => {});
    for (const p of players) {
      if (p.id !== winner.id) stats.increment(p.id, 'redlight_losses').catch(() => {});
      stats.increment(p.id, 'redlight_games').catch(() => {});
    }
  }

  const standings = players.sort((a, b) => (b.id === winner.id) - (a.id === winner.id) || b.steps - a.steps)
    .slice(0, 5).map((p, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} **${p.username}** — ${p.steps}/${g.finish}${p.status === 'eliminated' ? ' 💀' : ''}`).join('\n');
  const e = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle('😈 RED LIGHT, GREEN LIGHT — WE HAVE A WINNER!')
    .setDescription(
      `👑 **${winner.username}** ${how}!\n\n${standings}\n\n` +
      (prize > 0 ? `<a:moneybag:1479268556687540345> **${prize.toLocaleString()}** to the winner\n` : '') +
      (tax > 0 ? `<a:jackpot:1479203793806557385> **${tax.toLocaleString()}** → jackpot\n` : ''))
    .setFooter({ text: 'Play & Regret by TBP — Squid Games' });
  await channel.send({ embeds: [e] }).catch(() => {});
  await refreshBoard(g, true).catch(() => {});
  activeGames.delete(channel.id);
}

async function refundAll(channel, g, reason) {
  if (g.paid) return;
  g.paid = true;
  for (const p of g.players.values()) {
    if (g.bet > 0) await guildEconomy.addFunds(channel.guild.id, p.id, p.username, g.bet, reason).catch(() => {});
  }
  await economy.untrackGameChannel(channel.id).catch(() => {});
}

/** Engine entry for the Squid Games manager. players = [{id, username}] → { survivors, eliminated } */
async function playRedLight(channel, players, ctx) {
  const g = {
    players: new Map(players.map(p => [p.id, { id: p.id, username: p.username, steps: 0, status: 'active', lastStepAt: 0 }])),
    bet: 0, phase: 'GREEN_TRANSITION', over: false, paid: true, engine: true, mode: ctx.mode,
    overrides: null, eliminatedOrder: [], elimQueue: [], lastWave: [], roundElims: [], light: 'green',
    qualified: [], roundQual: [], cancelled: false,
  };
  if (ctx.fast) { g.fast = true; }
  activeGames.set(channel.id, g);
  ctx.state.onCancel = () => { g.cancelled = true; g.over = true; };
  try { return await runGame(channel, g); }
  finally { activeGames.delete(channel.id); if (g.swapTimer) clearTimeout(g.swapTimer); if (g.elimTimer) clearTimeout(g.elimTimer); }
}

// ─── Cancel (host/admin; works in signup or mid-game, refunds everyone) ──────
async function cancel(channel, userId, member) {
  const g = activeGames.get(channel.id);
  if (!g) return { ok: false, msg: 'No Red Light, Green Light game here.' };
  if (g.hostId !== userId && !hasHostRole(member)) return { ok: false, blocked: true, msg: '<:wrong:1495666083594502174> Only the host or an Event Host can cancel.' };
  g.cancelled = true; g.over = true;
  if (g.swapTimer) clearTimeout(g.swapTimer);
  if (g.elimTimer) clearTimeout(g.elimTimer);
  if (g.phase === 'SIGNUP') g.collector?.stop('cancel');
  await refundAll(channel, g, 'Red Light Green Light cancelled');
  activeGames.delete(channel.id);
  return { ok: true, msg: '<:checkmark:1495666088417956002> Red Light, Green Light cancelled. Players refunded.' };
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'redlight',
  activeGames,
  onMessage,
  cancel,
  difficultyFor,
  playRedLight,
  _test: { runGame, CFG },   // used by the simulation tests only

  // /redlight is Squid Games' Red Light mode now (saved in the database, survives restarts)
  async handleSlash(interaction) { return require('../squid/manager').handleRedlightSlash(interaction); },
};
