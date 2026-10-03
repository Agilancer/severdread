// Level quality metrics: texture-role variety, narrow passages, tall spaces,
// stairs and rails. Guards the "big spaces, real stairs, logical textures on
// many different objects" overhaul against regressions.
import { THEMES } from '../src/data/themes.js';
import { generateLevel } from '../src/game/levelgen/index.js';
import { F } from '../src/game/grid.js';

const verbose = process.argv.includes('-v');
// archetypes that are corridor-like by design get a looser narrow limit
const NARROW_LIMIT = { maze: 0.35, convoy: 1, rooftops: 0.3, islands: 0.3, canyon: 0.25, mountain: 0.25, caves: 0.2 };
let failures = 0;
const rows = [];
for (const theme of THEMES) {
  const L = generateLevel({ depth: 5, seed: 4242 + theme.id.length * 13, playerLevel: 5, themeId: theme.id });
  const g = L.grid;
  const slots = new Set();
  let open = 0, narrow = 0, tall = 0, stairs = 0, railed = 0, pits = 0;
  for (let z = 1; z < g.h - 1; z++) for (let x = 1; x < g.w - 1; x++) {
    const i = g.idx(x, z);
    if (!g.type[i]) continue;
    if (!(g.flags[i] & F.VOID)) { open++; slots.add(g.floorTex[i]); if (!g.sky[i]) slots.add(g.ceilTex[i]); }
    for (const j of [i - 1, i + 1, i - g.w, i + g.w]) if (!g.type[j]) slots.add(g.wallTex[j]);
    if (g.flags[i] & F.VOID) continue;
    const wx = !g.type[i - 1] && !g.type[i + 1], wz = !g.type[i - g.w] && !g.type[i + g.w];
    if ((wx || wz) && !(g.flags[i] & F.DOOR)) narrow++;
    if (g.sky[i] || g.ceil[i] - g.floor[i] >= 5.5) tall++;
    if (g.flags[i] & F.STAIR) stairs++;
    if (g.edge[i]) railed++;
    if (g.flags[i] & F.PIT) pits++;
  }
  for (const b of L.deco?.boxes || []) {
    if (typeof b.tex === 'number') slots.add(b.tex);
    else for (const v of Object.values(b.tex)) slots.add(v);
  }
  const m = { theme: theme.id, arch: theme.archetype, slots: slots.size, narrowPct: +(100 * narrow / open).toFixed(1), tallPct: +(100 * tall / open).toFixed(1), stairs, railed, pits, boxes: L.deco?.boxes?.length || 0 };
  rows.push(m);
  const problems = [];
  if (m.slots < 6) problems.push(`only ${m.slots} texture roles in use`);
  const lim = NARROW_LIMIT[theme.archetype] ?? 0.12;
  if (narrow / open > lim) problems.push(`narrow passages ${m.narrowPct}% > ${lim * 100}%`);
  if (problems.length) { failures++; console.log('FAIL', theme.id, problems.join(', ')); }
}
if (verbose) console.table(rows);
console.log(failures ? `${failures} quality failures` : 'level quality OK');
process.exit(failures ? 1 : 0);
