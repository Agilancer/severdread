// Damage balance: a first run straight down from depth 1, picking up and
// wearing the best of what drops (monsters, elites, the boss, chests and the
// pedestal), with the game's own item, stat and balance code. Weapons and gear
// must not outrun the dungeon:
//   - time to kill a standard monster stays about the same as the starting
//     pistol on depth 1 (no early collapse to a fraction of a second)
//   - hits a standard monster needs to kill the player stay in a sane band
//   - nothing drops more than a couple of item levels above the floor's area level
// Run with -v for the per-depth table.
import * as B from '../src/data/balance.js';
import { generateItem, upgradedDamage, rollItemLevel } from '../src/game/items.js';
import { computeStats } from '../src/game/stats.js';
import { ARCHETYPES, PLACEHOLDER_BASES } from '../src/data/weapons.js';
import { RARITY } from '../src/data/rarities.js';
import { pedestalMinRarity } from '../src/data/scatter.js';
import { Rng } from '../src/core/rng.js';

const verbose = process.argv.includes('-v');
const bases = PLACEHOLDER_BASES.map((b) => ({ ...b, enabled: true }));
const START = { archetype: 'pistol', damage: ARCHETYPES.pistol.damage, rate: ARCHETYPES.pistol.rate, upgrade: 0, element: 'physical', rarity: 'common', level: 1, patterns: [] };

// sustained single-target dps, generous: perfect aim, half of shotgun pellets
// and a third of a spreader's fan land, fans/helix as if most of it connects
function dps(w, st, plv, mArmor) {
  const a = ARCHETYPES[w.archetype] || ARCHETYPES.rifle;
  const hit = (upgradedDamage(w) + B.attackPerHit(st.attack, a.damage)) * (1 + st.dmgPct + (st.elemDmg[w.element] || 0));
  const fan = (w.patterns || []).find((x) => x.id === 'fan')?.n || 0, helix = (w.patterns || []).some((x) => x.id === 'helix');
  const pat = (fan > 1 ? Math.sqrt(fan) * 0.75 : 1) * (helix ? 1.3 : 1) * (a.melee ? 1 : 1 + 0.4 * (st.abilities.multishot || 0));
  const pellets = a.melee ? 1 : Math.max(1, a.pellets || 1) * (a.fan ? 0.35 : a.pellets > 1 ? 0.5 : 1);
  const crit = 1 + st.critChance * (st.critMult - 1);
  return hit * pat * pellets * crit * (1 - B.monsterReduction(mArmor, plv)) * w.rate * st.fireRate;
}

let maxIlvlOver = -99;
function run(seed) {
  const rng = new Rng(seed);
  let level = 1, xp = 0;
  const eq = {}, rows = [];
  const roll = (d, extra = 0) => { const l = rollItemLevel(rng, d) + extra; maxIlvlOver = Math.max(maxIlvlOver, l - B.areaLevel(d)); return l; };
  for (let d = 1; d <= 60; d++) {
    const st = computeStats(level, eq);
    const mArmor = 1 + B.monsterArmor(d) * 0.6;
    const w = eq.weapon0 || START;
    const mHp = 30 * 1.21 * 1.1 * B.monsterHpMult(d);   // average standard monster, variants and elites mixed in
    const mHit = 9 * 1.12 * B.monsterDmgMult(d) * (1 - B.armorReduction(st.armor, d));
    rows.push({ d, level, w: w.rarity[0] + (w.level || 1), ttk: mHp / dps(w, st, level, mArmor), hits: st.maxHp / mHit, hp: st.maxHp, armor: st.armor });
    // clear the floor
    const n = B.enemyCount(d), ec = B.eliteChance(d);
    xp += n * B.enemyXP(d) * (1 + ec * 1.5) * 1.05 + B.enemyXP(d) * 15;
    while (xp >= B.xpToNext(level)) { xp -= B.xpToNext(level); level++; }
    const drops = [];
    const nItems = Math.round(n * (0.075 * (1 - ec) + 0.32 * ec)) + 2 + (d > 10 ? 1 : 0);
    for (let k = 0; k < nItems; k++) drops.push(generateItem(rng, { level: roll(d), bases, depth: d }));
    for (let c = 0; c < 2; c++) drops.push(generateItem(rng, { level: roll(d), bases, depth: d, itemFind: 0.5, minRarity: c === 0 ? 1 : 0 }));
    drops.push(generateItem(rng, { level: roll(d, 1), bases, depth: d, itemFind: 0.5, minRarity: pedestalMinRarity(d, rng.next()) }));
    for (const it of drops) {
      if (it.kind === 'weapon') {
        const cur = eq.weapon0, mA = 1 + B.monsterArmor(d + 1) * 0.6;
        if (!cur || dps(it, computeStats(level, { ...eq, weapon0: it }), level, mA) > dps(cur, computeStats(level, eq), level, mA)) eq.weapon0 = it;
      } else {
        const slot = it.kind === 'ring' ? 'ring0' : it.kind, cur = eq[slot];
        const score = (x) => (x.armor || 0) + Object.keys(x.stats).length * 3 + RARITY[x.rarity].index * 4;
        if (!cur || score(it) > score(cur)) eq[slot] = it;
      }
    }
  }
  return rows;
}

const runs = [1, 2, 3, 4, 5, 6, 7].map((s) => run(1000 + s * 77));
const med = (d, k) => { const v = runs.map((r) => r[d - 1][k]).sort((a, b) => a - b); return v[v.length >> 1]; };
const fails = [];
const ttk1 = med(1, 'ttk');
if (verbose) console.log('depth  lvl  wpn   TTK(s)  hitsToDie    hp  armor');
for (let d = 1; d <= 60; d++) {
  const ttk = med(d, 'ttk'), hits = med(d, 'hits');
  if (verbose && [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50, 60].includes(d)) {
    console.log(String(d).padStart(5), String(med(d, 'level')).padStart(4), runs[3][d - 1].w.padStart(5), ttk.toFixed(2).padStart(7), hits.toFixed(1).padStart(9), String(med(d, 'hp')).padStart(6), String(med(d, 'armor')).padStart(6));
  }
  // the first 30 floors are the ones a first run plays through; past that a
  // single dive is under-levelled by design (several runs reach depth 50)
  if (d <= 30 && ttk < ttk1 * 0.6) fails.push(`depth ${d}: kills too fast (${ttk.toFixed(2)} s vs ${ttk1.toFixed(2)} s on depth 1)`);
  if (d <= 30 && ttk > ttk1 * 1.8) fails.push(`depth ${d}: kills too slow (${ttk.toFixed(2)} s)`);
  if (d <= 30 && (hits < 6 || hits > 18)) fails.push(`depth ${d}: player dies in ${hits.toFixed(1)} hits`);
}
if (maxIlvlOver > 2) fails.push(`an item dropped ${maxIlvlOver} levels above its floor`);
// shallow floors on a later run don't hand out deep gear
const lv40 = new Rng(9);
for (let k = 0; k < 200; k++) { const l = rollItemLevel(lv40, 3); if (l > B.areaLevel(3) + 1) { fails.push(`depth 3 rolled item level ${l}`); break; } }
console.log(`balance: depth-1 kill ${ttk1.toFixed(2)} s; depth 5/12/20/30 kill ${[5, 12, 20, 30].map((d) => med(d, 'ttk').toFixed(2)).join('/')} s; hits to die ${[1, 5, 12, 20, 30].map((d) => med(d, 'hits').toFixed(1)).join('/')}`);
for (const f of fails) console.log('FAIL', f);
console.log(fails.length ? 'balance failures' : 'balance OK');
process.exit(fails.length ? 1 : 0);
