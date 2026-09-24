// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — main module. Command handlers, autocomplete, and
// the two things index.js needs to wire in: the activity listener and the
// catch/trade button router.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { db, economy } = require('../../utils/database');
const { CONFIG, RARITY_ORDER, RARITY_META, getSeasonName } = require('./config');
const { renderBookImage } = require('./bookImage');
const { MONSTERS, getMonster, isEnabled, loadOverrides } = require('./monsters');
const { recordActivity, markSpawned } = require('./activity');
const { rollMonster } = require('./rarity');
const { postSpawn, reconcileOnStartup } = require('./spawn');
const { handleCatchButton } = require('./catch');
const { proposeTrade, resolveTradeButton } = require('./trade');
const { buildCollectionSummary, getMissing, getLeaderboard, exchangeDuplicates, exchangeSpecificSticker, getUserCollection, getDuplicates, getSpareCount } = require('./collection');
const A = require('./admin');
const T = require('./timer');

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}

const LAVENDER = '#C9B1FF';

function rarityBar(owned, total) {
  return `${owned}/${total}`;
}

function buildMonsterAttachment(monster) {
  const filePath = path.join(__dirname, monster.image);
  if (!fs.existsSync(filePath)) return null;
  return new AttachmentBuilder(filePath, { name: `${String(monster.number).padStart(3, '0')}.png` });
}

function buildGiftEmbed(monster, recipient, giver, extraFields) {
  const meta = RARITY_META[monster.rarity];
  const embed = new EmbedBuilder()
    .setColor(LAVENDER)
    .setTitle('🎁 Sticker Given')
    .setDescription(
      `Successfully added **${monster.name}** \`#${String(monster.number).padStart(3, '0')}\` to <@${recipient.id}>'s collection.\n\n` +
      `${meta.emoji} ${meta.label}`
    )
    .addFields(
      { name: 'Recipient', value: `<@${recipient.id}>`, inline: true },
      { name: 'Given By', value: giver ? `<@${giver.id}>` : 'Staff', inline: true },
      ...(extraFields || []),
    );
  const attachment = buildMonsterAttachment(monster);
  if (attachment) embed.setThumbnail(`attachment://${String(monster.number).padStart(3, '0')}.png`);
  return { embed, attachment };
}

// ── /stickers book ───────────────────────────────────────────────────────
async function buildBookSummaryPayload(runnerId, targetUser, season, seasonName) {
  const summary = await buildCollectionSummary(targetUser.id, season);
  const lines = RARITY_ORDER.map(r => `${RARITY_META[r].emoji} ${RARITY_META[r].label}: ${rarityBar(summary.byRarity[r].owned, summary.byRarity[r].total)}`);

  const embed = new EmbedBuilder()
    .setColor(LAVENDER)
    .setTitle(`<a:catch:1552115280342421555> ${targetUser.username}'s Sticker Book — ${seasonName}`)
    .addFields(
      { name: 'Unique', value: `${summary.uniqueOwned} / ${summary.totalMonsters}`, inline: true },
      { name: 'Completion', value: `${summary.completionPct.toFixed(1)}%`, inline: true },
      { name: 'Total Catches', value: `${summary.totalCatches}`, inline: true },
      { name: 'Duplicates', value: `${summary.duplicates}`, inline: true },
      { name: 'By Rarity', value: lines.join('\n') },
    );

  const ownedIds = new Set(summary.collection.keys());
  const imgBuffer = await renderBookImage(MONSTERS, ownedIds, `${targetUser.username}'s Sticker Book`);
  const attachment = imgBuffer ? new AttachmentBuilder(imgBuffer, { name: 'book.png' }) : null;
  if (attachment) embed.setImage('attachment://book.png');

  if (!summary.uniqueOwned) {
    return { embeds: [embed], components: [], files: attachment ? [attachment] : [] };
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dz_book_page:${runnerId}:${targetUser.id}:${season}:0`).setLabel('Inspect a Sticker').setEmoji('📖').setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row], files: attachment ? [attachment] : [] };
}

async function cmdBook(interaction, targetUser) {
  await interaction.deferReply();
  const cfg = await A.getConfig(interaction.guild.id);
  const season = cfg.current_season;
  const seasonName = getSeasonName(season);
  const payload = await buildBookSummaryPayload(interaction.user.id, targetUser, season, seasonName);
  return interaction.editReply(payload);
}

async function buildBookPage(runnerId, targetUserId, season, index) {
  const collection = await getUserCollection(targetUserId, season);
  const owned = [...collection.entries()]
    .map(([monsterId, row]) => ({ monster: getMonster(monsterId), qty: row.quantity }))
    .filter(o => o.monster)
    .sort((a, b) => a.monster.number - b.monster.number);

  if (!owned.length) return null;
  const safeIndex = ((index % owned.length) + owned.length) % owned.length;
  const { monster, qty } = owned[safeIndex];
  const meta = RARITY_META[monster.rarity];

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`#${String(monster.number).padStart(3, '0')} — ${monster.name.toUpperCase()}`)
    .setDescription(`${meta.emoji} ${meta.label}\n\nOwned: **×${qty}**\n\n*"${monster.flavorText}"*`)
    .setFooter({ text: `Sticker ${safeIndex + 1} of ${owned.length}` });

  const attachment = buildMonsterAttachment(monster);
  if (attachment) embed.setImage(`attachment://${String(monster.number).padStart(3, '0')}.png`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dz_book_back:${runnerId}:${targetUserId}:${season}`).setLabel('◀ Back').setEmoji('📕').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`dz_book_page:${runnerId}:${targetUserId}:${season}:${safeIndex - 1}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dz_book_page:${runnerId}:${targetUserId}:${season}:${safeIndex + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], files: attachment ? [attachment] : [] };
}

async function handleBookPageButton(interaction) {
  const [, runnerId, targetUserId, seasonStr, indexStr] = interaction.customId.split(':');
  if (interaction.user.id !== runnerId) {
    return interaction.reply({ content: '<:wrong:1495666083594502174> Only the person who ran this command can use these buttons.', ephemeral: true });
  }
  const page = await buildBookPage(runnerId, targetUserId, parseInt(seasonStr), parseInt(indexStr));
  if (!page) return interaction.reply({ content: '<:wrong:1495666083594502174> Nothing to show.', ephemeral: true });
  return interaction.update(page);
}

async function handleBookBackButton(interaction) {
  const [, runnerId, targetUserId, seasonStr] = interaction.customId.split(':');
  if (interaction.user.id !== runnerId) {
    return interaction.reply({ content: '<:wrong:1495666083594502174> Only the person who ran this command can use these buttons.', ephemeral: true });
  }
  await interaction.deferUpdate();
  const season = parseInt(seasonStr);
  const seasonName = getSeasonName(season);
  const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (!targetUser) return;
  const payload = await buildBookSummaryPayload(runnerId, targetUser, season, seasonName);
  return interaction.editReply(payload);
}

// ── /stickers missing ────────────────────────────────────────────────────
async function cmdMissing(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const seasonName = getSeasonName(cfg.current_season);
  const missing = await getMissing(interaction.user.id, cfg.current_season);

  if (!missing.length) {
    return interaction.reply(`<:checkmark:1495666088417956002> You have every sticker available in **${seasonName}**. Impressive.`);
  }

  const sorted = [...missing].sort((a, b) => a.number - b.number);
  const list = sorted.map(m => `${RARITY_META[m.rarity].emoji} #${String(m.number).padStart(3, '0')} ${m.name}`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(LAVENDER)
    .setTitle(`<a:guess:1542348901217075200> Missing — ${seasonName} (${missing.length} sticker${missing.length !== 1 ? 's' : ''})`)
    .setDescription(list.slice(0, 4000));

  return interaction.reply({ embeds: [embed] });
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

  const attachment = buildMonsterAttachment(monster);
  if (attachment) {
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
  if (result.error === 'not_a_duplicate') return interaction.reply({ content: '<:wrong:1495666083594502174> That\'s your only copy — you can only trade away spares, not your only one.', ephemeral: true });
  if (result.error === 'they_dont_own_request') return interaction.reply({ content: `<:wrong:1495666083594502174> ${targetUser.username} doesn't own that sticker.`, ephemeral: true });

  return interaction.reply({ content: `<:checkmark:1495666088417956002> Trade proposed in ${result.postedIn}.`, ephemeral: true });
}

// ── /stickers exchange ───────────────────────────────────────────────────
async function cmdExchange(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const monsterId = interaction.options.getString('sticker');
  const amount = interaction.options.getInteger('amount');

  if (monsterId) {
    const result = await exchangeSpecificSticker(interaction.user.id, monsterId, cfg.current_season, amount);
    if (result.error === 'unknown_sticker') return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown sticker.', ephemeral: true });
    if (result.error === 'no_duplicates') return interaction.reply({ content: `<a:Warning:1497476844860215366> You don't have any spare copies of that one.`, ephemeral: true });

    await economy.addFunds(interaction.user.id, result.sinsEarned, `Drop It Like It's Hot — exchanged ${result.monster.name}`);
    return interaction.reply({
      content: `<:checkmark:1495666088417956002> Exchanged **${result.itemsExchanged}×** ${result.monster.name} for **${result.sinsEarned.toLocaleString()} sins**. (${result.remainingSpares} spare${result.remainingSpares !== 1 ? 's' : ''} left)`,
      ephemeral: true,
    });
  }

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

// ── /stickers duplicates ─────────────────────────────────────────────────
async function cmdDuplicates(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const dupes = await getDuplicates(interaction.user.id, cfg.current_season);
  if (!dupes.length) return interaction.reply({ content: `<a:Warning:1497476844860215366> You don't have any duplicates right now.`, ephemeral: true });

  const lines = dupes.map(d => `${RARITY_META[d.monster.rarity].emoji} #${String(d.monster.number).padStart(3, '0')} ${d.monster.name} — **${d.spareCount}** spare${d.spareCount !== 1 ? 's' : ''}`);
  const embed = new EmbedBuilder().setColor(LAVENDER).setTitle('👀 Your Duplicates').setDescription(lines.join('\n').slice(0, 4000));
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /stickers gift — member-to-member, own duplicates only ──────────────
async function cmdMemberGift(interaction, targetUser, monsterId) {
  const guildId = interaction.guild.id;
  const permitted = await A.hasGiftPermission(guildId, interaction.user.id);
  if (!isAdmin(interaction.member) && !permitted) {
    return interaction.reply({ content: `<:wrong:1495666083594502174> You don't have permission to gift stickers. Ask an admin to grant it with /stickers-admin giftpermission.`, ephemeral: true });
  }
  if (targetUser.id === interaction.user.id) return interaction.reply({ content: `<:wrong:1495666083594502174> Can't gift yourself.`, ephemeral: true });

  const cfg = await A.getConfig(guildId);
  const monster = getMonster(monsterId);
  if (!monster) return interaction.reply({ content: `<:wrong:1495666083594502174> Unknown sticker.`, ephemeral: true });

  const spareCount = await getSpareCount(interaction.user.id, monsterId, cfg.current_season);
  if (spareCount <= 0) return interaction.reply({ content: `<:wrong:1495666083594502174> You don't have a spare copy of that one to give away.`, ephemeral: true });

  await db.run('UPDATE dropzone_collections SET quantity = quantity - 1 WHERE user_id = ? AND monster_id = ? AND season = ?', [interaction.user.id, monsterId, cfg.current_season]);
  await db.run(
    `INSERT INTO dropzone_collections (user_id, monster_id, season, quantity, first_caught_at)
     VALUES (?, ?, ?, 1, NOW())
     ON CONFLICT (user_id, monster_id, season) DO UPDATE SET quantity = dropzone_collections.quantity + 1`,
    [targetUser.id, monsterId, cfg.current_season]
  );

  const { embed, attachment } = buildGiftEmbed(monster, targetUser, interaction.user);
  return interaction.reply({ embeds: [embed], files: attachment ? [attachment] : [] });
}

// ── /stickers leaderboard ────────────────────────────────────────────────
async function cmdLeaderboard(interaction, mode) {
  const cfg = await A.getConfig(interaction.guild.id);
  const rows = await getLeaderboard(cfg.current_season, mode || 'unique');

  if (!rows.length) return interaction.reply({ content: 'Nobody\'s caught anything yet this season.', ephemeral: true });

  const label = { unique: 'Unique Stickers', catches: 'Total Catches', rare: 'Legendary+ Catches' }[mode || 'unique'];
  const lines = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — ${r.score}`);

  return interaction.reply({ embeds: [new EmbedBuilder().setColor(LAVENDER).setTitle(`<:member:1495666085121491024> ${label} — ${getSeasonName(cfg.current_season)}`).setDescription(lines.join('\n'))] });
}

// ── Autocomplete ──────────────────────────────────────────────────────────
async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const sub = interaction.options.getSubcommand(false);
  const query = (focused.value || '').toLowerCase();

  // Trade's "offer" field and the member gift's "sticker" field, and exchange's optional
  // "sticker" field: only show the user's OWN duplicates, with spare counts shown.
  const dupeOnlyFields = (sub === 'trade' && focused.name === 'offer')
    || (sub === 'gift' && focused.name === 'sticker')
    || (sub === 'exchange' && focused.name === 'sticker');

  if (dupeOnlyFields) {
    const cfg = await A.getConfig(interaction.guild.id);
    const dupes = await getDuplicates(interaction.user.id, cfg.current_season);
    const matches = dupes.filter(d => d.monster.name.toLowerCase().includes(query)).slice(0, 25);
    return interaction.respond(matches.map(d => ({
      name: `#${String(d.monster.number).padStart(3, '0')} ${d.monster.name} — ${d.spareCount} spare${d.spareCount !== 1 ? 's' : ''}`,
      value: d.monster.id,
    })));
  }

  // Trade's "request" field: once a trade partner is picked, only show stickers THEY
  // actually own, with their quantity shown — so you can see if it's a spare for them too.
  if (sub === 'trade' && focused.name === 'request') {
    const targetUser = interaction.options.getUser('user');
    if (targetUser) {
      const cfg = await A.getConfig(interaction.guild.id);
      const theirCollection = await getUserCollection(targetUser.id, cfg.current_season);
      const owned = [...theirCollection.entries()]
        .map(([monsterId, row]) => ({ monster: getMonster(monsterId), quantity: row.quantity }))
        .filter(o => o.monster && o.monster.name.toLowerCase().includes(query))
        .sort((a, b) => a.monster.number - b.monster.number)
        .slice(0, 25);
      if (!owned.length) {
        return interaction.respond([{ name: `${targetUser.username} doesn't own any matching stickers`, value: 'none' }]);
      }
      return interaction.respond(owned.map(o => ({
        name: `#${String(o.monster.number).padStart(3, '0')} ${o.monster.name} — ${targetUser.username} owns ${o.quantity}${o.quantity > 1 ? ' (spare for them too)' : ''}`,
        value: o.monster.id,
      })));
    }
    // no trade partner picked yet — can't filter by ownership, fall through to the generic list below
  }

  const matches = MONSTERS.filter(m => isEnabled(m) && m.name.toLowerCase().includes(query)).slice(0, 25);
  return interaction.respond(matches.map(m => ({ name: `#${String(m.number).padStart(3, '0')} ${m.name}`, value: m.id })));
}
async function handleAdminAutocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const matches = MONSTERS.filter(m => m.name.toLowerCase().includes(focused)).slice(0, 25); // admin sees disabled ones too
  return interaction.respond(matches.map(m => ({ name: `#${String(m.number).padStart(3, '0')} ${m.name}${isEnabled(m) ? '' : ' (disabled)'}`, value: m.id })));
}

// ── Activity listener (called from index.js's messageCreate) ────────────
// Activity counts server-wide now — chat in ANY channel contributes. The
// spawn itself still only ever posts into an allowed spawn channel, picked
// randomly if there's more than one, since the triggering channel might not
// be on that list at all.
async function handleActivityMessage(message) {
  if (!CONFIG.enabled || message.author.bot || !message.guild) return;
  const cfg = await A.getConfig(message.guild.id);
  if (!cfg.enabled) return;

  const shouldSpawn = recordActivity(message.guild.id, message.author.id, message.content || '');
  if (!shouldSpawn) return;

  markSpawned(message.guild.id);

  const spawnChannels = await A.getSpawnChannels(message.guild.id);
  if (!spawnChannels.length) return; // nothing configured — nowhere to actually post it

  const pick = spawnChannels[Math.floor(Math.random() * spawnChannels.length)];
  const channel = await message.guild.channels.fetch(pick.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const monster = rollMonster(cfg.current_season);
  if (!monster) return;
  await postSpawn(channel, message.guild.id, monster, 'NATURAL', cfg.ping_role_id).catch(err => console.error('[Drop It Like It\'s Hot] spawn error', err));
}

// ── Button router (called from index.js's interactionCreate) ────────────
async function handleButton(interaction) {
  if (interaction.customId.startsWith('dz_catch:')) return handleCatchButton(interaction);
  if (interaction.customId.startsWith('dz_trade_accept:') || interaction.customId.startsWith('dz_trade_decline:')) return resolveTradeButton(interaction);
  if (interaction.customId.startsWith('dz_book_page:')) return handleBookPageButton(interaction);
  if (interaction.customId.startsWith('dz_book_back:')) return handleBookBackButton(interaction);
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
    if (sub === 'duplicates') return cmdDuplicates(interaction);
    if (sub === 'gift') return cmdMemberGift(interaction, interaction.options.getUser('user'), interaction.options.getString('sticker'));
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
      const { embed, attachment } = buildGiftEmbed(result.monster, target, interaction.user, [
        { name: 'Quantity', value: `${qty}`, inline: true },
        { name: 'Now Owns', value: `${result.newQuantity}`, inline: true },
      ]);
      return interaction.reply({ embeds: [embed], files: attachment ? [attachment] : [] });
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
    if (sub === 'timer') {
      const state = interaction.options.getString('state');
      if (state === 'off') {
        await T.setTimerConfig(interaction.client, interaction.guild.id, false, 60, 180);
        return interaction.reply(`<:checkmark:1495666088417956002> Time-based spawns turned off — back to chat-activity only.`);
      }
      const minMin = interaction.options.getInteger('min_minutes');
      const maxMin = interaction.options.getInteger('max_minutes');
      if (!minMin || !maxMin || minMin > maxMin) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> Give both \`min_minutes\` and \`max_minutes\`, with min ≤ max.`, ephemeral: true });
      }
      await T.setTimerConfig(interaction.client, interaction.guild.id, true, minMin, maxMin);
      return interaction.reply(`<:checkmark:1495666088417956002> Time-based spawns are on — a sticker will drop every **${minMin}-${maxMin} minutes** regardless of chat activity, in a random allowed spawn channel.`);
    }
    if (sub === 'toggle') {
      const state = interaction.options.getString('state') === 'on';
      await A.setGuildEnabled(interaction.guild.id, state);

      let extra = '';
      if (state) {
        const cfg = await A.getConfig(interaction.guild.id);
        if (!cfg.timer_enabled) {
          await T.setTimerConfig(interaction.client, interaction.guild.id, true, 30, 90);
          extra = `\nRandom drops are on too — a sticker will drop roughly every 30-90 minutes on its own, no setup needed. (Adjust anytime with \`/stickers-admin timer\`.)`;
        }
      }
      return interaction.reply(`<:checkmark:1495666088417956002> Drop It Like It's Hot is now **${state ? 'ON' : 'OFF'}**.${extra}`);
    }
    if (sub === 'giftpermission') {
      const target = interaction.options.getUser('user');
      const state = interaction.options.getString('state');
      if (state === 'on') {
        await A.grantGiftPermission(interaction.guild.id, target.id);
        return interaction.reply(`<:checkmark:1495666088417956002> <@${target.id}> can now gift their duplicate stickers to other members with /stickers gift.`);
      }
      await A.revokeGiftPermission(interaction.guild.id, target.id);
      return interaction.reply(`<:checkmark:1495666088417956002> <@${target.id}>'s gift permission has been revoked.`);
    }
    if (sub === 'stats') {
      const cfg = await A.getConfig(interaction.guild.id);
      const stats = await A.getStats(interaction.guild.id, cfg.current_season);
      const embed = new EmbedBuilder().setColor(LAVENDER).setTitle(`<a:leaderboard:1552119707518238740> ${getSeasonName(cfg.current_season)} Stats`)
        .addFields(
          { name: 'Total Caught', value: `${stats.totalCaught}`, inline: true },
          { name: 'Natural Spawns', value: `${stats.naturalSpawns}`, inline: true },
          { name: 'Admin Spawns', value: `${stats.adminSpawns}`, inline: true },
          { name: 'Escaped', value: `${stats.escaped}`, inline: true },
          { name: 'Active Collectors', value: `${stats.activeCollectors}`, inline: true },
          { name: 'Most Caught', value: stats.mostCaught ? `${stats.mostCaught.monster?.name} (${stats.mostCaught.count})` : 'N/A', inline: true },
          { name: 'Spawn Channels', value: stats.spawnChannelIds.length ? stats.spawnChannelIds.map(id => `<#${id}>`).join(', ') : '⚠️ None configured', inline: false },
          { name: 'Random Timer', value: stats.timerEnabled ? `On — every ${stats.timerRange}` : 'Off', inline: true },
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
  initTimer: T.init,
};
