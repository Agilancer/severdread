// Props for the "starship" archetype (see gen_starship.js): bunks, mess
// tables, weapon racks, EVA suits, the reactor core, thrusters, a shuttle,
// containers, a freight lift, captain's chair, holo table, cryo pods,
// hydroponic racks, wreckage, fires and sparking cables. Built from textured
// boxes like the rest of deco.js.
//
// Texture roles used on purpose: METAL for steel frames, bunks, suits and
// machine sides, MACHINE for control fronts and turbines, SCREEN for displays,
// CRATE / CRATE2 for crates and containers / locker and cabinet fronts, CARPET
// for mattresses, cushions and seat padding, NEON for glowing energy (reactor
// plasma, thruster rings, force fields), GLASS for visors, canopies and pods,
// PIPE for pipes and cables, BEAM for girders, rails and lift guides, GRATE
// for trays and decks, FOLIAGE for plants, LAVA for burning fuel, ROCK for
// boulders, PAINT for floor markings, LIGHT for lamps.
import { TS } from './common.js';
import { FACE } from './deco.js';
import { DIR_X, DIR_Z, OPP } from '../grid.js';
import { cylV, cylH } from './foundry_props.js';

export const CYAN = [0.55, 0.9, 1], COOL = [0.82, 0.9, 1], AMBER = [1, 0.72, 0.35], ALARM = [1, 0.25, 0.18], FIREL = [1, 0.55, 0.22], GREENL = [0.5, 1, 0.55], SPARK = [1, 0.95, 0.7];
const FK = ['px', 'nx', 'pz', 'nz'];
export const faced = (dir, front, side, top = side) => ({ side, top, bottom: side, [FK[dir]]: front });

// box in "local" coordinates of an axis: along (a) / across (b) around (cx, cz)
// alongX: a runs along x. Returns world box.
function lb(deco, cx, cz, alongX, a0, a1, b0, b1, y0, y1, tex, o) {
  if (alongX) return deco.box(cx + Math.min(a0, a1), y0, cz + Math.min(b0, b1), cx + Math.max(a0, a1), y1, cz + Math.max(b0, b1), tex, o);
  return deco.box(cx + Math.min(b0, b1), y0, cz + Math.min(a0, a1), cx + Math.max(b0, b1), y1, cz + Math.max(a0, a1), tex, o);
}
function lc(deco, cx, cz, alongX, a0, a1, b0, b1, y0, y1, o) {
  if (alongX) return deco.collider(cx + Math.min(a0, a1), y0, cz + Math.min(b0, b1), cx + Math.max(a0, a1), y1, cz + Math.max(b0, b1), o);
  return deco.collider(cx + Math.min(b0, b1), y0, cz + Math.min(a0, a1), cx + Math.max(b0, b1), y1, cz + Math.max(a0, a1), o);
}
export { lb, lc };

// ---------------------------------------------------------------- crew decks
// Double bunk (two berths, ladder, drawer, reading lamps) with its long side
// against a wall. Footprint: the world rect; wallDir = direction of that wall.
export function bunk(ctx, x0, z0, x1, z1, y, wallDir, o = {}) {
  const { deco, rng } = ctx;
  const alongX = x1 - x0 >= z1 - z0;
  const cx = alongX ? x0 : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : z0;
  const L = alongX ? x1 - x0 : z1 - z0, D = alongX ? z1 - z0 : x1 - x0;
  // b > 0 toward +z (alongX) / +x; the open side is away from the wall
  const openSign = alongX ? (wallDir === 2 ? -1 : 1) : (wallDir === 0 ? -1 : 1);
  const B = (a0, a1, b0, b1, y0, y1, tex, opt) => lb(deco, cx, cz, alongX, a0, a1, b0 * openSign, b1 * openSign, y0, y1, tex, opt);
  const h = D / 2;   // b from -h (wall side) to +h (open side) after the sign flip
  const head = rng.chance(0.5);   // pillow end
  for (const a of [0.02, L - 0.08]) for (const b of [-h + 0.02, h - 0.08]) B(a, a + 0.06, b, b + 0.06, y, y + 2.02, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
  for (const by of [0.32, 1.32]) {
    B(0.03, L - 0.03, -h + 0.03, h - 0.03, y + by, y + by + 0.08, TS.METAL);
    B(0.07, L - 0.07, -h + 0.06, h - 0.06, y + by + 0.08, y + by + 0.24, TS.CARPET);
    const pa = head ? 0.1 : L - 0.55;
    B(pa, pa + 0.45, -h + 0.12, h - 0.12, y + by + 0.24, y + by + 0.33, TS.CARPET);
    // blanket over the foot half
    if (rng.chance(0.75)) { const fa = head ? L * 0.5 : 0.08; B(fa, fa + L * 0.42, -h + 0.05, h - 0.04, y + by + 0.24, y + by + 0.29, TS.CARPET); }
    // reading lamp at the head, on the wall side
    const la = head ? 0.12 : L - 0.32;
    B(la, la + 0.2, -h + 0.02, -h + 0.08, y + by + 0.55, y + by + 0.65, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  // top frame, upper safety rail, ladder at the foot end
  B(0.02, L - 0.02, -h + 0.02, h - 0.02, y + 1.98, y + 2.04, TS.METAL, { faces: FACE.TOP | FACE.SIDES });
  B(0.5, L - 0.6, h - 0.06, h - 0.02, y + 1.62, y + 1.7, TS.METAL);
  const fa = head ? L - 0.45 : 0.15;
  for (const a of [fa, fa + 0.3]) B(a, a + 0.04, h - 0.05, h + 0.02, y + 0.3, y + 1.75, TS.METAL, { faces: FACE.SIDES });
  for (let k = 0; k < 4; k++) B(fa, fa + 0.34, h - 0.04, h + 0.01, y + 0.62 + k * 0.3, y + 0.66 + k * 0.3, TS.METAL);
  // drawers under the lower berth
  B(0.12, L - 0.12, h - 0.12, h - 0.04, y + 0.03, y + 0.3, TS.CRATE2, { uv: 'fit' });
  if (o.light) deco.light(alongX ? cx + L / 2 : cx, y + 1.6, alongX ? cz : cz + L / 2, [1, 0.85, 0.65], 3.5);
  lc(deco, cx, cz, alongX, 0, L, -h, h, y, y + 2.04);
}
// bank of lockers against the wall of cell (x, z) on side d (dir to wall), n cells wide
export function lockers(ctx, x, z, d, y, n = 1, front = TS.CRATE2) {
  const { deco } = ctx;
  const alongX = d >= 2;
  for (let k = 0; k < n; k++) for (const half of [0, 0.5]) {
    const a = (alongX ? x : z) + k + half + 0.02, b = a + 0.46, dep = 0.5;
    if (d === 0) deco.box(x + 1 - dep, y, a, x + 1, y + 2.0, b, faced(1, front, TS.METAL), { uv: 'fit', solid: true });
    else if (d === 1) deco.box(x, y, a, x + dep, y + 2.0, b, faced(0, front, TS.METAL), { uv: 'fit', solid: true });
    else if (d === 2) deco.box(a, y, z + 1 - dep, b, y + 2.0, z + 1, faced(3, front, TS.METAL), { uv: 'fit', solid: true });
    else deco.box(a, y, z, b, y + 2.0, z + dep, faced(2, front, TS.METAL), { uv: 'fit', solid: true });
  }
}
// long mess table on pedestals with a bench seat along both long sides (world rect of the table)
export function messTable(ctx, x0, z0, x1, z1, y) {
  const { deco, rng } = ctx;
  const alongX = x1 - x0 >= z1 - z0;
  const cx = alongX ? x0 : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : z0;
  const L = alongX ? x1 - x0 : z1 - z0, D = (alongX ? z1 - z0 : x1 - x0) / 2;
  const B = (a0, a1, b0, b1, y0, y1, tex, o) => lb(deco, cx, cz, alongX, a0, a1, b0, b1, y0, y1, tex, o);
  B(0, L, -D, D, y + 0.72, y + 0.78, TS.METAL);
  for (const a of [0.35, L - 0.55]) { B(a, a + 0.2, -0.1, 0.1, y, y + 0.72, TS.METAL, { faces: FACE.SIDES }); B(a - 0.1, a + 0.3, -D + 0.1, D - 0.1, y, y + 0.05, TS.METAL); }
  for (const sg of [-1, 1]) {
    const b0 = sg * (D + 0.12), b1 = sg * (D + 0.5);
    B(0.1, L - 0.1, b0, b1, y + 0.4, y + 0.47, TS.CARPET);
    for (const a of [0.4, L - 0.6]) B(a, a + 0.12, (b0 + b1) / 2 - 0.05, (b0 + b1) / 2 + 0.05, y, y + 0.4, TS.METAL, { faces: FACE.SIDES });
    lc(deco, cx, cz, alongX, 0.1, L - 0.1, b0, b1, y, y + 0.47, { obstacle: false });
  }
  // trays and cups
  for (let a = 0.35; a < L - 0.4; a += rng.float(0.55, 0.9)) {
    if (!rng.chance(0.6)) continue;
    const sb = rng.chance(0.5) ? -1 : 1;
    B(a, a + 0.36, sb * 0.08, sb * 0.32, y + 0.78, y + 0.8, TS.METAL);
    if (rng.chance(0.5)) B(a + 0.25, a + 0.31, sb * 0.12, sb * 0.18, y + 0.8, y + 0.9, TS.GLASS, { emissive: 0.2 });
  }
  lc(deco, cx, cz, alongX, 0, L, -D, D, y, y + 0.78);
}
// weapon rack on the wall of cell (x, z) side d: backboard, rifles in clips, ammo boxes below
export function weaponRack(ctx, x, z, d, y) {
  const { deco, rng } = ctx;
  const alongX = d >= 2;
  const line = d === 0 ? x + 1 : d === 1 ? x : d === 2 ? z + 1 : z;
  const s = d === 0 || d === 2 ? -1 : 1;     // into the room
  const B = (p0, p1, q0, q1, y0, y1, tex, o) => {
    // p: depth from the wall, q: along the wall (0..1 in the cell)
    const l0 = line + s * p0, l1 = line + s * p1;
    const a = (alongX ? x : z);
    if (alongX) return deco.box(a + q0, y0, Math.min(l0, l1), a + q1, y1, Math.max(l0, l1), tex, o);
    return deco.box(Math.min(l0, l1), y0, a + q0, Math.max(l0, l1), y1, a + q1, tex, o);
  };
  B(0, 0.06, 0.04, 0.96, y + 0.5, y + 2.1, TS.METAL);
  B(0, 0.14, 0.04, 0.96, y + 2.05, y + 2.12, TS.TRIM);
  // rifles standing in the rack: stock, receiver, barrel
  for (let k = 0; k < 3; k++) {
    if (!rng.chance(0.85)) continue;
    const q = 0.18 + k * 0.3;
    B(0.08, 0.2, q - 0.05, q + 0.05, y + 0.55, y + 0.95, TS.METAL, { lightMul: 0.5 });
    B(0.07, 0.22, q - 0.04, q + 0.04, y + 0.95, y + 1.45, TS.METAL, { lightMul: 0.35 });
    B(0.1, 0.16, q - 0.02, q + 0.02, y + 1.45, y + 1.95, TS.METAL, { lightMul: 0.35 });
  }
  // shelf with ammo boxes
  B(0, 0.42, 0.04, 0.96, y + 0.42, y + 0.48, TS.METAL);
  for (let k = 0; k < 2; k++) if (rng.chance(0.75)) B(0.06, 0.38, 0.1 + k * 0.42, 0.44 + k * 0.42, y + 0.48, y + 0.72, TS.CRATE, { uv: 'fit' });
  B(0, 0.42, 0.04, 0.96, y, y + 0.42, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
  const p1 = line + s * 0.42;
  if (alongX) deco.collider(x + 0.04, y, Math.min(line, p1), x + 0.96, y + 2.12, Math.max(line, p1));
  else deco.collider(Math.min(line, p1), y, z + 0.04, Math.max(line, p1), y + 2.12, z + 0.96);
}
// EVA suit hanging in a wall niche of cell (x, z) side d
export function suitLocker(ctx, x, z, d, y) {
  const { deco } = ctx;
  const alongX = d >= 2;
  const line = d === 0 ? x + 1 : d === 1 ? x : d === 2 ? z + 1 : z;
  const s = d === 0 || d === 2 ? -1 : 1;
  const out = OPP[d];
  const B = (p0, p1, q0, q1, y0, y1, tex, o) => {
    const l0 = line + s * p0, l1 = line + s * p1, a = alongX ? x : z;
    if (alongX) return deco.box(a + q0, y0, Math.min(l0, l1), a + q1, y1, Math.max(l0, l1), tex, o);
    return deco.box(Math.min(l0, l1), y0, a + q0, Math.max(l0, l1), y1, a + q1, tex, o);
  };
  // niche frame
  B(0, 0.62, 0.02, 0.08, y, y + 2.3, TS.METAL); B(0, 0.62, 0.92, 0.98, y, y + 2.3, TS.METAL);
  B(0, 0.62, 0.02, 0.98, y + 2.22, y + 2.3, TS.METAL); B(0, 0.62, 0.02, 0.98, y, y + 0.08, TS.GRATE);
  B(0, 0.04, 0.08, 0.92, y + 0.08, y + 2.22, TS.PANEL);
  // the suit: boots, legs, torso with chest display, arms, helmet with visor, backpack
  for (const q of [0.32, 0.56]) { B(0.16, 0.44, q, q + 0.13, y + 0.08, y + 0.2, TS.METAL, { lightMul: 0.6 }); B(0.2, 0.4, q + 0.01, q + 0.12, y + 0.2, y + 0.95, TS.METAL); }
  B(0.16, 0.44, 0.3, 0.7, y + 0.95, y + 1.65, TS.METAL);
  B(0.4, 0.45, 0.42, 0.58, y + 1.3, y + 1.48, faced(out, TS.SCREEN, TS.METAL), { uv: 'fit' });
  for (const q of [0.2, 0.7]) B(0.2, 0.4, q, q + 0.1, y + 0.95, y + 1.6, TS.METAL);
  B(0.06, 0.18, 0.34, 0.66, y + 1.0, y + 1.6, TS.MACHINE, { uv: 'fit' });
  B(0.15, 0.45, 0.36, 0.64, y + 1.68, y + 2.02, faced(out, TS.GLASS, TS.METAL), { uv: 'fit', emissive: 0.35 });
  const p1 = line + s * 0.62;
  if (alongX) deco.collider(x + 0.02, y, Math.min(line, p1), x + 0.98, y + 2.3, Math.max(line, p1));
  else deco.collider(Math.min(line, p1), y, z + 0.02, Math.max(line, p1), y + 2.3, z + 0.98);
}
// cryo / stasis pod standing against the wall of cell (x, z) side d
export function cryoPod(ctx, x, z, d, y, o = {}) {
  const { deco } = ctx;
  const out = OPP[d];
  const cx = x + 0.5 + DIR_X[d] * 0.18, cz = z + 0.5 + DIR_Z[d] * 0.18;
  const ex = d < 2 ? 0.32 : 0.42, ez = d < 2 ? 0.42 : 0.32;
  deco.box(cx - ex, y, cz - ez, cx + ex, y + 0.35, cz + ez, faced(out, TS.MACHINE, TS.METAL), { uv: 'fit' });
  deco.box(cx - ex + 0.04, y + 0.35, cz - ez + 0.04, cx + ex - 0.04, y + 2.2, cz + ez - 0.04, faced(out, o.broken ? TS.METAL : TS.GLASS, TS.METAL), { uv: 'fit', emissive: o.broken ? 0 : 0.45 });
  deco.box(cx - ex, y + 2.2, cz - ez, cx + ex, y + 2.45, cz + ez, TS.METAL);
  const ceil = ctx.g.ceil[ctx.g.idx(x, z)];
  if (ceil > y + 2.8) deco.box(cx - 0.08, y + 2.45, cz - 0.08, cx + 0.08, ceil, cz + 0.08, TS.PIPE);
  if (!o.broken) deco.light(cx - DIR_X[d] * 0.6, y + 1.3, cz - DIR_Z[d] * 0.6, CYAN, 3, { pulse: true });
  deco.collider(cx - ex, y, cz - ez, cx + ex, y + 2.45, cz + ez);
}
// console chair (pedestal, padded seat and back) facing dir at world (x, z)
export function chair(ctx, x, z, y, dir, o = {}) {
  const { deco } = ctx;
  const w = o.big ? 0.36 : 0.26;
  deco.box(x - 0.16, y, z - 0.16, x + 0.16, y + 0.05, z + 0.16, TS.METAL);
  deco.box(x - 0.04, y + 0.05, z - 0.04, x + 0.04, y + 0.42, z + 0.04, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - w, y + 0.42, z - w, x + w, y + 0.52, z + w, TS.CARPET);
  const bx = -DIR_X[dir] * (w - 0.04), bz = -DIR_Z[dir] * (w - 0.04);
  const tx = DIR_X[dir] !== 0 ? 0.06 : w, tz = DIR_Z[dir] !== 0 ? 0.06 : w;
  deco.box(x + bx - tx, y + 0.52, z + bz - tz, x + bx + tx, y + (o.big ? 1.45 : 1.05), z + bz + tz, TS.CARPET);
  if (o.big) {
    // armrests with small control panels
    for (const sg of [-1, 1]) {
      const ax = DIR_X[dir] !== 0 ? 0 : sg * (w + 0.06), az = DIR_Z[dir] !== 0 ? 0 : sg * (w + 0.06);
      const hx = DIR_X[dir] !== 0 ? w : 0.06, hz = DIR_Z[dir] !== 0 ? w : 0.06;
      deco.box(x + ax - hx, y + 0.52, z + az - hz, x + ax + hx, y + 0.75, z + az + hz, { side: TS.METAL, top: TS.SCREEN, bottom: TS.METAL }, { uv: 'fit' });
    }
  }
  deco.collider(x - w, y, z - w, x + w, y + (o.big ? 1.45 : 1.05), z + w, { obstacle: false });
}
// round holo table with a star map display and a projected planet
export function holoTable(ctx, cx, cz, y, r = 0.9) {
  const { deco } = ctx;
  cylV(deco, cx, cz, y, y + 0.75, 0.32, TS.METAL);
  cylV(deco, cx, cz, y + 0.75, y + 0.95, r, TS.METAL);
  cylV(deco, cx, cz, y + 0.95, y + 0.98, r - 0.08, TS.SCREEN, { emissive: 0.9 });
  cylV(deco, cx, cz, y + 1.6, y + 1.95, 0.18, TS.NEON, { emissive: 1 });
  deco.box(cx - 0.6, y + 1.76, cz - 0.015, cx + 0.6, y + 1.79, cz + 0.015, TS.NEON, { emissive: 1 });
  deco.light(cx, y + 1.6, cz, CYAN, 4.5, { pulse: true });
  deco.collider(cx - r * 0.8, y, cz - r * 0.8, cx + r * 0.8, y + 0.98, cz + r * 0.8);
}

// ---------------------------------------------------------------- engineering
// Reactor core rising out of its well from yBot to yTop: housing, the glowing
// plasma column (NEON), a containment cage with rings, magnetic coils, the cap
// and conduits to the ceiling.
export function reactorCore(ctx, cx, cz, yBot, yTop, R, o = {}) {
  const { deco } = ctx;
  cylV(deco, cx, cz, yBot, yBot + 1.4, R + 0.45, TS.METAL, { s: 2 });
  cylV(deco, cx, cz, yBot + 1.4, yBot + 1.65, R + 0.55, TS.TRIM);
  const c0 = yBot + 1.65, c1 = yTop - 1.2;
  cylV(deco, cx, cz, c0, c1, R * 0.62, TS.NEON, { emissive: 1, s: 1 });
  // cage posts and rings
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
    const px = cx + ax * R, pz = cz + az * R;
    deco.box(px - 0.07, c0, pz - 0.07, px + 0.07, c1, pz + 0.07, TS.METAL, { faces: FACE.SIDES });
  }
  for (let y = c0 + 1.2; y < c1 - 0.4; y += 2.2) {
    cylV(deco, cx, cz, y, y + 0.22, R + 0.08, TS.METAL);
    cylV(deco, cx, cz, y + 0.22, y + 0.24, R * 0.62 + 0.04, TS.TRIM);
  }
  // magnetic coils: chunky machine bands
  for (const f of o.coils ?? [0.32, 0.68]) {
    const y = c0 + (c1 - c0) * f;
    cylV(deco, cx, cz, y, y + 0.7, R + 0.25, TS.MACHINE, { s: 1 });
  }
  // cap and conduits up to the ceiling
  cylV(deco, cx, cz, c1, c1 + 0.9, R + 0.35, TS.METAL, { s: 2 });
  cylV(deco, cx, cz, c1 + 0.9, c1 + 1.2, R * 0.5, TS.TRIM);
  if (o.ceil && o.ceil > c1 + 1.2) {
    for (const [ax, az] of [[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]]) {
      const px = cx + ax * R, pz = cz + az * R;
      deco.box(px - 0.13, c1 + 0.9, pz - 0.13, px + 0.13, o.ceil, pz + 0.13, TS.PIPE);
    }
  }
  for (const f of [0.2, 0.55, 0.9]) deco.light(cx, c0 + (c1 - c0) * f, cz, o.color ?? CYAN, o.lightR ?? 10, { pulse: true });
  deco.collider(cx - R - 0.2, yBot, cz - R - 0.2, cx + R + 0.2, yTop, cz + R + 0.2);
}
// thruster housing coming out of the aft wall: a big horizontal drum from the
// wall plane `line` (world coordinate) inward by `len`, centred at `c` across,
// axis height cy. dirIn = world direction into the room.
export function thruster(ctx, line, c, cy, R, len, dirIn) {
  const { deco } = ctx;
  const alongX = dirIn < 2;
  const sgn = dirIn === 0 || dirIn === 2 ? 1 : -1;
  const a0 = Math.min(line, line + sgn * len), a1 = Math.max(line, line + sgn * len);
  cylH(deco, a0, a1, cy, c, R, alongX, TS.METAL, { s: 2 });
  // bands and the glowing intake ring at the inner end
  for (let t = 0.6; t < len - 0.3; t += 1.1) {
    const p = line + sgn * t;
    cylH(deco, Math.min(p, p + sgn * 0.18), Math.max(p, p + sgn * 0.18), cy, c, R + 0.08, alongX, TS.TRIM);
  }
  const e = line + sgn * len;
  cylH(deco, Math.min(e, e + sgn * 0.12), Math.max(e, e + sgn * 0.12), cy, c, R * 0.82, alongX, TS.NEON, { s: 1 });
  cylH(deco, Math.min(e, e + sgn * 0.16), Math.max(e, e + sgn * 0.16), cy, c, R * 0.5, alongX, TS.MACHINE, { s: 1 });
  deco.light(alongX ? e + sgn * 0.8 : c, cy, alongX ? c : e + sgn * 0.8, CYAN, 6, { pulse: true });
  // cradle legs down to the floor
  const y0 = cy - R;
  for (const t of [0.4, len - 0.6]) {
    const p = line + sgn * t;
    if (alongX) deco.box(p - 0.15, y0 - 2, c - R * 0.7, p + 0.15, y0 + 0.3, c + R * 0.7, TS.BEAM);
    else deco.box(c - R * 0.7, y0 - 2, p - 0.15, c + R * 0.7, y0 + 0.3, p + 0.15, TS.BEAM);
  }
  if (alongX) deco.collider(a0, cy - R - 3, c - R, a1, cy + R, c + R);
  else deco.collider(c - R, cy - R - 3, a0, c + R, cy + R, a1);
}
// coolant / fuel tank standing on the floor
export function tankV(ctx, cx, cz, y, r, h, o = {}) {
  const { deco } = ctx;
  cylV(deco, cx, cz, y, y + 0.3, r + 0.1, TS.METAL);
  cylV(deco, cx, cz, y + 0.3, y + h, r, o.tex ?? TS.METAL, { s: 2 });
  for (let by = y + 1.1; by < y + h - 0.3; by += 1.2) cylV(deco, cx, cz, by, by + 0.1, r + 0.05, TS.TRIM);
  cylV(deco, cx, cz, y + h, y + h + 0.25, r * 0.6, TS.METAL);
  if (o.gauge) deco.box(cx - 0.15, y + 1.3, cz - r - 0.04, cx + 0.15, y + 1.6, cz - r, TS.SCREEN, { uv: 'fit', emissive: 0.8 });
  deco.collider(cx - r, y, cz - r, cx + r, y + h, cz + r);
}

// ---------------------------------------------------------------- cargo
// a stack of shipping containers along an axis (CRATE2 corrugated boxes)
export function containerStack(ctx, x, z, y, alongX, levels, len = 3) {
  const { deco, rng } = ctx;
  const W = 1.25, H = 1.3;
  for (let k = 0; k < levels; k++) {
    const off = k ? rng.float(-0.12, 0.12) : 0, l = k ? len - rng.pick([0, 0, 0.4]) : len;
    if (alongX) deco.box(x + off, y + k * H, z, x + off + l, y + (k + 1) * H, z + W, TS.CRATE2, { s: 1.3 });
    else deco.box(x, y + k * H, z + off, x + W, y + (k + 1) * H, z + off + l, TS.CRATE2, { s: 1.3 });
  }
  if (alongX) deco.collider(x - 0.12, y, z, x + len + 0.12, y + levels * H, z + W);
  else deco.collider(x, y, z - 0.12, x + W, y + levels * H, z + len + 0.12);
}
// freight lift: corner guide rails to the ceiling, crosshead, cables, motor,
// a platform frame (the platform cells themselves are raised by the caller)
export function liftFrame(ctx, x0, z0, x1, z1, yFloor, yDeck, yTop) {
  const { deco } = ctx;
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    deco.box(px - 0.14, yFloor, pz - 0.14, px + 0.14, yTop, pz + 0.14, TS.BEAM, { faces: FACE.SIDES });
    deco.collider(px - 0.14, yFloor, pz - 0.14, px + 0.14, yTop, pz + 0.14, { obstacle: false });
  }
  deco.box(x0 - 0.16, yTop - 0.5, z0 - 0.16, x1 + 0.16, yTop - 0.2, z0 + 0.16, TS.BEAM);
  deco.box(x0 - 0.16, yTop - 0.5, z1 - 0.16, x1 + 0.16, yTop - 0.2, z1 + 0.16, TS.BEAM);
  deco.box(x0 - 0.16, yTop - 0.5, z0, x0 + 0.16, yTop - 0.2, z1, TS.BEAM);
  deco.box(x1 - 0.16, yTop - 0.5, z0, x1 + 0.16, yTop - 0.2, z1, TS.BEAM);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  deco.box(mx - 0.5, yTop - 0.95, mz - 0.4, mx + 0.5, yTop - 0.5, mz + 0.4, faced(2, TS.MACHINE, TS.METAL), { uv: 'fit' });
  for (const [px, pz] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x0 + 0.3, z1 - 0.3], [x1 - 0.3, z1 - 0.3]]) deco.box(px - 0.03, yDeck + 1.1, pz - 0.03, px + 0.03, yTop - 0.5, pz + 0.03, TS.METAL, { faces: FACE.SIDES });
  // platform edge: hazard paint, a heavy frame under the deck
  deco.box(x0, yDeck + 0.004, z0, x1, yDeck + 0.018, z0 + 0.16, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
  deco.box(x0, yDeck + 0.004, z1 - 0.16, x1, yDeck + 0.018, z1, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
  deco.box(x0, yDeck + 0.004, z0, x0 + 0.16, yDeck + 0.018, z1, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
  deco.box(x1 - 0.16, yDeck + 0.004, z0, x1, yDeck + 0.018, z1, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
  deco.box(x0 + 0.05, yDeck - 0.45, z0 + 0.05, x1 - 0.05, yDeck - 0.05, z1 - 0.05, TS.BEAM, { faces: FACE.SIDES | FACE.BOTTOM });
  deco.light(mx, yDeck + 2.2, mz, AMBER, 4, { pulse: true });
}
// shuttle parked on its struts, nose along +a (alongX: a = x)
export function shuttle(ctx, cx, cz, y, alongX, nose = 1) {
  const { deco } = ctx;
  const B = (a0, a1, b0, b1, y0, y1, tex, o) => lb(deco, cx, cz, alongX, a0 * nose, a1 * nose, b0, b1, y0, y1, tex, o);
  const yb = y + 0.7;
  B(-3.2, 1.8, -1.15, 1.15, yb, yb + 1.9, TS.METAL, { s: 2 });                      // fuselage
  B(-3.0, 1.6, -1.2, 1.2, yb + 0.85, yb + 1.0, TS.TRIM);                              // stripe
  B(1.8, 2.8, -0.95, 0.95, yb + 0.15, yb + 1.65, TS.METAL);                           // nose
  B(2.8, 3.4, -0.6, 0.6, yb + 0.35, yb + 1.3, TS.METAL);
  B(1.3, 2.75, -0.75, 0.75, yb + 1.65, yb + 2.15, faced(alongX ? (nose > 0 ? 0 : 1) : (nose > 0 ? 2 : 3), TS.GLASS, TS.GLASS, TS.GLASS), { uv: 'fit', emissive: 0.35 });
  B(-2.4, 0.6, -3.3, -1.15, yb + 0.55, yb + 0.72, TS.METAL); B(-2.4, 0.6, 1.15, 3.3, yb + 0.55, yb + 0.72, TS.METAL);   // wings
  B(-2.6, -1.4, -3.4, -3.2, yb + 0.4, yb + 1.1, TS.TRIM); B(-2.6, -1.4, 3.2, 3.4, yb + 0.4, yb + 1.1, TS.TRIM);
  B(-3.3, -2.1, -0.08, 0.08, yb + 1.9, yb + 3.0, TS.METAL);                          // tail fin
  // engine pods with glowing nozzles
  for (const sg of [-1, 1]) {
    const c = sg * 0.75;
    if (alongX) { cylH(deco, cx + Math.min(-3.9 * nose, -2.8 * nose), cx + Math.max(-3.9 * nose, -2.8 * nose), yb + 1.0, cz + c, 0.48, true, TS.METAL); deco.box(cx + (nose > 0 ? -3.96 : 3.9), yb + 0.7, cz + c - 0.3, cx + (nose > 0 ? -3.9 : 3.96), yb + 1.3, cz + c + 0.3, TS.NEON, { emissive: 1 }); }
    else { cylH(deco, cz + Math.min(-3.9 * nose, -2.8 * nose), cz + Math.max(-3.9 * nose, -2.8 * nose), yb + 1.0, cx + c, 0.48, false, TS.METAL); deco.box(cx + c - 0.3, yb + 0.7, cz + (nose > 0 ? -3.96 : 3.9), cx + c + 0.3, yb + 1.3, cz + (nose > 0 ? -3.9 : 3.96), TS.NEON, { emissive: 1 }); }
  }
  // landing struts and feet
  for (const [a, b] of [[1.9, 0], [-2.4, -0.8], [-2.4, 0.8]]) { B(a - 0.06, a + 0.06, b - 0.06, b + 0.06, y, yb, TS.METAL, { faces: FACE.SIDES }); B(a - 0.2, a + 0.2, b - 0.2, b + 0.2, y, y + 0.06, TS.METAL); }
  // side hatch and its ramp down to the deck
  B(-1.4, -0.4, 1.15, 1.18, yb + 0.05, yb + 1.6, TS.PANEL, { uv: 'fit' });
  deco.bar(alongX ? [cx - 0.9 * nose, yb + 0.05, cz + 1.25] : [cx + 1.25, yb + 0.05, cz - 0.9 * nose], alongX ? [cx - 0.9 * nose, y + 0.04, cz + 2.4] : [cx + 2.4, y + 0.04, cz - 0.9 * nose], 0.9, 0.08, TS.GRATE);
  deco.light(alongX ? cx + 1.0 * nose : cx, yb + 1.9, alongX ? cz : cz + 1.0 * nose, [0.9, 0.95, 1], 3);
  lc(deco, cx, cz, alongX, Math.min(-3.9 * nose, 3.4 * nose), Math.max(-3.9 * nose, 3.4 * nose), -1.2, 1.2, y, yb + 2.15);
  lc(deco, cx, cz, alongX, Math.min(-2.4 * nose, 0.6 * nose), Math.max(-2.4 * nose, 0.6 * nose), -3.4, 3.4, yb + 0.4, yb + 0.75, { obstacle: false });
}

// ---------------------------------------------------------------- plants
// hydroponic rack: posts, trays (GRATE) with plants, grow lights under each shelf
export function plantRack(ctx, x0, z0, x1, z1, y, levels = 3) {
  const { deco, rng } = ctx;
  const h = 0.62;
  for (const [px, pz] of [[x0, z0], [x1 - 0.05, z0], [x0, z1 - 0.05], [x1 - 0.05, z1 - 0.05]]) deco.box(px, y, pz, px + 0.05, y + 0.2 + levels * h + 0.1, pz + 0.05, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
  for (let k = 0; k < levels; k++) {
    const ty = y + 0.2 + k * h;
    deco.box(x0, ty, z0, x1, ty + 0.08, z1, TS.GRATE);
    const alongX = x1 - x0 >= z1 - z0, L = alongX ? x1 - x0 : z1 - z0;
    for (let u = 0.08; u < L - 0.15; u += rng.float(0.28, 0.42)) {
      const w = rng.float(0.2, 0.3), ph = rng.float(0.18, h - 0.2);
      if (alongX) deco.box(x0 + u, ty + 0.08, z0 + 0.06, x0 + u + w, ty + 0.08 + ph, z1 - 0.06, TS.FOLIAGE);
      else deco.box(x0 + 0.06, ty + 0.08, z0 + u, x1 - 0.06, ty + 0.08 + ph, z0 + u + w, TS.FOLIAGE);
    }
    deco.box(x0 + 0.05, ty + h - 0.04, z0 + 0.05, x1 - 0.05, ty + h, z1 - 0.05, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM });
  }
  deco.light((x0 + x1) / 2, y + 1.2, (z0 + z1) / 2, [0.85, 0.6, 1], 3.5);
  deco.collider(x0, y, z0, x1, y + 0.3 + levels * h, z1);
}

// ---------------------------------------------------------------- damage
// torn cable bundle hanging from the ceiling with a sparking end
export function sparkCable(ctx, x, z, ceilY, len, o = {}) {
  const { deco, rng } = ctx;
  const n = rng.int(2, 3);
  for (let k = 0; k < n; k++) {
    const dx = rng.float(-0.35, 0.35), dz = rng.float(-0.35, 0.35);
    const bx = x + rng.float(-0.12, 0.12), bz = z + rng.float(-0.12, 0.12);
    deco.bar([bx, ceilY, bz], [x + dx, ceilY - len * rng.float(0.75, 1), z + dz], 0.05, 0.05, TS.PIPE);
  }
  const ex = x + rng.float(-0.2, 0.2), ez = z + rng.float(-0.2, 0.2), ey = ceilY - len;
  deco.box(ex - 0.06, ey - 0.06, ez - 0.06, ex + 0.06, ey + 0.06, ez + 0.06, TS.LIGHT, { uv: 'fit', emissive: 1 });
  if (o.light !== false) deco.light(ex, ey, ez, SPARK, 3, { flicker: true });
}
// burning debris / a fuel fire: glowing embers (LAVA) under flickering light
export function fire(ctx, cx, cz, y, s = 1, o = {}) {
  const { deco, rng } = ctx;
  for (let k = 0; k < 3; k++) {
    const r = s * (0.45 - k * 0.12), ox = rng.float(-0.15, 0.15) * s, oz = rng.float(-0.15, 0.15) * s;
    deco.box(cx + ox - r, y + k * 0.18 * s, cz + oz - r, cx + ox + r, y + (k + 1) * 0.22 * s, cz + oz + r, TS.LAVA, { emissive: 1 });
  }
  if (o.debris !== false) for (let k = 0; k < 2; k++) {
    const a = rng.float(0, Math.PI * 2), d = 0.5 * s;
    deco.bar([cx + Math.cos(a) * d, y + 0.05, cz + Math.sin(a) * d], [cx - Math.cos(a) * d * 0.4, y + 0.6 * s, cz - Math.sin(a) * d * 0.4], 0.12, 0.1, TS.BEAM);
  }
  deco.light(cx, y + 0.9 * s, cz, FIREL, 4 + 2 * s, { flicker: true });
  deco.collider(cx - 0.4 * s, y, cz - 0.4 * s, cx + 0.4 * s, y + 0.6 * s, cz + 0.4 * s, { obstacle: o.obstacle ?? true });
}
// a heap of wreckage: buckled plates and bent girders
export function debris(ctx, cx, cz, y, s = 1, o = {}) {
  const { deco, rng } = ctx;
  const n = rng.int(3, 5);
  for (let k = 0; k < n; k++) {
    const w = rng.float(0.4, 1.0) * s, d = rng.float(0.3, 0.8) * s, h = rng.float(0.08, 0.3) * s;
    const ox = rng.float(-0.5, 0.5) * s, oz = rng.float(-0.5, 0.5) * s, oy = k * 0.12 * s;
    deco.box(cx + ox - w / 2, y + oy, cz + oz - d / 2, cx + ox + w / 2, y + oy + h, cz + oz + d / 2, rng.pick(o.texes ?? [TS.METAL, TS.WALL, TS.PANEL, TS.METAL]));
  }
  for (let k = 0; k < 2; k++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(0.6, 1.1) * s;
    deco.bar([cx + Math.cos(a) * r, y + 0.04, cz + Math.sin(a) * r], [cx - Math.cos(a) * r * 0.3, y + rng.float(0.5, 1.1) * s, cz - Math.sin(a) * r * 0.3], 0.18, 0.16, TS.BEAM);
  }
  deco.collider(cx - 0.6 * s, y, cz - 0.6 * s, cx + 0.6 * s, y + 0.55 * s, cz + 0.6 * s, { obstacle: o.obstacle ?? true });
}
// boulder: a stepped rock mound
export function boulder(ctx, cx, cz, y, r, h, tex = TS.ROCK) {
  const { deco, rng } = ctx;
  const n = 3;
  for (let k = 0; k < n; k++) {
    const f = 1 - k / (n + 0.5), ox = rng.float(-0.12, 0.12) * r, oz = rng.float(-0.12, 0.12) * r;
    deco.box(cx + ox - r * f, y + (h * k) / n - 0.05, cz + oz - r * f * 0.85, cx + ox + r * f, y + (h * (k + 1)) / n, cz + oz + r * f * 0.85, tex, { s: 2 });
  }
  deco.collider(cx - r * 0.85, y, cz - r * 0.75, cx + r * 0.85, y + h, cz + r * 0.75);
}
// alien plant clump: stalks with bulbous glowing tips
export function alienPlant(ctx, cx, cz, y, s = 1) {
  const { deco, rng } = ctx;
  const n = rng.int(3, 5);
  for (let k = 0; k < n; k++) {
    const ox = rng.float(-0.4, 0.4) * s, oz = rng.float(-0.4, 0.4) * s, h = rng.float(0.8, 2.2) * s;
    deco.bar([cx + ox * 0.3, y, cz + oz * 0.3], [cx + ox, y + h, cz + oz], 0.09, 0.09, TS.FOLIAGE);
    deco.box(cx + ox - 0.16 * s, y + h - 0.05, cz + oz - 0.16 * s, cx + ox + 0.16 * s, y + h + 0.25 * s, cz + oz + 0.16 * s, TS.FOLIAGE, { emissive: 0.35 });
  }
  deco.box(cx - 0.5 * s, y, cz - 0.5 * s, cx + 0.5 * s, y + 0.3 * s, cz + 0.5 * s, TS.FOLIAGE);
}
