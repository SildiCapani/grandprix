import * as THREE from 'three';

// Airborne landmarks make the skyline lively without adding road obstacles.
export function createLandmarks({ group, updaters }) {
  const cream = new THREE.MeshStandardMaterial({ color: 0xffeed0, roughness: .65 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x268e98, roughness: .55 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xbf7549, metalness: .35, roughness: .45 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x394a53, metalness: .45, roughness: .5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x79cfe0, metalness: .3, roughness: .15 });
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  function mesh(parent, geometry, material, x, y, z, sx, sy = sx, sz = sx) {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  }
  function label(text, bg, fg) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(16, 16, 992, 224);
    ctx.fillStyle = fg; ctx.font = 'italic bold 110px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 137, 930);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map, roughness: .7 });
  }
  const airship = new THREE.Group(); airship.name = 'APEX AIRWAYS'; group.add(airship);
  const envelope = new THREE.SphereGeometry(1, 40, 24);
  const colors = [], pos = envelope.attributes.position, color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    color.setHex(Math.abs(y) < .2 || (y > .63 && y < .78) ? 0x24969d : 0xffedcf);
    colors.push(color.r, color.g, color.b);
  }
  envelope.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  mesh(airship, envelope, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 }), 0, 0, 0, 13, 11, 37);
  // Rounded passenger cabin with separate windows, braces and running lights.
  const cabin = mesh(airship, new THREE.CapsuleGeometry(1, 1, 6, 12), cream, 0, -15, 0, 3.2, 6, 3.2); cabin.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    for (let k = -2; k <= 2; k++) mesh(airship, box, glass, side * 3.08, -14.5, k * 2, .15, 2, 1.45);
    for (const z of [-7, 7]) {
      const brace = mesh(airship, cylinder, frame, side * 3.3, -10.5, z, .1, 8, .1); brace.rotation.z = -side * .25;
    }
    const name = mesh(airship, new THREE.PlaneGeometry(29, 5.5), label('APEX AIRWAYS', '#fff0d7', '#176b76'), side * 13.08, .2, 0, 1);
    name.rotation.y = side * Math.PI / 2;
    mesh(airship, new THREE.SphereGeometry(.5, 8, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff674a : 0x70ffb0 }), side * 16, -8, -10, 1);
  }
  const finGeo = new THREE.BufferGeometry();
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 10, -9, 0, 1, -17], 3)); finGeo.computeVertexNormals();
  const finMat = teal.clone(); finMat.side = THREE.DoubleSide;
  for (let k = 0; k < 4; k++) { const fin = mesh(airship, finGeo, finMat, 0, 0, -23, 1); fin.rotation.z = k * Math.PI / 2; }
  const propellers = [];
  for (const side of [-1, 1]) {
    mesh(airship, box, frame, side * 10, -10, -6, 14, .25, .35);
    const engine = mesh(airship, new THREE.SphereGeometry(1, 12, 8), copper, side * 17, -10, -6, 1.4, 1.4, 3);
    const prop = new THREE.Group(); prop.position.set(engine.position.x, -10, -2.8); airship.add(prop);
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group(); arm.rotation.z = k * Math.PI * 2 / 3;
      mesh(arm, box, cream, 0, 2.2, 0, .7, 4.4, .16); prop.add(arm);
    }
    mesh(prop, new THREE.SphereGeometry(.55, 8, 6), copper, 0, 0, 0, 1); propellers.push(prop);
  }
  const bannerMat = label('DISCOVER APEX', '#176b76', '#fff0d7');
  for (const side of [-1, 1]) {
    const sign = mesh(airship, new THREE.PlaneGeometry(23, 5.75), bannerMat, side * .08, -28, 0, 1); sign.rotation.y = side * Math.PI / 2;
    for (const z of [-10, 10]) mesh(airship, cylinder, frame, 0, -23, z, .045, 7, .045);
  }
  updaters.push((dt, t) => {
    const a = t * .022;
    airship.position.set(180 + Math.sin(a) * 340, 138 + Math.sin(t * .18) * 2.5, 350 + Math.cos(a) * 420);
    airship.rotation.set(Math.sin(t * .25) * .015, Math.atan2(340 * Math.cos(a), -420 * Math.sin(a)), Math.sin(t * .17) * .025);
    for (const prop of propellers) prop.rotation.z = t * 18;
  });

  const balloons = [];
  const profile = [[0, -10], [1.5, -8.5], [4, -6], [7.5, -2], [8.5, 3], [7, 8], [3.5, 11], [0, 12]].map(p => new THREE.Vector2(...p));
  for (const [index, [x, y, z]] of [[-100, 110, 300], [480, 135, 260], [-420, 145, -120]].entries()) {
    const balloon = new THREE.Group(); balloon.name = 'Heißluftballon'; balloon.position.set(x, y, z); group.add(balloon);
    const geometry = new THREE.LatheGeometry(profile, 32), attr = geometry.attributes.position, colors = [], c = new THREE.Color();
    for (let k = 0; k < attr.count; k++) {
      const stripe = Math.floor((Math.atan2(attr.getX(k), attr.getZ(k)) + Math.PI) / (Math.PI / 4));
      c.setHex(stripe % 2 ? 0xffebc6 : [0xe97b56, 0x3fa7aa, 0xe9b84e][index]); colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    mesh(balloon, geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .8 }), 0, 0, 0, 1);
    mesh(balloon, box, copper, 0, -14, 0, 3.2, 2, 3.2);
    for (const dx of [-1.3, 1.3]) for (const dz of [-1.3, 1.3]) mesh(balloon, cylinder, frame, dx, -11.8, dz, .045, 3, .045);
    const flame = mesh(balloon, new THREE.ConeGeometry(.5, 2.7, 8), new THREE.MeshBasicMaterial({ color: 0xffc55b }), 0, -10.6, 0, 1);
    balloons.push({ balloon, flame, x, y, z, index });
  }
  updaters.push((dt, t) => {
    for (const b of balloons) {
      b.balloon.position.set(b.x + Math.sin(t * .045 + b.index) * 18, b.y + Math.sin(t * .3 + b.index * 2) * 2, b.z + Math.cos(t * .04 + b.index) * 14);
      b.balloon.rotation.z = Math.sin(t * .35 + b.index) * .035;
      b.flame.scale.y = .7 + Math.sin(t * 8 + b.index) * .2;
    }
  });
}
