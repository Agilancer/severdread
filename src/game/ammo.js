// Ammo runtime: the player's stock lives in the save (save.ammo = {shells,
// heavy, ...}); capacity comes from the Ammo Capacity stat. Pure functions so
// the player, pickups, UI and tests share one set of rules (data/ammo.js).
import { AMMO, AMMO_TYPES, AMMO_ISSUE, AMMO_DROPS, AMMO_CHEST, weaponAmmo } from '../data/ammo.js';
import { AMMO_SPRITES } from '../data/itemart.js';
import { dps } from './items.js';
import * as B from '../data/balance.js';

export { AMMO, AMMO_TYPES, AMMO_CHEST, weaponAmmo };

// a fresh stock: every type at `frac` of its base capacity
export function newAmmo(frac = AMMO_ISSUE) {
  const o = {};
  for (const t of AMMO_TYPES) o[t] = Math.round(AMMO[t].max * frac);
  return o;
}
export function ammoMax(type, stats) { return Math.round(AMMO[type].max * (stats?.ammoCap || 1)); }
export function ammoCount(save, type) { return save.ammo?.[type] || 0; }
export function ammoFull(save, stats, type) { return ammoCount(save, type) >= ammoMax(type, stats); }
// share of a full load (HUD bars / colours)
export function ammoFrac(save, stats, type) { return Math.min(1, ammoCount(save, type) / Math.max(1, ammoMax(type, stats))); }

// can `w` fire one more shot? (unlimited weapons always can)
export function canFire(save, w) {
  const a = weaponAmmo(w);
  return !a || ammoCount(save, a.type) >= a.cost;
}
// pay for one shot (pellets, patterns and multishot never cost extra)
export function spendAmmo(save, w) {
  const a = weaponAmmo(w);
  if (!a) return true;
  const have = ammoCount(save, a.type);
  if (have < a.cost) return false;
  save.ammo[a.type] = have - a.cost;
  return true;
}
// add up to what fits under the cap; returns what was taken (0 = full)
export function addAmmo(save, stats, type, n) {
  if (!save.ammo) save.ammo = newAmmo(0);
  const have = ammoCount(save, type), take = Math.max(0, Math.min(Math.round(n), ammoMax(type, stats) - have));
  save.ammo[type] = have + take;
  return take;
}
// station issue: every type up to at least `frac` of capacity
export function topUpAmmo(save, stats, frac = AMMO_ISSUE) {
  if (!save.ammo) save.ammo = newAmmo(0);
  for (const t of AMMO_TYPES) save.ammo[t] = Math.max(ammoCount(save, t), Math.round(ammoMax(t, stats) * frac));
}
// after gear changes: nothing above capacity
export function clampAmmo(save, stats) {
  if (!save.ammo) return;
  for (const t of AMMO_TYPES) save.ammo[t] = Math.max(0, Math.min(ammoCount(save, t), ammoMax(t, stats)));
}
// old saves: every type present, numbers sane
export function migrateAmmo(ammo) {
  const base = newAmmo();
  if (!ammo || typeof ammo !== 'object') return base;
  const o = {};
  for (const t of AMMO_TYPES) o[t] = Number.isFinite(ammo[t]) ? Math.max(0, Math.round(ammo[t])) : base[t];
  return o;
}

// ammo types the equipped guns spend (drop / cache bias)
export function equippedAmmoTypes(weapons) {
  const s = new Set();
  for (const w of weapons) { const a = w && weaponAmmo(w); if (a) s.add(a.type); }
  return [...s];
}
export function rollAmmoType(rng, weapons) {
  const eq = equippedAmmoTypes(weapons);
  return eq.length && rng.chance(AMMO_DROPS.bias) ? rng.pick(eq) : rng.pick(AMMO_TYPES);
}
// element of the equipped weapon of that type (picks the shell / cell / canister art)
function ammoElement(weapons, type) {
  const w = weapons.find((x) => x && weaponAmmo(x)?.type === type && x.element !== 'physical');
  return w ? w.element : null;
}
// sprite id (it_ammo_upgrades_NN) for a pack / box of `type`
export function ammoSpriteId(type, big, element, seed = 0) {
  const s = AMMO_SPRITES[type];
  if (!s) return null;
  const n = (!big && element && s.elem?.[element]) || (big ? s.box : s.small)[(seed >>> 0) % (big ? s.box : s.small).length];
  return `it_ammo_upgrades_${String(n).padStart(2, '0')}`;
}
// a world pickup: {kind: 'ammo', type, value, big, icon}
export function ammoPickup(rng, type, big, weapons = []) {
  return { kind: 'ammo', type, big: !!big, value: big ? AMMO[type].box : AMMO[type].small, icon: ammoSpriteId(type, big, ammoElement(weapons, type), rng.int(0, 1e6)) };
}

// Auto-switch target when the current gun runs dry: the strongest ammo gun
// that still has ammo, else the strongest unlimited one, else -1 (sidearm)
export function bestFiringSlot(weapons, save) {
  let best = -1, bs = -1, bestU = -1, bu = -1;
  weapons.forEach((w, i) => {
    if (!w || !canFire(save, w)) return;
    const s = dps(w);
    if (weaponAmmo(w)) { if (s > bs) { bs = s; best = i; } } else if (s > bu) { bu = s; bestU = i; }
  });
  return best >= 0 ? best : bestU;
}

// Station shop: credits to fill `type` to capacity (scales with the deepest floor reached)
export function refillCost(save, stats, type, depth) {
  const missing = ammoMax(type, stats) - ammoCount(save, type);
  return missing <= 0 ? 0 : Math.max(1, Math.ceil(B.ammoRefillCost(depth) * missing / AMMO[type].max));
}

// What a dying monster drops: a pack now and then (elites more, sometimes a
// box), bosses always 1-2 boxes. Types lean toward the equipped guns' ammo.
export function monsterAmmoDrops(rng, { boss = false, elite = false } = {}, weapons = []) {
  const out = [], D = AMMO_DROPS;
  if (boss) {
    for (let k = rng.int(D.bossBoxes[0], D.bossBoxes[1]); k > 0; k--) out.push(ammoPickup(rng, rollAmmoType(rng, weapons), true, weapons));
    return out;
  }
  if (rng.chance(elite ? D.elite : D.normal)) out.push(ammoPickup(rng, rollAmmoType(rng, weapons), false, weapons));
  if (elite && rng.chance(D.eliteBox)) out.push(ammoPickup(rng, rollAmmoType(rng, weapons), true, weapons));
  return out;
}
