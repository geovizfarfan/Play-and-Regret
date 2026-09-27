// ─────────────────────────────────────────────────────────────────────────────
// Drop It Like It's Hot — sticker book grid image.
// Renders all of a season's stickers as one image: full color + checkmark for
// owned ones, greyed-out silhouette for missing ones. Same sharp-composite
// pattern already used for Lotería's board rendering.
// ─────────────────────────────────────────────────────────────────────────────
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { isEnabled } = require('./monsters');

const CELL_W = 80;
const CELL_H = 120; // matches the 2:3 card art — cover-fits with zero crop
const GAP = 8;
const COLS = 10;
const TITLE_H = 44;

// System fonts (Arial, DejaVu Sans, etc.) aren't reliably installed in the
// container, so font-family lookups silently fail and text renders as empty
// boxes. Embedding the font's own bytes directly in each SVG sidesteps that
// entirely — this works regardless of what's installed on the host.
const FONT_REGULAR_B64 = fs.readFileSync(
  path.join(__dirname, '../../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf')
).toString('base64');
const FONT_BOLD_B64 = fs.readFileSync(
  path.join(__dirname, '../../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf')
).toString('base64');

function fontStyle() {
  return `<style>
    @font-face { font-family: 'BookFont'; src: url(data:font/ttf;base64,${FONT_REGULAR_B64}) format('truetype'); font-weight: normal; }
    @font-face { font-family: 'BookFont'; src: url(data:font/ttf;base64,${FONT_BOLD_B64}) format('truetype'); font-weight: bold; }
    text { font-family: 'BookFont'; }
  </style>`;
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
        ${fontStyle()}
        <rect width="${CELL_W}" height="${CELL_H}" fill="${owned ? '#4a2f6b' : '#2a2a2a'}" rx="6"/>
        <text x="${CELL_W/2}" y="${CELL_H/2+5}" text-anchor="middle" fill="#888" font-size="11">#${String(monster.number).padStart(3,'0')}</text>
      </svg>`;
      results.push({ input: Buffer.from(placeholder), left: x, top: y });
    }

    if (owned) {
      const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">
        ${fontStyle()}
        <circle cx="${CELL_W-14}" cy="14" r="12" fill="#3ba55d" stroke="white" stroke-width="2"/>
        <text x="${CELL_W-14}" y="19" text-anchor="middle" fill="white" font-size="14" font-weight="bold">✓</text>
      </svg>`;
      results.push({ input: Buffer.from(badge), left: x, top: y });
    } else {
      const numTag = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">
        ${fontStyle()}
        <rect x="0" y="${CELL_H-16}" width="${CELL_W}" height="16" fill="rgba(0,0,0,0.6)" rx="0"/>
        <text x="${CELL_W/2}" y="${CELL_H-4}" text-anchor="middle" fill="#ccc" font-size="10">#${String(monster.number).padStart(3,'0')}</text>
      </svg>`;
      results.push({ input: Buffer.from(numTag), left: x, top: y });
    }
    return results;
  });

  const cellResults = await Promise.all(tasks);
  for (const r of cellResults) composites.push(...r);

  const titleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${TITLE_H}">
    ${fontStyle()}
    <rect width="${width}" height="${TITLE_H}" fill="#C9B1FF" rx="6"/>
    <text x="${width/2}" y="${TITLE_H - 15}" text-anchor="middle" fill="#3A0066" font-size="16" font-weight="bold">${title.replace(/[<>&'"]/g, '')}</text>
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
