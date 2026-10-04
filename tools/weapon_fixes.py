#!/usr/bin/env python3
"""Hand-picked fixes for first-person weapon art that looks off in game.

Run after tools/process_art.py (it rebuilds the atlases from the raw sheets)
and after tools/weapon_barrels.py / weapon_arms.py. Each fix edits the
weapon's row in its fp atlas (every frame) and, for recolours, its icon,
and patches the manifest entry (name / fp fields). Idempotent: the applied
fixes are recorded in fp.fixed and skipped on a re-run.
  rotate : degrees (PIL convention, negative = clockwise) about the bottom
           grip point - longbows drawn edge-on read as a stick, canted they
           read as a bow
  share  : screen-height share of the art (Game.weaponLayout fp.share)
  aim    : False - not aimed at the crosshair (a bow's stave is no barrel)
  recolor: 'rust' - near-white / near-black faces become rusty iron + brass
  name   : display name (names that contradict the art)
Usage: python3 tools/weapon_fixes.py
"""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "assets/manifest.json")
CONFIG = os.path.join(ROOT, "tools/art_config.json")

FIXES = {
    # longbows filed as crossbows: rename, cant, draw bigger, no barrel aim
    "w_common_16_4": {"name": "Grim Longbow", "rotate": -18, "share": 0.6, "aim": False},
    "w_common_16_6": {"name": "Trench Recurve", "rotate": -18, "share": 0.6, "aim": False},
    "w_uncommon_12_4": {"name": "Old Longbow", "rotate": -18, "share": 0.6, "aim": False},
    # its art is a crossbow (the bow above had its name)
    "w_uncommon_12_0": {"name": "Old Arbalest"},
    # a black / white chequered cube among rusty guns
    "w_epic_04_3": {"recolor": "rust"},
}


def rotate_frame(fr, deg, pivot):
    """Rotate an RGBA frame about pivot (x, y) keeping the frame size."""
    return fr.rotate(deg, resample=Image.NEAREST, center=pivot, expand=False)


def recolor_rust(img):
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3:]
    lum = rgb.mean(-1, keepdims=True) / 255.0
    sat = (rgb.max(-1, keepdims=True) - rgb.min(-1, keepdims=True)) / 255.0
    grey = (sat < 0.18) & (al > 0)
    # light faces -> worn brass / rust, dark faces -> blackened iron
    rust = np.array([150, 82, 40], np.float32) * (0.45 + 0.75 * lum) + np.array([40, 30, 10], np.float32) * lum
    iron = np.array([62, 52, 46], np.float32) * (0.5 + 1.2 * lum)
    out = np.where(lum > 0.42, rust, iron)
    rgb = np.where(grey, np.clip(out, 0, 255), rgb)
    return Image.fromarray(np.concatenate([rgb, al], -1).astype(np.uint8), "RGBA")


def main():
    man = json.load(open(MANIFEST))
    cfg = json.load(open(CONFIG))
    names = {}
    for s in man["weaponSets"]:
        todo = [w for w in s["weapons"] if w["id"] in FIXES and not (w.get("fp") or {}).get("fixed")]
        if not todo:
            continue
        fpath, ipath = os.path.join(ROOT, s["fpFile"]), os.path.join(ROOT, s["iconFile"])
        atlas, icons = Image.open(fpath).convert("RGBA"), Image.open(ipath).convert("RGBA")
        fw, fh, nf = s["fpW"], s["fpH"], s["fpFrames"]
        for w in todo:
            fx, fp = FIXES[w["id"]], w["fp"]
            r = w["row"]
            for f in range(nf):
                box = (f * fw, r * fh, (f + 1) * fw, (r + 1) * fh)
                fr = atlas.crop(box)
                if "rotate" in fx:
                    fr = rotate_frame(fr, fx["rotate"], (fp["gripX"], fp["bottom"] - 2))
                if fx.get("recolor") == "rust":
                    fr = recolor_rust(fr)
                atlas.paste(Image.new("RGBA", fr.size, (0, 0, 0, 0)), box)
                atlas.paste(fr, box[:2])
            if fx.get("recolor") == "rust":
                ib = (0, r * s["iconH"], s["iconW"], (r + 1) * s["iconH"])
                icons.paste(recolor_rust(icons.crop(ib)), ib[:2])
            if "rotate" in fx:
                # the art box moved: recompute top / sides from the idle frame
                idle = np.asarray(atlas.crop((0, r * fh, fw, (r + 1) * fh)))[..., 3] > 40
                ys, xs = np.where(idle)
                fp["top"], fp["artL"], fp["artR"] = int(ys.min()), int(xs.min()), int(xs.max()) + 1
            for k in ("share", "aim"):
                if k in fx:
                    fp[k] = fx[k]
            if "name" in fx:
                w["name"] = names[w["id"]] = fx["name"]
            fp["fixed"] = sorted(k for k in fx if k != "name") or ["name"]
        # 256-colour palette PNGs like the rest of the sprites (process_art.save_png)
        q = lambda im: im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        q(atlas).save(fpath, optimize=True)
        q(icons).save(ipath, optimize=True)
    # keep the art config's names in line so a re-slice keeps them
    def walk(o):
        if isinstance(o, dict):
            if o.get("id") in names and "name" in o:
                o["name"] = names[o["id"]]
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(cfg)
    json.dump(man, open(MANIFEST + ".tmp", "w"), indent=1)
    os.replace(MANIFEST + ".tmp", MANIFEST)
    json.dump(cfg, open(CONFIG + ".tmp", "w"), indent=1)
    os.replace(CONFIG + ".tmp", CONFIG)
    print("fixed", sorted(FIXES), "renamed", names)


if __name__ == "__main__":
    main()
