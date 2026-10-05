// Level generation entry point: theme -> layout -> population.
import { Rng } from '../../core/rng.js';
import { THEMES, THEME_BY_ID } from '../../data/themes.js';
import { MONSTERS, VARIANTS } from '../../data/monsters.js';
import * as B from '../../data/balance.js';
import { TS, F, KEY_COLORS, DOOR_SLOT, fortifyArena, findChokeSpans, doorSpan, isDoorable, cellsInRadius } from './common.js';
import { Deco } from './deco.js';
import { genRooms } from './gen_rooms.js';
import { genArch } from './gen_arch.js';
import { genCaves } from './gen_caves.js';
import { genCity } from './gen_city.js';
import { genPlatforms } from './gen_platforms.js';
import { genConvoy } from './gen_convoy.js';
import { genCanyon } from './gen_canyon.js';
import { genHall } from './gen_hall.js';
import { genMaze } from './gen_maze.js';
import { genMountain } from './gen_mountain.js';
import { genCastle } from './gen_castle.js';
import { genLab } from './gen_lab.js';
import { genFoundry } from './gen_foundry.js';
import { genStarship } from './gen_starship.js';
import { placeScatter } from './scatter.js';

const GENERATORS = {
  rooms: genArch, station: genArch, castle: genArch, caves: genCaves, city: genCity, rooftops: genPlatforms, islands: genPlatforms,
  convoy: genConvoy, canyon: genCanyon, hall: genHall, maze: genMaze, mountain: genMountain, lab: genLab, foundry: genFoundry, starship: genStarship,
};

// Every new level rolls a random archetype first (each archetype equally
// likely, never the previous level's), then one of its themes not seen lately.
export function pickTheme(depth, rng, previous = []) {
  const last = THEME_BY_ID[previous[previous.length - 1]];
  const archs = [...new Set(THEMES.map((t) => t.archetype))].filter((a) => a !== last?.archetype);
  const arch = rng.pick(archs);
  const pool = THEMES.filter((t) => t.archetype === arch);
  const fresh = pool.filter((t) => !previous.slice(-12).includes(t.id));
  return rng.pick(fresh.length ? fresh : pool);
}

export function generateLevel({ depth, seed, playerLevel, themeId, previousThemes }) {
  const rng = new Rng(seed);
  const theme = themeId ? THEME_BY_ID[themeId] : pickTheme(depth, rng, previousThemes || []);
  const gen = GENERATORS[theme.archetype] || genRooms;
  let L = null;
  for (let attempt = 0; attempt < 6 && !L; attempt++) {
    try {
      L = gen(rng, theme, depth);
      if (!validate(L)) L = null;
    } catch (e) {
      console.warn('level generator failed, retrying', theme.id, e);
      L = null;
    }
  }
  if (!L) { L = genRooms(rng, THEME_BY_ID.possessed_station, depth); validate(L); }
  void genCastle;
  const level = populate(L, rng, theme, depth, playerLevel);
  level.seed = seed;
  return level;
}

function validate(L) {
  const g = L.grid;
  const si = g.idx(Math.floor(L.start.x), Math.floor(L.start.z));
  if (!g.type[si] || (g.flags[si] & F.VOID)) {
    // nudge start to nearest open cell
    let best = -1, bd = Infinity;
    for (let i = 0; i < g.w * g.h; i++) {
      if (!g.type[i] || (g.flags[i] & (F.VOID | F.HAZARD))) continue;
      const d = (i % g.w - L.start.x) ** 2 + ((i / g.w | 0) - L.start.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return false;
    L.start = { x: best % g.w, z: (best / g.w) | 0 };
  }
  const dist = g.bfs([g.idx(L.start.x, L.start.z)], { jumpGap: L.jumpGap || 0, avoid: F.OBSTACLE });
  let reach = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] >= 0) reach++;
  return reach > 120;
}

// ---------------------------------------------------------------------------
function populate(L, rng, theme, depth, playerLevel) {
  const g = L.grid;
  const W = g.w;
  const startIdx = g.idx(Math.floor(L.start.x), Math.floor(L.start.z));
  g.flags[startIdx] |= F.START;
  const deco = L.deco || new Deco(g, theme, rng);
  const bfsOpts = { jumpGap: L.jumpGap || 0, avoid: F.OBSTACLE };
  let dist = g.bfs([startIdx], bfsOpts);

  // ---- boss arena
  let arena = L.arenaCells;
  if (!arena && L.pickBossArena === 'farthestRoom' && L.rooms) {
    let best = null, bestScore = -1;
    for (const r of L.rooms) {
      const ci = g.idx(Math.floor(r.cx), Math.floor(r.cz));
      const d = dist[ci];
      if (d < 0) continue;
      const score = d * Math.min(1, (r.w * r.h) / 60);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best) {
      arena = [];
      g.rect(best.x, best.z, best.w, best.h, (x, z, i) => { if (g.type[i]) { arena.push(i); g.flags[i] |= F.ARENA; } });
      L.boss = { x: best.cx, z: best.cz };
    }
  }
  let gate = -1;
  if (arena && arena.length && !L.noFortify) {
    const snap = snapshot(g);
    gate = fortifyArena(g, arena, dist, { top: 6 });
    const d2 = g.bfs([startIdx], bfsOpts);
    const reachable = arena.filter((i) => g.type[i] && d2[i] >= 0).length;
    if (gate < 0 || reachable < arena.length * 0.4) { restore(g, snap); gate = -1; }
    else dist = d2;
  }
  // boss spot: the reachable arena cell nearest the intended spot
  let bossCell = -1;
  if (L.boss) {
    const bi = g.idx(Math.floor(L.boss.x), Math.floor(L.boss.z));
    if (g.type[bi] && dist[bi] >= 0 && !(g.flags[bi] & (F.HAZARD | F.VOID | F.PIT | F.STAIR | F.OBSTACLE))) bossCell = bi;
  }
  if (bossCell < 0 && arena && arena.length) {
    const tx = L.boss ? L.boss.x : arena.reduce((s, i) => s + (i % W), 0) / arena.length;
    const tz = L.boss ? L.boss.z : arena.reduce((s, i) => s + ((i / W) | 0), 0) / arena.length;
    let bd = Infinity;
    for (const i of arena) {
      if (!g.type[i] || dist[i] < 0 || (g.flags[i] & (F.HAZARD | F.VOID | F.PIT | F.STAIR | F.OBSTACLE))) continue;
      const d = ((i % W) + 0.5 - tx) ** 2 + (((i / W) | 0) + 0.5 - tz) ** 2;
      if (d < bd) { bd = d; bossCell = i; }
    }
  }
  if (bossCell < 0) {
    let bd = -1;
    for (let i = 0; i < dist.length; i++) if (dist[i] > bd && !(g.flags[i] & (F.HAZARD | F.VOID | F.PIT | F.STAIR | F.OBSTACLE))) { bd = dist[i]; bossCell = i; }
  }
  const arenaSet = new Set(arena || []);

  // ---- doors: door spans across chokepoints (+ the fortified gate); some
  // become locked. Keyed doors are 3 cells wide whenever the level has 3-wide
  // choke spans (generators build their gates that way); narrower spans are
  // the fallback for levels without one.
  let spans = findChokeSpans(g, startIdx, bossCell, dist, bfsOpts).filter((s) => s.d > 6 && s.cells.every((c) => !arenaSet.has(c)));
  if (gate >= 0 && !spans.some((s) => s.cells.includes(gate))) {
    const ax = isDoorable(g, gate);
    const sp = doorSpan(g, gate) || (ax ? { cells: [gate], axis: ax, floor: g.floor[gate] } : null);
    if (sp) { sp.d = dist[gate]; spans.push(sp); }
  }
  spans.sort((a, b) => a.d - b.d);
  const wide = spans.filter((s) => s.cells.length === 3);
  if (wide.length) spans = wide;
  const maxLocks = depth <= 1 ? 1 : depth <= 4 ? 2 : 3;
  const nLocks = Math.min(spans.length, rng.int(Math.min(1, spans.length), maxLocks));
  // spread the locked doors: always include the last choke (boss gate)
  const lockSpans = [];
  if (nLocks > 0) {
    lockSpans.push(spans[spans.length - 1]);
    const rest = spans.slice(0, -1).filter((s) => s.d > 10);
    rng.shuffle(rest);
    for (const s of rest) {
      if (lockSpans.length >= nLocks) break;
      if (lockSpans.every((o) => Math.abs(o.d - s.d) > 8)) lockSpans.push(s);
    }
  }
  lockSpans.sort((a, b) => a.d - b.d);
  const lockCells = new Set(lockSpans.flatMap((s) => s.cells));
  const colors = rng.shuffle([...KEY_COLORS]);
  const doors = [];
  const keys = [];
  lockSpans.forEach((s, k) => {
    const color = colors[k % colors.length];
    doors.push(makeDoor(g, s, color));
  });
  // plain doors on other doorable chokepoints / corridor mouths
  const plainDoorCandidates = [];
  for (let i = 0; i < g.w * g.h; i++) {
    if (lockCells.has(i) || arenaSet.has(i)) continue;
    if (g.region[i] !== -2 || g.sky[i]) continue;
    if (!isDoorable(g, i)) continue;
    // corridor cell adjacent to a room cell
    const x = i % W, z = (i / W) | 0;
    if (g.neighbors(x, z).some(([nx, nz]) => g.region[g.idx(nx, nz)] >= 0)) plainDoorCandidates.push(i);
  }
  rng.shuffle(plainDoorCandidates);
  for (const c of plainDoorCandidates.slice(0, Math.min(10, Math.floor(plainDoorCandidates.length * 0.5)))) {
    if (doors.some((d) => d.cells.some((o) => cellD(o, c, W) < 3))) continue;
    doors.push(makeDoor(g, { cells: [c], axis: isDoorable(g, c) || 'x' }, null));
  }

  // ---- keys: for each locked door, place its key in the region reachable
  // before that door (treating this and all later locked doors as closed)
  const keyHolders = [];
  lockSpans.forEach((s, k) => {
    const blocked = new Set(lockSpans.slice(k).flatMap((o) => o.cells));
    const d = g.bfs([startIdx], { ...bfsOpts, blocked: (b) => blocked.has(b) });
    const cand = [];
    for (let i = 0; i < d.length; i++) {
      if (d[i] < 6 || (g.flags[i] & (F.HAZARD | F.VOID | F.DOOR | F.PIT | F.STAIR | F.OBSTACLE | F.NOSPAWN)) || arenaSet.has(i)) continue;
      if (g.ceil[i] - g.floor[i] < 1.2) continue;
      cand.push(i);
    }
    if (!cand.length) return;
    // prefer far away spots (dead ends / far rooms)
    cand.sort((a, b) => d[b] - d[a]);
    const pickFrom = cand.slice(0, Math.max(1, Math.floor(cand.length * 0.35)));
    const cell = rng.pick(pickFrom);
    const color = doors[k].color;
    if (rng.chance(0.4)) keyHolders.push({ color, region: d, cell });
    else keys.push({ x: (cell % W) + 0.5, z: ((cell / W) | 0) + 0.5, color });
  });

  // ---- monsters
  const pool = monsterPool(theme, depth, rng);
  const sizeFactor = Math.min(1.4, Math.max(0.7, countReachable(dist) / 1400));
  const nEnemies = B.enemyCount(depth, sizeFactor);
  const spawnable = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < 9 || (g.flags[i] & (F.HAZARD | F.VOID | F.DOOR | F.NOSPAWN | F.START | F.PIT | F.STAIR | F.OBSTACLE)) || arenaSet.has(i)) continue;
    if (g.ceil[i] - g.floor[i] < 1.3) continue;
    spawnable.push(i);
  }
  const spawnSet = new Set(spawnable);
  const spawns = [];
  const occupied = new Set();
  let guard = 0;
  while (spawns.length < nEnemies && spawnable.length && guard++ < nEnemies * 20) {
    const center = rng.pick(spawnable);
    const groupSize = Math.min(nEnemies - spawns.length, rng.int(2, 5));
    const type = rng.weighted(pool, (m) => m.w).id;
    const cells = cellsInRadius(g, (center % W) + 0.5, ((center / W) | 0) + 0.5, 3, (i) => spawnSet.has(i) && !occupied.has(i));
    rng.shuffle(cells);
    for (const c of cells.slice(0, groupSize)) {
      occupied.add(c);
      spawns.push(makeSpawn(c, type, depth, rng, g));
    }
  }
  // give keys to monsters standing in the right region
  for (const kh of keyHolders) {
    const eligible = spawns.filter((s) => kh.region[s.cell] >= 0 && !s.carriesKey);
    if (eligible.length) rng.pick(eligible).carriesKey = kh.color;
    else keys.push({ x: (kh.cell % W) + 0.5, z: ((kh.cell / W) | 0) + 0.5, color: kh.color });
  }
  const bossId = pickBoss(depth, rng, theme);
  const bossSpawn = { x: (bossCell % W) + 0.5, z: ((bossCell / W) | 0) + 0.5, cell: bossCell, monster: bossId, variant: depth > 3 && rng.chance(0.35) ? pickVariant(depth, rng, true) : 'normal', boss: true };

  // portal: arena cell near the boss spawn but not on it
  let portalCell = bossCell;
  const near = cellsInRadius(g, bossSpawn.x, bossSpawn.z, 4, (i) => g.type[i] && !(g.flags[i] & (F.HAZARD | F.VOID | F.PIT | F.STAIR | F.OBSTACLE | F.DOOR)) && dist[i] >= 0);
  if (near.length) portalCell = near.sort((a, b) => Math.abs(cellD(a, bossCell, W) - 3) - Math.abs(cellD(b, bossCell, W) - 3))[0];

  // ---- chests
  const chests = [];
  const nChests = Math.min(7, 2 + Math.floor(depth / 4) + rng.int(0, 1));
  const chestCand = spawnable.filter((i) => !occupied.has(i));
  // prefer dead ends (cells with a single open neighbour)
  chestCand.sort((a, b) => openNeighbors(g, a) - openNeighbors(g, b) || dist[b] - dist[a]);
  for (const c of chestCand) {
    if (chests.length >= nChests) break;
    if (chests.some((o) => cellD(o.cell, c, W) < 10)) continue;
    if (!rng.chance(0.5)) continue;
    chests.push({ cell: c, x: (c % W) + 0.5, z: ((c / W) | 0) + 0.5 });
  }

  // ---- props & light sources
  const props = [];
  const lights = [...deco.lights];
  // (real explosive barrels come from the scatter pass below, not the placeholder prop)
  const propNames = (theme.props || []).filter((p) => p !== 'barrel');
  if (propNames.length) {
    const nProps = Math.floor(countReachable(dist) / 45);
    for (let k = 0; k < nProps; k++) {
      const c = rng.pick(spawnable);
      if (occupied.has(c) || props.some((p) => p.cell === c)) continue;
      const x = c % W, z = (c / W) | 0;
      // hug walls for nicer placement
      const wallAdj = g.neighbors(x, z).some(([nx, nz]) => !g.isOpen(nx, nz));
      if (!wallAdj && rng.chance(0.6)) continue;
      const name = rng.pick(propNames);
      props.push({ cell: c, x: x + 0.5 + rng.float(-0.2, 0.2), z: z + 0.5 + rng.float(-0.2, 0.2), prop: name });
    }
  }
  for (const p of props) {
    if (p.prop === 'lamp' || p.prop === 'torch' || p.prop === 'candles' || p.prop === 'crystal') {
      const col = p.prop === 'lamp' ? [1, 0.95, 0.75] : p.prop === 'crystal' ? [0.7, 0.4, 1] : [1, 0.6, 0.25];
      lights.push({ x: p.x, z: p.z, color: col, radius: p.prop === 'lamp' ? 6 : 4.5, flicker: p.prop !== 'lamp' && p.prop !== 'crystal' });
    }
  }
  // ---- scatter terrain: pillars, explosive barrels, pedestals, spike traps (levelgen/scatter.js)
  const scatter = placeScatter({ g, deco, rng: rng.fork('scatter'), theme, depth, dist, startIdx, bossCell, portalCell, arenaSet, spawns, chests, keys, doors, lockSpans: lockSpans.map((sp) => sp.cells), props, jumpGap: L.jumpGap || 0 });
  bakeLights(g, lights, theme);
  const decoOut = deco.result();

  return {
    theme, depth, grid: g,
    start: { x: L.start.x + 0.5, z: L.start.z + 0.5, yaw: L.startYaw ?? guessYaw(g, startIdx, dist) },
    spawns, boss: bossSpawn, portal: { x: (portalCell % W) + 0.5, z: ((portalCell / W) | 0) + 0.5 },
    doors, keys, chests, props, lights, deco: decoOut, scatter,
    rooms: (L.rooms || []).map((r) => ({ id: r.id, x: r.x, z: r.z, w: r.w, h: r.h, floor: r.floor, template: r.template })),
    voidY: L.voidY ?? -30,
    scrollSpeed: L.scrollSpeed || 0,
    jumpGap: L.jumpGap || 0,
    arena: arena || [],
    playerLevel,
  };
}

const SNAP_FIELDS = ['type', 'floor', 'ceil', 'sky', 'wallTex', 'floorTex', 'flags', 'hazType', 'stairDir', 'rise', 'edge', 'roof'];
function snapshot(g) {
  const s = {};
  for (const k of SNAP_FIELDS) s[k] = g[k].slice();
  return s;
}
function restore(g, s) {
  for (const k of SNAP_FIELDS) g[k].set(s[k]);
}

// Door over a span of cells (1 cell for plain doors, up to 3 for keyed ones).
// Keyed doors are exactly 3 tall (floor + 3) with a lintel above drawn by
// the world mesh; the cells in front and behind get at least that much head
// room so the door is never cut by a lower ceiling. d.cell is the centre
// cell (kept for code that thinks in single cells), d.cells all of them.
function makeDoor(g, span, color) {
  const cells = span.cells, W = g.w;
  const f = g.floor[cells[0]];
  // plain doors keep their old size: the passage height, at most 3.5
  const top = color ? f + 3 : Math.min(...cells.map((c) => (g.sky[c] ? f + 3 : Math.min(g.ceil[c], f + 3.5))));
  for (const c of cells) { g.flags[c] |= F.DOOR; g.sky[c] = 0; g.ceil[c] = top; g.floor[c] = f; }
  if (color) {
    const step = span.axis === 'x' ? 1 : W;
    for (const c of cells) for (const j of [c - step, c + step]) if (g.type[j] && !g.sky[j] && g.ceil[j] < top) g.ceil[j] = top;
  }
  const xs = cells.map((c) => c % W), zs = cells.map((c) => (c / W) | 0);
  const mid = cells[(cells.length - 1) >> 1];
  return {
    cell: mid, cells, x: mid % W, z: (mid / W) | 0, axis: span.axis, color, slot: color ? DOOR_SLOT[color] : TS.DOOR,
    x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs) + 1, z1: Math.max(...zs) + 1,
  };
}

function makeSpawn(cell, type, depth, rng, g) {
  const elite = rng.chance(B.eliteChance(depth));
  return {
    cell, x: (cell % g.w) + 0.5 + rng.float(-0.2, 0.2), z: ((cell / g.w) | 0) + 0.5 + rng.float(-0.2, 0.2),
    monster: type, variant: pickVariant(depth, rng), elite, carriesKey: null,
  };
}

function pickVariant(depth, rng, boss = false) {
  const pool = VARIANTS.filter((v) => (v.minDepth || 0) <= depth && (!boss || v.id !== 'normal'));
  return rng.weighted(pool, (v) => v.weight).id;
}

function monsterPool(theme, depth, rng) {
  // every normal monster type can appear on any level (bosses keep their depth gates);
  // a deeper-tier monster met early is toned down in Monster (TIER_EARLY)
  const all = Object.entries(MONSTERS).filter(([, m]) => !m.boss);
  const scored = all.map(([id, m]) => ({ id, w: m.weight * (theme.monsterBias?.[m.category] || 1) * (m.placeholder ? 0.6 : 1) }));
  // 2-4 types per level keeps encounters coherent
  rng.shuffle(scored);
  const n = Math.min(scored.length, rng.int(2, 4));
  const pick = scored.sort((a, b) => b.w * rng.float(0.5, 1.5) - a.w * rng.float(0.5, 1.5)).slice(0, n);
  return pick.length ? pick : [{ id: 'piston_monk', w: 1 }];
}

function pickBoss(depth, rng, theme) {
  const bosses = Object.entries(MONSTERS).filter(([, m]) => m.boss && (m.minDepth || 1) <= depth);
  if (depth === 1) return 'iron_penitent';
  return rng.weighted(bosses, ([, m]) => m.weight * (theme.monsterBias?.[m.category] || 1))[0];
}

function countReachable(dist) { let n = 0; for (let i = 0; i < dist.length; i++) if (dist[i] >= 0) n++; return n; }
function cellD(a, b, W) { return Math.abs((a % W) - (b % W)) + Math.abs(((a / W) | 0) - ((b / W) | 0)); }
function openNeighbors(g, i) { const x = i % g.w, z = (i / g.w) | 0; return g.neighbors(x, z).filter(([nx, nz]) => g.isOpen(nx, nz)).length; }

function guessYaw(g, startIdx, dist) {
  // face the most open direction that also leads deeper into the level
  const x = startIdx % g.w + 0.5, z = ((startIdx / g.w) | 0) + 0.5;
  let best = 0, bs = -1;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    let len = 0, deeper = 0;
    for (let t = 0.5; t < 14; t += 0.5) {
      const cx = Math.floor(x + Math.cos(ang) * t), cz = Math.floor(z + Math.sin(ang) * t);
      if (!g.in(cx, cz) || !g.type[g.idx(cx, cz)]) break;
      len = t;
      deeper = Math.max(deeper, dist[g.idx(cx, cz)]);
    }
    const score = len + deeper * 0.15;
    if (score > bs) { bs = score; best = ang; }
  }
  return best;
}

// Bake static light sources into per-cell light levels.
function bakeLights(g, lights, theme) {
  const amb = theme.light ?? 0.75;
  for (const l of lights) {
    const r = l.radius;
    for (const i of cellsInRadius(g, l.x, l.z, r)) {
      if (!g.type[i]) continue;
      const cx = (i % g.w) + 0.5, cz = ((i / g.w) | 0) + 0.5;
      const d = Math.hypot(cx - l.x, cz - l.z);
      g.light[i] = Math.min(1.3, g.light[i] + (1 - d / r) * 0.45);
    }
  }
  // hazards glow
  for (let i = 0; i < g.w * g.h; i++) {
    if ((g.flags[i] & F.HAZARD) && (theme.hazard === 'lava' || theme.hazard === 'acid')) {
      for (const j of cellsInRadius(g, (i % g.w) + 0.5, ((i / g.w) | 0) + 0.5, 2.5)) {
        if (g.type[j]) g.light[j] = Math.min(1.25, Math.max(g.light[j], amb * 0.9 + 0.15));
      }
    }
  }
}
