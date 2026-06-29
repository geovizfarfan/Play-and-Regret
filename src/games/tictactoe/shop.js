const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { economy } = require('../../utils/database');
const shop = require('../../utils/shop');
const E = require('../../utils/emojis');

const CURRENCY = 'sins';

module.exports = {
  name: 'shop',

  async handleCommand(message, args, command) {
    if (command === 'shop')                                    return this.showShop(message);
    if (command === 'buy')                                     return this.buy(message, args);
    if (command === 'inventory' || command === 'myitems')      return this.inventory(message);
    if (command === 'equip')                                   return this.equipCmd(message, args);
  },

  async handleSlash(interaction) {
    const cmd = interaction.commandName;
    if (cmd === 'shop' || cmd === 'store_tictacbruh') return this.showShopSlash(interaction);
    if (cmd === 'buy')       return this.buySlash(interaction);
    if (cmd === 'inventory' || cmd === 'myitems') return this.inventorySlash(interaction);
    if (cmd === 'equip')     return this.equipSlash(interaction);
  },

  async handleSelect(interaction) {
    const [prefix, action, userId] = interaction.customId.split(':');
    if (prefix !== 'shop') return;

    if (action === 'buy_token') {
      await interaction.deferUpdate();
      const tokenId = interaction.values[0];
      return this._processBuyToken(interaction.user, tokenId,
        async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg, embeds: [], components: [] } : msg)
      );
    }

    if (action === 'equip_token' || action === 'equip_turn' || action === 'equip_x' || action === 'equip_o') {
      await interaction.deferUpdate();
      const tokenId = interaction.values[0];
      const token = shop.CATALOG.find(t => t.id === tokenId);
      if (!token) return interaction.editReply({ content: 'Token not found.', embeds: [], components: [] });
      await shop.equip(interaction.user.id, tokenId);
      const slotLabel = token.slot === 'ttt_piece' ? 'piece (X & O)' : 'turn indicator';
      return interaction.editReply({
        content: `<:checkmark:1495666088417956002> **${token.emoji} ${token.name}** is now your **${slotLabel}**!`,
        embeds: [], components: []
      });
    }
  },

  // ── Shop display ─────────────────────────────────────────────────────────────
  async showShop(message) {
    const { embeds, components } = await buildShopDisplay(message.author);
    return message.reply({ embeds, components });
  },

  async showShopSlash(interaction) {
    try {
      const { embeds, components } = await buildShopDisplay(interaction.user);
      await interaction.reply({ embeds, components, ephemeral: true });
    } catch(err) {
      console.error('[shop display error]', err.stack || err);
      await interaction.reply({ content: `${E.ERROR} Shop error: ${err.message}`, ephemeral: true }).catch(() => {});
    }
  },

  // ── Buy token from catalog ───────────────────────────────────────────────────
  async buy(message, args) {
    const itemType = args[0]?.toLowerCase();
    const emoji    = args[1];
    // Legacy support — if old-style !buy ttt_x <emoji>
    if (emoji) return this._processLegacyBuy(message.author, itemType, emoji, async (msg) => message.reply(msg));
    // New style — show catalog picker
    const { embeds, components } = buildCatalogPicker(null);
    return message.reply({ embeds, components });
  },

  async buySlash(interaction) {
    const tokenId = interaction.options.getString('token');
    await interaction.deferReply({ ephemeral: true });
    if (tokenId) {
      return this._processBuyToken(interaction.user, tokenId,
        async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg } : msg)
      );
    }
    const { embeds, components } = buildCatalogPicker(null);
    return interaction.editReply({ embeds, components });
  },

  async _processBuyToken(user, tokenId, replyFn) {
    const token = shop.CATALOG.find(t => t.id === tokenId);
    if (!token) return replyFn(`${E.ERROR} Token not found.`);
    if (token.price === 0) {
      if (token.slot === 'ttt_piece') {
        await shop.db_equipSlot(user.id, 'ttt_x', tokenId);
        await shop.db_equipSlot(user.id, 'ttt_o', tokenId);
      } else {
        await shop.equip(user.id, tokenId);
      }
      return replyFn(`<:checkmark:1495666088417956002> **${token.emoji} ${token.name}** is free and equipped! Use \`/inventory\` to assign it to X or O.`);
    }
    const already = await shop.hasToken(user.id, tokenId);
    if (already) {
      return replyFn(`<:checkmark:1495666088417956002> You already own **${token.emoji} ${token.name}**! Use \`/inventory\` to equip it to X or O.`);
    }
    await economy.getUser(user.id, user.username);
    const bal = await economy.getBalance(user.id);
    if (bal < token.price) return replyFn(`${E.ERROR} **${token.name}** costs **${token.price} ${CURRENCY}** but you only have **${bal}**!`);
    await economy.removeFunds(user.id, token.price, `Shop: ${token.name}`);
    await shop.buyToken(user.id, tokenId);
    const newBal = await economy.getBalance(user.id);
    return replyFn({ embeds: [
      new EmbedBuilder()
        .setColor('#B3FFD9')
        .setTitle(`<:sins:1478993005187698789> Purchase Successful!`)
        .setDescription(`${token.emoji} **${token.name}** added to your collection!\nUse \`/inventory\` to equip it as your X or O piece.`)
        .addFields(
          { name: 'Token',   value: `${token.emoji} ${token.name}`,                  inline: true },
          { name: 'Cost',    value: `${token.price.toLocaleString()} ${CURRENCY}`,   inline: true },
          { name: 'Balance', value: `${newBal.toLocaleString()} ${CURRENCY}`,        inline: true },
        )
        .setFooter({ text: '/inventory to equip to X or O piece' })
    ]});
  },

  async _processLegacyBuy(user, itemType, emoji, replyFn) {
    const validItems = ['ttt_x', 'ttt_o', 'ping_emoji'];
    if (!itemType || !validItems.includes(itemType))
      return replyFn(`${E.ERROR} Valid items: \`ttt_x\`, \`ttt_o\`, \`ping_emoji\``);
    if (!emoji) return replyFn(`${E.ERROR} Provide an emoji!`);
    const isCustom  = /^<a?:[a-zA-Z0-9_]+:\d+>$/.test(emoji);
    const isUnicode = /^\p{Emoji}/u.test(emoji);
    if (!isCustom && !isUnicode) return replyFn(`${E.ERROR} That doesn't look like a valid emoji!`);
    const price = shop.price(itemType);
    await economy.getUser(user.id, user.username);
    const bal = await economy.getBalance(user.id);
    if (bal < price) return replyFn(`${E.ERROR} You need **${price} ${CURRENCY}** but only have **${bal}**!`);
    await economy.removeFunds(user.id, price, `Shop: ${itemType}`);
    await shop.setItem(user.id, itemType, emoji);
    const labels = { ttt_x: 'X Piece', ttt_o: 'O Piece', ping_emoji: 'Turn Indicator' };
    return replyFn(`<:checkmark:1495666088417956002> Equipped ${emoji} as your **${labels[itemType]}**!`);
  },

  // ── Inventory ─────────────────────────────────────────────────────────────────
  async inventory(message) {
    await this._showInventory(message.author,
      async (msg) => message.reply(typeof msg === 'string' ? { content: msg } : msg)
    );
  },

  async inventorySlash(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await this._showInventory(interaction.user,
      async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg } : msg)
    );
  },

  async _showInventory(user, replyFn) {
    const inventory = await shop.getInventory(user.id);

    const pieceEquipped = await shop.getEquipped(user.id, 'ttt_x'); // ttt_piece slot

    const pieces = inventory.filter(t => t.slot === 'ttt_piece');

    const embed = new EmbedBuilder()
      .setColor('#D9B3FF')
      .setTitle(`🎒 ${user.username}'s Token Collection`)
      .setDescription(`Your piece token is used for **both X and O** in every game.\nChange it anytime from the menu below.`)
      .addFields(
        { name: '🎮 My Piece',      value: pieceEquipped ? `${pieceEquipped.emoji} **${pieceEquipped.name}**` : 'Default', inline: true },
        { name: '🗃️ Pieces Owned',  value: `${pieces.length} token${pieces.length !== 1 ? 's' : ''}`,        inline: true },
      )
      .setFooter({ text: `${inventory.length} total tokens • /shop to buy more` });

    const components = [];

    if (pieces.length) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`shop:equip_token:${user.id}`)
          .setPlaceholder('🎮 Equip My Piece (X & O)...')
          .addOptions(pieces.slice(0, 25).map(t => ({
            label: t.name, value: t.id,
            emoji: parseEmoji(t.emoji),
            description: t.price === 0 ? 'Free default' : `${t.price} sins`,
            default: pieceEquipped?.id === t.id,
          })))
      ));
    }


    return replyFn({ embeds: [embed], components });
  },

  // ── Equip command ─────────────────────────────────────────────────────────────
  async equipCmd(message, args) {
    const tokenId = args[0];
    if (!tokenId) return message.reply(`${E.ERROR} Usage: \`!equip <token_id>\` — use \`!inventory\` to see your tokens.`);
    const has = await shop.hasToken(message.author.id, tokenId);
    if (!has) return message.reply(`${E.ERROR} You don't own that token!`);
    const token = shop.CATALOG.find(t => t.id === tokenId);
    await shop.equip(message.author.id, tokenId);
    return message.reply(`<:checkmark:1495666088417956002> Equipped **${token.emoji} ${token.name}** as your ${shop.SLOT_LABELS[token.slot]}!`);
  },

  async equipSlash(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await economy.getUser(interaction.user.id, interaction.user.username);
    const inventory = await shop.getInventory(interaction.user.id);

    if (!inventory || inventory.length === 0) {
      return interaction.editReply(`<:wrong:1495666083594502174> You don't own any tokens yet! Use \`/store_tictacbruh\` to buy some.`);
    }

    const options = inventory.slice(0, 25).map(t => ({
      label: t.name,
      value: t.id,
      description: `Equip as your X or O piece`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`equip_select_${interaction.user.id}`)
        .setPlaceholder('🎮 Choose a token to equip...')
        .addOptions(options)
    );

    await interaction.editReply({ content: `🎮 **Pick a token to equip:**`, components: [row] });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId === `equip_select_${interaction.user.id}` && i.user.id === interaction.user.id,
      time: 30000,
      max: 1,
    });

    collector.on('collect', async (i) => {
      const tokenId = i.values[0];
      const token   = shop.CATALOG.find(t => t.id === tokenId);
      await shop.equip(interaction.user.id, tokenId);
      await i.update({ content: `<:checkmark:1495666088417956002> **${token?.emoji || ''} ${token?.name || tokenId}** equipped as your piece!`, components: [] });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        interaction.editReply({ content: `<a:RojasClock:1511506715453947904> Equip timed out.`, components: [] }).catch(() => {});
      }
    });
  },
};

// ── Shop display builder ──────────────────────────────────────────────────────
async function buildShopDisplay(user) {
  await economy.getUser(user.id, user.username);
  const bal      = await economy.getBalance(user.id);
  const equipped = await shop.getEquipped(user.id, 'ttt_x');

  const embed = new EmbedBuilder()
    .setColor('#FFD4A0')
    .setTitle(`<a:purplesparkle:1479210541691175054> Tic-Tac-Bruh <:bruh:1479246568589754418>`)
    .setDescription(
      `<:sins:1478993005187698789> **Balance: ${bal.toLocaleString()} sins**\n` +
      `🎮 **Active Token:** ${equipped ? `${equipped.emoji} ${equipped.name}` : 'Default'}\n\n` +
      `Pick a token below to buy and use in every game.`
    )
    .setFooter({ text: '/inventory to swap your active token anytime' });

  const components = [];

  // 500 sins pieces
  const pieces500 = shop.CATALOG.filter(t => t.slot === 'ttt_piece' && t.price === 500);
  if (pieces500.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('shop:buy_token:pieces500')
        .setPlaceholder('🎮 Piece Tokens — 500 sins (Non-Animated)')
        .addOptions(pieces500.slice(0, 25).map(t => ({
          label: t.name,
          value: t.id,
          emoji: parseEmoji(t.emoji),
          description: `500 sins • works as X or O piece`,
        })))
    ));
  }

  // 1000 sins pieces
  const pieces1000 = shop.CATALOG.filter(t => t.slot === 'ttt_piece' && t.price === 1000);
  if (pieces1000.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('shop:buy_token:pieces1000')
        .setPlaceholder('🎮 Piece Tokens — 1,000 sins (Animated)')
        .addOptions(pieces1000.slice(0, 25).map(t => ({
          label: t.name,
          value: t.id,
          emoji: parseEmoji(t.emoji),
          description: `1,000 sins • works as X or O piece`,
        })))
    ));
  }



  return { embeds: [embed], components };
}

function parseEmoji(str) {
  if (!str.startsWith('<')) return { name: str };
  const animated = str.startsWith('<a');
  const name = str.match(/:([a-zA-Z0-9_]+):/)?.[1] || 'e';
  const id   = str.match(/(\d{10,})/)?.[1];
  return { id, name, animated };
}

function buildCatalogPicker(slot) {
  const tokens = slot ? shop.CATALOG.filter(t => t.slot === slot && t.price > 0) : shop.CATALOG.filter(t => t.price > 0);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`shop:buy_token:all`)
    .setPlaceholder('Pick a token to buy...')
    .addOptions(tokens.map(t => ({
      label: `${t.name} — ${t.price} sins`,
      value: t.id,
      emoji: t.emoji.startsWith('<') ? { id: t.emoji.match(/\d+/)?.[0], name: t.emoji.match(/:([a-zA-Z0-9_]+):/)?.[1], animated: t.emoji.startsWith('<a') } : { name: t.emoji },
      description: shop.SLOT_LABELS[t.slot],
    })));
  const embed = new EmbedBuilder()
    .setColor('#FFD4A0')
    .setTitle('Pick a token to buy')
    .setDescription('Select from the menu below.');
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}
