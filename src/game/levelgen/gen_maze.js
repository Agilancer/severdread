// Maze levels: the Back Rooms, sewer labyrinth, subway tunnels, data core,
// prison complex and dream maze. All share the lattice layout of mazekit.js
// (wide corridors, frequent big chambers, zones split by 1-wide doorways,
// real stair flights) and differ in their "skin": sizes, heights, corridor
// dressing and the themed room templates below.
//   sewers  - brick tunnels with railed poison / water channels, cisterns
//             crossed by grate bridges, pump houses, storm drains (sky)
//   subway  - tiled pedestrian tunnels, stations with track pits, platforms,
//             pillars and tunnel portals, ticket halls, street exits (sky,
//             skyscraper facades)
//   prison  - cell blocks with real ground cells and a railed upper gallery
//             reached by stairs, mess halls, guard rooms, solitary, showers,
//             the exercise yard (sky) with a guard tower
//   data    - server halls (rack rows, neon conduits, cable trays), the core
//             (glowing column over a coolant ring pit), coolant pits
//   backrooms - endless yellow office floor: rooms opening into each other
//             through wide openings, pillared halls, flooded rooms, sinkholes
//   dream   - checker platforms floating in the void, joined by railed
//             bridges and floating stair flights; hedge mazes, giant chess
//             pieces, Escher stairs
import { TS, F, HAZ, DIR_X, DIR_Z, OPP, clamp } from './common.js';
import {
  buildMaze, carveCorridor, corridorGeom, ARCH_T, makePit, bridge, inRoom, wallConsoles, FACE,
  axes, isFree, rectFree, panelGrid, hangingLamps, wallLamps, corridorBox,
} from './mazekit.js';

export function genMaze(rng, theme, depth) {
  const p = theme.params || {};
  const id = theme.id || '';
  let skin;
  if (p.office || id.includes('backroom')) skin = backroomsSkin(theme);
  else if (p.channels || id.includes('sewer')) skin = sewerSkin(theme);
  else if (p.tunnels || id.includes('subway')) skin = subwaySkin(theme);
  else if (p.racks || id.includes('data')) skin = dataSkin(theme);
  else if (p.surreal || id.includes('dream')) skin = dreamSkin(theme);
  else skin = prisonSkin(theme);
  return buildMaze(rng, theme, depth, skin);
}

const W8 = (opts) => opts.filter((o) => o[1] > 0);
const latSize = (d, mw = [5, 8], mh = [4, 6]) => ({
  MW: clamp(mw[0] + Math.floor(d / 5), mw[0], mw[1]),
  MH: clamp(mh[0] + Math.floor(d / 9), mh[0], mh[1]),
});

// ---------------------------------------------------------------- frames
// Room-local coordinates: t along an axis, s across it (optionally flipped).
function frameOf(r, alongX, flip = false) {
  const Wd = alongX ? r.h : r.w, L = alongX ? r.w : r.h;
  const sw = (s) => (flip ? Wd - 1 - s : s);
  const tLine = (tb) => (alongX ? r.x : r.z) + tb;
  const sLine = (sb) => (alongX ? r.z : r.x) + (flip ? Wd - sb : sb);
  const f = {
    L, Wd, alongX, flip,
    xz: (t, s) => (alongX ? [r.x + t, r.z + sw(s)] : [r.x + sw(s), r.z + t]),
    tLine, sLine,
    dirS: alongX ? (flip ? 3 : 2) : (flip ? 1 : 0),
    dirT: alongX ? 0 : 2,
    // world rect [x0,z0,x1,z1] from local boundary coords
    rect: (t0, s0, t1, s1) => {
      const a0 = tLine(t0), a1 = tLine(t1), b0 = sLine(s0), b1 = sLine(s1);
      return alongX ? [Math.min(a0, a1), Math.min(b0, b1), Math.max(a0, a1), Math.max(b0, b1)] : [Math.min(b0, b1), Math.min(a0, a1), Math.max(b0, b1), Math.max(a0, a1)];
    },
  };
  // box in local coords
  f.box = (deco, t0, s0, t1, s1, y0, y1, tex, o) => { const [x0, z0, x1, z1] = f.rect(t0, s0, t1, s1); return deco.box(x0, y0, z0, x1, y1, z1, tex, o); };
  // rail / bars along a constant-s boundary from t0 to t1
  f.railS = (deco, sb, t0, t1, y, o) => {
    if (alongX) deco.railRun(tLine(t0), sLine(sb), tLine(t1), sLine(sb), y, o);
    else deco.railRun(sLine(sb), tLine(t0), sLine(sb), tLine(t1), y, o);
  };
  // stair flight along t (sign +1 climbs toward +t) over lanes [s0, s0+width)
  f.stairsT = (deco, t, s0, width, sign, y0, y1, o) => {
    const sMin = flip ? s0 + width - 1 : s0;
    const [x, z] = f.xz(t, sMin);
    return deco.stairs(x, z, sign > 0 ? f.dirT : OPP[f.dirT], width, y0, y1, o);
  };
  // stair flight along s (sign +1 climbs toward +s) over t in [t0, t0+width)
  f.stairsS = (deco, s, t0, width, sign, y0, y1, o) => {
    const [x, z] = f.xz(t0, s);
    const d = sign > 0 ? f.dirS : OPP[f.dirS];
    return deco.stairs(x, z, d, width, y0, y1, o);
  };
  return f;
}
function cellsFree(ctx, fr, t0, s0, t1, s1, margin = 0) {
  for (let t = t0 - margin; t < t1 + margin; t++) for (let s = s0 - margin; s < s1 + margin; s++) {
    if (t < 0 || s < 0 || t >= fr.L || s >= fr.Wd) return false;
    const [x, z] = fr.xz(t, s);
    if (!isFree(ctx, x, z)) return false;
  }
  return true;
}
function anyReserved(ctx, fr, t0, s0, t1, s1) {
  const { g, room: r } = ctx;
  for (let t = t0; t < t1; t++) for (let s = s0; s < s1; s++) {
    if (t < 0 || s < 0 || t >= fr.L || s >= fr.Wd) continue;
    const [x, z] = fr.xz(t, s);
    if (r.reserved.has(g.idx(x, z))) return true;
  }
  return false;
}
// pipe with a pouring stream of liquid from a wall into a pit
function outfall(ctx, x, z, d, yTop, yBot, liquidTex) {
  const { deco } = ctx;
  const cx = x + 0.5, cz = z + 0.5;
  const ox = DIR_X[d], oz = DIR_Z[d];
  const wx = cx + ox * 0.5, wz = cz + oz * 0.5;   // wall plane
  const px0 = Math.min(wx, wx - ox * 0.45), px1 = Math.max(wx, wx - ox * 0.45);
  const pz0 = Math.min(wz, wz - oz * 0.45), pz1 = Math.max(wz, wz - oz * 0.45);
  if (ox) deco.box(px0, yTop - 0.2, cz - 0.3, px1, yTop + 0.4, cz + 0.3, TS.PIPE);
  else deco.box(cx - 0.3, yTop - 0.2, pz0, cx + 0.3, yTop + 0.4, pz1, TS.PIPE);
  const sx = wx - ox * 0.4, sz = wz - oz * 0.4;
  deco.box(sx - 0.18, yBot, sz - 0.18, sx + 0.18, yTop - 0.15, sz + 0.18, liquidTex, { emissive: 0.5, uv: 'fit' });
}

// ======================================================================
// SEWERS
// ======================================================================
function sewerSkin(theme) {
  const liquid = theme.hazard === 'water' ? 'water' : 'poison';
  const LIQ = liquid === 'water' ? HAZ.WATER : HAZ.POISON;
  const LTEX = liquid === 'water' ? TS.WATER : TS.POISON;
  const LCOL = liquid === 'water' ? [0.3, 0.6, 1] : [0.5, 1, 0.3];
  return {
    name: 'sewer',
    rail: 'metal',
    style: { hazards: [liquid, liquid, liquid === 'poison' ? 'water' : 'poison'], wain: 0, crown: false, lights: 'hanging', pillars: 'column' },
    lattice: (d) => ({
      ...latSize(d), P: 13, cw: 5, inset: 2, jitter: 1, drop: 0.12, loops: 0.3, junction: 0.3, branch: 0.4,
      big: [[2, 2, d >= 8 ? 2 : 1], [2, 1, 1], [1, 2, 1]], bossBlock: [2, 2],
    }),
    roomSize: (n, rng, mw, mh) => n.kind === 'junction' ? { w: 7, h: 7 } : n.kind === 'room' || n.kind === 'start' ? { w: rng.int(8, mw), h: rng.int(8, mh) } : { w: mw - rng.int(0, 1), h: mh - rng.int(0, 1) },
    deltas: [0, 0, 0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4],
    heightRange: [-4.2, 3.6],
    corridorH: 4,
    corridorFloor: TS.FLOOR2,
    corridorWall: TS.WALL,
    pickTemplate: (n, { rng }) => {
      if (n.kind === 'boss') return 'sewerArena';
      if (n.kind === 'start') return 'drain';
      if (n.kind === 'big') return rng.weighted(W8([['cistern', 4], ['pumphouse', 2], ['crossing', 1.5]]), (o) => o[1])[0];
      if (n.kind === 'junction') return rng.weighted(W8([['drain', 2], ['crossing', 1.5]]), (o) => o[1])[0];
      return rng.weighted(W8([['crossing', 3], ['pools', 1.2], ['maintenance', 1.2], ['pumphouse', n.w >= 9 && n.h >= 9 ? 1.5 : 0], ['stormdrain', 0.8], ['cistern', n.w >= 9 && n.h >= 9 ? 1 : 0]]), (o) => o[1])[0];
    },
    ceilH: (n, rng) => ({ cistern: rng.pick([8, 9, 10]), pumphouse: rng.pick([7, 8]), sewerArena: 10, stormdrain: 6, crossing: rng.pick([5, 6]), drain: 4.5, pools: 5, maintenance: 4.5 }[n.template] || 5),
    skyRoom: (n) => n.template === 'stormdrain',
    slots: (n, rng) => ({ wall: n.template === 'pumphouse' ? TS.WALL2 : rng.chance(0.25) ? TS.WALL2 : TS.WALL, floor: n.template === 'cistern' || n.template === 'pumphouse' ? TS.FLOOR2 : TS.FLOOR, ceil: TS.CEIL }),
    trimOpts: () => ({ wainscot: 0, crown: false }),
    carveCorridor(ctx, e) {
      if (e.width >= 5) {
        const chanLow = ctx.rng.chance(0.5);
        e.lanes = chanLow
          ? { walk: [2, 5], pit: { s0: 0, s1: 2, depth: 1.6, haz: LIQ, floorTex: LTEX, wallTex: TS.PITWALL, glow: liquid === 'poison' } }
          : { walk: [0, 3], pit: { s0: 3, s1: 5, depth: 1.6, haz: LIQ, floorTex: LTEX, wallTex: TS.PITWALL, glow: liquid === 'poison' } };
      }
      carveCorridor(ctx, e);
    },
    dressCorridor(ctx, e) {
      const { g, deco } = ctx;
      const walk = e.lanes ? e.lanes.walk : [0, e.width];
      // brick ribs (pilasters + arch band) every 4 cells
      for (let t = 2; t < e.L - 1; t += 4) {
        let lo = Infinity, top = -Infinity;
        for (let s = 0; s < e.width; s++) { const i = e.cellAt(t, s); if (!g.type[i]) continue; lo = Math.min(lo, g.minFloor(i)); top = Math.max(top, g.ceil[i]); }
        if (!isFinite(lo)) continue;
        corridorBox(deco, e, t + 0.3, t + 0.7, 0, 0.2, lo, top, TS.PILLAR, { faces: FACE.SIDES });
        corridorBox(deco, e, t + 0.3, t + 0.7, e.width - 0.2, e.width, lo, top, TS.PILLAR, { faces: FACE.SIDES });
        corridorBox(deco, e, t + 0.3, t + 0.7, 0, e.width, top - 0.35, top, TS.PILLAR, { faces: FACE.SIDES | FACE.BOTTOM });
      }
      // a pipe along the walkway wall, in flat segments
      const ps = walk[0] === 0 ? 0.08 : e.width - 0.38;
      let seg0 = 0;
      for (let t = 1; t <= e.L; t++) {
        const y0 = (e.topAt ? e.topAt(seg0) : e.A.floor) + 2.6;
        const y1 = t < e.L ? e.topAt(t) + 2.6 : NaN;
        if (t === e.L || Math.abs(y1 - y0) > 0.01) {
          corridorBox(deco, e, seg0, t, ps, ps + 0.3, y0 - 0.15, y0 + 0.15, TS.PIPE);
          seg0 = t;
        }
      }
      // outfall at the channel ends
      if (e.lanes && e.L >= 4) {
        const cs = e.lanes.pit.s0 + 0.5;
        const y = e.lowAt(1);
        corridorBox(deco, e, 0.7, 1.1, cs - 0.4, cs + 1.4, y - 0.2, y + 0.2, TS.PIPE);
      }
    },
    corridorLights(ctx, e) {
      const { g, deco } = ctx;
      const walk = e.lanes ? e.lanes.walk : [0, e.width];
      const side = walk[0] === 0 ? -1 : e.width;          // wall on the walkway side
      for (let t = 1; t < e.L - 1; t += 6) {
        const s = side < 0 ? 0 : e.width - 1;
        const [x, z] = e.xz(t, s);
        const i = g.idx(x, z);
        if (!g.type[i] || (g.flags[i] & F.STAIR)) continue;
        const d = e.axis === 'x' ? (side < 0 ? 3 : 2) : (side < 0 ? 1 : 0);
        deco.wallLight(x, z, d, g.floor[i] + 2.1, [1, 0.82, 0.55], { radius: 6, flicker: ctx.rng.chance(0.2) });
      }
      if (e.lanes && liquid === 'poison') for (let t = 2; t < e.L - 1; t += 5) {
        const [x, z] = e.xz(t, e.lanes.pit.s0 + 1);
        deco.light(x + 0.5, e.lowAt(t) - 0.8, z + 0.5, LCOL, 4.5, { pulse: true });
      }
    },
    lights(ctx) { if (ctx.room.ceilH >= 6) hangingLamps(ctx, 5, { color: [1, 0.85, 0.6] }); else wallLamps(ctx, 4, { color: [1, 0.82, 0.55] }); },
    fallback: 'drain',
    templates: {
      drain(ctx) {
        const { g, deco, room: r } = ctx;
        const cx = r.x + r.w / 2, cz = r.z + r.h / 2;
        // floor drain grate + a ring of puddles
        deco.box(cx - 1, r.floor, cz - 1, cx + 1, r.floor + 0.03, cz + 1, TS.GRATE, { uv: 'fit', faces: FACE.TOP | FACE.SIDES });
        // pipes along the top of two walls with drops
        const top = r.floor + r.ceilH;
        deco.pipe(r.x, r.z + 0.25, r.x + r.w, r.z + 0.25, top - 0.8, 0.3);
        deco.pipe(r.x + 0.25, r.z, r.x + 0.25, r.z + r.h, top - 1.3, 0.22);
        if (rectFree(ctx, r.x + r.w - 2, r.z + r.h - 2, 2, 2)) deco.crateStack(r.x + r.w - 1, r.z + r.h - 1, r.floor, { count: 2 });
        // valve wheel
        deco.box(r.x + 0.05, r.floor + 1.2, cz - 0.3, r.x + 0.15, r.floor + 1.8, cz + 0.3, TS.METAL);
      },
      crossing(ctx) { sewerCrossing(ctx, liquid, LIQ, LTEX); },
      cistern(ctx) { sewerCistern(ctx, liquid, LTEX); },
      pumphouse(ctx) {
        ARCH_T.industrial(ctx);
        ctx.room.lit = false;
      },
      pools(ctx) {
        ARCH_T.pools(ctx);
        const { deco, room: r } = ctx;
        deco.pipe(r.x, r.z + r.h - 0.25, r.x + r.w, r.z + r.h - 0.25, r.floor + r.ceilH - 0.9, 0.3);
      },
      maintenance(ctx) { maintenanceRoom(ctx); },
      stormdrain(ctx) {
        const { g, deco, rng, room: r } = ctx;
        // daylight falls into a brick shaft: puddles, rubble, a ladder up the wall
        for (let k = 0; k < 3; k++) {
          const w = rng.int(2, 3), h = rng.int(2, 3);
          const x = rng.int(r.x + 1, r.x + r.w - w - 1), z = rng.int(r.z + 1, r.z + r.h - h - 1);
          if (rectFree(ctx, x, z, w, h, 0)) makePit(ctx, x, z, w, h, 'water', 0.3);
        }
        for (let k = 0; k < 5; k++) {
          const x = rng.int(r.x, r.x + r.w - 2), z = rng.int(r.z, r.z + r.h - 2);
          if (!rectFree(ctx, x, z, 1, 1, 0)) continue;
          const s = rng.float(0.4, 0.9);
          deco.box(x + 0.5 - s / 2, r.floor, z + 0.5 - s / 2, x + 0.5 + s / 2, r.floor + s * 0.7, z + 0.5 + s / 2, TS.ROCK, { solid: s > 0.6 });
        }
        // iron ladder rungs on the north wall
        const lx = r.x + Math.floor(r.w / 2) + 0.5;
        for (let y = r.floor + 0.4; y < r.floor + 7; y += 0.4) deco.box(lx - 0.3, y, r.z + 0.02, lx + 0.3, y + 0.05, r.z + 0.14, TS.METAL);
        deco.box(lx - 0.35, r.floor, r.z + 0.02, lx - 0.3, r.floor + 7.2, r.z + 0.14, TS.METAL);
        deco.box(lx + 0.3, r.floor, r.z + 0.02, lx + 0.35, r.floor + 7.2, r.z + 0.14, TS.METAL);
        r.lit = true;
      },
      sewerArena(ctx) {
        ARCH_T.arena(ctx);
        const { deco, room: r } = ctx;
        for (const z of [r.z + 0.25, r.z + r.h - 0.25]) deco.pipe(r.x, z, r.x + r.w, z, r.floor + r.ceilH - 1.2, 0.4);
        ctx.room.lit = false;
      },
    },
  };
}

function sewerCrossing(ctx, liquid, LIQ, LTEX) {
  const { g, deco, rng, room: r } = ctx;
  // a deep channel spans the room wall to wall; grate bridges cross it
  for (const alongX of rng.shuffle([r.w >= r.h, r.w < r.h])) {
    const fr = frameOf(r, alongX);
    // channel across the s axis at t in [tc, tc+cwid)
    const cwid = fr.L >= 10 ? 3 : 2;
    const opts = [];
    for (let tc = 2; tc + cwid <= fr.L - 2; tc++) if (!anyReserved(ctx, fr, tc, 0, tc + cwid, fr.Wd)) opts.push(tc);
    if (!opts.length) continue;
    const tc = opts[Math.floor(opts.length / 2) + rng.int(-Math.floor(opts.length / 4), Math.floor(opts.length / 4))] ?? opts[0];
    const [x0, z0, x1, z1] = fr.rect(tc, 0, tc + cwid, fr.Wd);
    makePit(ctx, x0, z0, x1 - x0, z1 - z0, liquid, 1.8);
    // one or two bridges (2 wide)
    const spans = fr.Wd >= 10 ? [Math.floor(fr.Wd * 0.25), Math.floor(fr.Wd * 0.65)] : [Math.floor(fr.Wd / 2) - 1];
    const walk = new Set(ctx.cells.filter((i) => !(g.flags[i] & F.PIT)));
    for (const sb of spans) {
      for (let k = 0; k < 2; k++) {
        for (let t = tc; t < tc + cwid; t++) {
          const [x, z] = fr.xz(t, sb + k);
          const i = g.idx(x, z);
          g.open(x, z, r.floor, g.ceil[i], { floorTex: TS.GRATE, wallTex: TS.GRATE, light: g.light[i], region: r.id });
          g.flags[i] &= ~(F.PIT | F.HAZARD); g.flags[i] |= F.BRIDGE | F.NOSPAWN; g.hazType[i] = 0;
          walk.add(i);
        }
      }
      // support beam under the bridge
      fr.box(deco, tc, sb + 0.9, tc + cwid, sb + 1.1, r.floor - 1.8, r.floor - 0.35, TS.BEAM);
    }
    deco.railEdges(walk, { style: ctx.style.railStyle });
    // outfalls at both channel ends
    for (const s of [0, fr.Wd - 1]) {
      const t = tc + Math.floor(cwid / 2);
      const [x, z] = fr.xz(t, s);
      const d = s === 0 ? OPP[fr.dirS] : fr.dirS;
      if (!g.type[g.idx(x + DIR_X[d], z + DIR_Z[d])]) outfall(ctx, x, z, d, r.floor + 0.9, r.floor - 1.8, LTEX);
    }
    // pipes overhead along the channel
    fr.box(deco, tc + 0.3, 0, tc + 0.6, fr.Wd, r.floor + r.ceilH - 0.9, r.floor + r.ceilH - 0.6, TS.PIPE);
    return;
  }
  throw new Error('no room for a channel');
}

function sewerCistern(ctx, liquid, LTEX) {
  const { g, deco, rng, room: r } = ctx;
  const ring = 2;
  const x0 = r.x + ring, z0 = r.z + ring, w = r.w - 2 * ring, h = r.h - 2 * ring;
  if (w < 5 || h < 5) return ARCH_T.pitroom(ctx);
  const depth = rng.pick([2.4, 3, 3.6]);
  makePit(ctx, x0, z0, w, h, liquid, depth);
  const walk = new Set(ctx.cells.filter((i) => !(g.flags[i] & F.PIT)));
  const cx = x0 + Math.floor(w / 2) - 1, cz = z0 + Math.floor(h / 2) - 1;
  const deck = (x, z) => {
    if (!inRoom(r, x, z)) return;
    const i = g.idx(x, z);
    if (!(g.flags[i] & F.PIT)) return;
    g.open(x, z, r.floor, g.ceil[i], { floorTex: TS.GRATE, wallTex: TS.GRATE, light: g.light[i], region: r.id });
    g.flags[i] &= ~(F.PIT | F.HAZARD); g.flags[i] |= F.BRIDGE | F.NOSPAWN; g.hazType[i] = 0;
    walk.add(i);
  };
  // central platform (solid, pit-wall sides) with a pump column
  for (let z = cz; z < cz + 3; z++) for (let x = cx; x < cx + 3; x++) {
    const i = g.idx(x, z);
    g.open(x, z, r.floor, g.ceil[i], { floorTex: TS.FLOOR3, wallTex: TS.PITWALL, light: g.light[i], region: r.id });
    g.flags[i] &= ~(F.PIT | F.HAZARD); g.hazType[i] = 0; g.flags[i] |= F.NOSPAWN;
    walk.add(i);
  }
  deco.box(cx + 0.9, r.floor, cz + 0.9, cx + 2.1, r.floor + 1.8, cz + 2.1, { side: TS.MACHINE, top: TS.METAL }, { solid: true });
  deco.box(cx + 1.25, r.floor + 1.8, cz + 1.25, cx + 1.75, r.floor + r.ceilH, cz + 1.75, TS.PIPE, { faces: FACE.SIDES });
  // 2-wide bridges from the platform to the four sides
  for (let x = x0; x < cx; x++) for (const z of [cz + 1, cz + 2]) deck(x, z);
  for (let x = cx + 3; x < x0 + w; x++) for (const z of [cz, cz + 1]) deck(x, z);
  for (let z = z0; z < cz; z++) for (const x of [cx, cx + 1]) deck(x, z);
  for (let z = cz + 3; z < z0 + h; z++) for (const x of [cx + 1, cx + 2]) deck(x, z);
  // brick columns rise from the sludge to the vault
  for (let z = z0 + 1; z < z0 + h - 1; z += 3) for (let x = x0 + 1; x < x0 + w - 1; x += 3) {
    const i = g.idx(x, z);
    if (!(g.flags[i] & F.PIT)) continue;
    let nb = true;
    for (let d = 0; d < 4; d++) if (!(g.flags[g.idx(x + DIR_X[d], z + DIR_Z[d])] & F.PIT)) nb = false;
    if (!nb) continue;
    deco.pillar(x + 0.5, z + 0.5, 0.6, r.floor - depth, r.floor + r.ceilH, { tex: TS.PILLAR });
  }
  deco.railEdges(walk, { style: ctx.style.railStyle });
  // outfalls pouring in from the walls
  for (let k = 0; k < 4; k++) {
    const side = k % 4;
    const fr = frameOf(r, side < 2);
    const t = rng.int(3, fr.L - 4);
    const s = side % 2 ? 0 : fr.Wd - 1;
    const [x, z] = fr.xz(t, s);
    const d = s === 0 ? OPP[fr.dirS] : fr.dirS;
    const i = g.idx(x, z);
    if (r.reserved.has(i) || g.type[g.idx(x + DIR_X[d], z + DIR_Z[d])]) continue;
    outfall(ctx, x, z, d, r.floor + rng.float(1.6, 3.2), r.floor - depth, LTEX);
  }
  r.lit = false;
}

function maintenanceRoom(ctx) {
  const { g, deco, rng, room: r } = ctx;
  // shelving on the long walls, a workbench, crates
  const fr = frameOf(r, r.w >= r.h);
  for (let t = 1; t + 3 <= fr.L - 1; t += 4) {
    if (!cellsFree(ctx, fr, t, 0, t + 3, 1)) continue;
    const [x0, z0, x1, z1] = fr.rect(t + 0.1, 0.05, t + 2.9, 0.75);
    deco.shelf(x0, z0, x1, z1, r.floor, 2.2);
    for (let k = 0; k < 3; k++) {
      const yy = r.floor + 0.55 * (k + 1);
      const [a0, b0, a1, b1] = fr.rect(t + 0.3 + k * 0.7, 0.15, t + 0.8 + k * 0.7, 0.6);
      deco.box(a0, yy, b0, a1, yy + 0.4, b1, rng.chance(0.5) ? TS.CRATE : TS.CRATE2, { uv: 'fit' });
    }
  }
  const t = Math.floor(fr.L / 2) - 1;
  if (cellsFree(ctx, fr, t, fr.Wd - 1, t + 2, fr.Wd)) {
    const [x0, z0] = fr.xz(t, fr.Wd - 1);
    deco.table(Math.min(x0, fr.xz(t + 1, fr.Wd - 1)[0]) + 0.1, Math.min(z0, fr.xz(t + 1, fr.Wd - 1)[1]) + 0.1, r.floor, fr.alongX ? 1.8 : 0.8, fr.alongX ? 0.8 : 1.8, TS.METAL);
  }
  for (let k = 0; k < 2; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
    if (rectFree(ctx, x, z, 2, 2, 0)) deco.crateStack(x + 1, z + 1, r.floor);
  }
}

// ======================================================================
// SUBWAY
// ======================================================================
function subwaySkin(theme) {
  return {
    name: 'subway',
    rail: 'metal',
    style: { hazards: ['water', 'spikes'], wain: 1.2, crown: false, lights: 'panel', pillars: 'square', outdoor: 0 },
    lattice: (d) => ({
      ...latSize(d), P: 12, cw: 3, inset: 2, jitter: 1, drop: 0.1, loops: 0.3, junction: 0.3, branch: 0.35,
      big: [[2, 2, d >= 10 ? 2 : 1], [2, 1, 1]], bossBlock: [2, 2],
    }),
    roomSize: (n, rng, mw, mh) => {
      if (n.kind === 'junction') return { w: 5, h: 5 };
      if (n.kind === 'big' && n.iw === 2 && n.jh === 2) return { w: mw, h: rng.int(14, mh) };
      if (n.kind === 'big') return { w: mw, h: mh };
      if (n.kind === 'boss') return { w: mw, h: mh };
      return { w: rng.int(6, mw), h: rng.int(6, mh) };
    },
    deltas: [0, 0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, -3.0],
    heightRange: [-4.8, 3.6],
    allowDelta: (e, par, ch, d) => !(ch.template === 'station' && par.floor + d > 0.6),
    corridorH: 3.2,
    corridorFloor: TS.FLOOR,
    corridorWall: TS.WALL,
    pickTemplate: (n, { rng, lat }) => {
      if (n.kind === 'boss') return 'arena';
      if (n.kind === 'start') return 'concourse';
      if (n.kind === 'big' && n.iw === 2 && n.jh === 2) return 'station';
      if (n.kind === 'big') return rng.chance(0.5) ? 'concourse' : 'pumproom';
      if (n.kind === 'junction') return 'junction';
      const edge = n.j0 === 0 || n.j0 + n.jh === lat.MH;
      return rng.weighted(W8([['concourse', 2], ['stairhall', n.w >= 8 && n.h >= 8 ? 2 : 0], ['maintenance', 1.2], ['pumproom', n.w >= 8 && n.h >= 8 ? 1 : 0], ['street', edge && !lat._street ? 1.6 : 0]]), (o) => o[1])[0];
    },
    ceilH: (n, rng) => ({ station: rng.pick([6, 7]), concourse: rng.pick([4.5, 5]), stairhall: 6.5, pumproom: rng.pick([6, 7]), street: 6, junction: 4, maintenance: 4, arena: rng.pick([8, 9]) }[n.template] || 4.5),
    skyRoom: (n) => n.template === 'street',
    slots: (n) => ({
      wall: n.template === 'maintenance' || n.template === 'pumproom' ? TS.WALL2 : TS.WALL,
      floor: n.template === 'street' ? TS.SIDEWALK : n.template === 'pumproom' ? TS.FLOOR2 : TS.FLOOR,
      ceil: n.template === 'station' || n.template === 'arena' ? TS.CEIL2 : TS.CEIL,
    }),
    trimOpts: (n) => ({ wainscot: n.template === 'street' ? 0 : 1.2, crown: false }),
    corridorTrimOpts: () => ({ wainscot: 1.2, crown: false }),
    dressCorridor(ctx, e) {
      const { deco } = ctx;
      // cable conduit along the top of one wall
      const y = Math.max(e.A.floor, e.B.floor) + 2.8;
      if (!e.n) corridorBox(deco, e, 0, e.L, 0.05, 0.25, y, y + 0.18, TS.PIPE);
    },
    corridorLights(ctx, e) {
      const { g, deco } = ctx;
      const s = Math.floor(e.width / 2);
      for (let t = 1; t < e.L - 1; t += 3) {
        const i = e.cellAt(t, s);
        if (!g.type[i] || g.sky[i] || (g.flags[i] & F.DOOR)) continue;
        const [x, z] = e.xz(t, s);
        const cy = g.ceil[i];
        if (e.axis === 'x') deco.lightPanel(x + 0.1, z + 0.35, x + 0.9, z + 0.65, cy, [0.92, 1, 0.95], 5);
        else deco.lightPanel(x + 0.35, z + 0.1, x + 0.65, z + 0.9, cy, [0.92, 1, 0.95], 5);
      }
    },
    lights(ctx) { panelGrid(ctx, ctx.room.ceilH >= 6 ? 4 : 3, { long: true, color: [0.92, 1, 0.95], flicker: 0.12 }); },
    fallback: 'junction',
    templates: {
      station: subwayStation,
      concourse: subwayConcourse,
      junction(ctx) {
        const { deco, room: r } = ctx;
        const cx = r.x + r.w / 2, cz = r.z + r.h / 2;
        if (r.w >= 5 && r.h >= 5 && rectFree(ctx, Math.floor(cx) - 1, Math.floor(cz) - 1, 2, 2, 0)) deco.pillar(Math.floor(cx) + 0.5 - (r.w % 2 ? 0 : 0.5), Math.floor(cz) + 0.5 - (r.h % 2 ? 0 : 0.5), 0.7, r.floor, r.floor + r.ceilH);
        benchesAlong(ctx, 1);
        mapBoard(ctx);
      },
      stairhall(ctx) {
        ARCH_T.split(ctx);
        benchesAlong(ctx, 1);
      },
      maintenance(ctx) { maintenanceRoom(ctx); },
      pumproom(ctx) { ARCH_T.industrial(ctx); ctx.room.lit = false; },
      street(ctx) { streetExit(ctx); },
    },
    finish(ctx) { for (const n of ctx.live) if (n.template === 'street') ctx.lat._street = true; },
  };
}

function benchesAlong(ctx, max = 2) {
  const { g, deco, rng, room: r } = ctx;
  let made = 0;
  for (let k = 0; k < 12 && made < max; k++) {
    const fr = frameOf(r, rng.chance(0.5), rng.chance(0.5));
    if (fr.L < 5) continue;
    const t = rng.int(1, fr.L - 4);
    if (!cellsFree(ctx, fr, t, 0, t + 3, 1)) continue;
    const [x0, z0, x1, z1] = fr.rect(t + 0.1, 0.1, t + 2.9, 0.65);
    deco.box(x0, r.floor + 0.42, z0, x1, r.floor + 0.5, z1, TS.WOOD);
    const [a0, b0, a1, b1] = fr.rect(t + 0.1, 0.05, t + 2.9, 0.15);
    deco.box(a0, r.floor + 0.5, b0, a1, r.floor + 1.0, b1, TS.WOOD);
    for (const tt of [t + 0.3, t + 2.6]) { const [c0, d0, c1, d1] = fr.rect(tt, 0.15, tt + 0.1, 0.6); deco.box(c0, r.floor, d0, c1, r.floor + 0.42, d1, TS.METAL); }
    deco.collider(x0, r.floor, z0, x1, r.floor + 0.5, z1);
    made++;
  }
}
function mapBoard(ctx) {
  const { g, deco, rng, room: r } = ctx;
  for (let k = 0; k < 8; k++) {
    const fr = frameOf(r, rng.chance(0.5), rng.chance(0.5));
    const t = rng.int(1, Math.max(1, fr.L - 3));
    const [x, z] = fr.xz(t, 0);
    if (!inRoom(r, x, z) || r.reserved.has(g.idx(x, z))) continue;
    fr.box(deco, t + 0.1, 0, t + 1.9, 0.06, r.floor + 1.1, r.floor + 2.3, TS.SCREEN, { uv: 'fit', emissive: 0.6 });
    fr.box(deco, t, 0, t + 2, 0.08, r.floor + 1.0, r.floor + 1.1, TS.TRIM);
    return;
  }
}

function subwayStation(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const fr = frameOf(r, r.w >= r.h);
  const { L, Wd } = fr;
  const band = Wd >= 14 ? 6 : 3;
  const b0 = Math.floor((Wd - band) / 2);
  if (b0 < 3) throw new Error('station too narrow');
  // longest run of t with a reserve-free track band
  let best = [0, -1], run0 = 0;
  for (let t = 0; t <= L; t++) {
    const ok = t < L && !anyReserved(ctx, fr, t, b0 - 1, t + 1, b0 + band + 1);
    if (!ok) { if (t - 1 - run0 > best[1] - best[0]) best = [run0, t - 1]; run0 = t + 1; }
  }
  const [pt0, pt1] = best;
  if (pt1 - pt0 + 1 < 10) throw new Error('station: no room for tracks');
  const pitY = r.floor - 1.2;
  // track bed
  for (let t = pt0; t <= pt1; t++) for (let s = b0; s < b0 + band; s++) {
    const [x, z] = fr.xz(t, s);
    const i = g.idx(x, z);
    g.open(x, z, pitY, g.ceil[i], { floorTex: TS.SIDE, wallTex: TS.PITWALL, light: g.light[i] * 0.8, region: r.id });
    g.flags[i] |= F.NOSPAWN;
  }
  // platform edge cells: pit-wall faces, yellow safety line, edge trim
  for (let t = pt0; t <= pt1; t++) for (const s of [b0 - 1, b0 + band]) {
    const [x, z] = fr.xz(t, s);
    g.wallTex[g.idx(x, z)] = TS.PITWALL;
  }
  for (const [sb, s0, s1] of [[b0, b0 - 0.45, b0 - 0.2], [b0 + band, b0 + band + 0.2, b0 + band + 0.45]]) {
    fr.box(deco, pt0, s0, pt1 + 1, s1, r.floor, r.floor + 0.012, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    fr.box(deco, pt0, sb - 0.06, pt1 + 1, sb + 0.06, r.floor - 0.08, r.floor + 0.02, TS.TRIM);
  }
  // rails + sleepers
  const tr0 = pt0 + 0.2, tr1 = pt1 + 0.8;
  for (let k = 0; k < band / 3; k++) {
    const sc = b0 + k * 3 + 1.5;
    for (const off of [-0.7, 0.7]) fr.box(deco, tr0, sc + off - 0.05, tr1, sc + off + 0.05, pitY + 0.08, pitY + 0.2, TS.METAL);
    for (let t = tr0 + 0.2; t < tr1 - 0.1; t += 0.85) fr.box(deco, t, sc - 1.05, t + 0.24, sc + 1.05, pitY, pitY + 0.08, TS.WOOD);
  }
  // maintenance stairs out of the track bed (one near each end, opposite platforms)
  const stairs = [];
  const tA = pt0 + 2, tB = pt1 - 3;
  // up to the low-s platform: climbing toward -s, lowest row at s = b0 + 1
  stairs.push(...fr.stairsS(deco, b0 + 1, tA, 2, -1, pitY, r.floor, { rise: 0.6, light: r.light, region: r.id }));
  stairs.push(...fr.stairsS(deco, b0 + band - 2, tB, 2, +1, pitY, r.floor, { rise: 0.6, light: r.light, region: r.id }));
  for (const i of stairs) g.ceil[i] = r.floor + r.ceilH;
  // pillars along both platforms, benches and signs on the back walls
  const pw = b0;   // platform width
  if (pw >= 4) {
    for (let t = pt0 + 2; t < pt1 - 1; t += 4) for (const s of [b0 - 2, b0 + band + 1]) {
      const [x, z] = fr.xz(t, s);
      if (!isFree(ctx, x, z)) continue;
      deco.pillar(x + 0.5, z + 0.5, 0.6, r.floor, r.floor + r.ceilH);
    }
  }
  for (const flip of [false, true]) {
    const f2 = frameOf(r, fr.alongX, flip);
    for (let t = pt0 + 3; t + 3 < pt1; t += 7) {
      if (!cellsFree(ctx, f2, t, 0, t + 3, 1)) continue;
      const [x0, z0, x1, z1] = f2.rect(t + 0.1, 0.1, t + 2.9, 0.62);
      deco.box(x0, r.floor + 0.42, z0, x1, r.floor + 0.5, z1, TS.WOOD);
      deco.collider(x0, r.floor, z0, x1, r.floor + 0.5, z1);
      for (const tt of [t + 0.3, t + 2.6]) f2.box(deco, tt, 0.15, tt + 0.1, 0.55, r.floor, r.floor + 0.42, TS.METAL);
      // backlit station sign above the bench
      f2.box(deco, t - 0.5, 0, t + 3.5, 0.06, r.floor + 2.3, r.floor + 3.0, TS.SCREEN, { uv: 'fit', emissive: 0.7 });
    }
  }
  // tunnel portals at the ends of the track bed
  for (const [tEnd, sgn] of [[pt0, -1], [pt1, 1]]) {
    if (tEnd !== (sgn < 0 ? 0 : L - 1)) {
      // the bed stops inside the room: buffer stop
      for (let k = 0; k < band / 3; k++) {
        const sc = b0 + k * 3 + 1.5;
        const tt = sgn < 0 ? tEnd + 0.1 : tEnd + 0.5;
        fr.box(deco, tt, sc - 1, tt + 0.4, sc + 1, pitY, pitY + 1.0, { side: TS.METAL, top: TS.METAL }, { solid: true });
        fr.box(deco, tt + 0.1, sc - 0.15, tt + 0.3, sc + 0.15, pitY + 1.0, pitY + 1.2, TS.LIGHT, { emissive: 1, uv: 'fit' });
      }
      continue;
    }
    const dirOut = sgn < 0 ? OPP[fr.dirT] : fr.dirT;
    let ok = true;
    const cells = [];
    for (let k = 1; k <= 2 && ok; k++) for (let s = b0 - 1; s <= b0 + band; s++) {
      const [bx, bz] = fr.xz(tEnd, s);
      const x = bx + DIR_X[dirOut] * k, z = bz + DIR_Z[dirOut] * k;
      if (!g.in(x, z) || g.type[g.idx(x, z)] || x < 2 || z < 2 || x >= g.w - 2 || z >= g.h - 2) { ok = false; break; }
      for (let d = 0; d < 4; d++) {
        const j = g.idx(x + DIR_X[d], z + DIR_Z[d]);
        if (g.type[j] && g.region[j] !== r.id) ok = false;
      }
      if (s >= b0 && s < b0 + band) cells.push([x, z]);
    }
    if (!ok) continue;
    for (const [x, z] of cells) {
      g.open(x, z, pitY, r.floor + 2.4, { floorTex: TS.SIDE, ceilTex: TS.CEIL, wallTex: TS.PITWALL, light: 0.12, region: r.id });
      g.flags[g.idx(x, z)] |= F.NOSPAWN;
    }
    // signal lamps on the portal
    const [px, pz] = fr.xz(tEnd, b0);
    deco.light(px + 0.5 + DIR_X[dirOut] * 0.8, pitY + 2, pz + 0.5 + DIR_Z[dirOut] * 0.8, [1, 0.2, 0.15], 3);
    fr.box(deco, sgn < 0 ? tEnd - 0.05 : tEnd + 0.95, b0 - 0.4, sgn < 0 ? tEnd + 0.05 : tEnd + 1.05, b0 - 0.1, r.floor + 1.6, r.floor + 1.9, TS.LIGHT, { emissive: 1, uv: 'fit' });
  }
  // lights: long panels over each platform, dimmer over the tracks
  for (let t = 1; t < L - 1; t += 3) for (const s of [Math.floor(b0 / 2), b0 + band + Math.floor((Wd - b0 - band) / 2)]) {
    const [x, z] = fr.xz(t, s);
    const cy = r.floor + r.ceilH;
    if (fr.alongX) deco.lightPanel(x + 0.05, z + 0.35, x + 0.95, z + 0.65, cy, [0.92, 1, 0.95], 6);
    else deco.lightPanel(x + 0.35, z + 0.05, x + 0.65, z + 0.95, cy, [0.92, 1, 0.95], 6);
  }
  // ceiling beams across the hall
  for (let t = 2; t < L - 1; t += 4) fr.box(deco, t + 0.35, 0, t + 0.65, Wd, r.floor + r.ceilH - 0.5, r.floor + r.ceilH, TS.BEAM, { faces: FACE.SIDES | FACE.BOTTOM });
  r.lit = true;
}

function subwayConcourse(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const fr = frameOf(r, r.w >= r.h);
  // feature floor strip, pillar grid, ticket barrier line with a booth
  for (let t = 0; t < fr.L; t++) for (let s = Math.floor(fr.Wd / 2) - 1; s <= Math.floor(fr.Wd / 2); s++) {
    const [x, z] = fr.xz(t, s);
    const i = g.idx(x, z);
    if (g.type[i] && !(g.flags[i] & F.STAIR)) g.floorTex[i] = TS.FLOOR3;
  }
  if (fr.Wd >= 8 && fr.L >= 8) {
    for (let t = 2; t < fr.L - 2; t += 4) for (const s of [2, fr.Wd - 3]) {
      const [x, z] = fr.xz(t, s);
      if (isFree(ctx, x, z)) deco.pillar(x + 0.5, z + 0.5, 0.6, r.floor, r.floor + r.ceilH);
    }
  }
  // turnstile row across the room at mid t (gaps between the gates)
  const tm = Math.floor(fr.L / 2);
  if (fr.L >= 7 && !anyReserved(ctx, fr, tm, 0, tm + 1, fr.Wd)) {
    for (let s = 1; s < fr.Wd - 1; s++) {
      if (s % 2 === 0) continue;
      const [x, z] = fr.xz(tm, s);
      if (!isFree(ctx, x, z)) continue;
      fr.box(deco, tm + 0.25, s + 0.42, tm + 0.75, s + 0.58, r.floor, r.floor + 0.95, { side: TS.METAL, top: TS.METAL }, { solid: true, shots: false });
      fr.box(deco, tm + 0.3, s + 0.4, tm + 0.7, s + 0.6, r.floor + 0.95, r.floor + 1.0, TS.LIGHT, { emissive: 0.8, uv: 'fit' });
    }
  }
  // ticket booth in a corner
  for (const [t, s] of [[1, 1], [fr.L - 3, fr.Wd - 3], [1, fr.Wd - 3], [fr.L - 3, 1]]) {
    if (!cellsFree(ctx, fr, t, s, t + 2, s + 2, 0)) continue;
    fr.box(deco, t + 0.1, s + 0.1, t + 1.9, s + 1.9, r.floor, r.floor + 1.0, { side: TS.PANEL, top: TS.METAL }, { solid: true });
    fr.box(deco, t + 0.15, s + 0.15, t + 1.85, s + 1.85, r.floor + 1.0, r.floor + 2.1, { side: TS.GLASS, top: TS.METAL }, { emissive: 0.2 });
    fr.box(deco, t, s, t + 2, s + 2, r.floor + 2.1, r.floor + 2.35, TS.METAL);
    break;
  }
  benchesAlong(ctx, 2);
  mapBoard(ctx);
}

function streetExit(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const fr = frameOf(r, r.w >= r.h);
  // road down the middle, sidewalks either side
  const road0 = Math.max(1, Math.floor(fr.Wd / 2) - 2), road1 = Math.min(fr.Wd - 1, road0 + 4);
  for (let t = 0; t < fr.L; t++) for (let s = road0; s < road1; s++) {
    const [x, z] = fr.xz(t, s);
    const i = g.idx(x, z);
    if (r.reserved.has(i)) continue;
    g.floorTex[i] = TS.ROAD;
    if (!fr.alongX) g.flags[i] |= F.UVROT;
  }
  const cs = (road0 + road1) / 2;
  for (let t = 0.5; t < fr.L - 1; t += 3) fr.box(deco, t, cs - 0.06, t + 1.6, cs + 0.06, r.floor + 0.004, r.floor + 0.02, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
  // parked car, lamps, planters / barriers on the sidewalks
  const ct = rng.int(1, Math.max(1, fr.L - 4));
  if (cellsFree(ctx, fr, ct, road0, ct + 3, road0 + 2, 0)) {
    const [x0, z0] = fr.rect(ct, road0 + 0.2, ct + 2.5, road0 + 1.4);
    deco.car(x0, z0, r.floor, fr.alongX, { length: 2.4, tex: TS.METAL });
  }
  for (let t = 1; t < fr.L - 1; t += 5) for (const s of [road0 - 0.6, road1 + 0.6]) {
    const [x, z] = fr.xz(t, Math.floor(s));
    if (!isFree(ctx, x, z)) continue;
    const [wx, wz] = fr.alongX ? [fr.tLine(t + 0.5), fr.sLine(s)] : [fr.sLine(s), fr.tLine(t + 0.5)];
    deco.streetLamp(wx, wz, r.floor, { height: 4.4, armX: fr.alongX ? 0 : (s < cs ? 0.6 : -0.6), armZ: fr.alongX ? (s < cs ? 0.6 : -0.6) : 0, radius: 9 });
  }
  for (let k = 0; k < 3; k++) {
    const t = rng.int(0, fr.L - 2), s = rng.chance(0.5) ? 0 : fr.Wd - 2;
    if (!cellsFree(ctx, fr, t, s, t + 2, s + 2, 0)) continue;
    const [x0, z0] = fr.rect(t, s, t + 2, s + 2);
    deco.planter(x0 + 0.1, z0 + 0.1, r.floor, 1.8, 1.8);
  }
  // skyscrapers: the solid mass around the street rises as tall facades
  const facades = [TS.FACADE, TS.FACADE2, TS.FACADE3];
  for (let z = r.z - 3; z <= r.z + r.h + 2; z++) for (let x = r.x - 3; x <= r.x + r.w + 2; x++) {
    if (!g.in(x, z) || x < 1 || z < 1 || x >= g.w - 1 || z >= g.h - 1) continue;
    const i = g.idx(x, z);
    if (g.type[i]) continue;
    const side = x < r.x ? 0 : x >= r.x + r.w ? 1 : z < r.z ? 2 : 3;
    const blk = Math.floor((side < 2 ? z : x) / 5);
    g.wallTex[i] = facades[(blk + side) % 3];
    g.floorTex[i] = TS.ROOF;
    g.floor[i] = Math.max(g.floor[i] === g.wallTop ? 0 : g.floor[i], r.floor + 14 + ((blk * 7 + side * 5) % 4) * 4);
  }
  r.lit = true;
}

// ======================================================================
// PRISON
// ======================================================================
function prisonSkin(theme) {
  return {
    name: 'prison',
    rail: 'metal',
    style: { hazards: ['spikes', 'spikes', 'poison'], wain: 1.1, crown: false, lights: 'panel', pillars: 'square', outdoor: 0 },
    lattice: (d) => ({
      ...latSize(d), P: 12, cw: 3, inset: 2, bigInset: 1, jitter: 1, drop: 0.1, loops: 0.3, junction: 0.25, branch: 0.35,
      big: [[2, 2, d >= 9 ? 2 : 1], [2, 1, 1], [1, 2, 1]], bossBlock: [2, 2],
    }),
    roomSize: (n, rng, mw, mh) => n.kind === 'junction' ? { w: 5, h: 5 } : n.kind === 'room' || n.kind === 'start' ? { w: rng.int(7, mw), h: rng.int(7, mh) } : { w: mw, h: mh },
    deltas: [0, 0, 0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4],
    heightRange: [-3.6, 3.6],
    corridorH: 3.2,
    corridorFloor: TS.FLOOR,
    corridorWall: TS.WALL,
    pickTemplate: (n, { rng, lat }) => {
      if (n.kind === 'boss') return 'arena';
      if (n.kind === 'start') return 'guard';
      if (n.kind === 'big' && n.iw === 2 && n.jh === 2) return 'cellblock';
      if (n.kind === 'big') { if (!lat._yard) { lat._yard = true; return 'yard'; } return rng.chance(0.5) ? 'mess' : 'cellblock'; }
      if (n.kind === 'junction') return 'checkpoint';
      return rng.weighted(W8([['solitary', 2], ['mess', 1.5], ['guard', 1], ['showers', 1.2], ['hole', n.w >= 9 && n.h >= 9 ? 1.4 : 0], ['storage', 0.8]]), (o) => o[1])[0];
    },
    ceilH: (n, rng) => ({ cellblock: rng.pick([8, 9]), yard: 8, mess: 4.5, guard: 4, solitary: 3.6, showers: 3.6, hole: 6, checkpoint: 3.6, storage: 4.5, arena: 9 }[n.template] || 4),
    skyRoom: (n) => n.template === 'yard',
    slots: (n) => ({
      wall: n.template === 'cellblock' || n.template === 'solitary' ? TS.WALL : n.template === 'showers' ? TS.WALL2 : TS.WALL,
      floor: n.template === 'yard' ? TS.SIDEWALK : n.template === 'showers' ? TS.FLOOR3 : TS.FLOOR,
      ceil: n.template === 'cellblock' || n.template === 'arena' ? TS.CEIL2 : TS.CEIL,
    }),
    trimOpts: (n) => ({ wainscot: n.template === 'yard' ? 0 : 1.1, crown: false }),
    corridorTrimOpts: () => ({ wainscot: 1.1, crown: false }),
    dressCorridor(ctx, e) {
      const { deco } = ctx;
      // barred gate frames across the corridor
      if (e.L >= 6 && !e.n) {
        const t = Math.floor(e.L / 2);
        const y = e.A.floor, top = y + 3.0;
        corridorBox(deco, e, t + 0.4, t + 0.6, 0, 0.18, y, top, TS.METAL, { faces: FACE.SIDES });
        corridorBox(deco, e, t + 0.4, t + 0.6, e.width - 0.18, e.width, y, top, TS.METAL, { faces: FACE.SIDES });
        corridorBox(deco, e, t + 0.4, t + 0.6, 0, e.width, top - 0.25, top, TS.METAL);
      }
      const y = Math.max(e.A.floor, e.B.floor) + 2.85;
      if (!e.n) corridorBox(deco, e, 0, e.L, e.width - 0.3, e.width - 0.08, y - 0.11, y + 0.11, TS.PIPE);
    },
    corridorLights(ctx, e) {
      const { g, deco } = ctx;
      for (let t = 1; t < e.L - 1; t += 5) {
        const [x, z] = e.xz(t, 0);
        const i = g.idx(x, z);
        if (!g.type[i] || (g.flags[i] & (F.STAIR | F.DOOR))) continue;
        const d = e.axis === 'x' ? 3 : 1;
        deco.wallLight(x, z, d, g.floor[i] + 2.2, [1, 0.92, 0.75], { radius: 5.5, flicker: ctx.rng.chance(0.15) });
      }
    },
    lights(ctx) { panelGrid(ctx, ctx.room.ceilH >= 6 ? 4 : 3, { color: [1, 0.96, 0.85], flicker: 0.1 }); },
    fallback: 'plain',
    templates: {
      cellblock: prisonCellblock,
      yard: prisonYard,
      mess: prisonMess,
      solitary(ctx) { cellRows(ctx, 2, 2); },
      guard(ctx) {
        const { g, deco, rng, room: r } = ctx;
        if (r.w >= 7 && r.h >= 7) ARCH_T.control(ctx); else wallConsoles(ctx, 2);
        // weapons locker
        const fr = frameOf(r, r.w >= r.h, true);
        for (let t = 1; t + 2 < fr.L; t += 3) {
          if (!cellsFree(ctx, fr, t, 0, t + 2, 1)) continue;
          const [x0, z0, x1, z1] = fr.rect(t + 0.1, 0.05, t + 1.9, 0.6);
          deco.shelf(x0, z0, x1, z1, r.floor, 2.0);
          break;
        }
      },
      checkpoint(ctx) {
        const { deco, room: r } = ctx;
        const fr = frameOf(r, r.w >= r.h);
        // glass guard booth in one corner
        if (cellsFree(ctx, fr, 0, 0, 2, 2, 0)) {
          fr.box(deco, 0.1, 0.1, 1.9, 1.9, r.floor, r.floor + 1.0, { side: TS.PANEL, top: TS.METAL }, { solid: true });
          fr.box(deco, 0.15, 0.15, 1.85, 1.85, r.floor + 1.0, r.floor + 2.2, { side: TS.GLASS, top: TS.METAL }, { emissive: 0.2 });
          fr.box(deco, 0, 0, 2, 2, r.floor + 2.2, r.floor + 2.4, TS.METAL);
        }
      },
      showers(ctx) { prisonShowers(ctx); },
      hole(ctx) {
        ARCH_T.pitroom({ ...ctx, style: { ...ctx.style, hazards: ['spikes'] } });
        ctx.room.lit = false;
      },
      storage(ctx) { maintenanceRoom(ctx); },
    },
  };
}

// a row of barred cells against the low-s wall; returns cells used
function cellRow(ctx, fr, depthC, widthC, y, o = {}) {
  const { g, deco, rng, room: r } = ctx;
  const out = { interiors: [], fronts: 0 };
  const pitch = widthC + 1;
  for (let t = 0; t + pitch <= fr.L; t += pitch) {
    // cell occupies t+1 .. t+widthC, partitions at t and t+pitch
    if (anyReserved(ctx, fr, t, 0, t + pitch + 1, depthC + 1)) continue;
    let ok = true;
    for (let tt = t; tt <= Math.min(fr.L - 1, t + pitch); tt++) for (let s = 0; s < depthC; s++) {
      const [x, z] = fr.xz(tt, s);
      const i = g.idx(x, z);
      if (!g.type[i] || Math.abs(g.floor[i] - y) > 0.01 || (g.flags[i] & (F.STAIR | F.PIT | F.OBSTACLE))) ok = false;
    }
    if (!ok) continue;
    for (const tt of [t, t + pitch]) {
      if (tt >= fr.L) continue;
      for (let s = 0; s < depthC; s++) { const [x, z] = fr.xz(tt, s); g.solid(x, z, y + 4, TS.WALL); }
    }
    const open = rng.chance(o.openChance ?? 0.5);
    const doorT = t + 1 + rng.int(0, widthC - 1);
    // bars across the front (s = depthC boundary), a gap where the door stands open
    for (let tt = t + 1; tt <= t + widthC; tt++) {
      const [x, z] = fr.xz(tt, depthC - 1);
      if (open && tt === doorT) {
        // swung-open barred door against the partition
        fr.box(deco, tt + 0.02, depthC + 0.02, tt + 0.1, depthC + 0.9, y, y + 2.4, TS.RAIL, { faces: FACE.SIDES | FACE.TOP });
        continue;
      }
      fr.railS(deco, depthC, tt, tt + 1, y, { style: 'iron', height: 2.5 });
      g.setEdge(x, z, fr.dirS, true);
    }
    // lintel over the bars
    fr.box(deco, t + 1, depthC - 0.12, t + 1 + widthC, depthC + 0.08, y + 2.5, y + 2.75, TS.METAL);
    // bunk + toilet
    const [bx0, bz0, bx1, bz1] = fr.rect(t + 1.05, 0.08, t + 1.75, Math.min(depthC - 0.3, 2.0));
    deco.box(bx0, y, bz0, bx1, y + 0.45, bz1, TS.METAL, { solid: true });
    deco.box(bx0 + 0.04, y + 0.45, bz0 + 0.04, bx1 - 0.04, y + 0.58, bz1 - 0.04, TS.CARPET);
    if (widthC >= 2) {
      const [tx0, tz0, tx1, tz1] = fr.rect(t + widthC + 0.35, 0.1, t + widthC + 0.85, 0.55);
      deco.box(tx0, y, tz0, tx1, y + 0.42, tz1, TS.METAL);
    }
    for (let tt = t + 1; tt <= t + widthC; tt++) for (let s = 0; s < depthC; s++) {
      const [x, z] = fr.xz(tt, s);
      const i = g.idx(x, z);
      g.floorTex[i] = TS.FLOOR;
      if (!open) g.flags[i] |= F.NOSPAWN;
      out.interiors.push(i);
    }
    out.fronts++;
  }
  return out;
}
function cellRows(ctx, depthC, widthC) {
  const { room: r } = ctx;
  const alongX = r.w >= r.h;
  let made = 0;
  for (const flip of [false, true]) {
    const fr = frameOf(r, alongX, flip);
    if (fr.Wd < depthC * 2 + 3) { if (flip) break; }
    made += cellRow(ctx, fr, depthC, widthC, r.floor).fronts;
  }
  if (!made) throw new Error('no room for cells');
}

function prisonCellblock(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const up = 3.0, n = 5;
  for (const [alongX, flip] of rng.shuffle([[r.w >= r.h, false], [r.w >= r.h, true], [r.w < r.h, false], [r.w < r.h, true]])) {
    const fr = frameOf(r, alongX, flip);
    if (fr.Wd < 14 || fr.L < 12) continue;
    // gallery strip: upper cells (3 deep) + catwalk (2) at the high-s side; stair lanes in front of it
    const gs0 = fr.Wd - 5;
    if (anyReserved(ctx, fr, 0, gs0 - 2, fr.L, fr.Wd)) continue;
    // stairs: climb along +t at lanes [gs0-2, gs0), landing at t = ts + n
    const ts = rng.chance(0.5) ? 1 : fr.L - 2 - n;
    const tops = [];
    const upper = new Set();
    for (let t = 0; t < fr.L; t++) for (let s = gs0; s < fr.Wd; s++) {
      const [x, z] = fr.xz(t, s);
      const i = g.idx(x, z);
      g.floor[i] = r.floor + up;
      g.floorTex[i] = s < gs0 + 2 ? TS.GRATE : TS.FLOOR;
      g.wallTex[i] = TS.PANEL;
      upper.add(i);
    }
    const dirSign = ts === 1 ? 1 : -1;
    const tStart = ts === 1 ? 1 : fr.L - 2;
    const landT = tStart + dirSign * n;
    for (let s = gs0 - 2; s < gs0; s++) {
      const [x, z] = fr.xz(landT, s);
      const i = g.idx(x, z);
      g.floor[i] = r.floor + up; g.floorTex[i] = TS.GRATE; g.wallTex[i] = TS.PANEL;
      upper.add(i); tops.push(i);
    }
    const stairCells = fr.stairsT(deco, tStart, gs0 - 2, 2, dirSign, r.floor, r.floor + up, { rise: up / n, light: r.light, region: r.id });
    for (const i of stairCells) g.ceil[i] = r.floor + r.ceilH;
    // upper cells behind the catwalk (cellRow works on the low-s wall: use a flipped frame)
    const fu = frameOf(r, alongX, !flip);
    cellRow(ctx, fu, 3, 2, r.floor + up, { openChance: 0.55 });
    deco.railEdges(upper, { style: ctx.style.railStyle });
    // fake lower-tier cell fronts on the gallery face
    for (let t = 0; t + 3 <= fr.L; t += 3) {
      if (t <= Math.max(tStart, landT) && t + 3 > Math.min(tStart, landT)) continue;
      for (let b = t + 0.3; b < t + 2.7; b += 0.22) fr.box(deco, b, gs0 - 0.12, b + 0.05, gs0 - 0.07, r.floor, r.floor + 2.5, TS.RAIL, { faces: FACE.SIDES });
      fr.box(deco, t + 0.2, gs0 - 0.14, t + 2.8, gs0 - 0.05, r.floor + 2.5, r.floor + 2.7, TS.METAL);
      fr.box(deco, t + 0.2, gs0 - 0.14, t + 2.8, gs0 - 0.05, r.floor, r.floor + 0.1, TS.METAL);
    }
    // ground cells along the opposite wall
    cellRow(ctx, fr, 3, 2, r.floor, { openChance: 0.5 });
    // tables in the atrium
    for (let t = 3; t < fr.L - 3; t += 4) {
      const s = Math.floor((4 + gs0 - 2) / 2) - 1;
      if (!cellsFree(ctx, fr, t, s, t + 2, s + 2, 0)) continue;
      const [x0, z0] = fr.rect(t, s, t + 2, s + 2);
      deco.table(x0 + 0.3, z0 + 0.5, r.floor, 1.4, 1.0, TS.METAL);
    }
    // skylight strip and caged lamps
    for (let t = 2; t < fr.L - 1; t += 4) {
      const s = Math.floor(gs0 / 2);
      const [x, z] = fr.xz(t, s);
      deco.lightPanel(x + 0.1, z + 0.1, x + 0.9, z + 0.9, r.floor + r.ceilH, [1, 0.96, 0.85], 8);
    }
    r.lit = true;
    return;
  }
  throw new Error('cellblock does not fit');
}

function prisonYard(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const fr = frameOf(r, r.w >= r.h);
  // basketball court lines
  const cx = r.x + r.w / 2, cz = r.z + r.h / 2;
  const hw = Math.min(r.w, r.h) / 2 - 2;
  if (hw >= 3) {
    const y = r.floor + 0.004, t = 0.012;
    deco.box(cx - hw, y, cz - hw, cx + hw, y + t, cz - hw + 0.1, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    deco.box(cx - hw, y, cz + hw - 0.1, cx + hw, y + t, cz + hw, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    deco.box(cx - hw, y, cz - hw, cx - hw + 0.1, y + t, cz + hw, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    deco.box(cx + hw - 0.1, y, cz - hw, cx + hw, y + t, cz + hw, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    deco.box(cx - 0.05, y, cz - hw, cx + 0.05, y + t, cz + hw, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
  }
  // guard tower in a free corner: 3x3 platform at +3.6 with a stair flight
  const up = 3.6, n = 6;
  for (const flip of rng.shuffle([false, true])) {
    const f2 = frameOf(r, fr.alongX, flip);
    for (const atEnd of rng.shuffle([false, true])) {
      const t0 = atEnd ? f2.L - 3 : 0;
      const st = atEnd ? f2.L - 4 : 3;
      if (!cellsFree(ctx, f2, Math.min(t0, st - (atEnd ? n - 1 : 0)), 0, Math.max(t0 + 3, st + (atEnd ? 1 : n)), 3, 0)) continue;
      const set = new Set();
      for (let t = t0; t < t0 + 3; t++) for (let s = 0; s < 3; s++) {
        const [x, z] = f2.xz(t, s);
        const i = g.idx(x, z);
        g.floor[i] = r.floor + up; g.floorTex[i] = TS.WOOD; g.wallTex[i] = TS.WALL2; set.add(i);
      }
      // flight on lanes s=0..1 climbing toward the tower
      const tStart = atEnd ? f2.L - 4 - (n - 1) : 3 + (n - 1);
      f2.stairsT(deco, tStart, 0, 2, atEnd ? 1 : -1, r.floor, r.floor + up, { rise: up / n, light: r.light, region: r.id, sky: true });
      deco.railEdges(set, { style: 'metal' });
      // roof on posts + searchlight
      const [x0, z0, x1, z1] = f2.rect(t0, 0, t0 + 3, 3);
      for (const [px, pz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.2, z0 + 0.1], [x0 + 0.1, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) deco.box(px, r.floor + up, pz, px + 0.1, r.floor + up + 2.4, pz + 0.1, TS.METAL, { faces: FACE.SIDES });
      deco.box(x0 - 0.2, r.floor + up + 2.4, z0 - 0.2, x1 + 0.2, r.floor + up + 2.65, z1 + 0.2, TS.ROOF);
      deco.box((x0 + x1) / 2 - 0.25, r.floor + up + 1.0, (z0 + z1) / 2 - 0.25, (x0 + x1) / 2 + 0.25, r.floor + up + 1.4, (z0 + z1) / 2 + 0.25, TS.LIGHT, { emissive: 1, uv: 'fit' });
      deco.light((x0 + x1) / 2, r.floor + up + 1.2, (z0 + z1) / 2, [1, 0.98, 0.9], 12);
      flip; break;
    }
    if ([...ctx.cells].some((i) => Math.abs(g.floor[i] - (r.floor + up)) < 0.01)) break;
  }
  // chain-link fences dividing part of the yard (3-wide gaps)
  const fs = Math.floor(fr.Wd / 2);
  for (let t = 2; t < fr.L - 2; t++) {
    if (t % 6 < 3) continue;
    const [x, z] = fr.xz(t, fs);
    const [x2, z2] = fr.xz(t, fs - 1);
    if (!isFree(ctx, x, z) || !isFree(ctx, x2, z2)) continue;
    fr.railS(deco, fs, t, t + 1, r.floor, { style: 'iron', height: 2.8 });
    g.setEdge(x2, z2, fr.dirS, true);
  }
  // weight benches and bleachers
  for (let k = 0; k < 3; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
    if (!rectFree(ctx, x, z, 2, 2, 0)) continue;
    deco.box(x + 0.3, r.floor, z + 0.8, x + 1.7, r.floor + 0.45, z + 1.2, TS.METAL, { solid: true });
    deco.box(x + 0.2, r.floor + 0.9, z + 0.6, x + 1.8, r.floor + 0.95, z + 1.4, TS.METAL);
  }
  // razor wire along the wall tops
  for (const [x0, z0, x1, z1] of [[r.x - 1, r.z - 1, r.x + r.w + 1, r.z], [r.x - 1, r.z + r.h, r.x + r.w + 1, r.z + r.h + 1], [r.x - 1, r.z, r.x, r.z + r.h], [r.x + r.w, r.z, r.x + r.w + 1, r.z + r.h]]) {
    const top = r.floor + 8;
    deco.box(x0 + 0.35, top, z0 + 0.35, x1 - 0.35, top + 0.4, z1 - 0.35, TS.RAIL, { faces: FACE.SIDES | FACE.TOP });
  }
  for (const [x, z] of [[r.x + 0.6, r.z + r.h - 0.6], [r.x + r.w - 0.6, r.z + 0.6]]) deco.streetLamp(x, z, r.floor, { height: 6, armX: 0, armZ: 0, radius: 10 });
  r.lit = true;
}

function prisonMess(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const fr = frameOf(r, r.w >= r.h);
  // serving counter along the low-s wall
  let counter = false;
  for (let t = 1; t + 4 <= fr.L - 1; t++) {
    if (!cellsFree(ctx, fr, t, 0, t + 4, 1)) continue;
    fr.box(deco, t, 0.1, t + 4, 0.8, r.floor, r.floor + 1.0, { side: TS.METAL, top: TS.METAL, ...(fr.alongX ? (fr.flip ? { nz: TS.MACHINE } : { pz: TS.MACHINE }) : (fr.flip ? { nx: TS.MACHINE } : { px: TS.MACHINE })) }, { solid: true });
    fr.box(deco, t, 0, t + 4, 0.08, r.floor + 1.3, r.floor + 2.1, TS.SCREEN, { emissive: 0.5, uv: 'fit' });
    counter = true; break;
  }
  // rows of tables with benches
  for (let s = counter ? 3 : 2; s + 2 <= fr.Wd - 1; s += 3) for (let t = 1; t + 3 <= fr.L - 1; t += 4) {
    if (!cellsFree(ctx, fr, t, s, t + 3, s + 2, 0)) continue;
    const [x0, z0, x1, z1] = fr.rect(t + 0.2, s + 0.65, t + 2.8, s + 1.35);
    deco.table(x0, z0, r.floor, x1 - x0, z1 - z0, TS.METAL);
    for (const [a, b] of [[s + 0.2, s + 0.5], [s + 1.5, s + 1.8]]) {
      const [c0, d0, c1, d1] = fr.rect(t + 0.2, a, t + 2.8, b);
      deco.box(c0, r.floor + 0.4, d0, c1, r.floor + 0.46, d1, TS.METAL);
    }
  }
}

function prisonShowers(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const fr = frameOf(r, r.w >= r.h);
  // shallow water on the tiles, drains, shower heads along both long walls
  for (let k = 0; k < 3; k++) {
    const w = rng.int(2, 3), h = rng.int(2, 3);
    const x = rng.int(r.x + 1, r.x + r.w - w - 1), z = rng.int(r.z + 1, r.z + r.h - h - 1);
    if (rectFree(ctx, x, z, w, h, 0)) makePit(ctx, x, z, w, h, 'water', 0.12);
  }
  for (const flip of [false, true]) {
    const f2 = frameOf(r, fr.alongX, flip);
    f2.box(deco, 0, 0.05, f2.L, 0.25, r.floor + 2.3, r.floor + 2.45, TS.PIPE);
    for (let t = 1; t < f2.L - 1; t += 2) {
      f2.box(deco, t + 0.45, 0.05, t + 0.55, 0.45, r.floor + 2.2, r.floor + 2.3, TS.METAL);
      f2.box(deco, t + 0.38, 0.38, t + 0.62, 0.52, r.floor + 2.12, r.floor + 2.22, TS.METAL);
      // low tiled stall dividers
      if (t + 2 < f2.L - 1 && cellsFree(ctx, f2, t + 1, 0, t + 2, 2, 0)) f2.box(deco, t + 1.45, 0, t + 1.55, 1.2, r.floor, r.floor + 1.8, TS.PANEL, { solid: false });
    }
  }
  for (let t = 2; t < fr.L - 1; t += 4) {
    const [x, z] = fr.xz(t, Math.floor(fr.Wd / 2));
    deco.box(x + 0.3, r.floor, z + 0.3, x + 0.7, r.floor + 0.02, z + 0.7, TS.GRATE, { uv: 'fit', faces: FACE.TOP });
  }
}

// ======================================================================
// DATA CORE
// ======================================================================
function dataSkin(theme) {
  return {
    name: 'data',
    rail: 'glass',
    style: { hazards: ['poison', 'poison', 'water'], wain: 1.0, crown: false, lights: 'panel', pillars: 'square', outdoor: 0, family: 'tech' },
    lattice: (d) => ({
      ...latSize(d), P: 12, cw: 3, inset: 2, jitter: 1, drop: 0.1, loops: 0.35, junction: 0.3, branch: 0.35,
      big: [[2, 2, 1], [2, 1, d >= 8 ? 2 : 1], [1, 2, 1]], bossBlock: [2, 2],
    }),
    roomSize: (n, rng, mw, mh) => n.kind === 'junction' ? { w: 5, h: 5 } : n.kind === 'room' || n.kind === 'start' ? { w: rng.int(7, mw), h: rng.int(7, mh) } : { w: mw, h: mh },
    deltas: [0, 0, 0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4],
    heightRange: [-3.6, 3.6],
    corridorH: 3.4,
    corridorFloor: TS.FLOOR2,
    corridorWall: TS.WALL2,
    pickTemplate: (n, { rng }) => {
      if (n.kind === 'boss') return 'arena';
      if (n.kind === 'start') return 'terminal';
      if (n.kind === 'big' && n.iw === 2 && n.jh === 2) return rng.chance(0.65) ? 'core' : 'serverhall';
      if (n.kind === 'big') return 'serverhall';
      if (n.kind === 'junction') return 'node';
      return rng.weighted(W8([['serverhall', 3], ['coolant', n.w >= 9 && n.h >= 9 ? 1.6 : 0], ['terminal', 1.2], ['cablevault', n.w >= 9 && n.h >= 9 ? 1.2 : 0]]), (o) => o[1])[0];
    },
    ceilH: (n, rng) => ({ core: rng.pick([10, 12]), serverhall: n.kind === 'big' ? 6 : rng.pick([4.5, 5]), coolant: 7, cablevault: 7, terminal: 4, node: 4, arena: 10 }[n.template] || 4.5),
    slots: (n) => ({
      wall: n.template === 'terminal' || n.template === 'core' ? TS.WALL : TS.WALL2,
      floor: n.template === 'serverhall' ? TS.FLOOR2 : n.template === 'core' || n.template === 'arena' ? TS.FLOOR3 : TS.FLOOR,
      ceil: n.ceilH >= 6 ? TS.CEIL2 : TS.CEIL,
    }),
    trimOpts: () => ({ wainscot: 1.0, crown: false, wainTex: TS.PANEL }),
    corridorTrimOpts: () => ({ wainscot: 1.0, crown: false, wainTex: TS.PANEL }),
    dressCorridor(ctx, e) {
      const { g, deco } = ctx;
      // glowing conduit down the middle of the floor (flat parts), cable tray overhead
      const mid = e.width / 2;
      for (let t = 0; t < e.L; t++) {
        const i = e.cellAt(t, Math.floor(mid));
        if (!g.type[i] || (g.flags[i] & (F.STAIR | F.DOOR))) continue;
        corridorBox(deco, e, t, t + 1, mid - 0.08, mid + 0.08, g.floor[i], g.floor[i] + 0.015, TS.NEON, { emissive: 1, uv: 'fit', faces: FACE.TOP });
      }
      if (!e.n) {
        const y = e.A.floor + 3.0;
        corridorBox(deco, e, 0, e.L, 0.1, 0.7, y, y + 0.12, TS.PIPE);
        // wall screens
        for (let t = 2; t < e.L - 2; t += 6) corridorBox(deco, e, t + 0.1, t + 0.9, e.width - 0.05, e.width, e.A.floor + 1.2, e.A.floor + 2.0, TS.SCREEN, { emissive: 0.8, uv: 'fit' });
      }
    },
    corridorLights(ctx, e) {
      const { g, deco } = ctx;
      for (let t = 1; t < e.L - 1; t += 4) {
        const [x, z] = e.xz(t, Math.floor(e.width / 2));
        const i = g.idx(x, z);
        if (!g.type[i] || (g.flags[i] & F.DOOR)) continue;
        deco.light(x + 0.5, g.floor[i] + 0.4, z + 0.5, [0.3, 0.8, 1], 4.5);
      }
    },
    lights(ctx) { panelGrid(ctx, 4, { long: true, color: [0.75, 0.9, 1] }); },
    fallback: 'node',
    templates: {
      serverhall: dataServerHall,
      core(ctx) {
        ARCH_T.reactor(ctx);
        dataScreens(ctx, 4);
        ctx.room.lit = false;
      },
      coolant(ctx) {
        ARCH_T.pitroom(ctx);
        dataScreens(ctx, 2);
        ctx.room.lit = false;
      },
      cablevault(ctx) { ARCH_T.industrial(ctx); ctx.room.lit = false; },
      terminal(ctx) {
        const { room: r } = ctx;
        if (r.w >= 7 && r.h >= 7) ARCH_T.control(ctx); else wallConsoles(ctx, 2);
      },
      node(ctx) {
        const { deco, room: r } = ctx;
        const cx = Math.floor(r.x + r.w / 2), cz = Math.floor(r.z + r.h / 2);
        if (rectFree(ctx, cx, cz, 1, 1, 0)) {
          deco.box(cx + 0.15, r.floor, cz + 0.15, cx + 0.85, r.floor + r.ceilH, cz + 0.85, { side: TS.SCREEN, top: TS.METAL, bottom: TS.METAL }, { emissive: 0.7, solid: true });
          deco.light(cx + 0.5, r.floor + 1.5, cz + 0.5, [0.3, 0.9, 1], 6, { pulse: true });
        }
        // neon cross on the floor
        deco.box(r.x, r.floor, cz + 0.42, r.x + r.w, r.floor + 0.015, cz + 0.58, TS.NEON, { emissive: 1, uv: 'fit', faces: FACE.TOP });
        deco.box(cx + 0.42, r.floor, r.z, cx + 0.58, r.floor + 0.015, r.z + r.h, TS.NEON, { emissive: 1, uv: 'fit', faces: FACE.TOP });
      },
    },
  };
}

function dataScreens(ctx, n) {
  const { g, deco, rng, room: r } = ctx;
  for (let k = 0, made = 0; k < 20 && made < n; k++) {
    const fr = frameOf(r, rng.chance(0.5), rng.chance(0.5));
    const t = rng.int(1, fr.L - 3);
    const [x, z] = fr.xz(t, 0);
    if (r.reserved.has(g.idx(x, z))) continue;
    fr.box(deco, t + 0.1, 0, t + 1.9, 0.06, r.floor + 1.4, r.floor + 2.6, TS.SCREEN, { emissive: 0.85, uv: 'fit' });
    made++;
  }
}

function dataServerHall(ctx) {
  const { g, deco, rng, room: r } = ctx;
  const fr = frameOf(r, r.w >= r.h);
  const hgt = Math.min(2.6, r.ceilH - 1.2);
  const rows = [];
  for (let s = 2; s <= fr.Wd - 3; s += 3) rows.push(s);
  if (!rows.length) throw new Error('hall too narrow');
  const front = fr.alongX ? ['pz', 'nz'] : ['px', 'nx'];
  let racks = 0;
  for (const s of rows) {
    let t = 2;
    while (t < fr.L - 2) {
      const len = Math.min(rng.int(4, 6), fr.L - 2 - t);
      let placed = 0;
      for (let k = 0; k < len; k++) {
        const [x, z] = fr.xz(t + k, s);
        if (!isFree(ctx, x, z)) continue;
        const tex = { side: TS.METAL, top: TS.METAL, [front[0]]: TS.MACHINE, [front[1]]: TS.MACHINE };
        fr.box(deco, t + k + 0.04, s + 0.12, t + k + 0.96, s + 0.88, r.floor, r.floor + hgt, tex, { solid: true, s: 1 });
        placed++;
      }
      if (placed) {
        racks += placed;
        // cable tray over the row
        if (r.ceilH >= hgt + 1.0) fr.box(deco, t, s + 0.3, t + len, s + 0.7, r.floor + hgt + 0.45, r.floor + hgt + 0.55, TS.PIPE);
      }
      t += len + 2;
    }
  }
  if (racks < 4) throw new Error('no racks');
  // neon conduits along the aisles
  for (let s = 0; s < fr.Wd; s++) {
    if (rows.includes(s)) continue;
    if (!(rows.includes(s - 1) && s + 1 < fr.Wd && rows.includes(s + 2)) && !(rows.includes(s + 1) && rows.includes(s - 2))) continue;
    const sc = rows.includes(s - 1) ? s + 1 : s;
    if (sc !== s) continue;
    fr.box(deco, 1, s - 0.04, fr.L - 1, s + 0.04, r.floor, r.floor + 0.015, TS.NEON, { emissive: 1, uv: 'fit', faces: FACE.TOP });
  }
  // vent grates
  for (let k = 0; k < 4; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    if (!isFree(ctx, x, z)) continue;
    deco.box(x + 0.1, r.floor, z + 0.1, x + 0.9, r.floor + 0.02, z + 0.9, TS.GRATE, { uv: 'fit', faces: FACE.TOP });
  }
  // cool blue-white light panels over the aisles
  for (let t = 2; t < fr.L - 1; t += 3) for (const s of rows) {
    const sa = s + 1;
    if (sa >= fr.Wd) continue;
    const [x, z] = fr.xz(t, sa);
    const cy = r.floor + r.ceilH;
    deco.box(x + 0.1, cy - 0.05, z + 0.1, x + 0.9, cy, z + 0.9, TS.LIGHT, { emissive: 1, uv: 'fit', faces: FACE.BOTTOM | FACE.SIDES });
    deco.light(x + 0.5, cy - 0.4, z + 0.5, [0.7, 0.88, 1], 5);
  }
  r.lit = true;
}

// ======================================================================
// THE BACK ROOMS
// ======================================================================
function backroomsSkin(theme) {
  return {
    name: 'backrooms',
    rail: 'metal',
    style: { hazards: ['water'], wain: 0, crown: false, lights: 'panel', pillars: 'square', outdoor: 0, family: 'domestic' },
    wallTop: 4,
    lattice: (d) => ({
      MW: clamp(8 + Math.floor(d / 4), 8, 12), MH: clamp(6 + Math.floor(d / 6), 6, 9), P: 8, cw: 3, inset: 1, bigInset: 1, jitter: 0, bandMargin: 1,
      drop: 0.08, loops: 0.55, junction: 0.15, branch: 0.6,
      big: [[3, 3, d >= 6 ? 1 : 0], [2, 2, 2 + Math.floor(d / 10)], [2, 1, 2], [1, 2, 2]], bossBlock: [2, 2],
      tagEdge: (e, nodes, rng) => { e.wantWidth = rng.pick([3, 4, 4, 5]); },
    }),
    roomSize: (n, rng, mw, mh) => n.kind === 'junction' ? { w: 4, h: 4 } : n.kind === 'room' || n.kind === 'start' ? { w: rng.int(mw - 1, mw), h: rng.int(mh - 1, mh) } : { w: mw, h: mh },
    deltas: [0, 0, 0, 0, 0, 0, 0.6, -0.6, -1.2, 1.2],
    heightRange: [-2.4, 2.4],
    corridorH: 2.75,
    corridorFloor: TS.FLOOR,
    corridorWall: TS.WALL,
    pickTemplate: (n, { rng }) => {
      if (n.kind === 'boss') return 'arena';
      if (n.kind === 'start') return 'office';
      if (n.kind === 'big') return rng.weighted(W8([['pillars', 3], ['office', 2], ['sinkhole', n.iw * n.jh >= 4 ? 1.2 : 0.5], ['poolroom', 1], ['stairwell', 1]]), (o) => o[1])[0];
      if (n.kind === 'junction') return 'office';
      return rng.weighted(W8([['office', 5], ['flooded', 0.9], ['dark', 0.8], ['stairwell', 0.6]]), (o) => o[1])[0];
    },
    ceilH: (n, rng) => ({ poolroom: 5, stairwell: 5.5, sinkhole: 4.5, arena: 5, pillars: rng.pick([2.75, 3.25, 4]) }[n.template] || (rng.chance(0.15) ? 3.25 : 2.75)),
    slots: (n) => ({ wall: n.template === 'poolroom' ? TS.WALL2 : TS.WALL, floor: n.template === 'poolroom' ? TS.FLOOR3 : TS.FLOOR, ceil: TS.CEIL }),
    trimOpts: () => ({ wainscot: 0, crown: false }),
    corridorTrimOpts: () => ({ wainscot: 0, crown: false }),
    corridorLights(ctx, e) {
      if (e.L < 3) return;
      const { g, deco } = ctx;
      const [x, z] = e.xz(Math.floor(e.L / 2), Math.floor(e.width / 2));
      const i = g.idx(x, z);
      if (!g.type[i] || (g.flags[i] & F.DOOR)) return;
      deco.lightPanel(x + 0.2, z + 0.2, x + 0.8, z + 0.8, g.ceil[i], [1, 0.97, 0.8], 5);
    },
    lights(ctx) { panelGrid(ctx, 3, { offset: 1, color: [1, 0.97, 0.8], flicker: ctx.room.template === 'dark' ? 0.6 : 0.12, radius: 5 }); },
    fallback: 'office',
    templates: {
      office(ctx) {
        const { g, deco, rng, room: r } = ctx;
        // wallpaper partition stubs (thin, ceiling-high) make nooks without 1-wide gaps
        if (r.w >= 7 && r.h >= 7) {
          const n = Math.floor(r.area / 40);
          for (let k = 0; k < n; k++) {
            const alongX = rng.chance(0.5);
            const len = rng.int(2, 3);
            const x = rng.int(r.x + 2, r.x + r.w - 3 - (alongX ? len : 0)), z = rng.int(r.z + 2, r.z + r.h - 3 - (alongX ? 0 : len));
            if (!rectFree(ctx, x - 2, z - 2, (alongX ? len : 1) + 4, (alongX ? 1 : len) + 4, 0)) continue;
            if (alongX) deco.box(x, r.floor, z + 0.45, x + len, r.floor + r.ceilH, z + 0.55, { side: TS.WALL, top: TS.TRIM }, { solid: true });
            else deco.box(x + 0.45, r.floor, z, x + 0.55, r.floor + r.ceilH, z + len, { side: TS.WALL, top: TS.TRIM }, { solid: true });
          }
        }
        // the odd abandoned office chair / box
        for (let k = 0; k < 2; k++) {
          const x = rng.int(r.x, r.x + r.w - 1), z = rng.int(r.z, r.z + r.h - 1);
          if (!rectFree(ctx, x, z, 1, 1, 0) || !rng.chance(0.4)) continue;
          if (rng.chance(0.5)) deco.crate(x + 0.5, z + 0.5, r.floor, 0.55, TS.CRATE);
          else { deco.box(x + 0.25, r.floor + 0.4, z + 0.25, x + 0.75, r.floor + 0.48, z + 0.75, TS.CARPET); deco.box(x + 0.45, r.floor, z + 0.45, x + 0.55, r.floor + 0.4, z + 0.55, TS.METAL); deco.box(x + 0.25, r.floor + 0.48, z + 0.7, x + 0.75, r.floor + 1.0, z + 0.76, TS.CARPET); }
        }
      },
      pillars(ctx) {
        const { deco, room: r } = ctx;
        for (let z = r.z + 2; z < r.z + r.h - 2; z += 4) for (let x = r.x + 2; x < r.x + r.w - 2; x += 4) {
          if (!rectFree(ctx, x, z, 1, 1, 0)) continue;
          deco.box(x + 0.15, r.floor, z + 0.15, x + 0.85, r.floor + r.ceilH, z + 0.85, { side: TS.WALL, top: TS.WALL }, { solid: true });
          deco.box(x + 0.1, r.floor, z + 0.1, x + 0.9, r.floor + 0.18, z + 0.9, TS.TRIM);
        }
      },
      flooded(ctx) {
        const { room: r } = ctx;
        makePit(ctx, r.x, r.z, r.w, r.h, 'water', 0.15);
      },
      dark(ctx) {
        const { g, room: r } = ctx;
        for (const i of ctx.cells) g.light[i] *= 0.35;
        TEMPLATES_BR_OFFICE(ctx);
      },
      sinkhole(ctx) {
        const { g, deco, rng, room: r } = ctx;
        const w = Math.max(3, r.w - 6), h = Math.max(3, r.h - 6);
        const x0 = r.x + Math.floor((r.w - w) / 2), z0 = r.z + Math.floor((r.h - h) / 2);
        if (!rectFree(ctx, x0 - 1, z0 - 1, w + 2, h + 2, 0)) throw new Error('sinkhole blocked');
        makePit(ctx, x0, z0, w, h, 'water', 3.2);
        // a plank bridge across the hole
        const walk = new Set(ctx.cells.filter((i) => !(g.flags[i] & F.PIT)));
        const bz = z0 + Math.floor(h / 2);
        for (const i of bridge(ctx, x0, bz, x0 + w - 1, bz, r.floor, 2)) { g.floorTex[i] = TS.WOOD; g.wallTex[i] = TS.WOOD; walk.add(i); }
        deco.railEdges(walk, { style: 'wood' });
        // torn carpet edge
        for (let x = x0; x < x0 + w; x++) for (const z of [z0 - 1, z0 + h]) { const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & F.BRIDGE)) g.wallTex[i] = TS.PITWALL; }
      },
      poolroom(ctx) {
        const { g, deco, rng, room: r } = ctx;
        // white tiles, pools of still water, tiled pillars
        const w = Math.max(3, r.w - 4), h = Math.max(3, r.h - 4);
        const x0 = r.x + 2, z0 = r.z + 2;
        for (let z = z0; z < z0 + h; z += 4) for (let x = x0; x < x0 + w; x += 5) {
          const pw = Math.min(3, x0 + w - x), ph = Math.min(2, z0 + h - z);
          if (pw >= 2 && ph >= 2 && rectFree(ctx, x, z, pw, ph, 0)) makePit(ctx, x, z, pw, ph, 'water', 0.6);
        }
        for (let z = r.z + 1; z < r.z + r.h - 1; z += 4) for (let x = r.x + 3; x < r.x + r.w - 1; x += 5) {
          if (!rectFree(ctx, x, z, 1, 1, 0)) continue;
          deco.box(x + 0.2, r.floor, z + 0.2, x + 0.8, r.floor + r.ceilH, z + 0.8, TS.FLOOR3, { solid: true });
        }
      },
      stairwell(ctx) { ARCH_T.split(ctx); },
    },
  };
}
function TEMPLATES_BR_OFFICE(ctx) { /* dark rooms stay bare */ }

// ======================================================================
// DREAM MAZE
// ======================================================================
function dreamSkin(theme) {
  return {
    name: 'dream',
    fill: 'void',
    voidY: -28,
    rail: 'glass',
    jumpGap: 2,
    style: { hazards: ['water', 'spikes'], wain: 0, crown: false, lights: 'panel', pillars: 'column', outdoor: 1, family: 'gothic' },
    lattice: (d) => ({
      ...latSize(d), P: 13, cw: 3, inset: 2, bigInset: 2, jitter: 2, drop: 0.15, loops: 0.4, junction: 0.2, branch: 0.4,
      big: [[2, 2, 1], [2, 1, 1], [1, 2, 1]], bossBlock: [2, 2],
      tagEdge: (e, nodes, rng) => { if (e.loop && rng.chance(0.45)) e.wantJump = true; },
    }),
    roomSize: (n, rng, mw, mh) => n.kind === 'junction' ? { w: 5, h: 5 } : n.kind === 'room' || n.kind === 'start' ? { w: rng.int(6, mw), h: rng.int(6, mh) } : { w: mw - rng.int(0, 2), h: mh - rng.int(0, 2) },
    deltas: [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, -3.0],
    heightRange: [-4.2, 6],
    corridorFloor: TS.FLOOR,
    pickTemplate: (n, { rng }) => {
      if (n.kind === 'boss') return 'arena';
      if (n.kind === 'start') return 'garden';
      if (n.kind === 'big') return rng.weighted(W8([['hedge', 3], ['chess', 2], ['escher', 2]]), (o) => o[1])[0];
      if (n.kind === 'junction') return rng.chance(0.5) ? 'doors' : 'garden';
      return rng.weighted(W8([['hedge', n.w >= 8 && n.h >= 8 ? 2 : 0], ['chess', 2], ['fountain', 1.2], ['doors', 1.2], ['escher', n.w >= 9 && n.h >= 9 ? 1.4 : 0], ['garden', 1]]), (o) => o[1])[0];
    },
    ceilH: () => 6,
    slots: (n) => ({ floor: n.kind === 'boss' ? TS.FLOOR3 : TS.FLOOR, side: TS.SIDE, wall: TS.WALL }),
    trims: false,
    carveCorridor(ctx, e) {
      e.deckSide = TS.TRIM;
      e.floorTex = TS.FLOOR;
      // jump gap: a 2-cell hole in a flat loop bridge (rails stay off its edges)
      if (e.wantJump && !e.n && e.L >= 5) {
        const g0 = Math.floor(e.L / 2) - 1;
        e.gapT = [g0, g0 + 1];
      }
      dreamCorridor(ctx, e);
    },
    corridorLights(ctx, e) {
      const { deco } = ctx;
      if (e.L < 4) return;
      const t = Math.floor(e.L / 2);
      const [x, z] = e.xz(t, 0);
      const y = Math.max(e.A.floor, e.B.floor) + 3.4;
      deco.box(x + 0.35, y, z + 0.35, x + 0.65, y + 0.3, z + 0.65, TS.LIGHT, { emissive: 1, uv: 'fit' });
      deco.light(x + 0.5, y, z + 0.5, [1, 0.85, 1], 6);
    },
    lights(ctx) {
      const { deco, rng, room: r } = ctx;
      // floating lanterns
      for (let k = 0; k < Math.max(1, Math.floor(r.area / 40)); k++) {
        const x = r.x + rng.float(1, r.w - 1), z = r.z + rng.float(1, r.h - 1);
        const y = r.floor + rng.float(2.8, 4.2);
        deco.box(x - 0.18, y, z - 0.18, x + 0.18, y + 0.36, z + 0.18, TS.LIGHT, { emissive: 1, uv: 'fit' });
        deco.box(x - 0.22, y + 0.36, z - 0.22, x + 0.22, y + 0.42, z + 0.22, TS.TRIM);
        deco.light(x, y, z, [1, 0.9, 0.75], 7);
      }
      r.lit = true;
    },
    finish(ctx) {
      const { g, deco, rng, roomCells, live, nodes, used } = ctx;
      // guard rails on every platform edge over the void
      const allow = new Set();
      for (const e of used) if (e.gapCells) for (const i of e.gapCells) allow.add(i);
      for (const n of live) deco.railEdges(roomCells.get(n.id).filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.VOID))), { style: ctx.style.railStyle, allow });
      // drifting decorations in the empty slots: cubes, inverted stairs, rings
      for (const n of nodes) {
        if (!n.dead) continue;
        const X0 = 2 + n.i0 * ctx.lat.P, Z0 = 2 + n.j0 * ctx.lat.P, P = ctx.lat.P;
        const cx = X0 + P / 2 + rng.float(-2, 2), cz = Z0 + P / 2 + rng.float(-2, 2), y = rng.float(-2, 6);
        const s = rng.float(1.2, 2.6);
        deco.box(cx - s / 2, y, cz - s / 2, cx + s / 2, y + s, cz + s / 2, rng.pick([TS.WALL, TS.WALL2, TS.SIDE]));
        for (let k = 0; k < 5; k++) deco.box(cx - 1 + k * 0.4, y + s + 1.5 + k * 0.3, cz + s, cx - 0.6 + k * 0.4, y + s + 1.6 + k * 0.3, cz + s + 1, TS.STAIR);
      }
    },
    fallback: 'garden',
    templates: {
      hedge: dreamHedge,
      chess(ctx) {
        const { deco, rng, room: r } = ctx;
        const n = Math.max(3, Math.floor(r.area / 18));
        for (let k = 0, made = 0; k < n * 4 && made < n; k++) {
          const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
          if (!rectFree(ctx, x - 1, z - 1, 3, 3, 0)) continue;
          chessPiece(ctx, x + 0.5, z + 0.5, r.floor, rng.pick(['pawn', 'rook', 'king', 'bishop']), rng.chance(0.5) ? TS.WALL2 : TS.SIDE);
          made++;
        }
      },
      escher(ctx) {
        ARCH_T.split(ctx);
        const { deco, rng, room: r } = ctx;
        // an upside-down flight hanging in the air
        const x = r.x + rng.float(1, r.w - 4), z = r.z + rng.float(1, r.h - 3), y = r.floor + 6.5;
        for (let k = 0; k < 6; k++) deco.box(x + k * 0.5, y - k * 0.3, z, x + k * 0.5 + 0.5, y - k * 0.3 + 0.3, z + 2, TS.STAIR);
      },
      fountain(ctx) {
        const { deco, room: r } = ctx;
        const cx = Math.floor(r.x + r.w / 2) - 1, cz = Math.floor(r.z + r.h / 2) - 1;
        if (!rectFree(ctx, cx - 1, cz - 1, 4, 4, 0)) throw new Error('fountain blocked');
        makePit(ctx, cx - 1, cz - 1, 4, 4, 'water', 0.35);
        deco.box(cx + 0.6, r.floor - 0.35, cz + 0.6, cx + 1.4, r.floor + 1.2, cz + 1.4, TS.TRIM, { solid: true });
        chessPiece(ctx, cx + 1, cz + 1, r.floor + 1.2, 'king', TS.WALL2, false);
        deco.light(cx + 1, r.floor + 2, cz + 1, [0.6, 0.8, 1], 7, { pulse: true });
      },
      doors(ctx) {
        const { deco, rng, room: r } = ctx;
        // freestanding door frames that lead nowhere
        for (let k = 0, made = 0; k < 20 && made < 3; k++) {
          const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
          if (!rectFree(ctx, x - 1, z - 1, 3, 3, 0)) continue;
          const alongX = rng.chance(0.5);
          const [a0, b0, a1, b1] = alongX ? [x, z + 0.42, x + 1, z + 0.58] : [x + 0.42, z, x + 0.58, z + 1];
          deco.box(a0 + (alongX ? 0.1 : 0), r.floor, b0 + (alongX ? 0 : 0.1), a1 - (alongX ? 0.1 : 0), r.floor + 2.3, b1 - (alongX ? 0 : 0.1), TS.DOOR, { uv: 'fit', solid: true });
          deco.box(a0 - (alongX ? 0.05 : 0.04), r.floor, b0 - (alongX ? 0.04 : 0.05), a1 + (alongX ? 0.05 : 0.04), r.floor + 2.5, b1 + (alongX ? 0.04 : 0.05), TS.TRIM, { faces: FACE.TOP });
          made++;
        }
      },
      garden(ctx) {
        const { deco, rng, room: r } = ctx;
        for (let k = 0; k < Math.floor(r.area / 25) + 1; k++) {
          const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
          if (!rectFree(ctx, x, z, 2, 2, 1)) continue;
          if (rng.chance(0.5)) deco.planter(x, z, r.floor, 2, 2);
          else {
            deco.box(x + 0.85, r.floor, z + 0.85, x + 1.15, r.floor + 2.2, z + 1.15, TS.WOOD, { solid: true });
            deco.box(x, r.floor + 2.0, z, x + 2, r.floor + 3.2, z + 2, TS.FOLIAGE);
          }
        }
      },
    },
  };
}

function dreamCorridor(ctx, e) {
  const { g } = ctx;
  if (e.gapT) {
    // carve, then punch the gap back into void before the rails go on
    const gap = e.gapT;
    const origRail = ctx.deco.railEdges;
    ctx.deco.railEdges = () => {};
    carveCorridor(ctx, e);
    ctx.deco.railEdges = origRail;
    e.gapCells = [];
    for (let t = gap[0]; t <= gap[1]; t++) for (let s = 0; s < e.width; s++) {
      const i = e.cellAt(t, s);
      const [x, z] = e.xz(t, s);
      g.open(x, z, ctx.voidY, 3, { sky: true, light: g.light[i], flags: F.VOID, floorTex: TS.VOID, wallTex: TS.SIDE, region: -9 });
      g.flags[i] = F.VOID;
      e.gapCells.push(i);
    }
    e.allowRail = new Set(e.gapCells);
    const walk = e.cells.filter((i) => !(g.flags[i] & (F.PIT | F.VOID | F.STAIR)) && g.type[i]);
    ctx.deco.railEdges(walk, { style: ctx.style.railStyle, allow: e.allowRail });
    return;
  }
  carveCorridor(ctx, e);
}

function chessPiece(ctx, cx, cz, y, kind, tex, solid = true) {
  const { deco } = ctx;
  const lay = (r, h) => { deco.box(cx - r, y, cz - r, cx + r, y + h, cz + r, tex); y += h; };
  const y0 = y;
  lay(0.5, 0.3); lay(0.38, 0.2);
  if (kind === 'pawn') { lay(0.24, 1.0); lay(0.34, 0.12); lay(0.28, 0.5); }
  else if (kind === 'rook') { lay(0.3, 1.5); lay(0.42, 0.5); for (const [dx, dz] of [[-0.3, -0.3], [0.2, -0.3], [-0.3, 0.2], [0.2, 0.2]]) deco.box(cx + dx, y, cz + dz, cx + dx + 0.1, y + 0.25, cz + dz + 0.1, tex); }
  else if (kind === 'bishop') { lay(0.26, 1.6); lay(0.34, 0.14); lay(0.24, 0.6); lay(0.1, 0.25); }
  else { lay(0.3, 2.0); lay(0.42, 0.18); lay(0.3, 0.6); deco.box(cx - 0.06, y, cz - 0.06, cx + 0.06, y + 0.5, cz + 0.06, TS.TRIM); deco.box(cx - 0.2, y + 0.25, cz - 0.06, cx + 0.2, y + 0.37, cz + 0.06, TS.TRIM); }
  if (solid) deco.collider(cx - 0.5, y0, cz - 0.5, cx + 0.5, y, cz + 0.5);
}

function dreamHedge(ctx) {
  const { g, rng, room: r } = ctx;
  // a mini maze with 2-wide paths (pitch 3) of checker walls capped in gold
  const MWc = Math.floor((r.w + 1) / 3), MHc = Math.floor((r.h + 1) / 3);
  if (MWc < 3 || MHc < 3) throw new Error('hedge too small');
  const ox = r.x + Math.floor((r.w - (MWc * 3 - 1)) / 2), oz = r.z + Math.floor((r.h - (MHc * 3 - 1)) / 2);
  const wall = new Set();
  // start with every lattice wall, then knock through along a random spanning tree
  for (let z = oz - 1; z < oz + MHc * 3; z++) for (let x = ox - 1; x < ox + MWc * 3; x++) {
    if (!inRoom(r, x, z)) continue;
    const lx = x - ox, lz = z - oz;
    if (((lx + 3) % 3 === 2 || (lz + 3) % 3 === 2) && lx >= 0 && lz >= 0 && lx < MWc * 3 - 1 && lz < MHc * 3 - 1) wall.add(g.idx(x, z));
  }
  const seen = new Uint8Array(MWc * MHc);
  const stack = [[rng.int(0, MWc - 1), rng.int(0, MHc - 1)]];
  seen[stack[0][1] * MWc + stack[0][0]] = 1;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [cx + dx, cz + dz, dx, dz]).filter(([x, z]) => x >= 0 && z >= 0 && x < MWc && z < MHc && !seen[z * MWc + x]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, nz, dx, dz] = rng.pick(nb);
    seen[nz * MWc + nx] = 1;
    // remove the 2 wall cells between (cx,cz) and (nx,nz)
    for (let k = 0; k < 2; k++) {
      const x = dx ? ox + cx * 3 + (dx > 0 ? 2 : -1) : ox + cx * 3 + k;
      const z = dz ? oz + cz * 3 + (dz > 0 ? 2 : -1) : oz + cz * 3 + k;
      wall.delete(g.idx(x, z));
    }
    stack.push([nx, nz]);
  }
  // extra openings so it's a maze with loops, not a single corridor
  const ws = [...wall];
  rng.shuffle(ws);
  for (const i of ws.slice(0, Math.floor(ws.length * 0.18))) wall.delete(i);
  // keep the exits and their approach clear
  for (const i of r.reserved) wall.delete(i);
  for (const i of wall) {
    const x = i % g.w, z = (i / g.w) | 0;
    if (!g.type[i] || (g.flags[i] & (F.STAIR | F.PIT))) continue;
    // lattice crossings stay pillars even when both arms are open
    g.solid(x, z, r.floor + 2.6, TS.WALL);
    g.floorTex[i] = TS.TRIM;
  }
}
