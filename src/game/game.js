// Game orchestrator: states, run/level flow, entities, rendering, saving.
import { input, consume, endFrame, keyboardTurn, requestLock, releaseLock } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { events } from '../core/events.js';
import { Rng, fx } from '../core/rng.js';
import { clamp, lerp, hexToRgb } from '../core/math.js';
import { generateLevel } from './levelgen/index.js';
import { buildHub } from './levelgen/hub.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
import { MODE } from './spritebatch.js';
import { F } from './grid.js';
import { KEY_HEX } from './levelgen/common.js';
import { updateProjectiles, submitProjectiles, projectileLights, damagePlayer, damageMonster, itemGlowColor } from './combat.js';
import { generateItem, rollItemLevel, generateWeapon } from './items.js';
import { ELEMENTS } from '../data/elements.js';
import { REAGENTS, CHEST_POOL } from '../data/reagents.js';
import { RARITY } from '../data/rarities.js';
import { MONSTERS } from '../data/monsters.js';
import { LensBlood } from './gore.js';
import * as B from '../data/balance.js';

const SAVE_KEY = 'severdread_save_v1';
const SETTINGS_KEY = 'severdread_settings_v1';

export function defaultSettings() {
  return { master: 0.8, sfx: 0.9, music: 0.45, sens: 1, touchSens: 1, invertY: false, fov: 80, res: 240, quantize: true, shake: 1, damageNumbers: true, brightness: 1.1, gore: 2, lensBlood: true };
}

export function newSave() {
  return {
    version: 1, level: 1, xp: 0, credits: 150, reagents: {}, bag: [], bagSize: B.BAG_BASE, bagUpgrades: 0,
    equipment: { weapon0: null, weapon1: null, weapon2: null, weapon3: null, head: null, body: null, legs: null, ring0: null, ring1: null, ring2: null, ring3: null },
    run: { active: false, depth: 0, themes: [] }, best: { depth: 0, kills: 0 }, stats: { kills: 0, bosses: 0, deaths: 0, runs: 0 },
    shop: null, created: Date.now(),
  };
}

// share of the screen height the idle weapon art fills, per archetype
const WEAPON_SCREEN_SHARE = { pistol: 0.38, revolver: 0.4, smg: 0.42, shuriken: 0.4, javelin: 0.42, blade: 0.46, club: 0.46, mace: 0.46, minigun: 0.48, rocket: 0.48, super_shotgun: 0.46 };

export class Game {
  constructor(renderer, store, content, hud, ui, touch) {
    this.renderer = renderer;
    this.store = store;
    this.content = content;
    this.hud = hud;
    this.ui = ui;
    this.touch = touch;
    this.events = events;
    this.time = 0;
    this.state = 'title';
    this.world = null;
    this.player = null;
    this.post = { flash: [0, 0, 0, 0], levelUp: 0, warp: 0, lowHealth: 0, vignette: 0.9 };
    this.lens = new LensBlood(this);   // blood on the camera lens (gore.js)
    this.shakeAmt = 0;
    this.noiseT = 0;
    this.timeScale = 1; this.slowT = 0;
    this.damageNumbers = [];
    this.shockwaves = [];
    this.singularities = [];
    this.levelUpT = 0; this.levelUpLevel = 0;
    this.killsTotal = 0; this.killsLeft = 0;
    this.boss = null;
    this.prompt = null;
    this.settings = { ...defaultSettings(), ...this.loadJSON(SETTINGS_KEY) };
    this.applySettings();
    this.save = this.loadSave();
  }

  // ------------------------------------------------------------------ persistence
  loadJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  loadSave() {
    const s = this.loadJSON(SAVE_KEY);
    if (!s || !s.version) return null;
    const base = newSave();
    return { ...base, ...s, equipment: { ...base.equipment, ...(s.equipment || {}) }, run: { ...base.run, ...(s.run || {}) } };
  }
  persist() {
    if (!this.save) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { console.warn('save failed', e); }
  }
  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
    this.applySettings();
  }
  applySettings() {
    const s = this.settings;
    audio.vol.master = s.master; audio.vol.sfx = s.sfx; audio.vol.music = s.music;
    audio.applyVolumes();
    input.settings.sens = s.sens; input.settings.touchSens = s.touchSens; input.settings.invertY = s.invertY;
  }

  hasSave() { return !!this.save; }

  newGame() {
    this.save = newSave();
    // starter weapons: a common sidearm + a common automatic
    const rng = new Rng(Date.now());
    const bases = this.content.weaponBases.filter((b) => b.enabled);
    const pick = (archs) => bases.find((b) => archs.includes(b.archetype) && (!b.rarity || b.rarity === 'common')) || bases[0];
    const w0 = generateWeapon(rng, 1, 'common', bases, pick(['pistol', 'revolver']));
    const w1 = generateWeapon(rng, 1, 'common', bases, pick(['smg', 'rifle', 'lmg']));
    w0.stats = {}; w1.stats = {};
    this.save.equipment.weapon0 = w0;
    this.save.equipment.weapon1 = w1;
    this.persist();
  }

  // ------------------------------------------------------------------ flow
  async enterHub(msg) {
    this.state = 'loading';
    this.inHub = true;
    const level = buildHub();
    level.seed = 99;
    await this.loadWorld(level);
    this.boss = null;
    this.killsLeft = 0;
    this.player.spawnAt(level.start.x, level.start.z, level.start.yaw);
    this.player.hp = this.player.maxHp;
    this.player.tempArmor = 0;
    for (const n of level.npcs) this.world.npcs.push({ ...n, animT: fx.float(0, 3) });
    audio.setMusic('hub');
    this.state = 'playing';
    this.persist();
    if (msg) this.toast(msg, '#9fd8ff');
    this.events.emit('enter', { hub: true });
  }

  async startLevel(depth) {
    this.state = 'loading';
    this.inHub = false;
    this.ui.showLoading(`DEPTH ${depth}`);
    await new Promise((r) => setTimeout(r, 30));
    const seed = (Date.now() ^ (depth * 2654435761)) >>> 0;
    const q = new URLSearchParams(location.search);
    const level = generateLevel({ depth, seed: this.debugSeed ?? seed, playerLevel: this.save.level, previousThemes: this.save.run.themes, themeId: this.debugTheme || q.get('theme') || undefined });
    this.save.run.active = true;
    this.save.run.depth = depth;
    this.save.run.themes = [...(this.save.run.themes || []), level.theme.id].slice(-12);
    await this.loadWorld(level);
    const w = this.world;
    // monsters
    const ids = new Set(level.spawns.map((s) => s.monster));
    ids.add(level.boss.monster);
    await Promise.race([this.content.preloadMonsters([...ids]), new Promise((r) => setTimeout(r, 4000))]);
    for (const s of level.spawns) w.monsters.push(new Monster(this, s, depth));
    this.boss = new Monster(this, level.boss, depth);
    w.monsters.push(this.boss);
    this.killsTotal = w.monsters.length;
    this.killsLeft = w.monsters.length;
    this.bossAnnounced = false;
    // keys, chests
    for (const k of level.keys) w.pickups.push({ kind: 'key', color: k.color, x: k.x, y: (w.floorAt(k.x, k.z) ?? 0) + 0.6, z: k.z, vx: 0, vy: 0, vz: 0, settled: true, age: 0, phase: fx.float(0, 6) });
    for (const c of level.chests) w.chests.push({ ...c, y: w.floorAt(c.x, c.z) ?? 0, open: false });
    w.scatter.stockPedestals(this.save.level, this.content.weaponBases, this.player.stats?.itemFind || 0);   // special items on pedestals
    this.player.spawnAt(level.start.x, level.start.z, level.start.yaw);
    audio.setMusic(level.theme.music || 'industrial', seed);
    this.ui.hideLoading();
    this.state = 'playing';
    this.post.warp = 0.8;
    this.persist();
    this.toast(`DEPTH ${depth}: ${level.theme.name.toUpperCase()}`, '#ffcc66', 4);
    this.events.emit('enter', { hub: false, depth, theme: level.theme });
  }

  async loadWorld(level) {
    if (!this.player) this.player = new Player(this, this.save);
    this.player.save = this.save;
    this.player.recalc();
    this.world = new World(this, level);
    await this.content.preloadDoors();
    this.world.buildGraphics(this.renderer, this.content);
    this.damageNumbers = []; this.shockwaves = []; this.singularities = [];
    this.lens.clear();
    this.prompt = null;
    if (this.touch) this.touch.setWeapon(this.player.weaponIndex);
  }

  startRunFromHub(continueRun) {
    const depth = continueRun && this.save.run.active ? this.save.run.depth + 1 : 1;
    if (!continueRun) { this.save.run = { active: true, depth: 0, themes: [] }; this.save.stats.runs++; }
    this.sfx('teleport');
    this.post.warp = 1;
    setTimeout(() => this.startLevel(depth), 450);
  }

  portalNext() { this.sfx('teleport'); this.post.warp = 1; setTimeout(() => this.startLevel(this.save.run.depth + 1), 400); }
  portalHome() { this.sfx('teleport'); this.post.warp = 1; setTimeout(() => this.enterHub('Run saved. The teleporter will take you deeper.'), 400); }

  playerDied() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    this.sfx('player_death');
    this.save.stats.deaths++;
    const depth = this.save.run.depth;
    this.save.best.depth = Math.max(this.save.best.depth, depth);
    this.save.run = { active: false, depth: 0, themes: [] };
    this.persist();
    this.state = 'dead';
    releaseLock();
    setTimeout(() => this.ui.showDeath({ depth, level: this.save.level }), 900);
  }

  // ------------------------------------------------------------------ progression
  gainXP(n) {
    const s = this.save;
    if (s.level >= B.MAX_LEVEL) return;
    s.xp += n;
    let leveled = false;
    while (s.level < B.MAX_LEVEL && s.xp >= B.xpToNext(s.level)) {
      s.xp -= B.xpToNext(s.level);
      s.level++;
      leveled = true;
    }
    if (leveled) {
      this.player.recalc();
      this.player.hp = this.player.maxHp;
      this.levelUpT = 4.2;
      this.levelUpLevel = s.level;
      audio.levelUpFanfare();
      this.shake(0.5);
      const p = this.player;
      this.world.burst(p.x, p.y + 1, p.z, [1, 0.05, 0.05], 80, { speed: 9, life: 1.4, size: 0.2, gravity: 4 });
      this.world.flash(p.x, p.y + 1.5, p.z, [1, 0.1, 0.05], 14, 2.5, 2.5);
      this.persist();
    }
  }

  monsterKilled(m) {
    if (m.summoned) return;
    if (m.countedDead) return;
    m.countedDead = true;
    this.killsLeft = Math.max(0, this.killsLeft - 1);
    this.save.stats.kills++;
    if (m.boss) { this.save.stats.bosses++; this.toast(`${m.name.toUpperCase()} DESTROYED`, '#ff5050', 4); this.shake(0.6); }
    if (this.killsLeft === 0 && !this.inHub) this.openPortal();
  }

  bossAwake(m) {
    if (this.bossAnnounced) return;
    this.bossAnnounced = true;
    this.events.emit('boss', m);
  }

  openPortal() {
    const L = this.world.level;
    this.world.portal = { x: L.portal.x, z: L.portal.z, y: this.world.floorAt(L.portal.x, L.portal.z) ?? 0, t: 0 };
    this.sfx('portal');
    this.toast('ALL ENEMIES SLAIN - A PORTAL HAS OPENED', '#c9a6ff', 5);
    this.save.best.depth = Math.max(this.save.best.depth, this.save.run.depth);
    this.persist();
  }

  // ------------------------------------------------------------------ effects API
  sfx(name, o = {}) { audio.play(name, o); }
  toast(text, color = '#fff', dur) { this.ui.toast(text, color, dur); }
  shake(a) { this.shakeAmt = Math.min(0.8, this.shakeAmt + a * this.settings.shake); }
  slowMo(t) { this.slowT = t; }
  elemLight(e) { return ELEMENTS[e]?.light || [1, 0.85, 0.55]; }
  damageNumber(x, y, z, n, crit, color) {
    if (!this.settings.damageNumbers) return;
    if (this.damageNumbers.length > 60) this.damageNumbers.shift();
    this.damageNumbers.push({ x: x + fx.float(-0.2, 0.2), y, z: z + fx.float(-0.2, 0.2), n: Math.round(n), crit, color, t: 0 });
  }
  addShockwave(x, y, z, speed, dmg, element) { this.shockwaves.push({ x, y, z, r: 0.5, speed, dmg, element, hit: false, life: 2.6 }); }
  addSingularity(x, y, z, dmg) { this.singularities.push({ x, y, z, t: 1.6, dmg, tick: 0 }); }
  summonMonster(id, x, z) {
    const w = this.world, g = w.grid, i = g.cellAt(x, z);
    if (i < 0 || !g.type[i] || (g.flags[i] & (F.VOID | F.HAZARD | F.PIT | F.OBSTACLE))) return;
    if (!MONSTERS[id]) return;
    const m = new Monster(this, { monster: id, x, z, variant: 'normal' }, w.depth, { summoned: true, alerted: true, hpMult: 0.6 });
    w.monsters.push(m);
    w.burst(x, m.y + 0.5, z, [0.8, 0.2, 1], 14, { speed: 3 });
  }

  // ------------------------------------------------------------------ main update
  update(dtRaw) {
    let dt = Math.min(dtRaw, 1 / 20);
    if (this.slowT > 0) { this.slowT -= dt; dt *= 0.35; }
    this.time += dt;
    if (this.state === 'title' || this.state === 'loading') { endFrame(); return; }
    // global input
    if (consume('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' || this.state === 'menu') this.ui.closeAll();
    }
    if (consume('menu') && (this.state === 'playing' || this.state === 'menu')) {
      if (this.state === 'menu') this.ui.closeAll(); else this.ui.openInventory();
    }
    if (consume('map') && (this.state === 'playing' || this.state === 'menu')) this.ui.toggleMap();   // M / touch MAP: equipment screen's map tab
    if (this.state !== 'playing' && this.state !== 'dead') { endFrame(); return; }
    const w = this.world, p = this.player;
    w.time += dt;
    keyboardTurn(dt);
    if (this.state === 'playing') p.update(dt);
    this.noiseT -= dt;
    w.updateDoors(dt, p, w.monsters);
    if (!this.inHub) w.updateFlow(dt, p.x, p.z);
    for (const m of w.monsters) m.update(dt);
    w.monsters = w.monsters.filter((m) => !m.dead || m.deathT < 1.2);
    updateProjectiles(this, dt);
    w.scatter.update(dt);          // explosives (fuses, chain reactions), spike traps
    this.updatePickups(dt);
    this.updateShockwaves(dt);
    this.updateInteractions(dt);
    w.updateEffects(dt);
    w.gore.update(dt);
    this.lens.update(dt);
    if (w.portal) w.portal.t += dt;
    // timers / post fx
    this.levelUpT = Math.max(0, this.levelUpT - dt);
    this.post.levelUp = this.levelUpT > 0 ? Math.min(1, this.levelUpT / 0.6, (4.2 - this.levelUpT) / 0.2 + 0.2) : 0;
    const f = this.post.flash;
    f[3] = Math.max(0, f[3] - dt * 1.6);
    this.post.warp = Math.max(0, this.post.warp - dt * 1.8);
    this.post.lowHealth = p.hp < p.maxHp * 0.3 && !p.dead ? 1 - p.hp / (p.maxHp * 0.3) : 0;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    for (const d of this.damageNumbers) d.t += dt;
    this.damageNumbers = this.damageNumbers.filter((d) => d.t < 0.9);
    if (this.touch) { this.touch.setUse(!!this.prompt, this.prompt?.short); }
    endFrame();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    releaseLock();
    this.ui.showPause();
  }
  resume() {
    if (this.state === 'paused' || this.state === 'menu') {
      this.state = 'playing';
      if (input.mode === 'keyboard') requestLock();
    }
  }

  // ------------------------------------------------------------------ pickups
  updatePickups(dt) {
    const w = this.world, p = this.player, st = p.stats;
    const keep = [];
    for (const pk of w.pickups) {
      pk.age += dt;
      if (!pk.settled) {
        pk.vy -= 14 * dt;
        pk.x += pk.vx * dt; pk.z += pk.vz * dt; pk.y += pk.vy * dt;
        if (!w.canOccupy(pk.x, pk.z, 0.1, pk.y, 0.2, 0.3)) { pk.x -= pk.vx * dt; pk.z -= pk.vz * dt; pk.vx *= -0.4; pk.vz *= -0.4; }
        const f = w.surfaceBelow(pk.x, pk.y - pk.vy * dt - 0.2, pk.z);   // floors, stairs, crate tops
        const floorY = f === null ? pk.y - 1 : f;
        if (pk.y < floorY + 0.25) {
          pk.y = floorY + 0.25;
          if (Math.abs(pk.vy) < 1.5) { pk.settled = true; pk.vy = 0; } else { pk.vy *= -0.35; pk.vx *= 0.6; pk.vz *= 0.6; }
        }
        if (f !== null) {
          // never lose loot into the void, a deep pit or a damaging floor: snap back to the player
          const ci = w.grid.cellAt(pk.x, pk.z), cf = w.grid.flags[ci];
          const onFloor = (cf & F.VOID) ? pk.y < floorY + 2 : pk.y < floorY + 0.3 && Math.abs(floorY - w.grid.floorAtPos(ci, pk.x, pk.z)) < 0.01;
          if (onFloor && w.cellDanger(ci)) { pk.x = p.x; pk.z = p.z; pk.y = p.y + 1; pk.vx = pk.vz = 0; pk.vy = 0; pk.settled = false; }
        }
      }
      const dx = p.x - pk.x, dz = p.z - pk.z, dy = (p.y + 0.6) - pk.y;
      const d = Math.hypot(dx, dz);
      const magnet = pk.kind === 'item' ? 1.1 : pk.kind === 'key' ? 1.2 : st.pickupRadius * (pk.kind === 'credits' ? 1.5 : 1);
      if (pk.age > 0.4 && d < magnet && Math.abs(dy) < 2.2 && !p.dead) {
        if (pk.kind !== 'item' && d > 0.45) {
          const k = Math.min(1, dt * 10);
          pk.x += dx * k; pk.z += dz * k; pk.y += dy * k; pk.settled = true;
          keep.push(pk); continue;
        }
        if (this.collect(pk)) continue;
      }
      keep.push(pk);
    }
    w.pickups = keep;
  }

  collect(pk) {
    const s = this.save, p = this.player;
    switch (pk.kind) {
      case 'credits': s.credits += pk.value; this.sfx('pickup_credits'); return true;
      case 'reagent':
        s.reagents[pk.id] = (s.reagents[pk.id] || 0) + pk.value;
        this.sfx('pickup_reagent');
        this.toast(`+${pk.value} ${REAGENTS[pk.id].name}`, REAGENTS[pk.id].color);
        return true;
      case 'key':
        p.keys.add(pk.color);
        this.sfx('pickup_key');
        this.toast(`Picked up the ${pk.color.toUpperCase()} KEY`, KEY_HEX[pk.color], 3);
        this.post.flash = [...hexToRgb(KEY_HEX[pk.color]), 0.25];
        return true;
      case 'orb':
        if (pk.orb === 'red') { p.heal(p.maxHp * 0.35); this.toast('+HEALTH', '#ff5050'); this.post.flash = [1, 0.1, 0.1, 0.2]; }
        if (pk.orb === 'blue') { p.tempArmor += Math.round(p.stats.armor * 0.25 + 10 + s.level * 2); this.toast(`+${p.tempArmor} ARMOR UNTIL LEVEL END`, '#60a0ff'); this.post.flash = [0.2, 0.4, 1, 0.2]; }
        if (pk.orb === 'gold') { s.credits += pk.value; this.toast(`+${pk.value.toLocaleString()} CREDITS!`, '#ffd040', 3); this.post.flash = [1, 0.8, 0.2, 0.25]; }
        this.sfx('pickup_orb');
        return true;
      case 'item': {
        if (s.bag.length >= s.bagSize) {
          if (!pk.warned || this.time - pk.warned > 3) { pk.warned = this.time; this.toast('BAG FULL - sell or scrap gear at the station', '#ff6060'); this.sfx('ui_error'); }
          return false;
        }
        s.bag.push(pk.item);
        const r = RARITY[pk.item.rarity];
        this.sfx(r.index >= 4 ? 'pickup_legendary' : r.index >= 2 ? 'pickup_rare' : 'pickup_item');
        this.toast(pk.item.name, r.color, r.index >= 3 ? 4 : 2.5);
        return true;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ interactions
  updateInteractions(dt) {
    const w = this.world, p = this.player;
    this.prompt = null;
    let best = null, bd = 2.3;
    const consider = (d, pr) => { if (d < bd) { bd = d; best = pr; } };
    for (const n of w.npcs) consider(Math.hypot(n.x - p.x, n.z - p.z), { text: `[E] Talk to ${n.name} - ${n.title}`, short: 'TALK', act: () => this.ui.openNPC(n) });
    if (w.level.teleporter) {
      const t = w.level.teleporter;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < t.r + 0.4) consider(0, { text: '[E] Activate teleporter', short: 'WARP', act: () => this.ui.openTeleporter() });
    }
    const chestName = w.scatter.chestLabel();
    for (const c of w.chests) if (!c.open) consider(Math.hypot(c.x - p.x, c.z - p.z) - 0.3, { text: `[E] Open ${chestName}`, short: 'OPEN', act: () => this.openChest(c) });
    w.scatter.interactions(consider);   // pedestal items
    if (w.portal) consider(Math.hypot(w.portal.x - p.x, w.portal.z - p.z) - 0.6, { text: '[E] Enter the portal', short: 'ENTER', act: () => this.ui.openPortal() });
    this.prompt = best;
    if (best && consume('use')) best.act();
    consume('use');
    // stepping into the portal also opens the choice
    if (w.portal && Math.hypot(w.portal.x - p.x, w.portal.z - p.z) < 0.7 && !this.portalCD) { this.portalCD = true; this.ui.openPortal(); }
    if (w.portal && Math.hypot(w.portal.x - p.x, w.portal.z - p.z) > 1.6) this.portalCD = false;
  }

  openChest(c) {
    c.open = true;
    const w = this.world, s = this.save, p = this.player;
    const depth = Math.max(1, w.depth);
    this.sfx('chest_open');
    w.burst(c.x, c.y + 0.6, c.z, [0.3, 0.9, 1], 30, { speed: 4, up: 2 });
    w.flash(c.x, c.y + 1, c.z, [0.3, 0.9, 1], 6, 0.6);
    const fake = { x: c.x, y: c.y, z: c.z, height: 0.8, mode: 'floor' };
    const rng = new Rng(fx.int(0, 2 ** 31));
    const nItems = rng.int(1, 2) + (rng.chance(0.25) ? 1 : 0);
    for (let k = 0; k < nItems; k++) {
      const item = generateItem(rng, { level: rollItemLevel(rng, s.level), bases: this.content.weaponBases, depth, itemFind: p.stats.itemFind + 0.5, minRarity: k === 0 ? 1 : 0 });
      this.dropAt(fake, { kind: 'item', item });
    }
    const pool = CHEST_POOL.filter((r) => !r.minDepth || depth >= r.minDepth);
    for (let k = 0; k < rng.int(1, 3); k++) {
      const r = rng.weighted(pool);
      this.dropAt(fake, { kind: 'reagent', id: r.id, value: rng.int(r.min, r.max) });
    }
    this.dropAt(fake, { kind: 'credits', value: B.creditsFor(depth, 6) });
  }

  dropAt(src, pk) {
    const a = fx.float(0, Math.PI * 2), sp = fx.float(0.8, 2.4);
    this.world.pickups.push({ ...pk, x: src.x, y: src.y + 0.8, z: src.z, vx: Math.cos(a) * sp, vy: fx.float(3, 5), vz: Math.sin(a) * sp, age: 0, settled: false, phase: fx.float(0, 6) });
  }

  updateShockwaves(dt) {
    const p = this.player, w = this.world;
    for (const s of this.shockwaves) {
      s.r += s.speed * dt; s.life -= dt;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (!s.hit && Math.abs(d - s.r) < 0.6 && p.y < s.y + 0.6) { s.hit = true; damagePlayer(this, s.dmg, s.element); p.knock((p.x - s.x) / (d || 1) * 6, (p.z - s.z) / (d || 1) * 6, 4); }
      const n = Math.min(48, Math.ceil(s.r * 6));
      if (fx.chance(0.7)) for (let k = 0; k < 3; k++) {
        const a = fx.float(0, Math.PI * 2);
        w.addParticle({ x: s.x + Math.cos(a) * s.r, y: s.y + 0.1, z: s.z + Math.sin(a) * s.r, vx: 0, vy: 1.5, vz: 0, life: 0.4, age: 0, size: 0.35, color: s.element === 'fire' ? [1, 0.5, 0.1] : [0.7, 0.6, 0.5], gravity: 3, cell: 2, add: s.element === 'fire', drag: 0 });
      }
      void n;
    }
    this.shockwaves = this.shockwaves.filter((s) => s.life > 0);
    for (const g of this.singularities) {
      g.t -= dt; g.tick -= dt;
      for (const m of w.monsters) {
        if (m.dead || m.boss) continue;
        const dx = g.x - m.x, dz = g.z - m.z, d = Math.hypot(dx, dz);
        if (d < 5 && d > 0.3) { m.kx += dx / d * 4 * dt * 6; m.kz += dz / d * 4 * dt * 6; }
      }
      if (g.tick <= 0) { g.tick = 0.3; for (const m of w.monsters) if (!m.dead && Math.hypot(g.x - m.x, g.z - m.z) < 2.5) damageMonster(this, m, g.dmg * 0.2, { element: 'void', noProc: true }); }
      if (fx.chance(0.8)) { const a = fx.float(0, 6.28); w.addParticle({ x: g.x + Math.cos(a) * 2, y: g.y, z: g.z + Math.sin(a) * 2, vx: -Math.cos(a) * 4, vy: 0, vz: -Math.sin(a) * 4, life: 0.5, age: 0, size: 0.12, color: [0.7, 0.3, 1], gravity: 0, cell: 0, add: true, drag: 0 }); }
    }
    this.singularities = this.singularities.filter((g) => g.t > 0);
  }

  // ------------------------------------------------------------------ render
  render() {
    const r = this.renderer;
    if (!this.world) return;
    const w = this.world, p = this.player, c = this.content, s = this.settings;
    const eye = p.eyePos();
    const sh = this.shakeAmt * this.shakeAmt;
    const cam = {
      x: eye[0] + (fx.next() - 0.5) * sh * 0.4, y: eye[1] + (fx.next() - 0.5) * sh * 0.3, z: eye[2] + (fx.next() - 0.5) * sh * 0.4,
      yaw: p.yaw + (fx.next() - 0.5) * sh * 0.05, pitch: p.pitch + (fx.next() - 0.5) * sh * 0.05, roll: p.camRoll,
      fov: (s.fov * Math.PI) / 180 * (p.dashT > 0 ? 1.06 : 1),
    };
    this.cam = cam;
    // lights
    const extra = [];
    projectileLights(this, extra);
    if (w.portal) extra.push({ x: w.portal.x, y: w.portal.y + 1.3, z: w.portal.z, r: 0.7, g: 0.4, b: 1, radius: 7, intensity: 1.2 + Math.sin(w.time * 4) * 0.2 });
    for (const pk of w.pickups) {
      if (pk.kind === 'key') { const col = hexToRgb(KEY_HEX[pk.color]); extra.push({ x: pk.x, y: pk.y + 0.3, z: pk.z, r: col[0], g: col[1], b: col[2], radius: 3, intensity: 0.9 }); }
      else if (pk.kind === 'item' && RARITY[pk.item.rarity].index >= 2) { const col = itemGlowColor(pk.item); extra.push({ x: pk.x, y: pk.y + 0.4, z: pk.z, r: col[0], g: col[1], b: col[2], radius: 2.6, intensity: 0.8 }); }
      else if (pk.kind === 'orb') { const col = pk.orb === 'red' ? [1, 0.2, 0.2] : pk.orb === 'blue' ? [0.3, 0.5, 1] : [1, 0.8, 0.2]; extra.push({ x: pk.x, y: pk.y, z: pk.z, r: col[0], g: col[1], b: col[2], radius: 3, intensity: 1 }); }
    }
    for (const m of w.monsters) if (m.elemental && !m.dead && m.distToPlayer < 14) { const col = ELEMENTS[m.elemental].light; extra.push({ x: m.x, y: m.y + m.height * 0.5, z: m.z, r: col[0], g: col[1], b: col[2], radius: 2.5, intensity: 0.5 }); }
    w.scatter.lights(extra);
    const lights = w.collectLights(extra);
    r.beginFrame(cam, w.env, lights, w.time);
    r.drawSky(w.sky);
    w.buildDoorMesh(r);
    r.drawWorld();
    // sprites
    const b = w.batcher;
    b.begin();
    for (const m of w.monsters) if (Math.hypot(m.x - cam.x, m.z - cam.z) < 60) m.submit(b, cam);
    this.submitWorldSprites(b, cam);
    submitProjectiles(this, b);
    w.gore.submit(b, c, cam);
    w.submitEffects(b, c, cam);
    r.drawSprites(b.finish());
    // first-person weapon
    if (!p.dead) this.drawWeapon();
    this.lens.draw(r, c.gore, c.fx);
    r.endFrame({ ...this.post, quantize: s.quantize, brightness: s.brightness });
  }

  submitWorldSprites(b, cam) {
    const w = this.world, c = this.content, t = w.time;
    const lightAt = (x, z) => w.grid.light[w.grid.cellAt(x, z)] ?? 0.8;
    for (const pr of w.level.props || []) {
      const h = c.props[pr.prop];
      if (!h) continue;
      const y = w.floorAt(pr.x, pr.z) ?? 0;
      const size = { lamp: 1.6, tree: 2.6, statue: 2, torch: 1.5, speakerbox: 2 }[pr.prop] || 1.0;
      b.add(h, MODE.CUTOUT, pr.x, y, pr.z, size * h.w / h.h, size, { light: lightAt(pr.x, pr.z), fullbright: pr.prop === 'torch' || pr.prop === 'crystal' || pr.prop === 'lamp' });
      if (pr.prop === 'torch' || pr.prop === 'candles') b.add(c.fx, MODE.ADD, pr.x, y + size * 0.9, pr.z, 0.5, 0.6, { uv: [0, 0, 0.25, 1], tint: [1, 0.55, 0.2, 0.6 + Math.sin(t * 15 + pr.x) * 0.2], anchorY: 0.5, fullbright: true });
    }
    w.scatter.submit(b, cam);   // pillars, explosives, pedestals + items, spike traps
    for (const ch of w.chests) {
      // theme-matched closed / open pair from the scatter chest sheet (game/scatter.js)
      if (!w.scatter.drawChest(b, ch)) {
        const h = ch.open ? c.chestOpen : c.chestClosed;
        b.add(h, MODE.CUTOUT, ch.x, ch.y, ch.z, 0.95, 0.77, { light: lightAt(ch.x, ch.z), glow: ch.open ? [0, 0, 0, 0] : [0, 0.05 + 0.05 * Math.sin(t * 3), 0.08, 0] });
      }
      if (!ch.open) { const gc = w.scatter.chestGlow(ch); b.add(c.fx, MODE.ADD, ch.x, ch.y + 0.4, ch.z, 1.4, 1.0, { uv: [0, 0, 0.25, 1], tint: [gc[0], gc[1], gc[2], 0.22 + 0.1 * Math.sin(t * 3)], anchorY: 0.5, fullbright: true }); }
    }
    for (const n of w.npcs) {
      const info = c.monsterSprite('piston_monk');
      if (!info.handle.ready) continue;
      const rel = Math.atan2(cam.z - n.z, cam.x - n.x) - n.yaw;
      const dir = ((Math.round(-Math.atan2(Math.sin(rel), Math.cos(rel)) / (Math.PI / 4)) % 8) + 8) % 8;
      const qh = 1.75 * info.frameH / info.footY, qw = qh * info.frameW / info.frameH;   // vendors stand tall behind their counters
      const pal = n.palette || {};
      const anim = Math.floor((t + n.animT) * 1.5) % 6 === 0 ? 5 : 0;
      b.add(info.handle, MODE.CUTOUT, n.x, w.floorAt(n.x, n.z) ?? 0, n.z, qw, qh, { uv: c.monsterUV(info, dir, anim), tint: pal.tint, sat: pal.sat ?? 1, glow: pal.glow ? [...pal.glow, 0] : undefined, anchorY: (info.frameH - info.footY) / info.frameH, light: 1 });
    }
    if (w.level.teleporter) {
      const tp = w.level.teleporter;
      for (let k = 0; k < 3; k++) {
        const a = t * 1.5 + k * 2.1;
        b.add(c.fx, MODE.ADD, tp.x + Math.cos(a) * 1.4, 0.4 + ((t * 0.8 + k * 0.33) % 1) * 2.2, tp.z + Math.sin(a) * 1.4, 0.3, 0.3, { uv: [0, 0, 0.25, 1], tint: [0.3, 0.9, 1, 0.8], anchorY: 0.5, spherical: true, fullbright: true });
      }
      b.add(c.fx, MODE.ADD, tp.x, 0.3, tp.z, 3.2, 3.4, { uv: [0.75, 0, 1, 1], tint: [0.2, 0.7, 1, 0.35 + 0.1 * Math.sin(t * 4)], fullbright: true });
    }
    if (w.portal) {
      const P = w.portal, frames = 8, f = Math.floor(P.t * 10) % frames;
      const grow = Math.min(1, P.t * 1.5);
      b.add(c.portal, MODE.ADD, P.x, P.y + 1.35, P.z, 2.4 * grow, 2.4 * grow, { uv: [f / frames, 0, (f + 1) / frames, 1], anchorY: 0.5, fullbright: true, tint: [1.2, 1.2, 1.2, 1] });
      if (fx.chance(0.5)) w.addParticle({ x: P.x + fx.float(-1, 1), y: P.y + fx.float(0.2, 2.4), z: P.z + fx.float(-1, 1), vx: 0, vy: 0.5, vz: 0, life: 0.8, age: 0, size: 0.08, color: [0.7, 0.5, 1], gravity: -0.5, cell: 0, add: true, drag: 0 });
    }
    for (const pk of w.pickups) {
      const bob = pk.settled ? Math.sin(t * 3 + pk.phase) * 0.06 : 0;
      const y = pk.y + bob;
      if (pk.kind === 'credits') {
        const sw = Math.abs(Math.cos(t * 4 + pk.phase));
        b.add(c.credit, MODE.CUTOUT, pk.x, y - 0.12, pk.z, 0.28 * Math.max(0.15, sw), 0.28, { fullbright: true, light: 1 });
      } else if (pk.kind === 'reagent') {
        const ic = c.reagentIcon(pk.id);
        b.add(ic.handle, MODE.CUTOUT, pk.x, y - 0.15, pk.z, 0.34, 0.34, { fullbright: true });
        const col = hexToRgb(REAGENTS[pk.id].color);
        b.add(c.fx, MODE.ADD, pk.x, y, pk.z, 0.55, 0.55, { uv: [0, 0, 0.25, 1], tint: [...col, 0.35], anchorY: 0.5, spherical: true, fullbright: true });
      } else if (pk.kind === 'key') {
        const col = hexToRgb(KEY_HEX[pk.color]);
        b.add(c.keycards[pk.color], MODE.CUTOUT, pk.x, y - 0.2, pk.z, 0.45, 0.34, { fullbright: true, glow: [col[0] * 0.3, col[1] * 0.3, col[2] * 0.3, 0] });
        b.add(c.fx, MODE.ADD, pk.x, y, pk.z, 1.0, 1.0, { uv: [0, 0, 0.25, 1], tint: [...col, 0.5], anchorY: 0.5, spherical: true, fullbright: true });
      } else if (pk.kind === 'orb') {
        const col = pk.orb === 'red' ? [1, 0.15, 0.15] : pk.orb === 'blue' ? [0.3, 0.55, 1] : [1, 0.8, 0.15];
        const sz = pk.orb === 'gold' ? 0.9 : 0.55;
        const sid = pk.orb === 'red' ? 'crimson_sigil' : pk.orb === 'blue' ? 'azure_sigil' : 'gold_sigil';
        const spr = c.projSprite(sid);
        b.add(spr.handle, MODE.ADD, pk.x, y + 0.1, pk.z, sz, sz, { uv: spr.uv, anchorY: 0.5, spherical: true, fullbright: true, rot: t * 1.5, tint: spr.real ? [1.2, 1.2, 1.2, 1] : [...col, 1] });
        b.add(c.fx, MODE.ADD, pk.x, y + 0.1, pk.z, sz * 2, sz * 2, { uv: [0, 0, 0.25, 1], tint: [...col, 0.4 + 0.15 * Math.sin(t * 5)], anchorY: 0.5, spherical: true, fullbright: true });
      } else if (pk.kind === 'item') {
        const ic = c.itemIconGL(pk.item);
        const rar = RARITY[pk.item.rarity];
        const col = itemGlowColor(pk.item);
        const wid = pk.item.kind === 'weapon' ? 0.85 : 0.5;
        const hgt = wid * ic.h / ic.w;
        b.add(ic.handle, MODE.CUTOUT, pk.x, y - 0.2, pk.z, wid, hgt, { uv: ic.uv, fullbright: true, glow: rar.index >= 1 ? [col[0] * 0.15, col[1] * 0.15, col[2] * 0.15, 0] : undefined });
        if (rar.index >= 1) {
          // loot beam
          const legendary = rar.index >= 4;
          const lc = legendary ? (Math.sin(t * 3) > 0 ? [1, 0.85, 0.2] : [1, 0.5, 0.1]) : col;
          b.add(c.fx, MODE.ADD, pk.x, y - 0.2, pk.z, 0.35 + rar.index * 0.05, 1.6 + rar.index * 0.5, { uv: [0.75, 0, 1, 1], tint: [...lc, 0.35 + rar.index * 0.08], fullbright: true });
          b.add(c.fx, MODE.ADD, pk.x, y, pk.z, 0.9, 0.5, { uv: [0, 0, 0.25, 1], tint: [...lc, 0.45], anchorY: 0.5, fullbright: true });
        }
      }
    }
  }

  drawWeapon() {
    const p = this.player, r = this.renderer, wpn = p.currentWeapon();
    if (!wpn || this.inHub) return;
    const fp = this.content.weaponFP(wpn.base);
    if (!fp || !fp.handle.ready) return;
    const H = r.lowH, W = r.lowW;
    // placement from the art metadata: scale the real art box (not the padded
    // cell) to an archetype-specific share of the screen, anchor the hand/grip
    // at the bottom edge, one-handed weapons sit right of centre (DOOM style)
    const m = fp.meta || { top: 0, bottom: fp.frameH, gripX: fp.frameW / 2, artL: 0, artR: fp.frameW, hands: 'center', muzzle: null, flashFrame: 1 };
    const nF = fp.frames;
    const melee = /blade|mace|club/.test(wpn.archetype), thrown = /shuriken|javelin/.test(wpn.archetype);
    const artH = Math.max(8, m.bottom - m.top), artW = Math.max(8, m.artR - m.artL);
    const K = WEAPON_SCREEN_SHARE[wpn.archetype] ?? 0.44;
    const s = Math.min((K * H) / artH, (0.58 * W) / artW);
    const bias = m.hands === 'right' ? 0.11 : m.hands === 'left' ? -0.06 : 0.035;
    const seq = [];
    for (let f = 1; f < nF; f++) seq.push(f);
    const view = p.weaponView(H, seq);
    const frame = Math.min(view.frame, nF - 1);
    const over = Math.ceil(H * 0.06);                // overscan so the cut-off arm never shows
    const oy = Math.max(view.oy, -over + 1);
    const dyf = (m.dy && m.dy[frame]) || 0;
    const x = Math.round(W * 0.5 + bias * H - m.gripX * s + view.ox);
    const y = Math.round(H + over - (m.bottom - dyf) * s + oy);
    const dw = fp.frameW * s, dh = fp.frameH * s;
    const aw = fp.frameW * fp.frames, ah = fp.frameH * fp.rows;
    const uv = [(frame * fp.frameW + 0.5) / aw, (fp.row * fp.frameH + 0.5) / ah, ((frame + 1) * fp.frameW - 0.5) / aw, ((fp.row + 1) * fp.frameH - 0.5) / ah];
    // remember where the muzzle is on screen so shots leave from it
    if (m.muzzle && !melee) {
      const mx0 = Math.round(W * 0.5 + bias * H - m.gripX * s) + m.muzzle[0] * s, my0 = Math.round(H + over - m.bottom * s) + m.muzzle[1] * s;
      p.muzzleNDC = [(mx0 / W) * 2 - 1, 1 - (my0 / H) * 2];
    } else p.muzzleNDC = null;
    const flashF = m.flashFrame ?? 1;
    const flashing = view.frame > 0 && !melee && !thrown && (view.frame === flashF || view.frame === flashF + 1);
    // lighting: sector light + muzzle flash + damage flash
    const w = this.world;
    const cell = w.grid.cellAt(p.x, p.z);
    let light = cell >= 0 ? clamp(w.grid.light[cell] * 1.05 + 0.15, 0.35, 1.25) : 1;
    if (flashing) light = 1.5;
    const el = wpn.element;
    const ec = el !== 'physical' ? this.elemLight(el) : null;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    const add = ec && (wpn.infused || RARITY[wpn.rarity].index >= 2) ? [ec[0] * 0.12 * pulse, ec[1] * 0.12 * pulse, ec[2] * 0.12 * pulse] : [0, 0, 0];
    // elemental aura behind the weapon (infused / epic+)
    if (ec && (wpn.infused || RARITY[wpn.rarity].index >= 3)) {
      const fxh = this.content.fx;
      r.drawQuad(fxh.tex, x - dw * 0.1, y - dh * 0.05, dw * 1.2, dh * 1.1, [0, 0, 0.25, 1], { additive: true, tint: [ec[0], ec[1], ec[2], 0.18 + 0.12 * pulse] });
    }
    r.drawQuad(fp.handle.tex, x, y, dw, dh, uv, { tint: [light, light * (p.hurtT > 0 ? 0.6 : 1), light * (p.hurtT > 0 ? 0.6 : 1), 1], add });
    // muzzle flare glow
    if (flashing && m.muzzle) {
      const mx = x + m.muzzle[0] * s, my = y + m.muzzle[1] * s;
      const col = ec || [1, 0.75, 0.35];
      const fxh = this.content.fx;
      const sz = H * 0.28;
      r.drawQuad(fxh.tex, mx - sz / 2, my - sz / 2, sz, sz, [0, 0, 0.25, 1], { additive: true, tint: [col[0], col[1], col[2], 0.55] });
    }
  }
}
