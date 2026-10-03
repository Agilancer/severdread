// Castles: curtain walls, corner towers, a courtyard, a keep with a throne room.
// Variants: cyber castle, throne of bones, clocktower, sunken temple.
import { TS, F, newGrid, carveRect, carveCorridor, encloseBorder, setWallsAround, clamp } from './common.js';

export function genCastle(rng, theme, depth) {
  const p = theme.params || {};
  const W = Math.round(clamp(56 + depth * 0.6, 56, 84)), H = Math.round(W * 0.85);
  const g = newGrid(W, H, 9);
  const light = theme.light ?? 0.7, lv = theme.lightVar ?? 0.25;
  const outLight = Math.max(0.8, light);
  // moat / outer ground
  const moat = theme.void === 'water' || theme.void === 'lava' || theme.void === 'digital';
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const edge = Math.min(x, z, W - 1 - x, H - 1 - z);
    if (moat && edge >= 3 && edge <= 5) g.open(x, z, -8, 3, { sky: true, light: outLight, flags: F.VOID });
    else g.open(x, z, 0, 3, { sky: true, light: outLight, floorTex: TS.FLOOR2 });
  }
  // outer curtain wall ring (walkable top via stairs: wall top 3)
  const m = 7;
  const cw = { x: m, z: m, w: W - 2 * m, h: H - 2 * m };
  for (let x = cw.x; x < cw.x + cw.w; x++) for (const z of [cw.z, cw.z + 1, cw.z + cw.h - 1, cw.z + cw.h - 2]) wallTop(x, z);
  for (let z = cw.z; z < cw.z + cw.h; z++) for (const x of [cw.x, cw.x + 1, cw.x + cw.w - 1, cw.x + cw.w - 2]) wallTop(x, z);
  function wallTop(x, z) { const i = g.idx(x, z); g.open(x, z, 3.0, 3.0 + 4, { sky: true, light: outLight, floorTex: TS.FLOOR, wallTex: TS.WALL }); g.flags[i] &= ~F.VOID; }
  // crenellations on the outer edge of the wall walk
  for (let x = cw.x; x < cw.x + cw.w; x += 2) { g.solid(x, cw.z, 4.0, TS.WALL); g.solid(x, cw.z + cw.h - 1, 4.0, TS.WALL); }
  for (let z = cw.z; z < cw.z + cw.h; z += 2) { g.solid(cw.x, z, 4.0, TS.WALL); g.solid(cw.x + cw.w - 1, z, 4.0, TS.WALL); }
  // corner towers (raised floors)
  for (const [tx, tz] of [[cw.x, cw.z], [cw.x + cw.w - 5, cw.z], [cw.x, cw.z + cw.h - 5], [cw.x + cw.w - 5, cw.z + cw.h - 5]]) {
    g.rect(tx, tz, 5, 5, (x, z, i) => {
      const edge = x === tx || z === tz || x === tx + 4 || z === tz + 4;
      if (edge) g.solid(x, z, 6.5, TS.WALL2);
      else g.open(x, z, 3.0, 6.0, { sky: false, light: light * 0.8, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
    });
  }
  // gatehouse on the left wall + bridge over the moat
  const gz = Math.round(H / 2);
  for (let x = 1; x < cw.x + 2; x++) for (let dz = -1; dz <= 1; dz++) {
    const i = g.idx(x, gz + dz);
    g.open(x, gz + dz, 0, x >= cw.x ? 3.5 : 3, { sky: x < cw.x, light: outLight, floorTex: x < cw.x ? TS.ACCENT : TS.FLOOR, flags: x < cw.x && moat ? F.BRIDGE : 0 });
    g.flags[i] &= ~F.VOID;
  }
  // stairs up to the wall walk inside the courtyard
  for (const [sx, sz, dx] of [[cw.x + 2, cw.z + 6, 1], [cw.x + cw.w - 3, cw.z + cw.h - 7, -1]]) {
    for (let k = 0; k < 12; k++) {
      const i = g.idx(sx + k * dx, sz);
      if (g.type[i]) { g.floor[i] = Math.min(3.0, 0.25 * (12 - k)); g.wallTex[i] = TS.SIDE; g.floorTex[i] = TS.FLOOR; }
    }
  }
  // the keep: rooms building in the courtyard's right half
  const kx = Math.round(W * 0.48), kz = cw.z + 6, kw = cw.x + cw.w - 6 - kx, kh = cw.h - 12;
  g.rect(kx - 1, kz - 1, kw + 2, kh + 2, (x, z) => g.solid(x, z, 9, TS.WALL));
  const rooms = [];
  // throne room = far right part of the keep
  const tw = Math.max(9, Math.round(kw * 0.45));
  carveRect(g, kx + kw - tw, kz, tw, kh, { floor: 0.5, ceil: 7, light: Math.max(0.6, light), floorTex: TS.FLOOR2, ceilTex: TS.CEIL, region: 100 });
  const arena = [];
  g.rect(kx + kw - tw, kz, tw, kh, (x, z, i) => { g.flags[i] |= F.ARENA; arena.push(i); });
  // dais for the throne
  g.rect(kx + kw - 3, kz + Math.floor(kh / 2) - 2, 2, 5, (x, z, i) => { g.floor[i] = 1.5; g.wallTex[i] = TS.ACCENT; g.floorTex[i] = TS.ACCENT; });
  // smaller keep rooms
  const leftW = kw - tw - 1;
  let rz = kz;
  while (rz < kz + kh - 4 && leftW >= 4) {
    const rh = Math.min(rng.int(4, 7), kz + kh - rz);
    const lt = clamp(light + rng.float(-lv, lv), 0.2, 1.1);
    carveRect(g, kx, rz, leftW, rh, { floor: 0, ceil: rng.pick([3, 3.5, 4]), light: lt, floorTex: TS.FLOOR, ceilTex: TS.CEIL, region: rooms.length });
    rooms.push({ x: kx, z: rz, w: leftW, h: rh });
    rz += rh + 1;
  }
  // doors: courtyard -> each keep room, rooms chain, last room -> throne
  for (let k = 0; k < rooms.length; k++) {
    const r = rooms[k];
    g.open(kx - 1, r.z + Math.floor(r.h / 2), 0, 3, { light, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
    if (k > 0) g.open(kx + Math.floor(leftW / 2), r.z - 1, 0, 3, { light, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  }
  const last = rooms[rooms.length - 1] || { z: kz, h: kh };
  g.open(kx + leftW, last.z + Math.floor(last.h / 2), 0.25, 3, { light, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  // courtyard dressing: statues/pillars and garden beds
  for (let k = 0; k < 12; k++) {
    const x = rng.int(cw.x + 3, kx - 3), z = rng.int(cw.z + 3, cw.z + cw.h - 4), i = g.idx(x, z);
    if (g.type[i] && g.floor[i] === 0) { if (rng.chance(0.5)) g.solid(x, z, 3.5, TS.ACCENT); else { g.floor[i] = 0.5; g.wallTex[i] = TS.SIDE; } }
  }
  if (p.flooded) {
    for (let i = 0; i < W * H; i++) if (g.type[i] && g.floor[i] === 0 && rng.chance(0.25) && !(g.flags[i] & F.ARENA)) { g.flags[i] |= F.WATER; g.floorTex[i] = TS.HAZARD; g.floor[i] = -0.2; }
  }
  encloseBorder(g);
  // keep the throne room fully enclosed except via the keep (gate = the doorway)
  return { grid: g, rooms, start: { x: 2, z: gz }, arenaCells: arena, boss: { x: kx + kw - tw / 2, z: kz + kh / 2 }, noFortify: true, voidY: -8 };
}
