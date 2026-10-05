// More lab / hospital room templates (registered by gen_lab.js next to
// lab_rooms.js): offices with cubicle pods and a glass-walled manager's
// office, a security station (CCTV wall, armoury, holding cell), an
// isolation block of glass-fronted quarantine cells, a skylit hydroponics
// greenhouse, bio-waste processing over a grated toxic sump, a hospital
// cafeteria with a serving line and kitchen, and a radiology suite (scanner
// gantry, control room behind lead glass).
//
// Same rules as lab_rooms.js: every object uses the texture role that fits
// it (desk tops WOOD, casework / lockers CRATE2, equipment MACHINE, steel
// METAL, partitions GLASS / PANEL, screens SCREEN, upholstery CARPET, plants
// FOLIAGE, planter bodies SIDE), exit approaches stay clear and walkways
// round partitions stay at least two cells wide.
import { TS, F } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import {
  lbox, lcollider, cellsOf, canUse, use, canUseL, useL, okL, ok, flatOpen, retexFloor, tryFrames, sideOrder, wallSpots, wallBox,
  lightStrip, hangLight, paint, hazardLines, railAround, deckBridge, pit, pitSet, openShape, largestBlob, freeMask, bestRect,
  glassLineL, glassWall, doorLeafL, openShelf, lineOpening, tank, labBench, cabinet, machineBlock, seatRow, counter, monitor, bed,
  ivStand, vitalsMonitor, trolley, isHosp, faced, WHITE, GREEN, RED, OPP, DIR_X, DIR_Z, TEMPLATES, roomOK, snap, restore,
} from './lab_templates.js';

const LX = {};
const WARM = [1, 0.95, 0.85];

// ---------------------------------------------------------------- props
// office chair: the sitter faces `dir`
function chair(ctx, cx, cz, y, dir) {
  const { deco } = ctx;
  deco.box(cx - 0.03, y, cz - 0.03, cx + 0.03, y + 0.42, cz + 0.03, TS.METAL, { faces: FACE.SIDES });
  deco.box(cx - 0.2, y, cz - 0.2, cx + 0.2, y + 0.04, cz + 0.2, TS.METAL);
  deco.box(cx - 0.22, y + 0.42, cz - 0.22, cx + 0.22, y + 0.5, cz + 0.22, TS.CARPET);
  const bx = -DIR_X[dir] * 0.2, bz = -DIR_Z[dir] * 0.2;
  if (dir < 2) deco.box(cx + bx - 0.03, y + 0.5, cz - 0.21, cx + bx + 0.03, y + 0.95, cz + 0.21, TS.CARPET);
  else deco.box(cx - 0.21, y + 0.5, cz + bz - 0.03, cx + 0.21, y + 0.95, cz + bz + 0.03, TS.CARPET);
}
// desk with a modesty panel, monitor and keyboard; the sitter faces `dir`
function desk(ctx, x0, z0, x1, z1, y, dir, o = {}) {
  const { deco } = ctx;
  deco.box(x0, y + 0.72, z0, x1, y + 0.77, z1, o.top ?? TS.WOOD);
  const fx = DIR_X[dir], fz = DIR_Z[dir];
  // modesty panel on the far side (away from the sitter)
  if (dir === 0) deco.box(x1 - 0.05, y, z0 + 0.03, x1 - 0.02, y + 0.72, z1 - 0.03, TS.METAL);
  else if (dir === 1) deco.box(x0 + 0.02, y, z0 + 0.03, x0 + 0.05, y + 0.72, z1 - 0.03, TS.METAL);
  else if (dir === 2) deco.box(x0 + 0.03, y, z1 - 0.05, x1 - 0.03, y + 0.72, z1 - 0.02, TS.METAL);
  else deco.box(x0 + 0.03, y, z0 + 0.02, x1 - 0.03, y + 0.72, z0 + 0.05, TS.METAL);
  for (const [lx, lz] of [[x0 + 0.03, z0 + 0.03], [x1 - 0.07, z0 + 0.03], [x0 + 0.03, z1 - 0.07], [x1 - 0.07, z1 - 0.07]]) deco.box(lx, y, lz, lx + 0.04, y + 0.72, lz + 0.04, TS.METAL, { faces: FACE.SIDES });
  // monitor on the far side facing the sitter, keyboard on the near side
  const cx = (x0 + x1) / 2 + fx * 0.12, cz = (z0 + z1) / 2 + fz * 0.12;
  if (o.monitor !== false) monitor(ctx, cx, cz, y + 0.77, OPP[dir]);
  const kx = (x0 + x1) / 2 - fx * 0.14, kz = (z0 + z1) / 2 - fz * 0.14;
  if (dir < 2) deco.box(kx - 0.07, y + 0.77, kz - 0.2, kx + 0.07, y + 0.79, kz + 0.2, TS.METAL);
  else deco.box(kx - 0.2, y + 0.77, kz - 0.07, kx + 0.2, y + 0.79, kz + 0.07, TS.METAL);
  deco.collider(x0, y, z0, x1, y + 0.79, z1);
}
// water cooler (steel base, glass bottle)
function cooler(ctx, x, z, d, y) {
  const cx = x + 0.5 + DIR_X[d] * 0.25, cz = z + 0.5 + DIR_Z[d] * 0.25;
  ctx.deco.box(cx - 0.18, y, cz - 0.18, cx + 0.18, y + 1.0, cz + 0.18, TS.METAL, { solid: true });
  ctx.deco.box(cx - 0.13, y + 1.0, cz - 0.13, cx + 0.13, y + 1.45, cz + 0.13, TS.GLASS, { uv: 'fit', emissive: 0.3 });
}
// drum (barrel) standing at (cx, cz)
function drum(ctx, cx, cz, y, tex = TS.CRATE2) {
  const { deco } = ctx;
  deco.box(cx - 0.27, y, cz - 0.27, cx + 0.27, y + 0.88, cz + 0.27, tex, { uv: 'fit', solid: true });
  deco.box(cx - 0.29, y + 0.28, cz - 0.29, cx + 0.29, y + 0.32, cz + 0.29, TS.METAL);
  deco.box(cx - 0.29, y + 0.6, cz - 0.29, cx + 0.29, y + 0.64, cz + 0.29, TS.METAL);
}
// sitting directions in a frame: toward the t = 0 wall / away from it
const lit = (ctx, color = WHITE, step = 4, radius = 6) => {
  const { g, deco, room: r } = ctx;
  for (let z = r.z + 1; z < r.z + r.h - 1; z += step) for (let x = r.x + 1; x < r.x + r.w - 1; x += step) {
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i]) continue;
    deco.lightPanel(x + 0.1, z + 0.3, x + 0.9, z + 0.7, g.ceil[i], color, radius);
  }
  r.lit = true;
};

// ======================================================================
// OFFICE (research admin / hospital records): cubicle pods with low
// partitions, desks, chairs and monitors, a glass-walled manager's office in
// a corner, filing cabinets, a copier and a water cooler on the walls
// ======================================================================
LX.office = function office(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildOffice(ctx, Fr), (c) => officeLite(c));
};
function buildOffice(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 7 || Wd < 7) return false;
  const hosp = isHosp(ctx);
  const topH = Math.min(3.0, r.ceilH - 0.3);
  // manager's office: a 4x4 glass box in a t = 0 corner
  const m = freeMask(ctx, Fr, 1);
  const mo = bestRect(m, { t0: 0, t1: 5, minT: 4, minS: 4, maxT: 4, maxS: 5, score: (t, s, dt, ds) => (t === 0 ? 50 : 0) + (s === 0 || s + ds === Wd ? 30 : 0) - s * 0.01 });
  let boss = false;
  if (mo && mo.t === 0 && (mo.s === 0 || mo.s + mo.ds === Wd) && L >= 9) {
    const { s: ms, dt, ds } = mo;
    const doorS = ms === 0 ? ms + ds - 2 : ms;
    glassLineL(ctx, Fr, dt, ms, ms + ds, y, topH, [[doorS, doorS + 2]]);
    const sl = ms === 0 ? ms + ds : ms;
    const [ax, az] = Fr.pt(0, sl), [bx, bz] = Fr.pt(dt, sl);
    glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, topH);
    doorLeafL(ctx, Fr, dt, ms === 0 ? doorS - 0.95 : doorS + 2.04, ms === 0 ? doorS - 0.04 : doorS + 2.95, y, -1);
    // desk facing the door, chair behind, a cabinet and a plant
    const ds0 = ms + 1;
    const [dx0, dz0, dw, dh] = Fr.rect(1.0, ds0, 0.75, 2);
    desk(ctx, dx0, dz0, dx0 + dw, dz0 + dh, y, Fr.toward, { top: TS.WOOD });
    const [cx, cz] = Fr.pt(0.55, ds0 + 1);
    chair(ctx, cx, cz, y, Fr.away);
    const [px, pz] = Fr.cell(0, ms === 0 ? ms : ms + ds - 1);
    deco.planter(px + 0.15, pz + 0.15, y, 0.7, 0.7);
    const [kx, kz] = Fr.cell(dt - 1, ms === 0 ? ms : ms + ds - 1);
    cabinet(ctx, kx, kz, ms === 0 ? Fr.latN : Fr.lat, y, 1.3, 0.5);
    useL(ctx, Fr, 0, ms, dt + 1, ds);
    boss = true;
  }
  // cubicle pods (2 rows of desks back to back against a low partition)
  const m2 = freeMask(ctx, Fr, 0);
  let pods = 0;
  for (let t = boss ? 6 : 2; t + 2 <= L - 1; t += 4) {
    for (let s = 2; s < Wd - 1;) {
      let len = Math.min(3, Wd - 1 - s);
      const fits = (n) => { for (let k = 0; k < n; k++) for (const tt of [t, t + 1]) if (!m2[tt] || !m2[tt][s + k]) return false; return true; };
      while (len >= 2 && !fits(len)) len--;
      if (len < 2) { s++; continue; }
      // partition along the middle line t + 1, end panels
      lbox(deco, Fr, t + 0.96, t + 1.04, s, s + len, y, y + 1.25, TS.PANEL);
      lbox(deco, Fr, t + 0.94, t + 1.06, s, s + len, y + 1.25, y + 1.3, TS.METAL);
      for (const se of [s, s + len]) lbox(deco, Fr, t + 0.25, t + 1.75, se - 0.03, se + 0.03, y, y + 1.1, TS.PANEL);
      for (let k = 0; k < len; k++) {
        // desk against the partition on each side, chair in front
        const [a0x, a0z, aw, ah] = Fr.rect(t + 0.38, s + k + 0.06, 0.6, 0.88);
        desk(ctx, a0x, a0z, a0x + aw, a0z + ah, y, Fr.toward);
        const [c1x, c1z] = Fr.pt(t + 0.2, s + k + 0.5);
        if (rng.chance(0.85)) chair(ctx, c1x, c1z, y, Fr.away);
        const [b0x, b0z, bw2, bh2] = Fr.rect(t + 1.02, s + k + 0.06, 0.6, 0.88);
        desk(ctx, b0x, b0z, b0x + bw2, b0z + bh2, y, Fr.away);
        const [c2x, c2z] = Fr.pt(t + 1.8, s + k + 0.5);
        if (rng.chance(0.85)) chair(ctx, c2x, c2z, y, Fr.toward);
      }
      useL(ctx, Fr, t, s, 2, len);
      pods++;
      s += len + 2;
    }
  }
  if (!pods && !boss) return false;
  // walls: filing cabinets, a copier, a water cooler, notice screens
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k === 0) machineBlock(ctx, x, z, d, y, 1.1, 0.7);
    else if (k === 1) cooler(ctx, x, z, d, y);
    else if (k < 7) cabinet(ctx, x, z, d, y, 1.35, 0.55);
    else if (k < 9 && hosp) wallShelf2(ctx, x, z, d, y);
    else break;
    use(ctx, x, z, 1, 1);
    k++;
  }
  lit(ctx, hosp ? WARM : WHITE, 3, 5.5);
  return true;
}
function wallShelf2(ctx, x, z, d, y) {
  const dep = 0.42;
  const x0 = d === 0 ? x + 1 - dep : d === 1 ? x : x + 0.05, x1 = d === 0 ? x + 1 : d === 1 ? x + dep : x + 0.95;
  const z0 = d === 2 ? z + 1 - dep : d === 3 ? z : z + 0.05, z1 = d === 2 ? z + 1 : d === 3 ? z + dep : z + 0.95;
  openShelf(ctx, x0, z0, x1, z1, y, 2.0, { items: [TS.CRATE2, TS.CRATE, TS.CRATE2] });
}
// fallback: desks along the walls
function officeLite(ctx) {
  const { rng, room: r } = ctx;
  ctx.used = new Set();
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k % 3 === 2) cabinet(ctx, x, z, d, r.floor, 1.35, 0.55);
    else {
      const x0 = d === 0 ? x + 0.3 : d === 1 ? x : x + 0.05, x1 = d === 0 ? x + 1 : d === 1 ? x + 0.7 : x + 0.95;
      const z0 = d === 2 ? z + 0.3 : d === 3 ? z : z + 0.05, z1 = d === 2 ? z + 1 : d === 3 ? z + 0.7 : z + 0.95;
      desk(ctx, x0, z0, x1, z1, r.floor, OPP[d]);
    }
    use(ctx, x, z, 1, 1);
    if (++k >= 10) break;
  }
  lit(ctx, WHITE, 4, 6);
}

// ======================================================================
// SECURITY STATION: a CCTV wall of screens over a console row, a supervisor
// desk, weapon lockers and a gun rack (armoury), a barred holding cell in a
// corner, a metal detector arch
// ======================================================================
LX.security = function security(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr, last) => buildSecurity(ctx, Fr, last), (c) => officeLite(c));
};
function buildSecurity(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 7 || Wd < 7) return false;
  // CCTV wall on t = 0 over the longest free stretch
  let a = -1, b = -1, ca = -1;
  for (let s = 0; s <= Wd; s++) {
    const f = s < Wd && okL(ctx, Fr, 0, s, 2, 1, 0, 0);
    if (f && ca < 0) ca = s;
    if (!f && ca >= 0) { if (s - ca > b - a) { a = ca; b = s; } ca = -1; }
  }
  if (b - a < (last ? 2 : 4)) return false;
  const rows = r.ceilH >= 4.2 ? 3 : 2;
  for (let s = a; s < b; s++) {
    const [x, z] = Fr.cell(0, s);
    deco.console(x, z, y, Fr.away);
    for (let k = 0; k < rows; k++) {
      const y0 = y + 1.6 + k * 0.62;
      lbox(deco, Fr, 0, 0.12, s + 0.04, s + 0.96, y0, y0 + 0.56, faced(Fr.away, TS.SCREEN, TS.METAL), { uv: 'fit', emissive: 0.85 });
    }
    const [cx, cz] = Fr.pt(1.45, s + 0.5);
    if (rng.chance(0.6)) chair(ctx, cx, cz, y, Fr.toward);
  }
  lbox(deco, Fr, 0, 0.16, a, b, y + 1.6 + rows * 0.62, y + 1.66 + rows * 0.62, TS.METAL);
  useL(ctx, Fr, 0, a, 2, b - a);
  // supervisor desk behind the console row
  const m = freeMask(ctx, Fr, 1);
  const sup = bestRect(m, { t0: 3, t1: L - 1, minT: 2, minS: 3, maxT: 2, maxS: 3, score: (t, s) => -t - Math.abs(s + 1.5 - Wd / 2) });
  if (sup) {
    const [x0, z0, w, h] = Fr.rect(sup.t + 0.15, sup.s + 0.1, 0.8, 2.8);
    desk(ctx, x0, z0, x0 + w, z0 + h, y, Fr.away);
    const [cx, cz] = Fr.pt(sup.t + 1.4, sup.s + 1.5);
    chair(ctx, cx, cz, y, Fr.toward);
    useL(ctx, Fr, sup.t, sup.s, 2, 3);
  }
  // barred holding cell in a far corner (3x3 against two walls)
  const m2 = freeMask(ctx, Fr, 1);
  let cell = null;
  for (const s0 of [0, Wd - 3]) {
    const t0 = L - 3;
    let okc = true;
    for (let t = t0; t < L; t++) for (let s = s0; s < s0 + 3; s++) if (!m2[t][s]) okc = false;
    if (okc && L >= 9) { cell = { t0, s0 }; break; }
  }
  if (cell) {
    const { t0, s0 } = cell;
    const hB = Math.min(3.0, r.ceilH - 0.2);
    const doorS = s0 === 0 ? s0 + 1 : s0;
    glassLineL(ctx, Fr, t0, s0, s0 + 3, y, hB, [[doorS, doorS + 2]], { pane: 'bars' });
    const sl = s0 === 0 ? 3 : Wd - 3;
    const [ax, az] = Fr.pt(t0, sl), [bx, bz] = Fr.pt(L, sl);
    glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, hB, { pane: 'bars' });
    // bench and a steel toilet inside
    const bs = s0 === 0 ? 0 : 2;
    lbox(deco, Fr, L - 2.8, L - 0.2, bs + 0.05, bs + 0.6, y + 0.42, y + 0.5, TS.METAL);
    lbox(deco, Fr, L - 2.7, L - 0.3, bs + 0.1, bs + 0.55, y, y + 0.42, TS.SIDE);
    lcollider(deco, Fr, L - 2.8, L - 0.2, bs + 0.05, bs + 0.6, y, y + 0.5);
    useL(ctx, Fr, t0 - 1, s0, 4, 3);
  }
  // armoury: weapon lockers and a gun rack on the side walls
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k % 3 === 2) gunRack(ctx, x, z, d, y);
    else cabinet(ctx, x, z, d, y, 2.0, 0.55);
    use(ctx, x, z, 1, 1);
    if (++k >= 6) break;
  }
  lit(ctx, WHITE, 4, 6);
  return true;
}
function gunRack(ctx, x, z, d, y) {
  const { deco } = ctx;
  wallBox(ctx, x, z, d, 0.08, y + 0.3, y + 2.0, TS.WOOD, { inset: 0.05 });
  for (let k = 0; k < 4; k++) {
    const u = 0.17 + k * 0.22;
    const off = 0.14;
    const cx = d < 2 ? x + 0.5 + DIR_X[d] * (0.5 - off) : x + u, cz = d >= 2 ? z + 0.5 + DIR_Z[d] * (0.5 - off) : z + u;
    deco.box(cx - 0.03, y + 0.45, cz - 0.03, cx + 0.03, y + 1.65, cz + 0.03, TS.METAL);
    deco.box(cx - 0.05, y + 0.45, cz - 0.05, cx + 0.05, y + 0.85, cz + 0.05, TS.METAL);
  }
  deco.collider(d === 0 ? x + 0.7 : d === 1 ? x : x + 0.05, y, d === 2 ? z + 0.7 : d === 3 ? z : z + 0.05, d === 0 ? x + 1 : d === 1 ? x + 0.3 : x + 0.95, y + 2.0, d === 2 ? z + 1 : d === 3 ? z + 0.3 : z + 0.95, { obstacle: false });
}

// ======================================================================
// ISOLATION BLOCK: a row of 3x3 quarantine cells along a wall, panel
// partitions between them, full-height glass fronts with open (some smashed)
// sliding doors, a bed or restraint chair, a steel toilet and sink and a
// ceiling light in each, an intercom by each door, an observation desk
// ======================================================================
LX.isolation = function isolation(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr, last) => buildIsolation(ctx, Fr, last), (c) => LX.office(c));
};
function buildIsolation(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 7 || Wd < 7) return false;
  const hosp = isHosp(ctx);
  const H = Math.min(r.ceilH, 3.6);
  // free 3-wide slots along the t = 0 wall (3 deep + the walkway row in front)
  const slot = (s0) => okL(ctx, Fr, 0, s0, 3, 3, 0, 0) && canUseL(ctx, Fr, 3, s0, 1, 3);
  let best = null;
  for (let off = 0; off < 3; off++) {
    let run = [];
    for (let s0 = off; s0 + 3 <= Wd; s0 += 3) {
      if (slot(s0)) run.push(s0); else { if (!best || run.length > best.length) best = run; run = []; }
    }
    if (!best || run.length > best.length) best = run;
  }
  if (!best || best.length < (Wd >= 9 && !last ? 2 : 1)) return false;
  const cells = best;
  const sA = cells[0], sB = cells[cells.length - 1] + 3;
  // partitions between / at the ends of the cells
  for (let k = 0; k <= cells.length; k++) {
    const sl = sA + k * 3;
    if (sl === 0 || sl === Wd) continue;
    const [ax, az] = Fr.pt(0, sl), [bx, bz] = Fr.pt(3, sl);
    glassWall(ctx, Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz), y, H, { pane: TS.WALL, thick: 0.16 });
  }
  // glass fronts with door openings, a smashed door here and there
  const doors = cells.map((s0) => [s0 + 1, s0 + 3]);
  glassLineL(ctx, Fr, 3, sA, sB, y, H, doors);
  cells.forEach((s0, k) => {
    const smashed = rng.chance(0.3);
    if (!smashed) doorLeafL(ctx, Fr, 3, s0 + 0.06, s0 + 0.96, y, 1);
    else for (let n = 0; n < 5; n++) { const [px, pz] = Fr.pt(3.3 + rng.float(0, 1.2), s0 + 1 + rng.float(0, 2)); deco.box(px - 0.08, y, pz - 0.06, px + 0.08, y + 0.02, pz + 0.06, TS.GLASS, { emissive: 0.3 }); }
    // number plate + intercom screen on the front mullion
    lbox(deco, Fr, 3.08, 3.14, s0 + 0.2, s0 + 0.8, y + 1.3, y + 1.6, faced(Fr.away, TS.SCREEN, TS.METAL), { uv: 'fit', emissive: 0.7 });
    // furnishing: bed / restraint chair at the back, toilet + sink in a corner
    if (hosp || rng.chance(0.5)) {
      const [hx, hz] = Fr.cell(0, s0 + 1);
      bed(ctx, hx, hz, Fr.toward, y, { shift: 0 });
    } else {
      const [cx, cz] = Fr.pt(0.9, s0 + 1.5);
      deco.box(cx - 0.35, y, cz - 0.35, cx + 0.35, y + 0.5, cz + 0.35, TS.METAL, { solid: true });
      lbox(deco, Fr, 0.3, 0.45, s0 + 1.1, s0 + 1.9, y + 0.5, y + 1.5, TS.METAL);
      for (const ss of [s0 + 1.05, s0 + 1.95]) lbox(deco, Fr, 0.6, 1.1, ss - 0.05, ss + 0.05, y + 0.62, y + 0.7, TS.CARPET);
      if (rng.chance(0.6)) pit(ctx, ...Fr.rect(2, s0, 1, 1), 'poison', 0.25);
    }
    const [tx, tz] = Fr.pt(0.35, s0 + 2.6);
    deco.box(tx - 0.22, y, tz - 0.2, tx + 0.22, y + 0.45, tz + 0.2, TS.METAL, { solid: true });
    const [sx, sz] = Fr.pt(1.6, s0 + 2.75);
    deco.box(sx - 0.25, y + 0.75, sz - 0.18, sx + 0.25, y + 0.9, sz + 0.25, TS.METAL);
    const [lx, lz] = Fr.pt(1.5, s0 + 1.5);
    deco.box(lx - 0.35, y + H - 0.06, lz - 0.2, lx + 0.35, y + H, lz + 0.2, TS.LIGHT, { uv: 'fit', emissive: 1 });
    deco.light(lx, y + H - 0.5, lz, hosp ? WARM : [0.8, 1, 0.85], 3.5, { flicker: rng.chance(0.3) });
    for (const i of cellsOf(g, ...Fr.rect(0, s0, 3, 3))) if (g.type[i] && !(g.flags[i] & (F.WATER | F.HAZARD))) g.floorTex[i] = TS.FLOOR3;
    void k;
  });
  // the cells' ceiling (sealed boxes)
  lbox(deco, Fr, 0, 3, sA, sB, y + H, y + H + 0.1, TS.METAL);
  useL(ctx, Fr, 0, sA, 5, sB - sA);
  // observation desk facing the cells, warning lines along the fronts
  const [p0x, p0z] = Fr.pt(3.2, sA), [p1x, p1z] = Fr.pt(3.34, sB);
  paint(ctx, Math.min(p0x, p1x), Math.min(p0z, p1z), Math.max(p0x, p1x), Math.max(p0z, p1z), y);
  const m = freeMask(ctx, Fr, 1);
  const obs = bestRect(m, { t0: 6, t1: L, minT: 1, minS: 2, maxT: 1, maxS: 3, score: (t, s, dt, ds) => -t * 2 - Math.abs(s + ds / 2 - (sA + sB) / 2) + ds });
  if (obs && Fr.L >= 8) {
    for (let s = obs.s; s < obs.s + obs.ds; s++) { const [x, z] = Fr.cell(obs.t, s); deco.console(x, z, y, Fr.toward); }
    useL(ctx, Fr, obs.t, obs.s, 1, obs.ds);
  }
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx)).slice(0, 5)) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (hosp && rng.chance(0.5)) ivStand(ctx, x + 0.5, z + 0.5, y);
    else cabinet(ctx, x, z, d, y, 2.0, 0.5);
    use(ctx, x, z, 1, 1);
  }
  lit(ctx, hosp ? WARM : WHITE, 4, 6);
  return true;
}

// ======================================================================
// HYDROPONICS (bio): a skylit greenhouse under a steel roof frame - raised
// planter beds in rows with drip lines and grow-light bars, a mutated bed
// gone wild, a water tank and nutrient tanks, potting benches, a drainage
// channel along a wall
// ======================================================================
LX.hydroponics = function hydroponics(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr, last) => buildHydro(ctx, Fr, last), (c) => TEMPLATES.courtyard(c));
};
function buildHydro(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 7 || Wd < 7) return false;
  const roofY = y + Math.min(6.5, Math.max(4.5, r.ceilH - 1));
  // roof frame (steel glazing bars) over the whole room
  for (let s = 0; s <= Wd; s += 2) { const [ax, az] = Fr.pt(0, s), [bx, bz] = Fr.pt(L, s); deco.box(Math.min(ax, bx) - 0.05, roofY, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, roofY + 0.18, Math.max(az, bz) + 0.05, TS.BEAM); }
  for (let t = 0; t <= L; t += 3) { const [ax, az] = Fr.pt(t, 0), [bx, bz] = Fr.pt(t, Wd); deco.box(Math.min(ax, bx) - 0.06, roofY - 0.1, Math.min(az, bz) - 0.06, Math.max(ax, bx) + 0.06, roofY + 0.2, Math.max(az, bz) + 0.06, TS.BEAM); }
  // beds: 1 wide along t, 2-wide aisles between bed rows
  const m = freeMask(ctx, Fr, 1);
  let beds = 0;
  const wild = rng.int(0, 5);
  for (let s = 2; s < Wd - 2; s += 3) {
    let t = 2;
    while (t < L - 2) {
      let len = 0;
      while (t + len < L - 2 && len < 5 && m[t + len][s]) len++;
      if (len < 2) { t++; continue; }
      bedRow(ctx, Fr, t, s, len, y, beds === wild);
      useL(ctx, Fr, t, s, len, 1);
      beds++;
      t += len + 2;
    }
  }
  if (beds < (last ? 1 : 2)) return false;
  // tanks against the walls: a water tank and nutrient tanks, potting bench
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    const cx = x + 0.5 + DIR_X[d] * 0.08, cz = z + 0.5 + DIR_Z[d] * 0.08;
    if (k === 0) tank(ctx, cx, cz, y, y + 2.6, { r: 0.38, fluid: TS.WATER });
    else if (k < 3) tank(ctx, cx, cz, y, y + 1.9, { r: 0.3, fluid: TS.POISON });
    else if (k < 5) { const x0 = d === 0 ? x + 0.35 : d === 1 ? x : x + 0.05, x1 = d === 0 ? x + 1 : d === 1 ? x + 0.65 : x + 0.95; const z0 = d === 2 ? z + 0.35 : d === 3 ? z : z + 0.05, z1 = d === 2 ? z + 1 : d === 3 ? z + 0.65 : z + 0.95; labBench(ctx, x0, z0, x1, z1, y, { shelf: false }); }
    else break;
    use(ctx, x, z, 1, 1);
    k++;
  }
  // ground under the beds' aisles: grates over drains every so often
  for (const i of ctx.cells) if (g.type[i] && !ctx.used.has(i) && !(g.flags[i] & (F.STAIR | F.PIT | F.WATER | F.HAZARD)) && (i % 5 === 0)) g.floorTex[i] = TS.GRATE;
  r.lit = true;
  return true;
}
// one planter bed (frame coords) with plants, a drip line and a grow light
function bedRow(ctx, Fr, t, s, len, y, wild) {
  const { deco, rng, room: r } = ctx;
  lbox(deco, Fr, t + 0.06, t + len - 0.06, s + 0.1, s + 0.9, y, y + 0.7, { side: TS.SIDE, top: TS.GROUND }, { solid: true });
  for (let u = 0; u < len; u += 0.5) {
    const hh = wild ? rng.float(0.8, 2.4) : rng.float(0.25, 0.6);
    const w = wild ? rng.float(0.2, 0.45) : rng.float(0.12, 0.2);
    const sc = s + 0.5 + rng.float(-0.15, 0.15);
    lbox(deco, Fr, t + u + 0.25 - w, t + u + 0.25 + w, sc - w, sc + w, y + 0.7, y + 0.7 + hh, TS.FOLIAGE, { s: 1 });
  }
  lbox(deco, Fr, t + 0.1, t + len - 0.1, s + 0.45, s + 0.55, y + 0.72, y + 0.78, TS.PIPE);
  const ly = y + 2.6;
  lbox(deco, Fr, t + 0.2, t + len - 0.2, s + 0.4, s + 0.6, ly, ly + 0.08, TS.LIGHT, { uv: 'fit', emissive: 1 });
  lbox(deco, Fr, t + 0.2, t + len - 0.2, s + 0.35, s + 0.65, ly + 0.08, ly + 0.14, TS.METAL);
  for (const tt of [t + 0.3, t + len - 0.3]) lbox(deco, Fr, tt - 0.02, tt + 0.02, s + 0.48, s + 0.52, ly + 0.14, y + Math.min(6.5, Math.max(4.5, r.ceilH - 1)), TS.METAL, { faces: FACE.SIDES });
  const [cx, cz] = Fr.pt(t + len / 2, s + 0.5);
  deco.light(cx, ly - 0.3, cz, wild ? [0.6, 1, 0.4] : [1, 0.55, 1], 4.5);
}

// ======================================================================
// WASTE PROCESSING (bio): a toxic sump under a grated floor (walkable grate
// lanes over the sludge, railed open edges), an incinerator with a glowing
// port and a flue, a compactor under a chute, drum clusters, hazard lines
// ======================================================================
LX.waste = function waste(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr) => buildWaste(ctx, Fr), (c) => wasteLite(c));
};
function buildWaste(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor, top = y + r.ceilH;
  if (L < 8 || Wd < 7) return false;
  // incinerator on the t = 0 wall: 2 wide
  let inc = null;
  for (let s = 1; s + 2 < Wd; s++) if (okL(ctx, Fr, 0, s, 2, 2, 0, 0)) { inc = s; if (Math.abs(s + 1 - Wd / 2) < 2) break; }
  if (inc === null) return false;
  lbox(deco, Fr, 0, 1.4, inc, inc + 2, y, y + 2.5, faced(Fr.away, TS.MACHINE, TS.METAL), { uv: 'fit', solid: true });
  lbox(deco, Fr, 1.4, 1.46, inc + 0.5, inc + 1.5, y + 0.6, y + 1.3, TS.LAVA, { emissive: 1 });
  lbox(deco, Fr, 0.2, 0.9, inc + 0.65, inc + 1.35, y + 2.5, top, TS.PIPE);
  const [ix, iz] = Fr.pt(1.8, inc + 1);
  deco.light(ix, y + 1.0, iz, [1, 0.5, 0.2], 5, { flicker: true });
  useL(ctx, Fr, 0, inc, 2, 2);
  // the sump with grate lanes over it
  const cand = new Set();
  for (let t = 3; t < L - 2; t++) for (let s = 2; s < Wd - 2; s++) {
    if (!okL(ctx, Fr, t, s, 1, 1, 1, 1)) continue;
    const [x, z] = Fr.cell(t, s); cand.add(g.idx(x, z));
  }
  const sump = largestBlob(g, openShape(g, cand));
  if (sump.size >= 12) {
    const pc = pitSet(ctx, sump, 'poison', 2.4);
    for (const i of sump) ctx.used.add(i);
    const walk = new Set(ctx.cells.filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.HAZARD))));
    // grate lanes along s every 3 rows when they land on floor at both ends
    const inS = (t, s) => { const [x, z] = Fr.cell(t, s); return sump.has(g.idx(x, z)); };
    for (let t = 3; t < L - 2; t += 3) {
      let a = -1, b = -1;
      for (let s = 0; s < Wd; s++) if (inS(t, s)) { if (a < 0) a = s; b = s; }
      if (a < 0) continue;
      let full = true;
      for (let s = a; s <= b; s++) if (!inS(t, s)) full = false;
      if (!full) continue;
      for (const i of deckBridge(ctx, ...Fr.rect(t, a, 1, b - a + 1), y)) walk.add(i);
    }
    deco.railEdges(walk, { style: 'metal' });
    hazardLines(ctx, pc.filter((i) => g.flags[i] & F.PIT));
    // chutes dropping into the sump from the ceiling
    for (let n = 0; n < 2; n++) {
      const i = pc[rng.int(0, pc.length - 1)];
      if (!(g.flags[i] & F.PIT)) continue;
      const cx = (i % g.w) + 0.5, cz = ((i / g.w) | 0) + 0.5;
      deco.box(cx - 0.4, y + 2.6, cz - 0.4, cx + 0.4, top, cz + 0.4, TS.PIPE);
      deco.box(cx - 0.5, y + 2.4, cz - 0.5, cx + 0.5, y + 2.6, cz + 0.5, TS.METAL);
    }
  } else {
    // no room for the sump: chemical spills round a floor drain
    for (let n = 0; n < 4; n++) {
      const t = rng.int(3, L - 4), s = rng.int(1, Wd - 3);
      if (okL(ctx, Fr, t, s, 2, 2, 1, 1)) { pit(ctx, ...Fr.rect(t, s, 2, 2), 'poison', 0.3); useL(ctx, Fr, t, s, 2, 2); }
    }
  }
  wasteLite(ctx, true);
  return true;
}
// drums, a compactor and hazard paint on the free walls
function wasteLite(ctx, keep = false) {
  const { deco, rng, room: r } = ctx;
  if (!keep) ctx.used = new Set();
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k === 0) { machineBlock(ctx, x, z, d, r.floor, 1.8, 0.85); deco.box(x + 0.3, r.floor + 1.8, z + 0.3, x + 0.7, r.floor + r.ceilH, z + 0.7, TS.PIPE); }
    else if (k < 6) { drum(ctx, x + 0.32, z + 0.32, r.floor, k % 2 ? TS.CRATE2 : TS.CRATE); if (rng.chance(0.6)) drum(ctx, x + 0.68, z + 0.66, r.floor); }
    else break;
    use(ctx, x, z, 1, 1);
    k++;
  }
  if (!keep) for (let n = 0; n < 3; n++) {
    const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
    if (ok(ctx, x, z, 2, 2, 1, 1)) { pit(ctx, x, z, 2, 2, 'poison', 0.3); use(ctx, x, z, 2, 2); }
  }
  lit(ctx, [0.85, 1, 0.8], 4, 6);
}

// ======================================================================
// CAFETERIA (hospital): a serving line along one wall (counter with a sneeze
// guard and trays, ovens and fridges behind it), four-seat tables in a grid
// (some overturned), vending machines and bins
// ======================================================================
LX.cafeteria = function cafeteria(ctx) {
  tryFrames(ctx, sideOrder(ctx, true), (Fr, last) => buildCafeteria(ctx, Fr, last), (c) => officeLite(c));
};
function buildCafeteria(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 8 || Wd < 8) return false;
  // serving line: kitchen kit at t = 0, counter at t = 1 over the longest free run
  let a = -1, b = -1, ca = -1;
  for (let s = 0; s <= Wd; s++) {
    const f = s < Wd && okL(ctx, Fr, 0, s, 3, 1, 0, 0);
    if (f && ca < 0) ca = s;
    if (!f && ca >= 0) { if (s - ca > b - a) { a = ca; b = s; } ca = -1; }
  }
  const line = b - a >= 3;
  if (!line && !last) return false;
  if (line) for (let s = a; s < b; s++) {
    const [x, z] = Fr.cell(0, s);
    const k = (s - a) % 4;
    if (k === 0) cabinet(ctx, x, z, Fr.toward, y, 2.0, 0.8);                       // fridge
    else if (k === 2) machineBlock(ctx, x, z, Fr.toward, y, 1.0, 0.8);             // oven
    else wallBox(ctx, x, z, Fr.toward, 0.8, y, y + 0.9, faced(Fr.away, TS.CRATE2, TS.METAL), { solid: true, uv: 'fit' });
  }
  if (line) {
    const [c0x, c0z] = Fr.pt(1.1, a), [c1x, c1z] = Fr.pt(1.9, b);
    counter(ctx, Math.min(c0x, c1x), Math.min(c0z, c1z), Math.max(c0x, c1x), Math.max(c0z, c1z), y, Fr.away, { front: TS.PANEL, top: TS.METAL, h: 0.95 });
    lbox(deco, Fr, 1.3, 1.34, a + 0.1, b - 0.1, y + 1.2, y + 1.6, TS.GLASS, { uv: 'fit', emissive: 0.2 });
    for (let s = a + 0.5; s < b - 0.5; s += 1) lbox(deco, Fr, 1.45, 1.75, s - 0.3, s + 0.3, y + 0.95, y + 0.99, TS.METAL);
    lbox(deco, Fr, 1.9, 2.0, a, b, y + 0.85, y + 0.89, TS.METAL);   // tray slide
    useL(ctx, Fr, 0, a, 3, b - a);
  }
  // tables in a grid of 2x2 blocks with aisles
  const m = freeMask(ctx, Fr, last ? 0 : 1);
  let tables = 0;
  for (let t = line ? 4 : 1; t + 2 <= L - 1; t += 3) for (let s = 1; s + 2 <= Wd - 1; s += 3) {
    if (!(m[t][s] && m[t][s + 1] && m[t + 1][s] && m[t + 1][s + 1])) continue;
    const [cx, cz] = Fr.pt(t + 1, s + 1);
    if (rng.chance(0.18)) {
      // overturned: the top on its edge, stools scattered
      const [ox0, oz0] = Fr.pt(t + 0.9, s + 0.4), [ox1, oz1] = Fr.pt(t + 1.0, s + 1.6);
      deco.box(Math.min(ox0, ox1), y, Math.min(oz0, oz1), Math.max(ox0, ox1), y + 0.8, Math.max(oz0, oz1), TS.WOOD, { solid: true });
    } else {
      deco.table(cx - 0.6, cz - 0.4, y, 1.2, 0.8, TS.WOOD);
      if (rng.chance(0.5)) deco.box(cx - 0.15, y + 0.8, cz - 0.1, cx + 0.15, y + 0.83, cz + 0.1, TS.METAL);
    }
    for (const [ox, oz] of [[-0.35, -0.65], [0.35, -0.65], [-0.35, 0.65], [0.35, 0.65]]) {
      if (rng.chance(0.15)) continue;
      const sx = cx + ox + rng.float(-0.08, 0.08), sz = cz + oz + rng.float(-0.08, 0.08);
      deco.box(sx - 0.17, y + 0.42, sz - 0.17, sx + 0.17, y + 0.47, sz + 0.17, TS.CARPET);
      deco.box(sx - 0.03, y, sz - 0.03, sx + 0.03, y + 0.42, sz + 0.03, TS.METAL, { faces: FACE.SIDES });
    }
    useL(ctx, Fr, t, s, 2, 2);
    tables++;
  }
  if (tables < 1) return false;
  // vending machines and bins on the walls
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k < 2) machineBlock(ctx, x, z, d, y, 1.9, 0.8);
    else if (k < 4) { const cx = x + 0.5 + DIR_X[d] * 0.25, cz = z + 0.5 + DIR_Z[d] * 0.25; deco.box(cx - 0.22, y, cz - 0.22, cx + 0.22, y + 0.85, cz + 0.22, TS.METAL, { solid: true }); }
    else break;
    use(ctx, x, z, 1, 1);
    k++;
  }
  lit(ctx, WARM, 3, 5.5);
  void g;
  return true;
}

// ======================================================================
// RADIOLOGY (hospital): a scanner gantry (housing round a bore) with a
// patient couch sliding into it inside a magnetic-field warning line, a
// control room behind a lead-glass window across one end, lead aprons and a
// film viewer on the walls
// ======================================================================
LX.radiology = function radiology(ctx) {
  tryFrames(ctx, sideOrder(ctx, false), (Fr, last) => buildRadiology(ctx, Fr, last), (c) => officeLite(c));
};
function buildRadiology(ctx, Fr, last) {
  const { g, deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  if (L < 9 || Wd < 7) return false;
  // control room: t < tc behind a glass line with a 2-wide door
  let tc = -1, op = null;
  for (const t of [3, 4, 5]) { if (t > L - 6) break; const o = lineOpening(ctx, Fr, t, 2, 3, Wd - 3); if (o && o[1] - o[0] <= 3) { tc = t; op = o; break; } }
  if (tc < 0 && !last) return false;
  const H = Math.min(r.ceilH, 3.2);
  if (tc < 0) {
    // no room for a control room: the operator desk stands behind a lead screen
    const m0 = freeMask(ctx, Fr, 1);
    const dsk = bestRect(m0, { t0: 0, t1: 3, minT: 1, minS: 2, maxT: 1, maxS: 2 });
    if (dsk) {
      for (let s = dsk.s; s < dsk.s + 2; s++) { const [x, z] = Fr.cell(dsk.t, s); deco.console(x, z, y, Fr.away); }
      lbox(deco, Fr, dsk.t + 1.1, dsk.t + 1.18, dsk.s - 0.2, dsk.s + 2.2, y, y + 1.0, TS.PANEL);
      lbox(deco, Fr, dsk.t + 1.12, dsk.t + 1.16, dsk.s - 0.2, dsk.s + 2.2, y + 1.0, y + 2.0, TS.GLASS, { uv: 'fit', emissive: 0.2 });
      useL(ctx, Fr, dsk.t, dsk.s, 2, 2);
    }
    tc = 1;
  } else radControl(ctx, Fr, tc, op, H);
  return radScanner(ctx, Fr, tc);
}
function radControl(ctx, Fr, tc, op, H) {
  const { g, deco, rng, room: r } = ctx;
  const Wd = Fr.Wd, y = r.floor;
  // solid wainscot below the window (lead lined), glass above
  glassLineL(ctx, Fr, tc, 0, Wd, y, H, [op]);
  for (const [p, q] of [[0, op[0]], [op[1], Wd]]) if (q > p) lbox(deco, Fr, tc - 0.1, tc + 0.1, p, q, y, y + 1.0, TS.PANEL);
  // consoles behind the window facing the scanner
  for (let s = 0; s < Wd; s++) {
    if (s >= op[0] - 1 && s <= op[1]) continue;
    const [x, z] = Fr.cell(tc - 1, s);
    if (!flatOpen(ctx, x, z, 1, 1) || r.reserved.has(g.idx(x, z))) continue;
    deco.console(x, z, y, Fr.toward);
    const [cx, cz] = Fr.pt(tc - 1.75, s + 0.5);
    if (rng.chance(0.7)) chair(ctx, cx, cz, y, Fr.away);
    use(ctx, x, z, 1, 1);
  }
  useL(ctx, Fr, tc - 1, op[0], 2, op[1] - op[0]);
}
function radScanner(ctx, Fr, tc) {
  const { deco, rng, room: r } = ctx;
  const L = Fr.L, Wd = Fr.Wd, y = r.floor;
  // the scanner: a free 3 (t) x 4 (s) block in the scan room
  const ct = (tc + L) / 2, cs = Wd / 2;
  const sc = (t, s) => -Math.abs(t + 2 - ct) - Math.abs(s + 1.5 - cs);
  const blk = bestRect(freeMask(ctx, Fr, 1), { t0: tc + 2, t1: L - 1, minT: 4, minS: 3, maxT: 4, maxS: 3, score: sc }) || bestRect(freeMask(ctx, Fr, 0), { t0: tc + 1, t1: L, minT: 4, minS: 3, maxT: 4, maxS: 3, score: sc });
  if (!blk) return false;
  const { t: bt, s: bs } = blk;
  // gantry housing round the bore (4 pieces), bore lining, couch
  const g0 = bt + 2.4, g1 = bt + 3.3, sa = bs - 0.1, sb = bs + 3.1, yb0 = y + 0.75, yb1 = y + 1.75, ytop = y + 2.5;
  const housing = faced(Fr.toward, TS.CRATE2, TS.CRATE2);
  lbox(deco, Fr, g0, g1, sa, bs + 1.0, y, ytop, housing, { uv: 'fit' });
  lbox(deco, Fr, g0, g1, bs + 2.0, sb, y, ytop, housing, { uv: 'fit' });
  lbox(deco, Fr, g0, g1, bs + 1.0, bs + 2.0, yb1, ytop, housing, { uv: 'fit' });
  lbox(deco, Fr, g0, g1, bs + 1.0, bs + 2.0, y, yb0, housing, { uv: 'fit' });
  lbox(deco, Fr, g0 - 0.02, g1 + 0.02, bs + 0.98, bs + 2.02, yb1 - 0.05, yb1, TS.LIGHT, { uv: 'fit', emissive: 1 });
  lcollider(deco, Fr, g0, g1, sa, sb, y, ytop);
  lbox(deco, Fr, bt + 0.2, g0, bs + 1.1, bs + 1.9, y + 0.6, y + 0.72, TS.METAL);
  lbox(deco, Fr, bt + 0.25, g0, bs + 1.15, bs + 1.85, y + 0.72, y + 0.82, TS.CARPET);
  lbox(deco, Fr, bt + 0.4, bt + 1.6, bs + 1.3, bs + 1.7, y, y + 0.6, TS.METAL);
  lcollider(deco, Fr, bt + 0.2, g0, bs + 1.1, bs + 1.9, y, y + 0.82);
  // magnetic-field warning line round it
  for (const [ta, tb, s0, s1] of [[bt - 0.4, bt - 0.26, bs - 0.6, bs + 3.6], [bt + 3.9, bt + 4.04, bs - 0.6, bs + 3.6]]) { const [ax, az] = Fr.pt(ta, s0), [bx, bz] = Fr.pt(tb, s1); paint(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), y); }
  for (const sl of [bs - 0.6, bs + 3.46]) { const [ax, az] = Fr.pt(bt - 0.4, sl), [bx, bz] = Fr.pt(bt + 4.04, sl + 0.14); paint(ctx, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), y); }
  const [lx, lz] = Fr.pt(bt + 2, bs + 1.5);
  deco.light(lx, y + 2.2, lz, [0.75, 0.9, 1], 6);
  useL(ctx, Fr, bt, bs, 4, 3);
  // lead aprons, film viewer, cabinets on the scan room walls
  let k = 0;
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!canUse(ctx, x, z, 1, 1, 0, 1)) continue;
    if (k === 0) { wallBox(ctx, x, z, d, 0.06, y + 1.3, y + 2.0, faced(OPP[d], TS.SCREEN, TS.METAL), { uv: 'fit', emissive: 0.9, inset: 0.1 }); wallBox(ctx, x, z, d, 0.5, y, y + 0.9, faced(OPP[d], TS.CRATE2, TS.METAL), { solid: true, uv: 'fit' }); }
    else if (k === 1) for (let n = 0; n < 3; n++) { const u = 0.22 + n * 0.28; const cx = d < 2 ? x + 0.5 + DIR_X[d] * 0.4 : x + u, cz = d >= 2 ? z + 0.5 + DIR_Z[d] * 0.4 : z + u; deco.box(cx - (d < 2 ? 0.04 : 0.11), y + 0.7, cz - (d < 2 ? 0.11 : 0.04), cx + (d < 2 ? 0.04 : 0.11), y + 1.6, cz + (d < 2 ? 0.11 : 0.04), TS.CARPET); }
    else if (k < 5) cabinet(ctx, x, z, d, y, 2.0, 0.5);
    else break;
    use(ctx, x, z, 1, 1);
    k++;
  }
  lit(ctx, WHITE, 4, 6);
  return true;
}

// ======================================================================
// Room dressing after each wing template: abandoned gurneys, wheelchairs,
// fallen ceiling tiles with dangling cables and rubble in the hospital;
// carts, sample crates, toppled stools and spilled specimen jars in the lab.
// Only on free floor a cell away from exits and from the template's furniture.
// ======================================================================
export function dressRoom(ctx) {
  const { deco, rng, room: r } = ctx;
  if (!ctx.used) ctx.used = new Set();
  const mark = deco.mark(), sn = snap(ctx);
  dressItems(ctx);
  if (!roomOK(ctx)) { deco.rollback(mark); restore(ctx, sn); }
  void rng; void r;
}
function dressItems(ctx) {
  const { deco, rng, room: r } = ctx;
  const hosp = isHosp(ctx);
  const n = Math.floor(r.area / 60) + (hosp ? 1 : 0);
  let placed = 0;
  for (let k = 0; k < n * 8 && placed < n; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    if (!ok(ctx, x, z, 1, 1, 1, 1) || !deco.cellFree(x, z)) continue;
    const roll = rng.next(), y = r.floor;
    if (hosp) {
      if (roll < 0.3) {
        const ax = rng.chance(0.5);
        if (!ok(ctx, x + (ax ? 1 : 0), z + (ax ? 0 : 1), 1, 1, 1, 1)) continue;
        gurney(ctx, x + (ax ? 1 : 0.5), z + (ax ? 0.5 : 1), y, ax);
        use(ctx, x, z, ax ? 2 : 1, ax ? 1 : 2);
        placed++; continue;
      }
      if (roll < 0.5) wheelchair(ctx, x + 0.5, z + 0.5, y, rng.int(0, 3));
      else if (roll < 0.8) fallenCeiling(ctx, x, z, y);
      else rubble(ctx, x, z, y);
    } else {
      if (roll < 0.35) trolley(ctx, x + 0.5, z + 0.5, y, rng.chance(0.5));
      else if (roll < 0.6) deco.crateStack(x + 0.5, z + 0.5, y, { count: rng.int(1, 2) });
      else if (roll < 0.8) {
        // a spilled specimen jar in a puddle of its fluid
        pit(ctx, x, z, 1, 1, 'poison', 0.2);
        deco.box(x + 0.3, y - 0.2, z + 0.4, x + 0.7, y - 0.02, z + 0.62, TS.GLASS, { uv: 'fit', emissive: 0.3 });
      } else {
        const cx = x + 0.5, cz = z + 0.5;
        deco.box(cx - 0.2, y, cz - 0.2, cx + 0.2, y + 0.05, cz + 0.2, TS.METAL);
        deco.box(cx - 0.22, y + 0.05, cz - 0.18, cx + 0.22, y + 0.11, cz + 0.18, TS.CARPET);
        deco.box(cx - 0.03, y + 0.11, cz - 0.03, cx + 0.03, y + 0.6, cz + 0.03, TS.METAL);
      }
    }
    use(ctx, x, z, 1, 1);
    placed++;
  }
}
// wheeled stretcher, centred at (cx, cz), long along x (alongX) or z
function gurney(ctx, cx, cz, y, alongX) {
  const { deco } = ctx;
  const a = alongX ? 0.95 : 0.32, b = alongX ? 0.32 : 0.95;
  deco.box(cx - a, y + 0.62, cz - b, cx + a, y + 0.7, cz + b, TS.METAL);
  deco.box(cx - a + 0.04, y + 0.7, cz - b + 0.04, cx + a - 0.04, y + 0.82, cz + b - 0.04, TS.CARPET);
  for (const [px, pz] of [[cx - a + 0.08, cz - b + 0.08], [cx + a - 0.12, cz - b + 0.08], [cx - a + 0.08, cz + b - 0.12], [cx + a - 0.12, cz + b - 0.12]]) {
    deco.box(px, y + 0.08, pz, px + 0.04, y + 0.62, pz + 0.04, TS.METAL, { faces: FACE.SIDES });
    deco.box(px - 0.03, y, pz - 0.03, px + 0.07, y + 0.08, pz + 0.07, TS.METAL, { lightMul: 0.4 });
  }
  deco.collider(cx - a, y, cz - b, cx + a, y + 0.82, cz + b);
}
// wheelchair facing dir
function wheelchair(ctx, cx, cz, y, dir) {
  const { deco } = ctx;
  const ax = dir < 2;   // wheels on the sides across the facing axis
  const s = ax ? [0, 0.26] : [0.26, 0];
  deco.box(cx - 0.22, y + 0.45, cz - 0.22, cx + 0.22, y + 0.52, cz + 0.22, TS.CARPET);
  const bx = -DIR_X[dir] * 0.22, bz = -DIR_Z[dir] * 0.22;
  if (ax) deco.box(cx + bx - 0.03, y + 0.52, cz - 0.22, cx + bx + 0.03, y + 0.98, cz + 0.22, TS.CARPET);
  else deco.box(cx - 0.22, y + 0.52, cz + bz - 0.03, cx + 0.22, y + 0.98, cz + bz + 0.03, TS.CARPET);
  for (const sg of [-1, 1]) {
    const wx = cx + s[1] * sg * (ax ? 0 : 1) + (ax ? 0 : 0), wz = cz + s[1] * sg * (ax ? 1 : 0);
    if (ax) deco.box(cx - 0.3, y, wz + sg * 0.02 - 0.025, cx + 0.3, y + 0.6, wz + sg * 0.02 + 0.025, TS.METAL, { lightMul: 0.6 });
    else deco.box(wx + sg * 0.02 - 0.025, y, cz - 0.3, wx + sg * 0.02 + 0.025, y + 0.6, cz + 0.3, TS.METAL, { lightMul: 0.6 });
  }
  deco.box(cx + DIR_X[dir] * 0.3 - 0.05, y, cz + DIR_Z[dir] * 0.3 - 0.05, cx + DIR_X[dir] * 0.3 + 0.05, y + 0.45, cz + DIR_Z[dir] * 0.3 + 0.05, TS.METAL, { faces: FACE.SIDES });
  deco.collider(cx - 0.3, y, cz - 0.3, cx + 0.3, y + 0.98, cz + 0.3, { obstacle: false });
}
// ceiling tiles lying on the floor, cables dangling from the hole above
function fallenCeiling(ctx, x, z, y) {
  const { g, deco, rng } = ctx;
  const ceil = g.ceil[g.idx(x, z)];
  for (let k = 0; k < 3; k++) {
    const px = x + rng.float(0.05, 0.45), pz = z + rng.float(0.05, 0.45), yy = y + 0.01 + k * 0.03;
    deco.box(px, yy, pz, px + 0.5, yy + 0.03, pz + 0.5, { top: TS.CEIL, side: TS.CEIL, bottom: TS.CEIL });
  }
  if (ceil - y < 8) {
    deco.box(x + 0.15, ceil - 0.08, z + 0.15, x + 0.85, ceil - 0.02, z + 0.85, TS.BEAM);
    for (let k = 0; k < 3; k++) { const cx = x + rng.float(0.25, 0.75), cz = z + rng.float(0.25, 0.75); deco.box(cx - 0.015, ceil - rng.float(0.5, 1.4), cz - 0.015, cx + 0.015, ceil - 0.05, cz + 0.015, TS.PIPE, { faces: FACE.SIDES | FACE.BOTTOM }); }
  }
}
function rubble(ctx, x, z, y) {
  const { deco, rng } = ctx;
  for (let k = 0; k < 4; k++) {
    const px = x + rng.float(0.1, 0.7), pz = z + rng.float(0.1, 0.7), w = rng.float(0.12, 0.3);
    deco.box(px, y, pz, px + w, y + rng.float(0.06, 0.22), pz + w * rng.float(0.6, 1.4), TS.SIDE);
  }
}

void vitalsMonitor; void trolley; void seatRow; void hangLight; void lightStrip; void railAround; void retexFloor; void GREEN; void RED;
export { LX };
