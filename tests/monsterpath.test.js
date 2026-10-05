// Monsters, bosses included, must get through 1-tile-wide doorways, stairs,
// bridges and platforms. For narrow cells in many generated levels, a boss
// and an elite walker follow the flow field (Monster.move + settle, the same
// calls the chase AI makes) from 4 cells before the narrow spot to 4 cells
// past it. Run with -v for per-theme numbers.
import { THEMES } from '../src/data/themes.js';
import { MONSTERS } from '../src/data/monsters.js';
import { generateLevel } from '../src/game/levelgen/index.js';
import { F } from '../src/game/grid.js';
import { World } from '../src/game/world.js';
import { Player } from '../src/game/player.js';
import { Monster } from '../src/game/monster.js';
import { PLACEHOLDER_BASES } from '../src/data/weapons.js';

const verbose = process.argv.includes('-v');
const origWarn = console.warn; console.warn = () => {};
const BAD = F.VOID | F.PIT | F.HAZARD | F.OBSTACLE;
const BIG = Object.entries(MONSTERS).filter(([, m]) => m.boss).sort((a, b) => b[1].radius - a[1].radius)[0][0];
const ELITE = Object.entries(MONSTERS).filter(([, m]) => !m.boss && !m.flying).sort((a, b) => b[1].radius - a[1].radius)[0][0];

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
  return game;
}

// open on both ends along one axis, closed (wall, rail, ledge, door jamb) on both sides of the other
function narrowAxis(g, i) {
  if (!g.type[i] || (g.flags[i] & BAD) || g.ceil[i] - g.floor[i] < 1.7) return null;
  const x = i % g.w, z = (i / g.w) | 0;
  const walk = (a, b) => g.in(a, b) && g.passable(i, g.idx(a, b), 1.05, 1.65, false);
  const ex = walk(x + 1, z) || walk(x - 1, z), ez = walk(x, z + 1) || walk(x, z - 1);
  const ox = walk(x + 1, z) && walk(x - 1, z), oz = walk(x, z + 1) && walk(x, z - 1);
  if (ox && !ez) return [1, 0];
  if (oz && !ex) return [0, 1];
  return null;
}

let tried = 0, failures = 0;
const res = { new: { big: 0, elite: 0 }, n: 0 };
const fails = [];
const themes = THEMES.filter((t, k) => k % 2 === 0 || ['castle', 'possessed_station', 'hell', 'downtown', 'skyscraper_tops', 'canyon_bridges', 'mountain_climb', 'heaven'].includes(t.id));
for (const theme of themes) {
  const L = generateLevel({ depth: 6, seed: 777 + theme.id.length * 31, playerLevel: 6, themeId: theme.id });
  const game = makeGame(L), w = game.world, g = w.grid, W = g.w;
  for (const d of w.doors) { d.locked = false; d.open = 1; d.target = 1; d.timer = 1e9; }
  const startD = g.bfs([g.idx(Math.floor(L.start.x), Math.floor(L.start.z))], { jumpGap: L.jumpGap || 0 });
  // spread-out narrow cells reachable from the start
  const cand = [];
  for (let i = 0; i < W * g.h; i++) {
    if (startD[i] < 0) continue;
    const ax = narrowAxis(g, i);
    if (!ax) continue;
    const x = i % W, z = (i / W) | 0;
    const A = [x - ax[0] * 4, z - ax[1] * 4], B = [x + ax[0] * 4, z + ax[1] * 4];
    if (!g.in(...A) || !g.in(...B)) continue;
    const ia = g.idx(...A), ib = g.idx(...B);
    if (startD[ia] < 0 || startD[ib] < 0 || (g.flags[ia] & BAD) || (g.flags[ib] & BAD)) continue;
    if (cand.some((c) => Math.abs(c.x - x) + Math.abs(c.z - z) < 6)) continue;
    cand.push({ i, x, z, ia, ib });
  }
  let tn = 0, tb = 0, te = 0;
  for (const c of cand.slice(0, 6)) {
    // the route from A to B must actually use the narrow cell and stay short
    const dB = g.bfs([c.ib], { jumpGap: L.jumpGap || 0 });
    if (dB[c.ia] < 0 || dB[c.ia] > 10 || dB[c.i] < 0 || dB[c.i] + 4 > dB[c.ia] + 1) continue;
    tn++; tried++;
    const bx = (c.ib % W) + 0.5, bz = ((c.ib / W) | 0) + 0.5;
    w.updateFlow(10, bx, bz);
    for (const [key, id, elite] of [['big', BIG, false], ['elite', ELITE, true]]) {
      const m = new Monster(game, { monster: id, x: (c.ia % W) + 0.5, z: ((c.ia / W) | 0) + 0.5, variant: 'normal', elite }, 6);
      m.mode = 'floor';
      let ok = false;
      for (let t = 0; t < 60 * 12 && !ok; t++) {
        const goal = w.flowStep(m.x, m.z);
        if (goal) {
          const gx = goal.x - m.x, gz = goal.z - m.z, gl = Math.hypot(gx, gz) || 1, step = Math.max(2, m.speed) / 60;
          m.move((gx / gl) * step, (gz / gl) * step);
        }
        m.settle(1 / 60);
        if (m.dead) break;
        if (Math.hypot(m.x - bx, m.z - bz) < 0.9) ok = true;
      }
      if (ok) { res.new[key]++; if (key === 'big') tb++; else te++; } else fails.push(`${theme.id} ${key} stuck near (${c.x},${c.z}) at (${m.x.toFixed(2)},${m.z.toFixed(2)})`);
    }
  }
  res.n += tn;
  if (verbose) console.log(theme.id.padEnd(22), `narrow spots ${tn}, boss through ${tb}, elite through ${te}`);
}
console.warn = origWarn;
const rate = (k) => (res.n ? res.new[k] / res.n : 1);
console.log(`monster paths: ${res.n} narrow spots (${BIG} r=${MONSTERS[BIG].radius}, elite ${ELITE}), boss ${(rate('big') * 100).toFixed(1)}%, elite ${(rate('elite') * 100).toFixed(1)}% got through`);
if (fails.length && verbose) for (const f of fails.slice(0, 20)) console.log('  ', f);
// a few spots can be genuinely awkward (moving platforms, jump gaps); everything else must pass
if (res.n < 40) { failures++; console.log('FAIL too few narrow spots tested'); }
if (rate('big') < 0.97 || rate('elite') < 0.97) { failures++; console.log('FAIL monsters stuck in narrow passages'); for (const f of fails.slice(0, 12)) console.log('  ', f); }
console.log(failures ? 'monster path failures' : 'monster paths OK');
process.exit(failures ? 1 : 0);
