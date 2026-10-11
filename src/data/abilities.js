// Special abilities. Rings roll these most often; epic/legendary armour and
// weapons can roll them too. Each entry:
//   roll(q)  -> numeric magnitude, q = quality 0..1+ (item level + rarity)
//   desc(v)  -> tooltip text
//   stack    -> 'sum' (values add up) or 'max' (best one counts)
//   slots    -> which item kinds may roll it
// The gameplay hooks that read these live in game/player.js and game/combat.js.
const R = (a, b) => (q) => a + (b - a) * Math.min(1, q);
const P = (v) => `${Math.round(v * 100)}%`;

export const ABILITIES = {
  // ---- movement (the classics requested) ----
  double_jump: { name: 'Double Jump', stack: 'sum', key: 'airJumps', roll: () => 1, desc: () => 'Jump once more in mid-air', slots: ['ring', 'legs'], weight: 9 },
  triple_jump: { name: 'Triple Jump', stack: 'sum', key: 'airJumps', roll: () => 2, desc: () => 'Jump twice more in mid-air', slots: ['ring', 'legs'], weight: 4, minRarity: 2 },
  quad_jump: { name: 'Quadruple Jump', stack: 'sum', key: 'airJumps', roll: () => 3, desc: () => 'Jump three more times in mid-air', slots: ['ring'], weight: 1.5, minRarity: 3 },
  extra_dash: { name: 'Extra Dash', stack: 'sum', roll: (q) => (q > 0.85 ? 2 : 1), desc: (v) => `+${v} dash charge${v > 1 ? 's' : ''}`, slots: ['ring', 'legs'], weight: 8 },
  air_dash: { name: 'Air Dash', stack: 'max', roll: () => 1, desc: () => 'Dash while airborne', slots: ['ring', 'legs'], weight: 7 },
  swiftness: { name: 'Swiftness', stack: 'sum', roll: R(0.08, 0.25), desc: (v) => `+${P(v)} movement speed`, slots: ['ring', 'legs'], weight: 7 },
  // ---- 30+ new abilities ----
  phase_dash: { name: 'Phase Dash', stack: 'max', roll: () => 1, desc: () => 'Invulnerable while dashing', slots: ['ring', 'body'], weight: 4 },
  blink: { name: 'Blink', stack: 'max', roll: () => 1, desc: () => 'Dash becomes a short-range teleport', slots: ['ring'], weight: 3, minRarity: 2 },
  dash_strike: { name: 'Razor Dash', stack: 'max', roll: R(0.8, 2.5), desc: (v) => `Dashing through enemies deals ${P(v)} weapon damage`, slots: ['ring', 'legs'], weight: 5 },
  glide: { name: 'Glide', stack: 'max', roll: () => 1, desc: () => 'Hold jump while falling to glide', slots: ['ring', 'body'], weight: 5 },
  wall_jump: { name: 'Wall Jump', stack: 'max', roll: () => 1, desc: () => 'Jump off walls while airborne', slots: ['ring', 'legs'], weight: 5 },
  meteor_fall: { name: 'Meteor Fall', stack: 'max', roll: R(1.5, 4), desc: (v) => `Landing from a high fall blasts nearby enemies for ${P(v)} weapon damage`, slots: ['ring', 'legs'], weight: 4 },
  jetpack: { name: 'Jet Thrusters', stack: 'max', roll: R(0.8, 2.0), desc: (v) => `Hold jump in the air to hover for ${v.toFixed(1)}s`, slots: ['ring', 'body'], weight: 3, minRarity: 2 },
  featherfall: { name: 'Featherfall', stack: 'max', roll: () => 1, desc: () => 'Falling into the void costs no health', slots: ['ring', 'legs'], weight: 4 },
  vampiric: { name: 'Vampiric', stack: 'sum', roll: R(0.02, 0.06), desc: (v) => `Heal for ${P(v)} of damage dealt`, slots: ['ring', 'weapon'], weight: 6 },
  regen: { name: 'Regeneration', stack: 'sum', roll: R(0.004, 0.012), desc: (v) => `Regenerate ${(v * 100).toFixed(1)}% max health per second`, slots: ['ring', 'body', 'head'], weight: 6 },
  second_wind: { name: 'Second Wind', stack: 'max', roll: R(0.3, 0.6), desc: (v) => `Once per level, survive a killing blow and heal ${P(v)}`, slots: ['ring', 'body'], weight: 3, minRarity: 2 },
  thorns_aura: { name: 'Barbed Hide', stack: 'sum', roll: R(0.3, 1.0), desc: (v) => `Reflect ${P(v)} of melee damage taken`, slots: ['ring', 'body'], weight: 4 },
  static_field: { name: 'Static Field', stack: 'max', roll: R(0.25, 0.8), desc: (v) => `Zap a nearby enemy every second for ${P(v)} weapon damage`, slots: ['ring', 'head'], weight: 4 },
  frost_aura: { name: 'Frost Aura', stack: 'max', roll: R(0.2, 0.45), desc: (v) => `Nearby enemies are slowed by ${P(v)}`, slots: ['ring', 'body'], weight: 4 },
  burning_aura: { name: 'Immolation', stack: 'max', roll: R(0.2, 0.6), desc: (v) => `Burn nearby enemies for ${P(v)} weapon damage per second`, slots: ['ring', 'body'], weight: 4 },
  orbiting_blades: { name: 'Orbiting Blades', stack: 'max', roll: (q) => (q > 0.8 ? 4 : q > 0.45 ? 3 : 2), desc: (v) => `${v} sawblades orbit you, shredding enemies`, slots: ['ring'], weight: 3, minRarity: 2 },
  drone: { name: 'Combat Drone', stack: 'max', roll: R(0.3, 0.8), desc: (v) => `A drone fights beside you (${P(v)} weapon damage)`, slots: ['ring', 'head'], weight: 3, minRarity: 2 },
  chain_lightning: { name: 'Chain Lightning', stack: 'sum', roll: R(0.08, 0.2), desc: (v) => `${P(v)} chance on hit to arc lightning to nearby enemies`, slots: ['ring', 'weapon'], weight: 5 },
  ignite: { name: 'Ignition', stack: 'sum', roll: R(0.08, 0.25), desc: (v) => `${P(v)} chance on hit to set enemies ablaze`, slots: ['ring', 'weapon'], weight: 5 },
  deep_freeze: { name: 'Deep Freeze', stack: 'sum', roll: R(0.05, 0.15), desc: (v) => `${P(v)} chance on hit to freeze enemies solid`, slots: ['ring', 'weapon'], weight: 4 },
  explosive_kills: { name: 'Corpse Bomb', stack: 'max', roll: R(0.4, 1.2), desc: (v) => `Slain enemies explode for ${P(v)} of their max health`, slots: ['ring', 'weapon'], weight: 4 },
  ricochet: { name: 'Ricochet', stack: 'sum', roll: (q) => (q > 0.7 ? 2 : 1), desc: (v) => `Projectiles bounce off walls ${v} extra time${v > 1 ? 's' : ''}`, slots: ['ring', 'weapon'], weight: 4 },
  piercing: { name: 'Piercing Rounds', stack: 'sum', roll: (q) => (q > 0.7 ? 2 : 1), desc: (v) => `Projectiles pierce ${v} extra enem${v > 1 ? 'ies' : 'y'}`, slots: ['ring', 'weapon'], weight: 4 },
  multishot: { name: 'Multishot', stack: 'sum', roll: (q) => (q > 0.9 ? 2 : 1), desc: (v) => `+${v} projectile${v > 1 ? 's' : ''} per shot`, slots: ['ring', 'weapon'], weight: 3, minRarity: 2 },
  homing: { name: 'Seeker Rounds', stack: 'max', roll: R(2, 6), desc: () => 'Projectiles curve toward enemies', slots: ['ring', 'weapon'], weight: 3 },
  double_tap: { name: 'Double Tap', stack: 'sum', roll: R(0.08, 0.2), desc: (v) => `${P(v)} chance to fire an extra volley`, slots: ['ring', 'weapon'], weight: 4 },
  berserker: { name: 'Berserker', stack: 'max', roll: R(0.3, 0.8), desc: (v) => `Up to +${P(v)} damage as your health drops`, slots: ['ring', 'head'], weight: 4 },
  executioner: { name: 'Executioner', stack: 'max', roll: R(0.3, 0.9), desc: (v) => `+${P(v)} damage to enemies below 30% health`, slots: ['ring', 'weapon'], weight: 4 },
  boss_slayer: { name: 'Bossbane', stack: 'sum', roll: R(0.15, 0.4), desc: (v) => `+${P(v)} damage to bosses`, slots: ['ring', 'weapon', 'head'], weight: 4 },
  treasure_hunter: { name: 'Treasure Hunter', stack: 'sum', key: 'creditFind', roll: R(0.15, 0.5), desc: (v) => `+${P(v)} credits found`, slots: ['ring', 'head'], weight: 5 },
  scholar: { name: 'Scholar', stack: 'sum', key: 'xpGain', roll: R(0.08, 0.25), desc: (v) => `+${P(v)} experience gained`, slots: ['ring', 'head'], weight: 5 },
  scavenger: { name: 'Scavenger', stack: 'sum', key: 'reagentFind', roll: R(0.15, 0.5), desc: (v) => `+${P(v)} reagent drops`, slots: ['ring'], weight: 5 },
  lucky: { name: 'Lucky Charm', stack: 'sum', key: 'itemFind', roll: R(0.1, 0.35), desc: (v) => `+${P(v)} chance of rarer loot`, slots: ['ring'], weight: 4 },
  magnet: { name: 'Magnetism', stack: 'sum', key: 'pickupRadius', roll: R(0.5, 1.5), desc: (v) => `+${P(v)} pickup radius`, slots: ['ring'], weight: 5 },
  adrenaline: { name: 'Adrenaline', stack: 'max', roll: R(0.15, 0.4), desc: (v) => `Kills grant +${P(v)} speed and fire rate for 3s`, slots: ['ring', 'legs'], weight: 4 },
  kill_shield: { name: 'Soul Aegis', stack: 'max', roll: R(0.04, 0.12), desc: (v) => `Kills grant a shield worth ${P(v)} max health`, slots: ['ring', 'body'], weight: 4 },
  bullet_time: { name: 'Bullet Time', stack: 'max', roll: R(0.6, 1.4), desc: (v) => `Dashing slows time for ${v.toFixed(1)}s`, slots: ['ring'], weight: 2, minRarity: 3 },
  retaliation: { name: 'Retaliation Nova', stack: 'max', roll: R(1.0, 3.0), desc: (v) => `Taking damage releases a nova for ${P(v)} weapon damage (4s cooldown)`, slots: ['ring', 'body'], weight: 4 },
  healing_orbs: { name: 'Life Harvest', stack: 'sum', roll: R(0.05, 0.15), desc: (v) => `${P(v)} chance for kills to drop a healing orb`, slots: ['ring', 'head'], weight: 5 },
  overcharge: { name: 'Overcharge', stack: 'max', roll: (q) => (q > 0.7 ? 6 : q > 0.35 ? 8 : 10), desc: (v) => `Every ${v}th shot is a triple-damage critical`, slots: ['ring', 'weapon'], weight: 4 },
  glass_cannon: { name: 'Glass Cannon', stack: 'max', roll: R(0.35, 0.7), desc: (v) => `+${P(v)} damage, but -30% max health`, slots: ['ring'], weight: 2 },
  iron_skin: { name: 'Iron Skin', stack: 'sum', roll: R(0.1, 0.3), desc: (v) => `+${P(v)} armor`, slots: ['ring', 'body', 'legs', 'head'], weight: 5 },
  last_stand: { name: 'Last Stand', stack: 'max', roll: R(0.2, 0.45), desc: (v) => `Take ${P(v)} less damage while below 30% health`, slots: ['ring', 'body'], weight: 4 },
  momentum: { name: 'Momentum', stack: 'max', roll: R(0.15, 0.4), desc: (v) => `Up to +${P(v)} damage while moving fast`, slots: ['ring', 'legs'], weight: 4 },
  gravity_well: { name: 'Gravity Well', stack: 'max', roll: R(0.3, 0.9), desc: (v) => `Kills create a singularity pulling enemies in (${P(v)} damage)`, slots: ['ring', 'weapon'], weight: 2, minRarity: 3 },
  vengeance: { name: 'Vengeance', stack: 'max', roll: R(0.2, 0.5), desc: (v) => `After taking a hit, deal +${P(v)} damage for 4s`, slots: ['ring', 'head'], weight: 4 },
};

export const ABILITY_IDS = Object.keys(ABILITIES);
