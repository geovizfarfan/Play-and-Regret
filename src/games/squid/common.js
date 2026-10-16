/** common.js — shared helpers for Play & Regret by TBP — Squid Games */
const crypto = require('crypto');

const BRAND = 'Play & Regret by TBP — Squid Games';
const COLORS = { green: '#39FF14', red: '#FF1744', purple: '#7B2CBF', gold: '#FFD700', dark: '#1B1B2F' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Uniform integer in [0, max) from the OS CSPRNG */
const secureInt = max => crypto.randomInt(0, max);
const randBetween = (a, b) => a + secureInt(b - a + 1);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = secureInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const names = (players, ids, max = 12) => {
  const list = ids.map(id => players.find(p => p.id === id)?.username || 'Someone');
  return list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} +${list.length - max} more`;
};

/** Wait for ms, but return early when state.cancelled or stop() says so. */
async function waitFor(state, ms, tick, stop) {
  const end = Date.now() + ms;
  while (Date.now() < end && !state.cancelled && !(stop && stop())) {
    await sleep(Math.min(250, Math.max(0, end - Date.now())));
    if (tick) await tick();
  }
}

/** Ping a list of users (in chunks, so no message tops Discord's limits). Only those users are mentioned. */
async function ping(channel, ids, text) {
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    await channel.send({ content: `${i === 0 ? `${text}\n` : ''}${chunk.map(id => `<@${id}>`).join(' ')}`, allowedMentions: { users: chunk } }).catch(() => {});
  }
}

module.exports = { ping, BRAND, COLORS, sleep, secureInt, randBetween, shuffle, names, waitFor };
