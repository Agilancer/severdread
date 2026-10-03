// Player controller: movement (run, jump, multi-jump, dash, air dash, glide,
// jet thrusters, wall jump), weapon handling and DOOM-style weapon bob.
import { input, consume } from '../engine/input.js';
import { ARCHETYPES } from '../data/weapons.js';
import { computeStats } from './stats.js';
import { firePlayerWeapon, damagePlayer, explode, damageMonster } from './combat.js';
import { F, HAZ } from './grid.js';
import { clamp, lerp, approach } from '../core/math.js';
import { fx } from '../core/rng.js';
import * as B from '../data/balance.js';

const EYE = 1.38, HEIGHT = 1.6, RADIUS = 0.3;
const GRAVITY = 24, JUMP_V = 8.2, RUN = 6.4, ACCEL = 60, AIR_ACCEL = 18, FRICTION = 12;

export class Player {
  constructor(game, save) {
    this.game = game;
    this.save = save;
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.radius = RADIUS; this.height = HEIGHT;
    this.onGround = true;
    this.airJumpsUsed = 0;
    this.dashCharges = 2; this.dashT = 0; this.dashRecharge = 0;
    this.dashDir = [0, 0];
    this.keys = new Set();
    this.dead = false;
    this.invuln = 0;
    this.hurtT = 0;
    this.shield = 0;
    this.tempArmor = 0;          // blue orb buff, until end of level
    this.weaponIndex = 0;
    this.fireCD = 0;
    this.spin = 0;               // minigun spin-up
    this.fireAnim = -1;          // first-person animation time
    this.fireAnimLen = 0.3;
    this.switchT = 0;            // weapon lower/raise
    this.shotCount = 0;
    this.lastSafe = null;
    // recent safe spots (>= 1 s apart) for respawning after falls / pits
    this.safeRing = [{ x: 0, z: 0, y: 0, valid: false }, { x: 0, z: 0, y: 0, valid: false }, { x: 0, z: 0, y: 0, valid: false }];
    this.safeRingIdx = 0; this.safeRingT = -99; this.lastRescueT = -99;
    this.hazardT = 0; this.pitT = 0; this.groundSlow = 1; this.onStair = false; this.coyote = 0;
    this.bobPhase = 0; this.bobAmt = 0;
    this.swayX = 0; this.swayY = 0;
    this.landDip = 0;
    this.camRoll = 0;
    this.stepT = 0;
    this.retaliateCD = 0; this.vengeanceT = 0; this.adrenalineT = 0; this.slowT = 0; this.burnT = 0;
    this.secondWindUsed = false;
    this.staticCD = 0; this.auraT = 0; this.droneCD = 0; this.bladeAngle = 0; this.bladeHit = new Map();
    this.jetFuel = 0;
    this.glideHeld = false;
    this.fallStartY = 0;
    this.pullFrom = null;
    this.moving = false;
    this.recalc();
    this.hp = this.maxHp;
  }

  get level() { return this.save.level; }

  recalc() {
    const keepPct = this.maxHp ? this.hp / this.maxHp : 1;
    this.stats = computeStats(this.save.level, this.save.equipment, { armor: 0 });
    this.maxHp = this.stats.maxHp;
    if (this.hp !== undefined) this.hp = clamp(this.maxHp * keepPct, 1, this.maxHp);
    this.dashCharges = Math.min(this.dashCharges, this.stats.dashes);
  }

  weapons() { return [0, 1, 2, 3].map((i) => this.save.equipment['weapon' + i] || null); }
  currentWeapon() { return this.save.equipment['weapon' + this.weaponIndex] || null; }

  spawnAt(x, z, yaw = 0) {
    const w = this.game.world;
    this.x = x; this.z = z;
    this.y = w.floorAt(x, z) ?? 0;
    this.vx = this.vy = this.vz = 0;
    this.yaw = yaw; this.pitch = 0;
    this.onGround = true;
    this.lastSafe = { x, z, y: this.y, valid: true };
    for (const s of this.safeRing) s.valid = false;
    this.safeRingT = -99; this.lastRescueT = -99;
    this.hazardT = 0; this.pitT = 0; this.groundSlow = 1; this.coyote = 0;
    this.dead = false;
    this.keys.clear();
    this.tempArmor = 0;
    this.secondWindUsed = false;
    this.shield = 0;
    this.pullFrom = null;
    this.dashCharges = this.stats.dashes;
  }

  eyePos() {
    return [this.x, this.y + EYE - this.landDip * 0.25 + Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmt, this.z];
  }

  heal(n) { if (!this.dead && n > 0) this.hp = Math.min(this.maxHp, this.hp + n); }

  knock(kx, kz, up = 0) {
    this.vx += kx; this.vz += kz;
    if (up > 0) { this.vy = Math.max(this.vy, up); this.onGround = false; }
  }

  // base per-hit damage for a weapon (before crits)
  computeHitDamage(weapon) {
    const st = this.stats, ab = st.abilities;
    const base = weapon.damage * B.upgradeMult(weapon.upgrade) + st.attack;
    let mult = 1 + st.dmgPct + (st.elemDmg[weapon.element] || 0);
    if (ab.berserker) mult += ab.berserker * (1 - this.hp / this.maxHp);
    if (ab.vengeance && this.vengeanceT > 0) mult += ab.vengeance;
    if (ab.momentum) mult += ab.momentum * clamp(Math.hypot(this.vx, this.vz) / (RUN * 1.4), 0, 1);
    return base * mult;
  }
  weaponDamageRef() {
    const w = this.currentWeapon();
    return w ? this.computeHitDamage(w) * Math.max(1, w.rate / 3) : 10 + this.level * 3;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.game, w = g.world, st = this.stats, ab = st.abilities;
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.retaliateCD -= dt; this.vengeanceT -= dt; this.adrenalineT -= dt; this.slowT -= dt;
    // look
    this.yaw += input.lookDX;
    this.pitch = clamp(this.pitch + input.lookDY, -1.35, 1.35);
    // weapon select
    for (let i = 0; i < 4; i++) if (consume('weapon' + i)) this.selectWeapon(i);
    if (consume('next')) this.cycleWeapon(1);
    if (consume('prev')) this.cycleWeapon(-1);
    if (consume('swap')) this.selectWeapon(this.prevWeapon ?? this.weaponIndex);

    // regen & ticking
    const regen = st.hpRegen + (ab.regen || 0) * this.maxHp;
    if (regen > 0 && g.time - (this.lastHurt || -99) > 2) this.heal(regen * dt);
    if (this.burnT > 0) { this.burnT -= dt; this.hp -= this.maxHp * 0.02 * dt; if (this.hp <= 0) { this.hp = 1; } }

    // movement input → wish direction
    let mx = input.move.x, my = input.move.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const fx_ = Math.cos(this.yaw), fz = Math.sin(this.yaw);
    const rx = -Math.sin(this.yaw), rz = Math.cos(this.yaw);
    const wishX = fx_ * my + rx * mx, wishZ = fz * my + rz * mx;
    let speed = RUN * st.moveSpeed * (this.adrenalineT > 0 ? 1 + (ab.adrenaline || 0) : 1) * (this.slowT > 0 ? 0.6 : 1);
    speed *= this.groundSlow;   // water / lava underfoot (set by updateHazards)

    // dash
    this.dashRecharge += dt;
    if (this.dashCharges < st.dashes && this.dashRecharge >= st.dashRecharge) { this.dashCharges++; this.dashRecharge = 0; }
    if (consume('dash') && this.dashCharges > 0 && (this.onGround || ab.air_dash || ab.blink)) {
      this.dashCharges--; this.dashRecharge = 0;
      let dx = wishX, dz = wishZ;
      if (Math.hypot(dx, dz) < 0.1) { dx = fx_; dz = fz; }
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      if (ab.blink) {
        // short teleport
        const steps = 12; let bx = this.x, bz = this.z;
        for (let i = 1; i <= steps; i++) {
          const tx = this.x + dx * 5 * i / steps, tz = this.z + dz * 5 * i / steps;
          if (!w.canOccupy(tx, tz, this.radius, this.y, this.height, 0.6)) break;
          bx = tx; bz = tz;
        }
        w.burst(this.x, this.y + 1, this.z, [0.5, 0.8, 1], 16, { speed: 3, gravity: 0 });
        this.x = bx; this.z = bz;
        w.burst(this.x, this.y + 1, this.z, [0.5, 0.8, 1], 16, { speed: 3, gravity: 0 });
        g.sfx('teleport', { pitch: 2.5, volume: 0.5 });
      } else {
        this.dashT = 0.18;
        this.dashDir = [dx, dz];
        this.dashHit = new Set();
        g.sfx('dash');
        if (!this.onGround) this.vy = Math.max(this.vy, 1.5);
      }
      if (ab.phase_dash) this.invuln = Math.max(this.invuln, 0.3);
      if (ab.bullet_time) g.slowMo(ab.bullet_time);
      g.post.warp = 0.12;
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      const ds = 26 * st.moveSpeed;
      this.vx = this.dashDir[0] * ds; this.vz = this.dashDir[1] * ds;
      if (this.vy < 0) this.vy = 0;
      if (fx.chance(0.6)) w.addParticle({ x: this.x, y: this.y + 0.6, z: this.z, vx: 0, vy: 0, vz: 0, life: 0.25, age: 0, size: 0.25, color: [0.6, 0.7, 1], gravity: 0, cell: 0, add: true, drag: 0 });
      if (ab.dash_strike) {
        for (const m of w.monsters) {
          if (m.dead || this.dashHit.has(m)) continue;
          if (Math.hypot(m.x - this.x, m.z - this.z) < m.radius + 0.8) { this.dashHit.add(m); damageMonster(g, m, this.weaponDamageRef() * ab.dash_strike, { element: 'physical', dir: this.dashDir, knock: 2 }); }
        }
      }
    } else {
      const accel = this.onGround ? ACCEL : AIR_ACCEL;
      const tvx = wishX * speed, tvz = wishZ * speed;
      if (this.onGround && ml < 0.05) {
        const k = Math.max(0, 1 - FRICTION * dt);
        this.vx *= k; this.vz *= k;
      } else {
        this.vx = approach(this.vx, tvx, accel * dt * Math.max(0.3, ml));
        this.vz = approach(this.vz, tvz, accel * dt * Math.max(0.3, ml));
      }
    }
    // gravity pull (boss)
    if (this.pullFrom) {
      const p = this.pullFrom;
      p.t -= dt;
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1;
      this.vx += dx / d * p.strength * dt * 3; this.vz += dz / d * p.strength * dt * 3;
      if (p.t <= 0) this.pullFrom = null;
    }

    // jumping
    const jumpV = JUMP_V * Math.sqrt(st.jumpMult);
    if (consume('jump')) {
      if (this.onGround || this.coyote > 0) {
        this.vy = jumpV; this.onGround = false; this.coyote = 0;
        g.sfx('jump');
      } else if (ab.wall_jump && this.touchingWall()) {
        const n = this.touchingWall();
        this.vy = jumpV; this.vx = n[0] * 7; this.vz = n[1] * 7;
        g.sfx('jump', { pitch: 1.2 });
      } else if (this.airJumpsUsed < st.airJumps) {
        this.airJumpsUsed++;
        this.vy = jumpV * 0.92;
        g.sfx('jump', { pitch: 1 + this.airJumpsUsed * 0.15 });
        w.burst(this.x, this.y, this.z, [0.6, 0.8, 1], 10, { speed: 2.5, gravity: 2 });
      }
    }
    // gravity / glide / jet
    let grav = GRAVITY;
    if (!this.onGround && input.jumpHeld && this.vy < 0) {
      if (ab.jetpack && this.jetFuel > 0) { this.jetFuel -= dt; this.vy = Math.max(this.vy, 0.5); grav = 0; if (fx.chance(0.5)) w.burst(this.x, this.y, this.z, [1, 0.6, 0.2], 1, { speed: 1, gravity: -2 }); }
      else if (ab.glide) { grav = 4; this.vy = Math.max(this.vy, -2.2); }
    }
    if (this.dashT <= 0) this.vy -= grav * dt;
    this.coyote = (this.coyote || 0) - dt;

    // horizontal move with collision (moveActor also follows rising stairs)
    const wasGround = this.onGround;
    const preY = this.y, preX = this.x, preZ = this.z;
    w.moveActor(this, this.vx * dt, this.vz * dt, this.onGround ? 0.55 : 0.35);
    // vertical
    const ground = w.groundUnder(this.x, this.z, this.radius, this.y, 0.55);
    const gCell = w.groundHit.cell, gBox = w.groundHit.box;
    const ceil = w.ceilingOver(this.x, this.z, this.radius, this.y);
    let ny = this.y + this.vy * dt;
    if (ny + this.height > ceil && this.vy > 0) { ny = ceil - this.height; this.vy = 0; }
    let landed = false, fall = 0;
    if (ground > -Infinity && ny <= ground) {
      if (!wasGround) { fall = this.fallStartY - ground; landed = true; this.onLand(fall); }
      // step up smoothly
      ny = ground;
      this.vy = 0;
      this.onGround = true;
      this.airJumpsUsed = 0;
      this.jetFuel = ab.jetpack || 0;
    } else {
      if (wasGround && ny < preY - 0.6) { this.onGround = false; this.coyote = 0.12; this.fallStartY = preY; }
      else if (ny < (ground > -Infinity ? ground : -1e9) + 0.01) { this.onGround = true; }
      else if (wasGround && ny > ground + 0.6) this.onGround = false;
      if (wasGround && !this.onGround) this.fallStartY = this.y;
      if (!this.onGround && this.vy > 0) this.fallStartY = Math.max(this.fallStartY, ny);
    }
    // keep glued to the ground when walking down small steps; on stairs the
    // glue scales with the distance moved so running / dashing down them never
    // turns into a string of tiny falls
    const onStair = gCell >= 0 && w.grid.stairDir[gCell] !== 0;
    // (rise <= 1 per cell: the floor drops at most the distance moved, plus the
    // 0.7 r footprint still resting on the step behind)
    const glue = onStair || this.onStair ? Math.max(0.6, Math.hypot(this.x - preX, this.z - preZ) * 1.05 + 0.25) : 0.6;
    if (wasGround && this.vy <= 0 && ground > -Infinity && ny - ground < glue && ny > ground) { ny = ground; this.onGround = true; }
    this.onStair = onStair && this.onGround;
    // walked off a ledge (not a jump): allow a late jump
    if (wasGround && !this.onGround && this.vy <= 0) this.coyote = 0.12;
    this.y = ny;

    // hazards, pits, safe spots
    this.updateHazards(dt, gCell, gBox, landed, fall);
    if (this.dead) return;
    // stuck inside geometry that cannot be pushed out of: rescue
    if (this.stuck > 30) { this.stuck = 0; this.rescue(0); }
    // fell into the void
    if (this.y < w.level.voidY + 3) this.fellOut();

    // abilities that tick
    this.updateAuras(dt);

    // view bob + weapon sway
    const hs = Math.hypot(this.vx, this.vz);
    this.moving = hs > 0.5;
    const target = this.onGround ? clamp(hs / RUN, 0, 1.25) : 0;
    this.bobAmt = lerp(this.bobAmt, target, Math.min(1, dt * 10));
    this.bobPhase += dt * hs * 1.25;
    this.swayX = lerp(this.swayX, clamp(-input.lookDX * 18, -6, 6), Math.min(1, dt * 12));
    this.swayY = lerp(this.swayY, clamp(input.lookDY * 14, -5, 5) + (this.onGround ? 0 : clamp(-this.vy * 0.5, -6, 6)), Math.min(1, dt * 10));
    this.landDip = Math.max(0, this.landDip - dt * 6);
    const strafe = (-Math.sin(this.yaw) * this.vx + Math.cos(this.yaw) * this.vz) / RUN;
    this.camRoll = lerp(this.camRoll, -strafe * 0.018 + (this.dashT > 0 ? -strafe * 0.04 : 0), Math.min(1, dt * 8));
    // footsteps
    if (this.onGround && hs > 1) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) { this.stepT = 2.2; g.sfx('footstep', { pitch: 0.8 + fx.next() * 0.3 }); }
    }

    // weapons
    this.updateWeapon(dt);
  }

  onLand(fall) {
    const g = this.game, ab = this.stats.abilities;
    if (fall > 1.2) { this.landDip = Math.min(1, fall * 0.25); g.sfx('land', { volume: Math.min(1, fall * 0.2) }); }
    if (ab.meteor_fall && fall > 3) {
      explode(g, this.x, this.y + 0.2, this.z, 3.5, this.weaponDamageRef() * ab.meteor_fall, 'physical', 'player', { color: [1, 0.7, 0.3] });
      g.shake(0.3);
    }
  }

  // Per-cell floor hazards (only while standing on that cell's own floor, not
  // on a crate / bridge above it), deep-pit rescue and the last safe spot.
  updateHazards(dt, cell, box, landed, fall) {
    const g = this.game, w = g.world, gr = w.grid;
    let haz = HAZ.NONE, pit = false;
    if (this.onGround && cell >= 0 && box < 0 && Math.abs(this.y - gr.floorAtPos(cell, this.x, this.z)) < 0.05) {
      haz = w.hazAt(cell);
      pit = (gr.flags[cell] & F.PIT) !== 0 && !(gr.flags[cell] & F.BRIDGE);
    }
    this.groundSlow = haz === HAZ.WATER ? 0.75 : haz === HAZ.LAVA ? 0.6 : 1;
    if (haz === HAZ.LAVA || haz === HAZ.POISON || haz === HAZ.SPIKES) {
      if (landed && haz === HAZ.SPIKES && this.invuln <= 0) {
        // impaled: the harder the fall, the worse
        damagePlayer(g, this.maxHp * (0.1 + Math.max(0, fall) * 0.04), 'physical');
        this.hazardT = 0.5;
        if (this.dead) return;
        if (pit) { this.rescue(0); return; }
      }
      if (this.invuln <= 0) {
        this.hazardT -= dt;
        if (this.hazardT <= 0) {
          this.hazardT = 0.5;
          if (haz === HAZ.LAVA) damagePlayer(g, Math.max(3, this.maxHp * 0.08), 'fire', { status: 'burn' });
          else if (haz === HAZ.POISON) damagePlayer(g, Math.max(2, this.maxHp * 0.05), 'poison');
          else damagePlayer(g, Math.max(3, this.maxHp * 0.08), 'physical');
          if (this.dead) return;
        }
      }
    } else this.hazardT = 0;
    // deep pit: no way to climb out, pull the player back after a moment
    if (pit) {
      this.pitT += dt;
      if (this.pitT > 0.8) { this.rescue(0.08, haz === HAZ.LAVA ? 'fire' : haz === HAZ.POISON ? 'poison' : 'physical'); return; }
    } else this.pitT = 0;
    // remember safe ground (footprint clear of void / pits / damaging floors)
    if (this.onGround && (cell >= 0 || box >= 0) && w.safeFooting(this.x, this.z, this.radius + 0.25)) {
      const s = this.lastSafe || (this.lastSafe = { x: 0, z: 0, y: 0, valid: true });
      s.x = this.x; s.z = this.z; s.y = this.y; s.valid = true;
      if (g.time - this.safeRingT >= 1) {
        const r = this.safeRing[this.safeRingIdx];
        r.x = s.x; r.z = s.z; r.y = s.y; r.valid = true;
        this.safeRingIdx = (this.safeRingIdx + 1) % this.safeRing.length;
        this.safeRingT = g.time;
      }
    }
  }

  // A recent safe spot that is still free. Repeated rescues in a short time
  // walk back through older spots in case the newest one keeps failing.
  pickSafeSpot() {
    const w = this.game.world, ring = this.safeRing, n = ring.length;
    const recent = this.game.time - this.lastRescueT < 3;
    const list = [];
    if (!recent && this.lastSafe) list.push(this.lastSafe);
    for (let k = 1; k <= n; k++) {
      // newest first normally, oldest first after a recent rescue
      const idx = recent ? (this.safeRingIdx + k - 1) % n : (this.safeRingIdx - k + n * 2) % n;
      list.push(ring[idx]);
    }
    if (recent && this.lastSafe) list.push(this.lastSafe);
    for (const s of list) if (s && s.valid !== false && w.canOccupy(s.x, s.z, this.radius, s.y, this.height, 0.6)) return s;
    const L = w.level;
    return { x: L.start.x, z: L.start.z, y: w.floorAt(L.start.x, L.start.z) ?? 0 };
  }

  // Teleport back to safe ground (void falls, deep pits, stuck in geometry)
  rescue(dmgPct = 0.15, element = 'physical') {
    const g = this.game;
    if (dmgPct > 0 && !(element === 'physical' && this.stats.abilities.featherfall)) damagePlayer(g, this.maxHp * dmgPct, element);
    if (this.dead) return;
    const s = this.pickSafeSpot();
    this.x = s.x; this.z = s.z; this.y = s.y + 0.05;
    this.vx = this.vy = this.vz = 0;
    this.onGround = true; this.pitT = 0; this.hazardT = 0; this.coyote = 0;
    this.invuln = Math.max(this.invuln, 1);
    this.lastRescueT = g.time;
    g.post.warp = 0.6;
    g.sfx('teleport', { pitch: 1.5, volume: 0.6 });
  }

  fellOut() { this.rescue(0.15, 'physical'); }

  touchingWall() {
    const w = this.game.world;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!w.canOccupy(this.x + dx * 0.15, this.z + dz * 0.15, this.radius, this.y, this.height, 0.1)) return [-dx, -dz];
    }
    return null;
  }

  updateAuras(dt) {
    const g = this.game, w = g.world, ab = this.stats.abilities;
    if (!w.monsters.length) return;
    const ref = () => this.weaponDamageRef();
    if (ab.static_field) {
      this.staticCD -= dt;
      if (this.staticCD <= 0) {
        this.staticCD = 1;
        let best = null, bd = 36;
        for (const m of w.monsters) { if (m.dead) continue; const d = (m.x - this.x) ** 2 + (m.z - this.z) ** 2; if (d < bd) { bd = d; best = m; } }
        if (best) { w.beam(this.x, this.y + 1.1, this.z, best.x, best.y + best.height * 0.6, best.z, [0.6, 0.8, 1], 0.06, 0.15, 0.25); damageMonster(g, best, ref() * ab.static_field, { element: 'lightning' }); g.sfx('zap', { volume: 0.4 }); }
      }
    }
    if (ab.burning_aura) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.5;
        for (const m of w.monsters) if (!m.dead && Math.hypot(m.x - this.x, m.z - this.z) < 3.5) damageMonster(g, m, ref() * ab.burning_aura * 0.5, { element: 'fire', noProc: true });
        w.burst(this.x, this.y + 0.3, this.z, [1, 0.5, 0.1], 4, { speed: 3, gravity: -2 });
      }
    }
    if (ab.orbiting_blades) {
      const n = Math.round(ab.orbiting_blades);
      this.bladeAngle += dt * 4;
      for (let i = 0; i < n; i++) {
        const a = this.bladeAngle + (i / n) * Math.PI * 2;
        const bx = this.x + Math.cos(a) * 1.6, bz = this.z + Math.sin(a) * 1.6;
        for (const m of w.monsters) {
          if (m.dead) continue;
          const last = this.bladeHit.get(m) || 0;
          if (g.time - last < 0.35) continue;
          if (Math.hypot(m.x - bx, m.z - bz) < m.radius + 0.35) { this.bladeHit.set(m, g.time); damageMonster(g, m, ref() * 0.35, { element: 'physical', knock: 0.6, dir: [Math.cos(a), Math.sin(a)] }); }
        }
      }
    }
    if (ab.drone) {
      this.droneCD -= dt;
      if (this.droneCD <= 0) {
        this.droneCD = 0.6;
        let best = null, bd = 196;
        for (const m of w.monsters) { if (m.dead || !m.alerted) continue; const d = (m.x - this.x) ** 2 + (m.z - this.z) ** 2; if (d < bd && w.los(this.x, this.y + 2, this.z, m.x, m.y + 1, m.z)) { bd = d; best = m; } }
        if (best) {
          const dx = this.x - Math.sin(this.yaw) * 0.8, dz = this.z + Math.cos(this.yaw) * 0.8;
          w.beam(dx, this.y + 2.1, dz, best.x, best.y + best.height * 0.6, best.z, [0.4, 1, 0.8], 0.05, 0.1, 0);
          damageMonster(g, best, ref() * ab.drone, { element: 'plasma' });
        }
      }
    }
  }

  // ------------------------------------------------------------------ weapons
  selectWeapon(i) {
    if (i === this.weaponIndex || !this.save.equipment['weapon' + i]) return;
    this.prevWeapon = this.weaponIndex;
    this.weaponIndex = i;
    this.switchT = 0.32;
    this.spin = 0;
    this.game.sfx('ui_click', { pitch: 0.6 });
    this.game.events.emit('weapon', i);
  }
  cycleWeapon(dir) {
    for (let k = 1; k <= 4; k++) {
      const i = (this.weaponIndex + dir * k + 8) % 4;
      if (this.save.equipment['weapon' + i]) { this.selectWeapon(i); return; }
    }
  }

  updateWeapon(dt) {
    const g = this.game, wpn = this.currentWeapon();
    this.fireCD -= dt;
    if (this.fireAnim >= 0) { this.fireAnim += dt; if (this.fireAnim > this.fireAnimLen) this.fireAnim = -1; }
    if (this.switchT > 0) { this.switchT -= dt; return; }
    if (!wpn || g.inHub) return;
    const arch = ARCHETYPES[wpn.archetype] || ARCHETYPES.rifle;
    const wantFire = input.fire;
    if (arch.spinup) this.spin = clamp(this.spin + (wantFire ? dt / arch.spinup : -dt), 0, 1);
    if (!wantFire) { this.triggerHeld = false; return; }
    if (!arch.auto && this.triggerHeld && input.mode !== 'touch') return;
    if (this.fireCD > 0) return;
    if (arch.spinup && this.spin < 0.35) return;
    const rate = wpn.rate * this.stats.fireRate * (this.adrenalineT > 0 ? 1 + (this.stats.abilities.adrenaline || 0) : 1) * (arch.spinup ? 0.4 + this.spin * 0.6 : 1);
    this.fireCD = 1 / rate;
    this.triggerHeld = true;
    firePlayerWeapon(g, wpn);
    if (this.stats.abilities.double_tap && fx.chance(this.stats.abilities.double_tap)) setTimeout(() => { if (!this.dead && g.state === 'playing') firePlayerWeapon(g, wpn); }, 60);
    this.fireAnim = 0;
    this.fireAnimLen = Math.min(0.42, Math.max(0.1, 0.9 / rate));
    this.pitch = clamp(this.pitch + (arch.kick || 0.01) * (0.6 + fx.next() * 0.5), -1.35, 1.35);
    this.yaw += (fx.next() - 0.5) * (arch.kick || 0.01) * 0.4;
    g.noiseT = 1.2;
    g.sfx(arch.sound, { pitch: 0.92 + fx.next() * 0.16 });
    // muzzle flash light
    const eye = this.eyePos();
    const col = wpn.element === 'physical' ? [1, 0.8, 0.45] : this.game.elemLight(wpn.element);
    if (!arch.melee) g.world.flash(eye[0] + Math.cos(this.yaw) * 0.8, eye[1], eye[2] + Math.sin(this.yaw) * 0.8, col, 6, 0.07, 1.6);
    if (arch.kick > 0.03) g.shake(arch.kick * 2);
  }

  // First-person weapon frame + screen offset (DOOM-style bob).
  // Returns {frame, ox, oy} in low-res pixels.
  // seq: the fire frames to play (per-weapon, from the art metadata);
  // hold: share of the animation the first of them stays up (the flash frame
  // of a gun has to be seen even at a high fire rate / low frame rate).
  weaponView(lowH, seq = [1, 2, 3, 4, 5, 6], hold = 0) {
    const s = lowH / 200;
    // classic figure-eight bob: horizontal swings once per two steps, vertical dips every step
    const amp = this.bobAmt;
    let ox = Math.cos(this.bobPhase) * 7 * amp * s;
    let oy = Math.abs(Math.sin(this.bobPhase)) * 6 * amp * s;
    // idle breathing
    const t = this.game.time;
    ox += Math.sin(t * 1.1) * 0.8 * s;
    oy += (Math.sin(t * 1.7) * 0.8 + 0.8) * s;
    // mouse/aim sway, jump/fall and landing dip
    ox += this.swayX * s;
    oy += this.swayY * s + this.landDip * 10 * s;
    // weapon switch: lower out, raise in
    if (this.switchT > 0) oy += Math.sin((this.switchT / 0.32) * Math.PI) * 60 * s;
    let frame = 0;
    if (this.fireAnim >= 0) {
      const p = this.fireAnim / this.fireAnimLen;
      const n = seq.length;
      const k = hold > 0 && n > 1 ? (p < hold ? 0 : 1 + Math.floor(((p - hold) / (1 - hold)) * (n - 1))) : Math.floor(p * n);
      frame = seq[Math.max(0, Math.min(n - 1, k))];
      oy += Math.sin(Math.min(1, p * 2) * Math.PI) * 3 * s; // recoil kick
      ox *= 0.4; // steady the gun while firing, like the original
    }
    return { frame, ox, oy };
  }
}
