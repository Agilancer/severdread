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

// prop frame over the local rectangle a0..a1 x b0..b1 of frame fr, front
// toward local dir `face`: b = 0 is the prop's back, +b its front, +a the
// room's direction ROT[face] (a rotation of the room frame, never a mirror)
const ROT = [3, 2, 0, 1];
export function pf(fr, a0, b0, a1, b1, face) {
  const [x0, z0, x1, z1] = fr.rect(a0, b0, a1, b1);
  return new Frame(x0, z0, x1 - x0, z1 - z0, fr.dir(ROT[face]), fr.dir(face));
}

// ---------------------------------------------------------------- room kit
// Template toolkit for one room, in the room's local frame (a across, b
// deep; W x D cells). Keeps a set of used cells so props never pile up, and
// never touches the reserved approaches of the doorways.
export class Kit {
  constructor(M, r) {
    this.M = M; this.r = r; this.g = M.g; this.deco = M.deco; this.rng = M.rng; this.fr = r.fr;
    this.y = r.floor; this.top = r.floor + r.ceilH; this.W = r.du; this.D = r.dv;
    if (!r.used) r.used = new Set();
  }
  idx(a, b) { return this.fr.idx(this.g, a, b); }
  in(a, b) { return a >= 0 && b >= 0 && a < this.W && b < this.D; }
  mine(a, b) { if (!this.in(a, b)) return false; const i = this.idx(a, b); return i >= 0 && this.g.type[i] === 1 && this.g.region[i] === this.r.id; }
  res(a, b) { return this.r.reserved.has(a + b * 1000); }
  used(a, b) { return this.r.used.has(a + b * 1000); }
  fl(a, b) { const i = this.idx(a, b); return i >= 0 ? this.g.floor[i] : -99; }
  // rectangle [a0, a1) x [b0, b1): inside, own flat cells at height y (default
  // the room floor), not reserved, not used; the margin ring not reserved
  free(a0, b0, a1, b1, m = 0, y = this.y) {
    if (a0 < 0 || b0 < 0 || a1 > this.W || b1 > this.D || a1 <= a0 || b1 <= b0) return false;
    for (let b = b0 - m; b < b1 + m; b++) for (let a = a0 - m; a < a1 + m; a++) {
      const core = a >= a0 && a < a1 && b >= b0 && b < b1;
      if (!this.in(a, b)) continue;
      if (this.res(a, b)) return false;
      if (!core) continue;
      if (this.used(a, b) || !this.mine(a, b)) return false;
      const i = this.idx(a, b);
      if (Math.abs(this.g.floor[i] - y) > 0.01 || (this.g.flags[i] & (F.STAIR | F.PIT | F.HAZARD | F.WATER | F.DOOR | F.BRIDGE))) return false;
    }
    return true;
  }
  use(a0, b0, a1, b1) { for (let b = Math.floor(b0); b < Math.ceil(b1); b++) for (let a = Math.floor(a0); a < Math.ceil(a1); a++) this.r.used.add(a + b * 1000); }
  // take a free rectangle for a solid piece (true when it was free and
  // blocking it leaves every floor cell of the room reachable from its doors)
  take(a0, b0, a1, b1, m = 0, y) {
    if (!this.free(a0, b0, a1, b1, m, y) || !this.keepsPath(a0, b0, a1, b1)) return false;
    this.use(a0, b0, a1, b1);
    return true;
  }
  claim(a0, b0, a1, b1, m = 0, y) { return this.take(a0, b0, a1, b1, m, y); }
  // would blocking the local rect cut any walkable cell of the room off its doorways?
  keepsPath(a0, b0, a1, b1) {
    const { g, r } = this, id = r.id;
    const blocked = new Set(this.cells(Math.floor(a0), Math.floor(b0), Math.ceil(a1), Math.ceil(b1)));
    const seeds = [];
    for (const p of r.ports) if (p.active) for (const [a, b] of p.cells) { const i = this.idx(a, b); if (i >= 0 && g.type[i] && !blocked.has(i)) seeds.push(i); }
    if (!seeds.length) return true;
    const ok = (j) => g.type[j] === 1 && g.region[j] === id && !blocked.has(j) && !(g.flags[j] & (F.OBSTACLE | F.VOID | F.PIT));
    const seen = new Set(), q = [];
    for (const i of seeds) if (!seen.has(i)) { seen.add(i); q.push(i); }
    while (q.length) {
      const i = q.pop(), x = i % g.w, z = (i / g.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIR_X[d], nz = z + DIR_Z[d];
        if (!g.in(nx, nz)) continue;
        const j = nz * g.w + nx;
        if (seen.has(j) || !ok(j) || !g.passable(i, j, 1.05, 0.85, false, d)) continue;
        seen.add(j); q.push(j);
      }
    }
    if (!this._all) { this._all = []; for (let b = 0; b < this.D; b++) for (let a = 0; a < this.W; a++) { const i = this.idx(a, b); if (i >= 0) this._all.push(i); } }
    for (const i of this._all) if (ok(i) && !(g.flags[i] & F.HAZARD) && !seen.has(i)) return false;
    return true;
  }
  cells(a0, b0, a1, b1) { const out = []; each(this.fr, a0, b0, a1, b1, (a, b) => { if (this.mine(a, b)) out.push(this.idx(a, b)); }); return out; }
  // set the floor of own cells (galleries, landings, daises, sunk areas)
  floorRect(a0, b0, a1, b1, y, o = {}) {
    each(this.fr, a0, b0, a1, b1, (a, b) => {
      if (!this.mine(a, b)) return;
      const i = this.idx(a, b);
      this.g.floor[i] = y;
      if (o.ceil !== undefined) this.g.ceil[i] = o.ceil;
      if (o.floorTex !== undefined) this.g.floorTex[i] = o.floorTex;
      if (o.wallTex !== undefined) this.g.wallTex[i] = o.wallTex;
      if (o.flags) this.g.flags[i] |= o.flags;
      if (o.haz !== undefined) this.g.hazType[i] = o.haz;
    });
  }
  // straight flight over a0..a0+na x b0..b0+nb climbing toward local ld
  flight(a0, b0, na, nb, ld, y0, y1, o = {}) {
    const cells = lstairs(this.deco, this.fr, a0, b0, na, nb, ld, y0, y1, { style: 'wood', floorTex: TS.STAIR, sideTex: TS.WOOD, light: this.r.light, region: this.r.id, ...o });
    this.use(a0, b0, a0 + na, b0 + nb);
    return cells;
  }
  // balustrade on every drop of the given world cells (stairs excluded)
  rail(cells, o = {}) {
    if (!cells.length) return;
    const opt = { style: 'iron', tex: TS.RAIL, ...o };
    this.deco.railEdges(cells, opt);
    // drops onto the side or the foot of a flight (railEdges leaves stair
    // neighbours alone): rail them too, except where the flight arrives
    const g = this.g, set = new Set(cells);
    for (const i of cells) {
      const x = i % g.w, z = (i / g.w) | 0, f = g.floor[i];
      for (let d = 0; d < 4; d++) {
        const nx = x + DIR_X[d], nz = z + DIR_Z[d];
        if (!g.in(nx, nz)) continue;
        const j = g.idx(nx, nz);
        if (set.has(j) || g.type[j] !== 1 || !(g.flags[j] & F.STAIR) || g.edgeBlocked(i, d)) continue;
        if (g.edgeFloor(j, OPP[d]) > f - 1.1) continue;
        g.setEdge(x, z, d, true);
        const side = d === 0 || d === 2 ? -1 : 1;
        if (d < 2) this.deco.railRun(x + (d === 0 ? 1 : 0), z, x + (d === 0 ? 1 : 0), z + 1, f, { ...opt, side });
        else this.deco.railRun(x, z + (d === 2 ? 1 : 0), x + 1, z + (d === 2 ? 1 : 0), f, { ...opt, side });
      }
    }
  }
  // a railed opening in the floor around the local rect (a stairwell): rails
  // on this room's cells along every side of the rect except `openSide`
  // (local direction of the side the flight is entered from at floor level)
  wellRails(a0, b0, a1, b1, y, openSides = [], o = {}) {
    const { fr, g, deco } = this;
    const sides = [[0, a1, b0, a1, b1], [1, a0, b0, a0, b1], [2, a0, b1, a1, b1], [3, a0, b0, a1, b0]];
    for (const [ld, sa0, sb0, sa1, sb1] of sides) {
      if (openSides.includes(ld)) continue;
      // cells just outside that side (on the room floor) with their edge toward the well
      const run = [];
      if (ld < 2) for (let b = sb0; b < sb1; b++) run.push([ld === 0 ? a1 : a0 - 1, b]);
      else for (let a = sa0; a < sa1; a++) run.push([a, ld === 2 ? b1 : b0 - 1]);
      let s0 = null;
      const flush = (k) => {
        if (s0 === null) return;
        const p0 = run[s0], p1 = run[k - 1];
        const ro = { style: o.style ?? 'iron', tex: o.tex ?? TS.RAIL, wallTex: o.wallTex };
        if (ld < 2) lrail(deco, fr, sa0, p0[1], sa0, p1[1] + 1, y, ro);
        else lrail(deco, fr, p0[0], sb0, p1[0] + 1, sb0, y, ro);
        s0 = null;
      };
      run.forEach(([a, b], k) => {
        const ok = this.mine(a, b) && Math.abs(this.fl(a, b) - y) < 0.05;
        if (ok) { ledge(g, fr, a, b, OPP[ld]); if (s0 === null) s0 = k; } else flush(k);
      });
      flush(run.length);
    }
  }
  ports(pred) { return this.r.ports.filter((p) => p.active && (!pred || pred(p))); }
  // wall segment [s0, s1) of local side ld clear of doorways (active or boarded) by margin m
  wallClear(ld, s0, s1, m = 1) {
    for (const p of this.r.ports) {
      if (p.dir !== ld || !(p.active || p.link.board || p.link.kind === 'bookcase')) continue;
      if (s0 < p.s1 + m && s1 > p.s0 - m) return false;
    }
    return true;
  }
  // local rect of a strip along wall ld: along [s0, s1), depth d (cells, may be fractional)
  strip(ld, s0, s1, d, inset = 0) {
    const { W, D } = this;
    if (ld === 1) return [inset, s0, inset + d, s1];
    if (ld === 0) return [W - inset - d, s0, W - inset, s1];
    if (ld === 3) return [s0, inset, s1, inset + d];
    return [s0, D - inset - d, s1, D - inset];
  }
  stripCells(ld, s0, s1, d) { const [a0, b0, a1, b1] = this.strip(ld, s0, s1, d); return [Math.floor(a0), Math.floor(b0), Math.ceil(a1), Math.ceil(b1)]; }
  // prop frame against wall ld (back on the wall, facing into the room)
  wallFrame(ld, s0, s1, d, inset = 0) { const [a0, b0, a1, b1] = this.strip(ld, s0, s1, d, inset); return pf(this.fr, a0, b0, a1, b1, OPP[ld]); }
  // length of wall side ld (along) and depth of the room across it
  wallLen(ld) { return ld < 2 ? this.D : this.W; }
  // free stretches of wall ld for a prop `len` long, `d` deep: list of s0
  wallSpots(ld, len, d, o = {}) {
    const out = [], L = this.wallLen(ld), m = o.margin ?? 1, y = o.y ?? this.y;
    for (let s = o.from ?? 0; s + len <= (o.to ?? L); s++) {
      if (!this.wallClear(ld, s, s + len, m)) continue;
      const [a0, b0, a1, b1] = this.stripCells(ld, s, s + len, d);
      if (!this.free(a0, b0, a1, b1, 0, y)) continue;
      out.push(s);
    }
    return out;
  }
  // place a prop against wall ld at a free spot near `want` (along); returns
  // the prop frame or null. fn(p) builds it.
  onWall(ld, len, d, fn, o = {}) {
    let spots = this.wallSpots(ld, len, d, o);
    if (!spots.length) return null;
    const want = o.want ?? (this.wallLen(ld) - len) / 2;
    spots.sort((x, y) => Math.abs(x - want) - Math.abs(y - want));
    if (o.random) spots = this.rng.shuffle(spots);
    let s = null;
    for (const c of spots) { const [a0, b0, a1, b1] = this.stripCells(ld, c, c + len, d); if (o.walk || this.keepsPath(a0, b0, a1, b1)) { s = c; break; } }
    if (s === null) return null;
    const [a0, b0, a1, b1] = this.stripCells(ld, s, s + len, d);
    this.use(a0, b0, a1, b1);
    const p = this.wallFrame(ld, s, s + len, o.depth ?? d, o.inset ?? 0);
    fn(p, s);
    return p;
  }
  // world centre of local cell (a, b) / of a point
  wx(a, b) { return this.fr.px(a, b); }
  wz(a, b) { return this.fr.pz(a, b); }
}

export { TS, FACE, F, DIR_X, DIR_Z, OPP };
