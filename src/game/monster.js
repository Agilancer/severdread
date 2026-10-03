// Monster runtime + AI.
//   melee   : rush the player, wind up, strike, recover
//   ranged  : hold a preferred range, strafe, fire projectiles / beams / breath
//   teleport: (robots) blink to dodge shots or close the distance
//   wallWalker: (spider-likes) crawl on walls & ceilings, leap floor<->ceiling
//   bosses  : charge, shockwave, nova rings, summons, gravity pull
import { MONSTERS, VARIANTS, CATEGORIES } from '../data/monsters.js';
import * as B from '../data/balance.js';
import { F, HAZ } from './grid.js';
import { fx } from '../core/rng.js';
import { clamp, wrapAngle, lerp } from '../core/math.js';
import { MODE } from './spritebatch.js';
import { damagePlayer, fireEnemyProjectile, damageMonster, killMonster } from './combat.js';
import { ELEMENTS, STATUS } from '../data/elements.js';

const ACT = { idle: 0, walk: 1, windup: 5, attack: 6, recover: 7 };

export class Monster {
  constructor(game, spawn, depth, opts = {}) {
    const def = MONSTERS[spawn.monster] || MONSTERS.piston_monk;
    this.game = game;
    this.id = spawn.monster;
    this.def = def;
    this.variant = VARIANTS.find((v) => v.id === spawn.variant) || VARIANTS[0];
    this.elite = !!spawn.elite;
    this.boss = !!def.boss;
    this.summoned = !!opts.summoned;
    const v = this.variant;
    const d = Math.max(1, depth);
    this.maxHp = Math.round(def.hp * B.monsterHpMult(d) * (v.hpMult || 1) * (this.elite ? 2.3 : 1) * (opts.hpMult || 1));
    this.hp = this.maxHp;
    this.dmg = def.damage * B.monsterDmgMult(d) * (v.dmgMult || 1) * (this.elite ? 1.35 : 1);
    this.armor = (def.armor || 0) + B.monsterArmor(d) * (this.boss ? 1.4 : 0.6);
    this.speed = def.speed * (v.speedMult || 1) * (this.elite ? 1.1 : 1);
    this.radius = def.radius * (this.elite ? 1.1 : 1);
    this.height = def.height * (this.elite ? 1.15 : 1);
    this.shield = def.shield || 0;
    this.resist = { ...(CATEGORIES[def.category]?.resist || {}), ...(def.resist || {}), ...(v.resist || {}) };
    this.x = spawn.x; this.z = spawn.z;
    const f = game.world.floorAt(this.x, this.z);
    this.floorY = f ?? 0;
    this.y = this.floorY + (def.flying || 0);
    this.vy = 0;
    this.yaw = fx.float(0, Math.PI * 2);
    this.state = 'idle'; this.stateT = 0;
    this.alerted = !!opts.alerted;
    this.status = {};
    this.frozen = 0;
    this.kx = 0; this.kz = 0;
    this.animT = fx.float(0, 4);
    this.atkCD = fx.float(0.5, 1.5);
    this.tpCD = def.teleport ? fx.float(1, def.teleport.cooldown) : 0;
    this.special = {};
    for (const k of Object.keys(def.specials || {})) this.special[k] = fx.float(2, def.specials[k].cooldown);
    this.mode = 'floor';          // floor | ceiling | wall
    this.modeT = fx.float(2, 6);
    this.trans = null;            // floor<->ceiling leap
    this.lift = 0;                // wall-crawl height
    this.wallDir = null;
    this.flash = 0;
    this.dead = false; this.deathT = 0;
    this.carriesKey = spawn.carriesKey || null;
    this.awake = !this.boss;
    this.strafeDir = fx.sign();
    this.strafeT = 0;
    this.sprite = game.content.monsterSprite(this.id);
    this.distToPlayer = 99;
    this.losT = 0; this.canSee = false;
    this.detourT = 0; this.hazT = 0; this.pitT = 0; this.onGround = false;
    this.burstLeft = 0; this.burstT = 0; this.breathT = 0;
    this.name = (this.elite ? 'Elite ' : '') + (v.prefix ? v.prefix + ' ' : '') + def.name;
    // tint / palette
    const pal = def.palette || {};
    this.hue = (pal.hue || 0) + (v.hue || 0);
    this.sat = (pal.sat ?? 1) * (v.sat ?? 1);
    const t1 = pal.tint || [1, 1, 1], t2 = v.tint || [1, 1, 1];
    this.tint = [t1[0] * t2[0], t1[1] * t2[1], t1[2] * t2[2]];
    const g1 = pal.glow || [0, 0, 0], g2 = v.glow || [0, 0, 0];
    this.glow = [g1[0] + g2[0], g1[1] + g2[1], g1[2] + g2[2]];
    this.elemental = v.element || def.attack?.projectile?.element || def.attack?.element || null;
    this.visScale = (def.scale || 1) * (this.elite ? 1.15 : 1) * (this.sprite.placeholder && this.boss ? 1.25 : 1);
    const pspec = def.attack?.projectile;
    if (pspec) {
      const tag = pspec.spriteTag || null;
      const h = [...this.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      this.projSpriteId = tag ? game.content.enemyProjectileId(tag, h) : null;
    }
  }

  get eyeY() { return this.y + this.height * 0.75; }

  update(dt) {
    const g = this.game, w = g.world, p = g.player;
    if (this.dead) { this.deathT += dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    this.animT += dt;
    const dx = p.x - this.x, dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    this.distToPlayer = dist;
    // line of sight (throttled)
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.18 + fx.float(0, 0.1);
      this.canSee = dist < 30 && w.los(this.x, this.eyeY, this.z, p.x, p.y + p.height * 0.8, p.z);
    }
    // waking up
    if (!this.alerted) {
      if (this.boss) {
        if (this.canSee && dist < 14) this.wake();
      } else if ((this.canSee && dist < 18) || dist < 3 || (g.noiseT > 0 && dist < 14)) {
        this.alerted = true;
        if (fx.chance(0.5)) g.sfx(this.voice(), { dist });
      }
    }
    this.updateStatus(dt);
    if (this.frozen > 0) { this.frozen -= dt; this.applyKnock(dt); return; }
    const slow = this.status.chill ? 1 - STATUS.chill.slow : 1;
    const frost = p.stats.abilities.frost_aura && dist < 4 ? 1 - p.stats.abilities.frost_aura : 1;
    const spd = this.speed * slow * frost;

    if (this.trans) { this.updateTransition(dt); return; }
    if (!this.alerted) { this.idleWander(dt); this.settle(dt); return; }

    // teleporting
    if (this.state === 'tp_out' || this.state === 'tp_in') { this.updateTeleport(dt); return; }
    if (this.state === 'pain') { this.stateT -= dt; if (this.stateT <= 0) this.state = 'chase'; this.applyKnock(dt); this.settle(dt); return; }
    if (this.state === 'charge') { this.updateCharge(dt); return; }

    // face the player when attacking / seeing
    const toYaw = Math.atan2(dz, dx);
    if (this.state === 'attack') {
      this.yaw = turnToward(this.yaw, toYaw, 10 * dt);
      this.updateAttack(dt, dist);
      this.applyKnock(dt);
      this.settle(dt);
      return;
    }

    // specials & teleport decisions
    if (this.def.teleport) this.maybeTeleport(dt, dist);
    if (this.boss) this.updateSpecials(dt, dist);
    if (this.def.wallWalker) this.updateCrawlMode(dt, dist);

    // attack decision
    this.atkCD -= dt;
    const atk = this.def.attack;
    if (atk && this.atkCD <= 0) {
      const inMelee = atk.type === 'melee' && dist < atk.range + p.radius && Math.abs(p.y - this.groundY()) < 1.6 + this.height * 0.4;
      const inRange = (atk.type === 'ranged' || atk.type === 'breath') && this.canSee && dist < atk.range;
      if (inMelee && this.mode === 'ceiling') { this.startTransition('floor'); return; }
      if (inMelee || inRange) {
        this.state = 'attack'; this.phase = 'windup'; this.stateT = atk.windup;
        if (atk.sound && atk.type !== 'melee') g.sfx(atk.sound, { dist, volume: 0.35, pitch: 0.7 });
        return;
      }
    }

    // movement goal: straight at the player when it is visible and near, the
    // flow field otherwise - and also for walkers whose direct route is blocked
    // (detourT) or, for melee, when the player is up / down a level (stairs)
    let goal = null;
    const pref = this.def.preferredRange || (atk?.type === 'melee' ? 0 : 7);
    const walker = !this.def.flying;
    this.detourT -= dt;
    const levelGap = walker && atk?.type === 'melee' && Math.abs(p.y - this.floorY) > 1.2;
    const direct = this.canSee && dist < 16 && !(walker && (this.detourT > 0 || levelGap));
    if (direct) {
      if (atk?.type !== 'melee' && dist < pref - 2) goal = { x: this.x - dx, z: this.z - dz };            // back off
      else if (atk?.type !== 'melee' && dist < pref + 2) {                                                // strafe
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = fx.float(0.8, 2); this.strafeDir = fx.sign(); }
        goal = { x: this.x - dz * this.strafeDir, z: this.z + dx * this.strafeDir };
      } else goal = { x: p.x, z: p.z };
    } else {
      goal = w.flowStep(this.x, this.z) || (this.canSee ? { x: p.x, z: p.z } : null);
    }
    this.state = 'chase';
    let moved = false;
    if (goal && dist > (atk?.type === 'melee' ? atk.range * 0.6 : 0.5)) {
      const gx = goal.x - this.x, gz = goal.z - this.z, gl = Math.hypot(gx, gz);
      if (gl > 0.05) {
        const wantYaw = Math.atan2(gz, gx);
        this.yaw = turnToward(this.yaw, wantYaw, 8 * dt);
        const step = spd * dt;
        const mx = (gx / gl) * step, mz = (gz / gl) * step;
        const ox = this.x, oz = this.z;
        moved = this.move(mx, mz);
        // walking into a wall / ledge on the direct route: follow the flow field for a while
        if (direct && walker && this.mode === 'floor' && Math.abs(this.x - ox) + Math.abs(this.z - oz) < step * 0.3) this.detourT = 1.5;
      }
    } else this.yaw = turnToward(this.yaw, toYaw, 6 * dt);
    this.moving = moved;
    this.separate(dt);
    this.applyKnock(dt);
    this.settle(dt);
  }

  voice() {
    return { robot: 'robot_alert', demon: 'demon_alert', chitter: 'chitter', alien: 'alien' }[this.def.voice] || 'demon_alert';
  }

  wake() {
    if (this.awake && this.alerted) return;
    this.awake = true; this.alerted = true;
    const g = this.game;
    g.sfx('boss_roar', { volume: 1 });
    g.shake(0.4);
    g.bossAwake(this);
  }

  groundY() { return this.mode === 'ceiling' ? this.ceilY() : this.floorY; }
  // ceiling for crawlers: low boxes (tables, beams near the floor) don't count
  ceilY() { return this.game.world.ceilingOver(this.x, this.z, this.radius, this.floorY + 1.7); }

  // movement in the current mode; returns true if moved
  move(mx, mz) {
    const w = this.game.world;
    const ox = this.x, oz = this.z;
    if (this.mode === 'ceiling') {
      const ok = (x, z) => w.forCells(x, z, this.radius, (i) => {
        const gr = w.grid;
        if (i < 0 || !gr.type[i] || gr.sky[i] || w.doorByCell.has(i)) return false;
        return gr.ceil[i] - gr.floor[i] > 1.2 || !!(gr.flags[i] & F.VOID);
      });
      if (ok(this.x + mx, this.z)) this.x += mx;
      if (ok(this.x, this.z + mz)) this.z += mz;
    } else {
      const flying = this.def.flying;
      const stepH = flying ? 2.5 : 0.6;
      const feet = flying ? this.floorY : this.y - this.lift;
      const a = { x: this.x, z: this.z, y: feet, radius: this.radius, height: Math.min(this.height, 1.6) };
      const blocked = w.moveActor(a, mx, mz, stepH);
      if (!flying) {
        // never step from safe ground into the void, a pit or a damaging floor
        // on our own (knockback can still push us in)
        const gr = w.grid, i0 = gr.cellAt(ox, oz), i1 = gr.cellAt(a.x, a.z);
        if (i1 !== i0 && !w.cellDanger(i0) && w.cellDanger(i1)) {
          const sb = w.surfaceBelow(a.x, a.y + 0.6, a.z);
          const base = i1 < 0 || (gr.flags[i1] & F.VOID) ? w.level.voidY : gr.floorAtPos(i1, a.x, a.z);
          if (sb === null || sb <= base + 0.01) { this.detourT = 1.5; return false; }   // no bridge / crate over it
        }
        if (a.y > feet) this.y += a.y - feet;   // climbed stairs during the move
      }
      this.x = a.x; this.z = a.z;
      // hop up ledges / onto crates the flow field says are climbable
      if (blocked && !flying && this.vy === 0 && this.onGround) {
        const ax = this.x + Math.sign(mx) * (this.radius + 0.3), az = this.z + Math.sign(mz) * (this.radius + 0.3);
        const ahead = w.surfaceBelow(ax, feet + 1.2, az);
        if (ahead !== null && ahead > feet + 0.5 && ahead < feet + 1.15) { this.vy = 6; this.onGround = false; }
      }
    }
    return Math.abs(this.x - ox) + Math.abs(this.z - oz) > 1e-4;
  }

  // vertical: gravity / hover / ceiling / wall lift
  settle(dt) {
    const w = this.game.world;
    const ground = w.groundUnder(this.x, this.z, this.radius, (this.mode === 'floor' ? this.y - this.lift : this.floorY) + 0.6, 0);
    if (ground > -Infinity) this.floorY = ground;
    else if (this.mode !== 'ceiling' && !this.def.flying && (w.cellFlags(this.x, this.z) & F.VOID)) this.floorY = (w.level.voidY ?? -30) - 10;   // nothing below: fall
    if (this.mode === 'ceiling') {
      const c = this.ceilY();
      if (c > 60 || c - this.floorY > 7) { this.startTransition('floor'); return; }
      this.y = c - this.height;
      return;
    }
    if (this.def.flying) {
      const target = this.floorY + this.def.flying + Math.sin(this.animT * 2) * 0.15;
      this.y = lerp(this.y, target, Math.min(1, dt * 3));
      const c = w.ceilingOver(this.x, this.z, this.radius, this.y);
      if (this.y + this.height > c) this.y = c - this.height;
      return;
    }
    // wall crawl lift
    const wantLift = this.mode === 'wall' ? 0.9 : 0;
    this.lift = lerp(this.lift, wantLift, Math.min(1, dt * 4));
    const feet = this.y - this.lift;
    const wasGround = this.onGround;
    this.vy -= 22 * dt;
    let ny = feet + this.vy * dt;
    if (ny <= this.floorY) { ny = this.floorY; this.vy = 0; this.onGround = true; }
    else if (wasGround && this.vy <= 0 && ny - this.floorY < 0.6) { ny = this.floorY; this.vy = 0; this.onGround = true; }   // walk down steps / stairs
    else this.onGround = false;
    if (ny < (w.level.voidY ?? -30) + 2) { this.hp = 0; killMonster(this.game, this, { noCorpse: true }); return; }
    this.y = ny + this.lift;
    this.hazardTick(dt);
  }

  // Damaging floors hurt monsters too (resistances apply); a monster stuck at
  // the bottom of a deep pit dies after a while (keys / loot still drop).
  hazardTick(dt) {
    const w = this.game.world, gr = w.grid;
    const i = gr.cellAt(this.x, this.z);
    let haz = HAZ.NONE, pit = false;
    if (this.onGround && i >= 0 && gr.type[i] && Math.abs(this.floorY - gr.floorAtPos(i, this.x, this.z)) < 0.06) {
      haz = w.hazAt(i);
      pit = (gr.flags[i] & F.PIT) !== 0 && !(gr.flags[i] & F.BRIDGE);
    }
    if (haz === HAZ.LAVA || haz === HAZ.POISON || haz === HAZ.SPIKES) {
      this.hazT -= dt;
      if (this.hazT <= 0) {
        this.hazT = 0.5;
        const pct = (haz === HAZ.POISON ? 0.04 : 0.06) * (this.boss ? 0.3 : 1);
        damageMonster(this.game, this, Math.max(1, this.maxHp * pct), { element: haz === HAZ.LAVA ? 'fire' : haz === HAZ.POISON ? 'poison' : 'physical', isDot: true, trueDamage: true, noProc: true });
      }
    } else this.hazT = 0;
    if (pit && !this.dead) {
      this.pitT += dt;
      if (this.pitT > 2) { this.hp = 0; killMonster(this.game, this, {}); }
    } else this.pitT = 0;
  }

  applyKnock(dt) {
    if (Math.abs(this.kx) + Math.abs(this.kz) < 0.01) return;
    if (this.mode === 'ceiling') { this.kx = this.kz = 0; return; }
    const a = { x: this.x, z: this.z, y: this.y - this.lift, radius: this.radius, height: Math.min(this.height, 1.6) };
    const feet = a.y;
    this.game.world.moveActor(a, this.kx * dt * 6, this.kz * dt * 6, 0.6);
    this.x = a.x; this.z = a.z;
    if (!this.def.flying && a.y > feet) this.y += a.y - feet;
    const k = Math.max(0, 1 - dt * 6);
    this.kx *= k; this.kz *= k;
  }

  separate(dt) {
    for (const o of this.game.world.monsters) {
      if (o === this || o.dead) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      const r = this.radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (r - d) * 0.5 * Math.min(1, dt * 10);
      this.move((dx / d) * push, (dz / d) * push);
    }
  }

  idleWander(dt) {
    this.stateT -= dt;
    if (this.stateT <= 0) { this.stateT = fx.float(1.5, 4); this.wanderYaw = fx.chance(0.5) ? this.yaw + fx.float(-1.5, 1.5) : null; }
    if (this.wanderYaw != null && !this.boss) {
      this.yaw = turnToward(this.yaw, this.wanderYaw, 2 * dt);
      this.moving = this.move(Math.cos(this.yaw) * this.speed * 0.25 * dt, Math.sin(this.yaw) * this.speed * 0.25 * dt);
    } else this.moving = false;
  }

  // ---------------------------------------------------------------- attacks
  updateAttack(dt, dist) {
    const atk = this.def.attack, g = this.game, p = g.player;
    this.stateT -= dt;
    if (atk.type === 'breath' && this.phase === 'strike') {
      this.breathT -= dt;
      const rate = atk.projectile.rate || 20;
      while (this.breathT <= 0) {
        this.breathT += 1 / rate;
        this.fire(atk.projectile, { yawOff: fx.gauss() * (atk.projectile.spread || 0.2), pitchOff: fx.gauss() * 0.06 });
      }
    }
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = atk.burstDelay || 0.12; this.burstLeft--; this.fire(atk.projectile, { yawOff: fx.gauss() * 0.04 }); }
    }
    if (this.stateT > 0) return;
    if (this.phase === 'windup') {
      this.phase = 'strike'; this.stateT = atk.strike;
      if (atk.type === 'melee') {
        if (atk.sound) g.sfx(atk.sound, { dist });
        const reach = atk.range * 1.2 + p.radius;
        if (dist < reach && Math.abs(p.y - this.floorY) < 1.8 + this.height * 0.3) {
          damagePlayer(g, this.dmg, atk.element || this.variant.element || 'physical', { source: this, melee: true, status: atk.element ? ELEMENTS[atk.element]?.status : null });
          const kb = atk.knockback || 3;
          const d = dist || 1;
          p.knock((p.x - this.x) / d * kb, (p.z - this.z) / d * kb, kb * 0.3);
          if (atk.bleed) p.burnT = 2;
        }
        if (atk.slam) { g.shake(0.25); g.world.burst(this.x + Math.cos(this.yaw) * atk.range * 0.7, this.floorY + 0.05, this.z + Math.sin(this.yaw) * atk.range * 0.7, [0.6, 0.55, 0.5], 12, { speed: 3, cell: 2, add: false, size: 0.3 }); }
      } else if (atk.type === 'ranged') {
        if (atk.sound) g.sfx(atk.sound, { dist });
        const n = atk.burst || 1;
        if (atk.burstDelay) { this.fire(atk.projectile); this.burstLeft = n - 1; this.burstT = atk.burstDelay; }
        else if (n > 1) {
          const spread = atk.burstSpread || 0.4;
          for (let k = 0; k < n; k++) this.fire(atk.projectile, { yawOff: (k / (n - 1) - 0.5) * spread });
        } else this.fire(atk.projectile);
        if (atk.twin) this.fire(atk.projectile, { side: 1 });
      } else if (atk.type === 'breath') {
        if (atk.sound) g.sfx(atk.sound, { dist });
        this.breathT = 0;
      }
    } else if (this.phase === 'strike') {
      this.phase = 'recover'; this.stateT = atk.recover;
    } else {
      this.state = 'chase';
      this.atkCD = (atk.cooldown || 1) * fx.float(0.8, 1.3) * (this.elite ? 0.8 : 1);
    }
  }

  fire(spec, o = {}) {
    const p = this.game.player;
    const side = o.side ? this.radius * 0.8 : 0;
    const from = [this.x + Math.cos(this.yaw) * this.radius * 0.8 - Math.sin(this.yaw) * side, this.y + this.height * (this.mode === 'ceiling' ? 0.4 : 0.62), this.z + Math.sin(this.yaw) * this.radius * 0.8 + Math.cos(this.yaw) * side];
    // light lead on the target
    const lead = Math.min(0.5, this.distToPlayer / (spec.speed || 12)) * (this.elite ? 0.8 : 0.4);
    const target = [p.x + p.vx * lead, p.y + p.height * 0.6, p.z + p.vz * lead];
    fireEnemyProjectile(this.game, this, spec, from, target, o);
  }

  // ---------------------------------------------------------------- teleport (robots)
  maybeTeleport(dt, dist) {
    this.tpCD -= dt;
    if (this.tpCD > 0 || !this.alerted) return;
    const tp = this.def.teleport, g = this.game;
    let want = null;
    // dodge incoming player projectiles
    if (fx.chance(tp.dodgeChance || 0)) {
      for (const pr of g.world.projectiles) {
        if (pr.owner !== 'player') continue;
        const dx = this.x - pr.x, dz = this.z - pr.z;
        const d = Math.hypot(dx, dz);
        if (d < 4 && (pr.vx * dx + pr.vz * dz) > 0) { want = 'dodge'; break; }
      }
    }
    if (!want && dist > 7 && fx.chance(tp.closeChance || 0)) want = 'close';
    if (!want) { this.tpCD = 0.4; return; }
    const dest = this.findTeleportSpot(want, tp.range || 5);
    this.tpCD = tp.cooldown * fx.float(0.8, 1.3);
    if (!dest) return;
    this.tpDest = dest;
    this.state = 'tp_out'; this.stateT = 0.22;
    g.sfx('enemy_teleport', { dist });
    g.world.burst(this.x, this.y + this.height * 0.5, this.z, [0.4, 0.8, 1], 12, { speed: 2, gravity: 0 });
  }

  findTeleportSpot(kind, range) {
    const w = this.game.world, p = this.game.player, gr = w.grid;
    for (let tries = 0; tries < 16; tries++) {
      let x, z;
      if (kind === 'close') { const a = fx.float(0, Math.PI * 2), r = fx.float(2.2, 4); x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r; }
      else { const a = this.yaw + Math.PI / 2 * fx.sign() + fx.float(-0.5, 0.5), r = fx.float(2, range); x = this.x + Math.cos(a) * r; z = this.z + Math.sin(a) * r; }
      const i = gr.cellAt(x, z);
      if (i < 0 || !gr.type[i] || (gr.flags[i] & (F.VOID | F.HAZARD | F.PIT | F.STAIR | F.OBSTACLE)) || w.doorByCell.has(i)) continue;
      const f = gr.floorAtPos(i, x, z);
      if (!w.canOccupy(x, z, this.radius, f, Math.min(this.height, 1.6), 0.3)) continue;
      if (!w.los(x, f + 1, z, p.x, p.y + 1, p.z)) continue;
      return { x, z, y: f };
    }
    return null;
  }

  updateTeleport(dt) {
    this.stateT -= dt;
    if (this.stateT > 0) return;
    if (this.state === 'tp_out') {
      this.x = this.tpDest.x; this.z = this.tpDest.z; this.floorY = this.tpDest.y; this.y = this.floorY + (this.def.flying || 0);
      this.mode = 'floor'; this.lift = 0;
      this.state = 'tp_in'; this.stateT = 0.22;
      this.game.world.burst(this.x, this.y + this.height * 0.5, this.z, [0.4, 0.8, 1], 12, { speed: 2, gravity: 0 });
      this.game.world.flash(this.x, this.y + 1, this.z, [0.4, 0.8, 1], 4, 0.25);
    } else {
      this.state = 'chase';
      this.atkCD = Math.min(this.atkCD, 0.35);
    }
  }

  // ---------------------------------------------------------------- wall & ceiling crawling
  updateCrawlMode(dt, dist) {
    this.modeT -= dt;
    if (this.mode === 'wall') {
      // stay on a wall only while one is adjacent
      if (!this.adjacentWall()) this.mode = 'floor';
    }
    if (this.modeT > 0) return;
    this.modeT = fx.float(3, 7);
    const bias = this.def.ceilingBias ?? 0.4;
    const r = fx.next();
    const ceil = this.ceilY();
    const canCeil = ceil < 30 && ceil - this.floorY > 1.6 && ceil - this.floorY < 7;   // no absurd leaps to tall ceilings
    if (this.mode === 'floor') {
      if (canCeil && r < bias && dist > 2.5) this.startTransition('ceiling');
      else if (r < bias + 0.3 && this.adjacentWall()) this.mode = 'wall';
    } else if (this.mode === 'ceiling') {
      if (r < 0.45 || dist < 2.2) this.startTransition('floor');
    } else if (r < 0.5) this.mode = 'floor';
  }

  adjacentWall() {
    const w = this.game.world, gr = w.grid;
    const cx = Math.floor(this.x), cz = Math.floor(this.z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (!gr.in(nx, nz)) continue;
      const i = gr.idx(nx, nz);
      if (!gr.type[i] || gr.floor[i] > this.floorY + 2) {
        const edge = dx ? (dx > 0 ? cx + 1 - this.x : this.x - cx) : (dz > 0 ? cz + 1 - this.z : this.z - cz);
        if (edge < this.radius + 0.25) { this.wallDir = [dx, dz]; return true; }
      }
    }
    return false;
  }

  startTransition(to) {
    const from = this.mode;
    const ceil = this.ceilY();
    if (to === 'ceiling' && (ceil > 30 || ceil - this.floorY > 7)) return;
    this.trans = { from, to, t: 0, dur: 0.55, y0: this.y, y1: to === 'ceiling' ? ceil - this.height : this.floorY };
    this.mode = 'floor';
    this.game.sfx('jump', { dist: this.distToPlayer, pitch: 0.7 });
  }

  updateTransition(dt) {
    const tr = this.trans;
    tr.t += dt / tr.dur;
    const t = Math.min(1, tr.t);
    const e = t * t * (3 - 2 * t);
    this.y = lerp(tr.y0, tr.y1, e) + Math.sin(t * Math.PI) * 0.4 * (tr.to === 'ceiling' ? 1 : -1);
    this.flipT = tr.to === 'ceiling' ? e : 1 - e;
    if (t >= 1) {
      this.mode = tr.to;
      this.trans = null;
      this.flipT = tr.to === 'ceiling' ? 1 : 0;
      this.vy = 0;
    }
  }

  // ---------------------------------------------------------------- boss specials
  updateSpecials(dt, dist) {
    const sp = this.def.specials || {}, g = this.game, p = g.player;
    for (const k of Object.keys(sp)) {
      this.special[k] -= dt;
      if (this.special[k] > 0) continue;
      const s = sp[k];
      this.special[k] = s.cooldown * fx.float(0.85, 1.25);
      if (k === 'charge' && dist > 4 && this.canSee) {
        this.state = 'charge'; this.stateT = 0.45; this.chargeHit = false; this.chargeDur = s.duration; this.chargeSpeed = s.speed;
        g.sfx('boss_roar', { dist, pitch: 1.3, volume: 0.6 });
        return;
      }
      if (k === 'shockwave') {
        g.sfx('shockwave', { dist });
        g.shake(0.3);
        g.addShockwave(this.x, this.floorY, this.z, s.speed, this.dmg * (s.damage || 0.6), s.element || 'physical');
      }
      if (k === 'nova') {
        const n = s.count || 12;
        const spec = s.projectile || this.def.attack?.projectile || { sprite: 'violet_star', element: 'void', speed: 9, size: 0.5 };
        const off = fx.float(0, Math.PI * 2);
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          fireEnemyProjectile(g, this, { ...spec, dmgMul: 0.6 }, [this.x, this.y + this.height * 0.5, this.z], [this.x + Math.cos(a) * 10, this.y + this.height * 0.5, this.z + Math.sin(a) * 10]);
        }
        g.sfx('zap_enemy', { dist, pitch: 0.6 });
      }
      if (k === 'summon') {
        const alive = g.world.monsters.filter((m) => m.summoned && !m.dead).length;
        if (alive < 6) for (let i = 0; i < (s.count || 2); i++) g.summonMonster(s.monster, this.x + fx.float(-2, 2), this.z + fx.float(-2, 2));
      }
      if (k === 'pull' && this.canSee) { p.pullFrom = { x: this.x, z: this.z, t: s.duration, strength: s.strength }; g.sfx('teleport', { pitch: 0.5, volume: 0.5 }); }
    }
  }

  updateCharge(dt) {
    const g = this.game, p = g.player;
    this.stateT -= dt;
    if (this.chargeDur > 0 && this.stateT > 0 && this.stateT < 10 && !this.charging) {
      // wind-up: face the player
      this.yaw = turnToward(this.yaw, Math.atan2(p.z - this.z, p.x - this.x), 8 * dt);
      return;
    }
    if (!this.charging) { this.charging = true; this.stateT = this.chargeDur; }
    const mx = Math.cos(this.yaw) * this.chargeSpeed * dt, mz = Math.sin(this.yaw) * this.chargeSpeed * dt;
    const moved = this.move(mx, mz);
    this.settle(dt);
    if (fx.chance(0.5)) g.world.burst(this.x, this.floorY + 0.1, this.z, [0.5, 0.45, 0.4], 2, { speed: 1.5, cell: 2, add: false, size: 0.3 });
    if (!this.chargeHit && Math.hypot(p.x - this.x, p.z - this.z) < this.radius + p.radius + 0.3) {
      this.chargeHit = true;
      damagePlayer(g, this.dmg * 1.3, 'physical', { source: this, melee: true });
      p.knock(Math.cos(this.yaw) * 12, Math.sin(this.yaw) * 12, 4);
    }
    if (!moved || this.stateT <= 0) {
      if (!moved) { g.shake(0.3); g.sfx('slam', { dist: this.distToPlayer }); this.frozen = 0.6; }
      this.state = 'chase'; this.charging = false; this.chargeDur = 0;
    }
  }

  // ---------------------------------------------------------------- status effects
  updateStatus(dt) {
    const g = this.game;
    for (const id of Object.keys(this.status)) {
      const s = this.status[id];
      s.t -= dt;
      if (s.dps) {
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick = STATUS[id].tick;
          const el = id === 'burn' ? 'fire' : id === 'poison' ? 'poison' : 'blood';
          damageMonster(g, this, s.dps * STATUS[id].tick, { element: el, isDot: true, trueDamage: true });
          if (id === 'bleed' && STATUS.bleed.lifesteal) g.player.heal(s.dps * STATUS[id].tick * STATUS.bleed.lifesteal);
          // bleeding / poisoned monsters drip blood (leaving a trail); burn and poison keep their coloured puff
          if ((id === 'bleed' || id === 'poison') && g.world.gore) g.world.gore.drip(this, id === 'bleed' ? fx.int(1, 2) : 1);
          if (id !== 'bleed' && fx.chance(0.6)) g.world.burst(this.x, this.y + this.height * 0.6, this.z, ELEMENTS[el].light, 3, { speed: 1, up: 1.5, gravity: -1 });
        }
      }
      if (s.t <= 0) delete this.status[id];
      if (this.dead) return;
    }
  }

  // ---------------------------------------------------------------- rendering
  submit(batcher, cam) {
    if (this.gibbed) return;          // exploded into gore (see gore.js)
    const info = this.sprite;
    if (!info.handle.ready) return;
    const g = this.game;
    // 8-way facing relative to the camera
    const rel = wrapAngle(Math.atan2(cam.z - this.z, cam.x - this.x) - this.yaw);
    let dir = ((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8;
    const flip = (this.flipT || 0) > 0.5;
    if (flip) dir = (8 - dir) % 8;
    let act = ACT.idle;
    if (this.dead) act = ACT.recover;
    else if (this.state === 'attack') act = this.phase === 'windup' ? ACT.windup : this.phase === 'strike' ? ACT.attack : ACT.recover;
    else if (this.state === 'charge') act = ACT.windup + (Math.floor(this.animT * 8) % 2);
    else if (this.state === 'pain') act = ACT.windup;
    else if (this.moving || this.trans || this.def.flying) act = ACT.walk + (Math.floor(this.animT * this.speed * 2.2) % 4);
    if (this.frozen > 0) act = ACT.idle;
    const uv = g.content.monsterUV(info, dir, Math.min(act, info.cols - 1));
    const qh = this.height * this.visScale * info.frameH / Math.max(1, info.footY);
    const qw = qh * info.frameW / info.frameH;
    const anchor = (info.frameH - info.footY) / info.frameH;
    let tint = this.tint;
    const st = this.status;
    if (this.frozen > 0) tint = [0.55, 0.85, 1.5];
    else if (st.burn) tint = mul(tint, STATUS.burn.tint);
    else if (st.poison) tint = mul(tint, STATUS.poison.tint);
    else if (st.chill) tint = mul(tint, STATUS.chill.tint);
    else if (st.hex) tint = mul(tint, STATUS.hex.tint);
    let glow = this.glow;
    if (this.elite) { const k = 0.08 + 0.06 * Math.sin(g.time * 5); glow = [glow[0] + k * 1.6, glow[1] + k * 1.1, glow[2] + k * 0.2]; }
    if (this.boss && this.awake) { const k = 0.05 + 0.04 * Math.sin(g.time * 3); glow = [glow[0] + k, glow[1] + k * 0.2, glow[2] + k * 0.1]; }
    const flash = this.flash > 0 ? 0.65 : 0;
    let dissolve = 0;
    if (this.dead) dissolve = Math.min(1, this.deathT / 0.9) * (this.goreDissolve ? -1 : 1);   // negative: blood-red edges
    if (this.state === 'tp_out') dissolve = 1 - this.stateT / 0.22;
    if (this.state === 'tp_in') dissolve = this.stateT / 0.22;
    let x = this.x, y = this.y, z = this.z, rot = 0;
    const fl = this.flipT || 0;
    if (fl > 0) { rot = Math.PI * fl; if (fl > 0.5) y = this.y + this.height; }
    if (this.lift > 0.05 && this.wallDir && this.mode === 'wall') {
      // rotate so the feet point at the wall (as seen from the camera)
      const rx = -Math.sin(cam.yaw), rz = Math.cos(cam.yaw);
      const side = this.wallDir[0] * rx + this.wallDir[1] * rz;
      rot = side > 0 ? Math.PI / 2 * Math.min(1, this.lift / 0.9) : -Math.PI / 2 * Math.min(1, this.lift / 0.9);
      x += this.wallDir[0] * 0.15; z += this.wallDir[1] * 0.15;
      y = this.y - this.lift + 0.5 + qh * 0.0;
    }
    if (this.dead) y -= Math.min(0.3, this.deathT * 0.3);
    const light = g.world.grid.light[g.world.grid.cellAt(this.x, this.z)] ?? 0.7;
    batcher.add(info.handle, MODE.CUTOUT, x, y, z, qw, qh, {
      uv, tint, glow: [glow[0], glow[1], glow[2], flash], hue: this.hue, sat: this.sat, anchorY: anchor, rot, dissolve, light,
    });
    // elemental aura
    if (this.elemental && this.elemental !== 'physical' && !this.dead) {
      const c = ELEMENTS[this.elemental].light;
      batcher.add(g.content.fx, MODE.ADD, x, y + this.height * 0.5 * (fl > 0.5 ? -1 : 1), z, qw * 1.1, qh * 0.9, { uv: [0, 0, 0.25, 1], tint: [c[0], c[1], c[2], 0.18 + 0.06 * Math.sin(g.time * 4 + this.x)], anchorY: 0.5, fullbright: true });
    }
  }
}

function mul(a, b) { return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]; }
function turnToward(a, b, step) {
  const d = wrapAngle(b - a);
  return a + clamp(d, -step, step);
}
