// A loaded level (or the hub): grid physics, raycasts, doors, path flow
// field, entity lists and the per-frame render submission.
import { F, OPEN, HAZ, DIR_X, DIR_Z, EDGE_BIT } from './grid.js';
import { buildWorldMesh, MeshBuilder } from './worldmesh.js';
import { buildLevelTextures } from './leveltextures.js';
import { TS } from './levelgen/common.js';
import { SKIES } from '../data/themes.js';
import { SpriteBatcher, MODE } from './spritebatch.js';
import { clamp } from '../core/math.js';
import { fx } from '../core/rng.js';
import { Gore } from './gore.js';
import { Scatter } from './scatter.js';

// physics constants
const RAIL_CLIP = 1.9;       // edge rails block actors whose feet are below the floor + this (no hopping over)
const RAIL_HALF = 0.05;      // half thickness of an edge rail
const STAIR_EXT = 0.3;       // footprint reach tested against stair ramps (capped so big monsters can climb)
const BOX_SHOT = 1, BOX_STAND = 2;   // collider flags: blocks shots + sight / top is walkable
const UNSTICK_D = [0.03, 0.06, 0.1, 0.15, 0.22, 0.3, 0.4, 0.55, 0.75];
const UNSTICK_X = [1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const UNSTICK_Z = [0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];

// The open-doorway frame of a key door keeps its border, but a sill across
// the bottom of a 3-wide doorway reads as a step: carve the see-through
// opening down to the floor (columns open at mid height stay open below).
function openToFloor(c) {
  try {
    const cx = c.getContext('2d'), w = c.width, h = c.height;
    const im = cx.getImageData(0, 0, w, h), a = im.data;
    for (let x = 0; x < w; x++) {
      if (a[((h >> 1) * w + x) * 4 + 3] >= 128) continue;
      for (let y = h >> 1; y < h; y++) a[(y * w + x) * 4 + 3] = 0;
    }
    cx.putImageData(im, 0, 0);
  } catch (e) { /* tainted / no 2d context: keep the frame as is */ }
}

const DEFAULT_SKY = { top: [0.02, 0.02, 0.03], horizon: [0.12, 0.1, 0.1], bottom: [0.04, 0.03, 0.03], stars: 0.3, clouds: [0.15, 0.12, 0.12, 0.5] };

export class World {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.grid = level.grid;
    this.theme = level.theme;
    this.depth = level.depth;
    this.time = 0;
    this.monsters = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles = [];
    this.chests = [];
    this.props = [];
    this.npcs = [];
    this.beams = [];          // short-lived line effects (rail, lightning, rift rails)
    this.dynLights = [];
    this.staticLights = [];
    this.portal = null;
    this.flow = null;
    this.flowTimer = 0;
    this.batcher = new SpriteBatcher();
    const t = this.theme;
    this.env = {
      fogColor: t.fog || [0, 0, 0], fogDensity: t.fogDensity ?? 0.03, ambient: t.ambient ?? 0.04,
      grade: t.grade || [1, 1, 1], animFps: 6,
    };
    const sk = SKIES[t.sky];
    this.sky = sk || { ...DEFAULT_SKY, horizon: this.env.fogColor.map((v) => v * 0.8 + 0.05) };
    // a door covers a straight run of cells (keyed doors: 3); d.cell is its
    // centre cell, x0..x1 / z0..z1 its footprint in world units
    this.doors = (level.doors || []).map((d) => {
      const i = d.cell, W = this.grid.w;
      const cells = d.cells || [i];
      const xs = cells.map((c) => c % W), zs = cells.map((c) => (c / W) | 0);
      const x0 = Math.min(...xs), z0 = Math.min(...zs), x1 = Math.max(...xs) + 1, z1 = Math.max(...zs) + 1;
      return {
        ...d, cells, x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
        floor: this.grid.floor[i], ceil: this.grid.ceil[i], open: 0, target: 0, locked: !!d.color, timer: 0, msgCooldown: 0,
      };
    });
    this.doorByCell = new Map();
    for (const d of this.doors) for (const c of d.cells) this.doorByCell.set(c, d);
    this.buildPhysics();
    this.gore = new Gore(this);   // blood particles, gibs, decals (src/game/gore.js)
    this.scatter = new Scatter(game, this);   // pillars, explosives, pedestals, spike traps (src/game/scatter.js)
  }

  // ------------------------------------------------------------------ setup
  buildGraphics(renderer, content) {
    const lt = buildLevelTextures(this.theme, this.level.seed || 1, content, { scrollSpeed: this.level.scrollSpeed, level: this.level });
    this.texReport = lt.report;
    this.slots = lt.slots;
    const layers = lt.layers;
    // animated key-door frames (from door_frames sheets) if available
    this.doorFrames = null;
    const ds = content.doorSet && content.doorSet();
    if (ds) {
      const design = (this.level.seed || 0) % ds.designs;
      this.doorFrames = {};
      for (const color of ds.colors) {
        const frames = content.doorFrameCanvases(ds, color, design);
        openToFloor(frames[frames.length - 1]);
        this.doorFrames[color] = frames.map((c) => { layers.push(c); return layers.length - 1; });
      }
    }
    renderer.setWallTextures(layers);
    const voidSlot = this.slots[TS.VOID];
    const g = this.grid;
    let hasVoid = false;
    for (let i = 0; i < g.w * g.h; i++) if (g.flags[i] & F.VOID) { hasVoid = true; break; }
    const mesh = buildWorldMesh(g, this.slots, {
      deco: this.level.deco,
      spikeSlot: TS.SPIKES,
      voidY: this.level.voidY,
      voidPlane: hasVoid && this.theme.void !== 'abyss' && this.theme.void !== 'space' && voidSlot
        ? { y: this.level.voidY + 0.5, layer: voidSlot.layer, emissive: voidSlot.emissive, scroll: voidSlot.scroll, light: 0.9 } : null,
    });
    renderer.setWorldMesh(mesh.verts, mesh.indices);
    this.doorMeshDirty = true;
    this.scatter.bind(content);
  }

  // ------------------------------------------------------------------ physics
  // Collision model (docs/ARCHITECTURE.md):
  //  - grid cells: solid cells are walls; open cells have a floor (stairs are
  //    ramps: grid.floorAtPos) and a ceiling (unless sky). Doors are slabs.
  //  - deco colliders: AABBs in a per-cell CSR index. `shots === false` marks
  //    rails / fences: they block movement but not shots or sight, and their
  //    tops are not standable. Other boxes block everything and are standable.
  //  - rails: blocked grid edges are thin walls up to floor + RAIL_CLIP, so
  //    guard rails cannot be hopped over into pits.
  // Hot paths below use plain loops (no closures / allocations).

  // Per-cell box index (CSR) + per-cell door lookup. Called from the ctor.
  buildPhysics() {
    const g = this.grid, n = g.w * g.h;
    this.doorAt = new Int16Array(n).fill(-1);
    this.doors.forEach((d, k) => { for (const c of d.cells) if (c >= 0 && c < n) this.doorAt[c] = k; });
    const cols = (this.level.deco && this.level.deco.colliders) || [];
    const nb = cols.length;
    this.nBoxes = nb;
    this.box = new Float32Array(nb * 6);
    this.boxFlags = new Uint8Array(nb);
    this.boxStamp = new Uint32Array(nb);
    this.stamp = 0;
    const start = new Int32Array(n + 1);
    const span = (b, fn) => {
      const o = b * 6, B = this.box;
      const x0 = Math.max(0, Math.floor(B[o])), x1 = Math.min(g.w - 1, Math.floor(B[o + 3] - 1e-6));
      const z0 = Math.max(0, Math.floor(B[o + 2])), z1 = Math.min(g.h - 1, Math.floor(B[o + 5] - 1e-6));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(z * g.w + x);
    };
    for (let b = 0; b < nb; b++) {
      const c = cols[b], o = b * 6;
      this.box[o] = Math.min(c.x0, c.x1); this.box[o + 1] = Math.min(c.y0, c.y1); this.box[o + 2] = Math.min(c.z0, c.z1);
      this.box[o + 3] = Math.max(c.x0, c.x1); this.box[o + 4] = Math.max(c.y0, c.y1); this.box[o + 5] = Math.max(c.z0, c.z1);
      this.boxFlags[b] = c.shots === false ? 0 : BOX_SHOT | BOX_STAND;
      span(b, (i) => { start[i + 1]++; });
    }
    for (let i = 0; i < n; i++) start[i + 1] += start[i];
    const list = new Int32Array(start[n]);
    const fill = start.slice(0, n);
    for (let b = 0; b < nb; b++) span(b, (i) => { list[fill[i]++] = b; });
    this.boxStart = start;
    this.boxList = list;
    this.groundHit = { y: -Infinity, cell: -1, box: -1 };
    this.rayHit = { dist: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, cell: -1, box: -1 };
    this.flowPt = { x: 0, z: 0 };
    this.flowStarts = [0];
  }

  nextStamp() {
    if (++this.stamp >= 0xffffffff) { this.stamp = 1; this.boxStamp.fill(0); }
    return this.stamp;
  }

  // Hazard type (HAZ.*) of cell i; legacy levels fall back to the theme.
  // Bridges are safe decks over whatever is below them.
  hazAt(i) {
    const g = this.grid, f = g.flags[i];
    if (!(f & (F.HAZARD | F.PIT | F.WATER)) || (f & F.BRIDGE)) return HAZ.NONE;
    if (g.hazType[i]) return g.hazType[i];
    if (f & F.WATER) return HAZ.WATER;
    const th = this.theme.hazard;
    if (th === 'lava') return HAZ.LAVA;
    if (th === 'water') return HAZ.WATER;
    return f & F.HAZARD ? HAZ.POISON : HAZ.NONE;
  }
  // Cells a walker must never step into on its own (void, pits, damaging floors)
  cellDanger(i) {
    if (i < 0) return true;
    const f = this.grid.flags[i];
    if (f & F.BRIDGE) return false;
    if (f & (F.VOID | F.PIT)) return true;
    if (f & F.HAZARD) { const h = this.hazAt(i); return h !== HAZ.WATER && h !== HAZ.NONE; }
    return false;
  }
  // Every cell under a circle is free of void / pits / damaging floors and the
  // centre is not a conveyor: a good place to respawn after a fall.
  safeFooting(x, z, r) {
    const g = this.grid;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return false;
      const i = cz * g.w + cx;
      if (g.type[i] === OPEN && this.cellDanger(i)) return false;
    }
    const c = g.cellAt(x, z);
    return c >= 0 && g.type[c] === OPEN && !(g.flags[c] & F.SCROLL) && this.doorAt[c] < 0;
  }

  // Does cell i block an actor whose feet are at `feet`? (x, z, r: the actor,
  // used for stairs: the floor at the uphill edge of its footprint counts)
  cellBlocks(i, feet, height, step, x, z, r) {
    const g = this.grid;
    if (i < 0 || g.type[i] !== OPEN) return true;
    const di = this.doorAt[i];
    if (di >= 0 && this.doors[di].open < 0.9) return true;
    if (g.flags[i] & F.VOID) return false;
    let f = g.floor[i];
    const sd = g.stairDir[i];
    if (sd && x !== undefined) {
      const up = sd - 1, e = Math.min(r || 0, STAIR_EXT);
      f = g.floorAtPos(i, x + e * DIR_X[up], z + e * DIR_Z[up]);
    }
    if (f > feet + step) return true;
    if (!g.sky[i] && g.ceil[i] < feet + height - 0.02) return true;
    return false;
  }

  // Cells overlapped by a circle (square bounding box; i = -1 out of bounds)
  forCells(x, z, r, fn) {
    const g = this.grid;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const i = cx < 0 || cz < 0 || cx >= g.w || cz >= g.h ? -1 : cz * g.w + cx;
      if (fn(i, cx, cz) === false) return false;
    }
    return true;
  }

  // circle vs blocked edges (rails / fences / glass) of cell i
  edgeHit(i, cx, cz, x, z, r, feet) {
    const g = this.grid, e = g.edge[i];
    for (let d = 0; d < 4; d++) {
      if (!(e & EDGE_BIT[d])) continue;
      // rails stand on the higher side; above the clip height they no longer block
      let base = g.minFloor(i);
      const nx = cx + DIR_X[d], nz = cz + DIR_Z[d];
      if (nx >= 0 && nz >= 0 && nx < g.w && nz < g.h) {
        const j = nz * g.w + nx;
        if (g.type[j] === OPEN && !(g.flags[j] & F.VOID)) base = Math.max(base, g.minFloor(j));
      }
      if (feet >= base + RAIL_CLIP) continue;
      let ax0, ax1, az0, az1;
      if (d < 2) { const L = d === 0 ? cx + 1 : cx; ax0 = L - RAIL_HALF; ax1 = L + RAIL_HALF; az0 = cz; az1 = cz + 1; }
      else { const L = d === 2 ? cz + 1 : cz; az0 = L - RAIL_HALF; az1 = L + RAIL_HALF; ax0 = cx; ax1 = cx + 1; }
      const qx = x < ax0 ? ax0 : x > ax1 ? ax1 : x, qz = z < az0 ? az0 : z > az1 ? az1 : z;
      if ((x - qx) * (x - qx) + (z - qz) * (z - qz) < r * r) return true;
    }
    return false;
  }

  canOccupy(x, z, r, feet, height, step) {
    const g = this.grid;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return false;
      const i = cz * g.w + cx;
      if (this.cellBlocks(i, feet, height, step, x, z, r)) return false;
      if (g.edge[i] && this.edgeHit(i, cx, cz, x, z, r, feet)) return false;
    }
    if (this.nBoxes) {
      const B = this.box, S = this.boxStamp, st = this.boxStart, L = this.boxList, s = this.nextStamp();
      const top = feet + step, head = feet + height - 0.02, r2 = r * r;
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const i = cz * g.w + cx;
        for (let k = st[i], ke = st[i + 1]; k < ke; k++) {
          const b = L[k];
          if (S[b] === s) continue;
          S[b] = s;
          const o = b * 6;
          if (B[o + 4] <= top || B[o + 1] >= head) continue;
          const qx = x < B[o] ? B[o] : x > B[o + 3] ? B[o + 3] : x;
          const qz = z < B[o + 2] ? B[o + 2] : z > B[o + 5] ? B[o + 5] : z;
          if ((x - qx) * (x - qx) + (z - qz) * (z - qz) < r2) return false;
        }
      }
    }
    return true;
  }

  // Highest standable surface under a circle (0.7 r footprint) at or below
  // feet + step: cell floors (exact on stairs, void ignored) and box tops.
  // -Infinity if none. Details of the hit go to this.groundHit {y, cell, box}.
  groundUnder(x, z, r, feet, step) {
    const g = this.grid, gh = this.groundHit;
    const rr = r * 0.7, lim = feet + step;
    let best = -Infinity, cell = -1, box = -1;
    const x0 = Math.floor(x - rr), x1 = Math.floor(x + rr), z0 = Math.floor(z - rr), z1 = Math.floor(z + rr);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) continue;
      const i = cz * g.w + cx;
      if (g.type[i] !== OPEN || (g.flags[i] & F.VOID)) continue;
      const f = g.stairDir[i] ? g.floorAtPos(i, x, z) : g.floor[i];
      if (f <= lim && f > best) { best = f; cell = i; }
    }
    if (this.nBoxes) {
      const B = this.box, BF = this.boxFlags, S = this.boxStamp, st = this.boxStart, L = this.boxList, s = this.nextStamp();
      const ax0 = x - rr, ax1 = x + rr, az0 = z - rr, az1 = z + rr;
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) continue;
        const i = cz * g.w + cx;
        for (let k = st[i], ke = st[i + 1]; k < ke; k++) {
          const b = L[k];
          if (S[b] === s) continue;
          S[b] = s;
          if (!(BF[b] & BOX_STAND)) continue;
          const o = b * 6, t = B[o + 4];
          if (t > lim || t <= best) continue;
          if (B[o] >= ax1 || B[o + 3] <= ax0 || B[o + 2] >= az1 || B[o + 5] <= az0) continue;
          best = t; box = b; cell = -1;
        }
      }
    }
    gh.y = best; gh.cell = cell; gh.box = box;
    return best;
  }
  groundInfo(x, z, r, feet, step) { this.groundUnder(x, z, r, feet, step); return this.groundHit; }

  // Lowest ceiling over a circle: non-sky cell ceilings, door slab bottoms and
  // (when `feet` is given) undersides of boxes more than 0.3 above the feet.
  ceilingOver(x, z, r, feet) {
    const g = this.grid;
    const rr = r * 0.7;
    let best = Infinity;
    const x0 = Math.floor(x - rr), x1 = Math.floor(x + rr), z0 = Math.floor(z - rr), z1 = Math.floor(z + rr);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) continue;
      const i = cz * g.w + cx;
      if (g.type[i] !== OPEN || g.sky[i]) continue;
      const di = this.doorAt[i];
      let c = g.ceil[i];
      if (di >= 0) { const d = this.doors[di]; c = d.floor + (d.ceil - d.floor) * Math.max(d.open, 0.05); }
      if (c < best) best = c;
    }
    if (feet !== undefined && this.nBoxes) {
      const B = this.box, S = this.boxStamp, st = this.boxStart, L = this.boxList, s = this.nextStamp();
      const ax0 = x - rr, ax1 = x + rr, az0 = z - rr, az1 = z + rr, lo = feet + 0.3;
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) continue;
        const i = cz * g.w + cx;
        for (let k = st[i], ke = st[i + 1]; k < ke; k++) {
          const b = L[k];
          if (S[b] === s) continue;
          S[b] = s;
          const o = b * 6, y0 = B[o + 1];
          if (y0 <= lo || y0 >= best) continue;
          if (B[o] >= ax1 || B[o + 3] <= ax0 || B[o + 2] >= az1 || B[o + 5] <= az0) continue;
          best = y0;
        }
      }
    }
    return best;
  }

  // Push an actor that is inside geometry out along the axis of least
  // penetration (doors closing on it, rails / boxes at spawn, ledge corners).
  unstick(a, step = 0.6) {
    const r = a.radius, h = a.height;
    for (let s = 0; s < UNSTICK_D.length; s++) {
      const d = UNSTICK_D[s];
      for (let k = 0; k < 8; k++) {
        const ox = UNSTICK_X[k] * d, oz = UNSTICK_Z[k] * d;
        if (this.canOccupy(a.x + ox, a.z + oz, r, a.y, h, step)) { a.x += ox; a.z += oz; return true; }
      }
    }
    return false;
  }

  // Slide-move an actor {x, z, y(feet), radius, height}. Returns true if
  // blocked. Walkers (step 0.5..1) follow rising ground within the move (fast
  // stair climbs) and get a.y raised to it; stuck actors are pushed out first.
  moveActor(a, dx, dz, step = 0.55) {
    const chk = step > 0.6 ? step : 0.6;
    if (!this.canOccupy(a.x, a.z, a.radius, a.y, a.height, chk)) a.stuck = this.unstick(a, chk) ? 0 : (a.stuck || 0) + 1;
    else if (a.stuck) a.stuck = 0;
    let blocked = false;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (a.radius * 0.8)));
    const sx = dx / n, sz = dz / n;
    const climb = step >= 0.5 && step <= 1;
    let feet = a.y;
    const r = a.radius, h = a.height;
    for (let k = 0; k < n; k++) {
      let moved = false;
      // axis-separated slide; a head-on move blocked by a corner (pillar,
      // crate, rail end, door jamb) sidesteps around it instead of sticking
      if (sx) {
        if (this.canOccupy(a.x + sx, a.z, r, feet, h, step)) { a.x += sx; moved = true; }
        else {
          blocked = true;
          if (Math.abs(sz) < Math.abs(sx) * 0.5) {
            const sd = Math.abs(sx) * 0.7, s1 = sz < 0 ? -sd : sd, mx = sx * 0.7;
            if (this.canOccupy(a.x + mx, a.z + s1, r, feet, h, step)) { a.x += mx; a.z += s1; moved = true; }
            else if (this.canOccupy(a.x + mx, a.z - s1, r, feet, h, step)) { a.x += mx; a.z -= s1; moved = true; }
          }
        }
      }
      if (sz) {
        if (this.canOccupy(a.x, a.z + sz, r, feet, h, step)) { a.z += sz; moved = true; }
        else {
          blocked = true;
          if (Math.abs(sx) < Math.abs(sz) * 0.5) {
            const sd = Math.abs(sz) * 0.7, s1 = sx < 0 ? -sd : sd, mz = sz * 0.7;
            if (this.canOccupy(a.x + s1, a.z + mz, r, feet, h, step)) { a.x += s1; a.z += mz; moved = true; }
            else if (this.canOccupy(a.x - s1, a.z + mz, r, feet, h, step)) { a.x -= s1; a.z += mz; moved = true; }
          }
        }
      }
      if (climb && moved) {
        const gy = this.groundUnder(a.x, a.z, a.radius, feet, step);
        if (gy > feet) feet = gy;
      }
    }
    if (feet > a.y) a.y = feet;
    return blocked;
  }

  // Is the point inside world geometry? (allBoxes: rails / fences count too)
  pointSolid(x, y, z, allBoxes = false) {
    const g = this.grid;
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return true;
    const i = cz * g.w + cx;
    if (g.type[i] !== OPEN) return true;
    const di = this.doorAt[i];
    if (di >= 0) { const d = this.doors[di]; if (d.open < 0.95 && y > d.floor + (d.ceil - d.floor) * d.open && y < d.ceil) return true; }
    if (!(g.flags[i] & F.VOID) && y < (g.stairDir[i] ? g.floorAtPos(i, x, z) : g.floor[i])) return true;
    if (!g.sky[i] && y > g.ceil[i]) return true;
    if (this.nBoxes) {
      const B = this.box, BF = this.boxFlags, st = this.boxStart, L = this.boxList;
      for (let k = st[i], ke = st[i + 1]; k < ke; k++) {
        const b = L[k];
        if (!allBoxes && !(BF[b] & BOX_SHOT)) continue;
        const o = b * 6;
        if (x > B[o] && x < B[o + 3] && y > B[o + 1] && y < B[o + 4] && z > B[o + 2] && z < B[o + 5]) return true;
      }
    }
    return false;
  }

  // Ray cast (Amanatides-Woo DDA over grid cells; solid cells, door slabs,
  // floors / stair ramps, ceilings and boxes intersected analytically).
  // (dx, dy, dz) must be normalised. Fills this.rayHit and returns the hit
  // distance, or -1 if nothing is hit within maxDist. No allocations.
  castRay(ox, oy, oz, dx, dy, dz, maxDist, allBoxes = false) {
    const g = this.grid, W = g.w, H = g.h;
    let cx = Math.floor(ox), cz = Math.floor(oz);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDX = stepX ? Math.abs(1 / dx) : Infinity, tDZ = stepZ ? Math.abs(1 / dz) : Infinity;
    let tMaxX = stepX > 0 ? (cx + 1 - ox) * tDX : stepX < 0 ? (ox - cx) * tDX : Infinity;
    let tMaxZ = stepZ > 0 ? (cz + 1 - oz) * tDZ : stepZ < 0 ? (oz - cz) * tDZ : Infinity;
    let tEnter = 0, fnx = 0, fnz = 0;          // entry face normal of the current cell
    let best = Infinity, bnx = 0, bny = 0, bnz = 0, bCell = -1, bBox = -1;
    const nb = this.nBoxes;
    const s = nb ? this.nextStamp() : 0;
    const B = this.box, BF = this.boxFlags, S = this.boxStamp, st = this.boxStart, BL = this.boxList;
    for (let guard = 0; guard < 8192; guard++) {
      if (tEnter >= best || tEnter > maxDist) break;
      const tExit = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      const t1 = Math.min(tExit, maxDist, best);
      const first = tEnter === 0;
      // normal for a hit on the cell's entry face (or against the ray at the origin)
      const enx = first ? -dx : fnx, eny = first ? -dy : 0, enz = first ? -dz : fnz;
      if (cx < 0 || cz < 0 || cx >= W || cz >= H) { best = tEnter; bnx = enx; bny = eny; bnz = enz; bCell = -1; bBox = -1; break; }
      const i = cz * W + cx;
      if (g.type[i] !== OPEN) { best = tEnter; bnx = enx; bny = eny; bnz = enz; bCell = i; bBox = -1; break; }
      const yIn = oy + dy * tEnter;
      // door slab (spans the whole cell from its bottom edge to the door ceiling)
      const di = this.doorAt[i];
      if (di >= 0) {
        const d = this.doors[di];
        if (d.open < 0.95) {
          const yb = d.floor + (d.ceil - d.floor) * d.open;
          if (yIn > yb && yIn < d.ceil) { best = tEnter; if (first) { bnx = 0; bny = -1; bnz = 0; } else { bnx = fnx; bny = 0; bnz = fnz; } bCell = i; bBox = -1; }
          else if (yIn <= yb && dy > 0) { const t = (yb - oy) / dy; if (t >= tEnter && t < t1) { best = t; bnx = 0; bny = -1; bnz = 0; bCell = i; bBox = -1; } }
        }
      }
      // floor (void cells have none)
      if (!(g.flags[i] & F.VOID)) {
        const sd = g.stairDir[i];
        if (!sd) {
          const f = g.floor[i];
          if (yIn < f) { if (tEnter < best) { best = tEnter; if (first) { bnx = 0; bny = 1; bnz = 0; } else { bnx = fnx; bny = 0; bnz = fnz; } bCell = i; bBox = -1; } }
          else if (dy < 0) { const t = (f - oy) / dy; if (t >= tEnter && t < t1 && t < best) { best = t; bnx = 0; bny = 1; bnz = 0; bCell = i; bBox = -1; } }
        } else {
          // ramp: floor(u) = top - rise * (1 - u), u = position across the cell toward `up`
          const up = sd - 1, rise = g.rise[i], top = g.floor[i];
          let u0, u1;
          if (up === 0) { u0 = ox - cx; u1 = dx; } else if (up === 1) { u0 = cx + 1 - ox; u1 = -dx; }
          else if (up === 2) { u0 = oz - cz; u1 = dz; } else { u0 = cz + 1 - oz; u1 = -dz; }
          let uIn = u0 + u1 * tEnter; uIn = uIn < 0 ? 0 : uIn > 1 ? 1 : uIn;
          if (yIn < top - rise * (1 - uIn) - 1e-5) {
            if (tEnter < best) { best = tEnter; if (first) { bnx = 0; bny = 1; bnz = 0; } else { bnx = fnx; bny = 0; bnz = fnz; } bCell = i; bBox = -1; }
          } else {
            const h1 = rise * u1, den = dy - h1;
            if (den < -1e-9) {
              const t = (top - rise + rise * u0 - oy) / den;
              if (t >= tEnter && t < t1 && t < best) {
                const l = Math.sqrt(rise * rise + 1);
                best = t; bny = 1 / l; bnx = -DIR_X[up] * rise / l; bnz = -DIR_Z[up] * rise / l; bCell = i; bBox = -1;
              }
            }
          }
        }
      }
      // ceiling
      if (!g.sky[i]) {
        const c = g.ceil[i];
        if (yIn > c) { if (tEnter < best) { best = tEnter; if (first) { bnx = 0; bny = -1; bnz = 0; } else { bnx = fnx; bny = 0; bnz = fnz; } bCell = i; bBox = -1; } }
        else if (dy > 0) { const t = (c - oy) / dy; if (t >= tEnter && t < t1 && t < best) { best = t; bnx = 0; bny = -1; bnz = 0; bCell = i; bBox = -1; } }
      }
      // boxes indexed in this cell (each tested once per ray)
      if (nb) {
        for (let k = st[i], ke = st[i + 1]; k < ke; k++) {
          const b = BL[k];
          if (S[b] === s) continue;
          S[b] = s;
          if (!allBoxes && !(BF[b] & BOX_SHOT)) continue;
          const o = b * 6;
          let tmin = -Infinity, tmax = Infinity, ax = -1, sg = 0;
          let miss = false;
          for (let a = 0; a < 3 && !miss; a++) {
            const oo = a === 0 ? ox : a === 1 ? oy : oz, dd = a === 0 ? dx : a === 1 ? dy : dz;
            const lo = B[o + a], hi = B[o + 3 + a];
            if (dd > -1e-12 && dd < 1e-12) { if (oo <= lo || oo >= hi) miss = true; continue; }
            let ta = (lo - oo) / dd, tb = (hi - oo) / dd, sgn = -1;
            if (ta > tb) { const tt = ta; ta = tb; tb = tt; sgn = 1; }
            if (ta > tmin) { tmin = ta; ax = a; sg = sgn; }
            if (tb < tmax) tmax = tb;
            if (tmin > tmax) miss = true;
          }
          if (miss || tmax < 0) continue;
          let t = tmin;
          if (t < 0) { t = 0; ax = -1; }
          if (t < best && t <= maxDist) {
            best = t; bCell = i; bBox = b;
            if (ax < 0) { bnx = -dx; bny = -dy; bnz = -dz; }
            else { bnx = ax === 0 ? sg : 0; bny = ax === 1 ? sg : 0; bnz = ax === 2 ? sg : 0; }
          }
        }
      }
      // next cell
      if (tMaxX === Infinity && tMaxZ === Infinity) break;
      if (tMaxX < tMaxZ) { tEnter = tMaxX; tMaxX += tDX; cx += stepX; fnx = -stepX; fnz = 0; }
      else { tEnter = tMaxZ; tMaxZ += tDZ; cz += stepZ; fnx = 0; fnz = -stepZ; }
    }
    if (best > maxDist) return -1;
    const h = this.rayHit, tb = best > 0.01 ? best - 0.01 : 0;
    h.dist = best; h.x = ox + dx * tb; h.y = oy + dy * tb; h.z = oz + dz * tb;
    h.nx = bnx; h.ny = bny; h.nz = bnz; h.cell = bCell; h.box = bBox;
    return best;
  }

  // Ray cast returning {dist, x, y, z, nx, ny, nz, cell, box} (point just in
  // front of the surface, unit normal) or null. Rails / fences are ignored
  // unless allBoxes.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, allBoxes = false) {
    if (this.castRay(ox, oy, oz, dx, dy, dz, maxDist, allBoxes) < 0) return null;
    const h = this.rayHit;
    return { dist: h.dist, x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, cell: h.cell, box: h.box };
  }

  // Line of sight (rails, fences and grates do not block it)
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.001) return true;
    return this.castRay(ax, ay, az, dx / d, dy / d, dz / d, d - 0.15, false) < 0;
  }

  // Floor height at a point: exact on stairs, level.voidY over the void, null in walls
  floorAt(x, z) {
    const g = this.grid, i = g.cellAt(x, z);
    if (i < 0 || g.type[i] !== OPEN) return null;
    return g.flags[i] & F.VOID ? this.level.voidY : g.floorAtPos(i, x, z);
  }
  // Highest surface at (x, z) with its top at or below y (+0.05): the cell
  // floor (stairs exact, voidY over the void) or a standable box top. Use for
  // things that fall (pickups, gibs, particles). null inside walls.
  surfaceBelow(x, y, z) {
    const g = this.grid, i = g.cellAt(x, z);
    if (i < 0 || g.type[i] !== OPEN) return null;
    let best = g.flags[i] & F.VOID ? this.level.voidY : g.stairDir[i] ? g.floorAtPos(i, x, z) : g.floor[i];
    if (this.nBoxes) {
      const B = this.box, BF = this.boxFlags, st = this.boxStart, L = this.boxList, lim = y + 0.05;
      for (let k = st[i], ke = st[i + 1]; k < ke; k++) {
        const b = L[k];
        if (!(BF[b] & BOX_STAND)) continue;
        const o = b * 6, t = B[o + 4];
        if (t > lim || t <= best) continue;
        if (x >= B[o] && x <= B[o + 3] && z >= B[o + 2] && z <= B[o + 5]) best = t;
      }
    }
    return best;
  }
  cellFlags(x, z) { const i = this.grid.cellAt(x, z); return i < 0 ? 0 : this.grid.flags[i]; }

  // Nearest spot to (x, z) that is safe (no void / pit / hazard / obstacle /
  // door) and reachable from the level start: where dropped keys must land.
  safeDropSpot(x, z) {
    const g = this.grid;
    if (!this.reach) {
      const L = this.level, si = L.start ? g.cellAt(L.start.x, L.start.z) : -1;
      this.reach = si >= 0 ? g.bfs([si], { jumpGap: L.jumpGap || 0, avoid: F.OBSTACLE }) : null;
    }
    const ok = (i) => g.type[i] === OPEN && !this.cellDanger(i) && !(g.flags[i] & (F.HAZARD | F.OBSTACLE | F.DOOR | F.STAIR)) && (!this.reach || this.reach[i] >= 0);
    const cx = Math.floor(x), cz = Math.floor(z);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 24 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!g.in(nx, nz)) continue;
        const i = nz * g.w + nx;
        if (!ok(i)) continue;
        const d = (nx + 0.5 - x) ** 2 + (nz + 0.5 - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best < 0) return null;
    const sx = (best % g.w) + 0.5, sz = ((best / g.w) | 0) + 0.5;
    return { x: sx, z: sz, y: this.floorAt(sx, sz) ?? 0 };
  }

  // ------------------------------------------------------------------ doors
  // Distance from (x, z) to a door's footprint (0 inside the doorway).
  doorDist(d, x, z) {
    const dx = Math.max(d.x0 - x, 0, x - d.x1), dz = Math.max(d.z0 - z, 0, z - d.z1);
    return Math.hypot(dx, dz);
  }
  updateDoors(dt, player, monsters) {
    for (const d of this.doors) {
      d.msgCooldown = Math.max(0, d.msgCooldown - dt);
      let want = false;
      // proximity is measured to the whole doorway, so a 3-wide door opens
      // as one panel wherever along it the player walks up
      const pd = this.doorDist(d, player.x, player.z);
      const sd = Math.hypot(player.x - d.cx, player.z - d.cz);   // sound distance
      if (pd < 1.2) {
        if (d.locked) {
          if (player.keys.has(d.color)) {
            d.locked = false;
            player.keys.delete(d.color);
            this.game.toast(`${d.color.toUpperCase()} door unlocked`, d.color);
            this.game.sfx('door_open', { dist: sd });
            want = true;
          } else if (d.msgCooldown <= 0 && pd < 0.75) {
            d.msgCooldown = 2.5;
            this.game.toast(`You need the ${d.color.toUpperCase()} key`, d.color);
            this.game.sfx('door_locked');
          }
        } else want = true;
      }
      if (!d.locked && !want) {
        for (const m of monsters) {
          if (m.dead) continue;
          if (Math.max(d.x0 - m.x, m.x - d.x1, d.z0 - m.z, m.z - d.z1) < 1) { want = true; break; }
        }
      }
      if (want) { d.timer = 3.5; if (d.target === 0) { d.target = 1; if (sd < 16) this.game.sfx('door_open', { dist: sd }); } }
      else if (d.timer > 0) d.timer -= dt;
      else if (d.target === 1) {
        // don't close on something standing in the doorway
        const r = (player.radius ?? 0.3) + 0.1;
        const occupied = player.x > d.x0 - r && player.x < d.x1 + r && player.z > d.z0 - r && player.z < d.z1 + r;
        if (!occupied) d.target = 0;
      }
      const speed = 1.6;
      const prev = d.open;
      d.open = clamp(d.open + (d.target ? speed : -speed) * dt, 0, 1);
      if (d.open !== prev) this.doorMeshDirty = true;
    }
  }

  buildDoorMesh(renderer) {
    if (!this.doorMeshDirty) return;
    this.doorMeshDirty = false;
    if (!this.doors.length) { renderer.setDynamicMesh(new Float32Array(0), new Uint32Array(0), 0); return; }
    const mb = new MeshBuilder(this.doors.length * 6 + 4);
    const g = this.grid;
    // One picture per door face: u 0..1 across the whole doorway from the
    // viewer's left (so it is never mirrored), v from vb at the bottom edge to
    // vt at the top (image row 0 = top, so the picture stands upright).
    // A tiny inset keeps REPEAT sampling from wrapping at the edges.
    const E = 0.002;
    const face = (L, R, y0, y1, vb, vt, n, layer, light, em) => mb.quad(
      [[L[0], y0, L[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [L[0], y1, L[1]]],
      [[E, vb], [1 - E, vb], [1 - E, vt], [E, vt]], n, layer, light, em, 0);
    for (const d of this.doors) {
      const { x0, z0, x1, z1 } = d;
      const light = g.light[d.cell];
      const frames = d.color && this.doorFrames && this.doorFrames[d.color];
      if (frames) {
        // frame-animated panel through the middle of the doorway: one door
        // picture stretched over the whole opening, both sides
        const f = d.open >= 0.99 ? frames.length - 1 : Math.min(frames.length - 2, Math.floor(d.open * (frames.length - 1)));
        const layer = frames[f];
        const y0 = d.floor, y1 = d.ceil;
        if (d.axis === 'x') {
          const px = (x0 + x1) / 2;
          face([px, z1], [px, z0], y0, y1, 1 - E, E, [1, 0, 0], layer, light, 0);
          face([px, z0], [px, z1], y0, y1, 1 - E, E, [-1, 0, 0], layer, light, 0);
        } else {
          const pz = (z0 + z1) / 2;
          face([x0, pz], [x1, pz], y0, y1, 1 - E, E, [0, 0, 1], layer, light, 0);
          face([x1, pz], [x0, pz], y0, y1, 1 - E, E, [0, 0, -1], layer, light, 0);
        }
        continue;
      }
      if (d.open >= 0.999) continue;
      const slot = this.slots[d.slot] || this.slots[TS.DOOR];
      const bot = d.floor + (d.ceil - d.floor) * d.open, top = d.ceil;
      const em = d.color ? 0.25 : 0;
      // DOOM-style slab over the whole doorway rising into the ceiling: the
      // picture rides up with it (its hidden top part is the open fraction)
      const vt = Math.min(1 - E, d.open + E);
      if (d.axis === 'x') {
        face([x0, z0], [x0, z1], bot, top, 1 - E, vt, [-1, 0, 0], slot.layer, light, em);
        face([x1, z1], [x1, z0], bot, top, 1 - E, vt, [1, 0, 0], slot.layer, light, em);
      } else {
        face([x1, z0], [x0, z0], bot, top, 1 - E, vt, [0, 0, -1], slot.layer, light, em);
        face([x0, z1], [x1, z1], bot, top, 1 - E, vt, [0, 0, 1], slot.layer, light, em);
      }
      mb.quad([[x0, bot, z0], [x1, bot, z0], [x1, bot, z1], [x0, bot, z1]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, -1, 0], slot.layer, light * 0.7, em, 0);
    }
    const r = mb.result();
    renderer.setDynamicMesh(r.verts, r.indices, r.count);
  }

  // ------------------------------------------------------------------ path flow field
  // Distance field for walkers heading TO the player (reverse BFS: drops toward
  // the player are fine, climbs limited to what a monster can hop). Locked
  // doors, damaging floors, pits and obstacle cells are avoided; water is not.
  updateFlow(dt, px, pz) {
    this.flowTimer -= dt;
    if (this.flowTimer > 0 && this.flow) return;
    this.flowTimer = 0.45;
    const g = this.grid;
    const start = g.cellAt(px, pz);
    if (start < 0 || g.type[start] !== OPEN) return;
    if ((g.flags[start] & F.VOID) && this.flow) return;   // mid-jump over the void: keep the last field
    if (!this.flowOpts) {
      const n = g.w * g.h;
      this.flowOpts = {
        step: 1.05, clearance: 1.65, reverse: true, jumpGap: this.level.jumpGap || 0,
        avoid: F.PIT | F.OBSTACLE,
        blocked: (b) => {
          const di = this.doorAt[b];
          if (di >= 0 && this.doors[di].locked) return true;
          return (g.flags[b] & F.HAZARD) !== 0 && this.cellDanger(b);
        },
        out: new Int32Array(n), queue: new Int32Array(n),
      };
    }
    this.flowStarts[0] = start;
    this.flow = g.bfs(this.flowStarts, this.flowOpts);
  }

  // Next waypoint toward the player for a walker at (x, z): the neighbouring
  // cell with the lowest distance that can actually be walked into from here
  // (heights, rails / fences, no corner cutting past them). The returned
  // object is reused: read it right away.
  flowStep(x, z) {
    const g = this.grid, f = this.flow;
    if (!f) return null;
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!g.in(cx, cz)) return null;
    const W = g.w, hi = cz * W + cx, here = f[hi];
    let bx = 0, bz = 0, found = false, bd = here < 0 ? Infinity : here;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= g.h) continue;
      const ni = nz * W + nx, v = f[ni];
      if (v < 0) continue;
      const score = v + (dx && dz ? 0.4 : 0);
      if (score >= bd) continue;
      const kx = dx > 0 ? 0 : 1, kz = dz > 0 ? 2 : 3;
      if (dx && dz) {
        // diagonals only past two walkable orthogonal neighbours, both ways round
        const ox = cz * W + nx, oz = nz * W + cx;
        if (f[ox] < 0 || f[oz] < 0) continue;
        if (!g.passable(hi, ox, 1.05, 1.65, false, kx) || !g.passable(hi, oz, 1.05, 1.65, false, kz)) continue;
        if (!g.passable(ox, ni, 1.05, 1.65, false, kz) || !g.passable(oz, ni, 1.05, 1.65, false, kx)) continue;
      } else if (!g.passable(hi, ni, 1.05, 1.65, false, dx ? kx : kz)) continue;
      bd = score; bx = nx + 0.5; bz = nz + 0.5; found = true;
    }
    if (!found) return null;
    const pt = this.flowPt;
    pt.x = bx; pt.z = bz;
    return pt;
  }

  // ------------------------------------------------------------------ effects
  addParticle(p) {
    if (this.particles.length > 600) this.particles.shift();
    this.particles.push(p);
  }

  burst(x, y, z, color, count = 8, opts = {}) {
    for (let k = 0; k < count; k++) {
      const a = fx.float(0, Math.PI * 2), e = fx.float(-0.3, 1.2);
      const sp = fx.float(opts.speedMin ?? 1, opts.speed ?? 5);
      this.addParticle({
        x, y, z, vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + (opts.up || 0), vz: Math.sin(a) * sp * Math.cos(e),
        life: fx.float(0.25, opts.life ?? 0.7), age: 0, size: fx.float(0.05, opts.size ?? 0.14), color,
        gravity: opts.gravity ?? 9, cell: opts.cell ?? 0, add: opts.add !== false, drag: opts.drag ?? 0.5,
      });
    }
  }

  beam(x0, y0, z0, x1, y1, z1, color, width = 0.12, life = 0.15, jag = 0) {
    this.beams.push({ x0, y0, z0, x1, y1, z1, color, width, life, age: 0, jag });
  }

  flash(x, y, z, color, radius, life = 0.12, intensity = 1.5) {
    this.dynLights.push({ x, y, z, r: color[0], g: color[1], b: color[2], radius, life, age: 0, intensity });
  }

  updateEffects(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.vy -= p.gravity * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vz *= k;
      const py = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const f = this.surfaceBelow(p.x, py, p.z);   // floors, stair ramps and crate / box tops
      if (f !== null && p.y < f + 0.02) { p.y = f + 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const b of this.beams) b.age += dt;
    this.beams = this.beams.filter((b) => b.age < b.life);
    for (const l of this.dynLights) l.age += dt;
    this.dynLights = this.dynLights.filter((l) => l.age < l.life);
  }

  // ------------------------------------------------------------------ rendering helpers
  collectLights(extra) {
    const out = [];
    for (const l of this.level.lights || []) {
      const fl = l.flicker ? 0.85 + 0.15 * Math.sin(this.time * 13 + l.x * 7) * Math.sin(this.time * 7.3 + l.z) : l.pulse ? 0.8 + 0.2 * Math.sin(this.time * 3) : 1;
      out.push({ x: l.x, y: l.y ?? (this.floorAt(l.x, l.z) ?? 0) + 1.6, z: l.z, r: l.color[0], g: l.color[1], b: l.color[2], radius: l.radius, intensity: 0.9 * fl });
    }
    for (const l of this.dynLights) {
      const k = 1 - l.age / l.life;
      out.push({ ...l, intensity: l.intensity * k });
    }
    for (const l of extra) out.push(l);
    return out;
  }

  submitEffects(batcher, content, camera) {
    const fxH = content.fx;
    for (const p of this.particles) {
      const k = 1 - p.age / p.life;
      batcher.add(fxH, p.add ? MODE.ADD : MODE.ALPHA, p.x, p.y, p.z, p.size * (p.grow ? 1 + p.age * p.grow : 1), p.size * (p.grow ? 1 + p.age * p.grow : 1), {
        uv: [p.cell * 0.25, 0, p.cell * 0.25 + 0.25, 1], tint: [p.color[0], p.color[1], p.color[2], k], anchorY: 0.5, spherical: true, fullbright: true,
      });
    }
    // beams drawn as a chain of glowing dots (cheap & works with billboards)
    for (const b of this.beams) {
      const k = 1 - b.age / b.life;
      const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      const n = Math.min(160, Math.max(2, Math.ceil(len / (b.width * 0.7))));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        let jx = 0, jy = 0, jz = 0;
        if (b.jag) { jx = (fx.next() - 0.5) * b.jag; jy = (fx.next() - 0.5) * b.jag; jz = (fx.next() - 0.5) * b.jag; }
        batcher.add(fxH, MODE.ADD, b.x0 + (b.x1 - b.x0) * t + jx, b.y0 + (b.y1 - b.y0) * t + jy, b.z0 + (b.z1 - b.z0) * t + jz, b.width * 2, b.width * 2, {
          uv: [0, 0, 0.25, 1], tint: [b.color[0], b.color[1], b.color[2], k], anchorY: 0.5, spherical: true, fullbright: true,
        });
      }
    }
    void camera;
  }
}
