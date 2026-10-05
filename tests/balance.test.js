// Damage + ammo balance: first runs straight down from depth 1 with the
// game's own item, stat and balance code, wearing the best of what drops
// (monsters, elites, the boss, chests, the pedestal): the strongest UNLIMITED
// gun, the three strongest AMMO guns, the best armour and four rings (every
// equipped item's stats count, as in the game). Gear must not outrun the
// dungeon, and ammo must stay a rationed extra:
//   - standard-monster kill time with the best unlimited gun ~0.85-1.3x the
//     depth-1 starting pistol; the best ammo gun 0.5-0.8x the unlimited one;
//     blended over the share of firing time a floor's ammo sustains, close to
//     the depth-1 pistol (0.8-1.15x)
//   - hits a standard monster needs to kill the player stay 6-18
//   - ammo economy: a floor's finds (monster drops at the real rates and
//     counts, level caches, chests, gun pickups, the last boss's boxes) keep
//     one ammo type firing for ~30-50% of the floor's firing time, two types
//     split it, the station issue lets the first floors lean on ammo more,
//     and it is never enough to fire ammo guns only; saved up, a boss is
//     fought mostly with ammo and lasts ~15-40 s
//   - a full shop refill costs a real share of a floor's credits
//   - nothing drops more than a couple of item levels above the floor
// Run with -v for the tables.
import fs from 'fs';
import * as B from '../src/data/balance.js';
import { generateItem, generateWeapon, upgradedDamage, rollItemLevel } from '../src/game/items.js';
import { computeStats } from '../src/game/stats.js';
import { ARCHETYPES, buildWeaponBases } from '../src/data/weapons.js';
import { AMMO, AMMO_TYPES, ARCH_AMMO, AMMO_DROPS, AMMO_SPOTS, AMMO_CHEST, AMMO_ISSUE, weaponAmmo } from '../src/data/ammo.js';
import { RARITY } from '../src/data/rarities.js';
import { pedestalMinRarity } from '../src/data/scatter.js';
import { Rng } from '../src/core/rng.js';

const verbose = process.argv.includes('-v');
const bases = buildWeaponBases(JSON.parse(fs.readFileSync(new URL('../assets/manifest.json', import.meta.url))));
const START = { archetype: 'pistol', damage: ARCHETYPES.pistol.damage, rate: ARCHETYPES.pistol.rate, upgrade: 0, element: 'physical', rarity: 'common', level: 1, patterns: [], stats: {}, abilities: [] };

// A typical fight: the share of a gun's full single-target damage (every
// pellet) it really deals, relative to the rifle. Measured in the browser with
// real shots (rare guns at area level, perfect aim on the nearest monster):
// packs of 4 ranged / slow melee / fast melee monsters closing from 8 m and
// lone ones, geometric mean. Pellet spread, slow orbs that miss movers and
// overkill pull it down; splash, pierce, ricochet, chains and nails on the
// monster's neighbours push it up. Short reach (melee, flamers): their melee
// packs x 0.85.
const FIGHT = {
  pistol: 1, revolver: 0.95, smg: 1, rifle: 1, lmg: 0.85, shuriken: 1.35, blade: 0.85, mace: 0.85, club: 0.85,
  shotgun: 0.5, super_shotgun: 0.35, minigun: 0.85, sniper: 1.1, rail: 1.4, rocket: 1.1, grenade: 1.3, nailgun: 2.8,
  plasma: 0.65, lightning: 2.05, launcher: 1.3, spreader: 0.3, flamer: 0.95, sprayer: 0.8, crossbow: 1.15, harpoon: 1.15, javelin: 1.1,
};
const AIM = 0.75;          // share of shots that land: firing time (and the ammo spent) is 1/AIM of perfect aim
const SIZE = 1.3;          // real levels average ~1.3x enemyCount (generateLevel's size factor, measured)
const MON_HP = 40, BOSS_HP = 1150;   // average def hp of a standard monster / a boss (MONSTERS)

// sustained dps in a typical fight: a fan of n hits like ~0.55 sqrt(n) shots
function dps(w, st, plv, mArmor) {
  const a = ARCHETYPES[w.archetype] || ARCHETYPES.rifle;
  const hit = (upgradedDamage(w) + B.attackPerHit(st.attack, a.damage)) * (1 + st.dmgPct + (st.elemDmg[w.element] || 0));
  const fan = (w.patterns || []).find((x) => x.id === 'fan')?.n || 0, helix = (w.patterns || []).some((x) => x.id === 'helix');
  const pat = (fan > 1 ? Math.max(1, Math.sqrt(fan) * 0.55) : 1) * (helix ? 1.3 : 1) * (a.melee ? 1 : 1 + 0.4 * (st.abilities.multishot || 0));
  const crit = 1 + st.critChance * (st.critMult - 1);
  return hit * pat * (a.melee ? 1 : Math.max(1, a.pellets || 1)) * crit * (FIGHT[w.archetype] ?? 1) * (1 - B.monsterReduction(mArmor, plv)) * w.rate * st.fireRate;
}
// ammo spent per second of fire (the minigun spins down between bursts)
const ammoRate = (w, st) => { const a = weaponAmmo(w); return a ? a.cost * w.rate * st.fireRate * (ARCHETYPES[w.archetype].spinup ? 0.85 : 1) : 0; };
const mArmor = (d) => 1 + B.monsterArmor(d) * 0.6, bArmor = (d) => 12 + B.monsterArmor(d) * 1.4;

// ---------------------------------------------------------------- ammo supply
const typeWeight = {}, archWeight = {};   // share of weapon drops per ammo type / ammo archetype (real art x3)
{
  let tot = 0;
  for (const b of bases) if (b.enabled) { const a = ARCH_AMMO[b.archetype], w = b.real ? 3 : 1; tot += w; if (a) { typeWeight[a[0]] = (typeWeight[a[0]] || 0) + w; archWeight[b.archetype] = (archWeight[b.archetype] || 0) + w; } }
  for (const t in typeWeight) typeWeight[t] /= tot;
}
// share of pickups that roll type t while the equipped guns use eqT (rollAmmoType)
const typeShare = (t, eqT) => eqT.length ? AMMO_DROPS.bias * (eqT.includes(t) ? 1 / eqT.length : 0) + (1 - AMMO_DROPS.bias) / AMMO_TYPES.length : 1 / AMMO_TYPES.length;
const chestsAt = (d) => Math.min(7, 2.5 + Math.floor(d / 4)) * 0.95;   // levelgen: 2 + d/4 (+0-1), a few don't fit
const caches = (() => {   // levelgen/ammo.js: range x level size, at least 1
  const avg = ([a, b]) => { let s = 0; for (let k = a; k <= b; k++) s += Math.max(1, Math.round(k * SIZE)); return s / (b - a + 1); };
  return { boxes: avg(AMMO_SPOTS.boxes), packs: avg(AMMO_SPOTS.packs) };
})();
// expected units of type t found on floor d: before the boss, and the boss's own boxes (for the next floor)
function finds(d, t, eqT, gunPickups = 1.2) {
  const n = B.enemyCount(d) * SIZE, ec = B.eliteChance(d), D = AMMO_DROPS, A = AMMO[t], sh = typeShare(t, eqT);
  const packs = n * ((1 - ec) * D.normal + ec * D.elite) + caches.packs + chestsAt(d) * AMMO_CHEST.chance * (1 - AMMO_CHEST.box);
  const boxes = n * ec * D.eliteBox + caches.boxes + chestsAt(d) * AMMO_CHEST.chance * AMMO_CHEST.box;
  // every ammo gun picked up comes with a pack (~1.2 ammo guns drop per floor)
  return { floor: (packs * A.small + boxes * A.box) * sh + gunPickups * (typeWeight[t] || 0) * A.small, boss: (D.bossBoxes[0] + D.bossBoxes[1]) / 2 * A.box * sh };
}

// One floor: the player saves ammo for the boss (up to the whole fight) and
// spends the rest on monsters; the unlimited gun does what ammo can't.
function floor(d, st, plv, U, guns, stock) {
  const n = B.enemyCount(d) * SIZE, ec = B.eliteChance(d);
  const H = n * MON_HP * (1 + ec * 1.3) * B.monsterHpMult(d), HB = BOSS_HP * B.monsterHpMult(d);
  const du = dps(U, st, plv, mArmor(d)) * AIM, dub = dps(U, st, plv, bArmor(d)) * AIM;
  const byType = {};
  for (const w of guns) { const t = weaponAmmo(w).type, v = dps(w, st, plv, mArmor(d)) * AIM; if (!byType[t] || v > byType[t].v) byType[t] = { v, vb: dps(w, st, plv, bArmor(d)) * AIM, c: ammoRate(w, st) }; }
  const eqT = Object.keys(byType), out = {};
  let mH = H, mT = 0, bH = HB, bT = 0;
  for (const t of AMMO_TYPES) {
    const f = finds(d, t, eqT), cap = Math.round(AMMO[t].max * st.ammoCap), g = byType[t];
    let have = (stock[t] || 0) + f.floor;
    if (g) {
      const keep = Math.min(have, cap, HB / eqT.length / g.vb * g.c);
      const use = Math.min(have - keep, mH / g.v * g.c);
      mH -= use / g.c * g.v; mT += use / g.c;
      bH -= keep / g.c * g.vb; bT += keep / g.c;
      have -= keep + use;
    }
    out[t] = Math.min(cap, have + f.boss);
  }
  const monT = mT + Math.max(0, mH) / du, bossT = bT + Math.max(0, bH) / dub;
  return { share: (mT + bT) / (monT + bossT), bossShare: bT / bossT, bossT, stock: out };
}
// credits a floor pays (kills, chests, the boss's coins + gold orb)
const floorCredits = (d) => B.creditsFor(d) * (B.enemyCount(d) * SIZE * (1 + 1.5 * B.eliteChance(d)) * 1.05 + 6 * chestsAt(d) + 13 * 12);

// ---------------------------------------------------------------- first runs
let maxIlvlOver = -99;
const score = (x) => (x.armor || 0) + Object.keys(x.stats).length * 3 + RARITY[x.rarity].index * 4;
function run(seed) {
  const rng = new Rng(seed);
  let level = 1, xp = 0, U = START, guns = [];   // the best unlimited gun + the 3 best ammo guns
  const eq = {}, rows = [];
  let stock = {}; for (const t of AMMO_TYPES) stock[t] = Math.round(AMMO[t].max * AMMO_ISSUE);   // station issue
  const equip = (o = {}) => { const e = { ...eq, weapon0: U }; guns.forEach((w, i) => { e['weapon' + (i + 1)] = w; }); return { ...e, ...o }; };
  const roll = (d, extra = 0) => { const l = rollItemLevel(rng, d) + extra; maxIlvlOver = Math.max(maxIlvlOver, l - B.areaLevel(d)); return l; };
  for (let d = 1; d <= 60; d++) {
    const st = computeStats(level, equip());
    const mHp = 30 * 1.21 * 1.1 * B.monsterHpMult(d);   // average standard monster, variants and elites mixed in
    const mHit = 9 * 1.12 * B.monsterDmgMult(d) * (1 - B.armorReduction(st.armor, d));
    const best = guns[0], du = dps(U, st, level, mArmor(d)), da = best ? dps(best, st, level, mArmor(d)) : NaN;
    const f = floor(d, st, level, U, guns, stock);
    stock = f.stock;
    rows.push({ d, level, st, U, best, ttkU: mHp / du, ttkA: mHp / da, ttkB: mHp / (best ? f.share * da + (1 - f.share) * du : du),
      share: f.share, bossShare: f.bossShare, bossT: f.bossT, hits: st.maxHp / mHit, types: new Set(guns.map((w) => weaponAmmo(w).type)).size });
    // clear the floor
    const n = B.enemyCount(d), ec = B.eliteChance(d);
    xp += n * B.enemyXP(d) * (1 + ec * 1.5) * 1.05 + B.enemyXP(d) * 15;
    while (xp >= B.xpToNext(level)) { xp -= B.xpToNext(level); level++; }
    const drops = [];
    const nItems = Math.round(n * (0.075 * (1 - ec) + 0.32 * ec)) + 2 + (d > 10 ? 1 : 0);
    for (let k = 0; k < nItems; k++) drops.push(generateItem(rng, { level: roll(d), bases, depth: d }));
    for (let c = 0; c < 2; c++) drops.push(generateItem(rng, { level: roll(d), bases, depth: d, itemFind: 0.5, minRarity: c === 0 ? 1 : 0 }));
    drops.push(generateItem(rng, { level: roll(d, 1), bases, depth: d, itemFind: 0.5, minRarity: pedestalMinRarity(d, rng.next()) }));
    const mA = mArmor(d + 1);
    for (const it of drops) {
      if (it.kind === 'weapon' && !weaponAmmo(it)) {
        if (dps(it, computeStats(level, equip({ weapon0: it })), level, mA) > dps(U, computeStats(level, equip()), level, mA)) U = it;
      } else if (it.kind === 'weapon') {
        const s2 = computeStats(level, equip());
        guns = [...guns, it].sort((a, b) => dps(b, s2, level, mA) - dps(a, s2, level, mA)).slice(0, 3);
      } else if (it.kind === 'ring') {
        const rs = [0, 1, 2, 3].map((i) => eq['ring' + i]).filter(Boolean).concat(it).sort((a, b) => score(b) - score(a));
        for (let i = 0; i < 4; i++) eq['ring' + i] = rs[i] || null;
      } else if (!eq[it.kind] || score(it) > score(eq[it.kind])) eq[it.kind] = it;
    }
  }
  return rows;
}

const runs = Array.from({ length: 31 }, (_, i) => run(1000 + (i + 1) * 77));
// median over the runs, pooled over depths d-1..d+1 (gear comes in steps)
const med = (d, k, w = 1) => {
  const v = [];
  for (let e = Math.max(1, d - w); e <= Math.min(60, d + w); e++) for (const r of runs) if (Number.isFinite(r[e - 1][k])) v.push(r[e - 1][k]);
  v.sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : NaN;
};
const ttk1 = med(1, 'ttkU', 0);
const fails = [];
const band = (x, lo, hi, what) => { if (!(x >= lo && x <= hi)) fails.push(`${what}: ${x.toFixed(2)} outside ${lo}-${hi}`); };
const SHOW = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50, 60];
if (verbose) {
  console.log('first runs (31 seeds, medians): kill time of a standard monster vs the depth-1 pistol, ammo share of the firing time, boss fight');
  console.log('depth  lvl  unlim  ammo/unl  blend   ammoShare  bossOnAmmo  bossFight  hitsToDie  types');
}
for (let d = 1; d <= 60; d++) {
  const w = d === 1 ? 0 : 1, u = med(d, 'ttkU', w) / ttk1, au = med(d, 'ttkA', w) / med(d, 'ttkU', w), b = med(d, 'ttkB', w) / ttk1, hits = med(d, 'hits', w);
  if (verbose && SHOW.includes(d)) {
    console.log(String(d).padStart(5), String(med(d, 'level', 0)).padStart(4), u.toFixed(2).padStart(6), (Number.isFinite(au) ? au.toFixed(2) : '-').padStart(9), b.toFixed(2).padStart(6),
      med(d, 'share', w).toFixed(2).padStart(11), med(d, 'bossShare', w).toFixed(2).padStart(11), (med(d, 'bossT', w).toFixed(0) + ' s').padStart(10), hits.toFixed(1).padStart(10), String(med(d, 'types', 0)).padStart(6));
  }
  // the first 30 floors are the ones a first run plays through; past that a
  // single dive is under-levelled by design (several runs reach depth 50)
  if (d < 2 || d > 30) continue;
  band(u, 0.85, 1.3, `depth ${d}: best unlimited gun kills in`);
  // the first floors: the first ammo gun is a common, and the station issue lets them lean on ammo
  band(au, 0.5, d <= 3 ? 0.85 : 0.8, `depth ${d}: best ammo gun vs unlimited`);
  band(b, d <= 3 ? 0.7 : 0.8, 1.15, `depth ${d}: blended kill time`);
  band(hits, 6, 18, `depth ${d}: hits to die`);
  band(med(d, 'bossT'), 15, 40, `depth ${d}: boss fight seconds`);
  if (d >= 6) band(med(d, 'share'), 0.2, 0.65, `depth ${d}: share of firing time on ammo`);
}
// the first floors lean on the station issue more than later ones
const early = (med(2, 'share', 0) + med(3, 'share', 0)) / 2, later = [8, 12, 16, 20, 25, 30].reduce((a, d) => a + med(d, 'share'), 0) / 6;
if (!(early > later + 0.1)) fails.push(`the station issue doesn't show on the first floors (${early.toFixed(2)} vs ${later.toFixed(2)})`);

// ---------------------------------------------------------------- economy per ammo gun
// Steady state (only the last boss's boxes carried over) with one ammo gun of
// every archetype at the run's best ammo rarity, next to the run's unlimited gun
const ECON_D = [4, 8, 12, 16, 20, 25, 30];
function econ(archs, d) {
  const per = runs.map((r) => {
    const row = r[d - 1], rarity = row.best ? row.best.rarity : 'rare';
    const guns = archs.map((arch, k) => { const g = generateWeapon(new Rng(d * 31 + k), B.areaLevel(d), rarity, bases, bases.find((b) => b.archetype === arch && b.enabled)); g.patterns = []; g.abilities = []; return g; });
    const types = guns.map((g) => weaponAmmo(g).type), stock = {};
    for (const t of AMMO_TYPES) stock[t] = types.includes(t) ? finds(d - 1, t, types).boss : 0;
    const f = floor(d, row.st, row.level, row.U, guns, stock);
    return { share: f.share, boss: f.bossShare };
  });
  const m = (k) => per.map((p) => p[k]).sort((a, b) => a - b)[per.length >> 1];
  return { share: m('share'), boss: m('boss') };
}
const ammoArchs = Object.keys(ARCH_AMMO).filter((k) => ARCH_AMMO[k] && archWeight[k]);
const one = {};
for (const a of ammoArchs) one[a] = ECON_D.map((d) => econ([a], d));
const typeMean = (t, i) => { let s = 0, w = 0; for (const a of ammoArchs) if (ARCH_AMMO[a][0] === t) { s += one[a][i].share * archWeight[a]; w += archWeight[a]; } return s / w; };
const overall = ECON_D.map((d, i) => { let s = 0, w = 0; for (const a of ammoArchs) { s += one[a][i].share * archWeight[a]; w += archWeight[a]; } return s / w; });
const bossAvg = ECON_D.map((d, i) => { let s = 0, w = 0; for (const a of ammoArchs) { s += one[a][i].boss * archWeight[a]; w += archWeight[a]; } return s / w; });
// two types equipped: the supply splits between them
const PAIRS = [['plasma', 'shotgun'], ['rocket', 'minigun'], ['flamer', 'crossbow']];
const two = PAIRS.map((p) => ECON_D.map((d) => {
  const both = econ(p, d), solo = p.map((a) => one[a][ECON_D.indexOf(d)].share);
  return { both: both.share, solo };
}));
if (verbose) {
  console.log('\nammo economy, one ammo gun + the unlimited one (steady state): share of a floor\'s firing time on ammo');
  console.log('type         ' + ECON_D.map((d) => ('d' + d).padStart(6)).join(''));
  for (const t of AMMO_TYPES) console.log(t.padEnd(13) + ECON_D.map((d, i) => typeMean(t, i).toFixed(2).padStart(6)).join(''));
  console.log('all guns     ' + overall.map((v) => v.toFixed(2).padStart(6)).join(''));
  console.log('  lowest     ' + ECON_D.map((d, i) => Math.min(...ammoArchs.map((a) => one[a][i].share)).toFixed(2).padStart(6)).join('') + `   (${ammoArchs.reduce((a, b) => (one[a][3].share < one[b][3].share ? a : b))})`);
  console.log('  highest    ' + ECON_D.map((d, i) => Math.max(...ammoArchs.map((a) => one[a][i].share)).toFixed(2).padStart(6)).join('') + `   (${ammoArchs.reduce((a, b) => (one[a][3].share > one[b][3].share ? a : b))})`);
  console.log('boss on ammo ' + bossAvg.map((v) => v.toFixed(2).padStart(6)).join(''));
  for (const [k, p] of PAIRS.entries()) console.log(p.join('+').padEnd(13) + two[k].map((x) => x.both.toFixed(2).padStart(6)).join('') + '   (two types, together)');
  console.log('\nshop: full load of one type / a floor\'s credits ' + [1, 5, 10, 20, 30].map((d) => `d${d} ${(B.ammoRefillCost(d) / floorCredits(d)).toFixed(2)}`).join('  '));
}
ECON_D.forEach((d, i) => {
  for (const t of AMMO_TYPES) band(typeMean(t, i), 0.25, 0.55, `depth ${d}: one ${t} gun's share of the firing time`);
  for (const a of ammoArchs) band(one[a][i].share, 0.15, 0.7, `depth ${d}: one ${a}'s share of the firing time`);
  band(bossAvg[i], 0.6, 1, `depth ${d}: share of a boss fight on saved-up ammo`);
});
band(overall.reduce((a, b) => a + b) / overall.length, 0.3, 0.5, 'one ammo type: average share of the firing time');
for (const [k, p] of PAIRS.entries()) two[k].forEach((x, i) => {
  // two guns of different types get a little more in total than either alone (more of the drops fit), never double
  band(x.both / Math.max(...x.solo), 0.9, 1.45, `depth ${ECON_D[i]}: ${p.join(' + ')} vs alone`);
});
for (const d of [3, 5, 10, 20, 30]) band(B.ammoRefillCost(d) / floorCredits(d), 0.25, 0.6, `depth ${d}: shop full load vs a floor's credits`);

// ---------------------------------------------------------------- item levels
if (maxIlvlOver > 2) fails.push(`an item dropped ${maxIlvlOver} levels above its floor`);
// shallow floors on a later run don't hand out deep gear
const lv40 = new Rng(9);
for (let k = 0; k < 200; k++) { const l = rollItemLevel(lv40, 3); if (l > B.areaLevel(3) + 1) { fails.push(`depth 3 rolled item level ${l}`); break; } }

const r2 = (v) => v.toFixed(2);
console.log(`balance: depth-1 kill ${ttk1.toFixed(2)} s; depth 5/12/20/30 unlimited ${[5, 12, 20, 30].map((d) => r2(med(d, 'ttkU') / ttk1)).join('/')}x, ammo ${[5, 12, 20, 30].map((d) => r2(med(d, 'ttkA') / med(d, 'ttkU'))).join('/')}x of that, blended ${[5, 12, 20, 30].map((d) => r2(med(d, 'ttkB') / ttk1)).join('/')}x; ammo share ${[5, 12, 20, 30].map((d) => r2(med(d, 'share'))).join('/')}; one type ${r2(overall.reduce((a, b) => a + b) / overall.length)}; hits to die ${[1, 5, 12, 20, 30].map((d) => med(d, 'hits').toFixed(1)).join('/')}`);
for (const f of fails) console.log('FAIL', f);
console.log(fails.length ? 'balance failures' : 'balance OK');
process.exit(fails.length ? 1 : 0);
