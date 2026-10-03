// End-to-end headless playthrough. Usage: node tests/play.mjs <outdir> [theme,theme,...]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const out = process.argv[2] || '.';
const themes = (process.argv[3] || '').split(',').filter(Boolean);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:8080/index.html');
await page.waitForFunction(() => window.SEVERDREAD && document.getElementById('boot').classList.contains('hidden'), null, { timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.click('[data-a=new]');
await page.waitForFunction(() => window.SEVERDREAD.state === 'playing', null, { timeout: 60000 });
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const G = (fn, arg) => page.evaluate(fn, arg);

for (const th of themes) {
  await G(async (t) => { const g = window.SEVERDREAD; g.debugTheme = t; await g.startLevel(Math.max(1, g.save.run.depth + 1)); }, th);
  await wait(2000);
  await shot('theme_' + th);
  const info = await G(() => { const g = window.SEVERDREAD; return { theme: g.world.theme.id, mons: g.world.monsters.length, tex: g.world.texReport, fps: Math.round(g.fps) }; });
  console.log(JSON.stringify(info));
}
if (!themes.length) {
  // ---- level 1 gameplay
  await G(async () => { await window.SEVERDREAD.startLevel(1); });
  await wait(1500);
  // let monsters come at us for a few seconds
  await G(() => { const g = window.SEVERDREAD; for (const m of g.world.monsters) m.alerted = true; });
  await wait(4000);
  await shot('10_monsters_attacking');
  const hp = await G(() => window.SEVERDREAD.player.hp);
  console.log('hp after 4s of attacks', hp);
  // kill everything with player damage (drops loot, xp, keys)
  await G(() => {
    const g = window.SEVERDREAD, p = g.player;
    p.invuln = 999;
    import('./src/game/combat.js').then((c) => { for (const m of g.world.monsters) if (!m.dead) { m.x = p.x + 2; m.z = p.z; c.damageMonster(g, m, 1e7, { element: 'fire' }); } });
  });
  await wait(1500);
  await shot('11_loot');
  const st = await G(() => { const g = window.SEVERDREAD; return { left: g.killsLeft, portal: !!g.world.portal, pickups: g.world.pickups.length, lvl: g.save.level, xp: g.save.xp, credits: g.save.credits }; });
  console.log('after kills', JSON.stringify(st));
  await wait(1200);
  await shot('12_levelup');
  // collect everything
  await G(() => { const g = window.SEVERDREAD; for (const pk of g.world.pickups) { pk.x = g.player.x; pk.z = g.player.z; pk.y = g.player.y + 0.5; pk.age = 1; pk.settled = true; } });
  await wait(1500);
  const bag = await G(() => { const g = window.SEVERDREAD; return { bag: g.save.bag.length, reagents: g.save.reagents, keys: [...g.player.keys] }; });
  console.log('collected', JSON.stringify(bag));
  // portal view
  await G(() => { const g = window.SEVERDREAD, P = g.world.portal, p = g.player; if (P) { p.x = P.x - 3; p.z = P.z; p.y = g.world.floorAt(p.x, p.z) ?? p.y; p.yaw = 0; } });
  await wait(800);
  await shot('13_portal');
  // inventory
  await G(() => window.SEVERDREAD.ui.openInventory());
  await wait(300);
  await page.click('[data-bag="0"]').catch(() => {});
  await wait(300);
  await shot('14_inventory');
  await G(() => window.SEVERDREAD.ui.closeAll());
  // portal menu -> home
  await G(() => window.SEVERDREAD.ui.openPortal());
  await wait(200);
  await shot('15_portal_menu');
  await page.click('[data-a=home]');
  await page.waitForFunction(() => window.SEVERDREAD.inHub && window.SEVERDREAD.state === 'playing', null, { timeout: 30000 });
  await wait(800);
  // shop
  await G(() => { const g = window.SEVERDREAD; g.ui.openNPC(g.world.npcs.find((n) => n.role === 'shop')); });
  await wait(300);
  await page.click('[data-shop="0"]').catch(() => {});
  await wait(200);
  await shot('16_shop');
  await G(() => window.SEVERDREAD.ui.closeAll());
  await G(() => { const g = window.SEVERDREAD; g.save.reagents.nano_paste = 50; g.save.reagents.servo_scrap = 50; g.save.credits += 5000; g.ui.openNPC(g.world.npcs.find((n) => n.id === 'gunsmith')); });
  await wait(200);
  await page.click('[data-eq="weapon0"]').catch(() => {});
  await wait(200);
  await page.click('[data-act="upgrade"]').catch(() => {});
  await wait(200);
  await shot('17_gunsmith');
  await G(() => window.SEVERDREAD.ui.closeAll());
  await G(() => { const g = window.SEVERDREAD; g.ui.openNPC(g.world.npcs.find((n) => n.role === 'bag')); });
  await wait(200);
  await shot('18_bag_npc');
  await G(() => window.SEVERDREAD.ui.closeAll());
  // death
  await G(async () => { const g = window.SEVERDREAD; await g.startLevel(1); });
  await wait(800);
  await G(() => { const g = window.SEVERDREAD; g.player.invuln = 0; import('./src/game/combat.js').then((c) => c.damagePlayer(g, 1e9)); });
  await wait(1500);
  await shot('19_death');
  const run = await G(() => window.SEVERDREAD.save.run);
  console.log('run after death', JSON.stringify(run));
}
console.log('ERRORS:\n' + errors.slice(0, 30).join('\n'));
await browser.close();
