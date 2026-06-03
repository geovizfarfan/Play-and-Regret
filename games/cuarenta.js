const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy, stats } = require('../utils/database');
const E = require('../utils/emojis');
const jackpot = require('../utils/jackpot');

// ─── Constants ────────────────────────────────────────────────────────────────
const SUITS       = ['♠️','♥️','♦️','♣️'];
const RANKS       = ['A','2','3','4','5','6','7','J','Q','K'];
const RANK_ORDER  = ['A','2','3','4','5','6','7','J','Q','K'];
const RANK_VALUES = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,J:null,Q:null,K:null };
const WIN_SCORE   = 40;
const BOT_ID      = 'BOT_CUARENTA';
const BOT_NAME    = '🤖 CuarentaBot';
const SUIT_CODE   = { '♠️':'S','♥️':'H','♦️':'D','♣️':'C' };
const TIMEOUT_MS  = 180000; // 3 minutes

const activeGames = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cardURL(c)      { return `https://deckofcardsapi.com/static/img/${c.rank}${SUIT_CODE[c.suit]}.png`; }
function cardLinks(arr)  { return arr.length ? arr.map(c=>`[${c.display}](${cardURL(c)})`).join(' · ') : '`[ Empty ]`'; }
function scoreBar(game)  { return game.players.map(p=>`**${p.username}**: ${p.score}pts · ${p.captured} cards`).join('  |  '); }
function newPlayer(id, username, team) {
  return { id, username, score:0, team, captured:0, rondaRank:null, rondaClaimed:false, cuarentaClaimed:false, isBot: id===BOT_ID };
}

function buildDeck() {
  const d = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      d.push({ rank, suit, value: RANK_VALUES[rank], display:`${rank}${suit}` });
  return d.sort(() => Math.random() - 0.5);
}

function dealHands(deck, n) {
  const h = Array.from({length:n}, ()=>[]);
  for (let i = 0; i < 5*n; i++) h[i%n].push(deck.pop());
  return h;
}

// ─── Capture logic ────────────────────────────────────────────────────────────
function extendBySequence(playedCard, alreadyCaptured, table) {
  const remaining = table.filter(c => !alreadyCaptured.includes(c));
  const extra = [];
  let next = RANK_ORDER.indexOf(playedCard.rank) + 1;
  while (next < RANK_ORDER.length) {
    const found = remaining.find(c => c.rank === RANK_ORDER[next] && !extra.includes(c));
    if (!found) break;
    extra.push(found);
    next++;
  }
  return extra;
}

function findAdditionSets(played, table) {
  if (played.value === null) return [];
  const numeric = table.filter(c => c.value !== null);
  const results = [];
  for (let mask = 1; mask < (1 << numeric.length); mask++) {
    const subset = []; let sum = 0;
    for (let i = 0; i < numeric.length; i++) {
      if (mask & (1<<i)) { subset.push(numeric[i]); sum += numeric[i].value; }
    }
    if (sum === played.value && subset.length >= 2) results.push(subset);
  }
  return results;
}

function getPossibleCaptures(played, table, lastPlayedCard, lastPlayedBy, currentIdx, playerScore) {
  const options = [];

  // Match
  for (const matched of table.filter(c => c.rank === played.rank)) {
    const base = [matched];
    const seq  = extendBySequence(played, base, table);
    const all  = [...base, ...seq];
    const isCaida = !!(lastPlayedCard && matched === lastPlayedCard && lastPlayedBy !== null && lastPlayedBy !== currentIdx);
    const isLimpia = table.filter(c => !all.includes(c)).length === 0;
    let pts = isCaida ? 2 : 0;
    if (isLimpia && playerScore < 38) pts += 2;
    options.push({ type: isCaida?'caida':'match', allCaptured:all, points:pts, isCaida, isLimpia,
      label: `${isCaida?'⚡ Caída':'Match'}: \`${matched.display}\`` + (seq.length ? ` +seq(${seq.map(c=>c.display).join(',')})` : '') + ` → +${pts}pts` });
  }

  // Addition
  for (const subset of findAdditionSets(played, table)) {
    const seq  = extendBySequence(played, subset, table);
    const all  = [...subset, ...seq];
    const isLimpia = table.filter(c => !all.includes(c)).length === 0;
    const pts = (isLimpia && playerScore < 38) ? 2 : 0;
    options.push({ type:'addition', allCaptured:all, points:pts, isCaida:false, isLimpia,
      label: `Add: ${subset.map(c=>`\`${c.display}\``).join('+')}` + (seq.length ? ` +seq(${seq.map(c=>c.display).join(',')})` : '') + (pts ? ` → +${pts}pts` : '') });
  }

  return options;
}

function checkRonda(hand) {
  const counts = {};
  for (const c of hand) counts[c.rank] = (counts[c.rank]||0) + 1;
  for (const [rank, count] of Object.entries(counts)) {
    if (count >= 4) return { type:'cuarenta', rank };
    if (count === 3) return { type:'ronda', rank };
  }
  return null;
}

// ─── End-of-hand card scoring ─────────────────────────────────────────────────
function scoreCards(game) {
  const results = [];
  if (game.mode === '2v2') {
    for (const team of [0,1]) {
      const cards = game.players.filter(p=>p.team===team).reduce((s,p)=>s+p.captured,0);
      results.push({ team, cards, pts:0 });
    }
  } else {
    game.players.forEach((p,i) => results.push({ idx:i, playerId:p.id, cards:p.captured, pts:0 }));
  }
  const max = Math.max(...results.map(r=>r.cards));
  const isDealer = r => game.mode==='2v2' ? r.team===game.dealerIdx%2 : r.idx===game.dealerIdx;
  if (max >= 20) {
    // 20=6pts, +1pt per every 2 extra cards (20=6, 22=7, 24=8, 26=9...)
    // 20=6, 21-22=8, 23-24=10, 25-26=12 (rounds up to nearest even)
    for (const r of results) r.pts = r.cards >= 20 ? 6 + Math.ceil((r.cards-20)/2)*2 : 0;
    if (results.every(r=>r.cards===20)) results.filter(r=>isDealer(r)).forEach(r=>r.pts=0);
  } else {
    const winners = results.filter(r=>r.cards===max);
    if (winners.length === 1) winners[0].pts = 2;
    else results.filter(r=>!isDealer(r)&&r.cards===max).forEach(r=>r.pts=2);
  }
  return results;
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
function turnButtons(disabled=false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cq_hand').setLabel('👁 My Hand').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('cq_table').setLabel('🃏 Table').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('cq_ronda').setLabel('🎵 Ronda').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('cq_cuarenta').setLabel('🎊 Cuarenta').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  )];
}

function handButtons(hand) {
  if (!hand.length) return [];
  const row = new ActionRowBuilder();
  hand.forEach((c,i) => row.addComponents(
    new ButtonBuilder().setCustomId(`cq_play_${i}`).setLabel(c.display).setStyle(ButtonStyle.Primary)
  ));
  return [row];
}

// ─── Award timeout win ────────────────────────────────────────────────────────
async function awardTimeoutWin(channel, game, timedOutIdx) {
  const g = activeGames.get(game.channelId);
  if (!g || g.phase !== 'playing') return;
  if (g.currentPlayerIdx !== timedOutIdx) return; // turn already moved on naturally
  const loser  = g.players[timedOutIdx];
  const winner = g.players.find(p => p.id !== loser.id);
  if (!winner) return;
  await channel.send({ embeds: [new EmbedBuilder().setColor('#D4D8F0').setTitle('⏰ Time Out!')
    .setDescription(`**${loser.username}** took too long (3 minutes).\n**${winner.username}** wins by default!\n${E.BB_COIN} Prize: **${g.bet*g.numPlayers} oops**`)] });
  await endGame(channel, g, winner);
}

// ─── Start game ───────────────────────────────────────────────────────────────
async function startGame(channel, authorId, authorUsername, is2v2, bet, replyFn, vsBot=false) {
  const channelId = channel.id;
  if (activeGames.has(channelId)) return replyFn(`${E.ERROR} A game is already running here!`);
  if (bet < 10) return replyFn(`${E.ERROR} Minimum bet is 10 oops!`);

  await economy.getUser(authorId, authorUsername);
  if (await economy.getBalance(authorId) < bet) return replyFn(`${E.ERROR} Not enough oops!`);
  await economy.removeFunds(authorId, bet, 'Cuarenta entry');

  const game = {
    channelId, mode: is2v2?'2v2':'1v1', numPlayers: is2v2?4:2, bet, vsBot,
    players: [newPlayer(authorId, authorUsername, 0)],
    phase:'lobby', deck:[], hands:[], table:[],
    currentPlayerIdx:0, dealerIdx:0, dealCount:0,
    lastPlayedCard:null, lastPlayedBy:null,
    pendingRondaBonus:[], turnMessage:null,
  };
  activeGames.set(channelId, game);

  // ── vs Bot: skip lobby ───────────────────────────────────────────────────────
  if (vsBot) {
    game.players.push(newPlayer(BOT_ID, BOT_NAME, 1));
    await channel.send({ embeds: [new EmbedBuilder().setColor('#D4D8F0')
      .setTitle(`${E.CUARENTA} Cuarenta (Ecuadorian) vs 🤖 Bot`)
      .setThumbnail('https://deckofcardsapi.com/static/img/back.png')
      .setDescription(`**${authorUsername}** vs **${BOT_NAME}**\n\n${E.BB_COIN} Bet: **${bet} oops** · First to exactly **40 pts** wins!\n\nThe bot plays automatically. Good luck!`)] });
    return beginGame(channelId, channel);
  }

  // ── Multiplayer lobby ────────────────────────────────────────────────────────
  const lobbyMsg = await channel.send({ embeds: [new EmbedBuilder().setColor('#D4D8F0')
    .setTitle(`${E.CUARENTA} Cuarenta ${is2v2?'2v2':'1v1'} — Join!`)
    .setThumbnail('https://deckofcardsapi.com/static/img/back.png')
    .setDescription(`**${authorUsername}** wants to play!\n${E.BB_COIN} Entry: **${bet} oops** · Need **${game.numPlayers-1}** more\n\nClick **Join** to enter!`)
    .setFooter({text:'Lobby open 2 minutes'})],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cq_join').setLabel('Join').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cq_rules_lobby').setLabel('📖 Rules').setStyle(ButtonStyle.Secondary),
    )]
  });

  const lc = lobbyMsg.createMessageComponentCollector({ time: 120000 });
  lc.on('collect', async inter => {
    if (inter.customId === 'cq_rules_lobby') {
      return inter.reply({ content: module.exports.getRulesText(), ephemeral:true });
    }
    const g = activeGames.get(channelId);
    if (!g || g.phase !== 'lobby') return inter.reply({ content:'Lobby closed.', ephemeral:true });
    if (g.players.find(p=>p.id===inter.user.id)) return inter.reply({ content:'Already joined!', ephemeral:true });
    await economy.getUser(inter.user.id, inter.user.username);
    if (await economy.getBalance(inter.user.id) < g.bet) return inter.reply({ content:`Need ${g.bet} oops!`, ephemeral:true });
    await economy.removeFunds(inter.user.id, g.bet, 'Cuarenta entry');
    g.players.push(newPlayer(inter.user.id, inter.user.username, g.players.length%2));
    await inter.reply({ content:`✅ Joined! (${g.players.length}/${g.numPlayers})`, ephemeral:true });
    await channel.send(`✅ **${inter.user.username}** joined! (${g.players.length}/${g.numPlayers})`);
    if (g.players.length === g.numPlayers) { lc.stop('full'); beginGame(channelId, channel); }
  });
  lc.on('end', async (_, reason) => {
    if (reason !== 'full') {
      const g = activeGames.get(channelId);
      if (g?.phase === 'lobby') {
        for (const p of g.players) if (!p.isBot) await economy.addFunds(p.id, g.bet, 'Cuarenta refund');
        activeGames.delete(channelId);
        channel.send(`${E.ERROR} Cuarenta cancelled — not enough players. Bets refunded.`).catch(()=>{});
      }
    }
  });
}

// ─── Begin game ───────────────────────────────────────────────────────────────
async function beginGame(channelId, channel) {
  const game = activeGames.get(channelId);
  if (!game) return;
  game.phase = 'playing';
  game.deck  = buildDeck();
  await doDeal(channel, game, true);
}

async function doDeal(channel, game, isFirst=false) {
  game.hands = dealHands(game.deck, game.numPlayers);
  game.dealCount++;
  game.lastPlayedCard = null;
  game.lastPlayedBy   = null;
  game.players.forEach(p => { p.rondaClaimed=false; p.cuarentaClaimed=false; });
  if (isFirst) game.table = [];

  const dealerName = game.players[game.dealerIdx].username;
  await channel.send({ embeds: [new EmbedBuilder().setColor('#D4D8F0')
    .setTitle(`${E.CUARENTA} ${isFirst?'Game Started!':'New Deal!'}`)
    .setThumbnail('https://deckofcardsapi.com/static/img/back.png')
    .setDescription(
      (isFirst ? `**Players:** ${game.players.map(p=>p.username+(game.mode==='2v2'?` (${p.team===0?'A':'B'})`:'')  ).join(', ')}\n\n` : '') +
      `Dealer: **${dealerName}** · Table: **${game.table.length}** card${game.table.length!==1?'s':''}\n` +
      (game.table.length > 0 ? `\n🃏 **Table:** ${cardLinks(game.table)}\n` : '') +
      `\n${scoreBar(game)}`
    )
    .setFooter({text:'Press 🎵 Ronda or 🎊 Cuarenta right after receiving cards if you have them!'})
  ]});

  // Check ronda/cuarenta for all players immediately after deal
  for (let i = 0; i < game.numPlayers; i++) {
    const p = game.players[i];
    if (p.isBot) continue; // bot handles its own in doBotTurn
    const check = checkRonda(game.hands[i]);
    if (check?.type === 'cuarenta') {
      await handleInstantCuarenta(channel, game, i);
      if (game.phase !== 'playing') return;
    }
  }

  game.currentPlayerIdx = (game.dealerIdx + 1) % game.numPlayers;
  await postTurn(channel, game);
}

// ─── Instant Cuarenta (4-of-a-kind dealt) ────────────────────────────────────
async function handleInstantCuarenta(channel, game, pIdx) {
  const p     = game.players[pIdx];
  const check = checkRonda(game.hands[pIdx]);
  if (!check || check.type !== 'cuarenta') return;
  const four  = game.hands[pIdx].filter(c=>c.rank===check.rank);
  await channel.send({ embeds: [new EmbedBuilder().setColor('#F2F5E0').setTitle('🎊 CUARENTA! Instant Win!')
    .setThumbnail(cardURL(four[0]))
    .setDescription(`**${p.username}** was dealt 4 × **${check.rank}**!\n${four.map(c=>`\`${c.display}\``).join('  ')}\n\n${game.mode==='2v2'?`**${p.team===0?'Team A':'Team B'}** wins!`:`**${p.username}** wins!`}`)] });
  await endGame(channel, game, p);
}

// ─── Turn prompt ──────────────────────────────────────────────────────────────
async function postTurn(channel, game) {
  if (game.phase !== 'playing') return;

  // Disable old turn message buttons
  if (game.turnMessage) game.turnMessage.edit({ components: turnButtons(true) }).catch(()=>{});

  const player = game.players[game.currentPlayerIdx];
  const topCard = game.table[game.table.length-1];

  const msg = await channel.send({ embeds: [new EmbedBuilder()
    .setColor('#D4D8F0')
    .setTitle(`${E.CUARENTA} ${player.username}'s Turn`)
    .setThumbnail(topCard ? cardURL(topCard) : null)
    .setDescription(
      `<@${player.id}> — your turn!\n\n` +
      `**🃏 Table (${game.table.length}):** ${cardLinks(game.table)}\n\n` +
      `Press **👁 My Hand** to see your cards and play.`
    )
    .setFooter({text: scoreBar(game)})
  ], components: turnButtons() });
  game.turnMessage = msg;

  // Bot plays automatically
  if (player.isBot) {
    setTimeout(() => doBotTurn(channel, game), 2000);
    return;
  }

  // Human turn — single collector on this message, handles everything
  let turnPlayed = false; // set true when card is played; prevents false timeout
  const snapshotIdx = game.currentPlayerIdx; // capture turn index at creation time

  const col = msg.createMessageComponentCollector({
    filter: i => game.players.some(p=>p.id===i.user.id),
    time: TIMEOUT_MS,
  });

  col.on('collect', async inter => {
    const g = activeGames.get(game.channelId);
    if (!g || g.phase !== 'playing') return col.stop();
    try {
      if (inter.customId === 'cq_table')    return handleTableBtn(inter, g);
      if (inter.customId === 'cq_ronda')    return handleRondaBtn(inter, g, channel);
      if (inter.customId === 'cq_cuarenta') return handleCuarentaBtn(inter, g, channel, col, () => { turnPlayed = true; });
      if (inter.customId === 'cq_hand')     return handleHandBtn(inter, g, channel, col, () => { turnPlayed = true; });
    } catch(e) {
      console.error('Collector error:', e);
    }
  });

  col.on('end', async () => {
    if (turnPlayed) return; // card was played — no timeout
    const g = activeGames.get(game.channelId);
    if (!g || g.phase !== 'playing') return;
    if (g.currentPlayerIdx !== snapshotIdx) return; // turn already moved on naturally
    await awardTimeoutWin(channel, g, snapshotIdx);
  });
}

// ─── Button handlers ──────────────────────────────────────────────────────────

async function handleTableBtn(inter, g) {
  const top = g.table[g.table.length-1];
  await inter.reply({ embeds: [new EmbedBuilder().setColor('#D8EDF0').setTitle('🃏 Table Cards')
    .setThumbnail(top?cardURL(top):null)
    .setDescription(g.table.length ? cardLinks(g.table) : '`[ Empty ]`')
    .setFooter({text:'Only you can see this'})], ephemeral:true });
}

async function handleRondaBtn(inter, g, channel) {
  const pIdx = g.players.findIndex(p=>p.id===inter.user.id);
  if (pIdx === -1) return inter.reply({content:'Not in game!', ephemeral:true});
  const p = g.players[pIdx];
  if (p.rondaClaimed) return inter.reply({content:'Already claimed Ronda this deal!', ephemeral:true});

  const check = checkRonda(g.hands[pIdx]);
  if (!check || check.type !== 'ronda') {
    // False claim penalty
    p.score = Math.max(0, p.score-4);
    await inter.reply({content:`❌ No Ronda! **-4 pts** penalty.`, ephemeral:true});
    await channel.send({ embeds: [new EmbedBuilder().setColor('#D4D8F0').setTitle('❌ False Ronda!')
      .setDescription(`**${p.username}** claimed Ronda falsely → **-4 pts**\n\n${scoreBar(g)}`)] });
    return;
  }

  // Valid ronda
  p.rondaRank   = check.rank;
  p.rondaClaimed = true;
  p.score += 4;
  await inter.reply({content:`🎵 Ronda claimed! **+4 pts** added.`, ephemeral:true});
  await channel.send({ embeds: [new EmbedBuilder().setColor('#E0F0E0').setTitle('🎵 ¡Ronda!')
    .setDescription(`**${p.username}** calls Ronda! *(3 of the same hidden rank)*\n**+4 pts** · rank is **secret**\n\n⚠️ Player to their left earns +10 pts if they capture a Ronda card with a Caída!\n\n${scoreBar(g)}`)] });
}

async function handleCuarentaBtn(inter, g, channel, col, onPlayed=()=>{}) {
  const pIdx = g.players.findIndex(p=>p.id===inter.user.id);
  if (pIdx === -1) return inter.reply({content:'Not in game!', ephemeral:true});
  const p = g.players[pIdx];
  if (p.cuarentaClaimed) return inter.reply({content:'Already tried Cuarenta this deal!', ephemeral:true});

  const check = checkRonda(g.hands[pIdx]);
  if (!check || check.type !== 'cuarenta') {
    p.cuarentaClaimed = true;
    p.score = Math.max(0, p.score-4);
    await inter.reply({content:`❌ No 4-of-a-kind! **-4 pts** penalty.`, ephemeral:true});
    await channel.send({ embeds: [new EmbedBuilder().setColor('#D4D8F0').setTitle('❌ False Cuarenta!')
      .setDescription(`**${p.username}** claimed Cuarenta falsely → **-4 pts**\n\n${scoreBar(g)}`)] });
    return;
  }

  // Valid — announce and end game
  p.cuarentaClaimed = true;
  const four = g.hands[pIdx].filter(c=>c.rank===check.rank);
  await inter.reply({content:`🎊 Cuarenta confirmed!`, ephemeral:true});
  await channel.send({ embeds: [new EmbedBuilder().setColor('#F2F5E0').setTitle('🎊 CUARENTA! Instant Win!')
    .setThumbnail(cardURL(four[0]))
    .setDescription(`**${p.username}** reveals 4 × **${check.rank}**!\n${four.map(c=>`\`${c.display}\``).join('  ')}\n\n${g.mode==='2v2'?`**${p.team===0?'Team A':'Team B'}** wins!`:`**${p.username}** wins!`}`)] });
  onPlayed();
  col.stop('cuarenta_win');
  await endGame(channel, g, p);
}

async function handleHandBtn(inter, g, channel, col, onPlayed=()=>{}) {
  const pIdx = g.players.findIndex(p=>p.id===inter.user.id);
  if (pIdx === -1) return inter.reply({content:'Not in game!', ephemeral:true});
  const h = g.hands[pIdx];
  const isMyTurn = pIdx === g.currentPlayerIdx;

  // Show hand ephemerally
  await inter.reply({ embeds: [new EmbedBuilder()
    .setColor(isMyTurn?'#B3D4FF':'#D4E8E8')
    .setTitle(isMyTurn?'👁 Your Hand — choose a card':'👁 Your Hand')
    .setThumbnail(h.length?cardURL(h[0]):null)
    .setDescription(h.length ? h.map(c=>`[${c.display}](${cardURL(c)})`).join('  ·  ') : '`[ No cards ]`')
    .setFooter({text:'Only you can see this'})
  ], ephemeral:true });

  if (!isMyTurn) return;

  // Send play buttons as a separate ephemeral followUp
  await inter.followUp({ content:'**Choose a card to play:**', components: handButtons(h), ephemeral:true });

  // Listen on the channel for this player's play button — use a one-shot collector
  let cardPlayed = false; // guard against false timeout fires

  const playCol = channel.createMessageComponentCollector({
    filter: i => i.user.id === inter.user.id && i.customId.startsWith('cq_play_'),
    max: 1,
    time: TIMEOUT_MS,
  });

  playCol.on('collect', async ci => {
    cardPlayed = true;
    onPlayed();
    const gNow = activeGames.get(g.channelId);
    if (!gNow || gNow.phase !== 'playing') {
      await ci.reply({content:'Game ended.', ephemeral:true}); return;
    }
    if (gNow.currentPlayerIdx !== pIdx) {
      await ci.reply({content:`${E.ERROR} Not your turn anymore!`, ephemeral:true}); return;
    }
    const cardIdx = parseInt(ci.customId.replace('cq_play_',''));
    if (isNaN(cardIdx) || cardIdx >= gNow.hands[pIdx].length) {
      await ci.reply({content:'Invalid card.', ephemeral:true}); return;
    }
    await ci.update({ content:'✅ Playing card...', components:[] }).catch(() => {});
    col.stop('played');
    await resolvePlay(channel, gNow, cardIdx);
  });

  playCol.on('end', async () => {
    if (cardPlayed) return; // card was played normally — do nothing
    // True timeout: player opened hand but never picked a card
    const gNow = activeGames.get(g.channelId);
    if (!gNow || gNow.phase !== 'playing') return;
    if (gNow.currentPlayerIdx !== pIdx) return; // turn already moved on
    col.stop('timeout_win');
    await awardTimeoutWin(channel, gNow, pIdx);
  });
}

// ─── Resolve a play ───────────────────────────────────────────────────────────
async function resolvePlay(channel, game, cardIdx) {
  if (game.phase !== 'playing') return;
  const player = game.players[game.currentPlayerIdx];
  const hand   = game.hands[game.currentPlayerIdx];
  if (cardIdx >= hand.length) return;

  const played = hand.splice(cardIdx, 1)[0];

  // Find best capture
  const options = getPossibleCaptures(played, game.table, game.lastPlayedCard, game.lastPlayedBy, game.currentPlayerIdx, player.score);
  options.sort((a,b) => {
    if (a.isCaida && !b.isCaida) return -1;
    if (!a.isCaida && b.isCaida) return 1;
    return (b.points - a.points) || (b.allCaptured.length - a.allCaptured.length);
  });
  const chosen = options[0] || null;

  let desc='', pts=0, color='#D8EDF0';

  if (chosen) {
    game.table = game.table.filter(c => !chosen.allCaptured.includes(c));
    pts = chosen.points;
    player.captured += chosen.allCaptured.length + 1;
    color = chosen.isCaida ? '#D4D8F0' : '#F2F5E0';
    desc  = chosen.label;
    if (chosen.isLimpia && !chosen.isCaida && player.score < 38) desc += '\n✨ **Limpia!** +2 pts';
    if (chosen.isLimpia && chosen.isCaida && player.score < 38)  desc += '\n✨ **Caída y Limpia!** +4 pts total';
    if (chosen.isLimpia && player.score >= 38) desc += '\n*(Limpia bonus suppressed — at 38pts only Caída wins)*';

    // Ronda bonus detection
    if (chosen.isCaida) {
      const prev = game.players[game.lastPlayedBy];
      if (prev?.rondaRank && chosen.allCaptured.some(c=>c.rank===prev.rondaRank)) {
        game.pendingRondaBonus.push({ claimerIdx: game.currentPlayerIdx, ownerIdx: game.lastPlayedBy, rank: prev.rondaRank });
        desc += '\n🔍 *Possible Ronda bonus — announced at end of deal*';
      }
    }
  } else {
    game.table.push(played);
    desc = `**${player.username}** plays \`${played.display}\` to the table.`;
  }

  player.score += pts;

  // Exact-40 win check: overshoot → cap at 39
  if (player.score > WIN_SCORE) player.score = WIN_SCORE - 1;

  // Update caída tracking
  game.lastPlayedCard = chosen ? null : played;
  game.lastPlayedBy   = chosen ? null : game.currentPlayerIdx;

  const newTop = game.table[game.table.length-1];
  await channel.send({ embeds: [new EmbedBuilder().setColor(color)
    .setTitle(`${E.CUARENTA} Card Played`)
    .setThumbnail(cardURL(played))
    .setDescription(desc)
    .addFields(
      { name:`🃏 Table (${game.table.length})`, value: cardLinks(game.table) },
      { name:'📊 Scores', value: scoreBar(game) },
    )
    .setFooter({text: newTop ? `Top: ${newTop.display}` : 'Table empty'})
  ]});

  // Win check (exact 40)
  if (player.score === WIN_SCORE) return endGame(channel, game, player);

  // Redeal or end hand
  if (game.hands.every(h=>h.length===0)) {
    await resolvePendingBonuses(channel, game);
    if (game.deck.length > 0) {
      game.dealerIdx = (game.dealerIdx+1) % game.numPlayers;
      return doDeal(channel, game, false);
    } else {
      return resolveHandScoring(channel, game);
    }
  }

  game.currentPlayerIdx = (game.currentPlayerIdx+1) % game.numPlayers;
  await postTurn(channel, game);
}

// ─── Ronda bonus ──────────────────────────────────────────────────────────────
async function resolvePendingBonuses(channel, game) {
  for (const b of game.pendingRondaBonus) {
    const claimer = game.players[b.claimerIdx];
    const owner   = game.players[b.ownerIdx];
    if (claimer.score >= 30 || owner.score >= 30) continue;
    claimer.score += 10;
    await channel.send({ embeds: [new EmbedBuilder().setColor('#D4D8F0').setTitle('🔍 Ronda Bonus!')
      .setDescription(`**${claimer.username}** captured **${owner.username}**'s Ronda (\`${b.rank}\`) with a Caída!\n**+10 pts** for ${claimer.username}!\n\n${scoreBar(game)}`)] });
    if (claimer.score === WIN_SCORE) { await endGame(channel, game, claimer); return; }
    if (claimer.score > WIN_SCORE) claimer.score = WIN_SCORE - 1;
  }
  game.pendingRondaBonus = [];
}

// ─── End-of-hand scoring ──────────────────────────────────────────────────────
async function resolveHandScoring(channel, game) {
  const results = scoreCards(game);
  const lines = [];

  for (const r of results) {
    if (game.mode === '2v2') {
      // Add pts to ONE representative player per team only (avoid doubling)
      const rep = game.players.find(p => p.team === r.team);
      if (rep) rep.score += r.pts;
      const name = `Team ${r.team===0?'A':'B'}`;
      lines.push(`**${name}**: ${r.cards} cards → +${r.pts} pts`);
    } else {
      const p = game.players[r.idx];
      if (p) { p.score += r.pts; lines.push(`**${p.username}**: ${r.cards} cards → +${r.pts} pts`); }
    }
  }

  // Reset captured counts for next hand
  game.players.forEach(p => { p.captured=0; p.rondaRank=null; p.rondaClaimed=false; p.cuarentaClaimed=false; });

  await channel.send({ embeds: [new EmbedBuilder().setColor('#D8EDF0').setTitle('📊 Hand Over — Card Count Scoring')
    .setDescription(lines.join('\n') + '\n\n' + scoreBar(game))] });

  // Check for winner
  const winner = game.players.find(p => p.score >= WIN_SCORE);
  if (winner) return endGame(channel, game, winner);

  // No winner yet — start a new hand (reset deck and deal again)
  await new Promise(r => setTimeout(r, 2000)); // brief pause before new hand
  game.deck = buildDeck();
  game.dealCount = 0;
  game.table = [];
  game.dealerIdx = (game.dealerIdx + 1) % game.numPlayers;
  await doDeal(channel, game, false);
}

// ─── End game ─────────────────────────────────────────────────────────────────
async function endGame(channel, game, winner) {
  if (game.phase === 'ended') return;
  game.phase = 'ended';
  activeGames.delete(game.channelId);
  if (game.turnMessage) game.turnMessage.edit({ components: turnButtons(true) }).catch(()=>{});

  const pot = game.bet * game.players.filter(p=>!p.isBot).length;
  if (game.mode==='2v2') {
    const team = game.players.filter(p=>p.team===winner.team&&!p.isBot);
    const share = Math.floor((game.bet*game.numPlayers) / team.length);
    for (const p of team) { await economy.addFunds(p.id, share, 'Cuarenta win'); await stats.increment(p.id,'cuarenta_wins'); }
    for (const p of game.players.filter(p=>p.team!==winner.team&&!p.isBot)) await stats.increment(p.id,'cuarenta_losses');
    await channel.send({ embeds: [new EmbedBuilder().setColor('#F2F5E0').setTitle(`${E.TROPHY} Cuarenta (Ecuadorian) — ¡Ganaron! 🇪🇨`)
      .setDescription(`**${winner.team===0?'Team A':'Team B'}** wins!\n🏆 ${team.map(p=>p.username).join(' & ')}\n${E.BB_COIN} Each gets **${share.toLocaleString()} oops**! 🇪🇨\n\n📊 Final: ${scoreBar(game)}`)] });
  } else {
    const humanWinner = winner.isBot ? null : winner;
    if (humanWinner) {
      await economy.addFunds(humanWinner.id, game.bet*game.numPlayers, 'Cuarenta win');
      await stats.increment(humanWinner.id, 'cuarenta_wins');
    }
    for (const p of game.players.filter(p=>!p.isBot&&p.id!==winner.id)) await stats.increment(p.id,'cuarenta_losses');
    await channel.send({ embeds: [new EmbedBuilder().setColor('#F2F5E0').setTitle(`${E.TROPHY} ${winner.isBot?'Bot Wins!':'¡Ganaste! 🇪🇨'}`)
      .setDescription(`**${winner.username}** wins with **${winner.score} pts**! 🇪🇨\n${humanWinner?`${E.BB_COIN} Prize: **${(game.bet*game.numPlayers).toLocaleString()} oops**!`:''}\n\n📊 Final: ${scoreBar(game)}`)] });
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────
async function cancelGame(channelId, channel, requesterId, replyFn) {
  const game = activeGames.get(channelId);
  if (!game) return replyFn(`${E.ERROR} No active Cuarenta game here.`);
  const isPlayer = game.players.find(p=>p.id===requesterId);
  const member   = channel.guild?.members.cache.get(requesterId);
  const isAdmin  = member && (member.permissions.has('Administrator') || member.roles.cache.some(r=>r.name===(process.env.ADMIN_ROLE||'Admin')));
  if (!isPlayer && !isAdmin) return replyFn(`${E.ERROR} Only players or admins can cancel.`);
  for (const p of game.players) if (!p.isBot) await economy.addFunds(p.id, game.bet, 'Cuarenta cancelled');
  if (game.turnMessage) game.turnMessage.edit({ components: turnButtons(true) }).catch(()=>{});
  game.phase = 'ended';
  activeGames.delete(channelId);
  replyFn(`${E.SUCCESS} Game cancelled. All players refunded.`);
}

// ─── Bot AI ───────────────────────────────────────────────────────────────────
async function doBotTurn(channel, game) {
  if (game.phase !== 'playing') return;
  const botIdx = game.currentPlayerIdx;
  const bot    = game.players[botIdx];
  const hand   = game.hands[botIdx];

  // Bot ronda/cuarenta
  const special = checkRonda(hand);
  if (special?.type === 'cuarenta' && !bot.cuarentaClaimed) {
    bot.cuarentaClaimed = true;
    const four = hand.filter(c=>c.rank===special.rank);
    await channel.send({ embeds: [new EmbedBuilder().setColor('#F2F5E0').setTitle('🎊 CUARENTA! Bot Wins!')
      .setThumbnail(cardURL(four[0])).setDescription(`**${BOT_NAME}** reveals 4 × **${special.rank}**!\n**${BOT_NAME}** wins instantly!`)] });
    return endGame(channel, game, bot);
  }
  if (special?.type === 'ronda' && !bot.rondaClaimed) {
    bot.rondaClaimed = true; bot.rondaRank = special.rank; bot.score += 4;
    await channel.send({ embeds: [new EmbedBuilder().setColor('#E0F0E0').setTitle('🎵 Bot claims Ronda!')
      .setDescription(`**${BOT_NAME}** calls Ronda! *(secret rank)*\n**+4 pts** · ${scoreBar(game)}`)] });
    await new Promise(r=>setTimeout(r,1000));
  }

  // Choose card: capture if possible, else face card, else highest value
  let cardIdx = 0;
  let bestPts = -1;
  for (let i = 0; i < hand.length; i++) {
    const opts = getPossibleCaptures(hand[i], game.table, game.lastPlayedCard, game.lastPlayedBy, botIdx, bot.score);
    if (opts.length) {
      opts.sort((a,b)=>b.points-a.points||(b.allCaptured.length-a.allCaptured.length));
      if (opts[0].points > bestPts) { bestPts = opts[0].points; cardIdx = i; }
    }
  }
  if (bestPts === -1) {
    const faceIdx = hand.findIndex(c=>c.value===null);
    cardIdx = faceIdx !== -1 ? faceIdx : hand.reduce((best,c,i)=>((c.value??8)>(hand[best].value??8)?i:best),0);
  }

  await new Promise(r=>setTimeout(r,1500));
  await resolvePlay(channel, game, cardIdx);
}

// ─── Module exports ───────────────────────────────────────────────────────────
module.exports = {
  activeGames,

  async handleSlash(interaction, commandName) {
    if (commandName === 'cuarenta') {
      const mode  = interaction.options.getString('mode') || '1v1';
      const bet   = interaction.options.getInteger('bet') || 100;
      const vsBot = interaction.options.getBoolean('vsbot') || false;
      await interaction.reply({ content:'Starting...', ephemeral:true });
      await startGame(interaction.channel, interaction.user.id, interaction.user.username, mode==='2v2', bet,
        msg => interaction.editReply({ content: msg }), vsBot);
    }
    if (commandName === 'cuarentarules') {
      await interaction.reply({ embeds:[new EmbedBuilder().setColor('#D4D8F0')
        .setTitle(`${E.CUARENTA} Cuarenta (Ecuadorian) Rules`)
        .setThumbnail('https://deckofcardsapi.com/static/img/back.png')
        .setDescription(this.getRulesText())
        .setFooter({text:'Source: pagat.com'})], ephemeral:true });
    }
    if (commandName === 'cancelcuarenta') {
      await interaction.deferReply({ ephemeral:true });
      await cancelGame(interaction.channel.id, interaction.channel, interaction.user.id,
        msg => interaction.editReply({ content: msg }));
    }
  },

  async handleCommand(message, args, command) {
    if (command === 'cuarenta') {
      const is2v2 = args[0]?.toLowerCase() === '2v2';
      const vsBot = args.includes('bot');
      const bet   = parseInt(args.find(a=>!isNaN(parseInt(a)))) || 100;
      await startGame(message.channel, message.author.id, message.author.username, is2v2, bet,
        msg => message.reply(msg), vsBot);
    }
    if (command === 'cuarenta-rules' || command === 'cuarentarules') return this.showRules(message);
    if (command === 'cancelcuarenta') {
      await cancelGame(message.channel.id, message.channel, message.author.id, msg => message.reply(msg));
    }
  },

  getRulesText() {
    return [
      `**${E.CUARENTA} Cuarenta (Ecuadorian) — Rules** *(pagat.com)*\n`,
      `**🃏 Deck:** 40 cards — A 2 3 4 5 6 7 J Q K (remove 8s/9s/10s). A=1 … 7=7. J/Q/K have no value.\n`,
      `**🎮 Turn:** Press 👁 My Hand → see your cards → pick one to play.\n`,
      `**⚔️ Match:** Same rank as a table card → capture it.\n`,
      `**➕ Addition:** A–7 can capture table cards that add up to your card's value.\n`,
      `**🔢 Sequence:** After any capture, also take the next-higher card(s) from the table in unbroken order (A-2-3-4-5-6-7-J-Q-K).\n`,
      `**⚡ Caída +2pts:** Capturing the PREVIOUS player's last card by matching = Caída.\n`,
      `**✨ Limpia +2pts:** Clearing the table completely. Caída y Limpia = +4pts.\n`,
      `**🎵 Ronda:** 3 of same rank after deal → press Ronda button → +4pts (rank secret). Opponent earns +10pts if they Caída a Ronda card.\n`,
      `**🎊 Cuarenta:** 4 of same rank → press Cuarenta button → instant win!\n`,
      `**⚠️ At 38pts:** You can ONLY win with a pure Caída (+2pts = exactly 40). Limpia doesn't score.\n`,
      `**📊 Card scoring** (end of each deal): 20 cards=6pts, each extra pair=+2pts. Under 20: most cards=2pts.\n`,
      `**🏆 Win:** Reach exactly **40 points**. Overshooting caps at 39.`,
    ].join('\n');
  },

  async showRules(message) {
    return message.reply({ embeds:[new EmbedBuilder().setColor('#D4D8F0')
      .setTitle(`${E.CUARENTA} Cuarenta (Ecuadorian) Rules`)
      .setThumbnail('https://deckofcardsapi.com/static/img/back.png')
      .setDescription(this.getRulesText())
      .setFooter({text:'Source: pagat.com'})] });
  }
};
