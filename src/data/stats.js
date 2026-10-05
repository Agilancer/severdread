// Character stat keys. Items roll these as affixes; the player's final stats
// are the sum over all equipped gear (+ level growth + temporary buffs).
// fmt: 'pct' shows as +12%, 'int' as +3, 'flat' as +12, 'sec' as +1.2/s
export const STATS = {
  attack: { name: 'Attack', fmt: 'flat', desc: 'Flat damage added to every hit' },
  dmgPct: { name: 'Damage', fmt: 'pct' },
  maxHp: { name: 'Max Health', fmt: 'flat' },
  maxHpPct: { name: 'Max Health', fmt: 'pct' },
  armor: { name: 'Armor', fmt: 'flat' },
  critChance: { name: 'Crit Chance', fmt: 'pct' },
  critDamage: { name: 'Crit Damage', fmt: 'pct' },
  moveSpeed: { name: 'Move Speed', fmt: 'pct' },
  jumpHeight: { name: 'Jump Height', fmt: 'pct' },
  dashes: { name: 'Dash Charges', fmt: 'int' },
  dashRecharge: { name: 'Dash Recharge', fmt: 'pct' },
  fireRate: { name: 'Fire Rate', fmt: 'pct' },
  projSpeed: { name: 'Projectile Speed', fmt: 'pct' },
  lifeSteal: { name: 'Life Steal', fmt: 'pct' },
  hpRegen: { name: 'Health Regen', fmt: 'sec' },
  statusChance: { name: 'Status Chance', fmt: 'pct' },
  creditFind: { name: 'Credit Find', fmt: 'pct' },
  xpGain: { name: 'XP Gain', fmt: 'pct' },
  itemFind: { name: 'Item Rarity', fmt: 'pct' },
  reagentFind: { name: 'Reagent Find', fmt: 'pct' },
  pickupRadius: { name: 'Pickup Radius', fmt: 'pct' },
  thorns: { name: 'Thorns', fmt: 'flat' },
  allRes: { name: 'All Resistance', fmt: 'pct' },
  bossDmg: { name: 'Boss Damage', fmt: 'pct' },
  airJumps: { name: 'Air Jumps', fmt: 'int' },
  splash: { name: 'Splash Radius', fmt: 'pct' },
  // elemental damage bonuses
  fireDmg: { name: 'Fire Damage', fmt: 'pct', element: 'fire' },
  iceDmg: { name: 'Frost Damage', fmt: 'pct', element: 'ice' },
  lightningDmg: { name: 'Shock Damage', fmt: 'pct', element: 'lightning' },
  poisonDmg: { name: 'Toxic Damage', fmt: 'pct', element: 'poison' },
  voidDmg: { name: 'Void Damage', fmt: 'pct', element: 'void' },
  holyDmg: { name: 'Holy Damage', fmt: 'pct', element: 'holy' },
  plasmaDmg: { name: 'Plasma Damage', fmt: 'pct', element: 'plasma' },
  bloodDmg: { name: 'Blood Damage', fmt: 'pct', element: 'blood' },
  arcaneDmg: { name: 'Arcane Damage', fmt: 'pct', element: 'arcane' },
  // resistances
  fireRes: { name: 'Fire Resist', fmt: 'pct', resist: 'fire' },
  iceRes: { name: 'Frost Resist', fmt: 'pct', resist: 'ice' },
  lightningRes: { name: 'Shock Resist', fmt: 'pct', resist: 'lightning' },
  poisonRes: { name: 'Toxic Resist', fmt: 'pct', resist: 'poison' },
  voidRes: { name: 'Void Resist', fmt: 'pct', resist: 'void' },
};

export function formatStat(key, v) {
  const s = STATS[key];
  if (!s) return `${key} ${v}`;
  const sign = v >= 0 ? '+' : '-';
  const a = Math.abs(v);
  switch (s.fmt) {
    case 'pct': return `${sign}${(a * 100).toFixed(a < 0.1 ? 1 : 0)}% ${s.name}`;
    case 'int': return `${sign}${Math.round(a)} ${s.name}`;
    case 'sec': return `${sign}${a.toFixed(1)}/s ${s.name}`;
    default: return `${sign}${Math.round(a)} ${s.name}`;
  }
}

export function emptyStats() {
  const o = {};
  for (const k in STATS) o[k] = 0;
  return o;
}
