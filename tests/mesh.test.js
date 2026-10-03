// Mesh sanity: every quad's winding must agree with its stored normal (back-face
// culling is on), no NaNs, stairs/bridges/spikes/boxes/bars all build.
import { Grid, F, HAZ } from '../src/game/grid.js';
import { buildWorldMesh } from '../src/game/worldmesh.js';
import { Deco } from '../src/game/levelgen/deco.js';
import { TS, SLOT_COUNT } from '../src/game/levelgen/common.js';

const slots = Array.from({ length: SLOT_COUNT }, (_, k) => ({ layer: k, emissive: 0, scroll: 0, uvScale: k === TS.FACADE ? 2 : 1 }));

export function checkMesh(mesh, label) {
  const v = mesh.verts, idx = mesh.indices;
  let bad = 0, nan = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 12, b = idx[t + 1] * 12, c = idx[t + 2] * 12;
    for (const o of [a, b, c]) for (let k = 0; k < 12; k++) if (!Number.isFinite(v[o + k])) nan++;
    const e1 = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]];
    const e2 = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const area = Math.hypot(...n);
    if (area < 1e-9) continue; // degenerate (triangle as quad)
    const dot = (n[0] * v[a + 5] + n[1] * v[a + 6] + n[2] * v[a + 7]) / area;
    if (dot < 0.2) bad++;
  }
  if (bad || nan) throw new Error(`${label}: ${bad} triangles wound against their normal, ${nan} NaN values`);
  return idx.length / 3;
}

function testLevel() {
  const g = new Grid(24, 20);
  g.floor.fill(6);
  for (let z = 1; z < 19; z++) for (let x = 1; x < 23; x++) g.open(x, z, 0, 8, { floorTex: TS.FLOOR, wallTex: TS.WALL, ceilTex: TS.CEIL });
  // mezzanine at height 3 along the north side, reached by stairs in each direction
  for (let z = 1; z < 5; z++) for (let x = 1; x < 23; x++) { const i = g.idx(x, z); g.floor[i] = 3; g.wallTex[i] = TS.SIDE; }
  const d = new Deco(g, { railStyle: 'metal' }, { int: (a) => a, pick: (a) => a[0], chance: () => true });
  d.stairs(4, 9, 3, 2, 0, 3);            // climbing -z into the mezzanine
  d.stairs(18, 5, 2, 2, 3, 0);           // descending +z
  d.stairs(10, 12, 0, 2, 0, 1.2);        // +x
  d.stairs(14, 15, 1, 1, 0, 1.2);        // -x
  // pit with spikes + bridge
  for (let z = 10; z < 14; z++) for (let x = 15; x < 21; x++) g.open(x, z, -2.5, 8, { floorTex: TS.SPIKES, haz: HAZ.SPIKES, flags: F.PIT | F.HAZARD, wallTex: TS.PITWALL });
  for (let x = 15; x < 21; x++) g.open(x, 12, 0, 8, { floorTex: TS.GRATE, wallTex: TS.GRATE, flags: F.BRIDGE });
  const mezz = []; for (let z = 1; z < 5; z++) for (let x = 1; x < 23; x++) mezz.push(g.idx(x, z));
  d.railEdges(mezz);
  const bridge = []; for (let x = 15; x < 21; x++) bridge.push(g.idx(x, 12));
  d.railEdges(bridge, { style: 'iron' });
  const all = []; for (let i = 0; i < g.w * g.h; i++) if (g.type[i]) all.push(i);
  d.wallTrims(all, { wainscot: 1.1 });
  d.pillar(8.5, 16.5, 0.6, 0, 8);
  d.crateStack(3.5, 17.5, 0);
  d.console(12, 17, 0, 2);
  d.lightPanel(6, 6, 8, 7, 8);
  d.streetLamp(2.5, 7.5, 0);
  d.car(5, 14, 0, true);
  d.table(9, 6, 0);
  d.window(1, 8, 1, 1, 2.5);
  return { g, d };
}

const { g, d } = testLevel();
const deco = d.result();
const mesh = buildWorldMesh(g, slots, { deco });
const tris = checkMesh(mesh, 'test level');
// stairs and edges
let stairs = 0, edges = 0;
for (let i = 0; i < g.w * g.h; i++) { if (g.stairDir[i]) stairs++; if (g.edge[i]) edges++; }
if (stairs < 10) throw new Error('stairs not created');
if (edges < 10) throw new Error('rail edges not set');
// stair physics: floor rises smoothly
const si = g.idx(4, 9);
const f0 = g.floorAtPos(si, 4.5, 9.99), f1 = g.floorAtPos(si, 4.5, 9.01);
if (!(f1 > f0)) throw new Error('stair floorAtPos does not climb toward -z');
// reachability: mezzanine reachable from the ground via stairs; rails block falling paths only
const start = g.idx(6, 17);
const dist = g.bfs([start]);
if (dist[g.idx(10, 2)] < 0) throw new Error('mezzanine not reachable by stairs');
console.log(`mesh OK: ${tris} triangles, ${deco.boxes.length} boxes, ${deco.bars.length} bars, ${deco.colliders.length} colliders, ${stairs} stair cells`);
