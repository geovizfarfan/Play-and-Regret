// ─────────────────────────────────────────────────────────────────────────────
// Confession Box — anonymous confessions posted to a designated channel.
// Nobody's identity is ever shown in any reply or post; the submitter's user_id
// is stored only internally for the cooldown check.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { db } = require('../utils/database');

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_LENGTH = 1000;

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}

async function getConfig(guildId) {
  return db.get('SELECT * FROM confession_config WHERE guild_id = ?', [guildId]);
}

async function setChannel(guildId, channelId) {
  await db.run(
    `INSERT INTO confession_config (guild_id, channel_id, next_number) VALUES (?, ?, 1)
     ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id`,
    [guildId, channelId]
  );
}

async function checkCooldown(userId) {
  const last = await db.get(
    'SELECT created_at FROM confessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (!last) return null;
  const elapsed = Date.now() - new Date(last.created_at).getTime();
  if (elapsed >= COOLDOWN_MS) return null;
  const remainingMs = COOLDOWN_MS - elapsed;
  return { minutes: Math.ceil(remainingMs / 60000) };
}

async function submitConfession(guild, userId, content) {
  const config = await getConfig(guild.id);
  if (!config) return { error: 'not_configured' };

  const cooldown = await checkCooldown(userId);
  if (cooldown) return { error: 'cooldown', minutes: cooldown.minutes };

  const trimmed = content.trim();
  if (!trimmed) return { error: 'empty' };
  if (trimmed.length > MAX_LENGTH) return { error: 'too_long' };

  const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
  if (!channel) return { error: 'channel_missing' };

  const number = config.next_number;
  const embed = new EmbedBuilder()
    .setColor('#2B0057')
    .setTitle(`<a:pray:1495665631775817778> Confession #${number}`)
    .setDescription(trimmed)
    .setFooter({ text: 'Anonymous — nobody knows who sent this' });

  const msg = await channel.send({ embeds: [embed] });

  await db.run(
    'INSERT INTO confessions (guild_id, number, user_id, message_id, channel_id, content) VALUES (?, ?, ?, ?, ?, ?)',
    [guild.id, number, userId, msg.id, channel.id, trimmed]
  );
  await db.run('UPDATE confession_config SET next_number = next_number + 1 WHERE guild_id = ?', [guild.id]);

  return { success: true, number, channel };
}

async function deleteConfession(guild, number) {
  const row = await db.get('SELECT * FROM confessions WHERE guild_id = ? AND number = ?', [guild.id, number]);
  if (!row) return { error: 'not_found' };

  if (row.message_id && row.channel_id) {
    const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
    const msg = channel ? await channel.messages.fetch(row.message_id).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
  }
  await db.run('DELETE FROM confessions WHERE guild_id = ? AND number = ?', [guild.id, number]);
  return { success: true };
}

module.exports = {
  name: 'confession',

  async handleCommand(message, args, command) {
    if (command === 'confessionchannel') {
      if (!isAdmin(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('<:wrong:1495666083594502174> Mention a channel: `!confessionchannel #channel`');
      await setChannel(message.guild.id, channel.id);
      return message.reply(`<:checkmark:1495666088417956002> Confessions will now post in ${channel}.`);
    }

    if (command === 'confession') {
      return message.reply('<:wrong:1495666083594502174> For real anonymity, confessions only work through **`/confession`** — typing it as a regular message would show your name in the channel before the bot can react.');
    }

    if (command === 'confessiondelete') {
      if (!isAdmin(message.member)) return message.reply('<:wrong:1495666083594502174> Admin only.');
      const number = parseInt(args[0]);
      if (!number) return message.reply('<:wrong:1495666083594502174> Usage: `!confessiondelete <number>`');
      const result = await deleteConfession(message.guild, number);
      if (result.error === 'not_found') return message.reply('<:wrong:1495666083594502174> No confession with that number found.');
      return message.reply(`<:checkmark:1495666088417956002> Confession #${number} deleted.`);
    }
  },

  async handleSlash(interaction, commandName) {
    if (commandName === 'confessionchannel') {
      if (!isAdmin(interaction.member)) return interaction.reply({ content: '<:wrong:1495666083594502174> Admin only.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      await setChannel(interaction.guild.id, channel.id);
      return interaction.reply({ content: `<:checkmark:1495666088417956002> Confessions will now post in ${channel}.`, ephemeral: true });
    }

    if (commandName === 'confession') {
      const content = interaction.options.getString('text');
      const result = await submitConfession(interaction.guild, interaction.user.id, content);
      return handleResult(result, (msg) => interaction.reply({ content: msg, ephemeral: true }));
    }

    if (commandName === 'confessiondelete') {
      if (!isAdmin(interaction.member)) return interaction.reply({ content: '<:wrong:1495666083594502174> Admin only.', ephemeral: true });
      const number = interaction.options.getInteger('number');
      const result = await deleteConfession(interaction.guild, number);
      if (result.error === 'not_found') return interaction.reply({ content: '<:wrong:1495666083594502174> No confession with that number found.', ephemeral: true });
      return interaction.reply({ content: `<:checkmark:1495666088417956002> Confession #${number} deleted.`, ephemeral: true });
    }
  },
};

async function handleResult(result, replyFn) {
  if (result.error === 'not_configured') return replyFn('<:wrong:1495666083594502174> No confession channel set up yet — ask an admin to run `/confessionchannel`.');
  if (result.error === 'cooldown') return replyFn(`<:wrong:1495666083594502174> You can confess again in **${result.minutes} minute${result.minutes !== 1 ? 's' : ''}**.`);
  if (result.error === 'empty') return replyFn('<:wrong:1495666083594502174> Your confession can\'t be empty.');
  if (result.error === 'too_long') return replyFn(`<:wrong:1495666083594502174> Keep it under ${MAX_LENGTH} characters.`);
  if (result.error === 'channel_missing') return replyFn('<:wrong:1495666083594502174> The confession channel no longer exists — ask an admin to set a new one.');
  if (result.success) return replyFn(`<:checkmark:1495666088417956002> Your confession was posted anonymously as **#${result.number}**.`);
}
