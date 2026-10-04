// Level quality metrics: texture-role variety, narrow passages, tall spaces,
// stairs and rails. Guards the "big spaces, real stairs, logical textures on
// many different objects" overhaul against regressions.
import { THEMES } from '../src/data/themes.js';
import { generateLevel } from '../src/game/levelgen/index.js';
import { buildHub } from '../src/game/levelgen/hub.js';
import { TS } from '../src/game/levelgen/common.js';
import { F, DIR_X, DIR_Z } from '../src/game/grid.js';
import { scatterStyle, TERM_WALL } from '../src/data/scatter.js';

// Computer terminals (levelgen/scatter.js): consoles stand on plain reachable
// floor with their backs to a real wall, wall panels hang on real, clean walls
// of open floor cells at console height, nothing on doors / stairs / pits /
// windows or behind detail geometry, none in medieval or natural themes.
const BAD_WALL_TEX = new Set([TS.GLASS, TS.FACADE, TS.FACADE2, TS.FACADE3, TS.DOOR, TS.DOOR_RED, TS.DOOR_BLUE, TS.DOOR_YELLOW, TS.DOOR_GREEN, TS.DOOR_PURPLE, TS.SCREEN, TS.NEON, TS.LIGHT]);
const NO_TERM = F.DOOR | F.STAIR | F.BRIDGE | F.PIT | F.VOID | F.HAZARD | F.WATER;
function terminalProblems(L, g, theme) {
  const S = L.scatter || {}, terms = S.terminals || [], walls = S.wallTerminals || [], W = g.w, out = [];
  const st = theme ? scatterStyle(theme) : null;
  if (st && !(st.term > 0) && (terms.length || walls.length)) out.push(`${terms.length + walls.length} terminals in a theme without computers`);
  const nearDoor = (i, r) => { const x = i % W, z = (i / W) | 0; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.in(x + dx, z + dz) && (g.flags[(z + dz) * W + x + dx] & (F.DOOR | F.STAIR | F.BRIDGE))) return true; return false; };
  const solidAt = (i, d) => { const x = (i % W) + DIR_X[d], z = ((i / W) | 0) + DIR_Z[d]; return g.in(x, z) && !g.type[z * W + x] ? z * W + x : -1; };
  const startI = g.idx(Math.floor(L.start.x), Math.floor(L.start.z));
  for (const t of terms) {
    for (const c of t.cells) {
      if (!g.type[c] || (g.flags[c] & NO_TERM)) out.push(`console on a forbidden cell ${c}`);
      if (nearDoor(c, 1)) out.push(`console next to a door / stair ${c}`);
      if (!L.hub && Math.max(Math.abs((c % W) - (startI % W)), Math.abs(((c / W) | 0) - ((startI / W) | 0))) <= 3) out.push('console at the start');
      if (t.wall >= 0 && solidAt(c, t.wall) < 0) out.push(`console back not against a wall ${c}`);
    }
  }
  for (const p of walls) {
    const i = p.cell, j = solidAt(i, p.wall), f = g.floor[i];
    if (!g.type[i] || (g.flags[i] & NO_TERM)) out.push(`wall panel over a forbidden cell ${i}`);
    if (j < 0) { out.push(`wall panel not on a wall ${i}`); continue; }
    if (BAD_WALL_TEX.has(g.wallTex[j])) out.push(`wall panel on a window / door / screen wall ${i}`);
    if (nearDoor(i, 1)) out.push(`wall panel by a door / stair ${i}`);
    const top = g.sky[i] ? g.floor[j] : g.ceil[i];
    if (p.lo < f + TERM_WALL.minBottom - 1e-6 || p.hi > top + 1e-6 || p.hi - p.lo < 0.44) out.push(`wall panel band ${(p.lo - f).toFixed(2)}..${(p.hi - f).toFixed(2)} off`);
    // nothing but thin trims / skins on the wall where it hangs
    for (const b of L.deco.boxes) {
      let d0, d1, b0, b1;
      if (p.wall === 0) { d0 = p.line - b.x1; d1 = p.line - b.x0; b0 = b.z0; b1 = b.z1; }
      else if (p.wall === 1) { d0 = b.x0 - p.line; d1 = b.x1 - p.line; b0 = b.z0; b1 = b.z1; }
      else if (p.wall === 2) { d0 = p.line - b.z1; d1 = p.line - b.z0; b0 = b.x0; b1 = b.x1; }
      else { d0 = b.z0 - p.line; d1 = b.z1 - p.line; b0 = b.x0; b1 = b.x1; }
      if (d1 <= 0.001 || d0 > 0.5 || b1 <= p.along - p.maxW / 2 || b0 >= p.along + p.maxW / 2 || b.y1 <= p.lo + 0.01 || b.y0 >= p.hi - 0.01) continue;
      if (d1 > 0.1 || b.emissive) { out.push(`wall panel behind detail geometry ${i}`); break; }
    }
  }
  return out;
}
const termRows = {};

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
  // most walkable floor must be reachable from the start (no cut-off wings)
  const dist = g.bfs([g.idx(Math.floor(L.start.x), Math.floor(L.start.z))], { jumpGap: L.jumpGap || 0 });
  let walk = 0, reach = 0;
  for (let i = 0; i < g.w * g.h; i++) {
    if (!g.type[i] || (g.flags[i] & (F.VOID | F.PIT | F.OBSTACLE | F.HAZARD)) || g.ceil[i] - g.floor[i] < 1.7) continue;
    walk++; if (dist[i] >= 0) reach++;
  }
  for (const b of L.deco?.boxes || []) {
    if (typeof b.tex === 'number') slots.add(b.tex);
    else for (const v of Object.values(b.tex)) slots.add(v);
  }
  const m = { theme: theme.id, arch: theme.archetype, reachPct: +(100 * reach / walk).toFixed(1), slots: slots.size, narrowPct: +(100 * narrow / open).toFixed(1), tallPct: +(100 * tall / open).toFixed(1), stairs, railed, pits, boxes: L.deco?.boxes?.length || 0 };
  rows.push(m);
  const problems = [];
  if (m.slots < 6) problems.push(`only ${m.slots} texture roles in use`);
  if (reach / walk < 0.85) problems.push(`only ${m.reachPct}% of the walkable floor is reachable`);
  const lim = NARROW_LIMIT[theme.archetype] ?? 0.12;
  if (narrow / open > lim) problems.push(`narrow passages ${m.narrowPct}% > ${lim * 100}%`);
  problems.push(...terminalProblems(L, g, theme));
  const fam = scatterStyle(theme).family, tr = termRows[fam] || (termRows[fam] = { themes: 0, consoles: 0, panels: 0 });
  tr.themes++; tr.consoles += L.scatter.terminals.length; tr.panels += L.scatter.wallTerminals.length;
  // tech bases built from rooms get plenty of both
  if (['station', 'rooms'].includes(theme.archetype) && scatterStyle(theme).term >= 0.8 && (L.scatter.terminals.length < 4 || L.scatter.wallTerminals.length < 6)) problems.push(`only ${L.scatter.terminals.length} consoles / ${L.scatter.wallTerminals.length} wall panels in a tech base`);
  if (problems.length) { failures++; console.log('FAIL', theme.id, problems.join(', ')); }
}
// per family: none in nature, ice, desert and heaven (castles: only the cyber
// castle and a brass clock tower, checked per theme above); plenty in stations
for (const fam of ['nature', 'ice', 'desert', 'heaven']) if (termRows[fam] && termRows[fam].consoles + termRows[fam].panels > 0) { failures++; console.log('FAIL terminals in', fam, JSON.stringify(termRows[fam])); }
if (!termRows.station || termRows.station.consoles < termRows.station.themes * 6 || termRows.station.panels < termRows.station.themes * 10) { failures++; console.log('FAIL too few terminals in stations', JSON.stringify(termRows.station)); }
// more seeds / depths for the themes with the most computers
for (const id of ['possessed_station', 'bio_lab', 'military_base', 'volcano_base', 'data_core', 'cyber_castle', 'hell', 'downtown']) {
  for (const depth of [12, 21]) {
    const L = generateLevel({ depth, seed: 9001 + depth * 31 + id.length, playerLevel: depth, themeId: id });
    const problems = terminalProblems(L, L.grid, THEMES.find((t) => t.id === id));
    if (problems.length) { failures++; console.log('FAIL', id, 'd' + depth, problems.join(', ')); }
  }
}
// the hub: a few consoles and panels, none on the teleporter pad or at an NPC
{
  const H = buildHub(), g = H.grid, S = H.scatter, pad = H.teleporter;
  const problems = terminalProblems(H, g, null);
  if (S.terminals.length < 2 || S.wallTerminals.length < 4) problems.push('hub has too few terminals');
  for (const t of S.terminals) {
    if (Math.abs(t.x - pad.x) < 5.5 && Math.abs(t.z - pad.z) < 5.5) problems.push('console in the teleporter chamber');
    for (const n of H.npcs) if (Math.hypot(t.x - n.x, t.z - n.z) < 2) problems.push('console at an NPC');
  }
  if (problems.length) { failures++; console.log('FAIL hub', problems.join(', ')); }
}
if (verbose) { console.table(rows); console.table(termRows); }
console.log(failures ? `${failures} quality failures` : 'level quality OK');
process.exit(failures ? 1 : 0);
