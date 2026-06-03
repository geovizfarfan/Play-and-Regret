'use strict';
/**
 * src/games/rg_story.js
 * Story engine for Regret Games — players kill each other, bot narrates
 */

// canvas not available — using text fallback for THE DEAD

// ─── DAY STORY BEATS (player does something, survives) ────────────────────────
const DAY_BEATS = [
  (p, others) => `**${p}** watched **${others[0]}** from a distance and said nothing. The silence was louder than anything they could have planned.`,
  (p, others) => `**${p}** found a weapon and decided not to use it yet. *Yet* being the operative word.`,
  (p, others) => `**${p}** made eye contact with **${others[0]}** across the arena. Neither looked away first. Both started planning.`,
  (p, others) => `**${p}** overheard **${others[0]}** and **${others[1] || others[0]}** talking. Filed it under "useful later."`,
  (p, others) => `**${p}** smiled at **${others[0]}**. It was the kind of smile that means absolutely nothing good.`,
  (p, others) => `**${p}** found food and ate it alone. Did not offer any to **${others[0]}**. **${others[0]}** noticed.`,
  (p, others) => `**${p}** sharpened something while **${others[0]}** watched. Nobody said anything.`,
  (p, others) => `**${p}** told **${others[0]}** they were safe. **${others[0]}** believed them. That was their mistake.`,
  (p, others) => `**${p}** helped **${others[0]}** with something small. It was either genuine or strategic. Probably strategic.`,
  (p, others) => `**${p}** stayed close to **${others[0]}** all day. Protection or proximity. Hard to tell.`,
  (p, others) => `**${p}** wrote **${others[0]}**'s name somewhere private. The arena saw it.`,
  (p, others) => `**${p}** laughed at something **${others[0]}** said. Nobody else knew why. That was the point.`,
  (p, others) => `**${p}** sat alone and did the math. The math did not look good for **${others[0]}**.`,
  (p, others) => `**${p}** borrowed something from **${others[0]}**. Has no intention of returning it.`,
  (p, others) => `**${p}** and **${others[0]}** argued over something small. It was not about the small thing.`,
  (p, others) => `**${p}** watched the sky and thought about winning. **${others[0]}** watched **${p}** and thought about the same thing.`,
  (p, others) => `**${p}** pretended to sleep while **${others[0]}** moved around camp. Catalogued everything.`,
  (p, others) => `**${p}** asked **${others[0]}** what their plan was. **${others[0]}** lied. **${p}** already knew.`,
  (p, others) => `**${p}** kissed **${others[0]}** on the cheek and called it alliance-building. The arena is suspicious.`,
  (p, others) => `**${p}** cooked for **${others[0]}**. Nobody asked what was in it.`,
];

// ─── KILL LINES (killer → victim, victim dies) ────────────────────────────────
const KILL_LINES = [
  (killer, victim) => `**${killer}** waited until **${victim}** was alone, then made sure they stayed that way. Permanently.`,
  (killer, victim) => `**${killer}** had been planning this since Day 1. **${victim}** never saw it coming. That was the plan.`,
  (killer, victim) => `**${killer}** offered **${victim}** water. It was the last thing **${victim}** accepted from anyone.`,
  (killer, victim) => `**${killer}** and **${victim}** were alone for exactly four minutes. Only **${killer}** walked out.`,
  (killer, victim) => `**${killer}** smiled at **${victim}** one last time before making a decision the arena fully supports.`,
  (killer, victim) => `**${victim}** trusted **${killer}**. That was the mistake. **${killer}** used it.`,
  (killer, victim) => `**${killer}** found **${victim}** sleeping and decided that was the most convenient time. It was.`,
  (killer, victim) => `**${killer}** challenged **${victim}** to a fight. **${victim}** accepted. **${killer}** had already decided how it ended.`,
  (killer, victim) => `**${killer}** poisoned **${victim}**'s food. **${victim}** ate it because they were starving. That was the plan all along.`,
  (killer, victim) => `**${killer}** pushed **${victim}** when nobody was watching. Someone was watching. The arena always is.`,
  (killer, victim) => `**${victim}** turned their back on **${killer}** for one second. **${killer}** only needed one second.`,
  (killer, victim) => `**${killer}** looked **${victim}** in the eyes and said sorry before doing it anyway.`,
  (killer, victim) => `**${killer}** had the weapon. **${victim}** had the bad luck of being nearby. The result was inevitable.`,
  (killer, victim) => `**${killer}** told **${victim}** to run. **${victim}** didn't run fast enough.`,
  (killer, victim) => `**${killer}** set a trap. **${victim}** walked into it. **${killer}** had been waiting for three hours.`,
  (killer, victim) => `**${killer}** stabbed **${victim}** mid-sentence. **${victim}** never finished what they were saying.`,
  (killer, victim) => `**${killer}** and **${victim}** fought over food. **${killer}** won. **${victim}** lost everything.`,
  (killer, victim) => `**${killer}** broke the alliance with **${victim}** in the most permanent way possible.`,
  (killer, victim) => `**${killer}** hunted **${victim}** all day. **${victim}** ran all day. The running stopped first.`,
  (killer, victim) => `**${killer}** whispered something to **${victim}** that nobody else heard. Then **${victim}** was gone.`,
  (killer, victim) => `**${victim}** begged **${killer}** to spare them. **${killer}** considered it. Briefly.`,
  (killer, victim) => `**${killer}** eliminated **${victim}** not out of strategy but out of preference. The arena respects that.`,
  (killer, victim) => `**${killer}** found **${victim}** at their weakest and did not help them. Did the opposite, actually.`,
  (killer, victim) => `**${victim}** thought **${killer}** was an ally. **${killer}** thought **${victim}** was an obstacle. One of them was right.`,
  (killer, victim) => `**${killer}** cornered **${victim}** with nowhere to run. **${victim}** had been cornered since Day 1. They just didn't know it.`,
];

// ─── NIGHT BEATS (survivor reflects, interacts with dead) ─────────────────────
const NIGHT_BEATS_SURVIVOR = [
  (p, others) => `**${p}** sat alone after dark and counted how many people were left. The number was smaller than yesterday.`,
  (p, others) => `**${p}** couldn't sleep. Kept thinking about what happened. Kept thinking about what comes next.`,
  (p, others) => `**${p}** and **${others[0]}** stayed up talking until the fire died. Neither fully trusted the other by the end.`,
  (p, others) => `**${p}** checked their surroundings three times before closing their eyes. Opened them again immediately.`,
  (p, others) => `**${p}** heard something in the dark. Decided not to investigate. Survived because of it.`,
  (p, others) => `**${p}** thought about **${others[0]}** and whether the alliance would hold another day. It probably won't.`,
  (p, others) => `**${p}** sharpened their weapon in the dark while **${others[0]}** pretended to sleep nearby.`,
  (p, others) => `**${p}** whispered something into the dark. Nobody answered. That was the point.`,
  (p, others) => `**${p}** moved camp quietly without telling **${others[0]}**. Old habits.`,
  (p, others) => `**${p}** stared at **${others[0]}** sleeping and thought about tomorrow. **${others[0]}** should probably worry about that.`,
];

const NIGHT_BEATS_WITH_DEAD = [
  (p, dead) => `**${p}** found something that belonged to **${dead}**. Kept it. Didn't say why.`,
  (p, dead) => `**${p}** thought about **${dead}** tonight. Couldn't decide if they felt guilty or relieved.`,
  (p, dead) => `**${p}** walked past the place where **${dead}** died and didn't stop. Didn't look either.`,
  (p, dead) => `**${p}** dreamed about **${dead}**. Woke up and checked their weapon. Just in case.`,
  (p, dead) => `**${p}** said **${dead}**'s name quietly in the dark. Nobody was listening. Or everyone was.`,
  (p, dead) => `**${p}** sat where **${dead}** used to sit. Thought about how quickly things change.`,
  (p, dead) => `**${p}** kept **${dead}**'s share of food. Nobody said anything. Everyone noticed.`,
  (p, dead) => `**${p}** wondered if **${dead}** would have done the same thing to them. Probably yes.`,
  (p, dead) => `**${p}** couldn't stop thinking about the look on **${dead}**'s face. Decided that was their problem now.`,
  (p, dead) => `**${p}** lit something small for **${dead}**. Not out of grief. Out of habit.`,
];

// ─── POST-VOTE DRAMA (after elimination, more interactions) ───────────────────
const POST_VOTE_DRAMA = [
  (killer, victim, witness) => `After the vote, **${killer}** was the first to look away when **${victim}**'s name was called. **${witness}** noticed that.`,
  (killer, victim, witness) => `**${witness}** watched **${killer}** vote for **${victim}** without hesitation. Filed that away.`,
  (killer, victim, witness) => `**${victim}** looked at **${killer}** when the votes were read. **${killer}** didn't flinch. **${witness}** did.`,
  (killer, victim, witness) => `After **${victim}** was gone, **${killer}** sat next to **${witness}** like nothing happened. **${witness}** moved slightly away.`,
  (killer, victim, witness) => `**${witness}** was the only one who voted against eliminating **${victim}**. **${killer}** knows that now.`,
  (killer, victim, witness) => `**${killer}** said "it was nothing personal" about **${victim}**. **${witness}** laughed. Not kindly.`,
  (killer, victim, witness) => `**${victim}** said **${killer}**'s name before they were eliminated. Just once. **${witness}** heard it.`,
];

// ─── GENERATE "THE DEAD" IMAGE ────────────────────────────────────────────────
async function generateDeadImage(deadPlayers, client) {
  // Returns null — caller uses text fallback
  return null;
}

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

module.exports = {
  DAY_BEATS,
  KILL_LINES,
  NIGHT_BEATS_SURVIVOR,
  NIGHT_BEATS_WITH_DEAD,
  POST_VOTE_DRAMA,
  generateDeadImage,
  pick,
};
