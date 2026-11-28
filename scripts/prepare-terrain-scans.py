"""Pack the five Poly Haven 1K surface scans. Input JPG names follow the official file index."""
import argparse
import hashlib
from pathlib import Path

from PIL import Image


# Publisher MD5, in Diffuse / Displacement / nor_gl / Rough order.
SCANS = {
    "tiger_rock": ("cliff", (
        "b44beae4b6ae5ad7f7ded23a7dad25e0", "f949d857fd165439e28b5d62285fd654",
        "6c62f9ebf4a3298d7a7597fef12054d7", "a54509d25213e37fb8dbb8e9c08a9af6")),
    "gravel_stones": ("talus", (
        "0e04ba65c86cbc55554877bad6a40354", "1893aa81a89d9bb0a9b69ec0ae559890",
        "ae11c45b9bf93346c4b521ab02ec165d", "c1447058cea79417f1d19a4d8be8be28")),
    "sparse_grass": ("meadow", (
        "5d0aba796e1b5882555161c16b10ee9d", "6efc347cdcc87ae206bf691ff082a009",
        "3307e6ce47413c6b4e85885d4b8ae932", "acf2fd7e352e7635f67f24ecda01e485")),
    "snow_02": ("snow", (
        "fc54766c6b36ff298699115a619d440b", "d2133b5c5a7fb3515ae538ceb4e25308",
        "f16b5701f9ad521cdd6af10c1d6d2b48", "1dbae0269e53dbf80d4fd1c4335f25a2")),
    "brown_mud_dry": ("soil", (
        "0c0ad82fec60f091690c69c23657cb74", "df23614707acdfece0d89aa7299e1fa3",
        "a842517bea5187ccbceb69fd26629d1e", "4e047a601af768eded6468faab4ec615")),
}


def prepare(directory):
    out = Path(__file__).resolve().parents[1] / "public/assets/terrain"
    out.mkdir(parents=True, exist_ok=True)
    for slug, (name, checksums) in SCANS.items():
        maps = []
        for suffix, checksum in zip(("diff", "disp", "nor_gl", "rough"), checksums):
            path = directory / f"{slug}_{suffix}_1k.jpg"
            if hashlib.md5(path.read_bytes()).hexdigest() != checksum:
                raise ValueError(f"Publisher MD5 mismatch: {path}")
            with Image.open(path) as image:
                if image.size != (1024, 1024):
                    raise ValueError(f"Unexpected dimensions: {path}")
                maps.append(image.copy())
        color, height, normal, rough = maps
        # Keep the transmission images opaque. Canvas decode preserves RGB even where displacement is zero.
        surface = Image.merge("RGB", (normal.getchannel("R"), normal.getchannel("G"), rough.convert("L")))
        for channel, image, quality in (("color", color, 77), ("height", height, 80), ("surface", surface, 86)):
            image.save(out / f"{name}-{channel}.webp", "WEBP", quality=quality, method=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_directory", type=Path)
    prepare(parser.parse_args().source_directory)
