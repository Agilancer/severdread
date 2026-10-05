// "Starship" archetype: the level IS a ship's hull seen from the inside - the
// large space freighter (intact, cargo-heavy) and the crashed starship (broken
// in two on an alien world).
//
// Built on the architect generator (gen_arch.js) with a custom partition along
// the ship's long axis (stern -> bow):
//   - the engine room across the whole stern: a tall hall around the reactor
//     core in its coolant well, a catwalk ring around the core on bridges from
//     raised platforms, thruster housings on the aft wall;
//   - the spine corridor down the middle of the hull, cut into sections by
//     bulkheads (3-wide openings, the keyed gates on the way to the boss), hull
//     frames every few cells, pipe bundles and cable trays overhead;
//   - side decks on both sides of the spine, split into bays (inner rows on
//     the spine, outer rows on the hull): cargo holds (tall, sunk, container
//     rows, a gantry crane on rails, a gallery with a freight lift), a shuttle
//     hangar with its launch door, crew quarters (bunks), the mess hall with
//     its galley, the med bay, the armory, airlocks with suit racks,
//     maintenance decks on two levels joined by stairs, life support /
//     hydroponics and stores;
//   - the bridge at the bow: raised above the spine (stairs up), a command deck
//     with the captain's chair, helm consoles under a panoramic window.
// The freighter floats in space: every cell outside the hull is open sky over
// the void, so its windows (bridge, mess, lounge) look out at the real sky.
// The crashed ship lies broken on an alien world: the crash site between the
// two halves is open ground (sky, rocks, wreckage, burning fuel), the torn ends
// gape open with buckled decks, torn floors over jagged wreckage, fuel pits and
// sparking conduits, and the bow half rests nose-up on rising ground.
//
// Dev hooks (tests / screenshots): globalThis.__SHIPFORCE = 'ss_mess,ss_med'
// favours room kinds, globalThis.__SHIPSTAT (an array) collects template
// fallbacks.
import { TS, F, clamp, DIR_X, DIR_Z, OPP, SKY_H } from './common.js';
import { FACE } from './deco.js';
import { genArch, TEMPLATES } from './gen_arch.js';
import { SS, shipVariant } from './starship_rooms.js';
import { finishShip } from './starship_finish.js';

for (const [k, fn] of Object.entries(SS)) if (!TEMPLATES[k]) TEMPLATES[k] = fn;

// metal-panel corridors: a kick-plate wainscot, panel lights, metal rails
const STYLE = { family: 'tech', lights: 'panel', wain: 0.9, crown: false, pillars: 'square', outdoor: 0, hazards: ['poison', 'poison', 'spikes'] };

// room mix per theme (weights) and caps
const SHIP = {
  large_freighter: {
    crashed: false,
    rooms: { ss_quarters: 1.6, ss_mess: 1.3, ss_med: 1.0, ss_armory: 0.9, ss_airlock: 1.0, ss_maint: 1.5, ss_life: 0.9, ss_storage: 1.0, ss_lounge: 0.8 },
    cargo: [2, 3], hangar: 0.75, bossEngine: 0.6,
  },
  crashed_starship: {
    crashed: true,
    rooms: { ss_quarters: 1.7, ss_mess: 1.3, ss_med: 1.3, ss_armory: 1.1, ss_airlock: 1.0, ss_maint: 1.5, ss_life: 1.0, ss_storage: 0.8, ss_lounge: 0.6 },
    cargo: [1, 2], hangar: 0.4, bossEngine: 0.5,
  },
};
const CAP = { ss_quarters: 2, ss_mess: 1, ss_med: 1, ss_armory: 1, ss_airlock: 2, ss_maint: 2, ss_life: 1, ss_storage: 3, ss_lounge: 1 };
// room (= leaf - 2) size needs per kind; edge = the room's outer wall is the hull
const NEED = {
  ss_cargo: (w, h) => Math.min(w, h) >= 11 && w * h >= 190,
  ss_hangar: (w, h, edge) => edge && Math.min(w, h) >= 11 && w * h >= 170,
  ss_quarters: (w, h) => Math.min(w, h) >= 7 && Math.max(w, h) >= 8 && w * h <= 300,
  ss_mess: (w, h) => Math.min(w, h) >= 8 && Math.max(w, h) >= 10,
  ss_med: (w, h) => Math.min(w, h) >= 8 && Math.max(w, h) >= 9,
  ss_armory: (w, h) => Math.min(w, h) >= 7 && w * h <= 260,
  ss_airlock: (w, h, edge) => edge && w * h <= 220,
  ss_maint: (w, h) => Math.min(w, h) >= 9 && Math.max(w, h) >= 10,
  ss_life: (w, h) => Math.min(w, h) >= 9,
  ss_lounge: (w, h, edge) => edge && Math.min(w, h) >= 7 && w * h <= 260,
  ss_storage: () => true,
};
const CEIL = {
  ss_spine: [4.5, 5], ss_engine: [12, 13, 14], ss_bridge: [6.5, 7], ss_cargo: [9, 10, 11], ss_hangar: [9, 10],
  ss_quarters: [3.8, 4], ss_mess: [4.5, 5], ss_med: [4.5, 5], ss_armory: [4, 4.5], ss_airlock: [4, 4.5], ss_dock: [4.5, 5],
  ss_maint: [7.5, 8], ss_life: [6, 6.5], ss_lounge: [4.5, 5], ss_storage: [4.5, 5.5], ss_crash: [12],
};
// deck floors by room use: grating in the plant rooms, the feature floor on the bridge / mess / med bay
const FLOOR_OF = {
  ss_engine: TS.FLOOR2, ss_maint: TS.FLOOR2, ss_life: TS.FLOOR2, ss_bridge: TS.FLOOR3, ss_mess: TS.FLOOR3, ss_med: TS.FLOOR3, ss_lounge: TS.FLOOR3,
};

export function genStarship(rng, theme, depth) {
  const C = SHIP[theme.id] || (shipVariant(theme) === 'crashed' ? SHIP.crashed_starship : SHIP.large_freighter);
  const S = { crashed: C.crashed, C, leaves: [] };
  const kindOf = (i) => S.leaves[i]?.kind;
  const L = genArch(rng, theme, depth, {
    scale: C.crashed ? 1.3 : 1.12,
    aspect: C.crashed ? [0.6, 0.7] : [0.56, 0.66],
    style: STYLE,
    layout: (a) => shipLayout(a, S),
    pickStart: (rooms) => rooms.find((r) => r.leaf.kind === (C.crashed ? 'ss_crash' : 'ss_dock')) || null,
    pickBoss: (rooms) => rooms.find((r) => r.leaf.kind === S.bossKind) || null,
    startTemplate: (r) => r.leaf.kind,
    arenaTemplate: (r) => r.leaf.kind,
    roomOpts: (r) => [[r.leaf.kind, 1]],
    roomFloor: (r, parent, f, rg) => deckFloor(r.leaf, rg),
    // the spine joins the tree first: side rooms hang off it, the bulkheads carry the gates
    treeBias: (e) => (kindOf(e.i) === 'ss_spine' || kindOf(e.j) === 'ss_spine' ? 0 : 1),
    connWidth: (e, A, B) => {
      const ka = A.leaf.kind, kb = B.leaf.kind;
      if (ka === 'ss_spine' && kb === 'ss_spine') return 3;                     // bulkheads
      if (ka === 'ss_crash' || kb === 'ss_crash') return Math.min(e.len - 1, rng.int(4, 6));   // torn hull
      if (ka === 'ss_spine' || kb === 'ss_spine' || ka === 'ss_engine' || kb === 'ss_engine') return Math.min(e.len - 1, rng.pick([3, 3, 4]));
      return Math.min(e.len - 1, rng.pick([2, 3, 3]));
    },
    loopChance: (A, B) => {
      if (A.leaf.kind === 'ss_crash' || B.leaf.kind === 'ss_crash') return 0.55;
      if (A.leaf.kind === 'ss_bridge' || B.leaf.kind === 'ss_bridge' || A.leaf.kind === 'ss_engine' || B.leaf.kind === 'ss_engine') return 0.2;
      return 0.36;
    },
    ceilH: CEIL,
    skyTemplates: ['ss_crash'],
    floorSlot: (r) => (r.leaf.kind === 'ss_crash' ? TS.GROUND : FLOOR_OF[r.template] ?? TS.FLOOR),
    doorChance: 0.1,
  });
  L.ship = S;
  finishShip(L, theme, rng, S);
  if (globalThis.__SHIPSTAT) for (const r of L.rooms) if (r.template === 'plain') globalThis.__SHIPSTAT.push(['plain', r.leaf.kind]);
  return L;
}

// deck height of a room: the ship's deck (leaf.deck, the crashed bow half
// rises toward its nose) plus the room's own offset - sunk holds and engine
// room, the raised bridge
function deckFloor(leaf, rng) {
  const base = leaf.deck ?? 0;
  switch (leaf.kind) {
    case 'ss_spine': case 'ss_dock': case 'ss_airlock': return base;
    case 'ss_crash': return 0;
    case 'ss_engine': return base + rng.pick([-1.2, -1.8, -1.8, -2.4]);
    case 'ss_bridge': return base + rng.pick([1.2, 1.2, 1.8]);
    case 'ss_cargo': return base + rng.pick([-2.4, -3.0, -3.0]);
    case 'ss_hangar': return base + rng.pick([0, -1.2, -1.8]);
    case 'ss_maint': return base + rng.pick([0, -1.2]);
    case 'ss_life': return base + rng.pick([0, 0, -0.6]);
    default: return base + (rng.chance(0.18) ? rng.pick([0.6, -0.6]) : 0);
  }
}

// ---------------------------------------------------------------- layout
// u runs along the ship from the stern (0) to the bow; v across it (z).
function shipLayout({ W, H, rng, add }, S) {
  const { crashed, C } = S;
  const X0 = 1, X1 = W - 1, Z0 = 1, Z1 = H - 1;
  const Lu = X1 - X0;
  const sternWest = rng.chance(0.5);
  S.sternWest = sternWest;
  const leaves = [];
  const push = (u0, len, z0, h, kind, o = {}) => {
    const n = { x: sternWest ? X0 + u0 : X1 - u0 - len, z: z0, w: len, h, kind, u0, len, ...o };
    leaves.push(n);
    return n;
  };
  // hull breadth: margins of open space (freighter) / ground (crashed) on both sides
  let mA = crashed ? rng.int(1, 3) : rng.int(2, 5), mB = crashed ? rng.int(1, 3) : rng.int(2, 5);
  while (Z1 - Z0 - mA - mB < 31 && (mA > 0 || mB > 0)) { if (mA >= mB && mA > 0) mA--; else mB--; }
  const hz0 = Z0 + mA, hz1 = Z1 - mB, breadth = hz1 - hz0;
  S.hull = { hz0, hz1 };
  // spine (leaf 7 deep: a 5-wide corridor) with bands of side decks on both sides
  const SP = 7;
  const sz0 = hz0 + clamp(Math.round((breadth - SP) * rng.float(0.4, 0.6)), 11, breadth - SP - 11);
  const sz1 = sz0 + SP;
  S.spineZ = [sz0, sz1];
  // stern / bow ends
  const sternPad = crashed ? rng.int(1, 2) : rng.int(1, 3);
  const bowPad = crashed ? rng.int(1, 2) : rng.int(6, 9);
  let E = clamp(Math.round(Lu * 0.17), 15, 22);
  let B = clamp(Math.round(Lu * 0.15), 13, 18);
  const uE0 = sternPad;
  const uB1 = Lu - bowPad;
  // the crash site: the hull broke in two, the gap between the halves is open ground
  let gap = null;
  if (crashed) {
    const G = clamp(Math.round(Lu * 0.2), 14, 22);
    // both halves need the end room and at least one spine section
    while (E + B + G + 2 * 11 > uB1 - uE0 && (E > 13 || B > 12)) { if (E > 13) E--; if (B > 12) B--; }
    const lo = uE0 + E + 11, hi = uB1 - B - 11 - G;
    const g0 = clamp(Math.round(lo + (hi - lo) * rng.float(0.3, 0.7)), lo, Math.max(lo, hi));
    gap = [g0, g0 + G];
  } else {
    while (E + B + 22 > uB1 - uE0 && (E > 14 || B > 12)) { if (E > 14) E--; if (B > 12) B--; }
  }
  const uE1 = uE0 + E, uB0 = uB1 - B;
  S.u = { uE0, uE1, uB0, uB1, gap };
  // engine room across the whole stern
  push(uE0, E, hz0, breadth, 'ss_engine', { deck: crashed ? 1.2 : 0 });
  // mid-ship sections (one, or two halves around the crash site)
  const mids = gap ? [[uE1, gap[0], 'stern'], [gap[1], uB0, 'bow']] : [[uE1, uB0, 'mid']];
  const spines = [];
  for (const [m0, m1, half] of mids) {
    const len = m1 - m0;
    const k = clamp(Math.round(len / rng.float(14, 20)), 1, Math.floor(len / 11));
    const cuts = [m0];
    for (let q = 1; q < k; q++) cuts.push(Math.round(m0 + (len * q) / k + rng.int(-2, 2)));
    cuts.push(m1);
    for (let q = 0; q < k; q++) {
      const n = push(cuts[q], cuts[q + 1] - cuts[q], sz0, SP, 'ss_spine', { half });
      spines.push(n);
    }
  }
  // decks: flat freighter; the crashed hull sits 1.2 above the ground, its
  // bow half rising section by section toward the nose
  const bowSpines = spines.filter((n) => n.half === 'bow').sort((a, b) => a.u0 - b.u0);
  for (const n of spines) n.deck = crashed ? 1.2 : 0;
  bowSpines.forEach((n, q) => { n.deck = 1.2 + 0.6 * (q + 1); });
  const deckAt = (u) => {
    if (!crashed || !gap || u < gap[1]) return crashed ? 1.2 : 0;
    let best = bowSpines[0];
    for (const n of bowSpines) if (u >= n.u0) best = n;
    return best ? best.deck : 1.2;
  };
  // the bridge at the bow, narrower than the hull (the bow tapers)
  const Bz = clamp(Math.round(breadth * rng.float(0.42, 0.56)), 15, breadth);
  const bz0 = clamp(Math.round((sz0 + sz1) / 2 - Bz / 2), hz0, hz1 - Bz), bz1 = bz0 + Bz;
  const bowDeck = bowSpines.length ? bowSpines[bowSpines.length - 1].deck : deckAt(uB0);
  push(uB0, B, bz0, Bz, 'ss_bridge', { deck: bowDeck });
  // rooms beside the bridge where the hull is wide enough (shorter: the taper)
  const taper = rng.int(3, 5);
  const bands = [];
  for (const [z0, z1] of [[hz0, bz0], [bz1, hz1]]) {
    if (z1 - z0 >= 10 && B - taper >= 10) bands.push({ u0: uB0, len: B - taper, z0, h: z1 - z0, inner: z0 === hz0 ? 'hi' : 'lo', bow: true });
  }
  // side bands along the mid sections, split into bays
  for (const [m0, m1] of mids) {
    bands.push({ u0: m0, len: m1 - m0, z0: hz0, h: sz0 - hz0, inner: 'hi' });
    bands.push({ u0: m0, len: m1 - m0, z0: sz1, h: hz1 - sz1, inner: 'lo' });
  }
  const side = [];
  for (const b of bands) {
    for (const [u, len] of bays(rng, b.u0, b.len, b.bow ? b.len : 22)) {
      const deck = deckAt(u + len / 2);
      // deep bands: an inner row on the spine and an outer row on the hull
      if (b.h >= 22 && rng.chance(len >= 17 ? 0.45 : 0.75)) {
        const hi = rng.int(10, b.h - 10);
        const inZ0 = b.inner === 'hi' ? b.z0 + b.h - hi : b.z0, outZ0 = b.inner === 'hi' ? b.z0 : b.z0 + hi;
        side.push(push(u, len, inZ0, hi, null, { deck, edge: false, half: u < (gap ? gap[0] : 0) ? 'stern' : 'bow' }));
        side.push(push(u, len, outZ0, b.h - hi, null, { deck, edge: true }));
      } else side.push(push(u, len, b.z0, b.h, null, { deck, edge: true }));
    }
  }
  if (gap) push(gap[0], gap[1] - gap[0], Z0, Z1 - Z0, 'ss_crash', { deck: 0 });
  // ---- room kinds
  const rw = (n) => n.w - 2, rh = (n) => n.h - 2;
  const can = (n, k) => NEED[k] && NEED[k](rw(n), rh(n), !!n.edge);
  const count = {};
  const take = (n, k) => { n.kind = k; count[k] = (count[k] || 0) + 1; };
  // the docking airlock (freighter start): a hull-side bay near mid-ship
  if (!crashed) {
    const mid = (uE1 + uB0) / 2;
    const cand = side.filter((n) => n.edge && rw(n) * rh(n) <= 260).sort((a, b) => Math.abs(a.u0 + a.len / 2 - mid) - Math.abs(b.u0 + b.len / 2 - mid));
    take(cand[0] || side.slice().sort((a, b) => a.w * a.h - b.w * b.h)[0], 'ss_dock');
  }
  const force = (globalThis.__SHIPFORCE || '').split(',').filter(Boolean);
  // cargo holds: the biggest full bays
  const nCargo = rng.int(C.cargo[0], C.cargo[1]);
  const big = side.filter((n) => !n.kind && can(n, 'ss_cargo')).sort((a, b) => b.w * b.h - a.w * a.h);
  for (const n of big) { if ((count.ss_cargo || 0) >= nCargo) break; take(n, 'ss_cargo'); }
  // a shuttle hangar on the hull
  if (rng.chance(C.hangar) || force.includes('ss_hangar')) {
    const hn = side.filter((n) => !n.kind && can(n, 'ss_hangar')).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (hn) take(hn, 'ss_hangar');
  }
  // the rest by weight; kinds not used yet are favoured
  for (const n of rng.shuffle(side.filter((q) => !q.kind))) {
    const opts = [];
    for (const [k, w] of Object.entries(C.rooms)) {
      if ((count[k] || 0) >= (CAP[k] ?? 99) || !can(n, k)) continue;
      opts.push([k, (force.includes(k) ? 1e3 : w) / (1 + 1.2 * (count[k] || 0))]);
    }
    if (!opts.length) opts.push(['ss_storage', 1]);
    take(n, rng.weighted(opts, (o) => o[1])[0]);
  }
  // the boss waits in the engine room or on the bridge
  S.bossKind = rng.chance(C.bossEngine) ? 'ss_engine' : 'ss_bridge';
  for (const n of leaves) { S.leaves.push(n); add(n, false); }
}

// split [u0, u0 + len) into bays of 11..maxL cells (one bay when short)
function bays(rng, u0, len, maxL) {
  const out = [];
  let u = u0, rest = len;
  while (rest > 0) {
    if (rest < 22 || rest <= maxL) { out.push([u, rest]); break; }
    const L = rng.int(11, Math.min(maxL, rest - 11));
    out.push([u, L]); u += L; rest -= L;
  }
  return out;
}

export { DIR_X, DIR_Z, OPP, SKY_H, F, FACE };
