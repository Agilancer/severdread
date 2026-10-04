// DOM menus: title, pause, settings, equipment/inventory, NPC shops,
// upgrades, bag expansion, teleporter, portal choice, death, toasts.
import { RARITY, RARITIES } from '../data/rarities.js';
import { REAGENTS } from '../data/reagents.js';
import { NPCS } from '../data/npcs.js';
import * as B from '../data/balance.js';
import { describeItem, kindLabel, sellValue, buyValue, maxUpgrade, generateItem, rollItemLevel, itemScore } from '../game/items.js';
import { Rng } from '../core/rng.js';
import { fmt } from '../core/math.js';
import { audio } from '../engine/audio.js';
import { input, requestLock, releaseLock } from '../engine/input.js';
import { TitleBlood, loadTitleBlood } from './title.js';
import { LevelMap } from './map.js';

const SLOT_LABELS = { weapon0: '1', weapon1: '2', weapon2: '3', weapon3: '4', head: 'HEAD', body: 'BODY', legs: 'LEGS', ring0: 'RING', ring1: 'RING', ring2: 'RING', ring3: 'RING' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.layer = null;
    this.toastWrap = document.createElement('div');
    this.toastWrap.className = 'toast-wrap';
    root.appendChild(this.toastWrap);
    this.selected = null;
    this.invView = 'gear';     // equipment screen tab: 'gear' | 'map' (remembered between openings)
    this.levelMap = null;      // mounted LevelMap while the MAP tab is showing
  }
  bind(game) { this.game = game; }

  click() { audio.play('ui_click'); }

  open(html, cls = 'screen dim') {
    this.close();
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.layer = el;
    el.addEventListener('click', (e) => { if (e.target.closest('button,.slot,.tab')) this.click(); });
    return el;
  }
  close() {
    if (this.titleBlood) { this.titleBlood.stop(); this.titleBlood = null; }
    if (this.levelMap) { this.levelMap.unmount(); this.levelMap = null; }   // stops its animation loop + listeners
    if (this.layer) { this.layer.remove(); this.layer = null; }
  }
  closeAll() {
    this.close();
    const g = this.game;
    if (g && (g.state === 'paused' || g.state === 'menu')) g.resume();
  }
  setMenuState() {
    const g = this.game;
    if (g.state === 'playing') { g.state = 'menu'; releaseLock(); }
  }

  toast(text, color = '#fff', dur = 2.6) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    t.style.color = color;
    t.style.animationDuration = dur + 's';
    this.toastWrap.appendChild(t);
    while (this.toastWrap.children.length > 5) this.toastWrap.firstChild.remove();
    setTimeout(() => t.remove(), dur * 1000);
  }

  // ------------------------------------------------------------------ title / loading
  // Pre-title credits plaque on black, until any key / click / touch. The
  // gesture also unlocks audio on iOS.
  showSplash(next) {
    const el = this.open(`
      <img class="splash-img" src="assets/ui/credits.webp" alt="Directed, produced, curated, prompted and game concept by Jamie Herrington of Blastorama Gaming. All art assets and programming were created by AI.">
      <div class="splash-hint blink">PRESS ANY KEY</div>`, 'screen splash');
    const hint = el.querySelector('.splash-hint');
    if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'TAP TO CONTINUE';
    let done = false;
    const go = (e) => {
      if (done) return;
      done = true;
      if (e) e.preventDefault?.();
      audio.unlock();
      window.removeEventListener('keydown', go, true);
      el.removeEventListener('pointerdown', go);
      el.removeEventListener('touchstart', go);
      el.classList.add('out');
      setTimeout(() => next(), 450);
    };
    window.addEventListener('keydown', go, true);
    el.addEventListener('pointerdown', go);
    el.addEventListener('touchstart', go, { passive: false });
  }

  showTitle() {
    const g = this.game;
    const el = this.open(`
      <img class="logo-img title-logo" src="assets/ui/logo.webp" alt="SEVERDREAD">
      <div class="tagline">ORBIT · DESCEND · LOOT · DIE · REPEAT</div>
      <div class="menu">
        ${g.hasSave() ? '<button class="btn red" data-a="continue">Continue</button>' : ''}
        <button class="btn ${g.hasSave() ? '' : 'red'}" data-a="new">${g.hasSave() ? 'New Game' : 'Start'}</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="help">Controls</button>
      </div>
      ${g.hasSave() ? `<div class="tagline" style="margin-top:14px">LEVEL ${g.save.level} · BEST DEPTH ${g.save.best.depth} · ${fmt(g.save.stats.kills)} KILLS</div>` : ''}
      <div class="credits">Directed / Produced by Jamie Herrington (Blastorama Gaming)</div>`, 'screen title');
    el.querySelector('[data-a=continue]')?.addEventListener('click', () => this.startGame(false));
    el.querySelector('[data-a=new]').addEventListener('click', () => {
      if (g.hasSave() && !confirm('Start a new game? Your current character will be erased.')) return;
      this.startGame(true);
    });
    el.querySelector('[data-a=settings]').addEventListener('click', () => this.showSettings(() => this.showTitle()));
    el.querySelector('[data-a=help]').addEventListener('click', () => this.showHelp(() => this.showTitle()));
    // blood pouring off the logo
    const logo = el.querySelector('.title-logo');
    const startBlood = async () => {
      const data = await loadTitleBlood();
      if (this.layer !== el) return;
      this.titleBlood = new TitleBlood(el, logo, data);
    };
    if (logo.complete && logo.naturalWidth) startBlood(); else logo.addEventListener('load', startBlood, { once: true });
  }

  async startGame(fresh) {
    const g = this.game;
    audio.unlock();
    this.close();
    if (fresh || !g.hasSave()) g.newGame();
    if (input.mode === 'keyboard') requestLock();
    g.touch?.setVisible(input.mode === 'touch');
    await g.enterHub(fresh ? 'Welcome to AEGIS-9. Talk to the crew, then step onto the teleporter.' : 'Welcome back.');
  }

  showLoading(text) {
    this.close();
    const el = document.createElement('div');
    el.className = 'screen dim loading';
    el.innerHTML = `<div class="portal-title">${esc(text)}</div><div class="blink" style="margin-top:12px;font-family:Silkscreen">GENERATING...</div>`;
    this.root.appendChild(el);
    this.loadingEl = el;
  }
  hideLoading() { this.loadingEl?.remove(); this.loadingEl = null; }

  // ------------------------------------------------------------------ pause / settings / help
  showPause() {
    const g = this.game;
    const el = this.open(`
      <div class="panel" style="min-width:260px;text-align:center">
        <h2>PAUSED</h2>
        <div class="menu" style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          <button class="btn red" data-a="resume">Resume</button>
          <button class="btn" data-a="inv">Equipment</button>
          <button class="btn" data-a="settings">Settings</button>
          <button class="btn" data-a="help">Controls</button>
          ${!g.inHub ? '<button class="btn" data-a="abandon">Abandon Run</button>' : ''}
          <button class="btn" data-a="title">Save &amp; Quit to Title</button>
        </div>
      </div>`);
    el.querySelector('[data-a=resume]').onclick = () => this.closeAll();
    el.querySelector('[data-a=inv]').onclick = () => { g.state = 'playing'; this.openInventory(); };
    el.querySelector('[data-a=settings]').onclick = () => this.showSettings(() => this.showPause());
    el.querySelector('[data-a=help]').onclick = () => this.showHelp(() => this.showPause());
    el.querySelector('[data-a=abandon]')?.addEventListener('click', () => {
      if (!confirm('Abandon this run? You keep your gear and levels but restart at depth 1.')) return;
      g.save.run = { active: false, depth: 0, themes: [] };
      this.close(); g.state = 'playing'; g.enterHub('Run abandoned.');
    });
    el.querySelector('[data-a=title]').onclick = () => { g.persist(); this.close(); g.state = 'title'; g.world = null; audio.stopMusic(); g.touch?.setVisible(false); this.showTitle(); };
  }

  showSettings(back) {
    const g = this.game, s = g.settings;
    const row = (label, key, min, max, step) => `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-k="${key}" value="${s[key]}"><span data-v="${key}">${s[key]}</span>`;
    const el = this.open(`
      <div class="panel" style="width:min(520px,100%)">
        <h2>SETTINGS</h2>
        <div class="settings-grid">
          ${row('Master volume', 'master', 0, 1, 0.05)}
          ${row('Effects', 'sfx', 0, 1, 0.05)}
          ${row('Music', 'music', 0, 1, 0.05)}
          ${row('Mouse sensitivity', 'sens', 0.2, 3, 0.05)}
          ${row('Touch sensitivity', 'touchSens', 0.2, 3, 0.05)}
          ${row('Field of view', 'fov', 60, 110, 1)}
          ${row('Render height (px)', 'res', 160, 480, 20)}
          ${row('Brightness', 'brightness', 0.7, 1.6, 0.05)}
          ${row('Screen shake', 'shake', 0, 1.5, 0.1)}
          <span>Invert look Y</span><input type="checkbox" data-c="invertY" ${s.invertY ? 'checked' : ''}><span></span>
          <span>16-bit colour dither</span><input type="checkbox" data-c="quantize" ${s.quantize ? 'checked' : ''}><span></span>
          <span>Damage numbers</span><input type="checkbox" data-c="damageNumbers" ${s.damageNumbers ? 'checked' : ''}><span></span>
          <span>Gore</span><select data-s="gore">${['Off', 'Low', 'High'].map((n, i) => `<option value="${i}" ${(s.gore ?? 2) === i ? 'selected' : ''}>${n}</option>`).join('')}</select><span></span>
          <span>Blood on lens</span><input type="checkbox" data-c="lensBlood" ${s.lensBlood !== false ? 'checked' : ''}><span></span>
        </div>
        <div style="margin-top:10px;text-align:right"><button class="btn red" data-a="back">Done</button></div>
      </div>`);
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      s[inp.dataset.k] = parseFloat(inp.value);
      el.querySelector(`[data-v=${inp.dataset.k}]`).textContent = inp.value;
      g.saveSettings();
    }));
    el.querySelectorAll('input[type=checkbox]').forEach((inp) => inp.addEventListener('change', () => { s[inp.dataset.c] = inp.checked; g.saveSettings(); }));
    el.querySelectorAll('select[data-s]').forEach((sel) => sel.addEventListener('change', () => { s[sel.dataset.s] = parseInt(sel.value, 10); g.saveSettings(); if (s.gore === 0) g.lens?.clear(); }));
    el.querySelector('[data-a=back]').onclick = back;
  }

  showHelp(back) {
    const el = this.open(`
      <div class="panel" style="width:min(640px,100%)">
        <h2>CONTROLS</h2>
        <div class="help-keys">
          <div><b>WASD</b> move · <b>Mouse</b> look</div>
          <div><b>Left click</b> fire · <b>Right click / Shift</b> dash</div>
          <div><b>Space</b> jump (again in mid-air with multi-jump rings)</div>
          <div><b>1-4</b> / <b>wheel</b> switch weapon · <b>Q</b> last weapon</div>
          <div><b>E</b> talk / open / use · <b>Tab / I</b> equipment · <b>M</b> map</div>
          <div><b>Esc / P</b> pause · <b>Arrow keys</b> turn</div>
          <div style="margin-top:8px"><b>Touch:</b> left side = move stick, right side = look, FIRE also aims while held. Tap 1-4 to switch weapons, BAG for equipment, MAP for the level radar.</div>
        </div>
        <p style="font-size:17px;color:#bba">Kill every enemy and the boss on each level to open the portal. Keys open matching coloured doors. Dying ends the run: you keep your level, gear and bag, but start again at depth 1.</p>
        <div style="text-align:right"><button class="btn red" data-a="back">Back</button></div>
      </div>`);
    el.querySelector('[data-a=back]').onclick = back;
  }

  showDeath({ depth, level }) {
    const g = this.game;
    const el = this.open(`
      <div class="death-title">YOU DIED</div>
      <div class="tagline">REACHED DEPTH ${depth} · LEVEL ${level}</div>
      <p style="text-align:center;max-width:480px">Your gear, bag and experience are safe aboard AEGIS-9. The descent starts over from depth 1.</p>
      <div class="menu" style="display:flex;gap:10px"><button class="btn red" data-a="respawn">Respawn at the Station</button></div>`, 'screen dim');
    el.querySelector('[data-a=respawn]').onclick = async () => { this.close(); g.state = 'loading'; await g.enterHub('You wake up in the med-bay. The run is over.'); if (input.mode === 'keyboard') requestLock(); };
  }

  // ------------------------------------------------------------------ teleporter / portal
  openTeleporter() {
    const g = this.game;
    this.setMenuState();
    const run = g.save.run;
    const el = this.open(`
      <div class="panel" style="width:min(460px,100%);text-align:center">
        <h2>TELEPORTER</h2>
        <p style="font-size:19px">Coordinates locked on the possessed surface of what was once Earth.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${run.active ? `<button class="btn red" data-a="cont">Continue Run · Depth ${run.depth + 1}</button>` : ''}
          <button class="btn ${run.active ? '' : 'red'}" data-a="new">${run.active ? 'Start Over at Depth 1' : 'Begin Descent · Depth 1'}</button>
          <button class="btn" data-a="x">Not yet</button>
        </div>
      </div>`);
    el.querySelector('[data-a=cont]')?.addEventListener('click', () => { this.closeAll(); g.startRunFromHub(true); });
    el.querySelector('[data-a=new]').onclick = () => { this.closeAll(); g.startRunFromHub(false); };
    el.querySelector('[data-a=x]').onclick = () => this.closeAll();
  }

  openPortal() {
    const g = this.game;
    this.setMenuState();
    const el = this.open(`
      <div class="panel" style="width:min(480px,100%);text-align:center">
        <div class="portal-title">THE PORTAL HUMS</div>
        <p style="font-size:19px">Depth ${g.save.run.depth} is cleansed. Where to?</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn red" data-a="next">Descend to Depth ${g.save.run.depth + 1}</button>
          <button class="btn" data-a="home">Return to the Space Station</button>
          <button class="btn" data-a="x">Stay (collect loot first)</button>
        </div>
      </div>`);
    el.querySelector('[data-a=next]').onclick = () => { this.closeAll(); g.portalNext(); };
    el.querySelector('[data-a=home]').onclick = () => { this.closeAll(); g.portalHome(); };
    el.querySelector('[data-a=x]').onclick = () => this.closeAll();
  }

  // ------------------------------------------------------------------ items
  iconHTML(item, box = 44) {
    const c = this.game.content.itemIconCSS(item, box);
    return `<div class="icon" style="background-image:url(${c.url});background-size:${c.bgW}px ${c.bgH}px;background-position:${(box - c.w) / 2 + c.x}px ${(box - c.h) / 2 + c.y}px"></div>`;
  }
  slotHTML(item, attrs = '', label = '') {
    if (!item) return `<div class="slot empty" data-label="${label}" ${attrs}></div>`;
    return `<div class="slot r-${item.rarity}" ${attrs} title="${esc(item.name)}">${this.iconHTML(item)}<span class="lvl">${item.level}</span>${item.upgrade ? `<span class="upg">+${item.upgrade}</span>` : ''}</div>`;
  }
  cardHTML(item, compareTo, extra = '') {
    if (!item) return '<div class="card"><div class="sub">Select an item to see its stats.</div></div>';
    const lines = describeItem(item).map((l) => `<li class="${l.cls}" ${l.color ? `style="color:${l.color}"` : ''}>${esc(l.text)}</li>`).join('');
    let cmp = '';
    if (compareTo && compareTo !== item) {
      const a = itemScore(item), b = itemScore(compareTo);
      const d = b ? (a - b) / b : 1;
      cmp = `<div class="cmp">vs equipped ${esc(compareTo.name)}: <span style="color:${d >= 0 ? '#49e04a' : '#ff4848'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}% ${item.kind === 'weapon' ? 'DPS' : 'rating'}</span></div>`;
    }
    return `<div class="card">
      <div class="name rarity-${item.rarity}">${esc(item.name)}</div>
      <div class="sub">${RARITY[item.rarity].name} ${kindLabel(item)} · Level ${item.level}${item.upgrade ? ` · <span style="color:#ffcc33">+${item.upgrade}</span>` : ''}</div>
      ${item.subname ? `<div class="sub">"${esc(item.subname)}"</div>` : ''}
      <ul>${lines}</ul>${cmp}
      <div class="sub">Sell value: <span style="color:#ffd040">¢${fmt(sellValue(item))}</span></div>
      ${extra}
    </div>`;
  }
  equippedFor(item) {
    const e = this.game.save.equipment;
    if (item.kind === 'weapon') return e['weapon' + this.game.player.weaponIndex] || e.weapon0;
    if (item.kind === 'ring') return e.ring0;
    return e[item.kind];
  }

  equip(index) {
    const g = this.game, s = g.save, item = s.bag[index];
    if (!item) return;
    let slot;
    if (item.kind === 'weapon') {
      slot = ['weapon0', 'weapon1', 'weapon2', 'weapon3'].find((k) => !s.equipment[k]) || 'weapon' + g.player.weaponIndex;
    } else if (item.kind === 'ring') {
      slot = ['ring0', 'ring1', 'ring2', 'ring3'].find((k) => !s.equipment[k]) || 'ring0';
    } else slot = item.kind;
    const old = s.equipment[slot];
    s.equipment[slot] = item;
    s.bag.splice(index, 1);
    if (old) s.bag.splice(index, 0, old);
    g.player.recalc();
    g.persist();
    audio.play('pickup_item', { pitch: 0.8 });
    return slot;
  }
  unequip(slot) {
    const g = this.game, s = g.save;
    const it = s.equipment[slot];
    if (!it) return false;
    if (s.bag.length >= s.bagSize) { this.toast('Bag is full', '#ff6060'); audio.play('ui_error'); return false; }
    if (slot.startsWith('weapon') && Object.keys(s.equipment).filter((k) => k.startsWith('weapon') && s.equipment[k]).length <= 1) {
      this.toast('Keep at least one weapon equipped', '#ff6060'); return false;
    }
    s.equipment[slot] = null;
    s.bag.push(it);
    g.player.recalc();
    if (slot === 'weapon' + g.player.weaponIndex) g.player.cycleWeapon(1);
    g.persist();
    return true;
  }

  // ------------------------------------------------------------------ inventory
  openInventory(mode = 'inventory', npc = null, view = null) {
    this.setMenuState();
    this.invMode = mode;
    this.npc = npc;
    if (view) this.invView = view;
    this.selected = this.selected && this.lookup(this.selected) ? this.selected : null;
    this.renderInventory();
  }
  // M key / touch MAP button: open the equipment screen on its MAP tab, flip
  // an open equipment screen to it, or close it when the map is already up
  toggleMap() {
    const g = this.game;
    if (g.state === 'playing') { this.openInventory('inventory', null, 'map'); return; }
    if (g.state !== 'menu' || this.invMode !== 'inventory' || !this.layer?.classList.contains('inv')) return;
    if (this.invView === 'map') this.closeAll();
    else { this.invView = 'map'; this.renderInventory(); }
  }
  viewTabsHTML(cur) {
    const kb = input.mode === 'keyboard';
    return `<div class="views">
      <button class="view ${cur === 'gear' ? 'on' : ''}" data-view="gear">EQUIPMENT${kb ? '<kbd>I</kbd>' : ''}</button>
      <button class="view ${cur === 'map' ? 'on' : ''}" data-view="map">MAP${kb ? '<kbd>M</kbd>' : ''}</button></div>`;
  }
  bindViewTabs(el) {
    el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.view === this.invView) return;
      this.invView = b.dataset.view;
      this.renderInventory();
    }));
  }

  // MAP tab: level map + radar (src/ui/map.js). Re-rendering or closing goes
  // through this.open()/close(), which unmounts the map and stops its loop.
  renderMap() {
    const g = this.game, s = g.save;
    const el = this.open(`
      <div class="panel modal">
        <button class="btn small close-x" data-act="close">X</button>
        <div class="modal-head">
          ${this.viewTabsHTML('map')}
          <div class="wallet">¢ ${fmt(s.credits)}<span class="bag">BAG ${s.bag.length}/${s.bagSize}</span></div>
        </div>
        <div class="modal-body map-body">
          <div class="map-wrap">
            <canvas class="map-canvas"></canvas>
            <div class="map-ctl">
              <button class="btn small" data-zoom="1" aria-label="Zoom in">+</button><span class="map-zoom">x1</span><button class="btn small" data-zoom="-1" aria-label="Zoom out">-</button>
              <button class="btn small" data-center aria-label="Centre on me"><i class="ctr-ic"></i></button>
            </div>
          </div>
          <div class="col scroll map-side"></div>
        </div>
      </div>`, 'screen dim inv');
    this.bindViewTabs(el);
    el.querySelector('[data-act=close]').addEventListener('click', () => this.closeAll());
    this.levelMap = new LevelMap(g);
    this.levelMap.mount(el.querySelector('.map-wrap'), el.querySelector('.map-side'));
  }

  lookup(sel) {
    const s = this.game.save;
    if (!sel) return null;
    if (sel.where === 'bag') return s.bag[sel.i] || null;
    if (sel.where === 'eq') return s.equipment[sel.slot] || null;
    if (sel.where === 'shop') return s.shop?.items[sel.i] || null;
    return null;
  }

  renderInventory() {
    const g = this.game, s = g.save, eq = s.equipment;
    const mode = this.invMode;
    if (mode === 'inventory' && this.invView === 'map' && g.world) { this.renderMap(); return; }
    const sel = this.lookup(this.selected);
    const tab = this.tab || 'all';
    const filter = (it) => tab === 'all' || (tab === 'armor' ? ['head', 'body', 'legs'].includes(it.kind) : it.kind === tab);
    const sorted = s.bag.map((it, i) => ({ it, i })).filter(({ it }) => filter(it));
    const doll = `
      <div class="equip-doll">
        <div class="lbl">WEAPONS (1-4)</div>
        ${['weapon0', 'weapon1', 'weapon2', 'weapon3'].map((k) => this.slotHTML(eq[k], `data-eq="${k}"`, SLOT_LABELS[k])).join('')}
        <div class="lbl">ARMOR</div>
        ${['head', 'body', 'legs'].map((k) => this.slotHTML(eq[k], `data-eq="${k}"`, SLOT_LABELS[k])).join('')}<div></div>
        <div class="lbl">RINGS</div>
        ${['ring0', 'ring1', 'ring2', 'ring3'].map((k) => this.slotHTML(eq[k], `data-eq="${k}"`, SLOT_LABELS[k])).join('')}
      </div>`;
    const st = g.player.stats;
    const statsBox = `<table class="stats-table">
      <tr><td>Max health</td><td>${fmt(st.maxHp)}</td></tr><tr><td>Armor</td><td>${fmt(st.armor)}</td></tr>
      <tr><td>Attack</td><td>+${fmt(st.attack)}</td></tr><tr><td>Damage</td><td>+${Math.round(st.dmgPct * 100)}%</td></tr>
      <tr><td>Crit</td><td>${Math.round(st.critChance * 100)}% / x${st.critMult.toFixed(2)}</td></tr>
      <tr><td>Move speed</td><td>${Math.round(st.moveSpeed * 100)}%</td></tr><tr><td>Dashes</td><td>${st.dashes}</td></tr>
      <tr><td>Air jumps</td><td>${st.airJumps}</td></tr><tr><td>Fire rate</td><td>+${Math.round((st.fireRate - 1) * 100)}%</td></tr>
      ${Object.keys(st.abilities).length ? `<tr><td colspan="2" style="color:#ffcf6a;text-align:left">${Object.keys(st.abilities).length} active abilities</td></tr>` : ''}
    </table>`;
    let actions = '';
    if (sel) {
      const inBag = this.selected.where === 'bag';
      const inShop = this.selected.where === 'shop';
      if (inBag) actions += '<button class="btn small red" data-act="equip">Equip</button>';
      if (this.selected.where === 'eq') actions += '<button class="btn small" data-act="unequip">Unequip</button>';
      if (mode === 'shop' && !inShop) actions += `<button class="btn small gold" data-act="sell">Sell ¢${fmt(sellValue(sel))}</button>`;
      if (inShop) actions += `<button class="btn small gold" data-act="buy" ${s.credits < buyValue(sel) ? 'disabled' : ''}>Buy ¢${fmt(buyValue(sel))}</button>`;
      if (mode === 'upgrade' && !inShop && this.npc.kinds.includes(sel.kind)) actions += '<button class="btn small gold" data-act="upgrade">Upgrade</button>';
      if (inBag && mode !== 'shop') actions += '<button class="btn small" data-act="discard">Discard</button>';
    }
    let upgradeInfo = '';
    if (mode === 'upgrade' && sel && this.selected.where !== 'shop' && this.npc.kinds.includes(sel.kind)) upgradeInfo = this.upgradeInfoHTML(sel);
    const card = this.cardHTML(sel, sel && this.selected.where !== 'eq' ? this.equippedFor(sel) : null, upgradeInfo + `<div class="actions">${actions}</div>`);
    const npcHead = this.npc ? this.npcHeadHTML(this.npc) : '';
    let shopCol = '';
    if (mode === 'shop') {
      const items = s.shop?.items || [];
      shopCol = `<div class="col" style="flex:1.1"><h3>FOR SALE</h3><div class="grid-bag scroll" style="flex:1">${items.map((it, i) => this.slotHTML(it, `data-shop="${i}"`)).join('')}</div>
        <button class="btn small" data-act="sellall" style="margin-top:6px">Sell all commons in bag</button></div>`;
    }
    const tabs = ['all', 'weapon', 'armor', 'ring'].map((t) => `<div class="tab ${tab === t ? 'on' : ''}" data-tab="${t}">${t.toUpperCase()}</div>`).join('');
    const el = this.open(`
      <div class="panel modal">
        <button class="btn small close-x" data-act="close">X</button>
        <div class="modal-head">
          ${mode === 'inventory' ? this.viewTabsHTML('gear') : `<h2>${esc(this.npc.title.toUpperCase())}</h2>`}
          <div class="tabs">${tabs}</div>
          <div class="wallet">¢ ${fmt(s.credits)}<span class="bag">BAG ${s.bag.length}/${s.bagSize}</span></div>
        </div>
        <div class="modal-body">
          ${mode === 'inventory' ? `<div class="col scroll" style="flex:0 0 auto;gap:6px">${doll}${statsBox}</div>` : `<div class="col scroll" style="flex:0 0 auto;gap:6px;max-width:250px">${npcHead}${doll}</div>`}
          ${shopCol}
          <div class="col" style="flex:1.2"><h3>BAG</h3><div class="grid-bag scroll" style="flex:1">${sorted.map(({ it, i }) => this.slotHTML(it, `data-bag="${i}"`)).join('')}${Array.from({ length: Math.max(0, Math.min(12, s.bagSize - s.bag.length)) }, () => '<div class="slot empty" data-label=""></div>').join('')}</div></div>
          <div class="col scroll" style="flex:1.3">${card}${mode === 'inventory' ? this.reagentsHTML() : ''}</div>
        </div>
      </div>`, 'screen dim inv');
    this.bindViewTabs(el);
    // fix class attr duplication from slotHTML (attrs may include class)
    el.querySelectorAll('[data-eq],[data-bag],[data-shop]').forEach((n) => {
      const isSel = (n.dataset.eq && this.selected?.where === 'eq' && this.selected.slot === n.dataset.eq) ||
        (n.dataset.bag && this.selected?.where === 'bag' && this.selected.i === +n.dataset.bag) ||
        (n.dataset.shop && this.selected?.where === 'shop' && this.selected.i === +n.dataset.shop);
      if (isSel) n.classList.add('sel');
      n.addEventListener('click', () => {
        if (n.dataset.eq) this.selected = { where: 'eq', slot: n.dataset.eq };
        if (n.dataset.bag) this.selected = { where: 'bag', i: +n.dataset.bag };
        if (n.dataset.shop) this.selected = { where: 'shop', i: +n.dataset.shop };
        this.renderInventory();
      });
      n.addEventListener('dblclick', () => { if (n.dataset.bag) { this.equip(+n.dataset.bag); this.selected = null; this.renderInventory(); } });
    });
    el.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => { this.tab = t.dataset.tab; this.renderInventory(); }));
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.invAction(b.dataset.act)));
  }

  invAction(act) {
    const g = this.game, s = g.save;
    const sel = this.lookup(this.selected);
    switch (act) {
      case 'close': this.closeAll(); return;
      case 'equip': this.equip(this.selected.i); this.selected = null; break;
      case 'unequip': if (this.unequip(this.selected.slot)) this.selected = null; break;
      case 'discard':
        if (sel && (RARITY[sel.rarity].index < 2 || confirm(`Discard ${sel.name}?`))) { s.bag.splice(this.selected.i, 1); this.selected = null; }
        break;
      case 'sell': {
        if (!sel) break;
        if (RARITY[sel.rarity].index >= 3 && !confirm(`Sell ${sel.name}?`)) break;
        s.credits += sellValue(sel);
        if (this.selected.where === 'bag') s.bag.splice(this.selected.i, 1);
        else { s.equipment[this.selected.slot] = null; g.player.recalc(); }
        audio.play('ui_buy');
        this.selected = null;
        break;
      }
      case 'sellall': {
        let total = 0;
        s.bag = s.bag.filter((it) => { if (it.rarity === 'common') { total += sellValue(it); return false; } return true; });
        s.credits += total;
        if (total) { audio.play('ui_buy'); this.toast(`Sold commons for ¢${fmt(total)}`, '#ffd040'); }
        this.selected = null;
        break;
      }
      case 'buy': {
        const price = buyValue(sel);
        if (s.credits < price) { audio.play('ui_error'); break; }
        if (s.bag.length >= s.bagSize) { this.toast('Bag is full', '#ff6060'); audio.play('ui_error'); break; }
        s.credits -= price;
        s.bag.push(sel);
        s.shop.items.splice(this.selected.i, 1);
        audio.play('ui_buy');
        this.selected = { where: 'bag', i: s.bag.length - 1 };
        break;
      }
      case 'upgrade': this.doUpgrade(sel); break;
    }
    g.persist();
    this.renderInventory();
  }

  reagentsHTML() {
    const s = this.game.save;
    const ids = Object.keys(REAGENTS).filter((id) => s.reagents[id]);
    if (!ids.length) return '<div class="card" style="margin-top:6px"><div class="sub">No reagents yet. Monsters, bosses and chests drop them.</div></div>';
    return `<div class="card" style="margin-top:6px"><div class="sub">REAGENTS</div><div class="cost">${ids.map((id) => this.reagentChip(id, s.reagents[id])).join('')}</div></div>`;
  }
  reagentChip(id, n, need) {
    const r = REAGENTS[id], ic = this.game.content.reagentIcon(id);
    const cls = need === undefined ? '' : (this.game.save.reagents[id] || 0) >= need ? 'have' : 'need';
    return `<span class="reagent-chip ${cls}" title="${esc(r.name + ' - ' + r.desc)}"><i style="background-image:url(${ic.url})"></i>${need === undefined ? n : `${this.game.save.reagents[id] || 0}/${need}`} ${esc(r.name)}</span>`;
  }
  costHTML(cost) {
    const s = this.game.save;
    return `<div class="cost"><span class="${s.credits >= cost.credits ? 'have' : 'need'}">¢${fmt(cost.credits)}</span>${Object.entries(cost.reagents).map(([id, n]) => this.reagentChip(id, 0, n)).join('')}</div>`;
  }
  canAfford(cost) {
    const s = this.game.save;
    if (s.credits < cost.credits) return false;
    return Object.entries(cost.reagents).every(([id, n]) => (s.reagents[id] || 0) >= n);
  }
  pay(cost) {
    const s = this.game.save;
    s.credits -= cost.credits;
    for (const [id, n] of Object.entries(cost.reagents)) s.reagents[id] -= n;
  }

  upgradeInfoHTML(item) {
    const max = maxUpgrade(item);
    if (item.upgrade >= max) return `<div class="sub" style="color:#ffcc33">Fully upgraded (+${max}).</div>`;
    const cost = B.upgradeCost(item, item.upgrade + 1, this.npc.recipe, RARITY[item.rarity].index);
    return `<div class="sub">Upgrade to <span style="color:#ffcc33">+${item.upgrade + 1}</span> / +${max}: +8% power and stronger rolls</div>${this.costHTML(cost)}`;
  }
  doUpgrade(item) {
    if (!item) return;
    if (item.upgrade >= maxUpgrade(item)) return;
    const cost = B.upgradeCost(item, item.upgrade + 1, this.npc.recipe, RARITY[item.rarity].index);
    if (!this.canAfford(cost)) { audio.play('ui_error'); this.toast('Not enough credits or reagents', '#ff6060'); return; }
    this.pay(cost);
    item.upgrade++;
    this.game.player.recalc();
    audio.play('upgrade');
    this.toast(`${item.name} is now +${item.upgrade}`, '#ffcc33');
  }

  // ------------------------------------------------------------------ NPCs
  npcHeadHTML(npc) {
    const p = this.game.content.npcPortraitCSS(npc);
    let portrait = '<div class="npc-portrait"></div>';
    if (p) {
      const scale = 64 / Math.max(p.frameW, p.frameH) * 1.25;
      const pal = npc.palette || {};
      const hue = pal.tint ? (pal.tint[0] > pal.tint[2] ? (pal.tint[1] > 1 ? 10 : -20) : pal.tint[1] > pal.tint[0] ? 80 : 200) : 0;
      portrait = `<div class="npc-portrait" style="background-image:url(${p.url});background-size:${p.frameW * p.cols * scale}px ${p.frameH * p.rows * scale}px;background-position:${(64 - p.frameW * scale) / 2}px ${64 - p.frameH * scale}px;filter:hue-rotate(${hue}deg) saturate(1.4)"></div>`;
    }
    const line = npc.lines[Math.floor(Math.random() * npc.lines.length)];
    return `<div style="display:flex;gap:8px;align-items:center">${portrait}<div><div class="name" style="font-family:PressStart;font-size:11px;color:#ffe9a0">${esc(npc.name)}</div><div class="npc-line">"${esc(line)}"</div></div></div>`;
  }

  openNPC(npc) {
    const g = this.game;
    audio.play('robot_alert', { pitch: 1.3, volume: 0.5 });
    if (npc.role === 'shop') { this.ensureShop(); this.selected = null; this.openInventory('shop', npc); }
    else if (npc.role === 'upgrade') { this.selected = null; this.openInventory('upgrade', npc); }
    else if (npc.role === 'bag') this.openBagNPC(npc);
    void g;
  }

  ensureShop() {
    const g = this.game, s = g.save;
    if (s.shop && s.shop.visit === s.stats.runs + '_' + s.run.depth + '_' + s.level) return;
    const rng = new Rng(Date.now());
    const items = [];
    for (let k = 0; k < 14; k++) {
      const rarity = rng.weighted([{ r: 'uncommon', w: 60 }, { r: 'rare', w: 30 }, { r: 'epic', w: 10 }], (x) => x.w).r;
      items.push(generateItem(rng, { level: rollItemLevel(rng, s.level), rarity, bases: g.content.weaponBases, depth: s.best.depth + 1 }));
    }
    s.shop = { items, visit: s.stats.runs + '_' + s.run.depth + '_' + s.level };
  }

  openBagNPC(npc) {
    const g = this.game, s = g.save;
    this.setMenuState();
    const k = s.bagUpgrades + 1;
    const maxed = s.bagSize >= B.BAG_MAX;
    const cost = maxed ? null : B.bagUpgradeCost(k);
    const el = this.open(`
      <div class="panel" style="width:min(520px,100%)">
        <button class="btn small close-x" data-a="x">X</button>
        ${this.npcHeadHTML(npc)}
        <div class="card" style="margin-top:8px">
          <div class="name">Dimensional Pockets</div>
          <div class="sub">Bag capacity: <span class="big">${s.bagSize}</span> / ${B.BAG_MAX}</div>
          ${maxed ? '<div class="sub" style="color:#ffcc33">Your bag is at maximum capacity.</div>' : `<div class="sub">Next expansion: +${B.BAG_STEP} slots</div>${this.costHTML(cost)}
          <div class="actions"><button class="btn gold" data-a="buy" ${this.canAfford(cost) ? '' : 'disabled'}>Expand Bag</button></div>`}
        </div>
        ${this.reagentsHTML()}
      </div>`);
    el.querySelector('[data-a=x]').onclick = () => this.closeAll();
    el.querySelector('[data-a=buy]')?.addEventListener('click', () => {
      if (!this.canAfford(cost)) return;
      this.pay(cost);
      s.bagUpgrades++;
      s.bagSize = Math.min(B.BAG_MAX, s.bagSize + B.BAG_STEP);
      audio.play('upgrade');
      this.toast(`Bag expanded to ${s.bagSize} slots`, '#9fffb0');
      g.persist();
      this.openBagNPC(npc);
    });
  }
}

export { NPCS, RARITIES };
