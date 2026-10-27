import * as THREE from 'three';
import { FALL_TIME } from './race-core.js';

// The rescue drone ("Hopsi"): when a kart falls off an open edge it flies in, hooks the kart with its winch
// and lowers it back onto the road, then zooms off. Plus splash bursts where karts hit water / chocolate / mist.
const SPLASH_COLOR = { pirate: 0xe6f8ff, candy: 0x7a4020, castle: 0xe8dcf4, arctic: 0xe6f8ff, rooftops: 0xffe0a0, galaxy: 0xc8a0ff, beach: 0xe6f8ff, reef: 0xbfeeff, abyss: 0x7ae8ff };

function glow() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

export function createRescueFx(scene) {
  const tex = glow();
  const body = new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: .35, metalness: .1 }), white = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: .4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2028, roughness: .3, metalness: .4 }), eyeMat = new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false });
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide });
  const sph = new THREE.SphereGeometry(1, 20, 14), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 12), disc = new THREE.CircleGeometry(1, 20);
  disc.rotateX(-Math.PI / 2);
  function makeDrone() {
    const g = new THREE.Group(), part = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
    part(sph, body, 0, 0, 0, .95, .55, .95);
    part(sph, white, 0, -.12, 0, .99, .2, .99);
    part(box, dark, 0, .02, .78, .9, .38, .22);
    for (const sd of [-1, 1]) part(sph, eyeMat, sd * .2, .05, .9, .1, .13, .05);
    const rotors = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, x = Math.cos(a) * 1.25, z = Math.sin(a) * 1.25;
      const arm = part(box, dark, x / 2, .05, z / 2, .14, .1, 1.3); arm.rotation.y = -a + Math.PI / 2;
      part(cyl, dark, x, .16, z, .12, .22, .12);
      const r = new THREE.Mesh(disc, rotorMat); r.position.set(x, .3, z); r.scale.setScalar(.62); g.add(r); rotors.push(r);
      const blade = part(box, dark, x, .29, z, 1.1, .03, .1); rotors.push(blade);
    }
    const siren = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff3030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    siren.position.y = .62; siren.scale.setScalar(.9); g.add(siren);
    part(sph, new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 1 }), 0, .5, 0, .16, .16, .16);
    const cable = part(cyl, dark, 0, 0, 0, .03, 1, .03); cable.castShadow = false;
    const hook = part(new THREE.TorusGeometry(.22, .06, 8, 16, Math.PI * 1.4), dark, 0, 0, 0, 1, 1, 1);
    // rescue cross on the sides
    for (const sd of [-1, 1]) { const c = part(box, new THREE.MeshBasicMaterial({ color: 0xe8202a }), sd * .93, .08, 0, .03, .28, .09); const c2 = part(box, c.material, sd * .93, .08, 0, .03, .09, .28); void c2; }
    g.userData = { rotors, siren, cable, hook }; g.visible = false; scene.add(g);
    return g;
  }
  const drones = new Map(), splashes = [];
  // c: anything with x, y, z, angle and fallT (0 when not falling).
  function update(key, c, ms, dt) {
    let d = drones.get(key);
    const carrying = !!c && c.fallT >= FALL_TIME * .7;
    if (!d) { if (!carrying) return; d = { g: makeDrone(), leave: 0, x: 0, y: 0, z: 0, a: 0 }; drones.set(key, d); }
    const u = d.g.userData, t = ms / 1000;
    if (carrying) {
      d.leave = 1.4; d.x = c.x; d.z = c.z; d.a = c.angle || 0;
      const arrive = Math.min(1, (c.fallT - FALL_TIME * .7) / (FALL_TIME * .3));
      const hover = c.fallT < FALL_TIME ? 14 * (1 - arrive) : 0;
      d.y = (c.fallT < FALL_TIME ? c.y + 6 : c.y + 3.1) + hover;
    } else if (d.leave > 0) { d.leave -= dt; d.y += dt * 9; d.x += Math.sin(d.a) * dt * 10; d.z += Math.cos(d.a) * dt * 10; }
    const on = carrying || d.leave > 0; d.g.visible = on; if (!on) return;
    d.g.position.set(d.x, d.y + Math.sin(t * 4) * .08, d.z); d.g.rotation.y = d.a; d.g.rotation.z = Math.sin(t * 2.3) * .06;
    u.rotors.forEach((r, i) => { r.rotation.y = t * 40 * (i % 4 < 2 ? 1 : -1); });
    u.siren.material.color.setHex(Math.floor(t * 4) % 2 ? 0xff3030 : 0x3070ff);
    const hooked = carrying && c.fallT >= FALL_TIME, len = hooked ? Math.max(.4, d.g.position.y - (c.y + .95)) : .6;
    u.cable.scale.y = len; u.cable.position.y = -.3 - len / 2; u.hook.position.y = -.3 - len; u.hook.rotation.y = t;
  }
  function splash(x, y, z, theme) {
    const color = SPLASH_COLOR[theme] ?? 0xffffff, mist = theme === 'castle' || theme === 'galaxy', n = mist ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: .95 }));
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      s.position.set(x, y + .3, z); s.scale.setScalar(mist ? 3 : .8);
      scene.add(s); splashes.push({ s, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: mist ? .6 : 6 + Math.random() * 6, life: 1.1, grow: mist ? 5 : .6 });
    }
  }
  function tick(dt) {
    for (let i = splashes.length - 1; i >= 0; i--) {
      const p = splashes[i]; p.life -= dt;
      if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); splashes.splice(i, 1); continue; }
      p.vy -= 18 * dt * (p.grow > 1 ? 0 : 1); p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.s.scale.x + p.grow * dt); p.s.material.opacity = Math.min(.95, p.life);
    }
  }
  function clear() { for (const d of drones.values()) { d.g.visible = false; d.leave = 0; } }
  return { update, splash, tick, clear };
}
