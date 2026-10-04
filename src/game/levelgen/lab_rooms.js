// Lab / hospital room templates (see lab_templates.js for the helpers and
// props). Registered with the architect generator by gen_lab.js.
import { TS, F, HAZ } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import {
  lbox, cellsOf, canUse, use, canUseL, useL, okL, ok, setHeightL, retexFloor, flightL, tryFrames, sideOrder, wallSpots, wallBox,
  lightStrip, hangLight, paint, hazardLines, railAround, deckBridge, pit, upperWindows, edgeCells, pitSet, openShape, largestBlob,
  tank, labBench, fumeHood, cabinet, machineBlock, seatRow, counter, monitor, bed, ivStand, vitalsMonitor, trolley, curtain, glassWall,
  showerGantry, riser, steelTable, rackRow, isHosp, nSteps, faced, COLD, WHITE, GREEN, RED, TEMPLATES, wallConsoles, SKY_H, OPP, DIR_X, DIR_Z,
  freeMask, bestRect, markMask, glassLineL, doorLeafL, openShelf, flatOpen, lcollider, lineOpening,
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
  if (L < 13 || Wd < 13) return false;
  const top = r.floor + r.ceilH;
  const yG = r.floor + 4.2;
  // ---- gallery along the t=0 wall (if a long enough stretch is free of exits)
  const gD = L >= 20 ? 3 : 2;
  let gal = null;
  if (r.ceilH >= 9) gal = buildGallery(ctx, Fr, gD, yG, { floorTex: hosp ? TS.FLOOR2 : TS.GRATE, minDeck: 5 });
  // ---- the well: the inner floor (a 3-cell walkway ring stays round the
  // walls) minus a margin round the exit approaches and stair landings, which
  // become railed peninsulas reaching into it; slivers are trimmed off
  const tA = gal ? gD + 3 : 3, tB = L - 3, sA = 3, sB = Wd - 3;
  const cand = new Set();
  for (let t = tA; t < tB; t++) for (let s = sA; s < sB; s++) {
    if (!okL(ctx, Fr, t, s, 1, 1, 1, 1)) continue;
    const [x, z] = Fr.cell(t, s);
    cand.add(g.idx(x, z));
  }
  const well = largestBlob(g, openShape(g, cand));
  if (well.size < 30) return false;
  const kind = hosp ? 'water' : 'poison';
  const depth = hosp ? 3.5 : 6;
  pitSet(ctx, well, kind, depth);
  for (const i of well) ctx.used.add(i);
  const inWell = (t, s) => { const [x, z] = Fr.cell(t, s); return well.has(g.idx(x, z)); };
  const walk = new Set();
  // well extent in frame coordinates
  let t0 = 1e9, t1 = -1e9, s0 = 1e9, s1 = -1e9;
  for (let t = tA; t < tB; t++) for (let s = sA; s < sB; s++) if (inWell(t, s)) { t0 = Math.min(t0, t); t1 = Math.max(t1, t + 1); s0 = Math.min(s0, s); s1 = Math.max(s1, s + 1); }
  const allIn = (t, s, dt, ds) => { for (let a = t; a < t + dt; a++) for (let b = s; b < s + ds; b++) if (!inWell(a, b)) return false; return true; };
  const floorAt = (t, s) => { const [x, z] = Fr.cell(t, s); const i = g.idx(x, z); return g.type[i] && !(g.flags[i] & (F.PIT | F.STAIR | F.HAZARD)) && Math.abs(g.floor[i] - r.floor) < 0.01; };
  // a 2-wide deck from (t, s) stepping by (dt, ds) across the pit until both
  // band cells reach walkable floor; returns the cells or null
  const span = (t, s, dt, ds, o) => {
    const band = dt ? [[0, 0], [0, 1]] : [[0, 0], [1, 0]];
    const cells = [];
    for (let k = 0; k < 40; k++) {
      const a = t + dt * k, b = s + ds * k;
      const pitHere = band.every(([u, v]) => inWell(a + u, b + v));
      if (pitHere) { for (const [u, v] of band) cells.push([a + u, b + v]); continue; }
      if (!cells.length) return null;
      return band.every(([u, v]) => floorAt(a + u, b + v)) ? cells : null;
    }
    return null;
  };
  const lay = (cells, o = {}) => {
    for (const [a, b] of cells) {
      const [x, z] = Fr.cell(a, b);
      for (const i of deckBridge(ctx, x, z, 1, 1, r.floor, o)) walk.add(i);
    }
  };
  // ---- island + bridges (bio), plank / grate bridges over the collapse (hospital)
  let island = null;
  if (!hosp) {
    const ct = Math.floor((t0 + t1) / 2), cs = Math.floor((s0 + s1) / 2);
    for (const n of [4, 3]) {
      let best = null;
      for (let t = t0 + 2; t + n + 2 <= t1; t++) for (let s = s0 + 2; s + n + 2 <= s1; s++) {
        if (!allIn(t - 2, s - 2, n + 4, n + 4)) continue;
        const d = Math.abs(t + n / 2 - ct) + Math.abs(s + n / 2 - cs);
        if (!best || d < best.d) best = { t, s, d };
      }
      if (best) { island = { t: best.t, s: best.s, n }; break; }
    }
  }
  let bridges = 0;
  if (island) {
    const { t: it, s: is, n } = island;
    // the island's own floor
    for (const i of cellsOf(g, ...Fr.rect(it, is, n, n))) {
      const x = i % g.w, z = (i / g.w) | 0;
      g.open(x, z, r.floor, g.ceil[i], { floorTex: TS.FLOOR3, wallTex: TS.PITWALL, light: g.light[i], region: r.id });
      g.flags[i] &= ~(F.PIT | F.HAZARD); g.hazType[i] = 0; g.flags[i] |= F.NOSPAWN;
      walk.add(i);
    }
    const bt = it + Math.floor((n - 2) / 2), bs = is + Math.floor((n - 2) / 2);
    const opts = [span(bt, is - 1, 0, -1), span(bt, is + n, 0, 1), span(it - 1, bs, -1, 0), span(it + n, bs, 1, 0)].filter(Boolean);
    rng.shuffle(opts);
    for (const c of opts.slice(0, opts.length >= 3 && rng.chance(0.6) ? 3 : 2)) { lay(c); bridges++; }
    if (!bridges) return false;
  } else {
    // a cross of 2-wide catwalks through the middle (planks and grates over the collapse)
    const mt = Math.floor((t0 + t1) / 2) - 1, ms = Math.floor((s0 + s1) / 2) - 1;
    const tries = [];
    for (let k = 0; k <= 3; k++) for (const sg of [1, -1]) {
      tries.push(['s', mt + k * sg]); tries.push(['t', ms + k * sg]);
    }
    const done = { s: false, t: false };
    for (const [ax, p] of tries) {
      if (done[ax]) continue;
      // find the pit run along this line, start one before it
      let c = null;
      if (ax === 's') { for (let s = sA - 1; s < sB && !c; s++) if (inWell(p, s + 1) && inWell(p + 1, s + 1) && !(inWell(p, s) && inWell(p + 1, s))) c = span(p, s + 1, 0, 1); }
      else for (let t = tA - 1; t < tB && !c; t++) if (inWell(t + 1, p) && inWell(t + 1, p + 1) && !(inWell(t, p) && inWell(t, p + 1))) c = span(t + 1, p, 1, 0);
      if (!c) continue;
      lay(c, hosp && ax === 's' ? { floorTex: TS.WOOD, wallTex: TS.WOOD } : {});
      done[ax] = true; bridges++;
    }
  }
  const pitNow = [...well].filter((i) => g.flags[i] & (F.PIT | F.HAZARD));
  railAround(ctx, pitNow, { style: style.railStyle });
  hazardLines(ctx, pitNow);
  // ---- ring floor
  const ringCells = ctx.cells.filter((i) => g.type[i] && Math.abs(g.floor[i] - r.floor) < 0.01 && !(g.flags[i] & (F.PIT | F.STAIR | F.BRIDGE)) && !walk.has(i));
  retexFloor(ctx, ringCells, TS.FLOOR3);
  // ---- signature object
  const [wx0, wz0, wW, wH] = Fr.rect(t0, s0, t1 - t0, s1 - s0);
  const wcx = wx0 + wW / 2, wcz = wz0 + wH / 2;
  if (!hosp) {
    let cx = wcx, cz = wcz, R = 0.9;
    if (island) {
      const [ix, iz, iw] = Fr.rect(island.t, island.s, island.n, island.n);
      cx = ix + iw / 2; cz = iz + iw / 2; R = island.n >= 4 ? 0.9 : 0.6;
      tank(ctx, cx, cz, r.floor, top - 1.2, { r: R, ceil: top, lightR: 9 });
      // control lecterns on the island corners
      for (const [lx, lz] of [[ix + 0.5, iz + 0.5], [ix + iw - 0.5, iz + iw - 0.5]]) deco.box(lx - 0.2, r.floor, lz - 0.2, lx + 0.2, r.floor + 1.0, lz + 0.2, { side: TS.METAL, top: TS.SCREEN }, { uv: 'fit' });
    } else {
      // the containment vessel hangs from the ceiling over the well
      tank(ctx, cx, cz, r.floor + 1.6, top - 1.2, { r: R, ceil: top, lightR: 9, hang: true });
      for (const [ox, oz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) deco.box(cx + ox - 0.05, top - 1.2, cz + oz - 0.05, cx + ox + 0.05, top, cz + oz + 0.05, TS.METAL, { faces: FACE.SIDES });
    }
    // collar + feed pipes fanning out to the walls under the ceiling
    deco.box(cx - R - 0.4, top - 1.2, cz - R - 0.4, cx + R + 0.4, top, cz + R + 0.4, TS.METAL);
    const py = top - 0.8;
    deco.pipe(r.x, cz - 0.6, cx - R - 0.4, cz - 0.6, py, 0.3);
    deco.pipe(cx + R + 0.4, cz + 0.6, r.x + r.w, cz + 0.6, py, 0.3);
    deco.light(cx, r.floor - 3, cz, GREEN, 10, { pulse: true });
  } else {
    // the skylight over the collapsed floor: glass roof frame
    for (const i of cellsOf(g, wx0, wz0, wW, wH)) { g.sky[i] = 1; g.ceil[i] = SKY_H; g.light[i] = Math.max(g.light[i], 0.9); g.flags[i] |= F.OUTDOOR; }
    for (let k = 0; k <= wW; k += 2) deco.box(wx0 + k - 0.06, top, wz0, wx0 + k + 0.06, top + 0.2, wz0 + wH, TS.BEAM);
    for (let k = 0; k <= wH; k += 2) deco.box(wx0, top, wz0 + k - 0.06, wx0 + wW, top + 0.2, wz0 + k + 0.06, TS.BEAM);
    // fallen slabs and a broken beam down in the water
    for (let k = 0; k < 4; k++) {
      const i = [...well][rng.int(0, well.size - 1)];
      if (!(g.flags[i] & F.PIT)) continue;
      const sx = (i % g.w) + rng.float(0, 0.4), sz = ((i / g.w) | 0) + rng.float(0, 0.4);
      deco.box(sx, r.floor - depth, sz, sx + rng.float(0.7, 1.4), r.floor - depth + rng.float(0.6, 1.5), sz + rng.float(0.7, 1.4), TS.SIDE);
    }
  }
  // pit walls: pipes and conduits running down into the well
  let pk = 0;
  for (const i of pitNow) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const j = g.idx(x + DIR_X[d], z + DIR_Z[d]);
      if (well.has(j) || !g.type[j] || g.floor[j] < r.floor - 0.01 || (pk++ % 5)) continue;
      const px = x + 0.5 + DIR_X[d] * 0.38, pz = z + 0.5 + DIR_Z[d] * 0.38;
      deco.box(px - 0.1, r.floor - depth, pz - 0.1, px + 0.1, r.floor - 0.1, pz + 0.1, TS.PIPE);
    }
  }
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
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildLobby(ctx, Fr), (c) => lobbyIsland(c));
};
function buildLobby(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const hosp = isHosp(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 7 || Wd < 7) return false;
  // reception counter: t in [2,3), s centred, with the staff side against the wall
  let desk = null;
  for (const dw of [Math.min(8, Wd - 4), 6, 5, 4, 3]) {
    if (dw < 3) continue;
    for (const ds of [Math.floor((Wd - dw) / 2), 2, Wd - dw - 2, 1, Wd - dw - 1]) {
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

// no wall stretch for the desk: a free-standing reception island, seats round it
function lobbyIsland(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const hosp = isHosp(ctx);
  ctx.used = new Set();
  const Fr = frame(r, r.w >= r.h ? 3 : 1);
  const m = freeMask(ctx, Fr, 1);
  const isl = bestRect(m, { minT: 3, minS: 4, maxT: 3, maxS: 6, score: (t, s, dt, ds) => ds * 2 - Math.abs(t + 1.5 - Fr.L / 2) - Math.abs(s + ds / 2 - Fr.Wd / 2) });
  if (isl) {
    const { t, s: s0, ds } = isl;
    const [ax, az] = Fr.pt(t + 1.1, s0 + 0.2), [bx, bz] = Fr.pt(t + 1.9, s0 + ds - 0.2);
    counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r.floor, Fr.away, { front: TS.PANEL, side: TS.METAL, top: hosp ? TS.WOOD : TS.METAL, h: 1.1 });
    for (let k = s0 + 1; k < s0 + ds - 0.5; k += 2) { const [mx, mz] = Fr.pt(t + 1.5, k + 0.5); monitor(ctx, mx, mz, r.floor + 1.1, Fr.toward); }
    const [lx, lz] = Fr.pt(t + 1.5, s0 + ds / 2);
    deco.box(lx - 0.6, r.floor + r.ceilH - 0.08, lz - 0.6, lx + 0.6, r.floor + r.ceilH, lz + 0.6, TS.LIGHT, { uv: 'fit', emissive: 1 });
    useL(ctx, Fr, t, s0, 3, ds);
  }
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 8)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (rng.chance(0.4)) deco.planter(x + 0.1, z + 0.1, r.floor, 0.8, 0.8);
    else if (hosp) machineBlock(ctx, x, z, d, r.floor, 1.9, 0.75);
    else cabinet(ctx, x, z, d, r.floor, 1.9, 0.5);
    use(ctx, x, z, 1, 1);
  }
  panelGrid(ctx, 4, hosp ? [1, 0.95, 0.85] : WHITE);
  void g;
}

// ======================================================================
// DECON: a decontamination airlock. Full-height glass partitions split the
// room into stages - changing area (lockers, benches), the shower stage
// (gantries with UV strips over floor drains) and the clean side (suit
// racks, a control panel) - joined by 3-wide openings with parked sliding
// glass doors, status light headers and hazard lines.
// ======================================================================
LT.decon = function decon(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildDecon(ctx, Fr), (c) => LT.supply(c));
};
function buildDecon(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 7 || Wd < 6) return false;
  const y = r.floor, H = Math.min(r.ceilH, 5);
  // opening on the partition line t: must cover every exit approach / odd cell next to it
  const centre = Math.floor((Wd - 3) / 2);
  const opening = (t) => lineOpening(ctx, Fr, t, 3, 4, centre);
  let best = null;
  for (let a = 2; a <= L - 5; a++) for (let b = a + 3; b <= L - 2; b++) {
    const oa = opening(a), ob = opening(b);
    if (!oa || !ob) continue;
    const sc = -Math.abs(a - (L - b)) - Math.abs(b - a - 4) * 0.7;
    if (!best || sc > best.sc) best = { a, b, oa, ob, sc };
  }
  if (!best) {
    for (let a = 3; a <= L - 3; a++) { const oa = opening(a); if (oa && (!best || Math.abs(a - L / 2) < Math.abs(best.a - L / 2))) best = { a, b: L, oa, ob: null }; }
    if (!best) return false;
  }
  const { a, b, oa, ob } = best;
  // partitions + doors
  for (const [t, op] of [[a, oa], [b, ob]]) {
    if (!op) continue;
    glassLineL(ctx, Fr, t, 0, Wd, y, H, [op], { emissive: 0.18 });
    if (op[0] >= 1) doorLeafL(ctx, Fr, t, op[0] - 0.95, op[0] - 0.04, y, 1);
    if (op[1] <= Wd - 1) doorLeafL(ctx, Fr, t, op[1] + 0.04, op[1] + 0.95, y, 1);
    // hazard lines across the opening on both faces
    for (const tt of [t - 0.3, t + 0.16]) { const [p0x, p0z] = Fr.pt(tt, op[0]), [p1x, p1z] = Fr.pt(tt + 0.14, op[1]); paint(ctx, Math.min(p0x, p1x), Math.min(p0z, p1z), Math.max(p0x, p1x), Math.max(p0z, p1z), y); }
  }
  const sideFree = (t, s) => { const [x, z] = Fr.cell(t, s); return !r.reserved.has(g.idx(x, z)) && flatOpen(ctx, x, z, 1, 1); };
  // ---- shower stage: gantries over drains, UV strips
  const t1 = Math.min(b, L);
  let gant = 0;
  for (let t = a + 1; t < t1 - 0.5; t += 2) {
    if (!sideFree(t, 0) || !sideFree(t, Wd - 1)) continue;
    const [ax, az] = Fr.pt(t + 0.5, 0.05), [bx, bz] = Fr.pt(t + 0.5, Wd - 0.05);
    showerGantry(ctx, ax, az, bx, bz, y, Math.min(2.8, H - 0.4));
    gant++;
  }
  for (let t = a; t < t1; t++) for (let s = 0; s < Wd; s++) {
    const [x, z] = Fr.cell(t, s);
    const i = g.idx(x, z);
    if (g.type[i] && !(g.flags[i] & (F.STAIR | F.PIT)) && Math.abs(g.floor[i] - y) < 0.01) g.floorTex[i] = (s + t) % 3 ? TS.FLOOR3 : TS.GRATE;
  }
  for (let t = a + 0.5; t < t1 - 0.4; t += 2) {
    const [ax, az] = Fr.pt(t, 0.4), [bx, bz] = Fr.pt(t + 0.12, Wd - 0.4);
    deco.box(Math.min(ax, bx), y + H - 0.08, Math.min(az, bz), Math.max(ax, bx), y + H, Math.max(az, bz), TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
  }
  deco.light(...(() => { const [cx, cz] = Fr.pt((a + t1) / 2, Wd / 2); return [cx, y + H - 0.6, cz]; })(), [0.65, 0.55, 1], 6);
  useL(ctx, Fr, a, 0, t1 - a, Wd);
  // ---- changing area (t < a): lockers on the walls, a steel bench
  const wall = (t0x, t1x) => wallSpots(ctx).filter(([x, z]) => { const [tt] = toFrame(Fr, x, z); return tt >= t0x && tt < t1x; });
  for (const [x, z, d] of wall(0, a)) { if (canUse(ctx, x, z, 1, 1, 0, 0) && rng.chance(0.8)) { cabinet(ctx, x, z, d, y, 2.0, 0.5); use(ctx, x, z, 1, 1); } }
  if (a >= 4 && Wd >= 7) {
    const bs = Math.floor(Wd / 2) - 1;
    if (okL(ctx, Fr, Math.floor(a / 2), bs - 1, 1, 4, 0, 1)) {
      lbox(deco, Fr, Math.floor(a / 2) + 0.3, Math.floor(a / 2) + 0.7, bs, bs + 2, y + 0.42, y + 0.5, TS.WOOD);
      lbox(deco, Fr, Math.floor(a / 2) + 0.42, Math.floor(a / 2) + 0.58, bs + 0.1, bs + 1.9, y, y + 0.42, TS.METAL, { faces: FACE.SIDES });
      lcollider(deco, Fr, Math.floor(a / 2) + 0.3, Math.floor(a / 2) + 0.7, bs, bs + 2, y, y + 0.5);
      useL(ctx, Fr, Math.floor(a / 2), bs, 1, 2);
    }
  }
  // ---- clean side (t >= b): hazmat suit racks, a decon control panel, a puddle of runoff
  if (ob) {
    let k = 0;
    for (const [x, z, d] of rng.shuffle(wall(b, L))) {
      if (!canUse(ctx, x, z, 1, 1, 0, 0)) continue;
      if (k === 0) deco.console(x, z, y, OPP[d]);
      else if (k % 2) suitRack(ctx, x, z, d, y);
      else cabinet(ctx, x, z, d, y, 2.0, 0.5);
      use(ctx, x, z, 1, 1);
      k++;
    }
  }
  for (let k = 0; k < 2; k++) {
    const t = rng.int(0, L - 2), s2 = rng.int(1, Wd - 3);
    if (t >= a - 1 && t <= t1) continue;
    if (okL(ctx, Fr, t, s2, 2, 2, 1, 0)) { pit(ctx, ...Fr.rect(t, s2, 2, 2), 'water', 0.3); useL(ctx, Fr, t, s2, 2, 2); }
  }
  void gant;
  panelGrid(ctx, 4, [0.85, 0.92, 1]);
  return true;
}
// hazmat suits hanging on a wall rail (cell x,z, wall side d)
function suitRack(ctx, x, z, d, y) {
  const { deco, rng } = ctx;
  wallBox(ctx, x, z, d, 0.1, y + 2.05, y + 2.12, TS.METAL, { inset: 0.05 });
  for (let k = 0; k < 2; k++) {
    const u = 0.27 + k * 0.46;
    const off = 0.28;
    const cx = d < 2 ? x + 0.5 + DIR_X[d] * off : x + u, cz = d >= 2 ? z + 0.5 + DIR_Z[d] * off : z + u;
    const hw = 0.17, hd = 0.1;
    const [ex, ez] = d < 2 ? [hd, hw] : [hw, hd];
    const low = y + rng.float(0.45, 0.6);
    deco.box(cx - ex, low, cz - ez, cx + ex, y + 1.7, cz + ez, TS.PAINT, { uv: 'fit' });              // suit body
    deco.box(cx - ex * 0.7, y + 1.7, cz - ez * 0.9, cx + ex * 0.7, y + 2.02, cz + ez * 0.9, TS.GLASS, { uv: 'fit', emissive: 0.2 });   // hood visor
  }
  deco.collider(d === 0 ? x + 0.55 : d === 1 ? x : x + 0.05, y, d === 2 ? z + 0.55 : d === 3 ? z : z + 0.05, d === 0 ? x + 1 : d === 1 ? x + 0.45 : x + 0.95, y + 2.1, d === 2 ? z + 1 : d === 3 ? z + 0.45 : z + 0.95);
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
    if (rng.chance(0.5)) wallShelf(ctx, x, z, d, r.floor, 2.0, 0.45, [TS.GLASS, TS.GLASS, TS.CRATE]);
    else cabinet(ctx, x, z, d, r.floor, 2.0, 0.55);
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
// CLEAN ROOM: a glass-walled clean room in the biggest free stretch of floor
// (lidded with filter-unit light panels, an air-shower entry, equipment rows
// and a workstation inside, a walkway kept round it), overlooked by an
// observation gallery one level up (in-line flights, glass balustrade,
// consoles, office windows behind)
// ======================================================================
LT.cleanroom = function cleanroom(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildCleanroom(ctx, Fr), (c) => LT.wetlab(c));
};
function buildCleanroom(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 10 || Wd < 10) return false;
  const yG = y + 3.6, gD = 3;
  const gal = r.ceilH >= 7 ? buildGallery(ctx, Fr, gD, yG, { minDeck: 4, twoFlights: Wd >= 22 }) : null;
  // the box: biggest free rect, a 2-cell walkway kept to the walls (and the gallery)
  const m = freeMask(ctx, Fr, 1);
  const box = bestRect(m, { t0: gal ? gD + 2 : 2, t1: L - 2, s0: 2, s1: Wd - 2, minT: 4, minS: 5, maxT: 10, maxS: 12 });
  if (!box) return false;
  const t0 = box.t, s0 = box.s, t1 = box.t + box.dt, s1 = box.s + box.ds;
  const [bx0, bz0, bw, bh] = Fr.rect(t0, s0, t1 - t0, s1 - s0);
  retexFloor(ctx, cellsOf(g, bx0, bz0, bw, bh), TS.FLOOR3);
  const hW = Math.min(3.0, r.ceilH - 1.2);
  const entryS = s0 + Math.floor((s1 - s0) / 2) - 1;
  // glass walls (entry on the face toward the gallery side)
  glassLineL(ctx, Fr, t0, s0, s1, y, hW, [[entryS, entryS + 2]]);
  glassLineL(ctx, Fr, t1, s0, s1, y, hW);
  for (const sl of [s0, s1]) {
    const [ax, az] = Fr.pt(t0, sl), [bx, bz] = Fr.pt(t1, sl);
    glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, hW);
  }
  // lid with HEPA filter panels, air-shower header at the entry
  lbox(deco, Fr, t0, t1, s0, s1, y + hW, y + hW + 0.14, TS.METAL);
  for (let t = t0 + 1; t < t1 - 0.5; t += 2) for (let s2 = s0 + 1; s2 < s1 - 0.5; s2 += 2) {
    const [x, z] = Fr.cell(t, s2);
    deco.lightPanel(x + 0.15, z + 0.15, x + 0.85, z + 0.85, y + hW, [0.9, 0.97, 1], 5);
  }
  lbox(deco, Fr, t0 - 0.35, t0 + 0.35, entryS - 0.1, entryS + 2.1, y + 2.4, y + hW, TS.MACHINE, { uv: 'fit' });
  lbox(deco, Fr, t0 - 0.37, t0 + 0.37, entryS + 0.1, entryS + 1.9, y + 2.32, y + 2.4, TS.LIGHT, { uv: 'fit', emissive: 1 });
  for (const tt of [t0 - 0.5, t0 + 0.36]) { const [p0x, p0z] = Fr.pt(tt, entryS), [p1x, p1z] = Fr.pt(tt + 0.14, entryS + 2); paint(ctx, Math.min(p0x, p1x), Math.min(p0z, p1z), Math.max(p0x, p1x), Math.max(p0z, p1z), y); }
  // inside: tools along the back wall, cabinets on the sides, a workstation
  // in the middle; a clear aisle from the entry
  for (let s2 = s0; s2 < s1; s2 += 2) {
    if (s2 === entryS || s2 === entryS + 1) continue;
    const [x, z] = Fr.cell(t1 - 1, s2);
    machineBlock(ctx, x, z, Fr.away, y, rng.pick([1.4, 1.8, 2.1]), 0.7);
  }
  if (t1 - t0 >= 6) {
    for (let t = t0 + 2; t < t1 - 2; t += 2) {
      for (const [s2, d] of [[s0, Fr.latN], [s1 - 1, Fr.lat]]) {
        const [x, z] = Fr.cell(t, s2);
        if (rng.chance(0.7)) cabinet(ctx, x, z, d, y, 1.2, 0.55);
      }
    }
  }
  if (t1 - t0 >= 6 && s1 - s0 >= 7) {
    const tc = t0 + Math.floor((t1 - t0) / 2) - 1, sc = s0 + 2;
    const [x0, z0, w, h] = Fr.rect(tc + 0.15, sc + 0.1, 0.9, Math.min(3, s1 - s0 - 5) - 0.2);
    labBench(ctx, x0, z0, x0 + w, z0 + h, y, { sink: false });
  }
  useL(ctx, Fr, t0 - 1, s0 - 1, t1 - t0 + 2, s1 - s0 + 2);
  // gallery: consoles at the back facing the clean room, office windows behind
  if (gal) {
    for (let s2 = gal.s0 + 1; s2 < gal.s1 - 1; s2 += 2) { const [x, z] = Fr.cell(0, s2); deco.console(x, z, yG, Fr.away); }
    for (let s2 = gal.s0; s2 < gal.s1; s2 += 2) { const [x, z] = Fr.cell(0, s2); if (yG + 2.6 < y + r.ceilH - 0.4) deco.window(x, z, Fr.toward, yG + 1.0, yG + 2.4, { emissive: 0.5 }); }
  }
  // outer ring: cabinets on wall cells that keep 3 cells to the box
  const nearBox = (x, z) => { const [tt, ss] = toFrame(Fr, x, z); return tt >= t0 - 3 && tt < t1 + 3 && ss >= s0 - 3 && ss < s1 + 3; };
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 8)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1) || nearBox(x, z)) continue;
    cabinet(ctx, x, z, d, y, 2.0, 0.5);
    use(ctx, x, z, 1, 1);
  }
  panelGrid(ctx, 4, WHITE, 6);
  return true;
}

// ======================================================================
// SPECIMEN HALL: rows of glowing specimen tanks along both long walls (some
// shattered, their fluid spilled), a sunken bio-hazard sump down the middle
// shaped round the exits, crossed by grate bridges, with glass rails, hazard
// lines, drums down in the sludge, a feed manifold and a monitoring desk
// ======================================================================
LT.specimen = function specimen(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildSpecimen(ctx, Fr), (c) => TEMPLATES.pitroom(c));
};
function buildSpecimen(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;     // t runs along the hall
  if (L < 9 || Wd < 8) return false;
  const top = r.floor + r.ceilH;
  const hosp = isHosp(ctx);
  // tank rows first (they set the walkway width), every 2 cells
  let tanks = 0;
  const tankAt = [];
  for (let t = 1; t < L - 1; t += 2) {
    for (const s of [0, Wd - 1]) {
      if (!okL(ctx, Fr, t, s, 1, 1, 0, 0)) continue;
      tankAt.push([t, s]);
      useL(ctx, Fr, t, s, 1, 1);
    }
  }
  // the sump: free floor two cells in from the tank rows
  const kind = hosp ? rng.pick(['water', 'poison']) : 'poison';
  const cand = new Set();
  for (let t = 2; t < L - 2; t++) for (let s = 3; s < Wd - 3; s++) {
    if (!okL(ctx, Fr, t, s, 1, 1, 1, 1)) continue;
    const [x, z] = Fr.cell(t, s); cand.add(g.idx(x, z));
  }
  const sump = largestBlob(g, openShape(g, cand));
  let pc = [];
  if (sump.size >= 9) {
    pc = pitSet(ctx, sump, kind, 3.5);
    for (const i of sump) ctx.used.add(i);
    // grate bridges across (along s) where both ends land on floor
    const inS = (t, s) => { const [x, z] = Fr.cell(t, s); return sump.has(g.idx(x, z)); };
    const flo = (t, s) => { const [x, z] = Fr.cell(t, s); const i = g.idx(x, z); return g.type[i] && !(g.flags[i] & (F.PIT | F.STAIR | F.HAZARD)) && Math.abs(g.floor[i] - r.floor) < 0.01; };
    const rows = [];
    for (let t = 2; t < L - 3; t++) {
      let a = -1, b = -1;
      for (let s = 0; s < Wd; s++) if (inS(t, s) && inS(t + 1, s)) { if (a < 0) a = s; b = s; }
      if (a < 0) continue;
      let ok2 = true;
      for (let s = a; s <= b; s++) if (!inS(t, s) || !inS(t + 1, s)) ok2 = false;
      if (ok2 && flo(t, a - 1) && flo(t + 1, a - 1) && flo(t, b + 1) && flo(t + 1, b + 1)) rows.push([t, a, b]);
    }
    const br = [];
    if (rows.length) {
      const mid = rows.reduce((p, q) => (Math.abs(q[0] - L / 2) < Math.abs(p[0] - L / 2) ? q : p));
      const picks = [mid];
      const far = rows.filter((q) => Math.abs(q[0] - mid[0]) >= 6);
      if (far.length && L >= 16) picks.push(far[rng.int(0, far.length - 1)]);
      for (const [t, a, b] of picks) br.push(...deckBridge(ctx, ...Fr.rect(t, a, 2, b - a + 1), r.floor));
    }
    const rest = pc.filter((i) => !br.includes(i));
    railAround(ctx, rest, { style: ctx.style.railStyle });
    hazardLines(ctx, rest);
    // drums sunk in the sludge
    for (let k = 0; k < 3; k++) {
      const i = rest[rng.int(0, rest.length - 1)];
      if (i === undefined) break;
      const dx = (i % g.w) + rng.float(0.1, 0.4), dz = ((i / g.w) | 0) + rng.float(0.1, 0.4);
      deco.box(dx, r.floor - 3.5, dz, dx + 0.6, r.floor - 2.7, dz + 0.6, TS.CRATE2, { uv: 'fit' });
    }
  }
  for (const [t, s] of tankAt) {
    const [x, z] = Fr.pt(t + 0.5, s + 0.5);
    const broken = rng.chance(0.22);
    tank(ctx, x, z, r.floor, Math.min(top - 0.6, r.floor + 3.4), { r: 0.36, fluid: hosp ? TS.WATER : TS.POISON, broken, ceil: top });
    tanks++;
    if (broken) {
      const sIn = s === 0 ? 1 : Wd - 2;
      if (okL(ctx, Fr, t, sIn, 1, 1, 0, 0)) { pit(ctx, ...Fr.rect(t, sIn, 1, 1), hosp ? 'water' : 'poison', 0.3); useL(ctx, Fr, t, sIn, 1, 1); }
    }
  }
  if (tanks < 4 && !pc.length) return false;
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
  return true;
}

// ======================================================================
// COLD STORAGE (bio sample store / hospital blood bank): a walk-in freezer
// built of insulated panels in a corner (frosted, blue-lit, racks inside),
// sample racks in rows, chest freezers on the walls, liquid-nitrogen dewars
// ======================================================================
LT.coldstore = function coldstore(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildCold(ctx, Fr), (c) => coldFallback(c));
};
function buildCold(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 7 || Wd < 7) return false;
  const hW = Math.min(3.0, r.ceilH - 0.4);
  // walk-in freezer: a box against the t = 0 wall at one end, door facing +t
  const m = freeMask(ctx, Fr, 1);
  const fz = bestRect(m, { t0: 0, t1: Math.min(L - 3, 6), minT: 4, minS: 4, maxT: 5, maxS: 6, score: (t, s, dt, ds) => (t === 0 ? 100 : 0) + (s === 0 || s + ds === Wd ? 30 : 0) + dt * ds });
  if (fz && fz.t === 0) walkInFreezer(ctx, Fr, fz, hW);
  else if ((ctx.coldTry = (ctx.coldTry || 0) + 1) < 4) return false;   // try the other walls for it first

  // sample racks in rows in the rest of the room
  const m2 = freeMask(ctx, Fr, 1);
  let racks = 0;
  for (let t = 2; t < L - 2; t += 3) {
    for (let s = 1; s < Wd - 1;) {
      let len = Math.min(4, Wd - 1 - s);
      while (len >= 2 && !(m2[t] && m2[t].slice(s, s + len).every(Boolean) && okL(ctx, Fr, t, s, 1, len, 1, 1))) len--;
      if (len < 2) { s++; continue; }
      const [x0, z0, w, h] = Fr.rect(t + 0.15, s + 0.05, 0.7, len - 0.1);
      openShelf(ctx, x0, z0, x0 + w, z0 + h, y, 2.0, { items: [TS.CRATE, TS.CRATE2, TS.GLASS] });
      useL(ctx, Fr, t, s, 1, len);
      racks++;
      s += len + 2;
    }
  }
  // chest freezers / upright freezers on the free walls, dewars
  for (const [x, z, d] of wallSpots(ctx)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0) || rng.chance(0.3)) continue;
    if (rng.chance(0.5)) {
      wallBox(ctx, x, z, d, 0.7, y, y + 0.9, faced(OPP[d], TS.CRATE2, TS.METAL, TS.METAL), { solid: true, uv: 'fit', inset: 0.05 });
      wallBox(ctx, x, z, d, 0.62, y + 0.9, y + 0.94, TS.GLASS, { inset: 0.09, emissive: 0.3 });
    } else cabinet(ctx, x, z, d, y, 2.0, 0.75);
    use(ctx, x, z, 1, 1);
  }
  dewars(ctx, 3);
  for (let z = r.z + 1; z < r.z + r.h - 1; z += 3) for (let x = r.x + 1; x < r.x + r.w - 1; x += 4) {
    const i = g.idx(x, z);
    if (!g.type[i] || ctx.used.has(i) && g.floorTex[i] === TS.GRATE) continue;
    deco.lightPanel(x + 0.1, z + 0.35, x + 0.9, z + 0.65, g.ceil[i], COLD, 5.5);
  }
  r.lit = true;
  void racks;
  return true;
}
// walk-in freezer: insulated steel panels round a corner box, a strip-curtain
// door, frosted roof slab, blue light, racks inside
function walkInFreezer(ctx, Fr, fz, hW) {
  const { g, deco, room: r } = ctx;
  const y = r.floor, Wd = Fr.Wd;
  const { t: ft, s: fs, dt: fdt, ds: fds } = fz;
  const doorS = fs + Math.floor((fds - 2) / 2);
  const P = { pane: TS.METAL, thick: 0.14 };
  glassLineL(ctx, Fr, ft + fdt, fs, fs + fds, y, hW, [[doorS, doorS + 2]], P);
  // side panels (frame lines along t at s = fs and s = fs + fds, unless on the room wall)
  for (const sl of [fs, fs + fds]) {
    if (sl === 0 || sl === Wd) continue;
    const [ax, az] = Fr.pt(0, sl), [bx, bz] = Fr.pt(ft + fdt, sl);
    glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, hW, P);
  }
  // roof slab with frost, a strip-curtain door, blue light inside
  lbox(deco, Fr, ft, ft + fdt, fs, fs + fds, y + hW, y + hW + 0.12, TS.METAL);
  for (let k = 0; k < 6; k++) lbox(deco, Fr, ft + fdt - 0.03, ft + fdt + 0.03, doorS + k / 3 + 0.02, doorS + k / 3 + 0.3, y + 0.25, y + 2.55, TS.GLASS, { uv: 'fit', emissive: 0.15 });
  lbox(deco, Fr, ft + fdt - 0.09, ft + fdt + 0.09, doorS, doorS + 2, y + 2.55, y + 2.7, TS.METAL);
  const [lx, lz] = Fr.pt(ft + fdt / 2, fs + fds / 2);
  deco.light(lx, y + hW - 0.4, lz, COLD, 5);
  deco.box(lx - 0.4, y + hW - 0.05, lz - 0.15, lx + 0.4, y + hW, lz + 0.15, TS.LIGHT, { uv: 'fit', emissive: 1 });
  // racks inside along both side walls
  for (const sl of [fs, fs + fds - 1]) {
    for (let t = ft; t < ft + fdt - 1; t++) {
      const [x0, z0, w, h] = Fr.rect(t + 0.05, sl + (sl === fs ? 0.1 : 0.35), 0.9, 0.55);
      openShelf(ctx, x0, z0, x0 + w, z0 + h, y, 2.0, { items: [TS.CRATE, TS.CRATE, TS.GLASS] });
    }
  }
  for (const i of cellsOf(g, ...Fr.rect(ft, fs, fdt, fds))) if (g.type[i]) { g.floorTex[i] = TS.GRATE; g.light[i] = Math.min(g.light[i], 0.75); }
  useL(ctx, Fr, ft, fs, fdt + 1, fds);
}
function coldFallback(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  for (const [x, z, d] of wallSpots(ctx)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0) || rng.chance(0.25)) continue;
    cabinet(ctx, x, z, d, r.floor, 2.0, 0.75);
    use(ctx, x, z, 1, 1);
  }
  dewars(ctx, 4);
  for (let z = r.z + 1; z < r.z + r.h - 1; z += 3) for (let x = r.x + 1; x < r.x + r.w - 1; x += 4) {
    const i = g.idx(x, z);
    if (g.type[i]) deco.lightPanel(x + 0.1, z + 0.35, x + 0.9, z + 0.65, g.ceil[i], COLD, 5.5);
  }
  r.lit = true;
}
// clusters of liquid-nitrogen dewars on free floor
function dewars(ctx, n) {
  const { deco, rng, room: r } = ctx;
  for (let k = 0; k < n * 3 && n > 0; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    if (!ok(ctx, x, z, 1, 1, 0, 1)) continue;
    for (const [ox, oz] of [[0.3, 0.3], [0.7, 0.35], [0.45, 0.72]]) {
      deco.box(x + ox - 0.15, r.floor, z + oz - 0.15, x + ox + 0.15, r.floor + 0.85, z + oz + 0.15, TS.METAL);
      deco.box(x + ox - 0.06, r.floor + 0.85, z + oz - 0.06, x + ox + 0.06, r.floor + 0.97, z + oz + 0.06, TS.METAL);
    }
    deco.collider(x + 0.1, r.floor, z + 0.1, x + 0.9, r.floor + 0.97, z + 0.9);
    use(ctx, x, z, 1, 1);
    n--;
  }
}
// open shelving against the wall of cell (x, z) on side d
function wallShelf(ctx, x, z, d, y, h = 2.0, dep = 0.45, items) {
  const ins = 0.05;
  const x0 = d === 0 ? x + 1 - dep : d === 1 ? x : x + ins, x1 = d === 0 ? x + 1 : d === 1 ? x + dep : x + 1 - ins;
  const z0 = d === 2 ? z + 1 - dep : d === 3 ? z : z + ins, z1 = d === 2 ? z + 1 : d === 3 ? z + dep : z + 1 - ins;
  openShelf(ctx, x0, z0, x1, z1, y, h, { items });
}

// ======================================================================
// SERVER ROOM: perforated raised floor, rack rows with cold aisles, cable
// trays overhead, cooling units on a wall, status screens
// ======================================================================
LT.servers = function servers(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildServers(ctx, Fr), (c) => serversWall(c));
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

// small / busy server room: racks along the free walls, cooling units, trays
function serversWall(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  retexFloor(ctx, ctx.cells, TS.GRATE);
  const h = Math.min(2.3, r.ceilH - 1.2);
  let k = 0;
  for (const [x, z, d] of wallSpots(ctx)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0)) continue;
    if (k++ % 4 === 3) machineBlock(ctx, x, z, d, r.floor, h, 0.85);
    else {
      const x0 = d === 0 ? x + 0.2 : d === 1 ? x : x + 0.02, x1 = d === 0 ? x + 1 : d === 1 ? x + 0.8 : x + 0.98;
      const z0 = d === 2 ? z + 0.2 : d === 3 ? z : z + 0.02, z1 = d === 2 ? z + 1 : d === 3 ? z + 0.8 : z + 0.98;
      rackRow(ctx, x0, z0, x1, z1, r.floor, h);
    }
    use(ctx, x, z, 1, 1);
  }
  const top = r.floor + r.ceilH;
  for (let z = r.z + 1; z < r.z + r.h - 1; z += 3) lightStrip(ctx, r.x + 1, z + 0.4, r.x + r.w - 1, z + 0.6, top, [0.55, 0.75, 1], 6);
  r.lit = true;
  void g; void rng;
}

// ======================================================================
// FLOODED PUMP ROOM / BASEMENT: a deep flooded sump (shaped round the exits)
// crossed by a 2-wide grate catwalk and narrower service walks, pump intakes
// standing in the water, pumps and control cabinets on the walls, big pipes
// ======================================================================
LT.flooded = function flooded(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildFlooded(ctx, Fr), (c) => floodedShallow(c));
};
function buildFlooded(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 8 || Wd < 7) return false;
  const cand = new Set();
  for (let t = 2; t < L - 2; t++) for (let s = 2; s < Wd - 2; s++) {
    if (!okL(ctx, Fr, t, s, 1, 1, 1, 1)) continue;
    const [x, z] = Fr.cell(t, s); cand.add(g.idx(x, z));
  }
  const sump = largestBlob(g, openShape(g, cand));
  if (sump.size < 16) return false;
  const depth = 2.6;
  const pc = pitSet(ctx, sump, 'water', depth);
  for (const i of sump) ctx.used.add(i);
  const inS = (t, s) => { const [x, z] = Fr.cell(t, s); return sump.has(g.idx(x, z)); };
  const flo = (t, s) => { const [x, z] = Fr.cell(t, s); const i = g.idx(x, z); return g.type[i] && !(g.flags[i] & (F.PIT | F.STAIR | F.HAZARD | F.WATER)) && Math.abs(g.floor[i] - r.floor) < 0.01; };
  // catwalk runs: along s at row t (width w rows) when both ends land on floor
  const runS = (t, w) => {
    let a = -1, b = -1;
    for (let s = 0; s < Wd; s++) if ([...Array(w).keys()].every((k) => inS(t + k, s))) { if (a < 0) a = s; b = s; }
    if (a < 0) return null;
    for (let s = a; s <= b; s++) for (let k = 0; k < w; k++) if (!inS(t + k, s)) return null;
    for (let k = 0; k < w; k++) if (!flo(t + k, a - 1) || !flo(t + k, b + 1)) return null;
    return [t, a, b];
  };
  const runT = (s, w) => {
    let a = -1, b = -1;
    for (let t = 0; t < L; t++) if ([...Array(w).keys()].every((k) => inS(t, s + k))) { if (a < 0) a = t; b = t; }
    if (a < 0) return null;
    for (let t = a; t <= b; t++) for (let k = 0; k < w; k++) if (!inS(t, s + k)) return null;
    for (let k = 0; k < w; k++) if (!flo(a - 1, s + k) || !flo(b + 1, s + k)) return null;
    return [s, a, b];
  };
  const walk = new Set(ctx.cells.filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.WATER))));
  // main 2-wide catwalk across the middle (along s), service walks along t
  let main = null;
  for (let k = 0; k <= 4 && !main; k++) for (const sg of [1, -1]) { const t = Math.floor(L / 2) - 1 + k * sg; if (t >= 2 && t <= L - 4 && (main = runS(t, 2))) break; }
  if (main) { const [t, a, b] = main; for (const i of deckBridge(ctx, ...Fr.rect(t, a, 2, b - a + 1), r.floor)) walk.add(i); }
  let serv = 0;
  for (let s = 3; s < Wd - 3; s += rng.pick([3, 4])) {
    const run = runT(s, 1);
    if (!run) continue;
    const [ss, a, b] = run;
    for (const i of deckBridge(ctx, ...Fr.rect(a, ss, b - a + 1, 1), r.floor)) walk.add(i);
    serv++;
  }
  deco.railEdges(walk, { style: 'metal' });
  // pump intakes standing in the water
  const water = pc.filter((i) => g.flags[i] & F.PIT);
  for (let k = 0; k < 3 && water.length; k++) {
    const i = water[rng.int(0, water.length - 1)];
    const px = (i % g.w) + 0.2, pz = ((i / g.w) | 0) + 0.2;
    deco.box(px, r.floor - depth, pz, px + 0.6, r.floor - 0.5, pz + 0.6, TS.PIPE);
    deco.box(px - 0.1, r.floor - 0.5, pz - 0.1, px + 0.7, r.floor - 0.3, pz + 0.7, TS.METAL);
  }
  floodedWalls(ctx);
  return true;
}
// too small / exits in the way: standing water in puddles, the pumps and pipes
function floodedShallow(ctx) {
  const { rng, room: r } = ctx;
  ctx.used = new Set();
  for (let k = 0; k < 6; k++) {
    const pw = rng.int(2, 4), ph = rng.int(2, 4);
    const px = rng.int(r.x + 1, r.x + r.w - pw - 1), pz = rng.int(r.z + 1, r.z + r.h - ph - 1);
    if (ok(ctx, px, pz, pw, ph, 1, 1)) { pit(ctx, px, pz, pw, ph, 'water', 0.3); use(ctx, px, pz, pw, ph); }
  }
  floodedWalls(ctx);
}
function floodedWalls(ctx) {
  const { deco, rng, room: r } = ctx;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 7)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    machineBlock(ctx, x, z, d, r.floor, rng.pick([1.2, 1.6]), 0.8);
    use(ctx, x, z, 1, 1);
  }
  const top = r.floor + r.ceilH;
  for (const z of [r.z + 0.25, r.z + r.h - 0.25]) deco.pipe(r.x, z, r.x + r.w, z, top - 0.9, 0.34);
  for (const x of [r.x + 0.25, r.x + r.w - 0.25]) deco.pipe(x, r.z, x, r.z + r.h, top - 1.5, 0.26);
  r.lit = false;
}

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
  // wide wards: a central double row of beds head to head against a
  // headwall spine (outlets, gas taps, reading lights)
  if (Wd >= 12) {
    const mid = Math.floor(Wd / 2);
    let a = -1, b = -1;
    for (let t = 2; t < L - 2; t++) {
      const okRow = okL(ctx, Fr, t, mid - 2, 1, 4, 0, 0) && canUseL(ctx, Fr, t, mid - 3, 1, 6);
      if (okRow) { if (a < 0) a = t; b = t; } else if (a >= 0 && b - a < 3) { a = -1; b = -1; } else if (a >= 0) break;
    }
    if (a >= 0 && b - a >= 3) {
      const [sx0, sz0] = Fr.pt(a + 0.2, mid - 0.12), [sx1, sz1] = Fr.pt(b + 0.8, mid + 0.12);
      deco.box(Math.min(sx0, sx1), r.floor, Math.min(sz0, sz1), Math.max(sx0, sx1), r.floor + 1.5, Math.max(sz0, sz1), TS.PANEL, { solid: true });
      deco.box(Math.min(sx0, sx1) - 0.03, r.floor + 1.5, Math.min(sz0, sz1) - 0.03, Math.max(sx0, sx1) + 0.03, r.floor + 1.58, Math.max(sz0, sz1) + 0.03, TS.METAL);
      for (let t = a; t <= b; t += 2) {
        for (const [sh, dW] of [[mid - 1, Fr.lat], [mid, Fr.latN]]) {
          const [hx, hz] = Fr.cell(t, sh);
          bed(ctx, hx, hz, dW, r.floor, { shift: rng.float(-0.05, 0.05) });
        }
        const [lx, lz] = Fr.pt(t + 0.5, mid);
        deco.box(lx - 0.15, r.floor + 1.58, lz - 0.15, lx + 0.15, r.floor + 1.7, lz + 0.15, TS.LIGHT, { uv: 'fit', emissive: 1 });
        beds += 2;
      }
      useL(ctx, Fr, a, mid - 2, b - a + 1, 4);
    }
  }
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
  if (L < 9 || Wd < 9) return false;
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
  // the operating table: a free 4x4 floor block as central as possible in
  // front of the gallery (table, lamp, anaesthesia machine, monitor, trolley)
  const tA = gal ? 4 : 1;
  const m = freeMask(ctx, Fr, 0);
  const ctr = (tA + L) / 2, csr = Wd / 2;
  const blk = bestRect(m, { t0: tA, t1: L - 1, s0: 1, s1: Wd - 1, minT: 4, minS: 4, maxT: 4, maxS: 4, score: (t, s2) => -Math.abs(t + 2 - ctr) - Math.abs(s2 + 2 - csr) });
  if (!blk) return false;
  const tc = blk.t + 1, sc = blk.s + 1;
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
    } else if (sinks === 2 && rng.chance(0.7)) {
      // x-ray film viewer on the wall over an instrument cabinet
      wallBox(ctx, x, z, d, 0.5, r.floor, r.floor + 0.95, faced(OPP[d], TS.CRATE2, TS.METAL), { solid: true, uv: 'fit' });
      wallBox(ctx, x, z, d, 0.06, r.floor + 1.4, r.floor + 2.1, faced(OPP[d], TS.SCREEN, TS.METAL), { uv: 'fit', emissive: 0.9, inset: 0.1 });
      sinks++;
    } else if (rng.chance(0.6)) cabinet(ctx, x, z, d, r.floor, 2.0, 0.5);
    use(ctx, x, z, 1, 1);
  }
  // floor drain under the table, a blood-stained instrument tray
  const [dx, dz] = Fr.cell(tc, sc);
  if (g.type[g.idx(dx, dz)]) g.floorTex[g.idx(dx, dz)] = TS.GRATE;
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
// SUPPLY: lab / medical supply store - rows of open steel shelving stocked
// with boxes and bottles, cabinets on the walls, a packing table, carts. In
// the hospital half of them are pharmacies: a dispensing counter with a glass
// screen across the room (3-wide gap), shelving and drug cabinets behind it.
// ======================================================================
LT.supply = function supply(ctx) {
  if (isHosp(ctx) && ctx.rng.chance(0.5) && tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildPharmacy(ctx, Fr), null)) return;
  const { deco, rng, room: r } = ctx;
  ctx.used = new Set();
  const alongX = r.w >= r.h;
  const Lr = alongX ? r.w : r.h, Wr = alongX ? r.h : r.w;
  for (let s = 2; s < Wr - 2; s += 3) {
    for (let t = 2; t + 3 <= Lr - 2; t += 5) {
      const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
      const w = alongX ? 3 : 1, h = alongX ? 1 : 3;
      if (!ok(ctx, x, z, w, h, 1, 1)) continue;
      openShelf(ctx, x + (alongX ? 0.05 : 0.15), z + (alongX ? 0.15 : 0.05), x + w - (alongX ? 0.05 : 0.15), z + h - (alongX ? 0.15 : 0.05), r.floor, 2.2);
      use(ctx, x, z, w, h);
    }
  }
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 10)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k++ % 2) cabinet(ctx, x, z, d, r.floor, 2.0, 0.55);
    else wallShelf(ctx, x, z, d, r.floor, 2.1, 0.5);
    use(ctx, x, z, 1, 1);
  }
  for (let n = 0; n < 6; n++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    if (!ok(ctx, x, z, 1, 1, 0, 1)) continue;
    if (n % 2) trolley(ctx, x + 0.5, z + 0.5, r.floor, rng.chance(0.5));
    else deco.crateStack(x + 0.5, z + 0.5, r.floor, { count: rng.int(1, 3) });
    use(ctx, x, z, 1, 1);
  }
};
function buildPharmacy(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 7 || Wd < 6) return false;
  // the counter line: back area t < tc (store), front t >= tc (waiting side)
  let tc = -1, op = null;
  for (const t of [3, 4, 2, 5]) {
    if (t > L - 3) continue;
    const o = lineOpening(ctx, Fr, t, 3, 4, Wd - 4);
    if (o) { tc = t; op = o; break; }
  }
  if (tc < 0) return false;
  // counter boxes on the row t = tc - 1 except the opening, glass screen on top
  for (let s = 0; s < Wd; s++) {
    if (s >= op[0] && s < op[1]) continue;
    const [x, z] = Fr.cell(tc - 1, s);
    if (!flatOpen(ctx, x, z, 1, 1) || r.reserved.has(g.idx(x, z))) return false;
  }
  const runs = [[0, op[0]], [op[1], Wd]].filter(([p, q]) => q > p);
  for (const [p, q] of runs) {
    const [ax, az] = Fr.pt(tc - 0.75, p), [bx, bz] = Fr.pt(tc - 0.05, q);
    counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), y, Fr.away, { front: TS.PANEL, top: TS.METAL, h: 1.05 });
    lbox(deco, Fr, tc - 0.42, tc - 0.38, p + 0.1, q - 0.1, y + 1.05, y + 2.1, TS.GLASS, { uv: 'fit', emissive: 0.2 });
    for (let s2 = p + 1; s2 < q - 0.5; s2 += 2) { const [mx, mz] = Fr.pt(tc - 0.6, s2); monitor(ctx, mx, mz, y + 1.05, Fr.away); }
  }
  useL(ctx, Fr, tc - 1, 0, 1, Wd);
  // behind the counter: shelving along the back wall and in a row
  for (let s = 0; s < Wd; s++) {
    const [x, z] = Fr.cell(0, s);
    if (!canUse(ctx, x, z, 1, 1, 0, 0) || !flatOpen(ctx, x, z, 1, 1)) continue;
    if (s % 3 === 2) cabinet(ctx, x, z, Fr.toward, y, 2.1, 0.5);
    else wallShelf(ctx, x, z, Fr.toward, y, 2.2, 0.5, [TS.CRATE, TS.CRATE2, TS.GLASS]);
    use(ctx, x, z, 1, 1);
  }
  // waiting side: seats facing the counter, a ticket machine
  for (let t = tc + 2; t < L - 1 && t <= tc + 4; t += 2) {
    const a = 1, len = Math.min(Wd - 2, 5);
    if (!okL(ctx, Fr, t, a, 1, len, 0, 1)) continue;
    const [x0, z0, ww, hh] = Fr.rect(t, a, 1, len);
    const ax = ww > hh;
    seatRow(ctx, x0 + (ax ? 0 : 0.2), z0 + (ax ? 0.2 : 0), ax ? ww : hh, ax, y, Fr.toward);
    useL(ctx, Fr, t, a, 1, len);
  }
  panelGrid(ctx, 3, [1, 0.96, 0.88], 5.5);
  void rng;
  return true;
}

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
