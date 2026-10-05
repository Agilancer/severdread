// 2D HUD canvas drawn over the 3D view.
import { RARITY } from '../data/rarities.js';
import { ELEMENTS } from '../data/elements.js';
import { KEY_HEX } from '../game/levelgen/common.js';
import { xpToNext, MAX_LEVEL } from '../data/balance.js';
import { fmt, clamp } from '../core/math.js';
import { input } from '../engine/input.js';

const FONT_BIG = 'PressStart, monospace';
const FONT = 'Silkscreen, monospace';

export class HUD {
  constructor(canvas, content) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.content = content;
    this.iconCache = new Map();
    this.drips = [];
    this.bloodRain = [];
  }

  resize(w, h, dpr) {
    this.dpr = dpr;
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.w = w; this.h = h;
    this.s = clamp(Math.min(w / 640, h / 360), 0.75, 2.2);
  }

  weaponIcon(item) {
    const key = item.base;
    let e = this.iconCache.get(key);
    if (e) return e;
    const b = this.content.baseById.get(item.base);
    if (b?.real) {
      const h = this.content.store.fromURL(b.set.iconFile);
      e = { handle: h, sx: 0, sy: b.row * b.set.iconH, sw: b.set.iconW, sh: b.set.iconH };
    } else {
      const css = this.content.itemIconCSS(item);
      e = { canvas: css.canvas, sx: 0, sy: 0, sw: css.canvas.width, sh: css.canvas.height };
    }
    this.iconCache.set(key, e);
    return e;
  }

  draw(game, dt) {
    const g = this.g, s = this.s;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!game.world || game.state === 'title' || game.state === 'loading') return;
    const p = game.player;
    g.imageSmoothingEnabled = false;
    const touch = input.mode === 'touch';
    const pad = 10 * s;
    const safeL = 12, safeR = 12;

    // ---------------- health + xp bars (top-left)
    const bx = pad + safeL, by = pad;
    const bw = 190 * s, bh = 13 * s;
    this.bar(bx, by, bw, bh, p.hp / p.maxHp, '#b50d14', '#ff3b3b', `${Math.ceil(p.hp)} / ${p.maxHp}`);
    if (p.shield > 0) this.bar(bx, by + bh + 2 * s, bw * clamp(p.shield / p.maxHp, 0, 1), 4 * s, 1, '#7fd0ff', '#c0ecff');
    const sv = game.save;
    const need = sv.level >= MAX_LEVEL ? 1 : xpToNext(sv.level);
    const xy = by + bh + 7 * s;
    this.bar(bx, xy, bw, 7 * s, sv.level >= MAX_LEVEL ? 1 : sv.xp / need, '#5a2a8a', '#b26bff', null);
    this.text(`LV ${sv.level}`, bx, xy + 10 * s, '#ffffff', 9 * s, FONT_BIG);
    this.text(sv.level >= MAX_LEVEL ? 'MAX LEVEL' : `${fmt(sv.xp)} / ${fmt(need)} XP`, bx + 44 * s + String(sv.level).length * 8 * s, xy + 10.5 * s, '#c9b3ff', 7.5 * s);
    // armor / credits / dashes
    let iy = xy + 23 * s;
    this.text(`ARMOR ${fmt(p.stats.armor + p.tempArmor)}${p.tempArmor ? ' (+' + p.tempArmor + ')' : ''}`, bx, iy, '#9cc7ff', 8 * s);
    this.text(`¢ ${fmt(sv.credits)}`, bx + 100 * s, iy, '#ffd040', 8 * s);
    iy += 11 * s;
    for (let i = 0; i < p.stats.dashes; i++) {
      const full = i < p.dashCharges;
      g.fillStyle = full ? '#6ff0ff' : '#1a3a44';
      g.fillRect(bx + i * 11 * s, iy, 9 * s, 4 * s);
      if (!full && i === p.dashCharges) { g.fillStyle = '#6ff0ff'; g.fillRect(bx + i * 11 * s, iy, 9 * s * clamp(p.dashRecharge / p.stats.dashRecharge, 0, 1), 4 * s); }
    }
    // keys
    let kx = bx + p.stats.dashes * 11 * s + 8 * s;
    for (const k of p.keys) {
      g.fillStyle = KEY_HEX[k]; g.fillRect(kx, iy - 3 * s, 12 * s, 9 * s);
      g.fillStyle = '#e0c060'; g.fillRect(kx + 2 * s, iy - 1 * s, 3 * s, 5 * s);
      kx += 15 * s;
    }

    // ---------------- enemy ticker (top centre)
    if (!game.inHub) {
      const left = game.killsLeft;
      const txt = left > 0 ? `ENEMIES LEFT: ${left}` : 'PORTAL OPEN';
      g.font = `${10 * s}px ${FONT_BIG}`;
      const tw = g.measureText(txt).width;
      const tx = this.w / 2 - tw / 2;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(tx - 8 * s, pad - 3 * s, tw + 16 * s, 17 * s);
      g.strokeStyle = left > 0 ? '#7a1418' : '#8a5ae0'; g.lineWidth = 2; g.strokeRect(tx - 8 * s, pad - 3 * s, tw + 16 * s, 17 * s);
      this.text(txt, tx, pad + 1 * s, left > 0 ? '#ff4a4a' : '#d4b8ff', 10 * s, FONT_BIG);
      this.text(`DEPTH ${game.save.run.depth} · ${game.world.theme.name.toUpperCase()}`, this.w / 2, pad + 18 * s, '#bba', 7 * s, FONT, 'center');
      // boss bar
      const boss = game.boss;
      if (boss && boss.awake && !boss.dead) {
        const w2 = Math.min(this.w * 0.5, 320 * s), x2 = this.w / 2 - w2 / 2, y2 = pad + 30 * s;
        this.bar(x2, y2, w2, 9 * s, boss.hp / boss.maxHp, '#6a0a0a', '#ff2020', null);
        this.text(boss.name.toUpperCase(), this.w / 2, y2 + 11 * s, '#ff8080', 8 * s, FONT_BIG, 'center');
      }
    } else {
      this.text('ORBITAL STATION AEGIS-9', this.w / 2, pad, '#9fd8ff', 9 * s, FONT_BIG, 'center');
      if (game.save.run.active) this.text(`RUN IN PROGRESS · NEXT DEPTH ${game.save.run.depth + 1}`, this.w / 2, pad + 14 * s, '#ffcc66', 7 * s, FONT, 'center');
      else if (!game.save.stats.runs) this.warpHint(game, s, pad, touch);
    }

    // ---------------- weapon slots (bottom-left, small rectangles 1-4)
    const ws = p.weapons();
    const sw = 50 * s, shh = 30 * s, gap = 5 * s;
    const sx0 = touch ? this.w / 2 - (sw * 4 + gap * 3) / 2 : pad + safeL;
    const sy0 = this.h - shh - pad - (touch ? 4 * s : 0);
    this.slotRects = [0, 1, 2, 3].map((i) => ({ x: sx0 + i * (sw + gap), y: sy0, w: sw, h: shh }));
    for (let i = 0; i < 4; i++) {
      const x = sx0 + i * (sw + gap), it = ws[i], sel = i === p.weaponIndex;
      g.fillStyle = sel ? 'rgba(60,10,14,.8)' : 'rgba(0,0,0,.55)';
      g.fillRect(x, sy0, sw, shh);
      const rc = it ? RARITY[it.rarity].color : '#333';
      g.strokeStyle = it && it.rarity === 'legendary' ? (Math.sin(game.time * 4) > 0 ? '#ffd000' : '#ff8000') : sel ? '#ff4040' : rc;
      g.lineWidth = sel ? 2.5 : 1.5;
      g.strokeRect(x + 0.5, sy0 + 0.5, sw - 1, shh - 1);
      if (it) {
        const ic = this.weaponIcon(it);
        const img = ic.canvas || (ic.handle.ready ? ic.handle.image : null);
        if (img) {
          const sc = Math.min((sw - 6 * s) / ic.sw, (shh - 6 * s) / ic.sh);
          const dw = ic.sw * sc, dh = ic.sh * sc;
          g.drawImage(img, ic.sx, ic.sy, ic.sw, ic.sh, x + (sw - dw) / 2, sy0 + (shh - dh) / 2, dw, dh);
        }
        if (it.element !== 'physical') { g.fillStyle = ELEMENTS[it.element].color; g.fillRect(x + sw - 6 * s, sy0 + 2 * s, 4 * s, 4 * s); }
      }
      this.text(String(i + 1), x + 3 * s, sy0 + 2 * s, sel ? '#ffdd55' : '#aaa', 8 * s, FONT_BIG);
    }
    const cw = p.currentWeapon();
    if (cw && !game.inHub) this.text(cw.name, sx0, sy0 - 11 * s, RARITY[cw.rarity].color, 8 * s, FONT);

    // ---------------- crosshair
    if (!game.inHub && !p.dead) {
      const cx = this.w / 2, cy = this.h / 2;
      g.fillStyle = 'rgba(255,60,60,.9)';
      const k = 2 * s;
      g.fillRect(cx - k / 2, cy - 6 * s, k, 3.5 * s); g.fillRect(cx - k / 2, cy + 2.5 * s, k, 3.5 * s);
      g.fillRect(cx - 6 * s, cy - k / 2, 3.5 * s, k); g.fillRect(cx + 2.5 * s, cy - k / 2, 3.5 * s, k);
    }

    // ---------------- damage numbers
    for (const d of game.damageNumbers) {
      const pr = game.renderer.project(d.x, d.y + d.t * 0.8, d.z);
      if (!pr) continue;
      const a = 1 - d.t / 0.9;
      const size = (d.crit ? 11 : 8) * s * clamp(6 / pr.w, 0.6, 1.4);
      g.globalAlpha = a;
      this.text(fmt(d.n), pr.x * this.w, pr.y * this.h, d.color || '#fff', size, d.crit ? FONT_BIG : FONT, 'center');
      g.globalAlpha = 1;
    }

    // ---------------- interaction prompt / NPC names
    if (game.prompt && !touch) {
      g.font = `${9 * s}px ${FONT}`;
      const t = game.prompt.text, tw = g.measureText(t).width;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(this.w / 2 - tw / 2 - 8 * s, this.h * 0.68, tw + 16 * s, 16 * s);
      this.text(t, this.w / 2, this.h * 0.68 + 3.5 * s, '#fff', 9 * s, FONT, 'center');
    } else if (game.prompt && touch) {
      this.text(game.prompt.text.replace('[E] ', ''), this.w / 2, this.h * 0.68, '#fff', 9 * s, FONT, 'center');
    }
    if (game.inHub) {
      for (const n of game.world.npcs) {
        const fy = game.world.floorAt(n.x, n.z) ?? 0;
        const pr = game.renderer.project(n.x, fy + 1.35, n.z);
        if (!pr || pr.w > 14) continue;
        if (!game.world.los(p.x, p.y + 1.4, p.z, n.x, fy + 1.0, n.z)) continue;
        this.text(n.name, pr.x * this.w, pr.y * this.h - 10 * s, '#ffe9a0', 8 * s, FONT_BIG, 'center');
        this.text(n.title, pr.x * this.w, pr.y * this.h, '#9fd8ff', 7 * s, FONT, 'center');
      }
    }

    // ---------------- level up celebration
    if (game.levelUpT > 0) this.drawLevelUp(game, dt);
    else { this.drips.length = 0; this.bloodRain.length = 0; }
    if (p.dead) {
      g.fillStyle = 'rgba(80,0,0,.35)'; g.fillRect(0, 0, this.w, this.h);
    }
  }

  // Until the first dive: a pulsing goal line and a marker over the warp pad.
  warpHint(game, s, pad, touch) {
    const t = performance.now() / 1000, a = 0.65 + 0.35 * Math.sin(t * 4);
    const g = this.g;
    g.globalAlpha = a;
    this.text(touch ? 'GOAL: STAND ON THE GLOWING WARP PAD AND TAP WARP TO START YOUR DIVE' : 'GOAL: STAND ON THE GLOWING WARP PAD AND PRESS [E] TO START YOUR DIVE',
      this.w / 2, pad + 14 * s, '#7fe6ff', 8 * s, FONT, 'center');
    g.globalAlpha = 1;
    const tp = game.world.level.teleporter, p = game.player;
    if (!tp || Math.hypot(p.x - tp.x, p.z - tp.z) < tp.r + 0.4) return;   // already on it: the [E] prompt shows
    const fy = game.world.floorAt(tp.x, tp.z) ?? 0;
    const pr = game.renderer.project(tp.x, fy + 2.4 + 0.15 * Math.sin(t * 3), tp.z);
    if (!pr || pr.w <= 0) return;
    const x = pr.x * this.w, y = pr.y * this.h;
    this.text('WARP', x, y - 12 * s, '#9fe8ff', 9 * s, FONT_BIG, 'center');
    g.fillStyle = '#9fe8ff';
    g.beginPath(); g.moveTo(x - 6 * s, y); g.lineTo(x + 6 * s, y); g.lineTo(x, y + 8 * s); g.closePath(); g.fill();
  }

  drawLevelUp(game, dt) {
    const g = this.g, s = this.s, t = 4.2 - game.levelUpT;
    const txt1 = "YOU'RE NOW", txt2 = `LEVEL ${game.levelUpLevel}`;
    const size1 = Math.min(30 * s, this.w / 14), size2 = Math.min(58 * s, this.w / 8.5);
    const appear = clamp(t / 0.35, 0, 1);
    const fade = clamp(game.levelUpT / 0.6, 0, 1);
    const shake = (1 - clamp(t / 0.8, 0, 1)) * 8 * s;
    const ox = (Math.random() - 0.5) * shake, oy = (Math.random() - 0.5) * shake;
    const cy = this.h * 0.36;
    g.save();
    g.globalAlpha = fade;
    // red flashing backdrop band
    const flash = 0.25 + 0.2 * Math.abs(Math.sin(t * 9));
    const grd = g.createLinearGradient(0, cy - size2 * 1.6, 0, cy + size2 * 1.8);
    grd.addColorStop(0, 'rgba(120,0,0,0)'); grd.addColorStop(0.5, `rgba(160,0,0,${flash})`); grd.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, cy - size2 * 1.6, this.w, size2 * 3.4);
    // radial burst lines
    g.translate(this.w / 2, cy + size2 * 0.3);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2 + t * 0.4;
      g.strokeStyle = `rgba(255,${30 + (i % 3) * 30},20,${0.12 + 0.08 * Math.sin(t * 6 + i)})`;
      g.lineWidth = 6 * s;
      g.beginPath(); g.moveTo(Math.cos(a) * 40 * s, Math.sin(a) * 40 * s); g.lineTo(Math.cos(a) * this.w, Math.sin(a) * this.w); g.stroke();
    }
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalAlpha = fade;
    const zoom = 1 + (1 - appear) * 1.5;
    const drawTitle = (text, y, size) => {
      g.font = `${size * zoom}px ${FONT_BIG}`;
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const x = this.w / 2 + ox;
      g.fillStyle = '#1a0000'; g.fillText(text, x + 4 * s, y + oy + 4 * s);
      g.fillStyle = '#4a0000'; g.fillText(text, x + 2 * s, y + oy + 2 * s);
      const lg = g.createLinearGradient(0, y - size, 0, y);
      lg.addColorStop(0, '#ff6a5a'); lg.addColorStop(0.45, '#e00d10'); lg.addColorStop(1, '#7a0000');
      g.fillStyle = lg; g.fillText(text, x, y + oy);
      g.lineWidth = Math.max(1, s); g.strokeStyle = '#ff9a8a'; g.strokeText(text, x, y + oy);
      return g.measureText(text).width;
    };
    drawTitle(txt1, cy, size1);
    const w2 = drawTitle(txt2, cy + size2 * 1.2, size2);
    // blood drips falling from the letters
    if (this.drips.length === 0) {
      for (let i = 0; i < 26; i++) this.drips.push({ x: (Math.random() - 0.5) * w2 * 0.95, len: 0, speed: (20 + Math.random() * 60) * s, w: (2 + Math.random() * 3) * s, delay: Math.random() * 0.8, row: Math.random() < 0.3 ? 0 : 1 });
      for (let i = 0; i < 60; i++) this.bloodRain.push({ x: Math.random() * this.w, y: -Math.random() * this.h, v: (150 + Math.random() * 250) * s, l: (6 + Math.random() * 14) * s });
    }
    for (const d of this.drips) {
      if (t < d.delay) continue;
      d.len += d.speed * dt * (d.len < 40 * s ? 1 : 0.25);
      const baseY = d.row ? cy + size2 * 1.2 + 2 * s : cy + 2 * s;
      const x = this.w / 2 + d.x * (d.row ? 1 : size1 / size2);
      g.fillStyle = '#9a0004';
      g.fillRect(x - d.w / 2, baseY, d.w, d.len);
      g.beginPath(); g.arc(x, baseY + d.len, d.w * 0.9, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,90,80,.6)'; g.fillRect(x - d.w / 2, baseY, Math.max(1, d.w * 0.3), d.len * 0.8);
    }
    g.strokeStyle = 'rgba(200,0,0,.55)'; g.lineWidth = 2 * s;
    for (const r of this.bloodRain) {
      r.y += r.v * dt;
      if (r.y > this.h) r.y -= this.h + 40;
      g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x - r.l * 0.15, r.y + r.l); g.stroke();
    }
    this.text('FULLY HEALED · STATS INCREASED', this.w / 2, cy + size2 * 1.75, '#ffd0c0', 9 * s, FONT, 'center');
    g.restore();
  }

  bar(x, y, w, h, frac, c1, c2, label) {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#1a1014'; g.fillRect(x, y, w, h);
    const fw = w * clamp(frac, 0, 1);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, c2); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.fillRect(x, y, fw, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, fw, Math.max(1, h * 0.25));
    if (label) this.text(label, x + w / 2, y + h / 2 - h * 0.38, '#fff', h * 0.75, FONT, 'center');
  }

  text(t, x, y, color, size, font = FONT, align = 'left') {
    const g = this.g;
    g.font = `${size}px ${font}`;
    g.textAlign = align; g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,.85)';
    g.fillText(t, x + Math.max(1, size * 0.1), y + Math.max(1, size * 0.1));
    g.fillStyle = color;
    g.fillText(t, x, y);
  }
}
