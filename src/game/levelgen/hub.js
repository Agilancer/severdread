// The orbital station hub: NPC booths around an observation atrium (with the
// ruined Earth overhead) and the teleporter chamber.
import { HUB_THEME } from '../../data/themes.js';
import { NPCS } from '../../data/npcs.js';
import { TS, F, newGrid, carveRect, encloseBorder } from './common.js';

export function buildHub() {
  const W = 38, H = 30;
  const g = newGrid(W, H, 6);
  const L = 0.95;
  // atrium (open to space through the dome)
  carveRect(g, 10, 7, 16, 15, { floor: 0, ceil: 6, sky: true, light: 1.0, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  // inner ring floor pattern
  g.rect(14, 11, 8, 7, (x, z, i) => { g.floorTex[i] = TS.FLOOR2; });
  g.rect(16, 13, 4, 3, (x, z, i) => { g.floor[i] = 0.5; g.wallTex[i] = TS.ACCENT; g.floorTex[i] = TS.ACCENT; }); // central plinth
  // booths: north (z 3..6) and south (z 22..25)
  const booths = [
    { x: 11, z: 3, npc: 'vendor', face: 1 }, { x: 16, z: 3, npc: 'gunsmith', face: 1 }, { x: 21, z: 3, npc: 'armorer', face: 1 },
    { x: 13, z: 22, npc: 'jeweler', face: -1 }, { x: 19, z: 22, npc: 'quartermaster', face: -1 },
  ];
  const npcs = [];
  for (const b of booths) {
    carveRect(g, b.x, b.z, 4, 4, { floor: 0.25, ceil: 3.2, light: 1.1, floorTex: TS.FLOOR2, ceilTex: TS.CEIL });
    g.rect(b.x - 1, b.z - 1, 6, 6, (x, z, i) => { if (!g.type[i]) g.wallTex[i] = TS.WALL2; });
    const nz = b.face > 0 ? b.z + 0.9 : b.z + 3.1;
    const def = NPCS.find((n) => n.id === b.npc);
    npcs.push({ ...def, x: b.x + 2, z: nz, yaw: b.face > 0 ? Math.PI / 2 : -Math.PI / 2 });
  }
  // teleporter chamber (east)
  carveRect(g, 28, 9, 8, 11, { floor: 0, ceil: 5, light: 0.9, floorTex: TS.FLOOR2, ceilTex: TS.CEIL });
  carveRect(g, 26, 12, 2, 5, { floor: 0, ceil: 3.5, light: 0.9, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  const pad = { x: 32, z: 14.5, r: 1.8 };
  g.rect(30, 12, 5, 5, (x, z, i) => {
    if (Math.hypot(x + 0.5 - pad.x, z + 0.5 - pad.z) <= 2.6) { g.floor[i] = 0.25; g.floorTex[i] = TS.SPECIAL; g.wallTex[i] = TS.ACCENT; g.light[i] = 1.2; }
  });
  // quarters / storage (west)
  carveRect(g, 2, 10, 6, 9, { floor: 0, ceil: 3, light: 0.75, floorTex: TS.FLOOR2, ceilTex: TS.CEIL });
  carveRect(g, 8, 13, 2, 3, { floor: 0, ceil: 3, light: 0.8, floorTex: TS.FLOOR, ceilTex: TS.CEIL });
  encloseBorder(g);
  for (let i = 0; i < W * H; i++) if (g.type[i]) g.light[i] = Math.max(g.light[i], L * 0.85);

  const props = [
    { x: 3, z: 11, prop: 'crate' }, { x: 3.2, z: 12.2, prop: 'crate' }, { x: 6.6, z: 17.6, prop: 'barrel' },
    { x: 10.6, z: 7.6, prop: 'plant' }, { x: 25.4, z: 7.6, prop: 'plant' }, { x: 10.6, z: 21.4, prop: 'plant' }, { x: 25.4, z: 21.4, prop: 'plant' },
    { x: 28.6, z: 9.6, prop: 'terminal' }, { x: 35.4, z: 9.6, prop: 'terminal' }, { x: 2.6, z: 18.4, prop: 'terminal' },
    { x: 18, z: 14.5, prop: 'statue' },
  ];
  const lights = [
    { x: 32, y: 1.0, z: 14.5, color: [0.3, 0.85, 1.0], radius: 6, pulse: true },
    { x: 18, y: 4.0, z: 14.5, color: [1.0, 0.95, 0.85], radius: 10 },
  ];
  return {
    theme: HUB_THEME, depth: 0, grid: g, hub: true,
    start: { x: pad.x - 0.5, z: pad.z, yaw: Math.PI },
    npcs, teleporter: pad, props, lights,
    spawns: [], doors: [], keys: [], chests: [], voidY: -10, arena: [],
  };
}
