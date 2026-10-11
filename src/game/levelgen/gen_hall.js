// Huge halls: concert hall, movie theater, mosh pit, department store, neon
// arcade, carnival, flesh cathedral. Built on the architect generator
// (gen_arch.js): the biggest room becomes the theme's signature space
// (auditorium with raked seating, mosh pit + stage, store with a mezzanine,
// arcade floor, fairground with a big top, cathedral nave) and the other rooms
// are lobbies, backstage areas, bars, shops, crypts, sideshow tents, pits with
// bridges and courtyards, all joined by wide openings (1-wide doorways only
// where a keyed gate sits) and real stair flights with hand rails.
import { TS, F } from './common.js';
import { genArch, TEMPLATES } from './gen_arch.js';
import { HT } from './hall_templates.js';

// register the hall templates with the architect generator
for (const [k, fn] of Object.entries(HT)) if (!TEMPLATES[k]) TEMPLATES[k] = fn;

// per-theme setup: signature template, style overrides for gen_arch, other room mix
const HALL = {
  concert_hall: {
    sig: 'auditorium', start: 'foyer',
    style: { family: 'domestic', lights: 'sconce', wain: 1.1, crown: true, pillars: 'column', hazards: ['spikes', 'lava', 'spikes'], outdoor: 0.15 },
    rooms: { foyer: 2.2, backstage: 2.6, bar: 1.4, storage: 0.8, pitroom: 2.2, split: 1.8, atrium: 1.8, hall: 1.2, courtyard: 0.8 },
  },
  movie_theater: {
    sig: 'auditorium', start: 'foyer',
    style: { family: 'domestic', lights: 'sconce', wain: 0.9, crown: true, pillars: 'column', hazards: ['spikes', 'poison'], outdoor: 0 },
    rooms: { auditorium: 2.4, bar: 2.0, foyer: 1.2, backstage: 1.2, storage: 0.8, pitroom: 2.0, split: 1.6, atrium: 1.2 },
  },
  mosh_pit: {
    sig: 'moshpit', start: 'foyer',
    style: { family: 'industrial', lights: 'hanging', wain: 0, crown: false, pillars: 'girder', hazards: ['spikes', 'lava', 'poison'], outdoor: 0.2 },
    rooms: { bar: 2.4, backstage: 2.4, storage: 1.4, industrial: 1.2, pitroom: 2.6, split: 1.8, courtyard: 1.0, hall: 0.8 },
  },
  department_store: {
    sig: 'store', start: 'foyer',
    style: { family: 'domestic', lights: 'panel', wain: 0, crown: false, pillars: 'square', hazards: ['spikes', 'water', 'poison'], outdoor: 0.15 },
    rooms: { boutique: 3.0, storage: 2.0, foyer: 0.8, atrium: 2.2, split: 1.8, pitroom: 1.6, courtyard: 0.9, bar: 1.0 },
  },
  flesh_cathedral: {
    sig: 'cathedral', start: 'foyer',
    style: {},
    rooms: { chapel: 2.6, crypt: 2.6, pitroom: 2.6, courtyard: 1.4, hall: 1.2, split: 1.4, pools: 1.0, atrium: 1.0 },
  },
  neon_arcade: {
    sig: 'arcade', start: 'foyer',
    style: { family: 'tech', lights: 'panel', wain: 0, crown: false, pillars: 'square', hazards: ['poison', 'spikes', 'lava'], outdoor: 0 },
    rooms: { arcade: 2.6, bar: 1.6, backstage: 0.8, control: 1.0, pitroom: 2.2, split: 2.0, atrium: 1.2, storage: 0.8 },
  },
  carnival: {
    sig: 'carnival', start: 'midway',
    style: { family: 'domestic', lights: 'hanging', wain: 0, crown: false, pillars: 'column', hazards: ['spikes', 'lava', 'water'], outdoor: 0.5 },
    rooms: { midway: 2.6, sideshow: 2.6, pitroom: 1.8, courtyard: 1.0, storage: 1.0, split: 1.4, bar: 0.8 },
  },
};
// minimum room sizes for the hall templates (generic ones keep gen_arch's own rules)
const NEED = {
  auditorium: (r) => Math.min(r.w, r.h) >= 12 && Math.max(r.w, r.h) >= 16,
  arcade: (r) => r.w >= 9 && r.h >= 9,
  midway: (r) => r.area >= 90,
  sideshow: (r) => r.w >= 8 && r.h >= 8,
  crypt: (r) => r.w >= 7 && r.h >= 7,
  boutique: (r) => r.w >= 7 && r.h >= 7,
  backstage: () => true, bar: (r) => r.w >= 7 && r.h >= 7, foyer: () => true,
};
const CEIL = {
  auditorium: [10, 11, 12], moshpit: [9, 10, 11], store: [8, 9, 10], arcade: [7, 8], carnival: [12], cathedral: [13, 14, 16],
  foyer: [5, 6, 7], backstage: [4.5, 5, 6], bar: [4.5, 5], boutique: [4.5, 5, 6], crypt: [4, 4.5], midway: [12], sideshow: [6, 7], hall_arena: [9, 10, 12],
};

export function genHall(rng, theme, depth) {
  const H = HALL[theme.id] || HALL.concert_hall;
  const L = genArch(rng, theme, depth, {
    scale: 1.08,
    style: H.style,
    forceBig: H.sig,
    bigLeaf: { minW: 22, minH: 19, maxW: 38, maxH: 34 },
    arenaTemplate: 'hall_arena',
    startTemplate: () => H.start,
    ceilH: CEIL,
    skyTemplates: ['carnival', 'midway'],
    doorChance: 0.08,
    connWidths: [3, 3, 4, 4, 5],
    roomOpts: (r, base) => {
      const keep = new Map(base.map(([k, w]) => [k, w]));
      const out = [];
      for (const [k, w] of Object.entries(H.rooms)) {
        if (NEED[k]) { if (NEED[k](r)) out.push([k, w]); }
        else if (keep.has(k)) out.push([k, w]);
        else if (k === 'industrial' || k === 'control' || k === 'storage') out.push([k, w * 0.6]);
      }
      return out.length ? out : [['storage', 1]];
    },
  });
  finishHall(L, theme);
  return L;
}

// theme-level texture fixes that need the finished grid
function finishHall(L, theme) {
  const g = L.grid;
  // the mosh pit's WALL2 / ACCENT is speaker cloth: plain rooms get the main wall
  if (theme.id === 'mosh_pit') {
    for (const r of L.rooms) {
      if (r.template === 'moshpit' || r.template === 'backstage') continue;
      for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (!g.in(x, z)) continue;
        const i = g.idx(x, z);
        if (!g.type[i] && g.wallTex[i] === TS.WALL2) g.wallTex[i] = TS.WALL;
      }
    }
  }
  // caps of walls seen from open-air rooms use the roof role, not the floor texture
  for (let i = 0; i < g.w * g.h; i++) {
    if (g.type[i] || g.floorTex[i] !== TS.FLOOR) continue;
    const x = i % g.w, z = (i / g.w) | 0;
    let nearSky = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (g.in(nx, nz) && g.type[g.idx(nx, nz)] && g.sky[g.idx(nx, nz)]) nearSky = true;
    }
    if (nearSky) g.floorTex[i] = theme.id === 'carnival' ? TS.WOOD : TS.ROOF;
  }
  void F;
}
