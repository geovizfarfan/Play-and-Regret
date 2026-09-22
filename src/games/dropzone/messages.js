// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — flavor/announcement text pools.
// ─────────────────────────────────────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const SPAWN_HEADLINES = {
  common:    ['👻 SOMETHING IS LURKING...'],
  uncommon:  ['🧟 SOMETHING STRANGE APPEARED...'],
  rare:      ['💎 RARE MONSTER SPOTTED!'],
  epic:      ['🟣 OH SHIT... SOMETHING POWERFUL APPEARED!'],
  legendary: ['🚨 👑 LEGENDARY MONSTER DETECTED! 👑 🚨'],
  mythic:    ['🚨🚨🚨 THE SERVER SHAKES... 🚨🚨🚨\n🌈✨ A MYTHIC MONSTER HAS APPEARED! ✨🌈'],
};

const ESCAPE_LINES = {
  default: [
    "💨 IT GOT AWAY!",
    "💨 That bitch got away.",
    "💨 Should've clicked faster.",
    "💨 Everybody else was apparently here for moral support.",
    "💨 Somebody come get this thing. Oh wait — nobody did.",
  ],
  mythic: [
    "💨 YOU HAVE GOT TO BE KIDDING.",
    "💨 Y'all really let a MYTHIC sit here that long?! 😭",
    "💨 A once-in-a-season monster showed up and nobody moved. Incredible.",
  ],
};

const CATCH_LINES = [
  "🩸 CAUGHT!",
  "🩸 Not y'all fighting over THIS one.",
  "🩸 Girl... RUN.",
  "🩸 Well... y'all woke something up.",
];

module.exports = { pick, SPAWN_HEADLINES, ESCAPE_LINES, CATCH_LINES };
