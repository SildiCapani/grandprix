import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sculpt } from './sculpt.js';

// Cartoon creatures and props in a bright "kart game" style: round shapes, strong colours and big shiny eyes.
// Every model is assembled from simple primitives that are merged per moving part, so a whole animal costs only a
// handful of draw calls. Each builder returns a THREE.Group whose userData.anim(t, speed) animates it
// (legs walk, tails swish, wings flap ...). Models face +z, stand on y = 0 and are roughly life-sized for the game.

const SEG = { sphere: new THREE.SphereGeometry(1, 20, 14), lowSphere: new THREE.SphereGeometry(1, 12, 8), eyeSphere: new THREE.SphereGeometry(1, 14, 10), cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cone: new THREE.ConeGeometry(1, 1, 14), torus: new THREE.TorusGeometry(1, .35, 12, 28), capsule: new THREE.CapsuleGeometry(.5, 1, 6, 12), capLow: new THREE.CapsuleGeometry(.5, 1, 3, 8), tinySphere: new THREE.SphereGeometry(1, 8, 6), box: new THREE.BoxGeometry(1, 1, 1), ico: new THREE.IcosahedronGeometry(1, 1), dodeca: new THREE.DodecahedronGeometry(1, 1) };
for (const k in SEG) { SEG[k] = SEG[k].index ? SEG[k].toNonIndexed() : SEG[k]; SEG[k].deleteAttribute('uv'); }

const materials = new Map();
// One shared material for everything with baked vertex colours; variants for glossy candy, glass and glowing parts.
export function critterMat(kind = 'std', color = 0xffffff) {
  const key = kind + color; if (materials.has(key)) return materials.get(key);
  let m;
  if (kind === 'gummy') m = new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: .15, metalness: 0, transparent: true, opacity: .82, emissive: color, emissiveIntensity: .18 });
  else if (kind === 'glow') m = new THREE.MeshStandardMaterial({ vertexColors: true, color, emissive: color, emissiveIntensity: 1.4, roughness: .6, toneMapped: false });
  else if (kind === 'glass') m = new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: .05, metalness: .2, transparent: true, opacity: .55 });
  else m = new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: .5, metalness: 0 });
  materials.set(key, m); return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
// Collects coloured primitives per moving part, then merges them.
function kit() {
  const parts = new Map();
  const api = {
    // shape: name in SEG or a BufferGeometry; p = position, s = scale (number or [x,y,z]), r = euler rotation
    add(key, shape, color, p = [0, 0, 0], s = 1, r = [0, 0, 0]) {
      let g = typeof shape === 'string' ? SEG[shape] : shape; g = g.index ? g.toNonIndexed() : g.clone(); if (g.attributes.uv) g.deleteAttribute('uv');
      const sc = Array.isArray(s) ? s : [s, s, s];
      _m.compose(new THREE.Vector3(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2])), new THREE.Vector3(...sc)); g.applyMatrix4(_m);
      _c.set(color).convertSRGBToLinear(); const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (!parts.has(key)) parts.set(key, []); parts.get(key).push(g); return api;
    },
    // A pre-built geometry that already carries vertex colours (e.g. from sculpt()).
    addGeo(key, geo, p = [0, 0, 0], s = 1, r = [0, 0, 0]) {
      let g = geo.index ? geo.toNonIndexed() : geo.clone(); if (g.attributes.uv) g.deleteAttribute('uv');
      const sc = Array.isArray(s) ? s : [s, s, s]; _m.compose(new THREE.Vector3(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2])), new THREE.Vector3(...sc)); g.applyMatrix4(_m);
      if (!parts.has(key)) parts.set(key, []); parts.get(key).push(g); return api;
    },
    // Cartoon eye: white ball, dark pupil looking forward (+z, or along dir), small highlight. Optional eyelid colour for a grumpy look.
    eye(key, p, size, lid = null, look = [0, 0, 1]) {
      const [lx, ly, lz] = look;
      api.add(key, 'eyeSphere', 0xffffff, p, size);
      api.add(key, 'eyeSphere', 0x15121a, [p[0] + lx * size * .55, p[1] + ly * size * .55 + size * .05, p[2] + lz * size * .55], size * .58);
      api.add(key, 'lowSphere', 0xffffff, [p[0] + lx * size * .85 + size * .18, p[1] + size * .35, p[2] + lz * size * .85], size * .17);
      if (lid) api.add(key, 'sphere', lid, [p[0], p[1] + size * .42, p[2] - size * .05], [size * 1.12, size * .62, size * 1.1], [-.35 * lz, 0, .35 * lx]);
      return api;
    },
    // pivots: {key: [x,y,z]} — that part rotates around the pivot. mats: {key: material} (default: shared vertex-colour material).
    build(pivots = {}, mats = {}, opts = {}) {
      const root = new THREE.Group(), bones = {};
      for (const [key, list] of parts) {
        const pv = pivots[key] || [0, 0, 0], geo = mergeGeometries(list); list.forEach(g => g.dispose());
        geo.translate(-pv[0], -pv[1], -pv[2]); geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mats[key] || opts.mat || critterMat()); mesh.position.set(...pv); mesh.castShadow = opts.shadow !== false;
        bones[key] = mesh;
      }
      // nest parts: opts.parent = {child: parentKey}
      for (const [key, mesh] of Object.entries(bones)) {
        const parent = opts.parent?.[key];
        if (parent && bones[parent]) { mesh.position.sub(bones[parent].position); bones[parent].add(mesh); } else root.add(mesh);
      }
      root.userData.bones = bones; root.userData.anim = () => {}; return root;
    },
  };
  return api;
}
const walk = (b, keys, t, amp = .55, rate = 9) => keys.forEach((k, i) => { if (b[k]) b[k].rotation.x = Math.sin(t * rate + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; });

// Parts above were authored relative to their pivot (local coordinates) — undo the pivot shift build() applied.
function shiftParts(g, pv) { for (const [key, p] of Object.entries(pv)) { const m = g.userData.bones[key]; if (m) m.geometry.translate(p[0], p[1], p[2]); } }



export function bat() {
  const k = kit(), F = 0x3a2a4a, M = 0x5a3a6a;
  k.add('body', 'sphere', F, [0, 0, 0], [.25, .3, .25]);
  for (const s of [-1, 1]) { k.eye('body', [s * .1, .08, .2], .06, null, [0, 0, 1]); k.add('body', 'cone', F, [s * .13, .35, 0], [.07, .2, .07]); }
  for (const [key, s] of [['wL', -1], ['wR', 1]]) { const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(s * .9, .25); shape.lineTo(s * .75, -.05); shape.lineTo(s * .55, .05); shape.lineTo(s * .4, -.12); shape.lineTo(s * .2, -.02); shape.lineTo(0, -.15); const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); k.add(key, geo, M, [0, 0, 0], 1); }
  const pv = { wL: [-.15, .05, 0], wR: [.15, .05, 0] }; const g = k.build(pv, {}, { shadow: false }); shiftParts(g, pv);
  g.userData.bones.wL.material = g.userData.bones.wR.material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .7 });
  g.userData.anim = (t, rate = 12) => { const b = g.userData.bones, a = Math.sin(t * rate) * .8; b.wL.rotation.z = a; b.wR.rotation.z = -a; };
  return g;
}


// ---------------------------------------------------------------- obstacles / props ----------
// Cannonball with grumpy eyes (falls from the sky).
export function cannonball() {
  const k = kit(); k.add('body', 'sphere', 0x24262e, [0, 0, 0], .8); k.add('body', 'sphere', 0x5a5e6a, [-.3, .35, .4], .22);
  k.add('body', 'cyl', 0x8a6a3a, [0, .9, 0], [.08, .3, .08]);
  for (const s of [-1, 1]) k.eye('body', [s * .26, .12, .62], .2, 0x24262e, [0, 0, 1]);
  return k.build();
}
// Glowing lava bomb / meteor: dark rock with glowing cracks.
export function hotRock(glowCol = 0xff6a10, rockCol = 0x6a3a2a) {
  const k = kit(), g2 = kit();
  k.add('body', 'dodeca', rockCol, [0, 0, 0], [1.05, .95, 1]);
  for (let i = 0; i < 6; i++) k.add('body', 'dodeca', new THREE.Color(rockCol).offsetHSL(0, 0, (i % 3 - 1) * .05).getHex(), [Math.cos(i * 1.1) * .6, Math.sin(i * 1.7) * .55, Math.sin(i * 1.1) * .6], .45);
  for (let i = 0; i < 12; i++) g2.add('glow', 'lowSphere', 0xffffff, [Math.cos(i * 2.4) * .9, Math.sin(i * 1.3) * .85, Math.sin(i * 2.4) * .9], [.3, .3, .3]);
  const g = k.build(); const glow = g2.build({}, { glow: critterMat('glow', glowCol) }, { shadow: false }); g.add(glow.children[0]);
  return g;
}
// Lava bubble with eyes: a glowing ball of lava that jumps out of the volcano.
export function lavaBubble() {
  const k = kit(), e = kit();
  k.add('body', 'sphere', 0xffb030, [0, 0, 0], 1); k.add('body', 'sphere', 0xffe070, [0, .45, .3], [.6, .45, .55]);
  for (let i = 0; i < 5; i++) k.add('body', 'cone', 0xffc040, [Math.cos(i * 1.3) * .35, .85, Math.sin(i * 1.3) * .35 - .2], [.22, .7, .22], [-.4, 0, Math.cos(i * 1.3) * .4]);
  for (const s of [-1, 1]) e.eye('eyes', [s * .33, .15, .82], .24, null, [0, 0, 1]);
  const g = k.build({}, { body: critterMat('glow', 0xff7a10) }, { shadow: false }); g.add(e.build().children[0]);
  return g;
}
export function boulder(col = 0xb07a50) {
  const k = kit(); k.add('body', 'dodeca', col, [0, 0, 0], 1);
  for (let i = 0; i < 7; i++) k.add('body', 'dodeca', new THREE.Color(col).offsetHSL(0, 0, (i % 3 - 1) * .06).getHex(), [Math.cos(i * 2.1) * .55, Math.sin(i * 1.3) * .55, Math.sin(i * 2.1) * .55], .55);
  k.add('body', 'sphere', 0x6aa040, [0, .85, .1], [.4, .15, .35]); return k.build();
}
export function snowball() {
  const k = kit(); k.add('body', 'sphere', 0xf6fbff, [0, 0, 0], 1);
  for (let i = 0; i < 10; i++) k.add('body', 'sphere', i % 3 ? 0xffffff : 0xdde9f6, [Math.cos(i * 2.4) * .75, Math.sin(i * 1.9) * .7, Math.sin(i * 2.4) * .75], .38);
  return k.build();
}
export function stoneball() {
  const k = kit(); k.add('body', 'sphere', 0xa69a82, [0, 0, 0], 1);
  k.add('body', 'torus', 0x8a7e66, [0, 0, 0], [1, 1, .55], [0, 0, 0]); k.add('body', 'torus', 0x8a7e66, [0, 0, 0], [1, 1, .55], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) k.add('body', 'sphere', 0x58a03a, [Math.cos(i * 2.2) * .8, Math.sin(i * 1.5) * .6, Math.sin(i * 2.2) * .8], [.35, .15, .3]);
  k.add('body', 'sphere', 0xffd04a, [0, 0, .98], [.25, .25, .06]);
  return k.build();
}
export function donut() {
  const k = kit(), sprCols = [0xffffff, 0xffd04a, 0x3ab8ff, 0x5ad86a, 0xff4a3a, 0x9a5aff];
  k.add('body', 'torus', 0xe0a058, [0, 0, 0], [.72, .72, .9]);
  k.add('body', 'torus', 0xff7ac8, [0, 0, .1], [.73, .73, .75]);
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2 + (i % 2) * .1, rr = .72 + ((i * 7) % 5 - 2) * .05; k.add('body', 'capsule', sprCols[i % sprCols.length], [Math.cos(a) * rr, Math.sin(a) * rr, .35], [.05, .07, .05], [0, 0, i * 1.3]); }
  return k.build();
}
export function hoverCar(col = 0xff4a6a) {
  const k = kit(), g2 = kit();
  k.add('body', 'sphere', col, [0, 0, 0], [.95, .38, 1.7]);
  k.add('body', 'sphere', 0xffffff, [0, -.08, 0], [1.02, .14, 1.75]);
  k.add('body', 'cone', col, [.7, .35, -1.2], [.1, .7, .45], [-.5, 0, -.3]); k.add('body', 'cone', col, [-.7, .35, -1.2], [.1, .7, .45], [-.5, 0, .3]);
  k.add('body', 'sphere', 0xfff0a0, [.5, 0, 1.6], [.16, .1, .06]); k.add('body', 'sphere', 0xfff0a0, [-.5, 0, 1.6], [.16, .1, .06]);
  k.add('body', 'sphere', 0xffd8a8, [0, .62, .1], .26); k.eye('body', [-.1, .66, .3], .07, null, [0, 0, 1]); k.eye('body', [.1, .66, .3], .07, null, [0, 0, 1]);
  g2.add('glass', 'sphere', 0xffffff, [0, .38, .2], [.6, .48, .8]);
  const glow = kit(); glow.add('glow', 'cyl', 0xffffff, [0, -.3, 0], [.8, .06, 1.4]);
  const g = k.build(); g.add(g2.build({}, { glass: critterMat('glass', 0x8ae0ff) }, { shadow: false }).children[0]); g.add(glow.build({}, { glow: critterMat('glow', 0x5ae8ff) }, { shadow: false }).children[0]);
  return g;
}
// Kraken tentacle: tapered, curled tip, suckers on the inner side. Bend it with userData.bend(0..1).
export function tentacle() {
  const k = kit(), Pp = 0x9a3ab8, S = 0xffb0e0, n = 10, pv = {}, len = [];
  for (let i = 0; i < n; i++) {
    const ra = .7 - i * .055, rb = Math.max(.12, ra - .055), L = ra * 1.55, key = 's' + i; len.push(L);
    k.addGeo(key, sculpt([Cp(Pp, [0, 0, 0], [0, L + rb * .4, 0], ra, rb), P(E(S, 0, L * .5, ra * .78, ra * .4, ra * .4, ra * .22)), ...(i === n - 1 ? [] : [])], { k: .05, res: 22 }));
    pv[key] = [0, 0, 0];
  }
  const parent = {}; for (let i = 1; i < n; i++) parent['s' + i] = 's' + (i - 1);
  const g = k.build(pv, {}, { parent });
  for (let i = 1; i < n; i++) g.userData.bones['s' + i].position.set(0, len[i - 1], 0);
  g.userData.bend = (b, t) => { for (let i = 1; i < n; i++) g.userData.bones['s' + i].rotation.x = b * (.22 + i * .02) + Math.sin(t * 3 + i * .6) * .06; };
  return g;
}


// Cartoon person for marshals and fans: big round head with eyes and a cap, chunky body. userData.arms = [left, right]
// (each rotates around the shoulder, the arm hangs down along -y, so flags can be attached at (0, -.55, 0)).
const _people = new Map();
export function person(shirt = 0xff4a3a, skin = 0xf2c8a0, cap = null) {
  const k = kit(); cap ??= shirt;
  k.add('body', 'capLow', 0x2a3448, [-.1, .38, 0], [.2, .45, .22]); k.add('body', 'capLow', 0x2a3448, [.1, .38, 0], [.2, .45, .22]);
  k.add('body', 'lowSphere', 0x3a2a20, [-.1, .05, .06], [.11, .07, .16]); k.add('body', 'lowSphere', 0x3a2a20, [.1, .05, .06], [.11, .07, .16]);
  k.add('body', 'capLow', shirt, [0, 1, 0], [.5, .4, .36]);
  k.add('body', 'lowSphere', skin, [0, 1.55, 0], [.3, .29, .28]);
  k.add('body', 'lowSphere', cap, [0, 1.66, -.02], [.31, .2, .3]); k.add('body', 'cyl', cap, [0, 1.63, .22], [.22, .03, .18]);
  for (const s of [-1, 1]) { k.add('body', 'tinySphere', 0xffffff, [s * .1, 1.56, .23], .055); k.add('body', 'tinySphere', 0x15121a, [s * .1, 1.565, .26], .033); }
  k.add('body', 'torus', 0x8a3a2a, [0, 1.45, .26], [.05, .035, .03], [0, 0, Math.PI]);
  for (const key of ['aL', 'aR']) { k.add(key, 'capLow', shirt, [0, -.18, 0], [.13, .3, .13]); k.add(key, 'lowSphere', skin, [0, -.45, 0], .08); }
  const pv = { aL: [-.27, 1.18, 0], aR: [.27, 1.18, 0] }; const g = k.build(pv); shiftParts(g, pv);
  g.userData.arms = [g.userData.bones.aL, g.userData.bones.aR]; g.userData.arms.forEach(m => { m.castShadow = false; });
  return g;
}

// ---------------------------------------------------------------- animals (clay-sculpted, see sculpt.js) ----------
// Each moving part is one smooth sculpted body; eyes stay separate glossy balls (that is what makes them cartoon).
const E = (c, x, y, z, rx, ry, rz, rot, extra) => ({ e: [x, y, z], r: [rx, ry, rz], c, ...(rot ? { rot } : {}), ...(extra || {}) });
const Cp = (c, a, b, ra, rb, extra) => ({ a, b, ra, rb, c, ...(extra || {}) });
const P = (s) => ({ ...s, paint: true });

export function orca() {
  const k = kit(), B = 0x2c3550, W = 0xf6f8fa, G = 0xa4aec4;
  k.addGeo('body', sculpt([
    E(B, 0, 0, .2, .92, .86, 2.3), E(B, 0, -.05, 2.05, .74, .7, .95), Cp(B, [0, .05, -1.2], [0, .05, -2], .62, .45),
    E(B, 0, 1.25, -.35, .13, .78, .42, [-.45, 0, 0], { k: .25 }),
    E(B, .95, -.5, 1.2, .55, .09, .3, [0, .5, -.5], { k: .15 }), E(B, -.95, -.5, 1.2, .55, .09, .3, [0, -.5, .5], { k: .15 }),
    P(E(W, 0, -.62, .9, .62, .42, 2.1)), P(E(W, 0, -.5, 2.45, .5, .35, .62)),
    P(E(W, .6, .32, 1.6, .26, .2, .5, [0, .3, 0])), P(E(W, -.6, .32, 1.6, .26, .2, .5, [0, -.3, 0])),
    P(E(G, 0, .82, -.75, .5, .25, .6)),
  ], { k: .5, res: 54 }));
  for (const s of [-1, 1]) k.eye('body', [s * .6, .1, 2.38], .12, null, [s * .5, 0, .85]);
  k.add('body', 'torus', 0x5a1a2a, [0, -.15, 2.85], [.24, .12, .12]);
  k.addGeo('tail', sculpt([Cp(B, [0, 0, 0], [0, 0, -1.25], .45, .16), E(B, .62, 0, -1.4, .62, .08, .3, [0, -.5, 0], { k: .15 }), E(B, -.62, 0, -1.4, .62, .08, .3, [0, .5, 0], { k: .15 })], { k: .3, res: 40 }));
  const pv = { tail: [0, .05, -1.9] }; const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t) => { g.userData.bones.tail.rotation.x = Math.sin(t * 6) * .35; };
  return g;
}

export function rhino() {
  const k = kit(), C = 0xc6c4d6, D = 0xa6a2bc, H = 0xfff6dc;
  k.addGeo('body', sculpt([E(C, 0, 1.3, 0, 1, .88, 1.5), E(C, 0, 1.55, .65, .86, .78, .8), E(C, 0, 1.3, -1, .9, .82, .8), E(C, 0, 1.45, 1.3, .62, .6, .5)], { k: .45, res: 50 }));
  k.add('tail', 'cyl', D, [0, -.25, 0], [.06, .5, .06]); k.add('tail', 'sphere', 0x5a5670, [0, -.55, 0], .1);
  k.addGeo('head', sculpt([
    E(C, 0, 0, .35, .56, .54, .75), E(C, 0, -.2, 1.05, .48, .44, .55), E(0xdedbea, 0, -.42, 1.2, .38, .2, .38, null, { k: .1 }),
    Cp(H, [0, .12, 1.3], [0, 1.15, 1.72], .24, .03, { k: .12 }), Cp(H, [0, .3, .78], [0, .68, .9], .15, .03, { k: .1 }),
    E(C, .36, .5, -.05, .11, .25, .08, [0, 0, -.4], { k: .08 }), E(C, -.36, .5, -.05, .11, .25, .08, [0, 0, .4], { k: .08 }),
  ], { k: .3, res: 50 }));
  for (const s of [-1, 1]) { k.eye('head', [s * .4, .18, .75], .13, D, [s * .4, 0, .9]); k.add('head', 'sphere', 0x5a5670, [s * .17, -.2, 1.58], [.06, .05, .03]); }
  const leg = sculpt([Cp(C, [0, .1, 0], [0, -.95, .04], .31, .27), E(C, 0, -1, .08, .32, .12, .34), P(E(H, 0, -1.02, .38, .26, .1, .08))], { k: .15, res: 30 });
  for (const i of [0, 1, 2, 3]) k.addGeo('l' + i, leg);
  const pv = { head: [0, 1.55, 1.55], tail: [0, 1.4, -1.85], l0: [-.55, 1, .9], l1: [.55, 1, .9], l2: [-.55, 1, -.9], l3: [.55, 1, -.9] };
  const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t, run = 1) => { const b = g.userData.bones; walk(b, ['l0', 'l1', 'l2', 'l3'], t, .6 * run, 12); b.head.rotation.x = Math.sin(t * 12) * .07 * run; b.tail.rotation.z = Math.sin(t * 9) * .5; };
  return g;
}

export function giraffe() {
  const k = kit(), Y = 0xffc23a, S = 0xb0601e, L = 0xffe6a0, spots = [];
  for (let i = 0; i < 14; i++) spots.push(P(E(S, Math.cos(i * 2.3) * .78, 3.05 + Math.sin(i * 1.7) * .5, -1 + i * .16, .24, .24, .24)));
  k.addGeo('body', sculpt([E(Y, 0, 3, 0, .82, .76, 1.32), E(Y, 0, 3.25, .8, .7, .7, .6), ...spots], { k: .4, res: 46 }));
  k.add('tail', 'cyl', Y, [0, -.4, 0], [.05, .8, .05]); k.add('tail', 'sphere', 0x6a3410, [0, -.85, 0], [.1, .16, .1]);
  const nspots = []; for (let i = 0; i < 6; i++) nspots.push(P(E(S, (i % 2 ? .3 : -.3), .35 + i * .4, .1 + i * .07, .16, .16, .16)));
  k.addGeo('neck', sculpt([
    Cp(Y, [0, 0, 0], [0, 2.55, .45], .4, .22), E(Y, 0, 2.85, .62, .32, .3, .5), E(L, 0, 2.72, 1.05, .25, .22, .27, null, { k: .15 }),
    Cp(Y, [.15, 3.05, .45], [.17, 3.5, .38], .06, .05, { k: .05 }), Cp(Y, [-.15, 3.05, .45], [-.17, 3.5, .38], .06, .05, { k: .05 }), P(E(S, .17, 3.53, .38, .1, .1, .1)), P(E(S, -.17, 3.53, .38, .1, .1, .1)),
    E(Y, .38, 3.1, .32, .2, .07, .1, [0, 0, .5], { k: .06 }), E(Y, -.38, 3.1, .32, .2, .07, .1, [0, 0, -.5], { k: .06 }),
    P(Cp(0x8a4418, [0, .1, -.38], [0, 2.4, .22], .12, .08)), ...nspots,
  ], { k: .25, res: 56 }));
  for (const s of [-1, 1]) k.eye('neck', [s * .26, 2.98, .82], .12, null, [s * .5, 0, .8]);
  const leg = sculpt([Cp(Y, [0, 0, 0], [0, -2.4, 0], .15, .1), E(Y, 0, -1.2, 0, .14, .17, .14), P(E(0x5a2a10, 0, -2.45, 0, .2, .14, .2)), E(Y, 0, -2.42, .02, .13, .1, .15)], { k: .1, res: 40 });
  for (const i of [0, 1, 2, 3]) k.addGeo('l' + i, leg);
  const pv = { neck: [0, 3.3, 1.05], tail: [0, 3.3, -1.3], l0: [-.42, 2.5, .85], l1: [.42, 2.5, .85], l2: [-.42, 2.5, -.85], l3: [.42, 2.5, -.85] };
  const g = k.build(pv); shiftParts(g, pv);
  g.userData.bones.neck.rotation.x = .2;
  g.userData.anim = (t, run = .4) => { const b = g.userData.bones; walk(b, ['l0', 'l1', 'l2', 'l3'], t, .4 * run, 5); b.neck.rotation.x = .2 + Math.sin(t * 1.3) * .08; b.tail.rotation.z = Math.sin(t * 4) * .4; };
  return g;
}

export function elephant() {
  const k = kit(), G = 0xaebcdc, D = 0x95a5c8, Pk = 0xffb4c4, T = 0xfffbe8;
  k.addGeo('body', sculpt([E(G, 0, 2.45, 0, 1.38, 1.28, 1.8), E(G, 0, 2.7, .9, 1.15, 1.1, .9)], { k: .5, res: 46 }));
  k.add('tail', 'cyl', D, [0, -.4, 0], [.06, .8, .06]); k.add('tail', 'sphere', 0x6a7490, [0, -.85, 0], [.1, .16, .1]);
  k.addGeo('head', sculpt([
    E(G, 0, .05, 0, .95, .92, .85), E(G, 0, .5, -.15, .8, .6, .7),
    Cp(G, [0, -.25, .62], [0, -.95, .95], .36, .27), Cp(G, [0, -.95, .95], [0, -1.6, 1.12], .27, .2), Cp(G, [0, -1.6, 1.12], [0, -1.85, 1.45], .2, .17),
    Cp(T, [.42, -.55, .72], [.52, -.95, 1.2], .1, .04, { k: .05 }), Cp(T, [-.42, -.55, .72], [-.52, -.95, 1.2], .1, .04, { k: .05 }),
  ], { k: .35, res: 52 }));
  for (const s of [-1, 1]) k.eye('head', [s * .45, .25, .72], .15, null, [s * .3, 0, .95]);
  for (const [e, s] of [['earL', -1], ['earR', 1]]) k.addGeo(e, sculpt([E(G, s * .6, 0, 0, .75, .95, .13), P(E(Pk, s * .6, -.05, .12, .55, .72, .1))], { k: .1, res: 34 }));
  const leg = sculpt([Cp(G, [0, .2, 0], [0, -1.35, 0], .44, .42), E(G, 0, -1.42, .05, .46, .14, .46), P(E(T, 0, -1.45, .45, .38, .13, .08))], { k: .15, res: 34 });
  for (const i of [0, 1, 2, 3]) k.addGeo('l' + i, leg);
  const pv = { head: [0, 2.95, 1.95], earL: [-.85, 3.1, 1.75], earR: [.85, 3.1, 1.75], tail: [0, 2.6, -1.85], l0: [-.75, 1.5, 1.05], l1: [.75, 1.5, 1.05], l2: [-.75, 1.5, -1.05], l3: [.75, 1.5, -1.05] };
  const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t, run = .4) => { const b = g.userData.bones; walk(b, ['l0', 'l1', 'l2', 'l3'], t, .35 * run, 5); b.head.rotation.x = Math.sin(t * 1.7) * .06; b.earL.rotation.y = -.2 + Math.sin(t * 2.3) * .3; b.earR.rotation.y = .2 - Math.sin(t * 2.3) * .3; b.tail.rotation.z = Math.sin(t * 3) * .4; };
  return g;
}

export function penguin() {
  const k = kit(), B = 0x1c2230, W = 0xffffff, O = 0xffa020;
  k.addGeo('body', sculpt([
    E(B, 0, .62, 0, .46, .62, .42), E(B, 0, 1.22, .03, .34, .33, .33),
    P(E(W, 0, .58, .22, .37, .5, .3)), P(E(W, .12, 1.22, .26, .13, .14, .1)), P(E(W, -.12, 1.22, .26, .13, .14, .1)),
    Cp(O, [0, 1.17, .3], [0, 1.12, .56], .08, .02, { k: .03 }), E(O, .16, .04, .16, .14, .05, .2, null, { k: .05 }), E(O, -.16, .04, .16, .14, .05, .2, null, { k: .05 }),
  ], { k: .25, res: 44 }));
  for (const s of [-1, 1]) { k.eye('body', [s * .12, 1.27, .31], .07, null, [s * .2, 0, 1]); k.add('body', 'sphere', 0xff8ab0, [s * .2, 1.12, .28], [.07, .04, .03]); }
  const wing = s => sculpt([E(B, 0, -.25, 0, .08, .34, .2, [0, 0, s * .2])], { res: 20 });
  k.addGeo('wL', wing(1)); k.addGeo('wR', wing(-1));
  const pv = { wL: [-.46, .85, 0], wR: [.46, .85, 0] }; const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t, waddle = 1) => { const b = g.userData.bones; b.body.rotation.z = Math.sin(t * 7) * .12 * waddle; b.wL.rotation.z = -.2 - Math.abs(Math.sin(t * 7)) * .5 * waddle; b.wR.rotation.z = .2 + Math.abs(Math.sin(t * 7)) * .5 * waddle; };
  return g;
}

export function seal() {
  const k = kit(), G = 0xa8b4c4, D = 0x8494a8, L = 0xdce4ee;
  k.addGeo('body', sculpt([
    Cp(G, [0, .3, -.9], [0, .5, .35], .22, .5), E(G, 0, .9, .85, .38, .36, .38), E(L, 0, .8, 1.18, .22, .16, .16, null, { k: .1 }),
    P(E(L, 0, .25, .2, .42, .25, .9)),
    E(D, .5, .18, .5, .32, .06, .16, [0, .6, 0], { k: .1 }), E(D, -.5, .18, .5, .32, .06, .16, [0, -.6, 0], { k: .1 }),
  ], { k: .35, res: 44 }));
  k.add('body', 'sphere', 0x1a1a22, [0, .86, 1.32], [.07, .05, .04]);
  for (const s of [-1, 1]) { k.eye('body', [s * .17, .98, 1.12], .1, null, [s * .2, 0, 1]); k.add('body', 'box', 0x30303a, [s * .2, .78, 1.27], [.3, .01, .01], [0, 0, s * .15]); }
  k.addGeo('tail', sculpt([E(D, .18, 0, -.25, .25, .05, .3, [0, .4, 0]), E(D, -.18, 0, -.25, .25, .05, .3, [0, -.4, 0])], { k: .1, res: 24 }));
  const pv = { tail: [0, .3, -1] }; const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t) => { g.userData.bones.tail.rotation.x = Math.sin(t * 3) * .3; g.userData.bones.body.rotation.x = Math.sin(t * 1.5) * .05; };
  return g;
}

export function polarBear() {
  const k = kit(), F = 0xfaf6ea, D = 0xe8e0cc;
  k.addGeo('body', sculpt([E(F, 0, 1.35, 0, .92, .85, 1.4), E(F, 0, 1.45, 1, .75, .72, .6), E(F, 0, 1.3, -.95, .8, .75, .6)], { k: .45, res: 44 }));
  k.addGeo('head', sculpt([E(F, 0, 0, 0, .52, .47, .52), E(D, 0, -.1, .48, .28, .24, .32), E(F, .36, .4, 0, .15, .15, .09, null, { k: .08 }), E(F, -.36, .4, 0, .15, .15, .09, null, { k: .08 }), P(E(0xffb0c0, .36, .42, .06, .08, .08, .06)), P(E(0xffb0c0, -.36, .42, .06, .08, .08, .06))], { k: .25, res: 40 }));
  k.add('head', 'sphere', 0x15121a, [0, -.03, .78], [.11, .08, .07]);
  for (const s of [-1, 1]) k.eye('head', [s * .22, .14, .45], .09, null, [s * .2, 0, 1]);
  const leg = sculpt([Cp(F, [0, .1, 0], [0, -.85, .05], .33, .3), E(D, 0, -.9, .12, .3, .1, .34)], { k: .12, res: 26 });
  for (const i of [0, 1, 2, 3]) k.addGeo('l' + i, leg);
  const pv = { head: [0, 1.75, 1.6], l0: [-.5, .95, .85], l1: [.5, .95, .85], l2: [-.5, .95, -.85], l3: [.5, .95, -.85] };
  const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t, run = .5) => { const b = g.userData.bones; walk(b, ['l0', 'l1', 'l2', 'l3'], t, .5 * run, 6); b.head.rotation.y = Math.sin(t * .8) * .3; };
  return g;
}

export function gummyBear(color = 0xff3a4a) {
  const k = kit(), W = 0xffffff, mat = critterMat('gummy', color);
  k.addGeo('body', sculpt([
    E(W, 0, .75, 0, .55, .62, .45), E(W, 0, 1.48, 0, .44, .4, .4), E(W, 0, 1.4, .33, .2, .15, .15, null, { k: .12 }),
    E(W, .33, 1.82, -.02, .16, .16, .12, null, { k: .1 }), E(W, -.33, 1.82, -.02, .16, .16, .12, null, { k: .1 }),
    E(W, .22, .16, .05, .23, .2, .26, null, { k: .15 }), E(W, -.22, .16, .05, .23, .2, .26, null, { k: .15 }),
  ], { k: .22, res: 44 }), [0, 0, 0]);
  const face = kit(); for (const s of [-1, 1]) face.eye('face', [s * .17, 1.6, .35], .085, null, [0, 0, 1]); face.add('face', 'torus', 0x5a1020, [0, 1.36, .47], [.08, .05, .04], [0, 0, Math.PI]);
  const arm = sculpt([Cp(W, [0, 0, 0], [0, -.42, .05], .15, .13)], { res: 20 });
  k.addGeo('aL', arm); k.addGeo('aR', arm);
  const pv = { aL: [-.5, 1.05, .05], aR: [.5, 1.05, .05] };
  const g = k.build(pv, {}, { mat }); shiftParts(g, pv);
  g.userData.bones.body.add(face.build().children[0]);
  g.userData.anim = (t, waddle = 1) => { const b = g.userData.bones; b.body.rotation.z = Math.sin(t * 8) * .14 * waddle; b.aL.rotation.x = Math.sin(t * 8) * .7 * waddle; b.aR.rotation.x = -Math.sin(t * 8) * .7 * waddle; b.body.position.y = Math.abs(Math.sin(t * 8)) * .08 * waddle; };
  return g;
}

export function bird(body = 0xffffff, wing = null, belly = null) {
  const k = kit(); wing ??= body; belly ??= body;
  k.addGeo('body', sculpt([E(body, 0, 0, 0, .28, .26, .46), E(body, 0, .16, .42, .2, .2, .2), E(wing, 0, .05, -.5, .2, .04, .26, null, { k: .1 }), P(E(belly, 0, -.12, .12, .22, .17, .34)), Cp(0xffa020, [0, .12, .58], [0, .08, .8], .07, .02, { k: .02 })], { k: .18, res: 30 }));
  for (const s of [-1, 1]) k.eye('body', [s * .12, .22, .54], .06, null, [s * .3, 0, .9]);
  const w = s => sculpt([E(wing, s * .45, 0, 0, .5, .05, .24)], { res: 24 });
  k.addGeo('wL', w(-1)); k.addGeo('wR', w(1));
  const pv = { wL: [-.2, .1, 0], wR: [.2, .1, 0] }; const g = k.build(pv, {}, { shadow: false }); shiftParts(g, pv);
  g.userData.anim = (t, rate = 9) => { const b = g.userData.bones, a = Math.sin(t * rate) * .75; b.wL.rotation.z = a; b.wR.rotation.z = -a; };
  return g;
}

export function dragon(body = 0x4ac060, belly = 0xffe08a, wingCol = 0xff7a4a) {
  const k = kit(), H = 0xfff4d8, SP = 0xffb43a, spikes = [];
  for (let i = 0; i < 5; i++) spikes.push(Cp(SP, [0, .85 - i * .04, 1 - i * .5], [0, 1.25 - i * .04, .85 - i * .5], .14, .03, { k: .06 }));
  k.addGeo('body', sculpt([E(body, 0, 0, 0, 1.05, .95, 1.6), Cp(body, [0, .3, 1.2], [0, .85, 1.95], .6, .45), P(E(belly, 0, -.4, .4, .8, .6, 1.4)), ...spikes], { k: .4, res: 48 }));
  k.addGeo('head', sculpt([
    E(body, 0, 0, 0, .72, .62, .78), E(body, 0, -.18, .72, .52, .4, .58), P(E(belly, 0, -.38, .8, .44, .18, .5)),
    Cp(H, [.32, .45, -.2], [.42, 1.05, -.55], .13, .03, { k: .08 }), Cp(H, [-.32, .45, -.2], [-.42, 1.05, -.55], .13, .03, { k: .08 }),
    E(body, .55, .2, -.25, .2, .1, .14, [0, 0, -.6], { k: .1 }), E(body, -.55, .2, -.25, .2, .1, .14, [0, 0, .6], { k: .1 }),
  ], { k: .3, res: 44 }));
  for (const s of [-1, 1]) { k.eye('head', [s * .36, .25, .5], .19, body, [s * .3, 0, .95]); k.add('head', 'sphere', 0x2a5a2a, [s * .16, -.06, 1.24], [.06, .05, .04]); }
  for (const [key, s] of [['wL', -1], ['wR', 1]]) {
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.quadraticCurveTo(s * 1.2, 1.4, s * 3, 1); shape.lineTo(s * 2.6, .2); shape.quadraticCurveTo(s * 2.1, .5, s * 1.9, -.2); shape.quadraticCurveTo(s * 1.4, .25, s * 1.1, -.5); shape.quadraticCurveTo(s * .6, -.1, 0, -.6);
    const geo = new THREE.ShapeGeometry(shape, 8); geo.rotateX(-Math.PI / 2); k.add(key, geo, wingCol);
    k.addGeo(key, sculpt([Cp(body, [0, 0, 0], [s * 1.5, .05, .85], .12, .08), Cp(body, [s * 1.5, .05, .85], [s * 3, 0, 1], .08, .04)], { k: .05, res: 30 }));
  }
  k.addGeo('tail', sculpt([Cp(body, [0, 0, .3], [0, -.15, -1.2], .5, .3), Cp(body, [0, -.15, -1.2], [0, -.25, -2.3], .3, .12), E(SP, 0, -.25, -2.45, .3, .06, .3, [0, Math.PI / 4, 0], { k: .08 })], { k: .2, res: 40 }));
  const leg = sculpt([Cp(body, [0, 0, 0], [0, -.5, .1], .26, .2), E(belly, 0, -.55, .2, .2, .1, .22)], { k: .1, res: 24 });
  k.addGeo('l0', leg); k.addGeo('l1', leg);
  const pv = { head: [0, 1.1, 2.3], wL: [-.6, .65, .1], wR: [.6, .65, .1], tail: [0, -.1, -1.4], l0: [-.6, -.7, .4], l1: [.6, -.7, .4] };
  const g = k.build(pv); shiftParts(g, pv);
  const wm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .6 }); g.userData.bones.wL.material = wm; g.userData.bones.wR.material = wm;
  g.userData.anim = (t, rate = 3) => { const b = g.userData.bones, a = Math.sin(t * rate) * .55; b.wL.rotation.z = a; b.wR.rotation.z = -a; b.tail.rotation.y = Math.sin(t * 1.5) * .3; b.head.rotation.x = Math.sin(t * 1.1) * .1; };
  return g;
}

export function dolphin() {
  const k = kit(), B = 0x6aa8e0, W = 0xeaf4fc;
  k.addGeo('body', sculpt([
    E(B, 0, 0, 0, .72, .68, 1.9), E(B, 0, .05, 1.35, .6, .56, .7), Cp(B, [0, -.1, 1.85], [0, -.16, 2.5], .26, .17, { k: .2 }),
    E(B, 0, .85, -.2, .1, .5, .32, [-.55, 0, 0], { k: .2 }), E(B, .7, -.4, .8, .48, .07, .24, [0, .5, -.4], { k: .12 }), E(B, -.7, -.4, .8, .48, .07, .24, [0, -.5, .4], { k: .12 }),
    P(E(W, 0, -.4, .4, .55, .4, 1.8)),
  ], { k: .4, res: 50 }));
  k.add('body', 'torus', 0x2a4a6a, [0, -.25, 2.25], [.2, .1, .1]);
  for (const s of [-1, 1]) k.eye('body', [s * .44, .2, 1.6], .14, null, [s * .4, 0, .9]);
  k.addGeo('tail', sculpt([Cp(B, [0, 0, 0], [0, 0, -.95], .4, .14), E(B, .5, 0, -1.1, .55, .07, .26, [0, -.5, 0], { k: .12 }), E(B, -.5, 0, -1.1, .55, .07, .26, [0, .5, 0], { k: .12 })], { k: .25, res: 34 }));
  const pv = { tail: [0, 0, -1.6] }; const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t) => { g.userData.bones.tail.rotation.x = Math.sin(t * 7) * .35; };
  return g;
}

export function krakenHead() {
  const k = kit(), Pp = 0xa04ac8, L = 0xd890f0, spots = [];
  for (let i = 0; i < 10; i++) spots.push(P(E(L, Math.cos(i * 2.2) * .75, .6 + Math.sin(i * 1.4) * .5, Math.sin(i * 2.2) * .55 - .25, .13, .13, .13)));
  k.addGeo('body', sculpt([E(Pp, 0, 0, 0, 1, .85, .95), E(Pp, 0, .85, -.25, .78, .95, .78), ...spots], { k: .5, res: 44 }));
  for (const s of [-1, 1]) k.eye('body', [s * .4, .22, .76], .3, null, [0, 0, 1]);
  k.add('body', 'torus', 0x5a1050, [0, -.22, .88], [.25, .16, .1], [0, 0, Math.PI]);
  return k.build();
}

export function zebra() {
  const k = kit(), W = 0xfafafa, B = 0x1a1a22, stripes = [];
  for (let i = 0; i < 8; i++) stripes.push(P(E(B, 0, 2, -1.1 + i * .3, 1, 1, .085, [(i % 2 ? .25 : -.25), 0, 0])));
  k.addGeo('body', sculpt([E(W, 0, 2, 0, .72, .68, 1.32), E(W, 0, 2.15, .85, .62, .62, .55), ...stripes], { k: .35, res: 46 }));
  k.add('tail', 'cyl', W, [0, -.4, 0], [.05, .8, .05]); k.add('tail', 'sphere', B, [0, -.85, 0], [.1, .18, .1]);
  const hs = []; for (let i = 0; i < 4; i++) hs.push(P(E(B, 0, .2 + i * .17, .1 + i * .1, .6, .045, .6, [.5, 0, 0])));
  k.addGeo('head', sculpt([
    Cp(W, [0, 0, 0], [0, .6, .45], .38, .3), Cp(W, [0, .62, .5], [0, .3, 1.15], .3, .22), E(0x3a3a44, 0, .25, 1.18, .24, .2, .2, null, { k: .1 }),
    E(B, 0, .55, .05, .07, .4, .3, [.6, 0, 0], { k: .05 }), E(W, .17, .95, .45, .08, .2, .06, [-.2, 0, -.3], { k: .05 }), E(W, -.17, .95, .45, .08, .2, .06, [-.2, 0, .3], { k: .05 }), ...hs,
  ], { k: .2, res: 44 }));
  for (const s of [-1, 1]) k.eye('head', [s * .25, .65, .75], .1, null, [s * .5, 0, .8]);
  const leg = sculpt([Cp(W, [0, .1, 0], [0, -1.45, 0], .17, .12), P(E(B, 0, -.5, 0, .3, .05, .3)), P(E(B, 0, -1, 0, .3, .05, .3)), E(B, 0, -1.45, .02, .15, .1, .17)], { k: .08, res: 34 });
  for (const i of [0, 1, 2, 3]) k.addGeo('l' + i, leg);
  const pv = { head: [0, 2.35, 1.25], tail: [0, 2.2, -1.3], l0: [-.4, 1.5, .8], l1: [.4, 1.5, .8], l2: [-.4, 1.5, -.8], l3: [.4, 1.5, -.8] };
  const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t, run = .4) => { const b = g.userData.bones; walk(b, ['l0', 'l1', 'l2', 'l3'], t, .45 * run, 6); b.head.rotation.x = Math.sin(t * 1.4) * .12; b.tail.rotation.z = Math.sin(t * 5) * .5; };
  return g;
}

export function husky(back = 0x6a7080) {
  const k = kit(), W = 0xffffff;
  k.addGeo('body', sculpt([
    E(back, 0, .62, 0, .3, .3, .58), E(back, 0, .95, .55, .24, .22, .24), E(W, 0, .87, .78, .15, .12, .18, null, { k: .1 }),
    P(E(W, 0, .5, .05, .26, .22, .55)), P(E(W, 0, .9, .7, .2, .12, .2)),
    Cp(back, [.12, 1.1, .5], [.13, 1.3, .48], .08, .02, { k: .04 }), Cp(back, [-.12, 1.1, .5], [-.13, 1.3, .48], .08, .02, { k: .04 }),
    Cp(back, [0, .75, -.55], [0, 1.05, -.62], .1, .07, { k: .08 }),
  ], { k: .18, res: 34 }));
  k.add('body', 'sphere', 0x15121a, [0, .9, .96], .05);
  for (const s of [-1, 1]) k.eye('body', [s * .1, 1, .74], .05, null, [0, 0, 1]);
  const leg = sculpt([Cp(W, [0, 0, 0], [0, -.4, 0], .08, .07)], { res: 16 });
  for (const i of [0, 1, 2, 3]) k.addGeo('l' + i, leg);
  const pv = { l0: [-.15, .42, .35], l1: [.15, .42, .35], l2: [-.15, .42, -.35], l3: [.15, .42, -.35] };
  const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t, run = 1) => { walk(g.userData.bones, ['l0', 'l1', 'l2', 'l3'], t, .8 * run, 16); g.userData.bones.body.position.y = Math.abs(Math.sin(t * 16)) * .05; };
  return g;
}
