#!/usr/bin/env python3
"""Measure each first-person weapon's arm at the bottom edge of its idle frame.

Writes fp.arm = [x0, x1] (frame px): the opaque extent of the lowest 6% of
the art box (the wrist / sleeve where the art meets the screen edge). The
game scales melee and thrown weapons by this arm width so their hands match
the guns' hands instead of shrinking behind long blades (Game.weaponLayout).
Usage: python3 tools/weapon_arms.py   (rewrites only fp.arm in assets/manifest.json)
"""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "assets/manifest.json")


def main():
    with open(MANIFEST) as f:
        man = json.load(f)
    n = 0
    for s in man["weaponSets"]:
        im = None
        for w in s["weapons"]:
            fp = w.get("fp")
            if not fp or fp.get("bad"):
                continue
            if im is None:
                im = np.asarray(Image.open(os.path.join(ROOT, s["fpFile"])).convert("RGBA"))
            fw, fh = s["fpW"], s["fpH"]
            a = im[w["row"] * fh:(w["row"] + 1) * fh, 0:fw, 3]
            top, bot = int(fp["top"]), int(fp["bottom"])
            band = a[max(top, bot - max(2, int(round(0.06 * (bot - top))))):bot]
            cols = np.where((band > 40).any(0))[0]
            if not len(cols):
                continue
            fp["arm"] = [int(cols[0]), int(cols[-1]) + 1]
            n += 1
    tmp = MANIFEST + ".tmp"
    with open(tmp, "w") as f:
        json.dump(man, f, indent=1)
    os.replace(tmp, MANIFEST)
    print("fp.arm written for", n, "weapons")


if __name__ == "__main__":
    main()
