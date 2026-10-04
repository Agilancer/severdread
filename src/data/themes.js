// Level themes. Each level picks one theme, which decides:
//   archetype  - which generator lays out the map (see game/levelgen/*)
//   tex        - per-surface texture requests: real textures whose tags match
//                `tags` are preferred; otherwise the placeholder `ph` spec is
//                generated procedurally (see art/textures_gen.js)
//   sky, fog, light, grade, hazard, void, props, monster bias, music mood
//
// 44 themes from the design brief + 31 originals = 75 themes.
//
//   family / family2 - texture families (station, industrial, hell, castle, city,
//                nature, ice, desert, heaven, cyber, organic): game/leveltextures.js
//                fills every role slot with tiles of these families (data/texroles.js)
//   railStyle  - hand / guard rail look: metal | stone | wood | glass | iron | neon
import { THEME_FAMILY } from './texroles.js';

// ---------------------------------------------------------- texture presets
const T = (tags, ph) => ({ tags, ph });
const TP = {
  metal: T(['metal', 'tech', 'station'], { type: 'metal_panel', base: '#5a5e66', accent: '#c0a020' }),
  metalDark: T(['metal', 'dark', 'tech'], { type: 'metal_panel', base: '#33363c' }),
  tech: T(['tech', 'station', 'cyber'], { type: 'tech_panel', base: '#4a4e58', accent: '#30d8ff', dark: '#0a0c10' }),
  techRed: T(['tech', 'hell'], { type: 'tech_panel', base: '#4a3a3a', accent: '#ff3030' }),
  grate: T(['grate', 'industrial', 'metal'], { type: 'grate', base: '#5a5a60' }),
  hex: T(['hex', 'tech', 'station'], { type: 'hex', base: '#3a3e44', dark: '#15171a', accent: '#30c0ff' }),
  concrete: T(['concrete', 'city', 'military'], { type: 'concrete', base: '#7a7872' }),
  concreteDark: T(['concrete', 'dark', 'bunker'], { type: 'concrete', base: '#4a4844' }),
  asphalt: T(['asphalt', 'road', 'city'], { type: 'asphalt', base: '#2c2c30' }),
  road: T(['road_lanes'], { type: 'asphalt', base: '#2a2a2e', lines: true, accent: '#e8d24a' }),
  brick: T(['brick', 'town', 'city'], { type: 'brick', base: '#8a3b2a' }),
  brickRuin: T(['brick', 'ruin', 'plaster'], { type: 'brick', base: '#7a4a3a' }),
  stone: T(['stone', 'castle', 'brick'], { type: 'brick', base: '#6a6a6a', dark: '#2a2a2a' }),
  rock: T(['rock', 'cave', 'mountain'], { type: 'rock', base: '#6a5a4c' }),
  rockRed: T(['rock', 'mars', 'red'], { type: 'rock', base: '#8a3a20' }),
  rockDark: T(['rock', 'volcano', 'dark'], { type: 'rock', base: '#3a3030', accent: '#ff5010' }),
  sand: T(['sand', 'desert'], { type: 'sand', base: '#c8a26a' }),
  dirt: T(['dirt', 'cave', 'floor'], { type: 'rock', base: '#5a4a38' }),
  grass: T(['grass', 'village', 'forest'], { type: 'grass', base: '#3d5a26' }),
  snow: T(['snow', 'ice', 'frozen'], { type: 'snow', base: '#dfe8f2' }),
  ice: T(['ice', 'frozen'], { type: 'ice', base: '#a8d8f0' }),
  wood: T(['wood', 'village'], { type: 'wood', base: '#6b4426' }),
  woodDark: T(['wood', 'dark', 'ruin'], { type: 'wood', base: '#3a2818' }),
  tile: T(['tile', 'floor'], { type: 'tile', base: '#9a9a9a' }),
  tileWhite: T(['tile', 'hospital', 'lab'], { type: 'tile', base: '#d8dcd8', dark: '#8a8e8a' }),
  checker: T(['checker', 'floor'], { type: 'tile', base: '#d8d8d0', alt: '#202020', size: 16 }),
  carpet: T(['carpet', 'theater'], { type: 'carpet', base: '#5a1a24', alt: '#a8862c' }),
  neon: T(['neon', 'cyber'], { type: 'neon_grid', base: '#07040f', accent: '#ff2bd6', alt: '#2bd6ff' }),
  neonBlue: T(['neon', 'cyber'], { type: 'neon_grid', base: '#030812', accent: '#2bd6ff' }),
  cloud: T(['cloud', 'heaven'], { type: 'cloud', base: '#f4f0ff', alt: '#d8c8ff' }),
  marble: T(['marble', 'heaven', 'temple'], { type: 'marble', base: '#e8e4dc' }),
  gold: T(['gold', 'heaven', 'ornate'], { type: 'gold', base: '#c89a2a' }),
  flesh: T(['flesh', 'gore', 'hell'], { type: 'flesh', base: '#7a1c1c' }),
  lava: T(['lava', 'hazard'], { type: 'lava', base: '#ff5a00' }),
  acid: T(['acid', 'hazard'], { type: 'lava', base: '#60e020', dark: '#0a3008', accent: '#e0ff60' }),
  water: T(['water'], { type: 'water', base: '#1a4a7a' }),
  sewerWater: T(['water', 'sewer'], { type: 'water', base: '#3a4a2a' }),
  crystal: T(['crystal', 'purple', 'cave'], { type: 'crystal', base: '#5a2a9a' }),
  windows: T(['windows', 'skyscraper'], { type: 'windows', base: '#3a3f48', alt: '#1a2a3a', accent: '#ffd27a' }),
  windowsRuin: T(['windows', 'ruin'], { type: 'windows', base: '#4a4640', alt: '#151515', accent: '#ff9a40', litChance: 0.08, broken: 0.4 }),
  windowsNeon: T(['windows', 'cyber'], { type: 'windows', base: '#14121c', alt: '#1a0a2a', accent: '#ff40d0', litChance: 0.5 }),
  container: T(['container', 'cargo'], { type: 'corrugated', base: '#8a2a1a', accent: '#d0d0d0' }),
  containerBlue: T(['container', 'cargo'], { type: 'corrugated', base: '#1a4a8a' }),
  truck: T(['truck', 'trailer'], { type: 'corrugated', base: '#c8c8c0', accent: '#d03030' }),
  train: T(['train', 'vehicle'], { type: 'train_side', base: '#9aa4ae', accent: '#d03030' }),
  hazardStripe: T(['hazard_stripes'], { type: 'hazard', base: '#e8c020' }),
  pipes: T(['pipes', 'industrial'], { type: 'pipes', base: '#5a5a60' }),
  circuit: T(['circuit', 'cyber', 'tech'], { type: 'circuit', base: '#0a3a1a', accent: '#4aff7a' }),
  speaker: T(['speaker', 'concert'], { type: 'speaker' }),
  curtain: T(['curtain', 'theater'], { type: 'curtain', base: '#8a0a1a' }),
  shelves: T(['shelves', 'store'], { type: 'shelves' }),
  wallpaperYellow: T(['backrooms'], { type: 'wallpaper', base: '#c8b46a', alt: '#a8944a' }),
  wallpaperRed: T(['wallpaper', 'mansion'], { type: 'wallpaper', base: '#6a1a1a', alt: '#4a1010' }),
  ceilingTile: T(['ceiling_tile', 'office'], { type: 'ceiling_tile', base: '#d8d4c4', light: true }),
  ceilingTileDim: T(['ceiling_tile', 'office'], { type: 'ceiling_tile', base: '#a8a494' }),
  carpetMoist: T(['carpet', 'backrooms'], { type: 'carpet', base: '#8a7a4a', alt: '#7a6a3a' }),
  bone: T(['bone', 'skull', 'crypt'], { type: 'bone', base: '#d8ccb0' }),
  hedge: T(['hedge', 'forest'], { type: 'hedge', base: '#2a4a1a' }),
  scales: T(['scales', 'organic'], { type: 'scales', base: '#5a3a2a' }),
  screens: T(['screens', 'tech'], { type: 'screen_wall', base: '#1a1e24', accent: '#40ff90' }),
  stars: T(['starfield'], { type: 'starfield' }),
  door: T(['door'], { type: 'door', base: '#5a5e66' }),
};
const tex = (o) => ({ wall: TP.metal, wall2: TP.tech, floor: TP.hex, floor2: TP.grate, ceil: TP.metalDark, accent: TP.hazardStripe, side: TP.metalDark, door: TP.door, ...o });

// ---------------------------------------------------------- sky presets
export const SKIES = {
  none: null,
  space: { top: [0.0, 0.0, 0.02], horizon: [0.02, 0.01, 0.05], bottom: [0, 0, 0.01], stars: 1.4, planet: 1, planetDir: [0.8, -0.35, 0.3], planetSize: 0.55, sunSize: 1, sunDir: [-0.6, 0.3, -0.5], sunColor: [1, 0.95, 0.85] },
  space_streak: { top: [0.0, 0.0, 0.03], horizon: [0.03, 0.02, 0.08], bottom: [0, 0, 0.01], stars: 1.6, streak: 1.5, planet: 3, planetDir: [-0.5, 0.2, 0.8], planetSize: 0.3 },
  blackhole: { top: [0.01, 0.0, 0.03], horizon: [0.05, 0.02, 0.06], bottom: [0, 0, 0.01], stars: 1.6, planet: 4, planetDir: [0.6, 0.25, 0.7], planetSize: 0.35 },
  moon: { top: [0, 0, 0.01], horizon: [0.03, 0.03, 0.05], bottom: [0.05, 0.05, 0.05], stars: 1.4, planet: 1, planetDir: [0.4, 0.5, 0.75], planetSize: 0.25 },
  mars: { top: [0.35, 0.14, 0.08], horizon: [0.8, 0.45, 0.25], bottom: [0.3, 0.12, 0.06], sunSize: 0.6, sunDir: [0.4, 0.5, 0.3], sunColor: [1, 0.85, 0.7], clouds: [0.8, 0.5, 0.3, 0.25] },
  venus: { top: [0.6, 0.45, 0.15], horizon: [0.95, 0.75, 0.35], bottom: [0.4, 0.3, 0.1], clouds: [0.95, 0.8, 0.45, 0.7], cloudSpeed: 0.04 },
  hell: { top: [0.12, 0.0, 0.0], horizon: [0.7, 0.12, 0.02], bottom: [0.3, 0.02, 0.0], clouds: [0.25, 0.03, 0.02, 0.6], cloudSpeed: 0.05, sunSize: 2, sunDir: [0.2, 0.15, 0.9], sunColor: [1, 0.3, 0.05] },
  ruined_day: { top: [0.32, 0.3, 0.28], horizon: [0.62, 0.55, 0.45], bottom: [0.3, 0.27, 0.22], clouds: [0.45, 0.42, 0.38, 0.55], sunSize: 0.8, sunDir: [0.3, 0.4, -0.6], sunColor: [1, 0.8, 0.6] },
  night_city: { top: [0.01, 0.01, 0.05], horizon: [0.25, 0.06, 0.3], bottom: [0.08, 0.02, 0.1], stars: 0.4, clouds: [0.3, 0.08, 0.35, 0.35] },
  dusk: { top: [0.12, 0.08, 0.25], horizon: [0.95, 0.45, 0.25], bottom: [0.3, 0.15, 0.15], sunSize: 2.5, sunDir: [0.0, 0.08, 1.0], sunColor: [1, 0.55, 0.2], clouds: [0.6, 0.3, 0.35, 0.4] },
  desert_day: { top: [0.25, 0.45, 0.8], horizon: [0.85, 0.8, 0.7], bottom: [0.6, 0.5, 0.35], sunSize: 1.2, sunDir: [0.3, 0.8, 0.2], sunColor: [1, 0.95, 0.8] },
  storm: { top: [0.08, 0.09, 0.12], horizon: [0.25, 0.27, 0.32], bottom: [0.1, 0.1, 0.12], clouds: [0.18, 0.2, 0.24, 0.85], cloudSpeed: 0.08 },
  heaven: { top: [0.55, 0.7, 1.0], horizon: [1.0, 0.95, 0.85], bottom: [0.95, 0.9, 1.0], sunSize: 3, sunDir: [0.2, 0.7, 0.4], sunColor: [1, 0.95, 0.7], clouds: [1, 1, 1, 0.75], cloudSpeed: 0.015 },
  afterlife: { top: [0.08, 0.02, 0.15], horizon: [0.25, 0.55, 0.6], bottom: [0.05, 0.1, 0.15], stars: 0.8, clouds: [0.4, 0.6, 0.7, 0.4], cloudSpeed: 0.01 },
  volcanic: { top: [0.06, 0.04, 0.04], horizon: [0.45, 0.15, 0.05], bottom: [0.25, 0.05, 0.02], clouds: [0.12, 0.08, 0.07, 0.8], cloudSpeed: 0.06 },
  snow: { top: [0.55, 0.6, 0.68], horizon: [0.85, 0.88, 0.92], bottom: [0.8, 0.82, 0.86], clouds: [0.9, 0.92, 0.95, 0.6] },
  digital: { top: [0, 0, 0], horizon: [0.0, 0.15, 0.2], bottom: [0.1, 0.0, 0.15], stars: 1.0 },
  jungle: { top: [0.3, 0.5, 0.45], horizon: [0.7, 0.8, 0.6], bottom: [0.2, 0.3, 0.15], clouds: [0.7, 0.8, 0.75, 0.5] },
  ocean_storm: { top: [0.1, 0.12, 0.15], horizon: [0.3, 0.35, 0.4], bottom: [0.05, 0.1, 0.15], clouds: [0.2, 0.22, 0.26, 0.8], cloudSpeed: 0.1 },
};

// ---------------------------------------------------------- themes
const th = (id, name, archetype, o) => ({ id, name, archetype, params: {}, light: 0.75, lightVar: 0.25, ambient: 0.04, fog: [0, 0, 0], fogDensity: 0.03, grade: [1, 1, 1], sky: 'none', void: 'abyss', hazard: null, props: ['crate', 'barrel'], monsterBias: {}, music: 'industrial', ...o });

export const THEMES = [
  // ---- from the design brief ----
  th('possessed_station', 'Possessed Space Station', 'station', { tex: tex({ accent: TP.techRed }), sky: 'space', grade: [1.05, 0.9, 0.9], light: 0.6, props: ['terminal', 'crate', 'barrel'], monsterBias: { robot: 1.5 } }),
  th('mars_base', 'Mars Base', 'rooms', { params: { courtyards: 0.35 }, tex: tex({ floor: TP.rockRed, floor2: TP.hex, wall2: TP.rockRed }), sky: 'mars', fog: [0.45, 0.2, 0.1], fogDensity: 0.03, grade: [1.1, 0.92, 0.85], props: ['terminal', 'barrel', 'crate'] }),
  th('ruined_city', 'Ruined City', 'city', { params: { ruin: 0.6, tall: 0.6 }, tex: tex({ wall: TP.windowsRuin, wall2: TP.brickRuin, floor: TP.asphalt, floor2: TP.concrete, ceil: TP.concreteDark, side: TP.concrete, accent: TP.brickRuin }), sky: 'ruined_day', fog: [0.45, 0.4, 0.35], fogDensity: 0.025, props: ['barrel', 'cone', 'crate', 'sandbags'], music: 'ruins' }),
  th('ruined_village', 'Ruined Village', 'city', { params: { ruin: 0.7, tall: 0.1, village: true }, tex: tex({ wall: T(['stone', 'village', 'wall'], TP.stone.ph), wall2: TP.woodDark, floor: TP.grass, floor2: TP.dirt, ceil: TP.woodDark, side: TP.dirt, accent: TP.wood }), sky: 'dusk', fog: [0.35, 0.2, 0.2], props: ['tree', 'crate', 'torch'], music: 'ruins' }),
  th('ruined_town', 'Ruined Town', 'city', { params: { ruin: 0.6, tall: 0.3 }, tex: tex({ wall: TP.brickRuin, wall2: TP.windowsRuin, floor: TP.asphalt, floor2: TP.concrete, ceil: TP.woodDark, side: TP.concrete, accent: TP.brick }), sky: 'storm', fog: [0.2, 0.2, 0.22], props: ['barrel', 'cone', 'tree'], music: 'ruins' }),
  th('downtown', 'Downtown Skyline', 'city', { params: { ruin: 0.2, tall: 1.0, dense: true }, tex: tex({ wall: TP.windows, wall2: TP.windows, floor: TP.asphalt, floor2: TP.concrete, ceil: TP.concrete, side: TP.concrete, accent: TP.concrete }), sky: 'dusk', fog: [0.4, 0.25, 0.25], fogDensity: 0.018, props: ['lamp', 'cone', 'plant'], music: 'ruins' }),
  th('venus_base', 'Venus Base', 'rooms', { params: { courtyards: 0.3 }, tex: tex({ floor: T(['sand', 'yellow'], { type: 'rock', base: '#a88a3a' }), wall: T(['metal'], { type: 'metal_panel', base: '#7a6a4a', accent: '#ffaa20' }) }), sky: 'venus', fog: [0.8, 0.6, 0.25], fogDensity: 0.045, grade: [1.1, 1.0, 0.8], props: ['terminal', 'barrel'] }),
  th('hell', 'Hell', 'caves', { params: { lavaPools: 0.15, open: true }, tex: tex({ wall: T(['hell', 'flesh', 'bone'], TP.flesh.ph), wall2: T(['hell', 'brick', 'lava'], TP.rockDark.ph), floor: T(['hell', 'blood', 'red'], TP.rockRed.ph), floor2: TP.bone, ceil: T(['hell', 'dark'], TP.rockDark.ph), side: TP.rockDark, accent: T(['skull', 'bone', 'hell'], TP.bone.ph) }), sky: 'hell', hazard: 'lava', void: 'lava', fog: [0.25, 0.02, 0.0], fogDensity: 0.035, grade: [1.2, 0.85, 0.75], light: 0.65, props: ['skulls', 'candles', 'torch'], monsterBias: { demon: 2.5 }, music: 'hell' }),
  th('volcano_base', 'Volcano Base', 'foundry', { params: { lavaPools: 0.1, courtyards: 0.2 }, tex: tex({ wall: T(['metal', 'industrial'], TP.metalDark.ph), wall2: TP.rockDark, floor: TP.grate, floor2: TP.rockDark }), sky: 'volcanic', hazard: 'lava', void: 'lava', fog: [0.25, 0.08, 0.02], grade: [1.15, 0.95, 0.85], props: ['barrel', 'terminal'], music: 'hell' }),
  th('volcano', 'Volcano', 'caves', { params: { lavaPools: 0.22, open: true }, tex: tex({ wall: TP.rockDark, wall2: T(['lava', 'brick'], TP.rockDark.ph), floor: T(['volcano', 'rock', 'floor'], TP.rockDark.ph), floor2: TP.rockDark, ceil: TP.rockDark, side: TP.rockDark, accent: TP.rockDark }), sky: 'volcanic', hazard: 'lava', void: 'lava', fog: [0.3, 0.08, 0.02], fogDensity: 0.03, grade: [1.2, 0.9, 0.8], props: ['crystal'], music: 'hell' }),
  th('cave_base', 'Cave Base', 'rooms', { params: { caveWalls: true }, tex: tex({ wall: TP.rock, wall2: TP.metal, floor: TP.grate, floor2: TP.dirt, ceil: TP.rock, side: TP.rock }), light: 0.55, props: ['lamp', 'crate', 'barrel'] }),
  th('caves', 'Caves', 'caves', { tex: tex({ wall: TP.rock, wall2: T(['cave', 'roots', 'web'], TP.rock.ph), floor: TP.dirt, floor2: T(['cave', 'cobble', 'floor'], TP.dirt.ph), ceil: TP.rock, side: TP.rock, accent: T(['cave', 'wet'], TP.rock.ph) }), light: 0.5, fog: [0.02, 0.02, 0.03], props: ['crystal', 'skulls', 'torch'], hazard: 'water', music: 'caves' }),
  th('canyon', 'Canyon', 'canyon', { tex: tex({ wall: TP.rockRed, wall2: TP.rock, floor: TP.sand, floor2: TP.rock, side: TP.rockRed, ceil: TP.rock }), sky: 'desert_day', fog: [0.8, 0.65, 0.5], fogDensity: 0.015, light: 0.95, props: ['tree', 'skulls'], music: 'desert' }),
  th('canyon_bridges', 'Canyon of Bridges', 'canyon', { params: { chasms: true }, tex: tex({ wall: TP.rockRed, wall2: TP.rock, floor: TP.sand, floor2: TP.wood, side: TP.rockRed, ceil: TP.rock, accent: TP.wood }), sky: 'dusk', void: 'abyss', fog: [0.6, 0.35, 0.25], fogDensity: 0.018, light: 0.9, props: ['torch', 'skulls'], music: 'desert' }),
  th('skyscraper_tops', 'Skyscraper Rooftops', 'rooftops', { tex: tex({ wall: TP.windows, wall2: TP.windowsNeon, floor: TP.concrete, floor2: TP.grate, side: TP.windows, ceil: TP.concrete, accent: TP.hazardStripe }), sky: 'night_city', void: 'city_abyss', fog: [0.1, 0.03, 0.12], fogDensity: 0.012, light: 0.8, props: ['lamp', 'terminal', 'barrel'], music: 'cyber' }),
  th('space_train', 'Space Train', 'convoy', { params: { lanes: 1, vehicle: 'train', tunnel: false }, tex: tex({ wall: TP.train, floor: TP.metal, floor2: TP.grate, side: TP.train, accent: TP.hazardStripe }), sky: 'space_streak', void: 'space', light: 0.85, props: ['crate', 'barrel'], music: 'speed' }),
  th('space_duel', 'Space Duel', 'convoy', { params: { lanes: 2, vehicle: 'ship', gap: 3 }, tex: tex({ wall: TP.tech, floor: TP.hex, floor2: TP.metal, side: TP.tech, accent: TP.techRed }), sky: 'space_streak', void: 'space', light: 0.85, props: ['terminal', 'crate'], music: 'speed' }),
  th('space_freighter', 'Space Freighter', 'convoy', { params: { lanes: 2, vehicle: 'train', gap: 2 }, tex: tex({ wall: TP.container, wall2: TP.containerBlue, floor: TP.metal, floor2: TP.grate, side: TP.train, accent: TP.hazardStripe }), sky: 'space_streak', void: 'space', light: 0.85, props: ['crate'], music: 'speed' }),
  th('cyber_traffic', 'Cyber City Traffic Jam', 'city', { params: { ruin: 0.0, tall: 0.9, cars: 0.5, neon: true }, tex: tex({ wall: TP.windowsNeon, wall2: TP.neon, floor: TP.road, floor2: TP.asphalt, ceil: TP.neon, side: TP.neonBlue, accent: TP.neon }), sky: 'night_city', fog: [0.15, 0.03, 0.2], fogDensity: 0.02, light: 0.7, props: ['lamp', 'cone'], music: 'cyber' }),
  th('military_base', 'Military Base', 'rooms', { params: { courtyards: 0.4 }, tex: tex({ wall: TP.concrete, wall2: TP.metal, floor: TP.concrete, floor2: TP.asphalt, ceil: TP.concreteDark, side: TP.concrete, accent: TP.hazardStripe }), sky: 'ruined_day', fog: [0.4, 0.4, 0.38], props: ['sandbags', 'crate', 'barrel', 'terminal'], monsterBias: { robot: 1.4 }, music: 'military' }),
  th('possessed_military', 'Possessed Military Base', 'rooms', { params: { courtyards: 0.3, gore: true }, tex: tex({ wall: TP.concrete, wall2: TP.flesh, floor: TP.concrete, floor2: T(['blood', 'floor'], TP.rockRed.ph), ceil: TP.concreteDark, side: TP.concrete, accent: TP.flesh }), sky: 'hell', fog: [0.2, 0.03, 0.02], grade: [1.15, 0.85, 0.8], props: ['sandbags', 'skulls', 'barrel'], monsterBias: { demon: 1.6 }, music: 'military' }),
  th('backrooms', 'The Back Rooms', 'maze', { params: { office: true }, tex: tex({ wall: TP.wallpaperYellow, wall2: TP.wallpaperYellow, floor: TP.carpetMoist, floor2: TP.carpetMoist, ceil: TP.ceilingTile, side: TP.wallpaperYellow, accent: T(['wallpaper', 'rotten'], TP.wallpaperYellow.ph) }), light: 0.95, lightVar: 0.05, grade: [1.05, 1.0, 0.75], fog: [0.35, 0.3, 0.15], fogDensity: 0.05, props: [], music: 'backrooms' }),
  th('mountain_top', 'Mountain Top', 'mountain', { params: { height: 4, peaks: true }, tex: tex({ wall: TP.rock, wall2: TP.snow, floor: TP.snow, floor2: TP.rock, side: TP.rock, ceil: TP.rock }), sky: 'snow', void: 'clouds', fog: [0.8, 0.82, 0.86], fogDensity: 0.02, light: 0.95, props: ['tree'], music: 'mountain' }),
  th('mountain_climb', 'Mountain Climb', 'mountain', { params: { height: 9, climb: true }, tex: tex({ wall: TP.rock, wall2: TP.ice, floor: TP.rock, floor2: TP.snow, side: TP.rock, ceil: TP.rock }), sky: 'storm', void: 'clouds', fog: [0.3, 0.32, 0.36], fogDensity: 0.02, light: 0.8, props: ['tree', 'torch'], music: 'mountain' }),
  th('cyber_mountain', 'Cyber Mountain', 'mountain', { params: { height: 6, neon: true }, tex: tex({ wall: TP.neonBlue, wall2: TP.circuit, floor: TP.neon, floor2: TP.circuit, side: TP.neonBlue, ceil: TP.neon }), sky: 'digital', void: 'digital', fog: [0.02, 0.0, 0.06], fogDensity: 0.02, light: 0.7, props: ['lamp', 'terminal'], music: 'cyber' }),
  th('desert', 'Desert', 'mountain', { params: { height: 1.5, dunes: true }, tex: tex({ wall: TP.sand, wall2: T(['sandstone', 'desert'], TP.sand.ph), floor: TP.sand, floor2: T(['sand', 'floor'], TP.sand.ph), side: TP.sand, ceil: TP.rock }), sky: 'desert_day', fog: [0.85, 0.75, 0.6], fogDensity: 0.015, light: 1.0, props: ['skulls', 'tree'], music: 'desert' }),
  th('deserted_ruins', 'Deserted Ruins', 'city', { params: { ruin: 0.85, tall: 0.15, village: true }, tex: tex({ wall: T(['sandstone', 'desert', 'brick'], TP.sand.ph), wall2: T(['sand', 'ruin'], TP.sand.ph), floor: TP.sand, floor2: T(['sand', 'tile', 'floor'], TP.sand.ph), ceil: TP.sand, side: TP.sand, accent: T(['ornate', 'desert'], TP.sand.ph) }), sky: 'desert_day', fog: [0.85, 0.75, 0.6], fogDensity: 0.018, light: 1.0, props: ['skulls', 'statue'], music: 'desert' }),
  th('ruined_military', 'Ruined Military Base', 'rooms', { params: { courtyards: 0.5, ruin: 0.5 }, tex: tex({ wall: T(['concrete', 'ruin'], TP.concrete.ph), wall2: TP.brickRuin, floor: TP.concrete, floor2: TP.dirt, ceil: TP.concreteDark, side: TP.concrete, accent: TP.hazardStripe }), sky: 'storm', fog: [0.25, 0.25, 0.27], props: ['sandbags', 'barrel', 'cone'], music: 'military' }),
  th('huge_station', 'Huge Space Station', 'station', { params: { size: 1.4 }, tex: tex({ wall2: TP.screens }), sky: 'space', light: 0.75, props: ['terminal', 'plant', 'crate'], monsterBias: { robot: 1.3 } }),
  th('castle', 'Castle', 'castle', { tex: tex({ wall: T(['castle', 'stone', 'brick'], TP.stone.ph), wall2: T(['gothic', 'castle'], TP.stone.ph), floor: T(['castle', 'floor', 'stone'], TP.tile.ph), floor2: T(['checker', 'floor', 'marble'], TP.checker.ph), ceil: T(['wood', 'dark'], TP.woodDark.ph), side: T(['stone', 'castle'], TP.stone.ph), accent: T(['ornate', 'gothic', 'accent'], TP.stone.ph), door: T(['door', 'wood'], TP.door.ph) }), sky: 'storm', void: 'water', fog: [0.1, 0.1, 0.13], props: ['torch', 'statue', 'candles'], monsterBias: { demon: 1.3 }, music: 'castle' }),
  th('cyber_castle', 'Cyber Castle', 'castle', { params: { neon: true }, tex: tex({ wall: T(['castle', 'stone'], TP.stone.ph), wall2: TP.circuit, floor: TP.neon, floor2: T(['ornate', 'metal', 'floor'], TP.metal.ph), ceil: TP.metalDark, side: TP.neonBlue, accent: TP.neon }), sky: 'night_city', void: 'digital', fog: [0.08, 0.0, 0.12], props: ['lamp', 'statue', 'terminal'], music: 'cyber' }),
  th('afterlife', 'The Afterlife', 'islands', { tex: tex({ wall: T(['marble', 'afterlife', 'purple'], TP.marble.ph), wall2: T(['skull', 'afterlife'], TP.bone.ph), floor: T(['purple', 'arcane', 'floor'], { type: 'marble', base: '#6a5a8a', accent: '#c0a0ff' }), floor2: TP.marble, side: TP.marble, ceil: TP.marble, accent: T(['skull', 'niches'], TP.bone.ph) }), sky: 'afterlife', void: 'afterlife', fog: [0.1, 0.2, 0.25], fogDensity: 0.02, grade: [0.9, 1.0, 1.15], props: ['candles', 'statue', 'crystal'], monsterBias: { undead: 2 }, music: 'ethereal' }),
  th('heaven', 'Heaven', 'islands', { tex: tex({ wall: T(['marble', 'heaven', 'column'], TP.marble.ph), wall2: T(['gold', 'heaven'], TP.gold.ph), floor: TP.cloud, floor2: T(['marble', 'heaven', 'mosaic'], TP.marble.ph), side: TP.marble, ceil: TP.marble, accent: T(['gold', 'ornate'], TP.gold.ph) }), sky: 'heaven', void: 'clouds', fog: [0.95, 0.92, 0.9], fogDensity: 0.012, light: 1.05, grade: [1.08, 1.05, 0.95], props: ['statue', 'candles', 'plant'], music: 'ethereal' }),
  th('mosh_pit', 'Mosh Pit', 'hall', { params: { pit: true }, tex: tex({ wall: TP.speaker, wall2: T(['concrete', 'dark'], TP.concreteDark.ph), floor: TP.concreteDark, floor2: TP.grate, ceil: TP.grate, side: TP.metalDark, accent: TP.speaker }), light: 0.55, lightVar: 0.45, grade: [1.1, 0.85, 1.05], props: ['speakerbox', 'barrel'], music: 'metal' }),
  th('concert_hall', 'Concert Hall', 'hall', { params: { stage: true, tiers: true }, tex: tex({ wall: T(['theater', 'concert', 'wallpaper', 'damask'], TP.curtain.ph), wall2: T(['marble', 'column'], TP.marble.ph), floor: T(['wood', 'floor'], TP.wood.ph), floor2: TP.carpet, ceil: T(['gold', 'ornate'], TP.gold.ph), side: TP.wood, accent: T(['gold', 'ornate'], TP.gold.ph) }), light: 0.7, props: ['speakerbox', 'statue', 'candles'], music: 'metal' }),
  th('movie_theater', 'Movie Theater', 'hall', { params: { tiers: true, screen: true }, tex: tex({ wall: TP.curtain, wall2: T(['damask', 'theater'], TP.wallpaperRed.ph), floor: TP.carpet, floor2: TP.carpet, ceil: TP.concreteDark, side: TP.carpet, accent: T(['gold', 'theater'], TP.gold.ph) }), light: 0.45, props: ['plant'], music: 'backrooms' }),
  th('department_store', 'Giant Department Store', 'hall', { params: { shelves: true }, tex: tex({ wall: TP.shelves, wall2: T(['wallpaper', 'store', 'fleur'], TP.tileWhite.ph), floor: TP.tileWhite, floor2: TP.checker, ceil: TP.ceilingTile, side: TP.tileWhite, accent: TP.shelves }), light: 0.9, props: ['plant', 'crate'], music: 'backrooms' }),
  th('subway_tunnels', 'Subway Tunnels', 'maze', { params: { tunnels: true }, tex: tex({ wall: T(['tile', 'subway'], TP.tileWhite.ph), wall2: TP.concreteDark, floor: T(['subway', 'tile', 'floor'], TP.concreteDark.ph), floor2: TP.grate, ceil: TP.concreteDark, side: TP.concrete, accent: TP.hazardStripe }), light: 0.5, lightVar: 0.4, hazard: 'water', props: ['lamp', 'barrel'], music: 'industrial' }),
  th('subway_trains', 'Subway Trains', 'convoy', { params: { lanes: 2, vehicle: 'train', tunnel: true, gap: 2 }, tex: tex({ wall: TP.train, floor: TP.metal, floor2: TP.grate, ceil: TP.concreteDark, side: TP.train, accent: TP.hazardStripe }), void: 'rails', light: 0.6, fog: [0.02, 0.02, 0.03], props: ['crate'], music: 'speed' }),
  th('large_freighter', 'Large Space Freighter', 'station', { params: { cargo: true, size: 1.3 }, tex: tex({ wall: TP.container, wall2: TP.containerBlue, floor: TP.grate, floor2: TP.metal, accent: TP.hazardStripe }), sky: 'space', light: 0.65, props: ['crate', 'barrel'] }),
  th('semi_trucks', 'Highway Truck Chase', 'convoy', { params: { lanes: 5, vehicle: 'truck', gap: 1 }, tex: tex({ wall: TP.truck, wall2: TP.container, floor: TP.metal, floor2: T(['wood', 'floor'], TP.wood.ph), side: TP.truck, accent: TP.hazardStripe }), sky: 'dusk', void: 'road', fog: [0.6, 0.35, 0.25], fogDensity: 0.012, light: 0.95, props: ['crate', 'barrel', 'cone'], music: 'speed' }),

  // ---- 31 originals ----
  th('sewer_labyrinth', 'Sewer Labyrinth', 'maze', { params: { channels: true }, tex: tex({ wall: T(['sewer', 'brick', 'decay'], TP.brick.ph), wall2: T(['wet', 'stone', 'sewer'], TP.concreteDark.ph), floor: TP.concreteDark, floor2: TP.grate, ceil: T(['wet', 'stone'], TP.concreteDark.ph), side: TP.brick, accent: TP.pipes }), hazard: 'acid', light: 0.45, fog: [0.05, 0.08, 0.03], fogDensity: 0.04, props: ['barrel'], music: 'caves' }),
  th('bio_lab', 'Bio Lab', 'lab', { tex: tex({ wall: TP.tileWhite, wall2: TP.tech, floor: TP.tileWhite, floor2: TP.grate, ceil: TP.ceilingTile, accent: TP.hazardStripe }), hazard: 'acid', light: 0.85, grade: [0.95, 1.05, 0.95], props: ['terminal', 'plant', 'barrel'], monsterBias: { alien: 2 } }),
  th('frozen_outpost', 'Frozen Outpost', 'rooms', { params: { courtyards: 0.45 }, tex: tex({ wall: TP.metal, wall2: TP.ice, floor: TP.snow, floor2: TP.grate, side: TP.ice }), sky: 'snow', fog: [0.8, 0.85, 0.9], fogDensity: 0.03, grade: [0.9, 1.0, 1.15], props: ['crate', 'lamp'], music: 'mountain' }),
  th('glacier_caves', 'Glacier Caves', 'caves', { tex: tex({ wall: TP.ice, wall2: T(['frost', 'ice', 'rock'], TP.ice.ph), floor: TP.snow, floor2: TP.ice, ceil: TP.ice, side: TP.ice, accent: TP.ice }), light: 0.7, fog: [0.5, 0.65, 0.8], fogDensity: 0.03, grade: [0.85, 1.0, 1.2], hazard: 'water', props: ['crystal'], music: 'caves' }),
  th('jungle_ruins', 'Jungle Ruins', 'city', { params: { ruin: 0.75, tall: 0.2, village: true, overgrown: true }, tex: tex({ wall: T(['moss', 'ruin', 'vine'], TP.stone.ph), wall2: TP.hedge, floor: TP.grass, floor2: T(['moss', 'stone', 'floor'], TP.dirt.ph), ceil: TP.hedge, side: TP.dirt, accent: T(['gothic', 'moss'], TP.stone.ph) }), sky: 'jungle', fog: [0.25, 0.35, 0.2], fogDensity: 0.035, hazard: 'water', props: ['tree', 'plant', 'statue'], monsterBias: { beast: 2 }, music: 'ruins' }),
  th('flesh_cathedral', 'Cathedral of Flesh', 'hall', { params: { tiers: false, pillars: true }, tex: tex({ wall: T(['gothic', 'cathedral'], TP.flesh.ph), wall2: TP.flesh, floor: T(['blood', 'floor', 'hell'], TP.flesh.ph), floor2: TP.bone, ceil: T(['thorn', 'gothic', 'hell'], TP.flesh.ph), side: TP.flesh, accent: T(['skull', 'bone'], TP.bone.ph) }), hazard: 'lava', light: 0.55, grade: [1.25, 0.8, 0.8], fog: [0.15, 0.0, 0.02], props: ['candles', 'skulls', 'statue'], monsterBias: { demon: 2 }, music: 'hell' }),
  th('clockwork_foundry', 'Clockwork Foundry', 'foundry', { tex: tex({ wall: T(['rust', 'chain', 'industrial'], TP.pipes.ph), wall2: TP.pipes, floor: TP.grate, floor2: T(['metal', 'ornate', 'floor'], TP.metal.ph), ceil: TP.grate, accent: T(['chain', 'rust'], TP.pipes.ph) }), hazard: 'lava', light: 0.6, grade: [1.15, 1.0, 0.8], props: ['barrel', 'crate'], monsterBias: { robot: 2, construct: 1.5 }, music: 'industrial' }),
  th('data_core', 'Data Core', 'maze', { params: { racks: true }, tex: tex({ wall: TP.screens, wall2: TP.circuit, floor: TP.neonBlue, floor2: TP.hex, ceil: TP.grate, side: TP.circuit, accent: TP.screens }), light: 0.55, lightVar: 0.35, grade: [0.85, 1.0, 1.15], fog: [0.0, 0.03, 0.06], props: ['terminal'], monsterBias: { robot: 2 }, music: 'cyber' }),
  th('orbital_elevator', 'Orbital Elevator', 'rooftops', { params: { ring: true }, tex: tex({ wall: TP.tech, wall2: TP.metal, floor: TP.hex, floor2: TP.grate, side: TP.metal }), sky: 'space', void: 'space', light: 0.85, props: ['terminal', 'lamp'], music: 'speed' }),
  th('crashed_starship', 'Crashed Starship', 'rooms', { params: { courtyards: 0.4, ruin: 0.5 }, tex: tex({ wall: T(['metal', 'ruin'], TP.metalDark.ph), wall2: TP.tech, floor: TP.grate, floor2: TP.dirt, side: TP.metalDark }), sky: 'storm', hazard: 'acid', fog: [0.15, 0.18, 0.2], props: ['terminal', 'barrel'], music: 'industrial' }),
  th('necropolis', 'Necropolis', 'city', { params: { ruin: 0.5, tall: 0.15, village: true, tombs: true }, tex: tex({ wall: T(['crypt', 'stone', 'gothic'], TP.stone.ph), wall2: T(['skull', 'niches', 'crypt'], TP.bone.ph), floor: T(['cobble', 'stone', 'dark'], TP.concreteDark.ph), floor2: TP.dirt, ceil: TP.stone, side: TP.stone, accent: T(['skull', 'bone'], TP.bone.ph) }), sky: 'afterlife', fog: [0.05, 0.08, 0.1], fogDensity: 0.04, props: ['candles', 'statue', 'skulls'], monsterBias: { undead: 2.5 }, music: 'castle' }),
  th('blood_harbor', 'Blood Harbor', 'city', { params: { ruin: 0.4, tall: 0.3, docks: true }, tex: tex({ wall: TP.container, wall2: TP.woodDark, floor: TP.wood, floor2: TP.concrete, side: TP.woodDark, accent: TP.containerBlue }), sky: 'ocean_storm', hazard: 'water', void: 'water', fog: [0.2, 0.05, 0.05], props: ['crate', 'barrel'], music: 'ruins' }),
  th('neon_arcade', 'Neon Arcade', 'hall', { params: { cabinets: true }, tex: tex({ wall: TP.neon, wall2: TP.screens, floor: T(['carpet', 'neon'], { type: 'carpet', base: '#140a2a', alt: '#ff40c0' }), floor2: TP.checker, ceil: TP.neonBlue, side: TP.neonBlue, accent: TP.neon }), light: 0.6, lightVar: 0.4, grade: [1.05, 0.9, 1.15], props: ['terminal'], music: 'cyber' }),
  th('abandoned_hospital', 'Abandoned Hospital', 'lab', { tex: tex({ wall: T(['tile', 'hospital'], TP.tileWhite.ph), wall2: T(['wallpaper', 'rotten', 'decay'], TP.wallpaperYellow.ph), floor: TP.tileWhite, floor2: TP.checker, ceil: TP.ceilingTileDim, side: TP.tileWhite, accent: T(['blood'], TP.flesh.ph) }), light: 0.45, lightVar: 0.45, grade: [0.95, 1.05, 0.95], props: ['plant', 'crate'], monsterBias: { undead: 1.5 }, music: 'backrooms' }),
  th('haunted_mansion', 'Haunted Mansion', 'rooms', { params: { mansion: true }, tex: tex({ wall: T(['wallpaper', 'damask', 'mansion', 'fleur'], TP.wallpaperRed.ph), wall2: T(['wood', 'dark'], TP.woodDark.ph), floor: T(['wood', 'floor'], TP.wood.ph), floor2: TP.carpet, ceil: TP.woodDark, side: TP.woodDark, accent: T(['ornate', 'gold'], TP.gold.ph), door: T(['door', 'wood'], TP.door.ph) }), light: 0.45, grade: [1.05, 0.95, 0.9], props: ['candles', 'statue', 'plant'], monsterBias: { undead: 2 }, music: 'castle' }),
  th('crystal_caverns', 'Crystal Caverns', 'caves', { tex: tex({ wall: TP.crystal, wall2: TP.rock, floor: T(['purple', 'floor'], TP.dirt.ph), floor2: TP.crystal, ceil: TP.crystal, side: TP.rock, accent: TP.crystal }), light: 0.6, grade: [1.0, 0.9, 1.2], fog: [0.08, 0.02, 0.12], props: ['crystal'], music: 'caves' }),
  th('toxic_swamp', 'Toxic Swamp', 'mountain', { params: { height: 1.2, swamp: true }, tex: tex({ wall: TP.hedge, wall2: TP.woodDark, floor: TP.dirt, floor2: TP.grass, side: TP.dirt, ceil: TP.hedge }), sky: 'jungle', hazard: 'acid', fog: [0.2, 0.3, 0.1], fogDensity: 0.05, grade: [0.9, 1.1, 0.8], props: ['tree', 'plant', 'skulls'], monsterBias: { beast: 2 }, music: 'caves' }),
  th('asteroid_mines', 'Asteroid Mines', 'caves', { params: { open: true }, tex: tex({ wall: TP.rockDark, wall2: TP.metal, floor: TP.grate, floor2: TP.rock, ceil: TP.rock, side: TP.rock, accent: TP.hazardStripe }), sky: 'space', void: 'space', light: 0.6, props: ['lamp', 'crate', 'crystal'], monsterBias: { robot: 1.4 }, music: 'industrial' }),
  th('oil_rig', 'Storm Oil Rig', 'rooftops', { params: { rig: true }, tex: tex({ wall: TP.pipes, wall2: TP.metal, floor: TP.grate, floor2: TP.metal, side: TP.metal, accent: TP.hazardStripe }), sky: 'ocean_storm', void: 'water', fog: [0.25, 0.28, 0.3], fogDensity: 0.025, props: ['barrel', 'crate', 'lamp'], music: 'industrial' }),
  th('prison_complex', 'Prison Complex', 'maze', { params: { cells: true }, tex: tex({ wall: TP.concreteDark, wall2: T(['iron', 'spike', 'metal'], TP.grate.ph), floor: TP.concrete, floor2: TP.grate, ceil: TP.concreteDark, side: TP.concrete, accent: TP.hazardStripe }), light: 0.5, props: ['crate'], music: 'industrial' }),
  th('throne_of_bones', 'Throne of Bones', 'castle', { tex: tex({ wall: T(['bone', 'skull', 'crypt'], TP.bone.ph), wall2: T(['skull', 'niches'], TP.bone.ph), floor: TP.bone, floor2: T(['blood', 'floor'], TP.rockRed.ph), ceil: TP.rockDark, side: TP.bone, accent: T(['skull'], TP.bone.ph) }), sky: 'hell', hazard: 'lava', void: 'lava', fog: [0.2, 0.02, 0.0], grade: [1.15, 0.9, 0.85], props: ['skulls', 'candles', 'torch'], monsterBias: { undead: 2, demon: 1.5 }, music: 'hell' }),
  th('clocktower', 'The Clocktower', 'castle', { params: { tower: true }, tex: tex({ wall: T(['stone', 'brick', 'castle'], TP.stone.ph), wall2: T(['chain', 'rust', 'metal'], TP.pipes.ph), floor: TP.woodDark, floor2: TP.grate, ceil: TP.woodDark, side: TP.stone, accent: T(['gold', 'ornate'], TP.gold.ph) }), sky: 'storm', fog: [0.15, 0.15, 0.18], props: ['torch', 'candles'], music: 'castle' }),
  th('lunar_colony', 'Lunar Colony', 'rooms', { params: { courtyards: 0.5 }, tex: tex({ floor: T(['moon', 'rock'], { type: 'rock', base: '#8a8a8a' }), floor2: TP.hex, wall2: T(['rock', 'grey'], { type: 'rock', base: '#7a7a7a' }) }), sky: 'moon', light: 0.8, props: ['terminal', 'crate'] }),
  th('blackhole_observatory', 'Black Hole Observatory', 'station', { tex: tex({ wall: TP.metalDark, wall2: TP.screens, floor: TP.hex }), sky: 'blackhole', light: 0.6, grade: [1.05, 0.95, 1.1], props: ['terminal', 'plant'], music: 'ethereal' }),
  th('sunken_temple', 'Sunken Temple', 'castle', { params: { flooded: true }, tex: tex({ wall: T(['moss', 'gothic', 'ruin'], TP.stone.ph), wall2: T(['ornate', 'carving', 'gothic'], TP.stone.ph), floor: T(['stone', 'moss', 'floor'], TP.stone.ph), floor2: T(['mosaic', 'ornate'], TP.marble.ph), ceil: TP.stone, side: TP.stone, accent: T(['gold', 'ornate'], TP.gold.ph) }), hazard: 'water', void: 'water', light: 0.55, fog: [0.05, 0.15, 0.15], fogDensity: 0.04, grade: [0.85, 1.0, 1.05], props: ['statue', 'torch', 'crystal'], music: 'caves' }),
  th('dream_maze', 'Dream Maze', 'maze', { params: { surreal: true }, tex: tex({ wall: T(['checker'], TP.checker.ph), wall2: T(['gold', 'ornate'], TP.gold.ph), floor: TP.checker, floor2: TP.cloud, ceil: TP.cloud, side: TP.checker, accent: TP.gold }), sky: 'afterlife', light: 0.9, grade: [1.05, 0.95, 1.1], props: ['statue', 'plant'], music: 'ethereal' }),
  th('carnival', 'Carnival of Terror', 'hall', { params: { tents: true }, tex: tex({ wall: T(['stripes', 'tent'], { type: 'hazard', base: '#d02020', dark: '#f0e0d0' }), wall2: TP.woodDark, floor: TP.dirt, floor2: TP.wood, ceil: T(['tent'], { type: 'hazard', base: '#d02020', dark: '#f0e0d0' }), side: TP.wood, accent: TP.gold }), sky: 'night_city', light: 0.6, lightVar: 0.4, props: ['lamp', 'barrel'], music: 'metal' }),
  th('storm_spire', 'Storm Spires', 'rooftops', { params: { spires: true }, tex: tex({ wall: T(['gothic', 'stone'], TP.stone.ph), wall2: T(['iron', 'spike'], TP.grate.ph), floor: T(['stone', 'floor'], TP.concreteDark.ph), floor2: TP.grate, side: TP.stone }), sky: 'storm', void: 'clouds', fog: [0.2, 0.22, 0.26], fogDensity: 0.02, props: ['torch', 'statue'], music: 'castle' }),
  th('infernal_foundry', 'Infernal Foundry', 'foundry', { params: { lavaPools: 0.15 }, tex: tex({ wall: T(['lava', 'brick', 'hell'], TP.rockDark.ph), wall2: T(['iron', 'spike', 'hell'], TP.metalDark.ph), floor: TP.grate, floor2: T(['lava', 'rock', 'floor'], TP.rockDark.ph), ceil: TP.metalDark, accent: T(['chain', 'rust'], TP.pipes.ph) }), hazard: 'lava', light: 0.6, grade: [1.2, 0.9, 0.8], props: ['barrel', 'skulls'], monsterBias: { demon: 1.6, robot: 1.3 }, music: 'hell' }),
  th('graveyard', 'Graveyard Shift', 'city', { params: { ruin: 0.3, tall: 0.05, village: true, tombs: true }, tex: tex({ wall: T(['crypt', 'stone'], TP.stone.ph), wall2: TP.hedge, floor: TP.grass, floor2: TP.dirt, ceil: TP.stone, side: TP.dirt, accent: T(['gothic', 'tracery'], TP.stone.ph) }), sky: 'night_city', fog: [0.04, 0.06, 0.08], fogDensity: 0.05, props: ['tree', 'candles', 'statue'], monsterBias: { undead: 2.5 }, music: 'castle' }),
  th('arctic_rail', 'Arctic Rail', 'convoy', { params: { lanes: 2, vehicle: 'train', gap: 2 }, tex: tex({ wall: TP.train, floor: TP.snow, floor2: TP.metal, side: TP.train, accent: TP.hazardStripe }), sky: 'snow', void: 'snowfield', fog: [0.85, 0.88, 0.92], fogDensity: 0.03, light: 0.95, props: ['crate'], music: 'speed' }),
  th('digital_void', 'Digital Void', 'islands', { params: { grid: true }, tex: tex({ wall: TP.neonBlue, wall2: TP.circuit, floor: TP.neon, floor2: TP.neonBlue, side: TP.circuit, ceil: TP.neon, accent: TP.neon }), sky: 'digital', void: 'digital', fog: [0.0, 0.02, 0.05], fogDensity: 0.02, light: 0.75, props: ['terminal'], monsterBias: { robot: 1.6 }, music: 'cyber' }),
  th('meat_plant', 'Meat Processing Plant', 'foundry', { params: { gore: true }, tex: tex({ wall: TP.tileWhite, wall2: TP.flesh, floor: T(['blood', 'floor'], TP.tileWhite.ph), floor2: TP.grate, ceil: TP.pipes, accent: TP.flesh }), hazard: 'acid', light: 0.6, lightVar: 0.4, grade: [1.15, 0.9, 0.9], props: ['barrel', 'crate'], monsterBias: { demon: 1.4, beast: 1.4 }, music: 'industrial' }),
  th('sky_fortress', 'Sky Fortress', 'islands', { params: { fortress: true }, tex: tex({ wall: T(['castle', 'stone'], TP.stone.ph), wall2: T(['gold', 'ornate'], TP.gold.ph), floor: T(['stone', 'floor'], TP.tile.ph), floor2: TP.cloud, side: TP.stone, ceil: TP.stone, accent: TP.gold }), sky: 'heaven', void: 'clouds', fog: [0.85, 0.9, 0.95], fogDensity: 0.012, light: 1.0, props: ['statue', 'torch'], music: 'ethereal' }),
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

// The space station hub theme (not in the random rotation)
export const HUB_THEME = th('hub', 'Orbital Station AEGIS-9', 'hub', {
  tex: tex({ wall: TP.metal, wall2: TP.screens, floor: TP.hex, floor2: TP.grate, ceil: TP.metalDark, accent: TP.hazardStripe, special: T(['teleporter'], { type: 'teleporter', base: '#202830', accent: '#40e0ff' }) }),
  sky: 'space', light: 0.9, lightVar: 0.1, fog: [0, 0, 0], fogDensity: 0.01, ambient: 0.08, music: 'hub',
});

// ---------------------------------------------------------- texture families + rail style
// Rails must match the architecture: steel in stations and factories, stone
// balustrades in castles and temples, wrought iron in hell and graveyards, wooden
// rails in mansions and the wilds, glass in labs and malls, neon in cyberspace.
const RAIL_STYLE = {
  metal: 'possessed_station mars_base venus_base lunar_colony frozen_outpost crashed_starship cave_base orbital_elevator space_duel space_train space_freighter large_freighter blackhole_observatory volcano_base clockwork_foundry oil_rig semi_trucks subway_trains sewer_labyrinth meat_plant prison_complex military_base possessed_military ruined_military asteroid_mines mosh_pit arctic_rail ruined_city ruined_town downtown subway_tunnels abandoned_hospital backrooms movie_theater hub',
  glass: 'huge_station bio_lab department_store skyscraper_tops',
  iron: 'hell volcano flesh_cathedral throne_of_bones infernal_foundry clocktower graveyard storm_spire',
  stone: 'castle necropolis sunken_temple sky_fortress concert_hall deserted_ruins jungle_ruins heaven afterlife dream_maze',
  wood: 'haunted_mansion ruined_village caves toxic_swamp crystal_caverns mountain_top mountain_climb glacier_caves desert canyon canyon_bridges carnival blood_harbor',
  neon: 'cyber_castle cyber_mountain digital_void neon_arcade cyber_traffic data_core',
};
const RAIL_OF = {};
for (const [style, ids] of Object.entries(RAIL_STYLE)) for (const id of ids.split(' ')) RAIL_OF[id] = style;
for (const t of [...THEMES, HUB_THEME]) {
  const [f1, f2] = (THEME_FAMILY[t.id] || 'station').split(' ');
  t.family ??= f1;
  if (f2) t.family2 ??= f2;
  t.railStyle ??= RAIL_OF[t.id] || 'metal';
}
