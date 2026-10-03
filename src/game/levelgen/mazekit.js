// Lattice layout kit for the maze themes (sewers, subway, prison, data core,
// back rooms, dream maze). The map is a lattice of slots; every slot (or a
// merged 2x1 / 2x2 block of slots) holds one space - a junction, a chamber,
// a big hall or the boss arena. Spaces connect through corridors that are at
// least 2 (usually 3+) cells wide, so the level reads as a maze of wide
// tunnels and frequent big rooms rather than 1-wide passages.
//
// The connection graph is a growing-tree spanning tree (long, winding routes
// with side branches) plus loops inside a zone. Zones along the start->boss
// route are separated by exactly one 1-wide doorway (in a thick wall across
// the corridor), which gives the populate step clean chokepoints for keyed
// doors. Height differences between spaces are real stair flights inside
// the corridors (with hand rails), never ramps.
//
// A "skin" (see gen_maze.js) decides sizes, heights, textures, corridor
// dressing and the room templates that make each theme distinct.
import { TS, F, HAZ, OPP, DIR_X, DIR_Z, newGrid, encloseBorder, clamp } from './common.js';
import { Deco, FACE } from './deco.js';
import { styleOf, TEMPLATES as ARCH_T, makePit, bridge, freeRect, eachCell, inRoom, scatterProps, wallConsoles } from './gen_arch.js';

export { ARCH_T, makePit, bridge, freeRect, eachCell, inRoom, scatterProps, wallConsoles, FACE };

export const STEP = 0.6;
export const nSteps = (dh) => Math.ceil(Math.abs(dh) / STEP - 1e-6);

// ======================================================================
// Main entry: skin -> {grid, deco, rooms, start, arenaCells, boss, ...}
// ======================================================================
export function buildMaze(rng, theme, depth, skin) {
  const lat = skin.lattice(depth, rng);
  const { MW, MH, P } = lat;
  const cw = lat.cw;
  const B = 2;
  const W = B * 2 + MW * P, H = B * 2 + MH * P;
  const style = { ...styleOf(theme), ...(skin.style || {}) };
  style.railStyle = theme.railStyle || skin.rail || style.railStyle;
  const g = newGrid(W, H, skin.wallTop ?? 8);
  const deco = new Deco(g, { ...theme, railStyle: style.railStyle }, rng);
  const baseLight = theme.light ?? 0.7, lightVar = theme.lightVar ?? 0.25;
  const isVoid = skin.fill === 'void';
  const voidY = skin.voidY ?? -30;
  if (isVoid) {
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      g.open(x, z, voidY, 3, { sky: true, light: Math.max(0.8, baseLight), flags: F.VOID, floorTex: TS.VOID, wallTex: TS.SIDE, region: -9 });
    }
  }

  // ---------------------------------------------------------------- graph
  const G = latticeGraph(rng, lat, depth);
  const { nodes, edges, start, boss } = G;
  const live = nodes.filter((n) => !n.dead);

  // ---------------------------------------------------------------- room rects
  for (const n of live) {
    const X0 = B + n.i0 * P, X1 = B + (n.i0 + n.iw) * P, Z0 = B + n.j0 * P, Z1 = B + (n.j0 + n.jh) * P;
    const merged = n.iw > 1 || n.jh > 1;
    const inset = merged ? (lat.bigInset ?? lat.inset) : lat.inset;
    n.reg = { X0, X1, Z0, Z1, inset };
    const maxW = X1 - X0 - 2 * inset, maxH = Z1 - Z0 - 2 * inset;
    let { w, h } = skin.roomSize(n, rng, maxW, maxH, lat);
    w = clamp(Math.round(w), Math.min(cw, maxW), maxW);
    h = clamp(Math.round(h), Math.min(cw, maxH), maxH);
    const sx = maxW - w, sz = maxH - h;
    const J = n.kind === 'junction' ? 0 : (lat.jitter ?? 1);
    n.x = X0 + inset + Math.floor(sx / 2) + (sx > 1 ? rng.int(-Math.min(J, Math.floor(sx / 2)), Math.min(J, Math.ceil(sx / 2) - 0)) : 0);
    n.z = Z0 + inset + Math.floor(sz / 2) + (sz > 1 ? rng.int(-Math.min(J, Math.floor(sz / 2)), Math.min(J, Math.ceil(sz / 2) - 0)) : 0);
    n.x = clamp(n.x, X0 + inset, X1 - inset - w);
    n.z = clamp(n.z, Z0 + inset, Z1 - inset - h);
    n.w = w; n.h = h;
  }
  // corridor positions: make every edge's perpendicular overlap wide enough
  const nodeEdges = new Map(live.map((n) => [n.id, []]));
  for (const e of edges) { nodeEdges.get(e.a).push(e); nodeEdges.get(e.b).push(e); }
  for (let it = 0; it < 4; it++) {
    let bad = 0;
    for (const e of edges) {
      e.width = e.wantWidth ?? cw;
      const [lo, hi] = edgeSpan(e);
      if (hi - lo >= e.width) continue;
      bad++;
      // shift a 1x1 room so it lines up with its partner
      for (const mover of [nodes[e.b], nodes[e.a]]) {
        if (mover.iw > 1 || mover.jh > 1) continue;
        const other = mover === nodes[e.a] ? nodes[e.b] : nodes[e.a];
        const save = [mover.x, mover.z];
        const [o0, o1] = perp(other, e.axis);
        const band0 = B + (e.axis === 'x' ? e.cj : e.ci) * P;
        const tgt = (Math.max(o0, band0) + Math.min(o1, band0 + P)) / 2;
        if (e.axis === 'x') mover.z = clamp(Math.round(tgt - mover.h / 2), mover.reg.Z0 + mover.reg.inset, mover.reg.Z1 - mover.reg.inset - mover.h);
        else mover.x = clamp(Math.round(tgt - mover.w / 2), mover.reg.X0 + mover.reg.inset, mover.reg.X1 - mover.reg.inset - mover.w);
        const ok = nodeEdges.get(mover.id).every((f) => { const [a, b] = edgeSpan(f); return b - a >= Math.min(f.width ?? cw, cw); });
        if (ok) break;
        [mover.x, mover.z] = save;
      }
    }
    if (!bad) break;
  }
  for (const e of edges) {
    const [lo, hi] = edgeSpan(e);
    e.width = Math.min(e.wantWidth ?? cw, hi - lo);
    if (e.width < 2) {
      if (e.tree) throw new Error('maze: corridor does not fit');
      e.skip = true; continue;
    }
    const slack = hi - lo - e.width;
    e.pos = lo + (slack > 0 ? rng.int(Math.floor(slack * 0.2), Math.ceil(slack * 0.8)) : 0);
    const A = nodes[e.a], Bn = nodes[e.b];
    if (e.axis === 'x') { e.t0 = A.x + A.w; e.t1 = Bn.x - 1; e.dir = 0; }
    else { e.t0 = A.z + A.h; e.t1 = Bn.z - 1; e.dir = 2; }
    e.L = e.t1 - e.t0 + 1;
    if (e.L < 1) { if (e.tree) throw new Error('maze: rooms overlap'); e.skip = true; }
  }

  // ---------------------------------------------------------------- heights
  start.floor = 0;
  const deltas = skin.deltas || [0];
  const [hLo, hHi] = skin.heightRange || [-3.6, 4.8];
  const order = [start.id];
  const seen = new Set(order);
  for (let k = 0; k < order.length; k++) {
    const id = order[k];
    for (const e of nodeEdges.get(id)) {
      if (!e.tree || e.skip) continue;
      const other = e.a === id ? e.b : e.a;
      if (seen.has(other)) continue;
      seen.add(other); order.push(other);
      const par = nodes[id], ch = nodes[other];
      const maxN = Math.max(0, e.L - (e.gate ? 2 : 0) - (e.flatMouth ? 2 : 0));
      let opts = (ch === boss ? (skin.bossDeltas || [0, 0, -0.6, 0.6, -1.2]) : (e.flat ? [0] : deltas)).filter((d) => nSteps(d) <= maxN && par.floor + d >= hLo && par.floor + d <= hHi);
      if (skin.allowDelta) opts = opts.filter((d) => skin.allowDelta(e, par, ch, d));
      if (!opts.length) opts = [0];
      let dh = rng.pick(opts);
      // drift back toward the start height
      if ((par.floor > 2.4 && dh > 0 && opts.includes(-dh)) || (par.floor < -2.4 && dh < 0 && opts.includes(-dh))) dh = -dh;
      ch.floor = Math.round((par.floor + dh) * 100) / 100;
    }
  }
  for (const n of live) if (n.floor === undefined) n.floor = 0;
  for (const e of edges) {
    if (e.skip) continue;
    e.dh = nodes[e.b].floor - nodes[e.a].floor;
    e.n = nSteps(e.dh);
    if (e.n > e.L || (e.flat && e.n > 0)) { if (e.tree) throw new Error('maze: flight does not fit'); e.skip = true; }
  }
  const used = edges.filter((e) => !e.skip);

  // ---------------------------------------------------------------- room setup
  for (const n of live) {
    n.cx = n.x + n.w / 2; n.cz = n.z + n.h / 2;
    n.area = n.w * n.h;
    n.reserved = new Set();
    n.exits = [];
    n.light = clamp(baseLight + rng.float(-lightVar, lightVar), 0.2, 1.15);
    n.zone = G.zoneOf.get(n.id) ?? 0;
  }
  // exits + reserved cells (kept flat and clear by the templates)
  for (const e of used) {
    for (const side of ['a', 'b']) {
      const n = nodes[e[side]];
      const into = side === 'a' ? -1 : 1;
      const firstIn = side === 'a' ? e.t0 - 1 : e.t1 + 1;
      const s0 = e.pos, s1 = e.pos + e.width;
      const ex = { e, side, firstIn, into, cells: [] };
      const depthRes = e.reserveDepth ?? 3;
      for (let s = s0 - 1; s <= s1; s++) for (let d = 0; d < depthRes; d++) {
        const tt = firstIn - into * d;
        const [x, z] = e.axis === 'x' ? [tt, s] : [s, tt];
        if (!inRoom(n, x, z)) continue;
        const i = g.idx(x, z);
        n.reserved.add(i);
        if (d === 0 && s >= s0 && s < s1) ex.cells.push(i);
      }
      n.exits.push(ex);
    }
  }
  for (const n of live) {
    n.template = skin.pickTemplate(n, { rng, depth, start, boss, lat, theme });
    n.ceilH = skin.ceilH(n, rng);
    n.sky = !!(isVoid || skin.skyRoom?.(n));
    const sl = skin.slots ? skin.slots(n, rng) : {};
    n.wallSlot = sl.wall ?? (rng.chance(0.3) ? TS.WALL2 : TS.WALL);
    n.floorSlot = sl.floor ?? TS.FLOOR;
    n.ceilSlot = sl.ceil ?? (n.ceilH >= 6 ? TS.CEIL2 : TS.CEIL);
    n.sideSlot = sl.side ?? TS.SIDE;
  }

  // ---------------------------------------------------------------- carve rooms
  const roomCells = new Map();
  for (const n of live) {
    const cells = [];
    for (let z = n.z; z < n.z + n.h; z++) for (let x = n.x; x < n.x + n.w; x++) {
      g.open(x, z, n.floor, n.floor + n.ceilH, { sky: n.sky, light: n.sky ? Math.max(n.light, 0.85) : n.light, floorTex: n.floorSlot, ceilTex: n.ceilSlot, wallTex: n.sideSlot, region: n.id, flags: n.sky && !isVoid ? F.OUTDOOR : 0 });
      const i = g.idx(x, z);
      g.flags[i] &= ~F.VOID;
      cells.push(i);
    }
    roomCells.set(n.id, cells);
    if (!isVoid) {
      for (let z = n.z - 1; z <= n.z + n.h; z++) for (let x = n.x - 1; x <= n.x + n.w; x++) {
        if (!g.in(x, z)) continue;
        const i = g.idx(x, z);
        if (!g.type[i]) g.wallTex[i] = n.wallSlot;
      }
    }
  }

  // ---------------------------------------------------------------- corridors
  const ctxBase = { g, deco, rng, theme, style, depth, skin, nodes, isVoid, voidY, lat, W, H };
  for (const e of used) {
    e.A = nodes[e.a]; e.B = nodes[e.b];
    (skin.carveCorridor || carveCorridor)({ ...ctxBase }, e);
  }

  // ---------------------------------------------------------------- templates
  for (const n of live) {
    const ctx = { ...ctxBase, room: n, cells: roomCells.get(n.id), boss: n === boss, start: n === start };
    const fn = (skin.templates && skin.templates[n.template]) || ARCH_T[n.template];
    if (!fn) continue;
    const m = deco.mark();
    const snap = snapRect(g, n.x - 1, n.z - 1, n.w + 2, n.h + 2);
    let ok = true;
    try { fn(ctx); } catch (err) { ok = false; if (typeof console !== 'undefined' && skin.debug) console.warn('template failed', n.template, err); }
    if (ok) ok = roomConnected(g, n, roomCells.get(n.id));
    if (!ok) {
      deco.rollback(m);
      restoreRect(g, snap);
      n.lit = false;
      const fb = (skin.templates && skin.templates[skin.fallback || 'plain']) || ARCH_T.plain;
      n.template = skin.fallback || 'plain';
      const m2 = deco.mark();
      try { fb(ctx); } catch (err) { /* plain is best effort */ }
      if (!roomConnected(g, n, roomCells.get(n.id))) { deco.rollback(m2); restoreRect(g, snap); }
    }
  }

  // ---------------------------------------------------------------- gates (1-wide doorways)
  for (const e of used) if (e.gate) buildGate({ ...ctxBase }, e);

  // ---------------------------------------------------------------- finishing
  if (skin.finish) skin.finish({ ...ctxBase, roomCells, used, live, start, boss });
  for (const n of live) {
    const ctx = { ...ctxBase, room: n, cells: roomCells.get(n.id), boss: n === boss };
    if (skin.trims !== false) deco.wallTrims(roomCells.get(n.id).filter((i) => g.type[i]), skin.trimOpts ? skin.trimOpts(n) : { wainscot: style.wain, crown: style.crown && !n.sky });
    if (!n.lit && skin.lights) skin.lights(ctx);
  }
  for (const e of used) {
    if (skin.trims !== false && e.cells) deco.wallTrims(e.cells.filter((i) => g.type[i] && !(g.flags[i] & F.DOOR)), skin.corridorTrimOpts ? skin.corridorTrimOpts(e) : { wainscot: 0, crown: false });
    if (skin.corridorLights) skin.corridorLights({ ...ctxBase }, e);
  }
  if (!isVoid) {
    setWallTops(g, skin.skyWall ?? 8);
    encloseBorder(g);
  }

  // ---------------------------------------------------------------- result
  const arena = roomCells.get(boss.id).filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.VOID)));
  for (const i of arena) g.flags[i] |= F.ARENA;
  const sc = startCell(g, start);
  const rooms = live.map((n) => ({ id: n.id, x: n.x, z: n.z, w: n.w, h: n.h, cx: n.cx, cz: n.cz, floor: n.floor, template: n.template, zone: n.zone }));
  const out = {
    grid: g, deco, rooms, start: sc, arenaCells: arena, noFortify: true,
    boss: { x: boss.x + boss.w / 2, z: boss.z + boss.h / 2 },
    jumpGap: skin.jumpGap || 0,
  };
  if (isVoid) out.voidY = voidY;
  if (skin.startYaw !== undefined) out.startYaw = skin.startYaw;
  verify(out, used, nodes);
  return out;

  // ================================================================ helpers
  function perp(n, axis) { return axis === 'x' ? [n.z, n.z + n.h] : [n.x, n.x + n.w]; }
  function edgeSpan(e) {
    const A = nodes[e.a], Bn = nodes[e.b];
    const [a0, a1] = perp(A, e.axis), [b0, b1] = perp(Bn, e.axis);
    const band0 = B + (e.axis === 'x' ? e.cj : e.ci) * P;
    const bm = lat.bandMargin ?? 1;
    const mA = a1 - a0 >= cw + 2 ? 1 : 0, mB = b1 - b0 >= cw + 2 ? 1 : 0;
    return [Math.max(a0 + mA, b0 + mB, band0 + bm), Math.min(a1 - mA, b1 - mB, band0 + P - bm)];
  }
}

// ======================================================================
// Graph on the lattice
// ======================================================================
function latticeGraph(rng, lat, depth) {
  const { MW, MH } = lat;
  const owner = new Int16Array(MW * MH).fill(-1);
  const nodes = [];
  const fits = (i0, j0, w, h) => {
    if (i0 < 0 || j0 < 0 || i0 + w > MW || j0 + h > MH) return false;
    for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) if (owner[j * MW + i] !== -1) return false;
    return true;
  };
  const add = (i0, j0, w, h, kind) => {
    const n = { id: nodes.length, i0, j0, iw: w, jh: h, kind, dead: false };
    nodes.push(n);
    for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) owner[j * MW + i] = n.id;
    return n;
  };
  const [bw, bh] = lat.bossBlock || [2, 2];
  const boss = add(MW - bw, rng.int(0, MH - bh), bw, bh, 'boss');
  const sj = rng.int(Math.floor((MH - 1) * 0.3), Math.ceil((MH - 1) * 0.7));
  const start = add(0, sj, 1, 1, 'start');
  for (const [w, h, count] of lat.big || []) {
    let made = 0;
    for (let t = 0; t < 80 && made < count; t++) {
      const i0 = rng.int(1, Math.max(1, MW - bw - w)), j0 = rng.int(0, MH - h);
      if (!fits(i0, j0, w, h)) continue;
      add(i0, j0, w, h, 'big'); made++;
    }
  }
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    if (owner[j * MW + i] === -1) add(i, j, 1, 1, rng.chance(lat.junction ?? 0.25) ? 'junction' : 'room');
  }
  const contactsOf = () => {
    const m = new Map();
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      const a = owner[j * MW + i];
      if (a < 0 || nodes[a].dead) continue;
      for (const [di, dj, axis] of [[1, 0, 'x'], [0, 1, 'z']]) {
        const i2 = i + di, j2 = j + dj;
        if (i2 >= MW || j2 >= MH) continue;
        const b = owner[j2 * MW + i2];
        if (b < 0 || b === a || nodes[b].dead) continue;
        const key = a < b ? a * 4096 + b : b * 4096 + a;
        let arr = m.get(key); if (!arr) m.set(key, (arr = []));
        arr.push({ a, b, axis, ci: i, cj: j });
      }
    }
    return m;
  };
  const connected = () => {
    const m = contactsOf();
    const adj = new Map();
    for (const arr of m.values()) { const { a, b } = arr[0]; (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const seen = new Set([start.id]);
    const q = [start.id];
    for (let k = 0; k < q.length; k++) for (const o of adj.get(q[k]) || []) if (!seen.has(o)) { seen.add(o); q.push(o); }
    return nodes.every((n) => n.dead || seen.has(n.id));
  };
  // drop a few single slots (solid rock / open void) for an irregular outline
  const cand = rng.shuffle(nodes.filter((n) => n.kind === 'room' || n.kind === 'junction'));
  for (const n of cand) {
    if (!rng.chance(lat.drop ?? 0)) continue;
    n.dead = true;
    if (!connected()) n.dead = false;
  }
  const contacts = contactsOf();
  const nb = new Map(nodes.map((n) => [n.id, []]));
  for (const arr of contacts.values()) { const { a, b } = arr[0]; nb.get(a).push(b); nb.get(b).push(a); }
  const pairKey = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a);

  // growing-tree spanning tree from the start (the boss joins last)
  const inTree = new Set([start.id]);
  const active = [start.id];
  const treeKeys = new Set();
  const parent = new Map();
  while (active.length) {
    const k = rng.chance(lat.branch ?? 0.35) ? rng.int(0, active.length - 1) : active.length - 1;
    const id = active[k];
    const opts = nb.get(id).filter((m) => !inTree.has(m) && m !== boss.id);
    if (!opts.length) { active.splice(k, 1); continue; }
    const m = rng.pick(opts);
    inTree.add(m); treeKeys.add(pairKey(id, m)); parent.set(m, id); active.push(m);
  }
  // tree depth, then hang the boss off the deepest neighbour
  const tdepth = new Map([[start.id, 0]]);
  const q = [start.id];
  for (let k = 0; k < q.length; k++) for (const o of nb.get(q[k])) if (!tdepth.has(o) && treeKeys.has(pairKey(q[k], o))) { tdepth.set(o, tdepth.get(q[k]) + 1); q.push(o); }
  let bp = -1, bd = -1;
  for (const o of nb.get(boss.id)) { const d = (tdepth.get(o) ?? -1) + rng.float(0, 0.5); if (d > bd) { bd = d; bp = o; } }
  if (bp < 0) throw new Error('maze: boss unreachable');
  treeKeys.add(pairKey(bp, boss.id)); parent.set(boss.id, bp); inTree.add(boss.id);
  // path start -> boss and its gates
  const path = [];
  for (let c = boss.id; parent.has(c); c = parent.get(c)) path.unshift(pairKey(parent.get(c), c));
  const maxGates = depth <= 1 ? 1 : depth <= 4 ? 2 : 3;
  const gates = new Set([path[path.length - 1]]);
  const want = Math.min(maxGates, path.length) - 1;
  for (let k = 1; k <= want; k++) {
    const idx = clamp(Math.round((k * (path.length - 1)) / (want + 1)), 1, path.length - 2);
    if (idx >= 1) gates.add(path[idx]);
  }
  // zones
  const zoneOf = new Map([[start.id, 0]]);
  const zq = [start.id];
  for (let k = 0; k < zq.length; k++) {
    const id = zq[k];
    for (const o of nb.get(id)) {
      if (zoneOf.has(o) || !treeKeys.has(pairKey(id, o))) continue;
      zoneOf.set(o, zoneOf.get(id) + (gates.has(pairKey(id, o)) ? 1 : 0));
      zq.push(o);
    }
  }
  // edges: tree + loops inside a zone (never into the boss room)
  const edges = [];
  for (const [key, arr] of contacts) {
    const c = rng.pick(arr);
    const tree = treeKeys.has(key);
    if (!tree) {
      if (c.a === boss.id || c.b === boss.id) continue;
      if (zoneOf.get(c.a) !== zoneOf.get(c.b)) continue;
      if (!rng.chance(lat.loops ?? 0.3)) continue;
    }
    edges.push({ a: c.a, b: c.b, axis: c.axis, ci: c.ci, cj: c.cj, tree, gate: gates.has(key), loop: !tree, key });
  }
  // the skin may tag edges (wide openings, flat track tunnels...)
  if (lat.tagEdge) for (const e of edges) lat.tagEdge(e, nodes, rng);
  return { nodes, edges, start, boss, zoneOf, path, gates };
}

// ======================================================================
// Corridors
// ======================================================================
// e.cells: every corridor cell; e.cellAt(t, s) -> index; lanes: optional
// {walk:[s0,s1), pit:{s0,s1,depth,kind}} (sewer channels, track beds).
export function corridorGeom(g, e) {
  e.cellAt = (t, s) => {
    const tt = e.t0 + t, ss = e.pos + s;
    return e.axis === 'x' ? g.idx(tt, ss) : g.idx(ss, tt);
  };
  e.xz = (t, s) => (e.axis === 'x' ? [e.t0 + t, e.pos + s] : [e.pos + s, e.t0 + t]);
  // stairs sit in the middle (or after the gate's door + landing)
  const n = e.n;
  if (e.gate) e.s0 = 2 + Math.floor((e.L - 2 - n) / 2);
  else if (e.flatMouth) e.s0 = 1 + Math.floor((e.L - 2 - n) / 2);
  else e.s0 = Math.floor((e.L - n) / 2);
  e.hAt = (t) => (t < e.s0 ? e.A.floor : t >= e.s0 + n ? e.B.floor : null);
  // low (walking) height at t
  e.lowAt = (t) => {
    if (t < e.s0) return e.A.floor;
    if (t >= e.s0 + n) return e.B.floor;
    const k = t - e.s0, r = e.dh / n;
    return e.dh >= 0 ? e.A.floor + r * k : e.A.floor + r * (k + 1);
  };
  e.topAt = (t) => {
    if (t < e.s0) return e.A.floor;
    if (t >= e.s0 + n) return e.B.floor;
    const k = t - e.s0, r = e.dh / n;
    return e.dh >= 0 ? e.A.floor + r * (k + 1) : e.A.floor + r * k;
  };
}

export function carveCorridor(ctx, e) {
  const { g, deco, isVoid, skin, style } = ctx;
  corridorGeom(g, e);
  const H = e.ceilH ?? (typeof skin.corridorH === 'function' ? skin.corridorH(e) : skin.corridorH ?? 3.5);
  const top = Math.max(e.A.floor, e.B.floor);
  const light = Math.min(e.A.light, e.B.light) * (skin.corridorLight ?? 0.9);
  const floorTex = e.floorTex ?? skin.corridorFloor ?? TS.FLOOR2;
  const wallTex = e.wallTex ?? skin.corridorWall ?? TS.WALL;
  const lanes = e.lanes || { walk: [0, e.width] };
  e.cells = [];
  for (let t = 0; t < e.L; t++) for (let s = 0; s < e.width; s++) {
    const [x, z] = e.xz(t, s);
    const i = g.idx(x, z);
    const h = e.lowAt(t);
    const ceil = (e.n ? Math.max(e.topAt(t), h) : h) + H;
    const inPit = lanes.pit && s >= lanes.pit.s0 && s < lanes.pit.s1 && t >= (lanes.pit.t0 ?? 1) && t <= e.L - 1 - (lanes.pit.t1 ?? 1);
    if (inPit) {
      const P = lanes.pit;
      const f = h - P.depth;
      g.open(x, z, f, Math.max(ceil, top + H), { sky: isVoid, light: Math.max(light, P.glow ? 0.85 : light), floorTex: P.floorTex ?? TS.HAZARD, wallTex: P.wallTex ?? TS.PITWALL, region: -2, haz: P.haz ?? 0 });
      g.flags[i] &= ~F.VOID;
      g.flags[i] |= F.NOSPAWN | (P.deep === false ? 0 : F.PIT) | (P.haz ? F.HAZARD : 0) | (P.water ? F.WATER : 0);
      if (P.haz === HAZ.WATER && P.deep === false) g.flags[i] &= ~F.HAZARD;
    } else {
      g.open(x, z, h, isVoid ? h + 3 : ceil, { sky: isVoid, light, floorTex, wallTex: isVoid ? (e.deckSide ?? TS.SIDE) : TS.SIDE, region: -2 });
      g.flags[i] &= ~F.VOID;
      if (isVoid) g.flags[i] |= F.BRIDGE;
    }
    e.cells.push(i);
  }
  // pit rim cells take the pit wall texture
  if (lanes.pit) for (const i of e.cells) if (!(g.flags[i] & F.PIT) && !(g.flags[i] & F.HAZARD)) {
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) { const j = g.idx(x + DIR_X[d], z + DIR_Z[d]); if (g.flags[j] & (F.PIT | F.HAZARD)) { g.wallTex[i] = lanes.pit.wallTex ?? TS.PITWALL; break; } }
  }
  // walls along the corridor
  if (!isVoid) for (let t = -1; t <= e.L; t++) for (const s of [-1, e.width]) {
    const [x, z] = e.xz(t, s);
    if (g.in(x, z) && !g.type[g.idx(x, z)]) g.wallTex[g.idx(x, z)] = wallTex;
  }
  // stair flight over the walking lanes
  if (e.n > 0) {
    const [w0, w1] = lanes.walk;
    const [sx, sz] = e.xz(e.s0, w0);
    const cells = deco.stairs(sx, sz, e.dir, w1 - w0, e.A.floor, e.B.floor, { rise: Math.abs(e.dh) / e.n, light, region: -2, style: e.railStyle ?? style.railStyle, sky: isVoid, ceil: top + H });
    for (const i of cells) { g.flags[i] &= ~(F.VOID | F.BRIDGE); if (!isVoid) g.ceil[i] = Math.max(g.ceil[i], top + H); }
    e.stairCells = cells;
  }
  // guard rails along drops (pit lanes, void sides of bridges)
  if (lanes.pit || isVoid) {
    const walk = e.cells.filter((i) => !(g.flags[i] & (F.PIT | F.HAZARD | F.STAIR)) && g.type[i]);
    deco.railEdges(walk, { style: e.railStyle ?? style.railStyle, allow: e.allowRail });
  }
  if (skin.dressCorridor) skin.dressCorridor(ctx, e);
}

// Keyed doorway: a wall across the corridor at t = 0 with one opening, 3
// cells wide when the walking lanes allow (narrower lanes: all of them).
export function buildGate(ctx, e) {
  const { g, isVoid, skin } = ctx;
  if (!e.xz) corridorGeom(g, e);
  const lanes = e.lanes || { walk: [0, e.width] };
  const [w0, w1] = lanes.walk;
  const dw = Math.min(3, w1 - w0);
  const ds = w0 + Math.floor((w1 - w0 - dw) / 2);
  const t = 0;
  const f = e.A.floor;
  const wallTex = skin.gateWall ?? (isVoid ? TS.WALL2 : TS.ACCENT);
  const top = f + (isVoid ? 4.2 : 6);
  e.doorCells = [];
  for (let s = 0; s < e.width; s++) {
    const [x, z] = e.xz(t, s);
    const i = g.idx(x, z);
    if (s >= ds && s < ds + dw) {
      g.flags[i] &= ~(F.BRIDGE | F.VOID | F.PIT | F.HAZARD | F.NOSPAWN | F.WATER);
      g.hazType[i] = 0;
      g.clearEdges(x, z);
      g.sky[i] = 0;
      g.floor[i] = f;
      g.ceil[i] = f + 3;
      g.floorTex[i] = skin.gateFloor ?? TS.FLOOR2;
      g.ceilTex[i] = TS.CEIL;
      e.doorCells.push(i);
    } else {
      g.solid(x, z, top, wallTex);
      g.floorTex[i] = TS.TRIM;
    }
  }
  e.doorCell = e.doorCells[(dw - 1) >> 1];
  // jambs either side of the doorway take the trim texture (door frame); in
  // a void map the corridor is a bridge, so the jambs become gate towers
  for (const s of [ds - 1, ds + dw]) {
    const [x, z] = e.xz(t, s);
    if (!g.in(x, z)) continue;
    const i = g.idx(x, z);
    if (isVoid && g.type[i] && (g.flags[i] & F.VOID)) { g.solid(x, z, top, wallTex); g.floorTex[i] = TS.TRIM; }
    if (!g.type[i] || (s >= 0 && s < e.width)) g.wallTex[i] = TS.TRIM;
  }
  // gate towers in a void map: give the gate a roof slab
  if (isVoid) {
    const [x0, z0] = e.xz(t, ds), [x1, z1] = e.xz(t, ds + dw - 1);
    const ax = Math.min(x0, x1), az = Math.min(z0, z1), bx = Math.max(x0, x1) + 1, bz = Math.max(z0, z1) + 1;
    ctx.deco.box(ax - (e.axis === 'z' ? 1 : 0), f + 3, az - (e.axis === 'x' ? 1 : 0), bx + (e.axis === 'z' ? 1 : 0), f + 3.4, bz + (e.axis === 'x' ? 1 : 0), TS.TRIM);
  }
}

// ======================================================================
// Shared helpers
// ======================================================================
function snapRect(g, x0, z0, w, h) {
  const s = [];
  for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
    if (!g.in(x, z)) continue;
    const i = g.idx(x, z);
    s.push([i, g.type[i], g.floor[i], g.ceil[i], g.sky[i], g.flags[i], g.hazType[i], g.stairDir[i], g.rise[i], g.edge[i], g.floorTex[i], g.wallTex[i], g.ceilTex[i], g.light[i]]);
  }
  return s;
}
function restoreRect(g, s) {
  for (const [i, t, f, c, sk, fl, hz, sd, rs, ed, ft, wt, ct, lt] of s) {
    g.type[i] = t; g.floor[i] = f; g.ceil[i] = c; g.sky[i] = sk; g.flags[i] = fl; g.hazType[i] = hz; g.stairDir[i] = sd; g.rise[i] = rs;
    g.floorTex[i] = ft; g.wallTex[i] = wt; g.ceilTex[i] = ct; g.light[i] = lt;
  }
  // edges are symmetric: restore after all cells are back
  for (const [i, , , , , , , , , ed] of s) g.edge[i] = ed;
}

export function roomConnected(g, n, cells) {
  const set = new Set(cells);
  const ex = [];
  for (const e of n.exits) for (const i of e.cells) ex.push(i);
  if (!ex.length) return true;
  for (const i of ex) if (!g.type[i] || (g.flags[i] & (F.PIT | F.VOID | F.OBSTACLE))) return false;
  const dist = g.bfs([ex[0]], { blocked: (b) => !set.has(b), avoid: F.OBSTACLE });
  for (const i of ex) if (dist[i] < 0) return false;
  let walk = 0, reach = 0;
  for (const i of cells) {
    if (!g.type[i] || (g.flags[i] & (F.PIT | F.VOID | F.OBSTACLE | F.HAZARD))) continue;
    walk++; if (dist[i] >= 0) reach++;
  }
  return reach >= walk * 0.75;
}

function setWallTops(g, skyWall) {
  const W = g.w, Hh = g.h;
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x;
    if (g.type[i]) continue;
    let top = -Infinity, any = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= Hh) continue;
      const j = nz * W + nx;
      if (!g.type[j]) continue;
      any = true;
      top = Math.max(top, g.sky[j] ? g.floor[j] + skyWall : g.ceil[j] + 0.6);
    }
    if (any) g.floor[i] = Math.max(g.floor[i] === g.wallTop ? -99 : g.floor[i], top);
  }
}

function startCell(g, n) {
  const cx = Math.floor(n.x + n.w / 2), cz = Math.floor(n.z + n.h / 2);
  let best = null, bd = Infinity;
  for (let z = n.z; z < n.z + n.h; z++) for (let x = n.x; x < n.x + n.w; x++) {
    const i = g.idx(x, z);
    if (!g.type[i] || (g.flags[i] & (F.PIT | F.VOID | F.HAZARD | F.OBSTACLE | F.STAIR))) continue;
    const d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < bd) { bd = d; best = { x, z }; }
  }
  return best || { x: cx, z: cz };
}

// start -> boss and every room must be reachable (doors open)
function verify(out, used, nodes) {
  const g = out.grid;
  const si = g.idx(out.start.x, out.start.z);
  const dist = g.bfs([si], { jumpGap: out.jumpGap || 0, avoid: F.OBSTACLE });
  let bossOk = false;
  for (const i of out.arenaCells) if (dist[i] >= 0) { bossOk = true; break; }
  if (!bossOk) throw new Error('maze: boss arena unreachable');
  for (const e of used) if (e.doorCell !== undefined && dist[e.doorCell] < 0) throw new Error('maze: gate unreachable');
}

// ---------------------------------------------------------------- template helpers
// room axis helpers: t along the long axis, s across it
export function axes(r) {
  const alongX = r.w >= r.h;
  const L = alongX ? r.w : r.h, Wd = alongX ? r.h : r.w;
  const xz = (t, s) => (alongX ? [r.x + t, r.z + s] : [r.x + s, r.z + t]);
  return { alongX, L, Wd, xz };
}
export function isFree(ctx, x, z) {
  const { g, room: r } = ctx;
  if (!inRoom(r, x, z)) return false;
  const i = g.idx(x, z);
  return !r.reserved.has(i) && ctx.deco.cellFree(x, z, 1.6) && Math.abs(g.floor[i] - r.floor) < 0.01;
}
export function rectFree(ctx, x0, z0, w, h, margin = 0) {
  for (let z = z0 - margin; z < z0 + h + margin; z++) for (let x = x0 - margin; x < x0 + w + margin; x++) if (!isFree(ctx, x, z)) return false;
  return true;
}
// ceiling light panels on a grid (skips pits / stairs / sky)
export function panelGrid(ctx, step = 4, o = {}) {
  const { g, deco, room: r } = ctx;
  if (r.sky) return;
  const color = o.color || [0.95, 0.97, 1];
  const off = o.offset ?? 2;
  for (let z = r.z + off; z < r.z + r.h - 1; z += step) for (let x = r.x + off; x < r.x + r.w - 1; x += step) {
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i]) continue;
    const cy = g.ceil[i];
    if (o.flicker && ctx.rng.chance(o.flicker)) {
      deco.box(x + 0.15, cy - 0.06, z + 0.3, x + 0.85, cy, z + 0.7, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
      deco.light(x + 0.5, cy - 0.3, z + 0.5, color, o.radius ?? 6, { flicker: true });
    } else if (o.long) {
      deco.lightPanel(x + 0.35, z + 0.1, x + 0.65, z + 0.9, cy, color, o.radius ?? 6);
    } else deco.lightPanel(x + 0.15, z + 0.3, x + 0.85, z + 0.7, cy, color, o.radius ?? 6);
  }
  r.lit = true;
}
// hanging lamps (chain + shade) for tall rooms
export function hangingLamps(ctx, step = 5, o = {}) {
  const { g, deco, room: r } = ctx;
  if (r.sky) return;
  for (let z = r.z + 2; z < r.z + r.h - 1; z += step) for (let x = r.x + 2; x < r.x + r.w - 1; x += step) {
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i]) continue;
    const cy = g.ceil[i];
    const drop = Math.min(o.drop ?? 1.6, Math.max(0.4, cy - g.floor[i] - 3));
    deco.box(x + 0.47, cy - drop, z + 0.47, x + 0.53, cy, z + 0.53, TS.METAL, { faces: FACE.SIDES });
    deco.box(x + 0.2, cy - drop - 0.25, z + 0.2, x + 0.8, cy - drop, z + 0.8, TS.METAL);
    deco.box(x + 0.26, cy - drop - 0.3, z + 0.26, x + 0.74, cy - drop - 0.25, z + 0.74, TS.LIGHT, { uv: 'fit', emissive: 1 });
    deco.light(x + 0.5, cy - drop - 0.6, z + 0.5, o.color || [1, 0.85, 0.6], o.radius ?? 7, { flicker: !!o.flicker && ctx.rng.chance(0.3) });
  }
  r.lit = true;
}
// wall lamps along the long walls of a room
export function wallLamps(ctx, step = 4, o = {}) {
  const { g, deco, room: r } = ctx;
  const y = o.y ?? 2.2;
  for (let x = r.x + 1; x < r.x + r.w - 1; x += step) {
    for (const [z, d] of [[r.z, 3], [r.z + r.h - 1, 2]]) {
      const i = g.idx(x, z);
      if (!g.type[i] || r.reserved.has(i) || (g.flags[i] & (F.STAIR | F.PIT | F.VOID))) continue;
      if (g.type[g.idx(x + DIR_X[d], z + DIR_Z[d])]) continue;
      deco.wallLight(x, z, d, g.floor[i] + y, o.color || [1, 0.8, 0.5], { flicker: !!o.flicker && ctx.rng.chance(0.4), radius: o.radius ?? 5.5 });
    }
  }
  for (let z = r.z + 1; z < r.z + r.h - 1; z += step) {
    for (const [x, d] of [[r.x, 1], [r.x + r.w - 1, 0]]) {
      const i = g.idx(x, z);
      if (!g.type[i] || r.reserved.has(i) || (g.flags[i] & (F.STAIR | F.PIT | F.VOID))) continue;
      if (g.type[g.idx(x + DIR_X[d], z + DIR_Z[d])]) continue;
      deco.wallLight(x, z, d, g.floor[i] + y, o.color || [1, 0.8, 0.5], { flicker: !!o.flicker && ctx.rng.chance(0.4), radius: o.radius ?? 5.5 });
    }
  }
  r.lit = true;
}
// walk the corridor and call fn(t, s, x, z, i) for a given lane across it
export function corridorEach(e, fn) {
  for (let t = 0; t < e.L; t++) for (let s = 0; s < e.width; s++) { const [x, z] = e.xz(t, s); fn(t, s, x, z, e.cellAt(t, s)); }
}
// world-space box spanning corridor coords t0..t1 (along) and s0..s1 (across)
export function corridorBox(deco, e, t0, t1, s0, s1, y0, y1, tex, o) {
  const a0 = e.t0 + t0, a1 = e.t0 + t1, b0 = e.pos + s0, b1 = e.pos + s1;
  if (e.axis === 'x') return deco.box(a0, y0, b0, a1, y1, b1, tex, o);
  return deco.box(b0, y0, a0, b1, y1, a1, tex, o);
}
// deep / shallow pit in absolute coords inside room r (wraps arch makePit)
export function pitRect(ctx, x0, z0, w, h, kind, depth) { makePit(ctx, x0, z0, w, h, kind, depth); }
export { HAZ, F, TS, DIR_X, DIR_Z, OPP };
