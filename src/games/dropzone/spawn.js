// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — spawn lifecycle.
// Posting a spawn, letting it expire/escape if nobody catches it in time, and
// safely reconciling spawns that were still active when the bot restarted.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const { db } = require('../../utils/database');
const { RARITY_META } = require('./config');
const { getMonster } = require('./monsters');
const M = require('./messages');

// spawnId -> Timeout, so restart reconciliation and manual resolution can clear it
const escapeTimers = new Map();
const warnedMissingImages = new Set();
let botClient = null;

function setClient(client) { botClient = client; }

function monsterImagePath(monster) {
  return path.join(__dirname, monster.image);
}

function buildSpawnEmbed(monster, headline) {
  const meta = RARITY_META[monster.rarity];
  return new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(headline)
    .setDescription(
      `${meta.emoji} **${monster.name.toUpperCase()}**\n${meta.emoji} ${meta.label} • #${String(monster.number).padStart(3, '0')}\n\n*"${monster.flavorText}"*`
    )
    .setImage(`attachment://${String(monster.number).padStart(3, '0')}.png`)
    .setFooter({ text: 'First click starts a 3-second window — anyone can jump in' });
}

async function loadImageAttachment(monster) {
  const fs = require('fs');
  const filePath = monsterImagePath(monster);
  if (!fs.existsSync(filePath)) {
    if (!warnedMissingImages.has(monster.id)) {
      console.warn(`[Drop It Like It's Hot] Missing image for ${monster.name} (#${monster.number}) at ${filePath}`);
      warnedMissingImages.add(monster.id);
    }
    return null;
  }
  return new AttachmentBuilder(filePath, { name: `${String(monster.number).padStart(3, '0')}.png` });
}

async function postSpawn(channel, guildId, monster, spawnType = 'NATURAL', pingRoleId = null) {
  if (!botClient && channel.client) setClient(channel.client);
  const meta = RARITY_META[monster.rarity];
  const expiresAt = new Date(Date.now() + meta.expireMinutes * 60 * 1000);

  const row = await db.get(
    `INSERT INTO dropzone_spawns (guild_id, channel_id, monster_id, season, status, spawn_type, expires_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?) RETURNING id`,
    [guildId, channel.id, monster.id, monster.season, spawnType, expiresAt]
  );
  const spawnId = row.id;

  const headline = M.pick(M.SPAWN_HEADLINES[monster.rarity]);
  const embed = buildSpawnEmbed(monster, headline);
  const attachment = await loadImageAttachment(monster);
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dz_catch:${spawnId}`).setLabel('CATCH').setEmoji('👻').setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({
    content: pingRoleId ? `<@&${pingRoleId}>` : undefined,
    embeds: [embed],
    components: [row1],
    files: attachment ? [attachment] : [],
    allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
  });

  await db.run('UPDATE dropzone_spawns SET message_id = ? WHERE id = ?', [msg.id, spawnId]);

  armEscapeTimer(spawnId, guildId, channel.id, msg.id, monster, expiresAt.getTime() - Date.now());
  return spawnId;
}

function armEscapeTimer(spawnId, guildId, channelId, messageId, monster, delayMs) {
  clearTimeout(escapeTimers.get(spawnId));
  const timer = setTimeout(() => resolveEscape(spawnId, guildId, channelId, messageId, monster).catch(err => console.error('[Drop It Like It\'s Hot] escape error', err)), Math.max(0, delayMs));
  escapeTimers.set(spawnId, timer);
}

async function resolveEscape(spawnId, guildId, channelId, messageId, monster) {
  // Atomic: only actually escapes if it's still ACTIVE (nobody started catching it).
  const updated = await db.get(
    `UPDATE dropzone_spawns SET status = 'ESCAPED', resolved_at = NOW() WHERE id = ? AND status = 'ACTIVE' RETURNING id`,
    [spawnId]
  );
  escapeTimers.delete(spawnId);
  if (!updated) return; // already resolved another way (caught, cancelled)

  const meta = RARITY_META[monster.rarity];
  const lines = monster.rarity === 'mythic' ? M.ESCAPE_LINES.mythic : M.ESCAPE_LINES.default;
  const text = M.pick(lines);

  const escapedEmbed = new EmbedBuilder()
    .setColor('#555555')
    .setTitle(text)
    .setDescription(`${meta.emoji} **${monster.name.toUpperCase()}**\n${meta.emoji} ${meta.label} • #${String(monster.number).padStart(3, '0')}\n\n*"${monster.flavorText}"*`);

  await editSpawnMessage(guildId, channelId, messageId, escapedEmbed);
}

async function editSpawnMessage(guildId, channelId, messageId, embed) {
  try {
    const c = botClient ? await botClient.channels.fetch(channelId).catch(() => null) : null;
    if (!c) return;
    const msg = await c.messages.fetch(messageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  } catch (e) { /* channel/message gone — nothing to do */ }
}

/** Called once on bot startup to safely resolve spawns that were mid-flight when it last stopped. */
async function reconcileOnStartup(client) {
  setClient(client);
  const rows = await db.all(`SELECT * FROM dropzone_spawns WHERE status IN ('ACTIVE', 'CATCHING')`).catch(() => []);
  for (const row of rows) {
    const monster = getMonster(row.monster_id);
    if (!monster) continue;

    if (row.status === 'CATCHING') {
      // Participant list lived only in memory and is gone after a restart —
      // can't fairly pick a winner, so resolve as escaped rather than guess.
      await db.run(`UPDATE dropzone_spawns SET status = 'ESCAPED', resolved_at = NOW() WHERE id = ?`, [row.id]);
      const meta = RARITY_META[monster.rarity];
      const embed = new EmbedBuilder().setColor('#555555').setTitle('💨 The catch got interrupted — nobody wins this one.')
        .setDescription(`${meta.emoji} **${monster.name.toUpperCase()}** • #${String(monster.number).padStart(3, '0')}`);
      await editSpawnMessage(row.guild_id, row.channel_id, row.message_id, embed);
      continue;
    }

    const expiresAt = new Date(row.expires_at).getTime();
    if (expiresAt <= Date.now()) {
      await resolveEscape(row.id, row.guild_id, row.channel_id, row.message_id, monster);
    } else {
      armEscapeTimer(row.id, row.guild_id, row.channel_id, row.message_id, monster, expiresAt - Date.now());
    }
  }
}

module.exports = { postSpawn, resolveEscape, editSpawnMessage, reconcileOnStartup, setClient, escapeTimers, buildSpawnEmbed };
