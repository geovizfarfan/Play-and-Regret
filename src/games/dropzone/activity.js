// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — activity tracker.
// Purely in-memory (per the perf rules: don't hit the DB on every message).
// Tracks qualifying activity per GUILD (not per channel — activity anywhere
// in the server counts) and decides when a natural spawn becomes eligible.
// The spawn itself still only ever posts into an allowed spawn channel —
// this only decides WHEN one is due, not where.
// ─────────────────────────────────────────────────────────────────────────────
const { CONFIG } = require('./config');

// guildId -> { count, uniqueUsers: Set, recent: [{userId, content, at}], threshold, cooldownUntil, lastActivityAt }
const guildState = new Map();

function randomThreshold() {
  const { minQualifyingMessages, maxQualifyingMessages } = CONFIG;
  return minQualifyingMessages + Math.floor(Math.random() * (maxQualifyingMessages - minQualifyingMessages + 1));
}
function randomCooldownMs() {
  const { minSpawnCooldownMinutes, maxSpawnCooldownMinutes } = CONFIG;
  const mins = minSpawnCooldownMinutes + Math.random() * (maxSpawnCooldownMinutes - minSpawnCooldownMinutes);
  return mins * 60 * 1000;
}

function getState(guildId) {
  let s = guildState.get(guildId);
  if (!s) {
    s = { count: 0, uniqueUsers: new Set(), recent: [], threshold: randomThreshold(), cooldownUntil: 0, lastActivityAt: Date.now() };
    guildState.set(guildId, s);
  }
  return s;
}

function looksLikeFarming(state, userId, content) {
  // Same user repeating the exact same message recently = farming, not conversation.
  const normalized = content.trim().toLowerCase();
  if (!normalized) return true; // pure attachment/empty-content spam, no real conversation signal
  const recentSameUser = state.recent.filter(m => m.userId === userId).slice(-CONFIG.spamRepeatWindow);
  const repeats = recentSameUser.filter(m => m.content === normalized).length;
  return repeats >= 2; // same exact line 2+ times recently from the same person
}

/**
 * Call on every non-bot message anywhere in the guild. Returns true if this
 * message just pushed the server over the threshold and a spawn should fire
 * (caller is responsible for actually spawning and then calling markSpawned).
 */
function recordActivity(guildId, userId, content) {
  if (!CONFIG.enabled) return false;
  const state = getState(guildId);
  state.lastActivityAt = Date.now();

  if (Date.now() < state.cooldownUntil) return false; // still cooling down from the last natural spawn

  if (looksLikeFarming(state, userId, content)) {
    state.recent.push({ userId, content: content.trim().toLowerCase(), at: Date.now() });
    if (state.recent.length > 50) state.recent.shift();
    return false;
  }

  state.count++;
  state.uniqueUsers.add(userId);
  state.recent.push({ userId, content: content.trim().toLowerCase(), at: Date.now() });
  if (state.recent.length > 50) state.recent.shift();

  if (state.count >= state.threshold && state.uniqueUsers.size >= CONFIG.minUniqueParticipants) {
    return true;
  }
  return false;
}

/** Call right after a natural spawn fires for this guild — resets counters and starts the cooldown. */
function markSpawned(guildId) {
  const state = getState(guildId);
  state.count = 0;
  state.uniqueUsers = new Set();
  state.threshold = randomThreshold();
  state.cooldownUntil = Date.now() + randomCooldownMs();
}

/** Periodic cleanup — drop state for guilds that have been silent a long while. */
function cleanupIdleChannels(idleMs = 6 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [guildId, state] of guildState.entries()) {
    if (now - state.lastActivityAt > idleMs) guildState.delete(guildId);
  }
}

module.exports = { recordActivity, markSpawned, cleanupIdleChannels };
