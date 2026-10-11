// Room templates for the "foundry" archetype (see gen_foundry.js). They plug
// into the architect generator: ctx = {g, deco, rng, theme, style, room,
// cells, depth, boss}; room.reserved cells (exit approaches) stay flat and
// walkable. Each template builds in a wall frame (frame(R, side): t = depth
// away from that wall, s = along it), checks the room still works (every
// exit reaches the others, most of the floor reachable) and tries the next
// wall or falls back to a simpler layout when it does not.
import { TS, F, HAZ, OPP, DIR_X, DIR_Z, SKY_H } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import { TEMPLATES, freeRect } from './gen_arch.js';
import {
  cellsOf, canUse, use, flatOpen, canUseL, useL, okL, ok, setHeight, setHeightL, retexFloor, flightRect, flightL, snap, restore, roomOK,
  wallSpots, wallBox, hangLight, paint, hazardLines, deckBridge, pitSet, openShape, largestBlob, upperWindows, edgeCells, freeMask,
  bestRect, markMask, glassWall, machineBlock, cabinet, riser, nSteps, glassLineL, doorLeafL, monitor,
} from './lab_templates.js';
import * as P from './foundry_props.js';

const FT = {};
const { faced, fbox, fcollider, MOLTEN, FIRE, COLD, WARM, SODIUM, breachWall } = P;
const stat = (...a) => { if (globalThis.__FOUNDRYSTAT) globalThis.__FOUNDRYSTAT.push(a); };
// build failure with a reason (collected in dev stats)
const no = (ctx, why) => { ctx.why = why; return false; };

// ======================================================================
// shared helpers
// ======================================================================
function tryFrames(ctx, sides, build, fallback) {
  const { deco, room: r } = ctx;
  for (let k = 0; k < sides.length; k++) {
    const Fr = frame(r, sides[k]);
    ctx.used = new Set();
    const m = deco.mark(), s = snap(ctx);
    let okb = false;
    ctx.why = '';
    let built = false;
    try { built = build(Fr, k === sides.length - 1); okb = built && roomOK(ctx); } catch (e) { okb = false; stat('error', r.template, String((e && e.stack) || e).slice(0, 400)); }
    if (okb) return true;
    stat('try', r.template, sides[k], built ? 'roomOK' : ctx.why);
    deco.rollback(m); restore(ctx, s);
  }
  ctx.used = new Set();
  stat('fallback', r.template);
  if (fallback) fallback(ctx);
  return false;
}
// long walls first (random order within), then the short ones
function sidesLong(ctx, longFirst = true) {
  const { room: r, rng } = ctx;
  const longW = r.w >= r.h ? [3, 2] : [1, 0], shortW = r.w >= r.h ? [1, 0] : [3, 2];
  rng.shuffle(longW); rng.shuffle(shortW);
  return longFirst ? [...longW, ...shortW] : [...shortW, ...longW];
}
const fv = (ctx) => P.fvOf(ctx.theme);
// walkable flat ground at room height (exit approaches allowed)
function groundL(ctx, Fr, t0, s0, dt, ds) {
  if (t0 < 0 || s0 < 0 || t0 + dt > Fr.L || s0 + ds > Fr.Wd) return false;
  return flatOpen(ctx, ...Fr.rect(t0, s0, dt, ds));
}
const cellL = (ctx, Fr, t, s) => { const [x, z] = Fr.cell(t, s); return ctx.g.idx(x, z); };
// the molten / hazard liquid of a vat for this theme
function vatKind(ctx) { const v = fv(ctx); return v === 'meat' ? 'poison' : v === 'clock' ? 'spikes' : 'lava'; }
function moltenKind(ctx) { return fv(ctx) === 'meat' ? 'poison' : 'lava'; }
// rails on every walkable room cell (except `skip`) that drops away
function railAll(ctx, skip) {
  const { g, deco } = ctx;
  const set = new Set(ctx.cells.filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.VOID)) && !(skip && skip.has(i))));
  deco.railEdges(set, { style: ctx.style.railStyle });
}
// high-bay lamps over the walkable floor (not over pits)
function highBay(ctx, step = 6, color = SODIUM, drop) {
  const { g, room: r } = ctx;
  for (let z = r.z + 2; z < r.z + r.h - 1; z += step) for (let x = r.x + 2; x < r.x + r.w - 1; x += step) {
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i] || (g.flags[i] & (F.PIT | F.STAIR))) continue;
    const head = g.ceil[i] - g.floor[i];
    if (head < 4) { ctx.deco.lightPanel(x + 0.15, z + 0.3, x + 0.85, z + 0.7, g.ceil[i], color, 6.5); continue; }
    hangLight(ctx, x + 0.5, z + 0.5, g.ceil[i], drop ?? Math.max(0.6, Math.min(4, head - 6)), color, 9);
  }
  r.lit = true;
}
// wall lamps (caged bulkhead lights) along the room's edge
function wallLamps(ctx, every = 5, y = 2.4, color = WARM) {
  const { g, deco } = ctx;
  for (const [x, z, d] of edgeCells(ctx)) {
    if (((d < 2 ? z : x) % every) !== 2) continue;
    const i = g.idx(x, z);
    if (g.flags[i] & (F.STAIR | F.PIT | F.DOOR)) continue;
    if (g.ceil[i] - g.floor[i] < y + 0.6) continue;
    deco.wallLight(x, z, d, g.floor[i] + y, color, { radius: 5 });
  }
}
// pipe runs along the room walls at height y (on wall cells that are walls all along)
function wallPipes(ctx, y, r0 = 0.16, n = 2) {
  const { g, deco, room: r } = ctx;
  for (const [z, line] of [[r.z, r.z + 0.25], [r.z + r.h - 1, r.z + r.h - 0.25]]) {
    let run = [];
    const flush = () => { if (run.length >= 3) for (let k = 0; k < n; k++) P.cylH(deco, run[0], run[run.length - 1] + 1, y + k * 0.42, line + (z === r.z ? k * 0.05 : -k * 0.05), r0, true, TS.PIPE); run = []; };
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = g.idx(x, z), wz = z === r.z ? z - 1 : z + 1;
      const solid = !g.type[g.idx(x, wz)] && g.ceil[i] > y + 0.6 && Math.abs(g.floor[i] - r.floor) < 2.5 && !(g.flags[i] & F.DOOR);
      if (solid) run.push(x); else flush();
    }
    flush();
  }
  for (const [x, line] of [[r.x, r.x + 0.25], [r.x + r.w - 1, r.x + r.w - 0.25]]) {
    let run = [];
    const flush = () => { if (run.length >= 3) for (let k = 0; k < n; k++) P.cylH(deco, run[0], run[run.length - 1] + 1, y + k * 0.42, line + (x === r.x ? k * 0.05 : -k * 0.05), r0, false, TS.PIPE); run = []; };
    for (let z = r.z; z < r.z + r.h; z++) {
      const i = g.idx(x, z), wx = x === r.x ? x - 1 : x + 1;
      const solid = !g.type[g.idx(wx, z)] && g.ceil[i] > y + 0.6 && Math.abs(g.floor[i] - r.floor) < 2.5 && !(g.flags[i] & F.DOOR);
      if (solid) run.push(z); else flush();
    }
    flush();
  }
}
// hanging chains (rusty chain role) from the ceiling
function chains(ctx, n) {
  const { g, deco, rng, room: r } = ctx;
  for (let k = 0; k < n * 3 && n > 0; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i]) continue;
    const len = rng.float(1.5, Math.max(2, Math.min(5, g.ceil[i] - g.floor[i] - 3.2)));
    const px = x + rng.float(0.2, 0.8), pz = z + rng.float(0.2, 0.8);
    deco.box(px - 0.06, g.ceil[i] - len, pz - 0.06, px + 0.06, g.ceil[i], pz + 0.06, TS.ACCENT, { faces: FACE.SIDES | FACE.BOTTOM });
    n--;
  }
}
// gallery: a raised steel deck along the frame wall (t in [0, gD)) at height
// y with in-line flights at one or both ends; feet always have an entry cell.
// No rails yet (railAll does every edge once the room is built).
function gallery(ctx, Fr, gD, y, o = {}) {
  const { room: r } = ctx;
  const n = nSteps(y - r.floor);
  const minDeck = o.minDeck ?? 5;
  const freeCol = (s) => s >= 0 && s < Fr.Wd && canUseL(ctx, Fr, 0, s, gD, 1) && okL(ctx, Fr, 0, s, gD, 1);
  const footOK = (s) => groundL(ctx, Fr, 0, s, 2, 1);
  let best = null;
  for (let a = 0; a < Fr.Wd; a++) {
    if (!freeCol(a)) continue;
    let b = a;
    while (b < Fr.Wd && freeCol(b)) b++;
    let aa = a, bb = b;
    if (!footOK(aa - 1)) aa++;
    if (!footOK(bb)) bb--;
    if (bb - aa >= n + minDeck && (!best || bb - aa > best[1] - best[0])) best = [aa, bb];
    a = b;
  }
  if (!best) return null;
  const [a, b] = best;
  const two = o.twoFlights !== false && b - a >= 2 * n + minDeck + 2;
  const f1 = [a, a + n], f2 = two ? [b - n, b] : null;
  const d0 = f1[1], d1 = two ? f2[0] : b;
  const cells = setHeightL(ctx, Fr, 0, d0, gD, d1 - d0, y, { floorTex: o.floorTex ?? TS.GRATE, wallTex: o.sideTex ?? TS.SIDE });
  flightL(ctx, Fr, 0, f1[0], Math.min(2, gD), n, 'lat', r.floor, y);
  if (f2) flightL(ctx, Fr, 0, f2[0], Math.min(2, gD), n, 'latN', r.floor, y);
  useL(ctx, Fr, 0, Math.max(0, a - 1), gD + 1, Math.min(Fr.Wd, b + 1) - Math.max(0, a - 1));
  return { cells, s0: d0, s1: d1, y, gD, n, flights: f2 ? [f1, f2] : [f1], a, b, Fr };
}
// steel posts and a fascia beam on the open face of a raised deck
function deckFace(ctx, G) {
  const { g, deco, room: r } = ctx;
  const { Fr, gD, y } = G;
  for (let s = G.s0; s < G.s1; s++) {
    const j = cellL(ctx, Fr, gD, s);
    if (!g.type[j] || (g.flags[j] & (F.STAIR | F.PIT)) || g.floor[j] > y - 1) continue;
    fbox(deco, Fr, gD, gD + 0.1, s, s + 1, y - 0.42, y - 0.02, TS.BEAM);
    if ((s - G.s0) % 3 === 0 || s === G.s1 - 1) {
      const sp = (s - G.s0) % 3 === 0 ? s + 0.1 : s + 0.72;
      fbox(deco, Fr, gD, gD + 0.22, sp, sp + 0.18, g.floor[j], y - 0.42, TS.BEAM, { faces: FACE.SIDES });
      fcollider(deco, Fr, gD, gD + 0.22, sp, sp + 0.18, g.floor[j], y - 0.42, { obstacle: false });
    }
  }
  void r;
}
// control booth on a gallery deck: glazing on every edge that drops away,
// a roof with a light, consoles facing the windows and a screen wall
function booth(ctx, G, b0, b1) {
  const { g, deco, room: r } = ctx;
  const { Fr, gD, y } = G;
  const cells = new Set(cellsOf(g, ...Fr.rect(0, b0, gD, b1 - b0)));
  // glass on dropping edges, merged per line
  const runs = new Map();
  for (const i of cells) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const j = g.idx(x + DIR_X[d], z + DIR_Z[d]);
      if (cells.has(j) || !g.type[j]) continue;
      if ((g.flags[j] & F.STAIR) || Math.abs(g.floor[j] - y) < 0.05) continue;
      const line = d < 2 ? x + (d === 0 ? 1 : 0) : z + (d === 2 ? 1 : 0);
      const pos = d < 2 ? z : x;
      const key = `${d < 2 ? 'x' : 'z'}|${line}`;
      let a = runs.get(key); if (!a) runs.set(key, (a = []));
      a.push(pos);
    }
  }
  for (const [key, arr] of runs) {
    const [ax, ls] = key.split('|'); const line = +ls;
    arr.sort((p, q) => p - q);
    let s0 = arr[0], prev = arr[0];
    // one framed pane per cell (a stretched picture over a long run reads as a sheet)
    const flush = (p, q) => { for (let k = p; k <= q; k++) { if (ax === 'x') glassWall(ctx, line, k, line, k + 1, y, 2.9); else glassWall(ctx, k, line, k + 1, line, y, 2.9); } };
    for (let k = 1; k < arr.length; k++) { if (arr[k] !== prev + 1) { flush(s0, prev); s0 = arr[k]; } prev = arr[k]; }
    flush(s0, prev);
  }
  for (const i of cells) g.floorTex[i] = TS.FLOOR;
  fbox(deco, Fr, 0, gD, b0, b1, y + 2.9, y + 3.15, { top: TS.METAL, bottom: TS.CEIL, side: TS.METAL });
  const [lx, lz] = Fr.pt(gD / 2, (b0 + b1) / 2);
  deco.box(lx - 0.5, y + 2.84, lz - 0.2, lx + 0.5, y + 2.9, lz + 0.2, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
  deco.light(lx, y + 2.3, lz, [0.8, 0.95, 1], 5);
  // screen wall at the back, consoles on the window row
  fbox(deco, Fr, 0, 0.06, b0 + 0.2, b1 - 0.2, y + 1.1, y + 2.5, TS.SCREEN, { uv: 'fit', emissive: 0.85, faces: FACE.SIDES });
  for (let s = b0; s < b1; s += 2) {
    const [x, z] = Fr.cell(gD - 1, s);
    deco.console(x, z, y, Fr.away);
  }
  return cells;
}

// ======================================================================
// MACHINE HALL (signature): molten vat crossed by catwalks, galleries up
// stairs, a high catwalk, control booth, crane, furnaces, conveyors, hoppers
// ======================================================================
FT.fd_hall = function fdHall(ctx) {
  // galleries with a full deck, then short decks (many exits on the long
  // walls), then the vat, catwalks and machinery without galleries
  for (const o of [{ minDeck: 6 }, { minDeck: 3 }, { noGallery: true }]) {
    if (tryFrames(ctx, sidesLong(ctx, true), (Fr) => buildHall(ctx, Fr, o), null)) return;
  }
  TEMPLATES.industrial(ctx); ctx.room.lit = false;
};
function buildHall(ctx, Fr, o = {}) {
  const { g, deco, rng, room: r } = ctx;
  const v = fv(ctx);
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 15 || Wd < 18) return no(ctx, 'Hall1');
  const top = r.floor + r.ceilH;
  const yG = r.floor + 4.2;
  const gD = o.noGallery ? 0 : L >= 21 ? 3 : 2;
  const galA = o.noGallery ? null : gallery(ctx, Fr, gD, yG, { minDeck: o.minDeck ?? 6 });
  if (!galA && !o.noGallery) return no(ctx, 'Hall2');
  const FrB = frame(r, OPP[Fr.side]);
  const galB = galA && L >= 18 ? gallery(ctx, FrB, gD, yG, { minDeck: o.minDeck ?? 6 }) : null;
  // ---- the vat: inner floor minus a 3-cell ring (and the end zones)
  const sA = Math.max(4, Math.min(9, Math.round(Wd * 0.2))), sB = Wd - sA;
  const tA = gD + 3, tB = L - (galB ? gD : 0) - 3;
  const cand = new Set();
  for (let t = tA; t < tB; t++) for (let s = sA; s < sB; s++) if (okL(ctx, Fr, t, s, 1, 1, 1, 1)) cand.add(cellL(ctx, Fr, t, s));
  const vat = largestBlob(g, openShape(g, cand));
  if (vat.size < 36) return no(ctx, 'Hall3');
  const inVat = (t, s) => t >= 0 && s >= 0 && t < L && s < Wd && vat.has(cellL(ctx, Fr, t, s));
  let vt0 = 1e9, vt1 = -1, vs0 = 1e9, vs1 = -1;
  for (let t = 0; t < L; t++) for (let s = 0; s < Wd; s++) if (inVat(t, s)) { vt0 = Math.min(vt0, t); vt1 = Math.max(vt1, t + 1); vs0 = Math.min(vs0, s); vs1 = Math.max(vs1, s + 1); }
  if (vt1 - vt0 < 4 || vs1 - vs0 < 7) return no(ctx, 'Hall4');
  const kind = vatKind(ctx);
  const depth = kind === 'spikes' ? 3.5 : kind === 'poison' ? 2.6 : 4;
  // ---- high catwalk: gallery to gallery over a notch of the vat, or out to a platform
  const notchOK = (t, s) => { const i = cellL(ctx, Fr, t, s); return !r.reserved.has(i) && flatOpen(ctx, ...Fr.rect(t, s, 1, 1)); };
  const onDeck = (G, s) => s >= G.s0 && s < G.s1;
  let high = null;
  const mid = (vs0 + vs1) / 2;
  const cs = [];
  for (let c = vs0 + 1; c + 3 <= vs1 - 1; c++) cs.push(c);
  cs.sort((p, q) => Math.abs(p + 1 - mid) - Math.abs(q + 1 - mid));
  if (galB) {
    const flightsIn = (lo, hi) => [...galA.flights, ...galB.flights].some(([a, b]) => b <= lo || a >= hi);
    for (const c of cs) {
      if (!(onDeck(galA, c - 1) && onDeck(galA, c + 2) && onDeck(galB, c - 1) && onDeck(galB, c + 2))) continue;
      let okc = true;
      for (let s = c - 1; s < c + 3 && okc; s++) {
        for (let t = gD; t < L - gD && okc; t++) {
          if (t >= vt0 && t < vt1 && inVat(t, s)) continue;
          if (t >= vt0 && t < vt1) okc = false;
          else if (!notchOK(t, s)) okc = false;
        }
      }
      // both halves of the cut ground floor keep a flight up to the decks
      const west = [...galA.flights, ...galB.flights].some(([, b]) => b <= c - 1), east = [...galA.flights, ...galB.flights].some(([a]) => a >= c + 3);
      if (!okc || !west || !east || !flightsIn(c - 1, c + 3)) continue;
      high = { c, cross: true };
      break;
    }
  }
  if (!high && galA) {
    for (const c of cs) {
      if (!(onDeck(galA, c - 1) && onDeck(galA, c + 2))) continue;
      const tP = tA + 1;
      let okc = true;
      for (let s = c - 1; s < c + 3 && okc; s++) for (let t = gD; t < tA; t++) if (!notchOK(t, s)) { okc = false; break; }
      for (let s = c - 2; s < c + 4 && okc; s++) for (let t = tA; t < tP + 4; t++) if (!inVat(t, s)) { okc = false; break; }
      if (!okc) continue;
      high = { c, cross: false, tP };
      break;
    }
  }
  const pitCells = new Set(vat);
  if (high) for (let s = high.c - 1; s < high.c + 3; s++) {
    for (let t = gD; t < tA; t++) pitCells.add(cellL(ctx, Fr, t, s));
    if (high.cross) for (let t = tB; t < L - gD; t++) pitCells.add(cellL(ctx, Fr, t, s));
  }
  pitSet(ctx, [...pitCells], kind, depth);
  for (const i of pitCells) ctx.used.add(i);
  const highCells = new Set();
  if (high) {
    const t1 = high.cross ? L - gD : high.tP;
    for (const i of cellsOf(g, ...Fr.rect(gD, high.c, t1 - gD, 2))) highCells.add(i);
    if (!high.cross) for (const i of cellsOf(g, ...Fr.rect(high.tP, high.c - 1, 3, 4))) highCells.add(i);
    for (const i of highCells) { const x = i % g.w, z = (i / g.w) | 0; deckBridge(ctx, x, z, 1, 1, yG); }
    // hangers from the roof truss and a hoist rail over it
    for (const t of [gD + 2, Math.floor((gD + t1) / 2), t1 - 2]) {
      if (t <= gD || t >= t1) continue;
      for (const s of [high.c + 0.05, high.c + 1.9]) fbox(deco, Fr, t + 0.45, t + 0.55, s, s + 0.05, yG + 1.1, top, TS.METAL, { faces: FACE.SIDES });
    }
  }
  // ---- low catwalks across the vat (ground level), clear of the high one
  const lowCells = new Set();
  const nearHigh = (s) => high && s >= high.c - 2 && s < high.c + 4;
  const tryLowT = (s) => {
    if (nearHigh(s) || nearHigh(s + 1)) return false;
    const run = [];
    for (let t = vt0; t < vt1; t++) {
      const a = inVat(t, s), b = inVat(t, s + 1);
      if (a && b) run.push(t); else if (a || b) return false;
    }
    if (!run.length) return false;
    const t0 = run[0], t1 = run[run.length - 1] + 1;
    if (!groundL(ctx, Fr, t0 - 1, s, 1, 2) || !groundL(ctx, Fr, t1, s, 1, 2)) return false;
    for (let t = t0; t < t1; t++) if (!inVat(t, s) || !inVat(t, s + 1)) return false;
    for (const i of cellsOf(g, ...Fr.rect(t0, s, t1 - t0, 2))) { if (highCells.has(i)) return false; }
    for (const i of cellsOf(g, ...Fr.rect(t0, s, t1 - t0, 2))) { const x = i % g.w, z = (i / g.w) | 0; for (const j of deckBridge(ctx, x, z, 1, 1, r.floor)) lowCells.add(j); }
    return true;
  };
  const tryLowS = (t) => {
    const run = [];
    for (let s = vs0; s < vs1; s++) {
      const a = inVat(t, s), b = inVat(t + 1, s);
      if (a && b) run.push(s); else if (a || b) return false;
    }
    if (run.length < 3) return false;
    const s0 = run[0], s1 = run[run.length - 1] + 1;
    if (!groundL(ctx, Fr, t, s0 - 1, 2, 1) || !groundL(ctx, Fr, t, s1, 2, 1)) return false;
    // keep a pit cell between this and the high catwalk / platform
    for (const i of cellsOf(g, ...Fr.rect(t - 1, s0, 4, s1 - s0))) if (highCells.has(i)) return false;
    for (const i of cellsOf(g, ...Fr.rect(t, s0, 2, s1 - s0))) { const x = i % g.w, z = (i / g.w) | 0; for (const j of deckBridge(ctx, x, z, 1, 1, r.floor)) lowCells.add(j); }
    return true;
  };
  let lows = 0;
  if (!high || !high.cross) {
    const mt = Math.floor((vt0 + vt1) / 2) - 1;
    for (const t of [mt, mt + 1, mt - 1, mt + 2]) if (tryLowS(t)) { lows++; break; }
  }
  const spots = [];
  for (let s = vs0 + 1; s + 2 <= vs1 - 1; s++) spots.push(s);
  rng.shuffle(spots);
  const usedS = [];
  for (const s of spots) {
    if (lows >= (high && high.cross ? 2 : 2)) break;
    if (usedS.some((u) => Math.abs(u - s) < 5)) continue;
    if (tryLowT(s)) { lows++; usedS.push(s); }
  }
  if (!lows && !high) return no(ctx, 'Hall15');
  // ---- control booth on gallery B (or A), next to a flight top
  let boothCells = null;
  for (const G of [galB, galA].filter(Boolean)) {
    if (boothCells) break;
    const bw = G.s1 - G.s0 >= 12 ? 5 : 4;
    const clash = (b0, b1) => high && b0 < high.c + 4 && b1 > high.c - 2;
    for (const [b0, b1] of [[G.s0, G.s0 + bw], [G.s1 - bw, G.s1]]) {
      if (b1 - b0 < 4 || b0 < G.s0 || b1 > G.s1 || clash(b0, b1)) continue;
      if (G.s1 - G.s0 - bw < 3 && G.flights.length < 2) continue;   // the rest of the deck must stay usable
      boothCells = booth(ctx, G, b0, b1);
      break;
    }
  }
  // ---- rails, hazard lines, gallery faces
  railAll(ctx, boothCells);
  const pitNow = [...pitCells].filter((i) => g.flags[i] & (F.PIT | F.HAZARD));
  hazardLines(ctx, pitNow);
  if (galA) deckFace(ctx, galA);
  if (galB) deckFace(ctx, galB);
  // pipes and conduits down the vat walls, a glow from below
  let pk = 0;
  for (const i of pitNow) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const j = g.idx(x + DIR_X[d], z + DIR_Z[d]);
      if (pitCells.has(j) || !g.type[j] || Math.abs(g.floor[j] - r.floor) > 0.01 || (g.flags[j] & F.BRIDGE) || (pk++ % 6)) continue;
      const px = x + 0.5 + DIR_X[d] * 0.4, pz = z + 0.5 + DIR_Z[d] * 0.4;
      deco.box(px - 0.1, r.floor - depth, pz - 0.1, px + 0.1, r.floor - 0.15, pz + 0.1, TS.PIPE);
    }
  }
  // ---- the vat's contents: gears in the gear pit, a ladle over the molten metal
  const [wx0, wz0, wW, wH] = Fr.rect(vt0, vs0, vt1 - vt0, vs1 - vs0);
  if (kind === 'spikes') { sparseSpikes(ctx, pitCells); gearPit(ctx, Fr, inVat, pitCells, vt0, vt1, vs0, vs1, r.floor - depth, highCells, lowCells); }
  // ---- crane over the vat (clear of the high catwalk), a second one parked
  const yRail = top - 2.3;
  let sc = Math.round(mid);
  if (high) { const cands = [vs0 + 2, vs1 - 3, Math.round(mid)].filter((s) => s > vs0 && s < vs1 - 1 && (s < high.c - 2 || s > high.c + 3)); if (cands.length) sc = cands.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid))[0]; }
  const tt = (vt0 + vt1) / 2;
  const overLow = cellsOf(g, ...Fr.rect(Math.floor(tt) - 1, sc - 1, 3, 3)).some((i) => lowCells.has(i) || highCells.has(i));
  const load = v === 'clock' ? 'gear' : v === 'meat' ? 'hook' : 'ladle';
  crane(ctx, Fr, sc + 0.5, tt, yRail, load, overLow ? yG + 4.5 : r.floor + (load === 'ladle' ? 4.1 : 3.4));
  const sPark = rng.chance(0.5) ? Math.max(1.5, sA / 2) : Math.min(Wd - 1.5, Wd - sA / 2);
  P.crane(ctx, Fr, 0, Wd, yRail, sPark, L * rng.float(0.3, 0.7), { rails: false, load: 'beams', yLoad: top - 4.5, cabAtEnd: true });
  // ---- end zones: furnaces on the end walls, conveyor lines under hoppers, stock
  const ends = Fr.side < 2 ? [3, 2] : [1, 0];
  for (const es of ends) {
    const FE = frame(r, es);
    endWallFurnaces(ctx, FE, v === 'meat');
    endZoneLine(ctx, FE, Math.min(sA, Wd - sB), v);
  }
  // stock and machines on the remaining floor
  dressFloor(ctx, v, 0.6);
  // ---- walls and ceiling: clerestory windows, pipes, chains, lamps
  upperWindows(ctx, top - 3.4, top - 1.7, 3);
  wallPipes(ctx, yG + 3.4, 0.18, 2);
  if (v === 'hell' || v === 'clock') chains(ctx, 6);
  if (v === 'meat') hallHooks(ctx, Fr);
  for (const G of [galA, galB]) {
    if (!G) continue;
    for (let s = G.s0 + 1; s < G.s1; s += 4) {
      const [x, z] = G.Fr.cell(0, s);
      const i = g.idx(x, z);
      if (boothCells && boothCells.has(i)) continue;
      deco.wallLight(x, z, G.Fr.toward, yG + 2.2, WARM, { radius: 5 });
    }
  }
  highBay(ctx, 6, v === 'meat' ? [0.9, 0.95, 1] : SODIUM);
  void wx0; void wz0; void wW; void wH; void FIRE; void COLD;
  return true;
}
// overhead crane over a frame with a load hanging at yLoad (cable bottom)
function crane(ctx, Fr, sc, tt, yRail, load, yLoad) {
  P.crane(ctx, Fr, 0, Fr.Wd, yRail, sc, tt, { load, yLoad });
}
// a gear pit is mostly bare machine floor with clusters of spikes between the
// wheels (a deep pit all the same: falling in still needs a rescue); keeps
// the spike mesh affordable
function sparseSpikes(ctx, cells, frac = 0.22) {
  const { g } = ctx;
  for (const i of cells) {
    if (g.hazType[i] !== HAZ.SPIKES || (g.flags[i] & F.BRIDGE)) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    const hsh = ((x * 73856093) ^ (z * 19349663)) >>> 0;
    if ((hsh % 1000) / 1000 < frac) continue;
    g.hazType[i] = HAZ.NONE;
    g.flags[i] &= ~F.HAZARD;
  }
}
// giant gear wheels standing in / lying in the gear pit, clear of the catwalks
function gearPit(ctx, Fr, inVat, pitCells, vt0, vt1, vs0, vs1, pitY, highCells, lowCells) {
  const { g, deco, rng } = ctx;
  const clearAround = (t0, t1, s0, s1) => {
    for (let t = Math.floor(t0) - 1; t <= Math.ceil(t1); t++) for (let s = Math.floor(s0) - 1; s <= Math.ceil(s1); s++) {
      if (!inVat(t, s)) return false;
      const i = cellL(ctx, Fr, t, s);
      if (highCells.has(i) || lowCells.has(i) || !(g.flags[i] & F.PIT)) return false;
    }
    return true;
  };
  let placed = 0;
  // standing gears: disc along s, thin in t
  for (let k = 0; k < 12 && placed < 3; k++) {
    const R = rng.pick([1.6, 2.0, 2.4]);
    const t = rng.int(vt0 + 1, vt1 - 2) + 0.5, s = rng.float(vs0 + R + 0.6, vs1 - R - 0.6);
    if (!clearAround(t - 0.5, t + 0.5, s - R - 0.4, s + R + 0.4)) continue;
    const [cx, cz] = Fr.pt(t, s);
    const plane = Fr.lat >= 2 ? 'z' : 'x';
    P.gear(deco, cx, pitY + R + 0.25, cz, R, plane, 0.35, TS.PANEL, { axle: 0.8, phase: rng.float(0, 1) });
    placed++;
  }
  // flat gears on the pit floor
  for (let k = 0; k < 10; k++) {
    const R = rng.pick([1.2, 1.6]);
    const t = rng.float(vt0 + R + 0.5, vt1 - R - 0.5), s = rng.float(vs0 + R + 0.5, vs1 - R - 0.5);
    if (!clearAround(t - R, t + R, s - R, s + R)) continue;
    const [cx, cz] = Fr.pt(t, s);
    P.gear(deco, cx, pitY + 0.55, cz, R, 'y', 0.25, TS.PANEL, { phase: rng.float(0, 1) });
    if (++placed >= 5) break;
  }
  void pitCells;
}
// furnaces along an end wall frame (t = 0) where the wall is free of exits
function endWallFurnaces(ctx, FE, cold, max = 3) {
  const { room: r } = ctx;
  let placed = 0;
  for (let s = 1; s + 3 <= FE.Wd - 1 && placed < max; s++) {
    if (!(canUseL(ctx, FE, 0, s, 3, 3, 0, 1) && okL(ctx, FE, 0, s, 3, 3))) continue;
    // the cell in front of the furnace must stay walkable ground
    if (!groundL(ctx, FE, 3, s, 1, 3)) continue;
    P.furnace(ctx, FE, s, 3, r.floor, { cold, h: cold ? 2.8 : 3.4 });
    useL(ctx, FE, 0, s, 3, 3);
    placed++;
    s += 3;
  }
  return placed;
}
// a conveyor line under a hopper in the end zone in front of an end wall
function endZoneLine(ctx, FE, zone, v) {
  const { g, room: r } = ctx;
  if (zone < 5) return false;
  const m = freeMask(ctx, FE, 1);
  const rect = bestRect(m, { t0: 2, t1: Math.min(FE.L, zone), minT: 3, maxT: 3, minS: 6, maxS: 12, score: (t, s, dt, ds) => ds * 10 - Math.abs(s + ds / 2 - FE.Wd / 2) });
  if (!rect) return false;
  const tm = rect.t + 1;
  const [x0, z0, w, h] = FE.rect(tm + 0.05, rect.s + 0.3, 0.9, rect.ds - 0.6);
  const items = v === 'meat' ? 'meat' : v === 'clock' ? 'gears' : rng01(ctx) < 0.5 ? 'glow' : 'ore';
  P.conveyor(ctx, x0, z0, x0 + w, z0 + h, r.floor, { items, motorAt: 'start' });
  // hopper over the start of the belt
  const [hx, hz] = FE.pt(tm + 0.5, rect.s + 1.4);
  const ci = g.idx(Math.floor(hx), Math.floor(hz));
  if (g.ceil[ci] - r.floor > 6.5) P.hopper(ctx, hx, hz, r.floor + 2.1, 1.7, { floorY: r.floor, chuteTo: r.floor + 0.9, fill: v === 'meat' ? TS.WALL2 : TS.ROCK });
  useL(ctx, FE, rect.t, rect.s, rect.dt, rect.ds);
  return true;
}
const rng01 = (ctx) => ctx.rng.next();
// stock on free floor: ingot stacks, pallets, drums, machine blocks on walls
function dressFloor(ctx, v, density = 0.5) {
  const { g, rng, room: r } = ctx;
  const n = Math.floor(r.area / 70 * density) + 1;
  let placed = 0;
  for (let k = 0; k < n * 6 && placed < n; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
    if (!ok(ctx, x, z, 2, 2, 0, 1)) continue;
    // keep away from the room's middle lanes next to pits / exits
    let near = false;
    for (const i of cellsOf(g, x - 1, z - 1, 4, 4)) if (g.flags[i] & (F.PIT | F.STAIR | F.BRIDGE | F.HAZARD) || r.reserved.has(i)) near = true;
    if (near) continue;
    const roll = rng.next();
    const cx = x + 1, cz = z + 1;
    if (v === 'meat') { if (roll < 0.5) P.pallet(ctx, cx, cz, r.floor, 'crates'); else P.drum(ctx, cx - 0.4, cz - 0.3, r.floor), P.drum(ctx, cx + 0.3, cz + 0.2, r.floor); }
    else if (roll < 0.4) P.ingotStack(ctx, cx, cz, r.floor, rng.int(3, 5), { tex: v === 'clock' ? TS.PANEL : TS.METAL });
    else if (roll < 0.65) P.pallet(ctx, cx, cz, r.floor, rng.pick(['crates', 'sacks', 'drums']));
    else if (roll < 0.85) P.heap(ctx, cx, cz, r.floor, 0.95, 0.95, rng.float(0.7, 1.1), v === 'volcano' || v === 'hell' ? TS.ROCK : TS.GROUND);
    else { P.drum(ctx, cx - 0.4, cz - 0.3, r.floor); P.drum(ctx, cx + 0.35, cz + 0.25, r.floor); }
    use(ctx, x, z, 2, 2);
    placed++;
  }
  // machinery against free walls
  let mb = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (mb >= Math.floor((r.w + r.h) / 10)) break;
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (rng.chance(0.6)) machineBlock(ctx, x, z, d, r.floor, rng.pick([1.6, 2.2, 2.6]), 0.8);
    else cabinet(ctx, x, z, d, r.floor, 2.0, 0.6, TS.MACHINE);
    use(ctx, x, z, 1, 1);
    mb++;
  }
}

// overhead hook rail on ceiling rods from (x0,z0) to (x1,z1) (axis aligned) at
// height y, with carcasses hanging from it (meat plant)
function hookRail(ctx, x0, z0, x1, z1, y, o = {}) {
  const { deco, g, rng } = ctx;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const at = (u) => (alongX ? [a0 + u, z0] : [x0, a0 + u]);
  if (alongX) deco.box(a0, y, z0 - 0.05, a0 + len, y + 0.12, z0 + 0.05, TS.METAL);
  else deco.box(x0 - 0.05, y, a0, x0 + 0.05, y + 0.12, a0 + len, TS.METAL);
  for (let u = 0.4; u < len; u += 2.5) {
    const [px, pz] = at(u);
    const ci = g.idx(Math.floor(px), Math.floor(pz));
    if (g.type[ci] && !g.sky[ci] && g.ceil[ci] > y + 0.3) deco.box(px - 0.03, y + 0.12, pz - 0.03, px + 0.03, g.ceil[ci], pz + 0.03, TS.METAL, { faces: FACE.SIDES });
  }
  if (o.carcasses === false) return;
  for (let u = 0.5 + rng.float(0, 0.4); u < len - 0.4; u += rng.float(o.gapMin ?? 0.9, o.gapMax ?? 1.6)) {
    if (rng.chance(o.empty ?? 0.18)) continue;
    const [px, pz] = at(u);
    P.carcass(ctx, px, pz, y, alongX);
  }
}
// meat plant machine hall: hook rails across the end zones (clear of machines)
function hallHooks(ctx, Fr) {
  const { g, room: r } = ctx;
  for (const s of [1, Fr.Wd - 2]) {
    let run = [];
    const flush = () => {
      if (run.length >= 4) { const [ax, az] = Fr.pt(run[0], s + 0.5), [bx, bz] = Fr.pt(run[run.length - 1] + 1, s + 0.5); hookRail(ctx, ax, az, bx, bz, r.floor + 3.7); }
      run = [];
    };
    for (let t = 1; t < Fr.L - 1; t++) {
      const i = cellL(ctx, Fr, t, s);
      const okc = g.type[i] && Math.abs(g.floor[i] - r.floor) < 0.01 && !(g.flags[i] & (F.OBSTACLE | F.STAIR | F.PIT)) && g.ceil[i] > r.floor + 5;
      if (okc) run.push(t); else flush();
    }
    flush();
  }
}

// ======================================================================
// ENTRY (start): the shift house by the plant gate - a glazed foreman's
// office in a corner, locker runs with benches in front of them, the time
// clock and card rack by the way in, a water cooler and a vending machine
// ======================================================================
FT.fd_entry = function fdEntry(ctx) {
  tryFrames(ctx, sidesLong(ctx, true), (Fr, last) => buildEntry(ctx, Fr, last), (c) => entrySimple(c));
};
// the start cell (room centre) and its ring stay clear
function keepStartClear(ctx) {
  const { room: r } = ctx;
  use(ctx, Math.floor(r.x + r.w / 2) - 1, Math.floor(r.z + r.h / 2) - 1, 3, 3);
}
function buildEntry(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 6 || Wd < 7) return no(ctx, 'Entry1');
  keepStartClear(ctx);
  const y = r.floor;
  // ---- the foreman's office: a glass box in a corner of the frame wall
  const oD = L >= 10 ? 4 : 3, oW = Wd >= 14 ? 5 : 4;
  let office = null;
  for (const s0 of Wd >= 9 && L >= 7 ? rng.shuffle([0, Wd - oW]) : []) {
    if (!okL(ctx, Fr, 0, s0, oD + 1, oW, 0, 0)) continue;
    const sIn = s0 === 0 ? oW : s0;                     // the glazed side line (s)
    if (!okL(ctx, Fr, 0, s0 === 0 ? oW : s0 - 1, oD + 1, 1, 0, 0)) continue;
    office = { s0, sIn };
    break;
  }
  if (!office && !last) return no(ctx, 'Entry2');
  if (office) entryOffice(ctx, Fr, office.s0, office.sIn, oD, oW);
  // ---- lockers along the opposite wall in runs, benches in front
  const FrO = frame(r, OPP[Fr.side]);
  const runs = [];
  let a = -1;
  for (let s = 0; s <= Wd; s++) {
    const fine = s < Wd && okL(ctx, FrO, 0, s, 2, 1, 0, 0);
    if (fine && a < 0) a = s;
    if (!fine && a >= 0) { if (s - a >= 3) runs.push([a, s]); a = -1; }
  }
  let nLock = 0;
  for (const [ra, rb] of runs) {
    const a0 = ra + (rb - ra > 4 ? 1 : 0), b0 = Math.min(rb, a0 + 7);
    for (let s = a0; s < b0; s++) {
      const [x, z] = FrO.cell(0, s);
      P.lockers(ctx, x, z, FrO.toward, y, 1);
      nLock++;
    }
    // the bench: a row of slats 1.2 off the lockers, a gap every 3 cells
    for (let s = a0; s + 2 <= b0; s += 3) {
      const [bx0, bz0, bw, bh] = FrO.rect(1.25, s + 0.15, 0.4, 1.7);
      P.bench(ctx, bx0, bz0, bx0 + bw, bz0 + bh, y);
    }
    useL(ctx, FrO, 0, a0, 2, b0 - a0);
  }
  if (!nLock) return no(ctx, 'Entry3');
  // ---- time clock + card racks by an exit, a notice board, vending / water cooler
  const spots = rng.shuffle(wallSpots(ctx).filter(([x, z]) => canUse(ctx, x, z, 1, 1, 0, 0)));
  const nearExit = (x, z) => r.exits.some((e) => { const c = e.conn; const ex = c.axis === 'x' ? e.firstIn : c.pos, ez = c.axis === 'x' ? c.pos : e.firstIn; return Math.abs(ex - x) + Math.abs(ez - z) <= 4; });
  spots.sort((p, q) => (nearExit(q[0], q[1]) ? 1 : 0) - (nearExit(p[0], p[1]) ? 1 : 0));
  let placed = 0;
  for (const [x, z, d] of spots) {
    if (placed >= 4) break;
    if (!canUse(ctx, x, z, 1, 1, 0, 0)) continue;
    if (placed === 0) {
      // time clock with a card rack either side
      wallBox(ctx, x, z, d, 0.18, y + 1.25, y + 1.75, faced(OPP[d], TS.MACHINE, TS.METAL), { uv: 'fit', inset: 0.32 });
      wallBox(ctx, x, z, d, 0.06, y + 0.9, y + 2.0, TS.CRATE, { uv: 'fit', inset: 0.05 });
    } else if (placed === 1) {
      // vending machine: a steel cabinet with a lit front
      wallBox(ctx, x, z, d, 0.75, y, y + 1.95, TS.METAL, { inset: 0.12, solid: true });
      wallBoxR(ctx, x, z, d, 0.75, 0.78, y + 0.5, y + 1.8, TS.SCREEN, { uv: 'fit', inset: 0.2, emissive: 0.6 });
    } else if (placed === 2) {
      // water cooler: a cabinet with a bottle on top
      const px = x + 0.5 + DIR_X[d] * 0.2, pz = z + 0.5 + DIR_Z[d] * 0.2;
      deco.box(px - 0.22, y, pz - 0.22, px + 0.22, y + 0.95, pz + 0.22, TS.METAL, { solid: true });
      P.cylV(deco, px, pz, y + 0.95, y + 1.45, 0.17, TS.GLASS, { emissive: 0.2 });
    } else {
      // notice board
      wallBox(ctx, x, z, d, 0.05, y + 1.1, y + 2.1, TS.WOOD, { inset: 0.08 });
      wallBox(ctx, x, z, d, 0.07, y + 1.25, y + 1.95, TS.SCREEN, { uv: 'fit', inset: 0.2, emissive: 0.3 });
    }
    use(ctx, x, z, 1, 1);
    placed++;
  }
  entryLines(ctx);
  wallLamps(ctx, 4, 2.4, WARM);
  highBay(ctx, 4, [0.95, 0.97, 1]);
  return true;
}
// the foreman's office: glazing on the room sides, a doorway, desk, chair, cabinets, roof
function entryOffice(ctx, Fr, s0, sIn, oD, oW) {
  const { g, deco, room: r } = ctx;
  const Wd = Fr.Wd, y = r.floor;
  const office = { s0, sIn };
  const corner = s0 === 0 ? 0 : 1;                      // 0: office at s = 0 side
  // front glazing on t = oD with a 2-cell doorway at the end away from the corner
  const sd = corner === 0 ? oW - 2 : s0;
  glassLineL(ctx, Fr, oD, s0, s0 + oW, y, 3.0, [[sd, sd + 2]]);
  doorLeafL(ctx, Fr, oD, corner === 0 ? sd - 1 : sd + 2, corner === 0 ? sd : sd + 3, y, 1);
  // side glazing along s = office.sIn for t in [0, oD)
  {
    const [ax, az] = Fr.pt(0, office.sIn), [bx, bz] = Fr.pt(oD, office.sIn);
    glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, 3.0);
  }
  useL(ctx, Fr, 0, s0, oD + 1, oW);
  for (const i of cellsOf(g, ...Fr.rect(0, s0, oD, oW))) g.floorTex[i] = TS.WOOD;
  // inside: the desk along the back wall with a monitor, filing cabinets, a chair
  const dA = corner === 0 ? 0.3 : s0 + oW - 2.6, dB = dA + 2.3;
  fbox(deco, Fr, 0.05, 0.8, dA, dB, y, y + 0.76, faced(Fr.away, TS.PANEL, TS.METAL, TS.WOOD), { solid: true });
  const [mx, mz] = Fr.pt(0.35, dA + 0.8);
  monitor(ctx, mx, mz, y + 0.76, Fr.away);
  fbox(deco, Fr, 0.15, 0.55, dA + 1.5, dB - 0.2, y + 0.76, y + 0.8, TS.CRATE, { uv: 'fit' });
  fbox(deco, Fr, 1.2, 1.65, dA + 0.6, dA + 1.05, y, y + 0.48, TS.METAL);
  fbox(deco, Fr, 1.55, 1.65, dA + 0.6, dA + 1.05, y + 0.48, y + 1.05, TS.METAL);
  // filing cabinets against the solid side wall
  const cabS = corner === 0 ? 0 : Wd - 1;
  for (let t = 1; t < oD; t++) {
    const [cx, cz] = Fr.cell(t, cabS);
    cabinet(ctx, cx, cz, corner === 0 ? Fr.latN : Fr.lat, y, 1.4, 0.55, TS.MACHINE);
  }
  // a plan of the plant pinned on the office wall; the office roof with a light panel under it
  fbox(deco, Fr, 0, 0.04, dA + 0.2, dB - 0.2, y + 1.3, y + 2.2, TS.SCREEN, { uv: 'fit', emissive: 0.5, faces: FACE.SIDES });
  if (r.ceilH > 3.6) fbox(deco, Fr, 0, oD + 0.07, s0, s0 + oW, y + 3.0, y + 3.15, { top: TS.METAL, bottom: TS.CEIL, side: TS.METAL });
  const [lx0, lz0, lw, lh] = Fr.rect(oD / 2 - 0.6, s0 + oW / 2 - 0.8, 1.2, 1.6);
  deco.lightPanel(lx0, lz0, lx0 + lw, lz0 + lh, Math.min(y + 3.0, r.floor + r.ceilH), [0.85, 0.95, 1], 5);
}
// safety walkway lines toward the exits
function entryLines(ctx) {
  const { g, room: r } = ctx;
  for (const e of r.exits) {
    const c = e.conn;
    for (let k = 0; k < c.width; k++) {
      const a = e.firstIn, b = c.pos + k;
      const x = c.axis === 'x' ? a : b, z = c.axis === 'x' ? b : a;
      if (g.in(x, z) && g.type[g.idx(x, z)] && !(g.flags[g.idx(x, z)] & F.STAIR)) paint(ctx, x + 0.42, z + 0.42, x + 0.58, z + 0.58, g.floor[g.idx(x, z)]);
    }
  }
}
// a box against the wall of cell (x, z) on side d (dir to the wall) from depth d0 to d1 off it
function wallBoxR(ctx, x, z, d, d0, d1, y0, y1, tex, o = {}) {
  const ins = o.inset ?? 0.04;
  const x0 = d === 0 ? x + 1 - d1 : d === 1 ? x + d0 : x + ins, x1 = d === 0 ? x + 1 - d0 : d === 1 ? x + d1 : x + 1 - ins;
  const z0 = d === 2 ? z + 1 - d1 : d === 3 ? z + d0 : z + ins, z1 = d === 2 ? z + 1 - d0 : d === 3 ? z + d1 : z + 1 - ins;
  return ctx.deco.box(x0, y0, z0, x1, y1, z1, tex, o);
}
// fallback: lockers on free wall cells, two benches, a time clock
function entrySimple(ctx) {
  const { rng, room: r } = ctx;
  ctx.used = new Set();
  keepStartClear(ctx);
  let lk = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (lk >= Math.max(3, Math.floor((r.w + r.h) / 3))) break;
    if (!canUse(ctx, x, z, 1, 1, 0, 0)) continue;
    P.lockers(ctx, x, z, d, r.floor, 1);
    use(ctx, x, z, 1, 1);
    lk++;
  }
  const cx = Math.floor(r.x + r.w / 2), cz = Math.floor(r.z + r.h / 2);
  for (const [bx, bz] of [[cx - 2, cz + 2], [cx + 1, cz - 3]]) {
    if (ok(ctx, bx, bz, 2, 1, 0, 1)) { P.bench(ctx, bx + 0.1, bz + 0.3, bx + 1.9, bz + 0.7, r.floor); use(ctx, bx, bz, 2, 1); }
  }
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 4)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0)) continue;
    wallBox(ctx, x, z, d, 0.12, r.floor + 1.2, r.floor + 1.7, faced(OPP[d], TS.MACHINE, TS.METAL), { uv: 'fit', inset: 0.3 });
    use(ctx, x, z, 1, 1);
    break;
  }
  entryLines(ctx);
  wallLamps(ctx, 4, 2.4, WARM);
  highBay(ctx, 4, [0.95, 0.97, 1]);
}

// ======================================================================
// YARD (open air): cooling towers, stacks, tanks, ore carts, slag heaps
// ======================================================================
FT.fd_yard = function fdYard(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const v = fv(ctx);
  ctx.used = new Set();
  for (const i of ctx.cells) { g.flags[i] |= F.OUTDOOR; g.floorTex[i] = TS.SIDEWALK; }
  const Fr = frame(r, r.w >= r.h ? 3 : 1);           // s along the yard's long axis
  const L = Fr.L, Wd = Fr.Wd;
  // volcano base: a lava channel runs in from one end of the yard to a sump
  if (v === 'volcano' && Wd >= 14 && L >= 10) {
    const len = Math.min(Wd - 5, Math.max(6, Math.round(Wd * 0.55)));
    for (const tc of [Math.floor(L / 2) - 1, Math.floor(L / 2), Math.floor(L / 2) - 2]) {
      const fromEnd = rng.chance(0.5);
      const s0 = fromEnd ? Wd - len : 0;
      if (!okL(ctx, Fr, tc - 1, s0, 4, len, 0, 0) || !canUseL(ctx, Fr, tc - 1, s0, 4, len, 1, 0)) continue;
      const cells = cellsOf(g, ...Fr.rect(tc, s0, 2, len));
      pitSet(ctx, cells, 'lava', 2.0);
      for (const i of cells) ctx.used.add(i);
      useL(ctx, Fr, tc - 1, s0, 4, len);
      const bs = s0 + Math.floor(len / 2) - 1;
      for (const i of cellsOf(g, ...Fr.rect(tc, bs, 2, 2))) { const x = i % g.w, z = (i / g.w) | 0; deckBridge(ctx, x, z, 1, 1, r.floor); }
      breachWall(g, deco, rng, r, { Fr: frame(r, fromEnd ? (Fr.side < 2 ? 2 : 0) : (Fr.side < 2 ? 3 : 1)), s0: tc - 2, s1: tc + 4, big: true });
      break;
    }
  }
  // the big structures, pushed toward the walls: cooling tower, stacks, tanks
  const m = freeMask(ctx, Fr, 1);
  const edgeScore = (t, s, dt, ds) => dt * ds * 4 - Math.min(t, L - t - dt) * 3 - Math.min(s, Wd - s - ds);
  const place = (minSz, maxSz) => {
    const rc = bestRect(m, { minT: minSz, maxT: maxSz, minS: minSz, maxS: maxSz, score: (t, s, dt, ds) => (dt === ds ? edgeScore(t, s, dt, ds) : -1e9) });
    if (!rc || rc.dt !== rc.ds) return null;
    markMask(m, rc.t, rc.s, rc.dt, rc.ds, 1);
    useL(ctx, Fr, rc.t, rc.s, rc.dt, rc.ds);
    const [cx, cz] = Fr.pt(rc.t + rc.dt / 2, rc.s + rc.ds / 2);
    return { cx, cz, sz: rc.dt };
  };
  if (v !== 'meat') {
    const c = place(5, 7);
    if (c) P.coolingTower(ctx, c.cx, c.cz, r.floor, c.sz / 2 - 0.25, c.sz >= 6 ? rng.pick([13, 15, 17]) : rng.pick([11, 12]));
  }
  for (let k = 0; k < (v === 'meat' ? 3 : 2); k++) {
    const c = place(4, 4);
    if (c) P.storageTank(ctx, c.cx, c.cz, r.floor, rng.pick([1.4, 1.6]), rng.pick([4.5, 5.5, 6.5]), { face: Fr.away });
  }
  for (let k = 0; k < 2; k++) {
    const c = place(2, 3);
    if (c) P.stack(ctx, c.cx, c.cz, r.floor, c.sz >= 3 ? 0.9 : 0.6, rng.pick([16, 19, 23]), { glow: v !== 'meat' });
  }
  // a rail track with ore carts along the long axis
  for (const off of [Math.floor(L / 2), Math.floor(L / 2) - 2, Math.floor(L / 2) + 2, 2, L - 3]) {
    if (off < 1 || off > L - 2) continue;
    const cells = cellsOf(g, ...Fr.rect(off, 0, 1, Wd));
    if (cells.some((i) => ctx.used.has(i) || !g.type[i] || (g.flags[i] & (F.PIT | F.STAIR | F.BRIDGE)))) continue;
    for (let s = 0; s < Wd; s++) {
      const i = cellL(ctx, Fr, off, s);
      if (Math.abs(g.floor[i] - r.floor) > 0.01) continue;
      for (const u of [0.1, 0.6]) fbox(deco, Fr, off + 0.05, off + 0.95, s + u, s + u + 0.25, r.floor, r.floor + 0.05, TS.WOOD, { faces: FACE.TOP | FACE.SIDES });
      for (const b of [0.22, 0.72]) fbox(deco, Fr, off + b, off + b + 0.06, s, s + 1, r.floor + 0.05, r.floor + 0.11, TS.METAL, { faces: FACE.TOP | FACE.SIDES });
      g.floorTex[i] = TS.GROUND;
    }
    for (let s = 2; s < Wd - 3; s += rng.int(4, 7)) {
      if (!okL(ctx, Fr, off, s, 1, 2, 0, 0)) continue;
      fbox(deco, Fr, off + 0.1, off + 0.9, s + 0.1, s + 1.9, r.floor + 0.25, r.floor + 1.05, TS.METAL, { solid: true });
      fbox(deco, Fr, off + 0.18, off + 0.82, s + 0.18, s + 1.82, r.floor + 1.05, r.floor + 1.3, v === 'meat' ? TS.WALL2 : TS.ROCK);
      for (const [tw, sw] of [[0.02, 0.3], [0.02, 1.4], [0.84, 0.3], [0.84, 1.4]]) fbox(deco, Fr, off + tw, off + tw + 0.14, s + sw, s + sw + 0.3, r.floor + 0.05, r.floor + 0.35, TS.METAL, { lightMul: 0.4 });
      useL(ctx, Fr, off, s, 1, 2);
    }
    useL(ctx, Fr, off, 0, 1, Wd);
    break;
  }
  // slag / ore heaps and pallets
  for (let k = 0; k < Math.floor(r.area / 55); k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 4), z = rng.int(r.z + 1, r.z + r.h - 4);
    if (!ok(ctx, x, z, 3, 3, 0, 1)) continue;
    let near = false;
    for (const i of cellsOf(g, x - 1, z - 1, 5, 5)) if (r.reserved.has(i) || (g.flags[i] & (F.PIT | F.BRIDGE))) near = true;
    if (near) continue;
    if (rng.chance(0.6)) {
      P.heap(ctx, x + 1.5, z + 1.5, r.floor, 1.4, 1.4, rng.float(1.0, 1.8), v === 'meat' ? TS.GROUND : TS.ROCK);
      for (const i of cellsOf(g, x, z, 3, 3)) g.floorTex[i] = TS.GROUND;
    } else { P.pallet(ctx, x + 1, z + 1, r.floor, rng.pick(['crates', 'drums'])); P.pallet(ctx, x + 2.2, z + 2, r.floor, 'crates'); }
    use(ctx, x, z, 3, 3);
  }
  // overhead pipe bridge along the yard on trestles
  if (L >= 10) {
    const off = rng.chance(0.5) ? 1 : L - 2;
    const y = r.floor + 5.5;
    for (let k = 0; k < 2; k++) {
      const [ax, az] = Fr.pt(off + 0.3 + k * 0.45, 0), [bx, bz] = Fr.pt(off + 0.3 + k * 0.45, Wd);
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      P.cylH(deco, alongX ? Math.min(ax, bx) : Math.min(az, bz), alongX ? Math.max(ax, bx) : Math.max(az, bz), y + k * 0.55, alongX ? az : ax, 0.22, alongX, TS.PIPE);
    }
    for (let s = 3; s < Wd - 2; s += 6) {
      const i = cellL(ctx, Fr, off, s);
      if (!g.type[i] || ctx.used.has(i) || r.reserved.has(i) || (g.flags[i] & (F.STAIR | F.OBSTACLE | F.PIT | F.BRIDGE))) continue;
      fbox(deco, Fr, off + 0.35, off + 0.65, s + 0.35, s + 0.65, r.floor, y - 0.25, TS.BEAM, { solid: true });
      fbox(deco, Fr, off - 0.1, off + 1.2, s + 0.25, s + 0.75, y - 0.25, y - 0.1, TS.BEAM);
    }
  }
  // floodlight masts round the yard
  let lamps = 0;
  for (const [x, z, d] of rng.shuffle(edgeCells(ctx))) {
    if (lamps >= Math.max(3, Math.floor((r.w + r.h) / 9))) break;
    const i = g.idx(x, z);
    if (ctx.used.has(i) || r.reserved.has(i) || (g.flags[i] & (F.STAIR | F.OBSTACLE | F.PIT | F.BRIDGE | F.HAZARD))) continue;
    const px = x + 0.5 + DIR_X[d] * 0.3, pz = z + 0.5 + DIR_Z[d] * 0.3;
    deco.streetLamp(px, pz, r.floor, { height: 7.5, armX: -DIR_X[d] * 0.7, armZ: -DIR_Z[d] * 0.7, radius: 13, color: SODIUM });
    use(ctx, x, z, 1, 1);
    lamps++;
  }
  r.lit = true;
};

// ======================================================================
// ARENA (boss): the converter house - a giant converter vessel over a
// pouring pit, cover blocks, raised platforms up stairs, crane overhead
// ======================================================================
FT.fd_arena = function fdArena(ctx) {
  const { deco, room: r } = ctx;
  // full build first, then lighter ones when the room stops working (exits
  // cut off by cover / furnaces in a small arena)
  for (const lvl of [3, 2, 1, 0]) {
    const m = deco.mark(), sn = snap(ctx);
    ctx.used = new Set();
    let okb = false;
    try { buildArena(ctx, lvl); okb = roomOK(ctx, 0.8); } catch (e) { stat('error', 'fd_arena', String((e && e.stack) || e).slice(0, 400)); }
    if (okb) return;
    stat('try', 'fd_arena', lvl, 'roomOK');
    deco.rollback(m); restore(ctx, sn);
  }
  ctx.used = new Set();
  wallPipes(ctx, r.floor + 5.2, 0.2, 2);
};
// lvl 3: cover pillars, pools and platforms (generic arena), converter,
// furnaces, crane; 2: no furnaces; 1: converter, furnaces and crane only;
// 0: crane only
function buildArena(ctx, lvl) {
  const { g, deco, rng, room: r } = ctx;
  if (lvl >= 2) TEMPLATES.arena(ctx);
  else r.lit = false;
  const v = fv(ctx);
  const top = r.floor + r.ceilH;
  // the converter: a big banded vessel on trunnion stands at the room centre
  const cx = r.x + r.w / 2, cz = r.z + r.h / 2;
  const cxI = Math.floor(cx), czI = Math.floor(cz);
  if (lvl >= 1 && ok(ctx, cxI - 2, czI - 2, 4, 4, 0, 0)) {
    const R = 1.5;
    P.cylV(deco, cx, cz, r.floor, r.floor + 0.4, R + 0.4, TS.SIDE);
    P.cylV(deco, cx, cz, r.floor + 0.4, r.floor + 3.4, R, TS.METAL, { s: 1.5 });
    for (const by of [r.floor + 1.2, r.floor + 2.4]) P.bandV(deco, cx, cz, by, R, 0.18);
    P.cylV(deco, cx, cz, r.floor + 3.4, r.floor + 4.1, R * 0.7, TS.METAL);
    if (v !== 'meat') { P.cylV(deco, cx, cz, r.floor + 4.1, r.floor + 4.13, R * 0.5, TS.LAVA, { emissive: 1 }); deco.light(cx, r.floor + 4.8, cz, MOLTEN, 10, { pulse: true }); }
    else P.cylV(deco, cx, cz, r.floor + 4.1, r.floor + 4.13, R * 0.5, TS.POISON, { emissive: 0.6 });
    for (const sg of [-1, 1]) deco.box(cx + sg * (R + 0.15) - 0.25, r.floor, cz - 0.3, cx + sg * (R + 0.15) + 0.25, r.floor + 2.6, cz + 0.3, TS.BEAM);
    deco.collider(cx - R - 0.4, r.floor, cz - R * 0.8, cx + R + 0.4, r.floor + 4.1, cz + R * 0.8);
    if (top > r.floor + 6) deco.box(cx - 0.5, r.floor + 4.4, cz - 0.5, cx + 0.5, top, cz + 0.5, TS.PIPE);
  }
  use(ctx, cxI - 2, czI - 2, 5, 5);
  // the converter house's furnaces on the short walls, an overhead crane
  // carrying a ladle (a gear / a hook) on the long axis, clear of the vessel
  const longX = r.w >= r.h;
  if (lvl === 3 || lvl === 1) for (const es of longX ? [1, 0] : [3, 2]) endWallFurnaces(ctx, frame(r, es), v === 'meat', 1);
  const Fc = frame(r, longX ? 3 : 1);
  if (r.ceilH >= 8) {
    const sc = rng.chance(0.5) ? Math.max(2.5, Fc.Wd * 0.22) : Math.min(Fc.Wd - 2.5, Fc.Wd * 0.78);
    const load = v === 'clock' ? 'gear' : v === 'meat' ? 'hook' : 'ladle';
    P.crane(ctx, Fc, 0, Fc.Wd, top - 2.2, sc, Fc.L * rng.float(0.35, 0.65), { load, yLoad: top - (load === 'ladle' ? 4.0 : 4.6) });
  }
  hazardLines(ctx, ctx.cells.filter((i) => g.flags[i] & F.HAZARD));
  wallPipes(ctx, r.floor + 5.2, 0.2, 2);
  upperWindows(ctx, top - 3.2, top - 1.7, 3);
  if (v === 'hell' || v === 'clock') chains(ctx, 5);
}

export { FT };
export { sparseSpikes, no, hookRail, tryFrames, sidesLong, fv, groundL, cellL, vatKind, moltenKind, railAll, highBay, wallLamps, wallPipes, chains, gallery, deckFace, booth, gearPit, dressFloor, stat };
void SKY_H; void retexFloor; void setHeight; void flightRect; void markMask; void riser; void freeRect; void COLD;
