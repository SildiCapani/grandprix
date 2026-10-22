import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bird, person as cartoonPerson } from './critters.js';

// "Life" layer for every racing world: things that move around the course so no track feels empty.
//   everywhere: track marshals waving flags, fan zones that jump and cheer, flags flapping in the wind
//   per world:  boats, kites and a seaplane on the coast, tumbleweeds and vultures in the canyon,
//               a ski lift and skiers on the glacier, parrots, butterflies and fireflies in the woods,
//               a rocket launch on the moon, cranes and lanterns in the cherry valley, and more.
// Called from createWorld after the theme builder, with the same helpers.
export function buildLife(ctx) {
  const { group, track, W, r, inst, M, G, std, free, updaters, glowTex, theme, map } = ctx;
  if (map.arena) return;
  const TAU = Math.PI * 2, L = track.length;
  const add = (o, x, y, z) => { o.position.set(x, y, z); group.add(o); return o; };
  const sprite = (tex, color, size, additive = true) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false })); s.scale.setScalar(size); return s; };
  const roadY = t => track.heightAt(t);
  const S3 = ['pirate', 'candy', 'castle', 'arctic', 'rooftops', 'galaxy'];
  const elevatedOnly = ['space', 'sky', 'galaxy'];

  // ---------- cloth that flaps in the wind (one shared time uniform for every flag) ----------
  const wind = { value: 0 };
  updaters.push((dt, t) => { wind.value = t; });
  function clothMat(color, map) {
    const m = new THREE.MeshStandardMaterial({ color, map: map || null, side: THREE.DoubleSide, roughness: .8 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = clamp(uv.x, 0.0, 1.0);
        transformed.z += sin(uv.x * 7.0 - uWind * 7.0 + position.y * 2.0) * 0.18 * k;
        transformed.y += sin(uv.x * 5.0 - uWind * 5.0) * 0.05 * k;`);
    };
    m.customProgramCacheKey = () => 'cloth';
    return m;
  }
  const flagGeo = new THREE.PlaneGeometry(1.6, 1, 12, 4); flagGeo.translate(.8, 0, 0);
  const checker = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const flagCols = [0xff4a3a, 0xffd04a, 0x3ab8ff, 0x5ad86a, 0xff7ac2, 0xffffff];
  const flagMats = flagCols.map(c => clothMat(c)), checkerMat = clothMat(0xffffff, checker);
  const pole = std(0xd8dce2, { metalness: .6, roughness: .35 });
  function flag(x, y, z, h = 6, m = flagMats[Math.floor(r() * flagMats.length)], size = 1) {
    inst(G.cylLow, pole, M(x, y + h / 2, z, .07, h, .07));
    const f = new THREE.Mesh(flagGeo, m); f.position.set(x, y + h - .6 * size, z); f.scale.setScalar(size); f.rotation.y = r() * TAU; f.castShadow = true; group.add(f);
    return f;
  }

  // ---------- people: marshals with flags and cheering fan zones ----------
  // People are cartoon figures from critters.js (one merged body + two arms each, so a crowd stays cheap).
  const skin = [0xf2c8a0, 0xd8a070, 0x8a5a3a, 0xf8dcc0];
  const shirts = [0xff4a3a, 0x3ab8ff, 0xffd04a, 0x5ad86a, 0xff7ac2, 0xffffff, 0x9a7aff, 0xff9a3a];
  const orange = 0xff7a1a;
  const person = (shirt, sk) => cartoonPerson(shirt, sk, shirt === orange ? 0xffd04a : null);
  // Marshals: orange vests, one arm waving a flag back and forth. Spaced around the lap on land.
  const marshals = [];
  if (!elevatedOnly.includes(theme)) for (let d = 120; d < L; d += 260) {
    const t = d / L; if (track.inGap(t) || track.inVoid?.(t)) continue;
    const s = track.sample(t), side = (Math.floor(d / 260) % 2) ? 1 : -1, off = W / 2 + 3.2, x = s.x + s.nx * side * off, z = s.z + s.nz * side * off;
    if (!free(x, z, W / 2 + 2)) continue;
    const m = person(orange, skin[Math.floor(r() * skin.length)]); m.position.set(x, roadY(t) - .05, z); m.rotation.y = Math.atan2(-s.nx * side, -s.nz * side); group.add(m);
    const f = new THREE.Mesh(flagGeo, [flagMats[1], flagMats[2], checkerMat][Math.floor(r() * 3)]); f.scale.setScalar(.45); f.position.set(0, -.55, .05); m.userData.arms[1].add(f);
    marshals.push({ m, ph: r() * 9 });
  }
  updaters.push((dt, t) => marshals.forEach(({ m, ph }) => { const a = m.userData.arms; a[1].rotation.z = Math.PI * .85 + Math.sin(t * 5 + ph) * .55; a[0].rotation.z = -.2; }));

  // Fan zones: a fence and a crowd that jumps, cheers and waves flags, at a few corners.
  const fans = [];
  if (!elevatedOnly.includes(theme)) {
    const fence = std(0xe8e8e0, { roughness: .6 });
    const spots = [];
    for (let k = 0; k < 6; k++) {
      const t = (k + .35) / 6, s = track.sample(t); if (track.inGap(t) || track.inVoid?.(t) || roadY(t) > 3) continue;
      const bend = track.curvature(t, 30), side = bend > 0 ? -1 : 1, off = W / 2 + 9;
      const cx = s.x + s.nx * side * off, cz = s.z + s.nz * side * off;
      if (!free(cx, cz, W / 2 + 6)) continue;
      spots.push({ s, side, cx, cz, t });
    }
    for (const sp of spots) {
      const { s, side, cx, cz, t } = sp, y = roadY(t), face = Math.atan2(-s.nx * side, -s.nz * side), tx = Math.sin(s.angle), tz = Math.cos(s.angle);
      inst(G.box, fence, M(cx - s.nx * side * 1.8, y + .55, cz - s.nz * side * 1.8, 16, 1.1, .12, s.angle + Math.PI / 2));
      for (let i = 0; i < 14; i++) {
        const along = (i % 7 - 3) * 1.9 + (r() - .5) * .5, back = Math.floor(i / 7) * 1.4 + r() * .3;
        const p = person(shirts[Math.floor(r() * shirts.length)], skin[Math.floor(r() * skin.length)]);
        p.position.set(cx + tx * along + s.nx * side * back, y, cz + tz * along + s.nz * side * back); p.rotation.y = face; group.add(p); p.traverse(o => { o.castShadow = false; });
        if (r() < .35) { const f = new THREE.Mesh(flagGeo, flagMats[Math.floor(r() * flagMats.length)]); f.scale.setScalar(.42); f.position.set(0, -.55, 0); p.userData.arms[0].add(f); }
        fans.push({ p, ph: r() * 9, base: y, hop: .5 + r() * .8 });
      }
    }
  }
  updaters.push((dt, t) => fans.forEach(f => { const k = Math.max(0, Math.sin(t * 6 * f.hop + f.ph)); f.p.position.y = f.base + k * .28; const a = f.p.userData.arms; a[0].rotation.z = Math.PI * .8 + Math.sin(t * 7 + f.ph) * .4; a[1].rotation.z = -Math.PI * .8 - Math.sin(t * 7 + f.ph + 1) * .4; }));

  // Flags along the straights (chequered at the start, colourful elsewhere).
  if (!elevatedOnly.includes(theme)) {
    for (let k = -2; k <= 2; k++) { const t = (k * 10 + L) % L / L, s = track.sample(t); for (const sd of [-1, 1]) { const x = s.x + s.nx * sd * (W / 2 + 2.2), z = s.z + s.nz * sd * (W / 2 + 2.2); if (free(x, z, W / 2 + 1.5)) flag(x, roadY(t), z, 6.5, checkerMat, 1.2); } }
    for (let d = 60; d < L; d += 55) { const t = d / L; if (track.inGap(t) || track.inVoid?.(t) || Math.abs(track.curvature(t, 20)) > .2) continue; const s = track.sample(t), sd = (Math.floor(d / 55) % 2) ? 1 : -1, x = s.x + s.nx * sd * (W / 2 + 4.5), z = s.z + s.nz * sd * (W / 2 + 4.5); if (free(x, z, W / 2 + 3)) flag(x, roadY(t), z, 5 + r() * 2); }
  }

  // ---------- small creatures ----------
  // Birds are cartoon models from critters.js (dark colour = vultures / crows).
  function flock(n, cx, cz, rad, y0, y1, color, size, speed = .25, flapRate = 9) {
    const dark = new THREE.Color(color).getHSL({}).l < .15, birds = [];
    for (let i = 0; i < n; i++) {
      const b = dark ? bird(0x3a2e30, 0x2a2224, 0x6a5a50) : bird(color, color, 0xffffff); b.scale.setScalar(size * 1.3); group.add(b);
      b.userData.f = { ph: r() * TAU, rad: rad * (.4 + r() * .7), y: y0 + (y1 - y0) * r(), sp: speed * (.7 + r() * .6) * (r() < .5 ? -1 : 1), ox: (r() - .5) * rad * .6, oz: (r() - .5) * rad * .6 };
      birds.push(b);
    }
    updaters.push((dt, t) => birds.forEach(b => { const u = b.userData.f, a = u.ph + t * u.sp; b.position.set(cx + u.ox + Math.cos(a) * u.rad, u.y + Math.sin(t * .7 + u.ph) * 2, cz + u.oz + Math.sin(a) * u.rad); b.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI); b.rotation.z = u.sp > 0 ? .3 : -.3; b.userData.anim(t + u.ph, flapRate); }));
  }
  // Butterflies: two coloured wings fluttering around a point near the road.
  const bflyGeo = (() => { const a = new THREE.CircleGeometry(.17, 10), c = new THREE.CircleGeometry(.11, 10); a.scale(1, 1.15, 1); a.translate(.16, .08, 0); c.translate(.12, -.13, 0); const g = mergeGeometries([a, c]); g.rotateX(-Math.PI / 2); return g; })();
  const bflyBody = new THREE.CapsuleGeometry(.03, .26, 3, 6); bflyBody.rotateX(Math.PI / 2); const bflyBodyMat = new THREE.MeshBasicMaterial({ color: 0x2a1a20 });
  function butterflies(n, colors) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const t = r(), s = track.sample(t), sd = r() < .5 ? -1 : 1, off = W / 2 + 3 + r() * 10, x = s.x + s.nx * sd * off, z = s.z + s.nz * sd * off;
      if (!free(x, z, W / 2 + 1)) continue;
      const m = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }), b = new THREE.Group();
      const w1 = new THREE.Mesh(bflyGeo, m), w2 = new THREE.Mesh(bflyGeo, m); w2.scale.x = -1; b.add(w1, w2, new THREE.Mesh(bflyBody, bflyBodyMat)); b.scale.setScalar(1.6); group.add(b);
      list.push({ b, w1, w2, x, z, y: roadY(t) + .8 + r(), ph: r() * 9 });
    }
    updaters.push((dt, t) => list.forEach(o => { o.b.position.set(o.x + Math.sin(t * .6 + o.ph) * 2, o.y + Math.sin(t * 1.7 + o.ph) * .5, o.z + Math.cos(t * .5 + o.ph) * 2); o.b.rotation.y = t * .6 + o.ph; const f = Math.sin(t * 18 + o.ph) * 1.1; o.w1.rotation.z = f; o.w2.rotation.z = -f; }));
  }
  // Fireflies / glowing spores: little lights drifting just above the ground.
  function fireflies(n, color, spread = 14) {
    const tex = glowTex('rgba(255,255,220,1)', 'rgba(255,240,120,0)'), list = [];
    for (let i = 0; i < n; i++) { const t = r(), s = track.sample(t), sd = r() < .5 ? -1 : 1, off = W / 2 + 2 + r() * spread; const sp = add(sprite(tex, color, .55), s.x + s.nx * sd * off, roadY(t) + 1, s.z + s.nz * sd * off); list.push({ sp, x: sp.position.x, z: sp.position.z, y: sp.position.y, ph: r() * 20 }); }
    updaters.push((dt, t) => list.forEach(o => { o.sp.position.set(o.x + Math.sin(t * .4 + o.ph) * 1.5, o.y + Math.sin(t * .9 + o.ph) * .6, o.z + Math.cos(t * .35 + o.ph) * 1.5); o.sp.material.opacity = .4 + .6 * Math.max(0, Math.sin(t * 2.2 + o.ph)); }));
  }
  // A hot-air balloon drifting slowly across the sky.
  function balloons(n, y0 = 60) {
    const stripes = ['#ff5a5a', '#ffd04a', '#39b8ff', '#7ad35a'].map(c => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#fff' : c; g.fillRect(k * 8, 0, 8, 64); } const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx; });
    const list = [];
    for (let i = 0; i < n; i++) { const b = new THREE.Group(), e = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 12), new THREE.MeshStandardMaterial({ map: stripes[i % 4], roughness: .6 })); e.scale.y = 1.2; e.position.y = 8; b.add(e); const k = new THREE.Mesh(G.box, std(0x8a6038)); k.scale.set(2, 1.4, 2); b.add(k); group.add(b); list.push({ b, a: r() * TAU, d: 250 + r() * 250, y: y0 + r() * 40, sp: .01 + r() * .01 }); }
    updaters.push((dt, t) => list.forEach(o => { const a = o.a + t * o.sp; o.b.position.set(Math.cos(a) * o.d, o.y + Math.sin(t * .3 + o.a) * 3, Math.sin(a) * o.d); o.b.rotation.y = t * .05; }));
  }

  // ---------- puffy cartoon clouds in daylight skies (one instanced draw call, no shadows) ----------
  if (['day', 'desert', 'jungle', 'savanna', 'forest', 'sakura', 'pirate', 'snow', 'colosseum', 'candy'].includes(theme) && G.puff) {
    const cloudMat = std(theme === 'candy' ? 0xfff0f8 : theme === 'desert' ? 0xfff0e0 : 0xffffff, { roughness: 1, emissive: theme === 'desert' ? 0xffc8a0 : 0xdfe8ff, emissiveIntensity: .45 });
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = 320 + r() * 520, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 70 + r() * 70, s = 12 + r() * 14, rot = r() * TAU;
      for (let k = 0; k < 4; k++) { const off = (k - 1.5) * s * .9, w = s * (k === 1 || k === 2 ? 1.25 : .85); inst(G.puff, cloudMat, M(cx + Math.cos(rot) * off, cy + (k === 1 || k === 2 ? s * .25 : 0), cz + Math.sin(rot) * off, w, w * .7, w * .9, rot), { cast: false }); }
    }
  }
  // ---------- per world ----------
  const sea = 205 + 60;
  ({
    day() {
      flock(24, 0, 120, 200, 18, 40, 0xf4f4f0, 1.6, .22);
      // speedboats crossing the bay with a wake, kites on the beach, a seaplane doing laps
      const hull = std(0xffffff, { roughness: .3 }), stripe = std(0xff4a3a), boats = [];
      for (let i = 0; i < 4; i++) { const b = new THREE.Group(), h = new THREE.Mesh(G.box, hull); h.scale.set(1.6, .7, 5); h.position.y = .3; b.add(h); const s2 = new THREE.Mesh(G.box, stripe); s2.scale.set(1.65, .2, 5.05); s2.position.y = .55; b.add(s2); const w = sprite(glowTex('rgba(255,255,255,.9)', 'rgba(255,255,255,0)'), 0xffffff, 4, false); w.position.set(0, .2, -3.5); b.add(w); group.add(b); boats.push({ b, z: sea + 40 + i * 70, ph: r() * 9, sp: 14 + r() * 8 }); }
      updaters.push((dt, t) => boats.forEach(o => { const x = ((t * o.sp + o.ph * 100) % 1600) - 800; o.b.position.set(x, Math.sin(t * 3 + o.ph) * .15, o.z); o.b.rotation.y = Math.PI / 2; o.b.rotation.z = Math.sin(t * 2 + o.ph) * .05; }));
      const kites = [];
      for (let i = 0; i < 5; i++) { const k = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4, 1), std([0xff4a3a, 0xffd04a, 0x3ab8ff, 0xff7ac2, 0x5ad86a][i])); k.scale.z = .15; group.add(k); kites.push({ k, x: -300 + i * 140 + r() * 40, z: 225, ph: r() * 9 }); }
      updaters.push((dt, t) => kites.forEach(o => { o.k.position.set(o.x + Math.sin(t * .6 + o.ph) * 5, 22 + Math.sin(t * .9 + o.ph) * 4, o.z + Math.cos(t * .5 + o.ph) * 3); o.k.rotation.z = Math.sin(t * 1.3 + o.ph) * .4; }));
      const plane = new THREE.Group(), pb = new THREE.Mesh(G.sphere, std(0xffd04a)); pb.scale.set(1.2, 1.2, 5); plane.add(pb); const wing = new THREE.Mesh(G.box, std(0xff4a3a)); wing.scale.set(12, .2, 1.8); wing.position.y = 1; plane.add(wing);
      for (const sd of [-1, 1]) { const fl = new THREE.Mesh(G.cyl, std(0xffffff)); fl.scale.set(.5, 4, .5); fl.rotation.x = Math.PI / 2; fl.position.set(sd * 2.2, -1.6, 0); plane.add(fl); }
      const prop = new THREE.Mesh(G.box, std(0x222222)); prop.scale.set(3, .2, .1); prop.position.z = 5.1; plane.add(prop); group.add(plane);
      updaters.push((dt, t) => { const a = t * .05; plane.position.set(Math.cos(a) * 380, 70 + Math.sin(t * .4) * 6, Math.sin(a) * 300 + 60); plane.rotation.y = -a; plane.rotation.z = .25; prop.rotation.z = t * 40; });
      butterflies(30, [0xffd04a, 0xff7ac2, 0xffffff]);
    },
    desert() {
      flock(8, 0, 0, 160, 45, 70, 0x2a2224, 2.6, .12, 3);
      // tumbleweeds rolling through the scenery
      const weed = new THREE.MeshStandardMaterial({ color: 0xa8865a, roughness: 1, wireframe: true }), list = [];
      for (let i = 0; i < 14; i++) { const w = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 1), weed); group.add(w); list.push({ w, z: -300 + r() * 600, x0: -400 + r() * 800, sp: 4 + r() * 4, ph: r() * 9 }); }
      updaters.push((dt, t) => list.forEach(o => { const x = ((o.x0 + t * o.sp) % 800 + 800) % 800 - 400; o.w.position.set(x, .9 + Math.abs(Math.sin(t * 3 + o.ph)) * .8, o.z + Math.sin(t * .5 + o.ph) * 6); o.w.rotation.z = -t * o.sp / .9; }));
      // dust devils: spinning translucent funnels wandering the plain
      const devil = new THREE.MeshBasicMaterial({ color: 0xd8b080, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide }), devils = [];
      for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(4, .6, 22, 16, 1, true), devil); group.add(d); devils.push({ d, a: r() * TAU, rad: 120 + r() * 200, ph: r() * 9 }); }
      updaters.push((dt, t) => devils.forEach(o => { const a = o.a + t * .03; o.d.position.set(Math.cos(a) * o.rad, 11, Math.sin(a) * o.rad); o.d.rotation.y = t * 4; o.d.scale.x = o.d.scale.z = 1 + Math.sin(t * 2 + o.ph) * .15; }));
      balloons(3, 70);
    },
    night() {
      fireflies(0, 0xffffff);
      // light show: drones forming moving lights and sweeping searchlights
      const dot = glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), drones = [];
      for (let i = 0; i < 60; i++) { const s = add(sprite(dot, 0xffffff, 2.2), 0, 0, 0); drones.push({ s, i }); }
      updaters.push((dt, t) => drones.forEach(o => { const a = o.i / 60 * TAU, shape = (Math.sin(t * .2) + 1) / 2, rad = 30 + 12 * Math.sin(a * 3 + t) * shape; o.s.position.set(Math.cos(a + t * .2) * rad, 110 + Math.sin(a * 2 + t * .7) * 14 * (1 - shape), -250 + Math.sin(a + t * .2) * rad); o.s.material.color.setHSL((o.i / 60 + t * .05) % 1, 1, .6); }));
      const lights = [];
      for (let i = 0; i < 6; i++) { const g = new THREE.ConeGeometry(12, 260, 20, 1, true); g.translate(0, 130, 0); const l = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: [0x9ad8ff, 0xff9ad8, 0xfff0b0][i % 3], transparent: true, opacity: .08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); const a = i / 6 * TAU; l.position.set(Math.cos(a) * 330, 0, Math.sin(a) * 300); group.add(l); lights.push([l, r() * 9]); }
      updaters.push((dt, t) => lights.forEach(([l, ph]) => { l.rotation.z = Math.sin(t * .3 + ph) * .45; l.rotation.x = Math.cos(t * .23 + ph) * .3; }));
    },
    volcano() {
      // fire birds circling the crater, lava bubbles popping near the road
      flock(10, 80, -400, 140, 60, 110, 0xff7a20, 2.4, .2, 4);
      const tex = glowTex('rgba(255,220,120,1)', 'rgba(255,60,0,0)'), pops = [];
      for (let i = 0; i < 26; i++) { const t = r(), s = track.sample(t), sd = r() < .5 ? -1 : 1, off = W / 2 + 6 + r() * 25, x = s.x + s.nx * sd * off, z = s.z + s.nz * sd * off; if (!free(x, z, W / 2 + 3)) continue; const p = add(sprite(tex, 0xff6a10, 1), x, .2, z); pops.push({ p, ph: r() * 5 }); }
      updaters.push((dt, t) => pops.forEach(o => { const k = ((t + o.ph) % 2.6) / 2.6; o.p.scale.setScalar(k < .25 ? k * 10 : Math.max(0, 2.5 - (k - .25) * 6)); o.p.position.y = .2 + (k < .25 ? 0 : (k - .25) * 3); }));
    },
    snow() {
      flock(10, 0, 0, 220, 50, 80, 0x3a2a1a, 2.4, .12, 3);
      // ski lift with moving gondolas up the mountain, skiers carving down
      const cable = std(0x2a2a2a), gond = std(0xff4a3a, { roughness: .4 }), A = new THREE.Vector3(-380, 10, -360), B = new THREE.Vector3(-140, 150, -620), dir = B.clone().sub(A), len = dir.length();
      const c = new THREE.Mesh(G.cyl, cable); c.scale.set(.15, len, .15); c.position.copy(A).add(B).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); group.add(c);
      for (let k = 0; k <= 4; k++) { const p = A.clone().lerp(B, k / 4); inst(G.cyl, std(0x8a8f96, { metalness: .6 }), M(p.x, p.y / 2 - 4, p.z, .5, p.y + 8, .5), { cast: false }); }
      const gs = []; for (let k = 0; k < 10; k++) { const g = new THREE.Mesh(G.box, gond); g.scale.set(2.4, 2.2, 2.2); group.add(g); gs.push({ g, u0: k / 10 }); }
      updaters.push((dt, t) => gs.forEach(o => { const u = (o.u0 + t * .01) % 1, p = A.clone().lerp(B, u); o.g.position.set(p.x, p.y - 2.5, p.z); }));
      const skiers = [];
      for (let i = 0; i < 6; i++) { const p = person(shirts[i], skin[0]); p.scale.setScalar(1.4); group.add(p); skiers.push({ p, ph: r() * 20, x0: -500 + r() * 300, z0: -500 - r() * 100 }); }
      updaters.push((dt, t) => skiers.forEach(o => { const k = ((t * .03 + o.ph) % 1); o.p.position.set(o.x0 + k * 200 + Math.sin(k * 40) * 8, 120 - k * 110, o.z0 + k * 180); o.p.rotation.y = Math.cos(k * 40) * .6 + .8; o.p.rotation.z = Math.sin(k * 40) * .3; }));
    },
    space() {
      // a UFO hopping between planets and passing satellites
      const ufo = new THREE.Group(), disc = new THREE.Mesh(G.sphere, std(0xc8ccd8, { metalness: .8, roughness: .2 })); disc.scale.set(6, 1.2, 6); ufo.add(disc);
      const dome = new THREE.Mesh(G.sphere, std(0x7af4ff, { emissive: 0x2a8aff, emissiveIntensity: .8, transparent: true, opacity: .8 })); dome.scale.set(2.6, 2, 2.6); dome.position.y = 1; ufo.add(dome);
      const lights = []; for (let k = 0; k < 8; k++) { const l = sprite(glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), 0xffffff, 1.6); const a = k / 8 * TAU; l.position.set(Math.cos(a) * 5.6, -.2, Math.sin(a) * 5.6); ufo.add(l); lights.push(l); }
      group.add(ufo);
      updaters.push((dt, t) => { ufo.position.set(Math.cos(t * .07) * 260, 60 + Math.sin(t * .5) * 15, Math.sin(t * .11) * 200); ufo.rotation.y = t * 1.5; lights.forEach((l, k) => l.material.color.setHSL(((k / 8) + t * .3) % 1, 1, .6)); });
    },
    jungle() {
      flock(16, 0, 60, 150, 20, 40, 0xff3a3a, 1.2, .3, 12); flock(14, -100, 0, 120, 18, 35, 0x3ab8ff, 1.2, .35, 12); flock(12, 100, -80, 120, 20, 38, 0xffd04a, 1.1, .3, 12);
      butterflies(40, [0x3ab8ff, 0xff7a20, 0xffd04a, 0xff4ad8]); fireflies(60, 0xd8ff7a, 16);
    },
    savanna() { flock(20, 0, 0, 220, 20, 45, 0x2a2a2a, 1.4, .25, 10); balloons(4, 55); butterflies(20, [0xffd04a, 0xffffff]); },
    forest() { butterflies(50, [0xffffff, 0xffd04a, 0xff9ad8, 0x9ad8ff]); fireflies(90, 0xf4ff9a, 14); flock(10, 0, 0, 160, 25, 45, 0x4a3a2a, 1.4, .25, 10); },
    sky() { flock(30, 0, 0, 260, 10, 50, 0xffffff, 1.8, .2); },
    sakura() {
      butterflies(30, [0xffffff, 0xff9ac8]); flock(8, 0, 0, 220, 30, 55, 0xffffff, 3, .1, 3);
      // floating paper lanterns rising slowly into the evening sky
      const tex = glowTex('rgba(255,200,120,1)', 'rgba(255,120,40,0)'), lan = [];
      for (let i = 0; i < 30; i++) { const s = add(sprite(tex, 0xffb060, 1.6), 0, 0, 0); lan.push({ s, x: -250 + r() * 500, z: -250 + r() * 500, ph: r() * 60 }); }
      updaters.push((dt, t) => lan.forEach(o => { const k = ((t + o.ph) % 60) / 60; o.s.position.set(o.x + Math.sin(t * .2 + o.ph) * 5, 5 + k * 140, o.z); o.s.material.opacity = k < .05 ? k * 20 : 1 - Math.max(0, k - .75) * 4; }));
    },
    moon() {
      // a rocket launch every half minute and a rover trundling about
      const rocket = new THREE.Group(), hullM = std(0xf4f4f4, { metalness: .3 }), red = std(0xd8342c);
      const h = new THREE.Mesh(G.cyl, hullM); h.scale.set(2.2, 22, 2.2); h.position.y = 11; rocket.add(h);
      const nose = new THREE.Mesh(G.cone, red); nose.scale.set(2.3, 6, 2.3); nose.position.y = 25; rocket.add(nose);
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(G.box, red); f.scale.set(.3, 5, 3); const a = k / 4 * TAU; f.position.set(Math.cos(a) * 2.6, 2.5, Math.sin(a) * 2.6); f.rotation.y = -a; rocket.add(f); }
      const flame = sprite(glowTex('rgba(255,240,180,1)', 'rgba(255,100,0,0)'), 0xffa040, 10); flame.position.y = -3; rocket.add(flame);
      const smoke = []; for (let k = 0; k < 12; k++) { const s = sprite(glowTex('rgba(255,255,255,.9)', 'rgba(255,255,255,0)'), 0xd8d8e0, 6, false); group.add(s); smoke.push(s); }
      rocket.position.set(-320, 0, -260); group.add(rocket); inst(G.box, std(0x6a6e78, { metalness: .5 }), M(-320, 1, -260, 14, 2, 14));
      updaters.push((dt, t) => { const k = (t % 32) / 32, up = k > .7 ? Math.pow((k - .7) / .3, 2) * 900 : 0; rocket.position.y = up; flame.visible = k > .66; flame.scale.setScalar(10 + Math.sin(t * 40) * 2);
        smoke.forEach((s, i) => { const u = ((t * .8 + i / 12) % 1); s.visible = k > .66 && k < .9; s.position.set(-320 + (Math.random() - .5) * u * 30, u * 12, -260 + (Math.random() - .5) * u * 30); s.scale.setScalar(6 + u * 20); s.material.opacity = (1 - u) * .6; }); });
      const rover = new THREE.Group(), rb = new THREE.Mesh(G.box, std(0xd8d8e0, { metalness: .5 })); rb.scale.set(3, 1.2, 4.2); rb.position.y = 1.4; rover.add(rb);
      const wheelsR = []; for (const [x, z] of [[-1.8, 1.4], [1.8, 1.4], [-1.8, -1.4], [1.8, -1.4]]) { const w = new THREE.Mesh(G.cyl, std(0x2a2a2a)); w.scale.set(.6, .5, .6); w.rotation.z = Math.PI / 2; w.position.set(x, .6, z); rover.add(w); wheelsR.push(w); }
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 3), std(0xffffff, { side: THREE.DoubleSide })); dish.position.set(0, 3, -1); rover.add(dish); group.add(rover);
      updaters.push((dt, t) => { const a = t * .04; rover.position.set(Math.cos(a) * 60 - 100, 0, Math.sin(a) * 40 + 40); rover.rotation.y = -a; dish.rotation.y = t; wheelsR.forEach(w => { w.rotation.x = t * 3; }); });
    },
  }[theme] || (() => {}))();
  if (S3.includes(theme)) return;
}
