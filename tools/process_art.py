#!/usr/bin/env python3
"""
SEVERDREAD art pipeline.

Turns the raw uploaded sprite sheets in art/raw/ into clean, game-ready
atlases in assets/, and writes assets/manifest.json which the game reads at
startup.  Everything is driven by tools/art_config.json, so adding a new
upload is:

    1. drop the image into art/raw/<category>/
    2. add an entry to tools/art_config.json (copy a similar one)
    3. python3 tools/process_art.py            (or: npm run art)
    4. add/adjust the gameplay entry in src/data/*.js (stats, behaviour)

Requires: pip install pillow numpy scipy

Sheet types
-----------
monster       8 directions (rows) x 8 actions (cols): idle, walk1-4, windup,
              attack, recover.  Several monsters can share one image; each gets
              its own "region".  Output: one atlas per monster, uniform frames,
              all frames share a common foot baseline + center anchor.
weapon_set    one weapon per row; columns 1-7 are the first-person frames
              (idle + 6 fire frames), column 8 is the dropped/inventory icon.
sprite_grid   a grid of single sprites (projectiles, pickups, icons...).
texture_grid  a grid of wall/floor tiles, resampled to N x N.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "tools", "art_config.json")
MANIFEST = os.path.join(ROOT, "assets", "manifest.json")

DIRECTIONS = ["front", "front_left", "left", "rear_left",
              "back", "rear_right", "right", "front_right"]
ACTIONS = ["idle", "walk1", "walk2", "walk3", "walk4",
           "windup", "attack", "recover"]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def load_rgba(path):
    return np.array(Image.open(os.path.join(ROOT, path)).convert("RGBA"))


def save_texture_atlas(img, out):
    """Wall/floor atlases: high-quality WebP (5x smaller than PNG; supported
    by Safari 14+ and every current browser)."""
    if out.endswith(".webp"):
        img.save(out, "WEBP", quality=90, method=6)
    else:
        img.save(out, optimize=True)


def save_png(arr, path, quantize=True):
    """Sprites are stored as 256-colour palette PNGs (like DOOM's own
    palette): visually identical for pixel art and ~4-5x smaller to download."""
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    im = Image.fromarray(arr.astype(np.uint8), "RGBA")
    if quantize:
        im = im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(full, optimize=True)


def clean_alpha(arr, threshold):
    """Kill the faint compression haze around sprites."""
    out = arr.copy()
    a = out[..., 3]
    a[a < threshold] = 0
    out[a == 0] = 0
    return out


def resize_rgba(arr, size):
    """Premultiplied resize so edges don't pick up dark/white fringes."""
    im = Image.fromarray(arr.astype(np.uint8), "RGBA").convert("RGBa")
    im = im.resize(size, Image.LANCZOS).convert("RGBA")
    return np.array(im)


def cluster_1d(values, weights, k):
    """Split sorted 1-D positions into k groups using the k-1 widest gaps."""
    order = np.argsort(values)
    v = np.asarray(values)[order]
    if len(v) < k:
        raise ValueError("not enough sprites (%d) to form %d groups" % (len(v), k))
    gaps = np.diff(v)
    cut = np.sort(np.argsort(gaps)[::-1][: k - 1])
    groups = np.split(np.arange(len(v)), cut + 1)
    centers = []
    for g in groups:
        idx = order[g]
        w = np.asarray(weights)[idx]
        centers.append(float(np.sum(np.asarray(values)[idx] * w) / np.sum(w)))
    return centers


def components(arr, region, alpha_threshold):
    x0, y0, x1, y1 = region
    sub = arr[y0:y1, x0:x1]
    mask = sub[..., 3] >= alpha_threshold
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    comps = []
    if n == 0:
        return comps, lab
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    coms = ndimage.center_of_mass(mask, lab, range(1, n + 1))
    for i, sl in enumerate(objs):
        comps.append({
            "label": i + 1,
            "x0": sl[1].start + x0, "x1": sl[1].stop + x0,
            "y0": sl[0].start + y0, "y1": sl[0].stop + y0,
            "cx": coms[i][1] + x0, "cy": coms[i][0] + y0,
            "area": float(sizes[i]),
        })
    return comps, lab


def key_background(arr, mode="auto", tol=40):
    """Make a solid (usually white) background transparent.
    Flood-fills from the image border and from every near-background pixel
    region that is large (boxed grid cells), so white highlights inside a
    sprite survive. mode: 'auto' (only if the image has no real alpha),
    'white', 'black', or 'none'."""
    if mode == "none":
        return arr
    a = arr[..., 3]
    if mode == "auto":
        if (a < 250).mean() > 0.02:   # already has transparency
            return arr
        corners = np.concatenate([arr[:4, :4, :3].reshape(-1, 3), arr[-4:, -4:, :3].reshape(-1, 3),
                                  arr[:4, -4:, :3].reshape(-1, 3), arr[-4:, :4, :3].reshape(-1, 3)])
        bg = np.median(corners, 0)
    else:
        bg = np.array([255, 255, 255] if mode == "white" else [0, 0, 0], float)
    rgb = arr[..., :3].astype(float)
    near = np.abs(rgb - bg).max(-1) < tol
    lab, n = ndimage.label(near)
    if n == 0:
        return arr
    sizes = ndimage.sum(near, lab, range(1, n + 1))
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    big = set((np.where(sizes > arr.shape[0] * arr.shape[1] * 0.004)[0] + 1).tolist())
    kill = np.isin(lab, list(border | big))
    # soften the edge: pixels next to removed background that are close-ish to bg
    edge = ndimage.binary_dilation(kill, iterations=1) & ~kill & (np.abs(rgb - bg).max(-1) < tol * 2.2)
    out = arr.copy()
    out[kill] = 0
    out[edge, 3] = (out[edge, 3] * 0.45).astype(np.uint8)
    return out


def remove_decorations(arr, alpha_threshold=40):
    """Remove grid lines and filled label boxes (long thin or very rectangular
    solid components) that some sheets draw around their frames."""
    mask = arr[..., 3] >= alpha_threshold
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return arr
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    H, W = mask.shape
    out = arr.copy()
    for i, sl in enumerate(objs):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        fill = sizes[i] / float(w * h)
        gridlike = (w > W * 0.45 or h > H * 0.45) and fill < 0.12      # grid line lattice
        boxlike = fill > 0.88 and (w / max(h, 1) > 2.2 or h / max(w, 1) > 2.2) and sizes[i] > 150
        if gridlike or boxlike:
            out[lab == i + 1] = 0
    return out


def big_component_mask(alpha, thr=180, min_frac=0.0012):
    """Strict mask keeping only components larger than min_frac of the image
    (drops letters / small label text)."""
    mask = alpha >= thr
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = np.where(sizes >= mask.size * min_frac)[0] + 1
    return np.isin(lab, keep)


def find_split(alpha, axis, lo=0.35, hi=0.65):
    """Position of the widest empty band (between two monsters on one sheet)."""
    m = big_component_mask(alpha)
    prof = m.sum(1 if axis == 0 else 0)
    n = len(prof)
    a, b = int(n * lo), int(n * hi)
    thr = max(1, prof[a:b].max() * 0.02)
    best, run, start, bs = 0, 0, a, a
    for i in range(a, b):
        if prof[i] <= thr:
            if run == 0:
                start = i
            run += 1
            if run > best:
                best, bs = run, start
        else:
            run = 0
    return bs + best // 2 if best else n // 2


def clean_monster_sheet(arr, rows_est):
    """Remove table fills, grid lines, label boxes and caption text."""
    out = arr.copy()
    a = out[..., 3]
    semi = ((a > 20) & (a < 200)).mean()
    if semi > 0.2:                       # translucent table cells
        out[a < 200] = 0
    # erase long straight runs (table / grid lines) so label boxes separate
    a = out[..., 3]
    H_, W_ = a.shape
    solid = a >= 120
    for axis, L in ((1, W_ * 0.22), (0, H_ * 0.22)):
        m = solid if axis == 1 else solid.T
        kill = np.zeros_like(m)
        for r in range(m.shape[0]):
            row = m[r]
            if row.sum() < L:
                continue
            d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
            starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
            for s0, e0 in zip(starts, ends):
                if e0 - s0 >= L:
                    kill[max(0, r - 1):r + 2, s0:e0] = True
        if axis == 0:
            kill = kill.T
        out[kill] = 0
    a = out[..., 3]
    rgb = out[..., :3].astype(float)
    lum = rgb.mean(-1)
    sat = (rgb.max(-1) - rgb.min(-1)) / np.maximum(rgb.max(-1), 1)
    mask = a >= 120
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return out
    H, W = mask.shape
    rs = H / max(1.0, rows_est + 0.6)
    objs = ndimage.find_objects(lab)
    for i, sl in enumerate(objs):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        comp = lab[sl] == i + 1
        area = comp.sum()
        fill = area / float(w * h)
        cl = lum[sl][comp]
        cs = sat[sl][comp]
        ink = ((cl < 60) | ((cl > 175) & (cs < 0.35))).mean()
        light = ((cl > 165) & (cs < 0.45)).mean()
        kill = False
        if (w > W * 0.3 and h < 8) or (h > H * 0.3 and w < 8):
            kill = True                                   # grid line
        elif (w > W * 0.45 or h > H * 0.45) and fill < 0.15:
            kill = True                                   # lattice
        elif ((fill > 0.72 and ink > 0.8) or (fill > 0.9 and ink > 0.6)) and h < rs * 0.6:
            kill = True                                   # dark label box
        elif h < rs * 0.3 and ink > 0.72 and light > 0.12 and area < rs * rs * 0.3:
            kill = True                                   # caption text (light glyphs + dark outline)
        elif sl[0].stop < H * 0.11 and h < rs * 0.8:
            kill = True                                   # sheet title / header row along the top
        elif fill > 0.9 and w > h * 1.6 and h < rs * 0.45:
            kill = True                                   # any solid caption box
        if kill:
            out[sl][comp] = 0
    return out


def mirror_row(atlas, src_row, dst_row, fh, fw, cols):
    for c in range(cols):
        fr = atlas[src_row * fh:(src_row + 1) * fh, c * fw:(c + 1) * fw]
        atlas[dst_row * fh:(dst_row + 1) * fh, c * fw:(c + 1) * fw] = fr[:, ::-1]


def count_rows(alpha, expect=8):
    """7 or 8 sprite rows? (some sheets lost their last direction row)"""
    m = big_component_mask(alpha, min_frac=0.0008)
    prof = m.sum(1) > 0
    bands, on = 0, False
    for v in prof:
        if v and not on:
            bands += 1
        on = v
    return bands if bands in (7, 8) else expect


def geodesic_split(mask, near_cell, core):
    """Split one connected blob that spans several grid cells: grow each cell's
    region outward from its core pixels, staying inside the blob, so a thin
    bridge between two touching frames is cut where they meet."""
    lab = np.where(mask & core, near_cell + 1, 0).astype(np.int32)
    if lab.max() == 0:
        return near_cell[mask]
    for _ in range(max(mask.shape)):
        grown = ndimage.grey_dilation(lab, size=(3, 3))
        new = (lab == 0) & mask & (grown > 0)
        if not new.any():
            break
        lab[new] = grown[new]
    out = lab - 1
    left = mask & (out < 0)
    out[left] = near_cell[left]
    return out[mask]


def fit_regular(values, weights, k, lo=None, hi=None):
    """Fit k evenly spaced grid lines to sprite centres (area-weighted), so
    label columns or a merged pair of columns can't skew the grid."""
    v = np.asarray(values, float)
    wt = np.asarray(weights, float)
    lo = v.min() if lo is None else lo
    hi = v.max() if hi is None else hi
    span = max(1.0, hi - lo)
    best, best_s = None, -1
    pitches = np.arange(span / (k + 0.5), span / max(k - 1.6, 0.6) + 0.5, 0.5)
    for p in pitches:
        offs = np.arange(lo - p * 0.5, hi - (k - 1) * p + p * 0.5 + 1, 1.0)
        if not len(offs):
            continue
        rel = (v[None, :] - offs[:, None]) / p              # (O, N)
        idx = np.clip(np.round(rel), 0, k - 1)
        d = np.abs(rel - idx)
        inside = (rel > -0.5) & (rel < k - 0.5)
        score = (wt[None, :] * np.exp(-(d / 0.18) ** 2) * inside).sum(1)
        j = int(np.argmax(score))
        if score[j] > best_s:
            best_s, best = score[j], (offs[j], p)
    o, p = best
    return [float(o + i * p) for i in range(k)]


def grid_assign(arr, region, rows, cols, alpha_threshold, strict_threshold=180,
                min_big=0.15, col_centers=None, row_centers=None):
    """Find every sprite in `region` and sort its pixels into a rows x cols grid.

    Sprites are located from their solid cores (alpha >= strict_threshold) so
    the faint haze that often joins neighbouring frames doesn't merge them.
    Every visible pixel (alpha >= alpha_threshold) is then given to the cell of
    the nearest solid core pixel.

    Returns (cells, col_centers, row_centers, cell_index_image) where
    cells[r][c] is a bbox (x0, y0, x1, y1) in sheet coordinates or None.
    """
    comps, lab = components(arr, region, strict_threshold)
    if not comps:
        raise ValueError("no sprites found in region %s" % (region,))
    areas = np.array([c["area"] for c in comps])
    ref = np.median(np.sort(areas)[::-1][: rows * cols])
    big = [c for c in comps if c["area"] >= ref * min_big]
    if col_centers is None:
        col_centers = fit_regular([c["cx"] for c in big], [c["area"] for c in big], cols)
    if row_centers is None:
        row_centers = fit_regular([c["cy"] for c in big], [c["area"] for c in big], rows)
    x0, y0, x1, y1 = region
    # Small components lying in the margins between/around frames are labels
    # (direction names, action headers, titles) - ignore them.
    cs_ = np.diff(col_centers).mean() if len(col_centers) > 1 else (x1 - x0)
    rs_ = np.diff(row_centers).mean() if len(row_centers) > 1 else (y1 - y0)
    keep_comps = []
    for c in comps:
        if c["area"] < ref * min_big:
            dxc = min(abs(c["cx"] - x) for x in col_centers)
            dyc = min(abs(c["cy"] - y) for y in row_centers)
            outside = (c["cx"] < col_centers[0] - cs_ * 0.5 or c["cx"] > col_centers[-1] + cs_ * 0.5 or
                       c["cy"] < row_centers[0] - rs_ * 0.5 or c["cy"] > row_centers[-1] + rs_ * 0.5)
            if outside or dxc > cs_ * 0.47 or dyc > rs_ * 0.44:
                lab[lab == c["label"]] = 0
                continue
        keep_comps.append(c)
    comps = keep_comps
    # Per-pixel nearest grid cell; a strict component goes wholly to the cell
    # that owns most of it, unless it straddles cells (touching frames), in
    # which case it is split pixel by pixel.
    xs_ = np.arange(x0, x1)[None, :]
    ys_ = np.arange(y0, y1)[:, None]
    col_of = np.argmin(np.abs(xs_[..., None] - np.array(col_centers)[None, None, :]), -1)
    row_of = np.argmin(np.abs(ys_[..., None] - np.array(row_centers)[None, None, :]), -1)
    near_cell = (row_of * cols + col_of).astype(np.int32)
    # "core" = pixels near the middle of their grid cell; used as seeds when
    # two touching frames have to be separated.
    cs = np.diff(col_centers).mean() if len(col_centers) > 1 else (x1 - x0)
    rs = np.diff(row_centers).mean() if len(row_centers) > 1 else (y1 - y0)
    dx = np.abs(xs_ - np.array(col_centers)[col_of])
    dy = np.abs(ys_ - np.array(row_centers)[row_of])
    core = (dx < cs * 0.3) & (dy < rs * 0.3)
    strict_cells = np.full(lab.shape, -1, np.int32)
    for c in comps:
        sl = (slice(c["y0"] - y0, c["y1"] - y0), slice(c["x0"] - x0, c["x1"] - x0))
        m = lab[sl] == c["label"]
        cell_ids = near_cell[sl][m]
        counts = np.bincount(cell_ids, minlength=rows * cols)
        if counts.max() >= 0.9 * counts.sum():
            strict_cells[sl][m] = int(np.argmax(counts))
        else:
            strict_cells[sl][m] = geodesic_split(m, near_cell[sl], core[sl])
    loose = arr[y0:y1, x0:x1, 3] >= alpha_threshold
    # nearest strict pixel for every pixel (only within a few px of a kept
    # solid core, so dropped labels don't come back through their haze)
    dist_, (iy, ix) = ndimage.distance_transform_edt(strict_cells < 0, return_indices=True)
    cell_img = strict_cells[iy, ix]
    cell_img[~loose | (dist_ > 6)] = -1
    cells = [[None] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            ys, xs = np.where(cell_img == r * cols + c)
            if len(ys):
                cells[r][c] = (int(xs.min()) + x0, int(ys.min()) + y0,
                               int(xs.max()) + 1 + x0, int(ys.max()) + 1 + y0, r * cols + c)
    return cells, col_centers, row_centers, cell_img


def cell_image(arr, cell_img, region, cell):
    """Extract one grid cell's pixels (sheet coordinates)."""
    x0, y0, x1, y1, idx = cell
    rx, ry = region[0], region[1]
    keep = cell_img[y0 - ry:y1 - ry, x0 - rx:x1 - rx] == idx
    img = arr[y0:y1, x0:x1].copy()
    img[~keep] = 0
    return img, (x0, y0, x1, y1)


def solid_bottom(img, min_px=3):
    """Lowest row that has at least min_px opaque pixels (ignores sparkles)."""
    counts = (img[..., 3] >= 128).sum(1)
    rows = np.where(counts >= min_px)[0]
    return int(rows[-1]) + 1 if len(rows) else img.shape[0]


def register_x(ref_mask, mask, max_shift):
    """Horizontal shift that best overlaps `mask` onto `ref_mask` (column
    profiles, lower body weighted) - keeps walk cycles from wobbling."""
    def profile(m):
        h = m.shape[0]
        w = np.linspace(0.3, 1.0, h)[:, None]   # feet/legs matter more
        return (m * w).sum(0)
    p_ref, p = profile(ref_mask), profile(mask)
    best, best_s = 0, -1
    for s in range(-max_shift, max_shift + 1):
        a = np.roll(p, s)
        if s > 0:
            a[:s] = 0
        elif s < 0:
            a[s:] = 0
        score = float(np.dot(a, p_ref))
        if score > best_s:
            best, best_s = s, score
    return best


# --------------------------------------------------------------------------
# sheet processors
# --------------------------------------------------------------------------
def strip_frame_junk(img, box, top_row=False):
    """Drop leftover label boxes / caption text / sheet titles inside one
    extracted frame, keeping the sprite and detached effects (muzzle flashes,
    projectiles), which are bright and saturated."""
    a = img[..., 3]
    mask = a >= 110
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return None, box
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    rgb = img[..., :3].astype(float)
    lum = rgb.mean(-1)
    sat = (rgb.max(-1) - rgb.min(-1)) / np.maximum(rgb.max(-1), 1)
    drop = set()
    for i, sl in enumerate(objs):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if sizes[i] / float(w * h) > 0.86 and w * h > 60:
            drop.add(i)                       # solid rectangle = label box
    keep_ids = [i for i in range(n) if i not in drop]
    if not keep_ids:
        return None, box
    main = max(keep_ids, key=lambda i: sizes[i])
    msl = objs[main]
    for i in keep_ids:
        if i == main or sizes[i] > sizes[main] * 0.3:
            continue
        sl = objs[i]
        comp = lab[sl] == i + 1
        cs = sat[sl][comp].mean()
        cl = lum[sl][comp]
        gap_y = msl[0].start - sl[0].stop
        gap_x = max(msl[1].start - sl[1].stop, sl[1].start - msl[1].stop)
        detached = gap_y > 2 or gap_x > 2 or sl[0].start > msl[0].stop + 2
        if top_row and sl[0].stop <= msl[0].start - 2:
            drop.add(i)                       # sheet title above the first row
        elif detached and cs < 0.28 and ((cl < 70) | (cl > 170)).mean() > 0.6:
            drop.add(i)                       # monochrome caption text
    out = img.copy()
    for i in drop:
        out[lab == i + 1] = 0
    ys, xs = np.where(out[..., 3] > 0)
    if not len(ys):
        return None, box
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return out[y0:y1, x0:x1], (box[0] + x0, box[1] + y0, box[0] + x1, box[1] + y1)


def process_monster(sheet):
    arr = load_rgba(sheet["src"])
    arr = key_background(arr, sheet.get("background", "auto"))
    thr = sheet.get("alphaThreshold", 40)
    H0, W0 = arr.shape[:2]
    region = sheet.get("region") or [0, 0, W0, H0]
    if sheet.get("half") is not None:      # two monsters side by side
        mid = sheet.get("split") or find_split(arr[..., 3], axis=1, lo=0.46, hi=0.54)
        region = [0, region[1], mid, region[3]] if sheet["half"] == 0 else [mid, region[1], W0, region[3]]
    if sheet.get("vhalf") is not None:     # two monsters stacked vertically
        mid = sheet.get("split") or find_split(arr[..., 3], axis=0)
        region = [region[0], 0, region[2], mid] if sheet["vhalf"] == 0 else [region[0], mid, region[2], H0]
    x0r, y0r, x1r, y1r = region
    sub = clean_monster_sheet(arr[y0r:y1r, x0r:x1r], 8)
    arr = arr.copy()
    arr[y0r:y1r, x0r:x1r] = sub
    nrows = sheet.get("rows") or 8
    rows_are = sheet.get("rowsAre", DIRECTIONS[:nrows])
    cols_are = sheet.get("colsAre", ACTIONS)
    cells, col_c, row_c, lab = grid_assign(
        arr, region, len(rows_are), len(cols_are), thr,
        col_centers=sheet.get("colCenters"), row_centers=sheet.get("rowCenters"))
    arr = clean_alpha(arr, thr)

    # Extract every frame, find its foot line and horizontal anchor.
    frames = {}
    for r, d in enumerate(rows_are):
        for c, act in enumerate(cols_are):
            comps = cells[r][c]
            if not comps:
                print("  warning: %s %s/%s is empty" % (sheet["id"], d, act))
                continue
            img, box = cell_image(arr, lab, region, comps)
            img, box = strip_frame_junk(img, box, top_row=(r == 0))
            if img is None:
                continue
            frames[(d, act)] = {"img": img, "box": box}

    # Per-direction baseline = median foot line of that row; anchor x from
    # idle frame centre, other frames registered against idle.
    anchors = {}
    for d in rows_are:
        row = [frames[(d, a)] for a in cols_are if (d, a) in frames]
        feet = [f["box"][1] + solid_bottom(f["img"]) for f in row]
        base = float(np.median(feet))
        idle = frames.get((d, cols_are[0]), row[0])
        ib = idle["box"]
        ref_mask = (idle["img"][..., 3] >= 128).astype(float)
        for a in cols_are:
            f = frames.get((d, a))
            if f is None:
                continue
            fb = f["box"]
            f_center = (fb[0] + fb[2]) / 2.0
            if a == cols_are[0] or not sheet.get("register", True):
                cx = f_center
            else:
                # Overlay frame and idle centred on their boxes, bottoms on
                # their foot lines, and find the x shift that best matches
                # the legs/feet (arms move a lot, legs barely).
                fm = (f["img"][..., 3] >= 128).astype(float)
                fh_, fw_ = fm.shape
                ih_, iw_ = ref_mask.shape
                W = max(fw_, iw_) + 8
                H = int(max(base - min(fb[1], ib[1]), 1)) + 2
                def place(mask, box):
                    out = np.zeros((H, W))
                    h, w = mask.shape
                    ox = (W - w) // 2
                    oy = int(round(H - (base - box[1]))) - 1
                    ys0, ys1 = max(oy, 0), min(oy + h, H)
                    if ys1 > ys0:
                        out[ys0:ys1, ox:ox + w] = mask[ys0 - oy:ys1 - oy]
                    return out
                m_ref, m = place(ref_mask, ib), place(fm, fb)
                cut = int(H * 0.55)
                s = register_x(m_ref[cut:], m[cut:], max(4, int(W * 0.2)))
                cx = f_center - s
            anchors[(d, a)] = (cx, base)

    # Common window around anchor (outliers clipped so one stray pixel can't
    # shrink every frame).
    ext = []
    for k, f in frames.items():
        cx, base = anchors[k]
        x0, y0, x1, y1 = f["box"]
        ext.append((cx - x0, x1 - cx, base - y0, y1 - base))
    ext = np.array(ext)
    med = np.median(ext, 0)
    lim = np.maximum(med * 1.7, med + 12)
    ext = np.minimum(ext, lim)
    left, right, up, down = [max(1.0, float(v)) for v in ext.max(0)]
    half = int(np.ceil(max(left, right)))
    fw = half * 2
    up_i, down_i = int(np.ceil(up)), int(np.ceil(down))
    fh = up_i + down_i
    scale = sheet.get("scale", 1.0)

    atlas = np.zeros((fh * len(rows_are), fw * len(cols_are), 4), np.uint8)
    for r, d in enumerate(rows_are):
        for c, a in enumerate(cols_are):
            f = frames.get((d, a))
            if f is None:
                continue
            cx, base = anchors[(d, a)]
            x0, y0, x1, y1 = f["box"]
            px = int(round(x0 - cx + half)) + c * fw
            py = int(round(y0 - base + up_i)) + r * fh
            h, w = f["img"].shape[:2]
            dst = atlas[py:py + h, px:px + w]
            src = f["img"][:dst.shape[0], :dst.shape[1]]
            m = src[..., 3:4] > 0
            dst[:] = np.where(m, src, dst)
    apply_erase(atlas, fw, fh, sheet.get("erase", []))
    # fill frames the sheet didn't provide (or the slicer lost): mirrored
    # direction first, otherwise this direction's idle frame
    MIRROR = {"left": "right", "right": "left", "front_left": "front_right", "front_right": "front_left",
              "rear_left": "rear_right", "rear_right": "rear_left"}
    def frame_empty(r, c):
        return atlas[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw, 3].max() == 0
    for r, d in enumerate(rows_are):
        for c in range(len(cols_are)):
            if not frame_empty(r, c):
                continue
            m = MIRROR.get(d)
            if m in rows_are and not frame_empty(rows_are.index(m), c):
                mr = rows_are.index(m)
                atlas[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = atlas[mr * fh:(mr + 1) * fh, c * fw:(c + 1) * fw][:, ::-1]
            elif not frame_empty(r, 0):
                atlas[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = atlas[r * fh:(r + 1) * fh, 0:fw]
    if len(rows_are) == 7:
        # synthesize the missing front_right row by mirroring front_left
        full = np.zeros((fh * 8, atlas.shape[1], 4), np.uint8)
        full[:fh * 7] = atlas
        mirror_row(full, 1, 7, fh, fw, len(cols_are))
        atlas = full
        rows_are = DIRECTIONS
    if scale != 1.0:
        atlas = resize_rgba(atlas, (int(round(atlas.shape[1] * scale)), int(round(atlas.shape[0] * scale))))
        fw = int(round(fw * scale)); fh = int(round(fh * scale)); up_i = int(round(up_i * scale))
    out = sheet["out"]
    save_png(atlas, out)
    print("  %s: %dx%d frames -> %s" % (sheet["id"], fw, fh, out))
    return {
        "id": sheet["id"],
        "name": sheet.get("name", sheet["id"]),
        "file": out,
        "frameW": fw, "frameH": fh, "footY": up_i,
        "directions": rows_are, "actions": cols_are,
        "kind": sheet.get("kind", "monster"),
        "source": sheet["src"],
    }


def apply_erase(atlas, fw, fh, erase):
    """Manual clean-up: config "erase": [{"row": r, "col": c, "rect": [x0, y0, x1, y1]}]
    with the rect in output-frame pixels.  For the odd stray pixel blob the
    automatic slicer can't attribute correctly."""
    for e in erase:
        x0, y0, x1, y1 = e["rect"]
        ox, oy = e["col"] * fw, e["row"] * fh
        atlas[oy + y0:oy + y1, ox + x0:ox + x1] = 0


def drop_bottom_slivers(img, box, row_bottom_guess=None):
    """First-person frames are cut off at the bottom edge; a neighbouring
    frame's hand sometimes leaks in as a small blob touching that edge.  Drop
    small, detached blobs that touch the bottom (shell casings never do)."""
    mask = img[..., 3] >= 150
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n < 2:
        return img
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    main = sizes.max()
    out = img.copy()
    h = img.shape[0]
    for i, sz in enumerate(sizes):
        if sz >= main:
            continue
        blob = lab == i + 1
        ys, xs = np.where(blob)
        if sz < 0.06 * main and ys.max() >= h - 4:
            out[ndimage.binary_dilation(blob, iterations=3) & (img[..., 3] < 150) | blob] = 0
    return out


def process_weapon_set(sheet):
    arr = load_rgba(sheet["src"])
    thr = sheet.get("alphaThreshold", 40)
    region = sheet.get("region") or [0, 0, arr.shape[1], arr.shape[0]]
    if not sheet.get("weapons"):
        # auto: count rows from the sheet itself
        a0 = arr[..., 3] >= 180
        prof = a0.sum(1)
        on = prof > a0.shape[1] * 0.02
        nb = int(np.sum(on[1:] & ~on[:-1]) + (1 if on[0] else 0))
        sheet["weapons"] = [{"id": "%s_%d" % (sheet["id"], i), "name": "%s %d" % (sheet.get("baseName", "Weapon"), i + 1)}
                            for i in range(max(1, nb))]
    nrows = len(sheet["weapons"])
    ncols = sheet.get("cols", 8)
    fp_cols = sheet.get("fpFrames", 7)
    cells, col_c, row_c, lab = grid_assign(arr, region, nrows, ncols, thr,
                                           col_centers=sheet.get("colCenters"),
                                           row_centers=sheet.get("rowCenters"))
    # Frames that touch each other merge into one blob and the column fit
    # collapses. Detect that (frames far wider than the sheet allows) and
    # rebuild the columns: icon column found by the widest gap on the right,
    # the rest split evenly into the first-person frames.
    widths = [c[2] - c[0] for row in cells for c in row[:fp_cols] if c]
    W = region[2] - region[0]
    if not sheet.get("colCenters") and widths and (np.median(widths) > 1.45 * W / ncols or max(widths) > 2.2 * np.median(widths)):
        a0 = arr[region[1]:region[3], region[0]:region[2], 3] >= 150
        prof = a0.sum(0)
        on = np.where(prof > 0)[0]
        left, right = int(on[0]), int(on[-1])
        lo = int(left + (right - left) * 0.6)
        best, run, bstart, start = 0, 0, lo, lo
        for x in range(lo, right):
            if prof[x] == 0:
                if run == 0: start = x
                run += 1
                if run > best: best, bstart = run, start
            else:
                run = 0
        icon_start = bstart + best if best else int(left + (right - left) * 0.8)
        fp_end = bstart if best else icon_start
        pitch = (fp_end - left) / fp_cols
        cc = [region[0] + left + pitch * (i + 0.5) for i in range(fp_cols)]
        cc.append(region[0] + (icon_start + right) / 2.0)
        cells, col_c, row_c, lab = grid_assign(arr, region, nrows, ncols, thr, col_centers=cc, row_centers=row_c)
        print("  (touching frames: rebuilt columns, pitch %.0fpx)" % pitch)
    arr = clean_alpha(arr, thr)

    # First-person frames: bottom of each row = the cut edge of the hands.
    fp = {}
    for r in range(nrows):
        row_frames = []
        for c in range(fp_cols):
            if not cells[r][c]:
                continue
            img, box = cell_image(arr, lab, region, cells[r][c])
            img = drop_bottom_slivers(img, box, row_bottom_guess=None)
            row_frames.append((c, img, box))
        bottom = max(b[3] for _, _, b in row_frames)
        for c, img, box in row_frames:
            fp[(r, c)] = (img, box, col_c[c], bottom)
    left = right = up = 1
    for (img, box, cx, bottom) in fp.values():
        left = max(left, cx - box[0]); right = max(right, box[2] - cx)
        up = max(up, bottom - box[1])
    lw, rw, fh = int(np.ceil(left)), int(np.ceil(right)), int(np.ceil(up))
    fw = lw + rw
    fp_atlas = np.zeros((fh * nrows, fw * fp_cols, 4), np.uint8)
    for (r, c), (img, box, cx, bottom) in fp.items():
        px = int(round(box[0] - cx + lw)) + c * fw
        py = int(round(box[1] - bottom + fh)) + r * fh
        h, w = img.shape[:2]
        dst = fp_atlas[py:py + h, px:px + w]
        src = img[:dst.shape[0], :dst.shape[1]]
        dst[:] = np.where(src[..., 3:4] > 0, src, dst)

    # Icons (column 8): trimmed, centred in a uniform square-ish cell.
    icons = []
    for r in range(nrows):
        comps = cells[r][ncols - 1] if ncols > fp_cols else []
        if comps:
            img, box = cell_image(arr, lab, region, comps)
            icons.append(img)
        else:
            icons.append(None)
    iw = max(i.shape[1] for i in icons if i is not None) + 4
    ih = max(i.shape[0] for i in icons if i is not None) + 4
    icon_atlas = np.zeros((ih * nrows, iw, 4), np.uint8)
    for r, img in enumerate(icons):
        if img is None:
            continue
        h, w = img.shape[:2]
        px = (iw - w) // 2
        py = r * ih + (ih - h) // 2
        icon_atlas[py:py + h, px:px + w] = img

    apply_erase(fp_atlas, fw, fh, sheet.get("erase", []))

    fp_out, icon_out = sheet["outFP"], sheet["outIcons"]
    save_png(fp_atlas, fp_out)
    save_png(icon_atlas, icon_out)
    print("  %s: %d weapons, fp %dx%d, icon %dx%d" % (sheet["id"], nrows, fw, fh, iw, ih))
    return {
        "id": sheet["id"],
        "fpFile": fp_out, "fpW": fw, "fpH": fh, "fpFrames": fp_cols,
        "iconFile": icon_out, "iconW": iw, "iconH": ih,
        "muzzle": sheet.get("muzzle", [0.45, 0.15]),
        "weapons": [dict({"archetype": sheet.get("archetype", "rifle"),
                          "rarity": sheet.get("rarity", "common")}, **w, row=i)
                    for i, w in enumerate(sheet["weapons"])],
        "source": sheet["src"],
    }


def process_sprite_grid(sheet):
    arr = load_rgba(sheet["src"])
    thr = sheet.get("alphaThreshold", 40)
    region = sheet.get("region") or [0, 0, arr.shape[1], arr.shape[0]]
    rows, cols = sheet["rows"], sheet["cols"]
    cells, _, _, lab = grid_assign(arr, region, rows, cols, thr)
    arr = clean_alpha(arr, thr)
    size = sheet.get("size", 64)
    atlas = np.zeros((size * rows, size * cols, 4), np.uint8)
    items = []
    names = sheet["sprites"]
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            if not cells[r][c]:
                continue
            img, box = cell_image(arr, lab, region, cells[r][c])
            h, w = img.shape[:2]
            s = max(h, w)
            sq = np.zeros((s, s, 4), np.uint8)
            sq[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = img
            small = resize_rgba(sq, (size, size))
            atlas[r * size:(r + 1) * size, c * size:(c + 1) * size] = small
            meta = names[i] if i < len(names) else {"id": "%s_%02d" % (sheet["id"], i + 1), "tags": list(sheet.get("tags", []))}
            if sheet.get("direction"):
                meta = dict(meta, direction=sheet["direction"])
            # average colour of the bright core (used for light colour)
            px = small[small[..., 3] > 200][:, :3].astype(float)
            col = px.mean(0) if len(px) else np.array([255, 255, 255])
            bright = px[px.sum(1) > np.percentile(px.sum(1), 70)] if len(px) > 10 else px
            if len(bright):
                col = bright.mean(0)
            items.append(dict(meta, col=c, row=r, color=[int(v) for v in col]))
    out = sheet["out"]
    save_png(atlas, out)
    print("  %s: %d sprites @%dpx -> %s" % (sheet["id"], len(items), size, out))
    return {"id": sheet["id"], "file": out, "size": size, "cols": cols, "rows": rows,
            "sprites": items, "source": sheet["src"]}


def detect_separators(lum, count_hint=None, min_frac=0.55, axis=0):
    """Find the dark grid lines between tiles. `lum` is a 2-D luminance
    array; returns sorted separator positions along `axis` (0 = columns)."""
    L = lum if axis == 0 else lum.T
    d = np.minimum(L[:, 6:] - L[:, 3:-3], L[:, :-6] - L[:, 3:-3])
    prof = np.pad((d > 6).mean(0), (3, 3))
    # also reward genuinely dark lines
    dark = (L < np.percentile(L, 12)).mean(0)
    prof = prof * 0.8 + dark * 0.4
    n = len(prof)
    if count_hint:
        approx = n / count_hint
        edges = []
        for k in range(1, count_hint):
            c = int(round(k * approx)); w = max(6, int(approx * 0.22))
            seg = prof[max(0, c - w):c + w]
            edges.append(int(np.argmax(seg)) + max(0, c - w))
        return [0] + edges + [n]
    # unknown count: estimate the tile pitch by autocorrelation, then snap
    pz = prof - prof.mean()
    best_lag, best_v = None, -1e9
    for lag in range(max(20, n // 24), n // 2 + 1):
        v = float(np.dot(pz[:-lag], pz[lag:])) / (n - lag)
        if v > best_v:
            best_v, best_lag = v, lag
    if best_lag:
        count = max(1, int(round(n / best_lag)))
        return detect_separators(lum, count, min_frac, axis)
    order = np.argsort(prof)[::-1]
    min_gap = max(24, n // 40)
    picked = []
    thr = max(0.3, np.percentile(prof, 99) * min_frac)
    for i in order:
        if prof[i] < thr:
            break
        if i < min_gap or i > n - min_gap:
            continue
        if all(abs(i - j) >= min_gap for j in picked):
            picked.append(int(i))
    return [0] + sorted(picked) + [n]


def tile_meta(sheet, r, c):
    """Tile id + tags from either the verbose `tiles` list or the compact
    `tileTags` grid (one space-separated tag string per tile) + `rowTags`."""
    if "tiles" in sheet:
        cols = sheet.get("cols") or (len(sheet["colEdges"]) - 1)
        i = r * cols + c
        if i < len(sheet["tiles"]):
            return dict(sheet["tiles"][i])
    tags = list(sheet.get("tags", []))
    rt = sheet.get("rowTags", [])
    if r < len(rt):
        tags += rt[r].split()
    tt = sheet.get("tileTags", [])
    name = None
    if r < len(tt) and c < len(tt[r]):
        words = tt[r][c].split()
        if words and words[0].startswith("="):
            name = words[0][1:]
            words = words[1:]
        tags += words
    tid = "%s_%s" % (sheet["id"], name or ("r%dc%d" % (r, c)))
    return {"id": tid, "tags": sorted(set(tags))}


def auto_tags(arr):
    """Colour/brightness tags computed from the pixels (cheap, always on)."""
    a = arr.reshape(-1, 3).astype(float)
    mean = a.mean(0)
    lum = mean.mean()
    mx, mn = a.max(1), a.min(1)
    sat = float(((mx - mn) / np.maximum(mx, 1)).mean())
    tags = []
    if lum < 60: tags.append("dark")
    elif lum > 150: tags.append("bright")
    if sat < 0.15: tags.append("grey")
    else:
        r, g, b = mean
        if r > g * 1.25 and r > b * 1.25: tags.append("red" if g < r * 0.6 else "orange")
        elif g > r * 1.1 and g > b * 1.1: tags.append("green")
        elif b > r * 1.1 and b >= g: tags.append("blue")
        elif r > b * 1.3 and g > b * 1.2: tags.append("yellow" if lum > 110 else "brown")
        elif r > g and b > g: tags.append("purple")
    hot = ((a[:, 0] > 200) & (a[:, 1] > 80) & (a[:, 2] < 80)).mean()
    if hot > 0.04: tags.append("glow")
    return tags


def process_texture_grid(sheet):
    im = Image.open(os.path.join(ROOT, sheet["src"])).convert("RGB")
    arr = np.array(im).astype(float)
    lum = arr.mean(-1)
    inset = sheet.get("inset", 4)
    size = sheet.get("size", 64)
    # row edges
    if "rowEdges" in sheet:
        ys = sheet["rowEdges"]
    else:
        ys = detect_separators(lum, sheet.get("rows"), axis=1)
    rows = len(ys) - 1
    # column edges: global, or per row (irregular sheets with wide tiles)
    per_row_cols = sheet.get("rowCols")
    col_edges = []
    for r in range(rows):
        if "colEdges" in sheet:
            col_edges.append(sheet["colEdges"])
            continue
        band = lum[ys[r] + 8:ys[r + 1] - 8]
        hint = per_row_cols[r] if per_row_cols else sheet.get("cols")
        col_edges.append(detect_separators(band, hint, axis=0))
    cols = max(len(e) - 1 for e in col_edges)
    atlas = Image.new("RGB", (size * cols, size * rows))
    tiles = []
    for r in range(rows):
        xs = col_edges[r]
        for c in range(len(xs) - 1):
            x0, x1 = xs[c] + inset, xs[c + 1] - inset
            y0, y1 = ys[r] + inset, ys[r + 1] - inset
            w, h = x1 - x0, y1 - y0
            if w > h * 1.3:     # wide tile: take a centred square
                x0 += (w - h) // 2; x1 = x0 + h
            elif h > w * 1.3:
                y0 += (h - w) // 2; y1 = y0 + w
            t = im.crop((x0, y0, x1, y1)).resize((size, size), Image.LANCZOS)
            atlas.paste(t, (c * size, r * size))
            meta = tile_meta(sheet, r, c)
            ta = np.array(t)
            meta["tags"] = sorted(set(meta.get("tags", []) + auto_tags(ta)))
            tiles.append(dict(meta, col=c, row=r, avg=[int(v) for v in ta.reshape(-1, 3).mean(0)]))
    out = os.path.join(ROOT, sheet["out"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    save_texture_atlas(atlas, out)
    print("  %s: %d tiles (%d rows) @%dpx -> %s" % (sheet["id"], len(tiles), rows, size, sheet["out"]))
    return {"id": sheet["id"], "file": sheet["out"], "size": size, "cols": cols, "rows": rows,
            "tiles": tiles, "source": sheet["src"]}


def process_door_frames(sheet):
    """Animated key doors: `srcs` = [closed, opening1, opening2, open] images,
    each a grid of designs (columns) x key colours (rows). Black areas of the
    opening/open frames become transparent so the doorway is see-through.
    Output atlas: row = colour, column = design * 4 + frame."""
    frames = [np.array(Image.open(os.path.join(ROOT, p)).convert("RGB")) for p in sheet["srcs"]]
    cols, rows = sheet.get("cols", 10), len(sheet.get("colors", ["red", "blue", "yellow", "green", "purple"]))
    size = sheet.get("size", 64)
    inset = sheet.get("inset", 3)
    lum = frames[0].astype(float).mean(-1)
    ys = sheet.get("rowEdges") or detect_separators(lum, rows, axis=1)
    xs = sheet.get("colEdges") or detect_separators(lum, cols, axis=0)
    nf = len(frames)
    atlas = np.zeros((rows * size, cols * nf * size, 4), np.uint8)
    for f, img in enumerate(frames):
        for r in range(rows):
            for c in range(cols):
                tile = img[ys[r] + inset:ys[r + 1] - inset, xs[c] + inset:xs[c + 1] - inset]
                t = np.array(Image.fromarray(tile).resize((size, size), Image.LANCZOS))
                a = np.full((size, size), 255, np.uint8)
                if f > 0:
                    hole = t.max(-1) < sheet.get("blackThreshold", 22)
                    # only large black regions are holes (keep thin outlines)
                    lab, n = ndimage.label(hole)
                    if n:
                        sizes = ndimage.sum(hole, lab, range(1, n + 1))
                        big = np.isin(lab, np.where(sizes > size * size * 0.01)[0] + 1)
                        a[big] = 0
                rgba = np.dstack([t, a])
                atlas[r * size:(r + 1) * size, (c * nf + f) * size:(c * nf + f + 1) * size] = rgba
    save_png(atlas, sheet["out"])
    print("  %s: %d designs x %d colours x %d frames @%dpx" % (sheet["id"], cols, rows, nf, size))
    return {"id": sheet["id"], "file": sheet["out"], "size": size, "designs": cols, "frames": nf,
            "colors": sheet.get("colors", ["red", "blue", "yellow", "green", "purple"]),
            "source": sheet["srcs"]}


def process_animated_texture(sheet):
    """Animated tiles: one tile per row, `frames` frames left-to-right.
    Each frame is resized to size x size (keeps seamless tiling)."""
    im = Image.open(os.path.join(ROOT, sheet["src"])).convert("RGB")
    lum = np.array(im).astype(float).mean(-1)
    rows = sheet.get("rows", 10)
    nf = sheet.get("frames", 4)
    size = sheet.get("size", 64)
    inset = sheet.get("inset", 3)
    ys = sheet.get("rowEdges") or detect_separators(lum, rows, axis=1)
    xs = sheet.get("colEdges") or detect_separators(lum[ys[0] + 6:ys[1] - 6], nf, axis=0)
    atlas = Image.new("RGB", (size * nf, size * rows))
    tiles = []
    for r in range(rows):
        frames_avg = []
        for f in range(nf):
            box = (xs[f] + inset, ys[r] + inset, xs[f + 1] - inset, ys[r + 1] - inset)
            t = im.crop(box).resize((size, size), Image.LANCZOS)
            atlas.paste(t, (f * size, r * size))
            frames_avg.append(np.array(t))
        meta = tile_meta(sheet, r, 0)
        meta["tags"] = sorted(set(meta.get("tags", []) + auto_tags(frames_avg[0]) + ["animated"]))
        tiles.append(dict(meta, row=r, col=0, frames=nf,
                          avg=[int(v) for v in frames_avg[0].reshape(-1, 3).mean(0)]))
    out = os.path.join(ROOT, sheet["out"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    save_texture_atlas(atlas, out)
    print("  %s: %d animated tiles x %d frames @%dpx" % (sheet["id"], rows, nf, size))
    return {"id": sheet["id"], "file": sheet["out"], "size": size, "cols": nf, "rows": rows,
            "frames": nf, "fps": sheet.get("fps", 6), "tiles": tiles, "source": sheet["src"]}


def bright_lines(lum, count, axis):
    """Grid lines drawn lighter than a dark background: the per-column (or
    row) median luminance peaks on the lines (icons only cover part of a cell)."""
    L = lum if axis == 0 else lum.T
    prof = np.median(L, axis=0)
    prof = ndimage.uniform_filter1d(prof, 3)
    n = len(prof)
    approx = n / count
    edges = [0]
    for k in range(1, count):
        c = int(round(k * approx)); w = int(approx * 0.25)
        seg = prof[max(0, c - w):c + w]
        edges.append(int(np.argmax(seg)) + max(0, c - w))
    edges.append(n)
    # snap the outer edges onto the outer frame lines too
    w = int(approx * 0.2)
    edges[0] = int(np.argmax(prof[:w])) if w > 2 else 0
    edges[-1] = n - w + int(np.argmax(prof[n - w:])) if w > 2 else n
    return edges


def process_item_grid(sheet):
    """Labelled item sheets: a header, then cols x rows boxed cells each with
    an icon on top and a caption below. Captions are dropped; the dark cell
    background is keyed to transparency."""
    from scipy import signal
    im = np.array(Image.open(os.path.join(ROOT, sheet["src"])).convert("RGB"))
    H, W = im.shape[:2]
    f = im.astype(float)
    lum = f.mean(-1)
    sat = (f.max(-1) - f.min(-1)) / np.maximum(f.max(-1), 1)
    line = (lum > 35) & (lum < 150) & (sat < 0.3)        # grey frame lines

    def lines(axis):
        prof = line.mean(0) if axis == 0 else line.mean(1)
        pk = list(map(int, signal.find_peaks(prof, height=0.45, distance=30)[0]))
        if len(pk) >= 3:
            gaps = np.diff(pk)
            med = np.median(gaps)
            if gaps[0] < med * 0.6:          # outer frame + header line on top
                pk = pk[1:]
        return pk
    xs, ys = lines(0), lines(1)
    if len(xs) < 2 or len(ys) < 2:           # fallback: even split
        cols, rows = sheet.get("cols", 5), sheet.get("rows", 10)
        top = sheet.get("headerPx") or int(H * 0.03)
        xs = [int(W * i / cols) for i in range(cols + 1)]
        ys = [top + int((H - top) * i / rows) for i in range(rows + 1)]
    cols, rows = len(xs) - 1, len(ys) - 1
    size = sheet.get("size", 64)
    icon_frac = sheet.get("iconFrac", 0.66)
    skip = set(sheet.get("skip", []))
    atlas = np.zeros((size * rows, size * cols, 4), np.uint8)
    sprites = []
    for r in range(rows):
        for c in range(cols):
            idx = r * cols + c
            x0, x1 = xs[c] + 6, xs[c + 1] - 5
            y0, y1 = ys[r] + 6, ys[r] + 6 + int((ys[r + 1] - ys[r]) * icon_frac)
            cell = im[y0:y1, x0:x1].astype(float)
            if cell.size == 0:
                continue
            border = np.concatenate([cell[:3].reshape(-1, 3), cell[-3:].reshape(-1, 3), cell[:, :3].reshape(-1, 3), cell[:, -3:].reshape(-1, 3)])
            bg = np.median(border, 0)
            diff = np.abs(cell - bg).max(-1)
            near = diff < sheet.get("tol", 26)
            lab, n = ndimage.label(near)
            edge_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
            bgmask = np.isin(lab, list(edge_ids))
            alpha = np.where(bgmask, 0, 255).astype(np.uint8)
            soft = ndimage.binary_dilation(bgmask, iterations=1) & ~bgmask & (diff < 60)
            alpha[soft] = 140
            # drop tiny specks (sparkles of the frame)
            fg = alpha > 0
            l2, n2 = ndimage.label(fg)
            if n2:
                sz = ndimage.sum(fg, l2, range(1, n2 + 1))
                keep = np.isin(l2, np.where(sz >= max(12, sz.max() * 0.04))[0] + 1)
                alpha[~keep] = 0
            ys_, xs_ = np.where(alpha > 0)
            if not len(ys_):
                continue
            rgba = np.dstack([cell.astype(np.uint8), alpha])[ys_.min():ys_.max() + 1, xs_.min():xs_.max() + 1]
            h, w = rgba.shape[:2]
            sq = max(h, w) + 4
            canvas = np.zeros((sq, sq, 4), np.uint8)
            canvas[(sq - h) // 2:(sq - h) // 2 + h, (sq - w) // 2:(sq - w) // 2 + w] = rgba
            small = resize_rgba(canvas, (size, size))
            atlas[r * size:(r + 1) * size, c * size:(c + 1) * size] = small
            tags = list(sheet.get("tags", []))
            rt = sheet.get("rowTags", [])
            if r < len(rt): tags += rt[r].split()
            names = sheet.get("names", {})
            sprites.append({"id": "%s_%02d" % (sheet["id"], idx + 1), "col": c, "row": r,
                            "tags": sorted(set(tags + (["skip"] if idx + 1 in skip else []))),
                            "name": names.get(str(idx + 1)),
                            "color": [int(v) for v in small[small[..., 3] > 200][:, :3].mean(0)] if (small[..., 3] > 200).any() else [200, 200, 200]})
    save_png(atlas, sheet["out"])
    print("  %s: %d item icons (%dx%d)" % (sheet["id"], len(sprites), cols, rows))
    return {"id": sheet["id"], "file": sheet["out"], "size": size, "cols": cols, "rows": rows,
            "sprites": sprites, "source": sheet["src"], "kind": "items"}


PROCESSORS = {
    "monster": ("monsters", process_monster),
    "weapon_set": ("weaponSets", process_weapon_set),
    "sprite_grid": ("spriteSets", process_sprite_grid),
    "texture_grid": ("textureSets", process_texture_grid),
    "door_frames": ("doorSets", process_door_frames),
    "animated_texture": ("animatedTextureSets", process_animated_texture),
    "item_grid": ("spriteSets", process_item_grid),
}


RARITY_DIRS = ("common", "uncommon", "rare", "epic", "legendary")


def discover_unconfigured(sheets, ignore=()):
    """Any image dropped into art/raw/ that has no config entry is processed
    with sensible defaults, so uploads work even before they're catalogued:
      art/raw/weapons/<rarity>/<name>.webp  -> weapon_set (rows auto-counted)
      art/raw/textures/<name>.webp          -> texture_grid (grid auto-detected)
      art/raw/projectiles/<name>.webp       -> sprite_grid needs rows/cols: skipped
    """
    known = {os.path.normpath(p) for p in ignore}
    for s_ in sheets:
        for p_ in (s_.get("srcs") or [s_["src"]]):
            known.add(os.path.normpath(p_))
    found = []
    raw = os.path.join(ROOT, "art", "raw")
    for dirpath, _, files in os.walk(raw):
        for fn in sorted(files):
            if not fn.lower().endswith((".webp", ".png", ".jpg", ".jpeg")):
                continue
            rel = os.path.normpath(os.path.relpath(os.path.join(dirpath, fn), ROOT))
            if rel in known:
                continue
            parts = rel.split(os.sep)
            stem = os.path.splitext(fn)[0].lower().replace(" ", "_").replace("-", "_")
            if "weapons" in parts:
                rarity = next((p for p in parts if p in RARITY_DIRS), "common")
                sid = "auto_%s_%s" % (rarity, stem)
                found.append({"id": sid, "type": "weapon_set", "rarity": rarity, "archetype": "rifle", "src": rel,
                              "outFP": "assets/sprites/weapons/%s_fp.png" % sid,
                              "outIcons": "assets/sprites/weapons/%s_icons.png" % sid,
                              "baseName": stem.replace("_", " ").title(), "weapons": []})
            elif "bosses" in parts or "enemies" in parts:
                import re as _re
                mid = _re.sub(r"^\d+[_ -]*", "", stem)
                found.append({"id": mid, "name": mid.replace("_", " ").title(), "type": "monster",
                              "kind": "boss" if "bosses" in parts else "enemy", "src": rel,
                              "out": "assets/sprites/monsters/%s.png" % mid})
            elif "doors" in parts:
                continue   # door sets need 4 files; configure them in art_config.json
            elif "textures" in parts:
                sid = "auto_tex_" + stem
                found.append({"id": sid, "type": "texture_grid", "src": rel, "tags": stem.split("_"),
                              "out": "assets/textures/%s.png" % sid})
            if found and found[-1]["src"] == rel:
                print("[auto] %s: not in art_config.json, using defaults" % rel)
    return found


def main():
    with open(CONFIG) as f:
        cfg = json.load(f)
    only = set(sys.argv[1:])
    manifest = {"version": 1, "monsters": [], "weaponSets": [], "spriteSets": [], "textureSets": [], "doorSets": [], "animatedTextureSets": []}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            manifest.update(json.load(f))
    cfg["sheets"] += discover_unconfigured(cfg["sheets"], cfg.get("ignore", []))
    for sheet in cfg["sheets"]:
        if only and sheet["id"] not in only:
            continue
        key, fn = PROCESSORS[sheet["type"]]
        srcs = sheet.get("srcs") or [sheet["src"]]
        missing = [p for p in srcs if not os.path.exists(os.path.join(ROOT, p))]
        if missing:
            print("[%s] %s: SKIPPED - waiting for %s" % (sheet["type"], sheet["id"], ", ".join(missing)))
            continue
        print("[%s] %s" % (sheet["type"], sheet["id"]))
        entry = fn(sheet)
        manifest[key] = [e for e in manifest[key] if e["id"] != entry["id"]] + [entry]
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=1)
    print("wrote", os.path.relpath(MANIFEST, ROOT))


if __name__ == "__main__":
    main()
