/**
 * validator.js — anti-spam / anti-copy-paste for Red Light, Green Light.
 * Discord can't tell whether text was pasted, so this is content + behaviour based:
 * normalize → compare against the player's recent keys (and other players' very recent keys).
 * Only normalized keys are kept (not raw messages), and everything is discarded when the game ends.
 */

const DEFAULTS = {
  cooldownMs: 1000,        // minimum gap between credited messages
  historySize: 15,         // recent keys remembered per player
  crossWindowMs: 8000,     // how long another player's message counts as "recently said"
  crossHistorySize: 40,
  nearDupDistance: 1,      // keys >= 5 chars: reject if edit distance <= this
  nearDupMinLen: 5,
  similarityRatio: 0.85,   // keys >= 8 chars: reject if similarity >= this
  similarityMinLen: 8,
  crossMinLen: 5,          // short common words ("lol", "go") are never treated as copying
  warnAfterInvalid: 3,     // invalid messages within warnWindowMs → discreet warning
  lockAfterInvalid: 5,     // invalid messages within warnWindowMs → lockout
  warnWindowMs: 10000,
  lockoutMs: 5000,
};

const CUSTOM_EMOJI = /<a?:\w+:\d+>/g;

/** Reduce a message to a comparison key. Returns '' when there's nothing meaningful. */
function normalize(raw) {
  let t = String(raw || '').normalize('NFKC').toLowerCase();
  t = t.replace(CUSTOM_EMOJI, m => ` ${m.replace(/<a?:(\w+):\d+>/, ':$1:')} `);
  t = t.replace(/[​-‍﻿̀-ͯ]/g, '');     // zero-width + combining marks (accent tricks)
  t = t.replace(/[^\p{L}\p{N}\p{Extended_Pictographic}:_]+/gu, ''); // drop spaces & punctuation, keep letters/digits/emoji in any language
  t = t.replace(/\p{Extended_Pictographic}️?/gu, m => m);   // (no-op, keeps emoji intact)
  t = t.replace(/(.)\1+/gu, '$1');                                // collapse repeated characters (aaaa→a, 😂😂😂→😂)
  t = t.replace(/\d+$/, '');                                      // hello1, hello2 → hello
  return t;
}

/** Levenshtein distance over code points. */
function distance(a, b) {
  const x = [...a], y = [...b];
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

function similarity(a, b) {
  const max = Math.max([...a].length, [...b].length);
  return max === 0 ? 1 : 1 - distance(a, b) / max;
}

class MessageValidator {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.players = new Map();   // userId → { keys:[], lastCredit, invalid:[timestamps], lockedUntil }
    this.recent = [];           // [{ key, userId, at }]
    this.seen = new Set();      // message ids already processed (duplicate gateway events)
  }

  _p(id) {
    if (!this.players.has(id)) this.players.set(id, { keys: [], lastCredit: 0, invalid: [], lockedUntil: 0 });
    return this.players.get(id);
  }

  /**
   * @returns {{ok:boolean, reason?:string, warn?:boolean, locked?:boolean}}
   * reasons: duplicate-event | locked | cooldown | empty | spam | duplicate | similar | copied
   */
  check({ id, userId, content }, now = Date.now()) {
    const o = this.o;
    if (id) {
      if (this.seen.has(id)) return { ok: false, reason: 'duplicate-event' };
      this.seen.add(id);
      if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value);
    }
    const p = this._p(userId);
    if (p.lastCredit && now - p.lastCredit < o.cooldownMs) return { ok: false, reason: 'cooldown' };

    const raw = String(content || '');
    const key = normalize(raw);
    let reason = null;

    if (!key) reason = 'empty';
    else {
      const rawLen = [...raw.replace(/\s+/g, '')].length;
      if (rawLen >= 4 && [...key].length <= 2 && !/\p{Extended_Pictographic}/u.test(key) === true && rawLen / [...key].length >= 3) reason = 'spam';  // "aaaaaa"
      else if (rawLen >= 4 && [...key].length === 1 && /\p{Extended_Pictographic}/u.test(key) && rawLen >= 4) reason = 'spam';                        // "😂😂😂😂"
    }

    if (!reason) {
      const len = [...key].length;
      for (const old of p.keys) {
        if (old === key) { reason = 'duplicate'; break; }
        if (len >= o.nearDupMinLen && [...old].length >= o.nearDupMinLen && distance(old, key) <= o.nearDupDistance) { reason = 'similar'; break; }
        if (len >= o.similarityMinLen && [...old].length >= o.similarityMinLen && similarity(old, key) >= o.similarityRatio) { reason = 'similar'; break; }
      }
    }

    if (!reason && [...key].length >= o.crossMinLen) {
      this.recent = this.recent.filter(r => now - r.at <= o.crossWindowMs);
      for (const r of this.recent) {
        if (r.userId === userId) continue;
        if (r.key === key || (similarity(r.key, key) >= 0.9 && [...key].length >= o.similarityMinLen)) { reason = 'copied'; break; }
      }
    }

    if (reason) {
      if (reason === 'empty') return { ok: false, reason };
      return { ok: false, reason };                    // silently ignored — no warnings, no lockouts
    }

    p.keys.push(key);
    if (p.keys.length > o.historySize) p.keys.shift();
    p.lastCredit = now;
    this.recent.push({ key, userId, at: now });
    if (this.recent.length > o.crossHistorySize) this.recent.shift();
    return { ok: true };
  }

  clear() { this.players.clear(); this.recent = []; this.seen.clear(); }
}

module.exports = { MessageValidator, normalize, distance, similarity, DEFAULTS };
