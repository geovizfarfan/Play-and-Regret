/**
 * roulette.js — THE FINAL REGRET (Squid Games stage 5)
 * A fictional six-chamber mystery wheel. Not a weapon — a wheel of regret.
 * Every spin is an independent draw from the OS CSPRNG; picking a chamber is only for flavour,
 * so nobody's position, speed or choice changes their odds. No Sins can buy anything here.
 *
 * Odds auto-scale so the game lands in ~2–5 minutes (and are announced on every spin):
 *   2 sinners → 1 in 6   • 3–4 → 2 in 6   • 5–8 → 3 in 6   • more than 8 → "group spin" rounds
 *   where everyone spins at once at 2 in 6 until 8 or fewer remain.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BRAND, COLORS, sleep, secureInt, shuffle, names } = require('./common');

const TURN_MS = 12000;
function bulletsFor(k) { return k <= 2 ? 1 : k <= 4 ? 2 : k <= 8 ? 3 : 2; }
/** One independent spin: true = BANG (eliminated). */
function spin(bullets, rng = secureInt) { return rng(6) < bullets; }

const chamberButtons = (gid, disabled = false) => {
  const rows = [];
  for (let r = 0; r < 2; r++) {
    rows.push(new ActionRowBuilder().addComponents(...[1, 2, 3].map(n => {
      const c = r * 3 + n;
      return new ButtonBuilder().setCustomId(`rr_${gid}_${c}`).setLabel(String(c)).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
    })));
  }
  return rows;
};

/** Group spin: everyone alive spins at once. Players who don't pick are spun automatically. */
async function groupRound(channel, field, bullets, round, ctx, speed) {
  const gid = `${channel.id}_${Date.now()}_g${round}`;
  const ids = new Set(field.map(p => p.id));
  const picked = new Set();
  const msg = await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.red).setTitle(`🎰 THE FINAL REGRET — Group Spin ${round}`)
    .setDescription(`**${field.length} sinners.** Everyone spins at once — **${bullets} in 6** chambers is regret.\nPick a chamber within **${Math.round(10000 / speed / 1000)}s** (or fate picks for you).`).setFooter({ text: BRAND })],
    components: chamberButtons(gid) });
  const col = msg.createMessageComponentCollector({ filter: i => i.customId.startsWith(`rr_${gid}_`), time: 10000 / speed });
  col.on('collect', (i) => {
    if (!ids.has(i.user.id)) return i.reply({ content: "You're not in this round.", ephemeral: true }).catch(() => {});
    if (picked.has(i.user.id)) return i.reply({ content: 'Locked in already!', ephemeral: true }).catch(() => {});
    picked.add(i.user.id);
    i.reply({ content: `🔒 Chamber ${i.customId.split('_').pop()} locked in.`, ephemeral: true }).catch(() => {});
    if (picked.size >= field.length) col.stop('all');
  });
  ctx.state.onCancel = () => col.stop('cancel');
  await new Promise(r => col.on('end', r));
  await msg.edit({ components: chamberButtons(gid, true) }).catch(() => {});
  if (ctx.state.cancelled) return { out: [], safe: field };
  // Independent spin per player. Never wipe the whole field: if everyone drew BANG, nobody is out (announced).
  let out = field.filter(() => spin(bullets));
  let note = '';
  if (out.length === field.length) { out = []; note = '\n*Everyone drew BANG — the wheel jams. Nobody is eliminated this round.*'; }
  const safe = field.filter(p => !out.includes(p));
  await sleep(ctx.fast ? 20 : 2000);
  await channel.send({ embeds: [new EmbedBuilder().setColor(out.length ? COLORS.red : COLORS.green)
    .setTitle(`🎰 Group Spin ${round} — results`)
    .setDescription(`🟢 **CLICK** — **${safe.length}** survive\n🔴 **BANG** — **${out.length}** eliminated${out.length ? `: ${names(field, out.map(p => p.id), 15)}` : ''}${note}`).setFooter({ text: BRAND })] });
  return { out, safe };
}

async function run(channel, players, ctx) {
  const speed = ctx.fast ? 40 : 1;
  let field = players.slice();
  const eliminated = [];
  if (field.length === 1) return { survivors: [field[0].id], eliminated };

  await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.red).setTitle('🎰 THE FINAL REGRET')
    .setDescription(`**${field.length} sinners** left. A wheel with six chambers of fate.\nEvery spin is independent and equal — your pick of chamber is just for show. **Last one standing wins.**\n\n*Starting in 5 seconds…*`).setFooter({ text: BRAND })] });
  await sleep(ctx.fast ? 50 : 5000);

  let round = 0, turns = 0;
  while (field.length > 8 && !ctx.state.cancelled && round < 30) {
    round++;
    const { out, safe } = await groupRound(channel, field, bulletsFor(field.length), round, ctx, speed);
    eliminated.push(...out.map(p => p.id));
    field = safe;
    await sleep(ctx.fast ? 20 : 2000);
  }

  let order = [];
  while (field.length > 1 && !ctx.state.cancelled && turns < 400) {
    if (!order.length) order = shuffle(field.map(p => p.id));          // fresh random order each cycle
    const id = order.shift();
    const p = field.find(x => x.id === id);
    if (!p) continue;
    turns++;
    const bullets = bulletsFor(field.length);
    const gid = `${channel.id}_${Date.now()}_t${turns}`;
    const msg = await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.purple).setTitle('🎰 THE FINAL REGRET')
      .setDescription(`**${p.username}'s turn!**\nCHOOSE YOUR FATE!\n\n🎲 Odds: **${bullets} in 6** • Sinners left: **${field.length}**\nYou have **${Math.round(TURN_MS / speed / 1000)} seconds**.`).setFooter({ text: BRAND })],
      components: chamberButtons(gid) });
    let chosen = null;
    const col = msg.createMessageComponentCollector({ filter: i => i.customId.startsWith(`rr_${gid}_`), time: TURN_MS / speed });
    col.on('collect', (i) => {
      if (i.user.id !== id) return i.reply({ content: `⏳ It's **${p.username}**'s turn.`, ephemeral: true }).catch(() => {});
      if (chosen) return i.deferUpdate().catch(() => {});
      chosen = parseInt(i.customId.split('_').pop(), 10);
      i.deferUpdate().catch(() => {});
      col.stop('picked');
    });
    ctx.state.onCancel = () => col.stop('cancel');
    await new Promise(r => col.on('end', r));
    if (ctx.state.cancelled) break;
    const auto = chosen === null;
    if (auto) chosen = 1 + secureInt(6);
    await msg.edit({ embeds: [new EmbedBuilder().setColor(COLORS.purple).setTitle('🎰 THE FINAL REGRET')
      .setDescription(`**${p.username}** ${auto ? 'froze — fate picked' : 'picked'} chamber **${chosen}**…\n\n🎡 The wheel spins…`).setFooter({ text: BRAND })], components: [] }).catch(() => {});
    await sleep(ctx.fast ? 20 : 2200);
    const bang = spin(bullets);
    if (bang) {
      field = field.filter(x => x.id !== id); eliminated.push(id);
      order = order.filter(x => x !== id);
      await msg.edit({ embeds: [new EmbedBuilder().setColor(COLORS.red).setTitle('🔴 BANG — REGRET!')
        .setDescription(`**${p.username}** picked chamber **${chosen}** and has been **eliminated!**\n**${field.length}** left.`).setFooter({ text: BRAND })] }).catch(() => {});
    } else {
      await msg.edit({ embeds: [new EmbedBuilder().setColor(COLORS.green).setTitle('🟢 CLICK — SAFE!')
        .setDescription(`**${p.username}** picked chamber **${chosen}** — you survived!`).setFooter({ text: BRAND })] }).catch(() => {});
    }
    await sleep(ctx.fast ? 20 : 1500);
  }
  if (field.length > 1 && !ctx.state.cancelled) {            // safety valve — never loop forever
    const keep = field[secureInt(field.length)];
    await channel.send(`🎰 The wheel gives up — **${keep.username}** is drawn at random as the survivor.`);
    eliminated.push(...field.filter(p => p.id !== keep.id).map(p => p.id));
    field = [keep];
  }
  return { survivors: field.map(p => p.id), eliminated };
}

module.exports = { run, bulletsFor, spin };
