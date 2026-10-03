// Shared layout engine for natural levels: caves, canyons, mountains,
// deserts and swamps (see gen_caves.js / gen_canyon.js / gen_mountain.js
// for the skins).
//
// A level is a graph of big irregular open areas ("chambers": caverns,
// canyon basins, mountain terraces, dune hollows, swamp islands) joined by
// wide 3-5 cell passages ("tunnels": cave tunnels, canyon throats, trails,
// plank bridges over gorges, boardwalks over toxic marsh):
//  - a spanning tree from the start area (skins can bias it into a chain),
//    the boss area joins last as a leaf with a single entrance, plus loops
//    inside each key zone
//  - every area sits at its own height; a passage that climbs gets a real
//    flight of steps (inside the passage, or built out of its mouth into
//    the lower area) with hand rails
//  - gate walls with one doorway in passages on the start -> boss path are
//    the chokepoints for keyed doors
//  - areas get landforms (railed ledges, plateaus, sunken bowls, lakes with
//    islands and bridges, chasms crossed by bridges, spike pits) and props
//  - the space between areas is rock (cliffs), void (clouds / abyss) or a
//    toxic marsh, chosen by the skin
// Every surface and object uses the texture role that fits it.
import { TS, F, OPP, DIR_X, DIR_Z, SKY_H, newGrid, encloseBorder, clamp, quant } from './common.js';
import { Deco } from './deco.js';
import { tfbm } from '../../art/pixel.js';
import {
  natStyle, findFlight, applyFlight, railDrops, sinkPit, layBridge, gateWall, fillUnreachable, neighbors4, isGround,
  snapCells, restoreCells, rockSpike, rockColumn,
} from './natural.js';

const DIRV = (dx, dz) => (dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 2 : 3);

export function buildNatural(rng, theme, depth, skin) {
  const S = Object.assign(natStyle(theme), skin.style ? skin.style(theme) : {});
  const fam = S.family;
  const { W, H } = skin.size(rng, depth);
  const N = W * H;
  const wallTop = skin.wallTop ?? 18;
  const g = newGrid(W, H, wallTop);
  const deco = new Deco(g, { ...theme, railStyle: S.rail }, rng);
  const seed = rng.int(0, 99999);
  const nz = (x, z, s, k = 0, o = 2) => tfbm(x / s, z / s, 64, seed + k, o);
  const idx = (x, z) => z * W + x;
  const ch = [], tunnels = [];
  const owner = new Int16Array(N).fill(-1);
  const tmask = new Int16Array(N).fill(-1);
  const tidx = new Int16Array(N).fill(-1);
  const resv = new Uint8Array(N);      // flights, landings, gates (+ margins)
  const X = { g, deco, rng, S, fam, W, H, N, nz, idx, ch, tunnels, owner, tmask, resv, theme, depth, skin };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = idx(x, z);
    g.wallTex[i] = skin.rockTex ? skin.rockTex(X, x, z) : nz(x, z, 9, 5, 3) > 0.58 ? TS.WALL2 : TS.WALL;
    g.floorTex[i] = skin.capTex ?? TS.ROCK;
  }

  // ------------------------------------------------------------ chambers
  X.addChamber = (cx, cz, r, role, o = {}) => {
    const c = {
      id: ch.length, cx, cz, r, ex: o.ex ?? rng.float(0.86, 1.14), ez: 1, role, cells: [], h: 0, zone: 0, alive: true,
      tunnels: [], entries: [], mouth: new Set(), spine: [], feature: 'plain', chain: o.chain ?? -1,
    };
    c.ez = o.ez ?? 2 - c.ex;
    ch.push(c);
    return c;
  };
  X.gapOf = (cx, cz, r, k = 1.24) => {
    let g0 = Infinity;
    for (const c of ch) g0 = Math.min(g0, Math.hypot(c.cx - cx, c.cz - cz) - (c.r + r) * k);
    return g0;
  };
  // best-candidate packing: each new area goes where it leaves the smallest
  // (but sufficient) rock gap to its neighbours: short passages, big spaces
  X.pack = (want, radii, o = {}) => {
    const minGap = o.gap ?? 3.5, k = o.k ?? 1.24;
    for (let round = 0; round < (o.rounds ?? 60) && ch.length < want; round++) {
      let best = null;
      for (let t = 0; t < 70; t++) {
        const r = rng.weighted(radii, (e) => e[1])[0];
        const cx = rng.int(r + 3, W - r - 4), cz = rng.int(r + 3, H - r - 4);
        if (o.ok && !o.ok(cx, cz, r)) continue;
        const gp = X.gapOf(cx, cz, r, k);
        if (gp < minGap) continue;
        const s = gp + rng.float(0, 3) - r * 0.3;
        if (!best || s < best.s) best = { s, cx, cz, r };
      }
      if (best) X.addChamber(best.cx, best.cz, best.r, o.role || 'cave');
    }
  };
  // a winding chain of areas from the start to the boss (canyons, climbs):
  // each step heads roughly toward `target` with a random meander
  X.chain = (o) => {
    const rS = o.rStart ?? 6;
    let cur = X.addChamber(o.sx ?? rS + 3, o.sz ?? rng.int(rS + 5, H - rS - 6), rS, 'start', { chain: 0 });
    const list = [cur];
    let ang = Math.atan2(o.tz - cur.cz, o.tx - cur.cx);
    for (let k = 1; k <= o.n; k++) {
      let placed = null;
      for (const last of k === o.n ? [true] : [false, true]) {
        for (const r of last ? [o.rBoss, o.rBoss - 1, o.rBoss - 2] : [rng.weighted(o.radii, (e) => e[1])[0]]) {
          let best = null;
          for (let t = 0; t < 40; t++) {
            const a = ang + rng.float(-o.meander, o.meander);
            const dist = (cur.r + r) * 1.24 + rng.float(o.gap0 ?? 3.6, o.gap1 ?? 6);
            const cx = cur.cx + Math.cos(a) * dist, cz = cur.cz + Math.sin(a) * dist;
            if (cx < r + 3 || cz < r + 3 || cx > W - r - 4 || cz > H - r - 4) continue;
            if (X.gapOf(cx, cz, r) < 3.5) continue;
            const toT = Math.atan2(o.tz - cz, o.tx - cx);
            const s = -Math.abs(Math.atan2(Math.sin(a - toT), Math.cos(a - toT))) * (o.pull ?? 0.8) - Math.abs(a - ang) * 0.5 + rng.float(0, 1.2);
            if (!best || s > best.s) best = { s, cx, cz, a };
          }
          if (best) { placed = { ...best, r, last }; break; }
        }
        if (placed) break;
      }
      if (!placed) throw new Error('natural: chain stuck');
      cur = X.addChamber(placed.cx, placed.cz, placed.r, placed.last ? 'boss' : 'cave', { chain: k });
      ang = placed.a;
      list.push(cur);
      if (placed.last) break;
    }
    const boss = list[list.length - 1];
    ch.splice(ch.indexOf(boss), 1);
    ch.splice(1, 0, boss);
    X.chainLen = list.length;
    return list;
  };
  if (skin.place) skin.place(X);
  else {
    const rS = rng.int(6, 7);
    X.addChamber(rS + 3, rng.int(rS + 4, H - rS - 5), rS, 'start');
    const rB = Math.min(rng.int(9, 11), Math.floor(H / 2) - 5);
    X.addChamber(W - rB - 4, rng.int(rB + 4, H - rB - 5), rB, 'boss');
    X.pack(clamp(Math.round(N / 400), 8, 16), [[5, 1.2], [6, 3], [7, 3], [8, 2.5], [9, 1.5], [10, 0.8]]);
  }
  ch.forEach((c, k) => { c.id = k; });
  for (const c of ch) {
    const R = c.r, wob = skin.wobble ? skin.wobble(c) : c.role === 'cave' ? 0.36 : 0.26;
    for (let z = Math.floor(c.cz - R * 1.5); z <= Math.ceil(c.cz + R * 1.5); z++) for (let x = Math.floor(c.cx - R * 1.5); x <= Math.ceil(c.cx + R * 1.5); x++) {
      if (x < 2 || z < 2 || x > W - 3 || z > H - 3) continue;
      const dx = (x + 0.5 - c.cx) / c.ex, dz = (z + 0.5 - c.cz) / c.ez;
      const d = Math.hypot(dx, dz) / R + (nz(x, z, 5, 11) - 0.5) * wob;
      const i = idx(x, z);
      if (d < 1 && owner[i] < 0) { owner[i] = c.id; c.cells.push(i); }
    }
    c.ci = idx(Math.floor(c.cx), Math.floor(c.cz));
    if (owner[c.ci] !== c.id) { owner[c.ci] = c.id; c.cells.push(c.ci); }
  }

  // ------------------------------------------------------------ tunnels
  function pathPoints(ax, az, bx, bz, shape, mid) {
    const pts = [[ax, az]];
    let x = ax, z = az;
    const goX = (tx) => { while (x !== tx) { x += Math.sign(tx - x); pts.push([x, z]); } };
    const goZ = (tz) => { while (z !== tz) { z += Math.sign(tz - z); pts.push([x, z]); } };
    if (shape === 'xz') { goX(bx); goZ(bz); } else if (shape === 'zx') { goZ(bz); goX(bx); } else if (shape === 'xzx') { goX(mid); goZ(bz); goX(bx); } else { goZ(mid); goX(bx); goZ(bz); }
    return pts;
  }
  function crossCells(t, k, ea = 0, eb = 0) {
    const [px, pz] = t.pts[k];
    const out = [];
    const ds = [];
    if (k > 0) ds.push(t.dir[k - 1]);
    if (k < t.pts.length - 1 && !ds.includes(t.dir[k])) ds.push(t.dir[k]);
    for (const d of ds) {
      const ax = d < 2;
      for (let o = -t.a - ea; o <= t.b + eb; o++) out.push(ax ? [px, pz + o] : [px + o, pz]);
    }
    return out;
  }
  const collinear = (t, k0, k1) => { for (let k = k0; k < k1; k++) if (t.dir[k] !== t.dir[k0]) return false; return k0 >= 0 && k1 < t.pts.length; };
  const crossAll = (t, ka, kb, pred) => {
    for (let k = ka; k <= kb; k++) for (const [x, z] of crossCells(t, k)) { if (!g.in(x, z) || !pred(idx(x, z))) return false; }
    return true;
  };
  const ownerPt = (t, k) => owner[idx(t.pts[k][0], t.pts[k][1])];
  const TW = skin.tunnelWidths || [3, 3, 4, 4, 4, 5];
  function planTunnel(A, B, o = {}) {
    const tw = o.tw ?? rng.pick(TW);
    const a = Math.floor((tw - 1) / 2), b = tw - 1 - a;
    let best = null;
    for (const sh of rng.shuffle(['xz', 'zx', 'xzx', 'zxz'])) {
      const mid = sh === 'xzx' ? Math.round(A.cx + (B.cx - A.cx) * rng.float(0.35, 0.65)) : Math.round(A.cz + (B.cz - A.cz) * rng.float(0.35, 0.65));
      const pts = pathPoints(Math.floor(A.cx), Math.floor(A.cz), Math.floor(B.cx), Math.floor(B.cz), sh, mid);
      if (pts.length < 3) continue;
      const dir = [];
      for (let k = 0; k < pts.length - 1; k++) dir.push(DIRV(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]));
      const t = { A, B, pts, dir, tw, a, b };
      let lastA = -1, firstB = pts.length;
      for (let k = 0; k < pts.length; k++) if (ownerPt(t, k) === A.id) lastA = k;
      for (let k = pts.length - 1; k >= 0; k--) if (ownerPt(t, k) === B.id) firstB = k;
      const k0 = lastA + 1, k1 = firstB - 1;
      if (lastA < 0 || firstB >= pts.length || k1 - k0 + 1 < (o.minCore ?? 3)) continue;
      let ok = true;
      for (let k = 0; k < pts.length && ok; k++) for (const [x, z] of crossCells(t, k)) {
        if (x < 2 || z < 2 || x > W - 3 || z > H - 3) { ok = false; break; }
        const i = idx(x, z);
        const own = owner[i];
        if (own === A.id || own === B.id) continue;
        if (own >= 0 || tmask[i] >= 0) { ok = false; break; }
        for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) {
          const j = idx(x + dx, z + dz);
          if ((owner[j] >= 0 && owner[j] !== A.id && owner[j] !== B.id) || tmask[j] >= 0) { ok = false; break; }
        }
      }
      if (!ok) continue;
      let straight = 0, run = 1;
      for (let k = k0 + 1; k < k1; k++) { run = dir[k] === dir[k - 1] ? run + 1 : 1; straight = Math.max(straight, run); }
      if (o.minStraight && straight < o.minStraight) continue;
      const score = (k1 - k0) + (sh.length - 2) * 3 - straight * 0.3 + rng.float(0, 3);
      if (!best || score < best.score) best = { ...t, k0, k1, score };
    }
    return best;
  }
  function claim(t) {
    t.id = tunnels.length;
    tunnels.push(t);
    t.cells = [];
    for (let k = 0; k < t.pts.length; k++) for (const [x, z] of crossCells(t, k)) {
      const i = idx(x, z);
      if (owner[i] >= 0 || tmask[i] >= 0) continue;
      tmask[i] = t.id; tidx[i] = k; t.cells.push(i);
    }
    t.A.tunnels.push(t); t.B.tunnels.push(t);
    t.fs = t.pts.length; t.fn = 0; t.gk = -1;
    t.kind = skin.tunnelKind ? skin.tunnelKind(X, t) : 'tunnel';
  }

  // spanning tree (Prim) from the start; the boss joins last as a leaf
  const pairs = [];
  for (let i = 0; i < ch.length; i++) for (let j = i + 1; j < ch.length; j++) {
    const d = Math.hypot(ch[i].cx - ch[j].cx, ch[i].cz - ch[j].cz);
    if (d < ch[i].r + ch[j].r + (skin.pairRange ?? 30)) pairs.push({ a: i, b: j, d, cost: skin.pairCost ? skin.pairCost(X, ch[i], ch[j], d) : d });
  }
  const inTree = new Set([0]);
  const tree = [];
  for (let guard = 0; guard < 400 && inTree.size < ch.length; guard++) {
    let best = null;
    for (const allowBoss of [false, true]) {
      for (const p of pairs) {
        if (p.failed) continue;
        const ia = inTree.has(p.a), ib = inTree.has(p.b);
        if (ia === ib) continue;
        const nw = ia ? p.b : p.a, old = ia ? p.a : p.b;
        if (old === 1 || (nw === 1 && !allowBoss)) continue;
        const s = p.cost * rng.float(0.85, 1.2);
        if (!best || s < best.s) best = { p, s, nw, old };
      }
      if (best) break;
    }
    if (!best) break;
    const t = planTunnel(ch[best.old], ch[best.nw], best.nw === 1 ? { minCore: skin.bossCore ?? 6, minStraight: 4 } : {});
    if (!t) { best.p.failed = true; continue; }
    claim(t);
    t.parent = best.old; t.child = best.nw;
    inTree.add(best.nw);
    tree.push(t);
  }
  if (!inTree.has(1)) throw new Error('natural: boss area could not be connected');
  for (const c of ch) if (!inTree.has(c.id)) { c.alive = false; for (const i of c.cells) owner[i] = -1; c.cells = []; }

  // ------------------------------------------------------------ zones + gates
  const parentT = new Map(tree.map((t) => [t.child, t]));
  const path = [];
  for (let c = 1; parentT.has(c); c = parentT.get(c).parent) path.unshift(parentT.get(c));
  function planGate(t, late) {
    const cands = [];
    for (let k = t.k0 + 1; k <= t.k1 - 1; k++) {
      if (t.kind !== 'tunnel' && k > t.k0 + 2 && k < t.k1 - 2) continue;   // bridgeheads only
      if (!collinear(t, k - 1, k + 1)) continue;
      if (!crossAll(t, k - 1, k + 1, (i) => owner[i] < 0 && tmask[i] === t.id)) continue;
      cands.push(k);
    }
    if (!cands.length) return -1;
    return cands[Math.min(cands.length - 1, Math.floor(cands.length * (late ? rng.float(0.6, 0.95) : rng.float(0.35, 0.75))))];
  }
  const maxGates = depth <= 1 ? 1 : depth <= 4 ? 2 : 3;
  const gates = [];
  if (path.length) {
    const bt = path[path.length - 1];
    bt.gk = planGate(bt, true);
    if (bt.gk >= 0) gates.push(bt);
    const mids = rng.shuffle(path.slice(1, -1));
    for (const t of mids) {
      if (gates.length >= maxGates) break;
      t.gk = planGate(t, false);
      if (t.gk >= 0) gates.push(t);
    }
  }
  const gateSet = new Set(gates);
  ch[0].zone = 0;
  for (const t of tree) ch[t.child].zone = ch[t.parent].zone + (gateSet.has(t) ? 1 : 0);
  X.path = path;

  // ------------------------------------------------------------ heights + flights
  function planFlight(t, ha, hb) {
    const dh = hb - ha;
    if (Math.abs(dh) < 0.01) return { fs: t.pts.length, fn: 0 };
    const n = Math.ceil(Math.abs(dh) / 0.6 - 1e-6);
    const free = (i) => !resv[i];
    const avoidGate = (s) => t.gk < 0 || s + n + 1 < t.gk - 1 || s - 2 > t.gk + 1;
    const cands = [];
    for (let s = t.k0 + 1; s + n <= t.k1; s++) {
      if (!collinear(t, s - 1, s + n) || !avoidGate(s)) continue;
      if (!crossAll(t, s, s + n - 1, (i) => owner[i] < 0 && tmask[i] === t.id && free(i))) continue;
      // bridges climb at their ends (a flight onto the deck), not mid-span
      const mid = s + n / 2 - (t.k0 + t.k1) / 2;
      cands.push({ fs: s, fn: n, mode: 'in', score: rng.float(0, 1) - Math.abs(mid) * (t.kind === 'tunnel' ? 0.1 : -0.4) });
    }
    if (dh > 0) {
      const s = t.k0 - n;
      if (s - 1 >= 0 && collinear(t, s - 1, t.k0) && ownerPt(t, s - 1) === t.A.id && crossAll(t, s - 1, t.k0 - 1, (i) => owner[i] === t.A.id && free(i)))
        cands.push({ fs: s, fn: n, mode: 'outA', score: rng.float(0.2, 1.4) });
    } else {
      const s = t.k1 + 1;
      if (s + n < t.pts.length && collinear(t, t.k1, s + n) && ownerPt(t, s + n) === t.B.id && crossAll(t, s, s + n, (i) => owner[i] === t.B.id && free(i)))
        cands.push({ fs: s, fn: n, mode: 'outB', score: rng.float(0.2, 1.4) });
    }
    if (!cands.length) return null;
    cands.sort((p, q) => q.score - p.score);
    return cands[0];
  }
  function reserveFlight(t) {
    if (!t.fn) return;
    for (let k = t.fs - 1; k <= t.fs + t.fn; k++) {
      if (k < 0 || k >= t.pts.length) continue;
      for (const [x, z] of crossCells(t, k, 1, 1)) if (g.in(x, z)) resv[idx(x, z)] = 1;
    }
  }
  const DH = skin.dh || (theme.params?.flat ? [0] : [0, 0, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, -3.0, 3.6, -3.6]);
  const [hMin, hMax] = skin.hRange || [-4.8, 6.6];
  for (const t of tree) {
    const P = ch[t.parent], C = ch[t.child];
    let opts;
    if (skin.targetH) {
      const T = skin.targetH(X, C, P);
      opts = rng.shuffle([...DH]).map((dh) => [dh, Math.abs(P.h + dh - T) + rng.float(0, 0.5)]).sort((p, q) => p[1] - q[1]).map((e) => e[0]);
    } else {
      opts = C.id === 1 ? [rng.pick([0, -1.8, -2.4, 1.8]), 0] : rng.shuffle([...DH]);
      if (P.h > 3) opts.sort((p, q) => p - q); else if (P.h < -3) opts.sort((p, q) => q - p);
    }
    opts.push(0);
    for (const dh of opts) {
      const hb = P.h + dh;
      if (hb < hMin || hb > hMax) continue;
      const fl = planFlight(t, P.h, hb);
      if (!fl) continue;
      C.h = hb; t.ha = P.h; t.hb = hb;
      Object.assign(t, fl);
      reserveFlight(t);
      break;
    }
  }
  for (const t of gates) for (let k = t.gk - 1; k <= t.gk + 1; k++) for (const [x, z] of crossCells(t, k, 1, 1)) resv[idx(x, z)] = 1;

  // loops inside a zone (never into the boss area)
  const linked = new Set(tree.map((t) => Math.min(t.parent, t.child) * 1000 + Math.max(t.parent, t.child)));
  let loops = 0;
  for (const p of rng.shuffle(pairs.slice())) {
    if (loops >= Math.round(ch.length * (skin.loops ?? 0.35))) break;
    const A = ch[p.a], B = ch[p.b];
    if (!A.alive || !B.alive || A.id === 1 || B.id === 1 || A.zone !== B.zone || linked.has(p.a * 1000 + p.b)) continue;
    if (p.d > A.r + B.r + 22) continue;
    const t = planTunnel(A, B, { minCore: 4 });
    if (!t) continue;
    t.gk = -1;
    const fl = planFlight(t, A.h, B.h);
    if (!fl) continue;
    claim(t);
    t.ha = A.h; t.hb = B.h; Object.assign(t, fl);
    t.loop = true;
    reserveFlight(t);
    linked.add(p.a * 1000 + p.b);
    loops++;
  }

  // irregular passage walls (never next to flights or gates; not on bridges)
  for (const t of tunnels) {
    if (skin.rough === false || t.kind !== 'tunnel') break;
    for (let k = t.k0; k <= t.k1; k++) {
      if (k >= t.fs - 2 && k <= t.fs + t.fn + 1) continue;
      if (t.gk >= 0 && Math.abs(k - t.gk) <= 2) continue;
      if (k === 0 || k >= t.pts.length - 1 || t.dir[k] !== t.dir[k - 1]) continue;
      const [px, pz] = t.pts[k];
      const ax = t.dir[k] < 2;
      for (const side of [-1, 1]) {
        if (nz(px, pz, 3.5, 31 + side * 7) < 0.55) continue;
        const o = side < 0 ? -t.a - 1 : t.b + 1;
        const x = ax ? px : px + o, z = ax ? pz + o : pz;
        if (x < 3 || z < 3 || x > W - 4 || z > H - 4) continue;
        const i = idx(x, z);
        if (owner[i] >= 0 || tmask[i] >= 0) continue;
        let ok = true;
        for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) {
          const j = idx(x + dx, z + dz);
          if ((owner[j] >= 0 && owner[j] !== t.A.id && owner[j] !== t.B.id) || (tmask[j] >= 0 && tmask[j] !== t.id)) { ok = false; break; }
        }
        if (!ok) continue;
        tmask[i] = t.id; tidx[i] = k; t.cells.push(i);
      }
    }
  }

  // ------------------------------------------------------------ write the grid
  const baseLight = theme.light ?? 0.6, lightVar = theme.lightVar ?? 0.25;
  const lightAt = (x, z, k = 1) => clamp((baseLight + (nz(x, z, 10, 21) - 0.5) * lightVar * 2) * k, 0.15, 1.1);
  X.lightAt = lightAt;
  const ceilT = S.ceilT ?? TS.CEIL;
  const floorT = (x, z, c) => (skin.floorTex ? skin.floorTex(X, x, z, c) : nz(x, z, 6, 3) > 0.58 ? TS.FLOOR2 : TS.FLOOR);
  for (const c of ch) {
    if (!c.alive) continue;
    c.sky = skin.chamberSky ? skin.chamberSky(X, c) : c.role === 'start' ? false : c.role === 'boss' ? rng.chance(S.sky * 0.7) : rng.chance(S.sky);
    c.cMax = c.role === 'boss' ? rng.pick([12, 13, 14]) : clamp(5 + c.r * 0.9 + rng.float(0, 2), 7, 14);
    c.cMin = rng.float(4.5, 5.5);
    c.cellSet = new Set(c.cells);
    for (const i of c.cells) {
      const x = i % W, z = (i / W) | 0;
      const dn = Math.min(1, Math.hypot((x + 0.5 - c.cx) / c.ex, (z + 0.5 - c.cz) / c.ez) / c.r);
      const ceil = c.h + Math.max(4, quant(c.cMin + (c.cMax - c.cMin) * (1 - dn * dn) + (nz(x, z, 4, 41) - 0.5) * 1.4, 0.5));
      g.open(x, z, c.h, ceil, {
        sky: c.sky, light: c.sky ? Math.max(0.85, lightAt(x, z)) : lightAt(x, z), floorTex: floorT(x, z, c),
        ceilTex: ceilT, wallTex: TS.WALL, region: c.id, flags: c.sky ? F.OUTDOOR : 0,
      });
    }
  }
  const tSky = !!skin.tunnelSky;
  for (const t of tunnels) {
    for (const i of t.cells) {
      const x = i % W, z = (i / W) | 0, k = tidx[i];
      const h = k < t.fs ? t.ha : k >= t.fs + t.fn ? t.hb : Math.max(t.ha, t.hb);
      const ceil = h + quant(3.9 + nz(x, z, 5, 51) * 1.8, 0.5);
      g.open(x, z, h, ceil, {
        sky: tSky, light: tSky ? Math.max(0.85, lightAt(x, z)) : lightAt(x, z, 0.85), floorTex: skin.trailTex ?? floorT(x, z, null),
        ceilTex: ceilT, wallTex: TS.WALL, region: 100 + t.id, flags: tSky ? F.OUTDOOR : 0,
      });
    }
  }
  // flights
  for (const t of tunnels) {
    if (!t.fn) continue;
    const fwd = t.hb > t.ha;
    const d = t.dir[Math.min(t.fs, t.dir.length - 1)];
    const up = fwd ? d : OPP[d];
    const lowK = fwd ? t.fs : t.fs + t.fn - 1;
    const [px, pz] = t.pts[lowK];
    const ax = d < 2;
    const fx = ax ? px : px - t.a, fz = ax ? pz - t.a : pz;
    const cells = deco.stairs(fx, fz, up, t.tw, Math.min(t.ha, t.hb), Math.max(t.ha, t.hb), {
      rise: Math.abs(t.hb - t.ha) / t.fn, floorTex: S.tread, sideTex: S.stairSide, style: S.rail, sky: tSky,
    });
    for (const i of cells) g.flags[i] |= F.NOSPAWN;
    t.stairCells = cells;
  }
  // gate walls
  for (const t of gates) {
    const k = t.gk;
    const line = crossCells(t, k).map(([x, z]) => idx(x, z));
    const door = idx(t.pts[k][0], t.pts[k][1]);
    const d = t.dir[k];
    gateWall(g, deco, line, door, {
      wallTex: S.gateTex, frameTex: S.frameTex, axis: d < 2 ? 'x' : 'z', torch: S.torch, facing: d === 0 || d === 2 ? -1 : 1,
      ceilTex: S.gateCeil ?? TS.WOOD, capTex: S.gateCap, height: S.gateH,
    });
    t.door = door;
    if (skin.dressGate) skin.dressGate(X, t, line, door);
  }
  // entries (chamber cells where passages arrive), mouths and spines
  for (const t of tunnels) {
    const ends = [[t.A, t.k0 - 1, -1], [t.B, t.k1 + 1, 1]];
    for (const [c, kIn, stp] of ends) {
      let entry = idx(t.pts[kIn][0], t.pts[kIn][1]);
      if (t.mode === 'outA' && c === t.A) entry = idx(t.pts[t.fs - 1][0], t.pts[t.fs - 1][1]);
      if (t.mode === 'outB' && c === t.B) entry = idx(t.pts[t.fs + t.fn][0], t.pts[t.fs + t.fn][1]);
      c.entries.push(entry);
      for (let s = 0; s < 3; s++) {
        const k = kIn + stp * s;
        if (k < 0 || k >= t.pts.length) break;
        for (const [x, z] of crossCells(t, k, 1, 1)) { const i = idx(x, z); if (owner[i] === c.id) c.mouth.add(i); }
      }
      for (let k = kIn; k >= 0 && k < t.pts.length; k += -stp) {
        const i = idx(t.pts[k][0], t.pts[k][1]);
        if (owner[i] === c.id) c.spine.push([i, t.dir[Math.min(k, t.dir.length - 1)]]);
      }
    }
  }
  for (const c of ch) if (c.alive) c.spineSet = new Set(c.spine.map(([i]) => i));

  // ------------------------------------------------------------ bridges over gorges / boardwalks over marsh
  const nearArea = (i) => {
    const x = i % W, z = (i / W) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const j = idx(x + dx, z + dz); if (owner[j] >= 0) return true; }
    return false;
  };
  for (const t of tunnels) {
    if (t.kind === 'tunnel') continue;
    const deckK = [];
    for (let k = t.k0 + 1; k <= t.k1 - 1; k++) {
      if (t.fn && k >= t.fs - 1 && k <= t.fs + t.fn) continue;
      if (t.gk >= 0 && Math.abs(k - t.gk) <= 1) continue;
      deckK.push(k);
    }
    if (deckK.length < 2) { t.kind = 'tunnel'; continue; }
    const deck = [], gorge = new Set();
    const gw = skin.gorgeWidth ?? 3;
    for (const k of deckK) {
      for (const [x, z] of crossCells(t, k)) { const i = idx(x, z); if (g.type[i] && tmask[i] === t.id && !(g.flags[i] & (F.STAIR | F.DOOR))) deck.push(i); }
      const [px, pz] = t.pts[k];
      const ds = [];
      if (k > 0) ds.push(t.dir[k - 1]);
      if (k < t.dir.length && !ds.includes(t.dir[k])) ds.push(t.dir[k]);
      for (const d of ds) {
        const ax = d < 2;
        for (let o = -t.a - gw; o <= t.b + gw; o++) {
          if (o >= -t.a && o <= t.b) continue;
          const x = ax ? px : px + o, z = ax ? pz + o : pz;
          if (x < 2 || z < 2 || x > W - 3 || z > H - 3) continue;
          const i = idx(x, z);
          if (g.type[i] || owner[i] >= 0 || tmask[i] >= 0 || nearArea(i)) continue;
          gorge.add(i);
        }
      }
    }
    const y = g.floor[deck[0]];
    const alongZ = t.dir[deckK[0]] >= 2;
    if (t.kind === 'bridge') {
      for (const i of gorge) {
        g.open(i % W, (i / W) | 0, -30, SKY_H, { sky: true, floorTex: TS.PITWALL, wallTex: TS.ROCK, flags: F.VOID | F.NOSPAWN | F.OUTDOOR, region: -3, light: lightAt(i % W, (i / W) | 0) });
      }
      layBridge(g, deco, deck, y, { deck: S.deck, under: S.under, style: S.rail, railTex: S.railTex, alongZ, posts: false });
    } else {
      // boardwalk over a toxic marsh: the marsh lies a little below the deck
      const md = skin.marshDepth ?? 2.2;
      for (const i of gorge) g.open(i % W, (i / W) | 0, y, SKY_H, { sky: true, floorTex: TS.FLOOR, wallTex: TS.ROCK, flags: F.OUTDOOR, region: -3, light: lightAt(i % W, (i / W) | 0) });
      for (const i of deck) { g.floor[i] = y; }
      sinkPit(g, deco, [...gorge, ...deck], S.marsh || 'poison', md, { base: y, lightEvery: 9 });
      layBridge(g, deco, deck, y, { deck: S.deck, under: S.under, style: S.rail, railTex: S.railTex, alongZ, posts: true, bottom: y - md });
    }
    t.deck = deck;
    t.gorge = gorge;
  }

  // ------------------------------------------------------------ surroundings
  // distance + height of the nearest open cell for every solid cell
  const hNear = new Float32Array(N), dNear = new Int16Array(N).fill(-1);
  {
    const q = [];
    for (let i = 0; i < N; i++) if (g.type[i] && !(g.flags[i] & F.VOID)) { dNear[i] = 0; hNear[i] = g.floor[i]; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const a = q[h];
      for (const b of neighbors4(g, a)) {
        if (dNear[b] >= 0 || g.type[b]) continue;
        dNear[b] = dNear[a] + 1; hNear[b] = hNear[a]; q.push(b);
      }
    }
  }
  X.hNear = hNear; X.dNear = dNear;
  if (skin.surround) skin.surround(X);
  else for (let i = 0; i < N; i++) if (!g.type[i]) g.floor[i] = wallTop;

  // ------------------------------------------------------------ feature library
  const markFree = (c, i) => !resv[i] && !c.mouth.has(i) && g.type[i] && Math.abs(g.floor[i] - c.h) < 0.01 && !(g.flags[i] & (F.STAIR | F.DOOR | F.PIT | F.HAZARD | F.VOID | F.BRIDGE | F.WATER | F.OBSTACLE));
  const nearBad = (c, i) => { for (const j of [i, ...neighbors4(g, i)]) if (resv[j] || c.mouth.has(j)) return true; return false; };
  const onSpine = (c, i) => c.spineSet.has(i);
  const polar = (c, i) => {
    const x = (i % W) + 0.5 - c.cx, z = ((i / W) | 0) + 0.5 - c.cz;
    return { dn: Math.hypot(x / c.ex, z / c.ez) / c.r, ang: Math.atan2(z, x) };
  };
  const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  // keep only cells that belong to a full 2x2 block of the set (no 1-wide slivers)
  function chunky(set) {
    const keep = new Set();
    for (const i of set) {
      for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const a = i + ox + oz * W;
        if (set.has(a) && set.has(a + 1) && set.has(a + W) && set.has(a + W + 1)) { keep.add(i); break; }
      }
    }
    return keep;
  }
  function largest(set) {
    const seen = new Set();
    let best = new Set();
    for (const s of set) {
      if (seen.has(s)) continue;
      const comp = new Set([s]); seen.add(s);
      const st = [s];
      while (st.length) {
        const a = st.pop();
        for (const b of neighbors4(g, a)) if (set.has(b) && !seen.has(b)) { seen.add(b); comp.add(b); st.push(b); }
      }
      if (comp.size > best.size) best = comp;
    }
    return best;
  }
  function chamberOK(c) {
    const ent = c.entries.filter((e) => g.type[e]);
    const set = c.cellSet;
    const startC = ent[0] ?? c.ci;
    const dist = g.bfs([startC], { blocked: (b) => !set.has(b), avoid: F.OBSTACLE });
    for (const e of ent) if (dist[e] < 0) return false;
    let walk = 0, reach = 0;
    for (const i of c.cells) {
      if (!g.type[i] || (g.flags[i] & (F.PIT | F.VOID | F.OBSTACLE | F.HAZARD))) continue;
      walk++; if (dist[i] >= 0) reach++;
    }
    return reach >= walk * 0.8;
  }
  // lift (dy > 0) or sink (dy < 0) a set of chamber cells to a new level
  function setLevel(c, T, dy, tex = TS.ROCK) {
    for (const i of T) {
      g.floor[i] = c.h + dy;
      g.wallTex[i] = tex;
      if (!g.sky[i]) g.ceil[i] = Math.max(g.ceil[i], c.h + Math.max(0, dy) + 3.8);
    }
  }
  // stair flights joining two levels of one chamber
  function linkLevels(c, lowCells, highCells, nF, o = {}) {
    const reg = new Int32Array(N).fill(-1);
    for (const i of lowCells) reg[i] = 0;
    for (const i of highCells) reg[i] = 1;
    const regs = [{ id: 0, cells: [...lowCells] }, { id: 1, cells: [...highCells] }];
    const lock = new Uint8Array(N);
    for (const i of c.cells) if (resv[i] || c.mouth.has(i)) lock[i] = 1;
    let made = 0;
    for (let k = 0; k < nF; k++) {
      const P = findFlight(g, reg, 0, 1, regs, { rng, lock, widths: o.widths || [3, 2], maxN: 7, carveBonus: o.carveBonus });
      if (!P) break;
      const cells = applyFlight(g, deco, P, { lock, tread: S.tread, side: o.side ?? S.cliffTex ?? TS.ROCK, style: S.rail });
      for (const i of cells) reg[i] = -1;
      made++;
    }
    return made;
  }
  const baseCells = (c, except) => c.cells.filter((i) => !except.has(i) && isGround(g, i) && Math.abs(g.floor[i] - c.h) < 0.01);
  const rails = (cells, o = {}) => railDrops(g, deco, cells, { style: S.rail, tex: S.railTex, ...o });
  // a 2-wide straight run of cells from (x,z) in direction d while inside `area`
  function lineThrough(area, x, z, d, skip, y) {
    const out = [];
    const lat = d < 2 ? W : 1;
    let cx = x, cz = z;
    for (let k = 0; k < 40; k++) {
      cx += DIR_X[d]; cz += DIR_Z[d];
      if (!g.in(cx, cz)) return null;
      const i = idx(cx, cz);
      if (skip && skip.has(i)) continue;
      if (!area.has(i)) return out.length && g.type[i] && (y === undefined || Math.abs(g.floor[i] - y) < 0.01) && !(g.flags[i] & (F.PIT | F.VOID | F.HAZARD)) ? { cells: out, end: i } : null;
      out.push(i);
      if (area.has(i + lat)) out.push(i + lat); else return null;
    }
    return null;
  }
  const blob = (c, lim, k, wob = 0.25, inside = true) => {
    const T = new Set();
    for (const i of c.cells) {
      const p = polar(c, i);
      const v = p.dn + (nz(i % W, (i / W) | 0, 3, k) - 0.5) * wob;
      if ((inside ? v < lim : v > lim) && markFree(c, i) && !nearBad(c, i)) T.add(i);
    }
    return largest(chunky(T));
  };
  const hazKinds = () => S.hazards.filter((k) => k !== 'spikes');
  const L = {
    markFree, nearBad, onSpine, polar, angDiff, chunky, largest, chamberOK, setLevel, linkLevels, baseCells, rails, lineThrough, blob, hazKinds,
    prop: (c, i, small, big) => skin.prop && skin.prop(X, L, c, i, small, big),
    centrepiece: (c, T, island) => skin.centrepiece && skin.centrepiece(X, L, c, T, island),
    dressTop: (c, T, chance) => {
      for (const i of T) {
        if (!rng.chance(chance) || !deco.cellInterior(i % W, (i / W) | 0)) continue;
        L.prop(c, i, true, false);
      }
    },
    column: (x, z, y, top, r, sky) => {
      if (sky) rockSpike(deco, x, z, y, rng.float(3, 6), r, S.spikeTex ?? TS.ROCK, { solid: true, segs: 4 });
      else rockColumn(deco, x, z, y, top, r, S.spikeTex ?? TS.ROCK);
    },
  };
  X.L = L;

  const FEATURES = {
    // raised rock shelf along the outer wall (in a sector without passage mouths)
    ledge(c) {
      if (c.r < 6) return false;
      const mouths = c.entries.map((e) => polar(c, e).ang);
      for (let t = 0; t < 14; t++) {
        const a0 = rng.float(-Math.PI, Math.PI), span = rng.float(1.5, 3.2);
        if (mouths.some((m) => angDiff(m, a0) < span / 2 + 0.4)) continue;
        const th = rng.float(0.42, 0.6);
        let T = new Set();
        for (const i of c.cells) {
          const p = polar(c, i);
          if (angDiff(p.ang, a0) < span / 2 && p.dn + (nz(i % W, (i / W) | 0, 3, 81) - 0.5) * 0.25 > th && markFree(c, i) && !nearBad(c, i)) T.add(i);
        }
        T = largest(chunky(T));
        if (T.size < 12) continue;
        const up = rng.pick(skin.ledgeUp || [1.8, 2.4, 3.0, 3.6]);
        setLevel(c, T, up, S.cliffTex ?? TS.ROCK);
        if (!linkLevels(c, baseCells(c, T), T, rng.chance(0.4) ? 2 : 1)) return false;
        rails(T);
        L.dressTop(c, T, 0.08);
        c.upper = T;
        return true;
      }
      return false;
    },
    // raised plateau in the middle
    mesa(c) {
      if (c.r < 6) return false;
      const T = blob(c, rng.float(0.34, 0.5), 83);
      if (T.size < 9) return false;
      setLevel(c, T, rng.pick(skin.mesaUp || [1.2, 1.8, 2.4, 3.0]), S.cliffTex ?? TS.ROCK);
      if (!linkLevels(c, baseCells(c, T), T, rng.chance(0.5) ? 2 : 1, { carveBonus: 0.5 })) return false;
      rails(T);
      L.centrepiece(c, T, false);
      c.upper = T;
      return true;
    },
    // sunken floor (a bowl) with stairs down and a railed rim
    bowl(c) {
      if (c.r < 6) return false;
      const lim = rng.float(0.45, 0.62);
      const T = blob(c, lim, 85);
      if (T.size < 16) return false;
      setLevel(c, T, -rng.pick([1.8, 2.4, 3.0]), TS.PITWALL);
      for (const i of c.cells) if (!T.has(i) && neighbors4(g, i).some((j) => T.has(j))) g.wallTex[i] = S.cliffTex ?? TS.ROCK;
      const rest = baseCells(c, T);
      if (!linkLevels(c, [...T], rest, rng.chance(0.5) ? 2 : 1)) return false;
      rails(rest);
      const inner = [...T].filter((i) => deco.cellInterior(i % W, (i / W) | 0));
      const kinds = hazKinds();
      if (inner.length > 10 && kinds.length && rng.chance(0.5)) {
        const pool = [...T].filter((i) => polar(c, i).dn < lim * 0.45 && isGround(g, i) && !nearBad(c, i));
        if (pool.length >= 4) sinkPit(g, deco, pool, rng.pick(kinds), 0.35, { lightEvery: 5 });
      } else {
        for (let k = 0; k < 3 && inner.length; k++) {
          const i = inner.splice(rng.int(0, inner.length - 1), 1)[0];
          if (!deco.cellInterior(i % W, (i / W) | 0)) continue;
          L.column((i % W) + 0.5, ((i / W) | 0) + 0.5, g.floor[i], g.ceil[i], rng.float(0.45, 0.7), !!g.sky[i]);
        }
      }
      c.lower = T;
      return true;
    },
    // lava / poison / water lake; deep ones get an island and railed bridges
    lake(c) {
      if (c.r < 5) return false;
      const kinds = hazKinds();
      const kind = kinds.length ? rng.pick(kinds) : 'water';
      const deep = kind !== 'water' || rng.chance(0.75);
      const depthL = deep ? rng.pick([2.2, 2.8, 3.4]) : 0.45;
      const area = blob(c, rng.float(0.55, 0.74), 71, 0.3);
      if (area.size < 14) return false;
      const island = new Set(), bridges = new Set();
      const cx = Math.floor(c.cx), cz = Math.floor(c.cz);
      if (deep) {
        if (rng.chance(0.65) && area.size > 40) {
          const ir = rng.float(1.2, 2.0);
          for (const i of area) if (Math.hypot((i % W) + 0.5 - c.cx, ((i / W) | 0) + 0.5 - c.cz) < ir) island.add(i);
          if (island.size < 4) island.clear();
        }
        // bridges toward the passage mouths (from the island, or straight across)
        const dirs = rng.shuffle([0, 1, 2, 3]);
        const entryDir = (e) => { const dx = (e % W) - cx, dz = ((e / W) | 0) - cz; return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3); };
        const wantDirs = [...new Set(c.entries.map(entryDir))];
        dirs.sort((a, b) => (wantDirs.includes(b) ? 1 : 0) - (wantDirs.includes(a) ? 1 : 0));
        let nb = 0;
        const maxB = island.size ? rng.int(1, 2) : 1;
        for (const d of dirs) {
          if (nb >= maxB) break;
          if (island.size) {
            const Ln = lineThrough(area, cx, cz, d, island, c.h);
            if (!Ln || Ln.cells.length < 2) continue;
            for (const i of Ln.cells) bridges.add(i);
            nb++;
          } else {
            const A = lineThrough(area, cx, cz, d, null, c.h), B = lineThrough(area, cx + DIR_X[d], cz + DIR_Z[d], OPP[d], null, c.h);
            if (!A || !B) continue;
            for (const i of [...A.cells, ...B.cells]) bridges.add(i);
            nb++;
          }
        }
        if (island.size && !nb) island.clear();
      }
      const lake = [...area].filter((i) => !island.has(i) && !bridges.has(i));
      sinkPit(g, deco, lake, kind, depthL, { base: c.h });
      if (bridges.size) {
        const alongZ = [...bridges].some((i) => bridges.has(i + W) && !bridges.has(i + 1));
        layBridge(g, deco, [...bridges], c.h, { deck: S.deck, under: S.under, style: S.rail, railTex: S.railTex, alongZ, bottom: c.h - depthL });
      }
      if (deep) rails(c.cells.filter((i) => !area.has(i) || island.has(i)));
      if (island.size) L.centrepiece(c, island, true);
      // falls pouring from the roof into the lake
      if (!c.sky && deep) {
        let n = 0;
        for (const i of lake) {
          if (n >= 2 || !rng.chance(0.06)) continue;
          const x = i % W, z = (i / W) | 0;
          if (neighbors4(g, i).some((j) => g.flags[j] & F.BRIDGE)) continue;
          const tex = kind === 'lava' ? TS.LAVA : kind === 'poison' ? TS.POISON : TS.WATER;
          deco.box(x + 0.3, g.floor[i], z + 0.3, x + 0.7, g.ceil[i], z + 0.7, tex, { emissive: kind === 'water' ? 0.25 : 1, s: 2 });
          if (kind !== 'water') deco.light(x + 0.5, c.h + 1.5, z + 0.5, kind === 'lava' ? [1, 0.45, 0.15] : [0.45, 1, 0.3], 7, { pulse: true });
          n++;
        }
      }
      c.lake = { kind, area, island, deep };
      if (skin.dressLake) skin.dressLake(X, L, c);
      return true;
    },
    // a chasm across the area (bottomless, spikes, lava or poison) with bridges
    chasm(c) {
      if (c.r < 6) return false;
      const kinds = skin.chasmKinds ? skin.chasmKinds(X) : ['void', 'spikes', 'spikes', ...(S.hazards.includes('lava') ? ['lava', 'lava'] : []), ...(S.hazards.includes('poison') ? ['poison'] : [])];
      const kind = rng.pick(kinds);
      const hw = rng.pick([1, 1, 2]);
      let best = null;
      for (const axisX of rng.shuffle([true, false])) {
        for (let off = -3; off <= 3; off++) {
          const line = Math.floor(axisX ? c.cx : c.cz) + off;
          const band = new Set();
          let bad = false;
          for (const i of c.cells) {
            const v = axisX ? i % W : (i / W) | 0;
            const wob = Math.round((nz(i % W, (i / W) | 0, 4, 91) - 0.5) * 2);
            if (Math.abs(v - line - wob) > hw) continue;
            if (c.mouth.has(i) || resv[i] || nearBad(c, i)) { bad = true; break; }
            if (markFree(c, i)) band.add(i);
          }
          if (bad || band.size < 10) continue;
          const s = band.size - Math.abs(off) * 2 + rng.float(0, 4);
          if (!best || s > best.s) best = { s, band, axisX, line };
        }
      }
      if (!best) return false;
      const { band, axisX } = best;
      const bridges = new Set();
      const cc = Math.floor(axisX ? c.cz : c.cx);
      const spots = [cc];
      if (c.r >= 8 && rng.chance(0.6)) spots.push(cc + rng.pick([-1, 1]) * rng.int(4, 5));
      for (const i of band) {
        const v = axisX ? (i / W) | 0 : i % W;
        if (spots.some((s) => v === s || v === s + 1)) bridges.add(i);
      }
      const pit = [...band].filter((i) => !bridges.has(i));
      if (kind === 'void') {
        for (const i of pit) {
          g.flags[i] |= F.VOID | F.NOSPAWN; g.floor[i] = -30; g.floorTex[i] = TS.PITWALL; g.wallTex[i] = TS.PITWALL;
          for (const j of neighbors4(g, i)) if (g.type[j] && !band.has(j)) g.wallTex[j] = S.cliffTex ?? TS.PITWALL;
        }
      }
      const pd = kind === 'spikes' ? rng.pick([2.4, 3]) : 3.2;
      if (kind !== 'void') sinkPit(g, deco, pit, kind, pd, { base: c.h });
      layBridge(g, deco, [...bridges], c.h, { deck: S.deck, under: S.under, style: S.rail, railTex: S.railTex, alongZ: axisX, posts: kind !== 'void', bottom: c.h - pd });
      rails(c.cells.filter((i) => !band.has(i)));
      return true;
    },
    // a few small spike-pit traps
    spikes(c) {
      let made = 0;
      for (let k = 0; k < 16 && made < 3; k++) {
        const w = rng.int(2, 3), h = rng.int(2, 3);
        const i0 = rng.pick(c.cells), x0 = i0 % W, z0 = (i0 / W) | 0;
        const cells = [];
        let ok = true;
        for (let z = z0; z < z0 + h && ok; z++) for (let x = x0; x < x0 + w; x++) {
          const i = idx(x, z);
          if (!c.cellSet.has(i) || !markFree(c, i) || nearBad(c, i) || onSpine(c, i)) { ok = false; break; }
          cells.push(i);
        }
        if (!ok) continue;
        sinkPit(g, deco, cells, 'spikes', 1.6, { base: g.floor[cells[0]] });
        made++;
      }
      return made > 0;
    },
    pillars(c) {
      const n = Math.max(2, Math.round(c.cells.length / 45));
      let made = 0;
      for (let k = 0; k < n * 6 && made < n; k++) {
        const i = rng.pick(c.cells), x = i % W, z = (i / W) | 0;
        if (!deco.cellInterior(x, z) || nearBad(c, i) || onSpine(c, i)) continue;
        if (skin.pillar) skin.pillar(X, L, c, i);
        else L.column(x + 0.5, z + 0.5, g.floor[i], g.ceil[i], rng.float(0.45, 0.8), !!g.sky[i]);
        made++;
      }
      return made > 0;
    },
    grove(c) {
      let made = 0;
      const n = Math.max(3, Math.round(c.cells.length / (skin.groveDensity ?? 30)));
      for (let k = 0; k < n * 5 && made < n; k++) {
        const i = rng.pick(c.cells), x = i % W, z = (i / W) | 0;
        if (!deco.cellInterior(x, z) || nearBad(c, i) || onSpine(c, i)) continue;
        L.prop(c, i, false, true);
        made++;
      }
      if (skin.afterGrove) skin.afterGrove(X, L, c);
      return made > 0;
    },
    ...(skin.features ? skin.features(X, L) : {}),
  };
  function ringOf(c) {
    const out = new Set();
    for (const i of c.cells) { out.add(i); for (const j of neighbors4(g, i)) out.add(j); }
    return [...out];
  }
  function tryFeature(c, f) {
    if (!FEATURES[f]) return false;
    const snap = snapCells(g, ringOf(c));
    const m = deco.mark();
    let ok = false;
    try { ok = FEATURES[f](c); } catch (e) { ok = false; if (globalThis.DBG) console.log('feature err', f, e.stack); }
    if (ok && chamberOK(c)) return true;
    deco.rollback(m); restoreCells(g, snap);
    return false;
  }
  X.tryFeature = tryFeature;

  // one major landform per area (spread evenly over the level) + a minor layer
  const majorW = skin.majorW ? skin.majorW(X) : { ledge: 2.2, mesa: 1.6, bowl: 1.4, lake: 2.4, chasm: 1.8, spikes: 0.8 };
  const used = {};
  for (const f of Object.keys(majorW)) used[f] = 0;
  for (const c of ch) {
    if (!c.alive || c.role !== 'cave') continue;
    const opts = Object.keys(majorW).map((f) => [f, majorW[f] / (1 + used[f] * 1.5) * (c.r < 6 && f !== 'lake' && f !== 'spikes' ? 0.1 : 1)]).filter((e) => e[1] > 0);
    const order = [];
    while (opts.length) {
      const p = rng.weighted(opts, (e) => e[1]);
      order.push(p[0]);
      opts.splice(opts.indexOf(p), 1);
    }
    for (const f of order) if (tryFeature(c, f)) { c.feature = f; used[f]++; break; }
    if (c.r >= 9 && c.feature !== 'plain') {
      for (const f of rng.shuffle([...(skin.second || ['ledge', 'spikes', 'mesa'])])) if (f !== c.feature && tryFeature(c, f)) { c.feature2 = f; break; }
    }
    const minor = skin.minor || ['pillars', 'grove', 'spikes'];
    tryFeature(c, rng.pick(minor));
    for (const [f, p] of skin.extra || []) if (rng.chance(p)) tryFeature(c, f);
    if (globalThis.DBG) console.log('area', c.id, c.r, c.h, c.feature, c.feature2 || '');
  }

  // ------------------------------------------------------------ dressing
  const start = ch[0], boss = ch[1];
  if (skin.dressStart) skin.dressStart(X, L, start);
  if (skin.dressBoss) skin.dressBoss(X, L, boss);
  if (skin.dressTunnel) for (const t of tunnels) skin.dressTunnel(X, L, t, crossCells);
  if (skin.dressChamber) for (const c of ch) if (c.alive) skin.dressChamber(X, L, c);

  // guard rails on every remaining dangerous drop (passage mouths, gorges...)
  const walkCells = [];
  for (let i = 0; i < N; i++) if (g.type[i] && !(g.flags[i] & (F.VOID | F.PIT))) walkCells.push(i);
  rails(walkCells);

  encloseBorder(g);
  if (skin.finish) skin.finish(X);
  const startIdx = idx(Math.floor(start.cx), Math.floor(start.cz));
  g.flags[startIdx] &= ~(F.HAZARD | F.PIT | F.OBSTACLE);
  fillUnreachable(g, startIdx, { top: wallTop, keep: skin.keepCell ? (i) => skin.keepCell(X, i) : undefined });
  const dist = g.bfs([startIdx], { avoid: F.OBSTACLE });
  const bossIdx = idx(Math.floor(boss.cx), Math.floor(boss.cz));
  if (dist[bossIdx] < 0) throw new Error('natural: boss unreachable');
  const arena = boss.cells.filter((i) => g.type[i] && !(g.flags[i] & (F.PIT | F.VOID)));
  for (const i of arena) g.flags[i] |= F.ARENA;
  return {
    grid: g, deco, start: { x: Math.floor(start.cx), z: Math.floor(start.cz) }, arenaCells: arena, noFortify: true,
    boss: { x: boss.cx, z: boss.cz }, voidY: skin.voidY ?? -30, startYaw: skin.startYaw ? skin.startYaw(X) : undefined,
  };
}
