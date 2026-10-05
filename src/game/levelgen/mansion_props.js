// Props of the mansion archetype (gen_mansion.js): furniture, fixtures and
// garden pieces built from textured boxes. Every prop is written in a "prop
// frame" (mansion_kit.js Frame) whose b = 0 is its back (against a wall) and
// +b its front, so it can face any wall of a room in any orientation.
//
// Texture roles, chosen so each surface shows a fitting tile:
//   WOOD furniture and panelled cases, MACHINE book spines (the bookshelf
//   tile), CARPET upholstery / bedspreads / curtains, PAINT linen (sheets,
//   pillows, table cloths - the theme maps PAINT to a linen tile), METAL
//   wrought and cast iron (chandeliers, stoves, gates), PIPE chains, LIGHT
//   candle flames and lamp glass, GLASS mirrors and glazing, ROCK carved stone
//   (headstones, sarcophagi, porcelain-pale tubs and sinks), PILLAR dressed
//   stone and marble (columns, plinths, fountain), TRIM mouldings and gilt
//   frames, ACCENT gold leaf, FOLIAGE hedges and plants, LAVA embers in grates,
//   CRATE / CRATE2 wine crates and casks, SIDE dark stained wood (piano,
//   stair stringers, chests), BEAM ceiling beams and ribs, ROOF slates.
import { TS, FACE, Frame, lbox, lcol, llight, lbar, ltex, CANDLE, FIRE, LAMP } from './mansion_kit.js';
import { cylV, cylH } from './foundry_props.js';

const ROT = [3, 2, 0, 1];   // prop +a for a front facing local dir d (a rotation, never a mirror)

// prop frame over the local rectangle a0..a1 x b0..b1 of frame fr, front toward local dir `face`
export function pf(fr, a0, b0, a1, b1, face) {
  const [x0, z0, x1, z1] = fr.rect(a0, b0, a1, b1);
  return new Frame(x0, z0, x1 - x0, z1 - z0, fr.dir(ROT[face]), fr.dir(face));
}
const B = lbox;
const SOLID = { solid: true };
const ST = FACE.SIDES | FACE.TOP;

// ---------------------------------------------------------------- lighting
// chandelier hanging from the ceiling at world (x, z): chain, iron rings, candles
export function chandelier(deco, x, z, ceil, o = {}) {
  const r = o.r ?? 1.1, drop = o.drop ?? Math.min(3.2, Math.max(1.2, (o.room ?? 6) * 0.32));
  const y = ceil - drop;
  deco.box(x - 0.04, y + 0.3, z - 0.04, x + 0.04, ceil, z + 0.04, TS.PIPE, { faces: FACE.SIDES });
  // two tiers of arms
  for (const [rr, yy] of [[r, y], [r * 0.6, y + 0.45]]) {
    deco.box(x - rr, yy, z - 0.05, x + rr, yy + 0.07, z + 0.05, TS.METAL);
    deco.box(x - 0.05, yy, z - rr, x + 0.05, yy + 0.07, z + rr, TS.METAL);
    deco.box(x - rr * 0.72, yy, z - rr * 0.72, x + rr * 0.72, yy + 0.05, z + rr * 0.72, TS.METAL, { faces: FACE.TOP | FACE.BOTTOM });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const cx = x + dx * rr, cz = z + dz * rr;
      deco.box(cx - 0.035, yy + 0.07, cz - 0.035, cx + 0.035, yy + 0.24, cz + 0.035, TS.PAINT, { faces: ST });
      deco.box(cx - 0.03, yy + 0.24, cz - 0.03, cx + 0.03, yy + 0.33, cz + 0.03, TS.LIGHT, { uv: 'fit', emissive: 1 });
    }
  }
  deco.box(x - 0.16, y - 0.35, z - 0.16, x + 0.16, y + 0.05, z + 0.16, TS.METAL);
  deco.light(x, y - 0.2, z, o.color ?? CANDLE, o.radius ?? 10, { flicker: true });
}
// free-standing iron candelabrum (floor stand)
export function candleStand(deco, x, z, y, o = {}) {
  const h = o.h ?? 1.5;
  deco.box(x - 0.16, y, z - 0.16, x + 0.16, y + 0.06, z + 0.16, TS.METAL);
  deco.box(x - 0.03, y, z - 0.03, x + 0.03, y + h, z + 0.03, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.24, y + h, z - 0.03, x + 0.24, y + h + 0.05, z + 0.03, TS.METAL);
  for (const dx of [-0.22, 0, 0.22]) {
    deco.box(x + dx - 0.03, y + h + 0.05, z - 0.03, x + dx + 0.03, y + h + 0.22, z + 0.03, TS.PAINT, { faces: ST });
    deco.box(x + dx - 0.025, y + h + 0.22, z - 0.025, x + dx + 0.025, y + h + 0.3, z + 0.025, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  deco.collider(x - 0.16, y, z - 0.16, x + 0.16, y + h, z + 0.16, { obstacle: false });
  if (o.light !== false) deco.light(x, y + h + 0.3, z, CANDLE, o.radius ?? 4.5, { flicker: true });
}
// candles standing on a surface at world (x, y, z)
export function candles(deco, x, z, y, n = 3, o = {}) {
  for (let k = 0; k < n; k++) {
    const dx = (k - (n - 1) / 2) * 0.13, h = 0.12 + ((k * 7) % 3) * 0.05;
    deco.box(x + dx - 0.025, y, z - 0.025, x + dx + 0.025, y + h, z + 0.025, TS.PAINT, { faces: ST });
    deco.box(x + dx - 0.02, y + h, z - 0.02, x + dx + 0.02, y + h + 0.06, z + 0.02, TS.LIGHT, { uv: 'fit', emissive: 1 });
  }
  if (o.light !== false) deco.light(x, y + 0.4, z, CANDLE, o.radius ?? 3.5, { flicker: true });
}

// ---------------------------------------------------------------- casework
// tall bookcase: wooden carcass, the book-spine tile on the shelves. Prop
// frame: la = width, b = 0 back against the wall, depth d.
export function bookcase(deco, p, y, h, o = {}) {
  const w = p.la, d = Math.min(p.lb, o.depth ?? 0.45);
  B(deco, p, 0, y, 0, w, y + h, d, ltex(p, TS.WOOD, TS.MACHINE, 2), { solid: o.solid !== false, uv: 'fit', s: Math.max(1, Math.round(h / 1.8)) });
  // cornice and plinth
  B(deco, p, -0.04, y + h - 0.12, 0, w + 0.04, y + h, d + 0.06, TS.TRIM, { faces: ST | FACE.BOTTOM });
  B(deco, p, -0.02, y, 0, w + 0.02, y + 0.14, d + 0.03, TS.WOOD, { faces: ST });
  // uprights between bays
  for (let a = 0; a <= w + 1e-3; a += Math.max(0.9, w / Math.max(1, Math.round(w / 1.2)))) B(deco, p, Math.max(0, a - 0.04), y, d - 0.02, Math.min(w, a + 0.04), y + h, d + 0.03, TS.WOOD, { faces: ST });
}
// a bookcase swung open on its hinge (the secret door): standing square to the wall
export function openBookcase(deco, p, y, h) {
  // p: la = the depth it sticks out, lb = its width along the wall
  B(deco, p, 0, y, 0, 0.42, y + h, p.lb, ltex(p, TS.WOOD, TS.MACHINE, 0), { solid: true, uv: 'fit', s: Math.max(1, Math.round(h / 1.8)) });
  B(deco, p, -0.03, y + h - 0.1, -0.03, 0.45, y + h, p.lb + 0.03, TS.TRIM);
}
export function wardrobe(deco, p, y, o = {}) {
  const w = p.la, d = Math.min(p.lb, 0.62), h = o.h ?? 2.3;
  B(deco, p, 0, y + 0.12, 0, w, y + h, d, ltex(p, TS.WOOD, TS.CRATE2, 2), { solid: true, uv: 'fit' });
  B(deco, p, -0.05, y + h, -0.02, w + 0.05, y + h + 0.14, d + 0.05, TS.TRIM);
  B(deco, p, 0.05, y, 0.05, w - 0.05, y + 0.12, d - 0.05, TS.WOOD, { faces: FACE.SIDES });
  B(deco, p, w / 2 - 0.015, y + 0.3, d, w / 2 + 0.015, y + h - 0.1, d + 0.02, TS.TRIM, { faces: ST });
  for (const a of [w / 2 - 0.12, w / 2 + 0.09]) B(deco, p, a, y + 1.1, d, a + 0.03, y + 1.25, d + 0.05, TS.METAL);
}
// chest of drawers with a mirror above (dressing table / washstand)
export function dresser(deco, p, y, o = {}) {
  const w = p.la, d = Math.min(p.lb, 0.5);
  B(deco, p, 0, y, 0, w, y + 0.85, d, ltex(p, TS.WOOD, TS.CRATE2, 2), { solid: true, uv: 'fit' });
  B(deco, p, -0.03, y + 0.85, -0.02, w + 0.03, y + 0.9, d + 0.03, TS.WOOD);
  if (o.mirror !== false) {
    B(deco, p, w * 0.2, y + 1.0, 0, w * 0.8, y + 1.9, 0.04, TS.TRIM);
    B(deco, p, w * 0.2 + 0.06, y + 1.06, 0.04, w * 0.8 - 0.06, y + 1.84, 0.05, TS.GLASS, { uv: 'fit', emissive: 0.25 });
  }
  if (o.basin) {
    B(deco, p, w / 2 - 0.25, y + 0.9, d / 2 - 0.18, w / 2 + 0.25, y + 1.02, d / 2 + 0.18, TS.ROCK);
    B(deco, p, w / 2 - 0.08, y + 0.9, 0.04, w / 2 + 0.08, y + 1.25, 0.12, TS.ROCK);
  } else if (o.candles !== false) candles(deco, p.px(w * 0.15, d / 2), p.pz(w * 0.15, d / 2), y + 0.9, 2, { light: false });
}
export function sideboard(deco, p, y, o = {}) {
  const w = p.la, d = Math.min(p.lb, 0.55), h = o.h ?? 0.95;
  B(deco, p, 0, y + 0.1, 0, w, y + h, d, ltex(p, TS.WOOD, TS.CRATE2, 2), { solid: true, uv: 'fit' });
  B(deco, p, -0.04, y + h, -0.02, w + 0.04, y + h + 0.05, d + 0.04, TS.TRIM);
  for (const a of [0.05, w - 0.12]) for (const b of [0.05, d - 0.12]) B(deco, p, a, y, b, a + 0.07, y + 0.1, b + 0.07, TS.WOOD, { faces: FACE.SIDES });
  if (o.dishes !== false) {
    // plates on the top / a tureen
    for (let a = 0.35; a < w - 0.3; a += 0.55) B(deco, p, a - 0.14, y + h + 0.05, d / 2 - 0.14, a + 0.14, y + h + 0.08, d / 2 + 0.14, TS.PAINT, { faces: ST });
  }
  if (o.candles) candles(deco, p.px(w / 2, d / 2), p.pz(w / 2, d / 2), y + h + 0.05, 3, { radius: 4 });
}
// glass-fronted display cabinet (china, curios)
export function cabinet(deco, p, y, o = {}) {
  const w = p.la, d = Math.min(p.lb, 0.45), h = o.h ?? 2.2;
  B(deco, p, 0, y, 0, w, y + 0.8, d, ltex(p, TS.WOOD, TS.CRATE2, 2), { solid: true, uv: 'fit' });
  B(deco, p, 0, y + 0.8, 0, w, y + h, d - 0.04, TS.WOOD, { faces: FACE.SIDES | FACE.TOP, solid: true });
  B(deco, p, 0.05, y + 0.86, d - 0.05, w - 0.05, y + h - 0.08, d - 0.03, TS.GLASS, { uv: 'fit', emissive: 0.2, faces: FACE.SIDES });
  for (const sy of [1.25, 1.7]) B(deco, p, 0.05, y + sy, 0.05, w - 0.05, y + sy + 0.03, d - 0.08, TS.WOOD);
  B(deco, p, -0.04, y + h, -0.02, w + 0.04, y + h + 0.1, d + 0.03, TS.TRIM);
}

// ---------------------------------------------------------------- tables and seats
export function table(deco, p, y, o = {}) {
  const w = p.la, d = p.lb, h = o.h ?? 0.78, tex = o.tex ?? TS.WOOD;
  B(deco, p, 0, y + h - 0.07, 0, w, y + h, d, tex);
  if (o.cloth) B(deco, p, 0.12, y + h, 0.08, w - 0.12, y + h + 0.01, d - 0.08, TS.PAINT, { faces: FACE.TOP });
  const inset = 0.08, lw = o.legs ?? 0.09;
  for (const a of [inset, w - inset - lw]) for (const b of [inset, d - inset - lw]) B(deco, p, a, y, b, a + lw, y + h - 0.07, b + lw, tex, { faces: FACE.SIDES });
  if (w > 2.6) for (const b of [inset, d - inset - lw]) B(deco, p, w / 2 - lw / 2, y, b, w / 2 + lw / 2, y + h - 0.07, b + lw, tex, { faces: FACE.SIDES });
  lcol(deco, p, 0, y, 0, w, y + h, d);
}
// a chair at prop-frame position (a, b) facing local +b of the frame (back toward -b)
export function chair(deco, p, a, b, y, o = {}) {
  const s = 0.46, h = 0.48, back = o.back ?? 1.1;
  B(deco, p, a - s / 2, y + h - 0.06, b - s / 2, a + s / 2, y + h, b + s / 2, TS.WOOD);
  B(deco, p, a - s / 2 + 0.04, y + h, b - s / 2 + 0.04, a + s / 2 - 0.04, y + h + 0.05, b + s / 2 - 0.04, TS.CARPET, { faces: ST });
  for (const da of [-s / 2 + 0.02, s / 2 - 0.07]) for (const db of [-s / 2 + 0.02, s / 2 - 0.07]) B(deco, p, a + da, y, b + db, a + da + 0.05, y + h - 0.06, b + db + 0.05, TS.WOOD, { faces: FACE.SIDES });
  B(deco, p, a - s / 2, y + h, b - s / 2, a + s / 2, y + back, b - s / 2 + 0.06, TS.WOOD);
  if (o.solid) lcol(deco, p, a - s / 2, y, b - s / 2, a + s / 2, y + h, b + s / 2, { obstacle: false });
}
// upholstered armchair facing +b
export function armchair(deco, p, a, b, y) {
  const s = 0.8;
  B(deco, p, a - s / 2, y + 0.1, b - s / 2, a + s / 2, y + 0.45, b + s / 2, TS.CARPET, { solid: true });
  B(deco, p, a - s / 2, y + 0.45, b - s / 2, a + s / 2, y + 1.05, b - s / 2 + 0.18, TS.CARPET);
  for (const da of [-s / 2, s / 2 - 0.14]) B(deco, p, a + da, y + 0.45, b - s / 2 + 0.18, a + da + 0.14, y + 0.66, b + s / 2, TS.CARPET);
  for (const da of [-s / 2 + 0.04, s / 2 - 0.1]) for (const db of [-s / 2 + 0.04, s / 2 - 0.1]) B(deco, p, a + da, y, b + db, a + da + 0.06, y + 0.1, b + db + 0.06, TS.WOOD, { faces: FACE.SIDES });
}
// sofa / settee along the prop frame (back at b = 0)
export function sofa(deco, p, y) {
  const w = p.la, d = Math.min(p.lb, 0.85);
  B(deco, p, 0, y + 0.12, 0, w, y + 0.45, d, TS.CARPET, { solid: true });
  B(deco, p, 0, y + 0.45, 0, w, y + 1.0, 0.2, TS.CARPET);
  B(deco, p, 0, y + 0.45, 0.2, 0.16, y + 0.68, d, TS.CARPET);
  B(deco, p, w - 0.16, y + 0.45, 0.2, w, y + 0.68, d, TS.CARPET);
  B(deco, p, 0.05, y, 0.05, w - 0.05, y + 0.12, d - 0.05, TS.WOOD, { faces: FACE.SIDES });
}
// long table with chairs down both sides (dining hall, servants' hall).
// p: la = length, lb = depth of the whole set (chairs included)
export function diningSet(deco, p, y, o = {}) {
  const L = p.la, D = p.lb, tw = Math.min(1.5, D - 1.3);
  const tb0 = (D - tw) / 2;
  const t = new Frame(...rectOf(p, 0.4, tb0, L - 0.4, tb0 + tw), p.ad, p.bd);
  table(deco, t, y, { cloth: o.cloth, tex: o.tex });
  const top = y + 0.78;
  for (let a = 1.0; a < L - 0.9; a += o.spacing ?? 0.9) {
    chair(deco, p, a, tb0 - 0.32, y, { back: o.bench ? 0.5 : 1.15 });
    // the far side's chairs face the other way: mirrored frame
    chairBack(deco, p, a, tb0 + tw + 0.32, y, o.bench ? 0.5 : 1.15);
  }
  if (o.heads !== false) {
    for (const [a, side] of [[0.15, -1], [L - 0.15, 1]]) {
      B(deco, p, a - 0.23, y + 0.42, D / 2 - 0.23, a + 0.23, y + 0.48, D / 2 + 0.23, TS.WOOD);
      B(deco, p, a - 0.23, y + 0.48, D / 2 - 0.23, a + 0.23, y + 0.53, D / 2 + 0.23, TS.CARPET, { faces: ST });
      const ba = side < 0 ? a - 0.23 : a + 0.17;
      B(deco, p, ba, y + 0.48, D / 2 - 0.23, ba + 0.06, y + 1.35, D / 2 + 0.23, TS.WOOD);
      for (const db of [-0.21, 0.16]) B(deco, p, a - 0.21, y, D / 2 + db, a - 0.16, y + 0.42, D / 2 + db + 0.05, TS.WOOD, { faces: FACE.SIDES });
    }
  }
  // place settings, candelabra on the table
  if (o.settings !== false) for (let a = 1.0; a < L - 0.9; a += o.spacing ?? 0.9) for (const b of [tb0 + 0.25, tb0 + tw - 0.25]) B(deco, p, a - 0.13, top, b - 0.13, a + 0.13, top + 0.02, b + 0.13, TS.PAINT, { faces: ST });
  const nC = o.candelabra ?? Math.max(1, Math.floor(L / 3.5));
  for (let k = 0; k < nC; k++) {
    const a = (L * (k + 1)) / (nC + 1), cx = p.px(a, D / 2), cz = p.pz(a, D / 2);
    deco.box(cx - 0.08, top, cz - 0.08, cx + 0.08, top + 0.04, cz + 0.08, TS.METAL);
    deco.box(cx - 0.025, top, cz - 0.025, cx + 0.025, top + 0.38, cz + 0.025, TS.METAL, { faces: FACE.SIDES });
    candles(deco, cx, cz, top + 0.38, 3, { radius: 4.5 });
  }
}
function chairBack(deco, p, a, b, y, back) {
  const s = 0.46, h = 0.48;
  B(deco, p, a - s / 2, y + h - 0.06, b - s / 2, a + s / 2, y + h, b + s / 2, TS.WOOD);
  B(deco, p, a - s / 2 + 0.04, y + h, b - s / 2 + 0.04, a + s / 2 - 0.04, y + h + 0.05, b + s / 2 - 0.04, TS.CARPET, { faces: ST });
  for (const da of [-s / 2 + 0.02, s / 2 - 0.07]) for (const db of [-s / 2 + 0.02, s / 2 - 0.07]) B(deco, p, a + da, y, b + db, a + da + 0.05, y + h - 0.06, b + db + 0.05, TS.WOOD, { faces: FACE.SIDES });
  B(deco, p, a - s / 2, y + h, b + s / 2 - 0.06, a + s / 2, y + back, b + s / 2, TS.WOOD);
}
function rectOf(p, a0, b0, a1, b1) { const [x0, z0, x1, z1] = p.rect(a0, b0, a1, b1); return [x0, z0, x1 - x0, z1 - z0]; }
export function sub(p, a0, b0, a1, b1) { return new Frame(...rectOf(p, a0, b0, a1, b1), p.ad, p.bd); }

// ---------------------------------------------------------------- bedroom
// four-poster bed: head at b = 0 against the wall
export function bed(deco, p, y, o = {}) {
  const w = p.la, L = p.lb, posts = o.posts !== false;
  B(deco, p, 0.05, y + 0.2, 0.1, w - 0.05, y + 0.45, L - 0.05, TS.WOOD, { solid: true });
  B(deco, p, 0.1, y + 0.45, 0.15, w - 0.1, y + 0.68, L - 0.1, TS.PAINT, { faces: ST });
  B(deco, p, 0.08, y + 0.6, 0.75, w - 0.08, y + 0.72, L - 0.08, TS.CARPET, { faces: ST });
  for (const a of [0.2, w / 2 + 0.05]) B(deco, p, a, y + 0.68, 0.22, a + w / 2 - 0.25, y + 0.84, 0.62, TS.PAINT, { faces: ST });
  // headboard / footboard
  B(deco, p, 0, y, 0, w, y + (o.head ?? 1.45), 0.1, TS.WOOD);
  B(deco, p, 0, y, L - 0.08, w, y + 0.75, L, TS.WOOD);
  if (posts) {
    const ph = o.postH ?? 2.25;
    for (const [a, b] of [[0, 0], [w - 0.1, 0], [0, L - 0.1], [w - 0.1, L - 0.1]]) B(deco, p, a, y, b, a + 0.1, y + ph, b + 0.1, TS.WOOD, { faces: FACE.SIDES });
    // canopy frame and drapes
    B(deco, p, -0.02, y + ph, -0.02, w + 0.02, y + ph + 0.12, L + 0.02, TS.WOOD);
    B(deco, p, 0, y + ph - 0.45, 0, 0.04, y + ph, L, TS.CARPET, { faces: FACE.SIDES });
    B(deco, p, w - 0.04, y + ph - 0.45, 0, w, y + ph, L, TS.CARPET, { faces: FACE.SIDES });
    B(deco, p, 0, y + ph - 0.45, L - 0.04, w, y + ph, L, TS.CARPET, { faces: FACE.SIDES });
    for (const a of [0.02, w - 0.22]) B(deco, p, a, y + 0.5, L - 0.2, a + 0.2, y + ph, L - 0.05, TS.CARPET, { faces: FACE.SIDES });
  }
}
export function crib(deco, p, y) {
  const w = p.la, L = p.lb;
  B(deco, p, 0, y + 0.35, 0, w, y + 0.45, L, TS.WOOD, { solid: true });
  B(deco, p, 0.05, y + 0.45, 0.05, w - 0.05, y + 0.55, L - 0.05, TS.PAINT, { faces: ST });
  for (let a = 0; a <= w; a += 0.12) for (const b of [0, L - 0.04]) B(deco, p, Math.min(a, w - 0.04), y, b, Math.min(a, w - 0.04) + 0.04, y + 1.0, b + 0.04, TS.WOOD, { faces: FACE.SIDES });
  for (let b = 0.12; b < L - 0.05; b += 0.12) for (const a of [0, w - 0.04]) B(deco, p, a, y + 0.35, b, a + 0.04, y + 1.0, b + 0.04, TS.WOOD, { faces: FACE.SIDES });
  for (const b of [0, L - 0.05]) B(deco, p, 0, y + 1.0, b, w, y + 1.06, b + 0.05, TS.WOOD);
  for (const a of [0, w - 0.05]) B(deco, p, a, y + 1.0, 0, a + 0.05, y + 1.06, L, TS.WOOD);
}
export function rockingHorse(deco, x, z, y, alongX) {
  const B2 = (a0, y0, b0, a1, y1, b1, tex) => (alongX ? deco.box(x + a0, y0, z + b0, x + a1, y1, z + b1, tex) : deco.box(x + b0, y0, z + a0, x + b1, y1, z + a1, tex));
  B2(-0.45, y, -0.17, 0.45, y + 0.06, -0.12, TS.WOOD); B2(-0.45, y, 0.12, 0.45, y + 0.06, 0.17, TS.WOOD);
  for (const a of [-0.3, 0.25]) B2(a, y + 0.06, -0.12, a + 0.05, y + 0.45, 0.12, TS.WOOD);
  B2(-0.32, y + 0.45, -0.1, 0.3, y + 0.68, 0.1, TS.WOOD);
  B2(0.22, y + 0.6, -0.07, 0.4, y + 0.95, 0.07, TS.WOOD);
  B2(-0.05, y + 0.68, -0.1, 0.15, y + 0.72, 0.1, TS.CARPET);
  deco.collider(x - 0.45, y, z - 0.45, x + 0.45, y + 0.9, z + 0.45, { obstacle: false });
}
export function bathtub(deco, p, y) {
  const w = p.la, L = p.lb;
  B(deco, p, 0, y + 0.15, 0, w, y + 0.62, L, TS.ROCK, { solid: true, faces: FACE.SIDES | FACE.BOTTOM });
  B(deco, p, 0, y + 0.62, 0, w, y + 0.68, 0.08, TS.ROCK); B(deco, p, 0, y + 0.62, L - 0.08, w, y + 0.68, L, TS.ROCK);
  B(deco, p, 0, y + 0.62, 0, 0.08, y + 0.68, L, TS.ROCK); B(deco, p, w - 0.08, y + 0.62, 0, w, y + 0.68, L, TS.ROCK);
  B(deco, p, 0.08, y + 0.42, 0.08, w - 0.08, y + 0.48, L - 0.08, TS.WATER, { faces: FACE.TOP });
  B(deco, p, 0.08, y + 0.15, 0.08, w - 0.08, y + 0.42, L - 0.08, TS.ROCK, { faces: FACE.TOP });
  for (const [a, b] of [[0.06, 0.06], [w - 0.16, 0.06], [0.06, L - 0.16], [w - 0.16, L - 0.16]]) B(deco, p, a, y, b, a + 0.1, y + 0.15, b + 0.1, TS.METAL);
  B(deco, p, w / 2 - 0.04, y + 0.62, 0.02, w / 2 + 0.04, y + 0.95, 0.1, TS.METAL);
}

// ---------------------------------------------------------------- fireplace
// fireplace against the wall at b = 0: surround, firebox with embers, mantel,
// chimney breast to the ceiling, a mirror / portrait over the mantel
export function fireplace(deco, p, y, ceil, o = {}) {
  const w = p.la, d = 0.55, oh = 1.05, ow = Math.max(0.8, w - 1.1);
  const a0 = (w - ow) / 2;
  const stone = o.tex ?? TS.PILLAR;
  // chimney breast
  B(deco, p, 0.1, y + 1.45, 0, w - 0.1, ceil, 0.32, o.breast ?? TS.PANEL, { faces: FACE.SIDES });
  // jambs and lintel
  B(deco, p, 0, y, 0, a0, y + oh + 0.25, d, stone, SOLID);
  B(deco, p, w - a0, y, 0, w, y + oh + 0.25, d, stone, SOLID);
  B(deco, p, a0, y + oh, 0, w - a0, y + oh + 0.25, d, stone);
  // the firebox: back, grate, embers
  B(deco, p, a0, y, 0, w - a0, y + oh, 0.08, TS.PITWALL, { faces: FACE.SIDES });
  B(deco, p, a0, y, 0.08, w - a0, y + 0.06, d - 0.05, TS.PITWALL, { faces: FACE.TOP });
  if (o.lit !== false) {
    B(deco, p, a0 + 0.15, y + 0.06, 0.12, w - a0 - 0.15, y + 0.2, d - 0.15, TS.LAVA, { emissive: 1 });
    for (let a = a0 + 0.2; a < w - a0 - 0.2; a += 0.22) B(deco, p, a, y + 0.2, 0.18, a + 0.12, y + 0.42 + ((a * 13) % 0.2), d - 0.2, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.SIDES });
    llight(deco, p, w / 2, y + 0.6, d + 0.3, FIRE, o.radius ?? 6.5, { flicker: true });
  }
  for (const a of [a0 + 0.05, w - a0 - 0.1]) B(deco, p, a, y + 0.06, d - 0.15, a + 0.05, y + 0.35, d - 0.1, TS.METAL);
  // mantel shelf with candles / clock
  B(deco, p, -0.12, y + oh + 0.25, 0, w + 0.12, y + oh + 0.35, d + 0.12, TS.TRIM);
  candles(deco, p.px(0.25, d - 0.1), p.pz(0.25, d - 0.1), y + oh + 0.35, 2, { light: false });
  candles(deco, p.px(w - 0.25, d - 0.1), p.pz(w - 0.25, d - 0.1), y + oh + 0.35, 2, { light: false });
  // over-mantel mirror or portrait
  if (o.over !== false && ceil - y > 2.6) {
    const oy0 = y + oh + 0.55, oy1 = Math.min(ceil - 0.3, oy0 + 1.3);
    B(deco, p, 0.25, oy0, 0.32, w - 0.25, oy1, 0.38, TS.TRIM);
    B(deco, p, 0.35, oy0 + 0.1, 0.38, w - 0.35, oy1 - 0.1, 0.39, o.portrait ? TS.SCREEN : TS.GLASS, { uv: 'fit', emissive: o.portrait ? 0.35 : 0.25 });
  }
}

// ---------------------------------------------------------------- hall pieces
export function clock(deco, p, y) {
  const w = Math.min(p.la, 0.6), d = Math.min(p.lb, 0.4);
  B(deco, p, 0, y, 0, w, y + 0.5, d, TS.WOOD, SOLID);
  B(deco, p, 0.05, y + 0.5, 0.02, w - 0.05, y + 1.6, d - 0.04, TS.WOOD, SOLID);
  B(deco, p, 0.12, y + 0.7, d - 0.04, w - 0.12, y + 1.4, d - 0.02, TS.GLASS, { uv: 'fit', emissive: 0.15 });
  B(deco, p, -0.02, y + 1.6, -0.01, w + 0.02, y + 2.25, d + 0.02, TS.WOOD, SOLID);
  B(deco, p, 0.1, y + 1.72, d + 0.02, w - 0.1, y + 2.12, d + 0.03, TS.ACCENT, { uv: 'fit' });
  B(deco, p, -0.04, y + 2.25, -0.03, w + 0.04, y + 2.38, d + 0.04, TS.TRIM);
}
// suit of armour on a little plinth, facing +b
export function armour(deco, p, a, b, y) {
  const M = TS.METAL;
  B(deco, p, a - 0.32, y, b - 0.25, a + 0.32, y + 0.2, b + 0.25, TS.PILLAR, SOLID);
  const y0 = y + 0.2;
  for (const s of [-1, 1]) B(deco, p, a + s * 0.12 - 0.07, y0, b - 0.08, a + s * 0.12 + 0.07, y0 + 0.85, b + 0.08, M);
  B(deco, p, a - 0.22, y0 + 0.85, b - 0.14, a + 0.22, y0 + 1.45, b + 0.12, M);
  B(deco, p, a - 0.3, y0 + 1.3, b - 0.12, a + 0.3, y0 + 1.48, b + 0.1, M);
  for (const s of [-1, 1]) B(deco, p, a + s * 0.27 - 0.06, y0 + 0.75, b - 0.06, a + s * 0.27 + 0.06, y0 + 1.35, b + 0.06, M);
  B(deco, p, a - 0.12, y0 + 1.48, b - 0.12, a + 0.12, y0 + 1.78, b + 0.12, M);
  B(deco, p, a - 0.03, y0 + 1.78, b - 0.12, a + 0.03, y0 + 1.95, b + 0.1, TS.CARPET);
  // halberd
  B(deco, p, a + 0.36, y0, b - 0.02, a + 0.4, y0 + 2.2, b + 0.02, TS.WOOD, { faces: FACE.SIDES });
  B(deco, p, a + 0.32, y0 + 1.95, b - 0.02, a + 0.5, y0 + 2.2, b + 0.02, M);
}
// picture frame on a wall (prop frame: la = width, b = 0 on the wall)
export function painting(deco, p, y0, y1, o = {}) {
  const w = p.la;
  B(deco, p, 0, y0, 0, w, y1, 0.06, o.frame ?? TS.ACCENT, { uv: 'fit' });
  B(deco, p, 0.1, y0 + 0.1, 0.06, w - 0.1, y1 - 0.1, 0.07, o.canvas ?? TS.SCREEN, { uv: 'fit', emissive: o.emissive ?? 0.3, faces: FACE.SIDES });
}
// heavy curtains either side of a window (prop frame: la = window width + drapes)
export function curtains(deco, p, y0, y1) {
  const w = p.la;
  B(deco, p, -0.05, y1, 0, w + 0.05, y1 + 0.2, 0.14, TS.TRIM);
  for (const a of [0, w - 0.32]) B(deco, p, a, y0, 0.03, a + 0.32, y1, 0.13, TS.CARPET);
}
export function rug(g, fr, a0, b0, a1, b1, tex = TS.CARPET) {
  for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) { const i = fr.idx(g, a, b); if (i >= 0 && g.type[i] && !g.stairDir[i]) g.floorTex[i] = tex; }
}

// ---------------------------------------------------------------- kitchen / service
// cast-iron range in a chimney recess against the wall
export function range(deco, p, y, ceil) {
  const w = p.la, d = Math.min(0.8, p.lb);
  B(deco, p, 0, y, 0, w, y + 0.85, d, ltex(p, TS.METAL, TS.METAL, 2), SOLID);
  B(deco, p, 0.15, y + 0.15, d, w * 0.45, y + 0.6, d + 0.02, TS.LAVA, { emissive: 0.8 });
  B(deco, p, w * 0.55, y + 0.15, d, w - 0.15, y + 0.6, d + 0.02, TS.METAL);
  B(deco, p, -0.05, y + 0.85, -0.02, w + 0.05, y + 0.92, d + 0.05, TS.METAL);
  // pots on the hob
  for (const a of [w * 0.25, w * 0.7]) cylV(deco, p.px(a, d / 2), p.pz(a, d / 2), y + 0.92, y + 1.2, 0.18, TS.METAL);
  // hood and flue
  B(deco, p, -0.2, y + 1.9, 0, w + 0.2, y + 2.3, d + 0.25, TS.FACADE3);
  B(deco, p, 0.15, y + 2.3, 0, w - 0.15, ceil, 0.55, TS.FACADE3, { faces: FACE.SIDES });
  llight(deco, p, w / 2, y + 0.5, d + 0.4, FIRE, 4.5, { flicker: true });
}
// rack of hanging copper pans over a table (world centre, along axis)
export function potRack(deco, p, y) {
  const w = p.la, d = p.lb;
  B(deco, p, 0, y, d / 2 - 0.04, w, y + 0.06, d / 2 + 0.04, TS.METAL);
  for (const a of [0.05, w - 0.05]) B(deco, p, a - 0.02, y, d / 2 - 0.02, a + 0.02, y + 1.2, d / 2 + 0.02, TS.PIPE, { faces: FACE.SIDES });
  for (let a = 0.3; a < w - 0.2; a += 0.45) {
    B(deco, p, a - 0.01, y - 0.25, d / 2 - 0.01, a + 0.01, y, d / 2 + 0.01, TS.METAL, { faces: FACE.SIDES });
    B(deco, p, a - 0.14, y - 0.45, d / 2 - 0.14, a + 0.14, y - 0.25, d / 2 + 0.14, TS.METAL);
  }
}
// open shelves of jars / crocks against the wall
export function shelves(deco, p, y, h = 2, o = {}) {
  const w = p.la, d = Math.min(p.lb, 0.4);
  for (const a of [0, w - 0.06]) B(deco, p, a, y, 0, a + 0.06, y + h, d, TS.WOOD, { faces: FACE.SIDES });
  let k = 0;
  for (let sy = 0.35; sy < h; sy += 0.55, k++) {
    B(deco, p, 0, y + sy, 0, w, y + sy + 0.04, d, TS.WOOD);
    for (let a = 0.12; a < w - 0.12; a += 0.22 + ((k + a * 7) % 0.1)) {
      const hh = 0.14 + ((a * 17 + k) % 0.12);
      B(deco, p, a, y + sy + 0.04, 0.08, a + 0.12, y + sy + 0.04 + hh, d - 0.08, o.tex ?? (((a * 10) | 0) % 3 === 0 ? TS.GLASS : TS.ROCK), { emissive: 0.05 });
    }
  }
  lcol(deco, p, 0, y, 0, w, y + h, d);
}
export function sink(deco, p, y) {
  const w = p.la, d = Math.min(0.65, p.lb);
  B(deco, p, 0, y, 0, w, y + 0.7, d, TS.ROCK, SOLID);
  B(deco, p, 0.1, y + 0.7, 0.08, w - 0.1, y + 0.9, 0.14, TS.ROCK);
  B(deco, p, 0.1, y + 0.7, d - 0.1, w - 0.1, y + 0.9, d, TS.ROCK);
  B(deco, p, 0.1, y + 0.55, 0.14, w - 0.1, y + 0.6, d - 0.1, TS.WATER, { faces: FACE.TOP });
  // hand pump
  B(deco, p, w / 2 - 0.06, y + 0.7, 0.02, w / 2 + 0.06, y + 1.3, 0.14, TS.METAL);
  B(deco, p, w / 2 - 0.02, y + 1.15, 0.14, w / 2 + 0.02, y + 1.2, 0.4, TS.METAL);
}
// wooden cask lying on a cradle
export function cask(deco, x, z, y, alongX, r = 0.42, L = 1.0) {
  const a0 = (alongX ? x : z) - L / 2, a1 = a0 + L, c = alongX ? z : x;
  cylH(deco, a0, a1, y + r + 0.12, c, r, alongX, TS.CRATE2, { solid: true });
  for (const t of [0.12, L - 0.18]) cylH(deco, a0 + t, a0 + t + 0.06, y + r + 0.12, c, r + 0.03, alongX, TS.METAL);
  if (alongX) { deco.box(a0 + 0.1, y, c - r * 0.8, a0 + 0.2, y + 0.3, c + r * 0.8, TS.WOOD); deco.box(a1 - 0.2, y, c - r * 0.8, a1 - 0.1, y + 0.3, c + r * 0.8, TS.WOOD); }
  else { deco.box(c - r * 0.8, y, a0 + 0.1, c + r * 0.8, y + 0.3, a0 + 0.2, TS.WOOD); deco.box(c - r * 0.8, y, a1 - 0.2, c + r * 0.8, y + 0.3, a1 - 0.1, TS.WOOD); }
}
// upright barrel / tub
export function barrel(deco, x, z, y, r = 0.32, h = 0.9, tex = TS.CRATE2) {
  cylV(deco, x, z, y, y + h, r, tex, { solid: true });
  for (const t of [0.12, h - 0.18]) cylV(deco, x, z, y + t, y + t + 0.05, r + 0.025, TS.METAL);
}
// diamond-lattice wine rack against the wall, bottle ends showing
export function wineRack(deco, p, y, h = 2.1) {
  const w = p.la, d = Math.min(p.lb, 0.45);
  B(deco, p, 0, y, 0, w, y + h, 0.06, TS.WOOD, { faces: FACE.SIDES });
  for (const a of [0, w - 0.06]) B(deco, p, a, y, 0, a + 0.06, y + h, d, TS.WOOD, { faces: FACE.SIDES });
  for (let sy = 0.05; sy < h - 0.1; sy += 0.3) {
    B(deco, p, 0, y + sy, 0, w, y + sy + 0.04, d, TS.WOOD);
    for (let a = 0.1; a < w - 0.1; a += 0.17) B(deco, p, a, y + sy + 0.06, d - 0.06, a + 0.09, y + sy + 0.15, d - 0.01, TS.GLASS, { emissive: 0.05 });
  }
  B(deco, p, 0, y + h, 0, w, y + h + 0.05, d, TS.WOOD);
  lcol(deco, p, 0, y, 0, w, y + h, d);
}

// ---------------------------------------------------------------- chapel / crypt
// stone sarcophagus with a carved lid (effigy) along the prop frame's b axis
export function sarcophagus(deco, p, y, o = {}) {
  const w = p.la, L = p.lb, h = o.h ?? 0.85;
  B(deco, p, -0.08, y, -0.08, w + 0.08, y + 0.18, L + 0.08, TS.PILLAR, SOLID);
  B(deco, p, 0, y + 0.18, 0, w, y + h, L, o.tex ?? TS.ROCK, SOLID);
  B(deco, p, -0.05, y + h, -0.05, w + 0.05, y + h + 0.12, L + 0.05, TS.ROCK);
  if (o.effigy !== false) {
    B(deco, p, w / 2 - 0.18, y + h + 0.12, 0.25, w / 2 + 0.18, y + h + 0.32, L - 0.3, TS.ROCK);
    B(deco, p, w / 2 - 0.13, y + h + 0.12, 0.05, w / 2 + 0.13, y + h + 0.38, 0.3, TS.ROCK);
  }
}
export function coffin(deco, p, y, open = false) {
  const w = p.la, L = p.lb;
  B(deco, p, 0.05, y, 0, w - 0.05, y + 0.45, L, TS.WOOD, SOLID);
  B(deco, p, 0, y + 0.1, L * 0.25, w, y + 0.45, L * 0.45, TS.WOOD);
  if (open) B(deco, p, 0.1, y + 0.3, 0.08, w - 0.1, y + 0.4, L - 0.08, TS.CARPET, { faces: FACE.TOP });
  else B(deco, p, 0.03, y + 0.45, -0.02, w - 0.03, y + 0.52, L + 0.02, TS.WOOD);
}
// headstone: rounded slab / cross / obelisk (centre x, z; faces +b of the frame)
export function headstone(deco, p, a, b, y, kind = 0) {
  const T = TS.ROCK;
  if (kind === 0) {
    B(deco, p, a - 0.32, y, b - 0.09, a + 0.32, y + 0.85, b + 0.09, T, SOLID);
    B(deco, p, a - 0.24, y + 0.85, b - 0.09, a + 0.24, y + 1.0, b + 0.09, T);
    B(deco, p, a - 0.12, y + 1.0, b - 0.09, a + 0.12, y + 1.06, b + 0.09, T);
  } else if (kind === 1) {
    B(deco, p, a - 0.22, y, b - 0.15, a + 0.22, y + 0.25, b + 0.15, T, SOLID);
    B(deco, p, a - 0.07, y + 0.25, b - 0.07, a + 0.07, y + 1.55, b + 0.07, T);
    B(deco, p, a - 0.38, y + 1.05, b - 0.07, a + 0.38, y + 1.2, b + 0.07, T);
  } else if (kind === 2) {
    B(deco, p, a - 0.3, y, b - 0.3, a + 0.3, y + 0.3, b + 0.3, TS.PILLAR, SOLID);
    B(deco, p, a - 0.2, y + 0.3, b - 0.2, a + 0.2, y + 1.6, b + 0.2, T);
    B(deco, p, a - 0.14, y + 1.6, b - 0.14, a + 0.14, y + 2.0, b + 0.14, T);
    B(deco, p, a - 0.06, y + 2.0, b - 0.06, a + 0.06, y + 2.2, b + 0.06, T);
  } else {
    // tilted, sunken old slab
    B(deco, p, a - 0.3, y, b - 0.08, a + 0.3, y + 0.62, b + 0.08, T, SOLID);
    B(deco, p, a - 0.3, y + 0.62, b - 0.08, a + 0.12, y + 0.72, b + 0.08, T);
  }
}
// grave mound (earth) in front of a headstone
export function mound(deco, p, a0, b0, a1, b1, y) {
  B(deco, p, a0, y, b0, a1, y + 0.16, b1, TS.GROUND, { faces: ST });
  B(deco, p, a0 + 0.1, y + 0.16, b0 + 0.1, a1 - 0.1, y + 0.24, b1 - 0.1, TS.GROUND, { faces: ST });
}
export function pew(deco, p, y) {
  const w = p.la, d = Math.min(p.lb, 0.7);
  B(deco, p, 0, y + 0.42, 0.1, w, y + 0.5, d, TS.WOOD, SOLID);
  B(deco, p, 0, y + 0.5, 0, w, y + 1.0, 0.1, TS.WOOD);
  for (const a of [0, w - 0.08]) B(deco, p, a, y, 0, a + 0.08, y + 0.95, d, TS.WOOD);
  B(deco, p, 0, y + 0.85, d - 0.06, w, y + 0.9, d + 0.06, TS.WOOD);
}
// organ pipes against the wall (prop frame la = width)
export function organ(deco, p, y, h) {
  const w = p.la;
  B(deco, p, 0, y, 0, w, y + 1.1, 0.8, ltex(p, TS.WOOD, TS.WOOD, 2), SOLID);
  B(deco, p, 0.2, y + 0.8, 0.8, w - 0.2, y + 0.85, 1.05, TS.PAINT);
  const n = Math.max(5, Math.floor(w / 0.32));
  for (let k = 0; k < n; k++) {
    const a = 0.16 + (k * (w - 0.32)) / (n - 1), tall = h * (0.55 + 0.45 * Math.sin((Math.PI * (k + 0.5)) / n));
    cylV(deco, p.px(a, 0.3), p.pz(a, 0.3), y + 1.1, y + 1.1 + tall, 0.13, TS.METAL);
  }
  B(deco, p, -0.05, y + 1.1, 0, w + 0.05, y + 1.25, 0.6, TS.TRIM);
}
// altar with a cloth, candlesticks and a cross on the wall behind
export function altar(deco, p, y) {
  const w = p.la, d = Math.min(p.lb, 0.9);
  B(deco, p, 0, y, 0.2, w, y + 1.0, d, ltex(p, TS.PILLAR, TS.ACCENT, 2), { solid: true, uv: 'fit' });
  B(deco, p, -0.05, y + 1.0, 0.15, w + 0.05, y + 1.06, d + 0.05, TS.PAINT);
  for (const a of [0.25, w - 0.25]) {
    deco.box(p.px(a, d - 0.3) - 0.04, y + 1.06, p.pz(a, d - 0.3) - 0.04, p.px(a, d - 0.3) + 0.04, y + 1.5, p.pz(a, d - 0.3) + 0.04, TS.ACCENT);
    candles(deco, p.px(a, d - 0.3), p.pz(a, d - 0.3), y + 1.5, 1, { radius: 4 });
  }
  B(deco, p, w / 2 - 0.06, y + 1.7, 0, w / 2 + 0.06, y + 3.4, 0.08, TS.ACCENT);
  B(deco, p, w / 2 - 0.45, y + 2.75, 0, w / 2 + 0.45, y + 2.87, 0.08, TS.ACCENT);
}
// grand piano (curved case approximated by steps), keyboard toward +b
export function piano(deco, p, y) {
  const w = Math.min(p.la, 1.5), L = Math.min(p.lb, 2.0);
  const S = TS.SIDE;
  B(deco, p, 0, y + 0.6, 0.0, w, y + 0.95, L * 0.55, S, SOLID);
  B(deco, p, 0, y + 0.6, L * 0.55, w * 0.8, y + 0.95, L * 0.8, S, SOLID);
  B(deco, p, 0, y + 0.6, L * 0.8, w * 0.55, y + 0.95, L, S, SOLID);
  B(deco, p, 0.05, y + 0.85, -0.25, w - 0.05, y + 0.92, 0.0, TS.PAINT);
  B(deco, p, 0, y + 0.92, -0.25, w, y + 1.0, -0.2, S);
  for (const [a, b] of [[0.1, 0.1], [w - 0.15, 0.1], [0.1, L * 0.85]]) B(deco, p, a, y, b, a + 0.08, y + 0.6, b + 0.08, S, { faces: FACE.SIDES });
  // propped lid
  deco.bar([p.px(w - 0.05, 0.1), y + 0.95, p.pz(w - 0.05, 0.1)], [p.px(w - 0.05, 0.1), y + 1.7, p.pz(w - 0.05, 0.1)], 0.03, 0.03, S);
  B(deco, p, w / 2 - 0.25, y, -0.75, w / 2 + 0.25, y + 0.5, -0.45, S);
}
export function harp(deco, x, z, y) {
  deco.box(x - 0.2, y, z - 0.2, x + 0.2, y + 0.12, z + 0.2, TS.ACCENT);
  deco.box(x - 0.06, y + 0.12, z - 0.06, x + 0.06, y + 1.7, z + 0.06, TS.ACCENT);
  deco.bar([x, y + 0.2, z], [x + 0.6, y + 1.6, z], 0.06, 0.06, TS.ACCENT);
  for (let t = 0.12; t < 0.6; t += 0.08) deco.box(x + t - 0.005, y + 0.3 + t * 0.4, z - 0.005, x + t + 0.005, y + 1.6, z + 0.005, TS.PAINT, { faces: FACE.SIDES });
  deco.collider(x - 0.2, y, z - 0.2, x + 0.6, y + 1.7, z + 0.2, { obstacle: false });
}

// ---------------------------------------------------------------- garden
// clipped hedge block (solid)
export function hedge(deco, fr, a0, b0, a1, b1, y, h = 1.1) {
  lbox(deco, fr, a0, y, b0, a1, y + h, b1, TS.FOLIAGE, { solid: true });
}
export function topiary(deco, x, z, y, s = 0.5) {
  deco.box(x - s * 0.7, y, z - s * 0.7, x + s * 0.7, y + 0.45, z + s * 0.7, TS.PILLAR, { solid: true });
  deco.box(x - s, y + 0.45, z - s, x + s, y + 1.1, z + s, TS.FOLIAGE);
  deco.box(x - s * 0.7, y + 1.1, z - s * 0.7, x + s * 0.7, y + 1.6, z + s * 0.7, TS.FOLIAGE);
  deco.box(x - s * 0.35, y + 1.6, z - s * 0.35, x + s * 0.35, y + 2.0, z + s * 0.35, TS.FOLIAGE);
}
// bare dead tree: trunk and crooked branches (a few leaves when `leaves`)
export function deadTree(deco, x, z, y, rng, o = {}) {
  const h = o.h ?? rng.float(3.4, 5);
  deco.box(x - 0.2, y, z - 0.2, x + 0.2, y + h * 0.55, z + 0.2, TS.WOOD, { solid: true });
  deco.box(x - 0.14, y + h * 0.55, z - 0.14, x + 0.14, y + h, z + 0.14, TS.WOOD);
  for (let k = 0; k < 5; k++) {
    const ang = rng.float(0, Math.PI * 2), len = rng.float(0.9, 1.8), yb = y + h * rng.float(0.45, 0.9);
    const ex = x + Math.cos(ang) * len, ez = z + Math.sin(ang) * len;
    deco.bar([x, yb, z], [ex, yb + rng.float(0.5, 1.2), ez], 0.09, 0.09, TS.WOOD);
    if (o.leaves) deco.box(ex - 0.45, yb + 0.6, ez - 0.45, ex + 0.45, yb + 1.3, ez + 0.45, TS.FOLIAGE);
  }
}
export function bench(deco, p, y) {
  const w = p.la;
  B(deco, p, 0, y + 0.42, 0.05, w, y + 0.48, 0.5, TS.WOOD, SOLID);
  B(deco, p, 0, y + 0.55, 0, w, y + 0.9, 0.06, TS.WOOD);
  for (const a of [0.05, w - 0.1]) B(deco, p, a, y, 0, a + 0.05, y + 0.9, 0.5, TS.METAL, { faces: FACE.SIDES });
}
// statue on a plinth (a cloaked figure), facing +b
export function statue(deco, p, a, b, y, o = {}) {
  const s = o.s ?? 1;
  B(deco, p, a - 0.42 * s, y, b - 0.42 * s, a + 0.42 * s, y + 0.9 * s, b + 0.42 * s, TS.PILLAR, SOLID);
  B(deco, p, a - 0.5 * s, y + 0.9 * s, b - 0.5 * s, a + 0.5 * s, y + 1.0 * s, b + 0.5 * s, TS.TRIM);
  const y0 = y + 1.0 * s;
  B(deco, p, a - 0.3 * s, y0, b - 0.22 * s, a + 0.3 * s, y0 + 1.2 * s, b + 0.2 * s, TS.ROCK);
  B(deco, p, a - 0.24 * s, y0 + 1.2 * s, b - 0.18 * s, a + 0.24 * s, y0 + 1.5 * s, b + 0.16 * s, TS.ROCK);
  B(deco, p, a - 0.12 * s, y0 + 1.5 * s, b - 0.12 * s, a + 0.12 * s, y0 + 1.78 * s, b + 0.12 * s, TS.ROCK);
  if (o.wings) for (const sa of [-1, 1]) B(deco, p, a + sa * 0.3 * s - (sa < 0 ? 0.5 * s : 0), y0 + 0.7 * s, b - 0.18 * s, a + sa * 0.3 * s + (sa > 0 ? 0.5 * s : 0), y0 + 1.7 * s, b - 0.1 * s, TS.ROCK);
  else for (const sa of [-1, 1]) B(deco, p, a + sa * 0.3 * s - 0.07 * s, y0 + 0.6 * s, b - 0.07 * s, a + sa * 0.3 * s + 0.07 * s, y0 + 1.4 * s, b + 0.07 * s, TS.ROCK);
}
// garden lamp post with a lantern
export function lampPost(deco, x, z, y, h = 3.2) {
  deco.streetLamp(x, z, y, { height: h, armX: 0, armZ: 0, radius: 7, color: LAMP });
  deco.box(x - 0.16, y + h - 0.2, z - 0.16, x + 0.16, y + h + 0.12, z + 0.16, TS.METAL, { faces: FACE.TOP | FACE.BOTTOM });
  deco.box(x - 0.1, y + h + 0.12, z - 0.1, x + 0.1, y + h + 0.3, z + 0.1, TS.METAL);
}
// potted palm (conservatory)
export function palm(deco, x, z, y, rng) {
  deco.box(x - 0.32, y, z - 0.32, x + 0.32, y + 0.55, z + 0.32, TS.ROCK, { solid: true });
  deco.box(x - 0.28, y + 0.5, z - 0.28, x + 0.28, y + 0.56, z + 0.28, TS.GROUND, { faces: FACE.TOP });
  const h = rng.float(1.6, 2.6);
  deco.box(x - 0.08, y + 0.55, z - 0.08, x + 0.08, y + 0.55 + h, z + 0.08, TS.WOOD, { faces: FACE.SIDES });
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2 + rng.float(0, 0.4), len = rng.float(0.8, 1.2);
    deco.bar([x, y + 0.55 + h, z], [x + Math.cos(ang) * len, y + 0.25 + h, z + Math.sin(ang) * len], 0.28, 0.05, TS.FOLIAGE);
  }
}
// iron railing panel with spear tops along a world line (fence / gates)
export function ironFence(deco, x0, z0, x1, z1, y, h = 1.6) {
  const horiz = z0 === z1, len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const a = horiz ? Math.min(x0, x1) : Math.min(z0, z1);
  const L = horiz ? z0 : x0;
  const seg = (p0, p1, y0, y1, th) => (horiz ? deco.box(p0, y0, L - th / 2, p1, y1, L + th / 2, TS.METAL) : deco.box(L - th / 2, y0, p0, L + th / 2, y1, p1, TS.METAL));
  for (const yy of [y + 0.15, y + h - 0.25]) seg(a, a + len, yy, yy + 0.05, 0.05);
  for (let t = 0.1; t < len; t += 0.18) seg(a + t - 0.015, a + t + 0.015, y, y + h, 0.03);
  for (let t = 0.1; t < len; t += 0.18) seg(a + t - 0.03, a + t + 0.03, y + h, y + h + 0.1, 0.05);
  for (const t of [0, len]) seg(a + t - 0.06, a + t + 0.06, y, y + h + 0.2, 0.12);
}

export { cylV, cylH, lbar, LAMP };
