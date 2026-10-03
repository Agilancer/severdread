// The level is a height-field grid. Every cell has a floor and ceiling height;
// solid cells are walls. This supports stairs, ledges, pits, bridges over
// voids, vehicle tops, rooftops and outdoor areas (sky) while staying cheap
// to collide against and to build a mesh from.

export const F = {
  HAZARD: 1,      // damages while standing on it (lava/acid/water)
  VOID: 2,        // bottomless: falling in respawns you at the last safe spot
  DOOR: 4,
  NOSPAWN: 8,
  ARENA: 16,      // boss arena
  BRIDGE: 32,
  START: 64,
  NOCEIL_WALK: 128, // wall-walkers may not use this ceiling
  WATER: 256,     // shallow water (slows, no damage)
  SCROLL: 512,    // floor texture scrolls (conveyor / vehicles)
};

export const SKY_H = 64;   // ceiling height used for sky cells
export const SOLID = 0, OPEN = 1;

export class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.type = new Uint8Array(n);          // 0 solid, 1 open
    this.floor = new Float32Array(n);       // walkable height; for solid cells = wall top
    this.ceil = new Float32Array(n).fill(3);
    this.sky = new Uint8Array(n);
    this.wallTex = new Uint8Array(n);       // texture slot for this cell's walls / step faces
    this.floorTex = new Uint8Array(n);
    this.ceilTex = new Uint8Array(n);
    this.light = new Float32Array(n).fill(0.7);
    this.flags = new Uint16Array(n);
    this.region = new Int16Array(n).fill(-1);
    this.wallTop = 4;                       // default top for solid cells next to sky
    this.floor.fill(this.wallTop);
  }
  idx(x, z) { return z * this.w + x; }
  in(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }
  isOpen(x, z) { return this.in(x, z) && this.type[z * this.w + x] === OPEN; }
  open(x, z, floor = 0, ceil = 3, opts = {}) {
    if (!this.in(x, z)) return;
    const i = z * this.w + x;
    this.type[i] = OPEN;
    this.floor[i] = floor;
    this.ceil[i] = opts.sky ? SKY_H : ceil;
    this.sky[i] = opts.sky ? 1 : 0;
    if (opts.floorTex !== undefined) this.floorTex[i] = opts.floorTex;
    if (opts.ceilTex !== undefined) this.ceilTex[i] = opts.ceilTex;
    if (opts.wallTex !== undefined) this.wallTex[i] = opts.wallTex;
    if (opts.light !== undefined) this.light[i] = opts.light;
    if (opts.region !== undefined) this.region[i] = opts.region;
    if (opts.flags !== undefined) this.flags[i] |= opts.flags;
  }
  solid(x, z, top, wallTex) {
    if (!this.in(x, z)) return;
    const i = z * this.w + x;
    this.type[i] = SOLID;
    this.flags[i] = 0;
    this.sky[i] = 0;
    if (top !== undefined) this.floor[i] = top;
    if (wallTex !== undefined) this.wallTex[i] = wallTex;
  }
  rect(x0, z0, w, h, fn) {
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) if (this.in(x, z)) fn(x, z, z * this.w + x);
  }
  // cell lookup by world position (cells are 1x1 units)
  cellAt(wx, wz) {
    const x = Math.floor(wx), z = Math.floor(wz);
    if (!this.in(x, z)) return -1;
    return z * this.w + x;
  }
  floorAt(wx, wz) {
    const i = this.cellAt(wx, wz);
    if (i < 0 || this.type[i] !== OPEN) return Infinity;
    return this.floor[i];
  }
  ceilAt(wx, wz) {
    const i = this.cellAt(wx, wz);
    if (i < 0 || this.type[i] !== OPEN) return -Infinity;
    return this.ceil[i];
  }
  // 4-neighbourhood
  neighbors(x, z) {
    return [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]].filter(([a, b]) => this.in(a, b));
  }
  // Can a walker go from cell a to b? (step = max climb incl. jumping)
  passable(a, b, step = 1.05, clearance = 0.85, allowVoid = false) {
    if (this.type[b] !== OPEN) return false;
    const fb = this.flags[b];
    if (!allowVoid && (fb & F.VOID)) return false;
    if (this.floor[b] - this.floor[a] > step) return false;
    if (this.ceil[b] - this.floor[b] < clearance) return false;
    if (Math.min(this.ceil[a], this.ceil[b]) - Math.max(this.floor[a], this.floor[b]) < clearance) return false;
    return true;
  }
  // BFS distance field from a set of start cells
  bfs(starts, opts = {}) {
    const n = this.w * this.h;
    const dist = new Int32Array(n).fill(-1);
    const q = new Int32Array(n);
    let qh = 0, qt = 0;
    for (const s of starts) { if (s >= 0 && dist[s] < 0) { dist[s] = 0; q[qt++] = s; } }
    const step = opts.step ?? 1.05;
    const blocked = opts.blocked;
    while (qh < qt) {
      const a = q[qh++];
      const ax = a % this.w, az = (a / this.w) | 0;
      const d = dist[a] + 1;
      if (opts.maxDist && d > opts.maxDist) continue;
      for (let k = 0; k < 4; k++) {
        const bx = ax + (k === 0 ? 1 : k === 1 ? -1 : 0), bz = az + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (bx < 0 || bz < 0 || bx >= this.w || bz >= this.h) continue;
        const b = bz * this.w + bx;
        if (opts.jumpGap && this.type[b] === OPEN && (this.flags[b] & F.VOID)) {
          // leap across a void gap to a landing cell up to jumpGap cells away
          const dx = bx - ax, dz = bz - az;
          for (let s = 2; s <= opts.jumpGap + 1; s++) {
            const cx = ax + dx * s, cz = az + dz * s;
            if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) break;
            const c = cz * this.w + cx;
            if (this.type[c] !== OPEN) break;
            if (this.flags[c] & F.VOID) continue;
            if (dist[c] < 0 && this.floor[c] - this.floor[a] <= (s === 2 ? 0.9 : 0.6) && !(blocked && blocked(c))) {
              dist[c] = d + s - 1;
              q[qt++] = c;
            }
            break;
          }
        }
        if (dist[b] >= 0) continue;
        if (blocked && blocked(b)) continue;
        if (!this.passable(a, b, step, 0.85, opts.allowVoid)) continue;
        dist[b] = d;
        q[qt++] = b;
      }
    }
    return dist;
  }
}
