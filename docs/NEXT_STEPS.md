# Where development left off

Handoff notes for the next session. Work now continues on
`claude/sharp-rubin-gow68w`, which carries everything from the earlier
`claude/keen-johnson-4x7qh9`. Develop and push only on the session's branch;
open no PRs unless asked. The live build is at
https://agilancer.github.io/severdream/.

`npm test` runs 12 suites, and all pass at the end of this session. The
newest suite, `tests/retries.test.js`, is described below. The menu fuzzer
also passes on keyboard and touch: start the server with `npm start`, then
run `node tests/uifuzz.mjs [steps] [seed] [touch]`.

## Done in this round

### Ammo review (to-do item 1 of the last round)

**Fixed:**
- Selling or unequipping the selected gun mid-run left the trigger dead
  (`currentWeapon()` was null). `Player.updateWeapon` now auto-switches to a
  gun that can fire, or to the sidearm. The same path recovers old saves
  whose selected slot is empty.
- The shop could sell the last equipped weapon. Selling an equipped gun now
  keeps at least one weapon and cycles off the sold slot, like unequip.
- Taking off an Ammo Capacity item destroyed the surplus at the next level
  start. `sanitizeAmmo` now only repairs bad counts (NaN, negative,
  fractional). Surplus is kept until spent; pickups, the issue and refills
  add nothing above capacity.
- A boss's summoned monsters dropped ammo, an endless supply in boss fights.
  They now drop none.
- The map radar now shows ammo packs and boxes in their type colour, dimmed
  when that type is full, with an AMMO legend entry.
- `tests/ammo.test.js` covers the empty slot, the surplus and bad counts.

**Checked, no change needed:**
- The economy (`node tests/balance.test.js -v`). At every depth ammo carries
  about 30-50% of a floor's firing time, and about 90% or more of the boss
  fight. A full refill costs 20-32% of a floor's credits (cheaper deeper
  down), so nothing is starved or flooded.
- The HUD and icons at 844x390 touch and at 1280x720 desktop. They read
  well: the count against capacity, the type icon, and the empty slot greyed
  with a red bar.
- One known nit remains: at 844x390 the equipment screen still needs a short
  scroll once an item card is open.

### Mansion finished (item 2)

- **Root causes of the generator retries, both fixed:**
  - `pickCP` drew two random offsets. With one candidate it could index
    `ok[-1]`, leaving a link with no position, which cut off the graveyard.
  - French windows and service doors onto a yard ignored the mausoleum
    standing 1-3 cells from the wall, so its wall boxed in their stoop
    steps.
- The mansion now builds with zero retries in 300 levels (60 seeds x depths
  1/4/9/20/40).
- Screenshots of every room look right.

### New retry guard

`tests/retries.test.js` (in `npm test`) builds every lab, foundry, starship,
mansion and prison theme over 5 seeds x depths 1/4/9/20. Any generator retry
or fallback fails the suite. Pass a seed count as the first argument for a
deeper sweep.

### Prison archetype (item 3)

The prison is `gen_prison.js`, with `prison_rooms.js`, `prison_grounds.js`
and `prison_props.js`, for `prison_complex`. It is a planned compound on the
mansion's plan system: rooms in local frames, a spanning tree of doorways,
gates on the path to the boss and loops inside zones. The second cell block
is turned 180 degrees, so `portOf` maps doorways into each room's own frame.

- **Forecourt:** the vehicle gate with a gantry, a gatehouse with a raised
  boom, the drive, parking bays, the bus and cars, the entrance canopy, a
  flag and floodlight masts.
- **Admin range:**
  - intake: detectors, X-ray belt, glazed reception counter, holding cage,
    property shelves
  - infirmary: curtained ward beds, IV stands, med cabinets, an operating
    table under its lamp
  - warden's office: desk, flags, bookcases, filing cabinets, sofa, safe
  - armory: gun racks, lockers, ammo crates
- **Control hub:** a glass guard booth on a 1.8 m railed dais with consoles
  and a flight up. Painted lanes, a monitor bank, sally-port gates standing
  open with signal lamps.
- **Cell blocks (x2), ceiling 11.4, skylit:**
  - 3x3 ground cells as alcoves off a 12-15 wide block floor. Each has a
    bunk, a steel toilet, a shelf and a barred front with the door parked
    open.
  - A tier-2 gallery of cells along the other wall, reached by two steel
    flights with landings and railed everywhere.
  - Tiers 2 and 3 above the ground cells, and tier 3 above the gallery, are
    painted onto the high walls with ledges and rails. A height field cannot
    stack walkable tiers.
  - Steel tables with stools, a warning line, pendant strips, cameras, a TV.
- **Mess hall:** serving counter, rows of tables.
- **Laundry:** washers and dryers, folding tables, carts. A 3.6 m boiler pit
  with stairs down, rails and the boiler; it fits in about 90% of laundries.
- **Solitary wing:** a corridor and heavy-door cells under red lamps.
- **Yard:** watch towers (platforms at 4.8 up steel flights, open guard
  posts with searchlights), a fenced basketball court with gaps, picnic
  tables, weight benches, benches, floodlight masts.
- **Exterior:** brick facades with barred slit windows, string courses,
  parapet and floodlights. The perimeter wall carries razor wire and lamps.
- **Routes:** 3-wide sally ports carry the keyed gates. The boss is in the
  yard, the mess hall or cell block B.
- **Checks:** 0 retries in 300 levels. About 5,400 deco boxes per level,
  below the mansion's 6,700. 35 distinct textures in use, set in the
  `prison_complex` entry of `THEME_TEX` (texroles). There are no scatter
  pillars (`THEME_SCATTER`).
- **Theme:** now archetype `prison` with a night sky. The maze generator's
  prison skin remains only as its fallback skin.

### Docs

`docs/DESIGN.md` now describes the mansion and the prison generators.

## To do next, in priority order

1. **Review lab, foundry, starship, mansion and prison together.** Check:
   - logical spaces and rails at every drop
   - 6+ logical textures per room and 3-wide keyed gates
   - bosses fitting everywhere and mesh size
   - zero retries (now enforced by `tests/retries.test.js`)

   Ideas for the prison:
   - a gun walk round the hub at tier 2
   - showers
   - real walkable tier-3 galleries (needs box-top walkways that monsters
     can path on, which the engine has not got yet)
   - a darker solitary
2. **Batch B archetypes** (10 were requested; 5 are done: lab, foundry,
   starship, mansion, prison). The remaining briefs:
   - **colony** (mars_base, venus_base, lunar_colony, frozen_outpost): an
     outdoor alien surface with habitat domes joined by 3-wide windowed
     tubes, a landing pad, command dome, hydroponics, reactor, comms masts
     and a rover garage. Theme hazards: lava vents, acid pools, crevasses
     with bridges.
   - **fortress** (military_base, possessed_military, ruined_military): a
     walled compound with watchtowers, a main gate, trenches, pillboxes,
     barracks, a motor pool, a helipad, and an underground bunker with wide
     corridors, blast doors and a war room. The ruined variant is shelled;
     the possessed variant is corrupted. Much of the prison's kit fits here:
     perimeter wall, razor wire, towers, floodlights, the gatehouse.
   - **temple** (sunken_temple, jungle_ruins): a stepped pyramid of 4-6
     railed terraces with stairs, causeways, courtyards with obelisks, and
     inner chambers. The sunken temple is partly flooded; the jungle ruins
     have dense jungle, a river and rope bridges.
   - **cathedral** (flesh_cathedral, necropolis): a tall nave (12-16) with
     side aisles, a transept under a dome, an apse with an altar, a choir
     loft with railed stairs, a bell tower, a crypt below, and a cloister
     garden. The flesh cathedral is organic horror; the necropolis adds
     graveyard terraces and mausoleums.
   - **sewer** (sewer_labyrinth, subway_tunnels): brick channels of sludge
     with railed walkways on both sides, bridges, cistern junctions, a
     pumping station, weirs, and an open storm-drain outfall. Subway tunnels
     get tracks, platforms, a concourse and an abandoned train. Tunnels are
     3-5 wide with loops, never a 1-wide maze.
3. **More logical interiors and exteriors for the existing archetypes.**
4. **The 844x390 equipment-screen scroll** when an item card is open (see
   the ammo review).

## How the archetypes were built (reuse it)

- **Generator layout:**
  - Each archetype is a generator in `src/game/levelgen/gen_<key>.js`,
    registered in `GENERATORS` in `levelgen/index.js`.
  - Themes are assigned via `archetype` in `src/data/themes.js`.
  - Texture roles live in `src/data/texroles.js`: `THEME_TEX` per theme.
    Core slots must not reuse a tile; `tests/textures.test.js` checks this.
- **Toolkit:**
  - `grid.js`, `levelgen/common.js` and `deco.js`, plus `gen_arch.js` (BSP
    rooms and templates; optional hooks `layout`, `loopChance`, `noFlight`
    and `floorSlot`).
  - For planned buildings: `mansion_kit.js` (Frame, Kit with free / take /
    keepsPath / flight / rail / onWall) and the plan, route and port code
    in `gen_mansion.js` / `gen_prison.js`. A new planned archetype can start
    from `gen_prison.js`, which is the cleanest copy. Its `portOf` handles
    rooms turned in their own frames.
- **Verification scripts used this round** (in the session scratchpad, easy
  to rewrite):
  - A retry sweep: `generateLevel` per theme x seeds x depths, counting
    console warnings that contain "retrying".
  - A room-reachability dump per room kind (the `__PRISON_NOCHECK` /
    `__MANSION_NOCHECK` globals skip the route check).
  - Playwright viewpoint shots. Load a level with `g.debugTheme` and
    `g.debugSeed`, then `spawnAt` a cell picked by room kind and floor
    height. `level.rooms` gives `x`, `z`, `w`, `h`, `template`; note it has
    no `cx`.
  - Contact sheets of the texture atlases with row/column labels, used to
    pick tiles.
- **How the work was run:**
  - In earlier rounds, one builder agent per archetype, working sequentially
    in a shared worktree and committing early. When a usage limit
    interrupted an agent, its work was committed as "WIP ..." and resumed
    with a note telling it to continue.
  - This round the work was done directly in the session, test suites one
    at a time.
- **Standing level-design requirements from the user:**
  - large areas with tall ceilings
  - lava, poison and spike pits, bridges, outdoor areas
  - real stairs with hand rails, and guard rails at every drop
  - at least 6 textures per room, each on a logical surface
  - far more complexity
  - must run well in iOS Safari (touch) and on desktop
