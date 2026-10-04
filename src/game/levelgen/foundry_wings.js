// Wing rooms of the "foundry" archetype (see gen_foundry.js / foundry_rooms.js):
// furnace hall, production line, control room, loading dock, pipe gallery,
// boiler house, ore store, gear pit (clockwork), hook hall and cold room
// (meat plant), magma breach (volcano base). Each one is built in a wall frame
// and verified (exits connected, floor reachable) before it is kept.
import { TS, F, OPP, DIR_X, DIR_Z } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import { TEMPLATES } from './gen_arch.js';
import {
  cellsOf, canUse, use, flatOpen, canUseL, useL, okL, ok, setHeightL, retexFloor, flightL, wallSpots, wallBox, hangLight, paint,
  hazardLines, deckBridge, pitSet, openShape, largestBlob, upperWindows, edgeCells, freeMask, bestRect, markMask, glassWall,
  machineBlock, cabinet, riser, steelTable, monitor,
} from './lab_templates.js';
import * as P from './foundry_props.js';
import {
  FT, no, hookRail, tryFrames, sidesLong, fv, groundL, cellL, moltenKind, railAll, highBay, wallLamps, wallPipes, chains, gallery,
  deckFace, gearPit, dressFloor,
} from './foundry_rooms.js';

const { faced, fbox, fcollider, MOLTEN, COLD, WARM, SODIUM, BLOODL } = P;

// longest run [a, b) of s in [0, Wd) where test(s) holds
function longestRun(Wd, test, minLen = 1) {
  let best = null;
  for (let a = 0; a < Wd; a++) {
    let b = a;
    while (b < Wd && test(b)) b++;
    if (b - a >= minLen && (!best || b - a > best[1] - best[0])) best = [a, b];
    a = b;
  }
  return best;
}
// world-rect helpers in frame coordinates
const rectL = (Fr, t0, s0, dt, ds) => Fr.rect(t0, s0, dt, ds);
// sink frame rect cells into a hazard (pit when depth > 1)
function pitL(ctx, Fr, t0, s0, dt, ds, kind, depth) {
  const cells = cellsOf(ctx.g, ...rectL(Fr, t0, s0, dt, ds));
  pitSet(ctx, cells, kind, depth);
  for (const i of cells) ctx.used.add(i);
  return cells;
}
// 2-wide (or w-wide) catwalk over hazard cells of a frame rect
function bridgeL(ctx, Fr, t0, s0, dt, ds, y, o) {
  const out = [];
  for (const i of cellsOf(ctx.g, ...rectL(Fr, t0, s0, dt, ds))) { const x = i % ctx.g.w, z = (i / ctx.g.w) | 0; out.push(...deckBridge(ctx, x, z, 1, 1, y, o)); }
  return out;
}
// small items on free 2x2 spots
function scatterStock(ctx, n, place, margin = 1) {
  const { g, rng, room: r } = ctx;
  let placed = 0;
  for (let k = 0; k < n * 8 && placed < n; k++) {
    const x = rng.int(r.x, r.x + r.w - 2), z = rng.int(r.z, r.z + r.h - 2);
    if (!ok(ctx, x, z, 2, 2, 0, margin)) continue;
    let near = false;
    for (const i of cellsOf(g, x - 1, z - 1, 4, 4)) if ((g.flags[i] & (F.PIT | F.STAIR | F.BRIDGE | F.HAZARD)) || r.reserved.has(i)) near = true;
    if (near) continue;
    if (place(x, z) === false) continue;
    use(ctx, x, z, 2, 2);
    placed++;
  }
  return placed;
}

// ======================================================================
// FURNACE HALL: a row of furnaces tapping into a molten channel that runs to
// a pouring pit under a ladle; casting beds of ingot moulds, slag pots
// ======================================================================
FT.fd_furnace = function fdFurnace(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr, last) => buildFurnaceHall(ctx, Fr, last), (c) => { TEMPLATES.storage(c); });
};
function buildFurnaceHall(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 7 || Wd < 8) return no(ctx, 'FurnaceHall1');
  const top = r.floor + r.ceilH;
  const run = longestRun(Wd, (s) => okL(ctx, Fr, 0, s, 3, 1, 0, 0) && canUseL(ctx, Fr, 0, s, 3, 1, last ? 0 : 1, 0), 3);
  if (!run) return no(ctx, 'FurnaceHall2');
  let [a, b] = run;
  if (a === 0 && b - a > 3) a = 1;
  if (b === Wd && b - a > 3) b = Wd - 1;
  // the pouring pit at one end of the furnace row when the run is long enough
  const pitEnd = rng.chance(0.5);
  let pit0 = -1;
  if (b - a >= 7) {
    const p = pitEnd ? b - 3 : a;
    if (okL(ctx, Fr, 1, p, 3, 3, 0, 0) && groundL(ctx, Fr, 4, p, 1, 3)) pit0 = p;
  }
  const f0 = pit0 >= 0 && !pitEnd ? pit0 + 4 : a, f1 = pit0 >= 0 && pitEnd ? pit0 - 1 : b;
  const nF = Math.min(4, Math.floor((f1 - f0 + 1) / 4));
  if (nF < 1) return no(ctx, 'FurnaceHall3');
  const kind = moltenKind(ctx);
  const cold = fv(ctx) === 'meat';
  for (let k = 0; k < nF; k++) {
    const s = f0 + k * 4;
    P.furnace(ctx, Fr, s, 3, r.floor, { cold, h: 3.4 + (k % 2) * 0.4 });
    useL(ctx, Fr, 0, s, 2, 3);
  }
  // the tapping channel in front of the furnaces (to the pit when there is one)
  const fEnd = f0 + nF * 4 - 1;
  const c0 = pit0 >= 0 && !pitEnd ? pit0 + 3 : f0, c1 = pit0 >= 0 && pitEnd ? pit0 : fEnd;
  pitL(ctx, Fr, 2, c0, 1, c1 - c0, kind, 0.45);
  useL(ctx, Fr, 0, Math.min(c0, f0), 3, Math.max(c1, fEnd) - Math.min(c0, f0));
  let pitT = 1, pitS = pit0;
  if (pit0 >= 0) { pitL(ctx, Fr, 1, pit0, 3, 3, kind, 2.6); useL(ctx, Fr, 0, pit0, 4, 3); }
  else {
    // a separate pouring pit out on the floor
    const m = freeMask(ctx, Fr, 1);
    const pr = bestRect(m, { t0: 4, minT: 3, maxT: 3, minS: 3, maxS: 3, score: (t, s2) => -Math.abs(s2 + 1.5 - Wd / 2) - t * 0.3 });
    if (pr && groundL(ctx, Fr, pr.t - 1, pr.s, 1, 3) && groundL(ctx, Fr, pr.t + 3, pr.s, 1, 3)) { pitL(ctx, Fr, pr.t, pr.s, 3, 3, kind, 2.6); pitT = pr.t; pitS = pr.s; }
  }
  // runner troughs from each spout into the channel
  for (let k = 0; k < nF; k++) {
    const sm = f0 + k * 4 + 1.5;
    fbox(deco, Fr, 2.0, 2.5, sm - 0.2, sm + 0.2, r.floor - 0.45, r.floor + 0.05, TS.METAL);
  }
  // monorail along the furnace row with a ladle over the pouring pit
  const yRail = top - 1.6;
  if (pitS >= 0) {
    const tr = pitT + 1.4;
    fbox(deco, Fr, tr - 0.17, tr + 0.18, 0, Wd, yRail, yRail + 0.45, TS.BEAM);
    for (let s = 1.5; s < Wd - 1; s += 4) fbox(deco, Fr, tr - 0.07, tr + 0.08, s, s + 0.15, yRail + 0.45, top, TS.METAL, { faces: FACE.SIDES });
    const [lx, lz] = Fr.pt(tr, pitS + 1.5);
    fbox(deco, Fr, tr - 0.55, tr + 0.55, pitS + 1.0, pitS + 2.0, yRail - 0.5, yRail, faced(Fr.away, TS.MACHINE, TS.METAL), { uv: 'fit' });
    const ly = r.floor + 1.6;
    deco.box(lx - 0.03, ly + 1.1 + 1.05, lz - 0.03, lx + 0.03, yRail - 0.5, lz + 0.03, TS.METAL, { faces: FACE.SIDES });
    P.ladle(ctx, lx, ly, lz, 0.75, { alongX: Fr.lat >= 2, lightR: 6 });
  }
  // casting beds: rows of ingot moulds (fresh ones glowing) on the open floor
  const m = freeMask(ctx, Fr, 1);
  const bed = bestRect(m, { t0: 4, minT: 2, maxT: 3, minS: 4, maxS: 8 });
  if (bed) {
    for (let t = bed.t; t < bed.t + bed.dt; t++) for (let s = bed.s; s < bed.s + bed.ds; s++) {
      for (const [dt, ds] of [[0.15, 0.1], [0.15, 0.55], [0.6, 0.1], [0.6, 0.55]]) {
        fbox(deco, Fr, t + dt, t + dt + 0.32, s + ds, s + ds + 0.36, r.floor, r.floor + 0.18, TS.METAL);
        const hot = rng.chance(0.45);
        fbox(deco, Fr, t + dt + 0.05, t + dt + 0.27, s + ds + 0.05, s + ds + 0.31, r.floor + 0.18, r.floor + 0.19, hot ? TS.LAVA : TS.SIDE, { emissive: hot ? 0.8 : 0, faces: FACE.TOP });
      }
    }
    useL(ctx, Fr, bed.t, bed.s, bed.dt, bed.ds);
    const [bx, bz] = Fr.pt(bed.t + bed.dt / 2, bed.s + bed.ds / 2);
    deco.light(bx, r.floor + 0.8, bz, MOLTEN, 4, { pulse: true });
  }
  // slag pots and ingot stacks
  scatterStock(ctx, 2, (x, z) => { P.ladle(ctx, x + 1, r.floor, z + 1, 0.6, { molten: rng.chance(0.4), solid: true, lightR: 3 }); });
  scatterStock(ctx, 2, (x, z) => { P.ingotStack(ctx, x + 1, z + 1, r.floor, rng.int(3, 5), { tex: fv(ctx) === 'clock' ? TS.PANEL : TS.METAL }); });
  railAll(ctx);
  hazardLines(ctx, ctx.cells.filter((i) => g.flags[i] & F.HAZARD));
  wallPipes(ctx, top - 2.2, 0.16, 1);
  if (fv(ctx) !== 'meat') chains(ctx, 3);
  highBay(ctx, 5, SODIUM);
  void COLD;
  return true;
}

// ======================================================================
// PRODUCTION LINE: two conveyor lines with crossings, presses straddling the
// belts, hoppers feeding them, a raised operator platform with consoles
// (meat plant: processing line with saws, steel tables and a hook rail)
// ======================================================================
FT.fd_line = function fdLine(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr, last) => buildLine(ctx, Fr, last), (c) => { TEMPLATES.storage(c); });
};
function buildLine(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const v = fv(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 8 || Wd < 11) return no(ctx, 'Line1');
  const top = r.floor + r.ceilH;
  // operator platform along the frame wall (one storey of steps up)
  const yP = r.floor + 1.8;
  const plat = L >= 10 ? gallery(ctx, Fr, 2, yP, { minDeck: 4 }) : null;
  if (!plat && !last && L >= 10) return no(ctx, 'Line2');
  const t0 = plat ? 4 : 2;
  const rows = [];
  for (let t = t0; t + 2 <= L - 1 && rows.length < 2; t += 4) rows.push(t);
  if (!rows.length) return no(ctx, 'Line3');
  const items = v === 'meat' ? 'meat' : v === 'clock' ? 'gears' : rng.pick(['ingots', 'glow', 'crates']);
  let lines = 0;
  const pressAt = [];
  for (const t of rows) {
    // free segments of the row (with the aisle on both sides free of exits)
    const segs = [];
    let cur = null;
    for (let s = 1; s < Wd - 1; s++) {
      const fine = okL(ctx, Fr, t, s, 1, 1, 0, 0) && canUseL(ctx, Fr, t - 1, s, 3, 1, 0, 0);
      if (fine) { if (!cur) cur = [s, s + 1]; else cur[1] = s + 1; } else if (cur) { segs.push(cur); cur = null; }
    }
    if (cur) segs.push(cur);
    for (const [a, b] of segs) {
      // chunks of 5-8 cells with 2-cell crossings between them
      for (let s = a; s + 3 <= b;) {
        const len = Math.min(b - s, rng.int(5, 8));
        if (len < 3) break;
        const [x0, z0, w, h] = rectL(Fr, t + 0.05, s + 0.1, 0.9, len - 0.2);
        P.conveyor(ctx, x0, z0, x0 + w, z0 + h, r.floor, { items, motor: rng.chance(0.6) });
        useL(ctx, Fr, t, s, 1, len);
        if (len >= 5) pressAt.push([t, s + Math.floor(len / 2) - 0.1]);
        lines++;
        // the crossing: hazard paint across the gap
        const cs = s + len;
        if (cs + 2 <= b) {
          const [px0, pz0, pw, ph] = rectL(Fr, t - 0.9, cs + 0.15, 2.8, 0.12);
          paint(ctx, px0, pz0, px0 + pw, pz0 + ph, r.floor);
          const [qx0, qz0, qw, qh] = rectL(Fr, t - 0.9, cs + 1.73, 2.8, 0.12);
          paint(ctx, qx0, qz0, qx0 + qw, qz0 + qh, r.floor);
        }
        s += len + 2;
      }
    }
  }
  if (!lines) return no(ctx, 'Line4');
  // stations on the belts: presses (saws in the meat plant)
  for (const [t, s] of pressAt) {
    if (v === 'meat') {
      // band saw beside the belt: a tall frame with a blade housing
      const [x0, z0, w, h] = rectL(Fr, t - 0.85, s, 0.75, 1.0);
      deco.box(x0, r.floor, z0, x0 + w, r.floor + 1.0, z0 + h, faced(Fr.away, TS.MACHINE, TS.METAL), { solid: true, uv: 'fit' });
      deco.box(x0 + 0.1, r.floor + 1.0, z0 + 0.1, x0 + w - 0.1, r.floor + 2.2, z0 + h - 0.1, TS.METAL);
      continue;
    }
    const [x0, z0, w, h] = rectL(Fr, t - 0.3, s - 0.1, 1.6, 1.3);
    P.press(ctx, x0, z0, x0 + w, z0 + h, r.floor, Math.min(3.0, r.ceilH - 1.8));
  }
  // hoppers over the first belt chunks (tall rooms)
  if (r.ceilH >= 6.5) {
    let hp = 0;
    for (const t of rows) {
      for (let s = 2; s < Wd - 2 && hp < 2; s++) {
        const i = cellL(ctx, Fr, t, s);
        if (!(g.flags[i] & F.OBSTACLE)) continue;
        const [hx, hz] = Fr.pt(t + 0.5, s + 0.6);
        P.hopper(ctx, hx, hz, r.floor + 2.4, 1.5, { ceil: top, chuteTo: r.floor + 0.85, fill: v === 'meat' ? TS.WALL2 : TS.ROCK });
        hp++;
        break;
      }
    }
  }
  // consoles on the platform facing the lines
  if (plat) {
    for (let s = plat.s0 + 1; s < plat.s1 - 1; s += 3) {
      const [x, z] = Fr.cell(1, s);
      deco.console(x, z, yP, Fr.away);
    }
    deckFace(ctx, plat);
  }
  // meat plant: a hook rail over the far aisle; steel tables
  if (v === 'meat') {
    const tA = rows[rows.length - 1] + 2;
    if (tA < L - 1) { const [ax, az] = Fr.pt(tA + 0.5, 1), [bx, bz] = Fr.pt(tA + 0.5, Wd - 1); hookRail(ctx, ax, az, bx, bz, r.floor + 3.5); }
    scatterStock(ctx, 2, (x, z) => { steelTable(ctx, x + 0.2, z + 0.5, x + 1.8, z + 1.3, r.floor, { top: TS.METAL }); });
  } else {
    scatterStock(ctx, 2, (x, z) => { P.pallet(ctx, x + 1, z + 1, r.floor, items === 'gears' ? 'crates' : rng.pick(['crates', 'drums'])); });
  }
  railAll(ctx);
  wallPipes(ctx, Math.min(top - 1.2, r.floor + 4.2), 0.14, 2);
  highBay(ctx, 4, v === 'meat' ? [0.9, 0.97, 1] : SODIUM);
  return true;
}

// ======================================================================
// CONTROL ROOM: screen wall and mimic panel, console rows facing it, a raised
// supervisor dais up steps with a rail, relay cabinets, windows
// ======================================================================
FT.fd_control = function fdControl(ctx) {
  tryFrames(ctx, sidesLong(ctx, false), (Fr, last) => buildControl(ctx, Fr, last), (c) => { TEMPLATES.control(c); });
};
function buildControl(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 7 || Wd < 7) return no(ctx, 'Control1');
  const yD = r.floor + 1.2;
  // the dais along the frame wall (t in [0, 3)), steps down the middle
  let dais = null;
  const run = longestRun(Wd, (s) => okL(ctx, Fr, 0, s, 3, 1, 0, 0) && canUseL(ctx, Fr, 0, s, 4, 1, 1, 0), 6);
  if (run) {
    const [a, b] = [Math.max(run[0], 1), Math.min(run[1], Wd - 1)];
    if (b - a >= 5) {
      const cells = setHeightL(ctx, Fr, 0, a, 3, b - a, yD, { floorTex: TS.FLOOR3, wallTex: TS.TRIM });
      const sm = Math.floor((a + b) / 2) - 1;
      // the steps cut into the dais front: 2 rows climbing toward the wall
      flightL(ctx, Fr, 1, sm, 2, 2, 'toward', r.floor, yD);
      useL(ctx, Fr, 0, a, 4, b - a);
      dais = { a, b, cells, sm };
    }
  }
  if (!dais && !last) return no(ctx, 'Control2');
  // screen wall on the opposite wall (t = L), mimic panel strip under it
  const Fs = frame(r, OPP[Fr.side]);
  const sr = longestRun(Wd, (s) => okL(ctx, Fs, 0, s, 1, 1, 0, 0), 3);
  if (sr) {
    fbox(deco, Fs, 0, 0.06, sr[0] + 0.2, sr[1] - 0.2, r.floor + 1.3, r.floor + Math.min(r.ceilH - 0.6, 3.6), TS.SCREEN, { uv: 'fit', emissive: 0.9, faces: FACE.SIDES });
    fbox(deco, Fs, 0, 0.5, sr[0] + 0.2, sr[1] - 0.2, r.floor, r.floor + 0.95, faced(Fs.away, TS.MACHINE, TS.METAL), { uv: 'fit', solid: true });
    useL(ctx, Fs, 0, sr[0], 1, sr[1] - sr[0]);
  }
  // console rows facing the screens
  const t0 = dais ? 5 : 2;
  for (let t = t0; t < L - 2; t += 3) {
    for (let s = 1; s < Wd - 1; s++) {
      if (s % 2 === 0) continue;
      if (!okL(ctx, Fr, t, s, 1, 1, 0, 1)) continue;
      const [x, z] = Fr.cell(t, s);
      deco.console(x, z, r.floor, Fr.away);
      useL(ctx, Fr, t, s, 1, 1);
    }
  }
  // supervisor desk on the dais with monitors
  if (dais) {
    for (const s of [dais.a + 1, dais.b - 3]) {
      if (s < dais.a || s + 2 > dais.b || (s <= dais.sm + 1 && s + 2 >= dais.sm)) continue;
      const [x0, z0, w, h] = rectL(Fr, 0.9, s, 0.7, 2);
      deco.box(x0, yD, z0, x0 + w, yD + 0.78, z0 + h, faced(Fr.away, TS.PANEL, TS.METAL, TS.WOOD), { solid: true });
      const [mx, mz] = Fr.pt(1.25, s + 1);
      monitor(ctx, mx, mz, yD + 0.78, Fr.away);
    }
    railAll(ctx);
  }
  // relay cabinets and windows along the side walls
  let cb = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (cb >= Math.floor((r.w + r.h) / 5)) break;
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    cabinet(ctx, x, z, d, r.floor, 2.1, 0.6, TS.MACHINE);
    use(ctx, x, z, 1, 1);
    cb++;
  }
  upperWindows(ctx, r.floor + 1.4, r.floor + Math.min(r.ceilH - 0.8, 3.0), 3, (x, z, d) => d !== Fs.toward);
  highBay(ctx, 3, [0.85, 0.95, 1]);
  return true;
}

// ======================================================================
// LOADING DOCK: a sunken truck bay along an outer wall with roll-up doors,
// trailers backed up to the dock edge, bumpers, a stair into the bay,
// container stacks, pallets and a forklift on the dock floor
// ======================================================================
FT.fd_dock = function fdDock(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr, last) => buildDock(ctx, Fr, last), (c) => { TEMPLATES.storage(c); });
};
function buildDock(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 8 || Wd < 8) return no(ctx, 'Dock1');
  const yB = r.floor - 1.2;
  let bayD = 0, run = null;
  for (const d of L >= 11 ? [4, 3] : [3]) {
    run = longestRun(Wd, (s) => okL(ctx, Fr, 0, s, d + 1, 1, 0, 0) && canUseL(ctx, Fr, 0, s, d + 1, 1, 0, 0), 5);
    if (run && Math.min(Wd - 1, run[1]) - Math.max(1, run[0]) >= 5) { bayD = d; break; }
  }
  if (!bayD) return no(ctx, 'Dock2');
  const a = Math.max(1, run[0]), b = Math.min(Wd - 1, run[1]);
  // the bay (one storey of steps lower), a stair down at one end
  const stairLo = rng.chance(0.5);
  const fs = stairLo ? a : b - 2;
  const bay0 = stairLo ? a + 2 : a, bay1 = stairLo ? b : b - 2;
  setHeightL(ctx, Fr, 0, bay0, bayD, bay1 - bay0, yB, { floorTex: TS.ROAD, wallTex: TS.SIDE });
  if (stairLo) flightL(ctx, Fr, 0, fs, 2, 2, 'latN', yB, r.floor);
  else flightL(ctx, Fr, 0, fs, 2, 2, 'lat', yB, r.floor);
  // the flight's landing row at the top must be dock floor: it is (t 0..1 at s = a-1 / b)
  useL(ctx, Fr, 0, a, bayD + 1, b - a);
  // dock edge: bumpers on the face, paint on the edge
  for (let s = bay0 + 1; s < bay1 - 0.5; s += 2.5) fbox(deco, Fr, bayD - 0.18, bayD, s, s + 0.45, yB + 0.35, yB + 1.05, TS.SIDE, { lightMul: 0.5 });
  const [px0, pz0, pw, ph] = rectL(Fr, bayD + 0.05, bay0, 0.2, bay1 - bay0);
  paint(ctx, px0, pz0, px0 + pw, pz0 + ph, r.floor);
  // trailers backed up to the dock, shutters behind them
  for (let s = bay0 + 0.5; s + 1.6 <= bay1; s += 3.5) {
    if (rng.chance(0.25)) continue;
    const [tx, tz] = Fr.pt(0.25, s);
    const [ux, uz] = Fr.pt(bayD - 0.3, s + 1.3);
    const x0 = Math.min(tx, ux), x1 = Math.max(tx, ux), z0 = Math.min(tz, uz), z1 = Math.max(tz, uz);
    deco.box(x0, yB + 0.5, z0, x1, yB + 1.95, z1, TS.CRATE2, { solid: true, s: 1.3 });
    // wheels under the trailer
    for (const tt of [0.5, 1.2]) for (const ss of [-0.05, 1.15]) fbox(deco, Fr, tt, tt + 0.5, s + ss, s + ss + 0.2, yB, yB + 0.5, TS.METAL, { lightMul: 0.35 });
  }
  for (let s = bay0; s + 3 <= bay1; s += 3.5) {
    const [x, z] = Fr.cell(0, Math.floor(s));
    P.shutter(ctx, x, z, Fr.toward, yB, 1, 3.0);
    const [x2, z2] = Fr.cell(0, Math.floor(s) + 1);
    P.shutter(ctx, x2, z2, Fr.toward, yB, 1, 3.0);
  }
  // dock floor: container stacks, pallets, a forklift
  const m = freeMask(ctx, Fr, 1);
  let cs = 0;
  for (let k = 0; k < 3; k++) {
    const rc = bestRect(m, { t0: bayD + 2, minT: 2, maxT: 2, minS: 4, maxS: 4 });
    if (!rc) break;
    const [x0, z0, w, h] = rectL(Fr, rc.t + 0.3, rc.s + 0.3, 1.3, 3.2);
    const alongX = w > h;
    deco.container(x0, z0, r.floor, alongX, { length: 3.2 });
    if (rng.chance(0.6)) deco.box(x0 + (alongX ? 0.2 : 0), r.floor + 1.3, z0 + (alongX ? 0 : 0.2), x0 + w - (alongX ? 0.1 : 0.05), r.floor + 2.6, z0 + h - (alongX ? 0.05 : 0.1), TS.CRATE2, { solid: true, s: 1.3 });
    markMask(m, rc.t, rc.s, rc.dt, rc.ds, 1);
    useL(ctx, Fr, rc.t, rc.s, rc.dt, rc.ds);
    cs++;
  }
  scatterStock(ctx, 3, (x, z) => { P.pallet(ctx, x + 1, z + 1, r.floor, rng.pick(['crates', 'crates', 'sacks', 'drums'])); });
  scatterStock(ctx, 1, (x, z) => { P.forklift(ctx, x + 1, z + 1, r.floor, Fr.toward); });
  railAll(ctx);
  wallLamps(ctx, 4, 3.0, SODIUM);
  highBay(ctx, 5, SODIUM);
  void cs;
  return true;
}

// ======================================================================
// PIPE GALLERY: pipe racks along both long walls, a sump channel down the
// middle crossed by catwalks, valves, risers, overhead pipes, pumps
// ======================================================================
FT.fd_pipes = function fdPipes(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr, last) => buildPipes(ctx, Fr, last), (c) => { TEMPLATES.storage(c); });
};
function buildPipes(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const v = fv(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 8 || Wd < 8) return no(ctx, 'Pipes1');
  const top = r.floor + r.ceilH;
  // sump channel (2 wide) along s, as near the middle as the exits allow
  let best = null;
  for (const marg of last ? [1, 0] : [1]) {
    for (let t = 2; t + 2 <= L - 2; t++) {
      const cand = new Set();
      for (let ss = 2; ss < Wd - 2; ss++) {
        if (okL(ctx, Fr, t, ss, 2, 1, marg, marg)) { cand.add(cellL(ctx, Fr, t, ss)); cand.add(cellL(ctx, Fr, t + 1, ss)); }
      }
      const blob = largestBlob(g, cand);
      const score = blob.size - Math.abs(t + 1 - L / 2) * 3;
      if (blob.size >= 8 && (!best || score > best.score)) best = { blob, t, score };
    }
    if (best) break;
  }
  if (!best) return no(ctx, 'Pipes2');
  const tm = best.t, sump = best.blob;
  const kind = v === 'meat' ? 'poison' : v === 'hell' ? 'lava' : 'water';
  pitSet(ctx, [...sump], kind, kind === 'water' ? 1.6 : 1.8);
  for (const i of sump) ctx.used.add(i);
  // catwalk crossings every ~6 cells
  const inS = (t, s) => sump.has(cellL(ctx, Fr, t, s));
  let s0 = 1e9, s1 = -1;
  for (let s = 0; s < Wd; s++) if (inS(tm, s) || inS(tm + 1, s)) { s0 = Math.min(s0, s); s1 = Math.max(s1, s + 1); }
  let crossings = 0;
  for (let s = s0 + 1; s + 2 <= s1 - 1; s += rng.int(5, 7)) {
    if (!(inS(tm, s) && inS(tm, s + 1) && inS(tm + 1, s) && inS(tm + 1, s + 1))) continue;
    if (!groundL(ctx, Fr, tm - 1, s, 1, 2) || !groundL(ctx, Fr, tm + 2, s, 1, 2)) continue;
    bridgeL(ctx, Fr, tm, s, 2, 2, r.floor);
    crossings++;
  }
  if (!crossings) return no(ctx, 'Pipes3');
  // pipe racks along both long walls on saddles (the walkway stays 2+ wide)
  for (const FrW of [Fr, frame(r, OPP[Fr.side])]) {
    const runW = longestRun(Wd, (s) => okL(ctx, FrW, 0, s, 1, 1, 0, 0) && canUseL(ctx, FrW, 0, s, 1, 1, 1, 0), 4);
    if (!runW) continue;
    const [a, b] = runW;
    const ys = [r.floor + 0.55, r.floor + 1.15, r.floor + 2.3];
    for (let k = 0; k < ys.length; k++) {
      const [ax, az] = FrW.pt(0.3 + (k === 2 ? 0 : 0.12), a), [bx, bz] = FrW.pt(0.3, b);
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      P.cylH(deco, alongX ? Math.min(ax, bx) : Math.min(az, bz), alongX ? Math.max(ax, bx) : Math.max(az, bz), ys[k], alongX ? az : ax, k === 2 ? 0.22 : 0.18, alongX, TS.PIPE);
    }
    for (let s = a + 1; s < b; s += 3) {
      fbox(deco, FrW, 0, 0.62, s, s + 0.12, r.floor, r.floor + 2.6, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
      const [vx, vz] = FrW.pt(0.6, s + 0.6);
      if (rng.chance(0.6)) P.valve(ctx, vx, r.floor + 1.15, vz, FrW.away, 0.2, TS.MACHINE);
    }
    fcollider(deco, FrW, 0, 0.62, a, b, r.floor, r.floor + 2.6, { obstacle: false });
    useL(ctx, FrW, 0, a, 1, b - a);
  }
  // overhead pipes across the room, risers in the corners
  for (let s = 2; s < Wd - 1; s += rng.int(4, 6)) {
    const [ax, az] = Fr.pt(0, s + 0.5), [bx, bz] = Fr.pt(L, s + 0.5);
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    P.cylH(deco, alongX ? Math.min(ax, bx) : Math.min(az, bz), alongX ? Math.max(ax, bx) : Math.max(az, bz), top - 0.9, alongX ? az : ax, 0.25, alongX, TS.PIPE);
  }
  for (const [x, z] of [[r.x, r.z], [r.x + r.w - 1, r.z], [r.x, r.z + r.h - 1], [r.x + r.w - 1, r.z + r.h - 1]]) {
    if (!ok(ctx, x, z, 1, 1)) continue;
    riser(ctx, x + 0.5, z + 0.5, r.floor, top, 0.28);
    use(ctx, x, z, 1, 1);
  }
  // pumps at the channel ends
  for (const s of [s0 - 2, s1]) {
    if (s < 0 || s + 2 > Wd || !okL(ctx, Fr, tm, s, 2, 2, 0, 0)) continue;
    const [cx, cz] = Fr.pt(tm + 1, s + 1);
    P.cylV(deco, cx, cz, r.floor, r.floor + 1.3, 0.55, TS.METAL, { solid: true });
    deco.box(cx - 0.3, r.floor + 1.3, cz - 0.3, cx + 0.3, r.floor + 1.8, cz + 0.3, TS.MACHINE, { uv: 'fit' });
    useL(ctx, Fr, tm, s, 2, 2);
  }
  railAll(ctx);
  hazardLines(ctx, [...sump].filter((i) => g.flags[i] & (F.PIT | F.HAZARD)));
  wallLamps(ctx, 4, 3.2, v === 'meat' ? COLD : WARM);
  highBay(ctx, 5, SODIUM);
  return true;
}

// ======================================================================
// BOILER HOUSE: a row of big boilers with steam pipes to the headers, a
// catwalk gallery up stairs along one wall, fuel bunker / feed tanks
// ======================================================================
FT.fd_boiler = function fdBoiler(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr, last) => buildBoiler(ctx, Fr, last), (c) => { TEMPLATES.storage(c); });
};
function buildBoiler(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const v = fv(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 9 || Wd < 9) return no(ctx, 'Boiler1');
  const top = r.floor + r.ceilH;
  const yG = r.floor + 3.6;
  const gal = L >= 11 ? gallery(ctx, Fr, 2, yG, { minDeck: 4 }) : null;
  if (!gal && !last && L >= 11) return no(ctx, 'Boiler2');
  // boilers in a row down the middle of the floor
  const t0 = gal ? 4 : 1;
  const m = freeMask(ctx, Fr, last ? 0 : 1);
  let nb = 0;
  const R = L - t0 >= 6 ? 1.3 : 1.0;
  const D = R >= 1.3 ? 3 : 2;
  for (let s = 1; s + D <= Wd - 1 && nb < 4; s++) {
    const tPref = t0 + Math.max(0, Math.floor((L - t0 - D) / 2) - (gal ? 1 : 0));
    let tb = -1;
    for (const tc of [tPref, tPref + 1, tPref - 1, tPref + 2, tPref - 2]) {
      if (tc < t0 || tc + D > L - 1) continue;
      let fine = true;
      for (let t = tc; t < tc + D && fine; t++) for (let ss = s; ss < s + D; ss++) if (!m[t] || !m[t][ss]) fine = false;
      if (fine) { tb = tc; break; }
    }
    if (tb < 0) continue;
    const [cx, cz] = Fr.pt(tb + D / 2, s + D / 2);
    const h = Math.min(r.ceilH - 2.2, rng.pick([4.5, 5, 5.5]));
    P.boiler(ctx, cx, cz, r.floor, R, h, { face: Fr.toward, tex: v === 'clock' ? TS.PANEL : TS.METAL });
    // steam main to the wall behind the gallery
    const [wx, wz] = Fr.pt(0.3, s + D / 2);
    const py = Math.min(top - 0.6, r.floor + h + 1.0);
    const alongX = Math.abs(wx - cx) > Math.abs(wz - cz);
    P.cylH(deco, alongX ? Math.min(wx, cx) : Math.min(wz, cz), alongX ? Math.max(wx, cx) : Math.max(wz, cz), py, alongX ? cz : cx, 0.18, alongX, TS.PIPE);
    useL(ctx, Fr, tb, s, D, D);
    markMask(m, tb, s, D, D, 1);
    nb++;
    s += D + 1;
  }
  if (!nb) return no(ctx, 'Boiler3');
  // steam header along the frame wall above the gallery
  const [hx0, hz0] = Fr.pt(0.3, 0), [hx1, hz1] = Fr.pt(0.3, Wd);
  const hAlongX = Math.abs(hx1 - hx0) > Math.abs(hz1 - hz0);
  P.cylH(deco, hAlongX ? Math.min(hx0, hx1) : Math.min(hz0, hz1), hAlongX ? Math.max(hx0, hx1) : Math.max(hz0, hz1), Math.min(top - 0.6, yG + 3.0), hAlongX ? hz0 : hx0, 0.3, hAlongX, TS.PIPE);
  if (gal) {
    deckFace(ctx, gal);
    for (let s = gal.s0 + 1; s < gal.s1 - 1; s += 3) { const [vx, vz] = Fr.pt(0.08, s + 0.5); P.valve(ctx, vx, yG + 1.3, vz, Fr.away, 0.28, TS.MACHINE); }
  }
  // fuel: a coal bunker (clockwork / infernal) or feed-water tanks
  const FrO = frame(r, OPP[Fr.side]);
  const bk = longestRun(Wd, (s) => okL(ctx, FrO, 0, s, 3, 1, 0, 1), 4);
  if (bk) {
    const a = bk[0], b = Math.min(bk[1], a + 6);
    if (v === 'clock' || v === 'hell') {
      for (const [t0b, t1b, s0b, s1b] of [[2.75, 3, a, b], [0, 3, a, a + 0.25], [0, 3, b - 0.25, b]]) fbox(deco, FrO, t0b, t1b, s0b, s1b, r.floor, r.floor + 1.1, TS.SIDE, { solid: true });
      const [cx, cz] = FrO.pt(1.4, (a + b) / 2);
      P.heap(ctx, cx, cz, r.floor, 1.2, (b - a) / 2 - 0.4, 1.6, TS.ROCK);
    } else {
      const [ax, az] = FrO.pt(1.2, a + 0.2), [bx, bz] = FrO.pt(1.2, b - 0.2);
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      P.tankH(ctx, alongX ? Math.min(ax, bx) : Math.min(az, bz), alongX ? Math.max(ax, bx) : Math.max(az, bz), alongX ? az : ax, r.floor, 0.85, alongX);
    }
    useL(ctx, FrO, 0, a, 3, b - a);
  }
  dressFloor(ctx, v, 0.3);
  railAll(ctx);
  wallLamps(ctx, 4, 2.6, WARM);
  highBay(ctx, 5, SODIUM);
  void rng;
  return true;
}

// ======================================================================
// ORE STORE: concrete bunkers of ore / coal / scrap along a wall, ingot
// stacks and pallets in rows, pallet racking, a crane hook
// ======================================================================
FT.fd_store = function fdStore(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr, last) => buildStore(ctx, Fr, last), (c) => { TEMPLATES.storage(c); });
};
function buildStore(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const v = fv(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 7 || Wd < 8) return no(ctx, 'Store1');
  // bunkers: 3 deep, 3 wide, open toward the room
  let nb = 0;
  for (let s = 1; s + 3 <= Wd - 1 && nb < 4; s++) {
    if (!(okL(ctx, Fr, 0, s, 3, 3, 0, 0) && canUseL(ctx, Fr, 0, s, 4, 3, last ? 0 : 1, 0))) continue;
    for (const [t0, t1, s0, s1] of [[0, 3, s, s + 0.25], [0, 3, s + 2.75, s + 3]]) fbox(deco, Fr, t0, t1, s0, s1, r.floor, r.floor + 1.3, { side: TS.SIDE, top: TS.TRIM }, { solid: true });
    fbox(deco, Fr, 2.85, 3, s, s + 3, r.floor, r.floor + 0.35, TS.TRIM);
    const tex = v === 'meat' ? TS.GROUND : rng.pick([TS.ROCK, TS.ROCK, TS.GROUND, TS.METAL]);
    const [cx, cz] = Fr.pt(1.4, s + 1.5);
    P.heap(ctx, cx, cz, r.floor, 1.2, 1.2, rng.float(1.2, 1.9), tex);
    useL(ctx, Fr, 0, s, 3, 3);
    nb++;
    s += 3;
  }
  if (!nb) return no(ctx, 'Store2');
  // rows of ingot stacks / pallets in the middle with aisles
  const m = freeMask(ctx, Fr, 1);
  for (let t = 5; t + 2 <= L - 1; t += 3) {
    for (let s = 1; s + 2 <= Wd - 1; s += 3) {
      if (!(m[t] && m[t][s] && m[t][s + 1] && m[t + 1] && m[t + 1][s] && m[t + 1][s + 1])) continue;
      const [cx, cz] = Fr.pt(t + 1, s + 1);
      if (v === 'meat') P.pallet(ctx, cx, cz, r.floor, rng.pick(['crates', 'drums']));
      else if (rng.chance(0.6)) P.ingotStack(ctx, cx, cz, r.floor, rng.int(3, 6), { tex: v === 'clock' ? TS.PANEL : TS.METAL });
      else P.pallet(ctx, cx, cz, r.floor, rng.pick(['crates', 'sacks', 'drums']));
      useL(ctx, Fr, t, s, 2, 2);
    }
  }
  // pallet racking along the opposite wall
  const FrO = frame(r, OPP[Fr.side]);
  for (let s = 1; s + 3 <= Wd - 1; s += 4) {
    if (!okL(ctx, FrO, 0, s, 1, 3, 0, 1)) continue;
    const [x0, z0, w, h] = rectL(FrO, 0.08, s + 0.1, 0.8, 2.8);
    deco.shelf(x0, z0, x0 + w, z0 + h, r.floor, Math.min(3.2, r.ceilH - 1.5));
    for (let k = 0; k < 3; k++) { const [px, pz] = FrO.pt(0.45, s + 0.6 + k * 0.9); deco.box(px - 0.3, r.floor + 0.05 + (k % 2) * 0.8, pz - 0.3, px + 0.3, r.floor + 0.55 + (k % 2) * 0.8, pz + 0.3, TS.CRATE, { uv: 'fit' }); }
    useL(ctx, FrO, 0, s, 1, 3);
  }
  // crane rails with a hook
  if (r.ceilH >= 6) P.crane(ctx, Fr, 0, Wd, r.floor + r.ceilH - 1.4, Wd * rng.float(0.3, 0.7), L / 2, { load: 'hook', yLoad: r.floor + r.ceilH - 3.2, cab: false });
  railAll(ctx);
  highBay(ctx, 5, SODIUM);
  void g;
  return true;
}

// ======================================================================
// GEAR PIT (clockwork): the clock's movement - a deep pit of spikes full of
// giant gears, crossed by catwalks; gear trains on the walls, a pendulum
// ======================================================================
FT.fd_gears = function fdGears(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr) => buildGears(ctx, Fr), (c) => { TEMPLATES.pitroom(c); });
};
function buildGears(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 9 || Wd < 9) return no(ctx, 'Gears1');
  const top = r.floor + r.ceilH;
  const cand = new Set();
  for (let t = 2; t < L - 2; t++) for (let s = 2; s < Wd - 2; s++) if (okL(ctx, Fr, t, s, 1, 1, 1, 1)) cand.add(cellL(ctx, Fr, t, s));
  const pitC = largestBlob(g, openShape(g, cand));
  if (pitC.size < 12) return no(ctx, 'Gears2');
  const depth = 3.5;
  pitSet(ctx, [...pitC], 'spikes', depth);
  for (const i of pitC) ctx.used.add(i);
  const inP = (t, s) => t >= 0 && s >= 0 && t < L && s < Wd && pitC.has(cellL(ctx, Fr, t, s));
  let t0 = 1e9, t1 = -1, s0 = 1e9, s1 = -1;
  for (let t = 0; t < L; t++) for (let s = 0; s < Wd; s++) if (inP(t, s)) { t0 = Math.min(t0, t); t1 = Math.max(t1, t + 1); s0 = Math.min(s0, s); s1 = Math.max(s1, s + 1); }
  // a catwalk across the long way, one across the short way if it fits
  const low = new Set();
  const lay = (cells) => { for (const i of cells) low.add(i); };
  const mt = Math.floor((t0 + t1) / 2) - 1, ms = Math.floor((s0 + s1) / 2) - 1;
  let n = 0;
  const spanS = (t) => {
    for (let s = s0; s < s1; s++) if (inP(t, s) !== inP(t + 1, s)) return false;
    if (!groundL(ctx, Fr, t, s0 - 1, 2, 1) || !groundL(ctx, Fr, t, s1, 2, 1)) return false;
    lay(bridgeL(ctx, Fr, t, s0, 2, s1 - s0, r.floor)); return true;
  };
  const spanT = (s) => {
    for (let t = t0; t < t1; t++) if (inP(t, s) !== inP(t, s + 1)) return false;
    if (!groundL(ctx, Fr, t0 - 1, s, 1, 2) || !groundL(ctx, Fr, t1, s, 1, 2)) return false;
    lay(bridgeL(ctx, Fr, t0, s, t1 - t0, 2, r.floor)); return true;
  };
  for (const t of [mt, mt - 1, mt + 1]) if (spanS(t)) { n++; break; }
  if (t1 - t0 >= 5) for (const s of [ms, ms - 2, ms + 2]) if (spanT(s)) { n++; break; }
  if (!n) return no(ctx, 'Gears7');
  const lowC = new Set(low), highC = new Set();
  gearPit(ctx, Fr, inP, pitC, t0, t1, s0, s1, r.floor - depth, highC, lowC);
  // gear trains on the long walls (thin, standing proud of the wall)
  for (const FrW of [Fr, frame(r, OPP[Fr.side])]) {
    let gx = 0;
    for (let s = 2; s < Wd - 2 && gx < 3; s += rng.int(3, 5)) {
      const R = rng.pick([0.9, 1.2, 1.6]);
      const yc = r.floor + rng.float(3.0, Math.max(3.2, r.ceilH - 2.2));
      if (yc + R > top - 0.3) continue;
      const [cx, cz] = FrW.pt(0.2, s);
      const plane = FrW.lat >= 2 ? 'z' : 'x';
      P.gear(deco, cx, yc, cz, R, plane === 'x' ? 'x' : 'z', 0.18, TS.PANEL, { phase: rng.float(0, 1) });
      gx++;
    }
  }
  // the pendulum over the pit: rod from the ceiling, a brass bob
  const [px, pz] = Fr.pt((t0 + t1) / 2, (s0 + s1) / 2 + (n > 1 ? 2.5 : 0));
  const pi = g.idx(Math.floor(px), Math.floor(pz));
  if (pitC.has(pi) && !low.has(pi)) {
    deco.box(px - 0.05, r.floor - 1.0, pz - 0.05, px + 0.05, top, pz + 0.05, TS.METAL, { faces: FACE.SIDES });
    P.cylV(deco, px, pz, r.floor - 2.2, r.floor - 1.0, 0.6, TS.PANEL);
  }
  railAll(ctx);
  hazardLines(ctx, [...pitC].filter((i) => g.flags[i] & F.PIT));
  wallPipes(ctx, top - 1.6, 0.14, 1);
  chains(ctx, 3);
  highBay(ctx, 5, WARM);
  return true;
}

// ======================================================================
// HOOK HALL (meat plant): blood gutters under parallel hook rails hung with
// carcasses, grate crossings, steel tables, a scalding tank, a stun pen
// ======================================================================
FT.fd_hooks = function fdHooks(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr) => buildHooks(ctx, Fr), (c) => { TEMPLATES.storage(c); });
};
function buildHooks(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 8 || Wd < 10) return no(ctx, 'Hooks1');
  const yR = r.floor + 3.4;
  let lines = 0;
  for (let t = 2; t + 2 <= L - 1 && lines < 3; t += 3) {
    const run = longestRun(Wd, (s) => okL(ctx, Fr, t, s, 1, 1, 0, 0) && canUseL(ctx, Fr, t - 1, s, 3, 1, 0, 0), 5);
    if (!run) continue;
    const a = Math.max(1, run[0]), b = Math.min(Wd - 1, run[1]);
    if (b - a < 5) continue;
    // the gutter (a shallow trough of blood) and its crossings
    pitL(ctx, Fr, t, a, 1, b - a, 'poison', 0.2);
    for (let s = a + 3; s < b - 1; s += rng.int(5, 7)) bridgeL(ctx, Fr, t, s, 1, 1, r.floor);
    const [ax, az] = Fr.pt(t + 0.5, a), [bx, bz] = Fr.pt(t + 0.5, b);
    hookRail(ctx, ax, az, bx, bz, yR, { gapMin: 0.9, gapMax: 1.4, empty: 0.12 });
    useL(ctx, Fr, t, a, 1, b - a);
    lines++;
  }
  if (!lines) return no(ctx, 'Hooks2');
  for (const i of ctx.cells) if (g.type[i] && !(g.flags[i] & (F.HAZARD | F.BRIDGE | F.STAIR)) && Math.abs(g.floor[i] - r.floor) < 0.01 && ctx.rng.chance(0.5)) g.floorTex[i] = TS.FLOOR3;
  // steel tables with cleavers; a scalding tank; a stun pen with bars
  scatterStock(ctx, 3, (x, z) => {
    steelTable(ctx, x + 0.2, z + 0.4, x + 1.8, z + 1.4, r.floor, { top: TS.METAL });
    deco.box(x + 0.6, r.floor + 0.96, z + 0.7, x + 0.9, r.floor + 1.0, z + 0.85, TS.METAL);
  }, 0);
  const FrO = frame(r, OPP[Fr.side]);
  const pen = longestRun(Wd, (s) => okL(ctx, FrO, 0, s, 3, 1, 0, 1), 4);
  if (pen && L >= 9) {
    const a = pen[0] + (pen[1] - pen[0] > 5 ? 1 : 0), b = Math.min(pen[1], a + 5);
    const [x0, z0] = FrO.pt(3, a), [x1, z1] = FrO.pt(3, b);
    glassWall(ctx, Math.round(Math.min(x0, x1)), Math.round(Math.min(z0, z1)), Math.round(Math.max(x0, x1)), Math.round(Math.max(z0, z1)), r.floor, 2.2, { pane: 'bars' });
    // a gap in the bars (gate swung open) so the pen floor stays reachable
    const gs = a + 1;
    const [gx, gz] = FrO.cell(2, gs);
    g.setEdge(gx, gz, FrO.away, false);
    for (const i of cellsOf(g, ...rectL(FrO, 0, a, 3, b - a))) g.floorTex[i] = TS.GROUND;
    useL(ctx, FrO, 0, a, 4, b - a);
  }
  scatterStock(ctx, 1, (x, z) => {
    const [x0, z0] = [x + 0.1, z + 0.1];
    deco.box(x0, r.floor, z0, x0 + 1.8, r.floor + 0.9, z0 + 1.8, TS.METAL, { solid: true });
    deco.box(x0 + 0.1, r.floor + 0.9, z0 + 0.1, x0 + 1.7, r.floor + 0.92, z0 + 1.7, TS.POISON, { emissive: 0.5, faces: FACE.TOP });
    deco.light(x0 + 0.9, r.floor + 1.4, z0 + 0.9, BLOODL, 3.5);
  });
  railAll(ctx);
  hazardLines(ctx, ctx.cells.filter((i) => g.flags[i] & F.HAZARD));
  wallPipes(ctx, r.floor + 4.4, 0.12, 2);
  highBay(ctx, 4, [0.92, 0.95, 1]);
  return true;
}

// ======================================================================
// COLD ROOM (meat plant): rows of carcasses hanging close to the floor
// (aisles between), walk-in freezers, boxed meat on pallets, chiller units
// ======================================================================
FT.fd_cold = function fdCold(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr) => buildCold(ctx, Fr), (c) => { TEMPLATES.storage(c); });
};
function buildCold(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 7 || Wd < 7) return no(ctx, 'Cold1');
  const yR = r.floor + Math.min(r.ceilH - 0.5, 2.9);
  let rows = 0;
  for (let t = 1; t + 1 <= L - 2 && rows < 3; t += 3) {
    const run = longestRun(Wd, (s) => okL(ctx, Fr, t, s, 1, 1, 0, 0) && canUseL(ctx, Fr, t, s, 1, 1, 1, 0), 3);
    if (!run) continue;
    const a = Math.max(1, run[0]), b = Math.min(Wd - 1, run[1]);
    if (b - a < 3) continue;
    const [ax, az] = Fr.pt(t + 0.5, a), [bx, bz] = Fr.pt(t + 0.5, b);
    hookRail(ctx, ax, az, bx, bz, yR, { gapMin: 0.55, gapMax: 0.8, empty: 0.08 });
    fcollider(deco, Fr, t + 0.2, t + 0.8, a, b, r.floor + 0.4, yR, { obstacle: true });
    useL(ctx, Fr, t, a, 1, b - a);
    rows++;
  }
  if (!rows) return no(ctx, 'Cold2');
  // walk-in freezer boxes / chillers on a free wall
  const FrO = frame(r, OPP[Fr.side]);
  for (let s = 1; s + 2 <= Wd - 1; s += 3) {
    if (!okL(ctx, FrO, 0, s, 2, 2, 0, 1)) continue;
    fbox(deco, FrO, 0, 1.8, s + 0.05, s + 1.95, r.floor, r.floor + 2.4, faced(FrO.away, TS.PANEL, TS.METAL), { solid: true, uv: 'fit' });
    fbox(deco, FrO, 1.8, 1.86, s + 0.5, s + 1.5, r.floor + 0.1, r.floor + 2.1, TS.METAL);
    fbox(deco, FrO, 1.86, 1.92, s + 1.25, s + 1.35, r.floor + 0.9, r.floor + 1.3, TS.TRIM);
    useL(ctx, FrO, 0, s, 2, 2);
    break;
  }
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 8)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    wallBox(ctx, x, z, d, 0.45, r.floor + r.ceilH - 1.3, r.floor + r.ceilH - 0.4, faced(OPP[d], TS.MACHINE, TS.METAL), { uv: 'fit', inset: 0.1 });
    break;
  }
  scatterStock(ctx, 2, (x, z) => { P.pallet(ctx, x + 1, z + 1, r.floor, 'crates'); }, 0);
  for (const i of ctx.cells) if (g.type[i]) g.light[i] = Math.min(g.light[i], 0.75);
  highBay(ctx, 3, COLD);
  return true;
}

// ======================================================================
// MAGMA BREACH (volcano base / infernal foundry): one wall has given way to
// the rock; a lava flow runs out of it across the room into a sump, crossed
// by catwalks; a geothermal tap straddles the flow, cooling pipes run out
// ======================================================================
FT.fd_breach = function fdBreach(ctx) {
  tryFrames(ctx, sidesLong(ctx, false), (Fr, last) => buildBreach(ctx, Fr, last), (c) => { TEMPLATES.pitroom(c); });
};
function buildBreach(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 9 || Wd < 9) return no(ctx, 'Breach1');
  const top = r.floor + r.ceilH;
  // the flow: 2-3 wide, out of the breach wall (t = 0) as far as the floor is
  // free (never to the far wall: there is always a way round its end), ending
  // in a deeper sump
  let pick = null;
  for (const w of Wd >= 12 ? [3, 2] : [2]) {
    const sc0 = Math.floor((Wd - w) / 2);
    for (const s of [sc0, sc0 - 1, sc0 + 1, sc0 - 2, sc0 + 2, sc0 - 3, sc0 + 3]) {
      if (s < 2 || s + w > Wd - 2) continue;
      let len = 0;
      while (len < L - 3 && okL(ctx, Fr, len, s - 1, 1, w + 2, 0, 0) && canUseL(ctx, Fr, len, s - 1, 1, w + 2, last ? 0 : 1, 0)) len++;
      if (len >= 5 && (!pick || len * w > pick.len * pick.w)) pick = { s, w, len };
    }
    if (pick && pick.len >= L - 4) break;
  }
  if (!pick) return no(ctx, 'Breach2');
  const { s: sf, w, len } = pick;
  const flow = pitL(ctx, Fr, 0, sf, len, w, 'lava', 2.2);
  if (len >= 6 && okL(ctx, Fr, len - 2, sf - 1, 2, w + 2, 0, 0) && groundL(ctx, Fr, len, sf - 1, 1, w + 2)) flow.push(...pitL(ctx, Fr, len - 2, sf - 1, 2, w + 2, 'lava', 3.0));
  useL(ctx, Fr, 0, sf - 1, len + 1, w + 2);
  // catwalk crossings (2 wide)
  let nb = 0;
  for (const t of [Math.floor(len / 2) - 1, 2, len - 5]) {
    if (t < 1 || t + 2 > len - 2 || nb >= 2) continue;
    if (!groundL(ctx, Fr, t, sf - 1, 2, 1) || !groundL(ctx, Fr, t, sf + w, 2, 1)) continue;
    bridgeL(ctx, Fr, t, sf, 2, w, r.floor);
    nb++;
  }
  // the breach: rock wall texture, boulders, rock floor round the opening
  breachWall(g, deco, rng, r, { Fr, s0: Math.max(0, sf - 3), s1: Math.min(Wd, sf + w + 3), big: true });
  for (let t = 0; t < 3; t++) for (let s = Math.max(0, sf - 3); s < Math.min(Wd, sf + w + 3); s++) {
    const i = cellL(ctx, Fr, t, s);
    if (g.type[i] && !(g.flags[i] & (F.PIT | F.BRIDGE))) g.floorTex[i] = TS.ROCK;
  }
  // geothermal tap over the flow near the breach: a heat exchanger on legs
  const tt = Math.min(len - 3, 4);
  if (!cellsOf(g, ...rectL(Fr, tt - 1, sf, 3, w)).some((i) => g.flags[i] & F.BRIDGE)) {
    const [cx, cz] = Fr.pt(tt + 0.5, sf + w / 2);
    P.cylV(deco, cx, cz, r.floor + 2.2, r.floor + 4.6, 0.9, TS.METAL);
    P.bandV(deco, cx, cz, r.floor + 3.0, 0.9); P.bandV(deco, cx, cz, r.floor + 3.9, 0.9);
    P.cylV(deco, cx, cz, r.floor - 2.0, r.floor + 2.2, 0.35, TS.PIPE);
    for (const sg of [-1, 1]) { const [lx, lz] = Fr.pt(tt + 0.5, sf + w / 2 + sg * (w / 2 + 0.3)); deco.box(lx - 0.12, r.floor, lz - 0.12, lx + 0.12, r.floor + 2.4, lz + 0.12, TS.BEAM, { solid: true }); }
    if (top > r.floor + 5.2) deco.box(cx - 0.2, r.floor + 4.6, cz - 0.2, cx + 0.2, top, cz + 0.2, TS.PIPE);
  }
  // cooling pipes from the tap along the ceiling to the side walls
  for (const sg of [-1, 1]) {
    const [ax, az] = Fr.pt(tt + 0.5, sf + w / 2), [bx, bz] = Fr.pt(tt + 0.5, sg < 0 ? 0 : Wd);
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    P.cylH(deco, alongX ? Math.min(ax, bx) : Math.min(az, bz), alongX ? Math.max(ax, bx) : Math.max(az, bz), Math.min(top - 0.7, r.floor + 5.2), alongX ? az : ax, 0.22, alongX, TS.PIPE);
  }
  // rock debris near the breach, machinery on the far side
  scatterStock(ctx, 2, (x, z) => { P.heap(ctx, x + 1, z + 1, r.floor, 0.9, 0.9, rng.float(0.6, 1.1), TS.ROCK); });
  dressFloor(ctx, fv(ctx), 0.3);
  railAll(ctx);
  hazardLines(ctx, flow.filter((i) => g.flags[i] & (F.PIT | F.HAZARD)));
  wallLamps(ctx, 4, 2.8, WARM);
  highBay(ctx, 5, SODIUM);
  return true;
}

// A stretch of wall gives way to the mountain: rock wall texture, boulders
// standing proud of the wall, glowing lava seams in the face. o.Fr / s0 / s1
// pick the stretch (frame wall t = 0); otherwise the longest exit-free wall.
// Decorative only on the room side (thin boulders, no new hazards), so it is
// safe to apply after the connections are cut.
export function breachWall(g, deco, rng, r, o = {}) {
  let Fr = o.Fr, s0 = o.s0, s1 = o.s1;
  if (!Fr) {
    let best = null;
    for (const side of rng.shuffle([0, 1, 2, 3])) {
      const F2 = frame(r, side);
      const run = longestRun(F2.Wd, (s) => {
        const [x, z] = F2.cell(0, s);
        const i = g.idx(x, z);
        const wx = x + DIR_X[F2.toward], wz = z + DIR_Z[F2.toward];
        if (!g.in(wx, wz) || g.type[g.idx(wx, wz)]) return false;
        return g.type[i] && !(g.flags[i] & (F.DOOR | F.STAIR | F.PIT | F.HAZARD | F.BRIDGE)) && !r.reserved.has(i) && Math.abs(g.floor[i] - r.floor) < 0.01 && !g.edge[i];
      }, 4);
      if (run && (!best || run[1] - run[0] > best.run[1] - best.run[0])) best = { F2, run };
    }
    if (!best) return false;
    Fr = best.F2;
    const len = Math.min(best.run[1] - best.run[0], o.small ? rng.int(4, 6) : rng.int(6, 9));
    s0 = best.run[0] + rng.int(0, best.run[1] - best.run[0] - len); s1 = s0 + len;
  }
  const { toward } = Fr;
  for (let s = s0; s < s1; s++) {
    const [x, z] = Fr.cell(0, s);
    const wx = x + DIR_X[toward], wz = z + DIR_Z[toward];
    if (!g.in(wx, wz)) continue;
    const wi = g.idx(wx, wz);
    if (!g.type[wi]) g.wallTex[wi] = TS.WALL2;
    // the neighbouring wall layer too, so the rock reads from both sides of a corner
  }
  const i0 = g.idx(...Fr.cell(0, s0));
  const y = g.floor[i0];
  const ceil = g.sky[i0] ? y + 8 : g.ceil[i0];
  for (let s = s0; s < s1; s += rng.float(0.8, 1.6)) {
    const wdt = rng.float(0.7, 1.4), h = rng.float(0.8, Math.min(3.2, ceil - y - 0.5));
    const dep = o.big ? rng.float(0.3, 0.6) : rng.float(0.2, 0.38);
    fbox(deco, Fr, 0, dep, s, Math.min(s1, s + wdt), y, y + h, TS.ROCK, { s: 2 });
    if (rng.chance(0.6)) fbox(deco, Fr, 0, dep * 0.6, s + 0.1, Math.min(s1, s + wdt) - 0.1, y + h, y + h + rng.float(0.4, 1.2), TS.ROCK, { s: 2 });
  }
  // lava seams glowing in the rock face
  for (let k = 0; k < (o.big ? 4 : 2); k++) {
    const s = rng.float(s0 + 0.3, s1 - 0.6), yy = y + rng.float(1.2, Math.min(4, ceil - y - 0.8));
    fbox(deco, Fr, 0, 0.04, s, s + rng.float(0.15, 0.3), yy, yy + rng.float(0.6, 1.6), TS.LAVA, { emissive: 1 });
  }
  const [lx, lz] = Fr.pt(0.8, (s0 + s1) / 2);
  deco.light(lx, y + 1.5, lz, MOLTEN, o.big ? 7 : 5, { flicker: true });
  return true;
}

void retexFloor; void hangLight; void edgeCells; void flatOpen; void machineBlock; void COLD;
