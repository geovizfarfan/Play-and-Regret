# 🎰 Board Bucks Bot

A full-featured Discord bot with games, economy, and betting built around **Board Bucks (BB)** — your server's custom currency.

---

## 🚀 Quick Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- A Discord account and server

### 2. Create Your Discord Bot
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **"New Application"** → Name it (e.g., "Board Bucks Bot")
3. Go to **Bot** section → Click **"Add Bot"**
4. Under **Privileged Gateway Intents**, enable:
   - ✅ **Message Content Intent**
   - ✅ **Server Members Intent**
5. Click **"Reset Token"** and copy your bot token
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Embed Links`, `Use External Emojis`, `Add Reactions`
7. Copy the generated URL and open it to invite the bot to your server

### 3. Install & Configure
```bash
# Install dependencies
npm install

# Copy the env template
cp .env.example .env

# Edit .env and add your bot token
nano .env   # or open in any text editor
```

### 4. Configure `.env`
```env
DISCORD_TOKEN=your_actual_bot_token_here
PREFIX=!
ADMIN_ROLE=Admin

# Optional: Polymarket integration
POLYMARKET_ENABLED=false
```

### 5. Run the Bot
```bash
# Start normally
npm start

# Start with auto-restart on changes (dev mode)
npm run dev
```

---

## 🎮 Commands

### 💰 Board Bucks Economy
| Command | Description |
|---------|-------------|
| `!balance [@user]` | Check BB balance |
| `!daily` | Claim 100-300 BB (24h cooldown) |
| `!pay @user <amount>` | Send BB to another player |
| `!leaderboard` | Top 10 richest players |
| `!profile [@user]` | Full stats & balance |
| `!give @user <amount>` | 👑 Admin: Grant BB |
| `!take @user <amount>` | 👑 Admin: Remove BB |
| `!setbal @user <amount>` | 👑 Admin: Set exact balance |

> New players start with **500 BB** automatically.

---

### 🎲 Bet & Regret
| Command | Description |
|---------|-------------|
| `!createbet "Title" "Desc" [hours]` | Create a new bet market |
| `!bet <id> <yes\|no> <amount>` | Place your bet |
| `!bets` | List all open bets |
| `!betinfo <id>` | Detailed bet info & all bettors |
| `!mybets` | Your personal betting history |
| `!resolvebet <id> <yes\|no\|cancel>` | 👑 Admin: Resolve a bet |
| `!polymarket` | Fetch trending Polymarket markets |

> Payouts are proportional to your share of the winning pool.

---

### 🎴 Mexican Lotería
| Command | Description |
|---------|-------------|
| `!loteria <bet>` | Start a game (60s lobby) |
| `!join` | Join the current game |
| `!loteria-rules` | How to play |

- Up to 8 players, cards auto-marked as they're called
- First 4-in-a-row (row, column, or diagonal) wins the pot!

---

### 🃏 Cuarenta (Ecuadorian Card Game)
| Command | Description |
|---------|-------------|
| `!cuarenta <bet>` | Start a 1v1 game |
| `!cuarenta 2v2 <bet>` | Start a 2v2 game |
| `!play <1-5>` | Play a card on your turn |
| `!hand` | See your current hand (also sent via DM) |
| `!table` | See cards currently on the table |
| `!cuarenta-rules` | Full rules |

---

### ❌⭕ Tic Tac Toe
| Command | Description |
|---------|-------------|
| `!ttt @user [bet]` | Challenge someone to a game |

- Interactive button-based board
- Optional BB bet — winner takes the pot!

---

### 🏹 Hunger Games / ⚔️ Rumble
| Command | Description |
|---------|-------------|
| `!hungergames <bet>` | Start Hunger Games signup |
| `!rumble <bet>` | Start Battle Royale signup |
| `!signup` | Join the current event |

- 90-second signup window
- Minimum 4 players required
- Automated narrative play-by-play
- Winner takes the entire pot!

---

## ⚙️ Configuration

### Admin Role
Set `ADMIN_ROLE=YourRoleName` in `.env`. Users with this role (or Discord Administrator permission) can:
- Give/take/set Board Bucks
- Resolve or cancel bets

### Polymarket Integration
Set `POLYMARKET_ENABLED=true` to enable `!polymarket` command which fetches real-world prediction markets you can mirror as server bets.

---

## 📁 Project Structure
```
discord-bot/
├── index.js              # Main bot entry point
├── .env                  # Your config (create from .env.example)
├── .env.example          # Config template
├── package.json
├── boardbucks.db         # SQLite database (auto-created)
├── economy/
│   ├── boardbucks.js     # Currency system
│   └── betting.js        # Bet & Regret
├── games/
│   ├── loteria.js        # Mexican Lotería
│   ├── tictactoe.js      # Tic Tac Toe
│   └── cuarenta.js       # Ecuadorian Cuarenta
├── events/
│   └── autogames.js      # Hunger Games & Rumble
└── utils/
    └── database.js       # SQLite database layer
```

---

## 🛠️ Keeping It Running (Production)

Use **PM2** to keep the bot alive:
```bash
npm install -g pm2
pm2 start index.js --name "board-bucks-bot"
pm2 save
pm2 startup
```

Or use a hosting service like [Railway](https://railway.app), [Render](https://render.com), or a VPS.
