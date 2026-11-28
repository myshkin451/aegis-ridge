"""Draw two original copperplate-style maps from the published Aegis Ridge elevation grids."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public/assets/art"
PAPER = np.array([227, 213, 186], dtype=float)
INK = np.array([56, 49, 38], dtype=float)


def font(size, italic=False):
    names = ["Times New Roman Italic.ttf", "DejaVuSerif-Italic.ttf"] if italic else ["Baskerville.ttc", "DejaVuSerif.ttf"]
    for name in names:
        for path in [Path("/System/Library/Fonts/Supplemental") / name, Path(name)]:
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                pass
    raise FileNotFoundError(names)


def sample_map(tile, count, center, angle, extent, shape):
    grid = np.fromfile(ROOT / f"public/terrain/{tile}.bin", np.uint8).reshape(count, count, 6)
    elevations = grid[:, :, 0].astype(float) + 256 * grid[:, :, 1].astype(float)
    elevations = elevations / 32 - 512
    packet = Image.fromarray(elevations.astype("float32"))
    w, h = shape
    c, s = np.cos(angle), np.sin(angle)
    a, b = extent / w * c, extent / w * s
    matrix = (a, -b, center[0]-a*w*.5+b*h*.5, b, a, center[1]-b*w*.5-a*h*.5)
    return np.asarray(packet.transform(shape, Image.Transform.AFFINE, matrix, Image.Resampling.BICUBIC))


def engraving(height, seed, sun, interval):
    h, w = height.shape
    rng = np.random.default_rng(seed)
    gy, gx = np.gradient(height)
    slope = np.hypot(gx, gy)
    norm = np.maximum(slope, .01)
    # Relief is expressed with screened ink and short strokes. The slopes supply the stroke direction.
    aspect = np.clip((gx*sun[0] + gy*sun[1]) / (norm + .22), -1, 1)
    shadow = np.clip(np.maximum(0, aspect + .15) * np.minimum(1., slope/1.2), 0, 1)
    broad = np.asarray(Image.fromarray(np.uint8(shadow*255)).filter(ImageFilter.GaussianBlur(4))) / 255
    tone = .045 + .19*shadow + .27*broad
    # Analytic elevation isolines keep even the illuminated ridges legible at a distance.
    for step, linewidth, density in [(interval, .65, .27), (interval*5, 1.65, .46)]:
        distance = np.abs((height + step*.5) % step - step*.5) / np.maximum(slope, .035)
        tone += np.clip(1-distance/linewidth, 0, 1) * density
    plate = Image.fromarray(np.uint8(np.clip(tone, 0, .88)*255))
    d = ImageDraw.Draw(plate)
    pitch = 7
    for row in range(2, h-2, pitch):
        for col in range(2, w-2, pitch):
            x = int(np.clip(col + rng.uniform(-3,3), 0, w-1))
            y = int(np.clip(row + rng.uniform(-3,3), 0, h-1))
            ink = shadow[y,x]
            if rng.random() > .10 + .89*ink:
                continue
            length = 2.5 + (6.5 + 4.5*rng.random())*ink
            stroke = [(x,y)]
            px, py = x, y
            for _ in range(3):
                i, j = int(np.clip(py,0,h-1)), int(np.clip(px,0,w-1))
                px += gx[i,j]/norm[i,j]*length/3
                py += gy[i,j]/norm[i,j]*length/3
                stroke.append((px,py))
            d.line(stroke, fill=int(70+142*ink), width=2 if ink>.65 else 1)
    return np.array(plate, dtype=float)/255


def print_plate(file, height, title, seed, sun, interval, scale):
    rng = np.random.default_rng(seed)
    page = Image.new("RGB", (780,1024), tuple(PAPER.astype(int)))
    d = ImageDraw.Draw(page)
    x0, y0 = 48, 74
    h,w = height.shape
    shade = engraving(height,seed,sun,interval)
    pigment = PAPER + (INK-PAPER)*shade[:,:,None]
    page.paste(Image.fromarray(np.uint8(pigment)),(x0,y0))
    d.rectangle([x0-1,y0-1,x0+w,y0+h],outline="#756853",width=2)
    d.rectangle([x0-5,y0-5,x0+w+4,y0+h+4],outline="#ad9d81")
    # A small number of survey graticule ticks, leaving continuous white margins.
    for x in range(x0,x0+w,76):
        d.line([x,y0-5,x,y0-10],fill="#74644d")
        d.line([x,y0+h+4,x,y0+h+9],fill="#74644d")
    for y in range(y0,y0+h,76):
        d.line([x0-5,y,x0-10,y],fill="#74644d")
        d.line([x0+w+4,y,x0+w+9,y],fill="#74644d")
    d.text((x0,34),"A E G I S   R I D G E",font=font(19),fill="#514838")
    d.text((x0+w,36),"RELIEF   /   "+("I" if seed==941 else "II"),font=font(16),fill="#615341",anchor="ra")
    d.text((390,919),title,font=font(35,italic=True),fill="#463b2c",anchor="ma")
    d.text((390,969),scale,font=font(15),fill="#625744",anchor="ma")
    fibers = rng.normal(0,1.8,(1024,780,1))
    rgb = np.clip(np.asarray(page,dtype=float)+fibers,0,255).astype("uint8")
    Image.fromarray(rgb).save(ART/file,"WEBP",quality=90,method=6)


def main():
    size=(684,824)
    ridge=sample_map("horizon-v2",501,(97,343),-.52,102,size)
    valley=sample_map("horizon-v2",501,(357,265),.65,126,size)
    print_plate("western-spurs.webp",ridge,"The Western Spurs",941,(-.77,.64),16,
                "Contour interval   16 m     ·     Western massif")
    print_plate("eastern-fold.webp",valley,"The Eastern Fold",1723,(.71,-.70),13,
                "Contour interval   13 m     ·     Eastern catchment")


if __name__ == "__main__":
    main()
