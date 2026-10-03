// Moving convoys: semi trucks on a 5-lane highway, space trains, twin
// freighters, subway trains, arctic rail. Vehicles are parked in the grid;
// the road / starfield / tunnel walls scroll past to sell the motion.
import { TS, F, newGrid, clamp } from './common.js';

export function genConvoy(rng, theme, depth) {
  const p = theme.params || {};
  const lanes = p.lanes || 1;
  const vehicle = p.vehicle || 'train';
  const laneW = vehicle === 'truck' ? 3 : vehicle === 'ship' ? 7 : 4;
  const laneGap = p.gap ?? 2;
  const L = Math.round(clamp(90 + depth * 2, 90, 160));
  const W = L, H = lanes * laneW + (lanes - 1) * laneGap + 6;
  const VOID_Y = vehicle === 'truck' ? -1.6 : p.tunnel ? -2.2 : -20;
  const g = newGrid(W, H, 6);
  const light = theme.light ?? 0.85;
  const ceilAll = p.tunnel ? 6.5 : 3;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) g.open(x, z, VOID_Y, ceilAll, { sky: !p.tunnel, light, flags: F.VOID, ceilTex: TS.CEIL });
  if (p.tunnel) {
    // tunnel walls along both sides (scrolling texture gives the motion)
    for (let x = 0; x < W; x++) { g.solid(x, 0, 8, TS.ACCENT); g.solid(x, H - 1, 8, TS.ACCENT); }
  }
  const vehicles = [];
  const laneZ = [];
  for (let l = 0; l < lanes; l++) laneZ.push(3 + l * (laneW + laneGap));

  function addVehicle(x0, len, z0, top, kind) {
    const cells = [];
    for (let x = x0; x < x0 + len && x < W - 1; x++) for (let z = z0; z < z0 + laneW; z++) {
      const i = g.idx(x, z);
      g.open(x, z, top, p.tunnel ? ceilAll : top + 3, { sky: !p.tunnel, light, floorTex: kind === 'cab' ? TS.FLOOR2 : TS.FLOOR, wallTex: kind === 'cab' ? TS.WALL2 : TS.WALL, ceilTex: TS.CEIL });
      g.flags[i] &= ~F.VOID;
      cells.push(i);
    }
    const v = { x0, len, z0, top, kind, cells };
    vehicles.push(v);
    return v;
  }

  // lay out each lane; lanes are offset so you can hop between them
  for (let l = 0; l < lanes; l++) {
    let x = 2 + (l % 2) * rng.int(0, 4);
    let shipTop = 0.5;
    const z0 = laneZ[l];
    while (x < W - 14) {
      if (vehicle === 'truck') {
        const trailerLen = rng.int(5, 9);
        const flat = rng.chance(0.35);
        // trailer first (rear), cab in front (+x is the direction of travel)
        addVehicle(x, trailerLen, z0, flat ? 1.1 : 2.6, flat ? 'flatbed' : 'trailer');
        addVehicle(x + trailerLen, 2, z0, 2.0, 'cab');
        if (flat) { // cargo crates on flatbeds
          for (let k = 0; k < rng.int(1, 2); k++) {
            const cx = x + 1 + rng.int(0, trailerLen - 3);
            for (let z = z0; z < z0 + laneW; z++) { const i = g.idx(cx, z); if (g.type[i]) { g.floor[i] = 2.4; g.wallTex[i] = TS.WALL2; g.floorTex[i] = TS.FLOOR2; } }
          }
        }
        x += 2 + trailerLen + rng.int(1, 2);
      } else {
        const len = vehicle === 'ship' ? rng.int(12, 20) : rng.int(8, 12);
        shipTop = clamp(shipTop + rng.pick([-0.5, 0, 0.5]), 0, 1);
        const top = vehicle === 'ship' ? shipTop : 2.4;
        const car = addVehicle(x, len, z0, top, 'car');
        if (vehicle === 'ship') {
          // deck structures
          for (let k = 0; k < 2; k++) {
            const sx = x + rng.int(2, len - 4), sz = z0 + rng.int(1, laneW - 3);
            for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) g.solid(sx + dx, sz + dz, top + 2.5, TS.WALL2);
          }
        } else if (rng.chance(0.4)) {
          // roof vent / cargo bump
          const bx = x + rng.int(2, len - 3);
          for (let z = z0 + 1; z < z0 + laneW - 1; z++) { const i = g.idx(bx, z); g.floor[i] = top + 0.75; g.wallTex[i] = TS.ACCENT; g.floorTex[i] = TS.ACCENT; }
        }
        void car;
        x += len + rng.int(1, 2);
      }
    }
  }
  // couplers: small bridges between lanes so every lane is reachable
  for (let l = 0; l < lanes - 1; l++) {
    for (let x = 6; x < W - 10; x += rng.int(10, 18)) {
      const za = laneZ[l] + laneW - 1, zb = laneZ[l + 1];
      const ia = g.idx(x, za), ib = g.idx(x, zb);
      if (!g.type[ia] || (g.flags[ia] & F.VOID) || !g.type[ib] || (g.flags[ib] & F.VOID)) continue;
      if (laneGap > 2 || Math.abs(g.floor[ia] - g.floor[ib]) > 0.6 || rng.chance(0.5)) {
        for (let z = za + 1; z < zb; z++) {
          const i = g.idx(x, z);
          const t = (z - za) / (zb - za);
          g.open(x, z, Math.round((g.floor[ia] + (g.floor[ib] - g.floor[ia]) * t) * 4) / 4, p.tunnel ? ceilAll : 6, { sky: !p.tunnel, light, floorTex: TS.FLOOR2, wallTex: TS.SIDE, flags: F.BRIDGE });
          g.flags[i] &= ~F.VOID;
        }
      }
    }
  }
  // the lead vehicle becomes the boss arena: a big flat platform across all lanes
  const ax0 = W - 16;
  // match the height of the lane-0 vehicle right before it
  let arenaY = 2.4;
  for (let x = ax0 - 3; x > ax0 - 12; x--) {
    const i = g.idx(x, laneZ[0] + 1);
    if (g.type[i] && !(g.flags[i] & F.VOID)) { arenaY = g.floor[i]; break; }
  }
  const arena = [];
  for (let x = ax0; x < W - 1; x++) for (let z = 2; z < H - 2; z++) {
    if (p.tunnel && (z === 0 || z === H - 1)) continue;
    const i = g.idx(x, z);
    g.open(x, z, arenaY, p.tunnel ? ceilAll : arenaY + 4, { sky: !p.tunnel, light: Math.max(light, 0.8), floorTex: TS.FLOOR2, wallTex: TS.WALL2, ceilTex: TS.CEIL });
    g.flags[i] = F.ARENA;
    arena.push(i);
  }
  // remove vehicles overlapping the arena edge gap so the approach is a jump
  for (let x = ax0 - 2; x < ax0; x++) for (let z = 0; z < H; z++) {
    const i = g.idx(x, z);
    if (g.type[i] && !(g.flags[i] & F.VOID) && (z === laneZ[0] + 1)) continue; // keep one path
    if (g.type[i] && !(g.flags[i] & F.ARENA)) { g.flags[i] = F.VOID; g.floor[i] = VOID_Y; }
  }
  // make sure the path cell row into the arena exists
  for (let x = ax0 - 2; x < ax0; x++) {
    const z = laneZ[0] + 1, i = g.idx(x, z);
    g.open(x, z, arenaY, p.tunnel ? ceilAll : arenaY + 4, { sky: !p.tunnel, light, floorTex: TS.FLOOR2, wallTex: TS.SIDE, flags: F.BRIDGE });
    g.flags[i] &= ~F.VOID;
  }
  // start on the rearmost vehicle of lane 0
  let start = { x: 3, z: laneZ[0] + 1 };
  for (const v of vehicles) if (v.z0 === laneZ[0]) { start = { x: v.x0 + 1, z: v.z0 + 1 }; break; }
  const speed = vehicle === 'truck' ? 16 : vehicle === 'ship' ? 30 : 22;
  return {
    grid: g, start, arenaCells: arena, boss: { x: ax0 + 8, z: H / 2 }, voidY: VOID_Y, noFortify: true, jumpGap: 2,
    scrollSpeed: speed, startYaw: 0,
  };
}
