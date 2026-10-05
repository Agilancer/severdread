// Working decks of the "starship" archetype (see gen_starship.js): airlocks
// and the docking port, the two-level maintenance deck, life support /
// hydroponics, cargo holds, the shuttle hangar and the crashed ship's crash
// site. Built in wall frames like the crew decks (starship_decks.js).
import { TS, F, DIR_X, DIR_Z, OPP } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import { glassLineL, glassWall, showerGantry, tank, deckBridge } from './lab_templates.js';
import {
  SS, tryFrames, sidesLong, sidesShort, outerSides, fb, cellL, wallClosed, railAll, panelLights, highBay, pipeRun, wallScreen,
  crashed, gallery, deckFace, isCrashed, no, canUseL, useL, okL, ok, use, setHeightL, flightL, wallSpots, wallBox, hangLight, paint,
  hazardLines, pitSet, freeMask, bestRect, markMask, lineOpening, cabinet, machineBlock, counter, monitor, riser, openShelf, nSteps,
  lightStrip, cylV, cylH, crane, pallet, drum, forklift, workbench, P,
} from './starship_rooms.js';
import { slideDoor, runs, longest, wallFree, wr, opp, shipWindow, windowRun, steelBench, stock, stores, WARMW, PURPLE } from './starship_decks.js';

const { faced, CYAN, COOL, AMBER, ALARM, GREENL, FIREL } = P;

// ======================================================================
// airlocks and the docking port
// ======================================================================
// The outer hatch in the hull (heavy door, porthole, hazard frame, warning
// beacon), the airlock chamber behind an insulated bulkhead with the inner
// hatch, a decontamination gantry, EVA suits in their niches, benches and a
// cycle console in the suit room. The docking port (the freighter's start)
// has a docking collar round the hatch and a window beside it.
SS.ss_airlock = (ctx) => {
  const hs = outerSides(ctx);
  tryFrames(ctx, hs.length ? hs : sidesLong(ctx), (Fr, last) => buildAirlock(ctx, Fr, last, false), (c) => airlockLite(c));
  crashed(ctx, 0.5);
};
SS.ss_dock = (ctx) => {
  const hs = outerSides(ctx);
  tryFrames(ctx, hs.length ? hs : sidesLong(ctx), (Fr, last) => buildAirlock(ctx, Fr, last, true), (c) => airlockLite(c));
};
// heavy hatch on the frame wall over s in [s0, s0 + 3)
function hatch(ctx, Fr, s0, y, o = {}) {
  const { deco } = ctx;
  const out = Fr.away;
  fb(deco, Fr, 0, 0.12, s0 - 0.25, s0 + 3.25, y, y + 3.2, TS.TRIM, { faces: FACE.SIDES | FACE.TOP });
  fb(deco, Fr, 0, 0.16, s0 + 0.05, s0 + 2.95, y, y + 2.85, faced(out, TS.METAL, TS.METAL), { uv: 'fit' });
  // hazard band round the leaf, the locking wheel and the porthole
  fb(deco, Fr, 0.16, 0.18, s0 + 0.05, s0 + 2.95, y + 2.62, y + 2.8, TS.PAINT, { uv: 'fit' });
  fb(deco, Fr, 0.16, 0.18, s0 + 0.05, s0 + 0.25, y, y + 2.62, TS.PAINT, { uv: 'fit' });
  fb(deco, Fr, 0.16, 0.18, s0 + 2.75, s0 + 2.95, y, y + 2.62, TS.PAINT, { uv: 'fit' });
  fb(deco, Fr, 0.16, 0.2, s0 + 1.2, s0 + 1.8, y + 1.75, y + 2.3, TS.GLASS, { uv: 'fit', emissive: 0.45 });
  fb(deco, Fr, 0.16, 0.26, s0 + 1.1, s0 + 1.9, y + 1.0, y + 1.12, TS.METAL);
  fb(deco, Fr, 0.16, 0.26, s0 + 1.44, s0 + 1.56, y + 0.7, y + 1.42, TS.METAL);
  // warning beacon over the hatch, status panel beside it
  fb(deco, Fr, 0, 0.3, s0 + 1.3, s0 + 1.7, y + 3.25, y + 3.5, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.light(...lightAt(Fr, 0.8, s0 + 1.5, y + 3.0), o.light ?? ALARM, 5, { pulse: true });
  fb(deco, Fr, 0, 0.06, s0 + 3.4, s0 + 3.85, y + 1.2, y + 1.75, TS.SCREEN, { uv: 'fit', emissive: 0.85 });
  if (o.collar) {
    // docking collar: a heavy ring round the hatch frame
    fb(deco, Fr, 0, 0.38, s0 - 0.55, s0 - 0.25, y, y + 3.5, TS.MACHINE, { uv: 'fit' });
    fb(deco, Fr, 0, 0.38, s0 + 3.25, s0 + 3.55, y, y + 3.5, TS.MACHINE, { uv: 'fit' });
    fb(deco, Fr, 0, 0.38, s0 - 0.55, s0 + 3.55, y + 3.2, y + 3.5, TS.MACHINE, { uv: 'fit' });
    for (let k = 0; k < 4; k++) fb(deco, Fr, 0.38, 0.46, s0 - 0.5, s0 - 0.3, y + 0.4 + k * 0.8, y + 0.6 + k * 0.8, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
}
const lightAt = (Fr, t, s, y) => { const [x, z] = Fr.pt(t, s); return [x, y, z]; };
function buildAirlock(ctx, Fr, last, dock) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor;
  if (Fr.L < 7 || Fr.Wd < 6) return no(ctx, 'small');
  // the outer hatch: centred on the hull wall where the wall is closed
  const hs0 = Math.floor(Fr.Wd / 2) - 1 + rng.int(-1, 1);
  let s0 = -1;
  for (const c of [hs0, hs0 - 1, hs0 + 1, hs0 - 2, hs0 + 2]) {
    if (c < 1 || c + 4 > Fr.Wd) continue;
    let good = true;
    for (let s = c - 1; s < c + 4 && good; s++) if (s >= 0 && s < Fr.Wd && !wallFree(ctx, Fr, s)) good = false;
    if (good) { s0 = c; break; }
  }
  if (s0 < 0) return no(ctx, 'hatch wall');
  // the chamber: an insulated bulkhead at t = D with the inner hatch opposite the outer one
  let D = 0, op = null;
  for (const d of Fr.L >= 10 ? [4, 3, 5] : [3, 4]) {
    if (d > Fr.L - 4) continue;
    op = lineOpening(ctx, Fr, d, 3, 3, s0);
    if (op) { D = d; break; }
  }
  if (!op && !last) return no(ctx, 'inner hatch');
  hatch(ctx, Fr, s0, y, { collar: dock, light: dock ? AMBER : ALARM });
  useL(ctx, Fr, 0, s0 - 1, 1, 5);
  if (!op) {
    // no room for the bulkhead: an open airlock bay with the gantry over the hatch
    D = 3;
    const [g0x, g0z] = Fr.pt(1.5, s0 - 0.6), [g1x, g1z] = Fr.pt(1.5, s0 + 3.6);
    if (okL(ctx, Fr, 1, s0, 2, 3)) showerGantry(ctx, g0x, g0z, g1x, g1z, y, Math.min(2.8, r.ceilH - 0.4));
    paint(ctx, ...wr(Fr, 2.6, 2.75, s0, s0 + 3), y);
    useL(ctx, Fr, 0, s0 - 1, 3, 5);
    return airlockRoom(ctx, Fr, last, dock, D, null, s0);
  }
  // the bulkhead is hull wall (WALL), framed in steel
  glassLineL(ctx, Fr, D, 0, Fr.Wd, y, r.ceilH, [op], { pane: TS.WALL, header: TS.WALL, thick: 0.2 });
  for (const [a, b] of [[op[0] - 0.95, op[0] - 0.04], [op[1] + 0.04, op[1] + 0.95]]) if (a >= 0 && b <= Fr.Wd) slideDoor(ctx, Fr, D, a, b, y, 1, TS.METAL);
  // red / green cycle lamps over the inner hatch
  fb(deco, Fr, D + 0.08, D + 0.16, op[0] + 0.3, op[0] + 0.6, y + 3.05, y + 3.25, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.light(...lightAt(Fr, D + 0.6, (op[0] + op[1]) / 2, y + 2.8), dock ? GREENL : ALARM, 4, { pulse: !dock });
  // decontamination gantry across the chamber, suit niches on its side walls
  if (D >= 3) {
    const [g0x, g0z] = Fr.pt(D / 2, 0.05), [g1x, g1z] = Fr.pt(D / 2, Fr.Wd - 0.05);
    showerGantry(ctx, g0x, g0z, g1x, g1z, y, Math.min(2.8, r.ceilH - 0.4));
  }
  for (let t = 0; t < D; t++) {
    for (const s of [0, Fr.Wd - 1]) {
      if (!okL(ctx, Fr, t, s, 1, 1) || (s >= op[0] - 1 && s <= op[1])) continue;
      const dirW = Fr.dirOf(s === 0 ? 'latN' : 'lat');
      const [x, z] = Fr.cell(t, s);
      const nb = ctx.g.idx(x + DIR_X[dirW], z + DIR_Z[dirW]);
      if (ctx.g.type[nb]) continue;
      if (t === Math.floor(D / 2)) continue;   // keep the gantry posts free
      P.suitLocker(ctx, x, z, dirW, y);
      useL(ctx, Fr, t, s, 1, 1);
    }
  }
  useL(ctx, Fr, 0, 0, D + 1, Fr.Wd);
  return airlockRoom(ctx, Fr, last, dock, D, op, s0);
}
function airlockRoom(ctx, Fr, last, dock, D, op, s0) {
  const { deco, room: r } = ctx;
  const y = r.floor;
  // the suit room: EVA suits and lockers on the walls, benches, the cycle console
  let suits = 0;
  for (const [x, z, d] of wallSpots(ctx)) {
    if (ctx.used.has(ctx.g.idx(x, z))) continue;
    if ((x + z) % 3 === 0) P.suitLocker(ctx, x, z, d, y);
    else if ((x + z) % 3 === 1) P.lockers(ctx, x, z, d, y, 1);
    else continue;
    use(ctx, x, z, 1, 1);
    suits++;
  }
  const m = freeMask(ctx, Fr, 0);
  const br = bestRect(m, { minT: 1, minS: 3, maxT: 1, maxS: 4, t0: D + 2 });
  if (br) {
    steelBench(ctx, ...wr(Fr, br.t + 0.25, br.t + 0.75, br.s + 0.1, br.s + br.ds - 0.1), y);
    useL(ctx, Fr, br.t, br.s, 1, br.ds);
  }
  const o2 = op || [s0, s0 + 3];
  const cs = o2[1] + 1 < Fr.Wd ? o2[1] : o2[0] - 1;
  if (cs >= 0 && cs < Fr.Wd && okL(ctx, Fr, D + 1, cs, 1, 1)) {
    const [x, z] = Fr.cell(D + 1, cs);
    deco.console(x, z, y, Fr.toward, { width: 0.8 });
    useL(ctx, Fr, D + 1, cs, 1, 1);
  }
  // the docking port: a window onto space beside the hatch
  if (dock) {
    const wa = runs(Fr.Wd, (s) => wallFree(ctx, Fr, s) && (s < s0 - 1 || s >= s0 + 4) && s > 0 && s < Fr.Wd - 1, 2);
    const w = longest(wa);
    if (w) shipWindow(ctx, Fr, w[0], Math.min(w[1], w[0] + 4), { head: Math.min(r.ceilH - 0.5, 2.9) });
  }
  if (!suits && !last) return no(ctx, 'suits');
  panelLights(ctx, 3, dock ? WARMW : COOL);
  return true;
}
// fallback: suit lockers round the walls and a beacon
function airlockLite(ctx) {
  const { room: r } = ctx;
  ctx.used = ctx.used || new Set();
  for (const [x, z, d] of wallSpots(ctx)) if ((x + z) % 3 === 0) { P.suitLocker(ctx, x, z, d, r.floor); use(ctx, x, z, 1, 1); }
  panelLights(ctx, 3, COOL);
}

// ======================================================================
// maintenance deck
// ======================================================================
// Two levels joined by stairs: a steel service deck along one long wall
// (junction boxes, a control panel, valves), the plant floor below with
// pumps on their plinths, a flooded sump under grating, pipe runs and
// risers on the walls, cable trays overhead.
SS.ss_maint = (ctx) => {
  tryFrames(ctx, sidesLong(ctx), (Fr, last) => buildMaint(ctx, Fr, last), stores);
  crashed(ctx, 0.7);
};
function buildMaint(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor, top = y + r.ceilH;
  // the service deck: as high and deep as the free wall allows
  let G = null, up = 0;
  for (const [u, gD, md] of [[r.ceilH >= 7.4 ? 3.6 : 3.0, 3, 4], [3.0, 3, 3], [3.0, 2, 3], [2.4, 2, 3]]) {
    G = gallery(ctx, Fr, gD, y + u, { minDeck: md, floorTex: TS.GRATE });
    if (G) { up = u; break; }
  }
  if (!G) return no(ctx, 'deck');
  deckFace(ctx, G);
  // junction boxes and valves on the wall of the deck, a control panel at one end
  for (let s = G.s0; s < G.s1; s++) {
    const k = s - G.s0;
    if (!wallClosed(ctx, Fr, s)) continue;
    const [x, z] = Fr.cell(0, s);
    if (k % 3 === 0) wallBox(ctx, x, z, Fr.toward, 0.45, y + up + 0.6, y + up + 1.8, faced(Fr.away, TS.MACHINE, TS.METAL), { uv: 'fit', inset: 0.15 });
    else if (k % 3 === 1) P.tankV(ctx, ...Fr.pt(0.45, s + 0.5), y + up, 0.3, 1.6, { gauge: true });
  }
  const [cx, cz] = Fr.cell(1, G.s1 - 1);
  deco.console(cx, cz, y + up, Fr.dirOf('latN'), { width: 0.8 });
  // the plant floor: a sump under grating and pumps
  const m = freeMask(ctx, Fr, 1);
  const sr = bestRect(m, { minT: 3, minS: 3, maxT: 4, maxS: 6, t0: 4 });
  let sump = null;
  if (sr) {
    const cells = [];
    for (let t = sr.t; t < sr.t + sr.dt; t++) for (let s = sr.s; s < sr.s + sr.ds; s++) cells.push(cellL(ctx, Fr, t, s));
    const kind = isCrashed(ctx) ? 'poison' : rng.pick(['water', 'water', 'poison']);
    pitSet(ctx, cells, kind, 1.6);
    // a grating walkway across the sump
    const mid = sr.dt >= sr.ds ? null : sr.t + Math.floor(sr.dt / 2);
    const bridgeCells = [];
    if (mid !== null) for (let s = sr.s; s < sr.s + sr.ds; s++) { const [x, z] = Fr.cell(mid, s); bridgeCells.push(...deckBridge(ctx, x, z, 1, 1, y)); }
    else { const ms = sr.s + Math.floor(sr.ds / 2); for (let t = sr.t; t < sr.t + sr.dt; t++) { const [x, z] = Fr.cell(t, ms); bridgeCells.push(...deckBridge(ctx, x, z, 1, 1, y)); } }
    hazardLines(ctx, cells.filter((i) => g.flags[i] & F.PIT));
    // a pump with its pipes standing in the sump
    useL(ctx, Fr, sr.t - 1, sr.s - 1, sr.dt + 2, sr.ds + 2);
    sump = sr;
  }
  let pumps = 0;
  const m2 = freeMask(ctx, Fr, 0);
  for (let k = 0; k < 3; k++) {
    const pr = bestRect(m2, { minT: 2, minS: 2, maxT: 2, maxS: 2, t0: 4 });
    if (!pr) break;
    const [px, pz] = Fr.pt(pr.t + 1, pr.s + 1);
    deco.box(px - 0.8, y, pz - 0.8, px + 0.8, y + 0.25, pz + 0.8, TS.METAL);
    cylV(deco, px, pz, y + 0.25, y + 1.35, 0.55, TS.MACHINE, { s: 1 });
    cylV(deco, px, pz, y + 1.35, y + 1.5, 0.62, TS.TRIM);
    cylV(deco, px, pz, y + 1.5, Math.min(top, y + 2.4), 0.2, TS.PIPE);
    if (top > y + 2.6) cylH(deco, Math.min(px, px + 2), Math.max(px, px + 2), y + 2.2, pz, 0.14, true, TS.PIPE);
    deco.collider(px - 0.8, y, pz - 0.8, px + 0.8, y + 1.5, pz + 0.8);
    markMask(m2, pr.t - 1, pr.s - 1, 4, 4);
    useL(ctx, Fr, pr.t, pr.s, 2, 2);
    pumps++;
  }
  if (!pumps && !sump && !last) return no(ctx, 'plant');
  // pipe runs along the far wall, risers in free corners, cable trays overhead
  const Fo = opp(r, Fr);
  pipeRun(ctx, Fo, 0, Fo.Wd, y + up + 1.2, 3, 0.16);
  pipeRun(ctx, Fr, 0, Fr.Wd, top - 0.5, 2, 0.12);
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 6)) {
    if (ctx.used.has(g.idx(x, z)) || rng.chance(0.5)) continue;
    riser(ctx, x + 0.5 + DIR_X[d] * 0.25, z + 0.5 + DIR_Z[d] * 0.25, y, top, 0.2);
    use(ctx, x, z, 1, 1);
  }
  for (let t = 4; t < Fr.L - 1; t += 4) fb(deco, Fr, t, t + 0.6, 0.5, Fr.Wd - 0.5, top - 0.75, top - 0.7, TS.GRATE);
  railAll(ctx);
  // caged bulkhead lamps on the walls of both levels
  for (const [x, z, d] of edgeLamps(ctx, 5)) deco.wallLight(x, z, d, g.floor[g.idx(x, z)] + 2.3, AMBER, { radius: 5 });
  highBay(ctx, 6, AMBER);
  return true;
}
function edgeLamps(ctx, every) {
  const { g, room: r } = ctx;
  const out = [];
  for (let x = r.x; x < r.x + r.w; x++) for (const [z, d] of [[r.z, 3], [r.z + r.h - 1, 2]]) if ((x - r.x) % every === 2) out.push([x, z, d]);
  for (let z = r.z; z < r.z + r.h; z++) for (const [x, d] of [[r.x, 1], [r.x + r.w - 1, 0]]) if ((z - r.z) % every === 2) out.push([x, z, d]);
  return out.filter(([x, z, d]) => {
    const i = g.idx(x, z), j = g.idx(x + DIR_X[d], z + DIR_Z[d]);
    return g.type[i] && !g.type[j] && !(g.flags[i] & (F.STAIR | F.PIT | F.DOOR)) && !r.reserved.has(i) && g.ceil[i] - g.floor[i] > 3.0;
  });
}

// ======================================================================
// life support / hydroponics
// ======================================================================
// Hydroponic racks in rows under purple grow lights, the algae / water
// reservoir with its feed tanks, air scrubbers with fan grilles on the
// walls, oxygen tanks.
SS.ss_life = (ctx) => {
  tryFrames(ctx, sidesLong(ctx), (Fr, last) => buildLife(ctx, Fr, last), stores);
  crashed(ctx, 0.6);
};
function buildLife(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor, top = y + r.ceilH;
  // air scrubbers along the frame wall
  let scrub = 0;
  for (const [a, b] of runs(Fr.Wd, (s) => wallFree(ctx, Fr, s), 2)) {
    for (let s = a; s + 2 <= b; s += 3) {
      const [x0, z0, x1, z1] = wr(Fr, 0.02, 0.85, s + 0.05, s + 1.95);
      deco.box(x0, y, z0, x1, y + 2.4, z1, faced(Fr.away, TS.MACHINE, TS.METAL), { uv: 'fit', solid: true });
      const [gx0, gz0, gx1, gz1] = wr(Fr, 0.85, 0.9, s + 0.3, s + 1.7);
      deco.box(gx0, y + 1.0, gz0, gx1, y + 2.1, gz1, TS.GRATE, { uv: 'fit' });
      cylV(deco, ...Fr.pt(0.45, s + 1), y + 2.4, top, 0.25, TS.PIPE);
      useL(ctx, Fr, 0, s, 1, 2);
      scrub++;
    }
  }
  // the reservoir: a sunk water / algae pool with feed tanks
  const m = freeMask(ctx, Fr, 1);
  const pr = bestRect(m, { minT: 3, minS: 3, maxT: 4, maxS: 5, score: (t, s, dt, ds) => dt * ds - Math.abs(s + ds / 2 - Fr.Wd / 2) });
  if (pr) {
    const cells = [];
    for (let t = pr.t; t < pr.t + pr.dt; t++) for (let s = pr.s; s < pr.s + pr.ds; s++) cells.push(cellL(ctx, Fr, t, s));
    pitSet(ctx, cells, 'water', 0.6);
    for (const i of cells) ctx.g.floorTex[i] = TS.WATER;
    railAll(ctx);
    for (const [ts, ss] of [[pr.t - 0.5, pr.s - 0.5], [pr.t - 0.5, pr.s + pr.ds + 0.5]]) {
      const [tx, tz] = Fr.pt(ts, ss);
      if (ok(ctx, Math.floor(tx), Math.floor(tz), 1, 1)) { tank(ctx, Math.floor(tx) + 0.5, Math.floor(tz) + 0.5, y, Math.min(top, y + 3.2), { fluid: TS.WATER, r: 0.35, ceil: top }); use(ctx, Math.floor(tx), Math.floor(tz), 1, 1); }
    }
    markMask(m, pr.t - 1, pr.s - 1, pr.dt + 2, pr.ds + 2);
    useL(ctx, Fr, pr.t - 1, pr.s - 1, pr.dt + 2, pr.ds + 2);
  }
  // hydroponic rack rows (1 deep, 2-wide aisles) across the rest of the floor
  let racks = 0;
  const rowStart = [1, 2].reduce((best, t0) => {
    let n = 0;
    for (let t = t0; t < Fr.L - 1; t += 3) n += runs(Fr.Wd, (s) => m[t][s], 2).reduce((q, [a, b]) => q + b - a, 0);
    return n > best[1] ? [t0, n] : best;
  }, [2, -1])[0];
  for (let t = rowStart; t < Fr.L - 1; t += 3) {
    for (const [a, b] of runs(Fr.Wd, (s) => m[t][s], 2)) {
      for (let s = a; s + 2 <= b; s += 5) {
        const e = Math.min(b, s + 4);
        P.plantRack(ctx, ...wr(Fr, t + 0.1, t + 0.9, s + 0.1, e - 0.1), y, r.ceilH >= 6 ? 4 : 3);
        markMask(m, t, s, 1, e - s);
        useL(ctx, Fr, t, s, 1, e - s);
        racks++;
      }
    }
  }
  if (racks < (last ? 1 : 2) && !(last && scrub)) return no(ctx, 'racks');
  // oxygen tanks on free wall spots
  let o2 = 0;
  for (const [x, z] of rng.shuffle(wallSpots(ctx))) {
    if (o2 >= 3 || ctx.used.has(g.idx(x, z))) continue;
    P.tankV(ctx, x + 0.5, z + 0.5, y, 0.32, 1.9, { gauge: true });
    use(ctx, x, z, 1, 1);
    o2++;
  }
  // grow-light strips over the racks
  for (let t = rowStart + 0.4; t < Fr.L - 1; t += 3) lightStrip(ctx, ...wr(Fr, t, t + 0.2, 1, Fr.Wd - 1), top, PURPLE, 5);
  r.lit = true;
  void scrub;
  return true;
}

// ======================================================================
// cargo hold
// ======================================================================
// A tall sunk hold: a steel gallery along one long wall at the deck level
// with stairs down at its ends, a freight lift beside the gallery, rows of
// shipping containers (stacked two or three high) with forklift aisles,
// painted bays, pallets, and a gantry crane on rails along both long walls
// carrying a container.
SS.ss_cargo = (ctx) => {
  tryFrames(ctx, sidesLong(ctx), (Fr, last) => buildCargo(ctx, Fr, last), (c) => { TEMPLATES_storage(c); });
  crashed(ctx, 0.5);
};
function TEMPLATES_storage(ctx) { stores(ctx); }
function buildCargo(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor, top = y + r.ceilH;
  const wreck = isCrashed(ctx);
  // gallery at the spine deck level (the hold is sunk below it)
  const deck = (r.leaf.deck ?? 0) - y;
  const up = Math.max(2.4, Math.min(3.6, Math.round(deck / 0.6) * 0.6 || 3.0));
  const G = gallery(ctx, Fr, 2, y + up, { minDeck: 4, floorTex: TS.GRATE });
  if (!G && !last) return no(ctx, 'gallery');
  if (G) deckFace(ctx, G);
  // freight lift next to the gallery: a 3x3 platform with guide rails to the ceiling
  let lift = null;
  const m = freeMask(ctx, Fr, 0);
  if (G) {
    const lr = bestRect(m, { minT: 3, minS: 3, maxT: 3, maxS: 3, t0: 2, t1: 5, score: (t, s) => -Math.abs(s - (G.s0 + G.s1) / 2) - t * 2 });
    if (lr) {
      const cells = setHeightL(ctx, Fr, lr.t, lr.s, 3, 3, y + 0.3, { floorTex: TS.GRATE, wallTex: TS.METAL });
      const [x0, z0, x1, z1] = wr(Fr, lr.t, lr.t + 3, lr.s, lr.s + 3);
      P.liftFrame(ctx, x0 + 0.1, z0 + 0.1, x1 - 0.1, z1 - 0.1, y, y + 0.3, top);
      markMask(m, lr.t - 1, lr.s - 1, 5, 5);
      useL(ctx, Fr, lr.t, lr.s, 3, 3);
      lift = cells;
    }
  }
  // container rows across the hold floor: blocks of 3 (along s) x 2 cells, 3-wide aisles
  let boxes = 0;
  const t0 = G ? 4 : 1;
  for (let t = t0 + 1; t + 2 <= Fr.L - 1; t += 5) {
    for (const [a, b] of runs(Fr.Wd, (s) => m[t][s] && m[t + 1][s], 3)) {
      for (let s = a; s + 3 <= b; s += 4) {
        const levels = wreck ? rng.int(1, 2) : rng.int(1, Math.max(1, Math.min(3, Math.floor((r.ceilH - 3.4) / 1.3))));
        const [x0, z0, x1, z1] = wr(Fr, t + 0.35, t + 1.6, s + 0.1, s + 2.9);
        const alongX = x1 - x0 >= z1 - z0;
        P.containerStack(ctx, x0, z0, y, alongX, levels, 2.8);
        // hazard paint round the container bay
        paint(ctx, ...wr(Fr, t + 0.1, t + 0.2, s, s + 3), y);
        paint(ctx, ...wr(Fr, t + 1.8, t + 1.9, s, s + 3), y);
        markMask(m, t, s, 2, 3);
        useL(ctx, Fr, t, s, 2, 3);
        boxes++;
      }
    }
  }
  if (boxes < (last ? 1 : 2)) return no(ctx, 'containers ' + boxes);
  // pallets and a forklift in the aisles
  stock(ctx, rng.int(1, 3), ['pallet', 'pallet', 'crates', 'drum']);
  for (let k = 0; k < 6; k++) {
    const fr = bestRect(m, { minT: 2, minS: 2, maxT: 2, maxS: 2, t0: t0 });
    if (!fr) break;
    if (!okL(ctx, Fr, fr.t, fr.s, 2, 2)) { markMask(m, fr.t, fr.s, 2, 2); continue; }
    const [fx, fz] = Fr.pt(fr.t + 1, fr.s + 1);
    forklift(ctx, fx, fz, y, Fr.dirOf(rng.chance(0.5) ? 'lat' : 'latN'));
    useL(ctx, Fr, fr.t, fr.s, 2, 2);
    break;
  }
  // gantry crane on rails along both long walls, carrying a container
  if (r.ceilH >= 8.5) {
    const yRail = top - 1.5;
    const sc = rng.float(Fr.Wd * 0.3, Fr.Wd * 0.7), tt = rng.float(Fr.L * 0.35, Fr.L * 0.65);
    const yLoad = Math.max(y + 5.2, yRail - 2.2);
    crane(ctx, Fr, 0.3, Fr.Wd - 0.3, yRail, sc, tt, { load: 'hook', yLoad, cab: true });
    const [hx, hz] = Fr.pt(tt, sc);
    const along = Fr.away >= 2;
    const hb = along ? [hx - 1.4, hz - 0.62, hx + 1.4, hz + 0.62] : [hx - 0.62, hz - 1.4, hx + 0.62, hz + 1.4];
    deco.box(hb[0], yLoad - 2.3, hb[1], hb[2], yLoad - 1.0, hb[3], TS.CRATE2, { s: 1.3 });
    for (const [ex, ez] of along ? [[hb[0] + 0.2, hz], [hb[2] - 0.2, hz]] : [[hx, hb[1] + 0.2], [hx, hb[3] - 0.2]]) deco.bar([hx, yLoad - 0.95, hz], [ex, yLoad - 1.0, ez], 0.04, 0.04, TS.METAL);
  }
  railAll(ctx, lift ? new Set(lift) : null);
  highBay(ctx, 6, COOL);
  return true;
}

// ======================================================================
// shuttle hangar
// ======================================================================
// The launch bay on the hull (a containment field onto space on the
// freighter; a jammed bay door on the crashed ship), a shuttle on its pad
// facing the bay, fuel lines and a fuel cart, tool carts, crates, and the
// flight-control booth raised on one side wall with windows over the pad.
SS.ss_hangar = (ctx) => {
  const hs = outerSides(ctx);
  tryFrames(ctx, hs.length ? hs : sidesLong(ctx), (Fr, last) => buildHangar(ctx, Fr, last), stores);
  crashed(ctx, 0.5);
};
function buildHangar(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor, top = y + r.ceilH;
  const wreck = isCrashed(ctx);
  if (Fr.L < 10 || Fr.Wd < 10) return no(ctx, 'small');
  // the bay opening on the hull wall
  const bay = longest(runs(Fr.Wd, (s) => s > 0 && s < Fr.Wd - 1 && wallFree(ctx, Fr, s), 5));
  if (!bay) return no(ctx, 'bay wall');
  let [ba, bb] = bay;
  while (bb - ba > 9) { ba++; if (bb - ba > 9) bb--; }
  const hull = outerSides(ctx).includes(Fr.side);
  if (hull && !wreck) shipWindow(ctx, Fr, ba, bb, { sill: 0, head: Math.min(r.ceilH - 1.0, 6.5), kind: 'bay' });
  else {
    // the closed (jammed) bay door: a tall slab with hazard bands
    fb(deco, Fr, 0, 0.2, ba, bb, y, y + Math.min(r.ceilH - 1.0, 6.0), faced(Fr.away, TS.METAL, TS.METAL), { s: 1.5 });
    for (let k = 0; k < 2; k++) fb(deco, Fr, 0.2, 0.22, ba, bb, y + 0.6 + k * 3.5, y + 0.9 + k * 3.5, TS.PAINT, { uv: 'fit' });
    useL(ctx, Fr, 0, ba, 1, bb - ba);
  }
  // the landing pad and the shuttle on it, nose toward the bay
  const m = freeMask(ctx, Fr, 0);
  const sr = bestRect(m, { minT: 7, minS: 7, maxT: 7, maxS: 7, t0: 1, score: (t, s) => -Math.abs(s + 3.5 - (ba + bb) / 2) - t * 0.5 });
  if (!sr && !last) return no(ctx, 'pad');
  if (sr) {
    const tc = sr.t + 3.5, sc = sr.s + 3.5;
    const [px, pz] = Fr.pt(tc, sc);
    for (const [a, b] of [[-3.3, -3.1], [3.1, 3.3]]) {
      paint(ctx, ...wr(Fr, tc + a, tc + b, sc - 3.3, sc + 3.3), y);
      paint(ctx, ...wr(Fr, tc - 3.3, tc + 3.3, sc + a, sc + b), y);
    }
    paint(ctx, ...wr(Fr, tc - 0.15, tc + 0.15, sc - 2, sc + 2), y);
    const alongX = Fr.away < 2;
    const nose = Fr.toward === 0 || Fr.toward === 2 ? 1 : -1;
    P.shuttle(ctx, px, pz, y, alongX, nose);
    if (wreck) { P.fire(ctx, ...Fr.pt(tc + 2.5, sc + 1.6), y, 0.9); P.debris(ctx, ...Fr.pt(tc - 2.4, sc - 2.4), y, 0.8, { obstacle: false }); }
    // pad lights at the corners
    for (const [a, b] of [[-3.2, -3.2], [-3.2, 3.2], [3.2, -3.2], [3.2, 3.2]]) {
      const [lx, lz] = Fr.pt(tc + a, sc + b);
      deco.box(lx - 0.12, y, lz - 0.12, lx + 0.12, y + 0.12, lz + 0.12, TS.LIGHT, { uv: 'fit', emissive: 1 });
    }
    markMask(m, sr.t, sr.s, 7, 7);
    useL(ctx, Fr, sr.t, sr.s, 7, 7);
  }
  // the flight-control booth on a side wall: raised deck, windows over the pad
  let booth = false;
  for (const sd of rng.shuffle([Fr.side < 2 ? 2 : 0, Fr.side < 2 ? 3 : 1])) {
    const Fs = frame(r, sd);
    const up = 3.0, n = nSteps(up);
    const bw = 4, bd = 3;
    // booth deck at Fs t in [0, bd), s in [b0, b0 + bw), the flight beside it along s
    for (const b0 of [Fs.Wd - bw - 1, 1, Math.floor((Fs.Wd - bw) / 2)]) {
      const fs0 = b0 + bw <= Fs.Wd - n - 1 ? b0 + bw : b0 - n;
      if (fs0 < 0 || fs0 + n > Fs.Wd) continue;
      const lo = Math.min(b0, fs0), hi = Math.max(b0 + bw, fs0 + n);
      if (!okL(ctx, Fs, 0, lo, bd, hi - lo, 0) || !okL(ctx, Fs, 0, fs0 > b0 ? fs0 + n : fs0 - 1, 2, 1, 0)) continue;
      let closed = true;
      for (let s = b0; s < b0 + bw; s++) if (!wallClosed(ctx, Fs, s)) closed = false;
      if (!closed) continue;
      const deckCells = setHeightL(ctx, Fs, 0, b0, bd, bw, y + up, { floorTex: TS.FLOOR3, wallTex: TS.METAL, head: 2.8 });
      flightL(ctx, Fs, 0, fs0, 2, n, fs0 > b0 ? 'latN' : 'lat', y, y + up);
      // booth walls: windows on the open side facing the hangar, consoles inside
      glassLineL(ctx, Fs, bd, b0, b0 + bw, y + up, Math.min(2.6, top - y - up - 0.3), [], { emissive: 0.3 });
      for (let s = b0; s < b0 + bw; s++) { const [x, z] = Fs.cell(bd - 1, s); if (s !== b0 + bw - 1 || fs0 < b0) deco.console(x, z, y + up, Fs.away, { width: 0.8 }); }
      void deckCells;
      useL(ctx, Fs, 0, lo - 1, bd + 1, hi - lo + 2);
      booth = true;
      break;
    }
    if (booth) break;
  }
  // fuel cart and fuel line, tool carts and crates
  stock(ctx, rng.int(2, 3), ['crates', 'drum', 'pallet']);
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 8)) {
    if (ctx.used.has(g.idx(x, z))) continue;
    P.tankV(ctx, x + 0.5, z + 0.5, y, 0.4, 2.4, { gauge: true });
    cylH(deco, Math.min(x + 0.5, x + 0.5 - DIR_X[d] * 1.5), Math.max(x + 0.5, x + 0.5 - DIR_X[d] * 1.5), y + 0.12, z + 0.5, 0.06, true, TS.PIPE);
    use(ctx, x, z, 1, 1);
    break;
  }
  railAll(ctx);
  highBay(ctx, 6, COOL);
  return true;
}

// ======================================================================
// crash site
// ======================================================================
// Open ground of the alien world between the two broken halves of the hull:
// rocks and boulders, burning wreckage, hull plates and girders torn off the
// ship, a crater, fuel pools, scorched earth, glowing alien plants.
SS.ss_crash = (ctx) => {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor;
  ctx.used = new Set();
  const cells = ctx.cells;
  // bare rock in a furrow down the middle (the track the hull ploughed)
  const alongZ = r.h >= r.w;
  const L = alongZ ? r.h : r.w, Wd = alongZ ? r.w : r.h;
  const mid = Math.floor(Wd / 2) + rng.int(-1, 1);
  for (const i of cells) {
    const x = i % g.w, z = (i / g.w) | 0;
    const v = alongZ ? x - r.x : z - r.z;
    if (Math.abs(v - mid) <= 1 && !r.reserved.has(i)) g.floorTex[i] = TS.ROCK;
    g.light[i] = Math.max(g.light[i], 0.75);
  }
  // uneven ground: low mounds of ploughed-up earth (0.3 steps) and an impact
  // crater; exit approaches and the ground in front of them stay level
  const near = new Set();
  for (const i of r.reserved) { const x = i % g.w, z = (i / g.w) | 0; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) near.add(g.idx(x + dx, z + dz)); }
  const shape = (cx, cz, R, f) => {
    for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (x < r.x || z < r.z || x >= r.x + r.w || z >= r.z + r.h) continue;
      const i = g.idx(x, z);
      if (near.has(i) || !g.type[i]) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > R) continue;
      const h = f(d);
      if (Math.abs(h) < 0.01) continue;
      g.floor[i] = y + h;
      g.wallTex[i] = TS.ROCK;
    }
  };
  for (let k = 0; k < rng.int(2, 4); k++) {
    const R = rng.float(2.2, 3.6), cx = rng.float(r.x + R, r.x + r.w - R), cz = rng.float(r.z + R, r.z + r.h - R);
    shape(cx, cz, R, (d) => Math.round(Math.min(1.2, (R - d) * 0.45) / 0.3) * 0.3);
  }
  let crater = null;
  {
    const R = rng.float(2.4, 3.2), cx = rng.float(r.x + R + 1, r.x + r.w - R - 1), cz = rng.float(r.z + R + 1, r.z + r.h - R - 1);
    shape(cx, cz, R, (d) => -Math.round(Math.min(0.9, (R - d) * 0.4) / 0.3) * 0.3);
    crater = [cx, cz];
  }
  // fuel pools (poison) and a crater
  const pools = rng.int(1, 3);
  for (let k = 0; k < pools * 6 && k < 40; k++) {
    const w = rng.int(2, 4), h = rng.int(2, 3);
    const x = rng.int(r.x + 1, r.x + r.w - w - 1), z = rng.int(r.z + 1, r.z + r.h - h - 1);
    if (!ok(ctx, x, z, w, h, 1)) continue;
    const pc = [];
    for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) if (!((xx === x || xx === x + w - 1) && (zz === z || zz === z + h - 1))) pc.push(g.idx(xx, zz));
    pitSet(ctx, pc, 'poison', 0.4);
    use(ctx, x - 1, z - 1, w + 2, h + 2);
    if (ctx.used.size > 40 * pools) break;
  }
  // wreckage: hull plates jammed into the ground, bent girders, burning debris
  const n = Math.max(6, Math.floor(r.area / 26));
  let placed = 0;
  for (let k = 0; k < n * 6 && placed < n; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
    if (!ok(ctx, x, z, 2, 2, 0)) continue;
    const roll = rng.next();
    const cx = x + 1, cz = z + 1;
    if (roll < 0.22) {
      // a hull plate stuck in the ground at an angle
      const a = rng.float(0, Math.PI * 2), len = rng.float(1.4, 2.4);
      deco.bar([cx - Math.cos(a) * 0.3, y - 0.2, cz - Math.sin(a) * 0.3], [cx + Math.cos(a) * 0.9, y + len, cz + Math.sin(a) * 0.9], 1.5, 0.12, rng.pick([TS.WALL, TS.METAL, TS.PANEL]));
      deco.collider(cx - 0.7, y, cz - 0.7, cx + 0.7, y + len * 0.8, cz + 0.7);
    } else if (roll < 0.42) P.fire(ctx, cx, cz, y, rng.float(0.8, 1.3));
    else if (roll < 0.62) P.debris(ctx, cx, cz, y, rng.float(0.8, 1.2));
    else if (roll < 0.82) P.boulder(ctx, cx, cz, y, rng.float(0.7, 1.1), rng.float(0.8, 1.8));
    else P.alienPlant(ctx, cx, cz, y, rng.float(0.8, 1.2));
    use(ctx, x, z, 2, 2);
    placed++;
  }
  // the chunk of hull that made the crater, smoking in its bottom
  if (crater) {
    const [cx, cz] = crater;
    const i = g.idx(Math.floor(cx), Math.floor(cz));
    if (g.type[i] && !(g.flags[i] & (F.OBSTACLE | F.PIT | F.HAZARD))) {
      P.debris(ctx, cx, cz, g.floor[i], 1.1);
      P.fire(ctx, cx + 0.4, cz - 0.3, g.floor[i], 0.7, { debris: false, obstacle: false });
    }
  }
  // a torn-off engine nacelle lying on the ground, still burning
  const m = (() => { const out = []; for (let t = 0; t < L; t++) { const row = []; for (let s = 0; s < Wd; s++) { const x = alongZ ? r.x + s : r.x + t, z = alongZ ? r.z + t : r.z + s; row.push(ok(ctx, x, z, 1, 1, 1)); } out.push(row); } return out; })();
  const nr = bestRect(m, { minT: 5, minS: 3, maxT: 6, maxS: 3 });
  if (nr) {
    const x0 = alongZ ? r.x + nr.s : r.x + nr.t, z0 = alongZ ? r.z + nr.t : r.z + nr.s;
    const w = alongZ ? 3 : nr.dt, h = alongZ ? nr.dt : 3;
    const R = 1.2;
    if (alongZ) cylH(deco, z0 + 0.3, z0 + h - 0.3, y + R - 0.25, x0 + 1.5, R, false, TS.METAL, { s: 2 });
    else cylH(deco, x0 + 0.3, x0 + w - 0.3, y + R - 0.25, z0 + 1.5, R, true, TS.METAL, { s: 2 });
    for (let k = 0.8; k < (alongZ ? h : w) - 0.6; k += 1.4) {
      if (alongZ) cylH(deco, z0 + k, z0 + k + 0.2, y + R - 0.25, x0 + 1.5, R + 0.08, false, TS.TRIM);
      else cylH(deco, x0 + k, x0 + k + 0.2, y + R - 0.25, z0 + 1.5, R + 0.08, true, TS.TRIM);
    }
    const ex = alongZ ? x0 + 1.5 : x0 + 0.3, ez = alongZ ? z0 + 0.3 : z0 + 1.5;
    P.fire(ctx, ex, ez, y, 1.1, { debris: false });
    deco.collider(x0 + 0.3, y, z0 + 0.3, x0 + w - 0.3, y + 2 * R - 0.25, z0 + h - 0.3);
    use(ctx, x0, z0, w, h);
  }
  // storm lighting: flickering fires do most of the work, a cold fill
  deco.light(r.x + r.w / 2, y + 8, r.z + r.h / 2, [0.6, 0.7, 0.85], 14);
  r.lit = true;
};
