// On-screen touch controls for phones/tablets (landscape).
// Left half: floating move stick. Right half: drag to look. Buttons: FIRE
// (also drags to aim), JUMP, DASH, USE, weapon slots 1-4, MAP, BAG and PAUSE.
import { input, press } from '../engine/input.js';

export class TouchControls {
  constructor(root) {
    this.root = root;
    this.touches = new Map(); // id -> {role, x, y, ox, oy}
    this.visible = false;
    this.build();
    window.addEventListener('touchstart', () => this.activate(), { passive: true, capture: true });
  }

  activate() {
    if (input.mode !== 'touch') {
      input.mode = 'touch';
      input.move.x = input.move.y = 0;
    }
  }

  setVisible(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) { this.reset(); }
  }

  reset() {
    this.touches.clear();
    input.fire = false; input.jumpHeld = false; input.move.x = 0; input.move.y = 0;
    this.base.style.display = 'none';
    for (const b of this.root.querySelectorAll('.tbtn')) b.classList.remove('down');
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="stick-zone"></div>
      <div class="look-zone"></div>
      <div class="stick-base"><div class="stick-knob"></div></div>
      <div class="tbtn fire" data-role="fire">FIRE</div>
      <div class="tbtn jump" data-role="jump">JUMP</div>
      <div class="tbtn dash" data-role="dash">DASH</div>
      <div class="tbtn use hide" data-role="use">USE</div>
      <div class="wslots">${[1, 2, 3, 4].map((n) => `<div class="tbtn w" data-role="weapon${n - 1}">${n}</div>`).join('')}</div>
      <div class="menu-btns"><div class="tbtn" data-role="map">MAP</div><div class="tbtn" data-role="menu">BAG</div><div class="tbtn" data-role="pause">II</div></div>`;
    this.base = r.querySelector('.stick-base');
    this.knob = r.querySelector('.stick-knob');
    this.useBtn = r.querySelector('.use');
    this.wbtns = [...r.querySelectorAll('.wslots .w')];
    const opts = { passive: false };
    r.addEventListener('touchstart', (e) => this.onStart(e), opts);
    r.addEventListener('touchmove', (e) => this.onMove(e), opts);
    r.addEventListener('touchend', (e) => this.onEnd(e), opts);
    r.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
  }

  setUse(available, label) {
    this.useBtn.classList.toggle('hide', !available);
    this.useBtn.textContent = label || 'USE';
  }
  setWeapon(i) { this.wbtns.forEach((b, k) => b.classList.toggle('on', k === i)); }
  // lay the 1-4 buttons exactly over the HUD's weapon slot rectangles
  placeSlots(rects) {
    if (!rects || !this.visible) return;
    const key = rects.map((r) => `${r.x | 0},${r.y | 0},${r.w | 0}`).join(';');
    if (key === this.slotKey) return;
    this.slotKey = key;
    this.wbtns.forEach((b, k) => {
      const r = rects[k];
      Object.assign(b.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    });
  }

  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const btn = el && el.closest('.tbtn');
      let role = null;
      if (btn) {
        role = btn.dataset.role;
        btn.classList.add('down');
        if (role === 'fire') input.fire = true;
        else if (role === 'jump') { press('jump'); input.jumpHeld = true; }
        else press(role);
      } else if (el && el.classList.contains('stick-zone')) {
        role = 'stick';
        this.base.style.display = 'block';
        this.base.style.left = t.clientX + 'px';
        this.base.style.top = t.clientY + 'px';
        this.knob.style.left = '60px'; this.knob.style.top = '60px';
      } else {
        role = 'look';
      }
      this.touches.set(t.identifier, { role, btn, x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY });
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      s.x = t.clientX; s.y = t.clientY;
      if (s.role === 'stick') {
        const R = 50;
        let mx = t.clientX - s.ox, my = t.clientY - s.oy;
        const l = Math.hypot(mx, my);
        if (l > R) { mx *= R / l; my *= R / l; }
        this.knob.style.left = 60 + mx + 'px'; this.knob.style.top = 60 + my + 'px';
        const dead = 0.12;
        let nx = mx / R, ny = -my / R;
        const m = Math.hypot(nx, ny);
        if (m < dead) { nx = 0; ny = 0; }
        input.move.x = nx; input.move.y = ny;
      } else if (s.role === 'look' || s.role === 'fire') {
        const k = 0.0055 * input.settings.touchSens;
        input.lookDX += dx * k;
        input.lookDY += dy * k * (input.settings.invertY ? 1 : -1);
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = this.touches.get(t.identifier);
      if (!s) continue;
      if (s.btn) s.btn.classList.remove('down');
      if (s.role === 'fire') input.fire = [...this.touches.values()].some((o) => o !== s && o.role === 'fire');
      if (s.role === 'jump') input.jumpHeld = false;
      if (s.role === 'stick') { input.move.x = 0; input.move.y = 0; this.base.style.display = 'none'; }
      this.touches.delete(t.identifier);
    }
  }
}
