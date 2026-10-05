// Ammo (DOOM style): six pools shared by every weapon of a type. Basic guns
// (pistol, revolver, smg, rifle, lmg, shuriken) and melee never run dry - the
// reliable baseline; the heavy hitters spend ammo and have to be fed from
// drops, level caches, chests and the station shop.
//
// max: capacity at +0% Ammo Capacity, sized so a full load is ~25-40 s of
// continuous fire for the type's weapons. small / box: what a pack / a box
// holds. issue: share of max a new run starts with (station issue).

export const AMMO = {
  shells: { name: 'Shells', color: '#ff6a4a', max: 40, small: 8, box: 24 },
  heavy: { name: 'Heavy Rounds', short: 'Heavy', color: '#ffc040', max: 400, small: 60, box: 200 },
  explosives: { name: 'Explosives', color: '#ff9a2a', max: 30, small: 4, box: 12 },
  cells: { name: 'Cells', color: '#48d0ff', max: 300, small: 40, box: 120 },
  fuel: { name: 'Fuel', color: '#a8f040', max: 600, small: 80, box: 240 },
  bolts: { name: 'Bolts', color: '#c890ff', max: 40, small: 8, box: 24 },
};
export const AMMO_TYPES = Object.keys(AMMO);
export const AMMO_ISSUE = 0.5;        // new runs top every type up to half full
export const AMMO_CAP_MAX = 1;        // Ammo Capacity stat: at most +100% in total

// Every weapon archetype: [ammo type, cost per shot] or null (unlimited).
// One shot costs once however many pellets / pattern projectiles / multishot
// copies it throws. tests/ammo.test.js checks every ARCHETYPES key is here.
export const ARCH_AMMO = {
  pistol: null, revolver: null, smg: null, rifle: null, lmg: null, shuriken: null,
  blade: null, mace: null, club: null,
  shotgun: ['shells', 1], super_shotgun: ['shells', 2],
  minigun: ['heavy', 1], sniper: ['heavy', 10],
  rocket: ['explosives', 1], grenade: ['explosives', 1], nailgun: ['explosives', 1],
  plasma: ['cells', 1], lightning: ['cells', 1], launcher: ['cells', 3], spreader: ['cells', 5], rail: ['cells', 10],
  flamer: ['fuel', 1], sprayer: ['fuel', 1],
  crossbow: ['bolts', 1], harpoon: ['bolts', 1], javelin: ['bolts', 1],
};

// {type, cost} for a weapon item / archetype id, or null when it never runs dry
export function weaponAmmo(w) {
  const a = ARCH_AMMO[typeof w === 'string' ? w : w?.archetype];
  return a ? { type: a[0], cost: a[1] } : null;
}

// Monster drops (combat.js killMonster): chance of a pack / a box, and how
// strongly the type leans toward the ammo the player's guns actually use
export const AMMO_DROPS = { normal: 0.1, elite: 0.4, eliteBox: 0.15, bossBoxes: [1, 2], bias: 0.7 };
// Level caches (levelgen/ammo.js): boxes and packs per level
export const AMMO_SPOTS = { boxes: [2, 5], packs: [4, 8] };
