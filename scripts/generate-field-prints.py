"""Rebuild the three original ARS-01 prints using Pillow, NumPy and the published terrain samples."""
from pathlib import Path
from math import cos, sin, pi
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/art"
FONTS = Path("/System/Library/Fonts/Supplemental")
INK, PAPER = "#283b37", "#f0e7ce"


def font(size, italic=False, mono=False):
    names = ("Courier New.ttf", "DejaVuSansMono.ttf") if mono else (
        ("Times New Roman Italic.ttf", "DejaVuSerif-Italic.ttf") if italic
        else ("Baskerville.ttc", "DejaVuSerif.ttf")
    )
    for name in names:
        for path in (FONTS / name, Path(name)):
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                pass
    raise FileNotFoundError(names)


def sheet(w, h, series):
    im = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(im)
    d.text((42, 25), series, font=font(15, mono=True), fill=INK)
    d.text((w-42, 25), "ARS  /  01", anchor="ra", font=font(15, mono=True), fill=INK)
    d.line((42, 51, w-42, 51), fill=INK, width=2)
    return im, d


def publish(im, name):
    # Fine screened-paper texture derived from a fixed seed, never baked lighting.
    a = np.asarray(im, dtype=np.int16)
    grain = np.random.default_rng(1894).normal(0, 1.6, (*a.shape[:2], 1))
    arr = np.clip(a + grain, 0, 255).astype("uint8")
    Image.fromarray(arr).save(OUT / name, "WEBP", quality=86, method=6)


def terrain(name, n):
    raw = np.frombuffer((ROOT / f"public/terrain/{name}.bin").read_bytes(), dtype=np.uint8).reshape(n, n, 6)
    heights = (raw[:, :, 0].astype(float) + 256 * raw[:, :, 1].astype(float)) / 32 - 512
    return heights, raw[:, :, 4]


def ridge():
    im, d = sheet(1024, 683, "RELIEF SURVEY   /   TRANSECTS")
    d.text((40, 64), "Across the ridge", font=font(61), fill=INK)
    h, _ = terrain("mountain", 481)
    x0, x1, y0, y1 = 42, 982, 173, 544
    d.rectangle((x0, y0, x1, y1), fill="#e4c49e")
    d.ellipse((700, 184, 812, 296), fill="#d78254")
    rows = [32, 78, 121, 166, 211, 256, 302, 349, 392, 441]
    inks = ["#c5ab91", "#b8a695", "#a69d89", "#a29279", "#84947d",
            "#768571", "#687c70", "#566e63", "#48645b", "#37544f"]
    for k, row in enumerate(rows):
        line = h[row, 12:-12]
        # Each surveyed E-W transect has its own parallel datum for comparison.
        profile = (line - line.min()) * .20
        baseline = y0 + 110 + k * 27
        samples = [(round(x0 + i * (x1 - x0) / (len(line) - 1)), round(baseline - float(z)))
                   for i, z in enumerate(profile)]
        d.polygon(samples + [(x1, y1), (x0, y1)], fill=inks[k])
        d.line(samples, fill="#e7d7b1", width=2)
        for offset in (5, 10):
            d.line([(x, min(y1, y + offset)) for x, y in samples], fill=inks[max(0, k-1)], width=1)
    d.line((x0, y1+14, x1, y1+14), fill=INK, width=2)
    for frac, value in ((0, "W"), (.25, "570"), (.5, "1140"), (.75, "1710"), (1, "2280 m  E")):
        x = round(x0 + frac*(x1-x0))
        d.line((x, y1+10, x, y1+20), fill=INK)
        d.text((x, y1+25), value, anchor="la" if frac == 0 else "ra" if frac == 1 else "ma",
               font=font(13, mono=True), fill=INK)
    d.text((42, 614), "Mountain transects", font=font(28, italic=True), fill=INK)
    d.text((981, 626), "10 profiles   /   5 m sample interval", anchor="ra", font=font(15, mono=True), fill=INK)
    publish(im, "ridge-transects.webp")


def larch():
    im, d = sheet(683, 1024, "BOTANICAL STUDY   /   CONIFERS")
    d.text((42, 69), "Larix", font=font(83, italic=True), fill=INK)
    d.text((45, 162), "Short shoots and seed cones", font=font(28), fill="#605c49")
    rng = random.Random(73)
    green = ["#55644a", "#6f7950", "#738459", "#8b9162", "#516f5a", "#8b8051"]
    def branch(a, b, width):
        # Quadratic curve with short-shoot fascicles on both sides.
        ax, ay = a; bx, by = b
        cx, cy = (ax+bx)/2 + (by-ay)*.09, (ay+by)/2 - (bx-ax)*.10
        def point(t):
            return ((1-t)**2*ax+2*t*(1-t)*cx+t*t*bx, (1-t)**2*ay+2*t*(1-t)*cy+t*t*by)
        pts = [point(i/40) for i in range(41)]
        d.line(pts, fill="#554b35", width=width)
        d.line(pts, fill="#a38459", width=max(1,width//3))
        for i in range(2, 17):
            t = i/18
            x, y = point(t)
            reach = (30+18*(1-t)) * rng.uniform(.84,1.1)
            for j in range(15):
                ang = (-pi*.95 + j*pi*1.83/14) + rng.uniform(-.14,.14)
                r = reach*rng.uniform(.53,1)
                q = (x+cos(ang)*r, y+sin(ang)*r*.79)
                mid = ((x+q[0])/2+1.7, (y+q[1])/2-2.4)
                d.line([(x,y),mid,q], fill=rng.choice(green), width=rng.choice([1,2,2]))
            d.ellipse((x-2,y-2,x+2,y+2),fill="#796344")
    trunk = [(150,838),(223,704),(293,560),(351,437),(419,303),(468,229)]
    for i in range(len(trunk)-1):
        d.line(trunk[i:i+2],fill="#534a36",width=11-i*2)
    for a,b,w in [((234,685),(126,512),5),((266,613),(537,495),5),
                  ((294,562),(188,371),4),((330,478),(528,364),4),
                  ((373,394),(298,232),4),((405,334),(521,253),3),
                  ((192,758),(110,673),3),((440,270),(482,215),3)]:
        branch(a,b,w)
    def cone(x,y,w,h):
        d.ellipse((x-w/2,y-h/2,x+w/2,y+h/2),fill="#775a40",outline="#5a4936",width=2)
        for row in range(8):
            v=(row+.5)/8
            radius=w*.51*sin(pi*v)**.55
            count=max(2,round(2*radius/11))
            for col in range(count):
                px=x-radius+(col+.5)*2*radius/count; py=y-h/2+h*v
                scale=7+2*sin(pi*v)
                d.polygon([(px-scale,py-5),(px-3,py+5),(px+3,py+7),(px+scale,py-4),(px,py-7)],
                          fill=rng.choice(["#a78558","#94724b","#af8f62","#8c704d"]),outline="#6e5239")
    cone(311,540,43,65); cone(408,313,33,52)
    d.line((392,663,456,712,562,712),fill="#897e60",width=1)
    cone(516,790,75,103)
    d.text((516,858), "Mature cone", anchor="ma", font=font(21,italic=True),fill=INK)
    d.line((42,909,641,909),fill=INK,width=2)
    d.text((42,928), "Alpine larch", font=font(32),fill=INK)
    d.text((42,975), "Form study    /    needle clusters on short shoots", font=font(15,mono=True),fill=INK)
    publish(im, "larch-study.webp")


def water():
    im,d=sheet(683,1024, "HYDROLOGY   /   SURFACE FLOW")
    d.text((42,71),"Fall line",font=font(76,italic=True),fill=INK)
    d.text((44,162),"Runoff across the mountain",font=font(26),fill=INK)
    h,flow=terrain("mountain",481)
    h=h[115:353,130:349]; f=flow[115:353,130:349]
    x,y=42,229; w,hpx=599,651
    # Contours and drainage derive directly from the archived six-byte terrain samples.
    tone = np.floor((h-h.min())/15).astype(int)
    pal=np.array([[223,211,169],[216,204,159],[202,196,155],[192,195,157],[187,190,149],
                  [179,183,141],[174,175,133],[167,172,132],[159,166,128]],dtype=float)
    rgb=pal[np.clip((tone*len(pal)/(tone.max()+1)).astype(int),0,len(pal)-1)]
    dz,dx=np.gradient(h)
    rgb=(rgb + np.clip(dx-dz,-8,8)[:,:,None]*1.5).clip(0,255).astype('uint8')
    base=Image.fromarray(rgb).resize((w,hpx),Image.Resampling.BICUBIC)
    im.paste(base,(x,y))
    def point(col,row): return (x+col*(w-1)/(h.shape[1]-1),y+row*(hpx-1)/(h.shape[0]-1))
    for z in np.arange(np.ceil(h.min()/20)*20,h.max(),20):
        for row in range(h.shape[0]-1):
            inds=np.where((np.minimum.reduce([h[row,:-1],h[row,1:],h[row+1,:-1],h[row+1,1:]])<z) &
                          (np.maximum.reduce([h[row,:-1],h[row,1:],h[row+1,:-1],h[row+1,1:]])>=z))[0]
            for col in inds:
                quad=[(col,row),(col+1,row),(col+1,row+1),(col,row+1)]
                pts=[]
                for a,b in zip(quad,quad[1:]+quad[:1]):
                    va,vb=h[a[1],a[0]],h[b[1],b[0]]
                    if (va<z)!=(vb<z):
                        t=(z-va)/(vb-va);pts.append(point(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
                if len(pts)>=2:d.line(pts[:2],fill="#8f8b6b" if z%100 else "#6e755c",width=1 if z%100 else 2)
    # Link cells to their steepest lower neighbour, using the published log accumulation for stroke class.
    for row,col in np.argwhere(f>140):
        if row==0 or col==0 or row+1==h.shape[0] or col+1==h.shape[1]:continue
        edges=[(h[row,col]-h[row+j,col+i])/(i*i+j*j)**.5 for i,j in DIR]
        k=int(np.argmax(edges))
        if edges[k]<=0:continue
        i,j=DIR[k]
        d.line([point(col,row),point(col+i,row+j)],fill="#255d62" if f[row,col]>205 else "#568383",
               width=3 if f[row,col]>230 else 2)
    d.line((x+16,y+hpx-22,x+153,y+hpx-22), fill=INK,width=3)
    d.text((x+17,y+hpx-47),"250 m",font=font(16,mono=True),fill=INK)
    d.text((42,909),"Potential drainage",font=font(32,italic=True),fill=INK)
    d.text((42,962),"20 m contours    /    5 m grid    /    modelled flow",font=font(15,mono=True),fill=INK)
    publish(im,"surface-drainage.webp")


DIR=[(i,j) for j in (-1,0,1) for i in (-1,0,1) if i or j]
if __name__=="__main__":
    OUT.mkdir(exist_ok=True,parents=True)
    ridge(); larch(); water()
