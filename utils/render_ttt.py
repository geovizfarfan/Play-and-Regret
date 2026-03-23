#!/usr/bin/env python3
"""
Tic Tac Toe board renderer.
Renders a 3x3 board as a large image using custom emoji images.
Usage: python3 render_ttt.py '<json>' <output.png>

JSON format:
{
  "board": [null, "X", "O", null, "X", null, "O", null, null],
  "x_emoji_id": "1478990722135887902",
  "o_emoji_id": "1478985472503054428"
}
"""
import sys, json, os, urllib.request, io

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow not installed", file=sys.stderr)
    sys.exit(1)

try:
    data     = json.loads(sys.argv[1])
    out_path = sys.argv[2]
except Exception as e:
    print(f"ERROR parsing args: {e}", file=sys.stderr)
    sys.exit(1)

board       = data['board']           # list of 9: null/"X"/"O"
X_EMOJI_ID  = data.get('x_emoji_id', '')
O_EMOJI_ID  = data.get('o_emoji_id', '')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR  = os.path.join(SCRIPT_DIR, '..', 'ttt_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

CELL  = 100   # cell size px
GAP   = 8     # gap between cells
PAD   = 16    # outer padding
SIZE  = PAD * 2 + CELL * 3 + GAP * 2  # total board size

# Colors
BG        = (30, 30, 40)
CELL_EMPTY= (50, 52, 68)
CELL_X    = (180, 60, 60)
CELL_O    = (60, 80, 180)
LINE_COL  = (80, 85, 110)
RADIUS    = 18

def download_emoji(emoji_id, name):
    """Download Discord emoji as PNG."""
    cache_path = os.path.join(CACHE_DIR, f'{emoji_id}.png')
    if os.path.exists(cache_path):
        try:
            return Image.open(cache_path).convert('RGBA')
        except Exception:
            os.remove(cache_path)
    url = f'https://cdn.discordapp.com/emojis/{emoji_id}.png?size=256'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            img_bytes = resp.read()
        img = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
        img.save(cache_path, 'PNG')
        return img
    except Exception as e:
        print(f"Could not download emoji {emoji_id}: {e}", file=sys.stderr)
        return None

def rounded_rect(draw, xy, radius, fill):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill)

def cell_pos(idx):
    r, c = divmod(idx, 3)
    x = PAD + c * (CELL + GAP)
    y = PAD + r * (CELL + GAP)
    return x, y

# Download emoji images
x_img = download_emoji(X_EMOJI_ID, 'X') if X_EMOJI_ID else None
o_img = download_emoji(O_EMOJI_ID, 'O') if O_EMOJI_ID else None

# Resize emoji to fit cell with padding
EMOJI_SIZE = CELL - 40
def resize_emoji(img):
    if img is None:
        return None
    return img.resize((EMOJI_SIZE, EMOJI_SIZE), Image.LANCZOS)

x_img = resize_emoji(x_img)
o_img = resize_emoji(o_img)

# ── Draw board ────────────────────────────────────────────────────────────────
img  = Image.new('RGB', (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

for idx, cell in enumerate(board):
    x, y = cell_pos(idx)
    if cell == 'X':
        bg = CELL_X
    elif cell == 'O':
        bg = CELL_O
    else:
        bg = CELL_EMPTY
    rounded_rect(draw, (x, y, x+CELL, y+CELL), RADIUS, bg)

    if cell == 'X' and x_img:
        ox = x + (CELL - EMOJI_SIZE) // 2
        oy = y + (CELL - EMOJI_SIZE) // 2
        img.paste(x_img, (ox, oy), x_img)
    elif cell == 'O' and o_img:
        ox = x + (CELL - EMOJI_SIZE) // 2
        oy = y + (CELL - EMOJI_SIZE) // 2
        img.paste(o_img, (ox, oy), o_img)
    elif cell is None:
        # Draw a subtle plus/dot for empty cells
        cx, cy = x + CELL//2, y + CELL//2
        draw.ellipse([cx-6, cy-6, cx+6, cy+6], fill=(100, 105, 130))

# Draw grid lines between cells
for i in range(1, 3):
    # Vertical
    lx = PAD + i * (CELL + GAP) - GAP // 2
    draw.rectangle([lx - 2, PAD, lx + 2, SIZE - PAD], fill=LINE_COL)
    # Horizontal
    ly = PAD + i * (CELL + GAP) - GAP // 2
    draw.rectangle([PAD, ly - 2, SIZE - PAD, ly + 2], fill=LINE_COL)

img.save(out_path, 'PNG')
print(f"Saved to {out_path}", file=sys.stderr)
