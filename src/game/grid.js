// The level is a height-field grid. Every cell has a floor and ceiling height;
// solid cells are walls. This supports stairs, ledges, pits, bridges over
// voids, vehicle tops, rooftops and outdoor areas (sky) while staying cheap
// to collide against and to build a mesh from.
//
// On top of the plain height field:
//  - stair cells: physically a ramp across the cell, drawn as real steps.
//    floor[i] is the TOP (high end) of the stair; rise[i] is the height
//    gained across the cell; stairDir[i] = 1 + DIR of ascent (0 = no stair).
//    Use floorAtPos()/edgeFloor()/minFloor() instead of floor[] whenever the
//    exact walking height matters.
//  - hazType: what a hazard cell does (lava burns, poison, spikes, water).
//  - edge bits: blocked cell edges (hand rails, guard rails, fences, glass).
//  - level.deco (see levelgen/deco.js): detail boxes and AABB colliders.

export const F = {
  HAZARD: 1,      // damages while standing on it (see hazType)
  VOID: 2,        // bottomless: falling in respawns you at the last safe spot
  DOOR: 4,
  NOSPAWN: 8,
  ARENA: 16,      // boss arena
  BRIDGE: 32,     // thin deck (drawn with a shallow underside, not a pillar)
  START: 64,
  NOCEIL_WALK: 128, // wall-walkers may not use this ceiling
  WATER: 256,     // shallow water (slows, no damage)
  SCROLL: 512,    // floor texture scrolls (conveyor / vehicles)
  PIT: 1024,      // deep pit with a visible (usually hazardous) bottom: rescue after landing
  OBSTACLE: 2048, // a solid deco collider covers this cell: monsters path around it
  STAIR: 4096,    // stair cell (see stairDir / rise)
  OUTDOOR: 8192,  // street / courtyard / open air ground (for decoration + lighting)
  UVROT: 16384,   // floor texture rotated 90 degrees (roads running along z)
};

// Hazard types (per cell, meaningful with F.HAZARD or F.PIT)
export const HAZ = { NONE: 0, LAVA: 1, POISON: 2, SPIKES: 3, WATER: 4 };
export const HAZ_NAMES = ['none', 'lava', 'poison', 'spikes', 'water'];

// Cardinal directions: 0 +x, 1 -x, 2 +z, 3 -z
export const DIR_X = [1, -1, 0, 0];
export const DIR_Z = [0, 0, 1, -1];
export const OPP = [1, 0, 3, 2];
export const EDGE_BIT = [1, 2, 4, 8];

export const SKY_H = 64;   // ceiling height used for sky cells
export const SOLID = 0, OPEN = 1;

export class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.type = new Uint8Array(n);          // 0 solid, 1 open
    this.floor = new Float32Array(n);       // walkable height (stairs: top end); for solid cells = wall top
    this.ceil = new Float32Array(n).fill(3);
    this.sky = new Uint8Array(n);
    this.wallTex = new Uint8Array(n);       // texture slot for this cell's walls / step faces
    this.floorTex = new Uint8Array(n);
    this.ceilTex = new Uint8Array(n);
    this.light = new Float32Array(n).fill(0.7);
    this.flags = new Uint16Array(n);
    this.region = new Int16Array(n).fill(-1);
    this.hazType = new Uint8Array(n);       // HAZ.*
    this.stairDir = new Uint8Array(n);      // 0 none, else 1 + direction of ascent
    this.rise = new Float32Array(n);        // stair cells: height gained across the cell
    this.edge = new Uint8Array(n);          // blocked edges: EDGE_BIT[dir]
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
    this.stairDir[i] = 0; this.rise[i] = 0;
    this.flags[i] &= ~F.STAIR;
    if (opts.floorTex !== undefined) this.floorTex[i] = opts.floorTex;
    if (opts.ceilTex !== undefined) this.ceilTex[i] = opts.ceilTex;
    if (opts.wallTex !== undefined) this.wallTex[i] = opts.wallTex;
    if (opts.light !== undefined) this.light[i] = opts.light;
    if (opts.region !== undefined) this.region[i] = opts.region;
    if (opts.flags !== undefined) this.flags[i] |= opts.flags;
    if (opts.haz !== undefined) this.hazType[i] = opts.haz;
  }
  solid(x, z, top, wallTex) {
    if (!this.in(x, z)) return;
    const i = z * this.w + x;
    this.type[i] = SOLID;
    this.flags[i] = 0;
    this.sky[i] = 0;
    this.hazType[i] = 0;
    this.stairDir[i] = 0; this.rise[i] = 0;
    this.clearEdges(x, z);
    if (top !== undefined) this.floor[i] = top;
    if (wallTex !== undefined) this.wallTex[i] = wallTex;
  }
  rect(x0, z0, w, h, fn) {
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) if (this.in(x, z)) fn(x, z, z * this.w + x);
  }

  // ---------------------------------------------------------------- stairs
  // Make (x, z) a stair cell climbing toward `dir`: its low edge (opposite
  // dir) is at top - rise, its high edge (toward dir) at top.
  setStair(x, z, dir, top, rise) {
    if (!this.in(x, z)) return;
    const i = z * this.w + x;
    this.type[i] = OPEN;
    this.floor[i] = top;
    this.rise[i] = rise;
    this.stairDir[i] = dir + 1;
    this.flags[i] |= F.STAIR | F.NOSPAWN;
    if (!this.sky[i] && this.ceil[i] < top + 2.2) this.ceil[i] = top + 2.2;
  }
  isStair(i) { return this.stairDir[i] !== 0; }
  // lowest walkable point of a cell
  minFloor(i) { return this.stairDir[i] ? this.floor[i] - this.rise[i] : this.floor[i]; }
  // floor height at the middle of cell i's edge facing `dir`
  edgeFloor(i, dir) {
    const sd = this.stairDir[i];
    if (!sd) return this.floor[i];
    const up = sd - 1;
    if (dir === up) return this.floor[i];
    if (dir === OPP[up]) return this.floor[i] - this.rise[i];
    return this.floor[i] - this.rise[i] * 0.5;
  }
  // exact floor height of cell i at world position (wx, wz) (clamped into the cell)
  floorAtPos(i, wx, wz) {
    const sd = this.stairDir[i];
    if (!sd) return this.floor[i];
    const x = i % this.w, z = (i / this.w) | 0;
    const lx = Math.min(1, Math.max(0, wx - x)), lz = Math.min(1, Math.max(0, wz - z));
    const up = sd - 1;
    const t = up === 0 ? lx : up === 1 ? 1 - lx : up === 2 ? lz : 1 - lz;
    return this.floor[i] - this.rise[i] * (1 - t);
  }

  // ---------------------------------------------------------------- edges (rails)
  setEdge(x, z, dir, on = true) {
    if (!this.in(x, z)) return;
    const i = z * this.w + x;
    if (on) this.edge[i] |= EDGE_BIT[dir]; else this.edge[i] &= ~EDGE_BIT[dir];
    const nx = x + DIR_X[dir], nz = z + DIR_Z[dir];
    if (!this.in(nx, nz)) return;
    const j = nz * this.w + nx;
    if (on) this.edge[j] |= EDGE_BIT[OPP[dir]]; else this.edge[j] &= ~EDGE_BIT[OPP[dir]];
  }
  clearEdges(x, z) { for (let d = 0; d < 4; d++) if (this.edge[z * this.w + x] & EDGE_BIT[d]) this.setEdge(x, z, d, false); }
  edgeBlocked(i, dir) { return (this.edge[i] & EDGE_BIT[dir]) !== 0; }

  // cell lookup by world position (cells are 1x1 units)
  cellAt(wx, wz) {
    const x = Math.floor(wx), z = Math.floor(wz);
    if (!this.in(x, z)) return -1;
    return z * this.w + x;
  }
  floorAt(wx, wz) {
    const i = this.cellAt(wx, wz);
    if (i < 0 || this.type[i] !== OPEN) return Infinity;
    return this.floorAtPos(i, wx, wz);
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
  // direction from cell a to its 4-neighbour b (-1 if not adjacent)
  dirTo(a, b) {
    const d = b - a;
    if (d === 1 && (a % this.w) !== this.w - 1) return 0;
    if (d === -1 && (a % this.w) !== 0) return 1;
    if (d === this.w) return 2;
    if (d === -this.w) return 3;
    return -1;
  }
  // Can a walker go from cell a to its 4-neighbour b? (step = max climb incl. jumping)
  passable(a, b, step = 1.05, clearance = 0.85, allowVoid = false, dir) {
    if (this.type[b] !== OPEN) return false;
    const fb = this.flags[b];
    if (!allowVoid && (fb & F.VOID)) return false;
    const d = dir ?? this.dirTo(a, b);
    if (d < 0) return false;
    if (this.edge[a] & EDGE_BIT[d]) return false;
    const ea = this.edgeFloor(a, d), eb = this.edgeFloor(b, OPP[d]);
    if (eb - ea > step) return false;
    // stairs are entered along their axis only (their sides are stringers / rails)
    if (this.stairDir[b] && ((this.stairDir[b] - 1) >> 1) !== (d >> 1) && Math.abs(eb - ea) > 0.3) return false;
    if (this.ceil[b] - this.floor[b] < clearance) return false;
    if (Math.min(this.ceil[a], this.ceil[b]) - Math.max(ea, eb) < clearance) return false;
    return true;
  }
  // BFS distance field from a set of start cells
  //  opts.step, opts.blocked(b), opts.maxDist, opts.allowVoid,
  //  opts.jumpGap (leap across void gaps), opts.avoid (flag mask treated as blocked)
  bfs(starts, opts = {}) {
    const n = this.w * this.h;
    const dist = new Int32Array(n).fill(-1);
    const q = new Int32Array(n);
    let qh = 0, qt = 0;
    for (const s of starts) { if (s >= 0 && dist[s] < 0) { dist[s] = 0; q[qt++] = s; } }
    const step = opts.step ?? 1.05;
    const blocked = opts.blocked;
    const avoid = opts.avoid || 0;
    while (qh < qt) {
      const a = q[qh++];
      const ax = a % this.w, az = (a / this.w) | 0;
      const d = dist[a] + 1;
      if (opts.maxDist && d > opts.maxDist) continue;
      for (let k = 0; k < 4; k++) {
        const bx = ax + DIR_X[k], bz = az + DIR_Z[k];
        if (bx < 0 || bz < 0 || bx >= this.w || bz >= this.h) continue;
        const b = bz * this.w + bx;
        if (opts.jumpGap && this.type[b] === OPEN && (this.flags[b] & F.VOID) && !(this.edge[a] & EDGE_BIT[k])) {
          // leap across a void gap to a landing cell up to jumpGap cells away
          for (let s = 2; s <= opts.jumpGap + 1; s++) {
            const cx = ax + DIR_X[k] * s, cz = az + DIR_Z[k] * s;
            if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) break;
            const c = cz * this.w + cx;
            if (this.type[c] !== OPEN) break;
            if (this.flags[c] & F.VOID) continue;
            if (dist[c] < 0 && this.edgeFloor(c, OPP[k]) - this.edgeFloor(a, k) <= (s === 2 ? 0.9 : 0.6) && !(blocked && blocked(c)) && !(this.flags[c] & avoid)) {
              dist[c] = d + s - 1;
              q[qt++] = c;
            }
            break;
          }
        }
        if (dist[b] >= 0) continue;
        if (avoid && (this.flags[b] & avoid)) continue;
        if (blocked && blocked(b)) continue;
        if (!this.passable(a, b, step, 0.85, opts.allowVoid, k)) continue;
        dist[b] = d;
        q[qt++] = b;
      }
    }
    return dist;
  }
}
