// Shared level-generation helpers.
import { Grid, F, OPEN, SOLID, SKY_H, HAZ, DIR_X, DIR_Z, OPP, EDGE_BIT } from '../grid.js';
import { clamp } from '../../core/math.js';

// Texture slots ("roles"): every level fills these slots with real or
// placeholder art chosen so the texture fits the surface it is used on
// (see game/leveltextures.js + data/texroles.js). Grid cells and deco boxes
// refer to slots, never to raw tiles.
export const TS = {
  WALL: 0,        // main wall
  WALL2: 1,       // secondary wall (other rooms / wings)
  FLOOR: 2,       // main floor
  FLOOR2: 3,      // corridor / walkway floor
  CEIL: 4,        // ceiling
  ACCENT: 5,      // feature wall (boss arena, focal walls)
  SIDE: 6,        // ledge / platform / pit sides, curbs
  DOOR: 7, DOOR_RED: 8, DOOR_BLUE: 9, DOOR_YELLOW: 10, DOOR_GREEN: 11, DOOR_PURPLE: 12,
  HAZARD: 13,     // the theme's default hazard liquid
  VOID: 14,       // far plane below voids (road, clouds, lava sea...)
  SPECIAL: 15,    // teleporter pad
  TRIM: 16,       // baseboards, crown moulding, wall bands, door frames, step nosing
  PILLAR: 17,     // columns / supports
  BEAM: 18,       // girders, ceiling beams, struts
  CRATE: 19,      // crates / boxes
  CRATE2: 20,     // containers / second crate kind
  MACHINE: 21,    // consoles, computers, machinery fronts
  PANEL: 22,      // wall panelling / wainscot / tech panels
  PIPE: 23,       // pipes and conduits
  GRATE: 24,      // catwalks, bridge decks, metal walkways, vents
  STAIR: 25,      // stair treads
  RAIL: 26,       // hand rails / guard rails / fences
  LIGHT: 27,      // emissive light panels and lamp heads
  LAVA: 28,
  POISON: 29,
  SPIKES: 30,     // spike metal (pit spikes)
  WATER: 31,
  FACADE: 32,     // building facades (skyscraper windows)
  FACADE2: 33,
  FACADE3: 34,
  ROAD: 35,       // asphalt with lane markings
  SIDEWALK: 36,   // pavement / plaza paving
  ROOF: 37,       // rooftop surface / building caps
  GLASS: 38,      // windows (looking out)
  ROCK: 39,       // natural rock / cliff faces
  GROUND: 40,     // outdoor ground (grass, dirt, sand, snow)
  FOLIAGE: 41,    // hedges / bushes / tree canopies
  METAL: 42,      // plain metal plate (vehicles, machine sides, brackets)
  CEIL2: 43,      // secondary ceiling (halls / big rooms)
  FLOOR3: 44,     // feature floor (hall centre, plaza, arena)
  PITWALL: 45,    // pit / shaft walls
  WOOD: 46,       // wooden planks / furniture
  SCREEN: 47,     // screens / displays (emissive)
  PAINT: 48,      // road paint / floor markings (lane lines, crosswalks, hazard lines)
  NEON: 49,       // neon signs and strips (emissive)
  CARPET: 50,     // carpets / rugs / runners
};
export const SLOT_COUNT = 56;
// hub teleporter pad: one painted 9x9 floor (assets/textures/hub_portal_floor.png)
// cut into a slot per cell after the role slots, plus the riser panel slot
export const PAD_CELLS = 9, PAD_SLOT0 = SLOT_COUNT, PAD_EDGE = PAD_SLOT0 + PAD_CELLS * PAD_CELLS;

export const KEY_COLORS = ['red', 'blue', 'yellow', 'green', 'purple'];
export const KEY_HEX = { red: '#ff2a2a', blue: '#2a6aff', yellow: '#ffd21a', green: '#2aff4a', purple: '#c040ff' };
export const DOOR_SLOT = { red: TS.DOOR_RED, blue: TS.DOOR_BLUE, yellow: TS.DOOR_YELLOW, green: TS.DOOR_GREEN, purple: TS.DOOR_PURPLE };

export function newGrid(w, h, wallTop = 5) {
  const g = new Grid(w, h);
  g.wallTex.fill(TS.WALL);
  g.floor.fill(wallTop);
  g.floorTex.fill(TS.FLOOR);
  g.ceilTex.fill(TS.CEIL);
  g.wallTop = wallTop;
  return g;
}

export function carveRect(g, x, z, w, h, o) {
  g.rect(x, z, w, h, (cx, cz) => g.open(cx, cz, o.floor ?? 0, o.ceil ?? 3, o));
}

export function setWallsAround(g, x, z, w, h, tex, top) {
  for (let cz = z - 1; cz <= z + h; cz++) for (let cx = x - 1; cx <= x + w; cx++) {
    if (!g.in(cx, cz)) continue;
    const i = g.idx(cx, cz);
    if (g.type[i] === SOLID) { g.wallTex[i] = tex; if (top !== undefined) g.floor[i] = Math.max(g.floor[i] === g.wallTop ? -99 : g.floor[i], top); }
  }
}

// L-shaped corridor between two points; heights interpolate in 0.25 steps.
export function carveCorridor(g, rng, ax, az, bx, bz, o) {
  const width = o.width || 1;
  const path = [];
  const horizFirst = rng.chance(0.5);
  let x = ax, z = az;
  const push = () => path.push([x, z]);
  push();
  const stepX = () => { while (x !== bx) { x += Math.sign(bx - x); push(); } };
  const stepZ = () => { while (z !== bz) { z += Math.sign(bz - z); push(); } };
  if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
  const fa = o.floorA ?? 0, fb = o.floorB ?? 0;
  const n = path.length;
  const cells = [];
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 0;
    const f = Math.round((fa + (fb - fa) * t) * 4) / 4;
    const [px, pz] = path[k];
    for (let wz = 0; wz < width; wz++) for (let wx = 0; wx < width; wx++) {
      const cx = px + wx, cz = pz + wz;
      if (!g.in(cx, cz) || cx <= 0 || cz <= 0 || cx >= g.w - 1 || cz >= g.h - 1) continue;
      const i = g.idx(cx, cz);
      if (g.type[i] === OPEN && g.region[i] >= 0) continue; // don't overwrite rooms
      g.open(cx, cz, f, f + (o.height ?? 2.5), { sky: o.sky, floorTex: o.floorTex, ceilTex: o.ceilTex, light: o.light, region: -2 });
      cells.push(i);
    }
  }
  return { path, cells };
}

// Make sure the outer border is solid.
export function encloseBorder(g) {
  for (let x = 0; x < g.w; x++) { g.solid(x, 0); g.solid(x, g.h - 1); }
  for (let z = 0; z < g.h; z++) { g.solid(0, z); g.solid(g.w - 1, z); }
}

// Surround an arena (set of cell indices) with walls, leaving exactly one gate
// toward the start. Returns the gate cell index (or -1).
export function fortifyArena(g, arenaCells, dist, opts = {}) {
  const set = new Set(arenaCells);
  const boundary = [];
  for (const i of arenaCells) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (const [nx, nz] of g.neighbors(x, z)) {
      const j = g.idx(nx, nz);
      if (!set.has(j)) { boundary.push(i); break; }
    }
  }
  const bset = new Set(boundary);
  // gate: boundary cell next to a reachable outside cell with the lowest distance
  let gate = -1, best = Infinity, gateOut = -1;
  for (const i of boundary) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (const [nx, nz] of g.neighbors(x, z)) {
      const j = g.idx(nx, nz);
      if (set.has(j) || g.type[j] !== OPEN || dist[j] < 0) continue;
      // gate must be a straight passage: outside neighbour opposite an arena cell
      const ox = x - (nx - x), oz = z - (nz - z);
      if (!g.in(ox, oz) || !set.has(g.idx(ox, oz)) || bset.has(g.idx(ox, oz))) continue;
      const oi = g.idx(ox, oz);
      if (!g.passable(i, oi) || !g.passable(j, i)) continue;
      if (dist[j] < best) { best = dist[j]; gate = i; gateOut = j; }
    }
  }
  if (gate < 0) return -1;
  const top = opts.top ?? Math.max(g.wallTop, 6);
  for (const i of boundary) {
    if (i === gate) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    const f = g.floor[i];
    g.solid(x, z, f + top, opts.wallTex ?? TS.ACCENT);
  }
  // the gate cell: corridor-like (solid on its two sides perpendicular to entry)
  const gx = gate % g.w, gz = (gate / g.w) | 0, ox = gateOut % g.w, oz = (gateOut / g.w) | 0;
  const ax = gz !== oz ? 1 : 0, az = gx !== ox ? 1 : 0;
  for (const s of [-1, 1]) {
    const sx = gx + ax * s, sz = gz + az * s;
    if (!g.in(sx, sz)) continue;
    const si = g.idx(sx, sz);
    if (g.type[si] && (set.has(si) || !(g.flags[si] & F.START))) g.solid(sx, sz, Math.max(g.floor[si], g.floor[gate]) + top, opts.wallTex ?? TS.ACCENT);
  }
  // give the gate a ceiling so a door can sit in it
  if (g.sky[gate]) { g.sky[gate] = 0; g.ceil[gate] = g.floor[gate] + 3; }
  return gate;
}

// Shortest path source -> target (walking back along decreasing distance).
function pathTo(g, source, target, dist) {
  const path = [];
  let cur = target;
  while (cur !== source && path.length < 4000) {
    path.push(cur);
    const x = cur % g.w, z = (cur / g.w) | 0;
    let next = -1;
    for (const [nx, nz] of g.neighbors(x, z)) {
      const j = g.idx(nx, nz);
      if (dist[j] === dist[cur] - 1 && g.passable(j, cur)) { next = j; break; }
    }
    if (next < 0) break;
    cur = next;
  }
  return path.reverse();
}

// Cells whose removal disconnects `target` from `source` (1-wide chokepoints),
// searched along the shortest path. Returns indices ordered from source.
export function findChokepoints(g, source, target, dist) {
  if (dist[target] < 0) return [];
  const path = pathTo(g, source, target, dist);
  const chokes = [];
  for (let k = 2; k < path.length - 2; k++) {
    const c = path[k];
    if (!isDoorable(g, c)) continue;
    const d2 = g.bfs([source], { blocked: (b) => b === c });
    if (d2[target] < 0) chokes.push(c);
  }
  return chokes;
}

// Door spans whose closing disconnects `target` from `source`, searched along
// the shortest path: {cells, axis, floor, d (distance of the path cell)},
// ordered from the source. Spans are up to maxW wide; a path cell with no
// walled span falls back to the old 1-cell doorable test. bfsOpts: the
// walker (jump gaps, avoided flags) so jumps around a door do not count.
export function findChokeSpans(g, source, target, dist, bfsOpts = {}, maxW = 3) {
  if (dist[target] < 0) return [];
  const path = pathTo(g, source, target, dist);
  const seen = new Set(), out = [];
  for (let k = 2; k < path.length - 2; k++) {
    const c = path[k];
    let sp = doorSpan(g, c, maxW);
    if (!sp) { const ax = isDoorable(g, c); if (ax) sp = { cells: [c], axis: ax, floor: g.floor[c] }; }
    if (!sp) continue;
    const key = Math.min(...sp.cells);
    if (seen.has(key)) continue;
    seen.add(key);
    const set = new Set(sp.cells);
    const d2 = g.bfs([source], { ...bfsOpts, blocked: (b) => set.has(b) });
    if (d2[target] < 0) { sp.d = dist[c]; out.push(sp); }
  }
  return out;
}

// A door span: a straight run of 1..maxW open cells across a passage, all on
// one floor, walled (solid cells) at both ends, and each open on both sides
// along the travel axis at about the same height. axis = travel axis ('x':
// the passage runs along x, the span runs along z). Returns
// {cells (ordered along the span), axis, floor} or null.
const SPAN_BAD = F.VOID | F.HAZARD | F.PIT | F.STAIR | F.BRIDGE | F.OBSTACLE | F.WATER | F.SCROLL;
export function doorSpan(g, i, maxW = 3) {
  if (g.type[i] !== OPEN || (g.flags[i] & SPAN_BAD) || g.edge[i]) return null;
  const W = g.w, x = i % W, z = (i / W) | 0, f = g.floor[i];
  const side = (a, b) => g.isOpen(a, b) && !(g.flags[g.idx(a, b)] & (F.VOID | F.PIT)) && Math.abs(g.minFloor(g.idx(a, b)) - f) < 0.6;
  for (const axis of ['x', 'z']) {
    const tx = axis === 'x' ? 1 : 0, tz = 1 - tx;     // travel step
    const through = (a, b) => side(a + tx, b + tz) && side(a - tx, b - tz);
    if (!through(x, z)) continue;
    let lo = 0, hi = 0, ok = true;
    for (const s of [-1, 1]) {
      for (let n = 1; ; n++) {
        const a = x + tz * s * n, b = z + tx * s * n;
        if (!g.in(a, b)) { ok = false; break; }
        const j = g.idx(a, b);
        if (g.type[j] !== OPEN) break;                // wall: this end is closed
        if ((g.flags[j] & SPAN_BAD) || g.edge[j] || Math.abs(g.floor[j] - f) > 0.01 || !through(a, b) || lo + hi + 2 > maxW) { ok = false; break; }
        if (s < 0) lo = n; else hi = n;
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const cells = [];
    for (let n = -lo; n <= hi; n++) cells.push(g.idx(x + tz * n, z + tx * n));
    return { cells, axis, floor: f };
  }
  return null;
}

// A (1-cell) door fits where the cell is open on one axis and walled on the
// other (void / pits / drops count as walls here, unlike doorSpan).
export function isDoorable(g, i) {
  if (g.type[i] !== OPEN || (g.flags[i] & (F.VOID | F.HAZARD | F.PIT | F.STAIR | F.BRIDGE | F.OBSTACLE)) || g.edge[i]) return false;
  const x = i % g.w, z = (i / g.w) | 0;
  const o = (a, b) => g.isOpen(a, b) && !(g.flags[g.idx(a, b)] & (F.VOID | F.PIT)) && Math.abs(g.minFloor(g.idx(a, b)) - g.floor[i]) < 0.6;
  const ex = o(x + 1, z), wx = o(x - 1, z), sz = o(x, z + 1), nz = o(x, z - 1);
  if (ex && wx && !sz && !nz) return 'x';
  if (sz && nz && !ex && !wx) return 'z';
  return false;
}

export function cellsInRadius(g, cx, cz, r, filter) {
  const out = [];
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if (!g.in(x, z)) continue;
    if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 > r * r) continue;
    const i = g.idx(x, z);
    if (!filter || filter(i, x, z)) out.push(i);
  }
  return out;
}

// Smooth floor heights so neighbouring open cells differ by at most maxStep
export function relaxHeights(g, maxStep = 0.5, iters = 6) {
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let z = 1; z < g.h - 1; z++) for (let x = 1; x < g.w - 1; x++) {
      const i = g.idx(x, z);
      if (g.type[i] !== OPEN || (g.flags[i] & F.VOID)) continue;
      for (const [nx, nz] of g.neighbors(x, z)) {
        const j = g.idx(nx, nz);
        if (g.type[j] !== OPEN || (g.flags[j] & F.VOID)) continue;
        if (g.floor[j] - g.floor[i] > maxStep) { g.floor[i] = g.floor[j] - maxStep; changed = true; }
      }
    }
    if (!changed) break;
  }
  // keep ceilings above floors
  for (let i = 0; i < g.w * g.h; i++) {
    if (g.type[i] === OPEN && !g.sky[i] && g.ceil[i] < g.floor[i] + 2) g.ceil[i] = g.floor[i] + 2.2;
  }
}

export function quant(v, q = 0.25) { return Math.round(v / q) * q; }
export { F, OPEN, SOLID, SKY_H, HAZ, DIR_X, DIR_Z, OPP, EDGE_BIT, clamp };
