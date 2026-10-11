# Where development left off

Handoff notes for the next session. The branch is `claude/keen-johnson-4x7qh9`
(develop and push only there, no PRs unless asked), and the live build is at
https://agilancer.github.io/severdream/. `npm test` runs 11 suites; all pass at
the end of this session. The menu fuzzer passes on keyboard and touch:
`node tests/uifuzz.mjs [steps] [seed] [touch]`, with the server running via
`npm start`.

## Done in this round

- **Damage balance.** Item level follows depth (`areaLevel`). Monsters have a
  gear ramp. Pattern and multishot damage is split across projectiles, flat
  attack is scaled per hit, and rarity bonuses and upgrades are softer.
  `tests/balance.test.js` guards all of this.
- **Ammo system**, using the uploaded "AMMO & UPGRADES" sheet `items_06`:
  - Six pools: shells, heavy, explosives, cells, fuel, bolts. The strong guns
    use ammo. Pistol, revolver, SMG, rifle, LMG, shuriken and melee never run
    dry.
  - Ammo packs and boxes are placed in every level. Monsters drop ammo, bosses
    drop boxes, and every chest holds a box.
  - New runs top every type up to 50%, and the shop sells refills.
  - An empty gun auto-switches. A SIDEARM fallback means the player can never
    be soft-locked.
  - HUD, tooltip and equipment-panel ammo readouts.
  - The game sets the damage premium per ammo weapon and the economy numbers
    (`src/data/ammo.js`, `src/data/balance.js`). `tests/ammo.test.js` and the
    ammo bands in `tests/balance.test.js` guard them.
  - Code: `src/data/ammo.js`, `src/game/ammo.js`, `src/game/levelgen/ammo.js`.
- **New level archetypes:**
  - lab: bio_lab, abandoned_hospital
  - foundry: clockwork_foundry, infernal_foundry, meat_plant, volcano_base
  - starship: crashed_starship, large_freighter
  - mansion: haunted_mansion. Registered and passing tests, but the final polish
    pass was interrupted; see below.

## To do next, in priority order

1. **Review the ammo system.** The planned adversarial review never ran
   (usage limits). Check three things:
   - Soft-locks and correctness: swapping or selling the selected weapon
     mid-fight, hub/level transitions, old saves, ammo going NaN or negative.
   - The economy: whether ammo is starved or flooded at depths 1/5/10/20/40,
     including a later run at character level 25.
   - HUD and icons on an 844x390 touch screen and on desktop.

   Known caveats from the builder:
   - Ammo above capacity is lost at the next level start after taking off an
     Ammo Capacity item.
   - Summoned monsters also drop ammo.
   - The map/radar doesn't show ammo caches.
   - At 844x390, the equipment screen's ammo panel needs a short scroll.
2. **Finish the mansion** (`src/game/levelgen/gen_mansion.js`, `mansion_*.js`).
   Verify it against the level quality bar: screenshots, and a retry sweep of
   12 seeds x depths 1/4/9/20 with no "level generator failed, retrying". Then
   polish what's weak.
3. **Build the prison archetype** for `prison_complex`:
   - Cell blocks of 2-3 tiers around a tall central atrium, with railed
     galleries reached by stairs.
   - A central guard booth, mess hall, outdoor exercise yard (fences, watch
     towers with stairs), a short solitary wing, warden's office, infirmary,
     laundry/boiler room, and perimeter walls.
   - Sally ports between sections make good 3-wide keyed gates.
   - Cells are alcoves off wide block floors, never a maze of 1-wide dead ends.
4. **Review lab, foundry, starship, mansion and prison together.** Look for
   logical spaces, rails at drops, 6+ logical textures, 3-wide keyed gates,
   bosses fitting everywhere, mesh size, and zero generator retries.
5. **Batch B archetypes** (10 total were requested; 4 are done):
   - colony (mars_base, venus_base, lunar_colony, frozen_outpost): an outdoor
     alien surface with habitat domes joined by 3-wide windowed tubes, a
     landing pad, command dome, hydroponics, reactor, comms masts and a rover
     garage. Theme hazards: lava vents, acid pools, crevasses with bridges.
   - fortress (military_base, possessed_military, ruined_military): a walled
     compound with watchtowers, a main gate, trenches, pillboxes, barracks, a
     motor pool, a helipad, and an underground bunker with wide corridors,
     blast doors and a war room. The ruined variant is shelled; the possessed
     variant is corrupted.
   - temple (sunken_temple, jungle_ruins): a stepped pyramid of 4-6 railed
     terraces with stairs, causeways, courtyards with obelisks, and inner
     chambers. The sunken temple is partly flooded; the jungle ruins have dense
     jungle, a river and rope bridges.
   - cathedral (flesh_cathedral, necropolis): a tall nave (12-16) with side
     aisles, a transept under a dome, an apse with an altar, a choir loft with
     railed stairs, a bell tower, a crypt below, and a cloister garden. The
     flesh cathedral is organic horror; the necropolis adds graveyard terraces
     and mausoleums.
   - sewer (sewer_labyrinth, subway_tunnels): brick channels of sludge with
     railed walkways on both sides, bridges, cistern junctions, a pumping
     station, weirs, and an open storm-drain outfall. Subway tunnels get
     tracks, platforms, a concourse and an abandoned train. Tunnels are 3-5
     wide with loops, never a 1-wide maze.
   - Also: more logical interiors and exteriors for the existing archetypes.

## How the archetypes were built (reuse it)

- Each archetype is a generator in `src/game/levelgen/gen_<key>.js`,
  registered in `GENERATORS` in `levelgen/index.js`. Themes are assigned via
  `archetype` in `src/data/themes.js`, and texture roles live in
  `src/data/texroles.js`.
- The toolkit is `grid.js`, `levelgen/common.js` and `deco.js`, plus
  `gen_arch.js` (BSP rooms and templates; it has optional hooks `layout`,
  `loopChance`, `noFlight` and `floorSlot`).
- One builder agent per archetype, working sequentially in a shared worktree
  and committing early. When a usage limit interrupts an agent, commit its
  work as "WIP ..." and resume with a note telling it to continue that work.
- Standing level-design requirements from the user:
  - large areas with tall ceilings
  - lava, poison and spike pits, bridges, outdoor areas
  - real stairs with hand rails, and guard rails at every drop
  - at least 6 textures per room, each on a logical surface
  - far more complexity
  - must run well in iOS Safari (touch) and on desktop
