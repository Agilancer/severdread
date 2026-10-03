// Winding canyons with tall rock walls, ledges and (optionally) chasms
// crossed by rope bridges.
import { TS, F, newGrid, encloseBorder, relaxHeights, clamp, quant, cellsInRadius } from './common.js';
import { tfbm } from '../../art/pixel.js';

export function genCanyon(rng, theme, depth) {
  const p = theme.params || {};
  const W = Math.round(clamp(70 + depth, 70, 110)), H = Math.round(clamp(46 + depth * 0.4, 46, 64));
  const g = newGrid(W, H, 12);
  const seed = rng.int(0, 9999);
  const light = Math.max(0.8, theme.light ?? 0.9);
  // rock everywhere with varied tall tops
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) g.solid(x, z, 8 + tfbm(x / 8, z / 8, 64, seed, 3) * 10, rng.chance(0.2) ? TS.WALL2 : TS.WALL);
  // winding path
  let x = 3, z = H / 2, width = 5, y = 0;
  const path = [];
  let dir = 0;
  while (x < W - 14) {
    path.push({ x, z, width, y });
    dir = clamp(dir + rng.float(-0.35, 0.35), -0.9, 0.9);
    x += 1;
    z = clamp(z + Math.sin(dir) * 1.2, 7, H - 8);
    width = clamp(width + rng.int(-1, 1), 3, 8);
    if (rng.chance(0.12)) y = clamp(y + rng.pick([-0.5, 0.5, 0.25, -0.25, 1.0]), -2, 6);
  }
  for (const s of path) {
    const cells = cellsInRadius(g, s.x, s.z, s.width / 2 + 0.5);
    for (const i of cells) {
      const cx = i % W, cz = (i / W) | 0;
      if (cx < 1 || cz < 1 || cx >= W - 1 || cz >= H - 1) continue;
      const f = quant(s.y + (tfbm(cx / 6, cz / 6, 64, seed + 5, 2) - 0.5) * 0.8, 0.25);
      if (g.type[i] && g.floor[i] >= f) continue;
      g.open(cx, cz, f, f + 5, { sky: true, light, floorTex: tfbm(cx / 5, cz / 5, 64, seed + 9, 2) > 0.6 ? TS.FLOOR2 : TS.FLOOR, wallTex: TS.SIDE, region: 0 });
    }
  }
  // side alcoves / ledges
  for (let k = 0; k < Math.floor(path.length / 10); k++) {
    const s = rng.pick(path);
    const side = rng.sign();
    const cz = Math.round(s.z + side * (s.width / 2 + 2));
    const ledge = cellsInRadius(g, s.x, cz, rng.int(2, 3));
    for (const i of ledge) {
      const cx = i % W, czz = (i / W) | 0;
      if (cx < 1 || czz < 1 || cx >= W - 1 || czz >= H - 1 || g.type[i]) continue;
      g.open(cx, czz, quant(s.y + rng.pick([0.5, 1.0]), 0.25), s.y + 5, { sky: true, light, floorTex: TS.FLOOR2, wallTex: TS.SIDE, region: 2 });
    }
  }
  relaxHeights(g, 0.5, 8);
  // chasms with bridges
  if (p.chasms) {
    for (let k = 4; k < path.length - 10; k += rng.int(12, 20)) {
      const s = path[k];
      const len = rng.int(3, 5);
      for (let d = 0; d < len; d++) {
        const ps = path[Math.min(path.length - 1, k + d)];
        for (const i of cellsInRadius(g, ps.x, ps.z, ps.width / 2 + 0.5)) {
          if (!g.type[i]) continue;
          g.flags[i] |= F.VOID; g.floor[i] = -30;
        }
      }
      // bridge along the centre line (4-connected so it is walkable)
      let px = null, pz = null;
      const lay = (bx, bz) => {
        const i = g.idx(bx, bz);
        g.open(bx, bz, quant(s.y, 0.25), s.y + 5, { sky: true, light, floorTex: TS.ACCENT, wallTex: TS.SIDE, flags: F.BRIDGE });
        g.flags[i] &= ~F.VOID;
      };
      for (let d = -2; d <= len + 1; d++) {
        const ps = path[Math.min(path.length - 1, Math.max(0, k + d))];
        const bx = Math.round(ps.x), bz = Math.round(ps.z);
        if (px !== null) { let cz = pz; while (cz !== bz) { cz += Math.sign(bz - cz); lay(px, cz); } }
        lay(bx, bz);
        px = bx; pz = bz;
      }
    }
  }
  encloseBorder(g);
  // arena basin at the end
  const end = path[path.length - 1];
  const arena = cellsInRadius(g, end.x + 6, end.z, 7, (i, cx, cz) => cx > 0 && cz > 0 && cx < W - 1 && cz < H - 1);
  for (const i of arena) {
    const cx = i % W, cz = (i / W) | 0;
    g.open(cx, cz, end.y, end.y + 6, { sky: true, light, floorTex: TS.FLOOR2, wallTex: TS.SIDE, region: 1 });
    g.flags[i] = F.ARENA;
  }
  // connect end of path to arena
  for (let cx = Math.round(end.x); cx <= Math.round(end.x + 2); cx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const cz = Math.round(end.z) + dz;
      const i = g.idx(cx, cz);
      if (!g.type[i] || (g.flags[i] & F.VOID)) g.open(cx, cz, end.y, end.y + 5, { sky: true, light, floorTex: TS.FLOOR, wallTex: TS.SIDE });
      g.flags[i] &= ~F.VOID;
    }
  }
  return { grid: g, start: { x: 3, z: Math.round(path[0].z) }, arenaCells: arena, boss: { x: end.x + 6, z: end.z }, voidY: -30, jumpGap: 2 };
}
