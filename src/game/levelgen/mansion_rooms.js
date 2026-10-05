// Room templates of the mansion archetype (see gen_mansion.js): the state
// rooms on the ground floor - the two-storey entrance hall with its double
// staircase and gallery, the ballroom with its musicians' gallery, the
// two-storey library with its mezzanine, the dining hall, the chapel over the
// crypt, the music room, the study and the conservatory. The service rooms,
// the upper floor, the cellars and the secret stair are in mansion_wings.js.
//
// Every template works in the room's local frame (Kit, mansion_kit.js): a
// across the room, b into it, W x D cells; local walls 0 (+a), 1 (-a), 2 (+b),
// 3 (-b). Doorway approaches (r.reserved) stay clear and level.
import { Kit, TS, F, FACE, OPP, GF, UF, CF, CANDLE, FIRE, MOON, lbox, lcol, llight, lrail, ledge, each, setCells } from './mansion_kit.js';
import * as P from './mansion_props.js';

const CARPET_STAIR = { floorTex: TS.CARPET, sideTex: TS.WOOD };
const MARBLE_STAIR = { floorTex: TS.FLOOR3, sideTex: TS.PILLAR, style: 'stone' };

// ---------------------------------------------------------------- shared dressing
// is the wall on local side ld at along position s an outside wall (sky or
// the edge of the map within a few cells beyond it)?
export function outside(k, ld, s) {
  const { g, fr } = k;
  let a, b;
  if (ld === 0) { a = k.W; b = s; } else if (ld === 1) { a = -1; b = s; } else if (ld === 2) { a = s; b = k.D; } else { a = s; b = -1; }
  const da = ld === 0 ? 1 : ld === 1 ? -1 : 0, db = ld === 2 ? 1 : ld === 3 ? -1 : 0;
  for (let t = 0; t < 5; t++) {
    const i = fr.idx(g, a + da * t, b + db * t);
    if (i < 0) return true;
    if (g.type[i]) return !!g.sky[i];
  }
  return true;
}
// mark a stretch of wall as dressed (the finishing pass puts no window there)
export function markWall(k, ld, s0, s1, y0 = -99, y1 = 99) {
  (k.r.wallUsed || (k.r.wallUsed = [])).push({ ld, s0, s1, y0, y1 });
}
export function wallTaken(r, ld, s0, s1, y0, y1) {
  return (r.wallUsed || []).some((w) => w.ld === ld && s0 < w.s1 && s1 > w.s0 && y0 < w.y1 && y1 > w.y0);
}
// a painting hung on wall ld, centred at along position s (no floor needed)
export function hangPainting(k, ld, s, y0, y1, w = 1.4, o = {}) {
  const s0 = s - w / 2, s1 = s + w / 2;
  if (!k.wallClear(ld, Math.floor(s0), Math.ceil(s1), 0) || wallTaken(k.r, ld, s0, s1, y0, y1)) return false;
  const p = k.wallFrame(ld, s0, s1, 0.1, o.inset ?? 0.04);
  P.painting(k.deco, p, y0, y1, o);
  markWall(k, ld, s0, s1, y0, y1);
  return true;
}
// candle sconces along a wall at height y, every `step` cells (clear of doorways)
export function sconces(k, ld, y, step = 4, o = {}) {
  const L = k.wallLen(ld);
  let n = 0;
  for (let s = o.from ?? 1; s < (o.to ?? L - 1); s += step) {
    if (!k.wallClear(ld, s, s + 1, 1) || wallTaken(k.r, ld, s, s + 1, y - 0.2, y + 0.4)) continue;
    const [a, b] = ld === 0 ? [k.W - 1, s] : ld === 1 ? [0, s] : ld === 2 ? [s, k.D - 1] : [s, 0];
    if (!k.mine(a, b)) continue;
    P.sconce(k.deco, k.fr, a, b, ld, y, o);
    markWall(k, ld, s + 0.2, s + 0.8, y - 0.2, y + 0.5);
    n++;
  }
  return n;
}
// fireplace on wall ld near `want` (along), the chimney breast to the ceiling
export function placeFireplace(k, ld, o = {}) {
  const w = o.w ?? 3;
  const y = o.y ?? k.y, ceil = o.ceil ?? k.top;
  return k.onWall(ld, w, 1, (p, s) => {
    P.fireplace(k.deco, p, y, ceil, { portrait: o.portrait ?? k.rng.chance(0.6), lit: o.lit ?? k.rng.chance(0.75), tex: o.tex, breast: o.breast });
    markWall(k, ld, s, s + w);
    // hearth rug
    if (o.rug !== false) {
      const [a0, b0, a1, b1] = k.stripCells(ld, s, s + w, 3);
      const [c0, d0, c1, d1] = k.stripCells(ld, s, s + w, 1);
      each(k.fr, a0, b0, a1, b1, (a, b) => { if (!(a >= c0 && a < c1 && b >= d0 && b < d1) && k.mine(a, b) && !k.res(a, b)) k.g.floorTex[k.idx(a, b)] = TS.CARPET; });
    }
  }, { want: o.want, y });
}
// a few armchairs round a hearth / a low table in front of wall ld
export function sittingGroup(k, a0, b0, face) {
  const { deco, fr } = k;
  if (!k.take(a0, b0, a0 + 3, b0 + 2)) return false;
  const p = P.pf(fr, a0, b0, a0 + 3, b0 + 2, face);
  P.armchair(deco, p, 0.55, 1.45, k.y);
  P.armchair(deco, p, 2.45, 1.45, k.y);
  P.table(deco, P.sub(p, 1.1, 0.4, 1.9, 1.1), k.y, { h: 0.5 });
  return true;
}
// raised platforms: fascia band under the edge and pilasters every few cells
// on every drop of `cells` (world indices) toward this room's lower floor
export function platformFace(k, cells, o = {}) {
  const { g, deco } = k;
  const set = new Set(cells);
  const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
  let n = 0;
  for (const i of cells) {
    const x = i % g.w, z = (i / g.w) | 0, f = g.floor[i];
    for (let d = 0; d < 4; d++) {
      const j = g.idx(x + DX[d], z + DZ[d]);
      if (set.has(j) || !g.type[j] || g.region[j] !== k.r.id || (g.flags[j] & F.STAIR) || f - g.floor[j] < 1.4) continue;
      const lo = g.floor[j];
      // the face plane is the shared edge
      const ex = d === 0 ? x + 1 : d === 1 ? x : null, ez = d === 2 ? z + 1 : d === 3 ? z : null;
      const sx = DX[d], sz = DZ[d];
      const box = (u0, u1, y0, y1, dep, tex, opt) => {
        if (ex !== null) deco.box(ex, y0, z + u0, ex + sx * dep, y1, z + u1, tex, opt);
        else deco.box(x + u0, y0, ez, x + u1, y1, ez + sz * dep, tex, opt);
      };
      box(0, 1, f - 0.32, f + 0.02, 0.1, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
      box(0, 1, lo, lo + 0.22, 0.06, TS.TRIM, { faces: FACE.SIDES | FACE.TOP });
      const t = ex !== null ? z : x;
      if ((t + (o.phase ?? 0)) % (o.step ?? 3) === 0 && o.pilasters !== false) box(-0.22, 0.22, lo, f - 0.32, 0.18, o.pilTex ?? TS.PILLAR, { faces: FACE.SIDES });
      n++;
    }
  }
  return n;
}
// paint a rug onto the floor of own flat cells in a local rect
export function rug(k, a0, b0, a1, b1, tex = TS.CARPET) {
  each(k.fr, a0, b0, a1, b1, (a, b) => { if (k.mine(a, b) && !(k.g.flags[k.idx(a, b)] & (F.STAIR | F.DOOR))) k.g.floorTex[k.idx(a, b)] = tex; });
}
// along-wall range of a port and its local side
const portSpan = (p) => [p.s0, p.s1];
// local cell inside the room at along position s next to wall ld
export function wallCell(k, ld, s, depth = 0) { return ld === 0 ? [k.W - 1 - depth, s] : ld === 1 ? [depth, s] : ld === 2 ? [s, k.D - 1 - depth] : [s, depth]; }
// a run of console tables with candles and a painting above along wall ld
export function consoleTables(k, ld, n, o = {}) {
  let made = 0;
  for (let t = 0; t < n; t++) {
    const p = k.onWall(ld, 2, 1, (pp, s) => {
      P.sideboard(k.deco, P.sub(pp, 0.15, 0, 1.85, 0.5), o.y ?? k.y, { h: 0.85, dishes: false, candles: true });
      if (o.painting !== false) hangPainting(k, ld, s + 1, (o.y ?? k.y) + 1.4, (o.y ?? k.y) + 2.6, 1.3);
      else markWall(k, ld, s, s + 2, -99, (o.y ?? k.y) + 1.2);
    }, { random: true, y: o.y });
    if (p) made++;
  }
  return made;
}

// ======================================================================
// templates
// ======================================================================
export const ROOMS = {

  // ---------------------------------------------------------- entrance hall
  // Two storeys high: a double staircase (two flights up the side walls, or
  // an imperial stair: one wide flight to a half landing, then two flights
  // turning back up to the gallery) to the railed gallery across the back,
  // which leads to the bedroom wing and the servants' back stair.
  foyer(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr, g } = k;
    const gy = UF;
    const gal = [], land = [];
    k.floorRect(0, D - 3, W, D, gy, { floorTex: TS.FLOOR, wallTex: TS.WALL2 });
    k.use(0, D - 3, W, D);
    gal.push(...k.cells(0, D - 3, W, D));
    let footB, footA = [];
    if (W >= 19 && rng.chance(0.6)) {
      // imperial staircase
      const fw = 5, fa0 = Math.floor((W - fw) / 2), ly = y + 2.4;
      const la0 = fa0 - 2, la1 = fa0 + fw + 2;
      k.flight(fa0, D - 10, fw, 4, 2, y, ly, CARPET_STAIR);
      k.floorRect(la0, D - 6, la1, D - 3, ly, { floorTex: TS.FLOOR3, wallTex: TS.WALL2 });
      k.use(la0, D - 6, la1, D - 3);
      land.push(...k.cells(la0, D - 6, la1, D - 3));
      k.flight(la0 - 3, D - 6, 3, 3, 1, ly, gy, CARPET_STAIR);
      k.flight(la1, D - 6, 3, 3, 0, ly, gy, CARPET_STAIR);
      k.floorRect(0, D - 6, la0 - 3, D - 3, gy, { floorTex: TS.FLOOR, wallTex: TS.WALL2 });
      k.floorRect(la1 + 3, D - 6, W, D - 3, gy, { floorTex: TS.FLOOR, wallTex: TS.WALL2 });
      k.use(0, D - 6, la0 - 3, D - 3); k.use(la1 + 3, D - 6, W, D - 3);
      gal.push(...k.cells(0, D - 6, la0 - 3, D - 3), ...k.cells(la1 + 3, D - 6, W, D - 3));
      footB = D - 11; footA = [fa0, fa0 + fw];
      // newel lamps at the foot of the flight, a portrait over the landing
      for (const a of [fa0 - 0.15, fa0 + fw + 0.15]) P.newel(deco, k.wx(a, D - 10), k.wz(a, D - 10), y, true);
      hangPainting(k, 2, W / 2, gy + 1.2, Math.min(top - 0.8, gy + 3.6), 3, { emissive: 0.4 });
    } else {
      // two flights up the side walls
      k.flight(0, D - 10, 3, 7, 2, y, gy, CARPET_STAIR);
      k.flight(W - 3, D - 10, 3, 7, 2, y, gy, CARPET_STAIR);
      for (const a of [3.15, W - 3.15]) P.newel(deco, k.wx(a, D - 10), k.wz(a, D - 10), y, true);
      footB = D - 11;
    }
    k.rail(gal); k.rail(land);
    platformFace(k, gal, { step: 3 }); platformFace(k, land, { step: 3, phase: 1 });
    // keep the foot of the stairs clear
    k.use(0, footB, 3, footB + 1); k.use(W - 3, footB, W, footB + 1);
    if (footA.length) k.use(footA[0], footB, footA[1], footB + 1);
    // runner from the front door to the stairs, the big rug under the chandelier
    const front = k.ports((p) => p.kind === 'frontdoor')[0];
    const ra0 = front ? front.s0 : Math.floor(W / 2) - 1;
    rug(k, ra0, 0, ra0 + 3, footB + 1);
    const hb1 = footB - 1;
    const cA = Math.floor(W / 2), cB = Math.max(4, Math.floor(hb1 / 2) + 1);
    rug(k, cA - 3, cB - 2, cA + 3, cB + 2);
    // a round table under the chandelier with an urn of dead flowers
    if (k.take(cA - 1, cB - 1, cA + 1, cB + 1)) P.roundTable(deco, k.wx(cA, cB), k.wz(cA, cB), y, 0.85, { urn: true });
    P.chandelier(deco, k.wx(cA, cB), k.wz(cA, cB), top, { r: 1.7, drop: Math.min(4, (top - y) * 0.36), radius: 15 });
    if (D >= 15) P.chandelier(deco, k.wx(cA, D - 1.5), k.wz(cA, D - 1.5), top, { r: 0.9, drop: 2.2, radius: 8 });
    // suits of armour flanking the front door, statues in the front corners
    if (front) {
      for (const a of [front.s0 - 1.5, front.s1 + 0.5]) if (k.take(Math.floor(a), 0, Math.floor(a) + 1, 1)) P.armour(deco, P.pf(fr, Math.floor(a), 0, Math.floor(a) + 1, 1, 2), 0.5, 0.45, y);
    }
    for (const a of [1, W - 2]) if (k.take(a, 1, a + 1, 2, 0)) P.statue(deco, P.pf(fr, a, 1, a + 1, 2, 2), 0.5, 0.5, y, { s: 0.9 });
    // fireplace and furniture on the side walls (in front of the stairs)
    const side = rng.pick([0, 1]);
    placeFireplace(k, side, { want: Math.max(1, (footB - 3) / 2), portrait: true });
    k.onWall(OPP[side], 1, 1, (p) => P.clock(deco, P.sub(p, 0.2, 0, 0.8, 0.45), y), { to: footB, random: true });
    consoleTables(k, OPP[side], 1);
    // benches along the front wall
    k.onWall(3, 2, 1, (p) => P.bench(deco, P.sub(p, 0.1, 0.05, 1.9, 0.6), y), { random: true });
    // the gallery: portraits on the back wall, chairs and candle stands
    for (let s = 2; s < W - 2; s += rng.int(3, 4)) hangPainting(k, 2, s + 0.5, gy + 0.9, gy + 2.5, 1.3);
    sconces(k, 2, gy + 2.2, 4, { from: 2 });
    for (const ld of [0, 1]) sconces(k, ld, y + 2.4, 4, { to: footB });
    for (const a of [2.5, W - 2.5]) if (k.free(Math.floor(a), D - 1, Math.floor(a) + 1, D, 0, gy)) { k.use(Math.floor(a), D - 1, Math.floor(a) + 1, D); P.candleStand(deco, k.wx(a, D - 0.6), k.wz(a, D - 0.6), gy, { h: 1.6 }); }
    M.room.bossSpot = { a: cA, b: Math.max(2, cB - 2) };
  },

  // ---------------------------------------------------------- ballroom
  // Tall and long: a colonnade down both long sides, chandeliers down the
  // middle, mirrors between the columns, the musicians' gallery on the inner
  // wall (a railed balcony reached by its own stair) with the band's chairs,
  // a grand piano on the floor below.
  ballroom(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // musicians' gallery on the side wall without doorways (prefer +a)
    const gw = 3, gl = Math.min(D - 8, rng.int(7, 9));
    let gside = -1, gb0 = 0;
    for (const ld of [0, 1]) {
      if (gside >= 0) break;
      for (const b0 of [Math.floor((D - gl) / 2) + 2, Math.floor((D - gl) / 2), D - gl - 1]) {
        const a0 = ld === 0 ? W - gw : 0;
        // the stair runs along the same wall from the front: 7 cells before the balcony
        const s0 = b0 - 7;
        if (s0 < 1) continue;
        if (!k.wallClear(ld, s0 - 1, b0 + gl + 1, 1) || !k.free(a0, s0, a0 + gw, b0 + gl)) continue;
        gside = ld; gb0 = b0; break;
      }
    }
    let colA = [2, W - 3];
    if (gside >= 0) {
      const a0 = gside === 0 ? W - gw : 0, gy = UF - 0.6;
      k.floorRect(a0, gb0, a0 + gw, gb0 + gl, gy, { floorTex: TS.FLOOR, wallTex: TS.WALL2 });
      k.use(a0, gb0, a0 + gw, gb0 + gl);
      const sa0 = gside === 0 ? W - 2 : 0;
      k.flight(sa0, gb0 - 6, 2, 6, 2, y, gy, CARPET_STAIR);
      const bal = k.cells(a0, gb0, a0 + gw, gb0 + gl);
      k.rail(bal);
      platformFace(k, bal, { step: 2 });
      P.newel(deco, k.wx(gside === 0 ? W - 2.1 : 2.1, gb0 - 6), k.wz(gside === 0 ? W - 2.1 : 2.1, gb0 - 6), y, true);
      // the band: chairs and music stands, a harp, a cello case
      const p = P.pf(fr, a0, gb0, a0 + gw, gb0 + gl, gside === 0 ? 1 : 0);
      for (let t = 1; t < gl - 1; t += 1.6) { P.chair(deco, p, t, 1.1, gy); P.musicStand(deco, p, t, 1.9, gy); }
      P.harp(deco, p.px(gl - 0.8, 0.8), p.pz(gl - 0.8, 0.8), gy);
      for (let b = gb0; b < gb0 + gl; b += 3) P.candleStand(deco, k.wx(gside === 0 ? W - 0.5 : 0.5, b + 0.5), k.wz(gside === 0 ? W - 0.5 : 0.5, b + 0.5), gy, { h: 1.3, light: b === gb0 });
      sconces(k, gside, gy + 2.2, 3, { from: gb0, to: gb0 + gl });
      if (gside === 0) colA = [2, W - 5]; else colA = [4, W - 3];
    }
    // colonnade: columns down both long sides
    const cols = [];
    for (let b = 2; b < D - 2; b += 3) for (const a of colA) {
      if (!k.take(a, b, a + 1, b + 1)) continue;
      cols.push([a, b]);
      deco.pillar(k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), 0.6, y, top, { tex: TS.PILLAR, trimTex: TS.TRIM });
    }
    // beams across the ceiling between the column pairs
    for (let b = 2; b < D - 2; b += 3) lbox(deco, fr, 0, top - 0.45, b + 0.3, W, top, b + 0.7, TS.BEAM);
    // chandeliers down the middle
    const ca = (colA[0] + colA[1] + 1) / 2;
    for (let b = 3; b < D - 2; b += 5) P.chandelier(deco, k.wx(ca, b + 0.5), k.wz(ca, b + 0.5), top, { r: 1.5, drop: Math.min(3.8, (top - y) * 0.35), radius: 13 });
    // parquet dance floor in the middle, carpet under the colonnades
    rug(k, colA[0] + 1, 1, colA[1], D - 1, TS.FLOOR);
    // tall mirrors on the walls between the columns, chairs beneath
    for (const ld of [0, 1]) {
      if (ld === gside) continue;
      for (let s = 1; s < D - 2; s += 3) {
        if (!k.wallClear(ld, s, s + 2, 1) || wallTaken(k.r, ld, s, s + 2, y, top)) continue;
        const p = k.wallFrame(ld, s + 0.2, s + 1.8, 0.1);
        P.mirror(deco, p, y + 0.6, Math.min(top - 1.5, y + 4.8));
        markWall(k, ld, s + 0.2, s + 1.8);
        const [a0, b0, a1, b1] = k.stripCells(ld, s, s + 2, 1);
        if (k.take(a0, b0, a1, b1)) { const q = k.wallFrame(ld, s, s + 2, 0.7); P.chair(deco, q, 0.6, 0.35, y); P.chair(deco, q, 1.4, 0.35, y); }
      }
    }
    // grand piano near the gallery, a buffet on an end wall
    const pa = gside === 0 ? W - 7 : gside === 1 ? 5 : Math.floor(W / 2) - 1;
    for (const b of [gb0 + 2, Math.floor(D / 2) - 1, 3]) if (k.take(pa, b, pa + 2, b + 3)) { P.piano(deco, P.pf(fr, pa, b + 0.6, pa + 2, b + 3, gside === 1 ? 1 : 0), y); break; }
    for (const ld of [2, 3]) k.onWall(ld, 4, 1, (p) => P.sideboard(deco, P.sub(p, 0.1, 0, 3.9, 0.6), y, { h: 0.9, candles: true }), { random: true });
    for (const ld of [2, 3]) sconces(k, ld, y + 3, 3);
    M.room.bossSpot = { a: ca, b: D / 2 };
  },

  // ---------------------------------------------------------- library
  // Two storeys of books: tall cases on every wall, an L-shaped mezzanine at
  // the upper floor along the front and the far wall (the bedroom wing's
  // door opens onto it) with its own stair, cases on the mezzanine walls,
  // free-standing stacks with reading tables on the floor, a hearth with
  // armchairs, a globe. The secret door is a bookcase on the side wall.
  library(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr, g } = k;
    const my = UF;
    // mezzanine: 2 deep along the front (-b) wall, along the +a wall to the stair
    const bm = Math.min(D - 8, 6);
    k.floorRect(0, 0, W, 2, my, { floorTex: TS.FLOOR, wallTex: TS.WALL2 });
    k.floorRect(W - 2, 2, W, bm, my, { floorTex: TS.FLOOR, wallTex: TS.WALL2 });
    k.use(0, 0, W, 2); k.use(W - 2, 2, W, bm);
    const mez = [...k.cells(0, 0, W, 2), ...k.cells(W - 2, 2, W, bm)];
    k.flight(W - 2, bm, 2, 7, 3, y, my, { floorTex: TS.WOOD, sideTex: TS.WOOD });
    k.rail(mez);
    platformFace(k, mez, { step: 3, pilTex: TS.WOOD });
    k.use(W - 2, bm + 7, W, bm + 8);
    // bookcases on the walls of the floor (under the mezzanine: none, it is solid)
    const caseH = Math.min(my - y - 0.2, 3.6);
    for (const ld of [1, 2, 0]) {
      const L = k.wallLen(ld);
      for (let s = ld === 0 ? bm + 8 : ld === 1 ? 2 : 0; s + 2 <= L; s++) {
        if (ld === 2 && s >= W - 2) break;
        if (!k.wallClear(ld, s, s + 2, 0)) continue;
        const [a0, b0, a1, b1] = k.stripCells(ld, s, s + 2, 1);
        if (!k.take(a0, b0, a1, b1)) continue;
        P.bookcase(deco, k.wallFrame(ld, s, s + 2, 0.45), y, caseH);
        markWall(k, ld, s, s + 2, y, y + caseH);
        s++;
      }
    }
    // the mezzanine walls: cases from the gallery floor up toward the ceiling
    const upH = Math.min(top - my - 0.4, 3.2);
    for (let s = 0; s + 2 <= W; s += 2) {
      if (!k.wallClear(3, s, s + 2, 0)) continue;
      P.bookcase(deco, k.wallFrame(3, s, s + 2, 0.4), my, upH);
      markWall(k, 3, s, s + 2, my, my + upH);
    }
    for (let s = 2; s + 2 <= bm; s += 2) { P.bookcase(deco, k.wallFrame(0, s, s + 2, 0.4), my, upH); markWall(k, 0, s, s + 2, my, my + upH); }
    // free-standing stacks across the room with reading tables between
    const stackA0 = 2, stackA1 = W - 4;
    for (let b = 4; b + 1 < D - 2; b += 4) {
      for (let a = stackA0; a + 3 <= stackA1; a += 5) {
        if (!k.take(a, b, a + 3, b + 1, 0)) continue;
        P.bookcase(deco, P.pf(fr, a, b, a + 3, b + 0.48, 3), y, 2.6, { depth: 0.48 });
        P.bookcase(deco, P.pf(fr, a, b + 0.52, a + 3, b + 1, 2), y, 2.6, { depth: 0.48 });
        // a reading table in front of the stack
        if (k.take(a, b + 2, a + 3, b + 3)) {
          const t = P.pf(fr, a + 0.3, b + 2.1, a + 2.7, b + 2.9, 2);
          P.table(deco, t, y, {});
          P.candles(deco, t.px(0.4, 0.4), t.pz(0.4, 0.4), y + 0.78, 2, { radius: 4 });
          P.books(deco, t, 1.2, 0.4, y + 0.78);
        }
      }
    }
    // the hearth with armchairs (the wall with the stair is the far one)
    placeFireplace(k, 1, { portrait: true, want: D - 4 });
    // a globe and a ladder against the cases
    for (let t = 0; t < 6; t++) {
      const a = rng.int(2, W - 4), b = rng.int(3, D - 2);
      if (k.take(a, b, a + 1, b + 1, 0)) { P.globe(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y); break; }
    }
    // lighting: chandeliers over the floor, sconces on the mezzanine
    for (let b = 4; b < D - 2; b += 5) P.chandelier(deco, k.wx(W / 2 - 1, b + 0.5), k.wz(W / 2 - 1, b + 0.5), top, { r: 1.0, drop: Math.min(2.4, top - my - 1.4), radius: 10 });
    sconces(k, 3, my + 2.4, 4, { from: 1 });
    sconces(k, 1, y + 2.6, 4, { from: 3 });
    M.room.bossSpot = { a: W / 2, b: D - 3 };
  },

  // ---------------------------------------------------------- dining hall
  dining(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // the long table down the middle (along the longer axis), as long as the doors allow
    const alongA = W >= D;
    const Lr = alongA ? W : D, Dr = alongA ? D : W, Dt = 3;
    let tab = null;
    for (let len = Lr - 5; len >= 4 && !tab; len--) {
      for (const dc of [0, -1, 1, -2, 2]) {
        const c = Math.floor((Dr - Dt) / 2) + dc, s0 = Math.floor((Lr - len - 1) / 2);
        if (c < 1 || c + Dt > Dr - 1) continue;
        if (alongA ? k.take(s0, c, s0 + len + 1, c + Dt) : k.take(c, s0, c + Dt, s0 + len + 1)) { tab = { c, s0, len }; break; }
      }
    }
    if (tab) {
      const { c, s0, len } = tab;
      if (alongA) P.diningSet(deco, P.pf(fr, s0, c, s0 + len + 1, c + Dt, 2), y, { cloth: true });
      else P.diningSet(deco, P.pf(fr, c, s0, c + Dt, s0 + len + 1, 1), y, { cloth: true });
      rug(k, alongA ? s0 - 1 : c - 1, alongA ? c - 1 : s0 - 1, alongA ? s0 + len + 2 : c + Dt + 1, alongA ? c + Dt + 1 : s0 + len + 2);
      const n = Math.max(2, Math.floor(len / 4));
      for (let t = 0; t < n; t++) {
        const sa = s0 + 0.5 + ((len + 1) * (t + 0.5)) / n;
        const a = alongA ? sa : c + Dt / 2, b = alongA ? c + Dt / 2 : sa;
        P.chandelier(deco, k.wx(a, b), k.wz(a, b), top, { r: 1.0, drop: 1.8, radius: 9 });
      }
    } else P.chandelier(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), top, { r: 1.2, drop: 1.8, radius: 10 });
    // fireplace on an inner wall, sideboards and china cabinets elsewhere
    const walls = [0, 1, 2, 3].sort((p, q) => (outside(k, p, 2) ? 1 : 0) - (outside(k, q, 2) ? 1 : 0));
    placeFireplace(k, walls[0], { portrait: true });
    for (const ld of walls.slice(1)) {
      k.onWall(ld, 3, 1, (p) => P.sideboard(deco, P.sub(p, 0.1, 0, 2.9, 0.55), y, { candles: true }), { random: true });
      k.onWall(ld, 2, 1, (p) => P.cabinet(deco, P.sub(p, 0.15, 0, 1.85, 0.45), y), { random: true });
    }
    for (const ld of [0, 1, 2, 3]) { hangPainting(k, ld, k.wallLen(ld) / 2 + rng.int(-2, 2), y + 1.7, y + 3.1, 1.6); sconces(k, ld, y + 2.3, 4); }
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- chapel
  // Pews in two blocks either side of the aisle, the chancel raised at the far
  // end (altar, candles, a tall window behind), the organ to one side; the
  // stair to the crypt goes down a railed well along the side wall.
  chapel(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // the crypt stair: from the doorway on the side wall (at the cellar level)
    const cs = k.ports((p) => p.kind === 'chapelstair')[0];
    if (cs) {
      const [s0] = portSpan(cs);
      const into = OPP[cs.dir];        // the flight climbs away from the wall
      const a0 = cs.dir === 1 ? 0 : W - 7;
      k.flight(a0, s0, 7, 3, into, CF, y, { floorTex: TS.FLOOR2, sideTex: TS.PITWALL });
      k.wellRails(a0, s0, a0 + 7, s0 + 3, y, [into]);
      k.use(a0, s0 - 1, a0 + 8, s0 + 4);
    }
    // chancel: the far end two cells deep, one step up, the altar on it
    const ch = 3;
    if (k.free(1, D - ch, W - 1, D, 0)) {
      k.floorRect(1, D - ch, W - 1, D, y + 0.6, { floorTex: TS.FLOOR3, wallTex: TS.PILLAR });
      k.use(1, D - ch, W - 1, D);
      const ap = P.pf(fr, W / 2 - 1.5, D - 1.2, W / 2 + 1.5, D, 3);
      P.altar(deco, ap, y + 0.6);
      for (const a of [W / 2 - 2.6, W / 2 + 2.6]) P.candleStand(deco, k.wx(a, D - 1.4), k.wz(a, D - 1.4), y + 0.6, { h: 1.7 });
      lrail(deco, fr, 2, D - ch, W / 2 - 1.5, D - ch, y + 0.6, { style: 'iron', tex: TS.RAIL, height: 0.8 });
      lrail(deco, fr, W / 2 + 1.5, D - ch, W - 2, D - ch, y + 0.6, { style: 'iron', tex: TS.RAIL, height: 0.8 });
      markWall(k, 2, W / 2 - 2, W / 2 + 2, y + 1, y + 4);
    }
    // pews: two blocks either side of the central aisle
    const aisle0 = Math.floor(W / 2) - 1, aisle1 = aisle0 + 2;
    rug(k, aisle0, 0, aisle1, D - ch);
    for (let b = 2; b < D - ch - 1; b += 2) {
      for (const [a0, a1] of [[1, aisle0], [aisle1, W - 1]]) {
        if (a1 - a0 < 2) continue;
        let x0 = a0, x1 = a1;
        while (x1 > x0 + 1 && !k.free(x0, b, x1, b + 1)) { if (!k.free(x0, b, x0 + 1, b + 1)) x0++; else x1--; }
        if (x1 - x0 < 2 || !k.take(x0, b, x1, b + 1)) continue;
        P.pew(deco, P.pf(fr, x0 + 0.05, b + 0.1, x1 - 0.05, b + 0.9, 2), y);
      }
    }
    // the organ against a side wall near the chancel
    for (const ld of [0, 1]) if (k.onWall(ld, 3, 1, (p) => P.organ(deco, P.sub(p, 0, 0, 3, 1), y, Math.min(top - y - 2, 4.5)), { want: D - ch - 4 })) break;
    // ribs across the vault, lamps
    for (let b = 1; b < D; b += 3) lbox(deco, fr, 0, top - 0.5, b + 0.35, W, top, b + 0.65, TS.BEAM);
    for (let b = 3; b < D - 2; b += 5) P.chandelier(deco, k.wx(W / 2, b), k.wz(W / 2, b), top, { r: 0.9, drop: 2.5, radius: 9 });
    for (const ld of [0, 1]) sconces(k, ld, y + 2.6, 3);
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- music room
  music(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    const pa = Math.floor(W / 2) - 1, pb = Math.floor(D / 2) - 1;
    if (k.take(pa - 1, pb - 1, pa + 3, pb + 3)) P.piano(deco, P.pf(fr, pa - 0.5, pb, pa + 1.5, pb + 2.5, 2), y);
    rug(k, pa - 2, pb - 2, pa + 4, pb + 4);
    for (let t = 0; t < 3; t++) {
      const a = rng.int(2, W - 3), b = rng.int(2, D - 3);
      if (k.take(a, b, a + 1, b + 1, 0)) { if (t === 0) P.harp(deco, k.wx(a + 0.3, b + 0.5), k.wz(a + 0.3, b + 0.5), y); else { const p = P.pf(fr, a, b, a + 1, b + 1, 3); P.chair(deco, p, 0.5, 0.6, y); P.musicStand(deco, p, 0.5, 1.2, y); } }
    }
    // rows of chairs facing the piano
    for (let b = 1; b < pb - 2; b += 2) for (let a = 2; a < W - 2; a += 1) if (k.take(a, b, a + 1, b + 1, 0)) P.chair(deco, P.pf(fr, a, b, a + 1, b + 1, 2), 0.5, 0.5, y);
    placeFireplace(k, rng.pick([0, 1]), { portrait: true });
    for (const ld of [0, 1, 2, 3]) { k.onWall(ld, 3, 1, (p) => P.sofa(deco, P.sub(p, 0.1, 0, 2.9, 0.85), y), { random: true }); sconces(k, ld, y + 2.3, 4); }
    P.chandelier(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), top, { r: 1.2, drop: 1.8, radius: 10 });
    M.room.bossSpot = { a: W / 2, b: D / 2 + 2 };
  },

  // ---------------------------------------------------------- study
  study(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    // the desk facing the door, a chair behind it, bookcases round the walls
    const da = Math.floor(W / 2) - 1, db = D - 4;
    if (k.take(da - 1, db, da + 3, db + 3)) {
      const p = P.pf(fr, da - 0.5, db + 0.2, da + 2.5, db + 1.2, 3);
      P.desk(deco, p, y);
      P.armchair(deco, P.pf(fr, da, db + 1.4, da + 2, db + 2.6, 3), 1, 0.6, y);
    }
    rug(k, da - 2, db - 3, da + 4, db + 3);
    for (const ld of [0, 1, 2]) for (let s = 0; s + 2 <= k.wallLen(ld); s += 2) {
      if (!k.wallClear(ld, s, s + 2, 0)) continue;
      const [a0, b0, a1, b1] = k.stripCells(ld, s, s + 2, 1);
      if (!k.take(a0, b0, a1, b1)) continue;
      P.bookcase(deco, k.wallFrame(ld, s, s + 2, 0.45), y, Math.min(top - y - 0.5, 3.2));
      markWall(k, ld, s, s + 2);
    }
    placeFireplace(k, 3, { portrait: true });
    for (let t = 0; t < 2; t++) sittingGroup(k, rng.int(1, W - 4), rng.int(2, D - 6), 2);
    for (const ld of [0, 1, 2]) {
      const s = Math.floor(k.wallLen(ld) / 2);
      if (!k.wallClear(ld, s - 1, s + 1, 0) || wallTaken(k.r, ld, s - 0.5, s + 0.5, y + 2.2, y + 3.3)) continue;
      P.trophy(deco, k.wallFrame(ld, s - 0.5, s + 0.5, 0.6, 0.02), y + 2.6);
      markWall(k, ld, s - 0.5, s + 0.5, y + 2.2, y + 3.3);
    }
    P.chandelier(deco, k.wx(W / 2, D / 2), k.wz(W / 2, D / 2), top, { r: 0.9, drop: 1.6, radius: 9 });
    for (const ld of [0, 1]) sconces(k, ld, y + 2.3, 4);
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- conservatory
  // A glasshouse standing in the garden: glazed walls and roof on iron ribs
  // (mansion_finish.js), planting beds along the glass, potted palms, a lily
  // pool with a fountain, iron benches, a tea table.
  conservatory(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr, g } = k;
    // lily pool in the middle
    const pa0 = Math.floor(W / 2) - 1, pb0 = Math.floor(D / 2) - 1;
    if (k.free(pa0 - 1, pb0 - 1, pa0 + 3, pb0 + 3)) {
      k.use(pa0 - 1, pb0 - 1, pa0 + 3, pb0 + 3);
      k.floorRect(pa0, pb0, pa0 + 2, pb0 + 2, y - 0.35, { floorTex: TS.WATER, wallTex: TS.PILLAR, flags: F.WATER | F.NOSPAWN });
      P.kerb(deco, fr, pa0, pb0, pa0 + 2, pb0 + 2, y, 0.4);
      P.fountain(deco, k.wx(pa0 + 1, pb0 + 1), k.wz(pa0 + 1, pb0 + 1), y - 0.35, 0.7);
    }
    // planting beds along the glass walls
    for (const ld of [0, 1, 2, 3]) {
      const L = k.wallLen(ld);
      for (let s = 0; s + 2 <= L; s += 2) {
        if (!k.wallClear(ld, s, s + 2, 1)) continue;
        const [a0, b0, a1, b1] = k.stripCells(ld, s, s + 2, 1);
        if (!k.take(a0, b0, a1, b1)) continue;
        P.planterBed(deco, k.wallFrame(ld, s + 0.05, s + 1.95, 0.8), y, rng);
      }
    }
    // potted palms and benches
    for (let t = 0; t < 8; t++) {
      const a = rng.int(1, W - 2), b = rng.int(1, D - 2);
      if (k.take(a, b, a + 1, b + 1, 0)) {
        if (t % 3 === 2) P.bench(deco, P.pf(fr, a - 0.4, b + 0.1, a + 1.4, b + 0.8, rng.pick([2, 3])), y);
        else P.palm(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, rng);
      }
    }
    for (let t = 0; t < 4; t++) {
      const a = rng.int(1, W - 3), b = rng.int(1, D - 3);
      if (k.take(a, b, a + 2, b + 2, 0)) { P.roundTable(deco, k.wx(a + 1, b + 1), k.wz(a + 1, b + 1), y, 0.55, { iron: true, teaset: true }); break; }
    }
    // hanging lanterns from the ribs
    for (let b = 2; b < D - 1; b += 4) P.lantern(deco, k.wx(W / 2, b), k.wz(W / 2, b), top - 0.8, { radius: 7 });
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },
};
