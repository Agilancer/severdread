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
- Monster HP `1.085^L · (1 + 0.04L) · (1 + ramp)`, damage
  `1.065^L · (1 + 0.02L) · (1 + 0.6 ramp)`, where `ramp = 1 − e^(−(L−1)/6)`
  is how much of a full kit of on-level gear a player has picked up (0 on
  depth 1, ~0.85 by depth 12). Count `12 + 1.6d` (capped 70), elite chance up
  to 30%.
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
- `tests/balance.test.js` plays a first run down to depth 60 with the real
  item / stat code and checks that a standard monster still takes about as
  long to kill as on depth 1 with the starting pistol (~0.6 s), and that it
  takes 6–18 monster hits to die, through depth 30.

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
