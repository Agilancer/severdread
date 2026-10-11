// Room templates of the prison archetype (see gen_prison.js): the cell
// blocks, the control hub, the admin range (intake, infirmary, warden,
// armory), the mess hall, the laundry with its boiler pit and the solitary
// wing, plus the finishing pass (skirting, barred windows, door frames,
// strip lights where nothing else lights a room).
//
// Every template works in the room's local frame (Kit, mansion_kit.js): a
// across, b into the room, W x D cells; walls 0 (+a), 1 (-a), 2 (+b), 3 (-b).
// Doorway approaches (r.reserved) stay clear and level.
import { Kit, TS, F, FACE, OPP, lbox, llight, each } from './mansion_kit.js';
import * as P from './prison_props.js';
import * as MP from './mansion_props.js';
import { markWall, wallTaken, outside, wallCell } from './mansion_rooms.js';

const GF = 0.6, T2 = GF + 3.6, PIT = GF - 3.6, BLDG_TOP = 13.2;
const STEEL_STAIR = { floorTex: TS.FLOOR2, sideTex: TS.METAL, style: 'metal' };
const CONCRETE_STAIR = { floorTex: TS.FLOOR, sideTex: TS.WALL, style: 'metal' };
const CELL_H = 3.0;

// world cell index of local (a, b) made solid (cell partitions, wall fills)
function solidCell(k, a, b, tex = TS.WALL) {
  const i = k.idx(a, b);
  if (i < 0 || !k.mine(a, b)) return;
  k.g.solid(i % k.g.w, (i / k.g.w) | 0, BLDG_TOP, tex);
}
// along-wall overlap of the active ports on local wall ld with [s0, s1)
const portOn = (k, ld, s0, s1) => k.r.ports.some((p) => p.active && p.dir === ld && s0 < p.s1 && s1 > p.s0);
const alongX = (fr) => fr.bd < 2;   // local b runs along world x
// a console desk on local cell (a, b) facing local direction ld
const con = (k, a, b, y, ld, w = 0.9) => k.deco.console(k.fr.cx(a, b), k.fr.cz(a, b), y, k.fr.dir(ld), { width: w });

// cells of the cell rhythm along a band of length D: [start + 4k, +3) with partitions between
function rhythm(D) {
  const n = Math.max(1, Math.floor((D + 1) / 4));
  const total = 4 * n - 1;
  const start = Math.floor((D - total) / 2);
  return { n, start, end: start + total };
}

// furnish one cell: a bunk on one side, the steel toilet at the back, a shelf
// aBack: the local a of the back wall line; inward: -1 when the cell lies at
// a < aBack (ground band, back wall at a = W), +1 when at a > aBack
function dressCell(k, aBack, inward, c0, y, rng) {
  const { deco, fr } = k;
  const A = (t0, t1) => (inward < 0 ? [aBack - t1, aBack - t0] : [aBack + t0, aBack + t1]);
  const flip = rng.chance(0.5);
  const bB = flip ? [c0 + 2.1, c0 + 2.95] : [c0 + 0.05, c0 + 0.9];
  const [ba0, ba1] = A(0.05, 2.1);
  P.bunk(deco, P.pf(fr, ba0, bB[0], ba1, bB[1], flip ? 3 : 2), y);
  const [ta0, ta1] = A(0, 0.8);
  const tb = flip ? [c0 + 0.15, c0 + 1.0] : [c0 + 2.0, c0 + 2.85];
  P.toilet(deco, P.pf(fr, ta0, tb[0], ta1, tb[1], inward < 0 ? 1 : 0), y);
  const [sa0, sa1] = A(1.0, 2.2);
  const sb = flip ? [c0, c0 + 0.45] : [c0 + 2.55, c0 + 3];
  P.cellShelf(deco, P.pf(fr, sa0, sb[0], sa1, sb[1], flip ? 2 : 3), y);
  // a dim caged lamp over the door
  const [la] = A(2.6, 2.7);
  llight(deco, fr, la, y + 2.6, c0 + 1.5, [1, 0.85, 0.6], 3.2, { flicker: rng.chance(0.25) });
}

// barred gate leaves standing open against the wall either side of a sally
// port, a header with a signal lamp over it
function sallyGate(k, p) {
  const { deco, fr } = k;
  const ld = p.dir, h = p.h;
  const [a0, b0, a1, b1] = k.strip(ld, p.s0 - 1.6, p.s0 - 0.05, 0.12, 0.05);
  const [c0, d0, c1, d1] = k.strip(ld, p.s1 + 0.05, p.s1 + 1.6, 0.12, 0.05);
  for (const [x0, y0, x1, y1] of [[a0, b0, a1, b1], [c0, d0, c1, d1]]) {
    const ok = ld < 2 ? x0 >= 0 && y0 >= 0 && y1 <= k.D : y0 >= 0 && x0 >= 0 && x1 <= k.W;
    if (!ok) continue;
    const mid = ld < 2 ? (x0 + x1) / 2 : (y0 + y1) / 2;
    const p0 = ld < 2 ? [fr.px(mid, y0), fr.pz(mid, y0)] : [fr.px(x0, mid), fr.pz(x0, mid)];
    const p1 = ld < 2 ? [fr.px(mid, y1), fr.pz(mid, y1)] : [fr.px(x1, mid), fr.pz(x1, mid)];
    P.barRun(deco, p0[0], p0[1], p1[0], p1[1], h + 0.02, h + 3.2, { step: 0.16 });
  }
  const [e0, f0, e1, f1] = k.strip(ld, p.s0 - 0.3, p.s1 + 0.3, 0.3);
  lbox(deco, fr, e0, h + 3.4, f0, e1, h + 3.7, f1, TS.ACCENT, { uv: 'fit' });
  const [g0, gb0] = ld < 2 ? [(e0 + e1) / 2, f0] : [e0, (f0 + f1) / 2];
  void gb0;
  const la = ld < 2 ? (ld === 0 ? k.W - 0.35 : 0.35) : (p.s0 + p.s1) / 2, lb = ld < 2 ? (p.s0 + p.s1) / 2 : (ld === 2 ? k.D - 0.35 : 0.35);
  void g0;
  lbox(deco, fr, la - 0.12, h + 3.75, lb - 0.12, la + 0.12, h + 3.95, lb + 0.12, TS.LIGHT, { emissive: 1, uv: 'fit' });
  llight(deco, fr, la, h + 3.4, lb, k.rng.chance(0.5) ? P.ALARM : [0.3, 1, 0.35], 4, { pulse: true });
  markWall(k, ld, p.s0 - 1.7, p.s1 + 1.7, h, h + 4);
}

// tall fluorescent strips on the ceiling over a local rect, every `step`
function ceilingStrips(k, a0, b0, a1, b1, step = 4, o = {}) {
  const { deco, fr, g } = k;
  for (let b = b0 + step / 2; b < b1; b += step) for (let a = a0 + step / 2; a < a1; a += step) {
    const ca = Math.floor(a), cb = Math.floor(b);
    if (!k.mine(ca, cb)) continue;
    const top = g.ceil[k.idx(ca, cb)];
    if (o.pendant) P.pendant(deco, k.wx(a, b), k.wz(a, b), top, o.drop ?? 1.2, { long: true, alongX: alongX(fr), radius: o.radius ?? 9, flicker: k.rng.chance(o.flicker ?? 0.1) });
    else {
      const [x0, z0, x1, z1] = fr.rect(a - 0.6, b - 0.15, a + 0.6, b + 0.15);
      deco.lightPanel(x0, z0, x1, z1, top, P.FLUO, o.radius ?? 7);
    }
  }
}

// ======================================================================
export const PRISON_ROOMS = {
  // ---------------------------------------------------------- cell block
  // a: 0 outer wall .. W - 1 hub side. Upper tier on the outer side (cells
  // a 0..3, gallery a 3..5 at T2), the block floor a 5..W-3, ground cells
  // a W-3..W. Two flights up to the gallery; painted tiers on the high walls.
  block(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr, g } = k;
    const R = rhythm(D);
    // ---- the upper tier: gallery + cells raised to T2
    k.floorRect(0, 0, 5, D, T2, { floorTex: TS.FLOOR2, wallTex: TS.WALL });
    each(fr, 0, 0, 3, D, (a, b) => { const i = k.idx(a, b); if (i >= 0 && k.mine(a, b)) { g.ceil[i] = T2 + CELL_H; g.floorTex[i] = TS.FLOOR; g.ceilTex[i] = TS.CEIL; } });
    k.use(0, 0, 5, D);
    // ---- ground cells: ceilings, then partitions / end fills (not where a door passes)
    each(fr, W - 3, 0, W, D, (a, b) => { const i = k.idx(a, b); if (i >= 0 && k.mine(a, b)) { g.ceil[i] = y + CELL_H; g.ceilTex[i] = TS.CEIL; } });
    const wallAt = (b) => b < R.start || b >= R.end || (b - R.start) % 4 === 3;
    const cellsG = [], cellsU = [];
    for (let b = 0; b < D; b++) {
      if (!wallAt(b)) continue;
      if (!portOn(k, 0, b, b + 1)) for (let a = W - 3; a < W; a++) solidCell(k, a, b);
      for (let a = 0; a < 3; a++) solidCell(k, a, b);
    }
    for (let j = 0; j < R.n; j++) {
      const c0 = R.start + 4 * j;
      if (portOn(k, 0, c0 - 1, c0 + 4)) cellsG.push({ c0, pass: true }); else cellsG.push({ c0 });
      cellsU.push({ c0 });
    }
    k.use(W - 3, 0, W, D);
    // ---- dress the cells, barred fronts
    for (const c of cellsG) {
      if (c.pass) continue;
      dressCell(k, W, -1, c.c0, y, rng);
      P.cellFront(deco, fr, W - 3, c.c0, c.c0 + 3, y, CELL_H, wallAt(c.c0 + 3) && !portOn(k, 0, c.c0 + 3, c.c0 + 4) ? 1 : -1, -1);
    }
    for (const c of cellsU) {
      dressCell(k, 0, 1, c.c0, T2, rng);
      P.cellFront(deco, fr, 3, c.c0, c.c0 + 3, T2, CELL_H, rng.chance(0.5) ? 1 : -1, 1);
    }
    // ---- the flights up to the gallery (front and back), landings at T2
    const flights = [];
    const fb0 = 3, rb0 = D - 9;
    if (k.free(5, fb0, 7, fb0 + 8)) {
      k.flight(5, fb0, 2, 6, 2, y, T2, STEEL_STAIR);
      k.floorRect(5, fb0 + 6, 7, fb0 + 8, T2, { floorTex: TS.FLOOR2, wallTex: TS.METAL });
      k.use(5, fb0 + 6, 7, fb0 + 8);
      flights.push([5, fb0 + 6, 7, fb0 + 8]);
    }
    if (D >= 22 && k.free(5, rb0 - 2, 7, rb0 + 6)) {
      k.flight(5, rb0, 2, 6, 3, y, T2, STEEL_STAIR);
      k.floorRect(5, rb0 - 2, 7, rb0, T2, { floorTex: TS.FLOOR2, wallTex: TS.METAL });
      k.use(5, rb0 - 2, 7, rb0);
      flights.push([5, rb0 - 2, 7, rb0]);
    }
    // gallery + landings: rails on every drop
    const galCells = k.cells(3, 0, 5, D);
    for (const f of flights) galCells.push(...k.cells(...f));
    k.rail(galCells, { style: 'metal', tex: TS.RAIL });
    // gallery underside face: the painted ground tier behind the flights; a
    // steel fascia along the gallery edge
    P.fakeTier(deco, P.pf(fr, 5, 0, 5.3, D, 0), y, CELL_H, { ledge: false, phase: R.start + 0.0, step: 4 });
    lbox(deco, fr, 5, T2 - 0.35, 0, 5.08, T2, D, TS.METAL, { faces: FACE.SIDES | FACE.BOTTOM });
    // painted tiers above the ground cells (two) and above the upper cells (one)
    P.fakeTier(deco, P.pf(fr, W - 3 - 1.7, 0, W - 3, D, 1), T2, CELL_H, { phase: R.start, depth: 1.5 });
    P.fakeTier(deco, P.pf(fr, W - 3 - 1.7, 0, W - 3, D, 1), T2 + 3.6, CELL_H, { phase: R.start, depth: 1.5 });
    P.fakeTier(deco, P.pf(fr, 3, 0, 3 + 1.7, D, 0), T2 + 3.6, CELL_H, { phase: R.start, depth: 1.5 });
    // ---- the block floor: a warning line before the cells, tables down the middle
    each(fr, 7, 0, W - 3, D, (a, b) => {
      if (a !== W - 4 || !k.mine(a, b) || k.res(a, b) || (g.flags[k.idx(a, b)] & (F.STAIR | F.DOOR))) return;
      g.floorTex[k.idx(a, b)] = TS.ACCENT;
    });
    const ac = Math.floor((7 + W - 4) / 2);
    for (let b = 5; b + 2 < D - 4; b += 4) {
      if (!k.take(ac - 1, b - 1, ac + 2, b + 2, 0)) continue;
      P.steelTable(deco, k.wx(ac + 0.5, b + 0.5), k.wz(ac + 0.5, b + 0.5), y, alongX(fr));
    }
    // a guard post by the first flight / at the front end
    if (k.take(ac - 2, 1, ac + 1, 2, 0)) {
      con(k, ac - 1, 1, y, 2, 2.2);
    }
    // ---- overhead: a skylight down the middle, pendant strips, cameras, TV
    const sa0 = ac - 1, sa1 = ac + 2;
    lbox(deco, fr, sa0, top - 0.05, 2, sa1, top, D - 2, TS.GLASS_PLAIN, { emissive: 0.6, faces: FACE.BOTTOM });
    for (let b = 2; b <= D - 2; b += 2) lbox(deco, fr, sa0 - 0.2, top - 0.35, b - 0.08, sa1 + 0.2, top, b + 0.08, TS.BEAM);
    lbox(deco, fr, sa0 - 0.2, top - 0.35, 2, sa0, top, D - 2, TS.BEAM);
    lbox(deco, fr, sa1, top - 0.35, 2, sa1 + 0.2, top, D - 2, TS.BEAM);
    for (let b = 4; b < D - 2; b += 6) P.pendant(deco, k.wx(ac + 0.5, b), k.wz(ac + 0.5, b), top, 3.2, { long: true, alongX: alongX(fr), radius: 11, flicker: rng.chance(0.2) });
    for (let b = 6; b < D - 3; b += 8) llight(deco, fr, W - 5, T2 + 1.6, b, P.FLUO, 7);
    for (const ld of [2, 3]) k.onWall(ld, 1, 1, (p) => P.camera(deco, p, T2 + 4.5), { want: rng.int(6, W - 4), walk: true, margin: 0, from: 6, to: W - 3 });
    k.onWall(rng.pick([2, 3]), 1, 1, (p) => P.wallTV(deco, P.sub(p, 0, 0, 1, 0.5), y + 3.2), { want: ac, walk: true, margin: 1, from: 7, to: W - 4 });
    for (const p of k.ports((q) => q.kind === 'sally')) sallyGate(k, p);
    M.room.bossSpot = { a: ac + 0.5, b: D / 2 };
  },

  // ---------------------------------------------------------- control hub
  // the guard booth on a raised dais in the middle (glass, consoles), a
  // flight up to it; the sally ports' gates standing open; lanes painted on
  // the floor; benches and lockers along the walls
  hub(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr, g } = k;
    const DH = 1.8;
    const da0 = Math.floor(W / 2) - 3, db0 = Math.floor(D / 2) - 2;
    let built = false;
    for (const side of rng.shuffle([0, 1])) {
      const fa0 = side === 0 ? da0 + 5 : da0 - 3;
      if (!k.free(da0, db0, da0 + 5, db0 + 5) || !k.free(fa0, db0 + 1, fa0 + 3, db0 + 3) || !k.free(side === 0 ? fa0 + 3 : fa0 - 1, db0 + 1, side === 0 ? fa0 + 4 : fa0, db0 + 3)) continue;
      k.floorRect(da0, db0, da0 + 5, db0 + 5, y + DH, { floorTex: TS.FLOOR2, wallTex: TS.METAL });
      k.use(da0, db0, da0 + 5, db0 + 5);
      k.flight(fa0, db0 + 1, 3, 2, side === 0 ? 1 : 0, y, y + DH, STEEL_STAIR);
      k.rail(k.cells(da0, db0, da0 + 5, db0 + 5), { style: 'metal' });
      P.boothGlass(deco, fr, da0 + 0.3, db0 + 0.3, da0 + 4.7, db0 + 4.7, y + DH, 2.3, side, db0 + 2);
      // consoles facing out over the hub, a chair, the monitor bank
      const cy = y + DH;
      con(k, da0 + 2, db0 + 1, cy, 3, 2.4);
      con(k, da0 + 2, db0 + 3, cy, 2, 2.4);
      MP.chair(deco, P.pf(fr, da0 + 1, db0 + 2, da0 + 4, db0 + 3, 2), 1.5, 0.5, cy, { back: 0.9 });
      lbox(deco, fr, da0 + 2.2, top - 0.4, db0 + 2.2, da0 + 2.8, top, db0 + 2.8, TS.METAL);
      P.pendant(deco, k.wx(da0 + 2.5, db0 + 2.5), k.wz(da0 + 2.5, db0 + 2.5), top, top - cy - 3.0, { radius: 9 });
      // the dais face: hazard band at the foot
      each(fr, da0 - 1, db0 - 1, da0 + 6, db0 + 6, (a, b) => {
        if (!k.mine(a, b) || k.res(a, b) || Math.abs(k.fl(a, b) - y) > 0.01 || (g.flags[k.idx(a, b)] & (F.STAIR | F.DOOR))) return;
        if (a >= da0 && a < da0 + 5 && b >= db0 && b < db0 + 5) return;
        g.floorTex[k.idx(a, b)] = TS.ACCENT;
      });
      built = true;
      break;
    }
    // painted lanes from the doors toward the middle
    for (const p of k.ports()) {
      const back = OPP[p.dir], da = back === 0 ? 1 : back === 1 ? -1 : 0, db = back === 2 ? 1 : back === 3 ? -1 : 0;
      const [a0, b0] = p.cells[0], [a1, b1] = p.cells[p.cells.length - 1];
      for (let t = 0; t < 12; t++) for (const [ea, eb] of [[a0 - (p.dir < 2 ? 0 : 1), b0 - (p.dir < 2 ? 1 : 0)], [a1 + (p.dir < 2 ? 0 : 1), b1 + (p.dir < 2 ? 1 : 0)]]) {
        const a = ea + da * t, b = eb + db * t;
        if (!k.mine(a, b) || Math.abs(k.fl(a, b) - y) > 0.01 || (g.flags[k.idx(a, b)] & (F.STAIR | F.DOOR))) continue;
        if (g.floorTex[k.idx(a, b)] === TS.FLOOR) g.floorTex[k.idx(a, b)] = TS.FLOOR3;
      }
    }
    // gates at the sally ports, benches and lockers on the walls
    for (const p of k.ports((q) => q.kind === 'sally')) sallyGate(k, p);
    for (const ld of rng.shuffle([0, 1, 2, 3])) k.onWall(ld, 3, 1, (p) => P.lockers(deco, P.sub(p, 0.05, 0, 2.95, 0.5), y), { random: true });
    for (const ld of rng.shuffle([0, 1, 2, 3])) k.onWall(ld, 3, 1, (p) => MP.bench(deco, P.sub(p, 0.1, 0.05, 2.9, 0.6), y), { random: true });
    for (const ld of [0, 1, 2, 3]) k.onWall(ld, 1, 1, (p) => P.camera(deco, p, top - 1.2), { random: true, walk: true, margin: 0 });
    // the monitor bank on a free wall
    k.onWall(rng.pick([0, 1, 2, 3]), 4, 1, (p) => {
      for (let s = 0; s < 4; s++) for (let r = 0; r < 2; r++) lbox(deco, p, s + 0.05, y + 1.4 + r * 0.75, 0, s + 0.95, y + 2.05 + r * 0.75, 0.12, { side: TS.METAL, top: TS.METAL, pz: TS.SCREEN, nz: TS.SCREEN, px: TS.SCREEN, nx: TS.SCREEN }, { uv: 'fit', emissive: 0.45 });
      lbox(deco, p, 0, y, 0, 4, y + 0.85, 0.7, TS.MACHINE, { solid: true, uv: 'fit' });
    }, { random: true });
    if (!built) ceilingStrips(k, 0, 0, W, D, 5, { pendant: true, drop: 2.5 });
    else ceilingStrips(k, 0, 0, W, D, 7, { pendant: true, drop: 2.5 });
    M.room.bossSpot = { a: built ? da0 + 2.5 : W / 2, b: built ? Math.min(D - 2, db0 + 7) : D / 2 };
  },

  // ---------------------------------------------------------- intake
  // the front doors, a walk-through detector and the X-ray belt, the
  // reception counter behind glass, a holding cage, property shelves
  intake(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    const fd = k.ports((p) => p.kind === 'frontdoor')[0];
    const fc = fd ? (fd.s0 + fd.s1) / 2 : W / 2;
    // detectors across the walkway from the front doors
    if (fd && k.free(Math.floor(fc - 1.5), 3, Math.ceil(fc + 1.5), 4)) {
      P.detector(deco, P.pf(fr, fc - 1.4, 3.2, fc + 1.4, 3.8, 2), y);
      k.use(Math.floor(fc - 1.5), 3, Math.ceil(fc + 1.5), 4);
      if (k.take(Math.ceil(fc + 1.5), 2, Math.ceil(fc + 1.5) + 1, 5, 0)) lbox(deco, fr, Math.ceil(fc + 1.5) + 0.1, y, 2.2, Math.ceil(fc + 1.5) + 0.9, y + 0.95, 4.8, { side: TS.METAL, top: TS.FLOOR2, bottom: TS.METAL }, { solid: true });
    }
    // the reception counter: a run along one side wall, glass above it
    const side = rng.pick([0, 1]);
    const ca = side === 0 ? W - 3 : 2;
    const cb0 = 2, cb1 = Math.min(D - 2, 8);
    if (k.free(Math.min(ca, ca + (side === 0 ? 1 : -1)), cb0, Math.max(ca, ca + (side === 0 ? 1 : -1)) + 1, cb1) && !portOn(k, side, cb0 - 1, cb1 + 1)) {
      const a0 = side === 0 ? ca : ca, a1 = a0 + 1;
      k.take(Math.min(a0, side === 0 ? a0 : a0 - 1), cb0, Math.max(a1, side === 0 ? a1 + 1 : a1), cb1, 0);
      lbox(deco, fr, a0 + 0.1, y, cb0, a1 - 0.1, y + 1.05, cb1, { side: TS.WOOD, top: TS.METAL, bottom: TS.WOOD }, { solid: true });
      lbox(deco, fr, a0 + 0.4, y + 1.05, cb0, a0 + 0.46, y + 2.6, cb1, TS.GLASS_PLAIN, { emissive: 0.2, solid: true });
      for (let b = cb0; b <= cb1; b += 2) lbox(deco, fr, a0 + 0.38, y + 1.05, b - 0.04, a0 + 0.48, y + 2.65, b + 0.04, TS.METAL, { faces: FACE.SIDES });
      lbox(deco, fr, a0 + 0.35, y + 2.6, cb0, a0 + 0.5, y + 2.7, cb1, TS.METAL);
      const back = side === 0 ? a1 + 0.5 : a0 - 0.5;
      con(k, Math.floor(back), Math.floor((cb0 + cb1) / 2), y, side === 0 ? 1 : 0, 2.2);
    }
    // the holding cage on the other side, its gate open, a bench inside
    const os = 1 - side;
    const hd = 4, hb0 = Math.max(2, D - hd - 2), hb1 = hb0 + hd;
    const ha0 = os === 0 ? W - 4 : 0, ha1 = ha0 + 4;
    if (hb1 <= D - 1 && k.take(ha0, hb0, ha1, hb1, 0) && !portOn(k, os, hb0 - 1, hb1 + 1)) {
      const front = os === 0 ? ha0 : ha1;
      const pA = (b) => [k.wx(front, b), k.wz(front, b)];
      const [x0, z0] = pA(hb0), [x1, z1] = pA(hb0 + 1.2);
      P.barRun(deco, x0, z0, x1, z1, y, y + 2.8, { solid: true });
      const [x2, z2] = pA(hb0 + 2.4), [x3, z3] = pA(hb1);
      P.barRun(deco, x2, z2, x3, z3, y, y + 2.8, { solid: true });
      for (const b of [hb0, hb1]) {
        const e0 = [k.wx(ha0, b), k.wz(ha0, b)], e1 = [k.wx(ha1, b), k.wz(ha1, b)];
        P.barRun(deco, e0[0], e0[1], e1[0], e1[1], y, y + 2.8, { solid: true });
      }
      lbox(deco, fr, ha0, y + 2.8, hb0, ha1, y + 2.9, hb1, TS.RAIL, { faces: FACE.BOTTOM | FACE.TOP });
      const ba0 = os === 0 ? W - 0.6 : 0, ba1 = ba0 + 0.6;
      lbox(deco, fr, ba0, y + 0.42, hb0 + 0.3, ba1, y + 0.48, hb1 - 0.3, TS.METAL);
    }
    // property shelves and chairs on the free walls
    for (const ld of rng.shuffle([2, 3, 0, 1])) k.onWall(ld, 3, 1, (p) => MP.shelves(deco, P.sub(p, 0.1, 0, 2.9, 0.42), y, 2.2), { random: true });
    for (const ld of rng.shuffle([3, 2])) k.onWall(ld, 3, 1, (p) => MP.bench(deco, P.sub(p, 0.1, 0.05, 2.9, 0.6), y), { random: true });
    for (const p of k.ports((q) => q.kind === 'sally')) sallyGate(k, p);
    ceilingStrips(k, 0, 0, W, D, 4);
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- the warden's office
  warden(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr } = k;
    // the desk facing the door, the flags behind it
    const dl = rng.pick([0, 1, 2, 3]);
    k.onWall(dl, 3, 3, (p) => {
      MP.desk(deco, P.sub(p, 0.2, 1.4, 2.8, 2.2), y);
      MP.chair(deco, p, 1.5, 0.9, y, { back: 1.3 });
      for (const a of [0.3, 2.7]) {
        lbox(deco, p, a - 0.03, y, 0.2, a + 0.03, y + 2.4, 0.26, TS.METAL, { faces: FACE.SIDES });
        lbox(deco, p, a + 0.03, y + 1.5, 0.2, a + 0.03 + (a < 1 ? 0.7 : -0.7), y + 2.3, 0.23, TS.FABRIC);
      }
      MP.chair(deco, p, 0.9, 2.9, y);
      MP.chair(deco, p, 2.1, 2.9, y);
    }, {});
    for (const ld of rng.shuffle([0, 1, 2, 3])) k.onWall(ld, 2, 1, (p) => MP.bookcase(deco, P.sub(p, 0.05, 0, 1.95, 0.45), y, 2.4), { random: true });
    for (let t = 0; t < 2; t++) for (const ld of rng.shuffle([0, 1, 2, 3])) if (k.onWall(ld, 1, 1, (p) => P.filingCabinet(deco, P.sub(p, 0.1, 0, 0.9, 0.6), y), { random: true })) break;
    // a sofa and a low table, a safe
    for (const ld of rng.shuffle([0, 1, 2, 3])) if (k.onWall(ld, 3, 2, (p) => { MP.sofa(deco, P.sub(p, 0.2, 0, 2.8, 0.9), y); MP.table(deco, P.sub(p, 0.8, 1.3, 2.2, 1.9), y, { h: 0.45 }); }, { random: true })) break;
    for (const ld of rng.shuffle([0, 1, 2, 3])) if (k.onWall(ld, 1, 1, (p) => lbox(deco, p, 0.1, y, 0, 0.9, y + 1.1, 0.75, { side: TS.METAL, top: TS.METAL, pz: TS.MACHINE, nz: TS.MACHINE, px: TS.MACHINE, nx: TS.MACHINE }, { solid: true, uv: 'fit' }), { random: true })) break;
    for (const ld of [0, 1, 2, 3]) for (let s = 2; s < k.wallLen(ld) - 2; s += 5) {
      if (!k.wallClear(ld, s, s + 1.4, 0) || wallTaken(k.r, ld, s, s + 1.4, y + 1.4, y + 2.5)) continue;
      MP.painting(deco, k.wallFrame(ld, s, s + 1.4, 0.1, 0.04), y + 1.5, y + 2.4, { frame: TS.WOOD, canvas: TS.FABRIC, emissive: 0.05 });
      markWall(k, ld, s, s + 1.4, y + 1.4, y + 2.5);
    }
    ceilingStrips(k, 0, 0, W, D, 5, { radius: 6 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- the armory
  armory(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr } = k;
    for (const ld of [0, 1, 2, 3]) for (let t = 0; t < 2; t++) k.onWall(ld, 3, 1, (p) => P.gunRack(deco, P.sub(p, 0.1, 0, 2.9, 0.45), y, rng), { random: true });
    for (const ld of rng.shuffle([0, 1, 2, 3])) if (k.onWall(ld, 3, 1, (p) => P.lockers(deco, P.sub(p, 0.05, 0, 2.95, 0.5), y), { random: true })) break;
    // ammo crates and a workbench in the middle
    for (let t = 0; t < 10; t++) {
      const a = rng.int(2, W - 3), b = rng.int(2, D - 3);
      if (!k.take(a, b, a + 1, b + 1, 1)) continue;
      P.crates(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, rng, rng.int(2, 3));
    }
    const ca = Math.floor(W / 2) - 1, cb = Math.floor(D / 2) - 1;
    if (k.take(ca, cb, ca + 2, cb + 1, 0)) MP.table(deco, P.pf(fr, ca + 0.1, cb + 0.1, ca + 1.9, cb + 0.9, 2), y, { tex: TS.METAL, h: 0.9 });
    ceilingStrips(k, 0, 0, W, D, 4, { radius: 6, flicker: 0.3 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- the infirmary
  infirmary(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // a ward of beds, heads against the long walls
    for (const ld of [2, 3]) {
      for (let s = 1; s + 2 <= W - 1; s += 3) {
        k.onWall(ld, 2, 3, (p) => {
          P.hospitalBed(deco, P.sub(p, 0.4, 0.05, 1.6, 2.4), y, { curtain: rng.chance(0.7) });
          if (rng.chance(0.4)) P.ivStand(deco, p.px(1.85, 0.4), p.pz(1.85, 0.4), y);
        }, { from: s, to: s + 2 });
      }
    }
    for (const ld of [0, 1]) k.onWall(ld, 2, 1, (p) => P.medCabinet(deco, P.sub(p, 0.05, 0, 1.95, 0.45), y), { random: true });
    // the operating table under its lamp, in a free spot
    for (let t = 0; t < 12; t++) {
      const a = rng.int(2, W - 4), b = rng.int(3, D - 4);
      if (!k.take(a - 1, b - 1, a + 2, b + 2, 0)) continue;
      P.operatingTable(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, !alongX(fr), top);
      break;
    }
    for (const ld of rng.shuffle([0, 1])) if (k.onWall(ld, 3, 2, (p) => { MP.desk(deco, P.sub(p, 0.2, 0, 2.8, 0.8), y); MP.chair(deco, p, 1.5, 1.3, y); }, { random: true })) break;
    ceilingStrips(k, 0, 0, W, D, 4, { radius: 6, flicker: 0.25 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- mess hall
  mess(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr } = k;
    // the serving counter along a wall without doors (the kitchen pass behind)
    for (const ld of rng.shuffle([2, 3, 0, 1])) {
      const L = k.wallLen(ld);
      if (k.onWall(ld, Math.min(8, L - 4), 2, (p) => {
        P.servingCounter(deco, P.sub(p, 0, 1.0, p.la, 1.95), y);
        lbox(deco, p, 0.5, y + 1.6, 0, p.la - 0.5, y + 2.4, 0.06, { side: TS.METAL, top: TS.METAL, pz: TS.SCREEN, nz: TS.SCREEN }, { uv: 'fit', emissive: 0.3 });
      }, {})) break;
    }
    // tables in rows
    const ax = alongX(fr);
    for (let b = 3; b + 2 <= D - 2; b += 3) for (let a = 2; a + 2 <= W - 1; a += 4) {
      if (!k.take(a, b - 1, a + 3, b + 2, 0)) continue;
      P.steelTable(deco, k.wx(a + 1.5, b + 0.5), k.wz(a + 1.5, b + 0.5), y, !ax);
    }
    for (const ld of [0, 1, 2, 3]) k.onWall(ld, 1, 1, (p) => P.camera(deco, p, y + 4.2), { random: true, walk: true, margin: 0 });
    ceilingStrips(k, 0, 0, W, D, 4, { pendant: true, drop: 1.6, radius: 7 });
    for (const p of k.ports((q) => q.kind === 'sally')) sallyGate(k, p);
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- laundry + boiler pit
  laundry(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr, g } = k;
    // the boiler pit, 10 x 5 and 3.6 deep, wherever it clears the doorways
    // (a ring of floor round it for the rails, the flight down inside it)
    let pit = null;
    const PW = Math.min(11, W - 4), PD = 5;
    const spots = [];
    for (let a0 = 1; a0 + PW <= W - 1; a0++) for (let b0 = 1; b0 + PD <= D - 1; b0++) spots.push([a0, b0]);
    for (const [a0, b0] of rng.shuffle(spots)) {
      if (PW < 9 || b0 < 1 || b0 + PD > D - 1 || !k.free(a0, b0, a0 + PW, b0 + PD, 0)) continue;
      // the ring round it stays plain walkable floor (it may be a doorway's approach)
      let ring = true;
      each(fr, a0 - 1, b0 - 1, a0 + PW + 1, b0 + PD + 1, (a, b) => {
        if (a >= a0 && a < a0 + PW && b >= b0 && b < b0 + PD) return;
        if (!k.mine(a, b) || k.used(a, b) || Math.abs(k.fl(a, b) - y) > 0.01 || (g.flags[k.idx(a, b)] & (F.STAIR | F.DOOR))) ring = false;
      });
      if (!ring) continue;
      pit = [a0, b0, a0 + PW, b0 + PD];
      break;
    }
    if (pit) {
      const [pa0, pb0, pa1, pb1] = pit;
      k.floorRect(pa0, pb0, pa1, pb1, PIT, { floorTex: TS.FLOOR2, wallTex: TS.PITWALL });
      each(fr, pa0, pb0, pa1, pb1, (a, b) => { const i = k.idx(a, b); if (i >= 0) g.flags[i] |= F.NOSPAWN; });
      k.use(pa0 - 1, pb0 - 1, pa1 + 1, pb1 + 1);
      // the flight down along the pit's side, entered from the floor beyond its -a end
      const fb = rng.chance(0.5) ? pb0 : pb1 - 2;
      k.flight(pa0, fb, 6, 2, 1, PIT, y, CONCRETE_STAIR);
      P.boiler(deco, fr, pa0 + 7, pb0 + 0.6, pa1 - 0.4, pb1 - 0.6, PIT, top);
      const rim = [];
      each(fr, pa0 - 1, pb0 - 1, pa1 + 1, pb1 + 1, (a, b) => { if (k.mine(a, b) && Math.abs(k.fl(a, b) - y) < 0.01) rim.push(k.idx(a, b)); });
      k.rail(rim, { style: 'metal' });
      for (let t = 0; t < 3; t++) lbox(deco, fr, pa1 - 1.2 + t * 0.35, PIT + 0.5, pb0 + 0.2, pa1 - 0.95 + t * 0.35, top, pb0 + 0.45, TS.PIPE);
      llight(deco, fr, (pa0 + pa1) / 2, PIT + 2.2, (pb0 + pb1) / 2, [1, 0.55, 0.25], 8, { flicker: true });
    }
    // washers and dryers along the walls, folding tables, carts
    for (const ld of [0, 1, 2, 3]) for (let t = 0; t < 6; t++) k.onWall(ld, 1, 1, (p) => P.washer(deco, P.sub(p, 0.05, 0, 0.95, 0.85), y, rng.chance(0.4)), { random: true });
    for (let t = 0; t < 4; t++) {
      const a = rng.int(2, W - 4), b = rng.int(2, D - 3);
      if (!k.take(a, b, a + 2, b + 1, 1)) continue;
      MP.table(deco, P.pf(fr, a + 0.1, b + 0.1, a + 1.9, b + 0.9, 2), y, { tex: TS.METAL, h: 0.9 });
      lbox(deco, fr, a + 0.3, y + 0.9, b + 0.2, a + 1.2, y + 1.1, b + 0.75, TS.FABRIC, { faces: FACE.SIDES | FACE.TOP });
    }
    for (let t = 0; t < 5; t++) {
      const a = rng.int(1, W - 2), b = rng.int(1, D - 2);
      if (!k.take(a, b, a + 1, b + 1, 0)) continue;
      P.laundryCart(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y);
    }
    ceilingStrips(k, 0, 0, W, D, 5, { pendant: true, drop: 1.5, radius: 7, flicker: 0.3 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- solitary
  // a corridor along the side with the doors, the cells off its far side
  // behind heavy steel doors standing open; red lamps
  solitary(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr, g } = k;
    each(fr, 0, 0, W, D, (a, b) => { if (k.mine(a, b)) g.light[k.idx(a, b)] *= 0.55; });
    // which long side has the doorways (the corridor runs along it)
    const near = k.ports().some((p) => p.dir === 3) || !k.ports().some((p) => p.dir === 2) ? 3 : 2;
    const cd = D - 3 - 1;   // cell depth
    if (cd >= 2) {
      const cb0 = near === 3 ? 4 : 0, cb1 = cb0 + cd;
      const R = rhythm(W);
      const wallAt = (a) => a < R.start || a >= R.end || (a - R.start) % 4 === 3;
      for (let a = 0; a < W; a++) {
        if (portOn(k, 0, cb0, cb1) || portOn(k, 1, cb0, cb1)) { /* end doors stay open */ }
        if (!wallAt(a)) continue;
        for (let b = cb0; b < cb1; b++) if (!(a === W - 1 && portOn(k, 0, b, b + 1)) && !(a === 0 && portOn(k, 1, b, b + 1)) && !k.res(a, b)) solidCell(k, a, b);
      }
      // the front wall line of the cells: a lintel and the doors standing open
      const fb = near === 3 ? cb0 : cb1;
      for (let j = 0; j < R.n; j++) {
        const c0 = R.start + 4 * j;
        each(fr, c0, cb0, c0 + 3, cb1, (a, b) => { const i = k.idx(a, b); if (i >= 0 && k.mine(a, b)) { g.ceil[i] = y + 2.8; g.light[i] *= 0.6; } });
        const [x0, z0, x1, z1] = fr.rect(c0 + 0.15, fb - 0.06, c0 + 1.05, fb + 0.06);
        deco.box(x0, y, z0, x1, y + 2.4, z1, TS.METAL, { solid: false });
        lbox(deco, fr, c0, y + 2.4, fb - 0.12, c0 + 3, y + 2.8, fb + 0.12, TS.METAL);
        // a mattress on the floor, a bucket
        const ib = near === 3 ? cb1 - 1.0 : cb0 + 0.1;
        lbox(deco, fr, c0 + 0.3, y, ib, c0 + 2.6, y + 0.15, ib + 0.9, TS.FABRIC, { faces: FACE.SIDES | FACE.TOP });
        llight(deco, fr, c0 + 1.5, y + 2.4, (cb0 + cb1) / 2, P.ALARM, 3, { pulse: rng.chance(0.4) });
      }
      k.use(0, cb0, W, cb1);
    }
    // the corridor: caged lamps down the middle
    const mb = near === 3 ? 1.5 : D - 1.5;
    for (let a = 2; a < W - 1; a += 4) P.pendant(deco, k.wx(a, mb), k.wz(a, mb), y + k.r.ceilH, 0.4, { radius: 5, color: [1, 0.35, 0.25], flicker: rng.chance(0.3) });
    M.room.bossSpot = { a: W / 2, b: mb };
  },
};

// ======================================================================
// finishing: skirting, barred windows on outside walls, door frames
// ======================================================================
const NO_WINDOWS = new Set(['block', 'solitary', 'hub']);
export function finishPrison(M) {
  const { g, deco } = M;
  for (const r of M.P.rooms) {
    if (r.sky) continue;
    const k = new Kit(M, r);
    const cells = [];
    for (let b = 0; b < r.dv; b++) for (let a = 0; a < r.du; a++) if (k.mine(a, b)) cells.push(k.idx(a, b));
    r.cells = cells;
    if (r.kind === 'warden') deco.wallTrims(cells, { base: 0.2, wainscot: 1.0, crown: true, wainTex: TS.WOOD, baseTex: TS.WOOD, crownTex: TS.TRIM });
    else deco.wallTrims(cells, { base: 0.25, wainscot: r.kind === 'mess' || r.kind === 'infirmary' || r.kind === 'intake' ? 1.2 : 0, crown: false, baseTex: TS.TRIM, wainTex: TS.FLOOR3 });
    if (!NO_WINDOWS.has(r.kind)) windows(k);
    for (const p of r.ports) if (p.active) doorFrame(k, p);
    void g;
  }
}
// barred windows high on the outside walls, every four cells
function windows(k) {
  const { g, deco } = k;
  for (const ld of [0, 1, 2, 3]) {
    const L = k.wallLen(ld);
    for (let s = 2; s + 1 < L - 1; s += 4) {
      if (!outside(k, ld, s) || !k.wallClear(ld, s - 1, s + 2, 0)) continue;
      const [a, b] = wallCell(k, ld, s);
      if (!k.mine(a, b)) continue;
      const i = k.idx(a, b);
      if (g.flags[i] & (F.STAIR | F.PIT)) continue;
      const f = g.floor[i], ceil = g.ceil[i];
      const y0 = f + 1.6, y1 = Math.min(ceil - 0.4, f + 3.4);
      if (y1 - y0 < 1.0 || wallTaken(k.r, ld, s - 0.3, s + 1.3, y0 - 0.3, y1 + 0.3)) continue;
      const x = i % g.w, z = (i / g.w) | 0;
      deco.window(x, z, k.fr.dir(ld), y0, y1, { emissive: 0.3 });
      markWall(k, ld, s - 0.2, s + 1.2, y0 - 0.3, y1 + 0.3);
    }
  }
}
// a steel frame round a doorway on this room's side
function doorFrame(k, p) {
  const { deco, fr, g } = k;
  const h = p.h, topY = h + (p.link.w >= 3 ? 3.4 : 3.0);
  const [ca, cb] = p.cells[0];
  const i = k.idx(ca, cb);
  if (i < 0 || g.ceil[i] < topY + 0.3) return;
  const ld = p.dir;
  const box = (s0, s1, y0, y1) => { const [a0, b0, a1, b1] = k.strip(ld, s0, s1, 0.1); lbox(deco, fr, a0, y0, b0, a1, y1, b1, TS.METAL, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM }); };
  box(p.s0 - 0.18, p.s0, h, topY);
  box(p.s1, p.s1 + 0.18, h, topY);
  box(p.s0 - 0.2, p.s1 + 0.2, topY, topY + 0.2);
  markWall(k, ld, p.s0 - 0.3, p.s1 + 0.3, h, topY + 0.3);
}
export { BLDG_TOP, GF, T2, PIT };
