/**
 * store.js — saves every Squid Games session to Postgres so a restart/redeploy never loses one.
 * Table is created on startup (idempotent). Saves are serialized per session and always write
 * the *latest* in-memory state, so a slow write can never overwrite a newer one.
 */
const { db } = require('../../utils/database');

const CREATE = `
CREATE TABLE IF NOT EXISTS squid_sessions (
  id                SERIAL PRIMARY KEY,
  guild_id          TEXT NOT NULL,
  channel_id        TEXT NOT NULL,
  lobby_message_id  TEXT,
  host_id           TEXT NOT NULL,
  host_name         TEXT,
  mode              TEXT NOT NULL,
  bet               INTEGER NOT NULL DEFAULT 0,
  prize             INTEGER NOT NULL DEFAULT 0,
  prize_held        BOOLEAN NOT NULL DEFAULT FALSE,
  min_players       INTEGER NOT NULL DEFAULT 2,
  max_players       INTEGER NOT NULL DEFAULT 50,
  auto_progress     BOOLEAN NOT NULL DEFAULT TRUE,
  start_at          TIMESTAMPTZ,
  phase             TEXT NOT NULL DEFAULT 'lobby',
  players           JSONB NOT NULL DEFAULT '[]',
  alive             JSONB,
  charged           JSONB NOT NULL DEFAULT '[]',
  history           JSONB NOT NULL DEFAULT '[]',
  stage_index       INTEGER NOT NULL DEFAULT 0,
  winner_id         TEXT,
  reminded          JSONB NOT NULL DEFAULT '{}',
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

let ready = false;
async function init() {
  try {
    await db.exec(CREATE);
    await db.exec('CREATE INDEX IF NOT EXISTS squid_sessions_phase ON squid_sessions(phase)');
    ready = true;
  } catch (err) {
    ready = false;
    console.error('[squid] could not create/read squid_sessions — Squid Games will refuse to start:', err.message);
  }
  return ready;
}
const isReady = () => ready;

const j = v => JSON.stringify(v ?? null);

async function insert(s) {
  const row = await db.get(
    `INSERT INTO squid_sessions (guild_id, channel_id, host_id, host_name, mode, bet, prize, prize_held, min_players, max_players, auto_progress, start_at, phase, players, settings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb) RETURNING id`,
    [s.guildId, s.channel.id, s.hostId, s.hostName, s.mode, s.bet, s.prize, !!s.prizeHeld, s.minPlayers, s.maxPlayers, !!s.auto,
      s.startAt ? new Date(s.startAt) : null, s.phase, j(s.players), j(s.settings || {})]);
  return row.id;
}

async function doSave(s) {
  await db.run(
    `UPDATE squid_sessions SET lobby_message_id=$1, phase=$2, players=$3::jsonb, alive=$4::jsonb, charged=$5::jsonb, history=$6::jsonb,
       stage_index=$7, winner_id=$8, prize_held=$9, reminded=$10::jsonb, settings=$11::jsonb, start_at=$12, updated_at=NOW() WHERE id=$13`,
    [s.lobbyMessageId || null, s.phase, j(s.players), s.alive ? j(s.alive) : null, j(s.charged || []), j(s.history || []),
      s.stageIndex || 0, s.winnerId || null, !!s.prizeHeld, j(s.reminded || {}), j(s.settings || {}), s.startAt ? new Date(s.startAt) : null, s.id]);
}
/** Queue a save; resolves once the latest state has been written. */
function save(s) {
  s._saveP = (s._saveP || Promise.resolve()).then(() => doSave(s)).catch(err => console.error('[squid save]', err.message));
  return s._saveP;
}

async function loadOpen() {
  return db.all(`SELECT * FROM squid_sessions WHERE phase IN ('lobby','starting','running','paying','cancelling') ORDER BY id`);
}

async function leaderboard(guildId, limit = 10) {
  return db.all(
    `SELECT winner_id, MAX(settings->>'winnerName') AS name, COUNT(*)::int AS wins,
            COUNT(*) FILTER (WHERE mode='tournament')::int AS championships
       FROM squid_sessions WHERE guild_id=$1 AND phase='done' AND winner_id IS NOT NULL
       GROUP BY winner_id ORDER BY championships DESC, wins DESC LIMIT $2`, [guildId, limit]);
}

module.exports = { init, isReady, insert, save, loadOpen, leaderboard, CREATE };
