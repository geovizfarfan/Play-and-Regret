/**
 * autodrop.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Guild-wide automatic sins drops. Bot-sourced (no specific dropper), fires at
 * a random interval within a configured range, in a random channel picked from
 * an opt-in allowed list, for a random amount within a configured range.
 * Restart-safe: next fire time is persisted, restored on boot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, economy } = require('../utils/database');
const jackpot          = require('../utils/jackpot');
const E                = require('../utils/emojis');

const DROP_TTL_MS = 2 * 60 * 1000; // 2 minutes to claim

const EXPIRED_QUIPS = [
  'It vanished like your motivation on a Monday.',
  'Gone. Just like everyone\'s attention span.',
  'Nobody was fast enough. Tragic.',
  'It\'s in the jackpot now. Should\'ve been quicker.',
];

const timers = new Map(); // guildId -> Timeout

function isHost(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}

// ── Fire one drop in a random allowed channel ────────────────────────────────
async function fireDrop(client, guildId) {
  const config = await db.get('SELECT * FROM auto_drop_config WHERE guild_id = ? AND enabled = true', [guildId]).catch(() => null);
  if (!config) return;

  const channels = await db.all('SELECT channel_id FROM auto_drop_channels WHERE guild_id = ?', [guildId]).catch(() => []);
  if (!channels.length) { scheduleNext(client, guildId, config); return; } // nothing allowed yet, just reschedule

  const pick = channels[Math.floor(Math.random() * channels.length)];
  const channel = await client.channels.fetch(pick.channel_id).catch(() => null);
  if (channel?.isTextBased()) {
    const amount = Math.floor(config.min_amount + Math.random() * (config.max_amount - config.min_amount + 1));
    await launchAutoDrop(channel, amount).catch(() => {});
  }

  scheduleNext(client, guildId, config);
}

// ── Compute and persist the next fire time, set the in-memory timer ─────────
async function scheduleNext(client, guildId, config) {
  const delayMs = (config.min_minutes + Math.random() * (config.max_minutes - config.min_minutes)) * 60000;
  const nextAt = new Date(Date.now() + delayMs);
  await db.run('UPDATE auto_drop_config SET next_drop_at = ? WHERE guild_id = ?', [nextAt.toISOString(), guildId]).catch(() => {});

  const existing = timers.get(guildId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => fireDrop(client, guildId), Math.max(delayMs, 1000));
  timers.set(guildId, t);
}

// ── The bot-sourced drop itself (no specific dropper mentioned) ─────────────
async function launchAutoDrop(channel, amount) {
  const claimId = `autodrop_${channel.id}_${Date.now()}`;
  let claimed = false;

  const makeEmbed = (done = false, claimedBy = null, quip = null) => new EmbedBuilder()
    .setColor(done ? '#555555' : '#C9B1FF')
    .setDescription(done
      ? (claimedBy
        ? `<a:congrats:1478999022072238222> **Drop CLAIMED!**\n**${claimedBy}** snatched **${amount.toLocaleString()}** <a:SINS:1522338223613804724> out of nowhere! <a:moneybag:1479268556687540345>`
        : `<a:583778moneyfly:1479271753392853023> **Drop Expired**\nNobody claimed the **${amount.toLocaleString()}** <a:SINS:1522338223613804724> in time. ${quip || 'It vanished into thin air!'} <a:583778moneyfly:1479271753392853023>`)
      : `<a:SINS:1522338223613804724> **A wild sins drop appeared!** **${amount.toLocaleString()} sins** just fell out of nowhere! <a:moneybag:1479268556687540345>\n\nFirst to press the button claims it all! <a:run:1479270296140910653>\n\n⏳ Drop expires in 2 minutes`)
    .setFooter({ text: done ? 'Drop over.' : 'One winner only!' });

  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(claimId).setLabel('💸 Claim it!').setStyle(ButtonStyle.Success)
  );

  const msg = await channel.send({ embeds: [makeEmbed()], components: [btn] });
  const collector = msg.createMessageComponentCollector({ time: DROP_TTL_MS });

  collector.on('collect', async (interaction) => {
    if (interaction.customId !== claimId || claimed) return;
    await interaction.deferUpdate();
    claimed = true;

    await economy.getUser(interaction.user.id, interaction.user.username);
    await economy.addFunds(interaction.user.id, amount, 'Auto-drop claim');

    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(claimId).setLabel('💸 Claimed!').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await msg.edit({ embeds: [makeEmbed(true, interaction.user.username)], components: [disabledBtn] }).catch(() => {});
    await interaction.followUp({
      content: `<a:congrats:1478999022072238222> **Drop CLAIMED!** **${interaction.user.username}** snatched **${amount.toLocaleString()}** <a:SINS:1522338223613804724>! <a:moneybag:1479268556687540345>`,
    });
    collector.stop('claimed');
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'claimed' || claimed) return;
    await jackpot.addToDrawFund(amount).catch(() => {});
    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(claimId).setLabel('💸 Expired').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    const quip = EXPIRED_QUIPS[Math.floor(Math.random() * EXPIRED_QUIPS.length)];
    await msg.edit({ embeds: [makeEmbed(true, null, quip)], components: [disabledBtn] }).catch(() => {});
  });
}

module.exports = {
  name: 'autodrop',

  // Called from index.js on ready — resumes any enabled auto-drop schedules
  async init(client) {
    const configs = await db.all('SELECT * FROM auto_drop_config WHERE enabled = true').catch(() => []);
    for (const config of configs) {
      const now = Date.now();
      const nextAt = config.next_drop_at ? new Date(config.next_drop_at).getTime() : null;
      if (!nextAt || nextAt <= now) {
        // overdue or never scheduled — fire (or reschedule if no channels yet) right away
        fireDrop(client, config.guild_id).catch(() => {});
      } else {
        const t = setTimeout(() => fireDrop(client, config.guild_id), nextAt - now);
        timers.set(config.guild_id, t);
      }
    }
  },

  async handleCommand(message, args, command) {
    if (command !== 'autodrop') return;
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'setup') return this.setup(message, args.slice(1));
    if (sub === 'stop' || sub === 'off') return this.stop(message);
    if (sub === 'status') return this.status(message);
    if (sub === 'addchannel') return this.addChannel(message);
    if (sub === 'removechannel') return this.removeChannel(message);
    if (sub === 'channels') return this.listChannels(message);

    return message.reply(
      `${E.ERROR} Usage:\n` +
      '`!autodrop setup <min_amount> <max_amount> <min_minutes> <max_minutes>`\n' +
      '`!autodrop addchannel #channel` — allow drops here\n' +
      '`!autodrop removechannel #channel` — disallow drops here\n' +
      '`!autodrop channels` — list allowed channels\n' +
      '`!autodrop status` — view current config\n' +
      '`!autodrop stop` — turn it off'
    );
  },

  async setup(message, args) {
    if (!isHost(message.member)) return message.reply(`${E.ERROR} You need the **${process.env.EVENT_HOST_ROLE || 'Event Host'}** role to set this up.`);
    const [minAmt, maxAmt, minMin, maxMin] = args.map(a => parseInt(a));
    if (!minAmt || !maxAmt || !minMin || !maxMin || minAmt > maxAmt || minMin > maxMin) {
      return message.reply(`${E.ERROR} Usage: \`!autodrop setup <min_amount> <max_amount> <min_minutes> <max_minutes>\`\nExample: \`!autodrop setup 50 500 60 180\` — drops of 50-500 sins, every 1-3 hours.`);
    }

    await db.run(
      `INSERT INTO auto_drop_config (guild_id, enabled, min_amount, max_amount, min_minutes, max_minutes, host_id, host_name)
       VALUES (?, true, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id) DO UPDATE SET
         enabled = true, min_amount = EXCLUDED.min_amount, max_amount = EXCLUDED.max_amount,
         min_minutes = EXCLUDED.min_minutes, max_minutes = EXCLUDED.max_minutes,
         host_id = EXCLUDED.host_id, host_name = EXCLUDED.host_name`,
      [message.guild.id, minAmt, maxAmt, minMin, maxMin, message.author.id, message.author.username]
    );

    const channelCount = (await db.all('SELECT channel_id FROM auto_drop_channels WHERE guild_id = ?', [message.guild.id])).length;
    const config = await db.get('SELECT * FROM auto_drop_config WHERE guild_id = ?', [message.guild.id]);
    await scheduleNext(message.client, message.guild.id, config);

    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:SINS:1522338223613804724> Auto-Drops Enabled')
        .setDescription(
          `<a:SINS:1522338223613804724> Amount: **${minAmt}-${maxAmt} sins**\n` +
          `<a:RojasClock:1511506715453947904> Interval: every **${minMin}-${maxMin} minutes**\n` +
          `<:member:1495666085121491024> Allowed channels: **${channelCount}**` +
          (channelCount === 0 ? '\n\n<a:Warning:1497476844860215366> No channels allowed yet — use `!autodrop addchannel #channel` or drops will just keep rescheduling with nowhere to post.' : '')
        )
    ]});
  },

  async stop(message) {
    if (!isHost(message.member)) return message.reply(`${E.ERROR} Staff only.`);
    const existing = await db.get('SELECT * FROM auto_drop_config WHERE guild_id = ?', [message.guild.id]);
    if (!existing) return message.reply(`${E.ERROR} Auto-drops aren't set up in this server.`);
    await db.run('UPDATE auto_drop_config SET enabled = false WHERE guild_id = ?', [message.guild.id]);
    const t = timers.get(message.guild.id);
    if (t) { clearTimeout(t); timers.delete(message.guild.id); }
    return message.reply('<:checkmark:1495666088417956002> Auto-drops turned off for this server.');
  },

  async status(message) {
    const config = await db.get('SELECT * FROM auto_drop_config WHERE guild_id = ?', [message.guild.id]);
    if (!config) return message.reply(`${E.ERROR} Auto-drops have never been set up in this server.`);
    const channels = await db.all('SELECT channel_id FROM auto_drop_channels WHERE guild_id = ?', [message.guild.id]);
    const nextAt = config.next_drop_at ? Math.floor(new Date(config.next_drop_at).getTime() / 1000) : null;

    return message.reply({ embeds: [
      new EmbedBuilder().setColor(config.enabled ? '#C9B1FF' : '#555555')
        .setTitle(`<a:SINS:1522338223613804724> Auto-Drops — ${config.enabled ? 'ON' : 'OFF'}`)
        .setDescription(
          `<a:SINS:1522338223613804724> Amount: **${config.min_amount}-${config.max_amount} sins**\n` +
          `<a:RojasClock:1511506715453947904> Interval: every **${config.min_minutes}-${config.max_minutes} minutes**\n` +
          `<:member:1495666085121491024> Allowed channels: **${channels.length}**\n` +
          (config.enabled && nextAt ? `<a:purplesparkle:1479210541691175054> Next drop: <t:${nextAt}:R>` : '')
        )
    ]});
  },

  async addChannel(message) {
    if (!isHost(message.member)) return message.reply(`${E.ERROR} Staff only.`);
    const ch = message.mentions?.channels?.first();
    if (!ch) return message.reply(`${E.ERROR} Mention a channel. Example: \`!autodrop addchannel #general\``);
    await db.run('INSERT INTO auto_drop_channels (guild_id, channel_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [message.guild.id, ch.id]);
    return message.reply(`<:checkmark:1495666088417956002> <#${ch.id}> added to the auto-drop channel list.`);
  },

  async removeChannel(message) {
    if (!isHost(message.member)) return message.reply(`${E.ERROR} Staff only.`);
    const ch = message.mentions?.channels?.first();
    if (!ch) return message.reply(`${E.ERROR} Mention a channel. Example: \`!autodrop removechannel #general\``);
    await db.run('DELETE FROM auto_drop_channels WHERE guild_id = ? AND channel_id = ?', [message.guild.id, ch.id]);
    return message.reply(`<:checkmark:1495666088417956002> <#${ch.id}> removed from the auto-drop channel list.`);
  },

  async listChannels(message) {
    const channels = await db.all('SELECT channel_id FROM auto_drop_channels WHERE guild_id = ?', [message.guild.id]);
    if (!channels.length) return message.reply(`${E.ERROR} No channels allowed yet. Use \`!autodrop addchannel #channel\`.`);
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<:member:1495666085121491024> Auto-Drop Allowed Channels')
        .setDescription(channels.map(c => `<#${c.channel_id}>`).join('\n'))
    ]});
  },
};
