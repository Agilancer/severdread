// Scatter terrain: pillars, explosive barrels / props, chests, pedestals and
// spike traps cut from the uploaded scatter sheets (tools/art_config.json
// scatter_* entries -> manifest `scatterSets`, one atlas per sheet with
// per-object frame rects and a style tag).
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
// `explosiveTags` narrows the explosive pool to objects with one of the tags
// (e.g. lanterns only in castles); `elements` to explosion elements.
export const FAMILY_SCATTER = {
  station: { pillar: ['tech'], pedestal: ['tech'], spike: ['metal', 'tech'], explosive: ['tech', 'industrial'], chest: 'tech', density: 1 },
  industrial: { pillar: ['industrial', 'rust', 'iron', 'tech'], pedestal: ['industrial', 'iron', 'rust', 'tech'], spike: ['metal', 'rust'], explosive: ['industrial', 'rust'], chest: 'tech', density: 1.3 },
  hell: { pillar: ['hell', 'lava', 'flesh', 'bone', 'occult', 'iron'], pedestal: ['hell', 'flesh'], spike: ['hell', 'flesh', 'bone', 'lava'], explosive: ['rust', 'industrial', 'gothic'], elements: ['fire'], chest: 'skull', density: 0.8 },
  castle: { pillar: ['gothic', 'crypt', 'stone'], pedestal: ['gothic', 'crypt', 'gold'], spike: ['metal', 'wood', 'gothic', 'bone'], explosive: ['gothic'], chest: 'skull', density: 0.5 },
  city: { pillar: ['stone', 'marble', 'industrial'], pedestal: ['stone', 'industrial', 'tech'], spike: ['metal', 'rust'], explosive: ['industrial'], chest: 'tech', density: 1.1 },
  nature: { pillar: ['rock', 'moss'], pedestal: ['moss', 'crypt', 'stone'], spike: ['wood', 'moss', 'rust'], explosive: ['rust', 'gothic'], chest: 'skull', density: 0.6 },
  ice: { pillar: ['ice', 'rock'], pedestal: ['tech', 'marble'], spike: ['metal', 'ice'], explosive: ['industrial', 'tech'], elements: ['ice', 'lightning'], chest: 'tech', chestHues: ['cyan', 'blue'], density: 0.8 },
  desert: { pillar: ['stone', 'rock', 'gold'], pedestal: ['sandstone', 'gold', 'stone'], spike: ['bone', 'wood'], explosive: ['rust', 'industrial'], chest: 'skull', density: 0.6 },
  heaven: { pillar: ['marble', 'gold'], pedestal: ['gold', 'marble'], spike: ['gold', 'metal'], explosive: ['gothic'], chest: 'tech', chestHues: ['yellow', 'orange'], density: 0.4 },
  cyber: { pillar: ['tech', 'crystal'], pedestal: ['tech'], spike: ['tech', 'arcane'], explosive: ['tech'], chest: 'tech', chestHues: ['cyan', 'purple', 'blue'], density: 1 },
  organic: { pillar: ['flesh', 'bone'], pedestal: ['hell', 'moss', 'flesh'], spike: ['flesh', 'bone'], explosive: ['industrial', 'rust'], elements: ['poison', 'fire'], chest: 'skull', density: 0.8 },
};

// Theme specific choices, merged over the theme's family entry.
export const THEME_SCATTER = {
  possessed_station: { spike: ['metal', 'tech', 'hell'] },
  frozen_outpost: { pillar: ['ice', 'tech'] },
  arctic_rail: { pillar: ['ice', 'industrial'] },
  glacier_caves: { pillar: ['ice', 'rock'], spike: ['ice', 'metal'] },
  mountain_top: { pillar: ['rock', 'ice'] },
  mountain_climb: { pillar: ['rock', 'ice'] },
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
  toxic_swamp: { elements: ['poison'] },
  sewer_labyrinth: { elements: ['poison', 'fire'] },
  concert_hall: { pillar: ['marble', 'gold', 'stone'] },
  movie_theater: { pillar: ['marble', 'gold'] },
  department_store: { pillar: ['marble', 'stone'] },
  backrooms: { pillar: [], density: 0.3 },
  carnival: { pillar: ['gold', 'iron', 'rust'], explosive: ['rust', 'gothic'] },
};

// Resolved scatter styles for a theme: family entry + theme overrides.
export function scatterStyle(theme) {
  const fam = theme?.family || (THEME_FAMILY[theme?.id] || 'station').split(' ')[0];
  const base = FAMILY_SCATTER[fam] || FAMILY_SCATTER.station;
  const over = THEME_SCATTER[theme?.id] || {};
  return { family: fam, ...base, ...over };
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
  if (depth >= 14) return r01 < 0.3 ? 4 : 3;
  if (depth >= 6) return r01 < 0.45 ? 3 : 2;
  return r01 < 0.15 ? 3 : 2;
}
export const PEDESTAL_KINDS = [{ k: 'weapon', w: 50 }, { k: 'body', w: 12 }, { k: 'head', w: 10 }, { k: 'legs', w: 10 }, { k: 'ring', w: 18 }];

// ---------------------------------------------------------------- level counts
// how many of each scatter kind a level gets (reachable cells, depth, theme density)
export function scatterCounts(reach, depth, density = 1) {
  const a = reach / 1000;
  return {
    pillars: Math.min(36, Math.round((6 + a * 7) * Math.max(0.3, density))),
    explosives: Math.min(26, Math.round((4 + a * 6 + depth * 0.15) * Math.max(0.35, density))),
    traps: Math.min(20, Math.round(3 + a * 4 + Math.min(8, depth * 0.35))),
    pedestals: reach > 500 ? 2 : 1,
  };
}
