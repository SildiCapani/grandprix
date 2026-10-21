import * as THREE from 'three';

// Draws the moving obstacles (game/obstacles.js) every frame: warning rings, falling cannonballs / lava bombs / meteors
// with their explosions, things rolling across the road and the dragon fire / kraken tentacle zones.
function glowTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const BOOM = { cannon: 0xd8d0c8, lava: 0xff7a20, meteor: 0xb07aff };

export function createObstacleFx(scene) {
  const fire = glowTex('rgba(255,240,180,1)', 'rgba(255,80,0,0)'), puff = glowTex('rgba(255,255,255,.95)', 'rgba(255,255,255,0)');
  const sph = new THREE.SphereGeometry(1, 18, 12), ico = new THREE.IcosahedronGeometry(1, 1), box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 10);
  const ringGeo = new THREE.RingGeometry(.82, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 40); discGeo.rotateX(-Math.PI / 2);
  const mat = {
    ring: new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    disc: new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: .2, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: .4, metalness: .7 }),
    lava: new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: .8, flatShading: true }),
    meteor: new THREE.MeshStandardMaterial({ color: 0x4a3a6a, emissive: 0x8a4aff, emissiveIntensity: .9, roughness: .7, flatShading: true }),
    boulder: new THREE.MeshStandardMaterial({ color: 0x9a6a48, roughness: 1, flatShading: true }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: .7 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8a8a7a, roughness: .95, flatShading: true }),
    moss: new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 1 }),
    dough: new THREE.MeshStandardMaterial({ color: 0xe0a060, roughness: .7 }), icing: new THREE.MeshStandardMaterial({ color: 0xff7ac0, roughness: .4 }),
    gummy: new THREE.MeshStandardMaterial({ color: 0xff3a4a, roughness: .2, transparent: true, opacity: .85, emissive: 0xff3a4a, emissiveIntensity: .15 }),
    rhino: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: .9 }), horn: new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: .6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: .3 }), white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .3 }),
    hull: new THREE.MeshStandardMaterial({ color: 0xff4a6a, metalness: .6, roughness: .3 }), glass: new THREE.MeshStandardMaterial({ color: 0x6ad8ff, emissive: 0x1a6a8a, emissiveIntensity: .6, roughness: .1 }),
    tentacle: new THREE.MeshStandardMaterial({ color: 0x8a3aa8, roughness: .5 }), sucker: new THREE.MeshStandardMaterial({ color: 0xe8a0d8, roughness: .6 }),
  };
  mat.ring.userData.live = true;
  const part = (g, geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  const spr = (tex, color, size, add = true) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false })); s.scale.setScalar(size); return s; };

  function make(h) {
    const g = new THREE.Group(), u = {};
    if (h.type === 'impact') {
      u.ring = new THREE.Mesh(ringGeo, mat.ring); u.disc = new THREE.Mesh(discGeo, mat.disc); g.add(u.ring, u.disc);
      const body = new THREE.Group(); g.add(body); u.body = body;
      if (h.kind === 'cannon') part(body, sph, mat.iron, 0, 0, 0, .75, .75, .75);
      else part(body, ico, h.kind === 'lava' ? mat.lava : mat.meteor, 0, 0, 0, 1.1, 1, 1.2);
      u.trail = spr(h.kind === 'cannon' ? puff : fire, h.kind === 'cannon' ? 0xb8b0a8 : BOOM[h.kind], 3, h.kind !== 'cannon'); body.add(u.trail); u.trail.position.y = 1.6;
      u.boom = [spr(fire, BOOM[h.kind], 1), spr(puff, h.kind === 'cannon' ? 0x9a948c : 0x5a4a5a, 1, false)]; u.boom.forEach(b => g.add(b));
    } else if (h.type === 'cross') {
      const r = h.r, roller = new THREE.Group(); g.add(roller); u.roller = roller;
      if (h.kind === 'boulder') part(roller, ico, mat.boulder, 0, 0, 0, r, r * .9, r);
      else if (h.kind === 'snowball') { part(roller, sph, mat.snow, 0, 0, 0, r, r, r); for (let k = 0; k < 5; k++) part(roller, sph, mat.snow, Math.cos(k) * r * .7, Math.sin(k * 2) * r * .5, Math.sin(k) * r * .7, r * .35, r * .35, r * .35); }
      else if (h.kind === 'stoneball') { part(roller, ico, mat.stone, 0, 0, 0, r, r, r); for (let k = 0; k < 4; k++) part(roller, ico, mat.moss, Math.cos(k * 1.7) * r * .8, Math.sin(k * 2.3) * r * .6, Math.sin(k * 1.7) * r * .8, r * .3, r * .2, r * .3); }
      else if (h.kind === 'donut') { const t = new THREE.Mesh(new THREE.TorusGeometry(r * .7, r * .32, 14, 28), mat.dough); t.castShadow = true; roller.add(t); const ic = new THREE.Mesh(new THREE.TorusGeometry(r * .7, r * .34, 14, 28, Math.PI * 2), mat.icing); ic.scale.z = .55; ic.position.z = r * .1; roller.add(ic); u.wheel = true; }
      else if (h.kind === 'gummy') { part(roller, sph, mat.gummy, 0, 0, 0, r * .7, r * .85, r * .6); part(roller, sph, mat.gummy, 0, r * 1.1, 0, r * .5, r * .45, r * .45); part(roller, sph, mat.gummy, -r * .35, r * 1.5, 0, r * .17, r * .17, r * .15); part(roller, sph, mat.gummy, r * .35, r * 1.5, 0, r * .17, r * .17, r * .15); u.walker = true; }
      else if (h.kind === 'rhino') { part(roller, sph, mat.rhino, 0, .2, 0, r * .7, r * .6, r * 1.2); part(roller, sph, mat.rhino, 0, .3, r * 1.15, r * .4, r * .38, r * .55); part(roller, cone, mat.horn, 0, .75, r * 1.55, .18, .7, .18).rotation.x = .5; u.legs = [[-.5, .6], [.5, .6], [-.5, -.7], [.5, -.7]].map(([x, z]) => part(roller, box, mat.rhino, x * r, -r * .45, z * r, .35, r * .7, .35)); u.walker = true; }
      else if (h.kind === 'whale') { part(roller, sph, mat.black, 0, 0, 0, r * .55, r * .5, r * 1.6); part(roller, sph, mat.white, 0, -r * .18, r * .1, r * .42, r * .32, r * 1.3); part(roller, cone, mat.black, 0, r * .75, 0, .25, r * .9, .7); u.walker = true; u.splash = spr(puff, 0xffffff, 6, false); g.add(u.splash); }
      else if (h.kind === 'hovercar') { part(roller, sph, mat.hull, 0, 0, 0, r * .75, r * .32, r * 1.3); part(roller, sph, mat.glass, 0, r * .25, r * .15, r * .5, r * .25, r * .6); const gl = spr(fire, 0x6ae8ff, 4); gl.position.y = -r * .4; roller.add(gl); u.walker = true; }
    } else if (h.type === 'zone') {
      if (h.kind === 'fire') { u.flames = [0, 1].map(() => { const f = spr(fire, 0xff6a1a, 1); f.material.opacity = .8; g.add(f); return f; }); u.glow = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: .2, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 })); g.add(u.glow); }
      else { u.segs = Array.from({ length: 9 }, (_, k) => part(g, sph, k % 3 === 2 ? mat.sucker : mat.tentacle, 0, 0, 0, 1, 1, 1)); }
    }
    g.userData = u; scene.add(g); return g;
  }

  const live = new Map();
  function update(hazards, time) {
    const seen = new Set();
    for (const h of hazards) {
      seen.add(h.id); let g = live.get(h.id); if (!g) { g = make(h); live.set(h.id, g); }
      const u = g.userData; g.visible = true;
      if (h.type === 'impact') {
        g.position.set(h.x, h.y, h.z);
        const pulse = .5 + .5 * Math.sin(time * 18);
        u.ring.visible = u.disc.visible = h.boom === 0; u.ring.scale.setScalar(h.r * (1.1 - h.warn * .15)); u.disc.scale.setScalar(h.r * h.warn); mat.ring.opacity = .55 + pulse * .45;
        u.ring.position.y = u.disc.position.y = .05;
        u.body.visible = h.boom === 0; u.body.position.y = .6 + h.fall * h.fall * 30; u.body.rotation.set(time * 3, time * 2, 0);
        const b = h.boom; u.boom.forEach((s, k) => { s.visible = b > 0; if (!s.visible) return; s.scale.setScalar(h.r * (1.5 + b * (k ? 5 : 3.5))); s.position.y = 1 + b * (k ? 3 : 1); s.material.opacity = (1 - b) * (k ? .7 : 1); });
      } else if (h.type === 'cross') {
        g.position.set(h.x, h.y + (h.kind === 'whale' || h.kind === 'hovercar' ? 0 : h.r * (h.kind === 'rhino' || h.kind === 'gummy' ? .55 : 1)), h.z);
        g.rotation.y = h.heading;
        if (u.wheel) { u.roller.rotation.set(0, Math.PI / 2, 0); u.roller.children.forEach(c => { c.rotation.z = -h.roll; }); }
        else if (!u.walker) u.roller.rotation.x = h.roll;
        else { u.roller.position.y = Math.abs(Math.sin(time * 9)) * .12; u.legs?.forEach((l, k) => { l.rotation.x = Math.sin(time * 10 + k * Math.PI) * .5; }); }
        if (h.kind === 'whale') { u.roller.rotation.x = (h.u - .5) * -1.4; if (u.splash) { const near = h.u < .15 || h.u > .85; u.splash.visible = near; u.splash.position.set(0, -h.y + h.ground - 1, 0); } }
      } else if (h.type === 'zone') {
        g.position.set(h.x, h.y, h.z);
        if (u.flames) {
          u.glow.scale.setScalar(h.r * 1.2); u.glow.position.y = .06; u.glow.material.opacity = h.hot ? .35 : .1 + .2 * h.warn * (.5 + .5 * Math.sin(time * 14));
          u.flames.forEach((f, k) => { f.visible = h.hot || (h.warn > .5 && k === 0); const sc = h.hot ? h.r * (.95 + Math.sin(time * 16 + k * 2 + h.k) * .2) * (1 - Math.max(0, h.life - .8) * 5) : .9 * h.warn; f.scale.set(sc, sc * 1.5, 1); f.position.set(Math.sin(k * 2.1 + h.k) * h.r * .45, sc * .55, Math.cos(k * 1.7 + h.k) * h.r * .45); });
        } else {
          // the tentacle: rises at the road edge while warning, slams across the half of the road when hot
          const edge = h.side * (h.r * 2 + 3.5), lean = h.hot ? 1 : h.warn * .25, up = h.hot ? Math.max(0, 1 - h.life * 1.4) : h.warn;
          u.segs.forEach((m, k) => { const f = k / 8, lat = edge - h.side * f * (h.r * 2 + 2) * lean; m.position.set(lat - h.lane, (1 - lean) * f * 6 * up + .5 + (h.hot ? Math.sin(time * 8 + k) * .12 : 0), 0); m.scale.setScalar(.75 - f * .42); });
          g.rotation.y = h.angle;
          g.visible = h.k === Math.floor(h.n / 2);
        }
      }
    }
    for (const [id, g] of live) if (!seen.has(id)) { scene.remove(g); live.delete(id); }
  }
  function clear() { for (const g of live.values()) scene.remove(g); live.clear(); }
  return { update, clear };
}
