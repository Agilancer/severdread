// Platforms over a void (layout engine: platkit.js, props: platprops.js).
//
// rooftops archetype
//  - city (skyscraper rooftops): big roofs of FACADE-walled towers at
//    different heights joined by 2-wide railed GRATE skybridges and real stair
//    flights; deliberate jump gaps (painted hazard lips, never railed); setback
//    upper roofs; stairwell huts with doors, AC units, water towers, antennas,
//    helipad PAINT markings, NEON billboards, skylights; a landmark tower and a
//    skyline of very tall FACADE towers around (and low ones in the abyss)
//  - rig (storm oil rig): GRATE decks on PILLAR legs with sloped braces over the
//    sea, cellar decks below, cranes, derrick, tanks, pipe racks, flare booms
//  - ring (orbital elevator): decks with METAL truss undersides and LIGHT
//    edge strips around the giant elevator spine, consoles, cargo, pylons
//  - spire (storm spires): stone tower tops with battlements (balustrade +
//    merlons), corbels and buttresses, turrets with conical ROOFs, wooden
//    bridges with iron rails, distant spires
// islands archetype (heaven, afterlife, digital void, sky fortress): eroded
//  floating islands with tapered ROCK undersides, terraces with stairs, railed
//  bridges, temples and columns, trees, waterfalls, pools / spike pits,
//  checker / neon decks and data monoliths, fortress battlements and towers.
import { TS, F, DIR_X, DIR_Z, newGrid, clamp } from './common.js';
import { Deco, FACE } from './deco.js';
import * as K from './platkit.js';
import * as P from './platprops.js';
import { brazier, lanternPost, deadTree, bonePile, crystalCluster, boulder, railDrops } from './natural.js';
import { neonPylon, monolith, brokenColumn, menhir } from './natprops.js';

const { LOCK, cellOf } = K;

export function genPlatforms(rng, theme, depth) {
  const id = theme.id || '';
  const p = theme.params || {};
  const islands = theme.archetype === 'islands';
  const mode = islands
    ? (id === 'afterlife' ? 'afterlife' : (p.grid || id === 'digital_void') ? 'digital' : (p.fortress || id === 'sky_fortress') ? 'fortress' : 'heaven')
    : p.rig ? 'rig' : p.ring ? 'ring' : p.spires ? 'spire' : 'city';
  const S = styleFor(mode, rng);
  const cols = mode === 'ring' ? 5 : clamp(4 + Math.floor(depth / 10), 4, 6);
  const rows = depth > 16 ? 4 : 3;
  const SLX = 17, SLZ = 16, M = S.margin;
  const W = 2 * M + cols * SLX, H = 2 * M + rows * SLZ;
  const g = newGrid(W, H, 8);
  g.floorTex.fill(S.capTex ?? TS.ROOF);
  const deco = new Deco(g, { ...theme, railStyle: S.rail }, rng);
  const light = Math.max(0.8, theme.light ?? 0.85);
  const X = K.makePlat(g, deco, rng, S, { voidY: S.voidY, light, M, SLX, SLZ, cols, rows });
  X.mode = mode; X.theme = theme; X.keep = new Uint8Array(W * H);
  globalThis.__lastPlat = X;

  K.voidAll(X);
  K.planPads(X);
  K.carvePads(X);
  K.connectAll(X);
  K.addTerraces(X, { inset: islands ? 3 : S.thin ? 1 : 0 });
  for (const pd of X.pads) if (pd.terrace) {
    const t = pd.terrace;
    for (let z = t.z0 - 1; z <= t.z0 + t.h; z++) for (let x = t.x0 - 1; x <= t.x0 + t.w; x++) if (g.in(x, z)) X.keep[cellOf(X, x, z)] = 1;
  }
  K.addPools(X, { deepChance: S.deepPools ?? 0.45 });
  // start / boss reservations before any props
  const start = pickStart(X);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { if (!g.in(start.x + dx, start.z + dz)) continue; const j = cellOf(X, start.x + dx, start.z + dz); if (X.lock[j] === LOCK.FREE) X.lock[j] = LOCK.SOFT; }
  const SK = SKINS[mode];
  if (SK.structures) SK.structures(X);
  if (islands) erode(X);
  if (S.thin) K.thinEdges(X);
  // guard rails: pads (battlements / railings), then bridge decks
  railPass(X);
  // dressing
  for (const br of X.bridges) if (br.cells.length) K.bridgeGirders(X, br, { tex: S.girder ?? TS.BEAM });
  for (const jp of X.jumps) K.paintJump(X, jp, S.jumpPaint ?? TS.PAINT);
  if (SK.under) for (const pd of X.pads) SK.under(X, pd);
  if (SK.dress) for (const pd of X.pads) if (!pd.boss) SK.dress(X, pd);
  if (SK.world) SK.world(X);
  bridgeLamps(X);
  // boss arena
  const boss = X.bossPad;
  const arena = [];
  for (const i of boss.cells) {
    if (X.owner[i] !== boss.id || g.type[i] !== 1 || X.lock[i] === LOCK.HARD) continue;
    g.flags[i] |= F.ARENA;
    arena.push(i);
    const x = i % W, z = (i / W) | 0;
    if (x > boss.x0 + 2 && x < boss.x1 - 2 && z > boss.z0 + 2 && z < boss.z1 - 2 && S.arenaFloor !== undefined) g.floorTex[i] = S.arenaFloor;
  }
  if (SK.arena) SK.arena(X, boss);
  cleanupUnreachable(X, start);
  // the map border: solid far below the void plane (no stray edge walls)
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (x > 0 && z > 0 && x < W - 1 && z < H - 1) continue;
    const i = cellOf(X, x, z);
    if (g.type[i] === 1 && (g.flags[i] & F.VOID)) { g.solid(x, z, S.voidY - 200, TS.SIDE); g.floorTex[i] = TS.SIDE; }
  }
  // soft fill light on every pad (dark themes read better)
  if (S.padLight) for (const pd of X.pads) deco.light(pd.cx, pd.y + 3, pd.cz, S.padLight, Math.max(7, Math.min(pd.w, pd.h) * 0.7));
  return {
    grid: g, deco, start, arenaCells: arena, boss: { x: boss.cx, z: boss.cz }, voidY: S.voidY, noFortify: true, jumpGap: 2,
  };
}

// ---------------------------------------------------------------- styles
function styleFor(mode, rng) {
  const base = {
    margin: 6, padMin: 9, loops: 0.35, jumps: 0.3, gates: 1, y0: 2, yMin: -1, yMax: 9, maxDh: 4.8,
    dhs: [0, 0, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3, -3], terrace: 0.55, terraceDh: [1.8, 2.4, 3.0],
    rail: 'metal', railTex: TS.RAIL, deck: TS.GRATE, deckEdge: TS.METAL, tread: TS.STAIR, stairSide: TS.METAL,
    hazards: [], pool: 0.35, padWall: () => TS.SIDE, padFloor: () => TS.FLOOR, arenaFloor: TS.FLOOR3,
    gateWall: TS.WALL2, gateFrame: TS.TRIM, gateCap: TS.ROOF, gateCeil: TS.CEIL, gateLight: [1, 0.85, 0.6],
  };
  switch (mode) {
    case 'city': return {
      ...base, margin: 10, voidY: -36, padMin: 10, holes: [1, 1], capTex: TS.ROOF,
      padWall: (X, p) => (p.facade ??= X.rng.pick([TS.FACADE, TS.FACADE, TS.FACADE2, TS.FACADE3])),
      padFloor: () => TS.ROOF, terraceFloor: TS.FLOOR, girder: TS.BEAM,
      gateWall: TS.WALL2, gateFrame: TS.METAL, gateCap: TS.ROOF, gateCeil: TS.METAL,
    };
    case 'rig': return {
      ...base, voidY: -14, thin: true, holes: [1, 1], dhs: [0, 0, 1.8, -1.8, 2.4, -2.4, 3, -3], terraceDh: [2.4, 3.0],
      padWall: () => TS.METAL, padFloor: () => TS.GRATE, terraceFloor: TS.FLOOR2, terraceWall: () => TS.METAL,
      hazards: ['poison', 'lava'], pool: 0.25, deepPools: 0.3, poolRim: TS.METAL, plank: TS.GRATE, plankUnder: TS.METAL,
      gateWall: TS.METAL, gateFrame: TS.ACCENT, gateCap: TS.METAL, gateCeil: TS.METAL, girder: TS.BEAM, capTex: TS.METAL,
    };
    case 'ring': return {
      ...base, voidY: -40, thin: true, centreHole: true, loops: 0.5, jumps: 0.25, rail: 'glass',
      padWall: () => TS.METAL, padFloor: () => TS.FLOOR, terraceFloor: TS.FLOOR2, terraceWall: () => TS.PANEL,
      gateWall: TS.WALL, gateFrame: TS.METAL, gateCap: TS.METAL, gateCeil: TS.METAL, gateLight: [0.6, 0.85, 1], girder: TS.METAL, capTex: TS.METAL,
      padLight: [0.75, 0.85, 1],
    };
    case 'spire': return {
      ...base, voidY: -30, holes: [1, 1], dhs: [0, 1.8, -1.8, 2.4, -2.4, 3, -3, 3.6, -3.6], terraceDh: [2.4, 3.0, 3.6],
      rail: 'stone', deckRail: 'iron', railTex: TS.RAIL, deck: TS.WOOD, deckEdge: TS.BEAM, stairSide: TS.SIDE,
      padWall: () => TS.WALL, padFloor: () => TS.FLOOR, terraceFloor: TS.FLOOR, terraceWall: () => TS.WALL,
      hazards: ['spikes'], pool: 0.35, plank: TS.WOOD, gateWall: TS.WALL, gateFrame: TS.TRIM, gateCap: TS.SIDE, gateCeil: TS.WOOD,
      gateLight: [1, 0.6, 0.3], capTex: TS.SIDE, girder: TS.BEAM, padLight: [0.8, 0.8, 0.9],
    };
    case 'heaven': return {
      ...base, voidY: -24, thin: true, holes: [0, 1], rail: 'metal', railTex: TS.ACCENT, deck: TS.FLOOR2, deckEdge: TS.SIDE,
      stairSide: TS.TRIM, padWall: () => TS.ROCK, padFloor: () => TS.GROUND, terraceFloor: TS.FLOOR2, terraceWall: () => TS.TRIM,
      hazards: ['water'], pool: 0.4, gateWall: TS.ACCENT, gateFrame: TS.PILLAR, gateCap: TS.TRIM, gateCeil: TS.TRIM,
      gateLight: [1, 0.9, 0.6], girder: TS.TRIM, under: TS.ROCK, arenaFloor: TS.FLOOR, capTex: TS.TRIM,
    };
    case 'afterlife': return {
      ...base, voidY: -24, thin: true, holes: [0, 1], rail: 'metal', deckRail: 'iron', railTex: TS.RAIL, deck: TS.FLOOR2, deckEdge: TS.SIDE,
      stairSide: TS.SIDE, padWall: () => TS.ROCK, padFloor: () => TS.FLOOR, terraceFloor: TS.FLOOR2, terraceWall: () => TS.WALL,
      hazards: ['poison', 'spikes'], pool: 0.45, gateWall: TS.WALL2, gateFrame: TS.TRIM, gateCap: TS.SIDE, gateCeil: TS.SIDE,
      gateLight: [0.5, 0.9, 1], girder: TS.SIDE, under: TS.ROCK, capTex: TS.SIDE, padLight: [0.55, 0.85, 0.95],
    };
    case 'digital': return {
      ...base, voidY: -24, thin: true, holes: [0, 1], rail: 'neon', railTex: TS.RAIL, deck: TS.PANEL, deckEdge: TS.METAL,
      stairSide: TS.METAL, padWall: () => TS.WALL2, padFloor: (X, pp, x, z) => ((((x >> 1) + (z >> 1)) & 1) ? TS.FLOOR : TS.FLOOR2),
      terraceFloor: TS.PANEL, terraceWall: () => TS.WALL, hazards: ['poison'], pool: 0.4, gateWall: TS.WALL, gateFrame: TS.METAL,
      gateCap: TS.METAL, gateCeil: TS.METAL, gateLight: [0.3, 0.9, 1], girder: TS.METAL, under: TS.WALL2, arenaFloor: TS.FLOOR3, capTex: TS.METAL,
      jumpPaint: TS.NEON, padLight: [0.5, 0.75, 1],
    };
    default: return { // fortress
      ...base, voidY: -24, thin: true, holes: [0, 1], rail: 'stone', deckRail: 'iron', railTex: TS.RAIL, deck: TS.WOOD, deckEdge: TS.BEAM,
      stairSide: TS.SIDE, padWall: () => TS.ROCK, padFloor: () => TS.FLOOR, terraceFloor: TS.FLOOR, terraceWall: () => TS.WALL,
      hazards: ['spikes'], pool: 0.4, plank: TS.WOOD, gateWall: TS.WALL, gateFrame: TS.TRIM, gateCap: TS.SIDE, gateCeil: TS.WOOD,
      gateLight: [1, 0.65, 0.3], girder: TS.BEAM, under: TS.ROCK, capTex: TS.SIDE, gates: 2,
    };
  }
}

// ---------------------------------------------------------------- shared passes
function pickStart(X) {
  const { g } = X;
  const sp = X.startPad;
  let best = null, bd = Infinity;
  for (const i of sp.cells) {
    if (X.owner[i] !== sp.id || X.lock[i] || g.type[i] !== 1 || (g.flags[i] & (F.STAIR | F.PIT | F.HAZARD | F.VOID))) continue;
    const x = i % X.W, z = (i / X.W) | 0;
    if (Math.abs(g.floor[i] - sp.y) > 0.01) continue;
    const d = Math.hypot(x + 0.5 - sp.cx, z + 0.5 - sp.cz);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  return best || { x: Math.floor(sp.cx), z: Math.floor(sp.cz) };
}

function erode(X) {
  const lk = X.lock;
  // temporarily protect terrace rings
  const saved = [];
  for (let i = 0; i < X.N; i++) if (X.keep[i] && lk[i] === LOCK.FREE) { lk[i] = LOCK.SOFT; saved.push(i); }
  K.erodePads(X, { depth: 3 });
  for (const i of saved) if (lk[i] === LOCK.SOFT) lk[i] = LOCK.FREE;
}

function railPass(X) {
  const { g, deco, S } = X;
  const padCells = [];
  for (const pd of X.pads) for (const i of pd.cells) if (X.owner[i] === pd.id) padCells.push(i);
  for (const f of X.flights) padCells.push(...f.cells);
  for (const pl of X.pools || []) if (pl.plank) padCells.push(...pl.plank);
  railDrops(g, deco, padCells, { allow: X.allow, inner: true, style: S.rail, tex: S.railTex });
  railDrops(g, deco, X.deckCells, { allow: X.allow, inner: true, style: S.deckRail ?? S.rail, tex: S.deckRail === 'iron' ? TS.RAIL : S.railTex });
}

// lamps on the bridge rails (city / rig / ring) or lanterns (others)
function bridgeLamps(X) {
  const { deco, S, rng } = X;
  const col = S.lamp ?? (X.mode === 'ring' || X.mode === 'digital' ? [0.5, 0.85, 1] : X.mode === 'spire' || X.mode === 'fortress' ? [1, 0.6, 0.3] : [1, 0.9, 0.7]);
  for (const br of X.bridges) {
    const len = br.eB - br.eA - 1;
    if (len < 3) continue;
    const a = br.eA + 1 + Math.floor(len / 2) + 0.5;
    for (const pp of [br.b + 0.06, br.b + br.bw - 0.06]) {
      const [x, z] = br.ax ? [a, pp] : [pp, a];
      deco.box(x - 0.09, br.y + 1.0, z - 0.09, x + 0.09, br.y + 1.22, z + 0.09, TS.LIGHT, { emissive: 1, uv: 'fit' });
    }
    const [lx, lz] = br.ax ? [a, br.b + br.bw / 2] : [br.b + br.bw / 2, a];
    deco.light(lx, br.y + 1.6, lz, col, 5.5);
    void rng;
  }
}

// convert unreachable leftovers (cut off by props) into obstacles / void
function cleanupUnreachable(X, start) {
  const { g } = X;
  const dist = g.bfs([cellOf(X, start.x, start.z)], { jumpGap: 2 });
  for (let i = 0; i < X.N; i++) {
    if (g.type[i] !== 1 || dist[i] >= 0 || (g.flags[i] & (F.VOID | F.PIT | F.HAZARD | F.OBSTACLE))) continue;
    g.flags[i] |= F.NOSPAWN;
  }
}

// place up to n props of footprint w x h on pad p; fn(x, z, y, r) builds it
function placeSome(X, p, n, w, h, fn, o = {}) {
  let placed = 0;
  for (let k = 0; k < n; k++) {
    const r = K.findRect(X, p, w, h, o);
    if (!r) break;
    fn(r.x, r.z, r.y, r);
    K.occupy(X, r.x, r.z, w, h);
    placed++;
  }
  return placed;
}
const padArea = (p) => p.cells.length;

// distant decorative islands (deco only) in the margin
function farIslands(X, tex = TS.ROCK, topTex = TS.GROUND, n = 10) {
  const { deco, rng, W, H, M } = X;
  for (let k = 0; k < n; k++) {
    const side = rng.int(0, 3);
    const x = side === 0 ? rng.float(-6, M - 3) : side === 1 ? rng.float(W - M + 3, W + 6) : rng.float(0, W);
    const z = side === 2 ? rng.float(-6, M - 3) : side === 3 ? rng.float(H - M + 3, H + 6) : side < 2 ? rng.float(0, H) : 0;
    const zz = side >= 2 ? z : z;
    const y = rng.float(-6, 14), r = rng.float(2, 5);
    deco.box(x - r, y - 0.8, zz - r * 0.8, x + r, y, zz + r * 0.8, { side: tex, top: topTex, bottom: tex }, { s: 2 });
    deco.box(x - r * 0.7, y - 2.6, zz - r * 0.55, x + r * 0.7, y - 0.8, zz + r * 0.55, tex, { faces: FACE.SIDES | FACE.BOTTOM, s: 2 });
    deco.box(x - r * 0.35, y - 4.6, zz - r * 0.3, x + r * 0.35, y - 2.6, zz + r * 0.3, tex, { faces: FACE.SIDES | FACE.BOTTOM, s: 2 });
  }
}

// a sheet of falling liquid just outside the lip of edge cell (x,z) toward d
function fall(deco, x, z, d, y0, y1, tex, color) {
  const t = 0.1, w0 = 0.15, w1 = 0.85;
  if (d === 0) deco.box(x + 1.01, y1, z + w0, x + 1.01 + t, y0, z + w1, tex, { emissive: 0.85, s: 2 });
  else if (d === 1) deco.box(x - 0.01 - t, y1, z + w0, x - 0.01, y0, z + w1, tex, { emissive: 0.85, s: 2 });
  else if (d === 2) deco.box(x + w0, y1, z + 1.01, x + w1, y0, z + 1.01 + t, tex, { emissive: 0.85, s: 2 });
  else deco.box(x + w0, y1, z - 0.01 - t, x + w1, y0, z - 0.01, tex, { emissive: 0.85, s: 2 });
  if (color) deco.light(x + 0.5 + DIR_X[d] * 0.9, y0 - 1, z + 0.5 + DIR_Z[d] * 0.9, color, 5, { pulse: true });
}
// void-facing edges grouped into straight runs at one height: [{d, y, cells:[{x,z,i}]}]
function edgeRuns(X, p, all = false) {
  const { g } = X;
  const ed = K.voidEdges(X, p).filter((e) => all || (!X.allow.has(e.i) && X.lock[e.i] !== LOCK.HARD));
  const key = (e) => `${e.d}|${e.d < 2 ? e.x : e.z}|${g.floor[e.i].toFixed(2)}`;
  const groups = new Map();
  for (const e of ed) { const k = key(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const runs = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.d < 2 ? a.z - b.z : a.x - b.x));
    let cur = [arr[0]];
    const flush = () => runs.push({ d: cur[0].d, y: g.floor[cur[0].i], cells: cur });
    for (let k = 1; k < arr.length; k++) {
      const prev = arr[k - 1], e = arr[k];
      if ((e.d < 2 ? e.z - prev.z : e.x - prev.x) === 1) cur.push(e); else { flush(); cur = [e]; }
    }
    flush();
  }
  return runs;
}
// one band box along a whole edge run (y0/y1 relative to the run's floor)
function runBand(deco, run, y0, y1, tex, out = 0, inn = 0.22, o = {}) {
  const a = run.cells[0], b = run.cells[run.cells.length - 1], d = run.d, y = run.y;
  if (d === 0) deco.box(a.x + 1 - inn, y + y0, a.z, a.x + 1 + out, y + y1, b.z + 1, tex, o);
  else if (d === 1) deco.box(a.x - out, y + y0, a.z, a.x + inn, y + y1, b.z + 1, tex, o);
  else if (d === 2) deco.box(a.x, y + y0, a.z + 1 - inn, b.x + 1, y + y1, a.z + 1 + out, tex, o);
  else deco.box(a.x, y + y0, a.z - out, b.x + 1, y + y1, a.z + inn, tex, o);
}
function bands(X, p, y0, y1, tex, out, inn, o) { for (const r of edgeRuns(X, p, true)) runBand(X.deco, r, y0, y1, tex, out, inn, o); }

// ---------------------------------------------------------------- skins
const SKINS = {
  city: {
    structures(X) {
      const { g, rng } = X;
      // landmark tower in the hole slot
      for (const col of X.slots) for (const s of col) {
        if (!s.hole) continue;
        const maxY = Math.max(...X.pads.map((q) => q.y));
        const x0 = s.sx0 + 3, z0 = s.sz0 + 3, w = X.SLX - 6, h = X.SLZ - 6;
        const top = maxY + rng.int(14, 26);
        const tex = rng.pick([TS.FACADE2, TS.FACADE]);
        for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) { g.solid(x, z, top, tex); g.floorTex[cellOf(X, x, z)] = TS.ROOF; }
        s.tower = { x0, z0, w, h, top, tex };
      }
      // stairwell huts (solid blocks with a door on one face)
      for (const p of X.pads) {
        if (p.boss || !X.rng.chance(0.7)) continue;
        const along = rng.chance(0.5);
        const w = along ? 3 : 2, h = along ? 2 : 3;
        const r = K.findRect(X, p, w, h, { ring: 1, ringFlat: true });
        if (!r) continue;
        const top = r.y + 3.1;
        for (let z = r.z; z < r.z + h; z++) for (let x = r.x; x < r.x + w; x++) { g.solid(x, z, top, TS.WALL2); g.floorTex[cellOf(X, x, z)] = TS.ROOF; X.owner[cellOf(X, x, z)] = -3; }
        K.occupy(X, r.x - 1, r.z - 1, w + 2, h + 2, LOCK.SOFT);
        K.occupy(X, r.x, r.z, w, h);
        p.hut = { ...r, top };
      }
    },
    dress(X, p) {
      const { g, deco, rng } = X;
      // roof edge: parapet coping on top, cornice band below the roof line
      bands(X, p, 0, 0.28, TS.TRIM, 0.04, 0.24);
      bands(X, p, -0.75, -0.3, TS.TRIM, 0.16, 0, { faces: FACE.SIDES | FACE.BOTTOM | FACE.TOP });
      if (p.hut) {
        const h = p.hut;
        // door + lamp on a long face that has walkable floor in front
        const faces = h.w >= h.h ? [[h.x + 1, h.z - 1, 2], [h.x + 1, h.z + h.h, 3]] : [[h.x - 1, h.z + 1, 0], [h.x + h.w, h.z + 1, 1]];
        for (const [fx, fz, d] of faces) {
          const i = cellOf(X, fx, fz);
          if (g.type[i] !== 1 || Math.abs(g.floor[i] - h.y) > 0.01) continue;
          // the door sits on the hut wall facing cell (fx, fz)
          const wx = d === 0 ? fx + 1 : d === 1 ? fx : fx + 0.15, wz = d === 2 ? fz + 1 : d === 3 ? fz : fz + 0.15;
          if (d < 2) deco.box(wx - (d === 0 ? 0.04 : 0), h.y, fz + 0.12, wx + (d === 1 ? 0.04 : 0), h.y + 2.2, fz + 0.88, TS.DOOR, { uv: 'fit' });
          else deco.box(fx + 0.12, h.y, wz - (d === 2 ? 0.04 : 0), fx + 0.88, h.y + 2.2, wz + (d === 3 ? 0.04 : 0), TS.DOOR, { uv: 'fit' });
          deco.wallLight(fx, fz, d, h.y + 2.45, [1, 0.85, 0.6], { radius: 5 });
          break;
        }
        // roof clutter on the hut
        P.ventStack(deco, h.x + 0.5, h.z + 0.5, h.top, 0.8);
        if (rng.chance(0.5)) P.antenna(deco, h.x + h.w - 0.5, h.z + h.h - 0.5, h.top, rng.float(3, 6));
      }
      const big = padArea(p) > 120;
      if (!p.start && big && (X.helis ?? 0) < 2 && rng.chance(0.55)) {
        const r = K.findRect(X, p, 6, 6, { ring: 0 });
        if (r) { P.helipad(deco, r.x + 3, r.z + 3, r.y, 2.2); K.occupy(X, r.x, r.z, 6, 6, LOCK.SOFT); X.helis = (X.helis ?? 0) + 1; deco.light(r.x + 3, r.y + 2, r.z + 3, [1, 0.95, 0.8], 6); }
      }
      if (rng.chance(0.45)) placeSome(X, p, 1, 2, 2, (x, z, y) => P.waterTower(deco, x + 1, z + 1, y, rng.float(0.9, 1.1)));
      if (p.terrace && rng.chance(0.7)) {
        const t = p.terrace;
        placeSome(X, p, 1, 2, 2, (x, z, y) => (rng.chance(0.5) ? P.waterTower(deco, x + 1, z + 1, y) : P.antenna(deco, x + 1, z + 1, y, rng.float(6, 10))), { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 });
      }
      placeSome(X, p, rng.int(1, 3), 2, 1, (x, z, y) => P.acUnit(deco, x + 1, z + 0.5, y, true));
      placeSome(X, p, rng.int(0, 2), 1, 2, (x, z, y) => P.acUnit(deco, x + 0.5, z + 1, y, false));
      placeSome(X, p, rng.int(0, 2), 2, 1, (x, z, y) => P.skylight(deco, x + 1, z + 0.5, y, true));
      placeSome(X, p, rng.int(0, 2), 1, 1, (x, z, y) => P.ventStack(deco, x + 0.5, z + 0.5, y, rng.float(1, 1.8)));
      if (rng.chance(0.3)) placeSome(X, p, 1, 1, 1, (x, z, y) => P.antenna(deco, x + 0.5, z + 0.5, y, rng.float(5, 9)));
      // neon billboard along one long roof edge, facing out over the street
      if (rng.chance(0.55)) {
        const runs = edgeRuns(X, p).filter((r) => r.cells.length >= 5);
        if (runs.length) {
          const run = rng.pick(runs);
          const len = Math.min(5, run.cells.length - 1);
          const c0 = run.cells[Math.floor((run.cells.length - len) / 2)];
          const y = g.floor[c0.i], d = run.d;
          const col = rng.pick([[1, 0.3, 0.8], [0.3, 0.9, 1], [1, 0.8, 0.2]]);
          if (d >= 2) P.billboard(deco, c0.x, d === 2 ? c0.z + 0.7 : c0.z + 0.3, len, y, d, { color: col });
          else P.billboard(deco, d === 0 ? c0.x + 0.7 : c0.x + 0.3, c0.z, len, y, d, { color: col });
        }
      }
    },
    world(X) { skyline(X); },
    arena(X, b) {
      const { deco } = X;
      P.helipad(deco, b.cx, b.cz, b.y, 3.2);
      for (const [x, z] of [[b.x0 + 1.5, b.z0 + 1.5], [b.x1 - 0.5, b.z0 + 1.5], [b.x0 + 1.5, b.z1 - 0.5], [b.x1 - 0.5, b.z1 - 0.5]]) deco.streetLamp(x, z, b.y, { height: 3.6, armX: 0, color: [1, 0.4, 0.3] });
      bands(X, b, 0, 0.28, TS.TRIM, 0.04, 0.24);
      bands(X, b, -0.75, -0.3, TS.TRIM, 0.16, 0);
    },
  },

  rig: {
    structures(X) { void X; },
    under(X, p) {
      const { deco, rng } = X;
      const y = p.y - 0.35, x0 = p.x0, z0 = p.z0, x1 = p.x1 + 1, z1 = p.z1 + 1;
      deco.box(x0 + 0.05, y - 0.55, z0 + 0.05, x1 - 0.05, y, z1 - 0.05, TS.BEAM, { faces: FACE.SIDES | FACE.BOTTOM });
      // legs at corners and along the edges, braced
      const legs = [];
      const xs = [x0 + 0.6], zs = [z0 + 0.6];
      for (let x = x0 + 5; x < x1 - 3; x += 5) xs.push(x);
      for (let z = z0 + 5; z < z1 - 3; z += 5) zs.push(z);
      xs.push(x1 - 0.6); zs.push(z1 - 0.6);
      for (const x of xs) for (const z of [z0 + 0.6, z1 - 0.6]) legs.push([x, z]);
      for (const z of zs.slice(1, -1)) for (const x of [x0 + 0.6, x1 - 0.6]) legs.push([x, z]);
      for (const [x, z] of legs) deco.box(x - 0.35, X.VOID_Y - 1, z - 0.35, x + 0.35, y - 0.55, z + 0.35, TS.PILLAR, { faces: FACE.SIDES, s: 2 });
      // cellar deck lower down (visual)
      const cy = y - rng.float(4.5, 6);
      deco.box(x0 + 0.8, cy - 0.3, z0 + 0.8, x1 - 0.8, cy, z1 - 0.8, { top: TS.GRATE, side: TS.BEAM, bottom: TS.BEAM }, {});
      for (let k = 0; k < 2; k++) P.tank(deco, rng.float(x0 + 2, x1 - 2), rng.float(z0 + 2, z1 - 2), cy, 0.9);
      // X braces between corner legs on the outer faces
      const yb0 = X.VOID_Y + 2, yb1 = cy - 0.3;
      for (const z of [z0 + 0.6, z1 - 0.6]) for (let k = 0; k < xs.length - 1; k++) {
        deco.bar([xs[k], yb0, z], [xs[k + 1], yb1, z], 0.16, 0.16, TS.BEAM);
        deco.bar([xs[k + 1], yb0, z], [xs[k], yb1, z], 0.16, 0.16, TS.BEAM);
      }
      for (const x of [x0 + 0.6, x1 - 0.6]) for (let k = 0; k < zs.length - 1; k++) {
        deco.bar([x, yb0, zs[k]], [x, yb1, zs[k + 1]], 0.16, 0.16, TS.BEAM);
      }
      // hazard-striped deck lip
      bands(X, p, -0.34, -0.02, TS.ACCENT, 0.03, 0, { faces: FACE.SIDES });
    },
    dress(X, p) {
      const { deco, rng, g } = X;
      // crane on a corner, boom out over the sea
      if (rng.chance(0.55)) {
        const cs = [[p.x0 + 1, p.z0 + 1, 3], [p.x1 - 2, p.z0 + 1, 3], [p.x0 + 1, p.z1 - 2, 2], [p.x1 - 2, p.z1 - 2, 2]];
        rng.shuffle(cs);
        for (const [x, z, d] of cs) {
          if (!K.freeRect(X, x, z, 2, 2, { ring: 0 })) continue;
          const dir = rng.chance(0.5) ? d : (x < p.cx ? 1 : 0);
          P.crane(deco, x + 1, z + 1, g.floor[cellOf(X, x, z)], dir, { height: rng.float(6, 8.5), boom: rng.float(6, 9) });
          K.occupy(X, x, z, 2, 2);
          break;
        }
      }
      if (!X.derrick && !p.start && padArea(p) > 100) {
        if (placeSome(X, p, 1, 3, 3, (x, z, y) => P.derrick(deco, x + 1.5, z + 1.5, y, rng.float(9, 12)))) X.derrick = true;
      }
      if (p.terrace && rng.chance(0.6)) {
        const t = p.terrace;
        placeSome(X, p, 1, 2, 2, (x, z, y) => P.tank(deco, x + 1, z + 1, y), { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 });
      }
      placeSome(X, p, rng.int(1, 2), 2, 2, (x, z, y) => P.tank(deco, x + 1, z + 1, y, rng.float(0.85, 1.05)));
      placeSome(X, p, rng.int(0, 1), 3, 2, (x, z, y) => deco.container(x, z + 0.35, y, true, { tex: TS.CRATE2 }));
      placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => deco.crateStack(x + 0.5, z + 0.5, y, { tex: TS.CRATE }));
      // pipe rack along a side, one cell in from the edge
      if (rng.chance(0.6)) {
        const alongX = rng.chance(0.5);
        const len = rng.int(4, 6);
        const r = alongX ? K.findRect(X, p, len, 1, { ring: 1 }) : K.findRect(X, p, 1, len, { ring: 1 });
        if (r) {
          if (alongX) P.pipeRack(deco, true, r.x, len, r.z + 0.5, r.y); else P.pipeRack(deco, false, r.z, len, r.x + 0.5, r.y);
          K.occupy(X, r.x, r.z, alongX ? len : 1, alongX ? 1 : len);
        }
      }
      // flood lights on posts
      placeSome(X, p, 1, 1, 1, (x, z, y) => deco.streetLamp(x + 0.5, z + 0.5, y, { height: 3.4, armX: 0.4, color: [1, 0.95, 0.85], radius: 8 }));
      if (!X.flare && rng.chance(0.4)) {
        const runs = edgeRuns(X, p).filter((r) => r.cells.length >= 3);
        if (runs.length) {
          const run = rng.pick(runs), c = run.cells[1];
          P.flareBoom(deco, c.x + 0.5, c.z + 0.5, g.floor[c.i] + 0.2, run.d, 5);
          X.flare = true;
        }
      }
    },
    world(X) {
      const { deco, rng } = X;
      const maxY = Math.max(...X.pads.map((q) => q.y));
      for (const col of X.slots) for (const s of col) {
        if (!s.hole) continue;
        // flare stack tower standing in the sea
        const x = s.sx0 + X.SLX / 2, z = s.sz0 + X.SLZ / 2;
        for (const [ox, oz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) deco.box(x + ox - 0.3, X.VOID_Y - 1, z + oz - 0.3, x + ox + 0.3, maxY - 2, z + oz + 0.3, TS.PILLAR, { faces: FACE.SIDES });
        deco.box(x - 2.2, maxY - 2.6, z - 2.2, x + 2.2, maxY - 2, z + 2.2, { top: TS.GRATE, side: TS.BEAM, bottom: TS.BEAM });
        deco.box(x - 0.45, maxY - 2, z - 0.45, x + 0.45, maxY + 12, z + 0.45, TS.PIPE, { faces: FACE.SIDES });
        deco.box(x - 0.6, maxY + 12, z - 0.6, x + 0.6, maxY + 13.4, z + 0.6, TS.LIGHT, { emissive: 1, uv: 'fit' });
        deco.box(x - 0.3, maxY + 13.4, z - 0.3, x + 0.3, maxY + 14.6, z + 0.3, TS.LIGHT, { emissive: 1, uv: 'fit' });
        deco.light(x, maxY + 12.5, z, [1, 0.5, 0.15], 14, { flicker: true });
      }
      // distant rigs on the horizon
      for (let k = 0; k < 5; k++) {
        const side = rng.int(0, 3);
        const x = side === 0 ? -rng.float(8, 20) : side === 1 ? X.W + rng.float(8, 20) : rng.float(0, X.W);
        const z = side === 2 ? -rng.float(8, 20) : side === 3 ? X.H + rng.float(8, 20) : rng.float(0, X.H);
        const y = rng.float(0, 6), s = rng.float(4, 7);
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) deco.box(x + ox * s * 0.8 - 0.35, X.VOID_Y - 1, z + oz * s * 0.8 - 0.35, x + ox * s * 0.8 + 0.35, y, z + oz * s * 0.8 + 0.35, TS.PILLAR, { faces: FACE.SIDES });
        deco.box(x - s, y, z - s, x + s, y + 1.2, z + s, { side: TS.BEAM, top: TS.METAL, bottom: TS.BEAM });
        deco.box(x - s * 0.5, y + 1.2, z - s * 0.4, x + s * 0.3, y + 4, z + s * 0.5, TS.METAL);
        deco.bar([x + s * 0.6, y + 1.2, z], [x + s * 0.6, y + 11, z], 0.4, 0.4, TS.BEAM);
        deco.box(x + s * 0.6 - 0.3, y + 11, z - 0.3, x + s * 0.6 + 0.3, y + 11.8, z + 0.3, TS.LIGHT, { emissive: 1, uv: 'fit' });
      }
    },
    arena(X, b) {
      const { deco } = X;
      P.helipad(deco, b.cx, b.cz, b.y, 3.2);
      for (const [x, z] of [[b.x0 + 1.5, b.z0 + 1.5], [b.x1 - 0.5, b.z0 + 1.5], [b.x0 + 1.5, b.z1 - 0.5], [b.x1 - 0.5, b.z1 - 0.5]]) deco.streetLamp(x, z, b.y, { height: 3.8, armX: 0, color: [1, 0.85, 0.6], radius: 9 });
      SKINS.rig.under(X, b);
    },
  },

  ring: {
    structures(X) {
      const { g, rng } = X;
      for (const col of X.slots) for (const s of col) {
        if (!s.hole) continue;
        // the elevator spine: a giant column rising out of sight
        const w = 6, h = 6;
        const x0 = s.sx0 + Math.floor((X.SLX - w) / 2), z0 = s.sz0 + Math.floor((X.SLZ - h) / 2);
        for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) { g.solid(x, z, 60, TS.WALL); g.floorTex[cellOf(X, x, z)] = TS.METAL; }
        s.spine = { x0, z0, w, h };
        const deco = X.deco;
        // light strips running up each face and collars every few metres
        for (let k = 1; k < w; k += 2) {
          deco.box(x0 + k - 0.08, X.VOID_Y, z0 - 0.06, x0 + k + 0.08, 60, z0, TS.LIGHT, { emissive: 1, uv: 'world' });
          deco.box(x0 + k - 0.08, X.VOID_Y, z0 + h, x0 + k + 0.08, 60, z0 + h + 0.06, TS.LIGHT, { emissive: 1 });
          deco.box(x0 - 0.06, X.VOID_Y, z0 + k - 0.08, x0, 60, z0 + k + 0.08, TS.LIGHT, { emissive: 1 });
          deco.box(x0 + w, X.VOID_Y, z0 + k - 0.08, x0 + w + 0.06, 60, z0 + k + 0.08, TS.LIGHT, { emissive: 1 });
        }
        for (let y = X.VOID_Y + 4; y < 60; y += rng.int(5, 8)) deco.box(x0 - 0.3, y, z0 - 0.3, x0 + w + 0.3, y + 0.5, z0 + h + 0.3, TS.TRIM, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
        // a docked elevator car
        const cy = rng.float(2, 6);
        deco.box(x0 + 1.5, cy, z0 - 1.8, x0 + w - 1.5, cy + 3.2, z0, { side: TS.GLASS, top: TS.METAL, bottom: TS.METAL }, { emissive: 0.2, uv: 'fit' });
        deco.light(x0 + w / 2, cy + 1.6, z0 - 1.2, [0.6, 0.85, 1], 7);
      }
    },
    under(X, p) {
      const { deco, rng } = X;
      const y = p.y - 0.35, x0 = p.x0, z0 = p.z0, x1 = p.x1 + 1, z1 = p.z1 + 1;
      deco.box(x0 + 0.05, y - 0.5, z0 + 0.05, x1 - 0.05, y, z1 - 0.05, TS.METAL, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 + 1.5, y - 1.7, z0 + 1.5, x1 - 1.5, y - 0.5, z1 - 1.5, TS.PANEL, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 + 3.5, y - 3.2, z0 + 3.5, x1 - 3.5, y - 1.7, z1 - 3.5, { side: TS.MACHINE, bottom: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box((x0 + x1) / 2 - 0.3, y - 6, (z0 + z1) / 2 - 0.3, (x0 + x1) / 2 + 0.3, y - 3.2, (z0 + z1) / 2 + 0.3, TS.METAL, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box((x0 + x1) / 2 - 0.2, y - 6.4, (z0 + z1) / 2 - 0.2, (x0 + x1) / 2 + 0.2, y - 6, (z0 + z1) / 2 + 0.2, TS.LIGHT, { emissive: 1 });
      // glowing edge strips under the deck lip
      bands(X, p, -0.34, -0.22, TS.LIGHT, 0.03, 0, { emissive: 1, faces: FACE.SIDES });
      void rng;
    },
    dress(X, p) {
      const { deco, rng, g } = X;
      // consoles along the inner side of edge rails
      placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => deco.console(x, z, y, rng.int(0, 3)));
      placeSome(X, p, rng.int(0, 1), 3, 2, (x, z, y) => deco.container(x, z + 0.35, y, true, { tex: TS.CRATE2 }));
      placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => deco.crateStack(x + 0.5, z + 0.5, y, { tex: TS.CRATE }));
      placeSome(X, p, 1, 1, 1, (x, z, y) => neonPylon(deco, x + 0.5, z + 0.5, y, rng.float(3, 4.5), [0.5, 0.85, 1]));
      if (p.terrace) {
        const t = p.terrace;
        // solar array on the upper deck
        placeSome(X, p, 2, 2, 1, (x, z, y) => {
          deco.box(x + 0.9, y, z + 0.4, x + 1.1, y + 1.1, z + 0.6, TS.METAL, { solid: true });
          deco.box(x, y + 1.1, z - 0.1, x + 2, y + 1.2, z + 1.1, { top: TS.GLASS, side: TS.METAL, bottom: TS.METAL }, { emissive: 0.15 });
        }, { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 });
      }
      // antenna dish
      if (rng.chance(0.4)) placeSome(X, p, 1, 1, 1, (x, z, y) => {
        deco.box(x + 0.35, y, z + 0.35, x + 0.65, y + 1.4, z + 0.65, TS.METAL, { solid: true });
        deco.box(x - 0.2, y + 1.4, z - 0.2, x + 1.2, y + 1.55, z + 1.2, TS.METAL);
        deco.box(x + 0.4, y + 1.55, z + 0.4, x + 0.6, y + 2.3, z + 0.6, TS.METAL);
        deco.box(x + 0.42, y + 2.3, z + 0.42, x + 0.58, y + 2.45, z + 0.58, TS.LIGHT, { emissive: 1 });
      });
      void g;
    },
    arena(X, b) {
      SKINS.ring.under(X, b);
      const { deco } = X;
      for (const [x, z] of [[b.x0 + 1.5, b.z0 + 1.5], [b.x1 - 0.5, b.z0 + 1.5], [b.x0 + 1.5, b.z1 - 0.5], [b.x1 - 0.5, b.z1 - 0.5]]) neonPylon(deco, x, z, b.y, 4.5, [1, 0.35, 0.3]);
    },
  },

  spire: {
    structures(X) {
      const { g, rng } = X;
      const maxY = Math.max(...X.pads.map((q) => q.y));
      for (const col of X.slots) for (const s of col) {
        if (!s.hole) continue;
        const w = 5, h = 5, x0 = s.sx0 + 6, z0 = s.sz0 + 5;
        const top = maxY + rng.int(10, 16);
        for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) { g.solid(x, z, top, TS.WALL); g.floorTex[cellOf(X, x, z)] = TS.SIDE; }
        s.spire = { x0, z0, w, h, top };
      }
      // corner turrets (2x2 solid, part of the tower)
      for (const p of X.pads) {
        if (p.boss) continue;
        const cs = [[p.x0, p.z0], [p.x1 - 1, p.z0], [p.x0, p.z1 - 1], [p.x1 - 1, p.z1 - 1]];
        let n = 0;
        for (const [x, z] of rng.shuffle(cs)) {
          if (n >= 2 || !rng.chance(0.6)) continue;
          let ok = true;
          for (let dz = -1; dz <= 2 && ok; dz++) for (let dx = -1; dx <= 2 && ok; dx++) {
            const xx = x + dx, zz = z + dz;
            if (xx < p.x0 || zz < p.z0 || xx > p.x1 || zz > p.z1) continue;
            const i = cellOf(X, xx, zz);
            if (X.owner[i] !== p.id || X.lock[i] === LOCK.HARD || X.lock[i] === LOCK.PROP || Math.abs(g.floor[i] - p.y) > 0.01 || (g.flags[i] & (F.STAIR | F.PIT))) ok = false;
          }
          if (!ok) continue;
          const top = p.y + rng.float(4, 6.5);
          for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) { const i = cellOf(X, x + dx, z + dz); g.solid(x + dx, z + dz, top, TS.WALL); g.floorTex[i] = TS.SIDE; X.owner[i] = -3; }
          K.occupy(X, x, z, 2, 2);
          (X.turrets || (X.turrets = [])).push({ x, z, top, p });
          n++;
        }
      }
    },
    under(X, p) {
      const { deco, g } = X;
      // corbelled parapet band and buttresses down the tower faces
      bands(X, p, -0.9, -0.02, TS.TRIM, 0.28, 0, { faces: FACE.SIDES | FACE.BOTTOM });
      for (const e of K.voidEdges(X, p)) {
        const y = g.floor[e.i];
        if (((e.d < 2 ? e.z : e.x) % 4) === 0) {
          const t = 0.22;
          if (e.d === 0) deco.box(e.x + 1, y - 14, e.z + 0.5 - t, e.x + 1.35, y - 0.9, e.z + 0.5 + t, TS.SIDE, { faces: FACE.SIDES | FACE.BOTTOM });
          else if (e.d === 1) deco.box(e.x - 0.35, y - 14, e.z + 0.5 - t, e.x, y - 0.9, e.z + 0.5 + t, TS.SIDE, { faces: FACE.SIDES | FACE.BOTTOM });
          else if (e.d === 2) deco.box(e.x + 0.5 - t, y - 14, e.z + 1, e.x + 0.5 + t, y - 0.9, e.z + 1.35, TS.SIDE, { faces: FACE.SIDES | FACE.BOTTOM });
          else deco.box(e.x + 0.5 - t, y - 14, e.z - 0.35, e.x + 0.5 + t, y - 0.9, e.z, TS.SIDE, { faces: FACE.SIDES | FACE.BOTTOM });
        }
      }
    },
    dress(X, p) {
      const { deco, rng } = X;
      merlons(X, p);
      placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => brazier(deco, x + 0.5, z + 0.5, y, [1, 0.55, 0.25], { radius: 6.5 }));
      if (rng.chance(0.4)) placeSome(X, p, 1, 1, 1, (x, z, y) => P.lightningRod(deco, x + 0.5, z + 0.5, y, rng.float(3, 4.5)));
      if (p.terrace && rng.chance(0.75)) {
        const t = p.terrace;
        placeSome(X, p, 1, 2, 2, (x, z, y) => {
          deco.box(x + 0.1, y, z + 0.1, x + 1.9, y + 3.2, z + 1.9, TS.WALL, { solid: true });
          P.coneRoof(deco, x + 1, z + 1, y + 3.2, 1.25, 4.5, TS.ROOF, { finial: 1.6 });
          P.banner(deco, x, z, 3, y + 0.8, y + 2.8);
        }, { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 });
      }
    },
    world(X) {
      const { deco, rng, g } = X;
      for (const t of X.turrets || []) {
        P.coneRoof(deco, t.x + 1, t.z + 1, t.top, 1.3, rng.float(3.5, 5.5), TS.ROOF, { finial: 1.4 });
        deco.box(t.x - 0.1, t.top - 0.5, t.z - 0.1, t.x + 2.1, t.top, t.z + 2.1, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
      }
      for (const col of X.slots) for (const s of col) {
        if (!s.spire) continue;
        const sp = s.spire;
        P.coneRoof(deco, sp.x0 + sp.w / 2, sp.z0 + sp.h / 2, sp.top, sp.w / 2 + 0.3, 9, TS.ROOF, { steps: 8, finial: 2.5 });
        deco.box(sp.x0 - 0.3, sp.top - 0.8, sp.z0 - 0.3, sp.x0 + sp.w + 0.3, sp.top, sp.z0 + sp.h + 0.3, TS.TRIM);
        deco.light(sp.x0 + sp.w / 2, sp.top + 3, sp.z0 + sp.h / 2, [0.6, 0.75, 1], 8, { pulse: true });
      }
      // distant spires around the play area
      const maxY = Math.max(...X.pads.map((q) => q.y));
      for (let k = 0; k < 14; k++) {
        const side = rng.int(0, 3);
        const x = side === 0 ? rng.float(-10, X.M - 3) : side === 1 ? rng.float(X.W - X.M + 3, X.W + 10) : rng.float(-4, X.W + 4);
        const z = side === 2 ? rng.float(-10, X.M - 3) : side === 3 ? rng.float(X.H - X.M + 3, X.H + 10) : rng.float(-4, X.H + 4);
        const r = rng.float(1.5, 3), top = maxY + rng.float(-6, 14);
        deco.box(x - r, X.VOID_Y, z - r, x + r, top, z + r, TS.WALL, { faces: FACE.SIDES | FACE.TOP, s: 2 });
        P.coneRoof(deco, x, z, top, r + 0.3, r * 3.2, TS.ROOF, { finial: 1.8 });
      }
      void g;
    },
    arena(X, b) {
      SKINS.spire.under(X, b);
      merlons(X, b);
      const { deco } = X;
      for (const [x, z] of [[b.x0 + 1.5, b.z0 + 1.5], [b.x1 - 0.5, b.z0 + 1.5], [b.x0 + 1.5, b.z1 - 0.5], [b.x1 - 0.5, b.z1 - 0.5]]) brazier(deco, x, z, b.y, [1, 0.5, 0.2], { radius: 8 });
    },
  },

  heaven: islandSkin('heaven'),
  afterlife: islandSkin('afterlife'),
  digital: islandSkin('digital'),
  fortress: islandSkin('fortress'),
};

// battlement merlons on stone rails facing the void
function merlons(X, p) {
  const { g, deco } = X;
  for (const e of K.voidEdges(X, p)) {
    if (!(g.edge[e.i] & (1 << e.d))) continue;
    if (((e.d < 2 ? e.z : e.x) & 1) === 0) P.merlon(deco, e.x, e.z, e.d, g.floor[e.i] + 0.95, TS.SIDE);
  }
}

// ---------------------------------------------------------------- islands
function islandSkin(kind) {
  const glow = kind === 'digital' ? [0.3, 0.9, 1] : kind === 'afterlife' ? [0.45, 0.95, 1] : kind === 'fortress' ? [1, 0.6, 0.3] : [1, 0.92, 0.65];
  return {
    structures(X) {
      if (kind !== 'fortress') return;
      const { g, rng } = X;
      // corner towers set one cell in from the island rim
      for (const p of X.pads) {
        if (p.boss) continue;
        const cs = [[p.x0 + 3, p.z0 + 3], [p.x1 - 4, p.z0 + 3], [p.x0 + 3, p.z1 - 4], [p.x1 - 4, p.z1 - 4]];
        let n = 0;
        for (const [x, z] of rng.shuffle(cs)) {
          if (n >= 2 || !rng.chance(0.55)) continue;
          if (!K.freeRect(X, x, z, 2, 2, { ring: 1, ringFlat: true })) continue;
          const top = p.y + rng.float(4.5, 7);
          for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) { const i = cellOf(X, x + dx, z + dz); g.solid(x + dx, z + dz, top, TS.WALL); g.floorTex[i] = TS.SIDE; X.owner[i] = -3; }
          K.occupy(X, x, z, 2, 2);
          K.occupy(X, x - 1, z - 1, 4, 4, LOCK.SOFT);
          for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) X.keep[cellOf(X, x + dx, z + dz)] = 1;
          (X.turrets || (X.turrets = [])).push({ x, z, top, p });
          n++;
        }
      }
    },
    under(X, p) {
      K.rockUnderside(X, p, { tex: X.S.under ?? TS.ROCK });
      const { deco, g } = X;
      if (kind === 'digital') bands(X, p, -0.33, -0.2, TS.NEON, 0.03, 0, { emissive: 1, faces: FACE.SIDES });
      else bands(X, p, -0.34, 0.04, X.S.lipTex ?? TS.SIDE, 0.04, 0.04, { faces: FACE.SIDES | FACE.TOP });
      void deco; void g;
    },
    dress(X, p) {
      const { deco, rng, g } = X;
      if (kind === 'fortress') merlons(X, p);
      const t = p.terrace;
      const tOpt = t ? { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 } : null;
      if (t) terraceFeature(X, p, kind);
      const n = Math.max(1, Math.floor(padArea(p) / 45));
      switch (kind) {
        case 'heaven':
          placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => P.roundTree(deco, x + 0.5, z + 0.5, y, rng.float(0.9, 1.2)), { ring: 1 });
          placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => lanternPost(deco, x + 0.5, z + 0.5, y, glow, { tex: TS.ACCENT, height: 2.6 }));
          if (!t && rng.chance(0.6)) columnRing(X, p);
          placeSome(X, p, rng.int(0, 1), 1, 1, (x, z, y) => brokenColumn(deco, x + 0.5, z + 0.5, y, rng.float(1.2, 2.4)));
          break;
        case 'afterlife':
          placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => brokenColumn(deco, x + 0.5, z + 0.5, y, rng.float(1.4, 3.2)));
          placeSome(X, p, rng.int(0, 2), 1, 1, (x, z, y) => bonePile(deco, x + 0.5, z + 0.5, y), { ring: 0 });
          placeSome(X, p, rng.int(0, 1), 1, 1, (x, z, y) => deadTree(deco, x + 0.5, z + 0.5, y, rng.float(0.9, 1.3)));
          placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => lanternPost(deco, x + 0.5, z + 0.5, y, glow, { tex: TS.METAL, height: 2.4 }));
          placeSome(X, p, rng.int(0, 1), 1, 1, (x, z, y) => crystalCluster(deco, x + 0.5, z + 0.5, y, rng.float(1.2, 2), TS.LIGHT, glow, { emissive: 0.8 }));
          if (!t && rng.chance(0.4)) columnRing(X, p);
          break;
        case 'digital':
          placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => neonPylon(deco, x + 0.5, z + 0.5, y, rng.float(3.5, 5.5), rng.chance(0.5) ? [0.3, 0.9, 1] : [1, 0.3, 0.8]));
          placeSome(X, p, rng.int(0, 1), 2, 1, (x, z, y) => monolith(deco, x + 1, z + 0.5, y, rng.float(2.6, 4), true, glow));
          placeSome(X, p, rng.int(0, 2), 1, 1, (x, z, y) => P.dataCube(deco, x + 0.5, z + 0.5, y, rng.chance(0.5) ? glow : [1, 0.35, 0.85]));
          break;
        default: // fortress
          placeSome(X, p, rng.int(1, 2), 1, 1, (x, z, y) => brazier(deco, x + 0.5, z + 0.5, y, glow, { radius: 6.5 }));
          placeSome(X, p, rng.int(0, 2), 1, 1, (x, z, y) => deco.crateStack(x + 0.5, z + 0.5, y, { tex: TS.CRATE }));
          placeSome(X, p, rng.int(0, 1), 2, 1, (x, z, y) => { deco.table(x + 0.2, z + 0.15, y, 1.6, 0.7, TS.WOOD); });
          break;
      }
      // waterfalls / data streams off the lip
      if (rng.chance(kind === 'fortress' ? 0.25 : 0.55)) {
        const runs = edgeRuns(X, p).filter((r) => r.cells.length >= 3);
        if (runs.length) {
          const run = rng.pick(runs), c = run.cells[Math.floor(run.cells.length / 2)];
          const y = g.floor[c.i];
          const tex = kind === 'digital' ? TS.NEON : kind === 'afterlife' ? TS.POISON : TS.WATER;
          fall(deco, c.x, c.z, run.d, y - 0.05, y - rng.float(10, 16), tex, kind === 'digital' ? glow : kind === 'afterlife' ? [0.45, 1, 0.35] : [0.6, 0.8, 1]);
        }
      }
      void n; void tOpt;
    },
    world(X) {
      const { deco, rng } = X;
      for (const t of X.turrets || []) {
        P.coneRoof(deco, t.x + 1, t.z + 1, t.top, 1.3, rng.float(3.5, 5), TS.ROOF, { finial: 1.4 });
        deco.box(t.x - 0.1, t.top - 0.5, t.z - 0.1, t.x + 2.1, t.top, t.z + 2.1, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
        P.banner(deco, t.x - 1, t.z, 0, t.top - 3.2, t.top - 0.8);
      }
      farIslands(X, kind === 'digital' ? TS.WALL2 : TS.ROCK, kind === 'digital' ? TS.FLOOR : TS.GROUND, 12);
    },
    arena(X, b) {
      const { deco } = X;
      islandSkin(kind).under(X, b);
      if (kind === 'fortress') merlons(X, b);
      const corners = [[b.x0 + 2.5, b.z0 + 2.5], [b.x1 - 1.5, b.z0 + 2.5], [b.x0 + 2.5, b.z1 - 1.5], [b.x1 - 1.5, b.z1 - 1.5]];
      for (const [x, z] of corners) {
        if (kind === 'digital') neonPylon(deco, x, z, b.y, 5, [1, 0.3, 0.6]);
        else if (kind === 'fortress') brazier(deco, x, z, b.y, glow, { radius: 8 });
        else deco.pillar(x, z, 0.7, b.y, b.y + 4.2, { tex: TS.PILLAR, trimTex: TS.TRIM });
      }
      if (kind !== 'digital' && kind !== 'fortress') for (const [x, z] of corners) deco.light(x, b.y + 3.6, z, glow, 6);
    },
  };
}

// temple / mausoleum / server stack / keep on a terrace
function terraceFeature(X, p, kind) {
  const { deco, g, rng } = X;
  const t = p.terrace, y = t.y;
  const fl = t.flight;
  // cells where the flight arrives must stay open: the terrace edge on side fl.d
  const arrive = (x, z) => {
    if (fl.d === 0) return x === t.x0 + t.w - 1 && z >= fl.lowZ && z < fl.lowZ + fl.fw;
    if (fl.d === 1) return x === t.x0 && z >= fl.lowZ && z < fl.lowZ + fl.fw;
    if (fl.d === 2) return z === t.z0 + t.h - 1 && x >= fl.lowX && x < fl.lowX + fl.fw;
    return z === t.z0 && x >= fl.lowX && x < fl.lowX + fl.fw;
  };
  if (kind === 'heaven' || kind === 'afterlife') {
    // columns around the podium, entablature and a stepped roof (no colliders above head height)
    const pts = [];
    for (let x = t.x0; x < t.x0 + t.w; x++) for (let z = t.z0; z < t.z0 + t.h; z++) {
      const edge = x === t.x0 || z === t.z0 || x === t.x0 + t.w - 1 || z === t.z0 + t.h - 1;
      if (!edge || ((x + z) & 1) || arrive(x, z)) continue;
      // keep clear the cells next to the arrival too
      if (arrive(x + 1, z) || arrive(x - 1, z) || arrive(x, z + 1) || arrive(x, z - 1)) continue;
      pts.push([x, z]);
    }
    const top = y + 3.8;
    for (const [x, z] of pts) {
      deco.pillar(x + 0.5, z + 0.5, 0.5, y, top, { tex: TS.PILLAR, trimTex: TS.TRIM });
      K.occupy(X, x, z, 1, 1);
    }
    const x0 = t.x0 + 0.15, z0 = t.z0 + 0.15, x1 = t.x0 + t.w - 0.15, z1 = t.z0 + t.h - 0.15;
    deco.box(x0, top, z0, x1, top + 0.35, z1, kind === 'heaven' ? TS.TRIM : TS.SIDE, { faces: FACE.SIDES | FACE.BOTTOM | FACE.TOP });
    deco.box(x0 + 0.05, top + 0.35, z0 + 0.05, x1 - 0.05, top + 0.75, z1 - 0.05, kind === 'heaven' ? TS.ACCENT : TS.WALL2, { faces: FACE.SIDES | FACE.TOP });
    for (let k = 1; k <= 3; k++) {
      const ins = k * Math.min(t.w, t.h) * 0.13;
      deco.box(x0 + ins, top + 0.75 + (k - 1) * 0.45, z0 + ins, x1 - ins, top + 0.75 + k * 0.45, z1 - ins, TS.ROOF, { faces: FACE.SIDES | FACE.TOP });
    }
    // altar / sarcophagus in the middle
    const cx = Math.floor(t.x0 + t.w / 2), cz = Math.floor(t.z0 + t.h / 2);
    if (K.freeCell(X, cellOf(X, cx, cz))) {
      deco.box(cx + 0.1, y, cz + 0.2, cx + 0.9, y + 1.0, cz + 0.8, { side: TS.MACHINE, top: TS.TRIM }, { solid: true, uv: 'fit' });
      K.occupy(X, cx, cz, 1, 1);
    }
    deco.light(t.x0 + t.w / 2, top - 0.8, t.z0 + t.h / 2, kind === 'heaven' ? [1, 0.9, 0.6] : [0.5, 0.9, 1], 7);
  } else if (kind === 'digital') {
    placeSome(X, p, 1, 2, 1, (x, z, yy) => monolith(deco, x + 1, z + 0.5, yy, rng.float(3.5, 5), true, [1, 0.3, 0.8]), { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 });
    placeSome(X, p, 2, 1, 1, (x, z, yy) => P.dataCube(deco, x + 0.5, z + 0.5, yy), { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 });
  } else {
    // fortress keep: a tower on the upper ward
    placeSome(X, p, 1, 2, 2, (x, z, yy) => {
      deco.box(x + 0.05, yy, z + 0.05, x + 1.95, yy + 4.5, z + 1.95, TS.WALL, { solid: true });
      P.coneRoof(deco, x + 1, z + 1, yy + 4.5, 1.3, 4.5, TS.ROOF, { finial: 1.5 });
      P.banner(deco, x, z, 3, yy + 1.2, yy + 3.6);
      P.banner(deco, x, z + 1, 2, yy + 1.2, yy + 3.6);
    }, { x0: t.x0, z0: t.z0, x1: t.x0 + t.w - 1, z1: t.z0 + t.h - 1, ring: 0 });
  }
  void g;
}

// ring of columns around a pad centre (some with a lintel ring)
function columnRing(X, p) {
  const { deco, rng, g } = X;
  const cx = Math.floor(p.cx), cz = Math.floor(p.cz);
  const r = Math.min(p.w, p.h) >= 12 ? 3 : 2;
  const pts = [[cx - r, cz - r], [cx + r, cz - r], [cx - r, cz + r], [cx + r, cz + r], [cx, cz - r], [cx, cz + r], [cx - r, cz], [cx + r, cz]];
  const yC = g.floor[cellOf(X, cx, cz)];
  const ok = pts.filter(([x, z]) => K.freeCell(X, cellOf(X, x, z)) && Math.abs(g.floor[cellOf(X, x, z)] - yC) < 0.01);
  if (ok.length < 6) return;
  const broken = X.mode === 'afterlife';
  for (const [x, z] of ok) {
    const h = broken && rng.chance(0.4) ? rng.float(1.2, 2.6) : 3.6;
    deco.pillar(x + 0.5, z + 0.5, 0.55, yC, yC + h, { tex: TS.PILLAR, trimTex: TS.TRIM, capital: h > 3 });
    K.occupy(X, x, z, 1, 1);
  }
  if (!broken) {
    deco.box(cx - r + 0.2, yC + 3.6, cz - r + 0.2, cx + r + 0.8, yC + 3.95, cz - r + 0.8, TS.TRIM);
    deco.box(cx - r + 0.2, yC + 3.6, cz + r + 0.2, cx + r + 0.8, yC + 3.95, cz + r + 0.8, TS.TRIM);
    deco.box(cx - r + 0.2, yC + 3.6, cz - r + 0.8, cx - r + 0.8, yC + 3.95, cz + r + 0.2, TS.TRIM);
    deco.box(cx + r + 0.2, yC + 3.6, cz - r + 0.8, cx + r + 0.8, yC + 3.95, cz + r + 0.2, TS.TRIM);
  }
  deco.light(cx + 0.5, yC + 2.5, cz + 0.5, X.mode === 'afterlife' ? [0.5, 0.9, 1] : [1, 0.9, 0.65], 6);
}

// ---------------------------------------------------------------- city skyline
function skyline(X) {
  const { g, deco, rng, W, H, M } = X;
  const maxY = Math.max(...X.pads.map((q) => q.y)), minY = Math.min(...X.pads.map((q) => q.y));
  const facades = [TS.FACADE, TS.FACADE2, TS.FACADE3];
  const inPlay = (x, z) => x >= M - 1 && z >= M - 1 && x <= W - M && z <= H - M;
  // tall towers in the margin
  const lots = [];
  for (let z = 0; z < H;) {
    const lh = rng.int(3, 6);
    for (let x = 0; x < W;) {
      const lw = rng.int(3, 6);
      lots.push({ x, z, w: lw, h: lh });
      x += lw + rng.int(1, 2);
    }
    z += lh + rng.int(1, 2);
  }
  for (const L of lots) {
    const cells = [];
    for (let z = L.z; z < L.z + L.h && z < H; z++) for (let x = L.x; x < L.x + L.w && x < W; x++) if (!inPlay(x, z)) cells.push([x, z]);
    if (cells.length < 4) continue;
    const tall = rng.chance(0.8);
    const top = tall ? maxY + rng.float(6, 42) : minY - rng.float(4, 14);
    const tex = rng.pick(facades);
    for (const [x, z] of cells) { g.solid(x, z, top, tex); g.floorTex[cellOf(X, x, z)] = TS.ROOF; }
    if (tall && rng.chance(0.3)) P.antenna(deco, L.x + L.w / 2, L.z + L.h / 2, top, rng.float(4, 9));
    if (tall && rng.chance(0.25)) deco.box(L.x + 0.8, top, L.z + 0.8, L.x + L.w - 0.8, top + rng.float(2, 6), L.z + L.h - 0.8, { side: tex, top: TS.ROOF }, { faces: FACE.SIDES | FACE.TOP });
  }
  // low towers filling the abyss between the roofs
  const near = new Uint8Array(X.N);
  for (let i = 0; i < X.N; i++) {
    if (g.type[i] === 1 && !(g.flags[i] & F.VOID)) {
      const x = i % W, z = (i / W) | 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (g.in(x + dx, z + dz)) near[cellOf(X, x + dx, z + dz)] = 1;
    }
    if (g.type[i] !== 1) near[i] = 1;
  }
  for (let z = M - 1; z <= H - M; z += 3) for (let x = M - 1; x <= W - M; x += 3) {
    const cells = [];
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
      const xx = x + dx, zz = z + dz;
      if (!g.in(xx, zz)) continue;
      const i = cellOf(X, xx, zz);
      if (!near[i] && (g.flags[i] & F.VOID)) cells.push(i);
    }
    if (cells.length < 4 || rng.chance(0.25)) continue;
    const top = minY - rng.float(7, 20), tex = rng.pick(facades);
    for (const i of cells) { g.solid(i % W, (i / W) | 0, top, tex); g.floorTex[i] = TS.ROOF; }
  }
  // the landmark tower: a neon sign and a mast
  for (const col of X.slots) for (const s of col) {
    if (!s.tower) continue;
    const t = s.tower;
    const sy = maxY + 3;
    deco.box(t.x0 + 1, sy - 0.15, t.z0 - 0.25, t.x0 + t.w - 1, sy + 3.15, t.z0, TS.METAL);
    deco.box(t.x0 + 1.15, sy, t.z0 - 0.3, t.x0 + t.w - 1.15, sy + 3, t.z0 - 0.25, TS.NEON, { uv: 'fit', emissive: 1 });
    deco.light(t.x0 + t.w / 2, sy + 1.5, t.z0 - 1.5, [1, 0.3, 0.8], 9);
    deco.box(t.x0 - 0.25, sy - 0.15, t.z0 + 1, t.x0, sy + 3.15, t.z0 + t.h - 1, TS.METAL);
    deco.box(t.x0 - 0.3, sy, t.z0 + 1.15, t.x0 - 0.25, sy + 3, t.z0 + t.h - 1.15, TS.NEON, { uv: 'fit', emissive: 1 });
    P.antenna(deco, t.x0 + t.w / 2, t.z0 + t.h / 2, t.top, 10);
    deco.box(t.x0 + 1.5, t.top, t.z0 + 1.5, t.x0 + t.w - 1.5, t.top + 4, t.z0 + t.h - 1.5, { side: t.tex, top: TS.ROOF }, { faces: FACE.SIDES | FACE.TOP });
  }
}

void boulder; void menhir;
