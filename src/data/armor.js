// Armour & ring bases. Icons are procedural until real armour/ring sheets are
// uploaded: add a sprite_grid sheet with tagged sprites and put its sprite id
// in `sprite` (e.g. { sprite: 'helm_01' }) to use real art.
export const ARMOR_SLOTS = ['head', 'body', 'legs'];

export const ARMOR_NAMES = {
  head: ['Helm', 'Visor', 'Hood', 'Skullcap', 'Crown', 'Mask', 'Faceplate', 'Cowl'],
  body: ['Plate', 'Vest', 'Carapace', 'Hauberk', 'Rig', 'Mantle', 'Cuirass', 'Harness'],
  legs: ['Greaves', 'Treads', 'Legplates', 'Cuisses', 'Striders', 'Tassets', 'Stompers'],
};
export const ARMOR_SLOT_ARMOR = { head: 0.8, body: 1.4, legs: 1.0 };

// Material tiers by item level - name prefix + icon palette
export const MATERIALS = [
  { minLevel: 1, name: 'Scrap', base: '#6a5a4a', trim: '#8a7a5a' },
  { minLevel: 5, name: 'Iron', base: '#5a5e66', trim: '#9aa0a8' },
  { minLevel: 10, name: 'Steel', base: '#7a8290', trim: '#c8ccd4' },
  { minLevel: 16, name: 'Ceramite', base: '#c8c0b0', trim: '#7a5a3a' },
  { minLevel: 24, name: 'Titan', base: '#4a5a6a', trim: '#40c0ff' },
  { minLevel: 34, name: 'Obsidian', base: '#1e1a24', trim: '#a040ff' },
  { minLevel: 46, name: 'Nano', base: '#2a3a3a', trim: '#40ffb0' },
  { minLevel: 60, name: 'Hellforged', base: '#4a1410', trim: '#ff6020' },
  { minLevel: 80, name: 'Seraphic', base: '#e8e0c8', trim: '#ffd040' },
  { minLevel: 110, name: 'Voidwrought', base: '#140a20', trim: '#ff40ff' },
  { minLevel: 150, name: 'Astral', base: '#1a2a5a', trim: '#ffffff' },
];

export const RING_NAMES = ['Band', 'Loop', 'Signet', 'Coil', 'Circlet', 'Halo', 'Seal', 'Ring'];
export const RING_BANDS = ['#c8a040', '#b8bcc4', '#8a5a3a', '#2a2a30', '#e8e0d0', '#60d0ff'];
