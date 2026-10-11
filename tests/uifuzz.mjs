// Menu / pop-up robustness fuzzer. Drives random keys, clicks on whatever
// buttons are on screen, touch controls and game events (teleporter, portal,
// NPC shops, level loads, death) and checks after every step that the game
// never crashes or locks:
//   - no page errors
//   - a menu / paused state always shows a screen (no invisible modal)
//   - 'playing' never has a leftover modal screen on top
//   - loading never hangs (> 60 s; swiftshader under load can take 20-30 s)
// Usage: node tests/uifuzz.mjs [steps] [seed] [touch]   (SEVERDREAD_URL as tests/play.mjs)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const STEPS = +(process.argv[2] || 200), touch = process.argv[4] === 'touch';
let seed = +(process.argv[3] || 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const vp = touch ? { width: 844, height: 390 } : { width: 960, height: 540 };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: vp, hasTouch: touch, isMobile: touch });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push('[console] ' + m.text()); });
await page.goto((process.env.SEVERDREAD_URL || 'http://localhost:8080') + '/index.html');
await page.waitForFunction(() => window.SEVERDREAD && document.getElementById('boot').classList.contains('hidden'), null, { timeout: 120000 });
await page.evaluate(() => localStorage.clear());   // first launch: the welcome guide shows too
if (touch) await page.touchscreen.tap(vp.width / 2, vp.height / 2); else await page.keyboard.press('Enter');
await page.waitForSelector('[data-a=new]', { timeout: 30000 });
await (touch ? page.tap('[data-a=new]') : page.click('[data-a=new]'));
await page.waitForFunction(() => window.SEVERDREAD.world && window.SEVERDREAD.state !== 'loading', null, { timeout: 60000 });

const KEYS = ['Tab', 'KeyI', 'KeyM', 'Escape', 'KeyP', 'KeyE', 'Digit1', 'Digit2', 'Space', 'KeyQ'];
const ROLES = ['menu', 'map', 'pause', 'use', 'weapon1', 'jump'];
const GAME = {
  teleporter: () => { const g = window.SEVERDREAD; if (g.inHub && g.state === 'playing') g.ui.openTeleporter(); },
  npc: () => { const g = window.SEVERDREAD; if (g.inHub && g.state === 'playing' && g.world.npcs.length) g.ui.openNPC(g.world.npcs[Math.floor(Math.random() * g.world.npcs.length)]); },
  clear: () => { const g = window.SEVERDREAD; if (!g.inHub && g.state === 'playing') for (const m of g.world.monsters) if (!m.dead) { m.hp = 0; import('./src/game/combat.js').then((c) => c.killMonster(g, m, {})); } },
  portal: () => { const g = window.SEVERDREAD; if (!g.inHub && g.state === 'playing' && g.world.portal) g.ui.openPortal(); },
  descend: () => { const g = window.SEVERDREAD; if (g.state === 'playing' && Math.random() < 0.5) g.startLevel((g.save.run.depth || 0) + 1); },
  die: () => { const g = window.SEVERDREAD; if (!g.inHub && g.state === 'playing' && Math.random() < 0.3) { g.player.invuln = 0; g.player.hp = 0; g.playerDied(); } },
  hub: () => { const g = window.SEVERDREAD; if (!g.inHub && g.state === 'playing' && Math.random() < 0.3) g.enterHub('fuzz'); },
};
const log = [];
let loadingSince = 0, fails = 0;
const seenStates = {}, seenActs = {};
const check = async (step, what) => {
  const s = await page.evaluate(() => {
    const g = window.SEVERDREAD, ui = document.getElementById('ui');
    const screens = [...ui.querySelectorAll(':scope > .screen')].filter((el) => !el.classList.contains('loading') && el.offsetParent !== null);
    return { state: g.state, screens: screens.length, loading: !!ui.querySelector('.loading'), hub: g.inHub, layer: !!g.ui.layer };
  });
  const bad = [];
  if ((s.state === 'menu' || s.state === 'paused') && s.screens === 0) bad.push(`state ${s.state} with no screen shown (invisible modal)`);
  if (s.state === 'playing' && s.screens > 0) bad.push(`playing with ${s.screens} modal screen(s) still up`);
  if (s.state === 'loading') { loadingSince = loadingSince || Date.now(); if (Date.now() - loadingSince > 60000) bad.push('stuck loading > 60 s'); } else loadingSince = 0;
  if (errors.length) bad.push('errors: ' + errors.splice(0).join(' || '));
  if (process.env.FUZZ_TRACE) console.log(step, what, JSON.stringify(s));
  if (bad.length) { fails++; console.log(`STEP ${step} ${what} -> ${JSON.stringify(s)}: ${bad.join('; ')}`); console.log('  last actions:', log.slice(-6).join(' > ')); }
  seenStates[s.state + (s.hub ? '@hub' : '')] = (seenStates[s.state + (s.hub ? '@hub' : '')] || 0) + 1;
  return s;
};

for (let step = 0; step < STEPS; step++) {
  const r = rnd();
  let what;
  try {
    if (r < 0.34) {
      what = 'key ' + pick(KEYS);
      await page.keyboard.press(what.slice(4));
    } else if (r < 0.66) {
      const btns = await page.$$('#ui .screen button:not([disabled]), #ui .screen .tab, #ui .screen .slot');
      if (btns.length) {
        const b = pick(btns);
        what = 'click ' + ((await b.getAttribute('data-a')) || (await b.getAttribute('data-view')) || (await b.textContent()).trim().slice(0, 20));
        if (touch) await b.tap({ timeout: 2000 }).catch(() => {}); else await b.click({ timeout: 2000 }).catch(() => {});
      } else what = 'no buttons';
    } else if (r < 0.78 && touch) {
      const role = pick(ROLES);
      what = 'touch ' + role;
      await page.tap(`.tbtn[data-role=${role}]`, { timeout: 1500 }).catch(() => {});
    } else {
      const k = pick(Object.keys(GAME));
      what = 'game ' + k;
      await page.evaluate(GAME[k]);
    }
  } catch (e) { what = (what || 'action') + ' (threw ' + e.message.split('\n')[0] + ')'; }
  log.push(what);
  const kind = what.split(' ').slice(0, 2).join(' ');
  seenActs[kind] = (seenActs[kind] || 0) + 1;
  await page.waitForTimeout(120 + Math.floor(rnd() * 250));
  const s = await check(step, what);
  if (s.state === 'title') {   // quit to title: carry on from the save
    await page.waitForSelector('[data-a=continue],[data-a=new]', { timeout: 10000 }).catch(() => {});
    const c = (await page.$('[data-a=continue]')) || (await page.$('[data-a=new]'));
    if (c) await (touch ? c.tap() : c.click()).catch(() => {});
    await page.waitForTimeout(1500);
  }
}
// final: whatever is open must still close back to play
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.evaluate(() => { const g = window.SEVERDREAD; if (g.state === 'menu' || g.state === 'paused') g.ui.closeAll(); });
await page.waitForTimeout(300);
const end = await check(STEPS, 'final close');
console.log('states seen', JSON.stringify(seenStates));
console.log('actions', JSON.stringify(Object.fromEntries(Object.entries(seenActs).sort((a, b) => b[1] - a[1]).slice(0, 30))));
console.log(`ui fuzz (${touch ? 'touch' : 'keyboard'}, ${STEPS} steps): ${fails ? fails + ' problem(s)' : 'OK'}; ends in state ${end.state}`);
await browser.close();
process.exit(fails ? 1 : 0);
