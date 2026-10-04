// "Foundry" archetype: industrial plants - the clockwork foundry, the
// infernal foundry, the meat processing plant and the volcano base.
//
// Built on the architect generator (gen_arch.js) with a custom partition: an
// enormous machine hall (ceiling 11-14) runs along the middle of the map as a
// "spine", an open-air yard sits at one end of it (cooling towers, stacks,
// tanks, ore carts), and the wings on both sides are split by a finer BSP into
// purpose-built rooms (foundry_rooms.js): furnace halls with tapping channels,
// production lines with operator platforms, raised control rooms, loading
// docks with a sunken truck bay, pipe galleries over sumps, boiler houses,
// ore stores, gear pits (clockwork), carcass hook halls and cold rooms (meat
// plant), magma breaches where the volcano's rock breaks into the plant.
//
// The machine hall has a molten vat (lava / blood / a gear pit) in its middle
// crossed by low catwalks, steel galleries up stairs along the long walls, a
// high catwalk over the vat between them, a control booth with windows
// overlooking the floor, furnaces along the end walls, conveyors under
// hoppers and an overhead travelling crane with a ladle.
//
// Passages are heavy industrial openings (parked roll-up shutters, hazard
// paint); height changes are stair flights with hand rails, keyed gates are
// gen_arch's 3-wide doorways.
//
// Dev hooks (tests / screenshots): globalThis.__FOUNDRYFORCE = 'fd_dock,fd_line'
// favours room kinds, globalThis.__FOUNDRYSTAT (an array) collects template
// fallbacks.
import { TS, F, clamp, DIR_X, DIR_Z } from './common.js';
import { FACE } from './deco.js';
import { genArch, TEMPLATES } from './gen_arch.js';
import { FT } from './foundry_rooms.js';
import { fvOf, breachWall, ROCK_WALLS } from './foundry_props.js';
import './foundry_wings.js';

for (const [k, fn] of Object.entries(FT)) if (!TEMPLATES[k]) TEMPLATES[k] = fn;

// steel kick-plate wainscot (PANEL) under the plant walls breaks up the tall halls
const STYLE = { family: 'industrial', lights: 'hanging', wain: 1.1, crown: false, pillars: 'girder', outdoor: 0.1 };
// per-theme room mix (weights) for the wings
const FOUNDRY = {
  clockwork_foundry: { rooms: { fd_gears: 2.6, fd_line: 2.2, fd_furnace: 2.0, fd_boiler: 2.0, fd_pipes: 1.5, fd_control: 1.2, fd_dock: 1.3, fd_store: 1.2 } },
  infernal_foundry: { rooms: { fd_furnace: 3.0, fd_line: 1.6, fd_boiler: 1.5, fd_pipes: 1.5, fd_store: 1.5, fd_control: 1.0, fd_dock: 1.2, fd_breach: 0.8 } },
  meat_plant: { rooms: { fd_line: 2.8, fd_hooks: 2.8, fd_cold: 2.2, fd_boiler: 1.0, fd_pipes: 1.3, fd_control: 1.0, fd_dock: 1.6, fd_store: 0.7 } },
  volcano_base: { rooms: { fd_breach: 2.6, fd_furnace: 2.0, fd_control: 1.6, fd_line: 1.5, fd_boiler: 1.5, fd_pipes: 1.5, fd_dock: 1.3, fd_store: 1.0 } },
};
// room size needs (rooms are leaves - 2)
const NEED = {
  fd_furnace: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 10,
  fd_line: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 11,
  fd_control: (r) => r.w >= 8 && r.h >= 8 && r.area <= 300,
  fd_dock: (r) => Math.min(r.w, r.h) >= 9 && Math.max(r.w, r.h) >= 11,
  fd_pipes: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 11,
  fd_boiler: (r) => r.w >= 9 && r.h >= 9,
  fd_store: (r) => r.w >= 8 && r.h >= 8,
  fd_gears: (r) => r.w >= 10 && r.h >= 10,
  fd_hooks: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 10,
  fd_cold: (r) => r.w >= 8 && r.h >= 8 && r.area <= 280,
  fd_breach: (r) => r.w >= 9 && r.h >= 9,
};
const CAP = { fd_control: 1, fd_dock: 1, fd_cold: 2, fd_breach: 2, fd_gears: 2, fd_furnace: 2, fd_line: 2, fd_boiler: 2, fd_pipes: 2, fd_store: 2, fd_hooks: 2 };
const CEIL = {
  fd_hall: [11, 12, 13, 14], fd_entry: [4.5, 5], fd_arena: [10, 11, 12], fd_yard: [12],
  fd_furnace: [8, 9], fd_line: [6.5, 7, 8], fd_control: [4.5, 5], fd_dock: [7, 8], fd_pipes: [6.5, 7.5], fd_boiler: [8, 9],
  fd_store: [6.5, 7.5], fd_gears: [9, 10], fd_hooks: [6.5, 7], fd_cold: [4.5, 5], fd_breach: [9, 10],
};
// floors: grating in service rooms, plate elsewhere
const GRATE_FLOOR = new Set(['fd_pipes', 'fd_boiler', 'fd_gears']);
// wall slot per room kind (meat plant WALL2 is flesh, volcano WALL2 lava rock: only where it belongs)
const WALL2_ROOMS = {
  clock: new Set(['fd_gears', 'fd_boiler', 'fd_pipes', 'fd_furnace']),
  hell: new Set(['fd_furnace', 'fd_store', 'fd_breach', 'fd_boiler']),
  meat: new Set([]),
  volcano: new Set([]),             // breachWall paints only the stretch where the rock breaks in
};

export function genFoundry(rng, theme, depth) {
  const C = FOUNDRY[theme.id] || FOUNDRY.infernal_foundry;
  const count = {};
  const L = genArch(rng, theme, depth, {
    scale: 1.1,
    style: STYLE,
    layout: plantLayout,
    forceBig: 'fd_hall',
    arenaTemplate: 'fd_arena',
    startTemplate: () => 'fd_entry',
    ceilH: CEIL,
    skyTemplates: ['fd_yard'],
    floorSlot: (r) => (GRATE_FLOOR.has(r.template) ? TS.FLOOR2 : TS.FLOOR),
    doorChance: 0.1,
    connWidths: [3, 3, 3, 4, 4],
    // fewer loops than the default: wing rooms keep enough wall and floor free
    // of exit approaches for their machinery
    loopChance: (A, B) => (A.leaf.big || B.leaf.big ? 0.34 : 0.26),
    roomOpts: (r) => {
      if (r.leaf.kind === 'yard') return [['fd_yard', 1]];
      if (r.leaf.big) return [['plain', 1]];           // the machine hall: replaced by the signature template
      const out = [];
      for (const [k, w] of Object.entries(C.rooms)) {
        if ((count[k] || 0) >= (CAP[k] ?? 99)) continue;
        if (!NEED[k] || NEED[k](r)) out.push([k, w / (1 + 0.8 * (count[k] || 0))]);
      }
      if (!out.length) out.push(['fd_store', 1]);
      for (const force of (globalThis.__FOUNDRYFORCE || '').split(',').filter(Boolean)) {
        if (!C.rooms[force] || (NEED[force] && !NEED[force](r))) continue;
        const o = out.find((q) => q[0] === force);
        if (o) o[1] = 1e3; else out.push([force, 1e3]);
      }
      const pick = rng.weighted(out, (o) => o[1])[0];
      count[pick] = (count[pick] || 0) + 1;
      r.fdKind = pick;
      return [[pick, 1]];
    },
  });
  finishFoundry(L, theme, rng);
  if (globalThis.__FOUNDRYSTAT) for (const r of L.rooms) if (r.template === 'plain') globalThis.__FOUNDRYSTAT.push(['plain', r.fdKind || (r.signature ? 'fd_hall' : '?')]);
  return L;
}

// The plant: a machine-hall spine across the long axis, the yard at one end
// of it (and sometimes an annex at the other), BSP-split wings on both sides.
function plantLayout({ W, H, rng, add }) {
  const x0 = 1, z0 = 1, x1 = W - 1, z1 = H - 1;
  const iw = x1 - x0, ih = z1 - z0;
  const WING = 12;
  const bandH = clamp(Math.round(ih * rng.float(0.38, 0.46)), 22, Math.min(30, ih - 2 * WING));
  const nH = clamp(Math.round((ih - bandH) * rng.float(0.4, 0.6)), WING, ih - bandH - WING);
  const bz0 = z0 + nH, bz1 = bz0 + bandH;
  const yardW = clamp(Math.round(iw * rng.float(0.2, 0.25)), 14, 22);
  let endW = 0;
  if (iw - yardW - 34 >= 12 && rng.chance(0.55)) endW = clamp(Math.round(iw * rng.float(0.14, 0.18)), 12, 16);
  const hallW = iw - yardW - endW;
  const yardWest = rng.chance(0.5);
  const hx = yardWest ? x0 + yardW : x0 + endW;
  add({ x: hx, z: bz0, w: hallW, h: bandH }, true);
  add({ x: yardWest ? x0 : x1 - yardW, z: bz0, w: yardW, h: bandH, kind: 'yard' }, true);
  if (endW) {
    // the annex: split across the band when it is deep enough for two rooms
    const ex = yardWest ? x1 - endW : x0;
    if (bandH >= 24 && rng.chance(0.5)) {
      const cut = rng.int(11, bandH - 11);
      add({ x: ex, z: bz0, w: endW, h: cut }); add({ x: ex, z: bz0 + cut, w: endW, h: bandH - cut });
    } else add({ x: ex, z: bz0, w: endW, h: bandH });
  }
  const MIN = 11;
  const splitWing = (n, d) => {
    const area = n.w * n.h;
    const canH = n.w >= MIN * 2, canV = n.h >= MIN * 2;
    const roll = rng.next();
    const stop = (!canH && !canV) || area <= 200 || (area <= 330 && roll < 0.4) || (area <= 480 && d >= 1 && roll < 0.15);
    if (stop) { add(n); return; }
    const horiz = canH && (!canV || n.w > n.h * 1.15 || (n.h <= n.w * 1.15 && rng.chance(0.5)));
    if (horiz) {
      const cut = rng.int(Math.max(MIN, Math.floor(n.w * 0.32)), Math.min(n.w - MIN, Math.ceil(n.w * 0.68)));
      splitWing({ x: n.x, z: n.z, w: cut, h: n.h }, d + 1); splitWing({ x: n.x + cut, z: n.z, w: n.w - cut, h: n.h }, d + 1);
    } else {
      const cut = rng.int(Math.max(MIN, Math.floor(n.h * 0.32)), Math.min(n.h - MIN, Math.ceil(n.h * 0.68)));
      splitWing({ x: n.x, z: n.z, w: n.w, h: cut }, d + 1); splitWing({ x: n.x, z: n.z + cut, w: n.w, h: n.h - cut }, d + 1);
    }
  };
  splitWing({ x: x0, z: z0, w: iw, h: nH }, 0);
  splitWing({ x: x0, z: bz1, w: iw, h: z1 - bz1 }, 0);
}

// ---------------------------------------------------------------- finishing
function finishFoundry(L, theme, rng) {
  const { grid: g, deco } = L;
  const fv = fvOf(theme);
  // walls: the secondary wall slot only in the rooms it suits
  // (the converter house - boss arena - in the secondary slot: spiked iron,
  // brass pipework, volcanic rock; white tile in the meat plant), rock where
  // the volcano breaks in stays rock
  const w2 = WALL2_ROOMS[fv];
  const rock = ROCK_WALLS.get(g) || new Set();
  for (const r of L.rooms) {
    const arena = r.template === 'fd_arena';
    const want = arena ? (fv === 'meat' ? TS.WALL : TS.WALL2) : w2.has(r.template) ? TS.WALL2 : TS.WALL;
    for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (!g.in(x, z)) continue;
      const i = g.idx(x, z);
      if (g.type[i] || rock.has(i)) continue;
      const ring = x === r.x - 1 || x === r.x + r.w || z === r.z - 1 || z === r.z + r.h;
      if (ring && (g.wallTex[i] === TS.WALL || g.wallTex[i] === TS.WALL2 || (arena && g.wallTex[i] === TS.ACCENT))) g.wallTex[i] = want;
    }
  }
  // volcano base: the mountain's rock breaks into a few more rooms
  if (fv === 'volcano') {
    for (const r of L.rooms) {
      if (r.template === 'fd_breach' || r.template === 'fd_arena' || r.template === 'fd_yard' || r.template === 'fd_entry' || r.template === 'plain') continue;
      if (r.signature ? rng.chance(0.8) : rng.chance(0.3)) breachWall(g, deco, rng, r, { small: !r.signature });
    }
  }
  dressPassages(L, rng);
  // caps of walls seen from the yard: roof role, not the floor texture
  for (let i = 0; i < g.w * g.h; i++) {
    if (g.type[i] || g.floorTex[i] !== TS.FLOOR) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (g.in(nx, nz) && g.type[g.idx(nx, nz)] && g.sky[g.idx(nx, nz)]) { g.floorTex[i] = TS.ROOF; break; }
    }
  }
}

// Wide passages get a roll-up shutter parked under the lintel and hazard paint
// across both mouths; the jambs carry a steel channel. Keyed gates and plain
// 1-wide doorways stay as they are (their doors bring their own frames).
function dressPassages(L, rng) {
  const { grid: g, deco } = L;
  void rng;
  for (const c of L.conns || []) {
    if (c.mode === 'skip' || c.door || c.width < 2) continue;
    const ax = c.axis === 'x';
    const a0 = c.pos, a1 = c.pos + c.width;
    const cellAt = (t, a) => (ax ? g.idx(t, a) : g.idx(a, t));
    const i0 = cellAt(c.line - 1, a0), i1 = cellAt(c.line, a0);
    if (!g.type[i0] || !g.type[i1]) continue;
    const f0 = g.floor[i0], f1 = g.floor[i1];
    const top = Math.min(g.ceil[i0], g.ceil[i1]);
    const lo = Math.max(f0, f1);
    const flat = Math.abs(f0 - f1) < 0.01 && !(g.flags[i0] & F.STAIR) && !(g.flags[i1] & F.STAIR);
    // the rolled-up shutter: a drum housing across the opening under the lintel
    if (top - lo > 3.0) {
      const y1 = top, y0 = top - 0.5;
      if (ax) deco.box(c.line - 0.3, y0, a0, c.line + 0.3, y1, a1, { side: TS.CRATE2, top: TS.METAL, bottom: TS.CRATE2 }, { s: 1 });
      else deco.box(a0, y0, c.line - 0.3, a1, y1, c.line + 0.3, { side: TS.CRATE2, top: TS.METAL, bottom: TS.CRATE2 }, { s: 1 });
      // guide channels on the jambs
      for (const a of [a0, a1]) {
        if (ax) deco.box(c.line - 0.12, lo, a - 0.06, c.line + 0.12, top - 0.5, a + 0.06, TS.METAL, { faces: FACE.SIDES });
        else deco.box(a - 0.06, lo, c.line - 0.12, a + 0.06, top - 0.5, c.line + 0.12, TS.METAL, { faces: FACE.SIDES });
      }
    }
    if (!flat) continue;
    for (const t of [c.line - 1 + 0.08, c.line + 1 - 0.26]) {
      if (ax) deco.box(t, f0 + 0.004, a0 + 0.05, t + 0.18, f0 + 0.018, a1 - 0.05, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
      else deco.box(a0 + 0.05, f0 + 0.004, t, a1 - 0.05, f0 + 0.018, t + 0.18, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    }
  }
}
