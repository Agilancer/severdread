// Collects billboard instances per texture/blend mode for the renderer.
// Instance layout (25 floats) matches engine/shaders.js spriteVS:
//   pos3 size2 uv4 tint4 glow4 params4(hue, rot, anchorY, fullbright) extra4(dissolve, sat, light, billboard)
import { SPRITE_FLOATS } from '../engine/renderer.js';

export const MODE = { CUTOUT: 0, ADD: 1, ALPHA: 2 };

export class SpriteBatcher {
  constructor() {
    this.byHandle = new Map();
    this.list = [];
  }
  begin() { for (const b of this.list) b.count = 0; }

  _batch(handle, mode) {
    let arr = this.byHandle.get(handle);
    if (!arr) { arr = [null, null, null]; this.byHandle.set(handle, arr); }
    let b = arr[mode];
    if (!b) {
      b = { handle, mode, count: 0, data: new Float32Array(SPRITE_FLOATS * 64), tex: null };
      arr[mode] = b;
      this.list.push(b);
    }
    return b;
  }

  // o: {uv, tint, glow, hue, rot, anchorY, fullbright, dissolve, sat, light, spherical, billboard}
  add(handle, mode, x, y, z, w, h, o = {}) {
    if (!handle || !handle.ready) return;
    const b = this._batch(handle, mode);
    if ((b.count + 1) * SPRITE_FLOATS > b.data.length) {
      const d = new Float32Array(b.data.length * 2); d.set(b.data); b.data = d;
    }
    const d = b.data, i = b.count * SPRITE_FLOATS;
    const uv = o.uv || DEFAULT_UV, t = o.tint || WHITE, g = o.glow || ZERO;
    d[i] = x; d[i + 1] = y; d[i + 2] = z;
    d[i + 3] = w; d[i + 4] = h;
    d[i + 5] = uv[0]; d[i + 6] = uv[1]; d[i + 7] = uv[2]; d[i + 8] = uv[3];
    d[i + 9] = t[0]; d[i + 10] = t[1]; d[i + 11] = t[2]; d[i + 12] = t[3] ?? 1;
    d[i + 13] = g[0]; d[i + 14] = g[1]; d[i + 15] = g[2]; d[i + 16] = g[3] ?? 0;
    d[i + 17] = o.hue || 0; d[i + 18] = o.rot || 0; d[i + 19] = o.anchorY ?? 0; d[i + 20] = o.fullbright ? 1 : 0;
    d[i + 21] = o.dissolve || 0; d[i + 22] = o.sat ?? 1; d[i + 23] = o.light ?? 0.8; d[i + 24] = o.billboard ?? (o.spherical ? 1 : 0);
    b.count++;
  }

  // Allocation-free variant for particle systems (gore). billboard: 0 cylindrical,
  // 1 spherical, 2 floor decal (XZ plane), 3 wall facing +-x, 4 wall facing +-z.
  addRaw(handle, mode, x, y, z, w, h, u0, v0, u1, v1, r, g, bl, a, rot, anchorY, fullbright, light, billboard, hue = 0, sat = 1) {
    if (!handle || !handle.ready) return;
    const b = this._batch(handle, mode);
    if ((b.count + 1) * SPRITE_FLOATS > b.data.length) {
      const d = new Float32Array(b.data.length * 2); d.set(b.data); b.data = d;
    }
    const d = b.data, i = b.count * SPRITE_FLOATS;
    d[i] = x; d[i + 1] = y; d[i + 2] = z; d[i + 3] = w; d[i + 4] = h;
    d[i + 5] = u0; d[i + 6] = v0; d[i + 7] = u1; d[i + 8] = v1;
    d[i + 9] = r; d[i + 10] = g; d[i + 11] = bl; d[i + 12] = a;
    d[i + 13] = 0; d[i + 14] = 0; d[i + 15] = 0; d[i + 16] = 0;
    d[i + 17] = hue; d[i + 18] = rot; d[i + 19] = anchorY; d[i + 20] = fullbright ? 1 : 0;
    d[i + 21] = 0; d[i + 22] = sat; d[i + 23] = light; d[i + 24] = billboard;
    b.count++;
  }

  finish() {
    for (const b of this.list) b.tex = b.handle.tex;
    return this.list.filter((b) => b.count && b.tex);
  }
}
const DEFAULT_UV = [0, 0, 1, 1], WHITE = [1, 1, 1, 1], ZERO = [0, 0, 0, 0];
