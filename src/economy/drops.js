/**
 * drops.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Two drop types:
 *
 * 🎒 Big Bag (admin only)
 *   Admin throws a bag of X sins. Anyone who clicks gets a random slice.
 *   Each clicker gets a random amount between minShare and maxShare.
 *   Bag depletes as people claim. Expires after 2 minutes — leftover → jackpot.
 *
 * 💸 Quick Drop (anyone)
 *   User drops X sins. First person to click claims the whole thing.
 *   Expires after 2 minutes — unclaimed → jackpot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy } = require('../../utils/database');
const jackpot     = require('../../utils/jackpot');
const E           = require('../../utils/emojis');

const DROP_TTL_MS        = 2 * 60 * 1000;   // 2 minutes
const DROP_COOLDOWN_MS   = 1 * 60 * 60 * 1000; // 1 hour for drop
const BIGBAG_COOLDOWN_MS = 5 * 60 * 60 * 1000; // 5 hours for bigbag
const dropCooldowns   = new Map();
const bigbagCooldowns = new Map();

const EXPIRED_QUIPS = [
  'It vanished like your motivation on a Monday.',
  'Gone. Just like your will to be productive.',
  'Disappeared into thin air, like your last relationship.',
  'Nobody wanted it. Story of its life.',
  'It evaporated. Much like your partner did.',
  'Poof. Gone. Like your gym streak.',
  'Vanished like your high school best friend after graduation.',
  'Into the void it goes. The jackpot said thank you.',
  'Nobody showed up. The sins felt personally attacked.',
  'It left. You can\'t blame it.',
];
const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';

function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

function isOwner(userId) {
  return userId === process.env.OWNER_ID;
}

function getCooldownLeft(map, userId, ms) {
  const last = map.get(userId) || 0;
  const remaining = ms - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

// ─── Big Bag ──────────────────────────────────────────────────────────────────
async function launchBigBag(channel, totalAmount, droppedBy) {
  const claimId   = `bigbag_${channel.id}_${Date.now()}`;
  const claimers  = new Set();
  let   remaining = totalAmount;
  let   expired   = false;

  const makeEmbed = (remaining, claimers, done = false) => {
    const pct  = Math.round(((totalAmount - remaining) / totalAmount) * 100);
    const bar  = buildBar(pct);
    return new EmbedBuilder()
      .setColor(done ? '#555555' : '#C9B1FF')
      .setDescription(done
        ? `<:Sins:1478993005187698789> **Big Bag — Closed!**\n\n${claimers > 0 ? `**${claimers} member${claimers !== 1 ? 's' : ''}** grabbed from the bag.` : 'Nobody grabbed anything.'}\n${remaining > 0 ? `<a:583778moneyfly:1479271753392853023> **${remaining.toLocaleString()} sins** unclaimed → <a:jackpot:1479203793806557385>` : '✅ Bag fully emptied!'}`
        : `<:Sins:1478993005187698789> **Big Bag Drop!** **${droppedBy}** threw a bag of sins! <a:moneybag:1479268556687540345>\n\nClick fast — each grab gets a random slice! <a:run:1479270296140910653>\n\n<a:moneybag:1479268556687540345> **${remaining.toLocaleString()} sins** remaining\n${bar} ${pct}% claimed\n\n<:countdown:1479295748884529215> Expires in 2 mins`)
      .addFields(
        { name: '<a:moneybag:1479268556687540345> Total Bag',  value: `${totalAmount.toLocaleString()} sins`, inline: true },
        { name: '<:members:1479293571709534311> Claimers',     value: `${claimers}`,                          inline: true },
      )
      .setFooter({ text: done ? 'Drop over.' : '🎒 One grab per person!' });
  };

  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(claimId)
      .setLabel('🎒 Grab from the Bag!')
      .setStyle(ButtonStyle.Primary)
  );

  const msg = await channel.send({ embeds: [makeEmbed(remaining, 0)], components: [btn] });

  const collector = msg.createMessageComponentCollector({ time: DROP_TTL_MS });

  collector.on('collect', async (interaction) => {
    if (interaction.customId !== claimId) return;
    await interaction.deferUpdate();

    if (expired || remaining <= 0) {
      return interaction.followUp({ content: `🎒 The bag is empty!`, ephemeral: true });
    }
    if (claimers.has(interaction.user.id)) {
      return interaction.followUp({ content: `⚠️ You already grabbed from this bag!`, ephemeral: true });
    }

    // Random slice — between 5% and 25% of remaining, min 1
    const minGrab = Math.max(1, Math.floor(remaining * 0.05));
    const maxGrab = Math.min(remaining, Math.floor(remaining * 0.25));
    const grab    = maxGrab <= minGrab ? remaining : Math.floor(Math.random() * (maxGrab - minGrab + 1)) + minGrab;
    const actual  = Math.min(grab, remaining);

    remaining -= actual;
    claimers.add(interaction.user.id);

    await economy.getUser(interaction.user.id, interaction.user.username);
    await economy.addFunds(interaction.user.id, actual, 'Big Bag grab');

    await interaction.followUp({
      content: `🎒 **${interaction.user.username}** grabbed **${actual.toLocaleString()} sins** from the bag!`,
    });

    if (remaining <= 0) {
      collector.stop('empty');
    } else {
      await msg.edit({ embeds: [makeEmbed(remaining, claimers.size)], components: [btn] }).catch(() => {});
    }
  });

  collector.on('end', async (_, reason) => {
    expired = true;
    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(claimId)
        .setLabel('🎒 Bag Closed')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    if (remaining > 0) {
      await jackpot.addToDrawFund(remaining);
    }

    await msg.edit({
      embeds: [makeEmbed(remaining, claimers.size, true)],
      components: [disabledBtn],
    }).catch(() => {});

    if (reason === 'time' && remaining > 0) {
      const bagQuip = EXPIRED_QUIPS[Math.floor(Math.random() * EXPIRED_QUIPS.length)];
      await channel.send(
        `<a:583778moneyfly:1479271753392853023> **Drop Expired** Nobody grabbed the remaining **${remaining.toLocaleString()}** <:Sins:1478993005187698789>. ${bagQuip} <a:583778moneyfly:1479271753392853023>`
      );
    }
  });
}

// ─── Quick Drop ───────────────────────────────────────────────────────────────
async function launchQuickDrop(channel, amount, dropper) {
  const claimId = `quickdrop_${channel.id}_${Date.now()}`;
  let   claimed = false;

  const makeEmbed = (done = false, claimedBy = null, quip = null) => new EmbedBuilder()
    .setColor(done ? '#555555' : '#C9B1FF')
    .setDescription(done
      ? (claimedBy
        ? `<a:congrats:1478999022072238222> **Drop CLAIMED!**\n**${claimedBy}** snatched **${amount.toLocaleString()}** <:Sins:1478993005187698789> from <@${dropper.id}>! <a:moneybag:1479268556687540345>`
        : `<a:583778moneyfly:1479271753392853023> **Drop Expired**\nNobody claimed the **${amount.toLocaleString()}** <:Sins:1478993005187698789> in time. ${quip || 'It vanished into thin air!'} <a:583778moneyfly:1479271753392853023>`)
      : `<:Sins:1478993005187698789> **sins DROP!** <@${dropper.id}> dropped **${amount.toLocaleString()} sins**! <a:moneybag:1479268556687540345>\n\nFirst to press the button claims it all! <a:run:1479270296140910653>\n\n⏳ Drop expires in 2 minutes`)
    .setFooter({ text: done ? 'Drop over.' : 'One winner only!' });

  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(claimId)
      .setLabel('💸 Claim it!')
      .setStyle(ButtonStyle.Success)
  );

  const msg = await channel.send({ embeds: [makeEmbed()], components: [btn] });

  const collector = msg.createMessageComponentCollector({ time: DROP_TTL_MS });

  collector.on('collect', async (interaction) => {
    if (interaction.customId !== claimId) return;
    if (claimed) return;
    if (interaction.user.id === dropper.id) {
      await interaction.deferUpdate();
      return interaction.followUp({ content: `⚠️ You can't claim your own drop!`, ephemeral: true });
    }

    await interaction.deferUpdate();
    claimed = true;

    await economy.getUser(interaction.user.id, interaction.user.username);
    await economy.addFunds(interaction.user.id, amount, `Quick Drop from ${dropper.username}`);

    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(claimId)
        .setLabel('💸 Claimed!')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    await msg.edit({ embeds: [makeEmbed(true, interaction.user.username)], components: [disabledBtn] }).catch(() => {});
    await interaction.followUp({
      content: `<a:congrats:1478999022072238222> **Drop CLAIMED!** **${interaction.user.username}** snatched **${amount.toLocaleString()}** <:Sins:1478993005187698789> from ${dropper.username}! <a:moneybag:1479268556687540345>`,
    });

    collector.stop('claimed');
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'claimed' || claimed) return;

    await jackpot.addToDrawFund(amount);

    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(claimId)
        .setLabel('💸 Expired')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    const quip = EXPIRED_QUIPS[Math.floor(Math.random() * EXPIRED_QUIPS.length)];
    await msg.edit({ embeds: [makeEmbed(true, null, quip)], components: [disabledBtn] }).catch(() => {});
  });
}

// ─── Build a simple progress bar ─────────────────────────────────────────────
function buildBar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'drops',

  async handleSlash(interaction, commandName) {
    if (commandName === 'bigbag') {
      try {
        await interaction.deferReply({ ephemeral: true });
        if (!hasHostRole(interaction.member)) {
          return interaction.editReply(`<:wrong:1495666083594502174> Only admins and **${EVENT_HOST_ROLE}** can throw a Big Bag!`);
        }
        // Cooldown check (owner exempt)
        if (!isOwner(interaction.user.id)) {
          const left = getCooldownLeft(bigbagCooldowns, interaction.user.id, BIGBAG_COOLDOWN_MS);
          if (left > 0) {
            const h = Math.floor(left / 3_600_000);
            const m = Math.floor((left % 3_600_000) / 60_000);
            return interaction.editReply(`<:wrong:1495666083594502174> Big Bag cooldown: **${h}h ${m}m** remaining.`);
          }
          bigbagCooldowns.set(interaction.user.id, Date.now());
        }
        const amount = interaction.options.getInteger('amount');
        await economy.getUser(interaction.user.id, interaction.user.username);
        const bal = await economy.getBalance(interaction.user.id);
        if (bal < amount) return interaction.editReply(`<:wrong:1495666083594502174> You need **${amount.toLocaleString()} sins** but only have **${bal.toLocaleString()}**!`);
        await economy.removeFunds(interaction.user.id, amount, 'Big Bag drop');
        await interaction.editReply(`<:checkmark:1495666088417956002> Big Bag of **${amount.toLocaleString()} sins** thrown!`);
        await launchBigBag(interaction.channel, amount, interaction.user.username);
      } catch (err) {
        console.error('[bigbag error]', err.stack || err);
        await interaction.editReply(`❌ Error: ${err.message}`).catch(() =>
          interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true }).catch(() => {})
        );
      }

    } else if (commandName === 'drop') {
      const amount = interaction.options.getInteger('amount');
      await interaction.deferReply({ ephemeral: true });
      // Cooldown check (owner exempt)
      if (!isOwner(interaction.user.id)) {
        const left = getCooldownLeft(dropCooldowns, interaction.user.id, DROP_COOLDOWN_MS);
        if (left > 0) {
          const h = Math.floor(left / 3_600_000);
          const m = Math.floor((left % 3_600_000) / 60_000);
          return interaction.editReply(`<:wrong:1495666083594502174> Drop cooldown: **${h}h ${m}m** remaining.`);
        }
        dropCooldowns.set(interaction.user.id, Date.now());
      }
      await economy.getUser(interaction.user.id, interaction.user.username);
      const bal = await economy.getBalance(interaction.user.id);
      if (bal < amount) return interaction.editReply(`<:wrong:1495666083594502174> You need **${amount.toLocaleString()} sins** but only have **${bal.toLocaleString()}**!`);
      await economy.removeFunds(interaction.user.id, amount, 'Quick Drop');
      await interaction.editReply(`<:checkmark:1495666088417956002> You dropped **${amount.toLocaleString()} sins**!`);
      await launchQuickDrop(interaction.channel, amount, interaction.user);
    }
  },

  async handleCommand(message, args, command) {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1) return message.reply(`❌ Specify an amount! e.g. \`!bigbag 500\``);

    if (command === 'bigbag') {
      if (!hasHostRole(message.member)) return message.reply(`<:wrong:1495666083594502174> Only admins and **${EVENT_HOST_ROLE}** can throw a Big Bag!`);
      if (!isOwner(message.author.id)) {
        const left = getCooldownLeft(bigbagCooldowns, message.author.id, BIGBAG_COOLDOWN_MS);
        if (left > 0) {
          const h = Math.floor(left / 3_600_000);
          const m = Math.floor((left % 3_600_000) / 60_000);
          return message.reply(`<:wrong:1495666083594502174> Big Bag cooldown: **${h}h ${m}m** remaining.`);
        }
        bigbagCooldowns.set(message.author.id, Date.now());
      }
      await economy.getUser(message.author.id, message.author.username);
      const bal = await economy.getBalance(message.author.id);
      if (bal < amount) return message.reply(`<:wrong:1495666083594502174> You need **${amount.toLocaleString()} sins** but only have **${bal.toLocaleString()}**!`);
      await economy.removeFunds(message.author.id, amount, 'Big Bag drop');
      await launchBigBag(message.channel, amount, message.author.username);

    } else if (command === 'drop') {
      if (!isOwner(message.author.id)) {
        const left = getCooldownLeft(dropCooldowns, message.author.id, DROP_COOLDOWN_MS);
        if (left > 0) {
          const h = Math.floor(left / 3_600_000);
          const m = Math.floor((left % 3_600_000) / 60_000);
          return message.reply(`<:wrong:1495666083594502174> Drop cooldown: **${h}h ${m}m** remaining.`);
        }
        dropCooldowns.set(message.author.id, Date.now());
      }
      await economy.getUser(message.author.id, message.author.username);
      const bal = await economy.getBalance(message.author.id);
      if (bal < amount) return message.reply(`<:wrong:1495666083594502174> You need **${amount.toLocaleString()} sins** but only have **${bal.toLocaleString()}**!`);
      await economy.removeFunds(message.author.id, amount, 'Quick Drop');
      await launchQuickDrop(message.channel, amount, message.author);
    }
  },
};
