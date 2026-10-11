// "Prison" archetype: a walled penitentiary built from a real plan.
//
//   - the forecourt (outdoor) inside the perimeter wall: the vehicle gate,
//     the gatehouse, the drive to the intake doors, the prison bus;
//   - the admin range across the front: the infirmary, intake (reception,
//     metal detector, holding cage), the warden's office and the armory;
//   - two cell blocks either side of the central control hub (the guard
//     booth on its raised dais, a railed gun walk round the walls), each a
//     tall atrium with cells as alcoves off the wide block floor on one side
//     and a railed gallery of cells on the tier above on the other, reached
//     by stairs; the tiers above that are painted on the high walls;
//   - the mess hall behind the hub;
//   - the rear range: the laundry with the boiler pit sunk in its floor, the
//     short solitary wing, and the exercise yard (outdoor) with its fenced
//     court, benches and watch towers.
// Sally ports between the sections are 3-wide flat doorways: the keyed gates.
// Cells are always 3x3 alcoves off wide floors, never a maze of dead ends.
//
// Plan coordinates: u across the front, v from the front gate to the back;
// mapped to the grid in one of eight orientations. Rooms keep their own
// local frames (mansion_kit.js Frame / Kit): the two cell blocks are turned
// so that local a = 0 is always the outer wall and a = W - 1 the hub side.
// Routes as in the mansion: every doorway is a candidate link; a random
// spanning tree from the forecourt (the boss room a leaf) makes the required
// ones, gates on the path to the boss, extra links inside a zone make loops.
import { TS, F, clamp, newGrid } from './common.js';
import { Deco } from './deco.js';
import { Frame } from './mansion_kit.js';
import { PRISON_ROOMS, finishPrison } from './prison_rooms.js';
import { PRISON_GROUNDS, finishExterior } from './prison_grounds.js';

// storeys: the buildings stand one step above the yards; the cell blocks'
// upper tier 3.6 above the block floor; the boiler pit 3.6 below it
export const GROUND = 0, GF = 0.6, T2 = GF + 3.6, PIT = GF - 3.6;
export const BLDG_TOP = 13.2;

const TEMPLATES = { ...PRISON_ROOMS, ...PRISON_GROUNDS };

const KIND = {
  forecourt: { floor: GROUND, sky: true, ground: TS.SIDEWALK, wall: TS.FACADE2 },
  yard: { floor: GROUND, sky: true, ground: TS.GROUND, wall: TS.FACADE2 },
  intake: { floor: GF, ceil: [5.4, 6], floorTex: TS.FLOOR3, wall: TS.WALL2, ceilTex: TS.CEIL },
  infirmary: { floor: GF, ceil: [4.8, 5.4], floorTex: TS.FLOOR3, wall: TS.WALL2, ceilTex: TS.CEIL },
  warden: { floor: GF, ceil: [4.8], floorTex: TS.CARPET, wall: TS.WALL2, ceilTex: TS.CEIL },
  armory: { floor: GF, ceil: [4.2, 4.8], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL },
  hub: { floor: GF, ceil: [9, 9.6], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL2 },
  block: { floor: GF, ceil: [11.4], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL2 },
  mess: { floor: GF, ceil: [6, 6.6], floorTex: TS.FLOOR, wall: TS.WALL2, ceilTex: TS.CEIL },
  laundry: { floor: GF, ceil: [6.6, 7.2], floorTex: TS.FLOOR, wall: TS.FACADE3, ceilTex: TS.CEIL },
  solitary: { floor: GF, ceil: [3.6], floorTex: TS.FLOOR, wall: TS.WALL, ceilTex: TS.CEIL },
};

export function genPrison(rng, theme, depth) {
  const P = makePlan(rng, depth);
  // ---- orientation: the plan's u / v axes mapped to the grid (8 ways)
  const swap = rng.chance(0.5);
  const W = swap ? P.Hp : P.Wp, H = swap ? P.Wp : P.Hp;
  const ad = swap ? rng.pick([2, 3]) : rng.pick([0, 1]), bd = swap ? rng.pick([0, 1]) : rng.pick([2, 3]);
  const G = new Frame(0, 0, W, H, ad, bd);
  const g = newGrid(W, H, BLDG_TOP);
  g.wallTex.fill(TS.FACADE);
  const deco = new Deco(g, { ...theme, railStyle: 'metal' }, rng);
  const baseLight = theme.light ?? 0.5, lightVar = Math.min(0.12, theme.lightVar ?? 0.12);
  const M = { P, G, g, deco, rng, theme, depth, W, H, rooms: P.rooms, links: P.links, baseLight };

  for (const r of P.rooms) {
    const [x0, z0, x1, z1] = G.rect(r.u, r.v, r.u + r.du, r.v + r.dv);
    r.x = x0; r.z = z0; r.w = x1 - x0; r.h = z1 - z0;
    // turned rooms (the second cell block) look the other way along both axes
    r.fr = r.turn ? new Frame(r.x, r.z, r.w, r.h, G.dir(1), G.dir(3)) : new Frame(r.x, r.z, r.w, r.h, G.dir(0), G.dir(2));
    const K = KIND[r.kind];
    r.floor = K.floor;
    r.sky = !!K.sky;
    r.ceilH = K.sky ? 0 : rng.pick(K.ceil);
    r.light = r.sky ? 0.62 : clamp(baseLight + rng.float(-lightVar, lightVar), 0.3, 0.8);
    r.template = r.kind;
    r.ports = [];
    r.reserved = new Set();
  }

  chooseLinks(M);
  for (const l of P.links) {
    l.wall = wallOf(l);
    l.portA = portOf(M, l, l.A, l.hA, l.B); l.portB = portOf(M, l, l.B, l.hB, l.A);
    l.A.ports.push(l.portA); l.B.ports.push(l.portB);
  }
  for (const r of P.rooms) for (const p of r.ports) if (p.active) reserveApproach(r, p);

  // ---- carve (indoor first so the yards paint the facades), templates, doorways
  const order = [...P.rooms].sort((a, b) => (a.sky ? 1 : 0) - (b.sky ? 1 : 0));
  for (const r of order) carveRoom(M, r);
  for (const r of P.rooms) {
    const fn = TEMPLATES[r.template];
    if (fn) fn({ ...M, room: r, fr: r.fr });
  }
  for (const l of P.links) if (l.active) carveLink(M, l);
  finishPrison(M);
  finishExterior(M);

  // ---- start, boss, arena
  const F0 = P.fore;
  const start = { x: G.cx(F0.start.u, F0.start.v), z: G.cz(F0.start.u, F0.start.v) };
  const boss = P.boss;
  const arena = [];
  for (const i of cellsOf(M, boss)) if (g.type[i] && !(g.flags[i] & (F.PIT | F.VOID))) { g.flags[i] |= F.ARENA; arena.push(i); }
  const bc = boss.bossSpot || { a: boss.du / 2, b: boss.dv / 2 };
  checkRoutes(M, start);
  return {
    grid: g, deco, rooms: P.rooms.map((r) => ({ id: r.id, x: r.x, z: r.z, w: r.w, h: r.h, floor: r.floor, template: r.kind, cx: r.x + r.w / 2, cz: r.z + r.h / 2 })),
    start, startYaw: yawOf(G, 2),
    arenaCells: arena, noFortify: true,
    boss: { x: boss.fr.px(bc.a, bc.b), z: boss.fr.pz(bc.a, bc.b) },
    scatterIndoor: true,
    // loose crates only in the service rooms and the yards, never in the cells or offices
    propOk: (i) => {
      const r = P.rooms[g.region[i]];
      return !!r && (r.kind === 'laundry' || r.kind === 'armory' || r.kind === 'forecourt' || r.kind === 'yard' || r.kind === 'intake');
    },
    prison: M,
  };
}

function yawOf(G, pd) {
  const wd = G.dir(pd);
  return [0, Math.PI, Math.PI / 2, -Math.PI / 2][wd];
}

// ======================================================================
// plan
// ======================================================================
function makePlan(rng) {
  const rooms = [], links = [];
  const room = (kind, u, v, du, dv, o = {}) => { const r = { id: rooms.length, kind, u, v, du, dv, ...o }; rooms.push(r); return r; };
  const wa = rng.int(20, 23), wh = rng.int(16, 18), wb = rng.int(20, 23);
  const uA = 2, uH = uA + wa + 2, uB = uH + wh + 2, Wp = uB + wb + 2;
  const Fd = rng.int(11, 13);
  const v0 = 1 + Fd + 2, dA = rng.int(10, 12);
  const v1 = v0 + dA + 2, dB = rng.int(27, 31), dH = rng.int(14, 16);
  const v2 = v1 + dB + 2, dR = rng.int(19, 22), dL = rng.int(10, 12);
  const Hp = v2 + dR + 1;

  // ---- front: the forecourt across the whole width, the admin range
  const fore = room('forecourt', 1, 1, Wp - 2, Fd);
  const inf = room('infirmary', uA, v0, wa, dA);
  const intake = room('intake', uH, v0, wh, dA);
  const ww = Math.floor(wb * 0.55);
  const warden = room('warden', uB, v0, ww, dA);
  const armory = room('armory', uB + ww + 1, v0, wb - ww - 1, dA);
  // ---- the blocks and the centre
  const blockA = room('block', uA, v1, wa, dB, { side: 'A' });
  const hub = room('hub', uH, v1, wh, dH);
  const mess = room('mess', uH, v1 + dH + 2, wh, dB - dH - 2);
  const blockB = room('block', uB, v1, wb, dB, { side: 'B', turn: true });
  // ---- rear
  const laundry = room('laundry', uA, v2, wa, dL);
  const solitary = room('solitary', uA, v2 + dL + 2, wa, dR - dL - 2);
  const yard = room('yard', uH, v2, Wp - 1 - uH, dR);

  // ---- candidate links (see gen_mansion.js): axis 'u' side by side, 'v' one behind the other
  const L = (A, B, o) => { const l = { id: links.length, A, B, w: 3, gate: false, tree: true, loopP: 0.55, bias: 1, hA: GF, hB: GF, ...o }; links.push(l); return l; };
  const mid3 = (a0, a1, w = 3) => Math.floor((a0 + a1 - w) / 2);
  const ov = (A, B, axis) => (axis === 'u' ? [Math.max(A.v, B.v), Math.min(A.v + A.dv, B.v + B.dv)] : [Math.max(A.u, B.u), Math.min(A.u + A.du, B.u + B.du)]);
  const pick = (A, B, axis, w, m = 1) => { const [a0, a1] = ov(A, B, axis); return rng.int(a0 + m, Math.max(a0 + m, a1 - m - w)); };
  // a block's atrium floor in plan u (clear of the cell bands): local a in [5, W - 3)
  const atriumU = (b) => (b.turn ? [b.u + 3, b.u + b.du - 5] : [b.u + 5, b.u + b.du - 3]);
  const pickAtrium = (b, w = 3) => { const [lo, hi] = atriumU(b); return rng.int(lo + 2, Math.max(lo + 2, hi - 2 - w)); };

  L(fore, intake, { axis: 'v', pos: mid3(uH, uH + wh), hA: GROUND, kind: 'frontdoor', gate: true, bias: 0 });
  L(inf, intake, { axis: 'u', pos: pick(inf, intake, 'u', 3, 2), kind: 'door', gate: true, bias: 0.6 });
  L(intake, warden, { axis: 'u', pos: pick(intake, warden, 'u', 2, 2), w: 2, kind: 'door', bias: 0.5 });
  L(warden, armory, { axis: 'u', pos: pick(warden, armory, 'u', 2, 2), w: 2, kind: 'door', bias: 0.6 });
  L(intake, hub, { axis: 'v', pos: mid3(uH, uH + wh), kind: 'sally', gate: true, bias: 0.2 });
  // the sally ports into the blocks: through the ground cell row on the hub side
  L(blockA, hub, { axis: 'u', pos: pick(blockA, hub, 'u', 3, 3), kind: 'sally', gate: true, bias: 0.4 });
  L(hub, blockB, { axis: 'u', pos: pick(hub, blockB, 'u', 3, 3), kind: 'sally', gate: true, bias: 0.4 });
  L(inf, blockA, { axis: 'v', pos: pickAtrium(blockA), kind: 'door', gate: true, bias: 1.3, loopP: 0.6 });
  L(armory, blockB, { axis: 'v', pos: clamp(pickAtrium(blockB), armory.u + 1, armory.u + armory.du - 4), kind: 'door', gate: true, bias: 1.3, loopP: 0.6 });
  L(hub, mess, { axis: 'v', pos: mid3(uH, uH + wh), kind: 'sally', gate: true, bias: 0.8 });
  L(blockA, mess, { axis: 'u', pos: pick(blockA, mess, 'u', 3, 3), kind: 'door', gate: true, bias: 1.4, loopP: 0.5 });
  L(mess, blockB, { axis: 'u', pos: pick(mess, blockB, 'u', 3, 3), kind: 'door', gate: true, bias: 1.4, loopP: 0.5 });
  L(blockA, laundry, { axis: 'v', pos: pickAtrium(blockA), kind: 'door', gate: true, bias: 1 });
  L(blockB, yard, { axis: 'v', pos: pickAtrium(blockB), hB: GROUND, kind: 'yarddoor', gate: true, bias: 1.1 });
  L(mess, yard, { axis: 'v', pos: mid3(uH, uH + wh), hB: GROUND, kind: 'yarddoor', gate: true, bias: 1 });
  L(laundry, solitary, { axis: 'v', pos: pick(laundry, solitary, 'v', 3, 3), kind: 'door', gate: true, bias: 1 });
  L(laundry, yard, { axis: 'u', pos: pick(laundry, yard, 'u', 3, 2), hB: GROUND, kind: 'yarddoor', gate: true, bias: 1.2, loopP: 0.6 });
  L(solitary, yard, { axis: 'u', pos: pick(solitary, yard, 'u', 3, 1), hB: GROUND, kind: 'yarddoor', gate: true, bias: 1.5, loopP: 0.35 });

  // the start: just inside the vehicle gate, facing the intake doors
  const fd = links.find((l) => l.kind === 'frontdoor');
  fore.start = { u: fd.pos + 1, v: 2 };
  fore.gateU = fd.pos + 1;
  const boss = rng.weighted([[yard, 0.45], [mess, 0.3], [blockB, 0.25]], (o) => o[1])[0];
  return { rooms, links, Wp, Hp, uA, uH, uB, v0, v1, v2, boss, fore, yard, blockA, blockB, hub, mess };
}

// ======================================================================
// routes (as gen_mansion.js chooseLinks, without the secret stair)
// ======================================================================
function chooseLinks(M) {
  const { P, rng, depth } = M;
  const rooms = P.rooms, links = P.links;
  const boss = P.boss, start = P.fore;
  const adj = rooms.map(() => []);
  for (const l of links) { adj[l.A.id].push(l); adj[l.B.id].push(l); }
  const other = (l, r) => (l.A === r ? l.B : l.A);
  const inTree = new Set([start.id]);
  const parentLink = new Map();
  let guard = 0;
  while (inTree.size < rooms.length && guard++ < 500) {
    const cand = [];
    for (const id of inTree) {
      if (rooms[id] === boss) continue;
      for (const l of adj[id]) {
        if (!l.tree) continue;
        const o = other(l, rooms[id]);
        if (inTree.has(o.id)) continue;
        if (o === boss && !l.gate) continue;
        cand.push({ l, from: rooms[id], to: o, s: l.bias + rng.float(0, 1.6) + (o === boss ? 100 : 0) });
      }
    }
    if (!cand.length) break;
    cand.sort((a, b) => a.s - b.s);
    const c = cand[0].to === boss && cand.some((x) => x.to !== boss) ? cand.find((x) => x.to !== boss) : cand[0];
    inTree.add(c.to.id);
    c.l.active = true; c.l.inTree = true;
    parentLink.set(c.to.id, { l: c.l, parent: c.from.id });
  }
  if (inTree.size < rooms.length) throw new Error('prison: rooms left out of the route tree');
  const path = [];
  for (let id = boss.id; parentLink.has(id); id = parentLink.get(id).parent) path.unshift(parentLink.get(id).l);
  const maxGates = depth <= 1 ? 1 : depth <= 4 ? 2 : 3;
  const gates = new Set([path[path.length - 1]]);
  for (const l of rng.shuffle(path.slice(1, -1).filter((x) => x.gate))) { if (gates.size >= maxGates) break; gates.add(l); }
  for (const l of gates) l.isGate = true;
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
  for (const l of links) {
    if (l.inTree || l.A === boss || l.B === boss) continue;
    if (l.A.zone !== l.B.zone || l.A.zone < 0) continue;
    if (rng.chance(l.loopP)) l.active = true;
  }
  P.gates = [...gates];
}

// plan wall cells crossed by a link: [c0, c1) along its axis
function wallOf(l) {
  const A = l.A, B = l.B;
  if (l.axis === 'u') { const lo = A.u < B.u ? A : B, hi = lo === A ? B : A; return [lo.u + lo.du, hi.u]; }
  const lo = A.v < B.v ? A : B, hi = lo === A ? B : A;
  return [lo.v + lo.dv, hi.v];
}
// a link as seen from room R, in R's own (possibly turned) frame: the local
// direction from R into the doorway, R's cells in front of it, the along-wall
// range [s0, s1) and the floor height there
function portOf(M, l, R, h, O) {
  const { G } = M;
  const [c0, c1] = l.wall;
  const before = l.axis === 'u' ? R.u + R.du <= c0 : R.v + R.dv <= c0;
  void O;
  const t = before ? c0 - 1 : c1;
  const cells = [];
  for (let k = 0; k < l.w; k++) {
    const u = l.axis === 'u' ? t : l.pos + k, v = l.axis === 'u' ? l.pos + k : t;
    const x = G.cx(u, v), z = G.cz(u, v);
    cells.push([R.fr.la_(x, z), R.fr.lb_(x, z)]);
  }
  const pd = l.axis === 'u' ? (before ? 0 : 1) : (before ? 2 : 3);
  const dir = R.fr.ldir(G.dir(pd));
  const along = (c) => (dir < 2 ? c[1] : c[0]);
  cells.sort((p, q) => along(p) - along(q));
  const s0 = along(cells[0]);
  return { link: l, room: R, other: O, dir, cells, s0, s1: s0 + l.w, h, active: !!l.active, kind: l.kind, before };
}

// cells of room R in front of port p, d deep (local [a, b] pairs)
export function portCells(r, p, d = 2) {
  const out = [];
  const da = p.dir === 1 ? 1 : p.dir === 0 ? -1 : 0, db = p.dir === 3 ? 1 : p.dir === 2 ? -1 : 0;
  for (const [a0, b0] of p.cells) for (let t = 0; t < d; t++) {
    const a = a0 + da * t, b = b0 + db * t;
    if (a >= 0 && b >= 0 && a < r.du && b < r.dv) out.push([a, b]);
  }
  return out;
}
function reserveApproach(r, p) {
  for (const [a, b] of portCells(r, p, 3)) r.reserved.add(a + b * 1000);
  const [a0, b0] = p.cells[0], [a1, b1] = p.cells[p.cells.length - 1];
  const sa = p.dir < 2 ? 0 : 1, sb = p.dir < 2 ? 1 : 0;
  for (const [a, b] of [[a0 - sa, b0 - sb], [a1 + sa, b1 + sb]]) if (a >= 0 && b >= 0 && a < r.du && b < r.dv) r.reserved.add(a + b * 1000);
}

// ======================================================================
// carving
// ======================================================================
export function cellsOf(M, r) {
  const out = [];
  for (let b = 0; b < r.dv; b++) for (let a = 0; a < r.du; a++) { const i = r.fr.idx(M.g, a, b); if (i >= 0 && M.g.type[i] && M.g.region[i] === r.id) out.push(i); }
  return out;
}
function carveRoom(M, r) {
  const { g } = M;
  const K = KIND[r.kind];
  for (let b = 0; b < r.dv; b++) for (let a = 0; a < r.du; a++) {
    const x = r.fr.cx(a, b), z = r.fr.cz(a, b);
    if (r.sky) g.open(x, z, r.floor, 0, { sky: true, floorTex: K.ground, wallTex: TS.SIDE, light: r.light, region: r.id, flags: F.OUTDOOR });
    else g.open(x, z, r.floor, r.floor + r.ceilH, { floorTex: K.floorTex, ceilTex: K.ceilTex, wallTex: TS.SIDE, light: r.light, region: r.id });
  }
  for (let b = -1; b <= r.dv; b++) for (let a = -1; a <= r.du; a++) {
    if (a >= 0 && b >= 0 && a < r.du && b < r.dv) continue;
    const x = r.fr.cx(a, b), z = r.fr.cz(a, b);
    if (!g.in(x, z)) continue;
    const i = g.idx(x, z);
    if (!g.type[i]) g.wallTex[i] = K.wall;
  }
}
// open the wall cells of a doorway (each half at its own side's port height)
function carveLink(M, l) {
  const { g, G } = M;
  const [c0, c1] = l.wall;
  const hLo = l.portA.before ? l.hA : l.hB, hHi = l.portA.before ? l.hB : l.hA;
  const top = Math.max(hLo, hHi) + (l.w >= 3 ? 3.4 : 3.0);
  const n = c1 - c0;
  const outdoor = l.A.sky || l.B.sky;
  for (let k = 0; k < l.w; k++) for (let t = 0; t < n; t++) {
    const u = l.axis === 'u' ? c0 + t : l.pos + k, v = l.axis === 'u' ? l.pos + k : c0 + t;
    const x = G.cx(u, v), z = G.cz(u, v);
    const h = n === 1 ? hHi : t < n / 2 ? hLo : hHi;
    g.open(x, z, h, Math.max(top, h + 2.8), { floorTex: outdoor ? TS.SIDEWALK : TS.FLOOR, ceilTex: TS.CEIL, wallTex: TS.SIDE, light: Math.min(l.A.light, l.B.light) * 0.95, region: -2 });
    g.flags[g.idx(x, z)] |= F.NOSPAWN;
  }
  l.carved = true;
}
// every active doorway must be reachable from the start
function checkRoutes(M, start) {
  const { g, G, P } = M;
  const dist = g.bfs([g.idx(start.x, start.z)], { avoid: F.OBSTACLE });
  for (const l of P.links) {
    if (!l.active || !l.carved) continue;
    const u = l.axis === 'u' ? l.wall[0] : l.pos, v = l.axis === 'u' ? l.pos : l.wall[0];
    const i = g.idx(G.cx(u, v), G.cz(u, v));
    if (dist[i] < 0 && !globalThis.__PRISON_NOCHECK) throw new Error(`prison: doorway ${l.kind} ${l.A.kind}-${l.B.kind} cut off`);
  }
  // and every room's floor (a template that walled part of a room in)
  for (const r of P.rooms) {
    let n = 0, ok = 0;
    for (const i of cellsOf(M, r)) { if (g.flags[i] & (F.OBSTACLE | F.PIT | F.VOID | F.HAZARD)) continue; n++; if (dist[i] >= 0) ok++; }
    if (n && ok < n * 0.85 && !globalThis.__PRISON_NOCHECK) throw new Error(`prison: ${r.kind} only ${ok}/${n} reachable`);
  }
}
