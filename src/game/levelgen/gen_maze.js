// Mazes: the Back Rooms, sewers, subway tunnels, data cores, prisons, dream maze.
import { TS, F, newGrid, carveRect, encloseBorder, clamp } from './common.js';

export function genMaze(rng, theme, depth) {
  const p = theme.params || {};
  const light = theme.light ?? 0.7, lv = theme.lightVar ?? 0.25;
  if (p.office) return backrooms(rng, theme, depth);
  const cell = p.tunnels ? 4 : 3;               // maze cell pitch (corridor = cell-1 wide)
  const MW = Math.round(clamp(12 + depth * 0.25, 12, 22)), MH = Math.round(MW * 0.8);
  const W = MW * cell + 1, H = MH * cell + 1;
  const g = newGrid(W, H, 6);
  const visited = new Uint8Array(MW * MH);
  const ceil = p.tunnels ? 4 : 3;
  const carveCell = (mx, mz) => carveRect(g, mx * cell + 1, mz * cell + 1, cell - 1, cell - 1, { floor: 0, ceil, light: clamp(light + rng.float(-lv, lv), 0.15, 1.1), floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  const stack = [[0, Math.floor(MH / 2)]];
  visited[stack[0][1] * MW] = 1;
  carveCell(0, Math.floor(MH / 2));
  while (stack.length) {
    const [mx, mz] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [mx + dx, mz + dz, dx, dz]).filter(([x, z]) => x >= 0 && z >= 0 && x < MW && z < MH && !visited[z * MW + x]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, nz, dx, dz] = rng.pick(nb);
    visited[nz * MW + nx] = 1;
    carveCell(nx, nz);
    // knock through the wall between
    const wx = mx * cell + 1 + (dx > 0 ? cell - 1 : dx < 0 ? -1 : 0), wz = mz * cell + 1 + (dz > 0 ? cell - 1 : dz < 0 ? -1 : 0);
    for (let k = 0; k < cell - 1; k++) {
      const cx = dx ? wx : wx + k, cz = dz ? wz : wz + k;
      g.open(cx, cz, 0, ceil, { light, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
    }
    stack.push([nx, nz]);
  }
  // loops
  for (let k = 0; k < MW * MH * 0.12; k++) {
    const x = rng.int(2, W - 3), z = rng.int(2, H - 3), i = g.idx(x, z);
    if (g.type[i]) continue;
    if ((g.isOpen(x - 1, z) && g.isOpen(x + 1, z) && !g.isOpen(x, z - 1) && !g.isOpen(x, z + 1)) || (g.isOpen(x, z - 1) && g.isOpen(x, z + 1) && !g.isOpen(x - 1, z) && !g.isOpen(x + 1, z))) {
      g.open(x, z, 0, ceil, { light, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
    }
  }
  // themed dressing
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = g.idx(x, z);
    if (!g.type[i]) { g.wallTex[i] = rng.chance(p.racks ? 0.5 : 0.15) ? TS.WALL2 : TS.WALL; continue; }
    if (p.channels && x % cell === 2 && z % cell !== 0 && rng.chance(0.7)) { g.floor[i] = -0.6; g.flags[i] |= F.HAZARD; g.floorTex[i] = TS.HAZARD; g.wallTex[i] = TS.SIDE; }
    if (p.tunnels && z % cell === 1 && rng.chance(0.6)) { g.floor[i] = 0.75; g.floorTex[i] = TS.FLOOR2; g.wallTex[i] = TS.SIDE; } // platforms
    if (theme.hazard === 'water' && p.tunnels && z % cell === 3 && rng.chance(0.4)) { g.flags[i] |= F.WATER; g.floorTex[i] = TS.HAZARD; g.floor[i] = -0.2; g.wallTex[i] = TS.SIDE; }
  }
  // rooms carved in for combat space
  const rooms = [];
  for (let k = 0; k < Math.floor(MW * MH / 30); k++) {
    const w = rng.int(5, 9), h = rng.int(5, 8);
    const x = rng.int(3, W - w - 3), z = rng.int(3, H - h - 3);
    carveRect(g, x, z, w, h, { floor: 0, ceil: ceil + 1, light: clamp(light + rng.float(-lv, lv), 0.15, 1.1), floorTex: TS.FLOOR2, ceilTex: TS.CEIL, region: rooms.length });
    rooms.push({ x, z, w, h });
    if (p.cells) { // prison cells along a room wall
      for (let cx = x; cx < x + w - 1; cx += 3) g.solid(cx, z + 1, ceil + 1, TS.WALL2);
    }
  }
  // boss chamber at the far right
  const bw = 11, bh = 11, bx = W - bw - 2, bz = Math.round(H / 2 - bh / 2);
  const arena = [];
  carveRect(g, bx, bz, bw, bh, { floor: 0, ceil: ceil + 3, light: Math.max(0.6, light), floorTex: TS.FLOOR2, ceilTex: TS.CEIL });
  g.rect(bx, bz, bw, bh, (x, z, i) => { g.flags[i] |= F.ARENA; arena.push(i); });
  // make sure the chamber connects to the maze
  for (let x = bx - 4; x < bx; x++) g.open(x, Math.round(H / 2), 0, ceil, { light, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  encloseBorder(g);
  return { grid: g, rooms, start: { x: 2, z: Math.floor(MH / 2) * cell + 2 }, arenaCells: arena, boss: { x: bx + bw / 2, z: bz + bh / 2 } };
}

// The Back Rooms: endless yellow office space with random partition walls.
function backrooms(rng, theme, depth) {
  const W = Math.round(clamp(50 + depth * 0.6, 50, 80)), H = Math.round(W * 0.8);
  const g = newGrid(W, H, 3);
  const light = theme.light ?? 0.95;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    g.open(x, z, 0, 2.75, { light: light + rng.float(-0.06, 0.04), floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  }
  // partition walls
  for (let k = 0; k < W * H / 14; k++) {
    const x = rng.int(2, W - 3), z = rng.int(2, H - 3), len = rng.int(2, 7), horiz = rng.chance(0.5);
    for (let s = 0; s < len; s++) {
      const cx = horiz ? x + s : x, cz = horiz ? z : z + s;
      if (cx > 1 && cz > 1 && cx < W - 2 && cz < H - 2) g.solid(cx, cz, 3, rng.chance(0.1) ? TS.WALL2 : TS.WALL);
    }
  }
  // pillars
  for (let z = 4; z < H - 4; z += 6) for (let x = 4; x < W - 4; x += 6) if (rng.chance(0.5)) g.solid(x, z, 3, TS.WALL);
  // flickering dark patches
  for (let k = 0; k < 8; k++) {
    const cx = rng.int(4, W - 5), cz = rng.int(4, H - 5);
    g.rect(cx - 3, cz - 3, 7, 7, (x, z, i) => { g.light[i] *= 0.45; });
  }
  encloseBorder(g);
  const arena = [];
  const bx = W - 14, bz = Math.round(H / 2 - 6);
  g.rect(bx, bz, 12, 12, (x, z, i) => { g.open(x, z, 0, 4, { light: 0.8, floorTex: TS.FLOOR2, ceilTex: TS.CEIL }); g.flags[i] |= F.ARENA; arena.push(i); });
  g.open(2, Math.round(H / 2), 0, 2.75, { light });
  return { grid: g, start: { x: 2, z: Math.round(H / 2) }, arenaCells: arena, boss: { x: bx + 6, z: bz + 6 } };
}
