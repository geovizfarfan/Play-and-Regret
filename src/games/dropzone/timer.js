// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — time-based auto-spawn.
// Runs alongside the chat-activity trigger (whichever fires first): guarantees
// spawns happen on a schedule even in a quiet channel/server. Mirrors the
// existing autodrop.js pattern — random interval within a configured range,
// restart-safe via a persisted next-fire time.
// ─────────────────────────────────────────────────────────────────────────────
const { db } = require('../../utils/database');
const { rollMonster } = require('./rarity');
const { postSpawn } = require('./spawn');
const { getSpawnChannels } = require('./admin');

const timers = new Map(); // guildId -> Timeout

async function fireTimedSpawn(client, guildId) {
  const config = await db.get('SELECT * FROM dropzone_config WHERE guild_id = ? AND timer_enabled = true AND enabled = true', [guildId]).catch(() => null);
  if (!config) return; // timer got turned off since this was scheduled — just stop

  const channels = await getSpawnChannels(guildId);
  if (channels.length) {
    const pick = channels[Math.floor(Math.random() * channels.length)];
    const channel = await client.channels.fetch(pick.channel_id).catch(() => null);
    if (channel?.isTextBased()) {
      const monster = rollMonster(config.current_season);
      if (monster) await postSpawn(channel, guildId, monster, 'NATURAL', config.ping_role_id).catch(() => {});
    }
  }
  // no allowed channels configured yet — just reschedule and try again next time

  await scheduleNext(client, guildId, config);
}

async function scheduleNext(client, guildId, config) {
  const delayMs = (config.min_spawn_minutes + Math.random() * (config.max_spawn_minutes - config.min_spawn_minutes)) * 60000;
  const nextAt = new Date(Date.now() + delayMs);
  await db.run('UPDATE dropzone_config SET next_timed_spawn_at = ? WHERE guild_id = ?', [nextAt.toISOString(), guildId]).catch(() => {});

  const existing = timers.get(guildId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => fireTimedSpawn(client, guildId), Math.max(delayMs, 1000));
  timers.set(guildId, t);
}

/** Turn the timer on/off and set its min/max range for a guild. Kicks off scheduling if enabling. */
async function setTimerConfig(client, guildId, enabled, minMinutes, maxMinutes) {
  await db.run(
    `INSERT INTO dropzone_config (guild_id, timer_enabled, min_spawn_minutes, max_spawn_minutes)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (guild_id) DO UPDATE SET timer_enabled = EXCLUDED.timer_enabled, min_spawn_minutes = EXCLUDED.min_spawn_minutes, max_spawn_minutes = EXCLUDED.max_spawn_minutes`,
    [guildId, enabled, minMinutes, maxMinutes]
  );

  const existing = timers.get(guildId);
  if (existing) { clearTimeout(existing); timers.delete(guildId); }

  if (enabled) {
    const config = await db.get('SELECT * FROM dropzone_config WHERE guild_id = ?', [guildId]);
    await scheduleNext(client, guildId, config);
  }
}

// Called once on bot startup — resumes any guild's enabled timer from where it left off.
async function init(client) {
  const configs = await db.all('SELECT * FROM dropzone_config WHERE timer_enabled = true AND enabled = true').catch(() => []);
  for (const config of configs) {
    const now = Date.now();
    const nextAt = config.next_timed_spawn_at ? new Date(config.next_timed_spawn_at).getTime() : null;
    if (!nextAt || nextAt <= now) {
      fireTimedSpawn(client, config.guild_id).catch(() => {});
    } else {
      const t = setTimeout(() => fireTimedSpawn(client, config.guild_id), nextAt - now);
      timers.set(config.guild_id, t);
    }
  }
}

module.exports = { init, setTimerConfig };
