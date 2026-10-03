// A loaded level (or the hub): grid physics, raycasts, doors, path flow
// field, entity lists and the per-frame render submission.
import { F, OPEN } from './grid.js';
import { buildWorldMesh, MeshBuilder } from './worldmesh.js';
import { buildLevelTextures } from './leveltextures.js';
import { TS } from './levelgen/common.js';
import { SKIES } from '../data/themes.js';
import { SpriteBatcher, MODE } from './spritebatch.js';
import { clamp } from '../core/math.js';
import { fx } from '../core/rng.js';

const DEFAULT_SKY = { top: [0.02, 0.02, 0.03], horizon: [0.12, 0.1, 0.1], bottom: [0.04, 0.03, 0.03], stars: 0.3, clouds: [0.15, 0.12, 0.12, 0.5] };

export class World {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.grid = level.grid;
    this.theme = level.theme;
    this.depth = level.depth;
    this.time = 0;
    this.monsters = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles = [];
    this.chests = [];
    this.props = [];
    this.npcs = [];
    this.beams = [];          // short-lived line effects (rail, lightning, rift rails)
    this.dynLights = [];
    this.staticLights = [];
    this.portal = null;
    this.flow = null;
    this.flowTimer = 0;
    this.batcher = new SpriteBatcher();
    const t = this.theme;
    this.env = {
      fogColor: t.fog || [0, 0, 0], fogDensity: t.fogDensity ?? 0.03, ambient: t.ambient ?? 0.04,
      grade: t.grade || [1, 1, 1], animFps: 6,
    };
    const sk = SKIES[t.sky];
    this.sky = sk || { ...DEFAULT_SKY, horizon: this.env.fogColor.map((v) => v * 0.8 + 0.05) };
    this.doors = (level.doors || []).map((d) => {
      const i = d.cell;
      return { ...d, floor: this.grid.floor[i], ceil: this.grid.ceil[i], open: 0, target: 0, locked: !!d.color, timer: 0, msgCooldown: 0 };
    });
    this.doorByCell = new Map(this.doors.map((d) => [d.cell, d]));
  }

  // ------------------------------------------------------------------ setup
  buildGraphics(renderer, content) {
    const lt = buildLevelTextures(this.theme, this.level.seed || 1, content, { scrollSpeed: this.level.scrollSpeed });
    this.texReport = lt.report;
    this.slots = lt.slots;
    const layers = lt.layers;
    // animated key-door frames (from door_frames sheets) if available
    this.doorFrames = null;
    const ds = content.doorSet && content.doorSet();
    if (ds) {
      const design = (this.level.seed || 0) % ds.designs;
      this.doorFrames = {};
      for (const color of ds.colors) {
        const frames = content.doorFrameCanvases(ds, color, design);
        this.doorFrames[color] = frames.map((c) => { layers.push(c); return layers.length - 1; });
      }
    }
    renderer.setWallTextures(layers);
    const voidSlot = this.slots[TS.VOID];
    const g = this.grid;
    let hasVoid = false;
    for (let i = 0; i < g.w * g.h; i++) if (g.flags[i] & F.VOID) { hasVoid = true; break; }
    const mesh = buildWorldMesh(g, this.slots, {
      deco: this.level.deco,
      spikeSlot: TS.SPIKES,
      voidY: this.level.voidY,
      voidPlane: hasVoid && this.theme.void !== 'abyss' && this.theme.void !== 'space' && voidSlot
        ? { y: this.level.voidY + 0.5, layer: voidSlot.layer, emissive: voidSlot.emissive, scroll: voidSlot.scroll, light: 0.9 } : null,
    });
    renderer.setWorldMesh(mesh.verts, mesh.indices);
    this.doorMeshDirty = true;
  }

  // ------------------------------------------------------------------ physics
  // Does cell i block an actor whose feet are at `feet`?
  cellBlocks(i, feet, height, step) {
    const g = this.grid;
    if (i < 0 || g.type[i] !== OPEN) return true;
    const d = this.doorByCell.get(i);
    if (d && d.open < 0.9) return true;
    if (g.flags[i] & F.VOID) return false;
    if (g.floor[i] > feet + step) return true;
    if (!g.sky[i] && g.ceil[i] < feet + height - 0.02 && g.ceil[i] - g.floor[i] < height) return true;
    if (!g.sky[i] && g.ceil[i] < feet + height - 0.02) return true;
    return false;
  }

  // Cells overlapped by a circle
  forCells(x, z, r, fn) {
    const g = this.grid;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const i = cx < 0 || cz < 0 || cx >= g.w || cz >= g.h ? -1 : cz * g.w + cx;
      if (fn(i, cx, cz) === false) return false;
    }
    return true;
  }

  canOccupy(x, z, r, feet, height, step) {
    return this.forCells(x, z, r, (i) => !this.cellBlocks(i, feet, height, step));
  }

  // Highest floor under a circle (ignores void cells); -Infinity if all void
  groundUnder(x, z, r, feet, step) {
    let best = -Infinity;
    const g = this.grid;
    this.forCells(x, z, r * 0.7, (i) => {
      if (i < 0 || g.type[i] !== OPEN || (g.flags[i] & F.VOID)) return;
      const f = g.floor[i];
      if (f <= feet + step && f > best) best = f;
    });
    return best;
  }

  ceilingOver(x, z, r) {
    let best = Infinity;
    const g = this.grid;
    this.forCells(x, z, r * 0.7, (i) => {
      if (i < 0 || g.type[i] !== OPEN || g.sky[i]) return;
      const d = this.doorByCell.get(i);
      const c = d ? d.floor + (d.ceil - d.floor) * Math.max(d.open, 0.05) : g.ceil[i];
      if (c < best) best = c;
    });
    return best;
  }

  // Slide-move an actor {x, z, y, radius, height}. Returns true if blocked.
  moveActor(a, dx, dz, step = 0.55) {
    let blocked = false;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (a.radius * 0.8)));
    const sx = dx / n, sz = dz / n;
    for (let k = 0; k < n; k++) {
      if (sx) {
        if (this.canOccupy(a.x + sx, a.z, a.radius, a.y, a.height, step)) a.x += sx; else blocked = true;
      }
      if (sz) {
        if (this.canOccupy(a.x, a.z + sz, a.radius, a.y, a.height, step)) a.z += sz; else blocked = true;
      }
    }
    return blocked;
  }

  // Is the point inside world geometry?
  pointSolid(x, y, z) {
    const g = this.grid;
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return true;
    const i = cz * g.w + cx;
    if (g.type[i] !== OPEN) return true;
    const d = this.doorByCell.get(i);
    if (d && d.open < 0.95 && y > d.floor + (d.ceil - d.floor) * d.open && y < d.ceil) return true;
    if (!(g.flags[i] & F.VOID) && y < g.floor[i]) return true;
    if (!g.sky[i] && y > g.ceil[i]) return true;
    return false;
  }

  // Ray march. Returns {dist, x, y, z, nx, nz, ny} for the first solid hit or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const stepLen = 0.06;
    let px = ox, py = oy, pz = oz;
    for (let t = 0; t < maxDist; t += stepLen) {
      const nx = ox + dx * t, ny = oy + dy * t, nz = oz + dz * t;
      if (this.pointSolid(nx, ny, nz)) {
        // estimate normal from which axis crossing caused the hit
        let n = [0, 0, 0];
        if (Math.floor(nx) !== Math.floor(px) && !this.pointSolid(px, ny, nz)) n = [Math.sign(px - nx), 0, 0];
        else if (Math.floor(nz) !== Math.floor(pz) && !this.pointSolid(nx, ny, pz)) n = [0, 0, Math.sign(pz - nz)];
        else n = [0, Math.sign(py - ny) || 1, 0];
        return { dist: t, x: px, y: py, z: pz, nx: n[0], ny: n[1], nz: n[2] };
      }
      px = nx; py = ny; pz = nz;
    }
    return null;
  }

  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.001) return true;
    return !this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.15);
  }

  floorAt(x, z) {
    const g = this.grid, i = g.cellAt(x, z);
    if (i < 0 || g.type[i] !== OPEN) return null;
    return g.flags[i] & F.VOID ? this.level.voidY : g.floor[i];
  }
  cellFlags(x, z) { const i = this.grid.cellAt(x, z); return i < 0 ? 0 : this.grid.flags[i]; }

  // ------------------------------------------------------------------ doors
  updateDoors(dt, player, monsters) {
    for (const d of this.doors) {
      d.msgCooldown = Math.max(0, d.msgCooldown - dt);
      const cx = d.x + 0.5, cz = d.z + 0.5;
      let want = false;
      const pd = Math.hypot(player.x - cx, player.z - cz);
      if (pd < 1.7) {
        if (d.locked) {
          if (player.keys.has(d.color)) {
            d.locked = false;
            player.keys.delete(d.color);
            this.game.toast(`${d.color.toUpperCase()} door unlocked`, d.color);
            this.game.sfx('door_open', { dist: pd });
            want = true;
          } else if (d.msgCooldown <= 0 && pd < 1.25) {
            d.msgCooldown = 2.5;
            this.game.toast(`You need the ${d.color.toUpperCase()} key`, d.color);
            this.game.sfx('door_locked');
          }
        } else want = true;
      }
      if (!d.locked && !want) {
        for (const m of monsters) {
          if (!m.dead && Math.abs(m.x - cx) < 1.5 && Math.abs(m.z - cz) < 1.5) { want = true; break; }
        }
      }
      if (want) { d.timer = 3.5; if (d.target === 0) { d.target = 1; if (pd < 16) this.game.sfx('door_open', { dist: pd }); } }
      else if (d.timer > 0) d.timer -= dt;
      else if (d.target === 1) {
        // don't close on something standing in the doorway
        const occupied = Math.abs(player.x - cx) < 0.9 && Math.abs(player.z - cz) < 0.9;
        if (!occupied) d.target = 0;
      }
      const speed = 1.6;
      const prev = d.open;
      d.open = clamp(d.open + (d.target ? speed : -speed) * dt, 0, 1);
      if (d.open !== prev) this.doorMeshDirty = true;
    }
  }

  buildDoorMesh(renderer) {
    if (!this.doorMeshDirty) return;
    this.doorMeshDirty = false;
    if (!this.doors.length) { renderer.setDynamicMesh(new Float32Array(0), new Uint32Array(0), 0); return; }
    const mb = new MeshBuilder(this.doors.length * 6 + 4);
    const g = this.grid;
    for (const d of this.doors) {
      const x0 = d.x, z0 = d.z, x1 = d.x + 1, z1 = d.z + 1;
      const light = g.light[d.cell];
      const frames = d.color && this.doorFrames && this.doorFrames[d.color];
      if (frames) {
        // frame-animated panel across the middle of the doorway
        const f = d.open >= 0.99 ? frames.length - 1 : Math.min(frames.length - 2, Math.floor(d.open * (frames.length - 1)));
        const layer = frames[f];
        const y0 = d.floor, y1 = d.ceil;
        if (d.axis === 'x') {
          mb.wall([x0 + 0.5, z1], [x0 + 0.5, z0], y0, y1, 0, 1, [1, 0, 0], layer, light);
          mb.wall([x0 + 0.5, z0], [x0 + 0.5, z1], y0, y1, 0, 1, [-1, 0, 0], layer, light);
        } else {
          mb.wall([x0, z0 + 0.5], [x1, z0 + 0.5], y0, y1, 0, 1, [0, 0, 1], layer, light);
          mb.wall([x1, z0 + 0.5], [x0, z0 + 0.5], y0, y1, 0, 1, [0, 0, -1], layer, light);
        }
        continue;
      }
      if (d.open >= 0.999) continue;
      const slot = this.slots[d.slot] || this.slots[TS.DOOR];
      const bot = d.floor + (d.ceil - d.floor) * d.open, top = d.ceil;
      const em = d.color ? 0.25 : 0;
      // four faces + underside (DOOM-style slab rising into the ceiling)
      mb.wall([x0, z0], [x1, z0], bot, top, 0, 1, [0, 0, -1], slot.layer, light, em);
      mb.wall([x1, z1], [x0, z1], bot, top, 0, 1, [0, 0, 1], slot.layer, light, em);
      mb.wall([x0, z1], [x0, z0], bot, top, 0, 1, [-1, 0, 0], slot.layer, light, em);
      mb.wall([x1, z0], [x1, z1], bot, top, 0, 1, [1, 0, 0], slot.layer, light, em);
      mb.quad([[x0, bot, z0], [x1, bot, z0], [x1, bot, z1], [x0, bot, z1]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, -1, 0], slot.layer, light * 0.7, em, 0);
    }
    const r = mb.result();
    renderer.setDynamicMesh(r.verts, r.indices, r.count);
  }

  // ------------------------------------------------------------------ path flow field
  updateFlow(dt, px, pz) {
    this.flowTimer -= dt;
    if (this.flowTimer > 0 && this.flow) return;
    this.flowTimer = 0.45;
    const g = this.grid;
    const start = g.cellAt(px, pz);
    if (start < 0) return;
    this.flow = g.bfs([start], {
      step: 1.05,
      jumpGap: this.level.jumpGap || 0,
      blocked: (b) => { const d = this.doorByCell.get(b); return d ? d.locked : false; },
    });
  }

  // Next waypoint toward the player for a walker at (x, z).
  flowStep(x, z) {
    const g = this.grid, f = this.flow;
    if (!f) return null;
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!g.in(cx, cz)) return null;
    const here = f[cz * g.w + cx];
    let best = null, bd = here < 0 ? Infinity : here;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (!g.in(nx, nz)) continue;
      const v = f[nz * g.w + nx];
      if (v < 0) continue;
      // diagonals only if both orthogonal neighbours are walkable
      if (dx && dz && (f[cz * g.w + nx] < 0 || f[nz * g.w + cx] < 0)) continue;
      const score = v + (dx && dz ? 0.4 : 0);
      if (score < bd) { bd = score; best = { x: nx + 0.5, z: nz + 0.5 }; }
    }
    return best;
  }

  // ------------------------------------------------------------------ effects
  addParticle(p) {
    if (this.particles.length > 600) this.particles.shift();
    this.particles.push(p);
  }

  burst(x, y, z, color, count = 8, opts = {}) {
    for (let k = 0; k < count; k++) {
      const a = fx.float(0, Math.PI * 2), e = fx.float(-0.3, 1.2);
      const sp = fx.float(opts.speedMin ?? 1, opts.speed ?? 5);
      this.addParticle({
        x, y, z, vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + (opts.up || 0), vz: Math.sin(a) * sp * Math.cos(e),
        life: fx.float(0.25, opts.life ?? 0.7), age: 0, size: fx.float(0.05, opts.size ?? 0.14), color,
        gravity: opts.gravity ?? 9, cell: opts.cell ?? 0, add: opts.add !== false, drag: opts.drag ?? 0.5,
      });
    }
  }

  beam(x0, y0, z0, x1, y1, z1, color, width = 0.12, life = 0.15, jag = 0) {
    this.beams.push({ x0, y0, z0, x1, y1, z1, color, width, life, age: 0, jag });
  }

  flash(x, y, z, color, radius, life = 0.12, intensity = 1.5) {
    this.dynLights.push({ x, y, z, r: color[0], g: color[1], b: color[2], radius, life, age: 0, intensity });
  }

  updateEffects(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.vy -= p.gravity * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const f = this.floorAt(p.x, p.z);
      if (f !== null && p.y < f + 0.02) { p.y = f + 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const b of this.beams) b.age += dt;
    this.beams = this.beams.filter((b) => b.age < b.life);
    for (const l of this.dynLights) l.age += dt;
    this.dynLights = this.dynLights.filter((l) => l.age < l.life);
  }

  // ------------------------------------------------------------------ rendering helpers
  collectLights(extra) {
    const out = [];
    for (const l of this.level.lights || []) {
      const fl = l.flicker ? 0.85 + 0.15 * Math.sin(this.time * 13 + l.x * 7) * Math.sin(this.time * 7.3 + l.z) : l.pulse ? 0.8 + 0.2 * Math.sin(this.time * 3) : 1;
      out.push({ x: l.x, y: l.y ?? (this.floorAt(l.x, l.z) ?? 0) + 1.6, z: l.z, r: l.color[0], g: l.color[1], b: l.color[2], radius: l.radius, intensity: 0.9 * fl });
    }
    for (const l of this.dynLights) {
      const k = 1 - l.age / l.life;
      out.push({ ...l, intensity: l.intensity * k });
    }
    for (const l of extra) out.push(l);
    return out;
  }

  submitEffects(batcher, content, camera) {
    const fxH = content.fx;
    for (const p of this.particles) {
      const k = 1 - p.age / p.life;
      batcher.add(fxH, p.add ? MODE.ADD : MODE.ALPHA, p.x, p.y, p.z, p.size * (p.grow ? 1 + p.age * p.grow : 1), p.size * (p.grow ? 1 + p.age * p.grow : 1), {
        uv: [p.cell * 0.25, 0, p.cell * 0.25 + 0.25, 1], tint: [p.color[0], p.color[1], p.color[2], k], anchorY: 0.5, spherical: true, fullbright: true,
      });
    }
    // beams drawn as a chain of glowing dots (cheap & works with billboards)
    for (const b of this.beams) {
      const k = 1 - b.age / b.life;
      const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      const n = Math.min(160, Math.max(2, Math.ceil(len / (b.width * 0.7))));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        let jx = 0, jy = 0, jz = 0;
        if (b.jag) { jx = (fx.next() - 0.5) * b.jag; jy = (fx.next() - 0.5) * b.jag; jz = (fx.next() - 0.5) * b.jag; }
        batcher.add(fxH, MODE.ADD, b.x0 + (b.x1 - b.x0) * t + jx, b.y0 + (b.y1 - b.y0) * t + jy, b.z0 + (b.z1 - b.z0) * t + jz, b.width * 2, b.width * 2, {
          uv: [0, 0, 0.25, 1], tint: [b.color[0], b.color[1], b.color[2], k], anchorY: 0.5, spherical: true, fullbright: true,
        });
      }
    }
    void camera;
  }
}
