// ─────────────────────────────────────────────────────────────────────────────
// Gambling — tiered risk. Bet sins, pick a risk tier, win big or lose it all.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { economy } = require('../utils/database');
const E = require('../utils/emojis');

const TIERS = {
  safe:     { label: 'Safe Bet',     winChance: 0.65, payout: 1.45, color: '#C9B1FF' },
  risky:    { label: 'Risky Bet',    winChance: 0.40, payout: 2.3,  color: '#C9B1FF' },
  reckless: { label: 'Reckless Bet', winChance: 0.20, payout: 4.4,  color: '#C9B1FF' },
};

const MIN_BET = 20;

const WIN_LINES = [
  'The house blinked. You walked away richer.',
  'Somehow, against every reasonable expectation, you won.',
  'The odds said no. You said try me.',
  'Regret can wait — today you\'re up.',
];
const LOSE_LINES = [
  'The house always wins. Today was no exception.',
  'That sin is gone. Grieve responsibly.',
  'You gambled. You regretted it. Name a more iconic duo.',
  'Well, that\'s one way to make a donation.',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

module.exports = {
  TIERS,

  async gamble(message, args) {
    const bet     = parseInt(args[0]);
    const tierKey = (args[1] || '').toLowerCase();

    if (!TIERS[tierKey]) {
      return message.reply(
        `${E.ERROR} Usage: \`!gamble <amount> <safe|risky|reckless>\`\n\n` +
        Object.entries(TIERS).map(([k, t]) => `**${t.label}** (\`${k}\`) — ${Math.round(t.winChance*100)}% win chance, ${t.payout}x payout`).join('\n')
      );
    }
    if (isNaN(bet) || bet < MIN_BET) {
      return message.reply(`${E.ERROR} Minimum bet is **${MIN_BET} sins**.`);
    }

    const balance = await economy.getBalance(message.author.id);
    if (balance < bet) {
      return message.reply(`${E.ERROR} You only have **${balance.toLocaleString()} sins**.`);
    }

    const tier = TIERS[tierKey];
    const won  = Math.random() < tier.winChance;

    if (won) {
      const winnings = Math.floor(bet * tier.payout) - bet; // net gain
      await economy.addFunds(message.author.id, winnings, `Gamble win (${tierKey})`);
      return message.reply({ embeds: [new EmbedBuilder().setColor(tier.color)
        .setTitle(`${E.BB_COIN} ${tier.label} — YOU WON`)
        .setDescription(`${pick(WIN_LINES)}\n\nBet **${bet.toLocaleString()}** → won **+${winnings.toLocaleString()} sins** (${tier.payout}x)`)
      ] });
    } else {
      await economy.removeFunds(message.author.id, bet, `Gamble loss (${tierKey})`);
      const regretAmt = 15 + Math.floor(Math.random() * 20);
      await economy.addRegret(message.author.id, regretAmt);
      return message.reply({ embeds: [new EmbedBuilder().setColor(tier.color)
        .setTitle(`${E.BB_COIN} ${tier.label} — YOU LOST`)
        .setDescription(`${pick(LOSE_LINES)}\n\nLost **${bet.toLocaleString()} sins** · +${regretAmt} regret`)
      ] });
    }
  },
};
