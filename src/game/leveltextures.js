// Picks the texture for every role slot of a level (TS.* in levelgen/common.js)
// so that each surface shows a tile that logically fits it: floors get floor
// tiles, crates a crate face, consoles a machine front, skyscrapers facade
// windows... The tables live in data/texroles.js:
//   theme override -> archetype rule -> role list of the theme's families
//   (primary, secondary, family placeholder, fallback families) -> placeholder.
// Tiles are never reused across roles while an unused fitting tile exists, so a
// level shows many distinct textures; picks are deterministic per level seed.
import { Rng } from '../core/rng.js';
import { TS, KEY_HEX, SLOT_COUNT } from './levelgen/common.js';
import { generateTexture } from '../art/textures_gen.js';
import * as TR from '../data/texroles.js';

const SLOT_NAME = {};
for (const [name, v] of Object.entries(TS)) SLOT_NAME[v] = name;
const DOOR_COLOURS = [[TS.DOOR_RED, 'red'], [TS.DOOR_BLUE, 'blue'], [TS.DOOR_YELLOW, 'yellow'], [TS.DOOR_GREEN, 'green'], [TS.DOOR_PURPLE, 'purple']];
const HAZARD_SLOT = { lava: 'LAVA', acid: 'POISON', poison: 'POISON', water: 'WATER' };
// far plane under voids: lava / water reuse the level's liquid, the rest are procedural
const VOID_SPECS = {
  road: { ph: { type: 'asphalt', base: '#2a2a2e', lines: true, accent: '#e8d24a' }, emissive: 0.1 },
  rails: { ph: { type: 'grate', base: '#4a4038', dark: '#151210' }, emissive: 0 },
  lava: { slot: 'LAVA', emissive: 1, scroll: 0.05 },
  water: { slot: 'WATER', emissive: 0.1, scroll: 0.05 },
  clouds: { ph: { type: 'cloud', base: '#f4f0ff', alt: '#c8c0e0' }, emissive: 0.5, scroll: 0.15 },
  afterlife: { ph: { type: 'cloud', base: '#4a6a7a', alt: '#2a1a4a' }, emissive: 0.4, scroll: 0.08 },
  digital: { ph: { type: 'neon_grid', base: '#000000', accent: '#2bd6ff' }, emissive: 0.9 },
  snowfield: { ph: { type: 'snow', base: '#e8eef4' }, emissive: 0.3 },
  city_abyss: { ph: { type: 'windows', base: '#101014', alt: '#060608', accent: '#ffb050', litChance: 0.45, cell: 8, cellH: 8 }, emissive: 0.6 },
};
// old theme.tex request -> slot, used as a last resort placeholder
const THEME_TEX_FIELD = { WALL: 'wall', WALL2: 'wall2', FLOOR: 'floor', FLOOR2: 'floor2', CEIL: 'ceil', ACCENT: 'accent', SIDE: 'side', DOOR: 'door' };

// ---------------------------------------------------------------- indexes
let IDX = null;
function indexTiles(tiles) {
  if (IDX && IDX.tiles === tiles) return IDX;
  const byKey = new Map();
  for (const t of tiles || []) byKey.set(t.key, t);
  const avoid = new Map();
  for (const [group, v] of Object.entries(TR.AVOID)) for (const c of TR.codes(group)) avoid.set(TR.tileKey(c), v);
  const misSliced = new Set(TR.codes(TR.ANIMATED_MIS_SLICED).map(TR.tileKey));
  const emissive = new Map(Object.entries(TR.TILE_EMISSIVE).map(([c, v]) => [TR.tileKey(c), v]));
  IDX = { tiles, byKey, avoid, misSliced, emissive };
  return IDX;
}

export function themeFamilies(theme) {
  const f = theme.family ? [theme.family, theme.family2] : TR.codes(TR.THEME_FAMILY[theme.id] || '');
  const fams = f.filter((x) => x && TR.FAMILIES.includes(x));
  return fams.length ? fams : ['station'];
}

// Which slots the level geometry actually references (grid + detail boxes).
export function slotUsage(level) {
  if (!level || !level.grid) return null;
  const g = level.grid, used = new Set();
  const n = g.w * g.h;
  for (let i = 0; i < n; i++) {
    used.add(g.wallTex[i]);
    if (g.type[i]) { used.add(g.floorTex[i]); if (!g.sky[i]) used.add(g.ceilTex[i]); }
  }
  const add = (t) => { if (typeof t === 'number') used.add(t); else if (t) for (const v of Object.values(t)) used.add(v); };
  for (const b of level.deco?.boxes || []) add(b.tex);
  for (const b of level.deco?.bars || []) add(b.tex);
  for (const d of level.doors || []) if (d.slot !== undefined) used.add(d.slot);
  return used;
}

// ---------------------------------------------------------------- planning
// Decide the tile (or placeholder) of every slot without touching canvases.
// tiles: [{key, animated}] (content.tiles, or manifest entries in node).
// opts.usage: Set of used slots (slotUsage) - prioritises them and switches the
// older city / rooftop generators to facade walls (theme `legacy` overrides).
export function planLevelTextures(theme, seed, tiles, opts = {}) {
  const I = indexTiles(tiles);
  const rng = new Rng((seed ^ 0x51ed) >>> 0);
  const fams = themeFamilies(theme);
  const chain = [];
  for (const f of [...fams, ...fams.flatMap((x) => TR.FAMILY_FALLBACK[x] || [])]) if (!chain.includes(f)) chain.push(f);
  const ov = TR.THEME_TEX[theme.id] || {};
  const usage = opts.usage || null;
  const usesFacade = usage && (usage.has(TS.FACADE) || usage.has(TS.FACADE2) || usage.has(TS.FACADE3));
  const legacy = ov.legacy && (opts.legacy ?? (usage ? !usesFacade : false)) ? ov.legacy : null;
  const arch = TR.ARCHETYPE_TEX[theme.archetype] || {};
  const used = new Set();
  const plan = {};

  const usable = (key, role, lname) => {
    if (!I.byKey.has(key) || I.misSliced.has(key)) return false;
    const a = I.avoid.get(key);
    return !(a && a.bad && (a.bad.includes(role) || a.bad.includes(lname)));
  };
  // expand override entries into candidate groups
  const roleList = (role, fam) => TR.codes(TR.ROLES[role]?.[fam]).map(TR.tileKey);
  function expand(spec, role) {
    const out = [];
    for (const e of TR.codes(spec)) {
      if (e.startsWith('#')) { const p = TR.PH[e.slice(1)]; if (p) out.push({ ph: p, name: e.slice(1) }); }
      else if (e.startsWith('=')) out.push({ same: e.slice(1) });
      else if (e.includes('@') && !e.startsWith('A:')) {
        const [r0, f] = e.split('@');
        const r = r0 || role;
        for (const fam of f ? [f] : chain) for (const k of roleList(r, fam)) out.push({ key: k, role: r });
      } else out.push({ key: TR.tileKey(e) });
    }
    return out;
  }
  function phFor(role, fam) {
    const m = TR.ROLE_PH[role];
    const name = m && (fam ? m[fam] : m.default);
    return name && TR.PH[name.slice(1)] ? { ph: TR.PH[name.slice(1)], name: name.slice(1) } : null;
  }
  function defaultGroups(name, role) {
    const groups = [];
    if (TR.PH_FIRST.has(role)) { const p = phFor(role, fams[0]) || phFor(role); if (p) groups.push({ items: [p], strict: true }); }
    // primary family tiles, then the primary family's own placeholder, then the
    // secondary / fallback families' tiles
    groups.push({ items: roleList(role, fams[0]).map((k) => ({ key: k })) });
    const fp = phFor(role, fams[0]);
    if (fp) groups.push({ items: [fp], strict: true });
    for (const f of chain.slice(1)) groups.push({ items: roleList(role, f).map((k) => ({ key: k })) });
    const tf = THEME_TEX_FIELD[name] && theme.tex?.[THEME_TEX_FIELD[name]]?.ph;
    if (tf) groups.push({ items: [{ ph: tf, name: 'theme.' + THEME_TEX_FIELD[name] }], strict: true });
    const dp = phFor(role) || { ph: TR.PH.concrete, name: 'concrete' };
    groups.push({ items: [dp], strict: true });
    return groups;
  }
  const weights = [6, 3, 2, 1.2];
  function choose(items) {
    const k = Math.min(items.length, weights.length);
    let tot = 0;
    for (let i = 0; i < k; i++) tot += weights[i];
    let r = rng.next() * tot;
    for (let i = 0; i < k; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[0];
  }

  function pickSlot(name) {
    const role = TR.SLOT_ROLE[name];
    const lname = name.toLowerCase();
    let spec = legacy?.[lname] ?? ov[lname];
    let src = spec !== undefined ? (legacy?.[lname] !== undefined ? 'legacy' : 'theme') : null;
    if (spec === undefined && name === 'GLASS' && theme.railStyle === 'glass') { spec = TR.GLASS_RAIL_PH; src = 'glass-rail'; }
    if (spec === undefined && arch[lname] !== undefined) { spec = arch[lname]; src = 'archetype'; }
    const groups = [];
    if (spec !== undefined) groups.push({ items: expand(spec, role), strict: true });
    for (const gr of defaultGroups(name, role)) groups.push(gr);
    let pick = null;
    for (const gr of groups) {
      const ok = [];
      for (const it of gr.items) {
        if (it.same) { if (plan[it.same]) { pick = { ...plan[it.same], same: it.same }; break; } continue; }
        if (it.ph || usable(it.key, it.role || role, lname)) ok.push(it);
      }
      if (pick) break;
      const fresh = ok.filter((it) => it.ph || !used.has(it.key));
      if (fresh.length) { pick = choose(fresh); break; }
      if (gr.strict && ok.length) { pick = choose(ok); break; }
    }
    if (!pick) pick = { ph: TR.PH.concrete, name: 'concrete' };
    let out;
    if (pick.same) out = { ...pick, role, src: 'same:' + pick.same };
    else {
      const tile = pick.key ? I.byKey.get(pick.key) : null;
      // a tile borrowed from another role list (rock on cave walls, facades on
      // legacy city walls) keeps that role's scale / glow
      const urole = pick.role || role;
      const roleGlow = TR.ROLE_EMISSIVE[role] ?? TR.ROLE_EMISSIVE[urole] ?? 0;
      let emissive = roleGlow;
      if (tile) {
        const te = I.emissive.get(tile.key);
        if (te !== undefined) emissive = Math.max(emissive, te);
        const a = I.avoid.get(tile.key);
        if (a && a.emissive !== undefined && !roleGlow) emissive = a.emissive;
      }
      const animated = !!tile?.animated;
      out = {
        role, key: tile ? tile.key : null, ph: tile ? null : pick.ph, phName: tile ? null : pick.name,
        animated, emissive, scroll: animated ? 0 : (TR.ROLE_SCROLL[role] || 0),
        uvScale: TR.FIT_ROLES.has(role) || TR.FIT_ROLES.has(urole) ? 1 : TR.uvScaleFor(urole, tile?.key),
        src: src || (tile ? 'family' : 'placeholder'),
      };
      if (tile) used.add(tile.key);
    }
    plan[name] = out;
  }

  // fill order: used slots first (by visual priority), then the rest
  const names = TR.SLOT_PRIORITY.filter((n) => TS[n] !== undefined && TS[n] < SLOT_COUNT && TR.SLOT_ROLE[n]);
  for (const n of Object.keys(TS)) if (TR.SLOT_ROLE[n] && !names.includes(n) && TS[n] < SLOT_COUNT) names.push(n);
  const order = usage ? [...names.filter((n) => usage.has(TS[n])), ...names.filter((n) => !usage.has(TS[n]))] : names;
  for (const n of order) pickSlot(n);

  // theme hazard liquid (TS.HAZARD) = the matching liquid slot
  const hz = plan[HAZARD_SLOT[theme.hazard] || 'LAVA'];
  if (hz) plan.HAZARD = { ...hz, role: 'hazard', src: 'same:' + (HAZARD_SLOT[theme.hazard] || 'LAVA') };
  // void plane
  const vs = VOID_SPECS[theme.void];
  if (vs && vs.slot && plan[vs.slot]) {
    const s = plan[vs.slot];
    plan.VOID = { ...s, role: 'void', emissive: vs.emissive, scroll: s.animated ? 0 : vs.scroll, src: 'same:' + vs.slot };
  } else if (vs) plan.VOID = { role: 'void', key: null, ph: vs.ph, phName: 'void.' + theme.void, emissive: vs.emissive || 0, scroll: vs.scroll || 0, uvScale: 1, src: 'void' };
  else plan.VOID = { role: 'void', key: null, ph: { type: 'starfield' }, phName: 'starfield', emissive: 0, scroll: 0, uvScale: 1, src: 'void' };
  plan.SPECIAL = { role: 'special', key: null, ph: theme.tex?.special?.ph || TR.PH.teleporter, phName: 'teleporter', emissive: 0.7, scroll: 0, uvScale: 1, src: 'special' };
  for (const [slot, color] of DOOR_COLOURS) {
    plan[SLOT_NAME[slot]] = { role: 'keydoor', key: null, ph: { type: 'door', base: '#4a4e56', accent: KEY_HEX[color] }, phName: 'door_' + color, emissive: 0.25, scroll: 0, uvScale: 1, src: 'keydoor' };
  }

  // report: slot -> tile key / placeholder, plus a per-name summary
  const report = { families: fams, legacy: !!legacy, byName: {} };
  const distinct = new Set(), distinctUsed = new Set();
  for (const [name, p] of Object.entries(plan)) {
    const id = p.key || 'placeholder:' + (p.phName || p.ph?.type);
    report[TS[name]] = id;
    report.byName[name] = { role: p.role, pick: id, src: p.src, emissive: p.emissive, uvScale: p.uvScale };
    if (p.src === 'keydoor' || name === 'SPECIAL') continue;
    distinct.add(id);
    if (!usage || usage.has(TS[name])) distinctUsed.add(id);
  }
  report.distinct = distinct.size;
  report.distinctUsed = distinctUsed.size;
  return { plan, report };
}

// ---------------------------------------------------------------- build
export function buildLevelTextures(theme, seed, content, opts = {}) {
  const tiles = content?.tiles || [];
  const usage = opts.usage || slotUsage(opts.level);
  const { plan, report } = planLevelTextures(theme, seed, tiles, { ...opts, usage });
  const I = indexTiles(tiles);
  const canvases = [];
  const slots = [];
  const phCache = new Map();
  for (let k = 0; k < SLOT_COUNT; k++) {
    const name = SLOT_NAME[k];
    const p = name && plan[name];
    if (!p) continue;
    let canvas;
    if (p.key) canvas = content.tileCanvas(I.byKey.get(p.key));     // array of frames when animated
    else {
      // identical placeholder requests share one canvas (e.g. HAZARD = LAVA)
      const ck = JSON.stringify(p.ph) + '|' + (p.src.startsWith('same:') ? p.src.slice(5) : k);
      canvas = phCache.get(ck);
      if (!canvas) { canvas = generateTexture(p.ph, (seed + (p.src.startsWith('same:') ? TS[p.src.slice(5)] : k) * 7919) >>> 0); phCache.set(ck, canvas); }
    }
    canvases[k] = canvas;
    slots[k] = { layer: k, emissive: p.emissive || 0, scroll: p.scroll || 0, uvScale: p.uvScale || 1, role: p.role };
  }
  // unassigned slot numbers (reserved for future roles) mirror the main wall
  for (let k = 0; k < SLOT_COUNT; k++) {
    if (canvases[k]) continue;
    canvases[k] = canvases[TS.WALL];
    slots[k] = { ...slots[TS.WALL], layer: k };
  }

  // Flatten into texture-array layers. Static slot k -> layer k. Animated
  // slots get their frames appended after the slots and encode
  // layer = firstFrame + frames * 1000 (decoded in the world shader).
  const layers = [];
  for (let k = 0; k < SLOT_COUNT; k++) {
    const c = canvases[k];
    layers[k] = Array.isArray(c) ? c[0] : c;
  }
  const animFirst = new Map();
  for (let k = 0; k < SLOT_COUNT; k++) {
    const c = canvases[k];
    if (!Array.isArray(c)) continue;
    let first = animFirst.get(c);
    if (first === undefined) { first = layers.length; for (const f of c) layers.push(f); animFirst.set(c, first); }
    slots[k].layer = first + c.length * 1000;
  }

  // moving levels: the road / track scrolls under the vehicles
  if (opts.scrollSpeed) {
    slots[TS.VOID].scroll = opts.scrollSpeed;
    if (theme.params?.tunnel) slots[TS.ACCENT].scroll = opts.scrollSpeed;
  }
  return { layers, slots, report };
}
