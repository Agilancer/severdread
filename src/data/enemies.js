// Standard enemy roster built from the uploaded 8-way sheets. Behaviour was
// chosen from each sheet's attack frames:
//   M = melee (swing / bite / slam / charge)      R = ranged (shoots / beams)
//   B = breath (short-range stream: flame, frost, spores)
// Traits: fly = hovers, wall = crawls walls & ceilings (4+ legged / spider-like),
//         tp = teleports (robots), fast, tank, charge, explode (shots explode)
// Columns: id, name, category, attack, element, traits, projectile sprite tag, tier
// The projectile sprite is resolved from the projectile sheets by tag/colour
// at runtime (enemy shots never use bullet-like sprites).

const ROSTER = [
  ['coil_serpent', 'Coil Serpent', 'alien', 'R', 'void', '', 'purple', 2],
  ['vaultbreaker', 'Vaultbreaker', 'robot', 'M', 'physical', 'tp tank', null, 3],
  ['needle_finch', 'Needle Finch', 'robot', 'R', 'lightning', 'fly tp', 'blue', 2],
  ['relay_stag', 'Relay Stag', 'robot', 'R', 'lightning', 'tp fast', 'blue', 3],
  ['pressure_warden', 'Pressure Warden', 'robot', 'R', 'ice', 'tank', 'white', 3],
  ['needleback', 'Needleback', 'robot', 'R', 'plasma', 'tp', 'cyan', 2],
  ['halo_wisp', 'Halo Wisp', 'robot', 'R', 'fire', 'fly tp', 'orange', 1],
  ['sewer_maw', 'Sewer Maw', 'beast', 'R', 'poison', '', 'green', 1],
  ['scarlet_oracle', 'Scarlet Oracle', 'demon', 'R', 'blood', 'beam', 'red', 4],
  ['spore_brute', 'Spore Brute', 'beast', 'B', 'poison', 'tank', 'green', 3],
  ['obsidian_widow', 'Obsidian Widow', 'beast', 'M', 'blood', 'wall fast', null, 2],
  ['veil_witch', 'Veil Witch', 'undead', 'R', 'arcane', 'tp', 'purple', 4],
  ['butcher_duke', 'Butcher Duke', 'demon', 'M', 'physical', 'tank', null, 3],
  ['shard_impaler', 'Shard Impaler', 'alien', 'M', 'ice', 'wall', null, 2],
  ['night_executioner', 'Night Executioner', 'undead', 'M', 'void', 'tank', null, 5],
  ['glacier_stalker', 'Glacier Stalker', 'alien', 'M', 'ice', 'fast', null, 3],
  ['coalwing', 'Coalwing', 'demon', 'B', 'fire', 'fly', 'orange', 3],
  ['mire_fiend', 'Mire Fiend', 'beast', 'R', 'poison', '', 'green', 2],
  ['bloodjaw_hound', 'Bloodjaw Hound', 'beast', 'M', 'blood', 'fast', null, 1],
  ['rust_trooper', 'Rust Trooper', 'robot', 'R', 'fire', 'tp', 'orange', 1],
  ['hellfire_gunner', 'Hellfire Gunner', 'robot', 'R', 'plasma', 'tank', 'cyan', 4],
  ['bone_colossus', 'Bone Colossus', 'undead', 'M', 'physical', 'tank charge', null, 5],
  ['ember_imp', 'Ember Imp', 'demon', 'R', 'fire', '', 'orange', 1],
  ['cinder_wretch', 'Cinder Wretch', 'demon', 'M', 'fire', 'fast', null, 2],
  ['copper_warden', 'Copper Warden', 'robot', 'M', 'physical', 'tp tank', null, 2],
  ['plague_siren', 'Plague Siren', 'undead', 'R', 'void', 'tp', 'purple', 4],
  ['ash_gargoyle', 'Ash Gargoyle', 'demon', 'M', 'physical', 'fly', null, 3],
  ['magnet_mite', 'Magnet Mite', 'robot', 'R', 'lightning', 'wall', 'cyan', 2],
  ['bastion_roach', 'Bastion Roach', 'robot', 'R', 'fire', 'wall tank explode', 'orange', 3],
  ['anchor_golem', 'Anchor Golem', 'robot', 'M', 'physical', 'tank charge', null, 3],
  ['copper_kite', 'Copper Kite', 'robot', 'R', 'poison', 'fly', 'green', 2],
  ['grinder_slug', 'Grinder Slug', 'robot', 'M', 'physical', 'tank', null, 4],
  ['aegis_falcon', 'Aegis Falcon', 'robot', 'R', 'lightning', 'fly tp', 'blue', 4],
  ['polar_custodian', 'Polar Custodian', 'robot', 'R', 'ice', 'tank beam', 'cyan', 5],
  ['arc_jackal', 'Arc Jackal', 'robot', 'B', 'lightning', 'fast tp', 'yellow', 3],
  ['cobalt_lobster', 'Cobalt Lobster', 'robot', 'R', 'lightning', 'wall', 'blue', 3],
  ['null_bell', 'Null Bell', 'construct', 'R', 'arcane', 'fly', 'white', 4],
  ['siege_nautilus', 'Siege Nautilus', 'construct', 'R', 'fire', 'tank explode', 'orange', 5],
  ['crown_behemoth', 'Crown Behemoth', 'robot', 'R', 'lightning', 'tank beam', 'blue', 6],
  ['thresher_knight', 'Thresher Knight', 'robot', 'M', 'physical', 'tp', null, 4],
  ['echo_lantern', 'Echo Lantern', 'robot', 'R', 'plasma', 'fly', 'cyan', 2],
  ['breacher', 'Breacher', 'robot', 'M', 'physical', 'tank charge shield', null, 4],
  ['fuse_goblin', 'Fuse Goblin', 'robot', 'R', 'fire', 'fast explode', 'orange', 2],
  ['tungsten_ape', 'Tungsten Ape', 'robot', 'M', 'physical', 'tank charge', null, 4],
  ['radon_mule', 'Radon Mule', 'robot', 'R', 'poison', 'tank', 'yellow', 4],
  ['suture_engine', 'Suture Engine', 'robot', 'M', 'blood', 'wall', null, 3],
  ['slag_beetle', 'Slag Beetle', 'construct', 'R', 'fire', 'wall', 'orange', 2],
  ['antenna_pilgrim', 'Antenna Pilgrim', 'robot', 'R', 'plasma', 'tp', 'cyan', 2],
  ['gimbal_gunner', 'Gimbal Gunner', 'robot', 'R', 'fire', 'tank', 'orange', 3],
  ['sawtooth_skater', 'Sawtooth Skater', 'robot', 'M', 'physical', 'fast', null, 3],
  ['furnace_walker', 'Furnace Walker', 'robot', 'R', 'fire', 'tank explode', 'orange', 4],
  ['tesla_hermit', 'Tesla Hermit', 'robot', 'R', 'lightning', 'wall', 'purple', 4],
  ['obelisk_walker', 'Obelisk Walker', 'construct', 'R', 'blood', 'beam', 'red', 5],
  ['quartz_strider', 'Quartz Strider', 'construct', 'R', 'ice', 'tp', 'cyan', 4],
  ['boiler_badger', 'Boiler Badger', 'robot', 'B', 'fire', 'tank', 'white', 3],
  ['lockjaw', 'Lockjaw', 'robot', 'M', 'physical', 'fast', null, 2],
  ['cathedral_engine', 'Cathedral Engine', 'robot', 'R', 'fire', 'wall beam', 'red', 6],
  ['iron_crab', 'Iron Crab', 'robot', 'R', 'plasma', 'wall tank', 'blue', 3],
  ['razor_mantis', 'Razor Mantis', 'alien', 'M', 'void', 'wall fast', null, 4],
  ['patchwork_medic', 'Patchwork Medic', 'robot', 'R', 'plasma', 'tp', 'blue', 3],
  ['scrap_harvester', 'Scrap Harvester', 'robot', 'M', 'physical', 'wall fast', null, 4],
  ['prism_bishop', 'Prism Bishop', 'construct', 'R', 'holy', 'beam tp', 'cyan', 6],
  ['molten_sentry', 'Molten Sentry', 'robot', 'R', 'fire', 'tank', 'orange', 3],
  ['phase_jester', 'Phase Jester', 'robot', 'M', 'arcane', 'tp fast', null, 5],
  ['titanium_bull', 'Titanium Bull', 'robot', 'M', 'physical', 'charge tank', null, 4],
  ['circuit_nymph', 'Circuit Nymph', 'robot', 'R', 'plasma', 'tp', 'blue', 3],
  ['ash_sweeper', 'Ash Sweeper', 'robot', 'B', 'fire', 'tank', 'orange', 4],
  ['violet_bailiff', 'Violet Bailiff', 'robot', 'R', 'void', 'beam', 'purple', 4],
  ['orbit_leech', 'Orbit Leech', 'construct', 'R', 'fire', 'fly beam', 'orange', 5],
  ['chrome_scorpion', 'Chrome Scorpion', 'robot', 'R', 'poison', 'wall', 'green', 4],
  ['helix_dancer', 'Helix Dancer', 'robot', 'M', 'arcane', 'fast tp', null, 5],
  ['rail_centurion', 'Rail Centurion', 'robot', 'R', 'fire', 'tank shield', 'orange', 6],
  ['kiln_tortoise', 'Kiln Tortoise', 'construct', 'B', 'fire', 'tank', 'orange', 4],
  ['signal_wraith', 'Signal Wraith', 'robot', 'R', 'void', 'fly beam', 'purple', 5],
  ['laser_weaver', 'Laser Weaver', 'robot', 'R', 'plasma', 'wall beam', 'cyan', 5],
  ['mercury_duelist', 'Mercury Duelist', 'robot', 'M', 'physical', 'fast tp', null, 4],
  ['rivet_hound', 'Rivet Hound', 'robot', 'R', 'fire', 'fast', 'orange', 3],
  ['glasswing', 'Glasswing', 'construct', 'R', 'void', 'fly', 'purple', 4],
  ['chain_devourer', 'Chain Devourer', 'demon', 'M', 'physical', 'tank', null, 4],
  ['gore_sentinel', 'Gore Sentinel', 'demon', 'M', 'blood', 'tank', null, 4],
  ['frost_heretic', 'Frost Heretic', 'undead', 'R', 'ice', 'beam', 'cyan', 5],
  ['thorn_martyr', 'Thorn Martyr', 'demon', 'M', 'poison', 'fast', null, 3],
  ['ivory_reaper', 'Ivory Reaper', 'undead', 'M', 'void', 'fast tp', null, 5],
  ['cinder_ram', 'Cinder Ram', 'demon', 'M', 'fire', 'charge', null, 3],
  ['sanguine_ogre', 'Sanguine Ogre', 'demon', 'M', 'blood', 'tank charge', null, 4],
  ['flayed_baron', 'Flayed Baron', 'demon', 'R', 'blood', 'tank', 'red', 5],
];

// Extra bosses whose sheets arrived without an entry in data/bosses.js.
const BOSS_ROSTER = [
  ['abyssal_mother', 'Abyssal Mother', 'demon', 'M', 'void', 'wall summon', null, 3],
  ['frost_sepulcher', 'Frost Sepulcher', 'undead', 'R', 'ice', 'nova', 'cyan', 2],
  ['cinder_colossus', 'Cinder Colossus', 'demon', 'B', 'fire', 'shockwave', 'orange', 3],
  ['glass_tyrant', 'Glass Tyrant', 'construct', 'M', 'arcane', 'charge nova', 'purple', 4],
  ['hollow_duke', 'Hollow Duke', 'demon', 'R', 'void', 'tp nova', 'red', 4],
  ['rust_seraph', 'Rust Seraph', 'construct', 'R', 'fire', 'fly nova', 'orange', 5],
  ['night_anvil', 'Night Anvil', 'demon', 'M', 'void', 'shockwave charge', null, 4],
  ['ember_matriarch', 'Ember Matriarch', 'demon', 'M', 'fire', 'charge nova', 'orange', 5],
  ['storm_despot', 'Storm Despot', 'demon', 'R', 'lightning', 'beam nova', 'blue', 5],
  ['mire_sovereign', 'Mire Sovereign', 'beast', 'M', 'poison', 'charge summon', null, 4],
  ['cathedral_maw', 'Cathedral Maw', 'demon', 'M', 'blood', 'shockwave summon', null, 6],
];

const TAG_PROJECTILE = {
  purple: 'violet_star', blue: 'azure_sigil', cyan: 'tide_vortex', orange: 'inferno_orb', green: 'jade_hex', red: 'crimson_sigil',
  white: 'radiant_orb', yellow: 'thunder_orb',
};
const ELEM_LIGHT = { fire: [1, 0.5, 0.15], ice: [0.5, 0.85, 1], lightning: [0.6, 0.8, 1], poison: [0.4, 1, 0.3], void: [0.7, 0.3, 1], holy: [1, 0.9, 0.6], plasma: [0.3, 1, 0.9], blood: [1, 0.15, 0.2], arcane: [0.9, 0.4, 1], physical: [1, 0.8, 0.5] };
const VOICE = { robot: 'robot', construct: 'robot', demon: 'demon', undead: 'demon', beast: 'chitter', alien: 'alien' };

function build(row, boss) {
  const [id, name, category, atk, element, traitStr, projTag, tier] = row;
  const t = new Set(traitStr.split(' ').filter(Boolean));
  const tank = t.has('tank'), fast = t.has('fast');
  const hp = (boss ? 900 : 30) * (tank ? 1.6 : fast ? 0.75 : 1) * (1 + tier * 0.06);
  const dmg = (boss ? 22 : 9) * (atk === 'M' ? 1.25 : 1) * (tank ? 1.15 : 1);
  const speed = (boss ? 2.3 : 2.5) * (fast ? 1.5 : tank ? 0.8 : 1);
  const light = ELEM_LIGHT[element];
  const proj = { sprite: TAG_PROJECTILE[projTag] || 'violet_star', spriteTag: projTag, element, speed: t.has('explode') ? 10 : 12, size: boss ? 0.6 : 0.42, light, spin: 4 };
  if (t.has('explode')) proj.explode = 1.8;
  if (t.has('beam')) Object.assign(proj, { beam: true, speed: 30 });
  let attack;
  if (atk === 'M') attack = { type: 'melee', range: boss ? 2.6 : 1.4, windup: fast ? 0.3 : 0.45, strike: 0.12, recover: fast ? 0.3 : 0.45, cooldown: fast ? 0.6 : 0.85, knockback: tank ? 6 : 3, sound: tank ? 'slam' : fast ? 'bite' : 'swing', element: element !== 'physical' ? element : undefined, slam: tank ? 1.5 : 0 };
  else if (atk === 'B') attack = { type: 'breath', range: 7, windup: 0.5, strike: 1.0, recover: 0.5, cooldown: 1.7, projectile: { ...proj, beam: false, speed: 10, life: 0.7, pierce: 99, spread: 0.25, rate: 20, size: 0.5 }, sound: element === 'poison' ? 'spit' : 'flame' };
  else attack = { type: 'ranged', range: 16, windup: t.has('beam') ? 0.7 : 0.5, strike: 0.1, recover: 0.4, cooldown: t.has('beam') ? 1.9 : 1.5, projectile: proj, burst: boss ? 3 : undefined, burstSpread: boss ? 0.4 : undefined, sound: element === 'fire' ? 'fireball' : element === 'poison' ? 'spit' : 'zap_enemy' };
  const def = {
    name, sprite: id, category, height: boss ? 2.3 : tank ? 1.15 : 1.0, hp, damage: dmg, armor: tank ? 4 : 1, speed, radius: boss ? 0.85 : tank ? 0.42 : 0.33,
    attack, xp: (tank ? 1.3 : 1) * (boss ? 15 : 1), credits: boss ? 12 : 1, weight: boss ? 8 : 7, minDepth: tier, voice: VOICE[category] || 'demon',
    resist: element !== 'physical' ? { [element]: 0.5 } : {}, preferredRange: atk === 'R' ? 8 : atk === 'B' ? 4 : 0,
    drops: [], tier,
  };
  if (boss) def.boss = true;
  if (t.has('fly')) def.flying = 1.1;
  if (t.has('wall')) { def.wallWalker = true; def.ceilingBias = 0.45; }
  if (t.has('tp')) def.teleport = { cooldown: 6, range: 5, dodgeChance: 0.3, closeChance: atk === 'M' ? 0.6 : 0.15 };
  if (t.has('shield')) def.shield = 0.45;
  const specials = {};
  if (t.has('charge')) specials.charge = { cooldown: boss ? 6 : 8, speed: 11, duration: 0.9 };
  if (boss) {
    if (t.has('nova')) specials.nova = { cooldown: 9, count: 16, projectile: { ...proj, beam: false, speed: 9 } };
    if (t.has('shockwave')) specials.shockwave = { cooldown: 8, speed: 7, damage: 0.65, element };
    if (t.has('summon')) specials.summon = { cooldown: 13, count: 3, monster: 'bloodjaw_hound' };
    if (!Object.keys(specials).length) specials.shockwave = { cooldown: 9, speed: 7, damage: 0.6 };
  }
  if (Object.keys(specials).length) def.specials = specials;
  return [id, def];
}

export const ENEMIES = Object.fromEntries(ROSTER.map((r) => build(r, false)));
export const EXTRA_BOSSES = Object.fromEntries(BOSS_ROSTER.map((r) => build(r, true)));
