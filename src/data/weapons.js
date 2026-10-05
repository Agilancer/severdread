// Weapon archetypes (how a gun fires) and weapon bases (what it looks like).
//
// Bases come from two places:
//   1. Uploaded weapon sheets (assets/manifest.json -> weaponSets). Each row
//      becomes a base automatically, using the sheet's `archetype`.
//   2. PLACEHOLDER_BASES below - procedurally drawn guns for archetypes that
//      have no uploaded art yet. As soon as a real base exists for an
//      archetype, its placeholders stop dropping.
//
// Numbers are for an item-level-1 common; see data/balance.js for scaling.

export const ARCHETYPES = {
  pistol: { name: 'Pistol', rate: 4.5, damage: 15, pellets: 1, spread: 0.012, proj: 'bullet', speed: 85, kick: 0.012, auto: false, sound: 'pistol' },
  smg: { name: 'SMG', rate: 10, damage: 6.5, pellets: 1, spread: 0.035, proj: 'bullet', speed: 80, kick: 0.006, auto: true, sound: 'smg' },
  rifle: { name: 'Rifle', rate: 7, damage: 10, pellets: 1, spread: 0.018, proj: 'bullet', speed: 95, kick: 0.009, auto: true, sound: 'rifle' },
  shotgun: { name: 'Shotgun', rate: 1.3, damage: 7.5, pellets: 8, spread: 0.11, proj: 'pellet', speed: 70, kick: 0.05, auto: false, sound: 'shotgun' },
  super_shotgun: { name: 'Super Shotgun', rate: 0.85, damage: 6.5, pellets: 16, spread: 0.17, proj: 'pellet', speed: 70, kick: 0.08, auto: false, sound: 'sshotgun' },
  minigun: { name: 'Minigun', rate: 17, damage: 4.2, pellets: 1, spread: 0.06, proj: 'bullet', speed: 85, kick: 0.004, auto: true, spinup: 0.5, sound: 'minigun' },
  rocket: { name: 'Rocket Launcher', rate: 1.1, damage: 55, pellets: 1, spread: 0, proj: 'rocket', speed: 22, explode: 2.4, kick: 0.04, auto: false, sound: 'rocket' },
  grenade: { name: 'Grenade Launcher', rate: 1.4, damage: 42, pellets: 1, spread: 0.02, proj: 'grenade', speed: 16, gravity: 16, bounces: 4, fuse: 1.4, explode: 2.6, kick: 0.03, auto: false, sound: 'grenade' },
  nailgun: { name: 'Nail Grenade Launcher', rate: 1.2, damage: 16, pellets: 1, spread: 0.02, proj: 'grenade', speed: 15, gravity: 16, bounces: 2, fuse: 1.0, explode: 1.6, nails: 18, nailDamage: 8, kick: 0.03, auto: false, sound: 'grenade' },
  plasma: { name: 'Plasma Rifle', rate: 8, damage: 9, pellets: 1, spread: 0.02, proj: 'orb', speed: 34, explode: 0.9, kick: 0.006, auto: true, sound: 'plasma', defaultElement: 'plasma' },
  rail: { name: 'Railgun', rate: 0.9, damage: 85, pellets: 1, spread: 0, proj: 'rail', hitscan: true, pierce: 99, kick: 0.06, auto: false, sound: 'rail' },
  flamer: { name: 'Flamethrower', rate: 22, damage: 2.6, pellets: 1, spread: 0.12, proj: 'flame', speed: 15, life: 0.45, pierce: 99, kick: 0.001, auto: true, sound: 'flame', defaultElement: 'fire', statusBonus: 0.35 },
  lightning: { name: 'Lightning Gun', rate: 12, damage: 3.8, pellets: 1, spread: 0, proj: 'beam', hitscan: true, range: 15, chain: 2, kick: 0.001, auto: true, sound: 'zap', defaultElement: 'lightning' },
  launcher: { name: 'Disc Launcher', rate: 2.4, damage: 22, pellets: 1, spread: 0, proj: 'disc', speed: 30, ricochet: 3, pierce: 3, kick: 0.02, auto: false, sound: 'disc' },
  spreader: { name: 'Energy Spreader', rate: 1.8, damage: 8, pellets: 7, spread: 0, fan: 0.5, proj: 'orb', speed: 40, kick: 0.03, auto: false, sound: 'plasma', defaultElement: 'arcane' },
  blade: { name: 'Blade', rate: 2.2, damage: 34, pellets: 0, melee: { range: 1.9, arc: 1.9 }, kick: 0, auto: true, sound: 'swing' },
  // extra archetypes for uploaded weapon sheets
  revolver: { name: 'Revolver', rate: 2.6, damage: 30, pellets: 1, spread: 0.008, proj: 'bullet', speed: 95, kick: 0.03, auto: false, sound: 'pistol' },
  sniper: { name: 'Sniper Rifle', rate: 1.0, damage: 95, pellets: 1, spread: 0, proj: 'rail', hitscan: true, pierce: 2, kick: 0.07, auto: false, sound: 'rail' },
  lmg: { name: 'Light Machine Gun', rate: 12, damage: 6.4, pellets: 1, spread: 0.05, proj: 'bullet', speed: 85, kick: 0.006, auto: true, sound: 'rifle' },
  mace: { name: 'Mace', rate: 1.5, damage: 52, pellets: 0, melee: { range: 2.0, arc: 1.6, knockback: 6 }, kick: 0, auto: true, sound: 'swing' },
  club: { name: 'Club', rate: 1.7, damage: 44, pellets: 0, melee: { range: 1.9, arc: 1.7, knockback: 5 }, kick: 0, auto: true, sound: 'swing' },
  javelin: { name: 'Javelin', rate: 1.2, damage: 48, pellets: 1, spread: 0, proj: 'orb', speed: 36, pierce: 3, gravity: 3, kick: 0.02, auto: false, sound: 'swing' },
  shuriken: { name: 'Throwing Star', rate: 3.2, damage: 17, pellets: 1, spread: 0.01, proj: 'disc', speed: 32, ricochet: 2, pierce: 1, kick: 0.005, auto: true, sound: 'swing' },
  crossbow: { name: 'Crossbow', rate: 1.3, damage: 46, pellets: 1, spread: 0, proj: 'bullet', speed: 60, pierce: 2, kick: 0.02, auto: false, sound: 'disc' },
  harpoon: { name: 'Harpoon Gun', rate: 0.9, damage: 70, pellets: 1, spread: 0, proj: 'bullet', speed: 45, pierce: 4, kick: 0.04, auto: false, sound: 'disc' },
  sprayer: { name: 'Sprayer', rate: 20, damage: 2.7, pellets: 1, spread: 0.13, proj: 'flame', speed: 14, life: 0.5, pierce: 99, kick: 0.001, auto: true, sound: 'flame', statusBonus: 0.35 },
};

// Fire patterns: the "crazy" modifiers that rare+ weapons roll.
// `ok(arch)` limits which archetypes they make sense on.
const isProj = (a) => !a.hitscan && !a.melee;
export const PATTERNS = {
  fan: { name: 'Fan Shot', desc: (n) => `Fires ${n} projectiles in a fan`, weight: 8, ok: isProj, roll: (q, r) => r.pick(q > 0.8 ? [5, 7, 9, 12] : q > 0.5 ? [3, 5, 7] : [2, 3]) },
  burst_ring: { name: 'Burst Ring', desc: (n) => `Blasts ${n} projectiles in a ring`, weight: 3, ok: isProj, roll: (q, r) => r.pick(q > 0.85 ? [16, 24, 32] : [8, 12, 16]), minRarity: 3 },
  bounce: { name: 'Skipping', desc: () => 'Projectiles bounce along the ground and walls', weight: 6, ok: isProj },
  helix: { name: 'Helix', desc: () => 'Twin projectiles corkscrew around each other', weight: 6, ok: isProj },
  wave: { name: 'Serpent', desc: () => 'Projectiles slither in waves', weight: 6, ok: isProj },
  curve: { name: 'Crescent', desc: () => 'Projectiles curve outward in arcs', weight: 5, ok: isProj },
  homing: { name: 'Seeking', desc: () => 'Projectiles hunt down enemies', weight: 5, ok: isProj },
  split: { name: 'Splitting', desc: () => 'Projectiles split into three mid-flight', weight: 5, ok: isProj },
  slider: { name: 'Rift Rails', desc: () => 'Fires a floor + ceiling pair joined by a deadly energy beam', weight: 3, ok: isProj, minRarity: 3 },
  explosive: { name: 'Explosive', desc: () => 'Projectiles explode on impact', weight: 5, ok: (a) => !a.melee && !a.explode },
  orbit: { name: 'Orbital', desc: () => 'Projectiles spiral around the line of fire', weight: 4, ok: isProj },
  nova: { name: 'Nova Pulse', desc: () => 'Every 5th shot releases an elemental nova', weight: 4, ok: () => true },
  pierce: { name: 'Piercing', desc: () => 'Projectiles pass through 3 enemies', weight: 5, ok: (a) => !a.melee && !(a.pierce > 3) },
  chain: { name: 'Arc Link', desc: () => 'Hits arc lightning to 2 nearby enemies', weight: 4, ok: () => true },
  big: { name: 'Heavy Rounds', desc: () => 'Huge, slow projectiles that hit 60% harder', weight: 3, ok: isProj },
};

// Placeholder bases (procedural art). Palette: body/accent colours + flash.
export const PLACEHOLDER_BASES = [
  { id: 'ph_sidearm', name: 'Sidearm', archetype: 'pistol', pal: { body: '#5a5e66', accent: '#c0c4cc', flash: '#ffd060' } },
  { id: 'ph_handcannon', name: 'Hand Cannon', archetype: 'pistol', pal: { body: '#26242a', accent: '#d8a830', flash: '#ffb040' } },
  { id: 'ph_battlerifle', name: 'Battle Rifle', archetype: 'rifle', pal: { body: '#3a3e34', accent: '#8a9a5a', flash: '#ffd060' } },
  { id: 'ph_pulsecarbine', name: 'Pulse Carbine', archetype: 'rifle', element: 'lightning', pal: { body: '#2a3448', accent: '#40c8ff', flash: '#80e0ff' } },
  { id: 'ph_boomstick', name: 'Boomstick', archetype: 'shotgun', pal: { body: '#4a3a2a', accent: '#9a9aa0', flash: '#ffc040' } },
  { id: 'ph_riotpump', name: 'Riot Pump', archetype: 'shotgun', pal: { body: '#1e1e22', accent: '#e0e040', flash: '#ffd060' } },
  { id: 'ph_doubledevil', name: 'Double Devil', archetype: 'super_shotgun', pal: { body: '#3a1a1a', accent: '#c02020', flash: '#ff8030' } },
  { id: 'ph_shredder', name: 'Shredder', archetype: 'minigun', pal: { body: '#4a4a50', accent: '#e05020', flash: '#ffd060' } },
  { id: 'ph_hellfire', name: 'Hellfire Tube', archetype: 'rocket', element: 'fire', pal: { body: '#4a2a1a', accent: '#ff6020', flash: '#ff9040' } },
  { id: 'ph_thumper', name: 'Thumper', archetype: 'grenade', pal: { body: '#3a4a2a', accent: '#d0c040', flash: '#ffc040' } },
  { id: 'ph_nailstorm', name: 'Nailstorm', archetype: 'nailgun', pal: { body: '#5a5a62', accent: '#c0a060', flash: '#ffd080' } },
  { id: 'ph_plasmacaster', name: 'Plasma Caster', archetype: 'plasma', element: 'plasma', pal: { body: '#2a3a44', accent: '#40ffe0', flash: '#a0fff0' } },
  { id: 'ph_lancer', name: 'Lancer Rail', archetype: 'rail', element: 'plasma', pal: { body: '#d0d4dc', accent: '#30a0ff', flash: '#a0d0ff' } },
  { id: 'ph_pyre', name: 'Pyre', archetype: 'flamer', element: 'fire', pal: { body: '#5a3a24', accent: '#ff7020', flash: '#ffa040' } },
  { id: 'ph_teslalash', name: 'Tesla Lash', archetype: 'lightning', element: 'lightning', pal: { body: '#3a3448', accent: '#ffe040', flash: '#fff080' } },
  { id: 'ph_discripper', name: 'Disc Ripper', archetype: 'launcher', pal: { body: '#444', accent: '#30ff80', flash: '#a0ffc0' } },
  { id: 'ph_spreader', name: 'Hex Spreader', archetype: 'spreader', element: 'arcane', pal: { body: '#3a2448', accent: '#d070ff', flash: '#f0a0ff' } },
  { id: 'ph_chainblade', name: 'Chainblade', archetype: 'blade', pal: { body: '#b8bcc4', accent: '#e04020' } },
  { id: 'ph_voidsaber', name: 'Void Saber', archetype: 'blade', element: 'void', pal: { body: '#c090ff', accent: '#5020a0' } },
];

// Name generation ----------------------------------------------------------
export const NAME_PARTS = {
  uncommon: ['Tuned', 'Rugged', 'Hardened', 'Reliable', 'Balanced', 'Polished', 'Vicious', 'Brutal', 'Keen', 'Steady'],
  rare: ['Savage', 'Merciless', 'Ruthless', 'Grim', 'Feral', 'Wicked', 'Dire', 'Relentless', 'Lethal', 'Cruel'],
  epicSuffix: ['of Ruin', 'of the Abyss', 'of Carnage', 'of the Damned', 'of Agony', 'of Annihilation', 'of the Void', 'of Despair', 'of Judgement', 'of the Pit', 'of Ash', 'of Sorrow'],
  legendA: ['Dread', 'Grave', 'Doom', 'Hell', 'Night', 'Blood', 'Soul', 'Bone', 'Storm', 'Void', 'Wrath', 'Sin', 'Ash', 'Iron', 'Grim', 'Rage', 'Plague', 'Star', 'Chaos', 'Ruin', 'Sever', 'Gore', 'Skull', 'Hex'],
  legendB: ['maker', 'bringer', 'reaver', 'song', 'fang', 'howl', 'breaker', 'caller', 'spitter', 'grinder', 'eater', 'lash', 'fall', 'born', 'forge', 'wake', 'shard', 'bane', 'thirst', 'scream', 'rend', 'storm', 'hymn', 'wail'],
};
