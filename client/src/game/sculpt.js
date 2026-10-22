import * as THREE from 'three';
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';

// "Clay" modelling for the cartoon creatures: shapes are described as signed distance fields that melt into each
// other (smooth union), then turned into one smooth mesh with marching cubes. Colours come from the nearest shape,
// or from paint-only shapes (stripes, spots, bellies) that colour the surface without changing it.
//
// Shape list entries:
//   { e: [x,y,z], r: [rx,ry,rz], rot?: [ax,ay,az], c: 0xRRGGBB }            ellipsoid
//   { a: [x,y,z], b: [x,y,z], ra, rb, c }                                   tapered capsule (round cone)
//   add k: blend radius (default opts.k), paint: true → only colours the surface inside it
// Results are cached per description, so every animal of a kind is computed once.

const cache = new Map(), RES = .74; // global detail level (lower = fewer triangles)
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };

function prep(s) {
  const o = { ...s, k: s.k };
  if (s.e) {
    o.kind = 0; o.cx = s.e[0]; o.cy = s.e[1]; o.cz = s.e[2]; o.rx = s.r[0]; o.ry = s.r[1]; o.rz = s.r[2];
    if (s.rot) { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...s.rot)).invert(); o.m = m.elements; }
    const R = Math.max(o.rx, o.ry, o.rz); o.box = [o.cx - R, o.cy - R, o.cz - R, o.cx + R, o.cy + R, o.cz + R];
  } else {
    o.kind = 1; const [ax, ay, az] = s.a, [bx, by, bz] = s.b; o.ax = ax; o.ay = ay; o.az = az;
    o.bax = bx - ax; o.bay = by - ay; o.baz = bz - az; o.l2 = o.bax * o.bax + o.bay * o.bay + o.baz * o.baz; o.rr = s.ra - s.rb;
    o.a2 = o.l2 - o.rr * o.rr; o.il2 = 1 / o.l2; o.r1 = s.ra; o.r2 = s.rb;
    const R = Math.max(s.ra, s.rb); o.box = [Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R, Math.max(az, bz) + R];
  }
  return o;
}
function dist(o, x, y, z) {
  if (o.kind === 0) {
    let px = x - o.cx, py = y - o.cy, pz = z - o.cz;
    if (o.m) { const e = o.m, qx = e[0] * px + e[4] * py + e[8] * pz, qy = e[1] * px + e[5] * py + e[9] * pz, qz = e[2] * px + e[6] * py + e[10] * pz; px = qx; py = qy; pz = qz; }
    const ax = px / o.rx, ay = py / o.ry, az = pz / o.rz, k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = px / (o.rx * o.rx), by = py / (o.ry * o.ry), bz = pz / (o.rz * o.rz), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(o.rx, o.ry, o.rz);
  }
  // iq's round cone (exact)
  const pax = x - o.ax, pay = y - o.ay, paz = z - o.az, ba = o.bax * pax + o.bay * pay + o.baz * paz;
  const yv = ba, wx = pax * o.l2 - o.bax * yv, wy = pay * o.l2 - o.bay * yv, wz = paz * o.l2 - o.baz * yv;
  const x2 = wx * wx + wy * wy + wz * wz, y2 = yv * yv * o.l2, zz = yv - o.l2, z2 = zz * zz * o.l2;
  const k = Math.sign(o.rr) * o.rr * o.rr * x2;
  if (Math.sign(zz) * o.a2 * z2 > k) return Math.sqrt(x2 + z2) * o.il2 - o.r2;
  if (Math.sign(yv) * o.a2 * y2 < k) return Math.sqrt(x2 + y2) * o.il2 - o.r1;
  return (Math.sqrt(x2 * o.a2 * o.il2) + yv * o.rr) * o.il2 - o.r1;
}

export function sculpt(shapes, opts = {}) {
  const key = JSON.stringify([shapes, opts]); if (cache.has(key)) return cache.get(key);
  const K = opts.k ?? .25, solid = [], paint = [];
  for (const s of shapes) (s.paint ? paint : solid).push(prep(s));
  const field = (x, y, z) => { let d = 1e9; for (const o of solid) d = smin(d, dist(o, x, y, z), o.k ?? K); return d; };
  // grid over the bounding box of all solid shapes
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const o of solid) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o.box[i]); hi[i] = Math.max(hi[i], o.box[i + 3]); }
  const pad = K * .5 + .02; for (let i = 0; i < 3; i++) { lo[i] -= pad; hi[i] += pad; }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), cell = opts.cell || size / Math.max(14, (opts.res || 44) * RES);
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
  const F = new Float32Array(nx * ny * nz), idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[idx(i, j, k)] = field(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell);
  const pos = [], vcache = new Map();
  const corner = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const vals = new Float32Array(8), ev = new Array(12);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let ci = 0;
    for (let c = 0; c < 8; c++) { const v = F[idx(i + corner[c][0], j + corner[c][1], k + corner[c][2])]; vals[c] = v; if (v < 0) ci |= 1 << c; }
    const bits = edgeTable[ci]; if (!bits) continue;
    for (let e = 0; e < 12; e++) if (bits & (1 << e)) {
      const [c0, c1] = edges[e], a = corner[c0], b = corner[c1];
      const ga = idx(i + a[0], j + a[1], k + a[2]), gb = idx(i + b[0], j + b[1], k + b[2]);
      const keyE = Math.min(ga, gb) + '_' + Math.max(ga, gb);
      let v = vcache.get(keyE);
      if (!v) { const t = vals[c0] / (vals[c0] - vals[c1]); v = [lo[0] + (i + a[0] + (b[0] - a[0]) * t) * cell, lo[1] + (j + a[1] + (b[1] - a[1]) * t) * cell, lo[2] + (k + a[2] + (b[2] - a[2]) * t) * cell]; vcache.set(keyE, v); }
      ev[e] = v;
    }
    const base = ci << 4;
    for (let t = 0; triTable[base + t] !== -1; t += 3) pos.push(ev[triTable[base + t]], ev[triTable[base + t + 1]], ev[triTable[base + t + 2]]);
  }
  // unique vertices → indexed geometry with smooth normals from the field gradient and colours from the nearest shape
  const vid = new Map(), verts = [], index = [];
  for (const v of pos) { let id = vid.get(v); if (id === undefined) { id = verts.length; vid.set(v, id); verts.push(v); } index.push(id); }
  const P = new Float32Array(verts.length * 3), N = new Float32Array(verts.length * 3), C = new Float32Array(verts.length * 3), h = cell * .5, col = new THREE.Color();
  verts.forEach((v, n) => {
    const [x, y, z] = v; P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z;
    let gx = field(x + h, y, z) - field(x - h, y, z), gy = field(x, y + h, z) - field(x, y - h, z), gz = field(x, y, z + h) - field(x, y, z - h); const gl = Math.hypot(gx, gy, gz) || 1;
    N[n * 3] = gx / gl; N[n * 3 + 1] = gy / gl; N[n * 3 + 2] = gz / gl;
    let best = null, bd = 1e9;
    for (const o of solid) { const d = dist(o, x, y, z); if (d < bd) { bd = d; best = o; } }
    for (const o of paint) if (dist(o, x, y, z) < 0) best = o;
    col.set(best.c).convertSRGBToLinear(); C[n * 3] = col.r; C[n * 3 + 1] = col.g; C[n * 3 + 2] = col.b;
  });
  // keep triangles facing outwards
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (fx * N[a * 3] + fy * N[a * 3 + 1] + fz * N[a * 3 + 2] < 0) { index[t + 1] = c; index[t + 2] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(index); g.computeBoundingSphere();
  cache.set(key, g); return g;
}
