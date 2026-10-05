#!/usr/bin/env python3
"""Station teleporter pad art (art/raw/hub/portal_floor.webp, uploaded sheet).

The top of the sheet is one painted 9x9-cell floor composition (the pad the
player starts on in the hub); the bottom holds 2 rows x 9 edge / panel tiles.
  - the composition is cropped and resampled to 9 x 64 px per side ->
    assets/textures/hub_portal_floor.png; World cuts it into 81 floor layers
    (one per pad cell, see levelgen/hub.js PAD_SLOT0).
  - the edge tiles are cropped to art/raw/hub/portal_edges.webp, which the
    regular texture_grid sheet tx26_station_edges slices into the tile library.
Usage: python3 tools/hub_portal_floor.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art/raw/hub/portal_floor.webp")
PAD_BOX = (6, 4, 1130, 1090)        # the painted square (outer frame included)
EDGE_BOX = (0, 1112, 1136, 1365)    # the two rows of edge tiles
CELLS, PX = 9, 64


def _runs(mask):
    out, s = [], None
    for i, v in enumerate(mask):
        if v and s is None:
            s = i
        if not v and s is not None:
            out.append((s, i))
            s = None
    if s is not None:
        out.append((s, len(mask)))
    return out


def repack_edges(im):
    """The edge tiles sit on a black background with uneven gaps: find each
    tile's box from the dark bands between them and repack the 2 x 9 tiles
    onto a clean 128 px grid (so texture_grid can cut it with no inset)."""
    a = np.asarray(im.crop(EDGE_BOX).convert("RGB")).astype(int).sum(2)
    rows = [r for r in _runs(a.mean(1) > 60) if r[1] - r[0] > 40]
    out = Image.new("RGB", (9 * 128, len(rows) * 128))
    for ri, (y0, y1) in enumerate(rows):
        cols = [c for c in _runs(a[y0:y1].mean(0) > 45) if c[1] - c[0] > 40]
        assert len(cols) == 9, (ri, cols)
        for ci, (x0, x1) in enumerate(cols):
            tile = im.crop((EDGE_BOX[0] + x0, EDGE_BOX[1] + y0, EDGE_BOX[0] + x1, EDGE_BOX[1] + y1)).convert("RGB")
            out.paste(tile.resize((128, 128), Image.LANCZOS), (ci * 128, ri * 128))
    return out


def main():
    im = Image.open(SRC).convert("RGBA")
    pad = im.crop(PAD_BOX).convert("RGB")
    # area-average down to 64 px per cell, then a light unsharp pass keeps the
    # light strips and panel seams crisp at game resolution
    pad = pad.resize((CELLS * PX, CELLS * PX), Image.LANCZOS)
    out = os.path.join(ROOT, "assets/textures/hub_portal_floor.png")
    pad.save(out, optimize=True)
    edges = repack_edges(im)
    eout = os.path.join(ROOT, "art/raw/hub/portal_edges.webp")
    edges.save(eout, lossless=True, quality=100)
    print("wrote", os.path.relpath(out, ROOT), pad.size, "and", os.path.relpath(eout, ROOT), edges.size)


if __name__ == "__main__":
    main()
