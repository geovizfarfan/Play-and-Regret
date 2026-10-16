/**
 * mingle.js — MINGLE! MINGLE! (Squid Games stage 3)
 * Rooms with an exact group size. Join/switch rooms with buttons until the timer ends;
 * only rooms that are *exactly full* survive. Everyone else is out.
 *
 * Fairness: first-come room assignment is processed in one synchronous step (no races),
 * there is always at least one spare room, and switching is allowed until the lock, so
 * a fast connection doesn't decide who survives. (The optional "preference" mode is not built.)
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BRAND, COLORS, sleep, secureInt, randBetween, shuffle, names, waitFor } = require('./common');

/** Group size for this many players: small enough that several rooms can fill, big enough to be tense. */
function groupSizeFor(n) {
  if (n <= 3) return 2;
  const max = Math.min(5, Math.max(2, Math.floor(n / 2)));
  return randBetween(2, max);
}
function roomCountFor(n, size) {
  return Math.min(20, Math.max(2, Math.ceil(n / size) + 1));   // +1 spare room so somebody can always miss
}
function timerFor(round) { return [18, 15, 12, 12][Math.min(round, 4) - 1] * 1000; }

/** Pure: who survives given room occupancy. counts[room] = userIds in it. */
function resolveRooms(counts, size) {
  const survivors = [];
  counts.forEach(ids => { if (ids.length === size) survivors.push(...ids); });
  return survivors;
}
/** Pure: fallback when no room filled — the fullest room(s) survive (announced). */
function fullestRooms(counts) {
  const max = Math.max(0, ...counts.map(c => c.length));
  if (max === 0) return [];
  return counts.filter(c => c.length === max).flat();
}

async function playRound(channel, alive, size, round, ctx, label) {
  const rooms = roomCountFor(alive.length, size);
  const gid = `${channel.id}_${Date.now()}_${round}`;
  const members = Array.from({ length: rooms }, () => []);   // room → userIds
  const roomOf = new Map();
  const aliveIds = new Set(alive.map(p => p.id));
  let dirty = true, lastEdit = 0;
  const ms = timerFor(round);
  const endsAt = Math.floor((Date.now() + ms) / 1000);

  const embed = (locked = false) => new EmbedBuilder().setColor(COLORS.purple)
    .setTitle(`🎠 MINGLE! MINGLE!${label ? ` — ${label}` : ''}`)
    .setDescription(
      `# GROUPS OF ${size}!\n${locked ? '🔒 **Doors locked!**' : `Get into a room with **exactly ${size}** — you can switch until <t:${endsAt}:R>.`}\n\n` +
      members.map((m, k) => `${m.length === size ? '✅' : '🚪'} **Room ${k + 1}** — ${m.length}/${size}`).join('\n'))
    .addFields({ name: 'Sinners', value: String(alive.length), inline: true }, { name: 'Round', value: String(round), inline: true })
    .setFooter({ text: BRAND });
  const buttons = (disabled = false) => {
    const rows = [];
    for (let k = 0; k < rooms; k += 5) {
      rows.push(new ActionRowBuilder().addComponents(
        ...Array.from({ length: Math.min(5, rooms - k) }, (_, j) => {
          const room = k + j;
          return new ButtonBuilder().setCustomId(`mg_${gid}_${room}`).setLabel(`Room ${room + 1}`)
            .setStyle(members[room].length === size ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(disabled);
        })));
    }
    return rows;
  };

  const msg = await channel.send({ embeds: [embed()], components: buttons() });
  const collector = msg.createMessageComponentCollector({ filter: i => i.customId.startsWith(`mg_${gid}_`), time: ms });

  collector.on('collect', (i) => {
    // Atomic: all checks and the move happen synchronously
    if (!aliveIds.has(i.user.id)) return i.reply({ content: "You're not in this round.", ephemeral: true }).catch(() => {});
    const room = parseInt(i.customId.split('_').pop(), 10);
    const cur = roomOf.get(i.user.id);
    if (cur === room) return i.deferUpdate().catch(() => {});
    if (members[room].length >= size) return i.reply({ content: `🚫 Room ${room + 1} is full!`, ephemeral: true }).catch(() => {});
    if (cur !== undefined) members[cur] = members[cur].filter(id => id !== i.user.id);
    members[room].push(i.user.id);
    roomOf.set(i.user.id, room);
    dirty = true;
    i.deferUpdate().catch(() => {});
  });
  const done = new Promise(r => collector.on('end', r));
  const ticker = setInterval(() => {
    if (dirty && Date.now() - lastEdit > 1500) { dirty = false; lastEdit = Date.now(); msg.edit({ embeds: [embed()], components: buttons() }).catch(() => {}); }
  }, 500);
  ctx.state.onCancel = () => collector.stop('cancel');
  await done;
  clearInterval(ticker);
  await msg.edit({ embeds: [embed(true)], components: buttons(true) }).catch(() => {});
  return members;
}

/** Final tie-break for standalone: pick a door, one door is safe. Wrong/no pick = out. Repeats until one remains. */
async function doorsToOne(channel, players, ctx) {
  let field = players.slice();
  let n = 0;
  while (field.length > 1 && !ctx.state.cancelled) {
    n++;
    const gid = `${channel.id}_${Date.now()}_d${n}`;
    const doors = Math.max(2, Math.min(5, field.length));
    const picks = new Map();
    const ids = new Set(field.map(p => p.id));
    const msg = await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.purple)
      .setTitle('🚪 FINAL DOORS').setDescription(`**${field.length} sinners** left. One door is safe — everyone has the same chance.\nPick within **10 seconds** (no pick = eliminated).`).setFooter({ text: BRAND })],
      components: [new ActionRowBuilder().addComponents(...Array.from({ length: doors }, (_, d) => new ButtonBuilder().setCustomId(`mgd_${gid}_${d}`).setLabel(`Door ${d + 1}`).setStyle(ButtonStyle.Secondary)))] });
    const col = msg.createMessageComponentCollector({ filter: i => i.customId.startsWith(`mgd_${gid}_`), time: 10000 });
    col.on('collect', (i) => {
      if (!ids.has(i.user.id)) return i.reply({ content: "You're not in this round.", ephemeral: true }).catch(() => {});
      if (picks.has(i.user.id)) return i.reply({ content: 'Locked in already!', ephemeral: true }).catch(() => {});
      picks.set(i.user.id, parseInt(i.customId.split('_').pop(), 10));
      i.reply({ content: `🔒 Door ${picks.get(i.user.id) + 1} locked in.`, ephemeral: true }).catch(() => {});
      if (picks.size >= field.length) col.stop('all');
    });
    ctx.state.onCancel = () => col.stop('cancel');
    await new Promise(r => col.on('end', r));
    if (ctx.state.cancelled) break;
    const safe = secureInt(doors);
    const survivors = field.filter(p => picks.get(p.id) === safe);
    await msg.edit({ components: [] }).catch(() => {});
    if (survivors.length === 0) {
      await channel.send(`🚪 Door **${safe + 1}** was safe — and **nobody** picked it! Same sinners, new doors…`);
      if (n >= 8) field = [field[secureInt(field.length)]];   // safety: never loop forever
      continue;
    }
    await channel.send(`🚪 Door **${safe + 1}** was safe! **${survivors.length}** survive, **${field.length - survivors.length}** eliminated.`);
    field = survivors;
    await sleep(1500);
  }
  return field;
}

/**
 * @returns {{survivors:string[], eliminated:string[]}} ids
 * mode 'tournament': every survivor advances. mode 'standalone': ends with exactly one winner.
 */
async function run(channel, players, ctx) {
  let alive = players.slice();
  const eliminated = [];
  const rounds = ctx.mode === 'standalone' ? 4 : randBetween(2, 4);

  await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.purple).setTitle('🎠 MINGLE! MINGLE!')
    .setDescription(`**${alive.length} sinners** step onto the carousel.\nA group size is announced — run into a room with **exactly** that many people before the doors lock. Full rooms live. Everyone else is out.\n\n*Up to ${rounds} rounds. Starting in 6 seconds…*`).setFooter({ text: BRAND })] });
  await sleep(ctx.fast ? 50 : 6000);

  for (let round = 1; round <= rounds && alive.length > 1 && !ctx.state.cancelled; round++) {
    const size = Math.min(groupSizeFor(alive.length), alive.length);
    const members = await playRound(channel, alive, size, round, ctx);
    if (ctx.state.cancelled) break;
    let surviveIds = resolveRooms(members, size);
    let note = '';
    if (surviveIds.length === 0) {
      surviveIds = fullestRooms(members);
      note = surviveIds.length
        ? '\n*No room filled — tiebreak: the fullest room(s) survive.*'
        : '\n*Nobody picked a room — nobody is eliminated this round.*';
      if (!surviveIds.length) surviveIds = alive.map(p => p.id);
    }
    const out = alive.filter(p => !surviveIds.includes(p.id));
    alive = alive.filter(p => surviveIds.includes(p.id));
    eliminated.push(...out.map(p => p.id));
    await channel.send({ embeds: [new EmbedBuilder().setColor(out.length ? COLORS.red : COLORS.green)
      .setTitle(`🎠 Round ${round} result`)
      .setDescription(`✅ **${alive.length}** survive${out.length ? `\n💀 Out: ${names(players, out.map(p => p.id))}` : ''}${note}`).setFooter({ text: BRAND })] });
    await sleep(ctx.fast ? 50 : 2500);
  }

  if (ctx.mode === 'standalone' && alive.length > 1 && !ctx.state.cancelled) {
    await channel.send('🎠 The carousel stops with more than one sinner standing — **sudden death!**');
    const before = alive.map(p => p.id);
    alive = await doorsToOne(channel, alive, ctx);
    eliminated.push(...before.filter(id => !alive.some(p => p.id === id)));
  }
  return { survivors: alive.map(p => p.id), eliminated };
}

module.exports = { run, groupSizeFor, roomCountFor, resolveRooms, fullestRooms };
