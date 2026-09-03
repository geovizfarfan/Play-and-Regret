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
      min, max, secretNumber, phase: 'lobby', members: new Map(),
    });

    await interaction.reply({ content: `<:checkmark:1495666088417956002> Your secret number is locked in. Click Start Game whenever you're ready to open guessing.`, ephemeral: true });

    const channel = interaction.channel;
    const lobbyEmbed = new EmbedBuilder()
      .setColor('#C9B1FF')
      .setTitle('<a:guess:1542348901217075200> RIGGED NUMBERS — LOBBY')
      .setDescription(
        `**${interaction.user.username}** is thinking of a number between **${min}** and **${max}**.\n\n` +
        `Click Join if you're in, then wait for the host to start.`
      )
      .addFields({ name: '<:member:1495666085121491024> Joined', value: '**0** players' })
      .setFooter({ text: 'Use !cancel to end this early' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rn_join:${channelId}`).setLabel('Join').setEmoji('<a:guess:1542348901217075200>').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rn_viewmembers:${channelId}`).setLabel('View Members').setEmoji('<:member:1495666085121491024>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rn_start:${channelId}`).setLabel('Start Game').setEmoji('<a:CheckCheckmarkSticker:1532595713010040972>').setStyle(ButtonStyle.Success),
    );

    const lobbyMsg = await channel.send({ embeds: [lobbyEmbed], components: [row] });
    activeGames.get(channelId).lobbyMsg = lobbyMsg;
  },

  // ── Lobby buttons: join / view members / start ───────────────────────────
  async handleLobbyButton(interaction) {
    const [action, channelId] = interaction.customId.split(':');
    const game = activeGames.get(channelId);
    if (!game) return interaction.reply({ content: `${E.ERROR} This Rigged Numbers game isn't active anymore.`, ephemeral: true });

    if (action === 'rn_join') {
      if (game.phase !== 'lobby') return interaction.reply({ content: `${E.ERROR} This game already started.`, ephemeral: true });
      if (game.members.has(interaction.user.id)) return interaction.reply({ content: `<a:Warning:1497476844860215366> You already joined.`, ephemeral: true });
      game.members.set(interaction.user.id, interaction.user.username);
      if (game.lobbyMsg?.embeds?.[0]) {
        const updated = EmbedBuilder.from(game.lobbyMsg.embeds[0]).spliceFields(0, 1, {
          name: '<:member:1495666085121491024> Joined', value: `**${game.members.size}** player${game.members.size !== 1 ? 's' : ''}`,
        });
        await game.lobbyMsg.edit({ embeds: [updated] }).catch(() => {});
      }
      return interaction.reply({ content: `<:checkmark:1495666088417956002> You're in! Wait for the host to start.`, ephemeral: true });
    }

    if (action === 'rn_viewmembers') {
      const list = game.members.size ? [...game.members.values()].map((n, i) => `**${i + 1}.** ${n}`).join('\n') : 'Nobody yet.';
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF').setTitle('<:member:1495666085121491024> Joined').setDescription(list)
      ], ephemeral: true });
    }

    if (action === 'rn_start') {
      if (interaction.user.id !== game.hostId && !isHost(interaction.member)) {
        return interaction.reply({ content: `${E.ERROR} Only the host or admins can start this.`, ephemeral: true });
      }
      if (game.phase !== 'lobby') return interaction.reply({ content: `${E.ERROR} Already started.`, ephemeral: true });
      game.phase = 'active';
      await interaction.reply({ content: `<:checkmark:1495666088417956002> Guessing is open!`, ephemeral: true });
      await game.lobbyMsg?.edit({ components: [] }).catch(() => {});
      await interaction.channel.send({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('<a:guess:1542348901217075200> RIGGED NUMBERS')
          .setDescription(
            `**${game.hostName}** is thinking of a number between **${game.min}** and **${game.max}**.\n\n` +
            `Type your guess in chat — first person to nail it wins bragging rights (and eternal smugness).\n\n` +
            `*Wrong guesses get a hint. No mercy otherwise. Good luck.*`
          )
          .setFooter({ text: 'Use !cancel to end this early' })
      ] });
    }
  },

  // ── The guessing listener — called from index.js on every message ───────
  async handleGuess(message) {
    const game = activeGames.get(message.channel.id);
    if (!game || game.phase !== 'active') return;
    const content = message.content.trim();
    if (!/^-?\d+$/.test(content)) return;

    const guess = parseInt(content);
    if (guess === game.secretNumber) {
      activeGames.delete(message.channel.id);
      await message.react('<:checkmark:1495666088417956002>').catch(() => {});
      await message.react('<a:congrats:1478999022072238222>').catch(() => {});

      await message.channel.send({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('<a:guess:1542348901217075200> RIGGED NUMBERS — SOLVED')
          .setDescription(`**${message.author.username}** correctly guessed **${game.secretNumber}**!\n\n**${game.hostName}**'s number has been cracked. New champion crowned.`)
      ] });
    } else {
      await message.react(guess < game.secretNumber ? '<a:higher:1544885549662470165>' : '<a:lower:1544885551126155324>').catch(() => {});
    }
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
    if (sub === 'status') {
      const fakeMsg = { channel: interaction.channel, reply: (d) => interaction.reply(typeof d === 'string' ? { content: d, ephemeral: true } : { ...d, ephemeral: true }) };
      return this.status(fakeMsg);
    }
  },
};
