// Ammo (DOOM style): six pools shared by every weapon of a type. Basic guns
// (pistol, revolver, smg, rifle, lmg, shuriken) and melee never run dry - the
// reliable baseline; the heavy hitters spend ammo and have to be fed from
// drops, level caches, chests and the station shop.
//
// Tuned with tests/balance.test.js (-v prints the tables), in seconds of
// fire of the type's guns:
//   - a full load (max) is ~25 s: most of a boss fight
//   - a pack ~1.5 s, a box ~4.5 s: what a floor hands out (drops, caches,
//     chests, the boss) keeps one ammo type firing for ~35-45% of the floor's
//     firing time (two types split it); the unlimited gun does the rest
//   - the station issue lets the first floors of a run lean on ammo more
// small / box: what a pack / a box holds.

export const AMMO = {
  shells: { name: 'Shells', color: '#ff6a4a', max: 35, small: 2, box: 6 },
  heavy: { name: 'Heavy Rounds', short: 'Heavy', color: '#ffc040', max: 360, small: 22, box: 65 },
  explosives: { name: 'Explosives', color: '#ff9a2a', max: 30, small: 2, box: 5 },
  cells: { name: 'Cells', color: '#48d0ff', max: 220, small: 13, box: 40 },
  fuel: { name: 'Fuel', color: '#a8f040', max: 520, small: 30, box: 95 },
  bolts: { name: 'Bolts', color: '#c890ff', max: 30, small: 2, box: 5 },
};
export const AMMO_TYPES = Object.keys(AMMO);
export const AMMO_ISSUE = 0.35;       // new runs top every type up to a third of a load
export const AMMO_CAP_MAX = 0.75;     // Ammo Capacity stat: at most +75% in total (more to save for a boss, never more found)

// Every weapon archetype: [ammo type, cost per shot, power] or null (unlimited).
// One shot costs once however many pellets / pattern projectiles / multishot
// copies it throws; costs keep every gun of a type draining at about the same
// rate (sniper 15 x 1/s ~ minigun 17/s). power: damage premium for spending
// ammo, so an ammo gun of the same rarity and level kills ~1.2x as fast as an
// unlimited one in a real fight (tests/fight.mjs measures how much of its full
// damage each gun deals: wide pellets / fans and slow orbs get the most;
// rail, sniper and lightning already out-kill everything through pierce and
// chains and get none). tests/ammo.test.js checks every ARCHETYPES key is here.
export const ARCH_AMMO = {
  pistol: null, revolver: null, smg: null, rifle: null, lmg: null, shuriken: null,
  blade: null, mace: null, club: null,
  shotgun: ['shells', 1, 2.1], super_shotgun: ['shells', 2, 2.5],
  minigun: ['heavy', 1, 1.35], sniper: ['heavy', 15, 1],
  rocket: ['explosives', 1, 1.35], grenade: ['explosives', 1, 1.25], nailgun: ['explosives', 1, 1.6],
  plasma: ['cells', 1, 1.75], lightning: ['cells', 1, 1], launcher: ['cells', 3, 1.3], spreader: ['cells', 5, 2.5], rail: ['cells', 10, 1],
  flamer: ['fuel', 1, 1.6], sprayer: ['fuel', 1, 2.15],
  crossbow: ['bolts', 1, 1.05], harpoon: ['bolts', 1, 1.15], javelin: ['bolts', 1, 1.3],
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
export const AMMO_DROPS = { normal: 0.1, elite: 0.35, eliteBox: 0.15, bossBoxes: [1, 2], bias: 0.7 };
// Chests (Game.openChest): chance of ammo and the share of it that is a box
// rather than a pack (deep floors have up to 7 chests)
export const AMMO_CHEST = { chance: 1, box: 0 };
// Level caches (levelgen/ammo.js): boxes and packs per level, times the level
// size (0.7-1.4, like the monster count). One of the boxes waits just before
// the boss arena and always holds ammo for an equipped gun (Game.stockAmmo).
export const AMMO_SPOTS = { boxes: [1, 2], packs: [2, 3] };
