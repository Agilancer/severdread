// Picks a cohesive texture set for a level: for each surface slot, real
// uploaded tiles whose tags match the theme's request win; otherwise a
// placeholder is generated from the theme's spec.
import { Rng } from '../core/rng.js';
import { TS, KEY_HEX, SLOT_COUNT } from './levelgen/common.js';
import { generateTexture } from '../art/textures_gen.js';

const BUSY = ['machinery', 'equipment', 'door', 'window', 'screen', 'storefront', 'shop', 'lobby', 'pipes', 'tubes', 'canopy', 'shutter', 'hatch', 'fan', 'vent', 'skylight', 'railing', 'interior'];
const FLOORISH = new Set([TS.FLOOR, TS.FLOOR2, TS.CEIL, TS.HAZARD, TS.VOID, TS.SPECIAL]);

const HAZARD_SPECS = {
  lava: { tags: ['lava', 'hazard', 'floor'], ph: { type: 'lava', base: '#ff5a00' }, emissive: 1, scroll: 0.12 },
  acid: { tags: ['acid', 'hazard'], ph: { type: 'lava', base: '#60e020', dark: '#0a3008', accent: '#e0ff60' }, emissive: 0.85, scroll: 0.1 },
  water: { tags: ['water'], ph: { type: 'water', base: '#1a4a7a' }, emissive: 0.15, scroll: 0.07 },
};
const VOID_SPECS = {
  road: { ph: { type: 'asphalt', base: '#2a2a2e', lines: true, accent: '#e8d24a' }, emissive: 0.1 },
  rails: { ph: { type: 'grate', base: '#4a4038', dark: '#151210' }, emissive: 0 },
  lava: { tags: ['lava', 'hazard', 'floor'], ph: { type: 'lava', base: '#ff5a00' }, emissive: 1, scroll: 0.05 },
  water: { tags: ['water'], ph: { type: 'water', base: '#14385a' }, emissive: 0.1, scroll: 0.05 },
  clouds: { ph: { type: 'cloud', base: '#f4f0ff', alt: '#c8c0e0' }, emissive: 0.5, scroll: 0.15 },
  afterlife: { ph: { type: 'cloud', base: '#4a6a7a', alt: '#2a1a4a' }, emissive: 0.4, scroll: 0.08 },
  digital: { ph: { type: 'neon_grid', base: '#000000', accent: '#2bd6ff' }, emissive: 0.9 },
  snowfield: { ph: { type: 'snow', base: '#e8eef4' }, emissive: 0.3 },
  city_abyss: { ph: { type: 'windows', base: '#101014', alt: '#060608', accent: '#ffb050', litChance: 0.45, cell: 8, cellH: 8 }, emissive: 0.6 },
};

export function buildLevelTextures(theme, seed, content, opts = {}) {
  const rng = new Rng(seed ^ 0x51ed);
  const tex = theme.tex || {};
  const used = new Set();
  const slots = [];
  const canvases = [];
  const report = {};

  function realPick(req, slot) {
    if (!req || !req.tags || !content) return null;
    let best = [];
    for (const t of content.tiles) {
      if (used.has(t.key) && rng.chance(0.85)) continue;
      let score = 0;
      for (const tag of req.tags) if (t.tags.includes(tag) || t.tags.includes(tag.replace(/s$/, '')) || t.tags.includes(tag + 's')) score++;
      if (!score) continue;
      const floorish = FLOORISH.has(slot);
      if (floorish && t.tags.includes('floor')) score += 0.6;
      if (!floorish && t.tags.includes('wall')) score += 0.4;
      if (floorish && !t.tags.includes('floor') && t.tags.includes('wall')) score -= 0.7;
      if (!floorish && t.tags.includes('floor') && !t.tags.includes('wall')) score -= 0.5;
      if (t.tags.includes('hazard') && slot !== TS.HAZARD && slot !== TS.VOID) score -= 2;
      if (t.tags.includes('door') && slot !== TS.DOOR) score -= 2;
      if (t.tags.includes('centerpiece') && slot !== TS.ACCENT) score -= 1;
      // busy detail tiles (machinery, doors, windows, screens) make poor
      // large surfaces; keep them for secondary walls and accents
      const busy = BUSY.some((b) => t.tags.includes(b)) && !req.tags.some((b) => BUSY.includes(b));
      if (busy) score += (slot === TS.WALL2 || slot === TS.ACCENT) ? 0.3 : -1.2;
      if (slot === TS.CEIL && t.tags.includes('floor')) score += 0.3;
      if (t.animated) {
        if (slot === TS.HAZARD || slot === TS.VOID) score += 1.5;   // liquids look best moving
        else if (slot === TS.ACCENT || slot === TS.WALL2) score -= 0.6;
        else score -= 1.6;
      }
      const need = req.tags.length >= 3 ? 1.6 : 1.0;
      if (score >= need) best.push({ t, score });
    }
    if (!best.length) return null;
    const top = Math.max(...best.map((b) => b.score));
    best = best.filter((b) => b.score >= top - 1);
    return rng.weighted(best, (b) => b.score * b.score).t;
  }

  function fill(slot, req, extra = {}) {
    const real = realPick(req, slot);
    let canvas, emissive = extra.emissive || 0, scroll = extra.scroll || 0;
    if (real) {
      canvas = content.tileCanvas(real);       // array of frames for animated tiles
      used.add(real.key);
      if (real.tags.includes('glow')) emissive = Math.max(emissive, 0.55);
      if (real.animated) scroll = 0;           // the animation already moves
      report[slot] = real.id;
    } else {
      const spec = (req && req.ph) || { type: 'concrete', base: '#777' };
      canvas = generateTexture(spec, (seed + slot * 7919) >>> 0);
      report[slot] = 'placeholder:' + spec.type;
    }
    canvases[slot] = canvas;
    slots[slot] = { layer: slot, emissive, scroll };
  }

  fill(TS.WALL, tex.wall);
  fill(TS.WALL2, tex.wall2 || tex.wall);
  fill(TS.FLOOR, tex.floor);
  fill(TS.FLOOR2, tex.floor2 || tex.floor);
  fill(TS.CEIL, tex.ceil);
  fill(TS.ACCENT, tex.accent || tex.wall2);
  fill(TS.SIDE, tex.side || tex.wall);
  fill(TS.DOOR, tex.door || { ph: { type: 'door', base: '#5a5e66' } });
  for (const [slot, color] of [[TS.DOOR_RED, 'red'], [TS.DOOR_BLUE, 'blue'], [TS.DOOR_YELLOW, 'yellow'], [TS.DOOR_GREEN, 'green'], [TS.DOOR_PURPLE, 'purple']]) {
    canvases[slot] = generateTexture({ type: 'door', base: '#4a4e56', accent: KEY_HEX[color] }, seed + slot);
    slots[slot] = { layer: slot, emissive: 0.25, scroll: 0 };
  }
  const hz = HAZARD_SPECS[theme.hazard] || HAZARD_SPECS.lava;
  fill(TS.HAZARD, hz, hz);
  const vs = VOID_SPECS[theme.void];
  if (vs) fill(TS.VOID, vs, { emissive: vs.emissive, scroll: vs.scroll });
  else { canvases[TS.VOID] = generateTexture({ type: 'starfield' }, seed); slots[TS.VOID] = { layer: TS.VOID, emissive: 0, scroll: 0 }; }
  fill(TS.SPECIAL, tex.special || { ph: { type: 'teleporter', base: '#202830', accent: '#40e0ff' } }, { emissive: 0.7 });

  // TEMPORARY role fallbacks until the role-based picker lands
  const ROLE_PH = {
    [TS.TRIM]: { type: 'metal_panel', base: '#6a6e76' }, [TS.PILLAR]: { type: 'concrete', base: '#8a8880' },
    [TS.BEAM]: { type: 'metal_panel', base: '#4a4e56' }, [TS.CRATE]: { type: 'wood', base: '#7a5430' },
    [TS.CRATE2]: { type: 'corrugated', base: '#8a2a1a' }, [TS.MACHINE]: { type: 'tech_panel', base: '#3a3e48', accent: '#30d8ff' },
    [TS.PANEL]: { type: 'tech_panel', base: '#50545e' }, [TS.PIPE]: { type: 'pipes', base: '#5a5a60' },
    [TS.GRATE]: { type: 'grate', base: '#5a5a60' }, [TS.STAIR]: { type: 'metal_panel', base: '#5a5e66' },
    [TS.RAIL]: { type: 'metal_panel', base: '#8a8e96' }, [TS.LIGHT]: { type: 'ceiling_tile', base: '#f0f0e0', light: true },
    [TS.LAVA]: { type: 'lava', base: '#ff5a00' }, [TS.POISON]: { type: 'lava', base: '#60e020', dark: '#0a3008', accent: '#e0ff60' },
    [TS.SPIKES]: { type: 'metal_panel', base: '#9a9aa0' }, [TS.WATER]: { type: 'water', base: '#1a4a7a' },
    [TS.FACADE]: { type: 'windows', base: '#3a3f48', alt: '#1a2a3a', accent: '#ffd27a' }, [TS.FACADE2]: { type: 'windows', base: '#4a4640', alt: '#151515', accent: '#ff9a40' },
    [TS.FACADE3]: { type: 'windows', base: '#14121c', alt: '#1a0a2a', accent: '#ff40d0' }, [TS.ROAD]: { type: 'asphalt', base: '#2c2c30' },
    [TS.SIDEWALK]: { type: 'concrete', base: '#8a8880' }, [TS.ROOF]: { type: 'concrete', base: '#5a5852' },
    [TS.GLASS]: { type: 'windows', base: '#203040', alt: '#304a60', accent: '#a0d0ff' }, [TS.ROCK]: { type: 'rock', base: '#6a5a4c' },
    [TS.GROUND]: { type: 'grass', base: '#3d5a26' }, [TS.FOLIAGE]: { type: 'hedge', base: '#2a4a1a' },
    [TS.METAL]: { type: 'metal_panel', base: '#5a5e66' }, [TS.CEIL2]: { type: 'metal_panel', base: '#3a3e44' },
    [TS.FLOOR3]: { type: 'tile', base: '#9a9a9a' }, [TS.PITWALL]: { type: 'rock', base: '#3a3030' },
    [TS.WOOD]: { type: 'wood', base: '#6b4426' }, [TS.SCREEN]: { type: 'screen_wall', base: '#1a1e24', accent: '#40ff90' },
    [TS.PAINT]: { type: 'concrete', base: '#e8d24a' }, [TS.NEON]: { type: 'neon_grid', base: '#07040f', accent: '#ff2bd6' },
    [TS.CARPET]: { type: 'carpet', base: '#5a1a24', alt: '#a8862c' },
  };
  for (let k = 16; k < SLOT_COUNT; k++) {
    if (canvases[k]) continue;
    canvases[k] = generateTexture(ROLE_PH[k] || { type: 'concrete', base: '#777' }, (seed + k * 7919) >>> 0);
    slots[k] = { layer: k, emissive: (k === TS.LIGHT || k === TS.NEON || k === TS.SCREEN) ? 1 : (k === TS.LAVA ? 1 : k === TS.POISON ? 0.85 : 0), scroll: 0 };
  }

  // Flatten into texture-array layers. Static slot k -> layer k. Animated
  // slots get their frames appended after the 16 slots and encode
  // layer = firstFrame + frames * 1000 (decoded in the world shader).
  const layers = [];
  for (let k = 0; k < SLOT_COUNT; k++) {
    const c = canvases[k];
    layers[k] = Array.isArray(c) ? c[0] : c;
  }
  for (let k = 0; k < SLOT_COUNT; k++) {
    const c = canvases[k];
    if (!Array.isArray(c)) continue;
    const first = layers.length;
    for (const f of c) layers.push(f);
    slots[k].layer = first + c.length * 1000;
  }

  // moving levels: the road / track scrolls under the vehicles
  if (opts.scrollSpeed) {
    slots[TS.VOID].scroll = opts.scrollSpeed;
    if (theme.params?.tunnel) slots[TS.ACCENT].scroll = opts.scrollSpeed;
  }
  return { layers, slots, report };
}
