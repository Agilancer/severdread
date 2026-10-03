// Moving convoys: semi trucks on a 5-lane highway, space trains, twin
// freighters, subway trains, arctic rail and duelling space ships. Vehicles
// are parked in the grid (their roofs / decks are the walkable cells, drawn
// as thin decks); the road / starfield / snowfield / tunnel walls scroll past
// to sell the motion. Vehicle bodies are built from deco boxes on the texture
// role that fits each part:
//  trains: car bodies in the livery (WALL / WALL2 container skins), GLASS
//   window bands with TRIM mullions, DOOR panels, METAL bogies with wheels
//   (maglev LIGHT strips in space), roof walkways (GRATE) with hand rails,
//   gangways (GRATE decks, railed) between cars, flat cars with CRATE2
//   containers and CRATE stacks, tank cars (METAL + TRIM bands), roof vents
//  trucks: tractor cabs (METAL body, GLASS windshield, GRATE grille, LIGHT
//   headlights, PIPE exhaust stacks), trailers (WALL truck livery), flatbeds
//   (WOOD deck, METAL stakes, cargo), tankers; open roofs: jump between lanes
//  ships: tapered hulls, engines (LIGHT nozzles), bridge towers (WALL2 + GLASS),
//   turrets, railed decks joined by boarding bridges
// Height changes between cars use real stair flights with hand rails; gaps
// between vehicles are jump gaps (never railed); the lead vehicle is the boss
// arena across all lanes.
import { TS, F, newGrid, clamp } from './common.js';
import { Deco, FACE } from './deco.js';
import { railDrops } from './natural.js';
import { acUnit, ventStack, antenna } from './platprops.js';
import { bridgeGirders, paintJump } from './platkit.js';

export function genConvoy(rng, theme, depth) {
  const p = theme.params || {};
  const id = theme.id || '';
  const vehicle = p.vehicle || 'train';
  const tunnel = !!p.tunnel;
  const space = id.startsWith('space');
  const lanes = p.lanes || 1;
  const laneW = vehicle === 'truck' ? 3 : vehicle === 'ship' ? 7 : lanes === 1 ? 5 : 4;
  const laneGap = p.gap ?? 2;
  const VOID_Y = vehicle === 'truck' ? -1.6 : tunnel ? -2.2 : space ? -20 : -1.4;
  const GROUND = VOID_Y + 0.5;
  const arenaLen = vehicle === 'ship' ? 20 : 16;
  const W = Math.round(clamp(104 + depth * 2, 104, 170));
  const M = 3;
  const H = lanes * laneW + (lanes - 1) * laneGap + 2 * M;
  const g = newGrid(W, H, 8);
  g.floorTex.fill(TS.METAL);
  const deco = new Deco(g, { ...theme, railStyle: 'metal' }, rng);
  const light = theme.light ?? 0.85;
  const CEIL = 6.5;
  const sky = !tunnel;
  const N = W * H;
  const idx = (x, z) => z * W + x;
  const owner = new Int16Array(N).fill(-1);     // vehicle id, -2 deck, -4 arena
  const lock = new Uint8Array(N);
  const allow = new Set();
  const decks = [];
  const flights = [];
  const jumps = [];
  const bridges = [];
  const openCell = (x, z, y, o) => { const i = idx(x, z); g.flags[i] = 0; g.open(x, z, y, CEIL, { sky, light, ceilTex: TS.CEIL, ...o }); return i; };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) openCell(x, z, VOID_Y, { flags: F.VOID });
  if (tunnel) for (let x = 0; x < W; x++) { g.solid(x, 0, 9, TS.ACCENT); g.solid(x, H - 1, 9, TS.ACCENT); }

  // ---------------------------------------------------------- vehicles
  const vehicles = [];
  const TOPS = { coach: 2.4, double: 3.0, box: 2.6, flat: 1.2, tank: 2.6, trailer: 2.6, flatbed: 1.1, tanker: 2.4, cab: 2.0, ship: 0 };
  const roofTex = (v, z) => {
    if (v.kind === 'flat' || v.kind === 'flatbed') return TS.WOOD;
    if (v.kind === 'cab') return TS.METAL;
    if (v.kind === 'tank' || v.kind === 'tanker') return TS.GRATE;
    if (v.kind === 'ship') return (z === v.z0 + 3) ? TS.FLOOR2 : TS.FLOOR;
    const mid = v.z0 + (laneW >> 1);
    if (v.kind === 'coach' || v.kind === 'double' || v.kind === 'box') return (z === mid || (laneW % 2 === 0 && z === mid - 1)) ? TS.GRATE : TS.FLOOR;
    return TS.FLOOR;
  };
  const edgeTex = (v) => (v.kind === 'cab' || v.kind === 'flat' || v.kind === 'flatbed' || v.kind === 'tank' || v.kind === 'tanker' ? TS.METAL : v.skin ?? TS.WALL);
  function addVehicle(x0, len, z0, w, top, kind, lane) {
    const v = { id: vehicles.length, x0, x1: x0 + len, z0, z1: z0 + w, top, kind, lane, cells: [] };
    v.skin = kind === 'box' && rng.chance(0.5) ? TS.WALL2 : TS.WALL;
    for (let x = x0; x < x0 + len; x++) for (let z = z0; z < z0 + w; z++) {
      const i = openCell(x, z, top, { floorTex: roofTex(v, z), wallTex: edgeTex(v) });
      owner[i] = v.id;
      v.cells.push(i);
    }
    vehicles.push(v);
    return v;
  }
  function deckCell(x, z, y, alongZ) {
    const i = openCell(x, z, y, { floorTex: TS.GRATE, wallTex: TS.METAL, flags: F.BRIDGE | (alongZ ? F.UVROT : 0) });
    owner[i] = -2; lock[i] = 1; decks.push(i);
    return i;
  }

  const ax0 = W - arenaLen - 1;
  const laneZ = (l) => M + l * (laneW + laneGap);
  const laneVehicles = [];
  const trainKinds = id === 'subway_trains' ? ['coach'] : id === 'space_freighter' ? ['box', 'box', 'flat', 'flat', 'tank'] : id === 'arctic_rail' ? ['coach', 'box', 'flat', 'tank'] : ['coach', 'coach', 'double', 'flat'];
  for (let l = 0; l < lanes; l++) {
    const z0 = laneZ(l);
    let x = 2 + (l % 2 ? rng.int(2, 6) : 0);
    let prev = null;
    const list = [];
    for (let guard = 0; guard < 60; guard++) {
      if (vehicle === 'truck') {
        const kind = rng.pick(['trailer', 'trailer', 'flatbed', 'tanker']);
        const len = rng.int(5, 8);
        if (x + len + 2 > ax0 - 2) break;
        const tr = addVehicle(x, len, z0, laneW, TOPS[kind], kind, l);
        const cb = addVehicle(x + len, 2, z0, laneW, TOPS.cab, 'cab', l);
        tr.cab = cb; cb.trailer = tr;
        list.push(tr, cb);
        if (prev) markJump(prev, tr);
        prev = cb;
        x += len + 2 + rng.int(1, 2);
        continue;
      }
      const ship = vehicle === 'ship';
      let kind = ship ? 'ship' : rng.pick(trainKinds);
      const len = ship ? rng.int(13, 19) : kind === 'tank' ? rng.int(7, 9) : rng.int(9, 12);
      let top = ship ? rng.pick([0, 0.5]) : TOPS[kind];
      // connection to the previous car: jump gap or gangway (+ stairs)
      let gap = rng.pick([1, 2, 2]);
      let mode = 'jump';
      if (prev) {
        const dh = Math.abs(top - prev.top);
        const wantGang = id === 'subway_trains' ? rng.chance(0.75) : rng.chance(0.5);
        if (dh > 0.6 || wantGang) mode = 'gang';
        if (mode === 'gang') {
          const n = Math.abs(top - prev.top) < 0.56 ? 0 : Math.ceil(Math.abs(top - prev.top) / 0.6 - 1e-6);
          const lowLen = top < prev.top ? len : prev.x1 - prev.x0;
          if (n > 0 && (lowLen < n + 3 || (top < prev.top ? false : prev.kind === 'tank'))) { kind = prev.kind === 'flat' ? 'flat' : 'coach'; top = prev.top; }
        }
      }
      if (x + gap + len > ax0 - 2 && prev) break;
      if (prev) x += gap; else gap = 0;
      if (x + len > ax0 - 2) break;
      const v = addVehicle(x, len, z0, laneW, top, kind, l);
      list.push(v);
      if (prev) { if (mode === 'gang') gangway(prev, v); else markJump(prev, v); }
      prev = v;
      x += len;
    }
    laneVehicles.push(list);
  }

  // jump gap along a lane: the facing end cells of both vehicles stay unrailed
  function markJump(a, b) {
    const cellsA = [], cellsB = [];
    for (let z = a.z0; z < a.z1; z++) { cellsA.push(idx(a.x1 - 1, z)); cellsB.push(idx(b.x0, z)); }
    for (const i of [...cellsA, ...cellsB]) { allow.add(i); lock[i] = 1; }
    jumps.push({ ax: true, tA: a.x1 - 1, tB: b.x0, allowCells: [...cellsA, ...cellsB] });
  }
  // gangway between consecutive cars (2 wide), at the higher roof; a railed
  // stair flight on the lower car climbs to it
  function gangway(a, b) {
    const gz = a.z0 + Math.floor((laneW - 2) / 2) + (laneW > 4 ? rng.int(0, 1) : 0);
    const hi = Math.max(a.top, b.top);
    const cells = [];
    for (let x = a.x1; x < b.x0; x++) for (let z = gz; z < gz + 2; z++) cells.push(deckCell(x, z, hi, false));
    const dh = Math.abs(a.top - b.top);
    const n = dh < 0.56 ? 0 : Math.ceil(dh / 0.6 - 1e-6);
    if (n > 0) {
      let st;
      if (a.top < b.top) st = deco.stairs(a.x1 - n, gz, 0, 2, a.top, hi, { floorTex: TS.STAIR, sideTex: TS.METAL, light });
      else st = deco.stairs(b.x0 + n - 1, gz, 1, 2, b.top, hi, { floorTex: TS.STAIR, sideTex: TS.METAL, light });
      for (const i of st) lock[i] = 1;
      // landing at the foot of the flight
      const lx = a.top < b.top ? a.x1 - n - 1 : b.x0 + n;
      for (let z = gz; z < gz + 2; z++) lock[idx(lx, z)] = 1;
      flights.push(st);
    }
    for (let z = gz; z < gz + 2; z++) { lock[idx(a.x1 - 1, z)] = 1; lock[idx(b.x0, z)] = 1; }
    bridges.push({ ax: true, b: gz, bw: 2, cells, y: hi, eA: a.x1 - 1, eB: b.x0 });
  }

  // ---------------------------------------------------------- cross-lane links
  for (let l = 0; l + 1 < lanes; l++) {
    let made = 0;
    const A = laneVehicles[l], B = laneVehicles[l + 1];
    const tryLink = (x, maxDh, force) => {
      const va = A.find((v) => x >= v.x0 + 1 && x + 1 <= v.x1 - 2 && v.kind !== 'cab');
      const vb = B.find((v) => x >= v.x0 + 1 && x + 1 <= v.x1 - 2 && v.kind !== 'cab');
      if (!va || !vb || Math.abs(va.top - vb.top) > maxDh) return false;
      for (const xx of [x, x + 1]) for (const zz of [va.z1 - 1, vb.z0]) if (lock[idx(xx, zz)]) return false;
      if (vehicle === 'truck' && !force) {
        // trucks: a deliberate jump spot (no deck): lanes are 1 apart
        return false;
      }
      const y = Math.max(va.top, vb.top);
      const cells = [];
      for (let xx = x; xx < x + 2; xx++) for (let z = va.z1; z < vb.z0; z++) cells.push(deckCell(xx, z, y, true));
      for (const xx of [x, x + 1]) { lock[idx(xx, va.z1 - 1)] = 1; lock[idx(xx, vb.z0)] = 1; }
      bridges.push({ ax: false, b: x, bw: 2, cells, y, eA: va.z1 - 1, eB: vb.z0 });
      return true;
    };
    if (vehicle !== 'truck') {
      for (let x = 5 + rng.int(0, 4); x < ax0 - 4; x += rng.int(9, 15)) {
        for (let t = 0; t < 5; t++) if (tryLink(x + t, 0.6, false)) { made++; break; }
      }
      if (!made) for (let x = 4; x < ax0 - 4 && !made; x++) if (tryLink(x, 1.2, true)) made++;
      // a couple of deliberate jump spots between lanes (2-cell gap)
      if (laneGap <= 2) {
        for (let k = 0; k < 2; k++) {
          const x = rng.int(8, ax0 - 10);
          const va = A.find((v) => x >= v.x0 + 1 && x + 2 <= v.x1 - 2);
          const vb = B.find((v) => x >= v.x0 + 1 && x + 2 <= v.x1 - 2);
          if (!va || !vb || Math.abs(va.top - vb.top) > 0.6) continue;
          const cs = [];
          for (let xx = x; xx < x + 3; xx++) cs.push(idx(xx, va.z1 - 1), idx(xx, vb.z0));
          if (cs.some((i) => lock[i])) continue;
          for (const i of cs) { allow.add(i); lock[i] = 1; }
          jumps.push({ ax: false, tA: va.z1 - 1, tB: vb.z0, allowCells: cs });
        }
      }
    }
  }

  // ---------------------------------------------------------- boss arena (lead vehicle)
  // approach: the lane whose last vehicle ends nearest the arena
  let appr = 0, best = -1;
  laneVehicles.forEach((list, l) => { const v = list[list.length - 1]; if (v && v.x1 > best) { best = v.x1; appr = l; } });
  const lastA = laneVehicles[appr][laneVehicles[appr].length - 1];
  const arenaY = lastA.top;
  const za0 = tunnel ? 1 : M - 1, za1 = tunnel ? H - 1 : H - M + 1;
  const arena = [];
  for (let x = ax0; x < W - 1; x++) for (let z = za0; z < za1; z++) {
    const i = openCell(x, z, arenaY, { floorTex: (x > ax0 + 2 && x < W - 4 && z > za0 + 1 && z < za1 - 2) ? TS.FLOOR3 : TS.FLOOR2, wallTex: TS.WALL2 });
    g.flags[i] |= F.ARENA;
    owner[i] = -4;
    arena.push(i);
  }
  {
    // gangway into the arena from the approach lane
    const gz = lastA.z0 + Math.floor((laneW - 2) / 2);
    const cells = [];
    for (let x = lastA.x1; x < ax0; x++) for (let z = gz; z < gz + 2; z++) cells.push(deckCell(x, z, arenaY, false));
    for (let z = gz; z < gz + 2; z++) { lock[idx(lastA.x1 - 1, z)] = 1; lock[idx(ax0, z)] = 1; }
    if (cells.length) bridges.push({ ax: true, b: gz, bw: 2, cells, y: arenaY, eA: lastA.x1 - 1, eB: ax0 });
    // the other lanes may leap onto the arena if close enough
    laneVehicles.forEach((list, l) => {
      if (l === appr) return;
      const v = list[list.length - 1];
      if (!v || ax0 - v.x1 > 2 || Math.abs(v.top - arenaY) > 0.6) return;
      for (let z = v.z0; z < v.z1; z++) { allow.add(idx(v.x1 - 1, z)); allow.add(idx(ax0, z)); }
    });
    // the arena's rear lip faces the convoy: no rail there except beside the gangway
  }

  // ---------------------------------------------------------- thin decks
  for (let i = 0; i < N; i++) {
    if (g.type[i] !== 1 || (g.flags[i] & (F.VOID | F.STAIR))) continue;
    const x = i % W, z = (i / W) | 0;
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (!g.in(nx, nz)) continue;
      if (g.flags[idx(nx, nz)] & F.VOID) { g.flags[i] |= F.BRIDGE; break; }
    }
  }

  // ---------------------------------------------------------- rails
  const rearLip = new Set();
  for (let z = za0; z < za1; z++) rearLip.add(idx(ax0, z));
  railDrops(g, deco, arena, { allow: new Set([...allow, ...rearLip]), inner: false, style: 'metal', tex: TS.RAIL });
  railDrops(g, deco, decks, { allow, inner: true, style: 'metal', tex: TS.RAIL, drop: 0.9 });
  if (vehicle !== 'truck') {
    const vc = [];
    for (const v of vehicles) vc.push(...v.cells);
    for (const f of flights) vc.push(...f);
    railDrops(g, deco, vc, { allow, inner: true, style: 'metal', tex: TS.RAIL });
  }

  // ---------------------------------------------------------- bodies + details
  for (const br of bridges) if (br.cells.length) bridgeGirders({ deco, g }, br, { tex: TS.METAL, height: 0.35 });
  for (const jp of jumps) paintJump({ deco, g, W }, { ...jp, ax: jp.ax }, TS.PAINT);
  const free = (i) => owner[i] >= 0 && !lock[i] && g.type[i] === 1 && !(g.flags[i] & (F.STAIR | F.OBSTACLE | F.BRIDGE)) && !g.edge[i];
  const freeRect = (x0, z0, w, h) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) if (!g.in(x, z) || !free(idx(x, z))) return false; return true; };
  const occupy = (x0, z0, w, h) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) lock[idx(x, z)] = 3; };

  for (const v of vehicles) {
    if (v.kind === 'ship') shipBody(v);
    else if (vehicle === 'truck') truckBody(v);
    else trainBody(v);
  }
  arenaBody();

  // body bottom: on wheels above the ground, or floating in space
  function baseOf(v) { return space ? v.top - (v.kind === 'flat' ? 1.4 : 2.5) : GROUND + 0.55; }

  function trainBody(v) {
    const top = v.top, y1 = top - 0.36, yb = baseOf(v), hgt = y1 - yb;
    const x0 = v.x0 + 0.03, x1 = v.x1 - 0.03, z0 = v.z0 + 0.03, z1 = v.z1 - 0.03;
    const skin = v.kind === 'tank' || v.kind === 'flat' ? TS.METAL : v.skin;
    if (v.kind === 'tank') {
      // tank car: frame + a fat cylinder (two boxes) under the walkway
      deco.box(x0, yb, z0 + 0.2, x1, yb + 0.5, z1 - 0.2, TS.METAL, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 + 0.3, yb + 0.5, z0 + 0.1, x1 - 0.3, y1, z1 - 0.1, TS.METAL, { faces: FACE.SIDES | FACE.BOTTOM, s: 1 });
      deco.box(x0 + 0.3, y1 - 0.6, z0, x1 - 0.3, y1, z1, TS.METAL, { faces: FACE.SIDES });
      for (let k = 1; k <= 3; k++) { const bx = x0 + 0.3 + ((x1 - x0 - 0.6) * k) / 4; deco.box(bx - 0.08, yb + 0.5, z0 + 0.05, bx + 0.08, y1, z1 - 0.05, TS.TRIM, { faces: FACE.SIDES }); }
      deco.box(x0 + 0.5, yb + 0.2, z1 - 0.12, x0 + 0.9, y1, z1 + 0.04, TS.RAIL, { faces: FACE.SIDES });
    } else {
      deco.box(x0, yb, z0, x1, y1, z1, { side: skin, bottom: TS.METAL, top: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 - 0.02, y1 - 0.14, z0 - 0.04, x1 + 0.02, y1, z1 + 0.04, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
    }
    if (v.kind === 'coach' || v.kind === 'double') {
      const rows = v.kind === 'double' ? [[yb + hgt * 0.22, yb + hgt * 0.42], [yb + hgt * 0.58, yb + hgt * 0.8]] : [[yb + hgt * 0.42, yb + hgt * 0.75]];
      for (const [wy0, wy1] of rows) for (const zf of [z0 - 0.025, z1]) {
        deco.box(x0 + 0.5, wy0, zf, x1 - 0.5, wy1, zf + 0.025, TS.GLASS, { emissive: tunnel ? 0.5 : 0.3, uv: 'fit' });
        for (let mx = x0 + 0.5; mx <= x1 - 0.45; mx += 1.4) deco.box(mx - 0.05, wy0, zf - 0.02, mx + 0.05, wy1, zf + 0.045, TS.TRIM, { faces: FACE.SIDES });
      }
      // doors
      for (const dx of [x0 + 1.4, x1 - 2.3]) for (const zf of [z0 - 0.03, z1]) deco.box(dx, yb + 0.1, zf, dx + 0.9, yb + Math.min(2.2, hgt - 0.25), zf + 0.03, TS.DOOR, { uv: 'fit' });
      if (tunnel || space) deco.light((x0 + x1) / 2, top - 1, (z0 + z1) / 2, tunnel ? [1, 0.95, 0.8] : [0.7, 0.85, 1], 6);
    } else if (v.kind === 'box') {
      for (const zf of [z0 - 0.03, z1]) {
        const mx = (x0 + x1) / 2;
        deco.box(mx - 1, yb + 0.15, zf, mx + 1, y1 - 0.25, zf + 0.03, TS.DOOR, { uv: 'fit' });
        for (let rx = x0 + 0.6; rx < x1 - 0.4; rx += 1.5) if (Math.abs(rx - mx) > 1.2) deco.box(rx - 0.05, yb, zf - 0.02, rx + 0.05, y1, zf + 0.05, TS.TRIM, { faces: FACE.SIDES });
      }
    }
    // running gear
    if (space) {
      deco.box(x0 + 0.6, yb - 0.25, z0 + 0.6, x1 - 0.6, yb, z1 - 0.6, TS.LIGHT, { emissive: 1, faces: FACE.SIDES | FACE.BOTTOM });
      deco.light((x0 + x1) / 2, yb - 0.6, (z0 + z1) / 2, [0.4, 0.75, 1], 5);
    } else {
      for (const bx of [x0 + 1.0, x1 - 3.0]) {
        deco.box(bx, GROUND + 0.18, z0 + 0.35, bx + 2, yb, z1 - 0.35, TS.METAL, { lightMul: 0.6 });
        for (const wx of [bx + 0.2, bx + 1.25]) for (const zf of [z0 + 0.15, z1 - 0.35]) deco.box(wx, GROUND, zf, wx + 0.55, GROUND + 0.55, zf + 0.2, TS.METAL, { lightMul: 0.35 });
      }
    }
    // cargo on flat cars: containers on one side, crates, a free walkway
    if (v.kind === 'flat') {
      const side = rng.chance(0.5) ? v.z0 : v.z1 - 2;
      for (let x = v.x0 + 1; x + 3 <= v.x1 - 1; x += 4) {
        if (!freeRect(x, side, 3, 2)) continue;
        if (rng.chance(0.75)) {
          deco.container(x + 0.05, side + 0.35, top, true, { tex: rng.chance(0.5) ? TS.CRATE2 : TS.WALL2 });
          if (rng.chance(0.35)) deco.container(x + 0.05, side + 0.35, top + 1.3, true, { tex: TS.CRATE2 });
        } else deco.crateStack(x + 1, side + 1, top, { tex: TS.CRATE });
        occupy(x, side, 3, 2);
      }
      for (let x = v.x0; x < v.x1; x += 2) for (const zf of [v.z0 + 0.05, v.z1 - 0.15]) deco.box(x + 0.4, top, zf, x + 0.5, top + 0.5, zf + 0.1, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
    } else if (v.kind !== 'tank') {
      // roof clutter: AC unit / vents on the side strips of the roof walkway
      const zs = [v.z0, v.z1 - 1];
      for (let k = 0; k < 2; k++) {
        const x = rng.int(v.x0 + 2, v.x1 - 4), z = rng.pick(zs);
        if (!freeRect(x, z, 2, 1)) continue;
        if (rng.chance(0.6)) acUnit(deco, x + 1, z + 0.5, top, true); else ventStack(deco, x + 0.5, z + 0.5, top, 0.6);
        occupy(x, z, 2, 1);
      }
      if (id === 'subway_trains' && rng.chance(0.6)) {
        // pantograph
        const px = v.x0 + 2.5, pz = (v.z0 + v.z1) / 2;
        deco.bar([px - 0.6, top, pz - 0.6], [px + 0.3, top + 1.6, pz], 0.06, 0.06, TS.METAL);
        deco.bar([px - 0.6, top, pz + 0.6], [px + 0.3, top + 1.6, pz], 0.06, 0.06, TS.METAL);
        deco.box(px + 0.1, top + 1.6, pz - 0.7, px + 0.5, top + 1.68, pz + 0.7, TS.METAL);
      }
    } else {
      // tank car dome
      const mx = Math.floor((v.x0 + v.x1) / 2), mz = v.z0 + (laneW >> 1) - 1;
      if (freeRect(mx, mz, 1, 2)) { deco.box(mx + 0.1, top, mz + 0.4, mx + 0.9, top + 0.5, mz + 1.6, TS.METAL, { solid: true }); occupy(mx, mz, 1, 2); }
    }
  }

  function truckBody(v) {
    const top = v.top, y1 = top - 0.36, yb = baseOf(v);
    const x0 = v.x0 + 0.03, x1 = v.x1 - 0.03, z0 = v.z0 + 0.06, z1 = v.z1 - 0.06;
    const wheel = (wx, zSide) => deco.box(wx, GROUND, zSide, wx + 0.8, GROUND + 0.85, zSide + 0.32, TS.METAL, { lightMul: 0.3 });
    if (v.kind === 'cab') {
      deco.box(x0, yb, z0 + 0.1, x1, y1, z1 - 0.1, { side: TS.METAL, top: TS.METAL, bottom: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      // windshield + side windows, grille, bumper, headlights
      deco.box(x1, y1 - 1.0, z0 + 0.2, x1 + 0.03, y1 - 0.15, z1 - 0.2, TS.GLASS, { emissive: 0.2, uv: 'fit' });
      for (const zf of [z0 + 0.07, z1 - 0.1]) deco.box(x0 + 1.0, y1 - 0.95, zf, x1 - 0.15, y1 - 0.2, zf + 0.03, TS.GLASS, { emissive: 0.2, uv: 'fit' });
      for (const zf of [z0 + 0.07, z1 - 0.1]) deco.box(x0 + 0.95, yb + 0.25, zf, x1 - 0.1, y1 - 1.0, zf + 0.03, TS.DOOR, { uv: 'fit' });
      deco.box(x1, yb + 0.25, z0 + 0.5, x1 + 0.05, y1 - 1.05, z1 - 0.5, TS.GRATE, { uv: 'fit' });
      deco.box(x1, yb - 0.05, z0 + 0.1, x1 + 0.2, yb + 0.25, z1 - 0.1, TS.TRIM);
      for (const zf of [z0 + 0.2, z1 - 0.5]) deco.box(x1, yb + 0.35, zf, x1 + 0.06, yb + 0.6, zf + 0.3, TS.LIGHT, { emissive: 1, uv: 'fit' });
      deco.light(x1 + 1.5, yb + 0.6, (z0 + z1) / 2, [1, 0.95, 0.8], 7);
      // exhaust stacks behind the cab, fuel tanks
      for (const zf of [z0 + 0.05, z1 - 0.27]) {
        deco.box(x0 + 0.05, yb + 0.5, zf, x0 + 0.27, top + 1.1, zf + 0.22, TS.PIPE, { faces: FACE.SIDES | FACE.TOP });
        deco.box(x0 + 0.5, yb + 0.05, zf - 0.08, x0 + 1.3, yb + 0.55, zf + 0.3, TS.METAL);
      }
      wheel(x1 - 1.1, z0 - 0.06); wheel(x1 - 1.1, z1 - 0.26);
      deco.box(x0 - 0.05, yb, z0 + 0.4, x1 - 0.3, yb + 0.25, z1 - 0.4, TS.METAL, { lightMul: 0.5 });
      return;
    }
    if (v.kind === 'trailer') {
      deco.box(x0, yb, z0, x1, y1, z1, { side: TS.WALL, bottom: TS.METAL, top: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 - 0.04, yb, z0 + 0.1, x0, y1 - 0.1, z1 - 0.1, TS.METAL, { uv: 'fit' });     // rear doors
      deco.box(x0 - 0.06, yb + 0.2, (z0 + z1) / 2 - 0.03, x0 - 0.02, y1 - 0.2, (z0 + z1) / 2 + 0.03, TS.TRIM);
      for (let mx = x0 + 0.5; mx < x1; mx += 1.5) for (const zf of [z0 - 0.03, z1]) deco.box(mx, yb + 0.05, zf, mx + 0.12, yb + 0.15, zf + 0.03, TS.LIGHT, { emissive: 1 });
    } else if (v.kind === 'tanker') {
      deco.box(x0, yb, z0 + 0.25, x1, yb + 0.35, z1 - 0.25, TS.METAL, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 + 0.2, yb + 0.35, z0 + 0.05, x1 - 0.2, y1, z1 - 0.05, TS.METAL, { faces: FACE.SIDES | FACE.BOTTOM, s: 1 });
      for (let k = 1; k <= 3; k++) { const bx = x0 + ((x1 - x0) * k) / 4; deco.box(bx - 0.07, yb + 0.35, z0, bx + 0.07, y1, z1, TS.TRIM, { faces: FACE.SIDES }); }
      deco.box(x0 - 0.05, yb + 0.1, (z0 + z1) / 2 - 0.2, x0 + 0.05, y1, (z0 + z1) / 2 + 0.2, TS.RAIL, { faces: FACE.SIDES });
    } else {
      // flatbed: chassis, stakes, cargo
      deco.box(x0, yb, z0, x1, y1, z1, { side: TS.METAL, bottom: TS.METAL, top: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      for (let x = v.x0; x < v.x1; x += 2) for (const zf of [v.z0 + 0.05, v.z1 - 0.15]) deco.box(x + 0.45, top, zf, x + 0.55, top + 0.6, zf + 0.1, TS.METAL, { faces: FACE.SIDES | FACE.TOP });
      const side = rng.chance(0.5) ? v.z0 : v.z1 - 1;
      for (let x = v.x0 + 1; x + 2 <= v.x1 - 1; x += 3) {
        if (!freeRect(x, side, 2, 1)) continue;
        if (rng.chance(0.5)) deco.crateStack(x + 0.6, side + 0.5, top, { tex: TS.CRATE, count: rng.int(2, 3) });
        else deco.box(x + 0.05, top, side + 0.08, x + 1.95, top + rng.pick([0.9, 1.25]), side + 0.92, TS.CRATE2, { solid: true, uv: 'fit' });
        occupy(x, side, 2, 1);
      }
    }
    // tandem axles at the rear, landing legs at the front
    for (const wx of [x0 + 0.4, x0 + 1.4]) { wheel(wx, z0 - 0.06); wheel(wx, z1 - 0.26); }
    deco.box(x0 + 0.3, GROUND + 0.35, z0 + 0.3, x0 + 2.4, yb, z1 - 0.3, TS.METAL, { lightMul: 0.5 });
    for (const zf of [z0 + 0.3, z1 - 0.45]) deco.box(x1 - 1.6, GROUND + 0.25, zf, x1 - 1.45, yb, zf + 0.15, TS.METAL, { faces: FACE.SIDES });
    deco.box(x0 - 0.1, GROUND + 0.4, z0 + 0.2, x0 + 0.05, GROUND + 0.6, z1 - 0.2, TS.ACCENT);
  }

  function shipBody(v) {
    const top = v.top, x0 = v.x0, x1 = v.x1, z0 = v.z0, z1 = v.z1;
    // tapered hull with a pointed bow (front = +x)
    const layers = [[0.04, 0.04, 0.04, top - 1.6, top - 0.36], [0.9, 2.2, 1, top - 3.0, top - 1.6], [2.0, 4.2, 2.1, top - 4.0, top - 3.0]];
    for (const [ins, bow, sideIns, ya, yb] of layers) deco.box(x0 + ins, ya, z0 + sideIns, x1 - bow, yb, z1 - sideIns, { side: TS.WALL, bottom: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
    deco.box(x1 - 2.2, top - 1.6, z0 + 1.5, x1 - 0.8, top - 0.36, z1 - 1.5, TS.WALL, { faces: FACE.SIDES | FACE.BOTTOM });
    deco.box(x0 + 0.1, top - 0.5, z0 - 0.05, x1 - 0.1, top - 0.36, z1 + 0.05, TS.TRIM, { faces: FACE.SIDES | FACE.BOTTOM });
    // engines at the stern
    for (const ez of [z0 + 1.2, z1 - 2.6]) {
      deco.box(x0 - 1.4, top - 2.4, ez, x0 + 0.5, top - 0.9, ez + 1.4, { side: TS.METAL, nx: TS.LIGHT }, { emissive: 0 });
      deco.box(x0 - 1.45, top - 2.2, ez + 0.2, x0 - 1.4, top - 1.1, ez + 1.2, TS.LIGHT, { emissive: 1, uv: 'fit' });
      deco.light(x0 - 2.2, top - 1.6, ez + 0.7, [0.5, 0.8, 1], 6, { pulse: true });
    }
    // bridge tower and turrets on the centre line (a walkway stays free on both sides)
    const mz = z0 + 2;
    const tx = x0 + 2;
    if (freeRect(tx, mz, 3, 3)) {
      deco.box(tx + 0.1, top, mz + 0.1, tx + 2.9, top + 2.4, mz + 2.9, { side: TS.WALL2, top: TS.METAL }, { solid: true });
      deco.box(tx + 0.05, top + 1.5, mz + 0.05, tx + 2.95, top + 2.1, mz + 2.95, TS.GLASS, { emissive: 0.35, faces: FACE.SIDES, uv: 'fit' });
      antenna(deco, tx + 1.5, mz + 1.5, top + 2.4, 3, [1, 0.3, 0.2]);
      occupy(tx, mz, 3, 3);
    }
    for (let x = tx + 5; x + 2 <= x1 - 3; x += rng.int(4, 6)) {
      if (!freeRect(x, mz + 1, 1, 1)) continue;
      deco.box(x + 0.1, top, mz + 1.1, x + 0.9, top + 0.6, mz + 1.9, TS.METAL, { solid: true });
      deco.box(x + 0.2, top + 0.6, mz + 1.2, x + 0.8, top + 1.0, mz + 1.8, TS.MACHINE, { uv: 'fit' });
      deco.bar([x + 0.5, top + 0.85, mz + 1.35], [x + 1.9, top + 1.05, mz + 1.35], 0.1, 0.1, TS.METAL);
      deco.bar([x + 0.5, top + 0.85, mz + 1.65], [x + 1.9, top + 1.05, mz + 1.65], 0.1, 0.1, TS.METAL);
      occupy(x, mz + 1, 1, 1);
    }
    for (let k = 0; k < 2; k++) {
      const x = rng.int(x0 + 6, x1 - 4), z = rng.pick([z0 + 1, z1 - 2]);
      if (freeRect(x, z, 1, 1)) { deco.crateStack(x + 0.5, z + 0.5, top, { tex: TS.CRATE }); occupy(x, z, 1, 1); }
    }
    deco.light((x0 + x1) / 2, top + 2, (z0 + z1) / 2, [0.7, 0.8, 1], 7);
  }

  function arenaBody() {
    const x0 = ax0 + 0.03, x1 = W - 1 - 0.03, z0 = za0 + 0.03, z1 = za1 - 0.03;
    const y1 = arenaY - 0.36;
    const yb = space ? arenaY - 3.5 : GROUND + 0.6;
    if (vehicle === 'ship') {
      deco.box(x0, arenaY - 2, z0, x1, y1, z1, { side: TS.WALL2, bottom: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 + 1, arenaY - 4, z0 + 2, x1 - 3, arenaY - 2, z1 - 2, { side: TS.WALL, bottom: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      for (const ez of [z0 + 2, z1 - 4]) {
        deco.box(x0 - 1.6, arenaY - 3, ez, x0 + 0.5, arenaY - 1, ez + 2, { side: TS.METAL, nx: TS.LIGHT });
        deco.light(x0 - 2.5, arenaY - 2, ez + 1, [0.6, 0.8, 1], 8, { pulse: true });
      }
    } else {
      deco.box(x0, yb, z0, x1, y1, z1, { side: TS.WALL2, bottom: TS.METAL }, { faces: FACE.SIDES | FACE.BOTTOM });
      deco.box(x0 - 0.02, y1 - 0.2, z0 - 0.05, x1 + 0.02, y1, z1 + 0.05, TS.ACCENT, { faces: FACE.SIDES | FACE.BOTTOM });
      // armoured cab front: windshield + headlights
      deco.box(x1, y1 - 1.3, z0 + 1, x1 + 0.04, y1 - 0.3, z1 - 1, TS.GLASS, { emissive: 0.3, uv: 'fit' });
      for (const zf of [z0 + 0.6, z1 - 1.2]) deco.box(x1, yb + 0.4, zf, x1 + 0.08, yb + 0.9, zf + 0.6, TS.LIGHT, { emissive: 1, uv: 'fit' });
      if (!space) for (let wx = x0 + 1; wx < x1 - 1; wx += 3) for (const zf of [z0 - 0.1, z1 - 0.3]) deco.box(wx, GROUND, zf, wx + 1.4, GROUND + (vehicle === 'truck' ? 1.4 : 0.6), zf + 0.4, TS.METAL, { lightMul: 0.3 });
    }
    // corner lamps
    for (const [x, z] of [[ax0 + 1.5, za0 + 1.5], [W - 2.5, za0 + 1.5], [ax0 + 1.5, za1 - 1.5], [W - 2.5, za1 - 1.5]]) {
      deco.box(x - 0.15, arenaY, z - 0.15, x + 0.15, arenaY + 0.25, z + 0.15, TS.METAL);
      deco.box(x - 0.1, arenaY + 0.25, z - 0.1, x + 0.1, arenaY + 0.45, z + 0.1, TS.LIGHT, { emissive: 1, uv: 'fit' });
      deco.light(x, arenaY + 1.2, z, [1, 0.45, 0.35], 7, { pulse: true });
    }
  }

  // start on the rearmost vehicle of lane 0
  const first = laneVehicles[0][0];
  const start = { x: first.x0 + 1, z: first.z0 + (laneW >> 1) };
  const speed = vehicle === 'truck' ? 16 : vehicle === 'ship' ? 30 : 22;
  return {
    grid: g, deco, start, arenaCells: arena, boss: { x: ax0 + arenaLen / 2, z: H / 2 }, voidY: VOID_Y, noFortify: true, jumpGap: 2,
    scrollSpeed: speed, startYaw: 0,
  };
}
