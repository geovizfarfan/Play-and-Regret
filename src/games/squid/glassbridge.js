/**
 * glassbridge.js — GLASS BRIDGE (Squid Games stage 4)
 * Hidden path, one safe panel per row. Players go one at a time in random order.
 * Every row is revealed the first time anyone steps on it (safe panel shown for good), so later
 * players cross revealed rows for free. Early players get a free one-time "scan" (see below).
 * No Sins can buy anything here.
 *
 * Fairness: the first third of the order (min 1) each get one free scan — it shows them the safe
 * panel of the next unrevealed row (privately), offsetting the disadvantage of going first.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BRAND, COLORS, sleep, secureInt, shuffle, names } = require('./common');

const TURN_MS = 12000;

function rowsFor(n) { return Math.max(4, Math.min(8, Math.ceil(n / 2) + 2)); }
function scansFor(n) { return n <= 2 ? 1 : Math.ceil(n / 3); }

/** Pure game state — all the rules live here so they can be tested without Discord. */
class BridgeGame {
  constructor(playerIds, rows, rng = secureInt) {
    this.rows = rows;
    this.path = Array.from({ length: rows }, () => (rng(2) === 0 ? 'L' : 'R'));
    this.order = playerIds.slice();                 // already shuffled by the caller
    this.status = new Map(this.order.map(id => [id, 'active']));
    this.progress = new Map(this.order.map(id => [id, 0]));
    this.revealed = 0;                              // rows 0..revealed-1 are known
    this.turn = 0;                                  // index into order
    this.scans = new Set(this.order.slice(0, scansFor(this.order.length)));
    this.fallOrder = [];
  }
  active() { return this.order.filter(id => this.status.get(id) === 'active'); }
  crossed() { return this.order.filter(id => this.status.get(id) === 'crossed'); }
  done() { return this.active().length === 0; }
  current() {
    const act = this.active();
    return act.length ? act[this.turn % act.length] : null;
  }
  canScan(id) { return this.scans.has(id) && this.revealed < this.rows; }
  scan(id) { if (!this.canScan(id)) return null; this.scans.delete(id); return this.path[this.revealed]; }
  /** Current player steps on a panel. Returns { id, safe, row, crossed, revealedAll } */
  pick(side) {
    const id = this.current();
    const row = this.revealed;
    const safe = this.path[row] === side;
    this.revealed++;
    let crossed = false;
    if (safe) {
      this.progress.set(id, row + 1);
      if (row + 1 === this.rows) { this.status.set(id, 'crossed'); crossed = true; }
    } else {
      this.status.set(id, 'fallen');
      this.fallOrder.push(id);
    }
    if (this.revealed >= this.rows) {                // bridge fully revealed → everyone still standing walks across
      for (const a of this.active()) { this.status.set(a, 'crossed'); this.progress.set(a, this.rows); }
    } else {
      const act = this.active();
      // move to the next active player (the one after the current in order)
      if (act.length) {
        const idx = act.indexOf(id);
        this.turn = idx === -1 ? this.turn % act.length : (idx + 1) % act.length;
      }
    }
    return { id, safe, row, crossed };
  }
}

function drawBridge(game, current) {
  const lines = [];
  for (let r = game.rows - 1; r >= 0; r--) {
    let cells;
    if (r < game.revealed) cells = game.path[r] === 'L' ? '🟩 💥' : '💥 🟩';
    else cells = '⬜ ⬜';
    lines.push(`${r === game.revealed ? '➡️' : '▫️'} \`Row ${String(r + 1).padStart(2)}\` ${cells}`);
  }
  return lines.join('\n');
}

async function turnLoop(channel, players, game, ctx, speed) {
  const gid = `${channel.id}_${Date.now()}`;
  const nameOf = id => players.find(p => p.id === id)?.username || 'Someone';
  let msg = null;

  while (!game.done() && !ctx.state.cancelled) {
    const cur = game.current();
    const canScan = game.canScan(cur);
    const embed = (extra = '') => new EmbedBuilder().setColor(COLORS.purple).setTitle('<a:bridge:1560789535330144286> GLASS BRIDGE')
      .setDescription(`**${nameOf(cur)}'s turn!**\nBridge progress: **${game.revealed}/${game.rows}** rows revealed\n\n${drawBridge(game, cur)}\n\n${extra}Choose carefully — **${Math.round(TURN_MS / speed / 1000)} seconds**.`)
      .addFields({ name: 'Standing', value: String(game.active().length), inline: true }, { name: 'Fallen', value: String(game.fallOrder.length), inline: true })
      .setFooter({ text: BRAND });
    const buttons = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gb_${gid}_L`).setLabel('LEFT').setEmoji('⬅️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`gb_${gid}_R`).setLabel('RIGHT').setEmoji('➡️').setStyle(ButtonStyle.Primary),
      ...(canScan ? [new ButtonBuilder().setCustomId(`gb_${gid}_S`).setLabel('Scan (free, once)').setEmoji('🔍').setStyle(ButtonStyle.Secondary)] : []));

    msg = await channel.send({ embeds: [embed()], components: [buttons()] });
    let chosen = null, scanned = false;
    const col = msg.createMessageComponentCollector({ filter: i => i.customId.startsWith(`gb_${gid}_`), time: TURN_MS / speed });
    col.on('collect', (i) => {
      if (i.user.id !== cur) return i.reply({ content: `⏳ It's **${nameOf(cur)}**'s turn.`, ephemeral: true }).catch(() => {});
      const k = i.customId.split('_').pop();
      if (k === 'S') {
        if (scanned || !game.canScan(cur)) return i.reply({ content: 'No scan left.', ephemeral: true }).catch(() => {});
        scanned = true;
        const safe = game.scan(cur);
        return i.reply({ content: `🔍 The safe panel is **${safe === 'L' ? 'LEFT ⬅️' : 'RIGHT ➡️'}** — only you can see this.`, ephemeral: true }).catch(() => {});
      }
      if (chosen) return i.deferUpdate().catch(() => {});
      chosen = k;
      i.deferUpdate().catch(() => {});
      col.stop('picked');
    });
    ctx.state.onCancel = () => col.stop('cancel');
    await new Promise(r => col.on('end', r));
    if (ctx.state.cancelled) break;

    let timedOut = false;
    if (!chosen) { timedOut = true; chosen = secureInt(2) === 0 ? 'L' : 'R'; }
    const res = game.pick(chosen);
    const side = chosen === 'L' ? 'LEFT' : 'RIGHT';
    let line;
    if (res.safe) line = `🟩 **${nameOf(res.id)}** ${timedOut ? 'ran out of time — fate picked ' : 'stepped '}**${side}** — **SAFE!**${res.crossed ? ' 🏁 Crossed the bridge!' : ''}`;
    else line = `💥 **${nameOf(res.id)}** ${timedOut ? 'ran out of time — fate picked ' : 'stepped '}**${side}** — the glass **SHATTERS!** They fall…`;
    await msg.edit({ embeds: [embed(`${line}\n\n`).setColor(res.safe ? COLORS.green : COLORS.red)], components: [] }).catch(() => {});
    if (game.revealed >= game.rows && game.crossed().length) {
      await channel.send(`<a:bridge:1560789535330144286> The whole bridge is revealed — **${game.crossed().length}** sinner${game.crossed().length === 1 ? '' : 's'} walk across.`);
    }
    await sleep(ctx.fast ? 20 : 1800);
  }
}

/** Standalone sudden death: everyone picks LEFT/RIGHT at once, one is safe, repeat until one is left. */
async function suddenDeath(channel, players, ctx, speed) {
  let field = players.slice();
  let n = 0;
  while (field.length > 1 && !ctx.state.cancelled) {
    n++;
    const gid = `${channel.id}_${Date.now()}_sd${n}`;
    const picks = new Map(); const ids = new Set(field.map(p => p.id));
    const msg = await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.red).setTitle('<a:bridge:1560789535330144286> SUDDEN DEATH GLASS')
      .setDescription(`**${field.length} sinners** crossed — only one may win.\nOne panel is safe. Pick within **${Math.round(10000 / speed / 1000)}s** (no pick = eliminated).`).setFooter({ text: BRAND })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gbs_${gid}_L`).setLabel('LEFT').setEmoji('⬅️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gbs_${gid}_R`).setLabel('RIGHT').setEmoji('➡️').setStyle(ButtonStyle.Primary))] });
    const col = msg.createMessageComponentCollector({ filter: i => i.customId.startsWith(`gbs_${gid}_`), time: 10000 / speed });
    col.on('collect', (i) => {
      if (!ids.has(i.user.id)) return i.reply({ content: "You're not in this round.", ephemeral: true }).catch(() => {});
      if (picks.has(i.user.id)) return i.reply({ content: 'Locked in already!', ephemeral: true }).catch(() => {});
      picks.set(i.user.id, i.customId.split('_').pop());
      i.reply({ content: '🔒 Locked in.', ephemeral: true }).catch(() => {});
      if (picks.size >= field.length) col.stop('all');
    });
    ctx.state.onCancel = () => col.stop('cancel');
    await new Promise(r => col.on('end', r));
    if (ctx.state.cancelled) break;
    const safe = secureInt(2) === 0 ? 'L' : 'R';
    const alive = field.filter(p => picks.get(p.id) === safe);
    await msg.edit({ components: [] }).catch(() => {});
    if (!alive.length) {
      await channel.send(`💥 **${safe === 'L' ? 'LEFT' : 'RIGHT'}** was safe — and nobody chose it! Same sinners, new glass…`);
      if (n >= 8) field = [field[secureInt(field.length)]];
      continue;
    }
    await channel.send(`🟩 **${safe === 'L' ? 'LEFT' : 'RIGHT'}** was safe! **${alive.length}** survive.`);
    field = alive;
    await sleep(ctx.fast ? 20 : 1500);
  }
  return field;
}

async function run(channel, players, ctx) {
  const speed = ctx.fast ? 40 : 1;
  const order = shuffle(players.map(p => p.id));
  const rows = rowsFor(players.length);
  const game = new BridgeGame(order, rows);

  await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.purple).setTitle('<a:bridge:1560789535330144286> GLASS BRIDGE')
    .setDescription(
      `**${players.length} sinners**, **${rows} rows**. Each row has one safe panel and one that shatters.\n` +
      `You go one at a time in a random order. Once a row is revealed it stays revealed — so the brave go first… and the lucky go last.\n\n` +
      `🔍 **Free scan:** the first **${scansFor(players.length)}** in the order get one private peek at the next safe panel.\n` +
      `**Order:** ${order.map((id, i) => `${i + 1}. ${players.find(p => p.id === id).username}`).slice(0, 15).join(' • ')}${order.length > 15 ? ' …' : ''}\n\n*Starting in 6 seconds…*`).setFooter({ text: BRAND })] });
  await sleep(ctx.fast ? 50 : 6000);

  await turnLoop(channel, players, game, ctx, speed);
  if (ctx.state.cancelled) return { survivors: [], eliminated: [] };

  let crossed = game.crossed();
  const fallen = game.fallOrder.slice();
  if (crossed.length === 0) {
    // Everyone fell → announced tiebreak: whoever fell last (made it furthest) gets pulled back up
    const last = fallen[fallen.length - 1];
    await channel.send(`<a:bridge:1560789535330144286> Every sinner fell! **Tiebreak:** the last to fall — **${names(players, [last])}** — clings to the edge and survives.`);
    crossed = [last]; fallen.pop();
  }
  await channel.send({ embeds: [new EmbedBuilder().setColor(crossed.length ? COLORS.green : COLORS.red)
    .setTitle('<a:bridge:1560789535330144286> Bridge complete')
    .setDescription(`🏁 **${crossed.length}** crossed: ${names(players, crossed)}\n💀 **${fallen.length}** fell${fallen.length ? `: ${names(players, fallen)}` : ''}`).setFooter({ text: BRAND })] });

  if (ctx.mode === 'standalone' && crossed.length > 1) {
    const field = await suddenDeath(channel, players.filter(p => crossed.includes(p.id)), ctx, speed);
    return { survivors: field.map(p => p.id), eliminated: players.map(p => p.id).filter(id => !field.some(p => p.id === id)) };
  }
  return { survivors: crossed, eliminated: fallen };
}

module.exports = { run, BridgeGame, rowsFor, scansFor };
