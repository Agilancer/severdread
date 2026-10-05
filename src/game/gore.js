// Gore: blood particles, gibs and decals (owned by World, rebuilt per level)
// and LensBlood (owned by Game): blood splattered on the camera lens that
// holds, then slides down and off the bottom of the screen.
//
// Everything here is allocation-free per frame: particles and decals live in
// typed-array pools, gibs in a fixed object pool, and submission goes through
// SpriteBatcher.addRaw. Blood is LIT (sector light + dynamic lights) so it
// never glows in the dark; only sparks and embers are additive/fullbright.
//
//   world.gore.hit(m, o)        hit spray (merged per monster per frame)
//   world.gore.kill(m, o)       death burst; returns false when gore is off
//   world.gore.drip(m, n)       bleed / poison drips
//   world.gore.scorch(...)      explosion scorch marks
//   world.gore.update(dt) / submit(batcher, content, cam)
import { F, OPEN, HAZ, DIR_X, DIR_Z } from './grid.js';
import { MODE } from './spritebatch.js';
import { fx } from '../core/rng.js';
import { goreProfile, GC, GIB_CELLS, GIB_FINAL, GORE_COLS, GORE_ROWS } from '../data/gore.js';

const TOUCH = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window));
const P_CAP = TOUCH ? 600 : 900;
const GIB_CAP = TOUCH ? 32 : 48;
const DECAL_CAP = TOUCH ? 256 : 384;
const MAX_BURSTS_PER_FRAME = 2;

// particle kinds
const DROP = 0, MIST = 1, SPARK = 2, EMBER = 3, POP = 4;
const FL_DECAL = 1;
// sprite billboard modes (spriteVS iExtra.w)
const BB_SPH = 1, BB_FLOOR = 2, BB_WALLX = 3, BB_WALLZ = 4;
const EPS = 0.012;          // decal offset from its surface
const TAU = Math.PI * 2;

// UV table for the gore atlas (inset half a texel)
const UV = new Float32Array(GORE_COLS * GORE_ROWS * 4);
for (let c = 0; c < GORE_COLS * GORE_ROWS; c++) {
  const col = c % GORE_COLS, row = Math.floor(c / GORE_COLS), W = GORE_COLS * 32, H = GORE_ROWS * 32;
  UV[c * 4] = (col * 32 + 0.5) / W; UV[c * 4 + 1] = (row * 32 + 0.5) / H;
  UV[c * 4 + 2] = ((col + 1) * 32 - 0.5) / W; UV[c * 4 + 3] = ((row + 1) * 32 - 0.5) / H;
}
const FXUV = [[0, 0, 0.25, 1], [0.25, 0, 0.5, 1], [0.5, 0, 0.75, 1], [0.75, 0, 1, 1]];

const ICE = [0.62, 0.86, 1.05], SPARK_COL = [1, 0.78, 0.38], EMBER_COL = [1, 0.48, 0.14], SMOKE = [0.24, 0.23, 0.23], SCORCH = [0.06, 0.05, 0.045];
const BONE_SET = new Set(GIB_CELLS.bone), METAL_SET = new Set(GIB_CELLS.metal);

function pickWeighted(list) {
  let t = 0;
  for (const e of list) t += e[1];
  let r = fx.next() * t;
  for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
  return list[list.length - 1][0];
}

export class Gore {
  constructor(world) {
    this.world = world;
    this.game = world.game;
    this.grid = world.grid;
    this.time = 0;
    // ---- particles (structure of arrays, dense with swap-remove)
    const n = P_CAP;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n); this.size = new Float32Array(n);
    this.grow = new Float32Array(n); this.grav = new Float32Array(n);
    this.cr = new Float32Array(n); this.cg = new Float32Array(n); this.cb = new Float32Array(n); this.ca = new Float32Array(n);
    this.kind = new Uint8Array(n); this.cell = new Uint8Array(n); this.flags = new Uint8Array(n);
    this.pN = 0; this.pOver = 0;
    // ---- gibs (fixed object pool)
    this.gibs = [];
    for (let k = 0; k < GIB_CAP; k++) this.gibs.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, size: 0.2, cell: 8, r: 1, g: 1, b: 1, hue: 0, sat: 1, br: 0, bg: 0, bb: 0, age: 0, rest: 8, settled: false, landed: false, walled: false, bloody: true, trailT: 0, sink: 0 });
    this.gibHead = 0;
    // ---- decals (ring buffer, oldest overwritten and faded out first)
    const d = DECAL_CAP;
    this.dx = new Float32Array(d); this.dy = new Float32Array(d); this.dz = new Float32Array(d);
    this.dw = new Float32Array(d); this.dh = new Float32Array(d); this.drot = new Float32Array(d);
    this.dr = new Float32Array(d); this.dg = new Float32Array(d); this.db = new Float32Array(d); this.da = new Float32Array(d);
    this.dlight = new Float32Array(d); this.dborn = new Float32Array(d); this.dgrow = new Float32Array(d);
    this.dmode = new Uint8Array(d); this.dcell = new Uint8Array(d);
    this.dHead = 0; this.dN = 0;
    // ---- queues
    this.hitQ = [];
    this.killQ = [];
    this.bossSeq = [];
    this.burstsThisFrame = 0;
    this.ray = { a: -1, d: 0, t: 0, hx: 0, hz: 0 };
    // ---- per-cell deco collider index (solid AABBs)
    const g = this.grid;
    this.colFlag = new Uint8Array(g.w * g.h);
    this.colList = new Map();
    for (const c0 of world.level?.deco?.colliders || []) {
      if (c0.shots === false) continue;      // rails / fences / grates let blood through
      const c = { x0: Math.min(c0.x0, c0.x1), y0: Math.min(c0.y0, c0.y1), z0: Math.min(c0.z0, c0.z1), x1: Math.max(c0.x0, c0.x1), y1: Math.max(c0.y0, c0.y1), z1: Math.max(c0.z0, c0.z1) };
      for (let z = Math.floor(c.z0); z <= Math.floor(c.z1 - 1e-6); z++) for (let x = Math.floor(c.x0); x <= Math.floor(c.x1 - 1e-6); x++) {
        if (!g.in(x, z)) continue;
        const i = z * g.w + x;
        this.colFlag[i] = 1;
        let l = this.colList.get(i);
        if (!l) { l = []; this.colList.set(i, l); }
        l.push(c);
      }
    }
    this.voidY = world.level?.voidY ?? -30;
    this.stats = { kills: 0, decals: 0, updateMs: 0, submitMs: 0 };
  }

  get lvl() { const s = this.game?.settings; return s && s.gore !== undefined ? s.gore : 2; }
  get on() { return this.lvl > 0 && !this.game?.inHub; }

  // ================================================================ spawning API
  // Hit spray: merged per monster and flushed once per frame (shotgun pellets
  // become one bigger spray), with a short per-monster cooldown.
  hit(m, o) {
    if (!this.on) return;
    if (!m._gq) { m._gq = true; m._gn = 0; m._gc = false; m._ghp = null; this.hitQ.push(m); }
    m._gn++;
    if (o.crit) m._gc = true;
    if (o.hitPos && !m._ghp) m._ghp = o.hitPos;
    if (o.dir) { m._gdx = o.dir[0]; m._gdz = o.dir[1]; } else if (m._gn === 1) { m._gdx = NaN; m._gdz = NaN; }
  }

  // Death burst. Non-bosses explode immediately (or next frames when the
  // per-frame budget is spent); bosses dissolve with red edges through three
  // escalating bursts, the last one a huge explosion.
  kill(m, o = {}) {
    if (!this.on) return false;
    const P = goreProfile(m.def);
    const over = 1 + Math.min(0.5, Math.max(0, -m.hp) / Math.max(1, m.maxHp));
    const s = {
      x: m.x, y: m.y, z: m.z, h: m.height, r: m.radius, prof: P, cat: m.def.category,
      dx: o.dir ? o.dir[0] : 0, dz: o.dir ? o.dir[1] : 0, el: o.element || 'physical', frozen: m.frozen > 0 || o.element === 'ice',
      explosive: !!o.explosive, melee: !!o.melee, boss: !!m.boss, over, scale: 1, stage: 2,
    };
    this.stats.kills++;
    if (m.boss) {
      m.goreDissolve = true;
      s.scale = 0.55; s.stage = 0;
      this._burst(s);
      this.bossSeq.push({ m, s, stage: 0 });
      return true;
    }
    m.gibbed = true;
    m.deathT = Math.max(m.deathT, 1.2);
    if (this.burstsThisFrame < MAX_BURSTS_PER_FRAME && !this.killQ.length) { this.burstsThisFrame++; this._burst(s); }
    else this.killQ.push(s);
    return true;
  }

  // a few drops falling off a bleeding / poisoned monster
  drip(m, n = 1) {
    if (!this.on || m.gibbed) return;
    const P = goreProfile(m.def), c = P.drop;
    for (let k = 0; k < n; k++) {
      const a = fx.float(0, TAU), r = m.radius * fx.float(0.2, 0.7);
      this._p(DROP, GC.DROP, m.x + Math.cos(a) * r, m.y + m.height * fx.float(0.3, 0.75), m.z + Math.sin(a) * r,
        Math.cos(a) * 0.4, fx.float(-0.5, 0.6), Math.sin(a) * 0.4, 3, fx.float(0.03, 0.05), c[0], c[1], c[2], 1, 16, 0, fx.chance(0.75) ? FL_DECAL : 0);
    }
  }

  // explosion scorch: floor mark + nearby wall marks
  scorch(x, y, z, radius, small) {
    if (!this.game || this.game.inHub) return;
    const g = this.grid, j = g.cellAt(x, z);
    if (j < 0 || g.type[j] !== OPEN) return;
    const f = g.floor[j];
    const size = Math.min(2, Math.max(0.5, radius * (small ? 0.8 : 1.15)));
    if (y - f < radius * 0.8 + 0.35) this._floorDecal(j, x, f, z, size, GC.SCORCH, fx.float(0, TAU), SCORCH[0], SCORCH[1], SCORCH[2], 0.9, 0);
    if (small) return;
    for (let k = 0; k < 4; k++) {
      const a = k * (TAU / 4) + fx.float(-0.4, 0.4);
      const t = this._cast(x, y, z, Math.cos(a), Math.sin(a), radius * 0.75);
      if (t < 0) continue;
      const R = this.ray, s = size * (1 - t / (radius * 0.75)) * 0.9;
      if (s > 0.3) this._faceDecal(R.a, R.d, R.d < 2 ? R.hz : R.hx, y, s, s, GC.SCORCH, fx.float(0, TAU), SCORCH[0], SCORCH[1], SCORCH[2], 0.85);
    }
  }

  // ================================================================ update
  update(dt) {
    const t0 = performance.now();
    this.time += dt;
    // queued kill bursts (mass kills spread over a few frames, halved when the queue is long)
    this.burstsThisFrame = 0;
    while (this.killQ.length && this.burstsThisFrame < MAX_BURSTS_PER_FRAME) {
      const s = this.killQ.shift();
      if (this.killQ.length > 3) s.scale *= 0.55;
      this.burstsThisFrame++;
      this._burst(s);
    }
    // boss death sequences
    for (let k = this.bossSeq.length - 1; k >= 0; k--) {
      const b = this.bossSeq[k], m = b.m;
      const t = m.deathT;
      if (b.stage === 0 && t >= 0.4) {
        b.stage = 1;
        this._burst({ ...b.s, x: m.x, y: m.y, z: m.z, scale: 0.9, stage: 1 });
      } else if (b.stage === 1 && t >= 0.86) {
        b.stage = 2;
        m.gibbed = true;
        this._burst({ ...b.s, x: m.x, y: m.y, z: m.z, scale: 2.2, stage: 2 });
        this.world.flash(m.x, m.y + m.height * 0.5, m.z, [1, 0.25, 0.15], 9, 0.45, 2.2);
        this.game.shake(0.45);
        this.bossSeq.splice(k, 1);
      }
    }
    this._flushHits();
    this._updateParticles(dt);
    this._updateGibs(dt);
    this.stats.updateMs = performance.now() - t0;
  }

  _flushHits() {
    const q = this.hitQ;
    for (let k = q.length - 1; k >= 0; k--) {
      const m = q[k];
      let done = false;
      if (m.gibbed || (m.dead && !m.boss)) done = true;
      else if (this.time - (m._gt ?? -9) >= 0.06) { this._spray(m); m._gt = this.time; done = true; }
      if (done) { m._gq = false; q[k] = q[q.length - 1]; q.pop(); }
    }
  }

  // ================================================================ bursts
  _burst(s) {
    const P = s.prof, q = (this.lvl >= 2 ? 1 : 0.5) * s.scale;
    const hs = Math.max(0.8, s.h);              // size factor for big monsters
    const cx = s.x, cy = s.y + s.h * 0.55, cz = s.z;
    const bx = s.dx * 3, bz = s.dz * 3;
    const sp = (s.explosive ? 1.5 : 1) * (s.boss && s.stage === 2 ? 1.35 : 1);
    let drops = Math.round(fx.int(40, 60) * q * s.over);
    let mist = Math.round(10 * Math.min(q, 1.6));
    let gibs = Math.round(fx.int(P.metalGibs ? 6 : 8, P.metalGibs ? 10 : 12) * q * (s.explosive ? 1.3 : 1));
    if (s.boss && s.stage < 2) gibs = Math.round(gibs * 0.4);
    if (s.frozen) drops = Math.round(drops / 3);
    if (s.el === 'plasma' || s.el === 'void') { mist = Math.round(mist * 1.8); drops = Math.round(drops * 0.6); }
    const fire = s.el === 'fire';
    const dc = P.drop, mc = P.mist;
    const decalP = this.lvl >= 2 ? 0.16 : 0.1;
    // 1. pop: an expanding splash at the centre
    this._p(POP, GC.SPLAT_A, cx, cy, cz, 0, 0, 0, 0.22, 0.4 * hs, dc[0], dc[1], dc[2], 0.95, 0, 16, 0);
    // 2. mist cloud
    for (let k = 0; k < mist; k++) {
      const a = fx.float(0, TAU), r = s.r * fx.float(0, 0.8), v = fx.float(0.4, 2.2);
      this._p(MIST, GC.MIST, cx + Math.cos(a) * r, cy + fx.float(-0.35, 0.35) * hs, cz + Math.sin(a) * r,
        Math.cos(a) * v + bx * 0.25, fx.float(-0.2, 1.4), Math.sin(a) * v + bz * 0.25,
        fx.float(0.6, 1.0), fx.float(0.35, 0.65) * hs, mc[0], mc[1], mc[2], 0.7, 0.4, 1.3, 0);
    }
    // 3. droplets
    for (let k = 0; k < drops; k++) {
      const a = fx.float(0, TAU), v = fx.float(3, 9) * sp, r = s.r * 0.6;
      const x = cx + Math.cos(a) * r, y = s.y + s.h * fx.float(0.3, 0.9), z = cz + Math.sin(a) * r;
      const vx = Math.cos(a) * v + bx, vy = fx.float(2, 5) * sp + fx.float(-1, 1), vz = Math.sin(a) * v + bz;
      if (fire && fx.chance(0.3)) {
        this._p(EMBER, 0, x, y, z, vx * 0.5, vy * 0.6, vz * 0.5, fx.float(0.5, 1.0), fx.float(0.05, 0.09), EMBER_COL[0], EMBER_COL[1], EMBER_COL[2], 1, 3, 0, 0);
      } else {
        const c = s.frozen && fx.chance(0.5) ? ICE : dc;
        this._p(DROP, GC.DROP, x, y, z, vx, vy, vz, 3, fx.float(0.04, 0.1), c[0], c[1], c[2], 1, 16, 0, fx.chance(decalP) ? FL_DECAL : 0);
      }
    }
    // 4. gibs
    for (let k = 0; k < gibs; k++) {
      let set = s.frozen && fx.chance(0.6) ? 'crystal' : pickWeighted(P.gibs);
      const cells = GIB_CELLS[set];
      const cell = cells[fx.int(0, cells.length - 1)];
      const a = fx.float(0, TAU), v = fx.float(2, 6) * sp;
      const metal = METAL_SET.has(cell), bone = BONE_SET.has(cell), crystal = set === 'crystal';
      let tr = 1, tg = 1, tb = 1, hue = 0, sat = 1;
      if (crystal) { const t = s.frozen ? ICE : (P.crystalTint || ICE); tr = t[0]; tg = t[1]; tb = t[2]; }
      else if (!metal) {
        const t = P.gibTint || [1, 1, 1]; tr = t[0]; tg = t[1]; tb = t[2];
        if (!bone) hue = P.gibHue || 0;
        sat = P.gibSat ?? 1;
      }
      if (fire && !crystal) { tr *= 0.5; tg *= 0.45; tb *= 0.45; }
      const size = (cell === GC.FEMUR || cell === GC.RIB ? fx.float(0.3, 0.42) : cell === GC.EYE ? 0.16 : metal ? fx.float(0.2, 0.3) : fx.float(0.22, 0.36)) * Math.min(1.5, hs) * (s.boss && s.stage === 2 ? 1.3 : 1);
      this._gib(cx + fx.float(-s.r, s.r) * 0.5, cy + fx.float(-0.3, 0.3) * hs, cz + fx.float(-s.r, s.r) * 0.5,
        Math.cos(a) * v + bx * 0.4, fx.float(3, 7) * sp, Math.sin(a) * v + bz * 0.4, cell, size, tr, tg, tb, hue, sat, !metal && !crystal, dc);
    }
    // 5. pool at the feet (or on the floor below a flyer)
    const g = this.grid, fj = g.cellAt(cx, cz);
    if (fj >= 0 && g.type[fj] === OPEN && s.y - g.floor[fj] < 3) {
      const ps = Math.min(2, 2.4 * s.r * Math.min(1.5, Math.max(1, s.scale)));
      this._floorDecal(fj, cx, g.floor[fj], cz, ps, GC.POOL, fx.float(0, TAU), P.decal[0], P.decal[1], P.decal[2], 0.95, 1.6);
    }
    // 6. splatter rays: walls get dripping runs, open floor gets directional sprays
    const rays = Math.round((this.lvl >= 2 ? 6 : 3) * (s.boss && s.stage === 2 ? 2 : 1));
    const reach = s.boss ? 4.5 : 3;
    const dirA = (s.dx || s.dz) ? Math.atan2(s.dz, s.dx) : fx.float(0, TAU);
    const a0 = fx.float(0, TAU);
    for (let k = 0; k < rays; k++) {
      const a = k < 2 && (s.dx || s.dz) ? dirA + fx.float(-0.5, 0.5) : a0 + (k / rays) * TAU + fx.float(-0.4, 0.4);
      const ca = Math.cos(a), sa = Math.sin(a);
      const t = this._cast(cx, cy, cz, ca, sa, reach);
      const R = this.ray;
      if (t >= 0) {
        const w = fx.float(0.5, 0.9) * (1 - t / (reach * 1.6));
        this._faceDecal(R.a, R.d, R.d < 2 ? R.hz : R.hx, cy + fx.float(-0.4, 0.4), w * (fx.chance(0.5) ? 1 : -1), w * 1.3, GC.WALL_RUN, 0, P.decal[0], P.decal[1], P.decal[2], 0.95);
      } else {
        const L = fx.float(1.1, reach * 0.85), ex = cx + ca * L, ez = cz + sa * L;
        const ej = g.cellAt(ex, ez);
        if (ej >= 0 && g.type[ej] === OPEN && Math.abs(g.floor[ej] - g.floor[fj >= 0 ? fj : ej]) < 0.6) {
          this._floorDecal(ej, ex, g.floor[ej], ez, fx.float(0.45, 0.8), fx.chance(0.6) ? GC.SPLAT_B : GC.SPLAT_A, a, P.decal[0], P.decal[1], P.decal[2], 0.92, 0);
        }
      }
    }
    // 7. category extras
    const ex = Math.round((P.sparks || 0) * Math.min(q, 1.5));
    for (let k = 0; k < ex; k++) {
      const a = fx.float(0, TAU), e = fx.float(-0.2, 1.1), v = fx.float(4, 11);
      this._p(SPARK, 3, cx, cy, cz, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 1, Math.sin(a) * Math.cos(e) * v, fx.float(0.3, 0.7), fx.float(0.07, 0.12), SPARK_COL[0], SPARK_COL[1], SPARK_COL[2], 1, 9, 0, 0);
    }
    for (let k = 0; k < Math.round((P.embers || 0) * Math.min(q, 1.5)); k++) {
      const a = fx.float(0, TAU), v = fx.float(1, 4);
      this._p(EMBER, 0, cx, cy, cz, Math.cos(a) * v, fx.float(1, 4), Math.sin(a) * v, fx.float(0.6, 1.2), fx.float(0.05, 0.1), EMBER_COL[0], EMBER_COL[1], EMBER_COL[2], 1, -0.6, 0, 0);
    }
    if (P.dust) for (let k = 0; k < Math.round(P.dust * Math.min(q, 1.5)); k++) {
      const c = P.dustColor;
      this._p(MIST, GC.MIST, cx + fx.float(-0.3, 0.3), s.y + fx.float(0.1, 0.8) * hs, cz + fx.float(-0.3, 0.3), fx.float(-1, 1), fx.float(0, 0.8), fx.float(-1, 1), fx.float(1.2, 1.8), fx.float(0.4, 0.6) * hs, c[0], c[1], c[2], 0.5, -0.2, 1.5, 0);
    }
    if (P.smoke) for (let k = 0; k < Math.round(P.smoke * Math.min(q, 1.5)); k++) {
      this._p(MIST, GC.MIST, cx + fx.float(-0.3, 0.3), cy, cz + fx.float(-0.3, 0.3), fx.float(-0.5, 0.5), fx.float(0.5, 1.2), fx.float(-0.5, 0.5), fx.float(1.4, 2.0), fx.float(0.4, 0.6) * hs, SMOKE[0], SMOKE[1], SMOKE[2], 0.6, -1.5, 2, 0);
    }
    const p = this.game.player;
    const dist = p ? Math.hypot(cx - p.x, cz - p.z) : 10;
    this.game.sfx('gib', { dist, pitch: s.boss ? 0.65 : fx.float(0.85, 1.15), volume: s.stage === 2 && s.boss ? 1.4 : 1 });
    this._lensFromBurst(s, cx, cy, cz);
  }

  _spray(m) {
    const P = goreProfile(m.def), q = this.lvl >= 2 ? 1 : 0.5;
    const n = m._gn || 1, crit = m._gc;
    let ox, oy, oz;
    const hp = m._ghp;
    if (hp) { ox = hp[0]; oy = Math.min(m.y + m.height * 0.95, Math.max(m.y + 0.1, hp[1])); oz = hp[2]; }
    else { ox = m.x; oy = m.y + m.height * 0.6; oz = m.z; }
    let dx = m._gdx, dz = m._gdz;
    if (!(dx === dx) || (!dx && !dz)) { const a = fx.float(0, TAU); dx = Math.cos(a); dz = Math.sin(a); }
    const base = Math.atan2(dz, dx);
    const c = P.drop;
    let count = Math.min(18, Math.round((crit ? 12 : 6) * Math.sqrt(n) * q));
    if (P.metalHit) {
      const ns = Math.round(6 * q);
      for (let k = 0; k < ns; k++) {
        const a = base + Math.PI + fx.float(-1.3, 1.3), e = fx.float(-0.2, 0.9), v = fx.float(3, 8);
        this._p(SPARK, 3, ox, oy, oz, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v, Math.sin(a) * Math.cos(e) * v, fx.float(0.15, 0.4), fx.float(0.06, 0.1), SPARK_COL[0], SPARK_COL[1], SPARK_COL[2], 1, 9, 0, 0);
      }
      count = Math.min(count, 3 + n);
    }
    // exit spray in a cone along the shot direction
    for (let k = 0; k < count; k++) {
      const a = base + fx.gauss() * 0.32, v = fx.float(2, 6);
      this._p(DROP, GC.DROP, ox, oy, oz, Math.cos(a) * v, fx.float(-0.5, 2.2), Math.sin(a) * v, 3, fx.float(0.03, 0.075), c[0], c[1], c[2], 1, 16, 0, fx.chance(0.2) ? FL_DECAL : 0);
    }
    // a little back-spray toward the shooter
    for (let k = 0; k < 2; k++) {
      const a = base + Math.PI + fx.float(-0.7, 0.7), v = fx.float(1, 3);
      this._p(DROP, GC.DROP, ox, oy, oz, Math.cos(a) * v, fx.float(0, 1.5), Math.sin(a) * v, 3, fx.float(0.03, 0.06), c[0], c[1], c[2], 1, 16, 0, 0);
    }
    const mc = P.mist;
    this._p(MIST, GC.MIST, ox, oy, oz, dx * 0.8, 0.2, dz * 0.8, 0.45, 0.22 * (crit ? 1.4 : 1), mc[0], mc[1], mc[2], 0.5, 0.3, 1.6, 0);
    // exit wound on the wall behind
    if (fx.chance(0.35 * q * Math.min(2, Math.sqrt(n)))) {
      const t = this._cast(ox, oy, oz, dx, dz, 2.5);
      if (t >= 0) {
        const R = this.ray, w = fx.float(0.25, 0.45);
        const runs = fx.chance(0.5);
        this._faceDecal(R.a, R.d, R.d < 2 ? R.hz : R.hx, oy + fx.float(-0.1, 0.1), runs ? w : w * 1.2, runs ? w * 1.3 : w * 1.2, runs ? GC.WALL_RUN : GC.SPLAT_B, runs ? 0 : base + fx.float(-0.4, 0.4), P.decal[0], P.decal[1], P.decal[2], 0.95);
      }
    }
    m._gn = 0; m._gc = false; m._ghp = null;
  }

  _lensFromBurst(s, cx, cy, cz) {
    const lens = this.game.lens, cam = this.game.cam;
    if (!lens || !lens.enabled || !cam) return;
    const dx = cx - cam.x, dy = cy - cam.y, dz = cz - cam.z;
    const d = Math.hypot(dx, dy, dz) || 0.01;
    let n = 0;
    if (s.boss && s.stage === 2 && d < 10) n = 8;
    else if (s.boss) n = d < 5 ? 2 : 0;
    else if (s.melee && d < 3.5) n = fx.int(3, 6);
    else if (s.explosive && d < 6) n = fx.int(2, 5);
    else if (d < 4) n = Math.round(1 + 5 * (1 - d / 4));
    if (!n) return;
    const cp = Math.cos(cam.pitch);
    const facing = (Math.cos(cam.yaw) * cp * dx + Math.sin(cam.pitch) * dy + Math.sin(cam.yaw) * cp * dz) / d;
    if (facing < 0.35 && !(s.melee && d < 2.5)) return;
    if (!this.world.los(cam.x, cam.y, cam.z, cx, cy, cz)) return;
    const pr = this.game.renderer?.project(cx, cy, cz);
    const sx = pr ? Math.min(0.9, Math.max(0.1, pr.x)) : 0.5, sy = pr ? Math.min(0.85, Math.max(0.1, pr.y)) : 0.45;
    lens.burst(sx, sy, n, s.prof.lens, s.boss ? 0.35 : 0.25);
  }

  // ================================================================ particles
  _p(kind, cell, x, y, z, vx, vy, vz, life, size, r, g, b, a, grav, grow, flags) {
    let i;
    if (this.pN < P_CAP) i = this.pN++;
    else { i = this.pOver; this.pOver = (this.pOver + 1) % P_CAP; }
    this.kind[i] = kind; this.cell[i] = cell; this.flags[i] = flags;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.ca[i] = a;
    this.grav[i] = grav; this.grow[i] = grow;
    return i;
  }

  _removeP(i) {
    const j = --this.pN;
    if (i === j) return;
    this.kind[i] = this.kind[j]; this.cell[i] = this.cell[j]; this.flags[i] = this.flags[j];
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j];
    this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j]; this.ca[i] = this.ca[j];
    this.grav[i] = this.grav[j]; this.grow[i] = this.grow[j];
  }

  _updateParticles(dt) {
    const g = this.grid, cam = this.game.cam, lens = this.game.lens;
    const lensOn = !!(cam && lens && lens.enabled);
    let i = 0;
    while (i < this.pN) {
      const age = (this.age[i] += dt);
      if (age >= this.life[i]) { this._removeP(i); continue; }
      const k = this.kind[i];
      if (k === DROP) {
        if (this._stepDrop(i, dt, lensOn, cam, lens)) { this._removeP(i); continue; }
      } else if (k !== POP) {
        const drag = k === MIST ? 3 : k === EMBER ? 1.5 : 0.5;
        const f = Math.max(0, 1 - drag * dt);
        this.vx[i] *= f; this.vz[i] *= f;
        if (k === MIST) this.vy[i] *= f;
        this.vy[i] -= this.grav[i] * dt;
        const nx = this.px[i] + this.vx[i] * dt, ny = this.py[i] + this.vy[i] * dt, nz = this.pz[i] + this.vz[i] * dt;
        if (k === SPARK) {
          // sparks bounce off the floor and die in walls
          const c = g.cellAt(nx, nz);
          if (c < 0 || g.type[c] !== OPEN) { this._removeP(i); continue; }
          const fl = g.floorAtPos(c, nx, nz);
          if (ny < fl) { this.vy[i] = Math.abs(this.vy[i]) * 0.35; this.vx[i] *= 0.6; this.vz[i] *= 0.6; this.px[i] = nx; this.pz[i] = nz; this.py[i] = fl + 0.01; i++; continue; }
        }
        this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
      }
      i++;
    }
  }

  // Returns true when the droplet is consumed (hit something / left the map).
  _stepDrop(i, dt, lensOn, cam, lens) {
    const g = this.grid;
    let vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
    vy -= 16 * dt;
    const f = 1 - 0.3 * dt;
    vx *= f; vz *= f;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    const x = this.px[i], y = this.py[i], z = this.pz[i];
    const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
    // flew into the camera: becomes a lens splat
    if (lensOn) {
      const ex = nx - cam.x, ey = ny - cam.y, ez = nz - cam.z;
      if (ex * ex + ey * ey + ez * ez < 0.16) { lens.fromWorld(nx, ny, nz, this.cr[i], this.cg[i], this.cb[i], this.size[i]); return true; }
    }
    if (ny < this.voidY) return true;
    const ox = Math.floor(x), oz = Math.floor(z), cx = Math.floor(nx), cz = Math.floor(nz);
    if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return true;
    const a = oz * g.w + ox;
    let j = cz * g.w + cx;
    const decal = (this.flags[i] & FL_DECAL) !== 0;
    if (j !== a) {
      // crossing a cell boundary: find which face (x first, as raycast does)
      let from = a, d, hit = 0;
      if (cx !== ox && cz !== oz) {
        const mid = oz * g.w + cx;
        const bm = this._blocks(mid, ny, y, nx, nz);
        if (bm) { hit = bm; d = cx > ox ? 0 : 1; j = mid; }
        else { from = mid; d = cz > oz ? 2 : 3; hit = this._blocks(j, ny, y, nx, nz); }
      } else {
        d = cx !== ox ? (cx > ox ? 0 : 1) : (cz > oz ? 2 : 3);
        hit = this._blocks(j, ny, y, nx, nz);
      }
      if (hit) {
        if (hit === 1 || hit === 2) {
          // wall or riser face
          if (decal) {
            const s = this.size[i] * fx.float(3.5, 6);
            const runs = s > 0.22 && fx.chance(0.5);
            this._faceDecal(from, d, d < 2 ? nz : nx, ny, s, runs ? s * 1.3 : s, runs ? GC.WALL_RUN : GC.SPLAT_A, runs ? 0 : fx.float(0, TAU), this.cr[i] * 0.7, this.cg[i] * 0.7, this.cb[i] * 0.7, 0.93);
          }
          return true;
        }
        if (hit === 4) { this._floorHit(i, j, nx, nz, g.floorAtPos(j, nx, nz), decal); return true; }
        return true;        // ceiling lip / closed door
      }
    }
    // inside cell j: floor, ceiling, deco colliders
    const fl = g.flags[j];
    if (!(fl & F.VOID)) {
      const fy = g.floorAtPos(j, nx, nz);
      if (ny < fy) { this._floorHit(i, j, nx, nz, fy, decal); return true; }
    }
    if (!g.sky[j] && ny > g.ceil[j]) return true;
    if (this.colFlag[j]) {
      const list = this.colList.get(j);
      for (let k = 0; k < list.length; k++) {
        const c = list[k];
        if (nx < c.x0 || nx > c.x1 || nz < c.z0 || nz > c.z1 || ny < c.y0 || ny > c.y1) continue;
        if (decal) {
          const s = this.size[i] * fx.float(3, 5), r = this.cr[i] * 0.7, gg = this.cg[i] * 0.7, b = this.cb[i] * 0.7;
          if (y >= c.y1 - 0.02) this._boxTopDecal(c, j, nx, nz, s, r, gg, b);
          else this._boxSideDecal(c, j, x, z, nx, ny, nz, s, r, gg, b);
        }
        return true;
      }
    }
    this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
    return false;
  }

  // What stops a droplet entering cell j at height y (prevY = height before
  // this step)? 0 nothing, 1 wall, 2 riser face, 3 ceiling lip / door, 4 landed on j's floor
  _blocks(j, y, prevY, x, z) {
    const g = this.grid;
    if (g.type[j] !== OPEN) return 1;
    if (g.flags[j] & F.DOOR) {
      const d = this.world.doorByCell.get(j);
      if (d && d.open < 0.95 && y > d.floor + (d.ceil - d.floor) * d.open) return 3;
    }
    if (!(g.flags[j] & F.VOID)) {
      const f = g.floorAtPos(j, x, z);
      if (y < f) return prevY >= f - 0.01 ? 4 : 2;
    }
    if (!g.sky[j] && y > g.ceil[j]) return 3;
    return 0;
  }

  _liquid(j) {
    const g = this.grid, fl = g.flags[j];
    if (fl & F.WATER) return true;
    if (!(fl & (F.HAZARD | F.PIT))) return false;
    const h = g.hazType[j];
    return h === HAZ.LAVA || h === HAZ.POISON || h === HAZ.WATER || (h === HAZ.NONE && (fl & F.HAZARD) !== 0);
  }

  _floorHit(i, j, x, z, fy, decal) {
    const g = this.grid;
    if (this._liquid(j)) {
      if (g.hazType[j] === HAZ.LAVA && fx.chance(0.15)) this._p(EMBER, 0, x, fy + 0.05, z, 0, fx.float(0.5, 1.5), 0, 0.5, 0.06, EMBER_COL[0], EMBER_COL[1], EMBER_COL[2], 1, -0.5, 0, 0);
      return;
    }
    if (!decal) return;
    const s = this.size[i] * fx.float(3, 5.5);
    this._floorDecal(j, x, fy, z, s, s < 0.24 ? GC.DROP : GC.SPLAT_A, fx.float(0, TAU), this.cr[i] * 0.7, this.cg[i] * 0.7, this.cb[i] * 0.7, 0.93, 0);
  }

  // ================================================================ gibs
  _gib(x, y, z, vx, vy, vz, cell, size, r, g, b, hue, sat, bloody, blood) {
    const gb = this.gibs[this.gibHead];
    this.gibHead = (this.gibHead + 1) % GIB_CAP;
    gb.on = true; gb.x = x; gb.y = y; gb.z = z; gb.vx = vx; gb.vy = vy; gb.vz = vz;
    gb.cell = cell; gb.size = size; gb.r = r; gb.g = g; gb.b = b; gb.hue = hue; gb.sat = sat;
    gb.br = blood[0]; gb.bg = blood[1]; gb.bb = blood[2];
    gb.rot = fx.float(0, TAU); gb.spin = fx.float(-14, 14);
    gb.age = 0; gb.rest = fx.float(6, 10); gb.settled = false; gb.landed = false; gb.walled = false;
    gb.bloody = bloody; gb.trailT = fx.float(0, 0.04); gb.sink = 0;
  }

  _solidPt(x, y, z) {
    const g = this.grid, cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return true;
    const i = cz * g.w + cx;
    if (g.type[i] !== OPEN) return true;
    if (g.flags[i] & F.DOOR) { const d = this.world.doorByCell.get(i); if (d && d.open < 0.95 && y > d.floor + (d.ceil - d.floor) * d.open) return true; }
    if (!(g.flags[i] & F.VOID) && y < g.floorAtPos(i, x, z) - 0.02) return true;
    if (!g.sky[i] && y > g.ceil[i]) return true;
    if (this.colFlag[i]) for (const c of this.colList.get(i)) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y > c.y0 && y < c.y1) return true;
    return false;
  }

  // floor height under (x, z) for something at height y (deco tops count)
  _groundAt(x, z, y) {
    const g = this.grid, i = g.cellAt(x, z);
    if (i < 0 || g.type[i] !== OPEN) return y;
    let f = g.flags[i] & F.VOID ? -Infinity : g.floorAtPos(i, x, z);
    if (this.colFlag[i]) for (const c of this.colList.get(i)) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.y1 <= y + 0.05 && c.y1 > f) f = c.y1;
    return f;
  }

  _updateGibs(dt) {
    const g = this.grid;
    for (let k = 0; k < GIB_CAP; k++) {
      const gb = this.gibs[k];
      if (!gb.on) continue;
      gb.age += dt;
      if (gb.settled) {
        if (gb.age > gb.rest) { gb.sink += dt * 0.1; if (gb.sink > gb.size * 0.7) gb.on = false; }
        continue;
      }
      gb.vy -= 18 * dt;
      const rad = gb.size * 0.3;
      // horizontal, per axis, bouncing off walls (first hard wall hit leaves a splat)
      const nx = gb.x + gb.vx * dt;
      if (this._solidPt(nx + Math.sign(gb.vx) * rad, gb.y, gb.z)) {
        if (gb.bloody && !gb.walled && Math.abs(gb.vx) > 2) this._gibWall(gb, gb.vx > 0 ? 0 : 1);
        gb.vx *= -0.4; gb.walled = true;
      } else gb.x = nx;
      const nz = gb.z + gb.vz * dt;
      if (this._solidPt(gb.x, gb.y, nz + Math.sign(gb.vz) * rad)) {
        if (gb.bloody && !gb.walled && Math.abs(gb.vz) > 2) this._gibWall(gb, gb.vz > 0 ? 2 : 3);
        gb.vz *= -0.4; gb.walled = true;
      } else gb.z = nz;
      let ny = gb.y + gb.vy * dt;
      const ground = this._groundAt(gb.x, gb.z, gb.y - rad);
      if (ny - rad < ground) {
        ny = ground + rad;
        const j = g.cellAt(gb.x, gb.z);
        const liquid = j >= 0 && this._liquid(j);
        if (!gb.landed) {
          gb.landed = true;
          if (gb.bloody && !liquid && j >= 0 && Math.abs(ground - this.grid.floor[j]) < 0.02) this._floorDecal(j, gb.x, ground, gb.z, fx.float(0.3, 0.5), fx.chance(0.5) ? GC.SPLAT_A : GC.SPLAT_B, fx.float(0, TAU), gb.br * 0.7, gb.bg * 0.7, gb.bb * 0.7, 0.93, 0);
          const p = this.game.player;
          if (p && Math.abs(gb.vy) > 3) this.game.sfx(gb.bloody ? 'splat' : 'wall_hit', { dist: Math.hypot(gb.x - p.x, gb.z - p.z), pitch: gb.bloody ? fx.float(0.8, 1.25) : 0.5, volume: 0.7 });
        }
        if (liquid) { gb.settled = true; gb.age = gb.rest; gb.vx = gb.vz = gb.vy = 0; }
        else if (Math.abs(gb.vy) < 1.2) { gb.settled = true; gb.vy = gb.vx = gb.vz = 0; gb.spin = 0; }
        else { gb.vy = -gb.vy * 0.35; gb.vx *= 0.6; gb.vz *= 0.6; gb.spin *= 0.5; }
      } else {
        const c = g.cellAt(gb.x, gb.z);
        if (c >= 0 && !g.sky[c] && ny + rad > g.ceil[c]) { ny = g.ceil[c] - rad; gb.vy = -Math.abs(gb.vy) * 0.3; }
      }
      gb.y = ny;
      if (gb.y < this.voidY) { gb.on = false; continue; }
      gb.rot += gb.spin * dt;
      // blood trail while flying
      if (gb.bloody && !gb.settled) {
        gb.trailT -= dt;
        if (gb.trailT <= 0) {
          gb.trailT = 0.04;
          if (gb.vx * gb.vx + gb.vy * gb.vy + gb.vz * gb.vz > 4) this._p(DROP, GC.DROP, gb.x, gb.y, gb.z, gb.vx * 0.2, gb.vy * 0.2, gb.vz * 0.2, 2, fx.float(0.03, 0.05), gb.br, gb.bg, gb.bb, 1, 16, 0, fx.chance(0.12) ? FL_DECAL : 0);
        }
      }
    }
  }

  _gibWall(gb, d) {
    const g = this.grid, a = g.cellAt(gb.x, gb.z);
    if (a < 0) return;
    const s = gb.size * fx.float(1.5, 2.4);
    this._faceDecal(a, d, d < 2 ? gb.z : gb.x, gb.y, s, s * 1.3, GC.WALL_RUN, 0, gb.br * 0.7, gb.bg * 0.7, gb.bb * 0.7, 0.93);
  }

  // ================================================================ decals
  _floorOK(j) {
    const g = this.grid;
    if (j < 0 || g.type[j] !== OPEN) return false;
    if (g.flags[j] & (F.STAIR | F.SCROLL | F.DOOR | F.VOID)) return false;
    if (this._liquid(j)) return false;
    return !this.world.doorByCell.has(j);
  }
  // can a floor decal in cell j spill over into cell (x, z)?
  _spill(j, x, z) {
    const g = this.grid;
    if (!g.in(x, z)) return false;
    const k = z * g.w + x;
    return this._floorOK(k) && !(g.flags[k] & (F.HAZARD | F.PIT)) && Math.abs(g.floor[k] - g.floor[j]) < 0.02 && !this.colFlag[k];
  }

  // floor decal centred near (x, z) on cell j at height fy, kept from hanging over edges
  _floorDecal(j, x, fy, z, size, cell, rot, r, g, b, a, grow) {
    if (!this._floorOK(j)) return;
    const G = this.grid, cx = j % G.w, cz = (j / G.w) | 0;
    const okL = this._spill(j, cx - 1, cz) && this._spill(j, cx - 1, cz - 1) && this._spill(j, cx - 1, cz + 1);
    const okR = this._spill(j, cx + 1, cz) && this._spill(j, cx + 1, cz - 1) && this._spill(j, cx + 1, cz + 1);
    const okU = this._spill(j, cx, cz - 1) && this._spill(j, cx - 1, cz - 1) && this._spill(j, cx + 1, cz - 1);
    const okD = this._spill(j, cx, cz + 1) && this._spill(j, cx - 1, cz + 1) && this._spill(j, cx + 1, cz + 1);
    if ((!okL && !okR) || (!okU && !okD)) size = Math.min(size, 0.98);
    const half = size * 0.5;
    const x0 = okL ? cx : cx + half, x1 = okR ? cx + 1 : cx + 1 - half;
    const z0 = okU ? cz : cz + half, z1 = okD ? cz + 1 : cz + 1 - half;
    // keep the centre strictly inside cell j so lookups at the centre find this cell
    x = x0 > x1 ? cx + 0.5 : Math.min(x1, cx + 0.999, Math.max(x0, cx + 0.001, x));
    z = z0 > z1 ? cz + 0.5 : Math.min(z1, cz + 0.999, Math.max(z0, cz + 0.001, z));
    this._addDecal(x, fy + EPS, z, size, size, rot, BB_FLOOR, cell, r, g, b, a, G.light[j], grow);
  }

  // Decal on the vertical face of open cell `a` toward direction d (0 +x, 1 -x,
  // 2 +z, 3 -z). u = position along the face, y = height. Clamped to the face.
  _faceDecal(a, d, u, y, w, h, cell, rot, r, g, b, alpha) {
    const G = this.grid;
    if (a < 0 || G.type[a] !== OPEN || (G.flags[a] & (F.STAIR | F.DOOR))) return;
    const ax = a % G.w, az = (a / G.w) | 0;
    const bx = ax + DIR_X[d], bz = az + DIR_Z[d];
    if (!G.in(bx, bz)) return;
    const bi = bz * G.w + bx;
    if (G.flags[bi] & (F.DOOR | F.STAIR) || this.world.doorByCell.has(bi)) return;
    const lo = G.floor[a];
    let hi;
    const solid = G.type[bi] !== OPEN;
    if (solid) hi = G.sky[a] ? Math.max(lo, G.floor[bi]) : G.ceil[a];
    else if (G.floor[bi] > lo + 0.1) hi = G.floor[bi];
    else return;
    if (!G.sky[a]) hi = Math.min(hi, G.ceil[a]);
    const range = hi - lo;
    if (range < 0.15) return;
    let aw = Math.abs(w);
    if (h > range) { const k = range / h; h = range; aw *= k; w *= k; }
    y = Math.min(hi - h * 0.5, Math.max(lo + h * 0.5, y));
    // along the face: may spill onto the next segment when it is the same kind of wall
    const along = d < 2 ? az : ax;
    const stepA = d < 2 ? G.w : 1;
    const segOK = (s) => {
      const na = a + s * stepA, nb = bi + s * stepA;
      const nax = na % G.w, naz = (na / G.w) | 0;
      if (!G.in(nax, naz) || (d < 2 ? nax !== ax : naz !== az)) return false;
      if (G.type[na] !== OPEN || Math.abs(G.floor[na] - lo) > 0.02 || (G.flags[na] & (F.STAIR | F.DOOR))) return false;
      return solid ? G.type[nb] !== OPEN : (G.type[nb] === OPEN && Math.abs(G.floor[nb] - G.floor[bi]) < 0.02);
    };
    const half = Math.min(aw, 1) * 0.5;
    const u0 = segOK(-1) ? along : along + half, u1 = segOK(1) ? along + 1 : along + 1 - half;
    u = u0 > u1 ? along + 0.5 : Math.min(u1, Math.max(u0, u));
    let px, pz, mode;
    if (d === 0) { px = ax + 1 - EPS; pz = u; mode = BB_WALLX; }
    else if (d === 1) { px = ax + EPS; pz = u; mode = BB_WALLX; }
    else if (d === 2) { pz = az + 1 - EPS; px = u; mode = BB_WALLZ; }
    else { pz = az + EPS; px = u; mode = BB_WALLZ; }
    this._addDecal(px, y, pz, w, h, rot, mode, cell, r, g, b, alpha, G.light[a], 0);
  }

  _boxTopDecal(c, j, x, z, s, r, g, b) {
    const half = Math.min(s, Math.min(c.x1 - c.x0, c.z1 - c.z0) * 0.9) * 0.5;
    if (half < 0.04) return;
    x = Math.min(c.x1 - half, Math.max(c.x0 + half, x));
    z = Math.min(c.z1 - half, Math.max(c.z0 + half, z));
    this._addDecal(x, c.y1 + EPS, z, half * 2, half * 2, fx.float(0, TAU), BB_FLOOR, GC.SPLAT_A, r, g, b, 0.93, this.grid.light[j], 0);
  }

  _boxSideDecal(c, j, x, z, nx, ny, nz, s, r, g, b) {
    let px, pz, mode, lo, hi;
    if (x <= c.x0 || x >= c.x1) {
      px = x <= c.x0 ? c.x0 - EPS : c.x1 + EPS; mode = BB_WALLX; lo = c.z0; hi = c.z1; pz = nz;
    } else if (z <= c.z0 || z >= c.z1) {
      pz = z <= c.z0 ? c.z0 - EPS : c.z1 + EPS; mode = BB_WALLZ; lo = c.x0; hi = c.x1; px = nx;
    } else return;
    const half = Math.min(s, (hi - lo) * 0.9, (c.y1 - c.y0) * 0.9) * 0.5;
    if (half < 0.04) return;
    const u = Math.min(hi - half, Math.max(lo + half, mode === BB_WALLX ? pz : px));
    if (mode === BB_WALLX) pz = u; else px = u;
    const y = Math.min(c.y1 - half, Math.max(c.y0 + half, ny));
    this._addDecal(px, y, pz, half * 2, half * 2, fx.float(0, TAU), mode, GC.SPLAT_A, r, g, b, 0.93, this.grid.light[j], 0);
  }

  _addDecal(x, y, z, w, h, rot, mode, cell, r, g, b, a, light, grow) {
    // merge with a recent decal on the same spot instead of stacking
    const cap = DECAL_CAP;
    for (let k = 1; k <= Math.min(12, this.dN); k++) {
      const i = (this.dHead - k + cap) % cap;
      if (this.time - this.dborn[i] > 0.5) break;
      if (this.dmode[i] !== mode || this.dcell[i] === GC.POOL || this.dcell[i] === GC.SCORCH || cell === GC.POOL || cell === GC.SCORCH) continue;
      const ex = this.dx[i] - x, ey = this.dy[i] - y, ez = this.dz[i] - z;
      if (ex * ex + ey * ey + ez * ez < 0.0225) {
        // darken instead of growing: the size was clamped to its cell / face when placed
        this.da[i] = Math.min(1, this.da[i] + 0.06);
        return;
      }
    }
    const i = this.dHead;
    this.dHead = (i + 1) % cap;
    if (this.dN < cap) this.dN++;
    this.dx[i] = x; this.dy[i] = y; this.dz[i] = z; this.dw[i] = w; this.dh[i] = h; this.drot[i] = rot;
    this.dr[i] = r; this.dg[i] = g; this.db[i] = b; this.da[i] = a;
    this.dmode[i] = mode; this.dcell[i] = cell; this.dlight[i] = light; this.dborn[i] = this.time; this.dgrow[i] = grow;
    this.stats.decals++;
  }

  // Horizontal grid DDA from (x, y, z) along (dx, dz): distance to the first
  // face that blocks height y (wall, raised floor, low ceiling, closed door),
  // or -1. this.ray gets the open cell before the face and the face direction.
  _cast(x, y, z, dx, dz, maxD) {
    const g = this.grid;
    let cx = Math.floor(x), cz = Math.floor(z);
    if (!g.in(cx, cz)) return -1;
    let a = cz * g.w + cx;
    if (g.type[a] !== OPEN) return -1;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const tdx = adx > 1e-6 ? 1 / adx : Infinity, tdz = adz > 1e-6 ? 1 / adz : Infinity;
    let tmx = adx > 1e-6 ? (dx > 0 ? cx + 1 - x : x - cx) * tdx : Infinity;
    let tmz = adz > 1e-6 ? (dz > 0 ? cz + 1 - z : z - cz) * tdz : Infinity;
    for (let n = 0; n < 16; n++) {
      let t, d;
      if (tmx < tmz) { t = tmx; cx += sx; tmx += tdx; d = sx > 0 ? 0 : 1; } else { t = tmz; cz += sz; tmz += tdz; d = sz > 0 ? 2 : 3; }
      if (t > maxD || !g.in(cx, cz)) return -1;
      const b = cz * g.w + cx;
      let blocked = g.type[b] !== OPEN || (!(g.flags[b] & F.VOID) && g.minFloor(b) > y) || (!g.sky[b] && g.ceil[b] < y);
      if (!blocked && (g.flags[b] & F.DOOR)) { const dr = this.world.doorByCell.get(b); blocked = !!dr && dr.open < 0.95; }
      if (blocked) {
        const R = this.ray;
        R.a = a; R.d = d; R.t = t; R.hx = x + dx * t; R.hz = z + dz * t;
        return t;
      }
      a = b;
    }
    return -1;
  }

  // ================================================================ render
  submit(batcher, content, cam) {
    const h = content.gore;
    if (!h || !h.ready) return;
    const t0 = performance.now();
    const g = this.grid, fxh = content.fx;
    const r = this.game.renderer;
    const rx = r ? r.camRight[0] : 1, ry = r ? r.camRight[1] : 0, rz = r ? r.camRight[2] : 0;
    const ux = r ? r.camUp[0] : 0, uy = r ? r.camUp[1] : 1, uz = r ? r.camUp[2] : 0;
    const camX = cam.x, camY = cam.y, camZ = cam.z;
    // decals first (same ALPHA batch as the blood particles, so they draw underneath)
    const cap = DECAL_CAP, n = this.dN, full = n === cap;
    for (let k = 0; k < n; k++) {
      const i = (this.dHead - n + k + cap) % cap;
      const ex = this.dx[i] - camX, ez = this.dz[i] - camZ;
      if (ex * ex + ez * ez > 1600) continue;
      let a = this.da[i];
      if (full && k < 48) a *= (k + 1) / 49;              // the oldest fade out before being recycled
      let w = this.dw[i], hh = this.dh[i];
      const gr = this.dgrow[i];
      if (gr > 0) { const t = Math.min(1, (this.time - this.dborn[i]) / gr); const e = 0.3 + 0.7 * (1 - (1 - t) * (1 - t)); w *= e; hh *= e; }
      const c = this.dcell[i] * 4;
      batcher.addRaw(h, MODE.ALPHA, this.dx[i], this.dy[i], this.dz[i], w, hh, UV[c], UV[c + 1], UV[c + 2], UV[c + 3],
        this.dr[i], this.dg[i], this.db[i], a, this.drot[i], 0.5, false, this.dlight[i], this.dmode[i]);
    }
    // particles
    for (let i = 0; i < this.pN; i++) {
      const k = this.kind[i];
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      const life = this.life[i], age = this.age[i];
      let s = this.size[i];
      const ci = g.cellAt(x, z);
      const light = ci >= 0 ? g.light[ci] : 0.6;
      if (k === DROP) {
        const vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        let cell = GC.DROP, hgt = s, rot = 0;
        if (sp > 2.5) {
          cell = GC.STREAK; hgt = s * Math.min(3, 1 + sp * 0.14);
          rot = Math.atan2(vx * ux + vy * uy + vz * uz, vx * rx + vy * ry + vz * rz) + Math.PI / 2;
        }
        const c = cell * 4;
        const fade = Math.min(1, (life - age) * 5);
        batcher.addRaw(h, MODE.ALPHA, x, y, z, s, hgt, UV[c], UV[c + 1], UV[c + 2], UV[c + 3], this.cr[i], this.cg[i], this.cb[i], this.ca[i] * fade, rot, 0.5, false, light, BB_SPH);
      } else if (k === MIST || k === POP) {
        const t = age / life;
        s *= 1 + age * this.grow[i];
        let a = this.ca[i] * (1 - t) * (k === MIST ? Math.min(1, age * 12) : 1);
        // keep big alpha puffs off the lens (overdraw + fog look)
        const ex = x - camX, ey = y - camY, ez = z - camZ, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < 2.25) { const d = Math.sqrt(d2); a *= Math.max(0, (d - 0.35) / 1.15); s = Math.min(s, d * 0.6 + 0.1); }
        if (a <= 0.01) continue;
        const c = this.cell[i] * 4;
        batcher.addRaw(h, MODE.ALPHA, x, y, z, s, s, UV[c], UV[c + 1], UV[c + 2], UV[c + 3], this.cr[i], this.cg[i], this.cb[i], a, (i * 2.399) % TAU, 0.5, false, light, BB_SPH);
      } else {
        // sparks / embers: additive and fullbright
        const fade = 1 - age / life;
        let hgt = s, rot = 0;
        const uv = FXUV[this.cell[i]];
        if (k === SPARK) {
          const vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
          const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
          hgt = s * (2 + sp * 0.3);
          rot = Math.atan2(vx * ux + vy * uy + vz * uz, vx * rx + vy * ry + vz * rz) + Math.PI / 2;
        }
        batcher.addRaw(fxh, MODE.ADD, x, y, z, s, hgt, uv[0], uv[1], uv[2], uv[3], this.cr[i], this.cg[i], this.cb[i], fade, rot, 0.5, true, 1, BB_SPH);
      }
    }
    // gibs: lit cutouts
    for (let k = 0; k < GIB_CAP; k++) {
      const gb = this.gibs[k];
      if (!gb.on) continue;
      const ci = g.cellAt(gb.x, gb.z);
      const c = gb.cell * 4;
      batcher.addRaw(h, MODE.CUTOUT, gb.x, gb.y - gb.sink, gb.z, gb.size, gb.size, UV[c], UV[c + 1], UV[c + 2], UV[c + 3],
        gb.r, gb.g, gb.b, 1, gb.rot, 0.5, false, ci >= 0 ? g.light[ci] : 0.6, BB_SPH, gb.hue, gb.sat);
    }
    this.stats.submitMs = performance.now() - t0;
  }

  get particleCount() { return this.pN; }
  get gibCount() { let n = 0; for (const gb of this.gibs) if (gb.on) n++; return n; }
  get decalCount() { return this.dN; }
}

// ======================================================================
// Camera-lens blood: splats appear where gore flew at the camera, hold for a
// moment, then drips detach and slide slowly down with stick-slip motion,
// leaving trails that fade, until they run off the bottom of the screen.
// Drawn into the low-res scene target after the weapon (renderer.drawQuad
// alpha mode), tinted by the local sector light so it never glows.
const L_SPLATS = TOUCH ? 14 : 22, L_DRIPS = TOUCH ? 10 : 18;

export class LensBlood {
  constructor(game) {
    this.game = game;
    this.splats = [];
    this.drips = [];
    for (let k = 0; k < L_SPLATS; k++) this.splats.push({ on: false, x: 0, y: 0, r: 0, cell: GC.LENS_A, flip: false, age: 0, life: 6, hold: 0.5, a0: 0.9, dripped: 0, maxDrips: 1, cr: 0.5, cg: 0, cb: 0 });
    for (let k = 0; k < L_DRIPS; k++) this.drips.push({ on: false, age: 0, x: 0, y0: 0, head: 0, v: 0, pause: 0, stepT: 0.25, w: 0.01, hr: 0.01, hr0: 0.01, trail: 0.8, trailLife: 8, cr: 0.5, cg: 0, cb: 0 });
    this.newThisFrame = 0;
    this.active = 0;
  }

  get enabled() { const s = this.game.settings || {}; return s.lensBlood !== false && (s.gore ?? 2) > 0; }

  clear() { for (const s of this.splats) s.on = false; for (const d of this.drips) d.on = false; this.active = 0; }

  // n splats scattered around screen point (cx, cy) (0..1)
  burst(cx, cy, n, col, spread = 0.25) {
    if (!this.enabled) return;
    const wasEmpty = this.active === 0;
    for (let k = 0; k < n; k++) {
      const big = k === 0 ? 1.3 : 1;
      this.add(cx + fx.gauss() * spread * 0.55, cy + fx.gauss() * spread * 0.45, fx.float(0.035, 0.11) * big, col[0], col[1], col[2]);
    }
    if (n >= 3 && wasEmpty) {
      const f = this.game.post?.flash;
      if (f && f[3] < 0.12) this.game.post.flash = [0.35, 0, 0, 0.15];
    }
  }

  // a droplet that flew into the camera
  fromWorld(x, y, z, r, g, b, size) {
    const pr = this.game.renderer?.project(x, y, z);
    if (!pr) return;
    this.add(Math.min(0.97, Math.max(0.03, pr.x)), Math.min(0.9, Math.max(0.03, pr.y)), Math.min(0.08, 0.025 + size * 0.5), r, g, b);
  }

  // enemy blood/slime on the lens when a fleshy monster hits you in melee
  onMeleeHit(src) {
    if (!this.enabled || !src || !fx.chance(0.3)) return;
    const P = goreProfile(src.def);
    if (!P.fleshy) return;
    const left = fx.chance(0.5);
    this.add(left ? fx.float(0.02, 0.2) : fx.float(0.8, 0.98), fx.float(0.05, 0.55), fx.float(0.04, 0.08), P.lens[0], P.lens[1], P.lens[2]);
  }

  add(x, y, r, cr, cg, cb) {
    if (!this.enabled || this.newThisFrame >= 8) return;
    this.newThisFrame++;
    let s = null, worst = -1;
    for (const c of this.splats) {
      if (!c.on) { s = c; break; }
      const f = c.age / c.life;
      if (f > worst) { worst = f; s = c; }
    }
    s.on = true; s.x = x; s.y = y; s.r = r;
    s.cell = fx.chance(0.5) ? GC.LENS_A : GC.LENS_B; s.flip = fx.chance(0.5);
    s.age = 0; s.life = fx.float(5, 9); s.hold = fx.float(0.3, 1.2); s.a0 = fx.float(0.78, 0.92);
    s.dripped = 0; s.maxDrips = r > 0.07 ? 2 : r > 0.035 ? 1 : (fx.chance(0.5) ? 1 : 0);
    s.cr = cr; s.cg = cg; s.cb = cb;
  }

  _drip(s) {
    let d = null;
    for (const c of this.drips) if (!c.on) { d = c; break; }
    if (!d) return;
    const H = this.game.renderer?.lowH || 240, W = this.game.renderer?.lowW || 400;
    d.on = true; d.age = 0;
    d.x = s.x + fx.float(-0.35, 0.35) * s.r * H / W;
    d.y0 = s.y + s.r * 0.35; d.head = d.y0;
    d.v = fx.float(0.015, 0.06); d.pause = 0; d.stepT = 0.25;
    d.w = s.r * fx.float(0.35, 0.45); d.hr0 = s.r * fx.float(0.28, 0.36); d.hr = d.hr0;
    d.trail = 0.8; d.trailLife = fx.float(6, 10);
    d.cr = s.cr; d.cg = s.cg; d.cb = s.cb;
  }

  update(dt) {
    this.newThisFrame = 0;
    let active = 0;
    for (const s of this.splats) {
      if (!s.on) continue;
      s.age += dt;
      if (s.age > s.hold) {
        if (s.dripped < s.maxDrips && s.age > s.hold + s.dripped * 0.7) { s.dripped++; this._drip(s); }
        s.y += dt * 0.004;            // the body creeps down a little as it drains
      }
      if (s.age >= s.life) { s.on = false; continue; }
      active++;
    }
    for (const d of this.drips) {
      if (!d.on) continue;
      d.age += dt;
      if (d.pause > 0) d.pause -= dt;
      else { d.v += 0.02 * dt; d.head += d.v * dt; }
      d.stepT -= dt;
      if (d.stepT <= 0) { d.stepT = 0.25; if (fx.chance(0.15)) d.pause = fx.float(0.2, 0.8); }
      d.hr = Math.max(d.w * 0.55, d.hr0 * (1 - (d.head - d.y0) * 0.9));
      d.trail -= dt / d.trailLife;
      if ((d.head - d.hr > 1.05 && d.trail <= 0.05) || d.age > 24) { d.on = false; continue; }
      active++;
    }
    this.active = active;
  }

  draw(r, handle, fxh) {
    if (!this.active || !handle || !handle.ready || !this.enabled) return;
    const g = this.game, w = g.world, p = g.player;
    let L = 0.8;
    if (w && p) { const c = w.grid.cellAt(p.x, p.z); if (c >= 0) L = Math.min(1.1, w.grid.light[c]); }
    const lk = 0.45 + 0.55 * L;
    const H = r.lowH, W = r.lowW;
    const tint = this._tint || (this._tint = [1, 1, 1, 1]);
    const uv = this._uv || (this._uv = [0, 0, 1, 1]);
    const opts = this._opts || (this._opts = { alpha: true, tint });
    const setUV = (cell, flip) => {
      const c = cell * 4;
      uv[0] = UV[flip ? c + 2 : c]; uv[1] = UV[c + 1]; uv[2] = UV[flip ? c : c + 2]; uv[3] = UV[c + 3];
    };
    // trails
    for (const d of this.drips) {
      if (!d.on || d.trail <= 0) continue;
      const tw = Math.max(2, Math.round(d.w * H));
      const y0 = d.y0 * H, y1 = Math.min(H + 2, d.head * H);
      if (y1 - y0 < 1) continue;
      setUV(GC.LENS_TRAIL, false);
      tint[0] = d.cr * lk; tint[1] = d.cg * lk; tint[2] = d.cb * lk; tint[3] = Math.min(0.8, d.trail);
      r.drawQuad(handle.tex, Math.round(d.x * W - tw / 2), Math.round(y0), tw, Math.ceil(y1 - y0), uv, opts);
    }
    // bodies (darken as they dry so a fading splat never turns pink)
    for (const s of this.splats) {
      if (!s.on) continue;
      const size = Math.max(4, Math.round(s.r * 2 * H));
      const fadeIn = Math.min(1, s.age * 20), fadeOut = Math.min(1, (s.life - s.age) / 2);
      const dk = lk * (0.45 + 0.55 * fadeOut);
      setUV(s.cell, s.flip);
      tint[0] = s.cr * dk; tint[1] = s.cg * dk; tint[2] = s.cb * dk; tint[3] = s.a0 * fadeIn * fadeOut;
      r.drawQuad(handle.tex, Math.round(s.x * W - size / 2), Math.round(s.y * H - size / 2), size, size, uv, opts);
    }
    // wet specular glints on the fresh splats
    if (fxh && fxh.ready) {
      const hopts = this._hopts || (this._hopts = { additive: true, tint });
      for (const s of this.splats) {
        if (!s.on || s.r < 0.035) continue;
        const k = Math.min(1, (s.life - s.age) / 2) * Math.max(0, 1 - s.age / s.life * 0.7) * 0.22 * lk;
        const hs = Math.max(2, Math.round(s.r * 0.55 * H));
        tint[0] = k; tint[1] = k * 0.85; tint[2] = k * 0.85; tint[3] = 1;
        r.drawQuad(fxh.tex, Math.round((s.x - s.r * 0.28 * H / W) * W - hs / 2), Math.round((s.y - s.r * 0.3) * H - hs / 2), hs, hs, FXUV[0], hopts);
      }
    }
    // drip heads (teardrops, round end leading)
    for (const d of this.drips) {
      if (!d.on || d.head - d.hr > 1.05) continue;
      const hw = Math.max(2, Math.round(d.hr * 2 * H)), hh = Math.round(hw * 1.5);
      setUV(GC.STREAK, false);
      tint[0] = d.cr * lk; tint[1] = d.cg * lk; tint[2] = d.cb * lk; tint[3] = 0.88 * Math.min(1, (24 - d.age) / 2);
      r.drawQuad(handle.tex, Math.round(d.x * W - hw / 2), Math.round(d.head * H - hh * 0.8), hw, hh, uv, opts);
    }
  }
}
