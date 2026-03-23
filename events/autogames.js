/**
 * autogames.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hunger Games & Rumble with:
 *   1. Single unified !signup command + one button — players use one thing
 *   2. Role-gated start — only EVENT_HOST_ROLE can launch events
 *   3. Auto-schedule — cron fires events on a configurable schedule
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const { economy, stats } = require('../utils/database');
const jackpot = require('../utils/jackpot');
const E = require('../utils/emojis');

// ─── Config (from .env) ───────────────────────────────────────────────────────
const EVENT_HOST_ROLE    = process.env.EVENT_HOST_ROLE    || 'Event Host';
const AUTO_EVENT_ENABLED = process.env.AUTO_EVENT_ENABLED === 'true';
const AUTO_EVENT_CRON    = process.env.AUTO_EVENT_CRON    || '0 20 * * *'; // default 8 PM daily
const AUTO_EVENT_BET     = parseInt(process.env.AUTO_EVENT_BET)    || 50;
const AUTO_EVENT_TYPE    = (process.env.AUTO_EVENT_TYPE   || 'random').toLowerCase();
const SIGNUP_SECONDS     = parseInt(process.env.SIGNUP_SECONDS)    || 120;
const MIN_PLAYERS        = parseInt(process.env.MIN_PLAYERS)       || 4;

// ─── Active event state ───────────────────────────────────────────────────────
const activeEvents = new Map(); // channelId → event object

// ─── Narrative pools ──────────────────────────────────────────────────────────
const HG = {
  kill: [
    '{A} tracked {B} to their camp and eliminated them before dawn.',
    '{A} poisoned {B}\'s water supply. {B} didn\'t make it.',
    '{A} lured {B} into a trap and struck from the shadows.',
    '{A} outmaneuvered {B} in a fierce battle near the river.',
    '{A} ambushed {B} while they slept.',
    '{A} and {B} fought for supplies — only {A} walked away.',
    '{A} pushed {B} off the edge of the cliff.',
    '{A} discovered {B}\'s hiding spot and made their move.',
    '{A} fired an arrow from the treetops. {B} never saw it coming.',
    '{A} outsmarted {B} using a decoy and struck when {B} was distracted.',
  ],
  survive: [
    '{A} found a cache of food and survived another night.',
    '{A} hid in the trees all day, avoiding all danger.',
    '{A} treated their wounds using plants from the forest.',
    '{A} formed a temporary alliance that kept them safe.',
    '{A} set clever traps and waited patiently.',
    '{A} navigated a minefield without triggering anything.',
    '{A} discovered a secret bunker and restocked supplies.',
    '{A} stayed perfectly still as danger passed right by.',
  ],
  mutual: [
    '{A} and {B} fought to the death — neither survived.',
    '{A} and {B} simultaneously struck each other down.',
    '{A} and {B} were caught in a trap that took both of them out.',
    '{A} and {B} fell off the cliff together in their struggle.',
  ],
};

const RUMBLE = {
  elim: [
    '{A} clotheslined {B} over the top rope!',
    '{A} dropkicked {B} out of the ring!',
    '{A} hit {B} with a devastating suplex and tossed them out!',
    '{A} slammed {B} into the steel post and threw them over!',
    '{A} spun {B} around and launched them into the crowd!',
    '{A} countered {B}\'s finisher and dumped them over the rope!',
    '{A} caught {B} mid-air and hurled them out!',
  ],
  survive: [
    '{A} held on to the ropes with one hand, barely surviving!',
    '{A} dodged a double-team attempt and stayed alive!',
    '{A} took a massive hit but refused to go over the rope!',
    '{A} rolled back in under the bottom rope — still alive!',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt   = (t, A, B) => t.replace('{A}', `**${A}**`).replace('{B}', `**${B}**`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hasHostRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(r => r.name === EVENT_HOST_ROLE);
}

// ─── Game: Hunger Games ───────────────────────────────────────────────────────
async function runHungerGames(channel, players, bet) {
  let alive = [...players];
  let round = 1;
  const kills = new Map();

  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#8B0000')
      .setTitle('🏹 The Hunger Games Begin!')
      .setDescription(
        `**${alive.length} tributes** enter the arena.\n\n` +
        alive.map(p => `• ${p.username}`).join('\n') +
        `\n\n💰 Prize Pool: **${(bet * alive.length).toLocaleString()} oops**\n\n*Let the games begin...*`
      )
      .setFooter({ text: 'May the odds be ever in your favor.' })
  ]});

  while (alive.length > 1) {
    await sleep(4500);
    const events = [];
    const toRemove = new Set();
    alive.sort(() => Math.random() - 0.5);

    let i = 0;
    while (i < alive.length) {
      if (alive.length - toRemove.size <= 1 || i >= alive.length) break;
      const roll = Math.random();
      const hasNext = i + 1 < alive.length;

      if (roll < 0.30 && hasNext) {
        events.push(`${E.HG_MUTUAL} ` + fmt(pick(HG.mutual), alive[i].username, alive[i+1].username));
        toRemove.add(alive[i].id); toRemove.add(alive[i+1].id);
        i += 2;
      } else if (roll < 0.65 && hasNext) {
        const [a, b] = [alive[i], alive[i+1]];
        events.push(`${E.HG_KILL} ` + fmt(pick(HG.kill), a.username, b.username));
        kills.set(a.id, (kills.get(a.id) || 0) + 1);
        toRemove.add(b.id);
        i += 2;
      } else {
        events.push(`${E.HG_SURVIVE} ` + fmt(pick(HG.survive), alive[i].username, ''));
        i++;
      }
    }

    alive = alive.filter(p => !toRemove.has(p.id));

    await channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#8B0000')
        .setTitle(`🏹 Day ${round} — The Arena`)
        .setDescription(events.join('\n') || '*(A tense silence falls over the arena...)*')
        .addFields({ name: `👥 Survivors (${alive.length})`, value: alive.map(p => p.username).join(', ') || 'None' })
    ]});

    round++;
    if (alive.length === 0) break;
  }

  return { winners: alive, kills };
}

// ─── Game: Rumble ─────────────────────────────────────────────────────────────
async function runRumble(channel, players, bet) {
  let remaining = [...players].sort(() => Math.random() - 0.5);
  let round = 1;
  const eliminations = new Map();

  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#FF6600')
      .setTitle('⚔️ BATTLE ROYALE RUMBLE!')
      .setDescription(
        `**${remaining.length} competitors** enter the ring!\n\n` +
        remaining.map((p, i) => `**${i+1}.** ${p.username}`).join('\n') +
        `\n\n💰 Prize Pool: **${(bet * remaining.length).toLocaleString()} oops**\n\n*THE RUMBLE BEGINS!*`
      )
      .setFooter({ text: 'Last one standing wins!' })
  ]});

  while (remaining.length > 1) {
    await sleep(4000);
    const events = [];
    const eliminated = new Set();
    remaining.sort(() => Math.random() - 0.5);

    for (let i = 0; i < remaining.length; i++) {
      if (remaining.length - eliminated.size <= 1) break;
      if (eliminated.has(remaining[i].id)) continue;
      const next = remaining.find((p, j) => j > i && !eliminated.has(p.id));

      if (Math.random() < 0.50 && next) {
        events.push(`${E.RUMBLE_ELIM} ` + fmt(pick(RUMBLE.elim), remaining[i].username, next.username));
        eliminations.set(remaining[i].id, (eliminations.get(remaining[i].id) || 0) + 1);
        eliminated.add(next.id);
      } else {
        events.push(`${E.RUMBLE_SURVIVE} ` + fmt(pick(RUMBLE.survive), remaining[i].username, ''));
      }
    }

    remaining = remaining.filter(p => !eliminated.has(p.id));

    await channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#FF6600')
        .setTitle(`⚔️ Rumble — Round ${round}`)
        .setDescription(events.join('\n') || '*(Everyone is circling each other...)*')
        .addFields({ name: `🥊 Still in it (${remaining.length})`, value: remaining.map(p => p.username).join(', ') || 'None' })
    ]});

    round++;
  }

  return { winners: remaining, eliminations };
}

// ─── Core launcher (used by both manual and scheduled starts) ─────────────────
async function launchEvent(channel, type, bet, triggeredBy) {
  const channelId = channel.id;
  if (activeEvents.has(channelId)) return;

  const isHG  = type === 'hungergames';
  const label  = isHG ? `${E.HG_HEADER} Hunger Games` : `${E.RUMBLE_HEADER} Rumble`;
  const joinId = `event_join_${channelId}`;

  const event = { type, bet, players: [], phase: 'signup', channelId, triggeredBy };
  activeEvents.set(channelId, event);

  // Build signup embed
  const makeEmbed = (count) => new EmbedBuilder()
    .setColor(isHG ? '#8B0000' : '#FF6600')
    .setTitle(`${label} — Signup Open!`)
    .setDescription(
      (isHG
        ? `**The Capitol announces the annual Hunger Games!**\n\n💰 Entry: **${bet} oops**\n\n*May the odds be ever in your favor...*`
        : `**The ring is set! Who dares enter?**\n\n💰 Entry: **${bet} oops**\n\n*Last one standing wins it all!*`) +
      `\n\n▶ Click **Join** or type \`!signup\` to enter.\n⏳ Signup closes in **${SIGNUP_SECONDS}s** · Need **${MIN_PLAYERS}+ players**.`
    )
    .addFields({ name: '📋 Signed Up', value: count > 0 ? `**${count}** player${count !== 1 ? 's' : ''}` : 'Be the first!' })
    .setFooter({ text: `Host: ${triggeredBy}` });

  const joinBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(joinId)
      .setLabel(isHG ? `${E.HG_HEADER} Enter the Arena` : `${E.RUMBLE_HEADER} Enter the Ring`)
      .setStyle(isHG ? ButtonStyle.Danger : ButtonStyle.Primary)
  );

  const gameMsg = await channel.send({ embeds: [makeEmbed(0)], components: [joinBtn] });
  event.message = gameMsg;

  // Button collector
  const collector = gameMsg.createMessageComponentCollector({ time: SIGNUP_SECONDS * 1000 });

  collector.on('collect', async (interaction) => {
    if (interaction.customId !== joinId) return;
    await interaction.deferUpdate();
    const ev = activeEvents.get(channelId);
    if (!ev || ev.phase !== 'signup') return;

    if (ev.players.find(p => p.id === interaction.user.id)) {
      await interaction.followUp({ content: `⚠️ You're already signed up!`, ephemeral: true });
      return;
    }

    economy.getUser(interaction.user.id, interaction.user.username);
    if (economy.getBalance(interaction.user.id) < bet) {
      await interaction.followUp({ content: `❌ You need **${bet} oops** to enter. Check \`!balance\`!`, ephemeral: true });
      return;
    }

    economy.removeFunds(interaction.user.id, bet, `${type} entry fee`);
    ev.players.push({ id: interaction.user.id, username: interaction.user.username, avatar: interaction.user.avatar });

    await gameMsg.edit({ embeds: [makeEmbed(ev.players.length)], components: [joinBtn] });
    await interaction.followUp({ content: `✅ **${interaction.user.username}** entered! (${ev.players.length} signed up)` });
  });

  // When signup window ends
  collector.on('end', async () => {
    const ev = activeEvents.get(channelId);
    if (!ev || ev.phase !== 'signup') return;

    // Disable button
    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(joinId)
        .setLabel(`${E.SCHEDULE} Signups Closed`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await gameMsg.edit({ components: [closed] }).catch(() => {});

    if (ev.players.length < MIN_PLAYERS) {
      for (const p of ev.players) economy.addFunds(p.id, bet, `${type} refund — not enough players`);
      activeEvents.delete(channelId);
      return channel.send(`❌ **${label}** cancelled — only **${ev.players.length}/${MIN_PLAYERS}** players. Entry fees refunded.`);
    }

    ev.phase = 'running';
    const pot = bet * ev.players.length;
    let winners, kills, eliminations;

    if (isHG) {
      ({ winners, kills } = await runHungerGames(channel, ev.players, bet));
    } else {
      ({ winners, eliminations } = await runRumble(channel, ev.players, bet));
    }

    // Stats
    for (const p of ev.players) stats.increment(p.id, isHG ? 'hunger_games_participations' : 'rumble_participations');

    if (winners && winners.length > 0) {
      const tax        = Math.floor(pot * 0.10);
      const afterTax   = pot - tax;
      const share      = Math.floor(afterTax / winners.length);
      await jackpot.addToDrawFund(tax);
      for (const w of winners) {
        economy.addFunds(w.id, share, `${type} victory`);
        stats.increment(w.id, isHG ? 'hunger_games_wins' : 'rumble_wins');
      }
      for (const p of ev.players) {
        if (!winners.find(w => w.id === p.id))
          stats.increment(p.id, isHG ? 'hunger_games_losses' : 'rumble_losses');
      }

      const isTie = winners.length > 1;
      const winnerList = winners.map(w => `<@${w.id}> (**${w.username}**)`).join(', ');
      const prizeText = isTie
        ? `💰 Pot split ${winners.length} ways — **${share.toLocaleString()} oops** each\n🏦 **${tax.toLocaleString()} oops** taxed to the jackpot`
        : `💰 Prize: **${share.toLocaleString()} oops** *(after 10% jackpot tax)*\n🏦 **${tax.toLocaleString()} oops** added to the jackpot`;

      const extra = isHG
        ? winners.map(w => `⚔️ ${w.username} — ${kills.get(w.id) || 0} kills`).join('\n')
        : winners.map(w => `💥 ${w.username} — ${eliminations?.get(w.id) || 0} elims`).join('\n');

      await channel.send({ embeds: [
        new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(isTie
            ? (isHG ? `${E.HG_WINNER} THE VICTORS EMERGE!` : `${E.RUMBLE_WINNER} RUMBLE CO-CHAMPIONS!`)
            : (isHG ? `${E.HG_WINNER} THE VICTOR EMERGES!` : `${E.RUMBLE_WINNER} RUMBLE CHAMPION!`))
          .setDescription(`${winnerList} win${isTie ? '' : 's'}!\n\n${prizeText}\n${extra}`)
          .setFooter({ text: isHG ? 'Until next year...' : 'Winner winner oops dinner!' })
      ]});
    } else {
      for (const p of ev.players) economy.addFunds(p.id, bet, `${type} refund — no survivors`);
      await channel.send(isHG ? '💀 **Everyone perished!** All fees refunded.' : '😵 **Total chaos!** All fees refunded.');
    }

    activeEvents.delete(channelId);
  });
}

// ─── Exported module ──────────────────────────────────────────────────────────
module.exports = {
  name: 'events',
  activeEvents,

  /**
   * Call this from index.js inside client.once('ready', ...) to activate cron scheduling.
   */
  initScheduler(client) {
    if (!AUTO_EVENT_ENABLED) {
      console.log('[AutoGames] Scheduled events DISABLED. Set AUTO_EVENT_ENABLED=true to enable.');
      return;
    }

    const channelId = process.env.AUTO_EVENT_CHANNEL_ID;
    if (!channelId) {
      console.warn('[AutoGames] AUTO_EVENT_ENABLED=true but AUTO_EVENT_CHANNEL_ID not set. Aborting.');
      return;
    }

    if (!cron.validate(AUTO_EVENT_CRON)) {
      console.error(`[AutoGames] Bad cron: "${AUTO_EVENT_CRON}". Aborting scheduler.`);
      return;
    }

    console.log(`[AutoGames] Scheduler ON — cron:"${AUTO_EVENT_CRON}" channel:${channelId} type:${AUTO_EVENT_TYPE} bet:${AUTO_EVENT_BET}oops`);

    cron.schedule(AUTO_EVENT_CRON, async () => {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased()) { console.warn('[AutoGames] Channel not found or not text-based.'); return; }

        let type = AUTO_EVENT_TYPE;
        if (type === 'random') type = Math.random() < 0.5 ? 'hungergames' : 'rumble';

        await launchEvent(channel, type, AUTO_EVENT_BET, 'Auto-schedule 🤖');
      } catch (err) {
        console.error('[AutoGames] Cron error:', err.message);
      }
    }, { timezone: process.env.TZ || 'America/New_York' });
  },

  // ── Command handler ──────────────────────────────────────────────────────────

  // ── Slash handler ────────────────────────────────────────────────────────────
  async handleSlash(interaction, commandName) {
    const fakeMessage = {
      author:  interaction.user,
      member:  interaction.member,
      channel: interaction.channel,
      guild:   interaction.guild,
      reply:   async (data) => {
        if (interaction.replied || interaction.deferred) return interaction.followUp(typeof data === 'string' ? { content: data, ephemeral: true } : { ...data, ephemeral: true });
        return interaction.reply(typeof data === 'string' ? { content: data, ephemeral: true } : { ...data, ephemeral: true });
      },
    };

    let args = [];
    if (commandName === 'hungergames' || commandName === 'rumble') {
      const bet = interaction.options.getInteger('bet') || 50;
      args = [String(bet)];
      if (!interaction.replied) await interaction.reply({ content: 'Starting event...', ephemeral: true });
    } else if (commandName === 'signup') {
      if (!interaction.replied) await interaction.reply({ content: 'Signing you up...', ephemeral: true });
    } else if (commandName === 'cancelevent') {
      if (!interaction.replied) await interaction.reply({ content: 'Cancelling...', ephemeral: true });
    } else if (commandName === 'schedule') {
      if (!interaction.replied) await interaction.deferReply({ ephemeral: true });
    }

    await this.handleCommand(fakeMessage, args, commandName === 'signup' ? 'signup' : commandName);
  },

  async handleCommand(message, args, command) {
    switch (command) {
      case 'hungergames':
      case 'hg':
        return this.manualStart(message, args, 'hungergames');

      case 'rumble':
        return this.manualStart(message, args, 'rumble');

      // Single universal join command for players
      case 'event':
      case 'signup':
      case 'enter':
        return this.playerSignup(message);

      case 'eventschedule':
      case 'schedule':
        return this.showSchedule(message);

      case 'cancelevent':
        return this.cancelEvent(message);
    }
  },

  async manualStart(message, args, type) {
    if (!hasHostRole(message.member)) {
      return message.reply(`❌ You need the **${EVENT_HOST_ROLE}** role (or Administrator) to start events!`);
    }
    if (activeEvents.has(message.channel.id)) {
      return message.reply('❌ There\'s already an event running in this channel!');
    }

    const bet = parseInt(args[0]) || 100;
    if (bet < 10) return message.reply('❌ Minimum entry bet is 10 oops!');

    await launchEvent(message.channel, type, bet, message.author.username);
  },

  async playerSignup(message) {
    const event = activeEvents.get(message.channel.id);

    if (!event) {
      return message.reply(
        `❌ No event is open in this channel!\n` +
        `A **${EVENT_HOST_ROLE}** can start one with \`!hungergames\` or \`!rumble\`.`
      );
    }
    if (event.phase !== 'signup') {
      return message.reply('❌ Signups are closed — the event is already running!');
    }
    if (event.players.find(p => p.id === message.author.id)) {
      return message.reply('⚠️ You\'re already signed up!');
    }

    economy.getUser(message.author.id, message.author.username);
    if (economy.getBalance(message.author.id) < event.bet) {
      return message.reply(`❌ You need **${event.bet} oops** to enter. Check \`!balance\`.`);
    }

    economy.removeFunds(message.author.id, event.bet, `${event.type} entry fee`);
    event.players.push({ id: message.author.id, username: message.author.username, avatar: message.author.avatar });

    // Refresh the signup embed
    if (event.message) {
      const count = event.players.length;
      const isHG  = event.type === 'hungergames';
      const embed = new EmbedBuilder()
        .setColor(isHG ? '#8B0000' : '#FF6600')
        .setTitle(isHG ? `${E.HG_HEADER} Hunger Games — Signup Open!` : `${E.RUMBLE_HEADER} Rumble — Signup Open!`)
        .setDescription(
          (isHG
            ? `**The Capitol announces the annual Hunger Games!**\n\n💰 Entry: **${event.bet} oops**\n\n*May the odds be ever in your favor...*`
            : `**The ring is set! Who dares enter?**\n\n💰 Entry: **${event.bet} oops**\n\n*Last one standing wins it all!*`) +
          `\n\n▶ Click **Join** or type \`!signup\` to enter.\n⏳ Signup closing soon · Need **${MIN_PLAYERS}+ players**.`
        )
        .addFields({ name: '📋 Signed Up', value: `**${count}** player${count !== 1 ? 's' : ''}` })
        .setFooter({ text: `Host: ${event.triggeredBy}` });

      event.message.edit({ embeds: [embed] }).catch(() => {});
    }

    return message.reply(`✅ You're in, **${message.author.username}**! (${event.players.length} signed up)`);
  },

  async showSchedule(message) {
    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle(`${E.SCHEDULE} Auto-Event Schedule`)
        .addFields(
          { name: '🔁 Enabled',       value: AUTO_EVENT_ENABLED ? `${E.SUCCESS} Yes` : `${E.ERROR} No`,           inline: true },
          { name: '⏰ Cron',          value: `\`${AUTO_EVENT_CRON}\``,                           inline: true },
          { name: '🎮 Game Type',     value: AUTO_EVENT_TYPE,                                    inline: true },
          { name: '💰 Entry Fee',     value: `${AUTO_EVENT_BET} oops`,                             inline: true },
          { name: '👥 Min Players',   value: `${MIN_PLAYERS}`,                                   inline: true },
          { name: '🕑 Signup Window', value: `${SIGNUP_SECONDS}s`,                               inline: true },
          { name: '📺 Channel',       value: process.env.AUTO_EVENT_CHANNEL_ID ? `<#${process.env.AUTO_EVENT_CHANNEL_ID}>` : 'Not set', inline: true },
          { name: '🎖️ Host Role',    value: EVENT_HOST_ROLE,                                    inline: true },
        )
        .setFooter({ text: 'Edit in .env and restart the bot to change settings.' })
    ]});
  },

  async cancelEvent(message) {
    if (!hasHostRole(message.member)) {
      return message.reply(`❌ You need the **${EVENT_HOST_ROLE}** role to cancel events!`);
    }

    const event = activeEvents.get(message.channel.id);
    if (!event) return message.reply('❌ No active event in this channel.');
    if (event.phase === 'running') return message.reply('❌ The event is mid-game and cannot be cancelled.');

    for (const p of event.players) economy.addFunds(p.id, event.bet, 'Event cancelled by host');
    if (event.message) event.message.edit({ components: [] }).catch(() => {});
    activeEvents.delete(message.channel.id);

    return message.reply(`✅ Event cancelled. **${event.players.length}** player(s) refunded.`);
  },
};
