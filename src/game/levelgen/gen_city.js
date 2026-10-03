// City blocks: ruined city/town/village, downtown, cyber traffic jam,
// necropolis, graveyards, harbours, jungle ruins, desert ruins.
import { TS, F, newGrid, encloseBorder, clamp } from './common.js';

export function genCity(rng, theme, depth) {
  const p = theme.params || {};
  const W = Math.round(clamp(50 + depth * 0.7, 50, 80));
  const H = Math.round(W * rng.float(0.75, 1.0));
  const g = newGrid(W, H, 12);
  const village = !!p.village;
  const sw = village ? rng.int(2, 3) : p.dense ? 4 : 3;      // street width
  const lightOut = Math.max(0.8, theme.light ?? 0.85);
  // everything starts as street
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    g.open(x, z, 0, 3, { sky: true, light: lightOut, floorTex: TS.FLOOR, region: -2 });
  }
  // block grid
  const xs = [1], zs = [1];
  while (xs[xs.length - 1] < W - 10) xs.push(xs[xs.length - 1] + sw + rng.int(village ? 5 : 7, village ? 9 : 12));
  while (zs[zs.length - 1] < H - 10) zs.push(zs[zs.length - 1] + sw + rng.int(village ? 5 : 7, village ? 9 : 12));
  const blocks = [];
  for (let bz = 0; bz < zs.length - 1; bz++) for (let bx = 0; bx < xs.length - 1; bx++) {
    const x0 = xs[bx] + sw, z0 = zs[bz] + sw, x1 = xs[bx + 1], z1 = zs[bz + 1];
    if (x1 - x0 < 4 || z1 - z0 < 4) continue;
    blocks.push({ x: x0, z: z0, w: x1 - x0, h: z1 - z0, bx, bz });
  }
  // farthest block from the start corner becomes the boss plaza
  blocks.sort((a, b) => (b.x + b.z) - (a.x + a.z));
  const plaza = blocks[0];
  const ruin = p.ruin ?? 0.3;
  const tall = p.tall ?? 0.5;

  for (const b of blocks) {
    // sidewalk ring
    g.rect(b.x, b.z, b.w, b.h, (x, z, i) => { g.floor[i] = village ? 0 : 0.15; g.floorTex[i] = TS.FLOOR2; g.wallTex[i] = TS.SIDE; });
    if (b === plaza) { b.plaza = true; continue; }
    if (village || p.tombs) {
      // several small houses / tombs / mausoleums in a yard
      const tries = Math.floor(b.w * b.h / 12);
      for (let k = 0; k < tries; k++) {
        const tomb = p.tombs && rng.chance(0.6);
        const w = tomb ? rng.int(1, 2) : rng.int(3, 5), h = tomb ? rng.int(2, 3) - (w > 1 ? 1 : 0) : rng.int(3, 5);
        const x = rng.int(b.x + 1, b.x + b.w - w - 1), z = rng.int(b.z + 1, b.z + b.h - h - 1);
        let free = true;
        g.rect(x - 1, z - 1, w + 2, h + 2, (cx, cz, i) => { if (!g.type[i] || g.floor[i] > 0.2) free = false; });
        if (!free) continue;
        if (tomb) {
          g.rect(x, z, w, h, (cx, cz, i) => { g.floor[i] = rng.pick([0.75, 1.0, 1.25]); g.wallTex[i] = TS.ACCENT; g.floorTex[i] = TS.ACCENT; });
        } else {
          house(x, z, w, h, rng.pick([2.5, 3, 3.5]));
        }
      }
      continue;
    }
    // one or two buildings per block
    const split = b.w > 9 && rng.chance(0.5);
    const parts = split ? [{ x: b.x + 1, z: b.z + 1, w: Math.floor(b.w / 2) - 1, h: b.h - 2 }, { x: b.x + Math.floor(b.w / 2) + 1, z: b.z + 1, w: b.w - Math.floor(b.w / 2) - 2, h: b.h - 2 }]
      : [{ x: b.x + 1, z: b.z + 1, w: b.w - 2, h: b.h - 2 }];
    for (const r of parts) {
      if (r.w < 3 || r.h < 3) continue;
      const top = Math.round(3 + rng.float(2, 18) * tall);
      if (rng.chance(0.35) && r.w >= 5 && r.h >= 5) house(r.x, r.z, r.w, r.h, 3, top);
      else g.rect(r.x, r.z, r.w, r.h, (x, z) => g.solid(x, z, top, rng.chance(0.25) ? TS.WALL2 : TS.WALL));
    }
  }

  function house(x, z, w, h, ceil, top = ceil + 0.6) {
    // walls
    g.rect(x, z, w, h, (cx, cz, i) => {
      const edge = cx === x || cz === z || cx === x + w - 1 || cz === z + h - 1;
      if (edge) g.solid(cx, cz, top, rng.chance(0.3) ? TS.WALL2 : TS.WALL);
      else g.open(cx, cz, 0, ceil, { sky: false, light: (theme.light ?? 0.7) * 0.8, floorTex: TS.FLOOR2, ceilTex: TS.CEIL, region: -3 });
    });
    // doorways on random sides
    const sides = rng.shuffle([0, 1, 2, 3]).slice(0, rng.int(1, 3));
    for (const s of sides) {
      let dx, dz;
      if (s === 0) { dx = rng.int(x + 1, x + w - 2); dz = z; }
      if (s === 1) { dx = rng.int(x + 1, x + w - 2); dz = z + h - 1; }
      if (s === 2) { dx = x; dz = rng.int(z + 1, z + h - 2); }
      if (s === 3) { dx = x + w - 1; dz = rng.int(z + 1, z + h - 2); }
      g.open(dx, dz, 0, Math.min(ceil, 2.6), { sky: false, light: 0.6, floorTex: TS.FLOOR2, ceilTex: TS.CEIL });
    }
  }

  // ruin pass: rubble, holes and craters
  if (ruin > 0) {
    for (let k = 0; k < Math.floor(W * H * 0.02 * ruin); k++) {
      const x = rng.int(2, W - 3), z = rng.int(2, H - 3), i = g.idx(x, z);
      const r = rng.int(1, 2);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const cx = x + dx, cz = z + dz;
        if (cx < 2 || cz < 2 || cx > W - 3 || cz > H - 3) continue;
        const j = g.idx(cx, cz);
        if (g.region[j] === -3) continue; // keep interiors intact
        if (g.type[j] === 0) { if (rng.chance(0.6)) g.open(cx, cz, rng.pick([0.5, 0.75, 1.0]), 3, { sky: true, light: lightOut, floorTex: TS.SIDE }); }
        else if (rng.chance(0.35)) { g.floor[j] = rng.pick([0.25, 0.5, 0.75]); g.floorTex[j] = TS.SIDE; g.wallTex[j] = TS.SIDE; }
      }
      if (g.type[i] && rng.chance(0.3)) { g.floor[i] = -0.5; g.wallTex[i] = TS.SIDE; } // crater
    }
  }
  // cars / debris on streets
  const carChance = p.cars ?? (village ? 0 : 0.12);
  if (carChance > 0) {
    for (let z = 2; z < H - 3; z++) for (let x = 2; x < W - 3; x++) {
      const i = g.idx(x, z);
      if (!g.type[i] || g.region[i] !== -2 || g.floor[i] !== 0 || !rng.chance(carChance * 0.12)) continue;
      const horiz = rng.chance(0.5), cw = horiz ? 2 : 1, ch = horiz ? 1 : 2;
      let free = true;
      g.rect(x, z, cw, ch, (cx, cz, j) => { if (!g.type[j] || g.floor[j] !== 0 || g.region[j] !== -2) free = false; });
      if (!free) continue;
      const hgt = rng.pick([0.75, 0.75, 1.0, 1.5]);
      g.rect(x, z, cw, ch, (cx, cz, j) => { g.floor[j] = hgt; g.wallTex[j] = TS.ACCENT; g.floorTex[j] = TS.ACCENT; g.region[j] = -4; });
    }
  }
  // harbour: the far side of the map is water
  if (p.docks) {
    for (let z = 1; z < H - 1; z++) for (let x = W - 8; x < W - 1; x++) {
      const i = g.idx(x, z);
      if (z % 7 === 3 && x < W - 2) { g.open(x, z, 0, 3, { sky: true, light: lightOut, floorTex: TS.FLOOR, flags: F.BRIDGE }); continue; }
      g.open(x, z, -6, 3, { sky: true, light: lightOut, flags: F.VOID });
    }
  }
  encloseBorder(g);
  for (let x = 0; x < W; x++) { g.floor[g.idx(x, 0)] = 20; g.floor[g.idx(x, H - 1)] = 20; }
  for (let z = 0; z < H; z++) { g.floor[g.idx(0, z)] = 20; g.floor[g.idx(W - 1, z)] = 20; }

  const arena = [];
  g.rect(plaza.x, plaza.z, plaza.w, plaza.h, (x, z, i) => {
    g.open(x, z, 0.15, 4, { sky: true, light: lightOut, floorTex: TS.FLOOR2 });
    g.flags[i] |= F.ARENA; arena.push(i);
  });
  return { grid: g, start: { x: 2, z: 2 }, arenaCells: arena, boss: { x: plaza.x + plaza.w / 2, z: plaza.z + plaza.h / 2 } };
}
