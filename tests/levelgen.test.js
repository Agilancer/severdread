// Generates every theme at several depths and checks basic invariants.
import { THEMES } from '../src/data/themes.js';
import { generateLevel } from '../src/game/levelgen/index.js';
import { F } from '../src/game/grid.js';

let failures = 0;
const verbose = process.argv.includes('-v');
for (const theme of THEMES) {
  for (const depth of [1, 7, 25]) {
    const t0 = Date.now();
    let L;
    try {
      L = generateLevel({ depth, seed: 1234 + depth * 77 + theme.id.length, playerLevel: depth, themeId: theme.id });
    } catch (e) {
      console.error('FAIL', theme.id, depth, e.stack);
      failures++;
      continue;
    }
    const g = L.grid;
    const si = g.idx(Math.floor(L.start.x), Math.floor(L.start.z));
    const dist = g.bfs([si], { jumpGap: L.jumpGap });
    const bi = L.boss.cell;
    const problems = [];
    if (!g.type[si]) problems.push('start not open');
    if (dist[bi] < 0) {
      // boss must be reachable with all doors open
      problems.push('boss unreachable');
    }
    if (L.arena.length && !L.arena.includes(bi)) problems.push('boss outside arena');
    for (const k of L.keys) if (dist[g.idx(Math.floor(k.x), Math.floor(k.z))] < 0) problems.push('key unreachable ' + k.color);
    for (const d of L.doors) if (d.color && !L.keys.some((k) => k.color === d.color) && !L.spawns.some((s) => s.carriesKey === d.color)) problems.push('no key for ' + d.color);
    const ms = Date.now() - t0;
    if (problems.length) { failures++; console.log('FAIL', theme.id, 'd' + depth, problems.join(', ')); }
    else if (verbose) console.log('ok  ', theme.id.padEnd(22), 'd' + depth, `${g.w}x${g.h}`, 'enemies', L.spawns.length, 'doors', L.doors.length, 'locks', L.doors.filter((d) => d.color).length, 'chests', L.chests.length, ms + 'ms');
  }
}
console.log(failures ? `${failures} failures` : 'all levels OK');
process.exit(failures ? 1 : 0);
