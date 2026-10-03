// Procedural placeholder sprites: first-person weapons + icons, armour, rings,
// reagents, chests, keys, props, portal, particles and a few placeholder
// monsters. All replaced automatically once real sprite sheets are uploaded.
import { PixelCanvas, rgb, shade, mix } from './pixel.js';
import { Rng } from '../core/rng.js';
import { makeCanvas } from '../engine/assets.js';

const SKIN = rgb('#c98a5a'), SKIN_D = rgb('#8a5534'), GLOVE = rgb('#1c1a1e'), GLOVE_H = rgb('#3a363e');

// ------------------------------------------------------------ weapons (FP)
// Frame layout matches uploaded weapon sheets: 7 first-person frames
// (idle, 6 firing) + a separate icon (8th frame) image.
export const FP_W = 128, FP_H = 104;

function drawHands(p, cx, by, spread = 18, recoil = 0) {
  // right hand + forearm from bottom-right, left hand from bottom-left
  const y = by + recoil;
  p.polygon([[cx + spread + 30, FP_H], [cx + spread + 8, y + 2], [cx + spread + 20, y - 4], [cx + spread + 44, FP_H]], SKIN);
  p.polygon([[cx + spread + 34, FP_H], [cx + spread + 22, y + 10], [cx + spread + 30, y + 6], [cx + spread + 44, FP_H]], SKIN_D);
  p.ellipse(cx + spread + 12, y + 2, 9, 7, GLOVE); p.rect(cx + spread + 6, y - 2, 8, 3, GLOVE_H);
  p.polygon([[cx - spread - 34, FP_H], [cx - spread - 10, y + 10], [cx - spread - 2, y + 16], [cx - spread - 20, FP_H]], SKIN);
  p.ellipse(cx - spread - 6, y + 12, 9, 7, GLOVE); p.rect(cx - spread - 12, y + 8, 7, 3, GLOVE_H);
}

function muzzleFlash(p, x, y, size, col, r) {
  const core = shade(col, 0.6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r.float(-0.2, 0.2);
    const l = size * r.float(0.6, 1.2);
    p.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l * 0.8, col);
  }
  p.circle(x, y, size * 0.45, col);
  p.circle(x, y, size * 0.25, core);
}

const GUN_SHAPES = {
  pistol: { bodyW: 16, bodyH: 26, barrels: 1, barrelW: 6, barrelH: 16, spread: 4 },
  smg: { bodyW: 20, bodyH: 30, barrels: 1, barrelW: 6, barrelH: 18, spread: 10 },
  rifle: { bodyW: 20, bodyH: 34, barrels: 1, barrelW: 6, barrelH: 26, spread: 12 },
  shotgun: { bodyW: 22, bodyH: 30, barrels: 1, barrelW: 9, barrelH: 30, spread: 12, pump: true },
  super_shotgun: { bodyW: 26, bodyH: 28, barrels: 2, barrelW: 9, barrelH: 30, spread: 14 },
  minigun: { bodyW: 30, bodyH: 26, barrels: 6, barrelW: 4, barrelH: 30, spread: 18, drum: true },
  rocket: { bodyW: 30, bodyH: 34, barrels: 1, barrelW: 22, barrelH: 22, spread: 18, tube: true },
  grenade: { bodyW: 26, bodyH: 26, barrels: 1, barrelW: 16, barrelH: 18, spread: 14, drum: true },
  nailgun: { bodyW: 26, bodyH: 32, barrels: 2, barrelW: 5, barrelH: 22, spread: 14, box: true },
  plasma: { bodyW: 28, bodyH: 32, barrels: 1, barrelW: 12, barrelH: 20, spread: 14, coils: true },
  rail: { bodyW: 18, bodyH: 36, barrels: 2, barrelW: 4, barrelH: 36, spread: 10, coils: true },
  flamer: { bodyW: 24, bodyH: 30, barrels: 1, barrelW: 10, barrelH: 22, spread: 14, tank: true },
  lightning: { bodyW: 24, bodyH: 30, barrels: 3, barrelW: 3, barrelH: 22, spread: 14, coils: true },
  launcher: { bodyW: 32, bodyH: 28, barrels: 1, barrelW: 18, barrelH: 16, spread: 16, drum: true },
  blade: { melee: true },
  mace: { melee: true }, club: { melee: true },
  revolver: { bodyW: 18, bodyH: 26, barrels: 1, barrelW: 7, barrelH: 18, spread: 4, drum: true },
  sniper: { bodyW: 18, bodyH: 36, barrels: 1, barrelW: 5, barrelH: 38, spread: 10 },
  lmg: { bodyW: 26, bodyH: 32, barrels: 1, barrelW: 7, barrelH: 26, spread: 14, box: true },
  javelin: { melee: true }, shuriken: { melee: true },
  crossbow: { bodyW: 22, bodyH: 28, barrels: 1, barrelW: 6, barrelH: 22, spread: 12 },
  harpoon: { bodyW: 22, bodyH: 30, barrels: 1, barrelW: 9, barrelH: 26, spread: 12, tube: true },
  sprayer: { bodyW: 24, bodyH: 30, barrels: 1, barrelW: 10, barrelH: 22, spread: 14, tank: true },
};

function drawGunFP(p, shape, pal, recoil, r, frame) {
  const cx = 64, base = rgb(pal.body), ac = rgb(pal.accent), dark = shade(base, -0.55);
  const bw = shape.bodyW, bh = shape.bodyH;
  const by = FP_H - bh - 6 + recoil;
  // body: trapezoid narrowing upward
  p.polygon([[cx - bw / 2 - 4, FP_H], [cx - bw / 2, by], [cx + bw / 2, by], [cx + bw / 2 + 4, FP_H]], base);
  p.polygon([[cx + bw / 2 - 3, by], [cx + bw / 2, by], [cx + bw / 2 + 4, FP_H], [cx + bw / 2 - 1, FP_H]], dark);
  p.rect(cx - bw / 2 + 2, by + 2, 2, bh - 4, shade(base, 0.25));
  if (shape.tank) { p.ball(cx + bw / 2 + 4, by + bh * 0.6, 9, ac); }
  if (shape.drum) { p.ellipse(cx, by + bh * 0.65, bw * 0.45, 7, dark); p.ellipse(cx, by + bh * 0.62, bw * 0.4, 5, shade(base, 0.1)); }
  if (shape.box) { p.rect(cx - bw / 2 - 6, by + 8, 6, 14, ac); }
  if (shape.pump) { p.rect(cx - 7, by - 8, 14, 8, shade(rgb('#6a4a2a'), recoil > 2 ? -0.2 : 0)); }
  // barrels
  const n = shape.barrels, w = shape.barrelW, total = n * w + (n - 1) * 2;
  const tipY = by - shape.barrelH;
  for (let i = 0; i < n; i++) {
    const x = cx - total / 2 + i * (w + 2);
    p.rect(x, tipY, w, shape.barrelH + 2, shape.tube ? shade(base, -0.15) : dark);
    p.rect(x, tipY, 1, shape.barrelH + 2, shade(base, 0.2));
    if (shape.tube) { p.rect(x + 2, tipY + 2, w - 4, 4, [10, 8, 8]); }
    else p.rect(x + 1, tipY, w - 2, 2, [8, 6, 6]);
  }
  if (shape.coils) {
    for (let k = 0; k < 3; k++) {
      const y = by - shape.barrelH * 0.25 - k * 6 + 6;
      const glow = (frame > 0 && frame < 4) ? shade(ac, 0.5) : ac;
      p.rect(cx - total / 2 - 3, y, total + 6, 3, glow);
      p.rect(cx - total / 2 - 3, y + 3, total + 6, 1, shade(ac, -0.5));
    }
  }
  // sight
  p.rect(cx - 2, by - 3, 4, 3, dark); p.set(cx, by - 4, ac);
  // accent stripe
  p.rect(cx - bw / 2 + 4, by + bh * 0.35, bw - 8, 2, ac);
  return { tipX: cx, tipY };
}

function drawBladeFP(p, pal, frame, r) {
  const steel = rgb(pal.body), ac = rgb(pal.accent);
  // swing poses: idle at right, windup up-right, slash across to left
  const poses = [[96, 92, -0.6], [100, 80, -1.1], [70, 60, -0.2], [40, 70, 0.6], [28, 90, 1.0], [60, 96, 0.2], [90, 94, -0.5]];
  const [hx, hy, ang] = poses[frame];
  const len = 70;
  const tx = hx + Math.sin(ang) * len, ty = hy - Math.cos(ang) * len;
  const nx = Math.cos(ang) * 5, ny = Math.sin(ang) * 5;
  p.polygon([[hx - nx, hy - ny], [hx + nx, hy + ny], [tx + nx * 0.3, ty + ny * 0.3], [tx, ty - 3]], steel);
  p.line(hx, hy, tx, ty, shade(steel, 0.5));
  p.line(hx + nx, hy + ny, tx + nx * 0.3, ty + ny * 0.3, shade(steel, -0.4));
  if (frame >= 2 && frame <= 4) { // motion smear
    for (let k = 1; k < 4; k++) p.line(hx + k * 6, hy - 10, tx + k * 10, ty + k * 4, ac, 90 - k * 20);
  }
  p.rect(hx - 9 - nx, hy - 3, 18, 5, ac);
  p.ellipse(hx + 2, hy + 8, 10, 8, GLOVE);
  p.polygon([[hx + 8, hy + 10], [hx + 30, FP_H], [hx + 46, FP_H], [hx + 14, hy + 2]], SKIN);
}

export function generateWeaponFP(archetype, pal, seed) {
  const shape = GUN_SHAPES[archetype] || GUN_SHAPES.rifle;
  const r = new Rng(seed);
  const strip = makeCanvas(FP_W * 7, FP_H);
  const g = strip.getContext('2d');
  const recoils = [0, 6, 5, 3, 2, 1, 0];
  for (let f = 0; f < 7; f++) {
    const p = new PixelCanvas(FP_W, FP_H);
    if (shape.melee) {
      drawBladeFP(p, pal, f, r);
    } else {
      const rc = recoils[f];
      const { tipX, tipY } = drawGunFP(p, shape, pal, rc, r, f);
      drawHands(p, 64, FP_H - shape.bodyH + 4, shape.spread, rc);
      p.outline();
      if (f === 1 || f === 2) muzzleFlash(p, tipX, tipY - 6, f === 1 ? 16 : 11, rgb(pal.flash || '#ffcc44'), r);
    }
    if (shape.melee) p.outline();
    g.putImageData(new ImageData(p.data, FP_W, FP_H), f * FP_W, 0);
  }
  return strip;
}

// Side-view icon (the 8th frame) ---------------------------------------------
export const ICON_W = 96, ICON_H = 48;
export function generateWeaponIcon(archetype, pal, seed) {
  const r = new Rng(seed);
  const p = new PixelCanvas(ICON_W, ICON_H);
  const base = rgb(pal.body), ac = rgb(pal.accent), dark = shade(base, -0.5);
  const s = GUN_SHAPES[archetype] || GUN_SHAPES.rifle;
  if (s.melee) {
    p.polygon([[10, 34], [70, 14], [86, 10], [74, 20], [14, 40]], base);
    p.line(14, 36, 80, 13, shade(base, 0.5));
    p.rect(6, 32, 8, 12, ac); p.rect(2, 36, 16, 4, shade(ac, -0.3));
    return p.outline().toCanvas();
  }
  const len = { pistol: 40, smg: 56, rifle: 78, shotgun: 80, super_shotgun: 74, minigun: 76, rocket: 84, grenade: 64, nailgun: 66, plasma: 68, rail: 88, flamer: 72, lightning: 66, launcher: 70 }[archetype] || 70;
  const x0 = Math.round((ICON_W - len) / 2), y0 = 14;
  const bodyH = archetype === 'rocket' ? 14 : 11;
  p.rect(x0 + len * 0.25, y0, len * 0.5, bodyH, base);                       // receiver
  p.rect(x0 + len * 0.25, y0, len * 0.5, 2, shade(base, 0.3));
  p.rect(x0 + len * 0.75, y0 + 2, len * 0.25, archetype === 'super_shotgun' ? 7 : 4, dark); // barrel
  if (archetype === 'super_shotgun') p.hline(x0 + len * 0.75, x0 + len, y0 + 5, shade(dark, 0.3));
  if (archetype !== 'pistol') p.rect(x0, y0 + 2, len * 0.25, 7, shade(base, -0.2));      // stock
  p.polygon([[x0 + len * 0.36, y0 + bodyH], [x0 + len * 0.46, y0 + bodyH], [x0 + len * 0.42, y0 + bodyH + 14], [x0 + len * 0.32, y0 + bodyH + 14]], dark); // grip
  if (s.drum) p.circle(x0 + len * 0.58, y0 + bodyH + 6, 7, shade(base, -0.1));
  else if (archetype !== 'flamer') p.rect(x0 + len * 0.52, y0 + bodyH, 6, 12, shade(base, -0.25)); // mag
  if (s.tank) p.ball(x0 + len * 0.55, y0 + bodyH + 7, 7, ac);
  if (s.coils) for (let k = 0; k < 3; k++) p.rect(x0 + len * 0.62 + k * 5, y0 - 2, 3, bodyH + 4, ac);
  if (s.tube) { p.rect(x0 + len * 0.15, y0 - 2, len * 0.8, bodyH + 4, shade(base, -0.1)); p.rect(x0 + len * 0.92, y0, 4, bodyH, [10, 8, 8]); }
  p.rect(x0 + len * 0.3, y0 + 4, len * 0.4, 2, ac);
  p.rect(x0 + len * 0.45, y0 - 3, 6, 3, dark);
  r.next();
  return p.outline().toCanvas();
}

// ------------------------------------------------------------ armour, rings
export const ITEM_ICON = 48;
export function generateArmorIcon(slot, pal, seed) {
  const r = new Rng(seed), p = new PixelCanvas(ITEM_ICON, ITEM_ICON);
  const base = rgb(pal.base), trim = rgb(pal.trim), glow = pal.glow ? rgb(pal.glow) : null;
  const style = r.int(0, 3);
  if (slot === 'head') {
    p.ball(24, 22, 15, base);
    if (style === 0) { p.rect(12, 20, 24, 6, [12, 12, 16]); if (glow) p.rect(13, 22, 22, 2, glow); }
    else if (style === 1) { p.rect(22, 14, 4, 22, [12, 12, 16]); p.rect(14, 22, 20, 3, [12, 12, 16]); if (glow) { p.set(18, 23, glow); p.set(30, 23, glow); } }
    else if (style === 2) { p.polygon([[10, 14], [4, 2], [14, 10]], trim); p.polygon([[38, 14], [44, 2], [34, 10]], trim); p.rect(15, 21, 18, 4, [12, 12, 16]); if (glow) p.rect(16, 22, 16, 2, glow); }
    else { p.circle(18, 22, 3, [10, 10, 10]); p.circle(30, 22, 3, [10, 10, 10]); if (glow) { p.set(18, 22, glow); p.set(30, 22, glow); } p.rect(18, 30, 12, 2, [10, 10, 10]); }
    p.rect(10, 34, 28, 4, trim); p.rect(10, 34, 28, 1, shade(trim, 0.4));
  } else if (slot === 'body') {
    p.polygon([[8, 10], [18, 6], [30, 6], [40, 10], [42, 24], [36, 42], [12, 42], [6, 24]], base);
    p.polygon([[8, 10], [18, 6], [20, 12], [10, 16]], shade(base, 0.3));
    p.polygon([[40, 10], [30, 6], [28, 12], [38, 16]], shade(base, -0.2));
    p.rect(14, 18, 20, 3, trim); p.rect(22, 18, 4, 22, trim);
    if (style % 2) { p.rect(12, 28, 24, 2, shade(base, -0.4)); p.rect(12, 34, 24, 2, shade(base, -0.4)); }
    if (glow) { p.circle(24, 26, 3, glow); p.set(24, 26, [255, 255, 255]); }
  } else {
    p.polygon([[12, 4], [36, 4], [36, 12], [34, 44], [26, 44], [24, 16], [22, 44], [14, 44], [12, 12]], base);
    p.rect(12, 4, 24, 4, trim);
    p.rect(14, 22, 8, 5, shade(base, 0.25)); p.rect(26, 22, 8, 5, shade(base, 0.25));
    p.rect(13, 40, 10, 4, trim); p.rect(25, 40, 10, 4, trim);
    if (glow) { p.rect(16, 24, 4, 1, glow); p.rect(28, 24, 4, 1, glow); }
  }
  p.grain(10, seed);
  return p.outline().toCanvas();
}

export function generateRingIcon(pal, seed) {
  const r = new Rng(seed), p = new PixelCanvas(ITEM_ICON, ITEM_ICON);
  const band = rgb(pal.band), gem = rgb(pal.gem);
  for (let y = 0; y < ITEM_ICON; y++) for (let x = 0; x < ITEM_ICON; x++) {
    const d = Math.hypot((x - 24) / 1.0, (y - 29) / 0.75);
    if (d > 10 && d < 16) p.set(x, y, shade(band, (y < 29 ? 0.25 : -0.25) + (x < 24 ? 0.1 : -0.1)));
  }
  const style = r.int(0, 2);
  if (style === 0) { p.ball(24, 13, 8, gem); }
  else if (style === 1) { p.polygon([[24, 3], [33, 12], [24, 22], [15, 12]], gem); p.polygon([[24, 3], [33, 12], [24, 12]], shade(gem, 0.35)); }
  else { p.polygon([[17, 6], [31, 6], [34, 13], [24, 22], [14, 13]], gem); p.rect(17, 6, 14, 3, shade(gem, 0.4)); }
  p.rect(18, 18, 12, 3, shade(band, 0.1));
  p.set(20, 9, [255, 255, 255]); p.set(21, 9, [255, 255, 255]); p.set(20, 10, [255, 255, 255]);
  return p.outline().toCanvas();
}

// ------------------------------------------------------------ reagents
const REAGENT_SHAPES = {
  gear(p, c) { for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; p.rect(16 + Math.cos(a) * 10 - 2, 16 + Math.sin(a) * 10 - 2, 5, 5, c); } p.ball(16, 16, 9, c); p.circle(16, 16, 3, [15, 12, 12]); },
  chip(p, c) { p.rect(7, 9, 18, 14, [30, 34, 30]); for (let i = 0; i < 5; i++) { p.rect(8 + i * 4, 6, 2, 3, [190, 190, 190]); p.rect(8 + i * 4, 23, 2, 3, [190, 190, 190]); } p.rect(11, 13, 10, 6, c); },
  shard(p, c) { p.polygon([[16, 2], [24, 14], [18, 30], [9, 16]], c); p.polygon([[16, 2], [24, 14], [16, 16]], shade(c, 0.4)); p.polygon([[9, 16], [16, 16], [18, 30]], shade(c, -0.3)); },
  vial(p, c) { p.rect(13, 3, 6, 5, [170, 140, 100]); p.ball(16, 20, 9, c); p.rect(12, 8, 8, 6, shade(c, 0.2)); p.set(12, 17, [255, 255, 255]); },
  coil(p, c) { for (let i = 0; i < 6; i++) p.ellipse(16, 6 + i * 4, 9, 2, i % 2 ? c : shade(c, -0.3)); p.rect(15, 2, 2, 28, [120, 90, 60]); },
  spine(p, c) { p.polygon([[5, 28], [27, 4], [24, 2], [3, 25]], c); p.line(5, 26, 25, 4, shade(c, 0.4)); },
  chain(p, c) { for (let i = 0; i < 3; i++) { p.ellipse(10 + i * 6, 8 + i * 8, 6, 4, c); p.ellipse(10 + i * 6, 8 + i * 8, 3, 1.5, [0, 0, 0]); } },
  heart(p, c) { p.ball(11, 13, 7, c); p.ball(21, 13, 7, c); p.polygon([[5, 15], [27, 15], [16, 29]], c); p.set(9, 9, [255, 220, 220]); },
  dust(p, c) { p.ellipse(16, 24, 12, 6, c); p.ellipse(16, 19, 8, 5, shade(c, 0.15)); p.ellipse(16, 15, 4, 3, shade(c, 0.3)); },
  sigil(p, c) { p.circle(16, 16, 13, shade(c, -0.4)); p.circle(16, 16, 11, c); p.polygon([[16, 7], [24, 22], [8, 22]], shade(c, 0.5)); p.polygon([[16, 11], [20, 19], [12, 19]], c); },
  paste(p, c) { p.rect(6, 10, 18, 12, [200, 200, 210]); p.rect(24, 13, 4, 6, [120, 120, 130]); p.rect(8, 12, 14, 8, c); },
  core(p, c) { p.ball(16, 16, 11, [60, 64, 72]); p.circle(16, 16, 6, c); p.circle(16, 16, 3, shade(c, 0.6)); p.rect(4, 15, 24, 2, [30, 30, 36]); },
  eye(p, c) { p.ellipse(16, 16, 13, 9, [235, 225, 210]); p.circle(16, 16, 6, c); p.circle(16, 16, 3, [10, 5, 5]); },
  feather(p, c) { p.polygon([[6, 28], [24, 4], [28, 8], [10, 30]], c); p.line(6, 28, 26, 6, shade(c, -0.4)); },
};
export function generateReagentIcon(shapeName, color, seed) {
  const p = new PixelCanvas(32, 32);
  (REAGENT_SHAPES[shapeName] || REAGENT_SHAPES.shard)(p, rgb(color));
  p.grain(8, seed);
  return p.outline().toCanvas();
}

// ------------------------------------------------------------ world objects
export function generateChest(open, pal = { base: '#2a2e38', glow: '#30e8ff' }) {
  const p = new PixelCanvas(64, 52), base = rgb(pal.base), glow = rgb(pal.glow);
  // body
  p.rect(6, 24, 52, 26, base);
  p.rect(6, 24, 52, 2, shade(base, 0.3));
  p.rect(6, 46, 52, 4, shade(base, -0.4));
  for (const x of [6, 54]) p.rect(x, 24, 4, 26, shade(base, -0.2));
  p.rect(10, 34, 44, 2, glow);
  p.rect(28, 30, 8, 10, shade(base, -0.5)); p.rect(30, 32, 4, 4, open ? rgb('#40ff60') : rgb('#ff3030'));
  if (open) {
    p.polygon([[6, 24], [58, 24], [52, 4], [12, 4]], shade(base, -0.15));
    p.rect(12, 4, 40, 2, glow);
    p.rect(10, 18, 44, 6, shade(glow, 0.3));
    for (let i = 0; i < 6; i++) p.rect(14 + i * 7, 10 + (i % 2) * 3, 3, 8, shade(glow, 0.6), 160);
  } else {
    p.polygon([[6, 26], [58, 26], [56, 12], [8, 12]], shade(base, 0.08));
    p.rect(8, 12, 48, 2, shade(base, 0.35));
    p.rect(10, 20, 44, 2, glow);
  }
  return p.outline().toCanvas();
}

export function generateKeycard(color) {
  const p = new PixelCanvas(32, 24), c = rgb(color);
  p.rect(2, 3, 28, 18, c);
  p.rect(2, 3, 28, 3, shade(c, 0.4));
  p.rect(5, 9, 8, 7, rgb('#e0c060')); p.rect(6, 10, 6, 5, rgb('#a08020'));
  p.rect(16, 10, 11, 2, shade(c, -0.5)); p.rect(16, 14, 8, 2, shade(c, -0.5));
  return p.outline().toCanvas();
}

export function generateCredit() {
  const p = new PixelCanvas(24, 24), c = rgb('#ffcc33');
  p.polygon([[12, 1], [22, 6], [22, 18], [12, 23], [2, 18], [2, 6]], shade(c, -0.25));
  p.polygon([[12, 3], [20, 7], [20, 17], [12, 21], [4, 17], [4, 7]], c);
  p.rect(9, 7, 6, 2, shade(c, -0.5)); p.rect(8, 9, 2, 6, shade(c, -0.5)); p.rect(9, 15, 6, 2, shade(c, -0.5));
  p.set(7, 6, [255, 255, 255]);
  return p.outline().toCanvas();
}

export function generatePortalFrames(colA = '#b040ff', colB = '#40e0ff', frames = 8) {
  const W = 64, c = makeCanvas(W * frames, W), g = c.getContext('2d');
  const a = rgb(colA), b = rgb(colB);
  for (let f = 0; f < frames; f++) {
    const p = new PixelCanvas(W, W), t = f / frames;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const dx = (x - 31.5) / 30, dy = (y - 31.5) / 30;
      const r = Math.hypot(dx, dy);
      if (r > 1) continue;
      const ang = Math.atan2(dy, dx);
      const sw = Math.sin(ang * 3 + r * 10 - t * Math.PI * 2);
      let col = mix(a, b, 0.5 + 0.5 * sw);
      if (r < 0.25) col = mix([255, 255, 255], col, r / 0.25);
      const ring = r > 0.85 ? 1 : 0.75 + 0.25 * sw;
      p.set(x, y, shade(col, (ring - 1) * 0.6), Math.round(255 * (r > 0.92 ? (1 - r) / 0.08 : 1)));
    }
    g.putImageData(new ImageData(p.data, W, W), f * W, 0);
  }
  return c;
}

const PROPS = {
  barrel(p) { const c = rgb('#a02a1a'); p.rect(6, 6, 20, 32, c); for (let x = 6; x < 26; x++) p.vline(x, 6, 37, shade(c, Math.sin((x - 6) / 20 * Math.PI) * 0.35 - 0.15)); p.rect(6, 10, 20, 2, [40, 40, 40]); p.rect(6, 32, 20, 2, [40, 40, 40]); p.ellipse(16, 6, 10, 3, shade(c, 0.2)); p.rect(12, 18, 8, 8, rgb('#e0c020')); p.rect(15, 19, 2, 4, [20, 20, 20]); p.set(15, 24, [20, 20, 20]); },
  crate(p) { const c = rgb('#6a5a3a'); p.rect(2, 8, 28, 30, c); p.rect(2, 8, 28, 2, shade(c, 0.3)); p.line(4, 10, 28, 36, shade(c, -0.3)); p.line(28, 10, 4, 36, shade(c, -0.3)); p.rect(2, 8, 2, 30, shade(c, -0.3)); p.rect(28, 8, 2, 30, shade(c, -0.3)); },
  lamp(p) { p.rect(14, 10, 4, 54, [50, 50, 56]); p.rect(15, 10, 1, 54, [90, 90, 96]); p.rect(9, 2, 14, 10, [60, 60, 66]); p.rect(11, 4, 10, 6, [255, 240, 190]); p.rect(10, 60, 12, 4, [40, 40, 44]); },
  terminal(p) { const c = rgb('#3a3e46'); p.rect(4, 4, 24, 36, c); p.rect(7, 7, 18, 13, [10, 30, 16]); for (let y = 9; y < 19; y += 3) p.hline(8, 8 + ((y * 7) % 14), y, [80, 255, 140]); p.rect(7, 24, 18, 8, shade(c, -0.3)); for (let i = 0; i < 4; i++) p.rect(8 + i * 4, 26, 2, 2, i % 2 ? [255, 60, 60] : [255, 220, 60]); },
  skulls(p) { const b = rgb('#d8ccb0'); for (const [x, y] of [[8, 26], [20, 27], [14, 18], [26, 20], [4, 18]]) { p.ball(x, y, 6, b); p.set(x - 2, y, [20, 10, 10]); p.set(x + 1, y, [20, 10, 10]); p.rect(x - 2, y + 3, 4, 1, [40, 30, 20]); } },
  tree(p) { const c = rgb('#3a2a1e'); p.rect(14, 24, 5, 40, c); p.line(16, 30, 4, 12, c); p.line(16, 26, 28, 8, c); p.line(10, 20, 6, 6, c); p.line(24, 14, 30, 4, c); p.line(17, 40, 26, 30, c); },
  crystal(p) { const c = rgb('#9a40ff'); p.polygon([[14, 40], [10, 14], [16, 2], [20, 14], [18, 40]], c); p.polygon([[16, 2], [20, 14], [18, 40], [16, 40]], shade(c, -0.3)); p.polygon([[4, 40], [6, 22], [10, 18], [12, 40]], shade(c, 0.2)); p.polygon([[20, 40], [24, 24], [28, 20], [28, 40]], shade(c, 0.1)); },
  torch(p) { p.rect(14, 20, 4, 44, [70, 50, 30]); p.ellipse(16, 14, 6, 9, [255, 140, 20]); p.ellipse(16, 16, 3, 5, [255, 240, 120]); p.rect(11, 20, 10, 3, [50, 40, 30]); },
  cone(p) { const c = rgb('#ff6a10'); p.polygon([[16, 4], [26, 38], [6, 38]], c); p.rect(9, 18, 14, 4, [240, 240, 240]); p.rect(4, 38, 24, 3, shade(c, -0.4)); },
  candles(p) { for (const [x, h] of [[8, 14], [16, 20], [24, 12]]) { p.rect(x - 2, 40 - h, 4, h, [230, 220, 200]); p.ellipse(x, 36 - h, 2, 3, [255, 180, 40]); } p.rect(2, 40, 28, 2, [80, 20, 20]); },
  statue(p) { const c = rgb('#8a8a90'); p.rect(8, 50, 16, 14, shade(c, -0.2)); p.ball(16, 10, 6, c); p.polygon([[10, 16], [22, 16], [24, 50], [8, 50]], c); p.rect(6, 18, 4, 18, c); p.rect(22, 18, 4, 18, c); },
  plant(p) { const c = rgb('#2a7a3a'); p.rect(10, 30, 12, 10, rgb('#8a4a2a')); for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.35; p.line(16, 30, 16 + Math.cos(a) * 14, 30 + Math.sin(a) * 18, shade(c, (k % 3) * 0.15)); } },
  speakerbox(p) { p.rect(2, 2, 28, 60, [20, 20, 22]); p.circle(16, 18, 10, [45, 45, 48]); p.circle(16, 18, 4, [80, 80, 84]); p.circle(16, 44, 8, [45, 45, 48]); p.circle(16, 44, 3, [80, 80, 84]); },
  sandbags(p) { const c = rgb('#8a7a52'); for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - (row % 2); i++) p.ellipse(7 + i * 9 + (row % 2) * 4, 36 - row * 7, 5, 4, shade(c, (i + row) % 2 ? -0.1 : 0.1)); },
};
export const PROP_SIZE = { barrel: [32, 40], crate: [32, 40], lamp: [32, 64], terminal: [32, 44], skulls: [32, 34], tree: [32, 64], crystal: [32, 42], torch: [32, 64], cone: [32, 42], candles: [32, 44], statue: [32, 64], plant: [32, 42], speakerbox: [32, 64], sandbags: [32, 42] };
export function generateProp(name) {
  const [w, h] = PROP_SIZE[name] || [32, 40];
  const p = new PixelCanvas(w, h);
  (PROPS[name] || PROPS.crate)(p);
  p.grain(10, name.length);
  return p.outline().toCanvas();
}

// ------------------------------------------------------------ fx textures
export function generateFxAtlas() {
  // 4 cells of 32px: soft dot, spark, smoke, tracer(vertical)
  const c = makeCanvas(128, 32), g = c.getContext('2d');
  const p0 = new PixelCanvas(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5) / 15.5;
    if (d < 1) p0.set(x, y, [255, 255, 255], Math.round(255 * Math.pow(1 - d, 1.6)));
  }
  const p1 = new PixelCanvas(32, 32);
  for (let i = 0; i < 32; i++) { const a = 255 * (1 - Math.abs(i - 15.5) / 16); p1.set(i, 15, [255, 255, 255], a); p1.set(i, 16, [255, 255, 255], a); p1.set(15, i, [255, 255, 255], a); p1.set(16, i, [255, 255, 255], a); }
  p1.circle(16, 16, 3, [255, 255, 255]);
  const p2 = new PixelCanvas(32, 32), r = new Rng(7);
  for (let k = 0; k < 9; k++) { const x = r.int(9, 22), y = r.int(9, 22), rr = r.int(5, 9); for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) { const d = Math.hypot(xx, yy) / rr; if (d < 1) p2.set(x + xx, y + yy, [255, 255, 255], 70 * (1 - d)); } }
  const p3 = new PixelCanvas(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 12; x < 20; x++) {
    const dx = Math.abs(x - 15.5) / 4, dy = Math.abs(y - 15.5) / 16;
    const a = Math.max(0, 1 - dx) * Math.max(0, 1 - dy * dy);
    p3.set(x, y, [255, 255, 255], 255 * a);
  }
  [p0, p1, p2, p3].forEach((p, i) => g.putImageData(new ImageData(p.data, 32, 32), i * 32, 0));
  return c;
}

// ------------------------------------------------------------ placeholder monsters
// Atlas layout identical to processed sheets: rows = 8 directions, cols =
// idle, walk1-4, windup, attack, recover. Frame 64x64, feet at y=60.
const MF = 64;
function monsterFrame(kind, pal, view, action, step) {
  const p = new PixelCanvas(MF, MF);
  const base = rgb(pal.base), alt = rgb(pal.alt), eye = rgb(pal.eye);
  const front = view === 'front', back = view === 'back', side = view === 'side';
  const walk = action === 'walk' ? [0, 1, 0, -1][step] : 0;
  const bob = action === 'walk' ? (step % 2) : 0;
  const atk = action === 'windup' ? 1 : action === 'attack' ? 2 : action === 'recover' ? 3 : 0;
  if (kind === 'gunner') {
    const by = 18 + bob;
    // legs
    p.rect(24 + (side ? walk * 3 : 0), 40, 6, 20 - Math.max(0, walk * 2), shade(base, -0.3));
    p.rect(34 - (side ? walk * 3 : 0), 40, 6, 20 + Math.min(0, walk * 2), shade(base, -0.3));
    // torso
    p.rect(20, by + 6, 24, 18, base); p.rect(20, by + 6, 24, 3, shade(base, 0.3));
    p.rect(26, by + 12, 12, 4, alt);
    // head
    p.ball(32, by, 7, shade(base, 0.1));
    if (!back) { p.rect(side ? 33 : 27, by - 1, side ? 6 : 10, 3, eye); }
    // gun arm
    if (!back) {
      const gy = atk === 1 ? by + 6 : by + 12;
      if (side) { p.rect(32, gy, 22, 5, shade(alt, -0.4)); p.rect(50, gy + 1, 6, 3, [20, 20, 20]); if (atk === 2) { p.circle(58, gy + 2, 5, [255, 220, 80]); p.circle(58, gy + 2, 2, [255, 255, 255]); } }
      else { p.rect(38, gy, 8, 14, shade(alt, -0.4)); p.rect(39, gy + 12, 6, 5, [20, 20, 20]); if (atk === 2) { p.circle(42, gy + 18, 6, [255, 220, 80]); p.circle(42, gy + 18, 3, [255, 255, 255]); } }
    }
    p.rect(16, by + 8, 4, 14, shade(base, -0.15)); p.rect(44, by + 8, 4, 12, shade(base, -0.15));
  } else if (kind === 'watcher') {
    const fy = 26 + Math.round(Math.sin(step * 1.6) * 2);
    for (let i = 0; i < 5; i++) { const x = 22 + i * 5; p.line(x, fy + 10, x + walk * 2 + (i - 2), fy + 26 + (i % 2) * 4, shade(alt, -0.2)); }
    p.ball(32, fy, 13, base);
    if (!back) {
      const ex = side ? 38 : 32;
      p.circle(ex, fy, atk === 1 ? 8 : 7, [235, 225, 210]);
      p.circle(ex, fy, atk >= 1 ? 4 : 3, atk === 2 ? [255, 255, 255] : eye);
      p.set(ex, fy, [10, 5, 5]);
      if (atk === 2) p.circle(ex, fy, 9, eye, 90);
    } else { p.circle(32, fy, 5, shade(base, -0.3)); }
  } else if (kind === 'crawler') {
    const by = 40 + bob;
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const ph = (i + (s > 0 ? 1 : 0) + step) % 2 ? 2 : -2;
      const hx = 32 + s * (8 + i * 2), hy = by;
      const kx = 32 + s * (16 + i * 4), ky = by - 8 + (action === 'walk' ? ph : 0);
      const fx2 = 32 + s * (20 + i * 5), fy2 = 60;
      p.line(hx, hy, kx, ky, shade(base, -0.3)); p.line(kx, ky, fx2, fy2, shade(base, -0.4));
    }
    p.ellipse(32, by, 12, 8, base); p.ellipse(32, by - 2, 9, 5, shade(base, 0.2));
    if (!back) {
      p.ellipse(side ? 42 : 32, by + 2, 6, 5, alt);
      p.set(side ? 44 : 30, by, eye); p.set(side ? 45 : 34, by, eye);
      if (atk >= 1) { p.line(side ? 46 : 28, by + 5, side ? 52 : 24, by + 10 + atk, [240, 240, 220]); p.line(side ? 46 : 36, by + 5, side ? 52 : 40, by + 10 + atk, [240, 240, 220]); }
    }
  } else { // imp
    const by = 20 + bob;
    p.rect(25 + (side ? walk * 3 : 0), 42, 5, 18, shade(base, -0.3)); p.rect(34 - (side ? walk * 3 : 0), 42, 5, 18, shade(base, -0.3));
    p.ellipse(32, by + 14, 11, 14, base);
    p.ball(32, by - 2, 8, shade(base, 0.1));
    p.polygon([[25, by - 6], [21, by - 16], [28, by - 9]], alt); p.polygon([[39, by - 6], [43, by - 16], [36, by - 9]], alt);
    if (!back) { p.set(side ? 35 : 29, by - 3, eye); p.set(side ? 38 : 35, by - 3, eye); p.rect(side ? 34 : 29, by + 2, side ? 5 : 7, 1, [20, 0, 0]); }
    const ay = atk === 1 ? by - 10 : by + 6;
    p.rect(18, ay, 5, 14, shade(base, -0.1)); p.rect(41, ay, 5, 14, shade(base, -0.1));
    if (atk >= 1) { p.circle(atk === 1 ? 20 : 32, atk === 1 ? ay - 4 : by + 2, atk === 2 ? 7 : 5, [255, 120, 20]); p.circle(atk === 1 ? 20 : 32, atk === 1 ? ay - 4 : by + 2, 3, [255, 240, 120]); }
  }
  p.grain(10, step + atk * 7);
  return p.outline();
}

export function generateMonsterAtlas(kind, pal) {
  const views = ['front', 'front', 'side', 'back', 'back', 'side', 'side', 'front'];
  const flips = [false, false, true, false, false, false, false, false];
  const actions = [['idle', 0], ['walk', 0], ['walk', 1], ['walk', 2], ['walk', 3], ['windup', 0], ['attack', 0], ['recover', 0]];
  const c = makeCanvas(MF * 8, MF * 8), g = c.getContext('2d');
  for (let d = 0; d < 8; d++) {
    for (let a = 0; a < 8; a++) {
      let pc = monsterFrame(kind, pal, views[d], actions[a][0], actions[a][1]);
      if (flips[d]) pc = pc.flipX();
      // fake 3/4 views by a 1px squash shift
      g.putImageData(new ImageData(pc.data, MF, MF), a * MF + (d === 1 || d === 3 ? -1 : d === 5 || d === 7 ? 1 : 0), d * MF);
    }
  }
  return { canvas: c, frameW: MF, frameH: MF, footY: 61 };
}
