// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — the CATCH button.
// First click atomically transitions ACTIVE -> CATCHING (only one click can
// ever win that race, via a WHERE-guarded UPDATE) and opens a short window;
// anyone who clicks during that window is thrown into a random draw once it
// closes. Concurrency-safe: exactly one winner, ever, per spawn.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { db } = require('../../utils/database');
const { CONFIG, RARITY_META } = require('./config');
const { getMonster } = require('./monsters');
const { escapeTimers, editSpawnMessage } = require('./spawn');
const M = require('./messages');

// spawnId -> { participants: Set<userId>, resolved: boolean }
const catchWindows = new Map();

async function handleCatchButton(interaction) {
  const spawnId = parseInt(interaction.customId.split(':')[1]);
  const userId = interaction.user.id;

  const spawn = await db.get('SELECT * FROM dropzone_spawns WHERE id = ?', [spawnId]);
  if (!spawn) return interaction.reply({ content: '<:wrong:1495666083594502174> This one\'s gone.', ephemeral: true });

  if (spawn.status === 'CAUGHT') return interaction.reply({ content: '<:wrong:1495666083594502174> Already caught.', ephemeral: true });
  if (spawn.status === 'ESCAPED' || spawn.status === 'CANCELLED') return interaction.reply({ content: '💨 Too slow — it got away.', ephemeral: true });

  const monster = getMonster(spawn.monster_id);
  if (!monster) return interaction.reply({ content: '<:wrong:1495666083594502174> Something went wrong on this one.', ephemeral: true });

  if (spawn.status === 'ACTIVE') {
    // Try to be the one that starts the window — only one click can win this race.
    const won = await db.get(`UPDATE dropzone_spawns SET status = 'CATCHING' WHERE id = ? AND status = 'ACTIVE' RETURNING id`, [spawnId]);
    if (won) {
      clearTimeout(escapeTimers.get(spawnId));
      escapeTimers.delete(spawnId);
      catchWindows.set(spawnId, { participants: new Set([userId]), resolved: false });
      setTimeout(() => resolveCatch(spawnId, spawn, monster).catch(err => console.error('[Drop It Like It\'s Hot] catch resolve error', err)), CONFIG.catchWindowSeconds * 1000);
      return interaction.reply({ content: '<:checkmark:1495666088417956002> You\'re in! Window\'s open for a few seconds.', ephemeral: true });
    }
    // Lost the race to become CATCHING by a hair — fall through, someone else just started the window.
  }

  // status is (now) CATCHING — join the in-memory window if we still have it.
  const window = catchWindows.get(spawnId);
  if (!window || window.resolved) {
    return interaction.reply({ content: '<:wrong:1495666083594502174> The window already closed.', ephemeral: true });
  }
  if (window.participants.has(userId)) {
    return interaction.reply({ content: '<a:Warning:1497476844860215366> You\'re already in the draw.', ephemeral: true });
  }
  window.participants.add(userId);
  return interaction.reply({ content: '<:checkmark:1495666088417956002> You\'re in!', ephemeral: true });
}

async function resolveCatch(spawnId, spawn, monster) {
  const window = catchWindows.get(spawnId);
  if (!window || window.resolved) return;
  window.resolved = true;

  const participants = [...window.participants];
  catchWindows.delete(spawnId);

  if (!participants.length) {
    // Shouldn't happen (the first clicker is always in the set) — treat defensively as an escape.
    await db.run(`UPDATE dropzone_spawns SET status = 'ESCAPED', resolved_at = NOW() WHERE id = ?`, [spawnId]);
    return;
  }

  const winnerId = participants[Math.floor(Math.random() * participants.length)];

  const result = await db.get(
    `INSERT INTO dropzone_collections (user_id, monster_id, season, quantity, first_caught_at)
     VALUES (?, ?, ?, 1, NOW())
     ON CONFLICT (user_id, monster_id, season) DO UPDATE SET quantity = dropzone_collections.quantity + 1
     RETURNING quantity`,
    [winnerId, monster.id, monster.season]
  );
  const isNew = result.quantity === 1;

  await db.run(`UPDATE dropzone_spawns SET status = 'CAUGHT', caught_by = ?, resolved_at = NOW() WHERE id = ?`, [winnerId, spawnId]);

  const meta = RARITY_META[monster.rarity];
  const headline = M.pick(M.CATCH_LINES);
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(headline)
    .setDescription(
      `<@${winnerId}> captured **${monster.name.toUpperCase()}**!\n\n` +
      `${meta.emoji} ${meta.label} • #${String(monster.number).padStart(3, '0')}\n\n` +
      (isNew ? `✨ **NEW STICKER!**` : `👀 **DUPLICATE!** ${monster.name} ×${result.quantity}`) +
      (participants.length > 1 ? `\n\n*${participants.length} people went for it — random draw picked <@${winnerId}>.*` : '')
    );

  await editSpawnMessage(spawn.guild_id, spawn.channel_id, spawn.message_id, embed);
}

module.exports = { handleCatchButton };
