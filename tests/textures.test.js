// Texture role picker: every theme gets a logical tile (or placeholder) in every
// slot. Runs the planner on the manifest's tile list (no canvases needed).
import fs from 'fs';
import { THEMES, HUB_THEME } from '../src/data/themes.js';
import { TS, SLOT_COUNT } from '../src/game/levelgen/common.js';
import { planLevelTextures } from '../src/game/leveltextures.js';
import * as TR from '../src/data/texroles.js';
import { TEXGEN } from '../src/art/textures_gen.js';

const M = JSON.parse(fs.readFileSync(new URL('../assets/manifest.json', import.meta.url)));
const tiles = [];
for (const ts of M.textureSets) for (const t of ts.tiles) tiles.push({ ...t, key: ts.id + ':' + t.id });
for (const as of M.animatedTextureSets || []) for (const t of as.tiles) tiles.push({ ...t, key: as.id + ':' + t.id, animated: true });
const valid = new Set(tiles.map((t) => t.key));

let fails = 0;
const fail = (m) => { fails++; if (fails < 40) console.error('FAIL', m); };

// every code in the tables names a real tile / placeholder
const check = (c, where) => {
  if (c.startsWith('#')) { if (!TR.PH[c.slice(1)]) fail(`${where}: unknown placeholder ${c}`); return; }
  if (c.startsWith('=') || (c.includes('@') && !c.startsWith('A:'))) return;
  if (!valid.has(TR.tileKey(c))) fail(`${where}: no tile ${c} (${TR.tileKey(c)})`);
};
for (const [r, f] of Object.entries(TR.ROLES)) for (const [fam, s] of Object.entries(f)) for (const c of TR.codes(s)) check(c, `ROLES.${r}.${fam}`);
for (const [th, o] of Object.entries(TR.THEME_TEX)) for (const [k, s] of Object.entries(o)) {
  if (k === 'legacy') { for (const [k2, s2] of Object.entries(s)) for (const c of TR.codes(s2)) check(c, `${th}.legacy.${k2}`); } else for (const c of TR.codes(s)) check(c, `${th}.${k}`);
}
for (const [name, spec] of Object.entries(TR.PH)) if (!TEXGEN[spec.type]) fail(`PH.${name}: no generator ${spec.type}`);

const avoid = new Map();
for (const [g, v] of Object.entries(TR.AVOID)) for (const c of TR.codes(g)) avoid.set(TR.tileKey(c), v);
const mis = new Set(TR.codes(TR.ANIMATED_MIS_SLICED).map(TR.tileKey));
const themeIds = new Set([...THEMES, HUB_THEME].map((t) => t.id));
for (const id of Object.keys(TR.THEME_TEX)) if (!themeIds.has(id)) fail(`THEME_TEX.${id}: no such theme`);

let minDistinct = 99;
for (const theme of [...THEMES, HUB_THEME]) {
  if (!theme.family || !theme.railStyle) fail(`${theme.id}: missing family / railStyle`);
  for (const seed of [1, 7, 12345]) {
    const { plan, report } = planLevelTextures(theme, seed, tiles, {});
    for (const [name, v] of Object.entries(TS)) {
      if (v >= SLOT_COUNT) continue;
      const p = plan[name];
      if (!p) { fail(`${theme.id}: slot ${name} not planned`); continue; }
      if (p.key) {
        if (mis.has(p.key)) fail(`${theme.id}.${name}: mis-sliced animated tile ${p.key}`);
        const a = avoid.get(p.key);
        if (a?.bad && (a.bad.includes(p.role) || a.bad.includes(name.toLowerCase()))) fail(`${theme.id}.${name}: ${p.key} is bad for ${p.role}`);
      }
      if (TR.FIT_ROLES.has(p.role) && p.uvScale !== 1) fail(`${theme.id}.${name}: fit role with uvScale ${p.uvScale}`);
      if (['light', 'neon', 'screen'].includes(p.role) && p.emissive < 0.8) fail(`${theme.id}.${name}: light role not emissive`);
      if (['wall', 'floor', 'floor2', 'ceil', 'side', 'pillar', 'crate', 'stair', 'trim', 'panel'].includes(p.role) && p.emissive > 0.45) fail(`${theme.id}.${name}: ${p.key || p.phName} glows (${p.emissive})`);
    }
    // the same tile is never reused across the core surfaces
    const core = ['WALL', 'WALL2', 'FLOOR', 'FLOOR2', 'CEIL', 'ACCENT', 'DOOR', 'CRATE', 'STAIR', 'PILLAR'].map((n) => plan[n]).filter((p) => p.key && !p.src.startsWith('same:'));
    const keys = core.map((p) => p.key);
    if (new Set(keys).size !== keys.length) fail(`${theme.id}: core slots reuse a tile ${keys.join(' ')}`);
    minDistinct = Math.min(minDistinct, report.distinct);
  }
}
if (minDistinct < 25) fail(`a theme only has ${minDistinct} distinct textures`);
if (fails) { console.error(`textures: ${fails} failures`); process.exit(1); }
console.log(`textures OK: ${THEMES.length + 1} themes x 3 seeds, >= ${minDistinct} distinct textures per level`);
