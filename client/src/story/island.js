import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sculpt } from '../game/sculpt.js';
import { person } from '../game/critters.js';

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
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const s of roadGrid.get(key(ci + i, cj + j)) || []) if (s.rd !== rd && s.rd.w > rd.w - .1 && ROAD_DEFS.indexOf(s.rd) < ROAD_DEFS.indexOf(rd)) {
      const d = Math.hypot(s.p.x - p.x, s.p.z - p.z); if (d < s.rd.hw + 30) p.y = lerp(s.p.y, p.y, smooth(s.rd.hw, s.rd.hw + 30, d));
    }
  }

  // ----- bake: the final height grid with the roads cut / filled in -----
  const H = new Float32Array(N * N), ROADD = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -HALF + i * STEP, z = -HALF + j * STEP, k = j * N + i; let h = RAW[k];
    const nr = nearestRoad(x, z, 34); ROADD[k] = nr ? nr.d : 99;
    if (nr && !nr.bridge) { const w = smooth(1.5, 18, nr.d); h = lerp(nr.y - .08, h, w); }
    H[k] = h;
  }
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
  {
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N - 1, N - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; for (let k = 0; k < pos.count; k++) pos.setY(k, H[k]);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), h = H[k], ny = nrm.getY(k), n = fbm(x * .05, z * .05, 3) * .5 + .5, n2 = fbm(x * .011 + 40, z * .011, 3) * .5 + .5;
      const Z = zoneAt(x, z).id, dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
      if (h < SEA + .2) c.setRGB(.86, .78, .58);
      else if (h < 3.4 || Z === 'beach') c.setRGB(.95 - n * .05, .86 - n * .06, .62 - n * .05);
      else if (Z === 'canyon') { const band = Math.sin(h * .55) * .5 + .5; c.setRGB(.82 - band * .14, .45 - band * .08 + n * .05, .28 - band * .06); if (ny > .9) c.lerp(c2.setRGB(.86, .64, .42), .5); }
      else if (Z === 'volcano') { c.setRGB(.2 + n * .06, .17 + n * .04, .17 + n * .04); if (dv < VOLCANO.rim + 4) c.lerp(c2.setRGB(.32, .14, .08), .5); if (dv > 220) c.lerp(c2.setRGB(.35, .42, .22), smooth(220, 300, dv)); }
      else if (Z === 'glacier') { const snow = smooth(34, 60, h) * (ny > .55 ? 1 : .3); c.setRGB(.36 + n * .06, .5 + n * .06, .28); c.lerp(c2.setRGB(.95, .97, 1), snow); if (ny < .55) c.lerp(c2.setRGB(.5, .52, .58), .7); }
      else if (Z === 'jungle') c.setRGB(.16 + n * .07, .42 + n * .1, .16 + n * .04);
      else if (Z === 'city') c.setRGB(.42 + n * .06, .6 + n * .06, .3);
      else { const field = Math.floor((fbm(x * .004, z * .004, 2) * .5 + .5) * 5); c.setRGB(...[[.48, .68, .28], [.62, .7, .3], [.72, .7, .36], [.42, .6, .26], [.56, .74, .34]][field]); c.multiplyScalar(.92 + n * .16); }
      if (Z !== 'glacier' && Z !== 'volcano' && Z !== 'canyon' && ny < .72 && h > 4) c.lerp(c2.setRGB(.52, .46, .4), smooth(.72, .5, ny));
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r) c.setRGB(.72, .88, .96);
      if (ROADD[k] < 4 && ROADD[k] > -2) c.multiplyScalar(.82); // shoulder
      c.multiplyScalar(.9 + n2 * .14);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }));
    mesh.receiveShadow = true; group.add(mesh);
  }

  // ----- sea -----
  const waveTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const fx = x / 256 * TAU, fy = y / 256 * TAU, dx = Math.cos(fx * 3 + fy * 2) * .5 + Math.cos(fx * 7 - fy * 5) * .25 + Math.cos(fx * 13 + fy * 11) * .12, dy = Math.cos(fy * 4 - fx) * .5 + Math.cos(fy * 9 + fx * 6) * .25 + Math.cos(fy * 15 - fx * 12) * .12, i = (y * 256 + x) * 4; img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(90, 90); return t; })();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x1aa0c8, roughness: .1, metalness: .1, normalMap: waveTex, normalScale: new THREE.Vector2(.5, .5), transparent: true, opacity: .86 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA; sea.receiveShadow = true; group.add(sea);
  updaters.push((dt, t) => waveTex.offset.set(t * .004, t * .007));

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

  // ----- instanced props + colliders -----
  const batches = new Map();
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  const M = (x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) => { e4.set(rx, ry, rz); q4.setFromEuler(e4); return m4.compose(v4.set(x, y, z), q4, s4.set(sx, sy, sz)).clone(); };
  function inst(geo, mat, m, cast = true) { const k = geo.uuid + mat.uuid; if (!batches.has(k)) batches.set(k, { geo, mat, list: [], cast }); batches.get(k).list.push(m); }
  const colliders = [], colGrid = new Map(), CC = 24;
  function addCol(c) { colliders.push(c); const R = c.r ?? Math.hypot(c.hx, c.hz); for (let i = Math.floor((c.x - R) / CC); i <= Math.floor((c.x + R) / CC); i++) for (let j = Math.floor((c.z - R) / CC); j <= Math.floor((c.z + R) / CC); j++) { const k = key(i, j); if (!colGrid.has(k)) colGrid.set(k, []); colGrid.get(k).push(c); } }
  const freeSpot = (x, z, clear) => { for (const C of CLEARINGS) if (Math.hypot(x - C.x, z - C.z) < C.r + clear * .5) return false; const nr = nearestRoad(x, z, clear + 8); if (nr && nr.d < clear) return false; if (rampHeight(x, z) > -1e8) return false; for (const R of ramps) if (Math.hypot(R.x - x, R.z - z) < R.len + clear) return false; return true; };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...o });
  const puffGeo = (() => { const g = sculpt([{ e: [0, -.1, 0], r: [.78, .7, .78], c: 0xffffff }, { e: [.5, .05, .15], r: [.5, .48, .5], c: 0xffffff }, { e: [-.45, .1, -.2], r: [.52, .5, .52], c: 0xffffff }, { e: [.05, .2, .5], r: [.48, .46, .48], c: 0xffffff }, { e: [-.1, .2, -.5], r: [.46, .44, .46], c: 0xffffff }, { e: [0, .5, 0], r: [.52, .45, .52], c: 0xffffff }], { k: .3, res: 18 }).clone(); g.deleteAttribute('color'); g.computeBoundingBox(); const b = g.boundingBox, s = 2 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z); g.translate(0, -(b.min.y + b.max.y) / 2, 0); g.scale(s, s, s); g.computeVertexNormals(); return g; })();
  const MAT = {
    trunk: std(0x7a5a3a), palmTrunk: std(0x9a7a52), leaf: std(0x3f9a3a, { side: THREE.DoubleSide }), leaf2: std(0x5ab84a, { side: THREE.DoubleSide }),
    jungle: std(0x2a8a3a), jungle2: std(0x1f6e30), pine: std(0x2a5a3a), snow: std(0xf4f8ff), cactus: std(0x4a8a3a), dead: std(0x3a2e2a),
    rock: std(0x8a8078, { flatShading: true }), darkRock: std(0x2e2626, { flatShading: true }), redRock: std(0xb06a44, { flatShading: true }), ice: std(0xbfeaff, { roughness: .15, metalness: .1, transparent: true, opacity: .85, flatShading: true }),
    white: std(0xf4f2ec), red: std(0xe03a30), steel: std(0x6a7280, { metalness: .5, roughness: .5 }), wood: std(0x8a6440), yellow: std(0xffc83a),
  };
  const tree = {
    palm(x, y, z, hgt = 9) { const lean = (r() - .5) * .4, dir = r() * TAU;
      for (let k = 0; k < 5; k++) { const f = k / 5, yy = hgt * (f + .1); inst(CYLLOW, MAT.palmTrunk, M(x + Math.cos(dir) * lean * yy, y + yy, z + Math.sin(dir) * lean * yy, .32 - f * .1, hgt / 5 + .05, .32 - f * .1, 0, Math.sin(dir) * lean, -Math.cos(dir) * lean)); }
      const tx = x + Math.cos(dir) * lean * hgt, tz = z + Math.sin(dir) * lean * hgt;
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + r() * .3; inst(BOX, k % 2 ? MAT.leaf : MAT.leaf2, M(tx + Math.cos(a) * 1.9, y + hgt + .1, tz + Math.sin(a) * 1.9, 4, .06, .85, -a, 0, -.45)); }
      addCol({ x, z, r: .6 }); },
    broad(x, y, z, s = 1) { inst(CYLLOW, MAT.trunk, M(x, y + 2.5 * s, z, .45 * s, 5 * s, .45 * s)); inst(puffGeo, r() < .5 ? MAT.jungle : MAT.jungle2, M(x, y + 6.5 * s, z, 3.4 * s, 2.6 * s, 3.4 * s, r() * TAU)); addCol({ x, z, r: .7 * s }); },
    pine(x, y, z, s = 1, snowy = false) { inst(CYLLOW, MAT.trunk, M(x, y + 1.2 * s, z, .35 * s, 2.4 * s, .35 * s)); for (let k = 0; k < 3; k++) { inst(CONE, MAT.pine, M(x, y + (3 + k * 2.2) * s, z, (2.8 - k * .7) * s, 3.2 * s, (2.8 - k * .7) * s)); if (snowy) inst(CONE, MAT.snow, M(x, y + (3.7 + k * 2.2) * s, z, (1.6 - k * .4) * s, 1.6 * s, (1.6 - k * .4) * s)); } addCol({ x, z, r: .6 * s }); },
    cactus(x, y, z, s = 1) { inst(CYL, MAT.cactus, M(x, y + 2.5 * s, z, .55 * s, 5 * s, .55 * s)); for (const sd of [-1, 1]) if (r() < .8) { const hh = (1.5 + r() * 1.5) * s; inst(CYL, MAT.cactus, M(x + sd * 1.1 * s, y + hh + 1, z, .4 * s, 1.8 * s, .4 * s)); inst(CYL, MAT.cactus, M(x + sd * .6 * s, y + hh, z, .35 * s, .35 * s, 1.1 * s, 0, 0, Math.PI / 2)); } addCol({ x, z, r: .7 * s }); },
    dead(x, y, z, s = 1) { inst(CYLLOW, MAT.dead, M(x, y + 2.5 * s, z, .35 * s, 5 * s, .35 * s, 0, (r() - .5) * .3, (r() - .5) * .3)); for (let k = 0; k < 3; k++) inst(CYLLOW, MAT.dead, M(x + (r() - .5) * 1.5, y + (3 + r() * 2) * s, z + (r() - .5) * 1.5, .15 * s, 2.2 * s, .15 * s, r() * TAU, 0, .9)); addCol({ x, z, r: .5 * s }); },
    rock(x, y, z, s, mat = MAT.rock) { inst(ROCK, mat, M(x, y + s * .25, z, s, s * (.6 + r() * .5), s * (.8 + r() * .4), r() * TAU, r(), r())); addCol({ x, z, r: s * .85 }); },
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
    inst(CYL, MAT.white, M(x, y + 12, z, 1.6, 24, 1.6)); inst(CONE, MAT.red, M(x, y + 25.5, z, 2, 3, 2)); addCol({ x, z, r: 2.2 });
    const rot = new THREE.Group(); for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(BOX, MAT.white); b.scale.set(1.2, 11, .2); b.position.y = 5.5; const arm = new THREE.Group(); arm.rotation.z = k / 3 * TAU; arm.add(b); rot.add(arm); }
    rot.position.set(x, y + 23, z + 1.9); group.add(rot); windmills.push(rot); }
  updaters.push((dt, t) => windmills.forEach((w, i) => { w.rotation.z = t * (.6 + i * .07); }));
  // red barns
  for (let i = 0; i < 8; i++) { const a = r() * TAU, d = 80 + r() * 200, x = Math.cos(a) * d, z = Math.sin(a) * d; if (zoneAt(x, z).id !== 'plains' || !freeSpot(x, z, 16)) continue; const y = terrainAt(x, z), ang = r() * TAU;
    inst(BOX, MAT.red, M(x, y + 3.5, z, 12, 7, 9, ang)); inst(ROOF, MAT.white, M(x, y + 8.5, z, 9, 3, 7, ang)); addCol({ x, z, hx: 6.2, hz: 4.7, ang }); }
  // stunt park sign + fence posts
  {
    const sign = textSign('STUNTPARK', '#ff5a2a', '#ffffff'); sign.position.set(SP.x - 70, terrainAt(SP.x - 70, SP.z) + 7, SP.z - 40); sign.rotation.y = .9; group.add(sign);
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
      const g = new THREE.BoxGeometry(w, hgt, d); const uvA = g.attributes.uv, nA = g.attributes.normal;
      for (let k = 0; k < uvA.count; k++) { const ny = Math.abs(nA.getY(k)), nx = Math.abs(nA.getX(k)); if (ny > .5) uvA.setXY(k, 0, 0); else uvA.setXY(k, uvA.getX(k) * (nx > .5 ? d : w) / 8, uvA.getY(k) * hgt / 8); }
      const colA = new Float32Array(uvA.count * 3), cc = new THREE.Color(palette[Math.floor(r() * palette.length)]); for (let k = 0; k < uvA.count; k++) { const roof = Math.abs(nA.getY(k)) > .5; colA[k * 3] = roof ? .5 : cc.r; colA[k * 3 + 1] = roof ? .5 : cc.g; colA[k * 3 + 2] = roof ? .52 : cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(colA, 3)); g.translate(x, y + hgt / 2 - .5, z); geos.push(g);
      addCol({ x, z, hx: w / 2 + .3, hz: d / 2 + .3, ang: 0 });
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
      for (let s = 0; s < stack; s++) inst(BOX, cont[Math.floor(r() * cont.length)], M(x, y + 1.3 + s * 2.6, z, 2.4, 2.5, 6, ang)); addCol({ x, z, hx: ang ? 3.1 : 1.3, hz: ang ? 1.3 : 3.1, ang: 0 }); }
    const cranes = [];
    for (const x of [-160, -40, 80]) { const z = 700, y = Math.max(2, terrainAt(x, z));
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) inst(BOX, MAT.yellow, M(x + dx, y + 11, z + dz, .7, 22, .7)); addCol({ x, z, hx: 3.6, hz: 3.6, ang: 0 });
      const arm = new THREE.Group(); const b = new THREE.Mesh(BOX, MAT.yellow); b.scale.set(1.4, 1.4, 34); b.position.z = 10; arm.add(b); const cab = new THREE.Mesh(BOX, MAT.white); cab.scale.set(3, 2.4, 3); arm.add(cab);
      const cable = new THREE.Mesh(BOX, MAT.steel); cable.scale.set(.1, 10, .1); cable.position.set(0, -5, 22); arm.add(cable); const hook = new THREE.Mesh(BOX, cont[cranes.length % 6]); hook.scale.set(2.4, 2.5, 6); hook.position.set(0, -11, 22); arm.add(hook);
      arm.position.set(x, y + 23, z); group.add(arm); cranes.push(arm); }
    updaters.push((dt, t) => cranes.forEach((c, i) => { c.rotation.y = Math.sin(t * .15 + i * 2) * 1.2 + i; }));
    const hull = std(0x2a3a5a), hull2 = std(0xc83a2a);
    for (const [x, z, a, L] of [[-180, 760, .2, 60], [60, 770, -.1, 80], [230, 750, .5, 46]]) { const s = new THREE.Group(); const hb = new THREE.Mesh(BOX, a > .3 ? hull2 : hull); hb.scale.set(12, 7, L); s.add(hb); const deck = new THREE.Mesh(BOX, MAT.white); deck.scale.set(9, 6, 12); deck.position.set(0, 6, -L / 2 + 9); s.add(deck);
      for (let k = 0; k < L / 8 - 2; k++) { const c = new THREE.Mesh(BOX, cont[k % 6]); c.scale.set(10, 2.5, 6); c.position.set(0, 4.8, -L / 2 + 20 + k * 7); s.add(c); }
      s.position.set(x, 1, z); s.rotation.y = a; group.add(s); updaters.push((dt, t) => { s.rotation.z = Math.sin(t * .6 + x) * .015; s.position.y = 1 + Math.sin(t * .8 + x) * .2; }); }
    // lighthouse on the harbour mole
    { const x = 290, z = 664, y = Math.max(2, terrainAt(x, z));
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 24, 20), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 64; const g = c.getContext('2d'); for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#e02a2a'; g.fillRect(0, k * 64 / 6, 16, 64 / 6 + 1); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
      tower.position.set(x, y + 12, z); tower.castShadow = true; group.add(tower); addCol({ x, z, r: 3.8 });
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 12), new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe08a, emissiveIntensity: 1.4 })); lamp.position.set(x, y + 25.5, z); group.add(lamp);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: .06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Group(); for (const sd of [-1, 1]) { const b = new THREE.Mesh(new THREE.ConeGeometry(7, 100, 20, 1, true), beamMat); b.rotation.z = sd * Math.PI / 2; b.position.x = sd * 50; beam.add(b); } beam.position.set(x, y + 25.5, z); group.add(beam);
      updaters.push((dt, t) => { beam.rotation.y = t * .5; }); }
    const sign = textSign('PORT APEX', '#13161c', '#ffffff', '#ff5a36'); sign.position.set(-40, 24, 400); sign.scale.setScalar(1.6); group.add(sign);
  }

  // -- beach: palms, umbrellas, huts, lifeguard tower --
  {
    scatter(90, 'beach', 5, (x, y, z) => tree.palm(x, y, z, 7 + r() * 5));
    const umb = [0xff5a5a, 0x3ab8ff, 0xffd04a, 0x5ad86a].map(c => std(c, { side: THREE.DoubleSide }));
    scatter(80, 'beach', 4, (x, y, z) => { if (y > 4.5) return false; inst(CYLLOW, MAT.white, M(x, y + 1.3, z, .06, 2.6, .06)); inst(CONE, umb[Math.floor(r() * 4)], M(x, y + 2.7, z, 2, .7, 2, r() * TAU)); inst(BOX, umb[Math.floor(r() * 4)], M(x + 1.2, y + .05, z, 1, .05, 2, r())); });
    scatter(12, 'beach', 9, (x, y, z) => { const a = r() * TAU; inst(BOX, MAT.wood, M(x, y + 1.6, z, 5, 3.2, 4, a)); inst(ROOF, std(0xd8b060), M(x, y + 4.2, z, 4.6, 2.2, 4, a)); addCol({ x, z, hx: 2.6, hz: 2.6, ang: a }); });
  }

  // -- canyon: cacti, red rocks, an arch --
  {
    scatter(150, 'canyon', 4, (x, y, z) => tree.cactus(x, y, z, .7 + r() * .6));
    scatter(90, 'canyon', 5, (x, y, z) => tree.rock(x, y, z, 1.5 + r() * 3.5, MAT.redRock));
    const p = roads.find(q => q.id === 'east').pts, a = p[Math.floor(p.length * .72)];
    const arch = new THREE.Mesh(new THREE.TorusGeometry(13, 3.4, 8, 24, Math.PI), std(0xb0603a, { flatShading: true })); arch.position.set(a.x, a.y - 1, a.z); arch.rotation.y = a.angle + Math.PI / 2; arch.scale.set(1, 1.2, 1); arch.castShadow = true; group.add(arch);
    for (const sd of [-1, 1]) addCol({ x: a.x + a.nx * sd * 13, z: a.z + a.nz * sd * 13, r: 3.4 });
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
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,140,40,1)', 'rgba(255,60,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(70); glow.material.opacity = .55; glow.position.set(VOLCANO.x, VOLCANO.floor + 12, VOLCANO.z); group.add(glow);
  }

  // -- glacier: snowy pines, ice crystals, frozen lake --
  {
    scatter(220, 'glacier', 5, (x, y, z) => { if (y > 120) return false; tree.pine(x, y, z, .8 + r() * .6, y > 40); });
    scatter(40, 'glacier', 6, (x, y, z) => { if (y < 40) return false; const s = 2 + r() * 4; inst(ROCK, MAT.ice, M(x, y + s, z, s * .6, s * 2, s * .6, r() * TAU, (r() - .5) * .4)); addCol({ x, z, r: s * .55 }); });
    scatter(60, 'glacier', 5, (x, y, z) => tree.rock(x, y, z, 2 + r() * 4));
    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 48), new THREE.MeshStandardMaterial({ color: 0xc8f0ff, roughness: .05, metalness: .3, transparent: true, opacity: .82 })); lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, LAKE.y + .1, LAKE.z); lake.receiveShadow = true; group.add(lake);
  }

  // -- jungle: dense trees, ferns, temple ruins --
  {
    scatter(520, 'jungle', 4, (x, y, z) => tree.broad(x, y, z, 1 + r() * .9));
    scatter(160, 'jungle', 3, (x, y, z) => { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; inst(BOX, MAT.leaf2, M(x + Math.cos(a) * .9, y + .6, z + Math.sin(a) * .9, 2, .05, .6, -a, 0, .5)); } });
    const T = { x: -560, z: 300 }, ty = terrainAt(T.x, T.z), stone = std(0x8a8a6a, { flatShading: true }), moss = std(0x5a7a3a, { flatShading: true });
    for (let k = 0; k < 5; k++) { const s = 34 - k * 6; inst(BOX, k % 2 ? moss : stone, M(T.x, ty + 2.5 + k * 5, T.z, s, 5, s)); }
    inst(BOX, stone, M(T.x, ty + 28, T.z, 8, 6, 8)); addCol({ x: T.x, z: T.z, hx: 17, hz: 17, ang: 0 });
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

  // ----- clouds -----
  {
    const cloudTex = glowTex('rgba(255,255,255,.95)', 'rgba(255,255,255,0)');
    for (let k = 0; k < 60; k++) { const g = new THREE.Group(); for (let q = 0; q < 6; q++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: .8, fog: false })); s.scale.set(60 + r() * 60, 26 + r() * 20, 1); s.position.set((r() - .5) * 90, (r() - .5) * 10, (r() - .5) * 40); g.add(s); }
      const a = r() * TAU, d = 200 + r() * 1100; g.position.set(Math.cos(a) * d, 230 + r() * 120, Math.sin(a) * d); group.add(g); updaters.push((dt) => { g.position.x += dt * 3; if (g.position.x > 1400) g.position.x = -1400; }); }
  }

  // ----- birds over the sea -----
  {
    const birdM = std(0xffffff), birds = [];
    for (let k = 0; k < 24; k++) { const b = new THREE.Group(); for (const s of [-1, 1]) { const w = new THREE.Mesh(BOX, birdM); w.scale.set(1.4, .08, .5); w.position.x = s * .7; b.add(w); b.userData[s < 0 ? 'l' : 'r'] = w; } group.add(b); birds.push([b, r() * TAU, 100 + r() * 600, 30 + r() * 50]); }
    updaters.push((dt, t) => birds.forEach(([b, ph, R, y]) => { const a = ph + t * 25 / R; b.position.set(Math.cos(a) * R, y, Math.sin(a) * R + 300); b.rotation.y = -a; b.userData.l.rotation.z = Math.sin(t * 8 + ph) * .5; b.userData.r.rotation.z = -Math.sin(t * 8 + ph) * .5; }));
  }

  // ----- build instanced batches -----
  for (const { geo, mat, list, cast } of batches.values()) { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); }

  // ----- collisions: circle body against circles and rotated boxes -----
  function collide(b, radius = 1.15) {
    let hit = 0; const ci = Math.floor(b.x / CC), cj = Math.floor(b.z / CC), seen = new Set();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const c of colGrid.get(key(ci + i, cj + j)) || []) {
      if (seen.has(c)) continue; seen.add(c);
      let nx, nz, pen;
      if (c.r != null) { const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz), R = c.r + radius; if (d >= R || d < 1e-6) continue; nx = dx / d; nz = dz / d; pen = R - d; }
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
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = 512;
  {
    const g = mapCanvas.getContext('2d'), img = g.createImageData(512, 512), s = HALF * 2 / 512, c = new THREE.Color();
    for (let py = 0; py < 512; py++) for (let px = 0; px < 512; px++) {
      const x = -HALF + px * s, z = -HALF + py * s, h = terrainAt(x, z), i = (py * 512 + px) * 4;
      if (h < SEA) { const d = clamp(-h / 30, 0, 1); c.setRGB(.2 - d * .1, .62 - d * .25, .78 - d * .2); }
      else { const Z = zoneAt(x, z).id; c.set({ city: 0xb8c0a8, beach: 0xf0dca0, canyon: 0xd08050, volcano: 0x4a3a38, glacier: 0xe8f0f8, jungle: 0x3a8a40, plains: 0x9ac860 }[Z]); if (Z === 'glacier' && h < 40) c.set(0x6a9a6a); const sh = clamp((terrainAt(x + 6, z + 6) - h) * -.04, -.18, .18); c.offsetHSL(0, 0, sh + (h - 30) * .0012); }
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r) c.set(0xc8f0ff);
      if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.lavaR + 2) c.set(0xff5a10);
      img.data[i] = c.r * 255; img.data[i + 1] = c.g * 255; img.data[i + 2] = c.b * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (x, z) => [(x + HALF) / s, (z + HALF) / s];
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) for (const rd of roads) { g.beginPath(); rd.pts.forEach((p, k) => { const [px, py] = toPx(p.x, p.z); k ? g.lineTo(px, py) : g.moveTo(px, py); }); if (rd.closed) g.closePath(); g.strokeStyle = pass ? '#ffffff' : 'rgba(40,40,48,.9)'; g.lineWidth = pass ? Math.max(1.5, rd.w / s * .55) : rd.w / s + 2.5; g.stroke(); }
  }
  const worldToMap = (x, z) => [(x + HALF) / (HALF * 2), (z + HALF) / (HALF * 2)];

  const spawn = (() => { const rd = roads.find(q => q.id === 'avenue'), p = rd.pts[Math.floor(rd.pts.length * .12)]; return { x: p.x, z: p.z, y: p.y, angle: p.angle + Math.PI }; })();
  function update(dt, t, cam, pl) { for (const u of updaters) u(dt, t, cam, pl); }
  return { group, ground, terrainAt, surface, zoneAt, nearestRoad, collide, update, roads, ramps, pads, mapCanvas, worldToMap, spawn, HALF, freeSpot, rawAt, SP, addCol };
}

// ---------- shared small helpers ----------
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CYLLOW = new THREE.CylinderGeometry(1, 1, 1, 6), CONE = new THREE.ConeGeometry(1, 1, 12);
const ROOF = new THREE.ConeGeometry(.75, 1, 4); ROOF.rotateY(Math.PI / 4);
const ROCK = new THREE.IcosahedronGeometry(1, 0);
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
