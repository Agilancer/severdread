// Natural cavern systems: hell, volcano, caves, glacier caves, crystal
// caverns, asteroid mines. Layout engine: natlayout.js.
//
// Big irregular caverns (domes 7-14 high, some open to the sky) joined by
// wide 3-5 cell tunnels. Every cavern sits at its own height; climbing
// tunnels get real carved stair flights with hand rails. Gate walls with one
// doorway are the chokepoints for keyed doors; the boss cavern is a leaf
// with a single entrance. Caverns get a landform (railed ledges, plateaus,
// sunken bowls, lava / poison / water lakes with islands and bridges,
// chasms crossed by bridges, spike pits) plus a dressing layer: rock
// columns and stalagmites (ROCK), crystal clusters (ACCENT, emissive), ice
// spires, basalt, bones and stakes (hell), timber mine supports (BEAM), mine
// track (METAL rails on WOOD sleepers) and ore carts, drill rigs (MACHINE),
// braziers / torches (LIGHT).
import { TS, F, DIR_X, DIR_Z, clamp } from './common.js';
import { FACE } from './deco.js';
import { buildNatural } from './natlayout.js';
import {
  neighbors4, rockSpike, rockColumn, boulder, crystalCluster, basalt, mineSupport, mineTrack, mineCart, brazier, lanternPost,
  ribArch, bonePile, stake, campfire, sinkPit,
} from './natural.js';

export function genCaves(rng, theme, depth) {
  return buildNatural(rng, theme, depth, caveSkin(theme));
}

function caveSkin(theme) {
  const id = theme.id || '';
  const fam = id === 'hell' ? 'hell' : id === 'volcano' ? 'volcano' : id === 'glacier_caves' ? 'ice' : id === 'crystal_caverns' ? 'crystal' : id === 'asteroid_mines' ? 'mine' : 'cave';
  const spikeTex = fam === 'ice' || fam === 'crystal' ? TS.ACCENT : TS.ROCK;
  return {
    style: () => ({
      // cave roofs are rock (the generic ceiling role may be a built ceiling)
      ceilT: fam === 'cave' || fam === 'volcano' ? TS.ROCK : TS.CEIL,
      spikeTex,
      gateCeil: fam === 'mine' ? TS.METAL : TS.WOOD,
    }),
    size: (rng, depth) => {
      const W = Math.round(clamp(76 + depth * 0.9, 76, 106));
      return { W, H: Math.round(W * rng.float(0.72, 0.84)) };
    },
    wallTop: 18,
    rockTex: (X, x, z) => (X.nz(x, z, 9, 5, 3) > 0.58 ? (fam === 'cave' || fam === 'ice' || fam === 'crystal' ? TS.WALL2 : TS.ROCK) : TS.WALL),
    majorW: () => ({
      ledge: 2.2, mesa: 1.6, bowl: 1.4, lake: fam === 'hell' || fam === 'volcano' ? 3 : 2.4, chasm: fam === 'hell' || fam === 'volcano' ? 2.2 : 1.8, spikes: 0.8,
    }),
    minor: fam === 'crystal' || fam === 'ice' || fam === 'mine' ? ['grove', 'grove', 'pillars', 'spikes'] : ['pillars', 'grove', 'spikes'],
    // rock everywhere; tall rims around caverns open to the sky
    surround: (X) => {
      const { g, ch, W, nz } = X;
      for (let i = 0; i < X.N; i++) if (!g.type[i]) g.floor[i] = 18;
      for (const c of ch) {
        if (!c.alive || !c.sky) continue;
        for (const i of c.cells) {
          const x = i % W, z = (i / W) | 0;
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
            if (!g.in(x + dx, z + dz)) continue;
            const j = X.idx(x + dx, z + dz);
            const top = c.h + 10 + nz(x + dx, z + dz, 3, 61) * 9;
            if (!g.type[j]) g.floor[j] = Math.max(g.floor[j], top);
            else if (!g.sky[j]) g.roof[j] = Math.max(g.roof[j], top);
          }
        }
      }
    },
    prop: (X, L, c, i, small, big) => propAt(X, c, i, small, big),
    centrepiece: (X, L, c, T, island) => centrepiece(X, c, T, island),
    afterGrove: (X, L, c) => { if (fam === 'volcano' || fam === 'hell') lavaStreams(X, L, c); },
    dressStart,
    dressBoss,
    dressTunnel,
    dressChamber,
  };

  // themed prop on cell i of chamber c (big = grove centrepiece)
  function propAt(X, c, i, small = false, big = false) {
    const { g, deco, rng, S, W } = X;
    const x = (i % W) + 0.5, z = ((i / W) | 0) + 0.5, y = g.floor[i];
    const room = g.sky[i] ? 9 : g.ceil[i] - y;
    switch (fam) {
      case 'crystal':
        if (big && room > 6 && rng.chance(0.3)) { deco.box(x - 0.35, y, z - 0.35, x + 0.35, g.sky[i] ? y + 7 : g.ceil[i], z + 0.35, TS.ACCENT, { emissive: 0.55, solid: true, s: 2 }); deco.light(x, y + 2.5, z, S.glow, 6); }
        else crystalCluster(deco, x, z, y, (big ? rng.float(1.6, 3.2) : rng.float(0.8, 1.5)), TS.ACCENT, rng.chance(0.3) ? [0.4, 0.8, 1] : S.glow, { light: big || rng.chance(0.4) });
        break;
      case 'ice':
        if (rng.chance(0.25)) crystalCluster(deco, x, z, y, rng.float(1, 2), TS.ACCENT, S.glow, { emissive: 0.3, light: rng.chance(0.4), baseTex: TS.ACCENT });
        else rockSpike(deco, x, z, y, big ? rng.float(2.2, 4.5) : rng.float(1, 2), rng.float(0.35, 0.6), TS.ACCENT, { solid: true, segs: 5, emissive: 0.12 });
        break;
      case 'hell':
        if (rng.chance(0.35)) bonePile(deco, x, z, y);
        else if (rng.chance(0.4)) { stake(deco, x, z, y, rng.float(1.8, 2.6)); bonePile(deco, x + 0.2, z + 0.25, y); }
        else if (!small && rng.chance(0.5)) brazier(deco, x, z, y, S.torch, { radius: 6 });
        else rockSpike(deco, x, z, y, rng.float(1.2, 2.6), rng.float(0.3, 0.5), TS.ROCK, { solid: true });
        break;
      case 'volcano':
        if (rng.chance(0.6)) basalt(deco, x, z, y, { maxH: big ? 3.6 : 2.2 });
        else boulder(deco, x, z, y, rng.float(0.8, 1.4));
        break;
      case 'mine':
        if (rng.chance(0.3)) deco.crateStack(x, z, y, { count: rng.int(2, 4) });
        else if (rng.chance(0.3)) mineCart(deco, x, z, y, rng.chance(0.5));
        else if (rng.chance(0.4)) drillRig(X, x, z, y, room);
        else boulder(deco, x, z, y, rng.float(0.7, 1.2));
        break;
      default: // cave
        if (rng.chance(0.6)) rockSpike(deco, x, z, y, rng.float(1, big ? 3.2 : 2.2), rng.float(0.3, 0.6), TS.ROCK, { solid: true });
        else boulder(deco, x, z, y, rng.float(0.7, 1.3));
        break;
    }
  }
  function drillRig(X, x, z, y, room) {
    const { deco, rng } = X;
    const fd = rng.int(0, 3), front = ['px', 'nx', 'pz', 'nz'][fd];
    deco.box(x - 0.45, y, z - 0.45, x + 0.45, y + 1.5, z + 0.45, { side: TS.METAL, top: TS.METAL, [front]: TS.MACHINE }, { solid: true });
    deco.box(x - 0.12, y + 1.5, z - 0.12, x + 0.12, y + Math.min(room - 0.4, 3.6), z + 0.12, TS.BEAM, { faces: FACE.SIDES });
    deco.box(x - 0.2, y + 1.62, z - 0.2, x + 0.2, y + 1.8, z + 0.2, TS.LIGHT, { emissive: 1, uv: 'fit' });
    deco.light(x, y + 2, z, [1, 0.8, 0.4], 5);
  }
  // something worth walking to on a plateau / island
  function centrepiece(X, c, T, island = false) {
    const { g, deco, rng, S, W } = X;
    const cells = [...T].filter((i) => deco.cellFree(i % W, (i / W) | 0));
    if (!cells.length) return;
    const dc = (a) => Math.hypot((a % W) + 0.5 - c.cx, ((a / W) | 0) + 0.5 - c.cz);
    cells.sort((a, b) => dc(a) - dc(b));
    const i = cells[0], x = (i % W) + 0.5, z = ((i / W) | 0) + 0.5, y = g.floor[i];
    if (fam === 'crystal' || fam === 'ice') crystalCluster(deco, x, z, y, rng.float(2, 3), TS.ACCENT, S.glow, { emissive: fam === 'ice' ? 0.35 : 0.75 });
    else if (fam === 'mine') drillRig(X, x, z, y, g.sky[i] ? 9 : g.ceil[i] - y);
    else if (fam === 'hell' && rng.chance(0.5)) { stake(deco, x, z, y, 2.6); bonePile(deco, x + 0.3, z + 0.2, y); brazier(deco, x - 0.9, z, y, S.torch); }
    else if (fam === 'cave' && !island && rng.chance(0.5)) campfire(deco, x, z, y);
    else brazier(deco, x, z, y, S.torch, { tex: fam === 'hell' ? TS.ACCENT : TS.METAL });
    if (T.size > 12 && fam !== 'crystal') {
      for (const j of cells.slice(4, 30)) {
        if (!rng.chance(0.12) || !deco.cellFree(j % W, (j / W) | 0)) continue;
        if (fam === 'hell') bonePile(deco, (j % W) + 0.5, ((j / W) | 0) + 0.5, g.floor[j]);
        else deco.crateStack((j % W) + 0.5, ((j / W) | 0) + 0.5, g.floor[j], { count: rng.int(1, 3) });
        break;
      }
    }
  }
  // shallow lava runnels across a cavern floor (damaging, step over them)
  function lavaStreams(X, L, c) {
    const { g, deco, rng, S, idx } = X;
    if (!S.hazards.includes('lava')) return;
    let x = Math.floor(c.cx - c.r * 0.8), z = Math.floor(c.cz + rng.int(-2, 2));
    const cells = [];
    for (let k = 0; k < c.r * 1.8; k++) {
      const i = idx(x, z);
      if (c.cellSet.has(i) && L.markFree(c, i) && !L.nearBad(c, i) && !L.onSpine(c, i)) cells.push(i);
      x++;
      if (rng.chance(0.35)) z += rng.sign();
    }
    if (cells.length > 3) sinkPit(g, deco, cells, 'lava', 0.25, { base: c.h, lightEvery: 5 });
  }

  // explorer camp: campfire / lamps and supplies, the centre stays clear
  function dressStart(X, L, start) {
    const { g, deco, rng, S, W } = X;
    const free = start.cells.filter((i) => deco.cellInterior(i % W, (i / W) | 0) && Math.hypot((i % W) + 0.5 - start.cx, ((i / W) | 0) + 0.5 - start.cz) > 2.5 && !L.nearBad(start, i));
    rng.shuffle(free);
    if (free.length) {
      const i = free.pop(), x = (i % W) + 0.5, z = ((i / W) | 0) + 0.5;
      if (fam === 'mine') lanternPost(deco, x, z, g.floor[i], S.torch, { tex: TS.METAL, height: 2.6 });
      else if (fam === 'cave' || fam === 'crystal' || fam === 'ice') campfire(deco, x, z, g.floor[i]);
      else brazier(deco, x, z, g.floor[i], S.torch);
    }
    for (let k = 0; k < 3 && free.length; k++) { const i = free.pop(); if (deco.cellFree(i % W, (i / W) | 0)) deco.crateStack((i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], { count: rng.int(1, 3) }); }
  }
  // boss cavern: a ring of cover columns, hazard pools near the walls, braziers
  function dressBoss(X, L, c) {
    const { g, deco, rng, S, W, idx } = X;
    const cellsOK = (i) => L.markFree(c, i) && !L.nearBad(c, i);
    const nCol = c.r >= 10 ? 6 : 5;
    for (let k = 0; k < nCol; k++) {
      const a = (k / nCol) * Math.PI * 2 + rng.float(-0.2, 0.2);
      const x = Math.floor(c.cx + Math.cos(a) * c.r * 0.52 * c.ex), z = Math.floor(c.cz + Math.sin(a) * c.r * 0.52 * c.ez);
      const i = idx(x, z);
      if (!c.cellSet.has(i) || !cellsOK(i)) continue;
      if (g.sky[i]) rockSpike(deco, x + 0.5, z + 0.5, c.h, rng.float(4, 7), rng.float(0.8, 1.1), spikeTex, { solid: true, segs: 4 });
      else rockColumn(deco, x + 0.5, z + 0.5, c.h, g.ceil[i], rng.float(0.8, 1.1), spikeTex);
    }
    const kinds = L.hazKinds();
    const pk = kinds.length ? rng.pick(kinds) : 'water';
    let pools = 0;
    for (let k = 0; k < 20 && pools < 2; k++) {
      const a = rng.float(0, Math.PI * 2);
      const x0 = Math.floor(c.cx + Math.cos(a) * c.r * 0.72) - 1, z0 = Math.floor(c.cz + Math.sin(a) * c.r * 0.72) - 1;
      const cells = [];
      let ok = true;
      for (let z = z0; z < z0 + 3 && ok; z++) for (let x = x0; x < x0 + 3; x++) { const i = idx(x, z); if (!c.cellSet.has(i) || !cellsOK(i) || (g.flags[i] & F.OBSTACLE)) { ok = false; break; } cells.push(i); }
      if (!ok) continue;
      sinkPit(g, deco, cells, pk, 0.35, { base: c.h, lightEvery: 4 });
      pools++;
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.floor(c.cx + Math.cos(a) * c.r * 0.8), z = Math.floor(c.cz + Math.sin(a) * c.r * 0.8);
      const i = idx(x, z);
      if (c.cellSet.has(i) && cellsOK(i) && deco.cellFree(x, z)) brazier(deco, x + 0.5, z + 0.5, c.h, S.torch, { tex: fam === 'hell' ? TS.ACCENT : TS.METAL });
    }
    for (const i of c.cells) {
      const d = Math.hypot((i % W) + 0.5 - c.cx, ((i / W) | 0) + 0.5 - c.cz);
      if (d < 3.2 && g.type[i] && !(g.flags[i] & (F.HAZARD | F.PIT | F.STAIR))) g.floorTex[i] = TS.FLOOR3;
    }
  }
  // timber supports / rib arches, torches, pipes, mine track and carts
  function dressTunnel(X, L, t, crossCells) {
    const { g, deco, rng, S, idx } = X;
    let since = 2, torchSide = rng.sign(), runStart = -1;
    for (let k = t.k0; k <= t.k1; k++) {
      const flight = k >= t.fs - 1 && k <= t.fs + t.fn;
      const nearGate = t.gk >= 0 && Math.abs(k - t.gk) <= 1;
      const straight = k > 0 && k < t.pts.length - 1 && t.dir[k] === t.dir[k - 1];
      const [px, pz] = t.pts[k];
      const ax = t.dir[Math.min(k, t.dir.length - 1)] < 2;
      const i0 = idx(px, pz);
      if (!g.type[i0] || flight || nearGate || !straight) { since = 0; runStart = -1; continue; }
      const sA = ax ? idx(px, pz - t.a - 1) : idx(px - t.a - 1, pz);
      const sB = ax ? idx(px, pz + t.b + 1) : idx(px + t.b + 1, pz);
      const clean = !g.type[sA] && !g.type[sB];
      since++;
      if (runStart < 0) runStart = k;
      let top = Infinity;
      for (const [x, z] of crossCells(t, k)) { const i = idx(x, z); if (g.type[i]) top = Math.min(top, g.ceil[i]); }
      const y = g.floor[i0];
      if (clean && since >= 4 && top < 40) {
        since = 0;
        const b0 = (ax ? pz : px) - t.a, b1 = (ax ? pz : px) + t.b + 1;
        const a = (ax ? px : pz) + 0.5;
        if (fam === 'hell') ribArch(deco, ax, a, b0, b1, y, top);
        else if (fam !== 'volcano' || rng.chance(0.3)) mineSupport(deco, ax, a, b0, b1, y, top, fam === 'volcano' ? TS.METAL : TS.BEAM);
        if (fam === 'mine') deco.pipe(ax ? px : b0 + 0.2, ax ? b0 + 0.2 : pz, ax ? px + 1 : b0 + 0.2, ax ? b0 + 0.2 : pz + 1, y + 2.3, 0.2);
      }
      if (clean && k % 7 === 3) {
        torchSide = -torchSide;
        const [cx, cz] = torchSide < 0 ? (ax ? [px, pz - t.a] : [px - t.a, pz]) : (ax ? [px, pz + t.b] : [px + t.b, pz]);
        const d = ax ? (torchSide < 0 ? 3 : 2) : (torchSide < 0 ? 1 : 0);
        if (g.type[idx(cx, cz)]) deco.wallLight(cx, cz, d, y + 2.1, S.torch, { flicker: fam !== 'mine', radius: 6 });
      }
      if ((fam === 'mine' || (fam === 'cave' && t.id % 3 === 0)) && runStart >= 0 && k - runStart === 7 && g.type[i0]) {
        const [sx, sz] = t.pts[runStart];
        if (Math.abs(g.floor[idx(sx, sz)] - y) < 0.01) {
          if (ax) mineTrack(deco, Math.min(sx, px), pz + 0.5, Math.max(sx, px) + 1, pz + 0.5, y);
          else mineTrack(deco, px + 0.5, Math.min(sz, pz), px + 0.5, Math.max(sz, pz) + 1, y);
          if (rng.chance(0.5)) {
            const [qx, qz] = t.pts[runStart + 3];
            mineCart(deco, qx + 0.5, qz + 0.5, y + 0.12, ax);
          }
        }
        runStart = -1;
      }
    }
  }
  // stalactites under tall roofs, stalagmites / boulders, wall torches
  function dressChamber(X, L, c) {
    const { g, deco, rng, S, W, idx, resv } = X;
    if (!c.sky) {
      for (const i of c.cells) {
        if (!g.type[i] || g.ceil[i] - g.floor[i] < 5.5 || !rng.chance(0.07)) continue;
        const x = (i % W) + 0.5 + rng.float(-0.2, 0.2), z = ((i / W) | 0) + 0.5 + rng.float(-0.2, 0.2);
        const room = g.ceil[i] - Math.max(g.floor[i], c.h);
        const len = rng.float(0.8, Math.min(3.0, room - 2.8));
        if (len < 0.6) continue;
        rockSpike(deco, x, z, g.ceil[i], len, rng.float(0.2, 0.45), spikeTex, { down: true, segs: 3, emissive: fam === 'ice' || fam === 'crystal' ? 0.2 : 0 });
      }
    }
    if (c.role !== 'start') {
      for (const i of c.cells) {
        if (!rng.chance(c.role === 'boss' ? 0.015 : 0.03)) continue;
        const x = i % W, z = (i / W) | 0;
        if (!deco.cellInterior(x, z) || L.nearBad(c, i) || L.onSpine(c, i)) continue;
        if (rng.chance(0.6)) rockSpike(deco, x + 0.5, z + 0.5, g.floor[i], rng.float(0.7, 2.0), rng.float(0.25, 0.5), spikeTex, { solid: true, segs: 3 });
        else boulder(deco, x + 0.5, z + 0.5, g.floor[i], rng.float(0.6, 1.1));
      }
    }
    const edge = c.cells.filter((i) => {
      if (!g.type[i] || c.mouth.has(i) || resv[i] || (g.flags[i] & (F.PIT | F.HAZARD | F.STAIR | F.VOID | F.BRIDGE))) return false;
      return neighbors4(g, i).some((j) => !g.type[j]);
    });
    rng.shuffle(edge);
    const nT = fam === 'crystal' ? 1 : Math.max(2, Math.round(c.cells.length / 40));
    let placed = 0;
    for (const i of edge) {
      if (placed >= nT) break;
      const x = i % W, z = (i / W) | 0;
      const d = [0, 1, 2, 3].find((dd) => !g.type[idx(x + DIR_X[dd], z + DIR_Z[dd])]);
      if (d === undefined) continue;
      deco.wallLight(x, z, d, g.floor[i] + 2.2, S.torch, { flicker: fam !== 'mine', radius: 6.5 });
      placed++;
    }
  }
}
