// Procedural gore atlas: 256x128, 8 x 4 cells of 32 px (cell ids in
// data/gore.js GC). Blood shapes are drawn in light neutral greys so the
// per-category instance tint sets their colour (red, crimson-black, acid
// green...). Gibs (meat, bone, metal) are drawn in their final colours.
// Every cell keeps a 1 px transparent border so nearest sampling never
// bleeds into a neighbour (except the lens trail, which tiles vertically).
import { PixelCanvas, shade } from './pixel.js';
import { Rng } from '../core/rng.js';
import { makeCanvas } from '../engine/assets.js';
import { GC, GORE_COLS, GORE_ROWS } from '../data/gore.js';

const S = 32;

// ------------------------------------------------------------ mask helpers
class Mask {
  constructor() { this.m = new Uint8Array(S * S); }
  get(x, y) { return x < 0 || y < 0 || x >= S || y >= S ? 0 : this.m[y * S + x]; }
  set(x, y) { x |= 0; y |= 0; if (x >= 1 && y >= 1 && x < S - 1 && y < S - 1) this.m[y * S + x] = 1; }
  circle(cx, cy, r) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y);
  }
  ellipse(cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y);
  }
  // tapered stroke from (x0,y0) radius r0 to (x1,y1) radius r1
  stroke(x0, y0, x1, y1, r0, r1) {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) { const t = i / n; this.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t); }
  }
  // erosion depth: 1 = edge pixel, 2 = one pixel in, ...
  depth(maxD = 5) {
    const d = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) d[i] = this.m[i] ? maxD : 0;
    for (let k = 1; k < maxD; k++) {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (d[i] !== maxD) continue;
        const nb = (xx, yy) => (xx < 0 || yy < 0 || xx >= S || yy >= S ? 0 : d[yy * S + xx]);
        if (nb(x - 1, y) < k || nb(x + 1, y) < k || nb(x, y - 1) < k || nb(x, y + 1) < k) d[i] = k;
      }
    }
    return d;
  }
}

// Glossy liquid shading of a mask in neutral greys (tinted at runtime).
// pal: value per erosion depth; hl: highlight value on upper-left inner rim
function shadeLiquid(p, mask, rng, { pal = [0, 118, 172, 204, 214, 210], hl = 250, alpha = null, centerDark = 0 } = {}) {
  const d = mask.depth(5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = d[y * S + x];
    if (!k) continue;
    let v = pal[Math.min(k, pal.length - 1)] + (rng.next() - 0.5) * 10;
    if (centerDark && k >= 5) v -= centerDark;
    // glossy highlight: a thin bright rim just inside every upper-left facing edge
    if (k === 2 && d[(y - 1) * S + x - 1] === 1 && (d[(y - 1) * S + x] === 1 || d[y * S + x - 1] === 1) && rng.next() < 0.8) v = hl;
    const a = alpha ? alpha[Math.min(k, alpha.length - 1)] : 255;
    p.set(x, y, [v, v, v], a);
  }
}

function blit(atlas, p, cell) {
  const cx = (cell % GORE_COLS) * S, cy = Math.floor(cell / GORE_COLS) * S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (!p.data[i + 3]) continue;
    const o = ((cy + y) * atlas.w + cx + x) * 4;
    atlas.data[o] = p.data[i]; atlas.data[o + 1] = p.data[i + 1]; atlas.data[o + 2] = p.data[i + 2]; atlas.data[o + 3] = p.data[i + 3];
  }
}

// ------------------------------------------------------------ blood shapes
function splatMask(rng, { R = 6, spikes = 7, spikeLen = [1.3, 2.2], dots = 8, cx = 15.5, cy = 15.5, stretch = 1 } = {}) {
  const m = new Mask();
  for (let k = 0; k < 5; k++) m.circle(cx + rng.float(-R * 0.4, R * 0.4), cy + rng.float(-R * 0.4, R * 0.4), R * rng.float(0.55, 0.85));
  for (let k = 0; k < spikes; k++) {
    const a = (k / spikes) * Math.PI * 2 + rng.float(-0.35, 0.35);
    const L = R * rng.float(spikeLen[0], spikeLen[1]);
    const ex = cx + Math.cos(a) * L * stretch, ey = cy + Math.sin(a) * L;
    m.stroke(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, ex, ey, R * 0.33, 0.6);
    m.circle(ex + Math.cos(a) * 1.6, ey + Math.sin(a) * 1.6, rng.float(1.1, 2.0));
  }
  for (let k = 0; k < dots; k++) {
    const a = rng.float(0, Math.PI * 2), r = R * rng.float(1.5, 2.4);
    m.circle(cx + Math.cos(a) * r * stretch, cy + Math.sin(a) * r, rng.float(0.6, 1.4));
  }
  return m;
}

function cellDrop() {
  const p = new PixelCanvas(S, S), m = new Mask();
  m.circle(15.5, 15.5, 12.5);
  shadeLiquid(p, m, new Rng(1), { pal: [0, 120, 175, 205, 215, 212] });
  return p;
}
function cellStreak() {
  // teardrop: round head at the bottom (direction of travel), tail upward
  const p = new PixelCanvas(S, S), m = new Mask();
  m.stroke(15.5, 3, 15.5, 22, 1, 6.5);
  m.circle(15.5, 23.5, 7);
  shadeLiquid(p, m, new Rng(2), { pal: [0, 120, 178, 206, 216, 214] });
  return p;
}
function cellMist() {
  const p = new PixelCanvas(S, S), r = new Rng(7);
  const dens = new Float32Array(S * S);
  for (let k = 0; k < 11; k++) {
    const x = r.float(9, 23), y = r.float(9, 23), rr = r.float(4, 8.5);
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y) / rr;
      if (d < 1) dens[yy * S + xx] += (1 - d) * 0.55;
    }
  }
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const dd = Math.min(1, dens[y * S + x]);
    const edge = Math.max(0, 1 - Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 15);
    const v = dd * Math.min(1, edge * 2.2);
    // quantised alpha with an ordered dither: chunky pixel smoke, no smooth gradients
    const q = Math.floor(v * 4 + bayer[(y & 3) * 4 + (x & 3)] / 16);
    if (q <= 0) continue;
    const a = [0, 70, 125, 180, 225][Math.min(4, q)];
    const g = 175 + q * 12 + (r.next() - 0.5) * 12;
    p.set(x, y, [g, g, g], a);
  }
  return p;
}
function cellSplat(seed, opts) {
  const p = new PixelCanvas(S, S), rng = new Rng(seed);
  shadeLiquid(p, splatMask(rng, opts), rng);
  return p;
}
function cellSpray() {
  // directional spray: a smear plus elongated droplets fanning out one way
  const p = new PixelCanvas(S, S), rng = new Rng(44), m = new Mask();
  m.ellipse(10, 16, 5.5, 4.5);
  m.ellipse(13, 16, 5, 3);
  for (let k = 0; k < 11; k++) {
    const a = rng.float(-0.65, 0.65), L = rng.float(7, 16);
    const ex = 11 + Math.cos(a) * L, ey = 16 + Math.sin(a) * L;
    m.stroke(11 + Math.cos(a) * 3, 16 + Math.sin(a) * 3, ex, ey, rng.float(1, 2), 0.5);
    m.circle(ex + Math.cos(a), ey + Math.sin(a), rng.float(0.9, 1.8));
  }
  for (let k = 0; k < 8; k++) m.circle(rng.float(18, 29), rng.float(5, 27), rng.float(0.6, 1.2));
  shadeLiquid(p, m, rng);
  return p;
}
function cellWallRun() {
  // splat on a wall with thin drips running down (texture top = world up)
  const p = new PixelCanvas(S, S), rng = new Rng(52);
  const m = splatMask(rng, { R: 4.6, spikes: 9, spikeLen: [1.4, 2.4], dots: 7, cy: 10, stretch: 1.25 });
  const drips = [[11, 25, 0.75], [13.5, 30, 1.0], [16.5, 22, 0.8], [19, 28, 0.7], [21.5, 19, 0.6]];
  for (const [x, end, w] of drips) {
    m.stroke(x, 11, x + rng.float(-0.5, 0.5), end, w + 0.6, w);
    m.circle(x, end, w + 0.8);
  }
  shadeLiquid(p, m, rng);
  return p;
}
function cellPool() {
  const p = new PixelCanvas(S, S), rng = new Rng(61), m = new Mask();
  for (let k = 0; k < 9; k++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(0, 6);
    m.circle(15.5 + Math.cos(a) * r, 15.5 + Math.sin(a) * r, rng.float(6, 9.5));
  }
  for (let k = 0; k < 6; k++) {
    const a = rng.float(0, Math.PI * 2);
    m.circle(15.5 + Math.cos(a) * 12, 15.5 + Math.sin(a) * 12, rng.float(1.5, 3));
  }
  shadeLiquid(p, m, rng, { pal: [0, 110, 160, 186, 192, 186], hl: 236, centerDark: 26 });
  return p;
}
function cellLens(seed, drippy) {
  // translucent body, dark opaque rim, bright specular
  const p = new PixelCanvas(S, S), rng = new Rng(seed);
  const m = splatMask(rng, { R: 5.2, spikes: drippy ? 7 : 11, spikeLen: [1.3, 2.4], dots: 12 });
  if (drippy) for (let k = 0; k < 3; k++) { const x = 15.5 + rng.float(-4, 4); m.stroke(x, 16, x, rng.float(24, 29), 1.1, 0.8); m.circle(x, 28, 1.2); }
  // thick dark rim, thin translucent middle (blood film on glass)
  shadeLiquid(p, m, rng, { pal: [0, 92, 145, 190, 212, 224], hl: 255, alpha: [0, 255, 236, 196, 168, 150] });
  // extra specular dot
  p.set(12, 12, [255, 255, 255], 255); p.set(13, 12, [235, 235, 235], 255); p.set(12, 13, [235, 235, 235], 255);
  return p;
}
function cellLensTrail() {
  // vertical run: dark liquid edges, lighter thin centre, full height (tiles)
  const p = new PixelCanvas(S, S);
  const prof = [[9, 70, 120], [10, 200, 110], [11, 245, 135], [12, 230, 165], [13, 215, 185], [14, 205, 195], [15, 200, 200], [16, 200, 200], [17, 205, 195], [18, 215, 185], [19, 230, 165], [20, 245, 135], [21, 200, 110], [22, 70, 120]];
  for (let y = 0; y < S; y++) for (const [x, a, v] of prof) p.set(x, y, [v, v, v], a);
  for (let y = 0; y < S; y += 9) p.set(13, y + 3, [250, 250, 250], 255);
  return p;
}
function cellScorch() {
  const p = new PixelCanvas(S, S), rng = new Rng(81);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const rays = [];
  for (let k = 0; k < 9; k++) rays.push([rng.float(0, Math.PI * 2), rng.float(0.75, 1.05)]);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 16;
    let r = Math.hypot(dx, dy) / 14.5;
    const a = Math.atan2(dy, dx);
    let ray = 0;
    for (const [ra, rl] of rays) { const da = Math.abs(Math.atan2(Math.sin(a - ra), Math.cos(a - ra))); if (da < 0.16) ray = Math.max(ray, (1 - da / 0.16) * rl); }
    r -= ray * 0.3;
    const v = Math.max(0, 1 - r) * (0.8 + rng.next() * 0.4);
    const q = Math.floor(v * 4 + bayer[(y & 3) * 4 + (x & 3)] / 16);
    if (q <= 0) continue;
    const g = 150 + rng.float(0, 60);
    p.set(x, y, [g, g, g], [0, 90, 160, 215, 250][Math.min(4, q)]);
  }
  return p;
}

// ------------------------------------------------------------ gibs (final colours)
const MEAT = [128, 18, 16], MEAT_HI = [172, 42, 36], MEAT_DK = [72, 7, 7], FAT = [206, 132, 112], BONE = [226, 214, 188], BONE_DK = [150, 136, 112];
const OUT_RED = [34, 3, 3];

function meatBlob(p, rng, cx, cy, rx, ry, n = 5) {
  const m = new Mask();
  for (let k = 0; k < n; k++) m.ellipse(cx + rng.float(-rx * 0.5, rx * 0.5), cy + rng.float(-ry * 0.5, ry * 0.5), rx * rng.float(0.4, 0.75), ry * rng.float(0.4, 0.75));
  // ragged, torn edge
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) if (m.get(x, y) && (!m.get(x - 1, y) || !m.get(x + 1, y) || !m.get(x, y - 1) || !m.get(x, y + 1)) && rng.chance(0.3)) m.m[y * S + x] = 0;
  const d = m.depth(4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = d[y * S + x];
    if (!k) continue;
    // lit from the upper left
    const lx = (x - cx) / rx, ly = (y - cy) / ry;
    const l = -lx * 0.45 - ly * 0.55 + (k - 1) * 0.12;
    let c = l > 0.35 ? MEAT_HI : l < -0.3 ? MEAT_DK : MEAT;
    if (rng.chance(0.12)) c = shade(c, rng.float(-0.25, 0.15));
    p.set(x, y, c);
  }
  return m;
}
function cellChunk() {
  const p = new PixelCanvas(S, S), rng = new Rng(101);
  meatBlob(p, rng, 16, 17, 11, 9, 7);
  // fat marbling + a bone stub
  for (let k = 0; k < 6; k++) { const x = rng.int(9, 22), y = rng.int(12, 22); if (p.alpha(x, y)) { p.set(x, y, FAT); p.set(x + 1, y, shade(FAT, -0.15)); } }
  p.rect(22, 9, 5, 3, BONE); p.rect(25, 8, 3, 2, BONE); p.hline(22, 26, 11, BONE_DK);
  p.set(12, 14, [255, 120, 100]); p.set(13, 13, [255, 140, 120]);
  return p.outline(OUT_RED);
}
function cellChunk2() {
  const p = new PixelCanvas(S, S), rng = new Rng(117);
  meatBlob(p, rng, 15, 16, 9, 8, 6);
  // ragged skin flap on one side
  const SKIN = [150, 84, 66];
  p.polygon([[18, 9], [26, 11], [25, 15], [19, 14]], SKIN);
  p.hline(19, 25, 12, shade(SKIN, 0.2));
  for (let k = 0; k < 4; k++) p.set(rng.int(10, 20), rng.int(13, 21), FAT);
  return p.outline(OUT_RED);
}
function cellGut() {
  // a torn length of intestine: S-curved tube, dark wet red with a sheen
  const p = new PixelCanvas(S, S);
  const C = [138, 38, 48], HI = [184, 84, 88], DK = [76, 14, 22];
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.015) pts.push([5 + t * 22, 16 + Math.sin(t * Math.PI * 2.2) * 7 - t * 2]);
  for (const [x, y] of pts) p.circle(x, y, 2.6, C);
  for (const [x, y] of pts) p.set(x, y - 2, HI);
  for (let i = 4; i < pts.length; i += 8) { p.set(pts[i][0], pts[i][1] + 1, DK); p.set(pts[i][0] + 1, pts[i][1] + 1, DK); }
  // ragged torn ends
  p.circle(pts[0][0], pts[0][1], 1.5, MEAT_DK); p.circle(pts[pts.length - 1][0], pts[pts.length - 1][1], 1.5, MEAT_DK);
  return p.outline(OUT_RED);
}
function cellRib() {
  // a torn slab of rib cage: three curved ribs on a strip of meat
  const p = new PixelCanvas(S, S), rng = new Rng(109);
  meatBlob(p, rng, 9, 17, 5, 10, 4);
  for (let r = 0; r < 3; r++) {
    const y0 = 9 + r * 7;
    for (let t = 0; t <= 1; t += 0.02) {
      const x = 10 + t * 17, y = y0 - Math.sin(t * Math.PI) * 4 + t * 3;
      p.set(x, y, BONE); p.set(x, y + 1, BONE_DK); p.set(x, y - 1, [246, 238, 220]);
    }
    p.set(27, y0 + 3, MEAT); p.set(26, y0 + 4, MEAT_DK);
  }
  return p.outline(OUT_RED);
}
function cellSkull() {
  const p = new PixelCanvas(S, S);
  p.ball(15, 14, 9, BONE);
  p.rect(9, 19, 12, 6, BONE); p.rect(9, 23, 12, 2, BONE_DK);
  for (let x = 10; x < 21; x += 2) p.vline(x, 22, 24, [240, 232, 210]);
  // jagged break on the right half
  for (let y = 4; y < 26; y++) for (let x = 19 + ((y * 7) % 3); x < 26; x++) p.data[(y * S + x) * 4 + 3] = 0;
  p.ellipse(12, 15, 2.5, 3, [26, 8, 8]); p.set(16, 18, [40, 14, 12]);
  p.rect(16, 6, 3, 9, MEAT); p.set(17, 7, MEAT_HI); p.vline(18, 12, 21, MEAT_DK);
  return p.outline(OUT_RED);
}
function cellFemur() {
  const p = new PixelCanvas(S, S);
  for (let t = 0; t <= 1; t += 0.02) { const x = 7 + t * 17, y = 24 - t * 16; p.rect(x - 1, y - 1, 3, 3, BONE); p.set(x - 1, y + 1, BONE_DK); p.set(x + 1, y - 1, [246, 238, 220]); }
  p.circle(6, 24, 3, BONE); p.circle(8, 27, 2.5, BONE); p.set(5, 26, BONE_DK);
  p.circle(24, 7, 3, BONE); p.circle(26, 9, 2.5, BONE); p.set(23, 5, [246, 238, 220]);
  p.ellipse(15, 16, 2.5, 2, MEAT); p.set(15, 15, MEAT_HI);
  return p.outline([40, 20, 12]);
}
function cellVertebra() {
  const p = new PixelCanvas(S, S);
  p.ellipse(16, 17, 6, 4.5, BONE); p.ellipse(16, 18, 5, 3, BONE_DK); p.ellipse(16, 17, 2, 1.5, [30, 10, 8]);
  p.polygon([[14, 12], [18, 12], [17, 5], [15, 5]], BONE); p.vline(17, 6, 12, BONE_DK);
  p.polygon([[9, 16], [3, 13], [3, 15], [10, 19]], BONE); p.polygon([[23, 16], [29, 13], [29, 15], [22, 19]], BONE);
  p.ellipse(21, 21, 2.5, 2, MEAT); p.set(21, 20, MEAT_HI);
  return p.outline([40, 16, 10]);
}
function cellEye() {
  const p = new PixelCanvas(S, S);
  // optic nerve tail
  for (let t = 0; t <= 1; t += 0.05) { const x = 20 + t * 8, y = 18 + Math.sin(t * 4) * 3; p.circle(x, y, 1.6 - t * 0.6, MEAT); }
  p.ball(15, 15, 7, [236, 228, 220]);
  p.circle(13, 14, 3.2, [70, 120, 60]); p.circle(13, 14, 1.6, [10, 8, 8]); p.set(12, 13, [255, 255, 255]);
  // veins
  p.line(19, 12, 21, 15, [180, 30, 30]); p.line(18, 19, 21, 17, [180, 30, 30]); p.line(10, 19, 12, 20, [190, 40, 40]);
  return p.outline(OUT_RED);
}
const STEEL = [128, 130, 140], STEEL_HI = [196, 198, 206], STEEL_DK = [64, 66, 74];
function cellGear() {
  const p = new PixelCanvas(S, S);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; p.circle(16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, 2.4, STEEL_DK); }
  p.circle(16, 16, 10, STEEL);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!p.alpha(x, y)) continue;
    const dx = x - 16, dy = y - 16;
    if (dx + dy < -8) p.set(x, y, STEEL_HI); else if (dx + dy > 9) p.set(x, y, STEEL_DK);
  }
  p.circle(16, 16, 4.5, STEEL_DK); p.circle(16, 16, 2.6, [0, 0, 0], 0);
  for (let y = 13; y < 20; y++) for (let x = 13; x < 20; x++) if ((x - 15.5) ** 2 + (y - 15.5) ** 2 < 6.5) p.data[(y * S + x) * 4 + 3] = 0;
  return p.outline([16, 16, 20]);
}
function cellPlate() {
  const p = new PixelCanvas(S, S);
  const C = [104, 108, 118];
  p.polygon([[5, 9], [25, 6], [27, 21], [17, 24], [12, 21], [6, 23]], C);
  p.polygon([[5, 9], [25, 6], [25, 9], [6, 12]], [150, 154, 164]);
  for (const [x, y] of [[8, 13], [22, 11], [23, 18], [9, 20]]) { p.set(x, y, STEEL_HI); p.set(x + 1, y + 1, STEEL_DK); }
  // hazard stripe and a dark blood smear
  for (let x = 12; x < 22; x += 3) p.line(x, 15, x + 2, 13, [200, 160, 40]);
  p.ellipse(18, 19, 4, 2, [70, 6, 8]);
  return p.outline([18, 18, 22]);
}
function cellBolt() {
  const p = new PixelCanvas(S, S);
  // wires
  for (let t = 0; t <= 1; t += 0.03) { p.set(14 + t * 12, 14 + Math.sin(t * 5) * 4 + t * 8, [200, 40, 30]); p.set(14 + t * 12, 15 + Math.sin(t * 5) * 4 + t * 8, [200, 40, 30]); }
  for (let t = 0; t <= 1; t += 0.03) { p.set(13 + t * 10, 17 + Math.cos(t * 4) * 3 + t * 9, [220, 190, 40]); }
  p.polygon([[6, 10], [12, 7], [17, 10], [17, 16], [11, 19], [6, 16]], STEEL);
  p.polygon([[6, 10], [12, 7], [17, 10], [11, 13]], STEEL_HI);
  p.circle(11.5, 13, 2, STEEL_DK);
  p.set(26, 22, [255, 230, 140]); p.set(23, 26, [255, 230, 140]);
  return p.outline([16, 16, 20]);
}
function cellSpring() {
  const p = new PixelCanvas(S, S);
  for (let t = 0; t <= 1; t += 0.005) {
    const a = t * Math.PI * 2 * 5;
    const x = 8 + t * 16, y = 16 + Math.sin(a) * 5;
    p.set(x, y, Math.cos(a) > 0 ? STEEL_HI : STEEL_DK); p.set(x, y + 1, STEEL);
  }
  return p.outline([16, 16, 20]);
}
function cellShard() {
  // neutral faceted crystal (tinted per profile)
  const p = new PixelCanvas(S, S);
  p.polygon([[16, 3], [22, 13], [19, 29], [12, 27], [10, 12]], [205, 205, 205]);
  p.polygon([[16, 3], [22, 13], [17, 15]], [255, 255, 255]);
  p.polygon([[22, 13], [19, 29], [16, 27], [17, 15]], [150, 150, 150]);
  p.polygon([[10, 12], [16, 3], [17, 15], [13, 18]], [232, 232, 232]);
  p.line(13, 18, 15, 26, [255, 255, 255]);
  p.polygon([[6, 22], [10, 17], [12, 27], [7, 28]], [180, 180, 180]);
  return p.outline([40, 40, 48]);
}

export function goreAtlasPixels() {
  const W = S * GORE_COLS, H = S * GORE_ROWS;
  const atlas = new PixelCanvas(W, H);
  const cells = {
    [GC.DROP]: cellDrop(),
    [GC.STREAK]: cellStreak(),
    [GC.MIST]: cellMist(),
    [GC.SPLAT_A]: cellSplat(31, { R: 6.5, spikes: 8, dots: 9 }),
    [GC.SPLAT_B]: cellSpray(),
    [GC.WALL_RUN]: cellWallRun(),
    [GC.POOL]: cellPool(),
    [GC.LENS_A]: cellLens(71, false),
    [GC.CHUNK]: cellChunk(),
    [GC.RIB]: cellRib(),
    [GC.GUT]: cellGut(),
    [GC.SKULL]: cellSkull(),
    [GC.GEAR]: cellGear(),
    [GC.PLATE]: cellPlate(),
    [GC.BOLT]: cellBolt(),
    [GC.LENS_TRAIL]: cellLensTrail(),
    [GC.SHARD]: cellShard(),
    [GC.FEMUR]: cellFemur(),
    [GC.SCORCH]: cellScorch(),
    [GC.LENS_B]: cellLens(73, true),
    [GC.EYE]: cellEye(),
    [GC.CHUNK2]: cellChunk2(),
    [GC.VERTEBRA]: cellVertebra(),
    [GC.SPRING]: cellSpring(),
  };
  for (const [cell, p] of Object.entries(cells)) blit(atlas, p, +cell);
  return atlas;
}

export function generateGoreAtlas() {
  return goreAtlasPixels().toCanvas();
}

// UV rect of a gore cell, inset half a texel so nearest sampling stays inside
export function goreUV(cell) {
  const c = cell % GORE_COLS, r = Math.floor(cell / GORE_COLS);
  const W = S * GORE_COLS, H = S * GORE_ROWS;
  return [(c * S + 0.5) / W, (r * S + 0.5) / H, ((c + 1) * S - 0.5) / W, ((r + 1) * S - 0.5) / H];
}
