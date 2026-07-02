/**
 * src/events/rumbleroyale.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Rumble Royale Integration for Play & Regret
 *
 * Monitors Rumble Royale bot messages to:
 * - Detect battle start → post custom battle announcement
 * - Detect battle end/winner → give sins, assign role, ping host, post win embed
 *
 * Per-channel config stored in rr_channel_config table.
 * Stats tracked in rr_stats table.
 *
 * COMMANDS
 *   /rrsetup         — configure a Rumble Royale channel
 *   /rrstats         — view stats for a channel or server-wide
 *   /rrglobalstats   — compare RR stats vs Rumble Slaughter stats
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, PermissionFlagsBits,
} = require('discord.js');
const { db, economy } = require('../utils/database');
const E = require('../utils/emojis');

const RUMBLE_ROYALE_BOT_ID = '693167035068317736';

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getConfig(channelId) {
  return db.get('SELECT * FROM rr_channel_config WHERE channel_id = $1', [channelId]);
}

async function trackWin(guildId, channelId, userId, username) {
  await db.run(
    `INSERT INTO rr_stats (guild_id, channel_id, user_id, username, wins, losses, games)
     VALUES ($1, $2, $3, $4, 1, 0, 1)
     ON CONFLICT (guild_id, user_id)
     DO UPDATE SET wins = rr_stats.wins + 1, games = rr_stats.games + 1, username = $4`,
    [guildId, channelId, userId, username]
  );
}

async function trackLoss(guildId, channelId, userId, username) {
  await db.run(
    `INSERT INTO rr_stats (guild_id, channel_id, user_id, username, wins, losses, games)
     VALUES ($1, $2, $3, $4, 0, 1, 1)
     ON CONFLICT (guild_id, user_id)
     DO UPDATE SET losses = rr_stats.losses + 1, games = rr_stats.games + 1, username = $4`,
    [guildId, channelId, userId, username]
  );
}

// ─── Parse Rumble Royale winner embed ────────────────────────────────────────
// Rumble Royale posts an embed with title "WINNER!" and description like:
// "estefanyy1224 the One\nReward: 1800 ...\n...\nTotal Players: 9"
// It also mentions @user in the content above the embed

function parseWinnerEmbed(message) {
  const embed = message.embeds[0];
  if (!embed) return null;

  const title = embed.title || '';
  const desc  = embed.description || '';

  // Check if this is a winner announcement
  if (!title.includes('WINNER')) return null;

  // Try to get the mention from message content first (most reliable)
  const mentionMatch = message.content?.match(/<@!?(\d+)>/);
  const userId = mentionMatch ? mentionMatch[1] : null;

  // Extract username from description (first line before "the")
  const usernameMatch = desc.match(/^([^\n]+?)(?:\s+the\s+\w+)?(?:\n|$)/);
  const username = usernameMatch ? usernameMatch[1].trim() : null;

  // Extract total players
  const playersMatch = desc.match(/Total Players:\s*(\d+)/i);
  const totalPlayers = playersMatch ? parseInt(playersMatch[1]) : null;

  // Extract runners-up from the runners-up field
  const runnersUpField = embed.fields?.find(f =>
    f.name?.toLowerCase().includes('runner') ||
    f.name?.toLowerCase().includes('place')
  );

  return { userId, username, totalPlayers, runnersUpField };
}

// ─── Parse battle start embed ─────────────────────────────────────────────────
function parseBattleStartEmbed(message) {
  const embed = message.embeds[0];
  if (!embed) return null;

  const title = embed.title || '';
  if (!title.toLowerCase().includes('rumble royale hosted by')) return null;

  const hostMatch = title.match(/hosted by (.+)$/i);
  const host = hostMatch ? hostMatch[1].trim() : null;

  const eraMatch = embed.description?.match(/Era:\s*([^\n]+)/i) ||
                   embed.fields?.find(f => f.name?.toLowerCase().includes('era'));
  const era = eraMatch ? (eraMatch[1] || eraMatch.value || '').trim() : null;

  return { host, era };
}

// ─── Handle Rumble Royale message ────────────────────────────────────────────
async function handleRRMessage(message, client) {
  if (message.author.id !== RUMBLE_ROYALE_BOT_ID) return;
  if (!message.embeds?.length) return;

  const config = await getConfig(message.channel.id);
  if (!config) return; // channel not configured

  const embed = message.embeds[0];
  const title = embed.title || '';

  // ── Battle Start ──────────────────────────────────────────────────────────
  if (title.toLowerCase().includes('rumble royale hosted by')) {
    const parsed = parseBattleStartEmbed(message);
    if (!parsed) return;

    // Auto-react if configured
    if (config.join_emoji) {
      await message.react(config.join_emoji).catch(() => {});
    }

    // Post battle announcement if configured
    if (config.announce_channel_id || message.channel.id) {
      const announceChannel = config.announce_channel_id
        ? client.channels.cache.get(config.announce_channel_id) || message.channel
        : message.channel;

      const battleEmbed = new EmbedBuilder()
        .setColor(config.embed_color || '#9B2DF0')
        .setTitle(config.battle_title || '<:sword:1495666991187361943> Rumble Royale — BATTLE TIME!')
        .setDescription(
          (config.battle_message ? `${config.battle_message}\n\n` : '') +
          `${config.reward_amount ? `<a:moneybag:1479268556687540345> **Reward:** ${Number(config.reward_amount).toLocaleString()} sins\n` : ''}` +
          (config.winner_role_id ? `<a:trophies:1507765453299122387> **Winner Role:** <@&${config.winner_role_id}>\n` : '') +
          (config.next_channel_id ? `\n<a:purplesparkle:1479210541691175054> **Next Room:** <#${config.next_channel_id}>` : '')
        )
        .setFooter({ text: `Hosted by ${parsed.host}${parsed.era ? ` • Era: ${parsed.era}` : ''}` });

      if (config.call_role_id) {
        await announceChannel.send({
          content: `<@&${config.call_role_id}>`,
          embeds: [battleEmbed],
          ...(config.battle_image ? {} : {}),
        });
      } else {
        await announceChannel.send({ embeds: [battleEmbed] });
      }
    }
    return;
  }

  // ── Battle End / Winner ───────────────────────────────────────────────────
  if (title.includes('WINNER')) {
    const parsed = parseWinnerEmbed(message);
    if (!parsed) return;

    const { userId, username, totalPlayers } = parsed;

    // Give sins to winner
    if (userId && config.reward_amount) {
      await economy.getUser(userId, username || 'Unknown').catch(() => {});
      await economy.addFunds(userId, Number(config.reward_amount), `Rumble Royale win — ${message.channel.name}`).catch(() => {});
    }

    // Assign winner role
    if (userId && config.winner_role_id) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member) await member.roles.add(config.winner_role_id).catch(() => {});
    }

    // Track win stat
    if (userId) {
      await trackWin(message.guild.id, message.channel.id, userId, username || 'Unknown');
    }

    // Track losses for total players count (approximate — we don't have the full list, just count)
    if (totalPlayers) {
      await db.run(
        'UPDATE rr_channel_config SET total_games = total_games + 1, total_players = total_players + $1 WHERE channel_id = $2',
        [totalPlayers, message.channel.id]
      ).catch(() => {});
    }

    // Build win announcement embed
    const winnerMention = userId ? `<@${userId}>` : `**${username}**`;
    const winEmbed = new EmbedBuilder()
      .setColor(config.embed_color || '#9B2DF0')
      .setTitle(`<a:trophies:1507765453299122387> WINNER!`)
      .setDescription(
        `${winnerMention} has won **Rumble Royale**!\n\n` +
        (config.reward_amount ? `<a:moneybag:1479268556687540345> **+${Number(config.reward_amount).toLocaleString()} sins** added to their balance!\n` : '') +
        (config.winner_role_id ? `<a:purplesparkle:1479210541691175054> **Role:** <@&${config.winner_role_id}>\n` : '') +
        (totalPlayers ? `<:member:1495666085121491024> **Total Players:** ${totalPlayers}\n` : '') +
        (config.win_message ? `\n${config.win_message}` : '')
      )
      .setFooter({ text: `Channel: #${message.channel.name}` });

    if (userId) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member?.user?.displayAvatarURL) {
        winEmbed.setThumbnail(member.user.displayAvatarURL());
      }
    }

    // Post to announce channel or same channel
    const postChannel = config.announce_channel_id
      ? client.channels.cache.get(config.announce_channel_id) || message.channel
      : message.channel;

    // Build next button if configured
    const components = [];
    if (config.next_channel_id) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Next Room')
          .setEmoji('<a:purplesparkle:1479210541691175054>')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${message.guild.id}/${config.next_channel_id}`)
      ));
    }

    // Ping host role
    const pingContent = config.host_role_id ? `<@&${config.host_role_id}> ${winnerMention} won!` : `${winnerMention} won!`;

    await postChannel.send({
      content: pingContent,
      embeds: [winEmbed],
      components,
    });
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'rumbleroyale',

  init(client) {
    client.on('messageCreate', async (message) => {
      try {
        await handleRRMessage(message, client);
      } catch (e) {
        console.error('[RumbleRoyale] messageCreate error:', e.message);
      }
    });
    console.log('[RumbleRoyale] Monitor active.');
  },

  async handleSlash(interaction, commandName) {
    if (commandName === 'rrsetup') return this.setup(interaction);
    if (commandName === 'rrstats') return this.stats(interaction);
    if (commandName === 'rrglobalstats') return this.globalStats(interaction);
  },

  // ── /rrsetup ──────────────────────────────────────────────────────────────
  async setup(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: `${E.ERROR} Admin only.`, ephemeral: true });
    }

    const channel       = interaction.options.getChannel('channel') || interaction.channel;
    const winnerRole    = interaction.options.getRole('winner_role');
    const hostRole      = interaction.options.getRole('host_role');
    const callRole      = interaction.options.getRole('call_role');
    const nextChannel   = interaction.options.getChannel('next_channel');
    const announceChannel = interaction.options.getChannel('announce_channel');
    const reward        = interaction.options.getInteger('reward');
    const battleMsg     = interaction.options.getString('battle_message');
    const winMsg        = interaction.options.getString('win_message');
    const battleTitle   = interaction.options.getString('battle_title');
    const joinEmoji     = interaction.options.getString('join_emoji');
    const color         = interaction.options.getString('embed_color') || '#9B2DF0';

    await db.run(`
      INSERT INTO rr_channel_config
        (channel_id, guild_id, winner_role_id, host_role_id, call_role_id, next_channel_id,
         announce_channel_id, reward_amount, battle_message, win_message, battle_title,
         join_emoji, embed_color, total_games, total_players)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,0)
      ON CONFLICT (channel_id) DO UPDATE SET
        winner_role_id      = EXCLUDED.winner_role_id,
        host_role_id        = EXCLUDED.host_role_id,
        call_role_id        = EXCLUDED.call_role_id,
        next_channel_id     = EXCLUDED.next_channel_id,
        announce_channel_id = EXCLUDED.announce_channel_id,
        reward_amount       = EXCLUDED.reward_amount,
        battle_message      = EXCLUDED.battle_message,
        win_message         = EXCLUDED.win_message,
        battle_title        = EXCLUDED.battle_title,
        join_emoji          = EXCLUDED.join_emoji,
        embed_color         = EXCLUDED.embed_color
    `, [
      channel.id, interaction.guild.id,
      winnerRole?.id || null, hostRole?.id || null, callRole?.id || null,
      nextChannel?.id || null, announceChannel?.id || null,
      reward || null, battleMsg || null, winMsg || null, battleTitle || null,
      joinEmoji || null, color,
    ]);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('<:play_regret_bot:1521042618744700938> Rumble Royale Config Saved!')
      .setDescription(`Monitoring <#${channel.id}> for Rumble Royale battles.`)
      .addFields(
        { name: '<a:trophies:1507765453299122387> Winner Role',   value: winnerRole ? `<@&${winnerRole.id}>` : '—',        inline: true },
        { name: '<:sword:1495666991187361943> Host Role',         value: hostRole ? `<@&${hostRole.id}>` : '—',            inline: true },
        { name: '<a:purplesparkle:1479210541691175054> Call Role', value: callRole ? `<@&${callRole.id}>` : '—',           inline: true },
        { name: '<a:moneybag:1479268556687540345> Sins Reward',   value: reward ? `${reward.toLocaleString()} sins` : '—', inline: true },
        { name: '<a:purplesparkle:1479210541691175054> Next Room', value: nextChannel ? `<#${nextChannel.id}>` : '—',     inline: true },
        { name: '<:member:1495666085121491024> Announce In',      value: announceChannel ? `<#${announceChannel.id}>` : 'Same channel', inline: true },
        { name: '🎭 Battle Message',  value: battleMsg || '—', inline: false },
        { name: '<a:trophies:1507765453299122387> Win Message',   value: winMsg || '—', inline: false },
      )
      .setFooter({ text: 'P&R will now auto-detect RR battles in that channel.' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  // ── /rrstats ──────────────────────────────────────────────────────────────
  async stats(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const user    = interaction.options.getUser('user');

    if (user) {
      // Single user stats
      const row = await db.get(
        'SELECT * FROM rr_stats WHERE guild_id = $1 AND user_id = $2',
        [interaction.guild.id, user.id]
      );
      if (!row) return interaction.editReply(`${E.ERROR} No Rumble Royale stats found for ${user.username}.`);

      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setColor('#9B2DF0')
          .setTitle(`<a:trophies:1507765453299122387> ${user.username}'s Rumble Royale Stats`)
          .addFields(
            { name: 'Wins',   value: `**${row.wins}**`,   inline: true },
            { name: 'Losses', value: `**${row.losses}**`, inline: true },
            { name: 'Games',  value: `**${row.games}**`,  inline: true },
            { name: 'Win Rate', value: `**${row.games > 0 ? Math.round((row.wins / row.games) * 100) : 0}%**`, inline: true },
          )
      ]});
    }

    // Channel/server leaderboard
    const rows = await db.all(
      'SELECT * FROM rr_stats WHERE guild_id = $1 ORDER BY wins DESC LIMIT 10',
      [interaction.guild.id]
    );
    if (!rows.length) return interaction.editReply(`${E.INFO} No Rumble Royale stats yet for this server.`);

    const lines = rows.map((r, i) =>
      `**${i + 1}.** ${r.username} — **${r.wins}W** / ${r.losses}L (${r.games} games)`
    ).join('\n');

    const config = await getConfig(channel.id);
    const embed = new EmbedBuilder()
      .setColor('#9B2DF0')
      .setTitle('<a:trophies:1507765453299122387> Rumble Royale Leaderboard')
      .setDescription(lines)
      .setFooter({ text: `Server total games: ${rows.reduce((s, r) => s + r.games, 0) / 2 | 0}` });

    if (config) {
      embed.addFields(
        { name: 'Total Battles', value: `**${config.total_games}**`, inline: true },
        { name: 'Total Players', value: `**${config.total_players}**`, inline: true },
      );
    }

    return interaction.editReply({ embeds: [embed] });
  },

  // ── /rrglobalstats ────────────────────────────────────────────────────────
  async globalStats(interaction) {
    await interaction.deferReply({ ephemeral: false });

    // RR stats from our tracking
    const rrRows = await db.all(
      'SELECT SUM(wins) as tw, SUM(losses) as tl, SUM(games) as tg, COUNT(DISTINCT user_id) as players FROM rr_stats WHERE guild_id = $1',
      [interaction.guild.id]
    );
    const rr = rrRows[0] || {};

    // Rumble Slaughter stats from user_stats
    const rsRows = await db.all(
      `SELECT SUM(s.loteria_wins) as lw FROM user_stats s
       JOIN users u ON u.user_id = s.user_id LIMIT 1`
    ).catch(() => [{}]);

    // RS win totals
    const rsWinRow = await db.get(
      `SELECT COUNT(*) as total FROM rs_matches WHERE channel_id IS NOT NULL`
    ).catch(() => null);

    const embed = new EmbedBuilder()
      .setColor('#9B2DF0')
      .setTitle('<a:trophies:1507765453299122387> Global Stats — Rumble Overview')
      .addFields(
        { name: '<a:rumble_royale_swords:1412631186664067072> Rumble Royale (P&R Tracked)', value:
          `**${Number(rr.tw || 0)} wins** tracked\n**${Number(rr.players || 0)} unique players**\n**${Number(rr.tg || 0)} total game entries**`,
          inline: true },
        { name: '<:sword:1495666991187361943> Rumble Slaughter', value:
          `**${rsWinRow?.total || 0} matches** played`,
          inline: true },
      )
      .setFooter({ text: 'P&R tracks RR stats from configured channels only.' });

    return interaction.editReply({ embeds: [embed] });
  },
};
