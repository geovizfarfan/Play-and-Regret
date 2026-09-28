// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — season rollover.
// Every guild's dropzone_config row stores its own current_season, and ~20
// call sites read it. Rather than touch all of them, this keeps that column
// in step with SEASON_SCHEDULE: at startup and every 30s it bumps any guild
// still on an older season up to the currently-live one. It never moves a
// guild backwards, and Season 1 collections are untouched (collections are
// keyed by season), so nothing is lost at rollover.
// ─────────────────────────────────────────────────────────────────────────────
const { db } = require('../../utils/database');
const { getActiveSeason, getSeasonName } = require('./config');

const CHECK_INTERVAL_MS = 30 * 1000;
let lastAnnounced = null;

async function syncSeasons() {
  const active = getActiveSeason();
  const result = await db.run('UPDATE dropzone_config SET current_season = ? WHERE current_season < ?', [active, active]);
  const changed = result?.rowCount ?? result?.changes ?? 0;
  if (changed > 0 || (lastAnnounced !== null && lastAnnounced !== active)) {
    console.log(`[Drop It Like It's Hot] season rollover: ${changed} guild(s) moved to Season ${active} (${getSeasonName(active)})`);
  }
  lastAnnounced = active;
}

function startSeasonScheduler() {
  syncSeasons().catch(err => console.error('[Drop It Like It\'s Hot] season sync failed', err.message));
  setInterval(() => {
    syncSeasons().catch(err => console.error('[Drop It Like It\'s Hot] season sync failed', err.message));
  }, CHECK_INTERVAL_MS);
  console.log(`[Drop It Like It's Hot] season scheduler started (live: Season ${getActiveSeason()})`);
}

module.exports = { startSeasonScheduler, syncSeasons };
