// Item generation: weapons, armour (head/body/legs) and rings with random
// stats, elements, fire patterns and abilities.
import { Rng } from '../core/rng.js';
import { RARITIES, RARITY } from '../data/rarities.js';
import { ARCHETYPES, PATTERNS, NAME_PARTS } from '../data/weapons.js';
import { AFFIXES } from '../data/affixes.js';
import { ABILITIES } from '../data/abilities.js';
import { ELEMENTS } from '../data/elements.js';
import { ARMOR_NAMES, ARMOR_SLOT_ARMOR, MATERIALS, RING_NAMES, RING_BANDS } from '../data/armor.js';
import { STATS, formatStat } from '../data/stats.js';
import * as B from '../data/balance.js';

export const SLOT_KINDS = ['weapon', 'head', 'body', 'legs', 'ring'];
let uidCounter = 0;
const uid = (rng) => Date.now().toString(36) + (uidCounter++).toString(36) + rng.int(0, 1e6).toString(36);

export function rollRarity(rng, depth = 1, itemFind = 0, min = 0, max = 4) {
  const shift = B.rarityShift(depth, itemFind);
  const pool = RARITIES.filter((r, i) => i >= min && i <= max).map((r) => ({ r, w: r.weight * (RARITY[r.id].index > 0 ? Math.pow(shift, RARITY[r.id].index * 0.7) : 1) }));
  return rng.weighted(pool, (p) => p.w).r.id;
}

export function rollItemLevel(rng, playerLevel) {
  const [a, b] = B.itemLevelRange(playerLevel);
  return Math.min(B.MAX_LEVEL + 5, rng.int(a, b));
}

function affixValue(rng, a, level, rarity) {
  const r = RARITY[rarity];
  const [lo, hi] = a.range;
  let v = rng.float(lo, hi);
  if (a.type === 'flat') v *= B.flatStatMult(level) * r.statMult;
  else if (a.type === 'pct') { v *= B.pctStatMult(level) * r.statMult; if (a.cap) v = Math.min(v, a.cap * (1 + r.index * 0.15)); }
  else v = Math.round(v);
  return a.type === 'pct' ? Math.round(v * 1000) / 1000 : a.type === 'int' ? v : Math.round(v * 10) / 10;
}

function rollAffixes(rng, slot, level, rarity, preferElement) {
  const r = RARITY[rarity];
  const n = rng.int(r.affixes[0], r.affixes[1]);
  const stats = {};
  const pool = AFFIXES.filter((a) => a.slots.includes(slot));
  for (let k = 0; k < n && pool.length; k++) {
    const a = rng.weighted(pool, (x) => x.weight * (preferElement && x.element === preferElement ? 4 : 1));
    pool.splice(pool.indexOf(a), 1);
    stats[a.stat] = (stats[a.stat] || 0) + affixValue(rng, a, level, rarity);
  }
  return stats;
}

function rollAbilities(rng, slot, level, rarity, count) {
  const r = RARITY[rarity];
  const out = [];
  const pool = Object.entries(ABILITIES).filter(([, a]) => a.slots.includes(slot) && (a.minRarity || 0) <= r.index);
  for (let k = 0; k < count && pool.length; k++) {
    const pick = rng.weighted(pool, ([, a]) => a.weight);
    pool.splice(pool.indexOf(pick), 1);
    // jump abilities are mutually exclusive on one item
    if (pick[0].endsWith('_jump')) for (const j of ['double_jump', 'triple_jump', 'quad_jump']) { const i = pool.findIndex(([id]) => id === j); if (i >= 0) pool.splice(i, 1); }
    const q = Math.min(1.2, (level / 80) * 0.6 + r.index * 0.12 + rng.float(0, 0.3));
    let v = pick[1].roll(q, rng);
    if (typeof v === 'number' && !Number.isInteger(v)) v = Math.round(v * 1000) / 1000;
    out.push({ id: pick[0], v });
  }
  return out;
}

// ---------------------------------------------------------------- weapons
export function generateWeapon(rng, level, rarity, bases, forcedBase) {
  const r = RARITY[rarity];
  const enabled = bases.filter((b) => b.enabled);
  // Uploaded sheets are tagged with a rarity tier: a rare drop uses art from
  // the rare sheets when there is any. Untiered bases fit every rarity.
  let pool = enabled.filter((b) => b.rarity === rarity);
  if (!pool.length) pool = enabled.filter((b) => !b.rarity);
  if (!pool.length) pool = enabled;
  const base = forcedBase || rng.weighted(pool, (b) => (b.real ? 3 : 1));
  const arch = ARCHETYPES[base.archetype];
  let element = base.element && base.element !== 'physical' ? base.element : (arch.defaultElement || 'physical');
  let infused = false;
  if (element === 'physical' && rng.chance([0.04, 0.15, 0.35, 0.5, 0.7][r.index])) {
    element = rng.pick(Object.keys(ELEMENTS).filter((e) => e !== 'physical'));
    infused = true; // gets a glow effect since the art doesn't show it
  }
  const damage = arch.damage * B.weaponDamageMult(level) * r.statMult * rng.float(0.9, 1.12);
  const rate = arch.rate * rng.float(0.92, 1.08) * (1 + r.index * 0.02);
  // fire patterns
  const patterns = [];
  let nPat = r.patterns;
  if (r.index === 2) nPat = rng.chance(0.55) ? 1 : 0;
  if (r.index === 4) nPat = rng.int(1, 2);
  const patPool = Object.entries(PATTERNS).filter(([, p]) => p.ok(arch) && (p.minRarity || 0) <= r.index);
  for (let k = 0; k < nPat && patPool.length; k++) {
    const [id, p] = rng.weighted(patPool, ([, pp]) => pp.weight);
    patPool.splice(patPool.findIndex(([pid]) => pid === id), 1);
    if (id === 'fan') { const i = patPool.findIndex(([pid]) => pid === 'burst_ring'); if (i >= 0) patPool.splice(i, 1); }
    if (id === 'burst_ring') { const i = patPool.findIndex(([pid]) => pid === 'fan'); if (i >= 0) patPool.splice(i, 1); }
    const q = Math.min(1, r.index * 0.22 + rng.float(0, 0.3));
    patterns.push({ id, n: p.roll ? p.roll(q, rng) : 0 });
  }
  const stats = rollAffixes(rng, 'weapon', level, rarity, element !== 'physical' ? element : null);
  const abilities = rollAbilities(rng, 'weapon', level, rarity, r.index >= 4 ? 1 : r.index === 3 && rng.chance(0.3) ? 1 : 0);
  const item = {
    uid: uid(rng), kind: 'weapon', base: base.id, archetype: base.archetype, rarity, level, upgrade: 0,
    element, infused, damage: round2(damage), rate: round2(rate), patterns, stats, abilities,
    statusChance: element === 'physical' ? 0 : round2(0.1 + (arch.statusBonus || 0) + r.index * 0.02),
    seed: rng.int(0, 1e9),
  };
  item.name = weaponName(rng, item, base);
  if (rarity === 'legendary') item.subname = base.name;
  return item;
}

function weaponName(rng, item, base) {
  const r = RARITY[item.rarity];
  const elemAdj = item.element !== 'physical' ? rng.pick(ELEMENTS[item.element].adj) : null;
  switch (r.index) {
    case 0: return base.name;
    case 1: return `${rng.pick(NAME_PARTS.uncommon)} ${base.name}`;
    case 2: return `${elemAdj || rng.pick(NAME_PARTS.rare)} ${base.name}`;
    case 3: return `${elemAdj || rng.pick(NAME_PARTS.rare)} ${base.name} ${rng.pick(NAME_PARTS.epicSuffix)}`;
    default: { const n = rng.pick(NAME_PARTS.legendA) + rng.pick(NAME_PARTS.legendB); return (rng.chance(0.3) ? 'The ' : '') + n; }
  }
}

// ---------------------------------------------------------------- armour
export function generateArmor(rng, slot, level, rarity) {
  const r = RARITY[rarity];
  const mat = [...MATERIALS].reverse().find((m) => level >= m.minLevel) || MATERIALS[0];
  const armor = B.armorValue(level) * ARMOR_SLOT_ARMOR[slot] * r.statMult * rng.float(0.9, 1.12);
  const elemPref = rng.chance(0.3) ? rng.pick(['fire', 'ice', 'lightning', 'poison', 'void', 'holy', 'plasma', 'blood', 'arcane']) : null;
  const stats = rollAffixes(rng, slot, level, rarity, elemPref);
  const abilities = rollAbilities(rng, slot, level, rarity, r.index >= 4 ? 1 : r.index === 3 && rng.chance(0.35) ? 1 : 0);
  const glowElem = Object.keys(stats).map((k) => STATS[k]?.element).find(Boolean);
  const glow = r.index >= 2 ? (glowElem ? ELEMENTS[glowElem].color : r.color) : null;
  const slotName = rng.pick(ARMOR_NAMES[slot]);
  const style = rng.int(0, 3);
  const item = {
    uid: uid(rng), kind: slot, rarity, level, upgrade: 0, armor: Math.round(armor), stats, abilities,
    material: mat.name, seed: rng.int(0, 1e9),
    icon: { key: `${slot}_${mat.name}_${glow || 'n'}_${style}`, pal: { base: mat.base, trim: mat.trim, glow }, seed: style * 101 + 7 },
  };
  const adj = r.index === 0 ? '' : r.index === 1 ? rng.pick(NAME_PARTS.uncommon) + ' ' : r.index === 2 ? rng.pick(NAME_PARTS.rare) + ' ' : '';
  item.name = r.index >= 4 ? `${rng.pick(NAME_PARTS.legendA)}${rng.pick(NAME_PARTS.legendB)} ${slotName}`
    : r.index === 3 ? `${mat.name} ${slotName} ${rng.pick(NAME_PARTS.epicSuffix)}` : `${adj}${mat.name} ${slotName}`;
  return item;
}

// ---------------------------------------------------------------- rings
export function generateRing(rng, level, rarity) {
  const r = RARITY[rarity];
  const nAb = r.index === 0 ? (rng.chance(0.3) ? 1 : 0) : r.index === 1 ? (rng.chance(0.65) ? 1 : 0) : r.index === 2 ? 1 : r.index === 3 ? rng.int(1, 2) : 2;
  const abilities = rollAbilities(rng, 'ring', level, rarity, nAb);
  const stats = rollAffixes(rng, 'ring', level, rarity, null);
  const gemColor = abilities.length ? abilityColor(abilities[0].id) : (r.index ? r.color : '#a0a0a0');
  const band = rng.pick(RING_BANDS);
  const ringName = rng.pick(RING_NAMES);
  const item = {
    uid: uid(rng), kind: 'ring', rarity, level, upgrade: 0, stats, abilities, seed: rng.int(0, 1e9),
    icon: { key: `${band}_${gemColor}_${ringName.length % 3}`, pal: { band, gem: gemColor }, seed: ringName.length },
  };
  const ab = abilities[0] ? ABILITIES[abilities[0].id].name : null;
  if (r.index >= 4) item.name = `${rng.pick(NAME_PARTS.legendA)}${rng.pick(NAME_PARTS.legendB)} ${ringName}`;
  else item.name = ab ? `${ringName} of ${ab}` : `${r.index ? rng.pick(NAME_PARTS.uncommon) + ' ' : ''}${ringName}`;
  return item;
}

function abilityColor(id) {
  if (/jump|glide|jet|feather|meteor|wall/.test(id)) return '#60d0ff';
  if (/dash|blink|swift|momentum|adrenaline/.test(id)) return '#40ff90';
  if (/vamp|regen|wind|heal|kill_shield|last/.test(id)) return '#ff3050';
  if (/ignite|burn|meteor/.test(id)) return '#ff7020';
  if (/freeze|frost/.test(id)) return '#a0e8ff';
  if (/lightning|static|chain/.test(id)) return '#ffe040';
  if (/treasure|lucky|scav|scholar|magnet/.test(id)) return '#ffcc33';
  if (/gravity|void|bullet_time|overcharge/.test(id)) return '#b040ff';
  return '#e0e0e0';
}

// ---------------------------------------------------------------- generic
export function generateItem(rng, { kind, level, rarity, bases, depth = 1, itemFind = 0, minRarity = 0, maxRarity = 4 }) {
  rarity = rarity || rollRarity(rng, depth, itemFind, minRarity, maxRarity);
  kind = kind || rng.weighted([{ k: 'weapon', w: 38 }, { k: 'head', w: 14 }, { k: 'body', w: 14 }, { k: 'legs', w: 14 }, { k: 'ring', w: 20 }], (x) => x.w).k;
  if (kind === 'weapon') return generateWeapon(rng, level, rarity, bases);
  if (kind === 'ring') return generateRing(rng, level, rarity);
  return generateArmor(rng, kind, level, rarity);
}

// ---------------------------------------------------------------- derived values
const round2 = (v) => Math.round(v * 100) / 100;
export function upgradedDamage(item) { return item.damage * B.upgradeMult(item.upgrade); }
export function upgradedArmor(item) { return Math.round((item.armor || 0) * B.upgradeMult(item.upgrade)); }
export function upgradedStat(item, key) { const v = item.stats[key] || 0; return STATS[key]?.fmt === 'int' ? v : v * (1 + item.upgrade * 0.04); }
export function upgradedAbility(item, ab) {
  if (typeof ab.v !== 'number' || Number.isInteger(ab.v)) return ab.v;
  return ab.v * (1 + item.upgrade * 0.03);
}
export function sellValue(item) { return Math.round(B.itemValue(item.level, RARITY[item.rarity].valueMult) * (1 + item.upgrade * 0.3)); }
export function buyValue(item) { return sellValue(item) * 4; }
export function maxUpgrade(item) { return RARITY[item.rarity].maxUpgrade; }
export function dps(item) {
  const a = ARCHETYPES[item.archetype];
  const pellets = Math.max(1, a.pellets || 1) * (patternN(item, 'fan') || 1);
  return upgradedDamage(item) * item.rate * pellets;
}
export function patternN(item, id) { const p = item.patterns?.find((x) => x.id === id); return p ? (p.n || 1) : 0; }
export function itemScore(item) {
  if (item.kind === 'weapon') return dps(item);
  return upgradedArmor(item) * 3 + Object.keys(item.stats).length * 10 + item.abilities.length * 25;
}

// Tooltip lines: [{text, cls}]
export function describeItem(item) {
  const lines = [];
  const r = RARITY[item.rarity];
  if (item.kind === 'weapon') {
    const a = ARCHETYPES[item.archetype];
    const pel = Math.max(1, a.pellets || 1);
    lines.push({ text: `${Math.round(upgradedDamage(item))}${pel > 1 ? ' x' + pel : ''} damage`, cls: 'big' });
    lines.push({ text: `${item.rate.toFixed(1)} shots/s · ${Math.round(dps(item))} DPS`, cls: '' });
    if (item.element !== 'physical') lines.push({ text: `${ELEMENTS[item.element].name} element · ${Math.round(item.statusChance * 100)}% status chance`, cls: 'elem', color: ELEMENTS[item.element].color });
    for (const p of item.patterns) lines.push({ text: `${PATTERNS[p.id].name}: ${PATTERNS[p.id].desc(p.n)}`, cls: 'pattern' });
  } else if (item.kind !== 'ring') {
    lines.push({ text: `${upgradedArmor(item)} armor`, cls: 'big' });
  }
  for (const k of Object.keys(item.stats)) lines.push({ text: formatStat(k, upgradedStat(item, k)), cls: '' });
  for (const ab of item.abilities) {
    const def = ABILITIES[ab.id];
    if (def) lines.push({ text: `${def.name}: ${def.desc(upgradedAbility(item, ab))}`, cls: 'ability' });
  }
  void r;
  return lines;
}

export function kindLabel(item) {
  if (item.kind === 'weapon') return ARCHETYPES[item.archetype]?.name || 'Weapon';
  return { head: 'Head Armor', body: 'Body Armor', legs: 'Leg Armor', ring: 'Ring' }[item.kind];
}

export { Rng };
