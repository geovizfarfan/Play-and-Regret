/**
 * src/events/rumbleroyale.js
 * Rumble Royale Integration for Play & Regret
 */

const {
  EmbedBuilder, PermissionFlagsBits,
} = require('discord.js');
const { db, economy } = require('../utils/database');
const E = require('../utils/emojis');

const RUMBLE_ROYALE_BOT_ID = '693167035068317736';

async function getConfig(channelId) {
  return db.get('SELECT * FROM rr_channel_config WHERE channel_id = $1', [channelId]);
}

async function getServerWins(guildId, userId) {
  const row = await db.get('SELECT wins FROM rr_stats WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
  return row ? Number(row.wins) : 0;
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

function parseWinnerEmbed(message) {
  const embed = message.embeds[0];
  if (!embed) return null;
  const title = embed.title || '';
  const desc  = embed.description || '';
  if (!title.includes('WINNER')) return null;

  const mentionMatch = message.content?.match(/<@!?(\d+)>/);
  const userId = mentionMatch ? mentionMatch[1] : null;

  const usernameMatch = desc.match(/^([^\n]+?)(?:\s+the\s+\w+)?(?:\n|$)/);
  const username = usernameMatch ? usernameMatch[1].trim() : null;

  const playersMatch = desc.match(/Total Players:\s*(\d+)/i);
  const totalPlayers = playersMatch ? parseInt(playersMatch[1]) : null;

  return { userId, username, totalPlayers };
}

function parseBattleStartEmbed(message) {
  const embed = message.embeds[0];
  if (!embed) return null;
  const title = embed.title || '';
  if (!title.toLowerCase().includes('rumble royale hosted by')) return null;

  const hostMatch = title.match(/hosted by (.+)$/i);
  const host = hostMatch ? hostMatch[1].trim() : null;

  const eraMatch = (embed.description || '').match(/(?:Random\s+)?Era:\s*[^\s]*\s*(.+)/i);
  const era = eraMatch ? eraMatch[1].trim() : null;

  return { host, era };
}

async function handleRRMessage(message, client) {
  if (message.author.id !== RUMBLE_ROYALE_BOT_ID) return;
  if (!message.embeds?.length) return;

  const config = await getConfig(message.channel.id);
  if (!config) return;

  const embed = message.embeds[0];
  const title = embed.title || '';

  // ── Battle Start ──────────────────────────────────────────────────────────
  if (title.toLowerCase().includes('rumble royale hosted by')) {
    const parsed = parseBattleStartEmbed(message);
    if (!parsed) return;

    const descLines = [
      'Time to rumble! Good luck everyone <a:purplesparkle:1479210541691175054> — may the baddest win.',
      '',
      `<a:moneybag:1479268556687540345> **Reward:** ${config.reward_amount ? Number(config.reward_amount).toLocaleString() : '?'} sins <:sins:1522321533307981945>`,
    ];
    if (config.winner_role_id) descLines.push(`<a:trophies:1507765453299122387> **Winner Role:** <@&${config.winner_role_id}>`);
    if (config.next_channel_id) descLines.push(`<a:rumblesword:1522338907465842789> **Next Room:** <#${config.next_channel_id}>`);

    const battleEmbed = new EmbedBuilder()
      .setColor(config.embed_color || '#cab2fb')
      .setTitle('<:rumble:1522304913697280160> Rumble Royale — \uD835\uDE31\uD835\uDE22\uD835\uDE31\uD835\uDE31\uD835\uDE2D\uD835\uDE26 \uD835\uDE31\uD835\uDE24\uD835\uDE2C\uD835\uDE26!')
      .setDescription(descLines.join('\n'))
      .setFooter({ text: `${message.guild.name} • Hosted by: ${parsed.host}${parsed.era ? ` • Era: ${parsed.era}` : ''}` });

    if (config.battle_image) battleEmbed.setImage(config.battle_image);

    const pings = [config.ping_role1_id, config.ping_role2_id, config.ping_role3_id]
      .filter(Boolean).map(id => `<@&${id}>`).join(' ');

    await message.channel.send({ content: pings || '', embeds: [battleEmbed] });
    return;
  }

  // ── Battle End / Winner ───────────────────────────────────────────────────
  if (title.includes('WINNER')) {
    const parsed = parseWinnerEmbed(message);
    if (!parsed) return;

    const { userId, username, totalPlayers } = parsed;

    if (userId && config.reward_amount) {
      await economy.getUser(userId, username || 'Unknown').catch(() => {});
      await economy.addFunds(userId, Number(config.reward_amount), 'Rumble Royale win').catch(() => {});
    }

    if (userId && config.winner_role_id) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member) await member.roles.add(config.winner_role_id).catch(() => {});
    }

    let serverWins = 0;
    if (userId) {
      await trackWin(message.guild.id, message.channel.id, userId, username || 'Unknown');
      serverWins = await getServerWins(message.guild.id, userId);
    }

    if (totalPlayers) {
      await db.run(
        'UPDATE rr_channel_config SET total_games = total_games + 1, total_players = total_players + $1 WHERE channel_id = $2',
        [totalPlayers, message.channel.id]
      ).catch(() => {});
    }

    const winnerMention = userId ? `<@${userId}>` : `**${username}**`;

    const descLines = [
      `${winnerMention} has won Rumble Royale! <a:confetti:1495667283870089307>`,
      `<a:rumblesword:1522338907465842789> **Server Rumble Wins:** ${serverWins}`,
      `<:member:1495666085121491024> **Total Players:** ${totalPlayers || '?'}`,
      '',
      `<a:moneybag:1479268556687540345> **${config.reward_amount ? Number(config.reward_amount).toLocaleString() : '?'} sins** <:sins:1522321533307981945> added to their balance!`,
    ];
    if (config.winner_role_id) descLines.push(`<a:sparkle:1511506717584920696> **Role:** <@&${config.winner_role_id}>`);

    const winEmbed = new EmbedBuilder()
      .setColor('#5b209a')
      .setTitle('<a:trophies:1507765453299122387> WINNER!')
      .setDescription(descLines.join('\n'));

    if (config.next_channel_id) {
      winEmbed.setFooter({ text: `-# NEXT: #${config.next_channel_id}` });
    }

    if (userId) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member?.user) winEmbed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
    }

    await message.channel.send({ embeds: [winEmbed] });
    await message.channel.send(`${winnerMention} Battle Finished! You can start a new \`/battle\` now!`);
  }
}

module.exports = {
  name: 'rumbleroyale',

  init(client) {
    client.on('messageCreate', async (message) => {
      try { await handleRRMessage(message, client); }
      catch (e) { console.error('[RumbleRoyale]', e.message); }
    });
    console.log('[RumbleRoyale] Monitor active.');
  },

  async handleSlash(interaction, commandName) {
    if (commandName === 'rrsetup')       return this.setup(interaction);
    if (commandName === 'rrstats')       return this.stats(interaction);
    if (commandName === 'rrglobalstats') return this.globalStats(interaction);
  },

  async setup(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: `${E.ERROR} Admin only.`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const channel    = interaction.options.getChannel('channel');
    const winnerRole = interaction.options.getRole('winner_role');
    const pingRole1  = interaction.options.getRole('ping_role1');
    const pingRole2  = interaction.options.getRole('ping_role2');
    const pingRole3  = interaction.options.getRole('ping_role3');
    const nextChannel = interaction.options.getChannel('next_channel');
    const reward     = interaction.options.getInteger('reward');
    const image      = interaction.options.getString('image');
    const color      = interaction.options.getString('embed_color') || '#cab2fb';

    await db.run(`
      INSERT INTO rr_channel_config
        (channel_id, guild_id, winner_role_id, ping_role1_id, ping_role2_id, ping_role3_id,
         next_channel_id, reward_amount, battle_image, embed_color, total_games, total_players)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0)
      ON CONFLICT (channel_id) DO UPDATE SET
        winner_role_id  = EXCLUDED.winner_role_id,
        ping_role1_id   = EXCLUDED.ping_role1_id,
        ping_role2_id   = EXCLUDED.ping_role2_id,
        ping_role3_id   = EXCLUDED.ping_role3_id,
        next_channel_id = EXCLUDED.next_channel_id,
        reward_amount   = EXCLUDED.reward_amount,
        battle_image    = EXCLUDED.battle_image,
        embed_color     = EXCLUDED.embed_color
    `, [
      channel.id, interaction.guild.id,
      winnerRole?.id || null,
      pingRole1?.id || null, pingRole2?.id || null, pingRole3?.id || null,
      nextChannel?.id || null, reward || null, image || null, color,
    ]);

    const pingList = [pingRole1, pingRole2, pingRole3].filter(Boolean)
      .map(r => `<@&${r.id}>`).join(', ') || '—';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('<:play_regret_bot:1521042618744700938> Rumble Royale Channel Configured!')
      .setDescription(`Monitoring <#${channel.id}> for Rumble Royale battles.\n\nRun \`/rrsetup\` again anytime to update settings.`)
      .addFields(
        { name: '<a:trophies:1507765453299122387> Winner Role',     value: winnerRole ? `<@&${winnerRole.id}>` : '—',                inline: true },
        { name: '<a:purplesparkle:1479210541691175054> Ping Roles', value: pingList,                                                 inline: true },
        { name: '<a:moneybag:1479268556687540345> Reward',          value: `${Number(reward).toLocaleString()} sins`,                inline: true },
        { name: '<a:rumblesword:1522338907465842789> Next Room',    value: nextChannel ? `<#${nextChannel.id}>` : '—',              inline: true },
        { name: '<a:Fire:1495641973128691803> Image',               value: image ? '✓ Set' : '—',                                   inline: true },
        { name: '🎨 Embed Color',                                   value: color,                                                    inline: true },
      );

    return interaction.editReply({ embeds: [embed] });
  },

  async stats(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user');

    if (user) {
      const row = await db.get(
        'SELECT * FROM rr_stats WHERE guild_id = $1 AND user_id = $2',
        [interaction.guild.id, user.id]
      );
      if (!row) return interaction.editReply(`${E.ERROR} No Rumble Royale stats for ${user.username}.`);
      return interaction.editReply({ embeds: [
        new EmbedBuilder().setColor('#9B2DF0')
          .setTitle(`<a:trophies:1507765453299122387> ${user.username}'s RR Stats`)
          .addFields(
            { name: 'Wins',     value: `**${row.wins}**`,   inline: true },
            { name: 'Losses',   value: `**${row.losses}**`, inline: true },
            { name: 'Games',    value: `**${row.games}**`,  inline: true },
            { name: 'Win Rate', value: `**${row.games > 0 ? Math.round((row.wins / row.games) * 100) : 0}%**`, inline: true },
          )
      ]});
    }

    const rows = await db.all(
      'SELECT * FROM rr_stats WHERE guild_id = $1 ORDER BY wins DESC LIMIT 10',
      [interaction.guild.id]
    );
    if (!rows.length) return interaction.editReply(`${E.INFO} No Rumble Royale stats yet.`);

    const lines = rows.map((r, i) =>
      `**${i + 1}.** ${r.username} — **${r.wins}W** / ${r.losses}L (${r.games} games)`
    ).join('\n');

    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor('#9B2DF0')
        .setTitle('<a:trophies:1507765453299122387> Rumble Royale Leaderboard')
        .setDescription(lines)
    ]});
  },

  async globalStats(interaction) {
    await interaction.deferReply();

    const rrRow = await db.get(
      'SELECT SUM(wins) as tw, COUNT(DISTINCT user_id) as players, SUM(games) as tg FROM rr_stats'
    ).catch(() => null);

    const rsRow = await db.get('SELECT COUNT(*) as total FROM rs_matches').catch(() => null);

    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor('#9B2DF0')
        .setTitle('<a:trophies:1507765453299122387> Global Rumble Stats')
        .addFields(
          { name: '<a:rumble_royale_swords:1412631186664067072> Rumble Royale',
            value: `**${Number(rrRow?.tw || 0)} wins** tracked\n**${Number(rrRow?.players || 0)} unique players**\n**${Number(rrRow?.tg || 0)} total entries**`,
            inline: true },
          { name: '<:sword:1495666991187361943> Rumble Slaughter',
            value: `**${rsRow?.total || 0} matches** played`,
            inline: true },
        )
    ]});
  },
};
