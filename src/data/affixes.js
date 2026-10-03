// Random stat rolls ("affixes"). Values at item level 1; flat values scale
// with balance.flatStatMult(ilvl), percentages with pctStatMult(ilvl).
// slots: weapon, head, body, legs, ring
const ALL = ['weapon', 'head', 'body', 'legs', 'ring'];
const ARMOR = ['head', 'body', 'legs'];

export const AFFIXES = [
  { stat: 'attack', type: 'flat', range: [2, 5], slots: ['weapon', 'ring', 'head'], weight: 10 },
  { stat: 'dmgPct', type: 'pct', range: [0.04, 0.12], slots: ['weapon', 'ring', 'head'], weight: 10 },
  { stat: 'maxHp', type: 'flat', range: [8, 20], slots: ALL, weight: 10 },
  { stat: 'maxHpPct', type: 'pct', range: [0.03, 0.08], slots: [...ARMOR, 'ring'], weight: 6 },
  { stat: 'armor', type: 'flat', range: [2, 6], slots: ALL, weight: 9 },
  { stat: 'critChance', type: 'pct', range: [0.02, 0.06], slots: ['weapon', 'ring', 'head'], weight: 8, cap: 0.15 },
  { stat: 'critDamage', type: 'pct', range: [0.1, 0.3], slots: ['weapon', 'ring', 'head'], weight: 8 },
  { stat: 'moveSpeed', type: 'pct', range: [0.03, 0.08], slots: ['weapon', 'legs', 'ring'], weight: 7, cap: 0.15 },
  { stat: 'jumpHeight', type: 'pct', range: [0.05, 0.15], slots: ['weapon', 'legs', 'ring'], weight: 5, cap: 0.3 },
  { stat: 'dashes', type: 'int', range: [1, 1], slots: ['weapon', 'legs'], weight: 3 },
  { stat: 'dashRecharge', type: 'pct', range: [0.06, 0.15], slots: ['legs', 'ring', 'body'], weight: 5, cap: 0.35 },
  { stat: 'fireRate', type: 'pct', range: [0.04, 0.12], slots: ['weapon', 'ring'], weight: 8, cap: 0.3 },
  { stat: 'projSpeed', type: 'pct', range: [0.08, 0.2], slots: ['weapon'], weight: 4 },
  { stat: 'lifeSteal', type: 'pct', range: [0.01, 0.03], slots: ['weapon', 'ring'], weight: 4, cap: 0.06 },
  { stat: 'hpRegen', type: 'flat', range: [0.5, 1.5], slots: [...ARMOR, 'ring'], weight: 6 },
  { stat: 'statusChance', type: 'pct', range: [0.04, 0.12], slots: ['weapon', 'ring', 'head'], weight: 6 },
  { stat: 'creditFind', type: 'pct', range: [0.05, 0.15], slots: ['head', 'ring'], weight: 4 },
  { stat: 'xpGain', type: 'pct', range: [0.03, 0.08], slots: ['head', 'ring'], weight: 4 },
  { stat: 'itemFind', type: 'pct', range: [0.04, 0.1], slots: ['head', 'ring'], weight: 3 },
  { stat: 'reagentFind', type: 'pct', range: [0.05, 0.15], slots: ['body', 'ring'], weight: 3 },
  { stat: 'pickupRadius', type: 'pct', range: [0.15, 0.4], slots: ['ring', 'legs'], weight: 3 },
  { stat: 'thorns', type: 'flat', range: [3, 8], slots: ['body'], weight: 4 },
  { stat: 'allRes', type: 'pct', range: [0.03, 0.07], slots: [...ARMOR, 'ring'], weight: 4, cap: 0.15 },
  { stat: 'bossDmg', type: 'pct', range: [0.05, 0.15], slots: ['weapon', 'head', 'ring'], weight: 4 },
  { stat: 'splash', type: 'pct', range: [0.1, 0.3], slots: ['weapon'], weight: 2 },
  // elemental damage bonuses (armour and rings can roll these too)
  ...['fire', 'ice', 'lightning', 'poison', 'void', 'holy', 'plasma', 'blood', 'arcane'].map((e) => ({ stat: e + 'Dmg', type: 'pct', range: [0.06, 0.16], slots: ALL, weight: 2.2, element: e })),
  ...['fire', 'ice', 'lightning', 'poison', 'void'].map((e) => ({ stat: e + 'Res', type: 'pct', range: [0.06, 0.15], slots: [...ARMOR, 'ring'], weight: 2.5, cap: 0.35 })),
];
