"""Build the three WebGL leaf cards from ambientCG LeafSet018 / LeafSet020 2K PNG zip files."""
import argparse
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

TILE = 256
RESAMPLE = Image.Resampling.LANCZOS


def specimen(file, bounds):
    with ZipFile(file) as archive:
        def read(channel):
            name = next(n for n in archive.namelist() if n.endswith('_' + channel + '.png'))
            return Image.open(BytesIO(archive.read(name))).crop(bounds)
        color = ImageEnhance.Color(read('Color').convert('RGB')).enhance(0.83)
        color.putalpha(read('Opacity').convert('L'))
        return color


def mount_leaf(image, size, x, y):
    tile = Image.new('RGBA', (TILE, TILE))
    tile.alpha_composite(image.resize(size, RESAMPLE), (x, y))
    return tile


def compound(blade):
    tile = Image.new('RGBA', (TILE, TILE))
    pen = ImageDraw.Draw(tile)
    pen.line([(128, 249), (124, 160), (129, 83), (127, 39)], fill=(134, 155, 87, 255), width=3)
    for i, (cy, length, spread) in enumerate([(192, 102, 49), (141, 110, 57), (89, 96, 46)]):
        for side in (-1, 1):
            leaflet = blade.resize((round(length * .65), length), RESAMPLE)
            # Rotation moves the petiole toward the compound midrib.
            leaflet = leaflet.rotate(-side * (52 + 4 * i), Image.Resampling.BICUBIC, expand=True)
            cx = 128 + side * spread
            tile.alpha_composite(leaflet, (cx - leaflet.width // 2, cy - leaflet.height // 2))
            pen.line([(127, cy + 24), (cx, cy)], fill=(119, 149, 75, 255), width=2)
    tip = blade.resize((55, 75), RESAMPLE)
    tile.alpha_composite(tip, (106, 7))
    return tile


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('broad', type=Path)
    args.add_argument('serrated', type=Path)
    args.add_argument('output', type=Path)
    paths = args.parse_args()
    broad = specimen(paths.broad, (744, 48, 1260, 954))
    serrated = specimen(paths.serrated, (82, 99, 306, 912))
    tiles = [
        mount_leaf(serrated, (225, 240), 10, 9),
        mount_leaf(broad, (216, 241), 18, 8),
        compound(broad),
    ]
    atlas = Image.new('RGBA', (TILE * len(tiles), TILE))
    for index, tile in enumerate(tiles):
        # Fill zero-alpha texels with nearby foliage colour to suppress dark mip fringes.
        color = tile.convert('RGB').filter(ImageFilter.MaxFilter(7))
        rgba = color.convert('RGBA')
        rgba.paste(tile.convert('RGB'), mask=tile.getchannel('A'))
        rgba.putalpha(tile.getchannel('A'))
        atlas.paste(rgba, (index * TILE, 0))
    atlas.save(paths.output, quality=91, method=6, exact=True)


if __name__ == '__main__':
    main()
