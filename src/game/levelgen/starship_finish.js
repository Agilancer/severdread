// Finishing pass for the "starship" archetype (see gen_starship.js), run after
// the architect generator has carved and dressed every room:
//   - wall textures by room use (hull panels in the crew decks, corrugated
//     steel in the holds; torn plating round the crashed ship's breach);
//   - outside the hull: open space under the star field round the freighter
//     (the hull is seen from its windows), solid ground round the crashed one;
//   - the windows recorded by the room templates (room.shipWindows) cut
//     through the hull as framed viewports with mullions (the glass is
//     clear: a collider and blocked edges, no pane), the hangar's launch bay
//     as an open bay behind a containment field; on the crashed ship the
//     windows are behind emergency blast shutters and the bridge looks out
//     at the earth its nose ploughed up;
//   - bulkhead frames on the spine's open section joins and the wide side
//     openings (jamb plates, hazard header, parked blast-door leaves);
//   - the crashed ship's torn ends: buckled plating round the openings onto
//     the crash site, cable bundles spilling out with sparks, rubble ramps,
//     torn hull tops, rock walls closing the ravine at both ends.
import { TS, F, DIR_X, DIR_Z, OPP, SKY_H } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import * as P from './starship_props.js';

const { faced, CYAN, AMBER, SPARK } = P;
const VOID_Y = -40;

export function finishShip(L, theme, rng, S) {
  const { grid: g, deco } = L;
  const crashed = !!S.crashed;
  L.voidY = VOID_Y;
  const byLeaf = new Map(L.rooms.map((r) => [r.leaf, r]));
  wallSlots(L, S, rng, byLeaf);
  if (!crashed) openSpace(L, S);
  for (const r of L.rooms) for (const w of r.shipWindows || []) cutWindow(L, S, r, w, rng);
  dressPassages(L, S, rng);
  if (crashed) tornEnds(L, S, rng);
  calmRooms(L, S);
  // the hull cells round the rooms: plating caps where they show
  for (let i = 0; i < g.w * g.h; i++) if (!g.type[i] && S.inLeaf[i] && g.floorTex[i] === TS.FLOOR) g.floorTex[i] = TS.METAL;
  void deco;
}

// ---------------------------------------------------------------- walls
const WALL2_FREIGHTER = new Set(['ss_cargo', 'ss_hangar', 'ss_storage', 'ss_maint', 'ss_engine', 'ss_life']);
function wallSlots(L, S, rng, byLeaf) {
  const g = L.grid;
  const crashRoom = L.rooms.find((r) => r.leaf.kind === 'ss_crash');
  // rooms whose leaf touches the crash site: torn plating (crashed WALL2)
  const nearCrash = (r) => crashRoom && (r.leaf.x + r.leaf.w === crashRoom.leaf.x || crashRoom.leaf.x + crashRoom.leaf.w === r.leaf.x);
  for (const r of L.rooms) {
    if (r.leaf.kind === 'ss_crash') continue;
    let want, tornX = null;
    if (S.crashed) {
      // torn plating where the hull broke (the walls toward the crash site and
      // a few cells round the corners), on a wrecked room now and then
      want = (r.leaf.kind === 'ss_engine' && rng.chance(0.4)) || rng.chance(0.1) ? TS.WALL2 : TS.WALL;
      if (nearCrash(r)) tornX = r.leaf.x + r.leaf.w === crashRoom.leaf.x ? r.x + r.w : r.x - 1;
    } else want = WALL2_FREIGHTER.has(r.leaf.kind) ? TS.WALL2 : TS.WALL;
    r.wallSlotFinal = want;
    for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (!g.in(x, z)) continue;
      const i = g.idx(x, z);
      if (g.type[i]) continue;
      const ring = x === r.x - 1 || x === r.x + r.w || z === r.z - 1 || z === r.z + r.h;
      const torn = tornX !== null && Math.abs(x - tornX) <= 2 + ((x * 7 + z * 13) % 3);
      if (ring && (g.wallTex[i] === TS.WALL || g.wallTex[i] === TS.WALL2 || g.wallTex[i] === TS.ACCENT)) g.wallTex[i] = torn ? TS.WALL2 : want;
    }
  }
  void byLeaf;
}

// ---------------------------------------------------------------- space
// every cell outside the hull is open void under the sky; the map border
// sinks out of sight so nothing hides the stars
function openSpace(L, S) {
  const g = L.grid;
  for (let z = 0; z < g.h; z++) for (let x = 0; x < g.w; x++) {
    const i = g.idx(x, z);
    if (S.inLeaf[i]) continue;
    if (x === 0 || z === 0 || x === g.w - 1 || z === g.h - 1) { g.solid(x, z, VOID_Y - 200, TS.METAL); g.floorTex[i] = TS.METAL; continue; }
    g.open(x, z, VOID_Y, SKY_H, { sky: true, light: 0.55, floorTex: TS.VOID, ceilTex: TS.CEIL, wallTex: TS.METAL, region: -1 });
    g.flags[i] |= F.VOID | F.NOSPAWN | F.OUTDOOR;
  }
}

// ---------------------------------------------------------------- windows
function cutWindow(L, S, r, w, rng) {
  const { grid: g, deco } = L;
  const Fr = frame(r, w.side);
  const y = r.floor, top = y + r.ceilH;
  const sill = w.sill, head = Math.min(w.head, r.ceilH - 0.3);
  const out = Fr.toward;                       // world direction out through the wall
  const cols = [];
  for (let s = w.s0; s < w.s1; s++) {
    const [x, z] = Fr.cell(0, s);
    const rx = x + DIR_X[out], rz = z + DIR_Z[out];
    const bx = rx + DIR_X[out], bz = rz + DIR_Z[out];
    if (!g.in(bx, bz) || g.type[g.idx(rx, rz)]) continue;
    const beyond = g.idx(bx, bz);
    if (S.crashed ? S.inLeaf[beyond] : !(g.type[beyond] && (g.flags[beyond] & F.VOID))) continue;
    cols.push(s);
  }
  if (cols.length < 2) return;
  // contiguous runs only
  const segs = [];
  for (const s of cols) { const last = segs[segs.length - 1]; if (last && last[1] === s) last[1] = s + 1; else segs.push([s, s + 1]); }
  for (const [s0, s1] of segs) {
    if (s1 - s0 < 2) continue;
    if (S.crashed && w.kind !== 'bridge') { blastShutter(L, r, Fr, s0, s1, y + sill, y + head); continue; }
    for (let s = s0; s < s1; s++) {
      const [x, z] = Fr.cell(0, s);
      const rx = x + DIR_X[out], rz = z + DIR_Z[out];
      const ri = g.idx(rx, rz);
      // the window cell in the hull: sill below, head above, open between
      g.open(rx, rz, y + sill, y + head, { floorTex: TS.TRIM, ceilTex: TS.TRIM, wallTex: r.wallSlotFinal ?? TS.WALL, light: g.light[g.idx(x, z)], region: -1 });
      g.flags[ri] |= F.NOSPAWN | F.OBSTACLE;
      g.setEdge(x, z, out, true);
      if (S.crashed) buriedNose(L, S, r, rx, rz, out, y, rng);
    }
    const yb = y + sill, yt = y + head;
    clearWallDeco(L, Fr, s0, s1, yb, yt);
    // frame: sill ledge, head band, jambs; mullions at every cell boundary
    fbW(deco, Fr, -1.0, 0.06, s0, s1, yb - 0.06, yb + 0.04, TS.TRIM);
    fbW(deco, Fr, -1.0, 0.08, s0, s1, yt - 0.12, yt, TS.METAL);
    for (let s = s0; s <= s1; s++) {
      const wdt = s === s0 || s === s1 ? 0.12 : 0.06;
      fbW(deco, Fr, -0.55, -0.45, s - wdt, s + wdt, yb, yt, TS.METAL, { faces: FACE.SIDES });
    }
    if (w.kind !== 'bay' && yt - yb > 2.6) fbW(deco, Fr, -0.55, -0.45, s0, s1, yb + (yt - yb) * 0.62, yb + (yt - yb) * 0.62 + 0.07, TS.METAL);
    // clear glass: blocks movement and shots, pathing never crosses (edges)
    const [ax, az] = Fr.pt(-0.5, s0), [bx, bz] = Fr.pt(-0.5, s1);
    deco.collider(Math.min(ax, bx) - (Fr.away < 2 ? 0.05 : 0), y, Math.min(az, bz) - (Fr.away < 2 ? 0 : 0.05), Math.max(ax, bx) + (Fr.away < 2 ? 0.05 : 0), Math.max(top, yt), Math.max(az, bz) + (Fr.away < 2 ? 0 : 0.05), { obstacle: false });
    if (w.kind === 'bay') {
      // the containment field: glowing emitter strips round the open bay
      fbW(deco, Fr, -0.62, -0.38, s0, s0 + 0.14, yb, yt, TS.NEON, { emissive: 1 });
      fbW(deco, Fr, -0.62, -0.38, s1 - 0.14, s1, yb, yt, TS.NEON, { emissive: 1 });
      fbW(deco, Fr, -0.62, -0.38, s0, s1, yt - 0.3, yt - 0.16, TS.NEON, { emissive: 1 });
      fbW(deco, Fr, 0.05, 0.25, s0, s1, y + 0.004, y + 0.018, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
      for (let s = s0 + 1; s < s1; s += 2) { const [lx, lz] = Fr.pt(0.3, s); deco.light(lx, y + (yt - y) * 0.5, lz, CYAN, 5, { pulse: true }); }
    }
  }
  void rng;
}
// wall trims (baseboard, wainscot) that crossed the wall where the opening is cut
function clearWallDeco(L, Fr, s0, s1, yb, yt) {
  const { deco } = L;
  const [ax, az] = Fr.pt(-0.02, s0), [bx, bz] = Fr.pt(0.16, s1);
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
  const alongX = Fr.away >= 2;    // the wall runs along x
  deco.boxes = deco.boxes.filter((b) => {
    const thin = alongX ? b.z1 - b.z0 <= 0.13 : b.x1 - b.x0 <= 0.13;
    if (!thin || b.x0 < x0 - 1e-6 || b.x1 > x1 + 1e-6 || b.z0 < z0 - 1e-6 || b.z1 > z1 + 1e-6) return true;
    return !(b.y1 > yb + 0.01 && b.y0 < yt - 0.01);
  });
}
// box in frame coordinates where t may be negative (into the wall)
function fbW(deco, Fr, t0, t1, s0, s1, y0, y1, tex, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.box(ax, y0, az, bx, y1, bz, tex, o);
}
// emergency blast shutter closed over a window (crashed ship)
function blastShutter(L, r, Fr, s0, s1, yb, yt) {
  const { deco } = L;
  fbW(deco, Fr, 0, 0.14, s0, s1, yb - 0.1, yt + 0.1, faced(Fr.away, TS.METAL, TS.METAL), { s: 1 });
  for (let yy = yb + 0.35; yy < yt - 0.1; yy += 0.45) fbW(deco, Fr, 0.14, 0.18, s0 + 0.05, s1 - 0.05, yy, yy + 0.06, TS.TRIM);
  fbW(deco, Fr, 0.14, 0.16, s0 + 0.05, s1 - 0.05, yt - 0.12, yt, TS.PAINT, { uv: 'fit' });
  fbW(deco, Fr, 0.14, 0.16, s0 + 0.05, s1 - 0.05, yb - 0.08, yb + 0.04, TS.PAINT, { uv: 'fit' });
  void r;
}
// the crashed bridge's window looks out at the earth its nose ploughed up:
// open ground beyond the hull rising toward the glass, rocks, the storm sky
function buriedNose(L, S, r, rx, rz, out, y, rng) {
  const g = L.grid;
  for (let k = 1; k < 12; k++) {
    const x = rx + DIR_X[out] * k, z = rz + DIR_Z[out] * k;
    if (!g.in(x, z)) break;
    const i = g.idx(x, z);
    if (S.inLeaf[i] || x === 0 || z === 0 || x === g.w - 1 || z === g.h - 1) {
      if (!g.type[i] && !S.inLeaf[i]) { g.floor[i] = y + rng.float(2.5, 5); g.wallTex[i] = TS.ROCK; g.floorTex[i] = TS.GROUND; }
      break;
    }
    if (!g.type[i]) g.open(x, z, y - 0.6 + Math.min(1.8, k * 0.55) + rng.float(-0.15, 0.15), SKY_H, { sky: true, light: 0.85, floorTex: TS.GROUND, ceilTex: TS.CEIL, wallTex: TS.ROCK, region: -1 });
    g.flags[i] |= F.NOSPAWN | F.OBSTACLE | F.OUTDOOR;
    // the solid ground cells beside the pocket read as rock
    for (const d of [0, 1, 2, 3]) {
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (!g.in(nx, nz)) continue;
      const j = g.idx(nx, nz);
      if (!g.type[j] && !S.inLeaf[j]) { g.wallTex[j] = TS.ROCK; g.floorTex[j] = TS.GROUND; g.floor[j] = Math.max(y + 2.5, Math.min(g.floor[j], y + 6)); }
    }
    if (rng.chance(0.4)) P.boulder({ deco: L.deco, rng }, x + 0.5, z + 0.5, g.floor[i], rng.float(0.4, 0.8), rng.float(0.5, 1.2));
  }
}

// ---------------------------------------------------------------- furnished rooms
// the crew decks keep their aisles: no scatter props (canister columns,
// barrels) or spawns right against the furniture, none at the bridge's helm
const CALM = new Set(['ss_bridge', 'ss_quarters', 'ss_med', 'ss_mess', 'ss_lounge', 'ss_armory', 'ss_airlock', 'ss_dock', 'ss_life']);
function calmRooms(L, S) {
  const g = L.grid;
  for (const r of L.rooms) {
    if (!CALM.has(r.leaf.kind)) continue;
    const bowSide = S.sternWest ? 0 : 1;
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
      const i = g.idx(x, z);
      if (!g.type[i]) continue;
      let near = false;
      for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = g.idx(x + dx, z + dz);
        if (g.type[j] && (g.flags[j] & F.OBSTACLE) && j !== i) { near = true; break; }
      }
      // the helm half of the bridge (toward the bow window)
      const helm = r.leaf.kind === 'ss_bridge' && (bowSide === 0 ? x >= r.x + r.w * 0.55 : x < r.x + r.w * 0.45);
      if (near || helm) g.flags[i] |= F.NOSPAWN;
    }
  }
}

// ---------------------------------------------------------------- passages
// bulkhead frames round the open spine joins and wide side openings: jamb
// plates on both faces, a hazard-striped header, blast-door leaves parked in
// the jambs; keyed gates and 1-wide doorways bring their own doors
function dressPassages(L, S, rng) {
  const { grid: g, deco } = L;
  for (const c of L.conns || []) {
    if (c.mode === 'skip' || c.door || c.width < 2) continue;
    const ka = c.A.leaf.kind, kb = c.B.leaf.kind;
    if (ka === 'ss_crash' || kb === 'ss_crash') continue;
    const ax = c.axis === 'x';
    const a0 = c.pos, a1 = c.pos + c.width;
    const cellAt = (t, a) => (ax ? g.idx(t, a) : g.idx(a, t));
    const i0 = cellAt(c.line - 1, a0), i1 = cellAt(c.line, a0);
    if (!g.type[i0] || !g.type[i1]) continue;
    const lo = Math.max(g.floor[i0], g.floor[i1]);
    const top = Math.min(g.ceil[i0], g.ceil[i1]);
    const spine = ka === 'ss_spine' && kb === 'ss_spine';
    const B = (t0, t1, b0, b1, y0, y1, tex, o) => (ax ? deco.box(t0, y0, b0, t1, y1, b1, tex, o) : deco.box(b0, y0, t0, b1, y1, t1, tex, o));
    // jamb plates and header on both room faces of the 2-thick wall
    for (const [f0, f1] of [[c.line - 1 - 0.12, c.line - 1], [c.line + 1, c.line + 1 + 0.12]]) {
      for (const [b0, b1] of [[a0 - 0.35, a0], [a1, a1 + 0.35]]) B(f0, f1, b0, b1, lo, top, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
      B(f0, f1, a0 - 0.35, a1 + 0.35, top - 0.45, top, TS.METAL);
      B(f0 - 0.01, f1 + 0.01, a0, a1, top - 0.42, top - 0.3, TS.PAINT, { uv: 'fit' });
    }
    // blast-door leaves parked in the jamb recesses (section bulkheads)
    if (spine) {
      for (const [b0, b1] of [[a0, a0 + 0.14], [a1 - 0.14, a1]]) B(c.line - 0.35, c.line + 0.35, b0, b1, lo, top - 0.45, TS.PANEL, { faces: FACE.SIDES });
      // section number light over the opening
      const mid = (a0 + a1) / 2;
      for (const fx of [c.line - 1.14, c.line + 1.12]) B(fx, fx + 0.02, mid - 0.25, mid + 0.25, top - 0.85, top - 0.55, TS.SCREEN, { uv: 'fit', emissive: 0.8 });
    }
    // hazard paint across the threshold
    if (Math.abs(g.floor[i0] - g.floor[i1]) < 0.01 && !(g.flags[i0] & F.STAIR) && !(g.flags[i1] & F.STAIR)) {
      B(c.line - 0.09, c.line + 0.09, a0 + 0.05, a1 - 0.05, lo + 0.004, lo + 0.018, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    }
  }
  void rng; void S;
}

// ---------------------------------------------------------------- crashed
// the torn ends of both hull halves at the crash site, rubble ramps in the
// openings, cables spilling out, rock walls closing the ravine
function tornEnds(L, S, rng) {
  const { grid: g, deco } = L;
  const cr = L.rooms.find((r) => r.leaf.kind === 'ss_crash');
  if (!cr) return;
  const ctx = { deco, rng, g };
  // the ravine walls at both ends of the crash site and the ground round it
  for (let z = cr.z - 1; z <= cr.z + cr.h; z++) for (let x = cr.x - 1; x <= cr.x + cr.w; x++) {
    if (!g.in(x, z)) continue;
    const i = g.idx(x, z);
    if (g.type[i]) continue;
    const endRow = z < cr.z || z >= cr.z + cr.h;
    if (endRow) { g.wallTex[i] = TS.ROCK; g.floor[i] = cr.floor + 7 + Math.round(rng.float(0, 5) * 2) / 2; g.floorTex[i] = TS.GROUND; }
  }
  // boulders along the ravine walls
  for (let x = cr.x; x < cr.x + cr.w; x += rng.int(2, 4)) {
    for (const z of [cr.z, cr.z + cr.h - 1]) {
      const i = g.idx(x, z);
      if (!g.type[i] || (g.flags[i] & (F.OBSTACLE | F.PIT | F.HAZARD | F.STAIR)) || cr.reserved.has(i) || rng.chance(0.4)) continue;
      P.boulder(ctx, x + 0.5, z + (z === cr.z ? 0.45 : 0.55), cr.floor, rng.float(0.45, 0.8), rng.float(0.8, 1.8));
    }
  }
  // no indoor trims (baseboards, wainscot) on the ravine walls and hull ends
  deco.boxes = deco.boxes.filter((b) => {
    if (b.tex !== TS.TRIM && b.tex !== TS.PANEL) return true;
    if (b.x1 < cr.x - 0.05 || b.x0 > cr.x + cr.w + 0.05 || b.z1 < cr.z - 0.05 || b.z0 > cr.z + cr.h + 0.05) return true;
    const thinX = b.x1 - b.x0 <= 0.1, thinZ = b.z1 - b.z0 <= 0.1;
    const atWall = (thinX && (Math.abs(b.x0 - cr.x) < 0.12 || Math.abs(b.x1 - cr.x - cr.w) < 0.12)) || (thinZ && (Math.abs(b.z0 - cr.z) < 0.12 || Math.abs(b.z1 - cr.z - cr.h) < 0.12));
    return !atWall;
  });
  // the torn hull ends: the wall faces toward the crash site, shredded
  const sides = [];
  if (g.in(cr.x - 1, cr.z)) sides.push({ x: cr.x - 1, dirIn: 0 });          // the half on the -x side
  if (g.in(cr.x + cr.w, cr.z)) sides.push({ x: cr.x + cr.w, dirIn: 1 });
  for (const sd of sides) {
    const fx = sd.dirIn === 0 ? sd.x + 1 : sd.x;                             // the wall plane facing the site
    for (let z = cr.z; z < cr.z + cr.h; z++) {
      const i = g.idx(sd.x, z);
      if (g.type[i]) continue;
      g.wallTex[i] = TS.WALL2;
      // buckled plates and broken frame ends standing proud of the torn face
      if (rng.chance(0.35)) {
        const yb = cr.floor + rng.float(0.5, 4), len = rng.float(0.8, 1.8);
        const sg = sd.dirIn === 0 ? 1 : -1;
        deco.bar([fx, yb, z + rng.float(0.2, 0.8)], [fx + sg * len * 0.8, yb + rng.float(-0.6, 0.9), z + rng.float(-0.3, 1.3)], rng.float(0.1, 0.25), rng.float(0.08, 0.2), rng.pick([TS.BEAM, TS.METAL, TS.WALL2]));
      }
      // the hull top torn ragged
      const top = g.floor[i];
      if (top < SKY_H - 1 && rng.chance(0.5)) {
        const hgt = rng.float(0.4, 1.6);
        deco.box(sd.x + rng.float(0, 0.4), top, z + rng.float(0, 0.3), sd.x + rng.float(0.6, 1), top + hgt, z + rng.float(0.6, 1), rng.pick([TS.WALL2, TS.BEAM, TS.METAL]), { faces: FACE.SIDES | FACE.TOP });
      }
    }
  }
  // the ship's cross-section in the torn ends: deck and ceiling plates of the
  // rooms behind sticking out ragged, frames standing proud of the hull top
  for (const sd of sides) {
    const fx = sd.dirIn === 0 ? sd.x + 1 : sd.x;
    const sg = sd.dirIn === 0 ? 1 : -1;
    for (const r of L.rooms) {
      if (r === cr) continue;
      const touches = sd.dirIn === 0 ? r.leaf.x + r.leaf.w === cr.leaf.x : r.leaf.x === cr.leaf.x + cr.leaf.w;
      if (!touches) continue;
      for (const [yy, th] of [[r.floor - 0.35, 0.35], [r.floor + r.ceilH, 0.4]]) {
        if (yy < cr.floor + 0.3) continue;
        for (let z = r.z - 1; z < r.z + r.h + 1; z += 1) {
          const out = rng.float(0.15, yy < cr.floor + 2.3 ? 0.45 : 1.2);
          deco.box(Math.min(fx, fx + sg * out), yy, z, Math.max(fx, fx + sg * out), yy + th, z + 1, rng.chance(0.7) ? TS.METAL : TS.WALL2);
        }
      }
      for (let z = r.z + 1; z < r.z + r.h - 1; z += 3) {
        const top = g.floor[g.idx(sd.x, z)];
        if (top >= SKY_H - 1) continue;
        deco.box(Math.min(fx, fx + sg * 0.35), cr.floor, z + 0.3, Math.max(fx, fx + sg * 0.35), top + rng.float(0.6, 2.0), z + 0.7, TS.BEAM, { faces: FACE.SIDES | FACE.TOP });
      }
    }
  }
  // the openings onto the site: rubble ramps, shredded edges, cables
  for (const c of L.conns || []) {
    if (c.mode === 'skip' || (c.A !== cr && c.B !== cr)) continue;
    const ax = c.axis === 'x';
    const a0 = c.pos, a1 = c.pos + c.width;
    const crashSideLine = c.A === cr ? c.line - 1 : c.line;      // passage cell on the crash side
    const hullSideLine = c.A === cr ? c.line : c.line - 1;
    const facePlane = c.A === cr ? c.line - 1 : c.line + 1;      // the wall face on the crash side
    const sg = c.A === cr ? -1 : 1;                              // toward the crash site
    for (let a = a0; a < a1; a++) {
      for (const t of [crashSideLine, hullSideLine]) {
        const i = ax ? g.idx(t, a) : g.idx(a, t);
        if (!g.type[i]) continue;
        if (g.flags[i] & F.STAIR) { g.floorTex[i] = TS.METAL; g.wallTex[i] = TS.WALL2; }
        else if (t === crashSideLine) g.floorTex[i] = TS.GROUND;
      }
    }
    const i0 = ax ? g.idx(hullSideLine, a0) : g.idx(a0, hullSideLine);
    const yTop = Math.min(g.ceil[i0], cr.floor + 6);
    const lo = cr.floor;
    // the breach is ragged: the wall beside the opening is blown out too,
    // rubble heaped in the gaps (too high to walk over), the top torn unevenly
    if (!c.door) {
      const base = Math.max(g.floor[i0], g.floor[ax ? g.idx(crashSideLine, a0) : g.idx(a0, crashSideLine)]);
      for (const [b, k] of [[a0 - 1, 1], [a1, 1], [a0 - 2, 2], [a1 + 1, 2]]) {
        if (k === 2 && rng.chance(0.4)) continue;
        for (const t of [c.line - 1, c.line]) {
          const x = ax ? t : b, z = ax ? b : t;
          if (!g.in(x, z)) continue;
          const i = g.idx(x, z);
          if (g.type[i]) continue;
          const nb = [0, 1, 2, 3].some((d) => { const j = g.idx(x + DIR_X[d], z + DIR_Z[d]); return g.type[j] && (g.flags[j] & F.DOOR); });
          if (nb) continue;
          const rub = base + (k === 1 ? rng.float(0.8, 1.3) : rng.float(1.6, 2.4));
          const ceil = Math.max(rub + 1.0, yTop - (k === 1 ? rng.float(0, 0.8) : rng.float(0.8, 1.8)));
          g.open(x, z, rub, ceil, { floorTex: TS.ROCK, ceilTex: TS.METAL, wallTex: TS.WALL2, light: g.light[i0], region: -2 });
          g.flags[i] |= F.NOSPAWN;
          P.debris(ctx, x + 0.5, z + 0.5, rub, rng.float(0.5, 0.8), { obstacle: false, texes: [TS.METAL, TS.WALL2, TS.BEAM] });
        }
      }
    }
    // shredded plating round the opening on the crash-site face
    for (const b of [a0, a1]) {
      for (let k = 0; k < 3; k++) {
        const yy = lo + rng.float(0.2, yTop - lo - 0.5);
        const p0 = [ax ? facePlane : b + (b === a0 ? 0.1 : -0.1), yy, ax ? b + (b === a0 ? 0.1 : -0.1) : facePlane];
        const p1 = [ax ? facePlane + sg * rng.float(0.3, 0.9) : b + (b === a0 ? 1 : -1) * rng.float(0.2, 0.6), yy + rng.float(-0.5, 0.5), ax ? b + (b === a0 ? 1 : -1) * rng.float(0.2, 0.6) : facePlane + sg * rng.float(0.3, 0.9)];
        deco.bar(p0, p1, rng.float(0.25, 0.5), 0.06, rng.pick([TS.WALL2, TS.METAL]));
      }
    }
    for (let a = a0 + 0.5; a < a1; a += rng.float(1.2, 2.2)) {
      const x = ax ? facePlane + sg * 0.2 : a, z = ax ? a : facePlane + sg * 0.2;
      P.sparkCable(ctx, x, z, yTop, rng.float(1.0, Math.max(1.1, yTop - lo - 2.0)));
    }
    // plates torn from the lintel, hanging down and out over the opening (above head height)
    for (let a = a0 + 0.3; a < a1 - 0.2; a += rng.float(0.7, 1.3)) {
      const drop = rng.float(0.6, Math.max(0.7, Math.min(1.6, yTop - lo - 2.4)));
      const p0 = ax ? [facePlane, yTop - 0.05, a] : [a, yTop - 0.05, facePlane];
      const p1 = ax ? [facePlane + sg * rng.float(0.2, 0.7), yTop - drop, a + rng.float(-0.3, 0.3)] : [a + rng.float(-0.3, 0.3), yTop - drop, facePlane + sg * rng.float(0.2, 0.7)];
      deco.bar(p0, p1, rng.float(0.3, 0.6), 0.05, rng.pick([TS.WALL2, TS.METAL, TS.CEIL]));
    }
    // debris heaps flanking the ramp on the site side
    for (const b of [a0 - 1, a1]) {
      const t = crashSideLine + sg * 1;
      const x = ax ? t : b, z = ax ? b : t;
      if (!g.in(x, z)) continue;
      const i = g.idx(x, z);
      if (!g.type[i] || (g.flags[i] & (F.OBSTACLE | F.STAIR | F.PIT | F.HAZARD)) || cr.reserved.has(i)) continue;
      P.debris(ctx, x + 0.5, z + 0.5, g.floor[i], rng.float(0.6, 0.9), { obstacle: false });
    }
  }
}

export { VOID_Y };
