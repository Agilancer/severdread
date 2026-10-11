// Props for platform levels (gen_platforms.js). Every object is built from
// textured boxes on the texture role that fits it:
//  rooftops: AC units (METAL body, GRATE fan top), water towers (WOOD tank on
//   METAL legs, ROOF cap), antenna masts (METAL, red LIGHT beacon), helipad
//   markings (PAINT), neon billboards (NEON panel in a METAL frame), skylights
//   (GLASS), vent stacks (PIPE), parapet copings (TRIM)
//  oil rig: deck legs (PILLAR) with sloped BEAM braces, cranes (BEAM tower,
//   GLASS cab, ACCENT hazard-striped base), derricks, tanks (METAL + TRIM
//   bands), pipe racks (PIPE on METAL posts), flare booms (PIPE + fire LIGHT)
//  spires / fortress: conical roofs (stepped ROOF), merlons (SIDE), corbels
//  islands: temples (PILLAR columns, TRIM / ACCENT entablature, ROOF), round
//   trees (WOOD trunk, FOLIAGE canopy), data cubes (SCREEN), banners (CARPET)
import { TS } from './common.js';
import { FACE } from './deco.js';

// ------------------------------------------------------------ rooftops
export function acUnit(deco, x, z, y, alongX = true) {
  const a = alongX ? 0.7 : 0.48, b = alongX ? 0.48 : 0.7;
  deco.box(x - a, y, z - b, x + a, y + 0.95, z + b, { side: TS.METAL, top: TS.GRATE, bottom: TS.METAL }, { solid: true, uv: 'fit' });
  deco.box(x - a - 0.04, y, z - b - 0.04, x + a + 0.04, y + 0.12, z + b + 0.04, TS.METAL);
  // duct running into the roof
  const dx = alongX ? a : 0, dz = alongX ? 0 : b;
  deco.box(x + dx - 0.14, y + 0.25, z + dz - 0.14, x + dx + 0.14 + (alongX ? 0.35 : 0), y + 0.55, z + dz + 0.14 + (alongX ? 0 : 0.35), TS.PIPE);
}
export function waterTower(deco, x, z, y, s = 1) {
  const r = 0.85 * s, legH = 2.3 * s, tankH = 2.0 * s;
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = x + ox * r * 0.8, lz = z + oz * r * 0.8;
    deco.box(lx - 0.07, y, lz - 0.07, lx + 0.07, y + legH, lz + 0.07, TS.METAL, { faces: FACE.SIDES });
  }
  deco.bar([x - r * 0.8, y + 0.2, z - r * 0.8], [x + r * 0.8, y + legH - 0.2, z - r * 0.8], 0.05, 0.05, TS.METAL);
  deco.bar([x - r * 0.8, y + 0.2, z + r * 0.8], [x + r * 0.8, y + legH - 0.2, z + r * 0.8], 0.05, 0.05, TS.METAL);
  deco.box(x - r - 0.1, y + legH - 0.1, z - r - 0.1, x + r + 0.1, y + legH, z + r + 0.1, TS.METAL);
  deco.box(x - r, y + legH, z - r, x + r, y + legH + tankH, z + r, TS.WOOD, { s: 1 });
  for (const k of [0.3, 0.65]) deco.box(x - r - 0.03, y + legH + tankH * k, z - r - 0.03, x + r + 0.03, y + legH + tankH * k + 0.08, z + r + 0.03, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - r * 0.8, y + legH + tankH, z - r * 0.8, x + r * 0.8, y + legH + tankH + 0.35, z + r * 0.8, TS.ROOF);
  deco.box(x - r * 0.4, y + legH + tankH + 0.35, z - r * 0.4, x + r * 0.4, y + legH + tankH + 0.6, z + r * 0.4, TS.ROOF);
  deco.collider(x - r * 0.85, y, z - r * 0.85, x + r * 0.85, y + legH + tankH, z + r * 0.85);
}
export function antenna(deco, x, z, y, h = 7, color = [1, 0.2, 0.15]) {
  deco.box(x - 0.3, y, z - 0.3, x + 0.3, y + 0.4, z + 0.3, TS.METAL, { solid: true });
  deco.box(x - 0.06, y + 0.4, z - 0.06, x + 0.06, y + h, z + 0.06, TS.METAL, { faces: FACE.SIDES });
  for (let k = 1; k <= 3; k++) {
    const yy = y + h * (0.35 + k * 0.17), L = 0.7 - k * 0.15;
    deco.box(x - L, yy, z - 0.03, x + L, yy + 0.06, z + 0.03, TS.METAL);
  }
  deco.box(x - 0.12, y + h, z - 0.12, x + 0.12, y + h + 0.22, z + 0.12, TS.LIGHT, { emissive: 1, uv: 'fit' });
  deco.light(x, y + h, z, color, 5, { pulse: true });
}
// circular helipad marking + H, centred on (cx, cz)
export function helipad(deco, cx, cz, y, r = 2.2, tex = TS.PAINT) {
  const Y = y + 0.006, T = 0.014;
  const n = 28;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
    deco.box(px - 0.2, Y, pz - 0.2, px + 0.2, Y + T, pz + 0.2, tex, { uv: 'fit', faces: FACE.TOP });
  }
  deco.box(cx - 0.75, Y, cz - 0.9, cx - 0.45, Y + T, cz + 0.9, tex, { uv: 'fit', faces: FACE.TOP });
  deco.box(cx + 0.45, Y, cz - 0.9, cx + 0.75, Y + T, cz + 0.9, tex, { uv: 'fit', faces: FACE.TOP });
  deco.box(cx - 0.45, Y, cz - 0.15, cx + 0.45, Y + T, cz + 0.15, tex, { uv: 'fit', faces: FACE.TOP });
  // landing lights
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const px = cx + Math.cos(a) * (r + 0.55), pz = cz + Math.sin(a) * (r + 0.55);
    deco.box(px - 0.08, y, pz - 0.08, px + 0.08, y + 0.1, pz + 0.08, TS.LIGHT, { emissive: 1, uv: 'fit' });
  }
}
// neon billboard on two legs; the sign faces direction d (0 +x, 1 -x, 2 +z, 3 -z)
export function billboard(deco, x0, z0, len, y, d, o = {}) {
  const h0 = o.lift ?? 1.9, h1 = h0 + (o.height ?? 2.2);
  const alongX = d >= 2;
  const t = 0.16;
  const color = o.color ?? [1, 0.3, 0.8];
  if (alongX) {
    const z = z0;
    for (const px of [x0 + 0.4, x0 + len - 0.4]) deco.box(px - 0.08, y, z - 0.08, px + 0.08, h1 + y, z + 0.08, TS.METAL, { faces: FACE.SIDES });
    deco.box(x0, y + h0 - 0.12, z - t, x0 + len, y + h1 + 0.12, z + t, TS.METAL);
    const fz = d === 2 ? z + t : z - t - 0.03;
    deco.box(x0 + 0.1, y + h0, fz, x0 + len - 0.1, y + h1, fz + 0.03, TS.NEON, { uv: 'fit', emissive: 1 });
    deco.light(x0 + len / 2, y + (h0 + h1) / 2, z + (d === 2 ? 0.8 : -0.8), color, 6);
    deco.collider(x0 + 0.3, y, z - 0.1, x0 + 0.5, y + h1, z + 0.1, { obstacle: false });
    deco.collider(x0 + len - 0.5, y, z - 0.1, x0 + len - 0.3, y + h1, z + 0.1, { obstacle: false });
  } else {
    const x = x0;
    for (const pz of [z0 + 0.4, z0 + len - 0.4]) deco.box(x - 0.08, y, pz - 0.08, x + 0.08, h1 + y, pz + 0.08, TS.METAL, { faces: FACE.SIDES });
    deco.box(x - t, y + h0 - 0.12, z0, x + t, y + h1 + 0.12, z0 + len, TS.METAL);
    const fx = d === 0 ? x + t : x - t - 0.03;
    deco.box(fx, y + h0, z0 + 0.1, fx + 0.03, y + h1, z0 + len - 0.1, TS.NEON, { uv: 'fit', emissive: 1 });
    deco.light(x + (d === 0 ? 0.8 : -0.8), y + (h0 + h1) / 2, z0 + len / 2, color, 6);
    deco.collider(x - 0.1, y, z0 + 0.3, x + 0.1, y + h1, z0 + 0.5, { obstacle: false });
    deco.collider(x - 0.1, y, z0 + len - 0.5, x + 0.1, y + h1, z0 + len - 0.3, { obstacle: false });
  }
}
export function skylight(deco, x, z, y, alongX = true) {
  const a = alongX ? 0.9 : 0.55, b = alongX ? 0.55 : 0.9;
  deco.box(x - a, y, z - b, x + a, y + 0.3, z + b, TS.TRIM, { solid: true });
  deco.box(x - a + 0.08, y + 0.3, z - b + 0.08, x + a - 0.08, y + 0.55, z + b - 0.08, TS.GLASS, { emissive: 0.25, uv: 'fit' });
}
export function ventStack(deco, x, z, y, h = 1.4) {
  deco.box(x - 0.14, y, z - 0.14, x + 0.14, y + h, z + 0.14, TS.PIPE, { faces: FACE.SIDES });
  deco.box(x - 0.26, y + h, z - 0.26, x + 0.26, y + h + 0.14, z + 0.26, TS.METAL);
  deco.collider(x - 0.16, y, z - 0.16, x + 0.16, y + h, z + 0.16, { obstacle: false });
}
// thin band along a cell edge (x,z,d) at height y0..y1, protruding `out` past the edge
export function edgeBand(deco, x, z, d, y0, y1, tex, out = 0, inn = 0.22, o = {}) {
  if (d === 0) deco.box(x + 1 - inn, y0, z, x + 1 + out, y1, z + 1, tex, o);
  else if (d === 1) deco.box(x - out, y0, z, x + inn, y1, z + 1, tex, o);
  else if (d === 2) deco.box(x, y0, z + 1 - inn, x + 1, y1, z + 1 + out, tex, o);
  else deco.box(x, y0, z - out, x + 1, y1, z + inn, tex, o);
}
// conical roof made of stepped boxes (turrets, spires), centred on (cx, cz)
export function coneRoof(deco, cx, cz, y, r, h, tex = TS.ROOF, o = {}) {
  const steps = o.steps ?? 6;
  for (let k = 0; k < steps; k++) {
    const t = k / steps, rr = r * (1 - t) + 0.06;
    deco.box(cx - rr, y + h * t, cz - rr, cx + rr, y + h * (t + 1 / steps) + 0.01, cz + rr, tex, { s: 1.5 });
  }
  deco.box(cx - 0.04, y + h, cz - 0.04, cx + 0.04, y + h + (o.finial ?? 1.2), cz + 0.04, o.finialTex ?? TS.METAL, { faces: FACE.SIDES | FACE.TOP });
}
// merlon on top of a battlement edge (x,z,d) at the wall top y
export function merlon(deco, x, z, d, y, tex = TS.SIDE) {
  const a = 0.18, b = 0.82;
  if (d === 0) deco.box(x + 0.85, y, z + a, x + 1.05, y + 0.55, z + b, tex);
  else if (d === 1) deco.box(x - 0.05, y, z + a, x + 0.15, y + 0.55, z + b, tex);
  else if (d === 2) deco.box(x + a, y, z + 0.85, x + b, y + 0.55, z + 1.05, tex);
  else deco.box(x + a, y, z - 0.05, x + b, y + 0.55, z + 0.15, tex);
}
export function lightningRod(deco, x, z, y, h = 3.5) {
  deco.box(x - 0.05, y, z - 0.05, x + 0.05, y + h, z + 0.05, TS.METAL, { faces: FACE.SIDES });
  deco.box(x - 0.1, y + h, z - 0.1, x + 0.1, y + h + 0.2, z + 0.1, TS.LIGHT, { emissive: 1, uv: 'fit' });
  deco.light(x, y + h, z, [0.55, 0.7, 1], 5, { pulse: true });
}

// ------------------------------------------------------------ oil rig
export function crane(deco, x, z, y, dir, o = {}) {
  const H = o.height ?? 7, L = o.boom ?? 7;
  deco.box(x - 0.75, y, z - 0.75, x + 0.75, y + 1.1, z + 0.75, { side: TS.ACCENT, top: TS.METAL }, { solid: true });
  deco.box(x - 0.32, y + 1.1, z - 0.32, x + 0.32, y + H, z + 0.32, TS.BEAM, { faces: FACE.SIDES });
  // operator cab
  deco.box(x - 0.6, y + H - 1.6, z - 0.55, x + 0.6, y + H - 0.4, z + 0.55, { side: TS.GLASS, top: TS.METAL, bottom: TS.METAL }, { emissive: 0.15, uv: 'fit' });
  deco.box(x - 0.45, y + H, z - 0.45, x + 0.45, y + H + 0.35, z + 0.45, TS.METAL);
  const dx = [1, -1, 0, 0][dir], dz = [0, 0, 1, -1][dir];
  const top = [x, y + H + 0.2, z];
  const tip = [x + dx * L, y + H + 2.2, z + dz * L];
  deco.bar(top, tip, 0.3, 0.3, TS.BEAM);
  deco.bar([x, y + H + 1.6, z], tip, 0.08, 0.08, TS.METAL);
  deco.bar(top, [x - dx * 2.2, y + H + 0.6, z - dz * 2.2], 0.32, 0.32, TS.BEAM);
  deco.box(x - dx * 2.2 - 0.45, y + H - 0.2, z - dz * 2.2 - 0.45, x - dx * 2.2 + 0.45, y + H + 0.5, z - dz * 2.2 + 0.45, TS.METAL);
  // hoist cable and hook block
  const cl = o.cable ?? 3.5;
  deco.box(tip[0] - 0.03, tip[1] - cl, tip[2] - 0.03, tip[0] + 0.03, tip[1], tip[2] + 0.03, TS.METAL, { faces: FACE.SIDES });
  deco.box(tip[0] - 0.18, tip[1] - cl - 0.45, tip[2] - 0.18, tip[0] + 0.18, tip[1] - cl, tip[2] + 0.18, TS.ACCENT);
  deco.box(tip[0] - 0.1, tip[1] + 0.1, tip[2] - 0.1, tip[0] + 0.1, tip[1] + 0.3, tip[2] + 0.1, TS.LIGHT, { emissive: 1, uv: 'fit' });
  deco.light(tip[0], tip[1], tip[2], [1, 0.25, 0.15], 4, { pulse: true });
}
export function derrick(deco, x, z, y, h = 10) {
  const b = 1.25, t = 0.3;
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) deco.bar([x + ox * b, y, z + oz * b], [x + ox * t, y + h, z + oz * t], 0.14, 0.14, TS.BEAM);
  for (let k = 1; k <= 4; k++) {
    const yy = y + (h * k) / 5, r = b + (t - b) * (k / 5);
    deco.box(x - r, yy, z - r - 0.04, x + r, yy + 0.08, z - r + 0.04, TS.BEAM);
    deco.box(x - r, yy, z + r - 0.04, x + r, yy + 0.08, z + r + 0.04, TS.BEAM);
    deco.box(x - r - 0.04, yy, z - r, x - r + 0.04, yy + 0.08, z + r, TS.BEAM);
    deco.box(x + r - 0.04, yy, z - r, x + r + 0.04, yy + 0.08, z + r, TS.BEAM);
  }
  deco.box(x - 0.5, y + h, z - 0.5, x + 0.5, y + h + 0.5, z + 0.5, TS.METAL);
  deco.box(x - 0.09, y, z - 0.09, x + 0.09, y + h, z + 0.09, TS.PIPE, { faces: FACE.SIDES });
  deco.box(x - 0.7, y, z - 0.7, x + 0.7, y + 0.6, z + 0.7, { side: TS.MACHINE, top: TS.METAL }, { solid: true });
  deco.box(x - 0.12, y + h + 0.5, z - 0.12, x + 0.12, y + h + 0.75, z + 0.12, TS.LIGHT, { emissive: 1, uv: 'fit' });
  deco.light(x, y + h + 0.6, z, [1, 0.3, 0.2], 5, { pulse: true });
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) deco.collider(x + ox * b - 0.12, y, z + oz * b - 0.12, x + ox * b + 0.12, y + 2, z + oz * b + 0.12, { obstacle: false });
}
export function tank(deco, x, z, y, s = 1) {
  const r = 0.85 * s, h = 2.2 * s;
  deco.box(x - r, y, z - r, x + r, y + h, z + r, TS.METAL, { solid: true, s: 1 });
  deco.box(x - r * 0.75, y + h, z - r * 0.75, x + r * 0.75, y + h + 0.25, z + r * 0.75, TS.METAL);
  for (const k of [0.15, 0.55, 0.9]) deco.box(x - r - 0.03, y + h * k, z - r - 0.03, x + r + 0.03, y + h * k + 0.1, z + r + 0.03, TS.TRIM, { faces: FACE.SIDES });
  // ladder
  deco.box(x - 0.2, y, z + r, x + 0.2, y + h, z + r + 0.05, TS.RAIL, { faces: FACE.SIDES });
}
// pipe rack: horizontal pipes on posts, along x (alongX) from a to a+len at cross position c
export function pipeRack(deco, alongX, a, len, c, y) {
  const posts = Math.max(2, Math.round(len / 2) + 1);
  for (let k = 0; k < posts; k++) {
    const p = a + 0.2 + (len - 0.4) * (k / (posts - 1));
    if (alongX) deco.box(p - 0.05, y, c - 0.3, p + 0.05, y + 1.35, c + 0.3, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
    else deco.box(c - 0.3, y, p - 0.05, c + 0.3, y + 1.35, p + 0.05, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
  }
  for (const [off, yy, s] of [[-0.18, 0.55, 0.24], [0.16, 0.6, 0.18], [-0.1, 1.05, 0.2], [0.18, 1.1, 0.14]]) {
    if (alongX) deco.box(a, y + yy - s / 2, c + off - s / 2, a + len, y + yy + s / 2, c + off + s / 2, TS.PIPE);
    else deco.box(c + off - s / 2, y + yy - s / 2, a, c + off + s / 2, y + yy + s / 2, a + len, TS.PIPE);
  }
  if (alongX) deco.collider(a, y, c - 0.32, a + len, y + 1.35, c + 0.32);
  else deco.collider(c - 0.32, y, a, c + 0.32, y + 1.35, a + len);
}
// flare boom: a pipe leaning out from (x, z) toward dir, burning at the tip
export function flareBoom(deco, x, z, y, dir, L = 5) {
  const dx = [1, -1, 0, 0][dir], dz = [0, 0, 1, -1][dir];
  const tip = [x + dx * L, y + L * 0.9, z + dz * L];
  deco.bar([x, y, z], tip, 0.28, 0.28, TS.PIPE);
  deco.bar([x, y + 0.3, z], [x + dx * L * 0.6, y + L * 0.9 * 0.6 + 0.6, z + dz * L * 0.6], 0.12, 0.12, TS.BEAM);
  deco.box(tip[0] - 0.25, tip[1], tip[2] - 0.25, tip[0] + 0.25, tip[1] + 0.9, tip[2] + 0.25, TS.LIGHT, { emissive: 1, uv: 'fit' });
  deco.box(tip[0] - 0.14, tip[1] + 0.9, tip[2] - 0.14, tip[0] + 0.14, tip[1] + 1.5, tip[2] + 0.14, TS.LIGHT, { emissive: 1, uv: 'fit' });
  deco.light(tip[0], tip[1] + 0.8, tip[2], [1, 0.55, 0.2], 9, { flicker: true });
}

// ------------------------------------------------------------ islands
export function roundTree(deco, x, z, y, s = 1, o = {}) {
  const h = 2.9 * s;
  deco.box(x - 0.14 * s, y, z - 0.14 * s, x + 0.14 * s, y + h, z + 0.14 * s, o.trunk ?? TS.WOOD, { faces: FACE.SIDES });
  const leaf = o.leaf ?? TS.FOLIAGE;
  deco.box(x - 1.0 * s, y + h - 0.3, z - 1.0 * s, x + 1.0 * s, y + h + 0.9 * s, z + 1.0 * s, leaf, { s: 1.5 });
  deco.box(x - 0.7 * s, y + h + 0.9 * s - 0.02, z - 0.7 * s, x + 0.7 * s, y + h + 1.5 * s, z + 0.7 * s, leaf, { s: 1.5 });
  deco.box(x - 1.2 * s, y + h + 0.1, z - 0.6 * s, x + 1.2 * s, y + h + 0.7 * s, z + 0.6 * s, leaf, { s: 1.5 });
  deco.collider(x - 0.2 * s, y, z - 0.2 * s, x + 0.2 * s, y + h, z + 0.2 * s);
}
export function dataCube(deco, x, z, y, color = [0.3, 0.9, 1]) {
  deco.box(x - 0.35, y, z - 0.35, x + 0.35, y + 0.7, z + 0.35, TS.METAL, { solid: true });
  deco.box(x - 0.42, y + 1.1, z - 0.42, x + 0.42, y + 1.94, z + 0.42, TS.SCREEN, { emissive: 0.9, uv: 'fit' });
  deco.light(x, y + 1.5, z, color, 5, { pulse: true });
}
// hanging banner on a wall face (cloth = CARPET role) at edge (x,z,d)
export function banner(deco, x, z, d, y0, y1, tex = TS.CARPET) {
  const w0 = 0.25, w1 = 0.75, t = 0.04;
  if (d === 0) deco.box(x + 1 - t - 0.02, y0, z + w0, x + 1 - 0.02, y1, z + w1, tex, { uv: 'fit' });
  else if (d === 1) deco.box(x + 0.02, y0, z + w0, x + 0.02 + t, y1, z + w1, tex, { uv: 'fit' });
  else if (d === 2) deco.box(x + w0, y0, z + 1 - t - 0.02, x + w1, y1, z + 1 - 0.02, tex, { uv: 'fit' });
  else deco.box(x + w0, y0, z + 0.02, x + w1, y1, z + 0.02 + t, tex, { uv: 'fit' });
}
