// Ammo system: the per-archetype table, firing costs (pellets, patterns,
// multishot and double tap never cost extra), dry fire + auto-switch, the
// emergency sidearm, save migration, pickups (cap, full stays on the floor),
// station issue, shop refills, level caches and monster drop rates.
// Runs the game's own Player / Game code against a small fake world.
import { ARCHETYPES, PLACEHOLDER_BASES } from '../src/data/weapons.js';
import { AMMO, AMMO_TYPES, ARCH_AMMO, AMMO_ISSUE, AMMO_DROPS, AMMO_SPOTS, AMMO_CHEST, AMMO_CAP_MAX, weaponAmmo } from '../src/data/ammo.js';
import { AMMO_SPRITES } from '../src/data/itemart.js';
import * as A from '../src/game/ammo.js';
import { generateWeapon } from '../src/game/items.js';
import { describeItem } from '../src/game/items.js';
import { computeStats } from '../src/game/stats.js';
import { Player } from '../src/game/player.js';
import { Game, newSave } from '../src/game/game.js';
import { generateLevel } from '../src/game/levelgen/index.js';
import { F } from '../src/game/grid.js';
import { input } from '../src/engine/input.js';
import { Rng } from '../src/core/rng.js';
import fs from 'fs';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL:', msg); } };
const bases = PLACEHOLDER_BASES.map((b) => ({ ...b, enabled: true }));
const mk = (arch, seed = 1, rarity = 'common') => {
  const base = bases.find((b) => b.archetype === arch) || { id: 'x_' + arch, name: arch, archetype: arch, enabled: true };
  const w = generateWeapon(new Rng(seed), 5, rarity, bases, base);
  w.patterns = []; w.stats = {}; w.abilities = [];
  return w;
};

// ---------------------------------------------------------------- table
for (const k of Object.keys(ARCHETYPES)) {
  check(k in ARCH_AMMO, `archetype ${k} missing from ARCH_AMMO`);
  const a = ARCH_AMMO[k];
  if (a) check(AMMO[a[0]] && Number.isInteger(a[1]) && a[1] > 0 && a[2] >= 1 && a[2] <= 2.5, `bad ammo entry for ${k}: ${a}`);
}
for (const k of Object.keys(ARCH_AMMO)) check(k in ARCHETYPES, `ARCH_AMMO has unknown archetype ${k}`);
for (const k of ['pistol', 'revolver', 'smg', 'rifle', 'lmg', 'shuriken', 'blade', 'mace', 'club']) check(ARCH_AMMO[k] === null, `${k} should be unlimited`);
for (const t of AMMO_TYPES) {
  check(AMMO[t].small > 0 && AMMO[t].box > AMMO[t].small && AMMO[t].max >= AMMO[t].box, `type ${t} sizes`);
  check(AMMO_SPRITES[t] && AMMO_SPRITES[t].small.length && AMMO_SPRITES[t].box.length, `sprites for ${t}`);
  const users = Object.entries(ARCH_AMMO).filter(([, a]) => a && a[0] === t);
  check(users.length > 0, `nobody uses ${t}`);
  for (const [arch, [, cost]] of users) {
    const secs = AMMO[t].max / (cost * ARCHETYPES[arch].rate);
    check(secs >= 12 && secs <= 75, `a full load of ${t} lasts ${secs.toFixed(1)} s for ${arch}`);
  }
}
// sprite ids exist in the manifest and are ammo (01-35), not upgrade parts
const manifest = JSON.parse(fs.readFileSync(new URL('../assets/manifest.json', import.meta.url)));
const set = manifest.spriteSets.find((s) => s.id === 'it_ammo_upgrades');
check(set && set.rows === 10 && set.sprites.length === 50, 'ammo sheet cut: 10 rows, 50 icons');
const ids = new Set(set?.sprites.map((s) => s.id));
for (const [t, s] of Object.entries(AMMO_SPRITES)) for (const n of [s.hud, ...s.small, ...s.box, ...Object.values(s.elem || {})]) {
  check(n >= 1 && n <= 35 && ids.has(`it_ammo_upgrades_${String(n).padStart(2, '0')}`), `${t}: sprite ${n}`);
}
// tooltips
check(describeItem(mk('shotgun')).some((l) => l.text === 'Ammo: Shells - 1 per shot'), 'shotgun tooltip');
check(describeItem(mk('rifle')).some((l) => l.text === 'Ammo: unlimited'), 'rifle tooltip');

// ---------------------------------------------------------------- fake world for real shots
function fakeGame(save) {
  const g = {
    save, time: 0, state: 'playing', inHub: false, noiseT: 0, muzzleShots: [], settings: { fov: 80 },
    sounds: [], toasts: [],
    sfx(n) { this.sounds.push(n); }, toast(t) { this.toasts.push(t); }, shake() {}, elemLight: () => [1, 1, 1],
    events: { emit() {} }, renderer: { lowW: 427, lowH: 240 },
    content: { weaponBases: bases, playerProjectileId: () => null, projSprite: () => ({ real: false }), fxSprite: () => ({ uv: [0, 0, 1, 1] }) },
    world: {
      depth: 5, monsters: [], projectiles: [], beams: [], scatter: null,
      castRay: () => -1, raycast: () => null, beam() {}, burst() {}, flash() {}, addParticle() {}, floorAt: () => 0, ceilingOver: () => 4,
    },
  };
  g.player = new Player(g, save);
  return g;
}
function equip(save, list) { list.forEach((w, i) => { save.equipment['weapon' + i] = w; }); }
// hold the trigger for `secs` (touch mode: semi-autos keep firing while held)
function hold(g, secs, dt = 1 / 60, fire = true) {
  input.mode = 'touch'; input.fire = fire;
  for (let t = 0; t < secs; t += dt) { g.time += dt; g.player.updateWeapon(dt); }
  input.fire = false;
}
const idle = (g, secs) => hold(g, secs, 1 / 60, false);

// every ammo archetype, with fat patterns and multishot: one cost per shot
const pats = [[], [{ id: 'fan', n: 7 }], [{ id: 'burst_ring', n: 12 }], [{ id: 'helix' }], [{ id: 'split' }]];
for (const [arch, a] of Object.entries(ARCH_AMMO)) {
  if (!a) continue;
  for (const pat of pats) {
    const save = newSave();
    const w = mk(arch, 3);
    if (pat.length && !ARCHETYPES[arch].hitscan) w.patterns = pat;
    equip(save, [w]);
    save.ammo[a[0]] = 100000;
    const g = fakeGame(save), p = g.player;
    p.stats.abilities.multishot = 2;
    const before = save.ammo[a[0]];
    hold(g, 2.5);
    const shots = p.shotCount, spent = before - save.ammo[a[0]];
    check(shots > 0, `${arch} never fired`);
    check(spent === shots * a[1], `${arch} ${JSON.stringify(pat)}: ${shots} shots spent ${spent} ${a[0]} (cost ${a[1]})`);
    if (arch === 'shotgun' && !pat.length) check(g.world.projectiles.length >= shots * ARCHETYPES.shotgun.pellets, 'shotgun pellets spawned');
  }
}
// minigun spin-up costs nothing until it really fires
{
  const save = newSave(); equip(save, [mk('minigun')]); save.ammo.heavy = 50;
  const g = fakeGame(save);
  hold(g, 0.12);
  check(save.ammo.heavy === 50 && g.player.shotCount === 0, 'minigun spin-up spent ammo');
  hold(g, 1);
  check(save.ammo.heavy === 50 - g.player.shotCount && g.player.shotCount > 0, 'minigun spends 1 per bullet');
}
// double tap: the bonus shot is free
{
  const save = newSave(); equip(save, [mk('shotgun')]); save.ammo.shells = 40;
  const g = fakeGame(save), p = g.player;
  p.stats.abilities.double_tap = 1;
  hold(g, 2);
  await new Promise((r) => setTimeout(r, 150));
  const fired = p.shotCount;   // every shot doubled by the timer
  check(fired > 2 && 40 - save.ammo.shells === Math.ceil(fired / 2), `double tap: ${fired} shots, ${40 - save.ammo.shells} shells spent`);
}

// ---------------------------------------------------------------- dry fire, auto-switch, sidearm
{
  const save = newSave();
  const sg = mk('shotgun', 1), rifle = mk('rifle', 2), rk = mk('rocket', 3);
  equip(save, [sg, rifle, rk]);
  save.ammo.shells = 0; save.ammo.explosives = 3;
  const g = fakeGame(save), p = g.player;
  check(!A.canFire(save, sg) && A.canFire(save, rifle) && A.canFire(save, rk), 'canFire');
  hold(g, 0.05);
  check(p.shotCount === 0, 'empty shotgun fired');
  check(g.sounds.includes('hit_metal') && g.toasts.includes('NO SHELLS'), 'dry click + NO SHELLS');
  check(p.weaponIndex === 2 && !p.sidearmOn, `auto-switch prefers the rocket with ammo (got slot ${p.weaponIndex})`);
  hold(g, 5);
  check(save.ammo.explosives === 0, 'rockets fired dry');
  check(p.weaponIndex === 1 && !p.sidearmOn, `then the unlimited rifle (got slot ${p.weaponIndex})`);
  // manual select of an empty gun is allowed; firing it switches away again
  p.selectWeapon(0); idle(g, 0.4);
  check(p.weaponIndex === 0, 'can select an empty gun');
  hold(g, 0.1);
  check(p.weaponIndex === 1, 'firing an empty selected gun switches');
  // cycling skips the empty ones while something can fire
  p.selectWeapon(1); idle(g, 0.4); p.cycleWeapon(1);
  check(p.weaponIndex === 1, `cycle stays on the only gun that can fire (got ${p.weaponIndex})`);
  save.ammo.shells = 5; p.cycleWeapon(1);
  check(p.weaponIndex === 0, `cycle skips the empty rocket (got ${p.weaponIndex})`);
}
{
  // four empty ammo guns: the sidearm, until ammo arrives
  const save = newSave();
  equip(save, [mk('shotgun'), mk('rocket'), mk('plasma'), mk('crossbow')]);
  for (const t of AMMO_TYPES) save.ammo[t] = 0;
  const g = fakeGame(save), p = g.player;
  const bag = save.bag.length;
  hold(g, 1.5);
  check(p.sidearmOn && p.currentWeapon()?.name === 'SIDEARM' && p.currentWeapon().archetype === 'pistol', 'sidearm drawn when nothing can fire');
  check(p.shotCount > 0, 'the sidearm fires');
  check(save.bag.length === bag && !Object.values(save.equipment).some((e) => e?.sidearm), 'sidearm is not an item');
  const side = p.currentWeapon();
  check(side.damage < mk('pistol').damage * 1.2 && side.level === 5, 'sidearm: area-level pistol at reduced damage');
  check(AMMO_TYPES.every((t) => save.ammo[t] === 0), 'sidearm spends nothing');
  A.addAmmo(save, p.stats, 'cells', 40);
  hold(g, 0.05);
  check(!p.sidearmOn && p.weaponIndex === 2, `sidearm put away when ammo arrives (slot ${p.weaponIndex})`);
  // nothing equipped at all
  const s2 = newSave(); const g2 = fakeGame(s2);
  hold(g2, 1);
  check(g2.player.sidearmOn && g2.player.shotCount > 0, 'sidearm with no weapons equipped');
}

{
  // the selected slot went empty (sold / unequipped mid-run, old save): the next
  // update draws a gun that can fire instead of leaving the trigger dead
  const save = newSave();
  equip(save, [mk('shotgun'), mk('rifle')]);
  save.ammo.shells = 10;
  const g = fakeGame(save), p = g.player;
  p.weaponIndex = 0; save.equipment.weapon0 = null;
  hold(g, 1);
  check(p.weaponIndex === 1 && !p.sidearmOn && p.shotCount > 0, `empty selected slot: switched to slot ${p.weaponIndex}, ${p.shotCount} shots`);
  // only empty ammo guns left besides the empty slot: the sidearm
  const s2 = newSave(); equip(s2, [null, mk('rocket')]); s2.ammo.explosives = 0;
  const g2 = fakeGame(s2);
  hold(g2, 1);
  check(g2.player.sidearmOn && g2.player.shotCount > 0, 'empty selected slot, nothing loaded: sidearm');
}

// ---------------------------------------------------------------- save migration
{
  const old = newSave(); delete old.ammo; old.level = 7; old.credits = 999;
  globalThis.localStorage = { getItem: () => JSON.stringify(old), setItem() {} };
  const s = Game.prototype.loadSave.call({ loadJSON: Game.prototype.loadJSON });
  check(s && s.level === 7 && s.credits === 999, 'old save loads');
  check(AMMO_TYPES.every((t) => s.ammo[t] === Math.round(AMMO[t].max * AMMO_ISSUE)), 'old save gets the starting stock');
  globalThis.localStorage = { getItem: () => JSON.stringify({ ...old, ammo: { shells: 3, heavy: 'x', cells: -5 } }), setItem() {} };
  const s2 = Game.prototype.loadSave.call({ loadJSON: Game.prototype.loadJSON });
  check(s2.ammo.shells === 3 && s2.ammo.heavy === Math.round(AMMO.heavy.max * AMMO_ISSUE) && s2.ammo.cells === 0 && s2.ammo.bolts > 0, 'partial / bad ammo merges');
  check(AMMO_TYPES.every((t) => newSave().ammo[t] > 0), 'new save has ammo');
}

// ---------------------------------------------------------------- capacity, pickups, issue, shop
{
  const st0 = computeStats(10, {});
  check(A.ammoMax('shells', st0) === AMMO.shells.max, 'base capacity');
  const st1 = computeStats(10, { ring0: { stats: { ammoCap: 0.3 }, abilities: [], upgrade: 0 }, body: { stats: { ammoCap: 5 }, abilities: [], upgrade: 0 } });
  check(A.ammoMax('shells', st1) === Math.round(AMMO.shells.max * (1 + AMMO_CAP_MAX)), `Ammo Capacity capped at +${AMMO_CAP_MAX * 100}%`);
  // collect: takes what fits, the rest stays; a full type is left on the floor (no magnet)
  const SH = AMMO.shells.max;
  const save = newSave(); save.ammo.shells = SH - 4;
  const fake = { save, player: { stats: st0, x: 0, y: 0, z: 0, dead: false }, time: 10, sounds: [], toasts: [], sfx(n) { this.sounds.push(n); }, toast(t) { this.toasts.push(t); }, collect: Game.prototype.collect };
  const pk = { kind: 'ammo', type: 'shells', value: 8, big: false };
  check(Game.prototype.collect.call(fake, pk) === false && save.ammo.shells === SH && pk.value === 4, 'partial pickup keeps the rest');
  check(fake.toasts.includes('+4 SHELLS'), 'pickup toast');
  check(Game.prototype.collect.call(fake, pk) === false && save.ammo.shells === SH && pk.value === 4, 'full: nothing taken');
  fake.world = { pickups: [{ ...pk, x: 0.2, y: 0.6, z: 0, age: 5, settled: true }, { kind: 'ammo', type: 'cells', value: 40, x: 0.3, y: 0.6, z: 0, age: 5, settled: true }] };
  Game.prototype.updatePickups.call(fake, 1 / 60);
  check(fake.world.pickups.length === 1 && fake.world.pickups[0].type === 'shells' && fake.world.pickups[0].x === 0.2, 'full type stays put, the other is collected');
  check(fake.toasts.includes('SHELLS FULL'), 'full toast');
  // weapon pickups bring a pack of their ammo, once
  save.ammo.cells = 0; save.bagSize = 40;
  const plas = mk('plasma');
  Game.prototype.collect.call(fake, { kind: 'item', item: plas });
  check(save.ammo.cells === AMMO.cells.small && plas.ammoGiven, 'a plasma rifle comes with cells');
  save.bag.length = 0;
  Game.prototype.collect.call(fake, { kind: 'item', item: plas });
  check(save.ammo.cells === AMMO.cells.small, 'only once per gun');
  // ammo above capacity (an Ammo Capacity item came off) is kept, not destroyed
  save.ammo.shells = SH + 20; save.ammo.cells = NaN; save.ammo.fuel = -3;
  A.sanitizeAmmo(save);
  check(save.ammo.shells === SH + 20 && save.ammo.cells === 0 && save.ammo.fuel === 0, 'level start keeps surplus, fixes bad counts');
  check(A.addAmmo(save, st0, 'shells', 6) === 0 && save.ammo.shells === SH + 20, 'no pickups above capacity');
  // station issue on a new run
  for (const t of AMMO_TYPES) save.ammo[t] = 0;
  save.ammo.heavy = AMMO.heavy.max + 30;
  const hub = { save, player: { stats: st0 }, post: {}, sfx() {}, startLevel() {} };
  Game.prototype.startRunFromHub.call(hub, false);
  check(AMMO_TYPES.every((t) => save.ammo[t] >= Math.round(AMMO[t].max * AMMO_ISSUE)) && save.ammo.heavy === AMMO.heavy.max + 30, 'new run tops up to the issue level, keeps more');
  save.ammo.shells = 0;
  Game.prototype.startRunFromHub.call(hub, true);
  check(save.ammo.shells === 0, 'continuing a run is not a new issue');
  // shop refills: free when full, dearer deeper
  save.ammo.heavy = 0;
  check(A.refillCost(save, st0, 'heavy', 1) > 0 && A.refillCost(save, st0, 'shells', 30) > A.refillCost(save, st0, 'shells', 1), 'refill prices');
  save.ammo.bolts = AMMO.bolts.max;
  check(A.refillCost(save, st0, 'bolts', 10) === 0, 'full type costs nothing');
  // chests hold ammo (data/ammo.js AMMO_CHEST: a pack, or a box)
  const ch = { world: { pickups: [], depth: 4, burst() {}, flash() {} }, player: { stats: st0, weapons: () => [mk('shotgun')] }, content: { weaponBases: bases }, sfx() {} };
  ch.dropAt = Game.prototype.dropAt;
  Game.prototype.openChest.call(ch, { x: 1, y: 0, z: 1 });
  const am = ch.world.pickups.filter((k) => k.kind === 'ammo');
  check(am.length === (AMMO_CHEST.chance >= 1 ? 1 : am.length) && am.length <= 1 && am.every((k) => k.value === AMMO[k.type][k.big ? 'box' : 'small'] && (k.big ? AMMO_CHEST.box > 0 : AMMO_CHEST.box < 1)), 'chest ammo');
}

// ---------------------------------------------------------------- monster drops
{
  const rng = new Rng(77), N = 20000, ws = [mk('shotgun'), mk('rifle')];
  const count = (o) => { let packs = 0, bx = 0, shells = 0, all = 0; for (let i = 0; i < N; i++) for (const d of A.monsterAmmoDrops(rng, o, ws)) { all++; if (d.big) bx++; else packs++; if (d.type === 'shells') shells++; } return { packs: packs / N, boxes: bx / N, shells: shells / all }; };
  const n = count({}), e = count({ elite: true });
  check(Math.abs(n.packs - AMMO_DROPS.normal) < 0.012 && n.boxes === 0, `normal drop rate ${n.packs}`);
  check(Math.abs(e.packs - AMMO_DROPS.elite) < 0.02 && Math.abs(e.boxes - AMMO_DROPS.eliteBox) < 0.015, `elite drop rates ${e.packs} / ${e.boxes}`);
  check(n.shells > 0.68 && n.shells < 0.82, `drops lean toward the equipped gun's ammo (${n.shells.toFixed(2)} shells)`);
  for (let i = 0; i < 300; i++) { const b = A.monsterAmmoDrops(rng, { boss: true }, ws); check(b.length >= 1 && b.length <= 2 && b.every((d) => d.big), 'boss boxes'); if (fails > 20) break; }
  const noGuns = count({});
  void noGuns;
  const r2 = new Rng(5); const types = {};
  for (let i = 0; i < 6000; i++) { const t = A.rollAmmoType(r2, [mk('rifle')]); types[t] = (types[t] || 0) + 1; }
  check(AMMO_TYPES.every((t) => types[t] > 700), 'no ammo guns: any type');
}

// ---------------------------------------------------------------- level caches
{
  const themes = ['possessed_station', 'castle', 'hell', 'ruined_city', 'caves', 'bio_lab', 'clockwork_foundry', undefined];
  let total = 0, preBoss = 0;
  for (const th of themes) for (const seed of [11, 222, 3333]) {
    let L;
    try { L = generateLevel({ depth: 1 + (seed % 9), seed, playerLevel: 5, themeId: th }); } catch (e) { check(false, `generateLevel ${th} ${seed}: ${e.message}`); continue; }
    const g = L.grid, a = L.ammo || [];
    const boxes = a.filter((s) => s.big).length, packs = a.length - boxes;
    // the AMMO_SPOTS range times the level size (0.7-1.4)
    const lim = ([a, b]) => [Math.max(1, Math.round(a * 0.7)), Math.round(b * 1.4)];
    const [b0, b1] = lim(AMMO_SPOTS.boxes), [p0, p1] = lim(AMMO_SPOTS.packs);
    check(boxes >= b0 && boxes <= b1 && packs >= p0 && packs <= p1, `${L.theme.id} seed ${seed}: ${boxes} boxes, ${packs} packs`);
    check(a.filter((s) => s.boss).length <= 1 && a.every((s) => !s.boss || s.big), `${L.theme.id} seed ${seed}: one box before the boss`);
    preBoss += a.some((s) => s.boss) ? 1 : 0;
    const start = g.idx(Math.floor(L.start.x), Math.floor(L.start.z));
    const dist = g.bfs([start], { jumpGap: L.jumpGap || 0, avoid: F.OBSTACLE });
    const cells = new Set();
    for (const s of a) {
      check(dist[s.cell] >= 0, `${L.theme.id} ${seed}: ammo at ${s.cell} unreachable`);
      check(!(g.flags[s.cell] & (F.VOID | F.PIT | F.HAZARD | F.OBSTACLE | F.DOOR | F.STAIR)), `${L.theme.id} ${seed}: ammo on a bad cell`);
      check(!cells.has(s.cell) && !L.chests.some((c) => c.cell === s.cell), `${L.theme.id} ${seed}: ammo stacked`);
      cells.add(s.cell);
    }
    // same seed, same spots
    const L2 = generateLevel({ depth: 1 + (seed % 9), seed, playerLevel: 5, themeId: th });
    check(JSON.stringify(L2.ammo) === JSON.stringify(a), `${L.theme.id} ${seed}: cache positions not deterministic`);
    total += a.length;
  }
  check(preBoss >= themes.length * 3 * 0.75, `a box before the boss arena in only ${preBoss} levels`);
  console.log(`level caches: ${total} spots over ${themes.length * 3} levels, ${preBoss} with a box before the boss`);
  // the box before the boss arena always holds ammo for a gun the player carries
  const lvl = { seed: 5, ammo: [{ x: 1.5, z: 1.5, big: true, boss: true }, { x: 3.5, z: 1.5, big: true }] };
  let ok = true;
  for (let s = 1; s <= 40; s++) {
    const fg = { world: { pickups: [], floorAt: () => 0 }, player: { weapons: () => [mk('rifle'), mk('flamer')] } };
    Game.prototype.stockAmmo.call(fg, { ...lvl, seed: s });
    if (fg.world.pickups[0].type !== 'fuel' || fg.world.pickups[0].value !== AMMO.fuel.box) ok = false;
  }
  check(ok, 'the box before the boss is for an equipped gun');
}

console.log(fails ? `ammo FAILED (${fails})` : 'ammo OK');
process.exit(fails ? 1 : 0);
