// Aggregates the player's final stats from level + all equipped gear.
import { emptyStats } from '../data/stats.js';
import { ABILITIES } from '../data/abilities.js';
import * as B from '../data/balance.js';
import { upgradedArmor, upgradedStat, upgradedAbility } from './items.js';

export function computeStats(level, equipment, buffs = {}) {
  const s = emptyStats();
  const ab = {};
  let armorFromGear = 0;
  const items = Object.values(equipment).filter(Boolean);
  for (const it of items) {
    armorFromGear += upgradedArmor(it);
    for (const k in it.stats) s[k] = (s[k] || 0) + upgradedStat(it, k);
    for (const a of it.abilities || []) {
      const def = ABILITIES[a.id];
      if (!def) continue;
      const v = upgradedAbility(it, a);
      if (def.stack === 'sum') ab[a.id] = (ab[a.id] || 0) + v;
      else ab[a.id] = Math.max(ab[a.id] || 0, v);
    }
  }
  // abilities that map straight onto stats
  for (const [id, v] of Object.entries(ab)) {
    const def = ABILITIES[id];
    if (def.key) s[def.key] = (s[def.key] || 0) + v;
  }
  if (ab.swiftness) s.moveSpeed += ab.swiftness;
  if (ab.extra_dash) s.dashes += ab.extra_dash;

  const out = {
    level,
    maxHp: Math.round((B.playerBaseHp(level) + s.maxHp) * (1 + s.maxHpPct) * (ab.glass_cannon ? 0.7 : 1)),
    armor: Math.round((armorFromGear + s.armor) * (1 + (ab.iron_skin || 0)) + (buffs.armor || 0)),
    attack: B.playerBaseAttack(level) + s.attack,
    dmgPct: s.dmgPct + (ab.glass_cannon || 0),
    critChance: Math.min(0.75, 0.05 + s.critChance),
    critMult: 1.5 + s.critDamage,
    moveSpeed: 1 + Math.min(0.8, s.moveSpeed),
    jumpMult: 1 + Math.min(0.8, s.jumpHeight),
    airJumps: Math.min(4, Math.round(s.airJumps)),
    dashes: Math.min(6, 2 + Math.round(s.dashes)),
    dashRecharge: 1.6 / (1 + Math.min(0.7, s.dashRecharge)),
    fireRate: 1 + Math.min(1.0, s.fireRate),
    projSpeed: 1 + s.projSpeed,
    lifeSteal: Math.min(0.15, s.lifeSteal + (ab.vampiric || 0)),
    hpRegen: s.hpRegen,
    statusChance: s.statusChance,
    creditFind: s.creditFind,
    xpGain: s.xpGain,
    itemFind: s.itemFind,
    reagentFind: s.reagentFind,
    pickupRadius: 1.4 * (1 + s.pickupRadius),
    thorns: s.thorns,
    bossDmg: s.bossDmg + (ab.boss_slayer || 0),
    splash: s.splash,
    elemDmg: { fire: s.fireDmg, ice: s.iceDmg, lightning: s.lightningDmg, poison: s.poisonDmg, void: s.voidDmg, holy: s.holyDmg, plasma: s.plasmaDmg, blood: s.bloodDmg, arcane: s.arcaneDmg, physical: 0 },
    res: { fire: s.fireRes + s.allRes, ice: s.iceRes + s.allRes, lightning: s.lightningRes + s.allRes, poison: s.poisonRes + s.allRes, void: s.voidRes + s.allRes, holy: s.allRes, plasma: s.allRes, blood: s.allRes, arcane: s.allRes, physical: 0 },
    abilities: ab,
    raw: s,
  };
  for (const k in out.res) out.res[k] = Math.min(0.75, out.res[k]);
  return out;
}
