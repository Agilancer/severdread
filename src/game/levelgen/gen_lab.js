// "Lab" archetype: research facilities and hospitals. A sealed complex laid out
// around a central multi-storey core (gen_arch.js with a custom partition: the
// core leaf sits in the middle and pinwheel wings around it are split by a
// finer BSP into big halls, medium labs and small service rooms). The core is
// the theme's signature space - the bio lab's containment well under a giant
// specimen tank, the hospital's skylit atrium over a collapsed, flooded
// basement - ringed by a walkway with galleries up stairs and railed bridges
// over the well. The wings hold purpose-built rooms (lab_rooms.js,
// lab_extra.js): reception lobby, decontamination airlocks, wet labs, clean
// rooms with observation galleries, specimen halls over bio-hazard sumps, cold
// stores with walk-in freezers, server rooms, isolation cells, a skylit
// hydroponics greenhouse, waste processing, flooded pump rooms, offices and
// security stations; wards, an operating theatre with a viewing gallery,
// radiology, a cafeteria, pharmacies and a morgue in the hospital. Passages
// between rooms are dressed as airlocks (steel jambs, parked sliding glass
// leaves, light strips, hazard lines), height changes are real stair flights
// with hand rails, keyed gates are gen_arch's 3-wide doorways.
//
// Dev hooks (tests / screenshots): globalThis.__LABFORCE = 'decon,office'
// favours room kinds, globalThis.__LABSTAT (an array) collects template
// fallbacks.
import { TS, F, clamp } from './common.js';
import { FACE } from './deco.js';
import { genArch, TEMPLATES } from './gen_arch.js';
import { LT } from './lab_rooms.js';
import { LX, dressRoom } from './lab_extra.js';

// register the lab templates (wing rooms get a dressing pass of loose props)
for (const [k, fn] of Object.entries({ ...LT, ...LX })) {
  if (TEMPLATES[k]) continue;
  TEMPLATES[k] = k === 'lab_core' || k === 'lab_arena' ? fn : (ctx) => { fn(ctx); dressRoom(ctx); };
}

// per-theme setup
const LAB = {
  bio_lab: {
    sig: 'lab_core', start: 'lab_lobby', arena: 'lab_arena',
    style: { family: 'lab', lights: 'panel', wain: 1.1, crown: true, pillars: 'square', hazards: ['poison', 'poison', 'water'], outdoor: 0 },
    rooms: { wetlab: 3.0, cleanroom: 2.2, specimen: 2.4, decon: 1.6, isolation: 1.6, hydroponics: 1.3, coldstore: 1.2, servers: 1.2, waste: 1.0, flooded: 0.9, supply: 0.9, office: 1.0, security: 1.0 },
    grateRooms: ['servers', 'flooded', 'waste', 'hydroponics', 'coldstore'],
  },
  abandoned_hospital: {
    sig: 'lab_core', start: 'lab_lobby', arena: 'lab_arena',
    style: { family: 'lab', lights: 'panel', wain: 1.2, crown: false, pillars: 'square', hazards: ['water', 'poison', 'spikes'], outdoor: 0.12 },
    rooms: { ward: 3.2, theatre: 2.2, isolation: 1.4, radiology: 1.3, cafeteria: 1.3, morgue: 1.4, supply: 1.2, flooded: 1.1, wetlab: 1.0, office: 1.0, courtyard: 0.9, coldstore: 0.7, security: 0.5, servers: 0.4 },
  },
};
// minimum (and maximum) room sizes per template (rooms are leaves - 2)
const NEED = {
  wetlab: (r) => r.w >= 8 && r.h >= 8,
  cleanroom: (r) => r.w >= 12 && r.h >= 12,
  specimen: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 11,
  decon: (r) => Math.min(r.w, r.h) >= 6 && Math.max(r.w, r.h) >= 8 && Math.max(r.w, r.h) <= 16 && r.area <= 200,
  coldstore: (r) => r.area <= 260,
  servers: (r) => r.w >= 8 && r.h >= 8 && r.area <= 320,
  flooded: (r) => r.w >= 10 && r.h >= 10,
  ward: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 10,
  theatre: (r) => r.w >= 11 && r.h >= 11,
  morgue: (r) => r.area <= 260,
  courtyard: (r) => r.area >= 120,
  isolation: (r) => Math.min(r.w, r.h) >= 7 && Math.max(r.w, r.h) >= 9,
  hydroponics: (r) => r.w >= 9 && r.h >= 9,
  office: (r) => r.w >= 7 && r.h >= 7,
  security: (r) => r.w >= 7 && r.h >= 7 && r.area <= 260,
  waste: (r) => r.w >= 8 && r.h >= 8,
  cafeteria: (r) => r.w >= 9 && r.h >= 9,
  radiology: (r) => Math.min(r.w, r.h) >= 7 && Math.max(r.w, r.h) >= 10,
  supply: () => true,
};
const CEIL = {
  lab_core: [13, 14, 15], lab_lobby: [5, 6], lab_arena: [9, 10, 11],
  decon: [4.5, 5], wetlab: [4.5, 5, 5.5], cleanroom: [8, 8.5], specimen: [6.5, 7, 8], coldstore: [4, 4.5], servers: [4, 4.5],
  flooded: [5.5, 6.5], ward: [4.5, 5], theatre: [7, 7.5], morgue: [4, 4.5], supply: [4.5, 5],
  isolation: [4.5, 5], hydroponics: [7, 8], office: [4, 4.5], security: [4.5, 5], waste: [5.5, 6.5], cafeteria: [4.5, 5], radiology: [4.5, 5],
};
// at most this many rooms of a kind per level (a complex has one server room,
// one morgue...); unlisted kinds are unlimited
const CAP = {
  servers: 1, coldstore: 1, morgue: 1, theatre: 1, cleanroom: 1, flooded: 1, decon: 2, supply: 2, courtyard: 1, specimen: 2, wetlab: 3, ward: 3,
  isolation: 1, hydroponics: 1, office: 2, security: 1, waste: 1, cafeteria: 1, radiology: 1,
};

export function genLab(rng, theme, depth) {
  const C = LAB[theme.id] || LAB.bio_lab;
  const count = {};
  const L = genArch(rng, theme, depth, {
    scale: 1.08,
    style: C.style,
    layout: coreLayout,
    forceBig: C.sig,
    arenaTemplate: C.arena,
    startTemplate: () => C.start,
    ceilH: CEIL,
    skyTemplates: ['hydroponics'],
    // bio lab FLOOR2 is grating: only plant / service rooms get it, the rest tile
    floorSlot: (r, fs) => (C.grateRooms ? (C.grateRooms.includes(r.template) ? TS.FLOOR2 : TS.FLOOR) : fs),
    doorChance: 0.1,
    connWidths: [3, 3, 4, 4, 5],
    // the core keeps its floor for the well: fewer loops into it, flights in the wings
    loopChance: (A, B) => (A.leaf.big || B.leaf.big ? 0.22 : 0.42),
    noFlight: (r) => !!r.leaf.big,
    roomOpts: (r) => {
      if (r.leaf.big) return [['plain', 1]];          // the core: replaced by the signature template
      const out = [];
      for (const [k, w] of Object.entries(C.rooms)) {
        if ((count[k] || 0) >= (CAP[k] ?? 99)) continue;
        if (!NEED[k] || NEED[k](r)) out.push([k, w / (1 + (count[k] || 0))]);
      }
      if (!out.length) out.push(['supply', 1]);
      // dev hook (screenshots / tests): globalThis.__LABFORCE = 'decon' favours one kind
      for (const force of (globalThis.__LABFORCE || '').split(',').filter(Boolean)) {
        if (!C.rooms[force] || (NEED[force] && !NEED[force](r))) continue;
        const o = out.find((q) => q[0] === force);
        if (o) o[1] = 1e3; else out.push([force, 1e3]);
      }
      const pick = rng.weighted(out, (o) => o[1])[0];
      count[pick] = (count[pick] || 0) + 1;
      r.labKind = pick;
      return [[pick, 1]];
    },
  });
  dressPassages(L, theme, rng);
  if (globalThis.__LABSTAT) for (const r of L.rooms) if (r.template === 'plain') globalThis.__LABSTAT.push(['plain', r.labKind || (r.signature ? C.sig : '?')]);
  return L;
}

// central core leaf + pinwheel wings. The wings are split by our own BSP
// (leaves down to 10 cells, rooms 8+): a mix of a few big halls, medium labs
// and small service rooms (cold stores, server rooms, offices, airlocks)
function coreLayout({ W, H, rng, minLeaf, add }) {
  const x0 = 1, z0 = 1, x1 = W - 1, z1 = H - 1;
  const iw = x1 - x0, ih = z1 - z0;
  // the core must leave a wing of at least minLeaf on every side
  const cw = clamp(Math.round(iw * rng.float(0.36, 0.44)), 20, Math.min(34, iw - 2 * minLeaf));
  const ch = clamp(Math.round(ih * rng.float(0.38, 0.48)), 18, Math.min(30, ih - 2 * minLeaf));
  const cx0 = clamp(x0 + Math.round((iw - cw) / 2) + rng.int(-2, 2), x0 + minLeaf, x1 - minLeaf - cw);
  const cz0 = clamp(z0 + Math.round((ih - ch) / 2) + rng.int(-2, 2), z0 + minLeaf, z1 - minLeaf - ch);
  const cx1 = cx0 + cw, cz1 = cz0 + ch;
  add({ x: cx0, z: cz0, w: cw, h: ch }, true);
  const cwise = rng.chance(0.5);
  const wings = cwise ? [
    { x: x0, z: z0, w: cx1 - x0, h: cz0 - z0 },      // north (to the core's east edge)
    { x: cx1, z: z0, w: x1 - cx1, h: cz1 - z0 },     // east
    { x: cx0, z: cz1, w: x1 - cx0, h: z1 - cz1 },    // south
    { x: x0, z: cz0, w: cx0 - x0, h: z1 - cz0 },     // west
  ] : [
    { x: cx0, z: z0, w: x1 - cx0, h: cz0 - z0 },
    { x: cx1, z: cz0, w: x1 - cx1, h: z1 - cz0 },
    { x: x0, z: cz1, w: cx1 - x0, h: z1 - cz1 },
    { x: x0, z: z0, w: cx0 - x0, h: cz1 - z0 },
  ];
  const MIN = 10;
  const splitWing = (n, d) => {
    const area = n.w * n.h;
    const canH = n.w >= MIN * 2, canV = n.h >= MIN * 2;
    const roll = rng.next();
    const stop = (!canH && !canV) || area <= 210 || (area <= 340 && roll < 0.45) || (area <= 520 && d >= 1 && roll < 0.16);
    if (stop) { add(n); return; }
    const horiz = canH && (!canV || n.w > n.h * 1.2 || (n.h <= n.w * 1.2 && rng.chance(0.5)));
    if (horiz) {
      const cut = rng.int(Math.max(MIN, Math.floor(n.w * 0.3)), Math.min(n.w - MIN, Math.ceil(n.w * 0.7)));
      splitWing({ x: n.x, z: n.z, w: cut, h: n.h }, d + 1); splitWing({ x: n.x + cut, z: n.z, w: n.w - cut, h: n.h }, d + 1);
    } else {
      const cut = rng.int(Math.max(MIN, Math.floor(n.h * 0.3)), Math.min(n.h - MIN, Math.ceil(n.h * 0.7)));
      splitWing({ x: n.x, z: n.z, w: n.w, h: cut }, d + 1); splitWing({ x: n.x, z: n.z + cut, w: n.w, h: n.h - cut }, d + 1);
    }
  };
  for (const wg of wings) splitWing(wg, 0);
}

// Passages between rooms become airlocks: steel door frames on both mouths,
// sliding glass leaves parked against the wall beside the opening, a light
// strip under the lintel and hazard lines on the floor. Keyed gates are left
// plain (their door gets its own frame).
function dressPassages(L, theme, rng) {
  const { grid: g, deco } = L;
  void theme; void rng;
  for (const c of L.conns || []) {
    if (c.mode === 'skip' || c.door || c.width < 2) continue;
    const ax = c.axis === 'x';
    const a0 = c.pos, a1 = c.pos + c.width;
    // the two passage cells along the travel axis are c.line - 1 and c.line
    const cellAt = (t, a) => (ax ? g.idx(t, a) : g.idx(a, t));
    const i0 = cellAt(c.line - 1, a0), i1 = cellAt(c.line, a0);
    if (!g.type[i0] || !g.type[i1]) continue;
    const f0 = g.floor[i0], f1 = g.floor[i1];
    const top = Math.min(g.ceil[i0], g.ceil[i1]);
    const flat = Math.abs(f0 - f1) < 0.01 && !(g.flags[i0] & F.STAIR) && !(g.flags[i1] & F.STAIR);
    // light strip under the passage ceiling along the travel axis
    const lo = Math.max(f0, f1);
    if (top - lo > 2.4) {
      const m = (a0 + a1) / 2;
      if (ax) deco.box(c.line - 1 + 0.2, top - 0.05, m - 0.12, c.line + 1 - 0.2, top, m + 0.12, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
      else deco.box(m - 0.12, top - 0.05, c.line - 1 + 0.2, m + 0.12, top, c.line + 1 - 0.2, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
      deco.light(ax ? c.line : m, top - 0.6, ax ? m : c.line, [0.85, 0.95, 1], 4.5);
    }
    if (!flat) continue;
    // hazard lines across both mouths
    for (const t of [c.line - 1 + 0.06, c.line + 1 - 0.2]) {
      if (ax) deco.box(t, f0 + 0.004, a0 + 0.05, t + 0.14, f0 + 0.018, a1 - 0.05, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
      else deco.box(a0 + 0.05, f0 + 0.004, t, a1 - 0.05, f0 + 0.018, t + 0.14, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    }
    // parked glass leaves on the room faces beside each mouth
    const h = Math.min(top - f0 - 0.2, 2.6);
    for (const [face, sgn] of [[c.line - 1, -1], [c.line + 1, 1]]) {
      for (const [p0, p1] of [[a0 - 0.9, a0 - 0.05], [a1 + 0.05, a1 + 0.9]]) {
        // only on a solid wall stretch
        const wa = Math.floor(p0 + 0.45);
        const wc = ax ? g.idx(face + (sgn < 0 ? 0 : -1), wa) : g.idx(wa, face + (sgn < 0 ? 0 : -1));
        if (wc < 0 || g.type[wc]) continue;
        const d = sgn < 0 ? -0.06 : 0.06;
        if (ax) deco.box(Math.min(face, face + d), f0 + 0.05, p0, Math.max(face, face + d), f0 + h, p1, TS.GLASS, { uv: 'fit', emissive: 0.25 });
        else deco.box(p0, f0 + 0.05, Math.min(face, face + d), p1, f0 + h, Math.max(face, face + d), TS.GLASS, { uv: 'fit', emissive: 0.25 });
      }
    }
  }
}
