// Room templates for the "starship" archetype (see gen_starship.js). They
// plug into the architect generator: ctx = {g, deco, rng, theme, style, room,
// cells, depth, boss}; room.reserved cells (exit approaches) stay flat and
// walkable. Bigger rooms build in a wall frame (frame(R, side): t = depth
// away from that wall, s = along it), check that the room still works (every
// exit reaches the others, most of the floor reachable) and try the next wall
// or a simpler layout when it does not.
//
// The crashed starship's rooms get the same purpose-built layouts plus damage
// (crashed(ctx)): fallen frames, torn cables, burst pipes, fuel leaks.
import { TS, F, DIR_X, DIR_Z, OPP } from './common.js';
import { FACE } from './deco.js';
import { frame } from './hall_templates.js';
import { TEMPLATES } from './gen_arch.js';
import {
  cellsOf, canUseL, useL, okL, ok, use, setHeightL, retexFloor, flightL, snap, restore, roomOK,
  wallSpots, wallBox, hangLight, paint, hazardLines, pitSet, freeMask, bestRect, markMask, glassLineL, lineOpening,
  cabinet, machineBlock, counter, monitor, bed, ivStand, vitalsMonitor, trolley, curtain, riser, steelTable, openShelf, nSteps,
  lightStrip, edgeCells, tank, seatRow, rackRow,
} from './lab_templates.js';
import { cylV, cylH, crane, pallet, drum, forklift, workbench } from './foundry_props.js';
import * as P from './starship_props.js';

const { faced, CYAN, COOL, AMBER, ALARM } = P;
const SS = {};
const stat = (...a) => { if (globalThis.__SHIPSTAT) globalThis.__SHIPSTAT.push(a); };

export function shipVariant(theme) {
  return theme?.id === 'crashed_starship' || theme?.params?.crashed ? 'crashed' : 'freighter';
}
const isCrashed = (ctx) => shipVariant(ctx.theme) === 'crashed';

// ======================================================================
// shared helpers
// ======================================================================
function tryFrames(ctx, sides, build, fallback) {
  const { deco, room: r } = ctx;
  for (let k = 0; k < sides.length; k++) {
    const Fr = frame(r, sides[k]);
    ctx.used = new Set();
    const m = deco.mark(), s = snap(ctx);
    let okb = false, built = false;
    ctx.why = '';
    try { built = build(Fr, k === sides.length - 1); okb = built && roomOK(ctx); } catch (e) { okb = false; stat('error', r.template, String((e && e.stack) || e).slice(0, 400)); }
    if (okb) return true;
    stat('try', r.template, sides[k], built ? 'roomOK' : ctx.why);
    deco.rollback(m); restore(ctx, s);
  }
  ctx.used = new Set();
  stat('fallback', r.template);
  if (fallback) fallback(ctx);
  return false;
}
const no = (ctx, why) => { ctx.why = why; return false; };
function sidesLong(ctx) {
  const { room: r, rng } = ctx;
  const longW = r.w >= r.h ? [3, 2] : [1, 0], shortW = r.w >= r.h ? [1, 0] : [3, 2];
  rng.shuffle(longW); rng.shuffle(shortW);
  return [...longW, ...shortW];
}
function sidesShort(ctx) {
  const { room: r, rng } = ctx;
  const longW = r.w >= r.h ? [3, 2] : [1, 0], shortW = r.w >= r.h ? [1, 0] : [3, 2];
  rng.shuffle(longW); rng.shuffle(shortW);
  return [...shortW, ...longW];
}
// the side of the room that is the ship's hull (outer wall), -1 if none
function hullSide(ctx) {
  const { room: r } = ctx;
  const S = r.leaf.ship;
  if (!S) return -1;
  if (r.leaf.z === S.hull.hz0) return 3;
  if (r.leaf.z + r.leaf.h === S.hull.hz1) return 2;
  return -1;
}
// box in frame coordinates (t away from the frame wall, s along it)
function fb(deco, Fr, t0, t1, s0, s1, y0, y1, tex, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.box(ax, y0, az, bx, y1, bz, tex, o);
}
function fcol(deco, Fr, t0, t1, s0, s1, y0, y1, o) {
  const [ax, az] = Fr.pt(t0, s0), [bx, bz] = Fr.pt(t1, s1);
  return deco.collider(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), o);
}
const cellL = (ctx, Fr, t, s) => { const [x, z] = Fr.cell(t, s); return ctx.g.idx(x, z); };
// is the wall behind frame cell (0, s) solid (no doorway / opening)?
function wallClosed(ctx, Fr, s) {
  const { g } = ctx;
  const [x, z] = Fr.cell(0, s);
  const w = g.idx(x - DIR_X[Fr.away], z - DIR_Z[Fr.away]);
  return g.in(x - DIR_X[Fr.away], z - DIR_Z[Fr.away]) && !g.type[w];
}
// guard rails on every walkable room cell that drops away
function railAll(ctx, skip) {
  const { g, deco } = ctx;
  const set = new Set(ctx.cells.filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.VOID)) && !(skip && skip.has(i))));
  deco.railEdges(set, { style: ctx.style.railStyle });
}
// ceiling light panels in a grid (skipping pits / stairs)
function panelLights(ctx, step = 4, color = COOL) {
  const { g, deco, room: r } = ctx;
  for (let z = r.z + 1 + (r.h % step >> 1); z < r.z + r.h - 1; z += step) for (let x = r.x + 1 + (r.w % step >> 1); x < r.x + r.w - 1; x += step) {
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i] || (g.flags[i] & (F.PIT | F.STAIR))) continue;
    deco.lightPanel(x + 0.1, z + 0.25, x + 0.9, z + 0.75, g.ceil[i], color, 6);
  }
  r.lit = true;
}
function highBay(ctx, step = 6, color = COOL) {
  const { g, room: r } = ctx;
  for (let z = r.z + 2; z < r.z + r.h - 1; z += step) for (let x = r.x + 2; x < r.x + r.w - 1; x += step) {
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i] || (g.flags[i] & (F.PIT | F.STAIR))) continue;
    const head = g.ceil[i] - g.floor[i];
    if (head < 4.5) { ctx.deco.lightPanel(x + 0.15, z + 0.3, x + 0.85, z + 0.7, g.ceil[i], color, 6.5); continue; }
    hangLight(ctx, x + 0.5, z + 0.5, g.ceil[i], Math.max(0.5, Math.min(2.5, head - 6)), color, 9);
  }
  r.lit = true;
}
// overhead pipe bundle along a wall of the room (on the frame wall, t ~ 0.3)
function pipeRun(ctx, Fr, s0, s1, y, n = 2, r0 = 0.13) {
  const { deco } = ctx;
  for (let k = 0; k < n; k++) {
    const t = 0.28 + k * 0.32, yy = y - (k % 2) * 0.25;
    const [ax, az] = Fr.pt(t, s0), [bx, bz] = Fr.pt(t, s1);
    if (Math.abs(ax - bx) > Math.abs(az - bz)) cylH(deco, Math.min(ax, bx), Math.max(ax, bx), yy, az, r0 - k * 0.02, true, TS.PIPE);
    else cylH(deco, Math.min(az, bz), Math.max(az, bz), yy, ax, r0 - k * 0.02, false, TS.PIPE);
  }
}
// screen on the wall face of frame cell (0, s): a wall display
function wallScreen(ctx, Fr, s0, s1, y0, y1) {
  fb(ctx.deco, Fr, 0, 0.05, s0, s1, y0, y1, TS.SCREEN, { uv: 'fit', emissive: 0.85 });
  fb(ctx.deco, Fr, 0, 0.08, s0 - 0.06, s1 + 0.06, y0 - 0.06, y0, TS.METAL);
  fb(ctx.deco, Fr, 0, 0.08, s0 - 0.06, s1 + 0.06, y1, y1 + 0.06, TS.METAL);
}
// a small machine / console against the wall of frame column s (t = 0), facing into the room
function wallMachine(ctx, Fr, s, y, h = 1.8, front = TS.MACHINE) {
  const [x, z] = Fr.cell(0, s);
  wallBox(ctx, x, z, Fr.toward, 0.7, y, y + h, faced(Fr.away, front, TS.METAL, TS.METAL), { solid: true, uv: 'fit', inset: 0.05 });
}

// Damage for the crashed ship: fallen ceiling panels, torn cables, burst
// pipes, debris and leaking fuel. density ~ how wrecked the room is.
function crashed(ctx, density = 1) {
  const { g, deco, rng, room: r } = ctx;
  if (!isCrashed(ctx)) return;
  const n = Math.max(1, Math.round((r.area / 50) * density));
  for (let k = 0; k < n * 3 && n > 0; k++) {
    const x = rng.int(r.x + 1, r.x + r.w - 2), z = rng.int(r.z + 1, r.z + r.h - 2);
    const i = g.idx(x, z);
    if (!g.type[i] || g.sky[i] || (g.flags[i] & (F.PIT | F.STAIR | F.DOOR | F.BRIDGE | F.OBSTACLE)) || r.reserved.has(i)) continue;
    const head = g.ceil[i] - g.floor[i];
    const roll = rng.next();
    if (roll < 0.45 && head > 2.8) P.sparkCable(ctx, x + 0.5, z + 0.5, g.ceil[i], Math.min(head - 1.6, rng.float(1, 2.4)));
    else if (roll < 0.8 && ok(ctx, x, z, 1, 1)) {
      // a ceiling panel come down at an angle, one end on the floor
      const a = rng.float(0, Math.PI * 2);
      deco.bar([x + 0.5 + Math.cos(a) * 0.7, g.floor[i] + 0.04, z + 0.5 + Math.sin(a) * 0.7], [x + 0.5 - Math.cos(a) * 0.5, g.floor[i] + rng.float(0.9, 1.8), z + 0.5 - Math.sin(a) * 0.5], 0.9, 0.06, rng.pick([TS.CEIL, TS.PANEL, TS.METAL]));
      deco.collider(x + 0.15, g.floor[i], z + 0.15, x + 0.85, g.floor[i] + 0.5, z + 0.85, { obstacle: false });
    } else if (ok(ctx, x, z, 1, 1)) P.debris(ctx, x + 0.5, z + 0.5, g.floor[i], rng.float(0.5, 0.8), { obstacle: false });
    n && k++;
  }
  // flickering emergency light
  if (rng.chance(0.6)) {
    const i = g.idx(Math.floor(r.x + r.w / 2), Math.floor(r.z + r.h / 2));
    if (g.type[i] && !g.sky[i]) deco.light(r.x + r.w / 2, g.ceil[i] - 0.6, r.z + r.h / 2, ALARM, 6, { flicker: true });
  }
}

// a raised deck along the frame wall (t in [0, gD)) at height y with in-line
// flights at one or both ends (feet always have an entry cell). Returns the
// deck info or null. No rails (the room's railAll does every edge once).
function gallery(ctx, Fr, gD, y, o = {}) {
  const { room: r } = ctx;
  const n = nSteps(y - r.floor);
  const minDeck = o.minDeck ?? 4;
  const freeCol = (s) => s >= 0 && s < Fr.Wd && canUseL(ctx, Fr, 0, s, gD, 1) && okL(ctx, Fr, 0, s, gD, 1);
  const footOK = (s) => s >= 0 && s < Fr.Wd && okL(ctx, Fr, 0, s, 2, 1);
  let best = null;
  for (let a = 0; a < Fr.Wd; a++) {
    if (!freeCol(a)) continue;
    let b = a;
    while (b < Fr.Wd && freeCol(b)) b++;
    let aa = a, bb = b;
    if (!footOK(aa - 1)) aa++;
    if (!footOK(bb)) bb--;
    if (bb - aa >= n + minDeck && (!best || bb - aa > best[1] - best[0])) best = [aa, bb];
    a = b;
  }
  if (!best) return null;
  const [a, b] = best;
  const two = o.twoFlights !== false && b - a >= 2 * n + minDeck + 2;
  const f1 = [a, a + n], f2 = two ? [b - n, b] : null;
  const d0 = f1[1], d1 = two ? f2[0] : b;
  const cells = setHeightL(ctx, Fr, 0, d0, gD, d1 - d0, y, { floorTex: o.floorTex ?? TS.GRATE, wallTex: o.sideTex ?? TS.METAL });
  flightL(ctx, Fr, 0, f1[0], Math.min(2, gD), n, 'lat', r.floor, y);
  if (f2) flightL(ctx, Fr, 0, f2[0], Math.min(2, gD), n, 'latN', r.floor, y);
  useL(ctx, Fr, 0, Math.max(0, a - 1), gD + 1, Math.min(Fr.Wd, b + 1) - Math.max(0, a - 1));
  return { cells, s0: d0, s1: d1, y, gD, n, a, b, Fr };
}
// steel posts and a fascia beam under the open edge of a raised deck
function deckFace(ctx, G) {
  const { g, deco } = ctx;
  const { Fr, gD, y } = G;
  for (let s = G.s0; s < G.s1; s++) {
    const j = cellL(ctx, Fr, gD, s);
    if (!g.type[j] || (g.flags[j] & (F.STAIR | F.PIT)) || g.floor[j] > y - 1) continue;
    fb(deco, Fr, gD, gD + 0.1, s, s + 1, y - 0.4, y - 0.02, TS.BEAM);
    if ((s - G.s0) % 3 === 0 || s === G.s1 - 1) {
      const sp = (s - G.s0) % 3 === 0 ? s + 0.1 : s + 0.72;
      fb(deco, Fr, gD - 0.22, gD, sp, sp + 0.18, g.floor[j], y - 0.4, TS.BEAM, { faces: FACE.SIDES });
    }
  }
}

// ======================================================================
// the spine corridor
// ======================================================================
// A section of the spine: hull frames every three cells (ribs up the walls,
// braced arches overhead), a pipe bundle along one side of the ceiling and a
// cable tray along the other, a grating walkway down the middle, wall-mounted
// hand rails, light strips and section signs.
SS.ss_spine = (ctx) => {
  const { g, deco, rng, room: r } = ctx;
  const alongX = r.w >= r.h;
  const L = alongX ? r.w : r.h, Wd = alongX ? r.h : r.w;
  const y = r.floor, top = y + r.ceilH;
  const cell = (u, v) => (alongX ? g.idx(r.x + u, r.z + v) : g.idx(r.x + v, r.z + u));
  const B = (u0, u1, v0, v1, y0, y1, tex, o) => (alongX ? deco.box(r.x + u0, y0, r.z + v0, r.x + u1, y1, r.z + v1, tex, o) : deco.box(r.x + v0, y0, r.z + u0, r.x + v1, y1, r.z + u1, tex, o));
  const C = (u0, u1, v0, v1, y0, y1, o) => (alongX ? deco.collider(r.x + u0, y0, r.z + v0, r.x + u1, y1, r.z + v1, o) : deco.collider(r.x + v0, y0, r.z + u0, r.x + v1, y1, r.z + u1, o));
  const flat = (u, v) => { const i = cell(u, v); return g.type[i] && !(g.flags[i] & (F.STAIR | F.PIT | F.DOOR)) && Math.abs(g.floor[i] - y) < 0.01; };
  // is the wall on side sv (0: v = -1, 1: v = Wd) closed at u?
  const wallAt = (u, sv) => {
    const v = sv ? Wd : -1;
    const [x, z] = alongX ? [r.x + u, r.z + v] : [r.x + v, r.z + u];
    return g.in(x, z) && !g.type[g.idx(x, z)];
  };
  const mid = (Wd - 1) >> 1;
  const wreck = isCrashed(ctx);
  // grating walkway over the cable trench down the middle
  for (let u = 0; u < L; u++) for (let v = mid - (Wd > 5 ? 0 : 0); v <= mid + (Wd % 2 ? 0 : 1); v++) {
    const i = cell(u, v);
    if (flat(u, v)) g.floorTex[i] = TS.FLOOR2;
  }
  // frames
  const phase = rng.int(1, 2);
  const frames = [];
  for (let u = phase; u < L - 1; u += 3) {
    const broken = wreck && rng.chance(0.25);
    for (const sv of [0, 1]) {
      if (!wallAt(u, sv) || !wallAt(u + 1, sv) && !wallAt(u - 1, sv) || !flat(u, sv ? Wd - 1 : 0)) continue;
      if (r.reserved.has(cell(u, sv ? Wd - 1 : 0)) && !wallAt(u, sv)) continue;
      const v0 = sv ? Wd - 0.3 : 0, v1 = sv ? Wd : 0.3;
      if (broken && sv) continue;
      B(u + 0.28, u + 0.72, v0, v1, y, top, TS.PILLAR, { faces: FACE.SIDES });
      B(u + 0.22, u + 0.78, sv ? Wd - 0.36 : 0, sv ? Wd : 0.36, y, y + 0.25, TS.TRIM, { faces: FACE.SIDES | FACE.TOP });
      C(u + 0.28, u + 0.72, v0, v1, y, top, { obstacle: false });
      // knee brace up into the arch
      const vb = sv ? Wd - 0.3 : 0.3, vt = sv ? Wd - 1.1 : 1.1;
      const p = (vv, yy) => (alongX ? [r.x + u + 0.5, yy, r.z + vv] : [r.x + vv, yy, r.z + u + 0.5]);
      deco.bar(p(vb, top - 1.25), p(vt, top - 0.38), 0.3, 0.22, TS.BEAM);
    }
    if (broken) {
      // the arch came down: one end still bolted to the ceiling, the other on the deck
      const p = (vv, yy, du = 0.5) => (alongX ? [r.x + u + du, yy, r.z + vv] : [r.x + vv, yy, r.z + u + du]);
      deco.bar(p(0.3, top - 0.3), p(Wd - 0.9, y + 0.12, 1.1), 0.36, 0.3, TS.BEAM);
      C(u + 0.2, u + 1.4, Wd - 1.4, Wd - 0.4, y, y + 0.6, { obstacle: false });
    } else B(u + 0.3, u + 0.7, 0, Wd, top - 0.38, top, TS.BEAM);
    frames.push(u);
  }
  // pipe bundle along side 0 and a cable tray along side 1, overhead
  const yP = top - 0.7;
  for (let k = 0; k < 3; k++) {
    const vv = 0.42 + k * 0.3, yy = yP - (k === 1 ? 0.22 : 0), rr = k === 1 ? 0.1 : 0.14;
    if (alongX) cylH(deco, r.x, r.x + L, yy, r.z + vv, rr, true, TS.PIPE);
    else cylH(deco, r.z, r.z + L, yy, r.x + vv, rr, false, TS.PIPE);
  }
  B(0, L, Wd - 1.15, Wd - 0.35, top - 0.62, top - 0.58, TS.METAL);
  for (let k = 0; k < 3; k++) B(0, L, Wd - 1.05 + k * 0.22, Wd - 0.95 + k * 0.22, top - 0.58, top - 0.5, TS.PIPE);
  for (let u = 1.5; u < L - 0.5; u += 3) B(u, u + 0.06, Wd - 1.2, Wd - 0.3, top - 0.62, top, TS.METAL, { faces: FACE.SIDES });
  // conduits along the bottom of both walls and wall-mounted hand rails
  for (const sv of [0, 1]) {
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        const a = run[0], b = run[run.length - 1] + 1;
        const v0 = sv ? Wd - 0.1 : 0.04, v1 = sv ? Wd - 0.04 : 0.1;
        B(a + 0.05, b - 0.05, v0, v1, y + 0.95, y + 1.01, TS.RAIL);
        for (let u = a + 0.5; u < b; u += 1.5) B(u - 0.03, u + 0.03, sv ? Wd - 0.12 : 0, sv ? Wd : 0.12, y + 0.92, y + 0.98, TS.METAL);
        const cv0 = sv ? Wd - 0.22 : 0.02, cv1 = sv ? Wd - 0.02 : 0.22;
        B(a, b, cv0, cv1, y + 0.3, y + 0.42, TS.PIPE);
      }
      run = [];
    };
    for (let u = 0; u < L; u++) {
      if (wallAt(u, sv) && flat(u, sv ? Wd - 1 : 0) && !frames.includes(u)) run.push(u); else flush();
    }
    flush();
  }
  // light strips down the middle between the frames
  for (let u = phase + 1.5; u < L - 0.5; u += 3) {
    const lit = Math.round(u - phase - 1.5) % 6 === 0;
    B(u - 0.55, u + 0.55, Wd / 2 - 0.16, Wd / 2 + 0.16, top - 0.06, top, TS.LIGHT, { uv: 'fit', emissive: 1, faces: FACE.BOTTOM | FACE.SIDES });
    if (lit) deco.light(alongX ? r.x + u : r.x + Wd / 2, top - 0.5, alongX ? r.z + Wd / 2 : r.z + u, wreck ? AMBER : COOL, 6, { flicker: wreck && rng.chance(0.4) });
  }
  // section signs over both ends of the section
  for (const [u0, u1] of [[0.02, 0.06], [L - 0.06, L - 0.02]]) {
    if (top - y < 4.1) continue;
    B(u0, u1, mid - 0.2, mid + 1.2, top - 0.95, top - 0.6, TS.SCREEN, { uv: 'fit', emissive: 0.8 });
  }
  if (wreck) {
    // leaking coolant puddles and sparking cables
    for (let k = 0; k < Math.floor(L / 8); k++) {
      const u = rng.int(2, L - 3), v = rng.pick([0, Wd - 1]);
      const i = cell(u, v);
      if (!flat(u, v) || r.reserved.has(i)) continue;
      const [x, z] = alongX ? [r.x + u, r.z + v] : [r.x + v, r.z + u];
      if (rng.chance(0.5)) P.sparkCable(ctx, x + 0.5, z + 0.5, top, rng.float(1.2, 2.2));
      else P.debris(ctx, x + 0.5, z + 0.5, y, 0.6, { obstacle: false });
    }
  }
  r.lit = true;
};

// ======================================================================
// the engine room
// ======================================================================
// The reactor core rises out of a coolant well in the middle of the hall; a
// catwalk ring circles it, reached by bridges from two raised platforms with
// stairs down to the deck. Thruster housings come out of the aft wall,
// turbines, tanks and risers stand around the walls.
SS.ss_engine = (ctx) => {
  const { g, deco, rng, room: r, boss } = ctx;
  const y = r.floor, top = y + r.ceilH;
  const S = r.leaf.ship;
  // frame on the aft wall: t runs toward the bow, s across the ship
  const aft = S ? (S.sternWest ? 1 : 0) : (r.w >= r.h ? 3 : 1);
  const Fr = frame(r, aft);
  const up = top - y >= 12 ? 4.2 : 3.6;
  const ok1 = () => buildCore(ctx, Fr, up, boss);
  const s0 = snap(ctx), m0 = deco.mark();
  let done = false;
  try { done = ok1() && roomOK(ctx); } catch (e) { stat('error', 'ss_engine', String(e && e.stack).slice(0, 300)); }
  if (!done) {
    deco.rollback(m0); restore(ctx, s0); ctx.used = new Set();
    stat('fallback', 'ss_engine');
    // fallback: the core standing on the deck behind a railing
    const cx = r.x + r.w / 2, cz = r.z + r.h / 2;
    if (ok(ctx, Math.floor(cx) - 2, Math.floor(cz) - 2, 4, 4, 1)) {
      P.reactorCore(ctx, cx, cz, y, top, 1.2, { ceil: top });
      use(ctx, Math.floor(cx) - 2, Math.floor(cz) - 2, 4, 4);
    }
  }
  engineWalls(ctx, Fr);
  crashed(ctx, 0.6);
};
function buildCore(ctx, Fr, up, boss) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor, top = y + r.ceilH;
  ctx.used = new Set();
  // the core sits in the middle (t across the room's depth, s along the aft wall)
  const tc = Math.floor(Fr.L / 2), sc = Math.floor(Fr.Wd / 2) + rng.int(-1, 1);
  // well: half sizes (t, s); ring at Chebyshev distance 2 around the 3x3 core
  const ht = Math.max(3, Math.min(boss ? 4 : 5, tc - 3)), hs = Math.max(3, Math.min(boss ? 5 : 7, sc - 7));
  if (tc - ht < 3 || Fr.L - (tc + ht + 1) < 3) return no(ctx, 'well depth');
  // well cells (rounded rectangle), avoiding exit approaches with a margin
  const well = [];
  for (let t = tc - ht; t <= tc + ht; t++) for (let s = sc - hs; s <= sc + hs; s++) {
    const dt = Math.abs(t - tc), ds = Math.abs(s - sc);
    if (dt >= ht - 0.5 && ds >= hs - 0.5) continue;           // round the corners
    if (!canUseL(ctx, Fr, t, s, 1, 1, 1)) return no(ctx, 'well reserved');
    well.push(cellL(ctx, Fr, t, s));
  }
  const wellSet = new Set(well);
  pitSet(ctx, well, 'poison', 3.2);
  const yPit = y - 3.2;
  // the ring catwalk (bridge cells at y + up)
  const ring = [];
  for (let t = tc - 2; t <= tc + 2; t++) for (let s = sc - 2; s <= sc + 2; s++) {
    if (Math.max(Math.abs(t - tc), Math.abs(s - sc)) !== 2) continue;
    ring.push(cellL(ctx, Fr, t, s));
  }
  // bridges along s from the ring to both platforms
  const platW = 3, platD = 3;
  const sides = [];
  for (const dir of [-1, 1]) {
    const sEdge = dir < 0 ? sc - hs : sc + hs;          // last well column
    const p0 = dir < 0 ? sEdge - platD : sEdge + 1;     // platform columns [p0, p0 + platD)
    const n = nSteps(up);
    // stairs from the platform going away from the well
    const f0 = dir < 0 ? p0 - n : p0 + platD;
    if (f0 < 1 || f0 + n > Fr.Wd - 1) return no(ctx, 'platform room');
    if (!okL(ctx, Fr, tc - 1, Math.min(p0, f0), platW, platD + n + 1, 1)) return no(ctx, 'platform reserved');
    sides.push({ dir, p0, f0, n });
  }
  for (const i of ring) { const x = i % g.w, z = (i / g.w) | 0; g.open(x, z, y + up, g.ceil[i], { floorTex: TS.GRATE, wallTex: TS.GRATE, light: g.light[i], region: r.id }); g.flags[i] &= ~(F.PIT | F.HAZARD); g.flags[i] |= F.BRIDGE | F.NOSPAWN; g.hazType[i] = 0; }
  const deck = new Set(ring);
  for (const sd of sides) {
    // bridge cells over the well from the ring to the platform
    const sa = sd.dir < 0 ? sd.p0 + platD : sc + 3, sb = sd.dir < 0 ? sc - 3 : sd.p0 - 1;
    for (let s = Math.min(sa, sb); s <= Math.max(sa, sb); s++) {
      const i = cellL(ctx, Fr, tc, s);
      const x = i % g.w, z = (i / g.w) | 0;
      g.open(x, z, y + up, g.ceil[i], { floorTex: TS.GRATE, wallTex: TS.GRATE, light: g.light[i], region: r.id });
      g.flags[i] &= ~(F.PIT | F.HAZARD); g.flags[i] |= F.BRIDGE | F.NOSPAWN; g.hazType[i] = 0;
      deck.add(i);
    }
    // platform (solid deck) and its flight down to the floor, away from the well
    for (const i of setHeightL(ctx, Fr, tc - 1, sd.p0, platW, platD, y + up, { floorTex: TS.GRATE, wallTex: TS.METAL })) deck.add(i);
    flightL(ctx, Fr, tc - 1, sd.f0, platW, sd.n, sd.dir < 0 ? 'latN' : 'lat', y, y + up);
    useL(ctx, Fr, tc - 2, Math.min(sd.p0, sd.f0) - 1, platW + 2, platD + sd.n + 2);
    // console on the platform facing the core
    const ct = tc + 1, cs = sd.dir < 0 ? sd.p0 : sd.p0 + platD - 1;
    const [cx, cz] = Fr.cell(ct, cs);
    deco.console(cx, cz, y + up, Fr.dirOf(sd.dir < 0 ? 'lat' : 'latN'), { width: 0.7 });
    // support legs under the platform edge facing the well
    for (const t of [tc - 1, tc + 1]) {
      const sl = sd.dir < 0 ? sd.p0 + platD - 0.25 : sd.p0 + 0.05;
      fb(deco, Fr, t + 0.35, t + 0.65, sl, sl + 0.2, yPit, y, TS.BEAM, { faces: FACE.SIDES });
    }
  }
  // the core: 3x3 cells in the middle of the ring
  const [kx, kz] = Fr.pt(tc + 0.5, sc + 0.5);
  P.reactorCore(ctx, kx, kz, yPit, top, 1.25, { ceil: top, coils: [0.3, 0.62] });
  // a second, higher service ring around the core (inspection gantry, out of reach)
  const yr = y + up + 4.2;
  if (yr < top - 2.5) {
    for (const [t0, t1, s0, s1] of [[-2.5, 2.5, -2.5, -1.9], [-2.5, 2.5, 1.9, 2.5], [-2.5, -1.9, -1.9, 1.9], [1.9, 2.5, -1.9, 1.9]]) {
      fb(deco, Fr, tc + 0.5 + t0, tc + 0.5 + t1, sc + 0.5 + s0, sc + 0.5 + s1, yr, yr + 0.12, TS.GRATE);
    }
    for (const [ta, sa] of [[-2.45, -2.45], [2.4, -2.45], [-2.45, 2.4], [2.4, 2.4]]) fb(deco, Fr, tc + 0.5 + ta, tc + 0.5 + ta + 0.05, sc + 0.5 + sa, sc + 0.5 + sa + 0.05, yr, top, TS.METAL, { faces: FACE.SIDES });
    for (const [t0, t1, s0, s1] of [[-2.5, 2.5, -2.5, -2.45], [-2.5, 2.5, 2.45, 2.5], [-2.5, -2.45, -2.5, 2.5], [2.45, 2.5, -2.5, 2.5]]) fb(deco, Fr, tc + 0.5 + t0, tc + 0.5 + t1, sc + 0.5 + s0, sc + 0.5 + s1, yr + 0.95, yr + 1.02, TS.RAIL);
  }
  // rails: deck edges over the well, well rim at floor level
  railAll(ctx);
  hazardLines(ctx, well.filter((i) => g.flags[i] & F.PIT));
  for (const i of well) ctx.used.add(i);
  void wellSet; void deck;
  return true;
}
// thrusters on the aft wall, turbines / tanks / risers along the walls
function engineWalls(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor, top = y + r.ceilH;
  // thruster housings: drums out of the aft wall (t = 0) at intervals along s
  const R = Math.min(1.7, (r.ceilH - 3) / 4);
  const n = Math.max(1, Math.min(3, Math.floor(Fr.Wd / 10)));
  const cy = y + R + 1.6;
  for (let k = 0; k < n; k++) {
    const sc = Math.round(((k + 0.5) * Fr.Wd) / n);
    const s0 = sc - Math.ceil(R), w = 2 * Math.ceil(R);
    if (!okL(ctx, Fr, 0, s0, 3, w, 0)) continue;
    const [lx, lz] = Fr.pt(0, sc);
    const line = Fr.away < 2 ? lx : lz, c = Fr.away < 2 ? lz : lx;
    P.thruster(ctx, line, c, cy, R, 2.6, Fr.away);
    useL(ctx, Fr, 0, s0, 3, w);
  }
  // turbines / generators and coolant tanks along the walls
  for (const [x, z, d] of rng.shuffle(wallSpots(ctx))) {
    if (!ok(ctx, x, z, 1, 1, 0) || (ctx.used && ctx.used.has(g.idx(x, z)))) continue;
    if (rng.chance(0.5)) continue;
    const roll = rng.next();
    if (roll < 0.45) machineBlock(ctx, x, z, d, y, rng.pick([1.8, 2.4, 3.0]), 0.8);
    else if (roll < 0.7) P.tankV(ctx, x + 0.5, z + 0.5, y, 0.42, rng.pick([2.2, 2.8]), { gauge: true });
    else if (roll < 0.85) riser(ctx, x + 0.5 + DIR_X[d] * 0.2, z + 0.5 + DIR_Z[d] * 0.2, y, top, 0.24);
    else continue;
    use(ctx, x, z, 1, 1);
  }
  highBay(ctx, 6, COOL);
}

// ======================================================================
// the bridge
// ======================================================================
// Helm stations under the panoramic bow window, side stations with wall
// displays, a holo table, and the raised command deck with the captain's
// chair behind the tactical rail; stairs up both sides of the deck.
SS.ss_bridge = (ctx) => {
  const { room: r } = ctx;
  const S = r.leaf.ship;
  const bow = S ? (S.sternWest ? 0 : 1) : (r.w >= r.h ? 0 : 2);
  tryFrames(ctx, [bow], (Fr) => buildBridge(ctx, Fr), (c) => { TEMPLATES.control(c); });
  crashed(ctx, 0.5);
};
function buildBridge(ctx, Fr) {
  const { g, deco, rng, room: r } = ctx;
  const y = r.floor, top = y + r.ceilH;
  ctx.used = new Set();
  // the sill console bank under the window along the whole bow wall
  for (let s = 1; s < Fr.Wd - 1; s++) {
    if (!okL(ctx, Fr, 0, s, 1, 1)) continue;
    fb(deco, Fr, 0.02, 0.75, s, s + 1, y, y + 0.8, faced(Fr.away, TS.MACHINE, TS.METAL), { uv: 'fit', solid: true });
    fb(deco, Fr, 0, 0.8, s - 0.02, s + 1.02, y + 0.8, y + 0.88, TS.METAL);
    useL(ctx, Fr, 0, s, 1, 1);
  }
  // helm stations: consoles at t = 2 facing the window, chairs behind them
  const helm = [];
  for (let s = 2; s < Fr.Wd - 2; s += 3) {
    if (!okL(ctx, Fr, 2, s, 1, 1, 0) || !okL(ctx, Fr, 3, s, 1, 1, 0)) continue;
    const [x, z] = Fr.cell(2, s);
    deco.console(x, z, y, Fr.toward, { width: 0.95 });
    const [cx, cz] = Fr.pt(3.5, s + 0.5);
    P.chair(ctx, cx, cz, y, Fr.toward);
    useL(ctx, Fr, 2, s, 2, 1);
    helm.push(s);
  }
  if (!helm.length) return no(ctx, 'helm');
  // command deck: raised 1.2, centred, behind the helm row
  const up = 1.2, n = nSteps(up);
  const dw = Math.min(7, Fr.Wd - 6), dd = 3;
  const t0 = 5 + n, s0 = Math.floor((Fr.Wd - dw) / 2);
  let deck = null;
  if (t0 + dd < Fr.L - 1 && dw >= 5 && okL(ctx, Fr, t0 - n, s0 - 1, dd + n, dw + 2, 0)) {
    const cells = setHeightL(ctx, Fr, t0, s0, dd, dw, y + up, { floorTex: TS.FLOOR3, wallTex: TS.METAL });
    // two flights down toward the helm at both ends of the deck front
    flightL(ctx, Fr, t0 - n, s0, n, 2, 'away', y, y + up);
    flightL(ctx, Fr, t0 - n, s0 + dw - 2, n, 2, 'away', y, y + up);
    // tactical rail: a console desk along the deck front between the flights
    for (let s = s0 + 2; s < s0 + dw - 2; s++) {
      fb(deco, Fr, t0 + 0.05, t0 + 0.6, s, s + 1, y + up, y + up + 0.95, faced(Fr.toward, TS.METAL, TS.METAL, TS.MACHINE), { uv: 'fit', solid: true, obstacle: false });
    }
    // captain's chair facing the window, armrest consoles
    const [cx, cz] = Fr.pt(t0 + 1.7, s0 + dw / 2);
    P.chair(ctx, cx, cz, y + up, Fr.toward, { big: true });
    // side consoles on the deck
    for (const s of [s0, s0 + dw - 1]) {
      const [x, z] = Fr.cell(t0 + dd - 1, s);
      deco.console(x, z, y + up, Fr.toward, { width: 0.8 });
    }
    useL(ctx, Fr, t0 - n, s0 - 1, dd + n + 1, dw + 2);
    deck = { cells, t0, s0, dw, dd };
  }
  // holo table between the helm and the deck
  const th = deck ? t0 - n - 1 : 5;
  if (th >= 4 && okL(ctx, Fr, th - 1, Math.floor(Fr.Wd / 2) - 1, 2, 2, 0)) {
    const [hx, hz] = Fr.pt(th, Math.floor(Fr.Wd / 2));
    P.holoTable(ctx, hx, hz, y, 0.8);
    useL(ctx, Fr, th - 1, Math.floor(Fr.Wd / 2) - 1, 2, 2);
  }
  // side stations: consoles facing the side walls, big displays on the walls
  for (const sideS of [0, Fr.Wd - 1]) {
    for (let t = 2; t < Math.min(Fr.L - 2, (deck ? t0 + dd : Fr.L - 2)); t += 2) {
      if (!okL(ctx, Fr, t, sideS, 1, 1, 0)) continue;
      const [x, z] = Fr.cell(t, sideS);
      const towardWall = Fr.dirOf(sideS === 0 ? 'latN' : 'lat');
      deco.console(x, z, y, towardWall, { width: 0.85 });
      useL(ctx, Fr, t, sideS, 1, 1);
    }
    // display panel on that side wall
    const wallS = sideS === 0 ? 0 : Fr.Wd;
    const sgn = sideS === 0 ? 1 : -1;
    if (top - y >= 4) fb(deco, Fr, 1.5, Math.min(Fr.L - 2, 7.5), wallS, wallS + sgn * 0.05, y + 1.7, y + 3.4, TS.SCREEN, { uv: 'fit', emissive: 0.85 });
  }
  // ceiling: beams running toward the window, light strips between
  for (let s = 1.5; s < Fr.Wd - 1; s += 3) fb(deco, Fr, 0, Fr.L, s - 0.2, s + 0.2, top - 0.45, top, TS.BEAM);
  for (let s = 3; s < Fr.Wd - 1; s += 3) lightStrip(ctx, ...(() => { const [ax, az] = Fr.pt(2, s - 0.12), [bx, bz] = Fr.pt(Fr.L - 2, s + 0.12); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; })(), top, COOL, 5);
  if (deck) railAll(ctx);
  r.lit = true;
  void rng;
  return true;
}

// placeholders filled in below
for (const k of ['ss_cargo', 'ss_hangar', 'ss_quarters', 'ss_mess', 'ss_med', 'ss_armory', 'ss_airlock', 'ss_dock', 'ss_maint', 'ss_life', 'ss_lounge', 'ss_storage', 'ss_crash']) {
  SS[k] = (ctx) => TEMPLATES.plain(ctx);
}

export { SS, tryFrames, sidesLong, sidesShort, hullSide, fb, fcol, cellL, wallClosed, railAll, panelLights, highBay, pipeRun, wallScreen, wallMachine, crashed, gallery, deckFace, isCrashed, no };
export { cellsOf, canUseL, useL, okL, ok, use, setHeightL, retexFloor, flightL, snap, restore, roomOK, wallSpots, wallBox, hangLight, paint, hazardLines, pitSet, freeMask, bestRect, markMask, glassLineL, lineOpening, cabinet, machineBlock, counter, monitor, bed, ivStand, vitalsMonitor, trolley, curtain, riser, steelTable, openShelf, nSteps, lightStrip, edgeCells, tank, seatRow, rackRow, cylV, cylH, crane, pallet, drum, forklift, workbench, P, stat };
