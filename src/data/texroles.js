// Texture roles: which uploaded tiles logically fit which surface.
//
// Every surface and object in a level references a ROLE slot (TS.* in
// game/levelgen/common.js), never a raw tile. game/leveltextures.js fills each
// slot for a theme from the tables below:
//
//   1. THEME_TEX[theme.id][slot]        hand-picked overrides for special themes
//   2. ARCHETYPE_TEX[theme.archetype]   e.g. caves/canyons use ROCK for walls
//   3. ROLES[role][family]              for the theme's primary family, then its
//                                       secondary family, then FAMILY_FALLBACK
//   4. ROLE_PH[role]                    a procedural placeholder (art/textures_gen.js)
//
// AVOID removes tiles from roles they look wrong on, ANIMATED_MIS_SLICED is never
// used, TILE_EMISSIVE lists the tiles that really contain a light source (tag based
// "glow" is ignored). The ROLES / AVOID / THEME_FAMILY data was produced by an atlas
// audit of every tile (each candidate was checked against the sheet images).
//
// Tile codes (compact so the lists stay readable):
//   '3:2,0'            tx03 sheet, row 2, column 0      -> tx03_scifi_panels:tx03_scifi_panels_r2c0
//   '11:lava'          named tile of a tx sheet         -> tx11_cave_liquids:tx11_cave_liquids_lava
//   'G:damask_red'     gothic_set_01 tile               -> gothic_set_01:damask_red
//   'A:lava:lava_red'  animated tile                    -> anim_lava:anim_lava_lava_red
// Override entries may also be:
//   '#name'   placeholder spec from PH          '@family'     this role's list for a family
//   '=SLOT'   reuse the tile chosen for SLOT    'role@family' another role's list ('role@' = theme families)

export const SHEETS = {
  1: 'tx01_industrial_4x4', 2: 'tx02_mixed', 3: 'tx03_scifi_panels', 4: 'tx04_scifi_interior', 5: 'tx05_nature_a',
  6: 'tx06_nature_b', 7: 'tx07_nature_c', 8: 'tx08_grimy_industrial', 10: 'tx10_organic_a', 11: 'tx11_cave_liquids',
  12: 'tx12_metal_rust_gradient', 13: 'tx13_rust_metal', 14: 'tx14_industrial_b', 15: 'tx15_castle_stone', 16: 'tx16_organic_b',
  17: 'tx17_hellforge', 18: 'tx18_city_facades', 19: 'tx19_city_windows_doors', 20: 'tx20_rooftops', 21: 'tx21_streets',
  22: 'tx22_luxury_materials', 23: 'tx23_skyscraper_glass', 24: 'tx24_tower_lobby', 25: 'tx25_skyscraper_facade_b',
};

// compact code -> manifest tile key (setId:tileId), as built in game/content.js
export function tileKey(code) {
  if (code.startsWith('G:')) return 'gothic_set_01:' + code.slice(2);
  if (code.startsWith('A:')) { const [, s, n] = code.split(':'); return `anim_${s}:anim_${s}_${n}`; }
  const [n, rc] = code.split(':');
  const sid = SHEETS[+n];
  if (!sid) return code;
  if (rc.includes(',')) { const [r, c] = rc.split(','); return `${sid}:${sid}_r${r}c${c}`; }
  return `${sid}:${sid}_${rc}`;
}
export const codes = (s) => (s ? s.split(/\s+/).filter(Boolean) : []);

export const FAMILIES = ['station', 'industrial', 'hell', 'castle', 'city', 'nature', 'ice', 'desert', 'heaven', 'cyber', 'organic'];
export const FAMILY_FALLBACK = {
  station: ['industrial', 'city'], industrial: ['station', 'city'], hell: ['castle', 'industrial'], castle: ['hell', 'nature'],
  city: ['industrial', 'station'], nature: ['castle', 'desert'], ice: ['nature', 'station'], desert: ['nature', 'castle'],
  heaven: ['castle', 'city'], cyber: ['station', 'city'], organic: ['hell', 'station'],
};

// ---------------------------------------------------------------- role candidates
// role -> family -> tile codes, strongest first. 'side' (ledges, platform sides,
// curbs, balustrade bodies) and the light / accent / stair / neon lists were
// curated on top of the audit.
export const ROLES = {
  wall: {
    station: '3:0,0 3:0,1 3:0,2 3:0,4 3:0,9 3:0,5 4:0,0 4:0,4 4:0,6 12:0,2 12:0,8 12:1,2 12:1,8 12:0,1 1:0,2 14:0,4 14:0,9',
    industrial: '12:2,2 12:2,1 12:3,2 12:3,8 12:2,7 13:0,0 13:0,1 13:0,5 8:0,0 8:0,1 8:0,3 8:0,6 14:0,1 14:0,2 14:0,3 14:0,6 1:0,0 2:0,1 2:0,3 1:3,0',
    hell: 'G:stone_black_bricks G:lava_bricks 17:0,7 17:0,3 17:0,9 17:4,2 15:2,6 11:4,0 11:4,2 15:4,9 2:3,5 10:0,4',
    castle: 'G:stone_dark_bricks G:stone_grey_bricks G:stone_moss_bricks 15:0,0 15:0,4 15:0,9 15:0,3 15:0,6 15:0,7 1:1,0 1:1,1 2:1,9 15:2,0',
    city: '18:2,0 18:2,1 18:2,2 18:2,3 18:2,4 18:2,5 18:2,7 18:3,0 18:3,1 18:3,4 18:3,5 21:3,4 21:3,6 22:0,2 22:2,1 G:brick_red G:plaster_brick_ruin',
    nature: '5:0,0 5:0,2 5:0,6 5:0,9 11:0,0 11:0,6 11:0,7 G:rock_bluegrey 2:1,6 6:3,9 5:2,7',
    ice: '2:1,8 15:2,5 15:2,9 G:frost_rock 5:4,4 6:4,3 7:4,0',
    desert: 'G:sandstone_bricks G:sandstone_cracked 15:0,5 2:1,1 2:1,7 5:0,1 6:0,7 22:0,6',
    heaven: '22:0,1 22:0,9 22:3,3 22:0,2 22:0,3 2:1,5 6:3,7',
    cyber: '14:0,0 3:0,1 22:1,2 22:0,0 22:3,2 25:3,2 8:3,3',
    organic: '10:0,0 10:1,0 10:0,8 16:0,1 16:1,1 2:3,6 10:2,4 16:4,1',
  },
  side: {
    station: '12:0,0 3:0,6 12:0,3 22:1,2 14:0,8 4:0,6',
    industrial: '12:2,0 12:2,3 13:0,0 8:0,0 14:0,8 1:0,0 13:0,5',
    hell: 'G:stone_black_bricks 17:0,9 15:4,9 17:3,0 17:4,2',
    castle: 'G:stone_grey_bricks 15:0,0 15:0,4 G:stone_dark_bricks 15:0,9',
    city: '21:3,4 22:2,1 21:3,6 18:2,5 18:2,8 20:1,7',
    nature: '5:0,0 5:0,2 11:0,0 G:rock_bluegrey 5:0,6',
    ice: 'G:frost_rock 15:2,9 5:4,4 15:2,5',
    desert: 'G:sandstone_bricks 15:0,5 2:1,1 5:0,1 6:0,7',
    heaven: '22:0,1 22:3,3 22:0,9 22:0,3',
    cyber: '22:0,0 22:3,2 14:0,0 22:1,2',
    organic: '10:1,0 16:0,1 10:0,8 16:1,1',
  },
  panel: {
    station: '4:0,1 4:2,3 3:0,3 4:0,5 3:2,9 12:0,3 14:2,5 3:0,6',
    industrial: '14:2,1 14:2,5 13:0,8 12:2,3 8:0,5 4:0,3 14:2,2',
    hell: '17:1,8 17:2,4 17:2,3 17:0,4 17:4,6',
    castle: '15:3,0 15:3,7 G:gothic_quatrefoil G:wood_dark_planks 15:3,5 15:3,6 G:fleur_green',
    city: '22:3,1 22:2,2 22:3,0 18:1,3 18:1,4 22:2,3 22:1,8 G:damask_red',
    nature: 'G:wood_grey_planks G:wood_dark_planks 21:3,9',
    ice: '14:4,8 3:4,7 4:4,0',
    desert: '2:3,1 15:1,9 G:sandstone_bricks',
    heaven: '22:4,0 22:4,6 22:3,0 G:gold_filigree',
    cyber: '22:4,1 22:4,9 22:3,6 14:2,9',
    organic: '10:2,0 16:2,0 16:2,2',
  },
  trim: {
    station: '12:0,3 12:0,0 22:1,0 22:1,2 3:0,6 1:3,1',
    industrial: '1:3,1 4:0,3 12:2,3 13:0,5 14:2,9 8:0,5',
    hell: '17:2,9 17:1,8 17:0,4 17:4,9',
    castle: '15:1,7 15:1,9 G:gothic_tracery 15:4,2 15:4,1 G:star_carving',
    city: '20:3,6 20:3,7 20:3,1 20:3,0 20:3,8 21:3,7 22:4,2',
    nature: 'G:wood_grey_planks 20:3,9 G:wood_dark_planks',
    ice: '22:1,0 15:2,5',
    desert: '15:1,9 G:sandstone_bricks 15:0,5',
    heaven: '22:4,0 22:1,1 G:gold_filigree 20:3,7',
    cyber: '22:4,9 24:4,0 24:4,1 25:2,9',
    organic: '16:0,7 10:0,3',
  },
  floor: {
    station: 'G:hex_dark_floor G:hex_dark_floor_b 3:0,7 8:2,1 4:0,2 2:0,4 14:0,7 22:2,1 22:1,6',
    industrial: '8:2,2 8:2,3 8:2,1 12:1,2 14:0,8 20:1,3 1:1,2 G:small_tile_floor',
    hell: 'G:red_tile_floor G:blood_stone 17:3,6 17:3,1 11:1,1 15:3,8 17:4,2',
    castle: 'G:slab_dark_floor G:checker_floor G:marble_black_floor G:cobble_black 15:0,8 1:1,2 21:0,4 G:small_tile_floor',
    city: '22:2,0 22:2,7 22:2,9 22:0,0 22:2,4 21:0,2 8:2,9 22:0,7',
    nature: '5:1,0 5:1,2 5:1,4 5:1,6 6:1,1 6:1,6 6:0,9 7:1,2 11:1,2 6:0,0',
    ice: '5:3,9 6:4,2 6:4,4 5:4,5 7:4,9 6:4,3 5:4,4',
    desert: '6:1,2 7:1,7 5:1,2 5:1,1 G:sand_tile_floor G:sand_slab_floor 6:4,9',
    heaven: '22:0,1 22:0,9 22:2,0 22:0,3 22:4,6',
    cyber: '22:3,2 22:0,0 22:2,4 25:3,2 25:3,7',
    organic: '10:1,9 16:4,5 10:4,0 16:1,9 10:4,1',
  },
  floor2: {
    station: '4:0,7 2:0,7 8:2,4 14:1,9 8:2,3 22:1,6',
    industrial: '14:1,3 8:2,2 8:2,4 8:2,3 4:1,9',
    hell: '17:1,6 G:red_tile_floor 17:4,2',
    castle: 'G:wood_dark_planks G:checker_floor G:slab_dark_floor 21:0,4',
    city: '21:0,2 21:0,7 21:0,5 22:2,1 22:2,7',
    nature: '6:0,0 5:1,4 6:1,1 5:1,6 7:1,0',
    ice: '6:4,4 G:frost_rock 5:4,5 7:4,9 6:4,3',
    desert: 'G:sand_slab_floor G:sand_tile_floor 21:0,5',
    heaven: '22:0,9 22:3,3 22:4,6',
    cyber: '22:3,4 4:0,7 22:3,2',
    organic: '16:2,1 10:2,2 16:1,2',
  },
  floor3: {
    station: '3:0,7 4:0,2 14:0,7',
    industrial: '8:2,9 8:2,1',
    hell: '15:3,8 17:2,3 G:blood_stone G:lava_rock_floor',
    castle: 'G:mosaic_floor G:star_carving 15:3,8 G:checker_floor',
    city: '21:0,6 21:0,3 22:2,7 22:4,4',
    nature: '6:0,6 5:0,4 6:0,0',
    ice: '6:4,3 7:4,0',
    desert: 'G:sand_tile_floor 2:3,1 21:0,5',
    heaven: 'G:mosaic_floor 22:4,0 22:4,6 22:4,4 21:0,6',
    cyber: '22:4,1 22:4,9',
    organic: '10:3,2 16:3,2',
  },
  floor_border: {
    station: '1:3,1 4:0,3 22:4,9',
    industrial: '1:3,1 4:0,3',
    hell: '17:4,9 17:2,4',
    castle: 'G:small_tile_floor 15:1,9',
    city: '21:1,2 21:1,6 21:1,7 21:1,9 22:4,2',
    heaven: '22:4,0 22:4,6',
    cyber: '22:4,9 24:4,0',
  },
  ceil: {
    station: '3:0,1 12:0,0 12:0,2 12:0,8 4:0,0 4:0,4 14:0,4 3:1,2',
    industrial: '12:2,0 12:2,8 13:0,8 14:1,5 8:2,8 8:1,6 14:0,8',
    hell: '17:4,2 11:0,0 15:4,9 G:stone_black_bricks 17:1,3',
    castle: 'G:wood_dark_planks 15:0,0 G:stone_dark_bricks G:gothic_quatrefoil 15:3,7',
    city: '22:2,1 18:3,1 20:1,3 20:1,7 22:2,9',
    nature: '11:0,0 11:0,6 5:3,6 5:3,7 5:0,2',
    ice: '15:2,9 8:4,3 5:4,4 7:4,0',
    desert: 'G:sandstone_bricks 15:0,5 G:wood_grey_planks',
    heaven: '22:0,1 G:gold_filigree 22:4,0 22:3,3',
    cyber: '22:1,2 25:3,2 22:3,4 14:0,0',
    organic: '10:0,2 16:0,1 10:1,0 16:4,3',
  },
  light: {
    station: '4:0,10',
    industrial: '4:0,10',
    hell: '17:1,0',
    city: '25:2,5',
    ice: '4:0,10',
    heaven: '25:2,5',
    cyber: '4:4,9 4:0,10',
    organic: '16:3,3 10:3,3',
  },
  pillar: {
    station: '12:0,4 3:1,7 14:1,8 3:0,5 22:1,9 24:2,5 4:1,1',
    industrial: '12:2,4 12:3,4 14:1,8 13:0,6 8:1,0 14:2,1',
    hell: '17:0,0 17:0,1 17:0,9 17:2,4 17:4,7 16:0,7',
    castle: 'G:marble_columns 15:4,0 G:stone_grey_bricks 15:0,0 G:gothic_arches',
    city: '24:2,4 24:2,5 24:2,6 22:3,0 22:1,5 23:4,3 23:4,4 23:4,5 18:1,5 22:0,0 18:3,1',
    nature: '5:3,0 5:3,2 6:3,0 7:3,0 5:0,0',
    ice: '15:2,5 2:1,8 G:frost_rock',
    desert: 'G:sandstone_bricks 15:0,5 22:3,0 22:0,6',
    heaven: 'G:marble_columns 23:4,4 22:3,0 22:0,1 22:1,1',
    cyber: '22:1,8 24:2,9 22:1,2 24:4,0',
    organic: '16:0,7 10:0,4 2:3,6 16:0,1',
  },
  beam: {
    station: '12:0,3 12:1,3 12:0,9 22:1,0 4:3,9',
    industrial: '12:2,3 12:2,9 13:0,4 13:0,5 8:0,5 14:2,6',
    hell: '17:0,9 17:1,8 17:1,4 17:0,3',
    castle: 'G:wood_dark_planks G:wood_grey_planks 21:3,9 15:1,9',
    city: '12:1,3 20:3,8 22:1,3 20:1,7 25:2,6 23:3,0',
    nature: 'G:wood_grey_planks 21:3,9 22:3,1 5:3,3',
    ice: '14:4,8 3:4,7 12:1,3',
    desert: 'G:wood_dark_planks 21:3,9 15:1,9',
    heaven: '22:1,1 22:0,1 22:4,0',
    cyber: '22:1,2 22:4,9 25:2,6',
    organic: '16:0,7 2:3,6 10:2,4',
  },
  crate: {
    station: '4:3,9 12:0,6 12:1,6 2:4,5 3:0,3 14:0,3',
    industrial: '12:2,6 12:3,6 14:2,6 13:0,4 2:4,5 8:2,7',
    hell: '15:3,3 17:0,4 12:4,6 17:2,6',
    castle: '15:3,3',
    city: '15:3,3 12:1,6 14:2,6',
    nature: '15:3,3',
    ice: '12:0,6 4:3,9',
    desert: '15:3,3',
    heaven: '22:4,7 22:1,1 15:3,3',
    cyber: '14:2,7 22:3,7 12:0,6',
    organic: '16:0,5 4:3,9',
  },
  crate2: {
    station: '2:0,0 14:0,5 12:0,8 12:0,2',
    industrial: '2:0,0 2:0,9 14:0,5 13:0,2 18:1,7 20:0,3 20:0,4 20:0,5 20:0,8 21:2,9 21:3,8',
    hell: '13:4,2 13:1,2 17:4,3',
    castle: 'G:wood_nailed 21:3,9 G:wood_burnt',
    city: '20:0,4 20:0,8 2:0,0 18:1,7 21:3,8',
    nature: '21:3,9 G:wood_grey_planks',
    desert: 'G:wood_nailed 21:3,9 2:0,9',
    cyber: '22:1,9 14:0,5',
    heaven: '22:1,5 22:1,4',
    ice: '12:0,8 2:0,0',
    organic: '16:1,6 13:1,2',
  },
  machine: {
    station: '3:2,0 3:2,1 3:2,6 3:2,7 3:1,9 2:2,8 4:2,7 4:1,7 4:1,0 4:1,4 14:3,7 14:3,9 1:2,1 3:2,3 3:2,5 4:2,6',
    industrial: '2:2,9 2:2,6 2:2,3 2:2,1 14:3,8 14:3,9 14:1,4 8:3,5 8:3,7 3:1,3 3:1,4 3:1,8 4:1,10',
    hell: '17:4,6 17:1,5 17:2,3 8:3,0 1:2,2',
    city: '21:2,2 21:2,3 20:2,8 24:3,6 19:4,1',
    ice: '3:4,7 14:4,8 3:2,0',
    cyber: '3:2,7 14:3,0 8:3,2 8:3,3 4:3,8 3:2,1 4:1,1',
    organic: '10:2,4 16:2,5 16:2,4 16:2,1',
  },
  screen: {
    station: '3:2,0 3:2,7 4:3,8 14:3,7 4:2,7 3:4,9',
    industrial: '14:3,7 3:2,0',
    hell: '3:4,8 17:4,6',
    city: '19:3,3 24:1,0',
    cyber: '3:2,7 4:3,8 3:4,4 14:3,0 8:3,2',
    organic: '10:3,1 16:3,1',
  },
  pipe: {
    station: '3:1,0 3:1,6 3:1,5 4:1,6 4:1,3 1:2,0',
    industrial: '8:1,0 8:1,1 8:1,7 8:3,8 8:1,8 14:1,0 14:1,1 14:1,2 14:4,6 1:2,3 3:1,1 3:4,2 2:2,0',
    hell: '17:0,8 17:1,7 17:1,4 17:4,7 17:0,1',
    castle: 'G:rusty_chains 15:3,2 17:1,1',
    city: '21:2,0 21:2,1 21:2,5 20:2,7 20:3,2 20:3,3',
    ice: '3:4,7',
    cyber: '14:1,2 3:1,6',
    organic: '10:2,6 10:2,9 16:2,4 16:2,8 16:2,5',
  },
  chain: {
    castle: 'G:rusty_chains 15:3,2 17:1,1',
    hell: '17:1,1 17:4,5 G:rusty_chains',
    industrial: 'G:rusty_chains 17:1,1',
  },
  grate: {
    station: '4:0,7 2:0,7 8:2,4 22:3,4 14:1,9 8:2,3',
    industrial: '14:1,3 8:1,4 8:1,9 8:2,8 4:1,9 8:2,2 8:2,4',
    hell: '17:1,6 17:1,2 16:2,1 10:2,8',
    castle: 'G:wood_grey_planks G:wood_dark_planks 21:3,9 15:3,0',
    city: '22:3,4 14:1,9 20:1,4 25:3,8 21:1,1',
    nature: '21:3,9 G:wood_grey_planks 25:3,8 22:3,1',
    ice: '4:0,7 2:0,7',
    desert: '21:3,9 G:wood_dark_planks 25:3,8',
    heaven: '22:4,7 22:3,5 22:1,1',
    cyber: '22:3,4 14:1,9 4:0,7',
    organic: '16:2,1 10:2,2 10:2,8',
  },
  stair: {
    station: '22:3,7 8:2,2 22:1,0 12:0,0',
    industrial: '8:2,2 8:2,3 8:2,4 12:2,0',
    hell: 'G:red_tile_floor 17:4,2 15:4,9 17:0,7',
    castle: 'G:slab_dark_floor G:stone_grey_bricks 15:0,0 1:1,2 G:wood_dark_planks',
    city: '21:0,2 21:0,7 22:2,1 22:2,0 22:0,7 20:1,3 22:0,0',
    nature: '1:1,2 6:0,0 5:0,2 G:rock_bluegrey G:wood_grey_planks',
    ice: 'G:frost_rock 15:2,5 6:4,4',
    desert: 'G:sand_slab_floor G:sand_tile_floor G:sandstone_bricks 15:0,5',
    heaven: '22:0,1 22:3,3 22:0,9 22:0,3',
    cyber: '22:3,2 22:1,2 25:3,7',
    organic: '16:2,7 16:1,2',
  },
  rail: {
    station: '22:1,0 22:1,2 12:0,0 1:3,1 22:1,6',
    industrial: '1:3,1 12:2,0 12:3,0 13:0,0 22:1,0',
    hell: '17:0,3 G:iron_spikes_black 17:1,1',
    castle: 'G:iron_spikes_black G:iron_spikes_grey G:wood_dark_planks 15:0,3',
    city: '22:1,0 22:1,2 12:1,0 21:3,9',
    nature: 'G:wood_grey_planks G:wood_dark_planks 21:3,9',
    ice: '22:1,0 12:1,0',
    desert: 'G:wood_dark_planks 22:0,6',
    heaven: '22:1,1 22:1,5 22:0,1',
    cyber: '22:1,2 24:4,1 22:1,0',
    organic: '16:0,7',
  },
  fence_panel: {
    castle: '21:3,3 G:iron_spikes_black 21:3,0',
    city: '21:3,0 21:3,1 21:3,2 21:3,3 14:1,9',
    industrial: '8:1,4 8:1,9 14:1,9 21:3,1',
    nature: '21:2,8 21:3,9',
    heaven: '21:3,3',
  },
  lava: {
    hell: 'A:lava:lava_red A:lava:lava_bubbles A:lava:lava_crust A:lava:lava_flow_dark A:lava:lava_cracked_rock A:lava:embers_coal 11:red_lava 11:lava',
    industrial: 'A:lava:lava_bright A:lava:lava_swirl_white A:lava:lava_vortex A:lava:lava_crust 11:lava',
    nature: 'A:lava:lava_crust A:lava:lava_cracked_rock A:lava:lava_flow_dark 11:lava',
    desert: 'A:lava:sulfur_magma A:lava:lava_bright',
  },
  poison: {
    station: 'A:slime:acid_slime 11:acid',
    industrial: 'A:slime:acid_slime 11:acid A:slime:tar_pit 11:oil',
    nature: 'A:slime:bog_sludge 11:swamp A:slime:acid_slime',
    hell: '11:blood A:slime:acid_slime',
    organic: '11:ooze 11:blood A:slime:acid_slime',
    castle: 'A:slime:bog_sludge 11:swamp',
    cyber: '11:ooze',
  },
  water: {
    city: '11:grey_water A:water:deep_ocean',
    industrial: '11:grey_water A:water:deep_ocean',
    nature: 'A:water:tropical_pool 11:water A:water:whitewater A:water:deep_ocean',
    castle: 'A:water:deep_ocean 11:water',
    ice: 'A:water:deep_ocean 11:water',
    heaven: 'A:water:tropical_pool A:water:whitewater',
    station: '11:water A:water:deep_ocean',
  },
  spikes: {
    hell: '17:2,6 17:2,0 G:iron_spikes_black',
    castle: '15:1,8 G:iron_spikes_grey',
    industrial: '22:3,6 17:2,6',
    station: '22:3,6',
    cyber: '22:3,6',
  },
  facade: {
    city: '23:0,0 23:0,2 23:0,3 23:0,5 23:0,7 23:0,9 23:1,0 23:1,2 23:1,5 23:1,8 23:2,1 23:2,4 23:2,5 23:3,0 23:3,1 23:3,4 25:0,0 25:0,1 25:0,2 25:0,3 25:0,4 25:0,5 25:0,6 25:0,7 25:0,8 25:0,9 18:1,0 18:1,2 18:1,9',
    cyber: '18:1,1 23:1,2 23:1,3 25:0,1 25:0,9',
  },
  facade2: {
    city: '25:1,0 25:1,1 25:1,2 25:1,3 25:1,4 25:1,5 25:1,6 25:1,7 25:1,8 25:1,9',
    cyber: '25:1,2 25:1,6 25:1,5 18:1,1',
  },
  facade3: {
    city: '18:0,0 18:0,1 18:0,2 18:0,3 18:0,4 18:0,5 18:0,6 18:0,7 18:0,8 18:0,9 18:1,6 18:1,8',
    desert: '18:0,9 18:0,2 18:4,6',
    castle: '18:0,3 15:4,3 15:1,4',
  },
  facade_ruin: {
    city: '18:4,6 19:1,4 19:1,5 19:1,6 19:3,7 18:4,0 18:4,1 18:4,5 18:4,8',
  },
  storefront: {
    city: '19:3,0 19:3,1 19:3,2 19:3,3 19:3,5 19:3,6 19:3,8 18:1,6 24:1,0 24:1,2 24:1,4 24:1,5',
    cyber: '19:3,3 19:3,8 19:3,0',
  },
  cladding: {
    city: '25:2,0 25:2,1 25:2,2 25:2,3 25:2,6 25:2,7 23:4,0 23:4,1 23:4,6 23:4,8 22:1,9',
    cyber: '25:2,6 22:1,8 24:2,9',
  },
  road: {
    city: '21:0,0 21:0,1 21:0,9 21:4,3',
  },
  road_detail: {
    city: '21:1,0 21:1,1 21:1,8',
  },
  sidewalk: {
    city: '21:0,2 21:0,7 21:0,5 21:0,3 21:0,4 21:0,8 21:4,1 22:2,1 25:3,6',
  },
  curb: {
    city: '21:1,2 21:1,6 21:1,9',
  },
  roof: {
    city: '20:1,0 20:1,1 20:1,2 20:1,3 20:1,4 20:1,6 20:1,7 25:3,0 25:3,1 25:3,2 25:3,3 25:3,4 25:3,6 25:3,7 25:3,9',
    station: '25:3,3 25:3,4 20:1,4 25:3,5 20:2,9 12:0,2',
    castle: '20:0,1 20:0,6 G:scales_orange 20:0,2',
    nature: '20:0,7 20:0,0 20:1,5 20:0,2',
    ice: '20:4,5',
    desert: '20:0,0 20:0,9 G:sand_slab_floor',
  },
  roof_detail: {
    city: '20:2,0 20:2,1 20:2,2 20:2,3 20:2,4 20:2,6 20:2,7 20:2,8 25:4,0 25:4,1 25:4,2 25:4,3 25:4,8',
    station: '25:4,1 25:4,0 20:2,9 25:3,5',
  },
  parapet: {
    city: '20:3,0 20:3,1 20:3,2 20:3,6 20:3,7 25:4,5 25:4,6',
    castle: '20:3,7 15:1,7',
  },
  glass: {
    station: '3:3,3 3:3,4 4:3,3 4:3,4 4:3,5 2:4,3 3:3,6',
    city: '19:0,0 19:0,1 19:0,2 19:0,4 19:0,5 19:0,7 19:0,8 19:1,0 19:1,1 19:1,2 19:1,3 19:1,7 24:1,1 24:1,6',
    castle: '19:1,9 2:4,4 15:1,4 19:0,3 19:0,6 2:4,2 15:4,3',
    hell: '2:4,4 15:1,4',
    heaven: '19:1,9 24:1,6 19:3,9',
    cyber: '24:1,6 18:1,1 4:3,3',
    ice: '3:3,6 4:4,0',
    industrial: '19:4,2 2:4,2 3:3,6',
  },
  glass_plain: {
    city: '24:1,1 24:1,7 22:2,5 23:1,7',
    station: '3:3,6 24:1,1',
    heaven: '24:1,1 22:2,5',
    cyber: '22:2,5 24:1,7',
  },
  door: {
    station: '3:3,0 3:3,1 3:3,2 3:3,5 3:3,7 3:3,8 3:3,9 4:3,0 4:3,1 4:3,2 4:3,6 2:4,1 2:4,9 1:3,3',
    industrial: '2:4,7 2:4,8 19:2,7 19:2,8 19:4,6 19:4,8 4:3,2 3:3,1',
    city: '19:2,0 19:2,1 19:2,2 19:2,3 19:2,4 19:2,5 19:2,9 19:4,5 19:4,9 24:3,3 24:3,4 24:3,5 24:3,8 24:0,9 24:0,0 24:0,2',
    castle: 'G:wood_iron_door 15:3,4 2:4,0 19:4,7 19:2,6',
    hell: '2:4,0 15:3,4 2:4,1',
    nature: 'G:wood_iron_door 19:4,7 19:2,0',
    desert: 'G:wood_iron_door 2:4,0',
    heaven: '24:0,5 2:4,0 24:0,3',
    cyber: '4:3,1 3:3,9 24:0,2',
    ice: '4:3,0 3:3,7',
  },
  metal: {
    station: '12:0,0 12:1,0 22:1,0 22:1,2 22:1,6 3:0,1 14:0,8',
    industrial: '12:2,0 12:3,0 13:0,0 8:0,0 8:0,4 14:0,8 2:0,2',
    hell: '17:0,3 17:4,3 12:4,0',
    castle: '15:3,0 G:iron_spikes_black 17:0,3',
    city: '22:1,0 22:1,2 12:1,0 20:1,4',
    heaven: '22:1,1 22:1,4',
    cyber: '22:1,2 22:1,6',
    ice: '22:1,0 12:1,0',
    desert: '12:2,0 2:0,6',
    nature: '12:2,0',
    organic: '16:2,7 10:2,4',
  },
  rock: {
    nature: '5:0,0 5:0,2 5:0,6 5:0,9 11:0,0 11:0,6 11:0,7 G:rock_bluegrey 6:0,3 6:3,9 5:4,9',
    desert: '5:0,1 5:0,5 5:1,8 5:4,8 6:0,2 6:0,8 11:0,5 6:0,7',
    hell: '17:3,0 17:3,1 17:3,6 17:3,9 7:0,0 5:4,1 5:4,3 5:0,8 17:4,2',
    ice: 'G:frost_rock 5:4,4 6:4,4 7:4,0',
    heaven: '22:0,3 5:0,9 6:3,7 22:0,2',
    cyber: '11:0,2 7:0,2 5:4,3',
    organic: '2:3,4 2:3,8 11:0,8 10:4,2',
    castle: 'G:rock_bluegrey 5:0,2 11:0,0',
  },
  ground: {
    nature: '5:2,5 6:2,0 5:2,9 7:2,6 7:2,7 5:2,6 5:1,0 6:1,1 5:1,6 6:1,6 7:1,0 5:1,4 5:1,9 7:2,8',
    desert: '6:1,2 7:1,7 5:1,2 6:1,9 5:1,1 6:1,4 6:4,9',
    ice: '5:3,9 6:4,2 6:4,4 7:4,9 5:4,5',
    hell: '6:1,8 7:1,6 11:1,0 11:1,1 7:1,8',
    castle: '5:1,4 6:0,9 5:1,9 7:2,8',
    city: '21:4,0 21:4,1 5:1,4',
    heaven: '6:4,9 22:0,1',
    organic: '16:1,9 10:4,1',
    station: '6:1,8 6:0,9 11:1,2',
  },
  foliage: {
    nature: '24:4,8 6:2,4 5:2,3 7:2,4 5:2,2 7:2,0 6:2,5 A:nature_energy:ivy_wall',
    city: '24:4,8 25:3,9 6:2,4',
    castle: '5:2,3 6:2,4 18:4,1',
    hell: '10:0,9 G:thorn_carving',
    organic: '16:1,6 10:4,8 10:2,2',
    ice: '6:4,2',
    desert: '6:2,9 6:2,6',
  },
  pitwall: {
    station: '12:3,0 8:4,1 4:4,2 14:4,5',
    industrial: '12:3,3 13:1,1 13:1,0 8:4,1 8:4,6 14:4,5',
    hell: '17:3,0 17:4,4 G:lava_bricks 11:4,2 11:4,6 15:4,8 17:3,1',
    castle: 'G:dripping_stone G:cobweb_stone 15:2,3 15:2,7 G:decay_green',
    city: '21:3,4 21:4,9 18:4,4 18:3,6 21:3,6',
    nature: '11:0,0 11:0,6 5:0,6 5:4,9 G:roots_stone',
    ice: '15:2,9 8:4,3 5:4,4',
    desert: '5:0,1 5:4,8 11:0,5',
    heaven: '22:0,3 5:0,9 6:3,7',
    cyber: '11:0,2 14:4,9 8:3,3',
    organic: '10:1,7 16:4,3 10:4,2',
  },
  wood: {
    castle: 'G:wood_dark_planks G:wood_grey_planks G:wood_nailed 22:3,1',
    city: '21:3,9 22:3,1 25:3,8 18:3,9 21:2,8',
    nature: 'G:wood_grey_planks 21:3,9 5:3,3 20:3,9',
    hell: 'G:wood_burnt G:wood_dark_planks',
    desert: 'G:wood_dark_planks 21:3,9',
    heaven: '22:3,1 22:2,8',
    industrial: '21:3,9 G:wood_nailed',
    station: '22:3,1',
  },
  carpet: {
    castle: 'G:damask_red G:fleur_green',
    city: '20:1,8 20:1,9 G:damask_red',
    heaven: 'G:damask_red',
    station: '3:2,4',
  },
  neon: {
    cyber: '4:4,9 3:4,6 24:4,1 24:4,0 25:2,9',
  },
  accent: {
    station: '1:3,1 14:2,8 4:0,1 4:2,3 3:1,9',
    industrial: '1:3,1 14:2,8 2:2,9 14:3,8',
    hell: '17:2,1 15:1,1 17:2,0 15:1,5 17:2,7 G:skull_panels G:thorn_carving 15:4,4',
    castle: '15:1,0 15:1,3 15:1,6 G:gothic_arches G:gothic_tracery 15:4,4 G:gothic_quatrefoil 15:3,9 15:1,2',
    city: '21:2,6 21:2,7 22:4,7 24:4,2 24:4,4',
    nature: '2:3,2 6:3,8 7:3,8 5:3,8',
    ice: '15:2,9 7:4,8',
    desert: '2:3,1 2:3,7 15:4,5',
    heaven: 'G:gold_filigree G:marble_columns 22:4,0 22:4,7 15:3,6',
    cyber: '22:4,1 8:3,2 14:3,0 4:1,1',
    organic: '10:3,4 16:3,4 10:3,2 10:3,0 16:3,2',
  },
};

// ---------------------------------------------------------------- tagging defects
// tiles -> roles they must not be used for (bad), roles they suit (ok), forced emissive
export const AVOID = {
  // row tag 'door' on a window/tank/hologram/crate/X-brace: picked for DOOR by tag; penalised -2 everywhere else
  '4:3,7 4:3,8 4:3,9 3:3,3 3:3,4 3:3,6 4:3,3 4:3,4 4:3,5 2:4,2 2:4,3 2:4,4 2:4,5 2:4,6': { bad: ['door', 'wall'], ok: ['glass', 'crate', 'machine', 'beam', 'accent'] },
  // tx19 utility/storefront row tags (door/storefront) on a vent/fan/barred window/grille/glass block
  '19:4,0 19:4,1 19:4,2 19:4,4 19:3,4 19:3,9': { bad: ['door', 'wall'], ok: ['machine', 'glass', 'roof_detail'] },
  // interior furniture/equipment (bed, counter, chair, terrarium, locker) tagged 'wall'
  '4:2,0 4:2,1 4:2,2 4:2,4 4:2,5 4:2,8 4:2,9 3:2,2 3:2,3': { bad: ['wall', 'wall2', 'ceil', 'panel'], ok: ['machine', 'accent'] },
  // fluorescent tube tagged 'metal panel wall': as WALL it makes a wall of lamps
  '4:0,10': { bad: ['wall', 'wall2', 'panel', 'ceil'], ok: ['light'] },
  // padded quilt tagged floor+wall
  '3:2,4': { bad: ['floor', 'wall'], ok: ['panel', 'carpet'] },
  // row tags 'glass downtown' on white/green tile, granite, storefront, corrugated, brick window
  '18:1,3 18:1,4 18:1,5 18:1,7 18:1,8 18:1,6': { bad: ['glass', 'facade'], ok: ['panel', 'pillar', 'crate2', 'facade3', 'wall'] },
  // fence/balustrade tiles tagged 'wall' (+0.4 in realPick); opaque RGB (no alpha) so never see-through
  '21:3,0 21:3,1 21:3,2 21:3,3': { bad: ['wall', 'wall2', 'rail'], ok: ['fence_panel'] },
  // wall textures (burnt plaster, boarded planks, rebar concrete, crumbled brick) tagged 'floor' by row
  '21:4,7 21:4,8 21:4,9 21:4,6 20:4,6': { bad: ['floor', 'floor2', 'ground'], ok: ['wall', 'pitwall', 'facade_ruin'] },
  // pitched-roof shingles tagged 'floor' by row
  '20:4,0 20:4,1 20:4,2 20:4,4 20:4,5 20:4,8': { bad: ['floor', 'floor2'], ok: ['roof'] },
  // whole lobby entrance picture in one tile: tiled on a wall it becomes a wall of tiny doors
  '24:0,0 24:0,1 24:0,2 24:0,3 24:0,4 24:0,5 24:0,6 24:0,7 24:0,8 24:1,0 24:1,2': { bad: ['wall', 'wall2', 'facade', 'accent'], ok: ['door', 'storefront'] },
  // railing with baked sky background
  '24:4,5 24:4,6 24:4,7 25:4,9': { bad: ['rail', 'wall', 'glass_plain', 'fence_panel'] },
  // 'pillar bronze' actually looks like a wooden door panel
  '25:4,7': { bad: ['pillar'], ok: ['door'] },
  // auto colour tag 'glow' (orange pixels) -> fill() sets emissive 0.55: glowing canyon rock/leaves/bark
  '5:0,1 5:4,8 11:0,5 5:2,1 6:3,6 7:2,2 7:2,3 7:3,1 7:1,3 5:3,8 5:4,7': { emissive: 0 },
  // row tag 'glow' -> emissive on non-luminous barrels/rusty machinery
  '14:3,4 14:3,8': { emissive: 0 },
  // cave 'floor' row: spider web / glowing bark tagged floor
  '11:3,1 11:3,4': { bad: ['floor', 'floor2', 'ground'], ok: ['wall', 'pitwall', 'accent'] },
  // 'brick metal dark' wall tile tagged floor by row
  '8:2,0': { bad: ['floor'], ok: ['wall', 'panel'] },
  // loose pebbles/gravel tagged 'wall' by row
  '5:0,4 6:0,4 6:0,5 6:0,6 5:1,4': { bad: ['wall', 'wall2', 'rock', 'pitwall'], ok: ['floor', 'floor2', 'floor3', 'ground'] },
};

// animated rows sliced across two liquids (bands of the neighbour visible): never used
export const ANIMATED_MIS_SLICED = 'A:water:swamp_water A:water:shallow_water A:water:muddy_water A:water:rain_puddle A:water:night_sea A:water:teal_lagoon A:water:abyss_water A:slime:oil_slick A:slime:mud_pool A:slime:cyan_ooze A:slime:void_ooze A:slime:honey_pool A:slime:mercury A:elements:sand_flow A:elements:rain_streaks A:elements:snowfall A:elements:ember_ground A:elements:rising_sparks A:elements:fire_wall A:nature_energy:firefly_moss A:nature_energy:void_crystals A:nature_energy:waterfall A:nature_energy:electric_rock A:nature_energy:amber_sap A:nature_energy:purple_energy';

// theme -> 'primary secondary' family
export const THEME_FAMILY = {
  possessed_station: 'station', huge_station: 'station', blackhole_observatory: 'station', orbital_elevator: 'station',
  hub: 'station', space_duel: 'station', space_train: 'station industrial', space_freighter: 'industrial station',
  large_freighter: 'industrial station', mars_base: 'station desert', venus_base: 'station desert', lunar_colony: 'station nature',
  frozen_outpost: 'station ice', bio_lab: 'station organic', crashed_starship: 'station organic', cave_base: 'station nature',
  data_core: 'cyber station', volcano_base: 'industrial hell', clockwork_foundry: 'industrial castle', oil_rig: 'industrial',
  semi_trucks: 'industrial city', subway_trains: 'industrial city', sewer_labyrinth: 'industrial castle', meat_plant: 'industrial organic',
  prison_complex: 'industrial', military_base: 'industrial city', possessed_military: 'industrial hell', ruined_military: 'industrial city',
  asteroid_mines: 'industrial nature', mosh_pit: 'industrial city', arctic_rail: 'industrial ice', hell: 'hell',
  volcano: 'hell nature', flesh_cathedral: 'hell castle', throne_of_bones: 'hell castle', infernal_foundry: 'hell industrial',
  castle: 'castle', clocktower: 'castle industrial', necropolis: 'castle', graveyard: 'castle nature',
  sunken_temple: 'castle nature', storm_spire: 'castle', sky_fortress: 'castle heaven', haunted_mansion: 'castle city',
  cyber_castle: 'castle cyber', ruined_city: 'city', ruined_town: 'city', downtown: 'city',
  skyscraper_tops: 'city', blood_harbor: 'city industrial', department_store: 'city', subway_tunnels: 'city industrial',
  abandoned_hospital: 'city station', backrooms: 'city', concert_hall: 'city heaven', movie_theater: 'city',
  carnival: 'city nature', ruined_village: 'nature castle', caves: 'nature', jungle_ruins: 'nature castle',
  toxic_swamp: 'nature', crystal_caverns: 'nature organic', mountain_top: 'nature ice', mountain_climb: 'nature ice',
  glacier_caves: 'ice', desert: 'desert', deserted_ruins: 'desert castle', canyon: 'desert nature',
  canyon_bridges: 'desert nature', heaven: 'heaven', afterlife: 'heaven organic', dream_maze: 'heaven',
  cyber_mountain: 'cyber', digital_void: 'cyber', neon_arcade: 'cyber city', cyber_traffic: 'cyber city',
};

// Tiles that really contain a light source (lava seams, light tubes, glowing
// orbs). Emissive comes ONLY from this list or from the role (LIGHT, NEON...),
// never from the auto "glow" colour tag.
export const TILE_EMISSIVE = {
  'G:lava_bricks': 0.3, 'G:lava_rock_floor': 0.4, 'G:crystal_purple': 0.2, '17:0,2': 0.3, '17:3,0': 0.3, '17:2,7': 0.3,
  '17:4,4': 0.3, '17:1,6': 0.35, '11:4,6': 0.3, '11:4,9': 0.3, '5:4,0': 0.3,
};
// (light tubes, lit strips and glowing orbs glow through their LIGHT / NEON /
// SCREEN role only, so a strip-light tile used as trim stays unlit)

// ---------------------------------------------------------------- placeholders
// Named procedural specs (art/textures_gen.js) for roles with no fitting tile.
export const PH = {
  // lights (LIGHT is always emissive; uv 'fit' on lamp boxes)
  light_fluor: { type: 'light_panel', kind: 'fluor', base: '#f2f6ff', frame: '#8a9098' },
  light_panel: { type: 'light_panel', kind: 'panel', base: '#fff4dc', frame: '#7a7e86' },
  light_white: { type: 'light_panel', kind: 'panel', base: '#fffaf0', frame: '#c8b070' },
  light_cyan: { type: 'light_panel', kind: 'fluor', base: '#a8f4ff', frame: '#20262e' },
  light_red: { type: 'light_panel', kind: 'panel', base: '#ff6050', frame: '#2a2a2e' },
  lantern: { type: 'light_panel', kind: 'lantern', base: '#ffb040', frame: '#1e1a16' },
  light_fire: { type: 'light_panel', kind: 'fire', base: '#ff7020', frame: '#1a1210' },
  light_orb: { type: 'light_panel', kind: 'orb', base: '#c8ff90', frame: '#1a2a10' },
  bulbs: { type: 'light_panel', kind: 'bulbs', base: '#ffd070', frame: '#4a1010' },
  hanging_lamp: { type: 'light_panel', kind: 'lamp', base: '#ffe0a0', frame: '#3a3430' },
  // neon (always emissive; NEON is drawn uv 'fit' on sign boards)
  sign_pink: { type: 'neon_sign', base: '#0c0814', accent: '#ff2bd6', alt: '#2bd6ff' },
  sign_cyan: { type: 'neon_sign', base: '#060c14', accent: '#2bd6ff', alt: '#ffd040' },
  sign_red: { type: 'neon_sign', base: '#140808', accent: '#ff3030', alt: '#ffb030' },
  sign_green: { type: 'neon_sign', base: '#06100a', accent: '#40ff70', alt: '#e0ff60' },
  sign_gold: { type: 'neon_sign', base: '#141008', accent: '#ffc040', alt: '#fff0c0' },
  neon_pink: { type: 'neon_strip', base: '#0c0814', accent: '#ff2bd6' },
  neon_cyan: { type: 'neon_strip', base: '#060c14', accent: '#2bd6ff' },
  neon_red: { type: 'neon_strip', base: '#140808', accent: '#ff3030' },
  neon_green: { type: 'neon_strip', base: '#06100a', accent: '#40ff70' },
  neon_gold: { type: 'neon_strip', base: '#141008', accent: '#ffc040' },
  neon_grid_pink: { type: 'neon_grid', base: '#07040f', accent: '#ff2bd6', alt: '#2bd6ff' },
  neon_grid_cyan: { type: 'neon_grid', base: '#030812', accent: '#2bd6ff' },
  // glass: a framed pane reads right as a window (uv fit), a car window and a glass balustrade panel
  glass_pane: { type: 'glass', framed: true, base: '#7fa6be', frame: '#9aa0a8' },
  glass_pane_dark: { type: 'glass', framed: true, base: '#3e566a', frame: '#26282c' },
  glass_plain: { type: 'glass', base: '#86b0c8' },
  glass_ice: { type: 'glass', framed: true, base: '#a8e0f8', frame: '#d8f0ff' },
  glass_gold: { type: 'glass', framed: true, base: '#e8e0c0', frame: '#c8a040' },
  // stairs
  tread_steel: { type: 'tread', base: '#8a8e94' },
  tread_dark: { type: 'tread', base: '#4a4e54' },
  tread_brass: { type: 'tread', base: '#a08040' },
  // roads
  asphalt_lines: { type: 'asphalt', base: '#2a2a2e', lines: true, accent: '#e8d24a' },
  // PAINT is drawn uv 'fit' on thin marking strips: solid worn paint, not asphalt with a stripe
  paint_white: { type: 'paint', base: '#e6e2d6', dark: '#38383c' },
  paint_yellow: { type: 'paint', base: '#e8c030', dark: '#3a3630' },
  paint_red: { type: 'paint', base: '#b02020', dark: '#2a1a18' },
  road_lines: { type: 'road_paint', kind: 'double' },
  crosswalk: { type: 'road_paint', kind: 'crosswalk' },
  paint_hazard: { type: 'hazard', base: '#e8c020' },
  // carpets
  carpet_red: { type: 'carpet', kind: 'ornate', base: '#6a1020', alt: '#c8a040' },
  carpet_theater: { type: 'carpet', kind: 'theater', base: '#7a0c18', alt: '#e0b040' },
  carpet_arcade: { type: 'carpet', kind: 'arcade', base: '#140a2a', alt: '#ff40c0', accent: '#40e0ff' },
  carpet_moist: { type: 'carpet', kind: 'office', base: '#8a7a4a', alt: '#6e5f36' },
  carpet_blue: { type: 'carpet', kind: 'ornate', base: '#1a2a5a', alt: '#c0a050' },
  carpet_green: { type: 'carpet', kind: 'ornate', base: '#1a3a24', alt: '#b09040' },
  carpet_grey: { type: 'carpet', kind: 'office', base: '#4a4e58', alt: '#3a3e46' },
  linen: { type: 'carpet', kind: 'office', base: '#d4d8d4', alt: '#c0c6c4' },
  linen_mint: { type: 'carpet', kind: 'office', base: '#a6c8bc', alt: '#90b4a8' },
  // props (uv 'fit': one object face per tile)
  crate_wood: { type: 'crate', kind: 'wood', base: '#7a5430' },
  crate_metal: { type: 'crate', kind: 'metal', base: '#5a6068', accent: '#e0b020' },
  crate_cardboard: { type: 'crate', kind: 'cardboard', base: '#a07848' },
  console: { type: 'console', base: '#3a3e48', accent: '#30d8ff' },
  console_red: { type: 'console', base: '#3a3434', accent: '#ff4030' },
  bookshelf: { type: 'bookshelf', base: '#4a2e18' },
  altar_stone: { type: 'altar', base: '#6a6660', accent: '#60ff90' },
  altar_marble: { type: 'altar', base: '#d8d2c4', accent: '#ffc040' },
  altar_hell: { type: 'altar', base: '#3a2a26', accent: '#ff3010' },
  arcade_cabinet: { type: 'arcade_cabinet', base: '#16121e', accent: '#ff40c0' },
  shelves: { type: 'shelves' },
  speaker: { type: 'speaker' },
  // screens (always emissive)
  screen_green: { type: 'screen_wall', base: '#1a1e24', accent: '#40ff90' },
  screen_runes: { type: 'screen_wall', kind: 'runes', base: '#14121a', accent: '#60c0ff' },
  screen_gold_runes: { type: 'screen_wall', kind: 'runes', base: '#2a2418', accent: '#ffd060' },
  screen_hell_runes: { type: 'screen_wall', kind: 'runes', base: '#1a0e0c', accent: '#ff4020' },
  cinema: { type: 'screen_wall', kind: 'cinema', base: '#d8e0f0', accent: '#4a6a9a' },
  // spikes (3D spike pyramids: tip at the top of the tile)
  spikes_steel: { type: 'spikes', base: '#9a9ea6', blood: 0.6 },
  spikes_iron: { type: 'spikes', base: '#5a5450', blood: 1 },
  spikes_bone: { type: 'spikes', base: '#d8ccb0', blood: 1 },
  spikes_gold: { type: 'spikes', base: '#d0a840', blood: 0.3 },
  spikes_ice: { type: 'spikes', base: '#b8e0f4', blood: 0.5 },
  spikes_crystal: { type: 'spikes', base: '#9a6ad0', blood: 0.4 },
  spikes_neon: { type: 'spikes', base: '#4a5060', blood: 0.5, accent: '#2bd6ff' },
  // vehicles
  train_silver: { type: 'train_side', base: '#9aa4ae', accent: '#d03030' },
  train_subway: { type: 'train_side', base: '#7a8088', alt: '#182430', accent: '#e8a020' },
  train_red: { type: 'train_side', base: '#9a2a22', alt: '#202830', accent: '#e8e0d0' },
  truck_trailer: { type: 'corrugated', base: '#c8c8c0', accent: '#d03030' },
  // surfaces
  wallpaper_yellow: { type: 'wallpaper', base: '#c8b46a', alt: '#a8944a' },
  ceiling_tile: { type: 'ceiling_tile', base: '#d8d4c4' },
  ceiling_tile_dim: { type: 'ceiling_tile', base: '#a8a494' },
  curtain_red: { type: 'curtain', base: '#8a0a1a' },
  tent_red: { type: 'stripes', base: '#c81c1c', alt: '#f0e6d8', width: 8 },
  tent_purple: { type: 'stripes', base: '#5a1a8a', alt: '#e8c040', width: 8 },
  checker_bw: { type: 'tile', base: '#e0e0d8', alt: '#181818', size: 16, dark: '#101010' },
  cloud: { type: 'cloud', base: '#f4f0ff', alt: '#d8c8ff' },
  tile_white: { type: 'tile', base: '#d8dcd8', dark: '#8a8e8a' },
  hedge: { type: 'hedge', base: '#2a4a1a' },
  snow_hedge: { type: 'hedge', base: '#c8d8e0' },
  asphalt: { type: 'asphalt', base: '#2c2c30' },
  concrete: { type: 'concrete', base: '#7a7872' },
  metal: { type: 'metal_panel', base: '#5a5e66' },
  wood: { type: 'wood', base: '#6b4426' },
  rock: { type: 'rock', base: '#6a5a4c' },
  grass: { type: 'grass', base: '#3d5a26' },
  windows_day: { type: 'windows', base: '#3a3f48', alt: '#1a2a3a', accent: '#ffd27a' },
  windows_neon: { type: 'windows', base: '#14121c', alt: '#1a0a2a', accent: '#ff40d0', litChance: 0.5 },
  lava: { type: 'lava', base: '#ff5a00' },
  acid: { type: 'lava', base: '#60e020', dark: '#0a3008', accent: '#e0ff60' },
  water: { type: 'water', base: '#1a4a7a' },
  hazard: { type: 'hazard', base: '#e8c020' },
  pipes: { type: 'pipes', base: '#5a5a60' },
  grate: { type: 'grate', base: '#5a5a60' },
  teleporter: { type: 'teleporter', base: '#202830', accent: '#40e0ff' },
};

// Placeholder per role when no family has a fitting tile. A family entry is
// tried right after the primary family's own tiles, before the secondary and
// fallback families (a castle wants a lantern and a rune tablet, not the hell
// set's lava tube or a sci-fi monitor); `default` comes last.
// (tx21 lane-line tiles are asphalt with a stripe: usable as ROAD detail, never as PAINT)
export const ROLE_PH = {
  light: { default: '#light_fluor', castle: '#lantern', nature: '#lantern', desert: '#lantern', hell: '#light_fire', heaven: '#light_white', cyber: '#light_cyan', organic: '#light_orb', city: '#light_panel' },
  neon: { default: '#sign_pink', cyber: '#sign_cyan', hell: '#sign_red', organic: '#sign_green', heaven: '#sign_gold', castle: '#sign_gold' },
  screen: { default: '#screen_green', castle: '#screen_runes', nature: '#screen_runes', desert: '#screen_runes', heaven: '#screen_gold_runes', hell: '#screen_hell_runes' },
  machine: { default: '#console', castle: '#bookshelf', heaven: '#altar_marble', nature: '#altar_stone', desert: '#altar_stone', ice: '#console' },
  crate: { default: '#crate_metal', castle: '#crate_wood', nature: '#crate_wood', desert: '#crate_wood', hell: '#crate_wood', city: '#crate_wood' },
  spikes: { default: '#spikes_steel', hell: '#spikes_iron', castle: '#spikes_iron', nature: '#spikes_iron', desert: '#spikes_iron', organic: '#spikes_bone', heaven: '#spikes_gold', ice: '#spikes_ice', cyber: '#spikes_neon' },
  glass: { default: '#glass_pane', castle: '#glass_pane_dark', hell: '#glass_pane_dark', ice: '#glass_ice', heaven: '#glass_gold' },
  glass_plain: { default: '#glass_plain' },
  stair: { default: '#tread_steel', industrial: '#tread_dark' },
  carpet: { default: '#carpet_red', cyber: '#carpet_arcade', heaven: '#carpet_blue', nature: '#carpet_green', station: '#carpet_grey' },
  road: { default: '#asphalt_lines' },
  paint: { default: '#paint_yellow', city: '#paint_white', hell: '#paint_red', castle: '#paint_white' },
  facade: { default: '#windows_day', cyber: '#windows_neon' },
  facade2: { default: '#windows_neon' },
  facade3: { default: '#windows_day' },
  foliage: { default: '#hedge', ice: '#snow_hedge' },
  ground: { default: '#grass' },
  lava: { default: '#lava' }, poison: { default: '#acid' }, water: { default: '#water' },
  pipe: { default: '#pipes' }, grate: { default: '#grate' }, metal: { default: '#metal' }, rail: { default: '#metal' },
  wood: { default: '#wood' }, rock: { default: '#rock' }, sidewalk: { default: '#concrete' }, roof: { default: '#concrete' },
  door: { default: '#metal' },
};
// roles that always use their placeholder (tile art does not fit the geometry)
export const PH_FIRST = new Set(['spikes', 'paint', 'neon']);

// ---------------------------------------------------------------- slots
// TS name -> role. Names not in TS yet (GLASS_PLAIN, CHAIN...) are filled
// automatically as soon as the generators add them to TS.
export const SLOT_ROLE = {
  WALL: 'wall', WALL2: 'wall', FLOOR: 'floor', FLOOR2: 'floor2', CEIL: 'ceil', ACCENT: 'accent', SIDE: 'side', DOOR: 'door',
  TRIM: 'trim', PILLAR: 'pillar', BEAM: 'beam', CRATE: 'crate', CRATE2: 'crate2', MACHINE: 'machine', PANEL: 'panel',
  PIPE: 'pipe', GRATE: 'grate', STAIR: 'stair', RAIL: 'rail', LIGHT: 'light', LAVA: 'lava', POISON: 'poison',
  SPIKES: 'spikes', WATER: 'water', FACADE: 'facade', FACADE2: 'facade2', FACADE3: 'facade3', ROAD: 'road',
  SIDEWALK: 'sidewalk', ROOF: 'roof', GLASS: 'glass', ROCK: 'rock', GROUND: 'ground', FOLIAGE: 'foliage', METAL: 'metal',
  CEIL2: 'ceil', FLOOR3: 'floor3', PITWALL: 'pitwall', WOOD: 'wood', SCREEN: 'screen', PAINT: 'paint', NEON: 'neon',
  CARPET: 'carpet',
  GLASS_PLAIN: 'glass_plain', CHAIN: 'chain', FENCE: 'fence_panel', CURB: 'curb', STOREFRONT: 'storefront',
  CLADDING: 'cladding', PARAPET: 'parapet', ROAD_DETAIL: 'road_detail', ROOF_DETAIL: 'roof_detail',
  FACADE_RUIN: 'facade_ruin', FLOOR_BORDER: 'floor_border',
};
// fill order: the most visible surfaces get first pick of the distinct tiles
export const SLOT_PRIORITY = [
  'WALL', 'FLOOR', 'CEIL', 'WALL2', 'FLOOR2', 'SIDE', 'ACCENT', 'DOOR', 'PILLAR', 'TRIM', 'PANEL', 'STAIR', 'GRATE',
  'FACADE', 'FACADE2', 'FACADE3', 'ROAD', 'SIDEWALK', 'ROOF', 'GROUND', 'ROCK', 'CEIL2', 'FLOOR3', 'PITWALL', 'CRATE',
  'CRATE2', 'MACHINE', 'SCREEN', 'METAL', 'RAIL', 'BEAM', 'PIPE', 'WOOD', 'CARPET', 'FOLIAGE', 'GLASS', 'LIGHT', 'PAINT',
  'NEON', 'LAVA', 'POISON', 'WATER', 'SPIKES', 'GLASS_PLAIN', 'CHAIN', 'FENCE', 'CURB', 'STOREFRONT', 'CLADDING',
  'PARAPET', 'ROAD_DETAIL', 'ROOF_DETAIL', 'FACADE_RUIN', 'FLOOR_BORDER',
];
// roles drawn with uv 'fit' (one picture per face): uvScale must stay 1
export const FIT_ROLES = new Set(['door', 'crate', 'machine', 'screen', 'light', 'glass', 'storefront', 'roof_detail', 'paint', 'neon']);
export const ROLE_EMISSIVE = { light: 1, neon: 1, screen: 0.9, lava: 1, poison: 0.85, water: 0.12, facade2: 0.5 };
// gentle scroll for liquids when the picked tile is not animated
export const ROLE_SCROLL = { lava: 0.08, poison: 0.06, water: 0.05 };
// world units per texture repeat (default 1)
export const UV_SCALE = {
  facade: { tx23_skyscraper_glass: 4, tx25_skyscraper_facade_b: 5, tx18_city_facades: 3, default: 4 },
  facade2: { tx25_skyscraper_facade_b: 5, tx18_city_facades: 3, default: 4 },
  facade3: { default: 3 },
  facade_ruin: { default: 3 },
  cladding: { tx23_skyscraper_glass: 4, default: 3 },
  storefront: { default: 1 },
  road: { default: 2 },
  roof: { default: 2 },
  sidewalk: { default: 1.5 },
  ground: { default: 1.5 },
  rock: { default: 2 },
  floor3: { 'gothic_set_01:mosaic_floor': 3, 'gothic_set_01:star_carving': 2, default: 1 },
};
export function uvScaleFor(role, key) {
  const u = UV_SCALE[role];
  if (!u || !key) return 1;
  return u[key] ?? u[key.split(':')[0]] ?? u.default ?? 1;
}

// ---------------------------------------------------------------- archetypes
// How the older generators use the core slots: in caves / mountains / canyons
// WALL is a cliff or boulder (rock, not bricks), SIDE is a terrain step (the
// cave rock itself underground, a second rock outdoors), and
// outdoor floors are ground; island sides are rock; rooftop ACCENT blocks are
// AC units.
export const ARCHETYPE_TEX = {
  caves: { wall: 'rock@', wall2: 'rock@', side: '=WALL' },
  mountain: { wall: 'rock@', wall2: 'rock@', side: 'rock@', floor: 'ground@ floor@', floor2: 'ground@ floor2@' },
  canyon: { wall: 'rock@', wall2: 'rock@', side: 'rock@', floor: 'ground@ floor@' },
  islands: { side: 'rock@ side@', accent: 'pillar@ accent@' },
  rooftops: { accent: 'roof_detail@ accent@' },
};

// ---------------------------------------------------------------- themes
// Per-theme overrides keyed by slot name (lower case). `legacy` applies only
// while the level uses no FACADE slot (older city / rooftop generators draw
// their buildings with WALL / WALL2 / SIDE).
export const THEME_TEX = {
  // ---- station
  possessed_station: { accent: '17:2,3 1:3,1' },
  huge_station: {},
  blackhole_observatory: { wall: '3:0,1 14:0,0 3:0,2', glass: '3:3,4 4:3,4 3:3,3' },
  hub: { glass: '3:3,4 4:3,4 3:3,3', roof: 'roof@station' },
  space_duel: { wall: '3:0,1 3:0,2 14:0,0', wall2: '3:0,0 3:0,9' },
  space_train: { wall: '#train_silver', side: '#train_silver', wall2: '3:0,0 3:0,9 4:0,0', floor: '12:0,0 22:1,6 12:1,0', floor2: '8:2,4 4:0,7 2:0,7', accent: '1:3,1 14:2,8' },
  mars_base: { ground: '6:1,0 5:1,3 7:1,8', rock: '5:0,5 6:0,8 5:4,8', wall2: '5:0,5 6:0,8' },
  venus_base: { ground: '7:1,7 6:1,3 5:1,2', rock: '6:0,2 6:0,7 5:0,1' },
  lunar_colony: { ground: '6:1,8 6:0,9 7:1,6', rock: '5:0,0 G:rock_bluegrey', wall2: '5:0,0 G:rock_bluegrey' },
  frozen_outpost: { ground: 'ground@ice', wall2: '15:2,9 15:2,5 G:frost_rock', rock: 'rock@ice' },
  // labs: brushed stainless steel on benches / beds / equipment sides, white
  // casework and lockers on cabinet fronts, lab instruments on machine fronts,
  // a cream-and-stripe wainscot, pale clean-room tile for feature floors,
  // steel columns and linen on cushions / sheets
  bio_lab: { wall: '18:1,3 22:2,3 3:0,9', wall2: '3:0,0 4:2,3', floor: '22:2,9 22:2,0 G:small_tile_floor', ceil: '#ceiling_tile 3:0,9', accent: '1:3,1 4:2,3', metal: '22:1,0 22:1,6', crate2: '3:2,9 4:2,8 14:0,5', machine: '4:2,6 3:2,0 3:2,1 4:2,7 3:2,6 4:1,7', panel: '4:2,3 4:0,1', floor3: '22:2,5 22:4,4', pillar: '24:2,5 22:1,9', trim: '22:1,0 3:0,6', carpet: '#linen' },
  crashed_starship: { ground: 'ground@nature', wall2: '4:4,2 12:3,1', rock: 'rock@nature' },
  cave_base: { ground: 'ground@nature', wall2: 'rock@nature', ceil2: 'rock@nature', rock: 'rock@nature' },
  data_core: { wall: '3:2,1 4:1,1 14:3,7', wall2: '14:0,0 22:3,2', floor: '#neon_grid_cyan', floor2: 'G:hex_dark_floor_b 2:0,4', ceil: '14:1,9 8:2,4', side: '14:0,0 22:0,0', accent: '3:2,7 14:3,7' },
  orbital_elevator: {},
  // ---- industrial
  space_freighter: { wall: '2:0,0 14:0,5 2:0,9 20:0,4', wall2: '20:0,8 13:0,2 20:0,3', side: '12:2,0 8:0,0', floor: '12:2,0 8:2,2', floor2: '8:2,4 14:1,3', accent: '1:3,1' },
  large_freighter: { wall: '2:0,0 14:0,5 2:0,9', wall2: '20:0,8 20:0,3 13:0,2', floor: '8:2,4 8:2,2', floor2: '12:2,0 14:0,8' },
  volcano_base: { wall2: 'rock@hell', ground: 'ground@hell', rock: 'rock@hell' },
  clockwork_foundry: { wall: '13:0,1 13:0,5 12:3,8 12:3,2', wall2: '17:1,5 17:0,1 14:1,8', floor: '8:2,2 8:2,3', ceil: '8:1,5 14:1,3', accent: 'G:rusty_chains 17:1,1', machine: '17:1,5 14:1,8 2:2,6', pipe: '17:1,7 17:0,1 17:1,4', metal: '13:0,0 12:3,0' },
  oil_rig: { wall: '8:1,0 14:1,0 12:2,2', wall2: '12:2,2 13:0,0', floor: '8:2,4 14:1,3 8:2,2', floor2: '12:2,0 8:2,3', side: '12:2,0 13:0,0', accent: '1:3,1 14:2,8' },
  semi_trucks: { wall: '#truck_trailer', side: '#truck_trailer', wall2: '2:0,9 20:0,3 20:0,8', floor: '22:1,6 12:1,0', floor2: '21:3,9 G:wood_grey_planks', accent: '1:3,1' },
  subway_trains: { wall: '#train_subway', side: '#train_subway', wall2: '12:0,8 3:0,4', floor: '22:1,6 12:0,0', floor2: '8:2,2 8:2,4', accent: '21:3,4 18:2,5 21:3,6', ceil: '21:3,6 22:2,4' },
  sewer_labyrinth: { wall: '18:2,3 21:4,5 18:4,8', wall2: 'G:dripping_stone G:decay_green', floor: '20:1,3 21:0,8', floor2: '8:2,4 14:1,3', ceil: 'G:dripping_stone 15:2,3', side: '18:2,3 G:stone_dark_bricks', accent: '8:1,0 14:1,1', pitwall: 'G:decay_green 8:3,9' },
  meat_plant: { wall: '18:1,3 8:2,5', wall2: '16:0,8 10:0,0 10:1,0', floor: '8:2,5 8:2,9', ceil: '8:1,0 8:1,1', accent: '16:0,8 16:2,0', floor3: 'G:blood_stone' },
  prison_complex: { wall: '21:3,4 13:0,0 1:3,0', wall2: 'G:iron_spikes_grey 8:1,4 14:1,9', floor: '22:2,1 20:1,3', floor2: '8:2,4 14:1,3' },
  military_base: { wall: '21:3,4 1:0,0 20:1,7', wall2: '1:0,0 3:0,3 14:0,3', floor: '22:2,1 20:1,3 8:2,2', floor2: '21:0,0 21:0,2', ceil: '21:3,4 20:1,7 22:2,1 12:2,0', crate: '14:0,3 3:0,3 #crate_metal', accent: '1:3,1' },
  possessed_military: { wall: '21:3,4 1:0,0', wall2: '10:0,0 16:0,8 15:2,6', floor: '22:2,1 20:1,3', floor2: 'G:blood_stone 8:2,5', ceil: '20:1,7 21:3,4 22:2,1 12:2,0', accent: '10:0,0 15:2,6' },
  ruined_military: { wall: '21:4,9 21:3,4 21:4,7', wall2: 'G:plaster_brick_ruin 21:4,6', floor: '22:2,1 20:1,3', floor2: '6:1,1 5:1,0', ceil: '21:3,4 20:1,7', ground: '6:1,1 5:1,0 21:4,0' },
  asteroid_mines: { wall2: '12:2,2 13:0,0', floor: '8:2,4 8:2,2', floor2: '7:1,6 6:1,8', ceil: 'rock@nature', ground: '6:1,8 7:1,6' },
  arctic_rail: { wall: '#train_red', side: '#train_red', wall2: '12:0,8 12:0,2', floor: '6:4,2 5:3,9', floor2: '8:2,2 8:2,4', accent: '1:3,1' },
  mosh_pit: { wall: '18:2,3 21:3,6', wall2: '#speaker', accent: '#speaker', floor: '22:2,4 22:2,1', floor2: '8:2,2 14:1,3', ceil: '8:1,5 14:1,3 8:2,4', side: '12:0,0 13:0,0', light: '#light_red', neon: '#sign_red' },
  // ---- hell
  hell: { floor: 'G:blood_stone 17:3,6 11:1,1 7:1,8', floor2: '17:3,1 G:lava_rock_floor 11:1,0', ceil: 'rock@hell' },
  volcano: { floor: '7:1,6 11:1,0 6:1,8', floor2: 'G:lava_rock_floor 17:3,0', ceil: 'rock@hell' },
  flesh_cathedral: { wall: '15:1,0 G:gothic_arches 15:1,3', wall2: '16:0,8 10:0,0 10:1,0', floor: 'G:blood_stone 15:2,6', floor2: '11:3,7 G:red_tile_floor', ceil: 'G:thorn_carving 10:0,9', accent: 'G:skull_panels 15:1,6 17:2,1', pillar: '16:0,7 17:0,0' },
  throne_of_bones: { wall: 'G:skull_niches G:skull_panels 15:1,6', wall2: '17:2,1 15:1,1', floor: '11:3,7 G:blood_stone', floor2: 'G:red_tile_floor 17:3,6', ceil: 'rock@hell', side: 'G:stone_black_bricks 15:4,9', pillar: '16:0,7 15:4,4', accent: '17:2,1 G:skull_panels' },
  infernal_foundry: { wall: 'G:lava_bricks 17:0,2 17:0,9', wall2: 'G:iron_spikes_black 17:2,0 17:0,3', floor: '17:1,6 8:2,2', floor2: 'G:lava_rock_floor 17:3,0', ceil: '17:0,3 12:4,0', accent: 'G:rusty_chains 17:1,1', machine: '17:4,6 17:1,5' },
  // ---- castle
  castle: { door: 'G:wood_iron_door 15:3,4 2:4,0', floor2: 'G:checker_floor G:marble_black_floor', ceil: 'G:wood_dark_planks 15:3,7' },
  clocktower: { wall2: '13:0,1 12:3,8 17:1,1', floor: 'G:wood_dark_planks G:wood_grey_planks', floor2: '8:2,4 14:1,3', ceil: 'G:wood_dark_planks 15:3,7 21:3,9', accent: 'G:gold_filigree 22:4,7', machine: '17:1,5 14:1,8', pipe: 'G:rusty_chains 17:1,1', beam: 'G:wood_dark_planks 21:3,9', metal: '12:3,0 13:0,0 17:0,3' },
  necropolis: { wall: 'G:cobweb_stone G:stone_dark_bricks 15:2,7', wall2: 'G:skull_niches 15:1,6', floor: 'G:cobble_black 21:0,4', floor2: '6:1,1 5:1,0', ceil: 'G:stone_dark_bricks', accent: 'G:skull_panels 15:1,6', ground: '6:1,1 5:1,6' },
  graveyard: { wall: 'G:stone_grey_bricks G:cobweb_stone 15:0,0', wall2: 'foliage@nature', floor: '5:2,5 6:2,1 7:2,6', floor2: '6:1,1 5:1,0', accent: 'G:gothic_tracery 15:1,0', ground: '5:2,5 6:2,1' },
  sunken_temple: { wall: 'G:moss_gothic_ruin G:stone_moss_bricks 15:2,4', wall2: '15:1,2 G:gothic_quatrefoil 15:1,0', floor: 'G:stone_moss_blocks 15:2,8 G:slab_dark_floor', floor2: 'G:mosaic_floor', accent: 'G:gold_filigree 15:1,2' },
  storm_spire: { wall: 'G:stone_dark_bricks G:gothic_arches 15:0,4', wall2: 'G:iron_spikes_black', floor: 'G:slab_dark_floor 15:0,8', floor2: 'G:wood_grey_planks 21:3,9', side: 'G:stone_dark_bricks 15:0,4' },
  sky_fortress: { wall: 'G:stone_grey_bricks 15:0,9', wall2: 'G:gold_filigree 22:4,0', floor: 'G:slab_dark_floor 15:0,8', floor2: '#cloud', side: 'G:stone_grey_bricks 15:0,9', accent: 'G:marble_columns G:gold_filigree' },
  haunted_mansion: { wall: 'G:damask_red G:fleur_green', wall2: 'G:wood_dark_planks 22:3,1', floor: 'G:wood_grey_planks 21:3,9', floor2: '#carpet_red', ceil: 'G:wood_dark_planks', accent: 'G:gold_filigree', door: 'G:wood_iron_door 19:2,0', panel: 'G:wood_dark_planks 22:3,1', carpet: '#carpet_red', light: '#lantern', machine: '#bookshelf', side: 'G:wood_dark_planks', trim: 'G:gold_filigree 22:4,0', crate: '15:3,3', glass: '19:0,6 19:1,9 19:0,3' },
  cyber_castle: { floor: 'G:ornate_metal_tile 22:3,2', floor2: '#neon_grid_cyan', wall2: '14:0,0 22:4,1', accent: '#neon_grid_pink', light: '#light_cyan', neon: '#sign_cyan', ceil: '22:1,2 14:0,0', side: '22:0,0 G:stone_dark_bricks', machine: 'machine@cyber', screen: 'screen@cyber' },
  // ---- city
  ruined_city: { floor: '21:0,1 21:4,3 21:0,9', floor2: '21:0,8 21:4,1 21:0,2', wall2: 'G:plaster_brick_ruin 21:4,6 18:4,5', ceil: '21:3,4 20:1,7', accent: '21:4,7 21:4,9 21:2,7', legacy: { wall: 'facade_ruin@city facade3@city' } },
  ruined_town: { floor: '21:0,1 21:4,3', floor2: '21:0,4 21:0,8', ceil: 'G:wood_dark_planks', legacy: { wall: 'G:plaster_brick_ruin 21:4,6 18:4,5 18:4,0', wall2: 'facade_ruin@city' } },
  downtown: { floor: '21:0,0 21:0,1', floor2: '21:0,2 21:0,7 21:0,5', ceil: '22:2,1 20:1,3', side: '21:3,4 22:2,1', legacy: { wall: 'facade@city', wall2: 'facade@city' } },
  skyscraper_tops: { floor: 'roof@city', floor2: '8:2,4 14:1,3 25:4,4', side: 'facade@city', accent: 'roof_detail@city', legacy: { wall: 'facade@city', wall2: 'cladding@city' } },
  blood_harbor: { floor: '21:3,9 G:wood_grey_planks', floor2: '21:0,2 22:2,1', wall2: 'G:wood_dark_planks', side: 'G:wood_dark_planks 21:3,9', accent: '14:0,5 2:0,0', legacy: { wall: 'crate2@industrial' } },
  department_store: { wall: '22:2,9 22:2,0', wall2: '18:1,3 G:fleur_green', accent: '#shelves', floor: '22:2,0 #tile_white', floor2: 'G:checker_floor', ceil: '#ceiling_tile', light: '#light_fluor', crate: '#crate_cardboard', crate2: '#crate_cardboard', glass: '#glass_pane', door: '24:3,3 19:2,3' },
  subway_tunnels: { wall: '22:2,3 18:1,4 18:1,3', wall2: '21:3,6 21:3,4', floor: 'G:small_tile_floor 21:0,2', floor2: '8:2,4 14:1,3', ceil: '21:3,6 22:2,4', side: '21:3,4 21:3,6', accent: '1:3,1' },
  abandoned_hospital: { wall: '18:1,3 18:4,7', wall2: 'G:wallpaper_rotten 18:3,6', floor: '8:2,9 8:2,5 G:small_tile_floor', floor2: 'G:checker_floor', ceil: '#ceiling_tile_dim', accent: '8:2,5 15:2,6', light: '#light_fluor', machine: '3:2,2 4:2,6 4:2,9', metal: '22:1,0 22:1,2', crate2: '3:2,9 4:2,8 14:0,5', panel: '4:0,1 4:2,3', floor3: '22:2,7 22:2,0', pillar: '22:1,9 3:0,5', trim: '22:1,0 12:0,3', carpet: '#linen_mint', glass: '#glass_pane' },
  backrooms: { wall: '#wallpaper_yellow', wall2: '#wallpaper_yellow', side: '#wallpaper_yellow', accent: 'G:wallpaper_rotten', floor: '#carpet_moist', floor2: '#carpet_moist', carpet: '#carpet_moist', ceil: '#ceiling_tile', ceil2: '#ceiling_tile', light: '4:0,10 #light_fluor', trim: '22:2,9 20:1,7', pillar: '#wallpaper_yellow', door: '19:2,1 19:4,9' },
  concert_hall: { wall: 'G:damask_red', wall2: 'G:marble_columns 22:3,0', floor: 'G:wood_dark_planks 21:3,9', floor2: '#carpet_red', ceil: '22:4,0 G:gold_filigree', accent: 'G:wood_dark_planks 22:3,1 G:wood_grey_planks', side: '22:3,1 G:wood_dark_planks 21:3,9', carpet: '#carpet_red', light: '25:2,5 #light_white', pillar: 'G:marble_columns 22:3,0 24:2,4', trim: 'G:gold_filigree 22:4,0', rail: '22:1,1', door: '24:3,7 24:0,3' },
  movie_theater: { wall: '#curtain_red', wall2: 'G:damask_red', floor: '#carpet_theater', floor2: 'G:marble_black_floor 22:0,7', carpet: '#carpet_theater', ceil: '22:2,4 22:0,7', side: '#carpet_theater', accent: 'G:damask_red #carpet_red', screen: '#cinema', light: '#light_white', trim: 'G:gold_filigree 22:4,0', door: '24:3,7 24:3,5' },
  carnival: { wall: '#tent_red', wall2: 'G:wood_dark_planks', floor: '6:1,1 5:1,0', floor2: '21:3,9 G:wood_grey_planks', ceil: '#tent_red', side: '21:3,9 G:wood_dark_planks', accent: '#tent_purple', light: '#bulbs', neon: '#sign_pink', crate: '15:3,3 #crate_wood' },
  // ---- nature
  ruined_village: { floor: '5:2,5 7:2,6 6:2,1', floor2: '6:1,1 5:1,0 21:0,4', wall2: 'G:wood_dark_planks G:wood_nailed', ceil: 'G:wood_dark_planks', side: 'G:stone_moss_blocks G:stone_vine_bricks', ground: '5:2,5 7:2,6', legacy: { wall: 'G:stone_moss_blocks G:stone_vine_bricks 18:2,6' } },
  jungle_ruins: { wall: 'G:moss_gothic_ruin G:stone_vine_bricks 15:2,4', wall2: 'foliage@nature', floor: '5:2,5 7:2,6', floor2: '6:3,9 21:4,1', ceil: 'foliage@nature', side: '6:1,1 5:1,0', accent: 'G:moss_gothic_ruin 15:1,2' },
  toxic_swamp: { wall: 'foliage@nature', wall2: 'G:wood_burnt G:wood_dark_planks', floor: '6:1,1 6:1,6 6:1,7', floor2: '5:2,6 7:2,0', side: '6:1,1 6:1,6' },
  crystal_caverns: { wall: 'G:crystal_purple 17:3,2 11:1,7', wall2: 'rock@nature', floor: '6:4,8 7:4,7', floor2: '6:4,8 11:1,7 7:4,7', ceil: '17:3,2 G:crystal_purple', accent: '11:1,7 5:3,5 6:4,8', spikes: '#spikes_crystal' },
  mountain_top: { wall2: '5:4,6 6:4,4', floor: 'ground@ice', floor2: '5:0,0 6:0,9' },
  mountain_climb: { floor: '5:0,0 6:0,9 5:0,2', floor2: 'ground@ice', wall2: 'rock@ice' },
  // ---- desert
  desert: { floor: '6:1,2 7:1,7 5:1,2', floor2: '6:1,3 5:1,1' },
  canyon: { accent: 'rock@desert', floor2: '6:1,3 5:1,1 7:1,7' },
  canyon_bridges: { accent: '21:3,9 G:wood_grey_planks G:wood_dark_planks', floor2: 'G:wood_grey_planks 21:3,9 G:wood_dark_planks' },
  // ---- heaven
  heaven: { floor: '22:0,1 22:0,9', floor2: 'G:mosaic_floor 22:4,6', side: 'rock@heaven', accent: 'G:marble_columns 22:4,0', ceil: 'G:gold_filigree 22:4,0' },
  afterlife: { wall: '2:1,2 15:0,7', wall2: 'G:skull_niches 15:1,6', floor: 'G:purple_stone_floor', floor2: '22:0,9 22:0,1', side: '15:0,7 2:1,2', accent: 'G:skull_niches 15:1,6' },
  dream_maze: { wall: '#checker_bw', wall2: 'G:gold_filigree', floor: 'G:checker_floor', floor2: '#cloud', ceil: '#cloud', side: '#checker_bw', accent: 'G:gold_filigree 22:4,0' },
  // ---- cyber
  cyber_mountain: { floor: '#neon_grid_cyan', floor2: '22:3,2 22:0,0', wall2: '#neon_grid_pink' },
  digital_void: { floor: '#neon_grid_pink', floor2: '#neon_grid_cyan', side: 'rock@cyber', accent: '22:4,1 4:1,1' },
  neon_arcade: { wall: '22:3,2 22:0,0', wall2: '#neon_grid_cyan', floor: '#carpet_arcade', floor2: 'G:checker_floor', carpet: '#carpet_arcade', ceil: '22:2,4 22:0,7', side: '22:0,0', accent: '#arcade_cabinet', machine: '#arcade_cabinet', neon: '#sign_pink' },
  cyber_traffic: { floor: '21:0,0 21:0,1', floor2: '21:0,2 22:3,2', ceil: '22:3,2', side: '22:0,0 22:3,2', legacy: { wall: 'facade2@cyber facade2@city', wall2: 'facade@cyber' } },
};

// Glass balustrade themes get a framed pane in GLASS (a window picture would
// repeat along the rail otherwise).
export const GLASS_RAIL_PH = '#glass_pane';
