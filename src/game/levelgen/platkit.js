// Layout engine for platform levels (skyscraper rooftops, oil rigs, storm
// spires, orbital decks, floating islands) - used by gen_platforms.js.
//
//  - pads (roofs / decks / tower tops / islands) on a jittered grid of slots,
//    each at its own height; the start pad on the left, a big boss pad on the
//    right reached through a gatehouse (keyed-door chokepoint)
//  - pads are joined (spanning tree + loops) by 2-wide railed bridges. When
//    the ends differ in height the bridge runs at the higher one and a REAL
//    stair flight (railed both sides) climbs to it on the lower pad
//  - deliberate jump gaps (broken bridges / ledges with a 2-cell gap, painted
//    hazard stripes): their launch and landing cells are never railed
//  - raised terraces (setbacks, upper decks, podiums) with their own flights,
//    hazard pools / spike pits (some crossed by planks), gatehouses
//  - guard rails on every dangerous edge except the jump spots
//  - island erosion (irregular outlines) and tapered ROCK undersides
import { TS, F, DIR_X, DIR_Z, OPP, clamp } from './common.js';
import { FACE } from './deco.js';
import { railDrops, sinkPit, layBridge, gateWall } from './natural.js';
import { hash2 } from '../../core/rng.js';

export const LOCK = { FREE: 0, HARD: 1, SOFT: 2, PROP: 3 };

export function makePlat(g, deco, rng, S, o) {
  const N = g.w * g.h;
  return {
    g, deco, rng, S, W: g.w, H: g.h, N, VOID_Y: o.voidY, light: o.light,
    M: o.M, SLX: o.SLX, SLZ: o.SLZ, cols: o.cols, rows: o.rows,
    owner: new Int16Array(N).fill(-1),  // pad id, -2 bridge deck, -1 void / other
    lock: new Uint8Array(N),            // LOCK.*: reserved cells (flights, landings, props)
    pads: [], slots: [], edges: [], allow: new Set(), deckCells: [], gates: [], jumps: [], flights: [], bridges: [],
    seed: rng.int(0, 99999),
  };
}

export const cellOf = (X, x, z) => z * X.W + x;
export function nz(X, x, z, s, k = 0) {
  // smooth value noise in [0,1]
  const fx = x / s, fz = z / s, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const sm = (t) => t * t * (3 - 2 * t);
  const h = (a, b) => hash2(a, b, X.seed + k * 7919);
  const a = h(x0, z0) + (h(x0 + 1, z0) - h(x0, z0)) * sm(tx);
  const b = h(x0, z0 + 1) + (h(x0 + 1, z0 + 1) - h(x0, z0 + 1)) * sm(tx);
  return a + (b - a) * sm(tz);
}

// ---------------------------------------------------------------- grid basics
export function voidAll(X) {
  const { g } = X;
  for (let z = 0; z < X.H; z++) for (let x = 0; x < X.W; x++) toVoid(X, cellOf(X, x, z));
}
export function toVoid(X, i) {
  const g = X.g, x = i % g.w, z = (i / g.w) | 0;
  g.clearEdges(x, z);
  g.flags[i] = 0; g.hazType[i] = 0;
  g.open(x, z, X.VOID_Y, 3, { sky: true, light: X.light, flags: F.VOID });
  X.owner[i] = -1;
}
function setPadCell(X, pad, i, y) {
  const g = X.g, x = i % g.w, z = (i / g.w) | 0;
  g.flags[i] = 0; g.hazType[i] = 0;
  g.open(x, z, y, 3, { sky: true, light: X.light, floorTex: X.S.padFloor ? X.S.padFloor(X, pad, x, z) : TS.FLOOR, wallTex: pad.wallTex });
  X.owner[i] = pad.id;
}

// ---------------------------------------------------------------- pads + graph
// Lay pads on the slot grid, pick holes, build a spanning tree + loops,
// assign heights, kinds (bridge / jump) and gates.
export function planPads(X) {
  const { rng, S, cols, rows, SLX, SLZ, M } = X;
  X.startRow = rng.int(0, rows - 1);
  X.bossRow = rows >= 3 ? rng.int(0, rows - 1) : rows - 1;
  const present = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !holes.has(c * 16 + r);
  const holes = new Set();
  const connected = () => {
    const seen = new Set([X.startRow]);
    const st = [[0, X.startRow]];
    while (st.length) {
      const [c, r] = st.pop();
      if (c === cols - 1 && r === X.bossRow) continue;   // the boss pad is a leaf: never a way through
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (!present(nc, nr) || seen.has(nc * 16 + nr)) continue;
        seen.add(nc * 16 + nr); st.push([nc, nr]);
      }
    }
    let n = 0;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) if (present(c, r)) n++;
    return seen.size === n;
  };
  if (S.centreHole) holes.add(Math.floor(cols / 2) * 16 + Math.floor(rows / 2));
  const nHoles = S.holes ? rng.int(S.holes[0], S.holes[1]) : 0;
  for (let t = 0; t < 40 && holes.size < nHoles + (S.centreHole ? 1 : 0); t++) {
    const c = rng.int(1, cols - 2), r = rng.int(0, rows - 1);
    const k = c * 16 + r;
    if (holes.has(k) || (c === cols - 2 && r === X.bossRow)) continue;
    holes.add(k);
    if (!connected()) holes.delete(k);
  }
  if (!connected()) holes.clear();
  // pads
  for (let c = 0; c < cols; c++) {
    X.slots.push([]);
    for (let r = 0; r < rows; r++) {
      const sx0 = M + c * SLX, sz0 = M + r * SLZ;
      if (!present(c, r)) { X.slots[c].push({ hole: true, c, r, sx0, sz0 }); continue; }
      const boss = c === cols - 1 && r === X.bossRow, start = c === 0 && r === X.startRow;
      const w = boss ? SLX - 2 : rng.int(S.padMin, SLX - 3), h = boss ? SLZ - 2 : rng.int(S.padMin, SLZ - 3);
      const fx = SLX - w, fz = SLZ - h;
      const jx = Math.max(0, Math.floor((fx - 3) / 2)), jz = Math.max(0, Math.floor((fz - 3) / 2));
      const x0 = sx0 + Math.floor(fx / 2) + (jx ? rng.int(-jx, jx) : 0);
      const z0 = sz0 + Math.floor(fz / 2) + (jz ? rng.int(-jz, jz) : 0);
      const pad = { id: X.pads.length, c, r, x0, z0, x1: x0 + w - 1, z1: z0 + h - 1, w, h, y: 0, boss, start, adj: [], terrace: null, kind: 'pad' };
      pad.cx = x0 + w / 2; pad.cz = z0 + h / 2;
      X.pads.push(pad);
      X.slots[c].push(pad);
    }
  }
  const at = (c, r) => (present(c, r) ? X.slots[c][r] : null);
  // candidate edges between 4-adjacent pads
  const cand = [];
  for (const p of X.pads) {
    const rgt = at(p.c + 1, p.r), dn = at(p.c, p.r + 1);
    if (rgt) cand.push({ a: p, b: rgt, axis: 'x' });
    if (dn) cand.push({ a: p, b: dn, axis: 'z' });
  }
  const startPad = at(0, X.startRow), bossPad = at(cols - 1, X.bossRow);
  X.startPad = startPad; X.bossPad = bossPad;
  // spanning tree (random Prim) over the non-boss pads
  const inTree = new Set([startPad.id]);
  const nonBoss = X.pads.filter((p) => p !== bossPad).length;
  rng.shuffle(cand);
  while (inTree.size < nonBoss) {
    const opts = cand.filter((e) => !e.tree && e.a !== bossPad && e.b !== bossPad && inTree.has(e.a.id) !== inTree.has(e.b.id));
    if (!opts.length) break;
    const e = rng.pick(opts);
    e.tree = true;
    inTree.add(e.a.id); inTree.add(e.b.id);
  }
  // boss: a leaf joined through exactly one edge (prefer the pad to its left)
  const bossE = cand.filter((e) => (e.a === bossPad || e.b === bossPad));
  bossE.sort((u, v) => (u.axis === 'x' ? 0 : 1) - (v.axis === 'x' ? 0 : 1));
  const be = bossE[0];
  be.tree = true; be.boss = true;
  for (const e of cand) {
    if (e.tree) X.edges.push(e);
    else if (e.a !== bossPad && e.b !== bossPad && rng.chance(S.loops ?? 0.35)) { e.loop = true; X.edges.push(e); }
  }
  for (const e of X.edges) {
    e.kind = !e.boss && rng.chance(S.jumps ?? 0.3) ? 'jump' : 'bridge';
    e.a.adj.push(e); e.b.adj.push(e);
  }
  // heights: walk the tree from the start
  startPad.y = S.y0 ?? 0;
  const done = new Set([startPad.id]);
  const queue = [startPad];
  while (queue.length) {
    const p = queue.shift();
    for (const e of p.adj) {
      if (!e.tree) continue;
      const q = e.a === p ? e.b : e.a;
      if (done.has(q.id)) continue;
      let dh = e.boss ? 0 : e.kind === 'jump' ? rng.pick([0, 0, 0.5, -0.5]) : rng.pick(S.dhs);
      q.y = Math.round(clamp(p.y + dh, S.yMin, S.yMax) * 10) / 10;
      if (e.kind === 'jump' && Math.abs(q.y - p.y) > 0.5) q.y = p.y;
      e.parent = p; e.child = q;
      done.add(q.id); queue.push(q);
    }
  }
  // gates: the boss edge, plus a few flat tree bridges deeper in
  for (const e of X.edges) {
    if (e.boss) { e.gate = S.bossGate !== false; e.child = bossPad; e.parent = e.a === bossPad ? e.b : e.a; }
  }
  const flat = X.edges.filter((e) => e.tree && !e.boss && e.kind === 'bridge' && e.child && !e.child.start && Math.abs(e.a.y - e.b.y) < 0.01);
  rng.shuffle(flat);
  for (const e of flat.slice(0, S.gates ?? 1)) e.gate = true;
  // loops: too steep -> drop; jumps only between near-equal heights
  X.edges = X.edges.filter((e) => {
    const dh = Math.abs(e.a.y - e.b.y);
    if (e.kind === 'jump' && dh > 0.5) e.kind = 'bridge';
    if (e.loop && dh > (S.maxDh ?? 4.8)) { e.a.adj.splice(e.a.adj.indexOf(e), 1); e.b.adj.splice(e.b.adj.indexOf(e), 1); return false; }
    return true;
  });
}

// Open every pad's cells at its height.
export function carvePads(X) {
  const { S, rng } = X;
  for (const p of X.pads) {
    p.wallTex = S.padWall ? S.padWall(X, p) : TS.SIDE;
    p.cells = [];
    for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
      const i = cellOf(X, x, z);
      setPadCell(X, p, i, p.y);
      p.cells.push(i);
    }
  }
  void rng;
}

// ---------------------------------------------------------------- connections
export function connectAll(X) {
  // tree edges first (they must succeed), boss edge, then loops
  const order = [...X.edges].sort((u, v) => (u.loop ? 1 : 0) - (v.loop ? 1 : 0) || (u.boss ? 1 : 0) - (v.boss ? 1 : 0));
  for (const e of order) {
    let ok = connectEdge(X, e);
    if (!ok && e.gate) { e.gate = false; ok = connectEdge(X, e); }
    if (!ok && e.kind === 'jump') { e.kind = 'bridge'; ok = connectEdge(X, e); }
    e.ok = ok;
  }
}

function connectEdge(X, e) {
  const { rng } = X;
  const A = e.a, B = e.b, ax = e.axis === 'x';
  const p0 = Math.max(ax ? A.z0 : A.x0, ax ? B.z0 : B.x0) + 1;
  const p1 = Math.min(ax ? A.z1 : A.x1, ax ? B.z1 : B.x1) - 1;
  const bw = e.kind === 'jump' ? 3 : 2;
  const mid = (p0 + p1 - bw + 1) / 2;
  const cand = [];
  for (let b = p0; b + bw - 1 <= p1; b++) cand.push({ b, s: Math.abs(b - mid) + rng.float(0, 3) });
  cand.sort((u, v) => u.s - v.s);
  for (const { b } of cand) if (tryConnect(X, e, b, bw)) return true;
  return false;
}

function tryConnect(X, e, b, bw) {
  const { g, deco, S, owner, lock } = X;
  const A = e.a, B = e.b, ax = e.axis === 'x';
  const din = ax ? 0 : 2;
  const C = (along, perp) => (ax ? cellOf(X, along, perp) : cellOf(X, perp, along));
  const eA = ax ? A.x1 : A.z1, eB = ax ? B.x0 : B.z0;
  const gap = eB - eA - 1;
  // per pad: facing edge coordinate and inward sign
  const side = (P) => (P === A ? { e: eA, s: -1 } : { e: eB, s: 1 });
  const okCell = (i, P, strict = true) => owner[i] === P.id && (strict ? lock[i] === 0 : lock[i] !== 1) && Math.abs(g.floor[i] - P.y) < 0.01 && !(g.flags[i] & (F.STAIR | F.PIT | F.HAZARD)) && g.type[i] === 1;
  const band = (P, k) => { const sd = side(P); const out = []; for (let l = 0; l < bw; l++) out.push(C(sd.e + sd.s * k, b + l)); return out; };
  // ------------------------------------------------ jump gaps
  if (e.kind === 'jump') {
    for (const P of [A, B]) for (const i of [...band(P, 0), ...band(P, 1)]) if (!okCell(i, P)) return false;
    const cells = [];
    let tipA = 0, tipB = 0;     // stub lengths
    if (gap > 2) {
      const gs = eA + 1 + Math.floor((gap - 2) / 2);
      tipA = gs - (eA + 1); tipB = eB - 1 - (gs + 1);
      for (let along = eA + 1; along < eB; along++) {
        if (along === gs || along === gs + 1) continue;
        const P = along < gs ? A : B;
        for (let l = 0; l < bw; l++) {
          const i = C(along, b + l);
          deckCell(X, i, P.y, ax);
          cells.push(i);
        }
      }
    }
    const tA = tipA > 0 ? eA + tipA : eA, tB = tipB > 0 ? eB - tipB : eB;
    const allowCells = [];
    for (let l = 0; l < bw; l++) { allowCells.push(C(tA, b + l), C(tB, b + l)); }
    for (const i of allowCells) X.allow.add(i);
    for (const P of [A, B]) for (const i of [...band(P, 0), ...band(P, 1)]) lock[i] = LOCK.HARD;
    for (const i of cells) lock[i] = LOCK.HARD;
    X.jumps.push({ e, ax, b, bw, tA, tB, yA: A.y, yB: B.y, cells, allowCells, din });
    return true;
  }
  // ------------------------------------------------ bridges (+ flight)
  const dh = Math.abs(A.y - B.y);
  const n = dh < 0.56 ? 0 : Math.ceil(dh / 0.6 - 1e-6);
  const hi = A.y >= B.y ? A : B, lo = hi === A ? B : A;
  let yDeck = hi.y, flight = null;
  const flightCells = (P, k0, k1) => { const out = []; for (let k = k0; k <= k1; k++) out.push(...band(P, k)); return out; };
  if (n > 0) {
    // out-flight on the lower pad, climbing toward the bridge
    const fc = flightCells(lo, 0, n - 1), land = band(lo, n);
    if (fc.every((i) => okCell(i, lo)) && land.every((i) => okCell(i, lo, false))) {
      const sd = side(lo);
      flight = { P: lo, cells: fc, land, start: C(sd.e + sd.s * (n - 1), b), dir: lo === B ? OPP[din] : din, y0: lo.y, y1: hi.y };
    } else {
      // carved into the higher pad, bridge at the lower height
      const fc2 = flightCells(hi, 0, n - 1), land2 = band(hi, n);
      if (!(fc2.every((i) => okCell(i, hi)) && land2.every((i) => okCell(i, hi, false)))) return false;
      const sd = side(hi);
      flight = { P: hi, cells: fc2, land: land2, start: C(sd.e, b), dir: hi === B ? din : OPP[din], y0: lo.y, y1: hi.y, carve: true };
      yDeck = lo.y;
    }
  }
  // flat ends must be free
  const flatEnds = [];
  for (const P of [A, B]) {
    if (flight && flight.P === P) continue;
    const cs = [...band(P, 0), ...band(P, 1)];
    if (!cs.every((i) => okCell(i, P, false))) return false;
    flatEnds.push(...cs);
  }
  // gatehouse one cell inside the child pad
  let gate = null;
  if (e.gate) {
    const P = e.child;
    if (!P || (flight && flight.P === P)) return false;
    const sd = side(P);
    const line = [];
    for (let l = -1; l <= bw; l++) line.push(C(sd.e + sd.s, b + l));
    const inner = band(P, 2);
    if (!line.every((i) => okCell(i, P)) || !inner.every((i) => okCell(i, P, false))) return false;
    const door = line[1 + (X.rng.chance(0.5) ? 0 : bw - 1)];
    // the landing row beside the bridge mouth must not lead around the gate wall
    const fence = [[C(sd.e, b - 1), C(sd.e, b)], [C(sd.e, b + bw - 1), C(sd.e, b + bw)]];
    if (!fence.every(([u, v]) => owner[u] === P.id && owner[v] === P.id)) return false;
    gate = { P, line, door, axis: ax ? 'x' : 'z', facing: P === B ? -1 : 1, fence, sd };
  }
  // ---- apply
  const cells = [];
  for (let along = eA + 1; along < eB; along++) for (let l = 0; l < bw; l++) {
    const i = C(along, b + l);
    deckCell(X, i, yDeck, ax);
    cells.push(i);
    lock[i] = LOCK.HARD;
  }
  for (const i of flatEnds) lock[i] = LOCK.HARD;
  if (flight) {
    const fx = flight.start % X.W, fz = (flight.start / X.W) | 0;
    const st = deco.stairs(fx, fz, flight.dir, bw, flight.y0, flight.y1, { floorTex: S.tread ?? TS.STAIR, sideTex: S.stairSide ?? TS.TRIM, style: S.rail, light: X.light });
    for (const i of st) { owner[i] = flight.P.id; lock[i] = LOCK.HARD; }
    for (const i of flight.land) lock[i] = LOCK.HARD;
    softRing(X, [...st, ...flight.land]);
    X.flights.push({ ...flight, cells: st, bw });
  }
  if (gate) {
    gateWall(g, deco, gate.line, gate.door, { wallTex: S.gateWall ?? TS.WALL2, capTex: S.gateCap ?? TS.ROOF, frameTex: S.gateFrame ?? TS.METAL, ceilTex: S.gateCeil ?? TS.CEIL, height: S.gateH ?? 4.2, axis: gate.axis, torch: S.gateLight, facing: gate.facing });
    for (const i of gate.line) { lock[i] = LOCK.HARD; if (i !== gate.door) owner[i] = -3; }
    // rails closing the landing off from the rest of the pad's edge row
    const y = gate.P.y;
    for (const [u, v] of gate.fence) {
      const ux = u % X.W, uz = (u / X.W) | 0, vx = v % X.W, vz = (v / X.W) | 0;
      const dir = vx > ux ? 0 : vx < ux ? 1 : vz > uz ? 2 : 3;
      g.setEdge(ux, uz, dir, true);
      // the shared edge line
      if (dir < 2) { const lx = Math.max(ux, vx); deco.railRun(lx, uz, lx, uz + 1, y, { style: S.rail, tex: S.railTex }); }
      else { const lz = Math.max(uz, vz); deco.railRun(ux, lz, ux + 1, lz, y, { style: S.rail, tex: S.railTex }); }
    }
    for (const i of band(gate.P, 2)) lock[i] = LOCK.HARD;
    X.gates.push(gate);
  }
  X.bridges.push({ e, ax, b, bw, cells, y: yDeck, eA, eB, din, flight });
  return true;
}

function deckCell(X, i, y, ax) {
  const g = X.g, x = i % g.w, z = (i / g.w) | 0;
  g.flags[i] = 0;
  g.open(x, z, y, 3, { sky: true, light: X.light, floorTex: X.S.deck ?? TS.GRATE, wallTex: X.S.deckEdge ?? TS.METAL, flags: F.BRIDGE | (ax ? 0 : F.UVROT) });
  X.owner[i] = -2;
  X.deckCells.push(i);
}
function softRing(X, cells) {
  for (const i of cells) for (let d = 0; d < 4; d++) {
    const x = (i % X.W) + DIR_X[d], z = ((i / X.W) | 0) + DIR_Z[d];
    if (x < 0 || z < 0 || x >= X.W || z >= X.H) continue;
    const j = cellOf(X, x, z);
    if (X.lock[j] === LOCK.FREE) X.lock[j] = LOCK.SOFT;
  }
}

// ---------------------------------------------------------------- terraces
// Raise a corner (or an inset block) of big pads: setbacks, upper decks,
// podiums. Joined to the pad floor by a railed flight.
export function addTerraces(X, o = {}) {
  const { g, deco, rng, S, owner, lock } = X;
  const inset = o.inset ?? 0;
  for (const p of X.pads) {
    if (p.boss || p.w < 10 || p.h < 10 || !rng.chance(S.terrace ?? 0.5)) continue;
    const tw = Math.max(4, Math.round(p.w * rng.float(0.35, 0.5))), th = Math.max(4, Math.round(p.h * rng.float(0.35, 0.5)));
    const corners = rng.shuffle([[0, 0], [1, 0], [0, 1], [1, 1]]);
    for (const [cx, cz] of corners) {
      const x0 = cx ? p.x1 - inset - tw + 1 : p.x0 + inset, z0 = cz ? p.z1 - inset - th + 1 : p.z0 + inset;
      const T = [];
      let ok = true;
      for (let z = z0 - 1; z <= z0 + th && ok; z++) for (let x = x0 - 1; x <= x0 + tw && ok; x++) {
        if (x < p.x0 || z < p.z0 || x > p.x1 || z > p.z1) continue;   // ring may lie outside the pad (pad edge)
        const i = cellOf(X, x, z);
        if (owner[i] !== p.id || lock[i] !== 0 || Math.abs(g.floor[i] - p.y) > 0.01) ok = false;
        if (x >= x0 && x < x0 + tw && z >= z0 && z < z0 + th) T.push(i);
      }
      if (!ok || (inset > 0 && (x0 - 1 < p.x0 || z0 - 1 < p.z0 || x0 + tw > p.x1 || z0 + th > p.z1))) continue;
      const dT = rng.pick(S.terraceDh ?? [1.8, 2.4, 3.0]);
      const yT = p.y + dT;
      for (const i of T) { g.floor[i] = yT; g.wallTex[i] = S.terraceWall ? S.terraceWall(X, p) : p.wallTex; if (S.terraceFloor !== undefined) g.floorTex[i] = S.terraceFloor; }
      // flight from one inner side of the terrace down onto the pad
      const n = Math.ceil(dT / 0.6 - 1e-6);
      const sides = rng.shuffle([0, 1, 2, 3]);
      let fl = null;
      for (const d of sides) {
        const alongX = d < 2;      // flight runs along x
        const span = alongX ? th : tw;
        const fw = span >= 7 ? 3 : 2;
        const offs = [];
        for (let o2 = 0; o2 + fw <= span; o2++) offs.push(o2);
        rng.shuffle(offs);
        for (const off of offs) {
          const cells = [], land = [];
          let good = true;
          for (let l = 0; l < fw && good; l++) {
            for (let k = 1; k <= n + 1 && good; k++) {
              const bx = d === 0 ? x0 + tw - 1 + k : d === 1 ? x0 - k : x0 + off + l;
              const bz = d === 2 ? z0 + th - 1 + k : d === 3 ? z0 - k : z0 + off + l;
              if (bx < p.x0 || bz < p.z0 || bx > p.x1 || bz > p.z1) { good = false; break; }
              const i = cellOf(X, bx, bz);
              if (owner[i] !== p.id || Math.abs(g.floor[i] - p.y) > 0.01 || (k <= n ? lock[i] !== 0 : lock[i] === LOCK.HARD)) { good = false; break; }
              (k <= n ? cells : land).push(i);
            }
          }
          if (!good) continue;
          const lowX = d === 0 ? x0 + tw - 1 + n : d === 1 ? x0 - n : x0 + off;
          const lowZ = d === 2 ? z0 + th - 1 + n : d === 3 ? z0 - n : z0 + off;
          fl = { d, lowX, lowZ, fw, cells, land };
          break;
        }
        if (fl) break;
      }
      if (!fl) { for (const i of T) { g.floor[i] = p.y; g.wallTex[i] = p.wallTex; g.floorTex[i] = S.padFloor ? S.padFloor(X, p, i % X.W, (i / X.W) | 0) : TS.FLOOR; } continue; }
      const st = deco.stairs(fl.lowX, fl.lowZ, OPP[fl.d], fl.fw, p.y, yT, { floorTex: S.tread ?? TS.STAIR, sideTex: S.stairSide ?? TS.TRIM, style: S.rail, light: X.light });
      for (const i of st) { owner[i] = p.id; lock[i] = LOCK.HARD; }
      for (const i of fl.land) lock[i] = LOCK.HARD;
      // the terrace's top landing
      for (const i of T) if (lock[i] === 0) lock[i] = LOCK.FREE;
      softRing(X, [...st, ...fl.land]);
      p.terrace = { x0, z0, w: tw, h: th, y: yT, cells: T, flight: fl, stairs: st };
      X.flights.push({ P: p, cells: st, terrace: true });
      break;
    }
  }
}

// ---------------------------------------------------------------- hazards
// Sunken pools / spike pits inside big pads; deep ones may get a plank across.
export function addPools(X, o = {}) {
  const { g, deco, rng, S, owner, lock } = X;
  const kinds = S.hazards || [];
  if (!kinds.length) return;
  for (const p of X.pads) {
    if (p.start || p.boss || p.w < 9 || p.h < 9 || !rng.chance(S.pool ?? 0.4)) continue;
    const pw = rng.int(3, Math.min(6, p.w - 5)), ph = rng.int(3, Math.min(5, p.h - 5));
    for (let t = 0; t < 14; t++) {
      const x0 = rng.int(p.x0 + 2, p.x1 - 1 - pw), z0 = rng.int(p.z0 + 2, p.z1 - 1 - ph);
      const cells = [];
      let ok = true;
      for (let z = z0 - 1; z <= z0 + ph && ok; z++) for (let x = x0 - 1; x <= x0 + pw && ok; x++) {
        const i = cellOf(X, x, z);
        const inner = x >= x0 && x < x0 + pw && z >= z0 && z < z0 + ph;
        if (owner[i] !== p.id || Math.abs(g.floor[i] - p.y) > 0.01 || (inner ? lock[i] !== 0 : lock[i] === LOCK.HARD) || (g.flags[i] & (F.STAIR | F.PIT | F.HAZARD))) ok = false;
        if (inner) cells.push(i);
      }
      if (!ok) continue;
      const kind = rng.pick(kinds);
      const deep = kind === 'spikes' || (kind !== 'water' && rng.chance(o.deepChance ?? 0.45));
      sinkPit(g, deco, cells, kind, deep ? (kind === 'spikes' ? 2.0 : 2.2) : (kind === 'water' ? 0.45 : 0.4), { base: p.y, rimTex: S.poolRim ?? TS.PITWALL, lightEvery: 6 });
      for (const i of cells) lock[i] = LOCK.HARD;
      softRing(X, cells);
      const pool = { p, x0, z0, w: pw, h: ph, kind, deep, cells };
      if (deep && pw >= 3 && rng.chance(o.plankChance ?? 0.5)) {
        const zr = z0 + Math.floor(ph / 2);
        const plank = [];
        for (let x = x0; x < x0 + pw; x++) plank.push(cellOf(X, x, zr));
        layBridge(g, deco, plank, p.y, { deck: S.plank ?? TS.WOOD, under: S.plankUnder ?? TS.BEAM, style: S.rail, railTex: S.railTex, alongZ: false });
        for (const i of plank) owner[i] = p.id;
        pool.plank = plank;
      }
      (X.pools || (X.pools = [])).push(pool);
      break;
    }
  }
}

// ---------------------------------------------------------------- islands
// Erode the rectangular pads into irregular outlines (never touching locked
// cells), keeping every pad connected.
export function erodePads(X, o = {}) {
  const { g, owner, lock } = X;
  const depth = o.depth ?? 3;
  for (const p of X.pads) {
    const rm = [];
    for (const i of p.cells) {
      if (owner[i] !== p.id || lock[i] || g.type[i] !== 1 || (g.flags[i] & (F.STAIR | F.PIT | F.HAZARD | F.BRIDGE))) continue;
      const x = i % X.W, z = (i / X.W) | 0;
      const d = Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z);
      if (d >= depth) continue;
      // corners erode more; noise breaks up the straight sides
      const dc = Math.min(Math.hypot(x - p.x0, z - p.z0), Math.hypot(p.x1 - x, z - p.z0), Math.hypot(x - p.x0, p.z1 - z), Math.hypot(p.x1 - x, p.z1 - z));
      const corner = clamp(1 - dc / (depth * 2.2), 0, 1);
      const v = nz(X, x, z, 3.2, 3) * 0.9 + corner * 1.1 - d / depth;
      if (v > 0.55) rm.push(i);
    }
    // never cut next to locked cells (landings, flights)
    const keep = (i) => { const x = i % X.W, z = (i / X.W) | 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const j = cellOf(X, x + dx, z + dz); if (lock[j] === LOCK.HARD || lock[j] === LOCK.PROP) return true; } return false; };
    for (const i of rm) if (!keep(i)) toVoid(X, i);
    // keep the main connected part
    const cells = p.cells.filter((i) => owner[i] === p.id && g.type[i] === 1 && !(g.flags[i] & F.VOID));
    const set = new Set(cells), seen = new Set();
    const seed = cells.find((i) => lock[i] === LOCK.HARD) ?? cells[0];
    const st = [seed]; seen.add(seed);
    while (st.length) {
      const a = st.pop();
      for (let d = 0; d < 4; d++) {
        const b = a + DIR_X[d] + DIR_Z[d] * X.W;
        if (set.has(b) && !seen.has(b)) { seen.add(b); st.push(b); }
      }
    }
    for (const i of cells) if (!seen.has(i) && !lock[i]) toVoid(X, i);
    p.cells = p.cells.filter((i) => owner[i] === p.id);
  }
}

// Mark pad cells on the void boundary as thin decks (drawn with a shallow
// edge instead of a wall down to the void) - for decks and islands whose
// undersides are built from deco.
export function thinEdges(X) {
  const { g, owner } = X;
  for (const p of X.pads) for (const i of p.cells) {
    if (owner[i] !== p.id || g.type[i] !== 1 || (g.flags[i] & (F.VOID | F.STAIR | F.PIT | F.HAZARD))) continue;
    const x = i % X.W, z = (i / X.W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_X[d], nz2 = z + DIR_Z[d];
      if (!g.in(nx, nz2)) continue;
      if (g.flags[cellOf(X, nx, nz2)] & F.VOID) { g.flags[i] |= F.BRIDGE; break; }
    }
  }
}

// Tapered stepped rock mass under an island (deco, no colliders).
export function rockUnderside(X, p, o = {}) {
  const { g, deco, rng, owner } = X;
  const tex = o.tex ?? TS.ROCK;
  const cells = p.cells.filter((i) => owner[i] === p.id && g.type[i] === 1);
  if (!cells.length) return;
  const set = new Set(cells);
  const dist = new Map();
  const q = [];
  for (const i of cells) {
    const x = i % X.W, z = (i / X.W) | 0;
    let edge = false;
    for (let d = 0; d < 4; d++) { const j = cellOf(X, x + DIR_X[d], z + DIR_Z[d]); if (!set.has(j)) edge = true; }
    if (edge) { dist.set(i, 0); q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const a = q[h], da = dist.get(a);
    for (let d = 0; d < 4; d++) {
      const b = a + DIR_X[d] + DIR_Z[d] * X.W;
      if (set.has(b) && !dist.has(b)) { dist.set(b, da + 1); q.push(b); }
    }
  }
  let maxD = 0;
  for (const v of dist.values()) maxD = Math.max(maxD, v);
  const layers = Math.min(o.maxLayers ?? 7, maxD + 2);
  let top = p.y - 0.3;
  const step = o.step ?? 1;
  for (let k = 0; k < layers; k++) {
    const th = k === 0 ? 1.2 : rng.float(1.0, 1.9) * (o.thick ?? 1);
    const lay = cells.filter((i) => k === 0 || dist.get(i) + nz(X, i % X.W, (i / X.W) | 0, 2.5, 11 + k) * 0.9 >= k * step + 0.45);
    if (!lay.length) break;
    for (const r of rectsOf(g, lay, () => 1)) {
      deco.box(r.x0 + (k ? 0.08 : 0.02), top - th, r.z0 + (k ? 0.08 : 0.02), r.x1 - (k ? 0.08 : 0.02), top, r.z1 - (k ? 0.08 : 0.02), tex, { faces: FACE.SIDES | FACE.BOTTOM, s: 2 });
    }
    top -= th;
  }
  // a few hanging spurs under the lowest layer
  const deep = cells.filter((i) => dist.get(i) >= Math.max(1, maxD - 1));
  for (let k = 0; k < Math.min(3, deep.length); k++) {
    const i = rng.pick(deep);
    const x = (i % X.W) + 0.5, z = ((i / X.W) | 0) + 0.5;
    deco.box(x - 0.6, top - 2.2, z - 0.6, x + 0.6, top + 0.05, z + 0.6, tex, { faces: FACE.SIDES | FACE.BOTTOM, s: 2 });
    deco.box(x - 0.3, top - 3.6, z - 0.3, x + 0.3, top - 2.15, z + 0.3, tex, { faces: FACE.SIDES | FACE.BOTTOM, s: 2 });
  }
}

// ---------------------------------------------------------------- rails
export function guardRails(X, o = {}) {
  const { g, deco, S } = X;
  const cells = [];
  for (const p of X.pads) for (const i of p.cells) if (X.owner[i] === p.id) cells.push(i);
  for (const f of X.flights) for (const i of f.cells) cells.push(i);
  cells.push(...X.deckCells);
  for (const pl of X.pools || []) if (pl.plank) cells.push(...pl.plank);
  railDrops(g, deco, cells, { allow: X.allow, inner: true, style: o.style ?? S.rail, tex: o.tex ?? S.railTex, drop: o.drop ?? 1.1 });
}

// ---------------------------------------------------------------- deco helpers
// Greedy rectangles over a set of cells with equal key. x1/z1 exclusive.
export function rectsOf(g, cells, keyOf) {
  const key = new Map();
  for (const i of cells) key.set(i, keyOf(i));
  const used = new Set(), out = [];
  const sorted = [...key.keys()].sort((a, b) => a - b);
  for (const i of sorted) {
    if (used.has(i)) continue;
    const k = key.get(i), x0 = i % g.w, z0 = (i / g.w) | 0;
    let x1 = x0 + 1;
    while (x1 < g.w && key.get(z0 * g.w + x1) === k && !used.has(z0 * g.w + x1)) x1++;
    let z1 = z0 + 1;
    for (;;) {
      if (z1 >= g.h) break;
      let ok = true;
      for (let x = x0; x < x1; x++) { const j = z1 * g.w + x; if (key.get(j) !== k || used.has(j)) { ok = false; break; } }
      if (!ok) break;
      z1++;
    }
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) used.add(z * g.w + x);
    out.push({ x0, z0, x1, z1, key: k });
  }
  return out;
}

// free = a plain pad cell nobody reserved (props may go here)
export function freeCell(X, i, o = {}) {
  const { g } = X;
  if (i < 0 || i >= X.N || X.owner[i] < 0 || g.type[i] !== 1) return false;
  if (X.lock[i] === LOCK.HARD || X.lock[i] === LOCK.PROP || (!o.soft && X.lock[i] === LOCK.SOFT)) return false;
  if (g.flags[i] & (F.VOID | F.PIT | F.HAZARD | F.STAIR | F.DOOR | F.OBSTACLE | F.START | F.WATER)) return false;
  if (!o.edgeOk && (g.edge[i] || (g.flags[i] & F.BRIDGE))) return false;
  return true;
}
// w x h footprint of free cells at one height with a walkable 1-cell ring
export function freeRect(X, x0, z0, w, h, o = {}) {
  const { g } = X;
  if (x0 < 1 || z0 < 1 || x0 + w >= X.W - 1 || z0 + h >= X.H - 1) return false;
  const y = g.floor[cellOf(X, x0, z0)];
  const ring = o.ring ?? 1;
  for (let z = z0 - ring; z < z0 + h + ring; z++) for (let x = x0 - ring; x < x0 + w + ring; x++) {
    const i = cellOf(X, x, z);
    const inner = x >= x0 && x < x0 + w && z >= z0 && z < z0 + h;
    if (inner) { if (!freeCell(X, i, o) || Math.abs(g.floor[i] - y) > 0.01) return false; }
    else if (o.ringFree !== false) {
      if (g.type[i] !== 1) return false;
      if (X.lock[i] === LOCK.PROP) return false;
      if (o.ringFlat && (Math.abs(g.floor[i] - y) > 0.01 || (g.flags[i] & (F.VOID | F.PIT)))) return false;
    }
  }
  return true;
}
// random spot for a w x h footprint on pad p (null if none)
export function findRect(X, p, w, h, o = {}) {
  const { rng } = X;
  const tries = o.tries ?? 30;
  const x0 = o.x0 ?? p.x0, z0 = o.z0 ?? p.z0, x1 = o.x1 ?? p.x1, z1 = o.z1 ?? p.z1;
  for (let t = 0; t < tries; t++) {
    const x = rng.int(x0, x1 - w + 1), z = rng.int(z0, z1 - h + 1);
    if (freeRect(X, x, z, w, h, o)) return { x, z, w, h, y: X.g.floor[cellOf(X, x, z)] };
  }
  return null;
}
export function occupy(X, x0, z0, w, h, v = LOCK.PROP) {
  for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) X.lock[cellOf(X, x, z)] = v;
}
// pad edge cells facing the void: [{i, x, z, d}] (d = direction toward the void)
export function voidEdges(X, p) {
  const { g } = X;
  const out = [];
  for (const i of p.cells) {
    if (X.owner[i] !== p.id || g.type[i] !== 1 || (g.flags[i] & (F.VOID | F.STAIR))) continue;
    const x = i % X.W, z = (i / X.W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_X[d], nz2 = z + DIR_Z[d];
      if (g.in(nx, nz2) && (g.flags[cellOf(X, nx, nz2)] & F.VOID)) out.push({ i, x, z, d });
    }
  }
  return out;
}
// hazard stripes painted along the lip of a jump spot
export function paintJump(X, jp, tex = TS.PAINT) {
  const { deco, g } = X;
  for (const i of jp.allowCells) {
    const x = i % X.W, z = (i / X.W) | 0, y = g.floor[i] + 0.006;
    // the lip faces the gap: toward the other side along the bridge axis
    const towardB = (jp.ax ? x : z) === jp.tA;
    const d = jp.ax ? (towardB ? 0 : 1) : (towardB ? 2 : 3);
    for (let k = 0; k < 3; k++) {
      const t0 = 0.08 + k * 0.32, t1 = t0 + 0.18;
      if (d === 0) deco.box(x + 0.62, y, z + t0, x + 0.95, y + 0.012, z + t1, tex, { uv: 'fit', faces: FACE.TOP });
      else if (d === 1) deco.box(x + 0.05, y, z + t0, x + 0.38, y + 0.012, z + t1, tex, { uv: 'fit', faces: FACE.TOP });
      else if (d === 2) deco.box(x + t0, y, z + 0.62, x + t1, y + 0.012, z + 0.95, tex, { uv: 'fit', faces: FACE.TOP });
      else deco.box(x + t0, y, z + 0.05, x + t1, y + 0.012, z + 0.38, tex, { uv: 'fit', faces: FACE.TOP });
    }
  }
}
// girders under a bridge deck (+ cross ties), both sides
export function bridgeGirders(X, br, o = {}) {
  const { deco, g } = X;
  if (!br.cells.length) return;
  const tex = o.tex ?? TS.BEAM;
  const y = br.y - 0.35;
  const hgt = o.height ?? 0.45;
  const a0 = br.eA + 1, a1 = br.eB;       // along range [a0, a1)
  const p0 = br.b, p1 = br.b + br.bw;
  const box = (A0, A1, P0, P1, Y0, Y1) => (br.ax ? deco.box(A0, Y0, P0, A1, Y1, P1, tex, { faces: FACE.SIDES | FACE.BOTTOM }) : deco.box(P0, Y0, A0, P1, Y1, A1, tex, { faces: FACE.SIDES | FACE.BOTTOM }));
  box(a0, a1, p0 + 0.04, p0 + 0.26, y - hgt, y);
  box(a0, a1, p1 - 0.26, p1 - 0.04, y - hgt, y);
  for (let a = a0 + 1; a < a1; a += 2) box(a - 0.08, a + 0.08, p0 + 0.26, p1 - 0.26, y - hgt * 0.6, y);
  void g;
}
