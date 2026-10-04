// Physics: stairs, rails, deco boxes, DDA ray casts, flow field, hazards and
// pits - with the real World / Player / Monster classes on a small test level.
import { Grid, F, HAZ } from '../src/game/grid.js';
import { Deco } from '../src/game/levelgen/deco.js';
import { World } from '../src/game/world.js';
import { Player } from '../src/game/player.js';
import { Monster } from '../src/game/monster.js';
import { input, press, endFrame } from '../src/engine/input.js';
import { PLACEHOLDER_BASES } from '../src/data/weapons.js';
import { buildHub } from '../src/game/levelgen/hub.js';
import { SpriteBatcher } from '../src/game/spritebatch.js';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('FAIL ' + msg); } };
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

// ------------------------------------------------------------------ pure grid
{
  const g = new Grid(10, 6);
  for (let x = 1; x < 9; x++) for (let z = 1; z < 5; z++) g.open(x, z, 0, 6);
  g.setStair(4, 2, 0, 0.8, 0.8);                       // climbs +x
  check(near(g.floorAtPos(g.idx(4, 2), 4.0, 2.5), 0), 'stair low edge');
  check(near(g.floorAtPos(g.idx(4, 2), 4.5, 2.5), 0.4), 'stair middle');
  check(near(g.floorAtPos(g.idx(4, 2), 5.0, 2.5), 0.8), 'stair top edge');
  // ledge: x >= 6 is 3 m up; reverse BFS from a player on the ledge must not
  // let walkers climb it, a player below must be reachable by dropping down
  for (let x = 6; x < 9; x++) for (let z = 1; z < 5; z++) g.floor[g.idx(x, z)] = 3;
  g.stairDir[g.idx(4, 2)] = 0; g.rise[g.idx(4, 2)] = 0; g.floor[g.idx(4, 2)] = 0;
  const top = g.idx(7, 2), low = g.idx(2, 2);
  const fwd = g.bfs([top]), rev = g.bfs([top], { reverse: true });
  check(fwd[low] >= 0, 'forward bfs: ledge -> floor (drop) reachable');
  check(rev[low] < 0, 'reverse bfs: walker cannot climb a 3 m ledge');
  const fwd2 = g.bfs([low]), rev2 = g.bfs([low], { reverse: true });
  check(fwd2[top] < 0 && rev2[top] >= 0, 'reverse bfs: walker on the ledge may drop to a player below');
  // buffers are reused
  const out = new Int32Array(g.w * g.h), queue = new Int32Array(g.w * g.h);
  const r3 = g.bfs([low], { reverse: true, out, queue });
  check(r3 === out && r3[top] >= 0, 'bfs out buffer reused');
}

// ------------------------------------------------------------------ test level
function buildLevel() {
  const g = new Grid(30, 26);
  g.floor.fill(9);
  for (let z = 1; z < 25; z++) for (let x = 1; x < 29; x++) g.open(x, z, 0, 8);
  // mezzanine at 3 m along the north side
  for (let z = 1; z < 5; z++) for (let x = 1; x < 29; x++) g.floor[g.idx(x, z)] = 3;
  const d = new Deco(g, { railStyle: 'metal' }, { int: (a) => a, pick: (a) => a[0], chance: () => false });
  d.stairs(4, 9, 3, 2, 0, 3);                 // rise 0.6 per cell, climbing -z (x 4..5, z 9..5)
  d.stairs(20, 7, 3, 2, 0, 3, { rise: 1.0 }); // rise 1.0 per cell (x 20..21, z 7..5)
  const mezz = []; for (let z = 1; z < 5; z++) for (let x = 1; x < 29; x++) mezz.push(g.idx(x, z));
  d.railEdges(mezz);
  d.crate(12.5, 15.5, 0, 0.9);
  // spike pit (no rails) and a lava pool
  for (let z = 14; z < 18; z++) for (let x = 16; x < 21; x++) g.open(x, z, -2.5, 8, { haz: HAZ.SPIKES, flags: F.PIT | F.HAZARD });
  for (let z = 19; z < 22; z++) for (let x = 8; x < 11; x++) g.open(x, z, -0.3, 8, { haz: HAZ.LAVA, flags: F.HAZARD });
  // thin solid panel (2 cm) and a rail-only fence for ray tests
  d.collider(24, 0, 12, 24.02, 2, 14);
  d.collider(26, 0, 12, 26.1, 1, 14, { shots: false, obstacle: false });
  return { grid: g, theme: { hazard: null }, depth: 1, doors: [], deco: d.result(), voidY: -30, start: { x: 12.5, z: 12.5, yaw: 0 }, jumpGap: 0, lights: [] };
}

function makeGame(level) {
  const game = {
    time: 0, state: 'playing', inHub: false, noiseT: 0, post: { warp: 0, flash: [0, 0, 0, 0] }, settings: { shake: 1, damageNumbers: false },
    sfx() {}, shake() {}, slowMo() {}, toast() {}, events: { emit() {} }, playerDied() { game.died = true; }, damageNumber() {},
    monsterKilled() {}, gainXP() {}, bossAwake() {}, summonMonster() {}, addShockwave() {}, addSingularity() {}, elemLight: () => [1, 1, 1],
    content: { monsterSprite: () => ({ placeholder: true, handle: {} }), enemyProjectileId: () => null, weaponBases: PLACEHOLDER_BASES.map((b) => ({ ...b, enabled: true })) },
  };
  game.world = new World(game, level);
  game.player = new Player(game, { level: 5, equipment: {} });
  game.player.spawnAt(level.start.x, level.start.z, 0);
  return game;
}

const DT = 1 / 60;
function stepGame(game, secs, each) {
  const n = Math.round(secs / DT);
  for (let k = 0; k < n; k++) {
    // the callback runs before the frame (so input presses take effect) and sees the last frame's state
    if (each && each(k) === false) break;
    game.time += DT;
    game.player.update(DT);
    game.world.updateFlow(DT, game.player.x, game.player.z);
    for (const m of game.world.monsters) m.update(DT);
    endFrame();
  }
}
// walk the player toward yaw for secs
function walk(game, yaw, secs, each) {
  const p = game.player;
  p.yaw = yaw;
  input.move.x = 0; input.move.y = 1;
  stepGame(game, secs, each);
  input.move.y = 0;
  stepGame(game, 0.3);
}
const place = (p, x, z) => { p.x = x; p.z = z; p.y = p.game.world.floorAt(x, z); p.vx = p.vy = p.vz = 0; p.onGround = true; };
const NORTH = -Math.PI / 2, SOUTH = Math.PI / 2, EAST = 0;

const level = buildLevel();
const game = makeGame(level);
const w = game.world, p = game.player, g = level.grid;
p.invuln = 0;

// ------------------------------------------------------------------ ray casts
{
  // wall
  let h = w.raycast(12.5, 1, 10.5, 1, 0, 0, 60);
  check(h && near(h.dist, 16.5) && h.nx === -1 && h.cell === g.idx(29, 10), `ray hits east wall (${h && h.dist})`);
  // crate face, box index reported
  h = w.raycast(12.5, 0.5, 13, 0, 0, 1, 10);
  check(h && near(h.dist, 2.05) && h.nz === -1 && h.box >= 0, `ray hits crate face (${h && h.dist})`);
  check(!w.raycast(12.5, 1.2, 13, 0, 0, 1, 3), 'ray passes over the crate');
  // floor and stair ramp
  h = w.raycast(12.5, 2, 10.5, 0, -1, 0, 10);
  check(h && near(h.dist, 2) && h.ny === 1, 'ray hits floor');
  const sf = g.floorAtPos(g.idx(4, 7), 4.5, 7.3);
  h = w.raycast(4.5, 5, 7.3, 0, -1, 0, 10);
  check(h && near(h.dist, 5 - sf) && h.ny > 0.8 && h.nz > 0, `ray hits stair ramp (${h && h.dist} vs ${5 - sf})`);
  // thin panel is not tunnelled; rails do not block shots or sight
  h = w.raycast(22, 1, 13, 1, 0, 0, 10);
  check(h && near(h.dist, 2) && h.box >= 0, 'thin 2 cm panel blocks rays');
  check(w.los(25, 0.5, 13, 27, 0.5, 13), 'rail fence does not block sight');
  check(!!w.raycast(25, 0.5, 13, 1, 0, 0, 3, true), 'rail fence blocks allBoxes rays');
  // compare the DDA with a fine point march over many random rays
  let bad = 0, rng = 12345;
  const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  for (let k = 0; k < 400; k++) {
    const ox = 1.2 + rnd() * 27.6, oz = 1.2 + rnd() * 23.6;
    const fl = w.floorAt(ox, oz);
    if (fl === null) continue;
    const oy = fl + 0.1 + rnd() * 4;
    if (w.pointSolid(ox, oy, oz)) continue;
    let dx = rnd() - 0.5, dy = (rnd() - 0.5) * 0.6, dz = rnd() - 0.5;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const t = w.castRay(ox, oy, oz, dx, dy, dz, 20);
    let tm = -1;
    for (let s = 0; s < 20; s += 0.004) if (w.pointSolid(ox + dx * s, oy + dy * s, oz + dz * s)) { tm = s; break; }
    if ((t < 0) !== (tm < 0) || (t >= 0 && Math.abs(t - tm) > 0.03)) { bad++; if (bad < 4) console.log('  ray mismatch', { ox, oy, oz, dx, dy, dz, t, tm }); }
  }
  check(bad <= 2, `DDA agrees with point march (${bad} mismatches)`);
}

// ------------------------------------------------------------------ boxes / rails / unstick
{
  check(!w.canOccupy(12.5, 15.0, 0.3, 0, 1.6, 0.55), 'crate blocks walking into it');
  check(w.canOccupy(12.5, 15.0, 0.3, 0.9, 1.6, 0.35), 'crate does not block above its top');
  check(near(w.groundUnder(12.5, 15.5, 0.3, 0.9, 0.55), 0.9, 1e-4) && w.groundHit.box >= 0, 'crate top is standable');
  check(!w.canOccupy(10.5, 4.9, 0.3, 3, 1.6, 0.55), 'guard rail edge blocks at the mezzanine edge');
  check(!w.canOccupy(10.5, 4.9, 0.3, 4.6, 1.6, 0.35), 'guard rail cannot be jumped over (apex 1.4)');
  const a = { x: 12.5, z: 15.1, y: 0, radius: 0.3, height: 1.6 };   // overlapping the crate
  w.moveActor(a, 0, 0, 0.55);
  check(w.canOccupy(a.x, a.z, 0.3, 0, 1.6, 0.55), `unstick pushes an actor out of a crate (${a.x.toFixed(2)},${a.z.toFixed(2)})`);
}

// ------------------------------------------------------------------ player: stairs (rise 0.6 and 1.0)
for (const [sx, label] of [[5, 'rise 0.6'], [21, 'rise 1.0']]) {
  place(p, sx, 12.5);
  let air = 0;
  walk(game, NORTH, 3.5, () => { if (!p.onGround) air++; });
  check(near(p.y, 3, 0.05) && p.z < 5, `player climbs stairs (${label}): y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`);
  check(air < 3, `player stays grounded climbing (${label}): ${air} airborne frames`);
  air = 0;
  walk(game, SOUTH, 3.5, () => { if (!p.onGround) air++; });
  check(near(p.y, 0, 0.05) && p.z > 9.5, `player walks down stairs (${label}): y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`);
  check(air < 3, `player glued to stairs going down (${label}): ${air} airborne frames`);
  // sprint-dash down
  walk(game, NORTH, 3.5);
  air = 0;
  p.yaw = SOUTH; input.move.y = 1; press('dash');
  stepGame(game, 0.4, () => { if (!p.onGround) air++; });
  input.move.y = 0; stepGame(game, 1);
  check(air < 6, `dash down stairs stays mostly grounded (${label}): ${air} airborne frames`);
}

// ------------------------------------------------------------------ player: guard rail, crate
{
  place(p, 10.5, 3);
  let maxZ = 0;
  walk(game, SOUTH, 1.5, (k) => { if (k % 20 === 0) press('jump'); maxZ = Math.max(maxZ, p.z); });
  stepGame(game, 1);
  check(near(p.y, 3, 0.05) && maxZ < 4.75, `guard rail stops the player, even jumping (max z=${maxZ.toFixed(2)} y=${p.y.toFixed(2)})`);
  place(p, 12.5, 13);
  walk(game, SOUTH, 1);
  check(p.z < 15.05 - 0.29 && near(p.y, 0), `crate blocks the player (z=${p.z.toFixed(2)})`);
  // hop up with a gentle forward push
  p.yaw = SOUTH; input.move.y = 0.3; press('jump');
  stepGame(game, 1.2, (k) => !(k > 5 && p.onGround));   // release once landed
  input.move.y = 0; stepGame(game, 0.5);
  check(near(p.y, 0.9, 0.02) && p.z > 15.05 && p.onGround, `player jumps onto the crate (y=${p.y.toFixed(2)} z=${p.z.toFixed(2)})`);
  check(w.groundHit.box >= 0, 'player stands on a box');
  walk(game, SOUTH, 0.8);
  check(near(p.y, 0, 0.02) && p.z > 16, `player steps off the crate (y=${p.y.toFixed(2)} z=${p.z.toFixed(2)})`);
}

// ------------------------------------------------------------------ player: coyote time
{
  // walk off the mezzanine at the stair-free gap? use the pit rim instead: jump just after leaving the edge
  place(p, 14.5, 15.5);
  let left = -1, jumped = false;
  p.yaw = EAST; input.move.y = 1;
  stepGame(game, 1, (k) => {
    if (left < 0 && !p.onGround) left = k;
    if (left >= 0 && k === left + 3 && !jumped) { press('jump'); jumped = true; }
    if (jumped && p.vy > 4) return false;
  });
  input.move.y = 0;
  check(jumped && p.vy > 4, 'coyote jump works a few frames after walking off a ledge');
  stepGame(game, 2);
}

// ------------------------------------------------------------------ player: spike pit rescue, lava
{
  p.invuln = 0; p.hp = p.maxHp;
  place(p, 14.5, 15.5);
  stepGame(game, 0.5);              // remember this spot as safe
  const hp0 = p.hp;
  let lowest = 99;
  const r0 = p.lastRescueT;
  walk(game, EAST, 2.5, () => { lowest = Math.min(lowest, p.y); if (p.lastRescueT !== r0) return false; });
  check(lowest < -2 && p.hp < hp0 && near(p.y, 0, 0.1) && p.x < 16, `spike pit: hurt + rescued (lowest ${lowest.toFixed(2)}, hp ${hp0.toFixed(0)}->${p.hp.toFixed(0)}, at ${p.x.toFixed(2)},${p.y.toFixed(2)})`);
  check(p.invuln > 0, 'rescue grants invulnerability');
  stepGame(game, 1.2);
  p.invuln = 0; p.hp = p.maxHp; p.burnT = 0;
  place(p, 9.5, 20.5);
  stepGame(game, 1.2);
  check(p.hp < p.maxHp * 0.85 && p.burnT > 0 && p.groundSlow < 1, `lava burns and slows (hp ${p.hp.toFixed(0)}/${p.maxHp})`);
  place(p, 9.5, 17.5);
  p.hp = p.maxHp; p.burnT = 0;
  stepGame(game, 1);
  check(p.hp === p.maxHp && p.hazardT === 0, 'no hazard damage off the lava');
}

// ------------------------------------------------------------------ monsters: pathing across levels
function spawnMonster(id, x, z) {
  const m = new Monster(game, { monster: id, x, z, variant: 'normal' }, 1, { alerted: true });
  w.monsters.push(m);
  return m;
}
{
  p.invuln = 1e9;
  // player up on the mezzanine, monster below: must take the stairs
  place(p, 12.5, 2.5);
  w.flow = null;
  const m = spawnMonster('bloodjaw_hound', 12.5, 12.5);
  let maxY = 0, t = 0;
  stepGame(game, 20, () => { t += DT; maxY = Math.max(maxY, m.floorY); if (m.floorY > 2.9 && Math.hypot(m.x - p.x, m.z - p.z) < 2.5) return false; });
  check(m.floorY > 2.9 && Math.hypot(m.x - p.x, m.z - p.z) < 2.5, `monster reaches player on the ledge via stairs (floorY ${m.floorY.toFixed(2)}, dist ${Math.hypot(m.x - p.x, m.z - p.z).toFixed(1)}, ${t.toFixed(1)}s)`);
  // and back down
  place(p, 12.5, 11.5);
  t = 0;
  stepGame(game, 20, () => { t += DT; if (m.floorY < 0.1 && Math.hypot(m.x - p.x, m.z - p.z) < 2.5) return false; });
  check(m.floorY < 0.1 && Math.hypot(m.x - p.x, m.z - p.z) < 2.5, `monster comes back down to the player (floorY ${m.floorY.toFixed(2)}, ${t.toFixed(1)}s)`);
  // a slow, wide monster on the steep (rise 1.0) flight: player at its top
  w.monsters.length = 0;
  place(p, 21, 2.5);
  const big = spawnMonster('butcher_duke', 21, 11);
  t = 0;
  stepGame(game, 25, () => { t += DT; if (big.floorY > 2.9) return false; });
  check(big.floorY > 2.9, `walker climbs the rise-1.0 stairs (floorY ${big.floorY.toFixed(2)}, ${t.toFixed(1)}s)`);
  w.monsters.length = 0;
  // across the lava pool: never steps in while chasing
  place(p, 9.5, 23.5);
  const h = spawnMonster('bloodjaw_hound', 9.5, 17.2);
  let inLava = 0;
  stepGame(game, 15, () => { const i = g.cellAt(h.x, h.z); if (g.flags[i] & F.HAZARD) inLava++; if (Math.hypot(h.x - p.x, h.z - p.z) < 1.5) return false; });
  check(inLava === 0, `chasing monster avoids the lava (${inLava} frames in it)`);
  check(Math.hypot(h.x - p.x, h.z - p.z) < 2, `monster walks around the lava to the player (dist ${Math.hypot(h.x - p.x, h.z - p.z).toFixed(1)})`);
  w.monsters.length = 0;
  // knocked into the spike pit: dies after a while (kill path drops loot / keys)
  const v = spawnMonster('bloodjaw_hound', 18.5, 15.5);
  v.carriesKey = 'red';
  w.pickups = [];
  stepGame(game, 3);
  check(v.dead, 'monster stuck in a deep pit dies');
  const key = w.pickups.find((k) => k.kind === 'key');
  check(key && !(g.flags[g.cellAt(key.x, key.z)] & (F.PIT | F.HAZARD)), 'key from a pit death lands on safe ground');
  w.monsters.length = 0;
}

// ------------------------------------------------------------------ perf sanity (no per-call allocation)
{
  const t0 = performance.now();
  let n = 0;
  for (let k = 0; k < 20000; k++) { if (w.los(2 + (k % 25), 1.5, 6 + (k % 17), 27 - (k % 23), 1.2, 20 - (k % 13))) n++; }
  for (let k = 0; k < 20000; k++) w.canOccupy(2 + (k % 250) / 10, 12.5, 0.3, 0, 1.6, 0.55);
  const ms = performance.now() - t0;
  console.log(`  perf: 20k los + 20k canOccupy in ${ms.toFixed(1)} ms`);
  check(ms < 1500, 'physics queries are fast');
}

// ------------------------------------------------------------------ terminals (hub)
// consoles block movement and shots, wall panels sit flush on their wall with
// a shootable collider fitted to the art, shots spark them, panels are drawn
// on the wall plane with u running to the viewer's right
{
  const H = buildHub(), hg = makeGame(H), hw = hg.world, S = hw.scatter, G = H.grid;
  check(S.terms.length === H.scatter.terminals.length + H.scatter.wallTerminals.length && S.terms.some((t) => t.panel) && S.terms.some((t) => !t.panel), 'hub terminals reach the runtime');
  const frame = (x, y, w, h) => ({ uv: [x / 512, y / 512, (x + w) / 512, (y + h) / 512], pw: w, ph: h, aspect: w / h });
  const handle = { ready: true }, glow = { ready: true };
  const fake = (id, kind, style, px, pxW, tags) => ({ id, kind, style, px, pxW, tags, light: [40, 200, 120], frames: [frame(0, 0, pxW, px)], handle, glow });
  const content = {
    scatter: {
      terminal: [fake('kiosk', 'terminal', 'tech', 141, 76, ['kiosk']), fake('rack', 'terminal', 'tech', 143, 88, ['server']), fake('desk', 'terminal', 'tech', 114, 172, ['desk'])],
      terminal_wall: [fake('panel', 'terminal_wall', 'tech', 106, 132, ['keyboard'])],
      range: { terminal: [87, 155], terminal_wall: [63, 138] },
    },
  };
  S.bind(content);
  const B = hw.box;
  for (const t of S.terms) {
    check(t.obj && t.w > 0.3 && t.h > 0.3, `terminal ${t.k} got art and a size`);
    if (t.panel) {
      const bot = t.cy - t.h / 2 - t.y;
      check(bot >= 0.6 - 1e-6 && t.cy - t.y < 1.9 && t.w <= t.maxW + 1e-6, `wall panel ${t.k} at console height (bottom ${bot.toFixed(2)})`);
      const o = t.ci * 6, j = G.idx((t.cell % G.w) + [1, -1, 0, 0][t.wall], ((t.cell / G.w) | 0) + [0, 0, 1, -1][t.wall]);
      check(!G.type[j], `wall panel ${t.k} hangs on a solid wall`);
      check(near(B[o + 4] - B[o + 1], t.h, 1e-3), `wall panel ${t.k} collider fitted to the art`);
      // a shot straight at the panel hits its collider, a hair off the wall
      const nx = -[1, -1, 0, 0][t.wall], nz = -[0, 0, 1, -1][t.wall];
      const h = hw.raycast(t.px + nx * 1.5, t.cy, t.pz + nz * 1.5, -nx, 0, -nz, 3);
      check(h && h.box === t.ci && h.dist > 1.4 && h.dist < 1.5, `shot at wall panel ${t.k} hits it (${h && h.dist.toFixed(3)})`);
    } else {
      const h = hw.raycast(t.x - [1, -1, 0, 0][t.wall] * 2, t.y + 0.6, t.z - [0, 0, 1, -1][t.wall] * 2, [1, -1, 0, 0][t.wall], 0, [0, 0, 1, -1][t.wall], 3);
      check(h && h.box === t.ci, `shot at console ${t.k} hits its collider`);
      check(G.flags[t.cell] & F.OBSTACLE, `console ${t.k} cell is an obstacle`);
    }
  }
  // hit: sparks + flicker
  const pt = S.terms.find((t) => t.panel), np = hw.particles.length;
  hw.time = 5;
  check(S.hitBox(pt.ci, 10, 'physical') && pt.hitT === 5 && hw.particles.length > np, 'shot terminal sparks and flickers');
  // drawing: panels on the wall plane (billboard 3 / 4), never mirrored
  const sb = new SpriteBatcher();
  sb.begin();
  S.submit(sb, { x: pt.px, z: pt.pz });
  const bt = sb.byHandle.get(handle)[0], d = bt.data, F_ = 25;
  let panels = 0, mirrorOK = true;
  for (let k = 0; k < bt.count; k++) {
    const mode = d[k * F_ + 24];
    if (mode < 3) continue;
    panels++;
    const t = S.terms.find((q) => q.panel && near(q.px, d[k * F_], 1e-4) && near(q.pz, d[k * F_ + 2], 1e-4));
    const flipped = d[k * F_ + 5] > d[k * F_ + 7];
    if (!t || mode !== (t.wall < 2 ? 3 : 4) || flipped !== (t.wall === 1 || t.wall === 2)) mirrorOK = false;
  }
  console.log(`  hub terminals: ${S.terms.length} (${panels} wall panels drawn, ${sb.byHandle.get(glow)?.[1]?.count} glow quads)`);
  check(panels > 0 && mirrorOK, `wall panels drawn on their wall plane, u to the viewer's right (${panels})`);
  check(sb.byHandle.get(glow)?.[1]?.count > 0, 'screens glow (additive emissive pass)');
}

input.move.y = 0;
if (failures) { console.log(`${failures} physics failures`); process.exit(1); }
console.log('physics OK');
