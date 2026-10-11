// Seeded random numbers. Every procedural system takes an Rng so a level,
// item or texture can be reproduced from its seed.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Rng {
  constructor(seed = Date.now()) {
    this.seed = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
    this.state = this.seed || 0x9e3779b9;
  }
  next() {
    // mulberry32
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this.next()); } // inclusive
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // items: [{weight, ...}] or [[value, weight]]
  weighted(items, weightFn = (it) => it.weight) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weightFn(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  gauss() {
    const u = 1 - this.next(), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  fork(salt = 0) { return new Rng((this.int(0, 0x7fffffff) ^ hashString(String(salt))) >>> 0); }
}

// Shared non-deterministic generator for cosmetic randomness (particles etc).
export const fx = new Rng((Math.random() * 0xffffffff) >>> 0);
