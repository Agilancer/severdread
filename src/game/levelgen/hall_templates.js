// Room templates for the "hall" archetype (concert hall, movie theater, mosh
// pit, department store, flesh cathedral, neon arcade, carnival). They plug
// into the architect generator (gen_arch.js): gen_hall.js asks genArch to give
// the biggest room the theme's signature template and fills the other rooms
// with lobbies, backstage areas, bars, shops, crypts, sideshow tents...
//
// Every object uses the texture role that fits it: stage boards and pews are
// WOOD, seat cushions CARPET, curtains the theatre's WALL fabric, speakers the
// mosh pit's ACCENT speaker cloth, shelves the store's ACCENT shelf art,
// cabinets MACHINE fronts with SCREEN displays and NEON marquees, tents the
// carnival's striped canvas (WALL / CEIL / ACCENT), bones ACCENT, flesh WALL2.
//
// Templates receive ctx = {g, deco, rng, theme, style, room, cells, depth, boss}
// and must keep room.reserved cells (exit approaches) flat and walkable.
import { TS, F, HAZ, OPP, DIR_X, DIR_Z, SKY_H } from './common.js';
import { FACE } from './deco.js';
import { TEMPLATES, makePit, bridge, freeRect, eachCell, inRoom, scatterProps, wallConsoles, tree } from './gen_arch.js';

const STEP = 0.6;                                   // stair rise per cell
const FACE_KEY = ['px', 'nx', 'pz', 'nz'];          // box face key by outward world direction
const FACE_BIT = [FACE.PX, FACE.NX, FACE.PZ, FACE.NZ];
const nSteps = (dh) => Math.max(1, Math.ceil(Math.abs(dh) / STEP - 1e-6));

// ======================================================================
// frames: a rectangle seen from one of its walls
// side: 0 = +x wall, 1 = -x wall, 2 = +z wall, 3 = -z wall
// t = distance from that wall (cell rows, 0 = against it), s = along it
// ======================================================================
export function frame(R, side) {
  const alongZ = side >= 2;
  const L = alongZ ? R.h : R.w, Wd = alongZ ? R.w : R.h;
  const away = [1, 0, 3, 2][side];          // world direction of +t
  const lat = alongZ ? 0 : 2;               // world direction of +s
  const pt = (t, s) => (side === 3 ? [R.x + s, R.z + t] : side === 2 ? [R.x + s, R.z + R.h - t] : side === 1 ? [R.x + t, R.z + s] : [R.x + R.w - t, R.z + s]);
  const cell = (t, s) => { const [x, z] = pt(t + 0.5, s + 0.5); return [Math.floor(x), Math.floor(z)]; };
  const rect = (t0, s0, dt, ds) => {
    const [ax, az] = pt(t0, s0), [bx, bz] = pt(t0 + dt, s0 + ds);
    return [Math.min(ax, bx), Math.min(az, bz), Math.abs(bx - ax), Math.abs(bz - az)];
  };
  const dirOf = (k) => (k === 'away' ? away : k === 'toward' ? OPP[away] : k === 'lat' ? lat : k === 'latN' ? OPP[lat] : k);
  return { side, L, Wd, away, toward: OPP[away], lat, latN: OPP[lat], pt, cell, rect, dirOf, R };
}
// box in frame coordinates (t0..t1 along the depth, s0..s1 across, y0..y1 world)
function lbox(deco, Fr, t0, t1, s0, s1, y0, y1, tex, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.box(ax, y0, az, bx, y1, bz, tex, o);
}
function lcollider(deco, Fr, t0, t1, s0, s1, y0, y1, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.collider(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), o);
}
// texture object with one face (facing world direction dir) different from the rest
const faced = (dir, front, side, top = side) => ({ side, top, bottom: side, [FACE_KEY[dir]]: front });

function cellsOf(g, x0, z0, w, h) {
  const out = [];
  for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) if (g.in(x, z)) out.push(g.idx(x, z));
  return out;
}
// rect free of exit reservations (and of cells already used by this template)
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
const canUseL = (ctx, Fr, t0, s0, dt, ds, m = 0) => canUse(ctx, ...Fr.rect(t0, s0, dt, ds), m);
const useL = (ctx, Fr, t0, s0, dt, ds) => use(ctx, ...Fr.rect(t0, s0, dt, ds));
// all cells of the rect open, flat at the room floor and not special
function flatOpen(ctx, x0, z0, w, h) {
  const { g, room: r } = ctx;
  for (const i of cellsOf(g, x0, z0, w, h)) {
    if (!g.type[i] || Math.abs(g.floor[i] - r.floor) > 0.01 || (g.flags[i] & (F.PIT | F.HAZARD | F.STAIR | F.OBSTACLE | F.BRIDGE | F.WATER)) || g.edge[i]) return false;
  }
  return true;
}
const okL = (ctx, Fr, t0, s0, dt, ds, m = 0) => canUseL(ctx, Fr, t0, s0, dt, ds, m) && flatOpen(ctx, ...Fr.rect(t0, s0, dt, ds));

// raise / lower a world rect to height h; returns the cells
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
function retex(ctx, cells, o) {
  const { g } = ctx;
  for (const i of cells) {
    if (!g.type[i]) continue;
    if (o.floorTex !== undefined && !(g.flags[i] & (F.STAIR | F.PIT | F.HAZARD))) g.floorTex[i] = o.floorTex;
    if (o.wallTex !== undefined) g.wallTex[i] = o.wallTex;
  }
}

// straight flight filling a world rect, climbing toward dir from y0 to y1
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

// solid cells around the room (its walls) get a texture
function retexWalls(ctx, slot, filter) {
  const { g, room: r } = ctx;
  for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
    if (!g.in(x, z) || inRoom(r, x, z)) continue;
    const i = g.idx(x, z);
    if (g.type[i] || (filter && !filter(i))) continue;
    g.wallTex[i] = slot;
  }
}
// thin strip boxes on every solid wall face of the room at height y0..y1
function wallStrip(ctx, y0, y1, tex, o = {}) {
  const { g, deco, room: r } = ctx;
  const th = o.thick ?? 0.05;
  for (const i of ctx.cells) {
    if (!g.type[i] || (g.flags[i] & (F.DOOR))) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    const base = g.floor[i];
    if (base + y1 > g.ceil[i] - 0.1 && !g.sky[i]) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (!g.in(nx, nz) || g.type[g.idx(nx, nz)]) continue;
      if (o.every && ((d < 2 ? z : x) % o.every)) continue;
      const a0 = o.inset ?? 0, a1 = 1 - (o.inset ?? 0);
      if (d === 0) deco.box(x + 1 - th, base + y0, z + a0, x + 1, base + y1, z + a1, tex, { emissive: o.emissive, uv: o.uv, faces: FACE.NX | FACE.TOP | FACE.BOTTOM });
      else if (d === 1) deco.box(x, base + y0, z + a0, x + th, base + y1, z + a1, tex, { emissive: o.emissive, uv: o.uv, faces: FACE.PX | FACE.TOP | FACE.BOTTOM });
      else if (d === 2) deco.box(x + a0, base + y0, z + 1 - th, x + a1, base + y1, z + 1, tex, { emissive: o.emissive, uv: o.uv, faces: FACE.NZ | FACE.TOP | FACE.BOTTOM });
      else deco.box(x + a0, base + y0, z, x + a1, base + y1, z + th, tex, { emissive: o.emissive, uv: o.uv, faces: FACE.PZ | FACE.TOP | FACE.BOTTOM });
    }
  }
}
// free wall-side spots: [x, z, dirToWall] for cells along the room edge
function wallSpots(ctx, needFree = true) {
  const { g, room: r } = ctx;
  const out = [];
  for (let x = r.x; x < r.x + r.w; x++) { out.push([x, r.z, 3]); out.push([x, r.z + r.h - 1, 2]); }
  for (let z = r.z; z < r.z + r.h; z++) { out.push([r.x, z, 1]); out.push([r.x + r.w - 1, z, 0]); }
  return out.filter(([x, z, d]) => {
    const nx = x + DIR_X[d], nz = z + DIR_Z[d];
    if (!g.in(nx, nz) || g.type[g.idx(nx, nz)]) return !needFree || (canUse(ctx, x, z, 1, 1) && flatOpen(ctx, x, z, 1, 1));
    return false;
  });
}
function hangLight(ctx, x, z, ceilY, drop, color, radius = 7, o = {}) {
  const { deco } = ctx;
  deco.box(x - 0.03, ceilY - drop, z - 0.03, x + 0.03, ceilY, z + 0.03, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.28, ceilY - drop - 0.22, z - 0.28, x + 0.28, ceilY - drop, z + 0.28, TS.METAL);
  deco.box(x - 0.22, ceilY - drop - 0.26, z - 0.22, x + 0.22, ceilY - drop - 0.22, z + 0.22, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.light(x, ceilY - drop - 0.6, z, color, radius, o);
}
function chandelier(ctx, x, z, ceilY, o = {}) {
  const { deco } = ctx;
  const drop = o.drop ?? 1.6, R = o.size ?? 0.9, y = ceilY - drop;
  deco.box(x - 0.03, y, z - 0.03, x + 0.03, ceilY, z + 0.03, TS.METAL, { faces: FACE.SIDES });
  const ring = o.ringTex ?? TS.METAL;
  deco.box(x - R, y - 0.08, z - R, x + R, y, z - R + 0.08, ring);
  deco.box(x - R, y - 0.08, z + R - 0.08, x + R, y, z + R, ring);
  deco.box(x - R, y - 0.08, z - R, x - R + 0.08, y, z + R, ring);
  deco.box(x + R - 0.08, y - 0.08, z - R, x + R, y, z + R, ring);
  deco.box(x - 0.12, y - 0.5, z - 0.12, x + 0.12, y, z + 0.12, ring);
  for (const [cx, cz] of [[x - R, z - R], [x + R, z - R], [x - R, z + R], [x + R, z + R], [x, z - R], [x, z + R], [x - R, z], [x + R, z]]) {
    deco.box(cx - 0.05, y, cz - 0.05, cx + 0.05, y + 0.22, cz + 0.05, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  deco.light(x, y - 0.4, z, o.color ?? [1, 0.82, 0.55], o.radius ?? 9, { flicker: !!o.flicker });
}
// short fence of posts + rail (no grid edges) used for decoration only
function candle(ctx, x, z, y, h = 0.3) {
  ctx.deco.box(x - 0.04, y, z - 0.04, x + 0.04, y + h, z + 0.04, TS.LIGHT, { uv: 'fit', emissive: 1 });
}

// ======================================================================
// shared builders
// ======================================================================
// Raised stage against the frame's t=0 wall, with flights at both front corners.
function buildStage(ctx, Fr, o) {
  const { room: r } = ctx;
  const n = nSteps(o.h);
  for (const inset of o.insets || [2, 3, 4, 5, 6]) {
    const s0 = inset, sw = Fr.Wd - 2 * inset;
    if (sw < (o.minW ?? 6)) break;
    if (!canUseL(ctx, Fr, 0, s0, o.S, sw, 1)) continue;
    const fl = [];
    for (const fs of [s0, s0 + sw - 2]) if (canUseL(ctx, Fr, o.S, fs, n + 1, 2)) fl.push(fs);
    if (!fl.length) continue;
    const y = r.floor + o.h;
    const cells = setHeightL(ctx, Fr, 0, s0, o.S, sw, y, { floorTex: o.floorTex ?? TS.WOOD, wallTex: o.faceTex ?? TS.WOOD, head: 3 });
    useL(ctx, Fr, 0, s0, o.S, sw);
    for (const fs of fl) { flightL(ctx, Fr, o.S, fs, n, 2, 'toward', r.floor, y); useL(ctx, Fr, o.S, fs, n + 1, 2); }
    return { s0, sw, S: o.S, h: o.h, y, n, cells, flights: fl };
  }
  return null;
}

// Raked seating: K tiers of 2 rows (legroom walkway in front, seats against
// the next riser) rising STEP per tier, aisle stair flights (0.3 per cell),
// optional flat top rows up to tEnd. Seats face the t=0 side.
function buildSeating(ctx, Fr, o) {
  const { g, deco, room: r } = ctx;
  const { T0, sA, Bw, K } = o;
  const y0 = o.y0 ?? r.floor;
  const tEnd = o.tEnd ?? T0 + 2 * K + 1;
  const top = y0 + K * STEP;
  const aisles = o.aisles || (Bw >= 26 ? [0, Math.floor(Bw / 3) - 1, Math.floor(2 * Bw / 3) - 1, Bw - 2] : Bw >= 13 ? [0, Math.floor(Bw / 2) - 1, Bw - 2] : [0, Bw - 2]);
  const isAisle = (s) => aisles.some((a) => s >= a && s < a + 2);
  const seatTex = o.seatTex ?? TS.CARPET, frameTex = o.frameTex ?? TS.WOOD;
  const tierCells = new Set();
  for (let t = T0; t < tEnd; t++) {
    const k = Math.min(K - 1, Math.floor((t - T0) / 2));
    for (let s = 0; s < Bw; s++) {
      if (isAisle(s) && t <= T0 + 2 * K - 2) continue;
      const y = t >= T0 + 2 * K ? top : y0 + (k + 1) * STEP;
      for (const i of setHeightL(ctx, Fr, t, sA + s, 1, 1, y, { floorTex: o.floorTex ?? TS.CARPET, wallTex: o.sideTex ?? TS.SIDE })) tierCells.add(i);
    }
  }
  // aisle flights: start one row early (on the floor in front) so every walkway row meets a matching step
  for (const a of aisles) flightL(ctx, Fr, T0 - 1, sA + a, 2 * K, 2, 'away', y0, top, { floorTex: TS.STAIR, sideTex: o.sideTex ?? TS.SIDE });
  useL(ctx, Fr, T0 - 1, sA, tEnd - T0 + 1, Bw);
  // seat rows
  const fwd = Fr.toward;
  for (let k = 0; k < K; k++) {
    const row = T0 + 2 * k + 1, y = y0 + (k + 1) * STEP;
    let s = 0;
    while (s < Bw) {
      if (isAisle(s)) { s++; continue; }
      let e = s;
      while (e < Bw && !isAisle(e)) e++;
      const a = sA + s + 0.08, b = sA + e - 0.08;
      if (o.bench) {
        lbox(deco, Fr, row + 0.25, row + 0.8, a, b, y + 0.38, y + 0.46, frameTex);
        lbox(deco, Fr, row + 0.82, row + 0.92, a, b, y + 0.5, y + 0.95, frameTex);
        for (let p = a; p <= b + 1e-6; p += Math.max(1, (b - a) / Math.max(1, Math.round((b - a) / 1.5)))) lbox(deco, Fr, row + 0.3, row + 0.92, p - 0.05, Math.min(b, p + 0.05), y, y + 0.46, frameTex, { faces: FACE.SIDES });
      } else {
        lbox(deco, Fr, row + 0.28, row + 0.84, a, b, y, y + 0.44, { top: seatTex, side: frameTex, bottom: frameTex, [FACE_KEY[fwd]]: seatTex });
        lbox(deco, Fr, row + 0.8, row + 0.96, a, b, y, y + 1.02, faced(fwd, seatTex, frameTex));
        for (let p = sA + s; p <= sA + e + 1e-6; p += 1) lbox(deco, Fr, row + 0.3, row + 0.96, Math.max(a, p - 0.035), Math.min(b, p + 0.035), y + 0.44, y + 0.68, frameTex);
      }
      lcollider(deco, Fr, row + 0.28, row + 0.96, a, b, y, y + 1.0);
      s = e;
    }
  }
  if (o.rails !== false) deco.railEdges(tierCells, { style: o.railStyle ?? ctx.style.railStyle });
  return { tierCells, top, tEnd, aisles };
}

// Balcony along a side of the frame (s in [s0, s0+bw)) from row tA to tB,
// reached by a flight inside the strip at its front end. Returns cells or null.
function buildBalcony(ctx, Fr, s0, bw, tA, tB, y, o = {}) {
  const { room: r } = ctx;
  const n = nSteps(y - r.floor);
  if (tB - tA < n + 2) return null;
  if (!canUseL(ctx, Fr, tA - 1, s0, tB - tA + 1, bw)) return null;
  if (!flatOpen(ctx, ...Fr.rect(tA - 1, s0, 1, bw))) return null;
  flightL(ctx, Fr, tA, s0, n, bw, 'away', r.floor, y);
  const cells = setHeightL(ctx, Fr, tA + n, s0, tB - tA - n, bw, y, { floorTex: o.floorTex ?? TS.CARPET, wallTex: o.wallTex ?? TS.SIDE });
  useL(ctx, Fr, tA - 1, s0, tB - tA + 1, bw);
  return cells;
}

// rect bridge over pit cells with a chosen deck texture (stone, wood, grate)
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
// rails around a pit, put on the walkable cells around it (except `skip` cells)
function railPit(ctx, pitCells, o = {}) {
  const { g, deco } = ctx;
  const pit = new Set(pitCells);
  const ring = new Set();
  for (const i of pit) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (!g.in(nx, nz)) continue;
      const j = g.idx(nx, nz);
      if (g.type[j] && !pit.has(j) && !(g.flags[j] & (F.PIT | F.STAIR)) && !(o.skip && o.skip.has(j))) ring.add(j);
    }
  }
  for (const i of o.extra || []) ring.add(i);
  deco.railEdges(ring, { style: o.style ?? ctx.style.railStyle, allow: o.allow });
  return ring;
}

// pick frame sides: short walls first (long room axis away from the feature wall)
function sideOrder(ctx, preferShort = true) {
  const { room: r, rng } = ctx;
  const a = r.w >= r.h ? [1, 0] : [3, 2], b = r.w >= r.h ? [3, 2] : [1, 0];
  rng.shuffle(a); rng.shuffle(b);
  return preferShort ? [...a, ...b] : [...b, ...a];
}

// ======================================================================
// signature templates
// ======================================================================
const HT = {};

// ---------------------------------------------------------------- auditorium
// concert hall / movie theater / screening room: stage (or screen) at one end,
// orchestra pit with a hazard (concert), raked seating of stair-flight aisles,
// railed balconies joined to the top cross aisle, chandeliers / sconces.
HT.auditorium = function auditorium(ctx) {
  const { g, deco, rng, room: r, theme } = ctx;
  const cinema = !!theme.params?.screen;
  const small = !r.signature;
  for (const side of sideOrder(ctx)) {
    const Fr = frame(r, side);
    if (Fr.L < 15 || Fr.Wd < 11) continue;
    ctx.used = new Set();
    const m = deco.mark();
    const res = buildAuditorium(ctx, Fr, cinema, small);
    if (res) { r.lit = true; return; }
    deco.rollback(m);
  }
  TEMPLATES.hall(ctx);
};

function buildAuditorium(ctx, Fr, cinema, small) {
  const { g, deco, rng, room: r, theme } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  const S = cinema ? (small ? 2 : 3) : Math.max(4, Math.min(6, Math.round(L * 0.2)));
  const hS = cinema ? STEP : 2 * STEP;
  const top = r.floor + r.ceilH;
  // plan everything first (no grid writes until every check passes)
  const stageInsets = Wd >= 18 ? [2, 3, 4, 5] : [2, 3];
  const n = nSteps(hS);
  let stage = null;
  for (const inset of stageInsets) {
    const s0 = inset, sw = Wd - 2 * inset;
    if (sw < 7) break;
    if (!canUseL(ctx, Fr, 0, s0, S, sw, 1)) continue;
    const fl = [s0, s0 + sw - 2].filter((fs) => canUseL(ctx, Fr, S, fs, n + 1, 2) && flatOpen(ctx, ...Fr.rect(S, fs, n + 1, 2)));
    if (!fl.length) continue;
    stage = { s0, sw, fl };
    break;
  }
  if (!stage) return null;
  const pit = !cinema && !small && stage.sw >= 12 && L >= 24;
  const T0 = S + (pit ? 3 : n) + 2;
  // seating block and balconies across the width
  const bw = Wd >= 24 ? 3 : Wd >= 20 ? 2 : 0;
  let plan = null;
  for (const bwTry of bw ? [bw, 0] : [0]) {
    const sA = bwTry + 2, Bw = Wd - 2 * bwTry - 4;
    if (Bw < 7) continue;
    for (let K = Math.min(small ? 4 : 6, Math.floor((L - T0 - 1) / 2)); K >= 2; K--) {
      let tEnd = T0 + 2 * K + 1;
      if (L - tEnd <= 2) tEnd = L;
      if (!canUseL(ctx, Fr, T0 - 1, sA, tEnd - T0 + 1, Bw, 1)) continue;
      if (!flatOpen(ctx, ...Fr.rect(T0 - 2, sA, 1, Bw))) continue;
      plan = { sA, Bw, K, tEnd, bw: bwTry };
      break;
    }
    if (plan) break;
  }
  if (!plan) return null;

  // ---- stage
  const ys = r.floor + hS;
  const { s0, sw } = stage;
  setHeightL(ctx, Fr, 0, s0, S, sw, ys, { floorTex: TS.WOOD, wallTex: TS.WOOD, head: 3 });
  useL(ctx, Fr, 0, s0, S, sw);
  for (const fs of stage.fl) { flightL(ctx, Fr, S, fs, n, 2, 'toward', r.floor, ys); useL(ctx, Fr, S, fs, n + 1, 2); }
  const curtainTex = TS.WALL;
  const valY = Math.min(top - 1.2, ys + (small ? 3.6 : 5.5));
  // proscenium: pillars at the front corners, valance and arch wall above
  if (!small) {
    for (const ps of [s0 + 0.45, s0 + sw - 0.45]) {
      const [px, pz] = Fr.pt(S - 0.45, ps);
      deco.pillar(px, pz, 0.6, ys, valY, { tex: TS.PILLAR });
    }
    lbox(deco, Fr, S - 0.95, S - 0.65, s0, s0 + sw, valY - 1.1, valY, curtainTex, { faces: FACE.SIDES | FACE.BOTTOM });
    lbox(deco, Fr, S - 1.0, S - 0.6, s0 - 0.1, s0 + sw + 0.1, valY, valY + 0.3, TS.TRIM);
    if (top - valY > 1.2) lbox(deco, Fr, S - 1.0, S - 0.7, s0 - 0.3, s0 + sw + 0.3, valY + 0.3, top, TS.ACCENT, { faces: FACE.SIDES });
    // open main curtain gathered at both sides
    for (const [a, b] of [[s0 + 0.8, s0 + 2.1], [s0 + sw - 2.1, s0 + sw - 0.8]]) lbox(deco, Fr, S - 0.9, S - 0.6, a, b, ys, valY - 1.1, curtainTex, { faces: FACE.SIDES });
  }
  // footlights along the stage front
  for (let s = s0 + 2.5; s < s0 + sw - 2.4; s += 1.5) lbox(deco, Fr, S - 0.22, S - 0.05, s - 0.2, s + 0.2, ys, ys + 0.1, TS.LIGHT, { uv: 'fit', emissive: 1 });
  if (cinema) {
    // the screen: framed, emissive, with masking curtains
    const y0 = ys + 0.7, y1 = Math.min(top - 0.8, ys + (small ? 3.6 : 6.2));
    lbox(deco, Fr, 0, 0.05, s0 + 0.6, s0 + sw - 0.6, y0, y1, TS.SCREEN, { uv: 'fit', emissive: 0.85, faces: FACE_BIT[Fr.away] });
    lbox(deco, Fr, 0, 0.12, s0 + 0.4, s0 + sw - 0.4, y0 - 0.2, y0, TS.TRIM);
    lbox(deco, Fr, 0, 0.12, s0 + 0.4, s0 + sw - 0.4, y1, y1 + 0.2, TS.TRIM);
    for (const [a, b] of [[s0, s0 + 0.6], [s0 + sw - 0.6, s0 + sw]]) lbox(deco, Fr, 0, 0.35, a, b, ys, y1 + 0.2, curtainTex);
    // speaker cabinets under the screen sides
    for (const sp of [s0 + 0.7, s0 + sw - 1.7]) lbox(deco, Fr, 0.1, 0.7, sp, sp + 1, ys, ys + 1.4, faced(Fr.away, TS.MACHINE, TS.METAL), { solid: true });
    deco.light(...xyz(Fr, 1.2, s0 + sw / 2, (y0 + y1) / 2), [0.7, 0.8, 1], 10);
  } else if (!small) {
    // organ: wooden case with pipes rising in an arch against the back wall
    const pw = Math.min(sw - 4, 9), pa = s0 + (sw - pw) / 2;
    lbox(deco, Fr, 0, 0.9, pa, pa + pw, ys, ys + 1.3, faced(Fr.away, TS.WOOD, TS.WOOD, TS.TRIM), { solid: true });
    const np = Math.floor(pw / 0.42);
    for (let k = 0; k < np; k++) {
      const u = (k + 0.5) / np, h = 2.2 + Math.sin(u * Math.PI) * Math.min(5, top - ys - 4);
      const sp = pa + k * 0.42 + 0.06;
      lbox(deco, Fr, 0.15, 0.45, sp, sp + 0.3, ys + 1.3, ys + 1.3 + h, TS.PIPE, { faces: FACE.SIDES | FACE.TOP });
    }
    // grand piano + chairs and music stands
    const pc = s0 + sw * 0.3;
    lbox(deco, Fr, S - 3.2, S - 1.8, pc, pc + 1.6, ys + 0.7, ys + 1.0, TS.WOOD, { solid: true });
    for (const [a, b] of [[S - 3.1, pc + 0.1], [S - 2.0, pc + 1.4], [S - 3.1, pc + 1.4]]) lbox(deco, Fr, a, a + 0.08, b, b + 0.08, ys, ys + 0.7, TS.WOOD);
    for (let k = 0; k < Math.floor(sw / 2.5); k++) {
      const sc = s0 + 1.6 + k * 2.4;
      if (sc > s0 + sw - 1.5 || Math.abs(sc - (pc + 0.8)) < 1.6) continue;
      const tt = 1.6 + (k % 2) * 1.2;
      lbox(deco, Fr, tt, tt + 0.45, sc - 0.22, sc + 0.22, ys + 0.42, ys + 0.48, TS.WOOD);
      lbox(deco, Fr, tt + 0.38, tt + 0.45, sc - 0.22, sc + 0.22, ys + 0.48, ys + 0.95, TS.WOOD);
      lbox(deco, Fr, tt - 0.5, tt - 0.46, sc - 0.02, sc + 0.02, ys, ys + 1.1, TS.METAL);
      lbox(deco, Fr, tt - 0.55, tt - 0.45, sc - 0.25, sc + 0.25, ys + 1.0, ys + 1.3, TS.METAL);
    }
  }
  // stage lighting truss (girder) with spot cans
  if (!small) {
    const ty = Math.min(top - 0.8, valY - 0.2);
    lbox(deco, Fr, S - 2.2, S - 1.85, s0 + 0.5, s0 + sw - 0.5, ty, ty + 0.35, TS.BEAM);
    for (let s = s0 + 1.5; s < s0 + sw - 1; s += 2.2) {
      lbox(deco, Fr, S - 2.15, S - 1.9, s - 0.15, s + 0.15, ty - 0.4, ty, TS.METAL);
      lbox(deco, Fr, S - 1.95, S - 1.85, s - 0.12, s + 0.12, ty - 0.36, ty - 0.08, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE_BIT[Fr.away] });
    }
    deco.light(...xyz(Fr, S * 0.5, s0 + sw * 0.3, ys + 2.5), [1, 0.9, 0.7], 8);
    deco.light(...xyz(Fr, S * 0.5, s0 + sw * 0.7, ys + 2.5), [1, 0.9, 0.7], 8);
  }
  // ---- orchestra pit with a hazard (concert)
  if (pit) {
    const kind = ctx.rng.pick(ctx.style.hazards.filter((k) => k !== 'water')) || 'spikes';
    const pa = s0 + 3, pw = sw - 6;
    const [px, pz, pW, pH] = Fr.rect(S, pa, 3, pw);
    makePit(ctx, px, pz, pW, pH, kind, 2.4);
    useL(ctx, Fr, S, pa, 3, pw);
    const pitCells = cellsOf(g, px, pz, pW, pH).filter((i) => g.flags[i] & F.PIT);
    railPit(ctx, pitCells, { style: ctx.style.railStyle });
  }
  // ---- seating
  const seat = buildSeating(ctx, Fr, { T0, sA: plan.sA, Bw: plan.Bw, K: plan.K, tEnd: plan.tEnd, floorTex: TS.CARPET, sideTex: TS.SIDE, seatTex: TS.CARPET, frameTex: cinema ? TS.METAL : TS.WOOD });
  const yTop = seat.top;
  // ---- balconies along both side walls, joined to the top rows
  const balc = [];
  if (plan.bw) {
    for (const bs of [0, Wd - plan.bw]) {
      const cells = buildBalcony(ctx, Fr, bs, plan.bw, T0, plan.tEnd, yTop, { floorTex: TS.CARPET });
      if (cells) {
        balc.push(...cells);
        // the walkway between balcony and seating rises to the top rows at the back
        const ws = bs === 0 ? plan.bw : Wd - plan.bw - 2;
        const tb = T0 + 2 * plan.K;
        if (plan.tEnd > tb) for (const i of setHeightL(ctx, Fr, tb, ws, plan.tEnd - tb, 2, yTop, { floorTex: TS.CARPET, wallTex: TS.SIDE })) balc.push(i);
      }
    }
    if (balc.length) deco.railEdges(new Set([...balc, ...seat.tierCells]), { style: ctx.style.railStyle });
  }
  // ---- projector / sound desk at the top
  const mid = Math.floor(Wd / 2);
  if (plan.tEnd - (T0 + 2 * plan.K) >= 1) {
    const tt = plan.tEnd - 1;
    if (cinema) {
      lbox(deco, Fr, tt + 0.2, tt + 0.9, mid - 0.4, mid + 0.4, yTop, yTop + 1.0, TS.METAL, { solid: true });
      lbox(deco, Fr, tt + 0.1, tt + 0.7, mid - 0.35, mid + 0.35, yTop + 1.0, yTop + 1.45, faced(Fr.toward, TS.LIGHT, TS.METAL), { emissive: 0.6 });
    }
  }
  // ---- lights: chandeliers (concert) or wall sconces (cinema)
  if (!cinema && !small) {
    for (const tt of [T0 + 2, Math.floor((T0 + L) / 2) + 1]) if (tt < L - 1) chandelier(ctx, ...Fr.pt(tt, Wd / 2), top, { drop: Math.min(2.5, top - yTop - 3), size: 1.0, radius: 11 });
    // coffer beams across the ceiling
    for (let tt = S + 2; tt < L - 1; tt += 4) lbox(deco, Fr, tt, tt + 0.35, 0, Wd, top - 0.45, top, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
  }
  for (const side of [0, 1]) {
    const s = side ? Wd - 1 : 0, d = side ? Fr.lat : Fr.latN;
    for (let tt = S + 1; tt < L - 1; tt += 4) {
      const [cx, cz] = Fr.cell(tt, s);
      const i = g.idx(cx, cz);
      if (!g.type[i] || g.flags[i] & F.STAIR) continue;
      deco.wallLight(cx, cz, d, g.floor[i] + 2.3, cinema ? [1, 0.6, 0.4] : [1, 0.85, 0.6], { radius: 6 });
    }
  }
  return true;
}
function xyz(Fr, t, s, y) { const [x, z] = Fr.pt(t, s); return [x, y, z]; }

// ---------------------------------------------------------------- snapshots
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
// try a builder on each frame side; roll back grid + deco on failure
function tryFrames(ctx, sides, build, fallback) {
  const { deco, room: r } = ctx;
  for (const side of sides) {
    const Fr = frame(r, side);
    ctx.used = new Set();
    const m = deco.mark(), s = snap(ctx);
    let ok = false;
    try { ok = build(Fr); } catch (e) { ok = false; if (typeof console !== 'undefined') console.warn('hall template', r.template, e); }
    if (ok) return true;
    deco.rollback(m); restore(ctx, s);
  }
  ctx.used = new Set();
  if (fallback) fallback(ctx);
  return false;
}

// ---------------------------------------------------------------- props
// speaker cabinet stack (mosh pit ACCENT = speaker cloth) facing dir
function speakerStack(ctx, x0, z0, x1, z1, y, n, dir, o = {}) {
  const { deco } = ctx;
  const h = o.h ?? 1.0;
  for (let k = 0; k < n; k++) deco.box(x0 + (k % 2) * 0.03, y + k * h, z0 + (k % 2) * 0.03, x1 - (k % 2) * 0.03, y + (k + 1) * h - 0.04, z1 - (k % 2) * 0.03, faced(dir, TS.ACCENT, TS.METAL), { s: 1 });
  deco.collider(x0, y, z0, x1, y + n * h, z1);
}
// counter with a top and a front panel facing dir (world)
function counter(ctx, x0, z0, x1, z1, y, dir, o = {}) {
  const { deco } = ctx;
  const h = o.h ?? 1.05;
  deco.box(x0, y, z0, x1, y + h - 0.06, z1, faced(dir, o.front ?? TS.PANEL, o.side ?? TS.WOOD, o.side ?? TS.WOOD), { solid: true });
  deco.box(x0 - 0.05, y + h - 0.06, z0 - 0.05, x1 + 0.05, y + h, z1 + 0.05, o.top ?? TS.WOOD);
}
// bottles on wall shelves behind a bar (GLASS bottles on METAL shelf boards)
function bottleShelf(ctx, Fr, t0, s0, s1, y) {
  const { deco, rng } = ctx;
  for (const sy of [1.25, 1.75, 2.25]) {
    lbox(deco, Fr, t0, t0 + 0.32, s0, s1, y + sy - 0.05, y + sy, TS.METAL);
    for (let p = s0 + 0.1; p < s1 - 0.1; p += 0.22) if (rng.chance(0.8)) lbox(deco, Fr, t0 + 0.08, t0 + 0.2, p, p + 0.09, y + sy, y + sy + rng.float(0.2, 0.32), TS.GLASS, { emissive: 0.3, uv: 'fit' });
  }
}
function stool(ctx, x, z, y) {
  const { deco } = ctx;
  deco.box(x - 0.04, y, z - 0.04, x + 0.04, y + 0.72, z + 0.04, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.2, y + 0.72, z - 0.2, x + 0.2, y + 0.8, z + 0.2, TS.METAL);
}
function bench(ctx, Fr, t, s0, s1, y, tex = TS.WOOD) {
  const { deco } = ctx;
  lbox(deco, Fr, t + 0.2, t + 0.75, s0, s1, y + 0.4, y + 0.48, tex);
  lbox(deco, Fr, t + 0.75, t + 0.85, s0, s1, y + 0.48, y + 1.0, tex);
  for (const p of [s0 + 0.05, (s0 + s1) / 2 - 0.04, s1 - 0.13]) lbox(deco, Fr, t + 0.25, t + 0.8, p, p + 0.08, y, y + 0.4, tex, { faces: FACE.SIDES });
  lcollider(deco, Fr, t + 0.2, t + 0.85, s0, s1, y, y + 1.0);
}
// arcade cabinet in cell (x,z) with its back toward `back` side; facing world dir fdir
function cabinet(ctx, x, z, fdir, y, o = {}) {
  const { deco } = ctx;
  const fx = DIR_X[fdir], fz = DIR_Z[fdir];
  // body occupies the back 0.7 of the cell
  const x0 = x + (fx > 0 ? 0.05 : fx < 0 ? 0.25 : 0.08), x1 = x + (fx > 0 ? 0.75 : fx < 0 ? 0.95 : 0.92);
  const z0 = z + (fz > 0 ? 0.05 : fz < 0 ? 0.25 : 0.08), z1 = z + (fz > 0 ? 0.75 : fz < 0 ? 0.95 : 0.92);
  deco.box(x0, y, z0, x1, y + 1.9, z1, faced(fdir, o.front ?? TS.MACHINE, TS.METAL), { solid: true, uv: 'fit' });
  // screen + marquee + control deck on the front face
  const front = fdir === 0 ? x1 : fdir === 1 ? x0 : fdir === 2 ? z1 : z0;
  const sgn = fdir === 0 || fdir === 2 ? 1 : -1;
  const slab = (y0, y1, dep, tex, opt, inset = 0.12) => {
    if (fx !== 0) deco.box(Math.min(front, front + sgn * dep), y + y0, z0 + inset, Math.max(front, front + sgn * dep), y + y1, z1 - inset, tex, opt);
    else deco.box(x0 + inset, y + y0, Math.min(front, front + sgn * dep), x1 - inset, y + y1, Math.max(front, front + sgn * dep), tex, opt);
  };
  slab(1.05, 1.55, 0.03, TS.SCREEN, { uv: 'fit', emissive: 0.9 });
  slab(1.63, 1.86, 0.04, TS.NEON, { uv: 'fit', emissive: 1 }, 0.04);
  slab(0.84, 0.96, 0.2, TS.METAL, {}, 0.06);
}
function rack(ctx, Fr, t, s0, s1, y) {
  // clothing / costume rack: RAIL frame with hanging fabric (CARPET) pieces
  const { deco, rng } = ctx;
  lbox(deco, Fr, t + 0.47, t + 0.53, s0, s1, y + 1.55, y + 1.6, TS.RAIL);
  for (const p of [s0, s1 - 0.05]) lbox(deco, Fr, t + 0.47, t + 0.53, p, p + 0.05, y, y + 1.6, TS.RAIL, { faces: FACE.SIDES });
  for (let p = s0 + 0.15; p < s1 - 0.15; p += 0.18) if (rng.chance(0.85)) lbox(deco, Fr, t + 0.3, t + 0.7, p, p + 0.06, y + rng.float(0.6, 0.9), y + 1.5, TS.CARPET);
  lcollider(deco, Fr, t + 0.3, t + 0.7, s0, s1, y, y + 1.6);
}
function wallShelf(ctx, Fr, t0, s0, s1, y, h = 2.2, tex = TS.ACCENT) {
  // floor-standing shelving unit against the t=t0 wall; its front shows the shelf art
  const { deco } = ctx;
  lbox(deco, Fr, t0, t0 + 0.6, s0, s1, y, y + h, faced(Fr.away, tex, TS.METAL), { solid: true, uv: 'fit', s: 1 });
}
function bulbLine(ctx, ax, az, bx, bz, y, step = 0.6) {
  const { deco } = ctx;
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(len / step));
  for (let k = 0; k <= n; k++) {
    const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
    deco.box(x - 0.05, y - 0.1 - Math.sin(Math.PI * k / n) * 0.35, z - 0.05, x + 0.05, y - Math.sin(Math.PI * k / n) * 0.35, z + 0.05, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
}
function pole(ctx, x, z, y, h, tex = TS.WOOD, w = 0.12) {
  ctx.deco.box(x - w, y, z - w, x + w, y + h, z + w, tex, { faces: FACE.SIDES | FACE.TOP });
  ctx.deco.collider(x - w, y, z - w, x + w, y + h, z + w, { obstacle: false });
}

// ---------------------------------------------------------------- mosh pit
// stage with speaker stacks, amp line, drum riser and a lighting truss, crowd
// barrier, a sunken railed mosh pit with a spike/lava pit in its middle (and a
// grate bridge across it), a bar with bottle shelves and a neon sign, and a
// raised front-of-house desk at the back.
HT.moshpit = function moshpit(ctx) {
  tryFrames(ctx, sideOrder(ctx), (Fr) => buildMosh(ctx, Fr), TEMPLATES.hall);
  ctx.room.lit = true;
};
function buildMosh(ctx, Fr) {
  const { g, deco, rng, room: r, style } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 16 || Wd < 12) return false;
  const top = r.floor + r.ceilH;
  const hS = L >= 24 ? 3 * STEP : 2 * STEP;
  const S = L >= 24 ? 6 : 5;
  const st = buildStage(ctx, Fr, { S, h: hS, minW: 8, floorTex: TS.WOOD, faceTex: TS.SIDE, insets: [2, 3, 4] });
  if (!st) return false;
  const { s0, sw, y: ys, n } = st;
  const mid = Wd / 2;
  // speaker stacks at the stage front corners, facing the crowd
  for (const sa of [s0 + 0.1, s0 + sw - 1.6]) {
    const [ax, az] = Fr.pt(S - 2.0, sa), [bx, bz] = Fr.pt(S - 0.3, sa + 1.5);
    speakerStack(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), ys, Math.min(4, Math.floor((top - ys - 1) / 1.0)), Fr.away);
  }
  // amp line along the back of the stage
  for (let sa = s0 + 2.2; sa < s0 + sw - 2.8; sa += 1.3) {
    if (Math.abs(sa + 0.5 - mid) < 2.2) continue;
    lbox(deco, Fr, 0.15, 0.85, sa, sa + 1.1, ys, ys + 1.5, faced(Fr.away, TS.ACCENT, TS.METAL), { solid: true });
  }
  // drum riser + kit
  lbox(deco, Fr, 0.6, 3.0, mid - 1.6, mid + 1.6, ys, ys + 0.4, { top: TS.CARPET, side: TS.SIDE }, { solid: true });
  const dy = ys + 0.4;
  lbox(deco, Fr, 1.4, 2.0, mid - 0.35, mid + 0.35, dy, dy + 0.6, faced(Fr.away, TS.PAINT, TS.METAL));
  for (const [a, b] of [[mid - 1.2, 1.6], [mid + 0.8, 1.6], [mid - 0.7, 2.2], [mid + 0.3, 2.2]]) {
    lbox(deco, Fr, b, b + 0.04, a + 0.18, a + 0.22, dy, dy + 0.9, TS.METAL);
    lbox(deco, Fr, b - 0.25, b + 0.29, a - 0.07, a + 0.47, dy + 0.9, dy + 0.93, TS.METAL);
  }
  // mic stands
  for (const sm of [mid - 3, mid, mid + 3]) if (sm > s0 + 2 && sm < s0 + sw - 2) {
    lbox(deco, Fr, S - 1.2, S - 1.16, sm - 0.02, sm + 0.02, ys, ys + 1.5, TS.METAL);
    lbox(deco, Fr, S - 1.35, S - 1.0, sm - 0.17, sm + 0.17, ys, ys + 0.03, TS.METAL);
  }
  // lighting truss: towers at the stage front corners + front/back girders
  const yT = Math.min(top - 0.7, ys + 5.2);
  for (const sa of [s0 + 1.75, s0 + sw - 2.15]) lbox(deco, Fr, S - 0.75, S - 0.35, sa, sa + 0.4, ys, yT + 0.4, TS.BEAM, { solid: true });
  lbox(deco, Fr, S - 0.75, S - 0.35, s0 + 1.75, s0 + sw - 1.75, yT, yT + 0.4, TS.BEAM);
  lbox(deco, Fr, 1.2, 1.6, s0 + 1.75, s0 + sw - 1.75, yT, yT + 0.4, TS.BEAM);
  for (const sa of [s0 + 1.75, s0 + sw - 2.15]) lbox(deco, Fr, 1.2, S - 0.35, sa, sa + 0.4, yT, yT + 0.4, TS.BEAM);
  const cols = [[1, 0.15, 0.1], [0.75, 0.2, 1], [1, 0.35, 0.1], [0.3, 0.4, 1]];
  let c = 0;
  for (let sa = s0 + 2.6; sa < s0 + sw - 2.4; sa += 1.6) {
    lbox(deco, Fr, S - 0.7, S - 0.4, sa - 0.18, sa + 0.18, yT - 0.45, yT, TS.METAL);
    lbox(deco, Fr, S - 0.4, S - 0.35, sa - 0.14, sa + 0.14, yT - 0.4, yT - 0.08, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE_BIT[Fr.away] });
    if ((c++ % 2) === 0) deco.light(...xyz(Fr, S + 1.5, sa, ys + 1.2), cols[(c >> 1) % cols.length], 7, { pulse: true });
  }
  // crowd barrier between the stage flights
  const bt = S + n;
  if (sw > 6) {
    lbox(deco, Fr, bt + 0.38, bt + 0.62, s0 + 2.1, s0 + sw - 2.1, r.floor, r.floor + 1.1, TS.METAL);
    lbox(deco, Fr, bt + 0.2, bt + 0.8, s0 + 2.1, s0 + sw - 2.1, r.floor, r.floor + 0.06, TS.METAL);
    lcollider(deco, Fr, bt + 0.35, bt + 0.65, s0 + 2.1, s0 + sw - 2.1, r.floor, r.floor + 1.1);
    useL(ctx, Fr, bt, s0 + 2, 1, sw - 4);
  }
  // ---- the sunken mosh pit
  const T0 = bt + 3;
  const foh = L - T0 >= 16;
  const P = Math.min(12, L - T0 - (foh ? 8 : 3));
  const pw = Wd - 6;
  if (P >= 5 && pw >= 7 && okL(ctx, Fr, T0 - 1, 2, P + 2, pw + 2)) {
    const yP = r.floor - 2 * STEP;
    setHeightL(ctx, Fr, T0, 3, P, pw, yP, { floorTex: TS.FLOOR2, wallTex: TS.SIDE });
    useL(ctx, Fr, T0 - 1, 2, P + 2, pw + 2);
    const ms = 3 + Math.floor(pw / 2) - 1;
    flightL(ctx, Fr, T0, ms, 2, 3, 'toward', yP, r.floor);
    flightL(ctx, Fr, T0 + P - 2, ms, 2, 3, 'away', yP, r.floor);
    const mt = T0 + Math.floor(P / 2) - 1;
    flightL(ctx, Fr, mt, 3, 3, 2, 'latN', yP, r.floor);
    flightL(ctx, Fr, mt, 3 + pw - 2, 3, 2, 'lat', yP, r.floor);
    // rails around the rim
    const rim = new Set();
    for (let t = T0 - 1; t <= T0 + P; t++) for (let s = 2; s <= 3 + pw; s++) {
      if (t > T0 - 1 && t < T0 + P && s > 2 && s < 3 + pw) continue;
      const [x, z] = Fr.cell(t, s);
      rim.add(g.idx(x, z));
    }
    deco.railEdges(rim, { style: 'metal' });
    // "the pit": a deep hazard pit in the middle with a grate bridge
    const hw = Math.min(5, pw - 6), hh = Math.min(4, P - 4);
    if (hw >= 3 && hh >= 2) {
      const kind = rng.pick(style.hazards.filter((k) => k !== 'water'));
      const [px, pz, pW, pH] = Fr.rect(T0 + Math.floor((P - hh) / 2), 3 + Math.floor((pw - hw) / 2), hh, hw);
      makePit(ctx, px, pz, pW, pH, kind, 2 * STEP + 2.6);
      const pc = cellsOf(g, px, pz, pW, pH).filter((i) => g.flags[i] & F.PIT);
      const bs = 3 + Math.floor(pw / 2);
      const bcells = deckBridge(ctx, ...Fr.rect(T0 + Math.floor((P - hh) / 2), bs, hh, 1), yP, { floorTex: TS.GRATE, wallTex: TS.GRATE });
      railPit(ctx, pc.filter((i) => !bcells.includes(i)), { style: 'metal' });
      deco.light(px + pW / 2, yP - 1, pz + pH / 2, kind === 'lava' ? [1, 0.4, 0.1] : kind === 'poison' ? [0.4, 1, 0.3] : [1, 0.3, 0.2], 7, { pulse: true });
    }
    // crowd wash lights over the pit
    deco.light(...xyz(Fr, T0 + P / 2, Wd * 0.3, r.floor + 4), [0.9, 0.15, 0.3], 9, { pulse: true });
    deco.light(...xyz(Fr, T0 + P / 2, Wd * 0.7, r.floor + 4), [0.4, 0.2, 1], 9, { pulse: true });
  }
  // ---- front-of-house desk on a railed platform at the back
  if (foh) {
    const fw = 4, fsA = Math.floor(mid - fw / 2), ft = L - 4;
    if (okL(ctx, Fr, ft - 3, fsA, 7, fw)) {
      const cells = setHeightL(ctx, Fr, ft, fsA, 3, fw, r.floor + 2 * STEP, { floorTex: TS.GRATE, wallTex: TS.SIDE });
      flightL(ctx, Fr, ft - 2, fsA + 1, 2, 2, 'away', r.floor, r.floor + 2 * STEP);
      useL(ctx, Fr, ft - 3, fsA, 7, fw);
      deco.railEdges(new Set(cells), { style: 'metal' });
      for (const sc of [fsA, fsA + fw - 1]) { const [x, z] = Fr.cell(ft, sc); deco.console(x, z, r.floor + 2 * STEP, Fr.toward); }
    }
  }
  // ---- bar along a side wall
  buildBar(ctx, Fr, { minT: S + 3 });
  // ---- girders overhead with wall posts
  for (let t = S + 2; t < L - 1; t += 4) {
    lbox(deco, Fr, t, t + 0.45, 0, Wd, top - 0.6, top, TS.BEAM);
    for (const sp of [0.3, Wd - 0.3]) {
      const [x, z] = Fr.cell(t, sp < 1 ? 0 : Wd - 1);
      if (canUse(ctx, x, z, 1, 1, 0, 0) && flatOpen(ctx, x, z, 1, 1)) { const [px, pz] = Fr.pt(t + 0.22, sp); deco.pillar(px, pz, 0.45, r.floor, top, { tex: TS.BEAM, trim: false }); }
    }
  }
  return true;
}

// bar counter along one side wall of a frame (rows from minT), with bottles, neon and stools
function buildBar(ctx, Fr, o = {}) {
  const { g, deco, rng, room: r } = ctx;
  const len = Math.min(8, Fr.L - (o.minT ?? 1) - 2);
  if (len < 4) return false;
  for (const sideS of rng.shuffle([0, 1])) {
    for (let tb = Fr.L - len - 1; tb >= (o.minT ?? 1); tb--) {
      const s0 = sideS ? Fr.Wd - 3 : 0;
      if (!okL(ctx, Fr, tb, s0, len, 3)) continue;
      const sIn = sideS ? Fr.Wd - 1 : 0;           // bartender lane against the wall
      const sC = sideS ? Fr.Wd - 2 : 1;            // counter row
      const sS = sideS ? Fr.Wd - 3 : 2;            // stools row
      const fdir = sideS ? Fr.latN : Fr.lat;       // counter front faces into the room
      const [ax, az] = Fr.pt(tb + 1, sC + 0.15), [bx, bz] = Fr.pt(tb + len, sC + 0.85);
      counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r.floor, fdir, { front: TS.PANEL, side: TS.WOOD, top: TS.WOOD });
      // back shelves with bottles + neon sign on the wall
      const wallS = sideS ? Fr.Wd : 0, inS = sideS ? -1 : 1;
      const shelfS0 = sideS ? Fr.Wd - 0.32 : 0;
      for (let t = tb + 1; t < tb + len; t++) {
        const [x0, z0] = Fr.pt(t + 0.05, shelfS0), [x1, z1] = Fr.pt(t + 0.95, shelfS0 + 0.32);
        for (const sy of [1.25, 1.75, 2.25]) {
          deco.box(Math.min(x0, x1), r.floor + sy - 0.05, Math.min(z0, z1), Math.max(x0, x1), r.floor + sy, Math.max(z0, z1), TS.METAL);
          for (let p = 0.1; p < 0.85; p += 0.2) if (rng.chance(0.8)) {
            const [bx0, bz0] = Fr.pt(t + p, shelfS0 + 0.1), [bx1, bz1] = Fr.pt(t + p + 0.09, shelfS0 + 0.22);
            deco.box(Math.min(bx0, bx1), r.floor + sy, Math.min(bz0, bz1), Math.max(bx0, bx1), r.floor + sy + rng.float(0.2, 0.3), Math.max(bz0, bz1), TS.GLASS, { emissive: 0.3, uv: 'fit' });
          }
        }
      }
      const [nx0, nz0] = Fr.pt(tb + 1.5, wallS), [nx1, nz1] = Fr.pt(tb + len - 0.5, wallS + inS * 0.05);
      if (r.ceilH > 3.8) deco.box(Math.min(nx0, nx1), r.floor + 2.75, Math.min(nz0, nz1), Math.max(nx0, nx1), r.floor + 3.35, Math.max(nz0, nz1), TS.NEON, { uv: 'fit', emissive: 1, faces: FACE_BIT[fdir] });
      for (let t = tb + 1.5; t < tb + len; t += 1.2) { const [x, z] = Fr.pt(t, sS + 0.5); stool(ctx, x, z, r.floor); }
      useL(ctx, Fr, tb, s0, len, 3);
      for (let t = tb + 1; t < tb + len; t++) { const [x, z] = Fr.cell(t, sIn); g.flags[g.idx(x, z)] |= F.NOSPAWN; }
      deco.light(...xyz(Fr, tb + len / 2, sS, r.floor + 2.6), [1, 0.55, 0.3], 6);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- store
// department store floor: railed mezzanine along one wall (grand stair + an
// escalator), shelving aisles with signs, checkout counters, a pillar grid,
// fluorescent panels, a skylight, and a collapsed-floor sinkhole (hazard pit
// crossed by a plank bridge) fenced with barriers.
HT.store = function store(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildStore(ctx, Fr), HT.boutique);
  ctx.room.lit = true;
};
function buildStore(ctx, Fr) {
  const { g, deco, rng, room: r, style } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 14 || Wd < 14) return false;
  const top = r.floor + r.ceilH;
  const D = L >= 22 ? 5 : 4, hM = 6 * STEP, n = nSteps(hM);
  // longest free run along the wall for the mezzanine
  let best = null;
  for (let a = 0; a < Wd; a++) {
    let b = a;
    while (b < Wd && canUseL(ctx, Fr, 0, b, D + 1, 1)) b++;
    if (b - a >= 10 && (!best || b - a > best[1] - best[0])) best = [a, b];
    a = b;
  }
  if (!best) return false;
  const [ma, mb] = best;
  const mcx = Math.floor((ma + mb) / 2);
  // grand stair (3 wide) in the middle of the mezzanine front
  if (!okL(ctx, Fr, D, mcx - 1, n + 1, 3)) return false;
  const ym = r.floor + hM;
  const mez = setHeightL(ctx, Fr, 0, ma, D, mb - ma, ym, { floorTex: TS.FLOOR2, wallTex: TS.SIDE });
  useL(ctx, Fr, 0, ma, D, mb - ma);
  flightL(ctx, Fr, D, mcx - 1, n, 3, 'toward', r.floor, ym);
  useL(ctx, Fr, D, mcx - 1, n + 1, 3);
  // escalator near one end: steel steps, metal sides and a centre divider
  const es = rng.chance(0.5) ? ma + 1 : mb - 3;
  if (Math.abs(es - (mcx - 1)) >= 4 && okL(ctx, Fr, D, es, n + 1, 2)) {
    flightL(ctx, Fr, D, es, n, 2, 'toward', r.floor, ym, { floorTex: TS.GRATE, sideTex: TS.METAL });
    useL(ctx, Fr, D, es, n + 1, 2);
    const a = xyz(Fr, D + n, es + 1, r.floor + 0.95), b = xyz(Fr, D, es + 1, ym + 0.95);
    deco.bar(a, b, 0.12, 0.12, TS.METAL);
  }
  deco.railEdges(new Set(mez), { style: style.railStyle });
  // mezzanine: shelving against the wall, display tables
  for (let s = ma + 0.3; s < mb - 2.5; s += 3.2) if (Math.abs(s + 1.3 - (mcx + 0.5)) > 2.2) wallShelf(ctx, Fr, 0, s, s + 2.6, ym, 2.0);
  if (D >= 4) for (let s = ma + 2; s < mb - 3; s += 4.5) {
    if (Math.abs(s + 1 - (mcx + 0.5)) < 3) continue;
    const [x0, z0] = Fr.pt(2.2, s), [x1, z1] = Fr.pt(3.0, s + 1.6);
    deco.table(Math.min(x0, x1), Math.min(z0, z1), ym, Math.abs(x1 - x0), Math.abs(z1 - z0), TS.WOOD);
    deco.box(Math.min(x0, x1) + 0.15, ym + 0.8, Math.min(z0, z1) + 0.1, Math.min(x0, x1) + 0.55, ym + 1.05, Math.min(z0, z1) + 0.45, TS.CRATE, { uv: 'fit' });
  }
  // ---- sinkhole: collapsed floor over a hazard, plank bridge, barrier rails
  const T1 = D + n + 2;
  const holeT = T1 + 3 + rng.int(0, Math.max(0, L - T1 - 12));
  const hw = Math.min(6, Wd - 10), hh = 4;
  if (hw >= 4 && L - holeT >= hh + 3) {
    const hs = Math.floor((Wd - hw) / 2) + rng.int(-2, 2);
    if (okL(ctx, Fr, holeT - 1, hs - 1, hh + 2, hw + 2)) {
      const kind = rng.pick(style.hazards);
      const [px, pz, pW, pH] = Fr.rect(holeT, hs, hh, hw);
      makePit(ctx, px, pz, pW, pH, kind, kind === 'water' ? 2.5 : 3.0);
      useL(ctx, Fr, holeT - 1, hs - 1, hh + 2, hw + 2);
      const pc = cellsOf(g, px, pz, pW, pH).filter((i) => g.flags[i] & F.PIT);
      const bcells = deckBridge(ctx, ...Fr.rect(holeT, hs + Math.floor(hw / 2), hh, 1), r.floor, { floorTex: TS.WOOD, wallTex: TS.WOOD });
      railPit(ctx, pc.filter((i) => !bcells.includes(i)), { style: 'metal' });
      // broken floor slabs and a toppled shelf at the edge
      const [ex, ez] = Fr.pt(holeT - 0.9, hs + 0.2), [fx, fz] = Fr.pt(holeT - 0.2, hs + 2.6);
      deco.box(Math.min(ex, fx), r.floor, Math.min(ez, fz), Math.max(ex, fx), r.floor + 0.7, Math.max(ez, fz), faced(Fr.away, TS.ACCENT, TS.METAL), { solid: true });
    }
  }
  // ---- shelving aisles (runs across the floor, 2-wide aisles, cross aisles)
  const runLen = 5;
  for (let s = 2; s <= Wd - 3; s += 3) {
    for (let t = T1; t + runLen <= L - 4; t += runLen + 2) {
      if (!(freeRect(ctx, ...Fr.rect(t, s, runLen, 1), 1) && canUse(ctx, ...Fr.rect(t, s, runLen, 1), 0, 1) && flatOpen(ctx, ...Fr.rect(t, s, runLen, 1)))) continue;
      const tex = { top: TS.METAL, bottom: TS.METAL, side: TS.METAL, [FACE_KEY[Fr.lat]]: TS.ACCENT, [FACE_KEY[Fr.latN]]: TS.ACCENT };
      lbox(deco, Fr, t + 0.1, t + runLen - 0.1, s + 0.12, s + 0.88, r.floor, r.floor + 2.2, tex, { solid: true, uv: 'fit', s: 1 });
      useL(ctx, Fr, t, s, runLen, 1);
      for (let k = 0; k < 2; k++) if (rng.chance(0.7)) { const tt = t + 0.5 + rng.float(0, runLen - 1.6); lbox(deco, Fr, tt, tt + 0.7, s + 0.2, s + 0.8, r.floor + 2.2, r.floor + 2.2 + rng.float(0.3, 0.6), TS.CRATE, { uv: 'fit' }); }
      // aisle sign hanging over the next aisle
      if (top - r.floor > 4.2 && s + 2 <= Wd - 2) {
        lbox(deco, Fr, t + runLen / 2 - 0.6, t + runLen / 2 + 0.6, s + 1.45, s + 1.55, r.floor + 3.1, r.floor + 3.6, TS.SCREEN, { uv: 'fit', emissive: 0.6 });
        lbox(deco, Fr, t + runLen / 2 - 0.02, t + runLen / 2 + 0.02, s + 1.48, s + 1.52, r.floor + 3.6, top, TS.METAL);
      }
    }
  }
  // ---- checkout counters near the far wall
  for (let s = 2; s + 2 <= Wd - 2; s += 3) {
    if (!okL(ctx, Fr, L - 3, s, 2, 1)) continue;
    const [x0, z0] = Fr.pt(L - 2.8, s + 0.1), [x1, z1] = Fr.pt(L - 1.1, s + 0.9);
    counter(ctx, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), r.floor, Fr.lat, { front: TS.PANEL, side: TS.METAL, top: TS.METAL, h: 0.95 });
    const [rx, rz] = Fr.cell(L - 2, s);
    deco.box(rx + 0.3, r.floor + 0.95, rz + 0.3, rx + 0.7, r.floor + 1.25, rz + 0.7, TS.MACHINE, { uv: 'fit' });
    deco.box(rx + 0.4, r.floor + 1.25, rz + 0.4, rx + 0.6, r.floor + 1.55, rz + 0.6, TS.SCREEN, { uv: 'fit', emissive: 0.8 });
    useL(ctx, Fr, L - 3, s, 2, 1);
  }
  // ---- pillars where the floor is still free
  for (let t = T1 + 1; t < L - 2; t += 6) for (let s = 3; s < Wd - 3; s += 6) {
    const [x, z] = Fr.cell(t, s);
    if (canUse(ctx, x, z, 1, 1, 1, 1) && flatOpen(ctx, x, z, 1, 1)) { deco.pillar(x + 0.5, z + 0.5, 0.6, r.floor, top, { tex: TS.PILLAR }); use(ctx, x, z, 1, 1); }
  }
  // ---- skylight over the open floor + fluorescent panels elsewhere
  const sk = Fr.rect(Math.max(T1, Math.floor(L / 2) - 2), Math.floor(Wd / 2) - 2, 4, 4);
  const skySet = new Set();
  if (rng.chance(0.6)) for (const i of cellsOf(g, ...sk)) if (g.type[i] && !(g.flags[i] & F.STAIR)) { g.sky[i] = 1; g.ceil[i] = SKY_H; g.light[i] = Math.max(g.light[i], 0.95); skySet.add(i); }
  if (skySet.size) {
    const [x0, z0, w, h] = sk;
    for (let k = 0; k <= 4; k++) { deco.box(x0 + k * w / 4 - 0.05, top, z0, x0 + k * w / 4 + 0.05, top + 0.15, z0 + h, TS.BEAM); deco.box(x0, top, z0 + k * h / 4 - 0.05, x0 + w, top + 0.15, z0 + k * h / 4 + 0.05, TS.BEAM); }
  }
  for (let t = 1; t < L - 1; t += 4) for (let s = 1; s < Wd - 1; s += 4) {
    const [x, z] = Fr.cell(t, s);
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i]) continue;
    deco.lightPanel(x + 0.1, z + 0.35, x + 0.9, z + 0.65, g.ceil[i], [0.95, 0.98, 1], 6.5);
  }
  return true;
}

// ---------------------------------------------------------------- arcade
// rows of back-to-back cabinets (MACHINE art, SCREEN, NEON marquee), a glass
// prize counter with prize shelves and a neon sign, a light-up dance stage
// with steps, a sunken railed bumper-car floor, neon strips along the walls.
HT.arcade = function arcade(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => buildArcade(ctx, Fr), (c) => { wallStrip(c, 2.6, 2.7, TS.NEON, { emissive: 1 }); scatterProps(c, 0.4); });
  ctx.room.lit = true;
};
function buildArcade(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 9 || Wd < 9) return false;
  const top = r.floor + r.ceilH;
  const big = r.signature;
  const mid = Math.floor(Wd / 2);
  let T = 2;
  // prize counter against the t=0 wall
  if (Wd >= 12 && okL(ctx, Fr, 0, mid - 3, 2, 6)) {
    const [ax, az] = Fr.pt(1.15, mid - 3 + 0.4), [bx, bz] = Fr.pt(1.85, mid + 3 - 0.4);
    counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r.floor, Fr.away, { front: TS.GLASS, side: TS.METAL, top: TS.GLASS });
    deco.light(...xyz(Fr, 1.5, mid, r.floor + 0.6), [1, 0.4, 0.9], 4);
    // prize shelves on the wall behind
    for (const sy of [0.9, 1.6, 2.3]) {
      lbox(deco, Fr, 0, 0.4, mid - 2.6, mid + 2.6, r.floor + sy - 0.05, r.floor + sy, TS.METAL);
      for (let p = mid - 2.5; p < mid + 2.4; p += 0.45) if (rng.chance(0.75)) lbox(deco, Fr, 0.06, 0.36, p, p + 0.32, r.floor + sy, r.floor + sy + rng.float(0.2, 0.42), rng.chance(0.5) ? TS.CRATE2 : TS.CRATE, { uv: 'fit' });
    }
    if (top - r.floor > 3.6) lbox(deco, Fr, 0, 0.06, mid - 2.2, mid + 2.2, r.floor + 2.75, r.floor + 3.4, TS.NEON, { uv: 'fit', emissive: 1, faces: FACE_BIT[Fr.away] });
    useL(ctx, Fr, 0, mid - 3, 2, 6);
    T = 4;
  }
  // dance stage (signature room) on one side
  let danceS = -1;
  if (big && Wd >= 18) {
    for (const ds of rng.shuffle([2, Wd - 7])) {
      const dt = Math.floor(L / 2) - 2;
      if (!okL(ctx, Fr, dt - 1, ds - 1, 6, 7)) continue;
      const cells = setHeightL(ctx, Fr, dt, ds, 4, 5, r.floor + STEP, { floorTex: TS.FLOOR3, wallTex: TS.SIDE });
      flightL(ctx, Fr, dt + 1, ds === 2 ? ds + 5 : ds - 1, 2, 1, ds === 2 ? 'latN' : 'lat', r.floor, r.floor + STEP);
      useL(ctx, Fr, dt - 1, ds - 1, 6, 7);
      // light strips around the dance floor edge + two dance machines
      const [ex0, ez0, ew, eh] = Fr.rect(dt, ds, 4, 5);
      for (const [a, b, c, d] of [[ex0, ez0, ex0 + ew, ez0 + 0.06], [ex0, ez0 + eh - 0.06, ex0 + ew, ez0 + eh], [ex0, ez0, ex0 + 0.06, ez0 + eh], [ex0 + ew - 0.06, ez0, ex0 + ew, ez0 + eh]]) deco.box(a, r.floor + STEP, b, c, r.floor + STEP + 0.04, d, TS.LIGHT, { emissive: 1, uv: 'fit' });
      for (const k of [1, 3]) { const [cx, cz] = Fr.cell(dt + 3, ds + k); cabinet(ctx, cx, cz, Fr.toward, r.floor + STEP); }
      deco.light(ex0 + ew / 2, r.floor + 2.5, ez0 + eh / 2, [1, 0.2, 0.8], 8, { pulse: true });
      void cells;
      danceS = ds;
      break;
    }
  }
  // bumper cars: sunken railed floor (signature room)
  if (big && L >= 20 && Wd >= 16) {
    const bt = L - 9, bw = Math.min(10, Wd - 8), bs = Math.floor((Wd - bw) / 2);
    if (okL(ctx, Fr, bt - 1, bs - 1, 8, bw + 2)) {
      const yB = r.floor - 2 * STEP;
      setHeightL(ctx, Fr, bt, bs, 6, bw, yB, { floorTex: TS.FLOOR3, wallTex: TS.SIDE });
      useL(ctx, Fr, bt - 1, bs - 1, 8, bw + 2);
      flightL(ctx, Fr, bt, bs + 1, 2, 2, 'toward', yB, r.floor);
      flightL(ctx, Fr, bt, bs + bw - 3, 2, 2, 'toward', yB, r.floor);
      const rim = new Set();
      for (let t = bt - 1; t <= bt + 6; t++) for (let s = bs - 1; s <= bs + bw; s++) {
        if (t >= bt && t < bt + 6 && s >= bs && s < bs + bw) continue;
        const [x, z] = Fr.cell(t, s); if (g.type[g.idx(x, z)]) rim.add(g.idx(x, z));
      }
      deco.railEdges(rim, { style: ctx.style.railStyle });
      // cars + electrified ceiling grid
      for (let k = 0; k < Math.floor(bw / 2.5); k++) {
        const [cx, cz] = Fr.pt(bt + 2.5 + (k % 2) * 1.6, bs + 1 + k * 2.4);
        deco.car(cx - 0.5, cz - 0.4, yB, k % 2 === 0, { length: 1.3, tex: k % 3 === 0 ? TS.PAINT : TS.METAL });
        deco.box(cx - 0.03, yB + 1.1, cz - 0.03, cx + 0.03, top - 0.3, cz + 0.03, TS.METAL);
      }
      const [gx, gz, gw, gh] = Fr.rect(bt, bs, 6, bw);
      deco.box(gx, top - 0.35, gz, gx + gw, top - 0.3, gz + gh, TS.GRATE, { faces: FACE.BOTTOM | FACE.TOP });
      deco.light(gx + gw / 2, yB + 2.5, gz + gh / 2, [0.3, 0.8, 1], 9, { pulse: true });
    }
  }
  // cabinet rows: back-to-back pairs with 2-wide aisles and cross aisles
  let made = 0;
  for (let t = T; t + 1 < L - 2; t += 4) {
    for (let s = 2; s < Wd - 2; s++) {
      if ((s - 2) % 7 === 6) continue;                       // cross aisle
      if (danceS >= 0 && s >= danceS - 1 && s <= danceS + 5) continue;
      for (const [tt, fd] of [[t, Fr.toward], [t + 1, Fr.away]]) {
        const [x, z] = Fr.cell(tt, s);
        if (!freeRect(ctx, x, z, 1, 1, 1) || !canUse(ctx, x, z, 1, 1, 0, 0) || !flatOpen(ctx, x, z, 1, 1)) continue;
        cabinet(ctx, x, z, fd, r.floor);
        use(ctx, x, z, 1, 1);
        if ((made++ % 5) === 0) deco.light(x + 0.5 + DIR_X[fd] * 0.8, r.floor + 1.3, z + 0.5 + DIR_Z[fd] * 0.8, rng.pick([[0.2, 0.9, 1], [1, 0.3, 0.9], [0.6, 0.3, 1]]), 4);
      }
    }
  }
  if (made < 4) return false;
  // neon strips along the walls + ceiling panels
  wallStrip(ctx, 2.55, 2.65, TS.NEON, { emissive: 1 });
  wallStrip(ctx, 0.0, 0.08, TS.NEON, { emissive: 1 });
  for (let t = 1; t < L - 1; t += 4) for (let s = 2; s < Wd - 1; s += 5) {
    const [x, z] = Fr.cell(t, s);
    const i = g.idx(x, z);
    if (g.type[i] && !g.sky[i]) deco.lightPanel(x + 0.2, z + 0.2, x + 0.8, z + 0.8, g.ceil[i], [0.8, 0.6, 1], 5);
  }
  return true;
}

// ---------------------------------------------------------------- carnival
// open-air fairground (sky): dirt ground with boardwalk paths, a striped big
// top (canvas walls, stepped canvas roof inside and out, king poles, a circus
// ring around a railed fire pit with a plank walk, wooden bleachers), game
// booths with striped awnings, a carousel, a strength tester, a duck pond,
// light strings on wooden poles. `midway` is the same without the big top.
HT.carnival = function carnival(ctx) { buildFair(ctx, true); };
HT.midway = function midway(ctx) { buildFair(ctx, false); };
function buildFair(ctx, wantTop) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  for (const i of ctx.cells) { g.flags[i] |= F.OUTDOOR; if (!(g.flags[i] & (F.STAIR | F.PIT | F.HAZARD))) g.floorTex[i] = TS.FLOOR; }
  retexWalls(ctx, TS.WALL2);
  const cx = Math.floor(r.x + r.w / 2), cz = Math.floor(r.z + r.h / 2);
  // boardwalk paths: centre cross + exit approaches
  for (let x = r.x; x < r.x + r.w; x++) for (const z of [cz - 1, cz]) { const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & F.STAIR)) g.floorTex[i] = TS.FLOOR2; }
  for (let z = r.z; z < r.z + r.h; z++) for (const x of [cx - 1, cx]) { const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & F.STAIR)) g.floorTex[i] = TS.FLOOR2; }
  for (const i of r.reserved) if (g.type[i] && !(g.flags[i] & F.STAIR)) g.floorTex[i] = TS.FLOOR2;
  let tent = null;
  if (wantTop) {
    const m = deco.mark(), s = snap(ctx);
    try { tent = bigTop(ctx); } catch (e) { tent = null; }
    if (!tent) { deco.rollback(m); restore(ctx, s); ctx.used = new Set(); }
  }
  // booths along the walls
  let booths = 0;
  const maxB = Math.max(2, Math.floor((r.w + r.h) / 7));
  for (const side of rng.shuffle([0, 1, 2, 3])) {
    const Fr = frame(r, side);
    for (let s = 1; s + 3 <= Fr.Wd - 1 && booths < maxB; s++) {
      if (!okL(ctx, Fr, 0, s, 2, 3) || !canUseL(ctx, Fr, 0, s, 3, 3, 1, 0)) continue;
      booth(ctx, Fr, s);
      useL(ctx, Fr, 0, s - 1, 3, 5);
      booths++;
      s += 4;
    }
  }
  // carousel / strength tester / duck pond in free spots
  const feats = rng.shuffle(['carousel', 'strength', 'pond', 'carts']);
  for (const f of feats) {
    for (let k = 0; k < 40; k++) {
      const sz = f === 'carousel' ? 6 : f === 'pond' ? 5 : 2;
      if (r.w < sz + 4 || r.h < sz + 4) break;
      const x = rng.int(r.x + 2, r.x + r.w - sz - 2), z = rng.int(r.z + 2, r.z + r.h - sz - 2);
      if (!canUse(ctx, x, z, sz, sz, 1, 1) || !flatOpen(ctx, x, z, sz, sz)) continue;
      if (Math.abs(x + sz / 2 - cx) < sz / 2 + 1 && Math.abs(z + sz / 2 - cz) < sz / 2 + 1) continue;
      if (f === 'carousel') carousel(ctx, x, z, sz);
      else if (f === 'strength') strengthTester(ctx, x + 1, z + 1);
      else if (f === 'pond') {
        makePit(ctx, x + 1, z + 1, sz - 2, sz - 2, 'water', 0.35);
        for (const [a, b, c, d] of [[x + 0.8, z + 0.8, x + sz - 0.8, z + 1], [x + 0.8, z + sz - 1, x + sz - 0.8, z + sz - 0.8], [x + 0.8, z + 1, x + 1, z + sz - 1], [x + sz - 1, z + 1, x + sz - 0.8, z + sz - 1]]) deco.box(a, r.floor - 0.35, b, c, r.floor + 0.35, d, TS.WOOD);
        for (let q = 0; q < 4; q++) { const px = x + 1.4 + rng.float(0, sz - 2.8), pz = z + 1.4 + rng.float(0, sz - 2.8); deco.box(px - 0.12, r.floor - 0.3, pz - 0.12, px + 0.12, r.floor - 0.1, pz + 0.12, TS.PAINT, { uv: 'fit' }); }
      } else {
        // food cart: wooden box on wheels with a striped canopy
        deco.box(x + 0.2, r.floor + 0.3, z + 0.4, x + 1.8, r.floor + 1.2, z + 1.6, faced(0, TS.WOOD, TS.WOOD), { solid: true });
        for (const [wx, wz] of [[x + 0.4, z + 0.3], [x + 1.4, z + 0.3], [x + 0.4, z + 1.55], [x + 1.4, z + 1.55]]) deco.box(wx, r.floor, wz, wx + 0.25, r.floor + 0.35, wz + 0.15, TS.METAL);
        pole(ctx, x + 0.3, z + 0.5, r.floor + 1.2, 1.2, TS.WOOD, 0.04); pole(ctx, x + 1.7, z + 1.5, r.floor + 1.2, 1.2, TS.WOOD, 0.04);
        deco.box(x, r.floor + 2.4, z + 0.2, x + 2, r.floor + 2.55, z + 1.8, TS.ACCENT);
      }
      use(ctx, x - 1, z - 1, sz + 2, sz + 2);
      break;
    }
  }
  // light strings between wooden poles along the paths
  const poles = [];
  for (const [px, pz] of [[r.x + 1.5, cz - 1.5], [r.x + r.w - 1.5, cz + 0.5], [cx - 1.5, r.z + 1.5], [cx + 0.5, r.z + r.h - 1.5], [cx - 2.5, cz - 2.5], [cx + 2.5, cz + 2.5]]) {
    const x = Math.floor(px), z = Math.floor(pz);
    if (!inRoom(r, x, z) || (tent && x >= tent.x && x < tent.x + tent.w && z >= tent.z && z < tent.z + tent.h)) continue;
    if (!canUse(ctx, x, z, 1, 1, 0, 0)) continue;
    pole(ctx, px, pz, r.floor, 3.8, TS.WOOD, 0.08);
    deco.box(px - 0.15, r.floor + 3.8, pz - 0.15, px + 0.15, r.floor + 4.0, pz + 0.15, TS.LIGHT, { uv: 'fit', emissive: 1 });
    deco.light(px, r.floor + 3.4, pz, [1, 0.8, 0.45], 7);
    poles.push([px, pz]);
  }
  for (let k = 0; k + 1 < poles.length; k++) {
    const [ax, az] = poles[k], [bx, bz] = poles[k + 1];
    if (Math.hypot(bx - ax, bz - az) < 18) bulbLine(ctx, ax, az, bx, bz, r.floor + 3.75);
  }
  // crates and barrels by the walls
  scatterProps(ctx, 0.25);
  r.lit = true;
}
function booth(ctx, Fr, s) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor;
  // counter at the front row, prize shelves against the wall
  const [ax, az] = Fr.pt(1.2, s), [bx, bz] = Fr.pt(1.75, s + 3);
  counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), y, Fr.away, { front: TS.WOOD, side: TS.WOOD, top: TS.WOOD });
  for (const sy of [0.9, 1.5]) {
    lbox(deco, Fr, 0, 0.45, s + 0.1, s + 2.9, y + sy - 0.05, y + sy, TS.WOOD);
    for (let p = s + 0.2; p < s + 2.7; p += 0.42) if (rng.chance(0.8)) lbox(deco, Fr, 0.08, 0.38, p, p + 0.3, y + sy, y + sy + rng.float(0.2, 0.4), rng.pick([TS.CRATE, TS.CRATE2, TS.PAINT]), { uv: 'fit' });
  }
  // posts + striped awning + bulbs + sign
  for (const p of [s + 0.08, s + 2.92]) { const [px, pz] = Fr.pt(1.9, p); pole(ctx, px, pz, y, 2.7, TS.WOOD, 0.06); }
  lbox(deco, Fr, 0, 2.15, s - 0.1, s + 3.1, y + 2.7, y + 2.85, TS.ACCENT);
  lbox(deco, Fr, 2.05, 2.15, s - 0.1, s + 3.1, y + 2.45, y + 2.7, TS.ACCENT, { faces: FACE.SIDES });
  for (let p = s + 0.2; p < s + 3; p += 0.5) lbox(deco, Fr, 2.15, 2.22, p - 0.05, p + 0.05, y + 2.5, y + 2.6, TS.LIGHT, { uv: 'fit', emissive: 1 });
  lbox(deco, Fr, 2.0, 2.06, s + 0.5, s + 2.5, y + 2.85, y + 3.35, TS.NEON, { uv: 'fit', emissive: 1, faces: FACE_BIT[Fr.away] });
  deco.light(...xyz(Fr, 1.6, s + 1.5, y + 2.2), [1, 0.75, 0.4], 4.5);
}
function carousel(ctx, x, z, sz) {
  const { g, deco, rng, room: r } = ctx;
  const c = sz / 2, R = sz / 2 - 0.5;
  // round-ish platform one low step up (walkable without stairs)
  for (let dz = 0; dz < sz; dz++) for (let dx = 0; dx < sz; dx++) {
    if (Math.hypot(dx + 0.5 - c, dz + 0.5 - c) > R + 0.3) continue;
    const i = g.idx(x + dx, z + dz);
    g.floor[i] = r.floor + 0.3; g.floorTex[i] = TS.WOOD; g.wallTex[i] = TS.TRIM;
  }
  const px = x + c, pz = z + c, y = r.floor + 0.3;
  deco.box(px - 0.55, y, pz - 0.55, px + 0.55, y + 2.9, pz + 0.55, faced(0, TS.TRIM, TS.ACCENT), { solid: true });
  // canopy tiers (striped canvas) + bulbs
  deco.box(px - R - 0.2, y + 2.9, pz - R - 0.2, px + R + 0.2, y + 3.1, pz + R + 0.2, TS.ACCENT);
  deco.box(px - R + 0.6, y + 3.1, pz - R + 0.6, px + R - 0.6, y + 3.5, pz + R - 0.6, TS.ACCENT);
  deco.box(px - 0.6, y + 3.5, pz - 0.6, px + 0.6, y + 4.1, pz + 0.6, TS.ACCENT);
  for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2, bx = px + Math.cos(ang) * (R + 0.15), bz = pz + Math.sin(ang) * (R + 0.15); deco.box(bx - 0.05, y + 2.78, bz - 0.05, bx + 0.05, y + 2.88, bz + 0.05, TS.LIGHT, { uv: 'fit', emissive: 1 }); }
  // horses on brass poles
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * Math.PI * 2, hx = px + Math.cos(ang) * (R - 0.6), hz = pz + Math.sin(ang) * (R - 0.6);
    pole(ctx, hx, hz, y, 2.9, TS.TRIM, 0.03);
    const hy = y + 0.7 + (a % 2) * 0.35, along = Math.abs(Math.sin(ang)) > 0.7;
    deco.box(hx - (along ? 0.4 : 0.13), hy, hz - (along ? 0.13 : 0.4), hx + (along ? 0.4 : 0.13), hy + 0.35, hz + (along ? 0.13 : 0.4), TS.WOOD);
    deco.box(hx - 0.1 + (along ? 0.3 : 0), hy + 0.3, hz - 0.1 + (along ? 0 : 0.3), hx + 0.1 + (along ? 0.3 : 0), hy + 0.7, hz + 0.1 + (along ? 0 : 0.3), TS.WOOD);
  }
  deco.light(px, y + 2.4, pz, [1, 0.8, 0.5], 7);
}
function strengthTester(ctx, x, z) {
  const { deco, room: r } = ctx;
  const y = r.floor;
  deco.box(x - 0.3, y, z - 0.3, x + 0.3, y + 0.35, z + 0.3, TS.WOOD, { solid: true });
  deco.box(x - 0.12, y + 0.35, z - 0.12, x + 0.12, y + 3.6, z + 0.12, { side: TS.WOOD, top: TS.WOOD, nz: TS.PAINT, pz: TS.PAINT }, { uv: 'fit' });
  deco.box(x - 0.2, y + 3.6, z - 0.2, x + 0.2, y + 3.85, z + 0.2, TS.METAL);
  deco.box(x - 0.08, y + 3.88, z - 0.08, x + 0.08, y + 4.0, z + 0.08, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.collider(x - 0.12, y, z - 0.12, x + 0.12, y + 3.6, z + 0.12);
}
// the big top: a striped tent with a stepped canvas roof (heightfield ceiling
// rings inside, matching stepped boxes outside), entrances on the short sides
function bigTop(ctx) {
  const { g, deco, rng, room: r } = ctx;
  let T = null;
  for (let shrink = 0; shrink <= 10 && !T; shrink += 2) {
    const tw = Math.min(r.w - 6, 22) - shrink, th = Math.min(r.h - 6, 20) - shrink;
    if (tw < 12 || th < 12) break;
    for (let k = 0; k < 12 && !T; k++) {
      const tx = Math.floor(r.x + (r.w - tw) / 2) + rng.int(-2, 2), tz = Math.floor(r.z + (r.h - th) / 2) + rng.int(-2, 2);
      if (tx < r.x + 2 || tz < r.z + 2 || tx + tw > r.x + r.w - 2 || tz + th > r.z + r.h - 2) continue;
      if (!canUse(ctx, tx, tz, tw, th, 2, 0) || !flatOpen(ctx, tx, tz, tw, th)) continue;
      T = { x: tx, z: tz, w: tw, h: th };
    }
  }
  if (!T) return null;
  const y = r.floor, c0 = y + 5.2, dc = 0.8;
  const longX = T.w >= T.h;
  // entrances: centre of the two short sides (3 wide), outside cell must be free floor
  const ent = new Set();
  const cxT = T.x + Math.floor(T.w / 2), czT = T.z + Math.floor(T.h / 2);
  const sides = longX ? [[T.x, czT - 1, -1, 0], [T.x + T.w - 1, czT - 1, 1, 0]] : [[cxT - 1, T.z, 0, -1], [cxT - 1, T.z + T.h - 1, 0, 1]];
  for (const [ex, ez, ox, oz] of sides) {
    for (let k = 0; k < 3; k++) {
      const x = ex + (ox === 0 ? k : 0), z = ez + (oz === 0 ? k : 0);
      ent.add(g.idx(x, z));
    }
  }
  const qOf = (x, z) => Math.min(x - T.x - 1, T.x + T.w - 2 - x, z - T.z - 1, T.z + T.h - 2 - z);
  let qmax = 0;
  for (let z = T.z; z < T.z + T.h; z++) for (let x = T.x; x < T.x + T.w; x++) {
    const i = g.idx(x, z);
    const ring = x === T.x || z === T.z || x === T.x + T.w - 1 || z === T.z + T.h - 1;
    if (ring && !ent.has(i)) { g.solid(x, z, c0, TS.WALL); g.floorTex[i] = TS.CEIL; continue; }
    g.sky[i] = 0;
    g.flags[i] &= ~F.OUTDOOR;
    if (ring) { g.ceil[i] = y + 3.4; g.roof[i] = c0; g.wallTex[i] = TS.WALL; g.ceilTex[i] = TS.CEIL; g.floorTex[i] = TS.FLOOR2; continue; }
    const q = qOf(x, z);
    qmax = Math.max(qmax, q);
    g.ceil[i] = Math.min(y + 12, c0 + q * dc);
    g.ceilTex[i] = TS.CEIL; g.wallTex[i] = TS.CEIL;
    g.light[i] = Math.max(0.35, g.light[i] * 0.8);
  }
  use(ctx, T.x - 1, T.z - 1, T.w + 2, T.h + 2);
  // outside: stepped canvas roof rings matching the inner ceiling steps
  for (let q = 0; q <= qmax; q++) {
    const xa = T.x + 1 + q, xb = T.x + T.w - 2 - q, za = T.z + 1 + q, zb = T.z + T.h - 2 - q;
    if (xa > xb || za > zb) break;
    const yb = Math.min(y + 12, c0 + q * dc), yt = q === qmax || yb >= y + 12 ? yb + 0.9 : Math.min(y + 12, c0 + (q + 1) * dc);
    if (q === qmax || yb >= y + 12) { deco.box(xa, yb, za, xb + 1, yt, zb + 1, TS.CEIL, { faces: FACE.SIDES | FACE.TOP }); break; }
    deco.box(xa, yb, za, xb + 1, yt, za + 1, TS.CEIL, { faces: FACE.NZ | FACE.TOP | FACE.PX | FACE.NX });
    deco.box(xa, yb, zb, xb + 1, yt, zb + 1, TS.CEIL, { faces: FACE.PZ | FACE.TOP | FACE.PX | FACE.NX });
    deco.box(xa, yb, za + 1, xa + 1, yt, zb, TS.CEIL, { faces: FACE.NX | FACE.TOP });
    deco.box(xb, yb, za + 1, xb + 1, yt, zb, TS.CEIL, { faces: FACE.PX | FACE.TOP });
  }
  const topY = Math.min(y + 12, c0 + qmax * dc) + 0.9;
  // king poles flanking the ring, pennants on top
  const I = { x: T.x + 1, z: T.z + 1, w: T.w - 2, h: T.h - 2 };
  const icx = I.x + I.w / 2, icz = I.z + I.h / 2;
  const off = 3.6;
  for (const sg of [-1, 1]) {
    const px = longX ? icx + sg * off : icx, pz = longX ? icz : icz + sg * off;
    pole(ctx, px, pz, y, topY + 2.2 - y, TS.WOOD, 0.18);
    deco.box(px + 0.18, topY + 1.5, pz - 0.03, px + 1.1, topY + 2.1, pz + 0.03, TS.ACCENT);
    use(ctx, Math.floor(px), Math.floor(pz), 1, 1);
  }
  // circus ring: striped curb around a railed fire pit with a plank walk
  const R = 3;
  const rx0 = Math.floor(icx) - R, rz0 = Math.floor(icz) - R;
  const curb = (a, b, c, d) => deco.box(a, y, b, c, y + 0.4, d, TS.ACCENT, { solid: true });
  curb(rx0, rz0, rx0 + 2 * R + 1, rz0 + 0.3); curb(rx0, rz0 + 2 * R + 0.7, rx0 + 2 * R + 1, rz0 + 2 * R + 1);
  curb(rx0, rz0 + 0.3, rx0 + 0.3, rz0 + R); curb(rx0, rz0 + R + 1, rx0 + 0.3, rz0 + 2 * R + 0.7);
  curb(rx0 + 2 * R + 0.7, rz0 + 0.3, rx0 + 2 * R + 1, rz0 + R); curb(rx0 + 2 * R + 0.7, rz0 + R + 1, rx0 + 2 * R + 1, rz0 + 2 * R + 0.7);
  for (let z = rz0 + 1; z < rz0 + 2 * R; z++) for (let x = rx0 + 1; x < rx0 + 2 * R; x++) { const i = g.idx(x, z); if (g.type[i]) g.floorTex[i] = TS.GROUND; }
  const fx = Math.floor(icx) - 1, fz = Math.floor(icz) - 1;
  makePit(ctx, fx, fz, 3, 3, 'lava', 2.2);
  const pc = cellsOf(g, fx, fz, 3, 3).filter((i) => g.flags[i] & F.PIT);
  const plank = longX ? deckBridge(ctx, fx, fz + 1, 3, 1, y, { floorTex: TS.WOOD, wallTex: TS.WOOD }) : deckBridge(ctx, fx + 1, fz, 1, 3, y, { floorTex: TS.WOOD, wallTex: TS.WOOD });
  railPit(ctx, pc.filter((i) => !plank.includes(i)), { style: 'wood' });
  deco.light(icx, y + 1.2, icz, [1, 0.45, 0.15], 7, { flicker: true });
  // wooden bleachers along both long sides, facing the ring
  for (const side of longX ? [2, 3] : [0, 1]) {
    const Fr = frame(I, OPP[side] === side ? side : [1, 0, 3, 2][side]);
    // frame with t=0 at the ring side: use the opposite wall so rows rise toward `side`
    const K = 2, rows = 2 * K + 2;
    if (Fr.L < rows + R + 3) continue;
    const T0 = Fr.L - 2 * K - 1;
    const sA = 2, Bw = Fr.Wd - 4;
    if (Bw < 6) continue;
    buildSeating(ctx, Fr, { T0, sA, Bw, K, tEnd: Fr.L, floorTex: TS.WOOD, sideTex: TS.WOOD, frameTex: TS.WOOD, bench: true, railStyle: 'wood' });
  }
  // spotlights + bulb strings along the first roof step
  deco.light(icx, y + 5, icz, [1, 0.95, 0.8], 10);
  for (const [ax, az, bx, bz] of [[I.x + 0.5, I.z + 0.5, I.x + I.w - 0.5, I.z + 0.5], [I.x + 0.5, I.z + I.h - 0.5, I.x + I.w - 0.5, I.z + I.h - 0.5]]) bulbLine(ctx, ax, az, bx, bz, c0 - 0.05, 0.7);
  return T;
}

// ---------------------------------------------------------------- sideshow
// indoor tent: striped canvas walls, stepped canvas ceiling, freak-show cages,
// a little stage with steps and a curtain, benches.
HT.sideshow = function sideshow(ctx) {
  const { g, deco, rng, room: r } = ctx;
  retexWalls(ctx, TS.WALL);
  for (const i of ctx.cells) {
    if (!g.type[i] || g.sky[i]) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    const q = Math.min(x - r.x, r.x + r.w - 1 - x, z - r.z, r.z + r.h - 1 - z);
    g.ceil[i] = Math.max(g.ceil[i] > r.floor + 4 ? r.floor + 4 : g.ceil[i], Math.min(r.floor + r.ceilH, r.floor + 4 + q * 0.6));
    g.ceilTex[i] = TS.CEIL;
    if (!(g.flags[i] & F.STAIR)) g.wallTex[i] = TS.CEIL;
  }
  tryFrames(ctx, sideOrder(ctx), (Fr) => {
    if (Fr.L < 9 || Fr.Wd < 8) return false;
    const st = buildStage(ctx, Fr, { S: 3, h: STEP, minW: 4, floorTex: TS.WOOD, faceTex: TS.WOOD, insets: [2, 3] });
    if (!st) return false;
    lbox(deco, Fr, 0, 0.3, st.s0, st.s0 + st.sw, st.y, Math.min(r.floor + r.ceilH - 0.5, st.y + 3), TS.ACCENT);
    lbox(deco, Fr, 0, 2.6, st.s0 + 0.5, st.s0 + 1, st.y, st.y + 1.4, faced(Fr.away, TS.CRATE, TS.WOOD), { solid: true });
    // benches facing the stage
    for (let t = st.S + st.n + 2; t < Fr.L - 2; t += 2) {
      if (okL(ctx, Fr, t, 2, 1, Math.floor(Fr.Wd / 2) - 3)) bench(ctx, Fr, t, 2, Math.floor(Fr.Wd / 2) - 1);
      if (okL(ctx, Fr, t, Math.ceil(Fr.Wd / 2) + 1, 1, Math.floor(Fr.Wd / 2) - 3)) bench(ctx, Fr, t, Math.ceil(Fr.Wd / 2) + 1, Fr.Wd - 2);
    }
    deco.light(...xyz(Fr, 1.5, Fr.Wd / 2, st.y + 2.5), [1, 0.6, 0.3], 6, { flicker: true });
    return true;
  }, null);
  // cages along the walls
  let cages = 0;
  for (const [x, z] of rng.shuffle(wallSpots(ctx))) {
    if (cages >= 3) break;
    if (!canUse(ctx, x, z, 2, 2, 0, 1) || !flatOpen(ctx, x, z, 2, 2) || !inRoom(r, x + 1, z + 1)) continue;
    cage(ctx, x, z);
    use(ctx, x, z, 2, 2);
    cages++;
  }
  for (const [x, z, d] of wallSpots(ctx, false).filter((_, k) => k % 5 === 0)) deco.wallLight(x, z, d, r.floor + 2.4, [1, 0.7, 0.4], { radius: 5, flicker: true });
  r.lit = true;
};
function cage(ctx, x, z) {
  const { deco, rng, room: r } = ctx;
  const y = r.floor, h = 2.4;
  deco.box(x + 0.1, y, z + 0.1, x + 1.9, y + 0.2, z + 1.9, TS.METAL);
  deco.box(x + 0.1, y + h, z + 0.1, x + 1.9, y + h + 0.15, z + 1.9, TS.METAL);
  for (let p = 0.15; p <= 1.86; p += 0.22) {
    deco.box(x + p - 0.025, y + 0.2, z + 0.1, x + p + 0.025, y + h, z + 0.15, TS.RAIL, { faces: FACE.SIDES });
    deco.box(x + p - 0.025, y + 0.2, z + 1.85, x + p + 0.025, y + h, z + 1.9, TS.RAIL, { faces: FACE.SIDES });
    deco.box(x + 0.1, y + 0.2, z + p - 0.025, x + 0.15, y + h, z + p + 0.025, TS.RAIL, { faces: FACE.SIDES });
    deco.box(x + 1.85, y + 0.2, z + p - 0.025, x + 1.9, y + h, z + p + 0.025, TS.RAIL, { faces: FACE.SIDES });
  }
  // what is kept inside: a bone pile
  for (let k = 0; k < 4; k++) { const bx = x + 0.5 + rng.float(0, 0.8), bz = z + 0.5 + rng.float(0, 0.8); deco.box(bx, y + 0.2, bz, bx + rng.float(0.15, 0.4), y + 0.32, bz + 0.1, TS.ACCENT); }
  deco.collider(x + 0.1, y, z + 0.1, x + 1.9, y + h + 0.15, z + 1.9);
}

// ---------------------------------------------------------------- cathedral
// nave with pews and a carpet runner, colonnades with arcades under lower
// aisle ceilings, a tall clerestory with stained glass, bone vault ribs, an
// altar dais up a wide flight with iron rails, a flesh idol under a rose
// window, a lava moat across the nave with a stone bridge, chandeliers and
// flesh growths on the pillars.
HT.cathedral = function cathedral(ctx) {
  tryFrames(ctx, sideOrder(ctx), (Fr) => buildCathedral(ctx, Fr), TEMPLATES.chapel);
  ctx.room.lit = true;
};
function buildCathedral(ctx, Fr) {
  const { g, deco, rng, room: r, style } = ctx;
  const L = Fr.L, Wd = Fr.Wd;
  if (L < 18 || Wd < 13) return false;
  const top = r.floor + r.ceilH;
  const a = Wd >= 19 ? 3 : 2;                      // side aisle width
  const nA = a + 1, nB = Wd - a - 1;               // nave columns [nA, nB)
  const naveW = nB - nA;
  const aisleTop = r.floor + Math.min(7, r.ceilH - 4);
  const flesh = ctx.theme.id === 'flesh_cathedral';
  // dais at the altar end
  const D = 5, hD = 3 * STEP, n = 3;
  const fw = Math.min(5, naveW - 2), fs = nA + Math.floor((naveW - fw) / 2);
  if (!canUseL(ctx, Fr, 0, nA, D, naveW, 1) || !okL(ctx, Fr, D, fs, n + 1, fw)) return false;
  // ceilings: lower side aisles / colonnade, tall nave
  for (let t = 0; t < L; t++) for (let s = 0; s < Wd; s++) {
    const [x, z] = Fr.cell(t, s);
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i]) continue;
    if (s < nA || s >= nB) { if (!(r.reserved.has(i) && false)) { g.ceil[i] = Math.max(g.floor[i] + 3.2, Math.min(g.ceil[i], aisleTop)); g.wallTex[i] = TS.WALL; g.floorTex[i] = TS.FLOOR2; } }
  }
  const yD = r.floor + hD;
  const dais = setHeightL(ctx, Fr, 0, nA, D, naveW, yD, { floorTex: TS.FLOOR3, wallTex: TS.SIDE });
  useL(ctx, Fr, 0, nA, D, naveW);
  flightL(ctx, Fr, D, fs, n, fw, 'toward', r.floor, yD, { style: style.railStyle });
  useL(ctx, Fr, D, fs, n + 1, fw);
  deco.railEdges(new Set(dais), { style: style.railStyle });
  // altar, candles, idol, rose window
  const mid = Wd / 2;
  lbox(deco, Fr, 1.3, 2.5, mid - 1.5, mid + 1.5, yD, yD + 1.1, faced(Fr.away, TS.ACCENT, TS.SIDE, TS.TRIM), { solid: true });
  for (let p = mid - 1.3; p <= mid + 1.31; p += 0.65) candle(ctx, ...Fr.pt(1.5, p), yD + 1.1, 0.25);
  for (const p of [mid - 2.6, mid + 2.6]) {
    const [cx, cz] = Fr.pt(1.9, p);
    deco.box(cx - 0.05, yD, cz - 0.05, cx + 0.05, yD + 1.5, cz + 0.05, TS.METAL);
    deco.box(cx - 0.3, yD + 1.5, cz - 0.08, cx + 0.3, yD + 1.56, cz + 0.08, TS.METAL);
    for (const o of [-0.25, 0, 0.25]) candle(ctx, cx + (Fr.lat === 0 ? o : 0), cz + (Fr.lat === 2 ? o : 0), yD + 1.56, 0.3);
    deco.light(cx, yD + 2, cz, [1, 0.55, 0.25], 6, { flicker: true });
  }
  const idolTex = flesh ? TS.WALL2 : TS.PILLAR;
  const iy1 = Math.min(top - 3, yD + 7);
  lbox(deco, Fr, 0.1, 1.0, mid - 0.8, mid + 0.8, yD, iy1, idolTex, { solid: true });
  for (let yy = yD + 1.2; yy < iy1 - 0.5; yy += 0.9) {
    const w = 1.2 + Math.sin((yy - yD) * 0.7) * 0.4;
    lbox(deco, Fr, 0.2, 1.15, mid - 0.8 - w, mid + 0.8 + w, yy, yy + 0.18, TS.ACCENT);
  }
  if (top - iy1 > 2.4) lbox(deco, Fr, 0, 0.05, mid - 2, mid + 2, iy1 + 0.3, Math.min(top - 0.6, iy1 + 4.3), TS.GLASS, { uv: 'fit', emissive: 0.7, faces: FACE_BIT[Fr.away] });
  deco.light(...xyz(Fr, 2.5, mid, yD + 3), flesh ? [1, 0.25, 0.15] : [1, 0.85, 0.6], 10, { pulse: flesh });
  // lava moat across the nave in front of the dais, stone bridge on the axis
  const mt = D + n + 1;
  if (L - mt > 10 && okL(ctx, Fr, mt - 1, nA, 4, naveW)) {
    const kind = style.hazards.includes('lava') ? 'lava' : rng.pick(style.hazards);
    const [px, pz, pW, pH] = Fr.rect(mt, nA, 2, naveW);
    makePit(ctx, px, pz, pW, pH, kind, 2.6);
    useL(ctx, Fr, mt - 1, nA, 4, naveW);
    const pc = cellsOf(g, px, pz, pW, pH).filter((i) => g.flags[i] & F.PIT);
    const bc = deckBridge(ctx, ...Fr.rect(mt, fs, 2, fw), r.floor, { floorTex: TS.FLOOR2, wallTex: TS.SIDE });
    railPit(ctx, pc.filter((i) => !bc.includes(i)), { style: style.railStyle });
  }
  // colonnades: pillars + arcade lintels, flesh growths
  const pillars = [];
  for (let t = D + 1; t < L - 1; t += 3) {
    for (const s of [a, Wd - a - 1]) {
      const [x, z] = Fr.cell(t, s);
      const i = g.idx(x, z);
      if (!g.type[i] || r.reserved.has(i) || !canUse(ctx, x, z, 1, 1, 0, 0) || g.flags[i] & (F.STAIR | F.PIT)) continue;
      deco.pillar(x + 0.5, z + 0.5, 0.8, g.floor[i], aisleTop, { tex: TS.PILLAR });
      use(ctx, x, z, 1, 1);
      pillars.push([x, z, t, s]);
      if (flesh && rng.chance(0.6)) {
        const gy = g.floor[i] + rng.float(1.5, aisleTop - r.floor - 2);
        deco.box(x + 0.02, gy, z + 0.02, x + 0.98, gy + rng.float(0.6, 1.4), z + 0.98, TS.WALL2);
      }
    }
  }
  for (const s of [a, Wd - a - 1]) lbox(deco, Fr, D + 0.5, L, s, s + 1, aisleTop - 0.55, aisleTop, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
  // clerestory stained glass, vault ribs (bone for the flesh cathedral)
  for (let t = D + 2; t < L - 1; t += 3) {
    for (const [s, sg] of [[nA, 1], [nB, -1]]) {
      const y0 = aisleTop + 0.8, y1 = Math.min(top - 1.0, aisleTop + 4.2);
      if (y1 - y0 < 1) continue;
      lbox(deco, Fr, t + 0.2, t + 0.8, s, s + sg * 0.05, y0, y1, TS.GLASS, { uv: 'fit', emissive: 0.75, faces: FACE_BIT[sg > 0 ? Fr.lat : Fr.latN] });
    }
    lbox(deco, Fr, t + 0.35, t + 0.65, nA, nB, top - 0.5, top, flesh ? TS.ACCENT : TS.BEAM, { faces: FACE.SIDES | FACE.BOTTOM });
  }
  lbox(deco, Fr, 0, L, mid - 0.2, mid + 0.2, top - 0.4, top, flesh ? TS.ACCENT : TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
  // side windows on the outer aisle walls
  for (let t = D + 1; t < L - 1; t += 3) for (const s of [0, Wd - 1]) {
    const [x, z] = Fr.cell(t, s);
    const d = s === 0 ? Fr.latN : Fr.lat;
    const nb = g.idx(x + DIR_X[d], z + DIR_Z[d]);
    if (g.type[nb] || r.reserved.has(g.idx(x, z))) continue;
    deco.window(x, z, d, r.floor + 1.6, aisleTop - 1, { emissive: 0.6 });
  }
  // pews with a carpet runner down the middle
  const run0 = Math.floor(mid) - 1, run1 = Math.ceil(mid) + 1;
  for (let t = D + n; t < L; t++) for (let s = run0; s < run1; s++) { const [x, z] = Fr.cell(t, s); const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & (F.STAIR | F.PIT | F.BRIDGE))) g.floorTex[i] = TS.CARPET; }
  for (let t = D + n + 4; t < L - 2; t += 2) {
    for (const [sa, sb] of [[nA + 1, run0], [run1, nB - 1]]) {
      if (sb - sa < 2) continue;
      if (!okL(ctx, Fr, t, sa, 1, sb - sa) || !freeRect(ctx, ...Fr.rect(t, sa, 1, sb - sa), 1)) continue;
      bench(ctx, Fr, t, sa + 0.05, sb - 0.05, r.floor, TS.WOOD);
      useL(ctx, Fr, t, sa, 1, sb - sa);
    }
  }
  // chandeliers down the nave + flesh sacs hanging from the vault
  for (let t = D + 4; t < L - 2; t += 6) chandelier(ctx, ...Fr.pt(t + 0.5, mid), top, { drop: Math.min(4, r.ceilH - 6), size: 1.1, radius: 11, color: [1, 0.6, 0.3], flicker: true });
  if (flesh) for (let k = 0; k < 4; k++) {
    const t = D + 3 + rng.float(0, L - D - 6), s = nA + 1 + rng.float(0, naveW - 2);
    const [x, z] = Fr.pt(t, s), hh = rng.float(1.2, 2.4);
    deco.box(x - 0.03, top - 2.5, z - 0.03, x + 0.03, top, z + 0.03, TS.METAL);
    deco.box(x - 0.35, top - 2.5 - hh, z - 0.35, x + 0.35, top - 2.5, z + 0.35, TS.WALL2);
  }
  // torches along the aisles
  for (let t = D + 2; t < L - 1; t += 4) for (const s of [0, Wd - 1]) {
    const [x, z] = Fr.cell(t, s);
    const d = s === 0 ? Fr.latN : Fr.lat;
    if (!g.type[g.idx(x + DIR_X[d], z + DIR_Z[d])]) deco.wallLight(x, z, d, r.floor + 2.2, [1, 0.5, 0.2], { radius: 6, flicker: true });
  }
  return true;
}

// ---------------------------------------------------------------- crypt
HT.crypt = function crypt(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  const top = r.floor + r.ceilH;
  // pillar grid with vault ribs
  for (let z = r.z + 2; z < r.z + r.h - 2; z += 4) for (let x = r.x + 2; x < r.x + r.w - 2; x += 4) {
    if (!canUse(ctx, x, z, 1, 1, 0, 0) || !flatOpen(ctx, x, z, 1, 1)) continue;
    deco.pillar(x + 0.5, z + 0.5, 0.6, r.floor, top, { tex: TS.PILLAR });
    use(ctx, x, z, 1, 1);
  }
  for (let z = r.z + 2; z < r.z + r.h - 2; z += 4) deco.box(r.x, top - 0.35, z + 0.35, r.x + r.w, top, z + 0.65, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
  for (let x = r.x + 2; x < r.x + r.w - 2; x += 4) deco.box(x + 0.35, top - 0.35, r.z, x + 0.65, top, r.z + r.h, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
  // sarcophagi: stone body, carved lid, skull panel at the head
  const alongX = r.w >= r.h;
  for (let k = 0; k < Math.floor(r.area / 18); k++) {
    const x = rng.int(r.x + 1, r.x + r.w - (alongX ? 4 : 3)), z = rng.int(r.z + 1, r.z + r.h - (alongX ? 3 : 4));
    const w = alongX ? 3 : 2, h = alongX ? 2 : 3;
    if (!canUse(ctx, x, z, w, h, 0, 1) || !flatOpen(ctx, x, z, w, h)) continue;
    const x0 = x + (alongX ? 0.4 : 0.45), z0 = z + (alongX ? 0.45 : 0.4), x1 = x + w - (alongX ? 0.4 : 0.45), z1 = z + h - (alongX ? 0.45 : 0.4);
    deco.box(x0, r.floor, z0, x1, r.floor + 0.9, z1, { side: TS.SIDE, top: TS.SIDE, [alongX ? 'nx' : 'nz']: TS.ACCENT }, { solid: true });
    deco.box(x0 - 0.06, r.floor + 0.9, z0 - 0.06, x1 + 0.06, r.floor + 1.08, z1 + 0.06, TS.TRIM);
    candle(ctx, x0 + 0.1, z0 + 0.1, r.floor + 1.08, 0.2);
    use(ctx, x, z, w, h);
  }
  // skull niches along the walls (ACCENT = skulls / bone)
  for (const [x, z, d] of wallSpots(ctx, false)) {
    if ((x + z) % 2) continue;
    const lx = x + 0.5 + DIR_X[d] * 0.47, lz = z + 0.5 + DIR_Z[d] * 0.47;
    const wx = DIR_X[d] ? 0.06 : 0.42, wz = DIR_Z[d] ? 0.06 : 0.42;
    deco.box(lx - wx, r.floor + 1.0, lz - wz, lx + wx, r.floor + 2.4, lz + wz, TS.ACCENT);
  }
  for (const [x, z, d] of wallSpots(ctx, false).filter((_, k) => k % 6 === 0)) deco.wallLight(x, z, d, r.floor + 2.0, [1, 0.5, 0.2], { radius: 5, flicker: true });
  r.lit = true;
};

// ---------------------------------------------------------------- foyer / lobby
HT.foyer = function foyer(ctx) {
  const { g, deco, rng, room: r, theme } = ctx;
  ctx.used = new Set();
  const id = theme.id, top = r.floor + r.ceilH;
  const cx = r.x + r.w / 2, cz = r.z + r.h / 2;
  // carpet / runner cross through the middle
  for (let x = r.x + 1; x < r.x + r.w - 1; x++) for (let z = Math.floor(cz) - 1; z <= Math.floor(cz); z++) { const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & F.STAIR)) g.floorTex[i] = TS.CARPET; }
  for (let z = r.z + 1; z < r.z + r.h - 1; z++) for (let x = Math.floor(cx) - 1; x <= Math.floor(cx); x++) { const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & F.STAIR)) g.floorTex[i] = TS.CARPET; }
  // pillars at the quarter points
  if (r.w >= 10 && r.h >= 10) for (const [px, pz] of [[r.x + 2, r.z + 2], [r.x + r.w - 3, r.z + 2], [r.x + 2, r.z + r.h - 3], [r.x + r.w - 3, r.z + r.h - 3]]) {
    if (!canUse(ctx, px, pz, 1, 1, 0, 0) || !flatOpen(ctx, px, pz, 1, 1)) continue;
    deco.pillar(px + 0.5, pz + 0.5, 0.65, r.floor, top, { tex: TS.PILLAR });
    use(ctx, px, pz, 1, 1);
  }
  // counter (box office / reception / coat check) along a free wall run
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => {
    for (let s = 1; s + 5 <= Fr.Wd - 1; s++) {
      if (!okL(ctx, Fr, 0, s, 2, 5)) continue;
      const [ax, az] = Fr.pt(1.1, s), [bx, bz] = Fr.pt(1.8, s + 5);
      counter(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r.floor, Fr.away, { front: id === 'flesh_cathedral' ? TS.ACCENT : TS.PANEL, side: TS.WOOD, top: TS.WOOD });
      if (id === 'movie_theater' || id === 'concert_hall') {
        // box office glass + menu / poster boards
        lbox(deco, Fr, 1.4, 1.45, s, s + 5, r.floor + 1.05, r.floor + 2.4, TS.GLASS, { emissive: 0.15, uv: 'fit' });
        if (r.ceilH > 3.6) lbox(deco, Fr, 0, 0.05, s + 0.5, s + 4.5, r.floor + 2.6, r.floor + 3.4, TS.SCREEN, { uv: 'fit', emissive: 0.8, faces: FACE_BIT[Fr.away] });
      } else if (id === 'neon_arcade' || id === 'mosh_pit') {
        if (r.ceilH > 3.6) lbox(deco, Fr, 0, 0.05, s + 0.5, s + 4.5, r.floor + 2.5, r.floor + 3.2, TS.NEON, { uv: 'fit', emissive: 1, faces: FACE_BIT[Fr.away] });
        if (id === 'neon_arcade') for (const k of [0, 4]) { const [x, z] = Fr.cell(0, s + k); cabinet(ctx, x, z, Fr.away, r.floor, { front: TS.MACHINE }); }
      } else if (id === 'department_store') {
        wallShelf(ctx, Fr, 0, s + 0.2, s + 4.8, r.floor, 2.0);
      } else if (id === 'flesh_cathedral') {
        for (let p = s + 0.5; p < s + 5; p += 0.8) candle(ctx, ...Fr.pt(1.45, p), r.floor + 1.05, 0.25);
      }
      useL(ctx, Fr, 0, s, 2, 5);
      return true;
    }
    return false;
  }, null);
  // posters / lightboxes on the walls (cinema, arcade, mosh) or holy-water fonts (cathedral)
  for (const [x, z, d] of wallSpots(ctx).filter((_, k) => k % 4 === 1)) {
    if (id === 'movie_theater' || id === 'neon_arcade' || id === 'mosh_pit') {
      const lx = x + 0.5 + DIR_X[d] * 0.46, lz = z + 0.5 + DIR_Z[d] * 0.46;
      const wx = DIR_X[d] ? 0.04 : 0.38, wz = DIR_Z[d] ? 0.04 : 0.38;
      deco.box(lx - wx - 0.04, r.floor + 1.0, lz - wz - 0.04, lx + wx + 0.04, r.floor + 2.4, lz + wz + 0.04, TS.TRIM);
      deco.box(lx - wx - (DIR_X[d] ? -0.02 : 0), r.floor + 1.08, lz - wz - (DIR_Z[d] ? -0.02 : 0), lx + wx + (DIR_X[d] ? 0.02 : 0), r.floor + 2.32, lz + wz + (DIR_Z[d] ? 0.02 : 0), id === 'mosh_pit' ? TS.NEON : TS.SCREEN, { uv: 'fit', emissive: 0.6, faces: FACE_BIT[OPP[d]] });
    }
  }
  // planters (store, concert) / benches
  for (let k = 0, made = 0; k < 30 && made < 4; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
    if (!canUse(ctx, x, z, 2, 1, 0, 1) || !flatOpen(ctx, x, z, 2, 1)) continue;
    const nearWall = !g.isOpen(x, z - 1) || !g.isOpen(x, z + 1);
    if (!nearWall) continue;
    if (id === 'flesh_cathedral') { deco.box(x + 0.6, r.floor, z + 0.2, x + 1.4, r.floor + 0.9, z + 0.8, TS.SIDE, { solid: true }); deco.box(x + 0.7, r.floor + 0.9, z + 0.3, x + 1.3, r.floor + 0.95, z + 0.7, TS.WATER, { emissive: 0.2 }); }
    else if (made % 2 === 0) deco.planter(x + 0.2, z + 0.15, r.floor, 1.6, 0.7);
    else { const Fr = frame({ x, z, w: 2, h: 1 }, 3); bench(ctx, Fr, 0, 0, 2, r.floor); }
    use(ctx, x, z, 2, 1);
    made++;
  }
  // light: chandelier in tall lobbies, panels otherwise
  if (r.ceilH >= 5.5 && id !== 'neon_arcade') chandelier(ctx, cx, cz, top, { drop: Math.min(1.8, r.ceilH - 3.8), size: 0.9, radius: 9, flicker: id === 'flesh_cathedral' });
  else for (let z = r.z + 2; z < r.z + r.h - 1; z += 4) for (let x = r.x + 2; x < r.x + r.w - 1; x += 4) deco.lightPanel(x + 0.15, z + 0.3, x + 0.85, z + 0.7, top, [0.95, 0.9, 1], 6);
  if (id === 'neon_arcade') wallStrip(ctx, 2.6, 2.7, TS.NEON, { emissive: 1 });
  r.lit = true;
};

// ---------------------------------------------------------------- backstage
HT.backstage = function backstage(ctx) {
  const { g, deco, rng, room: r, theme } = ctx;
  ctx.used = new Set();
  // loading dock: raised platform along a wall with a flight and guard rails
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => {
    if (Fr.L < 10 || Fr.Wd < 8) return false;
    const h = 2 * STEP, D = 3;
    let run = null;
    for (let a = 0; a < Fr.Wd; a++) { let b = a; while (b < Fr.Wd && canUseL(ctx, Fr, 0, b, D + 1, 1) && flatOpen(ctx, ...Fr.rect(0, b, D, 1))) b++; if (b - a >= 6 && (!run || b - a > run[1] - run[0])) run = [a, b]; a = b; }
    if (!run) return false;
    const fsx = run[0] + 1;
    if (!okL(ctx, Fr, D, fsx, 3, 2)) return false;
    const cells = setHeightL(ctx, Fr, 0, run[0], D, run[1] - run[0], r.floor + h, { floorTex: TS.GRATE, wallTex: TS.SIDE });
    flightL(ctx, Fr, D, fsx, 2, 2, 'toward', r.floor, r.floor + h);
    useL(ctx, Fr, 0, run[0], D + 3, run[1] - run[0]);
    deco.railEdges(new Set(cells), { style: 'metal' });
    for (let s = run[0] + 3; s < run[1] - 1; s += 2.5) { const [x, z] = Fr.pt(1.5, s); deco.crateStack(x, z, r.floor + h, { tex: TS.CRATE2 }); }
    return true;
  }, null);
  // road cases, crate stacks, costume racks, make-up mirror with bulbs, lighting stand
  let n = 0;
  for (let k = 0; k < 60 && n < Math.floor(r.area / 14); k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
    if (!canUse(ctx, x, z, 2, 2, 0, 1) || !flatOpen(ctx, x, z, 2, 2)) continue;
    const roll = rng.next();
    if (roll < 0.35) {
      // road case: black case with metal edges on castors
      deco.box(x + 0.3, r.floor + 0.12, z + 0.4, x + 1.7, r.floor + 1.1, z + 1.4, { side: TS.CRATE2, top: TS.METAL }, { solid: true, uv: 'fit' });
      for (const [a, b] of [[0.35, 0.45], [1.5, 0.45], [0.35, 1.25], [1.5, 1.25]]) deco.box(x + a, r.floor, z + b, x + a + 0.12, r.floor + 0.12, z + b + 0.12, TS.METAL);
    } else if (roll < 0.6) deco.crateStack(x + 1, z + 1, r.floor);
    else if (roll < 0.8) { const Fr = frame({ x, z, w: 2, h: 2 }, 3); rack(ctx, Fr, 0.5, 0.1, 1.9, r.floor); }
    else { // lighting stand
      pole(ctx, x + 1, z + 1, r.floor, 2.2, TS.METAL, 0.04);
      deco.box(x + 0.8, r.floor + 2.2, z + 0.8, x + 1.2, r.floor + 2.55, z + 1.2, TS.METAL);
      deco.box(x + 0.85, r.floor + 2.25, z + 1.2, x + 1.15, r.floor + 2.5, z + 1.22, TS.LIGHT, { uv: 'fit', emissive: 1 });
      deco.light(x + 1, r.floor + 2, z + 1.6, [1, 0.9, 0.7], 5);
    }
    use(ctx, x, z, 2, 2);
    n++;
  }
  // make-up mirrors with bulb frames on a free wall
  for (const [x, z, d] of wallSpots(ctx).filter((_, k) => k % 7 === 2).slice(0, 3)) {
    const lx = x + 0.5 + DIR_X[d] * 0.47, lz = z + 0.5 + DIR_Z[d] * 0.47;
    const wx = DIR_X[d] ? 0.03 : 0.35, wz = DIR_Z[d] ? 0.03 : 0.35;
    deco.box(lx - wx, r.floor + 1.1, lz - wz, lx + wx, r.floor + 1.9, lz + wz, TS.GLASS, { uv: 'fit', emissive: 0.25 });
    for (const yy of [1.05, 1.95]) deco.box(lx - wx - 0.03, r.floor + yy - 0.04, lz - wz - 0.03, lx + wx + 0.03, r.floor + yy + 0.04, lz + wz + 0.03, TS.LIGHT, { emissive: 1, uv: 'fit' });
    const tx = x + 0.5 + DIR_X[d] * 0.2, tz = z + 0.5 + DIR_Z[d] * 0.2;
    deco.box(tx - (DIR_X[d] ? 0.3 : 0.45), r.floor + 0.75, tz - (DIR_Z[d] ? 0.3 : 0.45), tx + (DIR_X[d] ? 0.3 : 0.45), r.floor + 0.82, tz + (DIR_Z[d] ? 0.3 : 0.45), TS.WOOD);
  }
  r.lit = false;
  void theme;
};

// ---------------------------------------------------------------- bar / lounge / concessions
HT.bar = function bar(ctx) {
  const { g, deco, rng, room: r, theme } = ctx;
  ctx.used = new Set();
  tryFrames(ctx, sideOrder(ctx), (Fr) => buildBar(ctx, Fr, { minT: 0 }), null);
  // raised lounge corner (one step) with booth benches
  tryFrames(ctx, sideOrder(ctx, false), (Fr) => {
    if (Fr.L < 9 || Fr.Wd < 9) return false;
    const w = Math.min(6, Fr.Wd - 4), s0 = Fr.Wd - w - 1;
    if (!okL(ctx, Fr, 0, s0, 4, w)) return false;
    setHeightL(ctx, Fr, 0, s0, 3, w, r.floor + STEP, { floorTex: TS.CARPET, wallTex: TS.WOOD });
    flightL(ctx, Fr, 3, s0 + 1, 1, 2, 'toward', r.floor, r.floor + STEP);
    useL(ctx, Fr, 0, s0, 4, w);
    bench(ctx, Fr, 0, s0 + 0.2, s0 + w - 0.2, r.floor + STEP, TS.WOOD);
    const [tx, tz] = Fr.pt(1.6, s0 + w / 2 - 0.6);
    deco.table(tx - 0.1, tz - 0.1, r.floor + STEP, 1.2, 0.7, TS.WOOD);
    return true;
  }, null);
  // tables with chairs
  for (let k = 0, made = 0; k < 40 && made < Math.floor(r.area / 25); k++) {
    const x = rng.int(r.x + 2, r.x + r.w - 4), z = rng.int(r.z + 2, r.z + r.h - 4);
    if (!canUse(ctx, x, z, 2, 2, 0, 1) || !flatOpen(ctx, x, z, 2, 2)) continue;
    deco.table(x + 0.5, z + 0.6, r.floor, 1.0, 0.8, TS.WOOD);
    for (const [a, b] of [[0.75, 0.05], [0.75, 1.55]]) deco.box(x + a, r.floor, z + b, x + a + 0.45, r.floor + 0.45, z + b + 0.4, TS.WOOD, { solid: true });
    use(ctx, x, z, 2, 2);
    made++;
  }
  // concessions extras for the cinema: popcorn machine; neon for arcade / mosh
  if (theme.id === 'movie_theater') {
    const sp = wallSpots(ctx)[0];
    if (sp) { const [x, z] = sp; deco.box(x + 0.2, r.floor, z + 0.2, x + 0.8, r.floor + 0.9, z + 0.8, TS.METAL, { solid: true }); deco.box(x + 0.22, r.floor + 0.9, z + 0.22, x + 0.78, r.floor + 1.7, z + 0.78, TS.GLASS, { emissive: 0.5, uv: 'fit' }); deco.light(x + 0.5, r.floor + 1.3, z + 0.5, [1, 0.9, 0.4], 4); }
  }
  if (theme.id === 'neon_arcade' || theme.id === 'mosh_pit') wallStrip(ctx, 2.6, 2.68, TS.NEON, { emissive: 1 });
  r.lit = false;
};

// ---------------------------------------------------------------- boutique (store side rooms)
HT.boutique = function boutique(ctx) {
  const { g, deco, rng, room: r } = ctx;
  ctx.used = new Set();
  // wall shelving all round where free
  for (const side of [0, 1, 2, 3]) {
    const Fr = frame(r, side);
    for (let s = 1; s + 3 <= Fr.Wd - 1; s += 3) if (okL(ctx, Fr, 0, s, 1, 3) && freeRect(ctx, ...Fr.rect(0, s, 1, 3), 1)) { wallShelf(ctx, Fr, 0, s + 0.05, s + 2.95, r.floor, 2.1); useL(ctx, Fr, 0, s, 1, 3); }
  }
  // racks and display tables in the middle
  for (let k = 0, made = 0; k < 50 && made < Math.floor(r.area / 16); k++) {
    const x = rng.int(r.x + 2, r.x + r.w - 4), z = rng.int(r.z + 2, r.z + r.h - 4);
    if (!canUse(ctx, x, z, 2, 2, 0, 1) || !flatOpen(ctx, x, z, 2, 2)) continue;
    if (rng.chance(0.5)) { const Fr = frame({ x, z, w: 2, h: 2 }, rng.pick([1, 3])); rack(ctx, Fr, 0.5, 0.1, 1.9, r.floor); }
    else {
      deco.table(x + 0.3, z + 0.4, r.floor, 1.4, 1.2, TS.WOOD);
      for (let q = 0; q < 3; q++) deco.box(x + 0.45 + q * 0.4, r.floor + 0.8, z + 0.6, x + 0.75 + q * 0.4, r.floor + 0.8 + rng.float(0.1, 0.3), z + 1.2, rng.pick([TS.CRATE, TS.CARPET]), { uv: 'fit' });
    }
    use(ctx, x, z, 2, 2);
    made++;
  }
  // cash desk
  const sp = wallSpots(ctx).find(([x, z]) => canUse(ctx, x, z, 1, 1, 0, 1));
  if (sp) { const [x, z, d] = sp; deco.console(x, z, r.floor, OPP[d]); }
  r.lit = false;
};

// ---------------------------------------------------------------- boss arena dressing
HT.hall_arena = function hallArena(ctx) {
  const { g, deco, rng, room: r, theme } = ctx;
  TEMPLATES.arena(ctx);
  const id = theme.id;
  const spots = rng.shuffle(wallSpots(ctx)).filter(([x, z]) => !r.reserved.has(g.idx(x, z)));
  let n = 0;
  for (const [x, z, d] of spots) {
    if (n >= 6) break;
    if (!canUse(ctx, x, z, 1, 1, 1, 1) || !deco.cellFree(x, z)) continue;
    const fd = OPP[d];
    if (id === 'mosh_pit' || id === 'concert_hall') speakerStackCell(ctx, x, z, fd, id === 'mosh_pit' ? TS.ACCENT : TS.MACHINE);
    else if (id === 'neon_arcade') cabinet(ctx, x, z, fd, r.floor);
    else if (id === 'department_store') { const Fr = frame({ x, z, w: 1, h: 1 }, [1, 0, 3, 2][fd]); wallShelf(ctx, Fr, 0, 0.05, 0.95, r.floor, 2.2); }
    else if (id === 'flesh_cathedral') { deco.box(x + 0.25, r.floor, z + 0.25, x + 0.75, r.floor + rng.float(2.5, 4.5), z + 0.75, TS.ACCENT, { solid: true }); deco.box(x + 0.15, r.floor + 1.2, z + 0.15, x + 0.85, r.floor + 2, z + 0.85, TS.WALL2); }
    else if (id === 'carnival') { pole(ctx, x + 0.5, z + 0.5, r.floor, 3.6, TS.WOOD, 0.1); deco.box(x + 0.3, r.floor + 3.6, z + 0.3, x + 0.7, r.floor + 3.8, z + 0.7, TS.LIGHT, { emissive: 1, uv: 'fit' }); deco.light(x + 0.5, r.floor + 3.3, z + 0.5, [1, 0.8, 0.4], 6); }
    else if (id === 'movie_theater') { deco.box(x + 0.1, r.floor, z + 0.1, x + 0.9, r.floor + 3, z + 0.9, TS.WALL, { solid: true }); }
    else continue;
    use(ctx, x, z, 1, 1);
    n++;
  }
  if (id === 'neon_arcade') wallStrip(ctx, 3.0, 3.1, TS.NEON, { emissive: 1 });
};
function speakerStackCell(ctx, x, z, fd, tex) {
  const { deco, room: r } = ctx;
  for (let k = 0; k < 3; k++) deco.box(x + 0.08, r.floor + k * 0.95, z + 0.08, x + 0.92, r.floor + (k + 1) * 0.95 - 0.04, z + 0.92, faced(fd, tex, TS.METAL));
  deco.collider(x + 0.08, r.floor, z + 0.08, x + 0.92, r.floor + 2.85, z + 0.92);
}

export { HT };
