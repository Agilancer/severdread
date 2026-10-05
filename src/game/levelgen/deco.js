// Detail geometry for levels: architecture and props built from textured
// boxes (pillars, trims, beams, crates, consoles, rails, lamps...). Each kind
// of object uses the texture role (TS slot) that fits it, so a crate always
// looks like a crate and a hand rail like metal / wood / stone.
//
// Output (level.deco):
//   boxes:     [{x0,y0,z0,x1,y1,z1, tex, uv:'world'|'fit', s, faces, emissive, lightMul}]
//   bars:      [{a:[x,y,z], b:[x,y,z], w, h, tex}]   sloped/long bars (stair hand rails)
//   colliders: [{x0,y0,z0,x1,y1,z1, shots}]          solid AABBs (player / monsters / projectiles)
//   lights:    [{x,y,z,color,radius,flicker,pulse}]  light sources added by fixtures
// Cells covered by solid deco get F.OBSTACLE | F.NOSPAWN so monster pathing
// and spawning avoid them. Rails set grid edge bits so pathing never crosses.
import { TS } from './common.js';
import { F, HAZ, OPEN, DIR_X, DIR_Z, OPP } from '../grid.js';
import { FACE } from '../worldmesh.js';

export { FACE };

export const RAIL_STYLES = ['metal', 'stone', 'wood', 'glass', 'neon', 'iron'];

export class Deco {
  constructor(g, theme, rng) {
    this.g = g;
    this.theme = theme;
    this.rng = rng;
    this.boxes = [];
    this.bars = [];
    this.colliders = [];
    this.lights = [];
    this.railStyle = theme?.railStyle || 'metal';
  }

  // ------------------------------------------------------------ primitives
  box(x0, y0, z0, x1, y1, z1, tex, o = {}) {
    const b = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), tex };
    if (o.uv) b.uv = o.uv;
    if (o.s) b.s = o.s;
    if (o.faces !== undefined) b.faces = o.faces;
    if (o.emissive) b.emissive = o.emissive;
    if (o.lightMul) b.lightMul = o.lightMul;
    this.boxes.push(b);
    if (o.solid) this.collider(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, { shots: o.shots ?? true, obstacle: o.obstacle ?? true });
    return b;
  }
  collider(x0, y0, z0, x1, y1, z1, o = {}) {
    const c = { x0, y0, z0, x1, y1, z1, shots: o.shots ?? true };
    this.colliders.push(c);
    if (o.obstacle !== false) this.markObstacle(x0, z0, x1, z1, y1);
    return c;
  }
  bar(a, b, w, h, tex) { this.bars.push({ a, b, w, h, tex }); }
  light(x, y, z, color, radius = 6, o = {}) { this.lights.push({ x, y, z, color, radius, flicker: !!o.flicker, pulse: !!o.pulse }); }

  // cells mostly covered by a tall solid become obstacles for pathing/spawning
  markObstacle(x0, z0, x1, z1, top) {
    const g = this.g;
    for (let z = Math.floor(z0); z <= Math.floor(z1 - 1e-6); z++) for (let x = Math.floor(x0); x <= Math.floor(x1 - 1e-6); x++) {
      if (!g.in(x, z)) continue;
      const i = g.idx(x, z);
      if (g.type[i] !== OPEN) continue;
      g.flags[i] |= F.NOSPAWN;
      const cover = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(z + 1, z1) - Math.max(z, z0));
      const centre = x0 <= x + 0.5 && x1 >= x + 0.5 && z0 <= z + 0.5 && z1 >= z + 0.5;
      if ((cover >= 0.3 || centre) && top > g.minFloor(i) + 0.55) g.flags[i] |= F.OBSTACLE;
    }
  }

  // Free = open, flat, not special, not already decorated, ceiling high enough.
  cellFree(x, z, needH = 2.2) {
    const g = this.g;
    if (!g.in(x, z)) return false;
    const i = g.idx(x, z);
    if (g.type[i] !== OPEN) return false;
    if (g.flags[i] & (F.VOID | F.PIT | F.HAZARD | F.DOOR | F.START | F.OBSTACLE | F.STAIR | F.BRIDGE | F.NOSPAWN)) return false;
    if (g.edge[i]) return false;
    if (!g.sky[i] && g.ceil[i] - g.floor[i] < needH) return false;
    return true;
  }
  // cell is free and all 8 neighbours are open at the same floor height
  cellInterior(x, z, needH = 2.2) {
    if (!this.cellFree(x, z, needH)) return false;
    const g = this.g, f = g.floor[g.idx(x, z)];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!g.isOpen(x + dx, z + dz)) return false;
      const j = g.idx(x + dx, z + dz);
      if (Math.abs(g.floor[j] - f) > 0.01 || (g.flags[j] & (F.DOOR | F.STAIR | F.VOID | F.PIT))) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ architecture
  // Square column with base and capital. size = shaft width.
  pillar(cx, cz, size, y0, y1, o = {}) {
    const h = size / 2, t = o.trim ?? true;
    const tex = o.tex ?? TS.PILLAR, trim = o.trimTex ?? TS.TRIM;
    const pad = t ? 0.09 : 0;
    this.box(cx - h, y0, cz - h, cx + h, y1, cz + h, tex, { faces: FACE.SIDES, s: o.s });
    if (t) {
      this.box(cx - h - pad, y0, cz - h - pad, cx + h + pad, y0 + 0.28, cz + h + pad, trim, { faces: FACE.SIDES | FACE.TOP });
      if (o.capital !== false) this.box(cx - h - pad, y1 - 0.3, cz - h - pad, cx + h + pad, y1, cz + h + pad, trim, { faces: FACE.SIDES | FACE.BOTTOM });
    }
    this.collider(cx - h - pad, y0, cz - h - pad, cx + h + pad, y1, cz + h + pad);
  }
  // Horizontal girder from (x0,z0) to (x1,z1) (axis-aligned) at height y (bottom).
  beam(x0, z0, x1, z1, y, w = 0.3, hgt = 0.4, tex = TS.BEAM) {
    const hw = w / 2;
    if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) this.box(Math.min(x0, x1), y, z0 - hw, Math.max(x0, x1), y + hgt, z0 + hw, tex);
    else this.box(x0 - hw, y, Math.min(z0, z1), x0 + hw, y + hgt, Math.max(z0, z1), tex);
  }

  // Wall trims around every open cell of `cells` (iterable of indices):
  // baseboard, optional wainscot panel + chair rail, crown band on tall walls.
  wallTrims(cells, o = {}) {
    const g = this.g;
    const base = o.base ?? 0.22, wain = o.wainscot ?? 0, crown = o.crown ?? true;
    const set = cells instanceof Set ? cells : new Set(cells);
    // gather edge runs per (dir, line, floor, ceil) for merging
    const runs = new Map();
    for (const i of set) {
      if (g.type[i] !== OPEN || (g.flags[i] & (F.VOID | F.PIT | F.STAIR))) continue;
      const x = i % g.w, z = (i / g.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIR_X[d], nz = z + DIR_Z[d];
        if (!g.in(nx, nz)) continue;
        const j = g.idx(nx, nz);
        const solid = g.type[j] !== OPEN;
        const ledge = !solid && g.minFloor(j) > g.floor[i] + 0.9 && !(g.flags[j] & F.STAIR);
        if (!solid && !ledge) continue;
        if (g.flags[i] & F.DOOR) continue;
        const line = d < 2 ? x + (d === 0 ? 1 : 0) : z + (d === 2 ? 1 : 0);
        const pos = d < 2 ? z : x;
        const top = solid ? (g.sky[i] ? Math.min(g.floor[j], g.floor[i] + 12) : g.ceil[i]) : g.minFloor(j);
        const key = `${d}|${line}|${g.floor[i].toFixed(2)}|${top.toFixed(2)}|${solid ? 1 : 0}`;
        let arr = runs.get(key); if (!arr) runs.set(key, (arr = []));
        arr.push(pos);
      }
    }
    for (const [key, arr] of runs) {
      const [ds, ls, fs, ts, ss] = key.split('|');
      const d = +ds, line = +ls, f = +fs, top = +ts, solid = ss === '1';
      arr.sort((a, b) => a - b);
      let s0 = arr[0], prev = arr[0];
      const flush = (a, b) => this._trimRun(d, line, a, b + 1, f, top, base, wain, crown && solid && top - f >= 3.4, o);
      for (let k = 1; k < arr.length; k++) {
        if (arr[k] !== prev + 1) { flush(s0, prev); s0 = arr[k]; }
        prev = arr[k];
      }
      flush(s0, prev);
    }
  }
  _trimRun(d, line, a, b, f, top, base, wain, crown, o) {
    // thin slab against the wall plane `line`, facing into the room (direction OPP[d])
    const t = 0.05;
    const slab = (y0, y1, tex, depth = t, faces) => {
      if (y1 - y0 < 0.02) return;
      if (d === 0) this.box(line - depth, y0, a, line, y1, b, tex, { faces: faces ?? (FACE.NX | FACE.TOP | FACE.BOTTOM) });
      else if (d === 1) this.box(line, y0, a, line + depth, y1, b, tex, { faces: faces ?? (FACE.PX | FACE.TOP | FACE.BOTTOM) });
      else if (d === 2) this.box(a, y0, line - depth, b, y1, line, tex, { faces: faces ?? (FACE.NZ | FACE.TOP | FACE.BOTTOM) });
      else this.box(a, y0, line, b, y1, line + depth, tex, { faces: faces ?? (FACE.PZ | FACE.TOP | FACE.BOTTOM) });
    };
    const lim = Math.min(top, f + 30);
    // interior skin: lets a 1-thick wall show an interior texture on this side
    if (o.skin !== undefined) {
      const inward = d === 0 ? FACE.NX : d === 1 ? FACE.PX : d === 2 ? FACE.NZ : FACE.PZ;
      slab(f + base, lim - (crown && lim < 40 ? 0.3 : 0), o.skin, 0.025, inward);
    }
    slab(f, Math.min(f + base, lim), o.baseTex ?? TS.TRIM, 0.06);
    if (wain > 0 && lim - f > wain + 0.6) {
      slab(f + base, f + wain, o.wainTex ?? TS.PANEL, 0.035);
      slab(f + wain, f + wain + 0.08, o.baseTex ?? TS.TRIM, 0.07);
    }
    if (crown && lim < 40) slab(lim - 0.3, lim, o.crownTex ?? TS.TRIM, 0.08);
  }

  // ------------------------------------------------------------ rails
  // Guard rail along a straight cell-edge line. Edge is between cells; the
  // rail runs from (x0,z0) to (x1,z1) on integer coordinates (axis aligned),
  // standing at height y. `side` (+1/-1) = which side of the line it sits on.
  railRun(x0, z0, x1, z1, y, o = {}) {
    const style = o.style || this.railStyle;
    const hgt = o.height ?? (style === 'stone' ? 0.95 : 1.0);
    const horiz = z0 === z1;
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    if (len < 0.01) return;
    const a = horiz ? Math.min(x0, x1) : Math.min(z0, z1), b = a + len;
    const off = (o.side ?? 0) * 0.06;  // nudge toward the walkable side
    const L = horiz ? z0 + off : x0 + off;
    const seg = (p0, p1, y0, y1, th, tex, opt = {}) => {
      if (horiz) this.box(p0, y0, L - th / 2, p1, y1, L + th / 2, tex, opt);
      else this.box(L - th / 2, y0, p0, L + th / 2, y1, p1, tex, opt);
    };
    const railTex = o.tex ?? TS.RAIL;
    if (style === 'stone') {
      // solid balustrade with a cap
      seg(a, b, y, y + hgt - 0.12, 0.26, o.wallTex ?? TS.SIDE);
      seg(a - 0.04, b + 0.04, y + hgt - 0.12, y + hgt, 0.34, TS.TRIM);
    } else {
      const posts = Math.max(1, Math.round(len / (style === 'glass' ? 1.5 : 1.0)));
      const pw = style === 'wood' ? 0.1 : 0.07;
      for (let k = 0; k <= posts; k++) {
        const p = a + (len * k) / posts;
        seg(p - pw / 2, p + pw / 2, y, y + hgt, pw, railTex, { faces: FACE.SIDES | FACE.TOP });
      }
      seg(a, b, y + hgt - 0.07, y + hgt, style === 'wood' ? 0.1 : 0.07, railTex);
      if (style === 'glass') seg(a, b, y + 0.12, y + hgt - 0.1, 0.03, TS.GLASS, { emissive: 0.15 });
      else if (style === 'neon') seg(a, b, y + 0.5, y + 0.55, 0.04, TS.LIGHT, { emissive: 1 });
      else {
        seg(a, b, y + hgt * 0.5 - 0.03, y + hgt * 0.5 + 0.03, 0.05, railTex);
        if (style === 'iron') for (let p = a + 0.25; p < b - 0.1; p += 0.25) seg(p - 0.02, p + 0.02, y, y + hgt, 0.03, railTex, { faces: FACE.SIDES });
      }
    }
    // collision: a thin solid fence (does not mark cells as obstacles; edge bits handle pathing)
    if (horiz) this.collider(a, y, L - 0.06, b, y + hgt, L + 0.06, { shots: false, obstacle: false });
    else this.collider(L - 0.06, y, a, L + 0.06, y + hgt, b, { shots: false, obstacle: false });
  }

  // Put guard rails on every edge of `cells` that drops away by more than
  // `drop` (or into a void / pit / lower hazard), except edges into `allow`
  // cells (stair tops, jump spots). Sets grid edge bits.
  railEdges(cells, o = {}) {
    const g = this.g;
    const drop = o.drop ?? 1.1;
    const allow = o.allow || null;
    const set = cells instanceof Set ? cells : new Set(cells);
    const runs = new Map();
    for (const i of set) {
      if (g.type[i] !== OPEN || (g.flags[i] & (F.VOID | F.PIT | F.DOOR))) continue;
      const x = i % g.w, z = (i / g.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIR_X[d], nz = z + DIR_Z[d];
        if (!g.in(nx, nz)) continue;
        const j = g.idx(nx, nz);
        if (g.type[j] !== OPEN || set.has(j) && !(g.flags[j] & (F.VOID | F.PIT))) continue;
        if (allow && allow.has(j)) continue;
        if (g.flags[j] & F.STAIR) continue;
        const myE = g.edgeFloor(i, d), nbE = g.edgeFloor(j, OPP[d]);
        const deep = (g.flags[j] & (F.VOID | F.PIT)) || (myE - nbE >= drop) || ((g.flags[j] & F.HAZARD) && myE - nbE > 0.2);
        if (!deep) continue;
        g.setEdge(x, z, d, true);
        const line = d < 2 ? x + (d === 0 ? 1 : 0) : z + (d === 2 ? 1 : 0);
        const pos = d < 2 ? z : x;
        const key = `${d}|${line}|${g.floor[i].toFixed(2)}`;
        let arr = runs.get(key); if (!arr) runs.set(key, (arr = []));
        arr.push(pos);
      }
    }
    for (const [key, arr] of runs) {
      const [ds, ls, fs] = key.split('|');
      const d = +ds, line = +ls, f = +fs;
      arr.sort((a, b) => a - b);
      let s0 = arr[0], prev = arr[0];
      const side = d === 0 || d === 2 ? -1 : 1;
      const flush = (a, b) => {
        if (d < 2) this.railRun(line, a, line, b + 1, f, { ...o, side });
        else this.railRun(a, line, b + 1, line, f, { ...o, side });
      };
      for (let k = 1; k < arr.length; k++) {
        if (arr[k] !== prev + 1) { flush(s0, prev); s0 = arr[k]; }
        prev = arr[k];
      }
      flush(s0, prev);
    }
  }

  // ------------------------------------------------------------ stairs
  // Build a straight flight of stairs: `width` cells wide, starting at cell
  // (x, z) (the lowest step row) and climbing toward `dir` from height y0 to
  // y1. rise per cell defaults to 0.6 (3 steps of 0.2). Returns the cells.
  // The cell after the flight (at y1) and before it (at y0) must be walkable.
  stairs(x, z, dir, width, y0, y1, o = {}) {
    const g = this.g;
    const total = y1 - y0;
    const per = o.rise ?? 0.6;
    const n = Math.max(1, Math.ceil(Math.abs(total) / per - 1e-6));
    const rise = total / n;
    const px = DIR_Z[dir] !== 0 ? 1 : 0, pz = DIR_X[dir] !== 0 ? 1 : 0;  // across the flight
    const cells = [];
    const up = total >= 0 ? dir : OPP[dir];
    for (let k = 0; k < n; k++) {
      for (let wdt = 0; wdt < width; wdt++) {
        const cx = x + DIR_X[dir] * k + px * wdt, cz = z + DIR_Z[dir] * k + pz * wdt;
        if (!g.in(cx, cz)) continue;
        const top = total >= 0 ? y0 + rise * (k + 1) : y0 + rise * k;
        const i = g.idx(cx, cz);
        const keepCeil = g.type[i] === OPEN && !g.sky[i] ? g.ceil[i] : (o.ceil ?? top + 3);
        const sky = g.type[i] === OPEN ? g.sky[i] : (o.sky ? 1 : 0);
        g.open(cx, cz, top, keepCeil, { sky: !!sky, floorTex: o.floorTex ?? TS.STAIR, wallTex: o.sideTex ?? TS.TRIM, light: o.light, region: o.region });
        g.setStair(cx, cz, up, top, Math.abs(rise));
        if (!sky && g.ceil[i] < top + 2.6) g.ceil[i] = top + 2.6;
        cells.push(i);
      }
    }
    if (o.rails !== false) this.stairRails(cells, o);
    return cells;
  }
  // Hand rails along the open sides of stair cells (sloped bars on posts), or
  // wall-mounted rails when the side is a wall.
  stairRails(cells, o = {}) {
    const g = this.g;
    const style = o.style || this.railStyle;
    const tex = style === 'wood' ? TS.WOOD : TS.RAIL;
    const set = new Set(cells);
    for (const i of cells) {
      const x = i % g.w, z = (i / g.w) | 0;
      const up = g.stairDir[i] - 1;
      if (up < 0) continue;
      const top = g.floor[i], low = top - g.rise[i];
      for (const side of up < 2 ? [2, 3] : [0, 1]) {
        const nx = x + DIR_X[side], nz = z + DIR_Z[side];
        if (!g.in(nx, nz)) continue;
        const j = g.idx(nx, nz);
        if (set.has(j)) continue;
        const wall = g.type[j] !== OPEN || g.minFloor(j) > top + 0.5;
        const dropSide = g.type[j] === OPEN && ((g.flags[j] & (F.VOID | F.PIT)) || g.floor[j] < low - 0.4);
        if (!wall && !dropSide && !o.alwaysRails) continue;
        // rail line position on the side edge
        const lineOff = wall ? 0.09 : 0.08;
        const sx = side === 0 ? x + 1 - lineOff : side === 1 ? x + lineOff : null;
        const sz = side === 2 ? z + 1 - lineOff : side === 3 ? z + lineOff : null;
        // endpoints along the ascent axis (low -> high)
        const along0 = up === 0 ? [x, z] : up === 1 ? [x + 1, z] : up === 2 ? [x, z] : [x, z + 1];
        const along1 = up === 0 ? [x + 1, z] : up === 1 ? [x, z] : up === 2 ? [x, z + 1] : [x, z];
        const A = [sx ?? along0[0], low + 0.95, sz ?? along0[1]];
        const B = [sx ?? along1[0], top + 0.95, sz ?? along1[1]];
        this.bar(A, B, 0.07, 0.07, tex);
        if (!wall) {
          // posts + mid rail + fence collider
          for (const P of [A, B]) {
            const py = P === A ? low : top;
            this.box(P[0] - 0.035, py, P[2] - 0.035, P[0] + 0.035, py + 0.95, P[2] + 0.035, tex, { faces: FACE.SIDES });
          }
          this.bar([A[0], A[1] - 0.45, A[2]], [B[0], B[1] - 0.45, B[2]], 0.05, 0.05, tex);
          g.setEdge(x, z, side, true);
          const cx0 = Math.min(A[0], B[0]) - 0.05, cx1 = Math.max(A[0], B[0]) + 0.05;
          const cz0 = Math.min(A[2], B[2]) - 0.05, cz1 = Math.max(A[2], B[2]) + 0.05;
          this.collider(cx0, low, cz0, cx1, top + 1.0, cz1, { shots: false, obstacle: false });
        } else {
          // wall brackets
          const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
          const bx = side < 2 ? (side === 0 ? 0.09 : -0.09) : 0, bz = side >= 2 ? (side === 2 ? 0.09 : -0.09) : 0;
          this.box(Math.min(m[0], m[0] + bx) - 0.02, m[1] - 0.08, Math.min(m[2], m[2] + bz) - 0.02, Math.max(m[0], m[0] + bx) + 0.02, m[1] - 0.02, Math.max(m[2], m[2] + bz) + 0.02, TS.METAL);
        }
      }
    }
  }

  // ------------------------------------------------------------ props
  crate(x, z, y, size = 0.9, tex = TS.CRATE) {
    const h = size / 2;
    this.box(x - h, y, z - h, x + h, y + size, z + h, tex, { uv: 'fit', solid: true });
    return y + size;
  }
  // a little pile of crates around (cx, cz), some stacked
  crateStack(cx, cz, y, o = {}) {
    const rng = this.rng;
    const n = o.count ?? rng.int(2, 4);
    const tex = o.tex ?? (rng.chance(0.7) ? TS.CRATE : TS.CRATE2);
    const big = rng.pick([0.8, 0.9, 1.0]);
    const spots = [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]];
    const used = [];
    for (let k = 0; k < Math.min(n, 4); k++) {
      const [ox, oz] = spots[k];
      const s = k === 0 ? big : rng.pick([0.5, 0.6, 0.7]);
      const px = cx - 0.25 + ox, pz = cz - 0.25 + oz;
      used.push(this.crate(px, pz, y, s * (k === 0 ? 1 : 1), tex));
    }
    if (rng.chance(0.5)) this.crate(cx - 0.2, cz - 0.2, y + big, rng.pick([0.5, 0.6]), tex);
  }
  // shipping container (3 x 1.3 x 1.3) along an axis
  container(x, z, y, alongX, o = {}) {
    const L = o.length ?? 3, W = 1.25, H = 1.3;
    const tex = o.tex ?? TS.CRATE2;
    if (alongX) this.box(x, y, z, x + L, y + H, z + W, tex, { solid: true, s: 1.3 });
    else this.box(x, y, z, x + W, y + H, z + L, tex, { solid: true, s: 1.3 });
  }
  // console/computer facing `dir` (0 +x, 1 -x, 2 +z, 3 -z), centred in cell (x,z)
  console(x, z, y, dir, o = {}) {
    const w = o.width ?? 0.9, d = 0.55;
    const cx = x + 0.5, cz = z + 0.5;
    const fx = DIR_X[dir], fz = DIR_Z[dir];
    const hw = w / 2, hd = d / 2;
    const ex = fx !== 0 ? hd : hw, ez = fz !== 0 ? hd : hw;
    const front = dir === 0 ? 'px' : dir === 1 ? 'nx' : dir === 2 ? 'pz' : 'nz';
    // desk body
    this.box(cx - ex, y, cz - ez, cx + ex, y + 0.85, cz + ez, { side: TS.METAL, top: TS.METAL, [front]: TS.MACHINE }, { solid: true, s: 1 });
    // screen panel at the back
    const bx = cx - fx * (hd - 0.08), bz = cz - fz * (hd - 0.08);
    const sx = fx !== 0 ? 0.08 : hw * 0.9, sz = fz !== 0 ? 0.08 : hw * 0.9;
    this.box(bx - sx, y + 0.85, bz - sz, bx + sx, y + 1.55, bz + sz, { side: TS.METAL, top: TS.METAL, [front]: TS.SCREEN }, { uv: 'fit' });
  }
  // emissive ceiling light panel + a light source
  lightPanel(x0, z0, x1, z1, y, color = [1, 0.95, 0.85], radius = 6) {
    this.box(x0, y - 0.06, z0, x1, y, z1, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
    this.light((x0 + x1) / 2, y - 0.3, (z0 + z1) / 2, color, radius);
  }
  // wall lamp / torch / sconce on the wall plane next to open cell (x,z) in direction d
  wallLight(x, z, d, y, color = [1, 0.8, 0.5], o = {}) {
    const lx = x + 0.5 + DIR_X[d] * 0.45, lz = z + 0.5 + DIR_Z[d] * 0.45;
    const w = DIR_X[d] !== 0 ? 0.1 : 0.32, dd = DIR_Z[d] !== 0 ? 0.1 : 0.32;
    this.box(lx - w / 2, y, lz - dd / 2, lx + w / 2, y + 0.22, lz + dd / 2, TS.LIGHT, { uv: 'fit', emissive: 1 });
    this.box(lx - w / 2 - 0.02, y - 0.06, lz - dd / 2 - 0.02, lx + w / 2 + 0.02, y, lz + dd / 2 + 0.02, TS.METAL);
    this.light(x + 0.5 + DIR_X[d] * 0.2, y + 0.1, z + 0.5 + DIR_Z[d] * 0.2, color, o.radius ?? 5, { flicker: o.flicker });
  }
  // street lamp at (x, z) world position
  streetLamp(x, z, y, o = {}) {
    const h = o.height ?? 4.2;
    this.box(x - 0.07, y, z - 0.07, x + 0.07, y + h, z + 0.07, TS.METAL, { faces: FACE.SIDES });
    this.box(x - 0.14, y, z - 0.14, x + 0.14, y + 0.35, z + 0.14, TS.METAL);
    const ax = o.armX ?? 0.6, az = o.armZ ?? 0;
    this.box(Math.min(x, x + ax) - 0.04, y + h - 0.08, Math.min(z, z + az) - 0.04, Math.max(x, x + ax) + 0.04, y + h, Math.max(z, z + az) + 0.04, TS.METAL);
    this.box(x + ax - 0.18, y + h - 0.16, z + az - 0.12, x + ax + 0.18, y + h - 0.05, z + az + 0.12, TS.LIGHT, { uv: 'fit', emissive: 1 });
    this.collider(x - 0.12, y, z - 0.12, x + 0.12, y + h, z + 0.12, { obstacle: false });
    this.light(x + ax, y + h - 0.4, z + az, o.color ?? [1, 0.85, 0.6], o.radius ?? 7);
  }
  // a pipe run along a wall at height y (axis aligned, square section)
  pipe(x0, z0, x1, z1, y, size = 0.22, tex = TS.PIPE) {
    const h = size / 2;
    if (z0 === z1) this.box(Math.min(x0, x1), y - h, z0 - h, Math.max(x0, x1), y + h, z0 + h, tex);
    else this.box(x0 - h, y - h, Math.min(z0, z1), x0 + h, y + h, Math.max(z0, z1), tex);
  }
  // simple car / truck body
  car(x, z, y, alongX, o = {}) {
    const L = o.length ?? 2.2, W = 1.05;
    const bodyTex = o.tex ?? TS.METAL;
    const [bx0, bz0, bx1, bz1] = alongX ? [x, z, x + L, z + W] : [x, z, x + W, z + L];
    this.box(bx0, y + 0.18, bz0, bx1, y + 0.75, bz1, bodyTex, { solid: true });
    // cabin
    const inset = 0.35;
    const [cx0, cz0, cx1, cz1] = alongX ? [bx0 + inset, bz0 + 0.08, bx1 - inset - 0.25, bz1 - 0.08] : [bx0 + 0.08, bz0 + inset, bx1 - 0.08, bz1 - inset - 0.25];
    this.box(cx0, y + 0.75, cz0, cx1, y + 1.2, cz1, { side: TS.GLASS, top: bodyTex }, { emissive: 0.1 });
    // wheels
    const wy = y, wh = 0.36;
    const wl = alongX ? [[bx0 + 0.3, bz0 - 0.03], [bx1 - 0.6, bz0 - 0.03], [bx0 + 0.3, bz1 - 0.15], [bx1 - 0.6, bz1 - 0.15]]
      : [[bx0 - 0.03, bz0 + 0.3], [bx0 - 0.03, bz1 - 0.6], [bx1 - 0.15, bz0 + 0.3], [bx1 - 0.15, bz1 - 0.6]];
    for (const [wx, wz] of wl) this.box(wx, wy, wz, wx + (alongX ? 0.3 : 0.18), wy + wh, wz + (alongX ? 0.18 : 0.3), TS.METAL, { lightMul: 0.35 });
  }
  // concrete / jersey barrier along an axis
  barrier(x0, z0, x1, z1, y, tex = TS.SIDE) {
    const t = 0.25;
    if (z0 === z1) this.box(Math.min(x0, x1), y, z0 - t, Math.max(x0, x1), y + 0.8, z0 + t, tex, { solid: true });
    else this.box(x0 - t, y, Math.min(z0, z1), x0 + t, y + 0.8, Math.max(z0, z1), tex, { solid: true });
  }
  // planter box with foliage
  planter(x, z, y, w = 1, d = 1) {
    this.box(x, y, z, x + w, y + 0.55, z + d, TS.SIDE, { solid: true });
    this.box(x + 0.06, y + 0.55, z + 0.06, x + w - 0.06, y + 1.1, z + d - 0.06, TS.FOLIAGE, { s: 1 });
  }
  // table with legs (solid as a whole)
  table(x, z, y, w = 1.2, d = 0.7, tex = TS.WOOD) {
    this.box(x, y + 0.72, z, x + w, y + 0.8, z + d, tex);
    for (const [lx, lz] of [[x + 0.05, z + 0.05], [x + w - 0.13, z + 0.05], [x + 0.05, z + d - 0.13], [x + w - 0.13, z + d - 0.13]]) {
      this.box(lx, y, lz, lx + 0.08, y + 0.72, lz + 0.08, tex, { faces: FACE.SIDES });
    }
    this.collider(x, y, z, x + w, y + 0.8, z + d);
  }
  // metal shelving unit with boxes on it, against a wall
  shelf(x0, z0, x1, z1, y, h = 2.2) {
    this.box(x0, y, z0, x1, y + h, z1, TS.METAL, { faces: FACE.TOP | FACE.SIDES, solid: true, lightMul: 0.8 });
    for (let k = 1; k <= 3; k++) {
      const sy = y + (h * k) / 4;
      this.box(x0 - 0.02, sy - 0.04, z0 - 0.02, x1 + 0.02, sy, z1 + 0.02, TS.METAL);
    }
  }
  // window strip on a wall face next to open cell (x,z) facing direction d (the wall side)
  window(x, z, d, y0, y1, o = {}) {
    const t = 0.03;
    const lineX = d === 0 ? x + 1 : d === 1 ? x : null, lineZ = d === 2 ? z + 1 : d === 3 ? z : null;
    const tex = o.tex ?? TS.GLASS;
    if (lineX !== null) {
      const s = d === 0 ? -1 : 1;
      this.box(Math.min(lineX, lineX + s * t), y0, z + 0.1, Math.max(lineX, lineX + s * t), y1, z + 0.9, tex, { uv: 'fit', emissive: o.emissive ?? 0.35, faces: d === 0 ? FACE.NX : FACE.PX });
      this.box(Math.min(lineX, lineX + s * 0.06), y0 - 0.08, z + 0.05, Math.max(lineX, lineX + s * 0.06), y0, z + 0.95, TS.TRIM);
    } else {
      const s = d === 2 ? -1 : 1;
      this.box(x + 0.1, y0, Math.min(lineZ, lineZ + s * t), x + 0.9, y1, Math.max(lineZ, lineZ + s * t), tex, { uv: 'fit', emissive: o.emissive ?? 0.35, faces: d === 2 ? FACE.NZ : FACE.PZ });
      this.box(x + 0.05, y0 - 0.08, Math.min(lineZ, lineZ + s * 0.06), x + 0.95, y0, Math.max(lineZ, lineZ + s * 0.06), TS.TRIM);
    }
  }

  // Remove everything (used when a decoration pass must be undone)
  mark() { return { b: this.boxes.length, r: this.bars.length, c: this.colliders.length, l: this.lights.length }; }
  rollback(m) { this.boxes.length = m.b; this.bars.length = m.r; this.colliders.length = m.c; this.lights.length = m.l; }

  result() { return { boxes: this.boxes, bars: this.bars, colliders: this.colliders, lights: this.lights }; }
}
