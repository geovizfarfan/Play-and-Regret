// ─────────────────────────────────────────────────────────────────────────────
// Entry Fee Toggle — per-game on/off switch for whether joining costs sins.
// Default for every game is enabled=true. When disabled, entry becomes fully
// free (bet forced to 0, no prize pool) — the games themselves already handle
// that once this flag says off.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { economy } = require('../utils/database');
const E = require('../utils/emojis');

const GAMES = [
  { name: 'rumbleslaughter', label: 'Rumble Slaughter' },
  { name: 'cuarenta',        label: 'Cuarenta' },
  { name: 'blackjack',       label: 'Blackjack' },
  { name: 'loteria',         label: 'Lotería' },
  { name: 'findthecuy',      label: 'Find the Cuy' },
  { name: 'memory',          label: 'Memory' },
  { name: 'tictactoe',       label: 'Tic-Tac-Bruh' },
];
const GAME_NAMES = GAMES.map(g => g.name);
const ALIASES = { rs: 'rumbleslaughter', ttb: 'tictactoe', ttt: 'tictactoe', tictacbruh: 'tictactoe', cuy: 'findthecuy' };

function isHost(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';
  return member.roles.cache.some(r => r.name === hostRole);
}
function resolveGame(input) {
  const key = (input || '').toLowerCase().trim();
  if (GAME_NAMES.includes(key)) return key;
  if (ALIASES[key]) return ALIASES[key];
  return null;
}

module.exports = {
  name: 'entryfee',
  GAME_NAMES,

  async handleCommand(message, args, command) {
    if (command !== 'entryfee') return;
    if (!isHost(message.member)) return message.reply(`${E.ERROR} Staff only.`);

    const sub = (args[0] || '').toLowerCase();
    if (sub === 'status') return this.status(message);

    const gameKey = resolveGame(args[0]);
    const state   = (args[1] || '').toLowerCase();
    if (!gameKey || !['on', 'off'].includes(state)) {
      return message.reply(
        `${E.ERROR} Usage: \`!entryfee <game> <on|off>\` or \`!entryfee status\`\n` +
        `Games: ${GAMES.map(g => `\`${g.name}\``).join(', ')}`
      );
    }

    await economy.setEntryFeeEnabled(gameKey, state === 'on', message.author.id);
    const label = GAMES.find(g => g.name === gameKey).label;
    return message.reply(
      state === 'on'
        ? `<:checkmark:1495666088417956002> **${label}** entry fee is back **on**. Host picks the bet like normal.`
        : `<:checkmark:1495666088417956002> **${label}** is now **free to play** — no entry fee, no prize pool.`
    );
  },

  async status(message) {
    const configs = await economy.getAllEntryFeeConfigs(GAME_NAMES);
    const lines = configs.map(c => {
      const label = GAMES.find(g => g.name === c.name).label;
      return `${c.enabled ? '<:checkmark:1495666088417956002>' : '<:wrong:1495666083594502174>'} **${label}** — ${c.enabled ? 'entry fee ON' : 'FREE to play'}`;
    });
    return message.reply({ embeds: [
      new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('<a:SINS:1522338223613804724> Entry Fee Status')
        .setDescription(lines.join('\n'))
        .setFooter({ text: '!entryfee <game> <on|off> to change' })
    ]});
  },

  async handleSlash(interaction) {
    if (!isHost(interaction.member)) return interaction.reply({ content: `${E.ERROR} Staff only.`, ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const fakeMsg = { reply: (d) => interaction.reply(typeof d === 'string' ? { content: d, ephemeral: true } : { ...d, ephemeral: true }) };
      return this.status(fakeMsg);
    }

    const gameKey = interaction.options.getString('game');
    const state   = interaction.options.getString('state');
    await economy.setEntryFeeEnabled(gameKey, state === 'on', interaction.user.id);
    const label = GAMES.find(g => g.name === gameKey).label;
    return interaction.reply(
      state === 'on'
        ? `<:checkmark:1495666088417956002> **${label}** entry fee is back **on**. Host picks the bet like normal.`
        : `<:checkmark:1495666088417956002> **${label}** is now **free to play** — no entry fee, no prize pool.`
    );
  },
};
