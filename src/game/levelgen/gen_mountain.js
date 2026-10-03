// Outdoor natural levels: mountain top, mountain climb, cyber mountain,
// desert, toxic swamp. Layout engine: natlayout.js (like gen_caves.js).
//
// A graph of big open-air areas (terraces, plateaus, dune hollows, swamp
// islands) joined by wide trails. Every area sits at its own height and
// trails climb with real stair flights (railed). Per family:
//  - mountain top: terraces rising toward the summit (the boss plateau),
//    floating over a sea of clouds; cliff edges are fenced (wood rails),
//    crags (ROCK) rise around them, rope bridges cross gaps; pines and
//    dead trees (WOOD / FOLIAGE), cairns and standing stones (ROCK), log
//    cabins (WOOD walls, ROOF, GLASS windows), shrine poles and lanterns.
//  - mountain climb: a long switchback chain of terraces climbing ~15 units
//    under tall cliffs, mine adits (BEAM supports, METAL track, carts).
//  - cyber mountain: the same terraces built of neon / circuit rock over the
//    digital void, glowing neon rails, grate bridges, neon pylons (METAL +
//    LIGHT), data monoliths (SCREEN), crystals (ACCENT), relay huts (METAL).
//  - desert: dune hollows between sand dunes (GROUND / FLOOR) and tall mesas
//    (ROCK), sunken bowls, mesas reached by stairs, oasis pools with palms,
//    sandstone ruins (PANEL walls, TRIM caps, PILLAR columns), cacti,
//    hoodoos, wagons, adobe huts.
//  - toxic swamp: islands among hedge banks (WALL / FOLIAGE tops) joined by
//    boardwalks over poison marsh, deep poison bogs with plank bridges,
//    stilt huts in the bog, swamp trees, dead trees, reeds and stumps.
// Gate walls (palisades / sandstone / metal) across trails are the keyed-door
// chokepoints; the boss area is a big plateau with a single entrance.
import { TS, F, DIR_X, DIR_Z, SKY_H, clamp } from './common.js';
import { FACE } from './deco.js';
import { buildNatural } from './natlayout.js';
import {
  neighbors4, step, boulder, cactus, deadTree, pineTree, palmTree, hoodoo, campfire, signpost, lanternPost, brazier, rockSpike,
  crystalCluster, cabin, adit, wagon, sinkPit,
} from './natural.js';
import { neonPylon, monolith, brokenColumn, reeds, stump, cairn, menhir, swampTree, prayerPole } from './natprops.js';

export function genMountain(rng, theme, depth) {
  return buildNatural(rng, theme, depth, mountainSkin(theme, depth));
}

function famOf(theme) {
  const id = theme.id || '', p = theme.params || {};
  if (id === 'cyber_mountain' || p.neon) return 'cyber';
  if (id === 'desert' || p.dunes) return 'desert';
  if (id === 'toxic_swamp' || p.swamp) return 'swamp';
  if (id === 'mountain_climb' || p.climb) return 'climb';
  return 'top';
}

function mountainSkin(theme, depth) {
  const fam = famOf(theme);
  const alpine = fam === 'top' || fam === 'climb';
  const cloudy = alpine || fam === 'cyber';      // cliff edges drop into the void (clouds / digital)
  const cyan = [0.3, 0.9, 1];
  let chainN = 7;
  const FAM = {
    top: {
      size: [96, 118, 0.72], radii: [[6, 2], [7, 3], [8, 3], [9, 2], [10, 1]], tw: [4, 4, 5, 5, 6], bridge: 0.3,
      dh: [0, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, 3.6], hRange: [-2.4, 12.6],
      majorW: { ledge: 2.6, mesa: 2, bowl: 0.8, lake: 0.9, chasm: 1.6, spikes: 0.6, settle: 1.4 },
      chasm: ['void', 'void', 'spikes'], minor: ['site', 'site', 'grove', 'pillars'], extra: [],
      ledgeUp: [2.4, 3.0, 3.6, 4.2],
    },
    climb: {
      size: [116, 132, 0.62], radii: [[6, 2], [7, 3], [8, 2]], tw: [4, 4, 5, 5], bridge: 0.2,
      dh: [0, 1.2, 1.8, 2.4, 3.0, 3.6, -1.2, -1.8], hRange: [-1.2, 18.6],
      majorW: { ledge: 3, mesa: 1.6, bowl: 0.5, lake: 0.6, chasm: 1.8, spikes: 0.6, settle: 1.2 },
      chasm: ['void', 'void', 'spikes'], minor: ['site', 'site', 'grove', 'pillars'], extra: [['adit', 0.25]],
      ledgeUp: [2.4, 3.0, 3.6, 4.2],
    },
    cyber: {
      size: [96, 116, 0.72], radii: [[6, 2], [7, 3], [8, 3], [9, 2], [10, 1]], tw: [4, 5, 5], bridge: 0.4,
      dh: [0, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, 3.6], hRange: [-2.4, 12.6],
      majorW: { ledge: 2, mesa: 2, bowl: 1, lake: 1.6, chasm: 2, spikes: 0.8, settle: 1.4 },
      chasm: ['void', 'void', 'poison'], minor: ['site', 'site', 'grove', 'pillars'], extra: [['pillars', 0.4]],
      ledgeUp: [1.8, 2.4, 3.0, 3.6],
    },
    desert: {
      size: [100, 120, 0.74], radii: [[6, 2], [7, 3], [8, 3], [9, 2], [10, 1]], tw: [4, 5, 5, 6], bridge: 0,
      dh: [0, 0, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4], hRange: [-3, 4.8],
      majorW: { ledge: 1.4, mesa: 2.4, bowl: 1.6, lake: 1.8, chasm: 0.6, spikes: 1.2, settle: 2.4 },
      chasm: ['spikes'], minor: ['site', 'site', 'grove', 'pillars'], extra: [['spikes', 0.3]],
      ledgeUp: [1.8, 2.4, 3.0], mesaUp: [1.8, 2.4, 3.0, 3.6],
    },
    swamp: {
      size: [96, 116, 0.75], radii: [[5, 1], [6, 3], [7, 3], [8, 2], [9, 1]], tw: [3, 4, 4, 5], bridge: 0.7,
      dh: [0, 0, 0, 1.2, -1.2, 1.8, -1.8], hRange: [-1.8, 3.6],
      majorW: { ledge: 0.6, mesa: 1.0, bowl: 0.8, lake: 4, chasm: 0.8, spikes: 0.6, settle: 2 },
      chasm: ['poison', 'poison', 'spikes'], minor: ['site', 'site', 'grove', 'pillars'], extra: [],
      ledgeUp: [1.2, 1.8, 2.4], mesaUp: [1.2, 1.8],
    },
  }[fam];

  const skin = {
    style: () => ({
      ceilT: TS.CEIL, cliffTex: TS.ROCK, spikeTex: fam === 'cyber' ? TS.ACCENT : TS.ROCK, sky: 1,
      gateTex: fam === 'cyber' ? TS.METAL : fam === 'desert' ? TS.PANEL : TS.WOOD,
      frameTex: fam === 'cyber' ? TS.METAL : TS.BEAM,
      gateCap: fam === 'cyber' ? TS.METAL : fam === 'desert' ? TS.TRIM : TS.WOOD,
      gateCeil: fam === 'cyber' ? TS.METAL : TS.WOOD,
      gateH: 3.6,
      marsh: 'poison',
    }),
    size: (rng) => {
      const [a, b, k] = FAM.size;
      const W = Math.round(clamp(a + depth * 0.8, a, b));
      return { W, H: Math.round(W * k * rng.float(0.95, 1.05)) };
    },
    wallTop: 20,
    capTex: fam === 'top' ? TS.FLOOR : fam === 'climb' ? TS.FLOOR2 : fam === 'cyber' ? TS.FLOOR2 : fam === 'swamp' ? TS.FOLIAGE : TS.ROCK,
    rockTex: (X, x, z) => (X.nz(x, z, 7, 5, 3) > 0.56 ? TS.WALL2 : TS.WALL),
    wobble: (c) => (c.role === 'boss' ? 0.2 : 0.32),
    tunnelWidths: FAM.tw,
    tunnelSky: true,
    chamberSky: () => true,
    trailTex: TS.FLOOR2,
    loops: fam === 'climb' ? 0.2 : 0.35,
    pairRange: fam === 'swamp' ? 34 : 30,
    tunnelKind: (X, t) => {
      if (!FAM.bridge || !X.rng.chance(FAM.bridge)) return 'tunnel';
      return fam === 'swamp' ? 'boardwalk' : 'bridge';
    },
    gorgeWidth: fam === 'swamp' ? 4 : 3,
    marshDepth: 2.2,
    dh: FAM.dh,
    hRange: FAM.hRange,
    majorW: () => FAM.majorW,
    chasmKinds: () => FAM.chasm,
    second: fam === 'swamp' ? ['lake', 'spikes', 'mesa'] : ['ledge', 'mesa', 'spikes'],
    minor: FAM.minor,
    extra: FAM.extra,
    ledgeUp: FAM.ledgeUp,
    mesaUp: FAM.mesaUp,
    groveDensity: fam === 'swamp' ? 22 : alpine ? 24 : 30,
    voidY: -30,
  };

  // ------------------------------------------------------------ placement
  if (fam === 'climb') {
    skin.place = (X) => {
      const { rng, W, H, ch } = X;
      for (let attempt = 0; ; attempt++) {
        chainN = Math.max(4, rng.int(5, 7) - (attempt >> 2));
        const sz = rng.int(12, H - 13);
        try {
          X.chain({
            n: chainN, sz, tx: W - 12, tz: sz < H / 2 ? H - 14 : 14, meander: 1.0, pull: 0.9,
            radii: FAM.radii, rBoss: rng.int(9, 10), gap0: 5, gap1: 8,
          });
          break;
        } catch (e) {
          ch.length = 0;
          if (attempt > 14) throw e;
        }
      }
      X.pack(chainN + 1 + rng.int(2, 3), [[5, 1], [6, 2], [7, 1.5]], { gap: 3.5 });
    };
    skin.pairCost = (X, a, b, d) => (a.chain >= 0 && b.chain >= 0 ? (Math.abs(a.chain - b.chain) === 1 ? d * 0.3 : d * 3) : d);
    skin.targetH = (X, C, P) => (C.chain >= 0 ? (C.chain / chainN) * 15 + X.rng.float(-1, 1) : P.h + X.rng.pick([0, 1.8, 2.4, -1.8]));
  } else {
    skin.place = (X) => {
      const { rng, W, H } = X;
      const rS = rng.int(6, 7);
      X.addChamber(rS + 3, rng.int(rS + 4, H - rS - 5), rS, 'start');
      const rB = Math.min(rng.int(10, 12), Math.floor(H / 2) - 5);
      X.addChamber(W - rB - 4, rng.int(rB + 4, H - rB - 5), rB, 'boss');
      X.pack(clamp(Math.round(X.N / (fam === 'swamp' ? 440 : 420)), 8, 15), FAM.radii, { gap: fam === 'swamp' ? 5 : 3.5 });
    };
    if (fam === 'top' || fam === 'cyber') {
      // terraces rise toward the summit (the boss plateau)
      skin.targetH = (X, C, P) => {
        if (C.role === 'boss') return P.h + 3.6;
        const B = X.ch[1], S0 = X.ch[0];
        const t = clamp(1 - Math.hypot(C.cx - B.cx, C.cz - B.cz) / Math.max(1, Math.hypot(S0.cx - B.cx, S0.cz - B.cz)), 0, 1);
        return t * 8.4 + X.rng.float(-1.2, 1.2);
      };
    }
  }

  // ------------------------------------------------------------ surroundings
  skin.surround = (X) => {
    const { g, N, nz, hNear, dNear, W, H, idx, tunnels, lightAt } = X;
    const prot = new Uint8Array(N);
    const protect = (i, r) => {
      const x = i % W, z = (i / W) | 0;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.in(x + dx, z + dz)) prot[idx(x + dx, z + dz)] = 1;
    };
    for (let i = 0; i < N; i++) if (g.type[i] && (g.flags[i] & (F.STAIR | F.DOOR))) protect(i, 2);
    for (const t of tunnels) if (t.door !== undefined) protect(t.door, 4);
    const makeVoid = [], bog = [];
    const border = (x, z) => x < 3 || z < 3 || x > W - 4 || z > H - 4;
    for (let i = 0; i < N; i++) {
      if (g.type[i] || X.tmask[i] >= 0 || X.owner[i] >= 0) continue;     // (gate walls keep their own look)
      const x = i % W, z = (i / W) | 0;
      const d = Math.max(1, dNear[i]);
      const n1 = nz(x, z, 5, 61, 3), n2 = nz(x, z, 14, 71, 3);
      if (cloudy) {
        const crag = prot[i] || (fam === 'climb' ? (d <= 1 ? n1 > 0.42 : d <= 3 ? n1 > 0.52 : n2 > 0.58 && n1 > 0.42) : d <= 1 ? n1 > 0.5 : d <= 3 ? n1 > 0.6 : n2 > 0.66 && n1 > 0.5);
        if (crag || x < 2 || z < 2 || x > W - 3 || z > H - 3) {
          const k = fam === 'climb' ? 2.2 : 1.4;
          g.floor[i] = hNear[i] + (fam === 'climb' ? 4 : 2.6) + Math.min(14, d * k) + n1 * (fam === 'climb' ? 9 : 6);
          g.floorTex[i] = skin.capTex;
        } else makeVoid.push(i);
      } else if (fam === 'desert') {
        if (n2 > 0.6 || (d <= 2 && n1 > 0.7)) {
          // mesa / butte: tall layered rock
          g.floor[i] = hNear[i] + 7 + (n2 - 0.5) * 26 + n1 * 3;
          g.wallTex[i] = n1 > 0.5 ? TS.WALL2 : TS.WALL;
          g.floorTex[i] = TS.ROCK;
        } else {
          // sand dune ridge
          g.floor[i] = hNear[i] + 2.6 + Math.min(3, d * 0.55) + n1 * 2.2;
          g.wallTex[i] = TS.GROUND;
          g.floorTex[i] = TS.FLOOR;
        }
      } else if (d <= 2 && !prot[i] && !border(x, z) && n1 > 0.38) {
        bog.push(i);       // shallow poison bog fringing the islands
      } else {
        // swamp: low hedge banks, a little higher further out
        g.floor[i] = hNear[i] + 1.8 + Math.min(3, d * 0.5) + n1 * 1.6;
        g.floorTex[i] = TS.FOLIAGE;
      }
    }
    if (bog.length) {
      for (const i of bog) g.open(i % W, (i / W) | 0, hNear[i], SKY_H, { sky: true, floorTex: TS.FLOOR, wallTex: TS.PITWALL, flags: F.OUTDOOR, region: -3, light: lightAt(i % W, (i / W) | 0) });
      // sink per source height so every patch sits just below its shore
      const byH = new Map();
      for (const i of bog) { const h = hNear[i]; if (!byH.has(h)) byH.set(h, []); byH.get(h).push(i); }
      for (const [h, cells] of byH) sinkPit(g, X.deco, cells, 'poison', 0.35, { base: h, lightEvery: 11 });
    }
    for (const i of makeVoid) {
      const x = i % W, z = (i / W) | 0;
      g.open(x, z, -30, SKY_H, { sky: true, floorTex: TS.PITWALL, wallTex: TS.ROCK, flags: F.VOID | F.NOSPAWN | F.OUTDOOR, region: -3, light: lightAt(x, z) });
    }
    // cliff faces under the terraces
    for (const i of makeVoid) for (const j of neighbors4(g, i)) if (g.type[j] && !(g.flags[j] & (F.VOID | F.BRIDGE | F.STAIR))) g.wallTex[j] = TS.ROCK;
    // trees on the swamp banks / snow pines on low crags
    if (fam === 'swamp' || fam === 'top') {
      for (let i = 0; i < N; i++) {
        if (g.type[i] || dNear[i] > (fam === 'swamp' ? 3 : 1) || !X.rng.chance(fam === 'swamp' ? 0.06 : 0.03)) continue;
        const x = i % W, z = (i / W) | 0;
        if (x < 3 || z < 3 || x > W - 4 || z > H - 4) continue;
        if (fam === 'swamp') (X.rng.chance(0.5) ? swampTree : deadTree)(X.deco, x + 0.5, z + 0.5, g.floor[i], X.rng.float(0.9, 1.2));
        else if (g.floor[i] - hNear[i] < 6) pineTree(X.deco, x + 0.5, z + 0.5, g.floor[i], X.rng.float(0.8, 1.1));
      }
    }
  };

  // ------------------------------------------------------------ props
  skin.prop = (X, L, c, i, small, big) => {
    const { g, deco, rng, W, S } = X;
    const x = (i % W) + 0.5 + rng.float(-0.12, 0.12), z = ((i / W) | 0) + 0.5 + rng.float(-0.12, 0.12), y = g.floor[i];
    const r = rng.next();
    switch (fam) {
      case 'top': case 'climb':
        if (r < 0.5) pineTree(deco, x, z, y, rng.float(0.85, 1.25));
        else if (r < 0.65) deadTree(deco, x, z, y, rng.float(0.8, 1.1));
        else if (r < 0.8 || small) boulder(deco, x, z, y, rng.float(0.7, 1.4));
        else if (big && r < 0.9) menhir(deco, x, z, y, rng.float(2.2, 3.6));
        else cairn(deco, x, z, y);
        break;
      case 'cyber':
        if (r < 0.4) crystalCluster(deco, x, z, y, rng.float(1.2, big ? 3 : 2), TS.ACCENT, rng.chance(0.5) ? cyan : [1, 0.3, 0.85], { light: rng.chance(0.5) });
        else if (r < 0.65 && !small) neonPylon(deco, x, z, y, rng.float(3, 4.5), S.glow);
        else if (r < 0.8 && !small) monolith(deco, x, z, y, rng.float(2.2, 3.2), rng.chance(0.5), S.glow);
        else boulder(deco, x, z, y, rng.float(0.7, 1.2));
        break;
      case 'desert':
        if (r < 0.45) cactus(deco, x, z, y, rng.float(0.9, 1.3));
        else if (big && r < 0.6) hoodoo(deco, x, z, y, rng.float(2.5, 4.5));
        else if (r < 0.72) deadTree(deco, x, z, y, rng.float(0.6, 0.9));
        else if (r < 0.9 || small) boulder(deco, x, z, y, rng.float(0.6, 1.3));
        else palmTree(deco, x, z, y, rng.float(0.8, 1));
        break;
      default: // swamp
        if (r < 0.35) swampTree(deco, x, z, y, rng.float(0.9, 1.2));
        else if (r < 0.6) deadTree(deco, x, z, y, rng.float(0.8, 1.2));
        else if (r < 0.75) stump(deco, x, z, y, rng.float(0.8, 1.2));
        else if (r < 0.9) reeds(deco, x, z, y, rng.int(5, 8));
        else boulder(deco, x, z, y, rng.float(0.6, 1.1));
        break;
    }
  };
  skin.pillar = (X, L, c, i) => {
    const { g, deco, rng, W, S } = X;
    const x = (i % W) + 0.5, z = ((i / W) | 0) + 0.5, y = g.floor[i];
    if (alpine) rockSpike(deco, x, z, y, rng.float(3.5, 7), rng.float(0.6, 0.9), TS.ROCK, { solid: true, segs: 4 });
    else if (fam === 'cyber') neonPylon(deco, x, z, y, rng.float(4, 6), S.glow);
    else if (fam === 'desert') (rng.chance(0.5) ? hoodoo(deco, x, z, y, rng.float(3.5, 6)) : brokenColumn(deco, x, z, y, rng.float(1.5, 3.4)));
    else swampTree(deco, x, z, y, rng.float(1.1, 1.4));
  };
  skin.centrepiece = (X, L, c, T, island) => {
    const { g, deco, rng, W, S } = X;
    const cells = [...T].filter((i) => deco.cellInterior(i % W, (i / W) | 0));
    if (!cells.length) return;
    const dc = (a) => Math.hypot((a % W) + 0.5 - c.cx, ((a / W) | 0) + 0.5 - c.cz);
    cells.sort((a, b) => dc(a) - dc(b));
    const i = cells[0], x = (i % W) + 0.5, z = ((i / W) | 0) + 0.5, y = g.floor[i];
    if (alpine) { if (rng.chance(0.5)) { cairn(deco, x, z, y); } else campfire(deco, x, z, y); }
    else if (fam === 'cyber') monolith(deco, x, z, y, 3.4, rng.chance(0.5), S.glow);
    else if (fam === 'desert') { deco.pillar(x, z, 0.7, y, y + rng.float(3.5, 5), { tex: TS.PILLAR, trimTex: TS.TRIM }); }
    else prayerPole(deco, x, z, y, S.torch);
    const j = cells.find((k) => dc(k) > 2.2 && dc(k) < 3.6 && deco.cellFree(k % W, (k / W) | 0));
    if (j !== undefined && !island && fam !== 'cyber') deco.crateStack((j % W) + 0.5, ((j / W) | 0) + 0.5, g.floor[j], { count: rng.int(1, 3) });
  };
  skin.dressLake = (X, L, c) => {
    const { g, deco, rng, W } = X;
    let n = 0;
    for (const i of c.cells) {
      if (n >= (fam === 'swamp' ? 6 : 4) || c.lake.area.has(i) || !rng.chance(0.25)) continue;
      if (!neighbors4(g, i).some((j) => c.lake.area.has(j)) || !deco.cellInterior(i % W, (i / W) | 0)) continue;
      const x = (i % W) + 0.5, z = ((i / W) | 0) + 0.5;
      if (fam === 'desert' && c.lake.kind === 'water') palmTree(deco, x, z, g.floor[i], rng.float(0.8, 1.1));
      else if (fam === 'swamp') reeds(deco, x, z, g.floor[i], rng.int(5, 9));
      else if (fam === 'cyber') neonPylon(deco, x, z, g.floor[i], 3, X.S.glow);
      else break;
      n++;
    }
  };

  // ------------------------------------------------------------ extra features
  const logged = (name, fn) => (c) => { const ok = fn(c); if (ok && globalThis.DBG) console.log('extra', name, 'in area', c.id); return ok; };
  skin.features = (X, L) => ({
    outpost: logged('outpost', (c) => cabin(X, L, c, fam === 'cyber' ? { wallTex: TS.METAL, chimneyTex: TS.PIPE, lamp: cyan }
      : fam === 'desert' ? { wallTex: TS.PANEL, chimneyTex: TS.PANEL } : { wallTex: TS.WOOD, chimneyTex: TS.ROCK })),
    adit: logged('adit', (c) => adit(X, L, c)),
    shrine: logged('shrine', (c) => shrine(X, L, c)),
    ruins: logged('ruins', (c) => ruins(X, L, c)),
    stilthut: logged('stilthut', (c) => stiltHut(X, L, c)),
    // a structure (cabin / ruin / shrine / stilt hut...) placed before the
    // props, then the area's props around it
    settle: (c) => {
      for (const f of X.rng.shuffle([...SITES])) {
        if (!X.tryFeature(c, f)) continue;
        sites++;
        X.tryFeature(c, 'grove');
        return true;
      }
      return false;
    },
    site: (c) => {
      if (sites < 4) for (const f of X.rng.shuffle([...SITES])) if (X.tryFeature(c, f)) { sites++; break; }
      X.tryFeature(c, 'grove');
      return true;
    },
  });
  let sites = 0;
  const SITES = { top: ['outpost', 'shrine'], climb: ['outpost', 'shrine', 'adit'], cyber: ['outpost', 'shrine'], desert: ['ruins', 'ruins', 'outpost'], swamp: ['stilthut', 'stilthut', 'shrine'] }[fam];

  // a ring of standing stones / pylons / poles around a small paved circle
  function shrine(X, L, c) {
    const { g, deco, rng, W, idx, S } = X;
    for (let t = 0; t < 20; t++) {
      const i0 = rng.pick(c.cells), x0 = i0 % W, z0 = (i0 / W) | 0;
      const cells = [];
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2; dx++) {
        const i = idx(x0 + dx, z0 + dz);
        if (!g.in(x0 + dx, z0 + dz) || !c.cellSet.has(i) || !L.markFree(c, i) || L.nearBad(c, i) || L.onSpine(c, i)) { ok = false; break; }
        cells.push(i);
      }
      if (!ok) continue;
      for (const i of cells) g.floorTex[i] = TS.FLOOR3;
      const y = c.h;
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const x = x0 + dx + 0.5, z = z0 + dz + 0.5;
        if (fam === 'cyber') neonPylon(deco, x, z, y, 3.2, S.glow);
        else if (fam === 'desert') brokenColumn(deco, x, z, y, rng.float(1.6, 3));
        else if (fam === 'swamp') prayerPole(deco, x, z, y, S.torch);
        else menhir(deco, x, z, y, rng.float(2.2, 3.2));
      }
      const x = x0 + 0.5, z = z0 + 0.5;
      if (fam === 'cyber') crystalCluster(deco, x, z, y, 2.2, TS.ACCENT, S.glow);
      else if (fam === 'swamp') brazier(deco, x, z, y, S.torch);
      else { deco.box(x - 0.6, y, z - 0.45, x + 0.6, y + 0.9, z + 0.45, TS.ROCK, { solid: true }); prayerPole(deco, x + 1, z, y, S.torch); }
      return true;
    }
    return false;
  }

  // sandstone ruin: broken walls (grid solids, PANEL faces, TRIM caps) with
  // 2-wide gaps, paved floor, broken columns and rubble inside
  function ruins(X, L, c) {
    const { g, deco, rng, W, idx } = X;
    for (let t = 0; t < 50; t++) {
      const w = rng.int(5, 7), h = rng.int(4, 6);
      const i0 = rng.pick(c.cells), x0 = (i0 % W) - (w >> 1), z0 = ((i0 / W) | 0) - (h >> 1);
      let ok = true;
      for (let z = z0 - 2; z <= z0 + h + 1 && ok; z++) for (let x = x0 - 2; x <= x0 + w + 1; x++) {
        const i = idx(x, z);
        const inner = x >= x0 - 1 && x <= x0 + w && z >= z0 - 1 && z <= z0 + h;
        if (!g.in(x, z) || !g.type[i] || (inner && (!c.cellSet.has(i) || !L.markFree(c, i) || L.nearBad(c, i)))) { ok = false; break; }
      }
      if (!ok) continue;
      const y = c.h;
      // one 2-wide gap per side (away from the corners), a second on long sides
      const gaps = new Set();
      const sides = [[x0, z0, 1, 0, w], [x0, z0 + h - 1, 1, 0, w], [x0, z0, 0, 1, h], [x0 + w - 1, z0, 0, 1, h]];
      for (const [sx, sz, ax, az, len] of sides) {
        const p = rng.int(1, len - 3);
        for (const q of [p, p + 1]) gaps.add(idx(sx + ax * q, sz + az * q));
      }
      for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
        const i = idx(x, z);
        const edge = x === x0 || z === z0 || x === x0 + w - 1 || z === z0 + h - 1;
        if (edge && !gaps.has(i)) {
          const corner = (x === x0 || x === x0 + w - 1) && (z === z0 || z === z0 + h - 1);
          g.solid(x, z, y + (corner ? rng.float(2.8, 4.2) : rng.float(1.2, 3.4)), TS.PANEL);
          g.floorTex[i] = TS.TRIM;
        } else g.floorTex[i] = TS.FLOOR3;
      }
      // broken columns + rubble inside
      const inner = [];
      for (let z = z0 + 1; z < z0 + h - 1; z++) for (let x = x0 + 1; x < x0 + w - 1; x++) inner.push(idx(x, z));
      rng.shuffle(inner);
      let cols = 0;
      for (const i of inner) {
        if (cols >= 2) break;
        const x = i % W, z = (i / W) | 0;
        if (!deco.cellInterior(x, z)) continue;
        brokenColumn(deco, x + 0.5, z + 0.5, y, rng.float(1.2, 2.8));
        cols++;
      }
      // rubble blocks outside the walls
      for (let k = 0; k < 3; k++) {
        const x = x0 - 1 + rng.int(0, w + 1), z = rng.chance(0.5) ? z0 - 1 : z0 + h;
        if (!deco.cellFree(x, z)) continue;
        deco.box(x + 0.2, y, z + 0.25, x + 0.8, y + rng.float(0.3, 0.6), z + 0.75, TS.PANEL, { solid: true });
      }
      return true;
    }
    return false;
  }

  // swamp hut standing in a poison bog, stilts at the corners, a boardwalk
  // strip to its door
  function stiltHut(X, L, c) {
    const { g, deco, rng, W, idx } = X;
    const before = new Set(c.cells.filter((i) => g.type[i]));
    if (!cabin(X, L, c, { wallTex: TS.WOOD, chimneyTex: TS.ROCK, lamp: [0.9, 1, 0.55] })) return false;
    const walls = [...before].filter((i) => !g.type[i]);
    if (!walls.length) return true;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const i of walls) { const x = i % W, z = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let door = -1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, z);
      if ((x === x0 || x === x1 || z === z0 || z === z1) && g.type[i]) door = i;
    }
    if (door < 0) return true;
    const dx = door % W, dz = (door / W) | 0;
    const out = dx === x0 ? 1 : dx === x1 ? 0 : dz === z0 ? 3 : 2;
    const keep = new Set([step(g, door, out), step(g, door, out, 2)]);
    const ring = [];
    for (let z = z0 - 2; z <= z1 + 2; z++) for (let x = x0 - 2; x <= x1 + 2; x++) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) continue;
      const i = idx(x, z);
      if (keep.has(i) || !c.cellSet.has(i) || !L.markFree(c, i) || L.nearBad(c, i)) continue;
      const far = x < x0 - 1 || x > x1 + 1 || z < z0 - 1 || z > z1 + 1;
      if (far && rng.chance(0.35)) continue;
      ring.push(i);
    }
    if (ring.length < 6) return true;
    sinkPit(g, deco, ring, 'poison', 1.6, { base: c.h, lightEvery: 7 });
    // the door-front strip is a boardwalk
    for (const i of keep) if (i >= 0 && g.type[i] && !(g.flags[i] & F.PIT)) { g.floorTex[i] = TS.WOOD; if (out < 2) g.flags[i] |= F.UVROT; }
    // stilts at the corners, down into the bog
    for (const [sx, sz] of [[x0 - 0.15, z0 - 0.15], [x1 + 1.15, z0 - 0.15], [x0 - 0.15, z1 + 1.15], [x1 + 1.15, z1 + 1.15]]) {
      deco.box(sx - 0.1, c.h - 1.6, sz - 0.1, sx + 0.1, c.h + 3.0, sz + 0.1, TS.WOOD, { faces: FACE.SIDES });
    }
    return true;
  }

  // ------------------------------------------------------------ dressing
  skin.dressStart = (X, L, c) => {
    const { g, deco, rng, W, S } = X;
    const free = c.cells.filter((i) => deco.cellInterior(i % W, (i / W) | 0) && Math.hypot((i % W) + 0.5 - c.cx, ((i / W) | 0) + 0.5 - c.cz) > 2.4 && !L.nearBad(c, i));
    rng.shuffle(free);
    const take = () => { while (free.length) { const i = free.pop(); if (deco.cellInterior(i % W, (i / W) | 0)) return i; } return -1; };
    const at = (i) => [(i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i]];
    let i = take();
    if (i >= 0) { const [x, z, y] = at(i); if (fam === 'cyber') crystalCluster(deco, x, z, y, 1.8, TS.ACCENT, S.glow); else campfire(deco, x, z, y); }
    i = take();
    if (i >= 0) { const [x, z, y] = at(i); if (fam === 'desert') wagon(deco, x, z, y, rng.chance(0.5)); else if (fam === 'cyber') monolith(deco, x, z, y, 2.6, rng.chance(0.5), S.glow); else deco.crateStack(x, z, y, { count: 3 }); }
    for (let k = 0; k < 2; k++) { i = take(); if (i >= 0) { const [x, z, y] = at(i); deco.crateStack(x, z, y, { count: rng.int(1, 3) }); } }
    i = take();
    if (i >= 0) { const [x, z, y] = at(i); lanternPost(deco, x, z, y, S.torch, { flicker: fam !== 'cyber', tex: fam === 'cyber' ? TS.METAL : TS.WOOD }); }
    i = take();
    if (i >= 0) { const [x, z, y] = at(i); if (fam === 'cyber') neonPylon(deco, x, z, y, 3.5, S.glow); else signpost(deco, x, z, y, rng.int(0, 3)); }
  };
  skin.dressBoss = (X, L, c) => {
    const { g, deco, rng, W, idx, S } = X;
    const ok = (i) => c.cellSet.has(i) && L.markFree(c, i) && !L.nearBad(c, i);
    const nCol = c.r >= 10 ? 6 : 5;
    for (let k = 0; k < nCol; k++) {
      const a = (k / nCol) * Math.PI * 2 + rng.float(-0.2, 0.2);
      const x = Math.floor(c.cx + Math.cos(a) * c.r * 0.55 * c.ex), z = Math.floor(c.cz + Math.sin(a) * c.r * 0.55 * c.ez);
      if (!ok(idx(x, z))) continue;
      if (alpine) menhir(deco, x + 0.5, z + 0.5, c.h, rng.float(3.5, 5.5));
      else if (fam === 'cyber') neonPylon(deco, x + 0.5, z + 0.5, c.h, rng.float(5, 7), S.glow);
      else if (fam === 'desert') brokenColumn(deco, x + 0.5, z + 0.5, c.h, rng.float(2.5, 4.5), { size: 0.75 });
      else swampTree(deco, x + 0.5, z + 0.5, c.h, rng.float(1.2, 1.5));
    }
    // hazard pools near the rim (poison / spikes), braziers between them
    const kinds = fam === 'swamp' || fam === 'cyber' ? ['poison'] : ['spikes'];
    let pools = 0;
    for (let k = 0; k < 20 && pools < 2; k++) {
      const a = rng.float(0, Math.PI * 2);
      const x0 = Math.floor(c.cx + Math.cos(a) * c.r * 0.72) - 1, z0 = Math.floor(c.cz + Math.sin(a) * c.r * 0.72) - 1;
      const cells = [];
      let good = true;
      for (let z = z0; z < z0 + 3 && good; z++) for (let x = x0; x < x0 + 3; x++) { const i = idx(x, z); if (!ok(i) || (g.flags[i] & F.OBSTACLE)) { good = false; break; } cells.push(i); }
      if (!good) continue;
      sinkPit(g, deco, cells, rng.pick(kinds), kinds[0] === 'spikes' ? 1.4 : 0.35, { base: c.h, lightEvery: 4 });
      pools++;
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.floor(c.cx + Math.cos(a) * c.r * 0.8), z = Math.floor(c.cz + Math.sin(a) * c.r * 0.8);
      if (ok(idx(x, z)) && deco.cellFree(x, z)) {
        if (fam === 'cyber') crystalCluster(deco, x + 0.5, z + 0.5, c.h, 2, TS.ACCENT, S.glow);
        else brazier(deco, x + 0.5, z + 0.5, c.h, S.torch, { tex: TS.METAL });
      }
    }
    for (const i of c.cells) {
      const d = Math.hypot((i % W) + 0.5 - c.cx, ((i / W) | 0) + 0.5 - c.cz);
      if (d < 3.5 && g.type[i] && !(g.flags[i] & (F.HAZARD | F.PIT | F.STAIR | F.BRIDGE))) g.floorTex[i] = TS.FLOOR3;
    }
  };
  skin.dressTunnel = (X, L, t) => {
    // lanterns at the trail ends, boulders / cacti / reeds along trail sides
    const { g, deco, rng, idx, S } = X;
    for (const k of [t.k0, t.k1]) {
      if (k < 0 || k >= t.pts.length || rng.chance(0.4)) continue;
      const [px, pz] = t.pts[k];
      const ax = t.dir[Math.min(k, t.dir.length - 1)] < 2;
      for (const side of [-1, 1]) {
        const o = side < 0 ? -t.a : t.b;
        const x = ax ? px : px + o, z = ax ? pz + o : pz;
        const i = idx(x, z);
        if (!g.type[i] || (g.flags[i] & (F.STAIR | F.BRIDGE | F.DOOR | F.VOID | F.PIT | F.OBSTACLE))) continue;
        const lx = x + 0.5 + (ax ? 0 : side * 0.3), lz = z + 0.5 + (ax ? side * 0.3 : 0);
        if (fam === 'cyber') neonPylon(deco, lx, lz, g.floor[i], 3, S.glow);
        else lanternPost(deco, lx, lz, g.floor[i], S.torch, { flicker: true, armX: ax ? 0 : -side * 0.35, armZ: ax ? -side * 0.35 : 0 });
      }
    }
    if (t.kind !== 'tunnel' || t.tw < 4) return;
    for (let k = t.k0 + 1; k < t.k1; k++) {
      if (!rng.chance(0.16) || (t.fn && k >= t.fs - 1 && k <= t.fs + t.fn) || (t.gk >= 0 && Math.abs(k - t.gk) <= 1)) continue;
      const [px, pz] = t.pts[k];
      const ax = t.dir[Math.min(k, t.dir.length - 1)] < 2;
      const side = rng.sign(), o = side < 0 ? -t.a : t.b;
      const x = ax ? px : px + o, z = ax ? pz + o : pz;
      const i = idx(x, z);
      if (!g.type[i] || (g.flags[i] & (F.STAIR | F.BRIDGE | F.DOOR | F.VOID | F.PIT | F.OBSTACLE)) || g.edge[i]) continue;
      if (neighbors4(g, i).some((j) => g.flags[j] & F.VOID)) continue;
      const bx = x + 0.5 + (ax ? 0 : side * 0.15), bz = z + 0.5 + (ax ? side * 0.15 : 0);
      if (fam === 'desert' && rng.chance(0.5)) cactus(deco, bx, bz, g.floor[i], rng.float(0.7, 1));
      else if (fam === 'swamp' && rng.chance(0.6)) reeds(deco, bx, bz, g.floor[i], 5);
      else boulder(deco, bx, bz, g.floor[i], rng.float(0.6, 0.9));
    }
  };
  skin.dressChamber = (X, L, c) => {
    const { g, deco, rng, W } = X;
    if (c.role === 'start') return;
    for (const i of c.cells) {
      const x = i % W, z = (i / W) | 0;
      if (!deco.cellFree(x, z) || L.nearBad(c, i) || L.onSpine(c, i)) continue;
      const nb = neighbors4(g, i);
      const wall = nb.some((j) => !g.type[j]);
      if (nb.some((j) => g.flags[j] & F.VOID)) continue;
      if (!rng.chance(wall ? 0.06 : 0.012)) continue;
      const px = x + 0.5, pz = z + 0.5, y = g.floor[i];
      const r = rng.next();
      if (alpine) {
        if (wall && r < 0.35) rockSpike(deco, px, pz, y, rng.float(1.2, 2.6), rng.float(0.35, 0.6), TS.ROCK, { solid: true });
        else if (r < 0.7) boulder(deco, px, pz, y, rng.float(0.5, 1.1));
        else pineTree(deco, px, pz, y, rng.float(0.7, 1));
      } else if (fam === 'cyber') {
        if (r < 0.5) crystalCluster(deco, px, pz, y, rng.float(0.8, 1.5), TS.ACCENT, X.S.glow, { light: rng.chance(0.3) });
        else boulder(deco, px, pz, y, rng.float(0.5, 1));
      } else if (fam === 'desert') {
        if (r < 0.45) cactus(deco, px, pz, y, rng.float(0.7, 1.1));
        else if (wall && r < 0.6) rockSpike(deco, px, pz, y, rng.float(1.2, 2.4), rng.float(0.35, 0.55), TS.ROCK, { solid: true });
        else boulder(deco, px, pz, y, rng.float(0.5, 1.1));
      } else {
        if (r < 0.4) reeds(deco, px, pz, y, rng.int(4, 7));
        else if (r < 0.65) stump(deco, px, pz, y);
        else if (r < 0.85) deadTree(deco, px, pz, y, rng.float(0.7, 1));
        else boulder(deco, px, pz, y, rng.float(0.5, 0.9));
      }
    }
  };
  return skin;
}
