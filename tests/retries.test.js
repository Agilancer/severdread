// Generator retries: the purpose-built archetypes (a real plan, not random
// rooms) must build first time. A retry means a plan the generator could not
// finish (a route a template walled in, a door with no room for its steps);
// it costs a whole rebuild on the loading screen and hides plan bugs.
// Sweeps every theme of these archetypes over a few seeds and depths.
import { THEMES } from '../src/data/themes.js';
import { generateLevel } from '../src/game/levelgen/index.js';

const ARCHS = new Set(['lab', 'foundry', 'starship', 'mansion', 'prison']);
const SEEDS = +(process.argv[2] || 5), DEPTHS = [1, 4, 9, 20];
const warns = [];
const origWarn = console.warn;
console.warn = (...a) => warns.push(a.map((x) => (x?.message ?? String(x))).join(' '));
let fails = 0, levels = 0;
for (const th of THEMES.filter((t) => ARCHS.has(t.archetype))) {
  for (const d of DEPTHS) for (let s = 1; s <= SEEDS; s++) {
    warns.length = 0;
    const L = generateLevel({ depth: d, seed: s * 7919 + d, playerLevel: d, themeId: th.id });
    levels++;
    const r = warns.filter((w) => w.includes('retrying'));
    if (r.length || L.theme.id !== th.id) { fails++; origWarn(`FAIL: ${th.id} depth ${d} seed ${s}: ${r.length} retries${L.theme.id !== th.id ? ', fell back to ' + L.theme.id : ''}\n   ${r[0] || ''}`); }
  }
}
console.warn = origWarn;
console.log(fails ? `retries FAILED (${fails} of ${levels} levels)` : `retries OK (${levels} levels)`);
process.exit(fails ? 1 : 0);
