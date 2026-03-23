require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder, Collection
} = require('discord.js');

const economyModule   = require('./economy/boardbucks');
const bettingModule   = require('./economy/betting');
const loteriaModule   = require('./games/loteria');
const tttModule       = require('./games/tictactoe');
const chaosModule     = require('./events/chaosroyale');
const dropsModule     = require('./economy/drops');
const blackjackModule = require('./games/blackjack');
const teamsModule     = require('./games/teams');
const shopModule      = require('./economy/shopmodule');
const jackpotModule   = require('./economy/jackpotmodule');
const cuarentaModule  = require('./games/cuarenta');
const autogamesModule = require('./events/autogames');
const { initDB }      = require('./utils/database');
const E               = require('./utils/emojis');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ]
});

// ─── Slash command definitions ────────────────────────────────────────────────
const slashCommands = [
  // Economy
  new SlashCommandBuilder().setName('balance').setDescription('Check your oops balance')
    .addUserOption(o => o.setName('user').setDescription('User to check')),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily oops'),
  new SlashCommandBuilder().setName('transfer').setDescription('Transfer oops to another player')
    .addUserOption(o => o.setName('user').setDescription('Who to send to').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to send').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('beg').setDescription('Beg the bot for oops (1 hour cooldown)'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top 10 richest players'),
  new SlashCommandBuilder().setName('profile').setDescription('View player stats and balance')
    .addUserOption(o => o.setName('user').setDescription('User to view')),
  new SlashCommandBuilder().setName('give').setDescription('Admin: Give oops to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('take').setDescription('Admin: Remove oops from a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('setbal').setDescription('Admin: Set a user\'s balance')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('New balance').setRequired(true).setMinValue(0)),

  // Betting
  new SlashCommandBuilder().setName('createbet').setDescription('Create a new bet')
    .addStringOption(o => o.setName('title').setDescription('Bet title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Bet description'))
    .addIntegerOption(o => o.setName('hours').setDescription('Hours until bet closes').setMinValue(1)),
  new SlashCommandBuilder().setName('bet').setDescription('Place a bet')
    .addIntegerOption(o => o.setName('id').setDescription('Bet ID').setRequired(true))
    .addStringOption(o => o.setName('side').setDescription('yes or no').setRequired(true).addChoices({name:'Yes',value:'yes'},{name:'No',value:'no'}))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(10)),
  new SlashCommandBuilder().setName('bets').setDescription('List all open bets'),
  new SlashCommandBuilder().setName('betinfo').setDescription('Get details on a bet')
    .addIntegerOption(o => o.setName('id').setDescription('Bet ID').setRequired(true)),
  new SlashCommandBuilder().setName('mybets').setDescription('View your betting history'),
  new SlashCommandBuilder().setName('resolvebet').setDescription('Admin: Resolve a bet')
    .addIntegerOption(o => o.setName('id').setDescription('Bet ID').setRequired(true))
    .addStringOption(o => o.setName('outcome').setDescription('Outcome').setRequired(true).addChoices({name:'Yes',value:'yes'},{name:'No',value:'no'},{name:'Cancel',value:'cancel'})),
  new SlashCommandBuilder().setName('polymarket').setDescription('View trending Polymarket markets'),

  // Lotería
  new SlashCommandBuilder().setName('loteria').setDescription('Start a Lotería game')
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee').setMinValue(10))
    .addStringOption(o => o.setName('mode').setDescription('Game mode').addChoices(
      {name:'Auto (board marks itself)',value:'auto'},
      {name:'Manual (you click to mark)',value:'manual'}
    ))
    .addStringOption(o => o.setName('delay').setDescription('Lobby wait time').addChoices(
      {name:'1 minute',value:'1m'},{name:'5 minutes (default)',value:'5m'},
      {name:'10 minutes',value:'10m'},{name:'20 minutes',value:'20m'}
    ))
    .addStringOption(o => o.setName('speed').setDescription('Time between cards').addChoices(
      {name:'8 seconds',value:'8'},{name:'10 seconds (default)',value:'10'},{name:'12 seconds',value:'12'},{name:'15 seconds',value:'15'}
    )),
  new SlashCommandBuilder().setName('loteriarules').setDescription('How to play Lotería'),

  // Cuarenta
  new SlashCommandBuilder().setName('cuarenta').setDescription('Start a Cuarenta (Ecuadorian) game')
    .addStringOption(o => o.setName('mode').setDescription('Game mode').addChoices({name:'1v1',value:'1v1'},{name:'2v2',value:'2v2'}))
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in oops').setMinValue(10))
    .addBooleanOption(o => o.setName('vsbot').setDescription('Play against the bot instead of waiting for a player')),
  new SlashCommandBuilder().setName('cuarentarules').setDescription('How to play Cuarenta (Ecuadorian)'),
  new SlashCommandBuilder().setName('cancelcuarenta').setDescription('Cancel the current Cuarenta game and refund all players'),

  // Tic Tac Toe
  new SlashCommandBuilder().setName('tictacbruh').setDescription('Play Tic-Tac-Bruh!')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet amount in oops — winner takes all').setRequired(true).setMinValue(10))
    .addUserOption(o => o.setName('opponent').setDescription('Specific player to challenge (leave empty to open to anyone!)'))
    .addBooleanOption(o => o.setName('vsbot').setDescription('Play against the bot instead')),
  new SlashCommandBuilder().setName('cancelttb').setDescription('Cancel the current Tic-Tac-Bruh game and refund players'),

  // Auto Games
  new SlashCommandBuilder().setName('hungergames').setDescription('Start a Hunger Games event')
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in oops').setMinValue(10)),
  new SlashCommandBuilder().setName('rumble').setDescription('Start a Rumble event')
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in oops').setMinValue(10)),
  new SlashCommandBuilder().setName('signup').setDescription('Sign up for the current event'),
  new SlashCommandBuilder().setName('cancelevent').setDescription('Cancel the current event and refund players'),
  new SlashCommandBuilder().setName('dodgeloser').setDescription('Start a Dodge Loser — last one standing wins the pot!')
    .addIntegerOption(o => o.setName('bet').setDescription('Entry fee in oops (default 50)').setRequired(false).setMinValue(10))
    .addStringOption(o => o.setName('duration').setDescription('Signup window').setRequired(false)
      .addChoices(
        { name: '1 minute',   value: '1'  },
        { name: '5 minutes',  value: '5'  },
        { name: '15 minutes', value: '15' },
        { name: '30 minutes', value: '30' },
      ))
    .addIntegerOption(o => o.setName('minutes').setDescription('Custom signup time in minutes (overrides duration if set)').setRequired(false).setMinValue(1).setMaxValue(60)),
  new SlashCommandBuilder().setName('canceldodge').setDescription('Cancel the current Dodge Loser game and refund players'),
  new SlashCommandBuilder().setName('blackjack').setDescription('Start a Blackjack game — solo or multiplayer!')
    .addIntegerOption(o => o.setName('bet').setDescription('Bet amount in oops (default 50)').setRequired(false).setMinValue(10))
    .addStringOption(o => o.setName('mode').setDescription('Game mode (default: multiplayer)').setRequired(false)
      .addChoices(
        { name: '👤 Solo — just you vs dealer', value: 'solo' },
        { name: '👥 Multiplayer — everyone vs dealer', value: 'multi' },
      ))
    .addStringOption(o => o.setName('duration').setDescription('Signup window (multiplayer only)').setRequired(false)
      .addChoices(
        { name: '30 seconds', value: '30s' },
        { name: '1 minute',   value: '1m'  },
        { name: '2 minutes',  value: '2m'  },
        { name: '5 minutes',  value: '5m'  },
      ))
    .addIntegerOption(o => o.setName('timer').setDescription('Custom signup time in seconds (overrides duration)').setRequired(false).setMinValue(10).setMaxValue(600)),
  new SlashCommandBuilder().setName('teams').setDescription('Randomly assign players to teams!')
    .addStringOption(o => o.setName('team1').setDescription('Name of team 1').setRequired(true))
    .addStringOption(o => o.setName('team2').setDescription('Name of team 2').setRequired(true))
    .addStringOption(o => o.setName('team3').setDescription('Name of team 3 (optional)').setRequired(false))
    .addStringOption(o => o.setName('team4').setDescription('Name of team 4 (optional)').setRequired(false))
    .addStringOption(o => o.setName('name').setDescription('Session name (e.g. "Friday Night Games")').setRequired(false))
    .addStringOption(o => o.setName('duration').setDescription('Signup window').setRequired(false)
      .addChoices(
        { name: '30 seconds', value: '30'  },
        { name: '1 minute',   value: '60'  },
        { name: '2 minutes',  value: '120' },
        { name: '5 minutes',  value: '300' },
      ))
    .addIntegerOption(o => o.setName('timer').setDescription('Custom signup time in seconds').setRequired(false).setMinValue(10).setMaxValue(600)),
  new SlashCommandBuilder().setName('cancelblackjack').setDescription('Cancel the current Blackjack game and refund players'),
  new SlashCommandBuilder().setName('bigbag').setDescription('Throw a big bag of oops — everyone who clicks gets a random slice!')
    .addIntegerOption(o => o.setName('amount').setDescription('Total oops to throw into the bag').setRequired(true).setMinValue(10)),
  new SlashCommandBuilder().setName('drop').setDescription('Drop oops — first to click claims it all!')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount to drop').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('schedule').setDescription('View auto-event schedule config'),

  // Jackpot Lottery
  new SlashCommandBuilder().setName('richpot').setDescription('View the oops I am Rich Pot — our jackpot lottery!'),
  new SlashCommandBuilder().setName('lotteryjoin').setDescription('Enter this week\'s lottery — 400 oops, pick a number 1-100')
    .addIntegerOption(o => o.setName('number').setDescription('Your number (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('jackpotdraw').setDescription('Admin: Trigger the weekly lottery draw'),
  new SlashCommandBuilder().setName('jackpothistory').setDescription('View past lottery winners'),
  new SlashCommandBuilder().setName('jackpotentries').setDescription('See who has entered the oops I am Rich Pot'),
  new SlashCommandBuilder().setName('jackpotlive').setDescription('Admin: Pin live oops I am Rich Pot display')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to pin the live display in (defaults to current)').setRequired(false)),
  new SlashCommandBuilder().setName('jackpotstart').setDescription('Admin: Start the oops I am Rich Pot')
    .addStringOption(o => o.setName('name').setDescription('Name for this pot (e.g. "Weekly Grind")').setRequired(false))
    .addStringOption(o => o.setName('mode').setDescription('Duration').setRequired(false)
      .addChoices(
        { name: 'Weekly (7 days)',      value: 'weekly'    },
        { name: 'Biweekly (15 days)',   value: 'biweekly'  },
        { name: 'Monthly (30 days)',    value: 'monthly'   }
      ))
    .addStringOption(o => o.setName('pingrole').setDescription('Role ID or @role mention to ping (optional)').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post the pot in (defaults to current)').setRequired(false)),
  new SlashCommandBuilder().setName('jackpotstop').setDescription('Admin: Stop the current jackpot (pot is preserved)'),

  // Shop
  new SlashCommandBuilder().setName('store_tictacbruh').setDescription('Browse the Tic-Tac-Bruh token store'),
  new SlashCommandBuilder().setName('buy').setDescription('Buy a token from the shop')
    .addStringOption(o => o.setName('token').setDescription('Token ID to buy (optional — leave blank to browse)').setRequired(false)),
  new SlashCommandBuilder().setName('inventory').setDescription('View and equip your token collection'),
  new SlashCommandBuilder().setName('equip').setDescription('Equip a token from your collection')
    .addStringOption(o => o.setName('token').setDescription('Token ID to equip').setRequired(true)),

  // Help
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
].map(cmd => cmd.toJSON());

// ─── Register slash commands when bot is ready ────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Throw First Ask Later is online as ${client.user.tag}`);
  client.user.setActivity('/help | Throw First Ask Later', { type: 'PLAYING' });
  autogamesModule.initScheduler(client);
  jackpotModule.initScheduler(client);
  jackpotModule._client = client;

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    if (process.env.GUILD_ID) {
      // Clear global commands to prevent duplicates, then register to guild only (instant)
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: slashCommands });
      console.log(`✅ Slash commands registered to guild ${process.env.GUILD_ID} (instant)`);
    } else {
      // No guild ID — register globally (takes up to 1 hour)
      await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
      console.log(`✅ Slash commands registered globally`);
    }
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err.message);
  }
});

// ─── Slash command handler ────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  // Modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('oops_rich_modal:')) return jackpotModule.handleModal(interaction);
    return;
  }
  // Select menus
  if (interaction.isStringSelectMenu()) {
    const richMenus = ['richpot_view', 'richpot_draw', 'richpot_stop', 'richpot_entries', 'richpot_live'];
    if (interaction.customId.startsWith('shop:')) {
      return shopModule.handleSelect(interaction);
    }
    if (richMenus.some(id => interaction.customId.startsWith(id))) {
      return jackpotModule.handleSelect(interaction);
    }
    return;
  }
  // Button clicks
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('oops_rich_join:')) return jackpotModule.handleButton(interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    // Economy
    if (['balance','daily','transfer','beg','leaderboard','profile','give','take','setbal'].includes(commandName)) {
      return await economyModule.handleSlash(interaction, commandName);
    }
    // Betting
    if (['createbet','bet','bets','betinfo','mybets','resolvebet','polymarket'].includes(commandName)) {
      return await bettingModule.handleSlash(interaction, commandName);
    }
    // Lotería
    if (['loteria','loteriarules','cancelloteria'].includes(commandName)) {
      return await loteriaModule.handleSlash(interaction, commandName);
    }
    // Cuarenta
    if (['cuarenta','cuarentarules','cancelcuarenta'].includes(commandName)) {
      return await cuarentaModule.handleSlash(interaction, commandName);
    }
    // TTT
    if (['tictacbruh','cancelttb','ttt','cancelttt','canceltictacbruh'].includes(commandName)) {
      return await tttModule.handleSlash(interaction);
    }
    // Auto games
    if (['bigbag','drop'].includes(commandName)) {
      return await dropsModule.handleSlash(interaction, commandName);
    }
    if (commandName === 'teams') {
      return await teamsModule.handleSlash(interaction, commandName);
    }
    if (['blackjack','cancelblackjack'].includes(commandName)) {
      return await blackjackModule.handleSlash(interaction, commandName);
    }
    if (['dodgeloser','canceldodge'].includes(commandName)) {
      return await chaosModule.handleSlash(interaction, commandName);
    }
    if (['hungergames','rumble','signup','cancelevent','schedule'].includes(commandName)) {
      return await autogamesModule.handleSlash(interaction, commandName);
    }
    // Help
    if (['richpot','lotteryjoin','jackpotdraw','jackpothistory','jackpotlive','jackpotstart','jackpotstop','jackpotentries'].includes(commandName)) {
      return await jackpotModule.handleSlash(interaction);
    }
    if (['store_tictacbruh','shop','buy','myitems','inventory','equip'].includes(commandName)) {
      return await shopModule.handleSlash(interaction);
    }
    if (commandName === 'help') {
      return await sendHelpSlash(interaction);
    }
  } catch (err) {
    console.error(`Error in /${commandName}:`, err);
    const reply = { content: '❌ Something went wrong! Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(reply).catch(() => {});
    else interaction.reply(reply).catch(() => {});
  }
});

// ─── Also keep ! prefix as fallback ──────────────────────────────────────────
const PREFIX = process.env.PREFIX || '!';
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  try {
    if (['balance','bal','give','take','transfer','beg','daily','leaderboard','lb','stats','profile','setbal','richest'].includes(command))
      return await economyModule.handleCommand(message, args, command);
    if (['createbet','bet','bets','resolvebet','betinfo','cancelbet','mybets','polymarket'].includes(command))
      return await bettingModule.handleCommand(message, args, command);
    if (['loteria','loteria-manual','loteriamanu','join','loteria-rules','loteriarules','cancelloteria'].includes(command))
      return await loteriaModule.handleCommand(message, args, command);
    if (['ttt','tictactoe','cancelttt','ttt-cancel'].includes(command))
      return await tttModule.handleCommand(message, args, command);
    if (['cuarenta','cuarenta-rules','cuarentarules','table','hand','cancelcuarenta'].includes(command))
      return await cuarentaModule.handleCommand(message, args, command);
    if (command === 'teams') return await teamsModule.handleCommand(message, args);
    if (['blackjack','bj','cancelblackjack','cancelbj'].includes(command)) return await blackjackModule.handleCommand(message, args, command);
    if (['dodgeloser','chaos','canceldodge'].includes(command)) return await chaosModule.handleCommand(message, args, command);
    if (['bigbag','drop'].includes(command)) return await dropsModule.handleCommand(message, args, command);
    if (['hungergames','hg','rumble','event','signup','enter','eventschedule','schedule','cancelevent'].includes(command))
      return await autogamesModule.handleCommand(message, args, command);
    if (['jackpot','richpot','lottery','enter','lotteryenter','jackpotdraw','jackpothistory','jackpotlive','jackpotstart','jackpotstop','jackpotentries','potentries'].includes(command)) return await jackpotModule.handleCommand(message, args, command);
    if (['shop','buy','myitems','inventory','equip'].includes(command)) return await shopModule.handleCommand(message, args, command);
    if (command === 'help' || command === 'commands') return await sendHelp(message);
  } catch (err) {
    console.error(`Error in "!${command}":`, err);
    message.reply('❌ Something went wrong!').catch(() => {});
  }
});

// ─── Help (slash) ─────────────────────────────────────────────────────────────
async function sendHelpSlash(interaction) {
  const embeds = buildHelpEmbeds();
  await interaction.reply({ embeds, ephemeral: true });
}

async function sendHelp(message) {
  const embeds = buildHelpEmbeds();
  return message.reply({ embeds });
}

function buildHelpEmbeds() {
  const hostRole = process.env.EVENT_HOST_ROLE || 'Event Host';

  const main = new EmbedBuilder()
    .setColor('#FFE4A0')
    .setTitle(`${E.BB_COIN} Throw First Ask Later — All Commands`)
    .setDescription(
      `Use \`/command\` for slash commands or \`!command\` for prefix commands.\n` +
      `Both work for most things! Slash commands show options as you type.\n\u200b`
    )
    .addFields(
      {
        name: `${E.BB_COIN} Economy`,
        value: [
          `\`/balance\` \`!bal\` — Check your oops balance`,
          `\`/daily\` \`!daily\` — Claim your daily oops reward`,
          `\`/beg\` \`!beg\` — Beg the bot for oops *(1hr cooldown)*`,
          `\`/transfer @user amount\` \`!transfer\` — Send oops to someone`,
          `\`/leaderboard\` \`!lb\` — Top 10 richest players`,
          `\`/profile\` \`!profile\` — View your stats & balance`,
        ].join('\n'),
      },
      {
        name: `${E.BB_COIN} Economy — Admin Only`,
        value: [
          `\`/give @user amount\` \`!give\` — Add oops to a user`,
          `\`/take @user amount\` \`!take\` — Remove oops from a user`,
          `\`/setbal @user amount\` \`!setbal\` — Set a user's balance`,
          `\`/drop amount\` \`!drop\` — Drop oops for anyone to claim`,
        ].join('\n'),
      },
      {
        name: `${E.BET_DICE} Bet & Regret`,
        value: [
          `\`/createbet title\` \`!createbet\` — Create a yes/no bet`,
          `\`/bet id side amount\` \`!bet\` — Place a bet on a market`,
          `\`/bets\` \`!bets\` — List all open bets`,
          `\`/betinfo id\` \`!betinfo\` — Details on a specific bet`,
          `\`/mybets\` \`!mybets\` — Your personal bet history`,
          `\`/resolvebet id outcome\` \`!resolvebet\` — *(Admin)* Resolve a bet`,
          `\`/polymarket\` \`!polymarket\` — Browse trending Polymarket markets`,
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Page 1/3 • Throw First Ask Later' });

  const games = new EmbedBuilder()
    .setColor('#FFB3B3')
    .setTitle(`🎮 Games — Commands`)
    .addFields(
      {
        name: `${E.LOTERIA} Lotería`,
        value: [
          `\`/loteria\` \`!loteria [bet] [delay] [speed]\` — Start a Lotería game`,
          `  • \`mode\`: Auto *(board marks itself)* or Manual *(you click to mark)*`,
          `  • \`delay\`: Lobby wait time *(default: 5 min)*`,
          `  • \`speed\`: Time between cards — 8s / 10s / 12s / 15s *(default: 10s)*`,
          `\`/loteriarules\` \`!loteria-rules\` — How to play Lotería`,
          `\`!cancelloteria\` — Cancel the current Lotería game & refund players`,
        ].join('\n'),
      },
      {
        name: `${E.CUARENTA} Cuarenta (Ecuadorian)`,
        value: [
          `\`/cuarenta\` \`!cuarenta [bet]\` — Start a Cuarenta game`,
          `  • \`mode\`: 1v1 or 2v2`,
          `  • \`vsbot\`: Play against the bot solo`,
          `\`/cuarentarules\` \`!cuarenta-rules\` — How to play Cuarenta`,
          `\`/cancelcuarenta\` \`!cancelcuarenta\` — Cancel & refund current game`,
        ].join('\n'),
      },
      {
        name: `${E.TTT_HEADER} Tic Tac Toe`,
        value: [
          `\`/ttt @opponent [bet]\` \`!ttt @opponent [bet]\` — Challenge someone to Tic Tac Toe`,
          `  • Bet is required (min 10) — winner takes the whole pot`,
        ].join('\n'),
      },
      {
        name: `<a:jackpot:1479203793806557385> Weekly Lottery`,
        value: [
          `\`/jackpot\` \`!jackpot\` — View the pot & how to enter`,
          `\`/lotteryjoin number:42\` \`!enter 42\` — Enter this week (400 oops, pick 1-100)`,
          `\`/jackpothistory\` — Past winners`,
          `\`/jackpotstart weekly\` — *(Admin)* Start a weekly jackpot`,
          `\`/jackpotstart monthly\` — *(Admin)* Start a monthly jackpot`,
          `\`/jackpotstop\` — *(Admin)* Stop the current jackpot`,
          `\`/jackpotlive\` \`!jackpotlive\` — *(Admin)* Pin a live jackpot display in this channel`,
          `\`/jackpotdraw\` \`!jackpotdraw\` — *(Admin)* Trigger the weekly draw`,
        ].join('\n'),
      },
      {
        name: `🏹 Events *(${hostRole} role required to start)*`,
        value: [
          `\`/hungergames [bet]\` \`!hungergames\` — Start a Hunger Games simulation`,
          `\`/rumble [bet]\` \`!rumble\` — Start a Rumble Battle Royale`,
          `\`/signup\` \`!signup\` — Sign up for the current event`,
          `\`/cancelevent\` \`!cancelevent\` — Cancel event & refund all players`,
          `\`/schedule\` \`!schedule\` — View auto-event schedule`,
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Page 2/3 • Throw First Ask Later' });

  const tips = new EmbedBuilder()
    .setColor('#D9B3FF')
    .setTitle(`💡 Tips & Info`)
    .addFields(
      {
        name: '🎴 How Lotería Works',
        value: [
          `**Auto mode** — cards are drawn and your board marks itself. First to complete a row, column, diagonal or full card wins!`,
          `**Manual mode** — a \`👁 My Board\` button appears on every drawn card. Click it to open your board and mark blue cards. You can catch up on missed cards anytime!`,
        ].join('\n'),
      },
      {
        name: '🃏 How Cuarenta Works',
        value: [
          `Ecuadorian card game — first to **40 points** wins.`,
          `Capture cards from the table to score. Special captures like **Caída** score bonus points.`,
          `Claim **Ronda** if your hand beats everyone's. Claim **Cuarenta** instantly if you hit 40 pts.`,
        ].join('\n'),
      },
      {
        name: `${E.BB_COIN} oops`,
        value: [
          `Earn oops by playing games, claiming \`!daily\`, or begging with \`!beg\`.`,
          `Bet on real-world markets with \`!createbet\` or browse \`!polymarket\`.`,
          `Check the \`!lb\` leaderboard to see who's richest!`,
        ].join('\n'),
      },
      {
        name: '⚙️ Slash vs Prefix',
        value: `**Slash commands** \`/\` show options & descriptions as you type — great for new players.\n**Prefix commands** \`!\` are faster if you know what you're doing.\nBoth do the exact same thing!`,
      },
    )
    .setFooter({ text: 'Page 3/3 • Throw First Ask Later • Use !help or /help anytime' });

  return [main, games, tips];
}

// ─── Login ────────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'your_discord_bot_token_here') {
  console.error('❌ Please set DISCORD_TOKEN in your .env file!');
  process.exit(1);
}

const shopUtil    = require('./utils/shop');
const jackpotUtil = require('./utils/jackpot');
initDB().then(async () => {
  await shopUtil.init();
  await jackpotUtil.init();
}).then(() => {
  // re-chain login below
}).catch(() => {});

initDB().then(() => {
  client.login(token);
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
