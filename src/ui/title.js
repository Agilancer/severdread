// Title screen blood: drops swell at every place on the logo where blood is
// exposed (emitters precomputed into assets/ui/logo_drips.json from the logo
// art), sag on a stretching neck, let go and fall, splash on the floor of the
// screen and build a pool; blood on the skulls seeps down the logo face.
// Drawn on a low-res canvas with nearest-neighbour upscaling so it matches the
// game's pixel art.

const PX = 2;                       // CSS pixels per blood pixel (fine droplets)
const G = 1.5;                      // speed scale so drops fall as fast on screen as with 3px blood pixels
const COL = {
  outline: '#1c0002', dark: '#4a0005', body: '#7a0a0e', mid: '#a3141a', hi: '#ff5a50', spec: '#ffd0c8',
};

// pre-rendered pixel stamps: round beads and falling teardrops
const STAMPS = new Map();
function stamp(R, L = 0) {
  const key = R * 100 + L;
  let c = STAMPS.get(key);
  if (c) return c;
  const S = 2 * R + 3, H = S + L;
  c = document.createElement('canvas');
  c.width = S; c.height = H;
  const x2 = c.getContext('2d');
  const cx = (S - 1) / 2, cy = H - 1 - (S - 1) / 2;
  const inside = (x, y) => {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= (R + 0.4) * (R + 0.4)) return true;
    if (L > 0 && y < cy && y >= 0) { const t = (y + 1) / (cy + 1); return Math.abs(dx) <= Math.max(0.5, (R + 0.2) * Math.pow(t, 1.6)); }
    return false;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y + 1) || (!inside(x, y - 1) && y > cy);
    const dx = x - cx, dy = y - cy;
    x2.fillStyle = edge ? (dx > 0 || dy > 0 ? COL.outline : COL.dark) : (dy < -R * 0.25 || (L && y < cy) ? COL.mid : COL.body);
    x2.fillRect(x, y, 1, 1);
  }
  if (R >= 2) {
    x2.fillStyle = COL.hi; x2.fillRect(Math.round(cx - R * 0.45), Math.round(cy - R * 0.45), 1, 1);
    if (R >= 3) { x2.fillStyle = COL.spec; x2.fillRect(Math.round(cx - R * 0.45), Math.round(cy - R * 0.45), 1, 1); x2.fillStyle = COL.hi; x2.fillRect(Math.round(cx - R * 0.45) + 1, Math.round(cy - R * 0.45) + 1, 1, 1); }
  }
  STAMPS.set(key, c);
  return c;
}

export class TitleBlood {
  constructor(screenEl, logoEl, data) {
    this.screen = screenEl;
    this.logo = logoEl;
    this.points = data?.points || [];
    this.weights = [];
    let tw = 0;
    for (const p of this.points) { tw += p[2]; this.weights.push(tw); }
    this.totalW = tw;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'title-blood';
    screenEl.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.drips = [];
    this.drops = [];       // free-falling drops
    this.specks = [];      // splash droplets
    this.runs = [];        // seeping runs on the logo face
    this.pool = null;      // floor puddle heights per column
    this.spawnAcc = 0;
    this.running = true;
    this.last = performance.now();
    this.age = 0;
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    this.canvas.remove();
  }

  _resize() {
    const w = Math.max(1, Math.ceil(this.screen.clientWidth / PX)), h = Math.max(1, Math.ceil(this.screen.clientHeight / PX));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.pool = new Float32Array(w);
      this.drips.length = 0; this.drops.length = 0; this.runs.length = 0;
    }
    // logo rectangle in blood pixels
    const sr = this.screen.getBoundingClientRect(), lr = this.logo.getBoundingClientRect();
    this.lx = (lr.left - sr.left) / PX; this.ly = (lr.top - sr.top) / PX;
    this.lw = lr.width / PX; this.lh = lr.height / PX;
  }

  _pick() {
    const r = Math.random() * this.totalW;
    let lo = 0, hi = this.weights.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.weights[m] < r) lo = m + 1; else hi = m; }
    return this.points[lo];
  }

  _spawn() {
    if (!this.points.length || this.lw < 20) return;
    const p = this._pick();
    const x = Math.round(this.lx + p[0] * this.lw), y = Math.round(this.ly + p[1] * this.lh);
    if (p[2] < 0.5) {
      // seep: a slow run down the face of the logo
      this.runs.push({ x, y0: y, y, v: 2 + Math.random() * 5, len: 6 + Math.random() * (14 + p[3] * 3), w: Math.random() < 0.3 ? 2 : 1, t: 0, life: 6 + Math.random() * 6 });
      return;
    }
    // avoid stacking two drips on the same spot
    for (const d of this.drips) if (Math.abs(d.x - x) < 2 && Math.abs(d.y0 - y) < 3) return;
    const big = Math.min(1, p[3] / 10);
    this.drips.push({
      x, y0: y, y, r: 0.5, rMax: 0.9 + big * 0.8 + Math.random() * 0.7, phase: 0,
      swell: 0.5 + Math.random() * 1.6, sag: 0, vy: 0, maxNeck: 4 + Math.random() * 12 + big * 6, t: 0,
    });
  }

  _tick(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.age += dt;
    if (!document.hidden) {
      this._resize();
      this._update(dt);
      this._draw();
    }
    requestAnimationFrame(this._tick);
  }

  _update(dt) {
    const H = this.canvas.height, W = this.canvas.width;
    // spawn profusely (scaled to logo width), with a burst on the first second
    const rate = (this.lw / 240) * (this.age < 1.2 ? 26 : 9);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc > 1) { this.spawnAcc--; if (this.drips.length < 110) this._spawn(); }
    // every few seconds a gush: a cluster of neighbouring drips lets go at once
    this.gushT = (this.gushT ?? 1.5) - dt;
    if (this.gushT <= 0 && this.points.length) {
      this.gushT = 2 + Math.random() * 3;
      const strong = this.points.filter((q) => q[2] >= 0.6);
      const c0 = strong[Math.floor(Math.random() * strong.length)];
      if (c0) for (const q of strong) if (Math.abs(q[0] - c0[0]) < 0.05 && this.drips.length < 130) {
        const x = Math.round(this.lx + q[0] * this.lw), y = Math.round(this.ly + q[1] * this.lh);
        this.drips.push({ x, y0: y, y, r: 0.6, rMax: 1.3 + Math.random() * 1.0, phase: 0, swell: 0.15 + Math.random() * 0.3, sag: 0, vy: 0, maxNeck: 6 + Math.random() * 16, t: 0 });
      }
    }

    const floorY = H - 1;
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      d.t += dt;
      if (d.phase === 0) {                       // swelling bead
        d.r = Math.min(d.rMax, d.r + (d.rMax / d.swell) * dt);
        if (d.r >= d.rMax) d.phase = 1;
      } else if (d.phase === 1) {                // sagging on a neck, viscous then accelerating
        d.vy += (6 + d.rMax * 4) * G * dt;
        d.y += d.vy * dt * (0.6 + (d.y - d.y0) / d.maxNeck);
        if (d.y - d.y0 > d.maxNeck) {
          // let go: the head falls, the neck snaps back into a small bead
          this.drops.push({ x: d.x, y: d.y, vy: Math.max(20, d.vy * 3), r: d.rMax * 0.9, trail: d.y - d.y0 });
          d.phase = 2; d.t = 0; d.r = d.rMax * 0.55; d.neck = d.y - d.y0; d.y = d.y0;
        }
      } else {                                   // neck retracting; bead may grow again
        d.neck = Math.max(0, d.neck - 60 * dt);
        if (d.neck <= 0 && d.t > 0.25) {
          if (Math.random() < 0.55) { d.phase = 0; d.r = d.rMax * 0.4; d.swell = 0.6 + Math.random() * 1.6; d.vy = 0; d.maxNeck = 4 + Math.random() * 13; d.t = 0; }
          else this.drips.splice(i, 1);
        }
      }
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vy = Math.min(260 * G, d.vy + 300 * G * dt);
      d.y += d.vy * dt;
      d.trail = Math.max(1, Math.min(9, d.vy * 0.025));
      const ix = Math.max(0, Math.min(W - 1, Math.round(d.x)));
      const surface = floorY - (this.pool ? this.pool[ix] : 0);
      if (d.y >= surface) {
        // splash + feed the pool
        const vol = d.r * d.r * 1.4;
        for (let k = -2; k <= 2; k++) { const j = ix + k; if (j >= 0 && j < W) this.pool[j] = Math.min(12, this.pool[j] + vol * (k === 0 ? 0.35 : 0.15)); }
        const n = 1 + Math.floor(Math.random() * 3 + d.r);
        for (let k = 0; k < n; k++) this.specks.push({ x: d.x, y: surface - 1, vx: (Math.random() - 0.5) * 50 * G, vy: (-20 - Math.random() * 50) * G, life: 0.4 + Math.random() * 0.5 });
        this.drops.splice(i, 1);
      }
    }
    for (let i = this.specks.length - 1; i >= 0; i--) {
      const s = this.specks[i];
      s.vy += 220 * G * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || s.y > floorY) this.specks.splice(i, 1);
    }
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i];
      r.t += dt;
      if (r.y - r.y0 < r.len) r.y += r.v * G * dt * (1 - (r.y - r.y0) / (r.len * 1.4));
      if (r.t > r.life) this.runs.splice(i, 1);
    }
    // the puddle spreads sideways a little and creeps up to its cap
    if (this.pool) {
      const p = this.pool;
      for (let k = 0; k < 2; k++) for (let j = 1; j < W - 1; j++) { const avg = (p[j - 1] + p[j + 1]) * 0.5; if (avg > p[j]) p[j] += (avg - p[j]) * 0.08; }
    }
  }

  _draw() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    // seeping runs on the logo face
    for (const r of this.runs) {
      const a = Math.min(1, (r.life - r.t) / 1.5);
      c.globalAlpha = a;
      c.fillStyle = COL.dark;
      c.fillRect(r.x, r.y0, r.w, r.y - r.y0);
      c.fillStyle = COL.body;
      c.fillRect(r.x, r.y - 1, r.w + 1, 2);
      c.fillStyle = COL.hi;
      c.fillRect(r.x, r.y - 1, 1, 1);
    }
    c.globalAlpha = 1;
    // beads and necks on the logo edges
    for (const d of this.drips) {
      const neck = d.phase === 1 ? d.y - d.y0 : d.phase === 2 ? d.neck : 0;
      if (neck > 0.5) {
        const nw = Math.max(1, Math.round(d.rMax * (d.phase === 1 ? 0.75 : 0.5)));
        c.fillStyle = COL.body;
        c.fillRect(Math.round(d.x - nw / 2), d.y0, nw, Math.round(neck));
        c.fillStyle = COL.dark;
        c.fillRect(Math.round(d.x - nw / 2), d.y0, 1, Math.round(neck));
      }
      this._bead(d.x, d.phase === 1 ? d.y : d.y0 + (d.phase === 2 ? d.neck : 0), d.r);
    }
    // falling drops (elongated by speed)
    for (const d of this.drops) this._tear(d.x, d.y, d.r, d.trail);
    // splash specks
    c.fillStyle = COL.mid;
    for (const s of this.specks) c.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    // pool on the floor
    if (this.pool) {
      const p = this.pool;
      for (let j = 0; j < W; j++) {
        const h = Math.round(p[j]);
        if (h <= 0) continue;
        c.fillStyle = COL.dark;
        c.fillRect(j, H - h, 1, h);
        c.fillStyle = COL.body;
        c.fillRect(j, H - h, 1, Math.min(2, h));
        c.fillStyle = COL.mid;
        c.fillRect(j, H - h, 1, 1);
        // moving glints on the surface
        if (((j + Math.floor(this.age * 6)) % 23) === 0) { c.fillStyle = COL.hi; c.fillRect(j, H - h, 1, 1); }
      }
    }
  }

  _bead(x, y, r) {
    const R = Math.max(1, Math.min(6, Math.round(r)));
    const st = stamp(R);
    this.ctx.drawImage(st, Math.round(x - st.width / 2), Math.round(y - st.height / 2));
  }
  _tear(x, y, r, len) {
    const R = Math.max(1, Math.min(6, Math.round(r)));
    const L = Math.max(0, Math.min(16, Math.round(len)));
    const st = stamp(R, L);
    // y is the centre of the round bottom
    this.ctx.drawImage(st, Math.round(x - st.width / 2), Math.round(y - st.height + R + 1));
  }
}

let dripData = null;
export async function loadTitleBlood() {
  if (dripData) return dripData;
  try { dripData = await (await fetch('assets/ui/logo_drips.json')).json(); } catch (e) { dripData = { points: [] }; }
  return dripData;
}
