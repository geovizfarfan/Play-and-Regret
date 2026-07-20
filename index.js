/**
 * Play & Regret — index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Currency: sins | Prefix: ! | Bot: Play & Regret#1851
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
} = require('discord.js');

const { initDB }      = require('./src/utils/database');
const E               = require('./src/utils/emojis');
const shopUtil        = require('./src/utils/shop');
const jackpotUtil     = require('./src/utils/jackpot');

// ── Modules ───────────────────────────────────────────────────────────────────
const economyModule   = require('./src/economy/boardbucks');
const dailyModule     = require('./src/economy/daily');
const bettingModule   = require('./src/economy/betting');
const itemsModule     = require('./src/economy/items');
const gambleModule    = require('./src/economy/gamble');
const dropsModule     = require('./src/economy/drops');
const rgModule        = require('./src/games/regretgames');
const jackpotModule   = require('./src/economy/jackpot');

const blackjackModule = require('./src/games/blackjack');
const cuarentaModule  = require('./src/games/cuarenta');
const guineaModule    = require('./src/games/guineapig');
const loteriaModule   = require('./src/games/loteria');
const memoryModule    = require('./src/games/memory');
const tttModule       = require('./src/games/tictactoe/tictactoe');
const shopModule      = require('./src/games/tictactoe/shop');

const rsModule        = require('./src/events/rumbleslaughter');

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

// ── Slash commands ────────────────────────────────────────────────────────────
const slashCommands = [
  // Economy
  new SlashCommandBuilder().setName('sins').setDescription('Check your sins balance')
    .addUserOption(o => o.setName('user').setDescription('User to check')),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily sins'),
  new SlashCommandBuilder().setName('transfer').setDescription('Send sins to another player')
    .addUserOption(o => o.setName('user').setDescription('Who to send to').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('beg').setDescription('Beg for sins (1hr cooldown)'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top 10 richest players'),
  new SlashCommandBuilder().setName('profile').setDescription('View player stats and balance')
    .addUserOption(o => o.setName('user').setDescription('User to view')),
  new SlashCommandBuilder().setName('give').setDescription('Admin: Give sins to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('take').setDescription('Admin: Remove sins from a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('grantsins').setDescription('Owner: Grant sins to a user (minted, untaxed, no balance deduction)')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to grant').setRequired(true).setMinValue(1)),

  // Betting
  new SlashCommandBuilder().setName('createbet').setDescription('Create a custom-outcome bet')
    .addStringOption(o => o.setName('title').setDescription('Bet title').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Comma-separated outcomes, e.g. Ecuador, Mexico, Draw').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Description'))
    .addIntegerOption(o => o.setName('hours').setDescription('Hours until close').setMinValue(1)),
  new SlashCommandBuilder().setName('bet').setDescription('Place a bet')
    .addIntegerOption(o => o.setName('id').setDescription('Bet ID').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(10)),
  new SlashCommandBuilder().setName('bets').setDescription('List open bets'),
  new SlashCommandBuilder().setName('betinfo').setDescription('Get bet details')
    .addIntegerOption(o => o.setName('id').setDescription('Bet ID').setRequired(true)),
  new SlashCommandBuilder().setName('mybets').setDescription('Your betting history'),
  new SlashCommandBuilder().setName('resolvebet').setDescription('Admin: Resolve a bet')
    .addIntegerOption(o => o.setName('id').setDescription('Bet ID').setRequired(true)),
  new SlashCommandBuilder().setName('cancelbet').setDescription('Admin: Cancel a bet and refund everyone')
    .addIntegerOption(o => o.setName('id').setDescription('Bet ID').setRequired(true)),
  new SlashCommandBuilder().setName('polymarket').setDescription('Browse Polymarket markets'),

  // Drops
  new SlashCommandBuilder().setName('bigbag').setDescription('Throw a big bag of sins!')
    .addIntegerOption(o => o.setName('amount').setDescription('Total sins to throw').setRequired(true).setMinValue(10)),
  new SlashCommandBuilder().setName('drop').setDescription('Drop sins — first to click wins!')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to drop').setRequired(true).setMinValue(1)),

  // Jackpot
  new SlashCommandBuilder().setName('richpot').setDescription('View the Rich Pot!'),
  new SlashCommandBuilder().setName('lotteryjoin').setDescription('Enter the lottery — 400 sins, pick 1-100')
    .addIntegerOption(o => o.setName('number').setDescription('Your number (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('jackpotdraw').setDescription('Admin: Trigger lottery draw'),
  new SlashCommandBuilder().setName('jackpothistory').setDescription('Past lottery winners'),
  new SlashCommandBuilder().setName('jackpotentries').setDescription('See who has entered'),
  new SlashCommandBuilder().setName('jackpotstart').setDescription('Admin: Start the jackpot')
    .addStringOption(o => o.setName('name').setDescription('Pot name').setRequired(false))
    .addStringOption(o => o.setName('mode').setDescription('Duration').setRequired(false).addChoices(
      {name:'Weekly (7 days)',value:'weekly'},
      {name:'Biweekly (15 days)',value:'biweekly'},
      {name:'Monthly (30 days)',value:'monthly'},
    ))
    .addStringOption(o => o.setName('pingrole').setDescription('Role to ping').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(false))
    .addIntegerOption(o => o.setName('entrycost').setDescription('Entry cost in sins (owner only)').setRequired(false).setMinValue(1)),
  new SlashCommandBuilder().setName('jackpotstop').setDescription('Admin: Stop the jackpot'),

  // Tic-Tac-Bruh + Shop
  new SlashCommandBuilder().setName('tictacbruh').setDescription('Play Tic-Tac-Bruh!')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet in sins').setRequired(true).setMinValue(10))
    .addUserOption(o => o.setName('opponent').setDescription('Challenge a specific player'))
    .addBooleanOption(o => o.setName('vsbot').setDescription('Play against the bot')),
  new SlashCommandBuilder().setName('buy').setDescription('Buy a token')
    .addStringOption(o => o.setName('token').setDescription('Token ID (leave blank to browse)').setRequired(false)),
  new SlashCommandBuilder().setName('inventory').setDescription('View and equip your tokens'),

  // Blackjack
  new SlashCommandBuilder().setName('blackjack').setDescription('Start a Blackjack game!')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet in sins (default 50)').setMinValue(10))
    .addStringOption(o => o.setName('mode').setDescription('Solo or Multiplayer').addChoices(
      {name:'Solo — you vs dealer',value:'solo'},
      {name:'Multiplayer — everyone vs dealer',value:'multi'},
    ))
    .addStringOption(o => o.setName('duration').setDescription('Signup window (multiplayer)').addChoices(
      {name:'30 seconds',value:'30s'},{name:'1 minute',value:'1m'},
      {name:'2 minutes',value:'2m'},{name:'5 minutes',value:'5m'},
    ))
    .addIntegerOption(o => o.setName('timer').setDescription('Custom signup time in seconds').setMinValue(10).setMaxValue(600)),

  // Lotería
  new SlashCommandBuilder().setName('loteria').setDescription('Start a Lotería game')
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in Sins (10% goes to jackpot)').setMinValue(10))
    .addStringOption(o => o.setName('mode').setDescription('Auto or Manual').addChoices(
      {name:'Auto (you view board, see called cards)',value:'auto'},
      {name:'Manual (you click to mark your board)',value:'manual'},
    ))
    .addStringOption(o => o.setName('timestamp').setDescription('Optional: Discord timestamp to auto-start <t:...:F>').setRequired(false))
    .addIntegerOption(o => o.setName('speed').setDescription('Seconds between cards (5-60, default 10)').setMinValue(5).setMaxValue(60)),
  new SlashCommandBuilder().setName('loteriarules').setDescription('How to play Lotería'),

  // Cuarenta
  new SlashCommandBuilder().setName('cuarenta').setDescription('Start a Cuarenta game')
    .addStringOption(o => o.setName('mode').setDescription('Game mode').addChoices({name:'1v1',value:'1v1'},{name:'2v2',value:'2v2'}))
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in sins').setMinValue(10))
    .addBooleanOption(o => o.setName('vsbot').setDescription('Play against the bot')),
  new SlashCommandBuilder().setName('cuarentarules').setDescription('How to play Cuarenta'),

  // Find the Cuy
  new SlashCommandBuilder().setName('findthecuy').setDescription('Find the hidden cuy to win!')
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in sins (default 50)').setMinValue(10))
    .addIntegerOption(o => o.setName('rounds').setDescription('Number of rounds (default 5)').setMinValue(1).setMaxValue(15))
    .addIntegerOption(o => o.setName('points').setDescription('Points per find (default 1)').setMinValue(1).setMaxValue(100)),

  // Memory Game
  new SlashCommandBuilder().setName('memory').setDescription('Play the Memory Game!')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet in sins (default 50)').setMinValue(10))
    .addStringOption(o => o.setName('mode').setDescription('Solo or Multiplayer').addChoices(
      {name:'Solo — you vs the clock',value:'solo'},
      {name:'Multiplayer — take turns',value:'multi'},
    ))
    .addStringOption(o => o.setName('size').setDescription('Board size').addChoices(
      {name:'3×4 Small (6 pairs)',value:'small'},
      {name:'4×4 Medium (8 pairs)',value:'medium'},
      {name:'4×5 Large (10 pairs)',value:'large'},
    )),
  new SlashCommandBuilder().setName('memoryleaderboard').setDescription('Memory Game fastest solves')
    .addStringOption(o => o.setName('size').setDescription('Board size').addChoices(
      {name:'3×4 Small',value:'small'},
      {name:'4×4 Medium',value:'medium'},
      {name:'4×5 Large',value:'large'},
    )),

  // Rumble Slaughter
  new SlashCommandBuilder().setName('rumbleslaughter').setDescription('Start Rumble Slaughter: You Thought You Ate')
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in sins').setRequired(true).setMinValue(10))
    .addStringOption(o => o.setName('timestamp').setDescription('Discord timestamp to schedule <t:...:F>').setRequired(false))
    .addStringOption(o => o.setName('era').setDescription('Choose an era for this game').setRequired(false).addChoices(
      { name: 'Default', value: 'default' },
      { name: 'Gut Feeling Era', value: 'gut feeling era' },
      { name: 'Darling I Bite', value: 'darling i bite' },
      { name: 'Baddie Body Count', value: 'baddie body count' },
      { name: 'Kiss Then Kill', value: 'kiss then kill' },
      { name: 'Eat or Be Eaten', value: 'eat or be eaten' },
      { name: 'Blood Buffet', value: 'blood buffet' },
      { name: 'Served You Wrong', value: 'served you wrong' },
      { name: 'No Survivors Era', value: 'no survivors era' },
      { name: 'You Thought Wrong', value: 'you thought wrong' },
      { name: 'Delulu Destroyer', value: 'delulu destroyer' },
      { name: 'Eat Dirt Era', value: 'eat dirt era' },
    ))
    .addStringOption(o => o.setName('mode').setDescription('Match mode').setRequired(false).addChoices(
      {name:'Staff vs Members',value:'staffvsmembers'},
      {name:'Role vs Role',value:'rolevrole'},
    ))
    .addRoleOption(o => o.setName('rolerestrict').setDescription('Restrict to this role only').setRequired(false))
    .addRoleOption(o => o.setName('rolea').setDescription('Team A role (Role vs Role mode)').setRequired(false))
    .addRoleOption(o => o.setName('roleb').setDescription('Team B role (Role vs Role mode)').setRequired(false)),
  new SlashCommandBuilder().setName('rsprofile').setDescription('View your Rumble Slaughter profile — level, power, kills, gear')
    .addUserOption(o => o.setName('user').setDescription('User to view')),
  new SlashCommandBuilder().setName('rsleaderboard').setDescription('Rumble Slaughter XP leaderboard'),
  new SlashCommandBuilder().setName('openbackpack').setDescription('Open one of your backpacks')
    .addStringOption(o => o.setName('type').setDescription('Backpack type').setRequired(true).addChoices(
      {name:'Basic',value:'basic'},{name:'Royal',value:'royal'},{name:'Cursed',value:'cursed'},
    )),
  new SlashCommandBuilder().setName('rsinventory').setDescription('View your Rumble Slaughter inventory'),
  new SlashCommandBuilder().setName('rsjoin').setDescription('Join the open Rumble Slaughter game'),
  new SlashCommandBuilder().setName('setemoji').setDescription('Set your Rumble Slaughter emoji tag')
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true)),
  new SlashCommandBuilder().setName('pickemoji').setDescription('Pick your animated arena emoji from the server pool (level 10+)'),
  new SlashCommandBuilder().setName('addemoji').setDescription('Add second emoji tag (level 20+)')
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true)),
  new SlashCommandBuilder().setName('rig').setDescription('Admin: rig a player')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption(o => o.setName('level').setDescription('Rig level').setRequired(true).addChoices(
      {name:'Petty',value:'petty'},{name:'Favorite',value:'favorite'},
      {name:'Main Character',value:'maincharacter'},{name:'None',value:'none'},
    )),
  new SlashCommandBuilder().setName('unrig').setDescription('Admin: remove rig from player')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)),
  new SlashCommandBuilder().setName('staffrole').setDescription('Admin: set Staff vs Members role')
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),
  new SlashCommandBuilder().setName('riggedmode').setDescription('Admin: set rigged mode visibility')
    .addStringOption(o => o.setName('mode').setDescription('Mode').setRequired(true).addChoices(
      {name:'Public',value:'public'},{name:'Hidden',value:'hidden'},
    )),
  new SlashCommandBuilder().setName('rigrandom').setDescription('Admin: toggle secret chosen menace')
    .addStringOption(o => o.setName('state').setDescription('on or off').setRequired(true).addChoices(
      {name:'On',value:'on'},{name:'Off',value:'off'},
    )),
  // ── Regret Games ───────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('rg').setDescription('The Regret Games commands')
    // Host commands
    .addSubcommand(s => s.setName('go').setDescription('Start the game when ready (after signups)'))
    .addSubcommand(s => s.setName('startgame').setDescription('Open signups and start the game')
      .addIntegerOption(o => o.setName('fee').setDescription('Entry fee in sins').setRequired(false).setMinValue(1))
      .addStringOption(o => o.setName('time').setDescription('Optional start timestamp <t:...:F>').setRequired(false)))

    // Player commands
    .addSubcommand(s => s.setName('join').setDescription('Join the Regret Games'))
    .addSubcommand(s => s.setName('vote').setDescription('Cast your vote'))
    .addSubcommand(s => s.setName('steal').setDescription('Steal sins from another player')
      .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)))
    .addSubcommand(s => s.setName('betray').setDescription('Betray your alliance partner')
      .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)))
    .addSubcommand(s => s.setName('ally').setDescription('Form an alliance')
      .addUserOption(o => o.setName('user').setDescription('Ally').setRequired(true)))
    .addSubcommand(s => s.setName('breakally').setDescription('Break your alliance'))
    .addSubcommand(s => s.setName('buy').setDescription('Buy an item from the shop'))
    .addSubcommand(s => s.setName('status').setDescription('View current game status'))
    .addSubcommand(s => s.setName('recap').setDescription('View elimination timeline, votes and betrayals')),

  new SlashCommandBuilder().setName('eras').setDescription('List all available Rumble Slaughter eras'),
  new SlashCommandBuilder().setName('shop').setDescription('Open the game shop'),
  new SlashCommandBuilder().setName('setera').setDescription('Pick a Rumble Slaughter era from a dropdown menu'),
  new SlashCommandBuilder().setName('rsmatchstats').setDescription('See the last Rumble Slaughter match recap'),
  new SlashCommandBuilder().setName('rshalloffame').setDescription('Rumble Slaughter Hall of Fame — most wins, wall of shame'),
  new SlashCommandBuilder().setName('givebackpack').setDescription('Admin: give backpacks')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(
      {name:'Basic',value:'basic'},{name:'Royal',value:'royal'},{name:'Cursed',value:'cursed'},
    ))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),

  // Help
  new SlashCommandBuilder().setName('cleanse').setDescription('Attempt to reduce your regret (12h cooldown — may backfire 💀)'),
  new SlashCommandBuilder().setName('confess').setDescription('Gamble your regret for chaotic outcomes (6h cooldown 😈)'),
  new SlashCommandBuilder().setName('cancel').setDescription('Cancel any active game in this channel and refund players'),
  new SlashCommandBuilder().setName('leave').setDescription('Leave the game you\'re currently in and get refunded'),
  new SlashCommandBuilder().setName('gamble').setDescription('Bet sins on a risk tier — safe, risky, or reckless')
    .addIntegerOption(o => o.setName('amount').setDescription('How much to bet').setRequired(true))
    .addStringOption(o => o.setName('tier').setDescription('Risk tier').setRequired(true).addChoices(
      {name:'Safe Bet (65% win, 1.45x)',value:'safe'},
      {name:'Risky Bet (40% win, 2.3x)',value:'risky'},
      {name:'Reckless Bet (20% win, 4.4x)',value:'reckless'},
    )),
  new SlashCommandBuilder().setName('items').setDescription('View your weekly streak items'),
  new SlashCommandBuilder().setName('use').setDescription('Use one of your weekly streak items')
    .addStringOption(o => o.setName('item').setDescription('Which item').setRequired(true).addChoices(
      {name:'Sin Vacuum',value:'sinvacuum'},{name:'Shield',value:'shield'},{name:'Bomb',value:'bomb'},
      {name:'Knife',value:'knife'},{name:'Roast',value:'roast'},{name:'Super Vacuum',value:'supervacuum'},{name:'Detonator',value:'detonator'},
    ))
    .addUserOption(o => o.setName('target').setDescription('Who to use it on (not needed for Shield/Super Vacuum)')),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
].map(cmd => cmd.toJSON());

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`<:checkmark:1495666088417956002> Play & Regret is online as ${client.user.tag}`);
  client.user.setActivity('/help | Play & Regret', { type: 4 });

  rsModule.init(client);

  // ── Startup refund — refund any players stuck in games from before restart ──
  try {
    const { economy: econ } = require('./src/utils/database');
    const pending = await econ.getPendingRefunds();
    if (pending.length > 0) {
      console.log(`[Startup] Refunding ${pending.length} players from crashed games...`);
      for (const p of pending) {
        if (p.bet > 0) {
          await econ.addFunds(p.user_id, p.bet, `Refund — ${p.game} interrupted by restart`);
          console.log(`[Startup] Refunded ${p.bet} sins to ${p.username} (${p.game})`);
          // Try to notify in the channel
          const ch = await client.channels.fetch(p.channel_id).catch(() => null);
          if (ch) await ch.send(`<:checkmark:1495666088417956002> **${p.username}** — refunded **${p.bet.toLocaleString()} Sins** from ${p.game} (bot restarted).`).catch(() => {});
        }
      }
      await econ.run('DELETE FROM active_game_players').catch(() => {});
      console.log('[Startup] All pending refunds processed.');
    } else {
      console.log('[Startup] No pending refunds.');
    }
  } catch(e) {
    console.error('[Startup] Refund error:', e.message);
  }

  // ── Give confirm/cancel buttons ──────────────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('give_confirm:')) {
      const [, senderId, targetId, amountStr] = interaction.customId.split(':');
      if (interaction.user.id !== senderId)
        return interaction.reply({ content: '<:wrong:1495666083594502174> This is not your transaction.', ephemeral: true });
      await interaction.deferUpdate();
      await economyModule.executeGive(senderId, targetId, parseInt(amountStr),
        async (data) => interaction.editReply({ embeds: typeof data === 'string' ? [] : data.embeds, content: typeof data === 'string' ? data : undefined, components: [] }),
        client
      );
    }
    if (interaction.customId.startsWith('give_cancel:')) {
      const [, senderId] = interaction.customId.split(':');
      if (interaction.user.id !== senderId)
        return interaction.reply({ content: '<:wrong:1495666083594502174> This is not your transaction.', ephemeral: true });
      await interaction.update({ embeds: [
        new EmbedBuilder().setColor('#333333').setDescription('Transfer cancelled.')
      ], components: [] });
    }
  });
  rgModule.init(client);

  // Clear stuck RG season — admin/owner only
  client.on('messageCreate', async msg => {
    if (msg.author?.bot) return;
    if (msg.content?.trim() !== '!rgreset') return;
    try {
      const { db: resetDb } = require('./src/utils/database');
      await resetDb.run("UPDATE rg_seasons SET status = 'ended' WHERE status IN ('signup', 'active')");
      await msg.reply('<:checkmark:1495666088417956002> Regret Games cleared. You can now run `/rg startgame`.');
    } catch(e) {
      await msg.reply('<:wrong:1495666083594502174> Failed: ' + e.message);
    }
  });

  // ── Unified shop picker ──────────────────────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('shop_picker:')) return;
    try {
    const userId = interaction.customId.split(':')[1];
    if (interaction.user.id !== userId)
      return interaction.reply({ content: '<:wrong:1495666083594502174> This menu is not for you.', ephemeral: true }).catch(()=>{});

    await interaction.deferUpdate().catch(() => {});

    if (interaction.values[0] === 'rs') {
      // Show RS inventory/shop
      const fakeMsg = {
        channel: interaction.channel,
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        reply: async (data) => interaction.followUp(typeof data === 'string' ? { content: data, ephemeral: true } : { ...data, ephemeral: true }),
        mentions: { users: { first: () => null } },
      };
      return rsModule.handleCommand(fakeMsg, [], 'rsinventory');
    }

    if (interaction.values[0] === 'rg') {
      return rgModule.shop(interaction);
    }
    if (interaction.values[0] === 'ttb') {
      const fakeMsg = {
        channel: interaction.channel,
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        reply: async (data) => interaction.followUp(typeof data === 'string' ? { content: data, ephemeral: true } : { ...data, ephemeral: true }),
        mentions: { users: { first: () => null } },
      };
      return shopModule.handleCommand(fakeMsg, [], 'shop');
    }
    } catch(e) { console.error('[shop picker error]', e.message); }
  });
  jackpotModule.initScheduler(client);
  jackpotModule._client = client;

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: slashCommands });
      console.log(`<:checkmark:1495666088417956002> Slash commands registered to guild ${process.env.GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
      console.log('<:checkmark:1495666088417956002> Slash commands registered globally');
    }
  } catch (err) {
    console.error('<:wrong:1495666083594502174> Failed to register slash commands:', err.message);
  }
});

// ── Slash handler ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('oops_rich_modal:') ||
        interaction.customId.startsWith('sins_rich_modal:')) {
      return jackpotModule.handleModal(interaction);
    }
    return;
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('shop:')) return shopModule.handleSelect(interaction);
    const richMenus = ['richpot_view','richpot_draw','richpot_stop','richpot_entries','richpot_live'];
    if (richMenus.some(id => interaction.customId.startsWith(id))) return jackpotModule.handleSelect(interaction);
    return;
  }
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('oops_rich_join:') ||
        interaction.customId.startsWith('sins_rich_join:')) {
      return jackpotModule.handleButton(interaction);
    }
    if (interaction.customId.startsWith('lot_')) {
      return loteriaModule.handleButton(interaction);
    }
    if (interaction.customId.startsWith('bet_resolve_') || interaction.customId.startsWith('bet_quick_') || interaction.customId.startsWith('bet_amt_') || interaction.customId.startsWith('bet_pick_') || interaction.customId.startsWith('bet_select_') || interaction.customId.startsWith('bet_cancel_')) {
      try {
        return await bettingModule.handleButton(interaction);
      } catch (err) {
        console.error('[Betting button error]', err);
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ content: 'Something went wrong with that bet action.', ephemeral: true }).catch(() => {});
        }
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  try {
    // Economy
    if (['daily','cleanse','confess'].includes(commandName))
      return await dailyModule.handleSlash(interaction, commandName);
    if (commandName === 'shop') {
      const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`shop_picker:${interaction.user.id}`)
          .setPlaceholder('Which shop?')
          .addOptions([
            { label: '⚔️ Rumble Slaughter', value: 'rs', description: 'Backpacks, items and inventory' },
            { label: '☠️ Regret Games',     value: 'rg', description: 'Power-ups, shields and tricks' },
            { label: '<:conroller:1511532204415778897> Tic-Tac-Bruh',     value: 'ttb', description: 'Token store for TTB customization' },
          ])
      );
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor('#C9B1FF')
          .setTitle('<:pd_zPurple_Pin:1495665628672037046> Game Shop')
          .setDescription('Pick a game to view its shop:')
      ], components: [row], ephemeral: true });
    }
    if (commandName === 'rg') {
      const sub = interaction.options.getSubcommand();
      switch(sub) {
        // Host
        case 'startgame':   return await rgModule.startGame(interaction);
        case 'go':          return await rgModule.go(interaction);
        // Player
        case 'join':        return await rgModule.join(interaction);
        case 'vote':        return await rgModule.vote(interaction);
        case 'steal':       return await rgModule.steal(interaction);
        case 'betray':      return await rgModule.betray(interaction);
        case 'ally':        return await rgModule.ally(interaction);
        case 'breakally':   return await rgModule.breakAlly(interaction);
        case 'buy':         return await rgModule.buy(interaction);
        case 'status':      return await rgModule.status(interaction);
        case 'recap':       return await rgModule.recap(interaction);
      }
    }
    if (['sins','transfer','beg','leaderboard','profile','give','take','grantsins','taxcalc'].includes(commandName))
      return await economyModule.handleSlash(interaction, commandName);

    // Betting
    if (['createbet','bet','bets','betinfo','mybets','resolvebet','cancelbet','polymarket'].includes(commandName))
      return await bettingModule.handleSlash(interaction, commandName);

    // Drops
    if (['bigbag','drop'].includes(commandName))
      return await dropsModule.handleSlash(interaction, commandName);

    // Jackpot
    if (['richpot','lotteryjoin','jackpotdraw','jackpothistory','jackpotstart','jackpotstop','jackpotentries'].includes(commandName))
      return await jackpotModule.handleSlash(interaction);

    // TTB + Shop
    if (['tictacbruh','ttt'].includes(commandName))
      return await tttModule.handleSlash(interaction);
    if (['buy','inventory'].includes(commandName))
      return await shopModule.handleSlash(interaction);

    // Blackjack
    if (['blackjack'].includes(commandName))
      return await blackjackModule.handleSlash(interaction, commandName);

    // Lotería
    if (['loteria','loteriarules'].includes(commandName))
      return await loteriaModule.handleSlash(interaction, commandName);

    // Cuarenta
    if (['cuarenta','cuarentarules'].includes(commandName))
      return await cuarentaModule.handleSlash(interaction, commandName);

    // Find the Cuy
    if (commandName === 'findthecuy')
      return await guineaModule.handleSlash(interaction, commandName);

    // Memory
    if (['memory','memoryleaderboard'].includes(commandName))
      return await memoryModule.handleSlash(interaction, commandName);

    // Rumble Slaughter
    if (['rumbleslaughter','rsprofile','rsleaderboard','openbackpack','rsinventory',
         'rsjoin','eras','setera','rsmatchstats','rshalloffame',
         'setemoji','addemoji','pickemoji','rig','unrig','staffrole','riggedmode','rigrandom','givebackpack'].includes(commandName))
      return await rsModule.handleSlash(interaction, commandName);

    // Help
    if (commandName === 'cancel') return await handleUniversalCancel(interaction);
    if (commandName === 'leave')  return await handleUniversalLeave(interaction);

    if (commandName === 'gamble') {
      const amount = interaction.options.getInteger('amount');
      const tier   = interaction.options.getString('tier');
      await interaction.deferReply();
      const fakeMsg = { author: interaction.user, reply: (d) => interaction.editReply(d) };
      return await gambleModule.gamble(fakeMsg, [String(amount), tier]);
    }
    if (commandName === 'items') {
      await interaction.deferReply({ ephemeral: true });
      const fakeSource = { reply: (d) => interaction.editReply(d) };
      return await itemsModule.showItems(fakeSource, interaction.user.id, interaction.user.username);
    }
    if (commandName === 'use') {
      const itemArg = interaction.options.getString('item');
      const target  = interaction.options.getUser('target');
      await interaction.deferReply();
      const fakeMsg = {
        author: interaction.user, guild: interaction.guild, channel: interaction.channel,
        mentions: { users: { first: () => target || null } },
        reply: (d) => interaction.editReply(d),
      };
      return await itemsModule.useItem(fakeMsg, [itemArg]);
    }

    if (commandName === 'help') return await sendHelpSlash(interaction);

  } catch (err) {
    console.error(`Error in /${commandName}:`, err);
    const reply = { content: '<:wrong:1495666083594502174> Something went wrong! Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(reply).catch(() => {});
    else interaction.reply(reply).catch(() => {});
  }
});

// ── Prefix handler ─────────────────────────────────────────────────────────────
const PREFIX = process.env.PREFIX || '!';
// ── Detonator effect — deletes a detonated user's messages for their active window ──
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (itemsModule.isDetonated(message.author.id, message.channel.id)) {
    await message.delete().catch(() => {});
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  try {
    if (['daily','cleanse','confess'].includes(command))
      return await dailyModule.handleCommand(message, args, command);
    if (['balance','bal','sins','give','take','transfer','beg','leaderboard','lb','stats','profile','grantsins','richest','taxcalc','history','guide','faq','help'].includes(command))
      return await economyModule.handleCommand(message, args, command);

    if (command === 'gamble')
      return await gambleModule.gamble(message, args);
    if (command === 'items')
      return await itemsModule.showItems(message, message.author.id, message.author.username);
    if (command === 'use')
      return await itemsModule.useItem(message, args);

    if (['createbet','bet','bets','resolvebet','betinfo','cancelbet','mybets','polymarket'].includes(command))
      return await bettingModule.handleCommand(message, args, command);

    if (['bigbag','drop'].includes(command))
      return await dropsModule.handleCommand(message, args, command);

    if (['jackpot','richpot','lottery','enter','lotteryenter','jackpotdraw','jackpothistory',
         'jackpotstart','jackpotstop','jackpotentries','potentries'].includes(command))
      return await jackpotModule.handleCommand(message, args, command);

    if (['ttt','tictactoe','tictacbruh'].includes(command))
      return await tttModule.handleCommand(message, args, command);

    if (['buy','myitems','inventory'].includes(command))
      return await shopModule.handleCommand(message, args, command);

    if (['blackjack','bj'].includes(command))
      return await blackjackModule.handleCommand(message, args, command);

    if (['loteria','loteria-manual','join','loteria-rules','loteriarules','loteria-go','loteriago','loteriamanugo','loteria-draw','loteriadraw'].includes(command))
      return await loteriaModule.handleCommand(message, args, command);

    if (['cuarenta','cuarenta-rules','cuarentarules','table','hand'].includes(command))
      return await cuarentaModule.handleCommand(message, args, command);

    if (command === 'findthecuy') return await guineaModule.handleCommand(message, args);

    if (['memory','memoryleaderboard'].includes(command))
      return await memoryModule.handleCommand(message, args, command);

    if (['rumbleslaughter','rs','rsjoin','rsenter','rsprofile','rsp','rsleaderboard','rslb','rsstats',
         'openbackpack','rsbag','rsinventory','rsinv','rschedule',
         'eras','rseras','rsmatchstats','rsrecap','rshalloffame','rshof',
         'rig','unrig','rigrole','rigrandom','riggedmode','staffrole','givebackpack',
         'setemoji','addemoji','pickemoji','animemoji','startgame'].includes(command))
      return await rsModule.handleCommand(message, args, command);

    if (command === 'cancel') return await handleUniversalCancelMsg(message);
    if (command === 'leave')  return await handleUniversalLeaveMsg(message);
    // Regret Games prefix shortcuts
    if (command === 'rg') {
      const sub = args[0];
      const subArgs = args.slice(1);
      if (sub === 'startgame') return await rgModule.startGame({ ...message, options: { getInteger: (k) => k === 'fee' ? parseInt(subArgs.find(a => a.startsWith('fee:'))?.split(':')[1]) || 500 : null, getString: () => null }, guild: message.guild, channel: message.channel, member: message.member, user: message.author, reply: async (d) => message.reply(d), client: client });
      if (sub === 'go')        return await rgModule.go({ guild: message.guild, channel: message.channel, member: message.member, user: message.author, reply: async (d) => message.reply(d), client: client });
      if (sub === 'status')    return await rgModule.status({ guild: message.guild, channel: message.channel, member: message.member, user: message.author, reply: async (d) => message.reply(d) });
      if (sub === 'recap')     return await rgModule.recap({ guild: message.guild, channel: message.channel, member: message.member, user: message.author, reply: async (d) => message.reply(d) });
    }
    if (command === 'help' || command === 'commands')
      return await sendHelp(message);

  } catch (err) {
    console.error(`Error in !${command}:`, err);
    message.reply('<:wrong:1495666083594502174> Something went wrong!').catch(() => {});
  }
});

// ── Help ──────────────────────────────────────────────────────────────────────
async function sendHelpSlash(interaction) {
  await interaction.reply({ embeds: buildHelpEmbeds(), ephemeral: true });
}
async function sendHelp(message) {
  return message.reply({ embeds: buildHelpEmbeds() });
}

function buildHelpEmbeds() {
  const main = new EmbedBuilder()
    .setColor('#FFE4A0')
    .setTitle(`${E.BB_COIN} Play & Regret — Commands`)
    .setDescription('Use `/command` or `!command` — both work!\n\u200b')
    .addFields(
      { name: `${E.BB_COIN} Economy`, value: [
        '`/balance` `!bal` — Check your sins balance',
        '`/daily` `!daily` — Claim daily sins (every 7th day drops a bonus item)',
        '`/beg` `!beg` — Beg for sins (1hr cooldown)',
        '`/transfer @user amount` — Send sins',
        '`/leaderboard` `!lb` — Top 10 richest',
        '`/profile` `!profile` — Your stats',
        '`/gamble amount tier` — Bet sins on safe/risky/reckless odds',
        '`/items` `!items` — View your weekly streak items',
        '`/use item @target` — Use a weekly item',
      ].join('\n') },
      { name: `${E.BET_DICE} Bet & Regret`, value: [
        '`/createbet title` — Create a yes/no bet',
        '`/bet id side amount` — Place a bet',
        '`/bets` — Open bets',
        '`/resolvebet id outcome` — *(Admin)* Resolve',
        '`/polymarket` — Browse Polymarket',
      ].join('\n') },
      { name: `💸 Drops`, value: [
        '`/drop amount` — Drop sins, first click wins',
        '`/bigbag amount` — Throw a bag, everyone grabs',
      ].join('\n') },
      { name: `<a:jackpot:1479203793806557385> Rich Pot`, value: [
        '`/richpot` — View the jackpot',
        '`/lotteryjoin number` — Enter (400 sins, pick 1-100)',
        '`/jackpothistory` — Past winners',
        '`/jackpotstart` *(Admin)* — Start a pot',
      ].join('\n') },
    )
    .setFooter({ text: 'Page 1/2 • Play & Regret' });

  const games = new EmbedBuilder()
    .setColor('#FFB3B3')
    .setTitle('<:conroller:1511532204415778897> Games — Commands')
    .addFields(
      { name: '✖️ Tic-Tac-Bruh', value: [
        '`/tictacbruh bet` — Challenge someone (bet required)',
        '`/inventory` — View & equip your tokens',
      ].join('\n') },
      { name: '<a:cards:1511530261551124561> Blackjack', value: '`/blackjack bet` — Solo or Multiplayer vs dealer' },
      { name: '🎴 Lotería', value: [
        '`/loteria bet` — Start a Lotería game',
        '`/loteriarules` — How to play',
      ].join('\n') },
      { name: '<a:cards:1511530261551124561> Cuarenta', value: [
        '`/cuarenta bet` — Start Cuarenta (1v1 or 2v2)',
        '`/cuarentarules` — How to play',
      ].join('\n') },
      { name: '🐹 Find the Cuy', value: '`/findthecuy` — Click the hidden cuy to win!' },
      { name: '<a:brain:1511530555588612126> Memory', value: '`/memory` — Match emoji pairs (solo or multiplayer)' },
      { name: '🗡️ Rumble Slaughter', value: [
        '`/rumbleslaughter bet [timestamp]` — Start the arena',
        '`!rsjoin` or click Join — Enter',
        '`/rsprofile` — Level, power, kills, gear, all in one place',
        '`/rsleaderboard` — XP leaderboard',
        '`/openbackpack` — Open a backpack',
      ].join('\n') },
    )
    .setFooter({ text: 'Page 2/2 • Play & Regret' });

  return [main, games];
}

// ── Universal Cancel ─────────────────────────────────────────────────────────
async function handleUniversalCancel(interaction) {
  await interaction.deferReply({ ephemeral: false }).catch(() => {});
  const ch = interaction.channel;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const fakeReply = async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg } : msg);
  return await tryCancelAll(ch, userId, username, fakeReply, interaction.guild?.id);
}

async function handleUniversalCancelMsg(message) {
  const ch = message.channel;
  const userId = message.author.id;
  const username = message.author.username;
  return await tryCancelAll(ch, userId, username, msg => message.reply(msg), message.guild?.id);
}

// ─── Universal Leave ──────────────────────────────────────────────────────────
async function handleUniversalLeave(interaction) {
  const userId   = interaction.user.id;
  const username = interaction.user.username;
  const channel  = interaction.channel;
  const guildId  = interaction.guild?.id;
  await interaction.deferReply({ ephemeral: true });
  const msg = await tryLeave(channel, userId, username, guildId);
  return interaction.editReply(msg);
}

async function handleUniversalLeaveMsg(message) {
  const userId   = message.author.id;
  const username = message.author.username;
  const channel  = message.channel;
  const guildId  = message.guild?.id;
  const msg = await tryLeave(channel, userId, username, guildId);
  return message.reply(msg);
}

async function tryLeave(channel, userId, username, guildId) {
  const channelId = channel.id;
  const { db: leaveDb, economy: leaveEconomy } = require('./src/utils/database');

  // ── Regret Games ────────────────────────────────────────────────────────────
  try {
    const resolvedId = guildId || '';
    const rgSeason = resolvedId
      ? await leaveDb.get("SELECT * FROM rg_seasons WHERE guild_id = $1 AND status = 'signup'", [resolvedId]).catch(() => null)
      : null;
    const rgPlayer = rgSeason
      ? await leaveDb.get('SELECT * FROM rg_players WHERE season_id = $1 AND user_id = $2', [rgSeason.id, userId]).catch(() => null)
      : null;

    if (rgPlayer) {
      await leaveDb.run('DELETE FROM rg_players WHERE season_id = $1 AND user_id = $2', [rgSeason.id, userId]);
      await leaveDb.run('UPDATE rg_seasons SET pot = pot - $1 WHERE id = $2', [rgSeason.entry_fee, rgSeason.id]);
      await leaveEconomy.addFunds(userId, rgSeason.entry_fee, 'Regret Games leave refund');
      await channel.send(`<:wrong:1495666083594502174> **${username}** left the Regret Games. Refunded **${rgSeason.entry_fee} sins**. *Smart.*`).catch(() => {});
      return `<:checkmark:1495666088417956002> You left the Regret Games. **${rgSeason.entry_fee} sins** refunded.`;
    }
  } catch(e) {}

  // ── Rumble Slaughter ─────────────────────────────────────────────────────────
  try {
    const rsGame = activeGames?.get(channelId);
    if (rsGame && rsGame.phase === 'signup') {
      const rsPlayer = rsGame.players?.find(p => p.user_id === userId);
      if (rsPlayer) {
        rsGame.players = rsGame.players.filter(p => p.user_id !== userId);
        await leaveEconomy.addFunds(userId, rsGame.bet, 'Rumble Slaughter leave refund');
        await channel.send(`<:wrong:1495666083594502174> **${username}** left Rumble Slaughter. Refunded **${rsGame.bet} sins**.`).catch(() => {});
        return `<:checkmark:1495666088417956002> You left Rumble Slaughter. **${rsGame.bet} sins** refunded.`;
      }
    }
  } catch(e) {}

  // ── Blackjack ────────────────────────────────────────────────────────────────
  try {
    const bjGames = blackjackModule?.activeGames;
    if (bjGames?.has(channelId)) {
      const fakeMsg = { channel, author: { id: userId }, member: { permissions: { has: () => true } }, reply: () => {} };
      await blackjackModule.handleCommand(fakeMsg, [], 'stand');
      return `<:checkmark:1495666088417956002> You stood in Blackjack.`;
    }
  } catch(e) {}

  // ── Lotería ──────────────────────────────────────────────────────────────────
  try {
    const loteriaActive = require('./src/games/loteria');
    if (loteriaActive?.activeGames?.has(channelId)) {
      await loteriaActive.leaveGame?.(channelId, userId);
      return `<:checkmark:1495666088417956002> You left Lotería.`;
    }
  } catch(e) {}

  return `<:wrong:1495666083594502174> No active game found to leave in this channel.`;
}

async function tryCancelAll(channel, userId, username, replyFn, guildId = null) {
  const channelId = channel.id;
  let cancelled = false;
  let cancelMsg = '';

  // Try TTB — only if game exists in map
  try {
    const tttGames = tttModule.activeGames;
    if (tttGames && tttGames.has(channelId)) {
      const realMember = channel.guild ? await channel.guild.members.fetch(userId).catch(() => null) : null;
      let tttReply = '';
      const fakeMsg = { channel, author: { id: userId }, member: realMember, commandName: null, reply: (m) => { tttReply = typeof m === 'string' ? m : (m?.content || ''); } };
      await tttModule.cancelGame(fakeMsg);
      if (tttReply.includes('<:wrong:')) {
        return replyFn(tttReply);
      }
      cancelMsg = tttReply || '<:checkmark:1495666088417956002> Tic-Tac-Bruh cancelled and refunded.';
      cancelled = true;
    }
  } catch(e) {}

  // Try Blackjack — only if game exists in map
  try {
    if (!cancelled && blackjackModule.activeGames && blackjackModule.activeGames.has(channelId)) {
      const realMember = channel.guild ? await channel.guild.members.fetch(userId).catch(() => null) : null;
      let bjReply = '';
      await blackjackModule.handleCommand(
        { channel, author: { id: userId }, member: realMember, reply: (m) => { bjReply = typeof m === 'string' ? m : (m?.content || ''); } },
        [], 'cancelblackjack'
      );
      if (bjReply.includes('<:wrong:')) {
        return replyFn(bjReply);
      }
      cancelMsg = bjReply || '<:checkmark:1495666088417956002> Blackjack cancelled and refunded.';
      cancelled = true;
    }
  } catch(e) {}

  // Try Find the Cuy
  try {
    const { activeGames: cuyGames } = require('./src/games/guineapig');
    if (cuyGames?.has(channelId)) {
      const g = cuyGames.get(channelId);
      const member = channel.guild ? await channel.guild.members.fetch(userId).catch(() => null) : null;
      const isHost  = g.hostId === userId;
      const isAdmin = member && (member.permissions.has('Administrator') || member.roles.cache.some(r => r.name === (process.env.EVENT_HOST_ROLE || 'Event Host')));
      if (!isHost && !isAdmin) {
        return replyFn('<:wrong:1495666083594502174> Only the host or admins can cancel.');
      }
      cuyGames.delete(channelId);
      if (g?.timer) clearTimeout(g.timer);
      for (const p of (g?.players || []))
        await economy.addFunds(p.id, g.bet, 'Find the Cuy cancelled').catch(() => {});
      await economy.untrackGameChannel(channelId).catch(() => {});
      return replyFn(`<:checkmark:1495666088417956002> Find the Cuy cancelled. Players refunded.`);
    }
  } catch(e) {}

  // Try Lotería — only if active game map has this channel
  try {
    if (!cancelled) {
      const { activeGames: loteriaGames } = require('./src/games/loteria');
      if (loteriaGames && loteriaGames.has(channelId)) {
        let lotReply = '';
        await loteriaModule.cancelGame(channelId, userId, (m) => { lotReply = typeof m === 'string' ? m : (m?.content || ''); });
        if (lotReply.includes('<:wrong:')) {
          return replyFn(lotReply);
        }
        cancelMsg = lotReply || '<:checkmark:1495666088417956002> Lotería cancelled and refunded.';
        cancelled = true;
      }
    }
  } catch(e) {}

  // Try Cuarenta — only if active game exists
  try {
    if (!cancelled) {
      const { activeGames: cuarentaGames } = require('./src/games/cuarenta');
      if (cuarentaGames && cuarentaGames.has(channelId)) {
        let cqReply = '';
        await cuarentaModule.handleCommand(
          { channel, author: { id: userId }, reply: (m) => { cqReply = typeof m === 'string' ? m : (m?.content || ''); }, mentions: { users: { first: () => null } } },
          [], 'cancelcuarenta'
        );
        if (cqReply.includes('<:wrong:')) {
          return replyFn(cqReply);
        }
        cancelMsg = cqReply || '<:checkmark:1495666088417956002> Cuarenta cancelled and refunded.';
        cancelled = true;
      }
    }
  } catch(e) {}

  // Try Regret Games — check by guild ID from message
  try {
    if (!cancelled) {
      const { db: rgDb, economy: rgEconomy } = require('./src/utils/database');
      const resolvedGuildId = guildId || channel?.guild?.id || '';
      if (resolvedGuildId) {
        const rgActive = await rgDb.get(
          "SELECT id, guild_id FROM rg_seasons WHERE guild_id = $1 AND status IN ('signup','active')",
          [resolvedGuildId]
        ).catch(() => null);
        if (rgActive) {
          const member = channel.guild ? await channel.guild.members.fetch(userId).catch(() => null) : null;
          const isAdmin = member && (member.permissions.has('Administrator') || member.roles.cache.some(r => r.name === (process.env.ADMIN_ROLE || 'Admin')));
          if (!isAdmin) {
            return replyFn('<:wrong:1495666083594502174> Only admins can cancel Regret Games.');
          }
          // Clear all running timers
          const rgMod = require('./src/games/regretgames');
          const activeRGGames = rgMod.activeRGGames;
          const timers = activeRGGames ? (activeRGGames.get(resolvedGuildId) || []) : [];
          timers.forEach(t => clearTimeout(t));
          if (activeRGGames) activeRGGames.delete(resolvedGuildId);
          // Refund players
          const players = await rgDb.all("SELECT * FROM rg_players WHERE season_id = $1", [rgActive.id]).catch(() => []);
          const season  = await rgDb.get("SELECT * FROM rg_seasons WHERE id = $1", [rgActive.id]).catch(() => null);
          if (season) {
            const refundPer = season.entry_fee || 0;
            for (const p of players) await rgEconomy.addFunds(p.user_id, refundPer, 'Regret Games cancelled refund').catch(() => {});
          }
          await rgDb.run("UPDATE rg_seasons SET status = 'ended' WHERE id = $1", [rgActive.id]).catch(() => {});
          cancelMsg = `<:checkmark:1495666088417956002> Regret Games cancelled. ${players.length} player(s) refunded.`;
          cancelled = true;
        }
      }
    }
  } catch(e) { console.error('[cancel RG error]', e); }

  // Try Rumble Slaughter — only if a pending schedule or active game exists
  try {
    if (!cancelled) {
      const { db } = require('./src/utils/database');
      const rsActive = await db.get(
        "SELECT id FROM rs_schedules WHERE channel_id = ? AND status = 'pending'",
        [channelId]
      ).catch(() => null);
      if (rsActive) {
        const realMember = channel.guild ? await channel.guild.members.fetch(userId).catch(() => null) : null;
        let rsReply = '';
        await rsModule.handleCommand(
          { channel, author: { id: userId, username }, member: realMember, reply: (m) => { rsReply = typeof m === 'string' ? m : (m?.content || ''); }, mentions: { users: { first: () => null } } },
          [], 'cancelevent'
        );
        if (rsReply.includes('<:wrong:')) {
          return replyFn(rsReply);
        }
        cancelMsg = rsReply || '<:checkmark:1495666088417956002> Rumble Slaughter cancelled and players refunded.';
        cancelled = true;
      }
    }
  } catch(e) {}

  if (!cancelled) {
    return replyFn('<:wrong:1495666083594502174> No active game found in this channel.');
  }
  return replyFn(cancelMsg);
}

// ── Boot ────────────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('<:wrong:1495666083594502174> DISCORD_TOKEN is not set!');
  process.exit(1);
}

initDB()
  .then(async () => {
    await shopUtil.init();
    await jackpotUtil.init();
    client.login(token);
  })
  .catch(err => {
    console.error('<:wrong:1495666083594502174> Failed to initialize database:', err);
    process.exit(1);
  });
