#!/usr/bin/env python3
"""Chroma-key and slice the generated art in art-src/ into public/assets/.

Usage: python3 scripts/process-art.py   (requires pillow, numpy, scipy)
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src"
OUT = ROOT / "public" / "assets"


def key_magenta(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    border = np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3),
                             rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    bg_m = float(min(bg[0], bg[2]) - bg[1])
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    magenta = np.minimum(r, b) - g
    lo, hi = bg_m * 0.40, bg_m * 0.80
    alpha = 1.0 - np.clip((magenta - lo) / (hi - lo), 0.0, 1.0)
    a = np.maximum(alpha, 1e-3)[..., None]
    fg = np.clip((rgb - (1.0 - a) * bg) / a, 0, 255)
    solid = alpha > 0.98
    fg = np.where(solid[..., None], rgb, fg)
    edge = ~solid
    spill = np.maximum(0, np.minimum(fg[..., 0], fg[..., 2]) - fg[..., 1])
    fg[..., 0] = np.where(edge, fg[..., 0] - spill * 0.8, fg[..., 0])
    fg[..., 2] = np.where(edge, fg[..., 2] - spill * 0.8, fg[..., 2])
    alpha = np.where(alpha < 0.15, 0.0, alpha)
    out = np.dstack([np.clip(fg, 0, 255), alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def trim(img: Image.Image, pad: int = 6) -> Image.Image:
    a = np.asarray(img)[..., 3]
    ys, xs = np.where(a > 20)
    if len(xs) == 0:
        return img
    box = (
        max(xs.min() - pad, 0),
        max(ys.min() - pad, 0),
        min(xs.max() + pad + 1, img.width),
        min(ys.max() + pad + 1, img.height),
    )
    return img.crop(box)


def fit(img: Image.Image, max_side: int) -> Image.Image:
    scale = max_side / max(img.size)
    if scale >= 1:
        return img
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=92, method=6)
    print("wrote", path.relative_to(ROOT), img.size)


def single(name: str, out: str, max_side: int) -> None:
    img = Image.open(SRC / f"{name}.jpg")
    save(fit(trim(key_magenta(img)), max_side), OUT / out)


def slice_sheet(name: str, outdir: str, names: list[str], max_side: int, dilate: int = 14) -> None:
    img = key_magenta(Image.open(SRC / f"{name}.jpg"))
    alpha = np.asarray(img)[..., 3] > 40
    merged = ndimage.binary_dilation(alpha, iterations=dilate)
    labels, count = ndimage.label(merged)
    objs = ndimage.find_objects(labels)
    boxes = []
    for i, sl in enumerate(objs):
        area = (labels[sl] == i + 1).sum()
        if area < 2500:
            continue
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        boxes.append((cy, cx, sl, i + 1))
    if len(boxes) != len(names):
        raise SystemExit(f"{name}: expected {len(names)} blobs, found {len(boxes)}")
    boxes.sort(key=lambda b: b[0])
    cols = len(names) // (2 if len(names) in (6, 8) else 3) if len(names) != 12 else 4
    rows = [boxes[i : i + cols] for i in range(0, len(boxes), cols)]
    ordered = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda b: b[1]))
    arr = np.asarray(img)
    for (cy, cx, sl, lab), nm in zip(ordered, names):
        mask = labels[sl] == lab
        mask = ndimage.binary_dilation(mask, iterations=dilate)
        piece = arr[sl].copy()
        piece[..., 3] = np.where(mask, piece[..., 3], 0)
        tile = Image.fromarray(piece, "RGBA")
        save(fit(trim(tile), max_side), OUT / outdir / f"{nm}.webp")


GEAR_SLOTS = [
    "weapon", "chest", "helmet", "shoulders",
    "belt", "gloves", "bracers", "legs",
    "boots", "amulet", "medal", "ring",
]
SKILLS = ["cleave", "whirlwind", "bladestorm", "war-banner",
          "shield-bash", "iron-skin", "rally", "executioners-guard"]
NAV = ["camp", "skill", "adventure", "town", "crystal", "key"]


def main() -> None:
    for bg in ("bg-deep-cavern", "bg-ember-hollow"):
        img = Image.open(SRC / f"{bg}.jpg").convert("RGB")
        dest = OUT / "bg" / f"{bg}.jpg"
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, "JPEG", quality=88)
        print("wrote", dest.relative_to(ROOT), img.size)

    single("hero-warrior", "sprites/hero-warrior.webp", 360)
    single("hero-sleeping", "sprites/hero-sleeping.webp", 360)
    single("camp-tent-fire", "sprites/camp-tent-fire.webp", 520)
    for e in ("enemy-goat-demon", "enemy-skeleton", "enemy-ember-imp", "enemy-cinder-brute",
              "enemy-horned-overseer", "boss-hollow-king", "boss-deep-warden"):
        single(e, f"sprites/{e}.webp", 380)

    slice_sheet("icons-gear-a", "icons/gear-a", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-b", "icons/gear-b", GEAR_SLOTS, 160)
    slice_sheet("icons-skills-warrior", "icons/skills", SKILLS, 160, dilate=6)
    slice_sheet("icons-nav", "icons/nav", NAV, 160)

    single("ui-gargoyle", "ui/gargoyle.webp", 420)
    single("ui-hooded-statue", "ui/hooded-statue.webp", 420)
    single("ui-battle-button", "ui/battle-button.webp", 320)


if __name__ == "__main__":
    main()
