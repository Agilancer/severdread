// Content registry: everything visual the game needs, resolved from the
// generated manifest (real uploaded art) with procedural placeholders as a
// fallback. Real art always wins as soon as it exists in the manifest.
import { loadImage, cropToCanvas, makeCanvas } from '../engine/assets.js';
import { MONSTERS } from '../data/monsters.js';
import { PLACEHOLDER_BASES, ARCHETYPES } from '../data/weapons.js';
import { REAGENTS } from '../data/reagents.js';
import { KEY_HEX } from './levelgen/common.js';
import { ITEM_ICON_POOLS, KEY_SPRITES, CHEST_SPRITE, CHEST_SET, COIN_SPRITE, REAGENT_SPRITES, PLAYER_PROJ, ENEMY_PROJ_SHEETS, ENERGY_PROJ_SHEETS } from '../data/itemart.js';
import {
  generateWeaponFP, generateWeaponIcon, FP_W, FP_H, ICON_W, ICON_H, generateArmorIcon, generateRingIcon,
  generateReagentIcon, generateChest, generateKeycard, generateCredit, generatePortalFrames, generateProp,
  generateFxAtlas, generateMonsterAtlas, PROP_SIZE,
} from '../art/sprites_gen.js';
import { generateGoreAtlas } from '../art/gore_gen.js';

export class Content {
  constructor(renderer, store, manifest) {
    this.r = renderer;
    this.store = store;
    this.manifest = manifest || { monsters: [], weaponSets: [], spriteSets: [], textureSets: [] };
    this.tiles = [];
    this.tileCache = new Map();
    this.sprites = new Map();     // projectile/pickup sprite id -> {set, col, row}
    this.iconURLCache = new Map();
    this.monsterCache = new Map();
    this.weaponBases = [];
    this.baseById = new Map();
  }

  async init(progress = () => {}) {
    const m = this.manifest;
    // texture sets (needed to build level texture arrays)
    let done = 0;
    const total = m.textureSets.length + m.spriteSets.length + 1;
    for (const ts of m.textureSets) {
      try {
        const img = await loadImage(ts.file);
        for (const t of ts.tiles) this.tiles.push({ ...t, key: ts.id + ':' + t.id, set: ts, img, size: ts.size });
      } catch (e) { console.warn(e.message); }
      progress(++done / total);
    }
    for (const as of m.animatedTextureSets || []) {
      try {
        const img = await loadImage(as.file);
        for (const t of as.tiles) this.tiles.push({ ...t, key: as.id + ':' + t.id, set: as, img, size: as.size, animated: true, frames: as.frames });
      } catch (e) { console.warn(e.message); }
    }
    for (const ss of m.spriteSets) {
      const handle = this.store.fromURL(ss.file);
      try { await handle.promise; } catch (e) { /* placeholder fallback */ }
      for (const s of ss.sprites) this.sprites.set(s.id, { ...s, set: ss, handle });
      progress(++done / total);
    }
    for (const [id, s] of this.sprites) s.hue = hueName(s.color || [200, 200, 200]);
    await this._loadScatter();
    for (const [rid, sid] of Object.entries(REAGENT_SPRITES)) if (this.sprites.has(sid) && REAGENTS[rid]) REAGENTS[rid].sprite = sid;
    this.enemyProjPool = [...this.sprites.values()].filter((s) => ENEMY_PROJ_SHEETS.includes(s.set.id));
    this.energyProjPool = [...this.sprites.values()].filter((s) => ENERGY_PROJ_SHEETS.includes(s.set.id));
    // fx + world object textures (procedural)
    this.fx = this.store.fromCanvas('fx', generateFxAtlas());
    this.gore = this.store.fromCanvas('gore', generateGoreAtlas());   // blood, gibs, decals, lens (data/gore.js GC)
    this.chestClosed = this.store.fromCanvas('chest0', generateChest(false));
    this.chestOpen = this.store.fromCanvas('chest1', generateChest(true));
    this.credit = this.store.fromCanvas('credit', generateCredit());
    this.portal = this.store.fromCanvas('portal', generatePortalFrames());
    this.keycards = {};
    for (const [c, hex] of Object.entries(KEY_HEX)) this.keycards[c] = this.spriteHandle(KEY_SPRITES[c]) || this.store.fromCanvas('key_' + c, generateKeycard(hex));
    this.chestClosed = this.spriteHandle(CHEST_SPRITE) || this.chestClosed;
    this._scatterChestFallback();
    this.credit = this.spriteHandle(COIN_SPRITE) || this.credit;
    this.props = {};
    for (const name of Object.keys(PROP_SIZE)) this.props[name] = this.store.fromCanvas('prop_' + name, generateProp(name));
    this._buildWeaponBases();
    progress(1);
  }

  // ---------------------------------------------------------------- scatter terrain
  // manifest scatterSets (tools/process_art.py scatter_sheet): one atlas per
  // sheet, objects with per-frame rects. this.scatter[kind] = objects with
  // their GL handle and per-frame {uv, pw, ph, aspect}; range[kind] = pixel
  // height range (sizes keep the art's proportions, see data/scatter.js).
  async _loadScatter() {
    const sc = { pillar: [], explosive: [], pedestal: [], chest: [], spike: [], range: {} };
    for (const ss of this.manifest.scatterSets || []) {
      const handle = this.store.fromURL(ss.file);
      try { await handle.promise; } catch (e) { continue; }
      if (handle.failed) continue;
      const W = ss.w, H = ss.h;
      const list = sc[ss.kind] || (sc[ss.kind] = []);
      // terminals: an emissive twin of the sheet (screens / LEDs only) drawn
      // additively over the lit sprite, so screens glow in dark rooms
      let glow = null;
      if (ss.kind.startsWith('terminal') && handle.image) {
        try { glow = this.store.fromCanvas('glow_' + ss.id, terminalGlowCanvas(handle.image, ss.objects)); } catch (e) { glow = null; }
      }
      for (const o of ss.objects) {
        const frames = o.frames.map(([x, y, w, h]) => ({ uv: [(x + 0.5) / W, (y + 0.5) / H, (x + w - 0.5) / W, (y + h - 0.5) / H], pw: w, ph: h, aspect: w / h, rect: [x, y, w, h] }));
        list.push({ ...o, frames, handle, glow, set: ss.id });
      }
    }
    for (const k of Object.keys(sc)) {
      if (k === 'range' || !sc[k].length) continue;
      let lo = Infinity, hi = 0;
      for (const o of sc[k]) { lo = Math.min(lo, o.px); hi = Math.max(hi, o.px); }
      sc.range[k] = [lo, hi];
    }
    this.scatter = sc;
  }
  // legacy single chest handles (content.chestClosed / chestOpen) show the
  // first tech chest pair of the scatter sheet when it is there
  _scatterChestFallback() {
    const pair = (this.scatter?.chest || []).find((o) => o.set === CHEST_SET && o.style === 'tech') || this.scatter?.chest?.[0];
    if (!pair || !pair.handle.image) return;
    const crop = (f) => cropToCanvas(pair.handle.image, f.rect[0], f.rect[1], f.rect[2], f.rect[3]);
    this.chestClosed = this.store.fromCanvas('chest_scatter0', crop(pair.frames[0]));
    this.chestOpen = this.store.fromCanvas('chest_scatter1', crop(pair.frames[1]));
  }

  // GL handle for a single sprite cut out of a sprite set (cached)
  spriteHandle(id) {
    const s = this.sprites.get(id);
    if (!s || !s.handle.image) return null;
    const key = 'sp_' + id;
    let h = this.store.get(key);
    if (h) return h;
    const ss = s.set;
    return this.store.fromCanvas(key, cropToCanvas(s.handle.image, s.col * ss.size, s.row * ss.size, ss.size, ss.size));
  }
  spriteDataURL(id) {
    const key = 'url_' + id;
    let e = this.iconURLCache.get(key);
    if (e) return e;
    const s = this.sprites.get(id);
    if (!s || !s.handle.image) return null;
    const ss = s.set;
    const c = cropToCanvas(s.handle.image, s.col * ss.size, s.row * ss.size, ss.size, ss.size);
    e = { url: c.toDataURL(), canvas: c, cw: ss.size, ch: ss.size };
    this.iconURLCache.set(key, e);
    return e;
  }
  itemSpriteId(item) {
    const pool = ITEM_ICON_POOLS[item.kind];
    if (!pool) return null;
    const avail = pool.filter((id) => this.sprites.has(id));
    if (!avail.length) return null;
    return avail[(item.seed >>> 0) % avail.length];
  }
  pickSprite(ids, seed = 0) {
    const avail = ids.filter((id) => this.sprites.has(id));
    return avail.length ? avail[(seed >>> 0) % avail.length] : null;
  }
  // projectile sprite for an enemy, matching a colour tag; stable per monster
  enemyProjectileId(colorTag, seed) {
    let pool = this.enemyProjPool.filter((s) => s.hue === colorTag);
    if (!pool.length) pool = this.enemyProjPool;
    return pool.length ? pool[(seed >>> 0) % pool.length].id : null;
  }
  // player projectile sprite for a weapon
  playerProjectileId(kind, element, seed) {
    const tag = ELEMENT_HUE[element] || 'orange';
    if (kind === 'bullet' || kind === 'pellet') {
      if (element === 'physical') return this.pickSprite(PLAYER_PROJ.bullet_physical, seed);
      const ids = PLAYER_PROJ.bullet_elemental.filter((id) => this.sprites.get(id)?.hue === tag);
      return this.pickSprite(ids.length ? ids : PLAYER_PROJ.bullet_elemental, seed);
    }
    if (kind === 'rocket') return this.pickSprite(PLAYER_PROJ.rocket, seed);
    if (kind === 'grenade') return this.pickSprite(PLAYER_PROJ.grenade, seed);
    if (kind === 'disc') return element === 'physical' ? this.pickSprite(PLAYER_PROJ.disc, seed) : null;
    let pool = this.energyProjPool.filter((s) => s.hue === tag);
    if (!pool.length) pool = this.energyProjPool;
    return pool.length ? pool[(seed >>> 0) % pool.length].id : null;
  }

  tileCanvas(tile) {
    if (this.tileCache.has(tile.key)) return this.tileCache.get(tile.key);
    const s = tile.size;
    if (tile.animated) {
      const frames = [];
      for (let f = 0; f < tile.frames; f++) frames.push(cropToCanvas(tile.img, f * s, tile.row * s, s, s, 64, 64));
      this.tileCache.set(tile.key, frames);
      return frames;
    }
    const c = cropToCanvas(tile.img, tile.col * s, tile.row * s, s, s, 64, 64);
    this.tileCache.set(tile.key, c);
    return c;
  }

  // ---------------------------------------------------------------- monsters
  monsterDef(id) { return MONSTERS[id]; }

  monsterSprite(monsterId) {
    const def = MONSTERS[monsterId];
    const spriteId = def?.sprite || 'placeholder:gunner';
    const key = spriteId.startsWith('placeholder:') ? spriteId + ':' + monsterId : spriteId;
    if (this.monsterCache.has(key)) return this.monsterCache.get(key);
    let info;
    if (spriteId.startsWith('placeholder:')) {
      const kind = spriteId.split(':')[1];
      const atlas = generateMonsterAtlas(kind, def.palette0 || { base: '#777', alt: '#444', eye: '#f00' });
      const handle = this.store.fromCanvas('mon_' + key, atlas.canvas);
      info = { handle, frameW: atlas.frameW, frameH: atlas.frameH, footY: atlas.footY, cols: 8, rows: 8 };
    } else {
      const m = this.manifest.monsters.find((x) => x.id === spriteId);
      if (!m) {
        // sheet not uploaded yet: procedural body in the monster's colours
        const kind = def?.fallback || 'gunner';
        const atlas = generateMonsterAtlas(kind, def?.palette0 || { base: '#777', alt: '#444', eye: '#f00' });
        const handle = this.store.fromCanvas('mon_fb_' + monsterId, atlas.canvas);
        info = { handle, frameW: atlas.frameW, frameH: atlas.frameH, footY: atlas.footY, cols: 8, rows: 8, placeholder: true };
        this.monsterCache.set(key, info);
        return info;
      }
      const handle = this.store.fromURL(m.file);
      info = { handle, frameW: m.frameW, frameH: m.frameH, footY: m.footY, cols: m.actions.length, rows: m.directions.length };
    }
    this.monsterCache.set(key, info);
    return info;
  }

  // Animated key-door frames (door_frames sheets), or null if none uploaded.
  doorSet() {
    const ds = (this.manifest.doorSets || [])[0];
    if (!ds) return null;
    if (!this._doorImg) { this._doorImg = null; loadImage(ds.file).then((img) => { this._doorImg = img; }).catch(() => {}); }
    return this._doorImg ? ds : null;
  }
  preloadDoors() {
    const ds = (this.manifest.doorSets || [])[0];
    if (!ds) return Promise.resolve();
    return loadImage(ds.file).then((img) => { this._doorImg = img; }).catch(() => {});
  }
  // hub teleporter pad floor (one image, cut into per-cell layers by World)
  preloadPadFloor() {
    if (this.padFloorImg !== undefined) return Promise.resolve(this.padFloorImg);
    return loadImage('assets/textures/hub_portal_floor.png').then((img) => { this.padFloorImg = img; return img; }).catch(() => { this.padFloorImg = null; return null; });
  }
  padFloorCanvases(n) {
    const img = this.padFloorImg, out = [];
    if (!img) return null;
    const s = img.width / n;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) out.push(cropToCanvas(img, x * s, z * s, s, s, 64, 64));
    return out;
  }
  tileByKey(key) { return this.tiles.find((t) => t.key === key) || null; }
  doorFrameCanvases(ds, color, design) {
    const row = ds.colors.indexOf(color), s = ds.size, out = [];
    for (let f = 0; f < ds.frames; f++) out.push(cropToCanvas(this._doorImg, (design * ds.frames + f) * s, row * s, s, s, 64, 64));
    return out;
  }

  hasRealSprite(monsterId) {
    const def = MONSTERS[monsterId];
    return !!def && !String(def.sprite).startsWith('placeholder:') && this.manifest.monsters.some((x) => x.id === def.sprite);
  }

  preloadMonsters(ids) {
    return Promise.all(ids.map((id) => this.monsterSprite(id).handle.promise));
  }

  // UV rect of a monster frame
  monsterUV(info, dirIndex, actionIndex) {
    const aw = info.frameW * info.cols, ah = info.frameH * info.rows;
    const u0 = (actionIndex * info.frameW) / aw, v0 = (dirIndex * info.frameH) / ah;
    return [u0 + 0.5 / aw, v0 + 0.5 / ah, u0 + (info.frameW - 0.5) / aw, v0 + (info.frameH - 0.5) / ah];
  }

  // ---------------------------------------------------------------- projectile sprites
  // Returns {handle, uv:[u0,v0,u1,v1], color:[r,g,b]}; 'tracer' and unknown ids
  // fall back to procedural fx.
  projSprite(id) {
    const s = this.sprites.get(id);
    if (s && s.handle.ready) {
      const ss = s.set;
      const W = ss.cols * ss.size, H = ss.rows * ss.size;
      return { handle: s.handle, uv: [s.col * ss.size / W, s.row * ss.size / H, (s.col + 1) * ss.size / W, (s.row + 1) * ss.size / H], color: s.color.map((v) => v / 255), real: true, direction: s.direction || null, id };
    }
    return this.fxSprite(id === 'tracer' ? 3 : 0);
  }
  fxSprite(cell) {
    return { handle: this.fx, uv: [cell * 0.25, 0, cell * 0.25 + 0.25, 1], color: [1, 1, 1], real: false };
  }
  findSpriteByTag(tag) {
    for (const [id, s] of this.sprites) if (s.tags?.includes(tag)) return id;
    return null;
  }

  // ---------------------------------------------------------------- weapons
  _buildWeaponBases() {
    const bases = [];
    const realCount = {};
    for (const set of this.manifest.weaponSets) {
      for (const w of set.weapons) {
        // rows the art tool could not slice cleanly (fp.bad) never drop
        const ok = !w.fp?.bad;
        if (ok) realCount[w.archetype] = (realCount[w.archetype] || 0) + 1;
        bases.push({ id: w.id, name: w.name, archetype: w.archetype, element: w.element || 'physical', flavor: w.flavor, rarity: w.rarity || null, real: true, set, row: w.row, fp: w.fp || null, enabled: ok });
      }
    }
    // procedural placeholders fill archetypes with too little clean real art
    for (const b of PLACEHOLDER_BASES) {
      bases.push({ ...b, real: false, enabled: (realCount[b.archetype] || 0) < 2 });
    }
    for (const b of bases) {
      if (b.enabled === undefined) b.enabled = true;
      if (!ARCHETYPES[b.archetype]) { console.warn('unknown archetype', b.archetype, 'for', b.id); b.archetype = 'rifle'; }
      this.baseById.set(b.id, b);
    }
    this.weaponBases = bases;
  }

  // First-person sprite of a weapon base: atlas handle + frame layout + `meta`,
  // the per-weapon placement data written by tools/process_art.py (frame
  // pixels): art box {top, bottom, artL, artR}, gripX (where the arm leaves
  // the bottom edge), hands, muzzle [x, y], flashFrame, frames and seq (the
  // fire frames to play); guns also carry barrel [dx, dy], tip [x, y] and
  // barrelQ (tools/weapon_barrels.py) to aim the sprite at the crosshair.
  weaponFP(baseId, archetype) {
    let b = this.baseById.get(baseId);
    if (!b) {
      // unknown base (old save / removed art): draw a placeholder of the archetype
      b = PLACEHOLDER_BASES.find((p) => p.archetype === archetype) || PLACEHOLDER_BASES[0];
      b = this.baseById.get(b.id) || b;
    }
    if (b.real) {
      const s = b.set;
      const nf = s.fpFrames;
      const meta = b.fp || { top: 0, bottom: s.fpH, gripX: s.fpW / 2, artL: 0, artR: s.fpW, hands: 'center', muzzle: [s.fpW * s.muzzle[0], s.fpH * s.muzzle[1]], flashFrame: 1, frames: nf };
      return { key: b.id, handle: this.store.fromURL(s.fpFile), frameW: s.fpW, frameH: s.fpH, frames: nf, row: b.row, rows: s.weapons.length, meta };
    }
    const key = 'fp_' + b.id;
    let h = this.store.get(key);
    if (!h) h = this.store.fromCanvas(key, generateWeaponFP(b.archetype, b.pal, b.id.length * 31));
    if (!b.fpMeta) b.fpMeta = measureFPStrip(h.image, FP_W, FP_H, 7, !!ARCHETYPES[b.archetype]?.melee);
    return { key: b.id, handle: h, frameW: FP_W, frameH: FP_H, frames: 7, row: 0, rows: 1, meta: b.fpMeta };
  }

  // GL texture + uv for the dropped-in-world look (8th frame)
  weaponIconGL(baseId) {
    const b = this.baseById.get(baseId);
    if (b?.real) {
      const s = b.set;
      return { handle: this.store.fromURL(s.iconFile), uv: [0, b.row / s.weapons.length, 1, (b.row + 1) / s.weapons.length], w: s.iconW, h: s.iconH };
    }
    const key = 'icon_' + baseId;
    let h = this.store.get(key);
    if (!h) h = this.store.fromCanvas(key, this._placeholderWeaponIcon(b));
    return { handle: h, uv: [0, 0, 1, 1], w: ICON_W, h: ICON_H };
  }
  _placeholderWeaponIcon(b) {
    return generateWeaponIcon(b?.archetype || 'rifle', b?.pal || { body: '#666', accent: '#aaa' }, (b?.id || 'x').length * 17);
  }

  // ---------------------------------------------------------------- item icons
  // CSS description for DOM inventory slots: {url, size:[w,h], pos:[x,y], full:[w,h]}
  itemIconCSS(item, box = 44) {
    if (item.kind === 'weapon') {
      const b = this.baseById.get(item.base);
      if (b?.real) {
        const s = b.set;
        const sc = Math.min(box / s.iconW, box / s.iconH);
        return { url: s.iconFile, w: s.iconW * sc, h: s.iconH * sc, bgW: s.iconW * sc, bgH: s.iconH * s.weapons.length * sc, x: 0, y: -b.row * s.iconH * sc };
      }
      return this._cssFromCanvas('wicon_' + item.base, () => this._placeholderWeaponIcon(b), box);
    }
    const sid = this.itemSpriteId(item);
    if (sid) {
      const e = this.spriteDataURL(sid);
      if (e) { const sc = box / e.cw; return { url: e.url, w: box, h: box, bgW: e.cw * sc, bgH: e.ch * sc, x: 0, y: 0, canvas: e.canvas }; }
    }
    if (item.kind === 'ring') return this._cssFromCanvas('ring_' + item.icon.key, () => generateRingIcon(item.icon.pal, item.icon.seed), box);
    return this._cssFromCanvas('armor_' + item.icon.key, () => generateArmorIcon(item.kind, item.icon.pal, item.icon.seed), box);
  }
  _cssFromCanvas(key, make, box) {
    let e = this.iconURLCache.get(key);
    if (!e) {
      const c = make();
      e = { url: c.toDataURL(), cw: c.width, ch: c.height, canvas: c };
      this.iconURLCache.set(key, e);
    }
    const sc = Math.min(box / e.cw, box / e.ch);
    return { url: e.url, w: e.cw * sc, h: e.ch * sc, bgW: e.cw * sc, bgH: e.ch * sc, x: 0, y: 0, canvas: e.canvas };
  }
  // GL handle for any item lying in the world
  itemIconGL(item) {
    if (item.kind === 'weapon') return this.weaponIconGL(item.base);
    const sid = this.itemSpriteId(item);
    if (sid) { const h = this.spriteHandle(sid); if (h) return { handle: h, uv: [0, 0, 1, 1], w: 64, h: 64 }; }
    const css = this.itemIconCSS(item);
    const key = 'gl_' + css.url.length + '_' + (item.icon?.key || item.base);
    let h = this.store.get(key);
    if (!h) h = this.store.fromCanvas(key, css.canvas);
    return { handle: h, uv: [0, 0, 1, 1], w: css.canvas.width, h: css.canvas.height };
  }

  reagentIcon(id) {
    const r = REAGENTS[id];
    const key = 'reagent_' + id;
    let e = this.iconURLCache.get(key);
    if (!e) {
      let c;
      const sprite = r?.sprite && this.sprites.get(r.sprite);
      if (sprite && sprite.handle.image) {
        const ss = sprite.set;
        c = cropToCanvas(sprite.handle.image, sprite.col * ss.size, sprite.row * ss.size, ss.size, ss.size, 32, 32);
      } else c = generateReagentIcon(r?.icon || 'shard', r?.color || '#fff', id.length);
      e = { url: c.toDataURL(), canvas: c, cw: 32, ch: 32 };
      this.iconURLCache.set(key, e);
    }
    let h = this.store.get('gl_' + key);
    if (!h) h = this.store.fromCanvas('gl_' + key, e.canvas);
    return { url: e.url, handle: h };
  }

  npcPortraitCSS(npc) {
    // idle front frame of the npc's sprite, tinted via CSS filter
    const m = this.manifest.monsters.find((x) => x.id === npc.sprite);
    if (!m) return null;
    return { url: m.file, frameW: m.frameW, frameH: m.frameH, cols: m.actions.length, rows: m.directions.length };
  }

  makeCanvas(w, h) { return makeCanvas(w, h); }
}

const ELEMENT_HUE = { physical: 'orange', fire: 'orange', ice: 'cyan', lightning: 'blue', poison: 'green', void: 'purple', holy: 'yellow', plasma: 'cyan', blood: 'red', arcane: 'purple' };
function hueName([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 30) return 'white';
  const d = mx - mn;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 335) return 'red';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 200) return 'cyan';
  if (h < 250) return 'blue';
  return 'purple';
}

// Placement metadata for a procedural first-person strip (same fields the art
// tool writes for uploaded sheets): art box and grip from frame 0, muzzle from
// the bright flash pixels frame 1 adds.
function measureFPStrip(canvas, fw, fh, frames, melee) {
  const meta = { top: Math.round(fh * 0.2), bottom: fh, gripX: fw / 2, artL: Math.round(fw * 0.15), artR: Math.round(fw * 0.85), hands: melee ? 'right' : 'two', muzzle: melee ? null : [fw / 2, 4], flashFrame: melee ? null : 1, frames };
  let px;
  try { px = canvas.getContext('2d').getImageData(0, 0, fw * 2, fh).data; } catch (e) { return meta; }
  const W = fw * 2, solid = (x, y) => px[(y * W + x) * 4 + 3] >= 128;
  let top = fh, bottom = 0, l = fw, r = 0, gx = 0, gn = 0;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (!solid(x, y)) continue;
    top = Math.min(top, y); bottom = Math.max(bottom, y + 1); l = Math.min(l, x); r = Math.max(r, x + 1);
  }
  if (bottom <= top) return meta;
  for (let y = Math.max(0, bottom - Math.round(fh * 0.1)); y < bottom; y++) for (let x = 0; x < fw; x++) if (solid(x, y)) { gx += x; gn++; }
  Object.assign(meta, { top, bottom, artL: l, artR: r, gripX: gn ? gx / gn : (l + r) / 2 });
  if (!melee) {
    let mx = 0, my = 0, n = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const i1 = (y * W + fw + x) * 4, i0 = (y * W + x) * 4;
      if (px[i1 + 3] < 128 || (px[i1] + px[i1 + 1] + px[i1 + 2]) / 3 < 185) continue;
      if (px[i0 + 3] >= 128 && Math.abs(px[i1] - px[i0]) + Math.abs(px[i1 + 1] - px[i0 + 1]) + Math.abs(px[i1 + 2] - px[i0 + 2]) < 150) continue;
      mx += x; my += y; n++;
    }
    if (n > 12) meta.muzzle = [mx / n, my / n];
    else meta.muzzle = [(l + r) / 2, top];
  }
  return meta;
}

// Emissive twin of a terminal sheet: only the screen glyphs, LEDs and
// holograms survive (bright + saturated, or near white), in their own colour,
// alpha 0 elsewhere. Yellow-painted industrial bodies are bright and saturated
// too, so on those their yellow only glows on a dark screen.
function terminalGlowCanvas(img, objects) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const im = ctx.getImageData(0, 0, W, H), d = im.data;
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const wgt = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    if (d[p + 3] < 128) continue;
    const r = d[p], g = d[p + 1], b = d[p + 2];
    const mx = Math.max(r, g, b), sat = (mx - Math.min(r, g, b)) / Math.max(mx, 1), v = mx / 255;
    wgt[i] = Math.max(ss(0.38, 0.62, sat) * ss(0.5, 0.78, v), ss(0.86, 0.97, v) * ss(0.1, 0.3, sat) * 0.8);
  }
  for (const o of objects) {
    if (o.style !== 'industrial' || !o.tags?.includes('yellow') || o.tags.includes('hazard')) continue;
    const [x0, y0, fw, fh] = o.frames[0];
    for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) {
      const i = y * W + x, p = i * 4;
      if (!wgt[i]) continue;
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const hue = ((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI) + 360) % 360;
      if (hue <= 28 || hue >= 64) continue;
      // mean luminance of the opaque pixels around: dark screen vs painted body
      let s = 0, k = 0;
      for (let yy = Math.max(y0, y - 5); yy <= Math.min(y0 + fh - 1, y + 5); yy++) for (let xx = Math.max(x0, x - 5); xx <= Math.min(x0 + fw - 1, x + 5); xx++) {
        const q = (yy * W + xx) * 4;
        if (d[q + 3] < 128) continue;
        s += (0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]) / 255; k++;
      }
      wgt[i] *= 1 - ss(0.16, 0.24, k ? s / k : 1);
    }
  }
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const w = wgt[i];
    if (w < 0.02) { d[p] = d[p + 1] = d[p + 2] = d[p + 3] = 0; continue; }
    d[p] *= w; d[p + 1] *= w; d[p + 2] *= w; d[p + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}
