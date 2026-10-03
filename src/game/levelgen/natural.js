// Shared toolkit for natural levels (caves, canyons, mountains):
//  - natStyle(theme): per-theme materials, rail style, hazards
//  - regionsOf / findFlight / applyFlight / connectRegions: terraces at
//    different heights are joined by REAL stair flights, either carved into
//    the higher terrace (a trench with wall-mounted hand rails) or built out
//    from the cliff into the lower area (free-standing, railed both sides)
//  - sinkPit (lava / poison / water lakes, spike pits), layBridge (railed
//    plank / grate bridges), gateWall (a wall across a passage with one
//    doorway: the chokepoints keyed doors need), railDrops (guard rails
//    along dangerous drops, never on intended jump edges)
//  - a prop library made of textured boxes, each on the texture role that
//    fits it: rock spikes (ROCK), crystals (ACCENT, emissive), timber mine
//    supports (BEAM), mine track (METAL rails on WOOD sleepers), carts,
//    braziers / lanterns (LIGHT), trees (WOOD trunks, FOLIAGE), cabins...
import { TS, F, HAZ, OPP, DIR_X, DIR_Z, EDGE_BIT, SKY_H } from './common.js';
import { FACE } from './deco.js';

export const HAZ_OF = { lava: HAZ.LAVA, poison: HAZ.POISON, spikes: HAZ.SPIKES, water: HAZ.WATER };
export const HAZ_FLOOR = { lava: TS.LAVA, poison: TS.POISON, spikes: TS.PITWALL, water: TS.WATER };
export const HAZ_LIGHT = { lava: [1, 0.45, 0.15], poison: [0.45, 1, 0.3], water: [0.35, 0.6, 1], spikes: [1, 0.85, 0.7] };

// ---------------------------------------------------------------- style
export function natStyle(theme) {
  const id = theme.id || '';
  const S = {
    family: 'cave', rail: 'wood', bridge: 'wood', hazards: ['water', 'spikes'], sky: 0,
    gateTex: TS.WOOD, frameTex: TS.BEAM, torch: [1, 0.62, 0.28], glow: [1, 0.7, 0.4],
    stairSide: TS.ROCK, tread: TS.STAIR,
  };
  const set = (o) => Object.assign(S, o);
  switch (id) {
    case 'hell': set({ family: 'hell', rail: 'iron', bridge: 'grate', hazards: ['lava', 'lava', 'spikes', 'lava'], sky: 0.45, gateTex: TS.WALL2, frameTex: TS.ACCENT, torch: [1, 0.42, 0.18], glow: [1, 0.35, 0.12] }); break;
    case 'volcano': set({ family: 'volcano', rail: 'iron', bridge: 'grate', hazards: ['lava', 'lava', 'lava', 'spikes'], sky: 0.5, gateTex: TS.WALL2, frameTex: TS.METAL, torch: [1, 0.5, 0.2], glow: [1, 0.45, 0.15] }); break;
    case 'caves': set({ family: 'cave', rail: 'wood', bridge: 'wood', hazards: ['water', 'water', 'spikes', 'poison'], sky: 0.06 }); break;
    case 'glacier_caves': set({ family: 'ice', rail: 'wood', bridge: 'wood', hazards: ['water', 'water', 'spikes'], sky: 0.22, torch: [1, 0.72, 0.45], glow: [0.55, 0.8, 1] }); break;
    case 'crystal_caverns': set({ family: 'crystal', rail: 'metal', bridge: 'wood', hazards: ['water', 'poison', 'spikes', 'water'], sky: 0, glow: [0.75, 0.45, 1] }); break;
    case 'asteroid_mines': set({ family: 'mine', rail: 'metal', bridge: 'grate', hazards: ['poison', 'lava', 'spikes'], sky: 0.35, gateTex: TS.METAL, frameTex: TS.ACCENT, torch: [1, 0.9, 0.7], glow: [1, 0.85, 0.6], stairSide: TS.METAL }); break;
    case 'canyon': set({ family: 'canyon', rail: 'wood', bridge: 'wood', hazards: ['spikes', 'water'] }); break;
    case 'canyon_bridges': set({ family: 'canyon', rail: 'wood', bridge: 'wood', hazards: ['spikes', 'water', 'spikes'] }); break;
    case 'mountain_top': case 'mountain_climb': set({ family: 'mountain', rail: 'wood', bridge: 'wood', hazards: ['spikes', 'water'] }); break;
    case 'cyber_mountain': set({ family: 'cyber', rail: 'neon', bridge: 'grate', hazards: ['poison', 'spikes'], gateTex: TS.METAL, frameTex: TS.METAL, torch: [0.4, 0.85, 1], glow: [0.3, 0.9, 1], stairSide: TS.METAL }); break;
    case 'desert': set({ family: 'desert', rail: 'wood', bridge: 'wood', hazards: ['spikes', 'water'], gateTex: TS.WALL2, frameTex: TS.WOOD }); break;
    case 'toxic_swamp': set({ family: 'swamp', rail: 'wood', bridge: 'wood', hazards: ['poison', 'poison', 'spikes'], torch: [0.9, 1, 0.55], glow: [0.6, 1, 0.35] }); break;
    default: break;
  }
  if (theme.hazard === 'lava' && !S.hazards.includes('lava')) S.hazards = ['lava', ...S.hazards];
  if (theme.railStyle) S.rail = theme.railStyle;
  S.railTex = S.rail === 'wood' ? TS.WOOD : TS.RAIL;
  S.deck = S.bridge === 'grate' ? TS.GRATE : TS.WOOD;
  S.under = S.bridge === 'grate' ? TS.METAL : TS.BEAM;
  return S;
}

// ---------------------------------------------------------------- grid helpers
export const idxOf = (g, x, z) => z * g.w + x;
export function step(g, i, dir, k = 1) {
  const x = (i % g.w) + DIR_X[dir] * k, z = ((i / g.w) | 0) + DIR_Z[dir] * k;
  return g.in(x, z) ? z * g.w + x : -1;
}
export function neighbors4(g, i) {
  const x = i % g.w, z = (i / g.w) | 0, out = [];
  for (let d = 0; d < 4; d++) { const nx = x + DIR_X[d], nz = z + DIR_Z[d]; if (g.in(nx, nz)) out.push(nz * g.w + nx); }
  return out;
}
// plain walkable ground (not hazards / pits / stairs / doors)
export function isGround(g, i) {
  return g.type[i] === 1 && !(g.flags[i] & (F.VOID | F.PIT | F.HAZARD | F.STAIR | F.DOOR));
}

// Connected flat areas: cells joined when their floors differ by <= 0.55.
export function regionsOf(g, ok = (i) => isGround(g, i)) {
  const n = g.w * g.h, reg = new Int32Array(n).fill(-1), regs = [];
  const st = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (reg[s] >= 0 || !ok(s)) continue;
    const id = regs.length, R = { id, cells: [], h: g.floor[s], cx: 0, cz: 0 };
    let sp = 0; st[sp++] = s; reg[s] = id;
    while (sp) {
      const a = st[--sp];
      R.cells.push(a);
      const ax = a % g.w, az = (a / g.w) | 0;
      R.cx += ax; R.cz += az;
      for (let d = 0; d < 4; d++) {
        const bx = ax + DIR_X[d], bz = az + DIR_Z[d];
        if (bx < 0 || bz < 0 || bx >= g.w || bz >= g.h) continue;
        const b = bz * g.w + bx;
        if (reg[b] >= 0 || (g.edge[a] & EDGE_BIT[d]) || !ok(b)) continue;
        if (Math.abs(g.floor[b] - g.floor[a]) > 0.55) continue;
        reg[b] = id; st[sp++] = b;
      }
    }
    R.cx /= R.cells.length; R.cz /= R.cells.length;
    regs.push(R);
  }
  return { reg, regs };
}

// ---------------------------------------------------------------- stair flights
// A flight joins the lower region `lo` to the higher region `hi` across one of
// their shared edges. mode 'carve': the steps are cut into the higher terrace
// (flanked by its rock, wall rails); mode 'out': the flight is built out from
// the cliff into the lower area (open sides get railed posts).
const plainFlags = F.BRIDGE | F.WATER | F.OBSTACLE | F.DOOR | F.START | F.VOID | F.PIT | F.HAZARD | F.STAIR;
export function findFlight(g, reg, ra, rb, regs, o = {}) {
  const rng = o.rng;
  const lock = o.lock;
  const widths = o.widths || [3, 2];
  const maxN = o.maxN ?? 12;
  const modes = o.modes || ['carve', 'out'];
  const A = regs[ra], B = regs[rb];
  const free = (i, r, h) => i >= 0 && reg[i] === r && !(lock && lock[i]) && !(g.flags[i] & plainFlags) && Math.abs(g.floor[i] - h) < 0.01;
  // boundary edges (low cell, high cell, direction of ascent)
  const cand = [];
  const small = A.cells.length <= B.cells.length ? A : B, other = small === A ? rb : ra;
  for (const a of small.cells) {
    if (reg[a] !== small.id) continue;
    for (let d = 0; d < 4; d++) {
      const b = step(g, a, d);
      if (b < 0 || reg[b] !== other || (g.edge[a] & EDGE_BIT[d])) continue;
      const lo = g.floor[a] < g.floor[b] ? a : b, hi = lo === a ? b : a;
      cand.push([lo, hi, lo === a ? d : OPP[d]]);
    }
  }
  if (rng) rng.shuffle(cand);
  if (cand.length > (o.maxCand ?? 140)) cand.length = o.maxCand ?? 140;
  let best = null;
  for (const [lo, hi, up] of cand) {
    const yLo = g.floor[lo], yHi = g.floor[hi], dh = yHi - yLo;
    if (dh < 0.56) continue;
    const n = Math.ceil(dh / (o.per ?? 0.6) - 1e-6);
    if (n > maxN) continue;
    const lat = DIR_Z[up] !== 0 ? 0 : 2;              // lateral (+x when climbing along z, +z when along x)
    const rLo = reg[lo], rHi = reg[hi];
    for (const w of widths) {
      for (let o0 = -(w - 1); o0 <= 0; o0++) {
        for (const mode of modes) {
          let ok = true, sideScore = 0;
          const flight = [], landLo = [], landHi = [];
          for (let l = 0; l < w && ok; l++) {
            const off = o0 + l;
            const lc = off === 0 ? lo : step(g, lo, off > 0 ? lat : OPP[lat], Math.abs(off));
            const hc = off === 0 ? hi : step(g, hi, off > 0 ? lat : OPP[lat], Math.abs(off));
            if (lc < 0 || hc < 0) { ok = false; break; }
            if (mode === 'carve') {
              if (!free(lc, rLo, yLo)) { ok = false; break; }
              landLo.push(lc);
              for (let k = 0; k < n; k++) { const c = step(g, hc, up, k); if (!free(c, rHi, yHi)) { ok = false; break; } flight.push(c); }
              const top = step(g, hc, up, n);
              if (!ok || !free(top, rHi, yHi)) { ok = false; break; }
              landHi.push(top);
            } else {
              if (!free(hc, rHi, yHi)) { ok = false; break; }
              landHi.push(hc);
              for (let k = 0; k < n; k++) { const c = step(g, lc, OPP[up], k); if (!free(c, rLo, yLo)) { ok = false; break; } flight.push(c); }
              const bot = step(g, lc, OPP[up], n);
              if (!ok || !free(bot, rLo, yLo)) { ok = false; break; }
              landLo.push(bot);
            }
          }
          if (!ok) continue;
          // flanks: carved flights want their own rock on both sides, built-out
          // flights want open low ground around them
          for (const s of [-1, w]) {
            const off = o0 + s;
            let good = 0;
            for (let k = 0; k < n; k++) {
              const base = mode === 'carve' ? step(g, hi, up, k) : step(g, lo, OPP[up], k);
              const c = base < 0 ? -1 : off === 0 ? base : step(g, base, off > 0 ? lat : OPP[lat], Math.abs(off));
              if (c < 0) continue;
              if (mode === 'carve' ? (g.type[c] !== 1 || reg[c] === rHi) : reg[c] === rLo) good++;
            }
            sideScore += good / n;
          }
          let score = (mode === 'carve' ? (o.carveBonus ?? 1.5) : 0) + w * 1.2 + sideScore * 1.5;
          if (o.target) {
            const cx = (lo % g.w) + 0.5, cz = ((lo / g.w) | 0) + 0.5;
            score -= Math.hypot(cx - o.target.x, cz - o.target.z) * (o.targetW ?? 0.08);
          }
          if (o.score) score += o.score(flight, mode);
          if (rng) score += rng.float(0, 0.8);
          if (!best || score > best.score) {
            const lowRow = mode === 'carve' ? hi : step(g, lo, OPP[up], n - 1);
            const first = o0 === 0 ? lowRow : step(g, lowRow, o0 > 0 ? lat : OPP[lat], Math.abs(o0));
            best = { mode, up, w, n, yLo, yHi, first, flight, landLo, landHi, score, rLo, rHi };
          }
        }
      }
    }
  }
  return best;
}

// Build a flight found by findFlight. Returns the stair cells.
export function applyFlight(g, deco, P, o = {}) {
  const x = P.first % g.w, z = (P.first / g.w) | 0;
  const cells = deco.stairs(x, z, P.up, P.w, P.yLo, P.yHi, {
    rise: (P.yHi - P.yLo) / P.n, floorTex: o.tread ?? TS.STAIR, sideTex: o.side ?? TS.ROCK,
    style: o.style, region: o.region,
  });
  if (o.lock) {
    for (const i of [...cells, ...P.landLo, ...P.landHi]) {
      o.lock[i] = 1;
      for (const j of neighbors4(g, i)) if (!o.lock[j]) o.lock[j] = 2;
    }
  }
  for (const i of cells) g.flags[i] |= F.NOSPAWN;
  for (const i of [...P.landLo, ...P.landHi]) g.flags[i] |= F.NOSPAWN;
  return cells;
}

// Join every region (>= minSize cells) to the region holding `start` with
// stair flights (a random spanning tree, preferring wide shared borders),
// then add some extra flights for loops. Returns the final labelling and the
// set of regions joined to the start.
export function connectRegions(g, deco, rng, o) {
  const lock = o.lock;
  const ok = o.ok || ((i) => isGround(g, i));
  const { reg, regs } = regionsOf(g, ok);
  const startR = reg[o.start];
  const minSize = o.minSize ?? 6;
  // shared borders between regions
  const pairs = new Map();
  for (const R of regs) for (const a of R.cells) {
    for (let d = 0; d < 4; d++) {
      const b = step(g, a, d);
      if (b < 0 || reg[b] < 0 || reg[b] === R.id) continue;
      if (Math.abs(g.floor[b] - g.floor[a]) < 0.56) continue;
      const lo = Math.min(R.id, reg[b]), hi = Math.max(R.id, reg[b]);
      const k = lo * 100000 + hi;
      const p = pairs.get(k);
      if (p) p.len++; else pairs.set(k, { a: lo, b: hi, len: 1, dh: Math.abs(regs[lo].h - regs[hi].h) });
    }
  }
  const byRegion = regs.map(() => []);
  for (const p of pairs.values()) { byRegion[p.a].push(p); byRegion[p.b].push(p); }
  const joined = new Set([startR]);
  const flights = [];
  if (startR === undefined || startR < 0) return { reg, regs, joined, flights };
  const tried = new Set();
  const big = (r) => regs[r].cells.length >= minSize || (o.must && o.must.has(r));
  const fOpts = { rng, lock, widths: o.widths, maxN: o.maxN, modes: o.modes, carveBonus: o.carveBonus, maxCand: o.maxCand };
  for (let guard = 0; guard < regs.length * 3; guard++) {
    // frontier: pairs from joined regions to unjoined ones
    let bestP = null, bs = -Infinity;
    for (const r of joined) for (const p of byRegion[r]) {
      const other = p.a === r ? p.b : p.a;
      if (joined.has(other) || tried.has(p) || !big(other)) continue;
      const s = Math.min(p.len, 12) - p.dh * 0.35 + rng.float(0, 3) + (o.pairScore ? o.pairScore(p, other) : 0);
      if (s > bs) { bs = s; bestP = p; }
    }
    if (!bestP) break;
    tried.add(bestP);
    const P = findFlight(g, reg, bestP.a, bestP.b, regs, { ...fOpts, target: o.target ? o.target(bestP) : null });
    if (!P) continue;
    const cells = applyFlight(g, deco, P, { lock, tread: o.tread, side: o.side, style: o.style });
    for (const i of cells) reg[i] = -1;
    flights.push(P);
    joined.add(bestP.a); joined.add(bestP.b);
  }
  // extra flights between joined regions (loops / shortcuts)
  const extra = o.extra ?? 0;
  if (extra > 0) {
    for (const p of pairs.values()) {
      if (tried.has(p) || !joined.has(p.a) || !joined.has(p.b) || p.len < 4 || !rng.chance(extra)) continue;
      const P = findFlight(g, reg, p.a, p.b, regs, fOpts);
      if (!P) continue;
      const cells = applyFlight(g, deco, P, { lock, tread: o.tread, side: o.side, style: o.style });
      for (const i of cells) reg[i] = -1;
      flights.push(P);
    }
  }
  return { reg, regs, joined, flights };
}

// ---------------------------------------------------------------- rails
// Guard rails on edges of `cells` that drop by >= drop (or into a void / pit),
// except edges touching `allow` cells (jump spots). Edges toward stair sides
// are railed when the trench is deep enough. Sets edge bits for pathing.
export function railDrops(g, deco, cells, o = {}) {
  const drop = o.drop ?? 1.1;
  const allow = o.allow || null;
  const runs = new Map();
  const set = cells instanceof Set ? cells : new Set(cells);
  for (const i of set) {
    if (g.type[i] !== 1 || (g.flags[i] & (F.VOID | F.PIT | F.DOOR | F.STAIR))) continue;
    if (allow && allow.has(i)) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const j = step(g, i, d);
      if (j < 0 || g.type[j] !== 1 || (g.edge[i] & EDGE_BIT[d])) continue;   // already railed
      if (allow && allow.has(j)) continue;
      if (set.has(j) && !(g.flags[j] & (F.VOID | F.PIT)) && !o.inner) continue;
      const myE = g.edgeFloor(i, d);
      let deep = false;
      if (g.flags[j] & F.STAIR) {
        const axis = (g.stairDir[j] - 1) >> 1;
        if (axis !== (d >> 1) && myE - g.edgeFloor(j, OPP[d]) >= Math.max(drop, 1.4)) deep = true;
      } else if (g.flags[j] & F.VOID) deep = true;
      else if (g.flags[j] & F.PIT) deep = myE - g.floor[j] > 0.9;
      else deep = myE - g.edgeFloor(j, OPP[d]) >= drop || (o.hazard && (g.flags[j] & F.HAZARD) && myE - g.floor[j] > 0.2);
      if (!deep) continue;
      g.setEdge(x, z, d, true);
      const line = d < 2 ? x + (d === 0 ? 1 : 0) : z + (d === 2 ? 1 : 0);
      const pos = d < 2 ? z : x;
      const key = `${d}|${line}|${g.floor[i].toFixed(2)}`;
      let arr = runs.get(key); if (!arr) runs.set(key, (arr = []));
      arr.push(pos);
    }
  }
  const style = o.style || deco.railStyle;
  const tex = o.tex ?? (style === 'wood' ? TS.WOOD : TS.RAIL);
  for (const [key, arr] of runs) {
    const [ds, ls, fs] = key.split('|');
    const d = +ds, line = +ls, f = +fs;
    arr.sort((a, b) => a - b);
    const side = d === 0 || d === 2 ? -1 : 1;
    let s0 = arr[0], prev = arr[0];
    const flush = (a, b) => {
      if (d < 2) deco.railRun(line, a, line, b + 1, f, { style, tex, side });
      else deco.railRun(a, line, b + 1, line, f, { style, tex, side });
    };
    for (let k = 1; k < arr.length; k++) {
      if (arr[k] !== prev + 1) { flush(s0, prev); s0 = arr[k]; }
      prev = arr[k];
    }
    flush(s0, prev);
  }
}

// ---------------------------------------------------------------- hazards
// Sink cells into a lake / pit. depth > 1 makes a deep pit (F.PIT: rescue
// after landing); shallow lava / poison is a damaging floor, shallow water
// just slows. Rim cells show the pit-wall texture.
export function sinkPit(g, deco, cells, kind, depth, o = {}) {
  const deep = depth > 1.0;
  const haz = HAZ_OF[kind];
  const set = new Set(cells);
  let base = o.base;
  for (const i of cells) {
    if (g.type[i] !== 1) continue;
    const b = base ?? g.floor[i];
    g.floor[i] = b - depth;
    g.floorTex[i] = o.floorTex ?? HAZ_FLOOR[kind];
    g.wallTex[i] = TS.PITWALL;
    g.hazType[i] = haz;
    g.flags[i] &= ~(F.WATER | F.HAZARD | F.PIT | F.BRIDGE);
    g.flags[i] |= F.NOSPAWN;
    if (kind === 'water') g.flags[i] |= deep ? F.PIT : F.WATER;
    else g.flags[i] |= F.HAZARD | (deep ? F.PIT : 0);
    if (kind === 'lava' || kind === 'poison') g.light[i] = Math.max(g.light[i], 0.95);
    g.clearEdges(i % g.w, (i / g.w) | 0);
  }
  for (const i of cells) for (const j of neighbors4(g, i)) {
    if (set.has(j) || g.type[j] !== 1 || (g.flags[j] & (F.PIT | F.STAIR | F.VOID)) || g.hazType[j]) continue;
    g.wallTex[j] = o.rimTex ?? TS.PITWALL;
  }
  if (deco && (kind === 'lava' || kind === 'poison')) {
    const every = o.lightEvery ?? 14;
    let k = 0;
    for (const i of cells) {
      if (k++ % every) continue;
      deco.light((i % g.w) + 0.5, g.floor[i] + 0.9, ((i / g.w) | 0) + 0.5, HAZ_LIGHT[kind], 6.5, { pulse: true });
    }
  }
}

// Lay a bridge deck over pit / void / hazard cells at height y.
export function layBridge(g, deco, cells, y, o = {}) {
  const deck = o.deck ?? TS.WOOD, under = o.under ?? TS.BEAM;
  for (const i of cells) {
    const x = i % g.w, z = (i / g.w) | 0;
    const wasVoid = (g.flags[i] & F.VOID) !== 0;
    const bottom = wasVoid ? null : (o.bottom ?? g.floor[i]);
    g.open(x, z, y, g.sky[i] ? SKY_H : Math.max(g.ceil[i], y + 3), { sky: !!g.sky[i], floorTex: deck, wallTex: under });
    g.flags[i] &= ~(F.PIT | F.HAZARD | F.WATER | F.VOID);
    g.flags[i] |= F.BRIDGE | F.NOSPAWN;
    g.hazType[i] = 0;
    if (o.alongZ) g.flags[i] |= F.UVROT; else g.flags[i] &= ~F.UVROT;
    // posts down to the pit floor under the deck edges
    if (deco && bottom !== null && o.posts !== false && ((o.alongZ ? z : x) % 3 === 0)) {
      const t = 0.09;
      if (o.alongZ) {
        deco.box(x + 0.03, bottom, z + 0.45, x + 0.03 + t * 2, y - 0.3, z + 0.45 + t * 2, under, { faces: FACE.SIDES });
        deco.box(x + 0.97 - t * 2, bottom, z + 0.45, x + 0.97, y - 0.3, z + 0.45 + t * 2, under, { faces: FACE.SIDES });
      } else {
        deco.box(x + 0.45, bottom, z + 0.03, x + 0.45 + t * 2, y - 0.3, z + 0.03 + t * 2, under, { faces: FACE.SIDES });
        deco.box(x + 0.45, bottom, z + 0.97 - t * 2, x + 0.45 + t * 2, y - 0.3, z + 0.97, under, { faces: FACE.SIDES });
      }
    }
  }
  if (deco && o.rails !== false) railDrops(g, deco, cells, { style: o.style, tex: o.railTex, drop: 0.9 });
}

// ---------------------------------------------------------------- gates
// Turn the open cells of `line` into a wall (height above each floor) except
// `door`, which stays a single doorway with a frame. The door cell is what
// the populate step turns into a (keyed) door.
export function gateWall(g, deco, line, door, o = {}) {
  const tex = o.wallTex ?? TS.WOOD;
  const hgt = o.height ?? 4.2;
  const df = g.floor[door];
  for (const i of line) {
    if (i === door || g.type[i] !== 1) continue;
    g.solid(i % g.w, (i / g.w) | 0, Math.max(g.floor[i], df) + hgt, tex);
    g.floorTex[i] = o.capTex ?? tex;
  }
  const x = door % g.w, z = (door / g.w) | 0;
  g.sky[door] = 0;
  g.ceil[door] = df + 3;
  g.roof[door] = df + hgt;
  g.wallTex[door] = tex;
  g.ceilTex[door] = o.ceilTex ?? TS.WOOD;
  g.flags[door] |= F.NOSPAWN;
  g.flags[door] &= ~(F.STAIR | F.BRIDGE | F.WATER | F.HAZARD);
  g.clearEdges(x, z);
  // frame: two posts and a lintel on both faces, along the wall line
  if (deco) {
    const ft = o.frameTex ?? TS.BEAM;
    const alongX = o.axis === 'z';   // door passage runs along z => wall line runs along x
    const t = 0.16;
    for (const s of [0, 1]) {
      if (alongX) {
        const pz = z + s - (s ? t : 0);
        deco.box(x - 0.02, df, pz, x + 0.12, df + 3.1, pz + t, ft);
        deco.box(x + 0.88, df, pz, x + 1.02, df + 3.1, pz + t, ft);
        deco.box(x - 0.15, df + 2.92, pz, x + 1.15, df + 3.22, pz + t, ft);
      } else {
        const px = x + s - (s ? t : 0);
        deco.box(px, df, z - 0.02, px + t, df + 3.1, z + 0.12, ft);
        deco.box(px, df, z + 0.88, px + t, df + 3.1, z + 1.02, ft);
        deco.box(px, df + 2.92, z - 0.15, px + t, df + 3.22, z + 1.15, ft);
      }
    }
    if (o.torch) {
      // lamps either side of the doorway, on the approach face
      const dir = o.facing ?? 1;
      if (alongX) {
        for (const ox of [-1, 1]) {
          const lx = x + 0.5 + ox * 1.0, lz = z + (dir > 0 ? 1.08 : -0.08);
          deco.box(lx - 0.12, df + 2.2, lz - 0.06, lx + 0.12, df + 2.45, lz + 0.06, TS.LIGHT, { uv: 'fit', emissive: 1 });
          deco.light(lx, df + 2.2, lz + (dir > 0 ? 0.4 : -0.4), o.torch, 5, { flicker: true });
        }
      } else {
        for (const oz of [-1, 1]) {
          const lz = z + 0.5 + oz * 1.0, lx = x + (dir > 0 ? 1.08 : -0.08);
          deco.box(lx - 0.06, df + 2.2, lz - 0.12, lx + 0.06, df + 2.45, lz + 0.12, TS.LIGHT, { uv: 'fit', emissive: 1 });
          deco.light(lx + (dir > 0 ? 0.4 : -0.4), df + 2.2, lz, o.torch, 5, { flicker: true });
        }
      }
    }
  }
}

// Snapshot / restore the grid state of a set of cells (used to undo a
// feature that turned out to break a chamber's connectivity).
const SNAP_FIELDS = ['type', 'floor', 'ceil', 'sky', 'wallTex', 'floorTex', 'ceilTex', 'light', 'flags', 'region', 'hazType', 'stairDir', 'rise', 'edge', 'roof'];
export function snapCells(g, cells) {
  const list = Int32Array.from(cells);
  const data = {};
  for (const k of SNAP_FIELDS) {
    const src = g[k];
    const arr = new src.constructor(list.length);
    for (let n = 0; n < list.length; n++) arr[n] = src[list[n]];
    data[k] = arr;
  }
  return { list, data };
}
export function restoreCells(g, snap) {
  const { list, data } = snap;
  for (const k of SNAP_FIELDS) {
    const dst = g[k], arr = data[k];
    for (let n = 0; n < list.length; n++) dst[list[n]] = arr[n];
  }
}

// Fill open cells that cannot be reached from start (enclosed pockets).
export function fillUnreachable(g, start, o = {}) {
  const dist = g.bfs([start], { jumpGap: o.jumpGap || 0, allowVoid: false });
  let filled = 0;
  for (let i = 0; i < g.w * g.h; i++) {
    if (g.type[i] !== 1 || dist[i] >= 0) continue;
    if (g.flags[i] & (F.VOID | F.PIT | F.HAZARD | F.WATER)) continue;
    if (o.keep && o.keep(i)) continue;
    g.solid(i % g.w, (i / g.w) | 0, o.top ?? g.wallTop, o.wallTex);
    filled++;
  }
  return filled;
}

// Count 1-wide walkable cells (open on one axis, blocked on the other) that
// are not doors / stairs / bridges: the "narrow corridor" metric.
export function narrowCells(g) {
  const out = [];
  const blocked = (i, j) => j < 0 || g.type[j] !== 1 || (g.flags[j] & (F.VOID | F.PIT)) || Math.abs(g.minFloor(j) - g.floor[i]) > 0.6;
  for (let i = 0; i < g.w * g.h; i++) {
    if (!isGround(g, i) || (g.flags[i] & (F.BRIDGE | F.OBSTACLE))) continue;
    const e = blocked(i, step(g, i, 0)), wv = blocked(i, step(g, i, 1)), s = blocked(i, step(g, i, 2)), nn = blocked(i, step(g, i, 3));
    if ((e && wv && !s && !nn) || (s && nn && !e && !wv)) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------- props
// Tapered natural spike: stalagmite (up) / stalactite (o.down) / ice spire.
export function rockSpike(deco, x, z, y, h, r, tex = TS.ROCK, o = {}) {
  const rng = deco.rng;
  const segs = o.segs ?? 4;
  let cx = x, cz = z;
  for (let k = 0; k < segs; k++) {
    const t0 = k / segs, t1 = (k + 1) / segs;
    const rr = r * (1 - t0 * 0.8);
    const rz = rr * (o.flat ?? 1);
    const y0 = o.down ? y - h * t1 : y + h * t0;
    const y1 = o.down ? y - h * t0 : y + h * t1 + (k < segs - 1 ? 0.02 : 0);
    deco.box(cx - rr, y0, cz - rz, cx + rr, y1, cz + rz, tex, { emissive: o.emissive, s: o.s ?? 1.5 });
    cx += rng.float(-0.05, 0.05) * r * 2; cz += rng.float(-0.05, 0.05) * r * 2;
  }
  if (o.solid) deco.collider(x - r * 0.85, o.down ? y - h : y, z - r * 0.85, x + r * 0.85, o.down ? y : y + h, z + r * 0.85);
}
// floor-to-ceiling rock column (stalagmite and stalactite grown together)
export function rockColumn(deco, x, z, y0, y1, r, tex = TS.ROCK, o = {}) {
  const h = y1 - y0;
  rockSpike(deco, x, z, y0, h * 0.42, r, tex, { segs: 3, s: o.s });
  rockSpike(deco, x, z, y1, h * 0.42, r * 0.95, tex, { segs: 3, down: true, s: o.s });
  deco.box(x - r * 0.42, y0 + h * 0.2, z - r * 0.42, x + r * 0.42, y1 - h * 0.2, z + r * 0.42, tex, { faces: FACE.SIDES, s: o.s ?? 1.5 });
  deco.collider(x - r * 0.8, y0, z - r * 0.8, x + r * 0.8, y1, z + r * 0.8);
}
// lumpy boulder of 2-3 boxes
export function boulder(deco, x, z, y, s, tex = TS.ROCK) {
  const rng = deco.rng;
  const h = s * rng.float(0.55, 0.8);
  deco.box(x - s / 2, y, z - s * 0.42, x + s / 2, y + h, z + s * 0.42, tex, { s: 1.5 });
  deco.box(x - s * 0.36, y + h - 0.02, z - s * 0.3, x + s * 0.3, y + h + s * 0.28, z + s * 0.32, tex, { s: 1.5 });
  if (rng.chance(0.6)) {
    const ox = rng.sign() * s * 0.45, oz = rng.sign() * s * 0.3;
    deco.box(x + ox - s * 0.25, y, z + oz - s * 0.25, x + ox + s * 0.25, y + h * 0.6, z + oz + s * 0.25, tex, { s: 1.5 });
  }
  deco.collider(x - s / 2, y, z - s * 0.42, x + s / 2, y + h + s * 0.2, z + s * 0.42);
}
// glowing crystal cluster (crystal role = theme accent), with a light
export function crystalCluster(deco, x, z, y, h, tex = TS.ACCENT, color = [0.75, 0.45, 1], o = {}) {
  const rng = deco.rng;
  const n = o.count ?? rng.int(3, 6);
  boulder(deco, x, z, y - 0.15, 0.7, o.baseTex ?? TS.ROCK);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng.float(-0.3, 0.3);
    const d = k === 0 ? 0 : rng.float(0.15, 0.42);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const hh = (k === 0 ? 1 : rng.float(0.35, 0.75)) * h;
    const w = (k === 0 ? 0.2 : rng.float(0.08, 0.15));
    // two stacked prisms leaning outward
    const lx = Math.cos(a) * hh * 0.12, lz = Math.sin(a) * hh * 0.12;
    deco.box(px - w, y, pz - w, px + w, y + hh * 0.6, pz + w, tex, { emissive: o.emissive ?? 0.75, uv: 'fit' });
    deco.box(px + lx - w * 0.6, y + hh * 0.6, pz + lz - w * 0.6, px + lx + w * 0.6, y + hh, pz + lz + w * 0.6, tex, { emissive: o.emissive ?? 0.75, uv: 'fit' });
  }
  deco.collider(x - 0.45, y, z - 0.45, x + 0.45, y + h * 0.8, z + 0.45);
  if (o.light !== false) deco.light(x, y + h * 0.6, z, color, o.radius ?? 5.5, { pulse: !!o.pulse });
}
// cluster of hexagonal-looking basalt columns of different heights
export function basalt(deco, x, z, y, o = {}) {
  const rng = deco.rng;
  const n = o.count ?? rng.int(4, 7);
  const tex = o.tex ?? TS.ROCK;
  let maxH = 0;
  for (let k = 0; k < n; k++) {
    const px = x + rng.float(-0.55, 0.55), pz = z + rng.float(-0.55, 0.55);
    const s = rng.float(0.22, 0.34), hh = rng.float(0.5, o.maxH ?? 3.4);
    maxH = Math.max(maxH, hh);
    deco.box(px - s, y, pz - s, px + s, y + hh, pz + s, tex, { s: 1.2 });
  }
  deco.collider(x - 0.75, y, z - 0.75, x + 0.75, y + Math.min(maxH, 2.4), z + 0.75);
}
// timber mine support across a tunnel: posts against both walls + header beam
export function mineSupport(deco, alongX, a, b0, b1, y, top, tex = TS.BEAM) {
  const t = 0.22;
  if (alongX) {         // tunnel runs along x at x = a; walls at z = b0 and z = b1
    deco.box(a - t / 2, y, b0, a + t / 2, top, b0 + t, tex, { faces: FACE.SIDES });
    deco.box(a - t / 2, y, b1 - t, a + t / 2, top, b1, tex, { faces: FACE.SIDES });
    deco.box(a - t / 2 - 0.02, top - 0.3, b0, a + t / 2 + 0.02, top, b1, tex);
  } else {
    deco.box(b0, y, a - t / 2, b0 + t, top, a + t / 2, tex, { faces: FACE.SIDES });
    deco.box(b1 - t, y, a - t / 2, b1, top, a + t / 2, tex, { faces: FACE.SIDES });
    deco.box(b0, top - 0.3, a - t / 2 - 0.02, b1, top, a + t / 2 + 0.02, tex);
  }
}
// mine track: two metal rails on wooden sleepers from (x0,z0) to (x1,z1) (axis aligned)
export function mineTrack(deco, x0, z0, x1, z1, y) {
  const alongX = z0 === z1;
  const a = alongX ? Math.min(x0, x1) : Math.min(z0, z1), b = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const c = alongX ? z0 : x0;
  for (let t = a + 0.25; t < b; t += 0.6) {
    if (alongX) deco.box(t - 0.09, y, c - 0.42, t + 0.09, y + 0.05, c + 0.42, TS.WOOD, { faces: FACE.TOP | FACE.SIDES });
    else deco.box(c - 0.42, y, t - 0.09, c + 0.42, y + 0.05, t + 0.09, TS.WOOD, { faces: FACE.TOP | FACE.SIDES });
  }
  for (const s of [-0.28, 0.28]) {
    if (alongX) deco.box(a, y + 0.05, c + s - 0.03, b, y + 0.12, c + s + 0.03, TS.METAL, { faces: FACE.TOP | FACE.SIDES });
    else deco.box(c + s - 0.03, y + 0.05, a, c + s + 0.03, y + 0.12, b, TS.METAL, { faces: FACE.TOP | FACE.SIDES });
  }
}
// ore cart: open metal tub full of rock on wheels
export function mineCart(deco, x, z, y, alongX) {
  const L = 0.65, Wd = 0.42, H = 0.75, t = 0.06;
  const [hx, hz] = alongX ? [L, Wd] : [Wd, L];
  const y0 = y + 0.22;
  deco.box(x - hx, y0, z - hz, x + hx, y0 + 0.06, z + hz, TS.METAL);
  deco.box(x - hx, y0, z - hz, x + hx, y0 + H - 0.2, z - hz + t, TS.METAL);
  deco.box(x - hx, y0, z + hz - t, x + hx, y0 + H - 0.2, z + hz, TS.METAL);
  deco.box(x - hx, y0, z - hz, x - hx + t, y0 + H - 0.2, z + hz, TS.METAL);
  deco.box(x + hx - t, y0, z - hz, x + hx, y0 + H - 0.2, z + hz, TS.METAL);
  deco.box(x - hx + t, y0 + 0.06, z - hz + t, x + hx - t, y0 + H - 0.3, z + hz - t, TS.ROCK, { faces: FACE.TOP });
  deco.box(x - hx * 0.6, y0 + H - 0.3, z - hz * 0.6, x + hx * 0.5, y0 + H - 0.12, z + hz * 0.5, TS.ROCK);
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    if (alongX) {
      const wx = x + sa * hx * 0.65, wz = z + sb * (hz + 0.02);
      deco.box(wx - 0.13, y, wz - 0.04, wx + 0.13, y + 0.26, wz + 0.04, TS.METAL, { lightMul: 0.4 });
    } else {
      const wx = x + sb * (hx + 0.02), wz = z + sa * hz * 0.65;
      deco.box(wx - 0.04, y, wz - 0.13, wx + 0.04, y + 0.26, wz + 0.13, TS.METAL, { lightMul: 0.4 });
    }
  }
  deco.collider(x - hx, y, z - hz, x + hx, y0 + H - 0.12, z + hz);
}
// fire bowl on legs
export function brazier(deco, x, z, y, color = [1, 0.55, 0.2], o = {}) {
  const tex = o.tex ?? TS.METAL;
  for (const [ox, oz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) deco.box(x + ox - 0.035, y, z + oz - 0.035, x + ox + 0.035, y + 0.75, z + oz + 0.035, tex, { faces: FACE.SIDES });
  deco.box(x - 0.36, y + 0.72, z - 0.36, x + 0.36, y + 1.0, z + 0.36, tex);
  deco.box(x - 0.26, y + 1.0, z - 0.26, x + 0.26, y + 1.22, z + 0.26, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.box(x - 0.14, y + 1.22, z - 0.14, x + 0.14, y + 1.4, z + 0.14, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.collider(x - 0.36, y, z - 0.36, x + 0.36, y + 1.0, z + 0.36);
  deco.light(x, y + 1.6, z, color, o.radius ?? 7, { flicker: true });
}
// lantern on a post (wood or metal)
export function lanternPost(deco, x, z, y, color = [1, 0.8, 0.5], o = {}) {
  const tex = o.tex ?? TS.WOOD, h = o.height ?? 2.3;
  deco.box(x - 0.06, y, z - 0.06, x + 0.06, y + h, z + 0.06, tex, { faces: FACE.SIDES | FACE.TOP });
  const ax = o.armX ?? 0.35, az = o.armZ ?? 0;
  deco.box(Math.min(x, x + ax) - 0.03, y + h - 0.12, Math.min(z, z + az) - 0.03, Math.max(x, x + ax) + 0.03, y + h - 0.05, Math.max(z, z + az) + 0.03, tex);
  deco.box(x + ax - 0.1, y + h - 0.45, z + az - 0.1, x + ax + 0.1, y + h - 0.15, z + az + 0.1, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.box(x + ax - 0.12, y + h - 0.17, z + az - 0.12, x + ax + 0.12, y + h - 0.12, z + az + 0.12, TS.METAL);
  deco.collider(x - 0.1, y, z - 0.1, x + 0.1, y + h, z + 0.1, { obstacle: false });
  deco.light(x + ax, y + h - 0.4, z + az, color, o.radius ?? 6, { flicker: !!o.flicker });
}
// thin vertical slab of lava / water pouring down a wall face (dir = wall side of cell x,z)
export function liquidFall(deco, x, z, dir, y0, y1, tex = TS.LAVA, color = [1, 0.45, 0.15]) {
  const t = 0.12;
  const w0 = 0.2, w1 = 0.8;
  if (dir === 0) deco.box(x + 1 - t, y0, z + w0, x + 1, y1, z + w1, tex, { emissive: 1, uv: 'world', s: 2 });
  else if (dir === 1) deco.box(x, y0, z + w0, x + t, y1, z + w1, tex, { emissive: 1, s: 2 });
  else if (dir === 2) deco.box(x + w0, y0, z + 1 - t, x + w1, y1, z + 1, tex, { emissive: 1, s: 2 });
  else deco.box(x + w0, y0, z, x + w1, y1, z + t, tex, { emissive: 1, s: 2 });
  if (color) deco.light(x + 0.5 + DIR_X[dir] * 0.2, (y0 + y1) / 2, z + 0.5 + DIR_Z[dir] * 0.2, color, 7, { pulse: true });
}
// rib arch of bones over a passage (hell). alongX: passage runs along x at x=a, walls at b0/b1
export function ribArch(deco, alongX, a, b0, b1, y, top, tex = TS.ACCENT) {
  const t = 0.2, span = b1 - b0;
  const seg = (u0, u1, y0, y1) => {
    if (alongX) deco.box(a - t / 2, y0, b0 + u0, a + t / 2, y1, b0 + u1, tex);
    else deco.box(b0 + u0, y0, a - t / 2, b0 + u1, y1, a + t / 2, tex);
  };
  const h = top - y;
  seg(0.05, 0.3, y, y + h * 0.55);
  seg(span - 0.3, span - 0.05, y, y + h * 0.55);
  seg(0.2, 0.55, y + h * 0.5, y + h * 0.75);
  seg(span - 0.55, span - 0.2, y + h * 0.5, y + h * 0.75);
  seg(0.45, span * 0.5 - 0.05, y + h * 0.72, y + h * 0.88);
  seg(span * 0.5 + 0.05, span - 0.45, y + h * 0.72, y + h * 0.88);
}
// pile of bones / skulls (hell)
export function bonePile(deco, x, z, y, tex = TS.ACCENT) {
  const rng = deco.rng;
  for (let k = 0; k < rng.int(4, 7); k++) {
    const px = x + rng.float(-0.45, 0.45), pz = z + rng.float(-0.45, 0.45);
    const L = rng.float(0.3, 0.7), ax = rng.chance(0.5);
    const yy = y + rng.float(0, 0.18);
    if (ax) deco.box(px - L / 2, yy, pz - 0.05, px + L / 2, yy + 0.09, pz + 0.05, tex);
    else deco.box(px - 0.05, yy, pz - L / 2, px + 0.05, yy + 0.09, pz + L / 2, tex);
  }
  // skulls
  for (let k = 0; k < rng.int(1, 3); k++) {
    const px = x + rng.float(-0.3, 0.3), pz = z + rng.float(-0.3, 0.3);
    deco.box(px - 0.12, y, pz - 0.12, px + 0.12, y + 0.22, pz + 0.12, tex, { uv: 'fit' });
  }
}
// impaling stake / bone spike (hell)
export function stake(deco, x, z, y, h, tex = TS.ACCENT) {
  deco.box(x - 0.07, y, z - 0.07, x + 0.07, y + h * 0.75, z + 0.07, tex, { faces: FACE.SIDES });
  deco.box(x - 0.04, y + h * 0.75, z - 0.04, x + 0.04, y + h, z + 0.04, tex);
  deco.collider(x - 0.1, y, z - 0.1, x + 0.1, y + h, z + 0.1, { obstacle: false });
}
// pine tree: trunk + stacked foliage tiers
export function pineTree(deco, x, z, y, s = 1, o = {}) {
  const trunk = o.trunk ?? TS.WOOD, leaf = o.leaf ?? TS.FOLIAGE;
  const h = 4.2 * s;
  deco.box(x - 0.13 * s, y, z - 0.13 * s, x + 0.13 * s, y + h * 0.5, z + 0.13 * s, trunk, { faces: FACE.SIDES });
  for (let k = 0; k < 3; k++) {
    const r = (1.15 - k * 0.32) * s, y0 = y + h * (0.28 + k * 0.22), y1 = y0 + h * 0.26;
    deco.box(x - r, y0, z - r, x + r, y1, z + r, leaf, { s: 1.5 });
  }
  deco.box(x - 0.18 * s, y + h * 0.94, z - 0.18 * s, x + 0.18 * s, y + h * 1.05, z + 0.18 * s, leaf);
  deco.collider(x - 0.2 * s, y, z - 0.2 * s, x + 0.2 * s, y + h * 0.5, z + 0.2 * s);
}
// dead tree: bare trunk with a few branches
export function deadTree(deco, x, z, y, s = 1, tex = TS.WOOD) {
  const rng = deco.rng;
  const h = 3.4 * s;
  deco.box(x - 0.12 * s, y, z - 0.12 * s, x + 0.12 * s, y + h, z + 0.12 * s, tex, { faces: FACE.SIDES | FACE.TOP });
  for (let k = 0; k < 3; k++) {
    const by = y + h * (0.45 + k * 0.17), L = rng.float(0.5, 1.1) * s, d = rng.int(0, 3);
    const ex = x + DIR_X[d] * L, ez = z + DIR_Z[d] * L;
    deco.box(Math.min(x, ex) - 0.05, by, Math.min(z, ez) - 0.05, Math.max(x, ex) + 0.05, by + 0.1, Math.max(z, ez) + 0.05, tex);
    deco.box(ex - 0.05, by, ez - 0.05, ex + 0.05, by + 0.45 * s, ez + 0.05, tex, { faces: FACE.SIDES | FACE.TOP });
  }
  deco.collider(x - 0.18 * s, y, z - 0.18 * s, x + 0.18 * s, y + h, z + 0.18 * s);
}
// palm tree (desert oasis)
export function palmTree(deco, x, z, y, s = 1) {
  const rng = deco.rng;
  const h = 4.6 * s;
  let px = x, pz = z;
  const lx = rng.float(-0.08, 0.08), lz = rng.float(-0.08, 0.08);
  for (let k = 0; k < 5; k++) {
    const y0 = y + (h * k) / 5;
    deco.box(px - 0.12, y0, pz - 0.12, px + 0.12, y0 + h / 5 + 0.02, pz + 0.12, TS.WOOD, { faces: FACE.SIDES });
    px += lx; pz += lz;
  }
  for (let d = 0; d < 4; d++) {
    const ex = px + DIR_X[d] * 1.3 * s, ez = pz + DIR_Z[d] * 1.3 * s;
    deco.box(Math.min(px, ex) - 0.25, y + h - 0.1, Math.min(pz, ez) - 0.25, Math.max(px, ex) + 0.25, y + h + 0.05, Math.max(pz, ez) + 0.25, TS.FOLIAGE);
    deco.box(ex - 0.22, y + h - 0.55, ez - 0.22, ex + 0.22, y + h - 0.1, ez + 0.22, TS.FOLIAGE);
  }
  deco.collider(x - 0.18, y, z - 0.18, x + 0.18, y + h, z + 0.18);
}
// saguaro cactus
export function cactus(deco, x, z, y, s = 1) {
  const rng = deco.rng;
  const h = rng.float(1.6, 2.8) * s;
  deco.box(x - 0.16, y, z - 0.16, x + 0.16, y + h, z + 0.16, TS.FOLIAGE, { s: 1 });
  for (const sd of [-1, 1]) {
    if (!rng.chance(0.75)) continue;
    const ay = y + h * rng.float(0.35, 0.6), ax = rng.chance(0.5);
    const ex = ax ? x + sd * 0.5 : x, ez = ax ? z : z + sd * 0.5;
    deco.box(Math.min(x, ex) - 0.1, ay, Math.min(z, ez) - 0.1, Math.max(x, ex) + 0.1, ay + 0.2, Math.max(z, ez) + 0.1, TS.FOLIAGE);
    deco.box(ex - 0.11, ay, ez - 0.11, ex + 0.11, ay + h * 0.4, ez + 0.11, TS.FOLIAGE);
  }
  deco.collider(x - 0.2, y, z - 0.2, x + 0.2, y + h, z + 0.2);
}
// balanced-rock hoodoo / rock spire
export function hoodoo(deco, x, z, y, h, tex = TS.ROCK, capTex = TS.ROCK) {
  const rng = deco.rng;
  const segs = 3;
  let r = rng.float(0.45, 0.7);
  for (let k = 0; k < segs; k++) {
    const y0 = y + (h * 0.85 * k) / segs, y1 = y + (h * 0.85 * (k + 1)) / segs + 0.02;
    deco.box(x - r, y0, z - r * 0.9, x + r, y1, z + r * 0.9, tex, { s: 1.5 });
    r *= rng.float(0.72, 0.9);
  }
  const cr = rng.float(0.6, 0.9);
  deco.box(x - cr, y + h * 0.85, z - cr * 0.8, x + cr, y + h, z + cr * 0.8, capTex, { s: 1.5 });
  deco.collider(x - 0.6, y, z - 0.55, x + 0.6, y + h, z + 0.55);
}
// campfire: ring of stones, logs and a flame
export function campfire(deco, x, z, y) {
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const px = x + Math.cos(a) * 0.42, pz = z + Math.sin(a) * 0.42;
    deco.box(px - 0.09, y, pz - 0.09, px + 0.09, y + 0.14, pz + 0.09, TS.ROCK);
  }
  deco.box(x - 0.35, y, z - 0.06, x + 0.35, y + 0.1, z + 0.06, TS.WOOD);
  deco.box(x - 0.06, y + 0.08, z - 0.35, x + 0.06, y + 0.18, z + 0.35, TS.WOOD);
  deco.box(x - 0.16, y + 0.12, z - 0.16, x + 0.16, y + 0.42, z + 0.16, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.box(x - 0.08, y + 0.42, z - 0.08, x + 0.08, y + 0.6, z + 0.08, TS.LIGHT, { uv: 'fit', emissive: 1 });
  deco.light(x, y + 0.8, z, [1, 0.6, 0.25], 6.5, { flicker: true });
}
// wooden signpost / waymarker
export function signpost(deco, x, z, y, dir = 0) {
  deco.box(x - 0.05, y, z - 0.05, x + 0.05, y + 1.6, z + 0.05, TS.WOOD, { faces: FACE.SIDES | FACE.TOP });
  const ex = DIR_X[dir] * 0.45, ez = DIR_Z[dir] * 0.45;
  deco.box(Math.min(x, x + ex) - 0.04, y + 1.25, Math.min(z, z + ez) - 0.04, Math.max(x, x + ex) + 0.04, y + 1.5, Math.max(z, z + ez) + 0.04, TS.WOOD);
}

// ---------------------------------------------------------------- structures
// Mine adit: a short timbered tunnel cut into the rock wall of area c, with
// a timber frame at the mouth, track, an ore cart and a lamp (X / L: the
// natlayout context and feature library).
export function adit(X, L, c, o = {}) {
  const { g, deco, rng, W, H, idx, owner, tmask } = X;
  const len = o.len ?? rng.int(3, 5);
  const cands = [];
  for (const i of c.cells) {
    if (!L.markFree(c, i) || L.nearBad(c, i)) continue;
    for (let d = 0; d < 4; d++) {
      const j = step(g, i, d);
      if (j >= 0 && !g.type[j]) cands.push([i, d]);
    }
  }
  rng.shuffle(cands);
  for (const [i, d] of cands.slice(0, 60)) {
    const lat = d < 2 ? 2 : 0;
    const x0 = i % W, z0 = (i / W) | 0;
    const row = [-1, 0, 1].map((s) => idx(x0 + DIR_X[lat] * s, z0 + DIR_Z[lat] * s));
    if (!row.every((r) => c.cellSet.has(r) && L.markFree(c, r) && !L.nearBad(c, r))) continue;
    const cells = [];
    let ok = true;
    for (let k = 1; k <= len && ok; k++) for (let s = -1; s <= 1; s++) {
      const x = x0 + DIR_X[d] * k + DIR_X[lat] * s, z = z0 + DIR_Z[d] * k + DIR_Z[lat] * s;
      if (x < 3 || z < 3 || x > W - 4 || z > H - 4) { ok = false; break; }
      const a = idx(x, z);
      if (g.type[a] || owner[a] >= 0 || tmask[a] >= 0) { ok = false; break; }
      // keep a rock skin of 1 cell around the adit
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) {
        const b = idx(x + dx, z + dz);
        if (g.type[b] && !row.includes(b) && !c.cellSet.has(b)) { ok = false; break; }
      }
      cells.push([a, k, s]);
    }
    if (!ok) continue;
    const y = c.h, top = y + 3.0;
    for (const [a] of cells) {
      const rockTop = Math.max(g.floor[a], top + 2);
      g.open(a % W, (a / W) | 0, y, top, { sky: false, floorTex: TS.FLOOR2, ceilTex: TS.WOOD, wallTex: g.wallTex[a], region: c.id, light: 0.55, flags: F.NOSPAWN });
      g.roof[a] = rockTop;
    }
    // timber supports, track and an ore cart along the adit
    const ax = d >= 2;                          // adit runs along z -> supports span x
    const sg = d === 0 || d === 2 ? 1 : -1;
    const m = d < 2 ? x0 : z0;                  // mouth row coordinate along the adit
    const b0 = (ax ? x0 : z0) - 1, b1 = (ax ? x0 : z0) + 2;
    for (const k of [1, 3, 5]) if (k <= len) mineSupport(deco, !ax, m + sg * k + 0.5 - sg * 0.35, b0, b1, y, top, TS.BEAM);
    const ta = Math.min(m, m + sg * len), tb = Math.max(m, m + sg * len) + 1;
    const mid = (ax ? x0 : z0) + 0.5;
    if (ax) mineTrack(deco, mid, ta, mid, tb, y);
    else mineTrack(deco, ta, mid, tb, mid, y);
    const cpos = m + sg * Math.min(len, 2) + 0.5;
    mineCart(deco, ax ? mid : cpos, ax ? cpos : mid, y + 0.12, !ax);
    // lamp at the back
    const back = cells.find(([, k, s]) => k === len && s === 0)[0];
    deco.wallLight(back % W, (back / W) | 0, d, y + 2.0, o.color ?? [1, 0.75, 0.4], { flicker: true, radius: 5 });
    // crates by the mouth
    const side = cells.find(([, k, s]) => k === 1 && s === 1)[0];
    deco.crateStack((side % W) + 0.5, ((side / W) | 0) + 0.5, y, { count: rng.int(1, 2) });
    return true;
  }
  return false;
}

// Small hut / cabin / outpost standing in area c: solid walls (wallTex),
// a doorway facing the area centre, a plank ceiling, a stepped roof (ROOF),
// a chimney, windows (GLASS) and a table, crates and a lamp inside.
export function cabin(X, L, c, o = {}) {
  const { g, deco, rng, W, idx } = X;
  const wallTex = o.wallTex ?? TS.WOOD;
  for (let t = 0; t < 40; t++) {
    const w = rng.int(5, 6), h = rng.int(4, 5);
    const i0 = rng.pick(c.cells), x0 = (i0 % W) - (w >> 1), z0 = ((i0 / W) | 0) - (h >> 1);
    let ok = true;
    for (let z = z0 - 1; z <= z0 + h && ok; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
      const i = idx(x, z);
      if (!g.in(x, z) || !c.cellSet.has(i) || !L.markFree(c, i) || L.nearBad(c, i) || L.onSpine(c, i)) { ok = false; break; }
    }
    if (!ok) continue;
    const y = c.h, wallH = 3.0;
    // doorway on the side facing the area centre
    const cx = x0 + w / 2, cz = z0 + h / 2;
    const dx = c.cx - cx, dz = c.cz - cz;
    const side = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3);
    const door = side === 0 ? idx(x0 + w - 1, z0 + (h >> 1)) : side === 1 ? idx(x0, z0 + (h >> 1)) : side === 2 ? idx(x0 + (w >> 1), z0 + h - 1) : idx(x0 + (w >> 1), z0);
    const inner = [];
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
      const i = idx(x, z);
      const edge = x === x0 || z === z0 || x === x0 + w - 1 || z === z0 + h - 1;
      if (edge && i !== door) { g.solid(x, z, y + wallH, wallTex); g.floorTex[i] = TS.ROOF; continue; }
      g.sky[i] = 0; g.ceil[i] = y + (i === door ? 2.4 : 2.6); g.roof[i] = y + wallH; g.ceilTex[i] = TS.WOOD;
      g.floorTex[i] = TS.WOOD; g.flags[i] &= ~F.OUTDOOR; g.flags[i] |= F.NOSPAWN;
      g.light[i] = Math.min(g.light[i], 0.75);
      if (i !== door) inner.push(i);
    }
    // stepped roof
    const rx0 = x0 - 0.25, rx1 = x0 + w + 0.25, rz0 = z0 - 0.25, rz1 = z0 + h + 0.25;
    const alongX = w >= h;
    for (let k = 0; k < 3; k++) {
      const inset = k * (alongX ? h : w) * 0.17;
      if (alongX) deco.box(rx0, y + wallH + k * 0.32, rz0 + inset, rx1, y + wallH + (k + 1) * 0.32, rz1 - inset, TS.ROOF);
      else deco.box(rx0 + inset, y + wallH + k * 0.32, rz0, rx1 - inset, y + wallH + (k + 1) * 0.32, rz1, TS.ROOF);
    }
    // chimney
    const chx = x0 + 0.6, chz = z0 + 0.6;
    deco.box(chx - 0.25, y + wallH, chz - 0.25, chx + 0.25, y + wallH + 1.6, chz + 0.25, o.chimneyTex ?? TS.ROCK);
    // door frame (TRIM) and windows on the outside faces
    const ddx = door % W, ddz = (door / W) | 0;
    const ax = side < 2;
    if (ax) {
      const px = side === 0 ? ddx + 1 : ddx;
      deco.box(px - 0.08, y, ddz - 0.06, px + 0.08, y + 2.5, ddz + 0.08, TS.TRIM);
      deco.box(px - 0.08, y, ddz + 0.92, px + 0.08, y + 2.5, ddz + 1.06, TS.TRIM);
      deco.box(px - 0.08, y + 2.4, ddz - 0.06, px + 0.08, y + 2.6, ddz + 1.06, TS.TRIM);
    } else {
      const pz = side === 2 ? ddz + 1 : ddz;
      deco.box(ddx - 0.06, y, pz - 0.08, ddx + 0.08, y + 2.5, pz + 0.08, TS.TRIM);
      deco.box(ddx + 0.92, y, pz - 0.08, ddx + 1.06, y + 2.5, pz + 0.08, TS.TRIM);
      deco.box(ddx - 0.06, y + 2.4, pz - 0.08, ddx + 1.06, y + 2.6, pz + 0.08, TS.TRIM);
    }
    let wins = 0;
    for (let z = z0 - 1; z <= z0 + h && wins < 2; z++) for (let x = x0 - 1; x <= x0 + w && wins < 2; x++) {
      const i = idx(x, z);
      if (!g.type[i] || (x >= x0 && x < x0 + w && z >= z0 && z < z0 + h)) continue;
      for (let d = 0; d < 4; d++) {
        const j = step(g, i, d);
        if (j < 0 || g.type[j] || !rng.chance(0.25)) continue;
        const jx = j % W, jz = (j / W) | 0;
        if (jx === x0 && jz === z0 || jx === x0 + w - 1 && jz === z0 || jx === x0 && jz === z0 + h - 1 || jx === x0 + w - 1 && jz === z0 + h - 1) continue;
        deco.window(x, z, d, y + 1.2, y + 2.1, { emissive: 0.5 });
        wins++;
        break;
      }
    }
    // furniture + lamp
    rng.shuffle(inner);
    if (inner.length) { const i = inner.pop(); deco.table((i % W) + 0.15, ((i / W) | 0) + 0.15, y, 0.7, 0.7); }
    if (inner.length) { const i = inner.pop(); deco.crateStack((i % W) + 0.5, ((i / W) | 0) + 0.5, y, { count: rng.int(1, 3) }); }
    deco.light(cx, y + 2.1, cz, o.lamp ?? [1, 0.8, 0.5], 5, { flicker: true });
    const li = inner.find((i) => neighbors4(g, i).some((j) => !g.type[j]));
    if (li !== undefined) {
      const d = [0, 1, 2, 3].find((dd) => { const j = step(g, li, dd); return j >= 0 && !g.type[j]; });
      deco.wallLight(li % W, (li / W) | 0, d, y + 1.9, o.lamp ?? [1, 0.8, 0.5], { flicker: true, radius: 4 });
    }
    return true;
  }
  return false;
}

// Abandoned covered wagon: plank bed and sides (WOOD), four spoked wheels
// (WOOD, darker), bare bonnet hoops (WOOD), a shaft, and cargo crates (CRATE).
// alongX: the wagon's length runs along x.
export function wagon(deco, x, z, y, alongX = true, o = {}) {
  const rng = deco.rng;
  const L = 1.25, Wd = 0.62, bed = y + 0.55, t = 0.07;
  const box = (a0, y0, b0, a1, y1, b1, tex, opt) => (alongX ? deco.box(x + a0, y0, z + b0, x + a1, y1, z + b1, tex, opt) : deco.box(x + b0, y0, z + a0, x + b1, y1, z + a1, tex, opt));
  box(-L, bed, -Wd, L, bed + 0.1, Wd, TS.WOOD);                      // bed
  box(-L, bed + 0.1, -Wd, L, bed + 0.5, -Wd + t, TS.WOOD);           // sides
  box(-L, bed + 0.1, Wd - t, L, bed + 0.5, Wd, TS.WOOD);
  box(-L, bed + 0.1, -Wd, -L + t, bed + 0.5, Wd, TS.WOOD);
  box(L - t, bed + 0.1, -Wd, L, bed + 0.42, Wd, TS.WOOD);
  for (const a of [-L * 0.62, L * 0.62]) {                           // axles + wheels
    box(a - 0.05, y + 0.36, -Wd - 0.12, a + 0.05, y + 0.44, Wd + 0.12, TS.WOOD, { lightMul: 0.6 });
    for (const s of [-1, 1]) {
      const b = s * (Wd + 0.1);
      box(a - 0.4, y + 0.02, b - 0.04, a + 0.4, y + 0.8, b + 0.04, TS.WOOD, { lightMul: 0.45, faces: FACE.SIDES });
      box(a - 0.06, y + 0.02, b - 0.06, a + 0.06, y + 0.8, b + 0.06, TS.METAL, { lightMul: 0.6 });
    }
  }
  if (!o.broken) {                                                   // bonnet hoops
    for (const a of [-L * 0.8, 0, L * 0.8]) {
      box(a - 0.04, bed + 0.5, -Wd, a + 0.04, bed + 1.5, -Wd + 0.06, TS.WOOD, { faces: FACE.SIDES });
      box(a - 0.04, bed + 0.5, Wd - 0.06, a + 0.04, bed + 1.5, Wd, TS.WOOD, { faces: FACE.SIDES });
      box(a - 0.04, bed + 1.44, -Wd, a + 0.04, bed + 1.52, Wd, TS.WOOD);
    }
    box(-L * 0.8, bed + 1.44, -0.04, L * 0.8, bed + 1.52, 0.04, TS.WOOD);
  }
  box(L, y + 0.4, -0.05, L + 1.1, y + 0.5, 0.05, TS.WOOD);           // shaft
  box(-0.7, bed + 0.1, -0.4, -0.05, bed + 0.75, 0.25, rng.chance(0.5) ? TS.CRATE : TS.CRATE2, { uv: 'fit' });
  box(0.1, bed + 0.1, -0.15, 0.6, bed + 0.55, 0.4, TS.CRATE, { uv: 'fit' });
  if (alongX) deco.collider(x - L, y, z - Wd - 0.15, x + L, bed + 1.5, z + Wd + 0.15);
  else deco.collider(x - Wd - 0.15, y, z - L, x + Wd + 0.15, bed + 1.5, z + L);
}
