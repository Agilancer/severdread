// Platforms over a void: skyscraper rooftops with bridges, floating islands
// (heaven, afterlife, digital void, sky fortress), oil rigs, orbital rings.
import { TS, F, newGrid, clamp, quant } from './common.js';
import { tfbm } from '../../art/pixel.js';

export function genPlatforms(rng, theme, depth) {
  const p = theme.params || {};
  const islands = theme.archetype === 'islands';
  const W = Math.round(clamp(54 + depth * 0.6, 54, 84)), H = Math.round(W * 0.85);
  const VOID_Y = islands ? -24 : -36;
  const g = newGrid(W, H, 8);
  const light = Math.max(0.8, theme.light ?? 0.85);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) g.open(x, z, VOID_Y, 3, { sky: true, light, flags: F.VOID });

  const plats = [];
  const seed = rng.int(0, 9999);
  function platform(cx, cz, w, h, y, big = false) {
    const x0 = Math.round(cx - w / 2), z0 = Math.round(cz - h / 2);
    const cells = [];
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
      if (x < 2 || z < 2 || x >= W - 2 || z >= H - 2) continue;
      if (islands) {
        const dx = (x + 0.5 - cx) / (w / 2), dz = (z + 0.5 - cz) / (h / 2);
        if (dx * dx + dz * dz > 0.75 + tfbm(x / 5, z / 5, 64, seed, 2) * 0.5) continue;
      }
      const i = g.idx(x, z);
      g.open(x, z, y, y + 3, { sky: true, light, floorTex: TS.FLOOR, wallTex: islands ? TS.SIDE : TS.WALL });
      g.flags[i] &= ~F.VOID;
      cells.push(i);
    }
    const pl = { cx, cz, w, h, y, cells, x0, z0 };
    plats.push(pl);
    return pl;
  }
  function bridge(a, b) {
    // straight-ish bridge between platform centres (L-shape), 1 wide
    let x = Math.round(a.cx), z = Math.round(a.cz);
    const tx = Math.round(b.cx), tz = Math.round(b.cz);
    const path = [];
    const horizFirst = Math.abs(tx - x) > Math.abs(tz - z);
    const stepTo = (axis) => {
      if (axis === 'x') while (x !== tx) { x += Math.sign(tx - x); path.push([x, z]); }
      else while (z !== tz) { z += Math.sign(tz - z); path.push([x, z]); }
    };
    if (horizFirst) { stepTo('x'); stepTo('z'); } else { stepTo('z'); stepTo('x'); }
    const voidCells = path.filter(([px, pz]) => g.flags[g.idx(px, pz)] & F.VOID);
    const n = voidCells.length;
    voidCells.forEach(([px, pz], k) => {
      const t = n > 1 ? k / (n - 1) : 0.5;
      const y = quant(a.y + (b.y - a.y) * t, 0.25);
      const i = g.idx(px, pz);
      g.open(px, pz, y, y + 3, { sky: true, light, floorTex: TS.FLOOR2, wallTex: TS.SIDE, flags: F.BRIDGE });
      g.flags[i] &= ~F.VOID;
    });
  }
  function jumpGap(a, b) {
    // leave a 2-cell gap: connect with stubs from each side
    bridge(a, b);
    // knock out a pair of bridge cells in the middle (only if heights similar)
    if (Math.abs(a.y - b.y) > 0.5) return;
    const mx = Math.round((a.cx + b.cx) / 2), mz = Math.round((a.cz + b.cz) / 2);
    for (const [x, z] of [[mx, mz], [mx + Math.sign(b.cx - a.cx), mz + (Math.abs(b.cx - a.cx) < 1 ? Math.sign(b.cz - a.cz) : 0)]]) {
      const i = g.idx(x, z);
      if (g.flags[i] & F.BRIDGE) { g.flags[i] = F.VOID; g.floor[i] = VOID_Y; }
    }
  }

  // main chain from left to right
  let y = 0;
  const first = platform(6, H / 2, 7, 7, y);
  let prev = first;
  const mainChain = [first];
  let cx = 6, cz = H / 2;
  while (cx < W - 18) {
    const w = rng.int(5, islands ? 11 : 9), h = rng.int(5, islands ? 11 : 9);
    const gap = rng.int(3, 6);
    cx += prev.w / 2 + gap + w / 2;
    cz = clamp(cz + rng.int(-10, 10), 8, H - 8);
    y = clamp(y + rng.pick([-1, -0.5, 0, 0.5, 1, 1.5]), -3, 8);
    const pl = platform(cx, cz, w, h, y);
    if (rng.chance(0.35) && Math.abs(pl.y - prev.y) <= 0.5) jumpGap(prev, pl); else bridge(prev, pl);
    mainChain.push(pl);
    prev = pl;
  }
  // boss platform
  const bw = islands ? 14 : 12;
  const bossPl = platform(W - bw / 2 - 3, clamp(cz, bw / 2 + 2, H - bw / 2 - 2), bw, bw, y);
  bridge(prev, bossPl);
  bossPl.cells.forEach((i) => { g.flags[i] |= F.ARENA; g.floorTex[i] = TS.FLOOR2; });
  // side branches with loot
  for (let k = 0; k < Math.floor(mainChain.length * 0.8); k++) {
    const from = rng.pick(mainChain);
    const dir = rng.chance(0.5) ? -1 : 1;
    const bz = clamp(from.cz + dir * rng.int(10, 15), 6, H - 6);
    const bx = clamp(from.cx + rng.int(-6, 6), 6, W - 16);
    const pl = platform(bx, bz, rng.int(4, 7), rng.int(4, 7), clamp(from.y + rng.pick([-1, 0, 0.5, 1]), -3, 8));
    if (rng.chance(0.3) && Math.abs(pl.y - from.y) <= 0.5) jumpGap(from, pl); else bridge(from, pl);
  }
  // rooftop clutter: AC units, sheds, pillars
  for (const pl of plats) {
    if (pl === first || pl === bossPl) continue;
    for (let k = 0; k < Math.floor(pl.cells.length / 14); k++) {
      const i = rng.pick(pl.cells), x = i % W, z = (i / W) | 0;
      let interior = true;
      for (const [nx, nz] of g.neighbors(x, z)) { const j = g.idx(nx, nz); if ((g.flags[j] & (F.VOID | F.BRIDGE)) || !g.type[j]) interior = false; }
      if (!interior) continue;
      if (islands) g.solid(x, z, g.floor[i] + 3.5, TS.ACCENT);           // pillar
      else if (rng.chance(0.6)) { g.floor[i] += 0.75; g.wallTex[i] = TS.ACCENT; g.floorTex[i] = TS.ACCENT; } // AC unit
      else g.solid(x, z, g.floor[i] + 2.5, TS.WALL2);                    // shed
    }
  }
  return { grid: g, start: { x: 6, z: Math.floor(H / 2) }, arenaCells: bossPl.cells, boss: { x: bossPl.cx, z: bossPl.cz }, voidY: VOID_Y, noFortify: true, jumpGap: 2 };
}
