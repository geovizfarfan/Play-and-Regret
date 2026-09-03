// ─────────────────────────────────────────────────────────────────────────────
// Pick Me Pit flavor text pools.
// ─────────────────────────────────────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const ACCUSATIONS = [
  'Changed their entire personality when their crush entered VC.',
  'Said "I hate drama" while creating a private thread about the drama.',
  'Announced they were leaving Discord forever. Returned 11 minutes later.',
  'Said "I\'m different from everyone else." Unfortunately, they were not.',
  'Has never once said "same" about anything a friend likes.',
  'Laughs loudest at jokes that weren\'t funny, just to be noticed.',
  'Claims they "don\'t care what people think" in their bio, in their status, and in every conversation.',
  'Volunteers to be the "chill one" in every group, unprompted, constantly.',
  'Says "I\'m not like other gamers" while doing exactly what other gamers do.',
  'Has a personality that changes depending on who\'s in the voice channel.',
  'Publicly forgives people who never apologized, for the attention.',
  'Says "I don\'t need validation" in a message clearly seeking validation.',
  'Always "just being honest" right when it\'s most convenient for them.',
  'Performs humility like it\'s a competitive sport.',
  'Never wrong. Just "always growing."',
];

const VOTE_RESULT_LINES = [
  'The Pit has chosen.',
  'Nobody\'s free of this crime, but someone\'s taking the fall.',
  'The people have spoken, mostly out of spite.',
  'This was a group decision. Mostly.',
];

const ELIMINATION_LINES = [
  'Escorted to The Pit with dignity nowhere in sight.',
  'The Pit welcomes its newest resident.',
  'That\'s a wrap on this one\'s main character arc.',
  'Down to The Pit they go, still not admitting anything.',
];

const IMMUNITY_LINES = [
  'used Not Me Babe. Untouchable this round.',
  'is immune. The universe protects the delusional.',
];

module.exports = { pick, ACCUSATIONS, VOTE_RESULT_LINES, ELIMINATION_LINES, IMMUNITY_LINES };
