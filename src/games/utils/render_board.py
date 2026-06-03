#!/usr/bin/env python3
"""
Loteria board renderer with real card image support.
Downloads card images on first run and caches them.
Usage: python3 render_board.py '<json>' <output.png>
"""
import sys, json, os, traceback, urllib.request, hashlib

try:
    from PIL import Image, ImageDraw, ImageFont
    import PIL
    pil_version = tuple(int(x) for x in PIL.__version__.split('.')[:2])
except ImportError:
    print("ERROR: Pillow not installed. Run: pip3 install pillow", file=sys.stderr)
    sys.exit(1)

try:
    data     = json.loads(sys.argv[1])
    out_path = sys.argv[2]
except Exception as e:
    print(f"ERROR parsing args: {e}", file=sys.stderr)
    sys.exit(1)

board    = data['board']
marked   = set(data['marked'])
username = data.get('username', 'Player')

# ── Card image cache ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR  = os.path.join(SCRIPT_DIR, '..', 'loteria_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Multiple CDN sources to try per card
CDN_SOURCES = [
    "https://raw.githubusercontent.com/alejorod/loteria/master/src/assets/cards/{n}.png",
    "https://raw.githubusercontent.com/enriquezmartin/loteria/main/src/img/cards/{n}.jpg",
    "https://raw.githubusercontent.com/hereIsLucas/multi-language-app/main/src/assets/loteria/{n}.jpg",
]

CW, CH = 110, 150  # card slot size on board

def download_card(n):
    """Try to download card n from CDN sources. Returns PIL Image or None."""
    cache_path = os.path.join(CACHE_DIR, f'{n}.png')
    if os.path.exists(cache_path):
        try:
            return Image.open(cache_path).convert('RGB')
        except Exception:
            os.remove(cache_path)

    for url_tmpl in CDN_SOURCES:
        url = url_tmpl.format(n=n)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data_bytes = resp.read()
            import io
            img = Image.open(io.BytesIO(data_bytes)).convert('RGB')
            img.save(cache_path, 'PNG')
            print(f"Downloaded card {n} from {url}", file=sys.stderr)
            return img
        except Exception as e:
            continue
    return None

# ── Fonts ─────────────────────────────────────────────────────────────────────
FONT_BOLD = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
]

def find_font():
    return next((p for p in FONT_BOLD if os.path.exists(p)), None)

def lf(size, bold=True):
    fp = find_font()
    if fp:
        try: return ImageFont.truetype(fp, size)
        except: pass
    if pil_version >= (9, 2):
        try: return ImageFont.load_default(size=size)
        except: pass
    return ImageFont.load_default()

fn   = lf(13)
fsm  = lf(11, False)
fnum = lf(14)
ftit = lf(22)
fhdr = lf(11, False)

# ── Card rendering ────────────────────────────────────────────────────────────
CARD_COLORS = [
    '#8B2500','#A0522D','#6B0F0F','#4A0080',
    '#1A5276','#145A32','#6E2F0A','#7B241C',
    '#1B4F72','#154360','#0E6655','#784212',
]

def draw_x_overlay(img):
    """Draw a semi-transparent red X and dark overlay on a card image."""
    overlay = Image.new('RGBA', img.size, (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    w, h = img.size
    # Dark overlay
    d.rectangle([0,0,w,h], fill=(0,0,0,160))
    # Red X
    m = 10
    d.line([(m,m),(w-m,h-m)], fill=(255,30,30,230), width=10)
    d.line([(w-m,m),(m,h-m)], fill=(255,30,30,230), width=10)
    result = img.convert('RGBA')
    result.alpha_composite(overlay)
    return result.convert('RGB')

def make_card_with_image(n, name, is_marked):
    """Try to use real card image, fall back to drawn card."""
    raw = download_card(n)

    if raw:
        # Resize to fit card slot
        # Leave room for name bar at bottom (20px)
        card_area = (CW - 4, CH - 24)
        card_img  = raw.resize(card_area, Image.LANCZOS)

        # Create card frame
        frame = Image.new('RGB', (CW, CH), '#111111' if is_marked else '#1a1a1a')
        draw  = ImageDraw.Draw(frame)

        if is_marked:
            # Draw X over the card image
            marked_img = draw_x_overlay(card_img)
            frame.paste(marked_img, (2, 2))
            # Gold border
            draw.rectangle([0,0,CW-1,CH-1], outline='#FFD700', width=3)
            # Name bar at bottom
            draw.rectangle([0,CH-22,CW,CH], fill='#222222')
            short = name.replace('El ','').replace('La ','').replace('Las ','')[:12]
            draw.text((CW//2, CH-11), short, fill='#666666', font=fsm, anchor='mm')
        else:
            frame.paste(card_img, (2, 2))
            # Gold border
            draw.rectangle([0,0,CW-1,CH-1], outline='#FFD700', width=3)
            # Name bar at bottom
            draw.rectangle([0,CH-22,CW,CH], fill='#000000CC' if False else '#1a0a00')
            draw.text((CW//2, CH-11), name[:18], fill='#FFD700', font=fsm, anchor='mm')

        return frame

    # ── Fallback: drawn card ──────────────────────────────────────────────────
    color = CARD_COLORS[(n-1) % len(CARD_COLORS)]
    bg    = '#111111' if is_marked else color
    img   = Image.new('RGB', (CW, CH), bg)
    draw  = ImageDraw.Draw(img)
    draw.rectangle([0,0,CW-1,CH-1], outline='#FFD700', width=3)
    short = name.replace('El ','').replace('La ','').replace('Las ','').strip()
    if is_marked:
        m = 14
        draw.line([(m,m),(CW-m,CH-m)], fill='#FF2222', width=9)
        draw.line([(CW-m,m),(m,CH-m)], fill='#FF2222', width=9)
        draw.text((CW//2,CH-11), short[:12], fill='#666666', font=fsm, anchor='mm')
    else:
        draw.text((8,6), str(n), fill='#FFD700', font=fnum)
        words = short.split()
        lines = [short[:14]] if len(short)<=10 or len(words)==1 else [' '.join(words[:max(1,len(words)//2)]), ' '.join(words[max(1,len(words)//2):])]
        ys = CH//2-(len(lines)*21)//2
        for i,ln in enumerate(lines):
            draw.text((CW//2,ys+i*21), ln, fill='white', font=fn, anchor='mm')
        draw.text((CW//2,CH-11), name[:18], fill='#FFD700', font=fsm, anchor='mm')
    return img

# ── Layout ────────────────────────────────────────────────────────────────────
COLS   = 4
GAP    = 5
PAD    = 14
HDR    = 50
BW     = PAD*2 + COLS*(CW+GAP) - GAP
BH     = PAD*2 + HDR + COLS*(CH+GAP) - GAP

try:
    img  = Image.new('RGB', (BW, BH), '#1B1B2F')
    draw = ImageDraw.Draw(img)
    # Header
    draw.rectangle([0,0,BW,HDR+PAD-2], fill='#C0392B')
    draw.text((BW//2,(HDR+PAD-2)//2), f"{username}'s Lotería Board",
              fill='white', font=ftit, anchor='mm')

    for idx, card in enumerate(board[:16]):
        r = idx // COLS
        c = idx  % COLS
        x = PAD + c*(CW+GAP)
        y = PAD + HDR + r*(CH+GAP)
        card_img = make_card_with_image(card['n'], card['name'], idx in marked)
        img.paste(card_img, (x, y))

    img.save(out_path, 'PNG')
    print(f"OK: {out_path}", file=sys.stderr)
except Exception:
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
