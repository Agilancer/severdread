# SEVERDREAD level architecture (v2)

Shared contracts between level generation, physics, rendering and effects.

## Grid (`src/game/grid.js`)

Cells are 1x1 world units (player: height 1.6, eye 1.38, radius 0.3, jump
apex 1.4, walk-up step 0.55). Per cell:

| field | meaning |
|---|---|
| `type` | 0 solid, 1 open |
| `floor` | walkable height. **Stairs: the TOP (high end).** Solid cells: wall/building top |
| `ceil` | ceiling height (`SKY_H` = 64 for sky cells) |
| `sky` | 1 = open to the sky |
| `wallTex/floorTex/ceilTex` | texture slot (`TS.*` role) |
| `light` | baked light level |
| `flags` | `F.*` (below) |
| `hazType` | `HAZ.LAVA / POISON / SPIKES / WATER` (with `F.HAZARD` or `F.PIT`) |
| `stairDir`, `rise` | stair cells: `1 + dir` of ascent and height gained across the cell |
| `edge` | blocked edges (`EDGE_BIT[dir]`), set symmetrically by `setEdge` - rails, fences, glass |

Flags: `HAZARD` (damaging floor), `VOID` (bottomless), `DOOR`, `NOSPAWN`, `ARENA`,
`BRIDGE` (thin deck), `START`, `WATER`, `SCROLL`, `PIT` (deep pit with a visible
bottom: rescue after landing), `OBSTACLE` (solid deco covers the cell: monsters
path around it), `STAIR`, `OUTDOOR`, `UVROT` (floor texture rotated 90 deg).

Directions: `0 +x, 1 -x, 2 +z, 3 -z` (`DIR_X`, `DIR_Z`, `OPP`).

Exact heights: `floorAtPos(i, x, z)` (stairs are ramps physically),
`edgeFloor(i, dir)` (height at the middle of an edge), `minFloor(i)`.
`passable(a, b)` uses edge heights, refuses blocked edges and side entry onto
stairs. `bfs(starts, {step, jumpGap, avoid, blocked, allowVoid})`.

## Doors (`level.doors`)

A door covers a straight **span** of cells across a passage: `{cell, cells,
x, z, x0, z0, x1, z1, axis, color, slot}`. `axis` is the travel axis ('x':
the passage runs along x, the span along z), `cells` all door cells (all
`F.DOOR`), `cell`/`x`/`z` the centre cell, `x0..x1 / z0..z1` the footprint.

- `doorSpan(g, i, maxW)` (levelgen/common.js): a run of up to `maxW` open
  cells on one floor, walled (solid) at both ends, open in front and behind.
  `findChokeSpans()` walks the start -> boss path and keeps spans whose
  closing cuts the boss off (jump gaps included).
- Keyed (coloured) doors are **3 wide x 3 tall** (`floor + 3`, lintel drawn
  by the mesh, cells in front / behind get at least that head room). The
  generators build their keyed gates as 3-wide doorways (gen_arch gate
  connections, natural `gateWall`, mazekit `buildGate`, platkit gatehouses,
  the city boss plaza); narrower spans are only a fallback. A gen_arch gate
  between rooms at different heights is flat and takes its stairs as a
  flight in one of the rooms; with `opt.gateLanding` (the starship) that
  flight ends in a flat landing in front of the doorway, so the span has
  level floor on both sides.
- Plain doors stay 1 cell wide (passage height, at most 3.5).
- World (`world.js`): `doorByCell` / `doorAt` map every door cell; doors
  open when the player (or a monster) comes near the whole footprint. Each
  door face shows ONE picture stretched over the opening (u 0..1 across, v
  bottom to top, never mirrored): key doors animate the door-frame sheet
  (the open frame keeps its border, opening carved down to the floor), the
  fallback / plain doors are slabs rising into the ceiling.

## Detail geometry (`src/game/levelgen/deco.js` -> `level.deco`)

```
level.deco = {
  boxes:     [{x0,y0,z0,x1,y1,z1, tex, uv:'world'|'fit', s, faces, emissive, lightMul}],
  bars:      [{a:[x,y,z], b:[x,y,z], w, h, tex}],      // sloped hand rails etc.
  colliders: [{x0,y0,z0,x1,y1,z1, shots}],              // solid AABBs
  lights:    [{x,y,z,color,radius,flicker,pulse}],      // fixture lights (also in level.lights)
}
```

`tex` is a slot number or `{top, bottom, side, px, nx, pz, nz}`. `faces` is a
`FACE` mask. Builders: `box`, `collider`, `pillar`, `beam`, `wallTrims`,
`railRun`, `railEdges`, `stairs` (+ `stairRails`), `crate`, `crateStack`,
`container`, `console`, `lightPanel`, `wallLight`, `streetLamp`, `pipe`, `car`,
`barrier`, `planter`, `table`, `shelf`, `window`. Solid deco marks covered cells
`OBSTACLE | NOSPAWN`; rails set grid edge bits so pathing never crosses them.

## Texture roles (`TS` in `src/game/levelgen/common.js`)

56 slots. Every surface and object references a role, never a raw tile, and
the level texture picker fills each role with a tile that logically fits it
(a crate texture on crates, a floor texture on floors, facade windows on
skyscrapers...). Roles: WALL, WALL2, FLOOR, FLOOR2, CEIL, ACCENT, SIDE, DOOR*,
HAZARD, VOID, SPECIAL, TRIM, PILLAR, BEAM, CRATE, CRATE2, MACHINE, PANEL, PIPE,
GRATE, STAIR, RAIL, LIGHT, LAVA, POISON, SPIKES, WATER, FACADE(2,3), ROAD,
SIDEWALK, ROOF, GLASS, ROCK, GROUND, FOLIAGE, METAL, CEIL2, FLOOR3, PITWALL,
WOOD, SCREEN, PAINT, NEON, CARPET.

## Mesh (`src/game/worldmesh.js`)

`buildWorldMesh(grid, slots, {deco, voidY, voidPlane, spikeSlot})`. Back-face
culling is on: quads are CCW seen from the front (`tests/mesh.test.js` checks
every triangle). Slots carry `{layer, emissive, scroll, uvScale}`.

## Scatter terrain (`level.scatter`, `src/game/levelgen/scatter.js`)

Pillars, explosives, pedestals, spike traps and computer terminals. Placement
records cells, positions, styles and a seed; `game/scatter.js` picks the art
at load. Solid objects add a deco collider, mark their cells
`OBSTACLE | NOSPAWN` and pass a reachability check (`keepsReach`: nothing
reachable before - doors open, or each set of locked doors shut - may be cut
off).

- `terminals`: `{cells, x, z, y, wall, gap, slot, maxH, ci}`. `wall` is the
  direction of the wall behind (-1: island); the sprite stands `gap` off it
  and narrows at glancing views instead of cutting into the wall. Never on
  doors, stairs, bridges, pits, hazards, near the start / boss / portal.
- `wallTerminals`: `{cell, wall, line, along, off, lo, hi, maxW, ci}`. A flat
  panel on the face of the solid cell in direction `wall` (plane `line`,
  centred at `along`), drawn with sprite billboard mode 3 (x walls) / 4
  (z walls) with u flipped on the -x / +z walls so it reads left to right.
  `lo..hi` is the free band of wall (above wainscots, under crown bands),
  `off` the depth of any trim skin it sits on. Never on window / facade /
  door / screen walls, by doors, stairs or rails, or behind detail boxes.
  Its thin collider (`obstacle: false`) only lets shots spark it.
  `placeWallTerminals` is shared with the hub.
