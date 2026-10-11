// Weapon fight probe (browser): how much of its full single-target damage
// each archetype really deals in a fight, relative to the rifle - the FIGHT
// table of tests/balance.test.js, which the ammo premiums (data/ammo.js
// ARCH_AMMO power) are tuned against. Re-run it after changing an archetype.
//
// Real shots, game time stepped at 60 Hz: a rare gun of every archetype at
// the area level (no patterns / affixes) against packs of 4 ranged / slow
// melee / fast melee monsters closing from ~8 m, and lone ones, with perfect
// aim on the nearest live monster. Effective dps = hp removed / (shots /
// fire rate), so misses, pellet spread and overkill count, and so do splash,
// pierce, ricochet, chains and nails on the neighbours. Short-reach weapons
// (melee, flamers) only count the melee packs (ranged monsters keep away from
// a player standing still). Runs vary by ~10-20%: average a couple.
// Usage: node tests/fight.mjs [depth] [arch,arch,...]   (SEVERDREAD_URL as tests/play.mjs; ~10 min)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const DEPTH = +(process.argv[2] || 5);
const ARCHS = (process.argv[3] || 'rifle,pistol,revolver,smg,lmg,shuriken,blade,mace,club,plasma,shotgun,super_shotgun,minigun,rocket,grenade,nailgun,rail,sniper,lightning,launcher,spreader,flamer,sprayer,crossbow,harpoon,javelin').split(',');
if (!ARCHS.includes('rifle')) ARCHS.unshift('rifle');
const SCENES = [
  { id: 'laser_weaver', n: 4, trials: 4, label: 'ranged pack' },
  { id: 'grinder_slug', n: 4, trials: 3, label: 'slow melee pack', melee: true },
  { id: 'bloodjaw_hound', n: 4, trials: 3, label: 'fast melee pack', melee: true },
  { id: 'grinder_slug', n: 1, trials: 4, label: 'lone melee' },
  { id: 'laser_weaver', n: 1, trials: 4, label: 'lone ranged' },
];
const SHORT = new Set(['blade', 'mace', 'club', 'flamer', 'sprayer']);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto((process.env.SEVERDREAD_URL || 'http://localhost:8080') + '/index.html');
await page.waitForFunction(() => window.SEVERDREAD && document.getElementById('boot').classList.contains('hidden'), null, { timeout: 120000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('severdread_welcome_v1', '1'); });
await page.keyboard.press('Enter');
await page.waitForSelector('[data-a=new]', { timeout: 30000 });
await page.click('[data-a=new]');
await page.waitForFunction(() => window.SEVERDREAD.state === 'playing', null, { timeout: 60000 });
await page.evaluate(async (d) => { const g = window.SEVERDREAD; g.save.level = d; g.player.recalc(); g.debugTheme = 'possessed_station'; await g.startLevel(d); }, DEPTH);

// one archetype against one scene: [hp removed, seconds of fire]
const fight = (arch, sc) => page.evaluate(async ({ arch, d, sc }) => {
  const g = window.SEVERDREAD, p = g.player, w = g.world;
  const I = await import('./src/game/items.js'), B = await import('./src/data/balance.js'), { Rng } = await import('./src/core/rng.js'), { input } = await import('./src/engine/input.js');
  const A = await import('./src/game/ammo.js'), { ARCHETYPES } = await import('./src/data/weapons.js'), { Monster } = await import('./src/game/monster.js');
  const bases = g.content.weaponBases.filter((b) => b.enabled);
  const arc = ARCHETYPES[arch];
  const wpn = I.generateWeapon(new Rng(77), B.areaLevel(d), 'rare', bases, bases.find((b) => b.archetype === arch) || { id: 'x', name: arch, archetype: arch, enabled: true });
  wpn.patterns = []; wpn.abilities = []; wpn.stats = {}; wpn.rate = arc.rate; wpn.damage = arc.damage * B.weaponDamageMult(B.areaLevel(d)) * 1.2;
  for (const k of Object.keys(g.save.equipment)) g.save.equipment[k] = null;
  g.save.equipment.weapon0 = wpn; p.weaponIndex = 0; p.sidearmOn = false; p.recalc();
  for (const t of A.AMMO_TYPES) g.save.ammo[t] = 99999;
  for (const m of w.monsters) { m.dead = true; m.deathT = 9; }
  w.monsters = [];
  // a lane: the direction from the start with the longest clear, level run
  if (!window.__lane) {
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12; let L = 0;
      for (let r = 1; r < 14; r += 0.5) { const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, f = w.floorAt(x, z); if (f === null || Math.abs(f - p.y) > 0.3 || !w.los(p.x, p.y + 1.4, p.z, x, f + 1, z)) break; L = r; }
      if (!best || L > best.L) best = { a, L };
    }
    window.__lane = { a: best.a, L: best.L, x: p.x, z: p.z, y: p.y };
  }
  const lane = window.__lane;
  let hp = 0, fire = 0;
  for (let tr = 0; tr < sc.trials; tr++) {
    p.x = lane.x; p.z = lane.z; p.y = lane.y; p.vx = p.vz = 0;
    const dist = Math.min(8, lane.L - 1), cx = p.x + Math.cos(lane.a) * dist, cz = p.z + Math.sin(lane.a) * dist;
    const ms = [];
    for (let k = 0; k < sc.n; k++) {
      const ox = sc.n > 1 ? ((k % 2) - 0.5) * 1.6 : 0, oz = sc.n > 1 ? (Math.floor(k / 2) - 0.5) * 1.6 : 0;
      const x = cx + ox * Math.cos(lane.a + Math.PI / 2) + oz * Math.cos(lane.a), z = cz + ox * Math.sin(lane.a + Math.PI / 2) + oz * Math.sin(lane.a);
      if (w.floorAt(x, z) === null) continue;
      const m = new Monster(g, { monster: sc.id, x, z, variant: 'normal' }, d, {});
      m.awake = true; m.alerted = true;
      w.monsters.push(m); ms.push(m);
    }
    const hp0 = ms.reduce((a, m) => a + m.hp, 0), s0 = p.shotCount;
    let t = 0;
    input.mode = 'touch'; input.fire = true;
    while (ms.some((m) => !m.dead) && t < 30) {
      const m = ms.filter((x) => !x.dead).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const eye = p.eyePos();
      p.yaw = Math.atan2(m.z - p.z, m.x - p.x); p.pitch = Math.atan2(m.y + m.height * 0.55 - eye[1], Math.hypot(m.x - p.x, m.z - p.z));
      p.hp = p.maxHp; p.invuln = 1; p.vx = p.vz = 0;
      g.update(1 / 60); t += 1 / 60;
    }
    input.fire = false;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    hp += hp0 - ms.reduce((a, m) => a + (m.dead ? 0 : Math.max(0, m.hp)), 0);
    fire += (p.shotCount - s0) / (wpn.rate * p.stats.fireRate);
    for (const m of ms) { m.dead = true; m.deathT = 9; }
    w.monsters = []; w.projectiles.length = 0;
  }
  // full single-target damage: every pellet, every shot
  return { eff: hp / Math.max(1e-6, fire), nominal: I.upgradedDamage(wpn) * Math.max(1, arc.pellets || 1) * wpn.rate * p.stats.fireRate };
}, { arch, d: DEPTH, sc });

const res = {};
for (const arch of ARCHS) {
  res[arch] = [];
  for (const sc of SCENES) { const r = await fight(arch, sc); res[arch].push(r.eff / r.nominal); }
  process.stdout.write('.');
}
console.log(`\ndepth ${DEPTH}: share of full single-target damage dealt, relative to the rifle (balance.test.js FIGHT)`);
console.log('arch           ' + SCENES.map((s) => s.label.padStart(16)).join('') + '     FIGHT');
const rifle = res.rifle;
for (const arch of ARCHS) {
  const rel = res[arch].map((v, i) => v / rifle[i]);
  const use = SHORT.has(arch) ? rel.filter((v, i) => SCENES[i].melee) : rel;
  const fightV = Math.exp(use.reduce((a, v) => a + Math.log(Math.max(0.05, v)), 0) / use.length);
  console.log(arch.padEnd(15) + rel.map((v) => v.toFixed(2).padStart(16)).join('') + fightV.toFixed(2).padStart(10));
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
