// Outdoor city levels: avenues with lane markings and crosswalks, raised
// sidewalks with curbs and street lamps, blocks of skyscrapers (with setbacks
// and rooftop machinery), enterable lobbies with glass storefronts and
// mezzanines, low-rise shop rows with awnings and neon signs, plazas and
// parks, parking decks with railed ramps, ruins and craters, a canal crossed
// by railed bridges, and a walled boss plaza with a single gate.
// Modes: metro (downtown, ruined city, cyber traffic, harbour), town,
// village (ruined village, jungle / desert ruins) and cemetery (necropolis,
// graveyard).
import { TS, F, HAZ, newGrid, encloseBorder, clamp } from './common.js';
import { Deco, FACE } from './deco.js';

export function genCity(rng, theme, depth) {
  const p = theme.params || {};
  const id = theme.id || '';
  const mode = p.village ? 'village' : p.tombs ? 'cemetery' : id === 'ruined_town' ? 'town' : 'metro';
  const ruin = p.ruin ?? (id.includes('ruin') ? 0.4 : 0.12);
  const tall = p.tall ?? (mode === 'metro' ? 0.7 : 0.3);
  const night = /night|neon|digital|blood|storm/.test(theme.sky || '') || id.includes('cyber');
  const W = Math.round(clamp(78 + depth * 0.8, 78, 112) * (p.size || 1));
  const H = Math.round(W * rng.float(0.8, 0.95));
  const g = newGrid(W, H, 30);
  const rail = theme.railStyle || (mode === 'cemetery' ? 'iron' : mode === 'village' ? 'wood' : 'metal');
  const deco = new Deco(g, { ...theme, railStyle: rail }, rng);
  const outLight = Math.max(0.78, theme.light ?? 0.85);
  const facades = night ? [TS.FACADE2, TS.FACADE2, TS.FACADE] : [TS.FACADE, TS.FACADE, TS.FACADE2];

  // ---------------------------------------------------------- street grid
  const SW = mode === 'metro' ? 8 : mode === 'town' ? 7 : 4;     // street width incl. sidewalks
  const SIDE = mode === 'metro' ? 2 : mode === 'town' ? 2 : 0;   // sidewalk width
  const blk = mode === 'metro' ? [14, 21] : mode === 'town' ? [11, 15] : [9, 13];
  const edge0 = rng.int(blk[0] - 4, blk[0] - 1);
  // street lines spread evenly over the map with a little jitter; the outer
  // ring of blocks (towers against the map edge) is edge0 deep on every side
  const lines = (L) => {
    const avg = (blk[0] + blk[1]) / 2;
    const span = L - 2 * edge0 - SW;
    const n = Math.max(1, Math.round(span / (SW + avg)));
    const out = [];
    for (let k = 0; k <= n; k++) out.push(edge0 + Math.round((k * span) / n) + (k > 0 && k < n ? rng.int(-2, 2) : 0));
    return out;
  };
  const xs = lines(W), zs = lines(H);
  const kind = new Uint8Array(W * H);  // 0 block, 1 road, 2 sidewalk, 3 canal
  const rot = new Uint8Array(W * H);   // road runs along z
  const zMin = zs[0], zMax = zs[zs.length - 1] + SW, xMin = xs[0], xMax = xs[xs.length - 1] + SW;
  const roadRange = (o) => (SIDE === 0 ? true : o >= SIDE && o < SW - SIDE);
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    let ov = -1, oh = -1;
    for (const a of xs) if (x >= a && x < a + SW && z >= zMin && z < zMax) ov = x - a;
    for (const a of zs) if (z >= a && z < a + SW && x >= xMin && x < xMax) oh = z - a;
    if (ov < 0 && oh < 0) continue;
    const i = g.idx(x, z);
    if (ov >= 0 && oh >= 0) { kind[i] = roadRange(ov) || roadRange(oh) ? 1 : 2; rot[i] = roadRange(ov) && !roadRange(oh) ? 1 : 0; }
    else if (ov >= 0) { kind[i] = roadRange(ov) ? 1 : 2; rot[i] = 1; }
    else kind[i] = roadRange(oh) ? 1 : 2;
  }
  // canal replaces one inner north-south street in metro/town maps
  let canal = null;
  if ((mode === 'metro' || mode === 'town') && xs.length >= 3 && rng.chance(p.docks ? 0 : 0.45)) {
    const k = rng.int(1, xs.length - 2);
    canal = { x0: xs[k] + SIDE, x1: xs[k] + SW - SIDE };
    for (let z = zMin; z < zMax; z++) for (let x = canal.x0; x < canal.x1; x++) {
      const i = g.idx(x, z);
      const onCross = zs.some((a) => z >= a && z < a + SW);
      if (!onCross) kind[i] = 3;
    }
  }
  const pave = mode === 'village' || mode === 'cemetery';
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = g.idx(x, z);
    const k = kind[i];
    if (!k) continue;
    if (k === 1) {
      g.open(x, z, 0, 3, { sky: true, light: outLight, floorTex: pave ? TS.SIDEWALK : TS.ROAD, wallTex: TS.SIDE, region: -2, flags: F.OUTDOOR | (rot[i] ? F.UVROT : 0) });
    } else if (k === 2) {
      g.open(x, z, 0.18, 3, { sky: true, light: outLight, floorTex: TS.SIDEWALK, wallTex: TS.SIDE, region: -2, flags: F.OUTDOOR });
    } else if (k === 3) {
      g.open(x, z, -2.6, 3, { sky: true, light: outLight, floorTex: TS.WATER, wallTex: TS.PITWALL, region: -5, flags: F.OUTDOOR | F.PIT | F.HAZARD, haz: HAZ.WATER });
    }
  }
  // canal: bridges where cross streets pass over it, quay walls and railings
  if (canal) {
    for (let z = zMin; z < zMax; z++) for (let x = canal.x0; x < canal.x1; x++) {
      const i = g.idx(x, z);
      if (kind[i] === 1 || kind[i] === 2) { g.flags[i] |= F.BRIDGE; g.wallTex[i] = TS.SIDE; }
    }
    // the canal's quay cells (sidewalks next to water) get guard rails
    const quay = [];
    for (let z = zMin; z < zMax; z++) for (const x of [canal.x0 - 1, canal.x1]) { const i = g.idx(x, z); if (g.type[i]) { quay.push(i); g.wallTex[i] = TS.PITWALL; } }
    const bridges = [];
    for (let z = zMin; z < zMax; z++) for (let x = canal.x0; x < canal.x1; x++) { const i = g.idx(x, z); if (g.flags[i] & F.BRIDGE) bridges.push(i); }
    deco.railEdges(quay, { style: 'stone' === rail ? 'stone' : 'metal', drop: 1.0 });
    deco.railEdges(bridges, { style: mode === 'town' ? 'stone' : 'metal', drop: 1.0 });
    // lamps on the bridges
    for (const a of zs) deco.streetLamp(canal.x0 + 0.5, a + 0.6, 0.18, { armZ: 0.5, armX: 0, height: 3.8 });
  }

  // ---------------------------------------------------------- road paint
  if (!pave) {
    const PAINT_Y = 0.004, PH = 0.016;
    for (const a of xs) {
      const cx = a + SW / 2;
      if (canal && a + SIDE === canal.x0) continue;
      for (let z = zMin; z < zMax; z += 3) {
        if (zs.some((b) => z + 1.6 > b - 2 && z < b + SW + 2)) continue;   // gap at intersections
        deco.box(cx - 0.06, PAINT_Y, z, cx + 0.06, PAINT_Y + PH, z + 1.6, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
      }
    }
    for (const a of zs) {
      const cz = a + SW / 2;
      for (let x = xMin; x < xMax; x += 3) {
        if (xs.some((b) => x + 1.6 > b - 2 && x < b + SW + 2)) continue;
        deco.box(x, PAINT_Y, cz - 0.06, x + 1.6, PAINT_Y + PH, cz + 0.06, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
      }
    }
    // zebra crossings on each mouth of each intersection
    for (const a of xs) for (const b of zs) {
      const r0 = SIDE, r1 = SW - SIDE;
      for (const zc of [b - 1.8, b + SW + 0.2]) for (let t = a + r0 + 0.2; t < a + r1 - 0.2; t += 0.8) deco.box(t, PAINT_Y, zc, t + 0.42, PAINT_Y + PH, zc + 1.6, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
      for (const xc of [a - 1.8, a + SW + 0.2]) for (let t = b + r0 + 0.2; t < b + r1 - 0.2; t += 0.8) deco.box(xc, PAINT_Y, t, xc + 1.6, PAINT_Y + PH, t + 0.42, TS.PAINT, { uv: 'fit', faces: FACE.TOP });
    }
  }

  // ---------------------------------------------------------- blocks
  const blocks = [];
  const bx = [1, ...xs.map((a) => a + SW)], bxe = [...xs, W - 1];
  const bz = [1, ...zs.map((a) => a + SW)], bze = [...zs, H - 1];
  for (let j = 0; j < bz.length; j++) for (let i = 0; i < bx.length; i++) {
    const x0 = bx[i], z0 = bz[j], x1 = bxe[i], z1 = bze[j];
    if (x1 - x0 < 4 || z1 - z0 < 4) continue;
    const outer = i === 0 || j === 0 || i === bx.length - 1 || j === bz.length - 1;
    blocks.push({ x: x0, z: z0, w: x1 - x0, h: z1 - z0, outer, i, j });
  }
  // boss plaza: the inner block farthest from the start corner (largest wins ties)
  const inner = blocks.filter((b) => !b.outer && b.w >= 10 && b.h >= 10);
  const plazaBlock = (inner.length ? inner : blocks).reduce((best, b) => (b.x + b.z + b.w * 0.5 > best.x + best.z + best.w * 0.5 ? b : best));
  const startBlock = blocks.reduce((best, b) => (b.x + b.z < best.x + best.z ? b : best));
  const parks = [];
  for (const b of blocks) {
    if (b === plazaBlock) continue;
    if (mode === 'village') villageBlock(b);
    else if (mode === 'cemetery') cemeteryBlock(b);
    else cityBlock(b);
  }
  if (p.docks) harbour();
  const arena = bossPlaza(plazaBlock);

  // ---------------------------------------------------------- street furniture
  if (!pave) streetFurniture();
  if (ruin > 0) ruins();

  encloseBorder(g);
  for (let i = 0; i < W * H; i++) if (!g.type[i] && g.floor[i] < 4) g.floor[i] = 4;
  // start on the street nearest the top-left corner
  const sx = xs[0] + Math.floor(SW / 2), sz = zs[0] + Math.floor(SW / 2) + 2;
  return { grid: g, deco, start: { x: sx, z: sz }, arenaCells: arena.cells, boss: arena.boss, noFortify: true, startYaw: Math.PI / 4 };

  // ================================================================ blocks
  function lotSplit(b) {
    // split a block into lots along its long axis, sometimes with a 2-wide alley
    const lots = [];
    const alongX = b.w >= b.h;
    const L = alongX ? b.w : b.h;
    let t = 0;
    while (t < L) {
      const left = L - t;
      let len = left <= 12 ? left : rng.int(5, Math.min(12, left - 5));
      if (len < 4) len = left;
      const lot = alongX ? { x: b.x + t, z: b.z, w: len, h: b.h } : { x: b.x, z: b.z + t, w: b.w, h: len };
      lots.push(lot);
      t += len;
      if (t < L - 6 && rng.chance(0.3)) {
        // alley
        for (let a = 0; a < 2; a++) for (let s = 0; s < (alongX ? b.h : b.w); s++) {
          const x = alongX ? b.x + t + a : b.x + s, z = alongX ? b.z + s : b.z + t + a;
          g.open(x, z, 0.18, 3, { sky: true, light: outLight * 0.85, floorTex: TS.SIDEWALK, wallTex: TS.SIDE, region: -2, flags: F.OUTDOOR });
        }
        lots.push({ alley: true, x: alongX ? b.x + t : b.x, z: alongX ? b.z : b.z + t, w: alongX ? 2 : b.w, h: alongX ? b.h : 2 });
        t += 2;
      }
    }
    return lots;
  }

  function cityBlock(b) {
    const lots = lotSplit(b);
    for (const lot of lots) {
      if (lot.alley) { alleyDetail(lot); continue; }
      const roll = rng.next();
      const isStart = b === startBlock;
      if (lot.w >= 9 && lot.h >= 9 && roll < 0.22 && !b.outer) lobbyTower(lot);
      else if (lot.w >= 8 && lot.h >= 8 && roll < 0.32 && !b.outer && !isStart) plaza(lot);
      else if (lot.w >= 9 && lot.h >= 9 && roll < 0.4 && !b.outer) parkingDeck(lot);
      else if (mode === 'town' || roll < 0.55) lowRise(lot);
      else tower(lot);
    }
  }

  function solidLot(lot, top, tex) {
    for (let z = lot.z; z < lot.z + lot.h; z++) for (let x = lot.x; x < lot.x + lot.w; x++) g.solid(x, z, top, tex);
  }
  // which lot sides face open street cells (for storefronts / awnings)
  function streetSides(lot) {
    const out = [];
    const test = (x, z) => g.in(x, z) && g.type[g.idx(x, z)] && (g.flags[g.idx(x, z)] & F.OUTDOOR);
    if (test(lot.x + 1, lot.z - 1)) out.push(3);
    if (test(lot.x + 1, lot.z + lot.h)) out.push(2);
    if (test(lot.x - 1, lot.z + 1)) out.push(1);
    if (test(lot.x + lot.w, lot.z + 1)) out.push(0);
    return out;
  }

  function tower(lot) {
    const top = Math.round(14 + rng.float(0, 34) * tall + (lot.w * lot.h > 120 ? 6 : 0));
    const tex = rng.pick(facades);
    solidLot(lot, top, tex);
    // setback crown on bigger towers
    let roof = top;
    if (lot.w >= 8 && lot.h >= 8 && rng.chance(0.6)) {
      const extra = rng.int(6, 16);
      deco.box(lot.x + 2, top, lot.z + 2, lot.x + lot.w - 2, top + extra, lot.z + lot.h - 2, { side: tex, top: TS.ROOF }, { faces: FACE.SIDES | FACE.TOP });
      roof = top + extra;
      if (rng.chance(0.5)) deco.box(lot.x + lot.w / 2 - 0.1, roof, lot.z + lot.h / 2 - 0.1, lot.x + lot.w / 2 + 0.1, roof + rng.int(4, 9), lot.z + lot.h / 2 + 0.1, TS.METAL, { faces: FACE.SIDES });
    }
    rooftop(lot, top);
    // ground-floor detail facing the street: storefront glass + awnings
    groundFloor(lot, tex);
  }

  function rooftop(lot, top) {
    // AC units / water tank on the roof edge region (visible from below as silhouettes)
    for (let k = 0; k < Math.min(3, Math.floor(lot.w * lot.h / 30)); k++) {
      const x = lot.x + rng.float(0.5, lot.w - 2), z = lot.z + rng.float(0.5, lot.h - 2);
      if (rng.chance(0.7)) deco.box(x, top, z, x + 1.4, top + 1, z + 1, { side: TS.METAL, top: TS.MACHINE }, {});
      else {
        deco.box(x, top, z, x + 1.6, top + 1.4, z + 1.6, TS.METAL, { faces: FACE.SIDES });
        deco.box(x - 0.1, top + 1.4, z - 0.1, x + 1.7, top + 3.2, z + 1.7, TS.WOOD, {});
      }
    }
    // parapet band
    deco.box(lot.x, top, lot.z, lot.x + lot.w, top + 0.4, lot.z + 0.25, TS.TRIM, { faces: FACE.SIDES | FACE.TOP });
    deco.box(lot.x, top, lot.z + lot.h - 0.25, lot.x + lot.w, top + 0.4, lot.z + lot.h, TS.TRIM, { faces: FACE.SIDES | FACE.TOP });
  }

  function groundFloor(lot, tex) {
    for (const d of streetSides(lot)) {
      const horiz = d >= 2;
      const len = horiz ? lot.w : lot.h;
      for (let t = 1; t < len - 1; t++) {
        // outside cell adjacent to this wall cell
        const wx = horiz ? lot.x + t : d === 1 ? lot.x : lot.x + lot.w - 1;
        const wz = horiz ? (d === 3 ? lot.z : lot.z + lot.h - 1) : lot.z + t;
        const ox = wx + (d === 0 ? 1 : d === 1 ? -1 : 0), oz = wz + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (!g.isOpen(ox, oz)) continue;
        const od = d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2;   // from the outside cell toward the wall
        if (t % 3 !== 0) deco.window(ox, oz, od, 0.6, 2.4, { emissive: night ? 0.6 : 0.3 });
      }
      // awning over the sidewalk
      if (rng.chance(0.4)) {
        const y = 2.7, ext = 1.2;
        if (d === 3) deco.box(lot.x + 0.5, y, lot.z - ext, lot.x + lot.w - 0.5, y + 0.12, lot.z, night ? TS.NEON : TS.CRATE2, { emissive: night ? 0.4 : 0 });
        if (d === 2) deco.box(lot.x + 0.5, y, lot.z + lot.h, lot.x + lot.w - 0.5, y + 0.12, lot.z + lot.h + ext, night ? TS.NEON : TS.CRATE2, { emissive: night ? 0.4 : 0 });
        if (d === 1) deco.box(lot.x - ext, y, lot.z + 0.5, lot.x, y + 0.12, lot.z + lot.h - 0.5, night ? TS.NEON : TS.CRATE2, { emissive: night ? 0.4 : 0 });
        if (d === 0) deco.box(lot.x + lot.w, y, lot.z + 0.5, lot.x + lot.w + ext, y + 0.12, lot.z + lot.h - 0.5, night ? TS.NEON : TS.CRATE2, { emissive: night ? 0.4 : 0 });
      }
      // neon sign above
      if (night || rng.chance(0.3)) {
        const y0 = 3.3, y1 = 4.1;
        const m = rng.float(0.25, 0.5);
        if (d === 3) deco.box(lot.x + lot.w * m, y0, lot.z - 0.12, lot.x + lot.w * m + 2.2, y1, lot.z, TS.NEON, { uv: 'fit', emissive: 1 });
        if (d === 2) deco.box(lot.x + lot.w * m, y0, lot.z + lot.h, lot.x + lot.w * m + 2.2, y1, lot.z + lot.h + 0.12, TS.NEON, { uv: 'fit', emissive: 1 });
        if (d === 1) deco.box(lot.x - 0.12, y0, lot.z + lot.h * m, lot.x, y1, lot.z + lot.h * m + 2.2, TS.NEON, { uv: 'fit', emissive: 1 });
        if (d === 0) deco.box(lot.x + lot.w, y0, lot.z + lot.h * m, lot.x + lot.w + 0.12, y1, lot.z + lot.h * m + 2.2, TS.NEON, { uv: 'fit', emissive: 1 });
      }
    }
  }

  function lowRise(lot) {
    const top = rng.pick(mode === 'town' ? [5, 6.5, 8, 9.5] : [6, 8, 10, 12]);
    const tex = mode === 'town' ? rng.pick([TS.FACADE3, TS.FACADE3, TS.WALL]) : TS.FACADE3;
    // some low-rise buildings are enterable shops
    if (lot.w >= 6 && lot.h >= 6 && rng.chance(0.45)) { shop(lot, top, tex); return; }
    solidLot(lot, top, tex);
    groundFloor(lot, tex);
    if (rng.chance(0.5)) rooftop(lot, top);
  }

  // building with an open ground floor (shop / bar / warehouse)
  function shop(lot, top, tex) {
    const sides = streetSides(lot);
    if (!sides.length) { solidLot(lot, top, tex); return; }
    const ceil = Math.min(top - 1, rng.pick([3.4, 4, 4.5]));
    for (let z = lot.z; z < lot.z + lot.h; z++) for (let x = lot.x; x < lot.x + lot.w; x++) {
      const edgeCell = x === lot.x || z === lot.z || x === lot.x + lot.w - 1 || z === lot.z + lot.h - 1;
      if (edgeCell) g.solid(x, z, top, tex);
      else {
        g.open(x, z, 0.18, 0.18 + ceil, { light: (theme.light ?? 0.75) * 0.75, floorTex: rng.chance(0.5) ? TS.FLOOR : TS.FLOOR2, ceilTex: TS.CEIL, wallTex: TS.SIDE, region: -3 });
        g.roof[g.idx(x, z)] = top;
      }
    }
    // entrance (2 wide) on a street side
    const d = rng.pick(sides);
    const horiz = d >= 2;
    const len = horiz ? lot.w : lot.h;
    const t0 = rng.int(1, Math.max(1, len - 3));
    for (let t = t0; t < t0 + 2 && t < len - 1; t++) {
      const x = horiz ? lot.x + t : d === 1 ? lot.x : lot.x + lot.w - 1;
      const z = horiz ? (d === 3 ? lot.z : lot.z + lot.h - 1) : lot.z + t;
      g.open(x, z, 0.18, 0.18 + Math.min(ceil, 3), { light: 0.7, floorTex: TS.FLOOR2, ceilTex: TS.CEIL, wallTex: TS.TRIM, region: -3 });
      g.roof[g.idx(x, z)] = top;
    }
    // shop fittings: shelves along the back, a counter, lights
    const ix = lot.x + 1, iz = lot.z + 1, iw = lot.w - 2, ih = lot.h - 2;
    const cells = [];
    for (let z = iz; z < iz + ih; z++) for (let x = ix; x < ix + iw; x++) cells.push(g.idx(x, z));
    deco.wallTrims(cells, { wainscot: 1.0, crown: false, skin: TS.WALL });
    if (iw >= 4) deco.shelf(ix + 0.2, iz + 0.05, ix + iw - 0.2, iz + 0.65, 0.18, Math.min(2.2, ceil - 0.6));
    if (iw >= 3 && ih >= 4) deco.box(ix + 0.6, 0.18, iz + ih - 1.6, ix + iw - 0.6, 1.2, iz + ih - 1.0, { side: TS.WOOD, top: TS.METAL }, { solid: true });
    deco.lightPanel(ix + iw / 2 - 0.6, iz + ih / 2 - 0.4, ix + iw / 2 + 0.6, iz + ih / 2 + 0.4, 0.18 + ceil, [1, 0.95, 0.8], 5);
    groundFloor(lot, tex);
  }

  function lobbyTower(lot) {
    const top = Math.round(18 + rng.float(0, 30) * tall);
    const tex = rng.pick(facades);
    const ceil = rng.pick([5.5, 6.5, 7.5]);
    const fl = 0.18;
    for (let z = lot.z; z < lot.z + lot.h; z++) for (let x = lot.x; x < lot.x + lot.w; x++) {
      const edgeCell = x === lot.x || z === lot.z || x === lot.x + lot.w - 1 || z === lot.z + lot.h - 1;
      if (edgeCell) g.solid(x, z, top, tex);
      else { g.open(x, z, fl, fl + ceil, { light: (theme.light ?? 0.75) * 0.85, floorTex: TS.FLOOR3, ceilTex: TS.CEIL2, wallTex: TS.SIDE, region: -3 }); g.roof[g.idx(x, z)] = top; }
    }
    rooftop(lot, top);
    const sides = streetSides(lot);
    const d = sides.length ? rng.pick(sides) : 3;
    const horiz = d >= 2, len = horiz ? lot.w : lot.h;
    const t0 = Math.floor(len / 2) - 1;
    for (let t = t0; t < t0 + 3; t++) {
      const x = horiz ? lot.x + t : d === 1 ? lot.x : lot.x + lot.w - 1;
      const z = horiz ? (d === 3 ? lot.z : lot.z + lot.h - 1) : lot.z + t;
      g.open(x, z, fl, fl + 3.4, { light: 0.8, floorTex: TS.FLOOR3, ceilTex: TS.CEIL, wallTex: TS.TRIM, region: -3 });
      g.roof[g.idx(x, z)] = top;
    }
    groundFloor(lot, tex);
    // interior: columns, mezzanine with stairs + rails along the back wall, reception desk, lights
    const ix = lot.x + 1, iz = lot.z + 1, iw = lot.w - 2, ih = lot.h - 2;
    const cells = [];
    for (let z = iz; z < iz + ih; z++) for (let x = ix; x < ix + iw; x++) cells.push(g.idx(x, z));
    // mezzanine on the side opposite the entrance
    const back = d === 3 ? 2 : d === 2 ? 3 : d === 1 ? 0 : 1;
    const mz = new Set();
    const up = 3.0;
    if (iw >= 7 && ih >= 7) {
      const depthM = 2;
      for (const i of cells) {
        const x = i % W, z = (i / W) | 0;
        const inM = back === 2 ? z >= iz + ih - depthM : back === 3 ? z < iz + depthM : back === 0 ? x >= ix + iw - depthM : x < ix + depthM;
        if (inM) { g.floor[i] = fl + up; g.wallTex[i] = TS.SIDE; g.floorTex[i] = TS.GRATE; mz.add(i); }
      }
      // stairs along one side wall leading up to the mezzanine
      const n = 5;
      if (back === 2) deco.stairs(ix, iz + ih - depthM - n, 2, 2, fl, fl + up, { rise: up / n, region: -3 });
      else if (back === 3) deco.stairs(ix, iz + depthM + n - 1, 3, 2, fl, fl + up, { rise: up / n, region: -3 });
      else if (back === 0) deco.stairs(ix + iw - depthM - n, iz, 0, 2, fl, fl + up, { rise: up / n, region: -3 });
      else deco.stairs(ix + depthM + n - 1, iz, 1, 2, fl, fl + up, { rise: up / n, region: -3 });
      deco.railEdges(mz, { style: night ? 'glass' : 'glass' });
    }
    deco.wallTrims(cells, { wainscot: 0, crown: true, skin: TS.WALL });
    for (let z = iz + 2; z < iz + ih - 2; z += 3) for (let x = ix + 2; x < ix + iw - 2; x += 3) {
      const i = g.idx(x, z);
      if (mz.has(i) || (g.flags[i] & (F.STAIR | F.OBSTACLE)) || g.edge[i]) continue;
      if (Math.abs(x - (ix + iw / 2)) < 2 && Math.abs(z - (iz + ih / 2)) < 2) continue;
      deco.pillar(x + 0.5, z + 0.5, 0.6, fl, fl + ceil, { tex: TS.PILLAR });
    }
    const cx = ix + iw / 2, cz = iz + ih / 2;
    deco.box(cx - 1.2, fl, cz - 0.4, cx + 1.2, fl + 1.05, cz + 0.4, { side: TS.WOOD, top: TS.FLOOR3 }, { solid: true });
    deco.lightPanel(cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5, fl + ceil, [1, 0.95, 0.85], 9);
  }

  function plaza(lot) {
    for (let z = lot.z; z < lot.z + lot.h; z++) for (let x = lot.x; x < lot.x + lot.w; x++) {
      const park = (x + z) % 7 < 3;
      g.open(x, z, 0.18, 3, { sky: true, light: outLight, floorTex: park && mode !== 'metro' ? TS.GROUND : TS.FLOOR3, wallTex: TS.SIDE, region: -2, flags: F.OUTDOOR });
    }
    const cx = lot.x + lot.w / 2, cz = lot.z + lot.h / 2;
    parks.push(lot);
    // fountain or statue in the middle
    if (rng.chance(0.55)) {
      const fx = Math.floor(cx) - 1, fz = Math.floor(cz) - 1;
      for (let z = fz; z < fz + 3; z++) for (let x = fx; x < fx + 3; x++) {
        const i = g.idx(x, z);
        g.open(x, z, -0.2, 3, { sky: true, light: outLight, floorTex: TS.WATER, wallTex: TS.TRIM, region: -2, flags: F.OUTDOOR | F.WATER | F.NOSPAWN, haz: HAZ.WATER });
      }
      deco.box(cx - 0.35, -0.2, cz - 0.35, cx + 0.35, 1.8, cz + 0.35, TS.PILLAR, { solid: true });
      deco.box(cx - 0.8, 1.5, cz - 0.8, cx + 0.8, 1.7, cz + 0.8, TS.TRIM);
    } else {
      deco.box(cx - 1, 0.18, cz - 1, cx + 1, 0.9, cz + 1, TS.SIDE, { solid: true });
      deco.pillar(cx, cz, 0.8, 0.9, 4.2, { tex: TS.PILLAR });
    }
    // trees in planters on a ring, benches, lamps
    for (const [ox, oz] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) {
      const tx = cx + ox * lot.w, tz = cz + oz * lot.h;
      deco.box(tx - 0.6, 0.18, tz - 0.6, tx + 0.6, 0.6, tz + 0.6, TS.SIDE, { solid: true });
      deco.box(tx - 0.12, 0.6, tz - 0.12, tx + 0.12, 2.6, tz + 0.12, TS.WOOD);
      deco.box(tx - 1.0, 2.2, tz - 1.0, tx + 1.0, 3.6, tz + 1.0, TS.FOLIAGE);
    }
    deco.streetLamp(lot.x + 0.6, lot.z + 0.6, 0.18, { armX: 0.4, height: 3.6 });
    deco.streetLamp(lot.x + lot.w - 0.6, lot.z + lot.h - 0.6, 0.18, { armX: -0.4, height: 3.6 });
  }

  function parkingDeck(lot) {
    // ground-level lot with a raised deck (railed) reached by a ramp of stairs
    for (let z = lot.z; z < lot.z + lot.h; z++) for (let x = lot.x; x < lot.x + lot.w; x++) {
      g.open(x, z, 0.18, 3, { sky: true, light: outLight, floorTex: TS.ROAD, wallTex: TS.SIDE, region: -2, flags: F.OUTDOOR });
    }
    const up = 3.0, n = 5;
    const dw = Math.floor(lot.w / 2), dh = lot.h - 2;
    const x0 = lot.x + lot.w - dw - 1, z0 = lot.z + 1;
    const deck = new Set();
    for (let z = z0; z < z0 + dh; z++) for (let x = x0; x < x0 + dw; x++) {
      const i = g.idx(x, z);
      g.floor[i] = 0.18 + up; g.wallTex[i] = TS.SIDE; g.floorTex[i] = TS.ROAD; deck.add(i);
    }
    // concrete pillars under the deck edge
    for (let z = z0 + 1; z < z0 + dh; z += 3) deco.box(x0 - 0.3, 0.18, z + 0.3, x0 + 0.1, 0.18 + up, z + 0.7, TS.PILLAR, { solid: true });
    const sx = x0 - n, sz = lot.z + lot.h - 3;
    if (sx > lot.x) {
      deco.stairs(sx, sz, 0, 2, 0.18, 0.18 + up, { rise: up / n, region: -2, sky: true });
      for (let k = 0; k < 2; k++) { const i = g.idx(x0, sz + k); deck.add(i); }
    }
    deco.railEdges(deck, { style: 'metal' });
    // painted bays and cars on both levels
    for (let z = lot.z + 1; z < lot.z + lot.h - 1; z += 2) {
      if (rng.chance(0.5)) deco.car(lot.x + 0.5, z + 0.1, 0.18, true, { length: 2.0 });
      if (rng.chance(0.4) && z >= z0 && z + 1 < z0 + dh) deco.car(x0 + 0.6, z + 0.1, 0.18 + up, true, { length: 2.0 });
    }
    deco.streetLamp(x0 + dw - 0.6, z0 + 0.6, 0.18 + up, { armX: -0.4, height: 3.2 });
  }

  function alleyDetail(lot) {
    // dumpsters, crates, a fire escape stair up to a rooftop
    for (let k = 0; k < 2; k++) {
      const horiz = lot.w > lot.h;
      const t = rng.float(1, (horiz ? lot.w : lot.h) - 2);
      const x = horiz ? lot.x + t : lot.x + 0.2, z = horiz ? lot.z + 0.2 : lot.z + t;
      if (rng.chance(0.6)) deco.box(x, 0.18, z, x + (horiz ? 1.4 : 0.8), 1.2, z + (horiz ? 0.8 : 1.4), { side: TS.CRATE2, top: TS.METAL }, { solid: true });
      else deco.crate(x + 0.4, z + 0.4, 0.18, 0.8);
    }
  }

  // ---------------------------------------------------------- villages & cemeteries
  function villageBlock(b) {
    for (let z = b.z; z < b.z + b.h; z++) for (let x = b.x; x < b.x + b.w; x++) {
      g.open(x, z, 0, 3, { sky: true, light: outLight, floorTex: TS.GROUND, wallTex: TS.SIDE, region: -2, flags: F.OUTDOOR });
    }
    const tries = Math.floor(b.w * b.h / 18);
    for (let k = 0; k < tries; k++) {
      const w = rng.int(4, 6), h = rng.int(4, 6);
      const x = rng.int(b.x + 1, b.x + b.w - w - 1), z = rng.int(b.z + 1, b.z + b.h - h - 1);
      let free = true;
      for (let zz = z - 1; zz < z + h + 1; zz++) for (let xx = x - 1; xx < x + w + 1; xx++) { const i = g.idx(xx, zz); if (!g.type[i] || g.region[i] !== -2 || (g.flags[i] & F.OBSTACLE)) free = false; }
      if (!free) continue;
      house(x, z, w, h);
    }
    // fence + trees around the yard
    if (rng.chance(0.6)) {
      const fy = 0;
      deco.railRun(b.x, b.z, b.x + b.w, b.z, fy, { style: 'wood', height: 0.9 });
      deco.railRun(b.x, b.z + b.h, b.x + b.w, b.z + b.h, fy, { style: 'wood', height: 0.9 });
    }
    for (let k = 0; k < Math.floor(b.w * b.h / 40); k++) {
      const x = rng.int(b.x + 1, b.x + b.w - 2), z = rng.int(b.z + 1, b.z + b.h - 2);
      if (!deco.cellFree(x, z)) continue;
      deco.box(x + 0.35, 0, z + 0.35, x + 0.65, 2.6, z + 0.65, TS.WOOD, { solid: true });
      deco.box(x - 0.6, 2.0, z - 0.6, x + 1.6, 3.8, z + 1.6, TS.FOLIAGE);
    }
  }
  function house(x, z, w, h) {
    const top = rng.pick([3.4, 4, 4.6]);
    const ceil = 2.8;
    const tex = rng.chance(0.5) ? TS.WALL : TS.WALL2;
    for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) {
      const edgeCell = xx === x || zz === z || xx === x + w - 1 || zz === z + h - 1;
      if (edgeCell) g.solid(xx, zz, top, tex);
      else { g.open(xx, zz, 0, ceil, { light: (theme.light ?? 0.7) * 0.7, floorTex: TS.WOOD, ceilTex: TS.WOOD, wallTex: TS.SIDE, region: -3 }); g.roof[g.idx(xx, zz)] = top; }
    }
    // stepped pitched roof
    for (let k = 0; k < 3; k++) {
      const ins = 0.2 + k * 0.6;
      deco.box(x - 0.3 + ins, top + k * 0.55, z - 0.3 + ins, x + w + 0.3 - ins, top + (k + 1) * 0.55, z + h + 0.3 - ins, TS.ROOF, { faces: FACE.SIDES | FACE.TOP | (k === 0 ? FACE.BOTTOM : 0) });
    }
    // door opening and a window or two
    const side = rng.int(0, 3);
    const dx = side < 2 ? rng.int(x + 1, x + w - 2) : side === 2 ? x : x + w - 1;
    const dz = side >= 2 ? rng.int(z + 1, z + h - 2) : side === 0 ? z : z + h - 1;
    g.open(dx, dz, 0, 2.4, { light: 0.6, floorTex: TS.WOOD, ceilTex: TS.WOOD, wallTex: TS.TRIM, region: -3 });
    g.roof[g.idx(dx, dz)] = top;
    const cx = x + w / 2, cz = z + h / 2;
    deco.table(cx - 0.6, cz - 0.35, 0, 1.2, 0.7);
    deco.light(cx, 2.2, cz, [1, 0.75, 0.45], 4, { flicker: true });
  }

  function cemeteryBlock(b) {
    for (let z = b.z; z < b.z + b.h; z++) for (let x = b.x; x < b.x + b.w; x++) {
      g.open(x, z, 0, 3, { sky: true, light: outLight * 0.9, floorTex: TS.GROUND, wallTex: TS.SIDE, region: -2, flags: F.OUTDOOR });
    }
    // iron fence around the block with a gap
    const gap = rng.int(b.x + 2, b.x + b.w - 3);
    deco.railRun(b.x, b.z, gap, b.z, 0, { style: 'iron', height: 1.4 });
    deco.railRun(gap + 2, b.z, b.x + b.w, b.z, 0, { style: 'iron', height: 1.4 });
    deco.railRun(b.x, b.z + b.h, b.x + b.w, b.z + b.h, 0, { style: 'iron', height: 1.4 });
    // rows of graves
    for (let z = b.z + 2; z < b.z + b.h - 2; z += 3) for (let x = b.x + 1; x < b.x + b.w - 1; x += 2) {
      if (!deco.cellFree(x, z) || rng.chance(0.25)) continue;
      if (rng.chance(0.2)) deco.box(x + 0.1, 0, z, x + 0.9, 0.9, z + 1.8, { side: TS.PILLAR, top: TS.TRIM }, { solid: true });   // tomb
      else deco.box(x + 0.25, 0, z + 0.4, x + 0.75, rng.float(0.7, 1.1), z + 0.58, TS.PILLAR, { solid: true });         // headstone
    }
    // a mausoleum
    if (b.w >= 9 && b.h >= 9 && rng.chance(0.6)) {
      const mx = b.x + Math.floor(b.w / 2) - 2, mz = b.z + Math.floor(b.h / 2) - 2;
      let free = true;
      for (let z = mz - 1; z < mz + 6; z++) for (let x = mx - 1; x < mx + 6; x++) if (g.flags[g.idx(x, z)] & F.OBSTACLE) free = false;
      if (free) {
        for (let z = mz; z < mz + 5; z++) for (let x = mx; x < mx + 5; x++) {
          const edgeCell = x === mx || z === mz || x === mx + 4 || z === mz + 4;
          if (edgeCell) g.solid(x, z, 5, TS.WALL);
          else { g.open(x, z, 0, 3.4, { light: 0.5, floorTex: TS.FLOOR3, ceilTex: TS.CEIL, region: -3 }); g.roof[g.idx(x, z)] = 5; }
        }
        g.open(mx + 2, mz + 4, 0, 2.6, { light: 0.5, floorTex: TS.FLOOR3, ceilTex: TS.CEIL, wallTex: TS.TRIM, region: -3 });
        g.roof[g.idx(mx + 2, mz + 4)] = 5;
        deco.box(mx - 0.2, 5, mz - 0.2, mx + 5.2, 5.5, mz + 5.2, TS.TRIM, { faces: FACE.SIDES | FACE.TOP | FACE.BOTTOM });
        deco.box(mx + 1.6, 0, mz + 1.4, mx + 3.4, 1.0, mz + 2.2, { side: TS.PILLAR, top: TS.TRIM }, { solid: true });
        deco.light(mx + 2.5, 1.8, mz + 2.5, [0.6, 0.8, 1], 4, { flicker: true });
      }
    }
    // dead trees
    for (let k = 0; k < 2; k++) {
      const x = rng.int(b.x + 1, b.x + b.w - 2), z = rng.int(b.z + 1, b.z + b.h - 2);
      if (!deco.cellFree(x, z)) continue;
      deco.box(x + 0.4, 0, z + 0.4, x + 0.6, 3.2, z + 0.6, TS.WOOD, { solid: true });
      deco.box(x - 0.2, 2.4, z + 0.45, x + 1.2, 2.55, z + 0.55, TS.WOOD);
    }
  }

  // ---------------------------------------------------------- harbour (docks)
  function harbour() {
    const x0 = W - 10;
    for (let z = 1; z < H - 1; z++) for (let x = x0; x < W - 1; x++) {
      const i = g.idx(x, z);
      if (z % 8 === 4 && x < W - 3) {
        g.open(x, z, 0.18, 3, { sky: true, light: outLight, floorTex: TS.WOOD, wallTex: TS.WOOD, region: -2, flags: F.OUTDOOR | F.BRIDGE });
        continue;
      }
      g.open(x, z, -8, 3, { sky: true, light: outLight, region: -5, flags: F.VOID | F.OUTDOOR });
    }
    // containers stacked along the quay
    for (let z = 3; z < H - 6; z += 5) {
      if (!deco.cellFree(x0 - 2, z) || !deco.cellFree(x0 - 2, z + 2)) continue;
      deco.container(x0 - 2.6, z, 0.18, false, { length: 3 });
      if (rng.chance(0.5)) deco.container(x0 - 2.6, z, 1.48, false, { length: 3 });
    }
  }

  // ---------------------------------------------------------- boss plaza
  function bossPlaza(b) {
    const cells = [];
    const wallTop = mode === 'metro' ? 4.5 : 3.6;
    for (let z = b.z; z < b.z + b.h; z++) for (let x = b.x; x < b.x + b.w; x++) {
      const edgeCell = x === b.x || z === b.z || x === b.x + b.w - 1 || z === b.z + b.h - 1;
      if (edgeCell) { g.solid(x, z, wallTop, mode === 'cemetery' ? TS.WALL : TS.WALL2); continue; }
      g.open(x, z, 0.18, 3, { sky: true, light: outLight, floorTex: TS.FLOOR3, wallTex: TS.SIDE, region: -6, flags: F.OUTDOOR });
      cells.push(g.idx(x, z));
    }
    // single 3-wide gate (the keyed door) on the side facing the start (north or west)
    const gateNorth = rng.chance(0.5);
    const gx = gateNorth ? b.x + Math.floor(b.w / 2) : b.x, gz = gateNorth ? b.z : b.z + Math.floor(b.h / 2);
    for (let k = -1; k <= 1; k++) {
      const x = gx + (gateNorth ? k : 0), z = gz + (gateNorth ? 0 : k);
      g.open(x, z, 0.18, 3.18, { light: outLight, floorTex: TS.SIDEWALK, ceilTex: TS.TRIM, wallTex: TS.TRIM, region: -2 });
      g.roof[g.idx(x, z)] = wallTop;
      // keep the approach clear of later rubble / lamps / cars
      for (const s of [-1, 0, 1]) { const j = g.idx(x + (gateNorth ? 0 : s), z + (gateNorth ? s : 0)); if (g.type[j]) g.flags[j] |= F.NOSPAWN; }
    }
    // the wall gets a cap and buttresses
    deco.box(b.x - 0.1, wallTop, b.z - 0.1, b.x + b.w + 0.1, wallTop + 0.3, b.z + 0.3, TS.TRIM, {});
    deco.box(b.x - 0.1, wallTop, b.z + b.h - 0.3, b.x + b.w + 0.1, wallTop + 0.3, b.z + b.h + 0.1, TS.TRIM, {});
    deco.box(b.x - 0.1, wallTop, b.z - 0.1, b.x + 0.3, wallTop + 0.3, b.z + b.h + 0.1, TS.TRIM, {});
    deco.box(b.x + b.w - 0.3, wallTop, b.z - 0.1, b.x + b.w + 0.1, wallTop + 0.3, b.z + b.h + 0.1, TS.TRIM, {});
    // monument, cover pillars, fire pits
    const cx = b.x + b.w / 2, cz = b.z + b.h / 2;
    deco.box(cx - 1.4, 0.18, cz - 1.4, cx + 1.4, 1.0, cz + 1.4, TS.SIDE, { solid: true });
    deco.pillar(cx, cz, 1.0, 1.0, 7.5, { tex: TS.PILLAR });
    for (const [ox, oz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const x = cx + ox * b.w, z = cz + oz * b.h;
      deco.pillar(x, z, 0.9, 0.18, 3.4, { tex: TS.PILLAR });
    }
    const pitKind = theme.hazard === 'acid' ? HAZ.POISON : theme.hazard === 'water' ? HAZ.WATER : HAZ.LAVA;
    for (const [ox, oz] of [[-0.3, 0], [0.3, 0]]) {
      const x = Math.floor(cx + ox * b.w), z = Math.floor(cz + oz * b.h);
      for (let zz = z; zz < z + 2; zz++) for (let xx = x; xx < x + 2; xx++) {
        const i = g.idx(xx, zz);
        if (!g.type[i] || (g.flags[i] & F.OBSTACLE)) continue;
        g.floor[i] = -0.2; g.flags[i] |= F.HAZARD | F.NOSPAWN; g.hazType[i] = pitKind;
        g.floorTex[i] = pitKind === HAZ.LAVA ? TS.LAVA : pitKind === HAZ.POISON ? TS.POISON : TS.WATER;
        g.wallTex[i] = TS.TRIM;
      }
      deco.light(x + 1, 0.8, z + 1, pitKind === HAZ.LAVA ? [1, 0.5, 0.2] : [0.5, 1, 0.4], 5, { flicker: true });
    }
    for (const [lx, lz] of [[b.x + 1.2, b.z + 1.2], [b.x + b.w - 1.2, b.z + 1.2], [b.x + 1.2, b.z + b.h - 1.2], [b.x + b.w - 1.2, b.z + b.h - 1.2]]) deco.streetLamp(lx, lz, 0.18, { armX: 0, armZ: 0, height: 4 });
    for (const i of cells) g.flags[i] |= F.ARENA;
    return { cells: cells.filter((i) => !(g.flags[i] & F.OBSTACLE)), boss: { x: cx + 2.5, z: cz + 2.5 } };
  }

  // ---------------------------------------------------------- furniture & ruin
  function streetFurniture() {
    // lamps every ~7 cells along sidewalks, facing the road
    for (const a of xs) for (let z = zMin + 3; z < zMax - 2; z += 7) {
      if (zs.some((b) => z > b - 2 && z < b + SW + 1)) continue;
      if (g.isOpen(a, z) && !(g.flags[g.idx(a, z)] & (F.OBSTACLE | F.BRIDGE))) deco.streetLamp(a + 0.4, z + 0.5, 0.18, { armX: 0.8 });
      if (g.isOpen(a + SW - 1, z) && !(g.flags[g.idx(a + SW - 1, z)] & (F.OBSTACLE | F.BRIDGE))) deco.streetLamp(a + SW - 0.4, z + 0.5, 0.18, { armX: -0.8 });
    }
    for (const b of zs) for (let x = xMin + 3; x < xMax - 2; x += 7) {
      if (xs.some((a) => x > a - 2 && x < a + SW + 1)) continue;
      if (g.isOpen(x, b) && !(g.flags[g.idx(x, b)] & (F.OBSTACLE | F.BRIDGE))) deco.streetLamp(x + 0.5, b + 0.4, 0.18, { armX: 0, armZ: 0.8 });
    }
    // parked / wrecked cars along the curbs, barricades
    const carChance = p.cars ?? (id.includes('traffic') ? 0.7 : 0.25);
    for (const a of xs) for (let z = zMin + 2; z < zMax - 4; z += 3) {
      if (zs.some((b) => z + 3 > b - 1 && z < b + SW + 1) || !rng.chance(carChance)) continue;
      const x = rng.chance(0.5) ? a + SIDE + 0.1 : a + SW - SIDE - 1.15;
      if (canal && x >= canal.x0 - 1 && x <= canal.x1) continue;
      if (deco.cellFree(Math.floor(x), z) && deco.cellFree(Math.floor(x), z + 1)) deco.car(x, z + 0.3, 0, false, { length: 2.2, tex: rng.chance(0.25) ? TS.CRATE2 : TS.METAL });
    }
    for (const b of zs) for (let x = xMin + 2; x < xMax - 4; x += 3) {
      if (xs.some((a) => x + 3 > a - 1 && x < a + SW + 1) || !rng.chance(carChance)) continue;
      const z = rng.chance(0.5) ? b + SIDE + 0.1 : b + SW - SIDE - 1.15;
      if (deco.cellFree(x, Math.floor(z)) && deco.cellFree(x + 1, Math.floor(z))) deco.car(x + 0.3, z, 0, true, { length: 2.2, tex: rng.chance(0.25) ? TS.CRATE2 : TS.METAL });
    }
    // a few concrete barricades across lanes (never closing a street)
    for (let k = 0; k < Math.floor(xs.length * zs.length / 2); k++) {
      const a = rng.pick(xs), z = rng.int(zMin + 2, zMax - 3);
      if (zs.some((b) => z > b - 2 && z < b + SW + 1)) continue;
      const x0 = a + SIDE, x1 = a + SIDE + 2;
      if (deco.cellFree(x0, z) && deco.cellFree(x0 + 1, z)) deco.barrier(x0 + 0.2, z + 0.5, x1 - 0.2, z + 0.5, 0, TS.SIDE);
    }
  }

  function ruins() {
    // craters in the streets: deep, flooded or burning
    const n = Math.floor((xs.length + zs.length) * ruin * 2);
    for (let k = 0; k < n; k++) {
      const vertical = rng.chance(0.5);
      const a = vertical ? rng.pick(xs) : rng.pick(zs);
      const t = rng.int(vertical ? zMin + 3 : xMin + 3, vertical ? zMax - 6 : xMax - 6);
      if ((vertical ? zs : xs).some((b) => t + 3 > b - 1 && t < b + SW + 1)) continue;
      const cx = vertical ? a + SIDE : t, cz = vertical ? t : a + SIDE;
      const w = vertical ? SW - 2 * SIDE : 3, h = vertical ? 3 : SW - 2 * SIDE;
      const kind = theme.hazard === 'lava' ? HAZ.LAVA : rng.chance(0.5) ? HAZ.WATER : HAZ.POISON;
      let ok = true;
      for (let z = cz; z < cz + h; z++) for (let x = cx; x < cx + w; x++) { const i = g.idx(x, z); if (!g.type[i] || (g.flags[i] & (F.OBSTACLE | F.BRIDGE | F.START | F.NOSPAWN)) || kind === 0) ok = false; }
      if (!ok) continue;
      // keep a 1-cell lane open on one side so the street is never cut
      for (let z = cz; z < cz + h; z++) for (let x = cx; x < cx + w; x++) {
        const i = g.idx(x, z);
        const laneKeep = vertical ? x === cx : z === cz;
        if (laneKeep) continue;
        g.floor[i] = -2.4; g.flags[i] |= F.PIT | F.HAZARD | F.NOSPAWN; g.hazType[i] = kind;
        g.floorTex[i] = kind === HAZ.LAVA ? TS.LAVA : kind === HAZ.POISON ? TS.POISON : TS.WATER;
        g.wallTex[i] = TS.ROCK;
      }
      // broken asphalt rim
      for (let z = cz - 1; z <= cz + h; z++) for (let x = cx - 1; x <= cx + w; x++) { const i = g.idx(x, z); if (g.type[i] && !(g.flags[i] & F.PIT)) g.wallTex[i] = TS.ROCK; }
      if (kind === HAZ.LAVA) deco.light(cx + w / 2, -1, cz + h / 2, [1, 0.5, 0.2], 6, { flicker: true });
    }
    // rubble piles on sidewalks / in plazas
    for (let k = 0; k < Math.floor(W * H * 0.004 * ruin); k++) {
      const x = rng.int(2, W - 3), z = rng.int(2, H - 3);
      if (!deco.cellFree(x, z) || !(g.flags[g.idx(x, z)] & F.OUTDOOR)) continue;
      const f = g.floor[g.idx(x, z)];
      deco.box(x + 0.1, f, z + 0.1, x + 0.9, f + rng.float(0.3, 0.8), z + 0.9, TS.ROCK, { solid: true });
      if (rng.chance(0.5)) deco.box(x + 0.3, f, z + 0.25, x + 1.1, f + 0.35, z + 0.75, TS.SIDE, {});
    }
  }
}
