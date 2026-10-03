// Scatter terrain placement (called from populate in levelgen/index.js):
// pillars, explosive barrels / props, pedestals with a special item and
// animated spike traps, matched to the theme (data/scatter.js).
//
// Placement records styles + a seed; the game picks the actual sprite from the
// manifest at load (game/scatter.js), so level generation stays art-free.
// Solid objects get a deco collider (player, monsters and shots collide; the
// cell becomes F.OBSTACLE | F.NOSPAWN). Every solid placement is verified with
// a BFS: nothing that was reachable before (with doors open, and with each set
// of locked doors still shut) may become unreachable, so doorways, stairs,
// bridges and key paths are never blocked. Spike traps never form an
// unavoidable wall unless they are a lone, slow chokepoint trap.
import { F, OPEN, DIR_X, DIR_Z } from '../grid.js';
import { scatterStyle, scatterCounts, PILLAR_HALF, EXPLOSIVE_HALF, PEDESTAL_HALF, SIZE } from '../../data/scatter.js';

const BAD = F.VOID | F.PIT | F.HAZARD | F.DOOR | F.START | F.OBSTACLE | F.STAIR | F.BRIDGE | F.WATER | F.SCROLL | F.NOSPAWN;
const NEAR_BAD = F.DOOR | F.STAIR | F.BRIDGE;
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];

export function placeScatter(ctx) {
  const { g, deco, rng, theme, depth } = ctx;
  const W = g.w, n = g.w * g.h;
  const style = scatterStyle(theme);
  const out = { pillars: [], explosives: [], pedestals: [], traps: [], chest: { style: style.chest, hues: style.chestHues || null } };
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
  // no door / stair / bridge within r cells (Chebyshev)
  const clearAround = (i, r) => {
    const x = i % W, z = (i / W) | 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (!g.in(x + dx, z + dz)) continue;
      if (g.flags[(z + dz) * W + x + dx] & NEAR_BAD) return false;
    }
    return true;
  };
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
  const wallSides = (i) => {
    const x = i % W, z = (i / W) | 0;
    let m = 0;
    for (let d = 0; d < 4; d++) { const nx = x + DIR_X[d], nz = z + DIR_Z[d]; if (!g.isOpen(nx, nz) || g.floor[nz * W + nx] > g.floor[i] + 1.2) m |= 1 << d; }
    return m;
  };
  const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
  // open same-height cells in the 5x5 window (how roomy the spot is)
  const roominess = (i) => {
    const x = i % W, z = (i / W) | 0, f = g.floor[i];
    let c = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!g.isOpen(x + dx, z + dz)) continue;
      const j = (z + dz) * W + x + dx;
      if (Math.abs(g.floor[j] - f) < 0.3 && !(g.flags[j] & (F.VOID | F.PIT))) c++;
    }
    return c;
  };
  const cheb = (a, b) => Math.max(Math.abs((a % W) - (b % W)), Math.abs(((a / W) | 0) - ((b / W) | 0)));
  const farFrom = (i, list, r) => list.every((o) => cheb(o.cell, i) >= r);
  const cx = (i) => (i % W) + 0.5, cz = (i) => ((i / W) | 0) + 0.5;

  const counts = scatterCounts(reachN, depth, style.density ?? 1);
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

// cells newly avoided by `mask` that were reachable in this variant (excluding
// already blocked cells and the cells being blocked now)
function avoidExtraCount(mask, reach, blocked, cells) {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1 && reach[i] && !blocked[i] && !cells.includes(i)) c++;
  return c;
}
