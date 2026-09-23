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
  if (!config) { console.log(`[Drop It Like It's Hot] fireTimedSpawn: guild ${guildId} has no active timer config — stopping`); return; }

  const channels = await getSpawnChannels(guildId);
  if (channels.length) {
    const pick = channels[Math.floor(Math.random() * channels.length)];
    const channel = await client.channels.fetch(pick.channel_id).catch((err) => { console.error(`[Drop It Like It's Hot] couldn't fetch spawn channel ${pick.channel_id}`, err.message); return null; });
    if (channel?.isTextBased()) {
      const monster = rollMonster(config.current_season);
      if (monster) {
        await postSpawn(channel, guildId, monster, 'NATURAL', config.ping_role_id)
          .then(() => console.log(`[Drop It Like It's Hot] timed spawn fired: ${monster.name} in #${channel.name} (guild ${guildId})`))
          .catch(err => console.error(`[Drop It Like It's Hot] postSpawn failed for guild ${guildId}`, err));
      } else {
        console.log(`[Drop It Like It's Hot] fireTimedSpawn: no monster available to roll for guild ${guildId}`);
      }
    } else {
      console.log(`[Drop It Like It's Hot] fireTimedSpawn: spawn channel ${pick.channel_id} not found or not text-based for guild ${guildId}`);
    }
  } else {
    console.log(`[Drop It Like It's Hot] fireTimedSpawn: no allowed spawn channels configured for guild ${guildId} — skipping this cycle`);
  }

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
  console.log(`[Drop It Like It's Hot] resuming timer for ${configs.length} guild(s)`);
  for (const config of configs) {
    try {
      const now = Date.now();
      const nextAt = config.next_timed_spawn_at ? new Date(config.next_timed_spawn_at).getTime() : null;
      if (!nextAt || nextAt <= now) {
        console.log(`[Drop It Like It's Hot] guild ${config.guild_id} timer overdue — firing now`);
        fireTimedSpawn(client, config.guild_id).catch(err => console.error(`[Drop It Like It's Hot] fireTimedSpawn failed for guild ${config.guild_id}`, err));
      } else {
        console.log(`[Drop It Like It's Hot] guild ${config.guild_id} timer resumed — next in ${Math.round((nextAt - now) / 60000)} min`);
        const t = setTimeout(() => fireTimedSpawn(client, config.guild_id).catch(err => console.error(`[Drop It Like It's Hot] fireTimedSpawn failed for guild ${config.guild_id}`, err)), nextAt - now);
        timers.set(config.guild_id, t);
      }
    } catch (e) { console.error(`[Drop It Like It's Hot] init failed for guild ${config.guild_id}`, e); }
  }
}

module.exports = { init, setTimerConfig };
