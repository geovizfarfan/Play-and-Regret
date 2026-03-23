#!/usr/bin/env python3
"""
Run this ONCE to generate all 54 illustrated Lotería card images.
Cards are saved to loteria_cache/ and used by the board renderer.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: pip3 install pillow")
    sys.exit(1)

import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR  = os.path.join(SCRIPT_DIR, '..', 'loteria_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

CW, CH = 120, 168
MX, MY = CW//2, CH//2 - 10

def lf(size, bold=True):
    paths = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/Library/Fonts/Arial Bold.ttf',
    ]
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    try: return ImageFont.load_default(size=size)
    except: return ImageFont.load_default()

def dc(d,cx,cy,r,fill,outline='white',ow=2):
    d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=fill,outline=outline,width=ow)

def ds(d,cx,cy,outer,inner,fill,outline='white',points=5):
    pts=[]
    for i in range(points*2):
        angle=-math.pi/2+i*math.pi/points
        r=outer if i%2==0 else inner
        pts.append((cx+r*math.cos(angle),cy+r*math.sin(angle)))
    d.polygon(pts,fill=fill,outline=outline)

def base(bg1,bg2,n,title):
    img=Image.new('RGB',(CW,CH),bg1)
    d=ImageDraw.Draw(img)
    for y in range(CH//2,CH):
        t=(y-CH//2)/(CH//2)
        r1,g1,b1=int(bg1[1:3],16),int(bg1[3:5],16),int(bg1[5:7],16)
        r2,g2,b2=int(bg2[1:3],16),int(bg2[3:5],16),int(bg2[5:7],16)
        d.line([(0,y),(CW,y)],fill=(int(r1+(r2-r1)*t),int(g1+(g2-g1)*t),int(b1+(b2-b1)*t)))
    d.rectangle([0,0,CW-1,CH-1],outline='#FFD700',width=4)
    d.rectangle([4,4,CW-5,CH-5],outline='#FFF8DC',width=1)
    d.ellipse([7,7,26,26],fill='#FFD700')
    d.text((16,16),str(n),fill='#000000',font=lf(10),anchor='mm')
    d.rectangle([4,CH-26,CW-5,CH-5],fill=(0,0,0,180))
    d.text((CW//2,CH-15),title,fill='#FFD700',font=lf(11),anchor='mm')
    return img,d

CARDS = {
1: lambda: (lambda img,d: [d.ellipse([MX-18,MY-5,MX+18,MY+25],fill='#CC4400',outline='white',width=1),d.ellipse([MX-8,MY-28,MX+8,MY-10],fill='#CC4400',outline='white',width=1),d.polygon([(MX-4,MY-28),(MX,MY-38),(MX+4,MY-28),(MX+8,MY-34),(MX+12,MY-28)],fill='#FF2200'),d.polygon([(MX+18,MY),(MX+35,MY-20),(MX+30,MY+5),(MX+38,MY-5),(MX+20,MY+15)],fill='#884400'),d.ellipse([MX-2,MY-24,MX+2,MY-20],fill='black'),d.polygon([(MX+8,MY-20),(MX+15,MY-17),(MX+8,MY-14)],fill='#FFAA00'),d.line([(MX-8,MY+25),(MX-8,MY+38)],fill='#FFAA00',width=3),d.line([(MX+8,MY+25),(MX+8,MY+38)],fill='#FFAA00',width=3)] or img)(*base('#8B1A1A','#5C1010',1,'El Gallo')),
2: lambda: (lambda img,d: [d.ellipse([MX-15,MY,MX+15,MY+28],fill='#CC0000',outline='white',width=1),d.ellipse([MX-12,MY-22,MX+12,MY+2],fill='#CC0000',outline='white',width=1),d.polygon([(MX-12,MY-22),(MX-18,MY-40),(MX-5,MY-22)],fill='#CC0000'),d.polygon([(MX+12,MY-22),(MX+18,MY-40),(MX+5,MY-22)],fill='#CC0000'),d.ellipse([MX-7,MY-15,MX-3,MY-11],fill='#FFFF00'),d.ellipse([MX+3,MY-15,MX+7,MY-11],fill='#FFFF00'),d.arc([MX-8,MY-8,MX+8,MY+2],10,170,fill='black',width=2),d.line([(MX+20,MY-5),(MX+20,MY+30)],fill='#884400',width=3),d.line([(MX+16,MY-5),(MX+16,MY+5)],fill='#884400',width=2),d.line([(MX+24,MY-5),(MX+24,MY+5)],fill='#884400',width=2)] or img)(*base('#4B0000','#2A0000',2,'El Diablito')),
3: lambda: (lambda img,d: [d.polygon([(MX,MY+5),(MX-25,MY+40),(MX+25,MY+40)],fill='#9B30FF',outline='white',width=1),d.ellipse([MX-10,MY-5,MX+10,MY+15],fill='#FFCCAA',outline='white',width=1),d.ellipse([MX-10,MY-28,MX+10,MY-6],fill='#FFCCAA',outline='white',width=1),d.ellipse([MX-12,MY-38,MX+12,MY-20],fill='#4A0080',outline='#FFD700',width=2),d.rectangle([MX-15,MY-32,MX+15,MY-28],fill='#4A0080',outline='#FFD700',width=1),d.ellipse([MX-5,MY-23,MX-2,MY-20],fill='black'),d.ellipse([MX+2,MY-23,MX+5,MY-20],fill='black')] or img)(*base('#6B0080','#3A0050',3,'La Dama')),
4: lambda: (lambda img,d: [d.polygon([(MX,MY-5),(MX-18,MY+30),(MX+18,MY+30)],fill='#2C5F8A',outline='white',width=1),d.polygon([(MX-5,MY-5),(MX-8,MY+15),(MX+8,MY+15),(MX+5,MY-5)],fill='white'),d.ellipse([MX-11,MY-30,MX+11,MY-6],fill='#FFCCAA',outline='white',width=1),d.rectangle([MX-10,MY-50,MX+10,MY-30],fill='#111111',outline='white',width=1),d.rectangle([MX-14,MY-32,MX+14,MY-28],fill='#111111',outline='white',width=1),d.arc([MX-8,MY-18,MX-1,MY-12],0,180,fill='#222222',width=2),d.arc([MX+1,MY-18,MX+7,MY-12],0,180,fill='#222222',width=2),d.polygon([(MX-6,MY-5),(MX,MY-2),(MX-6,MY+1)],fill='#CC0000'),d.polygon([(MX+6,MY-5),(MX,MY-2),(MX+6,MY+1)],fill='#CC0000')] or img)(*base('#1A3A6B','#0A1E3A',4,"El Catrín")),
}

# Generate all cards using a comprehensive drawing approach
def make_all_cards():
    import importlib, types
    
    card_defs = [
        (1,'El Gallo','#8B1A1A','#5C1010',
         lambda d: [d.ellipse([MX-18,MY-5,MX+18,MY+25],fill='#CC4400',outline='white',width=1),d.ellipse([MX-8,MY-28,MX+8,MY-10],fill='#CC4400',outline='white',width=1),d.polygon([(MX-4,MY-28),(MX,MY-38),(MX+4,MY-28),(MX+8,MY-34),(MX+12,MY-28)],fill='#FF2200'),d.polygon([(MX+18,MY),(MX+35,MY-20),(MX+30,MY+5),(MX+38,MY-5),(MX+20,MY+15)],fill='#884400'),d.ellipse([MX-2,MY-24,MX+2,MY-20],fill='black'),d.polygon([(MX+8,MY-20),(MX+15,MY-17),(MX+8,MY-14)],fill='#FFAA00'),d.line([(MX-8,MY+25),(MX-8,MY+38)],fill='#FFAA00',width=3),d.line([(MX+8,MY+25),(MX+8,MY+38)],fill='#FFAA00',width=3)]),
        (2,'El Diablito','#4B0000','#2A0000',
         lambda d: [d.ellipse([MX-15,MY,MX+15,MY+28],fill='#CC0000',outline='white',width=1),d.ellipse([MX-12,MY-22,MX+12,MY+2],fill='#CC0000',outline='white',width=1),d.polygon([(MX-12,MY-22),(MX-18,MY-40),(MX-5,MY-22)],fill='#CC0000'),d.polygon([(MX+12,MY-22),(MX+18,MY-40),(MX+5,MY-22)],fill='#CC0000'),d.ellipse([MX-7,MY-15,MX-3,MY-11],fill='#FFFF00'),d.ellipse([MX+3,MY-15,MX+7,MY-11],fill='#FFFF00'),d.arc([MX-8,MY-8,MX+8,MY+2],10,170,fill='black',width=2),d.line([(MX+20,MY-5),(MX+20,MY+30)],fill='#884400',width=3)]),
        (3,'La Dama','#6B0080','#3A0050',
         lambda d: [d.polygon([(MX,MY+5),(MX-25,MY+40),(MX+25,MY+40)],fill='#9B30FF',outline='white',width=1),d.ellipse([MX-10,MY-5,MX+10,MY+15],fill='#FFCCAA',outline='white',width=1),d.ellipse([MX-10,MY-28,MX+10,MY-6],fill='#FFCCAA',outline='white',width=1),d.ellipse([MX-12,MY-38,MX+12,MY-20],fill='#4A0080',outline='#FFD700',width=2),d.ellipse([MX-5,MY-23,MX-2,MY-20],fill='black'),d.ellipse([MX+2,MY-23,MX+5,MY-20],fill='black')]),
        (4,"El Catrín",'#1A3A6B','#0A1E3A',
         lambda d: [d.ellipse([MX-11,MY-30,MX+11,MY-6],fill='#FFCCAA',outline='white',width=1),d.rectangle([MX-10,MY-50,MX+10,MY-30],fill='#111111',outline='white',width=1),d.rectangle([MX-14,MY-32,MX+14,MY-28],fill='#111111',outline='white',width=1),d.polygon([(MX,MY-5),(MX-18,MY+30),(MX+18,MY+30)],fill='#2C5F8A',outline='white',width=1),d.arc([MX-8,MY-18,MX-1,MY-12],0,180,fill='#222222',width=2),d.arc([MX+1,MY-18,MX+7,MY-12],0,180,fill='#222222',width=2)]),
        (5,'El Paraguas','#1A5276','#0A2E44',
         lambda d: [d.pieslice([MX-28,MY-30,MX+28,MY+20],180,360,fill='#E74C3C',outline='white',width=2),[d.line([(MX,MY-5),(MX+int(28*math.cos(math.radians(180+i*45))),MY-5+int(25*math.sin(math.radians(180+i*45))))],fill='white',width=1) for i in range(1,4)],d.line([(MX,MY-5),(MX,MY+35)],fill='#884400',width=3),d.arc([MX-8,MY+28,MX+8,MY+42],0,180,fill='#884400',width=3)]),
        (6,'La Sirena','#1A6B5A','#0A3A30',
         lambda d: [d.polygon([(MX-15,MY+10),(MX+15,MY+10),(MX+10,MY+40),(MX,MY+45),(MX-10,MY+40)],fill='#27AE60',outline='white',width=1),d.polygon([(MX-15,MY+40),(MX,MY+50),(MX+15,MY+40)],fill='#1E8449',outline='white',width=1),d.ellipse([MX-12,MY-10,MX+12,MY+15],fill='#FFCCAA',outline='white',width=1),d.ellipse([MX-10,MY-30,MX+10,MY-8],fill='#FFCCAA',outline='white',width=1),d.arc([MX-15,MY-35,MX+15,MY-5],200,340,fill='#884400',width=5)]),
        (7,'La Escalera','#6B4A0A','#3A2505',
         lambda d: [d.line([(MX-15,MY-35),(MX-15,MY+40)],fill='#8B4513',width=5),d.line([(MX+15,MY-35),(MX+15,MY+40)],fill='#8B4513',width=5),[d.line([(MX-15,MY+y),(MX+15,MY+y)],fill='#A0522D',width=4) for y in range(-30,45,15)]]),
        (8,'La Botella','#1A1A6B','#0A0A3A',
         lambda d: [d.ellipse([MX-16,MY,MX+16,MY+35],fill='#2ECC71',outline='white',width=2),d.rectangle([MX-6,MY-20,MX+6,MY+5],fill='#2ECC71',outline='white',width=1),d.rectangle([MX-8,MY-28,MX+8,MY-18],fill='#CC8844',outline='white',width=1),d.rectangle([MX-12,MY+8,MX+12,MY+28],fill='white'),d.text((MX,MY+18),'TEQUILA',fill='#CC0000',font=lf(7),anchor='mm')]),
        (9,'El Barril','#4A2800','#2A1500',
         lambda d: [d.ellipse([MX-22,MY-25,MX+22,MY+35],fill='#8B4513',outline='white',width=2),[d.arc([MX-22,MY+y-6,MX+22,MY+y+6],0,360,fill='#555555',width=3) for y in [-15,0,15,28]]]),
        (10,'El Árbol','#1A4A1A','#0A2A0A',
         lambda d: [d.rectangle([MX-6,MY+10,MX+6,MY+40],fill='#8B4513'),d.ellipse([MX-22,MY+5,MX+22,MY+35],fill='#27AE60',outline='#1E8449',width=1),d.ellipse([MX-18,MY-8,MX+18,MY+20],fill='#2ECC71',outline='#27AE60',width=1),d.ellipse([MX-12,MY-22,MX+12,MY+5],fill='#58D68D',outline='#2ECC71',width=1),d.line([(MX-6,MY+38),(MX-20,MY+45)],fill='#8B4513',width=3),d.line([(MX+6,MY+38),(MX+20,MY+45)],fill='#8B4513',width=3)]),
        (11,'El Melón','#2A6B1A','#154010',
         lambda d: [d.ellipse([MX-22,MY-15,MX+22,MY+30],fill='#8BC34A',outline='white',width=2),[d.line([(MX+int(20*math.cos(math.radians(a))),MY+7+int(22*math.sin(math.radians(a)))),(MX-int(20*math.cos(math.radians(a))),MY+7-int(22*math.sin(math.radians(a))))],fill='#558B2F',width=2) for a in range(0,180,30)],d.line([(MX,MY-15),(MX-5,MY-25)],fill='#8B4513',width=3)]),
        (12,'El Valiente','#4A1A00','#2A0A00',
         lambda d: [d.polygon([(MX,MY-8),(MX-14,MY+25),(MX+14,MY+25)],fill='#8B3A0A',outline='white',width=1),d.ellipse([MX-10,MY-28,MX+10,MY-5],fill='#FFCCAA',outline='white',width=1),d.ellipse([MX-18,MY-30,MX+18,MY-22],fill='#884400',outline='#FFD700',width=2),d.polygon([(MX+15,MY),(MX+30,MY-15),(MX+28,MY+5),(MX+20,MY+8)],fill='#CCCCCC',outline='white',width=1)]),
        (13,'El Gorrito','#1A1A8B','#0A0A4A',
         lambda d: [d.polygon([(MX-25,MY-5),(MX+25,MY-5),(MX+15,MY-20),(MX-15,MY-20)],fill='#222288',outline='white',width=1),d.rectangle([MX-28,MY-10,MX+28,MY-3],fill='#111166',outline='white',width=1),d.line([(MX+20,MY-18),(MX+25,MY+5)],fill='#FFD700',width=2),d.ellipse([MX+22,MY+3,MX+28,MY+9],fill='#FFD700'),d.ellipse([MX-10,MY,MX+10,MY+22],fill='#FFCCAA',outline='white',width=1),d.rectangle([MX-15,MY+25,MX+15,MY+40],fill='#FFFACD',outline='#884400',width=2)]),
        (14,'La Muerte','#1A0A0A','#0A0505',
         lambda d: [d.ellipse([MX-18,MY-28,MX+18,MY+8],fill='#F5F5DC',outline='white',width=2),d.ellipse([MX-13,MY,MX+13,MY+20],fill='#F5F5DC',outline='white',width=1),d.ellipse([MX-10,MY-20,MX-3,MY-12],fill='black'),d.ellipse([MX+3,MY-20,MX+10,MY-12],fill='black'),d.polygon([(MX-3,MY-10),(MX+3,MY-10),(MX,MY-4)],fill='black'),[d.rectangle([MX+tx,MY+5,MX+tx+4,MY+13],fill='white',outline='black',width=1) for tx in [-8,-3,2,7]],[d.line([(MX+dx*8-int(18*math.cos(math.radians(30*dx))),MY+28+dy*3),(MX+dx*8+int(18*math.cos(math.radians(30*dx))),MY+28-dy*3)],fill='#F5F5DC',width=5) for dx,dy in [(1,-1),(-1,1)]]]),
        (15,'La Pera','#4A6B1A','#2A3A0A',
         lambda d: [d.ellipse([MX-16,MY+5,MX+16,MY+35],fill='#9ACD32',outline='white',width=2),d.ellipse([MX-10,MY-15,MX+10,MY+15],fill='#9ACD32',outline='white',width=1),d.line([(MX,MY-15),(MX-3,MY-28)],fill='#8B4513',width=3),d.ellipse([MX-12,MY-30,MX-1,MY-20],fill='#27AE60')]),
        (16,'La Bandera','#8B1A1A','#5C0A0A',
         lambda d: [d.line([(MX-10,MY-35),(MX-10,MY+40)],fill='#884400',width=4),d.ellipse([MX-13,MY-38,MX-7,MY-32],fill='#FFD700'),d.rectangle([MX-10,MY-32,MX+30,MY-12],fill='#006847'),d.rectangle([MX-10,MY-12,MX+30,MY+8],fill='#FFFFFF'),d.rectangle([MX-10,MY+8,MX+30,MY+28],fill='#CE1126'),d.ellipse([MX+6,MY-7,MX+14,MY+3],fill='#8B6914')]),
        (17,'El Bandolón','#4A2A00','#2A1500',
         lambda d: [d.ellipse([MX-18,MY+5,MX+18,MY+40],fill='#8B4513',outline='white',width=2),d.ellipse([MX-12,MY-15,MX+12,MY+15],fill='#8B4513',outline='white',width=1),d.rectangle([MX-4,MY-40,MX+4,MY-10],fill='#A0522D',outline='white',width=1),d.ellipse([MX-6,MY+15,MX+6,MY+27],fill='#222222',outline='white',width=1),[d.line([(MX+sx,MY-38),(MX+sx,MY+38)],fill='#CCCCCC',width=1) for sx in [-2,0,2]]]),
        (18,'El Violoncello','#1A1A4A','#0A0A2A',
         lambda d: [d.ellipse([MX-16,MY-5,MX+16,MY+25],fill='#8B4513',outline='white',width=2),d.ellipse([MX-13,MY-28,MX+13,MY+5],fill='#8B4513',outline='white',width=1),d.rectangle([MX-3,MY-45,MX+3,MY-28],fill='#A0522D',outline='white',width=1),d.arc([MX-12,MY-2,MX-4,MY+15],20,160,fill='black',width=2),d.arc([MX+4,MY-2,MX+12,MY+15],20,160,fill='black',width=2)]),
        (19,'La Garza','#1A4A5A','#0A2530',
         lambda d: [d.ellipse([MX-15,MY,MX+15,MY+25],fill='#F5F5F5',outline='white',width=1),d.arc([MX-15,MY-30,MX+5,MY+10],230,360,fill='#F5F5F5',width=8),d.ellipse([MX-5,MY-40,MX+10,MY-25],fill='#F5F5F5',outline='white',width=1),d.polygon([(MX+10,MY-35),(MX+28,MY-33),(MX+10,MY-30)],fill='#FFD700'),d.ellipse([MX,MY-38,MX+5,MY-33],fill='black'),d.line([(MX-5,MY+25),(MX-8,MY+45)],fill='#FFD700',width=3),d.line([(MX+5,MY+25),(MX+8,MY+45)],fill='#FFD700',width=3)]),
        (20,'El Pájaro','#1A5A2A','#0A3015',
         lambda d: [d.ellipse([MX-15,MY-5,MX+15,MY+20],fill='#E74C3C',outline='white',width=1),d.ellipse([MX-8,MY-22,MX+8,MY-5],fill='#E74C3C',outline='white',width=1),d.polygon([(MX+8,MY-16),(MX+20,MY-13),(MX+8,MY-10)],fill='#FFD700'),d.ellipse([MX,MY-19,MX+5,MY-14],fill='black'),d.polygon([(MX,MY+5),(MX-20,MY-5),(MX-18,MY+15),(MX+5,MY+18)],fill='#C0392B',outline='white',width=1),d.line([(MX-28,MY+35),(MX+28,MY+35)],fill='#8B4513',width=5)]),
        (21,'La Mano','#5A1A1A','#2A0808',
         lambda d: [[d.rectangle([MX+x-4,MY-h,MX+x+4,MY+20],fill='#FFCCAA',outline='white',width=1) for x,h in zip([-16,-8,0,8,16],[35,42,44,42,32])],d.rectangle([MX-20,MY+10,MX+20,MY+30],fill='#FFCCAA',outline='white',width=1),[d.ellipse([MX+x-5,MY-h-5,MX+x+5,MY-h+5],fill='#FFCCAA',outline='white',width=1) for x,h in zip([-16,-8,0,8,16],[35,42,44,42,32])]]),
        (22,'La Bota','#4A3A00','#2A2000',
         lambda d: [d.rectangle([MX-12,MY-25,MX+5,MY+20],fill='#8B4513',outline='white',width=2),d.ellipse([MX-16,MY+10,MX+20,MY+35],fill='#8B4513',outline='white',width=2),d.rectangle([MX-12,MY-30,MX+5,MY-25],fill='#6B3410',outline='white',width=1),d.rectangle([MX-18,MY+28,MX-8,MY+38],fill='#6B3410',outline='white',width=1)]),
        (23,'La Luna','#050520','#010110',
         lambda d: [d.ellipse([MX-22,MY-20,MX+22,MY+25],fill='#FFFACD',outline='white',width=1),d.ellipse([MX-5,MY-25,MX+30,MY+20],fill='#050520'),d.ellipse([MX-12,MY-5,MX-7,MY],fill='black'),d.ellipse([MX-20,MY-5,MX-15,MY],fill='black'),d.arc([MX-20,MY,MX-7,MY+12],0,180,fill='black',width=2),[dc(d,MX+rx,MY+ry,2,'#FFFACD') for rx,ry in [(-30,-5),(-25,10),(-35,15),(25,5),(30,-10),(10,-25)]]]),
        (24,'El Cotorro','#0A4A1A','#052510',
         lambda d: [d.ellipse([MX-14,MY-5,MX+14,MY+22],fill='#27AE60',outline='white',width=1),d.ellipse([MX-10,MY-25,MX+10,MY-3],fill='#27AE60',outline='white',width=1),d.polygon([(MX+8,MY-18),(MX+20,MY-15),(MX+10,MY-10),(MX+8,MY-12)],fill='#FFD700'),d.ellipse([MX-2,MY-21,MX+4,MY-15],fill='black'),d.polygon([(MX-4,MY+5),(MX-20,MY-5),(MX-18,MY+18),(MX+4,MY+20)],fill='#1E8449'),d.polygon([(MX-10,MY+20),(MX-18,MY+42),(MX-5,MY+38)],fill='#27AE60'),d.polygon([(MX,MY+22),(MX,MY+44),(MX+8,MY+38)],fill='#2ECC71'),d.line([(MX-20,MY+40),(MX+20,MY+40)],fill='#8B4513',width=5)]),
        (25,'El Borracho','#8B4513','#4A2500',
         lambda d: [dc(d,MX,MY-10,20,'#CC6633','white',2),d.arc([MX-10,MY+5,MX+10,MY+20],0,180,fill='#884400',width=3),dc(d,MX-10,MY-12,6,'#FF4444','#CC0000',2),dc(d,MX+10,MY-12,6,'#FF4444','#CC0000',2),d.arc([MX-8,MY-5,MX+8,MY+5],0,180,fill='black',width=2),d.rectangle([MX-5,MY+10,MX+5,MY+40],fill='#884400',outline='white',width=1),d.ellipse([MX-8,MY+5,MX+8,MY+18],fill='#AA8833',outline='white',width=1)]),
        (26,'El Negrito','#2A1A00','#150D00',
         lambda d: [d.polygon([(MX-15,MY+25),(MX,MY-30),(MX+15,MY+25)],fill='#CC4400',outline='white',width=1),dc(d,MX,MY-10,14,'#FFCCAA','white',2),d.arc([MX-8,MY-5,MX+8,MY+8],0,180,fill='black',width=2),[dc(d,MX+px,MY+py,3,'black') for px,py in [(-5,-15),(5,-15)]]]),
        (27,'El Corazón','#6B0000','#3A0000',
         lambda d: [d.polygon([(MX,MY-28),(MX-22,MY-2),(MX,MY+28),(MX+22,MY-2)],fill='#E74C3C',outline='#FF6B6B',width=2),d.polygon([(MX,MY-22),(MX-16,MY-2),(MX,MY+20),(MX+16,MY-2)],fill='#C0392B'),[dc(d,MX+cx,MY-20,9,'#E74C3C','#FF6B6B',2) for cx in [-9,9]]]),
        (28,'La Sandía','#1A5C1A','#0A3010',
         lambda d: [d.ellipse([MX-22,MY-10,MX+22,MY+30],fill='#27AE60',outline='white',width=2),[d.line([(MX+sx,MY-10),(MX+sx,MY+30)],fill='#1E8449',width=1) for sx in range(-18,22,8)],d.ellipse([MX-18,MY,MX+18,MY+20],fill='#FF4444',outline='white',width=1),[dc(d,MX+rx,MY+ry,3,'black') for rx,ry in [(-10,5),(0,8),(10,5),(-5,14),(5,12)]]]),
        (29,'El Tambor','#4A2A00','#2A1500',
         lambda d: [dc(d,MX,MY-5,22,'#8B4513','white',2),dc(d,MX,MY-5,18,'#6B3410'),d.ellipse([MX-5,MY-10,MX+5,MY],fill='#111111',outline='white',width=1),d.line([(MX-5,MY-10),(MX-5,MY+17)],fill='#884400',width=2),d.line([(MX+5,MY-10),(MX+5,MY+17)],fill='#884400',width=2),[d.line([(MX-20,MY-5+sy),(MX+20,MY-5+sy)],fill='#884400',width=3) for sy in [5,12]]]),
        (30,'El Camarón','#1A3A5A','#0A1E30',
         lambda d: [[d.line([pts[i],pts[i+1]],fill='#FF8C69',width=5) for i in range(len(pts)-1)] for pts in [[(MX+20,MY-20),(MX+15,MY-30),(MX+5,MY-32),(MX-5,MY-25),(MX-12,MY-15),(MX-15,MY-5),(MX-12,MY+8),(MX-5,MY+18),(MX+5,MY+22),(MX+15,MY+18),(MX+22,MY+8)]]]+[d.line([(MX+20,MY-20),(MX+35,MY-35)],fill='#FF8C69',width=2),d.line([(MX+15,MY-30),(MX+25,MY-42)],fill='#FF8C69',width=2)]),
        (31,'Las Jaras','#1A3A1A','#0A2010',
         lambda d: [[d.line([(MX+int(28*math.cos(math.radians(a))),MY-10+int(28*math.sin(math.radians(a)))),(MX-int(28*math.cos(math.radians(a))),MY-10-int(28*math.sin(math.radians(a))))],fill=c,width=3) for a,c in [(30,'#8B4513'),(150,'#A0522D'),(90,'#6B3410')]]]),
        (32,'El Músico','#3A1A00','#1A0800',
         lambda d: [dc(d,MX,MY-18,10,'#FFCCAA','white',1),d.polygon([(MX,MY-8),(MX-14,MY+22),(MX+14,MY+22)],fill='#CC4400',outline='white',width=1),d.ellipse([MX-14,MY-5,MX+8,MY+25],fill='#8B4513',outline='white',width=2),dc(d,MX-3,MY+12,5,'#111111','white',1),[d.line([(MX-3+sx,MY-15),(MX-3+sx,MY+7)],fill='#CCCCCC',width=1) for sx in [-2,0,2]]]),
        (33,'La Araña','#0A0A0A','#050505',
         lambda d: [dc(d,MX,MY,12,'#111111','white',2),dc(d,MX,MY,8,'#333333'),[d.line([(MX+int(12*math.cos(math.radians(a))),MY+int(12*math.sin(math.radians(a)))),(MX+int(28*math.cos(math.radians(a))),MY+int(28*math.sin(math.radians(a))))],fill='#AAAAAA',width=2) for a in range(0,360,45)],[dc(d,MX+ex,MY+ey,3,'#FF0000') for ex,ey in [(-3,-4),(3,-4)]]]),
        (34,'El Soldado','#2A3A1A','#151D0D',
         lambda d: [dc(d,MX,MY-18,10,'#FFCCAA','white',1),d.polygon([(MX,MY-8),(MX-13,MY+25),(MX+13,MY+25)],fill='#556B2F',outline='white',width=1),d.ellipse([MX-12,MY-28,MX+12,MY-14],fill='#4A5A28',outline='white',width=2),d.line([(MX+15,MY-5),(MX+15,MY+28)],fill='#884400',width=3),d.polygon([(MX+11,MY-10),(MX+19,MY-10),(MX+15,MY-18)],fill='#CCCCCC')]),
        (35,'La Estrella','#050520','#010110',
         lambda d: [ds(d,MX,MY-5,28,12,'#FFD700','#FFA500',6),ds(d,MX,MY-5,20,8,'#FFED4A','#FFD700',6),[ds(d,MX+int(38*math.cos(math.radians(a))),MY-5+int(38*math.sin(math.radians(a))),5,2,'#FFFACD','#FFD700',5) for a in range(0,360,60)]]),
        (36,'El Cazo','#2A2A2A','#111111',
         lambda d: [d.ellipse([MX-20,MY,MX+20,MY+28],fill='#444444',outline='white',width=2),d.ellipse([MX-22,MY-8,MX+22,MY+8],fill='#666666',outline='white',width=2),d.rectangle([MX+20,MY-4,MX+35,MY+4],fill='#884400',outline='white',width=1),[d.arc([MX+sx-4,MY+sy,MX+sx+4,MY+sy+8],0 if i%2==0 else 180, 180 if i%2==0 else 360,fill='#CCCCCC',width=2) for sx in [-8,0,8] for i,sy in enumerate(range(-30,-12,6))]]),
        (37,'El Mundo','#0A1E3A','#05101E',
         lambda d: [dc(d,MX,MY-5,24,'#1A5276','white',2),dc(d,MX,MY-5,20,'#2980B9'),d.polygon([(MX-12,MY-20),(MX-5,MY-18),(MX-2,MY-10),(MX-10,MY-8),(MX-15,MY-14)],fill='#27AE60'),d.polygon([(MX+2,MY-20),(MX+12,MY-18),(MX+14,MY-8),(MX+6,MY-5),(MX,MY-10)],fill='#27AE60'),d.polygon([(MX-5,MY+2),(MX+8,MY),(MX+10,MY+12),(MX,MY+15),(MX-8,MY+10)],fill='#27AE60')]),
        (38,'El Apache','#3A2A00','#1A1500',
         lambda d: [dc(d,MX,MY-15,12,'#CC8844','white',1),d.polygon([(MX,MY-3),(MX-14,MY+25),(MX+14,MY+25)],fill='#8B4513',outline='white',width=1),[d.line([(MX,MY-27),(MX+int(20*math.cos(math.radians(a-90))),MY-27+int(20*math.sin(math.radians(a-90))))],fill=c,width=4) for a,c in zip([-40,-20,0,20,40],['#E74C3C','#FFD700','#27AE60','#3498DB','#E74C3C'])]]),
        (39,'El Nopal','#1A3A1A','#0A1E0A',
         lambda d: [d.rectangle([MX-8,MY-20,MX+8,MY+30],fill='#27AE60',outline='white',width=2),d.ellipse([MX-10,MY-10,MX+10,MY+20],fill='#2ECC71',outline='white',width=1),d.ellipse([MX-8,MY-22,MX+8,MY+0],fill='#27AE60',outline='white',width=1),d.rectangle([MX+8,MY-10,MX+25,MY+2],fill='#27AE60',outline='white',width=2),d.rectangle([MX-25,MY-5,MX-8,MY+5],fill='#27AE60',outline='white',width=2),[dc(d,MX+8,MY+fy,4,'#E74C3C') for fy in [-24,-20]]]),
        (40,'El Alacrán','#2A2000','#151000',
         lambda d: [[dc(d,MX,MY+sy,max(2,7-i),'#8B6914','#FFD700',1) for i,sy in enumerate(range(-5,20,5))],[d.line([pts[i],pts[i+1]],fill='#8B6914',width=4) for pts in [[(MX,MY+20),(MX+5,MY+30),(MX+12,MY+35),(MX+18,MY+30),(MX+20,MY+20),(MX+18,MY+12)]] for i in range(5)],d.polygon([(MX+18,MY+12),(MX+24,MY+6),(MX+14,MY+8)],fill='#CC0000'),d.arc([MX-25,MY-18,MX-10,MY-5],300,60,fill='#8B6914',width=4),d.arc([MX+10,MY-18,MX+25,MY-5],120,240,fill='#8B6914',width=4)]),
        (41,'La Rosa','#3A0A1A','#1E0510',
         lambda d: [[d.ellipse([MX+int(14*math.cos(math.radians(a)))-8,MY-10+int(14*math.sin(math.radians(a)))-8,MX+int(14*math.cos(math.radians(a)))+8,MY-10+int(14*math.sin(math.radians(a)))+8],fill='#E74C3C',outline='#C0392B',width=1) for a in range(0,360,45)],dc(d,MX,MY-10,9,'#C0392B','#E74C3C',2),d.line([(MX,MY+2),(MX-5,MY+40)],fill='#27AE60',width=4),d.ellipse([MX-16,MY+15,MX-2,MY+28],fill='#27AE60'),d.ellipse([MX+2,MY+22,MX+14,MY+35],fill='#27AE60')]),
        (42,'La Calavera','#1A0A00','#0D0500',
         lambda d: [dc(d,MX,MY-12,18,'#FFFACD','white',2),d.ellipse([MX-12,MY+2,MX+12,MY+18],fill='#FFFACD',outline='white',width=1),d.ellipse([MX-11,MY-20,MX-3,MY-12],fill='#FF69B4',outline='white',width=1),d.ellipse([MX+3,MY-20,MX+11,MY-12],fill='#00CED1',outline='white',width=1),dc(d,MX-7,MY-16,3,'black'),dc(d,MX+7,MY-16,3,'black'),d.polygon([(MX-3,MY-8),(MX+3,MY-8),(MX,MY-3)],fill='black'),[d.rectangle([MX+tx,MY+4,MX+tx+4,MY+12],fill='white',outline='black',width=1) for tx in range(-9,10,6)],[dc(d,MX+fx,MY+fy,4,col) for fx,fy,col in [(-8,-25,'#E74C3C'),(0,-28,'#FFD700'),(8,-25,'#E74C3C')]]]),
        (43,'La Campana','#3A2A00','#1E1500',
         lambda d: [d.polygon([(MX,MY-35),(MX-25,MY+15),(MX+25,MY+15)],fill='#DAA520',outline='#FFD700',width=2),d.ellipse([MX-25,MY+8,MX+25,MY+22],fill='#DAA520',outline='#FFD700',width=2),d.rectangle([MX-4,MY-42,MX+4,MY-35],fill='#884400',outline='white',width=1),dc(d,MX,MY+8,5,'#8B4513','#884400',1),[d.line([(MX+lx,MY-30),(MX+lx,MY+15)],fill='#B8860B',width=1) for lx in [-15,-7,0,7,15]]]),
        (44,'El Cantarito','#3A1A00','#1E0D00',
         lambda d: [d.polygon([(MX-5,MY-30),(MX-8,MY-20),(MX-18,MY+5),(MX-15,MY+25),(MX+15,MY+25),(MX+18,MY+5),(MX+8,MY-20),(MX+5,MY-30)],fill='#CC6633',outline='white',width=2),d.ellipse([MX-8,MY-33,MX+8,MY-27],fill='#AA4422',outline='white',width=2),d.arc([MX+15,MY-10,MX+30,MY+15],300,60,fill='#AA4422',width=3),d.ellipse([MX-5,MY-2,MX+5,MY+8],fill='#111111',outline='white',width=1)]),
        (45,'El Venado','#3A2A00','#1E1500',
         lambda d: [d.ellipse([MX-14,MY-5,MX+14,MY+22],fill='#D2691E',outline='white',width=1),d.ellipse([MX-10,MY-28,MX+10,MY-5],fill='#D2691E',outline='white',width=1),d.line([(MX-8,MY-28),(MX-18,MY-45)],fill='#8B4513',width=3),d.line([(MX-18,MY-45),(MX-25,MY-38)],fill='#8B4513',width=2),d.line([(MX-18,MY-45),(MX-12,MY-52)],fill='#8B4513',width=2),d.line([(MX+8,MY-28),(MX+18,MY-45)],fill='#8B4513',width=3),d.line([(MX+18,MY-45),(MX+25,MY-38)],fill='#8B4513',width=2),d.line([(MX+18,MY-45),(MX+12,MY-52)],fill='#8B4513',width=2),[dc(d,MX+sx,MY+sy,3,'#F4A460') for sx,sy in [(-8,5),(0,2),(8,5),(-5,15),(5,12)]]]),
        (46,'El Sol','#3A1A00','#1E0D00',
         lambda d: [ds(d,MX,MY-5,30,20,'#FFD700','#FFA500',12),dc(d,MX,MY-5,18,'#FFD700','#FFA500',2),dc(d,MX,MY-5,14,'#FFAA00'),d.arc([MX-8,MY-12,MX+8,MY],0,180,fill='black',width=2),dc(d,MX-5,MY-12,2,'black'),dc(d,MX+5,MY-12,2,'black')]),
        (47,'La Corona','#3A2A00','#1E1500',
         lambda d: [d.polygon([(MX-22,MY+8),(MX-22,MY-15),(MX-12,MY-28),(MX,MY-15),(MX+12,MY-28),(MX+22,MY-15),(MX+22,MY+8)],fill='#FFD700',outline='white',width=2),[d.ellipse([MX+gx-5,MY+gy-5,MX+gx+5,MY+gy+5],fill=col,outline='white',width=1) for gx,gy,col in [(-12,-20,'#E74C3C'),(0,-20,'#3498DB'),(12,-20,'#2ECC71')]],d.rectangle([MX-22,MY+2,MX+22,MY+12],fill='#DAA520',outline='white',width=1),[dc(d,MX+bx,MY+7,4,'#E74C3C','white',1) for bx in [-14,-5,5,14]]]),
        (48,'La Chalupa','#0A2A3A','#051520',
         lambda d: [d.polygon([(MX-28,MY+15),(MX+28,MY+15),(MX+22,MY+30),(MX-22,MY+30)],fill='#8B4513',outline='white',width=2),d.line([(MX,MY+12),(MX,MY-30)],fill='#8B4513',width=3),d.polygon([(MX,MY-28),(MX,MY+8),(MX+22,MY-10)],fill='white',outline='#CCCCCC',width=1),[dc(d,MX+fx,fy,5,col,'white',1) for fx,fy,col in [(-12,MY+16,'#E74C3C'),(0,MY+14,'#FFD700'),(12,MY+16,'#FF69B4')]]]),
        (49,'El Pino','#0A2A0A','#051505',
         lambda d: [d.rectangle([MX-5,MY+20,MX+5,MY+40],fill='#8B4513'),d.polygon([(MX,MY-35),(MX-22,MY+22),(MX+22,MY+22)],fill='#1E5C1E',outline='white',width=1),d.polygon([(MX,MY-20),(MX-18,MY+10),(MX+18,MY+10)],fill='#27AE60',outline='white',width=1),d.polygon([(MX,MY-5),(MX-14,MY+18),(MX+14,MY+18)],fill='#2ECC71',outline='white',width=1),ds(d,MX,MY-37,7,3,'#FFD700','#FFA500',5),[dc(d,MX+ox,MY+oy,4,col,'white',1) for ox,oy,col in [(-10,-5,'#E74C3C'),(5,5,'#FFD700'),(-5,12,'#3498DB'),(10,-8,'#E74C3C')]]]),
        (50,'El Pescado','#0A1E3A','#05101E',
         lambda d: [d.ellipse([MX-20,MY-10,MX+18,MY+15],fill='#4682B4',outline='white',width=2),d.polygon([(MX+18,MY),(MX+32,MY-12),(MX+35,MY+2),(MX+32,MY+15)],fill='#4169E1',outline='white',width=1),dc(d,MX-12,MY-2,5,'white','white',1),dc(d,MX-12,MY-2,3,'black'),d.arc([MX-20,MY-2,MX-12,MY+6],10,170,fill='black',width=2),[d.arc([MX+sx-5,MY+sy-3,MX+sx+5,MY+sy+3],0,180,fill='#1E90FF',width=1) for sy in range(-5,12,7) for sx in range(-15,15,8)]]),
        (51,'La Palma','#0A2A0A','#051510',
         lambda d: [d.rectangle([MX-5,MY+5,MX+5,MY+42],fill='#8B4513'),[d.line([(MX,MY-10),(MX+int(30*math.cos(math.radians(a-90))),MY-10+int(30*math.sin(math.radians(a-90))))],fill='#27AE60',width=3) for a in range(-60,70,25)],[dc(d,MX+cx,MY+cy,5,'#8B4513','#654321',1) for cx,cy in [(-5,-12),(5,-10),(0,-18)]]]),
        (52,'La Maceta','#2A1A00','#150D00',
         lambda d: [d.polygon([(MX-16,MY+5),(MX+16,MY+5),(MX+12,MY+30),(MX-12,MY+30)],fill='#CC6633',outline='white',width=2),d.ellipse([MX-18,MY,MX+18,MY+10],fill='#AA4422',outline='white',width=2),[dc(d,MX+fx,fy,8,col,'white',1) for fx,fy,col in [(-5,MY-25,'#E74C3C'),(5,MY-28,'#FF69B4'),(0,MY-22,'#FFD700')]]]),
        (53,'El Arpa','#2A1A00','#150D00',
         lambda d: [d.arc([MX-20,MY-40,MX+20,MY+20],180,360,fill='#8B4513',width=5),d.line([(MX-20,MY-5),(MX-20,MY+30)],fill='#8B4513',width=5),d.line([(MX-20,MY+30),(MX+8,MY+30)],fill='#8B4513',width=5),d.line([(MX+8,MY+30),(MX+8,MY-10)],fill='#8B4513',width=4),[d.line([(MX+sx,MY-25+sx//2),(MX+sx,MY+28)],fill='#FFFACD',width=1) for sx in range(-15,8,4)]]),
        (54,'La Rana','#0A2A0A','#051510',
         lambda d: [d.ellipse([MX-18,MY-5,MX+18,MY+22],fill='#27AE60',outline='white',width=2),d.ellipse([MX-14,MY-22,MX+14,MY+0],fill='#2ECC71',outline='white',width=1),[dc(d,MX+ex,MY-22,7,'#2ECC71','white',2) for ex in [-8,8]],[dc(d,MX+ex,MY-22,4,'black') for ex in [-8,8]],d.arc([MX-10,MY-12,MX+10,MY+2],0,180,fill='black',width=2),d.arc([MX-25,MY-5,MX-10,MY+10],200,320,fill='#27AE60',width=5),d.arc([MX+10,MY-5,MX+25,MY+10],220,340,fill='#27AE60',width=5),d.arc([MX-22,MY+10,MX-5,MY+35],150,280,fill='#27AE60',width=5),d.arc([MX+5,MY+10,MX+22,MY+35],260,390,fill='#27AE60',width=5)]),
    ]

    ok = fail = 0
    for n,name,c1,c2,draw_fn in card_defs:
        try:
            img,d = base(c1,c2,n,name)
            draw_fn(d)
            out = os.path.join(CACHE_DIR,f'{n}.png')
            img.save(out,'PNG')
            print(f"  ✅ {n:2d}. {name}")
            ok += 1
        except Exception as e:
            print(f"  ❌ {n:2d}. {name}: {e}")
            fail += 1
    print(f"\nGenerated {ok}/54 cards in {CACHE_DIR}")
    if fail: print(f"⚠️ {fail} cards failed")

make_all_cards()
