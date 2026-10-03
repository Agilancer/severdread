// Item rarities. `weight` is the base drop weight (depth and item-find
// shift weights toward rarer tiers). `affixes` = number of random stat rolls.
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#ffffff', weight: 640, affixes: [0, 1], statMult: 1.0, maxUpgrade: 5, valueMult: 1, patterns: 0, abilities: 0 },
  { id: 'uncommon', name: 'Uncommon', color: '#3ddc3d', weight: 250, affixes: [1, 2], statMult: 1.12, maxUpgrade: 7, valueMult: 2.5, patterns: 0, abilities: 0 },
  { id: 'rare', name: 'Rare', color: '#3d7bff', weight: 85, affixes: [2, 3], statMult: 1.27, maxUpgrade: 10, valueMult: 6, patterns: 1, abilities: 1 },
  { id: 'epic', name: 'Epic', color: '#9d4dff', weight: 22, affixes: [3, 4], statMult: 1.48, maxUpgrade: 12, valueMult: 15, patterns: 1, abilities: 1 },
  { id: 'legendary', name: 'Legendary', color: '#ffb000', weight: 3.5, affixes: [4, 5], statMult: 1.8, maxUpgrade: 15, valueMult: 40, patterns: 2, abilities: 2 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, index: i }]));
export const RARITY_IDS = RARITIES.map((r) => r.id);
