// Outdoor rooms and the exterior of the mansion (see gen_mansion.js):
//   - the forecourt: the gravel drive from the gates to the porch (a stone
//     portico over the front steps), a turning circle round a fountain or a
//     statue, lawns with dead trees, clipped hedges and lamp posts along the
//     drive, the boundary wall with its iron railing and gate piers;
//   - the walled garden courtyard: a fountain in a basin at the crossing of
//     the gravel paths, hedge-bordered beds, a pond (clear, or foul and
//     poisonous) crossed by a railed footbridge, statues and benches, stone
//     steps up to the doors of the house, the conservatory standing in it;
//   - the graveyard behind the garden wall: rows of headstones and mounds,
//     an angel, an obelisk, dead trees, the family mausoleum (its stair goes
//     down into the crypt);
//   - the exterior: grey stone facades with two rows of windows, a plinth, a
//     string course and the eaves cornice, a stepped slate roof with chimney
//     stacks, stone surrounds round the outside doors; the garden walls and
//     the boundary wall low and mossy; the glasshouse glazed on iron ribs;
//     the mausoleum a small stone temple.
import { Kit, TS, F, FACE, OPP, DIR_X, DIR_Z, GF, UF, CF, GROUND, LAMP, MOON, CANDLE, lbox, lrail, ledge, each } from './mansion_kit.js';
import * as P from './mansion_props.js';
import { pit } from './mansion_wings.js';
import { rug } from './mansion_rooms.js';

const STONE_STAIR = { floorTex: TS.FLOOR2, sideTex: TS.FACADE, style: 'stone' };

// steps up to a raised doorway from the ground: a landing in front of the
// door (one cell either side) and two steps down toward the yard
export function stoop(k, p) {
  if (!p.active || p.h - k.y < 0.5) return;
  const n = Math.round((p.h - k.y) / 0.6), w = p.cells.length;
  const back = OPP[p.dir];                         // from the door out into the yard
  const da = back === 0 ? 1 : back === 1 ? -1 : 0, db = back === 2 ? 1 : back === 3 ? -1 : 0;
  const sa = p.dir < 2 ? 0 : 1, sb = p.dir < 2 ? 1 : 0;   // along the wall
  const [c0a, c0b] = p.cells[0];
  // local rect of along offsets [s0, s1) (from the first door cell) and depths [t0, t1)
  const rect = (s0, s1, t0, t1) => {
    const a0 = c0a + sa * s0 + da * t0, b0 = c0b + sb * s0 + db * t0;
    const a1 = c0a + sa * (s1 - 1) + da * (t1 - 1), b1 = c0b + sb * (s1 - 1) + db * (t1 - 1);
    return [Math.min(a0, a1), Math.min(b0, b1), Math.max(a0, a1) + 1, Math.max(b0, b1) + 1];
  };
  const [la0, lb0, la1, lb1] = rect(-1, w + 1, 0, 1);
  k.floorRect(la0, lb0, la1, lb1, p.h, { floorTex: TS.FLOOR2, wallTex: TS.FACADE });
  k.use(la0, lb0, la1, lb1);
  const [fa0, fb0, fa1, fb1] = rect(0, w, 1, 1 + n);
  k.flight(fa0, fb0, fa1 - fa0, fb1 - fb0, p.dir, k.y, p.h, STONE_STAIR);
  k.rail(k.cells(la0, lb0, la1, lb1), { style: 'iron', tex: TS.METAL, height: 0.95 });
  const [ua0, ub0, ua1, ub1] = rect(-1, w + 1, 1 + n, 2 + n);
  k.use(ua0, ub0, ua1, ub1);
}

// path of gravel from a doorway straight out into the yard, depth n
function pathFrom(k, p, n, w = 3) {
  const back = OPP[p.dir];
  const da = back === 0 ? 1 : back === 1 ? -1 : 0, db = back === 2 ? 1 : back === 3 ? -1 : 0;
  const sa = p.dir < 2 ? 0 : 1, sb = p.dir < 2 ? 1 : 0;
  const [c0a, c0b] = p.cells[0], off = Math.floor((p.cells.length - w) / 2);
  for (let t = 0; t < n; t++) for (let s = off; s < off + w; s++) gravel(k, c0a + sa * s + da * t, c0b + sb * s + db * t, c0a + sa * s + da * t + 1, c0b + sb * s + db * t + 1);
}

// world cells of an outdoor room
const lawn = (k, a0, b0, a1, b1) => each(k.fr, a0, b0, a1, b1, (a, b) => { if (k.mine(a, b) && !(k.g.flags[k.idx(a, b)] & (F.STAIR | F.HAZARD | F.PIT | F.WATER))) k.g.floorTex[k.idx(a, b)] = TS.GROUND; });
const gravel = (k, a0, b0, a1, b1, tex = TS.SIDEWALK) => each(k.fr, a0, b0, a1, b1, (a, b) => { if (k.mine(a, b) && Math.abs(k.fl(a, b) - k.y) < 0.01 && !(k.g.flags[k.idx(a, b)] & (F.STAIR | F.HAZARD | F.PIT | F.WATER))) k.g.floorTex[k.idx(a, b)] = tex; });

// a hedged bed: box hedge round a planted plot (all of it blocked)
function hedgeBed(k, a0, b0, a1, b1, o = {}) {
  if (!k.take(a0, b0, a1, b1, 0)) return false;
  const { deco, fr, y, rng } = k;
  const h = o.h ?? 0.9, t = 0.45;
  P.hedge(deco, fr, a0, b0, a1, b0 + t, y, h); P.hedge(deco, fr, a0, b1 - t, a1, b1, y, h);
  P.hedge(deco, fr, a0, b0 + t, a0 + t, b1 - t, y, h); P.hedge(deco, fr, a1 - t, b0 + t, a1, b1 - t, y, h);
  lbox(deco, fr, a0 + t, y, b0 + t, a1 - t, y + 0.25, b1 - t, TS.GROUND, { faces: FACE.TOP });
  for (let b = b0 + 0.9; b < b1 - 0.6; b += 0.8) for (let a = a0 + 0.9; a < a1 - 0.6; a += 0.8) {
    const r = rng.float(0.15, 0.3), hh = rng.float(0.3, 0.7);
    lbox(deco, fr, a - r, y + 0.25, b - r, a + r, y + 0.25 + hh, b + r, o.dead && rng.chance(0.5) ? TS.WOOD : TS.FOLIAGE);
    if (o.roses && rng.chance(0.4)) lbox(deco, fr, a - 0.08, y + 0.25 + hh, b - 0.08, a + 0.08, y + 0.4 + hh, b + 0.08, TS.CARPET);
  }
  for (const [a, b] of [[a0 + 0.3, b0 + 0.3], [a1 - 0.3, b0 + 0.3], [a0 + 0.3, b1 - 0.3], [a1 - 0.3, b1 - 0.3]]) if (o.topiary) P.topiary(deco, k.wx(a, b), k.wz(a, b), y, 0.32);
  lbox(deco, fr, a0, y, b0, a1, y + h, b1, TS.FOLIAGE, { faces: 0 });
  k.deco.collider(...collRect(k, a0, b0, a1, b1), { obstacle: true });
  return true;
}
function collRect(k, a0, b0, a1, b1, h = 1.0) { const [x0, z0, x1, z1] = k.fr.rect(a0, b0, a1, b1); return [x0, k.y, z0, x1, k.y + h, z1]; }

export const GROUNDS = {
  // ---------------------------------------------------------- forecourt
  forecourt(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr, g } = k;
    lawn(k, 0, 0, W, D);
    const fd = k.ports((p) => p.kind === 'frontdoor')[0];
    const cm = fd ? (fd.s0 + fd.s1) / 2 : W / 2;
    // the porch: a stone platform at the floor of the house, steps across its front
    const pw = 7, pa0 = Math.round(cm - pw / 2), pa1 = pa0 + pw;
    k.floorRect(pa0, D - 3, pa1, D, GF, { floorTex: TS.FLOOR2, wallTex: TS.FACADE });
    k.use(pa0, D - 3, pa1, D);
    k.flight(pa0, D - 5, pw, 2, 2, y, GF, STONE_STAIR);
    k.rail(k.cells(pa0, D - 3, pa1, D), { style: 'stone', wallTex: TS.FACADE });
    // portico: two columns, the entablature and a pediment over the steps
    const top = GF + 3.8;
    for (const a of [pa0 + 0.55, pa1 - 0.55]) deco.pillar(k.wx(a, D - 2.55), k.wz(a, D - 2.55), 0.55, GF, top, { tex: TS.PILLAR, trimTex: TS.TRIM });
    lbox(deco, fr, pa0 - 0.2, top, D - 3.1, pa1 + 0.2, top + 0.5, D, TS.TRIM);
    for (let t = 0; t < 4; t++) lbox(deco, fr, pa0 - 0.3 + t * 0.85, top + 0.5 + t * 0.32, D - 3.2, pa1 + 0.3 - t * 0.85, top + 0.82 + t * 0.32, D, TS.ROOF, { faces: FACE.SIDES | FACE.TOP });
    for (const a of [cm - 2.1, cm + 2.1]) P.lantern(deco, k.wx(a, D - 0.6), k.wz(a, D - 0.6), GF + 2.4, { chain: 0.9, radius: 7 });
    // the drive: gravel from the gates to the steps, a turning circle round an island
    const dw = 5, da0 = Math.round(cm - dw / 2);
    gravel(k, da0, 0, da0 + dw, D - 5);
    gravel(k, pa0, D - 5, pa1, D - 3);
    const ib = Math.max(4, Math.floor((D - 5) / 2)), ia = cm;
    const R = 3.6;
    each(fr, 0, 0, W, D - 5, (a, b) => { if (Math.hypot(a + 0.5 - ia, b + 0.5 - ib) <= R + 0.2) gravel(k, a, b, a + 1, b + 1); });
    // the island: a raised round bed with a fountain or a weeping angel
    const i0 = Math.floor(ia - 1), j0 = ib - 1;
    if (k.take(i0, j0, i0 + 2, j0 + 2, 0)) {
      lbox(deco, fr, i0 - 0.2, y, j0 - 0.2, i0 + 2.2, y + 0.45, j0 + 2.2, TS.PILLAR, { solid: true });
      lbox(deco, fr, i0, y + 0.45, j0, i0 + 2, y + 0.5, j0 + 2, rng.chance(0.5) ? TS.GROUND : TS.WATER, { faces: FACE.TOP });
      if (rng.chance(0.5)) P.fountain(deco, k.wx(ia, ib), k.wz(ia, ib), y + 0.45, 0.8, { figure: true });
      else P.statue(deco, P.pf(fr, i0, j0, i0 + 2, j0 + 2, 3), 1, 1, y + 0.45, { wings: true, s: 1.1 });
    }
    // hedges either side of the drive (gaps at the gates and by the circle)
    const hb0 = 2, hb1 = Math.max(hb0, Math.floor(ib - R) - 1);
    for (const a of [da0 - 1, da0 + dw]) if (hb1 > hb0 && k.take(a, hb0, a + 1, hb1, 0)) P.hedge(deco, fr, a + 0.15, hb0, a + 0.85, hb1, y, 0.95);
    for (const a of [da0 - 1, da0 + dw]) if (k.take(a, D - 7, a + 1, D - 5, 0)) P.topiary(deco, k.wx(a + 0.5, D - 6), k.wz(a + 0.5, D - 6), y, 0.4);
    // lamp posts along the drive and at the steps
    for (let b = 1; b < D - 5; b += 4) for (const a of [da0 - 0.5, da0 + dw + 0.5]) {
      const ca = Math.floor(a), cb = b;
      if (k.mine(ca, cb) && !k.used(ca, cb) && !k.res(ca, cb)) { k.use(ca, cb, ca + 1, cb + 1); P.lampPost(deco, k.wx(a, b + 0.5), k.wz(a, b + 0.5), y, 3.2); }
    }
    // dead trees, benches and urns on the lawns
    let trees = 0;
    for (let t = 0; t < 40 && trees < 7; t++) {
      const a = rng.int(1, W - 2), b = rng.int(1, D - 3);
      if (Math.abs(a + 0.5 - cm) < dw / 2 + 2 || Math.hypot(a + 0.5 - ia, b + 0.5 - ib) < R + 2) continue;
      if (!k.take(a - 1, b - 1, a + 2, b + 2, 0)) continue;
      P.deadTree(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, rng, { h: rng.float(4, 6.5) });
      trees++;
    }
    for (let t = 0; t < 20; t++) {
      const a = rng.int(1, W - 3), b = rng.int(1, D - 3);
      if (Math.abs(a + 0.5 - cm) < dw / 2 + 1) continue;
      if (!k.take(a, b, a + 2, b + 1, 0)) continue;
      if (t % 2) P.bench(deco, P.pf(fr, a + 0.1, b + 0.1, a + 1.9, b + 0.8, a < cm ? 0 : 1), y);
      else P.urn(deco, k.wx(a + 1, b + 0.5), k.wz(a + 1, b + 0.5), y);
    }
    M.room.bossSpot = { a: cm, b: ib };
    M.fore = { k, cm, da0, dw };
  },

  // ---------------------------------------------------------- walled garden
  garden(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr, g } = k;
    lawn(k, 0, 0, W, D);
    for (const p of k.ports()) { stoop(k, p); pathFrom(k, p, 4 + (p.h - y > 0.5 ? 3 : 0)); }
    // the fountain basin at the crossing of the paths, in the open part of the garden
    const cons = M.P.cons;
    const consA0 = cons.u - M.room.u - 1;          // the glasshouse (and its wall) from here on
    const openW = Math.max(8, Math.min(W, consA0));
    const fa = Math.floor(openW / 2), fb = Math.floor(D / 2);
    gravel(k, 0, fb - 1, openW, fb + 2); gravel(k, fa - 1, 0, fa + 2, D);
    let basin = null;
    if (k.free(fa - 2, fb - 2, fa + 2, fb + 2)) {
      k.use(fa - 3, fb - 3, fa + 3, fb + 3);
      k.floorRect(fa - 2, fb - 2, fa + 2, fb + 2, y - 0.4, { floorTex: TS.WATER, wallTex: TS.PILLAR, flags: F.WATER | F.NOSPAWN });
      P.kerb(deco, fr, fa - 2, fb - 2, fa + 2, fb + 2, y, 0.5);
      P.fountain(deco, k.wx(fa, fb), k.wz(fa, fb), y - 0.4, 1.2, { figure: true });
      gravel(k, fa - 3, fb - 3, fa + 3, fb + 3);
      basin = [fa, fb];
      // benches facing the fountain
      for (const [a, b, f] of [[fa - 1, fb - 4, 2], [fa - 1, fb + 3, 3]]) if (k.take(a, b, a + 2, b + 1, 0)) P.bench(deco, P.pf(fr, a + 0.1, b + 0.1, a + 1.9, b + 0.8, f), y);
    }
    // a pond crossed by a footbridge in the quarter away from the glasshouse
    const foul = rng.chance(0.45);
    const quarters = rng.shuffle([[1, 1], [1, fb + 3], [fa + 3, 1], [fa + 3, fb + 3]]);
    let pond = false;
    for (const [qa, qb] of quarters) {
      const pw = Math.min(6, fa - 3), pd = Math.min(5, fb - 3);
      if (pw < 4 || pd < 3) break;
      if (!k.free(qa - 1, qb - 1, qa + pw + 1, qb + pd + 1) || !k.keepsPath(qa, qb, qa + pw, qb + pd)) continue;
      const cells = pit(k, qa, qb, qa + pw, qb + pd, foul ? 'poison' : 'water', 1.3);
      k.use(qa - 1, qb - 1, qa + pw + 1, qb + pd + 1);
      // the footbridge across the middle (2 wide), railed both sides
      const bb = qb + Math.floor(pd / 2) - 1;
      const br = [];
      each(fr, qa, bb, qa + pw, bb + 2, (a, b) => {
        const i = k.idx(a, b);
        g.floor[i] = y + 0.25; g.flags[i] &= ~(F.PIT | F.HAZARD | F.WATER); g.flags[i] |= F.BRIDGE | F.NOSPAWN; g.hazType[i] = 0; g.floorTex[i] = TS.WOOD; g.wallTex[i] = TS.WOOD;
        br.push(i);
      });
      k.rail(br, { style: 'wood', tex: TS.WOOD });
      // a low iron fence round the rest of the rim
      k.rail(k.cells(qa - 1, qb - 1, qa + pw + 1, qb + pd + 1).filter((i) => !cells.includes(i) && !br.includes(i)), { style: 'iron', tex: TS.METAL, height: 0.85 });
      for (const a of [qa - 1, qa + pw]) gravel(k, a, bb, a + 1, bb + 2);
      // reeds and a dead willow by the water
      for (let t = 0; t < 6; t++) { const a = qa + rng.float(0.2, pw - 0.2), b = rng.chance(0.5) ? qb + 0.25 : qb + pd - 0.25; lbox(deco, fr, a - 0.08, y - 1.3, b - 0.08, a + 0.08, y + 0.6 + rng.float(0, 0.5), b + 0.08, foul ? TS.WOOD : TS.FOLIAGE); }
      pond = true;
      break;
    }
    // hedged beds in the free quarters, statues and urns on the paths
    for (const [qa, qb] of [[1, 1], [fa + 3, 1], [1, fb + 3], [fa + 3, fb + 3]]) {
      const w = Math.min(5, fa - 3), d = Math.min(4, fb - 3);
      if (w >= 3 && d >= 3) hedgeBed(k, qa + 0.0, qb, qa + w, qb + d, { roses: !foul, dead: foul, topiary: rng.chance(0.5) });
    }
    for (let t = 0; t < 14; t++) {
      const a = rng.int(0, W - 1), b = rng.int(0, D - 1);
      if (!k.take(a, b, a + 1, b + 1, 1)) continue;
      const r = rng.int(0, 3);
      if (r === 0) P.statue(deco, P.pf(fr, a, b, a + 1, b + 1, rng.pick([0, 1, 2, 3])), 0.5, 0.5, y, { s: 0.75, wings: rng.chance(0.4) });
      else if (r === 1) P.urn(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y);
      else if (r === 2) P.topiary(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 0.38);
      else P.sundial(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y);
    }
    // lamp posts along the paths, a dead tree or two
    for (const [a, b] of [[fa - 2, 2], [fa + 2, D - 3], [2, fb - 2], [openW - 3, fb + 2]]) if (k.take(a, b, a + 1, b + 1, 0)) P.lampPost(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 3);
    for (let t = 0, n = 0; t < 20 && n < 2; t++) { const a = rng.int(1, W - 2), b = rng.int(1, D - 2); if (k.take(a - 1, b - 1, a + 2, b + 2, 0)) { P.deadTree(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, rng, { h: rng.float(4.5, 6) }); n++; } }
    void pond; void basin;
    M.room.bossSpot = { a: fa, b: fb + 3 };
  },

  // ---------------------------------------------------------- graveyard
  graveyard(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr } = k;
    lawn(k, 0, 0, W, D);
    for (const p of k.ports()) { stoop(k, p); pathFrom(k, p, 3 + (p.h - y > 0.5 ? 3 : 0)); }
    // the path from the garden gate to the mausoleum door
    const gate = k.r.ports.find((p) => p.kind === 'gardengate');
    const md = k.r.ports.find((p) => p.kind === 'mausdoor');
    if (gate && md) {
      const ga = gate.s0 + 1, ma = md.s0 + 1, mb = md.cells[0][1];
      const bm = Math.min(mb - 1, Math.max(2, Math.floor(mb / 2)));
      gravel(k, ga - 1, 0, ga + 2, bm + 1, TS.FLOOR2);
      gravel(k, Math.min(ga, ma) - 1, bm - 1, Math.max(ga, ma) + 2, bm + 2, TS.FLOOR2);
      gravel(k, ma - 1, bm, ma + 2, mb + 1, TS.FLOOR2);
      each(fr, ga - 1, 0, ga + 2, bm + 2, (a, b) => k.use(a, b, a + 1, b + 1));
      each(fr, Math.min(ga, ma) - 1, bm - 1, Math.max(ga, ma) + 2, bm + 2, (a, b) => k.use(a, b, a + 1, b + 1));
      each(fr, ma - 1, bm, ma + 2, mb + 1, (a, b) => k.use(a, b, a + 1, b + 1));
    }
    // rows of graves: headstone at the head, a mound before it
    for (let b = 1; b + 2 <= D - 1; b += 3) {
      for (let a = 1; a < W - 1; a += 2) {
        if (rng.chance(0.15) || !k.take(a, b, a + 1, b + 2, 0)) continue;
        const p = P.pf(fr, a, b, a + 1, b + 2, 2);
        const kind = rng.weighted([[0, 4], [1, 3], [3, 2], [2, 0.6]], (o) => o[1])[0];
        P.headstone(deco, p, 0.5, 0.2, y, kind);
        P.mound(deco, p, 0.15, 0.4, 0.85, 1.85, y);
      }
    }
    // an angel and an obelisk, dead trees, lanterns on posts
    for (let t = 0, n = 0; t < 30 && n < 2; t++) { const a = rng.int(1, W - 2), b = rng.int(1, D - 2); if (k.take(a, b, a + 1, b + 1, 0)) { if (n === 0) P.statue(deco, P.pf(fr, a, b, a + 1, b + 1, 3), 0.5, 0.5, y, { wings: true, s: 0.95 }); else P.headstone(deco, P.pf(fr, a, b, a + 1, b + 1, 3), 0.5, 0.5, y, 2); n++; } }
    for (let t = 0, n = 0; t < 30 && n < 3; t++) { const a = rng.int(1, W - 2), b = rng.int(1, D - 2); if (k.take(a - 1, b - 1, a + 2, b + 2, 0)) { P.deadTree(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, rng, { h: rng.float(4, 6) }); n++; } }
    for (let t = 0, n = 0; t < 30 && n < 3; t++) { const a = rng.int(0, W - 1), b = rng.int(0, D - 1); if (k.mine(a, b) && !k.res(a, b) && !k.used(a, b)) { k.use(a, b, a + 1, b + 1); P.lampPost(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 2.6); n++; } }
    M.room.bossSpot = { a: W / 2, b: D / 2 };
  },

  // ---------------------------------------------------------- the family mausoleum
  // a small stone temple: a vestibule, tombs in the side bays, the stair in
  // the middle going down to the crypt door at the back
  mausoleum(M) {
    const k = new Kit(M, M.room), { W, D, y, top, rng, deco, fr } = k;
    const st = k.ports((p) => p.kind === 'mausstair')[0];
    const s0 = st ? st.s0 : 2;
    k.flight(s0, 2, 3, D - 2, 3, CF, y, { floorTex: TS.FLOOR2, sideTex: TS.PITWALL, style: 'stone' });
    k.wellRails(s0, 2, s0 + 3, D, y, [3], { style: 'stone', wallTex: TS.PITWALL });
    k.use(s0, 2, s0 + 3, D);
    // tombs in the side bays
    for (const [a0, a1] of [[0, s0], [s0 + 3, W]]) {
      if (a1 - a0 < 2) continue;
      if (k.take(a0, 3, a1, D, 0)) P.sarcophagus(deco, P.pf(fr, a0 + 0.3, 3.3, a1 - 0.3, D - 0.4, 3), y, { effigy: true });
    }
    for (const a of [0.5, W - 0.5]) P.candleStand(deco, k.wx(a, 1.5), k.wz(a, 1.5), y, { h: 1.4 });
    P.lantern(deco, k.wx(W / 2, 1), k.wz(W / 2, 1), top - 0.9, { radius: 6, color: CANDLE });
    M.room.bossSpot = { a: 1, b: 1 };
  },
};

// ======================================================================
// exterior
// ======================================================================
export function finishExterior(M) {
  const { g, G, P: PL, deco, rng } = M;
  const W = g.w, H = g.h;
  const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
  // ---- classify solid cells (plan coordinates via the frame)
  const kind = new Uint8Array(W * H);   // 0 house, 1 boundary wall, 2 garden wall, 3 mausoleum, 4 glasshouse
  const atPlan = (u, v) => g.idx(G.cx(u, v), G.cz(u, v));
  const fore = PL.fore;
  for (let v = 0; v <= fore.v + fore.dv; v++) for (let u = 0; u < PL.Wp; u++) {
    if (!(u === 0 || u === PL.Wp - 1 || v === 0)) continue;
    const i = atPlan(u, v); if (!g.type[i]) kind[i] = 1;
  }
  { const gd = PL.garden, v = gd.v + gd.dv; for (let u = gd.u; u < gd.u + gd.du; u++) { const i = atPlan(u, v); if (!g.type[i]) kind[i] = 2; } }
  for (const [r, kd] of [[PL.maus, 3], [PL.cons, 4]]) {
    for (let v = r.v - 1; v <= r.v + r.dv; v++) for (let u = r.u - 1; u <= r.u + r.du; u++) { const i = atPlan(u, v); if (!g.type[i]) kind[i] = kd; }
  }
  const consTop = PL.cons.floor + PL.cons.ceilH + 0.35, mausTop = PL.maus.floor + PL.maus.ceilH + 0.7;
  for (let i = 0; i < W * H; i++) {
    if (g.type[i]) continue;
    const kd = kind[i];
    if (kd === 1) { g.floor[i] = 2.6; g.wallTex[i] = TS.FACADE2; g.floorTex[i] = TS.FACADE2; }
    else if (kd === 2) { g.floor[i] = 2.9; g.wallTex[i] = TS.FACADE2; g.floorTex[i] = TS.FACADE2; }
    else if (kd === 3) { g.floor[i] = mausTop; g.wallTex[i] = TS.FACADE; g.floorTex[i] = TS.ROOF; }
    else if (kd === 4) { g.floor[i] = consTop; g.wallTex[i] = TS.PILLAR; g.floorTex[i] = TS.GLASS_PLAIN; }
    else { g.floorTex[i] = TS.ROOF; }
  }
  // house cells facing the sky: the facade stone
  for (let i = 0; i < W * H; i++) {
    if (!g.type[i] || !g.sky[i]) continue;
    const x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx;
      if (!g.type[j] && kind[j] === 0) g.wallTex[j] = TS.FACADE;
    }
  }
  // ---- facade runs: (direction from the yard into the wall, plane, along range)
  const runs = new Map();
  for (let i = 0; i < W * H; i++) {
    if (!g.type[i] || !g.sky[i]) continue;
    const x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx;
      if (g.type[j]) continue;
      const line = d === 0 ? x + 1 : d === 1 ? x : d === 2 ? z + 1 : z;
      const pos = d < 2 ? z : x;
      const key = `${d}|${line}|${kind[j]}`;
      let arr = runs.get(key); if (!arr) runs.set(key, (arr = []));
      arr.push({ pos, ground: g.floor[i] });
    }
  }
  for (const [key, arr] of runs) {
    const [ds, ls, ks] = key.split('|');
    const d = +ds, line = +ls, kd = +ks;
    arr.sort((a, b) => a.pos - b.pos);
    let s0 = 0;
    for (let n = 1; n <= arr.length; n++) {
      if (n < arr.length && arr[n].pos === arr[n - 1].pos + 1) continue;
      const a = arr[s0].pos, b = arr[n - 1].pos + 1;
      const ground = Math.min(...arr.slice(s0, n).map((o) => o.ground));
      if (kd === 0) facadeRun(M, d, line, a, b, ground);
      else if (kd === 1 || kd === 2) wallRun(M, d, line, a, b, ground, kd === 1 ? 2.6 : 2.9);
      else if (kd === 3) templeRun(M, d, line, a, b, ground, mausTop);
      else if (kd === 4) glassRun(M, d, line, a, b, ground, consTop);
      s0 = n;
    }
  }
  // ---- the glasshouse from inside: panes on the inner faces, a ridged glass roof
  glasshouseInside(M);
  mausoleumOutside(M, mausTop);
  outsideDoors(M);
  gatePiers(M);
}

// a wall face of a run: box builder in run coordinates (t along, depth out
// of the wall toward the yard, y)
const INWARD = [FACE.PX, FACE.NX, FACE.PZ, FACE.NZ], OUTWARD = [FACE.NX, FACE.PX, FACE.NZ, FACE.PZ];
function faceBox(deco, d, line, t0, t1, out0, out1, y0, y1, tex, o = {}) {
  // the face's outward normal points from the wall back to the yard: -DX[d];
  // the face toward the wall is never seen
  const sgn = d === 0 || d === 2 ? -1 : 1;
  const p0 = line + sgn * out0, p1 = line + sgn * out1;
  const opt = { ...o, faces: (o.faces ?? 63) & ~INWARD[d] };
  if (d < 2) return deco.box(Math.min(p0, p1), y0, t0, Math.max(p0, p1), y1, t1, tex, opt);
  return deco.box(t0, y0, Math.min(p0, p1), t1, y1, Math.max(p0, p1), tex, opt);
}
// house facade: plinth, string course, eaves cornice, windows in two rows,
// the stepped slate roof above and chimney stacks
const HOUSE_TOP = 13;
function facadeRun(M, d, line, a, b, ground) {
  const { deco, rng } = M;
  const len = b - a;
  const FB = (t0, t1, o0, o1, y0, y1, tex, o) => faceBox(deco, d, line, t0, t1, o0, o1, y0, y1, tex, o);
  const front = FACE.SIDES | FACE.TOP;
  FB(a, b, 0, 0.12, ground, GF + 0.15, TS.PITWALL, { faces: front });                // plinth
  FB(a, b, 0, 0.14, UF - 0.35, UF - 0.1, TS.TRIM, { faces: front | FACE.BOTTOM });     // string course
  FB(a, b, 0, 0.35, HOUSE_TOP - 0.45, HOUSE_TOP, TS.TRIM, { faces: front | FACE.BOTTOM }); // cornice
  // windows: centred in the run, every 3 cells
  if (len >= 2) {
    const n = Math.max(1, Math.floor((len - 1) / 3));
    const step = len / n;
    for (let k = 0; k < n; k++) {
      const c = a + step * (k + 0.5);
      for (const [y0, y1] of [[GF + 1.0, GF + 3.3], [UF + 0.9, UF + 3.0]]) {
        if (y0 < ground + 0.6) continue;
        const lit = rng.chance(0.2);
        FB(c - 0.55, c + 0.55, 0, 0.02, y0, y1, TS.GLASS, { uv: 'fit', emissive: lit ? 0.7 : 0.25, faces: OUTWARD[d] });
        FB(c - 0.7, c - 0.55, 0, 0.12, y0 - 0.1, y1 + 0.1, TS.PILLAR, { faces: front });
        FB(c + 0.55, c + 0.7, 0, 0.12, y0 - 0.1, y1 + 0.1, TS.PILLAR, { faces: front });
        FB(c - 0.8, c + 0.8, 0, 0.18, y0 - 0.2, y0 - 0.05, TS.TRIM, { faces: front | FACE.BOTTOM });
        FB(c - 0.8, c + 0.8, 0, 0.2, y1 + 0.05, y1 + 0.35, TS.TRIM, { faces: front | FACE.BOTTOM });
        if (lit) {
          const sgn = d === 0 || d === 2 ? -1 : 1;
          const lx = d < 2 ? line + sgn * 0.6 : c, lz = d < 2 ? c : line + sgn * 0.6;
          deco.light(lx, (y0 + y1) / 2, lz, CANDLE, 3.5, { flicker: true });
        }
      }
    }
  }
  // the roof: slate courses stepping back from the eaves
  for (let s = 0; s < 4; s++) FB(a - 0.3, b + 0.3, -0.75 * s - 0.9, -0.75 * s + 0.35, HOUSE_TOP + s * 0.55, HOUSE_TOP + (s + 1) * 0.55, TS.ROOF, { faces: FACE.SIDES | FACE.TOP });
  // chimney stacks on long runs
  if (len >= 8) for (let c = a + 3 + rng.int(0, 2); c < b - 2; c += rng.int(8, 12)) {
    FB(c - 0.6, c + 0.6, -3.6, -2.6, HOUSE_TOP, HOUSE_TOP + 4.2, TS.FACADE, { faces: FACE.SIDES | FACE.TOP });
    FB(c - 0.72, c + 0.72, -3.72, -2.48, HOUSE_TOP + 4.0, HOUSE_TOP + 4.3, TS.TRIM);
    for (const t of [-0.3, 0.3]) FB(c + t - 0.12, c + t + 0.12, -3.22, -2.98, HOUSE_TOP + 4.3, HOUSE_TOP + 4.75, TS.ROCK, { faces: FACE.SIDES | FACE.TOP });
  }
  // drainpipes at the ends of the run
  if (len >= 4) for (const t of [a + 0.25, b - 0.25]) FB(t - 0.07, t + 0.07, 0.02, 0.16, ground, HOUSE_TOP - 0.45, TS.METAL, { faces: FACE.SIDES });
}
// low mossy walls: a coping on top, buttress piers; the boundary wall carries an iron railing
function wallRun(M, d, line, a, b, ground, top) {
  const { deco } = M;
  const FB = (t0, t1, o0, o1, y0, y1, tex, o) => faceBox(deco, d, line, t0, t1, o0, o1, y0, y1, tex, o);
  FB(a, b, -0.15, 0.08, top, top + 0.15, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
  for (let t = a + 2; t < b - 1; t += 4) FB(t - 0.3, t + 0.3, 0, 0.22, ground, top + 0.4, TS.FACADE2, { faces: FACE.SIDES | FACE.TOP });
  if (top < 2.7) {
    // iron railing along the top of the boundary wall
    const sgn = d === 0 || d === 2 ? -1 : 1;
    const L = line + sgn * -0.45;
    for (let t = a; t < b; t += 2) {
      const t1 = Math.min(b, t + 2);
      if (d < 2) P.ironFence(deco, L, t, L, t1, top + 0.15, 1.1); else P.ironFence(deco, t, L, t1, L, top + 0.15, 1.1);
    }
  }
}
// the mausoleum's walls: dressed stone with pilasters, a frieze and the roof
function templeRun(M, d, line, a, b, ground, top) {
  const { deco } = M;
  const FB = (t0, t1, o0, o1, y0, y1, tex, o) => faceBox(deco, d, line, t0, t1, o0, o1, y0, y1, tex, o);
  FB(a, b, 0, 0.15, ground, ground + 0.5, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP });
  FB(a, b, 0, 0.3, top - 0.5, top, TS.TRIM, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
  for (let t = a + 0.5; t < b; t += 2) FB(t - 0.2, t + 0.2, 0, 0.18, ground + 0.5, top - 0.5, TS.PILLAR, { faces: FACE.SIDES });
  for (let s = 0; s < 3; s++) FB(a - 0.2 + s * 0.5, b + 0.2 - s * 0.5, -0.6 * s - 0.6, -0.6 * s + 0.3, top + s * 0.45, top + (s + 1) * 0.45, TS.ROOF, { faces: FACE.SIDES | FACE.TOP });
}
// the glasshouse walls seen from the garden: a stone base, panes between iron mullions
function glassRun(M, d, line, a, b, ground, top) {
  const { deco } = M;
  const FB = (t0, t1, o0, o1, y0, y1, tex, o) => faceBox(deco, d, line, t0, t1, o0, o1, y0, y1, tex, o);
  const base = GF + 0.5;
  FB(a, b, 0, 0.12, ground, base, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP });
  paneGrid(FB, a, b, base, top - 0.3, OUTWARD[d]);
  FB(a, b, 0, 0.12, top - 0.3, top, TS.METAL, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
  // the glass roof ridge rising from the eaves
  for (let s = 0; s < 3; s++) FB(a, b, -0.9 * s - 0.9, -0.9 * s, top + s * 0.6, top + (s + 1) * 0.6, TS.GLASS_PLAIN, { faces: FACE.SIDES | FACE.TOP, emissive: 0.2 });
}
function paneGrid(FB, a, b, y0, y1, out) {
  const rows = Math.max(1, Math.round((y1 - y0) / 1.6));
  const rh = (y1 - y0) / rows;
  for (let t = a; t < b; t++) {
    for (let r = 0; r < rows; r++) FB(t + 0.06, t + 0.94, 0, 0.03, y0 + r * rh + 0.05, y0 + (r + 1) * rh - 0.05, TS.GLASS_PLAIN, { uv: 'fit', emissive: 0.3, faces: out });
    FB(t - 0.05, t + 0.05, 0, 0.08, y0, y1, TS.METAL, { faces: FACE.SIDES });
  }
  for (let r = 1; r < rows; r++) FB(a, b, 0, 0.07, y0 + r * rh - 0.05, y0 + r * rh + 0.05, TS.METAL, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
}
// the glasshouse inside: panes on the inner faces of its walls, iron ribs over the roof
function glasshouseInside(M) {
  const { g, deco } = M;
  const r = M.P.cons;
  if (!r.cells) return;
  const set = new Set(r.cells);
  const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
  const top = r.floor + r.ceilH;
  for (const i of r.cells) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const j = g.idx(x + DX[d], z + DZ[d]);
      if (set.has(j) || g.type[j]) continue;
      const line = d === 0 ? x + 1 : d === 1 ? x : d === 2 ? z + 1 : z;
      const t = d < 2 ? z : x;
      // (faceBox's directions run from the open side into the wall: from this cell, d)
      const FB2 = (t0, t1, o0, o1, y0, y1, tex, o) => faceBox(deco, d, line, t0, t1, o0, o1, y0, y1, tex, o);
      FB2(t, t + 1, 0, 0.12, r.floor, r.floor + 0.5, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP });
      paneGrid(FB2, t, t + 1, r.floor + 0.5, top, OUTWARD[d]);
    }
  }
  // ribs across the glass roof
  const xs = r.cells.map((i) => i % g.w), zs = r.cells.map((i) => (i / g.w) | 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
  for (const i of r.cells) g.ceilTex[i] = TS.GLASS_PLAIN;
  if (x1 - x0 >= z1 - z0) for (let x = x0 + 1; x < x1; x += 2) deco.box(x - 0.06, top - 0.25, z0, x + 0.06, top, z1, TS.METAL);
  else for (let z = z0 + 1; z < z1; z += 2) deco.box(x0, top - 0.25, z - 0.06, x1, top, z + 0.06, TS.METAL);
}
// the mausoleum: columns flanking the door, a pediment over it, an angel on the roof
function mausoleumOutside(M, top) {
  const { deco } = M;
  const r = M.P.maus, l = M.P.links.find((x) => x.kind === 'mausdoor');
  if (!l || !r.fr) return;
  const fr = r.fr;
  // in the mausoleum's local frame the door is in the -b wall (b = -1): outside is b < -1
  const a0 = l.pos - r.u, a1 = a0 + 3;
  for (const a of [a0 - 0.6, a1 + 0.6]) deco.pillar(fr.px(a, -2.0), fr.pz(a, -2.0), 0.45, 0, top - 0.5, { tex: TS.PILLAR, trimTex: TS.TRIM });
  lbox(deco, fr, a0 - 1.2, top - 0.5, -2.5, a1 + 1.2, top, -1, TS.TRIM);
  for (let s = 0; s < 3; s++) lbox(deco, fr, a0 - 1.3 + s * 0.8, top + s * 0.4, -2.6, a1 + 1.3 - s * 0.8, top + (s + 1) * 0.4, -1, TS.ROOF, { faces: FACE.SIDES | FACE.TOP });
  P.statue(deco, P.pf(fr, a0, 2, a1, 4, 3), 1.5, 1, top + 1.2, { wings: true, s: 0.9 });
  P.lantern(deco, fr.px(a0 - 0.6, -1.6), fr.pz(a0 - 0.6, -1.6), 2.4, { chain: 0.6, radius: 6, color: CANDLE });
}
// stone surrounds round the outside doors of the house
function outsideDoors(M) {
  const { deco, P: PL } = M;
  for (const l of PL.links) {
    if (!l.active) continue;
    const yard = l.A.sky ? l.A : l.B.sky ? l.B : null;
    if (!yard || l.kind === 'mausdoor' || l.kind === 'gardengate') continue;
    const p = yard === l.A ? l.portA : l.portB;
    const fr = yard.fr;
    // the wall plane on the yard side: the edge beyond the port cells
    const da = p.dir === 0 ? 1 : p.dir === 1 ? -1 : 0, db = p.dir === 2 ? 1 : p.dir === 3 ? -1 : 0;
    const [c0a, c0b] = p.cells[0], [c1a, c1b] = p.cells[p.cells.length - 1];
    const ea = da > 0 ? c0a + 1 : da < 0 ? c0a : null, eb = db > 0 ? c0b + 1 : db < 0 ? c0b : null;
    const y0 = p.h, y1 = p.h + (l.w >= 3 ? 3.4 : 3.0);
    const big = l.kind === 'frontdoor';
    const jamb = (s) => {
      if (ea !== null) lbox(deco, fr, ea - da * 0.2, y0, s - 0.3, ea, y1 + 0.2, s, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP });
      else lbox(deco, fr, s - 0.3, y0, eb - db * 0.2, s, y1 + 0.2, eb, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP });
    };
    const lo = Math.min(c0a, c1a, c0b, c1b) , s0 = ea !== null ? Math.min(c0b, c1b) : Math.min(c0a, c1a), s1 = (ea !== null ? Math.max(c0b, c1b) : Math.max(c0a, c1a)) + 1;
    void lo;
    jamb(s0); jamb(s1 + 0.3);
    if (ea !== null) lbox(deco, fr, ea - da * (big ? 0.35 : 0.25), y1, s0 - 0.45, ea, y1 + (big ? 0.8 : 0.45), s1 + 0.45, TS.TRIM);
    else lbox(deco, fr, s0 - 0.45, y1, eb - db * (big ? 0.35 : 0.25), s1 + 0.45, y1 + (big ? 0.8 : 0.45), eb, TS.TRIM);
    if (!big) P.lantern(deco, fr.px(ea !== null ? ea - da * 0.5 : s1 + 0.6, ea !== null ? s1 + 0.6 : eb - db * 0.5), fr.pz(ea !== null ? ea - da * 0.5 : s1 + 0.6, ea !== null ? s1 + 0.6 : eb - db * 0.5), y0 + 2.3, { chain: 0.5, radius: 5 });
  }
}
// gate piers at the end of the drive on the boundary wall, the gates standing open
function gatePiers(M) {
  const { deco } = M;
  const F0 = M.fore;
  if (!F0) return;
  const { k, da0, dw } = F0;
  for (const a of [da0 - 0.5, da0 + dw + 0.5]) {
    lbox(deco, k.fr, a - 0.45, 0, -1.0, a + 0.45, 3.4, -0.1, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP });
    lbox(deco, k.fr, a - 0.55, 3.4, -1.1, a + 0.55, 3.6, 0, TS.TRIM);
    P.urn(deco, k.wx(a, -0.55), k.wz(a, -0.55), 3.6);
  }
  // the iron gates swung open against the inside of the wall
  const fr = k.fr;
  for (const [a, s] of [[da0, -1], [da0 + dw, 1]]) {
    const x0 = fr.px(a, 0.08), z0 = fr.pz(a, 0.08), x1 = fr.px(a + s * 2.2, 0.08), z1 = fr.pz(a + s * 2.2, 0.08);
    if (Math.abs(z1 - z0) < 0.01) P.ironFence(deco, Math.min(x0, x1), z0, Math.max(x0, x1), z0, 0, 2.2);
    else P.ironFence(deco, x0, Math.min(z0, z1), x0, Math.max(z0, z1), 0, 2.2);
  }
}
