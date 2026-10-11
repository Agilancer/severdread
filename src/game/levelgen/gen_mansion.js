// "Mansion" archetype: a gothic manor house on three levels, built from a
// real house plan rather than random rooms.
//
//   - a forecourt (outdoor) with the gravel drive, lawns, hedges, lamps and
//     the porch, its steps up to the front door;
//   - the house, three ranges deep:
//       service wing   dining hall, kitchen (+ the servants' back stair to the
//                      gallery, the service passage to the garden), servants'
//                      hall / laundry, the scullery with the cellar stair, and
//                      the wine cellar below;
//       centre         the two-storey entrance hall (foyer) with a double
//                      staircase sweeping up to a railed gallery, the walled
//                      garden courtyard behind it (fountain, hedges, a pond
//                      with a footbridge, the conservatory) and the graveyard
//                      beyond the garden wall with the mausoleum, whose stair
//                      goes down into the crypt under the rear range;
//       private wing   the bedroom wing on the upper floor (landing hall,
//                      master bedroom, bedrooms, bathroom), the two-storey
//                      library with its mezzanine, the ballroom, and a chapel
//                      (stair down to the crypt) or music / billiard room;
//   - a secret stair from a bookcase in the library up inside the wall to the
//     bedroom wing (a narrow route that is never the only one).
// Storeys: gardens at 0, the ground floor at GF (two steps up), the upper floor
// at UF, the cellars at CF. Rooms on different storeys never overlap (a height
// field), so the upper floor and the cellars take their own footprints inside
// the house's outline; from outside the house is one tall mass with two rows
// of windows and a slate roof.
//
// The plan is laid out in plan coordinates (u across the facade, v from the
// front to the back) and mapped to the grid in one of eight orientations; each
// room template works in its own local frame (mansion_kit.js).
//
// Routes: every possible doorway between two rooms is a candidate link; a
// random spanning tree from the forecourt (the boss room a leaf) picks the
// required ones, keyed gates (3-wide flat doorways) sit on the path to the boss
// and split the house into zones, and extra links inside a zone make loops
// (the back stair, the secret stair, french windows, side doors). Unused
// doorways stay walled (some boarded up).
import { TS, F, clamp, newGrid } from './common.js';
import { Deco } from './deco.js';
import { Frame, GROUND, GF, UF, CF, OPP } from './mansion_kit.js';
import { ROOMS } from './mansion_rooms.js';
import { WINGS } from './mansion_wings.js';
import { GROUNDS, finishExterior } from './mansion_grounds.js';
import { finishRooms, boardedDoor } from './mansion_finish.js';

const TEMPLATES = { ...ROOMS, ...WINGS, ...GROUNDS };

// base storey, ceiling height (above the base) and surfaces of each room kind
const KIND = {
  forecourt: { floor: GROUND, sky: true, ground: TS.GROUND, wall: TS.FACADE },
  garden: { floor: GROUND, sky: true, ground: TS.GROUND, wall: TS.FACADE2 },
  graveyard: { floor: GROUND, sky: true, ground: TS.GROUND, wall: TS.FACADE2 },
  foyer: { floor: GF, ceil: [9.6, 10.2], floorTex: TS.FLOOR3, wall: TS.WALL, ceilTex: TS.CEIL2 },
  dining: { floor: GF, ceil: [5.4, 6], floorTex: TS.FLOOR, wall: TS.WALL2, ceilTex: TS.CEIL },
  kitchen: { floor: GF, ceil: [4.8, 5.4], floorTex: TS.FLOOR2, wall: TS.FACADE3, ceilTex: TS.CEIL },
  backstair: { floor: GF, ceil: [8.6], floorTex: TS.FLOOR, wall: TS.FACADE3, ceilTex: TS.CEIL },
  servpass: { floor: GF, ceil: [3.6], floorTex: TS.FLOOR2, wall: TS.FACADE3, ceilTex: TS.CEIL },
  servhall: { floor: GF, ceil: [4.2, 4.8], floorTex: TS.FLOOR2, wall: TS.FACADE3, ceilTex: TS.CEIL },
  laundry: { floor: GF, ceil: [4.2, 4.8], floorTex: TS.FLOOR2, wall: TS.FACADE3, ceilTex: TS.CEIL },
  scullery: { floor: GF, ceil: [4.2, 4.8], floorTex: TS.FLOOR2, wall: TS.FACADE3, ceilTex: TS.CEIL },
  cellar: { floor: CF, ceil: [3.6], floorTex: TS.FLOOR2, wall: TS.PITWALL, ceilTex: TS.PITWALL },
  crypt: { floor: CF, ceil: [5.4, 6], floorTex: TS.FLOOR2, wall: TS.PITWALL, ceilTex: TS.PITWALL },
  mausoleum: { floor: GROUND, ceil: [4.6], floorTex: TS.FLOOR2, wall: TS.PITWALL, ceilTex: TS.PITWALL },
  conservatory: { floor: GF, ceil: [6.6], floorTex: TS.FLOOR3, wall: TS.GLASS, ceilTex: TS.GLASS },
  bwhall: { floor: UF, ceil: [4.2], floorTex: TS.CARPET, wall: TS.WALL, ceilTex: TS.CEIL },
  bedroom: { floor: UF, ceil: [4], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL },
  master: { floor: UF, ceil: [4.2], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL },
  bath: { floor: UF, ceil: [4], floorTex: TS.FLOOR3, wall: TS.WALL2, ceilTex: TS.CEIL },
  nursery: { floor: UF, ceil: [4], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL },
  library: { floor: GF, ceil: [8.4, 9], floorTex: TS.FLOOR, wall: TS.WALL2, ceilTex: TS.CEIL2 },
  ballroom: { floor: GF, ceil: [10.2, 10.8], floorTex: TS.FLOOR3, wall: TS.WALL, ceilTex: TS.CEIL2 },
  chapel: { floor: GF, ceil: [9, 9.6], floorTex: TS.FLOOR2, wall: TS.FACADE, ceilTex: TS.CEIL2 },
  music: { floor: GF, ceil: [5.4, 6], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL },
  study: { floor: GF, ceil: [5.4, 6], floorTex: TS.FLOOR, wall: TS.WALL2, ceilTex: TS.CEIL },
  secret: { floor: GF, ceil: [2.8], floorTex: TS.FLOOR2, wall: TS.PITWALL, ceilTex: TS.PITWALL },
};
export const HOUSE_TOP = 13;
const PLANT_ROOMS = new Set(['foyer', 'conservatory', 'ballroom', 'dining', 'music', 'study', 'master', 'bedroom', 'nursery', 'bwhall', 'bath']);     // eaves of the house walls

export function genMansion(rng, theme, depth) {
  const P = makePlan(rng, depth);
  // ---- orientation: the plan's u / v axes mapped to the grid (8 ways)
  const swap = rng.chance(0.5);
  const W = swap ? P.Hp : P.Wp, H = swap ? P.Wp : P.Hp;
  const ad = swap ? rng.pick([2, 3]) : rng.pick([0, 1]), bd = swap ? rng.pick([0, 1]) : rng.pick([2, 3]);
  const G = new Frame(0, 0, W, H, ad, bd);
  const g = newGrid(W, H, HOUSE_TOP);
  g.wallTex.fill(TS.FACADE);
  const deco = new Deco(g, { ...theme, railStyle: 'wood' }, rng);
  const baseLight = theme.light ?? 0.45, lightVar = Math.min(0.15, theme.lightVar ?? 0.15);
  const M = { P, G, g, deco, rng, theme, depth, W, H, rooms: P.rooms, links: P.links, baseLight };

  // world rects + local frames (a = plan +u, b = plan +v)
  for (const r of P.rooms) {
    const [x0, z0, x1, z1] = G.rect(r.u, r.v, r.u + r.du, r.v + r.dv);
    r.x = x0; r.z = z0; r.w = x1 - x0; r.h = z1 - z0;
    r.fr = new Frame(r.x, r.z, r.w, r.h, G.dir(0), G.dir(2));
    const K = KIND[r.kind];
    r.floor = K.floor;
    r.sky = !!K.sky;
    r.ceilH = K.sky ? 0 : rng.pick(K.ceil);
    r.light = r.sky ? 0.6 : clamp(baseLight + rng.float(-lightVar, lightVar), 0.25, 0.8);
    r.template = r.kind;
    r.ports = [];
    r.reserved = new Set();
  }

  // ---- routes: spanning tree, gates, zones, loops
  chooseLinks(M);
  // ports: each link as seen from its two rooms (local direction, cells, height)
  for (const l of P.links) {
    l.wall = wallOf(l);
    l.portA = portOf(l, l.A, l.hA, l.B); l.portB = portOf(l, l.B, l.hB, l.A);
    l.A.ports.push(l.portA); l.B.ports.push(l.portB);
  }
  // rooms nothing leads to (an unused secret stair) stay solid
  for (const r of P.rooms) r.unused = r.kind === 'secret' && !r.ports.some((p) => p.active);
  for (const r of P.rooms) for (const p of r.ports) if (p.active) reserveApproach(r, p);

  // ---- carve rooms (indoor first so the outdoor rooms paint the facades)
  const order = P.rooms.filter((r) => !r.unused).sort((a, b) => (a.sky ? 1 : 0) - (b.sky ? 1 : 0));
  for (const r of order) carveRoom(M, r);
  // ---- templates (in plan order: structures that others lean on first)
  for (const r of P.rooms) {
    if (r.unused) continue;
    const fn = TEMPLATES[r.template];
    if (!fn) continue;
    fn({ ...M, room: r, fr: r.fr });
  }
  // ---- doorways
  for (const l of P.links) if (l.active) carveLink(M, l); else if (l.board) boardedDoor(M, l);
  // ---- finishing: trims, windows, lights, facades, roof, trees
  finishRooms(M);
  finishExterior(M);

  // ---- start, boss, arena
  const F0 = P.rooms.find((r) => r.kind === 'forecourt');
  const st = F0.start;
  const start = { x: G.cx(st.u, st.v), z: G.cz(st.u, st.v) };
  const boss = P.boss;
  const arena = [];
  for (const r of P.rooms) if (r === boss || (r.arenaWith === boss)) for (const i of cellsOf(M, r)) if (g.type[i] && !(g.flags[i] & (F.PIT | F.VOID))) { g.flags[i] |= F.ARENA; arena.push(i); }
  const bc = boss.bossSpot || { a: boss.du / 2, b: boss.dv / 2 };
  checkRoutes(M, start);
  return {
    grid: g, deco, rooms: P.rooms.map((r) => ({ id: r.id, x: r.x, z: r.z, w: r.w, h: r.h, floor: r.floor, template: r.kind, cx: r.x + r.w / 2, cz: r.z + r.h / 2 })),
    start, startYaw: P.startYaw !== undefined ? yawOf(G, P.startYaw) : undefined,
    arenaCells: arena, noFortify: true,
    boss: { x: boss.fr.px(bc.a, bc.b), z: boss.fr.pz(bc.a, bc.b) },
    scatterIndoor: true,
    // the theme's loose props: candles anywhere but the lawns and the drive,
    // pot plants only in the living rooms (never below stairs or underground)
    propOk: (i, name) => {
      const r = P.rooms[g.region[i]];
      if (!r) return false;
      if (name === 'plant') return PLANT_ROOMS.has(r.kind);
      if (name === 'candles') return r.kind !== 'forecourt' && r.kind !== 'garden';
      return true;
    },
    mansion: M,
  };
}

// world yaw of a plan direction (0 +u, 2 +v)
function yawOf(G, pd) {
  const wd = G.dir(pd);
  return [0, Math.PI, Math.PI / 2, -Math.PI / 2][wd];
}

// ======================================================================
// plan
// ======================================================================
function makePlan(rng, depth) {
  const rooms = [], links = [];
  const room = (kind, u, v, du, dv, o = {}) => { const r = { id: rooms.length, kind, u, v, du, dv, ...o }; rooms.push(r); return r; };
  const ws = rng.int(13, 15), wc = rng.int(19, 22), wp = rng.int(13, 15);
  const Fd = rng.int(12, 14);
  const d0C = rng.int(16, 18), d0S = d0C - 5, d0P = d0C + rng.int(6, 7);
  const dLB = rng.int(14, 16), dBR = rng.int(16, 18), dCR = rng.int(12, 14);
  const T = d0P + dLB + dBR + dCR + 6;
  const uS = 3, uC = uS + ws + 2, uP = uC + wc + 3;
  const Wp = uP + wp + 3;
  const v0 = Fd + 3, vEnd = v0 + T;
  const Hp = vEnd + 3;

  // ---- outdoor: the forecourt across the front
  const fore = room('forecourt', 1, 1, Wp - 2, Fd);
  // ---- service wing
  const dining = room('dining', uS, v0, ws, d0S);
  const vK0 = v0 + d0S + 2, dK = rng.int(13, 15);
  const kitchen = room('kitchen', uS, vK0, ws - 6, dK);
  const bstair = room('backstair', uS + ws - 5, vK0, 5, 8);
  const spass = room('servpass', uS + ws - 5, vK0 + 9, 5, dK - 9);
  const dCE = clamp(dCR + rng.int(-1, 1), 11, 14);
  const vCE0 = vEnd - dCE;
  const vM0 = vK0 + dK + 2, mid = vCE0 - 2 - vM0;
  const serv = [];
  if (mid >= 21) {
    const m1 = Math.floor((mid - 2) / 2) + rng.int(-1, 1);
    serv.push(room(rng.chance(0.5) ? 'servhall' : 'laundry', uS, vM0, ws, m1));
    serv.push(room('scullery', uS, vM0 + m1 + 2, ws, mid - m1 - 2));
  } else serv.push(room('scullery', uS, vM0, ws, mid));
  const scull = serv[serv.length - 1];
  const cellar = room('cellar', uS, vCE0, ws, dCE);
  // ---- centre
  const foyer = room('foyer', uC, v0, wc, d0C);
  const vCY0 = v0 + d0C + 2, vCY1 = vEnd - dCR - 2;
  const crypt = room('crypt', uC, vEnd - dCR, wc, dCR);
  // the courtyard: the garden in front, the graveyard behind the garden wall
  const vL0 = v0 + d0P + 2, vB0 = vL0 + dLB + 2;
  const dGY = clamp(vCY1 - vB0 - rng.int(3, 6), 10, 14);
  const vWall = vCY1 - dGY - 1;
  const garden = room('garden', uC, vCY0, wc, vWall - vCY0);
  const grave = room('graveyard', uC, vWall + 1, wc, dGY);
  // ---- private wing
  const bwhall = room('bwhall', uP, v0, 3, d0P);
  // bedrooms along the outer side (1-thick partitions)
  const bedU = uP + 4, bedW = wp - 4;
  const kinds = rng.shuffle(['master', 'bath', rng.chance(0.4) ? 'nursery' : 'bedroom']);
  const sizes = kinds.map((k) => (k === 'master' ? rng.int(9, 10) : k === 'bath' ? 5 : 7));
  let extra = d0P - sizes.reduce((s, x) => s + x, 0) - (kinds.length - 1);
  for (let k = 0; extra > 0; k = (k + 1) % kinds.length) { if (kinds[k] !== 'bath') { sizes[k]++; extra--; } }
  const beds = [];
  let vb = v0;
  kinds.forEach((k, j) => { beds.push(room(k, bedU, vb, bedW, sizes[j])); vb += sizes[j] + 1; });
  const library = room('library', uP, vL0, wp, dLB);
  const ballroom = room('ballroom', uP, vB0, wp, dBR);
  const rearKind = rng.weighted([['chapel', 0.6], ['music', 0.2], ['study', 0.2]], (o) => o[1])[0];
  const rear = room(rearKind, uP, vB0 + dBR + 2, wp, dCR);
  // ---- the secret stair: from a bookcase in the library up inside the wall
  // between the courtyard and the private wing to the bedroom wing's hall
  const sec = room('secret', uC + wc + 1, v0 + d0C + 1, 1, vL0 + 3 - (v0 + d0C + 1));
  // rows of the C / P wall the secret stair runs in (no other doorway may cross it)
  const secRows = [sec.v, sec.v + sec.dv];
  // ---- buildings in the courtyard: the conservatory against the library,
  // the mausoleum against the rear range (over the crypt)
  const cw = rng.int(7, 9), cd = Math.min(dLB - 4, rng.int(9, 11));
  const cv0 = clamp(vL0 + 3 + rng.int(0, Math.max(0, dLB - 4 - cd)), Math.max(garden.v + 3, secRows[1] + 1), garden.v + garden.dv - cd - 3);
  const cons = room('conservatory', uC + wc - cw, cv0, cw, cd, { inside: garden });
  const mw = 7, md = 7, mu0 = rng.chance(0.5) ? uC + 2 + rng.int(0, 2) : uC + wc - mw - 2 - rng.int(0, 2);
  const maus = room('mausoleum', mu0, vCY1 - md, mw, md, { inside: grave });

  // ---- candidate links between rooms that share a wall (axis 'u': side by
  // side across u, 'v': one behind the other). hA / hB: port heights on the A /
  // B side; w: width; gate: may carry a keyed door (3 wide, flat, walled at
  // both ends); tree: may be a required route; loopP: chance as an extra route
  const L = (A, B, o) => { const l = { id: links.length, A, B, w: 3, gate: false, tree: true, loopP: 0.55, bias: 1, board: false, ...o }; links.push(l); return l; };
  const mid3 = (a0, a1, w = 3) => Math.floor((a0 + a1 - w) / 2);
  const ov = (A, B, axis) => (axis === 'u' ? [Math.max(A.v, B.v), Math.min(A.v + A.dv, B.v + B.dv)] : [Math.max(A.u, B.u), Math.min(A.u + A.du, B.u + B.du)]);
  const pick = (A, B, axis, w, m = 1) => { const [a0, a1] = ov(A, B, axis); return rng.int(a0 + m, Math.max(a0 + m, a1 - m - w)); };
  // a door in a yard's side wall (plan u = uWall) stands on a stoop: a landing
  // one cell either side of it and two steps 4 cells out into the yard. A
  // building in the yard closer to that wall than that (the mausoleum in the
  // graveyard's corner) would wall the steps in, so the door keeps clear of
  // its rows, walls and the landing's overhang included.
  const yardClear = (yard, uWall, p, w) => !rooms.some((o) => {
    if (o.inside !== yard) return false;
    const gap = uWall < o.u ? o.u - 1 - (uWall + 1) : uWall - (o.u + o.du + 1);
    return gap < 5 && p - 1 < o.v + o.dv + 1 && p + w + 1 > o.v - 1;
  });
  // the C / P wall: avoid the secret stair's rows
  const pickCP = (A, B, w, m = 2, lo = -1e9, hi = 1e9) => {
    let [a0, a1] = ov(A, B, 'u');
    a0 = Math.max(a0 + m, lo); a1 = Math.min(a1 - m, hi);
    const yard = A === garden || A === grave ? A : B === garden || B === grave ? B : null, uWall = uC + wc;
    const ok = [];
    for (let p = a0; p + w <= a1; p++) if ((p + w <= secRows[0] - 1 || p >= secRows[1] + 1) && (!yard || yardClear(yard, uWall, p, w))) ok.push(p);
    return ok.length ? ok[clamp(Math.floor(ok.length / 2) + rng.int(-1, 1), 0, ok.length - 1)] : null;
  };
  // front door: centre of the foyer's front wall
  L(fore, foyer, { axis: 'v', pos: mid3(uC, uC + wc), hA: GF, hB: GF, kind: 'frontdoor', gate: true, bias: 0 });
  // foyer <-> dining: the front part of the foyer's side wall (the stairs rise behind it)
  L(dining, foyer, { axis: 'u', pos: v0 + 1 + rng.int(0, Math.max(0, d0C - 15)), hA: GF, hB: GF, kind: 'door', gate: true, bias: 0.4 });
  // gallery ports (upper floor): the bedroom wing / the back stair
  const galV = v0 + d0C - 3;
  L(foyer, bwhall, { axis: 'u', pos: galV, hA: UF, hB: UF, kind: 'door', gate: true, bias: 0.3, board: true });
  L(bstair, foyer, { axis: 'u', pos: galV, hA: UF, hB: UF, kind: 'door', gate: true, bias: 2.5, loopP: 0.8, board: true });
  // service wing
  L(dining, kitchen, { axis: 'v', pos: pick(dining, kitchen, 'v', 2), w: 2, hA: GF, hB: GF, kind: 'service', bias: 0.6 });
  L(kitchen, bstair, { axis: 'u', pos: vK0, w: 2, hA: GF, hB: GF, kind: 'service', bias: 1.5, loopP: 1 });
  L(kitchen, spass, { axis: 'u', pos: vK0 + 9 + rng.int(0, Math.max(0, dK - 9 - 2)), w: 2, hA: GF, hB: GF, kind: 'service', bias: 0.8 });
  L(spass, garden, { axis: 'u', pos: mid3(spass.v, spass.v + spass.dv), hA: GF, hB: GF, kind: 'garden', gate: true, bias: 1, board: true });
  L(kitchen, serv[0], { axis: 'v', pos: pick(kitchen, serv[0], 'v', 3), hA: GF, hB: GF, kind: 'door', gate: true, bias: 0.8 });
  if (serv.length > 1) L(serv[0], serv[1], { axis: 'v', pos: pick(serv[0], serv[1], 'v', 3), hA: GF, hB: GF, kind: 'door', gate: true, bias: 0.8 });
  for (const s of serv) {
    // a door onto the garden or the graveyard, whichever it faces more
    // (the longest run of the shared wall clear of the yard's buildings)
    let best = null;
    for (const yard of [garden, grave]) {
      const [a0, a1] = ov(s, yard, 'u');
      const lo0 = Math.max(a0 + 2, yard.v + 2), hi0 = Math.min(a1 - 2, yard.v + yard.dv - 2);
      for (let lo = lo0; lo + 3 <= hi0;) {
        if (!yardClear(yard, uC - 1, lo, 3)) { lo++; continue; }
        let hi = lo + 3;
        while (hi + 1 <= hi0 && yardClear(yard, uC - 1, hi - 2, 3)) hi++;
        if (!best || hi - lo > best.hi - best.lo) best = { yard, lo, hi };
        lo = hi;
      }
    }
    if (best) L(s, best.yard, { axis: 'u', pos: mid3(best.lo, best.hi), hA: GF, hB: GF, kind: 'garden', gate: true, bias: 1.2, loopP: 0.5 });
  }
  // the cellar stair: down inside the scullery when it is deep enough, else in the cellar
  const stairInScullery = scull.dv >= 11;
  L(scull, cellar, { axis: 'v', pos: uS + (rng.chance(0.5) ? 1 : ws - 4), hA: stairInScullery ? CF : GF, hB: stairInScullery ? CF : GF, kind: 'cellarstair', bias: 1, loopP: 1 });
  L(cellar, crypt, { axis: 'u', pos: pick(cellar, crypt, 'u', 3, 2), hA: CF, hB: CF, kind: 'arch', gate: true, bias: 1.2 });
  // courtyard
  L(garden, grave, { axis: 'v', pos: pick(garden, grave, 'v', 3, 3), hA: GROUND, hB: GROUND, kind: 'gardengate', gate: true, bias: 1 });
  L(grave, maus, { axis: 'v', pos: mu0 + 2, hA: GROUND, hB: GROUND, kind: 'mausdoor', gate: true, bias: 1, wall: [maus.v - 1, maus.v] });
  L(maus, crypt, { axis: 'v', pos: mu0 + 2, hA: CF, hB: CF, kind: 'mausstair', bias: 1.2 });
  // private wing
  for (const b of beds) L(bwhall, b, { axis: 'u', pos: b.v + 1 + rng.int(0, Math.max(0, b.dv - 4)), w: 2, hA: UF, hB: UF, kind: 'door', bias: 0.5 });
  L(bwhall, library, { axis: 'v', pos: uP, hA: UF, hB: UF, kind: 'door', gate: true, bias: 0.8, board: true });
  // (clear of the mezzanine stair along the library's far side wall)
  L(library, ballroom, { axis: 'v', pos: uP + 2 + rng.int(0, Math.max(0, wp - 9)), hA: GF, hB: GF, kind: 'door', gate: true, bias: 0.9 });
  // the conservatory opens off the library; its glass door onto the garden
  L(cons, library, { axis: 'u', pos: mid3(cons.v, cons.v + cons.dv), hA: GF, hB: GF, kind: 'arch', gate: true, bias: 1 });
  {
    const toFront = cons.v - garden.v >= garden.v + garden.dv - (cons.v + cons.dv);
    const pos = mid3(cons.u, cons.u + cons.du);
    if (toFront) L(garden, cons, { axis: 'v', pos, hA: GF, hB: GF, kind: 'glassdoor', gate: true, bias: 1.1, wall: [cons.v - 1, cons.v] });
    else L(cons, garden, { axis: 'v', pos, hA: GF, hB: GF, kind: 'glassdoor', gate: true, bias: 1.1, wall: [cons.v + cons.dv, cons.v + cons.dv + 1] });
  }
  // french windows from the ballroom onto the garden and the graveyard
  for (const yard of [garden, grave]) {
    const p = pickCP(yard, ballroom, 3, 2, yard.v + 2, yard.v + yard.dv - 2);
    if (p !== null) L(yard, ballroom, { axis: 'u', pos: p, hA: GF, hB: GF, kind: 'garden', gate: true, bias: 1.1, loopP: 0.6 });
  }
  L(ballroom, rear, { axis: 'v', pos: pick(ballroom, rear, 'v', 3, 2), hA: GF, hB: GF, kind: 'door', gate: true, bias: 1 });
  if (rearKind === 'chapel') L(crypt, rear, { axis: 'u', pos: rear.v + 2 + rng.int(0, Math.max(0, rear.dv - 7)), hA: CF, hB: CF, kind: 'chapelstair', bias: 1.3, loopP: 0.7 });
  // the secret stair (never a required route)
  L(sec, bwhall, { axis: 'u', pos: sec.v, w: 1, hA: UF, hB: UF, kind: 'secret', tree: false, loopP: 0.85 });
  L(sec, library, { axis: 'u', pos: sec.v + sec.dv - 1, w: 1, hA: GF, hB: GF, kind: 'bookcase', tree: false, pair: true });

  // ---- start and boss
  // the start: inside the gates at the end of the drive, facing the front door
  fore.driveU = links.find((l) => l.kind === 'frontdoor').pos + 1;
  fore.start = { u: fore.driveU, v: 2 };
  const bossPool = [[crypt, 0.42], [ballroom, rearKind === 'chapel' ? 0.46 : 0], [rear, rearKind === 'chapel' ? 0.12 : 0]];
  const boss = rng.weighted(bossPool, (o) => o[1])[0];
  return { rooms, links, Wp, Hp, uS, uC, uP, ws, wc, wp, v0, vEnd, Fd, d0C, d0S, d0P, vK0, dK, galV, boss, startYaw: 2, garden, grave, cons, maus, fore, sec, stairInScullery };
}

// ======================================================================
// routes
// ======================================================================
function chooseLinks(M) {
  const { P, rng, depth } = M;
  const rooms = P.rooms, links = P.links;
  const boss = P.boss, start = P.rooms.find((r) => r.kind === 'forecourt');
  const adj = rooms.map(() => []);
  for (const l of links) { adj[l.A.id].push(l); adj[l.B.id].push(l); }
  const other = (l, r) => (l.A === r ? l.B : l.A);
  // nodes that are only ever reached through their pair link (the secret stair)
  const inTree = new Set([start.id]);
  const tree = [];
  const parentLink = new Map();
  const wantN = rooms.filter((r) => r.kind !== 'secret').length;
  let guard = 0;
  while (inTree.size < wantN && guard++ < 500) {
    const cand = [];
    for (const id of inTree) {
      if (rooms[id] === boss) continue;           // the boss room is a leaf
      for (const l of adj[id]) {
        if (!l.tree) continue;
        const o = other(l, rooms[id]);
        if (inTree.has(o.id) || o.kind === 'secret') continue;
        if (o === boss && !l.gate) continue;
        cand.push({ l, from: rooms[id], to: o, s: l.bias + rng.float(0, 1.6) + (o === boss ? 100 : 0) });
      }
    }
    if (!cand.length) break;
    cand.sort((a, b) => a.s - b.s);
    // the boss joins only when nothing else can
    const c = cand[0].to === boss && cand.some((x) => x.to !== boss) ? cand.find((x) => x.to !== boss) : cand[0];
    inTree.add(c.to.id);
    tree.push(c.l);
    c.l.active = true; c.l.inTree = true;
    parentLink.set(c.to.id, { l: c.l, parent: c.from.id });
  }
  if (inTree.size < wantN) throw new Error('mansion: rooms left out of the route tree');
  // path start -> boss; gates on it
  const path = [];
  for (let id = boss.id; parentLink.has(id); id = parentLink.get(id).parent) path.unshift(parentLink.get(id).l);
  const maxGates = depth <= 1 ? 1 : depth <= 4 ? 2 : 3;
  const gates = new Set([path[path.length - 1]]);
  const mids = rng.shuffle(path.slice(1, -1).filter((l) => l.gate));
  for (const l of mids) { if (gates.size >= maxGates) break; gates.add(l); }
  for (const l of gates) l.isGate = true;
  // zones (gates crossed from the start)
  const zone = new Map([[start.id, 0]]);
  const order = [start.id];
  for (let k = 0; k < order.length; k++) {
    const id = order[k];
    for (const l of adj[id]) {
      if (!l.inTree) continue;
      const o = other(l, rooms[id]);
      if (zone.has(o.id)) continue;
      zone.set(o.id, zone.get(id) + (l.isGate ? 1 : 0));
      order.push(o.id);
    }
  }
  for (const r of rooms) r.zone = zone.get(r.id) ?? -1;
  // loops inside a zone, never into the boss room
  for (const l of links) {
    if (l.inTree || l.pair) continue;
    if (l.A === boss || l.B === boss) continue;
    if (l.kind === 'secret') {
      // the secret stair joins the library (bookcase) and the bedroom wing
      const lib = links.find((x) => x.pair);
      const libRoom = lib.B, bw = l.B;
      if (libRoom.zone >= 0 && libRoom.zone === bw.zone && libRoom !== boss && rng.chance(l.loopP)) { l.active = true; lib.active = true; l.A.zone = bw.zone; }
      continue;
    }
    if (l.A.zone !== l.B.zone || l.A.zone < 0) continue;
    if (rng.chance(l.loopP)) l.active = true;
  }
  P.gates = [...gates];
  P.tree = tree;
}

// wall cells of a link (plan): the crossing range [c0, c1) along its axis
function wallOf(l) {
  if (l.wall) return l.wall;
  const A = l.A, B = l.B;
  if (l.axis === 'u') { const lo = A.u < B.u ? A : B, hi = lo === A ? B : A; return [lo.u + lo.du, hi.u]; }
  const lo = A.v < B.v ? A : B, hi = lo === A ? B : A;
  return [lo.v + lo.dv, hi.v];
}
// a link as seen from room R: the local direction from R's cells into the
// doorway, the cells of R just in front of it (local) and the height there
function portOf(l, R, h, O) {
  const [c0, c1] = l.wall;
  const cells = [];
  let dir;
  // the side of the wall R is on (a room around a building in it: the side
  // away from the building)
  const endsBefore = (X) => (l.axis === 'u' ? X.u + X.du <= c0 : X.v + X.dv <= c0);
  const startsAfter = (X) => (l.axis === 'u' ? X.u >= c1 : X.v >= c1);
  const before = endsBefore(R) ? true : startsAfter(R) ? false : !endsBefore(O);
  const t = before ? c0 - 1 : c1;
  for (let k = 0; k < l.w; k++) {
    const u = l.axis === 'u' ? t : l.pos + k, v = l.axis === 'u' ? l.pos + k : t;
    cells.push([u - R.u, v - R.v]);
  }
  if (l.axis === 'u') dir = before ? 0 : 1; else dir = before ? 2 : 3;
  // along-wall range in R's local coordinates
  const s0 = l.axis === 'u' ? l.pos - R.v : l.pos - R.u;
  return { link: l, room: R, other: O, dir, cells, s0, s1: s0 + l.w, h, active: !!l.active, kind: l.kind, before };
}

// cells of room R in front of port p, d deep (local [a, b] pairs)
export function portCells(r, p, d = 2) {
  const out = [];
  const back = OPP[p.dir];
  const da = back === 0 ? 1 : back === 1 ? -1 : 0, db = back === 2 ? 1 : back === 3 ? -1 : 0;
  for (const [a0, b0] of p.cells) for (let t = 0; t < d; t++) {
    const a = a0 + da * t, b = b0 + db * t;
    if (a >= 0 && b >= 0 && a < r.du && b < r.dv) out.push([a, b]);
  }
  return out;
}
function reserveApproach(r, p) {
  for (const [a, b] of portCells(r, p, 3)) r.reserved.add(a + b * 1000);
  // and one cell either side of the opening
  const [a0, b0] = p.cells[0], [a1, b1] = p.cells[p.cells.length - 1];
  const sa = p.dir < 2 ? 0 : 1, sb = p.dir < 2 ? 1 : 0;
  for (const [a, b] of [[a0 - sa, b0 - sb], [a1 + sa, b1 + sb]]) {
    if (a >= 0 && b >= 0 && a < r.du && b < r.dv) r.reserved.add(a + b * 1000);
  }
}
export const isRes = (r, a, b) => r.reserved.has(a + b * 1000);

// ======================================================================
// carving
// ======================================================================
function cellsOf(M, r) {
  const out = [];
  for (let b = 0; b < r.dv; b++) for (let a = 0; a < r.du; a++) { const i = r.fr.idx(M.g, a, b); if (i >= 0 && M.g.type[i] && M.g.region[i] === r.id) out.push(i); }
  return out;
}
export { cellsOf };

function carveRoom(M, r) {
  const { g } = M;
  const K = KIND[r.kind];
  const cells = [];
  for (let b = 0; b < r.dv; b++) for (let a = 0; a < r.du; a++) {
    const x = r.fr.cx(a, b), z = r.fr.cz(a, b), i = g.idx(x, z);
    if (r.sky) {
      // the courtyard leaves its buildings (and their walls) solid
      if (M.P.rooms.some((o) => o.inside === r && inWalls(o, r.u + a, r.v + b))) continue;
      g.open(x, z, r.floor, 0, { sky: true, floorTex: K.ground, wallTex: TS.SIDE, light: r.light, region: r.id, flags: F.OUTDOOR });
    } else {
      g.open(x, z, r.floor, r.floor + r.ceilH, { floorTex: K.floorTex, ceilTex: K.ceilTex, wallTex: TS.SIDE, light: r.light, region: r.id });
    }
    cells.push(i);
  }
  r.cells = cells;
  // the ring of wall cells takes this room's wall texture (outdoor rooms: the
  // facades / garden walls)
  for (let b = -1; b <= r.dv; b++) for (let a = -1; a <= r.du; a++) {
    if (a >= 0 && b >= 0 && a < r.du && b < r.dv) continue;
    const x = r.fr.cx(a, b), z = r.fr.cz(a, b);
    if (!g.in(x, z)) continue;
    const i = g.idx(x, z);
    if (g.type[i]) continue;
    g.wallTex[i] = K.wall;
  }
}
// plan cell (u, v) within building o or its 1-thick walls
function inWalls(o, u, v) { return u >= o.u - 1 && u <= o.u + o.du && v >= o.v - 1 && v <= o.v + o.dv; }

// open the wall cells of a doorway: the half on each side takes that side's
// port height (the templates build any steps inside the rooms)
function carveLink(M, l) {
  const { g, G, P } = M;
  const [c0, c1] = l.wall;
  const hLo = l.portA.before ? l.hA : l.hB, hHi = l.portA.before ? l.hB : l.hA;
  const roomCeil = (R) => (R.sky ? R.floor + 30 : R.floor + R.ceilH);
  const headroom = l.kind === 'secret' || l.kind === 'bookcase' ? 2.6 : l.w >= 3 ? 3.4 : 3.0;
  const top = Math.max(hLo, hHi) + headroom;
  const n = c1 - c0;
  const sec = l.kind === 'secret' || l.kind === 'bookcase';
  for (let k = 0; k < l.w; k++) {
    for (let t = 0; t < n; t++) {
      const u = l.axis === 'u' ? c0 + t : l.pos + k, v = l.axis === 'u' ? l.pos + k : c0 + t;
      const x = G.cx(u, v), z = G.cz(u, v);
      const h = n === 1 ? hLo : t < n / 2 ? hLo : hHi;
      const ceil = Math.min(Math.max(top, h + 2.6), Math.max(roomCeil(l.A), roomCeil(l.B), h + 2.6));
      g.open(x, z, h, ceil, { floorTex: sec ? TS.FLOOR2 : l.floorTex ?? (l.kind === 'garden' || l.kind === 'glassdoor' || l.kind === 'frontdoor' || l.kind === 'mausdoor' || l.kind === 'gardengate' ? TS.FLOOR2 : TS.FLOOR), ceilTex: sec ? TS.PITWALL : TS.CEIL, wallTex: TS.SIDE, light: Math.min(l.A.light, l.B.light) * 0.95, region: sec ? P.sec.id : -2 });
      g.flags[g.idx(x, z)] |= F.NOSPAWN;
    }
  }
  l.carved = true;
}

// every active doorway must be reachable from the start (a template that
// broke a route would cut off part of the house)
function checkRoutes(M, start) {
  const { g, G, P } = M;
  const dist = g.bfs([g.idx(start.x, start.z)], { avoid: F.OBSTACLE });
  for (const l of P.links) {
    if (!l.active || !l.carved) continue;
    const u = l.axis === 'u' ? l.wall[0] : l.pos, v = l.axis === 'u' ? l.pos : l.wall[0];
    const i = g.idx(G.cx(u, v), G.cz(u, v));
    if (dist[i] < 0 && !globalThis.__MANSION_NOCHECK) throw new Error(`mansion: doorway ${l.kind} ${l.A.kind}-${l.B.kind} cut off`);
  }
}

export { KIND, GF, UF, CF, GROUND };
