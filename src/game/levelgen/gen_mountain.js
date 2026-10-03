// Height-field terrain: mountain tops & climbs, cyber mountain, desert dunes, swamps.
import { TS, F, newGrid, encloseBorder, relaxHeights, clamp, quant, cellsInRadius } from './common.js';
import { tfbm } from '../../art/pixel.js';

export function genMountain(rng, theme, depth) {
  const p = theme.params || {};
  const W = Math.round(clamp(60 + depth * 0.6, 60, 90)), H = Math.round(W * 0.8);
  const g = newGrid(W, H, 14);
  const seed = rng.int(0, 9999);
  const amp = p.height ?? 4;
  const light = Math.max(0.8, theme.light ?? 0.9);
  const cliffs = theme.void === 'clouds' || theme.void === 'digital';
  const VOID_Y = -30;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const edge = Math.min(x, z, W - 1 - x, H - 1 - z);
    let hgt = tfbm(x / 16, z / 16, 64, seed, 4) * amp;
    if (p.climb) hgt += (x / W) * amp * 1.2;
    if (p.peaks) hgt += Math.max(0, 1 - Math.hypot(x - W * 0.55, z - H * 0.5) / (W * 0.35)) * amp;
    if (p.dunes) hgt = (Math.sin(x * 0.25 + tfbm(x / 10, z / 10, 64, seed + 1, 2) * 6) * 0.5 + 0.5) * amp;
    hgt = quant(hgt, 0.5);
    if (cliffs && edge < 3) { g.open(x, z, VOID_Y, 3, { sky: true, light, flags: F.VOID }); continue; }
    g.open(x, z, hgt, hgt + 6, { sky: true, light, floorTex: tfbm(x / 6, z / 6, 64, seed + 4, 2) > 0.55 ? TS.FLOOR2 : TS.FLOOR, wallTex: TS.SIDE });
  }
  relaxHeights(g, 1.0, 10);
  // guaranteed walking path from start to end with gentle steps
  let x = 4, z = Math.round(H / 2);
  const path = [];
  while (x < W - 14) {
    path.push([x, z]);
    if (rng.chance(0.7)) x++; else z = clamp(z + rng.sign(), 5, H - 6);
  }
  let prevH = g.floor[g.idx(path[0][0], path[0][1])];
  for (const [px, pz] of path) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const i = g.idx(px + dx, pz + dz);
      if (!g.type[i] || (g.flags[i] & F.VOID)) continue;
      const target = g.floor[i];
      g.floor[i] = clamp(target, prevH - 0.5, prevH + 0.5);
    }
    prevH = g.floor[g.idx(px, pz)];
  }
  // boulders & dead trees spots
  for (let k = 0; k < Math.floor(W * H / 90); k++) {
    const bx = rng.int(4, W - 5), bz = rng.int(4, H - 5), i = g.idx(bx, bz);
    if (!g.type[i] || (g.flags[i] & F.VOID)) continue;
    if (path.some(([px, pz]) => Math.abs(px - bx) <= 1 && Math.abs(pz - bz) <= 1)) continue;
    const s = rng.int(1, 2);
    g.rect(bx, bz, s, s, (cx, cz, j) => { if (g.type[j] && !(g.flags[j] & F.VOID)) g.solid(cx, cz, g.floor[j] + rng.float(1.5, 3), TS.WALL); });
  }
  // swamp / snow melt pools
  if (theme.hazard) {
    for (let i = 0; i < W * H; i++) {
      if (!g.type[i] || (g.flags[i] & F.VOID)) continue;
      const cx = i % W, cz = (i / W) | 0;
      if (tfbm(cx / 9, cz / 9, 64, seed + 77, 3) > 0.62 && !path.some(([px, pz]) => Math.abs(px - cx) <= 1 && Math.abs(pz - cz) <= 1)) {
        g.flags[i] |= F.HAZARD; g.floorTex[i] = TS.HAZARD; g.floor[i] -= 0.25;
      }
    }
  }
  encloseBorder(g);
  // plateau arena at the path end
  const [ex, ez] = path[path.length - 1];
  const eh = g.floor[g.idx(ex, ez)];
  const arena = cellsInRadius(g, ex + 7, ez, 7, (i, cx, cz) => cx > 1 && cz > 1 && cx < W - 2 && cz < H - 2);
  for (const i of arena) {
    const cx = i % W, cz = (i / W) | 0;
    g.open(cx, cz, eh, eh + 6, { sky: true, light, floorTex: TS.FLOOR2, wallTex: TS.SIDE });
    g.flags[i] = F.ARENA;
  }
  for (let cx = ex; cx <= ex + 1; cx++) { const i = g.idx(cx, ez); g.open(cx, ez, eh, eh + 6, { sky: true, light, floorTex: TS.FLOOR }); g.flags[i] &= ~(F.VOID | F.HAZARD); }
  const si = g.idx(path[0][0], path[0][1]);
  g.flags[si] &= ~F.HAZARD;
  return { grid: g, start: { x: path[0][0], z: path[0][1] }, arenaCells: arena, boss: { x: ex + 7, z: ez }, voidY: VOID_Y };
}
