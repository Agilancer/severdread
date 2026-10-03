// Builds the static world mesh from the level grid.
// Vertex: pos3 uv2 normal3 info4(layer, light, emissive, scroll) = 12 floats.
import { OPEN, SKY_H, F } from './grid.js';

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
  // vertical wall between edge points L and R (x,z) from y0 to y1, facing n
  wall(L, R, y0, y1, uL, uR, n, layer, light, emissive = 0, scroll = 0) {
    if (y1 - y0 < 0.001) return;
    this.quad(
      [[L[0], y0, L[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [L[0], y1, L[1]]],
      [[uL, -y0], [uR, -y0], [uR, -y1], [uL, -y1]],
      n, layer, light, emissive, scroll,
    );
  }
  floorQuad(x, z, y, layer, lights, emissive = 0, scroll = 0, w = 1, d = 1) {
    this.quad(
      [[x, y, z], [x, y, z + d], [x + w, y, z + d], [x + w, y, z]],
      [[x, z], [x, z + d], [x + w, z + d], [x + w, z]],
      [0, 1, 0], layer, lights, emissive, scroll,
    );
  }
  ceilQuad(x, z, y, layer, lights, emissive = 0) {
    this.quad(
      [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]],
      [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]],
      [0, -1, 0], layer, [lights[0], lights[3], lights[2], lights[1]], emissive, 0,
    );
  }
  result() {
    return { verts: this.v.subarray(0, this.nv * 12), indices: this.i.subarray(0, this.ni), count: this.ni };
  }
}

// slots: [{layer, emissive, scroll}] indexed by grid texture slot numbers
export function buildWorldMesh(grid, slots, opts = {}) {
  const mb = new MeshBuilder(grid.w * grid.h * 3);
  const { w, h } = grid;
  const S = (k) => slots[k] || slots[0];
  const lightAt = (x, z) => (grid.in(x, z) ? grid.light[z * w + x] : 0);
  // corner light: average of open cells sharing the corner
  const cornerLight = (cx, cz) => {
    let s = 0, n = 0;
    for (const [x, z] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
      if (grid.in(x, z) && grid.type[z * w + x] === OPEN) { s += grid.light[z * w + x]; n++; }
    }
    return n ? s / n : 0.5;
  };
  const dirs = [
    { dx: 1, dz: 0, n: [-1, 0, 0], L: (x, z) => [x + 1, z], R: (x, z) => [x + 1, z + 1], u: (p) => p[1] },
    { dx: -1, dz: 0, n: [1, 0, 0], L: (x, z) => [x, z + 1], R: (x, z) => [x, z], u: (p) => -p[1] },
    { dx: 0, dz: 1, n: [0, 0, -1], L: (x, z) => [x + 1, z + 1], R: (x, z) => [x, z + 1], u: (p) => -p[0] },
    { dx: 0, dz: -1, n: [0, 0, 1], L: (x, z) => [x, z], R: (x, z) => [x + 1, z], u: (p) => p[0] },
  ];
  const roofOf = (i) => grid.ceil[i] + (opts.roofThickness ?? 0.6);
  const capDone = new Uint8Array(w * h);

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const a = z * w + x;
      if (grid.type[a] !== OPEN) continue;
      const fa = grid.floor[a], ca = grid.ceil[a], skyA = grid.sky[a];
      const voidA = grid.flags[a] & F.VOID;
      const la = grid.light[a];
      const cl = [cornerLight(x, z), cornerLight(x, z + 1), cornerLight(x + 1, z + 1), cornerLight(x + 1, z)];
      // floor
      if (!voidA) {
        const fs = S(grid.floorTex[a]);
        const scroll = (grid.flags[a] & F.SCROLL) ? (fs.scroll || -2) : fs.scroll || 0;
        mb.floorQuad(x, z, fa, fs.layer, cl, fs.emissive || 0, scroll);
      }
      // ceiling
      if (!skyA) {
        const cs = S(grid.ceilTex[a]);
        mb.ceilQuad(x, z, ca, cs.layer, cl, cs.emissive || 0);
      }
      // walls toward each neighbour
      for (const d of dirs) {
        const bx = x + d.dx, bz = z + d.dz;
        const L = d.L(x, z), R = d.R(x, z);
        const uL = d.u(L), uR = d.u(R);
        if (!grid.in(bx, bz)) {
          // map edge: draw a tall wall
          const ws = S(grid.wallTex[a]);
          mb.wall(L, R, voidA ? (opts.voidY ?? fa) - 2 : fa, skyA ? fa + 6 : ca, uL, uR, d.n, ws.layer, la, ws.emissive || 0, ws.scroll || 0);
          continue;
        }
        const b = bz * w + bx;
        const bot = voidA ? (opts.voidY ?? fa) : fa;
        if (grid.type[b] !== OPEN) {
          const ws = S(grid.wallTex[b]);
          const top = skyA ? Math.max(grid.floor[b], fa + 0.01) : ca;
          mb.wall(L, R, Math.min(bot, top), top, uL, uR, d.n, ws.layer, la, ws.emissive || 0, ws.scroll || 0);
          // cap on top of solid blocks visible from outdoors
          if (skyA && !capDone[b] && grid.floor[b] < SKY_H - 1) {
            capDone[b] = 1;
            const cs = S(grid.floorTex[b] || grid.wallTex[b]);
            mb.floorQuad(bx, bz, grid.floor[b], cs.layer, lightAt(bx, bz) || la, cs.emissive || 0);
          }
          continue;
        }
        const fb = grid.floor[b], cb = grid.ceil[b];
        const voidB = grid.flags[b] & F.VOID;
        // lower step (neighbour floor higher than ours)
        const myBottom = voidA ? (opts.voidY ?? fa) : fa;
        if (!voidB && fb > myBottom + 0.001) {
          const ws = S(grid.wallTex[b]);
          mb.wall(L, R, myBottom, Math.min(fb, skyA ? fb : ca), uL, uR, d.n, ws.layer, la, ws.emissive || 0, ws.scroll || 0);
        }
        // upper step (neighbour ceiling lower than ours)
        if (!grid.sky[b]) {
          if (!skyA && cb < ca - 0.001) {
            const ws = S(grid.wallTex[b]);
            mb.wall(L, R, Math.max(cb, fa), ca, uL, uR, d.n, ws.layer, la, ws.emissive || 0, ws.scroll || 0);
          } else if (skyA) {
            const ws = S(grid.wallTex[b]);
            const roof = roofOf(b);
            mb.wall(L, R, Math.max(cb, fa), roof, uL, uR, d.n, ws.layer, la, ws.emissive || 0, ws.scroll || 0);
            if (!capDone[b]) {
              capDone[b] = 1;
              const cs = S(grid.ceilTex[b]);
              mb.floorQuad(bx, bz, roof, cs.layer, lightAt(bx, bz), 0);
            }
          }
        }
      }
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
