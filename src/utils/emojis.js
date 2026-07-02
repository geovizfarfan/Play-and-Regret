/**
 * utils/emojis.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized emoji configuration for the sins Bot.
 *
 * HOW TO ADD YOUR OWN CUSTOM EMOJIS
 * ──────────────────────────────────
 * 1. Upload your emoji to your Discord server (Server Settings → Emoji)
 * 2. In any Discord channel, type  \:your_emoji_name:  (backslash first)
 *    and send it — Discord will reveal the raw format.
 * 3. It will look like:  <:sins:1234567890123456789>
 *    or for animated:    <a:sins:1234567890123456789>
 * 4. Paste that full string as the value below.
 *
 * FALLBACKS
 * ─────────
 * Every key has a standard emoji fallback. If you leave a custom value as ''
 * (empty string), the bot automatically uses the fallback so nothing breaks.
 *
 * TIPS
 * ────
 * • The bot must be in the same server as the emoji, or the emoji must be
 *   from a server the bot has access to.
 * • Animated emojis use  <a:name:ID>  instead of  <:name:ID>.
 * • Button labels support emojis but keep them short (Discord 80-char limit).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── YOUR CUSTOM EMOJI IDs GO HERE ───────────────────────────────────────────
// Leave a value as '' to use the standard emoji fallback automatically.

const CUSTOM = {

  // ── Economy / sins ──────────────────────────────────────────────────
  BB_COIN:        '<:sins:1522321533307981945>',   // Shown next to "sins" and balances  🎰
  DAILY:          '',   // Daily reward command                       📅
  LEADERBOARD:    '',   // Leaderboard / richest list                 🏆
  TRANSFER:       '',   // Pay / send money                          💸
  ADMIN_CROWN:    '',   // Admin-only actions                         👑
  TROPHY:         '',   // Winner / prize                             🏆
  MEDAL_1:        '',   // 1st place on leaderboard                  🥇
  MEDAL_2:        '',   // 2nd place on leaderboard                  🥈
  MEDAL_3:        '',   // 3rd place on leaderboard                  🥉

  // ── Bet & Regret ───────────────────────────────────────────────────────────
  BET_DICE:       '',   // General betting                            🎲
  BET_YES:        '',   // YES side of a bet                          ✅
  BET_NO:         '',   // NO side of a bet                           ❌
  POLYMARKET:     '',   // Polymarket command                         📊
  CLOCK:          '<a:RojasClock:1511506715453947904>',   // Time remaining on bets                     ⏰
  TIMER:          '<a:timer:1521043207926845451>',   // Generic countdown timer
  BOT:            '<:play_regret_bot:1521042618744700938>',   // Bot identity / robot references

  // ── Mexican Lotería ────────────────────────────────────────────────────────
  LOTERIA:        '',   // Lotería game header                        🎴
  LOTERIA_MARKED: '',   // A marked cell on the player's board        ✅
  LOTERIA_CALLED: '',   // Card just called                           📢

  // ── Cuarenta ──────────────────────────────────────────────────────────────
  CUARENTA:       '',   // Cuarenta game header                       🃏
  CARD_CAPTURE:   '<a:caida:1478987904054333572>',   // Caída / card capture                       🎯

  // ── Tic Tac Toe ───────────────────────────────────────────────────────────
  TTT_X:          '<:patricia:1478990722135887902>',   // X player mark                              ❌
  TTT_O:          '<:Donkey:1478985472503054428>',   // O player mark                              ⭕
  TTT_EMPTY:      '',   // Empty cell on the board                    ⬜
  TTT_DRAW:       '<a:draw:1478995102050553938>',   // Draw result                               🤝
  TTT_WIN:        '<a:congrats:1478999022072238222>',   // Winner celebration                        🎉
  TTT_HEADER:     '',   // Game title icon                            ✖️

  // ── Hunger Games ──────────────────────────────────────────────────────────
  HG_HEADER:      '',   // Hunger Games title                         🏹
  HG_KILL:        '',   // Kill event prefix                          ⚔️
  HG_SURVIVE:     '',   // Survive event prefix                       🌿
  HG_MUTUAL:      '',   // Mutual kill event prefix                   💀
  HG_WINNER:      '',   // Victor announcement                        🏆

  // ── Rumble ────────────────────────────────────────────────────────────────
  RUMBLE_HEADER:  '<a:rumble_royale_swords:1412631186664067072>',   // Rumble title                               ⚔️
  RUMBLE_ELIM:    '',   // Elimination event prefix                   💥
  RUMBLE_SURVIVE: '',   // Survive event prefix                       💪
  RUMBLE_WINNER:  '',   // Champion announcement                      🏆

  // ── General UI ────────────────────────────────────────────────────────────
  SUCCESS:        '',   // Generic success / checkmark                ✅
  ERROR:          '',   // Generic error / X                          ❌
  WARNING:        '',   // Warning / caution                          ⚠️
  INFO:           '',   // Info / help                                ℹ️
  SIGNUP:         '',   // Player signup / join                       📋
  SCHEDULE:       '',   // Schedule / calendar                        📅
  PROFILE:        '',   // Player profile                             🎮
};

// ─── Fallbacks (used automatically when CUSTOM value is '') ──────────────────
const FALLBACK = {
  BB_COIN:        '🎰',
  DAILY:          '📅',
  LEADERBOARD:    '🏆',
  TRANSFER:       '💸',
  ADMIN_CROWN:    '👑',
  TROPHY:         '🏆',
  MEDAL_1:        '🥇',
  MEDAL_2:        '🥈',
  MEDAL_3:        '🥉',

  BET_DICE:       '🎲',
  BET_YES:        '✅',
  BET_NO:         '❌',
  POLYMARKET:     '📊',
  CLOCK:          '⏰',
  TIMER:          '⏱️',
  BOT:            '🤖',

  LOTERIA:        '🎴',
  LOTERIA_MARKED: '✅',
  LOTERIA_CALLED: '📢',

  CUARENTA:       '🃏',
  CARD_CAPTURE:   '🎯',

  TTT_X:          '❌',
  TTT_O:          '⭕',
  TTT_EMPTY:      '⬜',
  TTT_DRAW:       '🤝',
  TTT_WIN:        '🎉',
  TTT_HEADER:     '✖️',

  HG_HEADER:      '🏹',
  HG_KILL:        '⚔️',
  HG_SURVIVE:     '🌿',
  HG_MUTUAL:      '💀',
  HG_WINNER:      '🏆',

  RUMBLE_HEADER:  '⚔️',
  RUMBLE_ELIM:    '💥',
  RUMBLE_SURVIVE: '💪',
  RUMBLE_WINNER:  '🏆',

  SUCCESS:        '✅',
  ERROR:          '❌',
  WARNING:        '⚠️',
  INFO:           'ℹ️',
  SIGNUP:         '📋',
  SCHEDULE:       '📅',
  PROFILE:        '🎮',
};

// ─── Auto-resolve: custom if set, fallback otherwise ─────────────────────────
const E = {};
for (const key of Object.keys(FALLBACK)) {
  E[key] = CUSTOM[key] || FALLBACK[key];
}

module.exports = E;
