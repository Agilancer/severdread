// "Lab" archetype: research facilities and hospitals. A sealed complex laid out
// around a central multi-storey core (gen_arch.js with a custom partition: the
// core leaf sits in the middle and pinwheel wings around it are BSP-split
// into rooms). The core is the theme's signature space - the bio lab's
// containment well under a giant specimen tank, the hospital's skylit atrium
// over a collapsed, flooded basement - and the wings hold purpose-built rooms
// (lab_rooms.js): reception lobby, decontamination chamber, wet labs, clean
// rooms with observation galleries, specimen halls, cold storage, server
// rooms, a flooded pump room; wards, an operating theatre with a viewing
// gallery and a morgue in the hospital. Passages between rooms are dressed as
// airlocks (sliding glass leaves, light strips, hazard lines) and height
// changes are real stair flights with hand rails.
import { TS, F, clamp } from './common.js';
import { FACE } from './deco.js';
import { genArch, TEMPLATES } from './gen_arch.js';
import { LT } from './lab_rooms.js';

for (const [k, fn] of Object.entries(LT)) if (!TEMPLATES[k]) TEMPLATES[k] = fn;

// per-theme setup
const LAB = {
  bio_lab: {
    sig: 'lab_core', start: 'lab_lobby', arena: 'lab_arena',
    style: { family: 'lab', lights: 'panel', wain: 1.1, crown: true, pillars: 'square', hazards: ['poison', 'poison', 'water'], outdoor: 0 },
    rooms: { wetlab: 3.0, cleanroom: 2.4, specimen: 2.6, decon: 1.6, coldstore: 1.4, servers: 1.4, flooded: 1.0, supply: 0.8, control: 0.8, split: 0.6 },
  },
  abandoned_hospital: {
    sig: 'lab_core', start: 'lab_lobby', arena: 'lab_arena',
    style: { family: 'lab', lights: 'panel', wain: 1.2, crown: false, pillars: 'square', hazards: ['water', 'poison', 'spikes'], outdoor: 0.12 },
    rooms: { ward: 3.2, theatre: 2.2, morgue: 1.6, wetlab: 1.2, supply: 1.2, flooded: 1.2, coldstore: 0.6, servers: 0.4, courtyard: 0.9, control: 0.6, split: 0.6 },
  },
};
// minimum room sizes per template (rooms are leaves - 2)
const NEED = {
  wetlab: (r) => r.w >= 8 && r.h >= 8,
  cleanroom: (r) => r.w >= 12 && r.h >= 12,
  specimen: (r) => Math.min(r.w, r.h) >= 9 && Math.max(r.w, r.h) >= 11,
  decon: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 10,
  coldstore: (r) => r.area <= 260,
  servers: (r) => r.w >= 8 && r.h >= 8 && r.area <= 320,
  flooded: (r) => r.w >= 10 && r.h >= 10,
  ward: (r) => Math.min(r.w, r.h) >= 8 && Math.max(r.w, r.h) >= 10,
  theatre: (r) => r.w >= 11 && r.h >= 11,
  morgue: (r) => r.area <= 260,
  courtyard: (r) => r.area >= 120,
  supply: () => true, control: () => true, split: (r) => r.w >= 12 || r.h >= 12,
};
const CEIL = {
  lab_core: [13, 14, 15], lab_lobby: [5, 6], lab_arena: [9, 10, 11],
  decon: [4.5, 5], wetlab: [4.5, 5, 5.5], cleanroom: [8, 8.5], specimen: [6.5, 7, 8], coldstore: [4, 4.5], servers: [4, 4.5],
  flooded: [5.5, 6.5], ward: [4.5, 5], theatre: [7, 7.5], morgue: [4, 4.5], supply: [4.5, 5],
};

export function genLab(rng, theme, depth) {
  const C = LAB[theme.id] || LAB.bio_lab;
  const L = genArch(rng, theme, depth, {
    scale: 1.08,
    style: C.style,
    layout: coreLayout,
    forceBig: C.sig,
    arenaTemplate: C.arena,
    startTemplate: () => C.start,
    ceilH: CEIL,
    doorChance: 0.1,
    connWidths: [3, 3, 4, 4, 5],
    roomOpts: (r) => {
      const out = [];
      for (const [k, w] of Object.entries(C.rooms)) if (!NEED[k] || NEED[k](r)) out.push([k, w]);
      return out.length ? out : [['supply', 1]];
    },
  });
  dressPassages(L, theme, rng);
  return L;
}

// central core leaf + pinwheel wings (each BSP-split by genArch's splitter)
function coreLayout({ W, H, rng, minLeaf, split, add }) {
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
  for (const wg of wings) split(wg, 2);
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
