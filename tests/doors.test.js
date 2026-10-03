// Door spans: every door is a straight run of cells on one floor; keyed doors
// are 3 cells wide (a small reported fallback share may be narrower), stand
// in a walled doorway with head room, and their keys can be collected in
// order (each key reachable with only the earlier doors open). The boss is
// reachable once every door is open. Then, with the real World / Player, a
// locked door blocks the player without its key and lets them walk through
// with it (through the middle and a side cell of the span).
import { THEMES } from '../src/data/themes.js';
import { generateLevel } from '../src/game/levelgen/index.js';
import { F } from '../src/game/grid.js';
import { World } from '../src/game/world.js';
import { Player } from '../src/game/player.js';
import { input, endFrame } from '../src/engine/input.js';
import { PLACEHOLDER_BASES } from '../src/data/weapons.js';

const verbose = process.argv.includes('-v');
const MAX_NARROW_SHARE = 0.05;
let failures = 0, levels = 0, withLocks = 0, locked = 0, wide = 0, plain = 0;
const narrow = [];
const origWarn = console.warn;
console.warn = () => {};   // generator retries are expected noise here
for (const theme of THEMES) {
  for (const depth of [1, 6, 15]) {
    const seed = 777 + depth * 131 + theme.id.length * 17;
    const L = generateLevel({ depth, seed, playerLevel: depth, themeId: theme.id });
    const g = L.grid, W = g.w;
    levels++;
    const problems = [];
    const si = g.idx(Math.floor(L.start.x), Math.floor(L.start.z));
    const opts = { jumpGap: L.jumpGap || 0, avoid: F.OBSTACLE };
    const locks = L.doors.filter((d) => d.color);
    if (locks.length) withLocks++;
    const seen = new Set();
    for (const d of L.doors) {
      const cells = d.cells || [];
      if (!cells.length || !cells.includes(d.cell)) { problems.push(`door ${d.color || 'plain'} has no cells / centre outside`); continue; }
      for (const c of cells) { if (seen.has(c)) problems.push('cell in two doors'); seen.add(c); }
      // a straight contiguous line across the travel axis, one floor, all F.DOOR
      const step = d.axis === 'x' ? W : 1;
      const sorted = [...cells].sort((a, b) => a - b);
      for (let k = 1; k < sorted.length; k++) if (sorted[k] - sorted[k - 1] !== step) problems.push(`door ${d.color || 'plain'} cells not contiguous across axis ${d.axis}`);
      const f = g.floor[cells[0]];
      for (const c of cells) {
        if (!g.type[c] || !(g.flags[c] & F.DOOR)) problems.push('door cell not an open F.DOOR cell');
        if (Math.abs(g.floor[c] - f) > 1e-4) problems.push(`door ${d.color || 'plain'} cells on different floors`);
        if (g.flags[c] & (F.STAIR | F.PIT | F.VOID | F.BRIDGE | F.HAZARD)) problems.push('door on stair / pit / void / bridge / hazard');
        if (g.edge[c]) problems.push('door cell has a rail edge');
      }
      if (!d.color) { plain++; if (cells.length !== 1) problems.push('plain door wider than 1'); continue; }
      locked++;
      if (cells.length === 3) wide++; else narrow.push(`${theme.id}/d${depth}:${cells.length}`);
      // keyed door: floor + 3 tall, head room in front / behind, walled ends
      const top = f + 3;
      const tstep = d.axis === 'x' ? 1 : W;
      for (const c of cells) {
        if (Math.abs(g.ceil[c] - top) > 1e-4 || g.sky[c]) problems.push(`${d.color} door not 3 tall (${(g.ceil[c] - f).toFixed(2)})`);
        for (const j of [c - tstep, c + tstep]) {
          if (!g.type[j]) { problems.push(`${d.color} door has a wall in front / behind`); continue; }
          if (!g.sky[j] && g.ceil[j] < top - 1e-4) problems.push(`${d.color} door: low ceiling next to it (${(g.ceil[j] - f).toFixed(2)})`);
          if (Math.abs(g.minFloor(j) - f) >= 0.6) problems.push(`${d.color} door: step in front / behind`);
        }
      }
      if (cells.length === 3) for (const j of [sorted[0] - step, sorted[2] + step]) if (g.type[j]) problems.push(`${d.color} door span not walled at its ends`);
    }
    // keys in order: key k reachable with doors k.. closed
    locks.forEach((d, k) => {
      const blocked = new Set(locks.slice(k).flatMap((o) => o.cells));
      const dist = g.bfs([si], { ...opts, blocked: (b) => blocked.has(b) });
      const spots = [
        ...L.keys.filter((key) => key.color === d.color).map((key) => g.cellAt(key.x, key.z)),
        ...L.spawns.filter((s) => s.carriesKey === d.color).map((s) => s.cell),
      ];
      if (!spots.length) problems.push(`no key for ${d.color}`);
      else if (!spots.some((c) => dist[c] >= 0)) problems.push(`${d.color} key not reachable with only earlier doors open`);
      // and the door itself must really block: the boss is cut off while it is shut
      if (dist[L.boss.cell] >= 0) problems.push(`${d.color} door can be bypassed`);
    });
    const all = g.bfs([si], opts);
    if (all[L.boss.cell] < 0) problems.push('boss unreachable with all doors open');
    if (problems.length) { failures++; console.log('FAIL', theme.id, 'd' + depth, [...new Set(problems)].join(', ')); }
    else if (verbose) console.log('ok  ', theme.id.padEnd(22), 'd' + depth, 'locked', locks.map((d) => d.cells.length).join(',') || '-', 'plain', L.doors.length - locks.length);
  }
}

// ---- in the real World / Player: a locked door blocks the whole doorway
// without its key; with the key it opens as one door and the player walks
// through (off-centre too, through a side cell of the span)
function makeGame(level) {
  const game = {
    time: 0, state: 'playing', inHub: false, noiseT: 0, post: { warp: 0, flash: [0, 0, 0, 0] }, settings: { shake: 1, damageNumbers: false },
    sfx() {}, shake() {}, slowMo() {}, toast() {}, events: { emit() {} }, playerDied() {}, damageNumber() {},
    monsterKilled() {}, gainXP() {}, bossAwake() {}, summonMonster() {}, addShockwave() {}, addSingularity() {}, elemLight: () => [1, 1, 1],
    content: { monsterSprite: () => ({ placeholder: true, handle: {} }), enemyProjectileId: () => null, weaponBases: PLACEHOLDER_BASES.map((b) => ({ ...b, enabled: true })) },
  };
  game.world = new World(game, level);
  game.player = new Player(game, { level: 5, equipment: {} });
  game.player.spawnAt(level.start.x, level.start.z, 0);
  game.player.invuln = 1e9;
  return game;
}
const DT = 1 / 60;
function walk(game, secs) {
  const w = game.world, p = game.player;
  input.move.x = 0; input.move.y = 1;
  for (let k = 0; k < Math.round(secs / DT); k++) { game.time += DT; p.update(DT); w.updateDoors(DT, p, w.monsters); endFrame(); }
  input.move.y = 0;
}
for (const id of ['possessed_station', 'castle', 'hell', 'downtown', 'caves', 'sewer_labyrinth', 'dream_maze', 'skyscraper_tops', 'canyon', 'mountain_climb', 'concert_hall']) {
  const L = generateLevel({ depth: 6, seed: 4242, playerLevel: 6, themeId: id });
  const game = makeGame(L), w = game.world, p = game.player;
  const d = w.doors.find((x) => x.color);
  if (!d) { failures++; console.log('FAIL walk', id, 'no locked door'); continue; }
  const ax = d.axis === 'x';
  const across = ax ? d.z1 - d.z0 : d.x1 - d.x0;
  const problems = [], walked = [];
  // approach lanes: the centre and one side cell of the span
  for (const lane of [0, across > 1 ? 1 : 0]) {
    const u = (ax ? d.cz : d.cx) + lane * 0.95;
    let start = null;
    for (const back of [2.2, 1.6, 2.8]) {
      const x = ax ? d.x0 - back : u, z = ax ? u : d.z0 - back;
      const y = w.floorAt(x, z);
      if (isFinite(y) && w.safeFooting(x, z, p.radius) && w.canOccupy(x, z, p.radius, y, p.height, 0.6)) { start = { x, z, y }; break; }
    }
    if (!start) continue;
    walked.push(lane);
    d.locked = true; d.open = 0; d.target = 0; d.timer = 0; p.keys.clear();
    Object.assign(p, { x: start.x, z: start.z, y: start.y, vx: 0, vy: 0, vz: 0, yaw: ax ? 0 : Math.PI / 2, pitch: 0 });
    walk(game, 2);
    const front = ax ? p.x + p.radius : p.z + p.radius, edge = ax ? d.x0 : d.z0;
    if (front > edge + 0.02 || d.open > 0) problems.push(`lane ${lane}: walked into the locked door without its key (${front.toFixed(2)} > ${edge})`);
    if (edge - front > 0.15) problems.push(`lane ${lane}: stopped ${(edge - front).toFixed(2)} short of the door`);
    p.keys.add(d.color);
    walk(game, 3);
    const pos = ax ? p.x : p.z, far = ax ? d.x1 : d.z1;
    if (d.locked || d.open < 0.99) problems.push(`lane ${lane}: door did not open with the key`);
    if (pos < far + 0.3) problems.push(`lane ${lane}: could not walk through the open door (${pos.toFixed(2)} < ${far})`);
  }
  if (!walked.length) problems.push('no free spot to walk up to the door from');
  if (problems.length) { failures++; console.log('FAIL walk', id, problems.join(', ')); }
  else if (verbose) console.log('ok   walk', id, `${across}-wide door, lanes ${walked.join(',')}`);
}
console.warn = origWarn;
const share = locked ? (locked - wide) / locked : 0;
console.log(`doors: ${levels} levels, ${withLocks} with keyed doors, ${locked} keyed (${wide} 3-wide, ${locked - wide} narrower${narrow.length ? ': ' + narrow.join(' ') : ''}), ${plain} plain`);
if (share > MAX_NARROW_SHARE) { failures++; console.log(`FAIL narrow keyed doors ${(share * 100).toFixed(1)}% > ${MAX_NARROW_SHARE * 100}%`); }
console.log(failures ? `${failures} door failures` : 'doors OK');
process.exit(failures ? 1 : 0);
