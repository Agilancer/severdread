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

export function generateTexture(spec, seed) {
  const fn = TEXGEN[spec.type] || TEXGEN.concrete;
  return fn(spec, seed).toCanvas();
}
