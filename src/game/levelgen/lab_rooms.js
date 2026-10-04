// Lab / hospital room templates (see lab_templates.js for the helpers and
// props). Registered with the architect generator by gen_lab.js.
import { TS, F, HAZ } from './common.js';
import { FACE } from './deco.js';
import {
  lbox, cellsOf, canUse, use, canUseL, useL, okL, ok, setHeightL, retexFloor, flightL, tryFrames, sideOrder, wallSpots, wallBox,
  lightStrip, hangLight, paint, hazardLines, railAround, deckBridge, pit, upperWindows, edgeCells,
  tank, labBench, fumeHood, cabinet, machineBlock, seatRow, counter, monitor, bed, ivStand, vitalsMonitor, trolley, curtain, glassWall,
  showerGantry, riser, steelTable, rackRow, isHosp, nSteps, faced, COLD, WHITE, GREEN, RED, TEMPLATES, wallConsoles, SKY_H, OPP, DIR_X, DIR_Z,
} from './lab_templates.js';

const LT = {};

// ---------------------------------------------------------------- helpers
// longest run of s positions [a, b) where test(s) holds
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
// a raised gallery along the t=0 wall of a frame: in-line flights at one or both
// ends (wall-hugging stairs with hand rails) and a railed deck. Returns
// {cells, s0, s1, y, flights:[...]} or null.
function buildGallery(ctx, Fr, gD, y, o = {}) {
  const { room: r } = ctx;
  const n = nSteps(y - r.floor);
  const minDeck = o.minDeck ?? 4;
  const run = longestRun(Fr.Wd, (s) => canUseL(ctx, Fr, 0, s, gD, 1) && okL(ctx, Fr, 0, s, gD, 1), n + minDeck);
  if (!run) return null;
  let [a, b] = run;
  // keep the deck clear of the side walls' exit reservations by a cell
  const two = o.twoFlights !== false && b - a >= 2 * n + minDeck + 2;
  // the ground row in front of each flight's foot must stay free
  if (!canUseL(ctx, Fr, 0, a - 1 < 0 ? a : a - 1, 2, 1)) a++;
  const f1 = [a, a + n];
  const f2 = two ? [b - n, b] : null;
  const d0 = f1[1], d1 = two ? f2[0] : b;
  if (d1 - d0 < minDeck) return null;
  const cells = setHeightL(ctx, Fr, 0, d0, gD, d1 - d0, y, { floorTex: o.floorTex ?? TS.GRATE, wallTex: o.sideTex ?? TS.SIDE });
  flightL(ctx, Fr, 0, f1[0], Math.min(2, gD), n, 'lat', r.floor, y);
  if (f2) flightL(ctx, Fr, 0, f2[0], Math.min(2, gD), n, 'latN', r.floor, y);
  useL(ctx, Fr, 0, a, gD + 1, b - a);
  ctx.deco.railEdges(new Set(cells), { style: o.railStyle ?? ctx.style.railStyle });
  return { cells, s0: d0, s1: d1, y, flights: f2 ? [f1, f2] : [f1], a, b };
}
// light panels on a grid over the room's flat, roofed cells
function panelGrid(ctx, step = 4, color = WHITE, radius = 6.5) {
  const { g, deco, room: r } = ctx;
  for (let z = r.z + 1; z < r.z + r.h - 1; z += step) for (let x = r.x + 1; x < r.x + r.w - 1; x += step) {
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i]) continue;
    deco.lightPanel(x + 0.1, z + 0.3, x + 0.9, z + 0.7, g.ceil[i], color, radius);
  }
  r.lit = true;
}
function pick(ctx, list) { return ctx.rng.pick(list); }

// ======================================================================
// CORE: the multi-storey heart of the complex
//  bio lab: containment well (deep poison sump) under a giant specimen tank on
//    an island, bridges with glass rails, observation gallery one storey up,
//    upper-storey windows, risers, ceiling beams and pipework
//  hospital: skylit atrium over a collapsed floor into the flooded basement,
//    plank bridge, mezzanine gallery, benches, planters, kiosks
// ======================================================================
LT.lab_core = function labCore(ctx) {
  const okb = tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildCore(ctx, Fr), null);
  if (!okb) { TEMPLATES.atrium(ctx); ctx.room.lit = false; }
};
function buildCore(ctx, Fr) {
  const { g, deco, rng, room: r, style } = ctx;
  const hosp = isHosp(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 14 || Wd < 16) return false;
  const top = r.floor + r.ceilH;
  const yG = r.floor + 4.2;
  // ---- gallery along the t=0 wall (if a long enough stretch is free of exits)
  const gD = L >= 20 ? 3 : 2;
  let gal = null;
  if (r.ceilH >= 9) gal = buildGallery(ctx, Fr, gD, yG, { floorTex: hosp ? TS.FLOOR2 : TS.GRATE, minDeck: 5 });
  // ---- the well: the biggest centred rect that keeps a ring walkway free of exits
  let well = null;
  const t0min = gal ? gD + 3 : 3;
  for (const ms of [4, 5, 3, 6]) {
    for (const mt1 of [4, 5, 3, 6]) {
      for (const mt0 of [t0min + 1, t0min, t0min + 2]) {
        const wl = L - mt0 - mt1, ww = Wd - 2 * ms;
        if (wl < 5 || ww < 7) continue;
        if (!canUseL(ctx, Fr, mt0, ms, wl, ww, 1) || !okL(ctx, Fr, mt0, ms, wl, ww)) continue;
        well = { t0: mt0, s0: ms, wl, ww };
        break;
      }
      if (well) break;
    }
    if (well) break;
  }
  if (!well) return false;
  const { t0, s0, wl, ww } = well;
  const kind = hosp ? 'water' : 'poison';
  const pitCells = pit(ctx, ...Fr.rect(t0, s0, wl, ww), kind, hosp ? 3.5 : 6);
  useL(ctx, Fr, t0 - 1, s0 - 1, wl + 2, ww + 2);
  const walk = new Set();
  // ---- island + bridges (bio), plank bridges (hospital)
  let island = null;
  if (!hosp) {
    const isz = wl >= 10 && ww >= 12 ? 4 : wl >= 7 && ww >= 9 ? 3 : 0;
    if (isz) {
      const it = t0 + Math.floor((wl - isz) / 2), is = s0 + Math.floor((ww - isz) / 2);
      island = { t: it, s: is, n: isz };
      for (const i of cellsOf(g, ...Fr.rect(it, is, isz, isz))) {
        const x = i % g.w, z = (i / g.w) | 0;
        g.open(x, z, r.floor, g.ceil[i], { floorTex: TS.FLOOR3, wallTex: TS.PITWALL, light: g.light[i], region: r.id });
        g.flags[i] &= ~(F.PIT | F.HAZARD); g.hazType[i] = 0; g.flags[i] |= F.NOSPAWN;
        walk.add(i);
      }
      const bw = 2, bs = is + Math.floor((isz - bw) / 2), bt = it + Math.floor((isz - bw) / 2);
      // lateral bridges (along s) from both ring sides to the island
      for (const i of deckBridge(ctx, ...Fr.rect(bt, s0, bw, is - s0), r.floor)) walk.add(i);
      for (const i of deckBridge(ctx, ...Fr.rect(bt, is + isz, bw, s0 + ww - is - isz), r.floor)) walk.add(i);
      // a bridge toward the far wall (along t)
      for (const i of deckBridge(ctx, ...Fr.rect(it + isz, bs, t0 + wl - it - isz, bw), r.floor)) walk.add(i);
    } else {
      const bt = t0 + Math.floor((wl - 2) / 2);
      for (const i of deckBridge(ctx, ...Fr.rect(bt, s0, 2, ww), r.floor)) walk.add(i);
    }
  } else {
    // collapsed floor: ragged edge (some rim cells collapsed too), one plank bridge
    const bt = t0 + rng.int(1, Math.max(1, wl - 3));
    for (const i of deckBridge(ctx, ...Fr.rect(bt, s0, 2, ww), r.floor, { floorTex: TS.WOOD, wallTex: TS.WOOD })) walk.add(i);
    if (ww >= 12 && wl >= 7) {
      const bs = s0 + rng.int(2, ww - 4);
      for (const i of deckBridge(ctx, ...Fr.rect(t0, bs, wl, 2), r.floor, { floorTex: TS.GRATE, wallTex: TS.GRATE })) walk.add(i);
    }
  }
  const pitNow = pitCells.filter((i) => g.flags[i] & F.PIT);
  railAround(ctx, pitNow, { style: style.railStyle });
  hazardLines(ctx, pitNow);
  // ---- ring floor
  const ringCells = ctx.cells.filter((i) => g.type[i] && Math.abs(g.floor[i] - r.floor) < 0.01 && !(g.flags[i] & (F.PIT | F.STAIR | F.BRIDGE)) && !walk.has(i));
  retexFloor(ctx, ringCells, hosp ? TS.FLOOR3 : TS.FLOOR3);
  // ---- signature object
  const [wx0, wz0, wW, wH] = Fr.rect(t0, s0, wl, ww);
  if (!hosp && island) {
    const [ix, iz, iw] = Fr.rect(island.t, island.s, island.n, island.n);
    const cx = ix + iw / 2, cz = iz + iw / 2;
    const R = island.n >= 4 ? 0.9 : 0.6;
    tank(ctx, cx, cz, r.floor, top - 1.2, { r: R, ceil: top, lightR: 9 });
    // collar + feed pipes fanning to the walls under the ceiling
    deco.box(cx - R - 0.4, top - 1.2, cz - R - 0.4, cx + R + 0.4, top, cz + R + 0.4, TS.METAL);
    const py = top - 0.8;
    deco.pipe(r.x, cz - 0.6, cx - R - 0.4, cz - 0.6, py, 0.3);
    deco.pipe(cx + R + 0.4, cz + 0.6, r.x + r.w, cz + 0.6, py, 0.3);
    // control lecterns on the island ring
    for (const [lx, lz] of [[ix + 0.5, iz + 0.5], [ix + iw - 0.5, iz + iw - 0.5]]) {
      deco.box(lx - 0.2, r.floor, lz - 0.2, lx + 0.2, r.floor + 1.0, lz + 0.2, { side: TS.METAL, top: TS.SCREEN }, { uv: 'fit' });
    }
    deco.light(cx, r.floor - 3, cz, GREEN, 10, { pulse: true });
  } else if (hosp) {
    // the skylight over the collapsed floor: glass roof frame
    for (const i of cellsOf(g, wx0, wz0, wW, wH)) { g.sky[i] = 1; g.ceil[i] = SKY_H; g.light[i] = Math.max(g.light[i], 0.9); g.flags[i] |= F.OUTDOOR; }
    for (let k = 0; k <= wW; k += 2) deco.box(wx0 + k - 0.06, top, wz0, wx0 + k + 0.06, top + 0.2, wz0 + wH, TS.BEAM);
    for (let k = 0; k <= wH; k += 2) deco.box(wx0, top, wz0 + k - 0.06, wx0 + wW, top + 0.2, wz0 + k + 0.06, TS.BEAM);
    // fallen slabs and a broken beam down in the water
    for (let k = 0; k < 3; k++) {
      const sx = wx0 + rng.float(0.5, wW - 2), sz = wz0 + rng.float(0.5, wH - 2);
      deco.box(sx, r.floor - 3.5, sz, sx + rng.float(0.8, 1.6), r.floor - 3.5 + rng.float(0.6, 1.4), sz + rng.float(0.8, 1.6), TS.SIDE);
    }
  }
  // well walls: pipes running down, light strips at the rim
  for (let k = 1; k < wW; k += 4) deco.box(wx0 + k, r.floor - (hosp ? 3.5 : 6), wz0 + 0.02, wx0 + k + 0.2, r.floor - 0.1, wz0 + 0.22, TS.PIPE);
  for (let k = 1; k < wW; k += 4) deco.box(wx0 + k, r.floor - (hosp ? 3.5 : 6), wz0 + wH - 0.22, wx0 + k + 0.2, r.floor - 0.1, wz0 + wH - 0.02, TS.PIPE);
  // ---- gallery furnishing: consoles facing the well, office windows behind
  if (gal) {
    for (let s = gal.s0 + 1; s < gal.s1 - 1; s += 3) {
      const [x, z] = Fr.cell(0, s);
      if (gD >= 3) deco.console(x, z, yG, Fr.away);
    }
    for (let s = gal.s0; s < gal.s1; s++) {
      const [x, z] = Fr.cell(0, s);
      if (s % 2 === 0 && yG + 2.7 < top - 0.5) deco.window(x, z, Fr.toward, yG + 1.0, yG + 2.6, { emissive: 0.55 });
    }
    // light strip under the gallery edge (on its face)
    const [ax, az] = Fr.pt(gD, gal.s0), [bx, bz] = Fr.pt(gD + 0.06, gal.s1);
    deco.box(Math.min(ax, bx), yG - 0.25, Math.min(az, bz), Math.max(ax, bx), yG - 0.15, Math.max(az, bz), TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  // ---- upper storeys: rows of lit windows on the other walls
  const galSide = Fr.toward;
  upperWindows(ctx, r.floor + 5.2, r.floor + 6.8, 2, (x, z, d) => d !== galSide || !gal);
  if (r.ceilH >= 12) upperWindows(ctx, r.floor + 9.0, r.floor + 10.6, 2);
  // ---- risers in the corners, machinery / cabinets along the ring walls
  for (const [x, z] of [[r.x, r.z], [r.x + r.w - 1, r.z], [r.x, r.z + r.h - 1], [r.x + r.w - 1, r.z + r.h - 1]]) {
    if (!ok(ctx, x, z, 1, 1)) continue;
    riser(ctx, x + 0.5, z + 0.5, r.floor, top, 0.3);
    use(ctx, x, z, 1, 1);
  }
  let placed = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (placed >= Math.floor((r.w + r.h) / 4)) break;
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (hosp) {
      const roll = rng.next();
      if (roll < 0.35) machineBlock(ctx, x, z, d, r.floor, 1.9, 0.75);                // vending machine
      else if (roll < 0.65) { ctx.deco.planter(x + 0.1, z + 0.1, r.floor, 0.8, 0.8); }
      else cabinet(ctx, x, z, d, r.floor, 1.4, 0.5);
    } else if (rng.chance(0.55)) machineBlock(ctx, x, z, d, r.floor, rng.pick([1.6, 2.2]), 0.8);
    else cabinet(ctx, x, z, d, r.floor, 2.0, 0.6);
    use(ctx, x, z, 1, 1);
    placed++;
  }
  // benches facing the well (hospital waiting area) / containment pods (bio) on wide ring corners
  for (const [tc, sc] of [[1, 1], [1, Wd - 3], [L - 3, 1], [L - 3, Wd - 3]]) {
    if (!okL(ctx, Fr, tc, sc, 2, 2, 0, 1)) continue;
    const [x0, z0] = Fr.rect(tc, sc, 2, 2);
    if (hosp) seatRow(ctx, x0, z0 + 0.5, 2, true, r.floor, 2);
    else { tank(ctx, x0 + 1, z0 + 1, r.floor, r.floor + 2.6, { r: 0.35, broken: rng.chance(0.3) }); }
    useL(ctx, Fr, tc, sc, 2, 2);
  }
  // ---- ceiling: beams across the room, hanging lights over the ring
  for (let s = 2; s < Wd - 1; s += 4) {
    const [ax, az] = Fr.pt(0, s + 0.5), [bx, bz] = Fr.pt(L, s + 0.5);
    deco.beam(ax, az, bx, bz, top - 0.7, 0.35, 0.6);
  }
  for (let t = 2; t < L - 1; t += 5) for (let s = 2; s < Wd - 1; s += 5) {
    const [x, z] = Fr.cell(t, s);
    const i = g.idx(x, z);
    if (g.sky[i]) continue;
    hangLight(ctx, x + 0.5, z + 0.5, g.ceil[i], Math.min(3.5, r.ceilH - 5), hosp ? [1, 0.92, 0.75] : WHITE, 9);
  }
  // wall lights along the ring
  for (const [x, z, d] of edgeCells(ctx)) {
    if (((d < 2 ? z : x) % 4) !== 1) continue;
    const i = g.idx(x, z);
    if (g.flags[i] & (F.STAIR | F.PIT)) continue;
    deco.wallLight(x, z, d, g.floor[i] + 2.4, hosp ? [1, 0.85, 0.6] : [0.85, 0.95, 1], { radius: 5, flicker: hosp && rng.chance(0.3) });
  }
  r.lit = true;
  return true;
}

// ======================================================================
// LOBBY: reception counter with monitors in front of a display wall, waiting
// seats, planters, a security arch (lab) / vending machines (hospital)
// ======================================================================
LT.lab_lobby = function labLobby(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildLobby(ctx, Fr), (c) => TEMPLATES.entry(c));
};
function buildLobby(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const hosp = isHosp(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 8 || Wd < 9) return false;
  // reception counter: t in [2,3), s centred, with the staff side against the wall
  let desk = null;
  for (const dw of [Math.min(8, Wd - 4), 6, 5, 4]) {
    if (dw < 4) continue;
    for (const ds of [Math.floor((Wd - dw) / 2), 2, Wd - dw - 2]) {
      if (ds < 1 || ds + dw > Wd - 1) continue;
      if (okL(ctx, Fr, 0, ds - 1, 4, dw + 2)) { desk = { s0: ds, w: dw }; break; }
    }
    if (desk) break;
  }
  if (!desk) return false;
  const { s0, w } = desk;
  const [cx0, cz0] = Fr.pt(2.1, s0), [cx1, cz1] = Fr.pt(2.9, s0 + w);
  counter(ctx, Math.min(cx0, cx1), Math.min(cz0, cz1), Math.max(cx0, cx1), Math.max(cz0, cz1), r.floor, Fr.away, { front: TS.PANEL, side: TS.METAL, top: hosp ? TS.WOOD : TS.METAL, h: 1.1 });
  // return wings at both ends
  for (const ss of [s0, s0 + w - 1]) {
    const [ax, az] = Fr.pt(1.0, ss + 0.1), [bx, bz] = Fr.pt(2.1, ss + 0.9);
    counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r.floor, ss === s0 ? Fr.latN : Fr.lat, { front: TS.PANEL, side: TS.METAL, top: hosp ? TS.WOOD : TS.METAL, h: 1.1 });
  }
  for (let s = s0 + 1; s < s0 + w - 1; s += 2) { const [mx, mz] = Fr.pt(2.5, s + 0.5); monitor(ctx, mx, mz, r.floor + 1.1, Fr.toward); }
  // display wall / logo behind the desk
  lbox(deco, Fr, 0, 0.06, s0 + 0.5, s0 + w - 0.5, r.floor + 1.6, r.floor + Math.min(r.ceilH - 0.6, 3.4), TS.SCREEN, { uv: 'fit', emissive: 0.8 });
  lbox(deco, Fr, 0, 0.1, s0 + 0.3, s0 + w - 0.3, r.floor + 1.45, r.floor + 1.6, TS.TRIM);
  useL(ctx, Fr, 0, s0 - 1, 4, w + 2);
  // waiting seats: rows facing the desk
  let rows = 0;
  for (let t = 5; t <= L - 3 && rows < 3; t += 2) {
    for (const [a, b] of [[1, Math.floor(Wd / 2) - 1], [Math.floor(Wd / 2) + 1, Wd - 1]]) {
      const len = b - a;
      if (len < 2) continue;
      if (!okL(ctx, Fr, t, a, 1, len, 0, 1)) continue;
      const [x0, z0, ww, hh] = Fr.rect(t, a, 1, len);
      const alongX = ww > hh;
      seatRow(ctx, x0 + (alongX ? 0 : 0.2), z0 + (alongX ? 0.2 : 0), alongX ? ww : hh, alongX, r.floor, Fr.toward);
      useL(ctx, Fr, t, a, 1, len);
      rows++;
    }
  }
  // planters in free corners, vending machines / cabinets on the walls
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (k >= 5) break;
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k < 2) deco.planter(x + 0.1, z + 0.1, r.floor, 0.8, 0.8);
    else if (hosp) machineBlock(ctx, x, z, d, r.floor, 1.9, 0.75);
    else cabinet(ctx, x, z, d, r.floor, 1.9, 0.5);
    use(ctx, x, z, 1, 1);
    k++;
  }
  // security scanner arch over a free 2-wide lane (lab)
  if (!hosp) {
    for (let t = 4; t < L - 2; t++) {
      const sA = Math.floor(Wd / 2) - 1;
      if (!okL(ctx, Fr, t, sA - 1, 1, 4, 0, 0)) continue;
      const [px0, pz0] = Fr.pt(t + 0.4, sA - 0.2), [px1, pz1] = Fr.pt(t + 0.6, sA);
      const [qx0, qz0] = Fr.pt(t + 0.4, sA + 2), [qx1, qz1] = Fr.pt(t + 0.6, sA + 2.2);
      deco.box(Math.min(px0, px1), r.floor, Math.min(pz0, pz1), Math.max(px0, px1), r.floor + 2.3, Math.max(pz0, pz1), faced(Fr.lat, TS.MACHINE, TS.METAL), { solid: true, uv: 'fit' });
      deco.box(Math.min(qx0, qx1), r.floor, Math.min(qz0, qz1), Math.max(qx0, qx1), r.floor + 2.3, Math.max(qz0, qz1), faced(Fr.latN, TS.MACHINE, TS.METAL), { solid: true, uv: 'fit' });
      lbox(deco, Fr, t + 0.35, t + 0.65, sA - 0.2, sA + 2.2, r.floor + 2.3, r.floor + 2.55, TS.METAL);
      lbox(deco, Fr, t + 0.38, t + 0.62, sA, sA + 2, r.floor + 2.25, r.floor + 2.3, TS.LIGHT, { uv: 'fit', emissive: 1 });
      useL(ctx, Fr, t, sA - 1, 1, 4);
      break;
    }
  } else {
    // abandoned wheelchair / trolley near the desk
    for (let t = 4; t < L - 1; t++) {
      const s = rng.int(1, Wd - 2);
      if (!okL(ctx, Fr, t, s, 1, 1, 0, 1)) continue;
      const [x, z] = Fr.pt(t + 0.5, s + 0.5);
      trolley(ctx, x, z, r.floor, rng.chance(0.5));
      useL(ctx, Fr, t, s, 1, 1);
      break;
    }
  }
  retexFloor(ctx, cellsOf(g, ...Fr.rect(3, 1, Math.max(1, L - 4), Wd - 2)), TS.FLOOR3);
  panelGrid(ctx, 4, hosp ? [1, 0.95, 0.85] : WHITE);
  return true;
}

// ======================================================================
// DECON: decontamination chamber: shower gantries with UV strips over floor
// drains, hazard lines, lockers and benches along the walls, puddles
// ======================================================================
LT.decon = function decon(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildDecon(ctx, Fr), (c) => TEMPLATES.entry(c));
};
function buildDecon(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 9 || Wd < 7) return false;
  const h = Math.min(2.8, r.ceilH - 0.5);
  let n = 0;
  for (let t = 2; t < L - 2; t += 3) {
    // gantry posts sit against the side walls: those cells must be free
    if (!canUseL(ctx, Fr, t, 0, 1, 1) || !canUseL(ctx, Fr, t, Wd - 1, 1, 1)) continue;
    const [ax, az] = Fr.pt(t + 0.5, 0.05), [bx, bz] = Fr.pt(t + 0.5, Wd - 0.05);
    showerGantry(ctx, ax, az, bx, bz, r.floor, h);
    // drain grating + hazard lines across the lane
    for (let s = 1; s < Wd - 1; s++) { const [x, z] = Fr.cell(t, s); const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & (F.STAIR | F.PIT))) g.floorTex[i] = TS.GRATE; }
    for (const tt of [t - 0.15, t + 1.02]) { const [p0x, p0z] = Fr.pt(tt, 0.2), [p1x, p1z] = Fr.pt(tt + 0.13, Wd - 0.2); paint(ctx, Math.min(p0x, p1x), Math.min(p0z, p1z), Math.max(p0x, p1x), Math.max(p0z, p1z), r.floor); }
    n++;
  }
  if (n < 2) return false;
  // lockers + benches on wall cells between gantries
  for (const [x, z, d] of wallSpots(ctx)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0) || rng.chance(0.25)) continue;
    // keep gantry rows clear
    const [tx] = toFrame(Fr, x, z);
    if ((tx - 2) % 3 === 0) continue;
    cabinet(ctx, x, z, d, r.floor, 2.0, 0.5);
    use(ctx, x, z, 1, 1);
  }
  // decon runoff puddles
  for (let k = 0; k < 2; k++) {
    const t = rng.int(2, L - 4), s = rng.int(2, Wd - 4);
    if (okL(ctx, Fr, t, s, 2, 2, 1, 0)) { pit(ctx, ...Fr.rect(t, s, 2, 2), 'water', 0.3); useL(ctx, Fr, t, s, 2, 2); }
  }
  panelGrid(ctx, 4, [0.85, 0.92, 1]);
  return true;
}
// world cell -> frame (t, s)
function toFrame(Fr, x, z) {
  const R = Fr.R;
  if (Fr.side === 3) return [z - R.z, x - R.x];
  if (Fr.side === 2) return [R.z + R.h - 1 - z, x - R.x];
  if (Fr.side === 1) return [x - R.x, z - R.z];
  return [R.x + R.w - 1 - x, z - R.z];
}

// ======================================================================
// WET LAB: island benches with reagent shelves, sinks and instruments in rows,
// fume hoods along a wall, shelving, a chemical spill (poison puddle) and a
// safety shower
// ======================================================================
LT.wetlab = function wetlab(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildWetlab(ctx, Fr), (c) => TEMPLATES.control(c));
};
function buildWetlab(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 7 || Wd < 8) return false;
  // fume hoods on the t=0 wall
  let hoods = 0;
  for (let s = 1; s < Wd - 1; s++) {
    if (!okL(ctx, Fr, 0, s, 1, 1, 0, 0) || !canUseL(ctx, Fr, 1, s, 1, 1)) continue;
    if (hoods && s % 2 === 0) continue;
    const [x, z] = Fr.cell(0, s);
    fumeHood(ctx, x, z, Fr.toward, r.floor);
    useL(ctx, Fr, 0, s, 1, 1);
    hoods++;
  }
  // island benches: rows along s every 3 rows of t, 2-wide aisles around them
  let benches = 0;
  const spill = rng.chance(0.65);
  for (let t = 3; t < L - 2; t += 3) {
    for (let a = 2; a < Wd - 3;) {
      let len = Math.min(5, Wd - 2 - a);
      while (len >= 2 && !okL(ctx, Fr, t, a, 1, len, 1, 1)) len--;
      if (len < 2) { a++; continue; }
      const [x0, z0, w, h] = Fr.rect(t, a, 1, len);
      const alongX = w > h;
      labBench(ctx, alongX ? x0 : x0 + 0.1, alongX ? z0 + 0.1 : z0, alongX ? x0 + w : x0 + w - 0.1, alongX ? z0 + h - 0.1 : z0 + h, r.floor);
      useL(ctx, Fr, t, a, 1, len);
      benches++;
      a += len + 2;
    }
  }
  if (!benches && !hoods) return false;
  // shelving with glassware along the side walls
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 8)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (rng.chance(0.5)) {
      wallBox(ctx, x, z, d, 0.45, r.floor, r.floor + 2.1, TS.METAL, { solid: true, faces: FACE.SIDES | FACE.TOP });
      for (const sy of [0.6, 1.1, 1.6]) for (let k = 0; k < 3; k++) {
        if (!rng.chance(0.7)) continue;
        const u = 0.2 + k * 0.28;
        const bx = d < 2 ? x + 0.5 + DIR_X[d] * 0.28 : x + u, bz = d >= 2 ? z + 0.5 + DIR_Z[d] * 0.28 : z + u;
        deco.box(bx - 0.06, r.floor + sy, bz - 0.06, bx + 0.06, r.floor + sy + rng.float(0.15, 0.3), bz + 0.06, k === 1 ? TS.CRATE : TS.GLASS, { uv: 'fit', emissive: k === 1 ? 0 : 0.3 });
      }
    } else cabinet(ctx, x, z, d, r.floor, 2.0, 0.55);
    use(ctx, x, z, 1, 1);
  }
  // chemical spill in an aisle: a shallow poison puddle and a toppled bottle rack
  if (spill) {
    for (let k = 0; k < 12; k++) {
      const t = rng.int(1, L - 3), s = rng.int(1, Wd - 3);
      if (!okL(ctx, Fr, t, s, 2, 2, 0, 0)) continue;
      pit(ctx, ...Fr.rect(t, s, 2, 2), 'poison', 0.3);
      useL(ctx, Fr, t, s, 2, 2);
      const [bx, bz] = Fr.pt(t + 0.3, s + 2.05);
      deco.box(bx - 0.3, r.floor, bz - 0.15, bx + 0.6, r.floor + 0.3, bz + 0.15, TS.METAL);
      break;
    }
  }
  // safety shower + eyewash by a wall
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    const cx = x + 0.5 + DIR_X[d] * 0.3, cz = z + 0.5 + DIR_Z[d] * 0.3;
    deco.box(cx - 0.04, r.floor, cz - 0.04, cx + 0.04, r.floor + 2.4, cz + 0.04, TS.PIPE, { faces: FACE.SIDES });
    deco.box(cx - 0.25, r.floor + 2.3, cz - 0.25, cx + 0.25, r.floor + 2.4, cz + 0.25, TS.METAL);
    deco.box(cx - 0.18, r.floor + 2.55, cz - 0.18, cx + 0.18, r.floor + 2.75, cz + 0.18, TS.LIGHT, { uv: 'fit', emissive: 1 });
    deco.light(cx, r.floor + 2.4, cz, GREEN, 3);
    use(ctx, x, z, 1, 1);
    break;
  }
  panelGrid(ctx, 3, WHITE, 5.5);
  return true;
}

// ======================================================================
// CLEAN ROOM: a glass-walled clean room (open-topped) in the middle with an
// equipment layout inside and an air-shower entry, overlooked by an
// observation gallery one level up (in-line flights, glass balustrade, consoles)
// ======================================================================
LT.cleanroom = function cleanroom(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildCleanroom(ctx, Fr), (c) => TEMPLATES.control(c));
};
function buildCleanroom(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 11 || Wd < 11) return false;
  const yG = r.floor + 3.6;
  const gD = 3;
  const gal = r.ceilH >= 7 ? buildGallery(ctx, Fr, gD, yG, { minDeck: 4, twoFlights: Wd >= 22 }) : null;
  // the clean room box: in front of the gallery walkway, walkway ring of 2 around it
  const tA = gal ? gD + 2 : 3, sA = 2;
  let box = null;
  for (let tB = L - 2; tB - tA >= 5; tB--) {
    for (let sB = Wd - 2; sB - sA >= 5; sB--) {
      const off = Math.floor((Wd - 2 - sB) / 2);
      if (okL(ctx, Fr, tA, sA + off, tB - tA, sB - sA, 1, 1)) { box = { t0: tA, s0: sA + off, t1: tB, s1: sB + off }; break; }
    }
    if (box) break;
  }
  if (!box) return false;
  const { t0, s0, t1, s1 } = box;
  const [bx0, bz0, bw, bh] = Fr.rect(t0, s0, t1 - t0, s1 - s0);
  const inner = cellsOf(g, bx0, bz0, bw, bh);
  retexFloor(ctx, inner, TS.FLOOR3);
  // glass walls around the box with a 2-wide entry on the side facing the gallery (or s side)
  const entryS = s0 + Math.floor((s1 - s0) / 2) - 1;
  const hW = Math.min(3.0, r.ceilH - 1.2);
  const P = (t, s) => Fr.pt(t, s);
  const line = (ta, sa, tb, sb) => { const [ax, az] = P(ta, sa), [bx, bz] = P(tb, sb); glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), r.floor, hW); };
  line(t0, s0, t0, entryS); line(t0, entryS + 2, t0, s1);   // front with the entry
  line(t1, s0, t1, s1);
  line(t0, s0, t1, s0); line(t0, s1, t1, s1);
  // entry frame: air-shower header with a light strip
  lbox(deco, Fr, t0 - 0.08, t0 + 0.08, entryS, entryS + 2, r.floor + 2.4, r.floor + hW, TS.METAL);
  lbox(deco, Fr, t0 - 0.1, t0 + 0.1, entryS + 0.1, entryS + 1.9, r.floor + 2.32, r.floor + 2.4, TS.LIGHT, { uv: 'fit', emissive: 1 });
  useL(ctx, Fr, t0 - 1, s0 - 1, t1 - t0 + 2, s1 - s0 + 2);
  // inside: equipment along the back and side walls, a central workstation
  ctx.used.delete(-1);
  const innerFree = (t, s) => t > t0 && t < t1 - 1 && s > s0 && s < s1 - 1;
  for (let s = s0; s < s1; s++) {
    const [x, z] = Fr.cell(t1 - 1, s);
    if ((s - s0) % 2 === 0) machineBlock(ctx, x, z, Fr.away, r.floor, rng.pick([1.4, 1.8, 2.1]), 0.7);
  }
  for (let t = t0 + 1; t < t1 - 1; t += 2) {
    for (const [s, d] of [[s0, Fr.latN], [s1 - 1, Fr.lat]]) {
      const [x, z] = Fr.cell(t, s);
      if (rng.chance(0.7)) cabinet(ctx, x, z, d, r.floor, 1.2, 0.6);
    }
  }
  if (t1 - t0 >= 6 && s1 - s0 >= 6) {
    const tc = t0 + Math.floor((t1 - t0) / 2) - 1, sc = s0 + Math.floor((s1 - s0) / 2) - 1;
    if (innerFree(tc, sc)) {
      const [x0, z0, w, h] = Fr.rect(tc + 0.15, sc + 0.1, 0.9, 2.8);
      labBench(ctx, x0, z0, x0 + w, z0 + h, r.floor, { sink: false });
    }
  }
  // overhead filter units over the clean room (light panels at its own height)
  for (let t = t0 + 1; t < t1 - 1; t += 2) for (let s = s0 + 1; s < s1 - 1; s += 3) {
    const [x, z] = Fr.cell(t, s);
    deco.lightPanel(x + 0.15, z + 0.15, x + 0.85, z + 0.85, r.floor + r.ceilH, [0.9, 0.97, 1], 5.5);
  }
  // gallery: consoles at the back facing the clean room
  if (gal) {
    for (let s = gal.s0 + 1; s < gal.s1 - 1; s += 2) { const [x, z] = Fr.cell(0, s); deco.console(x, z, yG, Fr.away); }
    for (let s = gal.s0; s < gal.s1; s += 2) { const [x, z] = Fr.cell(0, s); if (yG + 2.6 < r.floor + r.ceilH - 0.4) deco.window(x, z, Fr.toward, yG + 1.0, yG + 2.4, { emissive: 0.5 }); }
  }
  // outer ring: cabinets on free wall cells
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 6)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    cabinet(ctx, x, z, d, r.floor, 2.0, 0.5);
    use(ctx, x, z, 1, 1);
  }
  panelGrid(ctx, 4, WHITE, 6);
  return true;
}

// ======================================================================
// SPECIMEN HALL: rows of glowing specimen tanks along both walls (some
// shattered with their fluid spilled), a sunken bio-hazard pit in the middle
// with a grate bridge, hazard lines and glass rails
// ======================================================================
LT.specimen = function specimen(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildSpecimen(ctx, Fr), (c) => TEMPLATES.pitroom(c));
};
function buildSpecimen(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;     // t runs along the hall (long axis)
  if (L < 10 || Wd < 9) return false;
  const top = r.floor + r.ceilH;
  const hosp = isHosp(ctx);
  // central pit (bio-hazard sump)
  let pitRect = null;
  for (const ms of [4, 3]) {
    const pw = Wd - 2 * ms;
    if (pw < 3) continue;
    for (const mt of [3, 4, 2]) {
      const pl = L - 2 * mt;
      if (pl < 4) continue;
      if (okL(ctx, Fr, mt, ms, pl, pw, 1, 1)) { pitRect = { t: mt, s: ms, l: pl, w: pw }; break; }
    }
    if (pitRect) break;
  }
  let pc = [];
  if (pitRect) {
    const kind = hosp ? rng.pick(['water', 'poison']) : 'poison';
    pc = pit(ctx, ...Fr.rect(pitRect.t, pitRect.s, pitRect.l, pitRect.w), kind, 3.5);
    useL(ctx, Fr, pitRect.t - 1, pitRect.s - 1, pitRect.l + 2, pitRect.w + 2);
    // grate bridge across the middle of the pit (along s) + one along t
    const bt = pitRect.t + Math.floor(pitRect.l / 2) - 1;
    const br = deckBridge(ctx, ...Fr.rect(bt, pitRect.s, 2, pitRect.w), r.floor);
    const rest = pc.filter((i) => !br.includes(i));
    railAround(ctx, rest, { style: ctx.style.railStyle });
    hazardLines(ctx, rest);
    // drums / pipes descending into the sump
    const [px, pz, pw, ph] = Fr.rect(pitRect.t, pitRect.s, pitRect.l, pitRect.w);
    for (let k = 0; k < 2; k++) { const dx = px + rng.float(0.3, pw - 1), dz = pz + rng.float(0.3, ph - 1); deco.box(dx, r.floor - 3.5, dz, dx + 0.6, r.floor - 2.7, dz + 0.6, TS.CRATE2, { uv: 'fit' }); }
  }
  // tank rows along both walls (s = 0 and s = Wd - 1), every 2 cells
  let tanks = 0;
  for (let t = 1; t < L - 1; t += 2) {
    for (const s of [0, Wd - 1]) {
      if (!okL(ctx, Fr, t, s, 1, 1, 0, 0)) continue;
      const [x, z] = Fr.pt(t + 0.5, s + 0.5);
      const broken = rng.chance(0.22);
      tank(ctx, x, z, r.floor, Math.min(top - 0.6, r.floor + 3.4), { r: 0.36, fluid: hosp ? TS.WATER : TS.POISON, broken, ceil: top });
      useL(ctx, Fr, t, s, 1, 1);
      tanks++;
      if (broken) {
        // spilled fluid in front of the shattered tank
        const sIn = s === 0 ? 1 : Wd - 2;
        if (okL(ctx, Fr, t, sIn, 1, 1, 0, 0)) { pit(ctx, ...Fr.rect(t, sIn, 1, 1), hosp ? 'water' : 'poison', 0.3); useL(ctx, Fr, t, sIn, 1, 1); }
      }
    }
  }
  if (tanks < 4 && !pitRect) return false;
  // overhead feed manifold along both tank rows
  for (const s of [0.5, Wd - 0.5]) {
    const [ax, az] = Fr.pt(0, s), [bx, bz] = Fr.pt(L, s);
    deco.pipe(ax, az, bx, bz, top - 0.3, 0.26);
  }
  // light strips down the hall
  for (let t = 1; t < L - 1; t += 4) {
    const [ax, az] = Fr.pt(t, Wd / 2 - 0.15), [bx, bz] = Fr.pt(t + 2, Wd / 2 + 0.15);
    lightStrip(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), top, hosp ? WHITE : [0.75, 1, 0.8], 7);
  }
  // a monitoring desk at a free end
  for (const t of [0, L - 1]) {
    const s = Math.floor(Wd / 2) - 1;
    if (!okL(ctx, Fr, t, s, 1, 2, 0, 0)) continue;
    const [x, z] = Fr.cell(t, s), [x2, z2] = Fr.cell(t, s + 1);
    const d = t === 0 ? Fr.away : Fr.toward;
    deco.console(x, z, r.floor, d); deco.console(x2, z2, r.floor, d);
    useL(ctx, Fr, t, s, 1, 2);
    break;
  }
  r.lit = true;
  void pc;
  return true;
}

// ======================================================================
// COLD STORAGE: freezer cabinets on the walls, sample racks in rows,
// liquid-nitrogen dewars, frosty blue light
// ======================================================================
LT.coldstore = function coldstore(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  // freezers on the walls (in runs)
  for (const [x, z, d] of wallSpots(ctx)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0) || rng.chance(0.2)) continue;
    cabinet(ctx, x, z, d, r.floor, rng.pick([1.9, 2.0]), 0.75);
    // frost on top
    wallBox(ctx, x, z, d, 0.75, r.floor + 2.0, r.floor + 2.06, TS.GLASS, { inset: 0.06, emissive: 0.2 });
    use(ctx, x, z, 1, 1);
  }
  // sample racks in rows with 2-wide aisles
  const alongX = r.w >= r.h;
  const Lr = alongX ? r.w : r.h, Wr = alongX ? r.h : r.w;
  for (let s = 3; s < Wr - 3; s += 3) {
    for (let t = 3; t + 3 <= Lr - 3; t += 5) {
      const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
      const w = alongX ? 3 : 1, h = alongX ? 1 : 3;
      if (!ok(ctx, x, z, w, h, 1, 1)) continue;
      deco.shelf(x + (alongX ? 0.05 : 0.15), z + (alongX ? 0.15 : 0.05), x + w - (alongX ? 0.05 : 0.15), z + h - (alongX ? 0.15 : 0.05), r.floor, 2.0);
      for (let k = 0; k < 6; k++) {
        const u = rng.float(0.2, 2.6), sy = rng.pick([0.5, 1.0, 1.5]);
        const bx = alongX ? x + u : x + 0.5, bz = alongX ? z + 0.5 : z + u;
        deco.box(bx - 0.15, r.floor + sy, bz - 0.15, bx + 0.15, r.floor + sy + 0.22, bz + 0.15, TS.CRATE, { uv: 'fit' });
      }
      use(ctx, x, z, w, h);
    }
  }
  // dewar clusters
  for (let k = 0; k < 3; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    if (!ok(ctx, x, z, 1, 1, 0, 1)) continue;
    for (const [ox, oz] of [[0.3, 0.3], [0.7, 0.35], [0.45, 0.72]]) {
      deco.box(x + ox - 0.15, r.floor, z + oz - 0.15, x + ox + 0.15, r.floor + 0.85, z + oz + 0.15, TS.METAL);
      deco.box(x + ox - 0.06, r.floor + 0.85, z + oz - 0.06, x + ox + 0.06, r.floor + 0.97, z + oz + 0.06, TS.METAL);
    }
    deco.collider(x + 0.1, r.floor, z + 0.1, x + 0.9, r.floor + 0.97, z + 0.9);
    use(ctx, x, z, 1, 1);
  }
  // cold light
  for (let z = r.z + 1; z < r.z + r.h - 1; z += 3) for (let x = r.x + 1; x < r.x + r.w - 1; x += 4) {
    const i = g.idx(x, z);
    if (!g.type[i]) continue;
    deco.lightPanel(x + 0.1, z + 0.35, x + 0.9, z + 0.65, g.ceil[i], COLD, 5.5);
  }
  r.lit = true;
};

// ======================================================================
// SERVER ROOM: perforated raised floor, rack rows with cold aisles, cable
// trays overhead, cooling units on a wall, status screens
// ======================================================================
LT.servers = function servers(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildServers(ctx, Fr), (c) => TEMPLATES.control(c));
};
function buildServers(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 8 || Wd < 7) return false;
  retexFloor(ctx, ctx.cells, TS.GRATE);
  const top = r.floor + r.ceilH;
  let rows = 0;
  for (let t = 2; t < L - 2; t += 3) {
    let a = 2;
    while (a < Wd - 3) {
      let len = Math.min(6, Wd - 2 - a);
      while (len >= 2 && !okL(ctx, Fr, t, a, 1, len, 1, 1)) len--;
      if (len < 2) { a++; continue; }
      const [x0, z0, w, h] = Fr.rect(t, a, 1, len);
      const alongX = w > h;
      rackRow(ctx, alongX ? x0 : x0 + 0.1, alongX ? z0 + 0.1 : z0, alongX ? x0 + w : x0 + w - 0.1, alongX ? z0 + h - 0.1 : z0 + h, r.floor, Math.min(2.3, r.ceilH - 1.2));
      // cable tray over the row
      const [ax, az] = Fr.pt(t + 0.5, a), [bx, bz] = Fr.pt(t + 0.5, a + len);
      deco.pipe(ax, az, bx, bz, top - 0.35, 0.18, TS.BEAM);
      // status screen at the row end
      const [ex, ez] = Fr.pt(t + 0.5, a - 0.02);
      deco.box(ex - 0.25, r.floor + 1.3, ez - 0.25, ex + 0.25, r.floor + 1.8, ez + 0.25, { side: TS.SCREEN, top: TS.METAL, bottom: TS.METAL }, { uv: 'fit' });
      useL(ctx, Fr, t, a, 1, len);
      rows++;
      a += len + 2;
    }
  }
  if (rows < 1) return false;
  // cooling units against the t = 0 wall
  for (let s = 1; s < Wd - 1; s += 2) {
    if (!okL(ctx, Fr, 0, s, 1, 1, 0, 0)) continue;
    const [x, z] = Fr.cell(0, s);
    machineBlock(ctx, x, z, Fr.toward, r.floor, Math.min(2.4, r.ceilH - 0.8), 0.85);
    useL(ctx, Fr, 0, s, 1, 1);
  }
  // blue aisle lighting
  for (let t = 1; t < L - 1; t += 3) {
    const [ax, az] = Fr.pt(t + 0.4, 1), [bx, bz] = Fr.pt(t + 0.6, Wd - 1);
    lightStrip(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), top, [0.55, 0.75, 1], 6);
  }
  r.lit = true;
  return true;
}

// ======================================================================
// FLOODED PUMP ROOM / BASEMENT: a deep flooded sump crossed by grate
// catwalks, shallow standing water on the floor, pumps and big pipes
// ======================================================================
LT.flooded = function flooded(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  const ring = 2;
  const x0 = r.x + ring, z0 = r.z + ring, w = r.w - 2 * ring, h = r.h - 2 * ring;
  if (w < 5 || h < 5 || !ok(ctx, x0, z0, w, h, 1, 1)) {
    // too small / exits in the way: shallow flooding with pumps only
    for (let k = 0; k < 4; k++) {
      const pw = rng.int(2, 4), ph = rng.int(2, 4);
      const px = rng.int(r.x + 1, r.x + r.w - pw - 1), pz = rng.int(r.z + 1, r.z + r.h - ph - 1);
      if (ok(ctx, px, pz, pw, ph, 1, 1)) { pit(ctx, px, pz, pw, ph, 'water', 0.3); use(ctx, px, pz, pw, ph); }
    }
  } else {
    const pc = pit(ctx, x0, z0, w, h, 'water', 2.5);
    use(ctx, x0 - 1, z0 - 1, w + 2, h + 2);
    const walk = new Set(ctx.cells.filter((i) => g.type[i] && !(g.flags[i] & F.PIT)));
    const sp = rng.pick([3, 4]);
    const alongX = w >= h;
    if (alongX) for (let z = z0 + 1; z < z0 + h - 1; z += sp) for (const i of deckBridge(ctx, x0, z, w, 1, r.floor)) walk.add(i);
    else for (let x = x0 + 1; x < x0 + w - 1; x += sp) for (const i of deckBridge(ctx, x, z0, 1, h, r.floor)) walk.add(i);
    const mid = alongX ? x0 + Math.floor(w / 2) : z0 + Math.floor(h / 2);
    for (const i of (alongX ? deckBridge(ctx, mid, z0, 1, h, r.floor) : deckBridge(ctx, x0, mid, w, 1, r.floor))) walk.add(i);
    deco.railEdges(walk, { style: 'metal' });
    // pump intakes standing in the water
    for (let k = 0; k < 3; k++) {
      const px = x0 + rng.float(0.5, w - 1.5), pz = z0 + rng.float(0.5, h - 1.5);
      const i = g.idx(Math.floor(px + 0.3), Math.floor(pz + 0.3));
      if (!(g.flags[i] & F.PIT)) continue;
      deco.box(px, r.floor - 2.5, pz, px + 0.6, r.floor - 0.6, pz + 0.6, TS.PIPE);
    }
    void pc;
  }
  // pumps / control cabinets on the walls, a pipe run at mid height
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 6)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    machineBlock(ctx, x, z, d, r.floor, rng.pick([1.2, 1.6]), 0.8);
    use(ctx, x, z, 1, 1);
  }
  const top = r.floor + r.ceilH;
  for (const z of [r.z + 0.25, r.z + r.h - 0.25]) deco.pipe(r.x, z, r.x + r.w, z, top - 0.9, 0.34);
  for (const x of [r.x + 0.25, r.x + r.w - 0.25]) deco.pipe(x, r.z, x, r.z + r.h, top - 1.5, 0.26);
  r.lit = false;
};

// ======================================================================
// WARD (hospital): bed rows along both long walls with privacy curtains,
// bedside cabinets, IV stands and monitors, a nurse station, puddles
// ======================================================================
LT.ward = function ward(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildWard(ctx, Fr), (c) => TEMPLATES.entry(c));
};
function buildWard(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;    // t along the ward, beds against the s = 0 / s = Wd - 1 walls
  if (L < 8 || Wd < 7) return false;
  let beds = 0;
  for (let t = 1; t < L - 1; t += 2) {
    for (const side of [0, 1]) {
      const sHead = side ? Wd - 1 : 0, sFoot = side ? Wd - 2 : 1;
      const sMin = Math.min(sHead, sFoot);
      if (!okL(ctx, Fr, t, sMin, 1, 2, 0, 0)) continue;
      const [hx, hz] = Fr.cell(t, sHead);
      const d = side ? Fr.lat : Fr.latN;    // dir to the head wall
      bed(ctx, hx, hz, d, r.floor, { shift: rng.float(-0.06, 0.06) });
      useL(ctx, Fr, t, sMin, 1, 2);
      beds++;
      // curtain between this bed and the next (in the gap row t + 1)
      if (t + 1 < L - 1 && canUseL(ctx, Fr, t + 1, sMin, 1, 2)) {
        const [ax, az] = Fr.pt(t + 1.5, side ? Wd - 2.2 : 0.05), [bx, bz] = Fr.pt(t + 1.5, side ? Wd - 0.05 : 2.2);
        curtain(ctx, ax, az, bx, bz, r.floor, rng.float(0.3, 0.95));
        // bedside cabinet / IV stand by the head
        const [cx, cz] = Fr.pt(t + 1.5, side ? Wd - 0.5 : 0.5);
        if (rng.chance(0.55)) deco.box(cx - 0.22, r.floor, cz - 0.22, cx + 0.22, r.floor + 0.75, cz + 0.22, faced(Fr.away, TS.CRATE2, TS.METAL), { solid: true, uv: 'fit' });
        else ivStand(ctx, cx, cz, r.floor);
      }
      if (rng.chance(0.3)) { const [mx, mz] = Fr.pt(t + 0.5, side ? Wd - 2.5 : 2.5); if (okL(ctx, Fr, t, side ? Wd - 3 : 2, 1, 1, 0, 0)) vitalsMonitor(ctx, mx, mz, r.floor, side ? Fr.lat : Fr.latN); }
    }
  }
  if (beds < 3) return false;
  // nurse station at one end of the aisle
  for (const t of [0, L - 1]) {
    const s0 = Math.floor(Wd / 2) - 1;
    const tt = t === 0 ? 0 : L - 2;
    if (!okL(ctx, Fr, tt, s0, 2, 2, 0, 0)) continue;
    const [ax, az] = Fr.pt(tt + 0.2, s0 + 0.1), [bx, bz] = Fr.pt(tt + 0.9, s0 + 1.9);
    counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r.floor, t === 0 ? Fr.away : Fr.toward, { front: TS.PANEL, h: 1.05 });
    const [mx, mz] = Fr.pt(tt + 0.55, s0 + 1);
    monitor(ctx, mx, mz, r.floor + 1.05, t === 0 ? Fr.toward : Fr.away);
    useL(ctx, Fr, tt, s0, 2, 2);
    break;
  }
  // leaking roof: puddles in the aisle
  for (let k = 0; k < 2; k++) {
    const t = rng.int(1, L - 3), s = rng.int(2, Wd - 4);
    if (okL(ctx, Fr, t, s, 2, 2, 0, 0) && rng.chance(0.7)) { pit(ctx, ...Fr.rect(t, s, 2, 2), 'water', 0.25); useL(ctx, Fr, t, s, 2, 2); }
  }
  // flickering fluorescent tubes down the aisle
  const top = r.floor + r.ceilH;
  for (let t = 1; t < L - 1; t += 3) {
    const [ax, az] = Fr.pt(t, Wd / 2 - 0.2), [bx, bz] = Fr.pt(t + 1.4, Wd / 2 + 0.2);
    ctx.deco.box(Math.min(ax, bx), top - 0.06, Math.min(az, bz), Math.max(ax, bx), top, Math.max(az, bz), TS.LIGHT, { uv: 'fit', emissive: 1 });
    ctx.deco.light((ax + bx) / 2, top - 0.5, (az + bz) / 2, [0.9, 0.95, 1], 6, { flicker: rng.chance(0.4) });
  }
  r.lit = true;
  return true;
}

// ======================================================================
// OPERATING THEATRE (hospital): operating table under a surgical lamp,
// anaesthesia machine, monitors, trolleys, scrub sinks and cabinets, and a
// viewing gallery one level up with a glass balustrade and benches
// ======================================================================
LT.theatre = function theatre(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildTheatre(ctx, Fr), (c) => TEMPLATES.control(c));
};
function buildTheatre(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 10 || Wd < 10) return false;
  const top = r.floor + r.ceilH;
  const yG = r.floor + 3.0;
  const gal = r.ceilH >= 6.5 ? buildGallery(ctx, Fr, 3, yG, { floorTex: TS.FLOOR2, minDeck: 4, twoFlights: Wd >= 20, railStyle: 'glass' }) : null;
  if (gal) {
    for (let s = gal.s0; s < gal.s1 - 1; s += 3) {
      const [ax, az] = Fr.pt(0.15, s + 0.1), [bx, bz] = Fr.pt(0.75, s + 2.6);
      // spectator bench against the back wall
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
      deco.box(x0, yG + 0.42, z0, x1, yG + 0.5, z1, TS.WOOD);
      deco.box(x0 + 0.1, yG, z0 + 0.1, x1 - 0.1, yG + 0.42, z1 - 0.1, TS.METAL, { faces: FACE.SIDES });
      deco.collider(x0, yG, z0, x1, yG + 0.5, z1);
    }
  }
  // the operating table in the middle of the floor area
  const tA = gal ? 4 : 1;
  const tc = tA + Math.floor((L - tA) / 2) - 1, sc = Math.floor(Wd / 2) - 1;
  if (!okL(ctx, Fr, tc - 1, sc - 1, 4, 4, 0, 0)) return false;
  const area = cellsOf(g, ...Fr.rect(tc - 1, sc - 1, 4, 4));
  retexFloor(ctx, area, TS.FLOOR3);
  const [ox0, oz0] = Fr.pt(tc + 0.3, sc + 0.1), [ox1, oz1] = Fr.pt(tc + 0.9, sc + 1.9);
  steelTable(ctx, Math.min(ox0, ox1), Math.min(oz0, oz1), Math.max(ox0, ox1), Math.max(oz0, oz1), r.floor, { top: TS.CARPET, lip: false });
  // surgical lamp: ceiling mount, arm, three lamp heads
  const [lx, lz] = Fr.pt(tc + 0.6, sc + 1);
  deco.box(lx - 0.05, top - 1.6, lz - 0.05, lx + 0.05, top, lz + 0.05, TS.METAL, { faces: FACE.SIDES });
  for (const [ox, oz] of [[-0.45, -0.3], [0.45, -0.25], [0, 0.45]]) {
    deco.box(lx + ox - 0.28, top - 1.75, lz + oz - 0.28, lx + ox + 0.28, top - 1.6, lz + oz + 0.28, TS.METAL);
    deco.box(lx + ox - 0.22, top - 1.79, lz + oz - 0.22, lx + ox + 0.22, top - 1.75, lz + oz + 0.22, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  deco.box(lx - 0.5, top - 1.64, lz - 0.04, lx + 0.5, top - 1.6, lz + 0.04, TS.METAL);
  deco.light(lx, r.floor + 1.6, lz, [1, 1, 0.95], 7);
  // anaesthesia machine at the head, monitor and trolleys at the sides
  const [hx, hz] = Fr.cell(tc - 1, sc + 1);
  machineBlock(ctx, hx, hz, Fr.toward, r.floor, 1.6, 0.6);
  const [vx, vz] = Fr.pt(tc + 0.5, sc - 0.5);
  vitalsMonitor(ctx, vx, vz, r.floor, Fr.lat);
  const [tx, tz] = Fr.pt(tc + 0.5, sc + 2.5);
  trolley(ctx, tx, tz, r.floor, Fr.lat < 2);
  useL(ctx, Fr, tc - 1, sc - 1, 4, 4);
  // scrub sinks and cabinets along the walls
  let sinks = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (sinks < 2) {
      wallBox(ctx, x, z, d, 0.6, r.floor, r.floor + 0.9, faced(OPP[d], TS.METAL, TS.METAL), { solid: true });
      wallBox(ctx, x, z, d, 0.5, r.floor + 0.9, r.floor + 0.92, TS.WATER, { inset: 0.12, faces: FACE.TOP });
      wallBox(ctx, x, z, d, 0.06, r.floor + 0.92, r.floor + 1.9, TS.METAL, { inset: 0.05 });
      sinks++;
    } else if (rng.chance(0.6)) cabinet(ctx, x, z, d, r.floor, 2.0, 0.5);
    use(ctx, x, z, 1, 1);
  }
  panelGrid(ctx, 4, WHITE, 6);
  return true;
}

// ======================================================================
// MORGUE (hospital): walls of cold-chamber drawers, autopsy tables with
// hanging lamps, a sink, floor drains, cold light
// ======================================================================
LT.morgue = function morgue(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  for (const [x, z, d] of wallSpots(ctx)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0) || rng.chance(0.15)) continue;
    cabinet(ctx, x, z, d, r.floor, 2.2, 0.85);
    use(ctx, x, z, 1, 1);
  }
  const alongX = r.w >= r.h;
  let n = 0;
  for (let t = 3; t < (alongX ? r.w : r.h) - 3; t += 3) {
    for (const s of [Math.floor((alongX ? r.h : r.w) / 2) - 1]) {
      const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
      const w = alongX ? 1 : 2, h = alongX ? 2 : 1;
      if (!ok(ctx, x, z, w, h, 1, 1)) continue;
      steelTable(ctx, x + (alongX ? 0.2 : 0.1), z + (alongX ? 0.1 : 0.2), x + w - (alongX ? 0.2 : 0.1), z + h - (alongX ? 0.1 : 0.2), r.floor);
      // a sheeted body on some tables
      if (rng.chance(0.5)) deco.box(x + (alongX ? 0.3 : 0.25), r.floor + 0.96, z + (alongX ? 0.25 : 0.3), x + w - (alongX ? 0.3 : 0.25), r.floor + 1.18, z + h - (alongX ? 0.25 : 0.3), TS.CARPET);
      hangLight(ctx, x + w / 2, z + h / 2, r.floor + r.ceilH, 1.1, COLD, 5);
      // drain under the table
      const di = g.idx(x, z);
      if (g.type[di]) g.floorTex[di] = TS.GRATE;
      use(ctx, x, z, w, h);
      n++;
    }
  }
  if (!n) TEMPLATES.plain(ctx);
  r.lit = true;
  for (let z = r.z + 1; z < r.z + r.h - 1; z += 4) for (let x = r.x + 2; x < r.x + r.w - 1; x += 5) {
    const i = g.idx(x, z);
    if (!g.type[i]) continue;
    deco.lightPanel(x + 0.1, z + 0.35, x + 0.9, z + 0.65, g.ceil[i], COLD, 4.5);
  }
};

// ======================================================================
// SUPPLY: medical / lab supply store: shelving rows with boxes, cabinets
// ======================================================================
LT.supply = function supply(ctx) {
  const { deco, rng, room: r } = ctx;
  ctx.used = new Set();
  const alongX = r.w >= r.h;
  const Lr = alongX ? r.w : r.h, Wr = alongX ? r.h : r.w;
  for (let s = 2; s < Wr - 2; s += 3) {
    for (let t = 2; t + 4 <= Lr - 2; t += 6) {
      const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
      const w = alongX ? 4 : 1, h = alongX ? 1 : 4;
      if (!ok(ctx, x, z, w, h, 1, 1)) continue;
      deco.shelf(x + 0.05, z + 0.12, x + w - 0.05, z + h - 0.12, r.floor, 2.2);
      for (let k = 0; k < 7; k++) {
        const u = rng.float(0.2, 3.5), sy = rng.pick([0, 0.55, 1.1, 1.65]);
        const bx = alongX ? x + u : x + 0.5, bz = alongX ? z + 0.5 : z + u;
        deco.box(bx - 0.2, r.floor + sy, bz - 0.2, bx + 0.2, r.floor + sy + 0.3, bz + 0.2, rng.chance(0.7) ? TS.CRATE : TS.CRATE2, { uv: 'fit' });
      }
      use(ctx, x, z, w, h);
    }
  }
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 8)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    cabinet(ctx, x, z, d, r.floor, 2.0, 0.55);
    use(ctx, x, z, 1, 1);
  }
  for (let k = 0; k < 3; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    if (ok(ctx, x, z, 1, 1, 0, 1)) { deco.crateStack(x + 0.5, z + 0.5, r.floor, { count: rng.int(1, 3) }); use(ctx, x, z, 1, 1); }
  }
};

// ======================================================================
// ARENA: containment breach chamber (boss room): a ruptured central
// containment vessel in a spill of fluid, raised observation platforms with
// stairs and glass rails in two corners, contaminated pools in the others,
// heavy machinery as cover, red warning lights
// ======================================================================
LT.lab_arena = function labArena(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  const hosp = isHosp(ctx);
  const top = r.floor + r.ceilH;
  const cx = Math.floor(r.x + r.w / 2), cz = Math.floor(r.z + r.h / 2);
  const fluid = hosp ? 'water' : 'poison';
  // ruptured vessel: a ring of broken steel frame around a shallow spill, leaving the centre walkable
  if (ok(ctx, cx - 3, cz - 3, 6, 6, 0, 0)) {
    const spill = [];
    for (const i of cellsOf(g, cx - 3, cz - 3, 6, 6)) {
      const x = i % g.w, z = (i / g.w) | 0;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > 1.6 && d < 3.1) spill.push([x, z]);
    }
    for (const [x, z] of spill) pit(ctx, x, z, 1, 1, fluid, 0.3);
    // broken vessel staves (tall steel ribs at uneven heights)
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const px = cx + Math.cos(ang) * 1.4, pz = cz + Math.sin(ang) * 1.4;
      const hgt = rng.chance(0.4) ? rng.float(3.5, Math.min(7, r.ceilH - 1)) : rng.float(0.6, 2.2);
      deco.box(px - 0.1, r.floor, pz - 0.1, px + 0.1, r.floor + hgt, pz + 0.1, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
    }
    deco.box(cx - 1.6, r.floor, cz - 1.6, cx + 1.6, r.floor + 0.3, cz + 1.6, { side: TS.MACHINE, top: TS.GRATE }, { uv: 'fit' });
    // the vessel's torn-off cap hanging from the ceiling gantry
    deco.box(cx - 1.7, top - 1.4, cz - 1.7, cx + 1.7, top - 0.9, cz + 1.7, TS.METAL);
    for (const [ox, oz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) deco.box(cx + ox - 0.05, top - 0.9, cz + oz - 0.05, cx + ox + 0.05, top, cz + oz + 0.05, TS.METAL, { faces: FACE.SIDES });
    deco.light(cx, r.floor + 1, cz, hosp ? [0.5, 0.7, 1] : GREEN, 9, { pulse: true });
    use(ctx, cx - 3, cz - 3, 6, 6);
  }
  // corners: raised observation platforms with stairs, contaminated pools
  const corners = rng.shuffle([[r.x + 1, r.z + 1], [r.x + r.w - 5, r.z + 1], [r.x + 1, r.z + r.h - 5], [r.x + r.w - 5, r.z + r.h - 5]]);
  let plats = 0, pools = 0;
  for (const [x, z] of corners) {
    if (!ok(ctx, x, z, 4, 4, 0, 1)) continue;
    if (plats < 2) {
      const toCenterX = x + 2 < r.x + r.w / 2;
      const fx = toCenterX ? x + 4 : x - 3;
      if (!ok(ctx, fx, z + 1, 3, 2, 0, 0)) continue;
      const set = new Set();
      for (const i of cellsOf(g, x, z, 4, 4)) { g.floor[i] = r.floor + 1.8; g.wallTex[i] = TS.SIDE; g.floorTex[i] = TS.GRATE; set.add(i); }
      deco.stairs(toCenterX ? x + 6 : x - 3, z + 1, toCenterX ? 1 : 0, 2, r.floor, r.floor + 1.8, { rise: 0.6, light: r.light, region: r.id, style: ctx.style.railStyle });
      deco.railEdges(set, { style: ctx.style.railStyle });
      // control desk on the platform
      const dx = toCenterX ? x : x + 3, dz = z + (z < cz ? 0 : 3);
      deco.console(dx, dz, r.floor + 1.8, toCenterX ? 0 : 1);
      use(ctx, Math.min(x, fx), z, 7, 4);
      plats++;
    } else if (pools < 2) {
      const pc = pit(ctx, x, z, 4, 4, fluid, 0.4);
      hazardLines(ctx, pc);
      use(ctx, x, z, 4, 4);
      pools++;
    }
  }
  // cover: heavy machinery blocks / intact tanks
  let cover = 0;
  for (let k = 0; k < 40 && cover < 6; k++) {
    const x = rng.int(r.x + 2, r.x + r.w - 4), z = rng.int(r.z + 2, r.z + r.h - 4);
    if (!ok(ctx, x, z, 2, 2, 1, 1)) continue;
    if (!hosp && rng.chance(0.5)) tank(ctx, x + 1, z + 1, r.floor, r.floor + 3.4, { r: 0.6, ceil: top, broken: rng.chance(0.3) });
    else {
      deco.box(x + 0.15, r.floor, z + 0.15, x + 1.85, r.floor + rng.pick([1.6, 2.2, 2.8]), z + 1.85, { side: TS.MACHINE, top: TS.METAL, bottom: TS.METAL }, { solid: true, uv: 'fit' });
    }
    use(ctx, x, z, 2, 2);
    cover++;
  }
  // red warning beacons on the walls, hanging work lights
  for (const [x, z, d] of edgeCells(ctx)) {
    if (((d < 2 ? z : x) % 5) !== 2) continue;
    deco.wallLight(x, z, d, r.floor + 3.0, RED, { radius: 6, flicker: rng.chance(0.5) });
  }
  for (let z = r.z + 3; z < r.z + r.h - 2; z += 6) for (let x = r.x + 3; x < r.x + r.w - 2; x += 6) hangLight(ctx, x + 0.5, z + 0.5, top, 2.2, WHITE, 9);
  for (const i of ctx.cells) {
    const x = i % g.w, z = (i / g.w) | 0;
    if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < 4.5 && g.type[i] && !(g.flags[i] & (F.PIT | F.HAZARD | F.STAIR | F.WATER))) g.floorTex[i] = TS.FLOOR3;
  }
  r.lit = true;
};

void HAZ; void lightStrip; void glassWall; void curtain;
export { LT };
