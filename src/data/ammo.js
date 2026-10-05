// Ammo (DOOM style): six pools shared by every weapon of a type. Basic guns
// (pistol, revolver, smg, rifle, lmg, shuriken) and melee never run dry - the
// reliable baseline; the heavy hitters spend ammo and have to be fed from
// drops, level caches, chests and the station shop.
//
// Tuned with tests/balance.test.js (-v prints the table). The intent:
//   - a full load (max) is ~20-35 s of continuous fire for the type's guns -
//     enough for most of a boss fight
//   - a pack is ~2 s of fire, a box ~5 s: a floor's finds keep the ammo guns
//     going for ~30-50% of its firing time with one ammo type equipped (two
//     types split it); the unlimited gun does the rest
//   - the station issue (half a load) lets the first floors of a run lean on
//     ammo a little more
// issue: share of max a new run starts with (station issue).

export const AMMO = {
  shells: { name: 'Shells', color: '#ff6a4a', max: 32, small: 3, box: 8 },
  heavy: { name: 'Heavy Rounds', short: 'Heavy', color: '#ffc040', max: 300, small: 25, box: 70 },
  explosives: { name: 'Explosives', color: '#ff9a2a', max: 26, small: 2, box: 6 },
  cells: { name: 'Cells', color: '#48d0ff', max: 200, small: 15, box: 45 },
  fuel: { name: 'Fuel', color: '#a8f040', max: 460, small: 35, box: 100 },
  bolts: { name: 'Bolts', color: '#c890ff', max: 25, small: 2, box: 6 },
};
export const AMMO_TYPES = Object.keys(AMMO);
export const AMMO_ISSUE = 0.5;        // new runs top every type up to half full
export const AMMO_CAP_MAX = 1;        // Ammo Capacity stat: at most +100% in total

// Every weapon archetype: [ammo type, cost per shot, power] or null (unlimited).
// One shot costs once however many pellets / pattern projectiles / multishot
// copies it throws. power: damage premium for spending ammo - an ammo gun of
// the same rarity and level kills ~1.3-1.6x as fast as an unlimited one in a
// typical fight (splash / pierce / chain counted, shotgun pellets at mid
// range), so the limited guns feel powerful when they come out.
// tests/ammo.test.js checks every ARCHETYPES key is here.
export const ARCH_AMMO = {
  pistol: null, revolver: null, smg: null, rifle: null, lmg: null, shuriken: null,
  blade: null, mace: null, club: null,
  shotgun: ['shells', 1, 1.75], super_shotgun: ['shells', 2, 1.65],
  minigun: ['heavy', 1, 1.3], sniper: ['heavy', 10, 1],
  rocket: ['explosives', 1, 1], grenade: ['explosives', 1, 1.05], nailgun: ['explosives', 1, 1],
  plasma: ['cells', 1, 1.1], lightning: ['cells', 1, 1.35], launcher: ['cells', 3, 1.25], spreader: ['cells', 5, 1.5], rail: ['cells', 10, 1],
  flamer: ['fuel', 1, 1.2], sprayer: ['fuel', 1, 1.25],
  crossbow: ['bolts', 1, 1.3], harpoon: ['bolts', 1, 1.2], javelin: ['bolts', 1, 1.3],
};

// {type, cost, power} for a weapon item / archetype id, or null when it never runs dry
export function weaponAmmo(w) {
  const a = ARCH_AMMO[typeof w === 'string' ? w : w?.archetype];
  return a ? { type: a[0], cost: a[1], power: a[2] || 1 } : null;
}
// damage multiplier of a weapon item / archetype (1 for unlimited guns)
export function ammoPower(w) { return weaponAmmo(w)?.power || 1; }

// Monster drops (combat.js killMonster): chance of a pack / a box, and how
// strongly the type leans toward the ammo the player's guns actually use.
// Bosses drop a box or two for the next floor.
export const AMMO_DROPS = { normal: 0.06, elite: 0.3, eliteBox: 0.08, bossBoxes: [1, 2], bias: 0.7 };
// Chests: always some ammo - a pack, or a box now and then
export const AMMO_CHEST = { chance: 0.4, box: 0.25 };
// Level caches (levelgen/ammo.js): boxes and packs per level (more in big
// levels, inside the range). One of the boxes waits just before the boss
// arena and always holds ammo for an equipped gun (Game.stockAmmo).
export const AMMO_SPOTS = { boxes: [1, 2], packs: [1, 2] };
