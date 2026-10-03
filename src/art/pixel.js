// Small pixel-art toolkit used to draw every placeholder asset at runtime.
import { Rng } from '../core/rng.js';
import { makeCanvas } from '../engine/assets.js';

export function rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade([r, g, b], k) {
  if (k >= 0) return [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k].map(Math.round);
  return [r * (1 + k), g * (1 + k), b * (1 + k)].map(Math.round);
}
export function mix(a, b, t) { return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)); }

// value noise helpers ------------------------------------------------------
function h2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// tileable value noise with period p
export function tnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % p) + p) % p;
  const a = h2(m(xi), m(yi), seed), b = h2(m(xi + 1), m(yi), seed);
  const c = h2(m(xi), m(yi + 1), seed), d = h2(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function tfbm(x, y, period, seed, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * tnoise(x * f, y * f, period * f, seed + i * 17);
    n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}

export class PixelCanvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
    } else if (a > 0) {
      const t = a / 255, d = this.data;
      const da = d[i + 3] / 255;
      const oa = t + da * (1 - t);
      d[i] = (c[0] * t + d[i] * da * (1 - t)) / oa;
      d[i + 1] = (c[1] * t + d[i + 1] * da * (1 - t)) / oa;
      d[i + 2] = (c[2] * t + d[i + 2] * da * (1 - t)) / oa;
      d[i + 3] = oa * 255;
    }
  }
  setWrap(x, y, c, a) { this.set(((x % this.w) + this.w) % this.w, ((y % this.h) + this.h) % this.h, c, a); }
  get(x, y) {
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }
  fill(c) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c); return this; }
  rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  rectWrap(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.setWrap(x + i, y + j, c, a); }
  hline(x0, x1, y, c, a) { for (let x = x0; x <= x1; x++) this.set(x, y, c, a); }
  vline(x, y0, y1, c, a) { for (let y = y0; y <= y1; y++) this.set(x, y, c, a); }
  line(x0, y0, x1, y1, c, a) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  circle(cx, cy, r, c, a) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r) this.set(x, y, c, a);
  }
  ellipse(cx, cy, rx, ry, c, a) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx + 0.5) / rx) ** 2 + ((y - cy + 0.5) / ry) ** 2 <= 1) this.set(x, y, c, a);
  }
  // shaded sphere-ish blob (lit from top-left)
  ball(cx, cy, r, base) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = (x - cx + 0.5) / r, dy = (y - cy + 0.5) / r;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const l = -dx * 0.5 - dy * 0.6 + Math.sqrt(1 - d) * 0.6;
        this.set(x, y, shade(base, Math.max(-0.6, Math.min(0.5, l - 0.25))));
      }
  }
  polygon(pts, c, a) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y + 0.5 && y1 > y + 0.5) || (y1 <= y + 0.5 && y0 > y + 0.5)) {
          xs.push(x0 + ((y + 0.5 - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c, a);
    }
  }
  // dark outline around opaque pixels (classic sprite look)
  outline(c = [10, 6, 8]) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 0) continue;
        if (this.alpha(x - 1, y) > 128 || this.alpha(x + 1, y) > 128 || this.alpha(x, y - 1) > 128 || this.alpha(x, y + 1) > 128) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }
  // per-pixel noise jitter on opaque pixels
  grain(amount, seed = 1) {
    const r = new Rng(seed);
    for (let i = 0; i < this.data.length; i += 4) {
      if (!this.data[i + 3]) continue;
      const k = (r.next() - 0.5) * amount;
      this.data[i] += k; this.data[i + 1] += k; this.data[i + 2] += k;
    }
    return this;
  }
  flipX() {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const si = (y * this.w + x) * 4, di = (y * this.w + (this.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = this.data[si + k];
    }
    return out;
  }
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      const a = src.data[i + 3];
      if (a) this.set(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2]], a);
    }
  }
  toCanvas() {
    const c = makeCanvas(this.w, this.h);
    c.getContext('2d').putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return c;
  }
}
