// Level map + radar for the MAP tab of the equipment screen.
//  - static layer: floors shaded in height bands, walls, ledges, rails, voids,
//    pits, hazards, stairs, bridges and obstacles. Drawn once per level (and
//    per cell size) into an offscreen canvas that survives re-openings.
//  - radar layer: doors (they unlock), range rings + sweep around the player,
//    blips for monsters / elites / the boss, the portal, keys on the ground,
//    chests, relic pedestals, the crew in the hub and the player arrow.
//    Redrawn every animation frame while mounted. mount() starts the loop,
//    unmount() stops it and drops every listener; UI.close() calls unmount
//    whenever the inventory re-renders, changes tab or closes.
// Map axes: world +x -> right, +z -> down. The camera looks along
// (cos yaw, sin yaw) with its right side at (-sin yaw, cos yaw), so this is
// the un-mirrored top-down view and the player arrow is simply `yaw`.
import { F, HAZ, OPP, EDGE_BIT } from '../game/grid.js';
import { KEY_HEX } from '../game/levelgen/common.js';
import { RARITY } from '../data/rarities.js';

const TAU = Math.PI * 2;
const FONT = 'Silkscreen, monospace';
const SWEEP_T = 3.2;                 // seconds per sweep revolution
const TRAIL = 1.2, TRAIL_N = 14;     // sweep afterglow (radians), drawn as stepped wedges
const RING_STEP = 10;                // range ring spacing in cells (1 cell = 1 m)
const ZOOMS = [1, 2, 3, 4];          // integer blow-ups of the cached layer keep pixels crisp
const PAD = 6;                       // css px of breathing room around the fitted map
const OUT8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// palette: the UI's dark violet panels, blood red, gold; the sweep is phosphor green-cyan
const BANDS = [[34, 30, 46], [44, 39, 58], [55, 49, 71], [67, 60, 85], [80, 72, 100], [95, 86, 116], [111, 101, 133], [129, 118, 152]];
const C = {
  bg: '#09080c', wall: '#1b1622', wallEdge: '#a593bd', wallEdgeDim: '#4a3f5a', void: [6, 5, 9], voidDot: '#221d2e',
  shadow: '#050407', rail: '#e2d4f0', obstacle: [24, 20, 30], obsHi: '#5a4d6b', obsLo: '#0b090e',
  bridge: [150, 116, 72], water: [44, 98, 204], arena: [255, 40, 40], outdoor: [70, 92, 112],
  enemy: '#ff3a3a', elite: '#ffa424', boss: '#ff2a6a', portal: '#c9a6ff', portalDim: '#6c5a8e', chest: '#ffcc33',
  crew: '#8fffb0', tele: '#6ff0ff', door: '#b3a6c2',
};
const SWEEP = '111,255,214';
const HAZ_COL = {
  [HAZ.LAVA]: { base: [236, 92, 14], hi: '#ffc23a' },
  [HAZ.POISON]: { base: [66, 176, 30], hi: '#b6ff52' },
  [HAZ.WATER]: { base: [40, 92, 200], hi: '#86baff' },
  [HAZ.SPIKES]: { base: [106, 106, 116], hi: '#d6d6e0' },
};
const HAZ_KEY = { [HAZ.LAVA]: 'lava', [HAZ.POISON]: 'poison', [HAZ.WATER]: 'water', [HAZ.SPIKES]: 'spikes' };

// pixel icons ('.' clear, '#' main colour, 'o' dark, 'h' shade, '+' highlight)
const ICONS = {
  enemy: ['###', '###', '###'],
  minion: ['##', '##'],
  elite: ['..#..', '.###.', '##+##', '.###.', '..#..'],
  boss: ['.#####.', '#######', '#oo#oo#', '#oo#oo#', '###o###', '.#####.', '.#.#.#.'],
  portal: ['..###..', '.#...#.', '#..+..#', '#.+++.#', '#..+..#', '.#...#.', '..###..'],
  key: ['.##.....', '#..#####', '#..#.#.#', '.##.....'],
  chest: ['.#####.', '#hhhhh#', '#######', '#hh+hh#', '#hhhhh#', '#######'],
  relic: ['.#.', '#+#', '.#.'],
  crew: ['.###.', '.###.', '..#..', '#####', '..#..', '.#.#.', '#...#'],
};

const rgb = (a) => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (x, z) => ((x * 73856093) ^ (z * 19349663)) >>> 0;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ per-level analysis + static layer
const infoCache = new WeakMap();     // world -> crop box, height range, features present
const layerCache = new WeakMap();    // world -> { cell, canvas }

function levelInfo(world) {
  let I = infoCache.get(world);
  if (I) return I;
  const g = world.grid, n = g.w * g.h, has = {}, hs = [];
  let x0 = g.w, z0 = g.h, x1 = -1, z1 = -1;
  for (let i = 0; i < n; i++) {
    if (!g.type[i]) continue;
    const f = g.flags[i];
    if (f & F.VOID) { has.void = 1; continue; }
    const x = i % g.w, z = (i / g.w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    if (f & F.PIT) has.pit = 1;
    if ((f & (F.HAZARD | F.PIT)) && HAZ_KEY[g.hazType[i]]) has[HAZ_KEY[g.hazType[i]]] = 1;
    if (f & F.WATER) has.water = 1;
    if (f & F.STAIR) has.stair = 1;
    if (f & F.BRIDGE) has.bridge = 1;
    if (!(f & (F.PIT | F.HAZARD))) hs.push(g.stairDir[i] ? g.floor[i] - g.rise[i] * 0.5 : g.floor[i]);
  }
  if (x1 < 0) { x0 = 0; z0 = 0; x1 = g.w - 1; z1 = g.h - 1; }
  hs.sort((a, b) => a - b);
  // robust height range: a single deep shaft must not flatten every other floor into one band
  const lo = hs.length ? hs[Math.floor((hs.length - 1) * 0.03)] : 0, hi = hs.length ? hs[Math.floor((hs.length - 1) * 0.97)] : 0;
  I = { bx0: Math.max(0, x0 - 1), bz0: Math.max(0, z0 - 1), bx1: Math.min(g.w, x1 + 2), bz1: Math.min(g.h, z1 + 2), lo, hi, has };
  I.bw = I.bx1 - I.bx0; I.bh = I.bz1 - I.bz0;
  infoCache.set(world, I);
  return I;
}

function staticLayer(world, I, cell) {
  const hit = layerCache.get(world);
  if (hit && hit.cell === cell) return hit.canvas;
  const canvas = buildStatic(world, I, cell);
  layerCache.set(world, { cell, canvas });
  return canvas;
}

// One pass for cell fills, one for the lines between cells (walls, drops,
// ledges, rails). Cells are integer device-pixel squares when the map is big
// enough (cell >= 3), so every rect lands on whole pixels.
function buildStatic(world, I, cell) {
  const g = world.grid, W = g.w;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(I.bw * cell)); cv.height = Math.max(1, Math.round(I.bh * cell));
  const c = cv.getContext('2d');
  const u = Math.max(1, Math.round(cell / 7));
  const X = (x) => Math.round((x - I.bx0) * cell), Z = (z) => Math.round((z - I.bz0) * cell);
  const box = (x0, y0, x1, y1, col) => { if (x1 > x0 && y1 > y0) { c.fillStyle = col; c.fillRect(x0, y0, x1 - x0, y1 - y0); } };
  const span = I.hi - I.lo;
  const band = (h) => (span < 0.5 ? 3 : clamp(Math.round(((h - I.lo) / span) * 7), 0, 7));
  const kind = (x, z) => {             // 0 solid / outside, 1 void, 2 walkable
    if (x < 0 || z < 0 || x >= W || z >= g.h) return 0;
    const i = z * W + x;
    return !g.type[i] ? 0 : (g.flags[i] & F.VOID) ? 1 : 2;
  };
  const floorCol = (i, h) => {
    const f = g.flags[i];
    let col = BANDS[band(h)];
    if (f & F.OUTDOOR) col = mix(col, C.outdoor, 0.18);
    if (f & F.WATER) col = mix(col, C.water, 0.5);
    if (f & F.ARENA) col = mix(col, C.arena, 0.13);
    return col;
  };
  box(0, 0, cv.width, cv.height, C.bg);

  for (let z = I.bz0; z < I.bz1; z++) {
    for (let x = I.bx0; x < I.bx1; x++) {
      const i = z * W + x, k = kind(x, z);
      const x0 = X(x), x1 = X(x + 1), y0 = Z(z), y1 = Z(z + 1), cw = x1 - x0, ch = y1 - y0;
      if (k === 0) {
        // solid: wall mass only where it borders the level, deep rock stays background
        let near = false;
        for (const [dx, dz] of OUT8) if (kind(x + dx, z + dz)) { near = true; break; }
        if (near) box(x0, y0, x1, y1, C.wall);
        continue;
      }
      const f = g.flags[i], hv = hash(x, z);
      if (k === 1) {
        box(x0, y0, x1, y1, rgb(C.void));
        // sparse specks so the abyss reads as depth, not as unexplored wall
        if ((hv & 7) === 0 && cw > 2 * u) { const dx = x0 + (hv >> 3) % (cw - u), dy = y0 + (hv >> 7) % (ch - u); box(dx, dy, dx + u, dy + u, C.voidDot); }
        continue;
      }
      const hz = HAZ_COL[g.hazType[i]];
      if (f & F.PIT) {
        // deep pit: its (usually hazardous) bottom, darkened
        box(x0, y0, x1, y1, rgb(hz ? mix(hz.base, [0, 0, 0], 0.5) : [16, 12, 20]));
        if (hz && cw > 4 * u && (hv & 3) === 0) { const dx = (x0 + cw / 2 - u) | 0, dy = (y0 + ch / 2 - u) | 0; box(dx, dy, dx + u, dy + u, rgb(mix(hz.base, [0, 0, 0], 0.2))); }
        continue;
      }
      if ((f & F.HAZARD) && hz) {
        box(x0, y0, x1, y1, rgb(hz.base));
        if (cw >= 5 * u) {
          const ht = g.hazType[i];
          if (ht === HAZ.SPIKES) {
            // spike studs
            for (const [fx, fz] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) { const px = x0 + Math.round(cw * fx - u / 2), pz = y0 + Math.round(ch * fz - u / 2); box(px, pz, px + u, pz + u, hz.hi); }
          } else if (ht === HAZ.WATER) {
            const pz = y0 + Math.round(ch * (0.3 + ((hv >> 4) % 5) * 0.1)), px = x0 + Math.round(cw * 0.2);
            box(px, pz, px + Math.round(cw * 0.5), pz + u, hz.hi);
          } else {
            // lava / poison: bubbles
            for (let b = 0; b < 2; b++) { const px = x0 + ((hv >> (3 + b * 7)) % Math.max(1, cw - u)), pz = y0 + ((hv >> (6 + b * 9)) % Math.max(1, ch - u)); box(px, pz, px + u, pz + u, hz.hi); }
          }
        }
        continue;
      }
      if (g.stairDir[i]) {
        // steps across the ascent axis, brighter toward the top end
        const up = g.stairDir[i] - 1, alongX = up < 2, n = clamp(Math.floor((alongX ? cw : ch) / (3 * u)), 2, 4);
        for (let s = 0; s < n; s++) {
          const t0 = s / n, t1 = (s + 1) / n, h = g.floor[i] - g.rise[i] * (1 - (s + 0.5) / n);
          const col = rgb(floorCol(i, h));
          // s = 0 is the low end, opposite the ascent direction
          const a0 = up === 0 || up === 2 ? t0 : 1 - t1, a1 = up === 0 || up === 2 ? t1 : 1 - t0;
          if (alongX) box(x0 + Math.round(cw * a0), y0, x0 + Math.round(cw * a1), y1, col);
          else box(x0, y0 + Math.round(ch * a0), x1, y0 + Math.round(ch * a1), col);
        }
        // step noses
        if ((alongX ? cw : ch) / n >= 3 * u) {
          for (let s = 1; s < n; s++) {
            const a = Math.round((alongX ? cw : ch) * s / n);
            if (alongX) box(x0 + a, y0, x0 + a + u, y1, C.shadow); else box(x0, y0 + a, x1, y0 + a + u, C.shadow);
          }
        }
        continue;
      }
      const col = floorCol(i, g.floor[i]);
      if (f & F.BRIDGE) {
        // deck planks across the run
        const runX = (kind(x - 1, z) === 2) + (kind(x + 1, z) === 2) >= (kind(x, z - 1) === 2) + (kind(x, z + 1) === 2);
        const deck = mix(col, C.bridge, 0.55);
        box(x0, y0, x1, y1, rgb(deck));
        if (cw >= 6 * u) {
          const line = rgb(mix(deck, [0, 0, 0], 0.45));
          for (let s = 1; s < 3; s++) {
            const a = Math.round((runX ? cw : ch) * s / 3);
            if (runX) box(x0 + a, y0, x0 + a + u, y1, line); else box(x0, y0 + a, x1, y0 + a + u, line);
          }
        }
        continue;
      }
      box(x0, y0, x1, y1, rgb(col));
      if (f & F.WATER && cw >= 5 * u) { const pz = y0 + Math.round(ch * 0.55), px = x0 + Math.round(cw * 0.25); box(px, pz, px + Math.round(cw * 0.45), pz + u, '#86baff'); }
      if (f & F.OBSTACLE) {
        // solid deco (crates, pillars, machines): a bevelled block, merged with neighbouring blocks
        const ob = (dx, dz) => kind(x + dx, z + dz) === 2 && (g.flags[(z + dz) * W + x + dx] & F.OBSTACLE);
        const ins = Math.max(u, Math.round(cell * 0.14));
        const bx0 = ob(-1, 0) ? x0 : x0 + ins, bx1 = ob(1, 0) ? x1 : x1 - ins, by0 = ob(0, -1) ? y0 : y0 + ins, by1 = ob(0, 1) ? y1 : y1 - ins;
        box(bx0, by0, bx1, by1, rgb(C.obstacle));
        if (!ob(0, -1)) box(bx0, by0, bx1, by0 + u, C.obsHi);
        if (!ob(-1, 0)) box(bx0, by0, bx0 + u, by1, C.obsHi);
        if (!ob(0, 1)) box(bx0, by1 - u, bx1, by1, C.obsLo);
        if (!ob(1, 0)) box(bx1 - u, by0, bx1, by1, C.obsLo);
      }
    }
  }

  // ---- lines between cells
  const rail = [];
  for (let z = I.bz0; z < I.bz1; z++) {
    for (let x = I.bx0; x < I.bx1; x++) {
      const i = z * W + x, k = kind(x, z);
      if (!k) continue;
      const x0 = X(x), x1 = X(x + 1), y0 = Z(z), y1 = Z(z + 1);
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = z + (d === 2 ? 1 : d === 3 ? -1 : 0), nk = kind(nx, nz);
        // edge strip of a cell on side d, thickness t (inside the cell)
        const strip = (ax0, ay0, ax1, ay1, t, col) => {
          if (d === 0) box(ax1 - t, ay0, ax1, ay1, col); else if (d === 1) box(ax0, ay0, ax0 + t, ay1, col);
          else if (d === 2) box(ax0, ay1 - t, ax1, ay1, col); else box(ax0, ay0, ax1, ay0 + t, col);
        };
        if (nk === 0) {
          // wall face: bright line on the wall side of the boundary
          const sx0 = X(nx), sx1 = X(nx + 1), sy0 = Z(nz), sy1 = Z(nz + 1), col = k === 2 ? C.wallEdge : C.wallEdgeDim;
          if (d === 0) box(sx0, sy0, sx0 + u, sy1, col); else if (d === 1) box(sx1 - u, sy0, sx1, sy1, col);
          else if (d === 2) box(sx0, sy0, sx1, sy0 + u, col); else box(sx0, sy1 - u, sx1, sy1, col);
          continue;
        }
        if (k === 1 && nk === 2) { strip(x0, y0, x1, y1, 2 * u, C.shadow); continue; }   // drop shadow into the void
        if (k === 2 && nk === 2) {
          if (d === 0 || d === 2) {
            const j = nz * W + nx;
            const ea = g.edgeFloor(i, d), eb = g.edgeFloor(j, OPP[d]);
            if (Math.abs(ea - eb) > 0.6) {
              // ledge: highlight on the high side, shadow on the low side
              const hiSelf = ea > eb, nx0 = X(nx), nx1 = X(nx + 1), ny0 = Z(nz), ny1 = Z(nz + 1);
              const hiCol = rgb(BANDS[7]);
              if (d === 0) { box(x1 - u, y0, x1, y1, hiSelf ? hiCol : C.shadow); box(nx0, ny0, nx0 + u, ny1, hiSelf ? C.shadow : hiCol); }
              else { box(x0, y1 - u, x1, y1, hiSelf ? hiCol : C.shadow); box(nx0, ny0, nx1, ny0 + u, hiSelf ? C.shadow : hiCol); }
            }
          }
        }
        if ((d === 0 || d === 2) && (g.edge[i] & EDGE_BIT[d])) rail.push(d === 0 ? [x1 - (u >> 1), y0, x1 - (u >> 1) + u, y1] : [x0, y1 - (u >> 1), x1, y1 - (u >> 1) + u]);
      }
    }
  }
  for (const r of rail) box(r[0], r[1], r[2], r[3], C.rail);
  return cv;
}

// ------------------------------------------------------------------ pixel sprites
const spriteCache = new Map();
function sprite(name, pal, p, outline = '#050307') {
  const key = name + '|' + p + '|' + pal['#'] + '|' + (pal.o || '') + '|' + (pal.h || '') + '|' + (pal['+'] || '') + '|' + outline;
  let cv = spriteCache.get(key);
  if (cv) return cv;
  const rows = ICONS[name], w = rows[0].length, h = rows.length;
  cv = document.createElement('canvas');
  cv.width = (w + 2) * p; cv.height = (h + 2) * p;
  const c = cv.getContext('2d');
  if (outline) {
    c.fillStyle = outline;
    for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) if (rows[r][q] !== '.') c.fillRect(q * p, r * p, 3 * p, 3 * p);
  }
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) {
      const ch = rows[r][q];
      if (ch === '.') continue;
      c.fillStyle = pal[ch] || (ch === 'o' ? '#0a0608' : ch === '+' ? '#ffffff' : pal['#']);
      c.fillRect((q + 1) * p, (r + 1) * p, p, p);
    }
  }
  if (spriteCache.size > 300) spriteCache.clear();
  spriteCache.set(key, cv);
  return cv;
}
const shade = (hex, t) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return t < 0 ? rgb([r * (1 + t), g * (1 + t), b * (1 + t)]) : rgb([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
};

// ------------------------------------------------------------------ the view
export class LevelMap {
  constructor(game) {
    this.game = game;
    this.zi = 0;                 // zoom index into ZOOMS
    this.vcx = null; this.vcz = null;   // view centre in world units (null = fit)
    this.offs = [];
    this.raf = 0;
    this.frames = 0;
  }

  mount(wrap, side) {
    const g = this.game;
    this.world = g.world;
    this.wrap = wrap; this.side = side;
    this.cv = wrap.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.info = levelInfo(this.world);
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this.offs.push(() => el.removeEventListener(ev, fn, opt)); };
    for (const b of wrap.querySelectorAll('[data-zoom]')) on(b, 'click', () => this.zoomBy(+b.dataset.zoom));
    const ctr = wrap.querySelector('[data-center]');
    if (ctr) on(ctr, 'click', () => this.centerOnPlayer());
    // one finger / mouse drags the zoomed map, two fingers pinch through the
    // zoom steps, the wheel zooms about the cursor
    const ptrs = new Map(), local = (e) => { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr]; };
    const spread = () => { const [a, b] = [...ptrs.values()]; return [Math.hypot(a[0] - b[0], a[1] - b[1]), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    on(this.cv, 'pointerdown', (e) => {
      ptrs.set(e.pointerId, local(e));
      try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (ptrs.size === 2) { this.drag = null; this.pinch = spread()[0]; }
      else if (ptrs.size === 1 && ZOOMS[this.zi] > 1) this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: this.vcx, cz: this.vcz };
    });
    on(this.cv, 'pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, local(e));
      if (this.pinch && ptrs.size === 2) {
        const [d, mx, my] = spread(), r = d / this.pinch;
        if (r > 1.35 || r < 0.74) { this.zoomBy(r > 1 ? 1 : -1, mx, my); this.pinch = d; }
        return;
      }
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const k = this.cell * ZOOMS[this.zi] / this.dpr;
      this.vcx = d.cx - (e.clientX - d.x) / k; this.vcz = d.cz - (e.clientY - d.y) / k;
    });
    const end = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) this.pinch = 0;
      if (this.drag && this.drag.id === e.pointerId) this.drag = null;
    };
    on(this.cv, 'pointerup', end); on(this.cv, 'pointercancel', end);
    on(this.cv, 'wheel', (e) => {
      e.preventDefault();
      const r = this.cv.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1 : -1, (e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr);
    }, { passive: false });
    on(this.cv, 'dblclick', () => this.centerOnPlayer());
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(wrap); }
    on(window, 'resize', () => this.resize());
    this.fillSide();
    this.resize();
    this.tick = (now) => {
      if (!this.ctx) return;
      this.raf = requestAnimationFrame(this.tick);
      this.draw(now / 1000);
    };
    this.raf = requestAnimationFrame(this.tick);
    LevelMap.live++;
  }

  unmount() {
    if (!this.ctx) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
    for (const off of this.offs) off();
    this.offs = [];
    this.cv.width = this.cv.height = 0;   // hand the backing store back now (iOS Safari caps total canvas memory)
    this.ctx = null; this.cv = null; this.drag = null;
    LevelMap.live--;
  }

  // ---------------------------------------------------------------- layout
  resize() {
    if (!this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.max(1, Math.round(this.wrap.clientWidth * dpr)), H = Math.max(1, Math.round(this.wrap.clientHeight * dpr));
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    const I = this.info, pad = PAD * dpr;
    // the fitted (x1) map keeps clear of the zoom buttons along the right edge
    const ctl = this.wrap.querySelector('.map-ctl');
    this.fw = Math.max(W * 0.6, W - (ctl ? ctl.offsetWidth + 8 : 0) * dpr);
    let cell = Math.min((this.fw - 2 * pad) / I.bw, (H - 2 * pad) / I.bh);
    if (cell >= 3) cell = Math.floor(cell);
    this.cell = Math.max(0.5, cell);
    this.dpr = dpr; this.W = W; this.H = H;
    this.p = Math.max(2, Math.round(dpr * 1.5));          // device px per icon pixel
    this.layer = staticLayer(this.world, I, this.cell);
    this.updateZoomLabel();
  }

  // screen transform for the current zoom / pan: sx = ox + (wx - bx0) * k
  view() {
    const I = this.info, z = ZOOMS[this.zi], k = this.cell * z, m = PAD * this.dpr / k, VW = z === 1 ? this.fw : this.W;
    const hw = VW / 2 / k, hh = this.H / 2 / k;
    let cx = this.vcx ?? I.bx0 + I.bw / 2, cz = this.vcz ?? I.bz0 + I.bh / 2;
    cx = I.bw / 2 + m <= hw ? I.bx0 + I.bw / 2 : clamp(cx, I.bx0 - m + hw, I.bx1 + m - hw);
    cz = I.bh / 2 + m <= hh ? I.bz0 + I.bh / 2 : clamp(cz, I.bz0 - m + hh, I.bz1 + m - hh);
    if (z > 1) { this.vcx = cx; this.vcz = cz; } else { this.vcx = this.vcz = null; }
    return { z, k, ox: Math.round(VW / 2 - (cx - I.bx0) * k), oy: Math.round(this.H / 2 - (cz - I.bz0) * k) };
  }

  zoomBy(dir, sx, sy) {
    const zi = clamp(this.zi + dir, 0, ZOOMS.length - 1);
    if (zi === this.zi) return;
    const I = this.info, before = this.view();
    if (sx !== undefined) {
      // keep the world point under the cursor in place
      const wx = I.bx0 + (sx - before.ox) / before.k, wz = I.bz0 + (sy - before.oy) / before.k;
      const k = this.cell * ZOOMS[zi];
      this.vcx = wx + (this.W / 2 - sx) / k; this.vcz = wz + (this.H / 2 - sy) / k;
    } else if (this.zi === 0) {
      const p = this.game.player;
      this.vcx = p.x; this.vcz = p.z;
    }
    this.zi = zi;
    this.updateZoomLabel();
  }
  centerOnPlayer() {
    const p = this.game.player;
    if (this.zi === 0) this.zi = 1;
    this.vcx = p.x; this.vcz = p.z;
    this.updateZoomLabel();
  }
  updateZoomLabel() {
    const l = this.wrap.querySelector('.map-zoom');
    if (l) l.textContent = 'x' + ZOOMS[this.zi];
    for (const b of this.wrap.querySelectorAll('[data-zoom]')) b.disabled = +b.dataset.zoom < 0 ? this.zi === 0 : this.zi === ZOOMS.length - 1;
    this.cv?.classList.toggle('pan', ZOOMS[this.zi] > 1);
  }

  // world -> canvas px for the current view
  toScreen(v, wx, wz) { return [v.ox + (wx - this.info.bx0) * v.k, v.oy + (wz - this.info.bz0) * v.k]; }

  // ---------------------------------------------------------------- frame
  draw(t) {
    const c = this.ctx, g = this.game, w = this.world, I = this.info, p = g.player;
    if (!w || !p) return;
    this.frames++;
    const v = this.view(), { z, k } = v, P = this.p, dpr = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
    c.fillStyle = C.bg; c.fillRect(0, 0, this.W, this.H);
    // static layer (only its visible part)
    const L = this.layer, sx0 = Math.max(0, Math.floor(-v.ox / z)), sy0 = Math.max(0, Math.floor(-v.oy / z));
    const sx1 = Math.min(L.width, Math.ceil((this.W - v.ox) / z)), sy1 = Math.min(L.height, Math.ceil((this.H - v.oy) / z));
    if (sx1 > sx0 && sy1 > sy0) c.drawImage(L, sx0, sy0, sx1 - sx0, sy1 - sy0, v.ox + sx0 * z, v.oy + sy0 * z, (sx1 - sx0) * z, (sy1 - sy0) * z);

    this.drawDoors(c, v, t);
    const [px, py] = this.toScreen(v, p.x, p.z);
    const sweep = ((t / SWEEP_T) % 1) * TAU;
    // ---- range rings + sweep over the whole screen (it is the radar scope)
    const R = Math.max(Math.hypot(px, py), Math.hypot(px - this.W, py), Math.hypot(px, py - this.H), Math.hypot(px - this.W, py - this.H));
    const lu = Math.max(1, Math.round(dpr));
    c.lineWidth = lu;
    c.setLineDash([2 * lu, 3 * lu]);
    for (let j = 1, r = RING_STEP * k; r < R && j < 40; j++, r += RING_STEP * k) {
      c.strokeStyle = `rgba(${SWEEP},${Math.max(0.1, 0.34 - j * 0.05).toFixed(2)})`;
      c.beginPath(); c.arc(px, py, r, 0, TAU); c.stroke();
    }
    c.setLineDash([]);
    c.globalCompositeOperation = 'lighter';
    for (let s = 0; s < TRAIL_N; s++) {
      const a1 = sweep - (s * TRAIL) / TRAIL_N, a0 = a1 - TRAIL / TRAIL_N - 0.004;
      c.fillStyle = `rgba(${SWEEP},${(0.2 * (1 - s / TRAIL_N) ** 1.5).toFixed(3)})`;
      c.beginPath(); c.moveTo(px, py); c.arc(px, py, R, a0, a1); c.closePath(); c.fill();
    }
    c.strokeStyle = `rgba(${SWEEP},0.35)`; c.lineWidth = 5 * lu;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(sweep) * R, py + Math.sin(sweep) * R); c.stroke();
    c.strokeStyle = `rgba(${SWEEP},0.9)`; c.lineWidth = 2 * lu;
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    // how recently the beam passed a point: 1 just now .. 0 a full turn ago
    const swept = (sx, sy) => 1 - (((sweep - Math.atan2(sy - py, sx - px)) % TAU) + TAU) % TAU / TAU;
    const ping = (sx, sy, col, f, r0) => {
      if (f < 0.88) return;
      const q = (f - 0.88) / 0.12;
      c.globalAlpha = q * 0.9; c.strokeStyle = col; c.lineWidth = lu;
      c.beginPath(); c.arc(sx, sy, r0 + (1 - q) * 6 * P, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    };
    const put = (cv, sx, sy) => c.drawImage(cv, Math.round(sx - cv.width / 2), Math.round(sy - cv.height / 2));
    const labels = [], marks = [];   // labels are laid out last, around these marker boxes
    const mark = (sx, sy, r) => marks.push([sx - r, sy - r, sx + r, sy + r]);
    const onScreen = (sx, sy) => sx > -4 * P && sy > -4 * P && sx < this.W + 4 * P && sy < this.H + 4 * P;
    // key markers that scrolled out of a zoomed view get a pointer on the edge
    const offEdge = (sx, sy, col, text) => {
      const [ex, ey] = this.edgePointer(c, sx, sy, col, P, lu);
      mark(ex, ey, 3 * P);
      labels.push({ text, x: ex, y: ey, r: 3 * P, col, below: ey < this.H / 2 });
    };

    if (g.inHub) {
      // ---- hub: teleporter pad and the crew
      const tp = w.level.teleporter;
      if (tp) {
        const [sx, sy] = this.toScreen(v, tp.x, tp.z), pu = 0.5 + 0.5 * Math.sin(t * 3), r = Math.max(5 * P, (tp.r || 1.8) * k);
        if (!onScreen(sx, sy)) offEdge(sx, sy, C.tele, 'TELEPORTER'); else {
        c.strokeStyle = C.tele; c.lineWidth = lu * 2; c.globalAlpha = 0.5 + 0.4 * pu;
        c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.stroke(); c.globalAlpha = 1;
        put(sprite('portal', { '#': C.tele, '+': '#e8ffff' }, P), sx, sy);
        mark(sx, sy, r);
        labels.push({ text: 'TELEPORTER', x: sx, y: sy, r, col: C.tele, below: true });
        }
      }
      for (const n of w.npcs) {
        const [sx, sy] = this.toScreen(v, n.x, n.z);
        put(sprite('crew', { '#': C.crew }, P), sx, sy);
        mark(sx, sy, 4 * P);
        labels.push({ text: n.name, x: sx, y: sy, r: 4 * P, col: C.crew });
      }
    } else {
      // ---- chests, relic pedestals, keys on the ground
      for (const ch of w.chests) {
        if (ch.open) continue;
        const [sx, sy] = this.toScreen(v, ch.x, ch.z);
        put(sprite('chest', { '#': C.chest, h: '#a87a10' }, P), sx, sy);
      }
      for (const pd of w.scatter?.pedestals || []) {
        if (pd.taken || !pd.item) continue;
        const [sx, sy] = this.toScreen(v, pd.x, pd.z);
        put(sprite('relic', { '#': RARITY[pd.item.rarity]?.color || '#fff' }, P), sx, sy);
      }
      for (const pk of w.pickups) {
        if (pk.kind !== 'key') continue;
        const [sx, sy] = this.toScreen(v, pk.x, pk.z), col = KEY_HEX[pk.color] || '#fff';
        c.globalAlpha = 0.35 + 0.25 * Math.sin(t * 5 + pk.x); c.fillStyle = col;
        c.beginPath(); c.arc(sx, sy, 5 * P, 0, TAU); c.fill(); c.globalAlpha = 1;
        put(sprite('key', { '#': col }, P), sx, sy);
      }
      // ---- hostiles: dim between sweeps, flare as the beam passes
      for (const m of w.monsters) {
        if (m.dead || m.boss) continue;
        const [sx, sy] = this.toScreen(v, m.x, m.z), f = swept(sx, sy);
        const lv = Math.min(5, Math.floor(Math.pow(f, 2.2) * 6));   // 6 brightness steps keep the sprite cache small
        const base = m.elite ? C.elite : C.enemy, col = shade(base, lv >= 4 ? (lv - 3) * 0.22 : -0.45 + lv * 0.12);
        if (m.elite) put(sprite('elite', { '#': col, '+': lv >= 4 ? '#ffffff' : shade(base, 0.3) }, P), sx, sy);
        else put(sprite(m.summoned ? 'minion' : 'enemy', { '#': col }, P), sx, sy);
        ping(sx, sy, base, f, 2 * P);
      }
      // ---- boss: big pulsing marker + name
      const boss = g.boss;
      if (boss && !boss.dead && w.monsters.includes(boss)) {
        const [sx, sy] = this.toScreen(v, boss.x, boss.z), pu = 0.5 + 0.5 * Math.sin(t * 4.5), f = swept(sx, sy);
        if (!onScreen(sx, sy)) offEdge(sx, sy, C.boss, 'BOSS'); else {
        c.globalAlpha = 0.2 + 0.3 * pu; c.fillStyle = C.boss;
        c.beginPath(); c.arc(sx, sy, (7 + 3 * pu) * P, 0, TAU); c.fill();
        c.globalAlpha = 1; c.strokeStyle = C.boss; c.lineWidth = lu * 2;
        c.beginPath(); c.arc(sx, sy, (8 + 4 * pu) * P, 0, TAU); c.stroke();
        put(sprite('boss', { '#': f > 0.8 || pu > 0.7 ? '#ff8aa8' : C.boss }, P), sx, sy);
        ping(sx, sy, C.boss, f, 9 * P);
        mark(sx, sy, 12 * P);
        labels.push({ text: boss.name.toUpperCase(), x: sx, y: sy, r: 12 * P, col: '#ff8aa8' });
        }
      }
      // ---- portal (on top of the boss glow): where it will open, or the open rift
      const lp = w.level.portal;
      if (lp) {
        const open = !!w.portal, [sx, sy] = this.toScreen(v, open ? w.portal.x : lp.x, open ? w.portal.z : lp.z);
        if (!onScreen(sx, sy)) offEdge(sx, sy, open ? C.portal : '#a898c8', 'PORTAL');
        else if (open) {
          const gl = c.createRadialGradient(sx, sy, 0, sx, sy, 9 * P);
          gl.addColorStop(0, 'rgba(201,166,255,0.55)'); gl.addColorStop(1, 'rgba(201,166,255,0)');
          c.fillStyle = gl; c.beginPath(); c.arc(sx, sy, 9 * P, 0, TAU); c.fill();
          c.strokeStyle = C.portal; c.lineWidth = lu * 2;
          for (let a = 0; a < 2; a++) { c.beginPath(); c.arc(sx, sy, 6 * P, t * 2.4 + a * Math.PI, t * 2.4 + a * Math.PI + 1.7); c.stroke(); }
          put(sprite('portal', { '#': C.portal, '+': '#ffffff' }, P), sx, sy);
        } else {
          c.strokeStyle = C.portalDim; c.lineWidth = lu; c.setLineDash([2 * lu, 2 * lu]);
          c.beginPath(); c.arc(sx, sy, 6 * P, 0, TAU); c.stroke(); c.setLineDash([]);
          put(sprite('portal', { '#': C.portalDim, '+': '#9d8cc0' }, P), sx, sy);
        }
        if (onScreen(sx, sy)) {
          mark(sx, sy, 6 * P);
          labels.push({ text: open ? 'PORTAL OPEN' : 'PORTAL (SEALED)', x: sx, y: sy, r: 6 * P, col: open ? C.portal : '#a898c8', below: true });
        }
      }
    }
    // ---- player: view cone + arrow (edge pointer when panned away)
    if (onScreen(px, py)) { this.drawPlayer(c, px, py, p.yaw, P, lu); mark(px, py, 5 * P); }
    else offEdge(px, py, '#ffffff', 'YOU');
    this.layoutLabels(labels, marks);
  }

  // Place each label above / below / beside its marker, first spot that is
  // free of other labels and markers (falls back to the preferred spot).
  layoutLabels(labels, marks) {
    const c = this.ctx, o = Math.max(1, Math.round(this.dpr));
    c.font = `${8 * o}px ${FONT}`;
    c.textBaseline = 'middle'; c.textAlign = 'left';
    const placed = marks.slice(), th = 10 * o, gap = 2 * o;
    const hit = (r) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    for (const L of labels) {
      const tw = c.measureText(L.text).width;
      const up = [0, -(L.r + th / 2 + gap)], down = [0, L.r + th / 2 + gap];
      const cands = [L.below ? down : up, L.below ? up : down, [L.r + tw / 2 + 3 * gap, 0], [-(L.r + tw / 2 + 3 * gap), 0]];
      let best = null;
      for (const [dx, dy] of cands) {
        const cx = clamp(L.x + dx, tw / 2 + 3 * o, this.W - tw / 2 - 3 * o), cy = clamp(L.y + dy, th / 2 + o, this.H - th / 2 - o);
        const r = [cx - tw / 2 - o, cy - th / 2, cx + tw / 2 + o, cy + th / 2];
        if (!best) best = r;
        if (!hit(r)) { best = r; break; }
      }
      placed.push(best);
      const lx = Math.round(best[0] + o), ly = Math.round((best[1] + best[3]) / 2);
      c.fillStyle = '#050307';
      for (const [dx, dy] of OUT8) c.fillText(L.text, lx + dx * o, ly + dy * o);
      c.fillStyle = L.col;
      c.fillText(L.text, lx, ly);
    }
  }

  drawDoors(c, v, t) {
    const g = this.world.grid, lu = Math.max(1, Math.round(this.dpr)), pu = 0.5 + 0.5 * Math.sin(t * 5);
    for (const d of this.world.doors) {
      const cells = d.cells || [d.cell];
      const col = d.color ? KEY_HEX[d.color] || C.door : C.door;
      const locked = d.locked && d.color, open = d.open > 0.9;
      for (const i of cells) {
        const x = i % g.w, zc = (i / g.w) | 0;
        const [x0, y0] = this.toScreen(v, x, zc), [x1, y1] = this.toScreen(v, x + 1, zc + 1);
        const th = Math.max(2 * this.p, (x1 - x0) * 0.34);
        const r = d.axis === 'x' ? [Math.round((x0 + x1 - th) / 2), Math.round(y0), Math.round(th), Math.round(y1 - y0)] : [Math.round(x0), Math.round((y0 + y1 - th) / 2), Math.round(x1 - x0), Math.round(th)];
        if (locked) {
          // key-coloured halo so a locked door is findable at fit zoom
          const e = this.p * (1 + pu);
          c.globalAlpha = 0.18 + 0.22 * pu; c.fillStyle = col;
          c.fillRect(r[0] - e, r[1] - e, r[2] + 2 * e, r[3] + 2 * e);
          c.globalAlpha = 1;
        }
        c.fillStyle = '#050307';
        c.fillRect(r[0] - lu, r[1] - lu, r[2] + 2 * lu, r[3] + 2 * lu);
        c.globalAlpha = locked ? 1 : open ? 0.3 : 0.6;
        c.fillStyle = col;
        c.fillRect(r[0], r[1], r[2], r[3]);
        c.globalAlpha = 1;
        if (locked && r[2] > 2 * lu && r[3] > 2 * lu) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(r[0], r[1], d.axis === 'x' ? lu : r[2], d.axis === 'x' ? r[3] : lu); }
      }
    }
  }

  drawPlayer(c, px, py, yaw, P, lu) {
    const s = this.game.settings, aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const half = Math.atan(Math.tan(((s.fov || 80) * Math.PI) / 360) * aspect);
    const len = 20 * P;
    const gr = c.createRadialGradient(px, py, 0, px, py, len);
    gr.addColorStop(0, 'rgba(255,240,200,0.34)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(px, py); c.arc(px, py, len, yaw - half, yaw + half); c.closePath(); c.fill();
    // long isoceles triangle: the narrow apex is the only sharp corner, so the
    // heading reads even at 1x device pixels (a notched dart looked ambiguous)
    const L = 5 * P, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const pt = (f, r) => [px + cs * f - sn * r, py + sn * f + cs * r];   // f along the view, r to the right
    const pts = [pt(1.25 * L, 0), pt(-0.7 * L, 0.6 * L), pt(-0.7 * L, -0.6 * L)];
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]); c.closePath();
    c.lineJoin = 'round'; c.lineWidth = 2 * lu + P * 0.6; c.strokeStyle = '#050307'; c.stroke();
    c.fillStyle = '#ffffff'; c.fill();
    c.fillStyle = '#ffcc33';   // gold heel marks the exact position
    c.fillRect(Math.round(px - P / 2), Math.round(py - P / 2), P, P);
  }

  // off-screen boss / portal while zoomed: a pointer on the screen edge
  edgePointer(c, sx, sy, col, P, lu) {
    const m = 9 * P, cx = this.W / 2, cy = this.H / 2, dx = sx - cx, dy = sy - cy;
    const tx = dx ? ((dx > 0 ? this.W - m : m) - cx) / dx : Infinity, ty = dy ? ((dy > 0 ? this.H - m : m) - cy) / dy : Infinity;
    const t = Math.min(tx, ty), ex = cx + dx * t, ey = cy + dy * t, a = Math.atan2(dy, dx), cs = Math.cos(a), sn = Math.sin(a), L = 4 * P;
    c.beginPath(); c.moveTo(ex + cs * L, ey + sn * L); c.lineTo(ex - cs * L * 0.6 - sn * L * 0.7, ey - sn * L * 0.6 + cs * L * 0.7); c.lineTo(ex - cs * L * 0.6 + sn * L * 0.7, ey - sn * L * 0.6 - cs * L * 0.7); c.closePath();
    c.lineJoin = 'round'; c.lineWidth = 2 * lu; c.strokeStyle = '#050307'; c.stroke();
    c.fillStyle = col; c.fill();
    return [ex - cs * L * 0.3, ey - sn * L * 0.3];
  }

  // ---------------------------------------------------------------- side panel: status + legend
  fillSide() {
    const g = this.game, w = this.world, I = this.info, side = this.side;
    if (!side) return;
    const ic = (name) => `<canvas class="lg-ic" data-ic="${name}"></canvas>`;
    const sw = (cls) => `<i class="sw ${cls}"></i>`;
    const item = (icon, text) => `<span>${icon}${text}</span>`;
    let html;
    if (g.inHub) {
      html = `<div class="map-title"><small>ORBITAL STATION</small>AEGIS-9</div>
        <div class="map-stat ok"><b>NO HOSTILE SIGNALS</b></div>
        <div class="map-sub">Radar sweeps the deck. Step onto the teleporter to descend.</div>
        <div class="map-h">CREW ON DECK</div>
        <div class="legend one">${w.npcs.map((n) => item(ic('crew'), `${esc(n.name)} <em>${esc(n.title || '')}</em>`)).join('')}</div>
        <div class="map-h">LEGEND</div>
        <div class="legend">${item(ic('you'), 'YOU')}${item(ic('tele'), 'TELEPORT')}</div>`;
    } else {
      const boss = g.boss;
      const alive = w.monsters.filter((m) => !m.dead && !m.boss);
      const elites = alive.filter((m) => m.elite).length;
      const bossTxt = !boss ? '' : boss.dead ? '<b class="ok">DESTROYED</b>' : boss.awake ? `<b class="bad">HUNTING</b><small>${Math.ceil((boss.hp / boss.maxHp) * 100)}% HP</small>` : '<b>DORMANT</b>';
      const keysHeld = [...g.player.keys].map((k) => `<i class="kc" style="background:${KEY_HEX[k]}"></i>`).join('');
      const keysGround = w.pickups.filter((pk) => pk.kind === 'key').length;
      const locked = w.doors.filter((d) => d.locked && d.color).length;
      const has = I.has, dr = w.doors.length;
      html = `<div class="map-title"><small>DEPTH ${g.save.run.depth}</small>${esc(w.theme.name.toUpperCase())}</div>
        <div class="map-stat"><span>HOSTILES</span><b class="bad big">${g.killsLeft}</b><small>/ ${g.killsTotal}</small>${elites ? `<em>${elites} elite${elites > 1 ? 's' : ''} among them</em>` : ''}</div>
        ${boss ? `<div class="map-stat"><span>BOSS</span>${bossTxt}<em>${esc(boss.name)}</em></div>` : ''}
        <div class="map-stat"><span>PORTAL</span>${w.portal ? '<b class="portal">OPEN</b>' : '<b>SEALED</b><em>clear all hostiles</em>'}</div>
        ${keysHeld || keysGround || locked ? `<div class="map-stat"><span>KEYS</span>${keysHeld || '<small>none</small>'}${locked || keysGround ? `<em>${locked ? `${locked} locked` : ''}${locked && keysGround ? ' · ' : ''}${keysGround ? `${keysGround} to find` : ''}</em>` : ''}</div>` : ''}
        <div class="map-h">LEGEND</div>
        <div class="legend">
          ${item(ic('you'), 'YOU')}${item(ic('enemy'), 'HOSTILE')}${elites ? item(ic('elite'), 'ELITE') : ''}${boss && !boss.dead ? item(ic('boss'), 'BOSS') : ''}
          ${item(ic('portal'), 'PORTAL')}${keysGround ? item(ic('key'), 'KEY') : ''}${w.chests.some((c) => !c.open) ? item(ic('chest'), 'CHEST') : ''}
          ${(w.scatter?.pedestals || []).some((pd) => !pd.taken && pd.item) ? item(ic('relic'), 'RELIC') : ''}
          ${dr ? item(sw('door'), 'DOOR') : ''}${has.stair ? item(sw('stair'), 'STAIRS') : ''}${has.bridge ? item(sw('bridge'), 'BRIDGE') : ''}
          ${has.void ? item(sw('void'), 'VOID') : ''}${has.pit ? item(sw('pit'), 'PIT') : ''}${has.lava ? item(sw('lava'), 'LAVA') : ''}
          ${has.poison ? item(sw('poison'), 'POISON') : ''}${has.water ? item(sw('water'), 'WATER') : ''}${has.spikes ? item(sw('spikes'), 'SPIKES') : ''}
        </div>
        <div class="map-sub hint">${I.bw}×${I.bh} m · floors lighter = higher</div>`;
    }
    side.innerHTML = html;
    // legend icons: the same pixel sprites the radar draws
    const dpr = Math.min(window.devicePixelRatio || 1, 3), P = Math.max(2, Math.round(dpr * 1.5));
    for (const cv of side.querySelectorAll('canvas[data-ic]')) {
      const name = cv.dataset.ic;
      cv.width = Math.round(14 * dpr); cv.height = Math.round(14 * dpr);
      cv.style.width = '14px'; cv.style.height = '14px';
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      const mid = cv.width / 2;
      const pal = { enemy: ['enemy', { '#': C.enemy }], elite: ['elite', { '#': C.elite, '+': '#fff' }], boss: ['boss', { '#': C.boss }], portal: ['portal', { '#': C.portal, '+': '#fff' }],
        key: ['key', { '#': KEY_HEX.yellow }], chest: ['chest', { '#': C.chest, h: '#a87a10' }], relic: ['relic', { '#': '#3d7bff' }], crew: ['crew', { '#': C.crew }], tele: ['portal', { '#': C.tele, '+': '#e8ffff' }] }[name];
      if (name === 'you') {
        const L = 5 * dpr, P2 = dpr;
        c.beginPath(); c.moveTo(mid + L, mid); c.lineTo(mid - 0.6 * L, mid + 0.5 * L); c.lineTo(mid - 0.25 * L, mid); c.lineTo(mid - 0.6 * L, mid - 0.5 * L); c.closePath();
        c.lineWidth = 2 * P2; c.strokeStyle = '#050307'; c.stroke(); c.fillStyle = '#fff'; c.fill();
        continue;
      }
      if (!pal) continue;
      // shrink big sprites to fit the 14px chip
      const rows = ICONS[pal[0]], q = Math.max(1, Math.min(P, Math.floor(cv.width / (Math.max(rows.length, rows[0].length) + 2))));
      const s = sprite(pal[0], pal[1], q);
      c.drawImage(s, Math.round(mid - s.width / 2), Math.round(mid - s.height / 2));
    }
  }
}
LevelMap.live = 0;   // mounted maps (debug / tests: must return to 0 when the inventory closes)
