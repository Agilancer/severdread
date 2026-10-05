// Crafting reagents. Stored in a separate pouch (they don't use bag slots).
// `icon`: procedural shape until a real icon sheet is uploaded (set `sprite`
// to a sprite id from a sprite_grid sheet to use real art).
// `tier`: 0 common .. 3 boss-only. Monsters reference these ids in their drop
// tables (data/monsters.js); chests roll from `chestPool`.
export const REAGENTS = {
  nano_paste: { name: 'Nano Paste', icon: 'paste', color: '#a8e0ff', tier: 0, desc: 'Self-assembling repair gel. Every monster leaks some.' },
  servo_scrap: { name: 'Servo Scrap', icon: 'gear', color: '#c08a40', tier: 0, desc: 'Twisted servos torn from possessed machines.' },
  logic_chip: { name: 'Logic Chip', icon: 'chip', color: '#40ff90', tier: 1, desc: 'A machine mind, still whispering.' },
  static_coil: { name: 'Static Coil', icon: 'coil', color: '#b070ff', tier: 0, desc: 'Hums with trapped lightning.' },
  urchin_spine: { name: 'Urchin Spine', icon: 'spine', color: '#d07040', tier: 1, desc: 'Copper spine that never stops sparking.' },
  brimstone_shard: { name: 'Brimstone Shard', icon: 'shard', color: '#ff5a1a', tier: 0, desc: 'Warm to the touch. Smells of sulfur.' },
  demon_ichor: { name: 'Demon Ichor', icon: 'vial', color: '#c0102a', tier: 1, desc: 'Black-red blood that crawls toward the living.' },
  chitin_plate: { name: 'Chitin Plate', icon: 'shard', color: '#7a8a3a', tier: 0, desc: 'Armored shell plating from crawling things.' },
  bio_gel: { name: 'Bio Gel', icon: 'vial', color: '#60ff40', tier: 1, desc: 'Mutagenic slime. Do not drink.' },
  grave_dust: { name: 'Grave Dust', icon: 'dust', color: '#a89a80', tier: 0, desc: 'What remains of the restless dead.' },
  soul_wisp: { name: 'Soul Wisp', icon: 'eye', color: '#80f0ff', tier: 1, desc: 'A trapped soul, faintly screaming.' },
  void_crystal: { name: 'Void Crystal', icon: 'shard', color: '#8a30ff', tier: 2, desc: 'A sliver of nothing. Found in deeper levels.' },
  cyber_core: { name: 'Cyber Core', icon: 'core', color: '#30e8ff', tier: 1, desc: 'Power core pried from a cybernetic treasure chest.' },
  // boss-only
  penitent_chain: { name: "Penitent's Chain", icon: 'chain', color: '#b06a3a', tier: 3, bossOnly: true, desc: 'A link of the Iron Penitent\'s eternal chains.' },
  boss_soul_shard: { name: 'Tyrant Soul Shard', icon: 'shard', color: '#ff2a6a', tier: 3, bossOnly: true, desc: 'Crystallized will of a slain boss.' },
  tyrant_heart: { name: 'Tyrant Heart', icon: 'heart', color: '#ff1030', tier: 3, bossOnly: true, desc: 'Still beating. Bosses from depth 10+.' },
  astral_sigil: { name: 'Astral Sigil', icon: 'sigil', color: '#ffe060', tier: 3, bossOnly: true, desc: 'Etched by something older than stars. Bosses from depth 25+.' },
};

// What chests can contain (weights)
export const CHEST_POOL = [
  { id: 'nano_paste', weight: 10, min: 2, max: 6 },
  { id: 'cyber_core', weight: 7, min: 1, max: 2 },
  { id: 'servo_scrap', weight: 5, min: 1, max: 4 },
  { id: 'static_coil', weight: 5, min: 1, max: 4 },
  { id: 'brimstone_shard', weight: 4, min: 1, max: 3 },
  { id: 'logic_chip', weight: 3, min: 1, max: 2 },
  { id: 'void_crystal', weight: 1.5, min: 1, max: 1, minDepth: 6 },
];

// Universal drops any monster can roll in addition to its own table
export const UNIVERSAL_DROPS = [
  { id: 'nano_paste', chance: 0.35, min: 1, max: 2 },
  { id: 'void_crystal', chance: 0.02, min: 1, max: 1, minDepth: 6 },
];
export const BOSS_UNIVERSAL_DROPS = [
  { id: 'boss_soul_shard', chance: 1, min: 1, max: 2 },
  { id: 'tyrant_heart', chance: 0.5, min: 1, max: 1, minDepth: 10 },
  { id: 'astral_sigil', chance: 0.35, min: 1, max: 1, minDepth: 25 },
  { id: 'void_crystal', chance: 0.6, min: 1, max: 3, minDepth: 4 },
];
