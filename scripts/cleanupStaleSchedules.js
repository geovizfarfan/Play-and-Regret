// One-time cleanup: some Rumble Slaughter auto-continuation schedules point
// at channels that no longer exist (deleted at some point), which makes the
// bot log "Could not restore schedule: Unknown Channel" on every boot and
// silently never restore those games. This checks each pending schedule's
// channel against Discord directly and marks only the genuinely-gone ones
// as cancelled — never touches schedules whose channel still exists.
//
// Usage (run from Railway's shell — DATABASE_URL and DISCORD_TOKEN are
// already set there):
//   node scripts/cleanupStaleSchedules.js         # dry run, prints what would happen
//   node scripts/cleanupStaleSchedules.js --apply # actually cancels the stale rows

const { db } = require('../src/utils/database');

const APPLY = process.argv.includes('--apply');

async function channelExists(channelId) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new Error(`Unexpected status ${res.status} checking channel ${channelId}`);
}

async function main() {
  const pending = await db.all("SELECT * FROM rs_schedules WHERE status = 'pending'");
  console.log(`Found ${pending.length} pending schedule(s).`);

  const stale = [];
  for (const row of pending) {
    const exists = await channelExists(row.channel_id);
    console.log(`  schedule #${row.id} — channel ${row.channel_id} — ${exists ? 'exists, leaving alone' : 'GONE, will cancel'}`);
    if (!exists) stale.push(row);
  }

  console.log(`\n${stale.length} stale schedule(s) found out of ${pending.length}.`);

  if (!APPLY) {
    console.log('Dry run only — no changes written. Re-run with --apply to cancel the stale ones.');
    return;
  }

  for (const row of stale) {
    await db.run("UPDATE rs_schedules SET status = 'cancelled' WHERE id = ?", [row.id]);
  }
  console.log(`Cancelled ${stale.length} stale schedule(s).`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
