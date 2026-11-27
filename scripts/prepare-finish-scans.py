"""Convert the nine official 1K JPGs in a supplied directory to the published surface scans."""
import argparse
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

SOURCES = {
    "rough_linen": ("linen", ["663db789fb075462b685c1f740e58930", "3350269a2e9c472aa406bd3cc1eaf2c8", "a380b24cc43cff88c39510305ebf0020"]),
    "white_plaster_02": ("plaster", ["7b10c2686bcfd76d1f309a20fd06b57e", "55fc03203ebf1dc703a380fde93ff502", "8b28f263360b8c4ddbdc4f7c650c4eeb"]),
    "floor_tiles_08": ("tile", ["9bc91e302a76ad75a9b7e539fe48c28d", "bb50864feaf77042db591638f382d920", "3d1bea97f901afcef3d8c2f8d4414b07"]),
}
CHANNELS = [("diff", "color", 80), ("nor_gl", "normal", 89), ("rough", "rough", 75)]
OUT = Path(__file__).resolve().parents[1] / "public/assets/finishes"


def matte_coat(image, low_gain):
    # Work in linear reflectance. Periodic Gaussian decomposition preserves seamless borders.
    rgb = np.asarray(image, dtype=float) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    fy, fx = np.fft.fftfreq(image.height), np.fft.fftfreq(image.width)
    gaussian = np.exp(-2 * np.pi**2 * 12**2 * (fy[:, None]**2 + fx[None, :]**2))
    low = np.fft.ifft2(np.fft.fft2(linear, axes=(0, 1)) * gaussian[:, :, None], axes=(0, 1)).real
    mean = linear.mean(axis=(0, 1))
    value = np.clip(mean + low_gain * (low - mean) + (linear - low), 0, 1)
    srgb = np.where(value <= .0031308, 12.92 * value, 1.055 * value**(1/2.4) - .055)
    return Image.fromarray(np.rint(srgb * 255).astype("uint8"))


def level_normal(image):
    vector = np.asarray(image, dtype=np.float32) / 127.5 - 1
    slope = vector[:, :, :2] / np.maximum(vector[:, :, 2:], .1)
    slope -= slope.mean(axis=(0, 1))
    unit = np.concatenate([slope, np.ones_like(slope[:, :, :1])], axis=2)
    unit /= np.linalg.norm(unit, axis=2)[:, :, None]
    return Image.fromarray(np.rint(np.clip((unit+1)*127.5,0,255)).astype("uint8"))


def prepare(directory):
    OUT.mkdir(exist_ok=True, parents=True)
    for slug, (material, hashes) in SOURCES.items():
        for (suffix, channel, quality), expected in zip(CHANNELS, hashes):
            path = directory / f"{slug}_{suffix}_1k.jpg"
            if hashlib.md5(path.read_bytes()).hexdigest() != expected:
                raise ValueError(f"Publisher hash mismatch: {path}")
            image = Image.open(path).convert("RGB")
            if channel == "rough" or (channel == "color" and material == "linen"):
                image = ImageOps.grayscale(image)
            image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
            if channel == "color" and material in ("plaster", "tile"):
                image = matte_coat(image, .28 if material == "plaster" else .72)
            if channel == "normal" and material == "tile":
                image = level_normal(image)
            image.save(OUT / f"{material}-{channel}.webp", "WEBP", quality=quality, method=6)


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("source_directory", type=Path)
    prepare(args.parse_args().source_directory)
