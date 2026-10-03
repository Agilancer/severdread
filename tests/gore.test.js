// Gore system checks (no browser): droplets collide and become decals, decals
// stay on valid surfaces (never on stairs / lava / doors, never hanging over
// ledges), gibs settle, and a mass kill stays inside the frame budget.
import { Grid, F, HAZ } from '../src/game/grid.js';
import { Gore, LensBlood } from '../src/game/gore.js';
import { SpriteBatcher } from '../src/game/spritebatch.js';
import { GORE, goreProfile } from '../src/data/gore.js';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.error('FAIL:', msg); } };

// 24 x 24 room: floor 0, ceiling 3.5; a raised ledge (x 16..19, floor 1.2),
// a lava strip (z = 6), a stair run (x = 12, z 14..16), a door cell, a crate.
const g = new Grid(24, 24);
g.rect(1, 1, 22, 22, (x, z) => g.open(x, z, 0, 3.5, { light: 0.8 }));
g.rect(16, 1, 4, 8, (x, z) => g.open(x, z, 1.2, 3.5, { light: 0.8 }));
for (let x = 2; x < 10; x++) g.open(x, 6, 0, 3.5, { flags: F.HAZARD, haz: HAZ.LAVA });
for (let k = 0; k < 3; k++) g.setStair(12, 14 + k, 2, 0.4 * (k + 1), 0.4);
g.open(5, 20, 0, 3.5, { flags: F.DOOR });
const crate = { x0: 8.2, y0: 0, z0: 10.2, x1: 9.2, y1: 0.9, z1: 11.2, shots: true };
const sounds = [];
const game = {
  settings: { gore: 2, lensBlood: true }, inHub: false, player: { x: 10, y: 0, z: 10 },
  sfx: (n) => sounds.push(n), shake() {}, post: { flash: [0, 0, 0, 0] }, cam: null, renderer: null,
};
game.lens = new LensBlood(game);
const world = {
  game, grid: g, level: { deco: { colliders: [crate] }, voidY: -30 }, doorByCell: new Map([[g.idx(5, 20), { open: 0, floor: 0, ceil: 3.5 }]]),
  los: () => true, flash() {},
};
const gore = new Gore(world);
const def = { category: 'beast' };
const mon = (x, z, o = {}) => ({ x, y: 0, z, height: 1, radius: 0.35, hp: -50, maxHp: 100, def, frozen: 0, deathT: 0, dead: true, ...o });

// --- profiles
for (const [id, p] of Object.entries(GORE)) check(p.drop && p.decal && p.mist && p.lens && p.gibs, 'profile ' + id);
check(goreProfile({ category: 'robot' }) === GORE.robot && goreProfile({ category: 'nope' }) === GORE.beast, 'profile lookup');

// --- one kill next to the wall, the ledge, the lava and the crate
const m1 = mon(14.5, 3.5);
check(gore.kill(m1, { dir: [1, 0] }) === true && m1.gibbed, 'kill gibs a monster');
check(sounds.includes('gib'), 'gib sound');
const m2 = mon(6.5, 7.5); gore.kill(m2, { dir: [0, -1] });
const m3 = mon(9.5, 12.0); gore.kill(m3, { dir: [0, -1] });
const m4 = mon(12.5, 13.2); gore.kill(m4, { dir: [0, 1] });
for (let f = 0; f < 240; f++) gore.update(1 / 60);
check(gore.decalCount > 20, 'decals were made: ' + gore.decalCount);
check(gore.particleCount < 40, 'droplets landed: ' + gore.particleCount);

const EPS = 0.012;
let floorN = 0, wallN = 0, boxN = 0;
for (let k = 0; k < gore.dN; k++) {
  const x = gore.dx[k], y = gore.dy[k], z = gore.dz[k], mode = gore.dmode[k];
  const half = Math.min(1, Math.abs(gore.dw[k])) / 2;
  if (mode === 2) {
    const i = g.cellAt(x, z);
    const onBox = x >= crate.x0 && x <= crate.x1 && z >= crate.z0 && z <= crate.z1 && Math.abs(y - crate.y1 - EPS) < 1e-4;
    if (onBox) { boxN++; continue; }
    floorN++;
    check(i >= 0 && g.type[i] === 1, 'floor decal on open cell');
    check(!(g.flags[i] & (F.STAIR | F.HAZARD | F.DOOR)), `floor decal on forbidden cell (${x.toFixed(2)}, ${z.toFixed(2)}) flags ${g.flags[i]}`);
    check(Math.abs(y - (g.floor[i] + EPS)) < 1e-4, 'floor decal height');
    // never hangs over a ledge: every cell under its square has the same floor
    for (const [ox, oz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      const j = g.cellAt(x + ox * 0.999, z + oz * 0.999);
      check(j >= 0 && g.type[j] === 1 && Math.abs(g.floor[j] - g.floor[i]) < 0.02 && !(g.flags[j] & (F.HAZARD | F.STAIR)), `floor decal overhang at (${x.toFixed(2)}, ${z.toFixed(2)}) size ${(half * 2).toFixed(2)}`);
    }
  } else if (mode === 3 || mode === 4) {
    const onCrate = mode === 3 ? (Math.abs(x - crate.x0 + EPS) < 1e-4 || Math.abs(x - crate.x1 - EPS) < 1e-4) : (Math.abs(z - crate.z0 + EPS) < 1e-4 || Math.abs(z - crate.z1 - EPS) < 1e-4);
    if (onCrate && y <= crate.y1) { boxN++; continue; }
    wallN++;
    const plane = mode === 3 ? x : z;
    const fr = plane - Math.floor(plane + 0.5);
    check(Math.abs(Math.abs(fr) - EPS) < 1e-4, 'wall decal sits just off a cell boundary');
    const hh = gore.dh[k] / 2;
    check(y - hh >= -1e-4 && y + hh <= 3.5 + 1e-4, 'wall decal between floor and ceiling');
  } else check(false, 'bad decal mode ' + mode);
}
check(floorN > 5 && wallN > 2, `floor ${floorN} / wall ${wallN} decals`);
console.log(`decals: ${floorN} floor, ${wallN} wall, ${boxN} on the crate; gibs ${gore.gibCount}`);

// gibs come to rest on the floor (or the crate / ledge) and later sink away
for (let f = 0; f < 60 * 14; f++) gore.update(1 / 60);
check(gore.gibCount === 0, 'gibs removed after resting: ' + gore.gibCount);

// --- gore off: no burst, caller falls back
game.settings.gore = 0;
check(gore.kill(mon(10, 10), {}) === false, 'gore off returns false');
game.settings.gore = 2;

// --- mass kill (the playthrough kills every monster at once): budget per frame
const b = new SpriteBatcher();
const content = { gore: { ready: true, tex: 1 }, fx: { ready: true, tex: 2 } };
const cam = { x: 10, y: 1.4, z: 10, yaw: 0, pitch: 0 };
for (let k = 0; k < 60; k++) gore.kill(mon(11 + (k % 5) * 0.3, 10 + Math.floor(k / 5) * 0.2), { dir: [1, 0], element: k % 3 ? 'physical' : 'fire' });
let worst = 0, total = 0, maxInst = 0, worstF = -1;
const frames = 120;
for (let f = 0; f < frames; f++) {
  const t0 = performance.now();
  gore.update(1 / 60);
  b.begin();
  gore.submit(b, content, cam);
  const dt = performance.now() - t0;
  if (dt > worst) { worst = dt; worstF = f; } total += dt;
  maxInst = Math.max(maxInst, b.list.reduce((a, x) => a + x.count, 0));
}
check(gore.killQ.length === 0, 'kill queue drained');
check(gore.particleCount <= 900 && gore.decalCount <= 384, 'caps respected');
console.log(`mass kill x60: avg ${(total / frames).toFixed(3)} ms, worst ${worst.toFixed(3)} ms (frame ${worstF}) per frame (update+submit), peak ${maxInst} sprite instances`);
check(maxInst < 3000, 'instance budget');

// --- lens blood: splats drip and run off the bottom of the screen
const lens = game.lens;
lens.burst(0.5, 0.4, 6, [0.5, 0, 0]);
check(lens.splats.filter((s) => s.on).length === 6, 'lens splats added');
for (let f = 0; f < 60 * 3; f++) lens.update(1 / 60);
check(lens.drips.some((d) => d.on && d.head > d.y0), 'drips slide down');
for (let f = 0; f < 60 * 30; f++) lens.update(1 / 60);
check(lens.active === 0, 'lens clears itself');

if (fails) { console.error(`gore: ${fails} failure(s)`); process.exit(1); }
console.log('gore OK');
