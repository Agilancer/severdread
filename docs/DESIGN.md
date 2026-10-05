# SEVERDREAD design notes

## Core loop

1. Station hub (AEGIS-9): buy/sell, upgrade weapons/armour/rings, expand bag.
2. Teleporter → depth 1 (always the Possessed Space Station theme).
3. Each level: random theme + layout, standard enemies, one boss in an arena
   near the end, locked doors with keys (lying around or carried by monsters),
   cybernetic chests.
4. Kill everything (ticker shows how many remain) → portal opens near the boss:
   descend to depth N+1, or return to the station (run continues from there).
5. Death → back to the station, run reset to depth 1. Level, XP, gear, bag,
   credits and reagents are kept.

## Scaling (src/data/balance.js)

- XP to next level: `40 · L^1.6 · 1.045^L`. Run XP grows `1.09^depth`, so
  ~8 runs to depth 30 ≈ level 30, deep runs ≈ level 50, and depth 150+
  pushes toward the level-200 cap.
- Area level `L` = depth up to 50, then +1.5 per depth (depth 150 = 200).
  Monsters and loot both scale with it.
- Monster HP `1.085^L · (1 + 0.05L) · (1 + 1.55 ramp)`, damage
  `1.065^L · (1 + 0.02L) · (1 + 0.6 ramp)`, where `ramp = 1 − e^(−(L−1)/4.5)`
  is how much of a full kit of on-level gear a player has picked up (0 on
  depth 1, ~0.6 by depth 5, ~0.9 by depth 12) - four guns and four rings
  whose stats all count, not just the gun in hand. Count `12 + 1.6d` (capped
  70, times the level size), elite chance up to 30%.
- Drops: item level = area level −2 … +1 (pedestals +1, shop one below the
  deepest floor reached), never the character level, so gear can't outrun the
  floor and replaying shallow floors doesn't hand out deep gear. Rarity
  weights shift with depth and Item Rarity stats. Bosses always drop 2-4
  items (first one rare+), boss reagents and a gold credit orb.
- Rarity power ×1.0 / 1.1 / 1.2 / 1.32 / 1.48. Extra projectiles split a
  shot's damage instead of copying it (fan `1/√n` each, ring `3/√n`, helix
  0.65 each, multishot +40% of the shot per extra projectile). Flat attack is
  scaled per hit by the weapon's hit size (pistol = 1), so it adds about the
  same DPS to a minigun as to a railgun.
- Armour: reduction `armor / (armor + 40 + 6 · armorValue(L))`, cap 75%: a
  full on-level set blocks about a third at any depth.
- Upgrades: +6% power per level (+ quadratic): +5 = 1.35×, +10 = 1.8×,
  +15 = 2.35×; max +5 … +15 by rarity, cost credits + reagents that change as
  levels rise (boss-only reagents at higher levels). Bag: +5 slots per
  upgrade, 40 → 200, escalating cost.
- `tests/balance.test.js` plays 31 first runs down to depth 60 with the real
  item / stat / balance code (best unlimited gun, three best ammo guns, best
  armour, four rings) and models each floor's ammo (see below). Kill time of
  a standard monster in a typical fight (how much of a gun's damage really
  lands, measured with real shots by `tests/fight.mjs`; misses spend ammo
  too), medians through depth 30:
  - best unlimited gun 0.85-1.3x the depth-1 starting pistol (~0.6 s): the
    sustained pace (1.0-1.25 now)
  - best ammo gun 0.5-0.8x of that: the rationed burst (0.53-0.74)
  - blended over the share of firing time a floor's ammo sustains:
    0.8-1.15x the depth-1 pistol (0.81-1.04; depths 2-3 may go to 0.7, where
    the station issue lets a run lean on ammo)
  - 6-18 monster hits to kill the player (11-14.5); a boss fight 15-40 s
    (19-31 s).

  | depth | kill time: unlimited | ammo gun / unlimited | blended | ammo share of firing | boss fight |
  |---|---|---|---|---|---|
  | 2 | 1.00 | 0.81 | 1.00 | 0.46 | 31 s |
  | 5 | 1.11 | 0.71 | 0.86 | 0.65 | 25 s |
  | 12 | 1.15 | 0.66 | 0.92 | 0.42 | 22 s |
  | 20 | 1.16 | 0.65 | 0.95 | 0.41 | 22 s |
  | 30 | 1.18 | 0.58 | 0.91 | 0.37 | 21 s |

## Ammo (src/data/ammo.js, src/game/ammo.js)

DOOM-style: six ammo pools shared by every weapon of a type, so the heavy
hitters can't be fired forever while the basic guns are a reliable baseline.

| type | weapons (cost per shot) | max | pack / box |
|---|---|---|---|
| Shells | shotgun 1, super shotgun 2 | 35 | 2 / 6 |
| Heavy Rounds | minigun 1 per bullet, sniper 15 | 360 | 22 / 65 |
| Explosives | rocket, grenade, nail grenade launcher 1 | 30 | 2 / 5 |
| Cells | plasma 1, lightning 1, disc 3, spreader 5, rail 10 | 220 | 13 / 40 |
| Fuel | flamethrower, sprayer 1 per tick | 520 | 30 / 95 |
| Bolts | crossbow, harpoon, javelin 1 | 30 | 2 / 5 |

Pistols, revolvers, SMGs, rifles, LMGs, throwing stars and melee never run
dry (the starter guns are among them). Sized in seconds of fire of the
type's guns: a full load ~25 s (most of a boss fight), a pack ~1.5 s, a box
~4.5 s; costs keep every gun of a type draining at about the same rate
(sniper 15 x 1/s ~ minigun 17/s; the lightning gun drains cells fastest).
`ARCH_AMMO` is the one table: type, cost and the damage premium per
archetype.

- Premium (`power`): ammo guns hit harder, so that one of the same rarity
  and level kills ~1.2x as fast as the unlimited guns in a typical fight
  (`tests/fight.mjs` measures how much of its full damage each gun really
  deals - the FIGHT table of the balance test). Guns whose shot undersells
  in a real fight get the most: super shotgun and spreader 2.5 (pellets and
  fans spread wide), sprayer 2.15, shotgun 2.1, plasma 1.75 (slow orbs miss
  movers), nail grenades and flamer 1.6, rocket and minigun 1.35, disc and
  javelin 1.3, grenade 1.25, harpoon 1.15, crossbow 1.05. Railgun, sniper
  and lightning gun get none: pierce and chains already make them ~1.45-1.55x
  - they are the powerful guns the ammo limit is for. With three ammo slots,
  and the epic art all ammo guns, the best ammo gun ends up ~1.35-1.9x the
  best unlimited one. The sidearm is a pistol: no premium.
- A shot costs once: pellets, fans, rings, helix, multishot and double tap
  never cost extra; the minigun spends only once it actually fires.
- Firing an empty gun: dry click, "NO SHELLS" toast, automatic switch to the
  strongest gun in the 4 slots that still has ammo, else the strongest
  unlimited one. Cycling (wheel / next) skips empty guns. A gun can still be
  selected by number and shows empty. If nothing equipped can fire, an
  emergency SIDEARM (common pistol of the area level, 70% damage, not an
  item) comes out until ammo arrives - the player is never soft-locked.
- Stock lives in the save (`save.ammo`, old saves get the station issue),
  carries over between floors of a run and is clamped to capacity at each
  level start. Capacity: base max x (1 + Ammo Capacity), an affix on body /
  legs / rings, at most +75% in total: more to save up for a boss, never
  more found.
- Sources (70% of everything leans toward the ammo the equipped guns use):
  monsters (normal 10% a pack, elites 35% a pack + 15% a box, bosses 1-2
  boxes for the next floor), level caches (`AMMO_SPOTS` 1-2 boxes + 2-3
  packs times the level size, from `levelgen/ammo.js`: dead ends and side
  rooms off the start -> boss route, beside chests, one box just before the
  boss arena that is always for an equipped gun, at most one pack inside
  it; positions per seed, types picked at load), a pack in every chest
  (`AMMO_CHEST`; deep floors have up to 7), a pack with every new ammo gun
  picked up or bought, a top up to 35% of every type when a new run starts
  at the station ("station issue"), and refills at the station shop.
- Economy (`tests/balance.test.js`): a floor's finds keep one ammo gun
  firing for ~30-45% of the floor's firing time (two types share the
  supply, a little more in total since more of the drops fit), the station
  issue lifts the first floors to ~60-70%, and it is never enough to use
  ammo guns only. Saved up, a boss is fought ~90% on ammo.
- Shop refills: `ammoRefillCost` = 360 x 1.08^(deepest depth - 1) credits
  for a full load of one type (~30-50% of what a floor there pays): a top-up
  before a dive is affordable, buying enough to fire only ammo guns would
  eat the credits upgrades need.
- Pickups take what fits; the rest stays on the floor. A pickup of a full
  type is not pulled in and stays where it is ("SHELLS FULL").
- HUD: type icon + count / max (amber below 25%, red when empty) or an
  infinity mark next to the weapon slots; each ammo gun's slot has a thin
  ammo bar and greys out when empty. The equipment screen lists the six
  stocks; the shop sells refills.

## Level generation (src/game/levelgen)

The world is a height-field grid (floor/ceiling per cell, sky cells, voids,
deep pits with lava / poison / spikes / water, bridges, real stair cells,
railed cell edges) plus detail geometry (`level.deco`: textured boxes, sloped
hand rails, AABB colliders, light fixtures). See `docs/ARCHITECTURE.md`.

- `gen_arch.js` (stations, bases, castles, mansions...): the
  map is split into large spaces, each given a room template - colonnaded
  halls with beams and a dais, atriums with railed balconies, pit rooms with
  bridges over lava / poison / spikes, split levels joined by staircases,
  industrial catwalks over toxic floors, storage bays, control rooms,
  courtyards (castle battlements, military yards...), chapels, reactors and
  the boss arena. Spaces connect through wide openings or doorways in thick
  walls; height differences get grand staircases with hand rails. Zones
  separated by single doorways give clean chokepoints for keyed doors.
- `gen_city.js`: avenues with lane paint and crosswalks, curbed sidewalks with
  street lamps, skyscrapers with setbacks and rooftop machinery, enterable
  lobbies and shops, plazas, parking decks, canals with railed bridges,
  craters, harbours, villages and cemeteries, and a walled boss plaza.
- `gen_lab.js` (bio lab, abandoned hospital): a sealed complex round a central
  multi-storey core - a containment well under a giant specimen tank, or a
  skylit atrium over a collapsed, flooded basement - with galleries up stairs,
  bridges and glass rails, and wings of purpose-built rooms (`lab_rooms.js`,
  `lab_extra.js`): reception, decontamination airlocks with glass partitions,
  wet labs, clean rooms overlooked by observation galleries, specimen halls
  over bio-hazard sumps, cold stores with walk-in freezers, server rooms,
  isolation cells, a hydroponics greenhouse, waste processing, flooded pump
  rooms, offices and security stations; wards, operating theatres with
  viewing galleries and recovery bays, radiology, a cafeteria, pharmacy and
  morgue in the hospital.
- `gen_foundry.js` (clockwork foundry, infernal foundry, meat processing
  plant, volcano base): an industrial plant built round an enormous machine
  hall (ceiling 11-14) - a molten vat (lava, a blood / acid bath, or a gear
  pit full of giant wheels) crossed by low catwalks, steel galleries up
  railed stairs on both long walls joined by a high catwalk, a glazed control
  booth overlooking the floor, furnaces on the end walls, conveyor lines
  under hoppers and overhead travelling cranes with a ladle (a gear, a hook).
  An open-air yard sits at one end (cooling tower, smokestacks, storage
  tanks, an ore-cart track, a pipe bridge on trestles, a lava channel in the
  volcano base). The wings are purpose-built rooms (`foundry_rooms.js`,
  `foundry_wings.js`, props in `foundry_props.js`): the shift house with a
  glazed foreman's office and locker runs, furnace halls tapping into a
  molten channel and pouring pit, production lines with presses (band saws
  and hook rails in the meat plant) and a raised operator platform, control
  rooms with a supervisor dais and screen wall, loading docks with a sunken
  truck bay and containers, pipe galleries over sumps, boiler houses with a
  gallery, ore stores, gear pits (clockwork), carcass hook halls and cold
  rooms (meat plant), magma breaches where the rock breaks in (volcano
  base), and the converter house as the boss arena.
- Caves, canyons, mountains, mazes, halls, rooftops, sky islands and convoys
  have their own generators built on the same toolkit.

Population then places locked doors on chokepoints, guarantees each key is
reachable before its door, and places monsters, chests, props and lights.
`npm test` checks every theme at several depths for solvability, mesh winding,
physics and level quality (texture-role variety, narrow passages).

## Rendering

Low-res target (default 240p, adjustable) upscaled with nearest filtering;
optional 15-bit quantize + Bayer dither. World mesh built once per level;
doors are a dynamic mesh. Sprites are instanced billboards (8-direction
monsters, items, projectiles, particles). Texture array per level with
animated tiles encoded as `layer + frames·1000`.
