// Room templates of the mansion archetype, part 2 (see gen_mansion.js and
// mansion_rooms.js): the service wing (kitchen, the servants' back stair,
// the boot room by the garden door, the servants' hall or laundry, the
// scullery with the cellar stair), the cellars (wine cellar, the crypt under
// the rear range), the bedroom wing on the upper floor (landing hall, master
// bedroom, bedrooms, nursery, bathroom) and the secret stair in the wall.
import { Kit, TS, F, FACE, OPP, GF, UF, CF, CANDLE, FIRE, GHOST, lbox, lcol, llight, lrail, ledge, each } from './mansion_kit.js';
import { HAZ } from '../grid.js';
import * as P from './mansion_props.js';
import { outside, markWall, wallTaken, hangPainting, sconces, placeFireplace, sittingGroup, platformFace, rug, consoleTables } from './mansion_rooms.js';

const WOOD_STAIR = { floorTex: TS.STAIR, sideTex: TS.PANEL };
const STONE_STAIR = { floorTex: TS.FLOOR2, sideTex: TS.PITWALL };

// sink a rectangle into a pit (spikes / water / poison), walls of the pit in
// the pit-wall stone; the rim rails are left to the caller
export function pit(k, a0, b0, a1, b1, kind, depth) {
  const haz = kind === 'spikes' ? HAZ.SPIKES : kind === 'poison' ? HAZ.POISON : kind === 'lava' ? HAZ.LAVA : HAZ.WATER;
  const deep = depth > 1;
  const tex = kind === 'spikes' ? TS.PITWALL : kind === 'poison' ? TS.POISON : kind === 'lava' ? TS.LAVA : TS.WATER;
  each(k.fr, a0, b0, a1, b1, (a, b) => {
    if (!k.mine(a, b)) return;
    const i = k.idx(a, b), g = k.g;
    g.floor[i] = k.fl(a, b) - depth;
    g.floorTex[i] = tex; g.wallTex[i] = TS.PITWALL; g.hazType[i] = haz;
    g.flags[i] |= F.NOSPAWN | (kind === 'water' && !deep ? F.WATER : F.HAZARD) | (deep ? F.PIT : 0);
  });
  k.use(a0, b0, a1, b1);
  // rim cells: the pit walls in the pit stone
  each(k.fr, a0 - 1, b0 - 1, a1 + 1, b1 + 1, (a, b) => { if (k.mine(a, b) && !(k.g.flags[k.idx(a, b)] & (F.PIT | F.HAZARD | F.STAIR))) k.g.wallTex[k.idx(a, b)] = TS.PITWALL; });
  if (kind === 'poison' || kind === 'lava') llight(k.deco, k.fr, (a0 + a1) / 2, k.y - depth + 0.8, (b0 + b1) / 2, kind === 'lava' ? FIRE : [0.5, 1, 0.3], 6, { pulse: true });
  return k.cells(a0, b0, a1, b1);
}

export const WINGS = {
  // ---------------------------------------------------------- kitchen
  kitchen(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // the range in the chimney breast on the outer wall, a sink under a window
    const outer = outside(k, 1, D / 2) ? 1 : 0;
    k.onWall(outer, 3, 1, (p) => P.range(deco, P.sub(p, 0.1, 0, 2.9, 0.8), y, top), { want: D / 2 - 1.5 });
    k.onWall(outer, 2, 1, (p) => P.sink(deco, P.sub(p, 0.1, 0, 1.9, 0.65), y), { random: true });
    // the long work table with the pot rack over it
    const ta = Math.floor(W / 2) - 1;
    for (const b0 of [3, 4, 2]) {
      const len = Math.min(5, D - b0 - 4);
      if (len >= 3 && k.take(ta, b0, ta + 2, b0 + len)) {
        const t = P.pf(fr, ta + 0.15, b0 + 0.1, ta + 1.85, b0 + len - 0.1, 0);
        P.table(deco, t, y, { legs: 0.12 });
        P.potRack(deco, P.pf(fr, ta + 0.4, b0 + 0.4, ta + 1.6, b0 + len - 0.4, 0), y + 2.3);
        P.crocks(deco, t, y + 0.78, rng);
        break;
      }
    }
    // dresser of plates, shelves of crocks and jars, barrels, a butcher's block
    for (const ld of [0, 1, 2, 3]) {
      k.onWall(ld, 2, 1, (p) => P.shelves(deco, P.sub(p, 0.05, 0, 1.95, 0.4), y, 2.1), { random: true });
    }
    k.onWall(rng.pick([0, 2, 3]), 3, 1, (p) => { P.sideboard(deco, P.sub(p, 0.1, 0, 2.9, 0.55), y, { h: 0.9 }); P.plateRack(deco, P.sub(p, 0.2, 0, 2.8, 0.25), y + 1.2); }, { random: true });
    for (let t = 0; t < 5; t++) {
      const a = rng.int(0, W - 1), b = rng.int(0, D - 1);
      if (!k.take(a, b, a + 1, b + 1)) continue;
      if (t === 0) P.block(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y);
      else P.barrel(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 0.3, 0.8, TS.CRATE2);
    }
    // hanging herbs and lamps from the beams
    for (let b = 1; b < D; b += 3) lbox(deco, fr, 0, top - 0.35, b + 0.35, W, top, b + 0.65, TS.BEAM);
    for (let b = 3; b < D - 1; b += 5) P.lantern(deco, k.wx(W / 2, b), k.wz(W / 2, b), top - 1.1, { radius: 7 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- servants' back stair
  // a dog-leg stair in its own well: up from the kitchen door to the half
  // landing at the back, then back up to the gallery door at the upper floor
  backstair(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr, g } = k;
    const ly = y + 2.4;
    k.flight(0, 2, 2, 4, 2, y, ly, WOOD_STAIR);
    k.floorRect(0, 6, W, D, ly, { floorTex: TS.WOOD, wallTex: TS.WOOD });
    k.use(0, 6, W, D);
    k.flight(3, 3, 2, 3, 3, ly, UF, WOOD_STAIR);
    k.floorRect(2, 0, W, 3, UF, { floorTex: TS.WOOD, wallTex: TS.WOOD });
    k.use(2, 0, W, 3);
    // the newel wall between the flights
    each(fr, 2, 3, 3, 6, (a, b) => { if (k.mine(a, b)) g.solid(fr.cx(a, b), fr.cz(a, b), 13, TS.WOOD); });
    k.rail([...k.cells(2, 0, W, 3), ...k.cells(0, 6, W, D)]);
    k.use(0, 0, 2, 2);
    // a lamp on the half landing, coats on hooks by the kitchen door
    P.lantern(deco, k.wx(W / 2, 7), k.wz(W / 2, 7), Math.min(k.top, ly + 3.2) - 0.6, { radius: 6 });
    P.lantern(deco, k.wx(3.5, 1.5), k.wz(3.5, 1.5), k.top - 0.8, { radius: 6 });
    M.room.bossSpot = { a: 1, b: 1 };
  },

  // ---------------------------------------------------------- boot room by the garden door
  servpass(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco } = k;
    for (const ld of [2, 3, 1, 0]) k.onWall(ld, 2, 1, (p) => { P.bench(deco, P.sub(p, 0.1, 0, 1.9, 0.5), y); P.coatPegs(deco, P.sub(p, 0, 0, 2, 0.2), y + 1.7); }, { random: true, margin: 0 });
    for (let t = 0; t < 3; t++) { const a = rng.int(0, W - 1), b = rng.int(0, D - 1); if (k.take(a, b, a + 1, b + 1)) P.barrel(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 0.26, 0.6, TS.CRATE2); }
    P.lantern(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), k.top - 0.8, { radius: 6 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- servants' hall
  servhall(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    const alongA = W >= D, L = (alongA ? W : D) - 6, c = Math.floor(((alongA ? D : W) - 3) / 2);
    if (alongA ? k.take(3, c, 3 + L, c + 3) : k.take(c, 3, c + 3, 3 + L)) {
      const p = alongA ? P.pf(fr, 3, c, 3 + L, c + 3, 2) : P.pf(fr, c, 3, c + 3, 3 + L, 1);
      P.diningSet(deco, p, y, { bench: true, heads: false, candelabra: 1, settings: false });
    }
    placeFireplace(k, outside(k, 1, D / 2) ? 0 : 1, { portrait: false });
    // the bell board: a row of bells on a board high on a wall
    for (const ld of [2, 3, 0, 1]) if (k.onWall(ld, 3, 1, (p) => { P.bellBoard(deco, P.sub(p, 0.1, 0, 2.9, 0.15), y + 2.1); P.bench(deco, P.sub(p, 0.2, 0.05, 2.8, 0.55), y); }, { random: true })) break;
    for (const ld of [0, 1, 2, 3]) k.onWall(ld, 2, 1, (p) => P.shelves(deco, P.sub(p, 0.05, 0, 1.95, 0.4), y, 2), { random: true });
    for (let b = 1; b < D; b += 3) lbox(deco, fr, 0, top - 0.35, b + 0.35, W, top, b + 0.65, TS.BEAM);
    P.lantern(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), top - 1, { radius: 8 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- laundry
  laundry(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // the copper over its fire, wash tubs, a mangle, the drying racks hung with sheets
    k.onWall(outside(k, 1, D / 2) ? 1 : 0, 2, 1, (p) => P.copper(deco, P.sub(p, 0.1, 0.05, 1.9, 0.95), y), {});
    for (let t = 0; t < 6; t++) {
      const a = rng.int(1, W - 2), b = rng.int(1, D - 2);
      if (!k.take(a, b, a + 1, b + 1, 0)) continue;
      if (t === 0) P.mangle(deco, P.pf(fr, a, b, a + 1, b + 1, rng.pick([0, 2])), y);
      else P.barrel(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 0.4, 0.55, TS.CRATE2);
    }
    for (let b = 2; b < D - 1; b += 3) P.dryingLine(deco, fr, 1, b + 0.5, W - 1, y + 2.3, rng);
    for (const ld of [2, 3]) k.onWall(ld, 3, 1, (p) => P.table(deco, P.sub(p, 0.1, 0.05, 2.9, 0.75), y, {}), { random: true });
    for (let b = 1; b < D; b += 3) lbox(deco, fr, 0, top - 0.35, b + 0.35, W, top, b + 0.65, TS.BEAM);
    P.lantern(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), top - 1, { radius: 8 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- scullery (+ the cellar stair)
  scullery(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    const cs = k.ports((p) => p.kind === 'cellarstair')[0];
    if (cs && Math.abs(cs.h - y) > 1) {
      // the stair down to the wine cellar in a railed well against the back wall
      const [s0] = [cs.s0];
      k.flight(s0, D - 7, 3, 7, 3, cs.h, y, { floorTex: TS.FLOOR2, sideTex: TS.FACADE3 });
      k.wellRails(s0, D - 7, s0 + 3, D, y, [3]);
      k.use(s0 - 1, D - 8, s0 + 4, D);
      P.lantern(deco, k.wx(s0 + 1.5, D - 4), k.wz(s0 + 1.5, D - 4), top - 0.6, { radius: 6 });
    }
    // stone sinks and a pump along the walls, plate racks and buckets
    for (const ld of [1, 0, 2, 3]) k.onWall(ld, 2, 1, (p) => { P.sink(deco, P.sub(p, 0.1, 0, 1.9, 0.65), y); P.plateRack(deco, P.sub(p, 0.2, 0, 1.8, 0.25), y + 1.3); }, { random: true });
    for (const ld of [0, 1, 2, 3]) k.onWall(ld, 2, 1, (p) => P.shelves(deco, P.sub(p, 0.05, 0, 1.95, 0.4), y, 2), { random: true });
    for (let t = 0; t < 5; t++) { const a = rng.int(0, W - 1), b = rng.int(0, D - 1); if (k.take(a, b, a + 1, b + 1)) P.barrel(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 0.25, 0.5, TS.CRATE2); }
    const ta = rng.int(2, Math.max(2, W - 5)), tb = rng.int(2, Math.max(2, D - 9));
    if (k.take(ta, tb, ta + 3, tb + 2)) P.table(deco, P.pf(fr, ta + 0.1, tb + 0.2, ta + 2.9, tb + 1.8, 2), y, {});
    for (let b = 1; b < D; b += 3) lbox(deco, fr, 0, top - 0.35, b + 0.35, W, top, b + 0.65, TS.BEAM);
    P.lantern(deco, k.wx(W / 2, D / 3), k.wz(W / 2, D / 3), top - 1, { radius: 8 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- wine cellar
  // racks in rows with aisles, casks on cradles along the walls, a tasting
  // table; a collapsed corner opens into a spiked pit (an old trap).
  cellar(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr, g } = k;
    const cs = k.ports((p) => p.kind === 'cellarstair')[0];
    if (cs && Math.abs(cs.h - y) > 1) {
      // the stair comes down from the scullery door in the front wall
      k.flight(cs.s0, 0, 3, 7, 3, y, cs.h, STONE_STAIR);
      k.use(cs.s0 - 1, 0, cs.s0 + 4, 8);
    }
    // the spike pit: a collapsed corner away from the doors, railed off
    const corners = [[1, D - 4], [W - 4, D - 4], [W - 4, 1], [1, 1]];
    for (const [a0, b0] of rng.shuffle(corners)) {
      if (!k.free(a0 - 1, b0 - 1, a0 + 4, b0 + 4, 0) || !k.keepsPath(a0 - 1, b0 - 1, a0 + 4, b0 + 4)) continue;
      const cells = pit(k, a0, b0, a0 + 3, b0 + 3, 'spikes', 1.6);
      k.use(a0 - 1, b0 - 1, a0 + 4, b0 + 4);
      k.rail(k.cells(a0 - 1, b0 - 1, a0 + 4, b0 + 4).filter((i) => !cells.includes(i)), { style: 'wood', tex: TS.WOOD });
      P.brokenBoards(deco, fr, a0, b0, a0 + 3, b0 + 3, y, rng);
      break;
    }
    // casks on cradles along the long walls
    const alongA = W >= D;
    for (const ld of alongA ? [2, 3] : [0, 1]) {
      for (let s = 1; s + 2 <= k.wallLen(ld) - 1; s += 2) {
        const [a0, b0, a1, b1] = k.stripCells(ld, s, s + 2, 1);
        if (!k.wallClear(ld, s, s + 2, 1) || !k.take(a0, b0, a1, b1)) continue;
        const p = k.wallFrame(ld, s, s + 2, 1);
        P.cask(deco, p.px(1, 0.55), p.pz(1, 0.55), y, ld < 2, 0.45, 0.95);
      }
    }
    // rows of wine racks with aisles between
    const rows = [];
    for (let t = 3; t < (alongA ? W : D) - 3; t += 4) rows.push(t);
    for (const t of rows) {
      const len = (alongA ? D : W) - 5;
      const s0 = 2;
      if (alongA) { if (!k.take(t, s0, t + 1, s0 + len)) continue; P.wineRack(deco, P.pf(fr, t, s0, t + 0.48, s0 + len, 1), y, 2.0); P.wineRack(deco, P.pf(fr, t + 0.52, s0, t + 1, s0 + len, 0), y, 2.0); }
      else { if (!k.take(s0, t, s0 + len, t + 1)) continue; P.wineRack(deco, P.pf(fr, s0, t, s0 + len, t + 0.48, 3), y, 2.0); P.wineRack(deco, P.pf(fr, s0, t + 0.52, s0 + len, t + 1, 2), y, 2.0); }
    }
    // a tasting table with candles
    for (let tr = 0; tr < 8; tr++) {
      const a = rng.int(1, W - 3), b = rng.int(1, D - 3);
      if (!k.take(a, b, a + 2, b + 2, 0)) continue;
      const t = P.pf(fr, a + 0.2, b + 0.3, a + 1.8, b + 1.7, 2);
      P.table(deco, t, y, {});
      P.candles(deco, t.px(0.8, 0.7), t.pz(0.8, 0.7), y + 0.78, 3, { radius: 5 });
      P.bottles(deco, t, y + 0.78);
      break;
    }
    // vault ribs, cobwebbed lamps
    for (let b = 1; b < D; b += 3) lbox(deco, fr, 0, top - 0.3, b + 0.35, W, top, b + 0.65, TS.BEAM);
    for (let b = 2; b < D; b += 5) for (let a = 2; a < W; a += 6) P.lantern(deco, k.wx(a, b), k.wz(a, b), top - 0.7, { radius: 6, color: FIRE });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- crypt
  // the family vault under the rear range: squat columns carrying the vault,
  // sarcophagi in rows between them, coffins stacked in wall niches, spiked
  // oubliettes in the floor, the ossuary altar at the far end. As the boss's
  // lair the middle is a raised tomb platform.
  crypt(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    const boss = M.P.boss === M.room;
    // the central tomb platform
    const ca = Math.floor(W / 2), cb = Math.floor(D / 2);
    if (k.free(ca - 3, cb - 2, ca + 3, cb + 2)) {
      k.floorRect(ca - 3, cb - 2, ca + 3, cb + 2, y + 0.6, { floorTex: TS.FLOOR3, wallTex: TS.PILLAR });
      k.use(ca - 3, cb - 2, ca + 3, cb + 2);
      if (!boss) P.sarcophagus(deco, P.pf(fr, ca - 0.7, cb - 1.2, ca + 0.7, cb + 1.2, 2), y + 0.6, { h: 1.0 });
      else P.sarcophagus(deco, P.pf(fr, ca - 0.7, cb - 1.2, ca + 0.7, cb + 1.2, 2), y + 0.6, { h: 0.9, open: true });
      for (const [a, b] of [[ca - 2.6, cb - 1.6], [ca + 2.6, cb - 1.6], [ca - 2.6, cb + 1.6], [ca + 2.6, cb + 1.6]]) P.brazier(deco, k.wx(a, b), k.wz(a, b), y + 0.6);
    }
    // columns in two rows
    const colB = [2, D - 3];
    for (let a = 2; a < W - 2; a += 4) for (const b of colB) {
      if (!k.take(a, b, a + 1, b + 1)) continue;
      deco.pillar(k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), 0.8, y, top, { tex: TS.FACADE, trimTex: TS.PITWALL });
    }
    for (let a = 2; a < W - 2; a += 4) lbox(deco, fr, a + 0.25, top - 0.45, 0, a + 0.75, top, D, TS.PITWALL);
    for (const b of colB) lbox(deco, fr, 0, top - 0.45, b + 0.25, W, top, b + 0.75, TS.PITWALL);
    // spiked oubliettes in the floor, railed in iron
    let pits = 0;
    for (let t = 0; t < 12 && pits < (boss ? 2 : 3); t++) {
      const a0 = rng.int(1, W - 3), b0 = rng.int(1, D - 3);
      if (!k.free(a0 - 1, b0 - 1, a0 + 3, b0 + 3, 0) || !k.keepsPath(a0 - 1, b0 - 1, a0 + 3, b0 + 3)) continue;
      const cells = pit(k, a0, b0, a0 + 2, b0 + 2, 'spikes', 2.2);
      k.rail(k.cells(a0 - 1, b0 - 1, a0 + 3, b0 + 3).filter((i) => !cells.includes(i)), { style: 'iron', tex: TS.METAL });
      k.use(a0 - 1, b0 - 1, a0 + 3, b0 + 3);
      pits++;
    }
    // sarcophagi between the columns, coffins in the wall niches
    for (let a = 1; a < W - 2; a += 4) for (const b of [4, D - 7]) {
      if (b < 3 || b + 3 > D - 2 || !k.take(a, b, a + 2, b + 3, 0)) continue;
      P.sarcophagus(deco, P.pf(fr, a + 0.3, b + 0.2, a + 1.7, b + 2.8, 2), y, { effigy: rng.chance(0.6) });
    }
    for (const ld of [2, 3, 0, 1]) {
      for (let s = 1; s + 2 <= k.wallLen(ld) - 1; s += 3) {
        if (!k.wallClear(ld, s, s + 2, 1) || wallTaken(k.r, ld, s, s + 2, y, top)) continue;
        P.niches(deco, k.wallFrame(ld, s, s + 2, 0.35), y, Math.min(top - 0.5, y + 3.2), rng);
        markWall(k, ld, s, s + 2);
        const [a0, b0, a1, b1] = k.stripCells(ld, s, s + 2, 1);
        k.use(a0, b0, a1, b1);
      }
    }
    // the ossuary altar on the far wall
    k.onWall(2, 3, 1, (p) => { P.altar(deco, P.sub(p, 0.1, 0, 2.9, 0.9), y); }, {});
    for (let t = 0; t < 6; t++) { const a = rng.int(1, W - 2), b = rng.int(1, D - 2); if (k.take(a, b, a + 1, b + 1, 0)) P.candleStand(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, { h: 1.4 }); }
    llight(deco, fr, W / 2, y + 2.5, D / 2, GHOST, 10, { pulse: true });
    M.room.bossSpot = { a: ca, b: cb + 3 < D - 1 ? cb + 3 : cb - 3 };
  },

  // ---------------------------------------------------------- upper hall of the bedroom wing
  bwhall(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // a runner down the middle on the boards
    each(fr, 0, 0, W, D, (a, b) => { if (k.mine(a, b)) k.g.floorTex[k.idx(a, b)] = a === 1 ? TS.CARPET : TS.FLOOR; });
    // console tables, chairs and a clock against the walls (thin pieces only)
    for (const ld of [0, 1]) {
      for (let s = 2; s + 2 <= D - 1; s += rng.int(4, 6)) {
        if (!k.wallClear(ld, s, s + 2, 1) || !k.take(...k.stripCells(ld, s, s + 2, 1))) continue;
        const p = k.wallFrame(ld, s, s + 2, 0.45);
        if (rng.chance(0.5)) P.sideboard(deco, P.sub(p, 0.1, 0, 1.9, 0.42), y, { h: 0.85, dishes: false, candles: rng.chance(0.5) });
        else { P.chair(deco, k.wallFrame(ld, s, s + 1, 0.6), 0.5, 0.3, y); P.pedestalBust(deco, k.wx(...wc(k, ld, s + 1.5)), k.wz(...wc(k, ld, s + 1.5)), y); }
        hangPainting(k, ld, s + 1, y + 1.4, y + 2.6, 1.2);
      }
    }
    // a clock at the far end, sconces down both walls
    k.onWall(2, 1, 1, (p) => P.clock(deco, P.sub(p, 0.2, 0, 0.8, 0.45), y), { margin: 0 });
    for (const ld of [0, 1]) sconces(k, ld, y + 2.2, 4);
    for (let b = 2; b < D; b += 6) P.chandelier(deco, k.wx(1.5, b), k.wz(1.5, b), top, { r: 0.5, drop: 0.9, radius: 7 });
    M.room.bossSpot = { a: 1.5, b: D / 2 };
  },

  bedroom(M) { bedroomLike(M, 'bedroom'); },
  master(M) { bedroomLike(M, 'master'); },
  nursery(M) { bedroomLike(M, 'nursery'); },

  // ---------------------------------------------------------- bathroom
  bath(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // the tub on the far side, the washstand and the closet on the walls
    for (const ld of [0, 2, 3]) if (k.onWall(ld, 3, 2, (p) => P.bathtub(deco, P.sub(p, 0.2, 0.1, 2.8, 1.0), y), { want: k.wallLen(ld) - 4 })) break;
    for (const ld of [2, 3, 0]) if (k.onWall(ld, 2, 1, (p) => P.dresser(deco, P.sub(p, 0.2, 0, 1.8, 0.5), y, { basin: true }), { random: true })) break;
    for (const ld of [3, 2, 0]) if (k.onWall(ld, 1, 1, (p) => P.closet(deco, P.sub(p, 0.15, 0, 0.85, 0.7), y), { random: true })) break;
    for (const ld of [0, 1, 2, 3]) if (k.onWall(ld, 1, 1, (p) => P.towelRail(deco, P.sub(p, 0.1, 0, 0.9, 0.3), y), { random: true })) break;
    P.chandelier(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), top, { r: 0.45, drop: 0.8, radius: 6 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- the secret stair
  // one cell wide inside the thick wall: from the library bookcase (ground
  // floor) up to a panel in the bedroom wing's hall (upper floor)
  secret(M) {
    const k = new Kit(M, M.room), { W, D, y, deco, fr, g } = k;
    const n = Math.round((UF - y) / 0.6);
    k.floorRect(0, 0, 1, 1, UF, { floorTex: TS.FLOOR2, ceil: UF + 2.8 });
    k.flight(0, 1, 1, n, 3, y, UF, { floorTex: TS.FLOOR2, sideTex: TS.PITWALL, style: 'stone', rails: true });
    each(fr, 0, 1 + n, 1, D, (a, b) => { const i = k.idx(a, b); if (i >= 0 && g.type[i]) g.ceil[i] = Math.max(g.ceil[i], y + 2.8); });
    // a guttered candle on a ledge half way up, cobwebs, a skeleton at the foot
    P.candles(deco, k.wx(0.5, Math.min(D - 1.5, n + 1.5)), k.wz(0.5, Math.min(D - 1.5, n + 1.5)), y + 1.2, 1, { radius: 3.5 });
    llight(deco, fr, 0.5, UF + 1.5, 0.5, CANDLE, 3);
    P.cobwebs(deco, fr, 0, D - 1, y + 2.4);
    M.room.bossSpot = { a: 0.5, b: D - 1 };
  },
};

// local centre of the cell next to wall ld at along position s
function wc(k, ld, s) { return ld === 0 ? [k.W - 0.5, s] : ld === 1 ? [0.5, s] : ld === 2 ? [s, k.D - 0.5] : [s, 0.5]; }

// bedrooms: the bed's head against a side wall, wardrobe, dresser, the
// fireplace, a chest at the foot of the bed; the nursery has cots and toys
function bedroomLike(M, kind) {
  const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
  // the bed: head against the wall with the most room
  const bw = kind === 'master' ? 3 : 2, bl = kind === 'nursery' ? 2 : 3;
  let bedDone = false;
  for (const ld of rng.shuffle([2, 3, 0])) {
    if (bedDone) break;
    const L = k.wallLen(ld);
    const p = k.onWall(ld, bw + 2, bl + 1, (pp, s) => {
      const bp = P.sub(pp, 1, 0, 1 + bw, bl);
      if (kind === 'nursery') P.crib(deco, P.sub(pp, 1.1, 0.1, 2.9, 1.4), y);
      else P.bed(deco, bp, y, { posts: kind === 'master' || rng.chance(0.5) });
      // night stands
      for (const a of [0.15, bw + 1.15]) { P.table(deco, P.sub(pp, a, 0.05, a + 0.7, 0.6), y, { h: 0.6 }); P.candles(deco, pp.px(a + 0.35, 0.3), pp.pz(a + 0.35, 0.3), y + 0.6, 1, { radius: 4 }); }
      // a chest at the foot
      if (kind !== 'nursery') P.chest(deco, P.sub(pp, 1.3, bl + 0.05, bw + 0.7, bl + 0.7), y);
      hangPainting(k, ld, s + (bw + 2) / 2, y + 1.9, y + 3.0, 1.4);
    }, { want: (L - bw - 2) / 2, margin: 1 });
    if (p) bedDone = true;
  }
  rug(k, 2, 2, W - 2, D - 2);
  // wardrobe(s), a dresser with its mirror
  for (let t = 0; t < (kind === 'master' ? 2 : 1); t++) for (const ld of rng.shuffle([0, 1, 2, 3])) if (k.onWall(ld, 2, 1, (p) => P.wardrobe(deco, P.sub(p, 0.1, 0, 1.9, 0.62), y), { random: true })) break;
  for (const ld of rng.shuffle([0, 1, 2, 3])) if (k.onWall(ld, 2, 1, (p) => P.dresser(deco, P.sub(p, 0.15, 0, 1.85, 0.5), y), { random: true })) break;
  if (kind === 'master' || rng.chance(0.6)) placeFireplace(k, rng.pick([0, 2, 3]), { portrait: kind === 'master' });
  if (kind === 'master') { sittingGroup(k, rng.int(1, W - 4), rng.int(1, D - 3), rng.pick([2, 3])); for (const ld of rng.shuffle([0, 2, 3])) if (k.onWall(ld, 2, 1, (p) => P.desk(deco, P.sub(p, 0.1, 0.05, 1.9, 0.75), y), { random: true })) break; }
  if (kind === 'nursery') {
    for (let t = 0; t < 4; t++) {
      const a = rng.int(1, W - 2), b = rng.int(1, D - 2);
      if (!k.take(a, b, a + 1, b + 1, 0)) continue;
      if (t === 0) P.rockingHorse(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, rng.chance(0.5));
      else if (t === 1) P.chest(deco, P.pf(fr, a + 0.1, b + 0.2, a + 0.9, b + 0.8, rng.pick([0, 1, 2, 3])), y);
      else if (t === 2) P.dollHouse(deco, P.pf(fr, a + 0.1, b + 0.1, a + 0.9, b + 0.9, rng.pick([0, 1, 2, 3])), y);
      else P.crib(deco, P.pf(fr, a + 0.05, b + 0.1, a + 0.95, b + 0.9, 2), y);
    }
  }
  for (const ld of [0, 1, 2, 3]) sconces(k, ld, y + 2.1, 5);
  P.chandelier(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), top, { r: 0.6, drop: 1.0, radius: 7 });
  M.room.bossSpot = { a: W / 2, b: D / 2 };
}
