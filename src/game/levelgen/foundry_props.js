// Props for the "foundry" archetype (industrial plants: clockwork foundry,
// infernal foundry, meat processing plant, volcano base). Everything is built
// from textured boxes like the rest of deco.js; round things (boilers, tanks,
// stacks, cooling towers, ladles, gear wheels) use stepped many-sided
// sections made of a few overlapping boxes.
//
// Texture roles (TS) used on purpose: METAL for steel shells / frames /
// machine sides, MACHINE for control fronts and gear boxes, PIPE for pipes
// and flues, BEAM for girders and crane rails, GRATE for belts, catwalk decks
// and mesh, TRIM for bands and rims, LAVA for molten metal, PANEL for locker
// doors (brass in the clockwork foundry: gear wheels), CRATE / CRATE2 for
// crates and containers, WOOD for pallets and benches, ROCK / GROUND for ore,
// slag and rubble, SCREEN for gauges and displays, LIGHT for lamps, GLASS for
// cab and booth windows, WALL2 for carcasses in the meat plant (flesh).
import { TS } from './common.js';
import { FACE } from './deco.js';
import { DIR_X, DIR_Z } from '../grid.js';

const FK = ['px', 'nx', 'pz', 'nz'];
export const faced = (dir, front, side, top = side) => ({ side, top, bottom: side, [FK[dir]]: front });
export const MOLTEN = [1, 0.48, 0.16], FIRE = [1, 0.62, 0.3], COLD = [0.7, 0.85, 1], WARM = [1, 0.86, 0.62], SODIUM = [1, 0.76, 0.42], BLOODL = [1, 0.3, 0.25], GREENL = [0.5, 1, 0.4];

// theme variant: 'clock' | 'hell' | 'meat' | 'volcano'
export function fvOf(theme) {
  const id = theme?.id || '';
  if (id.includes('clockwork')) return 'clock';
  if (id.includes('meat')) return 'meat';
  if (id.includes('volcano')) return 'volcano';
  return 'hell';
}

// box in frame coordinates (t0..t1 away from the frame wall, s0..s1 along it)
export function fbox(deco, Fr, t0, t1, s0, s1, y0, y1, tex, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.box(ax, y0, az, bx, y1, bz, tex, o);
}
export function fcollider(deco, Fr, t0, t1, s0, s1, y0, y1, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.collider(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), o);
}

// ---------------------------------------------------------------- round shapes
// vertical "cylinder": three overlapping boxes (a stepped 12-sided section)
export function cylV(deco, cx, cz, y0, y1, r, tex, o = {}) {
  const a = r * 0.42, b = r * 0.74;
  const opt = { s: o.s, emissive: o.emissive, faces: o.faces, lightMul: o.lightMul };
  deco.box(cx - r, y0, cz - a, cx + r, y1, cz + a, tex, opt);
  deco.box(cx - a, y0, cz - r, cx + a, y1, cz + r, tex, opt);
  if (r > 0.25) deco.box(cx - b, y0, cz - b, cx + b, y1, cz + b, tex, opt);
  if (o.solid) deco.collider(cx - b, y0, cz - b, cx + b, y1, cz + b, { obstacle: o.obstacle ?? true });
}
// horizontal cylinder along x (alongX) or z: a0..a1 along the axis, centre (cy, c)
export function cylH(deco, a0, a1, cy, c, r, alongX, tex, o = {}) {
  const p = r * 0.42, q = r * 0.74;
  const B = (lo, hi, h0, h1) => (alongX ? deco.box(a0, h0, c + lo, a1, h1, c + hi, tex, { s: o.s }) : deco.box(c + lo, h0, a0, c + hi, h1, a1, tex, { s: o.s }));
  B(-r, r, cy - p, cy + p); B(-p, p, cy - r, cy + r);
  if (r > 0.25) B(-q, q, cy - q, cy + q);
  if (o.solid) {
    if (alongX) deco.collider(a0, cy - r, c - q, a1, cy + r, c + q, { obstacle: o.obstacle ?? true });
    else deco.collider(c - q, cy - r, a0, c + q, cy + r, a1, { obstacle: o.obstacle ?? true });
  }
}
// band (ring) round a vertical cylinder
export function bandV(deco, cx, cz, y, r, h = 0.14, tex = TS.TRIM) { cylV(deco, cx, cz, y, y + h, r + 0.05, tex); }

// Gear wheel. plane 'x': the disc stands in the x-y plane (axle along z),
// 'z': in the z-y plane (axle along x), 'y': lying flat (axle vertical).
// Disc of concentric slabs, teeth round the rim, a spoke cross and a hub.
export function gear(deco, cx, cy, cz, R, plane, th, tex, o = {}) {
  const box = (u0, u1, v0, v1, w0, w1, t, opt) => {
    if (plane === 'x') return deco.box(cx + u0, cy + v0, cz + w0, cx + u1, cy + v1, cz + w1, t, opt);
    if (plane === 'z') return deco.box(cx + w0, cy + v0, cz + u0, cx + w1, cy + v1, cz + u1, t, opt);
    return deco.box(cx + u0, cy + w0, cz + v0, cx + u1, cy + w1, cz + v1, t, opt);
  };
  const N = Math.max(3, Math.min(6, Math.round(R * 1.5)));
  const h = th / 2;
  for (let k = 0; k < N; k++) {
    const v = R * (k + 1) / N, u = R * Math.sqrt(Math.max(0, 1 - ((k + 0.55) / N) ** 2));
    box(-u, u, -v, v, -h, h, tex);
  }
  const teeth = o.teeth ?? Math.max(8, Math.min(18, Math.round(R * 5.5)));
  const tl = Math.min(0.42, 0.14 + R * 0.08), tw = Math.min(0.5, (Math.PI * R / teeth) * 0.95);
  for (let k = 0; k < teeth; k++) {
    const a = (k + (o.phase ?? 0)) / teeth * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const pu = c * (R + tl / 2 - 0.04), pv = s * (R + tl / 2 - 0.04);
    const eu = Math.abs(c) * tl / 2 + Math.abs(s) * tw / 2, ev = Math.abs(s) * tl / 2 + Math.abs(c) * tw / 2;
    box(pu - eu, pu + eu, pv - ev, pv + ev, -h, h, tex);
  }
  // spoke cross and hub stand proud of the disc faces
  const sp = Math.max(0.06, R * 0.07), hw = h + 0.04;
  box(-R * 0.86, R * 0.86, -sp, sp, -hw, hw, o.spokeTex ?? tex);
  box(-sp, sp, -R * 0.86, R * 0.86, -hw, hw, o.spokeTex ?? tex);
  const hub = Math.max(0.16, R * 0.2);
  box(-hub, hub, -hub, hub, -h - 0.14, h + 0.14, o.hubTex ?? TS.METAL);
  if (o.axle) box(-hub * 0.45, hub * 0.45, -hub * 0.45, hub * 0.45, -o.axle, o.axle, TS.METAL);
}

// ---------------------------------------------------------------- plant
// blast furnace / smelter against the frame wall (t = 0), s0..s0+w, dep deep.
// Steel shell on a plinth, glowing tap hole and spout, banding, hood and flue.
export function furnace(ctx, Fr, s0, w, y, o = {}) {
  const { deco, g } = ctx;
  const dep = o.dep ?? 2, h = o.h ?? 3.4, sm = s0 + w / 2;
  const front = Fr.toward;
  fbox(deco, Fr, 0, dep + 0.1, s0 + 0.05, s0 + w - 0.05, y, y + 0.35, TS.SIDE);
  fbox(deco, Fr, 0, dep, s0 + 0.15, s0 + w - 0.15, y + 0.35, y + h, faced(front, o.frontTex ?? TS.METAL, TS.METAL), { s: 1.5 });
  for (const by of [y + 1.85, y + h - 0.35]) fbox(deco, Fr, 0, dep + 0.06, s0 + 0.1, s0 + w - 0.1, by, by + 0.16, TS.TRIM);
  const mw = Math.min(0.75, w / 2 - 0.4);
  if (o.cold) {
    // cooker / renderer: a hatch with a pressure gauge instead of a fire
    fbox(deco, Fr, dep, dep + 0.06, sm - mw, sm + mw, y + 0.6, y + 1.6, TS.MACHINE, { uv: 'fit' });
    fbox(deco, Fr, dep, dep + 0.05, sm + mw + 0.1, sm + mw + 0.45, y + 2.0, y + 2.35, TS.SCREEN, { uv: 'fit', emissive: 0.6 });
  } else {
    fbox(deco, Fr, dep - 0.02, dep + 0.03, sm - mw, sm + mw, y + 0.6, y + 1.45, TS.LAVA, { emissive: 1 });
    // frame round the tap hole
    fbox(deco, Fr, dep, dep + 0.12, sm - mw - 0.12, sm - mw, y + 0.5, y + 1.55, TS.TRIM);
    fbox(deco, Fr, dep, dep + 0.12, sm + mw, sm + mw + 0.12, y + 0.5, y + 1.55, TS.TRIM);
    fbox(deco, Fr, dep, dep + 0.12, sm - mw - 0.12, sm + mw + 0.12, y + 1.45, y + 1.57, TS.TRIM);
    // spout trough under the hole
    fbox(deco, Fr, dep, dep + 0.5, sm - 0.22, sm + 0.22, y + 0.38, y + 0.52, TS.METAL);
    fbox(deco, Fr, dep + 0.02, dep + 0.46, sm - 0.14, sm + 0.14, y + 0.52, y + 0.54, TS.LAVA, { emissive: 1 });
    const [lx, lz] = Fr.pt(dep + 0.9, sm);
    deco.light(lx, y + 1.1, lz, MOLTEN, o.lightR ?? 6, { flicker: true });
  }
  // hood and flue to the ceiling
  fbox(deco, Fr, 0, dep + 0.35, s0, s0 + w, y + h, y + h + 0.45, TS.METAL);
  const [fx, fz] = Fr.pt(dep * 0.45, sm);
  const ci = g.idx(Math.floor(fx), Math.floor(fz));
  const top = Math.min(g.ceil[ci], y + (o.flueH ?? 30));
  if (top > y + h + 1) {
    cylV(deco, fx, fz, y + h + 0.45, top, Math.min(0.55, w / 4), TS.PIPE);
    for (let by = y + h + 1.6; by < top - 0.5; by += 2.2) bandV(deco, fx, fz, by, Math.min(0.55, w / 4), 0.12, TS.METAL);
  }
  fcollider(deco, Fr, 0, dep + 0.12, s0 + 0.05, s0 + w - 0.05, y, y + h + 0.45);
}

// vertical boiler / pressure vessel on a plinth: shell, bands, dome, manway,
// gauge, safety valve and a steam pipe up to the ceiling
export function boiler(ctx, cx, cz, y, r, h, o = {}) {
  const { deco, g } = ctx;
  cylV(deco, cx, cz, y, y + 0.3, r + 0.15, TS.SIDE);
  cylV(deco, cx, cz, y + 0.3, y + h, r, o.tex ?? TS.METAL, { s: 1.5 });
  for (let by = y + 1.0; by < y + h - 0.4; by += 1.4) bandV(deco, cx, cz, by, r);
  cylV(deco, cx, cz, y + h, y + h + 0.35, r * 0.78, o.tex ?? TS.METAL);
  cylV(deco, cx, cz, y + h + 0.35, y + h + 0.6, r * 0.45, o.tex ?? TS.METAL);
  // manway hatch + gauge facing o.face
  const d = o.face ?? 2;
  const fx = cx + DIR_X[d] * (r + 0.02), fz = cz + DIR_Z[d] * (r + 0.02);
  const ax = DIR_X[d] !== 0 ? 0.06 : 0.32, az = DIR_Z[d] !== 0 ? 0.06 : 0.32;
  deco.box(fx - ax, y + 0.7, fz - az, fx + ax, y + 1.5, fz + az, TS.MACHINE, { uv: 'fit' });
  const gx = DIR_X[d] !== 0 ? 0.05 : 0.14, gz = DIR_Z[d] !== 0 ? 0.05 : 0.14;
  deco.box(fx - gx, y + 1.75, fz - gz, fx + gx, y + 2.05, fz + gz, TS.SCREEN, { uv: 'fit', emissive: 0.6 });
  const ci = g.idx(Math.floor(cx), Math.floor(cz));
  const top = g.sky[ci] ? y + h + 3 : g.ceil[ci];
  if (top > y + h + 0.9) {
    deco.box(cx - 0.12, y + h + 0.6, cz - 0.12, cx + 0.12, top, cz + 0.12, TS.PIPE);
    deco.box(cx - 0.2, y + h + 0.9, cz - 0.2, cx + 0.2, y + h + 1.1, cz + 0.2, TS.METAL);
  }
  deco.collider(cx - r * 0.8, y, cz - r * 0.8, cx + r * 0.8, y + h + 0.6, cz + r * 0.8);
}

// horizontal boiler / tank on two saddles, along x or z, a0..a1 on the axis
export function tankH(ctx, a0, a1, c, y, r, alongX, o = {}) {
  const { deco } = ctx;
  const cy = y + r + 0.35;
  for (const a of [a0 + 0.5, a1 - 0.7]) {
    if (alongX) deco.box(a, y, c - r * 0.8, a + 0.2, cy - r * 0.4, c + r * 0.8, TS.METAL);
    else deco.box(c - r * 0.8, y, a, c + r * 0.8, cy - r * 0.4, a + 0.2, TS.METAL);
  }
  cylH(deco, a0 + 0.15, a1 - 0.15, cy, c, r, alongX, o.tex ?? TS.METAL, { s: 1.5 });
  cylH(deco, a0, a0 + 0.15, cy, c, r * 0.8, alongX, o.tex ?? TS.METAL);
  cylH(deco, a1 - 0.15, a1, cy, c, r * 0.8, alongX, o.tex ?? TS.METAL);
  for (let a = a0 + 1.2; a < a1 - 1; a += 1.5) cylH(deco, a, a + 0.12, cy, c, r + 0.05, alongX, TS.TRIM);
  if (alongX) deco.collider(a0, y, c - r * 0.8, a1, cy + r, c + r * 0.8);
  else deco.collider(c - r * 0.8, y, a0, c + r * 0.8, cy + r, a1);
  return cy + r;
}

// conveyor along a world rect (belt along the long side): legs, side frames,
// rollers, mesh belt, end drums, drive motor and goods on the belt
export function conveyor(ctx, x0, z0, x1, z1, y, o = {}) {
  const { deco, rng } = ctx;
  const alongX = x1 - x0 >= z1 - z0;
  const L = alongX ? x1 - x0 : z1 - z0, Wb = alongX ? z1 - z0 : x1 - x0;
  const B = (a0, a1, b0, b1, y0, y1, tex, opt) => (alongX ? deco.box(x0 + a0, y0, z0 + b0, x0 + a1, y1, z0 + b1, tex, opt) : deco.box(x0 + b0, y0, z0 + a0, x0 + b1, y1, z0 + a1, tex, opt));
  const hb = o.h ?? 0.82;
  for (let a = 0.15; a < L - 0.1; a += Math.max(1.2, (L - 0.3) / Math.max(1, Math.round((L - 0.3) / 1.8)))) {
    for (const b of [0.05, Wb - 0.13]) B(a, a + 0.08, b, b + 0.08, y, y + hb - 0.18, TS.METAL, { faces: FACE.SIDES });
  }
  for (const b of [0, Wb - 0.08]) B(0, L, b, b + 0.08, y + hb - 0.22, y + hb, TS.METAL);
  B(0.05, L - 0.05, 0.08, Wb - 0.08, y + hb - 0.12, y + hb - 0.04, o.belt ?? TS.GRATE, { s: 1 });
  for (let a = 0.5; a < L - 0.3; a += 0.9) B(a, a + 0.07, 0.1, Wb - 0.1, y + hb - 0.24, y + hb - 0.14, TS.PIPE);
  // end drums
  for (const a of [0, L - 0.22]) B(a, a + 0.22, 0.06, Wb - 0.06, y + hb - 0.28, y + hb - 0.02, TS.PIPE);
  // drive motor beside one end
  if (o.motor !== false) {
    const a = o.motorAt === 'start' ? 0.3 : L - 1.0;
    if (alongX) deco.box(x0 + a, y, z0 - 0.42, x0 + a + 0.7, y + 0.55, z0 - 0.02, faced(3, TS.MACHINE, TS.METAL), { uv: 'fit' });
    else deco.box(x0 - 0.42, y, z0 + a, x0 - 0.02, y + 0.55, z0 + a + 0.7, faced(1, TS.MACHINE, TS.METAL), { uv: 'fit' });
  }
  // goods on the belt
  const items = o.items ?? 'ingots';
  if (items !== 'none') {
    for (let a = 0.4 + rng.float(0, 0.6); a < L - 0.6; a += rng.float(0.9, 1.7)) {
      const top = y + hb - 0.04;
      const m = (Wb - 0.6) / 2;
      if (items === 'ingots') B(a, a + 0.55, 0.3 + m * 0.4, 0.3 + m * 0.4 + 0.28, top, top + 0.14, TS.METAL);
      else if (items === 'glow') B(a, a + 0.5, 0.25 + m * 0.4, 0.25 + m * 0.4 + 0.3, top, top + 0.12, TS.LAVA, { emissive: 0.8 });
      else if (items === 'meat') B(a, a + 0.5, 0.2, Wb - 0.2, top, top + rng.float(0.15, 0.3), TS.WALL2);
      else if (items === 'crates') { const s = rng.float(0.35, 0.55); B(a, a + s, (Wb - s) / 2, (Wb + s) / 2, top, top + s, rng.chance(0.7) ? TS.CRATE : TS.CRATE2, { uv: 'fit' }); }
      else if (items === 'ore') B(a, a + 0.45, 0.25, Wb - 0.25, top, top + 0.16, TS.ROCK);
      else if (items === 'gears') B(a, a + 0.45, 0.2, Wb - 0.2, top, top + 0.1, TS.PANEL);
    }
  }
  deco.collider(x0, y, z0, x1, y + hb, z1);
}

// hopper (feed bin): stepped funnel with a rim, legs to the floor or rods to
// the ceiling, and a chute down to `chuteTo`
export function hopper(ctx, cx, cz, yb, sz, o = {}) {
  const { deco } = ctx;
  const hs = sz / 2;
  deco.box(cx - hs * 0.35, yb, cz - hs * 0.35, cx + hs * 0.35, yb + 0.6, cz + hs * 0.35, TS.METAL);
  deco.box(cx - hs * 0.68, yb + 0.6, cz - hs * 0.68, cx + hs * 0.68, yb + 1.25, cz + hs * 0.68, TS.METAL);
  deco.box(cx - hs, yb + 1.25, cz - hs, cx + hs, yb + 2.6, cz + hs, TS.METAL, { s: 1.5 });
  deco.box(cx - hs - 0.06, yb + 2.6, cz - hs - 0.06, cx + hs + 0.06, yb + 2.75, cz + hs + 0.06, TS.TRIM);
  if (o.fill) deco.box(cx - hs + 0.08, yb + 2.75, cz - hs + 0.08, cx + hs - 0.08, yb + 2.8, cz + hs - 0.08, o.fill, { faces: FACE.TOP, emissive: o.fill === TS.LAVA ? 0.9 : 0 });
  if (o.chuteTo !== undefined && o.chuteTo < yb - 0.1) deco.box(cx - 0.16, o.chuteTo, cz - 0.16, cx + 0.16, yb, cz + 0.16, TS.METAL);
  if (o.floorY !== undefined) {
    for (const [px, pz] of [[cx - hs, cz - hs], [cx + hs - 0.12, cz - hs], [cx - hs, cz + hs - 0.12], [cx + hs - 0.12, cz + hs - 0.12]]) {
      deco.box(px, o.floorY, pz, px + 0.12, yb + 1.3, pz + 0.12, TS.BEAM, { faces: FACE.SIDES });
      deco.collider(px, o.floorY, pz, px + 0.12, yb + 1.3, pz + 0.12, { obstacle: false });
    }
  } else if (o.ceil !== undefined && o.ceil > yb + 2.9) {
    for (const [px, pz] of [[cx - hs + 0.1, cz - hs + 0.1], [cx + hs - 0.16, cz + hs - 0.16]]) deco.box(px, yb + 2.75, pz, px + 0.06, o.ceil, pz + 0.06, TS.METAL, { faces: FACE.SIDES });
  }
}

// ladle (molten metal bucket) hanging or standing at (cx, cy, cz)
export function ladle(ctx, cx, cy, cz, r = 0.9, o = {}) {
  const { deco } = ctx;
  const h = r * 1.45;
  cylV(deco, cx, cz, cy, cy + h, r, TS.METAL);
  bandV(deco, cx, cz, cy + h * 0.25, r, 0.12, TS.TRIM);
  bandV(deco, cx, cz, cy + h - 0.18, r, 0.18, TS.TRIM);
  if (o.molten !== false) {
    cylV(deco, cx, cz, cy + h, cy + h + 0.03, r * 0.72, TS.LAVA, { emissive: 1 });
    deco.light(cx, cy + h + 0.6, cz, MOLTEN, o.lightR ?? 6, { pulse: true });
  }
  // bail: trunnions and the hanger loop
  const ax = o.alongX !== false;
  for (const sg of [-1, 1]) {
    const px = cx + (ax ? sg * (r + 0.1) : 0), pz = cz + (ax ? 0 : sg * (r + 0.1));
    deco.box(px - 0.07, cy + h * 0.5, pz - 0.07, px + 0.07, cy + h + 1.0, pz + 0.07, TS.METAL);
  }
  if (ax) deco.box(cx - r - 0.17, cy + h + 0.9, cz - 0.08, cx + r + 0.17, cy + h + 1.05, cz + 0.08, TS.METAL);
  else deco.box(cx - 0.08, cy + h + 0.9, cz - r - 0.17, cx + 0.08, cy + h + 1.05, cz + r + 0.17, TS.METAL);
  if (o.solid) deco.collider(cx - r * 0.75, cy, cz - r * 0.75, cx + r * 0.75, cy + h, cz + r * 0.75);
  return cy + h + 1.05;
}

// Overhead travelling crane in frame Fr: rails along both long walls (t = 0
// and t = Fr.L) over s0..s1, a box girder across at s = sc, end trucks, an
// operator cab, a trolley at t = tt and a load hanging down to yLoad.
export function crane(ctx, Fr, s0, s1, yRail, sc, tt, o = {}) {
  const { deco } = ctx;
  const L = Fr.L;
  if (o.rails !== false) {
    for (const [ta, tb] of [[0.02, 0.5], [L - 0.5, L - 0.02]]) {
      fbox(deco, Fr, ta, tb, s0, s1, yRail, yRail + 0.42, TS.BEAM);
      for (let s = s0 + 1; s < s1 - 0.5; s += 4) fbox(deco, Fr, ta === 0.02 ? 0 : L - 0.6, ta === 0.02 ? 0.6 : L, s - 0.2, s + 0.2, yRail - 0.7, yRail, TS.METAL);
    }
  }
  const gy = yRail + 0.42;
  fbox(deco, Fr, 0.1, L - 0.1, sc - 0.45, sc + 0.45, gy, gy + 0.75, TS.BEAM);
  fbox(deco, Fr, 0.1, L - 0.1, sc - 0.5, sc + 0.5, gy + 0.75, gy + 0.85, TS.TRIM);
  for (const [ta, tb] of [[0, 0.8], [L - 0.8, L]]) fbox(deco, Fr, ta, tb, sc - 0.9, sc + 0.9, gy, gy + 0.6, faced(Fr.lat, TS.MACHINE, TS.METAL), { uv: 'fit' });
  // cab under the girder near one end
  if (o.cab !== false) {
    const c0 = o.cabAtEnd ? L - 2.6 : 1.2;
    fbox(deco, Fr, c0, c0 + 1.4, sc - 0.6, sc + 0.6, gy - 1.5, gy, { side: TS.GLASS, top: TS.METAL, bottom: TS.METAL }, { uv: 'fit', emissive: 0.3 });
    fbox(deco, Fr, c0 - 0.05, c0 + 1.45, sc - 0.65, sc + 0.65, gy - 1.6, gy - 1.5, TS.METAL);
  }
  // trolley and hoist
  fbox(deco, Fr, tt - 0.7, tt + 0.7, sc - 0.75, sc + 0.75, gy + 0.85, gy + 1.45, faced(Fr.lat, TS.MACHINE, TS.METAL), { uv: 'fit' });
  const [cx, cz] = Fr.pt(tt, sc);
  const yLoad = o.yLoad ?? yRail - 3;
  for (const sg of [-0.18, 0.18]) {
    const [px, pz] = Fr.pt(tt, sc + sg);
    deco.box(px - 0.03, yLoad, pz - 0.03, px + 0.03, gy, pz + 0.03, TS.METAL, { faces: FACE.SIDES });
  }
  const load = o.load ?? 'hook';
  if (load === 'ladle') ladle(ctx, cx, yLoad - 1.05 - 0.9 * 1.45, cz, 0.9, { alongX: Fr.lat >= 2, lightR: 8 });
  else if (load === 'gear') {
    deco.box(cx - 0.25, yLoad - 0.5, cz - 0.25, cx + 0.25, yLoad, cz + 0.25, TS.METAL);
    gear(deco, cx, yLoad - 0.5 - 1.6, cz, 1.4, Fr.lat >= 2 ? 'x' : 'z', 0.3, TS.PANEL);
  } else if (load === 'beams') {
    deco.box(cx - 0.3, yLoad - 0.4, cz - 0.3, cx + 0.3, yLoad, cz + 0.3, TS.METAL);
    const [ax, az] = Fr.pt(tt - 1.8, sc - 0.35), [bx, bz] = Fr.pt(tt + 1.8, sc + 0.35);
    for (let k = 0; k < 3; k++) deco.box(Math.min(ax, bx), yLoad - 0.7 - k * 0.22, Math.min(az, bz), Math.max(ax, bx), yLoad - 0.5 - k * 0.22, Math.max(az, bz), TS.BEAM);
  } else {
    deco.box(cx - 0.28, yLoad - 0.45, cz - 0.2, cx + 0.28, yLoad, cz + 0.2, faced(2, TS.PAINT, TS.METAL), { uv: 'fit' });
    deco.box(cx - 0.06, yLoad - 0.85, cz - 0.06, cx + 0.06, yLoad - 0.45, cz + 0.06, TS.METAL);
    deco.box(cx - 0.06, yLoad - 0.95, cz - 0.2, cx + 0.06, yLoad - 0.85, cz + 0.06, TS.METAL);
  }
}

// ---------------------------------------------------------------- outdoor
// smokestack: banded steel chimney with a flared base and a lip
export function stack(ctx, cx, cz, y, r, h, o = {}) {
  const { deco } = ctx;
  cylV(deco, cx, cz, y, y + 1.2, r + 0.35, TS.SIDE);
  cylV(deco, cx, cz, y + 1.2, y + h, r, o.tex ?? TS.METAL, { s: 2 });
  for (let by = y + 3; by < y + h - 1; by += 3.2) bandV(deco, cx, cz, by, r, 0.2, TS.TRIM);
  cylV(deco, cx, cz, y + h - 0.6, y + h, r + 0.12, TS.TRIM);
  // ladder up the side
  deco.box(cx + r, y + 1.2, cz - 0.2, cx + r + 0.08, y + h - 0.8, cz - 0.15, TS.METAL, { faces: FACE.SIDES });
  deco.box(cx + r, y + 1.2, cz + 0.15, cx + r + 0.08, y + h - 0.8, cz + 0.2, TS.METAL, { faces: FACE.SIDES });
  if (o.glow) deco.light(cx, y + h + 0.5, cz, MOLTEN, 7, { flicker: true });
  deco.collider(cx - r - 0.25, y, cz - r - 0.25, cx + r + 0.25, y + h, cz + r + 0.25);
}
// hyperbolic cooling tower of stacked rings
export function coolingTower(ctx, cx, cz, y, R, h, o = {}) {
  const { deco } = ctx;
  const n = 7;
  const rad = (t) => R * (t < 0.72 ? 0.64 + 0.36 * ((0.72 - t) / 0.72) ** 1.6 : 0.64 + 0.2 * ((t - 0.72) / 0.28) ** 1.4);
  // splash pond legs (columns) under the shell
  for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.3], [0, 1.3], [-1.3, 0], [1.3, 0]]) {
    const px = cx + ax * R * 0.7, pz = cz + az * R * 0.7;
    deco.box(px - 0.15, y, pz - 0.15, px + 0.15, y + 1.4, pz + 0.15, TS.SIDE, { faces: FACE.SIDES });
  }
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    cylV(deco, cx, cz, y + 1.4 + (h - 1.4) * t0, y + 1.4 + (h - 1.4) * t1, rad((t0 + t1) / 2), o.tex ?? TS.SIDE, { s: 3 });
  }
  cylV(deco, cx, cz, y + h, y + h + 0.25, rad(1) + 0.1, TS.TRIM);
  deco.collider(cx - R * 0.85, y, cz - R * 0.85, cx + R * 0.85, y + h, cz + R * 0.85);
}
// vertical storage tank with a cone roof and a caged ladder
export function storageTank(ctx, cx, cz, y, r, h, o = {}) {
  const { deco } = ctx;
  cylV(deco, cx, cz, y, y + 0.25, r + 0.15, TS.SIDE);
  cylV(deco, cx, cz, y + 0.25, y + h, r, o.tex ?? TS.METAL, { s: 2 });
  for (let by = y + 1.5; by < y + h - 0.5; by += 2) bandV(deco, cx, cz, by, r, 0.1, TS.TRIM);
  cylV(deco, cx, cz, y + h, y + h + 0.35, r * 0.7, o.tex ?? TS.METAL);
  cylV(deco, cx, cz, y + h + 0.35, y + h + 0.6, r * 0.35, o.tex ?? TS.METAL);
  const d = o.face ?? 2;
  const lx = cx + DIR_X[d] * (r + 0.08), lz = cz + DIR_Z[d] * (r + 0.08);
  for (const sg of [-0.22, 0.22]) {
    const px = lx + (DIR_X[d] === 0 ? sg : 0), pz = lz + (DIR_Z[d] === 0 ? sg : 0);
    deco.box(px - 0.03, y + 0.25, pz - 0.03, px + 0.03, y + h + 0.9, pz + 0.03, TS.METAL, { faces: FACE.SIDES });
  }
  deco.collider(cx - r * 0.8, y, cz - r * 0.8, cx + r * 0.8, y + h + 0.6, cz + r * 0.8);
}

// ---------------------------------------------------------------- small props
// stack of ingots in criss-cross layers on a pallet
export function ingotStack(ctx, cx, cz, y, layers = 4, o = {}) {
  const { deco } = ctx;
  deco.box(cx - 0.5, y, cz - 0.5, cx + 0.5, y + 0.14, cz + 0.5, TS.WOOD);
  let yy = y + 0.14;
  for (let k = 0; k < layers; k++) {
    for (const off of [-0.27, 0.05]) {
      if (k % 2) deco.box(cx + off, yy, cz - 0.45, cx + off + 0.22, yy + 0.13, cz + 0.45, o.tex ?? TS.METAL);
      else deco.box(cx - 0.45, yy, cz + off, cx + 0.45, yy + 0.13, cz + off + 0.22, o.tex ?? TS.METAL);
    }
    yy += 0.13;
  }
  deco.collider(cx - 0.5, y, cz - 0.5, cx + 0.5, yy, cz + 0.5);
}
// pallet with a load: 'crates' | 'sacks' | 'drums'
export function pallet(ctx, cx, cz, y, load = 'crates') {
  const { deco, rng } = ctx;
  deco.box(cx - 0.55, y, cz - 0.45, cx + 0.55, y + 0.14, cz + 0.45, TS.WOOD);
  const top = y + 0.14;
  let hh = 0;
  if (load === 'drums') {
    for (const [ox, oz] of [[-0.27, -0.2], [0.27, -0.2], [-0.27, 0.22], [0.27, 0.22]]) cylV(deco, cx + ox, cz + oz, top, top + 0.85, 0.22, TS.METAL);
    hh = 0.85;
  } else if (load === 'sacks') {
    for (let k = 0; k < 3; k++) deco.box(cx - 0.5, top + k * 0.22, cz - 0.4, cx + 0.5, top + k * 0.22 + 0.2, cz + 0.4, TS.GROUND);
    hh = 0.66;
  } else {
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) deco.box(cx - 0.45 + k * 0.05, top + k * 0.5, cz - 0.4, cx + 0.45 - k * 0.05, top + k * 0.5 + 0.5, cz + 0.4, rng.chance(0.7) ? TS.CRATE : TS.CRATE2, { uv: 'fit' });
    hh = n * 0.5;
  }
  deco.collider(cx - 0.55, y, cz - 0.45, cx + 0.55, top + hh, cz + 0.45);
}
// ore / slag / coal heap: a stepped mound
export function heap(ctx, cx, cz, y, rx, rz, h, tex = TS.ROCK) {
  const { deco } = ctx;
  const n = 3;
  for (let k = 0; k < n; k++) {
    const f = 1 - k / n;
    deco.box(cx - rx * f, y + h * k / n, cz - rz * f, cx + rx * f, y + h * (k + 1) / n, cz + rz * f, tex, { s: 2 });
  }
  deco.collider(cx - rx * 0.8, y, cz - rz * 0.8, cx + rx * 0.8, y + h * 0.7, cz + rz * 0.8);
}
// bank of lockers against the wall of cell (x, z) on side d (dir to wall), n wide
export function lockers(ctx, x, z, d, y, n = 1) {
  const { deco } = ctx;
  const along = d >= 2;  // wall runs along x
  for (let k = 0; k < n; k++) {
    for (const half of [0, 0.5]) {
      const a = (along ? x : z) + k + half + 0.02, b = a + 0.46;
      const dep = 0.5;
      if (d === 0) deco.box(x + 1 - dep, y, a, x + 1, y + 1.9, b, faced(1, TS.PANEL, TS.METAL), { uv: 'fit', solid: true });
      else if (d === 1) deco.box(x, y, a, x + dep, y + 1.9, b, faced(0, TS.PANEL, TS.METAL), { uv: 'fit', solid: true });
      else if (d === 2) deco.box(a, y, z + 1 - dep, b, y + 1.9, z + 1, faced(3, TS.PANEL, TS.METAL), { uv: 'fit', solid: true });
      else deco.box(a, y, z, b, y + 1.9, z + dep, faced(2, TS.PANEL, TS.METAL), { uv: 'fit', solid: true });
    }
  }
}
// bench: wooden slats on steel legs (world rect)
export function bench(ctx, x0, z0, x1, z1, y) {
  const { deco } = ctx;
  deco.box(x0, y + 0.42, z0, x1, y + 0.5, z1, TS.WOOD);
  const alongX = x1 - x0 >= z1 - z0;
  for (const p of alongX ? [x0 + 0.1, x1 - 0.16] : [z0 + 0.1, z1 - 0.16]) {
    if (alongX) deco.box(p, y, z0 + 0.05, p + 0.06, y + 0.42, z1 - 0.05, TS.METAL, { faces: FACE.SIDES });
    else deco.box(x0 + 0.05, y, p, x1 - 0.05, y + 0.42, p + 0.06, TS.METAL, { faces: FACE.SIDES });
  }
  deco.collider(x0, y, z0, x1, y + 0.5, z1, { obstacle: false });
}
// workbench with a vice and tools against nothing in particular (world rect)
export function workbench(ctx, x0, z0, x1, z1, y, o = {}) {
  const { deco, rng } = ctx;
  deco.box(x0, y + 0.82, z0, x1, y + 0.92, z1, o.top ?? TS.WOOD);
  for (const [lx, lz] of [[x0 + 0.04, z0 + 0.04], [x1 - 0.12, z0 + 0.04], [x0 + 0.04, z1 - 0.12], [x1 - 0.12, z1 - 0.12]]) deco.box(lx, y, lz, lx + 0.08, y + 0.82, lz + 0.08, TS.METAL, { faces: FACE.SIDES });
  deco.box(x0 + 0.06, y + 0.25, z0 + 0.06, x1 - 0.06, y + 0.3, z1 - 0.06, TS.METAL);
  const alongX = x1 - x0 >= z1 - z0, L = alongX ? x1 - x0 : z1 - z0;
  for (let u = 0.25; u < L - 0.3; u += rng.float(0.35, 0.6)) {
    const [px, pz] = alongX ? [x0 + u, (z0 + z1) / 2 + rng.float(-0.15, 0.1)] : [(x0 + x1) / 2 + rng.float(-0.15, 0.1), z0 + u];
    const kind = rng.int(0, 2);
    if (kind === 0) deco.box(px - 0.1, y + 0.92, pz - 0.08, px + 0.1, y + 1.12, pz + 0.08, TS.METAL);
    else if (kind === 1) deco.box(px - 0.15, y + 0.92, pz - 0.1, px + 0.15, y + 1.02, pz + 0.1, TS.CRATE, { uv: 'fit' });
    else deco.box(px - 0.04, y + 0.92, pz - 0.18, px + 0.04, y + 0.98, pz + 0.18, TS.PIPE);
  }
  deco.collider(x0, y, z0, x1, y + 0.92, z1);
}
// machine press straddling a line: two columns, a crown with the drive and a ram
export function press(ctx, x0, z0, x1, z1, y, h = 3.0) {
  const { deco } = ctx;
  const alongX = x1 - x0 >= z1 - z0;   // the columns stand at the two ends of the long side
  const cols = alongX ? [[x0, z0, x0 + 0.35, z1], [x1 - 0.35, z0, x1, z1]] : [[x0, z0, x1, z0 + 0.35], [x0, z1 - 0.35, x1, z1]];
  for (const [a, b, c, d] of cols) { deco.box(a, y, b, c, y + h, d, TS.METAL, { s: 1.5 }); deco.collider(a, y, b, c, y + h, d); }
  deco.box(x0 - 0.05, y + h, z0 - 0.05, x1 + 0.05, y + h + 0.8, z1 + 0.05, { side: TS.MACHINE, top: TS.METAL, bottom: TS.METAL }, { uv: 'fit' });
  const ix0 = alongX ? x0 + 0.4 : x0 + 0.1, ix1 = alongX ? x1 - 0.4 : x1 - 0.1, iz0 = alongX ? z0 + 0.1 : z0 + 0.4, iz1 = alongX ? z1 - 0.1 : z1 - 0.4;
  deco.box(ix0, y + h - 0.9, iz0, ix1, y + h, iz1, TS.METAL);
  deco.box((ix0 + ix1) / 2 - 0.12, y + h - 1.3, (iz0 + iz1) / 2 - 0.12, (ix0 + ix1) / 2 + 0.12, y + h - 0.9, (iz0 + iz1) / 2 + 0.12, TS.PIPE);
  deco.box(ix0 + 0.1, y + 1.55, iz0 + 0.1, ix1 - 0.1, y + 1.75, iz1 - 0.1, TS.TRIM);
}
// drum / barrel (non-explosive, decorative oil drum)
export function drum(ctx, cx, cz, y, tex = TS.METAL) {
  cylV(ctx.deco, cx, cz, y, y + 0.9, 0.28, tex);
  ctx.deco.collider(cx - 0.25, y, cz - 0.25, cx + 0.25, y + 0.9, cz + 0.25);
}
// hanging carcass on a hook (meat plant): hook, two hind legs, body
export function carcass(ctx, x, z, yTop, alongX = true) {
  const { deco, rng } = ctx;
  deco.box(x - 0.03, yTop - 0.35, z - 0.03, x + 0.03, yTop, z + 0.03, TS.METAL, { faces: FACE.SIDES });
  const w = alongX ? 0.3 : 0.18, d = alongX ? 0.18 : 0.3;
  const len = rng.float(1.05, 1.35);
  const y1 = yTop - 0.35, y0 = y1 - len;
  for (const sg of [-1, 1]) {
    const ox = alongX ? sg * 0.12 : 0, oz = alongX ? 0 : sg * 0.12;
    deco.box(x + ox - 0.05, y1 - 0.3, z + oz - 0.05, x + ox + 0.05, y1, z + oz + 0.05, TS.WALL2);
  }
  deco.box(x - w, y0 + 0.25, z - d, x + w, y1 - 0.3, z + d, TS.WALL2);
  deco.box(x - w * 0.6, y0, z - d * 0.6, x + w * 0.6, y0 + 0.25, z + d * 0.6, TS.WALL2);
}
// valve wheel on a wall / pipe facing direction d at world point (x, y, z)
export function valve(ctx, x, y, z, d, r = 0.25, tex = TS.MACHINE) {
  const { deco } = ctx;
  const t = 0.04;
  if (d < 2) {
    deco.box(x - t, y - r, z - r, x + t, y - r + 0.06, z + r, tex);
    deco.box(x - t, y + r - 0.06, z - r, x + t, y + r, z + r, tex);
    deco.box(x - t, y - r, z - r, x + t, y + r, z - r + 0.06, tex);
    deco.box(x - t, y - r, z + r - 0.06, x + t, y + r, z + r, tex);
    deco.box(x - t - 0.03, y - 0.05, z - 0.05, x + t + 0.03, y + 0.05, z + 0.05, TS.METAL);
  } else {
    deco.box(x - r, y - r, z - t, x + r, y - r + 0.06, z + t, tex);
    deco.box(x - r, y + r - 0.06, z - t, x + r, y + r, z + t, tex);
    deco.box(x - r, y - r, z - t, x - r + 0.06, y + r, z + t, tex);
    deco.box(x + r - 0.06, y - r, z - t, x + r, y + r, z + t, tex);
    deco.box(x - 0.05, y - 0.05, z - t - 0.03, x + 0.05, y + 0.05, z + t + 0.03, TS.METAL);
  }
}
// forklift: chassis, counterweight, mast, forks, overhead guard
export function forklift(ctx, cx, cz, y, dir) {
  const { deco } = ctx;
  const ax = dir < 2;   // forks point along x
  const fx = DIR_X[dir], fz = DIR_Z[dir];
  const B = (a0, a1, b0, b1, y0, y1, tex, opt) => {
    // a: along the fork direction (positive = forward), b: across
    const p0 = ax ? cx + fx * a0 : cx + b0, p1 = ax ? cx + fx * a1 : cx + b1;
    const q0 = ax ? cz + b0 : cz + fz * a0, q1 = ax ? cz + b1 : cz + fz * a1;
    deco.box(Math.min(p0, p1), y0, Math.min(q0, q1), Math.max(p0, p1), y1, Math.max(q0, q1), tex, opt);
  };
  B(-0.8, 0.4, -0.45, 0.45, y + 0.15, y + 0.75, TS.METAL);
  B(-0.95, -0.55, -0.45, 0.45, y + 0.15, y + 0.95, TS.SIDE);
  for (const [a, b] of [[-0.65, -0.47], [0.15, -0.47], [-0.65, 0.35], [0.15, 0.35]]) B(a, a + 0.35, b, b + 0.12, y, y + 0.32, TS.METAL, { lightMul: 0.35 });
  for (const b of [-0.4, 0.32]) B(-0.75, -0.67, b, b + 0.08, y + 0.75, y + 1.9, TS.METAL, { faces: FACE.SIDES });
  for (const b of [-0.4, 0.32]) B(0.1, 0.18, b, b + 0.08, y + 0.75, y + 1.9, TS.METAL, { faces: FACE.SIDES });
  B(-0.78, 0.2, -0.42, 0.42, y + 1.9, y + 1.98, TS.METAL);
  B(0.4, 0.5, -0.4, 0.4, y + 0.1, y + 2.1, TS.BEAM);
  for (const b of [-0.3, 0.2]) B(0.5, 1.35, b, b + 0.1, y + 0.12, y + 0.18, TS.METAL);
  const p0 = ax ? cx - (fx > 0 ? 0.95 : -0.5) : cx - 0.45, p1 = ax ? cx + (fx > 0 ? 0.5 : -0.95) : cx + 0.45;
  const q0 = ax ? cz - 0.45 : cz - (fz > 0 ? 0.95 : -0.5), q1 = ax ? cz + 0.45 : cz + (fz > 0 ? 0.5 : -0.95);
  deco.collider(Math.min(p0, p1), y, Math.min(q0, q1), Math.max(p0, p1), y + 1.98, Math.max(q0, q1));
}
// roll-up shutter door (closed) on a wall face: on the wall of cell (x,z) side d,
// w cells wide starting at that cell along the wall
export function shutter(ctx, x, z, d, y, w = 3, h = 3.2) {
  const { deco } = ctx;
  const along = d >= 2;
  const a0 = (along ? x : z) + 0.1, a1 = (along ? x : z) + w - 0.1;
  const line = d === 0 ? x + 1 : d === 1 ? x : d === 2 ? z + 1 : z;
  const s = d === 0 || d === 2 ? -1 : 1;
  const face = d === 0 ? FACE.NX : d === 1 ? FACE.PX : d === 2 ? FACE.NZ : FACE.PZ;
  const B = (dep0, dep1, b0, b1, y0, y1, tex, opt) => {
    const l0 = line + s * dep0, l1 = line + s * dep1;
    if (along) deco.box(b0, y0, Math.min(l0, l1), b1, y1, Math.max(l0, l1), tex, opt);
    else deco.box(Math.min(l0, l1), y0, b0, Math.max(l0, l1), y1, b1, tex, opt);
  };
  B(0, 0.06, a0, a1, y, y + h, TS.CRATE2, { faces: face | FACE.TOP, s: 1 });
  B(0, 0.14, a0 - 0.15, a0, y, y + h + 0.3, TS.PAINT, { uv: 'fit' });
  B(0, 0.14, a1, a1 + 0.15, y, y + h + 0.3, TS.PAINT, { uv: 'fit' });
  B(0, 0.3, a0 - 0.15, a1 + 0.15, y + h, y + h + 0.45, TS.METAL);
}
