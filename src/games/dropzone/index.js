// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — main module. Command handlers, autocomplete, and
// the two things index.js needs to wire in: the activity listener and the
// catch/trade button router.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { db, economy } = require('../../utils/database');
const guildEconomy = require('../../utils/guildEconomy');
const { CONFIG, RARITY_ORDER, DISPLAY_ORDER, RARITY_META, SEASON_NAMES, getSeasonName, getActiveSeason } = require('./config');
const { renderBookImage } = require('./bookImage');
const { getMonster, fmtNumber, getMonstersBySeason, getCollectorMonsters, isEnabled, loadOverrides } = require('./monsters');
const { startSeasonScheduler } = require('./season');
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
  const embed = new EmbedBuilder()
    .setColor(LAVENDER)
    .setTitle('<a:gift:1552714840861179974> Card Given')
    .setDescription(
      `Successfully added **${monster.name}** \`${fmtNumber(monster)}\` to <@${recipient.id}>'s collection.`
    )
    .addFields(
      { name: 'Given By', value: giver ? `<@${giver.id}>` : 'Staff', inline: true },
      ...(extraFields || []),
    );
  const attachment = buildMonsterAttachment(monster);
  if (attachment) embed.setThumbnail(`attachment://${String(monster.number).padStart(3, '0')}.png`);
  return { embed, attachment };
}

// ── /cards book ───────────────────────────────────────────────────────
async function buildBookSummaryPayload(runnerId, targetUser, season, seasonName) {
  const summary = await buildCollectionSummary(targetUser.id, season);
  const lines = DISPLAY_ORDER.filter(r => summary.byRarity[r].total > 0).map(r => `${RARITY_META[r].emoji} ${RARITY_META[r].label}: ${rarityBar(summary.byRarity[r].owned, summary.byRarity[r].total)}`);

  const embed = new EmbedBuilder()
    .setColor(LAVENDER)
    .setTitle(`<a:catch:1552115280342421555> ${targetUser.username}'s Card Book — ${seasonName}`)
    .addFields(
      { name: 'Unique', value: `${summary.uniqueOwned} / ${summary.totalMonsters}`, inline: true },
      { name: 'Completion', value: `${summary.completionPct.toFixed(1)}%`, inline: true },
      { name: 'Total Catches', value: `${summary.totalCatches}`, inline: true },
      { name: 'Duplicates', value: `${summary.duplicates}`, inline: true },
      { name: 'By Rarity', value: lines.join('\n') },
    );

  const ownedIds = new Set(summary.collection.keys());
  const imgBuffer = await renderBookImage(getMonstersBySeason(season), ownedIds, `${targetUser.username}'s Card Book`);
  const attachment = imgBuffer ? new AttachmentBuilder(imgBuffer, { name: 'book.png' }) : null;
  if (attachment) embed.setImage('attachment://book.png');

  const buttons = [];
  if (summary.uniqueOwned) {
    buttons.push(new ButtonBuilder().setCustomId(`dz_book_page:${runnerId}:${targetUser.id}:${season}:0`).setLabel('Inspect a Card').setEmoji('📖').setStyle(ButtonStyle.Primary));
  }
  if (getCollectorMonsters().length) {
    buttons.push(new ButtonBuilder().setCustomId(`dz_collector:${runnerId}:${targetUser.id}:${season}`).setLabel('Collector').setEmoji('👑').setStyle(ButtonStyle.Success));
  }
  return { embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [], files: attachment ? [attachment] : [] };
}

// Collector book (season 0): every collector card, owned in colour, unowned greyed out.
async function buildCollectorPayload(runnerId, targetUser, fromSeason) {
  const all = getCollectorMonsters().filter(isEnabled);
  const collection = await getUserCollection(targetUser.id, 0);
  const ownedIds = new Set(collection.keys());
  const owned = all.filter(m => ownedIds.has(m.id));
  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(`👑 ${targetUser.username}'s Collector Cards`)
    .setDescription('Special cards that never drop — only an admin can give them out.')
    .addFields({ name: 'Collected', value: `${owned.length} / ${all.length}`, inline: true });
  const imgBuffer = await renderBookImage(all, ownedIds, `${targetUser.username}'s Collector Cards`, 6);
  const attachment = imgBuffer ? new AttachmentBuilder(imgBuffer, { name: 'collector.png' }) : null;
  if (attachment) embed.setImage('attachment://collector.png');
  const buttons = [new ButtonBuilder().setCustomId(`dz_book_back:${runnerId}:${targetUser.id}:${fromSeason}`).setLabel('◀ Back').setEmoji('📕').setStyle(ButtonStyle.Danger)];
  if (owned.length) buttons.push(new ButtonBuilder().setCustomId(`dz_book_page:${runnerId}:${targetUser.id}:0:0`).setLabel('Inspect a Card').setEmoji('📖').setStyle(ButtonStyle.Primary));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)], files: attachment ? [attachment] : [] };
}

async function handleCollectorButton(interaction) {
  const [, runnerId, targetUserId, seasonStr] = interaction.customId.split(':');
  if (interaction.user.id !== runnerId) {
    return interaction.reply({ content: '<:wrong:1495666083594502174> Only the person who ran this command can use these buttons.', ephemeral: true });
  }
  await interaction.deferUpdate();
  const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (!targetUser) return;
  return interaction.editReply(await buildCollectorPayload(runnerId, targetUser, parseInt(seasonStr)));
}

// Season dropdown on /cards book and /cards missing. Defaults to the guild's current season;
// members can look at any season that has started (so a closed season stays viewable).
function resolveViewSeason(interaction, cfg) {
  const picked = interaction.options.getInteger('season');
  if (picked === null || picked === undefined) return { season: cfg.current_season };
  if (picked > getActiveSeason()) return { error: `<:wrong:1495666083594502174> **${getSeasonName(picked)}** hasn't started yet.` };
  return { season: picked };
}

async function cmdBook(interaction, targetUser) {
  const cfg = await A.getConfig(interaction.guild.id);
  const resolved = resolveViewSeason(interaction, cfg);
  if (resolved.error) return interaction.reply({ content: resolved.error, ephemeral: true });
  await interaction.deferReply();
  const season = resolved.season;
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
    .setTitle(`${fmtNumber(monster)} — ${monster.name.toUpperCase()}`)
    .setDescription(`${meta.emoji} ${meta.label}${monster.title ? `\n**${monster.title}**` : ''}\n\nOwned: **×${qty}**\n\n*"${monster.flavorText}"*`)
    .setFooter({ text: `Card ${safeIndex + 1} of ${owned.length}` });

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
  if (season === 0) {                       // came from a collector card → back to the collector gallery
    const cfg = await A.getConfig(interaction.guild.id);
    return interaction.editReply(await buildCollectorPayload(runnerId, targetUser, cfg.current_season));
  }
  const payload = await buildBookSummaryPayload(runnerId, targetUser, season, seasonName);
  return interaction.editReply(payload);
}

// ── /cards missing ────────────────────────────────────────────────────
async function cmdMissing(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const resolved = resolveViewSeason(interaction, cfg);
  if (resolved.error) return interaction.reply({ content: resolved.error, ephemeral: true });
  const seasonName = getSeasonName(resolved.season);
  const missing = await getMissing(interaction.user.id, resolved.season);
  const collectorOwned = await getUserCollection(interaction.user.id, 0);
  const collectorMissing = getCollectorMonsters().filter(m => isEnabled(m) && !collectorOwned.has(m.id)).sort((a, b) => a.number - b.number);

  if (!missing.length && !collectorMissing.length) {
    return interaction.reply(`<:checkmark:1495666088417956002> You have every card available in **${seasonName}** and every collector card. Impressive.`);
  }

  const sorted = [...missing].sort((a, b) => a.number - b.number);
  const list = sorted.map(m => `${RARITY_META[m.rarity].emoji} ${fmtNumber(m)} ${m.name}`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(LAVENDER)
    .setTitle(`<a:guess:1542348901217075200> Missing — ${seasonName} (${missing.length} card${missing.length !== 1 ? 's' : ''})`)
    .setDescription((list || `You have every card in **${seasonName}**.`).slice(0, 4000));
  if (collectorMissing.length) {
    embed.addFields({
      name: `👑 Collector cards (${collectorMissing.length} of ${getCollectorMonsters().length} missing)`,
      value: collectorMissing.map(m => `${fmtNumber(m)} ${m.name}`).join('\n').slice(0, 1000),
    });
  }

  return interaction.reply({ embeds: [embed] });
}

// ── /cards view ───────────────────────────────────────────────────────
async function cmdView(interaction, monsterId) {
  const monster = getMonster(monsterId);
  if (!monster) return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown card.', ephemeral: true });
  if (!isEnabled(monster)) return interaction.reply({ content: '<:wrong:1495666083594502174> That one hasn\'t been released yet.', ephemeral: true });

  const owned = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [interaction.user.id, monster.id, monster.season]);
  const meta = RARITY_META[monster.rarity];

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${fmtNumber(monster)} — ${monster.name.toUpperCase()}`)
    .setDescription(`${meta.emoji} ${meta.label}\n\nOwned: **×${owned?.quantity || 0}**\n\n*"${monster.flavorText}"*`);

  const attachment = buildMonsterAttachment(monster);
  if (attachment) {
    embed.setImage(`attachment://${String(monster.number).padStart(3, '0')}.png`);
    return interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });
  }
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /cards trade ──────────────────────────────────────────────────────
async function cmdTrade(interaction, targetUser, offerId, requestId) {
  const cfg = await A.getConfig(interaction.guild.id);
  const result = await proposeTrade(interaction.guild, interaction.channel, interaction.user, targetUser, offerId, requestId, cfg.current_season);

  if (result.error === 'self') return interaction.reply({ content: '<:wrong:1495666083594502174> Can\'t trade with yourself.', ephemeral: true });
  if (result.error === 'unknown_sticker') return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown card.', ephemeral: true });
  if (result.error === 'collector') return interaction.reply({ content: '<:wrong:1495666083594502174> Collector cards can\'t be traded — only an admin can give them out.', ephemeral: true });
  if (result.error === 'dont_own_offer') return interaction.reply({ content: '<:wrong:1495666083594502174> You don\'t own the card you\'re offering.', ephemeral: true });
  if (result.error === 'not_a_duplicate') return interaction.reply({ content: '<:wrong:1495666083594502174> That\'s your only copy — you can only trade away spares, not your only one.', ephemeral: true });
  if (result.error === 'they_dont_have_spare') return interaction.reply({ content: `<:wrong:1495666083594502174> ${targetUser.username} doesn't have a spare of that card to trade away.`, ephemeral: true });

  return interaction.reply({ content: `<:checkmark:1495666088417956002> Trade proposed in ${result.postedIn}.`, ephemeral: true });
}

// ── /cards exchange ───────────────────────────────────────────────────
async function cmdExchange(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const resolved = resolveViewSeason(interaction, cfg);
  if (resolved.error) return interaction.reply({ content: resolved.error, ephemeral: true });
  const monsterId = interaction.options.getString('card');
  const amount = interaction.options.getInteger('amount');
  const seasonNote = resolved.season !== cfg.current_season ? ` (${getSeasonName(resolved.season)})` : '';

  if (monsterId) {
    // A specific card always exchanges from its own season, whatever the dropdown says.
    const target = getMonster(monsterId);
    if (target && target.season > getActiveSeason()) return interaction.reply({ content: `<:wrong:1495666083594502174> **${getSeasonName(target.season)}** hasn't started yet.`, ephemeral: true });
    const result = await exchangeSpecificSticker(interaction.user.id, monsterId, target ? target.season : resolved.season, amount);
    if (result.error === 'unknown_sticker') return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown card.', ephemeral: true });
    if (result.error === 'collector') return interaction.reply({ content: '<:wrong:1495666083594502174> Collector cards can\'t be exchanged for sins.', ephemeral: true });
    if (result.error === 'no_duplicates') return interaction.reply({ content: `<a:Warning:1497476844860215366> You don't have any spare copies of that one.`, ephemeral: true });

    await guildEconomy.addFunds(interaction.guild.id, interaction.user.id, interaction.user.username, result.sinsEarned, `Drop It Like It's Hot — exchanged ${result.monster.name}`);
    return interaction.reply({
      content: `<:checkmark:1495666088417956002> Exchanged **${result.itemsExchanged}×** ${result.monster.name} for **${result.sinsEarned.toLocaleString()} sins**. (${result.remainingSpares} spare${result.remainingSpares !== 1 ? 's' : ''} left)`,
      ephemeral: true,
    });
  }

  const result = await exchangeDuplicates(interaction.user.id, resolved.season);
  if (!result.itemsExchanged) {
    return interaction.reply({ content: `<a:Warning:1497476844860215366> No duplicates to exchange right now.`, ephemeral: true });
  }
  await guildEconomy.addFunds(interaction.guild.id, interaction.user.id, interaction.user.username, result.sinsEarned, 'Drop It Like It\'s Hot — duplicate exchange');
  const breakdown = RARITY_ORDER.filter(r => result.breakdown[r]).map(r => `${RARITY_META[r].emoji} ${result.breakdown[r]}× ${RARITY_META[r].label}`).join('\n');

  return interaction.reply({
    content: `<:checkmark:1495666088417956002> Exchanged **${result.itemsExchanged}** duplicates${seasonNote} for **${result.sinsEarned.toLocaleString()} sins**.\n\n${breakdown}`,
    ephemeral: true,
  });
}

// ── /cards duplicates ─────────────────────────────────────────────────
async function cmdDuplicates(interaction) {
  const cfg = await A.getConfig(interaction.guild.id);
  const resolved = resolveViewSeason(interaction, cfg);
  if (resolved.error) return interaction.reply({ content: resolved.error, ephemeral: true });
  const seasonNote = resolved.season !== cfg.current_season ? ` -- ${getSeasonName(resolved.season)}` : '';
  const dupes = await getDuplicates(interaction.user.id, resolved.season);
  if (!dupes.length) return interaction.reply({ content: `<a:Warning:1497476844860215366> You don't have any duplicates right now.`, ephemeral: true });

  const lines = dupes.map(d => `${RARITY_META[d.monster.rarity].emoji} ${fmtNumber(d.monster)} ${d.monster.name} — **${d.spareCount}** spare${d.spareCount !== 1 ? 's' : ''}`);
  const embed = new EmbedBuilder().setColor(LAVENDER).setTitle(`👀 Your Duplicates${seasonNote}`).setDescription(lines.join('\n').slice(0, 4000));
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /cards gift — member-to-member, own duplicates only ──────────────
async function cmdMemberGift(interaction, targetUser, monsterId) {
  const guildId = interaction.guild.id;
  const permitted = await A.hasGiftPermission(guildId, interaction.user.id);
  if (!isAdmin(interaction.member) && !permitted) {
    return interaction.reply({ content: `<:wrong:1495666083594502174> You don't have permission to gift cards. Ask an admin to grant it with /cards-admin giftpermission.`, ephemeral: true });
  }
  if (targetUser.id === interaction.user.id) return interaction.reply({ content: `<:wrong:1495666083594502174> Can't gift yourself.`, ephemeral: true });

  const cfg = await A.getConfig(guildId);
  const monster = getMonster(monsterId);
  if (!monster) return interaction.reply({ content: `<:wrong:1495666083594502174> Unknown card.`, ephemeral: true });
  if (monster.collector) return interaction.reply({ content: `<:wrong:1495666083594502174> Collector cards can only be given out by an admin.`, ephemeral: true });
  // Members can only gift spares from the current season; older seasons are staff gifts only.
  if (monster.season !== cfg.current_season) return interaction.reply({ content: `<:wrong:1495666083594502174> Only **${getSeasonName(cfg.current_season)}** cards can be gifted by members. Ask staff about older seasons.`, ephemeral: true });

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

// ── /cards leaderboard ────────────────────────────────────────────────
const LB_PAGE_SIZE = 15;

function buildLeaderboardPayload(runnerId, allRows, mode, season, page) {
  const label = { unique: 'Unique Cards', catches: 'Total Catches', rare: 'Legendary+ Catches' }[mode];
  const totalPages = Math.max(1, Math.ceil(allRows.length / LB_PAGE_SIZE));
  const pageRows = allRows.slice(page * LB_PAGE_SIZE, (page + 1) * LB_PAGE_SIZE);
  const lines = pageRows.map((r, i) => `**${page * LB_PAGE_SIZE + i + 1}.** <@${r.user_id}> — ${r.score}`);

  const embed = new EmbedBuilder()
    .setColor(LAVENDER)
    .setTitle(`<:member:1495666085121491024> ${label} — ${getSeasonName(season)}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Page ${page + 1}/${totalPages} • ${allRows.length} member${allRows.length !== 1 ? 's' : ''} total` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dz_lb_page:${runnerId}:${mode}:${season}:${page - 1}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`dz_lb_page:${runnerId}:${mode}:${season}:${page + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );

  return { embeds: [embed], components: totalPages > 1 ? [row] : [] };
}

async function cmdLeaderboard(interaction, mode) {
  const cfg = await A.getConfig(interaction.guild.id);
  mode = mode || 'unique';
  const rows = await getLeaderboard(cfg.current_season, mode); // no limit — everyone who's caught something

  if (!rows.length) return interaction.reply({ content: 'Nobody\'s caught anything yet this season.', ephemeral: true });

  return interaction.reply(buildLeaderboardPayload(interaction.user.id, rows, mode, cfg.current_season, 0));
}

async function handleLeaderboardPageButton(interaction) {
  const [, runnerId, mode, seasonStr, pageStr] = interaction.customId.split(':');
  if (interaction.user.id !== runnerId) {
    return interaction.reply({ content: '<:wrong:1495666083594502174> Only the person who ran this command can use these buttons.', ephemeral: true });
  }
  const season = parseInt(seasonStr);
  const page = parseInt(pageStr);
  const rows = await getLeaderboard(season, mode);
  return interaction.update(buildLeaderboardPayload(runnerId, rows, mode, season, page));
}

// ── Autocomplete ──────────────────────────────────────────────────────────
/** Seasons that have started, current season first, then newest-to-oldest. */
function startedSeasonsCurrentFirst(current) {
  const live = getActiveSeason();
  return Object.keys(SEASON_NAMES).map(Number).filter(n => n <= live)
    .sort((a, b) => (a === current ? -1 : b === current ? 1 : b - a));
}

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const sub = interaction.options.getSubcommand(false);
  const query = (focused.value || '').toLowerCase();

  // Trade's "offer" field and the member gift's "card" field, and exchange's optional
  // "card" field: only show the user's OWN duplicates, with spare counts shown.
  const dupeOnlyFields = (sub === 'trade' && focused.name === 'offer')
    || (sub === 'gift' && focused.name === 'card')
    || (sub === 'exchange' && focused.name === 'card');

  if (dupeOnlyFields) {
    const cfg = await A.getConfig(interaction.guild.id);
    // Exchange's card field only: the season dropdown filters the list; with no pick, show spares
    // from every started season (current first) so older-season spares can be cashed in too.
    const isExchange = sub === 'exchange' && focused.name === 'card';
    const picked = isExchange ? interaction.options.get('season')?.value : undefined;
    const started = startedSeasonsCurrentFirst(cfg.current_season);
    const seasons = !isExchange ? [cfg.current_season] : (picked != null ? started.filter(n => n === picked) : started);
    const dupes = (await Promise.all(seasons.map(n => getDuplicates(interaction.user.id, n)))).flat();
    const badge = isExchange && picked == null && started.length > 1;
    const matches = dupes.filter(d => d.monster.name.toLowerCase().includes(query)).slice(0, 25);
    return interaction.respond(matches.map(d => ({
      name: `${badge ? `S${d.monster.season} ` : ''}${fmtNumber(d.monster)} ${d.monster.name} — ${d.spareCount} spare${d.spareCount !== 1 ? 's' : ''}`,
      value: d.monster.id,
    })));
  }

  // Trade's "request" field: once a trade partner is picked, only show cards THEY
  // have a spare of (quantity >= 2) — same rule as the offer side, so nobody ends up
  // traded down to zero of something.
  if (sub === 'trade' && focused.name === 'request') {
    // Discord's autocomplete payload often omits resolved data for other options even
    // when they're already filled in on the modal, so interaction.options.getUser('user')
    // can come back undefined here despite a partner being picked. The raw ID doesn't
    // need resolution though — pull it directly off the option instead.
    const targetUserId = interaction.options.get('user')?.value;
    if (targetUserId) {
      const targetUsername = interaction.client.users.cache.get(targetUserId)?.username || 'this user';
      const cfg = await A.getConfig(interaction.guild.id);
      const theirCollection = await getUserCollection(targetUserId, cfg.current_season);
      const spares = [...theirCollection.entries()]
        .map(([monsterId, row]) => ({ monster: getMonster(monsterId), quantity: row.quantity }))
        .filter(o => o.monster && o.quantity >= 2 && o.monster.name.toLowerCase().includes(query))
        .sort((a, b) => a.monster.number - b.monster.number)
        .slice(0, 25);
      if (!spares.length) {
        return interaction.respond([{ name: `${targetUsername} has no spare cards to request`, value: 'none' }]);
      }
      return interaction.respond(spares.map(o => ({
        name: `${fmtNumber(o.monster)} ${o.monster.name} — ${targetUsername} has ${o.quantity}, ${o.quantity - 1} spare${o.quantity - 1 !== 1 ? 's' : ''}`,
        value: o.monster.id,
      })));
    }
    // no trade partner picked yet — can't filter by ownership, fall through to the generic list below
  }

  const seasonCfg = await A.getConfig(interaction.guild.id);
  const matches = getMonstersBySeason(seasonCfg.current_season).filter(m => isEnabled(m) && m.name.toLowerCase().includes(query)).slice(0, 25);
  return interaction.respond(matches.map(m => ({ name: `${fmtNumber(m)} ${m.name}`, value: m.id })));
}
async function handleAdminAutocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const adminCfg = await A.getConfig(interaction.guild.id);
  const sub = interaction.options.getSubcommand(false);
  // gift / remove: the season dropdown filters the list; with no pick, list every season (current
  // first) so closed seasons stay giftable. Every other admin subcommand keeps current season only.
  const seasonAware = sub === 'gift' || sub === 'remove';
  const picked = seasonAware ? interaction.options.get('season')?.value : undefined;
  const seasons = !seasonAware ? [adminCfg.current_season]
    : picked != null ? [picked]
    : Object.keys(SEASON_NAMES).map(Number).sort((a, b) => (a === adminCfg.current_season ? -1 : b === adminCfg.current_season ? 1 : b - a));
  const badge = seasonAware && picked == null && seasons.length > 1;
  const pool = seasons.flatMap(n => getMonstersBySeason(n));
  if ((seasonAware && picked == null) || sub === 'spawn') pool.push(...getCollectorMonsters());   // collector cards: giftable, and spawnable by admins (never natural)
  const matches = pool.filter(m => m.name.toLowerCase().includes(focused)).slice(0, 25); // admin sees disabled ones too
  return interaction.respond(matches.map(m => ({ name: `${m.collector ? '👑 ' : badge ? `S${m.season} ` : ''}${fmtNumber(m)} ${m.name}${isEnabled(m) ? '' : ' (disabled)'}`, value: m.id })));
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

  // Text content is the normal signal. A sticker or an attachment (GIF/image
  // upload with no caption) has empty content, so on its own it used to look
  // identical to pure spam and get filtered out — members who mostly react
  // with stickers/GIFs weren't counting toward activity at all. Build a
  // signature for those cases too so they qualify, while same-sticker or
  // same-attachment spam is still caught as repeating exactly like text spam.
  let content = message.content || '';
  if (!content && message.stickers?.size) {
    content = 'sticker:' + [...message.stickers.values()].map(s => s.id).sort().join(',');
  } else if (!content && message.attachments?.size) {
    content = 'attachment:' + [...message.attachments.values()].map(a => `${a.name}:${a.size}`).sort().join(',');
  }

  const shouldSpawn = recordActivity(message.guild.id, message.author.id, content);
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
  if (interaction.customId.startsWith('dz_collector:')) return handleCollectorButton(interaction);
  if (interaction.customId.startsWith('dz_lb_page:')) return handleLeaderboardPageButton(interaction);
}

// ── Slash command dispatch ────────────────────────────────────────────────
async function handleSlash(interaction, commandName) {
  if (commandName === 'cards') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'book') return cmdBook(interaction, interaction.options.getUser('user') || interaction.user);
    if (sub === 'missing') return cmdMissing(interaction);
    if (sub === 'view') return cmdView(interaction, interaction.options.getString('card'));
    if (sub === 'trade') return cmdTrade(interaction, interaction.options.getUser('user'), interaction.options.getString('offer'), interaction.options.getString('request'));
    if (sub === 'exchange') return cmdExchange(interaction);
    if (sub === 'leaderboard') return cmdLeaderboard(interaction, interaction.options.getString('mode'));
    if (sub === 'duplicates') return cmdDuplicates(interaction);
    if (sub === 'gift') return cmdMemberGift(interaction, interaction.options.getUser('user'), interaction.options.getString('card'));
  }

  if (commandName === 'cards-admin') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '<:wrong:1495666083594502174> Admin only.', ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'gift') {
      const target = interaction.options.getUser('user');
      const monsterId = interaction.options.getString('card');
      const qty = interaction.options.getInteger('quantity') || 1;
      if (target.id === interaction.user.id && target.id !== process.env.OWNER_ID) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> You can't gift cards to yourself.`, ephemeral: true });
      }
      const alreadyOwned = await A.getOwnedQuantity(target.id, monsterId);
      if (alreadyOwned > 0) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> ${target.username} already owns that card — staff gifts can't go to cards someone already has.`, ephemeral: true });
      }
      const result = await A.giftSticker(target.id, monsterId, qty);
      if (result.error) return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown card.', ephemeral: true });
      const { embed, attachment } = buildGiftEmbed(result.monster, target, interaction.user);
      return interaction.reply({ embeds: [embed], files: attachment ? [attachment] : [] });
    }
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      const monsterId = interaction.options.getString('card');
      const qty = interaction.options.getInteger('quantity') || 1;
      const result = await A.removeSticker(target.id, monsterId, qty);
      if (result.error === 'unknown_sticker') return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown card.', ephemeral: true });
      if (result.error === 'dont_own') return interaction.reply({ content: `<:wrong:1495666083594502174> ${target.username} doesn't own that card.`, ephemeral: true });
      return interaction.reply(`<:checkmark:1495666088417956002> Removed **${qty}×** ${result.monster.name} from <@${target.id}> (now owns ${result.newQuantity}).`);
    }
    if (sub === 'spawn') {
      const monsterId = interaction.options.getString('card');
      const cfg = await A.getConfig(interaction.guild.id);
      let channel = interaction.options.getChannel('channel');
      if (!channel) {                                              // default: the configured drop channel (else here)
        const sc = await A.getSpawnChannels(interaction.guild.id);
        channel = (sc.length && (interaction.guild.channels.cache.get(sc[0].channel_id) || await interaction.guild.channels.fetch(sc[0].channel_id).catch(() => null))) || interaction.channel;
      }
      const result = await A.manualSpawn(channel, interaction.guild.id, cfg.current_season, monsterId);
      if (result.error) return interaction.reply({ content: '<:wrong:1495666083594502174> Nothing available to spawn.', ephemeral: true });
      return interaction.reply({ content: `<:checkmark:1495666088417956002> Spawned **${result.monster.name}** in ${channel}.`, ephemeral: true });
    }
    if (sub === 'enable' || sub === 'disable') {
      const monsterId = interaction.options.getString('card');
      const result = await A.setMonsterEnabled(monsterId, sub === 'enable');
      if (result.error) return interaction.reply({ content: '<:wrong:1495666083594502174> Unknown card.', ephemeral: true });
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
      return interaction.reply(`<:checkmark:1495666088417956002> Time-based spawns are on — a collectible will drop every **${minMin}-${maxMin} minutes** regardless of chat activity, in a random allowed spawn channel.`);
    }
    if (sub === 'toggle') {
      const state = interaction.options.getString('state') === 'on';
      await A.setGuildEnabled(interaction.guild.id, state);

      let extra = '';
      if (state) {
        const cfg = await A.getConfig(interaction.guild.id);
        if (!cfg.timer_enabled) {
          await T.setTimerConfig(interaction.client, interaction.guild.id, true, 30, 90);
          extra = `\nRandom drops are on too — a collectible will drop roughly every 30-90 minutes on its own, no setup needed. (Adjust anytime with \`/cards-admin timer\`.)`;
        }
      }
      return interaction.reply(`<:checkmark:1495666088417956002> Drop It Like It's Hot is now **${state ? 'ON' : 'OFF'}**.${extra}`);
    }
    if (sub === 'giftpermission') {
      const target = interaction.options.getUser('user');
      const state = interaction.options.getString('state');
      if (state === 'on') {
        await A.grantGiftPermission(interaction.guild.id, target.id);
        return interaction.reply(`<:checkmark:1495666088417956002> <@${target.id}> can now gift their duplicate cards to other members with /cards gift.`);
      }
      await A.revokeGiftPermission(interaction.guild.id, target.id);
      return interaction.reply(`<:checkmark:1495666088417956002> <@${target.id}>'s gift permission has been revoked.`);
    }
    if (sub === 'missing') {
      await interaction.deferReply();
      const cfg = await A.getConfig(interaction.guild.id);
      const season = interaction.options.getInteger('season') || cfg.current_season;
      const monsters = getMonstersBySeason(season).filter(isEnabled);
      const rows = await db.all(`SELECT monster_id, COUNT(DISTINCT user_id) AS owners FROM dropzone_collections WHERE season = ? AND quantity > 0 GROUP BY monster_id`, [season]);
      const ownerMap = new Map(rows.map(r => [r.monster_id, Number(r.owners)]));
      const total = await db.get(`SELECT COUNT(DISTINCT user_id) AS n FROM dropzone_collections WHERE season = ? AND quantity > 0`, [season]);
      const collectors = Number(total?.n || 0);
      if (!monsters.length || !collectors) return interaction.editReply('No collection data for that season yet.');
      const ranked = monsters.map(m => ({ m, owners: ownerMap.get(m.id) || 0 }))
        .map(x => ({ ...x, missing: collectors - x.owners }))
        .sort((a, b) => b.missing - a.missing || a.m.number - b.m.number).slice(0, 20);
      const lines = ranked.map((x, i) => `**${i + 1}.** ${RARITY_META[x.m.rarity].emoji} ${fmtNumber(x.m)} ${x.m.name} — missing for **${x.missing}** of ${collectors} (${x.owners} own it)`);
      const embed = new EmbedBuilder().setColor(LAVENDER)
        .setTitle(`<a:guess:1542348901217075200> Most-missing cards — ${getSeasonName(season)}`)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: `Counts members who have caught at least one card this season (${collectors})` });
      return interaction.editReply({ embeds: [embed] });
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
  initSeasons: startSeasonScheduler,
};
