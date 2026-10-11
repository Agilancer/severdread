// Damage elements. `status` is applied on hit with the weapon's status chance.
// `proj` lists projectile sprite ids (from the projectile sheets) that suit
// the element; the first available one is used.
export const ELEMENTS = {
  physical: { name: 'Physical', color: '#d9d4cc', light: [1.0, 0.85, 0.55], status: null, proj: ['tracer'], adj: [''] },
  fire: { name: 'Fire', color: '#ff6a1a', light: [1.0, 0.45, 0.1], status: 'burn', proj: ['inferno_orb', 'amber_prism', 'solar_vortex'], adj: ['Blazing', 'Molten', 'Infernal', 'Scorching'] },
  ice: { name: 'Frost', color: '#8fdcff', light: [0.5, 0.8, 1.0], status: 'chill', proj: ['frost_flake', 'cobalt_crystal', 'sapphire_shard'], adj: ['Frozen', 'Glacial', 'Rimed', 'Cryo'] },
  lightning: { name: 'Shock', color: '#ffe94a', light: [1.0, 0.95, 0.4], status: 'shock', proj: ['thunder_orb', 'azure_sigil'], adj: ['Arcing', 'Voltaic', 'Storm', 'Thunder'] },
  poison: { name: 'Toxic', color: '#6dff4a', light: [0.4, 1.0, 0.3], status: 'poison', proj: ['jade_hex', 'emerald_sigil'], adj: ['Venomous', 'Toxic', 'Blighted', 'Caustic'] },
  void: { name: 'Void', color: '#b04aff', light: [0.6, 0.2, 1.0], status: 'rend', proj: ['void_maw', 'abyss_orb', 'violet_star'], adj: ['Void', 'Abyssal', 'Null', 'Eclipsed'] },
  holy: { name: 'Holy', color: '#fff3b0', light: [1.0, 0.95, 0.7], status: 'smite', proj: ['radiant_orb', 'golden_cross', 'gold_sigil'], adj: ['Sanctified', 'Radiant', 'Blessed', 'Seraphic'] },
  plasma: { name: 'Plasma', color: '#4affe1', light: [0.3, 1.0, 0.9], status: 'melt', proj: ['atom_core', 'tide_vortex'], adj: ['Plasma', 'Fusion', 'Ionized', 'Quantum'] },
  blood: { name: 'Blood', color: '#e0103a', light: [1.0, 0.1, 0.2], status: 'bleed', proj: ['crimson_crescent', 'crimson_sigil'], adj: ['Sanguine', 'Bloodthirsty', 'Crimson', 'Hemorrhagic'] },
  arcane: { name: 'Arcane', color: '#d070ff', light: [0.85, 0.4, 1.0], status: 'hex', proj: ['amethyst_star', 'violet_sigil', 'prism_burst'], adj: ['Arcane', 'Eldritch', 'Hexed', 'Runic'] },
};

// Status effects applied to monsters (and in some cases the player).
export const STATUS = {
  burn: { name: 'Burning', duration: 3, tick: 0.5, dotPct: 0.12, tint: [1.4, 0.7, 0.4], particles: 'fire' },
  chill: { name: 'Chilled', duration: 2.5, slow: 0.45, freezeStacks: 4, freezeTime: 1.6, tint: [0.6, 0.85, 1.4], particles: 'frost' },
  shock: { name: 'Shocked', duration: 0.1, chainCount: 3, chainRange: 4.5, chainPct: 0.5, tint: [1.3, 1.3, 0.6], particles: 'spark' },
  poison: { name: 'Poisoned', duration: 4, tick: 0.5, dotPct: 0.08, maxStacks: 5, tint: [0.7, 1.3, 0.6], particles: 'poison' },
  rend: { name: 'Rent', duration: 5, armorShred: 0.4, tint: [1.0, 0.6, 1.3], particles: 'void' },
  smite: { name: 'Smitten', duration: 0.1, bonusVs: { demon: 0.6, undead: 0.6 }, tint: [1.4, 1.4, 1.1], particles: 'holy' },
  melt: { name: 'Melting', duration: 0.1, splash: 1.6, splashPct: 0.45, tint: [0.6, 1.4, 1.3], particles: 'plasma' },
  bleed: { name: 'Bleeding', duration: 4, tick: 0.5, dotPct: 0.07, lifesteal: 0.25, tint: [1.4, 0.5, 0.5], particles: 'blood' },
  hex: { name: 'Hexed', duration: 4, vulnerability: 0.25, tint: [1.2, 0.7, 1.4], particles: 'void' },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);
