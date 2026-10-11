"""Barrel axis of every first-person weapon sprite.

    python3 tools/weapon_barrels.py            # measure all guns, update fp in assets/manifest.json
    python3 tools/weapon_barrels.py --check    # measure only, print a report, write nothing

The game aims the drawn weapon at the crosshair: Game.drawWeapon() shifts
the sprite sideways until the barrel line, extended out of the muzzle, runs
through the screen centre, and shots leave the drawn barrel tip along that
line.  This tool measures that line from the idle frame (frame 0) of the
processed atlases (assets/sprites/weapons/*_fp.png) and writes, per weapon,
into its `fp` metadata (frame pixels):

    barrel   [dx, dy]  unit vector along the barrel, pointing out of the muzzle
    tip      [x, y]    the barrel tip on that axis (where shots leave)
    barrelQ  0..1      confidence; the game ignores barrels below BARREL_MIN_Q
                       (and keeps the old fixed placement for that weapon)

Method: the barrel tip sits next to the baked muzzle flash (fp.muzzle, the
centre of the bright pixels a fire frame adds); without a plausible flash it
is the front end of the gun along the hands -> top direction.  A first
direction runs from the centroid of the body pixels near the tip to the tip
(a localised grip-to-muzzle line); it is refined on the strongest straight
edge through the tip region (gradient-constrained Hough transform of the
silhouette and inner luminance edges: barrel sides, rails, highlights).
The confidence drops when the two disagree, when there is no long straight
edge (blobby emitters, barrels seen end-on), when the flash does not sit
ahead of the barrel or when the axis does not point up into the screen.
Melee and thrown weapons are skipped.

Only `fp.barrel / fp.tip / fp.barrelQ` of guns change; running it twice
changes nothing.  tools/process_art.py calls measure_frame() on the saved
atlas too, so a re-sliced sheet gets the same barrels.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "assets", "manifest.json")
NO_BARREL = ("blade", "mace", "club", "shuriken", "javelin")
SIGMA = 1.3                 # edge smoothing: pixel-art staircases read as one slanted edge
BARREL_MIN_Q = 0.5          # same threshold as BARREL_MIN_Q in src/game/game.js


def body_mask(a, thr=128):
    """Weapon + hands: the largest solid blob and the blobs touching it or
    reaching the arm cut (same rule as process_art.weapon_body_mask)."""
    mask = a >= thr
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    msz = sizes[main - 1]
    near = ndimage.binary_dilation(lab == main, iterations=3)
    keep = {main}
    for k in np.unique(lab[near & mask]):
        if k and sizes[k - 1] >= 0.04 * msz:
            keep.add(int(k))
    for k in np.unique(lab[max(0, a.shape[0] - 3):]):
        if k and sizes[k - 1] >= 0.08 * msz:
            keep.add(int(k))
    return np.isin(lab, list(keep))


def _ang(a, b):
    """Angle in degrees between two directions (sign ignored)."""
    return float(np.degrees(np.arccos(min(1.0, abs(float(np.dot(a, b)))))))


def _edges(fr, B):
    """Edge pixels of the weapon: the silhouette plus strong inner luminance
    edges (barrel sides, rails, highlights running along the barrel).
    Returns x, y, weight, gradient angle (deg, 0..180)."""
    sb = ndimage.gaussian_filter(B.astype(float), SIGMA)
    lum = ndimage.gaussian_filter(fr[..., :3].astype(float).mean(-1) * B, SIGMA)
    out = []
    for img, inner, thr, wt in ((sb, None, 0.25, 1.0), (lum, ndimage.binary_erosion(B, iterations=1), 0.35, 0.6)):
        gx, gy = ndimage.sobel(img, 1), ndimage.sobel(img, 0)
        g = np.hypot(gx, gy)
        if inner is not None:
            g = g * inner
        if not (g > 0).any():
            continue
        g = g / max(1e-6, np.percentile(g[g > 0], 95))
        yy, xx = np.nonzero(g > thr)
        out.append((xx + 0.5, yy + 0.5, wt * np.minimum(g[yy, xx], 2), np.degrees(np.arctan2(gy[yy, xx], gx[yy, xx])) % 180))
    return [np.concatenate(v) for v in zip(*out)]


def _line_through(E, T, prior, L):
    """Strongest straight edge direction through the tip region: a Hough
    transform of the edge pixels behind the tip T, restricted to lines that
    pass within a barrel's half width of T.  Every pixel votes only for line
    normals within 12 deg of its own gradient (texture noise spreads thin,
    long straight edges pile up).  Directions near `prior` are preferred.
    Returns (unit direction pointing like prior, straight edge length px)."""
    x, y, w, ga = E
    dx, dy = x - T[0], y - T[1]
    keep = (np.hypot(dx, dy) < 0.6 * L) & (dx * prior[0] + dy * prior[1] < 2.0)
    dx, dy, w, ga = dx[keep], dy[keep], w[keep], ga[keep]
    if len(w) < 8:
        return None, 0.0
    wmax = max(4.0, 0.12 * L)
    th = np.arange(180)
    rad = np.radians(th)
    rho = dx[:, None] * np.cos(rad)[None] + dy[:, None] * np.sin(rad)[None]
    dg = np.abs(((ga[:, None] - th[None]) + 90) % 180 - 90)
    vote = w[:, None] * np.clip(1 - dg / 12.0, 0, None) * (np.abs(rho) <= wmax)
    nb = int(2 * wmax) + 3
    ri = np.clip(np.round(rho + wmax + 1).astype(int), 0, nb - 1)
    acc = np.zeros((180, nb))
    for t in range(180):
        np.add.at(acc[t], ri[:, t], vote[:, t])
    acc = acc[:, :-1] + acc[:, 1:]
    S = np.zeros(180)
    for t in range(180):
        row = acc[t].copy()
        k = int(np.argmax(row))
        p1 = row[k]
        row[max(0, k - 2):k + 3] = 0
        S[t] = p1 + 0.5 * row.max()                 # a barrel has two parallel sides
    S = (S + np.roll(S, 1) + np.roll(S, -1)) / 3
    dirs = np.stack([-np.sin(rad), np.cos(rad)], 1)
    dev = np.degrees(np.arccos(np.clip(np.abs(dirs @ prior), 0, 1)))
    k = int(np.argmax(S * np.exp(-0.5 * (dev / 20.0) ** 2)))
    d = dirs[k] * (1 if dirs[k] @ prior >= 0 else -1)
    return d, float(S[k])


def _front(P, O, d):
    """Front end of the pixels P along d (from origin O): the 99.7th
    percentile of the projection, laterally centred on the pixels there."""
    pr = (P - O) @ d
    tp = float(np.percentile(pr, 99.7))
    n = np.array([-d[1], d[0]])
    lat = float(np.median(((P - O) @ n)[pr >= tp - 3]))
    return O + d * tp + n * lat


def measure_frame(fr, fp):
    """Barrel of one idle frame (H x W x 4 uint8).  `fp` is the weapon's
    placement metadata (top, muzzle...).  Returns a dict to merge into fp
    (plus a "_dbg" entry), or None when the frame is empty."""
    B = body_mask(fr[..., 3])
    ys, xs = np.nonzero(B)
    if len(xs) < 40:
        return None
    P = np.stack([xs + 0.5, ys + 0.5], 1).astype(float)
    top, bot = float(ys.min()), float(ys.max() + 1)
    h = bot - top
    Hc = P[P[:, 1] >= bot - 0.25 * h].mean(0)          # the hands enter at the bottom edge
    U = P[P[:, 1] < top + 0.55 * h]                      # the gun above the hands
    Uc = U.mean(0)
    # baked muzzle flash: a plausible one (on or just off the silhouette, in
    # the upper part of the art) marks the barrel tip
    M, Mt = fp.get("muzzle"), None
    if M and M[1] != fp.get("top"):
        M = np.array(M, float) + 0.5
        mi = np.clip(M.astype(int), 0, [B.shape[1] - 1, B.shape[0] - 1])
        out_d = ndimage.distance_transform_edt(~B)[mi[1], mi[0]]
        in_d = ndimage.distance_transform_edt(B)[mi[1], mi[0]]
        if out_d <= 0.2 * h and in_d <= 3 and M[1] < bot - 0.3 * h:
            Mt = P[int(np.argmin(np.hypot(*(P - M).T)))].copy()
    # axis: from the centroid of the gun to its front end (a robust
    # grip-to-muzzle line), snapped onto a long straight barrel edge through
    # the tip when there is one nearby.  Two starts (toward the top of the
    # art, toward the flash) can settle on different fronts (a scope on top
    # vs the barrel): the one with the stronger straight edge support wins.
    E = _edges(fr, B)
    starts = [P[P[:, 1] <= top + 0.12 * h].mean(0) - Hc]
    if Mt is not None:
        starts.append(Mt - Uc)
    best = None
    for d in starts:
        d = d / (np.linalg.norm(d) + 1e-9)
        flash, ch = False, 0.0
        for _ in range(8):
            T = _front(P, Uc, d)
            flash = Mt is not None and (Mt - Uc) @ d >= (T - Uc) @ d - 0.2 * np.linalg.norm(T - Uc)
            if flash:
                T = Mt
            nd = (T - Uc) / (np.linalg.norm(T - Uc) + 1e-9)
            ch = _ang(nd, d)
            d = nd
            if ch < 0.5:
                break
        L = max(8.0, float(np.linalg.norm(T - Hc)))
        dh, S = _line_through(E, T, d, L)
        agree = _ang(dh, d) if dh is not None else 90.0
        snap = dh is not None and agree <= 12 and S / L >= 0.2
        score = min(1.0, S / L) * (1.2 if flash else 1.0) * (1.0 if snap else 0.7)
        if d[0] > 0.25 and fp.get("hands") != "left":
            score *= 0.5                                 # right-hand guns do not point right
        cand = (score, dh if snap else d, T, L, flash, ch, agree, S)
        if best is None or cand[0] > best[0] + 1e-9:
            best = cand
    _, d, T, L, flash, ch, agree, S = best
    loc = P[np.hypot(*(P - T).T) < 0.35 * L]
    tip = _front(loc, T, d)                              # the front end of the barrel along d
    nrm = np.array([-d[1], d[0]])
    reach = float((tip - Uc) @ d) / (float(np.std((U - Uc) @ nrm)) + 1e-6)
    q = float(np.clip((reach - 1.2) / 1.0, 0, 1))          # a clear front end, not a blob
    q *= float(np.clip((-d[1] - 0.15) / 0.2, 0, 1))         # points up into the screen, not sideways
    if fp.get("hands") != "left":
        q *= float(np.clip((0.45 - d[0]) / 0.2, 0, 1))      # right-hand / two-hand guns do not point right
    q *= 1.0 if ch < 2 else 0.5                             # converged
    q *= 1.0 if agree <= 12 else 0.85                       # a straight barrel edge backs it up
    if Mt is not None and not flash:
        off = abs(float((M - tip) @ nrm))                   # a flash beside the axis: wrong front (a scope)
        q *= float(np.clip((0.25 * h - off) / (0.15 * h), 0, 1))
    return {"barrel": [round(float(d[0]), 4), round(float(d[1]), 4)],
            "tip": [round(float(tip[0]), 1), round(float(tip[1]), 1)],
            "barrelQ": round(q, 2),
            "_dbg": {"agree": round(agree, 1), "len": round(S / L, 2), "flash": bool(flash), "reach": round(reach, 2), "ch": round(ch, 1)}}


def measure_set(atlas, fw, fh, weapons):
    """Measure every gun of one weapon set (atlas = the fp atlas as saved,
    H x W x 4) and update their fp dicts in place.  Returns the debug rows."""
    rows = []
    for w in weapons:
        fp = w["fp"]
        for k in ("barrel", "tip", "barrelQ"):
            fp.pop(k, None)
        if w.get("archetype") in NO_BARREL or fp.get("bad"):
            continue
        r = w["row"]
        m = measure_frame(atlas[r * fh:(r + 1) * fh, 0:fw], fp)
        if not m:
            continue
        dbg = m.pop("_dbg")
        fp.update(m)
        rows.append((w, m, dbg))
    return rows


def main():
    check = "--check" in sys.argv
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else MANIFEST
    debug = "--debug" in sys.argv                    # keep the estimator internals in fp._dbg (scratch output only)
    with open(MANIFEST) as f:
        manifest = json.load(f)
    rows = []
    for s in manifest["weaponSets"]:
        atlas = np.array(Image.open(os.path.join(ROOT, s["fpFile"])).convert("RGBA"))
        for w, m, dbg in measure_set(atlas, s["fpW"], s["fpH"], s["weapons"]):
            if debug:
                w["fp"]["_dbg"] = dbg
            rows.append((w, m, dbg))
    ok = sum(1 for _, m, _ in rows if m["barrelQ"] >= BARREL_MIN_Q)
    if check:
        for w, m, dbg in rows:
            print("%-28s %-13s d=(%6.3f,%6.3f) tip=(%5.1f,%5.1f) q=%.2f %s" % (
                w["id"], w["archetype"], m["barrel"][0], m["barrel"][1], m["tip"][0], m["tip"][1], m["barrelQ"], dbg))
    print("%d guns measured, %d confident (q >= %.2f)" % (len(rows), ok, BARREL_MIN_Q))
    if not check or out != MANIFEST:
        if debug and out == MANIFEST:
            sys.exit("--debug only with --out <scratch file>")
        tmp = out + ".tmp"
        with open(tmp, "w") as f:
            json.dump(manifest, f, indent=1)
        os.replace(tmp, out)
        print("wrote", os.path.relpath(out, ROOT) if out.startswith(ROOT) else out)


if __name__ == "__main__":
    main()
