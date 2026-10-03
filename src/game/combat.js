// Damage, status effects, projectiles (player + enemy) and loot drops.
import { ARCHETYPES } from '../data/weapons.js';
import { ELEMENTS, STATUS } from '../data/elements.js';
import { REAGENTS, UNIVERSAL_DROPS, BOSS_UNIVERSAL_DROPS } from '../data/reagents.js';
import { RARITY } from '../data/rarities.js';
import * as B from '../data/balance.js';
import { generateItem, rollItemLevel, upgradedDamage, patternN } from './items.js';
import { fx, Rng } from '../core/rng.js';
import { clamp, hexToRgb } from '../core/math.js';
import { MODE } from './spritebatch.js';

const elemColor = (e) => ELEMENTS[e]?.light || [1, 0.85, 0.55];

// ---------------------------------------------------------------- damage to monsters
export function damageMonster(game, m, amount, o = {}) {
  if (m.dead || amount <= 0) return 0;
  const p = game.player, st = p.stats;
  let dmg = amount;
  const el = o.element || 'physical';
  // resistances (monster def + variant), hex vulnerability, rend armor shred
  const res = (m.resist[el] || 0);
  dmg *= 1 - clamp(res, -1, 0.9);
  if (m.status.hex) dmg *= 1 + STATUS.hex.vulnerability;
  let armor = m.armor;
  if (m.status.rend) armor *= 1 - STATUS.rend.armorShred;
  if (!o.trueDamage) dmg *= 1 - B.monsterReduction(armor, p.level);
  if (m.status.smite && STATUS.smite.bonusVs[m.def.category]) dmg *= 1 + STATUS.smite.bonusVs[m.def.category];
  if (m.shield && o.dir) {
    // front-facing shield blocks part of the damage
    const fdot = Math.cos(m.yaw) * -o.dir[0] + Math.sin(m.yaw) * -o.dir[1];
    if (fdot > 0.5 && m.state !== 'attack') dmg *= 1 - m.shield;
  }
  dmg = Math.max(1, dmg);
  m.hp -= dmg;
  m.flash = 0.08;
  m.alerted = true;
  if (!o.isDot) {
    m.lastHitT = game.time;
    if (o.dir && m.def.boss !== true) { m.kx += o.dir[0] * (o.knock || 0.6); m.kz += o.dir[1] * (o.knock || 0.6); }
    if (!m.def.boss && fx.chance(0.25) && m.state !== 'attack') { m.state = 'pain'; m.stateT = 0.18; }
    game.sfx(m.def.category === 'robot' || m.def.category === 'construct' ? 'hit_metal' : 'hit', { dist: m.distToPlayer, pitch: o.crit ? 1.3 : 1 });
    // blood spray (merged per monster per frame: shotgun pellets make one big spray)
    if (game.world.gore) game.world.gore.hit(m, o);
  }
  game.damageNumber(m.x, m.y + m.height + 0.2, m.z, dmg, o.crit, o.isDot ? ELEMENTS[el]?.color : o.crit ? '#ffe040' : '#ffffff');
  // on-hit status
  if (!o.isDot && !o.noProc) {
    const chance = (o.statusChance || 0) * (1 + st.statusChance) + (el !== 'physical' ? st.statusChance * 0.5 : 0);
    if (el !== 'physical' && fx.chance(chance)) applyStatus(game, m, ELEMENTS[el].status, dmg, o);
    const ab = st.abilities;
    if (ab.ignite && fx.chance(ab.ignite)) applyStatus(game, m, 'burn', dmg, o);
    if (ab.deep_freeze && fx.chance(ab.deep_freeze)) { m.frozen = Math.max(m.frozen, 1.6); }
    if (ab.chain_lightning && fx.chance(ab.chain_lightning)) chainLightning(game, m, dmg * 0.5, 3);
    if (o.chain) chainLightning(game, m, dmg * 0.45, o.chain);
    // life steal
    const ls = st.lifeSteal;
    if (ls > 0) p.heal(dmg * ls * (o.pellets ? 1 / Math.sqrt(o.pellets) : 1));
  }
  if (m.hp <= 0) killMonster(game, m, o);
  return dmg;
}

export function applyStatus(game, m, id, baseDmg, o = {}) {
  const s = STATUS[id];
  if (!s) return;
  const cur = m.status[id];
  switch (id) {
    case 'burn': case 'poison': case 'bleed': {
      const stacks = id === 'poison' ? Math.min(s.maxStacks, (cur?.stacks || 0) + 1) : 1;
      m.status[id] = { t: s.duration, tick: 0, dps: Math.max(1, baseDmg * s.dotPct / s.tick) * stacks, stacks };
      break;
    }
    case 'chill': {
      const stacks = (cur?.stacks || 0) + 1;
      m.status.chill = { t: s.duration, stacks };
      if (stacks >= s.freezeStacks) { m.frozen = s.freezeTime; m.status.chill.stacks = 0; game.world.burst(m.x, m.y + m.height * 0.5, m.z, [0.6, 0.9, 1], 14, { speed: 3 }); }
      break;
    }
    case 'shock': chainLightning(game, m, baseDmg * s.chainPct, s.chainCount); break;
    case 'melt': explode(game, m.x, m.y + m.height * 0.5, m.z, s.splash, baseDmg * s.splashPct, 'plasma', 'player', { skip: m, small: true }); break;
    case 'smite': m.status.smite = { t: 0.5 }; game.world.burst(m.x, m.y + m.height, m.z, [1, 1, 0.7], 6, { speed: 2, up: 2 }); break;
    default: m.status[id] = { t: s.duration };
  }
  void o;
}

export function chainLightning(game, from, dmg, count) {
  const w = game.world;
  let src = from;
  const hit = new Set([from]);
  for (let k = 0; k < count; k++) {
    let best = null, bd = 4.5 * 4.5;
    for (const m of w.monsters) {
      if (m.dead || hit.has(m)) continue;
      const d = (m.x - src.x) ** 2 + (m.z - src.z) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) break;
    hit.add(best);
    w.beam(src.x, src.y + src.height * 0.6, src.z, best.x, best.y + best.height * 0.6, best.z, [0.7, 0.8, 1], 0.07, 0.18, 0.25);
    damageMonster(game, best, dmg, { element: 'lightning', noProc: true });
    src = best;
  }
  if (hit.size > 1) game.sfx('zap', { volume: 0.6 });
}

// ---------------------------------------------------------------- damage to the player
export function damagePlayer(game, amount, element = 'physical', o = {}) {
  const p = game.player;
  if (p.dead || p.invuln > 0 || game.state !== 'playing') return 0;
  const st = p.stats;
  let dmg = amount * (1 - B.armorReduction(st.armor + p.tempArmor, Math.max(1, game.world.depth)));
  dmg *= 1 - (st.res[element] || 0);
  if (st.abilities.last_stand && p.hp < p.maxHp * 0.3) dmg *= 1 - st.abilities.last_stand;
  dmg = Math.max(1, Math.round(dmg));
  if (p.shield > 0) { const s = Math.min(p.shield, dmg); p.shield -= s; dmg -= s; }
  p.hp -= dmg;
  p.hurtT = 0.35;
  p.lastHurt = game.time;
  game.post.flash = [0.8, 0.0, 0.0, Math.min(0.45, 0.12 + dmg / p.maxHp)];
  game.shake(Math.min(0.35, 0.05 + dmg / p.maxHp));
  game.sfx('player_hurt');
  if (o.melee && o.source && game.lens) game.lens.onMeleeHit(o.source);
  if (o.source && st.abilities.thorns_aura && o.melee) damageMonster(game, o.source, dmg * st.abilities.thorns_aura, { trueDamage: true, noProc: true });
  if (o.source && st.thorns > 0 && o.melee) damageMonster(game, o.source, st.thorns * (1 + p.level * 0.1), { trueDamage: true, noProc: true });
  if (st.abilities.retaliation && p.retaliateCD <= 0) {
    p.retaliateCD = 4;
    explode(game, p.x, p.y + 0.6, p.z, 3.2, p.weaponDamageRef() * st.abilities.retaliation, 'arcane', 'player', { color: [0.8, 0.4, 1] });
  }
  if (st.abilities.vengeance) p.vengeanceT = 4;
  if (o.status === 'chill') p.slowT = 1.2;
  if (o.status === 'burn') p.burnT = 2.5;
  if (p.hp <= 0) {
    if (st.abilities.second_wind && !p.secondWindUsed) {
      p.secondWindUsed = true;
      p.hp = p.maxHp * st.abilities.second_wind;
      p.invuln = 1.5;
      game.toast('SECOND WIND!', '#ff4040');
      game.world.burst(p.x, p.y + 0.8, p.z, [1, 0.2, 0.2], 30, { speed: 6 });
    } else {
      p.hp = 0;
      game.playerDied();
    }
  }
  return dmg;
}

// ---------------------------------------------------------------- explosions
export function explode(game, x, y, z, radius, dmg, element, owner, o = {}) {
  const w = game.world;
  const col = o.color || (element === 'physical' ? [1, 0.55, 0.15] : elemColor(element));
  w.flash(x, y, z, col, radius * 3.5, 0.25, 2.2);
  w.burst(x, y, z, col, o.small ? 10 : 26, { speed: radius * 4, life: 0.6, size: 0.25, gravity: 2 });
  w.burst(x, y, z, [0.35, 0.33, 0.32], o.small ? 3 : 8, { speed: radius * 1.2, life: 1.2, size: 0.6, cell: 2, add: false, gravity: -1.5, drag: 2 });
  if (w.gore) w.gore.scorch(x, y, z, radius, o.small);
  if (!o.silent) game.sfx(o.small ? 'hit' : 'explosion', { dist: Math.hypot(x - game.player.x, z - game.player.z), pitch: o.small ? 1.5 : 1 });
  if (!o.small) game.shake(clamp(0.5 - Math.hypot(x - game.player.x, z - game.player.z) * 0.04, 0, 0.4));
  if (owner === 'player') {
    for (const m of w.monsters) {
      if (m.dead || m === o.skip) continue;
      const d = Math.hypot(m.x - x, (m.y + m.height * 0.5) - y, m.z - z);
      if (d > radius + m.radius) continue;
      // no damage through walls / floors: the blast needs a line to the body or the head
      if (!w.los(x, y, z, m.x, m.y + m.height * 0.5, m.z) && !w.los(x, y, z, m.x, m.y + m.height * 0.9, m.z)) continue;
      const k = 1 - Math.max(0, d - m.radius) / radius * 0.6;
      const dir = [(m.x - x) / (d || 1), (m.z - z) / (d || 1)];
      damageMonster(game, m, dmg * k, { element, dir, knock: 1.5, statusChance: o.statusChance || 0.15, crit: o.crit, explosive: true });
    }
  } else {
    const p = game.player;
    const d = Math.hypot(p.x - x, (p.y + 0.6) - y, p.z - z);
    if (d < radius + p.radius && (w.los(x, y, z, p.x, p.y + 0.8, p.z) || w.los(x, y, z, p.x, p.y + 1.4, p.z))) damagePlayer(game, dmg * (1 - Math.max(0, d - p.radius) / radius * 0.6), element, { status: ELEMENTS[element]?.status });
  }
}

// ---------------------------------------------------------------- projectiles
function projVisual(game, element, kind, seed = 0) {
  const c = game.content;
  const rid = c.playerProjectileId(kind, element, seed);
  if (rid && kind !== 'flame' && kind !== 'beam' && kind !== 'rail') {
    const s = c.projSprite(rid);
    if (s.real) return { ...s, color: element === 'physical' ? (kind === 'bullet' || kind === 'pellet' ? [1, 0.85, 0.5] : s.color) : elemColor(element) };
  }
  if (kind === 'bullet' || kind === 'pellet' || kind === 'rail') return { ...c.fxSprite(0), color: element === 'physical' ? [1, 0.85, 0.5] : elemColor(element) };
  if (kind === 'flame') return { ...c.fxSprite(2), color: element === 'physical' ? [1, 0.5, 0.15] : elemColor(element) };
  if (kind === 'grenade') return { ...c.fxSprite(0), color: [0.35, 0.4, 0.3], dark: true };
  const ids = kind === 'disc' ? ['steel_star', ...(ELEMENTS[element]?.proj || [])] : kind === 'rocket' ? ['amber_prism', 'solar_vortex', 'inferno_orb'] : (ELEMENTS[element]?.proj || []);
  for (const id of ids) {
    const s = c.projSprite(id);
    if (s.real) return { ...s, color: element === 'physical' ? s.color : elemColor(element) };
  }
  return { ...c.fxSprite(0), color: elemColor(element) };
}

export function spawnProjectile(game, p) {
  if (game.world.projectiles.length > 900) return null;
  p.age = 0;
  p.hit = p.hit || new Set();
  p.bx = p.x; p.by = p.y; p.bz = p.z;
  game.world.projectiles.push(p);
  return p;
}

// Player fires `weapon` along the camera direction.
export function firePlayerWeapon(game, weapon) {
  const p = game.player, st = p.stats;
  const arch = ARCHETYPES[weapon.archetype] || ARCHETYPES.rifle;
  const el = weapon.element;
  const yaw = p.yaw, pitch = p.pitch;
  const fwd = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)];
  const right = [-Math.sin(yaw), 0, Math.cos(yaw)];
  const up = [-Math.cos(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.sin(yaw) * Math.sin(pitch)];
  const eye = p.eyePos();
  // muzzle slightly right/below the eye
  // shots leave from the sprite's on-screen muzzle when known (projected 0.35 in front of the eye)
  const ndc = p.muzzleNDC, tanV = Math.tan((((game.settings?.fov) || 80) * Math.PI) / 360), asp = game.renderer.lowW / game.renderer.lowH;
  const mr = ndc ? Math.max(-0.4, Math.min(0.4, ndc[0] * tanV * asp * 0.35)) : 0.12, mu = ndc ? Math.max(-0.3, Math.min(0.1, ndc[1] * tanV * 0.35)) : -0.14;
  const mz = [eye[0] + fwd[0] * 0.35 + right[0] * mr + up[0] * mu, eye[1] + fwd[1] * 0.35 + up[1] * mu, eye[2] + fwd[2] * 0.35 + right[2] * mr + up[2] * mu];
  const ab = st.abilities;
  p.shotCount++;
  let critForced = false;
  if (ab.overcharge && p.shotCount % Math.max(3, Math.round(ab.overcharge)) === 0) critForced = true;
  const baseDmg = p.computeHitDamage(weapon);
  const pat = (id) => patternN(weapon, id);
  const has = (id) => weapon.patterns?.some((x) => x.id === id);

  // melee
  if (arch.melee) {
    const range = arch.melee.range * (has('big') ? 1.4 : 1), arc = arch.melee.arc;
    let hits = 0;
    for (const m of game.world.monsters) {
      if (m.dead) continue;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > range + m.radius) continue;
      const a = Math.atan2(dz, dx) - yaw;
      const da = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (da > arc / 2 && d > m.radius + 0.3) continue;
      if (m.y > p.y + 1.6 || m.y + m.height < p.y - 0.4) continue;
      const crit = critForced || fx.chance(st.critChance);
      damageMonster(game, m, baseDmg * (crit ? st.critMult * (critForced ? 2 : 1) : 1), { element: el, crit, dir: [dx / (d || 1), dz / (d || 1)], knock: (arch.melee.knockback || 2) * 0.3, statusChance: weapon.statusChance, chain: has('chain') ? 2 : 0, melee: true });
      hits++;
    }
    if (hits) game.shake(0.08);
    if (has('nova') && p.shotCount % 5 === 0) novaRing(game, mz, baseDmg * 0.6, el, 12);
    return;
  }

  // hitscan (rail / lightning)
  if (arch.hitscan) {
    const range = arch.range || 60;
    const spreadPel = Math.max(1, 1 + pat('fan') + (ab.multishot || 0));
    for (let k = 0; k < spreadPel; k++) {
      const off = spreadPel > 1 ? (k / (spreadPel - 1) - 0.5) * 0.25 : 0;
      const d = rotateDir(fwd, right, up, off, 0);
      hitscan(game, mz, eye, d, range, baseDmg, el, weapon, arch, critForced);
    }
    if (has('nova') && p.shotCount % 5 === 0) novaRing(game, mz, baseDmg * 0.6, el, 12);
    return;
  }

  // projectile weapons
  const vis = projVisual(game, el, arch.proj, weapon.seed || 0);
  let pellets = Math.max(1, arch.pellets || 1) + (ab.multishot || 0);
  const fanN = pat('fan'), ringN = pat('burst_ring');
  const dirs = [];
  if (ringN) {
    for (let k = 0; k < ringN; k++) dirs.push(rotateDir(fwd, right, up, (k / ringN) * Math.PI * 2, 0));
  } else {
    const fanCount = fanN || 1;
    const fanSpread = fanN ? 0.12 * Math.sqrt(fanN) : (arch.fan || 0);
    const fanEach = (arch.fan && pellets > 1) ? pellets : fanCount;
    if (arch.fan && pellets > 1 && !fanN) {
      for (let k = 0; k < pellets; k++) dirs.push(rotateDir(fwd, right, up, (k / (pellets - 1) - 0.5) * arch.fan, 0));
      pellets = 1;
    } else {
      for (let f = 0; f < fanEach; f++) {
        const fo = fanCount > 1 ? (f / (fanCount - 1) - 0.5) * fanSpread * 2 : 0;
        for (let k = 0; k < pellets; k++) {
          const s = arch.spread * (p.moving ? 1.3 : 1);
          dirs.push(rotateDir(fwd, right, up, fo + fx.gauss() * s, fx.gauss() * s * 0.7));
        }
      }
    }
  }
  const speedMul = st.projSpeed * (has('big') ? 0.6 : 1);
  const dmgEach = baseDmg * (has('big') ? 1.6 : 1) / (dirs.length > 6 && !arch.pellets ? Math.sqrt(dirs.length / 6) : 1);
  dirs.forEach((d, idx) => {
    const speed = (arch.speed || 40) * speedMul;
    const crit = critForced || fx.chance(st.critChance);
    const base = {
      owner: 'player', x: mz[0], y: mz[1], z: mz[2], vx: d[0] * speed, vy: d[1] * speed, vz: d[2] * speed, speed,
      dmg: dmgEach * (crit ? st.critMult * (critForced ? 2 : 1) : 1), crit, element: el, statusChance: weapon.statusChance,
      radius: arch.proj === 'flame' ? 0.3 : 0.12, life: arch.life || (arch.proj === 'grenade' ? arch.fuse || 2 : 3),
      vis, size: { bullet: 0.09, pellet: 0.07, rocket: 0.4, grenade: 0.22, orb: 0.32, flame: 0.35, disc: 0.4 }[arch.proj] || 0.25,
      kind: arch.proj, pierce: (arch.pierce || 0) + (has('pierce') ? 3 : 0) + (ab.piercing || 0),
      bounces: (arch.bounces || 0) + (arch.ricochet || 0) + (has('bounce') ? 6 : 0) + (ab.ricochet || 0),
      gravity: arch.gravity || (has('bounce') ? 6 : 0), explode: arch.explode || (has('explosive') ? 1.6 : 0),
      fuse: arch.proj === 'grenade', nails: arch.nails, nailDamage: arch.nailDamage ? arch.nailDamage * baseDmg / arch.damage : 0,
      homing: has('homing') ? 5 : (ab.homing ? ab.homing : 0), chain: has('chain') ? 2 : 0,
      split: has('split') ? 0.22 : 0, pellets: dirs.length, weapon,
      light: arch.proj === 'bullet' || arch.proj === 'pellet' ? null : vis.color, grow: arch.proj === 'flame' ? 3 : 0,
      spin: arch.proj === 'disc' ? 18 : 3,
    };
    if (has('big')) base.size *= 2;
    if (has('wave')) base.pattern = { type: 'wave', amp: 0.35, freq: 13, phase: idx * 1.3 };
    if (has('curve')) base.curve = (idx % 2 ? 1 : -1) * 1.6;
    if (has('orbit')) base.pattern = { type: 'orbit', amp: 0.25, freq: 14, phase: idx * 0.7, grow: 1.5 };
    if (has('helix')) {
      spawnProjectile(game, { ...base, pattern: { type: 'helix', amp: 0.3, freq: 15, phase: 0 } });
      spawnProjectile(game, { ...base, hit: new Set(), pattern: { type: 'helix', amp: 0.3, freq: 15, phase: Math.PI } });
    } else if (has('slider')) {
      // floor + ceiling pair joined by an energy beam
      const f = game.world.floorAt(p.x, p.z) ?? p.y;
      const c = Math.min(game.world.ceilingOver(p.x, p.z, 0.3, f), f + 4);
      const pairId = fx.int(1, 1e9);
      const flat = Math.hypot(d[0], d[2]) || 1;
      const hv = [d[0] / flat * speed * 0.8, 0, d[2] / flat * speed * 0.8];
      spawnProjectile(game, { ...base, y: f + 0.15, vx: hv[0], vy: 0, vz: hv[2], slide: 'floor', pairId, gravity: 0, bounces: 8, life: 2.5, dmg: base.dmg * 0.6 });
      spawnProjectile(game, { ...base, hit: new Set(), y: c - 0.15, vx: hv[0], vy: 0, vz: hv[2], slide: 'ceil', pairId, gravity: 0, bounces: 8, life: 2.5, dmg: base.dmg * 0.6 });
    } else spawnProjectile(game, base);
  });
  if (has('nova') && p.shotCount % 5 === 0) novaRing(game, mz, baseDmg * 0.6, el, 12);
}

function novaRing(game, at, dmg, el, n) {
  const vis = projVisual(game, el === 'physical' ? 'arcane' : el, 'orb');
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    spawnProjectile(game, { owner: 'player', x: at[0], y: at[1] - 0.2, z: at[2], vx: Math.cos(a) * 14, vy: 0, vz: Math.sin(a) * 14, dmg, element: el === 'physical' ? 'arcane' : el, radius: 0.2, life: 1.2, vis, size: 0.35, kind: 'orb', pierce: 2, bounces: 0, light: vis.color, spin: 4 });
  }
}

function rotateDir(f, r, u, yawOff, pitchOff) {
  const cy = Math.cos(yawOff), sy = Math.sin(yawOff), cp = Math.cos(pitchOff), sp = Math.sin(pitchOff);
  const d = [
    (f[0] * cy + r[0] * sy) * cp + u[0] * sp,
    (f[1] * cy + r[1] * sy) * cp + u[1] * sp,
    (f[2] * cy + r[2] * sy) * cp + u[2] * sp,
  ];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
}

function hitscan(game, muzzle, eye, d, range, dmg, el, weapon, arch, critForced) {
  const w = game.world, st = game.player.stats;
  const wall = w.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], range);
  const maxD = wall ? wall.dist : range;
  // collect monsters along the ray
  const hits = [];
  for (const m of w.monsters) {
    if (m.dead) continue;
    const t = rayCylinder(eye, d, m);
    if (t !== null && t < maxD) hits.push({ m, t });
  }
  hits.sort((a, b) => a.t - b.t);
  const pierce = (arch.pierce ?? 0) + (weapon.patterns?.some((x) => x.id === 'pierce') ? 3 : 0) + (st.abilities.piercing || 0);
  let endT = maxD;
  let n = 0;
  for (const h of hits) {
    const crit = critForced || fx.chance(st.critChance);
    damageMonster(game, h.m, dmg * (crit ? st.critMult * (critForced ? 2 : 1) : 1), { element: el, crit, dir: [d[0], d[2]], knock: arch.proj === 'rail' ? 1.2 : 0.2, statusChance: weapon.statusChance, chain: arch.chain || (weapon.patterns?.some((x) => x.id === 'chain') ? 2 : 0), hitPos: [eye[0] + d[0] * h.t, eye[1] + d[1] * h.t, eye[2] + d[2] * h.t] });
    n++;
    if (n > pierce) { endT = h.t; break; }
  }
  const ex = eye[0] + d[0] * endT, ey = eye[1] + d[1] * endT, ez = eye[2] + d[2] * endT;
  const col = el === 'physical' ? [0.7, 0.85, 1] : elemColor(el);
  if (arch.proj === 'beam') w.beam(muzzle[0], muzzle[1], muzzle[2], ex, ey, ez, col, 0.06, 0.06, 0.22);
  else { w.beam(muzzle[0], muzzle[1], muzzle[2], ex, ey, ez, col, 0.09, 0.35, 0); w.beam(muzzle[0], muzzle[1], muzzle[2], ex, ey, ez, [1, 1, 1], 0.04, 0.2, 0.05); }
  if (wall && n <= pierce) { w.burst(ex, ey, ez, col, 6, { speed: 3 }); w.flash(ex, ey, ez, col, 2.5, 0.1); }
}

// ray vs monster vertical cylinder; returns distance or null
export function rayCylinder(o, d, m) {
  const ox = o[0] - m.x, oz = o[2] - m.z;
  const a = d[0] * d[0] + d[2] * d[2];
  const b = 2 * (ox * d[0] + oz * d[2]);
  const r = m.radius + 0.05;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-6) return null;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
    if (t < 0) continue;
    const y = o[1] + d[1] * t;
    if (y >= m.y - 0.05 && y <= m.y + m.height + 0.05) return t;
  }
  return null;
}

// Enemy shot toward a target point
export function fireEnemyProjectile(game, m, spec, from, target, o = {}) {
  const dx = target[0] - from[0], dy = target[1] - from[1], dz = target[2] - from[2];
  const d = Math.hypot(dx, dy, dz) || 1;
  let dir = [dx / d, dy / d, dz / d];
  if (o.yawOff || o.pitchOff) {
    const yaw = Math.atan2(dir[2], dir[0]) + (o.yawOff || 0);
    const pitch = Math.asin(clamp(dir[1], -1, 1)) + (o.pitchOff || 0);
    dir = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)];
  }
  const speed = (spec.speed || 12) * (o.speedMul || 1);
  const vis = game.content.projSprite(m.projSpriteId || spec.sprite);
  const color = spec.light || (vis.real ? vis.color : elemColor(spec.element));
  if (spec.beam) {
    // instant beam with a short telegraph already done during windup
    const w = game.world;
    const hit = w.raycast(from[0], from[1], from[2], dir[0], dir[1], dir[2], 40);
    const len = hit ? hit.dist : 40;
    const p = game.player;
    const t = rayCylinder(from, dir, { x: p.x, z: p.z, y: p.y, height: p.height, radius: p.radius + 0.1 });
    w.beam(from[0], from[1], from[2], from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len, color, 0.1, 0.25, 0.06);
    if (t !== null && t < len) damagePlayer(game, m.dmg * (spec.dmgMul || 1), spec.element, { status: ELEMENTS[spec.element]?.status });
    return null;
  }
  return spawnProjectile(game, {
    owner: 'enemy', source: m, x: from[0], y: from[1], z: from[2], vx: dir[0] * speed, vy: dir[1] * speed, vz: dir[2] * speed, speed,
    dmg: m.dmg * (spec.dmgMul || 1) * (o.dmgMul || 1), element: spec.element || 'physical', radius: 0.18 * (spec.size || 0.5) / 0.5,
    life: spec.life || 5, vis: { ...vis, color: vis.real ? [1, 1, 1] : color }, size: spec.size || 0.5, kind: 'orb',
    light: color, spin: spec.spin || 3, explode: spec.explode || 0, homing: spec.homing || 0, pierce: spec.pierce || 0,
    pattern: spec.pattern === 'wave' ? { type: 'wave', amp: 0.6, freq: 6, phase: fx.float(0, 6) } : null, grow: spec.life && spec.life < 1 ? 1.2 : 0,
  });
}

// ---------------------------------------------------------------- projectile update
export function updateProjectiles(game, dt) {
  const w = game.world, p = game.player;
  const alive = [];
  const pairs = new Map();
  const list = w.projectiles;
  w.projectiles = [];          // projectiles spawned during the update land here
  for (const pr of list) {
    if (pr.dead) continue;
    pr.age += dt;
    if (pr.age > pr.life) {
      if (pr.fuse || (pr.explode && pr.kind === 'rocket')) detonate(game, pr);
      continue;
    }
    // steering
    if (pr.homing) {
      const tgt = pr.owner === 'player' ? nearestMonster(w, pr.x, pr.z, 14, pr.hit) : { x: p.x, y: p.y + 0.6, z: p.z };
      if (tgt) {
        const ty = tgt.y + (tgt.height ? tgt.height * 0.55 : 0);
        const dx = tgt.x - pr.x, dy = ty - pr.y, dz = tgt.z - pr.z, d = Math.hypot(dx, dy, dz) || 1;
        const k = Math.min(1, pr.homing * dt);
        const sp = Math.hypot(pr.vx, pr.vy, pr.vz);
        pr.vx += (dx / d * sp - pr.vx) * k; pr.vy += (dy / d * sp - pr.vy) * k; pr.vz += (dz / d * sp - pr.vz) * k;
      }
    }
    if (pr.curve) {
      const a = pr.curve * dt * Math.max(0, 1 - pr.age * 0.8);
      const c = Math.cos(a), s = Math.sin(a);
      const vx = pr.vx * c - pr.vz * s; pr.vz = pr.vx * s + pr.vz * c; pr.vx = vx;
    }
    if (pr.gravity) pr.vy -= pr.gravity * dt;
    // split once
    if (pr.split && pr.age > pr.split) {
      pr.split = 0;
      for (const off of [-0.35, 0.35]) {
        const c = Math.cos(off), s = Math.sin(off);
        spawnProjectile(game, { ...pr, vx: pr.vx * c - pr.vz * s, vz: pr.vx * s + pr.vz * c, hit: new Set(pr.hit), split: 0, dmg: pr.dmg * 0.6, age: 0 });
      }
      pr.dmg *= 0.6;
    }
    // integrate base position with substeps
    const sp = Math.hypot(pr.vx, pr.vy, pr.vz);
    const steps = Math.max(1, Math.ceil(sp * dt / 0.3));
    const sdt = dt / steps;
    let removed = false;
    for (let k = 0; k < steps && !removed; k++) {
      const sx = pr.vx * sdt, sy = pr.vy * sdt, sz = pr.vz * sdt;
      const nx = pr.bx + sx, ny = pr.by + sy, nz = pr.bz + sz;
      // sweep the segment (exact: thin rails of boxes / steps are not tunnelled)
      const seg = Math.sqrt(sx * sx + sy * sy + sz * sz);
      let ht = seg > 1e-6 ? w.castRay(pr.bx, pr.by, pr.bz, sx / seg, sy / seg, sz / seg, seg) : -1;
      const hn = w.rayHit;
      if (ht >= 0 && pr.slide && Math.abs(hn.ny) > 0.5) ht = -1;   // sliders follow floors / ramps / ceilings
      if (ht >= 0) {
        const hx = hn.x + hn.nx * 0.02, hy = hn.y + hn.ny * 0.02, hz = hn.z + hn.nz * 0.02;
        const nX = hn.nx, nY = hn.ny, nZ = hn.nz;
        if (pr.slide) {
          // keep sliding along floor/ceiling; bounce off walls
          const fl = Math.hypot(nX, nZ) || 1, ux = nX / fl, uz = nZ / fl;
          const vn = pr.vx * ux + pr.vz * uz;
          if (vn < 0) { pr.vx -= 2 * vn * ux; pr.vz -= 2 * vn * uz; }
          if (pr.bounces-- <= 0) { removed = true; break; }
          continue;
        }
        if (pr.bounces > 0) {
          // reflect: v -= 2 (v.n) n, with some energy lost into the surface
          const vn = pr.vx * nX + pr.vy * nY + pr.vz * nZ;
          if (vn < 0) {
            const tx = pr.vx - vn * nX, ty = pr.vy - vn * nY, tz = pr.vz - vn * nZ;
            if (pr.fuse && nY > 0.6 && -vn < 2.5) {
              // grenade settling on the ground: roll instead of spending a bounce
              pr.vx = tx * 0.85; pr.vy = ty * 0.85; pr.vz = tz * 0.85;
            } else {
              pr.bounces--;
              const rest = pr.fuse ? 0.5 : 0.85, keep = pr.fuse ? 0.75 : 0.92;
              pr.vx = tx * keep - vn * nX * rest; pr.vy = ty * keep - vn * nY * rest; pr.vz = tz * keep - vn * nZ * rest;
              if (pr.fuse) game.sfx('wall_hit', { dist: dist2p(pr, p), pitch: 0.6 });
            }
          }
          pr.bx = hx; pr.by = hy; pr.bz = hz;
          pr.x = hx; pr.y = hy; pr.z = hz;
          continue;
        }
        // stop at the surface (explosions / impact effects happen there, not past it)
        pr.bx = pr.x = hx; pr.by = pr.y = hy; pr.bz = pr.z = hz;
        pr.hitNormal = [nX, nY, nZ];
        if (pr.explode || pr.fuse) detonate(game, pr);
        else impact(game, pr);
        removed = true;
        break;
      }
      pr.bx = nx; pr.by = ny; pr.bz = nz;
      // slider pair keeps to its surface
      if (pr.slide === 'floor') { const f = w.floorAt(pr.bx, pr.bz); if (f !== null) pr.by = f + 0.15; }
      if (pr.slide === 'ceil') { const c = w.ceilingOver(pr.bx, pr.bz, 0.1, pr.by - 1.5); if (c < 50) pr.by = c - 0.15; }
      // pattern offset
      pr.x = pr.bx; pr.y = pr.by; pr.z = pr.bz;
      if (pr.pattern) {
        const pt = pr.pattern;
        const fl = Math.hypot(pr.vx, pr.vz) || 1;
        const rx = -pr.vz / fl, rz = pr.vx / fl;
        const ph = pr.age * pt.freq + pt.phase;
        const amp = pt.amp * (pt.grow ? 1 + pr.age * pt.grow : 1) * Math.min(1, pr.age * 8);
        if (pt.type === 'wave') { pr.x += rx * Math.sin(ph) * amp; pr.z += rz * Math.sin(ph) * amp; }
        else { pr.x += rx * Math.cos(ph) * amp; pr.z += rz * Math.cos(ph) * amp; pr.y += Math.sin(ph) * amp; }
      }
      // hits
      if (pr.owner === 'player') {
        for (const m of w.monsters) {
          if (m.dead || pr.hit.has(m)) continue;
          const dx = m.x - pr.x, dz = m.z - pr.z;
          const r = m.radius + pr.radius;
          if (dx * dx + dz * dz > r * r || pr.y < m.y - pr.radius || pr.y > m.y + m.height + pr.radius) continue;
          pr.hit.add(m);
          if (pr.explode && pr.pierce <= 0) { detonate(game, pr); removed = true; break; }
          const fl = Math.hypot(pr.vx, pr.vz) || 1;
          damageMonster(game, m, pr.dmg, { element: pr.element, crit: pr.crit, dir: [pr.vx / fl, pr.vz / fl], statusChance: pr.statusChance, chain: pr.chain, pellets: pr.pellets, hitPos: [pr.x, pr.y, pr.z] });
          if (pr.pierce-- <= 0) { removed = true; break; }
        }
      } else {
        const dx = p.x - pr.x, dz = p.z - pr.z, r = p.radius + pr.radius;
        if (dx * dx + dz * dz < r * r && pr.y > p.y - 0.1 && pr.y < p.y + p.height + 0.1) {
          if (pr.explode) detonate(game, pr);
          else { damagePlayer(game, pr.dmg, pr.element, { status: ELEMENTS[pr.element]?.status }); game.world.burst(pr.x, pr.y, pr.z, pr.light || [1, 0.5, 0.2], 6); }
          if (pr.pierce-- <= 0) { removed = true; break; }
        }
      }
    }
    if (removed) continue;
    if (pr.kind === 'rocket' && fx.chance(0.7)) w.addParticle({ x: pr.x, y: pr.y, z: pr.z, vx: 0, vy: 0.4, vz: 0, life: 0.6, age: 0, size: 0.2, color: [0.5, 0.48, 0.45], gravity: -0.5, cell: 2, add: false, drag: 1, grow: 2 });
    if (pr.pairId) { if (!pairs.has(pr.pairId)) pairs.set(pr.pairId, []); pairs.get(pr.pairId).push(pr); }
    alive.push(pr);
  }
  w.projectiles = alive.concat(w.projectiles);
  // slider beams: damage everything between the floor/ceiling pair
  for (const [, pair] of pairs) {
    if (pair.length < 2) continue;
    const [a, b] = pair;
    w.beam(a.x, a.y, a.z, b.x, b.y, b.z, a.vis.color || [0.6, 0.6, 1], 0.08, 0.05, 0.18);
    a.beamCD = (a.beamCD || 0) - dt;
    if (a.beamCD > 0) continue;
    a.beamCD = 0.12;
    for (const m of w.monsters) {
      if (m.dead) continue;
      if (Math.hypot(m.x - a.x, m.z - a.z) < m.radius + 0.4) damageMonster(game, m, a.dmg * 0.5, { element: a.element, noProc: false, statusChance: a.statusChance });
    }
  }
}

function dist2p(a, p) { return Math.hypot(a.x - p.x, a.z - p.z); }
function nearestMonster(w, x, z, r, exclude) {
  let best = null, bd = r * r;
  for (const m of w.monsters) {
    if (m.dead || (exclude && exclude.has(m))) continue;
    const d = (m.x - x) ** 2 + (m.z - z) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function impact(game, pr) {
  const col = pr.light || pr.vis?.color || [1, 0.8, 0.5];
  game.world.burst(pr.x, pr.y, pr.z, col, pr.kind === 'bullet' ? 3 : 6, { speed: 2.5, life: 0.35 });
  if (pr.kind !== 'flame') game.sfx('wall_hit', { dist: dist2p(pr, game.player), volume: 0.5 });
}

function detonate(game, pr) {
  pr.dead = true;
  const radius = pr.explode || 2.2;
  explode(game, pr.x, pr.y, pr.z, radius, pr.dmg, pr.element, pr.owner, { statusChance: pr.statusChance, crit: pr.crit });
  if (pr.nails) {
    // nail grenade: burst of nails in every direction
    for (let k = 0; k < pr.nails; k++) {
      const a = fx.float(0, Math.PI * 2), e = fx.float(-0.2, 0.6);
      spawnProjectile(game, { owner: pr.owner, x: pr.x, y: pr.y + 0.1, z: pr.z, vx: Math.cos(a) * Math.cos(e) * 30, vy: Math.sin(e) * 30, vz: Math.sin(a) * Math.cos(e) * 30, dmg: pr.nailDamage || pr.dmg * 0.25, element: pr.element, radius: 0.08, life: 0.8, vis: game.content.fxSprite(3), size: 0.12, kind: 'bullet', pierce: 1, bounces: 1, light: null });
    }
  }
}

export function submitProjectiles(game, batcher) {
  for (const pr of game.world.projectiles) {
    const v = pr.vis;
    if (!v) continue;
    let s = pr.size * (pr.grow ? 1 + pr.age * pr.grow * 2 : 1);
    const fade = pr.grow ? Math.max(0, 1 - pr.age / pr.life) : 1;
    // solid-looking sprites (bullets, rockets, grenades, organic orbs) draw as cutouts
    const solid = v.real && (pr.kind === 'bullet' || pr.kind === 'pellet' || pr.kind === 'rocket' || pr.kind === 'grenade' || pr.kind === 'disc');
    const mode = v.dark ? MODE.ALPHA : solid ? MODE.CUTOUT : MODE.ADD;
    let rot = pr.age * (pr.spin || 0);
    if (v.direction === 'right') {
      // side-view projectiles (comets, arrows) point along their flight path on screen
      const r = game.renderer;
      const a = r.project(pr.x, pr.y, pr.z), b = r.project(pr.x + pr.vx * 0.05, pr.y + pr.vy * 0.05, pr.z + pr.vz * 0.05);
      if (a && b) rot = Math.atan2(-(b.y - a.y) * r.lowH, (b.x - a.x) * r.lowW);
      s *= 1.4;
    } else if (solid && (pr.kind === 'bullet' || pr.kind === 'rocket')) rot = 0;
    if (pr.kind === 'bullet' || pr.kind === 'pellet') s = Math.max(s, 0.14);
    batcher.add(v.handle, mode, pr.x, pr.y, pr.z, s, s, {
      uv: v.uv, tint: v.real ? [1.15, 1.15, 1.15, fade] : [v.color[0], v.color[1], v.color[2], fade], anchorY: 0.5, spherical: true,
      rot, fullbright: true, glow: v.real ? [0, 0, 0, 0] : [v.color[0] * 0.3, v.color[1] * 0.3, v.color[2] * 0.3, 0],
    });
    if (solid && pr.owner === 'player' && pr.kind !== 'grenade') {
      // engine / tracer glow behind bullets & rockets
      const col = pr.light || v.color || [1, 0.7, 0.3];
      batcher.add(game.content.fx, MODE.ADD, pr.x, pr.y, pr.z, s * 1.6, s * 1.6, { uv: [0, 0, 0.25, 1], tint: [col[0], col[1], col[2], 0.5], anchorY: 0.5, spherical: true, fullbright: true });
    }
    if (v.real && pr.owner === 'enemy') {
      // soft halo so enemy shots read clearly at a distance
      batcher.add(game.content.fx, MODE.ADD, pr.x, pr.y, pr.z, s * 1.8, s * 1.8, { uv: [0, 0, 0.25, 1], tint: [...(pr.light || [1, 0.5, 0.5]), 0.45], anchorY: 0.5, spherical: true, fullbright: true });
    }
  }
}

export function projectileLights(game, out) {
  let n = 0;
  for (const pr of game.world.projectiles) {
    if (!pr.light || n > 10) continue;
    n++;
    out.push({ x: pr.x, y: pr.y, z: pr.z, r: pr.light[0], g: pr.light[1], b: pr.light[2], radius: 2.6 * Math.max(0.6, pr.size * 2), intensity: 0.9 });
  }
}

// ---------------------------------------------------------------- death & drops
export function killMonster(game, m, o = {}) {
  if (m.dead) return;
  m.dead = true;
  m.deathT = 0;
  m.state = 'dead';
  const w = game.world, p = game.player, st = p.stats;
  const def = m.def;
  const depth = Math.max(1, w.depth);
  game.sfx(def.category === 'robot' ? 'robot_death' : 'monster_death', { dist: m.distToPlayer, pitch: def.boss ? 0.6 : 1 });
  // gore: non-bosses explode into blood, gibs and decals; bosses dissolve through
  // escalating bursts. With gore off only robots throw a few sparks.
  const gored = w.gore ? w.gore.kill(m, o) : false;
  if (!gored && def.category === 'robot') w.burst(m.x, m.y + m.height * 0.5, m.z, [1, 0.6, 0.2], 12, { speed: 5, life: 0.6, size: 0.1 });
  if (def.category === 'robot' || def.boss) w.flash(m.x, m.y + 1, m.z, [1, 0.6, 0.2], def.boss ? 10 : 4, 0.3, 2);
  // XP
  const xp = B.enemyXP(depth) * (def.xp || 1) * (m.elite ? 2.5 : 1) * (m.variant.hpMult || 1) * (1 + st.xpGain);
  game.gainXP(xp);
  // credits
  const credits = B.creditsFor(depth, (def.credits || 1) * (m.elite ? 2.5 : 1) * (m.variant.creditsMult || 1) * (def.creditsMult || 1)) * (1 + st.creditFind);
  const coins = def.boss ? 6 : fx.int(1, 3);
  for (let k = 0; k < coins; k++) dropPickup(game, m, { kind: 'credits', value: Math.max(1, Math.round(credits / coins)) });
  // reagents
  const rf = 1 + st.reagentFind;
  const tables = [...(def.drops || []), ...(def.boss ? BOSS_UNIVERSAL_DROPS : UNIVERSAL_DROPS)];
  for (const d of tables) {
    if (d.minDepth && depth < d.minDepth) continue;
    if (!REAGENTS[d.id]) continue;
    if (fx.chance(Math.min(1, d.chance * rf * (m.elite ? 1.6 : 1)))) dropPickup(game, m, { kind: 'reagent', id: d.id, value: fx.int(d.min, d.max) });
  }
  // gear
  const itemChance = def.boss ? 1 : m.elite ? 0.32 : 0.075;
  const nItems = def.boss ? fx.int(2, 3) + (depth > 10 ? 1 : 0) : fx.chance(itemChance) ? 1 : 0;
  for (let k = 0; k < nItems; k++) {
    const item = generateItem(new Rng(fx.int(0, 2 ** 31)), {
      level: rollItemLevel(fx, p.level), bases: game.content.weaponBases, depth, itemFind: st.itemFind,
      minRarity: def.boss ? (k === 0 ? 2 : 1) : m.elite ? 1 : 0,
    });
    dropPickup(game, m, { kind: 'item', item });
  }
  // orbs
  if (def.boss) {
    dropPickup(game, m, { kind: 'orb', orb: 'gold', value: Math.round(credits * 12) });
    if (fx.chance(0.6)) dropPickup(game, m, { kind: 'orb', orb: 'blue' });
    if (fx.chance(0.6)) dropPickup(game, m, { kind: 'orb', orb: 'red' });
  } else {
    const healChance = 0.04 + (st.abilities.healing_orbs || 0) + (m.elite ? 0.12 : 0);
    if (fx.chance(healChance)) dropPickup(game, m, { kind: 'orb', orb: 'red' });
    if (m.elite && fx.chance(0.15)) dropPickup(game, m, { kind: 'orb', orb: 'blue' });
  }
  if (m.carriesKey) dropPickup(game, m, { kind: 'key', color: m.carriesKey });
  // kill procs
  const ab = st.abilities;
  if (ab.explosive_kills && !o.noCorpse) explode(game, m.x, m.y + m.height * 0.5, m.z, 2.4, m.maxHp * ab.explosive_kills * 0.5, 'fire', 'player', { skip: m, small: false, silent: false });
  if (ab.gravity_well) game.addSingularity(m.x, m.y + m.height * 0.5, m.z, p.weaponDamageRef() * ab.gravity_well);
  if (ab.adrenaline) { p.adrenalineT = 3; }
  if (ab.kill_shield) p.shield = Math.min(p.maxHp * 0.5, p.shield + p.maxHp * ab.kill_shield);
  game.monsterKilled(m);
}

export function dropPickup(game, m, pk) {
  const a = fx.float(0, Math.PI * 2), sp = fx.float(0.5, pk.kind === 'item' ? 2.5 : 2);
  if (pk.kind === 'key') {
    // keys must never be lost (void, pits, lava, unreachable ledges): drop them
    // on the nearest safe cell the player can reach
    const s = game.world.safeDropSpot(m.x, m.z);
    if (s && (s.x !== Math.floor(m.x) + 0.5 || s.z !== Math.floor(m.z) + 0.5 || Math.abs(m.y - s.y) > 1.5)) {
      game.world.pickups.push({ ...pk, x: s.x, y: s.y + 0.6, z: s.z, vx: 0, vy: 0, vz: 0, age: 0, settled: true, phase: fx.float(0, 6) });
      return;
    }
  }
  const y = (m.mode === 'ceiling' ? m.y : m.y) + Math.min(1.2, m.height * 0.5);
  const floor = game.world.surfaceBelow(m.x, y, m.z) ?? m.y;
  game.world.pickups.push({
    ...pk, x: m.x, y: Math.max(y, floor + 0.3), z: m.z, vx: Math.cos(a) * sp, vy: fx.float(2.5, 4.5), vz: Math.sin(a) * sp, age: 0,
    settled: false, phase: fx.float(0, 6),
  });
}

export function itemGlowColor(item) {
  return hexToRgb(RARITY[item.rarity].color);
}
export { upgradedDamage };
