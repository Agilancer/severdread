// Gore profiles per monster category. Colours are linear RGB tints that
// multiply the neutral-toned gore atlas (src/art/sprites_gen.js
// generateGoreAtlas) and are then lit like any other world sprite, so blood
// never glows in a dark room. A monster def can override its category with
// `gore: '<profile id>'`.
//
//   drop   flying droplets          decal  floor / wall splats and pools
//   mist   blood cloud on a kill    lens   camera-lens splats
//   gibs   [[cellSet, weight], ...] (see GIB_CELLS), gibTint/gibHue/gibSat
//   metalGibs  true = 6-10 gibs instead of 8-12 (mostly hardware)
//   sparks/embers/dust/smoke  extra particles on the death burst
//   fleshy  enemy blood can splash the lens when it hits you in melee

// Gore atlas cells (8 columns x 4 rows of 32 px)
export const GC = {
  DROP: 0, STREAK: 1, MIST: 2, SPLAT_A: 3, SPLAT_B: 4, WALL_RUN: 5, POOL: 6, LENS_A: 7,
  CHUNK: 8, RIB: 9, GUT: 10, SKULL: 11, GEAR: 12, PLATE: 13, BOLT: 14, LENS_TRAIL: 15,
  SHARD: 16, FEMUR: 17, SCORCH: 18, LENS_B: 19, EYE: 20, CHUNK2: 21, VERTEBRA: 22, SPRING: 23,
};
export const GORE_COLS = 8, GORE_ROWS = 4;

export const GIB_CELLS = {
  flesh: [GC.CHUNK, GC.GUT, GC.CHUNK2, GC.CHUNK, GC.CHUNK2, GC.CHUNK, GC.GUT, GC.CHUNK2, GC.CHUNK, GC.CHUNK2, GC.CHUNK, GC.EYE],
  bone: [GC.RIB, GC.SKULL, GC.FEMUR, GC.VERTEBRA],
  metal: [GC.GEAR, GC.PLATE, GC.BOLT, GC.SPRING, GC.PLATE],
  crystal: [GC.SHARD],
};
// atlas cells drawn in final colours (rendered with a white tint)
export const GIB_FINAL = new Set([...GIB_CELLS.flesh, ...GIB_CELLS.bone, ...GIB_CELLS.metal]);

const RED = {
  drop: [0.52, 0.02, 0.015], decal: [0.34, 0.008, 0.006], mist: [0.3, 0.02, 0.015], lens: [0.56, 0.02, 0.015],
};

export const GORE = {
  beast: {
    ...RED,
    gibs: [['flesh', 0.75], ['bone', 0.25]], gibTint: [1, 1, 1],
    fleshy: true,
  },
  demon: {
    drop: [0.44, 0.0, 0.025], decal: [0.27, 0.0, 0.015], mist: [0.26, 0.012, 0.016], lens: [0.48, 0.0, 0.02],
    gibs: [['flesh', 0.8], ['bone', 0.2]], gibTint: [0.82, 0.62, 0.62],
    embers: 8, fleshy: true,
  },
  undead: {
    // dark, clotted, half-congealed
    drop: [0.32, 0.035, 0.018], decal: [0.2, 0.02, 0.01], mist: [0.28, 0.12, 0.08], lens: [0.36, 0.04, 0.02],
    gibs: [['bone', 0.6], ['flesh', 0.4]], gibTint: [0.8, 0.7, 0.62], gibSat: 0.6,
    dust: 4, dustColor: [0.36, 0.31, 0.26], fleshy: true,
  },
  alien: {
    // yellow-green acid
    drop: [0.42, 0.78, 0.1], decal: [0.26, 0.5, 0.05], mist: [0.3, 0.55, 0.1], lens: [0.4, 0.72, 0.1],
    gibs: [['flesh', 0.85], ['bone', 0.15]], gibTint: [0.95, 1.05, 0.8], gibHue: -2.0,
    fleshy: true,
  },
  robot: {
    // possessed hydraulics: crimson-black blood, sparks, smoke and hardware
    drop: [0.26, 0.008, 0.016], decal: [0.16, 0.006, 0.01], mist: [0.2, 0.05, 0.05], lens: [0.34, 0.015, 0.025],
    gibs: [['metal', 0.8], ['flesh', 0.2]], gibTint: [1, 1, 1], metalGibs: true,
    sparks: 26, smoke: 5, metalHit: true,
  },
  construct: {
    ...RED,
    gibs: [['crystal', 0.5], ['flesh', 0.3], ['metal', 0.2]], gibTint: [1, 1, 1],
    crystalTint: [0.62, 0.92, 1.1], sparks: 12, metalHit: true,
  },
};

export function goreProfile(def) {
  return GORE[def?.gore] || GORE[def?.category] || GORE.beast;
}
