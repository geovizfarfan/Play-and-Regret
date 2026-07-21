// ─────────────────────────────────────────────────────────────────────────────
// Weekly Streak Items — earned every 7th consecutive /daily claim.
// Separate from Rumble Slaughter's backpack system and the Tic-Tac-Toe shop.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');
const { economy, db } = require('../utils/database');
const E = require('../utils/emojis');

// In-memory only — 30s window, no need to hit the DB on every single message in the server
const detonated = new Map(); // userId -> { channelId, expiresAt }

const ITEM_INFO = {
  sin_vacuum:   { name: 'Sin Vacuum',   emoji: `${E.BB_COIN}`, desc: 'Steal 8-15% of one target\'s sins.', targets: 1, rarity: 'Common' },
  shield:       { name: 'Shield',       emoji: '🛡️', desc: 'Blocks the next negative hit against you.', targets: 0, rarity: 'Common' },
  bomb:         { name: 'Bomb',         emoji: '💣', desc: 'Deal flat sins damage to one target.', targets: 1, rarity: 'Common' },
  knife:        { name: 'Knife',        emoji: '🔪', desc: 'Deal regret damage to one target.', targets: 1, rarity: 'Common' },
  roast:        { name: 'Roast',        emoji: '🔥', desc: 'Publicly roast a target — small reward for you, regret for them.', targets: 1, rarity: 'Common' },
  super_vacuum: { name: 'Super Vacuum', emoji: '🌪️', desc: 'Steal 8-12% of sins from 2-3 random active server members.', targets: 0, rarity: 'Rare' },
  detonator:    { name: 'Detonator',    emoji: '⏰', desc: 'Target gets 15s to solve a math problem or their messages get deleted for 30s.', targets: 1, rarity: 'Rare' },
};

const ROAST_LINES = [
  '@target really said something and the arena chose violence in response.',
  '@target has main character syndrome with a side character budget.',
  '@target\'s whole personality could fit in a fortune cookie. a small one.',
  '@target woke up and chose to be like that today.',
  '@target is proof that confidence and competence are not the same thing.',
  '@target\'s aura has buffering issues.',
  '@target really thought this was the moment. it was not.',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

module.exports = {
  ITEM_INFO,
  detonated,
  isDetonated(userId, channelId) {
    const entry = detonated.get(userId);
    if (!entry) return false;
    if (entry.channelId !== channelId || entry.expiresAt < Date.now()) {
      detonated.delete(userId);
      return false;
    }
    return true;
  },

  // ── View items ────────────────────────────────────────────────────────────
  async showItems(source, userId, username) {
    const items = await economy.getWeeklyItems(userId);
    const shield = await economy.getEffect(userId, 'shield');
    const lines = items.length
      ? items.map(i => {
          const info = ITEM_INFO[i.item_id];
          return `${info?.emoji || '❔'} **${info?.name || i.item_id}** x${i.qty} — *${info?.desc || ''}*`;
        }).join('\n')
      : 'No items yet — keep your `/daily` streak going. Every 7th day drops a random item.';

    const embed = new EmbedBuilder().setColor('#C9B1FF')
      .setTitle(`<a:purplesparkle:1479210541691175054> ${username}'s Items`)
      .setDescription(lines)
      .addFields({ name: 'Shield status', value: shield ? '🛡️ Active — blocks your next hit' : 'None active', inline: true })
      .setFooter({ text: 'Use with !use <item> @target (or !use shield / !use supervacuum for no-target items)' });

    return source.reply ? source.reply({ embeds: [embed] }) : source.send({ embeds: [embed] });
  },

  // ── Use an item ───────────────────────────────────────────────────────────
  async useItem(message, args) {
    const itemKey = (args[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    const aliasMap = {
      sinvacuum: 'sin_vacuum', vacuum: 'sin_vacuum',
      shield: 'shield',
      bomb: 'bomb',
      knife: 'knife',
      roast: 'roast',
      supervacuum: 'super_vacuum',
      detonator: 'detonator',
    };
    const itemId = aliasMap[itemKey];
    if (!itemId || !ITEM_INFO[itemId]) {
      return message.reply(`${E.ERROR} Unknown item. Use \`/items\` to see what you have: ` +
        Object.keys(ITEM_INFO).map(k => `\`${k}\``).join(', '));
    }

    const userId = message.author.id;
    const has = await economy.getWeeklyItemQty(userId, itemId);
    if (has < 1) {
      return message.reply(`${E.ERROR} You don't have a **${ITEM_INFO[itemId].name}**. Keep your \`/daily\` streak going — every 7th day drops one.`);
    }

    const info = ITEM_INFO[itemId];
    if (info.targets === 1) {
      const target = message.mentions?.users?.first();
      if (!target) return message.reply(`${E.ERROR} Mention who you're using **${info.name}** on: \`!use ${itemKey} @user\``);
      if (target.id === userId) return message.reply(`${E.ERROR} You can't use that on yourself.`);
      if (target.bot) return message.reply(`${E.ERROR} You can't target a bot.`);
      return this[`_use_${itemId}`](message, target);
    }

    return this[`_use_${itemId}`](message);
  },

  // ── Sin Vacuum ────────────────────────────────────────────────────────────
  async _use_sin_vacuum(message, target) {
    const userId = message.author.id;
    const shielded = await economy.getEffect(target.id, 'shield');
    await economy.useWeeklyItem(userId, 'sin_vacuum');

    if (shielded) {
      await economy.clearEffect(target.id, 'shield');
      return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
        .setTitle(`${E.BB_COIN} Sin Vacuum — Blocked!`)
        .setDescription(`**${target.username}**'s shield absorbed the hit. Nothing stolen.`)] });
    }

    const targetBalance = await economy.getBalance(target.id);
    const pct    = 0.08 + Math.random() * 0.07; // 8-15%
    const amount = Math.max(1, Math.floor(targetBalance * pct));

    await economy.removeFunds(target.id, amount, 'Hit by Sin Vacuum');
    await economy.addFunds(userId, amount, 'Sin Vacuum steal');

    return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle(`${E.BB_COIN} Sin Vacuum!`)
      .setDescription(`**${message.author.username}** vacuumed **${amount.toLocaleString()} sins** off **${target.username}**.`)] });
  },

  // ── Super Vacuum ──────────────────────────────────────────────────────────
  async _use_super_vacuum(message) {
    const userId = message.author.id;
    const guild  = message.guild;
    if (!guild) return message.reply(`${E.ERROR} This only works in a server.`);

    // Pull a pool of known economy users in this guild (active or inactive) — anyone the bot has a balance row for
    const pool = await db.all(
      `SELECT u.user_id, u.balance FROM users u WHERE u.user_id != ? AND u.balance > 0 ORDER BY RANDOM() LIMIT 10`,
      [userId]
    ).catch(() => []);

    if (!pool.length) return message.reply(`${E.ERROR} No valid targets found on this server yet.`);

    const numTargets = Math.min(pool.length, 2 + Math.floor(Math.random() * 2)); // 2-3
    const chosen = pool.slice(0, numTargets);
    await economy.useWeeklyItem(userId, 'super_vacuum');

    let totalStolen = 0;
    const lines = [];
    for (const row of chosen) {
      const shielded = await economy.getEffect(row.user_id, 'shield');
      if (shielded) {
        await economy.clearEffect(row.user_id, 'shield');
        lines.push(`🛡️ <@${row.user_id}> blocked it with a shield.`);
        continue;
      }
      const pct    = 0.08 + Math.random() * 0.04; // 8-12%
      const amount = Math.max(1, Math.floor(row.balance * pct));
      await economy.removeFunds(row.user_id, amount, 'Hit by Super Vacuum');
      totalStolen += amount;
      lines.push(`${E.BB_COIN} <@${row.user_id}> — **${amount.toLocaleString()} sins**`);
    }
    await economy.addFunds(userId, totalStolen, 'Super Vacuum steal');

    return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('🌪️ SUPER VACUUM!')
      .setDescription(`**${message.author.username}** unleashed the Super Vacuum!\n\n${lines.join('\n')}\n\n**Total stolen: ${totalStolen.toLocaleString()} sins**`)] });
  },

  // ── Bomb ──────────────────────────────────────────────────────────────────
  async _use_bomb(message, target) {
    const userId = message.author.id;
    const shielded = await economy.getEffect(target.id, 'shield');
    await economy.useWeeklyItem(userId, 'bomb');

    if (shielded) {
      await economy.clearEffect(target.id, 'shield');
      return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('💣 Bomb — Defused!')
        .setDescription(`**${target.username}**'s shield absorbed the blast.`)] });
    }

    const amount = 100 + Math.floor(Math.random() * 250); // 100-350 flat
    await economy.removeFunds(target.id, amount, 'Hit by Bomb');

    return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('💣 BOOM!')
      .setDescription(`**${message.author.username}** detonated a bomb on **${target.username}** — lost **${amount.toLocaleString()} sins**.\n\n*(this one's pure sabotage — you don't get the sins)*`)] });
  },

  // ── Knife ─────────────────────────────────────────────────────────────────
  async _use_knife(message, target) {
    const userId = message.author.id;
    const shielded = await economy.getEffect(target.id, 'shield');
    await economy.useWeeklyItem(userId, 'knife');

    if (shielded) {
      await economy.clearEffect(target.id, 'shield');
      return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('🔪 Knife — Blocked!')
        .setDescription(`**${target.username}**'s shield deflected it.`)] });
    }

    const regretAmt = 80 + Math.floor(Math.random() * 120); // 80-200
    await economy.addRegret(target.id, regretAmt);

    return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('🔪 Stabbed!')
      .setDescription(`**${message.author.username}** knifed **${target.username}** — **+${regretAmt} regret**.`)] });
  },

  // ── Roast ─────────────────────────────────────────────────────────────────
  async _use_roast(message, target) {
    const userId = message.author.id;
    await economy.useWeeklyItem(userId, 'roast');

    const line   = pick(ROAST_LINES).replace(/@target/g, `**${target.username}**`);
    const reward = 50 + Math.floor(Math.random() * 100); // 50-150 for the roaster
    const regretAmt = 20 + Math.floor(Math.random() * 30); // 20-50 for the target
    await economy.addFunds(userId, reward, 'Roast reward');
    await economy.addRegret(target.id, regretAmt);

    return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('🔥 ROASTED')
      .setDescription(`${line}\n\n**${message.author.username}** earns **${reward} sins** for the bit. **${target.username}** gains **${regretAmt} regret** for existing.`)] });
  },

  // ── Shield ────────────────────────────────────────────────────────────────
  async _use_shield(message) {
    const userId = message.author.id;
    const existing = await economy.getEffect(userId, 'shield');
    if (existing) return message.reply(`${E.ERROR} You already have an active shield.`);

    await economy.useWeeklyItem(userId, 'shield');
    await economy.setEffect(userId, 'shield', message.guild?.id, message.channel.id, null); // no expiry — lasts until consumed

    return message.reply({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('🛡️ Shield Up')
      .setDescription(`**${message.author.username}** raised a shield. The next Vacuum, Super Vacuum, Bomb, or Knife aimed at you will be blocked.`)] });
  },

  // ── Detonator ─────────────────────────────────────────────────────────────
  async _use_detonator(message, target) {
    const userId = message.author.id;
    await economy.useWeeklyItem(userId, 'detonator');

    const a = 2 + Math.floor(Math.random() * 12);
    const b = 2 + Math.floor(Math.random() * 12);
    const ops = ['+', '-', '×'];
    const op = pick(ops);
    let answer;
    if (op === '+') answer = a + b;
    else if (op === '-') answer = a - b;
    else answer = a * b;

    const challengeMsg = await message.channel.send({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setTitle('⏰ DETONATOR ARMED')
      .setDescription(
        `<@${target.id}>, **${message.author.username}** planted a detonator on you!\n\n` +
        `Solve this in **15 seconds** or your messages get deleted for **30 seconds**:\n\n` +
        `## ${a} ${op} ${b} = ?`
      )] });

    const filter = m => m.author.id === target.id;
    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

    let defused = false;
    collector.on('collect', async m => {
      const guess = parseInt(m.content.trim());
      if (guess === answer) {
        defused = true;
        await m.react('<:checkmark:1495666088417956002>').catch(() => {});
        await message.channel.send({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('✅ DEFUSED')
          .setDescription(`**${target.username}** solved it in time. Detonator disarmed.`)] });
      }
    });

    collector.on('end', async () => {
      if (defused) return;
      detonated.set(target.id, { channelId: message.channel.id, expiresAt: Date.now() + 30000 });
      setTimeout(() => detonated.delete(target.id), 30000);
      await message.channel.send({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
        .setTitle('💥 BOOM')
        .setDescription(`**${target.username}** didn't solve it in time. The answer was **${answer}**.\n\nTheir messages in this channel will vanish for the next **30 seconds**.`)] });
    });
  },
};
