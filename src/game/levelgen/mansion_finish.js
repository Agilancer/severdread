// Finishing pass of the mansion archetype (see gen_mansion.js): skirting,
// wainscot panelling and crown mouldings by room (papered rooms get a
// panelled dado, panelled rooms a cornice, service rooms a plain skirting,
// stone cellars none), windows on every outside wall (tall sash windows
// with curtains in the state rooms, plain casements below stairs, moonlight
// falling in), architraves round the doorways, the secret bookcase standing
// open (or shut) in the library, doors boarded up where a doorway is unused,
// and a candle sconce in any room left without light.
import { Kit, TS, F, FACE, OPP, GF, UF, CF, CANDLE, MOON, lbox, each } from './mansion_kit.js';
import * as P from './mansion_props.js';
import { outside, markWall, wallTaken, wallCell, sconces } from './mansion_rooms.js';

// trims and windows per room kind
const TRIM = {
  foyer: 'paper', ballroom: 'paper', bwhall: 'paper', bedroom: 'paper', master: 'paper', nursery: 'paper', music: 'paper',
  dining: 'panel', library: 'panel', study: 'panel', bath: 'panel',
  kitchen: 'service', backstair: 'service', servpass: 'service', servhall: 'service', laundry: 'service', scullery: 'service',
  chapel: 'stone', cellar: 'none', crypt: 'none', mausoleum: 'none', secret: 'none', conservatory: 'none',
};
const FANCY = new Set(['foyer', 'ballroom', 'dining', 'library', 'study', 'music', 'master', 'bedroom', 'nursery', 'bwhall', 'chapel']);
const NO_WINDOWS = new Set(['cellar', 'crypt', 'secret', 'mausoleum', 'conservatory', 'backstair']);

export function finishRooms(M) {
  const { g, deco } = M;
  for (const r of M.P.rooms) {
    if (r.unused || r.sky) continue;
    const k = new Kit(M, r);
    const cells = [];
    for (let b = 0; b < r.dv; b++) for (let a = 0; a < r.du; a++) if (k.mine(a, b)) cells.push(k.idx(a, b));
    r.cells = cells;
    // ---- trims
    const t = TRIM[r.kind] || 'paper';
    if (t === 'paper') deco.wallTrims(cells, { base: 0.24, wainscot: 1.05, crown: true, wainTex: TS.PANEL, baseTex: TS.TRIM, crownTex: TS.TRIM });
    else if (t === 'panel') deco.wallTrims(cells, { base: 0.24, wainscot: 0, crown: true, baseTex: TS.TRIM, crownTex: TS.TRIM });
    else if (t === 'service') deco.wallTrims(cells, { base: 0.16, wainscot: 0, crown: false, baseTex: TS.WOOD });
    else if (t === 'stone') deco.wallTrims(cells, { base: 0.4, wainscot: 0, crown: true, baseTex: TS.PILLAR, crownTex: TS.TRIM });
    // ---- windows on outside walls
    if (!NO_WINDOWS.has(r.kind)) windows(k, FANCY.has(r.kind));
    // ---- architraves round the doorways
    for (const p of r.ports) if (p.active && p.kind !== 'secret' && p.kind !== 'bookcase') architrave(k, p, FANCY.has(r.kind));
    // ---- light: a room nobody lit gets sconces
    const lit = deco.lights.some((l) => cells.some((i) => Math.abs((i % g.w) + 0.5 - l.x) < 1.5 && Math.abs(((i / g.w) | 0) + 0.5 - l.z) < 1.5));
    if (!lit) for (const ld of [0, 1, 2, 3]) sconces(k, ld, k.y + 2.1, 4);
  }
  secretDoors(M);
}

// tall windows on the room's outside walls, every three cells
function windows(k, fancy) {
  const { g, deco, rng } = k;
  for (const ld of [0, 1, 2, 3]) {
    const L = k.wallLen(ld);
    const off = 1 + ((L - 2) % 3 === 0 ? 0 : 1);
    for (let s = off; s + 1 < L; s += 3) {
      if (!outside(k, ld, s)) continue;
      if (!k.wallClear(ld, s - 1, s + 2, 0)) continue;
      const [a, b] = wallCell(k, ld, s);
      if (!k.mine(a, b)) continue;
      const i = k.idx(a, b);
      if (g.flags[i] & (F.STAIR | F.PIT | F.HAZARD)) continue;
      const f = g.floor[i], ceil = g.ceil[i];
      const y0 = f + 0.9, y1 = Math.min(ceil - 0.6, f + (ceil - f > 7 ? 4.6 : ceil - f > 4.6 ? 3.4 : 2.9));
      if (y1 - y0 < 1.3 || wallTaken(k.r, ld, s - 0.3, s + 1.3, y0 - 0.3, y1 + 0.3)) continue;
      // the neighbour cells either side along the wall should stand at the same floor (not a flight)
      const p = k.wallFrame(ld, s - 0.05, s + 1.05, 0.2, 0);
      P.sashWindow(deco, p, y0, y1, { curtains: fancy, lit: rng.chance(0.1) });
      markWall(k, ld, s - 0.4, s + 1.4, y0 - 0.3, y1 + 0.5);
      if (rng.chance(0.5)) deco.light(p.px(0.5, 0.8), y0 + 0.6, p.pz(0.5, 0.8), MOON, 3.5);
    }
  }
}

// a moulded frame round a doorway on this room's side
function architrave(k, p, fancy) {
  const { deco, fr, g } = k;
  const l = p.link;
  const h = p.h, top = h + (l.w >= 3 ? 3.4 : l.kind === 'secret' || l.kind === 'bookcase' ? 2.6 : 3.0);
  // only when the doorway's cells really end at that height (open wall above would show it floating)
  const [ca, cb] = p.cells[0];
  const i = k.idx(ca, cb);
  if (i < 0 || g.ceil[i] < top + 0.3) return;
  const ld = p.dir;
  const t = 0.12, w = 0.22;
  // local strip coordinates: along s, the wall at depth 0 (frame on the room face)
  const box = (s0, s1, y0, y1, tex) => {
    const [a0, b0, a1, b1] = k.strip(ld, s0, s1, t);
    lbox(deco, fr, a0, y0, b0, a1, y1, b1, tex, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
  };
  const tex = fancy ? TS.TRIM : TS.WOOD;
  box(p.s0 - w, p.s0, h, top, tex);
  box(p.s1, p.s1 + w, h, top, tex);
  box(p.s0 - w - 0.05, p.s1 + w + 0.05, top, top + (fancy ? 0.32 : 0.2), tex);
  markWall(k, ld, p.s0 - 0.3, p.s1 + 0.3, h, top + 0.4);
}

// the secret door: in the library a bookcase on a pivot, standing open when
// the passage is used (shut, it is just one more bookcase); on the upper
// floor a panel of the wall swung open
function secretDoors(M) {
  const { deco } = M;
  for (const l of M.P.links) {
    if (l.kind !== 'bookcase' && l.kind !== 'secret') continue;
    const p = l.B.kind === 'secret' ? l.portA : l.portB;      // the side away from the stair
    const R = p.room;
    if (R.unused) continue;
    const k = new Kit(M, R);
    const [s0, s1] = [p.s0, p.s1];
    if (l.kind === 'bookcase') {
      if (l.active) {
        // swung open: standing square to the wall beside the opening
        const pp = k.wallFrame(p.dir, s1 + 0.02, s1 + 0.48, 1.1);
        P.bookcase(deco, pp, k.y, 2.7, { depth: 0.44 });
        lbox(deco, k.fr, ...rectAt(k, p.dir, s0 - 0.12, s0, 0, 0.3), k.y, k.y + 2.7, TS.WOOD);
      } else {
        const pp = k.wallFrame(p.dir, s0 - 0.5, s1 + 0.5, 0.45);
        P.bookcase(deco, pp, k.y, 2.9);
      }
    } else if (l.active) {
      // a panel of the wall ajar
      const pp = k.wallFrame(p.dir, s1 + 0.02, s1 + 0.1, 0.9);
      lbox(deco, pp, 0, p.h, 0, pp.la, p.h + 2.5, pp.lb, TS.PANEL);
    }
  }
}
// local box rect against wall ld: along s0..s1, depth d0..d1 from the wall
function rectAt(k, ld, s0, s1, d0, d1) {
  if (ld === 0) return [k.W - d1, s0, k.W - d0, s1];
  if (ld === 1) return [d0, s0, d1, s1];
  if (ld === 2) return [s0, k.D - d1, s1, k.D - d0];
  return [s0, d0, s1, d1];
}

// an unused doorway that was once there: planks nailed across its frame (both sides)
export function boardedDoor(M, l) {
  const { deco } = M;
  for (const p of [l.portA, l.portB]) {
    const R = p.room;
    if (R.unused || R.sky) continue;
    const k = new Kit(M, R);
    const [ca, cb] = p.cells[0];
    if (!k.mine(ca, cb) || Math.abs(k.fl(ca, cb) - p.h) > 0.3) continue;
    const h = p.h, top = h + 2.9, ld = p.dir;
    const box = (s0, s1, y0, y1, d0, d1, tex) => {
      const [a0, b0, a1, b1] = rectAt(k, ld, s0, s1, d0, d1);
      lbox(deco, k.fr, a0, y0, b0, a1, y1, b1, tex);
    };
    box(p.s0 - 0.2, p.s0, h, top, 0, 0.1, TS.WOOD);
    box(p.s1, p.s1 + 0.2, h, top, 0, 0.1, TS.WOOD);
    box(p.s0 - 0.25, p.s1 + 0.25, top, top + 0.22, 0, 0.12, TS.WOOD);
    for (let y = h + 0.5; y < top - 0.3; y += 0.62) box(p.s0 - 0.1, p.s1 + 0.1, y, y + 0.22, 0.1, 0.15, TS.WOOD);
    markWall(k, ld, p.s0 - 0.3, p.s1 + 0.3, h, top + 0.3);
  }
}
