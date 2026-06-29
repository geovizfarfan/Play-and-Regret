/**
 * blackjack.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multiplayer Blackjack — everyone plays against the dealer (bot) simultaneously
 * - Flat bet entry
 * - Side bet: Insurance (when dealer shows Ace)
 * - Streak bonuses
 * - 10% jackpot tax on wins
 * - Stats tracking
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats } = require('../utils/database');
const jackpot = require('../utils/jackpot');

const EVENT_HOST_ROLE = process.env.EVENT_HOST_ROLE || 'Event Host';
const activeGames     = new Map(); // channelId → game
const playerStreaks   = new Map(); // userId → streak count

const SIGNUP_TIME_MS  = 30 * 1000; // default fallback
const SIGNUP_DURATIONS = { '30s': 30, '1m': 60, '2m': 120, '5m': 300 };
const fmtSecs = s => s < 60 ? `${s} seconds` : `${Math.round(s/60)} minute${Math.round(s/60) !== 1 ? 's' : ''}`;
const TURN_TIME_MS    = 30 * 1000; // 30 seconds per player turn

// ─── Card helpers ─────────────────────────────────────────────────────────────
const SUITS  = ['♠️','♥️','♦️','♣️'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function buildDeck() {
  const deck = [];
  for (const s of SUITS) for (const v of VALUES) deck.push({ suit: s, value: v });
  return deck.sort(() => Math.random() - 0.5);
}

function cardValue(card) {
  if (['J','Q','K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value);
}

function handTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    total += cardValue(c);
    if (c.value === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function fmtCard(c) { return `${c.value}${c.suit}`; }
function fmtHand(hand) { return hand.map(fmtCard).join(' '); }
function isBlackjack(hand) { return hand.length === 2 && handTotal(hand) === 21; }

// ─── Streak bonus ─────────────────────────────────────────────────────────────
function getStreakBonus(userId, won) {
  if (!won) { playerStreaks.set(userId, 0); return 0; }
  const streak = (playerStreaks.get(userId) || 0) + 1;
  playerStreaks.set(userId, streak);
  if (streak === 3) return 0.25; // +25%
  if (streak === 5) return 0.50; // +50%
  if (streak >= 7)  return 1.00; // +100%
  return 0;
}

function streakMsg(userId) {
  const s = playerStreaks.get(userId) || 0;
  if (s >= 7)  return `<a:purplefire:1479219348353716415><a:purplefire:1479219348353716415><a:purplefire:1479219348353716415> **${s} WIN STREAK!** Double bonus!`;
  if (s >= 5)  return `<a:purplefire:1479219348353716415><a:purplefire:1479219348353716415> **${s} win streak!** +50% bonus!`;
  if (s >= 3)  return `<a:purplefire:1479219348353716415> **${s} win streak!** +25% bonus!`;
  return null;
}

// ─── Embed builders ───────────────────────────────────────────────────────────
function makeSignupEmbed(players, bet, timeLabel, mode = 'multi') {
  return new EmbedBuilder()
    .setColor('#1A1A2E')
    .setTitle('<:OOPS:1478993005187698789> BLACKJACK — Signups Open!')
    .setDescription(
      `**Beat the dealer. Don't bust. Simple.**\n\n` +
      `<a:moneybag:1479268556687540345> Bet: **${bet} sins** per player\n` +
      `<:Clocktime:1479304295022071931> Signups close in **${timeLabel}**\n` +
      `<:members:1479293571709534311> Mode: **${mode === 'solo' ? '1v1 vs Dealer' : 'Multiplayer'}**\n\n` +
      `Click **<a:cards:1511530261551124561> Join Blackjack** to play!`
    )
    .addFields({
      name: `<:members:1479293571709534311> Joined (${players.length})`,
      value: players.length > 0 ? players.map((p,i) => `• **${p.username}**`).join('\n') : 'Nobody yet...',
    })
    .setFooter({ text: 'Side bet: Insurance available when dealer shows an Ace' });
}

const makeButtons = (mode = 'multi') => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('bj_join_placeholder').setLabel('<a:cards:1511530261551124561> Join Blackjack').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('bj_start_placeholder').setLabel('▶️ Start Now').setStyle(ButtonStyle.Success),
);

function makeGameEmbed(dealerHand, playerHands, hideSecond = true) {
  const dealerShow = hideSecond
    ? `${fmtCard(dealerHand[0])} 🂠`
    : `${fmtHand(dealerHand)} (${handTotal(dealerHand)})`;

  const fields = [{ name: '🎰 Dealer', value: dealerShow, inline: false }];
  for (const [uid, data] of playerHands) {
    const total  = handTotal(data.hand);
    const status = data.stand ? '✋ Stand' : data.bust ? '💥 Bust' : data.blackjack ? '<a:cards:1511530261551124561> Blackjack!' : `${total}`;
    fields.push({
      name: `${data.username}`,
      value: `${fmtHand(data.hand)} — **${status}**`,
      inline: true,
    });
  }

  return new EmbedBuilder()
    .setColor('#1A1A2E')
    .setTitle('<a:cards:1511530261551124561> BLACKJACK')
    .addFields(fields);
}

// ─── Game runner ──────────────────────────────────────────────────────────────
async function runBlackjack(channel, players, bet) {
  const deck        = buildDeck();
  const dealerHand  = [deck.pop(), deck.pop()];
  const playerHands = new Map();

  for (const p of players) {
    playerHands.set(p.id, {
      username:  p.username,
      hand:      [deck.pop(), deck.pop()],
      stand:     false,
      bust:      false,
      blackjack: false,
      insurance: false,
    });
  }

  const dealerUpcard = dealerHand[0];
  const dealerIsAce  = dealerUpcard.value === 'A';

  // ── Initial embed ──
  await channel.send({ embeds: [makeGameEmbed(dealerHand, playerHands, true)] });

  // ── Insurance side bet ──
  if (dealerIsAce) {
    const insId  = `bj_ins_${channel.id}_${Date.now()}`;
    const insMsg = await channel.send({
      content: `<a:Warning:1497476844860215366> **Dealer shows an Ace!** Side bet: pay half your bet (${Math.floor(bet/2)} sins) for **Insurance**. If dealer has Blackjack, insurance pays 2:1.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(insId).setLabel('🛡️ Take Insurance').setStyle(ButtonStyle.Secondary)
      )],
    });

    const insCollector = insMsg.createMessageComponentCollector({ time: 15000 });
    insCollector.on('collect', async (interaction) => {
      if (interaction.customId !== insId) return;
      const pd = playerHands.get(interaction.user.id);
      if (!pd || pd.insurance) {
        return interaction.reply({ content: `<a:Warning:1497476844860215366> Already insured or not in game.`, ephemeral: true });
      }
      const bal = await economy.getBalance(interaction.user.id);
      const ins = Math.floor(bet / 2);
      if (bal < ins) return interaction.reply({ content: `<:wrong:1495666083594502174> Not enough sins for insurance!`, ephemeral: true });
      await economy.removeFunds(interaction.user.id, ins, 'BJ Insurance');
      pd.insurance = true;
      await interaction.reply({ content: `🛡️ **${interaction.user.username}** took insurance for **${ins} sins**.`, ephemeral: false });
    });

    await new Promise(r => setTimeout(r, 15000));
    await insMsg.edit({ components: [] }).catch(() => {});
  }

  // ── Player turns ──
  for (const [uid, pd] of playerHands) {
    if (isBlackjack(pd.hand)) { pd.blackjack = true; continue; }

    const hitId   = `bj_hit_${uid}_${channel.id}`;
    const standId = `bj_stand_${uid}_${channel.id}`;

    const turnMsg = await channel.send({
      content: `<a:cards:1511530261551124561> <@${uid}>'s turn! Your hand: **${fmtHand(pd.hand)}** (${handTotal(pd.hand)})\nYou have 30 seconds — **Hit** or **Stand**?`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(hitId).setLabel('👊 Hit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(standId).setLabel('✋ Stand').setStyle(ButtonStyle.Secondary),
      )],
    });

    await new Promise((resolve) => {
      const col = turnMsg.createMessageComponentCollector({ time: TURN_TIME_MS });

      col.on('collect', async (interaction) => {
        if (interaction.user.id !== uid) {
          return interaction.reply({ content: `<a:Warning:1497476844860215366> It's not your turn!`, ephemeral: true });
        }
        await interaction.deferUpdate();

        if (interaction.customId === hitId) {
          pd.hand.push(deck.pop());
          const total = handTotal(pd.hand);
          if (total > 21) {
            pd.bust = true;
            await channel.send(`💥 **${pd.username}** hit and busted! Hand: **${fmtHand(pd.hand)}** (${total})`);
            col.stop('bust');
          } else if (total === 21) {
            pd.stand = true;
            await channel.send(`<:checkmark:1495666088417956002> **${pd.username}** hit 21! Hand: **${fmtHand(pd.hand)}**`);
            col.stop('21');
          } else {
            await channel.send(`👊 **${pd.username}** hits. Hand: **${fmtHand(pd.hand)}** (${total}) — Hit or Stand?`);
          }
        } else if (interaction.customId === standId) {
          pd.stand = true;
          await channel.send(`✋ **${pd.username}** stands at **${handTotal(pd.hand)}**.`);
          col.stop('stand');
        }
      });

      col.on('end', (_, reason) => {
        if (reason === 'time' && !pd.bust && !pd.stand) {
          pd.stand = true;
          channel.send(`<a:RojasClock:1511506715453947904> **${pd.username}** ran out of time and auto-stands at **${handTotal(pd.hand)}**.`);
        }
        turnMsg.edit({ components: [] }).catch(() => {});
        resolve();
      });
    });
  }

  // ── Dealer plays ──
  await channel.send(`🎰 **Dealer reveals:** ${fmtHand(dealerHand)} (${handTotal(dealerHand)})`);
  while (handTotal(dealerHand) < 17) {
    dealerHand.push(deck.pop());
    await channel.send(`🎰 **Dealer hits:** ${fmtHand(dealerHand)} (${handTotal(dealerHand)})`);
  }

  const dealerTotal    = handTotal(dealerHand);
  const dealerBust     = dealerTotal > 21;
  const dealerBJ       = isBlackjack(dealerHand);

  // ── Insurance payout ──
  if (dealerIsAce && dealerBJ) {
    for (const [uid, pd] of playerHands) {
      if (pd.insurance) {
        const ins     = Math.floor(bet / 2);
        const payout  = ins * 2;
        await economy.addFunds(uid, payout, 'BJ Insurance payout');
        await channel.send(`🛡️ **${pd.username}** insurance pays out **${payout} sins**!`);
      }
    }
  }

  // ── Results ──
  const results = [];
  for (const [uid, pd] of playerHands) {
    const pTotal = handTotal(pd.hand);
    let   outcome, payout = 0;

    if (pd.blackjack && !dealerBJ) {
      outcome = 'BLACKJACK';
      payout  = Math.floor(bet * 2.5);
    } else if (pd.bust) {
      outcome = 'BUST';
    } else if (dealerBJ && !pd.blackjack) {
      outcome = 'DEALER BJ';
    } else if (dealerBust) {
      outcome = 'WIN';
      payout  = bet * 2;
    } else if (pTotal > dealerTotal) {
      outcome = 'WIN';
      payout  = bet * 2;
    } else if (pTotal === dealerTotal) {
      outcome = 'PUSH';
      payout  = bet; // refund
    } else {
      outcome = 'LOSE';
    }

    const won = ['WIN','BLACKJACK'].includes(outcome);
    if (won && payout > 0) {
      const tax          = Math.floor(payout * 0.10);
      const afterTax     = payout - tax;
      const bonusPct     = getStreakBonus(uid, true);
      const bonusAmount  = Math.floor(afterTax * bonusPct);
      const finalPayout  = afterTax + bonusAmount;
      await economy.addFunds(uid, finalPayout, `Blackjack ${outcome}`);
      await jackpot.addToDrawFund(tax);
      stats.increment(uid, 'blackjack_wins').catch(() => {});
      const sm = streakMsg(uid);
      results.push(
        `<:purpleverified:1479305124336767147> **${pd.username}** — ${outcome}! ` +
        `Hand: ${fmtHand(pd.hand)} (${pTotal}) → **+${finalPayout.toLocaleString()} sins**` +
        (bonusAmount > 0 ? ` *(+${bonusAmount} streak bonus!)*` : '') +
        (sm ? `\n${sm}` : '')
      );
    } else if (outcome === 'PUSH') {
      getStreakBonus(uid, false);
      await economy.addFunds(uid, bet, 'Blackjack push refund');
      results.push(`🤝 **${pd.username}** — PUSH! Bet refunded.`);
    } else {
      getStreakBonus(uid, false);
      stats.increment(uid, 'blackjack_losses').catch(() => {});
      results.push(`💀 **${pd.username}** — ${outcome}. Hand: ${fmtHand(pd.hand)} (${pTotal})`);
    }

    stats.increment(uid, 'blackjack_games').catch(() => {});
  }

  const dealerLine = dealerBust
    ? `💥 Dealer busted! (${dealerTotal})`
    : `🎰 Dealer: ${fmtHand(dealerHand)} **(${dealerTotal})**`;

  // Big winner announcement
  const bjWinners = results.filter(r => r.includes('wins') || r.includes('Blackjack') || r.includes('WIN'));
  if (bjWinners.length > 0) {
    await channel.send(`# <a:cards:1511530261551124561> BLACKJACK RESULTS`).catch(()=>{});
  }
  await economy.untrackGameChannel(channel.id).catch(()=>{});
  await channel.send({ embeds: [
    new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('<a:cards:1511530261551124561> BLACKJACK — Results')
      .setDescription(`${dealerLine}\n\n${results.join('\n\n')}`)
      .setFooter({ text: '10% of winnings added to the jackpot' })
  ]});

  activeGames.delete(channel.id);
}

// ─── Launcher ─────────────────────────────────────────────────────────────────
async function launchBlackjack(channel, bet, triggeredBy, hostId, mode = 'multi', signupSecs = 30) {
  const channelId = channel.id;
  if (activeGames.has(channelId)) return channel.send('<:wrong:1495666083594502174> There\'s already a Blackjack game running here!');

  const joinId  = `bj_join_${channelId}`;
  const startId = `bj_start_${channelId}`;
  const game    = { bet, players: [], phase: 'signup', hostId, triggeredBy, mode, signupSecs };
  activeGames.set(channelId, game);

  const makeButtons = (m = 'multi') => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('<a:cards:1511530261551124561> Join Blackjack').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(startId).setLabel('▶️ Start Now').setStyle(ButtonStyle.Success),
  );

  // Solo mode — just the host vs dealer, no signup window
  if (mode === 'solo') {
    await economy.getUser(hostId, triggeredBy);
    const bal = await economy.getBalance(hostId);
    if (bal < bet) return channel.send(`<:wrong:1495666083594502174> **${triggeredBy}** needs **${bet} sins** to play!`);
    await economy.removeFunds(hostId, bet, 'Blackjack solo entry');
    await economy.trackGameEntry(hostId, message.author.username, channelId, 'Blackjack', bet).catch(()=>{});
    game.players.push({ id: hostId, username: triggeredBy });
    game.phase = 'running';
    await channel.send({ embeds: [new EmbedBuilder().setColor('#1A1A2E').setTitle('<a:cards:1511530261551124561> BLACKJACK — Solo Game').setDescription(`**${triggeredBy}** vs the Dealer\n\n<a:moneybag:1479268556687540345> Bet: **${bet} sins**`)] });
    await runBlackjack(channel, game.players, bet);
    activeGames.delete(channelId);
    return;
  }

  const gameMsg = await channel.send({ embeds: [makeSignupEmbed([], bet, fmtSecs(signupSecs), mode)], components: [makeButtons(mode)] });
  game.message  = gameMsg;

  const collector = gameMsg.createMessageComponentCollector({ time: signupSecs * 1000 });

  collector.on('collect', async (interaction) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    if (interaction.customId === startId) {
      if (interaction.user.id !== g.hostId) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> Only **${g.triggeredBy}** can force start!`, ephemeral: true });
      }
      if (g.players.length < 1) {
        return interaction.reply({ content: `<:wrong:1495666083594502174> Need at least 1 player!`, ephemeral: true });
      }
      await interaction.deferUpdate();
      collector.stop('forcestart');
      return;
    }

    if (interaction.customId !== joinId) return;
    await interaction.deferUpdate();

    if (g.players.find(p => p.id === interaction.user.id)) {
      return interaction.followUp({ content: `<a:Warning:1497476844860215366> You're already in!`, ephemeral: true });
    }
    await economy.getUser(interaction.user.id, interaction.user.username);
    const bal = await economy.getBalance(interaction.user.id);
    if (bal < bet) return interaction.followUp({ content: `<:wrong:1495666083594502174> You need **${bet} sins** to join!`, ephemeral: true });

    await economy.removeFunds(interaction.user.id, bet, 'Blackjack entry');
      await economy.trackGameEntry(interaction.user.id, interaction.user.username, channelId, 'Blackjack', bet).catch(()=>{});
    g.players.push({ id: interaction.user.id, username: interaction.user.username });
    await gameMsg.edit({ embeds: [makeSignupEmbed(g.players, bet, fmtSecs(g.signupSecs), g.mode)], components: [makeButtons(g.mode)] });
    await interaction.followUp({ content: `<:purpleverified:1479305124336767147> **${interaction.user.username}** joined Blackjack! Player **${g.players.length}**` });
  });

  collector.on('end', async (_, reason) => {
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'signup') return;

    const closed = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(joinId).setLabel('<a:cards:1511530261551124561> Table Closed').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(startId).setLabel('▶️ Started').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await gameMsg.edit({ components: [closed] }).catch(() => {});

    if (g.players.length < 1) {
      activeGames.delete(channelId);
      return channel.send(`<:wrong:1495666083594502174> Blackjack cancelled — nobody joined.`);
    }

    g.phase = 'running';
    await channel.send(`<a:cards:1511530261551124561> **Blackjack starting!** ${g.players.map(p => `**${p.username}**`).join(', ')} vs the Dealer!`);
    await runBlackjack(channel, g.players, bet);
  });
}

// ─── Module ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'blackjack',
  activeGames,

  async handleSlash(interaction, commandName) {
    if (commandName === 'blackjack') {
      const bet        = interaction.options.getInteger('bet') || 50;
      const mode       = interaction.options.getString('mode') || 'multi';
      const durationKey = interaction.options.getString('duration') || '30s';
      const customSecs = interaction.options.getInteger('timer');
      const signupSecs = customSecs || SIGNUP_DURATIONS[durationKey] || 30;
      await interaction.reply({ content: `<a:cards:1511530261551124561> Starting Blackjack...`, ephemeral: true });
      await launchBlackjack(interaction.channel, bet, interaction.user.username, interaction.user.id, mode, signupSecs);
    } else if (commandName === 'cancelblackjack') {
      const g = activeGames.get(interaction.channel.id);
      if (!g) return interaction.reply({ content: `<:wrong:1495666083594502174> No Blackjack running here.`, ephemeral: true });
      if (g.phase === 'running') return interaction.reply({ content: `<:wrong:1495666083594502174> Game is in progress.`, ephemeral: true });
      for (const p of g.players) await economy.addFunds(p.id, g.bet, 'Blackjack cancelled');
      if (g.message) g.message.edit({ components: [] }).catch(() => {});
      activeGames.delete(interaction.channel.id);
      await interaction.reply({ content: `<:checkmark:1495666088417956002> Blackjack cancelled. **${g.players.length}** player(s) refunded.` });
    }
  },

  async handleCommand(message, args, command) {
    if (command === 'blackjack' || command === 'bj') {
      const bet  = parseInt(args[0]) || 50;
      const mode = args[1] === 'solo' ? 'solo' : 'multi';
      if (bet < 10) return message.reply(`<:wrong:1495666083594502174> Minimum bet is 10 sins!`);
      await launchBlackjack(message.channel, bet, message.author.username, message.author.id, mode, 30);
    } else if (command === 'cancelblackjack' || command === 'cancelbj') {
      const g = activeGames.get(message.channel.id);
      if (!g) return message.reply(`<:wrong:1495666083594502174> No Blackjack running here.`);
      for (const p of g.players) await economy.addFunds(p.id, g.bet, 'Blackjack cancelled');
      if (g.message) g.message.edit({ components: [] }).catch(() => {});
      activeGames.delete(message.channel.id);
      return message.reply(`<:checkmark:1495666088417956002> Blackjack cancelled. **${g.players.length}** player(s) refunded.`);
    }
  },
};
