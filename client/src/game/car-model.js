import * as THREE from 'three';
import { applySkin } from './skins.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carbon as carbonWeave, contactShadow } from './surfaces.js';
let shadowGeo, shadowMat;

// The cars use +Z as their nose direction, with their tyres resting at y = 0.
// All the details are made from geometry so the game works without asset URLs.
const tmpColor = new THREE.Color();

function material(color, roughness = 0.48, metalness = 0.12) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addMesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(parent, mat, sx, sy, sz, x, y, z) {
  return addMesh(parent, new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z);
}

// A flat polygon with independent side normals gives the body its clean toy-like facets.
function prism(parent, outline, height, mat, y = 0) {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    curveSegments: 1,
  });
  geom.rotateX(-Math.PI / 2);
  return addMesh(parent, geom, mat, 0, y, 0);
}

function rod(parent, mat, start, end, radius = 0.012) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 7), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return mesh;
}

function makeNumberTexture(number) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#f8f4de';
  ctx.beginPath();
  ctx.roundRect(12, 22, 232, 212, 30);
  ctx.fill();
  ctx.fillStyle = '#182a36';
  ctx.font = '900 italic 154px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number).slice(0, 2), 122, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Body proportions and wheel layout per kart class (see karts.js).
const LAYOUT = {
  allround: { body: [1, 1, 1], zf: .485, zr: -.44, x: .393, wf: 1, wr: 1 },
  bolide:   { body: [.94, .82, 1.2], zf: .6, zr: -.54, x: .4, wf: .92, wr: 1.05 },
  flitzer:  { body: [.88, 1.06, .8], zf: .4, zr: -.36, x: .36, wf: .85, wr: .9 },
  brummer:  { body: [1.24, 1.18, 1.06], zf: .52, zr: -.47, x: .5, wf: 1.25, wr: 1.3 },
  drifter:  { body: [1.08, .9, 1.02], zf: .5, zr: -.45, x: .43, wf: 1, wr: 1.12, wideRear: 1.45 },
  buggy:    { body: [1.02, 1.05, .95], zf: .5, zr: -.46, x: .5, wf: 1.42, wr: 1.48, lift: .14 },
};

export function createCar(color = '#e34335', number = '07', kart = 'allround', finish = 'standard', skin = 'none') {
  const L = LAYOUT[kart] || LAYOUT.allround;
  const car = new THREE.Group();
  car.name = `Mini Formula ${number}`;
  car.rotation.order = 'YXZ';
  // Everything above the wheels lives in `body`, so each kart class can have its own proportions.
  const body = new THREE.Group(); body.scale.set(...L.body); body.position.y = L.lift || 0; car.add(body);
  // Automotive paint: metallic base under a glossy clear coat that mirrors the hall.
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: .38, metalness: .45, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.25 });
  const darkPaint = new THREE.MeshPhysicalMaterial({ color: tmpColor.set(color).multiplyScalar(0.48).getHex(), roughness: .4, metalness: .4, clearcoat: 1, clearcoatRoughness: .08 });
  const carbon = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonWeave(), roughness: .45, metalness: .3, clearcoat: .9, clearcoatRoughness: .12 });
  const rubber = material('#17191b', 0.95, 0.0);
  const rim = material('#c9d0d3', 0.16, 0.95);
  const cream = new THREE.MeshPhysicalMaterial({ color: '#f6f1e2', roughness: .35, clearcoat: 1, clearcoatRoughness: .08 });
  const driver = new THREE.MeshPhysicalMaterial({ color: '#f6cf42', roughness: .25, metalness: .1, clearcoat: 1, clearcoatRoughness: .04 });
  const visor = new THREE.MeshPhysicalMaterial({ color: '#0c1820', roughness: .03, metalness: .7, clearcoat: 1, envMapIntensity: 1.6 });
  const upholstery = material('#24313b', 0.9, 0.02);
  // Career paint finishes on top of the chosen colour.
  if (finish === 'gold') { paint.color.set('#d9a93c'); paint.metalness = .95; paint.roughness = .2; darkPaint.color.set('#8a6420'); darkPaint.metalness = .9; }
  else if (finish === 'chrome') { paint.color.set('#e6edf3'); paint.metalness = 1; paint.roughness = .05; darkPaint.color.set('#9aa4ae'); darkPaint.metalness = 1; darkPaint.roughness = .1; }
  else if (finish === 'neon') { paint.emissive.set(color); paint.emissiveIntensity = .65; darkPaint.emissive.set(color); darkPaint.emissiveIntensity = .25; }
  // Skin pattern (unlocked over time) painted on top.
  if (skin && skin !== 'none') applySkin({ paint, darkPaint }, skin, color);
  paint.userData.baseEmissive = paint.emissive.getHex(); paint.userData.baseEI = paint.emissiveIntensity;

  // Black floor, tapered monocoque and broad sculpted sidepods.
  prism(body, [[-.25,-.65],[.25,-.65],[.32,-.3],[.29,.29],[.14,.57],[-.14,.57],[-.29,.29],[-.32,-.3]], .04, carbon, .075);
  prism(body, [[-.15,-.61],[.15,-.61],[.19,-.26],[.155,.3],[.09,.75],[-.09,.75],[-.155,.3],[-.19,-.26]], .12, paint, .155);
  prism(body, [[-.12,.23],[.12,.23],[.075,.80],[-.075,.80]], .065, paint, .18);
  for (const side of [-1, 1]) {
    prism(body, [[side*.17,-.44],[side*.29,-.4],[side*.30,.10],[side*.23,.26],[side*.16,.22]], .12, paint, .12);
    box(body, darkPaint, .105, .065, .095, side*.236, .228, .205);
    box(body, carbon, .012, .045, .075, side*.295, .18, -.28);
    for (let i = 0; i < 3; i++) box(body, carbon, .062, .008, .013, side*.242, .264, -.10 - i*.055);
    box(body, cream, .055, .014, .31, side*.257, .264, -.25);
  }

  // A small airbox fin behind an open cockpit.
  prism(body, [[-.10,-.58],[.10,-.58],[.105,-.29],[-.105,-.29]], .075, darkPaint, .27);
  const fin = box(body, paint, .047, .19, .30, 0, .34, -.43);
  fin.rotation.x = -.16;
  box(body, carbon, .09, .055, .075, 0, .41, -.28);
  const cockpit = addMesh(body, new THREE.CylinderGeometry(.133, .1, .027, 16), upholstery, 0, .299, -.055);
  cockpit.scale.z = 1.43;
  // Driver's shoulders and helmet with a wide smoked visor.
  addMesh(body, new THREE.SphereGeometry(.105, 12, 8), darkPaint, 0, .315, -.075).scale.set(1.1, .55, 1);
  const helmet = addMesh(body, new THREE.SphereGeometry(.094, 16, 10), driver, 0, .401, -.07);
  helmet.scale.y = .95;
  const visorMesh = addMesh(body, new THREE.SphereGeometry(.096, 16, 8, -.94, 1.88, 1.02, .75), visor, 0, .407, -.07);
  // SphereGeometry's visible hemisphere starts at -X; face the visor toward +Z.
  visorMesh.rotation.y = Math.PI / 2;
  const helmetStripe = box(body, cream, .027, .006, .11, 0, .489, -.064);
  helmetStripe.rotation.x = -.14;

  // The halo is a continuous dark arch plus its central nose support.
  const haloPoints = [
    new THREE.Vector3(-.135,.335,-.21), new THREE.Vector3(-.14,.455,-.12),
    new THREE.Vector3(-.10,.49,.06), new THREE.Vector3(0,.49,.13),
    new THREE.Vector3(.10,.49,.06), new THREE.Vector3(.14,.455,-.12),
    new THREE.Vector3(.135,.335,-.21),
  ];
  addMesh(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPoints), 20, .014, 6, false), carbon);
  rod(body, carbon, [0,.29,.20], [0,.49,.13], .013);

  // White central stripe makes the nose read clearly while steering.
  box(body, cream, .032, .009, .43, 0, .276, .50);
  box(body, cream, .027, .008, .20, 0, .374, -.46);

  // Front wing: three planes, bright endplates and a small upper element.
  box(body, carbon, .87, .028, .20, 0, .105, .785);
  box(body, paint, .85, .028, .07, 0, .145, .865);
  box(body, cream, .69, .016, .025, 0, .166, .88);
  for (const side of [-1,1]) {
    box(body, paint, .026, .13, .25, side*.433, .144, .783);
    box(body, cream, .029, .025, .15, side*.433, .218, .785);
    rod(body, carbon, [side*.10,.205,.57], [side*.18,.12,.76], .012);
  }
  // Rear wing, held well clear of the tyres by two central uprights.
  for (const side of [-1,1]) {
    box(body, carbon, .022, .22, .045, side*.14, .31, -.695);
    box(body, paint, .025, .16, .235, side*.356, .47, -.716);
    box(body, cream, .027, .025, .16, side*.356, .552, -.715);
  }
  box(body, carbon, .72, .025, .20, 0, .423, -.715);
  box(body, paint, .72, .045, .155, 0, .515, -.744).rotation.x = .12;
  box(body, cream, .54, .008, .033, 0, .543, -.764);
  // Diffuser and a discrete rear rain lamp.
  box(body, carbon, .37, .055, .14, 0, .11, -.65);
  for (let i=-1; i<=1; i++) box(body, carbon, .016, .08, .17, i*.105, .10, -.65);
  const rainLight = material('#ff442e', .3, .1);
  rainLight.emissive.set('#ff2010'); rainLight.emissiveIntensity = 1.8;
  box(body, rainLight, .054, .033, .014, 0, .16, -.73);

  const wheels = [], frontWheels = [];
  const tyreGeom = new THREE.CylinderGeometry(.191, .191, .17, 20, 1);
  tyreGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(.106, .106, .177, 12);
  hubGeom.rotateZ(Math.PI / 2);
  const ringGeom = new THREE.TorusGeometry(.143, .006, 5, 28);
  ringGeom.rotateY(Math.PI / 2);
  for (const z of [L.zr, L.zf]) {
    for (const side of [-1,1]) {
      const x = side*L.x, ws = z > 0 ? L.wf : L.wr;
      // Visible carbon wishbones connect the exposed wheels to the body.
      rod(car, carbon, [side*.12,.185,z-.11], [x,.191,z], .011);
      rod(car, carbon, [side*.12,.185,z+.11], [x,.191,z], .011);
      rod(car, carbon, [side*.14,.12,z-.08], [x,.18,z], .008);
      const steeringPivot = new THREE.Group();
      steeringPivot.position.set(x, .191 * ws, z);
      car.add(steeringPivot);
      const tyre = addMesh(steeringPivot, tyreGeom, rubber);
      tyre.scale.set(z < 0 && L.wideRear ? L.wideRear : 1, ws, ws);
      addMesh(tyre, hubGeom, rim);
      // Sidewall markings and coloured axle cap on the exterior face.
      addMesh(tyre, ringGeom, cream, side*.087, 0, 0);
      const cap = new THREE.CylinderGeometry(.033, .033, .184, 10);
      cap.rotateZ(Math.PI/2);
      addMesh(tyre, cap, paint);
      for (let spoke=0; spoke<6; spoke++) {
        const angle = spoke*Math.PI/3;
        const mesh = box(tyre, carbon, .009, .023, .065,
          side*.091, Math.cos(angle)*.055, Math.sin(angle)*.055);
        mesh.rotation.x = Math.PI/2 + angle;
      }
      // Thin circumferential grooves distinguish tyre tread from the hubs.
      for (const offset of [-.038,.038]) {
        const groove = new THREE.TorusGeometry(.191, .0038, 4, 28);
        groove.rotateY(Math.PI/2);
        addMesh(tyre, groove, carbon, offset, 0, 0);
      }
      wheels.push(tyre);
      if (z > 0) frontWheels.push(steeringPivot);
    }
  }

  // Mirrors sit outside the cockpit and help sell the tiny F1 silhouette.
  for (const side of [-1,1]) {
    rod(body, carbon, [side*.125,.3,.14], [side*.24,.34,.13], .008);
    box(body, paint, .072, .037, .045, side*.252, .342, .13);
    box(body, rim, .051, .022, .005, side*.252, .342, .105);
  }
  kartExtras(kart, body, car, { paint, darkPaint, carbon, cream, rim, rubber }, L);

  const numberTexture = makeNumberTexture(number);
  if (numberTexture) {
    const decalMat = new THREE.MeshStandardMaterial({
      map: numberTexture, transparent: true, roughness: .55,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    });
    const noseNumber = addMesh(body, new THREE.PlaneGeometry(.12, .13), decalMat, 0, .282, .48);
    noseNumber.rotation.x = -Math.PI/2;
    for (const side of [-1,1]) {
      const sideNumber = addMesh(body, new THREE.PlaneGeometry(.14, .11), decalMat,
        side*.323, .188, -.13);
      sideNumber.rotation.y = side*Math.PI/2;
    }
  }

  // Boost flame points backwards. Root toggles it through animateCar or .visible.
  const exhaust = new THREE.Group();
  exhaust.position.set(0, .178 * L.body[1], -.73 * L.body[2]);
  exhaust.visible = false;
  const outerFlameMat = new THREE.MeshBasicMaterial({color:'#20c9ff', transparent:true, opacity:.70, depthWrite:false});
  const innerFlameMat = new THREE.MeshBasicMaterial({color:'#fff6b3', transparent:true, opacity:.95, depthWrite:false});
  const flame = addMesh(exhaust, new THREE.ConeGeometry(.066, .40, 7), outerFlameMat, 0,0,-.19);
  flame.rotation.x = -Math.PI/2;
  const flameCore = addMesh(exhaust, new THREE.ConeGeometry(.035, .24, 7), innerFlameMat, 0,0,-.11);
  flameCore.rotation.x = -Math.PI/2;
  car.add(exhaust);

  // Soft contact shadow keeps the car planted even where the sun shadow is faint.
  if (typeof document !== 'undefined') {
    shadowGeo ||= new THREE.PlaneGeometry(1.1, 1.95).rotateX(-Math.PI / 2);
    shadowMat ||= new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: contactShadow(), transparent: true, opacity: .62, depthWrite: false });
    const blob = new THREE.Mesh(shadowGeo, shadowMat);
    blob.position.y = .006; blob.renderOrder = -1; blob.userData.shared = true; blob.scale.set(L.body[0] * 1.05, 1, L.body[2]);
    car.add(blob);
  }
  // ~130 parts per car would mean ~130 draw calls (twice with shadows). Fuse everything that never moves
  // relative to its parent into one mesh per material; tyres and steering pivots stay separate so they can turn.
  bakeStatic(body, true);
  for (const tyre of wheels) bakeStatic(tyre, true);
  bakeStatic(car, false);
  car.userData.wheels = wheels;
  car.userData.frontWheels = frontWheels;
  car.userData.exhaust = exhaust;
  car.userData.materials = {paint, darkPaint, carbon, rubber, rim, cream};
  car.userData.kart = kart; car.userData.skin = skin || 'none';
  car.userData.animationTime = Math.random()*10;
  return car;
}

// Merges the meshes below `root` (all descendants when `deep`, otherwise only its direct mesh children)
// into one mesh per material, in root's local space. Shared meshes (the contact shadow) are left alone.
const _rel = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function bakeStatic(root, deep) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map(), parts = [];
  const visit = node => {
    for (const child of node.children) {
      if (!child.isMesh || child.userData.shared) continue;
      parts.push(child);
      if (deep) visit(child);
    }
  };
  visit(root);
  for (const mesh of parts) {
    _rel.multiplyMatrices(_inv, mesh.matrixWorld);
    let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(_rel);
    // A mirrored transform flips the triangle winding; swap two corners so faces still point outward.
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
    merged.castShadow = cast; merged.receiveShadow = true;
    root.add(merged);
    list.forEach(g => g.dispose());
  }
}

// Signature parts that make each kart class readable at a glance.
function kartExtras(kart, body, car, m, L) {
  if (kart === 'bolide') {
    // Long-tail speedster: tall twin-element rear wing and side air scoops.
    box(body, m.carbon, .86, .03, .2, 0, .62, -.74).rotation.x = .1;
    box(body, m.paint, .86, .05, .13, 0, .68, -.79).rotation.x = .18;
    for (const side of [-1, 1]) { box(body, m.paint, .03, .3, .3, side * .43, .58, -.76); box(body, m.darkPaint, .07, .09, .3, side * .2, .3, .02); }
    box(body, m.cream, .03, .01, .9, 0, .29, .1);
  } else if (kart === 'flitzer') {
    // Tiny go-kart: roll hoop, bubble seat and a stubby nose bumper.
    rod(body, m.carbon, [-.15, .3, -.28], [-.12, .6, -.24], .02); rod(body, m.carbon, [.15, .3, -.28], [.12, .6, -.24], .02); rod(body, m.carbon, [-.12, .6, -.24], [.12, .6, -.24], .02);
    box(body, m.cream, .5, .06, .06, 0, .14, .86);
    addMesh(body, new THREE.SphereGeometry(.07, 10, 8), m.cream, 0, .52, -.28);
  } else if (kart === 'brummer') {
    // Armoured bruiser: bull bar, side armour, twin exhaust stacks.
    box(body, m.carbon, .78, .16, .08, 0, .17, .92); box(body, m.rim, .82, .05, .05, 0, .27, .94);
    for (const side of [-1, 1]) {
      box(body, m.darkPaint, .05, .14, .62, side * .33, .2, -.08);
      const pipe = addMesh(body, new THREE.CylinderGeometry(.035, .04, .32, 8), m.rim, side * .14, .52, -.6); pipe.rotation.x = -.2;
    }
    box(body, m.darkPaint, .44, .05, .3, 0, .48, -.42);
  } else if (kart === 'buggy') {
    // Rally buggy: tube roll cage, roof light bar, mud flaps and knobbly tyres.
    const cage = [[-.2, .28, -.32], [-.17, .72, -.22], [.17, .72, -.22], [.2, .28, -.32]];
    for (let i = 0; i < 3; i++) rod(body, m.carbon, cage[i], cage[i + 1], .022);
    rod(body, m.carbon, [-.17, .72, -.22], [-.12, .62, .18], .02); rod(body, m.carbon, [.17, .72, -.22], [.12, .62, .18], .02); rod(body, m.carbon, [-.12, .62, .18], [.12, .62, .18], .02);
    rod(body, m.carbon, [-.12, .62, .18], [-.2, .26, .42], .02); rod(body, m.carbon, [.12, .62, .18], [.2, .26, .42], .02);
    const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff2b0, emissiveIntensity: 1.2 });
    box(body, m.carbon, .4, .05, .06, 0, .76, -.2); for (let i = -1; i <= 1; i++) box(body, lamp, .08, .05, .02, i * .12, .77, -.17);
    for (const side of [-1, 1]) box(body, m.rubber, .16, .14, .015, side * .42, .12, -.66);
    box(body, m.rim, .6, .05, .05, 0, .16, .9);
  } else if (kart === 'drifter') {
    // Drift car: swan-neck wing, wide arches, neon underglow.
    for (const side of [-1, 1]) { rod(body, m.carbon, [side * .1, .36, -.62], [side * .12, .7, -.7], .014); box(body, m.paint, .07, .1, .36, side * .38, .22, -.44); }
    box(body, m.paint, .84, .03, .2, 0, .72, -.72);
    box(body, m.cream, .84, .012, .04, 0, .74, -.8);
    const glow = new THREE.MeshBasicMaterial({ color: m.paint.color.clone().offsetHSL(0, .1, .2), transparent: true, opacity: .55, depthWrite: false, toneMapped: false });
    const plate = addMesh(car, new THREE.PlaneGeometry(.75, 1.4), glow, 0, .03, 0); plate.rotation.x = -Math.PI / 2; plate.castShadow = false; plate.receiveShadow = false;
  }
}

export function animateCar(car, { speed = 0, steer = 0, boosting = false, drifting = false } = {}, dt = 1/60) {
  const data = car.userData;
  for (const wheel of data.wheels || []) wheel.rotation.x += speed * dt / .191;
  for (const pivot of data.frontWheels || []) pivot.rotation.y = -steer * .36;
  data.animationTime = (data.animationTime || 0) + dt;
  if (data.exhaust) {
    data.exhaust.visible = Boolean(boosting && Math.abs(speed) > .5);
    data.exhaust.scale.set(1, 1, 1 + Math.sin(data.animationTime*63)*.16 + (drifting ? .2 : 0));
  }
}
