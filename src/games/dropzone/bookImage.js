// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — sticker book grid image.
// Renders all of a season's stickers as one image: full color + checkmark for
// owned ones, greyed-out silhouette for missing ones. Same sharp-composite
// pattern already used for Lotería's board rendering.
// ─────────────────────────────────────────────────────────────────────────────
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const opentype = require('opentype.js');
const { isEnabled } = require('./monsters');

const CELL_W = 80;
const CELL_H = 120; // matches the 2:3 card art — cover-fits with zero crop
const GAP = 8;
const COLS = 10;
const TITLE_H = 44;

// System/embedded fonts aren't reliably rendered by the container's SVG
// engine (tried font-family lookup, then @font-face + base64 — both came
// out as empty boxes in production). Converting text to actual glyph
// outlines ahead of time sidesteps font rendering entirely: sharp just
// draws the shapes, no font lookup happens at render time at all.
const REGULAR_FONT = opentype.parse(
  fs.readFileSync(path.join(__dirname, '../../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf')).buffer
);
const BOLD_FONT = opentype.parse(
  fs.readFileSync(path.join(__dirname, '../../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')).buffer
);

// Per-character glyph lookup, skipping ligature/substitution features —
// this game only ever renders plain numbers/letters, so that's fine, and
// it avoids a GSUB parsing bug in this font that crashes font.getPath().
function textWidth(font, text, fontSize) {
  const scale = fontSize / font.unitsPerEm;
  let w = 0;
  for (const ch of text) w += font.charToGlyph(ch).advanceWidth * scale;
  return w;
}
function textPathD(font, text, x, y, fontSize) {
  const scale = fontSize / font.unitsPerEm;
  let cx = x, d = '';
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    d += glyph.getPath(cx, y, fontSize).toPathData(1) + ' ';
    cx += glyph.advanceWidth * scale;
  }
  return d;
}
// anchor: 'start' | 'middle' | 'end' — x is the reference point per that anchor, like SVG text-anchor
function textPathEl(text, x, y, fontSize, { bold = false, anchor = 'start', fill = '#fff' } = {}) {
  const font = bold ? BOLD_FONT : REGULAR_FONT;
  const w = textWidth(font, text, fontSize);
  const startX = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const d = textPathD(font, text, startX, y, fontSize);
  return `<path d="${d}" fill="${fill}"/>`;
}

async function renderBookImage(monsters, ownedIds, title) {
  const enabledMonsters = monsters.filter(isEnabled).sort((a, b) => a.number - b.number);
  const rows = Math.ceil(enabledMonsters.length / COLS);
  const width = COLS * CELL_W + (COLS + 1) * GAP;
  const height = TITLE_H + rows * CELL_H + (rows + 1) * GAP;

  const composites = [];

  const tasks = enabledMonsters.map(async (monster, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = GAP + col * (CELL_W + GAP);
    const y = TITLE_H + GAP + row * (CELL_H + GAP);
    const owned = ownedIds.has(monster.id);
    const results = [];
    const numLabel = `#${String(monster.number).padStart(3, '0')}`;

    const filePath = path.join(__dirname, monster.image);
    if (fs.existsSync(filePath)) {
      try {
        let img = sharp(filePath).resize(CELL_W, CELL_H, { fit: 'cover' });
        if (!owned) img = img.greyscale().modulate({ brightness: 0.55 });
        const buf = await img.toBuffer();
        results.push({ input: buf, left: x, top: y });
      } catch (e) { console.error(`[Drop It Like It's Hot] book image error for ${monster.name}:`, e.message); }
    } else {
      const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">
        <rect width="${CELL_W}" height="${CELL_H}" fill="${owned ? '#4a2f6b' : '#2a2a2a'}" rx="6"/>
        ${textPathEl(numLabel, CELL_W/2, CELL_H/2+9, 11, { anchor: 'middle', fill: '#888' })}
      </svg>`;
      results.push({ input: Buffer.from(placeholder), left: x, top: y });
    }

    if (owned) {
      const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">
        <circle cx="${CELL_W-14}" cy="14" r="12" fill="#3ba55d" stroke="white" stroke-width="2"/>
        ${textPathEl('✓', CELL_W-14, 20, 14, { bold: true, anchor: 'middle', fill: 'white' })}
      </svg>`;
      results.push({ input: Buffer.from(badge), left: x, top: y });
    } else {
      const numTag = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">
        <rect x="0" y="${CELL_H-16}" width="${CELL_W}" height="16" fill="rgba(0,0,0,0.6)" rx="0"/>
        ${textPathEl(numLabel, CELL_W/2, CELL_H-4, 10, { anchor: 'middle', fill: '#ccc' })}
      </svg>`;
      results.push({ input: Buffer.from(numTag), left: x, top: y });
    }
    return results;
  });

  const cellResults = await Promise.all(tasks);
  for (const r of cellResults) composites.push(...r);

  const cleanTitle = title.replace(/[<>&'"]/g, '');
  const titleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${TITLE_H}">
    <rect width="${width}" height="${TITLE_H}" fill="#C9B1FF" rx="6"/>
    ${textPathEl(cleanTitle, width/2, TITLE_H - 15, 16, { bold: true, anchor: 'middle', fill: '#3A0066' })}
  </svg>`;
  composites.unshift({ input: Buffer.from(titleSvg), left: 0, top: 0 });

  try {
    return await sharp({ create: { width, height, channels: 4, background: { r: 20, g: 10, b: 30, alpha: 1 } } })
      .composite(composites)
      .png()
      .toBuffer();
  } catch (e) {
    console.error(`[Drop It Like It's Hot] book image render error:`, e.message);
    return null;
  }
}

module.exports = { renderBookImage };
