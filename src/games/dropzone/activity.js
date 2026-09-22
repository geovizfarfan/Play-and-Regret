// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — activity tracker.
// Purely in-memory (per the perf rules: don't hit the DB on every message).
// Tracks qualifying activity per channel and decides when a natural spawn
// becomes eligible. Cleans up idle channel state so nothing leaks forever.
// ─────────────────────────────────────────────────────────────────────────────
const { CONFIG } = require('./config');

// channelId -> { count, uniqueUsers: Set, recent: [{userId, content, at}], threshold, cooldownUntil, lastActivityAt }
const channelState = new Map();

function randomThreshold() {
  const { minQualifyingMessages, maxQualifyingMessages } = CONFIG;
  return minQualifyingMessages + Math.floor(Math.random() * (maxQualifyingMessages - minQualifyingMessages + 1));
}
function randomCooldownMs() {
  const { minSpawnCooldownMinutes, maxSpawnCooldownMinutes } = CONFIG;
  const mins = minSpawnCooldownMinutes + Math.random() * (maxSpawnCooldownMinutes - minSpawnCooldownMinutes);
  return mins * 60 * 1000;
}

function getState(channelId) {
  let s = channelState.get(channelId);
  if (!s) {
    s = { count: 0, uniqueUsers: new Set(), recent: [], threshold: randomThreshold(), cooldownUntil: 0, lastActivityAt: Date.now() };
    channelState.set(channelId, s);
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
 * Call on every non-bot message in an eligible channel. Returns true if this
 * message just pushed the channel over the threshold and a spawn should fire
 * (caller is responsible for actually spawning and then calling markSpawned).
 */
function recordActivity(channelId, userId, content) {
  if (!CONFIG.enabled) return false;
  const state = getState(channelId);
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

/** Call right after a natural spawn fires for this channel — resets counters and starts the cooldown. */
function markSpawned(channelId) {
  const state = getState(channelId);
  state.count = 0;
  state.uniqueUsers = new Set();
  state.threshold = randomThreshold();
  state.cooldownUntil = Date.now() + randomCooldownMs();
}

/** Periodic cleanup — drop state for channels that have been silent a long while. */
function cleanupIdleChannels(idleMs = 6 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [channelId, state] of channelState.entries()) {
    if (now - state.lastActivityAt > idleMs) channelState.delete(channelId);
  }
}

module.exports = { recordActivity, markSpawned, cleanupIdleChannels };
