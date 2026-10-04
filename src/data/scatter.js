// Scatter terrain: pillars, explosive barrels / props, chests, pedestals,
// spike traps and computer terminals cut from the uploaded scatter sheets
// (tools/art_config.json scatter_* entries -> manifest `scatterSets`, one
// atlas per sheet with per-object frame rects and a style tag).
//
// This file decides which styles fit which level theme, how big each object
// is in the world and the gameplay numbers (explosions, trap timing, pedestal
// loot). Everything here is pure data / pure functions so the level generator
// and node tests can use it without the art.
import { monsterHpMult, monsterDmgMult } from './balance.js';
import { THEME_FAMILY } from './texroles.js';

// ---------------------------------------------------------------- theme -> styles
// Object styles (tools/art_config.json objectTags, first word):
//   pillars   gothic crypt stone marble gold hell lava flesh bone occult iron
//             rust industrial tech crystal ice rock moss
//   pedestals the same + sandstone
//   spikes    metal rust wood moss bone flesh hell lava gold gothic tech arcane
//             ice poison
//   explosives industrial (barrels, canisters, tanks, generators...), tech
//             (consoles, servers, energy cells), rust (scrap), gothic (lanterns)
//   chests    skull (dark skull / flesh chests) | tech (light-strip chests)
//   terminals tech (grey sci-fi metal), lab (beige / white lab + medical),
//             military (olive), rust, brass, industrial (yellow hazard, valves),
//             cyber (holograms), alien (purple organic), dark (dark red, hellish)
// `explosiveTags` narrows the explosive pool to objects with one of the tags
// (e.g. lanterns only in castles); `elements` to explosion elements.
// `terminal` / `terminalWall`: styles of the free-standing consoles and the
// wall-mounted panels; `term` scales how many a level gets (0 = none: no
// computers in castles, caves, canyons or heaven).
export const FAMILY_SCATTER = {
  station: { pillar: ['tech'], pedestal: ['tech'], spike: ['metal', 'tech'], explosive: ['tech', 'industrial'], chest: 'tech', density: 1, terminal: ['tech'], terminalWall: ['tech'], term: 1 },
  industrial: { pillar: ['industrial', 'rust', 'iron', 'tech'], pedestal: ['industrial', 'iron', 'rust', 'tech'], spike: ['metal', 'rust'], explosive: ['industrial', 'rust'], chest: 'tech', density: 1.3, terminal: ['industrial', 'rust', 'tech'], terminalWall: ['industrial', 'rust', 'tech'], term: 0.7 },
  hell: { pillar: ['hell', 'lava', 'flesh', 'bone', 'occult', 'iron'], pedestal: ['hell', 'flesh'], spike: ['hell', 'flesh', 'bone', 'lava'], explosive: ['rust', 'industrial', 'gothic'], elements: ['fire'], chest: 'skull', density: 0.8, terminal: ['dark', 'alien'], terminalWall: ['alien', 'rust'], term: 0.15 },
  castle: { pillar: ['gothic', 'crypt', 'stone'], pedestal: ['gothic', 'crypt', 'gold'], spike: ['metal', 'wood', 'gothic', 'bone'], explosive: ['gothic'], chest: 'skull', density: 0.5, term: 0 },
  city: { pillar: ['stone', 'marble', 'industrial'], pedestal: ['stone', 'industrial', 'tech'], spike: ['metal', 'rust'], explosive: ['industrial'], chest: 'tech', density: 1.1, terminal: ['tech', 'lab'], terminalWall: ['tech', 'lab'], term: 0.35 },
  nature: { pillar: ['rock', 'moss'], pedestal: ['moss', 'crypt', 'stone'], spike: ['wood', 'moss', 'rust'], explosive: ['rust', 'gothic'], chest: 'skull', density: 0.6, term: 0 },
  ice: { pillar: ['ice', 'rock'], pedestal: ['tech', 'marble'], spike: ['metal', 'ice'], explosive: ['industrial', 'tech'], elements: ['ice', 'lightning'], chest: 'tech', chestHues: ['cyan', 'blue'], density: 0.8, term: 0 },
  desert: { pillar: ['stone', 'rock'], pedestal: ['sandstone', 'gold', 'stone'], spike: ['bone', 'wood'], explosive: ['rust', 'industrial'], chest: 'skull', density: 0.6, term: 0 },
  heaven: { pillar: ['marble', 'gold'], pedestal: ['gold', 'marble'], spike: ['gold', 'metal'], explosive: ['gothic'], chest: 'tech', chestHues: ['yellow', 'orange'], density: 0.4, term: 0 },
  cyber: { pillar: ['tech', 'crystal'], pedestal: ['tech'], spike: ['tech', 'arcane'], explosive: ['tech'], chest: 'tech', chestHues: ['cyan', 'purple', 'blue'], density: 1, terminal: ['cyber', 'tech'], terminalWall: ['tech', 'cyber'], term: 1 },
  organic: { pillar: ['flesh', 'bone'], pedestal: ['hell', 'moss', 'flesh'], spike: ['flesh', 'bone'], explosive: ['industrial', 'rust'], elements: ['poison', 'fire'], chest: 'skull', density: 0.8, terminal: ['alien', 'dark'], terminalWall: ['alien'], term: 0.2 },
};

// Theme specific choices, merged over the theme's family entry.
export const THEME_SCATTER = {
  possessed_station: { spike: ['metal', 'tech', 'hell'] },
  frozen_outpost: { pillar: ['ice', 'tech'] },
  arctic_rail: { pillar: ['ice', 'industrial'] },
  glacier_caves: { pillar: ['ice', 'rock'], spike: ['ice', 'metal'] },
  // natural outdoor levels: weathered rock only (the ice column has a metal frame)
  mountain_top: { pillar: ['rock', 'moss'] },
  mountain_climb: { pillar: ['rock', 'moss'] },
  canyon: { pillar: ['rock'] },
  canyon_bridges: { pillar: ['rock'] },
  crystal_caverns: { pillar: ['crystal', 'rock'], spike: ['arcane', 'wood'], pedestal: ['tech', 'moss'], chest: 'tech', chestHues: ['purple'] },
  caves: { pillar: ['rock', 'moss', 'crystal'] },
  asteroid_mines: { pillar: ['rock', 'industrial', 'crystal'] },
  volcano: { pillar: ['lava', 'rock'], spike: ['lava', 'hell'] },
  volcano_base: { pillar: ['industrial', 'lava', 'iron'] },
  flesh_cathedral: { pillar: ['flesh', 'bone', 'gothic', 'hell'], explosive: ['gothic'] },
  throne_of_bones: { pillar: ['bone', 'hell', 'occult'], spike: ['bone', 'hell'], explosive: ['gothic'] },
  infernal_foundry: { pillar: ['iron', 'lava', 'hell', 'rust'], explosive: ['rust', 'industrial'] },
  necropolis: { pillar: ['crypt', 'gothic'], pedestal: ['crypt', 'gothic'] },
  graveyard: { pillar: ['crypt', 'gothic', 'rock'], pedestal: ['crypt', 'moss'] },
  haunted_mansion: { pillar: ['gothic', 'marble', 'stone'] },
  clocktower: { pillar: ['gothic', 'iron', 'stone'], explosive: ['gothic', 'rust'] },
  sunken_temple: { pillar: ['moss', 'gold', 'crypt'], pedestal: ['gold', 'moss'] },
  jungle_ruins: { pillar: ['moss', 'rock', 'crypt'], pedestal: ['moss', 'crypt'] },
  ruined_village: { pillar: ['stone', 'rock', 'moss'] },
  deserted_ruins: { pillar: ['stone', 'gold', 'rock'] },
  sky_fortress: { pillar: ['marble', 'gold', 'stone'] },
  afterlife: { pillar: ['marble', 'crystal', 'crypt'], pedestal: ['marble', 'crypt', 'gold'], chest: 'skull' },
  dream_maze: { pillar: ['marble', 'gold', 'crystal'] },
  cyber_castle: { pillar: ['gothic', 'tech', 'crystal'], explosive: ['tech', 'gothic'] },
  clockwork_foundry: { pillar: ['rust', 'iron', 'industrial'] },
  meat_plant: { pillar: ['flesh', 'rust', 'industrial'], spike: ['flesh', 'metal'] },
  possessed_military: { pillar: ['industrial', 'hell'], spike: ['metal', 'hell'] },
  bio_lab: { elements: ['poison', 'fire', 'ice'] },
  // a hospital has no stone colonnades: plain service columns, fewer of them
  abandoned_hospital: { pillar: ['rust', 'industrial'], pedestal: ['tech', 'industrial'], density: 0.8 },
  toxic_swamp: { elements: ['poison'] },
  sewer_labyrinth: { elements: ['poison', 'fire'] },
  concert_hall: { pillar: ['marble', 'gold', 'stone'] },
  movie_theater: { pillar: ['marble', 'gold'] },
  department_store: { pillar: ['marble', 'stone'] },
  backrooms: { pillar: [], density: 0.3 },
  carnival: { pillar: ['gold', 'iron', 'rust'], explosive: ['rust', 'gothic'] },
};

// Computers per theme, merged over the family entry: what kind of place it is
// decides the consoles (labs and hospitals get medical / lab gear, military
// bases olive field kit, foundries and rigs hazard-yellow and rusty machines,
// a possessed station some hellish red ones) and how many.
const T_TECH = ['tech'], T_LAB = ['lab', 'tech'], T_MIL = ['military', 'tech'], T_IND = ['industrial', 'rust', 'tech'];
export const THEME_TERMINALS = {
  possessed_station: { terminal: ['tech', 'dark'], terminalWall: T_TECH },
  huge_station: { terminal: ['tech', 'cyber', 'military'], term: 1.1 },
  blackhole_observatory: { terminal: ['tech', 'cyber', 'lab'], terminalWall: T_LAB },
  orbital_elevator: { terminal: ['tech', 'cyber'], term: 0.6 },
  space_duel: { term: 0.5 },
  space_train: { term: 0.5 },
  mars_base: { terminal: ['tech', 'lab', 'industrial'], terminalWall: ['tech', 'lab', 'industrial'] },
  venus_base: { terminal: ['tech', 'industrial'], terminalWall: ['tech', 'industrial'] },
  lunar_colony: { terminal: T_LAB, terminalWall: T_LAB },
  frozen_outpost: { terminal: T_LAB, terminalWall: T_LAB, term: 0.8 },
  bio_lab: { terminal: T_LAB, terminalWall: T_LAB, term: 1.3 },
  crashed_starship: { terminal: ['tech', 'dark'], term: 0.8 },
  cave_base: { terminal: T_MIL, terminalWall: T_MIL, term: 0.8 },
  data_core: { terminal: ['tech', 'cyber'], terminalTags: ['server', 'stack', 'mainframe', 'tape', 'cabinet', 'desk', 'hologram', 'cylinder', 'energy'], term: 1.4 },
  digital_void: { term: 0.5 },
  neon_arcade: { term: 0.6 },
  cyber_traffic: { term: 0.35 },
  cyber_mountain: { terminal: ['tech', 'cyber'], term: 0.4 },
  space_freighter: { terminal: T_IND, term: 0.8 },
  large_freighter: { terminal: T_IND, term: 0.9 },
  volcano_base: { terminal: T_IND, terminalWall: T_IND, term: 1 },
  oil_rig: { terminal: T_IND, terminalWall: T_IND, term: 0.9 },
  asteroid_mines: { terminal: T_IND, terminalWall: T_IND, term: 0.6 },
  arctic_rail: { terminal: ['industrial', 'tech'], term: 0.5 },
  subway_trains: { terminal: ['tech', 'rust'], terminalWall: ['tech', 'rust'], term: 0.4 },
  semi_trucks: { terminal: ['rust', 'industrial'], term: 0.15 },
  sewer_labyrinth: { terminal: ['rust', 'industrial'], terminalWall: ['rust', 'industrial'], term: 0.25 },
  meat_plant: { terminal: ['industrial', 'rust'], terminalWall: ['industrial', 'rust'], term: 0.5 },
  mosh_pit: { terminal: ['rust'], terminalWall: ['rust'], term: 0.15 },
  clockwork_foundry: { terminal: ['brass', 'rust'], terminalWall: ['brass', 'rust'], term: 0.5 },
  prison_complex: { terminal: ['tech', 'military', 'rust'], terminalWall: ['tech', 'military'], term: 0.8 },
  military_base: { terminal: T_MIL, terminalWall: T_MIL, term: 1 },
  possessed_military: { terminal: ['military', 'tech', 'dark'], terminalWall: T_MIL, term: 0.9 },
  ruined_military: { terminal: ['military', 'rust'], terminalWall: ['military', 'rust'], term: 0.6 },
  // hell: a rare hellish / alien machine, none in natural or gothic hell
  volcano: { term: 0 }, flesh_cathedral: { term: 0 }, throne_of_bones: { term: 0 },
  infernal_foundry: { terminal: ['dark', 'rust', 'industrial'], terminalWall: ['rust', 'industrial'], term: 0.35 },
  // castles: a brass contraption in the clock tower, consoles in the cyber castle
  clocktower: { terminal: ['brass'], terminalWall: ['brass'], term: 0.12 },
  cyber_castle: { terminal: ['cyber', 'tech', 'dark'], terminalWall: ['tech', 'cyber'], term: 0.6 },
  // cities: sparse office / shop / hospital computers
  abandoned_hospital: { terminal: T_LAB, terminalWall: T_LAB, term: 0.9 },
  ruined_city: { terminal: ['rust', 'tech'], terminalWall: ['rust', 'tech'], term: 0.2 },
  ruined_town: { terminal: ['rust'], terminalWall: ['rust'], term: 0.12 },
  skyscraper_tops: { terminal: T_TECH, terminalWall: T_TECH, term: 0.25 },
  blood_harbor: { terminal: ['industrial', 'rust'], terminalWall: ['industrial', 'rust'], term: 0.3 },
  department_store: { terminal: T_TECH, terminalWall: T_TECH, term: 0.2 },
  subway_tunnels: { terminal: ['tech', 'rust'], terminalWall: ['tech', 'rust'], term: 0.35 },
  backrooms: { term: 0 }, movie_theater: { term: 0 }, carnival: { term: 0 },
  concert_hall: { terminal: T_TECH, terminalWall: T_TECH, term: 0.1 },
};

// Resolved scatter styles for a theme: family entry + theme overrides.
export function scatterStyle(theme) {
  const fam = theme?.family || (THEME_FAMILY[theme?.id] || 'station').split(' ')[0];
  const base = FAMILY_SCATTER[fam] || FAMILY_SCATTER.station;
  const over = THEME_SCATTER[theme?.id] || {}, term = THEME_TERMINALS[theme?.id] || {};
  const s = { family: fam, ...base, ...over, ...term };
  if (!s.terminal || !s.terminal.length) s.term = 0;
  if (!s.terminalWall) s.terminalWall = s.terminal;
  return s;
}

// ---------------------------------------------------------------- world sizes
// Heights in world units (player 1.6 tall, a cell is 1 x 1). Sprites keep the
// relative sizes of the art: the sheet's pixel heights map linearly into the
// range. Tall pillars that nearly reach a ceiling grow to touch it.
export const SIZE = {
  pillarTall: [2.6, 3.0],
  pillarStump: [1.1, 1.4],
  pedestal: [0.85, 1.1],
  chestClosed: [0.55, 0.8],
  explosive: [0.75, 1.2],      // intact height
  spikeWidth: 0.92,            // retracted plate width (fills most of a cell)
  explodeScale: 1.7,           // the fireball frame is drawn bigger than the object
  terminal: [1.0, 1.85],       // free-standing consoles: desk with chairs .. tall cabinet (kiosk ~1.7)
};
export const PILLAR_HALF = { tall: 0.42, stump: 0.38 };   // collider half size (smaller than the art)
export const EXPLOSIVE_HALF = 0.27;
export const PEDESTAL_HALF = 0.36;

// height of an object given its pixel height and the pixel range of its set
export function sizeFromPx(px, pxMin, pxMax, [lo, hi]) {
  if (!(pxMax > pxMin)) return (lo + hi) / 2;
  const t = Math.min(1, Math.max(0, (px - pxMin) / (pxMax - pxMin)));
  return lo + (hi - lo) * t;
}

// ---------------------------------------------------------------- picking art
// objects: manifest scatter objects of one kind; prefer the given styles (and
// filters), fall back to the whole kind. Stable for a seed.
export function pickScatterObject(objects, styles, seed, filter) {
  if (!objects || !objects.length) return null;
  const want = styles && styles.length ? new Set(styles) : null;
  let pool = objects.filter((o) => (!want || want.has(o.style)) && (!filter || filter(o)));
  if (!pool.length && filter) pool = objects.filter((o) => (!want || want.has(o.style)));
  if (!pool.length) pool = objects.filter((o) => !filter || filter(o));
  if (!pool.length) pool = objects;
  return pool[(seed >>> 0) % pool.length];
}

// ---------------------------------------------------------------- terminals
// Free-standing consoles keep the sheet's proportions (px height -> world
// height over SIZE.terminal). The slot a console stands in decides which art
// fits: 'narrow' (one cell, back to a wall: kiosks, racks, cabinets), 'wide'
// (two cells along a wall: desks, mainframes, consoles) and 'island' (alone
// in a big room: hologram tables, globes, cylinders, tanks).
export const TERM = {
  narrowW: 1.1, wideW: 2.0, islandW: 1.6,   // widest sprite per slot
  narrowFit: 1.25, wideFit: 1.3, islandFit: 1.9,   // natural width limits of the art that fits a slot
  gap: [0.36, 0.43],    // sprite plane distance from the wall behind it
  depth: 0.72,          // wall-backed collider: depth from the wall
  half: 0.36,           // island collider half size
  colH: 1.45,           // collider height until the art is known (Scatter.bind fits it to the sprite)
};
export const ISLAND_TAGS = ['hologram', 'globe', 'cylinder', 'tube', 'tank', 'table', 'starmap', 'plot', 'reactor', 'energy', 'tripod'];
// Wall panels lie flat on the wall plane, sized from the art (world units per
// sheet pixel) and mounted at console height: centre ~1.4, never below 0.6.
export const TERM_WALL = { scale: 0.0064, centre: 1.42, minBottom: 0.62, maxH: 0.92, cellW: 0.92, wideW: 1.12, off: 0.018, top: 2.0 };

// Terminal art: a listed style first (equal shares among the styles that have
// art fitting the slot), then an object of that style - a lab gets as many lab
// machines as generic tech ones although the sheets hold fewer. Stable per seed.
export function pickTerminal(objects, styles, seed, fits = () => true) {
  if (!objects || !objects.length) return null;
  const st = (styles || []).filter((s) => objects.some((o) => o.style === s && fits(o)));
  if (!st.length) return pickScatterObject(objects, styles, seed, fits);
  const s = st[(seed >>> 0) % st.length];
  const pool = objects.filter((o) => o.style === s && fits(o));
  return pool[(Math.imul(seed | 0, 0x9e3779b1) >>> 7) % pool.length];
}
// world size of a free-standing console's art in a slot, under a height limit
export function terminalSize(o, slot, range, maxH = 9) {
  let h = sizeFromPx(o.px, range[0], range[1], SIZE.terminal), w = h * (o.pxW / o.px);
  const maxW = slot === 'wide' ? TERM.wideW : slot === 'island' ? TERM.islandW : TERM.narrowW;
  if (w > maxW) { h *= maxW / w; w = maxW; }
  if (h > maxH) { w *= maxH / h; h = maxH; }
  return { w, h };
}
// does the art suit the slot (natural width; islands need a stand-alone shape)?
export function terminalFits(o, slot, range) {
  const h = sizeFromPx(o.px, range[0], range[1], SIZE.terminal), w = h * (o.pxW / o.px);
  if (slot === 'wide') return w >= TERM.wideFit;
  if (slot === 'island') return w <= TERM.islandFit && !!o.tags?.some((t) => ISLAND_TAGS.includes(t));
  return w <= TERM.narrowFit;
}
// world size of a wall panel: art scale, capped by the free wall width / height
export function wallTerminalSize(o, maxW, maxH = TERM_WALL.maxH) {
  let w = o.pxW * TERM_WALL.scale, h = o.px * TERM_WALL.scale;
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: w * k, h: h * k };
}

// ---------------------------------------------------------------- explosives
// Hit points and blast of an explosive on depth d. size: 1 barrel, lanterns
// are weaker, big generators / tanks a bit stronger.
export function explosiveStats(depth, o = {}) {
  const d = Math.max(1, depth);
  const k = o.tags?.includes('lantern') ? 0.7 : o.tags?.some((t) => t === 'tank' || t === 'generator' || t === 'bomb' || t === 'transformer') ? 1.25 : 1;
  return {
    hp: Math.round(14 * monsterHpMult(d)),
    radius: 2.7 * Math.sqrt(k),
    monsterDmg: 48 * monsterHpMult(d) * k,      // a standard monster dies in the core of the blast
    playerDmg: 20 * monsterDmgMult(d) * k,       // about two monster hits
  };
}
export const DAMAGED_AT = 0.5;            // damaged frame below 50% hp
export const CHAIN_DELAY = [0.14, 0.32];  // fuse of an explosive set off by another blast (s)
export const EXPLODE_FRAME_TIME = 0.38;   // how long the fireball frame shows (s)
// fuse delay for a chain reaction: farther neighbours go off later
export function chainDelay(distance, r01) { return CHAIN_DELAY[0] + Math.min(1, distance / 3) * 0.1 + r01 * (CHAIN_DELAY[1] - CHAIN_DELAY[0] - 0.1); }

// ---------------------------------------------------------------- spike traps
// One cycle: retracted (safe) -> rising (warning frame + click) -> extended
// (hurts whatever stands on it) -> retracting. Chokepoint traps (the only way
// through a 1-wide corridor) stay down longer so they can always be timed.
export const SPIKE_TIMING = { rest: 1.7, warn: 0.5, up: 0.85, down: 0.25 };
export const SPIKE_TIMING_CHOKE = { rest: 2.4, warn: 0.6, up: 0.7, down: 0.25 };
export function spikePeriod(tm = SPIKE_TIMING) { return tm.rest + tm.warn + tm.up + tm.down; }
// stage 0 retracted, 1 rising (warning), 2 extended (dangerous), 3 retracting.
// frame: art frame (0 retracted, 1 half raised, 2 extended). cycle: index of
// the current cycle (one hit per cycle). out is reused (no allocation).
export function spikeState(t, phase, tm = SPIKE_TIMING, out = {}) {
  const P = spikePeriod(tm);
  const u = t + phase * P;
  const cyc = Math.floor(u / P);
  let s = u - cyc * P;
  out.cycle = cyc;
  if (s < tm.rest) { out.stage = 0; out.frame = 0; out.k = s / tm.rest; return out; }
  s -= tm.rest;
  if (s < tm.warn) { out.stage = 1; out.frame = 1; out.k = s / tm.warn; return out; }
  s -= tm.warn;
  if (s < tm.up) { out.stage = 2; out.frame = 2; out.k = s / tm.up; return out; }
  s -= tm.up;
  out.stage = 3; out.frame = 1; out.k = s / tm.down;
  return out;
}
export function spikeDamage(depth, toMonster) {
  const d = Math.max(1, depth);
  return toMonster ? 9 * monsterHpMult(d) : 11 * monsterDmgMult(d);
}

// ---------------------------------------------------------------- pedestals
// Special item on a pedestal: rare at least, epic / legendary more likely deeper.
export function pedestalMinRarity(depth, r01) {
  if (depth >= 20) return r01 < 0.25 ? 4 : 3;
  if (depth >= 10) return r01 < 0.35 ? 3 : 2;
  if (depth >= 4) return r01 < 0.12 ? 3 : 2;
  return r01 < 0.3 ? 2 : 1;
}
export const PEDESTAL_KINDS = [{ k: 'weapon', w: 50 }, { k: 'body', w: 12 }, { k: 'head', w: 10 }, { k: 'legs', w: 10 }, { k: 'ring', w: 18 }];

// ---------------------------------------------------------------- level counts
// how many of each scatter kind a level gets (reachable cells, depth, theme
// density, theme computer density `term`: 0 = no terminals at all)
export function scatterCounts(reach, depth, density = 1, term = 0) {
  const a = reach / 1000;
  return {
    pillars: Math.min(36, Math.round((6 + a * 7) * Math.max(0.3, density))),
    explosives: Math.min(26, Math.round((4 + a * 6 + depth * 0.15) * Math.max(0.35, density))),
    traps: Math.min(20, Math.round(3 + a * 4 + Math.min(8, depth * 0.35))),
    pedestals: reach > 500 ? 2 : 1,
    terminals: term > 0 ? Math.min(20, Math.max(1, Math.round((2 + a * 6) * term))) : 0,
    wallTerminals: term > 0 ? Math.min(32, Math.max(1, Math.round((3 + a * 10) * term))) : 0,
  };
}
