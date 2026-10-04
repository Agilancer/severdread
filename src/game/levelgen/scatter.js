// Scatter terrain placement (called from populate in levelgen/index.js):
// pillars, explosive barrels / props, pedestals with a special item, animated
// spike traps and computer terminals (consoles + wall panels), matched to the
// theme (data/scatter.js).
//
// Placement records styles + a seed; the game picks the actual sprite from the
// manifest at load (game/scatter.js), so level generation stays art-free.
// Solid objects get a deco collider (player, monsters and shots collide; the
// cell becomes F.OBSTACLE | F.NOSPAWN). Every solid placement is verified with
// a BFS: nothing that was reachable before (with doors open, and with each set
// of locked doors still shut) may become unreachable, so doorways, stairs,
// bridges and key paths are never blocked. Spike traps never form an
// unavoidable wall unless they are a lone, slow chokepoint trap.
import { F, OPEN, DIR_X, DIR_Z, OPP } from '../grid.js';
import { TS } from './common.js';
import { scatterStyle, scatterCounts, PILLAR_HALF, EXPLOSIVE_HALF, PEDESTAL_HALF, SIZE, TERM, TERM_WALL } from '../../data/scatter.js';

const BAD = F.VOID | F.PIT | F.HAZARD | F.DOOR | F.START | F.OBSTACLE | F.STAIR | F.BRIDGE | F.WATER | F.SCROLL | F.NOSPAWN;
const NEAR_BAD = F.DOOR | F.STAIR | F.BRIDGE;
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];

export function placeScatter(ctx) {
  const { g, deco, rng, theme, depth } = ctx;
  const W = g.w, n = g.w * g.h;
  const style = scatterStyle(theme);
  const out = { pillars: [], explosives: [], pedestals: [], traps: [], terminals: [], wallTerminals: [], chest: { style: style.chest, hues: style.chestHues || null } };
  const bfsOut = new Int32Array(n), bfsQueue = new Int32Array(n);
  const baseOpts = { jumpGap: ctx.jumpGap || 0, avoid: F.OBSTACLE, out: bfsOut, queue: bfsQueue };
  const start = ctx.startIdx;
  const locks = ctx.lockSpans || [];   // cells of each locked door, in key order

  // ---- reachability baselines: doors open, then each prefix of locked doors shut
  const variants = [null];
  for (let k = 0; k < locks.length; k++) variants.push(new Set(locks.slice(k).flat()));
  const baseCount = [], baseReach = [];
  for (const v of variants) {
    const d = g.bfs([start], v ? { ...baseOpts, blocked: (b) => v.has(b) } : baseOpts);
    let c = 0; const r = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (d[i] >= 0) { c++; r[i] = 1; }
    baseCount.push(c); baseReach.push(r);
  }
  const reach0 = baseReach[0];
  let reachN = baseCount[0];
  const blocked = new Uint8Array(n);       // cells taken by solid scatter objects
  const lost = new Int32Array(variants.length);
  // would blocking `cells` (on top of what is already blocked) cut anything off?
  // Cheap local test first: if the open neighbours of cell i (all flat, no
  // rails / voids / doors around) form one connected arc of the 8-ring,
  // blocking i cannot disconnect anything (movement is 4-connected).
  const RX = [0, 1, 1, 1, 0, -1, -1, -1], RZ = [-1, -1, 0, 1, 1, 1, 0, -1];
  const simpleSpot = (i, mask) => {
    const x = i % W, z = (i / W) | 0, f = g.floor[i];
    if (g.edge[i]) return false;
    const open = [];
    for (let k = 0; k < 8; k++) {
      const nx = x + RX[k], nz = z + RZ[k];
      if (!g.in(nx, nz)) { open.push(false); continue; }
      const j = nz * W + nx;
      if (g.type[j] !== OPEN) { open.push(false); continue; }
      const fl = g.flags[j];
      if (fl & (F.VOID | F.PIT | F.DOOR | F.STAIR | F.BRIDGE) || g.edge[j]) return false;
      const ok = !(fl & F.OBSTACLE) && !blocked[j] && !(mask && mask[j]) && Math.abs(g.floor[j] - f) < 0.05;
      if (!ok && Math.abs(g.floor[j] - f) >= 0.05 && g.floor[j] - f < 1.2) return false;   // climbable step: let the BFS decide
      open.push(ok);
    }
    let arcs = 0;
    for (let k = 0; k < 8; k++) {
      if (!open[k] || open[(k + 7) % 8]) continue;
      // an arc starts at k: does it hold an orthogonal neighbour?
      let orth = false;
      for (let m = k; open[m % 8] && m < k + 8; m++) if ((m % 8) % 2 === 0) orth = true;
      if (orth) arcs++;
    }
    if (open.every(Boolean)) arcs = 1;
    return arcs <= 1;
  };
  const keepsReach = (cells, avoidExtra, local) => {
    if (local !== undefined && simpleSpot(local, avoidExtra)) return true;
    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      let add = 0;
      for (const c of cells) if (baseReach[vi][c] && !blocked[c]) add++;
      const opts = { ...baseOpts };
      if (v || avoidExtra) opts.blocked = (b) => (v && v.has(b)) || (avoidExtra && avoidExtra[b] === 1);
      const d = g.bfs([start], opts);
      let c = 0;
      for (let i = 0; i < n; i++) if (d[i] >= 0) c++;
      const expect = baseCount[vi] - lost[vi] - add - (avoidExtra ? avoidExtraCount(avoidExtra, baseReach[vi], blocked, cells) : 0);
      if (c < expect) return false;
    }
    return true;
  };
  const commitBlocked = (cells) => {
    for (const c of cells) {
      if (blocked[c]) continue;
      blocked[c] = 1;
      for (let vi = 0; vi < variants.length; vi++) if (baseReach[vi][c]) lost[vi]++;
    }
  };

  // ---- cells that must stay clear
  const reserved = new Uint8Array(n);
  const reserve = (i, r = 0) => {
    if (i < 0) return;
    const x = i % W, z = (i / W) | 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.in(x + dx, z + dz)) reserved[(z + dz) * W + x + dx] = 1;
  };
  reserve(start, 3);
  reserve(ctx.bossCell, 2);
  reserve(ctx.portalCell, 2);
  for (const c of ctx.chests || []) reserve(c.cell, 1);
  for (const k of ctx.keys || []) reserve(g.cellAt(k.x, k.z), 1);
  for (const s of ctx.spawns || []) reserve(s.cell, 0);
  for (const p of ctx.props || []) reserve(p.cell, 0);
  for (const d of ctx.doors || []) for (const c of d.cells || [d.cell]) reserve(c, 1);

  const dist = ctx.dist;
  let maxDist = 1;
  for (let i = 0; i < n; i++) if (dist[i] > maxDist) maxDist = dist[i];

  const free = (i, needH) => {
    if (i < 0 || g.type[i] !== OPEN || (g.flags[i] & BAD) || g.edge[i] || reserved[i] || blocked[i] || !reach0[i]) return false;
    if (!g.sky[i] && g.ceil[i] - g.floor[i] < needH) return false;
    return true;
  };
  const clearAround = (i, r) => clearAroundG(g, i, r);
  // the 8 neighbours are open floor at the same height (free-standing spot)
  const flatAround = (i) => {
    const x = i % W, z = (i / W) | 0, f = g.floor[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k], nz = z + DZ8[k];
      if (!g.isOpen(nx, nz)) return false;
      const j = nz * W + nx;
      if (Math.abs(g.floor[j] - f) > 0.05 || (g.flags[j] & (F.VOID | F.PIT | F.STAIR | F.DOOR | F.BRIDGE)) || blocked[j]) return false;
    }
    return true;
  };
  const wallSides = (i) => wallSidesG(g, i);
  const roominess = (i) => roominessG(g, i);
  const cheb = (a, b) => chebG(W, a, b);
  const farFrom = (i, list, r) => list.every((o) => cheb(o.cell, i) >= r);
  const cx = (i) => (i % W) + 0.5, cz = (i) => ((i / W) | 0) + 0.5;

  const counts = scatterCounts(reachN, depth, style.density ?? 1, style.term ?? 0);
  const arena = ctx.arenaSet || new Set();

  // ------------------------------------------------------------ pillars
  if (style.pillar && style.pillar.length) {
    const ax = rng.int(0, 3), az = rng.int(0, 3), sp = rng.pick([4, 4, 5]);
    const cand = [];
    for (let i = 0; i < n; i++) {
      if (!free(i, 1.9) || !clearAround(i, 2)) continue;
      const room = roominess(i);
      if (room < 14) continue;
      const ws = wallSides(i), nw = bits(ws);
      let score = -1, kind = '';
      if (nw === 0 && flatAround(i) && room >= 20) {
        // free-standing: a regular grid through big rooms reads as a colonnade
        const onGrid = ((i % W) % sp === ax % sp) && ((((i / W) | 0)) % sp === az % sp);
        score = (onGrid ? 3 : 0.6) + room * 0.04; kind = 'free';
      } else if (nw === 1) {
        // along a wall: the opposite side and both flanks open
        score = 1.4 + room * 0.03; kind = 'wall';
      }
      if (score < 0) continue;
      if (arena.has(i)) score += 1.2;
      cand.push({ i, score: score + rng.float(0, 1.2), kind });
    }
    cand.sort((a, b) => b.score - a.score);
    for (const c of cand) {
      if (out.pillars.length >= counts.pillars) break;
      const i = c.i;
      if (!free(i, 1.9) || !farFrom(i, out.pillars, 3)) continue;
      const room = g.sky[i] ? 99 : g.ceil[i] - g.floor[i];
      let size = room >= 2.75 && rng.chance(arena.has(i) ? 0.92 : 0.75) ? 'tall' : 'stump';
      if (size === 'stump' && room < 1.9) continue;
      const h = size === 'tall' ? (room <= 3.35 ? room : rng.float(SIZE.pillarTall[0], SIZE.pillarTall[1])) : rng.float(SIZE.pillarStump[0], SIZE.pillarStump[1]);
      const hf = PILLAR_HALF[size], f = g.floor[i];
      const flags0 = g.flags[i], nCol = deco.colliders.length;
      const ci = nCol;
      deco.collider(cx(i) - hf, f, cz(i) - hf, cx(i) + hf, f + h, cz(i) + hf);
      g.flags[i] |= F.OBSTACLE | F.NOSPAWN;
      if (!keepsReach([i], null, i)) { deco.colliders.length = nCol; g.flags[i] = flags0; continue; }
      commitBlocked([i]);
      out.pillars.push({ cell: i, x: cx(i), z: cz(i), y: f, h, size, styles: style.pillar, seed: rng.int(0, 1e9), ci, half: hf });
    }
  }

  // ------------------------------------------------------------ explosives
  if (style.explosive && style.explosive.length) {
    const anchors = rng.shuffle((ctx.spawns || []).filter((s) => !s.boss).map((s) => s.cell));
    const placeOne = (i, seed) => {
      if (!free(i, 1.3) || !clearAround(i, 1)) return false;
      const f = g.floor[i], x = cx(i) + rng.float(-0.12, 0.12), z = cz(i) + rng.float(-0.12, 0.12);
      const flags0 = g.flags[i], nCol = deco.colliders.length;
      deco.collider(x - EXPLOSIVE_HALF, f, z - EXPLOSIVE_HALF, x + EXPLOSIVE_HALF, f + 0.95, z + EXPLOSIVE_HALF);
      g.flags[i] |= F.OBSTACLE | F.NOSPAWN;
      if (!keepsReach([i], null, i)) { deco.colliders.length = nCol; g.flags[i] = flags0; return false; }
      commitBlocked([i]);
      out.explosives.push({ cell: i, x, z, y: f, styles: style.explosive, elements: style.elements || null, tags: style.explosiveTags || null, seed, ci: nCol });
      return true;
    };
    // clusters of 1-3 next to enemy groups
    let guard = 0;
    while (out.explosives.length < counts.explosives * 0.7 && anchors.length && guard++ < 200) {
      const a = anchors.pop();
      if (out.explosives.some((e) => cheb(e.cell, a) < 4)) continue;
      const ring = [];
      const x0 = a % W, z0 = (a / W) | 0;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const r = Math.max(Math.abs(dx), Math.abs(dz));
        if (r < 1 || !g.in(x0 + dx, z0 + dz)) continue;
        const j = (z0 + dz) * W + x0 + dx;
        if (free(j, 1.3)) ring.push({ j, s: bits(wallSides(j)) * 0.8 + rng.float(0, 1) - r * 0.15 });
      }
      ring.sort((p, q) => q.s - p.s);
      const want = rng.int(1, 3), seed = rng.int(0, 1e9);
      let got = 0;
      for (const { j } of ring) {
        if (got >= want) break;
        if (got && !out.explosives.slice(-got).some((e) => cheb(e.cell, j) <= 1)) continue;   // keep the cluster together
        if (placeOne(j, rng.chance(0.75) ? seed : rng.int(0, 1e9))) got++;
      }
    }
    // the rest stand along walls of roomy areas (storage corners, machine rooms)
    const wallCand = [];
    for (let i = 0; i < n; i++) if (free(i, 1.3) && bits(wallSides(i)) >= 1 && roominess(i) >= 12) wallCand.push(i);
    rng.shuffle(wallCand);
    for (const i of wallCand) {
      if (out.explosives.length >= counts.explosives) break;
      if (!farFrom(i, out.explosives, 3)) continue;
      const seed = rng.int(0, 1e9);
      if (placeOne(i, seed) && rng.chance(0.45)) {
        // a second one beside it
        const x = i % W, z = (i / W) | 0;
        for (let d = 0; d < 4; d++) { const j = g.idx(x + DIR_X[d], z + DIR_Z[d]); if (g.in(x + DIR_X[d], z + DIR_Z[d]) && bits(wallSides(j)) >= 1 && placeOne(j, seed)) break; }
      }
    }
  }

  // ------------------------------------------------------------ pedestals
  {
    const chestCells = (ctx.chests || []).map((c) => ({ cell: c.cell }));
    const cand = [];
    for (let i = 0; i < n; i++) {
      if (!free(i, 2.2) || !clearAround(i, 1) || dist[i] < maxDist * 0.25) continue;
      const nw = bits(wallSides(i));
      if (nw === 0) continue;
      const score = (nw >= 3 ? 3 : nw === 2 ? 1.6 : 0.8) + dist[i] / maxDist + rng.float(0, 1.2) + (arena.has(i) ? -5 : 0);
      cand.push({ i, score });
    }
    cand.sort((a, b) => b.score - a.score);
    const tryPed = (i) => {
      if (!free(i, 2.2) || !farFrom(i, out.pedestals, 8) || !farFrom(i, chestCells, 4)) return false;
      const f = g.floor[i], h = rng.float(SIZE.pedestal[0], SIZE.pedestal[1]);
      const flags0 = g.flags[i], nCol = deco.colliders.length;
      deco.collider(cx(i) - PEDESTAL_HALF, f, cz(i) - PEDESTAL_HALF, cx(i) + PEDESTAL_HALF, f + h * 0.9, cz(i) + PEDESTAL_HALF);
      g.flags[i] |= F.OBSTACLE | F.NOSPAWN;
      if (!keepsReach([i], null, i)) { deco.colliders.length = nCol; g.flags[i] = flags0; return false; }
      commitBlocked([i]);
      out.pedestals.push({ cell: i, x: cx(i), z: cz(i), y: f, h, styles: style.pedestal, seed: rng.int(0, 1e9), ci: nCol, r01: rng.next(), kindRoll: rng.next(), itemSeed: rng.int(0, 2 ** 30) });
      return true;
    };
    for (const c of cand) { if (out.pedestals.length >= 1) break; tryPed(c.i); }
    if (!out.pedestals.length) {
      // open layouts (rooftops, vehicles): any roomy, reachable spot will do
      const loose = [];
      for (let i = 0; i < n; i++) if (free(i, 2.2) && clearAround(i, 1) && dist[i] >= maxDist * 0.15 && !arena.has(i)) loose.push({ i, s: dist[i] / maxDist + rng.float(0, 1) });
      loose.sort((a, b) => b.s - a.s);
      for (const c of loose) if (tryPed(c.i)) break;
    }
    if (counts.pedestals > 1) {
      // second one on the edge of the boss arena (or another side spot)
      const edge = [];
      for (const i of arena) if (free(i, 2.2) && bits(wallSides(i)) >= 1 && cheb(i, ctx.bossCell) >= 3) edge.push(i);
      rng.shuffle(edge);
      let ok = false;
      for (const i of edge) if (tryPed(i)) { ok = true; break; }
      if (!ok) for (const c of cand) if (tryPed(c.i)) break;
    }
  }

  const nb = (i, d) => nbG(g, i, d), sameFloor = (a, b) => Math.abs(g.floor[a] - g.floor[b]) < 0.05;

  // ------------------------------------------------------------ terminals
  // Free-standing consoles stand with their backs to room walls, in small
  // clusters along one wall (a kiosk or rack, a desk spanning two cells,
  // another rack...), plus a few islands (hologram tables, globes, tanks) in
  // big rooms. Solid and reach-checked like the pillars; the art is picked at
  // load (game/scatter.js) to fit the slot: narrow / wide / island.
  if (counts.terminals > 0) {
    // the procedural placeholder terminal props give way to the real consoles
    const pr = ctx.props || [], hints = [];
    for (let k = pr.length - 1; k >= 0; k--) if (pr[k].prop === 'terminal') { hints.push({ cell: pr[k].cell }); pr.splice(k, 1); }
    // two open, flat, free cells in front of a wall-backed spot (never lines a corridor)
    const roomInFront = (i, d) => {
      let j = i;
      for (let k = 0; k < 2; k++) {
        j = nb(j, OPP[d]);
        if (j < 0 || g.type[j] !== OPEN || (g.flags[j] & (F.VOID | F.PIT | F.STAIR | F.DOOR | F.HAZARD | F.OBSTACLE)) || blocked[j] || !sameFloor(i, j)) return false;
      }
      return true;
    };
    // computers belong indoors: city offices only under a roof; elsewhere a
    // kiosk, cabinet or radar may stand outside (base yards, rig decks), a
    // desk never does
    const city = style.family === 'city';
    const spots = new Set(), list = [];   // wall-backed spots: i * 4 + wall dir
    for (let i = 0; i < n; i++) {
      if (!free(i, 2.2) || arena.has(i) || !clearAround(i, 1) || (city && g.sky[i])) continue;
      const room = roominess(i);
      if (room < 11) continue;
      for (let d = 0; d < 4; d++) {
        const j = nb(i, d);
        if (j < 0 || g.type[j] === OPEN || !roomInFront(i, d)) continue;
        spots.add(i * 4 + d);
        list.push({ i, d, s: 1 + room * 0.03 + (farFrom(i, hints, 3) ? 0 : 1.5) - (g.sky[i] ? 0.8 : 0) + rng.float(0, 1.5) });
      }
    }
    list.sort((a, b) => b.s - a.s);
    const placeTerm = (cells, d, slot, seed) => {
      for (const c of cells) if (!free(c, 2.2) || (g.sky[c] && slot === 'wide')) return false;
      const flags0 = cells.map((c) => g.flags[c]), nCol = deco.colliders.length;
      const t = terminalPiece(g, deco, cells, d, slot, { styles: style.terminal, tags: style.terminalTags, seed, gap: rng.float(TERM.gap[0], TERM.gap[1]) });
      if (!keepsReach(cells, null, cells.length === 1 ? cells[0] : undefined)) {
        deco.colliders.length = nCol;
        cells.forEach((c, k) => { g.flags[c] = flags0[k]; });
        return false;
      }
      commitBlocked(cells);
      out.terminals.push(t);
      return true;
    };
    const islands = Math.min(2, Math.floor(counts.terminals / 4));
    const budget = counts.terminals - islands;
    for (const c of list) {
      if (out.terminals.length >= budget) break;
      if (!spots.has(c.i * 4 + c.d) || !free(c.i, 2.2) || !farFrom(c.i, out.terminals, 4)) continue;
      // the run of wall-backed spots along this wall through c.i
      const a = c.d < 2 ? 2 : 0, run = [c.i];
      for (const dir of [a, OPP[a]]) {
        let j = c.i;
        for (let k = 0; k < 3; k++) {
          j = nb(j, dir);
          if (j < 0 || !spots.has(j * 4 + c.d) || !free(j, 2.2) || !sameFloor(j, c.i)) break;
          if (dir === a) run.push(j); else run.unshift(j);
        }
      }
      const L = Math.min(run.length, rng.pick([1, 2, 2, 3, 3, 3, 4]));
      const at = run.indexOf(c.i), s0 = rng.int(Math.max(0, at - L + 1), Math.min(at, run.length - L));
      const win = run.slice(s0, s0 + L);
      const pattern = L === 1 ? ['narrow'] : L === 2 ? (rng.chance(0.6) ? ['wide'] : ['narrow', 'narrow'])
        : L === 3 ? rng.pick([['narrow', 'wide'], ['wide', 'narrow'], ['narrow', 'narrow', 'narrow']])
          : (rng.chance(0.7) ? ['narrow', 'wide', 'narrow'] : ['wide', 'wide']);
      let k = 0;
      for (const slot of pattern) {
        if (out.terminals.length >= budget) break;
        const cells = win.slice(k, k + (slot === 'wide' ? 2 : 1));
        k += cells.length;
        placeTerm(cells, c.d, slot, rng.int(0, 1e9));
      }
    }
    // islands: a hologram table / globe / tank alone in the middle of a big room
    if (islands) {
      const isl = [];
      for (let i = 0; i < n; i++) {
        if (!free(i, 2.4) || (city && g.sky[i]) || arena.has(i) || bits(wallSides(i)) || !clearAround(i, 2) || !flatAround(i)) continue;
        const room = roominess(i);
        if (room >= 23) isl.push({ i, s: room * 0.1 - (g.sky[i] ? 1 : 0) + rng.float(0, 1) });
      }
      isl.sort((a, b) => b.s - a.s);
      let got = 0;
      for (const c of isl) {
        if (got >= islands) break;
        if (!free(c.i, 2.4) || !farFrom(c.i, out.terminals, 5) || !farFrom(c.i, out.pillars, 2) || !farFrom(c.i, out.explosives, 2)) continue;
        if (placeTerm([c.i], -1, 'island', rng.int(0, 1e9))) got++;
      }
    }
  }

  // ------------------------------------------------------------ wall terminals
  if (counts.wallTerminals > 0) {
    // pillars, barrels and pedestals are wide billboards: no panel right beside one
    const props = new Uint8Array(n);
    for (const o of [...out.pillars, ...out.explosives, ...out.pedestals]) props[o.cell] = 1;
    out.wallTerminals = placeWallTerminals(g, deco, rng, {
      count: counts.wallTerminals, styles: style.terminalWall, tech: (style.term ?? 0) >= 0.6, indoor: style.family === 'city',
      reach: reach0, blocked, props, near: out.terminals,
    });
  }

  // ------------------------------------------------------------ spike traps
  if (style.spike && style.spike.length) {
    const doorCells = (ctx.doors || []).flatMap((d) => d.cells || [d.cell]);
    const cand = [];
    for (let i = 0; i < n; i++) {
      if (!free(i, 1.8) || dist[i] < 8 || arena.has(i) || !clearAround(i, 1)) continue;
      const ws = wallSides(i), nw = bits(ws);
      const x = i % W, z = (i / W) | 0;
      let s = 0;
      const corridor = (ws === 12 || ws === 3);            // walls on both sides along one axis
      if (corridor) s += 2.2;
      if (doorCells.some((d) => cheb(d, i) === 2)) s += 2;  // room approach
      for (let d = 0; d < 4; d++) {
        const nx = x + DIR_X[d], nz = z + DIR_Z[d];
        if (g.isOpen(nx, nz) && (g.flags[nz * W + nx] & (F.HAZARD | F.PIT)) && !(g.flags[nz * W + nx] & F.BRIDGE)) { s += 1.6; break; }   // near hazards
      }
      if (!corridor && nw >= 1 && roominess(i) <= 16) s += 1.1;   // narrow passages / room edges
      if (nw >= 3) s -= 3;                                 // dead ends: pointless
      if (s <= 0) s = roominess(i) >= 12 && nw <= 1 ? 0.25 : 0;   // filler: open floor
      if (s <= 0) continue;
      cand.push({ i, s: s + rng.float(0, 1.5), corridor });
    }
    cand.sort((a, b) => b.s - a.s);
    const trapMask = new Uint8Array(n);
    for (const c of cand) {
      if (out.traps.length >= counts.traps) break;
      const i = c.i;
      if (!free(i, 1.8) || trapMask[i] || !farFrom(i, out.traps, 2)) continue;
      trapMask[i] = 1;
      let choke = false;
      if (!keepsReach([], trapMask, i)) {
        // the only way through: allowed as a lone, slow trap in a 1-wide corridor
        const lone = out.traps.every((t) => cheb(t.cell, i) > 3);
        const chokes = out.traps.filter((t) => t.choke).length;
        if (!(c.corridor && lone) || chokes >= 2) { trapMask[i] = 0; continue; }
        choke = true;
        trapMask[i] = 0;          // chokepoint traps do not count as walls for later checks
      }
      g.flags[i] |= F.NOSPAWN;
      // traps in a row along a corridor fire in a wave
      const prev = out.traps.find((t) => cheb(t.cell, i) <= 3);
      const phase = prev ? (prev.phase + 0.22) % 1 : rng.next();
      out.traps.push({ cell: i, x: cx(i), z: cz(i), y: g.floor[i], styles: style.spike, seed: rng.int(0, 1e9), phase, choke });
    }
  }
  return out;
}

// ---------------------------------------------------------------- cell helpers
// no door / stair / bridge within r cells (Chebyshev)
function clearAroundG(g, i, r) {
  const W = g.w, x = i % W, z = (i / W) | 0;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (!g.in(x + dx, z + dz)) continue;
    if (g.flags[(z + dz) * W + x + dx] & NEAR_BAD) return false;
  }
  return true;
}
// bit d set: a wall (or a much higher floor) on side d
function wallSidesG(g, i) {
  const W = g.w, x = i % W, z = (i / W) | 0;
  let m = 0;
  for (let d = 0; d < 4; d++) { const nx = x + DIR_X[d], nz = z + DIR_Z[d]; if (!g.isOpen(nx, nz) || g.floor[nz * W + nx] > g.floor[i] + 1.2) m |= 1 << d; }
  return m;
}
const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
// open same-height cells in the 5x5 window (how roomy the spot is)
function roominessG(g, i) {
  const W = g.w, x = i % W, z = (i / W) | 0, f = g.floor[i];
  let c = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    if (!g.isOpen(x + dx, z + dz)) continue;
    const j = (z + dz) * W + x + dx;
    if (Math.abs(g.floor[j] - f) < 0.3 && !(g.flags[j] & (F.VOID | F.PIT))) c++;
  }
  return c;
}
const chebG = (W, a, b) => Math.max(Math.abs((a % W) - (b % W)), Math.abs(((a / W) | 0) - ((b / W) | 0)));
// neighbour of cell i in direction d (-1 off the map)
const nbG = (g, i, d) => { const x = (i % g.w) + DIR_X[d], z = ((i / g.w) | 0) + DIR_Z[d]; return g.in(x, z) ? z * g.w + x : -1; };

// ---------------------------------------------------------------- terminals
// A free-standing console on `cells` (one cell, or two along the wall in
// direction d; d < 0: an island in the middle of the cell): its collider
// (deco, the cells become OBSTACLE | NOSPAWN) and placement record. The sprite
// plane stands o.gap off the wall, the collider runs from the wall line into
// the room. The caller checks reachability and rolls back if needed.
export function terminalPiece(g, deco, cells, d, slot, o) {
  const W = g.w, i0 = cells[0], i1 = cells[cells.length - 1], f = g.floor[i0];
  let room = 9;
  for (const c of cells) if (!g.sky[c]) room = Math.min(room, g.ceil[c] - g.floor[c]);
  const mx = ((i0 % W) + (i1 % W)) / 2 + 0.5, mz = (((i0 / W) | 0) + ((i1 / W) | 0)) / 2 + 0.5;
  const gap = d >= 0 ? o.gap ?? TERM.gap[0] : 0;
  let x = mx, z = mz, x0 = mx - TERM.half, x1 = mx + TERM.half, z0 = mz - TERM.half, z1 = mz + TERM.half;
  if (d >= 0) {
    x = mx + DIR_X[d] * (0.5 - gap); z = mz + DIR_Z[d] * (0.5 - gap);
    const wx = mx + DIR_X[d] * 0.5, wz = mz + DIR_Z[d] * 0.5, ha = cells.length * 0.5 - 0.08;
    if (d < 2) { x0 = Math.min(wx, wx - DIR_X[d] * TERM.depth); x1 = Math.max(wx, wx - DIR_X[d] * TERM.depth); z0 = mz - ha; z1 = mz + ha; }
    else { z0 = Math.min(wz, wz - DIR_Z[d] * TERM.depth); z1 = Math.max(wz, wz - DIR_Z[d] * TERM.depth); x0 = mx - ha; x1 = mx + ha; }
  }
  const ci = deco.colliders.length;
  deco.collider(x0, f, z0, x1, f + Math.min(TERM.colH, room - 0.1), z1);
  for (const c of cells) g.flags[c] |= F.OBSTACLE | F.NOSPAWN;
  return { cell: i0, cells, x, z, y: f, wall: d, gap, slot, maxH: room - 0.1, styles: o.styles, tags: o.tags || null, seed: o.seed, ci };
}

// ---------------------------------------------------------------- wall terminals
// Flat panels on wall faces of open floor cells at console height (never on
// doors, jambs, stairs, rails, pits, windows, behind detail geometry or on a
// ledge's drop), spaced apart, preferring walls near consoles and the
// corridors of tech levels. Decoration: their thin collider on the wall face
// only lets shots spark them (obstacle: false, no pathing effect). Also used
// by the hub. o: {count, styles, tech (corridor panels welcome), indoor (none
// under the sky), reach / blocked / props (cell masks, optional; no panel in
// front of a blocked cell or beside a prop), near (free-standing terminals:
// panels like their company), allow(i) (optional cell filter)}
const BAD_WALL = new Set([TS.GLASS, TS.FACADE, TS.FACADE2, TS.FACADE3, TS.DOOR, TS.DOOR_RED, TS.DOOR_BLUE, TS.DOOR_YELLOW, TS.DOOR_GREEN, TS.DOOR_PURPLE,
  TS.SCREEN, TS.NEON, TS.LIGHT, TS.FOLIAGE, TS.HAZARD, TS.LAVA, TS.POISON, TS.WATER, TS.VOID, TS.SPIKES]);
const GLOWY = new Set([TS.GLASS, TS.LIGHT, TS.SCREEN, TS.NEON]);
export function placeWallTerminals(g, deco, rng, o) {
  const W = g.w, n = g.w * g.h, out = [];
  const blocked = o.blocked || new Uint8Array(n);
  const nb = (i, d) => nbG(g, i, d), sameFloor = (a, b) => Math.abs(g.floor[a] - g.floor[b]) < 0.05;
  // deco boxes by the cells their footprint touches; cells near consoles
  const boxIdx = new Map();
  const consoleNear = new Uint8Array(n);
  const mark = (i, r) => { const x = i % W, z = (i / W) | 0; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.in(x + dx, z + dz)) consoleNear[(z + dz) * W + x + dx] = 1; };
  deco.boxes.forEach((b, k) => {
    const machine = b.tex === TS.MACHINE || (typeof b.tex === 'object' && Object.values(b.tex).includes(TS.MACHINE));
    for (let z = Math.max(0, Math.floor(b.z0 - 0.05)); z <= Math.min(g.h - 1, Math.floor(b.z1 + 0.05)); z++) {
      for (let x = Math.max(0, Math.floor(b.x0 - 0.05)); x <= Math.min(W - 1, Math.floor(b.x1 + 0.05)); x++) {
        const c = z * W + x;
        let a = boxIdx.get(c);
        if (!a) boxIdx.set(c, (a = []));
        a.push(k);
        if (machine) mark(c, 1);
      }
    }
  });
  for (const t of o.near || []) for (const c of t.cells || [t.cell]) mark(c, 2);
  const wallFace = (k, d) => { const j = nb(k, d); return j >= 0 && g.type[j] !== OPEN && !BAD_WALL.has(g.wallTex[j]); };
  const panelSpot = (i, d) => {
    if (!wallFace(i, d)) return null;
    const x = i % W, z = (i / W) | 0, f = g.floor[i], j = nb(i, d);
    let lo = f + TERM_WALL.minBottom, hi = Math.min((g.sky[i] ? g.floor[j] : g.ceil[i]) - 0.1, f + TERM_WALL.top);
    if (hi - lo < 0.6) return null;
    // a wide panel may overhang the cell where the same clean wall runs on both sides
    const a = d < 2 ? 2 : 0, ka = nb(i, a), kb = nb(i, OPP[a]);
    if (o.props && ((ka >= 0 && o.props[ka]) || (kb >= 0 && o.props[kb]))) return null;
    const side = (s) => {
      const k = nb(i, s);
      return k >= 0 && g.type[k] === OPEN && sameFloor(k, i) && !(g.flags[k] & (F.DOOR | F.STAIR | F.VOID | F.PIT | F.OBSTACLE)) && !g.edge[k] && !blocked[k] && clearAroundG(g, k, 1) && wallFace(k, d);
    };
    const maxW = side(a) && side(OPP[a]) ? TERM_WALL.wideW : TERM_WALL.cellW;
    const along = d < 2 ? z + 0.5 : x + 0.5, line = d === 0 ? x + 1 : d === 1 ? x : d === 2 ? z + 1 : z;
    const a0 = along - maxW / 2 - 0.03, a1 = along + maxW / 2 + 0.03;
    // detail geometry on this stretch of wall: thin slabs on it (trims,
    // interior skins) move the panel off or above them; anything else -
    // windows, lamps, pipes, consoles, shelves, pillars - rules the spot out
    const near = [];
    for (const c of [i, ka, kb]) for (const k of (c >= 0 && boxIdx.get(c)) || []) if (!near.includes(k)) near.push(k);
    near.sort((p, q) => deco.boxes[p].y0 - deco.boxes[q].y0);
    let off = 0;
    for (const k of near) {
      const b = deco.boxes[k];
      let d0, d1, b0, b1;
      if (d === 0) { d0 = line - b.x1; d1 = line - b.x0; b0 = b.z0; b1 = b.z1; }
      else if (d === 1) { d0 = b.x0 - line; d1 = b.x1 - line; b0 = b.z0; b1 = b.z1; }
      else if (d === 2) { d0 = line - b.z1; d1 = line - b.z0; b0 = b.x0; b1 = b.x1; }
      else { d0 = b.z0 - line; d1 = b.z1 - line; b0 = b.x0; b1 = b.x1; }
      if (d1 <= 0.001 || d0 > 0.5 || b1 <= a0 || b0 >= a1 || b.y1 <= lo || b.y0 >= hi) continue;
      const thin = d1 <= 0.1 && d0 <= 0.002 && typeof b.tex === 'number' && !GLOWY.has(b.tex) && !b.emissive;
      if (!thin) return null;
      if (b.y0 <= lo + 0.01 && b.y1 >= hi - 0.01 && b0 <= a0 && b1 >= a1) off = Math.max(off, d1);   // skin over the whole band
      else if (b.y0 <= lo + 0.35) lo = b.y1 + 0.03;    // wainscot / chair rail: sit above it
      else if (b.y1 >= hi - 0.3) hi = b.y0 - 0.03;     // crown band: stay under it
      else return null;
    }
    if (hi - lo < 0.45 || lo > f + 1.35) return null;
    return { lo, hi, off, maxW, along, line };
  };
  const cand = [];
  for (let i = 0; i < n; i++) {
    if (g.type[i] !== OPEN || (o.reach && !o.reach[i]) || blocked[i] || g.edge[i] || !clearAroundG(g, i, 1) || (o.allow && !o.allow(i))) continue;
    if (g.flags[i] & (F.VOID | F.PIT | F.HAZARD | F.DOOR | F.STAIR | F.BRIDGE | F.WATER | F.OBSTACLE)) continue;
    if (o.indoor && g.sky[i]) continue;      // city: offices, not street facades
    const ws = wallSidesG(g, i), corridor = ws === 3 || ws === 12;
    for (let d = 0; d < 4; d++) {
      if (!(ws & (1 << d))) continue;
      const spot = panelSpot(i, d);
      if (!spot) continue;
      const s = 1 + (consoleNear[i] ? 1.3 : 0) + (corridor ? (o.tech ? 0.9 : -0.4) : 0) + (roominessG(g, i) >= 14 ? 0.3 : 0) - (g.sky[i] ? 0.8 : 0) + rng.float(0, 1.5);
      cand.push({ i, d, s, spot, corridor });
    }
  }
  cand.sort((a, b) => b.s - a.s);
  for (const c of cand) {
    if (out.length >= o.count) break;
    if (!out.every((p) => chebG(W, p.cell, c.i) >= (c.corridor ? 4 : 3))) continue;
    const { lo, hi, off, maxW, along, line } = c.spot;
    const t = off + 0.035, nCol = deco.colliders.length;
    if (c.d < 2) deco.collider(c.d === 0 ? line - t : line, lo, along - maxW / 2, c.d === 0 ? line : line + t, hi, along + maxW / 2, { obstacle: false });
    else deco.collider(along - maxW / 2, lo, c.d === 2 ? line - t : line, along + maxW / 2, hi, c.d === 2 ? line : line + t, { obstacle: false });
    out.push({ cell: c.i, wall: c.d, along, line, off, lo, hi, maxW, y: g.floor[c.i], dy: rng.float(-0.06, 0.06), styles: o.styles, seed: rng.int(0, 1e9), ci: nCol });
  }
  return out;
}

// cells newly avoided by `mask` that were reachable in this variant (excluding
// already blocked cells and the cells being blocked now)
function avoidExtraCount(mask, reach, blocked, cells) {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1 && reach[i] && !blocked[i] && !cells.includes(i)) c++;
  return c;
}
