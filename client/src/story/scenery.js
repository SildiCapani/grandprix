import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Extra world dressing uses its own seed: adding a detail never moves existing
// roads, mission objects, trees or collectibles. Small props have no collision.
export function createScenery({ group, roads, terrainAt, zoneAt, freeSpot, occupied, addCol, marks, updaters, roadFootprintClear }) {
  const TAU = Math.PI * 2;
  let seed = 739391;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, ...extra });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const cone = new THREE.ConeGeometry(1, 1, 8);
  const stone = new THREE.IcosahedronGeometry(1, 1);
  const leaf = new THREE.SphereGeometry(1, 8, 6);
  const wood = mat(0x83583a), cream = mat(0xfff0d5), teal = mat(0x247f83), iron = mat(0x354952, { metalness: .35 });
  const foliage = [mat(0x3c7641), mat(0x599646), mat(0x86ad55)];
  const blossoms = [mat(0xf3a5bd), mat(0xffc8ce), mat(0xf3e4c6)];
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  // Spatial batches keep all the small details out of distant draw calls.
  const batches = new Map();
  const bounds = new THREE.Box3();
  function put(geometry, material, x, y, z, sx, sy = sx, sz = sx, angle = 0, rx = 0, rz = 0) {
    const cx = Math.floor(x / 120), cz = Math.floor(z / 120);
    const key = `${cx},${cz}:${geometry.uuid}:${material.uuid}`;
    quaternion.setFromEuler(euler.set(rx, angle, rz));
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    bounds.copy(geometry.boundingBox).applyMatrix4(matrix);
    if (!roadFootprintClear({ x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2,
      hx: (bounds.max.x - bounds.min.x) / 2, hz: (bounds.max.z - bounds.min.z) / 2,
      minY: bounds.min.y, maxY: bounds.max.y }, .45)) return;
    if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [], x: cx * 120 + 60, z: cz * 120 + 60 });
    batches.get(key).matrices.push(matrix.clone());
  }
  function safe(x, z, radius = 3) {
    const y = terrainAt(x, z);
    return y > 2.6 && freeSpot(x, z, radius + 2) && roadFootprintClear({ x, z, r: radius }) && !occupied(x, z, radius)
      && Math.abs(terrainAt(x + radius, z) - y) < radius * .4
      && Math.abs(terrainAt(x, z + radius) - y) < radius * .4;
  }
  function scatter(zone, count, radius, fn) {
    let placed = 0;
    for (let i = 0; i < count * 35 && placed < count; i++) {
      const x = (random() - .5) * 1520, z = (random() - .5) * 1520;
      if (zoneAt(x, z).id !== zone || !safe(x, z, radius)) continue;
      if (fn(x, terrainAt(x, z), z) !== false) placed++;
    }
  }
  function floweringTree(x, y, z, size = 1) {
    put(cylinder, wood, x, y + 2.1 * size, z, .25 * size, 4.2 * size, .25 * size);
    const material = blossoms[Math.floor(random() * blossoms.length)];
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU, d = k ? 1.25 * size : 0;
      put(leaf, material, x + Math.cos(a) * d, y + (4.4 + random()) * size, z + Math.sin(a) * d,
        1.9 * size, 1.35 * size, 1.8 * size, a);
    }
    addCol({ x, z, r: .4 * size, minY: y, maxY: y + 4.2 * size }); marks.trees.push([x, z, 2.6 * size, 1]);
  }

  // Port Apex: shopfronts, striped awnings, balconies and roof gardens.
  const awnings = [mat(0xe77658), mat(0x3a9da0), mat(0xd6ad4e), mat(0x7e95b1)];
  const window = mat(0x3c7184, { roughness: .28, metalness: .25 });
  const shopNames = ['APEX CAFÉ', 'SURF CLUB', 'GELATO', 'GARAGE 07', 'LA MARINA', 'BLOOM'];
  const signMats = shopNames.map((name, i) => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ['#1c565b', '#db765b', '#be9548'][i % 3]; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#f7e9cb'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#fff6df'; ctx.font = 'bold 53px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, 256, 67, 465);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return mat(0xffffff, { map: texture, roughness: .7 });
  });
  const signGeo = new THREE.PlaneGeometry(1, 1);
  for (const [index, house] of marks.houses.entries()) {
    const [x, z, w, d, angle, , height, ship] = house;
    if (ship || angle !== 0 || height < 8 || w < 10 || zoneAt(x, z).id !== 'city') continue;
    let nearest = null, distance = Infinity;
    for (const rd of roads) for (const p of rd.pts) {
      const ds = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (ds < distance) { distance = ds; nearest = p; }
    }
    const dx = nearest.x - x, dz = nearest.z - z, alongX = Math.abs(dx) > Math.abs(dz);
    const facing = alongX ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
    const y = terrainAt(x, z), width = alongX ? d : w, front = (alongX ? w : d) / 2 + .14;
    const ca = Math.cos(facing), sa = Math.sin(facing);
    const face = (geo, material, u, h, v, sx, sy, sz, rx = 0) =>
      put(geo, material, x + ca * u + sa * v, y + h, z - sa * u + ca * v, sx, sy, sz, facing, rx);
    const awning = awnings[index % awnings.length];
    face(box, iron, 0, 2, front, width * .72, 3.5, .15);
    for (const u of [-width * .23, width * .23]) {
      face(box, window, u, 1.8, front + .1, width * .29, 2.7, .1);
      face(box, cream, u, 1.8, front + .17, .08, 2.8, .12);
    }
    for (let k = 0; k < 10; k++) face(box, k % 2 ? cream : awning,
      (k - 4.5) * width * .083, 3.8, front + .8, width * .084, .15, 1.9, .14);
    face(signGeo, signMats[index % signMats.length], 0, 5, front + .08, width * .77, 1.15, 1);
    if (height > 15) for (let floor = 8; floor < Math.min(height - 2, 26); floor += 6) {
      face(box, cream, 0, floor, front + .6, width * .72, .22, 1.3);
      for (const u of [-.34, 0, .34]) face(box, iron, width * u, floor + .6, front + 1.2, .08, 1.1, .08);
      face(box, iron, 0, floor + 1.1, front + 1.2, width * .72, .08, .08);
      face(box, teal, width * .22, floor + .35, front + .8, 1.5, .45, .5);
      face(leaf, foliage[1], width * .22, floor + .65, front + .8, .9, .5, .45);
    }
    if (index % 3 === 0) {
      put(box, cream, x, y + height + .2, z, w * .8, .5, d * .8);
      for (const sd of [-1, 1]) {
        put(box, teal, x + sd * w * .27, y + height + .7, z, 2, .8, 2);
        put(leaf, foliage[0], x + sd * w * .27, y + height + 1.5, z, 1.35, 1.3, 1.35);
      }
    }
  }

  // Furniture follows the road tangent and leaves sidewalks/junctions usable.
  for (const rd of roads.filter(rd => ['city1', 'city2', 'city3', 'avenue', 'docks', 'beach'].includes(rd.id))) {
    for (let k = 8; k < rd.pts.length - 8; k += 17) {
      const p = rd.pts[k], zone = zoneAt(p.x, p.z).id;
      if (!['city', 'beach'].includes(zone) || p.bridge) continue;
      const side = k % 2 ? -1 : 1, offset = rd.hw + 5.8;
      const x = p.x + p.nx * side * offset, z = p.z + p.nz * side * offset;
      if (!safe(x, z, 1.8)) continue;
      const y = terrainAt(x, z), a = p.angle;
      if (k % 3 === 0) {
        put(cylinder, teal, x, y + .55, z, .85, 1.1, .85);
        put(leaf, foliage[1], x, y + 1.3, z, 1.1, .8, 1.1);
        for (let j = 0; j < 5; j++) put(leaf, blossoms[0], x + Math.cos(j * 1.3) * .6, y + 1.85, z + Math.sin(j * 1.3) * .6, .23);
      } else {
        put(box, wood, x, y + .65, z, 3.1, .18, 1, a);
        put(box, wood, x + Math.sin(a) * .44, y + 1.15, z + Math.cos(a) * .44, 3.1, .65, .12, a);
        for (const sd of [-1, 1]) put(box, iron, x + Math.cos(a) * sd * 1.1, y + .35, z - Math.sin(a) * sd * 1.1, .15, .7, .75, a);
      }
      addCol({ x, z, r: 1.2, minY: y, maxY: y + 2.1 });
    }
  }

  // Festival bunting over the city, with tall, clear openings for karts.
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.35, 0, 0, 0, -.8, 0, .35, 0, 0], 3)); flagGeo.computeVertexNormals();
  const flags = awnings.map(m => mat(m.color, { side: THREE.DoubleSide }));
  const cables = [];
  for (const rd of roads.filter(rd => rd.id.startsWith('city'))) for (let k = 20; k < rd.pts.length - 10; k += 42) {
    const p = rd.pts[k], width = rd.hw + 4.5;
    const ends = [-1, 1].map(s => [p.x + p.nx * s * width, p.z + p.nz * s * width]);
    if (p.bridge || ends.some(([x, z]) => !safe(x, z, .6))) continue;
    const y = Math.max(p.y, ...ends.map(([x, z]) => terrainAt(x, z)));
    for (const [x, z] of ends) { const base = terrainAt(x, z); put(cylinder, iron, x, (base + y + 9) / 2, z, .09, y + 9 - base, .09); addCol({ x, z, r: .18 }); }
    for (let j = 0; j <= 20; j++) {
      const u = j / 20, v = (u * 2 - 1) * width, yy = y + 9 - Math.sin(u * Math.PI) * 1.6;
      const x = p.x + p.nx * v, z = p.z + p.nz * v;
      cables.push(x, yy, z);
      if (j < 20) {
        const next = (j + 1) / 20;
        cables.push(p.x + p.nx * (next * 2 - 1) * width, y + 9 - Math.sin(next * Math.PI) * 1.6, p.z + p.nz * (next * 2 - 1) * width);
      } else cables.splice(-3);
      if (j % 2) put(flagGeo, flags[j % flags.length], x, yy, z, 1, 1, 1, p.angle);
    }
  }
  const cableGeo = new THREE.BufferGeometry(); cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
  group.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x68635b })));

  // Flowering avenues and orchard groves give the middle of the island a silhouette.
  scatter('plains', 65, 4, (x, y, z) => floweringTree(x, y, z, .8 + random() * .65));
  scatter('city', 25, 3.5, (x, y, z) => floweringTree(x, y, z, .7 + random() * .3));

  // Ferns built from pointed leaflets rather than boxes, plus hanging lianas.
  const fernParts = [];
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * TAU, points = [];
    for (let j = 0; j < 5; j++) {
      const f = (j + 1) / 5, d = f * 1.9, y = Math.sin(f * Math.PI * .8) * 1.2, w = (1 - f) * .55 + .05;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      for (const side of [-1, 1]) points.push(x - Math.sin(a) * w * side, y - .1, z + Math.cos(a) * w * side,
        x - Math.cos(a) * .42, y - .12, z - Math.sin(a) * .42, x + Math.cos(a) * .32, y + .1, z + Math.sin(a) * .32);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geo.computeVertexNormals(); fernParts.push(geo);
  }
  const fern = mergeGeometries(fernParts), fernMat = mat(0x48975b, { side: THREE.DoubleSide });
  scatter('jungle', 320, 1, (x, y, z) => put(fern, fernMat, x, y, z, .65 + random() * .9, 1, 1, random() * TAU));
  const jungleTrees = marks.trees.filter((t, i) => i % 3 === 0 && t[3] === 1 && zoneAt(t[0], t[1]).id === 'jungle');
  for (const [x, z, radius] of jungleTrees) {
    const y = terrainAt(x, z), h = radius * 1.7;
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU;
      put(cone, foliage[0], x + Math.cos(a) * .5, y + .75, z + Math.sin(a) * .5, .35, 1.5, .35, a, .3);
      const dx = Math.cos(a) * radius * .5, dz = Math.sin(a) * radius * .5;
      put(cylinder, foliage[0], x + dx, y + h - 1.6, z + dz, .045, 3.2, .045);
      for (let j = 0; j < 3; j++) put(leaf, foliage[j], x + dx + .1, y + h - j, z + dz, .2, .1, .4, a);
    }
  }

  // Eroded sandstone towers: warm bands and wider capstones.
  const strata = [mat(0xa85538), mat(0xc67548), mat(0xe3a16a), mat(0xd88c59)];
  scatter('canyon', 38, 7, (x, y, z) => {
    const h = 9 + random() * 20, radius = 2.8 + random() * 2, angle = random() * TAU;
    for (let k = 0; k < 6; k++) {
      const w = radius * (1 - k * .085) * (k === 5 ? 1.55 : 1);
      put(stone, strata[k % strata.length], x + Math.sin(k * .7) * .6, y + h * (k + .5) / 6, z,
        w, h / 9, w * .85, angle + k * .15);
    }
    addCol({ x, z, r: radius, minY: y, maxY: y + h }); marks.trees.push([x, z, radius, 8]);
  });
  const succulent = mat(0x829e74);
  scatter('canyon', 150, 1, (x, y, z) => {
    for (let k = 0; k < 6; k++) put(cone, succulent, x, y + .4, z, .16, 1.5, .16, k / 6 * TAU, .9);
  });

  // Blue glacier spires and snowdrifts stay outside the frozen lake arena.
  const ice = mat(0x70cce2, { roughness: .24, metalness: .12 });
  const frost = mat(0xe9f5fb);
  scatter('glacier', 48, 5, (x, y, z) => {
    if (y < 48) return false;
    const h = 4 + random() * 8;
    for (let k = 0; k < 3; k++) put(cone, k === 1 ? frost : ice, x + (k - 1) * 1.3, y + h * .4, z + k * .4,
      1 + random(), h * (k === 1 ? 1 : .75), 1.3, k, .12);
    addCol({ x, z, r: 2.5, minY: y, maxY: y + h }); marks.trees.push([x, z, 3, 3]);
  });

  // Basalt columns on the outer slopes, leaving the crater and spiral open.
  const basalt = [mat(0x353744), mat(0x49404a), mat(0x5c4b4b)];
  scatter('volcano', 55, 4, (x, y, z) => {
    const h = 3 + random() * 8;
    for (let k = 0; k < 4; k++) put(cylinder, basalt[k % 3], x + (k % 2) * 1.3, y + h * .35, z + Math.floor(k / 2) * 1.3,
      .9, h * (.5 + random() * .5), .9);
    addCol({ x: x + .65, z: z + .65, r: 2, minY: y, maxY: y + h });
  });

  // Beach picnics: towels, beach bags and timber shade pergolas.
  scatter('beach', 45, 1.5, (x, y, z) => {
    if (y > 7) return false;
    const a = random() * TAU;
    put(box, awnings[Math.floor(random() * 4)], x, y + .06, z, 1.3, .06, 2.4, a);
    put(box, cream, x, y + .1, z, 1.1, .05, .25, a);
    put(leaf, wood, x + .8, y + .3, z + .7, .32, .3, .25);
  });
  scatter('beach', 4, 7, (x, y, z) => {
    if (y > 8) return false;
    for (const dx of [-3, 3]) for (const dz of [-2.5, 2.5]) {
      put(box, cream, x + dx, y + 2.1, z + dz, .22, 4.2, .22);
      addCol({ x: x + dx, z: z + dz, r: .25 });
    }
    for (let k = 0; k < 9; k++) put(box, wood, x - 3.4 + k * .85, y + 4.25, z, .28, .18, 6.2);
    put(box, cream, x, y + 4.05, z - 2.5, 6.6, .3, .22);
    put(box, cream, x, y + 4.05, z + 2.5, 6.6, .3, .22);
    marks.houses.push([x, z, 6.6, 6.2, 0, '#c9ac83', 4.3]);
  });

  const meshes = [];
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    mesh.name = 'Insel-Details'; group.add(mesh); meshes.push({ mesh, x: batch.x, z: batch.z });
  }
  updaters.push((dt, t, camera) => {
    if (!camera) return;
    for (const { mesh, x, z } of meshes) {
      const distance = Math.hypot(x - camera.position.x, z - camera.position.z);
      mesh.visible = distance < 470; mesh.castShadow = distance < 120;
    }
  });
}
