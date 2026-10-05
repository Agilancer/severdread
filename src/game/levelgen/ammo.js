// Ammo caches (called from populate in levelgen/index.js, after the scatter
// pass so solid props are already in place): a few boxes and packs on
// reachable floor. Positions come from the level seed; the ammo TYPE of each
// is picked when the level loads (Game.stockAmmo) from the guns the player
// carries, so a cache is always worth walking to.
//
// Where: tucked-away spots (dead ends, side rooms off the start -> boss
// route), next to chests, and one box just before the boss arena; at most
// one pack inside the arena for the fight itself.
import { F } from '../grid.js';
import { AMMO_SPOTS } from '../../data/ammo.js';

const BAD = F.HAZARD | F.VOID | F.DOOR | F.PIT | F.STAIR | F.OBSTACLE | F.NOSPAWN | F.BRIDGE | F.WATER | F.SCROLL | F.START;

export function placeAmmo({ g, rng, startIdx, bossCell, arenaSet = new Set(), chests = [], keys = [], scatter = {}, props = [], jumpGap = 0 }) {
  const W = g.w, n = g.w * g.h;
  const opts = { jumpGap, avoid: F.OBSTACLE };
  const dist = g.bfs([startIdx], opts);
  if (bossCell < 0 || dist[bossCell] < 0) bossCell = -1;
  // the start -> boss route (near-shortest paths) and how far a cell is off it
  let side = null;
  if (bossCell >= 0) {
    const db = g.bfs([bossCell], { ...opts, reverse: true });
    const route = [];
    for (let i = 0; i < n; i++) if (dist[i] >= 0 && db[i] >= 0 && dist[i] + db[i] <= dist[bossCell] + 2) route.push(i);
    side = g.bfs(route, opts);
  }
  const taken = new Set([...chests.map((c) => c.cell), ...keys.map((k) => g.idx(Math.floor(k.x), Math.floor(k.z))), ...props.map((p) => p.cell)]);
  for (const list of Object.values(scatter)) {
    if (!Array.isArray(list)) continue;
    for (const o of list) { if (o.cell >= 0) taken.add(o.cell); for (const c of o.cells || []) taken.add(c); }
  }
  const openN = (i) => {
    const x = i % W, z = (i / W) | 0;
    let k = 0;
    for (const [nx, nz] of g.neighbors(x, z)) if (g.isOpen(nx, nz) && !(g.flags[g.idx(nx, nz)] & (F.OBSTACLE | F.VOID))) k++;
    return k;
  };
  const cand = [];
  let reach = 0;
  for (let i = 0; i < n; i++) {
    if (dist[i] >= 0) reach++;
    if (dist[i] < 4 || !g.type[i] || (g.flags[i] & BAD) || taken.has(i)) continue;
    if (g.ceil[i] - g.floor[i] < 1.4) continue;
    // tucked away: dead ends and wall nooks, side rooms off the main route
    const score = (4 - openN(i)) * 2 + Math.min(10, side ? Math.max(0, side[i]) : 0) * 0.5 + rng.next() * 3;
    cand.push({ i, score });
  }
  if (!cand.length) return [];
  cand.sort((a, b) => b.score - a.score);
  const out = [];
  const cd = (a, b) => Math.abs((a % W) - (b % W)) + Math.abs(((a / W) | 0) - ((b / W) | 0));
  const free = (i, gap) => !out.some((o) => cd(o.cell, i) < gap);
  const put = (i, big, boss) => out.push({ cell: i, x: (i % W) + 0.5, z: ((i / W) | 0) + 0.5, big, ...(boss ? { boss: true } : {}) });
  const size = Math.min(1.4, Math.max(0.7, reach / 1400));   // like the monster count
  const nBoxes = Math.max(1, Math.round(rng.int(AMMO_SPOTS.boxes[0], AMMO_SPOTS.boxes[1]) * size));
  const nPacks = Math.max(1, Math.round(rng.int(AMMO_SPOTS.packs[0], AMMO_SPOTS.packs[1]) * size));
  const outside = cand.filter((c) => !arenaSet.has(c.i));
  // a box just before the boss arena, close to the route
  if (bossCell >= 0) {
    const dB = dist[bossCell];
    const pre = outside.filter((c) => dist[c.i] < dB - 4 && dist[c.i] > dB - 30 && (!side || side[c.i] <= 6));
    if (pre.length) put(pre[0].i, true, true);
  }
  // boxes next to chests
  for (const ch of rng.shuffle([...chests])) {
    if (out.length >= Math.min(nBoxes, 3)) break;
    const near = outside.find((c) => cd(c.i, ch.cell) <= 3 && cd(c.i, ch.cell) >= 1 && free(c.i, 8));
    if (near) put(near.i, true);
  }
  // the rest: best tucked-away spots, spread out (spacing relaxes if the level is small)
  for (const gap of [12, 8, 4, 2]) {
    for (const c of outside) {
      if (out.filter((o) => o.big).length >= nBoxes) break;
      if (free(c.i, gap)) put(c.i, true);
    }
    if (out.filter((o) => o.big).length >= nBoxes) break;
  }
  let arenaPack = false;
  for (const gap of [8, 5, 3, 1]) {
    for (const c of cand) {
      if (out.filter((o) => !o.big).length >= nPacks) break;
      const inArena = arenaSet.has(c.i);
      if (inArena && arenaPack) continue;
      if (free(c.i, gap)) { put(c.i, false); if (inArena) arenaPack = true; }
    }
    if (out.filter((o) => !o.big).length >= nPacks) break;
  }
  return out;
}
