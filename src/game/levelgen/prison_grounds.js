// Outdoor parts of the prison archetype (see gen_prison.js): the forecourt
// inside the vehicle gate, the exercise yard with its fenced court and watch
// towers, and the exterior pass: building facades (plinth, slit windows,
// cornice, parapet, floodlights) and the perimeter wall (coping, piers,
// razor wire, lamps) seen from the yards.
import { Kit, TS, F, FACE, OPP, lbox, llight, each } from './mansion_kit.js';
import * as P from './prison_props.js';
import * as MP from './mansion_props.js';

const GF = 0.6, TOWER = 4.8, PERIM = 6.0, BLDG_TOP = 13.2;
const STEEL_STAIR = { floorTex: TS.FLOOR2, sideTex: TS.METAL, style: 'metal' };

const paint = (k, a0, b0, a1, b1, tex) => each(k.fr, a0, b0, a1, b1, (a, b) => {
  if (!k.mine(a, b) || (k.g.flags[k.idx(a, b)] & (F.STAIR | F.DOOR)) || Math.abs(k.fl(a, b) - k.y) > 0.01) return;
  k.g.floorTex[k.idx(a, b)] = tex;
});
// a fence on the cell-edge line between local rows (along a, at b = line) or
// columns (along b, at a = line) from s0 to s1; blocks the grid edges too
function fence(k, alongA, line, s0, s1, h = 3.2) {
  const { fr, g, deco } = k;
  for (let s = s0; s < s1; s++) {
    const [a, b] = alongA ? [s, line] : [line, s];
    const [a2, b2] = alongA ? [s, line - 1] : [line - 1, s];
    const d = alongA ? 3 : 1;   // local direction from (a, b) across the line
    if (k.mine(a, b)) g.setEdge(fr.cx(a, b), fr.cz(a, b), fr.dir(d), true);
    if (k.mine(a2, b2)) g.setEdge(fr.cx(a2, b2), fr.cz(a2, b2), fr.dir(OPP[d]), true);
  }
  const p0 = alongA ? [fr.px(s0, line), fr.pz(s0, line)] : [fr.px(line, s0), fr.pz(line, s0)];
  const p1 = alongA ? [fr.px(s1, line), fr.pz(s1, line)] : [fr.px(line, s1), fr.pz(line, s1)];
  P.chainFence(deco, p0[0], p0[1], p1[0], p1[1], k.y, h);
}
// a watch tower: a concrete platform at TOWER over local rect, a steel
// flight to it (cells given), rails, the cabin with its searchlight
function tower(k, a0, b0, a1, b1, fl) {
  const { deco, fr } = k;
  k.floorRect(a0, b0, a1, b1, TOWER, { floorTex: TS.FLOOR2, wallTex: TS.PILLAR });
  k.use(a0, b0, a1, b1);
  k.flight(fl.a, fl.b, fl.na, fl.nb, fl.ld, k.y, TOWER, STEEL_STAIR);
  k.rail(k.cells(a0, b0, a1, b1), { style: 'metal' });
  P.towerCabin(deco, fr, a0 + 0.15, b0 + 0.15, a1 - 0.15, b1 - 0.15, TOWER, { glass: [] });   // an open post: the guards shoot from it
  // the legs under the platform edge (pilasters on its face)
  for (const [a, b] of [[a0, b0], [a1 - 0.3, b0], [a0, b1 - 0.3], [a1 - 0.3, b1 - 0.3]]) lbox(deco, fr, a - 0.05, k.y, b - 0.05, a + 0.35, TOWER, b + 0.35, TS.METAL, { faces: FACE.SIDES });
}

export const PRISON_GROUNDS = {
  // ---------------------------------------------------------- forecourt
  forecourt(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr, g } = k;
    const fd = k.ports((p) => p.kind === 'frontdoor')[0];
    const fc = fd ? (fd.s0 + fd.s1) / 2 : W / 2;
    // the drive from the gate to the doors, parking on both sides
    const d0 = Math.round(fc - 3), d1 = d0 + 6;
    paint(k, d0, 0, d1, D, TS.ROAD);
    for (const side of [-1, 1]) {
      const a0 = side < 0 ? d0 - 12 : d1 + 1, a1 = side < 0 ? d0 - 1 : d1 + 12;
      for (let a = a0; a < a1; a += 3) paint(k, a, 3, a + 1, 6, TS.PAINT);
    }
    // the vehicle gate in the perimeter wall behind the start, a gantry over it
    const ga0 = d0 - 0.5, ga1 = d1 + 0.5;
    lbox(deco, fr, ga0, y, -0.12, ga1, y + 5.2, 0, { side: TS.METAL, pz: TS.PANEL, nz: TS.PANEL, px: TS.METAL, nx: TS.METAL }, { uv: 'fit', faces: FACE.SIDES });
    for (const a of [ga0 - 0.6, ga1]) lbox(deco, fr, a, y, -0.4, a + 0.6, y + 6.6, 0.3, TS.PILLAR, { solid: true });
    lbox(deco, fr, ga0 - 0.6, y + 5.8, -0.4, ga1 + 0.6, y + 6.6, 0.3, TS.ACCENT, { uv: 'fit' });
    for (const a of [ga0 + 1, ga1 - 1]) llight(deco, fr, a, y + 5.4, 0.8, P.SODIUM, 8);
    // the gatehouse: a small booth by the gate with a raised boom
    const gs = rng.pick([-1, 1]);
    const ha0 = gs < 0 ? d0 - 5 : d1 + 1, hb0 = 1;
    if (k.take(ha0, hb0, ha0 + 4, hb0 + 3, 0)) {
      lbox(deco, fr, ha0 + 0.1, y, hb0 + 0.1, ha0 + 3.9, y + 1.0, hb0 + 2.9, TS.FACADE, { solid: true });
      lbox(deco, fr, ha0 + 0.1, y + 1.0, hb0 + 0.1, ha0 + 3.9, y + 2.4, hb0 + 2.9, TS.GLASS_PLAIN, { emissive: 0.3, solid: true });
      for (const [a, b] of [[ha0 + 0.1, hb0 + 0.1], [ha0 + 3.7, hb0 + 0.1], [ha0 + 0.1, hb0 + 2.7], [ha0 + 3.7, hb0 + 2.7]]) lbox(deco, fr, a, y + 1, b, a + 0.2, y + 2.4, b + 0.2, TS.METAL);
      lbox(deco, fr, ha0 - 0.2, y + 2.4, hb0 - 0.2, ha0 + 4.2, y + 2.7, hb0 + 3.2, TS.ROOF);
      llight(deco, fr, ha0 + 2, y + 2.0, hb0 + 1.5, P.FLUO, 5);
      const ba = gs < 0 ? d0 - 0.3 : d1 + 0.3;
      lbox(deco, fr, ba - 0.2, y, hb0 + 1.3, ba + 0.2, y + 1.1, hb0 + 1.7, TS.ACCENT, { uv: 'fit', solid: true });
      lbox(deco, fr, ba - 0.06, y + 1.1, hb0 + 1.44, ba + 0.06, y + 5.0, hb0 + 1.56, TS.ACCENT);
    }
    // the bus and a car in the bays
    for (const side of rng.shuffle([-1, 1])) {
      const a0 = side < 0 ? d0 - 11 : d1 + 2;
      if (k.take(a0, 3, a0 + 9, 6, 0)) {
        const ax = !(fr.bd < 2);   // the bus lies along local a
        P.bus(deco, k.wx(a0 + 4.5, 4.5), k.wz(a0 + 4.5, 4.5), y, ax);
        break;
      }
    }
    for (let t = 0; t < 6; t++) {
      const a = rng.int(1, W - 4), b = rng.int(2, D - 6);
      if (Math.abs(a + 1 - fc) < 6 || !k.take(a, b, a + 3, b + 2, 0)) continue;
      const [x0, z0, x1, z1] = fr.rect(a + 0.3, b + 0.4, a + 2.5, b + 1.45);
      deco.car(x0, z0, y, x1 - x0 > z1 - z0, { length: 2.2 });
      void x1; void z1;
    }
    // the canopy over the doors: steel posts and a deck at GF + 3.4
    if (fd) {
      const ca0 = fd.s0 - 2, ca1 = fd.s1 + 2, cb0 = D - 4;
      for (const a of [ca0 + 0.2, ca1 - 0.4]) lbox(deco, fr, a, y, cb0 + 0.2, a + 0.2, GF + 3.6, cb0 + 0.4, TS.METAL, { solid: true });
      lbox(deco, fr, ca0, GF + 3.6, cb0, ca1, GF + 3.9, D, TS.METAL);
      lbox(deco, fr, ca0 + 0.1, GF + 3.55, cb0 + 0.1, ca1 - 0.1, GF + 3.6, D - 0.1, TS.LIGHT, { uv: 'fit', emissive: 0.6, faces: FACE.BOTTOM });
      llight(deco, fr, (ca0 + ca1) / 2, GF + 3.0, D - 2, P.FLUO, 9);
      paint(k, fd.s0 - 1, D - 4, fd.s1 + 1, D, TS.FLOOR3);
      // a flag pole and jersey barriers either side of the walk
      if (k.take(ca1 + 1, D - 3, ca1 + 2, D - 2, 0)) {
        lbox(deco, fr, ca1 + 1.45, y, D - 2.55, ca1 + 1.55, y + 8, D - 2.45, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
        lbox(deco, fr, ca1 + 1.55, y + 6.6, D - 2.52, ca1 + 3.0, y + 7.7, D - 2.48, TS.FABRIC);
      }
    }
    for (const side of [-1, 1]) for (let t = 0; t < 3; t++) {
      const a = side < 0 ? d0 - 2 - t * 3 : d1 + 1 + t * 3, b = D - 6;
      if (k.take(a, b, a + 2, b + 1, 0)) deco.barrier(k.wx(a, b + 0.5), k.wz(a, b + 0.5), k.wx(a + 2, b + 0.5), k.wz(a + 2, b + 0.5), y, TS.PILLAR);
    }
    // floodlight masts at the corners
    for (const [a, b] of [[1, 1], [W - 2, 1], [1, D - 2], [W - 2, D - 2]]) {
      if (!k.take(a, b, a + 1, b + 1, 0)) continue;
      const dx = fr.px(W / 2, D / 2) - k.wx(a + 0.5, b + 0.5), dz = fr.pz(W / 2, D / 2) - k.wz(a + 0.5, b + 0.5);
      const n = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
      P.floodMast(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 8.5, n[0], n[1]);
    }
    M.room.bossSpot = { a: fc, b: D / 2 };
  },

  // ---------------------------------------------------------- exercise yard
  yard(M) {
    const k = new Kit(M, M.room), { W, D, y, rng, deco, fr, g } = k;
    // paths of paving from the doors
    for (const p of k.ports()) {
      const back = OPP[p.dir], da = back === 0 ? 1 : back === 1 ? -1 : 0, db = back === 2 ? 1 : back === 3 ? -1 : 0;
      for (let t = 0; t < 5; t++) for (const [a0, b0] of p.cells) paint(k, a0 + da * t, b0 + db * t, a0 + da * t + 1, b0 + db * t + 1, TS.SIDEWALK);
    }
    // watch towers in the two far corners (the perimeter sides: +a and +b)
    const towers = [];
    // corner (+a, +b): platform at the corner, the flight up along the +a wall
    {
      const a0 = W - 3, b0 = D - 3;
      const fl = { a: W - 2, b: D - 3 - 8, na: 2, nb: 8, ld: 2 };
      if (k.free(a0, b0, W, D) && k.free(fl.a, fl.b - 1, W, D - 3)) { tower(k, a0, b0, W, D, fl); towers.push([a0, b0]); }
    }
    // corner (+a, -b): the flight along the +a wall the other way
    {
      const a0 = W - 3, b0 = 0;
      const fl = { a: W - 2, b: 3, na: 2, nb: 8, ld: 3 };
      if (D >= 22 && k.free(a0, b0, W, 3) && k.free(fl.a, 3, W, 12)) { tower(k, a0, b0, W, 3, fl); towers.push([a0, b0]); }
    }
    // corner (-a, +b): the flight along the +b wall
    if (towers.length < 2) {
      const a0 = 0, b0 = D - 3;
      const fl = { a: 3, b: D - 2, na: 8, nb: 2, ld: 1 };
      if (k.free(a0, b0, 3, D) && k.free(3, D - 2, 12, D)) { tower(k, a0, b0, 3, D, fl); towers.push([a0, b0]); }
    }
    // the court: asphalt with painted lines, hoops at the ends, fenced with two gaps
    const cw = Math.min(16, W - 14), ch = Math.min(10, D - 8);
    const ca0 = Math.floor((W - cw) / 2) - 2, cb0 = Math.floor((D - ch) / 2);
    if (cw >= 10 && k.free(ca0 - 1, cb0 - 1, ca0 + cw + 1, cb0 + ch + 1)) {
      paint(k, ca0, cb0, ca0 + cw, cb0 + ch, TS.ROAD);
      paint(k, ca0, cb0, ca0 + cw, cb0 + 1, TS.PAINT); paint(k, ca0, cb0 + ch - 1, ca0 + cw, cb0 + ch, TS.PAINT);
      paint(k, ca0 + Math.floor(cw / 2), cb0, ca0 + Math.floor(cw / 2) + 1, cb0 + ch, TS.PAINT);
      const mid = cb0 + Math.floor(ch / 2);
      for (const [a, face] of [[ca0, 0], [ca0 + cw - 1, 1]]) P.hoop(deco, P.pf(fr, a, mid - 0.5, a + 1, mid + 0.5, face), y);
      k.use(ca0, cb0, ca0 + cw, cb0 + ch);
      // the fence round it: gaps of 3 in the middle of the long sides
      const gm = ca0 + Math.floor(cw / 2) - 1;
      for (const line of [cb0 - 1, cb0 + ch + 1]) { fence(k, true, line, ca0 - 1, gm); fence(k, true, line, gm + 3, ca0 + cw + 1); }
      for (const line of [ca0 - 1, ca0 + cw + 1]) fence(k, false, line, cb0 - 1, cb0 + ch + 1);
    }
    // benches, weight benches and picnic tables round the edges
    for (let t = 0; t < 30; t++) {
      // (a picnic table with its benches spans 2 x 2.7: it takes a 3 x 3 square)
      const a = rng.int(1, W - 4), b = rng.int(1, D - 4), r = t % 3;
      if (!k.take(a, b, a + 3, b + (r === 0 ? 3 : 2), 1)) continue;
      if (r === 0) P.picnicTable(deco, k.wx(a + 1.5, b + 1.5), k.wz(a + 1.5, b + 1.5), y, !(fr.bd < 2));
      else if (r === 1) P.weightBench(deco, k.wx(a + 1.5, b + 1), k.wz(a + 1.5, b + 1), y, !(fr.bd < 2));
      else MP.bench(deco, P.pf(fr, a + 0.2, b + 0.4, a + 2.8, b + 1.1, 2), y);
    }
    // floodlight masts
    for (const [a, b] of [[Math.floor(W / 2), 1], [Math.floor(W / 2), D - 2], [1, Math.floor(D / 2)], [W - 4, Math.floor(D / 2)]]) {
      if (!k.take(a, b, a + 1, b + 1, 0)) continue;
      const dx = fr.px(W / 2, D / 2) - k.wx(a + 0.5, b + 0.5), dz = fr.pz(W / 2, D / 2) - k.wz(a + 0.5, b + 0.5);
      const n = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
      P.floodMast(deco, k.wx(a + 0.5, b + 0.5), k.wz(a + 0.5, b + 0.5), y, 9, n[0], n[1]);
    }
    M.room.bossSpot = { a: W / 2 - 2, b: D / 2 };
    void g;
  },
};

// ======================================================================
// exterior: facades of the buildings and the perimeter wall
// ======================================================================
const INWARD = [FACE.PX, FACE.NX, FACE.PZ, FACE.NZ], OUTWARD = [FACE.NX, FACE.PX, FACE.NZ, FACE.PZ];
function faceBox(deco, d, line, t0, t1, out0, out1, y0, y1, tex, o = {}) {
  const sgn = d === 0 || d === 2 ? -1 : 1;
  const p0 = line + sgn * out0, p1 = line + sgn * out1;
  const opt = { ...o, faces: (o.faces ?? 63) & ~INWARD[d] };
  if (d < 2) return deco.box(Math.min(p0, p1), y0, t0, Math.max(p0, p1), y1, t1, tex, opt);
  return deco.box(t0, y0, Math.min(p0, p1), t1, y1, Math.max(p0, p1), tex, opt);
}
export function finishExterior(M) {
  const { g, deco } = M;
  const W = g.w, H = g.h;
  const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
  const perim = (i) => { const x = i % W, z = (i / W) | 0; return x === 0 || z === 0 || x === W - 1 || z === H - 1; };
  for (let i = 0; i < W * H; i++) {
    if (g.type[i]) continue;
    if (perim(i)) { g.floor[i] = PERIM; g.wallTex[i] = TS.FACADE2; g.floorTex[i] = TS.FACADE2; }
    else g.floorTex[i] = TS.ROOF;
  }
  // building cells facing a yard: the facade brick
  for (let i = 0; i < W * H; i++) {
    if (!g.type[i] || !g.sky[i]) continue;
    const x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx;
      if (!g.type[j] && !perim(j)) g.wallTex[j] = TS.FACADE;
    }
  }
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
      const key = `${d}|${line}|${perim(j) ? 1 : 0}`;
      let arr = runs.get(key); if (!arr) runs.set(key, (arr = []));
      arr.push({ pos, ground: g.floor[i] });
    }
  }
  for (const [key, arr] of runs) {
    const [ds, ls, ks] = key.split('|');
    const d = +ds, line = +ls, per = ks === '1';
    arr.sort((a, b) => a.pos - b.pos);
    let s0 = 0;
    for (let n = 1; n <= arr.length; n++) {
      if (n < arr.length && arr[n].pos === arr[n - 1].pos + 1) continue;
      const a = arr[s0].pos, b = arr[n - 1].pos + 1;
      const ground = Math.min(...arr.slice(s0, n).map((o) => o.ground));
      if (per) perimeterRun(M, d, line, a, b, ground);
      else facadeRun(M, d, line, a, b, ground);
      s0 = n;
    }
  }
}
// the cell house facades: a concrete plinth, rows of slit windows with bars,
// string courses, the cornice and a parapet; floodlights on brackets
function facadeRun(M, d, line, a, b, ground) {
  const { deco, rng } = M;
  const len = b - a;
  const FB = (t0, t1, o0, o1, y0, y1, tex, o) => faceBox(deco, d, line, t0, t1, o0, o1, y0, y1, tex, o);
  const front = FACE.SIDES | FACE.TOP;
  FB(a, b, 0, 0.12, ground, GF + 0.9, TS.PILLAR, { faces: front });
  for (const yy of [4.6, 8.8]) FB(a, b, 0, 0.12, yy, yy + 0.25, TS.PILLAR, { faces: front | FACE.BOTTOM });
  FB(a, b, 0, 0.3, BLDG_TOP - 0.5, BLDG_TOP, TS.PILLAR, { faces: front | FACE.BOTTOM });
  FB(a, b, -0.2, 0.05, BLDG_TOP, BLDG_TOP + 1.0, TS.FACADE, { faces: FACE.SIDES | FACE.TOP });
  if (len >= 2) {
    const n = Math.max(1, Math.floor((len - 1) / 3));
    const step = len / n;
    for (let k = 0; k < n; k++) {
      const c = a + step * (k + 0.5);
      for (const [y0, y1] of [[2.2, 4.0], [5.8, 7.8], [10.0, 12.0]]) {
        if (y0 < ground + 1.2) continue;
        FB(c - 0.3, c + 0.3, 0, 0.02, y0, y1, TS.GLASS, { uv: 'fit', emissive: rng.chance(0.25) ? 0.6 : 0.2, faces: OUTWARD[d] });
        for (let t = c - 0.22; t <= c + 0.23; t += 0.15) FB(t - 0.02, t + 0.02, 0.02, 0.07, y0, y1, TS.RAIL, { faces: FACE.SIDES });
        FB(c - 0.45, c + 0.45, 0, 0.14, y0 - 0.15, y0, TS.PILLAR, { faces: front | FACE.BOTTOM });
        FB(c - 0.45, c + 0.45, 0, 0.1, y1, y1 + 0.15, TS.PILLAR, { faces: front | FACE.BOTTOM });
      }
    }
  }
  // floodlights on brackets along long runs
  if (len >= 8) for (let c = a + 4; c < b - 2; c += 10) {
    FB(c - 0.1, c + 0.1, 0, 0.9, BLDG_TOP - 1.4, BLDG_TOP - 1.25, TS.METAL);
    FB(c - 0.45, c + 0.45, 0.6, 1.0, BLDG_TOP - 1.9, BLDG_TOP - 1.4, TS.METAL);
    FB(c - 0.4, c + 0.4, 0.62, 0.98, BLDG_TOP - 1.95, BLDG_TOP - 1.9, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM });
    const sgn = d === 0 || d === 2 ? -1 : 1;
    const lx = d < 2 ? line + sgn * 2.5 : c, lz = d < 2 ? c : line + sgn * 2.5;
    deco.light(lx, BLDG_TOP - 3, lz, P.SODIUM, 12);
  }
  if (len >= 4) for (const t of [a + 0.25, b - 0.25]) FB(t - 0.07, t + 0.07, 0.02, 0.16, ground, BLDG_TOP - 0.5, TS.METAL, { faces: FACE.SIDES });
}
// the perimeter wall: piers, a coping, razor wire on brackets, lamps
function perimeterRun(M, d, line, a, b, ground) {
  const { deco } = M;
  const FB = (t0, t1, o0, o1, y0, y1, tex, o) => faceBox(deco, d, line, t0, t1, o0, o1, y0, y1, tex, o);
  FB(a, b, -0.1, 0.18, PERIM - 0.25, PERIM, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
  for (let t = a + 2; t < b - 1; t += 4) FB(t - 0.3, t + 0.3, 0, 0.25, ground, PERIM, TS.PILLAR, { faces: FACE.SIDES | FACE.TOP });
  // wire brackets leaning in, the coil along them
  const sgn = d === 0 || d === 2 ? -1 : 1;
  for (let t = a + 1; t < b; t += 3) FB(t - 0.04, t + 0.04, 0.0, 0.6, PERIM, PERIM + 0.9, TS.METAL, { faces: FACE.SIDES });
  const L = line + sgn * 0.45;
  if (d < 2) P.razorWire(deco, false, a, b, L, PERIM + 0.5); else P.razorWire(deco, true, a, b, L, PERIM + 0.5);
  for (let t = a + 4; t < b - 1; t += 9) {
    FB(t - 0.15, t + 0.15, 0.0, 0.35, PERIM - 1.2, PERIM - 0.8, TS.METAL);
    FB(t - 0.12, t + 0.12, 0.05, 0.3, PERIM - 1.4, PERIM - 1.2, TS.LIGHT, { uv: 'fit', emissive: 1 });
    const lx = d < 2 ? line + sgn * 1.2 : t, lz = d < 2 ? t : line + sgn * 1.2;
    deco.light(lx, PERIM - 1.8, lz, P.SODIUM, 7);
  }
}
