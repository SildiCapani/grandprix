import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sculpt } from '../game/sculpt.js';
import { person } from '../game/critters.js';
import { createScenery } from './scenery.js';
import { footprintDistance, overlapsHeight } from './collision.js';
import { createLandmarks } from './landmarks.js';

// Apex-Insel: the open world of the story mode. One big island (about 1.6 × 1.6 km) with seven zones,
// a road network, a harbour city, a volcano with a crater, a glacier with a frozen lake, a jungle, a canyon and a beach.
// Everything the car drives on comes from one baked height grid, so the physics and the picture always agree.
//   createIsland() → { group, ground(x,z), surface(x,z), zoneAt(x,z), nearestRoad(x,z), collide(body), update(dt,t,cam), mapCanvas, … }

export const SEA = 0;
const HALF = 900, STEP = 4, N = HALF * 2 / STEP + 1;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const ZONES = [
  { id: 'city', name: 'Port Apex', x: 0, z: 470, r: 250, color: '#ff6a3d' },
  { id: 'beach', name: 'Sonnenküste', x: 470, z: 420, r: 190, color: '#ffd04a' },
  { id: 'canyon', name: 'Rostcanyon', x: 560, z: -60, r: 250, color: '#e0703a' },
  { id: 'volcano', name: 'Glutberg', x: 300, z: -470, r: 250, color: '#ff3a1a' },
  { id: 'glacier', name: 'Frostgipfel', x: -470, z: -450, r: 280, color: '#8ad8ff' },
  { id: 'jungle', name: 'Smaragdwald', x: -500, z: 170, r: 260, color: '#3ad070' },
  { id: 'plains', name: 'Mittelland', x: 0, z: 0, r: 330, color: '#a8e05a' },
];
const ZI = Object.fromEntries(ZONES.map((z, i) => [z.id, i]));
export const VOLCANO = { x: 300, z: -470, rim: 72, R: 280, lavaR: 20 };
VOLCANO.rimH = 215 * Math.pow(1 - VOLCANO.rim / VOLCANO.R, 1.22) + 12; VOLCANO.floor = VOLCANO.rimH - 14;
export const LAKE = { x: -240, z: -250, r: 66, y: 24 };
// open spaces kept free of trees and houses (boss arenas)
export const CLEARINGS = [{ x: LAKE.x, z: LAKE.z, r: LAKE.r + 14 }, { x: 444, z: 528, r: 60 }, { x: -505, z: 235, r: 48 }, { x: 300, z: -470, r: 90 }];

// ---------- noise ----------
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return lerp(lerp(hash(i, j), hash(i + 1, j), su), lerp(hash(i, j + 1), hash(i + 1, j + 1), su), sv) * 2 - 1;
}
export function fbm(x, z, oct = 4) { let s = 0, a = .5, f = 1; for (let k = 0; k < oct; k++) { s += vnoise(x * f + k * 17.3, z * f - k * 9.1) * a; a *= .5; f *= 2.03; } return s; }
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

// ---------- raw heights per zone ----------
const zoneH = {
  city: (x, z) => 5 + fbm(x * .02, z * .02, 2) * .4,
  beach: (x, z) => 2.4 + Math.max(0, fbm(x * .018, z * .018, 3)) * 5,
  canyon: (x, z) => {
    const m = fbm(x * .0075 + 3, z * .0075 - 2, 4), h = 9 + 54 * smooth(.0, .13, m), s = 7, f = h / s - Math.floor(h / s);
    return Math.floor(h / s) * s + Math.pow(f, 4) * s + fbm(x * .05, z * .05, 2) * .8;
  },
  volcano: (x, z) => {
    const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z), rim = VOLCANO.rim;
    if (d < rim - 10) return VOLCANO.floor + Math.max(0, d - (rim - 26)) * .9 + fbm(x * .05, z * .05, 2) * .6;
    const cone = 215 * Math.pow(Math.max(0, 1 - d / VOLCANO.R), 1.22) + 12;
    return cone + fbm(x * .03, z * .03, 3) * 4 * smooth(rim, rim + 40, d);
  },
  glacier: (x, z) => {
    const d = Math.hypot(x - ZONES[4].x, z - ZONES[4].z), mask = Math.max(0, 1 - d / 300), rid = 1 - Math.abs(fbm(x * .006, z * .006, 4) * 2);
    return 24 + 160 * Math.pow(mask, 1.35) * (.5 + .5 * rid) + fbm(x * .03, z * .03, 3) * 3;
  },
  jungle: (x, z) => 16 + fbm(x * .009, z * .009, 4) * 22 + fbm(x * .04, z * .04, 2) * 2,
  plains: (x, z) => 10 + fbm(x * .006 + 7, z * .006, 4) * 12,
};
const W8 = new Float32Array(ZONES.length);
function rawHeight(x, z) {
  let sw = .02, sh = .02 * 10;
  for (let i = 0; i < ZONES.length; i++) {
    const Z = ZONES[i], d = Math.hypot(x - Z.x, z - Z.z) / Z.r, w = Math.exp(-d * d * 1.7);
    W8[i] = w; if (w < 1e-4) continue; sw += w; sh += w * zoneH[Z.id](x, z);
  }
  let h = sh / sw;
  // frozen lake in the glacier foothills
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z); if (dl < LAKE.r + 30) h = lerp(LAKE.y, h, smooth(LAKE.r - 6, LAKE.r + 30, dl));
  // coast
  const dist = Math.hypot(x, z), th = Math.atan2(z, x);
  const coastR = 770 + 45 * Math.sin(3 * th + .7) + 28 * Math.sin(5 * th + 2) + 22 * fbm(Math.cos(th) * 3, Math.sin(th) * 3, 3) + 30 * Math.exp(-Math.pow((th - Math.PI / 2) / .32, 2)) + 25 * Math.exp(-Math.pow((th - .85) / .3, 2));
  h = lerp(h, -30, smooth(coastR - 45, coastR + 35, dist));
  return h;
}
export function zoneAt(x, z) {
  let best = 6, bw = -1;
  for (let i = 0; i < ZONES.length; i++) { const Z = ZONES[i], d = Math.hypot(x - Z.x, z - Z.z) / Z.r, w = Math.exp(-d * d * 1.7) * (i === 6 ? .8 : 1); if (w > bw) { bw = w; best = i; } }
  return ZONES[best];
}

// ---------- roads ----------
function catmull(points, closed, step = 2) {
  const P = points.map(([x, z]) => new THREE.Vector3(x, 0, z)), c = new THREE.CatmullRomCurve3(P, closed, 'centripetal');
  const n = Math.max(8, Math.round(c.getLength() / step)); return c.getSpacedPoints(n).slice(0, closed ? n : n + 1).map(v => ({ x: v.x, z: v.z }));
}
function spiral() {
  // up the volcano: 1.6 turns from the foot to the crater rim
  const pts = [], a0 = Math.atan2(-190 - VOLCANO.z, 480 - VOLCANO.x), r0 = Math.hypot(480 - VOLCANO.x, -190 - VOLCANO.z);
  for (let k = 0; k <= 44; k++) { const f = k / 44, a = a0 + f * TAU * 1.25, r = lerp(r0, VOLCANO.rim + 9, Math.pow(f, .6)); pts.push([VOLCANO.x + Math.cos(a) * r, VOLCANO.z + Math.sin(a) * r]); }
  const e = pts[pts.length - 1], a = Math.atan2(e[1] - VOLCANO.z, e[0] - VOLCANO.x); pts.push([VOLCANO.x + Math.cos(a) * 50, VOLCANO.z + Math.sin(a) * 50]);
  return pts;
}
export const ROAD_DEFS = [
  { id: 'ring', w: 15, closed: true, pts: [[-230, 560], [0, 612], [230, 585], [430, 525], [590, 385], [665, 160], [672, -60], [610, -230], [480, -190], [300, -160], [130, -250], [-40, -420], [-300, -560], [-540, -430], [-650, -170], [-662, 60], [-600, 262], [-470, 420]] },
  { id: 'avenue', w: 14, pts: [[0, 612], [0, 430], [0, 220], [10, 0], [60, -150], [130, -250]] },
  { id: 'west', w: 12, pts: [[10, 0], [-200, 50], [-420, 140], [-600, 262]] },
  { id: 'east', w: 12, pts: [[10, 0], [220, -25], [400, -95], [540, -30], [672, -60]] },
  { id: 'glacier', w: 12, pts: [[-200, 50], [-200, -120], [-160, -250], [-230, -420], [-300, -560]] },
  { id: 'volcano', w: 12, pts: spiral() },
  { id: 'city1', w: 11, pts: [[-232, 470], [-110, 470], [0, 470], [110, 470], [235, 480]] },
  { id: 'city2', w: 10, pts: [[-110, 380], [-110, 470], [-110, 560], [-120, 640]] },
  { id: 'city3', w: 10, pts: [[110, 385], [110, 470], [110, 560], [115, 600]] },
  { id: 'docks', w: 11, pts: [[-250, 650], [-120, 662], [0, 668], [120, 660], [260, 640]] },
  { id: 'beach', w: 10, pts: [[290, 560], [380, 575], [470, 545], [540, 490], [600, 420]] },
  { id: 'jungle', w: 10, closed: true, pts: [[-420, 140], [-470, 30], [-560, -40], [-620, 40], [-580, 170], [-480, 215]] },
];

export function createIsland() {
  const group = new THREE.Group(); group.name = 'Apex-Insel';
  const r = rng(424242), updaters = [];
  // what the map draws on top of the terrain: trees, roofs, small things, landmarks
  const marks = { trees: [], houses: [], dots: [], pois: [], roofs: [] };

  // ----- raw height grid -----
  const RAW = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) RAW[j * N + i] = rawHeight(-HALF + i * STEP, -HALF + j * STEP);
  const rawAt = (x, z) => { const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j; return lerp(lerp(RAW[j * N + i], RAW[j * N + i + 1], u), lerp(RAW[(j + 1) * N + i], RAW[(j + 1) * N + i + 1], u), v); };

  // ----- roads: samples with a smoothed height, bridges where the land drops below the sea -----
  const roads = ROAD_DEFS.map(def => {
    const pts = catmull(def.pts, !!def.closed), n = pts.length;
    // in the canyon the roads stay on the valley floor and cut through the mesas (walls on both sides)
    let ys = pts.map(p => { const h = rawAt(p.x, p.z); return zoneAt(p.x, p.z).id === 'canyon' ? Math.min(h, 12) : h; });
    for (let pass = 0; pass < 3; pass++) { const R = pass === 2 ? 4 : 14, out = new Float32Array(n); for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let q = -R; q <= R; q++) { let m = k + q; if (def.closed) m = (m + n) % n; else if (m < 0 || m >= n) continue; s += ys[m]; c++; } out[k] = s / c; } ys = Array.from(out); }
    for (let k = 0; k < n; k++) { const p = pts[k], a = pts[(k + 1) % n], b = pts[(k - 1 + n) % n], A = def.closed || k < n - 1 ? a : p, B = def.closed || k > 0 ? b : p;
      p.y = Math.max(ys[k], 2.6); p.bridge = rawAt(p.x, p.z) < 1.2; p.angle = Math.atan2(A.x - B.x, A.z - B.z); p.nx = Math.cos(p.angle); p.nz = -Math.sin(p.angle); }
    return { ...def, pts, hw: def.w / 2 };
  });
  // join road ends onto the road they meet (same height at junctions)
  const samples = []; roads.forEach((rd, ri) => rd.pts.forEach((p, k) => samples.push({ p, rd, k })));
  const CELL = 16, roadGrid = new Map(), key = (i, j) => i * 100003 + j;
  for (const s of samples) { const k = key(Math.floor(s.p.x / CELL), Math.floor(s.p.z / CELL)); if (!roadGrid.has(k)) roadGrid.set(k, []); roadGrid.get(k).push(s); }
  function nearestRoad(x, z, reach = 30) {
    let best = null, bd = 1e9; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), R = Math.ceil(reach / CELL);
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { const l = roadGrid.get(key(ci + i, cj + j)); if (!l) continue; for (const s of l) { const d = Math.hypot(s.p.x - x, s.p.z - z) - s.rd.hw; if (d < bd) { bd = d; best = s; } } }
    if (!best) return null;
    const { p, rd } = best, side = (x - p.x) * p.nx + (z - p.z) * p.nz;
    return { d: bd, dist: bd + rd.hw, y: p.y, x: p.x, z: p.z, angle: p.angle, nx: p.nx, nz: p.nz, side, road: rd, k: best.k, bridge: p.bridge };
  }
  // where two roads meet, the smaller one takes the height of the bigger one near the junction
  for (const rd of roads) for (const p of rd.pts) {
    let ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL);
    let near = null, nd = 1e9;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const s of roadGrid.get(key(ci + i, cj + j)) || []) if (s.rd !== rd && s.rd.w > rd.w - .1 && roads.indexOf(s.rd) < roads.indexOf(rd)) {
      const d = Math.hypot(s.p.x - p.x, s.p.z - p.z); if (d < nd) { nd = d; near = s; }
    }
    if (near && nd < near.rd.hw + 30) p.y = lerp(near.p.y, p.y, smooth(near.rd.hw * .5, near.rd.hw + 30, nd));
  }

  // ----- bake: the final height grid with the roads cut / filled in -----
  // every road sample stamps the grid vertices around it: nearest road (height, distance) and the lowest road that covers the vertex,
  // so the ground stays under the asphalt on slopes and where two roads of different height meet
  const H = new Float32Array(N * N), ROADD = new Float32Array(N * N).fill(99), RY = new Float32Array(N * N), RB = new Uint8Array(N * N), LOW = new Float32Array(N * N).fill(1e9);
  for (const rd of roads) for (const p of rd.pts) {
    const R = 34 + rd.hw, i0 = Math.max(0, Math.floor((p.x - R + HALF) / STEP)), i1 = Math.min(N - 1, Math.ceil((p.x + R + HALF) / STEP)), j0 = Math.max(0, Math.floor((p.z - R + HALF) / STEP)), j1 = Math.min(N - 1, Math.ceil((p.z + R + HALF) / STEP));
    for (let j = j0; j <= j1; j++) { const dz = -HALF + j * STEP - p.z; for (let i = i0; i <= i1; i++) { const dx = -HALF + i * STEP - p.x, d = Math.sqrt(dx * dx + dz * dz) - rd.hw; if (d > 34) continue; const k = j * N + i;
      if (d < ROADD[k]) { ROADD[k] = d; RY[k] = p.y; RB[k] = p.bridge ? 1 : 0; } if (d < 1 && !p.bridge && p.y < LOW[k]) LOW[k] = p.y; } }
  }
  for (let k = 0; k < N * N; k++) { let h = RAW[k]; if (ROADD[k] < 34 && !RB[k]) h = lerp(RY[k] - .3, h, smooth(2.5, 18, ROADD[k])); if (LOW[k] < 1e8) h = Math.min(h, LOW[k] - .3); H[k] = h; }
  const terrainAt = (x, z) => { const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j; return lerp(lerp(H[j * N + i], H[j * N + i + 1], u), lerp(H[(j + 1) * N + i], H[(j + 1) * N + i + 1], u), v); };

  // ----- ramps (wedges): stunt park, jumps along roads -----
  const ramps = [];
  function ramp(x, z, angle, len = 10, w = 7, h = 3.2, kind = 'ramp') {
    const y = terrainAt(x, z); ramps.push({ x, z, angle, len, w, h, y, kind }); return ramps[ramps.length - 1];
  }
  // stunt park in the plains
  const SP = { x: 210, z: 170 };
  [[0, 0, 0, 12, 8, 3.6], [40, -10, .8, 12, 8, 4.4], [-30, 35, -1.2, 10, 7, 3], [20, 60, 2.6, 14, 9, 5.5], [-50, -30, 1.9, 10, 7, 3.2], [70, 40, -2.2, 12, 8, 4], [-10, -70, .3, 16, 10, 6.5]].forEach(([dx, dz, a, l, w, h]) => ramp(SP.x + dx, SP.z + dz, a, l, w, h));
  // jumps on the roads (the car flies over the next stretch)
  function roadRamp(roadId, f, h = 2.6, len = 9) { const rd = roads.find(q => q.id === roadId), p = rd.pts[Math.floor(f * (rd.pts.length - 1))]; const R = ramp(p.x - Math.sin(p.angle) * len / 2, p.z - Math.cos(p.angle) * len / 2, p.angle, len, rd.w * .6, h); R.y = p.y; return R; }
  [[400, 470, .6, 10, 7, 3], [520, 440, -.8, 12, 8, 3.8], [440, 400, 2.2, 10, 7, 3.2]].forEach(([x, z, a, l, w, h]) => ramp(x, z, a, l, w, h));
  roadRamp('east', .55, 2.8); roadRamp('ring', .32, 2.4); roadRamp('jungle', .5, 2.4); roadRamp('west', .4, 2.2); roadRamp('ring', .78, 2.6);
  const rampHeight = (x, z) => {
    let best = -1e9;
    for (const R of ramps) {
      const dx = x - R.x, dz = z - R.z, sa = Math.sin(R.angle), ca = Math.cos(R.angle), u = dx * sa + dz * ca, v = dx * ca - dz * sa;
      if (u < -R.len / 2 || u > R.len / 2 || Math.abs(v) > R.w / 2) continue;
      const f = (u + R.len / 2) / R.len, hh = R.y + R.h * f * f * .4 + R.h * f * .6; if (hh > best) best = hh;
    }
    return best;
  };

  // ----- ground and surface -----
  function ground(x, z) {
    const nr = nearestRoad(x, z, 24);
    let y = nr && nr.d < 0 && nr.bridge ? nr.y : terrainAt(x, z);
    if (nr && nr.d < 0 && !nr.bridge) y = Math.max(y, nr.y - .05);
    const rh = rampHeight(x, z); if (rh > y) y = rh;
    return y;
  }
  function surface(x, z, y = null) {
    const nr = nearestRoad(x, z, 20);
    if (nr && nr.d < .2) return 'road';
    if (rampHeight(x, z) > -1e8) return 'road';
    const h = y ?? terrainAt(x, z);
    if (h < SEA - .4) return 'water';
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z); if (dv < VOLCANO.lavaR + 2) return 'lava';
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - 4) return 'ice';
    const Z = zoneAt(x, z).id;
    if (Z === 'glacier' && h > 40) return 'snow';
    if (Z === 'beach' || h < 3.2) return 'sand';
    if (Z === 'canyon') return 'sand';
    if (Z === 'volcano') return 'rock';
    if (Z === 'jungle') return 'mud';
    return 'grass';
  }

  // ----- terrain mesh -----
  const TCOL = new Float32Array(N * N * 3);
  {
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N - 1, N - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; for (let k = 0; k < pos.count; k++) pos.setY(k, H[k]);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = TCOL, c = new THREE.Color(), c2 = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), h = H[k], ny = nrm.getY(k), n = fbm(x * .05, z * .05, 3) * .5 + .5, n2 = fbm(x * .011 + 40, z * .011, 3) * .5 + .5;
      const Z = zoneAt(x, z).id, dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
      if (h < SEA + .2) c.setRGB(.86, .78, .58);
      else if (h < 3.4 || Z === 'beach') c.setRGB(.95 - n * .05, .86 - n * .06, .62 - n * .05);
      else if (Z === 'canyon') { const band = Math.sin(h * .55) * .5 + .5; c.setRGB(.82 - band * .14, .45 - band * .08 + n * .05, .28 - band * .06); if (ny > .9) c.lerp(c2.setRGB(.86, .64, .42), .5); }
      else if (Z === 'volcano') { c.setRGB(.2 + n * .06, .17 + n * .04, .17 + n * .04); if (dv < VOLCANO.rim + 4) c.lerp(c2.setRGB(.32, .14, .08), .5); if (dv > 220) c.lerp(c2.setRGB(.35, .42, .22), smooth(220, 300, dv)); }
      else if (Z === 'glacier') { const snow = smooth(34, 60, h) * (ny > .55 ? 1 : .3); c.setRGB(.36 + n * .06, .5 + n * .06, .28); c.lerp(c2.setRGB(.95, .97, 1), snow); if (ny < .55) c.lerp(c2.setRGB(.5, .52, .58), .7); }
      else if (Z === 'jungle') c.setRGB(.16 + n * .07, .42 + n * .1, .16 + n * .04);
      else if (Z === 'city') c.setRGB(.3 + n * .06, .52 + n * .06, .2);
      else { const field = Math.floor((fbm(x * .004, z * .004, 2) * .5 + .5) * 5); c.setRGB(...[[.3, .56, .16], [.4, .6, .18], [.48, .6, .2], [.26, .5, .14], [.36, .64, .2]][field]); c.multiplyScalar(.92 + n * .16); }
      if (Z !== 'glacier' && Z !== 'volcano' && Z !== 'canyon' && ny < .72 && h > 4) c.lerp(c2.setRGB(.52, .46, .4), smooth(.72, .5, ny));
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r) c.setRGB(.72, .88, .96);
      if (ROADD[k] < 4 && ROADD[k] > -2) c.multiplyScalar(.82); // shoulder
      c.multiplyScalar(.9 + n2 * .14);
      // Zone palettes are authored as display colours, just like hex materials.
      // Store linear colours so sunlight does not wash the grass/rock to pastels.
      c.convertSRGBToLinear();
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, terrainMaterial());
    mesh.receiveShadow = true; group.add(mesh);
  }

  // ----- sea -----
  const waveTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const fx = x / 256 * TAU, fy = y / 256 * TAU, dx = Math.cos(fx * 3 + fy * 2) * .5 + Math.cos(fx * 7 - fy * 5) * .25 + Math.cos(fx * 13 + fy * 11) * .12, dy = Math.cos(fy * 4 - fx) * .5 + Math.cos(fy * 9 + fx * 6) * .25 + Math.cos(fy * 15 - fx * 12) * .12, i = (y * 256 + x) * 4; img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(90, 90); return t; })();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x1aa0c8, roughness: .1, metalness: .1, normalMap: waveTex, normalScale: new THREE.Vector2(.5, .5), transparent: true, opacity: .86 }));
  // Depth-coloured lagoons and moving foam follow the actual baked shoreline.
  const depths = new Uint8Array(N * N * 4);
  for (let k = 0; k < H.length; k++) { const d = clamp((SEA - H[k]) / 32, 0, 1) * 255; depths[k * 4] = depths[k * 4 + 1] = depths[k * 4 + 2] = d; depths[k * 4 + 3] = 255; }
  const depthTex = new THREE.DataTexture(depths, N, N); depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
  const waterTime = { value: 0 };
  sea.material.color.set(0xffffff); sea.material.roughness = .22; sea.material.opacity = .94;
  sea.material.onBeforeCompile = shader => {
    shader.uniforms.shoreDepth = { value: depthTex }; shader.uniforms.waterTime = waterTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaXZ = (modelMatrix * vec4(position, 1.)).xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ; uniform sampler2D shoreDepth; uniform float waterTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 shoreUV = (vSeaXZ + 900.) / 1800.;
        float depth = texture2D(shoreDepth, clamp(shoreUV, 0., 1.)).r * 32.;
        float inIsland = step(0., shoreUV.x) * step(shoreUV.x, 1.) * step(0., shoreUV.y) * step(shoreUV.y, 1.);
        depth = mix(32., depth, inIsland);
        vec3 water = mix(vec3(.16,.70,.66), vec3(.015,.25,.42), smoothstep(0.,24.,depth));
        float ripple = sin(vSeaXZ.x * .17 + sin(vSeaXZ.y * .13) + waterTime * 1.2);
        float foam = pow(.5 + .5 * sin(depth * 3.8 - waterTime * 1.4 + ripple * .55), 8.);
        foam *= (1. - smoothstep(.2, 2.8, depth)) * smoothstep(.02, .22, depth);
        diffuseColor.rgb *= mix(water, vec3(.87,.98,.91), foam * .8);`);
  };
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA; sea.receiveShadow = true; group.add(sea);
  updaters.push((dt, t) => { waveTex.offset.set(t * .004, t * .007); waterTime.value = t; });

  // ----- road meshes -----
  const asphalt = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#3a3d44'; g.fillRect(0, 0, 64, 256); for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * .08})`; g.fillRect(r() * 64, r() * 256, 1.5, 1.5); }
    g.fillStyle = '#f4f4f0'; g.fillRect(1, 0, 2.5, 256); g.fillRect(60.5, 0, 2.5, 256); g.fillStyle = '#ffd23a'; g.fillRect(31, 0, 2, 110);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: .8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: .8 }), pillarMat = new THREE.MeshStandardMaterial({ color: 0xc8c4bc, roughness: .9 });
  for (const rd of roads) {
    const pos = [], uv = [], idx = [], n = rd.pts.length, loop = rd.closed; let acc = 0;
    for (let k = 0; k <= (loop ? n : n - 1); k++) {
      const p = rd.pts[k % n]; if (k) { const q = rd.pts[(k - 1) % n]; acc += Math.hypot(p.x - q.x, p.z - q.z); }
      for (const s of [-1, 1]) { const x = p.x + p.nx * s * rd.hw, z = p.z + p.nz * s * rd.hw; pos.push(x, p.y + .07, z); uv.push(s < 0 ? 0 : 1, acc / 12); }
      if (k < (loop ? n : n - 1)) { const b = k * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, roadMat); m.receiveShadow = true; group.add(m);
    // bridge decks and pillars where the road crosses water
    for (let k = 0; k < n; k += 1) { const p = rd.pts[k]; if (!p.bridge) continue;
      const deck = new THREE.Mesh(BOX, deckMat); deck.scale.set(rd.w + 1.4, 1.2, 2.3); deck.position.set(p.x, p.y - .55, p.z); deck.rotation.y = p.angle; deck.castShadow = true; group.add(deck);
      if (k % 9 === 0) { const pl = new THREE.Mesh(CYL, pillarMat); const hgt = p.y + 8; pl.scale.set(1.2, hgt, 1.2); pl.position.set(p.x, p.y - hgt / 2 - 1, p.z); group.add(pl); }
      if (k % 2 === 0) for (const s of [-1, 1]) { const rail = new THREE.Mesh(BOX, deckMat); rail.scale.set(.3, .9, 2.3); rail.position.set(p.x + p.nx * s * (rd.hw + .5), p.y + .4, p.z + p.nz * s * (rd.hw + .5)); rail.rotation.y = p.angle; group.add(rail); }
    }
  }

  // ----- boost pads on the long roads -----
  const pads = [];
  {
    const padTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#ffe24a';
      for (let k = 0; k < 3; k++) { const y = 20 + k * 40; g.beginPath(); g.moveTo(6, y + 22); g.lineTo(32, y); g.lineTo(58, y + 22); g.lineTo(58, y + 34); g.lineTo(32, y + 12); g.lineTo(6, y + 34); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const padMat = new THREE.MeshBasicMaterial({ map: padTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    updaters.push((dt, t) => { padTex.offset.y = -t * 1.6; });
    for (const rd of roads) { if (!['ring', 'avenue', 'east', 'west', 'volcano', 'glacier', 'beach'].includes(rd.id)) continue;
      const every = rd.id === 'ring' ? 150 : 120;
      for (let k = 40; k < rd.pts.length - 20; k += Math.round(every / 2)) { const p = rd.pts[k]; if (p.bridge || rampHeight(p.x, p.z) > -1e8) continue; const side = (k / Math.round(every / 2)) % 2 ? 1 : -1, off = rd.hw * .45 * side;
        const x = p.x + p.nx * off, z = p.z + p.nz * off; pads.push({ x, z, y: p.y, angle: p.angle, len: 5.5, w: 3.6 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.5), padMat); m.rotation.set(-Math.PI / 2, p.angle, Math.PI, 'YXZ'); m.position.set(x, p.y + .1, z); group.add(m); } }
  }

  // ----- ramp meshes -----
  const rampMat = new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ff5a2a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffd23a'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(16, 120 - k * 30); g.lineTo(64, 96 - k * 30); g.lineTo(112, 120 - k * 30); g.lineTo(112, 108 - k * 30); g.lineTo(64, 84 - k * 30); g.lineTo(16, 108 - k * 30); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: .6 });
  const rampSide = new THREE.MeshStandardMaterial({ color: 0x5a5a64, roughness: .8 });
  for (const R of ramps) {
    const L = R.len, Wd = R.w, prof = [], seg = 10;
    for (let s = 0; s <= seg; s++) { const f = s / seg; prof.push([f * L - L / 2, R.h * f * f * .4 + R.h * f * .6]); }
    const pos = [], uv = [], idx = [];
    prof.forEach(([u, h], s) => { for (const side of [-1, 1]) { pos.push(side * Wd / 2, h, u); uv.push(side < 0 ? 0 : 1, s / seg); } if (s < seg) { const b = s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } });
    const top = new THREE.BufferGeometry(); top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); top.setIndex(idx); top.computeVertexNormals();
    const g = new THREE.Group(); const tm = new THREE.Mesh(top, rampMat); tm.castShadow = tm.receiveShadow = true; g.add(tm);
    const shape = new THREE.Shape(); shape.moveTo(-L / 2, -1.5); prof.forEach(([u, h]) => shape.lineTo(u, h - .02)); shape.lineTo(L / 2, -1.5);
    const sideGeo = new THREE.ExtrudeGeometry(shape, { depth: Wd - .1, bevelEnabled: false }); sideGeo.rotateY(-Math.PI / 2); sideGeo.translate(Wd / 2 - .05, 0, 0);
    const sm = new THREE.Mesh(sideGeo, rampSide); sm.castShadow = true; g.add(sm);
    g.position.set(R.x, R.y, R.z); g.rotation.y = R.angle; group.add(g);
  }

  // ----- farmland in the plains: striped fields (wheat, crops, lavender, ploughed soil) between hedges -----
  const roadDAt = (x, z) => ROADD[clamp(Math.round((z + HALF) / STEP), 0, N - 1) * N + clamp(Math.round((x + HALF) / STEP), 0, N - 1)];
  const FA = .42, FW = 64, FD = 46, CA = Math.cos(FA), SA = Math.sin(FA), fieldsKept = new Map();
  const fieldOf = (x, z) => { const u = x * CA + z * SA, v = -x * SA + z * CA, i = Math.floor(u / FW), j = Math.floor(v / FD); return { i, j, fu: u / FW - i, fv: v / FD - j }; };
  const fieldXZ = (i, j, fu, fv) => { const u = (i + fu) * FW, v = (j + fv) * FD; return [u * CA - v * SA, u * SA + v * CA]; };
  const fieldOk = (x, z) => zoneAt(x, z).id === 'plains' && roadDAt(x, z) > 4 && rawAt(x, z) > 3 && Math.hypot(x - SP.x - 10, z - SP.z) > 125 && rampHeight(x, z) < -1e8;
  function inField(x, z, pad = 0) { const f = fieldOf(x, z), k = fieldsKept.get(f.i + ',' + f.j); if (!k) return false; const m = pad / FW + .02; return f.fu > m && f.fu < 1 - m && f.fv > pad / FD + .03 && f.fv < 1 - pad / FD - .03 && fieldOk(x, z); }
  {
    const crops = [['#d6b45c', '#b4904a'], ['#5e9e3a', '#55603a'], ['#8a6446', '#6e4c34'], ['#9a88c8', '#647c4a'], ['#d8c444', '#7a9a40'], ['#7ab44a', '#66a03e']];
    const mats = crops.map(([a, b], q) => { const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d'), rr = rng(70 + q);
      g.fillStyle = b; g.fillRect(0, 0, 32, 64); const gr = g.createLinearGradient(0, 8, 0, 56); gr.addColorStop(0, b); gr.addColorStop(.35, a); gr.addColorStop(.8, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 6, 32, 52);
      for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(${rr() < .5 ? '255,255,255' : '0,0,0'},${rr() * .14})`; g.fillRect(rr() * 32, 8 + rr() * 48, 2, 2); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); });
    const parts = crops.map(() => ({ pos: [], uv: [], idx: [] }));
    for (let i = -8; i <= 8; i++) for (let j = -10; j <= 10; j++) {
      const [cx, cz] = fieldXZ(i, j, .5, .5); if (Math.hypot(cx, cz) > 420 || zoneAt(cx, cz).id !== 'plains') continue;
      const type = Math.floor(hash(i * 7 + 3, j * 13 + 5) * 8) - 2; if (type < 0) continue; // some cells stay meadow
      const nu = 16, nv = 12, P = parts[type], base = P.pos.length / 3, ok = [];
      for (let b = 0; b <= nv; b++) for (let a = 0; a <= nu; a++) { const fu = .03 + a / nu * .94, fv = .04 + b / nv * .92, [x, z] = fieldXZ(i, j, fu, fv); ok.push(fieldOk(x, z)); P.pos.push(x, terrainAt(x, z) + .07, z); P.uv.push(fu * FW / 18, fv * FD / 1.7); }
      let tris = 0;
      for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) { const q = b * (nu + 1) + a; if (ok[q] && ok[q + 1] && ok[q + nu + 1] && ok[q + nu + 2]) { P.idx.push(base + q, base + q + nu + 1, base + q + 1, base + q + 1, base + q + nu + 1, base + q + nu + 2); tris++; } }
      if (tris > nu * nv * .45) fieldsKept.set(i + ',' + j, type);
      else { P.idx.length -= tris * 6; }
    }
    parts.forEach((P, q) => { if (!P.idx.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2)); g.setIndex(P.idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mats[q]); m.receiveShadow = true; group.add(m); });
  }

  // ----- instanced props + colliders -----
  const batches = new Map();
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  const M = (x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) => { e4.set(rx, ry, rz); q4.setFromEuler(e4); return m4.compose(v4.set(x, y, z), q4, s4.set(sx, sy, sz)).clone(); };
  const propBounds = new THREE.Box3();
  function inst(geo, mat, m, cast = true) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    propBounds.copy(geo.boundingBox).applyMatrix4(m);
    const b = propBounds;
    if (!roadFootprintClear({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2,
      hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, ang: 0, minY: b.min.y, maxY: b.max.y }, .45)) return false;
    const k = geo.uuid + mat.uuid; if (!batches.has(k)) batches.set(k, { geo, mat, list: [], cast }); batches.get(k).list.push(m);
    return true;
  }
  const colliders = [], colGrid = new Map(), CC = 24;
  // Inspect every nearby road, including intersecting roads and both edges.
  // A centre-point-only check misses long fences, rotated houses and boulders.
  function roadFootprintClear(c, margin = 1.5) {
    const R = (c.r ?? Math.hypot(c.hx, c.hz)) + 10 + margin;
    const ci = Math.floor(c.x / CELL), cj = Math.floor(c.z / CELL), reach = Math.ceil(R / CELL);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (const { p, rd } of roadGrid.get(key(ci + i, cj + j)) || []) {
      if (c.minY > p.y + 3.3 || c.maxY < p.y - .6) continue;
      if (footprintDistance(c, p.x, p.z) < rd.hw + margin + .3) return false;
    }
    return true;
  }
  function addCol(c) {
    c.minY ??= terrainAt(c.x, c.z) - .5; c.maxY ??= c.minY + 10;
    if (!roadFootprintClear(c)) return false;
    colliders.push(c); const R = c.r ?? Math.hypot(c.hx, c.hz);
    for (let i = Math.floor((c.x - R) / CC); i <= Math.floor((c.x + R) / CC); i++) for (let j = Math.floor((c.z - R) / CC); j <= Math.floor((c.z + R) / CC); j++) { const k = key(i, j); if (!colGrid.has(k)) colGrid.set(k, []); colGrid.get(k).push(c); }
    return true;
  }
  const freeSpot = (x, z, clear) => { if (inField(x, z, clear)) return false; for (const C of CLEARINGS) if (Math.hypot(x - C.x, z - C.z) < C.r + clear * .5) return false; const nr = nearestRoad(x, z, clear + 8); if (nr && nr.d < clear) return false; if (rampHeight(x, z) > -1e8) return false; for (const R of ramps) if (Math.hypot(R.x - x, R.z - z) < R.len + clear) return false; return true; };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...o });
  const puffGeo = (() => { const g = sculpt([{ e: [0, -.1, 0], r: [.78, .7, .78], c: 0xffffff }, { e: [.5, .05, .15], r: [.5, .48, .5], c: 0xffffff }, { e: [-.45, .1, -.2], r: [.52, .5, .52], c: 0xffffff }, { e: [.05, .2, .5], r: [.48, .46, .48], c: 0xffffff }, { e: [-.1, .2, -.5], r: [.46, .44, .46], c: 0xffffff }, { e: [0, .5, 0], r: [.52, .45, .52], c: 0xffffff }], { k: .3, res: 18 }).clone(); g.deleteAttribute('color'); g.computeBoundingBox(); const b = g.boundingBox, s = 2 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z); g.translate(0, -(b.min.y + b.max.y) / 2, 0); g.scale(s, s, s); g.computeVertexNormals(); return g; })();
  const MAT = {
    trunk: std(0x7a5a3a), palmTrunk: std(0x9a7a52), leaf: std(0x3f9a3a, { side: THREE.DoubleSide }), leaf2: std(0x5ab84a, { side: THREE.DoubleSide }),
    jungle: std(0x2a8a3a), jungle2: std(0x1f6e30), pine: std(0x2a5a3a), snow: std(0xf4f8ff), cactus: std(0x4a8a3a), dead: std(0x3a2e2a),
    rock: std(0x8a8078, { flatShading: true }), darkRock: std(0x2e2626, { flatShading: true }), redRock: std(0xb06a44, { flatShading: true }), ice: std(0xbfeaff, { roughness: .15, metalness: .1, transparent: true, opacity: .85, flatShading: true }),
    white: std(0xf4f2ec), red: std(0xe03a30), steel: std(0x6a7280, { metalness: .5, roughness: .5 }), wood: std(0x8a6440), yellow: std(0xffc83a),
  };
  // Curved, feathered palm fronds replace the old rectangular leaf bars.
  const palmFrond = (() => {
    const pos = [], colors = [];
    const triangle = (a, b, c, shade) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) colors.push(shade * .84, shade, shade * .68); };
    const center = f => [f * 4.9, Math.sin(f * Math.PI) * .65 - f * f * 1.65, 0];
    for (let k = 0; k < 16; k++) {
      const f = (k + 1) / 17, a = center(f), b = center(f + .05), width = Math.sin(f * Math.PI) * .85 + .08;
      for (const s of [-1, 1]) {
        const tip = [a[0] - .55, a[1] - .22, s * width];
        triangle(a, b, tip, .78 + f * .22);
        triangle(b, [tip[0] + .22, tip[1] - .03, tip[2] * .82], tip, .75 + f * .2);
      }
      triangle([a[0], a[1] + .025, -.045], [b[0], b[1] + .025, 0], [a[0], a[1] + .025, .045], 1.1);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); return geometry;
  })();
  const palmLeaf = std(0x71a64b, { vertexColors: true, side: THREE.DoubleSide });
  const bark = (() => {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d'), random = rng(9281);
    ctx.fillStyle = '#bba48c'; ctx.fillRect(0, 0, 128, 256);
    for (let k = 0; k < 100; k++) {
      const x = random() * 128, y = random() * 256;
      ctx.strokeStyle = k % 3 ? '#897461' : '#e0c6a2'; ctx.globalAlpha = .2 + random() * .4; ctx.lineWidth = .8 + random() * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - 5, y + 12, x + 6, y + 28, x + 2, y + 45); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
  })();
  MAT.trunk.map = bark;
  const crownDetail = new THREE.IcosahedronGeometry(1, 1);
  const tree = {
    palm(x, y, z, hgt = 9) { const lean = (r() - .5) * .4, dir = r() * TAU;
      for (let k = 0; k < 5; k++) { const f = k / 5, yy = hgt * (f + .1); inst(CYLLOW, MAT.palmTrunk, M(x + Math.cos(dir) * lean * yy, y + yy, z + Math.sin(dir) * lean * yy, .32 - f * .1, hgt / 5 + .05, .32 - f * .1, 0, Math.sin(dir) * lean, -Math.cos(dir) * lean)); }
      const tx = x + Math.cos(dir) * lean * hgt, tz = z + Math.sin(dir) * lean * hgt;
      for (let k = 0; k < 8; k++) { const variation = r(), a = k / 8 * TAU + variation * .3, s = .85 + variation * .25; inst(palmFrond, palmLeaf, M(tx, y + hgt + .1, tz, s, s, s, -a, 0, k % 3 === 0 ? .24 : 0)); }
      for (let k = 0; k < 3; k++) inst(ROCK, MAT.wood, M(tx + Math.cos(k * 2.1) * .35, y + hgt - .3, tz + Math.sin(k * 2.1) * .35, .24, .32, .24));
      addCol({ x, z, r: .6, minY: y, maxY: y + hgt }); marks.trees.push([x, z, 1.9, 0]); },
    broad(x, y, z, s = 1) {
      inst(CYLLOW, MAT.trunk, M(x, y + 2.5 * s, z, .45 * s, 5 * s, .45 * s));
      const material = r() < .5 ? MAT.jungle : MAT.jungle2, angle = r() * TAU;
      inst(puffGeo, material, M(x, y + 6.5 * s, z, 3.4 * s, 2.6 * s, 3.4 * s, angle));
      for (const side of [-1, 1]) {
        const dx = Math.cos(angle) * side, dz = Math.sin(angle) * side;
        inst(CYLLOW, MAT.trunk, M(x + dx * .6 * s, y + 4 * s, z + dz * .6 * s, .16 * s, 2.3 * s, .16 * s, -angle, 0, side * .6));
        inst(crownDetail, side < 0 ? MAT.jungle : MAT.leaf, M(x + dx * 2 * s, y + 7 * s, z + dz * 2 * s, 1.7 * s, 1.6 * s, 1.7 * s, angle));
      }
      addCol({ x, z, r: .7 * s, minY: y, maxY: y + 6 * s }); marks.trees.push([x, z, 3.4 * s, 1]);
    },
    pine(x, y, z, s = 1, snowy = false) { inst(CYLLOW, MAT.trunk, M(x, y + 1.2 * s, z, .35 * s, 2.4 * s, .35 * s)); for (let k = 0; k < 3; k++) { inst(CONE, MAT.pine, M(x, y + (3 + k * 2.2) * s, z, (2.8 - k * .7) * s, 3.2 * s, (2.8 - k * .7) * s)); if (snowy) inst(CONE, MAT.snow, M(x, y + (3.7 + k * 2.2) * s, z, (1.6 - k * .4) * s, 1.6 * s, (1.6 - k * .4) * s)); } addCol({ x, z, r: .6 * s, minY: y, maxY: y + 9 * s }); marks.trees.push([x, z, 2.6 * s, snowy ? 3 : 2]); },
    cactus(x, y, z, s = 1) { inst(CYL, MAT.cactus, M(x, y + 2.5 * s, z, .55 * s, 5 * s, .55 * s)); for (const sd of [-1, 1]) if (r() < .8) { const hh = (1.5 + r() * 1.5) * s; inst(CYL, MAT.cactus, M(x + sd * 1.1 * s, y + hh + 1, z, .4 * s, 1.8 * s, .4 * s)); inst(CYL, MAT.cactus, M(x + sd * .6 * s, y + hh, z, .35 * s, .35 * s, 1.1 * s, 0, 0, Math.PI / 2)); } addCol({ x, z, r: .7 * s, minY: y, maxY: y + 6 * s }); marks.trees.push([x, z, 1.2 * s, 4]); },
    dead(x, y, z, s = 1) { inst(CYLLOW, MAT.dead, M(x, y + 2.5 * s, z, .35 * s, 5 * s, .35 * s, 0, (r() - .5) * .3, (r() - .5) * .3)); for (let k = 0; k < 3; k++) inst(CYLLOW, MAT.dead, M(x + (r() - .5) * 1.5, y + (3 + r() * 2) * s, z + (r() - .5) * 1.5, .15 * s, 2.2 * s, .15 * s, r() * TAU, 0, .9)); addCol({ x, z, r: .5 * s, minY: y, maxY: y + 6 * s }); marks.trees.push([x, z, 1.2 * s, 5]); },
    rock(x, y, z, s, mat = MAT.rock) {
      const transform = M(x, y + s * .25, z, s, s * (.6 + r() * .5), s * (.8 + r() * .4), r() * TAU, r(), r());
      if (!inst(ROCK, mat, transform)) return;
      const bounds = new THREE.Box3().copy(ROCK.boundingBox).applyMatrix4(transform);
      addCol({ x, z, r: s * .85, minY: bounds.min.y, maxY: bounds.max.y }); marks.trees.push([x, z, s * .9, mat === MAT.darkRock ? 7 : mat === MAT.redRock ? 8 : 6]);
    },
  };
  const scatter = (n, zoneId, minClear, fn, tries = 10) => {
    const Z = ZONES[ZI[zoneId]]; let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * Z.r * 1.15, x = Z.x + Math.cos(a) * d, z = Z.z + Math.sin(a) * d;
      if (zoneAt(x, z).id !== zoneId) continue; const y = terrainAt(x, z); if (y < SEA + 1.2) continue; if (!freeSpot(x, z, minClear)) continue;
      if (fn(x, y, z) !== false) placed++;
    }
  };

  // ===== zones =====
  // -- plains: farms, windmills, scattered trees, the stunt park --
  scatter(240, 'plains', 6, (x, y, z) => { if (fbm(x * .01, z * .01, 2) < .05) return false; tree.broad(x, y, z, .8 + r() * .5); });
  scatter(40, 'plains', 6, (x, y, z) => tree.rock(x, y, z, 1.5 + r() * 2.5));
  const windmills = [];
  for (const [x, z] of [[-130, -60], [-60, 160], [150, 60], [-180, 250], [260, -140]]) { if (!freeSpot(x, z, 8)) continue; const y = terrainAt(x, z);
    inst(CYL, MAT.white, M(x, y + 12, z, 1.6, 24, 1.6)); inst(CONE, MAT.red, M(x, y + 25.5, z, 2, 3, 2)); addCol({ x, z, r: 2.2 }); marks.pois.push({ x, z, kind: 'mill' });
    const rot = new THREE.Group(); for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(BOX, MAT.white); b.scale.set(1.2, 11, .2); b.position.y = 5.5; const arm = new THREE.Group(); arm.rotation.z = k / 3 * TAU; arm.add(b); rot.add(arm); }
    rot.position.set(x, y + 23, z + 1.9); group.add(rot); windmills.push(rot); }
  updaters.push((dt, t) => windmills.forEach((w, i) => { w.rotation.z = t * (.6 + i * .07); }));
  // red barns
  for (let i = 0; i < 8; i++) { const a = r() * TAU, d = 80 + r() * 200, x = Math.cos(a) * d, z = Math.sin(a) * d; if (zoneAt(x, z).id !== 'plains' || !freeSpot(x, z, 16)) continue; const y = terrainAt(x, z), ang = r() * TAU;
    inst(BOX, MAT.red, M(x, y + 3.5, z, 12, 7, 9, ang)); inst(ROOF, MAT.white, M(x, y + 8.5, z, 9, 3, 7, ang)); addCol({ x, z, hx: 6.2, hz: 4.7, ang }); marks.houses.push([x, z, 12, 9, ang, '#c8382e', 8]); }
  // stunt park sign + fence posts
  {
    const sign = textSign('STUNTPARK', '#ff5a2a', '#ffffff'); sign.position.set(SP.x - 70, terrainAt(SP.x - 70, SP.z) + 7, SP.z - 40); sign.rotation.y = .9; group.add(sign); marks.pois.push({ x: SP.x, z: SP.z, icon: '🛹', name: 'Stuntpark' });
    for (let k = 0; k < 40; k++) { const a = k / 40 * TAU, x = SP.x + 10 + Math.cos(a) * 110, z = SP.z + Math.sin(a) * 100; if (!freeSpot(x, z, 4)) continue; const y = terrainAt(x, z); inst(BOX, k % 2 ? MAT.red : MAT.white, M(x, y + .6, z, .6, 1.2, .6)); }
  }

  // -- city: towers, harbour, lighthouse --
  const cityParts = [];
  {
    const winTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = r() < .2 ? '#ffe9a8' : `rgb(${60 + r() * 30},${100 + r() * 40},${140 + r() * 40})`; g.fillRect(6 + x * 32, 8 + y * 32, 20, 18); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    const palette = [0xffffff, 0xffe0c0, 0xc8e0ff, 0xffd0d8, 0xd8f0c8, 0xf0e0a8];
    const geos = [];
    for (let gx = -270; gx <= 270; gx += 30) for (let gz = 360; gz <= 660; gz += 30) {
      const x = gx + (r() - .5) * 8, z = gz + (r() - .5) * 8; if (zoneAt(x, z).id !== 'city') continue;
      const y = terrainAt(x, z); if (y < SEA + 2.5 || !freeSpot(x, z, 13)) continue;
      const w = 12 + r() * 9, d = 12 + r() * 9, dc = Math.hypot(x, z - 480), hgt = Math.max(8, (70 - dc * .25) * (.5 + r() * .7) + (z > 620 ? -30 : 0));
      if (Math.abs(x - 210) < 40 && Math.abs(z - 690) < 40) continue;
      if (!roadFootprintClear({ x, z, hx: w / 2 + 1, hz: d / 2 + 1, ang: 0 })) continue;
      const g = new THREE.BoxGeometry(w, hgt, d); const uvA = g.attributes.uv, nA = g.attributes.normal;
      for (let k = 0; k < uvA.count; k++) { const ny = Math.abs(nA.getY(k)), nx = Math.abs(nA.getX(k)); if (ny > .5) uvA.setXY(k, 0, 0); else uvA.setXY(k, uvA.getX(k) * (nx > .5 ? d : w) / 8, uvA.getY(k) * hgt / 8); }
      const colA = new Float32Array(uvA.count * 3), cc = new THREE.Color(palette[Math.floor(r() * palette.length)]); for (let k = 0; k < uvA.count; k++) { const roof = Math.abs(nA.getY(k)) > .5; colA[k * 3] = roof ? .5 : cc.r; colA[k * 3 + 1] = roof ? .5 : cc.g; colA[k * 3 + 2] = roof ? .52 : cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(colA, 3)); g.translate(x, y + hgt / 2 - .5, z); geos.push(g); marks.houses.push([x, z, w, d, 0, '#' + cc.getHexString(), hgt]); marks.roofs.push([x, y + hgt - .5, z, w, d]);
      addCol({ x, z, hx: w / 2 + .3, hz: d / 2 + .3, ang: 0, minY: y - .5, maxY: y + hgt });
      if (r() < .3 && hgt > 30) inst(CYLLOW, MAT.steel, M(x, y + hgt + 3, z, .2, 6, .2));
    }
    const city = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: winTex, vertexColors: true, roughness: .55, metalness: .1 }));
    city.castShadow = city.receiveShadow = true; group.add(city); cityParts.push(city);
    // street lamps and palms along the city streets
    for (const rd of roads.filter(q => q.id.startsWith('city') || q.id === 'docks' || q.id === 'avenue')) for (let k = 0; k < rd.pts.length; k += 12) { const p = rd.pts[k]; if (zoneAt(p.x, p.z).id !== 'city') continue;
      for (const s of [-1, 1]) { const x = p.x + p.nx * s * (rd.hw + 2), z = p.z + p.nz * s * (rd.hw + 2); if (!freeSpot(x, z, rd.hw > 6 ? 1 : 1)) continue; const y = terrainAt(x, z);
        if (k % 24 === 0) tree.palm(x, y, z, 7 + r() * 3); else { inst(CYLLOW, MAT.steel, M(x, y + 3, z, .12, 6, .12)); inst(BOX, MAT.steel, M(x - p.nx * s * .8, y + 6, z - p.nz * s * .8, .3, .15, 1.8, p.angle + Math.PI / 2)); } } }
    // harbour: piers, containers, cranes, ships, lighthouse
    const cont = [0xe03a30, 0x2a7ad8, 0x2aa860, 0xffb02a, 0xe8e8e8, 0x8a3ad8].map(c => std(c, { roughness: .6 }));
    for (let i = 0; i < 70; i++) { const x = -230 + r() * 460, z = 680 + r() * 26; if (!freeSpot(x, z, 3)) continue; const y = terrainAt(x, z); if (y < 1.5) continue; const stack = 1 + Math.floor(r() * 3), ang = r() < .5 ? 0 : Math.PI / 2;
      for (let s = 0; s < stack; s++) { const cm = cont[Math.floor(r() * cont.length)]; inst(BOX, cm, M(x, y + 1.3 + s * 2.6, z, 2.4, 2.5, 6, ang)); if (s === stack - 1) marks.houses.push([x, z, 2.4, 6, ang, '#' + cm.color.getHexString(), stack * 2.6]); } addCol({ x, z, hx: ang ? 3.1 : 1.3, hz: ang ? 1.3 : 3.1, ang: 0 }); }
    const cranes = [];
    for (const x of [-160, -40, 80]) { const z = 700, y = Math.max(2, terrainAt(x, z));
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) inst(BOX, MAT.yellow, M(x + dx, y + 11, z + dz, .7, 22, .7)); addCol({ x, z, hx: 3.6, hz: 3.6, ang: 0 });
      const arm = new THREE.Group(); const b = new THREE.Mesh(BOX, MAT.yellow); b.scale.set(1.4, 1.4, 34); b.position.z = 10; arm.add(b); const cab = new THREE.Mesh(BOX, MAT.white); cab.scale.set(3, 2.4, 3); arm.add(cab);
      const cable = new THREE.Mesh(BOX, MAT.steel); cable.scale.set(.1, 10, .1); cable.position.set(0, -5, 22); arm.add(cable); const hook = new THREE.Mesh(BOX, cont[cranes.length % 6]); hook.scale.set(2.4, 2.5, 6); hook.position.set(0, -11, 22); arm.add(hook);
      arm.position.set(x, y + 23, z); group.add(arm); cranes.push(arm); marks.houses.push([x, z, 7, 7, 0, '#ffc83a', 22]); }
    updaters.push((dt, t) => cranes.forEach((c, i) => { c.rotation.y = Math.sin(t * .15 + i * 2) * 1.2 + i; }));
    const hull = std(0x2a3a5a), hull2 = std(0xc83a2a);
    for (const [x, z, a, L] of [[-180, 760, .2, 60], [60, 770, -.1, 80], [230, 750, .5, 46]]) { const s = new THREE.Group(); const hb = new THREE.Mesh(BOX, a > .3 ? hull2 : hull); hb.scale.set(12, 7, L); s.add(hb); const deck = new THREE.Mesh(BOX, MAT.white); deck.scale.set(9, 6, 12); deck.position.set(0, 6, -L / 2 + 9); s.add(deck);
      for (let k = 0; k < L / 8 - 2; k++) { const c = new THREE.Mesh(BOX, cont[k % 6]); c.scale.set(10, 2.5, 6); c.position.set(0, 4.8, -L / 2 + 20 + k * 7); s.add(c); }
      s.position.set(x, 1, z); s.rotation.y = a; group.add(s); marks.houses.push([x, z, 12, L, a, a > .3 ? '#c83a2a' : '#2a3a5a', 7, 'ship']); updaters.push((dt, t) => { s.rotation.z = Math.sin(t * .6 + x) * .015; s.position.y = 1 + Math.sin(t * .8 + x) * .2; }); }
    // lighthouse on the harbour mole
    { const x = 290, z = 664, y = Math.max(2, terrainAt(x, z)); marks.pois.push({ x, z, icon: '🗼', name: 'Leuchtturm' });
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 24, 20), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 64; const g = c.getContext('2d'); for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#e02a2a'; g.fillRect(0, k * 64 / 6, 16, 64 / 6 + 1); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
      tower.position.set(x, y + 12, z); tower.castShadow = true; group.add(tower); addCol({ x, z, r: 3.8 });
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 12), new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe08a, emissiveIntensity: 1.4 })); lamp.position.set(x, y + 25.5, z); group.add(lamp);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: .06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Group(); for (const sd of [-1, 1]) { const b = new THREE.Mesh(new THREE.ConeGeometry(7, 100, 20, 1, true), beamMat); b.rotation.z = sd * Math.PI / 2; b.position.x = sd * 50; beam.add(b); } beam.position.set(x, y + 25.5, z); group.add(beam);
      updaters.push((dt, t) => { beam.rotation.y = t * .5; }); }
    marks.pois.push({ x: -40, z: 700, icon: '⚓', name: 'Hafen' });
    const sign = textSign('PORT APEX', '#13161c', '#ffffff', '#ff5a36'); sign.position.set(-40, 24, 400); sign.scale.setScalar(1.6); group.add(sign);
  }

  // -- beach: palms, umbrellas, huts, lifeguard tower --
  {
    scatter(90, 'beach', 5, (x, y, z) => tree.palm(x, y, z, 7 + r() * 5));
    const umb = [0xff5a5a, 0x3ab8ff, 0xffd04a, 0x5ad86a].map(c => std(c, { side: THREE.DoubleSide }));
    scatter(80, 'beach', 4, (x, y, z) => { if (y > 4.5) return false; inst(CYLLOW, MAT.white, M(x, y + 1.3, z, .06, 2.6, .06)); const uc = umb[Math.floor(r() * 4)]; inst(CONE, uc, M(x, y + 2.7, z, 2, .7, 2, r() * TAU)); marks.dots.push([x, z, 2, '#' + uc.color.getHexString()]); inst(BOX, umb[Math.floor(r() * 4)], M(x + 1.2, y + .05, z, 1, .05, 2, r())); });
    scatter(12, 'beach', 9, (x, y, z) => { const a = r() * TAU; inst(BOX, MAT.wood, M(x, y + 1.6, z, 5, 3.2, 4, a)); inst(ROOF, std(0xd8b060), M(x, y + 4.2, z, 4.6, 2.2, 4, a)); addCol({ x, z, hx: 2.6, hz: 2.6, ang: a }); marks.houses.push([x, z, 5, 4, a, '#d8b060', 4]); });
  }

  // -- canyon: cacti, red rocks, an arch --
  {
    scatter(150, 'canyon', 4, (x, y, z) => tree.cactus(x, y, z, .7 + r() * .6));
    scatter(90, 'canyon', 5, (x, y, z) => tree.rock(x, y, z, 1.5 + r() * 3.5, MAT.redRock));
    const p = roads.find(q => q.id === 'east').pts, a = p[Math.floor(p.length * .72)];
    const arch = new THREE.Mesh(new THREE.TorusGeometry(13, 3.4, 8, 24, Math.PI), std(0xb0603a, { flatShading: true })); arch.name = 'Canyon-Felsbogen'; arch.position.set(a.x, a.y - 1, a.z); arch.rotation.y = a.angle; arch.scale.set(1, 1.2, 1); arch.castShadow = true; group.add(arch);
    for (const sd of [-1, 1]) addCol({ x: a.x + a.nx * sd * 13, z: a.z + a.nz * sd * 13, r: 3.4 });
    marks.pois.push({ x: a.x, z: a.z, icon: '🌉', name: 'Felsbogen' });
  }

  // -- volcano: dead trees, dark rocks, lava lake, smoke --
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a10, toneMapped: false });
  {
    scatter(60, 'volcano', 5, (x, y, z) => { if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.rim + 10) return false; tree.dead(x, y, z, .8 + r() * .5); });
    scatter(120, 'volcano', 5, (x, y, z) => { if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.rim + 6) return false; tree.rock(x, y, z, 1.5 + r() * 4, MAT.darkRock); });
    const lavaTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ff4a0a'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${r() < .5 ? '255,220,90' : '120,20,0'},${.3 + r() * .5})`; g.beginPath(); g.arc(r() * 128, r() * 128, 3 + r() * 10, 0, TAU); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const lava = new THREE.Mesh(new THREE.CircleGeometry(VOLCANO.lavaR + 2, 48), new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false })); lava.rotation.x = -Math.PI / 2; lava.position.set(VOLCANO.x, VOLCANO.floor + .25, VOLCANO.z); group.add(lava);
    updaters.push((dt, t) => { lavaTex.offset.set(t * .02, Math.sin(t * .3) * .05); });
    // glowing cracks around the crater floor
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + r() * .2, len = 14 + r() * 18; const c = new THREE.Mesh(BOX, lavaMat); c.scale.set(.6, .2, len); const d = VOLCANO.lavaR + len / 2; c.position.set(VOLCANO.x + Math.cos(a) * d, VOLCANO.floor + .15, VOLCANO.z + Math.sin(a) * d); c.rotation.y = Math.PI / 2 - a; group.add(c); }
    const smokeTex = glowTex('rgba(70,62,62,.9)', 'rgba(70,62,62,0)'), plumes = [];
    for (let k = 0; k < 26; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false })); group.add(s); plumes.push([s, k / 26]); }
    updaters.push((dt, t) => plumes.forEach(([s, ph]) => { const u = (t * .03 + ph) % 1; s.position.set(VOLCANO.x + Math.sin(ph * 40 + t * .1) * u * 40, VOLCANO.floor + 10 + u * 260, VOLCANO.z + Math.cos(ph * 30) * u * 40 + u * 60); s.scale.setScalar(30 + u * 140); s.material.opacity = Math.sin(u * Math.PI) * .7; }));
    marks.pois.push({ x: VOLCANO.x, z: VOLCANO.z - VOLCANO.rim - 20, icon: '🌋', name: 'Krater' });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,140,40,1)', 'rgba(255,60,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(70); glow.material.opacity = .55; glow.position.set(VOLCANO.x, VOLCANO.floor + 12, VOLCANO.z); group.add(glow);
  }

  // -- glacier: snowy pines, ice crystals, frozen lake --
  {
    scatter(220, 'glacier', 5, (x, y, z) => { if (y > 120) return false; tree.pine(x, y, z, .8 + r() * .6, y > 40); });
    scatter(40, 'glacier', 6, (x, y, z) => { if (y < 40) return false; const s = 2 + r() * 4; inst(ROCK, MAT.ice, M(x, y + s, z, s * .6, s * 2, s * .6, r() * TAU, (r() - .5) * .4)); addCol({ x, z, r: s * .55 }); });
    scatter(60, 'glacier', 5, (x, y, z) => tree.rock(x, y, z, 2 + r() * 4));
    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 48), new THREE.MeshStandardMaterial({ color: 0xc8f0ff, roughness: .05, metalness: .3, transparent: true, opacity: .82 })); lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, LAKE.y + .1, LAKE.z); lake.receiveShadow = true; group.add(lake); marks.pois.push({ x: LAKE.x, z: LAKE.z - LAKE.r - 14, icon: '❄️', name: 'Frostsee' });
  }

  // -- jungle: dense trees, ferns, temple ruins --
  {
    scatter(520, 'jungle', 4, (x, y, z) => tree.broad(x, y, z, 1 + r() * .9));
    scatter(160, 'jungle', 3, (x, y, z) => { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; inst(BOX, MAT.leaf2, M(x + Math.cos(a) * .9, y + .6, z + Math.sin(a) * .9, 2, .05, .6, -a, 0, .5)); } });
    const T = { x: -560, z: 300 }, ty = terrainAt(T.x, T.z), stone = std(0x8a8a6a, { flatShading: true }), moss = std(0x5a7a3a, { flatShading: true });
    for (let k = 0; k < 5; k++) { const s = 34 - k * 6; inst(BOX, k % 2 ? moss : stone, M(T.x, ty + 2.5 + k * 5, T.z, s, 5, s)); }
    inst(BOX, stone, M(T.x, ty + 28, T.z, 8, 6, 8)); addCol({ x: T.x, z: T.z, hx: 17, hz: 17, ang: 0 });
    for (let k = 0; k < 5; k++) marks.houses.push([T.x, T.z, 34 - k * 6, 34 - k * 6, 0, k % 2 ? '#6a8a4a' : '#9a9a7a', 5]); marks.pois.push({ x: T.x, z: T.z - 34, icon: '🏛️', name: 'Tempel' });
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, x = T.x + Math.cos(a) * 30, z = T.z + Math.sin(a) * 30; if (!freeSpot(x, z, 3)) continue; inst(BOX, stone, M(x, terrainAt(x, z) + 3, z, 2, 6, 2, a)); addCol({ x, z, r: 1.4 }); }
  }

  // ----- people: pedestrians on the city sidewalks and the beach promenade -----
  {
    const shirts = [0xff4a3a, 0x3a8aff, 0xffd23a, 0x5ad86a, 0xff8ad8, 0xffffff, 0x8a6aff], skins = [0xf2c8a0, 0x8a5a3a, 0xd8a070, 0xf8dcc0, 0x6a4028], walkers = [];
    const paths = roads.filter(q => ['city1', 'city2', 'city3', 'docks', 'beach'].includes(q.id));
    for (let i = 0; i < 34; i++) {
      const rd = paths[i % paths.length], k0 = Math.floor(r() * (rd.pts.length - 20)) + 10, side = r() < .5 ? -1 : 1, p = person(shirts[i % shirts.length], skins[i % skins.length], r() < .4 ? shirts[(i + 3) % shirts.length] : null);
      p.scale.setScalar(1.35); group.add(p); walkers.push({ p, rd, k: k0, dir: r() < .5 ? 1 : -1, side, off: rd.hw + 2.6 + r() * 1.2, sp: 1.2 + r() * .6, ph: r() * 9, f: 0 });
    }
    updaters.push((dt, t, cam, pl) => walkers.forEach(w => {
      w.f += w.sp * dt / 2 * w.dir; while (w.f >= 1) { w.f -= 1; w.k++; } while (w.f < 0) { w.f += 1; w.k--; }
      if (w.k <= 2 || w.k >= w.rd.pts.length - 3) { w.dir *= -1; w.k = Math.max(3, Math.min(w.rd.pts.length - 4, w.k)); }
      const a = w.rd.pts[w.k], b = w.rd.pts[w.k + 1], x = a.x + (b.x - a.x) * w.f + a.nx * w.side * w.off, z = a.z + (b.z - a.z) * w.f + a.nz * w.side * w.off;
      if (pl && Math.hypot(pl.x - x, pl.z - z) < 6) w.jump = .6; w.jump = Math.max(0, (w.jump || 0) - dt); w.p.position.set(x, terrainAt(x, z) + Math.abs(Math.sin(t * 8 + w.ph)) * .06 + Math.sin(w.jump / .6 * Math.PI) * 1.4, z); w.p.rotation.y = a.angle + (w.dir < 0 ? Math.PI : 0);
      const sw = Math.sin(t * 7 + w.ph) * .5; if (w.p.userData.arms) { w.p.userData.arms[0].rotation.x = sw; w.p.userData.arms[1].rotation.x = -sw; }
    }));
  }

  // Clouds are rendered in the sky shader, without hundreds of blended sprites.
  // Advance the legacy cloud random samples so all later houses/props retain
  // their positions (60 clouds, six sprites with five samples, three for origin).
  for (let k = 0; k < 60 * (6 * 5 + 3); k++) r();

  // ----- birds over the sea -----
  {
    const birdM = std(0xffffff), birds = [];
    for (let k = 0; k < 24; k++) { const b = new THREE.Group(); for (const s of [-1, 1]) { const w = new THREE.Mesh(BOX, birdM); w.scale.set(1.4, .08, .5); w.position.x = s * .7; b.add(w); b.userData[s < 0 ? 'l' : 'r'] = w; } group.add(b); birds.push([b, r() * TAU, 100 + r() * 600, 30 + r() * 50]); }
    updaters.push((dt, t) => birds.forEach(([b, ph, R, y]) => { const a = ph + t * 25 / R; b.position.set(Math.cos(a) * R, y, Math.sin(a) * R + 300); b.rotation.y = -a; b.userData.l.rotation.z = Math.sin(t * 8 + ph) * .5; b.userData.r.rotation.z = -Math.sin(t * 8 + ph) * .5; }));
  }

  // ===== finishing touches =====
  // -- hedges around the fields (with gaps to drive through) and a scarecrow here and there --
  {
    const hedge = std(0x3f7a2e, { flatShading: true }), hedge2 = std(0x4f8a34, { flatShading: true }), seen = new Set();
    for (const [id] of fieldsKept) { const [i, j] = id.split(',').map(Number);
      for (const [fu0, fv0, fu1, fv1] of [[0, 0, 1, 0], [0, 1, 1, 1], [0, 0, 0, 1], [1, 0, 1, 1]]) {
        const L = (fu1 - fu0) * FW + (fv1 - fv0) * FD, n = Math.round(L / 3.2), gap = Math.floor(r() * n);
        for (let k = 0; k <= n; k++) { if (Math.abs(k - gap) < 3) continue; const f = k / n, [x, z] = fieldXZ(i, j, fu0 + (fu1 - fu0) * f, fv0 + (fv1 - fv0) * f), key = Math.round(x / 2) + ',' + Math.round(z / 2);
          if (seen.has(key) || !fieldOk(x, z) || roadDAt(x, z) < 6) continue; seen.add(key); const y = terrainAt(x, z), s = 1.3 + r() * .6;
          inst(ROCK, r() < .5 ? hedge : hedge2, M(x, y + s * .55, z, s * 1.1, s * .9, s * 1.1, r() * TAU)); addCol({ x, z, r: s * .8, minY: y - s * .35, maxY: y + s * 1.45 }); marks.trees.push([x, z, s, 1]); } }
      if (r() < .3) { const [x, z] = fieldXZ(i, j, .3 + r() * .4, .3 + r() * .4), y = terrainAt(x, z);
        inst(CYLLOW, MAT.wood, M(x, y + 1.2, z, .1, 2.4, .1)); inst(BOX, MAT.wood, M(x, y + 1.8, z, 1.8, .1, .1, r())); inst(BOX, MAT.red, M(x, y + 1.6, z, .7, .9, .45)); inst(CONE, MAT.yellow, M(x, y + 2.45, z, .6, .5, .6)); addCol({ x, z, r: .5 }); }
    }
  }

  // -- village houses along the country roads --
  {
    const wallTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
      for (const x of [9, 39]) { g.fillStyle = '#5a6a7a'; g.fillRect(x - 1, 21, 18, 18); g.fillStyle = '#9ad0f0'; g.fillRect(x, 22, 16, 16); g.fillStyle = '#fff'; g.fillRect(x + 7, 22, 2, 16); g.fillRect(x, 29, 16, 2); }
      g.fillStyle = '#d8d0c4'; g.fillRect(0, 58, 64, 6); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
    const walls = [0xfff4e0, 0xffe2c4, 0xdcecff, 0xffdcdc, 0xe6f4d2, 0xfff0a8].map(c => std(c, { map: wallTex })), roofsM = [0xc0442e, 0x8a4a32, 0x5a6470, 0x2a5a8a, 0xb85a2a].map(c => std(c, { flatShading: true }));
    for (const rd of roads) { if (!['avenue', 'west', 'east', 'glacier', 'ring', 'beach', 'jungle'].includes(rd.id)) continue;
      for (let k = 12; k < rd.pts.length - 12; k += 9) { const p = rd.pts[k], Z = zoneAt(p.x, p.z).id; if (!['plains', 'beach', 'city', 'jungle'].includes(Z) || p.bridge) continue; if (r() > (Z === 'plains' ? .55 : .3)) continue;
        const s = r() < .5 ? -1 : 1, off = rd.hw + 10 + r() * 5, x = p.x + p.nx * s * off, z = p.z + p.nz * s * off, y = terrainAt(x, z); if (y < 2.6 || !freeSpot(x, z, 8)) continue;
        const w = 7 + r() * 3, d = 6 + r() * 2, hh = 3.4 + r() * 1.6, ang = p.angle + Math.PI / 2, rc = roofsM[Math.floor(r() * roofsM.length)];
        inst(BOX, walls[Math.floor(r() * walls.length)], M(x, y + hh / 2 - .3, z, w, hh, d, ang)); inst(ROOF2, rc, M(x, y + hh - .3, z, w + .9, 2.2 + r() * .8, d + .9, ang));
        inst(BOX, MAT.white, M(x + Math.cos(ang) * w * .28, y + hh + 1.2, z - Math.sin(ang) * w * .28, .7, 1.8, .7, ang));
        addCol({ x, z, hx: w / 2 + .3, hz: d / 2 + .3, ang }); marks.houses.push([x, z, w + .9, d + .9, ang, '#' + rc.color.getHexString(), hh + 2]);
        // a little garden: a tree and a fence towards the road
        const gx = x - p.nx * s * (d / 2 + 3.5), gz = z - p.nz * s * (d / 2 + 3.5), tx = x + Math.cos(ang) * (w / 2 + 3.5), tz = z - Math.sin(ang) * (w / 2 + 3.5);
        if (r() < .6 && freeSpot(tx, tz, 3)) tree.broad(tx, terrainAt(tx, tz), tz, .6 + r() * .3);
        for (let q = -3; q <= 3; q++) { const fx = gx + Math.cos(ang) * q * 1.6, fz = gz - Math.sin(ang) * q * 1.6; if (roadDAt(fx, fz) < 2.5) continue; inst(BOX, MAT.white, M(fx, terrainAt(fx, fz) + .5, fz, .14, 1, .14)); }
        if (roadFootprintClear({ x: gx, z: gz, hx: 4.8, hz: .1, ang })) {
          inst(BOX, MAT.white, M(gx, terrainAt(gx, gz) + .8, gz, 9.6, .12, .08, ang)); inst(BOX, MAT.white, M(gx, terrainAt(gx, gz) + .4, gz, 9.6, .12, .08, ang));
        } } }
  }

  // -- road dressing: red-white kerbs in the bends, street lamps, zone gates, sidewalks in the city --
  function ribbon(rd, a, b, keep, mat, lift = .1, vScale = 3) {
    const pos = [], uv = [], idx = [], n = rd.pts.length; let acc = 0, run = -1;
    for (let k = 0; k < n; k++) { const p = rd.pts[k]; if (k) acc += Math.hypot(p.x - rd.pts[k - 1].x, p.z - rd.pts[k - 1].z); if (!keep(p, k)) { run = -1; continue; }
      const v = pos.length / 3; for (const o of [a, b]) { pos.push(p.x + p.nx * o, p.y + lift, p.z + p.nz * o); uv.push(o === a ? 0 : 1, acc / vScale); }
      if (run >= 0) idx.push(run, v, run + 1, run + 1, v, v + 1); run = v; }
    if (!idx.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m);
  }
  const stripeTex = (c1, c2, w = 8, h = 32, line) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2; if (line) line(g); else g.fillRect(0, 0, w, h / 2); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  {
    const kerbMat = new THREE.MeshStandardMaterial({ map: stripeTex('#f4f4f0', '#e0302a'), roughness: .7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const rd of roads) { if (rd.id.startsWith('city') || rd.id === 'docks') continue;
      const n = rd.pts.length, P = rd.pts, turn = new Float32Array(n);
      for (let k = 0; k < n; k++) { const A = P[rd.closed ? (k - 6 + n) % n : Math.max(0, k - 6)], B = P[rd.closed ? (k + 6) % n : Math.min(n - 1, k + 6)]; let d = B.angle - A.angle; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; turn[k] = d; }
      for (const side of [-1, 1]) ribbon(rd, side * (rd.hw - 1.1), side * (rd.hw + .5), (p, k) => !p.bridge && Math.abs(turn[k]) > .26 && rampHeight(p.x, p.z) < -1e8, kerbMat, .1, 2.4);
    }
    // sidewalks with slabs in the city
    const walkMat = new THREE.MeshStandardMaterial({ map: stripeTex('#c8c4bc', '#a8a49c', 32, 32, g => { g.fillRect(0, 0, 32, 1.5); g.fillRect(0, 0, 1.5, 32); g.fillStyle = '#8a8680'; g.fillRect(30, 0, 2, 32); }), roughness: .9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (const rd of roads) { if (!(rd.id.startsWith('city') || rd.id === 'docks' || rd.id === 'avenue' || rd.id === 'ring')) continue;
      for (const side of [-1, 1]) ribbon(rd, side * (rd.hw + .3), side * (rd.hw + 3.6), p => { if (zoneAt(p.x, p.z).id !== 'city' || p.bridge) return false; const x = p.x + p.nx * side * (rd.hw + 2), z = p.z + p.nz * side * (rd.hw + 2), nr = nearestRoad(x, z, 20); return !(nr && nr.road !== rd && nr.d < 4.5); }, walkMat, .12, 2); }
    // street lamps along the country roads
    const pole = std(0x3a3e46, { metalness: .4, roughness: .5 }), bulb = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffd88a, emissiveIntensity: .9 });
    for (const rd of roads) { if (!['ring', 'avenue', 'east', 'west', 'beach'].includes(rd.id)) continue;
      for (let k = 6, q = 0; k < rd.pts.length - 6; k += 20, q++) { const p = rd.pts[k]; if (p.bridge || zoneAt(p.x, p.z).id === 'city') continue; const s = q % 2 ? 1 : -1, x = p.x + p.nx * s * (rd.hw + 1.8), z = p.z + p.nz * s * (rd.hw + 1.8); if (!freeSpot(x, z, 1)) continue; const y = terrainAt(x, z);
        inst(CYLLOW, pole, M(x, y + 3.6, z, .14, 7.2, .14)); inst(BOX, pole, M(x - p.nx * s * 1.1, y + 7.2, z - p.nz * s * 1.1, 2.4, .16, .16, p.angle + Math.PI / 2)); inst(BOX, bulb, M(x - p.nx * s * 2.1, y + 7.05, z - p.nz * s * 2.1, .9, .18, .5, p.angle + Math.PI / 2)); addCol({ x, z, r: .35 }); } }
    // gates where a road enters a new zone: the zone's name in its colour, readable from both sides
    const gates = [], gateTex = (Z) => { const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#1a2128'); gr.addColorStop(1, '#0c1014'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 160);
      g.fillStyle = Z.color; g.fillRect(0, 0, 1024, 12); g.fillRect(0, 148, 1024, 12); g.font = 'italic 900 92px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = Z.color; g.fillText(Z.name.toUpperCase(), 512, 84, 960);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const gateMats = new Map(), gm = Z => { if (!gateMats.has(Z.id)) gateMats.set(Z.id, new THREE.MeshBasicMaterial({ map: gateTex(Z) })); return gateMats.get(Z.id); };
    for (const rd of roads) { if (rd.id.startsWith('city') || rd.id === 'docks') continue;
      for (let k = 4; k < rd.pts.length; k += 2) { const p = rd.pts[k], A = zoneAt(rd.pts[k - 4].x, rd.pts[k - 4].z), B = zoneAt(p.x, p.z); if (A === B || p.bridge || rampHeight(p.x, p.z) > -1e8) continue;
        if (gates.some(G => Math.hypot(G.x - p.x, G.z - p.z) < 140)) continue;
        if ([-1, 1].some(sd => !roadFootprintClear({ x: p.x + p.nx * sd * (rd.hw + 3.5), z: p.z + p.nz * sd * (rd.hw + 3.5), r: 1.1 }))) continue;
        gates.push({ x: p.x, z: p.z });
        const g = new THREE.Group(), W = rd.w + 7, col = std(new THREE.Color(B === ZONES[6] ? A.color : B.color).getHex(), { roughness: .5 });
        for (const sd of [-1, 1]) { const pl = new THREE.Mesh(BOX, col); pl.scale.set(1.3, 8.4, 1.3); pl.position.set(sd * W / 2, 4.2, 0); pl.castShadow = true; g.add(pl); const cap = new THREE.Mesh(BOX, MAT.white); cap.scale.set(1.6, .4, 1.6); cap.position.set(sd * W / 2, 8.6, 0); g.add(cap); addCol({ x: p.x + p.nx * sd * W / 2, z: p.z + p.nz * sd * W / 2, r: 1.1 }); }
        const bar = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x12171c })); bar.scale.set(W, 2.9, .5); bar.position.y = 6.9; bar.castShadow = true; g.add(bar);
        for (const [Z, ry] of [[B, Math.PI], [A, 0]]) { const pn = new THREE.Mesh(new THREE.PlaneGeometry(W - .4, 2.6), gm(Z)); pn.position.set(0, 6.9, ry ? -.27 : .27); pn.rotation.y = ry; g.add(pn); }
        g.position.set(p.x, p.y, p.z); g.rotation.y = p.angle; group.add(g); } }
  }

  // -- the coast: boulders on the shoreline --
  for (let i = 0; i < 2600; i++) { const a = r() * TAU, d = 600 + r() * 260, x = Math.cos(a) * d, z = Math.sin(a) * d, h = terrainAt(x, z); if (h < -2.5 || h > 2.2) continue; const Z = zoneAt(x, z).id; if (Z === 'beach' || Z === 'city') continue; if (!freeSpot(x, z, 6)) continue; tree.rock(x, h - .4, z, 1.6 + r() * 3.6, Z === 'canyon' ? MAT.redRock : Z === 'volcano' ? MAT.darkRock : MAT.rock); }

  // -- beach: surfboards in the sand, lifeguard towers, a volleyball net --
  {
    const boards = [0xff5a5a, 0x3ab8ff, 0xffd04a, 0x5ad86a, 0xff8ad8, 0xffffff].map(c => std(c, { roughness: .4 }));
    scatter(26, 'beach', 4, (x, y, z) => { if (y > 4.5) return false; inst(BOX, boards[Math.floor(r() * boards.length)], M(x, y + 1, z, .55, 2.4, .1, r() * TAU, (r() - .5) * .3)); addCol({ x, z, r: .4 }); });
    scatter(3, 'beach', 8, (x, y, z) => { const a = r() * TAU; for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) inst(CYLLOW, MAT.white, M(x + dx * 1.1, y + 1.8, z + dz * 1.1, .12, 3.6, .12)); inst(BOX, MAT.red, M(x, y + 4.2, z, 2.8, 1.8, 2.8, a)); inst(ROOF, MAT.white, M(x, y + 5.6, z, 3, 1.2, 3, a)); addCol({ x, z, hx: 1.5, hz: 1.5, ang: a }); marks.houses.push([x, z, 3, 3, a, '#e03a30', 5]); });
    scatter(2, 'beach', 10, (x, y, z) => { const a = r() * TAU, ca = Math.cos(a), sa = Math.sin(a); for (const s of [-1, 1]) inst(CYLLOW, MAT.steel, M(x + ca * s * 4.5, y + 1.3, z - sa * s * 4.5, .08, 2.6, .08)); inst(BOX, MAT.white, M(x, y + 2.2, z, 9, .8, .04, a)); addCol({ x: x + ca * 4.5, z: z - sa * 4.5, r: .3 }); addCol({ x: x - ca * 4.5, z: z + sa * 4.5, r: .3 }); });
  }

  // -- jungle: giant mushrooms and mossy boulders --
  {
    const cap = std(0xe0302a), dots = std(0xffffff), moss = std(0x5a7a3a, { flatShading: true });
    scatter(90, 'jungle', 4, (x, y, z) => { const s = .6 + r() * (r() < .15 ? 2.4 : .8); inst(CYL, MAT.white, M(x, y + .7 * s, z, .22 * s, 1.4 * s, .22 * s)); inst(CONE, cap, M(x, y + 1.6 * s, z, 1 * s, .7 * s, 1 * s)); for (let q = 0; q < 3; q++) { const a = r() * TAU; inst(ROCK, dots, M(x + Math.cos(a) * .45 * s, y + 1.55 * s, z + Math.sin(a) * .45 * s, .12 * s)); } if (s > 1.2) addCol({ x, z, r: .3 * s }); });
    scatter(50, 'jungle', 5, (x, y, z) => tree.rock(x, y, z, 2 + r() * 3, moss));
  }

  // -- volcano: glowing lava seams in the slopes --
  {
    const glowM = new THREE.MeshBasicMaterial({ color: 0xff5a10, toneMapped: false });
    scatter(160, 'volcano', 4, (x, y, z) => { const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z); if (d < VOLCANO.rim + 12 || d > 240) return false; const a = Math.atan2(z - VOLCANO.z, x - VOLCANO.x) + (r() - .5) * .6, L = 4 + r() * 10;
      inst(BOX, glowM, M(x, y - .12, z, .5 + r() * .5, .5, L, Math.PI / 2 - a), false); });
  }

  // -- city rooftops: air conditioners, water tanks, antennas --
  {
    const ac = std(0xd8dce0, { metalness: .3 }), tank = std(0x8a6a4a);
    for (const [x, y, z, w, d] of marks.roofs) { const n = 1 + Math.floor(r() * 3);
      for (let q = 0; q < n; q++) inst(BOX, ac, M(x + (r() - .5) * w * .6, y + .7, z + (r() - .5) * d * .6, 1.6 + r(), 1.2, 1.4 + r(), Math.floor(r() * 2) * Math.PI / 2));
      if (r() < .3) { const tx = x + (r() - .5) * w * .4, tz = z + (r() - .5) * d * .4; for (const [dx, dz] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) inst(CYLLOW, MAT.steel, M(tx + dx, y + 1, tz + dz, .08, 2, .08)); inst(CYL, tank, M(tx, y + 3, tz, 1.4, 2.2, 1.4)); inst(CONE, tank, M(tx, y + 4.5, tz, 1.5, .8, 1.5)); } }
  }

  // -- grass tufts and flowers, swaying in the wind; stored in 100 m chunks so only the ones near the camera are drawn --
  {
    const windU = { value: 0 }; updaters.push((dt, t) => { windU.value = t; });
    const sway = (mat, amt) => { mat.onBeforeCompile = sh => { sh.uniforms.uWind = windU; sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float ph = instanceMatrix[3].x * .21 + instanceMatrix[3].z * .17;
      transformed.x += sin(uWind * 1.7 + ph) * ${amt.toFixed(2)} * position.y; transformed.z += cos(uWind * 1.3 + ph) * ${(amt * .6).toFixed(2)} * position.y;
      #endif`); }; return mat; };
    const tuft = (() => { const P = [], C = [], rr = rng(3); for (let b = 0; b < 7; b++) { const a = rr() * TAU, d = rr() * .28, cx = Math.cos(a) * d, cz = Math.sin(a) * d, w = .07 + rr() * .05, h = .5 + rr() * .55, ba = rr() * TAU, lx = Math.cos(ba) * w, lz = Math.sin(ba) * w, tx = cx + Math.cos(a) * h * .4, tz = cz + Math.sin(a) * h * .4;
        P.push(cx - lx, 0, cz - lz, cx + lx, 0, cz + lz, tx, h, tz); C.push(.5, .52, .45, .5, .52, .45, 1.2, 1.2, 1.05); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => i % 3 === 1 ? 1 : 0), 3)); return g; })();
    const bloom = (() => { const g = new THREE.IcosahedronGeometry(.13, 0); g.translate(0, .62, 0); const s = new THREE.CylinderGeometry(.015, .015, .6, 3); s.translate(0, .3, 0); return mergeGeometries([g, s.toNonIndexed()]); })();
    const grassM = sway(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), .22), flowerM = sway(new THREE.MeshStandardMaterial({ roughness: .8 }), .16);
    const DENS = { plains: 1, jungle: .85, city: .3, beach: .2, glacier: .55, volcano: .3, canyon: .1 }, FLOW = [0xffe03a, 0xffffff, 0xff7ab0, 0xe0303a, 0xa070ff, 0x5ab0ff, 0xff9a2a];
    const chunks = new Map(), cc = new THREE.Color();
    const add = (kind, x, y, z, s, col) => { const k = Math.floor(x / 100) * 1000 + Math.floor(z / 100); let C = chunks.get(k); if (!C) chunks.set(k, C = { g: [[], []], f: [[], []], x: (Math.floor(x / 100) + .5) * 100, z: (Math.floor(z / 100) + .5) * 100 });
      const a = r() * TAU, ca = Math.cos(a) * s, sa = Math.sin(a) * s, sy = s * (.8 + r() * .5); C[kind][0].push(ca, 0, -sa, 0, 0, sy, 0, 0, sa, 0, ca, 0, x, y, z, 1); C[kind][1].push(col.r, col.g, col.b); };
    for (let i = 0; i < 360000; i++) {
      const x = (r() * 2 - 1) * 820, z = (r() * 2 - 1) * 820, h = terrainAt(x, z); if (h < 2.4) continue;
      const Z = zoneAt(x, z).id; if (r() > DENS[Z]) continue;
      if (fbm(x * .035 + 5, z * .035, 2) < -.25 && r() < .8) continue;
      if (Z === 'glacier' && h > 36) continue; if (Z === 'volcano' && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 200) continue;
      if (roadDAt(x, z) < 2 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2 || inField(x, z) || rampHeight(x, z) > -1e8) continue;
      const ix = clamp(Math.round((x + HALF) / STEP), 0, N - 1), iz = clamp(Math.round((z + HALF) / STEP), 0, N - 1), q = (iz * N + ix) * 3;
      cc.setRGB(TCOL[q] * 1.1, TCOL[q + 1] * 1.15, TCOL[q + 2] * 1.05);
      add('g', x, h - .05, z, .9 + r() * .9, cc);
      if ((Z === 'plains' || Z === 'jungle' || Z === 'city' || Z === 'glacier') && fbm(x * .06 + 9, z * .06 - 3, 2) > .12 && r() < .75) add('f', x + (r() - .5), h - .05, z + (r() - .5), .8 + r() * .5, cc.setHex(FLOW[Math.floor(hash(Math.floor(x / 9), Math.floor(z / 9)) * FLOW.length)]));
    }
    const meshes = [];
    for (const C of chunks.values()) for (const [kind, geo, mat] of [['g', tuft, grassM], ['f', bloom, flowerM]]) { const [L, CL] = C[kind]; if (!CL.length) continue;
      const im = new THREE.InstancedMesh(geo, mat, CL.length / 3); im.instanceMatrix.array.set(L); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CL), 3); im.computeBoundingSphere(); im.receiveShadow = true; group.add(im); meshes.push({ im, x: C.x, z: C.z }); }
    updaters.push((dt, t, cam) => { if (!cam) return; const px = cam.position.x, pz = cam.position.z; for (const m of meshes) m.im.visible = Math.hypot(m.x - px, m.z - pz) < 230; });
  }

  // Reject overlaps with existing houses/trees as well as roads and boss arenas.
  const occupied = (x, z, radius) => {
    const ci = Math.floor(x / CC), cj = Math.floor(z / CC), reach = Math.ceil(radius / CC) + 1;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (const c of colGrid.get(key(ci + i, cj + j)) || []) {
      if (Math.hypot(x - c.x, z - c.z) < radius + (c.r ?? Math.hypot(c.hx, c.hz))) return true;
    }
    return false;
  };
  createScenery({ group, roads, terrainAt, zoneAt, freeSpot, occupied, addCol, marks, updaters, roadFootprintClear });
  createLandmarks({ group, roads, terrainAt, roadFootprintClear, addCol, marks, updaters });

  // ----- build instanced batches -----
  for (const { geo, mat, list, cast } of batches.values()) { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); }

  // ----- collisions: circle body against circles and rotated boxes -----
  function collide(b, radius = 1.15) {
    let hit = 0; const ci = Math.floor(b.x / CC), cj = Math.floor(b.z / CC), seen = new Set();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const c of colGrid.get(key(ci + i, cj + j)) || []) {
      if (seen.has(c)) continue; seen.add(c);
      if (!overlapsHeight(b, c)) continue;
      let nx, nz, pen;
      if (c.r != null) { const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz), R = c.r + radius; if (d >= R) continue; if (d < 1e-6) { const speed = Math.hypot(b.vx, b.vz); nx = speed > .01 ? -b.vx / speed : 1; nz = speed > .01 ? -b.vz / speed : 0; } else { nx = dx / d; nz = dz / d; } pen = R - d; }
      else { const sa = Math.sin(c.ang), ca = Math.cos(c.ang), dx = b.x - c.x, dz = b.z - c.z, lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
        const px = clamp(lx, -c.hx, c.hx), pz = clamp(lz, -c.hz, c.hz); let ex = lx - px, ez = lz - pz, d = Math.hypot(ex, ez);
        if (d >= radius) continue;
        if (d < 1e-6) { const ox = c.hx - Math.abs(lx), oz = c.hz - Math.abs(lz); if (ox < oz) { ex = Math.sign(lx) || 1; ez = 0; d = 0; pen = ox + radius; } else { ex = 0; ez = Math.sign(lz) || 1; d = 0; pen = oz + radius; } }
        else { pen = radius - d; ex /= d; ez /= d; }
        nx = ex * ca + ez * sa; nz = -ex * sa + ez * ca; }
      b.x += nx * pen; b.z += nz * pen;
      const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= nx * vn * 1.35; b.vz -= nz * vn * 1.35; hit = Math.max(hit, -vn); }
    }
    return hit;
  }

  // ----- map image (for the minimap and the big map) -----
  // painted like a printed atlas: terrain colours from the 3D world, hill shading, contour lines, water depth,
  // every tree and roof as seen from above, then the road network with casings
  const MS = 1024, mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = MS;
  {
    const g = mapCanvas.getContext('2d'), img = g.createImageData(MS, MS), s = HALF * 2 / MS, D = img.data;
    const toS = v => v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055;
    const LX = -.55, LY = .7, LZ = -.45; // light from the north-west
    const water = [[0, [.62, .9, .86]], [1.5, [.4, .82, .84]], [6, [.2, .66, .8]], [16, [.12, .5, .72]], [30, [.08, .34, .58]]];
    const wcol = d => { for (let k = 1; k < water.length; k++) if (d <= water[k][0] || k === water.length - 1) { const [d0, c0] = water[k - 1], [d1, c1] = water[k], f = clamp((d - d0) / (d1 - d0), 0, 1); return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)]; } };
    for (let py = 0; py < MS; py++) for (let px = 0; px < MS; px++) {
      const x = -HALF + (px + .5) * s, z = -HALF + (py + .5) * s, i = (py * MS + px) * 4;
      const h = terrainAt(x, z), hr = terrainAt(x + 3, z), hd = terrainAt(x, z + 3), hl = h - (hr - h), hu = h - (hd - h);
      let R, G, B;
      if (h < SEA - .25) {
        const d = SEA - h; [R, G, B] = wcol(d);
        const band = (d / 3.2) % 1; if (d < 20 && band < .14) { const k = .07 * (1 - d / 20); R += k; G += k; B += k; }
        if (d < .9) { const k = (1 - d / .9) * .55; R = lerp(R, 1, k); G = lerp(G, 1, k); B = lerp(B, 1, k); }
      } else {
        const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001), ii = Math.floor(fx), jj = Math.floor(fz), u = fx - ii, v = fz - jj;
        const C = ch => lerp(lerp(TCOL[(jj * N + ii) * 3 + ch], TCOL[(jj * N + ii + 1) * 3 + ch], u), lerp(TCOL[((jj + 1) * N + ii) * 3 + ch], TCOL[((jj + 1) * N + ii + 1) * 3 + ch], u), v);
        R = toS(C(0)); G = toS(C(1)); B = toS(C(2));
        // a bit more colour than the 3D view, a map should read at a glance
        const m = (R + G + B) / 3; R = m + (R - m) * 1.25; G = m + (G - m) * 1.25; B = m + (B - m) * 1.25;
        // hill shading
        let nx = -(hr - hl) / 6, nz = -(hd - hu) / 6; const nl = Math.hypot(nx, 1, nz); const sh = (nx * LX + LY + nz * LZ) / nl / LY;
        const f = clamp(1 + (sh - 1) * 1.15, .5, 1.3); R *= f; G *= f; B *= f;
        // contour lines every 10 m, stronger every 50 m
        if (h > 1.5) { const c0 = Math.floor(h / 10); if (Math.floor(hr / 10) !== c0 || Math.floor(hd / 10) !== c0) { const k = Math.floor(Math.max(h, hr, hd) / 10) % 5 === 0 ? .72 : .86; R *= k; G *= k; B *= k; } }
        // wet sand at the waterline
        if (h < SEA + .5) { R *= .9; G *= .9; B *= .88; }
      }
      D[i] = clamp(R, 0, 1) * 255; D[i + 1] = clamp(G, 0, 1) * 255; D[i + 2] = clamp(B, 0, 1) * 255; D[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const P = (x, z) => [(x + HALF) / s, (z + HALF) / s], px = m => m / s;
    // frozen lake: cracks
    { const [lx, ly] = P(LAKE.x, LAKE.z), rr = rng(7); g.save(); g.beginPath(); g.arc(lx, ly, px(LAKE.r), 0, TAU); g.clip(); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = .8;
      for (let k = 0; k < 16; k++) { let x = lx + (rr() - .5) * px(LAKE.r) * 1.6, y = ly + (rr() - .5) * px(LAKE.r) * 1.6, a = rr() * TAU; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 5; q++) { a += (rr() - .5) * 1.4; x += Math.cos(a) * 5; y += Math.sin(a) * 5; g.lineTo(x, y); } g.stroke(); }
      g.restore(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(lx, ly, px(LAKE.r), 0, TAU); g.stroke(); }
    // lava: glowing crater
    { const [vx, vy] = P(VOLCANO.x, VOLCANO.z), gr = g.createRadialGradient(vx, vy, 0, vx, vy, px(VOLCANO.rim)); gr.addColorStop(0, 'rgba(255,240,120,1)'); gr.addColorStop(.22, 'rgba(255,110,20,1)'); gr.addColorStop(.32, 'rgba(200,40,10,.75)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(vx, vy, px(VOLCANO.rim), 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,120,40,.85)'; g.lineWidth = 1.2; const rr = rng(11); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + rr() * .2, r0 = px(VOLCANO.lavaR), r1 = r0 + px(14 + rr() * 18); g.beginPath(); g.moveTo(vx + Math.cos(a) * r0, vy + Math.sin(a) * r0); g.lineTo(vx + Math.cos(a + .1) * r1, vy + Math.sin(a + .1) * r1); g.stroke(); } }
    // trees and rocks: shadow first, then the crown with a highlight
    const TREE = ['#5cbf4a', '#2f8a3a', '#2e5e3e', '#e8f0f6', '#5a9a44', '#7a5a46', '#9a928a', '#3a3030', '#b8704a'];
    for (const [x, z, rad] of marks.trees) { const [u, v] = P(x, z), R = Math.max(1, px(rad) * 1.05); g.fillStyle = 'rgba(0,20,0,.28)'; g.beginPath(); g.arc(u + R * .45, v + R * .45, R, 0, TAU); g.fill(); }
    for (const [x, z, rad, k] of marks.trees) { const [u, v] = P(x, z), R = Math.max(1, px(rad) * 1.05); g.fillStyle = TREE[k]; g.beginPath(); g.arc(u, v, R, 0, TAU); g.fill(); if (R > 1.4 && k < 4) { g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(u - R * .3, v - R * .3, R * .45, 0, TAU); g.fill(); } }
    for (const [x, z, rad, col] of marks.dots) { const [u, v] = P(x, z); g.fillStyle = col; g.beginPath(); g.arc(u, v, Math.max(1, px(rad)), 0, TAU); g.fill(); }
    // roads: dark casing, light fill (main roads in gold), centre dashes on the big ones, bridges with railings
    g.lineCap = 'round'; g.lineJoin = 'round';
    const trace = rd => { g.beginPath(); rd.pts.forEach((p, k) => { const [u, v] = P(p.x, p.z); k ? g.lineTo(u, v) : g.moveTo(u, v); }); if (rd.closed) g.closePath(); };
    const MAIN = ['ring', 'avenue'];
    for (const rd of roads) { trace(rd); g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = px(rd.w) + 6; g.stroke(); }
    for (const rd of roads) { trace(rd); g.strokeStyle = '#2a2d36'; g.lineWidth = px(rd.w) + 2.4; g.stroke(); }
    for (const rd of roads) for (let k = 0; k < rd.pts.length - 1; k++) { const p = rd.pts[k], q = rd.pts[k + 1]; if (!p.bridge) continue; const [u0, v0] = P(p.x, p.z), [u1, v1] = P(q.x, q.z); g.strokeStyle = '#e8e4da'; g.lineWidth = px(rd.w) + 4; g.beginPath(); g.moveTo(u0, v0); g.lineTo(u1, v1); g.stroke(); }
    for (const rd of roads) { trace(rd); g.strokeStyle = MAIN.includes(rd.id) ? '#ffd166' : '#fbf8f0'; g.lineWidth = px(rd.w) * .82; g.stroke(); }
    g.setLineDash([5, 6]); for (const rd of roads) if (MAIN.includes(rd.id)) { trace(rd); g.strokeStyle = 'rgba(190,120,20,.85)'; g.lineWidth = .9; g.stroke(); } g.setLineDash([]);
    // ramps and boost pads
    for (const R of ramps) { const [u, v] = P(R.x, R.z); g.save(); g.translate(u, v); g.rotate(-R.angle); g.fillStyle = '#ff5a2a'; g.strokeStyle = '#fff'; g.lineWidth = .8; g.beginPath(); g.moveTo(-px(R.w) / 2, -px(R.len) / 2); g.lineTo(px(R.w) / 2, -px(R.len) / 2); g.lineTo(0, px(R.len) / 2); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    for (const p of pads) { const [u, v] = P(p.x, p.z); g.fillStyle = '#ff8a1a'; g.beginPath(); g.arc(u, v, 1.6, 0, TAU); g.fill(); }
    // roofs: a soft shadow towards the south-east (longer for tall towers), then the roof with a lit edge
    const roof = (x, z, w, d, ang, col, hgt, ship) => { const [u, v] = P(x, z), W = px(w), Dd = px(d), off = Math.min(9, 1 + hgt * .09);
      g.save(); g.translate(u, v); g.rotate(-ang);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.save(); g.rotate(ang); g.translate(off * .8, off); g.rotate(-ang); g.fillRect(-W / 2, -Dd / 2, W, Dd); g.restore();
      g.fillStyle = col; if (ship) { g.beginPath(); g.moveTo(-W / 2, -Dd / 2 + W * .3); g.lineTo(0, -Dd / 2 - W * .3); g.lineTo(W / 2, -Dd / 2 + W * .3); g.lineTo(W / 2, Dd / 2); g.lineTo(-W / 2, Dd / 2); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(-W * .35, Dd / 2 - W * 1.1, W * .7, W * .8); }
      else { g.fillRect(-W / 2, -Dd / 2, W, Dd); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-W / 2, -Dd / 2, W, Math.min(1.4, Dd * .3)); g.fillRect(-W / 2, -Dd / 2, Math.min(1.4, W * .3), Dd); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = .6; g.strokeRect(-W / 2, -Dd / 2, W, Dd); }
      g.restore(); };
    for (const hs of marks.houses) roof(...hs);
    // windmills: little white crosses
    for (const m of marks.pois.filter(q => q.kind === 'mill')) { const [u, v] = P(m.x, m.z); g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(u - 5, v - 5); g.lineTo(u + 5, v + 5); g.moveTo(u + 5, v - 5); g.lineTo(u - 5, v + 5); g.stroke(); g.fillStyle = '#e03a30'; g.beginPath(); g.arc(u, v, 2, 0, TAU); g.fill(); }
    // a light paper grain over everything
    const gr = rng(5); for (let k = 0; k < 9000; k++) { g.fillStyle = gr() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)'; g.fillRect(gr() * MS, gr() * MS, 1.5, 1.5); }
  }
  const worldToMap = (x, z) => [(x + HALF) / (HALF * 2), (z + HALF) / (HALF * 2)];

  const spawn = (() => { const rd = roads.find(q => q.id === 'avenue'), p = rd.pts[Math.floor(rd.pts.length * .12)]; return { x: p.x, z: p.z, y: p.y, angle: p.angle + Math.PI }; })();
  function update(dt, t, cam, pl) { for (const u of updaters) u(dt, t, cam, pl); }
  return { group, ground, terrainAt, surface, zoneAt, nearestRoad, collide, update, roads, ramps, pads, mapCanvas, worldToMap, spawn, HALF, freeSpot, rawAt, SP, addCol, pois: marks.pois.filter(q => q.icon) };
}

// ---------- shared small helpers ----------
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CYLLOW = new THREE.CylinderGeometry(1, 1, 1, 6), CONE = new THREE.ConeGeometry(1, 1, 12);
const ROOF = new THREE.ConeGeometry(.75, 1, 4); ROOF.rotateY(Math.PI / 4);
const ROCK = new THREE.IcosahedronGeometry(1, 0);
const ROOF2 = (() => { const sh = new THREE.Shape(); sh.moveTo(-.5, 0); sh.lineTo(.5, 0); sh.lineTo(0, 1); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -.5); g.rotateY(Math.PI / 2); return g; })();
// ground material: the vertex colours carry the zones, a tiling detail texture (sampled at two scales so it never looks tiled)
// adds grain up close, and steep faces get layered rock strata in world space
function terrainMaterial() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S), rr = rng(31);
  const ph = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), H = (a, b) => hash(((a % p) + p) % p, ((b % p) + p) % p); return lerp(lerp(H(i, j), H(i + 1, j), su), lerp(H(i, j + 1), H(i + 1, j + 1), su), sv); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let v = 0, a = .5, tot = 0; for (const p of [4, 8, 16, 32, 64]) { v += ph(x / S * p, y / S * p, p) * a; tot += a; a *= .62; } v = .64 + (v / tot) * .32; const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 2600; k++) { const x = rr() * S, y = rr() * S, a = rr() * TAU, l = 2 + rr() * 5; g.strokeStyle = rr() < .6 ? `rgba(0,0,0,${.05 + rr() * .1})` : `rgba(255,255,255,${.05 + rr() * .1})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(240, 240); t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, map: t });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;').replace('#include <map_fragment>', `
      vec3 dA = texture2D(map, vMapUv).rgb, dB = texture2D(map, vMapUv * .173 + .31).rgb;
      vec3 det = dA * dB * 1.55;
      float slope = 1. - clamp(vWN.y, 0., 1.);
      float dR = texture2D(map, vec2((vWP.x + vWP.z) * .03, vWP.y * .22)).r;
      float strata = .78 + .22 * sin(vWP.y * 1.25 + dR * 5.);
      det = mix(det, vec3(dR * 1.3 * strata), smoothstep(.2, .48, slope));
      diffuseColor.rgb *= det;`);
  };
  return m;
}
export function glowTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function textSign(text, bg, fg, accent) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 192); if (accent) { g.fillStyle = accent; g.fillRect(0, 168, 1024, 24); }
  g.fillStyle = fg; g.font = '900 120px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 90, 980);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group(); const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); grp.add(board);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(CYLLOW, new THREE.MeshStandardMaterial({ color: 0x555a62 })); p.scale.set(.2, 8, .2); p.position.set(s * 6, -4, -.1); grp.add(p); }
  return grp;
}
