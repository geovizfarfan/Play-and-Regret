// ─────────────────────────────────────────────────────────────────────────────
// Rigged Numbers — host secretly picks a number in a range (via private modal,
// nobody else ever sees it), players guess by typing numbers in chat. First
// correct guess wins bragging rights. No prize, no expiry — stays open until
// someone finally gets it.
// ─────────────────────────────────────────────────────────────────────────────
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const E = require('../utils/emojis');
const { economy } = require('../utils/database');

const activeGames = new Map(); // channelId -> { hostId, hostName, min, max, secretNumber }

const MAX_RANGE_SPAN = 1000000;

function isHost(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}
function canCancel(member, hostId, userId) {
  if (userId === hostId) return true;
  return isHost(member);
}

function buildModal(channelId, min, max) {
  const modal = new ModalBuilder()
    .setCustomId(`rn_modal:${channelId}:${min}:${max}`)
    .setTitle('Rigged Numbers — Set Your Number');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('rn_number')
      .setLabel(`Pick a secret number between ${min} and ${max}`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 42')
      .setMinLength(1).setMaxLength(10).setRequired(true)
  ));
  return modal;
}

module.exports = {
  name: 'riggednumbers',
  activeGames,

  // ── Prefix commands ───────────────────────────────────────────────────────
  async handleCommand(message, args, command) {
    if (command !== 'riggednumbers' && command !== 'rignum') return;
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'cancel' || sub === 'stop') return this.cancelViaMessage(message);
    if (sub === 'status') return this.status(message);

    // start
    const min = parseInt(args[0]);
    const max = parseInt(args[1]);
    if (isNaN(min) || isNaN(max) || min >= max) {
      return message.reply(`${E.ERROR} Usage: \`!riggednumbers <min> <max>\`\nExample: \`!riggednumbers 1 100\``);
    }
    if (max - min > MAX_RANGE_SPAN) {
      return message.reply(`${E.ERROR} That range is way too big. Keep it under ${MAX_RANGE_SPAN.toLocaleString()}.`);
    }
    if (activeGames.has(message.channel.id)) {
      return message.reply(`${E.ERROR} There's already a Rigged Numbers game running in this channel.`);
    }

    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rn_setup:${message.channel.id}:${min}:${max}`)
        .setEmoji('<a:guess:1542348901217075200>').setLabel('Set My Secret Number')
        .setStyle(ButtonStyle.Primary)
    );
    return message.reply({
      content: `<a:purplesparkle:1479210541691175054> **${message.author.username}**, click below to privately set your secret number (**${min}-${max}**). Nobody else will see it.`,
      components: [btn],
    });
  },

  // ── Button: opens the private modal ──────────────────────────────────────
  async handleButton(interaction) {
    if (!interaction.customId.startsWith('rn_setup:')) return;
    const [, channelId, minStr, maxStr] = interaction.customId.split(':');
    if (activeGames.has(channelId)) {
      return interaction.reply({ content: `${E.ERROR} A Rigged Numbers game already started here.`, ephemeral: true });
    }
    await interaction.showModal(buildModal(channelId, minStr, maxStr));
  },

  // ── Modal submit: validate + start the game ──────────────────────────────
  async handleModal(interaction) {
    if (!interaction.customId.startsWith('rn_modal:')) return;
    const [, channelId, minStr, maxStr] = interaction.customId.split(':');
    const min = parseInt(minStr), max = parseInt(maxStr);
    const raw = interaction.fields.getTextInputValue('rn_number').trim();
    const secretNumber = parseInt(raw);

    if (isNaN(secretNumber) || String(secretNumber) !== raw.replace(/^\+/, '')) {
      return interaction.reply({ content: `${E.ERROR} That's not a whole number.`, ephemeral: true });
    }
    if (secretNumber < min || secretNumber > max) {
      return interaction.reply({ content: `${E.ERROR} Your number has to be between **${min}** and **${max}**.`, ephemeral: true });
    }
    if (activeGames.has(channelId)) {
      return interaction.reply({ content: `${E.ERROR} A Rigged Numbers game already started here.`, ephemeral: true });
    }

    activeGames.set(channelId, {
      hostId: interaction.user.id, hostName: interaction.user.username,
      min, max, secretNumber,
    });

    await interaction.reply({ content: `<:checkmark:1495666088417956002> Your secret number is locked in. Good luck to them.`, ephemeral: true });

    const channel = interaction.channel;
    await channel.send({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:guess:1542348901217075200> RIGGED NUMBERS')
        .setDescription(
          `**${interaction.user.username}** is thinking of a number between **${min}** and **${max}**.\n\n` +
          `Type your guess in chat — first person to nail it wins bragging rights (and eternal smugness).\n\n` +
          `<:purp_caveira50:1495665632845369354> Winner also gets **10% of their regret wiped**.\n\n` +
          `*No hints. No mercy. Good luck.*`
        )
        .setFooter({ text: 'Use !riggednumbers cancel to end this early' })
    ] });
  },

  // ── The guessing listener — called from index.js on every message ───────
  async handleGuess(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return;
    const content = message.content.trim();
    if (!/^-?\d+$/.test(content)) return;

    const guess = parseInt(content);
    if (guess === game.secretNumber) {
      activeGames.delete(message.channel.id);
      await message.react('<:checkmark:1495666088417956002>').catch(() => {});
      await message.react('<a:congrats:1478999022072238222>').catch(() => {});

      const currentRegret = await economy.getRegret(message.author.id).catch(() => 0);
      const reduction = Math.floor(currentRegret * 0.1);
      let regretLine = '';
      if (reduction > 0) {
        await economy.addRegret(message.author.id, -reduction).catch(() => {});
        regretLine = `\n\n<:purp_caveira50:1495665632845369354> **-${reduction} regret** for the win. Feels a little lighter, doesn't it?`;
      }

      await message.channel.send({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('<a:guess:1542348901217075200> RIGGED NUMBERS — SOLVED')
          .setDescription(`**${message.author.username}** correctly guessed **${game.secretNumber}**!\n\n**${game.hostName}**'s number has been cracked. New champion crowned.${regretLine}`)
      ] });
    } else {
      await message.react('<:wrong:1495666083594502174>').catch(() => {});
    }
  },

  // ── Cancel ────────────────────────────────────────────────────────────────
  async cancelViaMessage(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply(`${E.ERROR} No Rigged Numbers game running here.`);
    if (!canCancel(message.member, game.hostId, message.author.id)) {
      return message.reply(`${E.ERROR} Only the host or admins can cancel this.`);
    }
    activeGames.delete(message.channel.id);
    return message.reply(`<:checkmark:1495666088417956002> Rigged Numbers cancelled. The number was **${game.secretNumber}**.`);
  },

  // Used by the universal /cancel — returns a result object instead of replying directly
  async cancelViaUniversal(channel, userId, member) {
    const game = activeGames.get(channel.id);
    if (!game) return null;
    if (!canCancel(member, game.hostId, userId)) return { blocked: true };
    activeGames.delete(channel.id);
    return { blocked: false, secretNumber: game.secretNumber };
  },

  async status(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return message.reply(`${E.ERROR} No Rigged Numbers game running here.`);
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:guess:1542348901217075200> Rigged Numbers — Active')
        .setDescription(`Host: **${game.hostName}**\nRange: **${game.min}-${game.max}**\n\nGuess away!`)
    ] });
  },

  // ── Slash handler ─────────────────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    if (commandName !== 'riggednumbers') return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      if (min >= max) return interaction.reply({ content: `${E.ERROR} Min has to be less than max.`, ephemeral: true });
      if (max - min > MAX_RANGE_SPAN) return interaction.reply({ content: `${E.ERROR} That range is way too big. Keep it under ${MAX_RANGE_SPAN.toLocaleString()}.`, ephemeral: true });
      if (activeGames.has(interaction.channel.id)) return interaction.reply({ content: `${E.ERROR} There's already a Rigged Numbers game running in this channel.`, ephemeral: true });
      return interaction.showModal(buildModal(interaction.channel.id, min, max));
    }
    if (sub === 'cancel') {
      const result = await this.cancelViaUniversal(interaction.channel, interaction.user.id, interaction.member);
      if (!result) return interaction.reply({ content: `${E.ERROR} No Rigged Numbers game running here.`, ephemeral: true });
      if (result.blocked) return interaction.reply({ content: `${E.ERROR} Only the host or admins can cancel this.`, ephemeral: true });
      return interaction.reply(`<:checkmark:1495666088417956002> Rigged Numbers cancelled. The number was **${result.secretNumber}**.`);
    }
    if (sub === 'status') {
      const fakeMsg = { channel: interaction.channel, reply: (d) => interaction.reply(typeof d === 'string' ? { content: d, ephemeral: true } : { ...d, ephemeral: true }) };
      return this.status(fakeMsg);
    }
  },
};
