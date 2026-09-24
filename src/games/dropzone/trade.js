// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — trading.
// One duplicate sticker for one sticker the other person owns. The offer side
// MUST be a spare (quantity > 1) — you can never trade away your only copy.
// The other person accepts or declines via buttons. Posted to the configured
// exchange channel if one is set.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../../utils/database');
const { RARITY_META } = require('./config');
const { getMonster } = require('./monsters');

async function getExchangeChannel(guild) {
  const cfg = await db.get('SELECT exchange_channel_id FROM dropzone_config WHERE guild_id = ?', [guild.id]);
  if (!cfg?.exchange_channel_id) return null;
  return guild.channels.fetch(cfg.exchange_channel_id).catch(() => null);
}

async function proposeTrade(guild, channel, fromUser, toUser, offerMonsterId, requestMonsterId, season) {
  if (fromUser.id === toUser.id) return { error: 'self' };
  const offerMonster = getMonster(offerMonsterId);
  const requestMonster = getMonster(requestMonsterId);
  if (!offerMonster || !requestMonster) return { error: 'unknown_sticker' };

  const ownOffer = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [fromUser.id, offerMonsterId, season]);
  if (!ownOffer || ownOffer.quantity < 1) return { error: 'dont_own_offer' };
  if (ownOffer.quantity < 2) return { error: 'not_a_duplicate' }; // must be a spare — can't trade your only copy

  const theyOwnRequest = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [toUser.id, requestMonsterId, season]);
  if (!theyOwnRequest || theyOwnRequest.quantity < 1) return { error: 'they_dont_own_request' };

  const exchangeChannel = await getExchangeChannel(guild);
  const postChannel = exchangeChannel || channel;

  const row = await db.get(
    `INSERT INTO dropzone_trades (guild_id, from_user, to_user, offer_monster_id, offer_season, request_monster_id, request_season, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING') RETURNING id`,
    [guild.id, fromUser.id, toUser.id, offerMonsterId, season, requestMonsterId, season]
  );
  const tradeId = row.id;

  const offerMeta = RARITY_META[offerMonster.rarity];
  const requestMeta = RARITY_META[requestMonster.rarity];

  const embed = new EmbedBuilder()
    .setColor('#C9B1FF')
    .setTitle('<a:exchange:1552116423478870046> TRADE PROPOSAL')
    .setDescription(
      `<@${fromUser.id}> wants to trade with <@${toUser.id}>\n\n` +
      `**Offering (spare copy):** ${offerMeta.emoji} ${offerMonster.name} — had ${ownOffer.quantity}, offering 1 spare\n` +
      `**For:** ${requestMeta.emoji} ${requestMonster.name}\n\n` +
      `<@${toUser.id}>, accept or decline below.`
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dz_trade_accept:${tradeId}`).setLabel('Accept').setEmoji('<:checkmark:1495666088417956002>').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`dz_trade_decline:${tradeId}`).setLabel('Decline').setEmoji('<:wrong:1495666083594502174>').setStyle(ButtonStyle.Danger),
  );

  const msg = await postChannel.send({ content: `<@${toUser.id}>`, embeds: [embed], components: [buttons] });
  await db.run('UPDATE dropzone_trades SET message_id = ?, channel_id = ? WHERE id = ?', [msg.id, postChannel.id, tradeId]);

  return { success: true, tradeId, postedIn: postChannel };
}

async function resolveTradeButton(interaction) {
  const [action, tradeIdStr] = interaction.customId.split(':');
  const tradeId = parseInt(tradeIdStr);
  const trade = await db.get('SELECT * FROM dropzone_trades WHERE id = ?', [tradeId]);
  if (!trade) return interaction.reply({ content: '<:wrong:1495666083594502174> This trade no longer exists.', ephemeral: true });
  if (trade.status !== 'PENDING') return interaction.reply({ content: '<:wrong:1495666083594502174> This trade was already resolved.', ephemeral: true });
  if (interaction.user.id !== trade.to_user) return interaction.reply({ content: '<:wrong:1495666083594502174> Only the person being asked to trade can respond to this.', ephemeral: true });

  if (action === 'dz_trade_decline') {
    await db.run(`UPDATE dropzone_trades SET status = 'DECLINED', resolved_at = NOW() WHERE id = ? AND status = 'PENDING'`, [tradeId]);
    await interaction.update({ content: null, embeds: [new EmbedBuilder().setColor('#555555').setTitle('<a:exchange:1552116423478870046> Trade declined.')], components: [] });
    return;
  }

  // Accept — re-verify both sides still actually own what's being swapped, AND that the offer is still a spare.
  const offerOwned = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [trade.from_user, trade.offer_monster_id, trade.offer_season]);
  const requestOwned = await db.get('SELECT quantity FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ?', [trade.to_user, trade.request_monster_id, trade.request_season]);

  if (!offerOwned?.quantity || offerOwned.quantity < 2 || !requestOwned?.quantity) {
    await db.run(`UPDATE dropzone_trades SET status = 'CANCELLED', resolved_at = NOW() WHERE id = ? AND status = 'PENDING'`, [tradeId]);
    return interaction.update({ content: null, embeds: [new EmbedBuilder().setColor('#555555').setTitle('<:wrong:1495666083594502174> Trade fell through — one side no longer has a spare to offer.')], components: [] });
  }

  // Atomic claim so this can't double-resolve if somehow clicked twice.
  const claimed = await db.get(`UPDATE dropzone_trades SET status = 'ACCEPTED', resolved_at = NOW() WHERE id = ? AND status = 'PENDING' RETURNING id`, [tradeId]);
  if (!claimed) return interaction.reply({ content: '<:wrong:1495666083594502174> Already resolved.', ephemeral: true });

  await swapOwnership(trade.from_user, trade.to_user, trade.offer_monster_id, trade.offer_season);
  await swapOwnership(trade.to_user, trade.from_user, trade.request_monster_id, trade.request_season);

  const offerMonster = getMonster(trade.offer_monster_id);
  const requestMonster = getMonster(trade.request_monster_id);

  await interaction.update({
    content: null,
    embeds: [new EmbedBuilder().setColor('#3ba55d').setTitle('<a:exchange:1552116423478870046> TRADE COMPLETE')
      .setDescription(`<@${trade.from_user}> ↔ <@${trade.to_user}>\n\n${offerMonster?.name} traded for ${requestMonster?.name}.`)],
    components: [],
  });
}

async function swapOwnership(fromUserId, toUserId, monsterId, season) {
  await db.run('UPDATE dropzone_collections SET quantity = quantity - 1 WHERE user_id = ? AND monster_id = ? AND season = ?', [fromUserId, monsterId, season]);
  await db.run('DELETE FROM dropzone_collections WHERE user_id = ? AND monster_id = ? AND season = ? AND quantity <= 0', [fromUserId, monsterId, season]);
  await db.run(
    `INSERT INTO dropzone_collections (user_id, monster_id, season, quantity, first_caught_at)
     VALUES (?, ?, ?, 1, NOW())
     ON CONFLICT (user_id, monster_id, season) DO UPDATE SET quantity = dropzone_collections.quantity + 1`,
    [toUserId, monsterId, season]
  );
}

module.exports = { proposeTrade, resolveTradeButton, getExchangeChannel };
