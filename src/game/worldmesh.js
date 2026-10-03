// Builds the static world mesh from the level grid (+ detail boxes).
// Vertex: pos3 uv2 normal3 info4(layer, light, emissive, scroll) = 12 floats.
import { OPEN, SKY_H, F, HAZ, OPP } from './grid.js';

export class MeshBuilder {
  constructor(capQuads = 4096) {
    this.v = new Float32Array(capQuads * 4 * 12);
    this.i = new Uint32Array(capQuads * 6);
    this.nv = 0; this.ni = 0;
  }
  _grow() {
    const v = new Float32Array(this.v.length * 2); v.set(this.v); this.v = v;
    const i = new Uint32Array(this.i.length * 2); i.set(this.i); this.i = i;
  }
  // corners in CCW order (BL, BR, TR, TL) as seen from the front
  quad(p, uv, n, layer, lights, emissive = 0, scroll = 0) {
    if ((this.nv + 4) * 12 > this.v.length || this.ni + 6 > this.i.length) this._grow();
    const base = this.nv;
    for (let k = 0; k < 4; k++) {
      const o = (this.nv + k) * 12;
      this.v[o] = p[k][0]; this.v[o + 1] = p[k][1]; this.v[o + 2] = p[k][2];
      this.v[o + 3] = uv[k][0]; this.v[o + 4] = uv[k][1];
      this.v[o + 5] = n[0]; this.v[o + 6] = n[1]; this.v[o + 7] = n[2];
      this.v[o + 8] = layer; this.v[o + 9] = typeof lights === 'number' ? lights : lights[k];
      this.v[o + 10] = emissive; this.v[o + 11] = scroll;
    }
    this.nv += 4;
    this.i[this.ni++] = base; this.i[this.ni++] = base + 1; this.i[this.ni++] = base + 2;
    this.i[this.ni++] = base; this.i[this.ni++] = base + 2; this.i[this.ni++] = base + 3;
  }
  // vertical wall between edge points L and R (x,z) from y0 to y1, facing n.
  // s = texture scale (world units per texture repeat)
  wall(L, R, y0, y1, uL, uR, n, layer, light, emissive = 0, scroll = 0, s = 1) {
    if (y1 - y0 < 0.001) return;
    this.quad(
      [[L[0], y0, L[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [L[0], y1, L[1]]],
      [[uL / s, -y0 / s], [uR / s, -y0 / s], [uR / s, -y1 / s], [uL / s, -y1 / s]],
      n, layer, light, emissive, scroll,
    );
  }
  floorQuad(x, z, y, layer, lights, emissive = 0, scroll = 0, w = 1, d = 1, s = 1) {
    this.quad(
      [[x, y, z], [x, y, z + d], [x + w, y, z + d], [x + w, y, z]],
      [[x / s, z / s], [x / s, (z + d) / s], [(x + w) / s, (z + d) / s], [(x + w) / s, z / s]],
      [0, 1, 0], layer, lights, emissive, scroll,
    );
  }
  ceilQuad(x, z, y, layer, lights, emissive = 0, w = 1, d = 1, s = 1) {
    const l = typeof lights === 'number' ? lights : [lights[0], lights[3], lights[2], lights[1]];
    this.quad(
      [[x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d]],
      [[x / s, z / s], [(x + w) / s, z / s], [(x + w) / s, (z + d) / s], [x / s, (z + d) / s]],
      [0, -1, 0], layer, l, emissive, 0,
    );
  }
  // triangle (as a degenerate quad), CCW seen from the front
  tri(a, b, c, uva, uvb, uvc, n, layer, light, emissive = 0) {
    this.quad([a, b, c, c], [uva, uvb, uvc, uvc], n, layer, light, emissive, 0);
  }
  result() {
    return { verts: this.v.subarray(0, this.nv * 12), indices: this.i.subarray(0, this.ni), count: this.ni };
  }
}

// Box faces bitmask (deco boxes)
export const FACE = { PX: 1, NX: 2, PZ: 4, NZ: 8, TOP: 16, BOTTOM: 32, ALL: 63, SIDES: 15 };

// Append an axis-aligned box. tex: slot number or {top, bottom, side, px, nx, pz, nz}.
// opts: uv 'world' (default; s = world units per repeat) or 'fit' (each face
// shows the texture s times), faces (FACE mask), light, emissive.
export function addBox(mb, b, S, light, opts = {}) {
  const { x0, y0, z0, x1, y1, z1 } = b;
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
  const t = b.tex;
  const slotOf = (face) => (typeof t === 'number' ? t : (t[face] ?? (face === 'top' || face === 'bottom' ? (t.top ?? t.side) : t.side) ?? t.top ?? 0));
  const faces = b.faces ?? FACE.ALL;
  const fit = b.uv === 'fit';
  const em = (sl) => Math.max(S(sl).emissive || 0, b.emissive || 0);
  const lit = b.light ?? light;
  const scale = (sl) => b.s ?? S(sl).uvScale ?? 1;
  const side = (mask, face, L, R, n, uL, uR) => {
    if (!(faces & mask)) return;
    const sl = slotOf(face), ss = S(sl), s = scale(sl);
    if (fit) {
      const w = s, hgt = s;
      mb.quad([[L[0], y0, L[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [L[0], y1, L[1]]],
        [[0, hgt], [w, hgt], [w, 0], [0, 0]], n, ss.layer, lit, em(sl), 0);
    } else {
      mb.wall(L, R, y0, y1, uL, uR, n, ss.layer, lit, em(sl), ss.scroll || 0, s);
    }
  };
  side(FACE.PX, 'px', [x1, z1], [x1, z0], [1, 0, 0], -z1, -z0);
  side(FACE.NX, 'nx', [x0, z0], [x0, z1], [-1, 0, 0], z0, z1);
  side(FACE.PZ, 'pz', [x0, z1], [x1, z1], [0, 0, 1], x0, x1);
  side(FACE.NZ, 'nz', [x1, z0], [x0, z0], [0, 0, -1], -x1, -x0);
  if (faces & FACE.TOP) {
    const sl = slotOf('top'), ss = S(sl), s = scale(sl);
    if (fit) mb.quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[0, 0], [0, s], [s, s], [s, 0]], [0, 1, 0], ss.layer, lit * 1.05, em(sl), 0);
    else mb.floorQuad(x0, z0, y1, ss.layer, lit * 1.05, em(sl), ss.scroll || 0, x1 - x0, z1 - z0, s);
  }
  if (faces & FACE.BOTTOM) {
    const sl = slotOf('bottom'), ss = S(sl), s = scale(sl);
    if (fit) mb.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[0, 0], [s, 0], [s, s], [0, s]], [0, -1, 0], ss.layer, lit * 0.8, em(sl), 0);
    else mb.ceilQuad(x0, z0, y0, ss.layer, lit * 0.8, em(sl), x1 - x0, z1 - z0, s);
  }
}

// Append a long bar from a to b (any direction, e.g. a sloped hand rail) with a
// w x h cross-section. Winding is fixed up per face so culling keeps it visible.
export function addBar(mb, bar, S, light) {
  const { a, b, w, h } = bar;
  const ss = S(bar.tex);
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const D = [dx / len, dy / len, dz / len];
  // horizontal perpendicular
  let P = [-D[2], 0, D[0]];
  let pl = Math.hypot(P[0], P[2]);
  if (pl < 1e-4) { P = [1, 0, 0]; pl = 1; }
  P = [P[0] / pl, 0, P[2] / pl];
  // up perpendicular = P x D
  const U = [P[1] * D[2] - P[2] * D[1], P[2] * D[0] - P[0] * D[2], P[0] * D[1] - P[1] * D[0]];
  if (U[1] < 0) { U[0] = -U[0]; U[1] = -U[1]; U[2] = -U[2]; }
  const off = (p, sp, su) => [p[0] + P[0] * sp + U[0] * su, p[1] + P[1] * sp + U[1] * su, p[2] + P[2] * sp + U[2] * su];
  const hw = w / 2, hh = h / 2;
  const faces = [
    { n: U, c: [[-hw, hh], [hw, hh]], lm: 1.05 },
    { n: [-U[0], -U[1], -U[2]], c: [[hw, -hh], [-hw, -hh]], lm: 0.7 },
    { n: P, c: [[hw, hh], [hw, -hh]], lm: 0.95 },
    { n: [-P[0], -P[1], -P[2]], c: [[-hw, -hh], [-hw, hh]], lm: 0.9 },
  ];
  const s = ss.uvScale || 1;
  for (const f of faces) {
    let pts = [off(a, f.c[0][0], f.c[0][1]), off(b, f.c[0][0], f.c[0][1]), off(b, f.c[1][0], f.c[1][1]), off(a, f.c[1][0], f.c[1][1])];
    const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
    const e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
    const cn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cn[0] * f.n[0] + cn[1] * f.n[1] + cn[2] * f.n[2] < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
    const uv = [[0, 0], [len / s, 0], [len / s, 0.1], [0, 0.1]];
    mb.quad(pts, uv, f.n, ss.layer, light * f.lm, ss.emissive || 0, 0);
  }
}

// slots: [{layer, emissive, scroll, uvScale}] indexed by grid texture slot numbers
// opts: voidY, voidPlane, deco {boxes}, bridgeDepth
export function buildWorldMesh(grid, slots, opts = {}) {
  const mb = new MeshBuilder(grid.w * grid.h * 3 + (opts.deco?.boxes?.length || 0) * 6);
  const { w, h } = grid;
  const S = (k) => slots[k] || slots[0];
  const sc = (s) => s.uvScale || 1;
  const lightAt = (x, z) => (grid.in(x, z) ? grid.light[z * w + x] : 0);
  // corner light: average of open cells sharing the corner
  const cornerLight = (cx, cz) => {
    let s = 0, n = 0;
    for (const [x, z] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
      if (grid.in(x, z) && grid.type[z * w + x] === OPEN) { s += grid.light[z * w + x]; n++; }
    }
    return n ? s / n : 0.5;
  };
  // per direction: neighbour offset, wall normal (facing back into this cell),
  // edge endpoints L/R as seen from inside the cell, u coordinate along the edge
  const dirs = [
    { dx: 1, dz: 0, n: [-1, 0, 0], L: (x, z) => [x + 1, z], R: (x, z) => [x + 1, z + 1], u: (p) => p[1] },
    { dx: -1, dz: 0, n: [1, 0, 0], L: (x, z) => [x, z + 1], R: (x, z) => [x, z], u: (p) => -p[1] },
    { dx: 0, dz: 1, n: [0, 0, -1], L: (x, z) => [x + 1, z + 1], R: (x, z) => [x, z + 1], u: (p) => -p[0] },
    { dx: 0, dz: -1, n: [0, 0, 1], L: (x, z) => [x, z], R: (x, z) => [x + 1, z], u: (p) => p[0] },
  ];
  const roofOf = (i) => (grid.roof && grid.roof[i] > grid.ceil[i] ? grid.roof[i] : grid.ceil[i] + (opts.roofThickness ?? 0.6));
  const capDone = new Uint8Array(w * h);
  const bridgeDepth = opts.bridgeDepth ?? 0.35;
  const isStair = (i) => grid.stairDir[i] !== 0;
  const voidOrPit = (i) => (grid.flags[i] & (F.VOID | F.PIT)) !== 0;
  const wallQuad = (L, R, y0, y1, uL, uR, n, slot, light) => {
    const ws = S(slot);
    mb.wall(L, R, y0, y1, uL, uR, n, ws.layer, light, ws.emissive || 0, ws.scroll || 0, sc(ws));
  };

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const a = z * w + x;
      if (grid.type[a] !== OPEN) continue;
      const fa = grid.floor[a], ca = grid.ceil[a], skyA = grid.sky[a];
      const voidA = grid.flags[a] & F.VOID;
      const stairA = isStair(a);
      const lowA = grid.minFloor(a);
      const la = grid.light[a];
      const cl = [cornerLight(x, z), cornerLight(x, z + 1), cornerLight(x + 1, z + 1), cornerLight(x + 1, z)];
      // floor
      if (stairA) {
        emitStair(a, x, z, cl);
      } else if (!voidA) {
        const fs = S(grid.floorTex[a]);
        const scroll = (grid.flags[a] & F.SCROLL) ? (fs.scroll || -2) : fs.scroll || 0;
        if (grid.flags[a] & F.UVROT) {
          const s = sc(fs);
          mb.quad([[x, fa, z], [x, fa, z + 1], [x + 1, fa, z + 1], [x + 1, fa, z]],
            [[z / s, x / s], [(z + 1) / s, x / s], [(z + 1) / s, (x + 1) / s], [z / s, (x + 1) / s]], [0, 1, 0], fs.layer, cl, fs.emissive || 0, scroll);
        } else mb.floorQuad(x, z, fa, fs.layer, cl, fs.emissive || 0, scroll, 1, 1, sc(fs));
        if (grid.hazType[a] === HAZ.SPIKES) emitSpikes(x, z, fa, la);
      }
      // thin bridge deck: underside
      if ((grid.flags[a] & F.BRIDGE) && !voidA) {
        const us = S(grid.wallTex[a]);
        mb.ceilQuad(x, z, fa - bridgeDepth, us.layer, la * 0.7, us.emissive || 0, 1, 1, sc(us));
      }
      // ceiling
      if (!skyA) {
        const cs = S(grid.ceilTex[a]);
        mb.ceilQuad(x, z, ca, cs.layer, cl, cs.emissive || 0, 1, 1, sc(cs));
      }
      // walls toward each neighbour
      for (let k = 0; k < 4; k++) {
        const d = dirs[k];
        const bx = x + d.dx, bz = z + d.dz;
        const L = d.L(x, z), R = d.R(x, z);
        const uL = d.u(L), uR = d.u(R);
        const myEdge = grid.edgeFloor(a, k);
        const bot = voidA ? (opts.voidY ?? fa) : stairA ? lowA : fa;
        if (!grid.in(bx, bz)) {
          // map edge: draw a tall wall
          wallQuad(L, R, voidA ? (opts.voidY ?? fa) - 2 : bot, skyA ? fa + 6 : ca, uL, uR, d.n, grid.wallTex[a], la);
          continue;
        }
        const b = bz * w + bx;
        if (grid.type[b] !== OPEN) {
          const top = skyA ? Math.max(grid.floor[b], fa + 0.01) : ca;
          wallQuad(L, R, Math.min(bot, top), top, uL, uR, d.n, grid.wallTex[b], la);
          // cap on top of solid blocks visible from outdoors
          if (skyA && !capDone[b] && grid.floor[b] < SKY_H - 1) {
            capDone[b] = 1;
            const cs = S(grid.floorTex[b] || grid.wallTex[b]);
            mb.floorQuad(bx, bz, grid.floor[b], cs.layer, lightAt(bx, bz) || la, cs.emissive || 0, 0, 1, 1, sc(cs));
          }
          continue;
        }
        const cb = grid.ceil[b];
        const voidB = grid.flags[b] & F.VOID;
        const stairB = isStair(b);
        const stairSideB = stairB && (((grid.stairDir[b] - 1) >> 1) !== (k >> 1));
        // lower step (neighbour floor higher than ours at the shared edge)
        if (stairA && ((grid.stairDir[a] - 1) >> 1) !== (k >> 1)) {
          // our own stair side: stepped faces (drawn below)
          emitStairSide(a, x, z, k, b, L, R, uL, uR, d.n, la);
        } else if (!voidB && !stairSideB) {
          const fbEdge = grid.edgeFloor(b, OPP[k]);
          const myBottom = voidA ? (opts.voidY ?? fa) : myEdge;
          if (fbEdge > myBottom + 0.001) {
            // thin deck: a bridge seen from a void/pit only shows its edge
            const y0 = (grid.flags[b] & F.BRIDGE) && (voidA || voidOrPit(a)) ? Math.max(myBottom, fbEdge - bridgeDepth) : myBottom;
            wallQuad(L, R, y0, Math.min(fbEdge, skyA ? fbEdge : ca), uL, uR, d.n, grid.wallTex[b], la);
          }
        }
        // upper step (neighbour ceiling lower than ours)
        if (!grid.sky[b]) {
          if (!skyA && cb < ca - 0.001) {
            wallQuad(L, R, Math.max(cb, fa), ca, uL, uR, d.n, grid.wallTex[b], la);
          } else if (skyA) {
            const roof = roofOf(b);
            wallQuad(L, R, Math.max(cb, fa), roof, uL, uR, d.n, grid.wallTex[b], la);
            if (!capDone[b]) {
              capDone[b] = 1;
              const cs = S(grid.ceilTex[b]);
              mb.floorQuad(bx, bz, roof, cs.layer, lightAt(bx, bz), 0, 0, 1, 1, sc(cs));
            }
          }
        }
      }
    }
  }

  // ---- stairs: N steps across the cell along the ascent direction
  function stairSteps(a) {
    const rise = grid.rise[a];
    return Math.max(2, Math.min(8, Math.round(rise / 0.2)));
  }
  // sub-rectangle of cell (x,z) covering t in [t0,t1] along the ascent direction
  function stairRect(x, z, up, t0, t1) {
    switch (up) {
      case 0: return [x + t0, z, t1 - t0, 1];
      case 1: return [x + 1 - t1, z, t1 - t0, 1];
      case 2: return [x, z + t0, 1, t1 - t0];
      default: return [x, z + 1 - t1, 1, t1 - t0];
    }
  }
  function emitStair(a, x, z, cl) {
    const up = grid.stairDir[a] - 1;
    const top = grid.floor[a], rise = grid.rise[a], low = top - rise;
    const n = stairSteps(a);
    const ts = S(grid.floorTex[a]), rs = S(grid.wallTex[a]);
    const light = (cl[0] + cl[1] + cl[2] + cl[3]) / 4;
    const d = dirs[up];
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const y = low + rise * (k + 1) / n, yPrev = low + rise * k / n;
      // tread
      const [rx, rz, rw, rd] = stairRect(x, z, up, t0, t1);
      mb.floorQuad(rx, rz, y, ts.layer, light * (0.94 + 0.08 * t1), ts.emissive || 0, 0, rw, rd, sc(ts));
      // riser at t0, facing down the stairs (like a wall seen looking up-stairs)
      let L, R;
      if (up === 0) { L = [x + t0, z]; R = [x + t0, z + 1]; }
      else if (up === 1) { L = [x + 1 - t0, z + 1]; R = [x + 1 - t0, z]; }
      else if (up === 2) { L = [x + 1, z + t0]; R = [x, z + t0]; }
      else { L = [x, z + 1 - t0]; R = [x + 1, z + 1 - t0]; }
      mb.wall(L, R, yPrev, y, d.u(L), d.u(R), d.n, rs.layer, light * 0.82, rs.emissive || 0, 0, sc(rs));
    }
  }
  // stepped side face of stair cell a toward perpendicular neighbour direction k
  function emitStairSide(a, x, z, k, b, Ledge, Redge, uLe, uRe, nrm, la) {
    const up = grid.stairDir[a] - 1;
    const top = grid.floor[a], rise = grid.rise[a], low = top - rise;
    const n = stairSteps(a);
    const bOpen = grid.type[b] === OPEN;
    if (!bOpen) return; // solid neighbours draw a full wall down to our lowest point
    const fb = (grid.flags[b] & F.VOID) ? (opts.voidY ?? low) - 1 : grid.edgeFloor(b, OPP[k]);
    const ws = S(grid.wallTex[a]), wb = S(grid.wallTex[b]);
    const d = dirs[k];
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n;
      const y = low + rise * (s + 1) / n;
      const [rx, rz, rw, rd] = stairRect(x, z, up, t0, t1);
      // sub-edge of this strip on side k, ordered like dirs[k].L/R
      let L, R;
      if (k === 0) { L = [x + 1, rz]; R = [x + 1, rz + rd]; }
      else if (k === 1) { L = [x, rz + rd]; R = [x, rz]; }
      else if (k === 2) { L = [rx + rw, z + 1]; R = [rx, z + 1]; }
      else { L = [rx, z]; R = [rx + rw, z]; }
      const uL = d.u(L), uR = d.u(R);
      if (fb > y + 0.001) {
        // neighbour higher than this step: its face, from our step up to its floor
        mb.wall(L, R, y, Math.min(fb, grid.sky[a] ? fb : grid.ceil[a]), uL, uR, nrm, wb.layer, la, wb.emissive || 0, 0, sc(wb));
      } else if (fb < y - 0.001) {
        // we are higher: stringer face seen from the neighbour (facing outward)
        mb.wall(R, L, fb, y, uR, uL, [-nrm[0], 0, -nrm[2]], ws.layer, grid.light[b] || la, ws.emissive || 0, 0, sc(ws));
      }
    }
  }
  // ---- spikes: a 3x3 field of pyramids
  function emitSpikes(x, z, y, light) {
    const ss = S(opts.spikeSlot ?? 30);
    const n = 3, hgt = 0.55, r = 0.16;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = x + (i + 0.5) / n + ((j & 1) ? 0.06 : -0.06), cz = z + (j + 0.5) / n;
      const ap = [cx, y + hgt * (0.8 + 0.4 * (((i * 7 + j * 3 + x + z) % 5) / 5)), cz];
      const c = [[cx - r, y, cz - r], [cx + r, y, cz - r], [cx + r, y, cz + r], [cx - r, y, cz + r]];
      // four faces, CCW seen from outside
      mb.tri(c[1], c[0], ap, [1, 1], [0, 1], [0.5, 0], [0, 0.5, -1], ss.layer, light * 0.9, ss.emissive || 0);
      mb.tri(c[2], c[1], ap, [1, 1], [0, 1], [0.5, 0], [1, 0.5, 0], ss.layer, light, ss.emissive || 0);
      mb.tri(c[3], c[2], ap, [1, 1], [0, 1], [0.5, 0], [0, 0.5, 1], ss.layer, light * 1.05, ss.emissive || 0);
      mb.tri(c[0], c[3], ap, [1, 1], [0, 1], [0.5, 0], [-1, 0.5, 0], ss.layer, light * 0.95, ss.emissive || 0);
    }
  }

  // ---- detail boxes (pillars, trims, crates, consoles, rails, beams...)
  const boxes = opts.deco?.boxes;
  if (boxes) {
    for (const b of boxes) {
      const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2);
      let light = lightAt(cx, cz);
      if (!grid.isOpen(cx, cz)) {
        // inside a wall cell: borrow the brightest open neighbour
        light = 0;
        for (const [nx, nz] of grid.neighbors(cx, cz)) if (grid.isOpen(nx, nz)) light = Math.max(light, lightAt(nx, nz));
        if (!light) light = 0.6;
      }
      addBox(mb, b, S, light * (b.lightMul ?? 1));
    }
  }

  const bars = opts.deco?.bars;
  if (bars) {
    for (const b of bars) {
      const cx = Math.floor((b.a[0] + b.b[0]) / 2), cz = Math.floor((b.a[2] + b.b[2]) / 2);
      addBar(mb, b, S, grid.isOpen(cx, cz) ? lightAt(cx, cz) : 0.7);
    }
  }

  // void plane far below (road, lava sea, clouds...)
  if (opts.voidPlane) {
    const vp = opts.voidPlane;
    const m = 80;
    mb.floorQuad(-m, -m, vp.y, vp.layer, vp.light ?? 0.9, vp.emissive || 0, vp.scroll || 0, w + 2 * m, h + 2 * m);
  }
  return mb.result();
}
