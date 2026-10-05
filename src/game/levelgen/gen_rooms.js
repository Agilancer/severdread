// BSP rooms & corridors: bases, labs, stations, mansions, hospitals...
import { TS, F, newGrid, carveRect, carveCorridor, encloseBorder, setWallsAround, clamp, quant } from './common.js';

export function genRooms(rng, theme, depth) {
  const p = theme.params || {};
  const station = theme.archetype === 'station';
  const size = Math.round(clamp(40 + depth * 0.7, 40, 70) * (p.size || 1));
  const W = size, H = Math.round(size * rng.float(0.75, 1.0));
  const g = newGrid(W, H, 6);
  const rooms = [];

  // --- BSP split
  const minLeaf = station ? 10 : 9;
  function split(n, d) {
    const canH = n.w >= minLeaf * 2, canV = n.h >= minLeaf * 2;
    if ((!canH && !canV) || d > 6 || (d > 2 && n.w < 22 && n.h < 22 && rng.chance(0.25))) {
      return makeRoom(n);
    }
    const horiz = canH && (!canV || n.w > n.h * 1.15 || (n.w <= n.h * 1.15 && n.h <= n.w * 1.15 && rng.chance(0.5)));
    let a, b;
    if (horiz) {
      const cut = rng.int(Math.max(minLeaf, Math.floor(n.w * 0.35)), Math.min(n.w - minLeaf, Math.ceil(n.w * 0.65)));
      a = { x: n.x, z: n.z, w: cut, h: n.h }; b = { x: n.x + cut, z: n.z, w: n.w - cut, h: n.h };
    } else {
      const cut = rng.int(Math.max(minLeaf, Math.floor(n.h * 0.35)), Math.min(n.h - minLeaf, Math.ceil(n.h * 0.65)));
      a = { x: n.x, z: n.z, w: n.w, h: cut }; b = { x: n.x, z: n.z + cut, w: n.w, h: n.h - cut };
    }
    const ra = split(a, d + 1), rb = split(b, d + 1);
    connect(ra, rb);
    return rng.chance(0.5) ? ra : rb;
  }

  function makeRoom(leaf) {
    const w = rng.int(Math.max(5, Math.floor(leaf.w * 0.55)), leaf.w - 2);
    const h = rng.int(Math.max(5, Math.floor(leaf.h * 0.55)), leaf.h - 2);
    const x = leaf.x + rng.int(1, leaf.w - w - 1);
    const z = leaf.z + rng.int(1, leaf.h - h - 1);
    const id = rooms.length;
    const floor = rng.pick([0, 0, 0, 0, 0.5, 1.0, -0.5]);
    const sky = !station && rng.chance(p.courtyards || 0);
    const dome = station && w * h > 60 && rng.chance(0.25); // observation deck open to space
    const ceilH = rng.pick(station ? [2.5, 3, 3, 4] : [2.75, 3, 3.5, 4, 5]);
    const light = clamp((theme.light ?? 0.75) + rng.float(-(theme.lightVar ?? 0.25), theme.lightVar ?? 0.25), 0.15, 1.2);
    const room = { id, x, z, w, h, floor, sky: sky || dome, light, cx: x + w / 2, cz: z + h / 2 };
    carveRect(g, x, z, w, h, {
      floor, ceil: floor + ceilH, sky: room.sky, light: room.sky ? Math.max(light, 0.85) : light,
      floorTex: rng.chance(0.3) ? TS.FLOOR2 : TS.FLOOR, ceilTex: TS.CEIL, region: id,
    });
    setWallsAround(g, x, z, w, h, rng.chance(0.3) ? TS.WALL2 : TS.WALL, room.sky ? floor + rng.pick([3, 4, 5]) : undefined);
    rooms.push(room);
    return room;
  }

  const corridors = [];
  function connect(a, b) {
    const ax = Math.floor(a.x + rng.int(1, Math.max(1, a.w - 2))), az = Math.floor(a.z + rng.int(1, Math.max(1, a.h - 2)));
    const bx = Math.floor(b.x + rng.int(1, Math.max(1, b.w - 2))), bz = Math.floor(b.z + rng.int(1, Math.max(1, b.h - 2)));
    const width = rng.chance(station ? 0.45 : 0.3) ? 2 : 1;
    const c = carveCorridor(g, rng, ax, az, bx, bz, {
      width, floorA: a.floor, floorB: b.floor, height: station ? 2.5 : rng.pick([2.5, 2.75, 3]),
      sky: a.sky && b.sky && rng.chance(0.6), floorTex: TS.FLOOR2, light: Math.min(a.light, b.light) * 0.85,
    });
    corridors.push({ a: a.id, b: b.id, width, ...c });
  }

  split({ x: 1, z: 1, w: W - 2, h: H - 2 }, 0);
  // a few extra loops between close rooms
  for (let k = 0; k < Math.floor(rooms.length / 4); k++) {
    const a = rng.pick(rooms);
    let best = null, bd = Infinity;
    for (const b of rooms) {
      if (b === a) continue;
      const d = Math.hypot(a.cx - b.cx, a.cz - b.cz);
      if (d < bd && d > 4) { bd = d; best = b; }
    }
    if (best && bd < 22) connect(a, best);
  }

  // --- room features
  for (const r of rooms) {
    const area = r.w * r.h;
    if (r.w >= 8 && r.h >= 8 && rng.chance(0.35)) { // pillars
      const step = rng.pick([3, 4]);
      for (let z = r.z + 2; z < r.z + r.h - 2; z += step) for (let x = r.x + 2; x < r.x + r.w - 2; x += step) g.solid(x, z, r.floor + 6, TS.ACCENT);
    } else if (area > 40 && rng.chance(0.3)) { // raised dais
      const dw = Math.floor(r.w / 2), dh = Math.floor(r.h / 2);
      const up = rng.pick([0.5, 0.75, 1.0]);
      g.rect(r.x + Math.floor((r.w - dw) / 2), r.z + Math.floor((r.h - dh) / 2), dw, dh, (x, z, i) => { if (g.type[i]) { g.floor[i] = r.floor + up; g.wallTex[i] = TS.SIDE; } });
    } else if (area > 36 && (p.lavaPools || theme.hazard) && rng.chance(p.lavaPools ? 0.45 : 0.22)) { // hazard pool
      const dw = Math.max(2, Math.floor(r.w / 2) - 1), dh = Math.max(2, Math.floor(r.h / 2) - 1);
      g.rect(r.x + Math.floor((r.w - dw) / 2), r.z + Math.floor((r.h - dh) / 2), dw, dh, (x, z, i) => {
        if (g.type[i]) { g.floor[i] = r.floor - 0.4; g.flags[i] |= F.HAZARD; g.floorTex[i] = TS.HAZARD; g.wallTex[i] = TS.SIDE; }
      });
    }
    if (p.cargo && area > 30) { // container stacks in cargo holds
      for (let k = 0; k < Math.floor(area / 25); k++) {
        const cw = rng.int(1, 2), ch = rng.int(2, 3), x = rng.int(r.x + 1, r.x + r.w - cw - 1), z = rng.int(r.z + 1, r.z + r.h - ch - 1);
        const hgt = rng.pick([1.0, 1.0, 2.0]);
        g.rect(x, z, cw, ch, (cx, cz, i) => { if (g.type[i]) { g.floor[i] = r.floor + hgt; g.wallTex[i] = rng.chance(0.5) ? TS.WALL : TS.WALL2; g.floorTex[i] = TS.FLOOR2; } });
      }
    }
  }
  encloseBorder(g);

  // start = room closest to a corner, boss = picked later by distance (largest of far rooms)
  rooms.sort((a, b) => (a.cx + a.cz) - (b.cx + b.cz));
  const startRoom = rooms[0];
  return {
    grid: g, rooms, corridors,
    start: { x: Math.floor(startRoom.cx), z: Math.floor(startRoom.cz) },
    pickBossArena: 'farthestRoom',
  };
}
