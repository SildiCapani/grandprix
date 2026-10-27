import * as THREE from 'three';
import { jellyfish, turtle, eel } from './ocean-critters.js';
import { cannonball, lavaBubble, hotRock, boulder, snowball, stoneball, donut, gummyBear, rhino, orca, hoverCar, tentacle } from './critters.js';

// Draws the moving obstacles (game/obstacles.js) every frame: warning rings, falling cannonballs / lava bombs / meteors
// with their explosions, things rolling across the road and the dragon fire / kraken tentacle zones.
function glowTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const BOOM = { cannon: 0xd8d0c8, lava: 0xff7a20, meteor: 0xb07aff, jelly: 0xff8ae8 };

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

  const GUMMY = [0xff3a4a, 0x3ad86a, 0xffc83a, 0xff8a2a, 0x9a5aff], CARS = [0xff4a6a, 0xffc020, 0x3ab8ff, 0x7aff5a, 0xff7ad8];
  let made = 0;
  // A cartoon model per kind; models are pooled and reused every cycle.
  function model(kind, r) {
    const n = made++;
    switch (kind) {
      case 'cannon': { const m = cannonball(); m.scale.setScalar(.95); return m; }
      case 'lava': { const m = lavaBubble(); m.scale.setScalar(1.05); return m; }
      case 'meteor': { const m = hotRock(0xc07aff, 0x5a4a7a); m.scale.setScalar(1.15); return m; }
      case 'boulder': { const m = boulder(); m.scale.setScalar(r); return m; }
      case 'snowball': { const m = snowball(); m.scale.setScalar(r); return m; }
      case 'stoneball': { const m = stoneball(); m.scale.setScalar(r); return m; }
      case 'donut': { const m = donut(), w = new THREE.Group(); m.scale.setScalar(r * 1.05); w.add(m); w.rotation.y = Math.PI / 2; w.userData.spin = m; return w; }
      case 'gummy': { const m = gummyBear(GUMMY[n % GUMMY.length]); m.scale.setScalar(r * 1.2); return m; }
      case 'rhino': { const m = rhino(); m.scale.setScalar(r * .85); return m; }
      case 'whale': { const m = orca(); m.scale.setScalar(r * .62); return m; }
      case 'hovercar': { const m = hoverCar(CARS[n % CARS.length]); m.scale.setScalar(r * .8); return m; }
      case 'tentacle': { const m = tentacle(); m.scale.setScalar(1.25); return m; }
      case 'jelly': { const m = jellyfish([0xff7ae8, 0x7ae0ff, 0xc08aff][n % 3]); m.scale.setScalar(1.15); return m; }
      case 'turtle': { const m = turtle(); m.scale.setScalar(r * .95); return m; }
      case 'eel': { const m = eel(); m.scale.setScalar(r * .75); return m; }
      case 'ball': { // beach ball: coloured segments
        const g = new THREE.Group(), cols = [0xff4a4a, 0xffffff, 0x3ab8ff, 0xffffff, 0xffd23a, 0xffffff];
        cols.forEach((c, i) => { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12, i / 6 * Math.PI * 2, Math.PI * 2 / 6), new THREE.MeshStandardMaterial({ color: c, roughness: .35 })); seg.castShadow = true; g.add(seg); });
        return g; }
      case 'wave': { // a curling surf wave with a foam crest, moving across the road
        const g = new THREE.Group(), L = 8;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, L, 28, 1, true, -.2, Math.PI * 1.25), new THREE.MeshStandardMaterial({ color: 0x2ab8d8, roughness: .15, metalness: .1, transparent: true, opacity: .82, side: THREE.DoubleSide, emissive: 0x0a4a6a, emissiveIntensity: .25 }));
        body.rotation.z = Math.PI / 2; body.position.y = 1.9; g.add(body);
        const foam = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, L + .2, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6 })); foam.rotation.z = Math.PI / 2; foam.position.set(0, 3.55, .55); g.add(foam);
        const base = new THREE.Mesh(new THREE.BoxGeometry(L, .5, 3.4), body.material); base.position.set(0, .25, -.6); g.add(base);
        g.userData.anim = (t) => { foam.position.y = 3.55 + Math.sin(t * 6) * .12; body.scale.y = 1 + Math.sin(t * 4) * .03; };
        return g; }
    }
    return new THREE.Group();
  }
  const pool = new Map();
  function make(h) {
    const key = h.type + ':' + h.kind, list = pool.get(key);
    if (list?.length) { const g = list.pop(); g.visible = true; return g; }
    const g = new THREE.Group(), u = { key };
    if (h.type === 'impact') {
      u.ring = new THREE.Mesh(ringGeo, mat.ring); u.disc = new THREE.Mesh(discGeo, mat.disc); g.add(u.ring, u.disc);
      const body = new THREE.Group(); g.add(body); u.body = body; u.m = model(h.kind); body.add(u.m);
      u.trail = spr(h.kind === 'cannon' ? puff : fire, h.kind === 'cannon' ? 0xb8b0a8 : BOOM[h.kind], 3.4, h.kind !== 'cannon'); g.add(u.trail);
      u.boom = [spr(fire, BOOM[h.kind], 1), spr(puff, h.kind === 'cannon' ? 0x9a948c : 0x5a4a5a, 1, false), spr(fire, 0xffe8a0, 1)]; u.boom.forEach(b => g.add(b));
    } else if (h.type === 'cross') {
      const roller = new THREE.Group(); g.add(roller); u.roller = roller; u.m = model(h.kind, h.r); roller.add(u.m);
      u.walker = ['gummy', 'rhino', 'whale', 'hovercar', 'wave', 'turtle', 'eel'].includes(h.kind); u.wheel = h.kind === 'donut';
      if (h.kind === 'wave') { u.spray = [0, 1, 2, 3].map(() => { const d = spr(puff, 0xffffff, 1, false); g.add(d); return d; }); }
      if (h.kind === 'whale') { u.splash = spr(puff, 0xffffff, 7, false); g.add(u.splash); }
      if (['rhino', 'boulder', 'stoneball', 'snowball', 'donut', 'gummy'].includes(h.kind)) { u.dust = [0, 1, 2].map(() => { const d = spr(puff, h.kind === 'snowball' ? 0xffffff : 0xd8c8a8, 1, false); g.add(d); return d; }); }
    } else if (h.type === 'zone') {
      if (h.kind === 'fire' || h.kind === 'vent') { const vent = h.kind === 'vent'; u.flames = [0, 1, 2, 3].map(k => { const f = vent && k % 2 ? spr(puff, 0x2a2a30, 1, false) : spr(fire, vent ? 0xff8a3a : k % 2 ? 0xffb02a : 0xff5a10, 1); f.material.opacity = .85; g.add(f); return f; }); u.glow = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: .2, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 })); g.add(u.glow); }
      else { u.m = model('tentacle'); g.add(u.m); u.splash = spr(puff, 0xffffff, 5, false); g.add(u.splash); }
    }
    g.userData = u; scene.add(g); return g;
  }
  function release(g) { g.visible = false; const key = g.userData.key; if (!pool.has(key)) pool.set(key, []); pool.get(key).push(g); }

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
        u.body.visible = h.boom === 0; u.body.position.y = .9 + h.fall * h.fall * 30;
        if (h.kind === 'jelly') { u.body.position.y = .9 + h.fall * 14; u.m.userData.anim(time); u.m.rotation.set(0, time * .3, 0); }
        else if (h.kind === 'cannon') u.m.rotation.set(-.6, 0, Math.sin(time * 5) * .2); else if (h.kind === 'lava') { u.m.rotation.set(-.5 + Math.sin(time * 9) * .1, 0, 0); u.m.scale.set(1.05 + Math.sin(time * 14) * .06, 1.05 - Math.sin(time * 14) * .06, 1.05); } else u.m.rotation.set(time * 3, time * 2, 0);
        u.trail.visible = u.body.visible && h.fall > .02 && h.kind !== 'jelly'; u.trail.position.y = u.body.position.y + 2; u.trail.scale.set(2.6, 4.5, 1);
        const b = h.boom; u.boom.forEach((s, k) => { s.visible = b > 0; if (!s.visible) return; s.scale.setScalar(h.r * (1.5 + b * [3.5, 5, 2][k])); s.position.y = 1 + b * [1, 3, .5][k]; s.material.opacity = (1 - b) * [1, .7, 1][k]; });
      } else if (h.type === 'cross') {
        const lift = h.kind === 'whale' || h.kind === 'hovercar' ? 0 : ['rhino', 'gummy', 'wave', 'turtle', 'eel'].includes(h.kind) ? 0 : h.r;
        g.position.set(h.x, h.y + lift, h.z);
        g.rotation.y = h.heading;
        if (u.wheel) u.roller.children[0].userData.spin.rotation.z = -h.roll;
        else if (!u.walker) u.roller.rotation.x = h.roll;
        else { u.m.userData.anim(time, 1); if (h.kind === 'hovercar') u.roller.position.y = Math.sin(time * 4) * .15; }
        if (h.kind === 'whale') { u.roller.rotation.x = (h.u - .5) * 1.5; if (u.splash) { const near = h.u < .15 || h.u > .85; u.splash.visible = near; u.splash.position.set(0, -h.y + h.ground - .5, 0); } }
        if (u.spray) u.spray.forEach((d, k) => { const ph = (time * 1.6 + k / 4) % 1; d.position.set((k - 1.5) * 2.2, 3.2 + ph * 2, .4 - ph * 1.5); d.scale.setScalar(1 + ph * 2.5); d.material.opacity = (1 - ph) * .7; });
        if (u.dust) u.dust.forEach((d, k) => { const ph = (time * 2.2 + k / 3) % 1; d.position.set(0, -lift + .4 + ph * 1.2, -1.2 - ph * 2.5); d.scale.setScalar(.8 + ph * 2.2); d.material.opacity = (1 - ph) * .55; });
      } else if (h.type === 'zone') {
        g.position.set(h.x, h.y, h.z);
        if (u.flames) {
          u.glow.scale.setScalar(h.r * 1.2); u.glow.position.y = .06; u.glow.material.opacity = h.hot ? .35 : .1 + .2 * h.warn * (.5 + .5 * Math.sin(time * 14));
          u.flames.forEach((f, k) => { f.visible = h.hot || (h.warn > .5 && k === 0); const sc = h.hot ? h.r * (.8 + Math.sin(time * 16 + k * 2 + h.k) * .2) * (1 - Math.max(0, h.life - .8) * 5) * (k > 1 ? .7 : 1) : .9 * h.warn; f.scale.set(sc, sc * 1.6, 1); f.position.set(Math.sin(k * 2.1 + h.k) * h.r * .45, sc * .6 + (k > 1 ? sc * .5 : 0), Math.cos(k * 1.7 + h.k) * h.r * .45); });
        } else {
          // the kraken tentacle: rises at the road edge while warning, slams across its half of the road when hot
          const edge = h.side * (h.r * 2 + 3.5), up = h.hot ? Math.max(0, 1 - Math.max(0, h.life - .55) * 2.4) : h.warn;
          g.rotation.y = h.angle; g.visible = h.k === Math.floor(h.n / 2);
          u.m.position.set(edge - h.lane, -9 * (1 - up), 0); u.m.rotation.y = -h.side * Math.PI / 2;
          u.m.userData.bend(h.hot ? Math.min(1, h.life * 6) * 1.05 : .15 * h.warn, time);
          u.splash.visible = up > .05 && up < .98; u.splash.position.set(edge - h.lane, .6, 0);
        }
      }
    }
    for (const [id, g] of live) if (!seen.has(id)) { release(g); live.delete(id); }
  }
  function clear() { for (const g of live.values()) release(g); live.clear(); }
  return { update, clear };
}
