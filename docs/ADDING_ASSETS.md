# Adding new art to SEVERDREAD

All uploaded art lives in `art/raw/`. The pipeline `tools/process_art.py`
slices it into game-ready atlases in `assets/` and writes `assets/manifest.json`,
which the game reads at startup. Real art always replaces placeholders
automatically as soon as it is in the manifest.

```bash
pip install pillow numpy scipy     # once
npm run art                        # = python3 tools/process_art.py  (all sheets)
python3 tools/process_art.py <id>  # just one sheet (by its id in art_config.json)
```

**Zero-config path:** any image dropped into the right folder is picked up
automatically with sensible defaults (rows counted, grids detected). Add an
entry to `tools/art_config.json` only when you want names, tags or special
handling.

| Folder | Becomes | Notes |
|---|---|---|
| `art/raw/weapons/<rarity>/` | weapon bases of that rarity | `common`, `uncommon`, `rare`, `epic`, `legendary` |
| `art/raw/enemies/` | standard monsters | id = file name without a leading number |
| `art/raw/bosses/` | boss monsters | same |
| `art/raw/textures/` | wall/floor tiles | grid auto-detected |
| `art/raw/textures/animated/` | animated tiles | configure (frames per row) |
| `art/raw/projectiles/` | projectile sprites | configure rows/cols (5x5 so far) |
| `art/raw/items/` | item/armour/ring/key/reagent icons | labelled grids, lines auto-detected |
| `art/raw/doors/` | animated key doors | 4 images: closed, open1, open2, open3 |
| `art/raw/scatter/` | pillars, explosive barrels/props, chests, pedestals, spike traps | frame strips per object (see below) |
| `assets/ui/` | logo, credits splash | used directly (no processing) |

---

## Weapons

Sheet layout (as uploaded): one weapon per row. Columns 1-7 = first-person
frames (1 idle + 6 firing), column 8 = the dropped/inventory icon. Some sheets
have 6 FP frames + icon (set `"cols": 7, "fpFrames": 6`). Touching frames are
detected and split automatically.

To give the weapons proper names, archetypes and elements, add the sheet to
`tools/catalog_weapons.py` (one line: default archetype + per-row overrides)
and run it, or edit `tools/art_config.json` directly:

```json
{ "id": "w_rare_20", "type": "weapon_set", "rarity": "rare", "archetype": "rifle",
  "src": "art/raw/weapons/rare/rare_20.webp",
  "outFP": "assets/sprites/weapons/w_rare_20_fp.png", "outIcons": "assets/sprites/weapons/w_rare_20_icons.png",
  "weapons": [ { "id": "w_rare_20_0", "name": "Storm Carbine", "element": "lightning", "archetype": "rifle" } ] }
```

Archetypes (how the gun fires) are defined in `src/data/weapons.js`
(`ARCHETYPES`): pistol, revolver, smg, rifle, lmg, sniper, shotgun,
super_shotgun, minigun, rocket, grenade, nailgun, plasma, rail, flamer,
sprayer, lightning, launcher, spreader, crossbow, harpoon, javelin, shuriken,
blade, mace, club. Add a new archetype there if a weapon needs new behaviour.

Weapons from a rarity sheet only drop at that rarity (common sheets supply
common drops, legendary sheets legendary drops...).

### Barrel axis (guns aim at the crosshair)

The first-person sprite of a gun is placed so that its barrel, extended out
of the muzzle, runs through the crosshair, and shots leave the drawn barrel
tip along that line. The barrel is measured from the idle frame of the
processed atlas and stored in the weapon's `fp` metadata (frame pixels):

| field | meaning |
|---|---|
| `barrel` | `[dx, dy]` unit vector along the barrel, pointing out of the muzzle |
| `tip` | `[x, y]` the barrel tip on that axis (where shots leave) |
| `barrelQ` | confidence 0..1; below 0.5 the game keeps the old fixed placement |

```bash
python3 tools/weapon_barrels.py           # (re)measure every gun, update fp in the manifest
python3 tools/weapon_barrels.py --check   # print the measurements, write nothing
```

`process_art.py` runs the same measurement on every weapon sheet it slices,
so re-processing a sheet keeps (and refreshes) its barrels; running
`weapon_barrels.py` twice changes nothing. The tip sits next to the baked
muzzle flash (`fp.muzzle`); the axis runs from the centroid of the gun above
the hands to that front end and snaps onto a long straight barrel edge when
there is one. Blobby emitters, barrels seen end-on, axes pointing sideways or
a flash beside the axis get a low confidence. Melee and thrown weapons are
not measured. To check new art visually, set `SEVERDREAD.debugBarrel = true`
in the browser console: the drawn barrel line (cyan when measured and
trusted, orange otherwise) should run along the barrel into the crosshair.

## Monsters & bosses

Sheet layout: 8 rows (front, front-left, left, rear-left, back, rear-right,
right, front-right) x 8 columns (idle, walk 1-4, wind-up, attack, recover).
Labels, titles, grid lines and table backgrounds are removed automatically.
Two monsters on one sheet: add two config entries with `"half": 0/1`
(side by side) or `"vhalf": 0/1` (stacked). Missing frames are mirrored or
filled with idle; a missing 8th row is mirrored from front-left.

Then give the monster gameplay in `src/data/enemies.js` (one line each):

```js
['razor_mantis', 'Razor Mantis', 'alien', 'M', 'void', 'wall fast', null, 4],
//  id            name           category atk element traits     shot colour  first depth
```

- attack: `M` melee, `R` ranged (shoots), `B` breath (short stream)
- traits: `fly`, `wall` (crawls walls/ceilings: 4+ legs / spider-like),
  `tp` (teleports: robots), `fast`, `tank`, `charge`, `beam`, `explode`, `shield`
- shot colour: picks a matching energy projectile from the projectile sheets
  (purple, blue, cyan, orange, green, red, white, yellow)

Big bosses with custom specials live in `src/data/bosses.js`.

## Textures

Any grid of tiles with dark separators works; the grid is detected
automatically. Tags drive which level themes use a tile, so for good results
add the sheet to `tools/catalog_textures.py` with a tag string per tile
(e.g. `'metal rust vent industrial'`). Colour tags (red, dark, glow...) are
added automatically. Themes request tiles by tags in `src/data/themes.js`
(`TP` presets); tiles tagged `glow` are drawn emissive, `hazard`/liquids are
preferred for lava/acid/water pools.

Animated tiles: one tile per row, N frames left to right:

```json
{ "id": "anim_x", "type": "animated_texture", "src": "art/raw/textures/animated/anim_x.webp",
  "out": "assets/textures/anim_x.webp", "rows": 10, "frames": 4, "fps": 6,
  "tags": ["liquid"], "tileTags": [["=deep_ocean ocean deep blue"], ["..."]] }
```

## Items, projectiles, doors

- **Items** (`item_grid`): labelled 5-column sheets. Map icons to uses in
  `src/data/itemart.js` (armour pools, ring pools, key cards, reagent icons,
  chest, coin). Ammo icons are intentionally unused (weapons have no ammo).
- **Projectiles** (`sprite_grid`): 5x5 grids. `src/data/itemart.js` lists
  which sheets are bullets/rockets (player only) and which energy sheets
  enemies may fire. Side-view sprites (comets, arrows) use `"direction": "right"`
  and are rotated along their flight path.
- **Doors** (`door_frames`): designs in columns, key colours in rows
  (red, blue, yellow, green, purple); black areas in the opening frames become
  see-through.

## Texture roles (logical textures)

Levels never pick raw tiles: every surface and object asks for a ROLE (wall,
floor, ceiling, trim, pillar, beam, crate, console/machine, panel, pipe,
grate, stair, rail, light, lava, poison, spikes, water, facades, road,
sidewalk, roof, glass, rock, ground, foliage, metal, wood, screen, paint,
neon, carpet...). `src/data/texroles.js` lists, per role and theme family,
the tiles that genuinely fit (checked against the atlases), plus an avoid
list and per-role UV scales. To use a new texture sheet logically, add its
tiles there under the roles they fit. Roles with no fitting tile fall back to
procedural placeholders from `src/art/textures_gen.js`.

## Scatter terrain

`tools/process_art.py` slices the sheets in `art/raw/scatter/` into
`assets/sprites/scatter/*.png` (manifest `scatterSets`): tall pillars and
stumps, explosive props and barrels (4 frames: intact, damaged, exploding,
debris), closed/open chest pairs, pedestals and 3-frame spike traps.
`src/data/scatter.js` maps theme families to object styles; placement is in
`src/game/levelgen/scatter.js` and behaviour (explosions, chain reactions,
traps, pedestal items) in `src/game/scatter.js`.

## Title art

`assets/ui/logo.webp` is the title logo. The blood drips come from
`assets/ui/logo_drips.json` (points on the logo where blood is exposed); if
you replace the logo, regenerate that file from the blood-red pixels along
the bottom edges of the art. `assets/ui/credits.webp` is the pre-title
splash.

## Checking your work

```bash
npm test                                   # levels + items
npm start &                                # then:
node tests/play.mjs /tmp/shots             # full playthrough screenshots
node tests/play.mjs /tmp/shots hell,castle # screenshot specific themes
```

You can also force a theme in the browser: `index.html?theme=castle`.
