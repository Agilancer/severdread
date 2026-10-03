// Procedural 64x64 tileable placeholder textures. Each generator takes a
// palette {base, alt, accent, dark} (hex strings) and a seed. Real uploaded
// textures with matching tags are always preferred over these.
import { PixelCanvas, rgb, shade, mix, tfbm, tnoise } from './pixel.js';
import { Rng } from '../core/rng.js';

const S = 64;

function noiseFill(p, base, amt, seed, scale = 8) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tfbm(x / scale, y / scale, S / scale, seed, 3) - 0.5;
    p.set(x, y, shade(base, n * amt));
  }
}

function bevelRect(p, x, y, w, h, base, depth = 1, hi = 0.25, lo = -0.35) {
  p.rectWrap(x, y, w, h, base);
  for (let d = 0; d < depth; d++) {
    for (let i = 0; i < w; i++) { p.setWrap(x + i, y + d, shade(base, hi)); p.setWrap(x + i, y + h - 1 - d, shade(base, lo)); }
    for (let j = 0; j < h; j++) { p.setWrap(x + d, y + j, shade(base, hi * 0.7)); p.setWrap(x + w - 1 - d, y + j, shade(base, lo * 0.8)); }
  }
}

function rivet(p, x, y, base) {
  p.setWrap(x, y, shade(base, 0.45)); p.setWrap(x + 1, y + 1, shade(base, -0.5)); p.setWrap(x + 1, y, shade(base, 0.1)); p.setWrap(x, y + 1, shade(base, -0.2));
}

function crack(p, r, base, n = 3, len = 20) {
  for (let k = 0; k < n; k++) {
    let x = r.int(0, S - 1), y = r.int(0, S - 1);
    let a = r.float(0, Math.PI * 2);
    for (let i = 0; i < len; i++) {
      p.setWrap(Math.round(x), Math.round(y), shade(base, -0.55));
      p.setWrap(Math.round(x) + 1, Math.round(y), shade(base, 0.12), 120);
      a += r.float(-0.6, 0.6);
      x += Math.cos(a); y += Math.sin(a);
    }
  }
}

function stains(p, r, color, n = 4, amt = 90) {
  for (let k = 0; k < n; k++) {
    const cx = r.int(0, S), cy = r.int(0, S), rad = r.int(4, 12);
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      const d = Math.sqrt(x * x + y * y) / rad;
      if (d < 1 && tnoise((cx + x) / 3, (cy + y) / 3, 64, k) > d * 0.8) p.setWrap(cx + x, cy + y, color, amt * (1 - d));
    }
  }
}

export const TEXGEN = {
  metal_panel(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.18, seed, 4);
    const cols = r.pick([1, 2, 2, 4]), rows = r.pick([1, 2, 2, 4]);
    const pw = S / cols, ph = S / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const b = shade(base, r.float(-0.08, 0.08));
      bevelRect(p, i * pw, j * ph, pw, ph, b, 1);
      for (let y = 2; y < ph - 2; y++) for (let x = 2; x < pw - 2; x++) {
        const n = tnoise((i * pw + x) / 3, (j * ph + y) / 3, 64, seed) - 0.5;
        p.setWrap(i * pw + x, j * ph + y, shade(b, n * 0.12));
      }
      rivet(p, i * pw + 2, j * ph + 2, b); rivet(p, i * pw + pw - 4, j * ph + 2, b);
      rivet(p, i * pw + 2, j * ph + ph - 4, b); rivet(p, i * pw + pw - 4, j * ph + ph - 4, b);
    }
    if (pal.accent && r.chance(0.5)) {
      const ac = rgb(pal.accent), y = r.int(8, 52);
      p.rect(0, y, S, 2, ac); p.rect(0, y + 2, S, 1, shade(ac, -0.5));
    }
    stains(p, r, shade(base, -0.6), 3, 60);
    return p;
  },

  tech_panel(pal, seed) {
    const r = new Rng(seed);
    const p = TEXGEN.metal_panel({ ...pal, accent: null }, seed);
    const ac = rgb(pal.accent || '#33ddff'), dark = rgb(pal.dark || '#0a0c10');
    const kind = r.int(0, 3);
    if (kind === 0) { // light strips
      for (const x of [10, 52]) { p.rect(x, 6, 3, 52, dark); p.rect(x + 1, 8, 1, 48, ac); }
    } else if (kind === 1) { // screen
      p.rect(14, 12, 36, 24, dark);
      for (let y = 14; y < 34; y += 2) p.hline(16, 16 + r.int(8, 30), y, shade(ac, -0.2));
      p.rect(14, 12, 36, 1, shade(ac, 0.3));
    } else if (kind === 2) { // vent + lights
      p.rect(8, 20, 48, 24, dark);
      for (let y = 22; y < 42; y += 3) p.hline(10, 53, y, shade(rgb(pal.base), -0.2));
      for (let i = 0; i < 4; i++) p.rect(12 + i * 12, 48, 4, 3, i % 2 ? ac : shade(ac, -0.5));
    } else { // circuitry lines
      for (let k = 0; k < 6; k++) {
        let x = r.int(4, 60), y = r.int(4, 60);
        for (let i = 0; i < 20; i++) { p.set(x, y, ac); if (r.chance(0.5)) x += r.sign(); else y += r.sign(); }
        p.rect(x - 1, y - 1, 3, 3, shade(ac, 0.4));
      }
    }
    return p;
  },

  grate(pal, seed) {
    const base = rgb(pal.base), dark = rgb(pal.dark || '#050505'), p = new PixelCanvas(S, S);
    p.fill(dark);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (x % 8 < 2 || y % 8 < 2) p.set(x, y, shade(base, (x % 8 === 0 || y % 8 === 0) ? 0.2 : -0.15));
    }
    return p.grain(18, seed);
  },

  hex(pal, seed) {
    const base = rgb(pal.base), line = rgb(pal.dark || '#111'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.2, seed, 6);
    // hex grid lines (tileable on 64)
    const hw = 16, hh = 16;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = Math.floor(y / hh);
      const ox = row % 2 ? hw / 2 : 0;
      const lx = ((x + ox) % hw), ly = y % hh;
      if (ly === 0 || (lx === 0 && ly < hh)) p.set(x, y, line);
      if (ly === 1) p.set(x, y, shade(base, 0.25));
    }
    if (pal.accent) { const ac = rgb(pal.accent); p.set(8, 8, ac); p.set(40, 24, ac); p.set(24, 40, ac); p.set(56, 56, ac); }
    return p;
  },

  concrete(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.22, seed, 5);
    p.grain(14, seed);
    if (r.chance(0.6)) { p.rect(0, 31, S, 1, shade(base, -0.3)); p.rect(31, 0, 1, S, shade(base, -0.3)); }
    crack(p, r, base, r.int(1, 3), 26);
    stains(p, r, shade(base, -0.5), 3, 70);
    return p;
  },

  asphalt(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#2a2a2e'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.25, seed, 2);
    p.grain(26, seed);
    if (pal.lines) {
      const lc = rgb(pal.accent || '#e8d24a');
      for (let y = 0; y < 40; y++) { p.set(31, y, lc); p.set(32, y, lc); }
    }
    crack(p, r, base, 2, 18);
    return p;
  },

  sand(pal, seed) {
    const base = rgb(pal.base || '#c8a26a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ripple = Math.sin((y + tnoise(x / 10, y / 10, 6.4, seed) * 10) * 0.6) * 0.06;
      p.set(x, y, shade(base, ripple + (tnoise(x / 2, y / 2, 32, seed + 3) - 0.5) * 0.18));
    }
    return p;
  },

  grass(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#3d5a26'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.3, seed, 4);
    for (let i = 0; i < 260; i++) {
      const x = r.int(0, 63), y = r.int(0, 63);
      p.setWrap(x, y, shade(base, r.float(0.1, 0.35))); p.setWrap(x, y - 1, shade(base, r.float(0.0, 0.25)));
    }
    return p;
  },

  snow(pal, seed) {
    const base = rgb(pal.base || '#dfe8f2'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.12, seed, 6);
    return p.grain(10, seed);
  },

  rock(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#6a5a4c'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / 12, y / 12, S / 12, seed, 4);
      const ridge = Math.abs(tfbm(x / 16, y / 16, 4, seed + 9, 3) - 0.5) < 0.03 ? -0.4 : 0;
      p.set(x, y, shade(base, (n - 0.5) * 0.55 + ridge));
    }
    crack(p, r, base, 3, 22);
    if (pal.accent) stains(p, r, rgb(pal.accent), 2, 80);
    return p;
  },

  brick(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#8a3b2a'), mortar = rgb(pal.dark || '#3a3330'), p = new PixelCanvas(S, S);
    p.fill(mortar);
    const bh = 8, bw = 16;
    for (let row = 0; row < S / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let i = -1; i < S / bw + 1; i++) {
        const b = shade(base, r.float(-0.15, 0.12));
        const x0 = i * bw + off + 1, y0 = row * bh + 1;
        for (let y = 0; y < bh - 2; y++) for (let x = 0; x < bw - 2; x++) {
          const n = tnoise((x0 + x) / 2, (y0 + y) / 2, 32, seed) - 0.5;
          p.setWrap(x0 + x, y0 + y, shade(b, n * 0.2 + (y === 0 ? 0.15 : y === bh - 3 ? -0.2 : 0)));
        }
      }
    }
    crack(p, r, base, 1, 12);
    return p;
  },

  tile(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#9a9a9a'), alt = pal.alt ? rgb(pal.alt) : null, grout = rgb(pal.dark || '#303030'), p = new PixelCanvas(S, S);
    const n = pal.size || 16;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const tx = Math.floor(x / n), ty = Math.floor(y / n);
      const b = alt && (tx + ty) % 2 ? alt : base;
      if (x % n === 0 || y % n === 0) p.set(x, y, grout);
      else p.set(x, y, shade(b, (tnoise(x / 3, y / 3, 64 / 3, seed) - 0.5) * 0.15 + (x % n === 1 || y % n === 1 ? 0.12 : 0)));
    }
    stains(p, r, shade(base, -0.55), 2, 50);
    return p;
  },

  wood(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#6b4426'), p = new PixelCanvas(S, S);
    const pw = 16;
    for (let x = 0; x < S; x++) {
      const plank = Math.floor(x / pw);
      const b = shade(base, ((plank * 37) % 7) / 40 - 0.08);
      for (let y = 0; y < S; y++) {
        const g = Math.sin((x * 0.9 + tnoise(x / 4, y / 16, 16, seed + plank) * 6)) * 0.08;
        let c = shade(b, g + (tnoise(x / 2, y / 6, 32, seed) - 0.5) * 0.15);
        if (x % pw === 0) c = shade(base, -0.6);
        if (x % pw === 1) c = shade(b, 0.12);
        p.set(x, y, c);
      }
      if (r.chance(0.08)) { const y = r.int(0, 63); p.set(x, y, shade(base, -0.5)); }
    }
    for (let i = 0; i < 4; i++) { p.set(i * 16 + 3, 6, [40, 40, 40]); p.set(i * 16 + 12, 56, [40, 40, 40]); }
    return p;
  },

  carpet(pal, seed) {
    const base = rgb(pal.base || '#5a1a24'), alt = rgb(pal.alt || '#a8862c'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = Math.abs(((x + 8) % 16) - 8), dy = Math.abs(((y + 8) % 16) - 8);
      let c = base;
      if (dx + dy === 6) c = alt;
      else if (dx + dy < 2) c = shade(alt, -0.2);
      p.set(x, y, shade(c, (tnoise(x, y, 64, seed) - 0.5) * 0.2));
    }
    return p;
  },

  neon_grid(pal, seed) {
    const base = rgb(pal.base || '#07040f'), ac = rgb(pal.accent || '#ff2bd6'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.3, seed, 8);
    for (let i = 0; i < S; i++) {
      for (const k of [0, 32]) { p.set(i, k, ac); p.set(k, i, ac); p.set(i, k + 1, shade(ac, -0.5)); p.set(k + 1, i, shade(ac, -0.5)); }
    }
    if (pal.alt) { const a2 = rgb(pal.alt); for (let i = 0; i < S; i++) { p.set(i, 16, a2, 90); p.set(i, 48, a2, 90); p.set(16, i, a2, 90); p.set(48, i, a2, 90); } }
    return p;
  },

  cloud(pal, seed) {
    const base = rgb(pal.base || '#f4f0ff'), alt = rgb(pal.alt || '#d8c8ff'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / 16, y / 16, 4, seed, 4);
      p.set(x, y, mix(alt, base, Math.min(1, Math.max(0, (n - 0.3) * 2))));
    }
    return p;
  },

  flesh(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#7a1c1c'), vein = rgb(pal.accent || '#3a0508'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / 10, y / 10, 6.4, seed, 4);
      p.set(x, y, shade(base, (n - 0.5) * 0.6 + (Math.abs(tnoise(x / 8, y / 8, 8, seed + 5) - 0.5) < 0.04 ? -0.5 : 0)));
    }
    for (let k = 0; k < 5; k++) {
      let x = r.int(0, 63), y = r.int(0, 63), a = r.float(0, 6.28);
      for (let i = 0; i < 30; i++) { p.setWrap(x | 0, y | 0, vein); a += r.float(-0.5, 0.5); x += Math.cos(a); y += Math.sin(a); }
    }
    return p;
  },

  crystal(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#5a2a9a'), p = new PixelCanvas(S, S);
    noiseFill(p, shade(base, -0.5), 0.2, seed, 6);
    for (let k = 0; k < 9; k++) {
      const cx = r.int(0, 63), cy = r.int(0, 63), h = r.int(8, 20), w = r.int(3, 6);
      for (let y = 0; y < h; y++) {
        const ww = Math.max(1, Math.round(w * (1 - y / h)));
        for (let x = -ww; x <= ww; x++) p.setWrap(cx + x, cy - y, shade(base, x < 0 ? 0.35 : -0.1));
      }
    }
    return p;
  },

  windows(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#3a3f48'), glass = rgb(pal.alt || '#1a2a3a'), lit = rgb(pal.accent || '#ffd27a'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.15, seed, 6);
    const cw = pal.cell || 16, ch = pal.cellH || 16;
    for (let j = 0; j < S / ch; j++) for (let i = 0; i < S / cw; i++) {
      const on = r.chance(pal.litChance ?? 0.3);
      const broken = r.chance(pal.broken ?? 0.1);
      const x0 = i * cw + 3, y0 = j * ch + 3, w = cw - 6, h = ch - 5;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let c = on ? shade(lit, -y / h * 0.3) : shade(glass, (x + y) % 7 === 0 ? 0.25 : 0);
        if (broken && (x + y * 2) % 5 < 2) c = [8, 8, 10];
        p.set(x0 + x, y0 + y, c);
      }
      p.rect(x0 - 1, y0 + h, w + 2, 1, shade(base, 0.25));
    }
    return p;
  },

  corrugated(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#8a2a1a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ridge = Math.sin(x / 4 * Math.PI) * 0.18;
      p.set(x, y, shade(base, ridge + (tnoise(x / 3, y / 3, 64 / 3, seed) - 0.5) * 0.12));
    }
    if (pal.accent) { const ac = rgb(pal.accent); p.rect(0, 44, S, 6, ac); p.rect(0, 50, S, 1, shade(ac, -0.5)); }
    stains(p, r, [70, 40, 20], 4, 90);
    p.rect(0, 0, S, 2, shade(base, -0.4));
    return p;
  },

  train_side(pal, seed) {
    const base = rgb(pal.base || '#9aa4ae'), glass = rgb(pal.alt || '#203040'), ac = rgb(pal.accent || '#d03030'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.12, seed, 6);
    p.rect(0, 14, S, 18, shade(base, -0.15));
    for (let i = 0; i < 4; i++) { p.rect(i * 16 + 2, 16, 12, 14, glass); p.rect(i * 16 + 3, 17, 4, 2, shade(glass, 0.4)); }
    p.rect(0, 38, S, 4, ac); p.rect(0, 42, S, 1, shade(ac, -0.5));
    p.rect(0, 60, S, 4, shade(base, -0.5));
    return p;
  },

  lava(pal, seed) {
    const base = rgb(pal.base || '#ff5a00'), dark = rgb(pal.dark || '#3a0800'), hot = rgb(pal.accent || '#ffe14a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / 14, y / 14, 64 / 14 * 1, seed, 4);
      const t = Math.abs(n - 0.5) * 2;
      p.set(x, y, t < 0.15 ? mix(hot, base, t / 0.15) : t < 0.45 ? mix(base, dark, (t - 0.15) / 0.3) : shade(dark, -(t - 0.45) * 0.6));
    }
    return p;
  },

  water(pal, seed) {
    const base = rgb(pal.base || '#1a4a7a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / 12, y / 12, 64 / 12, seed, 3);
      const caustic = Math.abs(n - 0.5) < 0.04 ? 0.35 : 0;
      p.set(x, y, shade(base, (n - 0.5) * 0.4 + caustic));
    }
    return p;
  },

  ice(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#a8d8f0'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.2, seed, 10);
    crack(p, r, shade(base, 0.2), 4, 24);
    return p;
  },

  circuit(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#0a3a1a'), ac = rgb(pal.accent || '#4aff7a'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.2, seed, 8);
    for (let k = 0; k < 10; k++) {
      let x = r.int(0, 63), y = r.int(0, 63);
      const horiz = r.chance(0.5);
      for (let i = 0; i < r.int(10, 30); i++) { p.setWrap(x, y, shade(ac, -0.35)); if (horiz) x++; else y++; if (r.chance(0.1)) { if (horiz) y += r.sign(); else x += r.sign(); } }
      p.rectWrap(x - 1, y - 1, 3, 3, ac);
    }
    for (let k = 0; k < 4; k++) { const x = r.int(4, 50), y = r.int(4, 50); p.rect(x, y, 10, 6, [20, 20, 24]); for (let i = 0; i < 5; i++) { p.set(x + i * 2, y - 1, [180, 180, 180]); p.set(x + i * 2, y + 6, [180, 180, 180]); } }
    return p;
  },

  hazard(pal, seed) {
    const a = rgb(pal.base || '#e8c020'), b = rgb(pal.dark || '#151515'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, ((x + y) % 16) < 8 ? a : b);
    return p.grain(20, seed);
  },

  pipes(pal, seed) {
    const base = rgb(pal.base || '#5a5a60'), bg = rgb(pal.dark || '#1a1a1e'), p = new PixelCanvas(S, S);
    noiseFill(p, bg, 0.2, seed, 6);
    for (const [y, r] of [[8, 4], [22, 6], [40, 3], [52, 5]]) {
      for (let dy = -r; dy <= r; dy++) {
        const l = -dy / r * 0.4 + (1 - Math.abs(dy / r)) * 0.2;
        p.hline(0, 63, y + dy, shade(base, l));
      }
      for (let x = 6; x < S; x += 24) p.rect(x, y - r - 1, 3, r * 2 + 3, shade(base, -0.3));
    }
    return p;
  },

  speaker(pal, seed) {
    const base = rgb(pal.base || '#151515'), cone = rgb(pal.alt || '#2a2a2a'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.2, seed, 2);
    for (const [cx, cy, rr] of [[32, 20, 13], [32, 50, 10]]) {
      p.circle(cx, cy, rr, shade(cone, -0.3));
      p.circle(cx, cy, rr - 2, cone);
      p.circle(cx, cy, rr * 0.35, shade(cone, 0.3));
    }
    p.rect(0, 0, S, 1, [60, 60, 60]); p.rect(0, 0, 1, S, [60, 60, 60]);
    return p;
  },

  curtain(pal, seed) {
    const base = rgb(pal.base || '#8a0a1a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fold = Math.sin(x / 8 * Math.PI * 2) * 0.3 + (tnoise(x / 4, y / 16, 16, seed) - 0.5) * 0.1;
      p.set(x, y, shade(base, fold));
    }
    return p;
  },

  shelves(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#c8c8c0'), p = new PixelCanvas(S, S);
    p.fill(shade(base, -0.5));
    const colors = ['#d03030', '#3070d0', '#e0c030', '#30a050', '#e07020', '#a040c0', '#f0f0f0'].map(rgb);
    for (let row = 0; row < 4; row++) {
      const y0 = row * 16;
      p.rect(0, y0 + 13, S, 3, base); p.rect(0, y0 + 15, S, 1, shade(base, -0.4));
      let x = 1;
      while (x < S - 2) {
        const w = r.int(3, 8), h = r.int(6, 12), c = r.pick(colors);
        p.rect(x, y0 + 13 - h, w, h, c); p.rect(x, y0 + 13 - h, 1, h, shade(c, 0.3)); p.rect(x + w - 1, y0 + 13 - h, 1, h, shade(c, -0.3));
        x += w + 1;
      }
    }
    return p;
  },

  wallpaper(pal, seed) {
    const base = rgb(pal.base || '#c8b46a'), alt = rgb(pal.alt || '#a8944a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = base;
      if (x % 16 === 0 || x % 16 === 1) c = alt;
      if ((x % 16 === 8) && (y % 8 < 4)) c = shade(alt, 0.1);
      p.set(x, y, shade(c, (tnoise(x / 6, y / 6, 64 / 6, seed) - 0.5) * 0.18));
    }
    const r = new Rng(seed); stains(p, r, shade(base, -0.45), 3, 70);
    return p;
  },

  ceiling_tile(pal, seed) {
    const base = rgb(pal.base || '#d8d4c4'), grid = rgb(pal.dark || '#8a8678'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(base, (tnoise(x, y, 64, seed) - 0.5) * 0.12);
      if (x % 32 === 0 || y % 32 === 0) c = grid;
      if (pal.light && x > 34 && x < 62 && y > 2 && y < 30) c = [255, 252, 230];
      p.set(x, y, c);
    }
    return p;
  },

  marble(pal, seed) {
    const base = rgb(pal.base || '#e8e4dc'), vein = rgb(pal.accent || '#9a948a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / 16, y / 16, 4, seed, 5);
      const v = Math.abs(Math.sin((x + y) * 0.06 + n * 8));
      p.set(x, y, v < 0.08 ? vein : shade(base, (n - 0.5) * 0.15));
    }
    return p;
  },

  gold(pal, seed) {
    const base = rgb(pal.base || '#c89a2a'), p = TEXGEN.metal_panel({ base: pal.base || '#c89a2a' }, seed);
    for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) { p.set(x + 8, y + 8, shade(base, 0.6)); }
    return p;
  },

  bone(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#d8ccb0'), p = new PixelCanvas(S, S);
    noiseFill(p, rgb(pal.dark || '#2a2018'), 0.3, seed, 4);
    for (let k = 0; k < 26; k++) {
      const x = r.int(0, 63), y = r.int(0, 63), len = r.int(6, 14), a = r.float(0, 3.14);
      for (let i = 0; i < len; i++) { p.setWrap(Math.round(x + Math.cos(a) * i), Math.round(y + Math.sin(a) * i), shade(base, -0.1 + (i === 0 || i === len - 1 ? 0.2 : 0))); }
      if (r.chance(0.25)) { p.circle(x, y, 3, base); p.set(x - 1, y, [20, 15, 10]); p.set(x + 1, y, [20, 15, 10]); }
    }
    return p;
  },

  door(pal, seed) {
    const base = rgb(pal.base || '#5a5e66'), stripe = pal.accent ? rgb(pal.accent) : null, p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.12, seed, 4);
    bevelRect(p, 0, 0, S, S, base, 2);
    bevelRect(p, 6, 6, 52, 52, shade(base, -0.08), 1, -0.3, 0.2);
    for (let y = 10; y < 54; y += 6) p.hline(10, 53, y, shade(base, -0.25));
    if (stripe) {
      p.rect(0, 26, S, 12, shade(stripe, -0.3));
      p.rect(2, 28, S - 4, 8, stripe);
      p.rect(26, 22, 12, 20, shade(stripe, -0.5));
      p.rect(28, 24, 8, 16, shade(stripe, 0.4));
    } else {
      const h = rgb('#e0b020'), k = rgb('#151515');
      for (let x = 0; x < S; x++) for (let y = 58; y < 64; y++) p.set(x, y, ((x + y) % 8) < 4 ? h : k);
    }
    return p;
  },

  teleporter(pal, seed) {
    const base = rgb(pal.base || '#202830'), ac = rgb(pal.accent || '#40e0ff'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.2, seed, 6);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5);
      if (Math.abs(d - 26) < 1.5 || Math.abs(d - 18) < 1 || Math.abs(d - 9) < 1) p.set(x, y, ac);
      if (d < 6) p.set(x, y, shade(ac, 0.5));
    }
    return p;
  },

  screen_wall(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#1a1e24'), ac = rgb(pal.accent || '#40ff90'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.2, seed, 4);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x0 = i * 32 + 3, y0 = j * 32 + 4;
      p.rect(x0 - 1, y0 - 1, 28, 22, [8, 8, 8]);
      p.rect(x0, y0, 26, 20, shade(ac, -0.75));
      for (let y = 2; y < 18; y += 3) p.hline(x0 + 2, x0 + 2 + r.int(5, 22), y0 + y, shade(ac, -0.1));
    }
    return p;
  },

  scales(pal, seed) {
    const base = rgb(pal.base || '#5a3a2a'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = Math.floor(y / 8), ox = row % 2 ? 4 : 0;
      const lx = (x + ox) % 8 - 4, ly = y % 8;
      const d = Math.hypot(lx, ly - 1);
      p.set(x, y, shade(base, d > 4.2 ? -0.5 : 0.25 - ly * 0.07));
    }
    return p.grain(12, seed);
  },

  hedge(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#2a4a1a'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.5, seed, 3);
    for (let i = 0; i < 300; i++) p.setWrap(r.int(0, 63), r.int(0, 63), shade(base, r.float(-0.4, 0.4)));
    return p;
  },

  starfield(pal, seed) {
    const r = new Rng(seed), p = new PixelCanvas(S, S);
    p.fill(rgb(pal.base || '#02030a'));
    for (let i = 0; i < 40; i++) p.set(r.int(0, 63), r.int(0, 63), shade([200, 210, 255], r.float(-0.5, 0.2)));
    return p;
  },
};

// ---------------------------------------------------------------------------
// Role placeholders (data/texroles.js PH): objects and fittings that no
// uploaded tile depicts - spike metal, light fixtures, neon tubes, glazing,
// stair treads, road paint, carpets, crates, consoles, bookshelves, altars,
// arcade cabinets, rune tablets, cinema screens, tent canvas.
const carpetPlain = TEXGEN.carpet, screenPlain = TEXGEN.screen_wall;
const radial = (x, y, cx, cy, r) => Math.max(0, 1 - Math.hypot(x - cx, y - cy) / r);

Object.assign(TEXGEN, {
  // metal for 3D spike pyramids: the tip is at the top of the tile (v = 0)
  spikes(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#9a9ea6'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const t = y / (S - 1);
      const ridge = Math.max(0, 1 - Math.abs(x - 31.5) / 3) * 0.3 * (1 - t * 0.5);
      const side = x < 32 ? 0.1 : -0.12;
      const streak = (tnoise(x / 1.3, y / 14, 64 / 1.3, seed) - 0.5) * 0.3;
      p.set(x, y, shade(base, 0.3 - t * 0.6 + ridge + side + streak));
    }
    for (let k = 0; k < 12; k++) {
      const x = r.int(6, 57), y = r.int(10, 58), l = r.int(3, 8);
      for (let i = 0; i < l; i++) p.set(x + (i >> 2), y + i, shade(base, 0.5), 150);
    }
    for (let y = 40; y < S; y++) for (let x = 0; x < S; x++) {
      if (tnoise(x / 3, y / 3, 64 / 3, seed + 5) > 0.6 + (S - y) / 70) p.set(x, y, [92, 50, 24], 160);
    }
    if (pal.accent) { const ac = rgb(pal.accent); for (let y = 0; y < S; y++) { p.set(31, y, shade(ac, 0.3)); p.set(32, y, ac); } }
    const blood = pal.blood ?? 0.6;
    if (blood > 0) {
      const bc = [118, 6, 10];
      const capH = 6 + Math.round(blood * 10);
      for (let y = 0; y < capH; y++) {
        const hw = 3 + y * 0.9;
        for (let x = Math.floor(32 - hw); x <= Math.ceil(32 + hw); x++) {
          if (tnoise(x / 2, y / 2, 32, seed + 9) > 0.25 + y / capH * 0.5) p.set(x, y, shade(bc, (tnoise(x, y, 64, seed) - 0.5) * 0.3), 235);
        }
      }
      const drips = 2 + Math.round(blood * 4);
      for (let k = 0; k < drips; k++) {
        const x = r.int(22, 42), len = r.int(10, 18 + Math.round(blood * 28)), w = r.chance(0.4) ? 2 : 1;
        for (let i = 0; i < len; i++) { p.rect(x, i, w, 1, shade(bc, -0.1 * (i / len)), 225); if (i % 5 === 1) p.set(x, i, shade(bc, 0.35), 160); }
        p.circle(x + w / 2, len, 1.6, bc, 230);
      }
    }
    return p;
  },

  // emissive light fixtures (used with uv 'fit' on lamp boxes)
  light_panel(pal, seed) {
    const r = new Rng(seed), glow = rgb(pal.base || '#f2f6ff'), frame = rgb(pal.frame || '#8a9098'), p = new PixelCanvas(S, S);
    const kind = pal.kind || 'panel';
    const hot = mix(glow, [255, 255, 255], 0.6);
    if (kind === 'fluor') {
      p.fill(frame);
      bevelRect(p, 0, 0, S, S, frame, 2);
      for (let y = 5; y < 59; y++) for (let x = 5; x < 59; x++) p.set(x, y, shade(glow, -0.3 + 0.08 * Math.sin(y / 54 * Math.PI)));
      for (const cy of [18, 44]) for (let y = cy - 4; y <= cy + 4; y++) {
        const d = Math.abs(y - cy) / 4;
        for (let x = 9; x < 55; x++) p.set(x, y, mix(hot, glow, d * 0.8));
        p.rect(6, y, 3, 1, shade(frame, -0.2)); p.rect(55, y, 3, 1, shade(frame, -0.2));
      }
      for (const x of [21, 42]) p.rect(x, 5, 1, 54, shade(frame, 0.15), 140);
    } else if (kind === 'panel') {
      p.fill(frame);
      for (let y = 3; y < 61; y++) for (let x = 3; x < 61; x++) p.set(x, y, mix(glow, hot, radial(x, y, 32, 32, 40) * 0.8));
      p.rect(31, 3, 2, 58, shade(frame, 0.1)); p.rect(3, 31, 58, 2, shade(frame, 0.1));
      for (let i = 0; i < 64; i++) { p.set(i, 0, shade(frame, 0.3)); p.set(0, i, shade(frame, 0.2)); p.set(i, 63, shade(frame, -0.4)); p.set(63, i, shade(frame, -0.3)); }
    } else if (kind === 'lantern') {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const flick = (tnoise(x / 6, y / 9, 64 / 6, seed) - 0.5) * 0.25;
        const f = radial(x, y * 1.2, 32, 38 * 1.2, 30);
        p.set(x, y, shade(mix(glow, [255, 250, 210], f * 0.9), -0.25 + f * 0.25 + flick));
      }
      p.ellipse(32, 36, 3, 6, [255, 255, 235]);
      for (let k = 0; k < 64; k++) for (const o of [0, 32]) { p.setWrap(k + o, k, shade(frame, 0.2), 180); p.setWrap(o - k, k, shade(frame, 0.2), 180); }
      for (const x of [0, 30, 61]) p.rect(x, 0, 3, S, frame);
      for (const y of [0, 61]) p.rect(0, y, S, 3, frame);
      p.rect(0, 0, S, 6, shade(frame, 0.15)); p.rect(0, 6, S, 1, shade(frame, -0.4));
    } else if (kind === 'fire') {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const n = tfbm(x / 10, y / 7 + tnoise(x / 9, 0, 64 / 9, seed) * 2, 6.4, seed, 4);
        const t = Math.min(1, Math.max(0, n * 1.6 - 0.25 + (y / S) * 0.4));
        p.set(x, y, t > 0.75 ? mix(glow, [255, 240, 160], (t - 0.75) * 4) : mix([60, 8, 2], glow, t / 0.75));
      }
      for (let k = 0; k < S; k += 16) { p.rect(k, 0, 2, S, frame); p.rect(0, k, S, 2, frame); }
    } else if (kind === 'orb') {
      noiseFill(p, frame, 0.4, seed, 5);
      for (let k = 0; k < 5; k++) {
        const cx = r.int(8, 56), cy = r.int(8, 56), rad = r.int(6, 11);
        for (let y = -rad - 4; y <= rad + 4; y++) for (let x = -rad - 4; x <= rad + 4; x++) {
          const d = Math.hypot(x, y) / rad;
          if (d < 1) p.setWrap(cx + x, cy + y, mix(hot, glow, d));
          else if (d < 1.4) p.setWrap(cx + x, cy + y, glow, Math.round(160 * (1.4 - d) / 0.4));
        }
      }
    } else if (kind === 'bulbs') {
      noiseFill(p, frame, 0.2, seed, 4);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const cx = 11 + i * 21, cy = 11 + j * 21;
        p.circle(cx, cy, 8, shade(frame, -0.5));
        for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) { const d = Math.hypot(x, y) / 7; if (d < 1) p.set(cx + x, cy + y, mix(hot, glow, d * d)); }
      }
    } else { // 'lamp': a glowing fabric shade
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const pleat = Math.sin(x / 4 * Math.PI) * 0.06;
        p.set(x, y, shade(mix(glow, hot, y / S * 0.6), pleat - 0.15 + (y / S) * 0.15));
      }
      p.rect(0, 0, S, 4, frame); p.rect(0, 58, S, 6, hot);
    }
    return p;
  },

  // neon tubes on a dark wall (emissive slot: the wall stays dark, the tube glows)
  neon_strip(pal, seed) {
    const base = rgb(pal.base || '#0c0814'), ac = rgb(pal.accent || '#ff2bd6'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.35, seed, 6);
    for (const cy of [20, 44]) for (let y = cy - 10; y <= cy + 10; y++) {
      const d = Math.abs(y - cy);
      for (let x = 0; x < S; x++) {
        if (d === 0) p.set(x, y, mix(ac, [255, 255, 255], 0.75));
        else if (d === 1) p.set(x, y, mix(ac, [255, 255, 255], 0.35));
        else if (d <= 3) p.set(x, y, ac);
        else p.set(x, y, ac, Math.round(120 * (1 - (d - 3) / 8)));
      }
    }
    for (const cx of [10, 42]) for (const cy of [20, 44]) { p.rect(cx, cy - 4, 3, 9, [34, 34, 42]); p.set(cx, cy - 4, [90, 90, 100]); }
    return p;
  },

  // neon sign (uv 'fit' on sign boards): a tube border around tube "lettering"
  neon_sign(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#0c0814'), ac = rgb(pal.accent || '#ff2bd6'), a2 = rgb(pal.alt || '#2bd6ff'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.3, seed, 6);
    const tube = (pts, c) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        for (let o = -3; o <= 3; o++) if (o) { p.line(x0 + o, y0, x1 + o, y1, c, 34); p.line(x0, y0 + o, x1, y1 + o, c, 34); }
        p.line(x0, y0, x1, y1, c); p.line(x0 + 1, y0, x1 + 1, y1, c);
        p.line(x0, y0 + 1, x1, y1 + 1, mix(c, [255, 255, 255], 0.7));
      }
    };
    tube([[5, 6], [58, 6], [58, 57], [5, 57], [5, 6]], ac);
    // three abstract glyphs
    for (let k = 0; k < 3; k++) {
      const x = 12 + k * 15, y = 18, w = 10, h = 26;
      const g = r.int(0, 3);
      if (g === 0) tube([[x, y + h], [x, y], [x + w, y], [x + w, y + h]], a2);
      else if (g === 1) tube([[x + w, y], [x, y], [x, y + h / 2], [x + w, y + h / 2], [x + w, y + h], [x, y + h]], a2);
      else if (g === 2) tube([[x, y], [x, y + h], [x + w, y + h]], a2);
      else tube([[x, y + h], [x + w / 2, y], [x + w, y + h]], a2);
    }
    return p;
  },

  // solid worn road / floor paint (uv 'fit' on thin marking strips)
  paint(pal, seed) {
    const base = rgb(pal.base || '#e8e4d8'), under = rgb(pal.dark || '#3a3a3e'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tnoise(x / 3, y / 3, 64 / 3, seed), wear = tnoise(x / 9, y / 9, 64 / 9, seed + 4);
      p.set(x, y, n < 0.2 && wear < 0.45 ? shade(under, (n - 0.1) * 0.5) : shade(base, (n - 0.5) * 0.16 - (1 - wear) * 0.08));
    }
    return p.grain(10, seed);
  },

  // glazing: plain (rail infill, skylights) or framed (windows, glass rail panels)
  glass(pal, seed) {
    const base = rgb(pal.base || '#86b0c8'), p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = shade(base, 0.16 - (y / S) * 0.3 + (tnoise(x / 8, y / 8, 8, seed) - 0.5) * 0.06);
      const u = (x + y * 0.7) % 64;
      if (u > 8 && u < 15) c = shade(c, 0.32);
      else if (u > 19 && u < 22) c = shade(c, 0.22);
      p.set(x, y, c);
    }
    if (pal.framed) {
      const fr = rgb(pal.frame || '#9aa0a8');
      for (let k = 0; k < 3; k++) {
        const c = k === 0 ? shade(fr, 0.25) : k === 2 ? shade(fr, -0.35) : fr;
        p.rect(k, k, S - 2 * k, 1, c); p.rect(k, k, 1, S - 2 * k, c);
        p.rect(k, S - 1 - k, S - 2 * k, 1, shade(c, -0.2)); p.rect(S - 1 - k, k, 1, S - 2 * k, shade(c, -0.2));
      }
      if (pal.mullions) { p.rect(31, 3, 2, 58, fr); p.rect(3, 31, 58, 2, fr); }
    }
    return p;
  },

  // diamond-plate stair tread
  tread(pal, seed) {
    const base = rgb(pal.base || '#8a8e94'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.14, seed, 5);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const cx = i * 8 + (j % 2 ? 4 : 0), cy = j * 8 + 4, dir = (i + j) % 2;
      for (let k = -2; k <= 2; k++) {
        const x = cx + k, y = cy + (dir ? k : -k);
        p.setWrap(x + 1, y + 1, shade(base, -0.4)); p.setWrap(x, y, shade(base, 0.38));
      }
    }
    stains(p, new Rng(seed), shade(base, -0.5), 2, 45);
    return p.grain(10, seed);
  },

  // worn road paint on asphalt (stripes run along v like the uploaded lane tiles)
  road_paint(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#2c2c30'), white = rgb(pal.lines || '#e6e6de'), yellow = rgb(pal.accent || '#e8c030'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.25, seed, 2);
    p.grain(24, seed);
    const paint = (x0, y0, w, h, c) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = tnoise((x0 + x) / 2, (y0 + y) / 2, 32, seed + 3);
        if (n > 0.16) p.setWrap(x0 + x, y0 + y, shade(c, (n - 0.5) * 0.18));
      }
    };
    const kind = pal.kind || 'double';
    if (kind === 'double') { paint(25, 0, 4, 64, yellow); paint(35, 0, 4, 64, yellow); }
    else if (kind === 'dash') paint(29, 0, 6, 34, white);
    else if (kind === 'edge') paint(29, 0, 6, 64, white);
    else for (const x0 of [3, 19, 35, 51]) paint(x0, 0, 10, 64, white);   // crosswalk
    crack(p, r, base, 1, 14);
    return p;
  },

  // carpets: kind ornate | theater | arcade | office (no kind = old diamond carpet)
  carpet(pal, seed) {
    if (!pal.kind) return carpetPlain(pal, seed);
    const r = new Rng(seed), base = rgb(pal.base || '#5a1a24'), alt = rgb(pal.alt || '#a8862c'), p = new PixelCanvas(S, S);
    const pile = (x, y) => (tnoise(x, y, 64, seed) - 0.5) * 0.16;
    if (pal.kind === 'ornate') {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = Math.abs(((x + 16) % 32) - 16), dy = Math.abs(((y + 16) % 32) - 16), d = dx + dy;
        let c = base;
        if (d === 14 || d === 15) c = alt;
        else if (d < 4) c = shade(alt, -0.1);
        else if (d === 8) c = shade(base, 0.22);
        else if (d > 15 && (dx === 16 || dy === 16)) c = shade(base, -0.25);
        p.set(x, y, shade(c, pile(x, y)));
      }
    } else if (pal.kind === 'theater') {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const lx = x % 16, ly = y % 16, ox = (Math.floor(y / 16) % 2) * 8;
        const mx = (x + ox) % 16, my = ly;
        let c = base;
        if ((mx === 8 && my > 4 && my < 12) || (my === 8 && mx > 4 && mx < 12)) c = alt;
        else if (Math.abs(mx - 8) + Math.abs(my - 8) === 5) c = shade(alt, -0.25);
        else if (lx === 0 && ly === 0) c = shade(alt, -0.35);
        p.set(x, y, shade(c, pile(x, y)));
      }
    } else if (pal.kind === 'arcade') {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, shade(base, pile(x, y)));
      const cols = [alt, rgb(pal.accent || '#40e0ff'), [255, 220, 60], [120, 255, 120]];
      for (let k = 0; k < 9; k++) {
        const c = cols[k % cols.length], x0 = r.int(0, 63), y0 = r.int(0, 63), shape = k % 3;
        if (shape === 0) for (let i = 0; i < 18; i++) p.setWrap(x0 + i, y0 + Math.round(Math.sin(i / 2.5) * 3), c);
        else if (shape === 1) for (let a = 0; a < 24; a++) p.setWrap(x0 + Math.round(Math.cos(a / 24 * 6.283) * 4), y0 + Math.round(Math.sin(a / 24 * 6.283) * 4), c);
        else for (let i = 0; i < 7; i++) { p.setWrap(x0 + i, y0 + 6, c); p.setWrap(x0 + Math.floor(i / 2), y0 + 6 - i, c); p.setWrap(x0 + 6 - Math.floor(i / 2), y0 + 6 - i, c); }
      }
    } else { // office: flat low pile, speckles and damp stains
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const sp = tnoise(x * 1.7, y * 1.7, 108.8, seed + 2) > 0.7;
        p.set(x, y, shade(sp ? alt : base, pile(x, y) * 1.2));
      }
      stains(p, r, shade(base, -0.4), 4, 70);
    }
    return p;
  },

  // one crate face (uv 'fit'): wood | metal | cardboard
  crate(pal, seed) {
    const r = new Rng(seed), kind = pal.kind || 'wood', p = new PixelCanvas(S, S);
    if (kind === 'wood') {
      const base = rgb(pal.base || '#7a5430');
      for (let y = 0; y < S; y++) {
        const plank = Math.floor(y / 16), b = shade(base, ((plank * 37) % 5) / 30 - 0.06);
        for (let x = 0; x < S; x++) {
          const g = Math.sin(x * 0.45 + tnoise(x / 16, y / 3, 4, seed + plank) * 5) * 0.07;
          p.set(x, y, y % 16 === 15 ? shade(base, -0.65) : shade(b, g + (tnoise(x / 6, y / 2, 64 / 6, seed) - 0.5) * 0.12));
        }
      }
      const board = shade(base, 0.12);
      const fillBoard = (pts) => p.polygon(pts, board);
      fillBoard([[0, 0], [64, 0], [64, 7], [0, 7]]); fillBoard([[0, 57], [64, 57], [64, 64], [0, 64]]);
      fillBoard([[0, 0], [7, 0], [7, 64], [0, 64]]); fillBoard([[57, 0], [64, 0], [64, 64], [57, 64]]);
      fillBoard([[7, 51], [13, 57], [57, 13], [51, 7]]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const px = p.get(x, y);
        if (px[0] === board[0] && px[1] === board[1] && px[2] === board[2]) p.set(x, y, shade(board, (tnoise(x / 5, y / 5, 64 / 5, seed + 7) - 0.5) * 0.18));
      }
      for (const v of [7, 57]) { p.rect(0, v - 1, S, 1, shade(base, -0.6)); p.rect(v - 1, 0, 1, S, shade(base, -0.6)); }
      p.line(7, 50, 50, 7, shade(base, 0.35)); p.line(13, 57, 57, 13, shade(base, -0.55));
      for (const [x, y] of [[3, 3], [60, 3], [3, 60], [60, 60], [10, 52], [52, 10]]) { p.set(x, y, [30, 26, 22]); p.set(x - 1, y - 1, [150, 140, 120]); }
    } else if (kind === 'metal') {
      const base = rgb(pal.base || '#5a6068'), ac = rgb(pal.accent || '#e0b020');
      noiseFill(p, base, 0.14, seed, 4);
      bevelRect(p, 0, 0, S, S, base, 2);
      bevelRect(p, 8, 8, 48, 48, shade(base, -0.12), 1, -0.35, 0.2);
      for (let y = 12; y < 52; y += 6) { p.hline(10, 53, y, shade(base, 0.18)); p.hline(10, 53, y + 1, shade(base, -0.3)); }
      for (const [x, y] of [[0, 0], [52, 0], [0, 52], [52, 52]]) { p.rect(x, y, 12, 12, shade(base, -0.25)); rivet(p, x + 4, y + 4, base); }
      for (let x = 0; x < 18; x++) for (let y = 0; y < 7; y++) p.set(40 + x, 44 + y, ((x + y) % 6) < 3 ? ac : [20, 20, 20]);
      for (let i = 0; i < 4; i++) p.rect(12 + i * 4, 12, 3, 5, [220, 220, 210]);
    } else { // cardboard
      const base = rgb(pal.base || '#a07848');
      noiseFill(p, base, 0.12, seed, 3);
      p.grain(8, seed);
      p.rect(0, 0, S, 2, shade(base, -0.35)); p.rect(0, 31, S, 1, shade(base, -0.25));
      for (let y = 0; y < S; y++) for (let x = 26; x < 38; x++) p.set(x, y, shade(base, 0.22 + (x === 27 || x === 36 ? 0.1 : 0)));
      const ink = [40, 30, 22];
      for (const ax of [8, 16]) { p.vline(ax, 40, 52, ink); p.line(ax - 3, 43, ax, 40, ink); p.line(ax + 3, 43, ax, 40, ink); }
      p.rect(44, 44, 14, 12, [230, 226, 212]);
      for (let k = 0; k < 4; k++) p.hline(46, 46 + r.int(5, 9), 46 + k * 3, ink);
    }
    return p;
  },

  // control console front (machine role, sci-fi / industrial)
  console(pal, seed) {
    const r = new Rng(seed), base = rgb(pal.base || '#3a3e48'), ac = rgb(pal.accent || '#30d8ff'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.15, seed, 4);
    bevelRect(p, 0, 0, S, S, base, 2);
    p.rect(5, 4, 54, 24, [8, 10, 14]);
    p.rect(6, 5, 52, 22, shade(ac, -0.78));
    for (let y = 8; y < 24; y += 3) p.hline(8, 8 + r.int(10, 40), y, shade(ac, -0.15));
    for (let x = 8; x < 56; x++) p.set(x, 22 - Math.round((Math.sin(x / 3 + seed) + 1) * 3), ac);
    const cols = [ac, [255, 80, 60], [255, 200, 40], [80, 255, 120]];
    for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
      const x = 7 + i * 6, y = 32 + row * 7, c = shade(r.pick(cols), r.float(-0.45, 0.05));
      p.rect(x, y, 4, 4, c); p.set(x, y, shade(c, 0.5)); p.rect(x, y + 4, 4, 1, shade(base, -0.5));
    }
    for (let i = 0; i < 4; i++) { const x = 9 + i * 7; p.rect(x, 47, 2, 12, [12, 12, 14]); p.rect(x - 1, 48 + r.int(0, 8), 4, 3, shade(base, 0.4)); }
    for (let y = 47; y < 59; y += 3) { p.hline(38, 57, y, shade(base, -0.45)); p.hline(38, 57, y + 1, shade(base, 0.12)); }
    return p;
  },

  // bookshelf front (castle / mansion "machine")
  bookshelf(pal, seed) {
    const r = new Rng(seed), wood = rgb(pal.base || '#4a2e18'), p = new PixelCanvas(S, S);
    p.fill(shade(wood, -0.6));
    const books = ['#6a1a14', '#1a3a22', '#1a2448', '#4a3018', '#202020', '#7a5a1a', '#4a1a3a', '#5a4a3a'].map(rgb);
    for (let row = 0; row < 4; row++) {
      const top = row * 16, floor = top + 13;
      let x = 4;
      while (x < 59) {
        if (r.chance(0.08)) { x += r.int(3, 6); continue; }
        const w = r.int(2, 5), h = r.int(8, 12), c = shade(r.pick(books), r.float(-0.15, 0.15));
        const bw = Math.min(w, 59 - x);
        p.rect(x, floor - h, bw, h, c);
        p.rect(x, floor - h, 1, h, shade(c, 0.25));
        if (h > 9) { p.rect(x, floor - h + 2, bw, 1, [190, 150, 60]); p.rect(x, floor - 3, bw, 1, [190, 150, 60]); }
        x += w + (r.chance(0.2) ? 1 : 0);
      }
      if (r.chance(0.3)) { const sx = r.int(10, 48); p.rect(sx, floor - 5, 5, 5, [214, 204, 180]); p.set(sx + 1, floor - 3, [30, 20, 10]); p.set(sx + 3, floor - 3, [30, 20, 10]); }
      for (let y = floor; y < top + 16; y++) for (let xx = 0; xx < S; xx++) p.set(xx, y, shade(wood, (y === floor ? 0.2 : -0.1) + (tnoise(xx / 6, y, 64 / 6, seed) - 0.5) * 0.15));
    }
    for (const x0 of [0, 60]) for (let y = 0; y < S; y++) for (let x = x0; x < x0 + 4; x++) p.set(x, y, shade(wood, (x === x0 ? 0.15 : 0) + (tnoise(x, y / 6, 64, seed + 4) - 0.5) * 0.2));
    return p;
  },

  // carved altar / shrine block with a glowing sigil (heaven, nature, desert "machine")
  altar(pal, seed) {
    const base = rgb(pal.base || '#6a6660'), ac = rgb(pal.accent || '#60ff90'), p = new PixelCanvas(S, S);
    noiseFill(p, base, 0.22, seed, 5);
    for (let k = 0; k < 64; k++) { for (const v of [5, 58]) { p.set(k, v, shade(base, -0.4)); p.set(v, k, shade(base, -0.4)); p.set(k, v + 1, shade(base, 0.2)); p.set(v + 1, k, shade(base, 0.2)); } }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 31.5, y - 29.5);
      if (Math.abs(d - 14) < 1.2) p.set(x, y, ac);
      else if (Math.abs(d - 14) < 3) p.set(x, y, ac, 90);
    }
    const star = [[32, 17], [43, 37], [20, 37]];
    for (let i = 0; i < 3; i++) p.line(star[i][0], star[i][1], star[(i + 1) % 3][0], star[(i + 1) % 3][1], ac);
    p.circle(32, 30, 2.5, mix(ac, [255, 255, 255], 0.6));
    for (let i = 0; i < 6; i++) { const x = 10 + i * 8; p.vline(x, 49, 53, shade(ac, -0.35)); p.hline(x - 1, x + 2, 49 + (i % 3), shade(ac, -0.35)); }
    return p;
  },

  // arcade cabinet front (neon arcade machines)
  arcade_cabinet(pal, seed) {
    const r = new Rng(seed), body = rgb(pal.base || '#16121e'), ac = rgb(pal.accent || '#ff40c0'), p = new PixelCanvas(S, S);
    noiseFill(p, body, 0.2, seed, 4);
    for (let y = 0; y < S; y++) for (const x0 of [0, 59]) for (let x = x0; x < x0 + 5; x++) p.set(x, y, ((x + y) % 8) < 4 ? ac : shade(ac, -0.5));
    p.rect(7, 2, 50, 10, mix(ac, [255, 255, 255], 0.3));
    for (let i = 0; i < 6; i++) p.rect(11 + i * 7, 5, 5, 4, shade(ac, -0.55));
    p.rect(9, 14, 46, 24, [30, 30, 36]);
    p.rect(11, 16, 42, 20, [6, 6, 20]);
    const cols = [[255, 220, 60], [80, 255, 120], [255, 80, 80], [80, 200, 255], ac];
    for (let k = 0; k < 14; k++) p.rect(r.int(12, 49), r.int(17, 33), 2, 2, r.pick(cols));
    p.polygon([[30, 33], [34, 33], [32, 29]], [240, 240, 255]);
    p.rect(7, 40, 50, 8, shade(body, 0.35));
    p.rect(15, 41, 2, 4, [60, 60, 60]); p.circle(16, 41, 2.2, [220, 30, 30]);
    for (let i = 0; i < 4; i++) p.circle(30 + i * 6, 44, 1.8, cols[i]);
    p.rect(26, 51, 12, 10, [70, 70, 78]);
    p.rect(28, 54, 3, 4, [255, 140, 30]); p.rect(33, 54, 3, 4, [255, 140, 30]);
    return p;
  },

  // displays: kind runes (low-tech glowing tablet) | cinema (projected picture); no kind = monitor wall
  screen_wall(pal, seed) {
    if (!pal.kind) return screenPlain(pal, seed);
    const r = new Rng(seed), base = rgb(pal.base || '#14121a'), ac = rgb(pal.accent || '#60c0ff'), p = new PixelCanvas(S, S);
    if (pal.kind === 'runes') {
      noiseFill(p, base, 0.35, seed, 5);
      bevelRect(p, 0, 0, S, S, shade(base, 0.25), 2);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const cx = 12 + i * 20, cy = 12 + j * 20;
        for (let s = 0; s < 3; s++) {
          const x0 = cx + r.int(-5, 5), y0 = cy + r.int(-6, 6), x1 = cx + r.int(-5, 5), y1 = cy + r.int(-6, 6);
          p.line(x0 + 1, y0, x1 + 1, y1, ac, 70); p.line(x0, y0 + 1, x1, y1 + 1, ac, 70);
          p.line(x0, y0, x1, y1, mix(ac, [255, 255, 255], 0.4));
        }
      }
    } else { // cinema
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const sky = mix([250, 196, 130], [150, 186, 236], 1 - y / 40);
        const ridge = 34 + Math.round((tfbm(x / 16, 0, 4, seed, 3) - 0.5) * 22);
        let c = y < ridge ? sky : mix([60, 70, 96], [30, 34, 52], (y - ridge) / 30);
        const sun = radial(x, y, 44, 26, 7);
        if (sun > 0 && y < ridge) c = mix(c, [255, 246, 210], Math.min(1, sun * 2));
        const vig = Math.min(1, Math.hypot(x - 31.5, y - 31.5) / 46);
        c = shade(c, -vig * vig * 0.45 + (y % 2 ? -0.03 : 0));
        p.set(x, y, c);
      }
    }
    return p;
  },

  // canvas stripes (circus tents, awnings)
  stripes(pal, seed) {
    const a = rgb(pal.base || '#c81c1c'), b = rgb(pal.alt || '#f0e6d8'), w = pal.width || 8, p = new PixelCanvas(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = Math.floor(x / w) % 2 ? b : a;
      const fold = Math.sin(((x % (w * 2)) / (w * 2)) * Math.PI * 2) * 0.1;
      p.set(x, y, shade(c, fold + (tnoise(x / 2, y / 8, 32, seed) - 0.5) * 0.1 + (x % w === 0 ? -0.2 : 0)));
    }
    for (let y = 2; y < S; y += 4) for (let x = w - 1; x < S; x += w) p.set(x, y, shade(b, -0.4));
    return p;
  },
});

export function generateTexture(spec, seed) {
  const fn = TEXGEN[spec.type] || TEXGEN.concrete;
  return fn(spec, seed).toCanvas();
}
