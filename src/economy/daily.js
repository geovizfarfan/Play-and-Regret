/**
 * src/economy/daily.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DAILY STREAK SYSTEM + REGRET MECHANIC
 * Commands: !daily / /daily, !cleanse / /cleanse, !confess / /confess
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder } = require('discord.js');
const { economy } = require('../utils/database');

const CURRENCY = 'sins';
const CLEANSE_COOLDOWN_MS = 12 * 3_600_000;
const CONFESS_COOLDOWN_MS =  6 * 3_600_000;

// ─── STREAK MESSAGE POOLS ─────────────────────────────────────────────────────
// Indexed by tier. Pick random from matching tier.

const STREAK_MESSAGES = {
  // Day 1
  1: [
    (s, a, r) => `day 1. already making bad choices. welcome. <a:pepeclownwave84:1495665629649436672> **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `you started something. congrats. it won't end well. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day one and you're already here. embarrassing. 😐 **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day 1 already? who told you about this <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `you showed up. that's… something. **+${a} ${CURRENCY}** | **+${r} regret** the regret starts now.`,
    (s, a, r) => `first day. fresh slate. you'll ruin it. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `oh great. another one. <a:hmmdevil:1495665623219306647> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `you really said "let me log into this" <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `welcome to your downfall. day 1. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `the beginning of something deeply regrettable. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
  ],

  // Days 2–4
  3: [
    (s, a, r) => `day ${s}. you came back. interesting decision. **+${a} ${CURRENCY}** | **+${r} regret** 😐`,
    (s, a, r) => `you're forming a habit. that's bad. **+${a} ${CURRENCY}** | **+${r} regret** <a:pepeclownwave84:1495665629649436672>`,
    (s, a, r) => `day ${s}. you didn't learn from day 1. noted. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `3 days in and already committed to the bit. <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `you returned. boldly. wrongly. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
    (s, a, r) => `day ${s}. the regret is compounding. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `back again huh. who let you back in. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `day ${s} and already slightly too committed. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `you didn't stop after day 1. your fault. **+${a} ${CURRENCY}** | **+${r} regret** <a:pepeclownwave84:1495665629649436672>`,
    (s, a, r) => `okay you're consistent. unfortunately. **+${a} ${CURRENCY}** | **+${r} regret**`,
  ],

  // Days 5–6
  5: [
    (s, a, r) => `day ${s}… you're consistent at making bad choices <a:hmmdevil:1495665623219306647> **+${a} ${CURRENCY}** | **+${r} regret** this is getting sad.`,
    (s, a, r) => `5 days. you didn't stop. no one's surprised. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `day ${s}. the habit is locked in now. accept it. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `you've been here every day this week. <a:pepeclownwave84:1495665629649436672> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `5 days of bad decisions and counting. 😬 **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. we should talk. but we won't. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
    (s, a, r) => `you're really doing this every day huh. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `day ${s}. your regret is becoming a personality trait. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `honestly… I'm proud of you. day ${s} 😌 just kidding. this is pathetic. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
    (s, a, r) => `5+ days in. it's a lifestyle now. a bad one. **+${a} ${CURRENCY}** | **+${r} regret**`,
  ],

  // Days 7–13
  7: [
    (s, a, r) => `day ${s}. weekly disappointment unlocked <a:1stplace:1487504691880263791><a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `a whole week. of this. voluntary. **+${a} ${CURRENCY}** | **+${r} regret** 😐`,
    (s, a, r) => `day ${s}. you've completed one full week of bad decisions. <a:confetti:1495667283870089307> (this isn't a good thing) **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `YOU CAME BACK??? DAY ${s}??? <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret** at this point I respect the delusion.`,
    (s, a, r) => `day ${s}. seven days in and somehow not embarrassed. **+${a} ${CURRENCY}** | **+${r} regret** 🩸`,
    (s, a, r) => `week one done. you need to go outside. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
    (s, a, r) => `day ${s}. this is your routine now. that says everything. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `7 days. 7 bad decisions. beautiful consistency. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. blink twice if you need help. **+${a} ${CURRENCY}** | **+${r} regret** <a:pepeclownwave84:1495665629649436672>`,
    (s, a, r) => `you hit a week. we're logging this. **+${a} ${CURRENCY}** | **+${r} regret** 😬`,
    (s, a, r) => `day ${s}. your friends would be concerned. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `one week of choosing regret over everything else. iconic. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
  ],

  // Days 14–29
  14: [
    (s, a, r) => `day ${s} of logging in like this matters <a:pepeclownwave84:1495665629649436672> **+${a} ${CURRENCY}** | **+${r} regret** blink twice if you need help.`,
    (s, a, r) => `two weeks. this is a lifestyle now. a terrible one. **+${a} ${CURRENCY}** | **+${r} regret** 🩸`,
    (s, a, r) => `day ${s}. you should explain this to someone in person. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `14+ days. the regret isn't stopping you. <a:hmmdevil:1495665623219306647> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. two weeks in and you're still here. unbelievable. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `honestly I respect the commitment. I don't respect the decision. **+${a} ${CURRENCY}** | **+${r} regret** <a:pepeclownwave84:1495665629649436672>`,
    (s, a, r) => `day ${s}. you woke up and chose this. again. **+${a} ${CURRENCY}** | **+${r} regret** 😐`,
    (s, a, r) => `two weeks of voluntary bad decisions. <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. this isn't a game anymore. it's a pattern. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
    (s, a, r) => `you're too deep to stop now. we both know it. **+${a} ${CURRENCY}** | **+${r} regret** 🩸`,
    (s, a, r) => `day ${s}. the audacity is actually impressive. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `14 days in. your regret has a mortgage now. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
  ],

  // Days 30–49
  30: [
    (s, a, r) => `day ${s}. this isn't a streak, it's a cry for help <a:purplefire:1479219348353716415> **+${a} ${CURRENCY}** | **+${r} regret** go outside. seriously.`,
    (s, a, r) => `30 days. you need help. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `day ${s}. a full month of this. voluntary. <a:hmmdevil:1495665623219306647> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `one month of bad decisions. you're committed to the bit. **+${a} ${CURRENCY}** | **+${r} regret** <a:pepeclownwave84:1495665629649436672>`,
    (s, a, r) => `day ${s}. 30+ days and the regret just keeps growing. <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `you've been doing this for a month. I'm concerned. **+${a} ${CURRENCY}** | **+${r} regret** 🩸`,
    (s, a, r) => `day ${s}. this is your personality now. not in a good way. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `30 days in. who are you outside of this? 😐 **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. a whole month. we should notify someone. **+${a} ${CURRENCY}** | **+${r} regret** 😬`,
    (s, a, r) => `month one complete. it only gets worse from here. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
    (s, a, r) => `day ${s}. you said "one more day" 30 times. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `30+ days. this is documented now. **+${a} ${CURRENCY}** | **+${r} regret**`,
  ],

  // Days 50–99
  50: [
    (s, a, r) => `day ${s}. we should notify someone. <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `50 days. FIFTY. <a:hmmdevil:1495665623219306647> **+${a} ${CURRENCY}** | **+${r} regret** this is not normal.`,
    (s, a, r) => `day ${s}. you're not stopping are you. **+${a} ${CURRENCY}** | **+${r} regret** 🩸`,
    (s, a, r) => `50 days of choosing regret every single morning. <a:pepeclownwave84:1495665629649436672> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. I can't tell if you're okay. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `50+ days. you've passed the point of no return. **+${a} ${CURRENCY}** | **+${r} regret** <a:hmmdevil:1495665623219306647>`,
    (s, a, r) => `day ${s}. we're logging this for research purposes. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `fifty days. your regret has its own zip code now. <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. this says a lot about you. none of it good. **+${a} ${CURRENCY}** | **+${r} regret** 😐`,
    (s, a, r) => `50 days in. you've become the warning label. **+${a} ${CURRENCY}** | **+${r} regret** <a:pepeclownwave84:1495665629649436672>`,
  ],

  // Days 100+
  100: [
    (s, a, r) => `day ${s}. this is not a game anymore. <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `100 days. ONE HUNDRED. <a:hmmdevil:1495665623219306647>🩸 **+${a} ${CURRENCY}** | **+${r} regret** you need to talk to someone.`,
    (s, a, r) => `day ${s}. you are the cautionary tale now. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `100 days of voluntary suffering. no notes. **+${a} ${CURRENCY}** | **+${r} regret** 😬`,
    (s, a, r) => `day ${s}. we're genuinely concerned. actually. **+${a} ${CURRENCY}** | **+${r} regret** 🩸`,
    (s, a, r) => `100+ days. your regret could fill a swimming pool. <a:hmmdevil:1495665623219306647> **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. you've transcended embarrassment. you ARE the embarrassment. **+${a} ${CURRENCY}** | **+${r} regret** <a:pray:1495665631775817778>`,
    (s, a, r) => `hundred days in. this is your legacy now. unfortunately. **+${a} ${CURRENCY}** | **+${r} regret**`,
    (s, a, r) => `day ${s}. I don't even have words. just. regret. **+${a} ${CURRENCY}** | **+${r} regret** 😐`,
    (s, a, r) => `100 days. the system should've stopped you. it didn't. <a:pray:1495665631775817778> **+${a} ${CURRENCY}** | **+${r} regret**`,
  ],
};

// ─── RARE CHAOS EVENTS (1% chance) ──────────────────────────────────────────
const RARE_EVENTS = [
  (s, a, r) => ({ extra: 2000, regretExtra: 0,    msg: `🎰 **JACKPOT OF REGRET UNLOCKED** <a:pray:1495665631775817778> +2000 regret. no sins. just suffering. **+${r + 2000} regret total**` }),
  (s, a, r) => ({ extra: 0,    regretExtra: 1000, msg: `<a:pray:1495665631775817778> you were supposed to get a bonus… we changed our mind. **+${r + 1000} regret** <a:hmmdevil:1495665623219306647>` }),
  (s, a, r) => ({ extra: 500,  regretExtra: 500,  msg: `<a:hmmdevil:1495665623219306647> **CHAOS BONUS** the system glitched in your favor. temporarily. **+${a + 500} ${CURRENCY}** | **+${r + 500} regret**` }),
  (s, a, r) => ({ extra: -100, regretExtra: 200,  msg: `<a:pray:1495665631775817778> **BETRAYAL EVENT** we took 100 sins back. you weren't using them wisely. **-100 ${CURRENCY}** | **+${r + 200} regret**` }),
  (s, a, r) => ({ extra: 0,    regretExtra: 0,    msg: `<a:pepeclownwave84:1495665629649436672> **NULL EVENT** nothing happened. your regret grows anyway. somehow. **+${r} regret**` }),
  (s, a, r) => ({ extra: 300,  regretExtra: 800,  msg: `🩸 **CURSED BONUS** you got sins. you also got way more regret. was it worth it? **+${a + 300} ${CURRENCY}** | **+${r + 800} regret**` }),
];

// ─── STREAK EMOJIS ────────────────────────────────────────────────────────────
function getStreakEmoji(streak) {
  if (streak >= 100) return '☠️<a:pray:1495665631775817778><a:hmmdevil:1495665623219306647>🩸';
  if (streak >= 50)  return '<a:hmmdevil:1495665623219306647>🩸<a:pray:1495665631775817778>';
  if (streak >= 30)  return '🩸<a:pray:1495665631775817778>';
  if (streak >= 14)  return '<a:purplefire:1479219348353716415><a:hmmdevil:1495665623219306647>';
  if (streak >= 7)   return '🎲<a:purplefire:1479219348353716415>';
  if (streak >= 3)   return '😬<a:purplefire:1479219348353716415>';
  return '<a:pepeclownwave84:1495665629649436672>';
}

// ─── PICK MESSAGE FOR STREAK ──────────────────────────────────────────────────
function pickDailyMessage(streak, amount, regretGain) {
  const tiers  = [100, 50, 30, 14, 7, 5, 3, 1];
  const tier   = tiers.find(t => streak >= t) || 1;
  const pool   = STREAK_MESSAGES[tier] || STREAK_MESSAGES[1];
  const fn     = pool[Math.floor(Math.random() * pool.length)];
  return fn(streak, amount, regretGain);
}

// ─── CLEANSE RESPONSE POOLS ───────────────────────────────────────────────────
const CLEANSE_SUCCESS = [
  (removed, cost) => `you tried to fix yourself… it almost worked 😐\n**-${removed.toLocaleString()} regret** <a:pray:1495665631775817778> | **-${cost} ${CURRENCY}** <a:hmmdevil:1495665623219306647>`,
  (removed, cost) => `the cleanse worked. this time. don't expect it to last. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}**`,
  (removed, cost) => `you removed some regret. it'll come back. <a:hmmdevil:1495665623219306647> **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}**`,
  (removed, cost) => `okay it worked. somehow. **-${removed.toLocaleString()} regret** <a:pray:1495665631775817778> | **-${cost} ${CURRENCY}**`,
  (removed, cost) => `cleanse successful. temporarily. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}** 😐`,
  (removed, cost) => `you fixed something. enjoy it before you ruin it again. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}** <a:pepeclownwave84:1495665629649436672>`,
  (removed, cost) => `the regret left. briefly. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}** <a:pray:1495665631775817778>`,
];
const CLEANSE_WEAK = [
  (removed, cost) => `that did… basically nothing <a:pray:1495665631775817778>\n**-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}**`,
  (removed, cost) => `minor improvement. barely noticeable. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}** 😐`,
  (removed, cost) => `you paid ${cost} sins for ${removed} regret removed. I'm not doing that math for you. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}**`,
  (removed, cost) => `weak cleanse. you deserved better. you didn't get it. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}** <a:pepeclownwave84:1495665629649436672>`,
  (removed, cost) => `that barely scratched the surface. **-${removed.toLocaleString()} regret** | **-${cost} ${CURRENCY}** <a:pray:1495665631775817778>`,
];
const CLEANSE_FAIL = [
  (cost) => `you really thought that would work? <a:pepeclownwave84:1495665629649436672>\n**regret unchanged** | **-${cost} ${CURRENCY}** <a:hmmdevil:1495665623219306647>`,
  (cost) => `the cleanse failed. you still paid. <a:pray:1495665631775817778> **-${cost} ${CURRENCY}** | regret laughed at you.`,
  (cost) => `nothing happened to your regret. you still lost ${cost} sins. **-${cost} ${CURRENCY}** 😐`,
  (cost) => `clean attempt. dirty result. **-${cost} ${CURRENCY}** | regret unchanged <a:hmmdevil:1495665623219306647>`,
  (cost) => `the system rejected your cleanse. kept your sins anyway. <a:pray:1495665631775817778> **-${cost} ${CURRENCY}**`,
  (cost) => `failed. obviously. **-${cost} ${CURRENCY}** | regret is fine. you're not. <a:pepeclownwave84:1495665629649436672>`,
];
const CLEANSE_BACKFIRE = [
  (gained, cost) => `you made it worse. impressive <a:hmmdevil:1495665623219306647>\n**+${gained.toLocaleString()} regret** <a:pray:1495665631775817778> | **-${cost} ${CURRENCY}**`,
  (gained, cost) => `the cleanse backfired. it added regret. of course it did. **+${gained.toLocaleString()} regret** | **-${cost} ${CURRENCY}** <a:hmmdevil:1495665623219306647>`,
  (gained, cost) => `you tried to cleanse and made it worse. <a:pray:1495665631775817778> **+${gained.toLocaleString()} regret** | **-${cost} ${CURRENCY}**`,
  (gained, cost) => `congratulations on making everything worse. **+${gained.toLocaleString()} regret** | **-${cost} ${CURRENCY}** 🩸`,
  (gained, cost) => `the regret fought back. and won. **+${gained.toLocaleString()} regret** | **-${cost} ${CURRENCY}** <a:hmmdevil:1495665623219306647>`,
  (gained, cost) => `you pushed it and it pushed back harder. **+${gained.toLocaleString()} regret** | **-${cost} ${CURRENCY}** <a:pray:1495665631775817778>`,
];

// ─── CONFESS RESPONSE POOLS ───────────────────────────────────────────────────
const CONFESS_JACKPOT = [
  (sins, reg) => `you admitted everything… and got rewarded?? <a:pray:1495665631775817778>\n**+${sins.toLocaleString()} ${CURRENCY}** <a:hmmdevil:1495665623219306647> | **-${reg.toLocaleString()} regret**`,
  (sins, reg) => `the universe felt bad for you. temporarily. **+${sins.toLocaleString()} ${CURRENCY}** | **-${reg.toLocaleString()} regret** 🎰`,
  (sins, reg) => `jackpot confess. rare. you don't deserve it. **+${sins.toLocaleString()} ${CURRENCY}** | **-${reg.toLocaleString()} regret** <a:hmmdevil:1495665623219306647>`,
];
const CONFESS_TRADE = [
  (sins, reg) => `you dumped your guilt onto someone else <a:hmmdevil:1495665623219306647>\n**+${sins.toLocaleString()} ${CURRENCY}** | **-${reg.toLocaleString()} regret**`,
  (sins, reg) => `fair trade. sort of. **+${sins.toLocaleString()} ${CURRENCY}** | **-${reg.toLocaleString()} regret** 😐`,
  (sins, reg) => `regret converted to sins. don't ask how. **+${sins.toLocaleString()} ${CURRENCY}** | **-${reg.toLocaleString()} regret** <a:pray:1495665631775817778>`,
  (sins, reg) => `you confessed. something shifted. **+${sins.toLocaleString()} ${CURRENCY}** | **-${reg.toLocaleString()} regret** <a:hmmdevil:1495665623219306647>`,
  (sins, reg) => `guilt traded. profit made. briefly. **+${sins.toLocaleString()} ${CURRENCY}** | **-${reg.toLocaleString()} regret** <a:pepeclownwave84:1495665629649436672>`,
];
const CONFESS_NEUTRAL = [
  (sins, reg) => `that changed… something. not sure what <a:pepeclownwave84:1495665629649436672>\n**+${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret**`,
  (sins, reg) => `weird swap. nothing useful happened. **+${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret** 😐`,
  (sins, reg) => `you got sins AND more regret. congrats? **+${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret** <a:pray:1495665631775817778>`,
  (sins, reg) => `the system is confused. so are you. **+${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret** <a:pepeclownwave84:1495665629649436672>`,
];
const CONFESS_PUNISHMENT = [
  (sins, reg) => `you should've kept that to yourself <a:pray:1495665631775817778>\n**-${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret**`,
  (sins, reg) => `confessing made it worse. naturally. **-${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret** <a:hmmdevil:1495665623219306647>`,
  (sins, reg) => `the confession backfired. you lost sins AND gained regret. **-${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret** <a:pray:1495665631775817778>`,
  (sins, reg) => `you told the truth. the truth punished you. **-${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret** 😐`,
  (sins, reg) => `bad confession. worse outcome. **-${sins.toLocaleString()} ${CURRENCY}** | **+${reg.toLocaleString()} regret** <a:pepeclownwave84:1495665629649436672>`,
];
const CONFESS_DISASTER = [
  () => `you confessed… loudly. everyone heard <a:hmmdevil:1495665623219306647>\n**sins wiped** <a:pray:1495665631775817778> | **+1000 regret**`,
  () => `full disaster. everything went wrong. 🩸 **sins wiped** | **+1000 regret**`,
  () => `you pushed your luck. luck said no. **sins wiped** <a:pray:1495665631775817778> | **+1000 regret** <a:hmmdevil:1495665623219306647>`,
  () => `the confession destroyed you. that's on you. **sins wiped** | **+1000 regret** 🩸`,
  () => `catastrophic confess. you had a good run. <a:pray:1495665631775817778> **sins wiped** | **+1000 regret**`,
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ─── DAILY COMMAND ────────────────────────────────────────────────────────────
async function handleDaily(userId, username, replyFn) {
  await economy.getUser(userId, username);
  const result = await economy.claimDaily(userId);

  if (!result.success && result.reason === 'cooldown') {
    return replyFn({
      embeds: [new EmbedBuilder()
        .setColor('#2B0057')
        .setDescription(`⏰ not yet. come back in **${result.hours}h ${result.minutes}m**.\nyou'll log the regret then. <a:pray:1495665631775817778>`)
      ]
    });
  }

  const { amount, streak, regretGain } = result;
  const emoji = getStreakEmoji(streak);

  // 1% rare chaos event
  const isRare = Math.random() < 0.01;
  let extraSins = 0;
  let extraRegret = 0;
  let rareMsg = null;

  if (isRare) {
    const event = pick(RARE_EVENTS)(streak, amount, regretGain);
    extraSins   = event.extra || 0;
    extraRegret = event.regretExtra || 0;
    rareMsg     = event.msg;

    if (extraSins !== 0) await economy.addFunds(userId, extraSins, 'Daily rare event');
    if (extraRegret !== 0) await economy.addRegret(userId, extraRegret);
  }

  const mainMsg = pickDailyMessage(streak, amount + Math.max(0, extraSins), regretGain + Math.max(0, extraRegret));
  const embed = new EmbedBuilder()
    .setColor('#D8B4FE')
    .setTitle(`${emoji} Daily Claimed — Day ${streak}`)
    .setDescription(rareMsg ? `${mainMsg}\n\n🚨 **RARE EVENT:** ${rareMsg}` : mainMsg)
    .addFields(
      { name: '<a:purplefire:1479219348353716415> Streak', value: `${streak} day${streak !== 1 ? 's' : ''}`, inline: true },
    )
    .setFooter({ text: 'use /cleanse to attempt to fix yourself. it probably won\'t work.' });

  return replyFn({ embeds: [embed] });
}

// ─── CLEANSE COMMAND ──────────────────────────────────────────────────────────
async function handleCleanse(userId, username, replyFn) {
  await economy.getUser(userId, username);
  const user = await economy.getUser(userId, username);

  // Cooldown check
  const lastCleanse = user.last_cleanse ? new Date(user.last_cleanse).getTime() : 0;
  const cooldownLeft = CLEANSE_COOLDOWN_MS - (Date.now() - lastCleanse);
  if (cooldownLeft > 0) {
    const h = Math.floor(cooldownLeft / 3_600_000);
    const m = Math.floor((cooldownLeft % 3_600_000) / 60_000);
    return replyFn({ embeds: [new EmbedBuilder().setColor('#2B0057')
      .setDescription(`⏰ cleanse is on cooldown. **${h}h ${m}m** remaining.\nyou can't escape your regret that fast. <a:hmmdevil:1495665623219306647>`)
    ]});
  }

  const COST = 200;
  const bal  = await economy.getBalance(userId);
  if (bal < COST) {
    return replyFn({ embeds: [new EmbedBuilder().setColor('#2B0057')
      .setDescription(`<:wrong:1495666083594502174> you need **${COST} sins** to cleanse.\nyou don't even have enough to try to fix yourself. <a:pray:1495665631775817778>`)
    ]});
  }

  const currentRegret = await economy.getRegret(userId);
  if (currentRegret === 0) {
    return replyFn({ embeds: [new EmbedBuilder().setColor('#C9B1FF')
      .setDescription(`😐 your regret is at 0. there's nothing to cleanse.\nthat's either really good or really suspicious.`)
    ]});
  }

  // Deduct cost
  await economy.removeFunds(userId, COST, 'Cleanse attempt');
  await economy.getUser(userId, username); // refresh

  // Success rate drops at high regret
  const successPenalty = Math.min(0.30, currentRegret / 50_000);
  const roll = Math.random();

  let description, color;

  if (roll < Math.max(0.10, 0.50 - successPenalty)) {
    // Full success
    const removed = Math.floor(currentRegret * (0.4 + Math.random() * 0.3));
    await economy.addRegret(userId, -removed);
    description = pick(CLEANSE_SUCCESS)(removed, COST);
    color = '#C9B1FF';
  } else if (roll < Math.max(0.20, 0.70 - successPenalty)) {
    // Weak success
    const removed = Math.floor(currentRegret * (0.05 + Math.random() * 0.10));
    await economy.addRegret(userId, -removed);
    description = pick(CLEANSE_WEAK)(removed, COST);
    color = '#9B6DFF';
  } else if (roll < Math.max(0.40, 0.90 - successPenalty)) {
    // Fail
    description = pick(CLEANSE_FAIL)(COST);
    color = '#7B2FBE';
  } else {
    // Backfire
    const gained = Math.floor(200 + Math.random() * 400);
    await economy.addRegret(userId, gained);
    description = pick(CLEANSE_BACKFIRE)(gained, COST);
    color = '#4B0082';
  }

  // Update cooldown
  const { db } = require('../utils/database');
  await db.run('UPDATE users SET last_cleanse = NOW() WHERE user_id = ?', [userId]);

  const newRegret  = await economy.getRegret(userId);
  const newBalance = await economy.getBalance(userId);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('😬 /cleanse — control attempt')
    .setDescription(description)
    .addFields(
      { name: '<a:hmmdevil:1495665623219306647> sins',   value: newBalance.toLocaleString(), inline: true },
      { name: '<a:pray:1495665631775817778> regret', value: newRegret.toLocaleString(),  inline: true },
    )
    .setFooter({ text: 'cooldown: 12h • you can try again. it might not help.' });

  return replyFn({ embeds: [embed] });
}

// ─── CONFESS COMMAND ──────────────────────────────────────────────────────────
async function handleConfess(userId, username, replyFn) {
  await economy.getUser(userId, username);
  const user = await economy.getUser(userId, username);

  // Cooldown check
  const lastConfess = user.last_confess ? new Date(user.last_confess).getTime() : 0;
  const cooldownLeft = CONFESS_COOLDOWN_MS - (Date.now() - lastConfess);
  if (cooldownLeft > 0) {
    const h = Math.floor(cooldownLeft / 3_600_000);
    const m = Math.floor((cooldownLeft % 3_600_000) / 60_000);
    return replyFn({ embeds: [new EmbedBuilder().setColor('#2B0057')
      .setDescription(`⏰ too soon to confess again. **${h}h ${m}m** left.\nyou need to live with what you did first. <a:hmmdevil:1495665623219306647>`)
    ]});
  }

  const currentRegret = await economy.getRegret(userId);
  const currentBal    = await economy.getBalance(userId);

  if (currentRegret < 100) {
    return replyFn({ embeds: [new EmbedBuilder().setColor('#2B0057')
      .setDescription(`😐 you don't have enough regret to confess.\nbuild up more bad decisions first. <a:pray:1495665631775817778>`)
    ]});
  }

  // High regret = more punishment outcomes
  const chaosBonus = Math.min(0.25, currentRegret / 20_000);
  const roll = Math.random();

  let description, color;

  if (roll < 0.07) {
    // Jackpot (rare)
    const sinGain = 800 + Math.floor(Math.random() * 800);
    const regRemoved = Math.floor(currentRegret * 0.4);
    await economy.addFunds(userId, sinGain, 'Confess jackpot');
    await economy.addRegret(userId, -regRemoved);
    description = pick(CONFESS_JACKPOT)(sinGain, regRemoved);
    color = '#C9B1FF';
  } else if (roll < 0.07 + Math.max(0.20, 0.38 - chaosBonus)) {
    // Trade
    const sinGain   = Math.floor(100 + Math.random() * 400);
    const regRemoved = Math.floor(sinGain * (0.8 + Math.random() * 0.4));
    await economy.addFunds(userId, sinGain, 'Confess trade');
    await economy.addRegret(userId, -Math.min(regRemoved, currentRegret));
    description = pick(CONFESS_TRADE)(sinGain, Math.min(regRemoved, currentRegret));
    color = '#C9B1FF';
  } else if (roll < 0.60 - chaosBonus) {
    // Neutral chaos
    const sinGain  = Math.floor(50 + Math.random() * 150);
    const regGain  = Math.floor(100 + Math.random() * 200);
    await economy.addFunds(userId, sinGain, 'Confess neutral');
    await economy.addRegret(userId, regGain);
    description = pick(CONFESS_NEUTRAL)(sinGain, regGain);
    color = '#9B6DFF';
  } else if (roll < 0.85) {
    // Punishment
    const sinLoss = Math.floor(100 + Math.random() * 500);
    const regGain = Math.floor(200 + Math.random() * 500);
    const actualLoss = Math.min(sinLoss, currentBal);
    if (actualLoss > 0) await economy.removeFunds(userId, actualLoss, 'Confess punishment');
    await economy.addRegret(userId, regGain);
    description = pick(CONFESS_PUNISHMENT)(actualLoss, regGain);
    color = '#7B2FBE';
  } else {
    // Disaster — wipe sins
    if (currentBal > 0) await economy.removeFunds(userId, currentBal, 'Confess disaster');
    await economy.addRegret(userId, 1000);
    description = pick(CONFESS_DISASTER)();
    color = '#4B0082';
  }

  // Update cooldown
  const { db } = require('../utils/database');
  await db.run('UPDATE users SET last_confess = NOW() WHERE user_id = ?', [userId]);

  const newRegret  = await economy.getRegret(userId);
  const newBalance = await economy.getBalance(userId);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('<a:hmmdevil:1495665623219306647> /confess — chaos gamble')
    .setDescription(description)
    .addFields(
      { name: '<a:hmmdevil:1495665623219306647> sins',   value: newBalance.toLocaleString(), inline: true },
      { name: '<a:pray:1495665631775817778> regret', value: newRegret.toLocaleString(),  inline: true },
    )
    .setFooter({ text: 'cooldown: 6h • /cleanse to attempt damage control (won\'t help)' });

  return replyFn({ embeds: [embed] });
}

// ─── MODULE EXPORTS ───────────────────────────────────────────────────────────
module.exports = {
  name: 'daily',

  async handleCommand(message, args, command) {
    if (command === 'daily') {
      return handleDaily(message.author.id, message.author.username,
        data => message.reply(data));
    }
    if (command === 'cleanse') {
      return handleCleanse(message.author.id, message.author.username,
        data => message.reply(data));
    }
    if (command === 'confess') {
      return handleConfess(message.author.id, message.author.username,
        data => message.reply(data));
    }
  },

  async handleSlash(interaction, commandName) {
    await interaction.deferReply().catch(() => {});
    const replyFn = data => interaction.editReply(data);
    if (commandName === 'daily')   return handleDaily(interaction.user.id, interaction.user.username, replyFn);
    if (commandName === 'cleanse') return handleCleanse(interaction.user.id, interaction.user.username, replyFn);
    if (commandName === 'confess') return handleConfess(interaction.user.id, interaction.user.username, replyFn);
  },
};
