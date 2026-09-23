// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — flavor/announcement text pools.
// ─────────────────────────────────────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const SPAWN_HEADLINES = {
  common:    ['<a:common:1552115281437008073> SOMETHING IS LURKING...'],
  uncommon:  ['<a:uncommon:1552115285052624926> SOMETHING STRANGE APPEARED...'],
  rare:      ['<a:rare:1552115283655655555> RARE MONSTER SPOTTED!'],
  epic:      ['<a:purplesparkle:1479210541691175054> OH SHIT... SOMETHING POWERFUL APPEARED!'],
  legendary: ['<a:siren:1544848390632902666> <a:sparkle:1511506717584920696> LEGENDARY MONSTER DETECTED! <a:sparkle:1511506717584920696> <a:siren:1544848390632902666>'],
  mythic:    ['<a:siren:1544848390632902666><a:siren:1544848390632902666><a:siren:1544848390632902666> THE SERVER SHAKES... <a:siren:1544848390632902666><a:siren:1544848390632902666><a:siren:1544848390632902666>\n<a:mythic:1552115282619801652><a:purplefire1:1552119184333340702> A MYTHIC MONSTER HAS APPEARED! <a:purplefire1:1552119184333340702><a:mythic:1552115282619801652>'],
};

const ESCAPE_LINES = {
  default: [
    "<a:escape:1552118083777208420> IT GOT AWAY!",
    "<a:escape:1552118083777208420> That bitch got away.",
    "<a:escape:1552118083777208420> Should've clicked faster.",
    "<a:escape:1552118083777208420> Everybody else was apparently here for moral support.",
    "<a:escape:1552118083777208420> Somebody come get this thing. Oh wait — nobody did.",
  ],
  mythic: [
    "<a:escape:1552118083777208420> YOU HAVE GOT TO BE KIDDING.",
    "<a:escape:1552118083777208420> Y'all really let a MYTHIC sit here that long?! 😭",
    "<a:escape:1552118083777208420> A once-in-a-season monster showed up and nobody moved. Incredible.",
  ],
};

const CATCH_LINES = [
  "<a:SS_PurpleCandles:1497476841433464873> CAUGHT!",
  "<a:SS_PurpleCandles:1497476841433464873> Not y'all fighting over THIS one.",
  "<a:SS_PurpleCandles:1497476841433464873> Girl... RUN.",
  "<a:SS_PurpleCandles:1497476841433464873> Well... y'all woke something up.",
];

module.exports = { pick, SPAWN_HEADLINES, ESCAPE_LINES, CATCH_LINES };
