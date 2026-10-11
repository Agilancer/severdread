// Props of the prison archetype (gen_prison.js), built from textured boxes
// in prop frames (mansion_kit.js pf / Frame: b = 0 the back against a wall,
// +b the front, a along the wall), so each works against any wall.
//
// Texture roles (data/texroles.js prison_complex): METAL steel (bunks,
// toilets, tables, lockers, racks), RAIL bars and fence posts, PANEL a barred
// cell door tile (the painted tiers), GRATE chain-link mesh, MACHINE machine
// fronts (washers, consoles, X-ray), SCREEN monitors, GLASS barred windows,
// GLASS_PLAIN booth / partition glazing, FABRIC linen, mattresses, blankets and
// curtains, CRATE / CRATE2 ammo crates and boxes, PIPE
// pipes, ACCENT hazard stripes, WOOD desks and benches, LIGHT lamp glass.
import { TS, FACE, Frame, lbox, lcol, llight, ltex, pf } from './mansion_kit.js';
import { cylV, cylH } from './foundry_props.js';
import { sub } from './mansion_props.js';

export { pf, sub };
const B = lbox;
const SOLID = { solid: true };
const ST = FACE.SIDES | FACE.TOP;
export const FLUO = [0.85, 0.95, 1], SODIUM = [1, 0.78, 0.45], ALARM = [1, 0.15, 0.1];

// ---------------------------------------------------------------- cells
// two-tier steel bunk, its long side against the wall (p.la ~2, p.lb ~0.9)
export function bunk(deco, p, y) {
  const w = p.la, d = p.lb;
  for (const a of [0.03, w - 0.09]) for (const b of [0.03, d - 0.09]) B(deco, p, a, y, b, a + 0.06, y + 1.75, b + 0.06, TS.METAL, { faces: FACE.SIDES });
  for (const h of [0.42, 1.45]) {
    B(deco, p, 0, y + h - 0.08, 0, w, y + h, d, TS.METAL);
    B(deco, p, 0.05, y + h, 0.05, w - 0.05, y + h + 0.14, d - 0.05, TS.FABRIC, { faces: ST });
    B(deco, p, w * 0.45, y + h + 0.14, 0.04, w - 0.08, y + h + 0.17, d - 0.04, TS.FABRIC, { faces: ST, lightMul: 0.55 });
    B(deco, p, 0.08, y + h + 0.14, 0.15, 0.42, y + h + 0.24, d - 0.15, TS.FABRIC, { faces: ST });
  }
  lcol(deco, p, 0, y, 0, w, y + 1.75, d);
}
// steel toilet + basin combination against a wall (p.la ~0.8)
export function toilet(deco, p, y) {
  const w = p.la;
  B(deco, p, 0, y, 0, w, y + 1.05, 0.28, TS.METAL, SOLID);
  B(deco, p, w * 0.15, y, 0.28, w * 0.85, y + 0.42, 0.75, TS.METAL, SOLID);
  B(deco, p, w * 0.2, y + 0.42, 0.33, w * 0.8, y + 0.45, 0.7, TS.METAL, { faces: FACE.TOP, lightMul: 0.5 });
  B(deco, p, w * 0.22, y + 0.85, 0.28, w * 0.78, y + 0.95, 0.5, TS.METAL);
}
// a steel shelf and a writing slab on the wall
export function cellShelf(deco, p, y) {
  const w = p.la;
  B(deco, p, 0, y + 0.72, 0, w, y + 0.77, 0.45, TS.METAL);
  B(deco, p, 0, y + 1.65, 0, w, y + 1.69, 0.3, TS.METAL);
  B(deco, p, w * 0.1, y + 1.69, 0.04, w * 0.3, y + 1.9, 0.24, TS.CRATE2, { uv: 'fit' });
  B(deco, p, w * 0.55, y + 0.77, 0.08, w * 0.85, y + 0.8, 0.35, TS.FABRIC, { faces: FACE.TOP });
}
// row of vertical bars between two world points on a cell-edge line (axis aligned)
export function barRun(deco, x0, z0, x1, z1, y0, y1, o = {}) {
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a = along ? Math.min(x0, x1) : Math.min(z0, z1), b = along ? Math.max(x0, x1) : Math.max(z0, z1);
  const L = along ? z0 : x0, t = o.t ?? 0.035, step = o.step ?? 0.18;
  const seg = (p0, p1, h0, h1, th, tex) => (along ? deco.box(p0, h0, L - th, p1, h1, L + th, tex, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM }) : deco.box(L - th, h0, p0, L + th, h1, p1, tex, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM }));
  for (let p = a + step / 2; p < b; p += step) seg(p - t, p + t, y0, y1, t, o.tex ?? TS.RAIL);
  for (const h of o.rails ?? [y0 + 0.05, y0 + (y1 - y0) * 0.45, y1 - 0.08]) seg(a, b, h - 0.04, h + 0.04, 0.05, o.tex ?? TS.RAIL);
  if (o.solid) { if (along) deco.collider(a, y0, L - 0.06, b, y1, L + 0.06, { shots: false, obstacle: false }); else deco.collider(L - 0.06, y0, a, L + 0.06, y1, b, { shots: false, obstacle: false }); }
}
// the barred front of a real cell: jambs, a header with the door track and
// the sliding door run open in front of the partition beside the opening.
// fr / a-line: the front plane at local a = aL; the opening b0..b1; the
// door parks on the side `park` (+1 toward b1, -1 toward b0); `out` = local
// direction (sign along a) from the cell toward the floor in front of it.
export function cellFront(deco, fr, aL, b0, b1, y, h, park, out) {
  const o = out * 0.06;
  const bx = (a0, a1, c0, c1, y0, y1, tex, opt) => lbox(deco, fr, Math.min(a0, a1), y0, c0, Math.max(a0, a1), y1, c1, tex, opt);
  bx(aL, aL + o * 2, b0 - 0.12, b0 + 0.06, y, y + h, TS.METAL);
  bx(aL, aL + o * 2, b1 - 0.06, b1 + 0.12, y, y + h, TS.METAL);
  bx(aL, aL + o * 2.5, b0 - 0.12, b1 + 0.12, y + h - 0.22, y + h, TS.METAL);
  // the door: a frame of bars parked over the partition
  const d0 = park > 0 ? b1 + 0.1 : b0 - 1.0, d1 = d0 + 0.9;
  const al = aL + o * 1.6;
  const p0 = [fr.px(al, d0), fr.pz(al, d0)], p1 = [fr.px(al, d1), fr.pz(al, d1)];
  barRun(deco, p0[0], p0[1], p1[0], p1[1], y + 0.02, y + h - 0.25, { step: 0.15 });
  // cell number plate
  bx(aL + o * 2, aL + o * 2.3, b0 + 0.3, b0 + 0.7, y + h - 0.6, y + h - 0.35, TS.TRIM, { uv: 'fit' });
}
// painted tier of cells on a high wall: barred door panels between
// pilasters, with a ledge and a rail in front (no collision: out of reach).
// p: frame against the wall (a along, b out of the wall), y0 the tier floor
export function fakeTier(deco, p, y0, h = 3.0, o = {}) {
  const L = p.la, step = o.step ?? 4;
  for (let s = o.phase ?? 0.5; s + 3 <= L + 0.01; s += step) {
    B(deco, p, s, y0, 0, s + 3, y0 + h - 0.3, 0.04, TS.PANEL, { uv: 'fit', faces: FACE.SIDES });
    B(deco, p, s + 0.25, y0 + h - 0.7, 0.04, s + 0.65, y0 + h - 0.45, 0.06, TS.TRIM, { uv: 'fit' });
  }
  for (let s = (o.phase ?? 0.5) - 1; s <= L; s += step) if (s + 1 > 0) B(deco, p, Math.max(0, s), y0, 0, Math.min(L, s + 1), y0 + h, 0.12, TS.PILLAR, { faces: FACE.SIDES });
  if (o.ledge !== false) {
    const dep = o.depth ?? 1.6;
    B(deco, p, 0, y0 - 0.25, 0, L, y0, dep, { side: TS.METAL, top: TS.FLOOR2, bottom: TS.METAL }, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
    for (let s = 0; s <= L; s += 1.5) B(deco, p, s, y0, dep - 0.08, s + 0.07, y0 + 1.0, dep - 0.01, TS.RAIL, { faces: FACE.SIDES });
    B(deco, p, 0, y0 + 0.93, dep - 0.09, L, y0 + 1.0, dep, TS.RAIL);
    B(deco, p, 0, y0 + 0.45, dep - 0.08, L, y0 + 0.5, dep - 0.02, TS.RAIL);
    // brackets under the ledge
    for (let s = 1; s < L; s += 3) B(deco, p, s, y0 - 0.9, 0, s + 0.1, y0 - 0.25, dep * 0.7, TS.METAL, { faces: FACE.SIDES });
  }
}

// ---------------------------------------------------------------- furniture
// steel table bolted to the floor with four round stools (x, z centre)
export function steelTable(deco, x, z, y, alongX = true) {
  const hw = alongX ? 0.9 : 0.45, hd = alongX ? 0.45 : 0.9;
  deco.box(x - hw, y + 0.72, z - hd, x + hw, y + 0.78, z + hd, TS.METAL);
  deco.box(x - 0.08, y, z - 0.08, x + 0.08, y + 0.72, z + 0.08, TS.METAL, { faces: FACE.SIDES });
  deco.collider(x - hw, y, z - hd, x + hw, y + 0.78, z + hd);
  const st = alongX ? [[-0.5, -0.8], [0.5, -0.8], [-0.5, 0.8], [0.5, 0.8]] : [[-0.8, -0.5], [-0.8, 0.5], [0.8, -0.5], [0.8, 0.5]];
  for (const [dx, dz] of st) {
    deco.box(x + dx - 0.18, y + 0.42, z + dz - 0.18, x + dx + 0.18, y + 0.47, z + dz + 0.18, TS.METAL);
    deco.box(x + dx - 0.04, y, z + dz - 0.04, x + dx + 0.04, y + 0.42, z + dz + 0.04, TS.METAL, { faces: FACE.SIDES });
  }
}
// picnic table with bench seats (yard)
export function picnicTable(deco, x, z, y, alongX = true) {
  const hw = alongX ? 1.0 : 0.4, hd = alongX ? 0.4 : 1.0;
  deco.box(x - hw, y + 0.72, z - hd, x + hw, y + 0.78, z + hd, TS.WOOD);
  for (const s of [-1, 1]) {
    const ox = alongX ? 0 : s * 0.75, oz = alongX ? s * 0.75 : 0;
    deco.box(x + ox - (alongX ? hw : 0.18), y + 0.42, z + oz - (alongX ? 0.18 : hw), x + ox + (alongX ? hw : 0.18), y + 0.47, z + oz + (alongX ? 0.18 : hw), TS.WOOD);
  }
  for (const s of [-1, 1]) deco.box(x + (alongX ? s * hw * 0.8 : 0) - 0.05, y, z + (alongX ? 0 : s * hd * 0.8) - 0.05, x + (alongX ? s * hw * 0.8 : 0) + 0.05, y + 0.72, z + (alongX ? 0 : s * hd * 0.8) + 0.05, TS.METAL, { faces: FACE.SIDES });
  deco.collider(x - hw - (alongX ? 0 : 0.95), y, z - hd - (alongX ? 0.95 : 0), x + hw + (alongX ? 0 : 0.95), y + 0.78, z + hd + (alongX ? 0.95 : 0));
}
// row of lockers against a wall
export function lockers(deco, p, y, h = 1.9) {
  const w = p.la, d = Math.min(p.lb, 0.5), n = Math.max(1, Math.round(w / 0.45));
  B(deco, p, 0, y, 0, w, y + h, d, TS.METAL, { solid: true, faces: FACE.SIDES | FACE.TOP });
  for (let k = 1; k < n; k++) B(deco, p, (w * k) / n - 0.015, y + 0.05, d, (w * k) / n + 0.015, y + h - 0.05, d + 0.02, TS.PIPE, { faces: FACE.SIDES });
  for (let k = 0; k < n; k++) for (const hy of [h - 0.35, h - 0.45]) B(deco, p, (w * k) / n + 0.08, y + hy, d, (w * (k + 1)) / n - 0.08, y + hy + 0.03, d + 0.015, TS.PIPE);
}
// filing cabinet
export function filingCabinet(deco, p, y) {
  const w = p.la, d = Math.min(p.lb, 0.6);
  B(deco, p, 0, y, 0, w, y + 1.3, d, TS.METAL, SOLID);
  for (let k = 0; k < 4; k++) B(deco, p, w * 0.35, y + 0.2 + k * 0.3, d, w * 0.65, y + 0.25 + k * 0.3, d + 0.03, TS.PIPE);
}
// gun rack on a wall: a backboard with rifles standing in it
export function gunRack(deco, p, y, rng) {
  const w = p.la;
  B(deco, p, 0, y + 0.1, 0, w, y + 2.0, 0.06, TS.WOOD, { faces: FACE.SIDES });
  B(deco, p, 0, y, 0, w, y + 0.25, 0.4, TS.WOOD, { solid: true });
  for (let a = 0.18; a < w - 0.1; a += 0.28) {
    if (rng.chance(0.15)) continue;
    B(deco, p, a - 0.03, y + 0.25, 0.12, a + 0.03, y + 1.65, 0.22, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
    B(deco, p, a - 0.05, y + 0.25, 0.1, a + 0.05, y + 0.65, 0.3, TS.WOOD, { faces: FACE.SIDES | FACE.TOP });
  }
  B(deco, p, 0, y + 1.5, 0.04, w, y + 1.56, 0.26, TS.METAL);
}
// stacked ammo / supply crates at world (x, z)
export function crates(deco, x, z, y, rng, n = 3) {
  for (let k = 0; k < n; k++) {
    const s = rng.float(0.55, 0.8), dx = rng.float(-0.3, 0.3), dz = rng.float(-0.3, 0.3), yy = y + (k >= 2 ? s * 0.95 : 0);
    deco.box(x + dx - s / 2, yy, z + dz - s / 2, x + dx + s / 2, yy + s * 0.7, z + dz + s / 2, k % 2 ? TS.CRATE : TS.CRATE2, { solid: k < 2 });
  }
}
// hospital bed with a curtain rail round it (p: head at the wall, la ~1.1, lb ~2.3)
export function hospitalBed(deco, p, y, o = {}) {
  const w = p.la, L = p.lb;
  B(deco, p, 0.1, y + 0.5, 0.05, w - 0.1, y + 0.62, L - 0.1, TS.METAL, SOLID);
  for (const a of [0.12, w - 0.18]) for (const b of [0.1, L - 0.2]) B(deco, p, a, y, b, a + 0.06, y + 0.5, b + 0.06, TS.METAL, { faces: FACE.SIDES });
  B(deco, p, 0.15, y + 0.62, 0.1, w - 0.15, y + 0.78, L - 0.15, TS.FABRIC, { faces: ST });
  B(deco, p, 0.2, y + 0.78, 0.15, w - 0.2, y + 0.9, 0.55, TS.FABRIC, { faces: ST });
  B(deco, p, 0.1, y + 0.5, 0.0, w - 0.1, y + 1.2, 0.08, TS.METAL);
  B(deco, p, 0.12, y + 0.78, L * 0.45, w - 0.12, y + 0.82, L - 0.18, TS.FABRIC, { faces: ST });
  if (o.curtain) {
    // a ceiling rail and a curtain drawn along one side
    const ry = y + 2.4;
    B(deco, p, -0.15, ry, 0, -0.12, ry + 0.04, L + 0.2, TS.METAL);
    B(deco, p, -0.15, ry, L + 0.17, w + 0.15, ry + 0.04, L + 0.2, TS.METAL);
    B(deco, p, -0.17, y + 0.25, 0.1, -0.1, ry, L * 0.7, TS.FABRIC, { faces: FACE.SIDES });
  }
}
// IV stand
export function ivStand(deco, x, z, y) {
  deco.box(x - 0.2, y, z - 0.02, x + 0.2, y + 0.04, z + 0.02, TS.METAL);
  deco.box(x - 0.02, y, z - 0.2, x + 0.02, y + 0.04, z + 0.2, TS.METAL);
  deco.box(x - 0.02, y, z - 0.02, x + 0.02, y + 1.9, z + 0.02, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.18, y + 1.85, z - 0.02, x + 0.18, y + 1.88, z + 0.02, TS.METAL);
  deco.box(x + 0.08, y + 1.5, z - 0.05, x + 0.16, y + 1.82, z + 0.05, TS.GLASS_PLAIN, { emissive: 0.2 });
}
// glass-fronted medicine cabinet
export function medCabinet(deco, p, y) {
  const w = p.la, d = Math.min(p.lb, 0.45);
  B(deco, p, 0, y, 0, w, y + 0.9, d, TS.METAL, SOLID);
  B(deco, p, 0, y + 0.9, 0, w, y + 2.1, d * 0.8, ltex(p, TS.METAL, TS.GLASS_PLAIN, 2), { solid: true, emissive: 0.1 });
  for (let a = 0.1; a < w - 0.15; a += 0.22) B(deco, p, a, y + 1.25, 0.06, a + 0.12, y + 1.45, 0.2, TS.LIGHT, { uv: 'fit', faces: ST, lightMul: 0.5 });
}
// operating table with a lamp over it (x, z centre)
export function operatingTable(deco, x, z, y, alongX, ceil) {
  const hw = alongX ? 1.0 : 0.4, hd = alongX ? 0.4 : 1.0;
  deco.box(x - 0.2, y, z - 0.2, x + 0.2, y + 0.85, z + 0.2, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - hw, y + 0.85, z - hd, x + hw, y + 0.95, z + hd, TS.METAL);
  deco.box(x - hw + 0.05, y + 0.95, z - hd + 0.05, x + hw - 0.05, y + 1.0, z + hd - 0.05, TS.FABRIC, { faces: ST });
  deco.collider(x - hw, y, z - hd, x + hw, y + 1.0, z + hd);
  deco.box(x - 0.03, ceil - 1.2, z - 0.03, x + 0.03, ceil, z + 0.03, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.45, ceil - 1.35, z - 0.45, x + 0.45, ceil - 1.2, z + 0.45, TS.METAL);
  deco.box(x - 0.38, ceil - 1.38, z - 0.38, x + 0.38, ceil - 1.35, z + 0.38, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM });
  deco.light(x, ceil - 1.6, z, FLUO, 5);
}
// front-loading washer / dryer (p: front toward +b, la ~1)
export function washer(deco, p, y, stacked = false) {
  const w = p.la, d = Math.min(p.lb, 0.85);
  const h = stacked ? 2.0 : 1.05;
  B(deco, p, 0, y, 0, w, y + h, d, ltex(p, TS.METAL, TS.MACHINE, 2), { solid: true, uv: 'fit' });
  for (const yy of stacked ? [y + 0.3, y + 1.3] : [y + 0.3]) {
    B(deco, p, w * 0.2, yy, d, w * 0.8, yy + 0.55, d + 0.05, TS.GLASS_PLAIN, { emissive: 0.15 });
    B(deco, p, w * 0.15, yy - 0.05, d, w * 0.85, yy, d + 0.06, TS.METAL);
  }
}
// laundry cart (x, z)
export function laundryCart(deco, x, z, y) {
  deco.box(x - 0.45, y + 0.15, z - 0.3, x + 0.45, y + 0.85, z + 0.3, TS.FABRIC, { solid: true });
  deco.box(x - 0.47, y + 0.85, z - 0.32, x + 0.47, y + 0.9, z + 0.32, TS.METAL);
  deco.box(x - 0.35, y + 0.85, z - 0.2, x + 0.3, y + 1.05, z + 0.2, TS.FABRIC, { faces: ST });
  for (const [dx, dz] of [[-0.38, -0.24], [0.38, -0.24], [-0.38, 0.24], [0.38, 0.24]]) deco.box(x + dx - 0.04, y, z + dz - 0.04, x + dx + 0.04, y + 0.15, z + dz + 0.04, TS.METAL);
}
// the boiler: a horizontal drum on cradles, a firebox, a flue and gauges
export function boiler(deco, fr, a0, b0, a1, b1, y, top) {
  const alongA = a1 - a0 >= b1 - b0;
  const [x0, z0, x1, z1] = fr.rect(a0, b0, a1, b1);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.min(alongA ? b1 - b0 : a1 - a0, 3) * 0.42;
  const alongX = (x1 - x0) >= (z1 - z0);
  const L0 = alongX ? x0 + 0.3 : z0 + 0.3, L1 = alongX ? x1 - 0.3 : z1 - 0.3;
  cylH(deco, L0, L1, y + 0.5 + r, alongX ? cz : cx, r, alongX, TS.METAL, { solid: true });
  for (const t of [L0 + 0.5, (L0 + L1) / 2, L1 - 0.5]) {
    if (alongX) deco.box(t - 0.15, y, cz - r * 0.8, t + 0.15, y + 0.5 + r * 0.3, cz + r * 0.8, TS.PILLAR);
    else deco.box(cx - r * 0.8, y, t - 0.15, cx + r * 0.8, y + 0.5 + r * 0.3, t + 0.15, TS.PILLAR);
  }
  // firebox door with the glow behind it
  const fx = alongX ? L0 - 0.05 : cx, fz = alongX ? cz : L0 - 0.05;
  deco.box(fx - 0.3, y + 0.3, fz - 0.3, fx + 0.3, y + 0.9, fz + 0.3, TS.LAVA, { emissive: 1, uv: 'fit' });
  deco.light(fx, y + 0.8, fz, [1, 0.45, 0.15], 7, { flicker: true });
  // the flue up to the ceiling
  const ux = alongX ? L1 - 0.6 : cx, uz = alongX ? cz : L1 - 0.6;
  cylV(deco, ux, uz, y + 0.5 + r * 1.6, top, 0.35, TS.PIPE);
  // gauges
  for (const t of [0.35, 0.65]) {
    const gx = alongX ? L0 + (L1 - L0) * t : cx + r + 0.05, gz = alongX ? cz + r + 0.05 : L0 + (L1 - L0) * t;
    deco.box(gx - 0.12, y + 0.5 + r * 1.2, gz - 0.12, gx + 0.12, y + 0.5 + r * 1.2 + 0.24, gz + 0.12, TS.SCREEN, { uv: 'fit', emissive: 0.4 });
  }
}
// chain-link fence between two world points on an axis line, razor wire on top
export function chainFence(deco, x0, z0, x1, z1, y, h = 3.2, o = {}) {
  const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const a = along ? Math.min(x0, x1) : Math.min(z0, z1), b = along ? Math.max(x0, x1) : Math.max(z0, z1);
  const L = along ? z0 : x0;
  const seg = (p0, p1, h0, h1, th, tex, opt) => (along ? deco.box(p0, h0, L - th, p1, h1, L + th, tex, opt) : deco.box(L - th, h0, p0, L + th, h1, p1, tex, opt));
  seg(a, b, y + 0.05, y + h - 0.1, 0.015, TS.GRATE, { faces: FACE.SIDES });
  const n = Math.max(1, Math.round((b - a) / 2.5));
  for (let k = 0; k <= n; k++) { const p = a + ((b - a) * k) / n; seg(p - 0.05, p + 0.05, y, y + h + 0.3, 0.05, TS.RAIL, { faces: FACE.SIDES | FACE.TOP }); }
  seg(a, b, y + h - 0.12, y + h - 0.04, 0.04, TS.RAIL);
  seg(a, b, y + 0.05, y + 0.12, 0.04, TS.RAIL);
  if (o.wire !== false) razorWire(deco, along, a, b, L, y + h + 0.05);
  if (along) deco.collider(a, y, L - 0.08, b, y + h, L + 0.08, { shots: false, obstacle: false });
  else deco.collider(L - 0.08, y, a, L + 0.08, y + h, b, { shots: false, obstacle: false });
}
// a coil of razor wire along an axis line at height y
export function razorWire(deco, alongX, a, b, L, y, r = 0.28) {
  // (three strands per 0.75 m read as a coil and keep the box count down)
  for (let p = a; p < b - 0.05; p += 0.75) {
    const p1 = Math.min(b, p + 0.7);
    for (const [dy, dl] of [[0, -r], [r * 1.4, 0], [0, r]]) {
      if (alongX) deco.box(p, y + dy, L + dl - 0.025, p1, y + dy + 0.05, L + dl + 0.025, TS.RAIL, { faces: FACE.SIDES | FACE.TOP });
      else deco.box(L + dl - 0.025, y + dy, p, L + dl + 0.025, y + dy + 0.05, p1, TS.RAIL, { faces: FACE.SIDES | FACE.TOP });
    }
  }
}
// floodlight mast at world (x, z): a lattice pole and a bank of lamps aimed
// toward world direction (dx, dz)
export function floodMast(deco, x, z, y, h, dx, dz) {
  deco.box(x - 0.12, y, z - 0.12, x + 0.12, y + h, z + 0.12, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.3, y, z - 0.3, x + 0.3, y + 0.3, z + 0.3, TS.PILLAR);
  deco.collider(x - 0.2, y, z - 0.2, x + 0.2, y + h, z + 0.2, { obstacle: true });
  const bx = x + dx * 0.25, bz = z + dz * 0.25, wx = dz !== 0 ? 0.8 : 0.15, wz = dx !== 0 ? 0.8 : 0.15;
  deco.box(bx - wx, y + h - 0.6, bz - wz, bx + wx, y + h, bz + wz, TS.METAL);
  deco.box(bx - wx * 0.9 + dx * 0.16, y + h - 0.52, bz - wz * 0.9 + dz * 0.16, bx + wx * 0.9 + dx * 0.16, y + h - 0.08, bz + wz * 0.9 + dz * 0.16, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.light(x + dx * 3, y + h - 2, z + dz * 3, SODIUM, 14);
}
// a guard cabin on a tower platform (fr local rect a0..a1 x b0..b1 at height y):
// corner posts, a waist wall, glazing, a flat roof and a searchlight
export function towerCabin(deco, fr, a0, b0, a1, b1, y, o = {}) {
  const h = o.h ?? 2.8;
  for (const [a, b] of [[a0, b0], [a1 - 0.15, b0], [a0, b1 - 0.15], [a1 - 0.15, b1 - 0.15]]) lbox(deco, fr, a, y, b, a + 0.15, y + h, b + 0.15, TS.METAL, { faces: FACE.SIDES });
  lbox(deco, fr, a0 - 0.3, y + h, b0 - 0.3, a1 + 0.3, y + h + 0.25, b1 + 0.3, TS.ROOF);
  lbox(deco, fr, a0 - 0.1, y + h + 0.25, b0 - 0.1, a1 + 0.1, y + h + 0.32, b1 + 0.1, TS.METAL, { faces: FACE.TOP | FACE.SIDES });
  const ys = y + 1.0;
  for (const side of o.glass ?? [0, 1, 2, 3]) {
    const r = side === 0 ? [a1 - 0.06, b0, a1, b1] : side === 1 ? [a0, b0, a0 + 0.06, b1] : side === 2 ? [a0, b1 - 0.06, a1, b1] : [a0, b0, a1, b0 + 0.06];
    lbox(deco, fr, r[0], ys + 0.1, r[1], r[2], y + h - 0.1, r[3], TS.GLASS_PLAIN, { emissive: 0.25, faces: FACE.SIDES });
  }
  // searchlight on the roof
  const sa = (a0 + a1) / 2, sb = (b0 + b1) / 2;
  lbox(deco, fr, sa - 0.3, y + h + 0.32, sb - 0.3, sa + 0.3, y + h + 0.8, sb + 0.3, TS.METAL);
  lbox(deco, fr, sa - 0.22, y + h + 0.4, sb + 0.3, sa + 0.22, y + h + 0.72, sb + 0.34, TS.LIGHT, { uv: 'fit', emissive: 1 });
  llight(deco, fr, sa, y + h - 0.5, sb, SODIUM, 9);
}
// the prison bus (along world x or z), parked
export function bus(deco, x, z, y, alongX) {
  const L = 7.2, W = 2.3, H = 2.6;
  const [x0, z0, x1, z1] = alongX ? [x - L / 2, z - W / 2, x + L / 2, z + W / 2] : [x - W / 2, z - L / 2, x + W / 2, z + L / 2];
  deco.box(x0, y + 0.45, z0, x1, y + H, z1, { side: TS.METAL, top: TS.ROOF, bottom: TS.METAL }, { solid: true });
  // window band (barred glass) along both sides, the paint stripe
  const band = (y0, y1, tex, em) => {
    if (alongX) { deco.box(x0 + 1.4, y0, z0 - 0.02, x1 - 0.4, y1, z0, tex, { emissive: em, faces: FACE.NZ }); deco.box(x0 + 1.4, y0, z1, x1 - 0.4, y1, z1 + 0.02, tex, { emissive: em, faces: FACE.PZ }); }
    else { deco.box(x0 - 0.02, y0, z0 + 1.4, x0, y1, z1 - 0.4, tex, { emissive: em, faces: FACE.NX }); deco.box(x1, y0, z0 + 1.4, x1 + 0.02, y1, z1 - 0.4, tex, { emissive: em, faces: FACE.PX }); }
  };
  band(y + 1.5, y + 2.25, TS.GLASS, 0.15);
  band(y + 1.0, y + 1.25, TS.ACCENT, 0);
  // wheels
  for (const t of [0.18, 0.8]) for (const s of [0, 1]) {
    const px = alongX ? x0 + L * t : (s ? x1 - 0.05 : x0 - 0.2), pz = alongX ? (s ? z1 - 0.05 : z0 - 0.2) : z0 + L * t;
    deco.box(px, y, pz, px + (alongX ? 0.9 : 0.25), y + 0.9, pz + (alongX ? 0.25 : 0.9), TS.METAL, { lightMul: 0.3 });
  }
  // windscreen at the +end
  if (alongX) deco.box(x1, y + 1.2, z0 + 0.15, x1 + 0.02, y + 2.3, z1 - 0.15, TS.GLASS_PLAIN, { emissive: 0.2, faces: FACE.PX });
  else deco.box(x0 + 0.15, y + 1.2, z1, x1 - 0.15, y + 2.3, z1 + 0.02, TS.GLASS_PLAIN, { emissive: 0.2, faces: FACE.PZ });
}
// CCTV camera on a bracket high on a wall (p against the wall)
export function camera(deco, p, y) {
  B(deco, p, 0.4, y, 0, 0.5, y + 0.1, 0.4, TS.METAL);
  B(deco, p, 0.25, y - 0.25, 0.3, 0.65, y, 0.75, TS.METAL);
  B(deco, p, 0.4, y - 0.18, 0.75, 0.5, y - 0.08, 0.77, TS.LIGHT, { emissive: 1, uv: 'fit' });
}
// a TV on a wall bracket
export function wallTV(deco, p, y) {
  B(deco, p, 0.45, y - 0.1, 0, 0.55, y + 0.1, 0.35, TS.METAL);
  B(deco, p, 0, y - 0.4, 0.3, 1.0, y + 0.25, 0.42, ltex(p, TS.METAL, TS.SCREEN, 2), { uv: 'fit', emissive: 0.5 });
}
// a basketball hoop on a post (p: post at the back, the board facing +b)
export function hoop(deco, p, y) {
  B(deco, p, 0.42, y, 0, 0.58, y + 3.4, 0.16, TS.METAL, SOLID);
  B(deco, p, 0.45, y + 3.0, 0.16, 0.55, y + 3.1, 0.75, TS.METAL);
  B(deco, p, 0, y + 2.9, 0.75, 1.0, y + 3.6, 0.8, TS.TRIM, { uv: 'fit' });
  B(deco, p, 0.3, y + 3.0, 0.8, 0.7, y + 3.04, 1.2, TS.ACCENT);
}
// weight bench with a barbell (x, z)
export function weightBench(deco, x, z, y, alongX) {
  const hw = alongX ? 0.7 : 0.18, hd = alongX ? 0.18 : 0.7;
  deco.box(x - hw, y + 0.38, z - hd, x + hw, y + 0.46, z + hd, TS.FABRIC, { solid: true });
  deco.box(x - 0.05, y, z - 0.05, x + 0.05, y + 0.38, z + 0.05, TS.METAL, { faces: FACE.SIDES });
  const bx = alongX ? x - hw + 0.2 : x, bz = alongX ? z : z - hd + 0.2;
  if (alongX) { deco.box(bx - 0.03, y + 0.9, z - 0.9, bx + 0.03, y + 0.96, z + 0.9, TS.METAL); for (const s of [-1, 1]) deco.box(bx - 0.2, y + 0.73, z + s * 0.75 - 0.06, bx + 0.2, y + 1.13, z + s * 0.75 + 0.06, TS.METAL); }
  else { deco.box(x - 0.9, y + 0.9, bz - 0.03, x + 0.9, y + 0.96, bz + 0.03, TS.METAL); for (const s of [-1, 1]) deco.box(x + s * 0.75 - 0.06, y + 0.73, bz - 0.2, x + s * 0.75 + 0.06, y + 1.13, bz + 0.2, TS.METAL); }
}
// hanging fluorescent / caged lamp from the ceiling at world (x, z)
export function pendant(deco, x, z, ceil, drop, o = {}) {
  const y = ceil - drop;
  deco.box(x - 0.02, y + 0.15, z - 0.02, x + 0.02, ceil, z + 0.02, TS.PIPE, { faces: FACE.SIDES });
  if (o.long) {
    const ax = o.alongX ? 0.7 : 0.12, az = o.alongX ? 0.12 : 0.7;
    deco.box(x - ax, y, z - az, x + ax, y + 0.15, z + az, TS.METAL);
    deco.box(x - ax * 0.9, y - 0.02, z - az * 0.9, x + ax * 0.9, y, z + az * 0.9, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
  } else {
    deco.box(x - 0.22, y, z - 0.22, x + 0.22, y + 0.18, z + 0.22, TS.METAL);
    deco.box(x - 0.16, y - 0.12, z - 0.16, x + 0.16, y, z + 0.16, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  deco.light(x, y - 0.4, z, o.color ?? FLUO, o.radius ?? 9, { flicker: !!o.flicker });
}
// walk-through metal detector arch (p: across the walkway, la ~1.4)
export function detector(deco, p, y) {
  const w = p.la;
  B(deco, p, 0, y, 0, 0.18, y + 2.3, 0.5, ltex(p, TS.METAL, TS.MACHINE, 2), { solid: true, uv: 'fit' });
  B(deco, p, w - 0.18, y, 0, w, y + 2.3, 0.5, ltex(p, TS.METAL, TS.MACHINE, 2), { solid: true, uv: 'fit' });
  B(deco, p, 0, y + 2.3, 0, w, y + 2.5, 0.5, TS.METAL);
  B(deco, p, w * 0.4, y + 2.32, 0.5, w * 0.6, y + 2.42, 0.52, TS.LIGHT, { emissive: 1, uv: 'fit' });
}
// a serving counter with steam trays (p against the wall, la long, lb ~1)
export function servingCounter(deco, p, y) {
  const w = p.la, d = p.lb;
  B(deco, p, 0, y, 0, w, y + 0.9, d, TS.METAL, SOLID);
  for (let a = 0.2; a + 0.55 < w - 0.1; a += 0.65) B(deco, p, a, y + 0.9, d * 0.25, a + 0.55, y + 0.93, d * 0.8, TS.PIPE, { faces: FACE.TOP });
  // the sneeze guard
  B(deco, p, 0, y + 1.35, d * 0.85, w, y + 1.38, d, TS.GLASS_PLAIN, { emissive: 0.15 });
  for (let a = 0; a <= w; a += w / Math.max(1, Math.round(w / 1.5))) B(deco, p, Math.min(w - 0.04, a), y + 0.9, d * 0.85, Math.min(w, a + 0.04), y + 1.38, d * 0.88, TS.METAL, { faces: FACE.SIDES });
  // trays stacked at one end
  B(deco, p, 0.1, y + 0.9, 0.1, 0.55, y + 1.2, 0.45, TS.METAL, { faces: ST });
}
// glass booth walls round a local rect (a door gap on side `door`)
export function boothGlass(deco, fr, a0, b0, a1, b1, y, h, door, doorAt) {
  const t = 0.06;
  const sides = { 0: [a1 - t, b0, a1, b1], 1: [a0, b0, a0 + t, b1], 2: [a0, b1 - t, a1, b1], 3: [a0, b0, a1, b0 + t] };
  for (const [ld, r] of Object.entries(sides)) {
    const s = +ld;
    const segs = [];
    if (s === door) {
      const along0 = s < 2 ? r[1] : r[0], along1 = s < 2 ? r[3] : r[2];
      const g0 = doorAt - 0.6, g1 = doorAt + 0.6;
      if (g0 > along0) segs.push([along0, g0]);
      if (g1 < along1) segs.push([g1, along1]);
    } else segs.push(s < 2 ? [r[1], r[3]] : [r[0], r[2]]);
    for (const [p0, p1] of segs) {
      const rr = s < 2 ? [r[0], p0, r[2], p1] : [p0, r[1], p1, r[3]];
      lbox(deco, fr, rr[0], y, rr[1], rr[2], y + 1.0, rr[3], TS.METAL, { solid: true });
      lbox(deco, fr, rr[0], y + 1.0, rr[1], rr[2], y + h, rr[3], TS.GLASS_PLAIN, { emissive: 0.2, solid: true });
      lbox(deco, fr, rr[0] - 0.02, y + h, rr[1] - 0.02, rr[2] + 0.02, y + h + 0.12, rr[3] + 0.02, TS.METAL);
    }
  }
  lbox(deco, fr, a0, y + h + 0.1, b0, a1, y + h + 0.25, b1, TS.METAL, { faces: FACE.TOP | FACE.BOTTOM | FACE.SIDES });
}
export { Frame };
