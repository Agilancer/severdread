// Cellular-automata caverns: caves, hell, volcanoes, crystal & ice caves, mines.
import { TS, F, newGrid, encloseBorder, relaxHeights, clamp, quant, cellsInRadius } from './common.js';
import { tfbm } from '../../art/pixel.js';

export function genCaves(rng, theme, depth) {
  const p = theme.params || {};
  const W = Math.round(clamp(48 + depth * 0.6, 48, 76));
  const H = Math.round(W * rng.float(0.7, 0.95));
  const g = newGrid(W, H, 8);
  const n = W * H;
  let cells = new Uint8Array(n);
  for (let i = 0; i < n; i++) cells[i] = rng.chance(0.46) ? 1 : 0; // 1 = rock
  const at = (c, x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 1 : c[z * W + x]);
  for (let it = 0; it < 5; it++) {
    const next = new Uint8Array(n);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      let k = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) k += at(cells, x + dx, z + dz);
      next[z * W + x] = k >= 5 ? 1 : (it < 2 && k <= 1 ? 1 : 0);
    }
    cells = next;
  }
  // carve a guaranteed winding spine so the cave spans the map
  let sx = 3, sz = Math.floor(H / 2);
  const spine = [];
  while (sx < W - 4) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (sz + dz > 0 && sz + dz < H - 1) cells[(sz + dz) * W + sx + dx] = 0;
    spine.push([sx, sz]);
    sx += 1;
    sz = clamp(sz + rng.int(-1, 1), 3, H - 4);
  }
  // keep the largest open region (flood fill)
  const regionOf = new Int32Array(n).fill(-1);
  let bestR = -1, bestSize = 0, rid = 0;
  for (let i = 0; i < n; i++) {
    if (cells[i] || regionOf[i] >= 0) continue;
    const stack = [i]; regionOf[i] = rid; let size = 0;
    while (stack.length) {
      const c = stack.pop(); size++;
      const x = c % W, z = (c / W) | 0;
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const j = nz * W + nx;
        if (!cells[j] && regionOf[j] < 0) { regionOf[j] = rid; stack.push(j); }
      }
    }
    if (size > bestSize) { bestSize = size; bestR = rid; }
    rid++;
  }
  const seed = rng.int(0, 99999);
  const amp = p.open ? 2.0 : 1.5;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = z * W + x;
    if (cells[i] || regionOf[i] !== bestR) continue;
    const hgt = quant(tfbm(x / 14, z / 14, 64, seed, 3) * amp * 2 - amp * 0.6, 0.25);
    const ceilH = 2.6 + tfbm(x / 9, z / 9, 64, seed + 7, 3) * 3.5;
    const sky = p.open && tfbm(x / 20, z / 20, 64, seed + 13, 2) > 0.52;
    const light = clamp((theme.light ?? 0.6) + (tfbm(x / 10, z / 10, 64, seed + 21, 2) - 0.5) * (theme.lightVar ?? 0.3) * 2, 0.15, 1.1);
    g.open(x, z, hgt, hgt + ceilH, { sky, light, floorTex: tfbm(x / 7, z / 7, 64, seed + 3, 2) > 0.55 ? TS.FLOOR2 : TS.FLOOR, region: 0 });
    g.wallTex[i] = TS.SIDE;
  }
  // rock walls get variety
  for (let i = 0; i < n; i++) if (g.type[i] === 0) { g.wallTex[i] = rng.chance(0.15) ? TS.WALL2 : TS.WALL; g.floor[i] = 6 + rng.float(0, 4); }
  relaxHeights(g, 0.5);
  // hazard pools in the lowest areas
  const hazardFrac = p.lavaPools ?? (theme.hazard ? 0.06 : 0);
  if (hazardFrac > 0) {
    const open = [];
    for (let i = 0; i < n; i++) if (g.type[i]) open.push(i);
    open.sort((a, b) => g.floor[a] - g.floor[b]);
    const count = Math.floor(open.length * hazardFrac);
    for (let k = 0; k < count; k++) {
      const i = open[k];
      g.flags[i] |= F.HAZARD; g.floorTex[i] = TS.HAZARD; g.floor[i] -= 0.25;
    }
  }
  // stalagmite columns
  for (let k = 0; k < Math.floor(W * H / 120); k++) {
    const x = rng.int(2, W - 3), z = rng.int(2, H - 3), i = g.idx(x, z);
    if (g.type[i] && !(g.flags[i] & F.HAZARD)) {
      let ok = true;
      for (const [nx, nz] of g.neighbors(x, z)) if (!g.isOpen(nx, nz)) ok = false;
      if (ok) g.solid(x, z, g.floor[i] + 5, TS.WALL);
    }
  }
  encloseBorder(g);

  // start at the left end of the spine, boss arena carved at the right end
  const [stx, stz] = spine[1];
  const [ex, ez] = spine[spine.length - 3];
  const ar = 6;
  const arenaFloor = 0;
  const arena = cellsInRadius(g, ex - ar + 1, ez, ar, (i, x, z) => x > 0 && z > 0 && x < W - 1 && z < H - 1);
  for (const i of arena) {
    const x = i % W, z = (i / W) | 0;
    g.open(x, z, arenaFloor, arenaFloor + 6, { sky: !!p.open, light: Math.max(0.6, theme.light ?? 0.6), floorTex: TS.FLOOR2, region: 1 });
    g.flags[i] &= ~F.HAZARD; g.flags[i] |= F.ARENA;
  }
  // smooth the approach into the arena
  relaxHeights(g, 0.5, 4);
  g.open(stx, stz, g.floor[g.idx(stx, stz)], g.ceil[g.idx(stx, stz)], {});
  g.flags[g.idx(stx, stz)] &= ~F.HAZARD;
  return { grid: g, start: { x: stx, z: stz }, arenaCells: arena, boss: { x: ex - ar + 1, z: ez } };
}
