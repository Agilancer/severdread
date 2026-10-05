// Side-deck rooms of the "starship" archetype (see gen_starship.js /
// starship_rooms.js): crew quarters with bunk bays and an officer's cabin,
// the mess hall with its galley, the med bay, the armory with its cage,
// stores, the observation lounge, airlocks and the docking port, the
// maintenance deck (two levels joined by stairs), life support /
// hydroponics, cargo holds (gallery, freight lift, gantry crane, container
// rows), the shuttle hangar and the crash site of the crashed ship.
//
// Every room is built in a wall frame and verified (exits connected, floor
// reachable) before it is kept; the next wall is tried when it is not.
// Windows onto space are recorded on the room (room.shipWindows) and cut
// through the hull by the finishing pass (starship_finish.js).
import { TS, F, DIR_X, DIR_Z, OPP } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import { TEMPLATES } from './gen_arch.js';
import { glassLineL, doorLeafL, glassWall, labBench } from './lab_templates.js';
import {
  SS, tryFrames, sidesLong, sidesShort, outerSides, fb, cellL, wallClosed, railAll, panelLights, highBay, pipeRun, wallScreen,
  crashed, gallery, deckFace, isCrashed, no, canUseL, useL, okL, ok, use, setHeightL, flightL, wallSpots, wallBox, hangLight, paint,
  hazardLines, pitSet, freeMask, bestRect, markMask, lineOpening, cabinet, machineBlock, counter, monitor, bed, ivStand, vitalsMonitor,
  trolley, curtain, riser, steelTable, openShelf, nSteps, lightStrip, seatRow, cylV, cylH, crane, pallet, drum, forklift, workbench, P,
} from './starship_rooms.js';

const { faced, CYAN, COOL, AMBER, ALARM, GREENL } = P;
const WARMW = [1, 0.88, 0.7], PURPLE = [0.85, 0.55, 1];

// ======================================================================
// helpers
// ======================================================================
// all runs [a, b) of s in [0, Wd) where test(s) holds, at least minLen long
function runs(Wd, test, minLen = 1) {
  const out = [];
  for (let a = 0; a < Wd; a++) {
    if (!test(a)) continue;
    let b = a;
    while (b < Wd && test(b)) b++;
    if (b - a >= minLen) out.push([a, b]);
    a = b;
  }
  return out;
}
const longest = (rs) => rs.reduce((b, r) => (!b || r[1] - r[0] > b[1] - b[0] ? r : b), null);
// free wall column s of the frame: cells t in [0, dt) usable, wall behind closed
const wallFree = (ctx, Fr, s, dt = 1) => s >= 0 && s < Fr.Wd && okL(ctx, Fr, 0, s, dt, 1) && wallClosed(ctx, Fr, s);
// world rect [x0, z0, x1, z1] of frame coordinates
function wr(Fr, t0, t1, s0, s1) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
}
const opp = (r, Fr) => frame(r, OPP[Fr.side]);
// windows onto space on the frame wall over [s0, s1): recorded for the
// finishing pass, the wall cells stay free of furniture
function shipWindow(ctx, Fr, s0, s1, o = {}) {
  const { room: r } = ctx;
  if (!outerSides(ctx).includes(Fr.side) || s1 - s0 < 2) return false;
  (r.shipWindows || (r.shipWindows = [])).push({ side: Fr.side, s0, s1, sill: o.sill ?? 0.9, head: o.head ?? 2.9, kind: o.kind || 'window' });
  useL(ctx, Fr, 0, s0, 1, s1 - s0);
  return true;
}
// the longest free run of hull wall on a frame (for windows), trimmed to maxLen
function windowRun(ctx, Fr, minLen = 3, maxLen = 99) {
  const rs = runs(Fr.Wd, (s) => s > 0 && s < Fr.Wd - 1 && wallFree(ctx, Fr, s), minLen);
  const best = longest(rs);
  if (!best) return null;
  let [a, b] = best;
  while (b - a > maxLen) { a++; if (b - a > maxLen) b--; }
  return [a, b];
}
// a solid sliding door leaf parked beside a doorway on the frame line t
// (s0..s1 along it), on the `side` (+1 / -1 along t) face
function slideDoor(ctx, Fr, t, s0, s1, y, side = 1, tex = TS.PANEL) {
  const d = 0.1 * side;
  const a = Math.min(t + d, t + d + 0.06 * side), b = Math.max(t + d, t + d + 0.06 * side);
  fb(ctx.deco, Fr, a, b, s0, s1, y + 0.02, y + 2.95, faced(Fr.dirOf(side > 0 ? 'away' : 'toward'), tex, TS.METAL), { uv: 'fit' });
  fb(ctx.deco, Fr, a - 0.01, b + 0.01, s0, s1, y + 1.0, y + 1.1, TS.PAINT, { uv: 'fit' });
}
// stores rack (world rect): steel uprights, three shelves of crates, drums and
// cases - a lean rack (fewer boxes than the lab's open shelving)
function cargoRack(ctx, x0, z0, x1, z1, y, h = 2.4) {
  const { deco, rng } = ctx;
  const alongX = x1 - x0 >= z1 - z0;
  const L = alongX ? x1 - x0 : z1 - z0, D = alongX ? z1 - z0 : x1 - x0;
  const B = (a0, a1, b0, b1, y0, y1, tex, o) => (alongX ? deco.box(x0 + a0, y0, z0 + b0, x0 + a1, y1, z0 + b1, tex, o) : deco.box(x0 + b0, y0, z0 + a0, x0 + b1, y1, z0 + a1, tex, o));
  for (const a of [0, L - 0.08]) B(a, a + 0.08, 0, D, y, y + h, TS.BEAM, { faces: FACE.SIDES | FACE.TOP });
  for (let k = 0; k < 3; k++) {
    const sy = y + 0.1 + k * (h - 0.2) / 3;
    B(0.08, L - 0.08, 0.02, D - 0.02, sy, sy + 0.05, TS.METAL);
    for (let a = 0.15; a < L - 0.4;) {
      const w = rng.float(0.45, 0.85);
      if (a + w > L - 0.12) break;
      if (rng.chance(0.75)) {
        const tex = rng.pick([TS.CRATE, TS.CRATE, TS.CRATE2, TS.METAL]);
        const hh = Math.min((h - 0.2) / 3 - 0.12, rng.float(0.3, 0.6));
        B(a, a + w, 0.08, D - 0.08, sy + 0.05, sy + 0.05 + hh, tex, { uv: 'fit' });
      }
      a += w + rng.float(0.08, 0.25);
    }
  }
  deco.collider(x0, y, z0, x1, y + h, z1);
}
// a metal-legged bench (world rect)
function steelBench(ctx, x0, z0, x1, z1, y) {
  const { deco } = ctx;
  deco.box(x0, y + 0.42, z0, x1, y + 0.5, z1, TS.METAL);
  deco.box(x0 + 0.04, y + 0.5, z0 + 0.04, x1 - 0.04, y + 0.56, z1 - 0.04, TS.CARPET);
  const alongX = x1 - x0 >= z1 - z0;
  for (const p of alongX ? [x0 + 0.12, x1 - 0.18] : [z0 + 0.12, z1 - 0.18]) {
    if (alongX) deco.box(p, y, z0 + 0.06, p + 0.06, y + 0.42, z1 - 0.06, TS.METAL, { faces: FACE.SIDES });
    else deco.box(x0 + 0.06, y, p, x1 - 0.06, y + 0.42, p + 0.06, TS.METAL, { faces: FACE.SIDES });
  }
  deco.collider(x0, y, z0, x1, y + 0.56, z1, { obstacle: false });
}
// vending / dispenser machine against the wall of cell (x, z) on side d (dir to wall)
function vending(ctx, x, z, d, y) {
  const { deco } = ctx;
  wallBox(ctx, x, z, d, 0.75, y, y + 2.05, faced(OPP[d], TS.MACHINE, TS.METAL), { solid: true, uv: 'fit', inset: 0.12 });
  const out = OPP[d];
  const ox = DIR_X[out] * 0.78, oz = DIR_Z[out] * 0.78;
  const cx = x + 0.5 - DIR_X[out] * 0.5 + ox, cz = z + 0.5 - DIR_Z[out] * 0.5 + oz;
  const w = d < 2 ? 0.02 : 0.32, h = d < 2 ? 0.32 : 0.02;
  deco.box(cx - w, y + 1.25, cz - h, cx + w, y + 1.8, cz + h, TS.SCREEN, { uv: 'fit', emissive: 0.85 });
  deco.light(x + 0.5 + DIR_X[out] * 0.4, y + 1.5, z + 0.5 + DIR_Z[out] * 0.4, CYAN, 2.5);
}
// a few crates / drums / pallets in free cells of the room (stock, spillage)
function stock(ctx, n, kinds = ['crates', 'pallet', 'drum'], margin = 0) {
  const { g, deco, rng, room: r } = ctx;
  let placed = 0;
  for (let k = 0; k < n * 8 && placed < n; k++) {
    const x = rng.int(r.x, r.x + r.w - 2), z = rng.int(r.z, r.z + r.h - 2);
    if (!ok(ctx, x, z, 2, 2, margin)) continue;
    const kind = rng.pick(kinds);
    if (kind === 'crates') deco.crateStack(x + 1, z + 1, r.floor, { count: rng.int(2, 4) });
    else if (kind === 'pallet') pallet(ctx, x + 1, z + 1, r.floor, rng.pick(['crates', 'crates', 'drums']));
    else if (kind === 'drum') { drum(ctx, x + 0.6, z + 0.6, r.floor); if (rng.chance(0.6)) drum(ctx, x + 1.3, z + 0.7, r.floor); }
    else if (kind === 'container') P.containerStack(ctx, x + 0.2, z + 0.35, r.floor, true, 1, 1.6);
    use(ctx, x, z, 2, 2);
    placed++;
  }
  void g;
  return placed;
}
// fallback layout for any side room: storage-style stock along the walls
function stores(ctx) {
  const { room: r } = ctx;
  ctx.used = ctx.used || new Set();
  stock(ctx, Math.max(2, Math.floor(r.area / 30)), ['crates', 'crates', 'pallet', 'drum']);
  panelLights(ctx, 4, COOL);
}

// ======================================================================
// crew quarters
// ======================================================================
// Bunk bays (double bunks behind partitions, lockers between groups) down
// both long walls with the aisle between, an officer's cabin partitioned off
// at one end of bigger quarters (bed, desk, locker), a mess table with stools
// in the aisle and a notice screen.
SS.ss_quarters = (ctx) => {
  tryFrames(ctx, sidesLong(ctx), (Fr, last) => buildQuarters(ctx, Fr, last), stores);
  crashed(ctx, 0.8);
};
function bunkBays(ctx, Fr) {
  const { deco, room: r } = ctx;
  const y = r.floor;
  let n = 0, bay = 0, lastPart = -9;
  for (let s = 0; s < Fr.Wd - 1;) {
    if (!wallFree(ctx, Fr, s) || !wallFree(ctx, Fr, s + 1)) { s++; continue; }
    bay++;
    if (bay % 4 === 0) {
      // a bank of lockers between bunk groups
      for (const ss of [s, s + 1]) { const [x, z] = Fr.cell(0, ss); P.lockers(ctx, x, z, Fr.toward, y, 1); }
    } else {
      const [x0, z0, x1, z1] = wr(Fr, 0.04, 0.96, s + 0.08, s + 1.92);
      P.bunk(ctx, x0, z0, x1, z1, y, Fr.toward, { light: n % 2 === 0 });
      n++;
    }
    for (const sp of [s, s + 2]) {
      if (sp === lastPart || sp <= 0 || sp >= Fr.Wd) continue;
      fb(deco, Fr, 0, 1.05, sp - 0.04, sp + 0.04, y, y + 2.35, TS.PANEL);
      fb(deco, Fr, 1.0, 1.08, sp - 0.07, sp + 0.07, y, y + 2.4, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
    }
    lastPart = s + 2;
    useL(ctx, Fr, 0, s, 1, 2);
    s += 2;
  }
  return n;
}
function buildQuarters(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor;
  // officer's cabin across one short end (bigger quarters)
  let cabin = false;
  if (Fr.Wd >= 14 && Fr.L >= 7) {
    for (const sideS of rng.shuffle([Fr.side < 2 ? 2 : 0, Fr.side < 2 ? 3 : 1])) {
      const Fs = frame(r, sideS);
      const D = 5;
      if (Fs.L < D + 8) continue;
      const op = lineOpening(ctx, Fs, D, 2, 3);
      if (!op) continue;
      // the cabin interior: bed head to the end wall, desk, locker
      const bedS = op[0] >= 3 ? 0 : Fs.Wd - 1;
      if (!okL(ctx, Fs, 0, bedS, 2, 1) || !wallClosed(ctx, Fs, bedS)) continue;
      glassLineL(ctx, Fs, D, 0, Fs.Wd, y, r.ceilH, [op], { pane: TS.PANEL, header: TS.PANEL });
      // the sliding cabin door parked open beside the doorway
      if (op[0] >= 1) slideDoor(ctx, Fs, D, op[0] - 0.95, op[0] - 0.04, y, -1);
      else slideDoor(ctx, Fs, D, op[1] + 0.04, op[1] + 0.95, y, -1);
      ctx.cabinSide = sideS;
      const [bx, bz] = Fs.cell(0, bedS);
      bed(ctx, bx, bz, Fs.toward, y, { shift: bedS === 0 ? 0.0 : 0 });
      useL(ctx, Fs, 0, bedS, 2, 1);
      const deskS = bedS === 0 ? 2 : Fs.Wd - 3;
      if (okL(ctx, Fs, 0, deskS, 1, 1) && wallClosed(ctx, Fs, deskS)) {
        const [x0, z0, x1, z1] = wr(Fs, 0.05, 0.75, deskS + 0.05, deskS + 0.95);
        deco.box(x0, y + 0.74, z0, x1, y + 0.8, z1, TS.METAL);
        deco.box(x0 + 0.05, y, z0 + 0.05, x1 - 0.05, y + 0.74, z1 - 0.05, faced(Fs.away, TS.CRATE2, TS.METAL), { uv: 'fit' });
        deco.collider(x0, y, z0, x1, y + 0.8, z1);
        const [mx, mz] = Fs.pt(0.3, deskS + 0.5);
        monitor(ctx, mx, mz, y + 0.8, Fs.away);
        const [cx, cz] = Fs.pt(1.25, deskS + 0.5);
        P.chair(ctx, cx, cz, y, Fs.toward);
        useL(ctx, Fs, 0, deskS, 2, 1);
      }
      const lockS = bedS === 0 ? 4 : Fs.Wd - 5;
      if (okL(ctx, Fs, 0, lockS, 1, 1) && wallClosed(ctx, Fs, lockS)) { const [lx, lz] = Fs.cell(0, lockS); P.lockers(ctx, lx, lz, Fs.toward, y, 1); useL(ctx, Fs, 0, lockS, 1, 1); }
      wallScreen(ctx, Fs, Math.max(0.5, Fs.Wd / 2 - 1.2), Math.min(Fs.Wd - 0.5, Fs.Wd / 2 + 1.2), y + 1.4, y + 2.3);
      deco.lightPanel(...(() => { const [a0, b0, a1, b1] = wr(Fs, 2.2, 2.8, Fs.Wd / 2 - 0.4, Fs.Wd / 2 + 0.4); return [a0, b0, a1, b1]; })(), r.floor + r.ceilH, WARMW, 5);
      useL(ctx, Fs, 0, 0, D + 1, Fs.Wd);
      cabin = true;
      break;
    }
  }
  // bunk bays down both long walls
  let n = bunkBays(ctx, Fr) + (Fr.L >= 5 ? bunkBays(ctx, opp(r, Fr)) : 0);
  if (n < (last ? 1 : 4)) return no(ctx, 'bunks ' + n);
  // deep quarters: a row of bunks back to back down the middle, a partition
  // between the berths and a bank of lockers at each end, aisles of two or
  // more cells on both sides
  let isl = null;
  if (Fr.L >= 8 && Fr.Wd >= 8) {
    const t0 = Math.floor((Fr.L - 2) / 2);
    isl = bestRect(freeMask(ctx, Fr, 1), { minT: 2, maxT: 2, minS: 4, maxS: 10, t0, t1: t0 + 2, s0: 2, s1: Fr.Wd - 2 });
    if (isl) {
      const pairs = Math.floor((isl.ds - 2) / 2);
      const s0 = isl.s + Math.floor((isl.ds - (pairs * 2 + 2)) / 2);
      const t = isl.t;
      for (let k = 0; k < pairs; k++) {
        const sa = s0 + 1 + 2 * k;
        const A = wr(Fr, t + 0.04, t + 0.96, sa + 0.08, sa + 1.92), B = wr(Fr, t + 1.04, t + 1.96, sa + 0.08, sa + 1.92);
        P.bunk(ctx, ...A, y, Fr.away, { light: k % 2 === 0 });
        P.bunk(ctx, ...B, y, Fr.toward);
      }
      // the partition between the two rows of berths, posts at the bunk joints
      fb(deco, Fr, t + 0.96, t + 1.04, s0 + 1, s0 + 1 + pairs * 2, y, y + 2.3, TS.PANEL);
      for (let k = 0; k <= pairs; k++) fb(deco, Fr, t + 0.9, t + 1.1, s0 + 1 + 2 * k - 0.05, s0 + 1 + 2 * k + 0.05, y, y + 2.35, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
      // locker banks at both ends of the row, back to back
      for (const se of [s0, s0 + 1 + pairs * 2]) {
        for (const [tt, d] of [[t, Fr.away], [t + 1, Fr.toward]]) {
          const [lx, lz] = Fr.cell(tt, se);
          P.lockers(ctx, lx, lz, d, y, 1);
        }
      }
      useL(ctx, Fr, t, s0, 2, pairs * 2 + 2);
      n += pairs * 2;
    }
  }
  // lockers along the free stretches of the short walls (not by the doors)
  for (const sd of [Fr.side < 2 ? 2 : 0, Fr.side < 2 ? 3 : 1]) {
    if (ctx.cabinSide === sd) continue;
    const Fs = frame(r, sd);
    let k = 0;
    for (let s = 1; s < Fs.Wd - 1 && k < 4; s++) {
      if (!wallFree(ctx, Fs, s) || !okL(ctx, Fs, 0, s, 2, 1)) continue;
      const [lx, lz] = Fs.cell(0, s);
      P.lockers(ctx, lx, lz, Fs.toward, y, 1, rng.chance(0.3) ? TS.PANEL : TS.CRATE2);
      useL(ctx, Fs, 0, s, 1, 1);
      k++;
    }
  }
  // a table with stools in the aisle (wide quarters)
  const m = freeMask(ctx, Fr, 0);
  const tb = isl ? null : bestRect(m, { minT: 2, minS: 3, maxT: 2, maxS: 3, t0: 1, t1: Fr.L - 1 });
  if (tb && Fr.L >= 6) {
    const [x0, z0, x1, z1] = wr(Fr, tb.t + 0.45, tb.t + 1.55, tb.s + 0.6, tb.s + 2.4);
    steelTable(ctx, x0, z0, x1, z1, y, { lip: false });
    const along = x1 - x0 >= z1 - z0;
    for (const f of [0.3, 0.7]) for (const sg of [-1, 1]) {
      const cx = along ? x0 + (x1 - x0) * f : (sg < 0 ? x0 - 0.35 : x1 + 0.35), cz = along ? (sg < 0 ? z0 - 0.35 : z1 + 0.35) : z0 + (z1 - z0) * f;
      deco.box(cx - 0.17, y, cz - 0.17, cx + 0.17, y + 0.48, cz + 0.17, { side: TS.METAL, top: TS.CARPET, bottom: TS.METAL });
    }
    useL(ctx, Fr, tb.t, tb.s, 2, 3);
  }
  // a notice / news screen on a free short wall
  for (const sd of [Fr.side < 2 ? 2 : 0, Fr.side < 2 ? 3 : 1]) {
    const Fs = frame(r, sd);
    const rr = windowRun(ctx, Fs, 2, 3);
    if (!rr || (cabin && Fs.side === ctx.cabinSide)) continue;
    wallScreen(ctx, Fs, rr[0] + 0.2, rr[1] - 0.2, y + 1.3, y + 2.2);
    break;
  }
  panelLights(ctx, 3, WARMW);
  void g;
  return true;
}

// ======================================================================
// mess hall
// ======================================================================
// The galley along one wall (fridges, stoves under hoods, worktops, a
// serving counter with trays and a sneeze guard, the kitchen aisle behind
// it), rows of long mess tables with benches, dispensers by the doors and,
// on the hull, a window onto space.
SS.ss_mess = (ctx) => {
  tryFrames(ctx, sidesLong(ctx), (Fr, last) => buildMess(ctx, Fr, last), stores);
  crashed(ctx, 0.7);
};
function buildMess(ctx, Fr, last) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor;
  const hull = outerSides(ctx);
  if (hull.includes(Fr.side) && !last) return no(ctx, 'galley on the hull');
  const run = longest(runs(Fr.Wd, (s) => wallFree(ctx, Fr, s, 3), last ? 4 : 5));
  if (!run && !last) return no(ctx, 'galley wall');
  if (run) buildGalley(ctx, Fr, run);
  return messHall(ctx, Fr, last, hull, run ? 4 : 1);
}
function buildGalley(ctx, Fr, run) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor;
  let [a, b] = run;
  while (b - a > 11) { a++; if (b - a > 11) b--; }
  for (let s = a; s < b; s++) {
    const [x, z] = Fr.cell(0, s);
    const k = s - a;
    if (k === 0 || k === b - a - 1) cabinet(ctx, x, z, Fr.toward, y, 2.25, 0.72);
    else if (k % 3 === 1) {
      // stove / oven with an extractor hood
      wallBox(ctx, x, z, Fr.toward, 0.72, y, y + 0.92, faced(Fr.away, TS.MACHINE, TS.METAL), { solid: true, uv: 'fit' });
      wallBox(ctx, x, z, Fr.toward, 0.85, y + 1.95, y + 2.4, TS.METAL, { inset: 0.02 });
      wallBox(ctx, x, z, Fr.toward, 0.3, y + 2.4, Math.min(y + r.ceilH, y + 3.6), TS.PIPE, { inset: 0.32 });
    } else {
      // worktop with cupboards, a wall shelf of tins and jars above
      wallBox(ctx, x, z, Fr.toward, 0.72, y, y + 0.92, faced(Fr.away, TS.CRATE2, TS.METAL), { solid: true, uv: 'fit' });
      wallBox(ctx, x, z, Fr.toward, 0.32, y + 1.6, y + 1.64, TS.METAL);
      for (let q = 0; q < 3; q++) if (rng.chance(0.7)) {
        const [px, pz] = Fr.pt(0.12, s + 0.2 + q * 0.28);
        deco.box(px - 0.08, y + 1.64, pz - 0.08, px + 0.08, y + 1.64 + rng.float(0.12, 0.26), pz + 0.08, rng.pick([TS.CRATE, TS.GLASS, TS.METAL]), { uv: 'fit' });
      }
    }
  }
  // serving counter at t = 2 with the kitchen aisle behind it, open at both ends
  const [cx0, cz0, cx1, cz1] = wr(Fr, 2.1, 2.85, a + 1, b - 1);
  counter(ctx, cx0, cz0, cx1, cz1, y, Fr.away, { front: TS.PANEL, top: TS.METAL, h: 1.0 });
  for (let s = a + 1.3; s < b - 1.3; s += 0.9) {
    const [tx0, tz0, tx1, tz1] = wr(Fr, 2.25, 2.7, s, s + 0.6);
    deco.box(tx0, y + 1.0, tz0, tx1, y + 1.06, tz1, TS.METAL);
  }
  const [gx0, gz0, gx1, gz1] = wr(Fr, 2.42, 2.46, a + 1.1, b - 1.1);
  deco.box(gx0, y + 1.35, gz0, gx1, y + 1.62, gz1, TS.GLASS, { emissive: 0.15, uv: 'fit' });
  for (const s of [a + 1.1, b - 1.14]) { const [px0, pz0, px1, pz1] = wr(Fr, 2.41, 2.47, s, s + 0.04); deco.box(px0, y + 1.0, pz0, px1, y + 1.62, pz1, TS.METAL, { faces: FACE.SIDES }); }
  lightStrip(ctx, ...wr(Fr, 1.2, 1.5, a + 1, b - 1), y + r.ceilH, WARMW, 5);
  useL(ctx, Fr, 0, a, 4, b - a);
}
function messHall(ctx, Fr, last, hull, tStart) {
  const { rng, room: r } = ctx;
  const y = r.floor;
  // dining: rows of tables (2 cells each) with aisles, parallel to the galley
  const m = freeMask(ctx, Fr, 0);
  let tables = 0;
  for (let t0 = tStart; t0 + 2 <= Fr.L; t0 += 3) {
    for (const [s0, s1] of runs(Fr.Wd, (s) => m[t0][s] && m[t0 + 1][s], 3)) {
      for (let s = s0; s + 3 <= s1;) {
        const len = Math.min(5, s1 - s);
        const [x0, z0, x1, z1] = wr(Fr, t0 + 0.55, t0 + 1.45, s + 0.25, s + len - 0.25);
        P.messTable(ctx, x0, z0, x1, z1, y);
        markMask(m, t0, s, 2, len);
        useL(ctx, Fr, t0, s, 2, len);
        tables++;
        s += len + 1;
      }
    }
  }
  if (tables < (last ? 1 : 2)) return no(ctx, 'tables ' + tables);
  // dispensers on free wall spots
  let vend = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (vend >= 2) break;
    if (ctx.used.has(ctx.g.idx(x, z))) continue;
    vending(ctx, x, z, d, y);
    use(ctx, x, z, 1, 1);
    vend++;
  }
  // a window onto space on the hull wall
  for (const side of hull) {
    const Fh = frame(r, side);
    const wrn = windowRun(ctx, Fh, 3, 9);
    if (wrn) shipWindow(ctx, Fh, wrn[0], wrn[1]);
  }
  panelLights(ctx, 3, WARMW);
  return true;
}

// ======================================================================
// med bay
// ======================================================================
// Beds head to one long wall with vitals monitors, IV stands and privacy
// curtains between them, medicine cabinets and a scrub sink on the opposite
// wall, the surgery table under its lamp cluster in the middle, cryo pods on
// a short wall.
SS.ss_med = (ctx) => {
  tryFrames(ctx, sidesLong(ctx), (Fr, last) => buildMed(ctx, Fr, last), stores);
  crashed(ctx, 0.6);
};
function buildMed(ctx, Fr, last) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor;
  const wreck = isCrashed(ctx);
  let beds = 0;
  for (let s = 1; s < Fr.Wd - 1; s += 2) {
    if (!wallFree(ctx, Fr, s, 2)) continue;
    const [x, z] = Fr.cell(0, s);
    bed(ctx, x, z, Fr.toward, y, { rumpled: true });
    if (wallFree(ctx, Fr, s + 1)) {
      const [mx, mz] = Fr.pt(0.3, s + 1.45);
      vitalsMonitor(ctx, mx, mz, y, Fr.away);
      const [ix, iz] = Fr.pt(1.0, s + 1.6);
      ivStand(ctx, ix, iz, y);
    }
    const [c0x, c0z] = Fr.pt(0.15, s + 1.03), [c1x, c1z] = Fr.pt(2.3, s + 1.03);
    curtain(ctx, c0x, c0z, c1x, c1z, y, rng.float(0.25, 0.85));
    useL(ctx, Fr, 0, s, 2, 1);
    beds++;
  }
  if (beds < (last ? 1 : 2)) return no(ctx, 'beds ' + beds);
  // cabinets, a scrub sink and a scanner on the opposite wall
  const Fo = opp(r, Fr);
  let k = 0;
  for (let s = 0; s < Fo.Wd; s++) {
    if (!wallFree(ctx, Fo, s)) continue;
    const [x, z] = Fo.cell(0, s);
    const roll = k++ % 4;
    if (roll === 0 || roll === 2) cabinet(ctx, x, z, Fo.toward, y, 2.1, 0.55);
    else if (roll === 1) {
      counter(ctx, ...wr(Fo, 0.02, 0.65, s + 0.04, s + 0.96), y, Fo.away, { front: TS.CRATE2, top: TS.METAL, h: 0.95 });
      const [sx0, sz0, sx1, sz1] = wr(Fo, 0.12, 0.5, s + 0.25, s + 0.75);
      deco.box(sx0, y + 0.9, sz0, sx1, y + 0.96, sz1, TS.WATER, { emissive: 0.2 });
      wallBox(ctx, x, z, Fo.toward, 0.06, y + 1.3, y + 1.9, TS.GLASS, { inset: 0.2, uv: 'fit', emissive: 0.25 });
    } else machineBlock(ctx, x, z, Fo.toward, y, 1.9, 0.6);
    useL(ctx, Fo, 0, s, 1, 1);
  }
  // surgery table under the lamp cluster, an instrument trolley and the
  // anaesthesia cart - in deep bays inside a glazed operating theatre (steel
  // framed glass on all four sides, the doorway toward the ward aisle, a
  // scrub sink beside it), otherwise out on the ward floor
  const m = freeMask(ctx, Fr, 1);
  const centre = (t, s, dt, ds) => -Math.abs(t + dt / 2 - Fr.L / 2) * 0.5 - Math.abs(s + ds / 2 - Fr.Wd / 2);
  let sr = null, theatre = null;
  if (Fr.L >= 10 && Fr.Wd >= 9) {
    // against a side wall (that wall closes the theatre) or two cells clear of it, never a one-cell slot
    const slot = (s, ds) => s === 1 || s + ds === Fr.Wd - 1;
    theatre = bestRect(m, { minT: 4, maxT: 5, minS: 5, maxS: 6, t0: 4, t1: Fr.L - 2, score: (t, s, dt, ds) => dt * ds + centre(t, s, dt, ds) - (slot(s, ds) ? 100 : 0) });
    if (theatre && slot(theatre.s, theatre.ds)) theatre = null;
    if (theatre) {
      const { t, s, dt, ds } = theatre;
      const gh = Math.min(2.95, r.ceilH - 0.4);
      const ow = ds >= 6 ? 3 : 2, o0 = s + Math.floor((ds - ow) / 2);
      glassLineL(ctx, Fr, t, s, s + ds, y, gh, [[o0, o0 + ow]]);
      glassLineL(ctx, Fr, t + dt, s, s + ds, y, gh);
      for (const sl of [s, s + ds]) {
        if (sl === 0 || sl === Fr.Wd) continue;
        const [ax, az] = Fr.pt(t, sl), [bx, bz] = Fr.pt(t + dt, sl);
        glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, gh);
      }
      // the sliding glass leaf parked open beside the doorway
      doorLeafL(ctx, Fr, t, o0 + ow, Math.min(s + ds, o0 + ow + 1), y, 1);
      // scrub sink against the glass beside the doorway, on the ward side
      if (o0 - s >= 1) {
        const [x0, z0, x1, z1] = wr(Fr, t - 0.6, t - 0.08, o0 - 0.95, o0 - 0.1);
        deco.box(x0, y, z0, x1, y + 0.9, z1, { side: TS.METAL, top: TS.METAL, bottom: TS.METAL });
        const [w0, v0, w1, v1] = wr(Fr, t - 0.5, t - 0.18, o0 - 0.8, o0 - 0.25);
        deco.box(w0, y + 0.9, v0, w1, y + 0.94, v1, TS.WATER, { emissive: 0.2 });
        deco.collider(x0, y, z0, x1, y + 0.94, z1);
      }
      useL(ctx, Fr, t - 1, s - 1, dt + 2, ds + 2);
      sr = { t: t + Math.floor((dt - 3) / 2), s: s + 1, dt: 3, ds: ds - 2 };
    }
  }
  if (!sr) sr = bestRect(m, { minT: 3, minS: 3, maxT: 3, maxS: 4, t0: 2, score: centre });
  if (sr) {
    const tc = sr.t + 1.5, sc = sr.s + sr.ds / 2;
    steelTable(ctx, ...wr(Fr, tc - 0.4, tc + 0.4, sc - 1.0, sc + 1.0), y, { top: TS.CARPET });
    const top = y + r.ceilH;
    const [lx, lz] = Fr.pt(tc, sc);
    deco.box(lx - 0.05, top - 1.0, lz - 0.05, lx + 0.05, top, lz + 0.05, TS.METAL, { faces: FACE.SIDES });
    for (const [ox, oz] of [[-0.35, 0], [0.35, 0], [0, -0.35], [0, 0.35]]) {
      deco.box(lx + ox - 0.22, top - 1.25, lz + oz - 0.22, lx + ox + 0.22, top - 1.05, lz + oz + 0.22, TS.METAL);
      deco.box(lx + ox - 0.17, top - 1.28, lz + oz - 0.17, lx + ox + 0.17, top - 1.25, lz + oz + 0.17, TS.LIGHT, { uv: 'fit', emissive: 1 });
    }
    deco.light(lx, top - 1.8, lz, [1, 1, 0.95], 6);
    // in the theatre the doorway is on the near (t) side: the carts stand on the far side
    const fs = theatre ? 1 : -1;
    const [tx, tz] = Fr.pt(tc - 1.1 * fs, sc - 0.6 * fs);
    trolley(ctx, tx, tz, y, Fr.away >= 2);
    const [ax, az] = Fr.pt(tc + 1.15 * fs, sc + 0.9);
    deco.box(ax - 0.3, y, az - 0.25, ax + 0.3, y + 1.25, az + 0.25, { side: TS.MACHINE, top: TS.METAL, bottom: TS.METAL }, { uv: 'fit', solid: true });
    monitor(ctx, ax, az, y + 1.25, Fr.away);
    useL(ctx, Fr, sr.t, sr.s, sr.dt, sr.ds);
  }
  // cryo pods along a short wall
  for (const sd of rng.shuffle([Fr.side < 2 ? 2 : 0, Fr.side < 2 ? 3 : 1])) {
    const Fs = frame(r, sd);
    let pods = 0;
    for (let s = 1; s < Fs.Wd - 1 && pods < 3; s += 2) {
      if (!wallFree(ctx, Fs, s)) continue;
      const [x, z] = Fs.cell(0, s);
      P.cryoPod(ctx, x, z, Fs.toward, y, { broken: wreck && rng.chance(0.5) });
      useL(ctx, Fs, 0, s, 1, 1);
      pods++;
    }
    if (pods) break;
  }
  panelLights(ctx, 3, [0.9, 0.97, 1]);
  return true;
}

// ======================================================================
// armory
// ======================================================================
// Weapon racks down the long walls, a barred cage across one end holding
// the ammunition and explosives (gate in the bars), the gunsmith's bench in
// the middle, red alert lamps.
SS.ss_armory = (ctx) => {
  tryFrames(ctx, sidesShort(ctx), (Fr, last) => buildArmory(ctx, Fr, last), stores);
  crashed(ctx, 0.6);
};
function buildArmory(ctx, Fr, last) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor;
  // the cage across the frame (short) wall
  const D = Math.max(3, Math.min(4, Math.floor(Fr.L * 0.32)));
  let cage = false;
  if (Fr.L >= D + 5) {
    const op = lineOpening(ctx, Fr, D, 2, 3, Math.floor(Fr.Wd / 2) - 1);
    if (op) {
      glassLineL(ctx, Fr, D, 0, Fr.Wd, y, Math.min(3.0, r.ceilH - 0.3), [op], { pane: 'bars', header: TS.METAL });
      // stock inside: ammo crates, explosive drums with hazard bands, a heavy rack
      const mc = freeMask(ctx, Fr, 0);
      for (let t = 0; t < D; t++) for (let s = op[0] - 1; s <= op[1]; s++) if (mc[t] && s >= 0 && s < Fr.Wd) mc[t][s] = false;
      let n = 0;
      for (let s = 0; s + 2 <= Fr.Wd && n < 6; s++) {
        for (let t = 0; t + 2 <= D && n < 6; t += 2) {
          if (!mc[t][s] || !mc[t][s + 1] || !mc[t + 1] || !mc[t + 1][s] || !mc[t + 1][s + 1]) continue;
          const [cx, cz] = Fr.pt(t + 1, s + 1);
          if (rng.chance(0.6)) deco.crateStack(cx, cz, y, { count: rng.int(2, 4), tex: TS.CRATE });
          else {
            for (const [ox, oz] of [[-0.35, -0.3], [0.3, -0.3], [0, 0.35]]) {
              cylV(deco, cx + ox, cz + oz, y, y + 0.9, 0.27, TS.METAL);
              cylV(deco, cx + ox, cz + oz, y + 0.55, y + 0.68, 0.29, TS.PAINT);
            }
            deco.collider(cx - 0.65, y, cz - 0.6, cx + 0.6, y + 0.9, cz + 0.65);
          }
          markMask(mc, t, s, 2, 2);
          n++;
        }
      }
      deco.light(...Fr.pt(D / 2, Fr.Wd / 2).flatMap((v, i) => (i === 0 ? [v, y + 2.6] : [v])), ALARM, 5, { pulse: true });
      useL(ctx, Fr, 0, 0, D + 1, Fr.Wd);
      cage = true;
    }
  }
  if (!cage && !last) return no(ctx, 'cage');
  // racks down both long walls
  let racks = 0;
  for (const sd of [Fr.side < 2 ? 2 : 0, Fr.side < 2 ? 3 : 1]) {
    const Fl = frame(r, sd);
    for (let s = 0; s < Fl.Wd; s++) {
      if (!wallFree(ctx, Fl, s)) continue;
      const [x, z] = Fl.cell(0, s);
      if ((s + racks) % 4 === 3) P.suitLocker(ctx, x, z, Fl.toward, y);
      else P.weaponRack(ctx, x, z, Fl.toward, y);
      useL(ctx, Fl, 0, s, 1, 1);
      racks++;
    }
  }
  if (racks < 3) return no(ctx, 'racks');
  // the gunsmith's bench and a cleaning table
  const m = freeMask(ctx, Fr, 1);
  const wb = bestRect(m, { minT: 1, minS: 3, maxT: 1, maxS: 4 });
  if (wb) {
    workbench(ctx, ...wr(Fr, wb.t + 0.15, wb.t + 0.85, wb.s + 0.1, wb.s + wb.ds - 0.1), y, { top: TS.METAL });
    const [lx, lz] = Fr.pt(wb.t + 0.5, wb.s + wb.ds / 2);
    hangLight(ctx, lx, lz, y + r.ceilH, Math.max(0.4, r.ceilH - 3.2), WARMW, 5);
    useL(ctx, Fr, wb.t, wb.s, 1, wb.ds);
  }
  panelLights(ctx, 4, [1, 0.92, 0.85]);
  return true;
}

// ======================================================================
// stores
// ======================================================================
// Shelving aisles (back-to-back racks with 2-wide aisles and cross aisles),
// pallets and crates in the leftover floor.
SS.ss_storage = (ctx) => {
  tryFrames(ctx, sidesLong(ctx), (Fr, last) => buildStorage(ctx, Fr, last), stores);
  crashed(ctx, 0.9);
};
function buildStorage(ctx, Fr, last) {
  const { rng, room: r } = ctx;
  const y = r.floor;
  const h = Math.min(2.6, r.ceilH - 1.2);
  let shelves = 0;
  // racks against the frame wall
  for (const [a, b] of runs(Fr.Wd, (s) => wallFree(ctx, Fr, s), 2)) {
    for (let s = a; s < b; s += 4) {
      const e = Math.min(b, s + 3);
      if (e - s < 2) continue;
      cargoRack(ctx, ...wr(Fr, 0.05, 0.8, s + 0.05, e - 0.05), y, h);
      useL(ctx, Fr, 0, s, 1, e - s);
      shelves++;
    }
  }
  // back-to-back rack rows across the floor with 2-wide aisles
  const m = freeMask(ctx, Fr, 0);
  for (let t = 3; t + 2 <= Fr.L - 2; t += 4) {
    for (const [a, b] of runs(Fr.Wd, (s) => m[t][s] && m[t + 1][s], 3)) {
      for (let s = a + 1; s + 2 <= b - 1; s += 5) {
        const e = Math.min(b - 1, s + 4);
        if (e - s < 2) continue;
        cargoRack(ctx, ...wr(Fr, t + 0.1, t + 0.95, s + 0.05, e - 0.05), y, h);
        cargoRack(ctx, ...wr(Fr, t + 1.05, t + 1.9, s + 0.05, e - 0.05), y, h);
        markMask(m, t, s, 2, e - s);
        useL(ctx, Fr, t, s, 2, e - s);
        shelves += 2;
      }
    }
  }
  if (shelves < (last ? 1 : 3)) return no(ctx, 'shelves');
  stock(ctx, Math.max(1, Math.floor(r.area / 70)), ['crates', 'pallet', 'drum']);
  panelLights(ctx, 4, COOL);
  void rng;
  return true;
}

// ======================================================================
// observation lounge
// ======================================================================
// A long window onto space (on the hull), sofas and low tables facing it,
// a bar counter with stools and a lit bottle shelf, planters and a holo
// display.
SS.ss_lounge = (ctx) => {
  const hs = outerSides(ctx);
  tryFrames(ctx, hs.length ? [...hs, ...sidesLong(ctx).filter((s) => !hs.includes(s))] : sidesLong(ctx), (Fr, last) => buildLounge(ctx, Fr, last), stores);
  crashed(ctx, 0.7);
};
function buildLounge(ctx, Fr, last) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor;
  // the window on the frame wall (hull) - or a big wall screen showing the stars
  const wrn = windowRun(ctx, Fr, 3, 12);
  if (!wrn) return no(ctx, 'window wall');
  if (!shipWindow(ctx, Fr, wrn[0], wrn[1], { sill: 0.6, head: Math.min(r.ceilH - 0.5, 3.4) })) {
    if (!last) return no(ctx, 'no hull');
    wallScreen(ctx, Fr, wrn[0] + 0.2, wrn[1] - 0.2, y + 0.9, y + Math.min(r.ceilH - 0.6, 3.0));
    useL(ctx, Fr, 0, wrn[0], 1, wrn[1] - wrn[0]);
  }
  // sofa rows facing the window, with low tables in front
  const m = freeMask(ctx, Fr, 0);
  let seats = 0;
  for (let t = 2; t + 1 <= Fr.L - 1 && seats < 3; t += 3) {
    const rr = longest(runs(Fr.Wd, (s) => m[t][s] && (t < 1 || m[t - 1][s]), 3));
    if (!rr) continue;
    const a = rr[0] + (rr[1] - rr[0] > 6 ? 1 : 0), b = Math.min(rr[1], a + 5);
    const [x0, z0, x1, z1] = wr(Fr, t + 0.2, t + 0.75, a + 0.1, b - 0.1);
    const alongXs = Fr.lat < 2;
    seatRow(ctx, x0, z0, alongXs ? x1 - x0 : z1 - z0, alongXs, y, Fr.toward);
    // coffee table in front (toward the window)
    const [tx0, tz0, tx1, tz1] = wr(Fr, t - 0.75, t - 0.25, a + 0.8, b - 0.8);
    deco.box(tx0, y + 0.38, tz0, tx1, y + 0.44, tz1, TS.METAL);
    deco.box(tx0 + 0.1, y, tz0 + 0.1, tx1 - 0.1, y + 0.38, tz1 - 0.1, TS.METAL, { faces: FACE.SIDES });
    deco.collider(tx0, y, tz0, tx1, y + 0.44, tz1, { obstacle: false });
    markMask(m, t - 1, a, 2, b - a);
    useL(ctx, Fr, t - 1, a, 2, b - a);
    seats++;
  }
  if (!seats && !last) return no(ctx, 'seats');
  // the bar along a side wall: counter with stools, bottle shelf behind
  for (const sd of rng.shuffle([Fr.side < 2 ? 2 : 0, Fr.side < 2 ? 3 : 1])) {
    const Fs = frame(r, sd);
    const rr = longest(runs(Fs.Wd, (s) => wallFree(ctx, Fs, s, 3), 3));
    if (!rr) continue;
    const a = rr[0], b = Math.min(rr[1], rr[0] + 5);
    openShelf(ctx, ...wr(Fs, 0.04, 0.4, a + 0.1, b - 0.1), y + 1.0, 1.4, { items: [TS.GLASS, TS.GLASS, TS.CRATE] });
    counter(ctx, ...wr(Fs, 0.05, 0.6, a + 0.1, b - 0.1), y, Fs.away, { front: TS.CRATE2, top: TS.METAL, h: 0.95 });
    counter(ctx, ...wr(Fs, 1.25, 1.8, a + 0.3, b - 0.3), y, Fs.away, { front: TS.PANEL, top: TS.METAL, h: 1.1 });
    for (let s = a + 0.8; s < b - 0.5; s += 0.9) {
      const [sx, sz] = Fs.pt(2.25, s);
      deco.box(sx - 0.03, y, sz - 0.03, sx + 0.03, y + 0.7, sz + 0.03, TS.METAL, { faces: FACE.SIDES });
      deco.box(sx - 0.2, y + 0.7, sz - 0.2, sx + 0.2, y + 0.78, sz + 0.2, TS.CARPET);
    }
    lightStrip(ctx, ...wr(Fs, 0.8, 1.0, a + 0.3, b - 0.3), y + r.ceilH, AMBER, 4);
    useL(ctx, Fs, 0, a, 3, b - a);
    break;
  }
  // planters in the corners, a holo display if there is floor left
  let pl = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (pl >= 3 || ctx.used.has(ctx.g.idx(x, z))) continue;
    deco.box(x + 0.15, y, z + 0.15, x + 0.85, y + 0.6, z + 0.85, TS.METAL, { solid: true });
    deco.box(x + 0.2, y + 0.6, z + 0.2, x + 0.8, y + 1.4, z + 0.8, TS.FOLIAGE, { s: 1 });
    use(ctx, x, z, 1, 1);
    pl++;
    void d;
  }
  const m2 = freeMask(ctx, Fr, 1);
  const hr = bestRect(m2, { minT: 2, minS: 2, maxT: 2, maxS: 2 });
  if (hr) { const [hx, hz] = Fr.pt(hr.t + 1, hr.s + 1); P.holoTable(ctx, hx, hz, y, 0.6); useL(ctx, Fr, hr.t, hr.s, 2, 2); }
  panelLights(ctx, 4, WARMW);
  return true;
}

export { cargoRack, slideDoor, runs, longest, wallFree, wr, opp, shipWindow, windowRun, steelBench, vending, stock, stores, WARMW, PURPLE };
