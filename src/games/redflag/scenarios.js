// ─────────────────────────────────────────────────────────────────────────────
// Red Flag Rumble flavor text pools.
// ─────────────────────────────────────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const SCENARIOS = [
  'Says communication matters then disappears for three business days.',
  'Calls everybody toxic. Fascinating pattern.',
  'Has "don\'t waste my time" in their bio and is currently wasting everybody\'s time.',
  'Sends "??" after 43 seconds.',
  'Leaves the server dramatically and rejoins before anyone notices.',
  'Says "I\'m brutally honest." Mostly brutal. Rarely useful.',
  'Left everyone on read for a week, then said "sorry I don\'t check this app much."',
  'Claims to be "not like other people" while doing exactly what other people do.',
  'Double-texts, then gets offended when you respond to both at once.',
  'Says they\'re "low maintenance" and has never once proven it.',
  'Uses "it is what it is" as a personality trait.',
  'Ghosted the group chat, came back like nothing happened.',
  'Says "no offense" right before being extremely offensive.',
  'Has never apologized, only "explained the context."',
  'Claims to hate drama while starting three separate threads about it.',
  'Says "I don\'t do labels" but has extremely specific rules for everyone else.',
  'Responds to every disagreement with "you\'re overreacting."',
  'Has a group chat specifically for talking about this group chat.',
  'Says "trust issues aren\'t my fault" for the fourth time this week.',
  'Never wrong, just "misunderstood," constantly.',
];

const DEFENSE_LINES = {
  innocent: [
    'pleads total innocence. Unconvincing, but committed.',
    'swears on their life. Their life has seen better days.',
    'looks the jury dead in the eye and says nothing happened.',
  ],
  receipts: [
    'pulls up receipts. The receipts are questionable at best.',
    'shows "proof." The proof raises more questions than it answers.',
    'presents evidence nobody asked to see.',
  ],
  unoreverse: [
    'plays UNO REVERSE. Bold. Possibly stupid.',
    'tries to flip the accusation right back around.',
    'attempts the classic redirect maneuver.',
  ],
  and: [
    'says "AND?" with their whole chest.',
    'doubles down instead of explaining anything.',
    'goes on the offensive instead of defending themselves.',
  ],
  wrongperson: [
    'claims this is a case of mistaken identity.',
    'insists they\'ve "never even heard of that behavior."',
    'points at literally anyone else in the room.',
  ],
};

const VOTE_RESULT_LINES = [
  'THE PEOPLE HAVE SPOKEN.',
  'The votes are in, and they are not kind.',
  'Democracy has failed someone today.',
  'The jury has reached a verdict nobody\'s happy about.',
];

const ELIMINATION_ROASTS = [
  'BACK ON THE MARKET.',
  'This one\'s going back in the pile.',
  'Red flag count: unsurvivable.',
  'The evidence was never in their favor.',
  'Some people just collect red flags like trading cards.',
];

const FINAL_ROUND_LINES = [
  'FINAL BACKGROUND CHECK.',
  'Two red flags enter. One certified human leaves.',
  'This is the part where the truth actually matters.',
];

module.exports = { pick, SCENARIOS, DEFENSE_LINES, VOTE_RESULT_LINES, ELIMINATION_ROASTS, FINAL_ROUND_LINES };
