// ─────────────────────────────────────────────────────────────────────────────
// FAFO flavor text pools. Add more any time — nothing else needs to change.
// ─────────────────────────────────────────────────────────────────────────────

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const LOBBY_LINES = [
  'Welcome to the financial mistake simulator.',
  'Every great regret starts with a confident click.',
  'This is not investment advice. This is not advice at all.',
  'Step right up and make a series of increasingly bad decisions.',
  'The house doesn\'t need luck. You\'re doing this to yourselves.',
  'Bring sins. Leave with regrets. That\'s the whole business model.',
  'Nobody here is thinking clearly. That\'s the appeal.',
  'A financial decision made entirely on vibes.',
  'This is what your bank account fears most.',
  'Greed is now a spectator sport.',
];

const SURVIVE_LINES = [
  'AND GOT AWAY WITH IT.',
  'Unfortunately, confidence continues to be rewarded.',
  'Common sense tried calling. They declined.',
  'Still alive. Still greedy. Still concerning.',
  'The math didn\'t check out, but they\'re fine.',
  'Somehow that worked. We\'re all confused.',
  'Bold. Reckless. Correct, this time.',
  'The odds said no. They said try me.',
  'Survived on pure delusion and it worked.',
  'This is the part where they get more confident. Bad sign.',
  'Living dangerously and getting away with it, apparently.',
  'The universe blinked first.',
];

const FIND_OUT_LINES = [
  'YOU FOUND OUT.',
  'That\'s the "find out" part. This was the whole point.',
  'The math finally checked out. Against them.',
  'Well. That escalated exactly as predicted.',
  'This was always going to happen. Just a matter of when.',
  'Congratulations on turning sins into a life lesson.',
  'The odds collected. As they always do, eventually.',
  'That\'s what happens when you push it.',
  'Reader, they did not get away with it.',
  'Some things are just inevitable. This was one of them.',
  'Absolutely predictable. Devastating nonetheless.',
  'The bag has been fumbled.',
];

const CASH_OUT_LINES = [
  'cashed out. Generational wealth secured.',
  'chose financial stability. Disgusting.',
  'saw the risk and immediately called their lawyer.',
  'took the money and ran. Their ancestors can respect that.',
  'made the boring, correct choice. Couldn\'t be them.',
  'walked away with actual money. How embarrassing for the rest of us.',
  'chose to keep their sins. Groundbreaking strategy: not losing.',
  'locked it in. Somewhere, a financial advisor is proud.',
];

const HIGH_RISK_WARNING_LINES = [
  'This is the part where it usually goes wrong.',
  'The odds are not in your favor anymore. Just so you know.',
  'This is your last reasonable exit.',
  'Everyone who got this far and kept going has a story. Not always a good one.',
  'The house would like you to know this is a bad idea.',
  'You\'ve been warned. Repeatedly. By math.',
];

const REGRET_LINES = [
  'At this point these aren\'t mistakes. They\'re hobbies.',
  'The database will remember this.',
  'Another beautiful donation to absolutely nobody.',
  'That was certainly a choice that was made.',
  'God gives his toughest battles to his greediest members.',
  'Financial stability was right there.',
  'You had every opportunity to stop.',
  'Regret: acquired. Lesson: not learned.',
];

const FINAL_ROUND_LINES = [
  'LAST IDIOT STANDING.',
  'Everyone else had the sense to leave. You didn\'t.',
  'This is the one that gets talked about later.',
  'One choice left. Choose with your whole chest.',
];

const WINNER_LINES = [
  'Somehow, impossibly, correct.',
  'The math said no. They did it anyway. It worked.',
  'A true FAFO champion. Financially and morally questionable.',
  'They played. They found out nothing. Suspicious, honestly.',
];

module.exports = {
  pick,
  LOBBY_LINES, SURVIVE_LINES, FIND_OUT_LINES, CASH_OUT_LINES,
  HIGH_RISK_WARNING_LINES, REGRET_LINES, FINAL_ROUND_LINES, WINNER_LINES,
};
