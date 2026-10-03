// Huge halls: concert hall, movie theater, mosh pit, department store, neon
// arcade, carnival, flesh cathedral. A main hall plus side rooms.
import { TS, F, newGrid, carveRect, carveCorridor, encloseBorder, setWallsAround, clamp } from './common.js';

export function genHall(rng, theme, depth) {
  const p = theme.params || {};
  const W = Math.round(clamp(50 + depth * 0.5, 50, 72)), H = Math.round(clamp(44 + depth * 0.4, 44, 64));
  const g = newGrid(W, H, 10);
  const light = theme.light ?? 0.7, lv = theme.lightVar ?? 0.3;
  const rooms = [];
  // main hall in the middle-right
  const hw = Math.round(W * 0.55), hh = Math.round(H * 0.6);
  const hx = W - hw - 3, hz = Math.round((H - hh) / 2);
  const hallCeil = p.tents ? 7 : rng.pick([7, 8, 10]);
  carveRect(g, hx, hz, hw, hh, { floor: 0, ceil: hallCeil, sky: !!p.tents && false, light, floorTex: TS.FLOOR, ceilTex: TS.CEIL, region: 0 });
  setWallsAround(g, hx, hz, hw, hh, TS.WALL);
  rooms.push({ id: 0, x: hx, z: hz, w: hw, h: hh, floor: 0, light });
  // stage at the far end (boss arena)
  const stageW = Math.max(8, Math.round(hw * 0.32));
  const stage = [];
  g.rect(hx + hw - stageW, hz + 1, stageW, hh - 2, (x, z, i) => {
    g.floor[i] = 1.0; g.floorTex[i] = TS.FLOOR2; g.wallTex[i] = TS.ACCENT; g.flags[i] |= F.ARENA; stage.push(i);
  });
  // ramps up to the stage on the two sides
  for (const z of [hz + 1, hz + hh - 2]) for (let k = 1; k <= 3; k++) {
    const i = g.idx(hx + hw - stageW - k, z);
    g.floor[i] = 1.0 - k * 0.25; g.wallTex[i] = TS.SIDE;
  }
  // audience area: tiers / pit / shelves / cabinets
  const ax0 = hx + 1, ax1 = hx + hw - stageW - 4;
  if (p.tiers) {
    for (let x = ax0; x < ax1; x++) {
      const tier = Math.floor((ax1 - x) / 2) * 0.25;
      for (let z = hz + 1; z < hz + hh - 1; z++) {
        const i = g.idx(x, z);
        g.floor[i] = tier; g.wallTex[i] = TS.SIDE;
        // seat rows (raised) with aisles
        if ((ax1 - x) % 2 === 1 && (z - hz) % 7 !== 3 && rng.chance(0.85)) { g.floor[i] = tier + 0.5; g.floorTex[i] = TS.ACCENT; g.wallTex[i] = TS.ACCENT; }
      }
    }
  }
  if (p.pit) {
    const pw = Math.round((ax1 - ax0) * 0.6), ph = Math.round(hh * 0.5);
    g.rect(ax0 + Math.round((ax1 - ax0 - pw) / 2), hz + Math.round((hh - ph) / 2), pw, ph, (x, z, i) => { g.floor[i] = -1.0; g.floorTex[i] = TS.FLOOR2; g.wallTex[i] = TS.SIDE; });
  }
  if (p.shelves || p.cabinets) {
    for (let x = ax0 + 2; x < ax1 - 1; x += p.shelves ? 3 : 4) {
      for (let z = hz + 2; z < hz + hh - 2; z++) {
        if ((z - hz) % 9 === 0) continue; // cross aisles
        if (p.cabinets && (z - hz) % 3) continue;
        g.solid(x, z, p.shelves ? 2.6 : 1.8, TS.ACCENT);
      }
    }
  }
  if (p.pillars) {
    for (let x = ax0 + 2; x < ax1; x += 4) for (const z of [hz + 3, hz + hh - 4]) g.solid(x, z, hallCeil, TS.WALL2);
  }
  // balconies along the long walls
  if (hallCeil >= 8) {
    for (const z of [hz + 1, hz + hh - 2]) for (let x = ax0 + 4; x < ax1 - 2; x++) {
      const i = g.idx(x, z);
      if (g.type[i]) { g.floor[i] = 3.0; g.wallTex[i] = TS.WALL2; }
    }
    // stairs up to the balconies run alongside them
    for (const z of [hz + 2, hz + hh - 3]) {
      for (let k = 0; k < 12; k++) {
        const x = ax0 + 4 + k, i = g.idx(x, z);
        if (g.type[i] && x < ax1 - 2) { g.floor[i] = Math.min(3.0, 0.25 * (k + 1)); g.wallTex[i] = TS.SIDE; }
      }
    }
  }
  // side rooms (lobby, backstage, storage) on the left
  const nSide = rng.int(3, 5);
  for (let k = 0; k < nSide; k++) {
    const w = rng.int(6, 10), h = rng.int(6, 9);
    const x = rng.int(2, Math.max(3, hx - w - 3)), z = rng.int(2, H - h - 2);
    let free = true;
    g.rect(x - 1, z - 1, w + 2, h + 2, (cx, cz, i) => { if (g.type[i]) free = false; });
    if (!free) continue;
    const f = rng.pick([0, 0, 0.5]);
    const lt = clamp(light + rng.float(-lv, lv), 0.2, 1.1);
    carveRect(g, x, z, w, h, { floor: f, ceil: f + 3, light: lt, floorTex: TS.FLOOR2, ceilTex: TS.CEIL, region: rooms.length });
    setWallsAround(g, x, z, w, h, rng.chance(0.5) ? TS.WALL2 : TS.WALL);
    rooms.push({ id: rooms.length, x, z, w, h, floor: f, light: lt });
  }
  // connect side rooms into a chain ending at the hall
  rooms.sort((a, b) => a.x - b.x);
  for (let k = 0; k < rooms.length - 1; k++) {
    const a = rooms[k], b = rooms[k + 1];
    carveCorridor(g, rng, Math.floor(a.x + a.w / 2), Math.floor(a.z + a.h / 2), Math.floor(b.x + b.w / 2), Math.floor(b.z + b.h / 2), { width: rng.chance(0.5) ? 2 : 1, floorA: a.floor, floorB: b.floor, height: 2.75, floorTex: TS.FLOOR2, light: light * 0.8 });
  }
  encloseBorder(g);
  const first = rooms[0];
  return { grid: g, rooms, start: { x: Math.floor(first.x + first.w / 2), z: Math.floor(first.z + first.h / 2) }, arenaCells: stage, boss: { x: hx + hw - stageW / 2, z: hz + hh / 2 }, noFortify: true };
}
