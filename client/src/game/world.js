import * as THREE from 'three';
import { buildAdventure, ADVENTURE_THEMES } from './world-adventure.js';
import { buildLife } from './world-life.js';
import { sculpt } from './sculpt.js';
import { giraffe as cartoonGiraffe, elephant as cartoonElephant, zebra as cartoonZebra } from './critters.js';

// Three complete outdoor worlds, generated procedurally around the track:
//   day    → Riviera coast: sea, beach, palms, villas, lighthouse
//   desert → canyon at sunset: mesas, dunes, cacti, a rock arch over the road
//   night  → neon city: towers, neon signs, street lamps, rain
//   volcano → lava fields, basalt columns, an erupting volcano, ash
//   snow    → carved mountain terrain, pine forest, frozen lake, snowfall
//   space   → floating rainbow road between planets, nebulae and asteroids
// The returned group exposes userData.update(dt, time, camera) for animation.

const up = new THREE.Vector3(0, 1, 0);

function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

function canvasTex(size, draw, repeat = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, s, r, n, colors, min = .6, max = 2.4) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; const k = min + r() * (max - min); g.fillRect(r() * s, r() * s, k, k); }
}
function clouds(g, s, r, n, color, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, rad = rMin + r() * (rMax - rMin), gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
function textPanel(lines, w, h, bg, fg, accent) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (accent) { g.fillStyle = accent; g.fillRect(0, h - h * .12, w, h * .12); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([text, size, y, weight = 900]) => { g.font = `${weight} ${size}px Arial, sans-serif`; g.fillText(text, w / 2, y, w * .92); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function createWorld(map, track) {
  const theme = map.theme;
  const group = new THREE.Group(); group.name = `World · ${map.id}`;
  const r = rng(map.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 11) % 2147483646 + 1);
  const updaters = [];
  const W = track.width;

  // --- spatial index of the racing line, to keep scenery off the road ---
  const cell = 12, grid = new Map();
  for (let i = 0; i < track.points.length; i += 2) {
    const p = track.points[i], k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
  }
  for (const sc of track.shortcuts || []) for (let i = 0; i < sc.pts.length; i += 2) {
    const p = sc.pts[i], k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
  }
  function distTrack(x, z, limit = 60) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), reach = Math.ceil(limit / cell);
    let best = limit;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const list = grid.get(`${cx + i},${cz + j}`); if (!list) continue;
      for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < best) best = d; }
    }
    return best;
  }
  const free = (x, z, d) => distTrack(x, z, d + 1) > d;

  // --- instancing helpers ---
  const pools = new Map();
  // Scenery often creates a fresh material per object (std(0x…) inside a loop). Identical-looking materials
  // share one pool, so a forest is a handful of draw calls instead of hundreds. Materials that are animated
  // later (userData.live) keep their own pool.
  const hex = c => c ? c.getHexString() : '';
  const matKey = m => m.userData.live ? m.uuid : [m.type, hex(m.color), hex(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.flatShading,
    m.side, m.transparent, m.opacity, m.toneMapped, m.depthWrite, m.vertexColors, m.fog, m.map?.uuid, m.emissiveMap?.uuid, m.alphaMap?.uuid, m.bumpMap?.uuid, m.roughnessMap?.uuid].join('|');
  // Rounded vegetation / hills: these shapes are drawn with smooth shading even if the material asked for flat facets.
  const softMats = new Map();
  function inst(geo, mat, matrix, opts = {}) {
    if (mat.flatShading && SOFT.has(geo)) { let m = softMats.get(mat.uuid); if (!m) { m = mat.clone(); m.flatShading = false; softMats.set(mat.uuid, m); } mat = m; }
    const key = geo.uuid + '#' + matKey(mat) + '#' + (opts.cast !== false) + '#' + !!opts.color;
    if (!pools.has(key)) pools.set(key, { geo, mat, list: [], cast: opts.cast !== false, colors: [] });
    const pool = pools.get(key); pool.list.push(matrix); if (opts.color) pool.colors.push(opts.color);
  }
  const _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const M = (x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone().setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    cylLow: new THREE.CylinderGeometry(1, 1, 1, 6),
    cone: new THREE.ConeGeometry(1, 1, 16),
    roof: new THREE.ConeGeometry(.75, 1, 4),
    ico: new THREE.IcosahedronGeometry(1, 1),
    rock: new THREE.IcosahedronGeometry(1, 0),
    sphere: new THREE.SphereGeometry(1, 18, 12),
    // puffy cartoon foliage: a few balls melted together (see sculpt.js), about unit size
    puff: (() => { const g = sculpt([{ e: [0, -.1, 0], r: [.78, .7, .78], c: 0xffffff }, { e: [.5, .05, .15], r: [.5, .48, .5], c: 0xffffff }, { e: [-.45, .1, -.2], r: [.52, .5, .52], c: 0xffffff }, { e: [.05, .2, .5], r: [.48, .46, .48], c: 0xffffff }, { e: [-.1, .2, -.5], r: [.46, .44, .46], c: 0xffffff }, { e: [0, .5, 0], r: [.52, .45, .52], c: 0xffffff }], { k: .3, res: 20 }).clone(); g.deleteAttribute('color'); g.computeBoundingBox(); const b = g.boundingBox, s = 2 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z); g.translate(0, -(b.min.y + b.max.y) / 2, 0); g.scale(s, s, s); return g; })(),
    hill: new THREE.SphereGeometry(1, 32, 16),
  };
  const SOFT = new Set([G.puff, G.hill, G.cone, G.sphere, G.cyl]);
  G.roof.rotateY(Math.PI / 4);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0, ...o });

  // --- ground ---
  const groundSpec = {
    volcano: { color: 0x2a2324, base: '#2b2425', dots: ['rgba(10,8,8,.55)', 'rgba(90,70,60,.35)', 'rgba(140,40,10,.35)'] },
    snow: { color: 0xeef3f8, base: '#e9eff5', dots: ['rgba(190,205,225,.45)', 'rgba(255,255,255,.6)', 'rgba(170,185,205,.3)'] },
    space: { color: 0x000000, base: '#000000', dots: [] },
    jungle: { color: 0x3f5f2c, base: '#3d5a2a', dots: ['rgba(20,40,10,.5)', 'rgba(90,120,50,.4)', 'rgba(70,50,30,.35)'] },
    savanna: { color: 0xc8a060, base: '#c49a58', dots: ['rgba(150,110,50,.45)', 'rgba(230,200,130,.45)', 'rgba(120,130,60,.3)'] },
    forest: { color: 0x5a7f34, base: '#587c32', dots: ['rgba(40,70,20,.5)', 'rgba(130,170,70,.4)', 'rgba(200,120,40,.25)'] },
    day: { color: 0x86a85e, base: '#7c9a55', dots: ['rgba(60,90,40,.45)', 'rgba(150,170,90,.4)', 'rgba(100,120,60,.4)'] },
    desert: { color: 0xe0a46b, base: '#d39a62', dots: ['rgba(170,110,60,.45)', 'rgba(240,190,140,.45)', 'rgba(150,90,50,.35)'] },
    night: { color: 0x3a3e46, base: '#3b3f46', dots: ['rgba(20,22,26,.5)', 'rgba(90,94,100,.4)'] },
    sky: { color: 0xffffff, base: '#ffffff', dots: [] },
    sakura: { color: 0x8fae68, base: '#88a862', dots: ['rgba(60,90,40,.45)', 'rgba(255,170,200,.55)', 'rgba(255,220,235,.5)', 'rgba(140,170,90,.4)'] },
    moon: { color: 0x9a9ca2, base: '#97999f', dots: ['rgba(40,42,48,.45)', 'rgba(200,202,210,.4)', 'rgba(70,72,80,.35)'] },
    arena: { color: 0x22252c, base: '#23262d', dots: ['rgba(10,10,14,.5)', 'rgba(90,60,140,.25)'] },
    colosseum: { color: 0xd8b07a, base: '#d4ab74', dots: ['rgba(160,110,60,.45)', 'rgba(240,200,150,.45)'] },
    ice: { color: 0xeef4fa, base: '#e8f0f8', dots: ['rgba(180,200,225,.45)', 'rgba(255,255,255,.6)'] },
  }[theme] || { color: 0x888888, base: '#888888', dots: [] };
  const groundTex = canvasTex(512, (g, s) => {
    g.fillStyle = groundSpec.base; g.fillRect(0, 0, s, s);
    clouds(g, s, r, 70, 'rgba(0,0,0,.08)', 20, 90); clouds(g, s, r, 50, 'rgba(255,255,255,.07)', 20, 80);
    if (theme === 'desert') for (let y = 0; y < s; y += 9) { g.strokeStyle = 'rgba(120,70,30,.12)'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * .05 + y) * 3); g.stroke(); }
    if (groundSpec.dots.length) speckle(g, s, r, 22000, groundSpec.dots);
    if (theme === 'volcano') for (let i = 0; i < 5; i++) { // glowing cracks
      g.strokeStyle = `rgba(255,${90 + r() * 80},20,.6)`; g.lineWidth = .6 + r() * 1.2; g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { x += (r() - .5) * 60; y += (r() - .5) * 60; g.lineTo(x, y); } g.stroke();
    }
  }, 220);
  const groundSize = 4000;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), std(0xffffff, { map: groundTex, roughness: theme === 'night' ? .7 : .95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.09; ground.receiveShadow = true;
  if (theme === 'volcano') { ground.material.emissive = new THREE.Color(0xff5a10); ground.material.emissiveMap = groundTex; ground.material.emissiveIntensity = .14; }
  if (theme !== 'space' && theme !== 'sky' && !ADVENTURE_THEMES.includes(theme)) group.add(ground);

  // --- run-off shoulders beside the road (grass verge / sand / sidewalk) ---
  function band(off0, off1, y, material) {
    const pos = [], idx = [], n = track.points.length;
    for (let i = 0; i <= n; i++) {
      const s = track.sample(i / n);
      for (const o of [off0, off1]) pos.push(s.x + s.nx * o, s.y + y, s.z + s.nz * o);
      if (i < n && !track.inGap((i + .5) / n)) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  const shoulderMat = std({ day: 0x9b9886, desert: 0xc98f5b, night: 0x6b6f78, volcano: 0x3a3132, snow: 0xf4f8fc, space: 0x000000, jungle: 0x6a5a3a, savanna: 0xb88a52, forest: 0x7a6a4a, sky: 0xffffff, sakura: 0x9a8a72, moon: 0x7c7e84, arena: 0x3a3550, colosseum: 0xb08850, ice: 0xbcd8ee }[theme] ?? 0x888888, { side: THREE.DoubleSide, roughness: .9 });
  if (theme !== 'space' && theme !== 'sky' && !ADVENTURE_THEMES.includes(theme)) for (const side of [-1, 1]) band(side * (W / 2 + .5), side * (W / 2 + (theme === 'night' ? 5 : 3.5)), theme === 'night' ? .03 : -.02, shoulderMat);

  // --- start/finish area: grandstand with crowd and a pit building ---
  const s0 = track.sample(0), tx = Math.sin(s0.angle), tz = Math.cos(s0.angle);
  const at = (along, side) => [s0.x + tx * along + s0.nx * side, s0.z + tz * along + s0.nz * side];
  if (!map.arena) { // the battle arena has its own stadium instead
    const standMat = std(['night', 'volcano', 'space', 'moon'].includes(theme) ? 0x3a3f4c : 0xd9dcdf, { roughness: .6 }), seatMat = std({ day: 0x2a7fd4, desert: 0xc8432b, night: 0x7a2bd1, volcano: 0xd8401a, snow: 0x1f6fd0, space: 0x9b5cff, jungle: 0x2f9a4a, savanna: 0xd8802a, forest: 0xd8342c, sky: 0x39b8ff, sakura: 0xe8507a, moon: 0xd8d8e0 }[theme] || 0x2a7fd4, { roughness: .5 });
    const side = W / 2 + 9, len = 70, crowdMat = std(0xffffff, { roughness: .8 }), CROWD_SKIN = [0xf2c8a0, 0xd8a070, 0x8a5a3a, 0xf8dcc0].map(c => new THREE.Color(c));
    for (let row = 0; row < 8; row++) {
      const [x, z] = at(0, side + row * 1.4);
      inst(G.box, standMat, M(x, .4 + row * .7, z, len, .8 + row * 1.4 * 0, 1.4, s0.angle + Math.PI / 2));
      inst(G.box, seatMat, M(x, .95 + row * .7, z, len, .12, .5, s0.angle + Math.PI / 2));
      for (let k = 0; k < 46; k++) {
        if (r() < .18) continue;
        const [px, pz] = at(-len / 2 + 1 + k * (len - 2) / 45 + (r() - .5) * .5, side + row * 1.4 - .1);
        const c = new THREE.Color().setHSL(r(), .55, .45 + r() * .2);
        inst(G.sphere, crowdMat, M(px, 1.25 + row * .7, pz, .24, .36, .2, s0.angle + Math.PI / 2), { color: c }); inst(G.sphere, crowdMat, M(px, 1.78 + row * .7, pz, .19, .19, .19), { color: CROWD_SKIN[k % 4] });
      }
    }
    // roof
    const [rx, rz] = at(0, side + 5.5);
    inst(G.box, standMat, M(rx, 9.5, rz, len + 4, .4, 14, s0.angle + Math.PI / 2));
    for (const k of [-1, -.5, 0, .5, 1]) { const [px, pz] = at(k * len / 2, side + 12); inst(G.cyl, standMat, M(px, 4.8, pz, .35, 9.6, .35)); }
    // pit building opposite
    const pitMat = std(theme === 'night' ? 0x262a33 : 0xeef0f2, { roughness: .5 }), glass = std(theme === 'night' ? 0x9be7ff : 0x5c7d92, { roughness: .1, metalness: .4, emissive: theme === 'night' ? 0x3a8dff : 0x000000, emissiveIntensity: theme === 'night' ? .6 : 0 });
    const [bx, bz] = at(-8, -(W / 2 + 14));
    inst(G.box, pitMat, M(bx, 4, bz, 80, 8, 14, s0.angle + Math.PI / 2));
    const [gx, gz] = at(-8, -(W / 2 + 6.9));
    inst(G.box, glass, M(gx, 5.6, gz, 76, 3, .2, s0.angle + Math.PI / 2), { cast: false });
    for (let k = 0; k < 8; k++) { const [px, pz] = at(-42 + k * 10, -(W / 2 + 6.95)); inst(G.box, std(0x30343c), M(px, 1.7, pz, 8, 3.2, .15, s0.angle + Math.PI / 2), { cast: false }); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.6), new THREE.MeshBasicMaterial({ map: textPanel([['APEX RUSH · GRAND PRIX', 92, 64]], 1024, 128, theme === 'night' ? '#0b0e18' : '#13161c', '#ffffff', '#ff5a36'), toneMapped: theme !== 'night' }));
    const [sx, sz] = at(-8, -(W / 2 + 6.8)); sign.position.set(sx, 8.9, sz); sign.rotation.y = s0.angle - Math.PI / 2 * Math.sign(1) + Math.PI / 2 + Math.PI; group.add(sign);
    sign.lookAt(sx + s0.nx * 10, 8.9, sz + s0.nz * 10);
  }

  // --- trackside billboards with fictional sponsors ---
  const sponsors = [['NOVA ENERGY', '#ffcf3a', '#14213d'], ['TURBOLADE', '#ffffff', '#e63946'], ['KOMET REIFEN', '#101010', '#f1faee'], ['VOLTARA', '#00e5ff', '#0b0b14'],
    ['HELIX OIL', '#ffd166', '#073b4c'], ['PIXEL GRID', '#ff4fd8', '#120024'], ['ORBIT MOBIL', '#ffffff', '#2a9d8f'], ['APEX RUSH', '#ff5a36', '#101318']];
  const billboardMats = sponsors.map(([name, fg, bg]) => new THREE.MeshStandardMaterial({ map: textPanel([[name, 120, 118]], 1024, 256, bg, fg, fg), roughness: .5,
    emissive: theme === 'night' ? 0xffffff : 0x000000, emissiveIntensity: theme === 'night' ? .55 : 0, emissiveMap: null }));
  billboardMats.forEach(m => { if (theme === 'night') m.emissiveMap = m.map; });
  const poleMat = std(0x50555e, { metalness: .6, roughness: .4 });
  const bbCount = map.arena ? 0 : Math.floor(track.length / 95);
  for (let i = 0; i < bbCount; i++) {
    const t = (i + .5) / bbCount, s = track.sample(t), bend = track.curvature(t - 10 / track.length, 30);
    const side = bend > 0 ? -1 : 1, off = W / 2 + 6;
    const x = s.x + s.nx * off * side, z = s.z + s.nz * off * side;
    if (!free(x, z, off - 1) || s.y > 1 || track.inGap(t) || track.inVoid?.(t)) continue;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), billboardMats[i % billboardMats.length]);
    panel.position.set(x, 4.2, z); panel.lookAt(s.x, 4.2, s.z); panel.castShadow = true; group.add(panel);
    const back = new THREE.Mesh(G.box, poleMat); back.scale.set(12.2, 3.2, .15); back.position.copy(panel.position); back.quaternion.copy(panel.quaternion); back.translateZ(-.1); back.castShadow = true; group.add(back);
    for (const k of [-4.5, 4.5]) { const p = new THREE.Vector3(k, 0, 0).applyQuaternion(panel.quaternion); inst(G.cyl, poleMat, M(x + p.x, 1.4, z + p.z, .14, 2.8, .14)); }
  }

  // ===================== THEMES =====================
  const builders = { day: buildCoast, desert: buildDesert, volcano: buildVolcano, snow: buildSnow, space: buildSpace, jungle: buildJungle, savanna: buildSavanna, forest: buildForest, night: buildCity, sky: buildSky, sakura: buildSakura, moon: buildMoon, pirate: adventure, candy: adventure, castle: adventure, arctic: adventure, rooftops: adventure, galaxy: adventure, beach: adventure, reef: adventure, abyss: adventure, arena: buildArena, colosseum: buildArena, ice: buildArena };
  function adventure() { buildAdventure({ group, track, W, r, inst, M, G, std, free, updaters, canvasTex, clouds, speckle, textPanel, glowTex, weather, theme, at }); }
  (builders[theme] || buildCity)();
  buildLife({ group, track, W, r, inst, M, G, std, free, updaters, glowTex, theme, map });

  function scatter(n, minD, maxR, place, tries = 6) {
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      const x = (r() * 2 - 1) * maxR, z = (r() * 2 - 1) * maxR;
      if (!free(x, z, minD)) continue;
      if (place(x, z) !== false) placed++;
    }
  }

  function palm(x, z, h) {
    const trunk = std(0x8a6a48, { roughness: .9 }), frond = std(0x3f7d3a, { roughness: .7, side: THREE.DoubleSide });
    const lean = (r() - .5) * .25, dir = r() * Math.PI * 2;
    for (let k = 0; k < 5; k++) {
      const f = k / 5, y = h * (f + .1);
      inst(G.cylLow, trunk, M(x + Math.cos(dir) * lean * y, y, z + Math.sin(dir) * lean * y, .28 - f * .1, h / 5 + .05, .28 - f * .1, 0, Math.sin(dir) * lean, -Math.cos(dir) * lean));
    }
    const topX = x + Math.cos(dir) * lean * h, topZ = z + Math.sin(dir) * lean * h;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + r() * .3;
      inst(G.box, frond, M(topX + Math.cos(a) * 1.6, h + .1, topZ + Math.sin(a) * 1.6, 3.4, .06, .7, -a, 0, -.45), { cast: true });
    }
    inst(G.sphere, std(0x5a4632), M(topX, h, topZ, .45, .45, .45));
  }

  function buildCoast() {
    const shore = 205;
    // beach and sea
    const sandTex = canvasTex(256, (g, s) => { g.fillStyle = '#e6d3a6'; g.fillRect(0, 0, s, s); speckle(g, s, r, 9000, ['rgba(180,150,100,.35)', 'rgba(255,250,235,.45)']); }, 80);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, 70), std(0xffffff, { map: sandTex }));
    beach.rotation.x = -Math.PI / 2; beach.position.set(0, -.06, shore + 20); beach.receiveShadow = true; group.add(beach);
    const waveTex = canvasTex(256, (g, s) => {
      const img = g.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const fx = x / s * Math.PI * 2, fy = y / s * Math.PI * 2;
        const dx = Math.cos(fx * 3 + fy * 2) * .5 + Math.cos(fx * 7 - fy * 5) * .25 + Math.cos(fx * 13 + fy * 11) * .12;
        const dy = Math.cos(fy * 4 - fx) * .5 + Math.cos(fy * 9 + fx * 6) * .25 + Math.cos(fy * 15 - fx * 12) * .12;
        const i = (y * s + x) * 4; img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, 60, false);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, 2200), new THREE.MeshStandardMaterial({ color: 0x1d6d8c, roughness: .08, metalness: .05, normalMap: waveTex, normalScale: new THREE.Vector2(.45, .45), envMapIntensity: 1.3 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -.03, shore + 32 + 1100); group.add(sea);
    const shallow = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, 18), new THREE.MeshStandardMaterial({ color: 0x3fb4b8, roughness: .1, transparent: true, opacity: .75, normalMap: waveTex, normalScale: new THREE.Vector2(.3, .3) }));
    shallow.rotation.x = -Math.PI / 2; shallow.position.set(0, -.04, shore + 40); group.add(shallow);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6 }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(0, -.02, shore + 32); group.add(foam);
    updaters.push((dt, t) => { waveTex.offset.set(t * .004, t * .007); foam.material.opacity = .45 + Math.sin(t * 1.3) * .15; foam.position.z = shore + 32 + Math.sin(t * .9) * .8; });
    // sailboats
    const hullMat = std(0xf5f5f0, { roughness: .4 }), sailMat = std(0xffffff, { roughness: .6, side: THREE.DoubleSide });
    const boats = [];
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Group(); b.position.set(-500 + r() * 1000, 0, shore + 90 + r() * 500);
      const hull = new THREE.Mesh(G.box, hullMat); hull.scale.set(2.2, 1, 7); hull.position.y = .3; b.add(hull);
      const mast = new THREE.Mesh(G.cyl, std(0xcccccc)); mast.scale.set(.08, 9, .08); mast.position.y = 5; b.add(mast);
      const sailGeo = new THREE.BufferGeometry(); sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0, 9.5, 0, 0, 1, -3.4], 3)); sailGeo.computeVertexNormals();
      b.add(new THREE.Mesh(sailGeo, sailMat)); b.rotation.y = r() * Math.PI * 2; group.add(b); boats.push([b, r() * 10]);
    }
    updaters.push((dt, t) => boats.forEach(([b, ph]) => { b.position.y = Math.sin(t * .8 + ph) * .25; b.rotation.z = Math.sin(t * .6 + ph) * .05; }));
    // lighthouse on a rock in the sea
    const rockMat = std(0x7d7a74, { roughness: .95, flatShading: true });
    inst(G.rock, rockMat, M(300, -2, shore + 60, 26, 9, 22, .4));
    for (let i = 0; i < 6; i++) { const lh = new THREE.Mesh(G.cyl, std(i % 2 ? 0xd62828 : 0xf8f8f2, { roughness: .5 })); lh.scale.set(2.4 - i * .2, 4, 2.4 - i * .2); lh.position.set(300, 6 + i * 4, shore + 60); lh.castShadow = true; group.add(lh); }
    const lamp = new THREE.Mesh(G.cyl, new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe58a, emissiveIntensity: 2 })); lamp.scale.set(1.5, 2.2, 1.5); lamp.position.set(300, 29.5, shore + 60); group.add(lamp);
    inst(G.cone, std(0x2b2d33), M(300, 32, shore + 60, 1.9, 2.4, 1.9));
    // coastal rocks along the shoreline
    for (let i = 0; i < 40; i++) { const x = -1200 + r() * 2400; if (Math.abs(x - 300) < 40) continue; inst(G.rock, rockMat, M(x, -.6, shore + 26 + r() * 10, 2 + r() * 5, 1 + r() * 3, 2 + r() * 4, r() * 6)); }
    // inland hills and cliffs (north)
    const hillMat = std(0x6f8f4e, { roughness: 1, flatShading: true }), cliffMat = std(0xa39a88, { roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * .05 - r() * Math.PI * 1.1, d = 420 + r() * 600;
      inst(G.hill, i % 3 ? hillMat : cliffMat, M(Math.cos(a) * d, -10, Math.sin(a) * d * .9 - 60, 120 + r() * 160, 40 + r() * 90, 110 + r() * 120, r() * 6), { cast: false });
    }
    // villas on the hillside
    const wallMat = std(0xf6f1e7, { roughness: .7 }), roofMat = std(0xb5532c, { roughness: .8 }), shutter = std(0x2f7f9e);
    scatter(36, 26, 380, (x, z) => {
      if (z > 150) return false;
      const w = 7 + r() * 6, d = 6 + r() * 5, h = 4 + r() * 4, ry = r() * Math.PI;
      inst(G.box, wallMat, M(x, h / 2, z, w, h, d, ry));
      inst(G.roof, roofMat, M(x, h + 1.4, z, w * 1.05, 2.8, d * 1.05, ry));
      inst(G.box, shutter, M(x, h * .55, z, w * .3, h * .3, d + .1, ry), { cast: false });
    });
    // palms: along the beach road and scattered
    for (let i = 0; i < 70; i++) { const x = -800 + i * 23 + r() * 8, z = shore + 6 + r() * 14; if (free(x, z, 8)) palm(x, z, 7 + r() * 4); }
    scatter(110, 9, 300, (x, z) => palm(x, z, 6 + r() * 5));
    // shrubs and flowers
    const bush = std(0x4f7d3a, { roughness: .9, flatShading: true }), flower = [std(0xe94f87), std(0xf7c948), std(0xffffff)];
    scatter(450, 6, 320, (x, z) => { inst(G.puff, bush, M(x, .4, z, 1 + r() * 1.4, .8 + r(), 1 + r() * 1.4)); if (r() < .5) inst(G.sphere, flower[Math.floor(r() * 3)], M(x + 1, .3, z, .25, .25, .25), { cast: false }); });
  }

  function buildDesert() {
    // mesas: layered extruded rock plateaus
    function mesa(x, z, rad, h) {
      const shape = new THREE.Shape(), n = 9 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = rad * (.7 + r() * .45); const px = Math.cos(a) * rr, pz = Math.sin(a) * rr; i ? shape.lineTo(px, pz) : shape.moveTo(px, pz); }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSize: rad * .12, bevelThickness: h * .05, bevelSegments: 2, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, colors = [], base = new THREE.Color(0xb5532c), band = new THREE.Color(0xe08a4f), dark = new THREE.Color(0x7a3520);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / h, stripe = Math.sin(y * 34 + x * .01) * .5 + .5;
        const c = base.clone().lerp(band, stripe * .6).lerp(dark, Math.max(0, .35 - y) * .8); colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
      m.position.set(x, -1, z); m.rotation.y = r() * 6; m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
    for (let i = 0; i < 18; i++) { const a = r() * Math.PI * 2, d = 380 + r() * 520; mesa(Math.cos(a) * d, Math.sin(a) * d, 50 + r() * 90, 35 + r() * 95); }
    // a few smaller buttes close to the track
    scatter(9, 45, 260, (x, z) => mesa(x, z, 14 + r() * 16, 18 + r() * 34), 20);
    // rock arch spanning the road in the final sector
    {
      const t = .8, s = track.sample(t), arch = new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 7, 3.4, 8, 26, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb85a32, roughness: 1, flatShading: true }));
      arch.position.set(s.x, -1, s.z); arch.rotation.y = s.angle + Math.PI / 2; arch.castShadow = true; group.add(arch);
      for (const side of [-1, 1]) inst(G.rock, std(0xa24e2b, { flatShading: true, roughness: 1 }), M(s.x + s.nx * (W / 2 + 7) * side, 1.5, s.z + s.nz * (W / 2 + 7) * side, 5, 5, 6, r() * 3));
    }
    // dunes
    const duneMat = std(0xe2a96f, { roughness: 1 });
    scatter(55, 30, 700, (x, z) => inst(G.sphere, duneMat, M(x, -3, z, 25 + r() * 40, 5 + r() * 7, 14 + r() * 22, r() * 3), { cast: false }));
    // cacti (saguaro)
    const cactus = std(0x4f7a3a, { roughness: .8 });
    scatter(240, 7, 380, (x, z) => {
      const h = 3 + r() * 4;
      inst(G.cylLow, cactus, M(x, h / 2, z, .35, h, .35));
      inst(G.sphere, cactus, M(x, h, z, .35, .35, .35));
      const arms = Math.floor(r() * 3);
      for (let k = 0; k < arms; k++) {
        const a = r() * Math.PI * 2, y = h * (.4 + r() * .3), ax = x + Math.cos(a) * .75, az = z + Math.sin(a) * .75;
        inst(G.cylLow, cactus, M(x + Math.cos(a) * .4, y, z + Math.sin(a) * .4, .22, .9, .22, 0, Math.sin(a) * 1.57, -Math.cos(a) * 1.57));
        inst(G.cylLow, cactus, M(ax, y + .8, az, .22, 1.6, .22));
      }
    });
    // boulders and dry brush
    const boulder = std(0x9c5a3a, { roughness: 1, flatShading: true }), brush = std(0x8a7a4a, { roughness: 1, flatShading: true });
    scatter(380, 6, 420, (x, z) => { if (r() < .5) inst(G.rock, boulder, M(x, .2, z, .6 + r() * 2.4, .4 + r() * 1.6, .6 + r() * 2.2, r() * 6)); else inst(G.puff, brush, M(x, .3, z, .7 + r() * .6, .45, .7 + r() * .6), { cast: false }); });
    // roadside motel with a neon sign near the start
    {
      const [mx, mz] = at(60, W / 2 + 34), wall = std(0xe8c9a0), roof = std(0x7a4b33);
      inst(G.box, wall, M(mx, 2.2, mz, 30, 4.4, 10, s0.angle + Math.PI / 2)); inst(G.box, roof, M(mx, 4.6, mz, 32, .5, 12, s0.angle + Math.PI / 2));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 3), new THREE.MeshBasicMaterial({ map: textPanel([['SUNSET MOTEL', 110, 118]], 1024, 256, '#2b0f1d', '#ff4f8b', '#ffb703'), toneMapped: false }));
      sign.position.set(mx, 7.5, mz); sign.lookAt(s0.x + tx * 60, 7.5, s0.z + tz * 60); group.add(sign);
      inst(G.cyl, std(0x444444), M(mx, 3.5, mz, .2, 7, .2));
    }
  }

  function buildCity() {
    // window textures (emissive) in three moods
    const winTex = (palette, lit) => canvasTex(256, (g, s) => {
      g.fillStyle = '#0d1018'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
        const on = r() < lit; g.fillStyle = on ? palette[Math.floor(r() * palette.length)] : '#151a26';
        g.fillRect(x * 32 + 4, y * 16 + 3, 24, 10);
      }
    }, 1);
    const looks = [winTex(['#c9a060', '#e8c88f', '#b88a4a'], .32), winTex(['#6fa8d8', '#9cc8ec', '#5a86c0'], .28), winTex(['#c870b8', '#e0a0d0', '#8a74d0'], .24)];
    const towerMats = looks.map(t => new THREE.MeshStandardMaterial({ color: 0x5a606d, map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: .5, roughness: .35, metalness: .4 }));
    const roofMat = std(0x1c2028, { roughness: .6 });
    const beacons = [];
    for (let x = -640; x <= 640; x += 26) for (let z = -640; z <= 640; z += 26) {
      const px = x + (r() - .5) * 6, pz = z + (r() - .5) * 6, w = 12 + r() * 10, d = 12 + r() * 10;
      if (!free(px, pz, W / 2 + 7 + Math.max(w, d) * .72)) continue;
      const centre = Math.hypot(px + 10, pz + 40), h = (12 + r() * 40) * (centre < 260 ? 1.9 : 1) + (r() < .07 ? 80 : 0);
      const mat = towerMats[Math.floor(r() * towerMats.length)];
      const m = M(px, h / 2, pz, w, h, d);
      inst(G.box, mat, m, { cast: false });
      inst(G.box, roofMat, M(px, h + .3, pz, w * .9, .6, d * .9), { cast: false });
      if (h > 70) { inst(G.cyl, roofMat, M(px, h + 6, pz, .25, 12, .25), { cast: false }); beacons.push([px, h + 12.2, pz]); }
    }
    // texture repeat per building is fixed; scale windows to look plausible
    looks.forEach(t => t.repeat.set(2, 4));
    // blinking aircraft beacons
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }); beaconMat.userData.live = true;
    beacons.forEach(([x, y, z]) => inst(G.sphere, beaconMat, M(x, y, z, .55, .55, .55), { cast: false }));
    updaters.push((dt, t) => { beaconMat.color.setScalar(0).r = (Math.sin(t * 3) > .2 ? 1 : .15); });
    // neon signs facing the road
    const words = [['NOVA', '#ff3df2'], ['RAMEN 24/7', '#ffe14d'], ['HYPER', '#3df5ff'], ['ARCADE', '#7cff6b'], ['NEON BAR', '#ff4d6d'], ['ZENITH', '#a78bfa'], ['KARAOKE', '#ff9f1c'], ['PULSE', '#3dffb5'], ['HOTEL ORBIT', '#5ab0ff'], ['NIGHT MARKET', '#ff6bd6']];
    const neonMats = words.map(([w, c]) => new THREE.MeshBasicMaterial({ map: textPanel([[w, 120, 128, 800]], 1024, 256, '#05060c', c, null), toneMapped: false, transparent: true, opacity: .97 }));
    for (let i = 0; i < 70; i++) {
      const t = r(), s = track.sample(t), side = r() < .5 ? -1 : 1, off = W / 2 + 7.5;
      const x = s.x + s.nx * off * side, z = s.z + s.nz * off * side;
      if (!free(x, z, off - 1.5)) continue;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(6 + r() * 4, 1.6 + r()), neonMats[i % neonMats.length]);
      p.position.set(x, 6 + r() * 14, z); p.lookAt(s.x, p.position.y, s.z); group.add(p);
    }
    // street lamps with fake light pools on the asphalt
    const pole = std(0x2a2e36, { metalness: .7, roughness: .4 }), head = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
    const poolTex = canvasTex(128, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 1, false);
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffb867, alphaMap: poolTex, transparent: true, opacity: .32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const poolGeo = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2);
    const lampCount = Math.floor(track.length / 24);
    for (let i = 0; i < lampCount; i++) {
      const t = i / lampCount, s = track.sample(t), side = i % 2 ? 1 : -1, off = W / 2 + 3.2;
      const x = s.x + s.nx * off * side, z = s.z + s.nz * off * side;
      inst(G.cylLow, pole, M(x, 4, z, .12, 8, .12), { cast: false });
      const hx = x - s.nx * side * 1.6, hz = z - s.nz * side * 1.6;
      inst(G.box, pole, M((x + hx) / 2, 7.9, (z + hz) / 2, .12, .12, 1.8, s.angle + Math.PI / 2), { cast: false });
      inst(G.box, head, M(hx, 7.75, hz, .9, .18, .45, s.angle), { cast: false });
      const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(hx, .04, hz); pool.renderOrder = 2; group.add(pool);
    }
    // a few real lights around the start for the cars' paint
    for (let k = -1; k <= 1; k++) { const [lx, lz] = at(k * 40, 0); const l = new THREE.PointLight(0xffc98a, 60, 45, 1.6); l.position.set(lx, 8, lz); group.add(l); }
    const pink = new THREE.PointLight(0xff3df2, 40, 40, 1.6), cyan = new THREE.PointLight(0x3df5ff, 40, 40, 1.6);
    { const [a, b] = at(90, W / 2 + 6); pink.position.set(a, 6, b); const [c, d] = at(-90, -(W / 2 + 6)); cyan.position.set(c, 6, d); group.add(pink, cyan); }
    // rain streaks that follow the camera
    const N = 2200, rainPos = new Float32Array(N * 6), seeds = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { seeds[i * 3] = (r() - .5) * 70; seeds[i * 3 + 1] = r() * 40; seeds[i * 3 + 2] = (r() - .5) * 70; }
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb7d9, transparent: true, opacity: .35, depthWrite: false }));
    rain.frustumCulled = false; group.add(rain);
    updaters.push((dt, t, cam) => {
      if (!cam) return; const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      for (let i = 0; i < N; i++) {
        let y = (seeds[i * 3 + 1] - t * 22) % 40; if (y < 0) y += 40;
        const x = cx + seeds[i * 3], z = cz + seeds[i * 3 + 2], yy = cy - 8 + y, o = i * 6;
        rainPos[o] = x; rainPos[o + 1] = yy; rainPos[o + 2] = z; rainPos[o + 3] = x + .05; rainPos[o + 4] = yy - .7; rainPos[o + 5] = z + .03;
      }
      rainGeo.attributes.position.needsUpdate = true;
    });
  }


  // ---------- helpers for the 3D worlds ----------
  // Nearest road point (all points, height-aware callers decide what to do with y).
  function roadNear(x, z, limit = 80) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), reach = Math.ceil(limit / cell);
    let best = limit, y = 0;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const list = grid.get(`${cx + i},${cz + j}`); if (!list) continue;
      for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; y = p.y; } }
    }
    return { d: best, y };
  }
  // Is (x, z) clear of every road section that sits lower than `maxY` (bridges above are fine)?
  function clearOfLowRoad(x, z, d, maxY) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), reach = Math.ceil((d + 2) / cell);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const list = grid.get(`${cx + i},${cz + j}`); if (!list) continue;
      for (const p of list) if (p.y < maxY && Math.hypot(p.x - x, p.z - z) < d) return false;
    }
    return true;
  }
  function glowTex(inner, outer) { return canvasTex(128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 1); }
  // Camera-following particles (snow, ash).
  function weather(N, color, size, fall, spread = 70, height = 40, drift = .6) {
    const pos = new Float32Array(N * 3), seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { seeds[i * 4] = (r() - .5) * spread; seeds[i * 4 + 1] = r() * height; seeds[i * 4 + 2] = (r() - .5) * spread; seeds[i * 4 + 3] = r() * 6.28; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: .85, depthWrite: false, sizeAttenuation: true, map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)') }));
    pts.frustumCulled = false; group.add(pts);
    updaters.push((dt, t, cam) => {
      if (!cam) return;
      for (let i = 0; i < N; i++) {
        let y = (seeds[i * 4 + 1] - t * fall) % height; if (y < 0) y += height;
        const ph = seeds[i * 4 + 3];
        pos[i * 3] = cam.position.x + seeds[i * 4] + Math.sin(t * .7 + ph) * drift;
        pos[i * 3 + 1] = cam.position.y - 10 + y;
        pos[i * 3 + 2] = cam.position.z + seeds[i * 4 + 2] + Math.cos(t * .5 + ph) * drift;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  function buildVolcano() {
    // --- the volcano: a huge cone with a glowing crater, lava falls and a smoke column ---
    const vx = 80, vz = -560;
    const coneGeo = new THREE.ConeGeometry(300, 250, 48, 12, true);
    { const pos = coneGeo.attributes.position, col = [], dark = new THREE.Color(0x221c1c), mid = new THREE.Color(0x3f3433), hot = new THREE.Color(0xff5a14);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), a = Math.atan2(pos.getZ(i), pos.getX(i)), k = (y + 125) / 250;
        const n = Math.sin(a * 7 + y * .05) * .5 + Math.sin(a * 13) * .3;
        if (y < 120) { const rad = Math.hypot(pos.getX(i), pos.getZ(i)); pos.setX(i, pos.getX(i) * (1 + n * .05)); pos.setZ(i, pos.getZ(i) * (1 + n * .05)); }
        const c = dark.clone().lerp(mid, Math.max(0, n) * .7); if (k > .9) c.lerp(hot, (k - .9) * 6); col.push(c.r, c.g, c.b);
      }
      coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); coneGeo.computeVertexNormals(); }
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    cone.position.set(vx, 115, vz); cone.scale.y = .92; group.add(cone);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
    crater.rotation.x = -Math.PI / 2; crater.position.set(vx, 222, vz); group.add(crater);
    // lava falls down the flank
    const lavaTex = canvasTex(256, (g, s) => {
      g.fillStyle = '#ff4a08'; g.fillRect(0, 0, s, s); clouds(g, s, r, 60, 'rgba(255,220,80,.85)', 8, 36); clouds(g, s, r, 40, 'rgba(90,10,0,.75)', 10, 40);
    }, 1);
    const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false });
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * .28 + (r() - .5) * .1, w = 7 + r() * 6;
      const top = new THREE.Vector3(vx + Math.cos(a) * 30, 220, vz + Math.sin(a) * 30), bot = new THREE.Vector3(vx + Math.cos(a) * 290, 0, vz + Math.sin(a) * 290);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(w, top.distanceTo(bot), 1, 1), lavaMat);
      fall.position.copy(top).add(bot).multiplyScalar(.5); fall.lookAt(bot.x + Math.cos(a) * 50, 200, bot.z + Math.sin(a) * 50);
      fall.position.addScaledVector(new THREE.Vector3(Math.cos(a), .9, Math.sin(a)).normalize(), 2.5); group.add(fall);
    }
    // smoke column (soft sprites that rise and loop)
    const smokeMat = new THREE.SpriteMaterial({ map: glowTex('rgba(70,60,60,.9)', 'rgba(40,30,30,0)'), transparent: true, depthWrite: false, fog: false });
    const smoke = [];
    for (let i = 0; i < 26; i++) { const sp = new THREE.Sprite(smokeMat); sp.userData.ph = i / 26; group.add(sp); smoke.push(sp); }
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,140,40,.9)', 'rgba(255,60,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    glowSprite.position.set(vx, 240, vz); glowSprite.scale.set(160, 110, 1); group.add(glowSprite);
    updaters.push((dt, t) => {
      lavaTex.offset.y = (t * .08) % 1;
      for (const sp of smoke) { const k = (sp.userData.ph + t * .025) % 1; sp.position.set(vx + Math.sin(k * 9 + sp.userData.ph * 20) * 12 + k * 120, 235 + k * 260, vz + Math.cos(k * 7) * 12); const sc = 40 + k * 170; sp.scale.set(sc, sc, 1); sp.material.opacity = 1 - k; }
      glowSprite.material.opacity = .75 + Math.sin(t * 2.3) * .2;
    });
    // --- lava rivers: one runs under the jump gap, others cross under the viaduct ---
    const riverMat = new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false });
    function river(cx, cz, dirX, dirZ, len, w) {
      const pos = [], uv = [], idx = []; let v = 0, last = null;
      for (let d = -len; d <= len; d += 6) {
        const wob = Math.sin(d * .02 + cx) * 18, x = cx + dirX * d - dirZ * wob, z = cz + dirZ * d + dirX * wob;
        const ok = clearOfLowRoad(x, z, W / 2 + w / 2 + 3, 2.5);
        if (ok) {
          const nx = -dirZ, nz = dirX, base = pos.length / 3;
          pos.push(x + nx * w / 2, -.04, z + nz * w / 2, x - nx * w / 2, -.04, z - nz * w / 2); uv.push(0, v, 1, v); v += .08;
          if (last !== null && last === base - 2) idx.push(last, last + 1, base, last + 1, base + 1, base);
          last = base;
        } else last = null;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, riverMat); group.add(m);
      // crust banks
      return m;
    }
    for (const j of track.jumps) { const s = track.sample(j.t + j.gap / 2 / track.length); river(s.x, s.z, s.nx, s.nz, 320, 13); const l = new THREE.PointLight(0xff6a20, 120, 60, 1.4); l.position.set(s.x, 3, s.z); group.add(l); }
    river(-200, 40, .3, .95, 400, 9); river(210, -20, -.95, .3, 360, 8);
    // lava lakes
    scatter(5, 60, 520, (x, z) => { const lake = new THREE.Mesh(new THREE.CircleGeometry(18 + r() * 26, 24), riverMat); lake.rotation.x = -Math.PI / 2; lake.position.set(x, -.03, z); lake.scale.y = .6 + r() * .4; group.add(lake); }, 30);
    // --- basalt column clusters, jagged rocks, dead trees ---
    const hex = new THREE.CylinderGeometry(1, 1, 1, 6), basalt = std(0x2c2627, { roughness: .95, flatShading: true }), basaltTop = std(0x463b3a, { roughness: .9, flatShading: true });
    scatter(70, 10, 480, (x, z) => {
      const n = 4 + Math.floor(r() * 10);
      for (let k = 0; k < n; k++) { const px = x + (r() - .5) * 9, pz = z + (r() - .5) * 9, h = 2 + r() * 9; inst(hex, k % 3 ? basalt : basaltTop, M(px, h / 2 - .1, pz, .9 + r() * .5, h, .9 + r() * .5, r())); }
    }, 10);
    const rock = std(0x342b2b, { roughness: 1, flatShading: true });
    scatter(320, 7, 520, (x, z) => inst(G.rock, rock, M(x, .3, z, .6 + r() * 3, .5 + r() * 2.4, .6 + r() * 3, r() * 6)));
    const wood = std(0x1b1514, { roughness: 1 });
    scatter(90, 8, 420, (x, z) => {
      const h = 3 + r() * 4; inst(G.cylLow, wood, M(x, h / 2, z, .18, h, .18));
      for (let k = 0; k < 3; k++) { const a = r() * 6.28; inst(G.cylLow, wood, M(x + Math.cos(a) * .6, h * (.5 + k * .15), z + Math.sin(a) * .6, .07, 1.6, .07, 0, Math.sin(a) * .9, -Math.cos(a) * .9)); }
    });
    // distant ridges
    const ridge = std(0x1f1a1a, { roughness: 1, flatShading: true });
    for (let i = 0; i < 22; i++) { const a = r() * Math.PI * 2, d = 650 + r() * 450; if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < .4) continue; inst(G.hill, ridge, M(Math.cos(a) * d, -15, Math.sin(a) * d, 90 + r() * 140, 40 + r() * 80, 90 + r() * 120, r() * 6), { cast: false }); }
    // floating embers and ash
    weather(700, 0xff8a3a, .32, 2.2, 80, 30, 2.5);
    weather(500, 0x6a5a58, .25, 1.2, 80, 30, 1.5);
  }

  function buildSnow() {
    // --- carved mountain terrain: follows the road exactly, rises into peaks away from it ---
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, peak = { y: -1 };
    for (const p of track.points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); if (p.y > peak.y) peak = p; }
    const pad = 220, step = 5; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1, H = new Float32Array(nx * nz);
    const s0p = track.sample(0), lake = { x: 15, z: 92, r: 24 };
    const noise = (x, z) => Math.sin(x * .021 + z * .013) * 4 + Math.sin(x * .053 - z * .041) * 2 + Math.sin(z * .09 + x * .02) * .8;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      // inverse-distance blend of nearby road heights
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      let sw = 0, sy = 0, dmin = 1e9, ynear = 0;
      for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) {
        const list = grid.get(`${cx + a},${cz + b}`); if (!list) continue;
        for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < dmin) { dmin = d; ynear = p.y; } if (d < 75) { const w = 1 / (d * d * d + 8); sw += w; sy += w * p.y; } }
      }
      const idw = sw > 0 ? sy / sw : 0;
      // mountain massif behind the summit + rolling hills
      const dm = Math.hypot(x - peak.x * .6, z - (peak.z - 150)), massif = 120 * Math.exp(-(dm * dm) / (260 * 260));
      const far = Math.max(0, massif + noise(x, z) * 2 + 3);
      const wf = Math.min(1, Math.max(0, (dmin - 22) / 60));
      let h = idw * (1 - wf) + Math.max(far, idw * .7) * wf + noise(x, z) * .4 * Math.min(1, dmin / 30);
      const edge = W / 2 + 3;
      if (dmin < edge) h = ynear - .35; else h = Math.min(h, ynear - .35 + (dmin - edge) * .85);
      if (dmin < edge + 6) h = Math.min(h, ynear - .35 + (dmin - edge) * .85);
      // flat valley around the start/finish and a frozen lake
      const ds = Math.hypot(x - s0p.x, z - s0p.z); if (ds < 110) h = Math.min(h, -.1 + Math.max(0, ds - 80) * .3);
      const dl = Math.hypot(x - lake.x, z - lake.z); if (dl < lake.r + 12) h = Math.min(h, -.6 + Math.max(0, dl - lake.r) * .25);
      // fade to the flat plain at the border
      const border = Math.min(i, j, nx - 1 - i, nz - 1 - j) * step; h *= Math.min(1, border / 60);
      H[j * nx + i] = h;
    }
    const geo = new THREE.PlaneGeometry((nx - 1) * step, (nz - 1) * step, nx - 1, nz - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = [], snowC = new THREE.Color(0xf4f8fc), rockC = new THREE.Color(0x6d6f78), shade = new THREE.Color(0xc9d6e6);
    for (let k = 0; k < pos.count; k++) {
      const i = k % nx, j = Math.floor(k / nx); pos.setX(k, x0 + i * step); pos.setZ(k, z0 + j * step); pos.setY(k, H[j * nx + i] - .09);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let k = 0; k < pos.count; k++) { const steep = 1 - nrm.getY(k), c = snowC.clone().lerp(shade, Math.min(1, steep * 2.2)); if (steep > .35) c.lerp(rockC, Math.min(1, (steep - .35) * 3)); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92 })); terrain.receiveShadow = true; group.add(terrain);
    const terrainH = (x, z) => { const fi = (x - x0) / step, fj = (z - z0) / step, i = Math.floor(fi), j = Math.floor(fj); if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return 0; const u = fi - i, v = fj - j; const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1]; return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
    // frozen lake
    const ice = new THREE.Mesh(new THREE.CircleGeometry(lake.r + 4, 40), new THREE.MeshPhysicalMaterial({ color: 0xa8d8f0, roughness: .05, metalness: .1, clearcoat: 1, transparent: true, opacity: .92 }));
    ice.rotation.x = -Math.PI / 2; ice.position.set(lake.x, -.55, lake.z); group.add(ice);
    // distant alps
    const rockMat = std(0x7c808c, { roughness: 1, flatShading: true }), capMat = std(0xffffff, { roughness: .8, flatShading: true });
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2, d = 900 + r() * 500, h = 160 + r() * 260, w = 160 + r() * 200, x = Math.cos(a) * d, z = Math.sin(a) * d;
      inst(G.cone, rockMat, M(x, h / 2 - 10, z, w, h, w * (.8 + r() * .4), r() * 6), { cast: false });
      inst(G.cone, capMat, M(x, h * .78 - 10, z, w * .45, h * .45, w * .45 * (.8 + r() * .4), r() * 6), { cast: false });
    }
    // pine forest
    const trunk = std(0x4a3426), needles = std(0x1f4a32, { roughness: .85, flatShading: true }), snowTop = std(0xf6fbff, { roughness: .7, flatShading: true });
    const pine = (x, z, h) => {
      const y = terrainH(x, z);
      inst(G.cylLow, trunk, M(x, y + h * .15, z, .25, h * .3, .25));
      for (let k = 0; k < 3; k++) { const f = 1 - k * .28; inst(G.cone, needles, M(x, y + h * (.3 + k * .22), z, h * .32 * f, h * .42, h * .32 * f)); }
      inst(G.cone, snowTop, M(x, y + h * .9, z, h * .12, h * .22, h * .12));
    };
    scatter(900, 8, 420, (x, z) => { if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 6) return false; pine(x, z, 5 + r() * 7); });
    // snowy boulders
    const boulder = std(0x8e939c, { roughness: 1, flatShading: true });
    scatter(160, 7, 400, (x, z) => { const y = terrainH(x, z); inst(G.rock, boulder, M(x, y + .2, z, .8 + r() * 2, .6 + r() * 1.4, .8 + r() * 2, r() * 6)); inst(G.sphere, snowTop, M(x, y + .7, z, .7, .25, .7), { cast: false }); });
    // log cabins by the lake
    const logs = std(0x6b4a30, { roughness: .9 }), roofS = std(0xeef4fa, { roughness: .8 });
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 + .3, x = lake.x + Math.cos(a) * (lake.r + 12), z = lake.z + Math.sin(a) * (lake.r + 12);
      if (!free(x, z, 9)) continue; const y = terrainH(x, z), ry = a + Math.PI / 2;
      inst(G.box, logs, M(x, y + 1.6, z, 7, 3.2, 5, ry)); inst(G.roof, roofS, M(x, y + 4.1, z, 7.6, 2.2, 5.6, ry));
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .9), new THREE.MeshBasicMaterial({ color: 0xffc870, toneMapped: false }));
      win.position.set(x + Math.cos(a) * -2.55, y + 1.7, z + Math.sin(a) * -2.55); win.lookAt(lake.x, y + 1.7, lake.z); group.add(win);
    }
    // summit cross and flags
    { const sp = peak, y = sp.y, nxp = track.nearest(sp.x, sp.z), ox = sp.x + nxp.nx * (W / 2 + 6), oz = sp.z + nxp.nz * (W / 2 + 6);
      inst(G.box, std(0x5a3a22), M(ox, y + 3.5, oz, .35, 7, .35)); inst(G.box, std(0x5a3a22), M(ox, y + 5.3, oz, 2.6, .35, .35, nxp.angle)); }
    weather(1800, 0xffffff, .22, 2.4, 90, 40, 1.4);
  }

  function buildSpace() {
    // --- a floating start platform under grandstand and pits ---
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(70, 52, 6, 48), std(0x1b1338, { roughness: .4, metalness: .6, emissive: 0x2a1060, emissiveIntensity: .5 }));
    const [px, pz] = at(-6, 0); plat.position.set(px, -3.25, pz); plat.scale.set(1, 1, .62); plat.rotation.y = s0.angle; plat.receiveShadow = true; group.add(plat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(70, .5, 8, 96), new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false }));
    rim.rotation.x = Math.PI / 2; rim.position.set(px, -.3, pz); rim.scale.set(1, .62, 1); rim.rotation.z = -s0.angle; group.add(rim);
    // --- nebulae ---
    const neb = [['rgba(170,60,255,.55)', 'rgba(80,0,160,0)'], ['rgba(60,140,255,.5)', 'rgba(0,40,140,0)'], ['rgba(255,80,190,.45)', 'rgba(120,0,80,0)']];
    for (let i = 0; i < 14; i++) {
      const [a, b] = neb[i % 3], sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(a, b), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
      const ang = r() * Math.PI * 2, el = (r() - .3) * 1.2, d = 900 + r() * 300;
      sp.position.set(Math.cos(ang) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(ang) * Math.cos(el) * d); const sc = 500 + r() * 700; sp.scale.set(sc, sc * (.5 + r() * .5), 1); group.add(sp);
    }
    // --- ringed planet, moon and a distant sun ---
    const bands = canvasTex(256, (g, s) => { for (let y = 0; y < s; y++) { const h = 20 + Math.sin(y * .11) * 12 + Math.sin(y * .37) * 6; g.fillStyle = `hsl(${h},70%,${48 + Math.sin(y * .23) * 12}%)`; g.fillRect(0, y, s, 1); } }, 1);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 32), new THREE.MeshStandardMaterial({ map: bands, roughness: .8, fog: false }));
    planet.position.set(-520, 160, -620); planet.rotation.z = .35; group.add(planet);
    const ringTex = canvasTex(256, (g, s) => { for (let x = 0; x < s; x++) { g.fillStyle = `rgba(230,200,160,${(Math.sin(x * .3) * .5 + .5) * .7})`; g.fillRect(x, 0, 1, s); } }, 1);
    const ringGeo = new THREE.RingGeometry(180, 300, 96, 1); { const p = ringGeo.attributes.position, uv = ringGeo.attributes.uv; for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (rr - 180) / 120, .5); } }
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.position.copy(planet.position); ring.rotation.set(Math.PI / 2 - .35, .2, 0); group.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(45, 32, 20), new THREE.MeshStandardMaterial({ color: 0xb8b4c8, roughness: 1, flatShading: true, fog: false }));
    moon.position.set(620, 240, 380); group.add(moon);
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,255,1)', 'rgba(140,120,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    star.position.set(400, 500, 600); star.scale.set(260, 260, 1); group.add(star);
    // --- asteroid belt around the course ---
    const astMat = std(0x5b5470, { roughness: 1, flatShading: true }), crystal = new THREE.MeshStandardMaterial({ color: 0x8ff3ff, emissive: 0x3ad8ff, emissiveIntensity: 1.2, roughness: .2, flatShading: true });
    const belt = new THREE.Group(); group.add(belt);
    // One instanced mesh per material instead of ~300 separate rocks (they all turn with the belt group).
    const rocks = [], gems = [];
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, d = 330 + r() * 260, y = -60 + r() * 140, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const sc = 2 + r() * (i % 9 ? 12 : 4); (i % 9 ? rocks : gems).push(M(x, y, z, sc, sc * (.6 + r() * .6), sc, r() * 6, r() * 6, r() * 6));
    }
    // a few asteroids floating close under the track
    scatter(40, 14, 300, (x, z) => { const sc = 3 + r() * 6; rocks.push(M(x, -18 - r() * 40, z, sc, sc * .7, sc, r() * 6, r() * 6)); });
    for (const [list, mat] of [[rocks, astMat], [gems, crystal]]) { const im = new THREE.InstancedMesh(G.rock, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.frustumCulled = false; belt.add(im); }
    updaters.push((dt, t) => { belt.rotation.y = t * .004; });
    // shooting stars
    const comets = [];
    const cometMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, toneMapped: false, fog: false });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.05, 1.2, 60, 6), cometMat); c.userData.ph = r() * 10; group.add(c); comets.push(c); }
    updaters.push((dt, t) => comets.forEach((c, i) => { const k = ((t + c.userData.ph * 3) % 9) / 9; c.visible = k < .35; const a = c.userData.ph; c.position.set(Math.cos(a) * 700 - k * 900 * Math.sin(a), 300 - k * 200, Math.sin(a) * 700 + k * 900 * Math.cos(a)); c.lookAt(c.position.x - Math.sin(a) * 10, c.position.y - 2, c.position.z + Math.cos(a) * 10); c.rotateX(Math.PI / 2); }));
    // star dust drifting around the road
    weather(900, 0xc8b8ff, .28, .6, 90, 40, 3);
  }


  // ---------- offroad worlds ----------
  // Markers along both sides of every shortcut corridor (away from the road).
  function corridorEdges(place) {
    for (const sc of track.shortcuts) {
      let last = -9;
      for (const p of sc.pts) {
        if (p.u * sc.len - last < 3.2) continue; last = p.u * sc.len;
        const i = sc.pts.indexOf(p), q = sc.pts[Math.min(sc.pts.length - 1, i + 1)], o = sc.pts[Math.max(0, i - 1)], a = Math.atan2(q.x - o.x, q.z - o.z);
        for (const side of [-1, 1]) {
          const x = p.x + Math.cos(a) * side * (sc.width / 2 + .7), z = p.z - Math.sin(a) * side * (sc.width / 2 + .7);
          if (roadNear(x, z, W).d < W / 2 + 1.6) continue;
          place(x, z, a, p.y);
        }
      }
    }
  }
  function leafyTree(x, z, h, trunkMat, leafMats, spread = 1) {
    inst(G.cylLow, trunkMat, M(x, h * .45, z, .35 * spread, h * .9, .35 * spread));
    for (let k = 0; k < 4; k++) inst(G.puff, leafMats[k % leafMats.length], M(x + (r() - .5) * 2.2 * spread, h * (.85 + r() * .25), z + (r() - .5) * 2.2 * spread, (1.8 + r() * 1.4) * spread, (1.3 + r() * .9) * spread, (1.8 + r() * 1.4) * spread, r() * 6));
  }

  function buildJungle() {
    const trunk = std(0x5a4430), leaves = [std(0x2f6b2a, { flatShading: true }), std(0x3f8a32, { flatShading: true }), std(0x24561f, { flatShading: true })];
    // temple pyramid inside the first hairpin, ruins along the shortcut
    const sc0 = track.shortcuts[0], stone = std(0x9a9682, { roughness: 1, flatShading: true }), moss = std(0x6f8a52, { roughness: 1, flatShading: true });
    if (sc0) {
      const mid = sc0.pts[Math.floor(sc0.pts.length / 2)], hp = track.sample(sc0.tA + sc0.span / 2), cx = (mid.x * .35 + hp.x * .65), cz = (mid.z * .35 + hp.z * .65);
      for (let k = 0; k < 6; k++) { const w = 26 - k * 4; inst(G.box, k % 2 ? moss : stone, M(cx, 1.6 + k * 3.2, cz, w, 3.2, w)); }
      inst(G.box, stone, M(cx, 21.5, cz, 6, 4, 6)); inst(G.box, std(0x2a2620), M(cx, 21, cz + 3.01, 2, 2.6, .1));
      inst(G.box, stone, M(cx, 10, cz + 12, 4, 20, 8, 0, .62));
      for (const p of sc0.pts) if (r() < .12) { const a = r() * 6.28, d = sc0.width / 2 + 2.5 + r() * 4, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (roadNear(x, z).d > W / 2 + 3) inst(G.cylLow, r() < .5 ? stone : moss, M(x, 1.2, z, .9, 1.5 + r() * 3.5, .9, 0, (r() - .5) * .4, (r() - .5) * .4)); }
      // stone heads guarding the cut
      for (const u of [.15, .85]) { const p = track.sampleShortcut(sc0, u); for (const side of [-1, 1]) { const x = p.x + p.nx * side * (sc0.width / 2 + 2.2), z = p.z + p.nz * side * (sc0.width / 2 + 2.2); if (roadNear(x, z).d < W / 2 + 2) continue; inst(G.box, stone, M(x, 1.6, z, 2.2, 3.2, 2, p.angle)); inst(G.box, std(0x22201c), M(x + Math.sin(p.angle) * 1.01, 2.1, z + Math.cos(p.angle) * 1.01, 1.4, .3, .05, p.angle)); } }
    }
    // swamp water around the second shortcut
    const sc1 = track.shortcuts[1];
    if (sc1) {
      const water = new THREE.MeshStandardMaterial({ color: 0x3f5a2e, roughness: .15, metalness: .1, transparent: true, opacity: .9 });
      for (let k = 0; k < 14; k++) { const p = track.sampleShortcut(sc1, r()), side = r() < .5 ? -1 : 1, d = sc1.width / 2 + 3 + r() * 10, x = p.x + p.nx * side * d, z = p.z + p.nz * side * d;
        if (roadNear(x, z).d < W / 2 + 6) continue; const pool = new THREE.Mesh(new THREE.CircleGeometry(3 + r() * 5, 18), water); pool.rotation.x = -Math.PI / 2; pool.position.set(x, -.06, z); group.add(pool); }
      const reed = std(0x6a7a3a);
      corridorEdges((x, z) => { if (r() < .6) inst(G.cylLow, reed, M(x, .6, z, .06, 1.2 + r(), .06, 0, (r() - .5) * .3)); });
    }
    corridorEdges((x, z, a) => { if (r() < .5) inst(G.cylLow, std(0xc8b47a), M(x, .7, z, .09, 1.4, .09)); });
    // dense jungle
    scatter(520, 8, 420, (x, z) => leafyTree(x, z, 7 + r() * 9, trunk, leaves, 1 + r() * .6));
    scatter(160, 7, 380, (x, z) => palm(x, z, 6 + r() * 5));
    const fern = std(0x3c7a2c, { flatShading: true, side: THREE.DoubleSide });
    scatter(700, 5, 380, (x, z) => { for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + r(); inst(G.box, fern, M(x + Math.cos(a) * .6, .35, z + Math.sin(a) * .6, 1.6, .04, .4, -a, 0, -.5), { cast: false }); } });
    // hanging vines on trees near the road
    const vine = std(0x2d5a24);
    for (let i = 0; i < 160; i++) { const t = r(), s = track.sample(t), side = r() < .5 ? -1 : 1, off = W / 2 + 4 + r() * 4, x = s.x + s.nx * side * off, z = s.z + s.nz * side * off; if (!free(x, z, W / 2 + 2.5)) continue; inst(G.cylLow, vine, M(x, 6, z, .05, 7 + r() * 4, .05)); }
    // distant misty mountains
    const hill = std(0x3d6a3a, { roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = 520 + r() * 480; inst(G.hill, hill, M(Math.cos(a) * d, -10, Math.sin(a) * d, 110 + r() * 150, 50 + r() * 110, 110 + r() * 120, r() * 6), { cast: false }); }
    weather(260, 0xd8ff8a, .22, -.25, 70, 18, 2.2); // fireflies / pollen drifting up
  }

  function buildSavanna() {
    const trunk = std(0x5b4026, { roughness: .9 }), canopy = std(0x6f8a3a, { flatShading: true }), canopy2 = std(0x8a9a42, { flatShading: true });
    // acacias: thin forked trunk and a flat umbrella crown
    const acacia = (x, z, h) => {
      inst(G.cylLow, trunk, M(x, h * .45, z, .28, h * .9, .28, 0, (r() - .5) * .15, (r() - .5) * .15));
      for (let k = 0; k < 3; k++) { const a = r() * 6.28; inst(G.sphere, k % 2 ? canopy : canopy2, M(x + Math.cos(a) * 1.4, h + r() * .4, z + Math.sin(a) * 1.4, 3.5 + r() * 2, .55 + r() * .3, 3 + r() * 2), { cast: true }); }
    };
    scatter(240, 9, 520, (x, z) => acacia(x, z, 5 + r() * 4));
    // baobabs
    const bark = std(0x8a7262, { roughness: 1 });
    scatter(18, 14, 480, (x, z) => { const h = 9 + r() * 5; inst(G.cyl, bark, M(x, h / 2, z, 1.8 + r(), h, 1.8 + r())); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; inst(G.cylLow, bark, M(x + Math.cos(a) * 1.6, h + .8, z + Math.sin(a) * 1.6, .25, 2.4, .25, 0, Math.sin(a) * .7, -Math.cos(a) * .7)); } inst(G.sphere, canopy, M(x, h + 2, z, 4, 1.2, 4)); });
    // tall grass tufts
    const grass = std(0xd8b864, { flatShading: true }), grass2 = std(0xc49a4a, { flatShading: true });
    scatter(1400, 5, 520, (x, z) => inst(G.cone, r() < .5 ? grass : grass2, M(x, .45, z, .45 + r() * .4, .9 + r() * .7, .45 + r() * .4), { cast: false }));
    // termite mounds and rock kopjes
    const clay = std(0xb06a3a, { roughness: 1, flatShading: true }), granite = std(0x9a8e80, { roughness: 1, flatShading: true });
    scatter(40, 10, 420, (x, z) => inst(G.cone, clay, M(x, .9, z, .55 + r() * .3, 1.8 + r() * 1.4, .55 + r() * .3)));
    scatter(10, 30, 450, (x, z) => { for (let k = 0; k < 7; k++) inst(G.sphere, granite, M(x + (r() - .5) * 18, 1 + r() * 3, z + (r() - .5) * 18, 4 + r() * 6, 3 + r() * 5, 4 + r() * 6, r() * 6)); }, 20);
    // hay bales and tyre stacks mark the dirt shortcuts
    const hay = std(0xd9b45a, { roughness: 1 });
    corridorEdges((x, z, a) => { if (r() < .55) inst(G.cyl, hay, M(x, .55, z, .55, 1.1, .55, a, Math.PI / 2)); });
    // animals: cartoon giraffes and elephants wandering slowly (critters.js)
    const herd = [];
    scatter(22, 25, 420, (x, z) => { const q = r(), a = q < .4 ? cartoonGiraffe() : q < .7 ? cartoonZebra() : cartoonElephant(); a.position.set(x, 0, z); a.rotation.y = r() * 6.28; a.scale.setScalar(.9 + r() * .3); group.add(a); herd.push({ a, x, z, ph: r() * 10, dir: a.rotation.y }); }, 20);
    updaters.push((dt, t) => { for (const h of herd) { const k = Math.sin(t * .05 + h.ph) * 6; h.a.position.set(h.x + Math.sin(h.dir) * k, 0, h.z + Math.cos(h.dir) * k); h.a.rotation.y = h.dir + (Math.cos(t * .05 + h.ph) > 0 ? 0 : Math.PI); h.a.userData.anim(t + h.ph, 1); } });
    // distant flat-topped hills
    const hill = std(0xa0784a, { roughness: 1, flatShading: true });
    for (let i = 0; i < 20; i++) { const a = r() * Math.PI * 2, d = 650 + r() * 500; inst(G.hill, hill, M(Math.cos(a) * d, -6, Math.sin(a) * d, 110 + r() * 140, 28 + r() * 40, 110 + r() * 140, r() * 6), { cast: false }); }
    weather(300, 0xe8c890, .3, .15, 80, 12, 3); // drifting dust
  }

  function buildForest() {
    // giant mushrooms: white stems, spotted caps in many colours
    const stem = std(0xf2ead8, { roughness: .8 });
    const spotTex = color => canvasTex(256, (g, s) => { g.fillStyle = color; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(255,255,255,.95)'; for (let i = 0; i < 26; i++) { const x = r() * s, y = r() * s * .9, rad = 8 + r() * 18; g.beginPath(); g.arc(x, y, rad, 0, 6.28); g.fill(); } }, 1);
    const caps = ['#d8342c', '#e07a22', '#3a7ad8', '#9a4ad8', '#2fae6a'].map(c => new THREE.MeshStandardMaterial({ map: spotTex(c), roughness: .55 }));
    const capGeo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const mushroom = (x, z, h, w) => { inst(G.cyl, stem, M(x, h / 2, z, w * .22, h, w * .22)); inst(capGeo, caps[Math.floor(r() * caps.length)], M(x, h - w * .1, z, w, w * .6, w)); inst(G.cyl, std(0xe8dcc0), M(x, h - w * .12, z, w * .9, .08, w * .9), { cast: false }); };
    // huge ones close to the road, smaller ones everywhere
    for (let i = 0; i < 46; i++) { const t = r(), s = track.sample(t), side = r() < .5 ? -1 : 1, off = W / 2 + 8 + r() * 14, x = s.x + s.nx * side * off, z = s.z + s.nz * side * off; if (!free(x, z, W / 2 + 6)) continue; mushroom(x, z, 9 + r() * 12, 5 + r() * 6); }
    scatter(260, 5, 420, (x, z) => mushroom(x, z, 1 + r() * 4, .8 + r() * 2.2));
    // mushrooms along the meadow shortcuts
    corridorEdges((x, z) => { if (r() < .45) mushroom(x, z, .6 + r() * .9, .5 + r() * .5); });
    // autumn trees and pines
    const trunk = std(0x5a3f2a), autumn = [std(0xd8862a, { flatShading: true }), std(0xc8502a, { flatShading: true }), std(0xe0b030, { flatShading: true }), std(0x6a8a2a, { flatShading: true })];
    scatter(420, 8, 460, (x, z) => leafyTree(x, z, 6 + r() * 6, trunk, autumn, .9 + r() * .5));
    const pineMat = std(0x2a5a32, { flatShading: true });
    scatter(200, 8, 460, (x, z) => { const h = 8 + r() * 8; inst(G.cylLow, trunk, M(x, h * .2, z, .3, h * .4, .3)); for (let k = 0; k < 3; k++) inst(G.cone, pineMat, M(x, h * (.35 + k * .2), z, h * .25 * (1 - k * .25), h * .4, h * .25 * (1 - k * .25))); });
    // fallen logs and flowers
    const logMat = std(0x6a4a30, { roughness: 1 });
    scatter(70, 7, 380, (x, z) => inst(G.cyl, logMat, M(x, .45, z, .45, 4 + r() * 4, .45, r() * 6, Math.PI / 2)));
    const flowers = [std(0xff6ab0), std(0xffe04a), std(0xffffff), std(0x8a6aff)];
    scatter(900, 4, 360, (x, z) => inst(G.sphere, flowers[Math.floor(r() * 4)], M(x, .2, z, .18, .18, .18), { cast: false }));
    // a mushroom cottage near the start
    { const [hx, hz] = at(40, -(W / 2 + 24)); inst(G.cyl, std(0xf4ead2), M(hx, 3, hz, 4, 6, 4)); inst(capGeo, caps[0], M(hx, 5.6, hz, 7, 5, 7));
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), std(0x6a4024)); door.position.set(hx + s0.nx * 4.01, 1.2, hz + s0.nz * 4.01); door.lookAt(hx + s0.nx * 10, 1.2, hz + s0.nz * 10); group.add(door); }
    // rolling hills around
    const hill = std(0x5a7a3a, { roughness: 1, flatShading: true });
    for (let i = 0; i < 24; i++) { const a = r() * Math.PI * 2, d = 520 + r() * 480; inst(G.hill, hill, M(Math.cos(a) * d, -12, Math.sin(a) * d, 120 + r() * 140, 40 + r() * 70, 120 + r() * 120, r() * 6), { cast: false }); }
    weather(220, 0xfff2a8, .2, -.2, 70, 16, 2.5); // pollen
  }

  // ---------- season 2 worlds ----------
  // A tree on any height (leafyTree only stands on the ground).
  function treeAt(x, y, z, h, trunkMat, leafMats, spread = 1) {
    inst(G.cylLow, trunkMat, M(x, y + h * .45, z, .35 * spread, h * .9, .35 * spread));
    for (let k = 0; k < 4; k++) inst(G.puff, leafMats[k % leafMats.length], M(x + (r() - .5) * 2.2 * spread, y + h * (.85 + r() * .25), z + (r() - .5) * 2.2 * spread, (1.8 + r() * 1.4) * spread, (1.3 + r() * .9) * spread, (1.8 + r() * 1.4) * spread, r() * 6));
  }

  function buildSky() {
    // --- the start island: grass on top, rock tapering into the clouds ---
    const grass = std(0x7cc35a, { roughness: .9 }), rock = std(0xb59a7a, { roughness: 1, flatShading: true }), dirt = std(0x8a6a4a, { roughness: 1, flatShading: true });
    {
      const [px, pz] = at(-6, 0);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(70, 66, 3, 48), grass); top.position.set(px, -1.6, pz); top.scale.set(1, 1, .62); top.rotation.y = s0.angle; top.receiveShadow = true; group.add(top);
      const under = new THREE.Mesh(new THREE.ConeGeometry(66, 70, 24, 3), rock); under.rotation.x = Math.PI; under.position.set(px, -38, pz); under.scale.set(1, 1, .62); under.rotation.y = s0.angle; group.add(under);
    }
    // --- floating islands of every size, with trees, around and below the course ---
    const leaves = [std(0x4f9a3a, { flatShading: true }), std(0x6ab84a, { flatShading: true }), std(0xf3a6c8, { flatShading: true })], trunk = std(0x6a4a30);
    const island = (x, y, z, rad) => {
      inst(G.cyl, grass, M(x, y, z, rad, 1.2, rad * (.8 + r() * .3), r() * 6), { cast: false });
      inst(G.cone, r() < .5 ? rock : dirt, M(x, y - rad * .75, z, rad * .95, rad * 1.5, rad * .85, r() * 6, Math.PI));
      const n = Math.floor(rad / 5); for (let k = 0; k < n; k++) { const a = r() * 6.28, d = r() * rad * .7; treeAt(x + Math.cos(a) * d, y + .5, z + Math.sin(a) * d, 4 + r() * 4, trunk, leaves); }
    };
    scatter(26, 32, 420, (x, z) => island(x, -12 - r() * 30, z, 10 + r() * 16));
    scatter(16, 40, 700, (x, z) => { if (Math.hypot(x, z) < 380) return false; island(x, 10 + r() * 60, z, 18 + r() * 26); });
    // --- sea of clouds below and puffs drifting between the islands ---
    const seaTex = canvasTex(512, (g, s) => { g.fillStyle = '#f2f6fb'; g.fillRect(0, 0, s, s); clouds(g, s, r, 90, 'rgba(190,205,225,.35)', 20, 90); clouds(g, s, r, 70, 'rgba(255,255,255,.8)', 20, 70); }, 18);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: seaTex, roughness: 1, emissive: 0xffffff, emissiveMap: seaTex, emissiveIntensity: .35 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -75; group.add(sea);
    const puff = std(0xffffff, { roughness: 1, emissive: 0xe8f0ff, emissiveIntensity: .25 });
    const cloud = (x, y, z, s) => { for (let k = 0; k < 5; k++) inst(G.sphere, puff, M(x + (k - 2) * s * .7, y + (r() - .3) * s * .4, z + (r() - .5) * s * .6, s * (.7 + r() * .5), s * (.45 + r() * .3), s * (.6 + r() * .4)), { cast: false }); };
    for (let i = 0; i < 70; i++) { const a = r() * 6.28, d = 120 + r() * 700; cloud(Math.cos(a) * d, -66 + r() * 10, Math.sin(a) * d, 14 + r() * 22); }
    scatter(22, 30, 500, (x, z) => cloud(x, -25 + r() * 15, z, 6 + r() * 8));
    // --- hot-air balloons bobbing in the breeze ---
    const balloons = [], basket = std(0x8a6038), rope = std(0x3a2a1a);
    const stripes = ['#ff5a5a', '#ffd04a', '#39b8ff', '#7ad35a', '#bda0ff'].map((c, i) => canvasTex(128, (g, s) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#ffffff' : c; g.fillRect(k * s / 8, 0, s / 8, s); } }, 1));
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28 + r(), d = 160 + r() * 260, b = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 14), new THREE.MeshStandardMaterial({ map: stripes[i % stripes.length], roughness: .6 }));
      env.scale.y = 1.2; env.position.y = 8; b.add(env);
      const bk = new THREE.Mesh(G.box, basket); bk.scale.set(2, 1.4, 2); b.add(bk);
      for (const [ox, oz] of [[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]]) { const l = new THREE.Mesh(G.cylLow, rope); l.scale.set(.05, 3.6, .05); l.position.set(ox, 2.4, oz); b.add(l); }
      b.position.set(Math.cos(a) * d, 25 + r() * 45, Math.sin(a) * d); b.userData.ph = r() * 6; group.add(b); balloons.push(b);
    }
    updaters.push((dt, t) => balloons.forEach(b => { b.position.y += Math.sin(t * .5 + b.userData.ph) * .012; b.rotation.y = t * .05 + b.userData.ph; }));
    // --- a giant rainbow over the course ---
    const rainbow = ['#ff4a4a', '#ff9a3a', '#ffe04a', '#5ad85a', '#3aa8ff', '#8a5aff'];
    rainbow.forEach((c, i) => { const arc = new THREE.Mesh(new THREE.TorusGeometry(420 - i * 9, 4.5, 6, 80, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .45, depthWrite: false, fog: false, toneMapped: false })); arc.position.set(60, -60, -650); group.add(arc); });
    // --- sparkles drifting around the road ---
    weather(260, 0xfff6d8, .22, -.15, 80, 30, 2.4);
  }

  function buildSakura() {
    const bark = std(0x4a3228), pinks = [std(0xffb7d0, { flatShading: true }), std(0xff9ec0, { flatShading: true }), std(0xffd6e4, { flatShading: true }), std(0xf58ab0, { flatShading: true })];
    // cherry trees line the road, more in loose groves further out
    for (let i = 0; i < 70; i++) { const s = track.sample(r()), side = r() < .5 ? -1 : 1, off = W / 2 + 6 + r() * 10, x = s.x + s.nx * side * off, z = s.z + s.nz * side * off; if (!free(x, z, W / 2 + 4)) continue; leafyTree(x, z, 5 + r() * 3, bark, pinks, 1.1 + r() * .4); }
    scatter(320, 8, 460, (x, z) => leafyTree(x, z, 4 + r() * 4, bark, r() < .8 ? pinks : [std(0x5a8a3a, { flatShading: true })], .9 + r() * .5));
    // --- torii gates over the track ---
    const red = std(0xd8341f, { roughness: .5 }), black = std(0x1d1a1a, { roughness: .6 });
    for (let k = 0; k < 7; k++) {
      const s = track.sample(.05 + k / 7), half = W / 2 + 1.3, hw = W + 5.5;
      for (const side of [-1, 1]) { const x = s.x + s.nx * half * side, z = s.z + s.nz * half * side; inst(G.cyl, red, M(x, 3.5, z, .38, 7, .38)); inst(G.cyl, black, M(x, .4, z, .5, .8, .5)); }
      inst(G.box, red, M(s.x, 5.6, s.z, hw - 2, .45, .45, s.angle));
      inst(G.box, black, M(s.x, 7.2, s.z, hw, .5, .9, s.angle));
      inst(G.box, red, M(s.x, 6.8, s.z, hw - .6, .35, .7, s.angle));
    }
    // --- stone lanterns along the verges ---
    const stone = std(0xb8b2a6, { roughness: 1 });
    for (let i = 0; i < 60; i++) { const s = track.sample(i / 60), side = i % 2 ? 1 : -1, x = s.x + s.nx * side * (W / 2 + 3), z = s.z + s.nz * side * (W / 2 + 3); if (!free(x, z, W / 2 + 2.2)) continue;
      inst(G.box, stone, M(x, .5, z, .7, 1, .7)); inst(G.box, stone, M(x, 1.25, z, .45, .5, .45)); inst(G.roof, stone, M(x, 1.75, z, 1, .5, 1)); }
    // --- pagoda beside a lake, wherever the infield has room ---
    let spot = null;
    for (let i = 0; i < 400 && !spot; i++) { const x = (r() * 2 - 1) * 200, z = (r() * 2 - 1) * 200; if (free(x, z, 42)) spot = [x, z]; }
    if (spot) {
      const [px, pz] = spot, wall = std(0xf4ead8, { roughness: .8 }), roof = std(0x3a2a2a, { roughness: .6 });
      for (let f = 0; f < 5; f++) { const w = 9 - f * 1.4, y = f * 4; inst(G.box, f % 2 ? red : wall, M(px, y + 1.6, pz, w, 3.2, w)); inst(G.roof, roof, M(px, y + 3.6, pz, w * 1.7, 1.6, w * 1.7)); }
      inst(G.cyl, std(0xd8b04a, { metalness: .6, roughness: .3 }), M(px, 22, pz, .2, 4, .2));
      const lake = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshStandardMaterial({ color: 0x5aa8c8, roughness: .05, metalness: .2 }));
      lake.rotation.x = -Math.PI / 2; lake.position.set(px + 20, .02, pz + 6); group.add(lake);
      const pad = std(0x4a8a3a); for (let i = 0; i < 12; i++) { const a = r() * 6.28, d = r() * 13; inst(G.cyl, pad, M(px + 20 + Math.cos(a) * d, .06, pz + 6 + Math.sin(a) * d, .7, .04, .7), { cast: false }); }
    }
    // --- bamboo grove around the shortcut ---
    const bamboo = [std(0x7aa83a), std(0x5a8a2a), std(0x9ab84a)];
    corridorEdges((x, z) => { for (let k = 0; k < 3; k++) { const h = 6 + r() * 6; inst(G.cylLow, bamboo[k], M(x + (r() - .5) * 2, h / 2, z + (r() - .5) * 2, .12, h, .12, 0, (r() - .5) * .12, (r() - .5) * .12)); } });
    for (const sc of track.shortcuts) for (let i = 0; i < 160; i++) { const p = sc.pts[Math.floor(r() * sc.pts.length)], a = r() * 6.28, d = sc.width / 2 + 3 + r() * 16, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (!free(x, z, sc.width / 2 + 1.5) || roadNear(x, z).d < W / 2 + 3) continue; const h = 7 + r() * 7; inst(G.cylLow, bamboo[i % 3], M(x, h / 2, z, .13, h, .13)); }
    // --- a snow-capped volcano on the horizon ---
    inst(G.cone, std(0x6a7a9a, { roughness: 1 }), M(-260, 60, -900, 380, 260, 380), { cast: false });
    inst(G.cone, std(0xf4f8ff, { roughness: .9 }), M(-260, 160, -900, 140, 64, 140), { cast: false });
    const hill = std(0x7a9a5a, { roughness: 1, flatShading: true });
    for (let i = 0; i < 20; i++) { const a = r() * Math.PI * 2, d = 540 + r() * 420; inst(G.hill, hill, M(Math.cos(a) * d, -14, Math.sin(a) * d, 120 + r() * 140, 40 + r() * 60, 120 + r() * 120, r() * 6), { cast: false }); }
    // drifting petals
    weather(520, 0xffb7d0, .3, .7, 80, 22, 3.2);
  }

  function buildMoon() {
    // --- craters: raised rims and dark floors; one under every jump gap ---
    const rimMat = std(0xa6a8ae, { roughness: 1, flatShading: true }), floorMat = std(0x5c5e64, { roughness: 1 });
    const torus = new THREE.TorusGeometry(1, .18, 6, 28); torus.rotateX(Math.PI / 2);
    const crater = (x, z, rad) => { inst(torus, rimMat, M(x, 0, z, rad, rad * 1.2, rad), { cast: false }); inst(G.cyl, floorMat, M(x, -.04, z, rad * .95, .05, rad * .95), { cast: false }); };
    for (const j of track.jumps) { const s = track.sample(j.t + (j.gap / 2) / track.length); crater(s.x, s.z, Math.max(10, j.gap * .9)); }
    scatter(70, 12, 520, (x, z) => crater(x, z, 4 + r() * 18));
    // --- moon base: glass domes, modules, solar fields and antennas ---
    const metal = std(0xe4e6ea, { roughness: .35, metalness: .6 }), glass = new THREE.MeshStandardMaterial({ color: 0x9adfff, roughness: .05, metalness: .1, transparent: true, opacity: .45, emissive: 0x2a6a8a, emissiveIntensity: .4 });
    const domeGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const panel = std(0x1a2a6a, { roughness: .25, metalness: .7 }), lamp = new THREE.MeshBasicMaterial({ color: 0xff3a3a, toneMapped: false }); lamp.userData.live = true;
    let placed = 0;
    for (let i = 0; i < 600 && placed < 7; i++) {
      const x = (r() * 2 - 1) * 260, z = (r() * 2 - 1) * 220; if (!free(x, z, 26)) continue; placed++;
      const d = 7 + r() * 7; inst(domeGeo, glass, M(x, 0, z, d, d * .8, d), { cast: false }); inst(G.cyl, metal, M(x, .4, z, d + .4, .8, d + .4));
      for (let k = 0; k < 3; k++) { const a = r() * 6.28; inst(G.box, metal, M(x + Math.cos(a) * (d + 4), 1.4, z + Math.sin(a) * (d + 4), 5, 2.8, 3, -a)); }
      const ax = x + d + 6, az = z; inst(G.cylLow, metal, M(ax, 6, az, .2, 12, .2)); inst(G.sphere, lamp, M(ax, 12.3, az, .45, .45, .45), { cast: false });
      for (let k = 0; k < 4; k++) inst(G.box, panel, M(x - d - 6 - k * 4.4, 1.6, z, 3.8, .12, 6, 0, 0, .5));
    }
    updaters.push((dt, t) => { lamp.color.setRGB(Math.sin(t * 3) > .3 ? 1 : .2, .1, .1); });
    // --- a lander parked next to the start ---
    { const [lx, lz] = at(30, -(W / 2 + 26)), gold = std(0xd8a83a, { roughness: .35, metalness: .8 });
      inst(G.box, gold, M(lx, 3.4, lz, 4, 2.6, 4, .4)); inst(G.box, metal, M(lx, 5.6, lz, 3, 2, 3, .4));
      for (const [ox, oz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) inst(G.cylLow, metal, M(lx + ox, 1.4, lz + oz, .12, 3.2, .12, 0, oz * .12, -ox * .12)); }
    // --- boulders and distant ridges ---
    const boulder = std(0x8a8c92, { roughness: 1, flatShading: true });
    scatter(300, 6, 480, (x, z) => inst(G.rock, boulder, M(x, .2, z, .6 + r() * 2.6, .4 + r() * 1.6, .6 + r() * 2.4, r() * 6)));
    const ridge = std(0x6a6c72, { roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = 600 + r() * 450; inst(G.hill, ridge, M(Math.cos(a) * d, -20, Math.sin(a) * d, 140 + r() * 160, 50 + r() * 90, 120 + r() * 140, r() * 6), { cast: false }); }
    // --- Earth rising over the horizon ---
    const earthTex = canvasTex(512, (g, s) => { g.fillStyle = '#1d5fb8'; g.fillRect(0, 0, s, s); g.fillStyle = '#3f9a4a'; for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(r() * s, s * .2 + r() * s * .6, 20 + r() * 60, 12 + r() * 40, r() * 3, 0, 6.28); g.fill(); } clouds(g, s, r, 60, 'rgba(255,255,255,.55)', 10, 40); }, 1);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(110, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: .7, emissive: 0x16304a, emissiveIntensity: .5, fog: false }));
    earth.position.set(-480, 210, -760); group.add(earth);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(120,190,255,.6)', 'rgba(60,120,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    halo.position.copy(earth.position); halo.scale.set(330, 330, 1); group.add(halo);
    updaters.push((dt, t) => { earth.rotation.y = t * .01; });
    // fine moon dust in the headlights
    weather(240, 0xdfe4f0, .12, .08, 70, 14, 1.4);
  }

  function buildArena() {
    const A = map.arena;
    // Three looks: neon stadium (balloons), desert colosseum (coins), ice palace (crown).
    const S = {
      arena: { plinth: 0x2c2f3a, rim: 0xff4fd8, tier: 0x3a3f4c, bannerBg: '#120a24', banner: ['#ff4fd8', '#39b8ff', '#ffd04a'], text: 'APEX RUSH · BATTLE ·', lights: 'flood' },
      colosseum: { plinth: 0xc8a06a, rim: 0xffb347, tier: 0xc9a26a, bannerBg: '#5a1a12', banner: ['#ffd04a', '#ffffff', '#ffb347'], text: 'MÜNZJAGD · APEX RUSH ·', lights: 'torch' },
      ice: { plinth: 0xcfe6f8, rim: 0x5ff4ff, tier: 0xbcd4ea, bannerBg: '#0a2a44', banner: ['#5ff4ff', '#ffffff', '#ffd04a'], text: 'KRONENJAGD · APEX RUSH ·', lights: 'flood' },
    }[theme] || {};
    // --- centre island with its statue ---
    const plinth = std(S.plinth, { roughness: .5, metalness: theme === 'colosseum' ? 0 : .4 });
    inst(G.cyl, plinth, M(A.x, .5, A.z, A.inner - .3, 1, A.inner - .3));
    const neonRim = new THREE.Mesh(new THREE.TorusGeometry(A.inner - .2, .18, 8, 64), new THREE.MeshBasicMaterial({ color: S.rim, toneMapped: false }));
    neonRim.rotation.x = Math.PI / 2; neonRim.position.set(A.x, 1.02, A.z); group.add(neonRim);
    inst(G.cyl, std(0xd8dce4, { metalness: .8, roughness: .25 }), M(A.x, 3, A.z, 1.2, 4, 1.2));
    const trio = new THREE.Group(); trio.position.set(A.x, 5, A.z); group.add(trio);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: .2, metalness: .9, emissive: 0x6a4a10, emissiveIntensity: .35 });
    if (theme === 'colosseum') {
      // a giant spinning coin
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, .7, 40), gold); coin.rotation.x = Math.PI / 2; coin.position.y = 3.6; coin.castShadow = true; trio.add(coin);
      const star = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, .8, 5), new THREE.MeshStandardMaterial({ color: 0xfff1a8, metalness: .6, roughness: .3 })); star.rotation.x = Math.PI / 2; star.position.y = 3.6; trio.add(star);
    } else if (theme === 'ice') {
      // a giant golden crown over ice crystals
      const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.4, 1.6, 32, 1, true), gold); band.position.y = 3; band.material.side = THREE.DoubleSide; trio.add(band);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, spike = new THREE.Mesh(new THREE.ConeGeometry(.55, 1.8, 8), gold); spike.position.set(Math.cos(a) * 2.5, 4.6, Math.sin(a) * 2.5); trio.add(spike);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(.32, 12, 8), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xff3a5a : 0x3ab8ff, emissive: k % 2 ? 0xff3a5a : 0x3ab8ff, emissiveIntensity: .6 })); gem.position.set(Math.cos(a) * 2.6, 3, Math.sin(a) * 2.6); trio.add(gem); }
      const crystal = new THREE.MeshStandardMaterial({ color: 0xbfefff, roughness: .05, metalness: .1, transparent: true, opacity: .75, emissive: 0x3ab8ff, emissiveIntensity: .25, flatShading: true });
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + .3, d = A.inner - 2.2, h = 3 + r() * 4; inst(G.cone, crystal, M(A.x + Math.cos(a) * d, h / 2 + .9, A.z + Math.sin(a) * d, .9, h, .9, r()), { cast: false }); }
    } else {
      [['#ff4a4a', 0], ['#39b8ff', 2.1], ['#ffd04a', 4.2]].forEach(([c, a]) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshStandardMaterial({ color: c, roughness: .25, metalness: .1, emissive: c, emissiveIntensity: .25 }));
        b.scale.y = 1.2; b.position.set(Math.cos(a) * 1.9, 3 + Math.sin(a * 2) * .5, Math.sin(a) * 1.9); b.castShadow = true; trio.add(b);
      });
    }
    updaters.push((dt, t) => { trio.rotation.y = t * .4; trio.position.y = 5 + Math.sin(t * 1.3) * .25; });
    // --- stadium bowl: stepped tiers all around, full of cheering fans ---
    const tierMat = std(S.tier, { roughness: theme === 'ice' ? .3 : .7 }), crowdMat = std(0xffffff, { roughness: .8 });
    const fans = ['#ff4a4a', '#39b8ff', '#ffd04a', '#7ad35a', '#ff8adf', '#f5f5f0', '#bda0ff'].map(c => new THREE.Color(c));
    for (let k = 0; k < 9; k++) {
      const rad = A.outer + 7 + k * 3.4, h = 1.2 + k * 1.6, n = Math.round(rad * .9);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, x = A.x + Math.sin(a) * rad, z = A.z + Math.cos(a) * rad, seg = rad * Math.PI * 2 / n + .1;
        inst(G.box, tierMat, M(x, h / 2, z, seg, h, 3.4, a + Math.PI / 2), { cast: false });
        if (k > 0 && r() < .8) { const fx = x + (r() - .5) * 1.5, fz = z + (r() - .5) * .8; inst(G.sphere, crowdMat, M(fx, h + .42, fz, .28, .45, .24, a), { color: fans[Math.floor(r() * fans.length)], cast: false }); inst(G.sphere, crowdMat, M(fx, h + 1.05, fz, .22, .22, .22), { color: new THREE.Color([0xf2c8a0, 0xd8a070, 0x8a5a3a, 0xf8dcc0][k % 4]), cast: false }); }
      }
    }
    // --- neon banner wall around the arena floor ---
    const bannerTex = canvasTex(1024, (g, s) => { g.fillStyle = S.bannerBg; g.fillRect(0, 0, s, s); g.font = 'italic 900 120px Arial'; g.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) { g.fillStyle = S.banner[i]; g.fillText(S.text, i * 360 - 80, s / 2); } }, 1);
    bannerTex.wrapS = THREE.RepeatWrapping; bannerTex.repeat.set(6, 1);
    const banner = new THREE.Mesh(new THREE.CylinderGeometry(A.outer + 3.5, A.outer + 3.5, 2.4, 96, 1, true), new THREE.MeshStandardMaterial({ map: bannerTex, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: .32, side: THREE.DoubleSide }));
    banner.position.set(A.x, 1.4, A.z); group.add(banner);
    updaters.push((dt, t) => { bannerTex.offset.x = (t * .02) % 1; });
    if (theme === 'colosseum') {
      // outer wall with arches and burning torches
      const stone = std(0xd2ac74, { roughness: .95 }), dark = std(0x5a3a22, { roughness: 1 });
      const wallR = A.outer + 7 + 9 * 3.4 + 2, n = 48;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = A.x + Math.sin(a) * wallR, z = A.z + Math.cos(a) * wallR, seg = wallR * Math.PI * 2 / n;
        inst(G.box, stone, M(x, 11, z, seg * .35, 22, 3, a + Math.PI / 2)); inst(G.box, stone, M(x, 20, z, seg + .2, 4, 3, a + Math.PI / 2)); inst(G.box, dark, M(x, 8, z, seg * .6, 14, 2.6, a + Math.PI / 2), { cast: false }); }
      const fire = glowTex('rgba(255,210,120,1)', 'rgba(255,90,20,0)');
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = A.outer + 4, x = A.x + Math.sin(a) * rr, z = A.z + Math.cos(a) * rr;
        inst(G.cylLow, dark, M(x, 2, z, .18, 4, .18));
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fire, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); f.position.set(x, 4.4, z); f.scale.set(2.4, 3.2, 1); f.userData.ph = r() * 6; group.add(f);
        updaters.push((dt, t) => { const k = 1 + Math.sin(t * 9 + f.userData.ph) * .12; f.scale.set(2.4 * k, 3.2 * k, 1); }); }
      // dunes and palms beyond the walls
      const sand = std(0xd8b07a, { roughness: 1, flatShading: true });
      for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 200 + r() * 500; inst(G.sphere, sand, M(Math.sin(a) * d, -4, Math.cos(a) * d, 40 + r() * 60, 8 + r() * 14, 30 + r() * 50, r() * 3), { cast: false }); }
      for (let i = 0; i < 24; i++) { const a = r() * Math.PI * 2, d = 140 + r() * 120; palm(Math.sin(a) * d, Math.cos(a) * d, 7 + r() * 5); }
      return;
    }
    if (theme === 'ice') {
      const peaks = std(0x8aa4c4, { roughness: 1, flatShading: true }), caps = std(0xf4f8ff, { roughness: .9 });
      for (let i = 0; i < 22; i++) { const a = r() * Math.PI * 2, d = 420 + r() * 380, h = 120 + r() * 160; inst(G.cone, peaks, M(Math.sin(a) * d, h / 2 - 10, Math.cos(a) * d, 90 + r() * 80, h, 90 + r() * 80, r()), { cast: false }); inst(G.cone, caps, M(Math.sin(a) * d, h * .82 - 10, Math.cos(a) * d, 30, h * .36, 30), { cast: false }); }
      const pine = std(0x2a5a42, { flatShading: true });
      for (let i = 0; i < 120; i++) { const a = r() * Math.PI * 2, d = 140 + r() * 220, h = 8 + r() * 8; inst(G.cone, pine, M(Math.sin(a) * d, h / 2, Math.cos(a) * d, h * .3, h, h * .3)); inst(G.cone, caps, M(Math.sin(a) * d, h * .82, Math.cos(a) * d, h * .16, h * .3, h * .16), { cast: false }); }
      weather(600, 0xffffff, .22, 2.2, 80, 34, 1.2);
    }
    // --- floodlight towers ---
    const steel = std(0x8a8f96, { metalness: .7, roughness: .35 }), lampMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c0 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, rad = A.outer + 42, x = A.x + Math.sin(a) * rad, z = A.z + Math.cos(a) * rad;
      inst(G.cylLow, steel, M(x, 22, z, .9, 44, .9));
      const head = new THREE.Mesh(G.box, lampMat); head.scale.set(9, 4, .5); head.position.set(x, 45, z); head.lookAt(A.x, 0, A.z); group.add(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,250,230,.9)', 'rgba(255,240,200,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      glow.position.copy(head.position); glow.scale.set(16, 16, 1); glow.material.opacity = .55; group.add(glow);
    }
    if (theme === 'ice') return;
    // --- city skyline beyond the stadium ---
    const tower = std(0x1c1f2a, { roughness: .6, emissive: 0x2a1a5a, emissiveIntensity: .25 });
    for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = 230 + r() * 260, h = 30 + r() * 120; inst(G.box, tower, M(Math.sin(a) * d, h / 2, Math.cos(a) * d, 14 + r() * 20, h, 14 + r() * 20, r()), { cast: false }); }
  }

  // --- flush instanced pools ---
  for (const { geo, mat, list, cast, colors } of pools.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (colors.length === list.length) colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.castShadow = cast; mesh.receiveShadow = true; mesh.frustumCulled = false;
    group.add(mesh);
  }
  group.userData.update = (dt, t, cam) => { for (const u of updaters) u(dt, t, cam); };
  group.userData.envPosition = new THREE.Vector3(s0.x, 6, s0.z);
  return group;
}
