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


def square_center(img: Image.Image, max_side: int) -> Image.Image:
    """Trim-aware square canvas with alpha-mass centroid at center.

    BBox centering leaves strap-heavy / diagonal art looking shifted in
    object-fit:contain slots; mass centering matches what players see.
    """
    img = trim(img)
    a = np.asarray(img)[..., 3].astype(np.float32)
    h, w = a.shape
    total = float(a.sum())
    if total <= 0:
        side = max(w, h, 1)
        out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        out.paste(img, ((side - w) // 2, (side - h) // 2), img)
        return fit(out, max_side)
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    cx = float((a.sum(axis=0) * xs).sum() / total)
    cy = float((a.sum(axis=1) * ys).sum() / total)
    # Pad so the mass centroid can sit at the square center without clipping.
    left = cx
    right = (w - 1) - cx
    top = cy
    bottom = (h - 1) - cy
    half = max(left, right, top, bottom)
    side = int(np.ceil(half * 2 + 1))
    side = max(side, w, h)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = int(round(side / 2 - cx))
    oy = int(round(side / 2 - cy))
    out.paste(img, (ox, oy), img)
    return fit(out, max_side)


def fit(img: Image.Image, max_side: int) -> Image.Image:
    scale = max_side / max(img.size)
    if scale >= 1:
        return img
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)


def finalize_icon(img: Image.Image, max_side: int) -> Image.Image:
    """Trim → mass-center in square → fit. Keeps inventory/detail icons centered."""
    return square_center(img, max_side)

def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=92, method=6)
    print("wrote", path.relative_to(ROOT), img.size)


def single(name: str, out: str, max_side: int) -> None:
    img = Image.open(SRC / f"{name}.jpg")
    save(finalize_icon(key_magenta(img), max_side), OUT / out)


def save_bg(name: str) -> None:
    img = Image.open(SRC / f"{name}.jpg").convert("RGB")
    dest = OUT / "bg" / f"{name}.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Keep a manageable download size while preserving width for tiling.
    w, h = img.size
    if w > 1600:
        scale = 1600 / w
        img = img.resize((1600, round(h * scale)), Image.LANCZOS)
    img.save(dest, "JPEG", quality=88)
    print("wrote", dest.relative_to(ROOT), img.size)


def _blob_boxes(img: Image.Image, dilate: int, min_area: int = 2500):
    alpha = np.asarray(img)[..., 3] > 40
    merged = ndimage.binary_dilation(alpha, iterations=dilate)
    labels, _count = ndimage.label(merged)
    objs = ndimage.find_objects(labels)
    boxes = []
    for i, sl in enumerate(objs):
        area = (labels[sl] == i + 1).sum()
        if area < min_area:
            continue
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        boxes.append((cy, cx, sl, i + 1))
    return boxes, labels


def _cluster_rows(boxes: list, y_tol_frac: float = 0.12):
    """Group blobs into rows by Y proximity (supports 3-col and 4-col sheets)."""
    boxes = sorted(boxes, key=lambda b: b[0])
    ys = [b[0] for b in boxes]
    span = max(ys) - min(ys) if ys else 1.0
    tol = max(40.0, span * y_tol_frac)
    rows: list[list] = []
    cur: list = []
    for b in boxes:
        if not cur:
            cur = [b]
            continue
        if abs(b[0] - float(np.median([x[0] for x in cur]))) <= tol:
            cur.append(b)
        else:
            rows.append(cur)
            cur = [b]
    if cur:
        rows.append(cur)
    ordered = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda b: b[1]))
    return ordered, [len(r) for r in rows]


def _detect_grid_cols(img: Image.Image, n_names: int) -> int:
    """Pick 3 vs 4 columns by scoring alpha mass vs cell-edge bleed."""
    a = (np.asarray(img)[..., 3] > 40).astype(np.float32)
    ys, xs = np.where(a > 0)
    if len(xs) == 0:
        return 4 if n_names == 12 else (4 if n_names == 8 else 3)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    candidates = []
    if n_names == 12:
        candidates = [3, 4]
    elif n_names == 8:
        candidates = [4]
    elif n_names == 6:
        candidates = [3]
    else:
        candidates = [3, 4]
    best_cols, best_score = candidates[0], -1.0
    for cols in candidates:
        rows = int(np.ceil(n_names / cols))
        cell_w = (x1 - x0) / cols
        cell_h = (y1 - y0) / rows
        score = 0.0
        for i in range(n_names):
            r, c = divmod(i, cols)
            left = int(x0 + c * cell_w)
            right = int(x0 + (c + 1) * cell_w)
            top = int(y0 + r * cell_h)
            bottom = int(y0 + (r + 1) * cell_h)
            cell = a[top:bottom, left:right]
            if cell.size == 0:
                continue
            edge = (
                float(cell[:, 0].sum())
                + float(cell[:, -1].sum())
                + float(cell[0].sum())
                + float(cell[-1].sum())
            )
            score += float(cell.sum()) / (1.0 + edge)
        if score > best_score:
            best_score = score
            best_cols = cols
    return best_cols


def slice_sheet(name: str, outdir: str, names: list[str], max_side: int, dilate: int = 14) -> None:
    """Slice a magenta-keyed icon sheet.

    Gear sheets mix layouts (packs b/c/d are 3×4; most others are 4×3). Fixed
    column counts mis-ordered blobs and the old 4-col grid fallback bisected
    icons (right-half + neighbor sliver). We search dilate values for an exact
    blob count, cluster rows by Y proximity, and square-pad each tile.
    """
    img = key_magenta(Image.open(SRC / f"{name}.jpg"))
    dilates = [dilate] + [d for d in (14, 12, 10, 8, 6, 4, 3, 2) if d != dilate]
    chosen = None
    for d in dilates:
        boxes, labels = _blob_boxes(img, d)
        if len(boxes) != len(names):
            continue
        ordered, row_lens = _cluster_rows(boxes)
        if sum(row_lens) != len(names):
            continue
        chosen = (d, boxes, labels, ordered, row_lens)
        break
    if chosen is None:
        print(f"warn {name}: no dilate yielded {len(names)} blobs — using grid crop")
        grid_crop(img, outdir, names, max_side)
        return
    d, _boxes, labels, ordered, row_lens = chosen
    print(f"slice {name}: dilate={d} rows={row_lens}")
    arr = np.asarray(img)
    for (_cy, _cx, sl, lab), nm in zip(ordered, names):
        mask = labels[sl] == lab
        mask = ndimage.binary_dilation(mask, iterations=d)
        piece = arr[sl].copy()
        piece[..., 3] = np.where(mask, piece[..., 3], 0)
        tile = Image.fromarray(piece, "RGBA")
        save(finalize_icon(tile, max_side), OUT / outdir / f"{nm}.webp")


def grid_crop(img: Image.Image, outdir: str, names: list[str], max_side: int) -> None:
    """Fallback: evenly divide the content bbox into a detected 3- or 4-col grid."""
    cols = _detect_grid_cols(img, len(names))
    rows = int(np.ceil(len(names) / cols))
    print(f"grid_crop {outdir}: cols={cols} rows={rows}")
    a = np.asarray(img)[..., 3]
    ys, xs = np.where(a > 20)
    if len(xs) == 0:
        raise SystemExit(f"empty sheet for {outdir}")
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    cell_w = (x1 - x0) / cols
    cell_h = (y1 - y0) / rows
    for i, nm in enumerate(names):
        r, c = divmod(i, cols)
        left = int(x0 + c * cell_w)
        top = int(y0 + r * cell_h)
        right = int(x0 + (c + 1) * cell_w)
        bottom = int(y0 + (r + 1) * cell_h)
        tile = img.crop((left, top, right, bottom))
        save(finalize_icon(tile, max_side), OUT / outdir / f"{nm}.webp")


GEAR_SLOTS = [
    "weapon", "chest", "helmet", "shoulders",
    "belt", "gloves", "bracers", "legs",
    "boots", "amulet", "medal", "ring",
]
# Sheet layouts stay 8-up; dual passives bulwark/frostbite/deadeye/shadow-veil
# ship as tinted derivatives of related icons (see public/assets/icons/skills/).
SKILLS_WARRIOR = ["cleave", "whirlwind", "bladestorm", "war-banner",
                  "shield-bash", "iron-skin", "rally", "executioners-guard"]
SKILLS_MAGE = ["firebolt", "flame-wave", "meteor", "combustion",
               "ice-lance", "frost-nova", "glacial-armor", "absolute-zero"]
SKILLS_RANGER = ["piercing-shot", "arrow-rain", "multishot", "storm-of-quills",
                 "aimed-shot", "hunters-mark", "explosive-trap", "kill-shot"]
SKILLS_ROGUE = ["backstab", "garrote", "ambush", "death-mark",
                "shadowstep", "smoke-bomb", "flurry", "cloak-of-shadows"]
NAV = ["camp", "skill", "adventure", "town", "crystal", "key"]


def main() -> None:
    for bg in (
        "bg-deep-cavern",
        "bg-ember-hollow",
        "bg-bone-gallery",
        "bg-frostvein",
        "bg-witchmire",
        "bg-cinderreach",
        "bg-ashen-spire",
        "bg-echoing-dark",
        "bg-voidgate",
        "bg-nightscar-depths",
        "bg-clan-arena",
    ):
        save_bg(bg)

    for hero in ("warrior", "mage", "ranger", "rogue"):
        single(f"hero-{hero}", f"sprites/hero-{hero}.webp", 360)
    single("hero-sleeping", "sprites/hero-sleeping.webp", 360)
    single("camp-tent-fire", "sprites/camp-tent-fire.webp", 520)

    enemies = [
        "enemy-goat-demon", "enemy-skeleton", "enemy-ember-imp", "enemy-cinder-brute",
        "enemy-horned-overseer", "boss-hollow-king", "boss-deep-warden",
        "enemy-bone-soldier", "enemy-bone-archer", "enemy-ossuary-captain", "boss-ossuary-lord",
        "enemy-frost-wisp", "enemy-ice-hound", "enemy-rime-brute", "boss-rime-queen",
        "enemy-spore-tick", "enemy-mire-slug", "enemy-witchmire-hag", "boss-bog-hydra",
        "enemy-magma-scarab", "enemy-ash-walker", "enemy-cinder-knight", "boss-forge-colossus",
        "enemy-ash-bat", "enemy-slag-imp", "enemy-magma-knight", "boss-spire-tyrant",
        "enemy-echo-wisp", "enemy-crystal-mite", "enemy-crystal-golem", "boss-resonance-queen",
        "enemy-void-larva", "enemy-rift-shade", "enemy-gate-warden", "boss-void-herald",
        "enemy-nightscar-shade", "enemy-abyss-crawler", "enemy-nightscar-champion", "boss-daggah-hungering",
    ]
    for e in enemies:
        single(e, f"sprites/{e}.webp", 380)

    slice_sheet("icons-gear-a", "icons/gear-a", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-b", "icons/gear-b", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-c", "icons/gear-c", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-d", "icons/gear-d", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-e", "icons/gear-e", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-f", "icons/gear-f", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-g", "icons/gear-g", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-h", "icons/gear-h", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-i", "icons/gear-i", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-j", "icons/gear-j", GEAR_SLOTS, 160)
    slice_sheet("icons-gear-k", "icons/gear-k", GEAR_SLOTS, 160)
    # Dedicated pauldron art (packs b/c/d sheet cells were helmet-like / chest-like).
    for pack in ("b", "c", "d"):
        src = SRC / f"shoulders-pack-{pack}.jpg"
        if src.exists():
            single(f"shoulders-pack-{pack}", f"icons/gear-{pack}/shoulders.webp", 160)
    slice_sheet("icons-skills-warrior", "icons/skills", SKILLS_WARRIOR, 160, dilate=6)
    slice_sheet("icons-skills-mage", "icons/skills", SKILLS_MAGE, 160, dilate=6)
    slice_sheet("icons-skills-ranger", "icons/skills", SKILLS_RANGER, 160, dilate=6)
    slice_sheet("icons-skills-rogue", "icons/skills", SKILLS_ROGUE, 160, dilate=6)
    slice_sheet("icons-nav", "icons/nav", NAV, 160)

    single("ui-gargoyle", "ui/gargoyle.webp", 420)
    single("ui-hooded-statue", "ui/hooded-statue.webp", 420)
    single("ui-battle-button", "ui/battle-button.webp", 320)
    single("ui-clan-token", "ui/clan-token.webp", 220)
    single("ui-clan-hall", "ui/clan-hall.webp", 220)
    single("ui-season-board", "ui/season-board.webp", 220)

    # Seamless UI textures (no chroma key) — public + Vite CSS import path
    for tex in ("tex-parchment.jpg", "tex-stone.jpg"):
        src = SRC / tex
        for dest in (OUT / "ui" / tex, ROOT / "src" / "assets" / "ui" / tex):
            dest.parent.mkdir(parents=True, exist_ok=True)
            Image.open(src).convert("RGB").save(dest, "JPEG", quality=90)
            print("wrote", dest.relative_to(ROOT))


if __name__ == "__main__":
    main()
