// Canyons: canyon, canyon of bridges. Layout engine: natlayout.js.
//
// A winding chain of wide canyon basins open to the sky (sand floor, tall
// layered rock cliffs on both sides) from the start camp to the boss basin,
// with side canyons branching off. Basins are joined by canyon throats; in
// the Canyon of Bridges most throats are plank bridges over a bottomless
// gorge. Every basin climbs or drops to the next one with carved rock
// stairs (hand rails on open sides). Basins get landforms: cliff ledges and
// buttes reached by stairs (railed with wooden fences), dry river gorges
// and bottomless chasms crossed by railed plank bridges, spike pits, oasis
// pools, plus hoodoos (ROCK), cacti (FOLIAGE), dead trees (WOOD), boulders,
// mine adits (BEAM supports, track, ore carts), wooden trading posts (WOOD
// walls, ROOF, GLASS windows), wagon camps (WOOD wagons, CRATE cargo) and
// lanterns / campfires (LIGHT). Gate walls (palisades) across throats are
// the keyed-door chokepoints; the boss basin is a leaf with one entrance.
import { TS, F, DIR_X, DIR_Z, clamp } from './common.js';
import { FACE } from './deco.js';
import { buildNatural } from './natlayout.js';
import {
  neighbors4, boulder, cactus, deadTree, hoodoo, campfire, signpost, lanternPost, brazier, rockSpike, adit, cabin, palmTree, wagon,
} from './natural.js';

export function genCanyon(rng, theme, depth) {
  return buildNatural(rng, theme, depth, canyonSkin(theme, depth));
}

function canyonSkin(theme, depth) {
  const bridges = !!theme.params?.chasms || (theme.id || '').includes('bridge');
  let chainN = 8;
  return {
    style: () => ({
      ceilT: TS.CEIL, cliffTex: TS.ROCK, spikeTex: TS.ROCK, gateTex: TS.WOOD, frameTex: TS.BEAM, gateCap: TS.WOOD, gateH: 3.6,
      sky: 1, torch: [1, 0.7, 0.4],
    }),
    size: (rng) => ({ W: Math.round(clamp(104 + depth * 0.8, 104, 128)), H: Math.round(clamp(70 + depth * 0.4, 70, 82)) }),
    wallTop: 24,
    capTex: TS.GROUND,
    rockTex: (X, x, z) => (X.nz(x, z, 7, 5, 3) > 0.55 ? TS.WALL2 : TS.WALL),
    wobble: (c) => (c.role === 'boss' ? 0.22 : 0.34),
    tunnelWidths: bridges ? [3, 3, 4] : [4, 5, 5, 6],
    tunnelSky: true,
    chamberSky: () => true,
    rough: !bridges,
    loops: 0.25,
    place: (X) => {
      const { rng, W, H, ch } = X;
      // a winding chain of basins (retry with a shorter chain when it boxes itself in)
      for (let attempt = 0; ; attempt++) {
        chainN = Math.max(4, rng.int(6, 8) + (depth > 12 ? 1 : 0) - (attempt >> 2));
        const sz = rng.int(12, H - 13);
        try {
          X.chain({
            n: chainN, sz, tx: W - 12, tz: sz < H / 2 ? H - 14 : 14, meander: 1.0, pull: 0.9,
            radii: [[6, 2], [7, 3], [8, 2.5], [9, 1]], rBoss: rng.int(9, 11), gap0: 3.6, gap1: 5.5,
          });
          break;
        } catch (e) {
          ch.length = 0;
          if (attempt > 14) throw e;
        }
      }
      X.pack(chainN + 1 + rng.int(2, 4), [[5, 1], [6, 2], [7, 1.5]], { gap: 3.5 });
    },
    pairCost: (X, a, b, d) => (a.chain >= 0 && b.chain >= 0 ? (Math.abs(a.chain - b.chain) === 1 ? d * 0.3 : d * 3) : d),
    // (bottomless gorges only in the Canyon of Bridges, whose abyss has no far plane)
    tunnelKind: (X, t) => (bridges && X.rng.chance(t.A.chain >= 0 && t.B.chain >= 0 ? 0.85 : 0.5) ? 'bridge' : 'tunnel'),
    gorgeWidth: bridges ? 4 : 3,
    dh: [0, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, 3.6],
    hRange: [-3, 10.2],
    targetH: (X, C, P) => (C.chain >= 0 ? (C.chain / chainN) * (bridges ? 7.2 : 6) + X.rng.float(-1.2, 1.2) : P.h + X.rng.pick([0, 1.8, 2.4, -1.8])),
    majorW: () => (bridges
      ? { ledge: 2, mesa: 1.6, bowl: 0.5, lake: 0.5, chasm: 4, spikes: 0.6, settle: 0.8 }
      : { ledge: 3, mesa: 2, bowl: 0.8, lake: 1.4, chasm: 1.8, spikes: 1, settle: 1.8 }),
    chasmKinds: () => (bridges ? ['void', 'void', 'void', 'spikes'] : ['spikes', 'water', 'spikes']),
    second: ['ledge', 'mesa', 'spikes'],
    minor: ['grove', 'grove', 'pillars', 'camp'],
    extra: [['adit', 0.3], ['camp', 0.2]],
    ledgeUp: [2.4, 3.0, 3.6, 4.2],
    features: (X, L) => ({
      adit: (c) => adit(X, L, c),
      outpost: (c) => cabin(X, L, c, { wallTex: TS.WOOD, chimneyTex: TS.ROCK }),
      // a trading post or mine adit as the basin's main feature, props around it
      settle: (c) => {
        for (const f of X.rng.shuffle(['outpost', 'adit', 'outpost'])) {
          if (!X.tryFeature(c, f)) continue;
          X.tryFeature(c, 'camp');
          X.tryFeature(c, 'grove');
          return true;
        }
        return false;
      },
      // wagon camp: a wagon, a campfire and supplies
      camp: (c) => {
        const { g, deco, rng, W } = X;
        const ok = (i) => deco.cellInterior(i % W, (i / W) | 0) && !L.nearBad(c, i) && !L.onSpine(c, i);
        for (const i of rng.shuffle(c.cells.slice())) {
          const x = i % W, z = (i / W) | 0, ax = rng.chance(0.5);
          const foot = ax ? [i - 1, i, i + 1, i + 2] : [i - W, i, i + W, i + 2 * W];
          if (!foot.every((j) => c.cellSet.has(j) && ok(j))) continue;
          wagon(deco, ax ? x + 1 : x + 0.5, ax ? z + 0.5 : z + 1, g.floor[i], ax);
          const near = c.cells.filter((j) => ok(j) && !foot.includes(j) && Math.abs((j % W) - x) <= 3 && Math.abs(((j / W) | 0) - z) <= 3 && Math.abs((j % W) - x) + Math.abs(((j / W) | 0) - z) >= 3);
          rng.shuffle(near);
          if (near.length) { const j = near.pop(); campfire(deco, (j % W) + 0.5, ((j / W) | 0) + 0.5, g.floor[j]); }
          const k = near.find((j) => deco.cellFree(j % W, (j / W) | 0));
          if (k !== undefined) deco.crateStack((k % W) + 0.5, ((k / W) | 0) + 0.5, g.floor[k], { count: rng.int(1, 3) });
          return true;
        }
        return false;
      },
    }),
    // layered cliffs: taller further from the canyon floor
    surround: (X) => {
      const { g, N, nz, hNear, dNear, W } = X;
      for (let i = 0; i < N; i++) {
        if (g.type[i] || X.tmask[i] >= 0 || X.owner[i] >= 0) continue;     // (gate walls keep their height)
        const x = i % W, z = (i / W) | 0;
        const d = Math.max(1, dNear[i]);
        g.floor[i] = hNear[i] + Math.min(26, 7 + d * 1.6 + nz(x, z, 4, 61, 3) * 7);
      }
    },
    prop: (X, L, c, i, small, big) => {
      const { g, deco, rng, W } = X;
      const x = (i % W) + 0.5 + rng.float(-0.15, 0.15), z = ((i / W) | 0) + 0.5 + rng.float(-0.15, 0.15), y = g.floor[i];
      const r = rng.next();
      if (big && r < 0.3) hoodoo(deco, x, z, y, rng.float(3, 5.5));
      else if (r < 0.55) cactus(deco, x, z, y, rng.float(0.9, 1.3));
      else if (r < 0.7) deadTree(deco, x, z, y, rng.float(0.8, 1.2));
      else if (r < 0.9 || small) boulder(deco, x, z, y, rng.float(0.7, 1.5));
      else lanternPost(deco, x, z, y, [1, 0.75, 0.4], { flicker: true });
    },
    pillar: (X, L, c, i) => {
      const { g, deco, rng, W } = X;
      hoodoo(deco, (i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], rng.float(3.5, 7));
    },
    centrepiece: (X, L, c, T, island) => {
      const { g, deco, rng, W } = X;
      const cells = [...T].filter((i) => deco.cellInterior(i % W, (i / W) | 0));
      if (!cells.length) return;
      const dc = (a) => Math.hypot((a % W) + 0.5 - c.cx, ((a / W) | 0) + 0.5 - c.cz);
      cells.sort((a, b) => dc(a) - dc(b));
      const i = cells[0], x = (i % W) + 0.5, z = ((i / W) | 0) + 0.5, y = g.floor[i];
      if (island || rng.chance(0.4)) hoodoo(deco, x, z, y, rng.float(4, 6.5));
      else {
        campfire(deco, x, z, y);
        const j = cells.find((k) => dc(k) > 2.2 && dc(k) < 3.5 && deco.cellFree(k % W, (k / W) | 0));
        if (j !== undefined) deco.crateStack((j % W) + 0.5, ((j / W) | 0) + 0.5, g.floor[j], { count: rng.int(1, 3) });
      }
    },
    dressLake: (X, L, c) => {
      // oasis: palms and reeds around fresh water
      if (c.lake.kind !== 'water') return;
      const { g, deco, rng, W } = X;
      let n = 0;
      for (const i of c.cells) {
        if (n >= 4 || c.lake.area.has(i) || !rng.chance(0.2)) continue;
        if (!neighbors4(g, i).some((j) => c.lake.area.has(j)) || !deco.cellInterior(i % W, (i / W) | 0)) continue;
        palmTree(deco, (i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], rng.float(0.8, 1.1));
        n++;
      }
    },
    dressStart: (X, L, c) => {
      const { g, deco, rng, W, S } = X;
      const free = c.cells.filter((i) => deco.cellInterior(i % W, (i / W) | 0) && Math.hypot((i % W) + 0.5 - c.cx, ((i / W) | 0) + 0.5 - c.cz) > 2.4 && !L.nearBad(c, i));
      rng.shuffle(free);
      const take = () => { while (free.length) { const i = free.pop(); if (deco.cellInterior(i % W, (i / W) | 0)) return i; } return -1; };
      let i = take();
      if (i >= 0) campfire(deco, (i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i]);
      i = take();
      if (i >= 0) wagon(deco, (i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], rng.chance(0.5));
      for (let k = 0; k < 2; k++) { i = take(); if (i >= 0) deco.crateStack((i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], { count: rng.int(1, 3) }); }
      i = take();
      if (i >= 0) lanternPost(deco, (i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], S.torch, { flicker: true });
      i = take();
      if (i >= 0) signpost(deco, (i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], rng.int(0, 3));
    },
    dressBoss: (X, L, c) => {
      const { g, deco, rng, W, idx, S } = X;
      const nCol = 6;
      for (let k = 0; k < nCol; k++) {
        const a = (k / nCol) * Math.PI * 2 + rng.float(-0.2, 0.2);
        const x = Math.floor(c.cx + Math.cos(a) * c.r * 0.55 * c.ex), z = Math.floor(c.cz + Math.sin(a) * c.r * 0.55 * c.ez);
        const i = idx(x, z);
        if (!c.cellSet.has(i) || !L.markFree(c, i) || L.nearBad(c, i)) continue;
        hoodoo(deco, x + 0.5, z + 0.5, c.h, rng.float(4.5, 7.5));
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const x = Math.floor(c.cx + Math.cos(a) * c.r * 0.8), z = Math.floor(c.cz + Math.sin(a) * c.r * 0.8);
        const i = idx(x, z);
        if (c.cellSet.has(i) && L.markFree(c, i) && !L.nearBad(c, i) && deco.cellFree(x, z)) brazier(deco, x + 0.5, z + 0.5, c.h, S.torch, { tex: TS.METAL });
      }
      for (const i of c.cells) {
        const d = Math.hypot((i % W) + 0.5 - c.cx, ((i / W) | 0) + 0.5 - c.cz);
        if (d < 3.5 && g.type[i] && !(g.flags[i] & (F.HAZARD | F.PIT | F.STAIR | F.BRIDGE))) g.floorTex[i] = TS.FLOOR3;
      }
    },
    dressTunnel: (X, L, t) => {
      // lanterns at the bridgeheads / throat mouths, boulders along throat sides
      const { g, deco, rng, idx, S } = X;
      for (const k of [t.k0, t.k1]) {
        if (k < 0 || k >= t.pts.length || rng.chance(0.4)) continue;
        const [px, pz] = t.pts[k];
        const ax = t.dir[Math.min(k, t.dir.length - 1)] < 2;
        for (const side of [-1, 1]) {
          const o = side < 0 ? -t.a : t.b;
          const x = ax ? px : px + o, z = ax ? pz + o : pz;
          const i = idx(x, z);
          if (!g.type[i] || (g.flags[i] & (F.STAIR | F.BRIDGE | F.DOOR | F.VOID | F.PIT)) || g.edge[i]) continue;
          const lx = x + 0.5 + (ax ? 0 : side * 0.3), lz = z + 0.5 + (ax ? side * 0.3 : 0);
          lanternPost(deco, lx, lz, g.floor[i], S.torch, { flicker: true, armX: ax ? 0 : -side * 0.35, armZ: ax ? -side * 0.35 : 0 });
        }
      }
      if (t.kind !== 'tunnel') return;
      for (let k = t.k0 + 1; k < t.k1; k++) {
        if (!rng.chance(0.18) || (t.fn && k >= t.fs - 1 && k <= t.fs + t.fn) || (t.gk >= 0 && Math.abs(k - t.gk) <= 1)) continue;
        const [px, pz] = t.pts[k];
        const ax = t.dir[Math.min(k, t.dir.length - 1)] < 2;
        const side = rng.sign(), o = side < 0 ? -t.a : t.b;
        const x = ax ? px : px + o, z = ax ? pz + o : pz;
        const i = idx(x, z);
        if (!g.type[i] || (g.flags[i] & (F.STAIR | F.BRIDGE | F.DOOR | F.VOID | F.PIT | F.OBSTACLE)) || g.edge[i] || t.tw < 4) continue;
        boulder(deco, x + 0.5 + (ax ? 0 : side * 0.15), z + 0.5 + (ax ? side * 0.15 : 0), g.floor[i], rng.float(0.6, 0.9));
      }
    },
    dressChamber: (X, L, c) => {
      // scrub and rocks along the cliff feet, rock spires
      const { g, deco, rng, W } = X;
      if (c.role === 'start') return;
      for (const i of c.cells) {
        const x = i % W, z = (i / W) | 0;
        if (!deco.cellFree(x, z) || L.nearBad(c, i) || L.onSpine(c, i)) continue;
        const wall = neighbors4(g, i).some((j) => !g.type[j]);
        if (!rng.chance(wall ? 0.07 : 0.012)) continue;
        if (!deco.cellFree(x, z)) continue;
        const r = rng.next();
        if (wall && r < 0.4) rockSpike(deco, x + 0.5, z + 0.5, g.floor[i], rng.float(1.2, 3), rng.float(0.35, 0.6), TS.ROCK, { solid: true });
        else if (r < 0.7) boulder(deco, x + 0.5, z + 0.5, g.floor[i], rng.float(0.5, 1.1));
        else cactus(deco, x + 0.5, z + 0.5, g.floor[i], rng.float(0.7, 1.1));
      }
    },
  };
}
