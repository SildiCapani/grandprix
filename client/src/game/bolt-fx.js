import * as THREE from 'three';

// Lightning item: jagged bolts strike every shrunken kart from the sky, with a glowing core, a blue halo,
// side branches (no extra lights: adding lights would recompile every shader) and a ring of electric sparks. strike() for each victim, update(dt) per frame.
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const glowMat = new THREE.MeshBasicMaterial({ color: 0x6ab8ff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const ringGeo = new THREE.RingGeometry(.6, 1, 32); ringGeo.rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

function jagged(from, to, steps, spread) {
  const pts = [from.clone()];
  for (let i = 1; i < steps; i++) {
    const t = i / steps, p = from.clone().lerp(to, t), s = spread * Math.sin(t * Math.PI);
    p.x += (Math.random() - .5) * s; p.z += (Math.random() - .5) * s; p.y += (Math.random() - .5) * s * .2;
    pts.push(p);
  }
  pts.push(to.clone()); return pts;
}
function tube(points, r, mat) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', .05);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 3, r, 5, false), mat);
}

export function createBoltFx(scene) {
  const live = [];
  function strike(x, y, z) {
    const g = new THREE.Group(), top = new THREE.Vector3(x + (Math.random() - .5) * 6, y + 34, z + (Math.random() - .5) * 6), hit = new THREE.Vector3(x, y + .6, z);
    const main = jagged(top, hit, 14, 5);
    const core = coreMat.clone(), glow = glowMat.clone();
    g.add(tube(main, .16, core), tube(main, .6, glow));
    // two branches forking off the main channel
    for (let k = 0; k < 2; k++) {
      const a = main[3 + Math.floor(Math.random() * 6)], end = a.clone().add(new THREE.Vector3((Math.random() - .5) * 9, -6 - Math.random() * 6, (Math.random() - .5) * 9));
      const br = jagged(a, end, 6, 2.5); g.add(tube(br, .08, core), tube(br, .3, glow));
    }
    const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.position.set(x, y + .08, z); g.add(ring);
    scene.add(g);
    live.push({ g, core, glow, ring, t: 0 });
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i]; b.t += dt; const t = b.t;
      // flicker for a moment, then fade
      const on = t < .28 ? (Math.floor(t * 40) % 3 !== 1 ? 1 : .25) : Math.max(0, 1 - (t - .28) / .3);
      b.core.opacity = on; b.glow.opacity = .55 * on;
      const r = Math.min(1, t / .45); b.ring.scale.setScalar(.5 + r * 4.5); b.ring.material.opacity = Math.max(0, .9 * (1 - r));
      if (t > .65) { scene.remove(b.g); b.g.traverse(o => { if (o.geometry && o.geometry !== ringGeo) o.geometry.dispose(); if (o.material) o.material.dispose?.(); }); live.splice(i, 1); }
    }
  }
  function clear() { for (const b of live) scene.remove(b.g); live.length = 0; }
  return { strike, update, clear };
}
