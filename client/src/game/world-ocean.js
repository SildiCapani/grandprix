import * as THREE from 'three';
import { bird, dolphin, person } from './critters.js';
import { jellyfish, turtle, eel, anglerfish, reefFish } from './ocean-critters.js';

// Season 4 – the ocean cup. Called from world-adventure.js with its helpers (h).
//   beach → Surfer-Bucht: sand, surf, a pleasure pier with Ferris wheel, lifeguard towers, surfers, a lighthouse on the cliff, beach town
//   reef  → Korallenriff: on the sea floor – caustic light, sun rays from the surface, corals, swaying kelp, fish schools, turtles, a wreck
//   abyss → Tiefsee-Graben: pitch-dark deep sea, a glowing road, black smokers, a giant anglerfish, glowing jellyfish, a submarine
export function buildOcean(h, theme) {
  const { group, track, W, r, inst, M, G, std, free, updaters, canvasTex, textPanel, glowTex, weather, at, fallY, fbm, add, shapedTerrain, terrainH, waterPlane, onLand, inWater, alongRoad, flock, sprite, roadStrip, striped } = h;
  const TAU = Math.PI * 2;
  const T = () => terrainH();
  ({ beach, reef, abyss })[theme]();

  // ===================================================================================== SURFER BAY
  function beach() {
    shapedTerrain({
      seabed: -15, cliff: .42, landR: W / 2 + 22,
      extra: [[-150, 168, -2.2, 34], [-40, 172, -2.2, 34], [60, 170, -2.2, 30], [-60, -205, 2.5, 75], [-190, -150, 2, 55], [150, -130, 9, 42], [60, -110, 5, 36], [300, 40, 1.5, 40]],
      paint: (c, hh, ny, d) => {
        const n = fbm(hh * 6, d * 2) * .5 + .5;
        if (hh < fallY - 2) c.setRGB(.82, .74, .54, THREE.SRGBColorSpace).multiplyScalar(.8);
        else if (hh < fallY + 3.2) c.setRGB(.95 - n * .04, .86 - n * .05, .62, THREE.SRGBColorSpace);   // bright sand
        else if (ny < .72) c.setRGB(.62, .55, .46, THREE.SRGBColorSpace);                                // cliff rock
        else if (d < W / 2 + 14) c.setRGB(.9 - n * .05, .82 - n * .05, .6, THREE.SRGBColorSpace);
        else c.setRGB(.55 + n * .1, .66 + n * .06, .36, THREE.SRGBColorSpace);
      },
    });
    const th = T();
    waterPlane(0x1ab0d0, { opacity: .8 });
    const deep = new THREE.Mesh(new THREE.RingGeometry(500, 1800, 64), new THREE.MeshBasicMaterial({ color: 0x0f6a98, transparent: true, opacity: .5, depthWrite: false }));
    deep.rotation.x = -Math.PI / 2; deep.position.y = fallY + .02; group.add(deep);
    // ---- shore foam: white lines that wash in and out along the beach ----
    {
      const foamTex = canvasTex(256, (g, s) => { g.clearRect(0, 0, s, s); for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(255,255,255,${.3 + r() * .6})`; g.beginPath(); g.ellipse(r() * s, s / 2 + (r() - .5) * s * .35, 4 + r() * 18, 2 + r() * 4, 0, 0, TAU); g.fill(); } }, 1);
      foamTex.wrapS = THREE.RepeatWrapping; foamTex.repeat.set(12, 1);
      const foams = [];
      for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(700, 9), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: .8 })); f.rotation.x = -Math.PI / 2; f.position.set(-20, fallY + .08, 196); group.add(f); foams.push([f, k * 2.1]); }
      updaters.push((dt, t) => foams.forEach(([f, ph]) => { const u = ((t * .18 + ph / 6) % 1); f.position.z = 214 - u * 26; f.material.opacity = Math.sin(u * Math.PI) * .85; foamTex.offset.x = t * .01; }));
    }
    // ---- palms along the promenade and in the town ----
    const trunk = std(0x9a7a52, { roughness: .9 }), frond = std(0x3f9a3a, { roughness: .7, side: THREE.DoubleSide }), frond2 = std(0x6ab84a, { roughness: .7, side: THREE.DoubleSide });
    const palm = (x, y, z, hgt) => {
      const lean = (r() - .5) * .4, dir = r() * TAU;
      for (let k = 0; k < 5; k++) { const f = k / 5, yy = hgt * (f + .1); inst(G.cylLow, trunk, M(x + Math.cos(dir) * lean * yy, y + yy, z + Math.sin(dir) * lean * yy, .3 - f * .1, hgt / 5 + .05, .3 - f * .1, 0, Math.sin(dir) * lean, -Math.cos(dir) * lean)); }
      const tx = x + Math.cos(dir) * lean * hgt, tz = z + Math.sin(dir) * lean * hgt;
      for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + r() * .3; inst(G.box, k % 2 ? frond : frond2, M(tx + Math.cos(a) * 1.8, y + hgt + .1, tz + Math.sin(a) * 1.8, 3.8, .06, .8, -a, 0, -.45)); }
    };
    alongRoad(22, 3.5, (x, y, z) => { if (th(x, z) < fallY + .8) return; palm(x, th(x, z), z, 8 + r() * 4); });
    onLand(120, 14, 420, 1.5, (x, y, z) => palm(x, y, z, 7 + r() * 5));
    // ---- the beach: umbrellas, towels, lifeguard towers, volleyball, sand castles ----
    const umbMats = [striped('#ff5a5a', '#ffffff', 8), striped('#3ab8ff', '#ffffff', 8), striped('#ffd04a', '#ff7a2a', 8), striped('#5ad86a', '#ffffff', 8)].map(m => new THREE.MeshStandardMaterial({ map: m, roughness: .7, side: THREE.DoubleSide }));
    const pole = std(0xf4f0e8), towel = [0xff6a8a, 0x5ad0ff, 0xffe06a, 0x9a7aff].map(c => std(c));
    for (let i = 0; i < 70; i++) {
      const x = -230 + r() * 330, z = 150 + r() * 26; if (!free(x, z, W / 2 + 4)) continue; const y = th(x, z); if (y < fallY + .3) continue;
      inst(G.cylLow, pole, M(x, y + 1.3, z, .06, 2.6, .06)); inst(G.cone, umbMats[i % 4], M(x, y + 2.7, z, 2, .75, 2, r() * TAU));
      inst(G.box, towel[i % 4], M(x + 1.3, y + .06, z + (r() - .5), 1, .05, 2, r()), { cast: false });
    }
    const red = std(0xe03030, { roughness: .6 }), white = std(0xf8f8f8, { roughness: .6 });
    for (const x of [-170, -60, 50]) {
      const z = 168, y = th(x, z);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) inst(G.cylLow, white, M(x + dx * 1.2, y + 1.8, z + dz * 1.2, .12, 3.6, .12));
      inst(G.box, red, M(x, y + 4.2, z, 3.2, 1.6, 3.2)); inst(G.roof, white, M(x, y + 5.6, z, 2.6, 1.2, 2.6));
      inst(G.box, white, M(x, y + 4.4, z + 1.62, 2, .6, .05));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .9), new THREE.MeshStandardMaterial({ color: 0xffd23a, side: THREE.DoubleSide })); add(flag, x + .7, y + 7.2, z); updaters.push((dt, t) => { flag.rotation.y = Math.sin(t * 3 + x) * .3; });
      inst(G.cylLow, white, M(x, y + 6.6, z, .05, 1.6, .05));
    }
    // volleyball court with players
    {
      const [cx, cz] = [-120, 172], cy = th(cx, cz);
      for (const sd of [-1, 1]) inst(G.cylLow, white, M(cx + sd * 5, cy + 1.3, cz, .08, 2.6, .08));
      const net = new THREE.Mesh(new THREE.PlaneGeometry(10, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .55, side: THREE.DoubleSide, wireframe: true })); add(net, cx, cy + 2.1, cz);
      const players = [];
      for (let k = 0; k < 4; k++) { const p = person([0xff4a3a, 0x3a8aff][k % 2], [0xf2c8a0, 0x8a5a3a, 0xd8a070, 0xf8dcc0][k], [0xffd23a, 0xffffff][k % 2]); p.scale.setScalar(1.25); group.add(p); players.push([p, k]); }
      const ball = add(new THREE.Mesh(G.sphere, std(0xffffff, { roughness: .4 })), cx, cy + 3, cz); ball.scale.setScalar(.22);
      updaters.push((dt, t) => {
        players.forEach(([p, k]) => { const side = k < 2 ? -1 : 1, x = cx + (k % 2 ? 1.8 : -1.8), z = cz + side * (2.5 + Math.sin(t * 1.5 + k) * .8); p.position.set(x, cy + Math.max(0, Math.sin(t * 3 + k) * .5), z); p.rotation.y = side > 0 ? Math.PI : 0; p.userData.arms.forEach(a => { a.rotation.x = -2.2 + Math.sin(t * 6 + k) * .3; }); });
        const u = (t * .45) % 1, side = Math.floor(t * .45) % 2 ? 1 : -1; ball.position.set(cx + Math.sin(t) * 1.2, cy + 2.4 + Math.sin(u * Math.PI) * 5, cz + side * (u * 6 - 3));
      });
    }
    const sandMat = std(0xe8cc90, { roughness: 1 });
    onLand(16, 8, 260, .2, (x, y, z) => { if (y > fallY + 2.6) return false; inst(G.cone, sandMat, M(x, y + .6, z, 1.2, 1.2, 1.2)); for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; inst(G.cyl, sandMat, M(x + Math.cos(a) * 1.3, y + .45, z + Math.sin(a) * 1.3, .35, .9, .35)); } });
    // ---- the pier: lamps, a Ferris wheel, a carousel, a roller-coaster loop ----
    alongRoad(16, 1.2, (x, y, z) => { inst(G.cylLow, white, M(x, y + 2, z, .08, 4, .08)); add(sprite(glowTex('rgba(255,240,200,1)', 'rgba(255,200,120,0)'), 0xfff0c8, 1.4), x, y + 4.1, z); inst(G.sphere, std(0xfff4d8, { emissive: 0xffe0a0, emissiveIntensity: .8 }), M(x, y + 4.05, z, .25, .25, .25)); }, { voids: true });
    {
      const fx = 220, fz = 318, fy = fallY + 3.5, R = 20, wheel = new THREE.Group();
      inst(G.box, std(0xd8c8a8), M(fx, fallY + 1.5, fz, 28, 1, 22));
      for (let i = 0; i < 6; i++) inst(G.cylLow, std(0x7a5a3a), M(fx - 12 + i * 5, fallY - 3, fz, .4, 9, .4));
      const rimM = std(0xff4a5a, { roughness: .4 }), spoke = std(0xffffff);
      for (const off of [-1.2, 1.2]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, .35, 8, 64), rimM); rim.position.z = off; wheel.add(rim); }
      for (let k = 0; k < 16; k++) { const sp = new THREE.Mesh(G.cylLow, spoke); sp.scale.set(.15, R, .15); sp.position.set(Math.cos(k / 16 * TAU) * R / 2, Math.sin(k / 16 * TAU) * R / 2, 0); sp.rotation.z = k / 16 * TAU - Math.PI / 2; wheel.add(sp); }
      const bulbs = new THREE.Mesh(new THREE.TorusGeometry(R + .5, .2, 4, 96), new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false })); wheel.add(bulbs);
      wheel.position.set(fx, fy + R + 3, fz); wheel.rotation.y = .5; group.add(wheel);
      for (const sd of [-1, 1]) inst(G.cyl, spoke, M(fx + Math.sin(.5) * sd * 2.4, fy + (R + 3) / 2, fz + Math.cos(.5) * sd * 2.4, .5, R + 4, .5, 0, 0, sd * .18));
      const cabCols = [0xff5a5a, 0xffd23a, 0x3ab8ff, 0x5ad86a, 0xff8ad8, 0xffffff].map(c => std(c, { roughness: .4 })), cabins = [];
      for (let k = 0; k < 12; k++) { const c = new THREE.Mesh(G.box, cabCols[k % 6]); c.scale.set(2, 2.2, 2.4); group.add(c); cabins.push(c); }
      updaters.push((dt, t) => { wheel.rotation.z = t * .1; bulbs.material.color.setHSL((t * .1) % 1, .9, .7); cabins.forEach((c, k) => { const a = t * .1 + k / 12 * TAU, lx = Math.cos(a) * R, ly = Math.sin(a) * R; c.position.set(fx + lx * Math.cos(.5), fy + R + 3 + ly - 1.4, fz - lx * Math.sin(.5)); }); });
      // carousel
      const cx = 255, cz = 330, car = new THREE.Group(); inst(G.box, std(0xd8c8a8), M(cx, fallY + 1.5, cz, 18, 1, 18));
      const roof = new THREE.Mesh(G.cone, new THREE.MeshStandardMaterial({ map: striped('#ff5a8a', '#ffffff', 12), side: THREE.DoubleSide })); roof.scale.set(7, 3, 7); roof.position.y = 7; car.add(roof);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, p = new THREE.Mesh(G.cylLow, std(0xffd23a, { metalness: .5 })); p.scale.set(.1, 5, .1); p.position.set(Math.cos(a) * 5, 3.3, Math.sin(a) * 5); car.add(p); const horse = new THREE.Mesh(G.box, cabCols[k % 6]); horse.scale.set(.6, 1, 1.8); horse.position.set(Math.cos(a) * 5, 2.4, Math.sin(a) * 5); horse.rotation.y = -a; car.add(horse); horse.userData.ph = k; }
      car.position.set(cx, fallY + 2, cz); group.add(car);
      updaters.push((dt, t) => { car.rotation.y = t * .5; car.children.forEach(o => { if (o.userData.ph !== undefined) o.position.y = 2.4 + Math.sin(t * 3 + o.userData.ph) * .5; }); });
    }
    // ---- the lighthouse on the cliff with a turning beam ----
    {
      const lx = 160, lz = -140, ly = th(lx, lz), stripes = new THREE.MeshStandardMaterial({ map: canvasTex(64, (g, s) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#e02a2a'; g.fillRect(0, k * s / 8, s, s / 8); } }, 1), roughness: .5 });
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.8, 26, 24), stripes); add(tower, lx, ly + 13, lz); tower.castShadow = true;
      inst(G.cyl, std(0x2a2e34, { metalness: .6 }), M(lx, ly + 27, lz, 3.4, .6, 3.4));
      add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 16), new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe08a, emissiveIntensity: 1.2, transparent: true, opacity: .8 })), lx, ly + 28.8, lz);
      inst(G.cone, std(0xe02a2a), M(lx, ly + 31.4, lz, 3, 2.4, 3));
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const beam = new THREE.Group(); for (const sd of [-1, 1]) { const b = new THREE.Mesh(new THREE.ConeGeometry(9, 120, 24, 1, true), beamMat); b.rotation.z = sd * Math.PI / 2; b.position.x = sd * 60; beam.add(b); }
      beam.position.set(lx, ly + 28.8, lz); group.add(beam);
      updaters.push((dt, t) => { beam.rotation.y = t * .6; });
      add(sprite(glowTex('rgba(255,250,220,1)', 'rgba(255,220,140,0)'), 0xfff0c0, 10), lx, ly + 28.8, lz);
    }
    // ---- beach town: colourful houses, an ice-cream stand, hotels behind the promenade ----
    {
      const walls = [0xffd8a8, 0xa8e0ff, 0xffb8c8, 0xd8f0b0, 0xfff0a0, 0xffffff].map(c => std(c, { roughness: .8 })), roofs = [0xe0603a, 0x3a8ad8, 0x2aa880].map(c => std(c));
      onLand(42, 14, 300, 2, (x, y, z) => { if (z > 60) return false; const w = 6 + r() * 4, hh = 4 + r() * 4, a = r() * TAU; inst(G.box, walls[Math.floor(r() * 6)], M(x, y + hh / 2, z, w, hh, w * .8, a)); inst(G.roof, roofs[Math.floor(r() * 3)], M(x, y + hh + 1.4, z, w * .8, 2.8, w * .75, a)); });
      const glassM = std(0x8ad8ff, { roughness: .1, metalness: .4 }), hotelM = std(0xf4f2ec, { roughness: .6 });
      for (let k = 0; k < 6; k++) { const [x, z] = [-220 + k * 52, 70 - (k % 2) * 12]; if (!free(x, z, 18)) continue; const y = th(x, z), hh = 22 + r() * 18; inst(G.box, hotelM, M(x, y + hh / 2, z, 18, hh, 12)); for (let f = 0; f < hh / 3.2 - 1; f++) inst(G.box, glassM, M(x, y + 2.2 + f * 3.2, z + 6.05, 16, 1.6, .1), { cast: false }); }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), new THREE.MeshBasicMaterial({ map: textPanel([['🍦 SURFER-EIS 🏄', 64, 64]], 512, 128, '#ffffff', '#ff4a8a', '#3ab8ff'), side: THREE.DoubleSide }));
      const [sx, sz] = at(-55, -(W / 2 + 9)); add(sign, sx, th(sx, sz) + 4, sz); sign.lookAt(at(-55, 0)[0], th(sx, sz) + 4, at(-55, 0)[1]);
    }
    // ---- surfers riding the swell, sailboats, dolphins, seagulls ----
    {
      const boardM = [0xffd23a, 0xff5a5a, 0x3ab8ff].map(c => std(c, { roughness: .3 })), surfers = [];
      for (let i = 0; i < 6; i++) { const g = new THREE.Group(), b = new THREE.Mesh(G.sphere, boardM[i % 3]); b.scale.set(.35, .08, 1.3); g.add(b); const p = person([0x2a2a3a, 0xff7a2a, 0x3ad8a0][i % 3], [0xf2c8a0, 0x8a5a3a, 0xd8a070][i % 3], 0x2a2a3a); p.position.y = .05; p.rotation.y = Math.PI / 2; p.userData.arms.forEach((a, k) => { a.rotation.z = k ? -1.2 : 1.2; }); g.add(p); group.add(g); surfers.push({ g, ph: i * 1.7, lane: 230 + (i % 3) * 22 }); }
      updaters.push((dt, t) => surfers.forEach(s => { const u = ((t * .03 + s.ph / 10) % 1), x = -300 + u * 600, z = s.lane + Math.sin(t * .8 + s.ph) * 6; s.g.position.set(x, fallY + .2 + Math.abs(Math.sin(t * 1.2 + s.ph)) * .5, z); s.g.rotation.set(Math.sin(t * 1.2 + s.ph) * .15, Math.PI / 2 + Math.sin(t * .8 + s.ph) * .4, 0); }));
      const sailM = std(0xffffff, { side: THREE.DoubleSide }), hullM = std(0x2a4a8a), boats = [];
      for (let i = 0; i < 5; i++) { const b = new THREE.Group(), hull = new THREE.Mesh(G.box, hullM); hull.scale.set(2.4, 1.2, 8); b.add(hull); const mast = new THREE.Mesh(G.cylLow, std(0xdddddd)); mast.scale.set(.12, 10, .12); mast.position.y = 5.5; b.add(mast); const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 1, -5)]), sailM); sail.geometry.computeVertexNormals(); b.add(sail); group.add(b); boats.push([b, i]); }
      updaters.push((dt, t) => boats.forEach(([b, i]) => { const a = t * .015 + i * 1.3, R = 420 + i * 40; b.position.set(Math.cos(a) * R, fallY + .4 + Math.sin(t + i) * .2, 300 + Math.sin(a) * 120); b.rotation.y = -a; b.rotation.z = Math.sin(t * .7 + i) * .06; }));
      const dolphins = []; for (let i = 0; i < 4; i++) { const d = dolphin(); d.scale.setScalar(1.2); group.add(d); dolphins.push([d, i]); }
      updaters.push((dt, t) => dolphins.forEach(([d, i]) => { const cyc = (t * .35 + i * .27) % 1, x = -150 + i * 80 + cyc * 30, z = 260 + i * 10, up = Math.sin(cyc * Math.PI); d.position.set(x, fallY - 1.5 + up * 4.5, z); d.rotation.set(-Math.cos(cyc * Math.PI) * .9, Math.PI / 2, 0); d.visible = up > .05; d.userData.anim(t * 2); }));
      flock(14, 0, 200, 120, 18, 32, 0xffffff, 1.1, .2);
    }
    weather(80, 0xffffff, .25, .2, 90, 30, 2);
  }

  // ===================================================================================== CORAL REEF (underwater)
  function reef() {
    shapedTerrain({
      seabed: -26, cliff: .35, landR: W / 2 + 40, rough: .9,
      extra: [[0, 0, -2, 120], [-120, 40, -1, 70], [100, -10, 0, 70], [60, -150, -4, 50]],
      carve: (x, z, hh) => { const d = Math.hypot(x - 232, z - 34); return d < 22 ? fallY - 10 + d * .2 : hh; },
      paint: (c, hh, ny, d) => {
        const n = fbm(hh * 9 + d, d * 3) * .5 + .5;
        if (ny < .7) c.setRGB(.42 + n * .08, .4 + n * .06, .5, THREE.SRGBColorSpace);
        else c.setRGB(.86 - n * .12, .8 - n * .1, .62 - n * .06, THREE.SRGBColorSpace);
      },
    });
    const th = T(), seabedMesh = group.children[group.children.length - 1];
    // ---- caustics dancing on the sea floor ----
    const caustic = canvasTex(256, (g, s) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(255,255,255,.9)';
      for (let k = 0; k < 70; k++) { g.lineWidth = 1 + r() * 3; g.beginPath(); const x = r() * s, y = r() * s, R = 10 + r() * 26; for (let a = 0; a <= TAU + .01; a += TAU / 7) { const rr = R * (.7 + r() * .5); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.stroke(); }
    }, 70, false);
    if (seabedMesh?.material) { const m = seabedMesh.material; m.emissive = new THREE.Color(0x5ac8e8); m.emissiveMap = caustic; m.emissiveIntensity = .55; m.needsUpdate = true; updaters.push((dt, t) => { caustic.offset.set(Math.sin(t * .23) * .08 + t * .004, Math.cos(t * .19) * .08); m.emissiveIntensity = .45 + Math.sin(t * 1.7) * .12; }); }
    // ---- the water surface far above, light shafts coming down ----
    {
      const sTex = canvasTex(256, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, '#d8fcff'); gr.addColorStop(1, '#2ab0d0'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let k = 0; k < 200; k++) { g.fillStyle = `rgba(255,255,255,${r() * .4})`; g.fillRect(r() * s, r() * s, 6 + r() * 20, 1 + r() * 2); } }, 30);
      const surf = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ map: sTex, side: THREE.DoubleSide, transparent: true, opacity: .75, fog: false })); surf.rotation.x = Math.PI / 2; surf.position.y = 62; group.add(surf);
      updaters.push((dt, t) => { sTex.offset.set(t * .006, t * .004); });
      const rayMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), rays = [];
      for (let i = 0; i < 46; i++) { const ray = new THREE.Mesh(new THREE.PlaneGeometry(6 + r() * 10, 90), rayMat); const a = r() * TAU, d = r() * 300; ray.position.set(Math.cos(a) * d, 18, Math.sin(a) * d); ray.rotation.set(.25, r() * TAU, .2); group.add(ray); rays.push([ray, r() * 9]); }
      updaters.push((dt, t) => { rays.forEach(([ray, ph]) => { ray.rotation.z = .2 + Math.sin(t * .2 + ph) * .1; }); rayMat.opacity = .06 + Math.sin(t * .5) * .02; });
    }
    // ---- corals: branching, fans, brain corals, tube sponges, anemones ----
    const coralCols = [0xff6a8a, 0xff9a3a, 0xb46aff, 0xffd23a, 0x3ad8c8, 0xff4a6a].map(c => std(c, { roughness: .6, emissive: c, emissiveIntensity: .12 }));
    const branch = (x, y, z, s, m) => { for (let k = 0; k < 7; k++) { const a = r() * TAU, tilt = .3 + r() * .5, hh = (1.5 + r() * 2) * s; inst(G.cylLow, m, M(x + Math.cos(a) * .4 * s, y + hh / 2 * Math.cos(tilt), z + Math.sin(a) * .4 * s, .18 * s, hh, .18 * s, a, Math.sin(a) * tilt, Math.cos(a) * tilt)); inst(G.sphere, m, M(x + Math.cos(a) * (.4 + Math.sin(tilt) * hh) * s * .5, y + hh * Math.cos(tilt), z + Math.sin(a) * (.4 + Math.sin(tilt) * hh) * s * .5, .25 * s, .25 * s, .25 * s)); } };
    const fan = (x, y, z, s, m) => inst(G.sphere, m, M(x, y + 1.6 * s, z, 1.8 * s, 1.6 * s, .08 * s, r() * TAU));
    const brain = (x, y, z, s, m) => inst(G.ico, m, M(x, y + .3 * s, z, 1.3 * s, .9 * s, 1.3 * s, r() * TAU));
    const tube = (x, y, z, s, m) => { for (let k = 0; k < 4; k++) { const hh = (1.2 + r() * 2.2) * s; inst(G.cyl, m, M(x + (r() - .5) * 1.2 * s, y + hh / 2, z + (r() - .5) * 1.2 * s, .32 * s, hh, .32 * s)); } };
    onLand(1100, 7, 430, -30, (x, y, z) => { const m = coralCols[Math.floor(r() * coralCols.length)], s = 1.3 + r() * 2.2, k = r(); (k < .35 ? branch : k < .55 ? fan : k < .8 ? brain : tube)(x, y, z, s, m); });
    alongRoad(7, 1.4, (x, y, z) => { const m = coralCols[Math.floor(r() * coralCols.length)]; (r() < .5 ? brain : tube)(x, th(x, z), z, .45 + r() * .3, m); });
    const rockM = std(0x6a6478, { roughness: 1, flatShading: true });
    onLand(140, 10, 440, -30, (x, y, z) => { const s = 2 + r() * 6; inst(G.rock, rockM, M(x, y + s * .3, z, s, s * .7, s, r() * TAU, r(), r())); });
    // ---- kelp forest swaying in the current ----
    {
      const N = 230, kelpGeo = new THREE.CylinderGeometry(.25, .35, 1, 5, 6); kelpGeo.translate(0, .5, 0);
      const kelp = new THREE.InstancedMesh(kelpGeo, std(0x4a8a2a, { roughness: .7, emissive: 0x1a3a0a, emissiveIntensity: .3 }), N), spots = [];
      for (let i = 0; i < N * 6 && spots.length < N; i++) { const a = r() * TAU, d = 30 + r() * 260, x = -130 + Math.cos(a) * d * .7, z = -60 + Math.sin(a) * d * .7; if (!free(x, z, W / 2 + 3)) continue; spots.push([x, th(x, z), z, 10 + r() * 22, r() * 9]); }
      kelp.count = spots.length; group.add(kelp);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      updaters.push((dt, t) => { spots.forEach(([x, y, z, hh, ph], i) => { e.set(Math.sin(t * .8 + ph) * .14, 0, Math.cos(t * .6 + ph) * .14); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, sc.set(1, hh, 1)); kelp.setMatrixAt(i, m4); }); kelp.instanceMatrix.needsUpdate = true; });
    }
    // ---- a rock arch over the road and the sunken galleon ----
    {
      const s = track.sample(.62), y = track.heightAt(.62);
      const arch = add(new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 5, 3.4, 10, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6a6478, roughness: 1, flatShading: true })), s.x, y, s.z);
      arch.rotation.y = s.angle; arch.castShadow = true;
      for (let k = 0; k < 9; k++) inst(G.sphere, coralCols[k % 6], M(s.x + (r() - .5) * 8, y + W / 2 + 7 + r() * 2, s.z + (r() - .5) * 8, .8, .8, .8));
      const wx = 70, wz = -170, wy = th(wx, wz), wreck = new THREE.Group(), wood = std(0x5a4030, { roughness: .95 });
      const part = (sx, sy, sz, x, yy, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(G.box, wood); m.scale.set(sx, sy, sz); m.position.set(x, yy, z); m.rotation.set(rx, 0, rz); m.castShadow = true; wreck.add(m); };
      part(8, 4, 26, 0, 1.5, 0); part(6.5, 2, 22, 0, -.6, 0); part(8.4, 3, 7, 0, 4, -9); part(.5, 16, .5, 0, 9, 3, 0, .5); part(.5, 10, .5, 0, 6, -6, .3, -.4); part(7, .3, 5, 2, 12, 3, 0, .5);
      wreck.position.set(wx, wy + 1, wz); wreck.rotation.set(.12, .8, .35); group.add(wreck);
      const chest = add(new THREE.Mesh(G.box, std(0x8a5a2a)), wx + 9, wy + .6, wz + 4); chest.scale.set(2, 1.2, 1.3);
      add(sprite(glowTex('rgba(255,230,120,1)', 'rgba(255,180,40,0)'), 0xffd860, 5), wx + 9, wy + 1.6, wz + 4);
    }
    // ---- life: fish schools, turtles, a manta ray, a whale shark, jellyfish ----
    {
      const schools = [], fishCols = [[0xffa020, 0xffffff], [0x3ab8ff, 0xffe04a], [0xff5a8a, 0xffffff], [0xffe04a, 0x2a2a3a]];
      for (let s = 0; s < 7; s++) { const cx = (r() - .5) * 400, cz = (r() - .5) * 400, list = []; const [a, b] = fishCols[s % 4]; for (let i = 0; i < 18; i++) { const f = reefFish(a, b); f.scale.setScalar(1.2 + r() * .5); group.add(f); list.push([f, r() * TAU, (r() - .5) * 5, (r() - .5) * 4]); } schools.push({ cx, cz, R: 18 + r() * 30, y: 6 + r() * 14, sp: (.12 + r() * .1) * (r() < .5 ? -1 : 1), list }); }
      updaters.push((dt, t) => schools.forEach(sc => { const a0 = t * sc.sp; sc.list.forEach(([f, ph, dy, dr]) => { const a = a0 + ph * .08; f.position.set(sc.cx + Math.cos(a) * (sc.R + dr), sc.y + dy + Math.sin(t * 2 + ph) * .3, sc.cz + Math.sin(a) * (sc.R + dr)); f.rotation.y = -a + (sc.sp > 0 ? Math.PI : 0); f.rotation.z = Math.sin(t * 9 + ph) * .1; }); }));
      const turtles = []; for (let i = 0; i < 6; i++) { const tt = turtle(); tt.scale.setScalar(2 + r()); group.add(tt); turtles.push([tt, r() * TAU, 60 + r() * 220, 8 + r() * 16, .05 + r() * .04]); }
      updaters.push((dt, t) => turtles.forEach(([tt, ph, R, y, sp]) => { const a = ph + t * sp; tt.position.set(Math.cos(a) * R, y + Math.sin(t * .5 + ph) * 2, Math.sin(a) * R); tt.rotation.y = -a; tt.userData.anim(t, .7); }));
      const mantaM = std(0x2a3a5a, { roughness: .6, side: THREE.DoubleSide }), manta = new THREE.Group(), wingL = new THREE.Mesh(G.sphere, mantaM), wingR = new THREE.Mesh(G.sphere, mantaM);
      wingL.scale.set(5, .25, 2.4); wingL.position.x = -3.5; wingR.scale.set(5, .25, 2.4); wingR.position.x = 3.5; const mb = new THREE.Mesh(G.sphere, mantaM); mb.scale.set(2.2, .7, 4); manta.add(wingL, wingR, mb); group.add(manta);
      updaters.push((dt, t) => { const a = t * .04; manta.position.set(Math.cos(a) * 180, 26 + Math.sin(t * .3) * 4, Math.sin(a) * 140); manta.rotation.y = -a; wingL.rotation.z = Math.sin(t * 1.4) * .35; wingR.rotation.z = -Math.sin(t * 1.4) * .35; });
      const sharkM = new THREE.MeshStandardMaterial({ map: canvasTex(128, (g, s) => { g.fillStyle = '#2a3a4a'; g.fillRect(0, 0, s, s); g.fillStyle = '#e8eef4'; for (let k = 0; k < 140; k++) { g.beginPath(); g.arc(r() * s, r() * s, 1.5 + r() * 2.5, 0, TAU); g.fill(); } }, 1), roughness: .7 });
      const shark = new THREE.Group(), sb = new THREE.Mesh(G.sphere, sharkM); sb.scale.set(4, 3.4, 16); shark.add(sb); const tail = new THREE.Mesh(G.box, sharkM); tail.scale.set(.6, 8, 3); tail.position.z = -16; shark.add(tail); const fin = new THREE.Mesh(G.cone, sharkM); fin.scale.set(1, 4, 3); fin.position.set(0, 4, 0); shark.add(fin); group.add(shark);
      updaters.push((dt, t) => { const a = t * .025 + 2; shark.position.set(Math.cos(a) * 300, 40, Math.sin(a) * 260); shark.rotation.y = -a; tail.rotation.y = Math.sin(t * 1.2) * .3; });
      const jellies = []; for (let i = 0; i < 16; i++) { const j = jellyfish([0xff8ae8, 0x8ae8ff, 0xc89aff][i % 3]); j.scale.setScalar(1 + r() * 1.4); const a = r() * TAU, d = 40 + r() * 300; j.position.set(Math.cos(a) * d, 10 + r() * 30, Math.sin(a) * d); group.add(j); jellies.push([j, r() * 9, j.position.y]); }
      updaters.push((dt, t) => jellies.forEach(([j, ph, y]) => { j.position.y = y + Math.sin(t * .4 + ph) * 3; j.userData.anim(t + ph); }));
    }
    // ---- start gate: a coral arch with glowing pearls ----
    {
      const s = track.sample(30 / track.length), y = track.heightAt(30 / track.length);
      const gate = add(new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 2.5, 1, 10, 40, Math.PI), std(0xff6a8a, { emissive: 0xff3a6a, emissiveIntensity: .4 })), s.x, y, s.z); gate.rotation.y = s.angle;
      for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; add(sprite(glowTex('rgba(255,255,255,1)', 'rgba(180,240,255,0)'), 0xe8fcff, 2.2), s.x + s.nx * Math.cos(a) * (W / 2 + 2.5), y + Math.sin(a) * (W / 2 + 2.5) + 1, s.z + s.nz * Math.cos(a) * (W / 2 + 2.5)); }
    }
    weather(420, 0xd8fcff, .35, -2.2, 80, 34, .9);  // rising bubbles
    weather(260, 0xbfe8d8, .18, .25, 80, 34, 1.4);  // drifting plankton
  }

  // ===================================================================================== DEEP-SEA TRENCH
  function abyss() {
    // ---- the glowing road: neon edges, a glass underside and light pulses along the edges ----
    const neonA = new THREE.MeshBasicMaterial({ color: 0x3af4e0, toneMapped: false, side: THREE.DoubleSide }), neonB = new THREE.MeshBasicMaterial({ color: 0x5aa8ff, toneMapped: false, side: THREE.DoubleSide });
    for (const sd of [-1, 1]) { roadStrip(sd * (W / 2 + .05), sd * (W / 2 + .45), .07, sd > 0 ? neonA : neonB); roadStrip(sd * (W / 2 + .5), sd * (W / 2 + .5), -1.1, new THREE.MeshBasicMaterial({ color: 0x053a44, transparent: true, opacity: .6, side: THREE.DoubleSide, toneMapped: false })); }
    const underTex = canvasTex(256, (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(40,220,210,.75)'); gr.addColorStop(.5, 'rgba(5,40,60,.4)'); gr.addColorStop(1, 'rgba(40,220,210,.75)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 1);
    roadStrip(-W / 2 - .45, W / 2 + .45, -.9, new THREE.MeshBasicMaterial({ map: underTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    const pulses = []; for (let k = 0; k < 36; k++) { const p = sprite(glowTex('rgba(255,255,255,1)', 'rgba(60,240,220,0)'), k % 2 ? 0x5af4e0 : 0x7ab8ff, 2.2); group.add(p); pulses.push({ p, u: r(), side: k % 2 ? 1 : -1, sp: .01 + r() * .01 }); }
    updaters.push((dt, t) => { neonA.color.setHSL(.47 + Math.sin(t * .6) * .03, 1, .55 + Math.sin(t * 2) * .08); for (const q of pulses) { q.u = (q.u + q.sp * dt) % 1; const s = track.sample(q.u), y = track.heightAt(q.u); q.p.position.set(s.x + s.nx * q.side * (W / 2 + .3), y + .4, s.z + s.nz * q.side * (W / 2 + .3)); q.p.visible = !track.inGap(q.u); } });
    // ---- the trench: rock walls far to both sides, the sea floor deep below with glowing cracks ----
    {
      const rockM = std(0x1a2028, { roughness: 1, flatShading: true }), n = 520, im = new THREE.InstancedMesh(G.rock, rockM, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let k = 0;
      for (let i = 0; i < n * 3 && k < n; i++) { const a = r() * TAU, d = 300 + r() * 320, x = Math.cos(a) * d, z = Math.sin(a) * d * .9, s = 20 + r() * 50, y = -90 + r() * 140; if (!free(x, z, s * 1.6 + 25)) continue; e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (1 + r()), s)); im.setMatrixAt(k++, m4); }
      im.count = k; group.add(im);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1), new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 1, emissive: 0xff5a10, emissiveMap: canvasTex(256, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(255,140,40,.9)'; for (let c = 0; c < 26; c++) { g.lineWidth = .5 + r() * 2; g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (r() - .5) * 40; y += (r() - .5) * 40; g.lineTo(x, y); } g.stroke(); } }, 16), emissiveIntensity: .8 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -95; group.add(floor);
    }
    // ---- black smokers: chimneys with glowing bases, dark smoke and bubbles rising ----
    {
      const chim = std(0x2a2422, { roughness: 1, flatShading: true }), hot = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }), smoke = glowTex('rgba(30,30,34,.9)', 'rgba(30,30,34,0)'), plumes = [];
      const vents = [[0, -60], [-60, -70], [70, -60], [-140, -60], [150, -30], [20, 40], [-80, 60], [100, 60]];
      vents.forEach(([x, z], i) => {
        const base = -60 - (i % 3) * 10, hgt = 30 + r() * 30;
        for (let k = 0; k < 4; k++) inst(G.cyl, chim, M(x + (r() - .5) * 3, base + hgt * (k + .5) / 4, z + (r() - .5) * 3, 3 - k * .55, hgt / 4 + .5, 3 - k * .55));
        add(new THREE.Mesh(G.sphere, hot), x, base + hgt, z).scale.setScalar(1.3);
        add(sprite(glowTex('rgba(255,170,80,1)', 'rgba(255,60,0,0)'), 0xff8a3a, 14), x, base + hgt, z);
        for (let k = 0; k < 7; k++) { const p = sprite(smoke, 0xffffff, 8, false, .8); group.add(p); plumes.push([p, x, base + hgt, z, k / 7]); }
      });
      updaters.push((dt, t) => plumes.forEach(([p, x, y, z, ph]) => { const u = (t * .12 + ph) % 1; p.position.set(x + Math.sin(t * .4 + ph * 9) * u * 6, y + u * 60, z + Math.cos(t * .3 + ph * 7) * u * 6); p.scale.setScalar(6 + u * 22); p.material.opacity = (1 - u) * .75; }));
    }
    // ---- a giant anglerfish lurking beside the course, glowing jellyfish, a deep-sea eel, a whale skeleton ----
    {
      const fish = anglerfish(); fish.scale.setScalar(9); group.add(fish);
      const lureGlow = add(sprite(glowTex('rgba(200,255,255,1)', 'rgba(60,200,255,0)'), 0x9af8ff, 18), 0, 0, 0);
      updaters.push((dt, t) => { const a = t * .03; fish.position.set(Math.cos(a) * 150 - 20, -12 + Math.sin(t * .4) * 4, Math.sin(a) * 110 - 30); fish.rotation.y = -a + Math.PI; fish.userData.anim(t); lureGlow.position.copy(fish.localToWorld(new THREE.Vector3(0, 1.72, 1.16))); lureGlow.material.opacity = .7 + Math.sin(t * 4) * .3; });
      const jellies = [], cols = [0x3af4e0, 0xc06aff, 0x5aa8ff, 0xff6ad8];
      for (let i = 0; i < 26; i++) { const j = jellyfish(cols[i % 4]); j.scale.setScalar(1.2 + r() * 2.4); const a = r() * TAU, d = 40 + r() * 260; j.position.set(Math.cos(a) * d, -20 + r() * 50, Math.sin(a) * d); if (!free(j.position.x, j.position.z, W / 2 + 4)) j.position.y -= 20; group.add(j); jellies.push([j, r() * 9, j.position.y]); }
      updaters.push((dt, t) => jellies.forEach(([j, ph, y]) => { j.position.y = y + Math.sin(t * .35 + ph) * 4; j.userData.anim(t + ph); }));
      const e1 = eel(0x1a2a3a, 0x3af4e0); e1.scale.setScalar(5); group.add(e1);
      updaters.push((dt, t) => { const a = -t * .05 + 1; e1.position.set(Math.cos(a) * 260, 8 + Math.sin(t * .3) * 6, Math.sin(a) * 220); e1.rotation.y = -a - Math.PI / 2; e1.userData.anim(t, .6); });
      const bone = std(0xe8e4d8, { roughness: .7 }), wx = -150, wz = 40, wy = -40;
      for (let k = 0; k < 14; k++) { inst(G.cyl, bone, M(wx + k * 3.2, wy + 4, wz, .5, 1.4, .5, 0, 0, Math.PI / 2)); for (const sd of [-1, 1]) inst(G.cyl, bone, M(wx + k * 3.2, wy + 3, wz + sd * 4, .25, 9 - Math.abs(k - 6) * .4, .25, 0, sd * .9, 0)); }
      inst(G.sphere, bone, M(wx - 5, wy + 3, wz, 4, 2.6, 3.4));
    }
    // ---- a research submarine with search lights cruising past ----
    {
      const sub = new THREE.Group(), hull = new THREE.Mesh(G.sphere, std(0xffc020, { roughness: .4, metalness: .3 })); hull.scale.set(4, 4, 10); sub.add(hull);
      const tower = new THREE.Mesh(G.cyl, hull.material); tower.scale.set(1.6, 3, 3); tower.position.y = 4; sub.add(tower);
      const port = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: 0xbff8ff, toneMapped: false })); port.scale.set(2, 2, 1); port.position.z = 9.4; sub.add(port);
      const prop = new THREE.Mesh(G.box, std(0x8a8a8a, { metalness: .7 })); prop.scale.set(5, .5, .3); prop.position.z = -10.5; sub.add(prop);
      const beamM = new THREE.MeshBasicMaterial({ color: 0xd8fcff, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      for (const sd of [-1, 1]) { const b = new THREE.Mesh(new THREE.ConeGeometry(10, 70, 20, 1, true), beamM); b.rotation.x = -Math.PI / 2 - .3; b.position.set(sd * 3, -2, 44); sub.add(b); }
      group.add(sub);
      updaters.push((dt, t) => { const a = t * .02 + 3; sub.position.set(Math.cos(a) * 230, 50 + Math.sin(t * .2) * 5, Math.sin(a) * 200); sub.rotation.y = -a; prop.rotation.z = t * 8; });
    }
    // ---- bioluminescent plankton everywhere, marine snow drifting down ----
    {
      const N = 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color();
      for (let i = 0; i < N; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 600; pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = -80 + r() * 160; pos[i * 3 + 2] = Math.sin(a) * d; c.setHSL(.45 + r() * .2, 1, .55 + r() * .2); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), toneMapped: false }));
      pts.frustumCulled = false; group.add(pts); updaters.push((dt, t) => { pts.material.opacity = .55 + Math.sin(t * .8) * .25; pts.rotation.y = t * .004; });
    }
    weather(500, 0xd8e8f0, .22, .6, 80, 40, 1.2);
    weather(200, 0x9afcff, .3, -1.6, 70, 34, .8);
    // ---- start gate: two rings of light ----
    {
      const s = track.sample(30 / track.length), y = track.heightAt(30 / track.length);
      const gate = add(new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 3, .7, 12, 64), new THREE.MeshBasicMaterial({ color: 0x3af4e0, toneMapped: false })), s.x, y + 2, s.z); gate.rotation.y = s.angle;
      const gate2 = add(new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 4.4, .3, 8, 64), new THREE.MeshBasicMaterial({ color: 0x5aa8ff, toneMapped: false })), s.x, y + 2, s.z); gate2.rotation.y = s.angle;
      updaters.push((dt, t) => { gate.rotation.z = t * .4; gate2.rotation.z = -t * .6; });
    }
  }
}
