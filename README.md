# SEVERDREAD

An AI Generated FPS called Severdread - Directed/Produced by Jamie Herrington (Blastorama Gaming)

A DOOM-styled, procedurally generated looter shooter that runs in the browser:
**Safari on iOS (landscape, touch controls)** and desktop browsers (WASD + mouse).

Start on orbital station **AEGIS-9** above the ruins of Earth, gear up with the
station's robot crew, then teleport down into endlessly generated, ever harder
possessed levels. Kill every monster and the boss to open the portal, then
descend deeper or return to the station to sell and upgrade. Dying ends the run
(back to depth 1) but you keep your level, gear and bag.

## Play locally

```bash
npm start            # serves the folder on http://localhost:8080
```

Any static file server works (the game is plain ES modules, no build step).
Open it on a phone on the same network for touch controls. Add to Home Screen
on iOS for full-screen play.

| Desktop | Touch |
|---|---|
| WASD move, mouse look | left half: move stick, right half: look |
| Left click fire, right click / Shift dash | FIRE (drag to aim), DASH, JUMP |
| Space jump (multi-jump with rings) | tap the 1-4 weapon slots |
| 1-4 / wheel switch weapon, Q last weapon | USE appears near NPCs, chests, portals |
| E use, Tab/I equipment, Esc pause | BAG and II (pause) top-right |

## What's in the game

- **Rendering**: WebGL2, low-res render target with nearest-neighbour upscale,
  15-bit colour + ordered dither, DOOM-style light diminishing, sector lighting,
  dynamic coloured lights, animated sky (ruined Earth, Mars, hell, storms,
  black hole...), billboarded 8-direction sprites with palette swaps, glows,
  dissolve effects.
- **75 level themes** (all 44 from the brief + 31 originals). Interiors are
  built from big spaces: colonnaded halls, atriums with railed balconies, pit
  rooms with bridges over lava / poison / spike pits, split levels, industrial
  catwalks, control rooms, reactors and courtyards, joined by wide openings and
  real staircases with hand rails. Cities have skyscraper-lined avenues with
  lane markings, sidewalks, street lamps, lobbies, plazas, parking decks,
  canals with railed bridges and a walled boss plaza. Caves, canyons,
  mountains, mazes, halls, rooftops, sky islands and convoys each have their
  own generator. Every surface and object gets a texture chosen for its role
  (floor, wall, trim, pillar, crate, console, rail, stair, facade, road...),
  from the uploaded sheets (1,273 tiles, 50 animated).
- **Coloured keys and locked doors** (red/blue/yellow/green/purple) with the
  uploaded 4-frame door animations, placed so every level is solvable.
- **129 uploaded monsters** (86 enemies, 43 bosses) + palette-swap variants
  (molten, frost, toxic, void, gilded...) and elites. Melee rushers, ranged
  shooters, breath attacks, robot teleporters, wall/ceiling-crawling
  spider-likes that leap between floor and ceiling, flyers, boss charges,
  shockwaves, novas, summons and gravity pulls.
- **656 uploaded weapons** across 26 archetypes (pistols, revolvers, SMGs,
  rifles, LMGs, snipers, shotguns, super shotguns, miniguns, rockets, grenade &
  nail-grenade launchers, plasma, railguns, flamethrowers, lightning guns, disc
  launchers, spreaders, crossbows, harpoons, javelins, throwing stars, blades,
  maces, clubs), tiered by rarity sheet. Random stats, elements (fire, frost,
  shock, toxic, void, holy, plasma, blood, arcane) with status effects, and
  "crazy" fire patterns: fan shots up to 12, burst rings up to 32, bouncing,
  helix, serpent waves, crescents, homing, splitting, floor+ceiling rift rails,
  explosive, orbital, nova, piercing, arc-link chains.
- **Armour (head/body/legs) and 4 ring slots** with 40+ stat affixes and 48
  abilities (double/triple/quadruple jump, extra dashes, air dash, blink, glide,
  jet thrusters, wall jump, meteor fall, orbiting blades, combat drone, static
  field, immolation, frost aura, chain lightning, corpse bombs, second wind,
  bullet time, gravity wells...).
- **Rarities**: Common (white), Uncommon (green), Rare (blue), Epic (purple),
  Legendary (animated gold/orange), with loot beams and drop rates to match.
- **Progression** to level 200 with a dripping-blood "YOU'RE NOW LEVEL N"
  celebration and synthesized fanfare. Enemies, bosses and loot scale with depth.
- **Station NPCs**: arms dealer (buy/sell uncommon-epic gear), gunsmith,
  armorer and ringsmith (upgrades costing credits + monster/boss reagents),
  quartermaster (bag 40 → 200 slots, +5 per upgrade).
- **Pickups**: credits, 17 reagents, red health / blue armour / gold credit orbs.
- **Gore**: kills explode into blood mist, droplets, bouncing gibs and
  splatter painted on walls and floors; blood hits the camera lens and drips
  down and off the screen (gore level and lens blood in Settings).
- **First-person weapons** anchored DOOM-style: hands come up from the bottom
  of the screen, one-handed weapons sit right of centre, shots leave from the
  drawn muzzle.
- **Audio**: every sound and the per-theme music are synthesized with WebAudio.
- Saves automatically to localStorage.

## Project layout

```
index.html, css/            page shell + menu/HUD styles
src/main.js                 boot + main loop
src/engine/                 WebGL renderer, shaders, input, audio, asset loading
src/game/                   game flow, world, player, monsters, combat, items, content registry
src/game/levelgen/          level generators + station hub
src/data/                   ALL tunable data: themes, monsters, bosses, weapons, affixes, abilities, balance...
src/ui/                     HUD canvas, DOM menus, touch controls
src/art/                    procedural placeholder art (used until real art exists)
art/raw/                    the uploaded source sheets
assets/                     processed, game-ready atlases + manifest.json (generated)
tools/process_art.py        the art pipeline (slices raw sheets -> assets/)
tools/art_config.json       per-sheet config: names, tags, archetypes, rarities
tests/                      level/item unit tests + headless browser playthroughs
docs/                       ADDING_ASSETS.md, DESIGN.md
```

## Adding new art

See **[docs/ADDING_ASSETS.md](docs/ADDING_ASSETS.md)**. Short version: drop the
image in `art/raw/<category>/`, run `npm run art`, and it's in the game.

## Tests

```bash
npm test                               # every theme generates & is solvable; item generation
npm start & node tests/play.mjs out/   # headless playthrough with screenshots
```
