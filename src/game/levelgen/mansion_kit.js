// Shared helpers for the "mansion" archetype (gen_mansion.js): a local
// coordinate frame per room so every template is written once ("the gallery
// runs along the rear wall", "the bed's head is against the outer wall") and
// works in any of the eight orientations the house plan can take, plus the
// storey heights and light colours of the house.
//
// Local coordinates: a runs across the room, b runs into it; local
// directions 0 +a, 1 -a, 2 +b, 3 -b (like the grid's 0 +x, 1 -x, 2 +z, 3 -z).
import { TS } from './common.js';
import { FACE } from './deco.js';
import { F, DIR_X, DIR_Z, OPP } from '../grid.js';

// storeys: the ground floor sits two steps above the gardens, the upper floor
// seven steps above it, the cellars and the crypt seven steps below it
export const GROUND = 0, GF = 1.2, UF = GF + 4.2, CF = GF - 4.2;

export const CANDLE = [1, 0.72, 0.4], FIRE = [1, 0.5, 0.2], MOON = [0.62, 0.7, 0.95], LAMP = [1, 0.82, 0.55], GHOST = [0.55, 0.8, 1];
const FK = ['px', 'nx', 'pz', 'nz'];
const FBIT = [FACE.PX, FACE.NX, FACE.PZ, FACE.NZ];

export class Frame {
  // world rect [x, x + w) x [z, z + h); ad / bd: world directions of local +a / +b
  constructor(x, z, w, h, ad, bd) {
    this.x = x; this.z = z; this.w = w; this.h = h; this.ad = ad; this.bd = bd;
    const aX = ad < 2;
    this.la = aX ? w : h; this.lb = aX ? h : w;
    this.Ax = DIR_X[ad]; this.Az = DIR_Z[ad]; this.Bx = DIR_X[bd]; this.Bz = DIR_Z[bd];
    this.ox = this.Ax < 0 || this.Bx < 0 ? x + w : x;
    this.oz = this.Az < 0 || this.Bz < 0 ? z + h : z;
  }
  px(a, b) { return this.ox + this.Ax * a + this.Bx * b; }
  pz(a, b) { return this.oz + this.Az * a + this.Bz * b; }
  // world cell of local cell (a, b)
  cx(a, b) { return Math.floor(this.px(a + 0.5, b + 0.5)); }
  cz(a, b) { return Math.floor(this.pz(a + 0.5, b + 0.5)); }
  idx(g, a, b) { const x = this.cx(a, b), z = this.cz(a, b); return g.in(x, z) ? z * g.w + x : -1; }
  // world box of the local rectangle a0..a1 x b0..b1
  rect(a0, b0, a1, b1) {
    const x0 = this.px(a0, b0), x1 = this.px(a1, b1), z0 = this.pz(a0, b0), z1 = this.pz(a1, b1);
    return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)];
  }
  dir(ld) { return ld === 0 ? this.ad : ld === 1 ? OPP[this.ad] : ld === 2 ? this.bd : OPP[this.bd]; }
  ldir(wd) { return wd === this.ad ? 0 : wd === OPP[this.ad] ? 1 : wd === this.bd ? 2 : 3; }
  // local (a, b) of a world cell
  la_(x, z) { return this.Ax ? (this.Ax > 0 ? x - this.ox : this.ox - 1 - x) : (this.Az > 0 ? z - this.oz : this.oz - 1 - z); }
  lb_(x, z) { return this.Bx ? (this.Bx > 0 ? x - this.ox : this.ox - 1 - x) : (this.Bz > 0 ? z - this.oz : this.oz - 1 - z); }
  in(a, b) { return a >= 0 && b >= 0 && a < this.la && b < this.lb; }
  // a sub-frame for a local rectangle (same axes)
  sub(a0, b0, a1, b1) { const [x0, z0, x1, z1] = this.rect(a0, b0, a1, b1); return new Frame(x0, z0, x1 - x0, z1 - z0, this.ad, this.bd); }
  // a frame over the same rectangle whose +b points along local direction ld
  // (e.g. a template written "facing the wall" turned toward any wall)
  turned(ld) {
    const bd = this.dir(ld);
    // keep a right-handed-ish pairing: +a is +b turned the way this frame's +a is from its +b
    const flip = ld === 2 ? this.ad : ld === 3 ? OPP[this.ad] : ld === 0 ? OPP[this.bd] : this.bd;
    return new Frame(this.x, this.z, this.w, this.h, flip, bd);
  }
}

// ---------------------------------------------------------------- local deco
// texture spec with a local front face: {side, top, front: tex, frontDir: ld}
export function ltex(fr, side, front, frontDir, top = side, extra = {}) {
  const t = { side, top, bottom: side, ...extra };
  if (front !== undefined) t[FK[fr.dir(frontDir)]] = front;
  return t;
}
export function lface(fr, ld) { return FBIT[fr.dir(ld)]; }
export function lfaces(fr, lds) { let m = 0; for (const d of lds) m |= FBIT[fr.dir(d)]; return m; }
// box in local coordinates
export function lbox(deco, fr, a0, y0, b0, a1, y1, b1, tex, o) {
  const [x0, z0, x1, z1] = fr.rect(a0, b0, a1, b1);
  return deco.box(x0, y0, z0, x1, y1, z1, tex, o);
}
export function lcol(deco, fr, a0, y0, b0, a1, y1, b1, o) {
  const [x0, z0, x1, z1] = fr.rect(a0, b0, a1, b1);
  return deco.collider(x0, y0, z0, x1, y1, z1, o);
}
export function llight(deco, fr, a, y, b, color, radius, o) { deco.light(fr.px(a, b), y, fr.pz(a, b), color, radius, o); }
export function lbar(deco, fr, a0, y0, b0, a1, y1, b1, w, h, tex) { deco.bar([fr.px(a0, b0), y0, fr.pz(a0, b0)], [fr.px(a1, b1), y1, fr.pz(a1, b1)], w, h, tex); }

// straight flight over the local rectangle a0..a0+na x b0..b0+nb climbing
// toward local direction ld from y0 (low end) to y1. Returns the cells.
export function lstairs(deco, fr, a0, b0, na, nb, ld, y0, y1, o = {}) {
  const [x0, z0, x1, z1] = fr.rect(a0, b0, a0 + na, b0 + nb);
  const wd = fr.dir(ld);
  const along = wd < 2 ? x1 - x0 : z1 - z0, width = wd < 2 ? z1 - z0 : x1 - x0;
  const sx = wd === 1 ? x1 - 1 : x0, sz = wd === 3 ? z1 - 1 : z0;
  return deco.stairs(sx, sz, wd, width, y0, y1, { ...o, rise: (y1 - y0) / along });
}
// guard rail along a local cell-edge line from (a0, b0) to (a1, b1) (axis aligned)
export function lrail(deco, fr, a0, b0, a1, b1, y, o = {}) {
  deco.railRun(fr.px(a0, b0), fr.pz(a0, b0), fr.px(a1, b1), fr.pz(a1, b1), y, o);
}
// mark the grid edges along the same line as blocked (rails drawn separately)
export function ledge(g, fr, a, b, ld) { g.setEdge(fr.cx(a, b), fr.cz(a, b), fr.dir(ld), true); }

// world wall line of local side ld: cell (a, b) touches it
export function wallLight(deco, fr, a, b, ld, y, color = CANDLE, o = {}) {
  deco.wallLight(fr.cx(a, b), fr.cz(a, b), fr.dir(ld), y, color, o);
}

// ---------------------------------------------------------------- cell helpers
export function each(fr, a0, b0, a1, b1, fn) {
  for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) fn(a, b);
}
export function setCells(g, fr, a0, b0, a1, b1, o) {
  each(fr, a0, b0, a1, b1, (a, b) => {
    const i = fr.idx(g, a, b);
    if (i < 0) return;
    if (o.floor !== undefined) g.floor[i] = o.floor;
    if (o.ceil !== undefined) g.ceil[i] = o.ceil;
    if (o.floorTex !== undefined) g.floorTex[i] = o.floorTex;
    if (o.wallTex !== undefined) g.wallTex[i] = o.wallTex;
    if (o.ceilTex !== undefined) g.ceilTex[i] = o.ceilTex;
    if (o.flags) g.flags[i] |= o.flags;
    if (o.light !== undefined) g.light[i] = o.light;
  });
}
export const isFlatFree = (g, i) => g.type[i] && !(g.flags[i] & (F.STAIR | F.PIT | F.HAZARD | F.VOID | F.OBSTACLE | F.DOOR | F.BRIDGE | F.WATER));

export { TS, FACE, F, DIR_X, DIR_Z, OPP };
