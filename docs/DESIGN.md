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
- Monster HP `1.085^d · (1 + 0.04d)`, damage `1.065^d · (1 + 0.02d)`,
  count `12 + 1.6d` (capped 70), elite chance up to 30%.
- Drops: item level = player level −2 … +5. Rarity weights shift with depth
  and Item Rarity stats. Bosses always drop 2-4 items (first one rare+),
  boss reagents and a gold credit orb.
- Upgrades: +8% power per level (+ quadratic), max +5 … +15 by rarity, cost
  credits + reagents that change as levels rise (boss-only reagents at higher
  levels). Bag: +5 slots per upgrade, 40 → 200, escalating cost.

## Level generation (src/game/levelgen)

The world is a height-field grid (floor/ceiling per cell, sky cells, voids,
hazards, bridges). Generators by archetype: `rooms` (BSP), `caves` (cellular
automata), `city`, `rooftops`/`islands` (platforms over a void), `convoy`
(vehicles, scrolling road), `canyon`, `hall`, `maze` (+ Back Rooms), `mountain`,
`castle`. Population then fortifies the boss arena with a single gate, puts
locked doors on chokepoints, guarantees each key is reachable before its door,
and places monsters, chests, props and lights. `npm test` checks every theme
at several depths for solvability.

## Rendering

Low-res target (default 240p, adjustable) upscaled with nearest filtering;
optional 15-bit quantize + Bayer dither. World mesh built once per level;
doors are a dynamic mesh. Sprites are instanced billboards (8-direction
monsters, items, projectiles, particles). Texture array per level with
animated tiles encoded as `layer + frames·1000`.
