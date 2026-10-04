// "Architect" generator for interior levels (stations, bases, labs, castles,
// mansions, foundries...). The map is split into large spaces (BSP leaves)
// that each get a room template: tall halls with colonnades, atriums with
// railed balconies, pit rooms with bridges over lava / poison / spikes,
// split-level rooms joined by staircases, industrial catwalks, storage bays,
// control rooms, courtyards, reactors and the boss arena. Spaces connect
// through wide openings or doorways in thick walls; height differences get
// real staircases with hand rails. Zones separated by single doorways give
// the populate step clean chokepoints for keyed doors.
import { TS, F, HAZ, OPP, DIR_X, DIR_Z, newGrid, encloseBorder, clamp } from './common.js';
import { Deco } from './deco.js';

// ------------------------------------------------------------------ styles
export function styleOf(theme) {
  const id = theme.id || '';
  const a = theme.archetype;
  const has = (...k) => k.some((s) => id.includes(s));
  let family = 'tech';
  if (a === 'castle' || has('castle', 'temple', 'cathedral', 'clocktower', 'throne', 'crypt')) family = 'gothic';
  else if (has('hell', 'infernal', 'flesh', 'meat', 'demon')) family = 'hell';
  else if (has('mansion', 'hospital', 'hotel', 'office')) family = 'domestic';
  else if (has('foundry', 'factory', 'mine', 'rig', 'clockwork', 'plant', 'volcano')) family = 'industrial';
  else if (has('military', 'bunker', 'prison')) family = 'military';
  else if (has('bio', 'lab', 'hive', 'organic')) family = 'lab';
  const S = {
    tech: { rail: 'metal', hazards: ['poison', 'lava', 'spikes'], wain: 0, crown: true, lights: 'panel', pillars: 'square', outdoor: 0.0 },
    industrial: { rail: 'metal', hazards: ['lava', 'poison', 'spikes'], wain: 0, crown: false, lights: 'hanging', pillars: 'girder', outdoor: 0.1 },
    military: { rail: 'metal', hazards: ['spikes', 'poison'], wain: 1.0, crown: false, lights: 'panel', pillars: 'square', outdoor: 0.15 },
    lab: { rail: 'glass', hazards: ['poison', 'poison', 'spikes'], wain: 1.1, crown: true, lights: 'panel', pillars: 'square', outdoor: 0.0 },
    gothic: { rail: 'stone', hazards: ['spikes', 'lava', 'water'], wain: 1.2, crown: true, lights: 'torch', pillars: 'column', outdoor: 0.3 },
    hell: { rail: 'iron', hazards: ['lava', 'lava', 'spikes'], wain: 0, crown: false, lights: 'torch', pillars: 'column', outdoor: 0.2 },
    domestic: { rail: 'wood', hazards: ['spikes', 'water'], wain: 1.1, crown: true, lights: 'sconce', pillars: 'column', outdoor: 0.1 },
  }[family];
  // theme overrides
  if (theme.hazard === 'lava') S.hazards = ['lava', 'lava', 'spikes'];
  else if (theme.hazard === 'acid') S.hazards = ['poison', 'poison', 'spikes'];
  else if (theme.hazard === 'water') S.hazards = [...S.hazards.filter((h) => h !== 'lava'), 'water'];
  if (theme.params?.courtyards) S.outdoor = Math.max(S.outdoor, theme.params.courtyards);
  if (theme.archetype === 'station') S.outdoor = 0;
  return { family, ...S, railStyle: theme.railStyle || S.rail };
}

const HAZ_OF = { lava: HAZ.LAVA, poison: HAZ.POISON, spikes: HAZ.SPIKES, water: HAZ.WATER };
const FACE_SIDES_TOP = 31; // FACE.SIDES | FACE.TOP
const HAZ_TEX = { lava: TS.LAVA, poison: TS.POISON, spikes: TS.PITWALL, water: TS.WATER };
const LIGHT_COL = { lava: [1, 0.45, 0.15], poison: [0.5, 1, 0.3], water: [0.3, 0.6, 1], spikes: [1, 0.9, 0.8] };

// ------------------------------------------------------------------ main
export function genArch(rng, theme, depth, opt = {}) {
  const p = theme.params || {};
  const style = { ...styleOf(theme), ...(opt.style || {}) };
  const size = Math.round(clamp(58 + depth * 0.9, 58, 96) * (p.size || 1) * (opt.scale || 1));
  const W = size, H = Math.round(size * rng.float(0.78, 0.95));
  const g = newGrid(W, H, 10);
  const deco = new Deco(g, { ...theme, railStyle: style.railStyle }, rng);
  const baseLight = theme.light ?? 0.75, lightVar = theme.lightVar ?? 0.25;

  // ---- BSP into big leaves
  const leaves = [];
  const minLeaf = 12;
  let bigMade = false;  // opt.bigLeaf {minW,minH,maxW,maxH}: keep one large leaf unsplit (signature room)
  function split(n, d) {
    const area = n.w * n.h;
    const canH = n.w >= minLeaf * 2, canV = n.h >= minLeaf * 2;
    const bl = opt.bigLeaf;
    if (bl && !bigMade && d >= 1 && n.w >= bl.minW && n.h >= bl.minH && n.w <= bl.maxW && n.h <= bl.maxH) { bigMade = true; leaves.push({ id: leaves.length, ...n, big: true }); return; }
    const two = (a, b) => { if (bl && !bigMade && rng.chance(0.5)) { split(b, d + 1); split(a, d + 1); } else { split(a, d + 1); split(b, d + 1); } };
    const stop = (!canH && !canV) || (d >= 2 && area < 520 && rng.chance(0.35)) || (d >= 3 && area < 360 && rng.chance(0.5));
    if (stop) { leaves.push({ id: leaves.length, ...n }); return; }
    const horiz = canH && (!canV || n.w > n.h * 1.2 || (n.h <= n.w * 1.2 && rng.chance(0.5)));
    if (horiz) {
      const cut = rng.int(Math.max(minLeaf, Math.floor(n.w * 0.32)), Math.min(n.w - minLeaf, Math.ceil(n.w * 0.68)));
      two({ x: n.x, z: n.z, w: cut, h: n.h }, { x: n.x + cut, z: n.z, w: n.w - cut, h: n.h });
    } else {
      const cut = rng.int(Math.max(minLeaf, Math.floor(n.h * 0.32)), Math.min(n.h - minLeaf, Math.ceil(n.h * 0.68)));
      two({ x: n.x, z: n.z, w: n.w, h: cut }, { x: n.x, z: n.z + cut, w: n.w, h: n.h - cut });
    }
  }
  // opt.layout({W, H, rng, minLeaf, split, add}): a custom partition (e.g. a
  // central core leaf with BSP-split wings around it); add(n, big) pushes a leaf
  if (opt.layout) opt.layout({ W, H, rng, minLeaf, split, add: (n, big) => leaves.push({ id: leaves.length, ...n, ...(big ? { big: true } : {}) }) });
  else split({ x: 1, z: 1, w: W - 2, h: H - 2 }, 0);

  // rooms = leaves inset by one cell (walls between rooms are 2 thick)
  const rooms = leaves.map((l) => ({
    id: l.id, leaf: l, x: l.x + 1, z: l.z + 1, w: l.w - 2, h: l.h - 2,
    cx: l.x + l.w / 2, cz: l.z + l.h / 2, area: (l.w - 2) * (l.h - 2),
    exits: [], reserved: new Set(), floor: 0, zone: 0, template: 'plain',
  }));

  // ---- adjacency (shared boundary segments long enough for an opening)
  const adj = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const A = rooms[i].leaf, B = rooms[j].leaf;
    let seg = null;
    if (A.x + A.w === B.x || B.x + B.w === A.x) {
      const line = A.x + A.w === B.x ? B.x : A.x;
      const a0 = Math.max(A.z, B.z) + 2, a1 = Math.min(A.z + A.h, B.z + B.h) - 2;
      if (a1 - a0 >= 3) seg = { axis: 'x', line, a0, a1, lo: A.x + A.w === B.x ? i : j, hi: A.x + A.w === B.x ? j : i };
    } else if (A.z + A.h === B.z || B.z + B.h === A.z) {
      const line = A.z + A.h === B.z ? B.z : A.z;
      const a0 = Math.max(A.x, B.x) + 2, a1 = Math.min(A.x + A.w, B.x + B.w) - 2;
      if (a1 - a0 >= 3) seg = { axis: 'z', line, a0, a1, lo: A.z + A.h === B.z ? i : j, hi: A.z + A.h === B.z ? j : i };
    }
    if (seg) adj.push({ i, j, ...seg, len: seg.a1 - seg.a0 });
  }
  const nbrs = rooms.map(() => []);
  for (const e of adj) { nbrs[e.i].push(e); nbrs[e.j].push(e); }

  // ---- start, boss, spanning tree, zones
  const startPool = rooms.filter((r) => !r.leaf.big).length ? rooms.filter((r) => !r.leaf.big) : rooms;
  const start = startPool.reduce((b, r) => (r.cx + r.cz < b.cx + b.cz ? r : b), startPool[0]);
  const gd = graphDist(start.id);
  let boss = null, bs = -1;
  for (const r of rooms) {
    if (r === start || gd[r.id] < 0 || (opt.forceBig && r.leaf.big)) continue;
    const sc = gd[r.id] * 3 + Math.min(r.area, 500) / 30 + (r.area >= 150 ? 6 : 0);
    if (sc > bs) { bs = sc; boss = r; }
  }
  if (!boss) boss = rooms.find((r) => r !== start) || start;
  // random-order Prim tree from the start; the boss room is a leaf of the tree
  const inTree = new Set([start.id]);
  const treeEdges = [];
  let frontier = [...nbrs[start.id]];
  while (frontier.length) {
    rng.shuffle(frontier);
    frontier.sort((a, b) => (a.i === boss.id || a.j === boss.id ? 1 : 0) - (b.i === boss.id || b.j === boss.id ? 1 : 0));
    const e = frontier.shift();
    const a = inTree.has(e.i), b = inTree.has(e.j);
    if (a && b) continue;
    const nw = a ? e.j : e.i;
    if (nw === boss.id && inTree.size < rooms.length - 1 && frontier.some((f) => !(inTree.has(f.i) && inTree.has(f.j)) && f.i !== boss.id && f.j !== boss.id)) { frontier.push(e); continue; }
    inTree.add(nw);
    treeEdges.push(e);
    e.parent = a ? e.i : e.j; e.child = nw;
    for (const f of nbrs[nw]) if (!(inTree.has(f.i) && inTree.has(f.j))) frontier.push(f);
  }
  const parentOf = new Map(treeEdges.map((e) => [e.child, e]));
  // path start -> boss, choose gates along it
  const path = [];
  for (let c = boss.id; parentOf.has(c); c = parentOf.get(c).parent) path.unshift(parentOf.get(c));
  const maxGates = depth <= 1 ? 1 : depth <= 4 ? 2 : 3;
  const gates = new Set();
  if (path.length) gates.add(path[path.length - 1]);                      // boss gate
  const mids = path.slice(0, -1).filter((e, k) => k >= 1);
  rng.shuffle(mids);
  for (const e of mids) { if (gates.size >= maxGates) break; gates.add(e); }
  // zones
  const zoneOf = new Map([[start.id, 0]]);
  const order = [start.id];
  for (let k = 0; k < order.length; k++) {
    const id = order[k];
    for (const e of treeEdges) if (e.parent === id) { zoneOf.set(e.child, zoneOf.get(id) + (gates.has(e) ? 1 : 0)); order.push(e.child); }
  }
  for (const r of rooms) r.zone = zoneOf.get(r.id) ?? 0;
  // extra loops inside a zone (never into the boss room)
  const edges = treeEdges.map((e) => ({ ...e, gate: gates.has(e) }));
  for (const e of adj) {
    if (treeEdges.includes(e) || e.i === boss.id || e.j === boss.id) continue;
    if (rooms[e.i].zone !== rooms[e.j].zone) continue;
    if (rng.chance(0.42)) edges.push({ ...e, gate: false, loop: true });
  }

  // ---- base heights along the tree
  start.floor = 0;
  const DELTAS = [0, 0, 0, 0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, -3.0];
  for (const id of order) {
    for (const e of treeEdges) if (e.parent === id) {
      const child = rooms[e.child];
      let dh = rng.pick(DELTAS) * (theme.params?.flat ? 0 : 1);
      if (child === boss) dh = rng.pick([0, 0, -1.2, -1.8, 1.2]);
      // drift back toward ground level so the map does not sink or climb forever
      const pf = rooms[id].floor;
      if ((pf > 2.4 && dh > 0) || (pf < -2.4 && dh < 0)) dh = -dh;
      child.floor = clamp(pf + dh, -3.6, 4.8);
    }
  }
  for (const e of edges) if (e.loop && Math.abs(rooms[e.i].floor - rooms[e.j].floor) > 3.6) e.skip = true;

  // ---- templates
  const big = (r) => r.w >= 14 && r.h >= 14;
  for (const r of rooms) {
    if (r === boss) { r.template = opt.arenaTemplate || 'arena'; continue; }
    if (r === start) { r.template = opt.startTemplate ? opt.startTemplate(r, rng) : r.area > 160 && rng.chance(0.5) ? 'hall' : 'entry'; continue; }
    const base = [
      ['hall', r.w >= 10 && r.h >= 10 ? 2 : 0.4],
      ['atrium', big(r) ? 3 : 0],
      ['pitroom', r.w >= 11 && r.h >= 11 ? 3 : 0],
      ['split', r.w >= 12 || r.h >= 12 ? 2.2 : 0],
      ['industrial', style.family === 'industrial' && r.area >= 100 ? 2.6 : (style.family === 'tech' || style.family === 'military') && r.area >= 120 ? 1.2 : 0.2],
      ['storage', 1.4],
      ['control', style.family === 'tech' || style.family === 'lab' || style.family === 'military' ? 1.6 : 0.2],
      ['courtyard', r.area >= 100 ? style.outdoor * 5 : 0],
      ['chapel', style.family === 'gothic' || style.family === 'hell' ? 2.2 : 0],
      ['reactor', (style.family === 'tech' || style.family === 'industrial') && r.w >= 13 && r.h >= 13 ? 1.4 : 0],
      ['pools', r.area >= 90 ? 1.0 : 0],
    ].filter((o) => o[1] > 0);
    // opt.roomOpts(room, weightedList, style): generators built on this one re-weight / add templates
    const opts = opt.roomOpts ? opt.roomOpts(r, base, style).filter((o) => o[1] > 0) : base;
    r.template = rng.weighted(opts, (o) => o[1])[0];
  }
  // opt.forceBig: the largest non-start, non-boss room gets this (signature) template
  if (opt.forceBig) {
    const cand = rooms.filter((r) => r !== start && r !== boss);
    const sig = cand.find((r) => r.leaf.big) || cand.reduce((b, r) => (r.area > b.area ? r : b), cand[0]);
    if (sig) { sig.template = opt.forceBig; sig.signature = true; }
  }

  // ---- connection geometry (positions, widths, heights) before carving
  const conns = [];
  for (const e of edges) {
    if (e.skip) continue;
    const A = rooms[e.lo], B = rooms[e.hi];       // lo is on the -axis side
    const door = e.gate || (!e.loop && rng.chance(opt.doorChance ?? 0.18)) || e.len < 4;
    // keyed gates are 3-wide doorways (the overlap a0..a1 is always >= 3);
    // plain doorways stay 1 wide
    const width = e.gate ? Math.min(3, e.len) : door ? 1 : Math.min(e.len - 1, rng.pick(opt.connWidths || [2, 2, 3, 3, 4]));
    const pos = rng.int(e.a0, e.a1 - width);
    conns.push({ ...e, A, B, door, width, pos });
  }
  // decide where height changes are absorbed: passage stairs (<=1.2) or a flight in a room
  for (const c of conns) {
    const dh = c.B.floor - c.A.floor;
    c.dh = dh;
    // gates take small climbs as a flight in a room too: the doorway itself
    // must be flat for the door
    c.mode = Math.abs(dh) < 0.01 ? 'flat' : Math.abs(dh) <= 1.21 && !c.gate ? 'passage' : 'flight';
    if (c.mode === 'flight') {
      // put the flight in the room with more depth; prefer the lower room
      const depthA = c.axis === 'x' ? c.A.w : c.A.h, depthB = c.axis === 'x' ? c.B.w : c.B.h;
      const n = Math.ceil(Math.abs(dh) / 0.6 - 1e-6);
      const lowA = c.A.floor < c.B.floor;
      const okA = depthA >= n + 4, okB = depthB >= n + 4;
      c.flightIn = okA && okB ? (lowA ? (rng.chance(0.75) ? 'A' : 'B') : (rng.chance(0.75) ? 'B' : 'A')) : okA ? 'A' : okB ? 'B' : null;
      c.n = n;
      if (!c.flightIn) c.mode = 'skip';
    }
  }
  // exits + reserved areas inside rooms. Plain exits reserve first; flights then
  // look for a position (or the other room) whose stair run does not collide
  // with another exit's area - overlapping flights would overwrite each other.
  const resCells = (c, side, pos, depthRes) => {
    const r = c[side];
    const into = side === 'A' ? -1 : 1;
    const firstIn = (side === 'A' ? c.line - 1 : c.line) + into;
    const cells = [];
    for (let k = -1; k <= c.width; k++) for (let d = 0; d < depthRes; d++) {
      const a = firstIn + into * d, b = pos + k;
      const x = c.axis === 'x' ? a : b, z = c.axis === 'x' ? b : a;
      if (x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h) cells.push(g.idx(x, z));
    }
    return cells;
  };
  const addExit = (c, side, depthRes, flightHere) => {
    const r = c[side];
    for (const i of resCells(c, side, c.pos, depthRes)) r.reserved.add(i);
    const into = side === 'A' ? -1 : 1;
    r.exits.push({ conn: c, side, firstIn: (side === 'A' ? c.line - 1 : c.line) + into, into, flight: flightHere });
  };
  for (const c of conns) {
    if (c.mode === 'skip' || c.mode === 'flight') continue;
    addExit(c, 'A', 3, false); addExit(c, 'B', 3, false);
  }
  for (const c of conns) {
    if (c.mode !== 'flight') continue;
    const sides = [c.flightIn, c.flightIn === 'A' ? 'B' : 'A'];
    let placed = false;
    for (const side of sides) {
      const r = c[side];
      if ((c.axis === 'x' ? r.w : r.h) < c.n + 4) continue;
      const positions = [c.pos];
      for (let p = c.a0; p <= c.a1 - c.width; p++) if (p !== c.pos) positions.push(p);
      for (const pos of positions) {
        const other = side === 'A' ? 'B' : 'A';
        const clash = resCells(c, side, pos, c.n + 3).some((i) => c[side].reserved.has(i)) || resCells(c, other, pos, 3).some((i) => c[other].reserved.has(i));
        if (clash) continue;
        c.pos = pos; c.flightIn = side; placed = true; break;
      }
      if (placed) break;
    }
    if (!placed) {
      // loops can go; required links fall back to a steep stair inside the doorway
      if (c.loop) { c.mode = 'skip'; continue; }
      c.mode = 'passage';
      addExit(c, 'A', 3, false); addExit(c, 'B', 3, false);
      continue;
    }
    addExit(c, 'A', c.flightIn === 'A' ? c.n + 3 : 3, c.flightIn === 'A');
    addExit(c, 'B', c.flightIn === 'B' ? c.n + 3 : 3, c.flightIn === 'B');
  }

  // ---- carve rooms (base box) then apply templates
  const roomCells = new Map();
  for (const r of rooms) {
    r.light = clamp(baseLight + rng.float(-lightVar, lightVar), 0.2, 1.15);
    r.ceilH = { hall: rng.pick([6, 7, 8]), atrium: rng.pick([9, 10, 12]), pitroom: rng.pick([6, 7, 8]), split: rng.pick([6, 7]), industrial: rng.pick([7, 8, 9]),
      storage: rng.pick([4, 5, 6]), control: rng.pick([4, 4.5, 5]), courtyard: 12, chapel: rng.pick([8, 9, 11]), reactor: rng.pick([9, 11, 13]), pools: rng.pick([4.5, 5, 6]),
      arena: rng.pick([9, 10, 12]), entry: rng.pick([4, 5]), plain: 4 }[r.template] || (opt.ceilH?.[r.template] ? rng.pick(opt.ceilH[r.template]) : 4);
    r.sky = r.template === 'courtyard' || !!opt.skyTemplates?.includes(r.template);
    r.wallSlot = r === boss ? TS.ACCENT : rng.chance(0.35) ? TS.WALL2 : TS.WALL;
    r.floorSlot = rng.chance(0.3) ? TS.FLOOR2 : TS.FLOOR;
    r.ceilSlot = r.ceilH >= 6 ? TS.CEIL2 : TS.CEIL;
    if (r.template === 'courtyard') { r.floorSlot = TS.GROUND; r.wallSlot = TS.WALL2; }
    if (r.template === 'chapel' && style.family !== 'tech') r.floorSlot = TS.FLOOR3;
    const cells = [];
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
      g.open(x, z, r.floor, r.floor + r.ceilH, { sky: r.sky, light: r.sky ? Math.max(r.light, 0.85) : r.light, floorTex: r.floorSlot, ceilTex: r.ceilSlot, wallTex: TS.SIDE, region: r.id, flags: r.sky ? F.OUTDOOR : 0 });
      cells.push(g.idx(x, z));
    }
    roomCells.set(r.id, cells);
    // surrounding wall cells take the room's wall texture and a sensible top
    for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (!g.in(x, z)) continue;
      const i = g.idx(x, z);
      if (g.type[i]) continue;
      g.wallTex[i] = r.wallSlot;
      g.floor[i] = Math.max(g.floor[i] === g.wallTop ? -99 : g.floor[i], r.floor + (r.sky ? rng.pick([7, 9, 11]) : r.ceilH + 1));
    }
  }
  for (const r of rooms) {
    const ctx = { g, deco, rng, theme, style, room: r, cells: roomCells.get(r.id), depth, boss: r === boss };
    const m = deco.mark();
    const snap = snapRoom(g, r);
    try {
      TEMPLATES[r.template](ctx);
    } catch (err) {
      deco.rollback(m); restoreRoom(g, r, snap);
      if (typeof console !== 'undefined') console.warn('template failed', r.template, err);
    }
  }

  // ---- carve connections (after templates so passages stay intact)
  for (const c of conns) {
    if (c.mode === 'skip') continue;
    carveConnection(c);
  }

  // ---- per-room connectivity check; fall back to a plain room if a template broke it
  for (const r of rooms) {
    if (!roomConnected(r)) {
      clearRoomDeco(r);
      for (const i of roomCells.get(r.id)) {
        const x = i % W, z = (i / W) | 0;
        if (r.reserved.has(i) && (g.flags[i] & F.STAIR)) continue;
        g.open(x, z, r.floor, r.floor + r.ceilH, { sky: r.sky, light: r.light, floorTex: r.floorSlot, ceilTex: r.ceilSlot, wallTex: TS.SIDE, region: r.id });
        g.flags[i] &= ~(F.PIT | F.HAZARD | F.BRIDGE | F.OBSTACLE | F.NOSPAWN);
        g.hazType[i] = 0;
        g.clearEdges(x, z);
      }
      r.template = 'plain';
      for (const c of conns) if (c.mode === 'flight' && c[c.flightIn] === r) buildFlight(c);
    }
  }

  // ---- finishing detail on every room
  for (const r of rooms) finishRoom(r);
  encloseBorder(g);

  const arena = roomCells.get(boss.id).filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.VOID)));
  for (const i of arena) g.flags[i] |= F.ARENA;
  const sx = Math.floor(start.x + start.w / 2), sz = Math.floor(start.z + start.h / 2);
  return {
    grid: g, rooms, deco, conns, start: { x: sx, z: sz }, arenaCells: arena, noFortify: true,
    boss: { x: boss.x + boss.w / 2, z: boss.z + boss.h / 2 },
  };

  // ================================================================ helpers
  function graphDist(from) {
    const d = rooms.map(() => -1); d[from] = 0;
    const q = [from];
    for (let k = 0; k < q.length; k++) for (const e of nbrs[q[k]]) { const o = e.i === q[k] ? e.j : e.i; if (d[o] < 0) { d[o] = d[q[k]] + 1; q.push(o); } }
    return d;
  }
  function snapRoom(gg, r) {
    const s = [];
    for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (!gg.in(x, z)) continue;
      const i = gg.idx(x, z);
      s.push([i, gg.type[i], gg.floor[i], gg.ceil[i], gg.sky[i], gg.flags[i], gg.hazType[i], gg.stairDir[i], gg.rise[i], gg.edge[i], gg.floorTex[i], gg.wallTex[i], gg.ceilTex[i]]);
    }
    return s;
  }
  function restoreRoom(gg, r, s) {
    for (const [i, t, f, c, sk, fl, hz, sd, rs, ed, ft, wt, ct] of s) {
      gg.type[i] = t; gg.floor[i] = f; gg.ceil[i] = c; gg.sky[i] = sk; gg.flags[i] = fl; gg.hazType[i] = hz; gg.stairDir[i] = sd; gg.rise[i] = rs; gg.edge[i] = ed;
      gg.floorTex[i] = ft; gg.wallTex[i] = wt; gg.ceilTex[i] = ct;
    }
  }
  function clearRoomDeco(r) {
    const inR = (b) => b.x0 >= r.x - 0.2 && b.x1 <= r.x + r.w + 0.2 && b.z0 >= r.z - 0.2 && b.z1 <= r.z + r.h + 0.2;
    deco.boxes = deco.boxes.filter((b) => !inR(b));
    deco.colliders = deco.colliders.filter((b) => !inR(b));
    deco.bars = deco.bars.filter((b) => !(b.a[0] >= r.x && b.a[0] <= r.x + r.w && b.a[2] >= r.z && b.a[2] <= r.z + r.h));
    deco.lights = deco.lights.filter((l) => !(l.x >= r.x && l.x <= r.x + r.w && l.z >= r.z && l.z <= r.z + r.h));
  }

  function cellOf(c, a, b) { return c.axis === 'x' ? [a, b] : [b, a]; }

  function carveConnection(c) {
    const wallA = c.line - 1, wallB = c.line;
    const yA = c.A.floor, yB = c.B.floor;
    // heights of the two passage cells
    let hA, hB;
    if (c.mode === 'flat') { hA = hB = yA; }
    else if (c.mode === 'passage') { hA = yA + c.dh * 0.5; hB = yB; }
    else { // flight: the passage sits at the far room's height
      hA = hB = c.flightIn === 'A' ? yB : yA;
    }
    const ceilTop = Math.min(c.A.floor + c.A.ceilH, c.B.floor + c.B.ceilH);
    const passH = c.door ? 3.0 : Math.min(rng.pick([3.5, 4, 4.5]), Math.max(3, ceilTop - Math.max(hA, hB)));
    for (let k = 0; k < c.width; k++) {
      const b = c.pos + k;
      for (const [a, h, roomSide] of [[wallA, hA, c.A], [wallB, hB, c.B]]) {
        const [x, z] = cellOf(c, a, b);
        g.open(x, z, h, Math.max(h, hA, hB) + passH, { light: Math.min(c.A.light, c.B.light) * 0.9, floorTex: c.door ? TS.FLOOR2 : roomSide.floorSlot, ceilTex: TS.CEIL, wallTex: TS.SIDE, region: -2 });
        g.flags[g.idx(x, z)] |= F.NOSPAWN;
      }
      if (c.mode === 'passage') {
        // two stair cells climbing from A to B (or down)
        const up = c.dh > 0 ? (c.axis === 'x' ? 0 : 2) : (c.axis === 'x' ? 1 : 3);
        const r1 = Math.abs(c.dh) / 2;
        const [x1, z1] = cellOf(c, wallA, b), [x2, z2] = cellOf(c, wallB, b);
        if (c.dh > 0) { g.setStair(x1, z1, up, yA + r1, r1); g.setStair(x2, z2, up, yB, r1); }
        else { g.setStair(x1, z1, up, yA, r1); g.setStair(x2, z2, up, yA - r1, r1); }
        g.floorTex[g.idx(x1, z1)] = TS.STAIR; g.floorTex[g.idx(x2, z2)] = TS.STAIR;
        g.wallTex[g.idx(x1, z1)] = TS.TRIM; g.wallTex[g.idx(x2, z2)] = TS.TRIM;
      }
    }
    // frame the opening: jambs take the trim texture, lintel trim boxes on both faces
    for (const [a, room] of [[wallA, c.A], [wallB, c.B]]) {
      for (const b of [c.pos - 1, c.pos + c.width]) {
        const [x, z] = cellOf(c, a, b);
        if (g.in(x, z) && !g.type[g.idx(x, z)]) g.wallTex[g.idx(x, z)] = c.door ? TS.TRIM : TS.PILLAR;
      }
    }
    const top = Math.max(hA, hB) + passH;
    for (const [faceLine, sideSign] of [[c.line - 1, -1], [c.line + 1, 1]]) {
      // trim band over the opening on each room face
      const a0 = c.pos - 0.15, a1 = c.pos + c.width + 0.15;
      const fl = sideSign < 0 ? faceLine : faceLine;
      if (c.axis === 'x') deco.box(fl - (sideSign < 0 ? 0.08 : 0), top - 0.25, a0, fl + (sideSign > 0 ? 0.08 : 0), top, a1, TS.TRIM, { faces: sideSign < 0 ? 2 | 16 | 32 : 1 | 16 | 32 });
      else deco.box(a0, top - 0.25, fl - (sideSign < 0 ? 0.08 : 0), a1, top, fl + (sideSign > 0 ? 0.08 : 0), TS.TRIM, { faces: sideSign < 0 ? 8 | 16 | 32 : 4 | 16 | 32 });
    }
    if (c.mode === 'flight') buildFlight(c);
  }

  // stairs inside a room leading up/down to a passage at the other room's height
  function buildFlight(c) {
    const side = c.flightIn, r = c[side];
    const other = side === 'A' ? c.B : c.A;
    const into = side === 'A' ? -1 : 1;
    const wallCell = side === 'A' ? c.line - 1 : c.line;
    const firstIn = wallCell + into;
    // the flight runs from deep in the room (at r.floor) toward the wall (at other.floor)
    const n = c.n;
    const startA = firstIn + into * (n - 1);         // lowest/first row (farthest from the wall)
    const dirToWall = c.axis === 'x' ? (into < 0 ? 0 : 1) : (into < 0 ? 2 : 3);
    const [sx, sz] = cellOf(c, startA, c.pos);
    const cells = deco.stairs(sx, sz, dirToWall, c.width, r.floor, other.floor, { rise: Math.abs(other.floor - r.floor) / n, light: r.light, region: r.id, style: style.railStyle, ceil: r.floor + r.ceilH });
    for (const i of cells) { if (!r.sky) g.ceil[i] = Math.max(g.ceil[i], r.floor + r.ceilH); g.region[i] = r.id; }
    // if the flight goes DOWN into this room from a higher passage, the rows are already correct;
    // make sure the landing in front of the passage matches the passage height
    // rails along drop sides of the flight are added by deco.stairs()
  }

  function roomConnected(r) {
    const cells = roomCells.get(r.id);
    const set = new Set(cells);
    const ex = [];
    for (const e of r.exits) {
      const c = e.conn;
      for (let k = 0; k < c.width; k++) {
        const [x, z] = cellOf(c, e.firstIn, c.pos + k);
        if (g.in(x, z)) ex.push(g.idx(x, z));
      }
    }
    if (ex.length < 1) return true;
    const dist = g.bfs([ex[0]], { blocked: (b) => !set.has(b), avoid: F.OBSTACLE });
    for (const i of ex) if (dist[i] < 0) return false;
    // most of the walkable floor must be reachable
    let walk = 0, reach = 0;
    for (const i of cells) {
      if (!g.type[i] || (g.flags[i] & (F.PIT | F.VOID | F.OBSTACLE | F.HAZARD))) continue;
      walk++; if (dist[i] >= 0) reach++;
    }
    return reach >= walk * 0.8;
  }

  function finishRoom(r) {
    const cells = roomCells.get(r.id).filter((i) => g.type[i]);
    // trims everywhere (baseboards, wainscot in some styles, crown on tall walls)
    deco.wallTrims(cells, { wainscot: r.template === 'industrial' || r.template === 'storage' ? 0 : style.wain, crown: style.crown && !r.sky });
    // lighting if the template did not add fixtures
    if (!r.lit) addLights(r);
  }

  function addLights(r) {
    const y = r.floor + r.ceilH;
    if (r.sky) return;
    if (style.lights === 'panel' || style.lights === 'hanging') {
      const step = r.ceilH >= 7 ? 5 : 4;
      for (let z = r.z + 2; z < r.z + r.h - 1; z += step) for (let x = r.x + 2; x < r.x + r.w - 1; x += step) {
        const i = g.idx(x, z);
        if (!g.type[i] || g.sky[i] || (g.flags[i] & (F.PIT | F.VOID))) continue;
        const cy = g.ceil[i];
        if (style.lights === 'hanging' && cy - g.floor[i] > 5) {
          // chain + lamp shade
          deco.box(x + 0.47, cy - 1.6, z + 0.47, x + 0.53, cy, z + 0.53, TS.METAL, { faces: 15 });
          deco.box(x + 0.2, cy - 1.85, z + 0.2, x + 0.8, cy - 1.6, z + 0.8, TS.METAL);
          deco.box(x + 0.26, cy - 1.9, z + 0.26, x + 0.74, cy - 1.85, z + 0.74, TS.LIGHT, { uv: 'fit', emissive: 1 });
          deco.light(x + 0.5, cy - 2.2, z + 0.5, [1, 0.85, 0.6], 7);
        } else {
          deco.lightPanel(x + 0.15, z + 0.3, x + 0.85, z + 0.7, cy, [0.95, 0.97, 1], 6.5);
        }
      }
    } else {
      // wall-mounted torches / sconces
      const color = style.lights === 'torch' ? [1, 0.6, 0.25] : [1, 0.85, 0.6];
      for (let x = r.x + 2; x < r.x + r.w - 1; x += 4) {
        for (const [z, d] of [[r.z, 3], [r.z + r.h - 1, 2]]) {
          const i = g.idx(x, z);
          if (!g.type[i] || r.reserved.has(i) || (g.flags[i] & (F.STAIR | F.PIT))) continue;
          const nb = g.idx(x + DIR_X[d], z + DIR_Z[d]);
          if (g.type[nb]) continue;
          deco.wallLight(x, z, d, g.floor[i] + 2.1, color, { flicker: style.lights === 'torch', radius: 5.5 });
        }
      }
    }
    r.lit = true;
  }
}

// ======================================================================
// Room templates. ctx: {g, deco, rng, theme, style, room, cells, depth, boss}
// Templates must keep room.reserved cells flat at room.floor and walkable.
// ======================================================================
function inRoom(r, x, z) { return x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h; }
// rect must lie inside the room; it and its margin ring must avoid reserved exit areas
function freeRect(ctx, x0, z0, w, h, margin = 0) {
  const { g, room: r } = ctx;
  for (let z = z0 - margin; z < z0 + h + margin; z++) for (let x = x0 - margin; x < x0 + w + margin; x++) {
    const core = x >= x0 && x < x0 + w && z >= z0 && z < z0 + h;
    if (!inRoom(r, x, z)) { if (core) return false; continue; }
    if (r.reserved.has(g.idx(x, z))) return false;
  }
  return true;
}
function eachCell(ctx, x0, z0, w, h, fn) {
  const { g } = ctx;
  for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) if (g.in(x, z)) fn(x, z, g.idx(x, z));
}
function pickHaz(ctx) { return ctx.rng.pick(ctx.style.hazards); }
// sunk a rectangle into a hazard pit (deep) or pool (shallow)
function makePit(ctx, x0, z0, w, h, kind, depth) {
  const { g, room: r } = ctx;
  const haz = HAZ_OF[kind];
  const deep = depth > 1.0;
  eachCell(ctx, x0, z0, w, h, (x, z, i) => {
    if (r.reserved.has(i)) return;
    g.open(x, z, r.floor - depth, g.ceil[i], { sky: !!g.sky[i], light: Math.max(g.light[i], kind === 'lava' || kind === 'poison' ? 0.9 : g.light[i]), floorTex: kind === 'spikes' ? TS.PITWALL : HAZ_TEX[kind], wallTex: TS.PITWALL, region: r.id, haz });
    g.flags[i] |= F.NOSPAWN | (kind === 'water' && !deep ? F.WATER : F.HAZARD) | (deep ? F.PIT : 0);
    if (kind === 'water' && !deep) g.flags[i] &= ~F.HAZARD;
  });
  // rim cells draw the pit walls with the pit-wall texture
  eachCell(ctx, x0 - 1, z0 - 1, w + 2, h + 2, (x, z, i) => {
    if (g.type[i] && !(g.flags[i] & F.PIT) && g.hazType[i] === 0 && !(g.flags[i] & F.STAIR)) g.wallTex[i] = TS.PITWALL;
  });
  const lc = LIGHT_COL[kind];
  if (kind === 'lava' || kind === 'poison') {
    for (let z = z0 + 1; z < z0 + h; z += 4) for (let x = x0 + 1; x < x0 + w; x += 4) ctx.deco.light(x + 0.5, r.floor - depth + 0.8, z + 0.5, lc, 6, { pulse: true });
  }
}
function bridge(ctx, x0, z0, x1, z1, y, width = 1) {
  const { g, deco, room: r } = ctx;
  const cells = [];
  const horiz = z0 === z1;
  for (let k = 0; k < width; k++) {
    for (let t = horiz ? Math.min(x0, x1) : Math.min(z0, z1); t <= (horiz ? Math.max(x0, x1) : Math.max(z0, z1)); t++) {
      const x = horiz ? t : x0 + k, z = horiz ? z0 + k : t;
      if (!inRoom(r, x, z)) continue;
      const i = g.idx(x, z);
      if (!(g.flags[i] & (F.PIT | F.HAZARD | F.WATER))) continue;
      g.open(x, z, y, g.ceil[i], { sky: !!g.sky[i], floorTex: TS.GRATE, wallTex: TS.GRATE, light: g.light[i], region: r.id });
      g.flags[i] &= ~(F.PIT | F.HAZARD | F.WATER);
      g.flags[i] |= F.BRIDGE | F.NOSPAWN;
      g.hazType[i] = 0;
      cells.push(i);
    }
  }
  // support beams under long bridges
  if (cells.length > 4) {
    for (let k = 2; k < cells.length - 1; k += 4) {
      const i = cells[k], x = i % g.w, z = (i / g.w) | 0;
      if (horiz) deco.box(x + 0.4, y - 3.5, z, x + 0.6, y - 0.35, z + width, TS.BEAM);
      else deco.box(x, y - 3.5, z + 0.4, x + width, y - 0.35, z + 0.6, TS.BEAM);
    }
  }
  return cells;
}

const TEMPLATES = {
  plain(ctx) { scatterProps(ctx, 0.5); },
  entry(ctx) {
    const { room: r, deco, g } = ctx;
    // a few crates + a console by the walls, the middle stays clear for the start
    scatterProps(ctx, 0.6);
    if (ctx.style.family === 'tech' || ctx.style.family === 'military' || ctx.style.family === 'lab') wallConsoles(ctx, 2);
  },

  hall(ctx) {
    const { g, deco, rng, room: r, style } = ctx;
    const alongX = r.w >= r.h;
    const L = alongX ? r.w : r.h, Wd = alongX ? r.h : r.w;
    const inset = Wd >= 12 ? 3 : 2;
    const step = rng.pick([3, 4]);
    const top = r.floor + r.ceilH;
    // colonnade
    for (let t = 2; t < L - 2; t += step) {
      for (const s of [inset, Wd - 1 - inset]) {
        const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
        if (!freeRect(ctx, x, z, 1, 1)) continue;
        if (style.pillars === 'girder') deco.pillar(x + 0.5, z + 0.5, 0.5, r.floor, top, { tex: TS.BEAM, trim: false });
        else deco.pillar(x + 0.5, z + 0.5, style.pillars === 'column' ? 0.7 : 0.6, r.floor, top);
      }
      // ceiling beam spanning the hall at each pillar row
      if (r.ceilH >= 6) {
        if (alongX) deco.beam(r.x + t + 0.5, r.z, r.x + t + 0.5, r.z + r.h, top - 0.55, 0.4, 0.55);
        else deco.beam(r.x, r.z + t + 0.5, r.x + r.w, r.z + t + 0.5, top - 0.55, 0.4, 0.55);
      }
    }
    // central runner / feature floor
    const runW = Math.max(1, Wd - 2 * inset - 3);
    const s0 = Math.floor((Wd - runW) / 2);
    for (let t = 1; t < L - 1; t++) for (let s = s0; s < s0 + runW; s++) {
      const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
      const i = g.idx(x, z);
      if (g.type[i] && !(g.flags[i] & F.STAIR)) g.floorTex[i] = style.family === 'gothic' || style.family === 'domestic' ? TS.CARPET : TS.FLOOR3;
    }
    // raised side aisles for wide halls
    if (Wd >= 13 && rng.chance(0.5)) {
      const up = 0.6;
      for (const s0a of [0, Wd - inset + 0]) {
        for (let t = 0; t < L; t++) for (let s = s0a; s < s0a + inset - 1; s++) {
          const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
          const i = g.idx(x, z);
          if (!g.type[i] || r.reserved.has(i)) continue;
          // keep cells next to reserved exits at floor level
          let nearRes = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (r.reserved.has(g.idx(x + dx, z + dz))) nearRes = true;
          if (nearRes) continue;
          g.floor[i] = r.floor + up * 0.5; // a low platform (one step), still walkable
          g.wallTex[i] = TS.TRIM;
        }
      }
    }
    ctx.room.lit = false;
    // end feature: dais with steps at the far end
    const dz = rng.chance(0.5);
    const daisT = dz ? L - 3 : 1;
    if (Wd >= 9 && L >= 12) {
      const dw = Math.min(5, Wd - 2 * inset - 2);
      const ds = Math.floor((Wd - dw) / 2);
      const x0 = alongX ? r.x + daisT : r.x + ds, z0 = alongX ? r.z + ds : r.z + daisT;
      const w = alongX ? 2 : dw, h = alongX ? dw : 2;
      if (freeRect(ctx, x0, z0, w, h, 1)) {
        eachCell(ctx, x0, z0, w, h, (x, z, i) => { g.floor[i] = r.floor + 0.5; g.floorTex[i] = TS.FLOOR3; g.wallTex[i] = TS.TRIM; });
        const cx = x0 + w / 2, cz = z0 + h / 2;
        if (style.family === 'tech' || style.family === 'military' || style.family === 'lab') deco.console(Math.floor(cx), Math.floor(cz), r.floor + 0.5, alongX ? (dz ? 1 : 0) : (dz ? 3 : 2));
        else deco.box(cx - 0.6, r.floor + 0.5, cz - 0.4, cx + 0.6, r.floor + 1.5, cz + 0.4, { side: TS.TRIM, top: TS.FLOOR3 }, { solid: true });
      }
    }
  },

  atrium(ctx) {
    const { g, deco, rng, room: r } = ctx;
    const up = rng.pick([3, 3.6, 4.2]);
    const depthB = rng.pick([2, 3]);
    // balconies on sides without reserved exit areas
    const sides = [
      { d: 3, rect: [r.x, r.z, r.w, depthB] }, { d: 2, rect: [r.x, r.z + r.h - depthB, r.w, depthB] },
      { d: 1, rect: [r.x, r.z, depthB, r.h] }, { d: 0, rect: [r.x + r.w - depthB, r.z, depthB, r.h] },
    ];
    rng.shuffle(sides);
    let made = 0;
    const balc = new Set();
    for (const s of sides) {
      if (made >= 2) break;
      const [x0, z0, w, h] = s.rect;
      if (!freeRect(ctx, x0, z0, w, h, 1)) continue;
      // overlap with an existing balcony corner is fine
      eachCell(ctx, x0, z0, w, h, (x, z, i) => { g.floor[i] = r.floor + up; g.wallTex[i] = TS.SIDE; g.floorTex[i] = TS.GRATE; balc.add(i); });
      // stairs from the ground up to this balcony, along the balcony edge
      const n = Math.ceil(up / 0.6 - 1e-6);
      const alongX = s.d >= 2;
      const len = alongX ? w : h;
      if (len < n + 3) { // too short: undo
        eachCell(ctx, x0, z0, w, h, (x, z, i) => { g.floor[i] = r.floor; g.floorTex[i] = r.floorSlot; g.wallTex[i] = TS.SIDE; balc.delete(i); });
        continue;
      }
      // the flight sits just in front of the balcony, climbing along it toward one end
      const fromStart = rng.chance(0.5);
      let fx, fz, dir;
      if (alongX) {
        fz = s.d === 3 ? z0 + h : z0 - 2;   // two-wide flight in front of the balcony
        fx = fromStart ? x0 + 1 : x0 + w - 2;
        dir = fromStart ? 0 : 1;
        // flight cells: from (fx,fz) climbing +-x for n cells; landing is the next cell, which must join the balcony
        const lx = fromStart ? fx + n : fx - n;
        if (!freeRect(ctx, Math.min(fx, lx), fz, n + 1, 2)) { undo(); continue; }
        const cells = deco.stairs(fx, fz, dir, 2, r.floor, r.floor + up, { rise: up / n, light: r.light, region: r.id });
        // landing joins the balcony
        for (let k = 0; k < 2; k++) { const i = g.idx(lx, fz + k); g.floor[i] = r.floor + up; g.floorTex[i] = TS.GRATE; g.wallTex[i] = TS.SIDE; balc.add(i); }
        cells.forEach((i) => g.flags[i] |= F.NOSPAWN);
      } else {
        fx = s.d === 1 ? x0 + w : x0 - 2;
        fz = fromStart ? z0 + 1 : z0 + h - 2;
        dir = fromStart ? 2 : 3;
        const lz = fromStart ? fz + n : fz - n;
        if (!freeRect(ctx, fx, Math.min(fz, lz), 2, n + 1)) { undo(); continue; }
        const cells = deco.stairs(fx, fz, dir, 2, r.floor, r.floor + up, { rise: up / n, light: r.light, region: r.id });
        for (let k = 0; k < 2; k++) { const i = g.idx(fx + k, lz); g.floor[i] = r.floor + up; g.floorTex[i] = TS.GRATE; g.wallTex[i] = TS.SIDE; balc.add(i); }
        cells.forEach((i) => g.flags[i] |= F.NOSPAWN);
      }
      made++;
      function undo() { eachCell(ctx, x0, z0, w, h, (x, z, i) => { g.floor[i] = r.floor; g.floorTex[i] = r.floorSlot; g.wallTex[i] = TS.SIDE; balc.delete(i); }); }
    }
    if (balc.size) deco.railEdges(balc, { style: ctx.style.railStyle });
    // support pillars under balcony edges are implied (solid platform); add a skylight or chandelier
    const top = r.floor + r.ceilH;
    const cx = r.x + r.w / 2, cz = r.z + r.h / 2;
    if (ctx.style.outdoor > 0 && rng.chance(0.5)) {
      eachCell(ctx, Math.floor(cx) - 2, Math.floor(cz) - 2, 4, 4, (x, z, i) => { if (!balc.has(i)) { g.sky[i] = 1; g.ceil[i] = 64; g.light[i] = Math.max(g.light[i], 0.95); } });
    } else {
      deco.box(cx - 1.2, top - 0.3, cz - 1.2, cx + 1.2, top - 0.15, cz + 1.2, TS.METAL);
      deco.box(cx - 1.0, top - 0.42, cz - 1.0, cx + 1.0, top - 0.3, cz + 1.0, TS.LIGHT, { uv: 'fit', emissive: 1 });
      deco.light(cx, top - 1.5, cz, [1, 0.95, 0.85], 10);
    }
    // planters / benches on the ground floor
    scatterProps(ctx, 0.4);
  },

  pitroom(ctx) {
    const { g, deco, rng, room: r } = ctx;
    const ring = rng.pick([2, 3]);
    const x0 = r.x + ring, z0 = r.z + ring, w = r.w - 2 * ring, h = r.h - 2 * ring;
    if (w < 4 || h < 4) return TEMPLATES.storage(ctx);
    // reserved exit areas stay as railed landings jutting into the pit
    const kind = pickHaz(ctx);
    const depth = kind === 'water' ? 2.5 : rng.pick([2.5, 3, 4]);
    makePit(ctx, x0, z0, w, h, kind, depth);
    // bridges across (1-2), keep at room floor height
    const pit = new Set();
    eachCell(ctx, x0, z0, w, h, (x, z, i) => { if (g.flags[i] & F.PIT) pit.add(i); });
    const nB = rng.chance(0.6) ? 2 : 1;
    const bridgeCells = [];
    if (w >= h || nB === 2) {
      const bz = z0 + rng.int(1, Math.max(1, h - 2));
      bridgeCells.push(...bridge(ctx, x0, bz, x0 + w - 1, bz, r.floor, rng.chance(0.4) && h > 5 ? 2 : 1));
    }
    if (h > w || nB === 2) {
      const bx = x0 + rng.int(1, Math.max(1, w - 2));
      bridgeCells.push(...bridge(ctx, bx, z0, bx, z0 + h - 1, r.floor, 1));
    }
    // a central platform where bridges cross
    if (nB === 2 && w >= 7 && h >= 7) {
      const cx = x0 + Math.floor(w / 2) - 1, cz = z0 + Math.floor(h / 2) - 1;
      eachCell(ctx, cx, cz, 3, 3, (x, z, i) => {
        g.open(x, z, r.floor, g.ceil[i], { floorTex: TS.FLOOR3, wallTex: TS.PITWALL, light: g.light[i], region: r.id });
        g.flags[i] &= ~(F.PIT | F.HAZARD); g.hazType[i] = 0; g.flags[i] |= F.NOSPAWN;
        bridgeCells.push(i);
      });
      deco.pillar(cx + 1.5, cz + 1.5, 0.5, r.floor, r.floor + r.ceilH, { tex: TS.PILLAR });
    }
    // rails: walkway ring edge and bridge sides
    const walk = ctx.cells.filter((i) => !pit.has(i) || bridgeCells.includes(i));
    deco.railEdges(walk, { style: ctx.style.railStyle });
    r.lit = false;
  },

  pools(ctx) {
    const { g, rng, room: r } = ctx;
    const kind = rng.pick([...ctx.style.hazards.filter((k) => k !== 'spikes'), 'water']);
    const n = rng.int(2, 4);
    for (let k = 0; k < n; k++) {
      const w = rng.int(2, 4), h = rng.int(2, 4);
      const x = rng.int(r.x + 1, r.x + r.w - w - 1), z = rng.int(r.z + 1, r.z + r.h - h - 1);
      if (!freeRect(ctx, x, z, w, h, 1)) continue;
      makePit(ctx, x, z, w, h, kind, 0.35);
    }
    scatterProps(ctx, 0.4);
  },

  split(ctx) {
    const { g, deco, rng, room: r } = ctx;
    const up = rng.pick([1.8, 2.4, 3.0]);
    const n = Math.ceil(up / 0.6 - 1e-6);
    // try the four sides (long-axis splits first) for an upper level free of exits
    const opts = [];
    for (const alongXo of r.w >= r.h ? [true, false] : [false, true]) {
      for (const frac of [0.5, 0.4, 0.33]) {
        const half = Math.max(3, Math.floor((alongXo ? r.h : r.w) * frac));
        for (const upperFirstO of rng.shuffle([true, false])) {
          const ux0 = alongXo ? r.x : (upperFirstO ? r.x : r.x + r.w - half);
          const uz0 = alongXo ? (upperFirstO ? r.z : r.z + r.h - half) : r.z;
          const uw0 = alongXo ? r.w : half, uh0 = alongXo ? half : r.h;
          if ((alongXo ? r.h : r.w) - half >= n + 3 && freeRect(ctx, ux0, uz0, uw0, uh0)) opts.push({ alongXo, upperFirstO, ux0, uz0, uw0, uh0 });
        }
      }
    }
    if (!opts.length) return TEMPLATES.storage(ctx);
    const o = opts[0];
    const alongX = o.alongXo, upperFirst = o.upperFirstO, ux = o.ux0, uz = o.uz0, uw = o.uw0, uh = o.uh0;
    const upper = new Set();
    eachCell(ctx, ux, uz, uw, uh, (x, z, i) => { g.floor[i] = r.floor + up; g.wallTex[i] = TS.SIDE; upper.add(i); });
    // two flights from the lower half up to the ledge
    const flights = rng.chance(0.5) ? 2 : 1;
    const L = alongX ? r.w : r.h;
    const spots = flights === 2 ? [Math.floor(L * 0.2), Math.floor(L * 0.7)] : [Math.floor(L / 2) - 1];
    for (const t of spots) {
      if (alongX) {
        const sx = r.x + t, dir = upperFirst ? 3 : 2;
        const sz = upperFirst ? uz + uh + n - 1 : uz - n;
        if (!freeRect(ctx, sx, Math.min(sz, sz + (dir === 3 ? -(n - 1) : n - 1)), 2, n)) continue;
        deco.stairs(sx, sz, dir, 2, r.floor, r.floor + up, { rise: up / n, light: r.light, region: r.id });
      } else {
        const sz = r.z + t, dir = upperFirst ? 1 : 0;
        const sx = upperFirst ? ux + uw + n - 1 : ux - n;
        if (!freeRect(ctx, Math.min(sx, sx + (dir === 1 ? -(n - 1) : n - 1)), sz, n, 2)) continue;
        deco.stairs(sx, sz, dir, 2, r.floor, r.floor + up, { rise: up / n, light: r.light, region: r.id });
      }
    }
    deco.railEdges(upper, { style: ctx.style.railStyle });
    // detail: pillars along the ledge face, crates up top, consoles below
    for (let t = 2; t < L - 2; t += 4) {
      const x = alongX ? r.x + t : (upperFirst ? ux + uw : ux - 1);
      const z = alongX ? (upperFirst ? uz + uh : uz - 1) : r.z + t;
      const i = g.idx(x, z);
      if (g.type[i] && !(g.flags[i] & F.STAIR) && !r.reserved.has(i) && freeRect(ctx, x, z, 1, 1)) {
        const px = alongX ? x + 0.5 : (upperFirst ? x + 0.25 : x + 0.75), pz = alongX ? (upperFirst ? z + 0.25 : z + 0.75) : z + 0.5;
        deco.pillar(px, pz, 0.45, r.floor, r.floor + r.ceilH, { trim: true });
      }
    }
    scatterProps(ctx, 0.5);
  },

  industrial(ctx) {
    const { g, deco, rng, room: r } = ctx;
    // a sunken hazard floor crossed by a grid of catwalks at room height
    const kind = rng.pick(ctx.style.hazards.filter((k) => k !== 'spikes').concat(['poison']));
    const ring = 2;
    const x0 = r.x + ring, z0 = r.z + ring, w = r.w - 2 * ring, h = r.h - 2 * ring;
    if (w < 5 || h < 5) return TEMPLATES.storage(ctx);
    makePit(ctx, x0, z0, w, h, kind, rng.pick([2.5, 3.5]));
    const walk = new Set(ctx.cells.filter((i) => !(g.flags[i] & F.PIT)));
    const sp = rng.pick([3, 4]);
    for (let z = z0 + 1; z < z0 + h - 1; z += sp) for (const i of bridge(ctx, x0, z, x0 + w - 1, z, r.floor, 1)) walk.add(i);
    for (let x = x0 + 1; x < x0 + w - 1; x += sp + 1) for (const i of bridge(ctx, x, z0, x, z0 + h - 1, r.floor, 1)) walk.add(i);
    deco.railEdges(walk, { style: 'metal' });
    // machinery along the walls, pipes high up, beams overhead
    wallConsoles(ctx, 3, true);
    const top = r.floor + r.ceilH;
    for (const z of [r.z + 0.2, r.z + r.h - 0.2]) deco.pipe(r.x, z, r.x + r.w, z, top - 1.2, 0.3);
    for (let x = r.x + 2; x < r.x + r.w - 1; x += 4) deco.beam(x + 0.5, r.z, x + 0.5, r.z + r.h, top - 0.6, 0.35, 0.5);
    r.lit = false;
  },

  storage(ctx) {
    const { g, deco, rng, room: r } = ctx;
    // rows of crate stacks / containers with 2-wide aisles
    const alongX = r.w >= r.h;
    const L = alongX ? r.w : r.h, Wd = alongX ? r.h : r.w;
    for (let s = 2; s < Wd - 2; s += 4) {
      for (let t = 2; t < L - 3; t += rng.int(3, 5)) {
        const x = alongX ? r.x + t : r.x + s, z = alongX ? r.z + s : r.z + t;
        if (!freeRect(ctx, x, z, alongX ? 3 : 2, alongX ? 2 : 3, 1)) continue;
        if (rng.chance(0.35) && (style2(ctx) !== 'gothic')) deco.container(x, z, r.floor, alongX, { length: 2.6 });
        else deco.crateStack(x + 1, z + 1, r.floor);
      }
    }
    // shelving along a wall
    if (r.w >= 8) {
      const z = r.z;
      for (let x = r.x + 1; x < r.x + r.w - 3; x += 4) if (freeRect(ctx, x, z, 3, 1)) deco.shelf(x + 0.1, z + 0.05, x + 2.9, z + 0.75, r.floor, 2.2);
    }
  },

  control(ctx) {
    const { g, deco, rng, room: r } = ctx;
    // a screen wall + rows of consoles facing it, raised supervisor platform behind
    const faceDir = rng.pick([0, 1, 2, 3]);
    const alongX = faceDir >= 2;
    // screen wall: emissive screens on the wall the consoles face
    const top = r.floor + Math.min(r.ceilH - 0.5, 3.6);
    if (faceDir === 2) deco.box(r.x + 1, r.floor + 1.2, r.z + r.h - 0.06, r.x + r.w - 1, top, r.z + r.h, TS.SCREEN, { uv: 'fit', emissive: 0.9, faces: 8, s: 1 });
    if (faceDir === 3) deco.box(r.x + 1, r.floor + 1.2, r.z, r.x + r.w - 1, top, r.z + 0.06, TS.SCREEN, { uv: 'fit', emissive: 0.9, faces: 4, s: 1 });
    if (faceDir === 0) deco.box(r.x + r.w - 0.06, r.floor + 1.2, r.z + 1, r.x + r.w, top, r.z + r.h - 1, TS.SCREEN, { uv: 'fit', emissive: 0.9, faces: 2, s: 1 });
    if (faceDir === 1) deco.box(r.x, r.floor + 1.2, r.z + 1, r.x + 0.06, top, r.z + r.h - 1, TS.SCREEN, { uv: 'fit', emissive: 0.9, faces: 1, s: 1 });
    const rows = [];
    const L = alongX ? r.h : r.w;
    for (let t = 3; t < L - 2; t += 3) rows.push(t);
    for (const t of rows) {
      for (let s = 2; s < (alongX ? r.w : r.h) - 2; s += 2) {
        const x = alongX ? r.x + s : (faceDir === 0 ? r.x + r.w - 1 - t : r.x + t);
        const z = alongX ? (faceDir === 2 ? r.z + r.h - 1 - t : r.z + t) : r.z + s;
        if (!freeRect(ctx, x, z, 1, 1, 0)) continue;
        if (rng.chance(0.8)) deco.console(x, z, r.floor, faceDir);
      }
    }
    scatterProps(ctx, 0.2);
  },

  courtyard(ctx) {
    const { g, deco, rng, room: r } = ctx;
    // open sky, ground cover, paths, planters, a fountain / monument
    const cx = Math.floor(r.x + r.w / 2), cz = Math.floor(r.z + r.h / 2);
    for (const i of ctx.cells) g.flags[i] |= F.OUTDOOR;
    // paved cross paths
    for (let x = r.x; x < r.x + r.w; x++) for (const z of [cz - 1, cz]) { const i = g.idx(x, z); if (g.type[i]) g.floorTex[i] = TS.SIDEWALK; }
    for (let z = r.z; z < r.z + r.h; z++) for (const x of [cx - 1, cx]) { const i = g.idx(x, z); if (g.type[i]) g.floorTex[i] = TS.SIDEWALK; }
    if (freeRect(ctx, cx - 2, cz - 2, 4, 4)) {
      if (rng.chance(0.5)) {
        makePit(ctx, cx - 2, cz - 2, 4, 4, 'water', 0.35);
        deco.box(cx - 0.4, r.floor - 0.35, cz - 0.4, cx + 0.4, r.floor + 1.6, cz + 0.4, TS.PILLAR, { solid: true });
      } else {
        deco.box(cx - 1, r.floor, cz - 1, cx + 1, r.floor + 0.6, cz + 1, TS.SIDE, { solid: true });
        deco.pillar(cx, cz, 0.7, r.floor + 0.6, r.floor + 3.4, { tex: TS.PILLAR });
      }
    }
    const fam = ctx.style.family;
    for (let k = 0; k < Math.floor(r.area / 30); k++) {
      const x = rng.int(r.x + 1, r.x + r.w - 3), z = rng.int(r.z + 1, r.z + r.h - 3);
      if (!freeRect(ctx, x, z, 2, 2, 0) || Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;
      if (fam === 'military') {
        // sandbag / concrete barricades and supply crates
        if (rng.chance(0.5)) deco.barrier(x, z + 0.5, x + 2, z + 0.5, r.floor, TS.SIDE);
        else deco.crateStack(x + 1, z + 1, r.floor);
      } else if (fam === 'industrial' || fam === 'tech') {
        if (rng.chance(0.5)) deco.container(x, z, r.floor, rng.chance(0.5), { length: 2 });
        else deco.crateStack(x + 1, z + 1, r.floor);
      } else if (fam === 'hell') {
        // bone pillars and spike clusters
        deco.box(x + 0.6, r.floor, z + 0.6, x + 1.4, r.floor + rng.float(2, 4), z + 1.4, TS.PILLAR, { solid: true });
      } else if (rng.chance(0.6)) deco.planter(x, z, r.floor, 2, 2);
      else tree(ctx, x + 1, z + 1);
    }
    // perimeter: battlements for castles, floodlight masts for bases
    if (fam === 'gothic' || fam === 'hell') {
      for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (!g.in(x, z)) continue;
        const i = g.idx(x, z);
        if (g.type[i] || (x + z) % 2) continue;
        const ring = x === r.x - 1 || x === r.x + r.w || z === r.z - 1 || z === r.z + r.h;
        if (!ring) continue;
        const top = g.floor[i];
        deco.box(x + 0.15, top, z + 0.15, x + 0.85, top + 0.9, z + 0.85, g.wallTex[i] || TS.WALL, { faces: FACE_SIDES_TOP });
      }
      // corner towers rising above the walls
      for (const [tx, tz] of [[r.x - 1, r.z - 1], [r.x + r.w, r.z - 1], [r.x - 1, r.z + r.h], [r.x + r.w, r.z + r.h]]) {
        if (!g.in(tx, tz) || g.type[g.idx(tx, tz)]) continue;
        const top = g.floor[g.idx(tx, tz)];
        deco.box(tx - 0.6, top, tz - 0.6, tx + 1.6, top + 3.5, tz + 1.6, g.wallTex[g.idx(tx, tz)] || TS.WALL, { faces: FACE_SIDES_TOP });
        for (let k = 0; k < 3; k++) deco.box(tx - 0.6 + k * 0.45, top + 3.5 + k * 0.6, tz - 0.6 + k * 0.45, tx + 1.6 - k * 0.45, top + 4.1 + k * 0.6, tz + 1.6 - k * 0.45, TS.ROOF, { faces: FACE_SIDES_TOP });
      }
      if (fam === 'hell' && freeRect(ctx, r.x + 1, r.z + 1, 3, 3, 0)) makePit(ctx, r.x + 1, r.z + 1, 3, 3, 'lava', 2.5);
    }
    if (fam === 'military' || fam === 'industrial' || fam === 'tech') {
      for (const [x, z] of [[r.x + 0.7, r.z + 0.7], [r.x + r.w - 0.7, r.z + r.h - 0.7]]) deco.streetLamp(x, z, r.floor, { height: 6, armX: 0, armZ: 0, radius: 9, color: [1, 0.95, 0.85] });
      if (fam === 'military' && r.w >= 9 && r.h >= 9) {
        // helipad marking
        deco.box(cx - 2, r.floor + 0.004, cz - 2, cx + 2, r.floor + 0.02, cz - 1.7, TS.PAINT, { uv: 'fit', faces: 16 });
        deco.box(cx - 2, r.floor + 0.004, cz + 1.7, cx + 2, r.floor + 0.02, cz + 2, TS.PAINT, { uv: 'fit', faces: 16 });
        deco.box(cx - 2, r.floor + 0.004, cz - 2, cx - 1.7, r.floor + 0.02, cz + 2, TS.PAINT, { uv: 'fit', faces: 16 });
        deco.box(cx + 1.7, r.floor + 0.004, cz - 2, cx + 2, r.floor + 0.02, cz + 2, TS.PAINT, { uv: 'fit', faces: 16 });
      }
    } else {
      // lamps at the path ends
      for (const [x, z] of [[cx - 1.5, r.z + 1.5], [cx + 0.5, r.z + r.h - 1.5]]) if (inRoom(r, Math.floor(x), Math.floor(z))) deco.streetLamp(x, z, r.floor, { height: 3.6, armX: 0.5 });
    }
    r.lit = true;
  },

  chapel(ctx) {
    const { g, deco, rng, room: r } = ctx;
    TEMPLATES.hall(ctx);
    // tall windows high on the long walls
    const alongX = r.w >= r.h;
    for (let t = 2; t < (alongX ? r.w : r.h) - 2; t += 3) {
      if (alongX) {
        deco.window(r.x + t, r.z, 3, r.floor + 3, r.floor + Math.min(r.ceilH - 1, 6.5), { emissive: 0.55 });
        deco.window(r.x + t, r.z + r.h - 1, 2, r.floor + 3, r.floor + Math.min(r.ceilH - 1, 6.5), { emissive: 0.55 });
      } else {
        deco.window(r.x, r.z + t, 1, r.floor + 3, r.floor + Math.min(r.ceilH - 1, 6.5), { emissive: 0.55 });
        deco.window(r.x + r.w - 1, r.z + t, 0, r.floor + 3, r.floor + Math.min(r.ceilH - 1, 6.5), { emissive: 0.55 });
      }
    }
    // candles / braziers
    r.lit = false;
  },

  reactor(ctx) {
    const { g, deco, rng, room: r } = ctx;
    const cx = Math.floor(r.x + r.w / 2), cz = Math.floor(r.z + r.h / 2);
    const R = Math.floor(Math.min(r.w, r.h) / 2) - 2;
    if (R < 3) return TEMPLATES.pitroom(ctx);
    const kind = ctx.style.hazards.includes('lava') ? 'lava' : 'poison';
    // ring pit around a central core platform
    const pit = [];
    for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
      const d = Math.hypot(x + 0.5 - (cx + 0.5), z + 0.5 - (cz + 0.5));
      if (d <= R && d > 1.8 && inRoom(r, x, z) && !r.reserved.has(g.idx(x, z))) pit.push([x, z]);
    }
    for (const [x, z] of pit) makePit(ctx, x, z, 1, 1, kind, 4);
    // four bridges to the core
    const walk = new Set(ctx.cells.filter((i) => !(g.flags[i] & F.PIT)));
    for (const i of bridge(ctx, cx - R, cz, cx + R, cz, r.floor, 1)) walk.add(i);
    for (const i of bridge(ctx, cx, cz - R, cx, cz + R, r.floor, 1)) walk.add(i);
    deco.railEdges(walk, { style: 'metal' });
    // the reactor core: glowing column with rings
    const top = r.floor + r.ceilH;
    deco.box(cx + 0.5 - 0.7, r.floor, cz + 0.5 - 0.7, cx + 0.5 + 0.7, top, cz + 0.5 + 0.7, TS.LIGHT, { emissive: 0.9, solid: true, s: 2 });
    for (let y = r.floor + 1.5; y < top - 0.5; y += 2.5) deco.box(cx + 0.5 - 0.95, y, cz + 0.5 - 0.95, cx + 0.5 + 0.95, y + 0.3, cz + 0.5 + 0.95, TS.METAL);
    deco.light(cx + 0.5, r.floor + 2.5, cz + 0.5, kind === 'lava' ? [1, 0.5, 0.2] : [0.4, 1, 0.6], 11, { pulse: true });
    r.lit = false;
  },

  arena(ctx) {
    const { g, deco, rng, room: r } = ctx;
    const top = r.floor + r.ceilH;
    // big cover pillars
    const n = r.area > 300 ? 6 : 4;
    const spots = [];
    for (let k = 0; k < 40 && spots.length < n; k++) {
      const x = rng.int(r.x + 3, r.x + r.w - 4), z = rng.int(r.z + 3, r.z + r.h - 4);
      if (spots.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) < 5)) continue;
      if (Math.abs(x - (r.x + r.w / 2)) < 3 && Math.abs(z - (r.z + r.h / 2)) < 3) continue;
      if (!freeRect(ctx, x, z, 2, 2, 1)) continue;
      spots.push([x, z]);
    }
    for (const [x, z] of spots) deco.pillar(x + 1, z + 1, 1.3, r.floor, top, { tex: TS.PILLAR });
    // hazard pools in two corners, raised firing platforms in the others
    const corners = rng.shuffle([[r.x + 1, r.z + 1], [r.x + r.w - 5, r.z + 1], [r.x + 1, r.z + r.h - 5], [r.x + r.w - 5, r.z + r.h - 5]]);
    const kind = pickHaz(ctx);
    let pools = 0, plats = 0;
    for (const [x, z] of corners) {
      if (!freeRect(ctx, x, z, 4, 4, 0)) continue;
      if (pools < 2 && kind !== 'spikes') { makePit(ctx, x, z, 4, 4, kind, 0.4); pools++; continue; }
      if (plats < 2) {
        // stairs from the floor up to the platform, on the side facing the room centre
        const toCenterX = x + 2 < r.x + r.w / 2;
        const fx = toCenterX ? x + 4 : x - 3;
        if (!freeRect(ctx, fx, z + 1, 3, 2, 0)) continue;
        const set = new Set();
        eachCell(ctx, x, z, 4, 4, (cx, cz, i) => { g.floor[i] = r.floor + 1.8; g.wallTex[i] = TS.SIDE; g.floorTex[i] = TS.GRATE; set.add(i); });
        deco.stairs(toCenterX ? x + 6 : x - 3, z + 1, toCenterX ? 1 : 0, 2, r.floor, r.floor + 1.8, { rise: 0.6, light: r.light, region: r.id });
        deco.railEdges(set, { style: ctx.style.railStyle });
        plats++;
      }
    }
    // feature floor ring and ceiling lights
    for (const i of ctx.cells) {
      const x = i % g.w, z = (i / g.w) | 0;
      const d = Math.hypot(x + 0.5 - (r.x + r.w / 2), z + 0.5 - (r.z + r.h / 2));
      if (d < 4 && g.type[i] && !(g.flags[i] & (F.PIT | F.HAZARD | F.STAIR))) g.floorTex[i] = TS.FLOOR3;
    }
    r.lit = false;
  },
};
function style2(ctx) { return ctx.style.family; }

function tree(ctx, x, z) {
  const { deco, room: r } = ctx;
  deco.box(x - 0.15, r.floor, z - 0.15, x + 0.15, r.floor + 2.4, z + 0.15, TS.WOOD, { solid: true });
  deco.box(x - 1.0, r.floor + 2.0, z - 1.0, x + 1.0, r.floor + 3.4, z + 1.0, TS.FOLIAGE);
  deco.box(x - 0.6, r.floor + 3.4, z - 0.6, x + 0.6, r.floor + 4.0, z + 0.6, TS.FOLIAGE);
}

// consoles / machinery against free wall cells
function wallConsoles(ctx, n, machinery = false) {
  const { g, deco, rng, room: r } = ctx;
  let placed = 0;
  for (let k = 0; k < 30 && placed < n; k++) {
    const side = rng.int(0, 3);
    let x, z, faceDir;
    if (side === 0) { x = rng.int(r.x + 1, r.x + r.w - 2); z = r.z; faceDir = 2; }
    else if (side === 1) { x = rng.int(r.x + 1, r.x + r.w - 2); z = r.z + r.h - 1; faceDir = 3; }
    else if (side === 2) { x = r.x; z = rng.int(r.z + 1, r.z + r.h - 2); faceDir = 0; }
    else { x = r.x + r.w - 1; z = rng.int(r.z + 1, r.z + r.h - 2); faceDir = 1; }
    if (!freeRect(ctx, x, z, 1, 1, 0) || !deco.cellFree(x, z)) continue;
    const i = g.idx(x, z);
    if (Math.abs(g.floor[i] - r.floor) > 0.01) continue;
    if (machinery) {
      // a big machine block: machinery front, metal sides
      const fx = DIR_X[faceDir], fz = DIR_Z[faceDir];
      const x0 = x + (fx < 0 ? 0.3 : 0), x1 = x + 1 - (fx > 0 ? 0.3 : 0), z0 = z + (fz < 0 ? 0.3 : 0), z1 = z + 1 - (fz > 0 ? 0.3 : 0);
      const front = faceDir === 0 ? 'px' : faceDir === 1 ? 'nx' : faceDir === 2 ? 'pz' : 'nz';
      deco.box(x0, r.floor, z0, x1, r.floor + rng.pick([1.6, 2.2, 2.8]), z1, { side: TS.METAL, top: TS.METAL, [front]: TS.MACHINE }, { solid: true });
    } else deco.console(x, z, r.floor, faceDir);
    placed++;
  }
}

// crates, barrels-as-crates, tables... in free spots near walls
function scatterProps(ctx, density) {
  const { g, deco, rng, room: r, style } = ctx;
  const n = Math.floor(r.area / 40 * density) + 1;
  for (let k = 0; k < n * 4 && n > 0; k++) {
    const nearWall = rng.chance(0.75);
    let x, z;
    if (nearWall) {
      const side = rng.int(0, 3);
      x = side < 2 ? rng.int(r.x + 1, r.x + r.w - 3) : side === 2 ? r.x : r.x + r.w - 2;
      z = side >= 2 ? rng.int(r.z + 1, r.z + r.h - 3) : side === 0 ? r.z : r.z + r.h - 2;
    } else { x = rng.int(r.x + 2, r.x + r.w - 4); z = rng.int(r.z + 2, r.z + r.h - 4); }
    if (!freeRect(ctx, x, z, 2, 2, 0)) continue;
    let ok = true;
    eachCell(ctx, x, z, 2, 2, (cx, cz, i) => { if (!deco.cellFree(cx, cz) || Math.abs(g.floor[i] - r.floor) > 0.01) ok = false; });
    if (!ok) continue;
    const fam = style.family;
    const roll = rng.next();
    if (fam === 'domestic' && roll < 0.5) deco.table(x + 0.3, z + 0.5, r.floor, 1.4, 0.8);
    else if ((fam === 'gothic' || fam === 'hell') && roll < 0.4) deco.box(x + 0.4, r.floor, z + 0.4, x + 1.6, r.floor + 0.9, z + 1.6, { side: TS.SIDE, top: TS.TRIM }, { solid: true });
    else deco.crateStack(x + 1, z + 1, r.floor, { count: rng.int(1, 3) });
  }
}

// shared with the maze / hall generators (mazekit.js, hall_templates.js)
export { TEMPLATES, makePit, bridge, freeRect, eachCell, inRoom, scatterProps, wallConsoles, tree, pickHaz, HAZ_OF, HAZ_TEX, LIGHT_COL };
