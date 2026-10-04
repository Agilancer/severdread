// Room templates for the "lab" archetype (bio lab research facility,
// abandoned hospital). They plug into the architect generator (gen_arch.js):
// gen_lab.js lays the complex out around a central multi-storey core (a
// containment well under a giant specimen tank, or the hospital's skylit
// atrium over a collapsed, flooded basement) and fills the wings with
// purpose-built rooms: reception lobby, decontamination chamber, wet labs,
// clean rooms with an observation gallery, specimen halls, cold storage,
// server rooms, a flooded pump room, patient wards, an operating theatre with
// a viewing gallery and a morgue.
//
// Every object uses the texture role that fits it: casework, lockers,
// freezers and drawers are CRATE2 cabinet fronts (bio_lab / hospital overrides
// in data/texroles.js), bench tops, sinks, hoods, beds and trolleys METAL,
// instruments and racks MACHINE, displays SCREEN, partitions, sashes and
// glassware GLASS, tank fluid POISON / WATER, sheets and privacy curtains
// CARPET (linen), raised floors and drains GRATE, floor markings PAINT.
//
// Templates receive ctx = {g, deco, rng, theme, style, room, cells, depth, boss}
// and must keep room.reserved cells (exit approaches) flat and walkable.
import { TS, F, OPP, DIR_X, DIR_Z, SKY_H } from './common.js';
import { FACE } from './deco.js';
import { TEMPLATES, makePit, freeRect, inRoom, wallConsoles, HAZ_OF, HAZ_TEX, LIGHT_COL } from './gen_arch.js';
import { frame } from './hall_templates.js';

const STEP = 0.6;
const FACE_KEY = ['px', 'nx', 'pz', 'nz'];
const nSteps = (dh) => Math.max(1, Math.ceil(Math.abs(dh) / STEP - 1e-6));
const faced = (dir, front, side, top = side) => ({ side, top, bottom: side, [FACE_KEY[dir]]: front });
const COLD = [0.75, 0.88, 1], WHITE = [0.95, 0.98, 1], GREEN = [0.45, 1, 0.45], RED = [1, 0.25, 0.2];

// ======================================================================
// frame helpers (frame(R, side): t = depth away from that wall, s = along it)
// ======================================================================
function lbox(deco, Fr, t0, t1, s0, s1, y0, y1, tex, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.box(ax, y0, az, bx, y1, bz, tex, o);
}
function lcollider(deco, Fr, t0, t1, s0, s1, y0, y1, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.collider(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), o);
}
function cellsOf(g, x0, z0, w, h) {
  const out = [];
  for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) if (g.in(x, z)) out.push(g.idx(x, z));
  return out;
}
function canUse(ctx, x0, z0, w, h, margin = 0, usedMargin = margin) {
  if (!freeRect(ctx, x0, z0, w, h, margin)) return false;
  const used = ctx.used;
  if (!used) return true;
  const { g } = ctx;
  for (let z = z0 - usedMargin; z < z0 + h + usedMargin; z++) for (let x = x0 - usedMargin; x < x0 + w + usedMargin; x++) {
    if (g.in(x, z) && used.has(g.idx(x, z))) return false;
  }
  return true;
}
function use(ctx, x0, z0, w, h) {
  if (!ctx.used) ctx.used = new Set();
  for (const i of cellsOf(ctx.g, x0, z0, w, h)) ctx.used.add(i);
}
function flatOpen(ctx, x0, z0, w, h) {
  const { g, room: r } = ctx;
  for (const i of cellsOf(g, x0, z0, w, h)) {
    if (!g.type[i] || Math.abs(g.floor[i] - r.floor) > 0.01 || (g.flags[i] & (F.PIT | F.HAZARD | F.STAIR | F.OBSTACLE | F.BRIDGE | F.WATER)) || g.edge[i]) return false;
  }
  return true;
}
const canUseL = (ctx, Fr, t0, s0, dt, ds, m = 0, um = m) => canUse(ctx, ...Fr.rect(t0, s0, dt, ds), m, um);
const useL = (ctx, Fr, t0, s0, dt, ds) => use(ctx, ...Fr.rect(t0, s0, dt, ds));
const okL = (ctx, Fr, t0, s0, dt, ds, m = 0, um = m) => canUseL(ctx, Fr, t0, s0, dt, ds, m, um) && flatOpen(ctx, ...Fr.rect(t0, s0, dt, ds));
const ok = (ctx, x, z, w, h, m = 0, um = m) => canUse(ctx, x, z, w, h, m, um) && flatOpen(ctx, x, z, w, h);

function setHeight(ctx, x0, z0, w, h, y, o = {}) {
  const { g, room: r } = ctx;
  const cells = [];
  for (const i of cellsOf(g, x0, z0, w, h)) {
    if (!g.type[i]) continue;
    g.floor[i] = y;
    if (o.floorTex !== undefined) g.floorTex[i] = o.floorTex;
    if (o.wallTex !== undefined) g.wallTex[i] = o.wallTex;
    if (!g.sky[i] && g.ceil[i] < y + (o.head ?? 2.6)) g.ceil[i] = y + (o.head ?? 2.6);
    g.region[i] = r.id;
    cells.push(i);
  }
  return cells;
}
const setHeightL = (ctx, Fr, t0, s0, dt, ds, y, o) => setHeight(ctx, ...Fr.rect(t0, s0, dt, ds), y, o);
function retexFloor(ctx, cells, tex) {
  const { g } = ctx;
  for (const i of cells) if (g.type[i] && !(g.flags[i] & (F.STAIR | F.PIT | F.HAZARD | F.WATER | F.BRIDGE))) g.floorTex[i] = tex;
}
function flightRect(ctx, x0, z0, w, h, dir, y0, y1, o = {}) {
  const { deco, room: r, style } = ctx;
  const alongX = dir < 2;
  const n = alongX ? w : h, width = alongX ? h : w;
  const sx = dir === 1 ? x0 + w - 1 : x0, sz = dir === 3 ? z0 + h - 1 : z0;
  const cells = deco.stairs(sx, sz, dir, width, y0, y1, { rise: Math.abs(y1 - y0) / n, light: r.light, region: r.id, style: o.style ?? style.railStyle, ceil: r.floor + r.ceilH, ...o });
  for (const i of cells) ctx.g.flags[i] |= F.NOSPAWN;
  return cells;
}
const flightL = (ctx, Fr, t0, s0, dt, ds, dirKey, y0, y1, o) => flightRect(ctx, ...Fr.rect(t0, s0, dt, ds), Fr.dirOf(dirKey), y0, y1, o);

function snap(ctx) {
  const { g, room: r } = ctx;
  const s = [];
  for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
    if (!g.in(x, z)) continue;
    const i = g.idx(x, z);
    s.push([i, g.type[i], g.floor[i], g.ceil[i], g.sky[i], g.flags[i], g.hazType[i], g.stairDir[i], g.rise[i], g.edge[i], g.floorTex[i], g.wallTex[i], g.ceilTex[i], g.roof[i], g.light[i]]);
  }
  return s;
}
function restore(ctx, s) {
  const { g } = ctx;
  for (const [i, t, f, c, sk, fl, hz, sd, rs, ed, ft, wt, ct, rf, li] of s) {
    g.type[i] = t; g.floor[i] = f; g.ceil[i] = c; g.sky[i] = sk; g.flags[i] = fl; g.hazType[i] = hz; g.stairDir[i] = sd; g.rise[i] = rs; g.edge[i] = ed;
    g.floorTex[i] = ft; g.wallTex[i] = wt; g.ceilTex[i] = ct; g.roof[i] = rf; g.light[i] = li;
  }
}
// edge bits set by a failed attempt also live on the neighbours outside the
// room ring; snap() covers the ring, so restoring it restores both sides
function tryFrames(ctx, sides, build, fallback) {
  const { deco, room: r } = ctx;
  for (const side of sides) {
    const Fr = frame(r, side);
    ctx.used = new Set();
    const m = deco.mark(), s = snap(ctx);
    let okb = false;
    try { okb = build(Fr); } catch (e) { okb = false; if (typeof console !== 'undefined') console.warn('lab template', r.template, e); }
    if (okb) return true;
    deco.rollback(m); restore(ctx, s);
  }
  ctx.used = new Set();
  if (globalThis.__LABSTAT) globalThis.__LABSTAT.push(['fallback', r.template]);
  if (fallback) fallback(ctx);
  return false;
}
// frame sides: long walls first (feature along a long wall) or short walls first
function sideOrder(ctx, longFirst = true) {
  const { room: r, rng } = ctx;
  const shortW = r.w >= r.h ? [1, 0] : [3, 2], longW = r.w >= r.h ? [3, 2] : [1, 0];
  rng.shuffle(shortW); rng.shuffle(longW);
  return longFirst ? [...longW, ...shortW] : [...shortW, ...longW];
}
// free cells along the room edge: [x, z, dirToWall]
function wallSpots(ctx) {
  const { g, room: r } = ctx;
  const out = [];
  for (let x = r.x; x < r.x + r.w; x++) { out.push([x, r.z, 3]); out.push([x, r.z + r.h - 1, 2]); }
  for (let z = r.z; z < r.z + r.h; z++) { out.push([r.x, z, 1]); out.push([r.x + r.w - 1, z, 0]); }
  return out.filter(([x, z, d]) => {
    const nx = x + DIR_X[d], nz = z + DIR_Z[d];
    return g.in(nx, nz) && !g.type[g.idx(nx, nz)] && ok(ctx, x, z, 1, 1);
  });
}
// a box hugging the wall of cell (x,z) on side d (dirToWall), depth dep, full cell width minus inset
function wallBox(ctx, x, z, d, dep, y0, y1, tex, o = {}) {
  const ins = o.inset ?? 0.04;
  const x0 = d === 0 ? x + 1 - dep : d === 1 ? x : x + ins, x1 = d === 0 ? x + 1 : d === 1 ? x + dep : x + 1 - ins;
  const z0 = d === 2 ? z + 1 - dep : d === 3 ? z : z + ins, z1 = d === 2 ? z + 1 : d === 3 ? z + dep : z + 1 - ins;
  return ctx.deco.box(x0, y0, z0, x1, y1, z1, tex, o);
}
// thin emissive strip + light
function lightStrip(ctx, x0, z0, x1, z1, y, color = WHITE, radius = 5) {
  const { deco } = ctx;
  deco.box(x0, y - 0.05, z0, x1, y, z1, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
  deco.light((x0 + x1) / 2, y - 0.4, (z0 + z1) / 2, color, radius);
}
function hangLight(ctx, x, z, ceilY, drop, color, radius = 7, o = {}) {
  const { deco } = ctx;
  deco.box(x - 0.03, ceilY - drop, z - 0.03, x + 0.03, ceilY, z + 0.03, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.32, ceilY - drop - 0.2, z - 0.32, x + 0.32, ceilY - drop, z + 0.32, TS.METAL);
  deco.box(x - 0.26, ceilY - drop - 0.24, z - 0.26, x + 0.26, ceilY - drop - 0.2, z + 0.26, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.light(x, ceilY - drop - 0.7, z, color, radius, o);
}
// floor paint (hazard / guide lines) on a world rect
function paint(ctx, x0, z0, x1, z1, y) {
  ctx.deco.box(x0, y + 0.004, z0, x1, y + 0.018, z1, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
}
// yellow safety lines around the open edge of a set of hazard cells (on the walkable side)
function hazardLines(ctx, pitCells) {
  const { g } = ctx;
  const pit = new Set(pitCells);
  for (const i of pit) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (!g.in(nx, nz)) continue;
      const j = g.idx(nx, nz);
      if (!g.type[j] || pit.has(j) || (g.flags[j] & (F.PIT | F.STAIR | F.HAZARD | F.BRIDGE | F.WATER))) continue;
      const y = g.floor[j];
      // strip on cell j along its edge facing the pit (direction OPP[d] from j)
      const e = 0.12, w = 0.14;
      if (d === 0) paint(ctx, nx + e, nz + 0.02, nx + e + w, nz + 0.98, y);
      else if (d === 1) paint(ctx, nx + 1 - e - w, nz + 0.02, nx + 1 - e, nz + 0.98, y);
      else if (d === 2) paint(ctx, nx + 0.02, nz + e, nx + 0.98, nz + e + w, y);
      else paint(ctx, nx + 0.02, nz + 1 - e - w, nx + 0.98, nz + 1 - e, y);
    }
  }
}
function railAround(ctx, pitCells, o = {}) {
  const { g, deco } = ctx;
  const pit = new Set(pitCells);
  const ring = new Set();
  for (const i of pit) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (!g.in(nx, nz)) continue;
      const j = g.idx(nx, nz);
      if (g.type[j] && !pit.has(j) && !(g.flags[j] & (F.PIT | F.STAIR))) ring.add(j);
    }
  }
  for (const i of o.extra || []) ring.add(i);
  deco.railEdges(ring, { style: o.style ?? ctx.style.railStyle, allow: o.allow });
  return ring;
}
function deckBridge(ctx, x0, z0, w, h, y, o = {}) {
  const { g, room: r } = ctx;
  const cells = [];
  for (const i of cellsOf(g, x0, z0, w, h)) {
    if (!(g.flags[i] & (F.PIT | F.HAZARD | F.WATER))) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    g.open(x, z, y, g.ceil[i], { sky: !!g.sky[i], floorTex: o.floorTex ?? TS.GRATE, wallTex: o.wallTex ?? TS.GRATE, light: g.light[i], region: r.id });
    g.flags[i] &= ~(F.PIT | F.HAZARD | F.WATER);
    g.flags[i] |= F.BRIDGE | F.NOSPAWN;
    g.hazType[i] = 0;
    cells.push(i);
  }
  return cells;
}
// sink a world rect into a pit / pool; returns the hazard cells
function pit(ctx, x0, z0, w, h, kind, depth) {
  makePit(ctx, x0, z0, w, h, kind, depth);
  const { g } = ctx;
  return cellsOf(g, x0, z0, w, h).filter((i) => g.flags[i] & (F.PIT | F.HAZARD | F.WATER));
}
// sink an arbitrary set of cells into a pit / pool (makePit for irregular shapes)
function pitSet(ctx, cells, kind, depth) {
  const { g, deco, room: r } = ctx;
  const haz = HAZ_OF[kind], deep = depth > 1.0;
  const set = new Set(cells);
  for (const i of set) {
    const x = i % g.w, z = (i / g.w) | 0;
    g.open(x, z, r.floor - depth, g.ceil[i], { sky: !!g.sky[i], light: Math.max(g.light[i], kind === 'lava' || kind === 'poison' ? 0.9 : g.light[i]), floorTex: kind === 'spikes' ? TS.PITWALL : HAZ_TEX[kind], wallTex: TS.PITWALL, region: r.id, haz });
    g.flags[i] |= F.NOSPAWN | (kind === 'water' && !deep ? F.WATER : F.HAZARD) | (deep ? F.PIT : 0);
    if (kind === 'water' && !deep) g.flags[i] &= ~F.HAZARD;
  }
  for (const i of set) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const j = g.idx(x + DIR_X[d], z + DIR_Z[d]);
      if (!set.has(j) && g.type[j] && !(g.flags[j] & (F.PIT | F.STAIR)) && !g.hazType[j]) g.wallTex[j] = TS.PITWALL;
    }
    if ((kind === 'lava' || kind === 'poison') && x % 4 === 1 && z % 4 === 1) deco.light(x + 0.5, r.floor - depth + 0.8, z + 0.5, LIGHT_COL[kind], 6, { pulse: true });
  }
  return [...set];
}
// morphological opening (3x3): drops slivers under 3 cells wide
function openShape(g, cand) {
  const er = new Set();
  for (const i of cand) {
    const x = i % g.w, z = (i / g.w) | 0;
    let all = true;
    for (let dz = -1; dz <= 1 && all; dz++) for (let dx = -1; dx <= 1; dx++) if (!cand.has(g.idx(x + dx, z + dz))) { all = false; break; }
    if (all) er.add(i);
  }
  const out = new Set();
  for (const i of cand) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (er.has(g.idx(x + dx, z + dz))) out.add(i);
  }
  return out;
}
// largest 4-connected blob of a cell set
function largestBlob(g, set) {
  const seen = new Set();
  let best = new Set();
  for (const s0 of set) {
    if (seen.has(s0)) continue;
    const comp = new Set([s0]);
    seen.add(s0);
    const q = [s0];
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % g.w, z = (i / g.w) | 0;
      for (let d = 0; d < 4; d++) {
        const j = g.idx(x + DIR_X[d], z + DIR_Z[d]);
        if (set.has(j) && !seen.has(j)) { seen.add(j); comp.add(j); q.push(j); }
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}
// frame-space mask of usable cells: m[t][s] = free of exit approaches (with
// `margin`) and of cells this template already used, flat and open
function freeMask(ctx, Fr, margin = 1) {
  const m = [];
  for (let t = 0; t < Fr.L; t++) {
    const row = [];
    for (let s = 0; s < Fr.Wd; s++) row.push(okL(ctx, Fr, t, s, 1, 1, margin, margin));
    m.push(row);
  }
  return m;
}
// biggest rectangle of true cells in a frame mask, within [t0..t1) x [s0..s1),
// at least minT x minS (and at most maxT x maxS); score(t, s, dt, ds) can
// bias the choice (default: area). Returns {t, s, dt, ds} or null.
function bestRect(m, o = {}) {
  const L = m.length, Wd = L ? m[0].length : 0;
  const T0 = o.t0 ?? 0, T1 = o.t1 ?? L, S0 = o.s0 ?? 0, S1 = o.s1 ?? Wd;
  const minT = o.minT ?? 1, minS = o.minS ?? 1, maxT = o.maxT ?? L, maxS = o.maxS ?? Wd;
  // prefix sums of free cells
  const P = Array.from({ length: L + 1 }, () => new Int32Array(Wd + 1));
  for (let t = 0; t < L; t++) for (let s = 0; s < Wd; s++) P[t + 1][s + 1] = P[t][s + 1] + P[t + 1][s] - P[t][s] + (m[t][s] ? 1 : 0);
  const full = (t, s, dt, ds) => P[t + dt][s + ds] - P[t][s + ds] - P[t + dt][s] + P[t][s] === dt * ds;
  const score = o.score || ((t, s, dt, ds) => dt * ds);
  let best = null, bs = -Infinity;
  for (let dt = Math.min(maxT, T1 - T0); dt >= minT; dt--) for (let ds = Math.min(maxS, S1 - S0); ds >= minS; ds--) {
    for (let t = T0; t + dt <= T1; t++) for (let s = S0; s + ds <= S1; s++) {
      if (!full(t, s, dt, ds)) continue;
      const v = score(t, s, dt, ds);
      if (v > bs) { bs = v; best = { t, s, dt, ds }; }
    }
  }
  return best;
}
const markMask = (m, t, s, dt, ds, pad = 0) => { for (let a = t - pad; a < t + dt + pad; a++) for (let b = s - pad; b < s + ds + pad; b++) if (m[a] && b >= 0 && b < m[a].length) m[a][b] = false; };
// glass partition along the frame line t (a cell edge) from s = sa to sb, with
// openings [[s0, s1], ...] left clear; glass to `h` above y (steel frame,
// mullions, edge bits so pathing respects it)
function glassLineL(ctx, Fr, t, sa, sb, y, h, openings = [], o = {}) {
  const segs = [];
  let a = sa;
  for (const [o0, o1] of [...openings].sort((p, q) => p[0] - q[0])) { if (o0 > a) segs.push([a, o0]); a = Math.max(a, o1); }
  if (sb > a) segs.push([a, sb]);
  for (const [p, q] of segs) {
    const [ax, az] = Fr.pt(t, p), [bx, bz] = Fr.pt(t, q);
    glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, h, o);
  }
  // headers over the openings up to the glass head, a status light strip
  for (const [o0, o1] of openings) {
    if (h > 3.1) lbox(ctx.deco, Fr, t - 0.07, t + 0.07, o0, o1, y + 3.0, y + h, o.header ?? TS.PANEL);
    lbox(ctx.deco, Fr, t - 0.09, t + 0.09, o0 + 0.1, o1 - 0.1, y + 2.92, y + 3.0, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  return segs;
}
// an opening (s0, s1) on the frame line t (a cell edge) that covers every
// exit approach / non-flat cell on either side of it, minW..maxW wide, as near
// the preferred start `pref` as possible; null if none fits
function lineOpening(ctx, Fr, t, minW = 3, maxW = 4, pref = null) {
  const { g, room: r } = ctx;
  const Wd = Fr.Wd;
  let lo = 1e9, hi = -1;
  for (let s = 0; s < Wd; s++) for (const tt of [t - 1, t]) {
    if (tt < 0 || tt >= Fr.L) continue;
    const [x, z] = Fr.cell(tt, s);
    const i = g.idx(x, z);
    if (r.reserved.has(i) || (ctx.used && ctx.used.has(i)) || !flatOpen(ctx, x, z, 1, 1)) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
  }
  const p = pref ?? Math.floor((Wd - minW) / 2);
  if (hi < 0) return [Math.max(0, Math.min(Wd - minW, p)), Math.max(0, Math.min(Wd - minW, p)) + minW];
  let s0 = lo, s1 = hi + 1;
  if (s1 - s0 > maxW) return null;
  while (s1 - s0 < minW) { if (s0 > 0 && (s1 >= Wd || Math.abs(s0 - 1 - p) < Math.abs(s1 - p - minW + 1))) s0--; else s1++; }
  return s1 <= Wd ? [s0, s1] : null;
}
// a sliding glass door leaf parked beside an opening on the line t (s0..s1),
// on the `side` (+1/-1 along t) face; steel frame, hazard band
function doorLeafL(ctx, Fr, t, s0, s1, y, side = 1) {
  const d = 0.1 * side;
  const a = Math.min(t + d, t + d + 0.05 * side), b = Math.max(t + d, t + d + 0.05 * side);
  lbox(ctx.deco, Fr, a, b, s0, s1, y + 0.05, y + 2.9, TS.GLASS, { uv: 'fit', emissive: 0.25 });
  lbox(ctx.deco, Fr, a - 0.01, b + 0.01, s0, s0 + 0.08, y + 0.05, y + 2.9, TS.METAL);
  lbox(ctx.deco, Fr, a - 0.01, b + 0.01, s1 - 0.08, s1, y + 0.05, y + 2.9, TS.METAL);
  lbox(ctx.deco, Fr, a - 0.01, b + 0.01, s0, s1, y + 0.95, y + 1.08, TS.PAINT, { uv: 'fit' });
}
// open steel shelving unit (posts, four shelves) stocked with boxes / bottles
function openShelf(ctx, x0, z0, x1, z1, y, h = 2.1, o = {}) {
  const { deco, rng } = ctx;
  const alongX = x1 - x0 >= z1 - z0;
  for (const [px, pz] of [[x0, z0], [x1 - 0.05, z0], [x0, z1 - 0.05], [x1 - 0.05, z1 - 0.05]]) deco.box(px, y, pz, px + 0.05, y + h, pz + 0.05, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
  const L = alongX ? x1 - x0 : z1 - z0, D = alongX ? z1 - z0 : x1 - x0;
  const items = o.items ?? [TS.CRATE, TS.CRATE2, TS.GLASS];
  for (let k = 0; k < 4; k++) {
    const sy = y + 0.12 + k * (h - 0.2) / 3.4;
    deco.box(x0, sy - 0.04, z0, x1, sy, z1, TS.METAL);
    if (k === 3 && o.topEmpty) continue;
    for (let u = 0.12; u < L - 0.2;) {
      const w = rng.float(0.22, 0.42);
      if (u + w > L - 0.08) break;
      if (rng.chance(0.72)) {
        const tex = rng.pick(items), hh = tex === TS.GLASS ? rng.float(0.14, 0.3) : rng.float(0.18, Math.min(0.42, (h - 0.2) / 3.4 - 0.08));
        const dd = Math.min(D - 0.1, rng.float(0.25, 0.45));
        const v0 = (D - dd) / 2;
        if (alongX) deco.box(x0 + u, sy, z0 + v0, x0 + u + w * (tex === TS.GLASS ? 0.4 : 1), sy + hh, z0 + v0 + dd * (tex === TS.GLASS ? 0.4 : 1), tex, { uv: 'fit', emissive: tex === TS.GLASS ? 0.3 : 0 });
        else deco.box(x0 + v0, sy, z0 + u, x0 + v0 + dd * (tex === TS.GLASS ? 0.4 : 1), sy + hh, z0 + u + w * (tex === TS.GLASS ? 0.4 : 1), tex, { uv: 'fit', emissive: tex === TS.GLASS ? 0.3 : 0 });
      }
      u += w + rng.float(0.04, 0.12);
    }
  }
  deco.collider(x0, y, z0, x1, y + h, z1);
}
// windows high on the walls of the room (upper storeys / offices seen from a tall room)
function upperWindows(ctx, y0, y1, every = 2, filter) {
  const { g, deco, room: r } = ctx;
  let k = 0;
  for (const [x, z, d] of edgeCells(ctx)) {
    if (filter && !filter(x, z, d)) continue;
    const pos = d < 2 ? z : x;
    if ((pos + k) % every) continue;
    const i = g.idx(x, z);
    if (y1 > g.ceil[i] - 0.3) continue;
    deco.window(x, z, d, y0, y1, { emissive: 0.5 });
  }
  void r;
}
// every room-edge cell with the wall direction (no free check)
function edgeCells(ctx) {
  const { g, room: r } = ctx;
  const out = [];
  for (let x = r.x; x < r.x + r.w; x++) { out.push([x, r.z, 3]); out.push([x, r.z + r.h - 1, 2]); }
  for (let z = r.z; z < r.z + r.h; z++) { out.push([r.x, z, 1]); out.push([r.x + r.w - 1, z, 0]); }
  return out.filter(([x, z, d]) => {
    const nx = x + DIR_X[d], nz = z + DIR_Z[d];
    return g.in(nx, nz) && g.type[g.idx(x, z)] && !g.type[g.idx(nx, nz)];
  });
}

// ======================================================================
// props
// ======================================================================
const isHosp = (ctx) => ctx.theme.id === 'abandoned_hospital' || !!ctx.theme.params?.hospital;

// Specimen tank: plinth, glowing fluid column, steel ribs and bands, cap and feed pipe.
function tank(ctx, cx, cz, y, top, o = {}) {
  const { deco, rng } = ctx;
  const R = o.r ?? 0.42, fluid = o.fluid ?? TS.POISON;
  const P = R + 0.14;
  // o.hang: a vessel suspended from the ceiling (bottom cap instead of a plinth)
  if (!o.hang) deco.box(cx - P, y, cz - P, cx + P, y + 0.42, cz + P, { side: TS.MACHINE, top: TS.METAL, bottom: TS.METAL }, { uv: 'fit' });
  else deco.box(cx - P, y - 0.36, cz - P, cx + P, y, cz + P, { side: TS.MACHINE, top: TS.METAL, bottom: TS.METAL }, { uv: 'fit' });
  const y0 = o.hang ? y : y + 0.42, y1 = Math.max(y0 + 1.4, top - 0.4);
  if (!o.broken) {
    deco.box(cx - R, y0, cz - R, cx + R, y1, cz + R, fluid, { emissive: 0.7 });
    for (let by = y0 + 0.9; by < y1 - 0.5; by += 1.1) deco.box(cx - R - 0.03, by, cz - R - 0.03, cx + R + 0.03, by + 0.07, cz + R + 0.03, TS.METAL);
    deco.light(cx, (y0 + y1) / 2, cz, fluid === TS.WATER ? [0.4, 0.7, 1] : GREEN, o.lightR ?? 4, { pulse: true });
  } else {
    // shattered: a puddle of fluid in the base, jagged glass shards on the rim
    deco.box(cx - R, y0, cz - R, cx + R, y0 + 0.08, cz + R, fluid, { emissive: 0.6 });
    for (let k = 0; k < 4; k++) {
      const sx = k < 2 ? cx - R : cx + R - 0.05, sz = k % 2 ? cz - R : cz + R - 0.05;
      deco.box(sx, y0, sz, sx + 0.05, y0 + rng.float(0.25, 0.7), sz + 0.05, TS.GLASS, { emissive: 0.2 });
    }
  }
  for (const [px, pz] of [[cx - R, cz - R], [cx + R, cz - R], [cx - R, cz + R], [cx + R, cz + R]]) deco.box(px - 0.04, y0, pz - 0.04, px + 0.04, y1, pz + 0.04, TS.METAL, { faces: FACE.SIDES });
  deco.box(cx - P, y1, cz - P, cx + P, y1 + 0.32, cz + P, TS.METAL);
  if (o.ceil && o.ceil > y1 + 0.5) deco.box(cx - 0.09, y1 + 0.32, cz - 0.09, cx + 0.09, o.ceil, cz + 0.09, TS.PIPE);
  deco.collider(cx - P, o.hang ? y - 0.36 : y, cz - P, cx + P, y1 + 0.32, cz + P, { obstacle: !o.hang });
}

// lab bench (casework) along a world rect; tex fronts face both long sides
function labBench(ctx, x0, z0, x1, z1, y, o = {}) {
  const { deco, rng } = ctx;
  const alongX = x1 - x0 >= z1 - z0;
  const front = alongX ? { pz: TS.CRATE2, nz: TS.CRATE2, px: TS.METAL, nx: TS.METAL } : { px: TS.CRATE2, nx: TS.CRATE2, pz: TS.METAL, nz: TS.METAL };
  deco.box(x0 + 0.04, y, z0 + 0.04, x1 - 0.04, y + 0.86, z1 - 0.04, { ...front, top: TS.METAL, bottom: TS.METAL }, { solid: true, uv: 'fit' });
  deco.box(x0, y + 0.86, z0, x1, y + 0.93, z1, TS.METAL);
  const L = alongX ? x1 - x0 : z1 - z0;
  const at = (u, v) => (alongX ? [x0 + u, (z0 + z1) / 2 + v] : [(x0 + x1) / 2 + v, z0 + u]);
  const yt = y + 0.93;
  // reagent shelf down the middle (island benches)
  if (o.shelf !== false && L >= 1.8) {
    for (const u of [0.1, L - 0.14]) {
      const [px, pz] = at(u, 0);
      deco.box(px - 0.03, yt, pz - 0.03, px + 0.03, yt + 1.05, pz + 0.03, TS.METAL, { faces: FACE.SIDES });
    }
    for (const sy of [0.55, 1.0]) {
      const [ax, az] = at(0.05, -0.14), [bx, bz] = at(L - 0.05, 0.14);
      deco.box(Math.min(ax, bx), yt + sy - 0.04, Math.min(az, bz), Math.max(ax, bx), yt + sy, Math.max(az, bz), TS.METAL);
      for (let u = 0.25; u < L - 0.2; u += 0.24) {
        if (!rng.chance(0.55)) continue;
        const [bx2, bz2] = at(u, rng.float(-0.06, 0.06));
        const hh = rng.float(0.12, 0.26);
        deco.box(bx2 - 0.05, yt + sy, bz2 - 0.05, bx2 + 0.05, yt + sy + hh, bz2 + 0.05, TS.GLASS, { emissive: 0.35, uv: 'fit' });
      }
    }
  }
  // sink at one end
  if (o.sink !== false && L >= 2) {
    const [sx, sz] = at(L - 0.55, alongX ? (z1 - z0) * 0.25 : (x1 - x0) * 0.25);
    deco.box(sx - 0.28, yt - 0.05, sz - 0.2, sx + 0.28, yt + 0.02, sz + 0.2, TS.WATER, { faces: FACE.TOP });
    deco.box(sx - 0.03, yt, sz - 0.03, sx + 0.03, yt + 0.38, sz + 0.03, TS.METAL, { faces: FACE.SIDES });
  }
  // instruments on the top: microscope, centrifuge, monitor
  const n = Math.max(1, Math.floor(L / 1.3));
  for (let k = 0; k < n; k++) {
    const u = 0.45 + k * (L - 0.9) / Math.max(1, n - 1 || 1);
    if (u > L - 0.4) break;
    const side = rng.chance(0.5) ? -1 : 1;
    const [ix, iz] = at(u, side * (alongX ? (z1 - z0) : (x1 - x0)) * 0.28);
    const kind = rng.int(0, 2);
    if (kind === 0) { // microscope
      deco.box(ix - 0.12, yt, iz - 0.12, ix + 0.12, yt + 0.06, iz + 0.12, TS.METAL);
      deco.box(ix - 0.03, yt + 0.06, iz - 0.03, ix + 0.03, yt + 0.4, iz + 0.03, TS.METAL);
      deco.box(ix - 0.06, yt + 0.32, iz - 0.1, ix + 0.06, yt + 0.42, iz + 0.1, TS.METAL);
    } else if (kind === 1) { // benchtop analyser
      deco.box(ix - 0.22, yt, iz - 0.18, ix + 0.22, yt + 0.3, iz + 0.18, TS.MACHINE, { uv: 'fit' });
    } else { // monitor
      deco.box(ix - 0.03, yt, iz - 0.03, ix + 0.03, yt + 0.12, iz + 0.03, TS.METAL);
      const sw = 0.24;
      if (alongX) deco.box(ix - sw, yt + 0.12, iz - 0.03, ix + sw, yt + 0.45, iz + 0.03, { side: TS.METAL, top: TS.METAL, pz: TS.SCREEN, nz: TS.SCREEN }, { uv: 'fit' });
      else deco.box(ix - 0.03, yt + 0.12, iz - sw, ix + 0.03, yt + 0.45, iz + sw, { side: TS.METAL, top: TS.METAL, px: TS.SCREEN, nx: TS.SCREEN }, { uv: 'fit' });
    }
  }
}

// fume hood against the wall of cell (x,z) (d = dir to wall)
function fumeHood(ctx, x, z, d, y) {
  const { deco } = ctx;
  const f = OPP[d];
  const dep = 0.78;
  wallBox(ctx, x, z, d, dep, y, y + 0.88, faced(f, TS.CRATE2, TS.METAL, TS.METAL), { solid: true, uv: 'fit', inset: 0.03 });
  // chamber: steel sides, glass sash front, light inside
  wallBox(ctx, x, z, d, dep, y + 0.88, y + 1.95, faced(f, TS.GLASS, TS.METAL, TS.METAL), { uv: 'fit', emissive: 0.3, inset: 0.03 });
  wallBox(ctx, x, z, d, dep + 0.04, y + 1.95, y + 2.35, faced(f, TS.PANEL, TS.METAL, TS.METAL), { inset: 0.0 });
  // exhaust duct to the ceiling
  const cx = x + 0.5 + DIR_X[d] * 0.3, cz = z + 0.5 + DIR_Z[d] * 0.3;
  const ceil = ctx.g.ceil[ctx.g.idx(x, z)];
  if (ceil > y + 2.6) deco.box(cx - 0.12, y + 2.35, cz - 0.12, cx + 0.12, ceil, cz + 0.12, TS.PIPE);
  deco.light(x + 0.5 - DIR_X[d] * 0.1, y + 1.5, z + 0.5 - DIR_Z[d] * 0.1, WHITE, 2.5);
}
// tall cabinet / locker / freezer against the wall (front = CRATE2 cabinet doors)
function cabinet(ctx, x, z, d, y, h = 2.0, dep = 0.6, front = TS.CRATE2) {
  wallBox(ctx, x, z, d, dep, y, y + h, faced(OPP[d], front, TS.METAL, TS.METAL), { solid: true, uv: 'fit', inset: 0.03 });
}
function machineBlock(ctx, x, z, d, y, h = 1.8, dep = 0.7) {
  wallBox(ctx, x, z, d, dep, y, y + h, faced(OPP[d], TS.MACHINE, TS.METAL, TS.METAL), { solid: true, uv: 'fit', inset: 0.05 });
}
// row of linked waiting seats along a world rect (alongX or not), facing dir
function seatRow(ctx, x0, z0, len, alongX, y, dir) {
  const { deco } = ctx;
  const d = 0.55;
  const box = (a0, a1, b0, b1, y0, y1, tex, o) => (alongX ? deco.box(x0 + a0, y0, z0 + b0, x0 + a1, y1, z0 + b1, tex, o) : deco.box(x0 + b0, y0, z0 + a0, x0 + b1, y1, z0 + a1, tex, o));
  const back = (dir === 2 || dir === 0) ? 0.08 : d - 0.08;   // backrest on the side opposite the facing direction
  const b0 = (dir === 2 || dir === 0) ? 0.04 : 0.04;
  box(0.05, len - 0.05, b0, b0 + d, y + 0.02, y + 0.12, TS.METAL);
  for (let a = 0.1; a < len - 0.1; a += 0.55) {
    box(a, a + 0.48, b0, b0 + d, y + 0.42, y + 0.5, TS.CARPET);
    const bk = back < d / 2 ? [b0, b0 + 0.07] : [b0 + d - 0.07, b0 + d];
    box(a, a + 0.48, bk[0], bk[1], y + 0.5, y + 0.95, TS.CARPET);
  }
  for (const a of [0.1, len - 0.16]) box(a, a + 0.06, b0 + 0.1, b0 + d - 0.1, y, y + 0.42, TS.METAL, { faces: FACE.SIDES });
  if (alongX) deco.collider(x0, y, z0 + b0, x0 + len, y + 0.95, z0 + b0 + d);
  else deco.collider(x0 + b0, y, z0, x0 + b0 + d, y + 0.95, z0 + len);
}
// counter with a front panel facing dir (world)
function counter(ctx, x0, z0, x1, z1, y, dir, o = {}) {
  const { deco } = ctx;
  const h = o.h ?? 1.05;
  deco.box(x0, y, z0, x1, y + h - 0.06, z1, faced(dir, o.front ?? TS.PANEL, o.side ?? TS.METAL, o.side ?? TS.METAL), { solid: true });
  deco.box(x0 - 0.05, y + h - 0.06, z0 - 0.05, x1 + 0.05, y + h, z1 + 0.05, o.top ?? TS.METAL);
}
// small desk monitor facing dir at (x, z)
function monitor(ctx, x, z, y, dir) {
  const { deco } = ctx;
  deco.box(x - 0.04, y, z - 0.04, x + 0.04, y + 0.14, z + 0.04, TS.METAL);
  const w = 0.26, t = 0.03;
  const tex = { side: TS.METAL, top: TS.METAL, bottom: TS.METAL, [FACE_KEY[dir]]: TS.SCREEN };
  if (dir < 2) deco.box(x - t, y + 0.14, z - w, x + t, y + 0.5, z + w, tex, { uv: 'fit' });
  else deco.box(x - w, y + 0.14, z - t, x + w, y + 0.5, z + t, tex, { uv: 'fit' });
}
// hospital bed in cell rect: head at the wall side `d` (dirToWall), length along d
function bed(ctx, x, z, d, y, o = {}) {
  const { deco, rng } = ctx;
  // bed occupies cells (x,z) [head, next to wall] and (x - DIR_X[d], z - DIR_Z[d]) [foot]
  const fx = -DIR_X[d], fz = -DIR_Z[d];
  const hx = x + 0.5 + DIR_X[d] * 0.42, hz = z + 0.5 + DIR_Z[d] * 0.42;   // head end
  const ex = hx + fx * 2.0, ez = hz + fz * 2.0;                               // foot end
  const W = 0.46;
  const along = d < 2;  // bed length along x
  const bx0 = Math.min(hx, ex), bx1 = Math.max(hx, ex), bz0 = Math.min(hz, ez), bz1 = Math.max(hz, ez);
  const rx0 = along ? bx0 : x + 0.5 - W, rx1 = along ? bx1 : x + 0.5 + W, rz0 = along ? z + 0.5 - W : bz0, rz1 = along ? z + 0.5 + W : bz1;
  const sh = o.shift ?? 0;
  const X0 = rx0 + (along ? 0 : sh), X1 = rx1 + (along ? 0 : sh), Z0 = rz0 + (along ? sh : 0), Z1 = rz1 + (along ? sh : 0);
  deco.box(X0 + 0.04, y + 0.36, Z0 + 0.04, X1 - 0.04, y + 0.46, Z1 - 0.04, TS.METAL);                      // frame
  for (const [lx, lz] of [[X0 + 0.06, Z0 + 0.06], [X1 - 0.12, Z0 + 0.06], [X0 + 0.06, Z1 - 0.12], [X1 - 0.12, Z1 - 0.12]]) deco.box(lx, y, lz, lx + 0.06, y + 0.36, lz + 0.06, TS.METAL, { faces: FACE.SIDES });
  deco.box(X0 + 0.06, y + 0.46, Z0 + 0.06, X1 - 0.06, y + 0.62, Z1 - 0.06, TS.CARPET);                      // mattress + sheet
  // pillow at the head, headboard / footboard
  const px = hx + fx * 0.3, pz = hz + fz * 0.3;
  if (along) deco.box(Math.min(hx, px), y + 0.62, Z0 + 0.12, Math.max(hx, px), y + 0.72, Z1 - 0.12, TS.CARPET);
  else deco.box(X0 + 0.12, y + 0.62, Math.min(hz, pz), X1 - 0.12, y + 0.72, Math.max(hz, pz), TS.CARPET);
  const board = (bx, bz, hgt) => (along ? deco.box(bx - 0.03, y + 0.3, Z0, bx + 0.03, y + hgt, Z1, TS.METAL) : deco.box(X0, y + 0.3, bz - 0.03, X1, y + hgt, bz + 0.03, TS.METAL));
  board(hx, hz, 1.05); board(ex, ez, 0.8);
  if (o.rumpled !== false && rng.chance(0.5)) {
    // a blanket thrown back over the foot
    if (along) deco.box(Math.min(ex, ex - fx * 0.7), y + 0.62, Z0 + 0.02, Math.max(ex, ex - fx * 0.7), y + 0.7, Z1 - 0.02, TS.CARPET);
    else deco.box(X0 + 0.02, y + 0.62, Math.min(ez, ez - fz * 0.7), X1 - 0.02, y + 0.7, Math.max(ez, ez - fz * 0.7), TS.CARPET);
  }
  deco.collider(X0, y, Z0, X1, y + 0.72, Z1);
}
// IV stand: pole, hook arms, a GLASS drip bag
function ivStand(ctx, x, z, y) {
  const { deco } = ctx;
  deco.box(x - 0.18, y, z - 0.18, x + 0.18, y + 0.05, z + 0.18, TS.METAL);
  deco.box(x - 0.02, y, z - 0.02, x + 0.02, y + 1.9, z + 0.02, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.2, y + 1.86, z - 0.015, x + 0.2, y + 1.9, z + 0.015, TS.METAL);
  deco.box(x + 0.1, y + 1.55, z - 0.04, x + 0.2, y + 1.84, z + 0.04, TS.GLASS, { emissive: 0.25, uv: 'fit' });
}
// patient monitor on a stand facing dir
function vitalsMonitor(ctx, x, z, y, dir) {
  const { deco } = ctx;
  deco.box(x - 0.15, y, z - 0.15, x + 0.15, y + 0.06, z + 0.15, TS.METAL);
  deco.box(x - 0.025, y, z - 0.025, x + 0.025, y + 1.25, z + 0.025, TS.METAL, { faces: FACE.SIDES });
  monitor(ctx, x, z, y + 1.15, dir);
}
// wheeled steel trolley
function trolley(ctx, x, z, y, alongX = true) {
  const { deco, rng } = ctx;
  const a = alongX ? 0.4 : 0.25, b = alongX ? 0.25 : 0.4;
  for (const sy of [0.25, 0.85]) deco.box(x - a, y + sy, z - b, x + a, y + sy + 0.04, z + b, TS.METAL);
  for (const [lx, lz] of [[x - a, z - b], [x + a - 0.04, z - b], [x - a, z + b - 0.04], [x + a - 0.04, z + b - 0.04]]) deco.box(lx, y + 0.05, lz, lx + 0.04, y + 0.89, lz + 0.04, TS.METAL, { faces: FACE.SIDES });
  for (let k = 0; k < 3; k++) if (rng.chance(0.7)) { const ox = rng.float(-a + 0.1, a - 0.2), oz = rng.float(-b + 0.08, b - 0.16); deco.box(x + ox, y + 0.89, z + oz, x + ox + 0.1, y + 0.89 + rng.float(0.05, 0.18), z + oz + 0.08, k ? TS.GLASS : TS.METAL, { emissive: k ? 0.3 : 0, uv: 'fit' }); }
  deco.collider(x - a, y, z - b, x + a, y + 0.9, z + b, { obstacle: false });
}
// privacy curtain hanging from a ceiling rail along a world segment
function curtain(ctx, x0, z0, x1, z1, y, drawn = 0.5) {
  const { deco } = ctx;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  if (alongX) {
    deco.box(Math.min(x0, x1), y + 2.3, z0 - 0.02, Math.max(x0, x1), y + 2.34, z0 + 0.02, TS.RAIL);
    const len = Math.abs(x1 - x0) * drawn;
    deco.box(Math.min(x0, x1), y + 0.35, z0 - 0.025, Math.min(x0, x1) + len, y + 2.28, z0 + 0.025, TS.CARPET);
  } else {
    deco.box(x0 - 0.02, y + 2.3, Math.min(z0, z1), x0 + 0.02, y + 2.34, Math.max(z0, z1), TS.RAIL);
    const len = Math.abs(z1 - z0) * drawn;
    deco.box(x0 - 0.025, y + 0.35, Math.min(z0, z1), x0 + 0.025, y + 2.28, Math.min(z0, z1) + len, TS.CARPET);
  }
}
// full-height glass partition along a cell-edge line (axis aligned, integer coords)
// with steel mullions, head and sill; blocks pathing (edge bits) and movement
function glassWall(ctx, x0, z0, x1, z1, y, h = 3.0, o = {}) {
  const { g, deco } = ctx;
  const horiz = z0 === z1;
  const a = horiz ? Math.min(x0, x1) : Math.min(z0, z1), b = horiz ? Math.max(x0, x1) : Math.max(z0, z1);
  const L = horiz ? z0 : x0, th = 0.05;
  const seg = (p0, p1, y0, y1, t, tex, opt) => (horiz ? deco.box(p0, y0, L - t, p1, y1, L + t, tex, opt) : deco.box(L - t, y0, p0, L + t, y1, p1, tex, opt));
  // o.pane: the infill (GLASS by default; PANEL / METAL for insulated partitions)
  const pane = o.pane ?? TS.GLASS;
  seg(a, b, y, y + 0.12, 0.07, TS.METAL);
  if (pane === TS.GLASS) seg(a, b, y + 0.12, y + h - 0.1, th / 2, TS.GLASS, { emissive: o.emissive ?? 0.22, uv: 'fit', s: 1 });
  else seg(a, b, y + 0.12, y + h - 0.1, o.thick ?? 0.12, pane);
  seg(a, b, y + h - 0.1, y + h, 0.07, TS.METAL);
  for (let p = a; p <= b + 1e-6; p += pane === TS.GLASS ? 1 : 2) seg(p - 0.035, p + 0.035, y, y + h, (o.thick ?? 0.12) / 2 + 0.03, TS.METAL, { faces: FACE.SIDES });
  if (horiz) deco.collider(a, y, L - 0.06, b, y + h, L + 0.06, { obstacle: false });
  else deco.collider(L - 0.06, y, a, L + 0.06, y + h, b, { obstacle: false });
  // grid edges: the line runs between cells (L-1 | L)
  for (let p = a; p < b; p++) {
    if (horiz) { if (g.in(p, L - 1)) g.setEdge(p, L - 1, 2, true); }
    else if (g.in(L - 1, p)) g.setEdge(L - 1, p, 0, true);
  }
}
// decontamination shower gantry across a world line (alongX: spans x0..x1 at z)
function showerGantry(ctx, x0, z0, x1, z1, y, h = 2.7) {
  const { deco } = ctx;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const seg = (a0, a1, y0, y1, t, tex, o) => (alongX ? deco.box(a0, y0, z0 - t, a1, y1, z0 + t, tex, o) : deco.box(x0 - t, y0, a0, x0 + t, y1, a1, tex, o));
  const a = alongX ? Math.min(x0, x1) : Math.min(z0, z1), b = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  for (const p of [a, b - 0.14]) { seg(p, p + 0.14, y, y + h, 0.07, TS.METAL, { faces: FACE.SIDES | FACE.TOP }); }
  seg(a, b, y + h - 0.16, y + h, 0.09, TS.PIPE);
  seg(a + 0.2, b - 0.2, y + h - 0.22, y + h - 0.16, 0.05, TS.LIGHT, { uv: 'fit', emissive: 1 });
  for (let p = a + 0.45; p < b - 0.3; p += 0.6) seg(p, p + 0.1, y + h - 0.34, y + h - 0.16, 0.05, TS.METAL);
  // posts are solid; the lane under the gantry stays free
  if (alongX) { deco.collider(a, y, z0 - 0.08, a + 0.14, y + h, z0 + 0.08, { obstacle: false }); deco.collider(b - 0.14, y, z0 - 0.08, b, y + h, z0 + 0.08, { obstacle: false }); }
  else { deco.collider(x0 - 0.08, y, a, x0 + 0.08, y + h, a + 0.14, { obstacle: false }); deco.collider(x0 - 0.08, y, b - 0.14, x0 + 0.08, y + h, b, { obstacle: false }); }
  deco.light(alongX ? (a + b) / 2 : x0, y + h - 0.6, alongX ? z0 : (a + b) / 2, [0.6, 0.85, 1], 5);
}
// big vertical pipe in a room corner / along a wall, floor to ceiling
function riser(ctx, x, z, y0, y1, r = 0.22) {
  const { deco } = ctx;
  deco.box(x - r, y0, z - r, x + r, y1, z + r, TS.PIPE);
  for (let by = y0 + 0.6; by < y1 - 0.3; by += 2.4) deco.box(x - r - 0.05, by, z - r - 0.05, x + r + 0.05, by + 0.12, z + r + 0.05, TS.METAL);
  deco.collider(x - r, y0, z - r, x + r, y1, z + r);
}
// steel-topped table (autopsy / instrument / work table) on a pedestal
function steelTable(ctx, x0, z0, x1, z1, y, o = {}) {
  const { deco } = ctx;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  deco.box(cx - 0.18, y, cz - 0.18, cx + 0.18, y + 0.82, cz + 0.18, TS.METAL, { faces: FACE.SIDES });
  deco.box(cx - 0.32, y, cz - 0.32, cx + 0.32, y + 0.06, cz + 0.32, TS.METAL);
  deco.box(x0, y + 0.82, z0, x1, y + 0.9, z1, o.top ?? TS.METAL);
  if (o.lip !== false) {
    deco.box(x0, y + 0.9, z0, x1, y + 0.96, z0 + 0.04, TS.METAL); deco.box(x0, y + 0.9, z1 - 0.04, x1, y + 0.96, z1, TS.METAL);
    deco.box(x0, y + 0.9, z0, x0 + 0.04, y + 0.96, z1, TS.METAL); deco.box(x1 - 0.04, y + 0.9, z0, x1, y + 0.96, z1, TS.METAL);
  }
  deco.collider(x0, y, z0, x1, y + 0.96, z1);
}
// server rack row along a world rect, fronts on both long faces
function rackRow(ctx, x0, z0, x1, z1, y, h = 2.2) {
  const { deco } = ctx;
  const alongX = x1 - x0 >= z1 - z0;
  const tex = alongX ? { pz: TS.MACHINE, nz: TS.MACHINE, px: TS.METAL, nx: TS.METAL, top: TS.METAL, bottom: TS.METAL } : { px: TS.MACHINE, nx: TS.MACHINE, pz: TS.METAL, nz: TS.METAL, top: TS.METAL, bottom: TS.METAL };
  const L = alongX ? x1 - x0 : z1 - z0;
  const n = Math.max(1, Math.round(L / 0.8));
  for (let k = 0; k < n; k++) {
    const a = k * L / n, b = (k + 1) * L / n - 0.03;
    if (alongX) deco.box(x0 + a, y, z0, x0 + b, y + h, z1, tex, { uv: 'fit' });
    else deco.box(x0, y, z0 + a, x1, y + h, z0 + b, tex, { uv: 'fit' });
  }
  deco.collider(x0, y, z0, x1, y + h, z1);
}

export { pitSet, openShape, largestBlob, freeMask, bestRect, markMask, glassLineL, doorLeafL, openShelf, lineOpening };
export { lbox, lcollider, cellsOf, canUse, use, flatOpen, canUseL, useL, okL, ok, setHeight, setHeightL, retexFloor, flightRect, flightL, snap, restore, tryFrames, sideOrder, wallSpots, wallBox, lightStrip, hangLight, paint, hazardLines, railAround, deckBridge, pit, upperWindows, edgeCells };
export { tank, labBench, fumeHood, cabinet, machineBlock, seatRow, counter, monitor, bed, ivStand, vitalsMonitor, trolley, curtain, glassWall, showerGantry, riser, steelTable, rackRow, isHosp };
export { STEP, nSteps, faced, FACE_KEY, COLD, WHITE, GREEN, RED, TEMPLATES, inRoom, wallConsoles, SKY_H, OPP, DIR_X, DIR_Z };
