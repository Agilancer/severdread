// Every scaling formula lives here so the game can be tuned in one place.
//
// Progression targets (see docs/DESIGN.md):
//   ~8 runs reaching depth 30  -> player level 30  ("relatively easy")
//   ~10 runs reaching depth 50 -> level 50         ("advanced")
//   ~20 runs reaching depth 150 -> level 200       ("best of the best")

export const MAX_LEVEL = 200;
export const BAG_BASE = 40;
export const BAG_MAX = 200;
export const BAG_STEP = 5;

// XP needed to go from `level` to level+1
export function xpToNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(40 * Math.pow(level, 1.6) * Math.pow(1.045, level));
}

// Base XP for a standard enemy on dungeon depth d (before monster multiplier)
export function enemyXP(depth) { return 14 * Math.pow(1.09, depth - 1); }

// The character level a depth is tuned for: 1:1 to depth 50, then 1.5 per
// depth so depth 150 meets level 200. Monsters and the loot they drop both
// scale with it, so gear can never outrun the dungeon you're actually in.
export function areaLevel(depth) { const d = Math.max(1, depth); return d <= 50 ? d : Math.round(50 + (d - 50) * 1.5); }

// How much of a full kit of on-level gear (rarity, affixes, patterns, armour,
// a few character levels ahead) a player has picked up by this area level:
// 0 on the first floor, ~0.5 by depth 5, ~0.85 by depth 12, then ~1
export function gearRamp(L) { return 1 - Math.exp(-(Math.max(1, L) - 1) / 6); }

// Monster stat multipliers per dungeon depth. The item-level curve alone
// assumes a plain common weapon; the gear ramp lets monsters keep up with the
// loot a player actually wears, so kills stay at about the same pace
export function monsterHpMult(depth) { const L = areaLevel(depth); return Math.pow(1.085, L - 1) * (1 + 0.04 * (L - 1)) * (1 + 1.0 * gearRamp(L)); }
export function monsterDmgMult(depth) { const L = areaLevel(depth); return Math.pow(1.065, L - 1) * (1 + 0.02 * (L - 1)) * (1 + 0.6 * gearRamp(L)); }
export function monsterArmor(depth) { return 2 + areaLevel(depth) * 1.5; }
export function monsterLevel(depth) { return depth; }

// How many standard enemies a level gets
export function enemyCount(depth, sizeFactor = 1) {
  return Math.round(Math.min(70, 12 + depth * 1.6) * sizeFactor);
}
// Chance a spawned monster is an elite (glowing, buffed, better loot)
export function eliteChance(depth) { return Math.min(0.3, 0.03 + depth * 0.006); }

// Item power by item level
export function weaponDamageMult(ilvl) { return Math.pow(1.075, ilvl - 1) * (1 + 0.05 * (ilvl - 1)); }
export function armorValue(ilvl) { return Math.round(6 * Math.pow(1.07, ilvl - 1) * (1 + 0.03 * (ilvl - 1))); }
export function flatStatMult(ilvl) { return Math.pow(1.06, ilvl - 1) * (1 + 0.02 * (ilvl - 1)); }
export function pctStatMult(ilvl) { return 1 + Math.min(1.5, (ilvl - 1) * 0.012); }
// +5 = 1.35x, +10 = 1.8x, +15 = 2.35x: an upgraded item lasts a few depths
// longer, it doesn't skip a tier of the dungeon
export function upgradeMult(upg) { return 1 + upg * 0.06 + upg * upg * 0.002; }

// Player base stats by character level
export function playerBaseHp(level) { return Math.round(100 + (level - 1) * 10 * Math.pow(1.025, level)); }
export function playerBaseAttack(level) { return Math.round((level - 1) * 0.6); }
// Flat attack is worth one pistol shot's share per hit: weapons that hit many
// times a second (minigun, flamer, shotgun pellets) get a matching fraction,
// so +attack adds about the same damage per second to every weapon
export function attackPerHit(attack, archDamage) { return attack * Math.max(0.15, (archDamage || 15) / 15); }

// Damage reduction from armor against an attacker of depth d (capped). Scaled
// by the armour the depth drops, so a full set of on-level gear blocks about
// a third at any depth instead of creeping to the cap.
export function armorReduction(armor, depth) { return Math.min(0.75, armor / (armor + 40 + 6 * armorValue(areaLevel(depth)))); }
// Monster armor reduces player damage a little
export function monsterReduction(armor, attackerLevel) { return Math.min(0.6, armor / (armor + 30 + 12 * attackerLevel)); }

// Drops: item level follows the depth (a couple below to one above), never
// the character level, so a fast-levelling character doesn't out-gear the
// floor it is on, and replaying shallow floors doesn't hand out deep gear
export function itemLevelRange(depth) { const L = areaLevel(depth); return [Math.max(1, L - 2), L + 1]; }
export function creditsFor(depth, mult = 1) { return Math.round(4 * Math.pow(1.08, depth - 1) * mult); }
export function rarityShift(depth, itemFind) {
  // multiplier applied to weights of uncommon+ tiers (index>0)
  return (1 + depth * 0.035) * (1 + itemFind);
}
export function itemValue(ilvl, rarityValueMult) { return Math.round(12 * Math.pow(1.07, ilvl - 1) * rarityValueMult); }

// Bag upgrade cost (k = upgrade number starting at 1)
export function bagUpgradeCost(k) {
  const cost = { credits: Math.round(400 * Math.pow(1.28, k - 1)), reagents: { nano_paste: 3 + k * 2 } };
  if (k >= 3) cost.reagents.cyber_core = Math.ceil((k - 2) / 2);
  if (k >= 6) cost.reagents.void_crystal = Math.ceil((k - 5) / 2);
  if (k >= 10) cost.reagents.boss_soul_shard = Math.ceil((k - 9) / 3);
  if (k >= 18) cost.reagents.astral_sigil = Math.ceil((k - 17) / 4);
  return cost;
}

// Upgrade cost for an item going to upgrade level `next` (1-based).
// `recipe` comes from the NPC definition (see data/npcs.js)
export function upgradeCost(item, next, recipe, rarityIndex) {
  const credits = Math.round(60 * Math.pow(1.07, item.level - 1) * Math.pow(next, 1.7) * (1 + rarityIndex * 0.5));
  const reagents = {};
  for (const step of recipe) {
    if (next < step.from) continue;
    const n = Math.max(1, Math.round(step.base + (next - step.from) * step.per));
    reagents[step.id] = (reagents[step.id] || 0) + n;
  }
  return { credits, reagents };
}
