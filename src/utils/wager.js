// ─────────────────────────────────────────────────────────────────────────────
// wager.js — shared bet-picker UI. Every game with a wager uses this so the
// experience (and the underlying custom-amount modal) is identical everywhere.
// ─────────────────────────────────────────────────────────────────────────────
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

/**
 * Round a number down to a "clean" user-friendly value (nearest 10/50/100/500/1000
 * depending on magnitude), never rounding below 1 and never above the original value.
 */
function roundClean(n) {
  if (n < 100) return Math.max(1, Math.floor(n / 10) * 10);
  if (n < 1000) return Math.floor(n / 50) * 50;
  if (n < 10000) return Math.floor(n / 100) * 100;
  return Math.floor(n / 500) * 500;
}

/**
 * Build 3-4 clean quick-pick amounts spread across [min, max].
 */
function buildQuickPicks(min, max) {
  if (min >= max) return [min];
  const picks = new Set();
  picks.add(roundClean(min));
  picks.add(roundClean(min + (max - min) * 0.33));
  picks.add(roundClean(min + (max - min) * 0.66));
  picks.add(roundClean(max));
  return [...picks].filter(p => p >= min && p <= max).sort((a, b) => a - b).slice(0, 4);
}

function fmt(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

/**
 * Send a wager-picker message and resolve with the chosen amount.
 * @param {import('discord.js').Interaction} interaction - the button/slash interaction to reply to
 * @param {object} opts
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {string} opts.title
 * @param {string} opts.gamePrefix - unique short prefix for customIds, e.g. 'fafo'
 * @returns {Promise<number|null>} chosen wager, or null if it timed out
 */
async function promptWager(interaction, { min, max, title = 'Choose your wager', gamePrefix }) {
  const quickPicks = buildQuickPicks(min, max);
  const uid = interaction.user.id;
  const sessionTag = `${gamePrefix}_${uid}_${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    ...quickPicks.map(amt =>
      new ButtonBuilder().setCustomId(`wager_pick:${sessionTag}:${amt}`).setLabel(`${fmt(amt)} sins`).setStyle(ButtonStyle.Secondary)
    ),
    new ButtonBuilder().setCustomId(`wager_custom:${sessionTag}`).setLabel('Custom Amount').setStyle(ButtonStyle.Primary).setEmoji('<a:custom:1544882267409748028>'),
  );

  const msg = await interaction.reply({
    content: `<a:SINS:1522338223613804724> **${title}**\nRange: **${min.toLocaleString()} - ${max.toLocaleString()} sins**`,
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  return new Promise((resolve) => {
    const collector = msg.createMessageComponentCollector({
      filter: (i) => i.user.id === uid && i.customId.includes(sessionTag),
      time: 60000,
      max: 1,
    });

    collector.on('collect', async (btn) => {
      if (btn.customId.startsWith('wager_pick:')) {
        const amount = parseInt(btn.customId.split(':')[2]);
        await btn.update({ content: `<:checkmark:1495666088417956002> Wager locked in: **${amount.toLocaleString()} sins**`, components: [] });
        resolve(amount);
        return;
      }

      if (btn.customId.startsWith('wager_custom:')) {
        const modal = new ModalBuilder()
          .setCustomId(`wager_modal:${sessionTag}`)
          .setTitle('Custom Wager');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('wager_amount')
            .setLabel(`Amount (${min.toLocaleString()} - ${max.toLocaleString()})`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`e.g. ${min}`)
            .setRequired(true)
        ));
        await btn.showModal(modal);

        try {
          const modalSubmit = await btn.awaitModalSubmit({
            filter: (m) => m.user.id === uid && m.customId === `wager_modal:${sessionTag}`,
            time: 60000,
          });
          const raw = modalSubmit.fields.getTextInputValue('wager_amount').replace(/,/g, '').trim();
          const amount = parseInt(raw);
          if (isNaN(amount) || amount < min || amount > max) {
            await modalSubmit.reply({ content: `<:wrong:1495666083594502174> Enter a whole number between **${min.toLocaleString()}** and **${max.toLocaleString()}**. Try again.`, ephemeral: true });
            resolve(null);
            return;
          }
          await modalSubmit.reply({ content: `<:checkmark:1495666088417956002> Wager locked in: **${amount.toLocaleString()} sins**`, ephemeral: true });
          await msg.edit({ components: [] }).catch(() => {});
          resolve(amount);
        } catch {
          resolve(null);
        }
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        msg.edit({ content: '<:wrong:1495666083594502174> Wager selection timed out.', components: [] }).catch(() => {});
        resolve(null);
      }
    });
  });
}

module.exports = { promptWager, buildQuickPicks, roundClean };
