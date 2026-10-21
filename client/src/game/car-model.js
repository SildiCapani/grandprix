import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildAvatarHead } from './avatars.js';
import { applySkin } from './skins.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { contactShadow } from './surfaces.js';
let shadowGeo, shadowMat;

// Karts in a chunky, rounded toy style: fat tyres, a little bucket seat, a driver holding the wheel,
// chrome exhaust pipes that spit flames on a boost and a body that leans into corners.
// +Z is the nose, the tyres rest on y = 0. Everything is generated – no asset files.
const tmpColor = new THREE.Color();
const mat = (color, roughness = .5, metalness = .1, o = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...o });

function addMesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
const rbox = (parent, m, sx, sy, sz, x, y, z, r = .04) => addMesh(parent, new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01)), m, x, y, z);
const ball = (parent, m, r, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = addMesh(parent, new THREE.SphereGeometry(r, 20, 14), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
const capsule = (parent, m, r, len, x, y, z) => addMesh(parent, new THREE.CapsuleGeometry(r, len, 6, 14), m, x, y, z);
function rod(parent, m, start, end, radius = .014) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), m);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return mesh;
}

function makeNumberTexture(number) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f4de'; ctx.beginPath(); ctx.arc(128, 128, 118, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 14; ctx.strokeStyle = '#182a36'; ctx.stroke();
  ctx.fillStyle = '#182a36'; ctx.font = '900 italic 140px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(number).slice(0, 2), 124, 138);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

// Proportions per kart class (see karts.js). r = tyre radius front / rear, w = tyre width, x = track half-width,
// zf / zr = axle positions, lift = ride height, len / wid = body size.
const LAYOUT = {
  allround: { rf: .17, rr: .2, wf: .15, wr: .2, x: .38, zf: .5, zr: -.44, lift: 0, len: 1, wid: 1 },
  bolide:   { rf: .16, rr: .2, wf: .14, wr: .22, x: .4, zf: .62, zr: -.5, lift: -.02, len: 1.22, wid: .96 },
  flitzer:  { rf: .14, rr: .16, wf: .13, wr: .16, x: .32, zf: .4, zr: -.36, lift: .01, len: .84, wid: .86 },
  brummer:  { rf: .26, rr: .29, wf: .22, wr: .26, x: .48, zf: .52, zr: -.48, lift: .12, len: 1.08, wid: 1.2 },
  drifter:  { rf: .17, rr: .2, wf: .16, wr: .26, x: .42, zf: .52, zr: -.46, lift: -.02, len: 1.04, wid: 1.12 },
  buggy:    { rf: .24, rr: .27, wf: .2, wr: .24, x: .46, zf: .52, zr: -.46, lift: .16, len: .98, wid: 1.02 },
};

// A fat tyre with rounded shoulders (lathe profile) around a coloured rim and a chrome cap.
function makeWheel(r, w, paint, rubber, chrome, cream, knobbly, side) {
  const g = new THREE.Group();
  const prof = [], s = 10, rim = r * .62;
  prof.push(new THREE.Vector2(rim, -w / 2));
  for (let i = 0; i <= s; i++) { const a = -Math.PI / 2 + Math.PI * i / s; prof.push(new THREE.Vector2(r - w * .28 + Math.cos(a) * w * .28, Math.sin(a) * w / 2)); }
  prof.push(new THREE.Vector2(rim, w / 2));
  const tyreGeo = new THREE.LatheGeometry(prof, 26); tyreGeo.rotateZ(Math.PI / 2);
  addMesh(g, tyreGeo, rubber);
  const rimGeo = new THREE.CylinderGeometry(rim, rim, w * .92, 22); rimGeo.rotateZ(Math.PI / 2);
  addMesh(g, rimGeo, paint);
  const capGeo = new THREE.SphereGeometry(rim * .55, 14, 10); const cap = addMesh(g, capGeo, chrome, side * w * .42, 0, 0); cap.scale.set(.45, 1, 1);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const b = addMesh(g, new THREE.BoxGeometry(.012, rim * 1.5, rim * .26), chrome, side * w * .47, 0, 0); b.rotation.x = a; }
  if (knobbly) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const n = addMesh(g, new THREE.BoxGeometry(w * .9, r * .16, r * .2), rubber, 0, Math.cos(a) * r * .98, Math.sin(a) * r * .98); n.rotation.x = -a; }
  else { const band = new THREE.TorusGeometry(r * .82, .006, 4, 30); band.rotateY(Math.PI / 2); addMesh(g, band, cream, side * w * .5, 0, 0); }
  g.userData.r = r;
  return g;
}

export function createCar(color = '#e34335', number = '07', kart = 'allround', finish = 'standard', skin = 'none', avatar = 'pilot') {
  const L = LAYOUT[kart] || LAYOUT.allround;
  const car = new THREE.Group(); car.name = `Mini Formula ${number}`; car.rotation.order = 'YXZ';
  const body = new THREE.Group(); body.position.y = L.lift; car.add(body);
  const lean = new THREE.Group(); body.add(lean);

  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: .32, metalness: .25, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.2 });
  const darkPaint = new THREE.MeshPhysicalMaterial({ color: tmpColor.set(color).multiplyScalar(.5).getHex(), roughness: .4, metalness: .25, clearcoat: .8, clearcoatRoughness: .1 });
  const chassis = mat('#23272e', .55, .4), rubber = mat('#16181b', .92, 0), chrome = mat('#dfe5ea', .12, 1);
  const cream = new THREE.MeshPhysicalMaterial({ color: '#f6f1e2', roughness: .35, clearcoat: 1, clearcoatRoughness: .08 });
  const seatMat = mat('#2a2f3a', .8, .05), suit = new THREE.MeshPhysicalMaterial({ color: tmpColor.set(color).lerp(new THREE.Color('#ffffff'), .25).getHex(), roughness: .6, sheen: 1, sheenRoughness: .5 });
  const glove = mat('#f4f4f0', .6), lampMat = mat('#fff6d8', .2, 0, { emissive: 0xfff0c0, emissiveIntensity: .9 }), tail = mat('#ff4a3a', .3, 0, { emissive: 0xff2010, emissiveIntensity: 1.4 });
  if (finish === 'gold') { paint.color.set('#d9a93c'); paint.metalness = .95; paint.roughness = .2; darkPaint.color.set('#8a6420'); darkPaint.metalness = .9; }
  else if (finish === 'chrome') { paint.color.set('#e6edf3'); paint.metalness = 1; paint.roughness = .05; darkPaint.color.set('#9aa4ae'); darkPaint.metalness = 1; darkPaint.roughness = .1; }
  else if (finish === 'neon') { paint.emissive.set(color); paint.emissiveIntensity = .65; darkPaint.emissive.set(color); darkPaint.emissiveIntensity = .25; }
  if (skin && skin !== 'none') applySkin({ paint, darkPaint }, skin, color);
  paint.userData.baseEmissive = paint.emissive.getHex(); paint.userData.baseEI = paint.emissiveIntensity;
  const S = L.len, Wd = L.wid;

  // --- chassis tray and the rounded body shell ---
  rbox(lean, chassis, .56 * Wd, .06, 1.25 * S, 0, .12, -.02 * S, .025);
  rbox(lean, paint, .5 * Wd, .2, .62 * S, 0, .22, .3 * S, .09);          // nose
  ball(lean, paint, .19, 0, .23, .6 * S, 1.25 * Wd, .72, 1.1);             // rounded nose tip
  rbox(lean, darkPaint, .62 * Wd, .07, .12, 0, .2, .79 * S, .035);         // front bumper
  rbox(lean, cream, .3 * Wd, .045, .02, 0, .3, .7 * S, .01);               // nose stripe
  for (const sd of [-1, 1]) {
    capsule(lean, paint, .085, .48 * S, sd * .27 * Wd, .2, -.08 * S).rotation.x = Math.PI / 2;   // side pods
    rbox(lean, cream, .02, .05, .38 * S, sd * .36 * Wd, .21, -.08 * S, .01);
    ball(lean, lampMat, .042, sd * .17 * Wd, .28, .66 * S, 1, .8, .5);                             // headlights
    rbox(lean, chassis, .03, .14, .14, sd * .35 * Wd, .14, .52 * S, .02);                          // front axle mounts
  }
  // --- seat, engine and exhaust stacks at the back ---
  rbox(lean, seatMat, .34, .1, .3, 0, .22, -.2 * S, .05);
  rbox(lean, seatMat, .34, .32, .08, 0, .37, -.36 * S, .05).rotation.x = -.22;
  rbox(lean, chassis, .42 * Wd, .2, .26, 0, .25, -.56 * S, .05);
  rbox(lean, darkPaint, .44 * Wd, .05, .27, 0, .37, -.56 * S, .03);
  const pipes = [];
  for (const sd of [-1, 1]) { const p = rod(lean, chrome, [sd * .12, .26, -.66 * S], [sd * .16, .38, -.82 * S], .032); pipes.push(p); ball(lean, chrome, .036, sd * .16, .38, -.82 * S); }
  for (const sd of [-1, 1]) ball(lean, tail, .03, sd * .2 * Wd, .3, -.7 * S, 1, .7, .4);
  // little rear spoiler on stalks
  if (kart !== 'flitzer' && kart !== 'buggy') { for (const sd of [-1, 1]) rod(lean, chassis, [sd * .15, .38, -.6 * S], [sd * .17, .52, -.7 * S], .014); rbox(lean, paint, .62 * Wd, .035, .14, 0, .53, -.72 * S, .016); for (const sd of [-1, 1]) rbox(lean, darkPaint, .02, .1, .16, sd * .31 * Wd, .53, -.72 * S, .008); }

  // --- driver: suit, arms on the steering wheel, head (avatar or helmet) ---
  const driver = new THREE.Group(); lean.add(driver); driver.position.set(0, 0, -.17 * S);
  capsule(driver, suit, .12, .14, 0, .44, 0).scale.set(1.05, 1, .85);
  rbox(driver, darkPaint, .26, .05, .2, 0, .32, .02, .02);                  // belt
  const wheelGroup = new THREE.Group(); wheelGroup.position.set(0, .46, .26); wheelGroup.rotation.x = -.85; lean.add(wheelGroup);
  rod(lean, chassis, [0, .3, .45 * S], [0, .44, .3], .016);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(.085, .016, 8, 22), chassis); sw.castShadow = true; wheelGroup.add(sw);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .02, 10), paint); hub.rotation.x = Math.PI / 2; wheelGroup.add(hub);
  for (const sd of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sd * .14, .5, -.17 * S); lean.add(arm);
    const a = capsule(arm, suit, .042, .16, 0, 0, 0); a.position.set(-sd * .02, -.03, .11); a.rotation.x = 1.15; a.rotation.z = sd * .25;
    ball(arm, glove, .045, -sd * .06, -.08, .22);
  }
  let head;
  if (avatar && avatar !== 'pilot') { head = buildAvatarHead(avatar); head.position.set(0, .7, -.17 * S); head.scale.setScalar(1.2); head.name = 'avatar'; lean.add(head); }
  else {
    head = new THREE.Group(); head.position.set(0, .7, -.17 * S); lean.add(head);
    const helmet = new THREE.MeshPhysicalMaterial({ color: '#f6cf42', roughness: .22, clearcoat: 1, clearcoatRoughness: .04 });
    ball(head, helmet, .155, 0, 0, 0, 1, .96, 1.02);
    const visor = new THREE.MeshPhysicalMaterial({ color: '#0c1820', roughness: .03, metalness: .7, clearcoat: 1, envMapIntensity: 1.6 });
    const v = addMesh(head, new THREE.SphereGeometry(.158, 20, 10, -1, 2, 1.05, .7), visor); v.rotation.y = Math.PI / 2;
    rbox(head, cream, .045, .012, .22, 0, .15, -.01, .006).rotation.x = -.1;
    rbox(head, paint, .045, .013, .2, 0, .152, -.02, .006).position.x = .0;
  }
  head.userData.base = head.position.y;

  // --- wheels ---
  const wheels = [], frontWheels = [], knob = kart === 'buggy' || kart === 'brummer';
  for (const z of [L.zr * S, L.zf * S]) for (const side of [-1, 1]) {
    const front = z > 0, r = front ? L.rf : L.rr, w = front ? L.wf : L.wr;
    const pivot = new THREE.Group(); pivot.position.set(side * (L.x * Wd + (front ? 0 : .02)), r, z); car.add(pivot);
    const wheel = makeWheel(r, w, paint, rubber, chrome, cream, knob, side); pivot.add(wheel);
    rod(car, chassis, [side * .2 * Wd, Math.max(.14, r * .8) + L.lift * .6, z], [side * (L.x * Wd - w * .3), r, z], .018);
    wheels.push(wheel); if (front) frontWheels.push(pivot);
  }
  kartExtras(kart, lean, car, { paint, darkPaint, chassis, chrome, cream, rubber, lampMat }, L, S, Wd);

  const numberTexture = makeNumberTexture(number);
  if (numberTexture) {
    const decal = new THREE.MeshStandardMaterial({ map: numberTexture, transparent: true, roughness: .5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const nose = addMesh(lean, new THREE.CircleGeometry(.075, 24), decal, 0, .335, .45 * S); nose.rotation.x = -Math.PI / 2 + .25;
    for (const sd of [-1, 1]) { const sn = addMesh(lean, new THREE.CircleGeometry(.06, 20), decal, sd * .358 * Wd, .2, -.08 * S); sn.rotation.y = sd * Math.PI / 2; }
  }

  // --- boost flames out of both pipes ---
  const exhaust = new THREE.Group(); exhaust.visible = false;
  const outer = new THREE.MeshBasicMaterial({ color: '#36c8ff', transparent: true, opacity: .75, depthWrite: false }), inner = new THREE.MeshBasicMaterial({ color: '#fff6b3', transparent: true, opacity: .95, depthWrite: false });
  for (const sd of [-1, 1]) {
    const f = addMesh(exhaust, new THREE.ConeGeometry(.055, .36, 8), outer, sd * .16, .4, -.98 * S); f.rotation.x = -Math.PI / 2 - .55; f.castShadow = false;
    const c = addMesh(exhaust, new THREE.ConeGeometry(.03, .22, 8), inner, sd * .16, .39, -.92 * S); c.rotation.x = -Math.PI / 2 - .55; c.castShadow = false;
  }
  body.add(exhaust);

  if (typeof document !== 'undefined') {
    shadowGeo ||= new THREE.PlaneGeometry(1.1, 1.95).rotateX(-Math.PI / 2);
    shadowMat ||= new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: contactShadow(), transparent: true, opacity: .62, depthWrite: false });
    const blob = new THREE.Mesh(shadowGeo, shadowMat);
    blob.position.y = .006; blob.renderOrder = -1; blob.userData.shared = true; blob.scale.set(Wd * 1.1, 1, S);
    car.add(blob);
  }
  // Fuse static parts into one mesh per material (few draw calls); moving parts stay separate groups.
  bakeStatic(lean, true);
  for (const w of wheels) bakeStatic(w, true);
  bakeStatic(car, false);
  car.userData.wheels = wheels;
  car.userData.frontWheels = frontWheels;
  car.userData.exhaust = exhaust;
  car.userData.body = body; car.userData.lean = lean; car.userData.head = head; car.userData.steeringWheel = wheelGroup;
  car.userData.materials = { paint, darkPaint, carbon: chassis, rubber, rim: chrome, cream };
  car.userData.kart = kart; car.userData.skin = skin || 'none'; car.userData.avatar = avatar || 'pilot';
  car.userData.animationTime = Math.random() * 10; car.userData.lift = L.lift;
  return car;
}

const _rel = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function bakeStatic(root, deep) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map(), parts = [];
  const visit = node => { for (const child of node.children) { if (!child.isMesh || child.userData.shared) continue; parts.push(child); if (deep) visit(child); } };
  visit(root);
  for (const mesh of parts) {
    _rel.multiplyMatrices(_inv, mesh.matrixWorld);
    let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(_rel);
    if (_rel.determinant() < 0) for (const attr of Object.values(geo.attributes)) {
      const a = attr.array, n = attr.itemSize;
      for (let i = 0; i < attr.count; i += 3) for (let k = 0; k < n; k++) { const t = a[(i + 1) * n + k]; a[(i + 1) * n + k] = a[(i + 2) * n + k]; a[(i + 2) * n + k] = t; }
    }
    geo.clearGroups();
    const key = mesh.material.uuid + (mesh.castShadow ? '+' : '-');
    if (!groups.has(key)) groups.set(key, { material: mesh.material, cast: mesh.castShadow, list: [] });
    groups.get(key).list.push(geo);
  }
  for (const mesh of parts) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); }
  for (const { material, cast, list } of groups.values()) {
    const merged = new THREE.Mesh(mergeGeometries(list), material);
    merged.castShadow = cast; merged.receiveShadow = true; root.add(merged);
    list.forEach(g => g.dispose());
  }
}

// Signature parts so every class reads at a glance.
function kartExtras(kart, body, car, m, L, S, Wd) {
  if (kart === 'bolide') {
    // long speedster: pointed nose fin, tall twin wing, air scoops
    rbox(body, m.paint, .05, .12, .5 * S, 0, .35, .25 * S, .02);
    for (const sd of [-1, 1]) { rod(body, m.chassis, [sd * .14, .4, -.62 * S], [sd * .16, .72, -.75 * S], .016); rbox(body, m.darkPaint, .1, .08, .2, sd * .28 * Wd, .3, .02, .03); }
    rbox(body, m.paint, .72 * Wd, .04, .17, 0, .73, -.76 * S, .018); rbox(body, m.cream, .72 * Wd, .015, .04, 0, .755, -.82 * S, .006);
  } else if (kart === 'flitzer') {
    // tiny bubble kart: round hood, roll hoop with a ball on top
    ball(body, m.paint, .2, 0, .3, .28 * S, 1.1, .6, 1.3);
    rod(body, m.chassis, [-.15, .3, -.36 * S], [-.12, .66, -.32 * S], .022); rod(body, m.chassis, [.15, .3, -.36 * S], [.12, .66, -.32 * S], .022); rod(body, m.chassis, [-.12, .66, -.32 * S], [.12, .66, -.32 * S], .022);
    ball(body, m.cream, .06, 0, .7, -.32 * S);
  } else if (kart === 'brummer') {
    // monster kart: big bull bar, armour, raised body and roof stacks
    rbox(body, m.chassis, .74 * Wd, .2, .08, 0, .25, .84 * S, .03); for (const y of [.2, .32]) rod(body, m.chrome, [-.36 * Wd, y, .88 * S], [.36 * Wd, y, .88 * S], .022);
    for (const sd of [-1, 1]) { rbox(body, m.darkPaint, .06, .18, .62 * S, sd * .37 * Wd, .25, -.05 * S, .025); rod(body, m.chrome, [sd * .2, .4, -.55 * S], [sd * .2, .78, -.62 * S], .04); }
    rbox(body, m.darkPaint, .5 * Wd, .06, .36, 0, .44, -.5 * S, .03);
  } else if (kart === 'buggy') {
    // rally buggy: tube roll cage, roof light bar, mud flaps, snorkel
    const cage = [[-.22, .3, -.38 * S], [-.18, .82, -.26 * S], [.18, .82, -.26 * S], [.22, .3, -.38 * S]];
    for (let i = 0; i < 3; i++) rod(body, m.chassis, cage[i], cage[i + 1], .024);
    rod(body, m.chassis, [-.18, .82, -.26 * S], [-.14, .66, .18 * S], .022); rod(body, m.chassis, [.18, .82, -.26 * S], [.14, .66, .18 * S], .022); rod(body, m.chassis, [-.14, .66, .18 * S], [.14, .66, .18 * S], .022);
    rod(body, m.chassis, [-.14, .66, .18 * S], [-.22, .26, .5 * S], .022); rod(body, m.chassis, [.14, .66, .18 * S], [.22, .26, .5 * S], .022);
    rbox(body, m.chassis, .44, .05, .07, 0, .86, -.24 * S, .02); for (let i = -1; i <= 1; i++) ball(body, m.lampMat, .035, i * .13, .87, -.2 * S, 1, 1, .5);
    for (const sd of [-1, 1]) rbox(body, m.rubber, .16, .16, .015, sd * .44 * Wd, .14, -.66 * S, .005);
  } else if (kart === 'drifter') {
    // drift car: swan-neck wing, wide fenders and neon underglow
    for (const sd of [-1, 1]) { rod(body, m.chassis, [sd * .1, .4, -.64 * S], [sd * .12, .74, -.72 * S], .015); rbox(body, m.paint, .1, .12, .4, sd * .4 * Wd, .25, -.44 * S, .04); }
    rbox(body, m.paint, .82 * Wd, .035, .2, 0, .76, -.74 * S, .016); rbox(body, m.cream, .82 * Wd, .012, .04, 0, .78, -.82 * S, .006);
    const glow = new THREE.MeshBasicMaterial({ color: m.paint.color.clone().offsetHSL(0, .1, .2), transparent: true, opacity: .55, depthWrite: false, toneMapped: false });
    const plate = addMesh(car, new THREE.PlaneGeometry(.75, 1.4), glow, 0, .03, 0); plate.rotation.x = -Math.PI / 2; plate.castShadow = false; plate.receiveShadow = false;
  } else {
    // allrounder: classic go-kart side bars
    for (const sd of [-1, 1]) rod(body, m.chrome, [sd * .38 * Wd, .16, .32 * S], [sd * .38 * Wd, .16, -.3 * S], .018);
  }
}

// Wheels spin and steer, the body leans into corners and bounces on bumps, the head bobs, flames on a boost.
export function animateCar(car, { speed = 0, steer = 0, boosting = false, drifting = false } = {}, dt = 1 / 60) {
  const d = car.userData;
  for (const w of d.wheels || []) w.rotation.x += speed * dt / (w.userData.r || .19);
  for (const p of d.frontWheels || []) p.rotation.y = -steer * .38;
  d.animationTime = (d.animationTime || 0) + dt; const t = d.animationTime, v = Math.min(1, Math.abs(speed) / 25);
  if (d.lean) {
    const targetRoll = steer * .1 * v * (drifting ? 1.6 : 1), k = 1 - Math.exp(-dt * 8);
    d.roll = (d.roll || 0) + (targetRoll - (d.roll || 0)) * k;
    d.lean.rotation.z = d.roll; d.lean.rotation.y = drifting ? -steer * .12 : 0;
    d.lean.position.y = Math.sin(t * 23) * .006 * v + (boosting ? Math.sin(t * 41) * .004 : 0);
  }
  if (d.steeringWheel) d.steeringWheel.rotation.z = steer * .9;
  if (d.head) d.head.rotation.z = -(d.roll || 0) * 1.4, d.head.position.y = (d.head.userData.base || .7) + Math.sin(t * 7) * .004 * (1 + v);
  if (d.exhaust) {
    d.exhaust.visible = Boolean(boosting && Math.abs(speed) > .5);
    d.exhaust.scale.set(1, 1, 1 + Math.sin(t * 63) * .18 + (drifting ? .2 : 0));
  }
}
