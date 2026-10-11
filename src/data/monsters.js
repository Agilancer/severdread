// Monster gameplay definitions. `sprite` is either a monster id from
// assets/manifest.json (an uploaded 8-direction sheet) or 'placeholder:<kind>'.
//
// Adding a new monster after uploading its sheet:
//   1. add the sheet to tools/art_config.json and run the art tool
//   2. add an entry here with sprite: '<sheet id>' and pick its behaviour:
//        attack.type 'melee' if the sprite swings/punches/bites,
//                    'ranged' if it shoots (give it a projectile)
//        teleport: {...}   robots blink around
//        wallWalker: true  4+ legged / spider-like things crawl on walls & ceilings
//        flying: true      hovers above the floor
//   3. optional: give it its own reagents in data/reagents.js and `drops`.
//
// Stats are at depth 1; data/balance.js scales them per depth.

import { BOSSES } from './bosses.js';
import { ENEMIES, EXTRA_BOSSES } from './enemies.js';

export const MONSTERS = {
  piston_monk: {
    name: 'Piston Monk', sprite: 'piston_monk', category: 'robot',
    height: 1.05, hp: 40, damage: 11, armor: 2, speed: 2.5, radius: 0.33,
    attack: { type: 'melee', range: 1.4, windup: 0.45, strike: 0.12, recover: 0.45, cooldown: 0.9, slam: 1.5, knockback: 5, sound: 'slam' },
    teleport: { cooldown: 5.5, range: 4.5, dodgeChance: 0.25, closeChance: 0.5 },
    xp: 1.0, credits: 1.0, weight: 10, minDepth: 1,
    drops: [{ id: 'servo_scrap', chance: 0.45, min: 1, max: 2 }, { id: 'logic_chip', chance: 0.07, min: 1, max: 1 }],
    resist: { lightning: -0.5, poison: 0.6 },
    voice: 'robot',
    blurb: 'A cloister automaton whose prayer-pistons now pound flesh.',
  },
  static_urchin: {
    name: 'Static Urchin', sprite: 'static_urchin', category: 'construct',
    height: 0.62, hp: 24, damage: 8, armor: 1, speed: 2.9, radius: 0.32,
    attack: {
      type: 'ranged', range: 15, windup: 0.5, strike: 0.1, recover: 0.4, cooldown: 1.7,
      projectile: { sprite: 'violet_star', element: 'lightning', speed: 12, size: 0.42, light: [0.7, 0.3, 1.0], spin: 6 },
      sound: 'zap_enemy',
    },
    wallWalker: true, ceilingBias: 0.6, preferredRange: 7,
    xp: 0.9, credits: 0.9, weight: 9, minDepth: 1,
    drops: [{ id: 'static_coil', chance: 0.45, min: 1, max: 2 }, { id: 'urchin_spine', chance: 0.08, min: 1, max: 1 }],
    resist: { lightning: 0.75, ice: -0.35 },
    voice: 'chitter',
    blurb: 'A six-legged capacitor that skitters across ceilings, spitting static.',
  },

  // ---------------------------------------------------------------- bosses
  iron_penitent: {
    name: 'Iron Penitent', sprite: 'iron_penitent', category: 'demon', boss: true,
    height: 2.3, hp: 950, damage: 24, armor: 8, speed: 2.2, radius: 0.8,
    attack: { type: 'melee', range: 2.4, windup: 0.6, strike: 0.15, recover: 0.6, cooldown: 0.7, slam: 2.8, knockback: 9, sound: 'boss_slam' },
    specials: { charge: { cooldown: 7, speed: 10, duration: 1.1 }, shockwave: { cooldown: 9, speed: 7, damage: 0.7 } },
    xp: 15, credits: 12, weight: 10, minDepth: 1,
    drops: [{ id: 'penitent_chain', chance: 1, min: 1, max: 3 }, { id: 'brimstone_shard', chance: 1, min: 3, max: 6 }, { id: 'demon_ichor', chance: 0.6, min: 1, max: 3 }],
    resist: { fire: 0.5, holy: -0.5 },
    voice: 'demon',
    blurb: 'Bound in chains for sins it cannot remember, it swings them at you instead.',
  },
  piston_abbot: {
    name: 'Piston Abbot', sprite: 'piston_monk', category: 'robot', boss: true, scale: 2.1,
    palette: { sat: 0.35, tint: [1.7, 1.35, 0.55], glow: [0.18, 0.12, 0.0] },
    height: 2.2, hp: 800, damage: 20, armor: 10, speed: 2.4, radius: 0.75,
    attack: { type: 'melee', range: 2.3, windup: 0.5, strike: 0.12, recover: 0.5, cooldown: 0.75, slam: 3.0, knockback: 8, sound: 'boss_slam' },
    teleport: { cooldown: 4, range: 7, dodgeChance: 0.35, closeChance: 0.8 },
    specials: { shockwave: { cooldown: 7, speed: 8, damage: 0.6 }, summon: { cooldown: 12, count: 2, monster: 'piston_monk' } },
    xp: 14, credits: 12, weight: 6, minDepth: 2,
    drops: [{ id: 'logic_chip', chance: 1, min: 2, max: 4 }, { id: 'servo_scrap', chance: 1, min: 4, max: 8 }],
    resist: { lightning: -0.4, poison: 0.7 },
    voice: 'robot',
    blurb: 'The gilded abbot of the machine cloister. Its sermons are delivered by piston.',
  },
  urchin_matriarch: {
    name: 'Urchin Matriarch', sprite: 'static_urchin', category: 'construct', boss: true, scale: 2.6,
    palette: { sat: 0.6, hue: 2.2, tint: [1.2, 1.0, 1.3], glow: [0.15, 0.05, 0.2] },
    height: 1.6, hp: 700, damage: 16, armor: 6, speed: 2.6, radius: 0.85,
    attack: {
      type: 'ranged', range: 18, windup: 0.6, strike: 0.1, recover: 0.4, cooldown: 1.3, burst: 5, burstSpread: 0.5,
      projectile: { sprite: 'thunder_orb', element: 'lightning', speed: 11, size: 0.55, light: [1.0, 0.9, 0.3], spin: 5 },
      sound: 'zap_enemy',
    },
    wallWalker: true, ceilingBias: 0.4, preferredRange: 9,
    specials: { summon: { cooldown: 10, count: 3, monster: 'static_urchin' }, nova: { cooldown: 8, count: 16 } },
    xp: 14, credits: 12, weight: 6, minDepth: 3,
    drops: [{ id: 'urchin_spine', chance: 1, min: 2, max: 4 }, { id: 'static_coil', chance: 1, min: 4, max: 8 }],
    resist: { lightning: 0.8, ice: -0.3 },
    voice: 'chitter',
    blurb: 'Mother of the swarm. The ceiling is hers.',
  },

  // ------------------------------------------------- placeholder monsters
  // Procedural art. Lower spawn weight; replace by uploading real sheets.
  ph_gunner: {
    name: 'Rust Gunner', sprite: 'placeholder:gunner', placeholder: true, category: 'robot',
    palette0: { base: '#6a6e78', alt: '#3a3e48', eye: '#ff3030' },
    height: 1.0, hp: 30, damage: 7, armor: 2, speed: 2.3, radius: 0.3,
    attack: { type: 'ranged', range: 16, windup: 0.45, strike: 0.08, recover: 0.3, cooldown: 1.2, burst: 3, burstDelay: 0.12, projectile: { sprite: 'azure_sigil', element: 'lightning', speed: 20, size: 0.3, light: [0.4, 0.7, 1.0] }, sound: 'enemy_gun' },
    teleport: { cooldown: 7, range: 4, dodgeChance: 0.2, closeChance: 0.2 },
    preferredRange: 8, xp: 0.9, credits: 1.0, weight: 4, minDepth: 2,
    drops: [{ id: 'servo_scrap', chance: 0.4, min: 1, max: 2 }],
    resist: { lightning: -0.4, poison: 0.6 }, voice: 'robot',
  },
  ph_watcher: {
    name: 'Watcher', sprite: 'placeholder:watcher', placeholder: true, category: 'alien',
    palette0: { base: '#6a2a4a', alt: '#a04a6a', eye: '#40ff60' },
    height: 0.8, hp: 26, damage: 9, armor: 0, speed: 2.0, radius: 0.35, flying: 1.1,
    attack: { type: 'ranged', range: 16, windup: 0.6, strike: 0.1, recover: 0.5, cooldown: 2.0, projectile: { sprite: 'void_maw', element: 'void', speed: 9, size: 0.5, light: [0.6, 0.2, 1.0], spin: 3 }, sound: 'spit' },
    preferredRange: 9, xp: 1.0, credits: 1.0, weight: 3, minDepth: 3,
    drops: [{ id: 'bio_gel', chance: 0.35, min: 1, max: 2 }],
    resist: { void: 0.6, holy: -0.4 }, voice: 'alien',
  },
  ph_crawler: {
    name: 'Bone Crawler', sprite: 'placeholder:crawler', placeholder: true, category: 'beast',
    palette0: { base: '#8a7a5a', alt: '#5a2a1a', eye: '#ff2020' },
    height: 0.55, hp: 20, damage: 7, armor: 1, speed: 4.0, radius: 0.32,
    attack: { type: 'melee', range: 1.1, windup: 0.25, strike: 0.1, recover: 0.3, cooldown: 0.6, knockback: 2, sound: 'bite' },
    wallWalker: true, ceilingBias: 0.35, xp: 0.7, credits: 0.7, weight: 3, minDepth: 2,
    drops: [{ id: 'chitin_plate', chance: 0.4, min: 1, max: 2 }],
    resist: { poison: 0.4, fire: -0.3 }, voice: 'chitter',
  },
  ph_imp: {
    name: 'Cinder Imp', sprite: 'placeholder:imp', placeholder: true, category: 'demon',
    palette0: { base: '#8a3a24', alt: '#d8c8a0', eye: '#ffe040' },
    height: 0.95, hp: 28, damage: 10, armor: 1, speed: 2.7, radius: 0.3,
    attack: { type: 'ranged', range: 15, windup: 0.5, strike: 0.1, recover: 0.4, cooldown: 1.6, projectile: { sprite: 'inferno_orb', element: 'fire', speed: 11, size: 0.45, light: [1.0, 0.5, 0.1], spin: 4 }, sound: 'fireball' },
    preferredRange: 7, xp: 1.0, credits: 1.0, weight: 3, minDepth: 1,
    drops: [{ id: 'brimstone_shard', chance: 0.4, min: 1, max: 2 }],
    resist: { fire: 0.6, holy: -0.5, ice: -0.2 }, voice: 'demon',
  },
};

// BIG bosses (data/bosses.js). Their sprite id is their own id; until that
// sheet is processed they render as a scaled placeholder body.
for (const [id, b] of Object.entries(BOSSES)) {
  if (MONSTERS[id]) continue;
  MONSTERS[id] = {
    sprite: id, boss: true, xp: 15, credits: 12, weight: 8, minDepth: b.tier || 1,
    drops: [{ id: 'boss_soul_shard', chance: 0.5, min: 1, max: 1 }],
    ...b,
  };
}

// Uploaded standard enemies + extra bosses (data/enemies.js)
for (const [id, d] of Object.entries({ ...ENEMIES, ...EXTRA_BOSSES })) if (!MONSTERS[id]) MONSTERS[id] = d;
// Placeholder monsters are only used when no real art exists for a slot.
for (const m of Object.values(MONSTERS)) if (m.placeholder) m.weight *= 0.15;

// Palette-swap variants applied on top of any monster for extra variety.
// sat: saturation multiplier, tint: rgb multiply, hue: radians, glow: emissive
export const VARIANTS = [
  { id: 'normal', prefix: '', weight: 40 },
  { id: 'molten', prefix: 'Molten', sat: 0.35, tint: [1.65, 0.8, 0.4], glow: [0.18, 0.05, 0], element: 'fire', resist: { fire: 0.5, ice: -0.3 }, weight: 6, minDepth: 2 },
  { id: 'frost', prefix: 'Frostbitten', sat: 0.3, tint: [0.7, 1.1, 1.65], glow: [0, 0.06, 0.16], element: 'ice', resist: { ice: 0.5, fire: -0.3 }, weight: 6, minDepth: 2 },
  { id: 'toxic', prefix: 'Toxic', sat: 0.3, tint: [0.75, 1.55, 0.5], glow: [0.03, 0.12, 0], element: 'poison', resist: { poison: 0.6 }, weight: 5, minDepth: 3 },
  { id: 'void', prefix: 'Void-touched', sat: 0.2, tint: [0.95, 0.5, 1.55], glow: [0.12, 0, 0.2], element: 'void', resist: { void: 0.6, holy: -0.3 }, weight: 4, minDepth: 5, hpMult: 1.15 },
  { id: 'gilded', prefix: 'Gilded', sat: 0.3, tint: [1.65, 1.35, 0.5], glow: [0.12, 0.09, 0], creditsMult: 3, hpMult: 1.3, weight: 2, minDepth: 3 },
  { id: 'crimson', prefix: 'Crimson', sat: 0.35, tint: [1.65, 0.45, 0.45], glow: [0.12, 0, 0], element: 'blood', dmgMult: 1.15, weight: 5, minDepth: 4 },
  { id: 'shadow', prefix: 'Shadow', sat: 0.0, tint: [0.4, 0.38, 0.5], speedMult: 1.2, weight: 4, minDepth: 6 },
  { id: 'spectral', prefix: 'Spectral', sat: 0.0, tint: [1.2, 1.4, 1.6], glow: [0.1, 0.15, 0.2], element: 'holy', speedMult: 1.1, weight: 3, minDepth: 8 },
  { id: 'chroma_a', prefix: 'Mutated', hue: 2.1, weight: 5, minDepth: 2 },
  { id: 'chroma_b', prefix: 'Corrupted', hue: -2.1, weight: 5, minDepth: 3 },
  { id: 'chroma_c', prefix: 'Aberrant', hue: 3.14, sat: 1.2, weight: 4, minDepth: 5 },
];

// Monster category -> elemental affinities and which reagent families drop
export const CATEGORIES = {
  robot: { name: 'Robot', resist: { lightning: -0.3, poison: 0.5 } },
  construct: { name: 'Construct', resist: { poison: 0.3 } },
  demon: { name: 'Demon', resist: { fire: 0.3, holy: -0.4 } },
  undead: { name: 'Undead', resist: { poison: 0.6, holy: -0.5 } },
  beast: { name: 'Beast', resist: {} },
  alien: { name: 'Alien', resist: { void: 0.3 } },
};
