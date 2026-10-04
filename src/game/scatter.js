// Scatter terrain at run time (placed by levelgen/scatter.js, art from the
// manifest scatterSets loaded by content.js):
//   pillars     solid billboards (their deco collider blocks player, monsters, shots)
//   explosives  shootable barrels / props: damaged frame below 50% hp, then the
//               fireball frame + a real explosion (combat.explode, owner 'world':
//               hurts monsters AND the player), chain reactions after a short
//               fuse, leaving a non-solid debris pile
//   pedestals   solid, with a rare+ item floating above (take it with USE)
//   traps       animated spike plates: retracted -> rising (warning) -> extended
//               (damage + bleed to the player and walking monsters) -> retracting
//   chests      closed / open pairs matching the theme (drawn for game.js chests)
//   terminals   solid consoles (backs to a wall or alone in a room) and flat
//               wall panels; screens glow (emissive twin of the sheet drawn
//               additively, the nearest few cast a faint light), shots spark
//               them and make the screen flicker
// Hot paths (update / submit) do not allocate: sprites go through addRaw.
import { F, DIR_X, DIR_Z } from './grid.js';
import { MODE } from './spritebatch.js';
import { fx, Rng } from '../core/rng.js';
import { ELEMENTS } from '../data/elements.js';
import { RARITY } from '../data/rarities.js';
import {
  SIZE, DAMAGED_AT, EXPLODE_FRAME_TIME, SPIKE_TIMING, SPIKE_TIMING_CHOKE, explosiveStats, chainDelay, spikeState, spikeDamage,
  pickScatterObject, sizeFromPx, pedestalMinRarity, PEDESTAL_KINDS, TERM_WALL, terminalSize, terminalFits, wallTerminalSize, pickTerminal,
} from '../data/scatter.js';
import { explode, damagePlayer, damageMonster, applyStatus, itemGlowColor } from './combat.js';
import { generateItem, rollItemLevel } from './items.js';

const DRAW_DIST2 = 60 * 60;
const GONE = -1e5;                     // collider y of a destroyed explosive (never collides)
const TRAP_HALF = 0.42;                // spike plate reach from the cell centre
const ELEM_STATUS = { fire: 'burn', ice: 'chill', poison: 'poison', void: 'rend', lightning: null };
const TERM_LIGHTS = 3;                 // closest screens that light their surroundings
const TERM_LIGHT_D2 = 11 * 11;
const FLICKER_T = 0.6;                 // screen flicker after a hit (s)
const BB_WALLX = 3, BB_WALLZ = 4;      // sprite billboard modes: wall plane x = const / z = const
const SPARK = [1, 0.82, 0.42];

export class Scatter {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    const S = world.level.scatter || {};
    const depth = Math.max(1, world.depth || 1);
    this.depth = depth;
    this.pillars = (S.pillars || []).map((p) => ({ ...p, obj: null, w: 0, h: p.h, light: 0.8 }));
    this.explosives = (S.explosives || []).map((e, k) => {
      const st = explosiveStats(depth, {});
      return { ...e, k, obj: null, hp: st.hp, maxHp: st.hp, stats: st, element: (e.elements && e.elements[0]) || 'fire', state: 'intact', t: 0, light: 0.8, scale: 1 };
    });
    this.pedestals = (S.pedestals || []).map((p) => ({ ...p, obj: null, item: null, taken: false, icon: null, light: 0.8 }));
    this.traps = (S.traps || []).map((t) => ({ ...t, obj: null, timing: t.choke ? SPIKE_TIMING_CHOKE : SPIKE_TIMING, stage: -1, frame: 0, cycle: -1, pHit: -1, element: 'physical', light: 0.8, scale: 1 }));
    this.chestStyle = S.chest || { style: 'tech', hues: null };
    this.chestPairs = null;
    // terminals: free-standing consoles + wall panels in one list (k = index)
    const term = (t, k, wall) => ({ ...t, k, panel: wall, obj: null, w: 0, h: 0, cy: 0, px: t.x ?? 0, pz: t.z ?? 0, light: 0.8, glowK: 0.6, hitT: -9, zapT: -9, lamp: null });
    this.terms = (S.terminals || []).map((t, k) => term(t, k, false));
    for (const t of S.wallTerminals || []) this.terms.push(term(t, this.terms.length, true));
    // collider index -> explosive / terminal (projectiles / hitscan report the box they hit)
    this.boxOwner = new Int32Array(Math.max(1, world.nBoxes || 0)).fill(-1);
    for (const e of this.explosives) if (e.ci >= 0 && e.ci < this.boxOwner.length) this.boxOwner[e.ci] = e.k;
    this.boxTerm = new Int32Array(Math.max(1, world.nBoxes || 0)).fill(-1);
    for (const t of this.terms) if (t.ci >= 0 && t.ci < this.boxTerm.length) this.boxTerm[t.ci] = t.k;
    this._st = { stage: 0, frame: 0, k: 0, cycle: 0 };
    this._near = new Int32Array(TERM_LIGHTS);
    this._nearD = new Float32Array(TERM_LIGHTS);
  }

  // ------------------------------------------------------------------ art
  // Pick the sprite of every object (theme styles, stable seeds) and work out
  // world sizes. Without art (node tests) everything still plays.
  bind(content) {
    const sc = content && content.scatter;
    if (!sc) return;
    const g = this.world.grid;
    const lightAt = (x, z) => { const i = g.cellAt(x, z); return i >= 0 ? Math.min(1.25, g.light[i] * 1.05 + 0.05) : 0.8; };
    for (const p of this.pillars) {
      const pool = (sc.pillar || []).filter((o) => o.size === p.size);
      p.obj = pickScatterObject(pool.length ? pool : sc.pillar, p.styles, p.seed);
      if (p.obj) { const f = p.obj.frames[0]; p.w = p.h * f.aspect; }
      p.light = lightAt(p.x, p.z);
    }
    const ex = sc.explosive || [];
    for (const e of this.explosives) {
      const filt = (o) => (!e.elements || e.elements.includes(o.element)) && (!e.tags || e.tags.some((t) => o.tags?.includes(t)));
      e.obj = pickScatterObject(ex, e.styles, e.seed, filt);
      if (e.obj) {
        e.element = e.obj.element || e.element;
        e.stats = explosiveStats(this.depth, e.obj);
        e.hp = e.maxHp = e.stats.hp;
        e.scale = sizeFromPx(e.obj.px, sc.range.explosive[0], sc.range.explosive[1], SIZE.explosive) / e.obj.px;
      }
      e.light = lightAt(e.x, e.z);
    }
    for (const p of this.pedestals) {
      p.obj = pickScatterObject(sc.pedestal, p.styles, p.seed);
      p.light = lightAt(p.x, p.z);
    }
    for (const t of this.traps) {
      t.obj = pickScatterObject(sc.spike, t.styles, t.seed);
      if (t.obj) { t.scale = SIZE.spikeWidth / t.obj.pxW; t.element = t.obj.element || 'physical'; }
      t.light = lightAt(t.x, t.z);
    }
    // terminals: art that suits the slot in the theme's styles, sized from the
    // sheet; colliders fitted to the sprite; a lamp object each (reused)
    const tr = sc.terminal || [], tw = sc.terminal_wall || [], range = sc.range.terminal;
    const B = this.world.box, nB = this.world.nBoxes || 0;
    // the same machine at most twice per level while the styles have others
    const used = new Map();
    const pickVaried = (list, styles, seed, fits) => {
      let best = null, bestN = 1e9;
      for (let k = 0; k < 6; k++) {
        const o = pickTerminal(list, styles, (seed + k * 7919) | 0, fits);
        if (!o) return null;
        const c = used.get(o.id) || 0;
        if (c < bestN) { best = o; bestN = c; }
        if (c < 2) break;
      }
      used.set(best.id, bestN + 1);
      return best;
    };
    for (const t of this.terms) {
      const q = t.ci >= 0 && t.ci < nB ? t.ci * 6 : -1;
      const nx = t.wall >= 0 ? -DIR_X[t.wall] : 0, nz = t.wall >= 0 ? -DIR_Z[t.wall] : 0;   // into the room
      if (t.panel) {
        t.obj = pickVaried(tw, t.styles, t.seed);
        if (!t.obj) continue;
        const s = wallTerminalSize(t.obj, t.maxW, Math.min(TERM_WALL.maxH, t.hi - t.lo));
        t.w = s.w; t.h = s.h;
        t.cy = Math.min(t.hi - t.h / 2, Math.max(t.lo + t.h / 2, t.y + TERM_WALL.centre + (t.dy || 0)));
        // the panel plane: a hair off the wall (and off any trim skin under it)
        const o = t.off + TERM_WALL.off;
        t.px = t.wall < 2 ? t.line + nx * o : t.along;
        t.pz = t.wall < 2 ? t.along : t.line + nz * o;
        if (q >= 0) {
          if (t.wall < 2) { B[q + 2] = t.along - t.w / 2; B[q + 5] = t.along + t.w / 2; } else { B[q] = t.along - t.w / 2; B[q + 3] = t.along + t.w / 2; }
          B[q + 1] = t.cy - t.h / 2; B[q + 4] = t.cy + t.h / 2;
        }
        t.light = lightAt(t.px + nx * 0.5, t.pz + nz * 0.5);
        t.lamp = { x: t.px + nx * 0.45, y: t.cy, z: t.pz + nz * 0.45, r: 0, g: 0, b: 0, radius: 2.6, intensity: 0 };
      } else {
        const fits = (o) => terminalFits(o, t.slot, range), tagged = (o) => !t.tags || t.tags.some((tg) => o.tags?.includes(tg));
        let o = t.tags ? pickVaried(tr, t.styles, t.seed, (x) => fits(x) && tagged(x)) : null;
        if (!o || !fits(o) || !tagged(o)) o = pickVaried(tr, t.styles, t.seed, fits);
        t.obj = o;
        if (!o) continue;
        const s = terminalSize(o, t.slot, range, t.maxH);
        t.w = s.w; t.h = s.h;
        if (q >= 0) B[q + 4] = t.y + Math.min(t.maxH, t.h * 0.92);
        t.light = lightAt(t.x, t.z);
        t.lamp = { x: t.x + nx * 0.4, y: t.y + t.h * 0.75, z: t.z + nz * 0.4, r: 0, g: 0, b: 0, radius: 2.6, intensity: 0 };
      }
      // lamp in the screen colour (brightest channel 1); glow stronger in dark rooms
      const lc = t.obj.light || [80, 200, 255], m = Math.max(lc[0], lc[1], lc[2], 1);
      t.lamp.r = lc[0] / m; t.lamp.g = lc[1] / m; t.lamp.b = lc[2] / m;
      t.glowK = 0.62 * Math.min(1, Math.max(0.4, 1.35 - t.light));
    }
    // chests: closed / open pairs of the theme's style (hue preference for tech chests)
    const chests = sc.chest || [];
    const cs = this.chestStyle;
    let pairs = chests.filter((o) => o.style === cs.style && (!cs.hues || cs.hues.includes(o.hue)));
    if (!pairs.length) pairs = chests.filter((o) => o.style === cs.style);
    this.chestPairs = pairs.length ? pairs : chests;
    this.chestRange = sc.range.chest;
    this.content = content;
  }

  // the special item on each pedestal (rare+, better deeper); needs the
  // player's level and the weapon bases, so it is rolled when the level starts
  stockPedestals(playerLevel, bases, itemFind = 0) {
    for (const p of this.pedestals) {
      const rng = new Rng(p.itemSeed || 1);
      const minRarity = pedestalMinRarity(this.depth, p.r01 ?? 0.5);
      const kind = rng.weighted(PEDESTAL_KINDS, (x) => x.w).k;
      p.item = generateItem(rng, { kind, level: rollItemLevel(rng, playerLevel) + 1, bases, depth: this.depth, itemFind: itemFind + 0.5, minRarity });
      p.icon = null;
    }
  }

  // ------------------------------------------------------------------ explosives
  // a shot / projectile hit collider b: damage the explosive it belongs to
  hitBox(b, dmg, element) {
    if (b < 0 || b >= this.boxOwner.length) return false;
    const k = this.boxOwner[b];
    if (k >= 0) { this.damageExplosive(this.explosives[k], dmg, element); return true; }
    const tk = this.boxTerm[b];
    if (tk >= 0) { this.zapTerminal(this.terms[tk]); return true; }
    return false;
  }
  // a terminal took a hit: sparks off its front and a stuttering screen
  // (they are not destructible)
  zapTerminal(tm) {
    if (!tm.obj) return;
    const w = this.world, t = w.time;
    tm.hitT = t;
    if (t - tm.zapT < 0.12) return;          // rapid fire: one shower per burst
    tm.zapT = t;
    const nx = tm.wall >= 0 ? -DIR_X[tm.wall] : 0, nz = tm.wall >= 0 ? -DIR_Z[tm.wall] : 0;
    const x = (tm.panel ? tm.px : tm.x) + nx * 0.12, z = (tm.panel ? tm.pz : tm.z) + nz * 0.12;
    const y = tm.panel ? tm.cy : tm.y + tm.h * 0.62;
    w.burst(x, y, z, SPARK, 9, { speed: 4.5, up: 1.2, life: 0.4, size: 0.045, gravity: 11, drag: 0.8 });
    const L = tm.lamp;
    if (L) w.flash(x, y, z, [L.r, L.g, L.b], 2.2, 0.1, 1.1);
    this.game.sfx('zap', { dist: this.distP({ x, z }), pitch: 1.3 });
  }
  // terminals near a blast or in front of a melee swing flicker and spark too
  zapNear(x, y, z, r) {
    for (const tm of this.terms) {
      if (!tm.obj) continue;
      const dx = (tm.panel ? tm.px : tm.x) - x, dz = (tm.panel ? tm.pz : tm.z) - z, dy = (tm.panel ? tm.cy : tm.y + tm.h * 0.5) - y;
      if (dx * dx + dy * dy + dz * dz < r * r) this.zapTerminal(tm);
    }
  }
  damageExplosive(e, dmg, element) {
    if (e.state !== 'intact' || !(dmg > 0)) return;
    const was = e.hp;
    e.hp -= dmg;
    const w = this.world;
    w.burst(e.x, e.y + 0.55, e.z, [1, 0.75, 0.35], 4, { speed: 3, life: 0.3, size: 0.06 });
    if (was >= e.maxHp * DAMAGED_AT && e.hp < e.maxHp * DAMAGED_AT && e.hp > 0) this.game.sfx('hit_metal', { dist: this.distP(e), pitch: 0.7 });
    if (e.hp <= 0) this.ignite(e, 0.05 + fx.float(0, 0.05));
    void element;
  }
  ignite(e, delay) {
    if (e.state !== 'intact') return;
    e.state = 'fuse';
    e.t = delay;
  }
  // explosion of any kind at (x, y, z): set off explosives in reach (chain reactions)
  blast(x, y, z, radius, dmg, src) {
    const w = this.world;
    if (this.terms.length) this.zapNear(x, y, z, radius * 0.8);
    for (const e of this.explosives) {
      if (e === src || e.state !== 'intact') continue;
      const dx = e.x - x, dz = e.z - z, dy = (e.y + 0.5) - y;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius + 0.45) continue;
      // walls stop the blast (the explosive's own collider is fine)
      const len = d || 1;
      const hd = w.castRay(x, y, z, dx / len, dy / len, dz / len, Math.max(0, d - 0.05));
      if (hd >= 0 && w.rayHit.box !== e.ci) continue;
      e.hp -= dmg * (1 - Math.min(1, d / (radius + 0.45)) * 0.5);
      if (e.hp <= 0) this.ignite(e, chainDelay(d, fx.next()));
    }
  }
  // melee swing (player): hits explosives in front within range
  melee(px, pz, py, yaw, range, arc, dmg, element) {
    if (this.terms.length) this.zapNear(px + Math.cos(yaw) * range * 0.6, py + 1.1, pz + Math.sin(yaw) * range * 0.6, range * 0.55);
    for (const e of this.explosives) {
      if (e.state !== 'intact') continue;
      const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz);
      if (d > range + 0.35 || e.y > py + 1.6 || e.y + 1 < py - 0.4) continue;
      const a = Math.atan2(dz, dx) - yaw;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > arc / 2 && d > 0.8) continue;
      this.damageExplosive(e, dmg, element);
    }
  }
  detonate(e) {
    const g = this.game, w = this.world;
    e.state = 'boom';
    e.t = 0;
    // the collider goes: what is left is a non-solid debris pile
    if (e.ci >= 0 && e.ci < w.nBoxes) {
      const o = e.ci * 6;
      w.box[o + 1] = GONE; w.box[o + 4] = GONE;
      this.boxOwner[e.ci] = -1;
      this.freeCell(e.cell);
    }
    const st = e.stats, el = e.element || 'fire';
    const col = e.obj?.light ? [e.obj.light[0] / 255, e.obj.light[1] / 255, e.obj.light[2] / 255] : (ELEMENTS[el]?.light || [1, 0.6, 0.2]);
    explode(g, e.x, e.y + 0.55, e.z, st.radius, st.monsterDmg, el, 'world', { playerDmg: st.playerDmg, color: col, statusChance: 0.6, src: e });
    // flying scrap + embers in the explosive's colour
    w.burst(e.x, e.y + 0.6, e.z, [0.18, 0.16, 0.15], 10, { speed: 6, life: 1.1, size: 0.09, add: false, gravity: 12, drag: 0.3 });
    w.burst(e.x, e.y + 0.6, e.z, col, 16, { speed: 7, life: 0.9, size: 0.07, gravity: 6 });
    if (el === 'lightning') w.beam(e.x, e.y + 0.5, e.z, e.x + fx.float(-2, 2), e.y + fx.float(0.5, 2), e.z + fx.float(-2, 2), [0.7, 0.85, 1], 0.08, 0.25, 0.4);
    g.sfx('barrel', { dist: this.distP(e) });
  }
  // a destroyed explosive no longer blocks its cell (unless something else does)
  freeCell(cell) {
    const w = this.world, g = w.grid;
    if (cell === undefined || cell < 0) return;
    const B = w.box, st = w.boxStart, L = w.boxList;
    const x = cell % g.w, z = (cell / g.w) | 0;
    for (let k = st[cell], ke = st[cell + 1]; k < ke; k++) {
      const o = L[k] * 6;
      if (B[o + 4] <= GONE + 1) continue;
      const cover = Math.max(0, Math.min(x + 1, B[o + 3]) - Math.max(x, B[o])) * Math.max(0, Math.min(z + 1, B[o + 5]) - Math.max(z, B[o + 2]));
      if (cover >= 0.3 && B[o + 4] > g.minFloor(cell) + 0.55) return;
    }
    g.flags[cell] &= ~F.OBSTACLE;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.game, w = this.world, p = g.player;
    for (const e of this.explosives) {
      if (e.state === 'fuse') {
        e.t -= dt;
        if (fx.chance(0.5)) w.addParticle({ x: e.x + fx.float(-0.2, 0.2), y: e.y + fx.float(0.4, 0.9), z: e.z + fx.float(-0.2, 0.2), vx: fx.float(-1, 1), vy: fx.float(1, 3), vz: fx.float(-1, 1), life: 0.3, age: 0, size: 0.05, color: [1, 0.8, 0.3], gravity: 6, cell: 0, add: true, drag: 0.5 });
        if (e.t <= 0) this.detonate(e);
      } else if (e.state === 'boom') {
        e.t += dt;
        if (e.t >= EXPLODE_FRAME_TIME) e.state = 'debris';
      }
    }
    if (!this.traps.length) return;
    const st = this._st, t = w.time;
    for (const tr of this.traps) {
      spikeState(t, tr.phase, tr.timing, st);
      if (st.stage !== tr.stage) {
        const d = p ? Math.hypot(tr.x - p.x, tr.z - p.z) : 99;
        if (st.stage === 1 && d < 12) g.sfx('spike_warn', { dist: d });
        else if (st.stage === 2 && d < 16) g.sfx('spike_trap', { dist: d });
        tr.stage = st.stage;
      }
      tr.frame = st.frame;
      if (st.stage === 2) this.trapHits(tr, st.cycle);
    }
  }

  // whatever stands on an extended spike plate gets hurt (once per cycle)
  trapHits(tr, cycle) {
    const g = this.game, w = this.world, p = g.player;
    const el = tr.element || 'physical';
    if (p && !p.dead && tr.pHit !== cycle && p.onGround && Math.abs(p.y - tr.y) < 0.3 &&
        Math.abs(p.x - tr.x) < TRAP_HALF + p.radius * 0.4 && Math.abs(p.z - tr.z) < TRAP_HALF + p.radius * 0.4) {
      tr.pHit = cycle;
      damagePlayer(g, spikeDamage(this.depth, false), el, { status: ELEM_STATUS[el] || undefined });
      p.burnT = Math.max(p.burnT || 0, 2.5);           // bleeding
      w.burst(p.x, p.y + 0.3, p.z, [0.6, 0.02, 0.02], 10, { speed: 2.5, up: 2, life: 0.6, size: 0.07, add: false });
    }
    for (const m of w.monsters) {
      if (m.dead || m.def.flying || m.mode !== 'floor') continue;
      if (Math.abs(m.y - tr.y) > 0.3 || Math.abs(m.x - tr.x) > TRAP_HALF + m.radius * 0.4 || Math.abs(m.z - tr.z) > TRAP_HALF + m.radius * 0.4) continue;
      if (m.trapRef === tr && m.trapCycle === cycle) continue;
      m.trapRef = tr; m.trapCycle = cycle;
      const dmg = spikeDamage(this.depth, true) * (m.boss ? 0.4 : 1);
      damageMonster(g, m, dmg, { element: el, noProc: true });
      if (!m.dead) applyStatus(g, m, 'bleed', dmg);
      if (!m.dead && ELEM_STATUS[el]) applyStatus(g, m, ELEM_STATUS[el], dmg);
    }
  }

  // ------------------------------------------------------------------ interactions
  // USE prompts (pedestal items) - consider(distance, prompt) from game.updateInteractions
  interactions(consider) {
    const p = this.game.player;
    for (const ped of this.pedestals) {
      if (ped.taken || !ped.item) continue;
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (d > 1.9 || Math.abs((ped.y + ped.h) - (p.y + 1)) > 2.2) continue;
      const r = RARITY[ped.item.rarity];
      if (!ped.prompt) ped.prompt = { text: `[E] Take ${ped.item.name} (${r.name || ped.item.rarity})`, short: 'TAKE', act: () => this.takePedestal(ped) };
      consider(d - 0.4, ped.prompt);
    }
  }
  takePedestal(ped) {
    const g = this.game;
    if (ped.taken || !ped.item) return;
    if (!g.collect({ kind: 'item', item: ped.item })) return;      // bag full: stays on the pedestal
    ped.taken = true;
    const col = itemGlowColor(ped.item);
    this.world.burst(ped.x, ped.y + ped.h + 0.4, ped.z, col, 24, { speed: 3, up: 2, life: 0.8 });
    this.world.flash(ped.x, ped.y + ped.h + 0.5, ped.z, col, 5, 0.5, 1.6);
  }
  chestLabel() { return this.chestStyle.style === 'skull' ? 'bone chest' : 'cybernetic chest'; }

  // ------------------------------------------------------------------ rendering
  lights(out) {
    for (const ped of this.pedestals) {
      if (ped.taken || !ped.item) continue;
      const c = itemGlowColor(ped.item);
      out.push({ x: ped.x, y: ped.y + ped.h + 0.5, z: ped.z, r: c[0], g: c[1], b: c[2], radius: 3.2, intensity: 0.9 });
    }
    // the closest few screens cast a faint light in their colour (reused lamp objects)
    const p = this.game.player;
    if (!this.terms.length || !p) return;
    const near = this._near, nd = this._nearD;
    near.fill(-1); nd.fill(TERM_LIGHT_D2);
    for (const tm of this.terms) {
      const L = tm.lamp;
      if (!L) continue;
      const dx = L.x - p.x, dz = L.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 >= nd[TERM_LIGHTS - 1]) continue;
      let j = TERM_LIGHTS - 1;
      while (j > 0 && nd[j - 1] > d2) { nd[j] = nd[j - 1]; near[j] = near[j - 1]; j--; }
      nd[j] = d2; near[j] = tm.k;
    }
    const t = this.world.time;
    for (let j = 0; j < TERM_LIGHTS && near[j] >= 0; j++) {
      const tm = this.terms[near[j]], ht = t - tm.hitT;
      tm.lamp.intensity = ht < FLICKER_T ? (Math.sin(ht * 70 + tm.k) > 0.2 ? 0.75 : 0.04) : 0.4;
      out.push(tm.lamp);
    }
  }

  submit(b, cam) {
    const c = this.content;
    if (!c) return;
    const t = this.world.time;
    for (const p of this.pillars) {
      const o = p.obj;
      if (!o || !near(cam, p.x, p.z)) continue;
      const f = o.frames[0];
      b.addRaw(o.handle, MODE.CUTOUT, p.x, p.y, p.z, p.w, p.h, f.uv[0], f.uv[1], f.uv[2], f.uv[3], 1, 1, 1, 1, 0, 0, false, p.light, 0);
    }
    for (const e of this.explosives) {
      const o = e.obj;
      if (!o || !near(cam, e.x, e.z)) continue;
      let fi = 0, sc = e.scale, fb = false, tint = 1;
      if (e.state === 'intact') fi = e.hp < e.maxHp * DAMAGED_AT ? 1 : 0;
      else if (e.state === 'fuse') { fi = 1; tint = 1.2 + 0.5 * Math.sin(t * 60); }
      else if (e.state === 'boom') { fi = 2; sc *= SIZE.explodeScale; fb = true; }
      else fi = 3;
      const f = o.frames[Math.min(fi, o.frames.length - 1)];
      b.addRaw(o.handle, MODE.CUTOUT, e.x, e.y, e.z, f.pw * sc, f.ph * sc, f.uv[0], f.uv[1], f.uv[2], f.uv[3], tint, tint, tint, 1, 0, 0, fb, e.light, 0);
      if (e.state === 'boom') {
        const k = 1 - e.t / EXPLODE_FRAME_TIME, lc = o.light || [255, 160, 60];
        b.addRaw(c.fx, MODE.ADD, e.x, e.y + 0.6, e.z, 2.6, 2.6, 0, 0, 0.25, 1, lc[0] / 255, lc[1] / 255, lc[2] / 255, 0.7 * k, 0, 0.5, true, 1, 1);
      }
    }
    for (const p of this.pedestals) {
      const o = p.obj;
      if (!o || !near(cam, p.x, p.z)) continue;
      const f = o.frames[0], sc = p.h / f.ph;
      b.addRaw(o.handle, MODE.CUTOUT, p.x, p.y, p.z, f.pw * sc, p.h, f.uv[0], f.uv[1], f.uv[2], f.uv[3], 1, 1, 1, 1, 0, 0, false, p.light, 0);
      if (p.taken || !p.item) continue;
      // the item floats and bobs above the pedestal with its rarity glow / beam
      if (!p.icon) { p.icon = c.itemIconGL(p.item); p.glow = itemGlowColor(p.item); p.rar = RARITY[p.item.rarity].index; }
      const ic = p.icon, col = p.glow, top = p.y + p.h;
      const bob = Math.sin(t * 2.2 + p.x) * 0.08, iy = top + 0.28 + bob;
      const wid = p.item.kind === 'weapon' ? 0.8 : 0.5, hgt = wid * ic.h / ic.w;
      b.addRaw(c.fx, MODE.ADD, p.x, top - 0.05, p.z, 0.3 + p.rar * 0.05, 1.8 + p.rar * 0.4, 0.75, 0, 1, 1, col[0], col[1], col[2], 0.3 + p.rar * 0.07, 0, 0, true, 1, 0);
      b.addRaw(c.fx, MODE.ADD, p.x, iy + hgt * 0.5, p.z, 1.1, 1.1, 0, 0, 0.25, 1, col[0], col[1], col[2], 0.45 + 0.15 * Math.sin(t * 4), 0, 0.5, true, 1, 1);
      b.addRaw(ic.handle, MODE.CUTOUT, p.x, iy, p.z, wid, hgt, ic.uv[0], ic.uv[1], ic.uv[2], ic.uv[3], 1.1, 1.1, 1.1, 1, 0, 0, true, 1, 0);
    }
    for (const tr of this.traps) {
      const o = tr.obj;
      if (!o || !near(cam, tr.x, tr.z)) continue;
      const f = o.frames[Math.min(tr.frame, o.frames.length - 1)], sc = tr.scale;
      const glow = o.light && o.tags?.includes('glow');
      b.addRaw(o.handle, MODE.CUTOUT, tr.x, tr.y - 0.02, tr.z, f.pw * sc, f.ph * sc, f.uv[0], f.uv[1], f.uv[2], f.uv[3], 1, 1, 1, 1, 0, 0, !!glow && tr.frame > 0, tr.light, 0);
    }
    for (const tm of this.terms) {
      const o = tm.obj;
      if (!o || !near(cam, tm.px, tm.pz)) continue;
      const f = o.frames[0];
      // the screen breathes a little; after a hit it stutters and the casing dims
      let gk = tm.glowK * (0.9 + 0.1 * Math.sin(t * 2.3 + tm.k * 1.7)), tint = 1;
      const ht = t - tm.hitT;
      if (ht < FLICKER_T) { const on = Math.sin(ht * 70 + tm.k) > 0.2; gk *= on ? 1.7 : 0.06; tint = on ? 1.05 : 0.78; }
      if (tm.panel) {
        // flat on the wall plane, u running to the viewer's right (never mirrored)
        const flip = tm.wall === 1 || tm.wall === 2, mode = tm.wall < 2 ? BB_WALLX : BB_WALLZ;
        const u0 = flip ? f.uv[2] : f.uv[0], u1 = flip ? f.uv[0] : f.uv[2];
        b.addRaw(o.handle, MODE.CUTOUT, tm.px, tm.cy, tm.pz, tm.w, tm.h, u0, f.uv[1], u1, f.uv[3], tint, tint, tint, 1, 0, 0.5, false, tm.light, mode);
        if (o.glow) b.addRaw(o.glow, MODE.ADD, tm.px, tm.cy, tm.pz, tm.w, tm.h, u0, f.uv[1], u1, f.uv[3], gk, gk, gk, 1, 0, 0.5, true, 1, mode);
        continue;
      }
      let w = tm.w;
      if (tm.wall >= 0) {
        // turned toward a glancing view, the camera-facing sprite would cut
        // into the wall behind it: it narrows instead (reads like the
        // console's foreshortened side)
        const vx = cam.x - tm.x, vz = cam.z - tm.z, len = Math.sqrt(vx * vx + vz * vz) || 1;
        const sn = Math.abs(DIR_X[tm.wall] * vz - DIR_Z[tm.wall] * vx) / len;
        w = Math.min(w, 2 * (tm.gap - 0.03) / Math.max(0.05, sn));
      }
      b.addRaw(o.handle, MODE.CUTOUT, tm.x, tm.y, tm.z, w, tm.h, f.uv[0], f.uv[1], f.uv[2], f.uv[3], tint, tint, tint, 1, 0, 0, false, tm.light, 0);
      if (o.glow) b.addRaw(o.glow, MODE.ADD, tm.x, tm.y, tm.z, w, tm.h, f.uv[0], f.uv[1], f.uv[2], f.uv[3], gk, gk, gk, 1, 0, 0, true, 1, 0);
    }
  }

  // closed / open chest sprite for a game.js chest; false if no art
  drawChest(b, ch) {
    const pairs = this.chestPairs;
    if (!pairs || !pairs.length) return false;
    if (!ch.sprite) {
      ch.sprite = pairs[((ch.cell ?? Math.floor(ch.x * 31 + ch.z * 17)) * 2654435761 >>> 0) % pairs.length];
      const r = this.chestRange;
      ch.scale = sizeFromPx(ch.sprite.px, r[0], r[1], SIZE.chestClosed) / ch.sprite.px;
      const g = this.world.grid, i = g.cellAt(ch.x, ch.z);
      ch.light = i >= 0 ? Math.min(1.25, g.light[i] * 1.05 + 0.05) : 0.8;
    }
    const o = ch.sprite, f = o.frames[ch.open ? 1 : 0], sc = ch.scale;
    b.addRaw(o.handle, MODE.CUTOUT, ch.x, ch.y, ch.z, f.pw * sc, f.ph * sc, f.uv[0], f.uv[1], f.uv[2], f.uv[3], 1, 1, 1, 1, 0, 0, false, ch.light, 0);
    return true;
  }
  chestGlow(ch) {
    const l = ch.sprite?.light;
    return l ? [l[0] / 255, l[1] / 255, l[2] / 255] : (this.chestStyle.style === 'skull' ? [1, 0.25, 0.15] : [0.2, 0.8, 1]);
  }

  distP(e) { const p = this.game.player; return p ? Math.hypot(e.x - p.x, e.z - p.z) : 0; }
}

function near(cam, x, z) { const dx = x - cam.x, dz = z - cam.z; return dx * dx + dz * dz < DRAW_DIST2; }
