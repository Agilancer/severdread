// Extra props for the outdoor natural levels (mountains, cyber mountain,
// desert, toxic swamp - see gen_mountain.js). Like natural.js, each prop is
// made of textured boxes on the texture role that fits the object:
//  - neonPylon: METAL mast, LIGHT bands and beacon (cyber)
//  - monolith: METAL slab with SCREEN panels (cyber data monolith)
//  - brokenColumn: PILLAR shaft on a TRIM plinth (desert ruins)
//  - reeds: FOLIAGE stalks with WOOD-brown heads (swamp, oasis)
//  - stump: WOOD; cairn / menhir: ROCK; swampTree: WOOD trunk, FOLIAGE canopy
//  - prayerPole: WOOD pole with LIGHT lamp (mountain shrines)
import { TS } from './common.js';
import { FACE } from './deco.js';
import { rockSpike } from './natural.js';

export function neonPylon(deco, x, z, y, h = 4, color = [0.3, 0.9, 1]) {
  deco.box(x - 0.2, y, z - 0.2, x + 0.2, y + 0.35, z + 0.2, TS.METAL);
  deco.box(x - 0.09, y + 0.35, z - 0.09, x + 0.09, y + h, z + 0.09, TS.METAL, { faces: FACE.SIDES });
  for (let k = 1; k <= 3; k++) {
    const yy = y + (h * k) / 4;
    deco.box(x - 0.13, yy, z - 0.13, x + 0.13, yy + 0.1, z + 0.13, TS.LIGHT, { emissive: 1, uv: 'fit' });
  }
  deco.box(x - 0.17, y + h, z - 0.17, x + 0.17, y + h + 0.32, z + 0.17, TS.LIGHT, { emissive: 1, uv: 'fit' });
  deco.collider(x - 0.2, y, z - 0.2, x + 0.2, y + h, z + 0.2);
  deco.light(x, y + h, z, color, 7, { pulse: true });
}

// dark slab with glowing screens on its two broad faces
export function monolith(deco, x, z, y, h = 3, alongX = true, color = [0.3, 0.9, 1]) {
  const a = alongX ? 0.75 : 0.2, b = alongX ? 0.2 : 0.75;
  deco.box(x - a, y, z - b, x + a, y + h, z + b, TS.METAL, { solid: true });
  const t = 0.03, m = 0.12;
  if (alongX) {
    deco.box(x - a + m, y + 0.4, z - b - t, x + a - m, y + h - m, z - b, TS.SCREEN, { uv: 'fit', emissive: 0.9 });
    deco.box(x - a + m, y + 0.4, z + b, x + a - m, y + h - m, z + b + t, TS.SCREEN, { uv: 'fit', emissive: 0.9 });
  } else {
    deco.box(x - a - t, y + 0.4, z - b + m, x - a, y + h - m, z + b - m, TS.SCREEN, { uv: 'fit', emissive: 0.9 });
    deco.box(x + a, y + 0.4, z - b + m, x + a + t, y + h - m, z + b - m, TS.SCREEN, { uv: 'fit', emissive: 0.9 });
  }
  deco.light(x, y + h * 0.6, z, color, 5.5);
}

// toppled / snapped column with a rubble block at its foot
export function brokenColumn(deco, x, z, y, h, o = {}) {
  const rng = deco.rng;
  deco.pillar(x, z, o.size ?? 0.6, y, y + h, { tex: TS.PILLAR, trimTex: TS.TRIM, capital: false });
  if (rng.chance(0.6)) {
    const ox = rng.sign() * 0.6, oz = rng.sign() * 0.45;
    deco.box(x + ox - 0.22, y, z + oz - 0.2, x + ox + 0.22, y + 0.32, z + oz + 0.2, TS.PILLAR);
  }
}

export function reeds(deco, x, z, y, n = 6) {
  const rng = deco.rng;
  for (let k = 0; k < n; k++) {
    const px = x + rng.float(-0.42, 0.42), pz = z + rng.float(-0.42, 0.42), h = rng.float(0.6, 1.45);
    deco.box(px - 0.025, y, pz - 0.025, px + 0.025, y + h, pz + 0.025, TS.FOLIAGE, { faces: FACE.SIDES | FACE.TOP });
    if (rng.chance(0.6)) deco.box(px - 0.05, y + h - 0.28, pz - 0.05, px + 0.05, y + h - 0.04, pz + 0.05, TS.WOOD, { lightMul: 0.7 });
  }
}

export function stump(deco, x, z, y, s = 1) {
  const r = 0.3 * s;
  deco.box(x - r, y, z - r, x + r, y + 0.5 * s, z + r, TS.WOOD);
  deco.box(x - r * 1.3, y, z - 0.08, x + r * 1.3, y + 0.14, z + 0.08, TS.WOOD, { lightMul: 0.7 });
  deco.collider(x - r, y, z - r, x + r, y + 0.5 * s, z + r, { obstacle: false });
}

export function cairn(deco, x, z, y) {
  const rng = deco.rng;
  let yy = y, r = rng.float(0.42, 0.5);
  for (let k = 0; k < 4; k++) {
    const h = r * rng.float(0.5, 0.7), ox = rng.float(-0.05, 0.05), oz = rng.float(-0.05, 0.05);
    deco.box(x + ox - r, yy, z + oz - r * 0.85, x + ox + r, yy + h, z + oz + r * 0.85, TS.ROCK, { s: 1.5 });
    yy += h; r *= 0.72;
  }
  deco.collider(x - 0.45, y, z - 0.4, x + 0.45, yy, z + 0.4);
}

// tall flat standing stone
export function menhir(deco, x, z, y, h, tex = TS.ROCK) {
  rockSpike(deco, x, z, y, h, deco.rng.float(0.45, 0.6), tex, { solid: true, segs: 3, flat: 0.55 });
}

// crooked swamp tree: leaning trunk, drooping canopy with hanging strands
export function swampTree(deco, x, z, y, s = 1) {
  const rng = deco.rng;
  const h = rng.float(3.2, 4.2) * s;
  let px = x, pz = z;
  const lx = rng.float(-0.12, 0.12), lz = rng.float(-0.12, 0.12);
  for (let k = 0; k < 4; k++) {
    const y0 = y + (h * k) / 4, r = 0.2 * s * (1 - k * 0.12);
    deco.box(px - r, y0, pz - r, px + r, y0 + h / 4 + 0.02, pz + r, TS.WOOD, { faces: FACE.SIDES });
    px += lx; pz += lz;
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rng.float(-0.4, 0.4), d = rng.float(0.4, 0.9) * s;
    const cx = px + Math.cos(a) * d, cz = pz + Math.sin(a) * d, r = rng.float(0.6, 0.9) * s;
    const cy = y + h - rng.float(0, 0.5);
    deco.box(cx - r, cy, cz - r, cx + r, cy + 0.6 * s, cz + r, TS.FOLIAGE, { s: 1.5 });
    for (let m = 0; m < 2; m++) {
      const sx = cx + rng.float(-r, r) * 0.8, sz = cz + rng.float(-r, r) * 0.8;
      deco.box(sx - 0.05, cy - rng.float(0.8, 1.6) * s, sz - 0.05, sx + 0.05, cy, sz + 0.05, TS.FOLIAGE, { faces: FACE.SIDES });
    }
  }
  deco.collider(x - 0.24 * s, y, z - 0.24 * s, x + 0.24 * s, y + h, z + 0.24 * s);
}

// shrine / waymark pole with a hanging lamp and cross arms
export function prayerPole(deco, x, z, y, color = [1, 0.75, 0.45]) {
  deco.box(x - 0.07, y, z - 0.07, x + 0.07, y + 3.0, z + 0.07, TS.WOOD, { faces: FACE.SIDES | FACE.TOP });
  deco.box(x - 0.6, y + 2.5, z - 0.04, x + 0.6, y + 2.6, z + 0.04, TS.WOOD);
  for (const s of [-1, 1]) deco.box(x + s * 0.55 - 0.08, y + 2.1, z - 0.08, x + s * 0.55 + 0.08, y + 2.45, z + 0.08, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.collider(x - 0.1, y, z - 0.1, x + 0.1, y + 3, z + 0.1, { obstacle: false });
  deco.light(x, y + 2.3, z, color, 6, { flicker: true });
}
