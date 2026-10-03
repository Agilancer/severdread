// The orbital station hub (AEGIS-9): NPC booths around a tall roofed atrium,
// the teleporter chamber to the east and crew quarters to the west. The
// layout (booth positions, the east-west axis, the teleporter pad and the
// start) is fixed; this file adds the architecture: roof structure, columns,
// trims, counters, signage, consoles, windows onto space and lighting.
import { HUB_THEME } from '../../data/themes.js';
import { NPCS } from '../../data/npcs.js';
import { TS, F, newGrid, carveRect, encloseBorder } from './common.js';
import { Deco, FACE } from './deco.js';
import { Rng } from '../../core/rng.js';

export function buildHub() {
  const W = 38, H = 30;
  const g = newGrid(W, H, 9);
  const rng = new Rng(0xae9);
  const deco = new Deco(g, { ...HUB_THEME, railStyle: 'glass' }, rng);
  const L = 0.95;
  const ATRIUM_CEIL = 8;

  // ---- atrium: a tall roofed hall
  carveRect(g, 10, 7, 16, 15, { floor: 0, ceil: ATRIUM_CEIL, light: 1.0, floorTex: TS.FLOOR, ceilTex: TS.CEIL2, wallTex: TS.TRIM });
  // feature floor ring + two-tier dais in the centre
  g.rect(14, 11, 8, 7, (x, z, i) => { g.floorTex[i] = TS.FLOOR3; });
  g.rect(15, 12, 6, 5, (x, z, i) => { g.floor[i] = 0.25; g.wallTex[i] = TS.TRIM; g.floorTex[i] = TS.FLOOR3; });
  g.rect(16, 13, 4, 3, (x, z, i) => { g.floor[i] = 0.5; g.wallTex[i] = TS.TRIM; g.floorTex[i] = TS.ACCENT; });

  // ---- booths: north (z 3..6) and south (z 22..25)
  const booths = [
    { x: 11, z: 3, npc: 'vendor', face: 1, color: [1, 0.8, 0.3] }, { x: 16, z: 3, npc: 'gunsmith', face: 1, color: [1, 0.4, 0.2] },
    { x: 21, z: 3, npc: 'armorer', face: 1, color: [0.4, 0.7, 1] },
    { x: 13, z: 22, npc: 'jeweler', face: -1, color: [0.9, 0.4, 1] }, { x: 19, z: 22, npc: 'quartermaster', face: -1, color: [0.4, 1, 0.6] },
  ];
  const npcs = [];
  for (const b of booths) {
    carveRect(g, b.x, b.z, 4, 4, { floor: 0.25, ceil: 3.4, light: 1.1, floorTex: TS.FLOOR2, ceilTex: TS.CEIL, wallTex: TS.PANEL });
    g.rect(b.x - 1, b.z - 1, 6, 6, (x, z, i) => { if (!g.type[i]) g.wallTex[i] = TS.WALL2; });
    const nz = b.face > 0 ? b.z + 0.9 : b.z + 3.1;
    const def = NPCS.find((n) => n.id === b.npc);
    npcs.push({ ...def, x: b.x + 2, z: nz, yaw: b.face > 0 ? Math.PI / 2 : -Math.PI / 2 });
  }

  // ---- teleporter chamber (east) and its connector
  carveRect(g, 28, 9, 8, 11, { floor: 0, ceil: 7, light: 0.9, floorTex: TS.FLOOR2, ceilTex: TS.CEIL2, wallTex: TS.TRIM });
  carveRect(g, 26, 12, 2, 5, { floor: 0, ceil: 4, light: 0.9, floorTex: TS.FLOOR, ceilTex: TS.CEIL, wallTex: TS.TRIM });
  const pad = { x: 32, z: 14.5, r: 1.8 };
  g.rect(30, 12, 5, 5, (x, z, i) => {
    if (Math.hypot(x + 0.5 - pad.x, z + 0.5 - pad.z) <= 2.6) { g.floor[i] = 0.25; g.floorTex[i] = TS.SPECIAL; g.wallTex[i] = TS.TRIM; g.light[i] = 1.2; }
  });

  // ---- quarters / storage (west)
  carveRect(g, 2, 10, 6, 9, { floor: 0, ceil: 3.4, light: 0.8, floorTex: TS.FLOOR2, ceilTex: TS.CEIL, wallTex: TS.TRIM });
  carveRect(g, 8, 13, 2, 3, { floor: 0, ceil: 3.2, light: 0.8, floorTex: TS.FLOOR, ceilTex: TS.CEIL, wallTex: TS.TRIM });
  encloseBorder(g);
  for (let i = 0; i < W * H; i++) if (g.type[i]) { g.light[i] = Math.max(g.light[i], L * 0.85); g.flags[i] |= F.NOSPAWN; }

  // ================================================================ architecture
  const all = [];
  for (let i = 0; i < W * H; i++) if (g.type[i]) all.push(i);
  deco.wallTrims(all, { wainscot: 1.1, crown: true });

  // atrium roof: girder grid, a light ring over the dais, perimeter light coves
  const top = ATRIUM_CEIL;
  for (let x = 13; x <= 22; x += 3) deco.beam(x + 0.5, 7, x + 0.5, 22, top - 0.6, 0.35, 0.6);
  for (const z of [10, 14.5, 19]) deco.beam(10, z, 26, z, top - 0.95, 0.3, 0.35);
  const cx = 18, cz = 14.5;
  deco.box(cx - 2.6, top - 0.35, cz - 2.1, cx + 2.6, top - 0.2, cz + 2.1, TS.METAL);
  deco.box(cx - 2.3, top - 0.45, cz - 1.8, cx + 2.3, top - 0.35, cz + 1.8, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
  deco.box(cx - 0.1, 4.2, cz - 0.1, cx + 0.1, top - 0.45, cz + 0.1, TS.METAL, { faces: FACE.SIDES });
  deco.light(cx, 6.4, cz, [1, 0.97, 0.9], 12);
  for (const [lx, lz] of [[12, 9], [24, 9], [12, 20], [24, 20]]) deco.lightPanel(lx - 0.7, lz - 0.5, lx + 0.7, lz + 0.5, top, [0.9, 0.95, 1], 7);
  // four great columns framing the dais
  for (const [px, pz] of [[13.5, 10.5], [22.5, 10.5], [13.5, 18.5], [22.5, 18.5]]) deco.pillar(px, pz, 0.8, 0, top);
  // pilasters between the booth openings, on the atrium side of the walls
  for (const x of [15.5, 20.5]) {
    deco.box(x - 0.35, 0, 6.85, x + 0.35, top, 7.15, TS.PILLAR, { solid: true });
  }
  for (const x of [17.5]) deco.box(x - 0.35, 0, 21.85, x + 0.35, top, 22.15, TS.PILLAR, { solid: true });
  // windows onto space high on the atrium's long walls, between the girders
  for (let x = 11; x <= 24; x += 3) {
    deco.window(x, 7, 3, 4.4, 7.0, { emissive: 0.7 });
    deco.window(x, 21, 2, 4.4, 7.0, { emissive: 0.7 });
  }
  // the dais: a hologram plinth ring and planters at the corners of the atrium
  deco.box(cx - 1.2, 0.5, cz - 0.9, cx + 1.2, 0.62, cz + 0.9, TS.TRIM, { faces: FACE.TOP | FACE.SIDES });
  for (const [px, pz] of [[10.2, 7.2], [24.6, 7.2], [10.2, 20.6], [24.6, 20.6]]) deco.planter(px, pz, 0, 1.2, 1.2);

  // booths: counters, racks, screens and neon signs
  for (const b of booths) {
    const north = b.face > 0;
    const y = 0.25;
    // counter between NPC and customer, leaving a gap on one side
    const cz0 = north ? b.z + 1.7 : b.z + 1.9;
    deco.box(b.x + 0.2, y, cz0, b.x + 2.8, y + 0.72, cz0 + 0.45, { side: TS.METAL, top: TS.TRIM, [north ? 'pz' : 'nz']: TS.PANEL }, { solid: true });
    deco.box(b.x + 0.1, y + 0.72, cz0 - 0.05, b.x + 2.9, y + 0.79, cz0 + 0.5, TS.TRIM, {});
    // back wall: screens + shelving
    const bz = north ? b.z : b.z + 3.94;
    deco.box(b.x + 0.5, y + 1.4, north ? bz : bz, b.x + 3.5, y + 2.6, north ? bz + 0.06 : bz + 0.06, TS.SCREEN, { uv: 'fit', emissive: 0.85, faces: north ? FACE.PZ : FACE.NZ });
    deco.shelf(b.x + 3.25, north ? b.z + 0.6 : b.z + 0.6, b.x + 3.95, north ? b.z + 3.0 : b.z + 3.0, y, 2.4);
    // neon sign over the booth opening, on the atrium side
    const sz = north ? 7.0 : 22.0;
    deco.box(b.x + 0.4, 3.55, north ? sz - 0.02 : sz - 0.1, b.x + 3.6, 4.15, north ? sz + 0.1 : sz + 0.02, TS.NEON, { uv: 'fit', emissive: 1 });
    deco.light(b.x + 2, 3.0, north ? b.z + 3 : b.z + 1, b.color, 5);
    deco.lightPanel(b.x + 1.2, b.z + 1.4, b.x + 2.8, b.z + 2.6, 3.4 + 0.25, [1, 0.95, 0.85], 5);
  }

  // teleporter chamber: column ring, glass rail around the pad, a ceiling halo, consoles, conduits
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const px = pad.x + Math.cos(a) * 3.3, pz = pad.z + Math.sin(a) * 3.3;
    if (px < 28.4 || px > 35.6) continue;
    deco.pillar(px, pz, 0.45, 0, 7, { trim: true });
  }
  deco.box(pad.x - 2.2, 6.55, pad.z - 2.2, pad.x + 2.2, 6.7, pad.z + 2.2, TS.METAL);
  deco.box(pad.x - 1.9, 6.45, pad.z - 1.9, pad.x + 1.9, 6.55, pad.z + 1.9, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
  deco.console(29, 9, 0, 2);
  deco.console(34, 9, 0, 2);
  deco.console(34, 19, 0, 3);
  for (const z of [9.15, 19.85]) deco.pipe(28, z, 36, z, 5.6, 0.3);
  deco.window(35, 12, 0, 1.4, 5.2, { emissive: 0.7 });
  deco.window(35, 14, 0, 1.4, 5.2, { emissive: 0.7 });
  deco.window(35, 16, 0, 1.4, 5.2, { emissive: 0.7 });
  deco.lightPanel(29, 10.2, 30.4, 11, 7, [0.6, 0.9, 1], 5);
  deco.lightPanel(33.6, 18, 35, 18.8, 7, [0.6, 0.9, 1], 5);
  // connector: a framed portal
  deco.box(26, 3.7, 11.85, 28, 4.0, 17.15, TS.TRIM, { faces: FACE.BOTTOM | FACE.SIDES });

  // quarters: bunks, lockers, a table, a window
  deco.box(2.1, 0, 10.1, 4.0, 0.55, 11.0, { side: TS.METAL, top: TS.CARPET }, { solid: true });
  deco.box(2.1, 1.5, 10.1, 4.0, 2.0, 11.0, { side: TS.METAL, top: TS.CARPET }, {});
  deco.box(2.1, 0, 10.1, 2.2, 2.0, 11.0, TS.METAL, {});
  deco.box(2.1, 0, 17.0, 4.0, 0.55, 17.9, { side: TS.METAL, top: TS.CARPET }, { solid: true });
  deco.shelf(6.2, 10.1, 7.9, 10.8, 0, 2.3);
  deco.table(4.2, 13.6, 0, 1.4, 1.0, TS.METAL);
  deco.window(2, 14, 1, 1.0, 2.6, { emissive: 0.7 });
  deco.lightPanel(3.8, 12.3, 5.4, 13.0, 3.4, [1, 0.92, 0.8], 5);
  deco.lightPanel(3.8, 16.0, 5.4, 16.7, 3.4, [1, 0.92, 0.8], 5);

  const props = [
    { x: 6.4, z: 17.4, prop: 'barrel' }, { x: 2.6, z: 15.6, prop: 'terminal' },
    { x: 18, z: 14.5, prop: 'statue' },
  ];
  const lights = [
    { x: 32, y: 1.0, z: 14.5, color: [0.3, 0.85, 1.0], radius: 6, pulse: true },
    ...deco.lights,
  ];
  return {
    theme: HUB_THEME, depth: 0, grid: g, hub: true,
    start: { x: pad.x - 0.5, z: pad.z, yaw: Math.PI },
    npcs, teleporter: pad, props, lights, deco: deco.result(),
    spawns: [], doors: [], keys: [], chests: [], voidY: -10, arena: [],
  };
}
