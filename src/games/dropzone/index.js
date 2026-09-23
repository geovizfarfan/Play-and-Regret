// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — main module. Command handlers, autocomplete, and
// the two things index.js needs to wire in: the activity listener and the
// catch/trade button router.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { db, economy } = require('../../utils/database');
const { CONFIG, RARITY_ORDER, RARITY_META } = require('./config');
const { MONSTERS, getMonster, isEnabled, loadOverrides } = require('./monsters');
const { recordActivity, markSpawned } = require('./activity');
const { rollMonster } = require('./rarity');
const { postSpawn, reconcileOnStartup } = require('./spawn');
const { handleCatchButton } = require('./catch');
const { proposeTrade, resolveTradeButton } = require('./trade');
const { buildCollectionSummary, getMissing, getLeaderboard, exchangeDuplicates } = require('./collection');
const A = require('./admin');

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}

function rarityBar(owned, total) {
  return `${owned}/${total}`;
}

// ── /stickers book ───────────────────────────────────────────────────────
async function cmdBook(interaction, targetUser) {
  const cfg = await A.getConfig(interaction.guild.id);
  const season = cfg.current_season;
  const summary = await buildCollectionSummary(targetUser.id, season);

  const lines = RARITY_ORDER.map(r => `${RARITY_META[r].emoji} ${RARITY_META[r].label}: ${rarityBar(summary.byRarity[r].owned, summary.byRarity[r].total)}`);

  const embed = new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle(`👻 ${targetUser.username}'s Sticker Book — Season ${season}`)
    .addFields(
      { name: 'Unique', value: `${summary.uniqueOwned} / ${summary.totalMonsters}`, inline: true },
      { name: 'Completion', value: `${summary.completionPct.toFixed(1)}%`, inline: true },
      { name: 'Total Catches', value: `${summary.totalCatches}`, inline: true },
      { name: 'Duplicates', value: `${summary.duplicates}`, inline: true },
      { name: 'By Rarity', value: lines.join('\n') },
    );

  return interaction.reply({ embeds: [embed] });
}

// ── /stickers missing ────────────────────────────────────────────────────
async function cmdMissing(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const missing = await getMissing(interaction.user.id, cfg.current_season);

  if (!missing.length) {
    return interaction.reply({ content: `<:checkmark:1495666088417956002> You have every sticker available this season. Impressive.`, ephemeral: true });
  }

  const grouped = RARITY_ORDER.map(r => {
    const items = missing.filter(m => m.rarity === r);
    if (!items.length) return null;
    return `${RARITY_META[r].emoji} **${RARITY_META[r].label}**\n${items.map(m => `#${String(m.number).padStart(3, '0')} ${m.name}`).join('\n')}`;
  }).filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle(`❓ Missing — ${missing.length} sticker${missing.length !== 1 ? 's' : ''}`)
    .setDescription(grouped.join('\n\n').slice(0, 4000));

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /stickers view ───────────────────────────────────────────────────────
async function cmdView(interaction, monsterId) {
  const monster = getMonster(monsterId);
  if (!monster) return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown sticker.', ephemeral: true });
  if (!isEnabled(monster)) return interaction.reply({ content: '<:wrong:1495666083594502174> That one hasn\'t been released yet.', ephemeral: true });

  const owned = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [interaction.user.id, monster.id, monster.season]);
  const meta = RARITY_META[monster.rarity];

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`#${String(monster.number).padStart(3, '0')} — ${monster.name.toUpperCase()}`)
    .setDescription(`${meta.emoji} ${meta.label}\n\nOwned: **×${owned?.quantity || 0}**\n\n*"${monster.flavorText}"*`);

  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, monster.image);
  if (fs.existsSync(filePath)) {
    const { AttachmentBuilder } = require('discord.js');
    const attachment = new AttachmentBuilder(filePath, { name: `${String(monster.number).padStart(3, '0')}.png` });
    embed.setImage(`attachment://${String(monster.number).padStart(3, '0')}.png`);
    return interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });
  }
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /stickers trade ──────────────────────────────────────────────────────
async function cmdTrade(interaction, targetUser, offerId, requestId) {
  const cfg = await A.getConfig(interaction.guild.id);
  const result = await proposeTrade(interaction.guild, interaction.channel, interaction.user, targetUser, offerId, requestId, cfg.current_season);

  if (result.error === 'self') return interaction.reply({ content: '<:wrong:1495666083594502174> Can\'t trade with yourself.', ephemeral: true });
  if (result.error === 'unknown_sticker') return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown sticker.', ephemeral: true });
  if (result.error === 'dont_own_offer') return interaction.reply({ content: '<:wrong:1495666083594502174> You don\'t own the sticker you\'re offering.', ephemeral: true });
  if (result.error === 'they_dont_own_request') return interaction.reply({ content: `<:wrong:1495666083594502174> ${targetUser.username} doesn't own that sticker.`, ephemeral: true });

  return interaction.reply({ content: `<:checkmark:1495666088417956002> Trade proposed in ${result.postedIn}.`, ephemeral: true });
}

// ── /stickers exchange ───────────────────────────────────────────────────
async function cmdExchange(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const result = await exchangeDuplicates(interaction.user.id, cfg.current_season);

  if (!result.itemsExchanged) {
    return interaction.reply({ content: `<a:Warning:1497476844860215366> No duplicates to exchange right now.`, ephemeral: true });
  }

  await economy.addFunds(interaction.user.id, result.sinsEarned, 'Drop It Like It\'s Hot — duplicate exchange');
  const breakdown = RARITY_ORDER.filter(r => result.breakdown[r]).map(r => `${RARITY_META[r].emoji} ${result.breakdown[r]}× ${RARITY_META[r].label}`).join('\n');

  return interaction.reply({
    content: `<:checkmark:1495666088417956002> Exchanged **${result.itemsExchanged}** duplicates for **${result.sinsEarned.toLocaleString()} sins**.\n\n${breakdown}`,
    ephemeral: true,
  });
}

// ── /stickers leaderboard ────────────────────────────────────────────────
async function cmdLeaderboard(interaction, mode) {
  const cfg = await A.getConfig(interaction.guild.id);
  const rows = await getLeaderboard(cfg.current_season, mode || 'unique');

  if (!rows.length) return interaction.reply({ content: 'Nobody\'s caught anything yet this season.', ephemeral: true });

  const label = { unique: 'Unique Stickers', catches: 'Total Catches', rare: 'Legendary+ Catches' }[mode || 'unique'];
  const lines = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${r.score}`);

  return interaction.reply({ embeds: [new EmbedBuilder().setColor('#8B0000').setTitle(`🏆 ${label} — Season ${cfg.current_season}`).setDescription(lines.join('\n'))] });
}

// ── Autocomplete ──────────────────────────────────────────────────────────
async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const matches = MONSTERS.filter(m => isEnabled(m) && m.name.toLowerCase().includes(focused)).slice(0, 25);
  return interaction.respond(matches.map(m => ({ name: `#${String(m.number).padStart(3, '0')} ${m.name}`, value: m.id })));
}
async function handleAdminAutocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const matches = MONSTERS.filter(m => m.name.toLowerCase().includes(focused)).slice(0, 25); // admin sees disabled ones too
  return interaction.respond(matches.map(m => ({ name: `#${String(m.number).padStart(3, '0')} ${m.name}${isEnabled(m) ? '' : ' (disabled)'}`, value: m.id })));
}

// ── Activity listener (called from index.js's messageCreate) ────────────
async function handleActivityMessage(message) {
  if (!CONFIG.enabled || message.author.bot || !message.guild) return;
  const cfg = await A.getConfig(message.guild.id);
  if (!cfg.enabled) return;
  if (!(await A.isSpawnChannelAllowed(message.guild.id, message.channel.id))) return;

  const shouldSpawn = recordActivity(message.channel.id, message.author.id, message.content || '');
  if (!shouldSpawn) return;

  markSpawned(message.channel.id);
  const monster = rollMonster(cfg.current_season);
  if (!monster) return; // nothing enabled anywhere — nothing to spawn
  await postSpawn(message.channel, message.guild.id, monster, 'NATURAL', cfg.ping_role_id).catch(err => console.error('[Drop It Like It\'s Hot] spawn error', err));
}

// ── Button router (called from index.js's interactionCreate) ────────────
async function handleButton(interaction) {
  if (interaction.customId.startsWith('dz_catch:')) return handleCatchButton(interaction);
  if (interaction.customId.startsWith('dz_trade_accept:') || interaction.customId.startsWith('dz_trade_decline:')) return resolveTradeButton(interaction);
}

// ── Slash command dispatch ────────────────────────────────────────────────
async function handleSlash(interaction, commandName) {
  if (commandName === 'stickers') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'book') return cmdBook(interaction, interaction.options.getUser('user') || interaction.user);
    if (sub === 'missing') return cmdMissing(interaction);
    if (sub === 'view') return cmdView(interaction, interaction.options.getString('sticker'));
    if (sub === 'trade') return cmdTrade(interaction, interaction.options.getUser('user'), interaction.options.getString('offer'), interaction.options.getString('request'));
    if (sub === 'exchange') return cmdExchange(interaction);
    if (sub === 'leaderboard') return cmdLeaderboard(interaction, interaction.options.getString('mode'));
  }

  if (commandName === 'stickers-admin') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '<:wrong:1495666083594502174> Admin only.', ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'gift') {
      const target = interaction.options.getUser('user');
      const monsterId = interaction.options.getString('sticker');
      const qty = interaction.options.getInteger('quantity') || 1;
      const result = await A.giftSticker(target.id, monsterId, qty);
      if (result.error) return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown sticker.', ephemeral: true });
      return interaction.reply(`<:checkmark:1495666088417956002> Gave <@${target.id}> **${qty}×** ${result.monster.name} (now owns ${result.newQuantity}).`);
    }
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      const monsterId = interaction.options.getString('sticker');
      const qty = interaction.options.getInteger('quantity') || 1;
      const result = await A.removeSticker(target.id, monsterId, qty);
      if (result.error === 'unknown_sticker') return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown sticker.', ephemeral: true });
      if (result.error === 'dont_own') return interaction.reply({ content: `<:wrong:1495666083594502174> ${target.username} doesn't own that sticker.`, ephemeral: true });
      return interaction.reply(`<:checkmark:1495666088417956002> Removed **${qty}×** ${result.monster.name} from <@${target.id}> (now owns ${result.newQuantity}).`);
    }
    if (sub === 'spawn') {
      const monsterId = interaction.options.getString('sticker');
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const cfg = await A.getConfig(interaction.guild.id);
      const result = await A.manualSpawn(channel, interaction.guild.id, cfg.current_season, monsterId);
      if (result.error) return interaction.reply({ content: '<:wrong:1495666083594502174> Nothing available to spawn.', ephemeral: true });
      return interaction.reply({ content: `<:checkmark:1495666088417956002> Spawned **${result.monster.name}** in ${channel}.`, ephemeral: true });
    }
    if (sub === 'enable' || sub === 'disable') {
      const monsterId = interaction.options.getString('sticker');
      const result = await A.setMonsterEnabled(monsterId, sub === 'enable');
      if (result.error) return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown sticker.', ephemeral: true });
      return interaction.reply(`<:checkmark:1495666088417956002> **${result.monster.name}** is now ${sub === 'enable' ? 'enabled' : 'disabled'}.`);
    }
    if (sub === 'spawnchannel') {
      const channel = interaction.options.getChannel('channel');
      const allow = interaction.options.getString('state') === 'on';
      await A.setSpawnChannel(interaction.guild.id, channel.id, allow);
      return interaction.reply(`<:checkmark:1495666088417956002> ${channel} ${allow ? 'added to' : 'removed from'} the spawn channel list.`);
    }
    if (sub === 'exchangechannel') {
      const channel = interaction.options.getChannel('channel');
      await A.setExchangeChannel(interaction.guild.id, channel.id);
      return interaction.reply(`<:checkmark:1495666088417956002> Trades will now post in ${channel}.`);
    }
    if (sub === 'pingrole') {
      const role = interaction.options.getRole('role');
      await A.setPingRole(interaction.guild.id, role ? role.id : null);
      return interaction.reply(role
        ? `<:checkmark:1495666088417956002> ${role} will be pinged on every drop.`
        : `<:checkmark:1495666088417956002> Ping role cleared — drops will no longer ping anyone.`);
    }
    if (sub === 'toggle') {
      const state = interaction.options.getString('state') === 'on';
      await A.setGuildEnabled(interaction.guild.id, state);
      return interaction.reply(`<:checkmark:1495666088417956002> Drop It Like It's Hot is now **${state ? 'ON' : 'OFF'}**.`);
    }
    if (sub === 'stats') {
      const cfg = await A.getConfig(interaction.guild.id);
      const stats = await A.getStats(interaction.guild.id, cfg.current_season);
      const embed = new EmbedBuilder().setColor('#8B0000').setTitle(`📊 Drop It Like It's Hot — Season ${cfg.current_season} Stats`)
        .addFields(
          { name: 'Total Caught', value: `${stats.totalCaught}`, inline: true },
          { name: 'Natural Spawns', value: `${stats.naturalSpawns}`, inline: true },
          { name: 'Admin Spawns', value: `${stats.adminSpawns}`, inline: true },
          { name: 'Escaped', value: `${stats.escaped}`, inline: true },
          { name: 'Active Collectors', value: `${stats.activeCollectors}`, inline: true },
          { name: 'Most Caught', value: stats.mostCaught ? `${stats.mostCaught.monster?.name} (${stats.mostCaught.count})` : 'N/A', inline: true },
        );
      return interaction.reply({ embeds: [embed] });
    }
  }
}

module.exports = {
  name: 'dropzone',
  handleSlash, handleButton, handleActivityMessage,
  handleAutocomplete, handleAdminAutocomplete,
  reconcileOnStartup, loadOverrides,
};
