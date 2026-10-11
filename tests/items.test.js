// Item generation smoke test + rarity distribution report.
import { Rng } from '../src/core/rng.js';
import { generateItem, describeItem, sellValue, dps } from '../src/game/items.js';
import { computeStats } from '../src/game/stats.js';
import { PLACEHOLDER_BASES } from '../src/data/weapons.js';
import { xpToNext } from '../src/data/balance.js';

const bases = [
  ...PLACEHOLDER_BASES.map((b) => ({ ...b, enabled: b.archetype !== 'smg' })),
  { id: 'smg_kestrel', name: 'Kestrel', archetype: 'smg', element: 'physical', real: true, enabled: true },
];
const rng = new Rng(42);
const counts = {};
let fails = 0;
for (let i = 0; i < 5000; i++) {
  const it = generateItem(rng, { level: rng.int(1, 120), bases, depth: rng.int(1, 40) });
  counts[it.rarity] = (counts[it.rarity] || 0) + 1;
  const lines = describeItem(it);
  if (!it.name || !lines.length && it.kind !== 'ring' || !(sellValue(it) > 0)) { fails++; console.log('bad item', it); }
  if (it.kind === 'weapon' && !(dps(it) > 0)) { fails++; console.log('bad dps', it); }
  for (const l of lines) if (/NaN|undefined/.test(l.text)) { fails++; console.log('bad line', l.text, it); break; }
}
console.log('rarity distribution (5000 drops, mixed depth):', counts);
// show a few sample legendaries
const leg = [];
while (leg.length < 3) { const it = generateItem(rng, { level: 30, bases, rarity: 'legendary' }); leg.push(it); }
for (const it of leg) console.log(`  ${it.name} [${it.kind}${it.archetype ? ' ' + it.archetype : ''}] lv${it.level}:`, describeItem(it).map((l) => l.text).join(' | '));
const st = computeStats(10, { weapon1: leg[0], ring1: leg[1], body: leg[2] });
if (!(st.maxHp > 0) || Number.isNaN(st.armor)) { fails++; console.log('bad stats', st); }
console.log('xp to next at 1/10/30/50/200:', [1, 10, 30, 50, 199].map(xpToNext));
console.log(fails ? `${fails} failures` : 'items OK');
process.exit(fails ? 1 : 0);
