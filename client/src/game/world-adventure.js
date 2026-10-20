import * as THREE from 'three';

// Season 3 worlds: the course runs over water / chocolate / an abyss, with open edges to fall off.
//   pirate → Piratenbucht: beach, a long pier, galleons firing cannons, a friendly kraken, dolphins, seagulls, Skull Island
//   candy  → Zuckerland: chocolate river and waterfall, lollipops, cupcakes, gummy bears, a candy Ferris wheel, sprinkles
//   castle → Drachenburg: cliffs over a misty abyss, a castle, a village with a windmill, torches, bats and a circling dragon
// Everything that moves is animated through ctx.updaters. The terrain is shaped by the course itself:
// flat land along the road, cliffs down to the sea / abyss, and nothing at all under the bridges.

export const ADVENTURE_THEMES = Object.freeze(['pirate', 'candy', 'castle', 'arctic', 'rooftops', 'galaxy']);

export function buildAdventure(ctx) {
  const { group, track, W, r, inst, M, G, std, free, updaters, canvasTex, clouds, speckle, textPanel, glowTex, weather, theme, at } = ctx;
  const fallY = track.fallY ?? -6;
  const TAU = Math.PI * 2;
  const fbm = (x, z) => Math.sin(x * .021 + Math.sin(z * .013) * 2) * .5 + Math.sin(z * .027 + x * .009) * .35 + Math.sin((x + z) * .061) * .15;
  const lerp = (a, b, k) => a + (b - a) * k;
  const add = (o, x, y, z) => { o.position.set(x, y, z); group.add(o); return o; };

  // ---------- terrain shaped by the course ----------
  let terrainH = () => fallY - 5;
  function shapedTerrain({ half = 470, step = 3.5, seabed, landR = W / 2 + 10, cliff = .8, extra = [], carve = null, paint, rough = .95 }) {
    const bucket = 16, B = new Map(), V = new Map();
    const put = (map, s) => { const k = Math.floor(s[0] / bucket) + ',' + Math.floor(s[1] / bucket); if (!map.has(k)) map.set(k, []); map.get(k).push(s); };
    const n0 = track.points.length;
    for (let i = 0; i < n0; i += 2) { const p = track.points[i]; put(track.inVoid(i / n0) ? V : B, [p.x, p.z, p.y, 0]); }
    for (const sc of track.shortcuts) for (const p of sc.pts) put(B, [p.x, p.z, p.y, 1.5]);
    const query = (map, x, z, reach) => {
      let best = 1e9, y = 0; const cx = Math.floor(x / bucket), cz = Math.floor(z / bucket), rr = Math.ceil(reach / bucket);
      for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) { const l = map.get((cx + i) + ',' + (cz + j)); if (!l) continue; for (const s of l) { const d = Math.hypot(s[0] - x, s[1] - z) - s[3]; if (d < best) { best = d; y = s[2]; } } }
      return [best, y];
    };
    const n = Math.round(half * 2 / step) + 1, geo = new THREE.PlaneGeometry(half * 2, half * 2, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, H = new Float32Array(pos.count), D = new Float32Array(pos.count);
    const reach = landR + 45;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), nz = fbm(x, z);
      let [dl, yl] = query(B, x, z, reach);
      // islands never reshape the ground right next to the road or a shortcut
      if (dl > W / 2 + 8) for (const e of extra) { const d = Math.hypot(e[0] - x, e[1] - z) - e[3]; if (d < dl) { dl = Math.max(d, W / 2 + 8); yl = e[2]; } }
      const R = landR + nz * 5, bump = Math.max(0, Math.min(1, (dl - W / 2 - 3) / 8)) * (.5 + nz * .9);
      let h = yl - .22 + bump - Math.max(0, dl - R) * cliff * (1 + .25 * nz);
      h = Math.max(h, seabed + nz * 2);
      if (carve) h = Math.min(h, carve(x, z, h));
      const [dv] = query(V, x, z, W / 2 + 10);
      if (dv < W / 2 + 9) h = Math.min(h, fallY - 1.2 - (W / 2 + 9 - dv) * .5);
      H[k] = h; D[k] = dl; pos.setY(k, h);
    }
    geo.computeVertexNormals();
    const col = new Float32Array(pos.count * 3), c = new THREE.Color(), nrm = geo.attributes.normal;
    for (let k = 0; k < pos.count; k++) { paint(c, H[k], nrm.getY(k), D[k], pos.getX(k), pos.getZ(k)); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough }));
    mesh.receiveShadow = true; group.add(mesh);
    terrainH = (x, z) => {
      const fx = (x + half) / step, fz = (z + half) / step, i = Math.floor(fx), j = Math.floor(fz);
      if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return seabed;
      const u = fx - i, v = fz - j, h00 = H[j * n + i], h10 = H[j * n + i + 1], h01 = H[(j + 1) * n + i], h11 = H[(j + 1) * n + i + 1];
      return lerp(lerp(h00, h10, u), lerp(h01, h11, u), v);
    };
    return terrainH;
  }
  // Random spots on dry land (above the water line), away from the road.
  function onLand(n, minD, maxR, minH, place, tries = 8) {
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      const x = (r() * 2 - 1) * maxR, z = (r() * 2 - 1) * maxR;
      if (!free(x, z, minD)) continue;
      const h = terrainH(x, z); if (h < fallY + minH) continue;
      if (place(x, h, z) !== false) placed++;
    }
  }
  function inWater(n, minD, maxR, place, tries = 8) {
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      const x = (r() * 2 - 1) * maxR, z = (r() * 2 - 1) * maxR;
      if (!free(x, z, minD) || terrainH(x, z) > fallY - 1.5) continue;
      if (place(x, z) !== false) placed++;
    }
  }
  function waveNormals(repeat) {
    return canvasTex(256, (g, s) => {
      const img = g.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const fx = x / s * TAU, fy = y / s * TAU;
        const dx = Math.cos(fx * 3 + fy * 2) * .5 + Math.cos(fx * 7 - fy * 5) * .25 + Math.cos(fx * 13 + fy * 11) * .12;
        const dy = Math.cos(fy * 4 - fx) * .5 + Math.cos(fy * 9 + fx * 6) * .25 + Math.cos(fy * 15 - fx * 12) * .12;
        const i = (y * s + x) * 4; img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, repeat, false);
  }
  function waterPlane(color, { opacity = .86, rough = .08, normal = .45, flow = [.004, .007], metal = .05, emissive = 0, size = 3200 } = {}) {
    const tex = waveNormals(size / 40);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, normalMap: tex, normalScale: new THREE.Vector2(normal, normal),
      transparent: opacity < 1, opacity, envMapIntensity: 1.3, emissive, emissiveIntensity: emissive ? .25 : 0 }));
    m.rotation.x = -Math.PI / 2; m.position.y = fallY; m.receiveShadow = true; group.add(m);
    updaters.push((dt, t) => tex.offset.set(t * flow[0], t * flow[1]));
    return m;
  }
  const sprite = (tex, color, size, additive = true, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false }));
    s.scale.set(size, size, 1); return s;
  };
  const flameTex = glowTex('rgba(255,240,180,1)', 'rgba(255,90,0,0)'), puffTex = glowTex('rgba(255,255,255,.95)', 'rgba(255,255,255,0)');
  // A flickering flame on top of a post.
  function flame(x, y, z, size = 1.4, color = 0xffb040) {
    const f = add(sprite(flameTex, color, size), x, y, z); const ph = r() * 10;
    updaters.push((dt, t) => { const k = 1 + Math.sin(t * 13 + ph) * .12 + Math.sin(t * 7.3 + ph * 2) * .08; f.scale.set(size * k, size * k * 1.25, 1); });
    return f;
  }
  // Road samples every `step` metres on land (not over bridges), with a side and an offset from the edge.
  function alongRoad(step, offset, fn, { voids = false } = {}) {
    for (let d = r() * step; d < track.length; d += step) {
      const t = d / track.length; if (!voids && track.inVoid(t)) continue; if (track.inGap(t)) continue;
      const s = track.sample(t);
      for (const side of [-1, 1]) {
        const x = s.x + s.nx * side * (W / 2 + offset), z = s.z + s.nz * side * (W / 2 + offset);
        if (!free(x, z, W / 2 + offset - 1)) continue;
        fn(x, track.heightAt(t), z, s, side, t);
      }
    }
  }
  // Birds / bats circling: thin V wings that flap.
  function flock(n, cx, cz, rad, y0, y1, color, size, speed = .25, flapRate = 9) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: .8, side: THREE.DoubleSide });
    const wingGeo = new THREE.PlaneGeometry(size, size * .38); wingGeo.translate(size / 2, 0, 0);
    const birds = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group(), l = new THREE.Mesh(wingGeo, mat), rr = new THREE.Mesh(wingGeo, mat);
      l.rotation.x = rr.rotation.x = -Math.PI / 2; rr.rotation.z = Math.PI;
      const body = new THREE.Mesh(G.sphere, mat); body.scale.set(size * .12, size * .1, size * .4); b.add(l, rr, body);
      b.userData = { ph: r() * TAU, rad: rad * (.4 + r() * .7), y: lerp(y0, y1, r()), sp: speed * (.7 + r() * .6) * (r() < .5 ? -1 : 1), l, rr, ox: (r() - .5) * rad * .6, oz: (r() - .5) * rad * .6 };
      group.add(b); birds.push(b);
    }
    updaters.push((dt, t) => birds.forEach(b => {
      const u = b.userData, a = u.ph + t * u.sp, x = cx + u.ox + Math.cos(a) * u.rad, z = cz + u.oz + Math.sin(a) * u.rad;
      b.position.set(x, u.y + Math.sin(t * .7 + u.ph) * 2, z); b.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI);
      const f = Math.sin(t * flapRate + u.ph) * .55; u.l.rotation.y = f; u.rr.rotation.y = -f;
    }));
  }
  const striped = (a, b, n = 8, diag = false) => canvasTex(128, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s); g.fillStyle = b;
    for (let k = 0; k < n; k++) { if (diag) { g.beginPath(); g.moveTo(k * s / n * 2 - s, 0); g.lineTo(k * s / n * 2 - s + s / n, 0); g.lineTo(k * s / n * 2 + s / n, s); g.lineTo(k * s / n * 2, s); g.fill(); } else if (k % 2) g.fillRect(k * s / n, 0, s / n, s); }
  }, 1);

  ({ pirate: buildPirate, candy: buildCandy, castle: buildCastle, arctic: buildArctic, rooftops: buildRooftops, galaxy: buildGalaxy })[theme]?.();

  // =====================================================================================
  function buildPirate() {
    shapedTerrain({
      seabed: -16, cliff: .55, landR: W / 2 + 13,
      extra: [[20, -40, 1.6, 26], [-95, 55, .6, 10], [110, 45, .4, 8], [430, 140, 5, 50], [-430, -240, 7, 60], [200, 400, 3, 45], [-260, 380, 4, 40], [420, -360, 6, 55]],
      paint: (c, h, ny, d) => {
        const n = fbm(h * 7, d * 3) * .5 + .5;
        if (h < fallY - 3) c.setRGB(.86, .78, .55, THREE.SRGBColorSpace).multiplyScalar(.75);
        else if (h < fallY + 2.1) c.setRGB(.86 - n * .05, .76 - n * .05, .55, THREE.SRGBColorSpace);
        else if (ny < .75) c.setRGB(.55, .5, .44, THREE.SRGBColorSpace);
        else c.setRGB(.36 + n * .1, .58 + n * .1, .26, THREE.SRGBColorSpace);
      },
    });
    waterPlane(0x1a86a8, { opacity: .82 });
    // deep blue beyond the shallows
    const deep = new THREE.Mesh(new THREE.RingGeometry(520, 1800, 64), new THREE.MeshBasicMaterial({ color: 0x0f5a80, transparent: true, opacity: .55, depthWrite: false }));
    deep.rotation.x = -Math.PI / 2; deep.position.y = fallY + .02; group.add(deep);

    // ---- palms, bushes, rocks on every island ----
    const trunk = std(0x8a6a48, { roughness: .9 }), frond = std(0x3f8d3a, { roughness: .7, side: THREE.DoubleSide }), frond2 = std(0x5aa83f, { roughness: .7, side: THREE.DoubleSide }), coco = std(0x5a4632);
    const palm = (x, y, z, h) => {
      const lean = (r() - .5) * .35, dir = r() * TAU;
      for (let k = 0; k < 5; k++) { const f = k / 5, yy = h * (f + .1); inst(G.cylLow, trunk, M(x + Math.cos(dir) * lean * yy, y + yy, z + Math.sin(dir) * lean * yy, .28 - f * .1, h / 5 + .05, .28 - f * .1, 0, Math.sin(dir) * lean, -Math.cos(dir) * lean)); }
      const tx = x + Math.cos(dir) * lean * h, tz = z + Math.sin(dir) * lean * h;
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + r() * .3; inst(G.box, k % 2 ? frond : frond2, M(tx + Math.cos(a) * 1.6, y + h + .1, tz + Math.sin(a) * 1.6, 3.4, .06, .7, -a, 0, -.45)); }
      inst(G.sphere, coco, M(tx, y + h, tz, .45, .45, .45));
    };
    onLand(260, 8, 460, .3, (x, y, z) => palm(x, y, z, 6 + r() * 5));
    const bush = std(0x3f7d34, { flatShading: true }), flower = [std(0xff5a8a), std(0xffd04a), std(0xff8a3a)];
    onLand(380, 6, 460, 1.4, (x, y, z) => { inst(G.ico, bush, M(x, y + .4, z, 1 + r() * 1.4, .8 + r(), 1 + r() * 1.4)); if (r() < .4) inst(G.sphere, flower[Math.floor(r() * 3)], M(x + .8, y + .5, z, .3, .3, .3), { cast: false }); });
    const rock = std(0x8a8178, { roughness: 1, flatShading: true });
    for (let i = 0; i < 90; i++) { const a = r() * TAU, d = 60 + r() * 420, x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 12)) continue; const h = terrainH(x, z); if (h > fallY + 1.5 || h < fallY - 6) continue; inst(G.rock, rock, M(x, fallY - .6, z, 1.5 + r() * 4, 1 + r() * 2.5, 1.5 + r() * 3, r() * 6)); }

    // ---- beach bar at the start: hut, umbrellas, tiki torches ----
    const straw = std(0xd8b46a, { roughness: 1, flatShading: true }), wood = std(0x7a5232, { roughness: .9 }), plank = std(0x9a6a40, { roughness: .9 });
    {
      const [hx, hz] = at(75, -(W / 2 + 12)), hy = terrainH(hx, hz);
      inst(G.box, wood, M(hx, hy + 1.6, hz, 9, 3.2, 6, 0)); inst(G.cone, straw, M(hx, hy + 4.4, hz, 7.5, 3, 6.5, Math.PI / 4));
      inst(G.box, plank, M(hx, hy + 1.1, hz + 3.6, 9.4, .3, 1.2));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.4), new THREE.MeshBasicMaterial({ map: textPanel([['☠ STRANDBAR ☠', 70, 64]], 512, 128, '#3a2416', '#ffd27a', '#c8402a'), side: THREE.DoubleSide }));
      add(sign, hx, hy + 3.6, hz); sign.lookAt(at(75, 0)[0], hy + 3.6, at(75, 0)[1]);
      const umb = [striped('#ff5a5a', '#ffffff', 8), striped('#3ab8ff', '#ffffff', 8), striped('#ffd04a', '#ff7a2a', 8)].map(m => new THREE.MeshStandardMaterial({ map: m, roughness: .7, side: THREE.DoubleSide }));
      for (let k = 0; k < 9; k++) {
        const [ux, uz] = at(40 + k * 11 + r() * 3, -(W / 2 + 6 + r() * 6)); if (!free(ux, uz, W / 2 + 4)) continue; const uy = terrainH(ux, uz);
        inst(G.cylLow, wood, M(ux, uy + 1.3, uz, .06, 2.6, .06)); inst(G.cone, umb[k % 3], M(ux, uy + 2.7, uz, 1.9, .7, 1.9), { cast: true });
        inst(G.box, std([0xff6a8a, 0x5ad0ff, 0xffe06a][k % 3]), M(ux + 1.2, uy + .08, uz, 1, .06, 2, r()), { cast: false });
      }
    }
    alongRoad(26, 2.2, (x, y, z) => { if (terrainH(x, z) < fallY + 1) return; inst(G.cylLow, wood, M(x, y + 1.1, z, .09, 2.2, .09)); inst(G.cyl, straw, M(x, y + 2.3, z, .22, .4, .22)); flame(x, y + 2.75, z, 1.2); });

    // ---- galleons in the bay: rocking, one sailing a lap, cannons firing ----
    const hullMat = std(0x5a3a22, { roughness: .8 }), hullDark = std(0x3a2414, { roughness: .8 }), goldMat = std(0xd8a838, { roughness: .4, metalness: .6 }), ironMat = std(0x26282c, { roughness: .5, metalness: .6 });
    const skullFlag = canvasTex(128, (g, s) => { g.fillStyle = '#111'; g.fillRect(0, 0, s, s); g.fillStyle = '#f4f0e0'; g.beginPath(); g.arc(64, 54, 24, 0, TAU); g.fill(); g.fillRect(50, 66, 28, 18); g.fillStyle = '#111'; g.beginPath(); g.arc(55, 52, 7, 0, TAU); g.arc(73, 52, 7, 0, TAU); g.fill(); g.fillRect(58, 76, 3, 8); g.fillRect(66, 76, 3, 8);
      g.strokeStyle = '#f4f0e0'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(26, 92); g.lineTo(102, 116); g.moveTo(102, 92); g.lineTo(26, 116); g.stroke(); }, 1);
    const sailTex = [canvasTex(128, (g, s) => { g.fillStyle = '#f2ead6'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(120,90,60,.12)'; for (let k = 0; k < 6; k++) g.fillRect(k * 22, 0, 2, s); }, 1),
      canvasTex(128, (g, s) => { g.fillStyle = '#262022'; g.fillRect(0, 0, s, s); g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(64, 56, 22, 0, TAU); g.fill(); g.fillStyle = '#262022'; g.beginPath(); g.arc(56, 54, 6, 0, TAU); g.arc(72, 54, 6, 0, TAU); g.fill(); }, 1)];
    const sailMats = sailTex.map(m => new THREE.MeshStandardMaterial({ map: m, roughness: .9, side: THREE.DoubleSide }));
    const flagMat = new THREE.MeshStandardMaterial({ map: skullFlag, side: THREE.DoubleSide, roughness: .8 });
    function galleon(scale, black) {
      const s = new THREE.Group(), flags = [];
      const part = (geo, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, 0); m.castShadow = true; s.add(m); return m; };
      part(G.box, hullMat, 0, .6, 0, 7, 3.2, 22); part(G.box, hullDark, 0, -.6, 0, 5.6, 1.6, 20);
      part(G.box, hullMat, 0, 2.6, -8.5, 7.2, 2.4, 6); part(G.box, goldMat, 0, 2.6, -11.55, 6, 1.6, .2);
      part(G.cone, hullMat, 0, .8, 12.4, 3.5, 4, 3.2, 0, Math.PI / 2);
      part(G.box, plank, 0, 2.25, 1, 6.6, .2, 18);
      for (let k = 0; k < 6; k++) for (const sd of [-1, 1]) part(G.cyl, ironMat, sd * 3.7, 1.2, -6 + k * 2.6, .28, 1.4, .28, 0, Math.PI / 2).rotation.z = Math.PI / 2;
      [[-5, 13], [2, 16], [9, 11]].forEach(([z, h], k) => {
        part(G.cylLow, wood, 0, 2 + h / 2, z, .25, h, .25);
        for (let j = 0; j < 2; j++) { const w = 7.5 - j * 1.8, sh = h * .3; const sail = part(G.box, sailMats[black ? 1 : 0], 0, 3.6 + h * (.25 + j * .36), z + .4, w, sh, .12); sail.userData.billow = true; }
        if (k === 1) part(G.cyl, wood, 0, 2 + h - 1.5, z, 1, .5, 1);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), flagMat); flag.position.set(0, 2 + h + .9, z - 1.2); s.add(flag); flags.push(flag);
      });
      const lantern = sprite(flameTex, 0xffc060, 1.6); lantern.position.set(0, 4.6, -11.8); s.add(lantern);
      s.scale.setScalar(scale); s.userData.flags = flags; return s;
    }
    const ships = [], puffs = [], balls = [];
    const shipSpots = [[75, 25, .3], [-120, -60, 1.9], [150, -10, -1.2]];
    shipSpots.forEach(([x, z, a], i) => { if (!free(x, z, 20)) return; const sh = galleon(1.1 + r() * .2, i === 1); sh.position.set(x, fallY + .3, z); sh.rotation.y = a; group.add(sh); ships.push({ sh, ph: r() * 9, x, z, a }); });
    // a smaller ship sailing a lap around the bay
    const cruiser = galleon(.8, false); group.add(cruiser);
    const shipwreck = galleon(1, true); shipwreck.rotation.set(.35, .8, .25); shipwreck.position.set(-300, fallY - 1.2, 40); group.add(shipwreck);
    for (let i = 0; i < 6; i++) { const p = sprite(puffTex, 0xffffff, 1, false, 0); group.add(p); puffs.push({ p, life: 0 }); const b = new THREE.Mesh(G.sphere, ironMat); b.scale.setScalar(.35); b.visible = false; group.add(b); balls.push({ b, life: 0 }); }
    let nextShot = 2;
    updaters.push((dt, t) => {
      for (const s of ships) { s.sh.position.y = fallY + .3 + Math.sin(t * .8 + s.ph) * .3; s.sh.rotation.z = Math.sin(t * .6 + s.ph) * .05; s.sh.rotation.x = Math.sin(t * .5 + s.ph) * .025; s.sh.userData.flags.forEach((f, k) => { f.rotation.y = Math.sin(t * 3 + k) * .35; }); }
      const ca = t * .03, cr = 70; cruiser.position.set(20 + Math.cos(ca) * cr, fallY + .25 + Math.sin(t) * .2, -40 + Math.sin(ca) * cr * .8); cruiser.rotation.y = -ca; cruiser.rotation.z = Math.sin(t * .7) * .06;
      cruiser.userData.flags.forEach((f, k) => { f.rotation.y = Math.sin(t * 3 + k) * .35; });
      if ((nextShot -= dt) <= 0 && ships.length) {
        nextShot = 2.5 + r() * 4; const s = ships[Math.floor(r() * ships.length)].sh, sd = r() < .5 ? -1 : 1;
        const wp = new THREE.Vector3(sd * 4.4, 1.3, -2 + r() * 6).applyMatrix4(s.matrixWorld), dir = new THREE.Vector3(sd, 0, 0).transformDirection(s.matrixWorld);
        const pf = puffs.find(p => p.life <= 0); if (pf) { pf.p.position.copy(wp); pf.life = 1.6; }
        const bl = balls.find(b => b.life <= 0); if (bl) { bl.b.position.copy(wp); bl.v = dir.multiplyScalar(26).add(new THREE.Vector3(0, 9, 0)); bl.life = 3; bl.b.visible = true; }
      }
      for (const pf of puffs) if (pf.life > 0) { pf.life -= dt; const k = 1.6 - pf.life; pf.p.scale.setScalar(1.5 + k * 5); pf.p.material.opacity = Math.max(0, pf.life / 1.6) * .8; pf.p.position.y += dt * .8; }
      for (const bl of balls) if (bl.life > 0) {
        bl.life -= dt; bl.v.y -= 14 * dt; bl.b.position.addScaledVector(bl.v, dt);
        if (bl.b.position.y < fallY) { bl.life = 0; bl.b.visible = false; const pf = puffs.find(p => p.life <= 0); if (pf) { pf.p.position.copy(bl.b.position); pf.p.position.y = fallY + .5; pf.life = 1.2; } }
      }
    });

    // ---- a friendly kraken waving its tentacles next to the pier ----
    {
      const kx = 175, kz = 30, purple = std(0x8a3aa8, { roughness: .5 }), pale = std(0xe8a0d8, { roughness: .6 });
      const tentacles = [];
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU, bx = kx + Math.cos(a) * 9, bz = kz + Math.sin(a) * 9, segs = [];
        for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(G.sphere, k % 3 === 2 ? pale : purple); const s = 1.5 - k * .14; m.scale.set(s, s * 1.15, s); m.castShadow = true; group.add(m); segs.push(m); }
        tentacles.push({ bx, bz, a, segs, ph: r() * TAU });
      }
      const head = add(new THREE.Mesh(G.sphere, purple), kx, fallY + 1.2, kz); head.scale.set(6, 4, 6);
      for (const sd of [-1, 1]) { const e = add(new THREE.Mesh(G.sphere, std(0xffffff)), kx + sd * 2.4, fallY + 3.4, kz + 4.4); e.scale.setScalar(1.3); const p = add(new THREE.Mesh(G.sphere, std(0x111111)), kx + sd * 2.4, fallY + 3.4, kz + 5.5); p.scale.setScalar(.6); }
      updaters.push((dt, t) => {
        head.position.y = fallY + 1 + Math.sin(t * .9) * .4;
        for (const tc of tentacles) {
          let x = tc.bx, y = fallY - .5, z = tc.bz;
          tc.segs.forEach((m, k) => {
            const bend = Math.sin(t * 1.4 + tc.ph + k * .5) * .5, up = 1.6 - k * .06;
            x += Math.cos(tc.a) * .5 + Math.cos(tc.a + Math.PI / 2) * bend * .6; z += Math.sin(tc.a) * .5 + Math.sin(tc.a + Math.PI / 2) * bend * .6; y += up * (1 - k * .05);
            m.position.set(x, y, z);
          });
        }
      });
    }
    // ---- dolphins jumping out of the water ----
    {
      const dMat = std(0x7a9ab8, { roughness: .35 }), belly = std(0xe0eaf2, { roughness: .4 }), dolphins = [];
      for (let i = 0; i < 5; i++) {
        const d = new THREE.Group(), b = new THREE.Mesh(G.sphere, dMat); b.scale.set(.8, .75, 2.6); d.add(b);
        const u = new THREE.Mesh(G.sphere, belly); u.scale.set(.65, .5, 2.2); u.position.y = -.25; d.add(u);
        const fin = new THREE.Mesh(G.cone, dMat); fin.scale.set(.15, .9, .6); fin.position.set(0, .8, -.2); fin.rotation.x = -.5; d.add(fin);
        const tail = new THREE.Mesh(G.box, dMat); tail.scale.set(1.8, .12, .6); tail.position.z = -2.6; d.add(tail);
        group.add(d); dolphins.push({ d, cx: -40 + r() * 140, cz: -110 + r() * 120, a: r() * TAU, ph: r() * 10 });
      }
      updaters.push((dt, t) => dolphins.forEach(o => {
        const k = ((t + o.ph) % 4.2) / 4.2, jump = k < .42, u = jump ? k / .42 : 0;
        const along = (t * .15 + o.ph) % TAU, x = o.cx + Math.cos(along) * 18, z = o.cz + Math.sin(along) * 18;
        o.d.position.set(x, fallY - 1.4 + (jump ? Math.sin(u * Math.PI) * 4.2 : -2), z); o.d.rotation.y = -along; o.d.rotation.x = jump ? (u - .5) * 1.6 : 0; o.d.visible = jump;
      }));
    }
    flock(26, 0, 40, 170, 16, 34, 0xf4f4f0, 1.6, .22);
    flock(10, 140, -200, 60, 20, 30, 0xf4f4f0, 1.4, .3);

    // ---- Skull Island: a skull rock with glowing eyes, a rock arch over the cave shortcut, treasure ----
    const sc = track.shortcuts[0];
    if (sc) {
      const mid = sc.pts[Math.floor(sc.pts.length * .5)], q = sc.pts[Math.floor(sc.pts.length * .55)], a = Math.atan2(q.x - mid.x, q.z - mid.z);
      const nx = Math.cos(a), nz = -Math.sin(a), rockMat = std(0xb8ac98, { roughness: 1, flatShading: true }), darkMat = std(0x1a1414, { roughness: 1 });
      // cave: rock walls along the corridor and a roof over its middle part
      const cave = std(0x9a8c7a, { roughness: 1, flatShading: true });
      for (let k = Math.floor(sc.pts.length * .3); k < sc.pts.length * .7; k += 2) {
        const p = sc.pts[k], o = sc.pts[Math.min(sc.pts.length - 1, k + 1)], aa = Math.atan2(o.x - p.x, o.z - p.z), cx = Math.cos(aa), cz = -Math.sin(aa);
        for (const sd of [-1, 1]) inst(G.rock, cave, M(p.x + cx * sd * (sc.width / 2 + 2.6), p.y + 2.5, p.z + cz * sd * (sc.width / 2 + 2.6), 3.2, 4.5 + r() * 2, 3.2, r() * 6));
        inst(G.rock, cave, M(p.x, p.y + 7.4, p.z, sc.width / 2 + 4, 2.4, 3.4, aa));
      }
      for (const sd of [-1, 1]) { const tx = mid.x + nx * sd * 7, tz = mid.z + nz * sd * 7; flame(tx, mid.y + 3, tz, 1.4); }
      // the skull rock next to the cave entry
      const e = sc.pts[Math.floor(sc.pts.length * .22)], sx = e.x + nx * 26, sz = e.z + nz * 26, sy = terrainH(sx, sz);
      const skull = add(new THREE.Mesh(G.ico, rockMat), sx, sy + 9, sz); skull.scale.set(11, 12, 10); skull.castShadow = true;
      const toward = Math.atan2(e.x - sx, e.z - sz), fx = Math.sin(toward), fz = Math.cos(toward), rx = Math.cos(toward), rz = -Math.sin(toward);
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff5a10, emissiveIntensity: 1 }); eyeMat.userData.live = true;
      for (const sd of [-1, 1]) { const ex = sx + fx * 8.6 + rx * sd * 3.6, ez = sz + fz * 8.6 + rz * sd * 3.6; const eye = add(new THREE.Mesh(G.sphere, darkMat), ex, sy + 11, ez); eye.scale.setScalar(2.6); const glow = add(new THREE.Mesh(G.sphere, eyeMat), ex + fx * .9, sy + 11, ez + fz * .9); glow.scale.setScalar(1.1); }
      const nose = add(new THREE.Mesh(G.cone, darkMat), sx + fx * 9.6, sy + 7.6, sz + fz * 9.6); nose.scale.set(1.2, 2, 1.2); nose.rotation.x = Math.PI;
      for (let k = -2; k <= 2; k++) inst(G.box, std(0xece4d0), M(sx + fx * 9 + rx * k * 1.5, sy + 3.6, sz + fz * 9 + rz * k * 1.5, 1.1, 2, .8, toward));
      updaters.push((dt, t) => { eyeMat.emissiveIntensity = 1.2 + Math.sin(t * 2) * .6; });
      // treasure chests with gold heaps and sparkles
      const chest = std(0x7a4a22), coin = std(0xffd23a, { roughness: .3, metalness: .7, emissive: 0x6a4a00, emissiveIntensity: .3 });
      for (let k = 0; k < 6; k++) {
        const p = sc.pts[Math.floor(sc.pts.length * (.15 + k * .13))]; const sd = k % 2 ? 1 : -1, x = p.x + nx * sd * (sc.width / 2 + 1.8), z = p.z + nz * sd * (sc.width / 2 + 1.8);
        inst(G.box, chest, M(x, p.y + .5, z, 1.6, 1, 1.1, r())); inst(G.box, goldMat, M(x, p.y + 1.02, z, 1.65, .12, 1.15));
        for (let j = 0; j < 7; j++) inst(G.cyl, coin, M(x + (r() - .5) * 2.4, p.y + .08, z + (r() - .5) * 2.4, .3, .06, .3, 0, r() * .4), { cast: false });
        add(sprite(glowTex('rgba(255,240,150,.9)', 'rgba(255,200,0,0)'), 0xffe080, 2.4), x, p.y + 1.5, z);
      }
    }
    // ---- the fort on the west island and a lighthouse on the bay islet ----
    {
      const stone = std(0xb8ae9c, { roughness: .95, flatShading: true }), roofRed = std(0xa8402a);
      const fx = -330, fz = -40, fy = terrainH(-300, -40) > fallY ? terrainH(-300, -40) : fallY;
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4, x = fx + Math.cos(a) * 26, z = fz + Math.sin(a) * 26; inst(G.cyl, stone, M(x, fallY + 6, z, 5, 16, 5)); inst(G.cone, roofRed, M(x, fallY + 16.5, z, 6, 6, 6)); }
      for (let k = 0; k < 4; k++) { const a = (k + .5) / 4 * TAU + .4, x = fx + Math.cos(a) * 18.4, z = fz + Math.sin(a) * 18.4; inst(G.box, stone, M(x, fallY + 5, z, 36, 10, 3, -a + Math.PI / 2)); for (let j = -4; j <= 4; j++) inst(G.box, stone, M(x + Math.cos(-a + Math.PI / 2) * j * 3.6, fallY + 10.6, z - Math.sin(-a + Math.PI / 2) * j * 3.6, 1.6, 1.4, 3.2, -a + Math.PI / 2)); }
      inst(G.box, stone, M(fx, fallY + 9, fz, 14, 18, 14)); inst(G.rock, std(0x8a8178, { flatShading: true }), M(fx, fallY - 2, fz, 48, 10, 44));
      const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(6, 4), flagMat), fx + 3, fallY + 26, fz); inst(G.cylLow, wood, M(fx, fallY + 22, fz, .2, 8, .2));
      updaters.push((dt, t) => { flag.rotation.y = Math.sin(t * 2.2) * .4; });
      void fy;
      // lighthouse with a sweeping beam
      const lx = 20, lz = -40, ly = terrainH(lx, lz);
      for (let i = 0; i < 6; i++) inst(G.cyl, std(i % 2 ? 0xd62828 : 0xf8f8f2, { roughness: .5 }), M(lx, ly + 2 + i * 3.4, lz, 2.4 - i * .18, 3.4, 2.4 - i * .18));
      add(new THREE.Mesh(G.cyl, new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe58a, emissiveIntensity: 2 })), lx, ly + 22.6, lz).scale.set(1.4, 2, 1.4);
      inst(G.cone, std(0x2b2d33), M(lx, ly + 25, lz, 1.8, 2.2, 1.8));
      const beamGeo = new THREE.ConeGeometry(5, 70, 24, 1, true); beamGeo.translate(0, -35, 0); beamGeo.rotateZ(Math.PI / 2);
      const beam = add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })), lx, ly + 22.6, lz);
      updaters.push((dt, t) => { beam.rotation.y = t * .7; });
    }
    // ---- floating barrels and crates ----
    const barrels = [], barrelMat = std(0x8a5a30), band = std(0x3a3a3a, { metalness: .5 });
    inWater(22, 14, 300, (x, z) => { const b = new THREE.Group(); const c = new THREE.Mesh(G.cyl, r() < .5 ? barrelMat : plank); c.scale.set(.7, 1.6, .7); b.add(c); const s = new THREE.Mesh(G.cyl, band); s.scale.set(.74, .12, .74); b.add(s); b.position.set(x, fallY, z); b.rotation.set(Math.PI / 2, r() * 6, 0); group.add(b); barrels.push([b, r() * 9]); });
    updaters.push((dt, t) => barrels.forEach(([b, ph]) => { b.position.y = fallY + Math.sin(t * 1.2 + ph) * .18; b.rotation.y += dt * .05; }));
    // ---- far islands on the horizon ----
    for (let i = 0; i < 14; i++) { const a = r() * TAU, d = 650 + r() * 500, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 40 + r() * 80; inst(G.ico, std(0x5a8a4a, { flatShading: true }), M(x, fallY - s * .25, z, s, s * .45, s * .8, r() * 6), { cast: false }); for (let k = 0; k < 5; k++) palm(x + (r() - .5) * s * .8, fallY + s * .1, z + (r() - .5) * s * .5, 9 + r() * 6); }
  }

  // =====================================================================================
  function buildCandy() {
    const river = (x, z) => { const cz = Math.sin(x * .012) * 9; const d = Math.abs(z - cz); return d < 18 ? fallY - 3.5 : d < 32 ? fallY - 3.5 + (d - 18) * .45 : 99; };
    shapedTerrain({
      seabed: -8, cliff: .45, landR: W / 2 + 60, carve: river,
      extra: [[-380, 0, 6, 60]],
      paint: (c, h, ny, d, x, z) => {
        const n = fbm(x * 1.3, z * 1.3) * .5 + .5, band = Math.floor((fbm(x * .4 + 300, z * .4) * .5 + .5) * 4);
        if (h < fallY + .6) c.setRGB(.55, .32, .18, THREE.SRGBColorSpace);                    // cookie bank
        else if (ny < .7) c.setRGB(.42, .22, .12, THREE.SRGBColorSpace);                      // chocolate cake layer
        else c.set([0xff8ec0, 0x7ed8a8, 0xffd890, 0xae96f0][band]).multiplyScalar(.88 + n * .14);
      },
      rough: .7,
    });
    // chocolate river: glossy and flowing
    waterPlane(0x5a2e16, { opacity: 1, rough: .18, normal: .35, flow: [.012, .002], metal: .1 });
    // ---- the cake mountain with a chocolate waterfall feeding the river ----
    {
      const cx = -390, cz = -8, layers = [0xffd6e8, 0x8a4a2a, 0xfff2e0, 0xff9ac8];
      for (let i = 0; i < 4; i++) { const rad = 70 - i * 15, y = fallY + 4 + i * 13; inst(G.cyl, std(layers[i], { roughness: .7 }), M(cx, y, cz, rad, 13, rad), { cast: false }); inst(G.sphere, std(0xffffff, { roughness: .5 }), M(cx, y + 6.5, cz, rad + .5, 1.6, rad + .5), { cast: false }); }
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, x = cx + Math.cos(a) * 18, z = cz + Math.sin(a) * 18; inst(G.cyl, std(k % 2 ? 0xff6aa8 : 0x6ad0ff), M(x, fallY + 61, z, .9, 9, .9)); flame(x, fallY + 66.4, z, 3.2); }
      inst(G.sphere, std(0xd8202a, { roughness: .3 }), M(cx, fallY + 59, cz, 7, 6, 7));
      const fallTex = canvasTex(128, (g, s) => { g.fillStyle = '#4a2410'; g.fillRect(0, 0, s, s); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${140 + r() * 60},${80 + r() * 30},40,.5)`; g.fillRect(r() * s, 0, 2 + r() * 4, s); } }, 1);
      fallTex.repeat.set(3, 1);
      const wf = add(new THREE.Mesh(new THREE.PlaneGeometry(30, 50), new THREE.MeshStandardMaterial({ map: fallTex, roughness: .2, side: THREE.DoubleSide })), cx + 68, fallY + 22, cz); wf.rotation.y = Math.PI / 2;
      const foam = []; for (let k = 0; k < 8; k++) { const p = add(sprite(puffTex, 0xc89a78, 8, false, .7), cx + 72 + r() * 6, fallY + 1, cz - 12 + r() * 24); foam.push([p, r() * 6]); }
      updaters.push((dt, t) => { fallTex.offset.y = (t * .5) % 1; foam.forEach(([p, ph]) => { const k = 1 + Math.sin(t * 3 + ph) * .2; p.scale.set(8 * k, 6 * k, 1); }); });
    }
    // ---- lollipop trees, candy canes, gumdrops, cotton candy, peppermints ----
    const swirl = (a, b) => canvasTex(128, (g, s) => { g.fillStyle = a; g.fillRect(0, 0, s, s); g.strokeStyle = b; g.lineWidth = 9; g.beginPath(); for (let k = 0; k < 220; k++) { const ang = k * .12, rad = k * .27; g.lineTo(s / 2 + Math.cos(ang) * rad, s / 2 + Math.sin(ang) * rad); } g.stroke(); }, 1);
    const lolliMats = [['#ff4a8a', '#ffffff'], ['#4ac8ff', '#ffffff'], ['#ffd04a', '#ff6a3a'], ['#8aff6a', '#ffffff'], ['#c87aff', '#ffe0ff']].map(([a, b]) => new THREE.MeshStandardMaterial({ map: swirl(a, b), roughness: .35 }));
    const stick = std(0xfaf6ee, { roughness: .5 }), disc = new THREE.CylinderGeometry(1, 1, .5, 28); disc.rotateX(Math.PI / 2);
    const lolli = (x, y, z, h) => { inst(G.cylLow, stick, M(x, y + h / 2, z, .16, h, .16)); inst(disc, lolliMats[Math.floor(r() * lolliMats.length)], M(x, y + h + 1.4, z, 2 + r() * 1.2, 2 + r() * 1.2, 1, r() * TAU)); };
    const caneMat = new THREE.MeshStandardMaterial({ map: striped('#ffffff', '#e8203a', 10, true), roughness: .35 }); caneMat.map.repeat.set(1, 4);
    const caneTop = new THREE.TorusGeometry(1.1, .32, 10, 20, Math.PI);
    const cane = (x, y, z, h, a) => { inst(G.cyl, caneMat, M(x, y + h / 2, z, .32, h, .32)); inst(caneTop, caneMat, M(x - Math.cos(a) * 1.1, y + h, z + Math.sin(a) * 1.1, 1, 1, 1, a)); };
    const gumColors = [0xff3a5a, 0x3aff8a, 0xffd03a, 0x5a8aff, 0xff8a3a, 0xc85aff].map(c => std(c, { roughness: .25, emissive: c, emissiveIntensity: .12 }));
    const halfSphere = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2);
    const cotton = [std(0xffb0e0, { flatShading: true, roughness: 1 }), std(0xb0e8ff, { flatShading: true, roughness: 1 })];
    onLand(150, 8, 440, .8, (x, y, z) => lolli(x, y, z, 4 + r() * 5));
    onLand(110, 8, 440, .8, (x, y, z) => cane(x, y, z, 5 + r() * 6, r() * TAU));
    onLand(360, 5, 440, .6, (x, y, z) => { const s = .8 + r() * 2.2; inst(halfSphere, gumColors[Math.floor(r() * gumColors.length)], M(x, y - .1, z, s, s * 1.15, s)); });
    onLand(90, 9, 440, .8, (x, y, z) => { const h = 4 + r() * 4, m = cotton[Math.floor(r() * 2)]; inst(G.cylLow, stick, M(x, y + h / 2, z, .2, h, .2)); for (let k = 0; k < 4; k++) inst(G.ico, m, M(x + (r() - .5) * 2.6, y + h + r() * 1.4, z + (r() - .5) * 2.6, 2 + r(), 1.6 + r(), 2 + r(), r() * 6)); });
    const mint = new THREE.MeshStandardMaterial({ map: canvasTex(128, (g, s) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); g.fillStyle = '#ff2a4a'; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(s / 2, s / 2); g.arc(s / 2, s / 2, s / 2, k * TAU / 8, k * TAU / 8 + TAU / 16); g.fill(); } }, 1), roughness: .3 });
    const mintGeo = new THREE.CylinderGeometry(1, 1, .3, 24);
    onLand(70, 6, 440, .6, (x, y, z) => { const s = 1.5 + r() * 2; inst(mintGeo, mint, M(x, y + .1, z, s, 1, s, r() * TAU), { cast: false }); });
    // the shoulders along the road: colourful jelly beans and little candy fences (where there is a barrier)
    alongRoad(9, 1.6, (x, y, z) => { inst(G.sphere, gumColors[Math.floor(r() * gumColors.length)], M(x, y + .25, z, .35, .3, .6, r() * TAU), { cast: false }); });
    alongRoad(30, 3.5, (x, y, z, s, side) => cane(x, y, z, 3.6, s.angle + (side > 0 ? 0 : Math.PI)));
    // ---- giant cupcakes and ice cream cones ----
    const wrapperMat = new THREE.MeshStandardMaterial({ map: striped('#ff8ac0', '#ffd0e4', 16), roughness: .6 });
    const frost = [std(0xfff4f8, { roughness: .4 }), std(0xff9ad0, { roughness: .4 }), std(0x9ae8ff, { roughness: .4 })];
    const cherry = std(0xe0102a, { roughness: .2 }), sprinkleCols = [0xff3a5a, 0x3aff8a, 0xffe03a, 0x5a8aff].map(c => std(c));
    onLand(9, 26, 380, 1, (x, y, z) => {
      const s = 5 + r() * 4, f = frost[Math.floor(r() * 3)];
      inst(G.cyl, wrapperMat, M(x, y + s * .55, z, s, s * 1.1, s)); for (let k = 0; k < 3; k++) inst(G.sphere, f, M(x, y + s * 1.25 + k * s * .32, z, s * (1.15 - k * .3), s * .45, s * (1.15 - k * .3)));
      inst(G.sphere, cherry, M(x, y + s * 2.25, z, s * .25, s * .25, s * .25));
      for (let k = 0; k < 24; k++) { const a = r() * TAU, d = r() * s * .9; inst(G.box, sprinkleCols[k % 4], M(x + Math.cos(a) * d, y + s * 1.55 + r() * s * .4, z + Math.sin(a) * d, .14 * s, .05 * s, .05 * s, r() * 6), { cast: false }); }
    });
    const waffle = new THREE.MeshStandardMaterial({ map: canvasTex(128, (g, s) => { g.fillStyle = '#d8a050'; g.fillRect(0, 0, s, s); g.strokeStyle = '#a8702a'; g.lineWidth = 5; for (let k = -s; k < s * 2; k += 22) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + s, s); g.stroke(); g.beginPath(); g.moveTo(k, s); g.lineTo(k + s, 0); g.stroke(); } }, 1), roughness: .8 });
    onLand(8, 24, 400, 1, (x, y, z) => { const s = 4 + r() * 3; inst(G.cone, waffle, M(x, y + s * 1.2, z, s, s * 2.6, s, 0, Math.PI)); for (let k = 0; k < 3; k++) inst(G.sphere, frost[(k + 1) % 3], M(x + (r() - .5) * s * .4, y + s * 2.6 + k * s * .7, z + (r() - .5) * s * .4, s * .95, s * .8, s * .95)); });
    // ---- a donut arch over the start straight ----
    {
      const [dx, dz] = at(-44, 0), dy = track.heightAt(1 - 44 / track.length);
      const dough = new THREE.MeshStandardMaterial({ color: 0xe0a060, roughness: .7 }), icing = new THREE.MeshStandardMaterial({ map: canvasTex(128, (g, s) => { g.fillStyle = '#ff7ac0'; g.fillRect(0, 0, s, s); const cs = ['#ffffff', '#ffe03a', '#3ad0ff', '#7aff6a']; for (let k = 0; k < 160; k++) { g.fillStyle = cs[k % 4]; g.save(); g.translate(r() * s, r() * s); g.rotate(r() * 6); g.fillRect(-4, -1.2, 8, 2.4); g.restore(); } }, 1), roughness: .4 });
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 3, 2.4, 16, 48), dough), dx, dy + 1.5, dz); ring.rotation.y = track.sample(1 - 44 / track.length).angle; ring.castShadow = true;
      const top = new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 3, 2.5, 16, 48, Math.PI), icing); top.scale.set(1, 1, 1.08); ring.add(top);
    }
    // ---- a candy Ferris wheel that turns ----
    {
      const fx = -8, fz = 72, fy = terrainH(fx, fz), wheel = new THREE.Group(), R = 22;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, .6, 8, 64), std(0xff4a9a, { roughness: .4 })); wheel.add(rim);
      for (let k = 0; k < 12; k++) { const sp = new THREE.Mesh(G.cylLow, stick); sp.scale.set(.25, R, .25); sp.position.set(Math.cos(k / 12 * TAU) * R / 2, Math.sin(k / 12 * TAU) * R / 2, 0); sp.rotation.z = k / 12 * TAU - Math.PI / 2; wheel.add(sp); }
      const cabins = [];
      for (let k = 0; k < 12; k++) { const c = new THREE.Mesh(halfSphere, gumColors[k % gumColors.length]); c.scale.set(1.8, 2.2, 1.8); c.rotation.x = Math.PI; group.add(c); cabins.push(c); }
      wheel.position.set(fx, fy + R + 4, fz); wheel.rotation.y = .6; group.add(wheel);
      for (const sd of [-1, 1]) inst(G.cyl, caneMat, M(fx + Math.cos(.6) * 0 + Math.sin(.6) * sd * 3, fy + (R + 4) / 2, fz + Math.cos(.6) * sd * 3, .6, R + 6, .6, 0, 0, 0));
      updaters.push((dt, t) => { wheel.rotation.z = t * .12; cabins.forEach((c, k) => { const a = t * .12 + k / 12 * TAU, lx = Math.cos(a) * R, ly = Math.sin(a) * R; c.position.set(fx + lx * Math.cos(.6), fy + R + 4 + ly - 1.4, fz - lx * Math.sin(.6)); }); });
    }
    // ---- gingerbread houses in the middle loop ----
    const ginger = std(0xa8642a, { roughness: .9 }), icingWhite = std(0xffffff, { roughness: .5 }), roofPink = std(0xff8ac0, { roughness: .6 });
    onLand(14, 18, 140, 1, (x, y, z) => { if (Math.hypot(x + 10, z - 70) > 90 || Math.hypot(x + 8, z - 72) < 28) return false; const w = 6 + r() * 3, a = r() * TAU; inst(G.box, ginger, M(x, y + 2.4, z, w, 4.8, w * .8, a)); inst(G.roof, roofPink, M(x, y + 6.2, z, w * 1.05, 3, w * .9, a)); inst(G.box, icingWhite, M(x, y + 4.85, z, w * 1.02, .25, w * .82, a)); inst(G.box, std(0x5a2a10), M(x + Math.sin(a) * w * .41, y + 1.2, z + Math.cos(a) * w * .41, 1.4, 2.4, .2, a)); });
    // ---- gummy bears strolling around ----
    {
      const bears = [], bearCols = [0xff3a4a, 0x3ad86a, 0xffc83a, 0xff8a2a, 0xffffff];
      onLand(14, 12, 380, 1, (x, y, z) => {
        const col = bearCols[bears.length % bearCols.length], m = std(col, { roughness: .2, transparent: true, opacity: .82, emissive: col, emissiveIntensity: .15 }); m.userData.live = true;
        const b = new THREE.Group(), part = (sx, sy, sz, px, py, pz) => { const p = new THREE.Mesh(G.sphere, m); p.scale.set(sx, sy, sz); p.position.set(px, py, pz); p.castShadow = true; b.add(p); return p; };
        part(1.3, 1.6, 1.1, 0, 1.8, 0); part(1, .9, .9, 0, 3.8, 0); part(.35, .35, .3, -.7, 4.6, 0); part(.35, .35, .3, .7, 4.6, 0);
        const legs = [part(.45, .7, .45, -.6, .6, 0), part(.45, .7, .45, .6, .6, 0)], arms = [part(.35, .8, .35, -1.3, 2.2, 0), part(.35, .8, .35, 1.3, 2.2, 0)];
        for (const sd of [-1, 1]) { const e = new THREE.Mesh(G.sphere, std(0x111111)); e.scale.setScalar(.12); e.position.set(sd * .35, 4, .82); b.add(e); }
        b.scale.setScalar(1.3 + r() * .8); b.position.set(x, y, z); group.add(b); bears.push({ b, x, z, y, ph: r() * 10, rad: 6 + r() * 10, legs, arms, sp: (.15 + r() * .2) * (r() < .5 ? -1 : 1) });
      });
      updaters.push((dt, t) => bears.forEach(o => {
        const a = t * o.sp + o.ph, x = o.x + Math.cos(a) * o.rad, z = o.z + Math.sin(a) * o.rad;
        o.b.position.set(x, Math.max(fallY + .3, terrainH(x, z)) + Math.abs(Math.sin(t * 5 + o.ph)) * .35, z); o.b.rotation.y = -a + (o.sp > 0 ? Math.PI : 0);
        const sw = Math.sin(t * 5 + o.ph) * .5; o.legs[0].rotation.x = sw; o.legs[1].rotation.x = -sw; o.arms[0].rotation.x = -sw; o.arms[1].rotation.x = sw;
      }));
    }
    // ---- marshmallow clouds drifting by, a rainbow, sprinkles in the air ----
    {
      const mallow = std(0xfff6fa, { roughness: 1, emissive: 0xffe0f0, emissiveIntensity: .2 }), puffs = [];
      for (let i = 0; i < 16; i++) {
        const c = new THREE.Group(); for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(G.cyl, mallow); const s = 6 + r() * 5; p.scale.set(s, s * .8, s); p.position.set((k - 2) * 7 + r() * 3, r() * 4, (r() - .5) * 8); p.rotation.set(r(), r(), r()); c.add(p); }
        c.position.set(-600 + r() * 1200, 60 + r() * 50, -600 + r() * 1200); group.add(c); puffs.push(c);
      }
      updaters.push((dt) => puffs.forEach(c => { c.position.x += dt * 2.5; if (c.position.x > 650) c.position.x = -650; }));
      ['#ff4a4a', '#ff9a3a', '#ffe04a', '#5ad85a', '#3aa8ff', '#8a5aff'].forEach((c, i) => { const arc = add(new THREE.Mesh(new THREE.TorusGeometry(380 - i * 9, 4.5, 6, 80, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .5, depthWrite: false, fog: false, toneMapped: false })), -60, -40, -560); void arc; });
      weather(160, 0xff7ac0, .3, .6, 80, 30, 1.6);
      weather(160, 0x7ae0ff, .3, .7, 80, 30, 1.6);
      weather(120, 0xffe06a, .3, .5, 80, 30, 1.6);
    }
    // ---- a pink candy castle on the horizon ----
    {
      const pink = std(0xffa8d0, { roughness: .6 }), roof = std(0xa86aff, { roughness: .5 }), cx = 120, cz = -520;
      inst(G.box, pink, M(cx, 25, cz, 90, 50, 30), { cast: false });
      for (let k = 0; k < 5; k++) { const x = cx - 50 + k * 25, h = 60 + (k % 2) * 25; inst(G.cyl, pink, M(x, h / 2, cz + 10, 8, h, 8), { cast: false }); inst(G.cone, roof, M(x, h + 9, cz + 10, 10, 18, 10), { cast: false }); }
    }
  }

  // =====================================================================================
  function buildCastle() {
    const abyss = -95;
    shapedTerrain({
      seabed: abyss, cliff: 2.4, landR: W / 2 + 16,
      extra: [[-30, 250, 1, 55], [-95, 12, 11, 26], ...Array.from({ length: 10 }, (_, k) => [-200 + k * 40, 215, 1, 26])],
      paint: (c, h, ny, d, x, z) => {
        const n = fbm(x * 1.7, z * 1.7) * .5 + .5;
        if (h < -40) c.setRGB(.1, .09, .14, THREE.SRGBColorSpace);
        else if (ny < .72) c.setRGB(.36 + n * .08, .33 + n * .06, .32 + n * .05, THREE.SRGBColorSpace).multiplyScalar(Math.max(.4, Math.min(1, (h + 40) / 40)));
        else c.setRGB(.28 + n * .1, .46 + n * .12, .22, THREE.SRGBColorSpace);
      },
    });
    // ---- mist down in the abyss ----
    const mistTex = canvasTex(512, (g, s) => { g.clearRect(0, 0, s, s); clouds(g, s, r, 80, 'rgba(255,240,255,.55)', 30, 110); }, 6);
    const mists = [];
    [[-28, .55], [-42, .7], [-60, .9]].forEach(([y, o], i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ map: mistTex, color: i ? 0x9a86b8 : 0xd8c8e8, transparent: true, opacity: o, depthWrite: false, fog: true })); m.rotation.x = -Math.PI / 2; m.position.y = y; group.add(m); mists.push(m); });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ color: 0x2a2040 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -64; group.add(floor);
    updaters.push((dt, t) => { mistTex.offset.set(t * .003, t * .0015); });

    const stone = std(0x9a948c, { roughness: .95, flatShading: true }), stoneDark = std(0x6a6460, { roughness: 1, flatShading: true }), slate = std(0x3a3a50, { roughness: .7 }), wood = std(0x5a3a22);
    // ---- the castle behind the start straight: walls, towers, keep, banners ----
    const bannerMats = ['#b8202a', '#2a4ab8'].map(c => new THREE.MeshStandardMaterial({ map: canvasTex(64, (g, s) => { g.fillStyle = c; g.fillRect(0, 0, s, s); g.fillStyle = '#ffd04a'; g.beginPath(); g.moveTo(32, 10); g.lineTo(44, 30); g.lineTo(32, 50); g.lineTo(20, 30); g.fill(); }, 1), side: THREE.DoubleSide, roughness: .8 }));
    const banners = [];
    {
      const tower = (x, z, h, rad = 5) => { const y = terrainH(x, z); inst(G.cyl, stone, M(x, y + h / 2, z, rad, h, rad)); inst(G.cone, slate, M(x, y + h + rad * .9, z, rad * 1.25, rad * 2, rad * 1.25)); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; inst(G.box, stone, M(x + Math.cos(a) * rad, y + h + .5, z + Math.sin(a) * rad, 1.4, 1.4, 1.4, -a)); } return y + h; };
      const wallZ = 205;
      for (let x = -200; x <= 160; x += 40) { tower(x, wallZ, 24); if (x < 160) { const y = terrainH(x + 20, wallZ); inst(G.box, stone, M(x + 20, y + 8, wallZ, 40, 16, 4)); for (let k = -4; k <= 4; k++) inst(G.box, stone, M(x + 20 + k * 4.2, y + 16.8, wallZ, 1.8, 1.6, 4.2)); } }
      const ky = terrainH(-30, 250); inst(G.box, stone, M(-30, ky + 22, 250, 44, 44, 36)); for (const [dx, dz] of [[-22, -18], [22, -18], [-22, 18], [22, 18]]) tower(-30 + dx, 250 + dz, 58, 6);
      tower(-30, 250, 72, 8);
      for (let k = 0; k < 8; k++) { const wx = -170 + k * 45, wy = terrainH(wx, wallZ) + 13, b = add(new THREE.Mesh(new THREE.PlaneGeometry(4, 9), bannerMats[k % 2]), wx, wy - 3, wallZ - 2.2); b.geometry.translate(0, -4.5, 0); b.position.y = wy + 2; banners.push([b, r() * 6]); }
      // gate arch over the start straight
      const [gx, gz] = at(60, 0), g = track.sample(60 / track.length), gy = track.heightAt(60 / track.length);
      for (const sd of [-1, 1]) { const x = gx + g.nx * sd * (W / 2 + 3.5), z = gz + g.nz * sd * (W / 2 + 3.5); inst(G.box, stone, M(x, gy + 7, z, 5, 14, 5, g.angle)); inst(G.cone, slate, M(x, gy + 16, z, 4.2, 5, 4.2, g.angle + Math.PI / 4)); flame(x - Math.sin(g.angle) * 2.8, gy + 9, z - Math.cos(g.angle) * 2.8, 1.6); }
      inst(G.box, stone, M(gx, gy + 13, gz, W + 12, 3, 5, g.angle + Math.PI / 2));
      const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(12, 1.8), new THREE.MeshBasicMaterial({ map: textPanel([['DRACHENBURG', 76, 64]], 512, 128, '#2a1a10', '#ffd27a', '#8a1a1a'), side: THREE.DoubleSide })), gx - Math.sin(g.angle) * 2.6, gy + 13, gz - Math.cos(g.angle) * 2.6); sign.rotation.y = g.angle + Math.PI;
      for (let k = 0; k < 2; k++) { const b = add(new THREE.Mesh(new THREE.PlaneGeometry(3, 7), bannerMats[k]), gx + g.nx * (k ? 1 : -1) * 4, gy + 11.5, gz + g.nz * (k ? 1 : -1) * 4); b.rotation.y = g.angle; b.geometry.translate(0, -3.5, 0); b.position.y = gy + 11.5; banners.push([b, r() * 6]); }
    }
    updaters.push((dt, t) => banners.forEach(([b, ph]) => { b.rotation.x = Math.sin(t * 2 + ph) * .12; b.scale.x = 1 + Math.sin(t * 3.1 + ph) * .06; }));
    // torches along the road
    const post = std(0x3a2a1a);
    alongRoad(22, 1.8, (x, y, z) => { inst(G.cylLow, post, M(x, y + 1.3, z, .12, 2.6, .12)); inst(G.cyl, std(0x2a2a2a, { metalness: .6 }), M(x, y + 2.7, z, .3, .3, .3)); flame(x, y + 3.15, z, 1.5); });
    // stone parapets on the bridges and the cliff road where there is a wall
    // ---- the village in the middle loop: timber houses, a windmill, lanterns floating up ----
    {
      const plaster = std(0xeee4cc, { roughness: .9 }), beam = std(0x4a3020), roofTile = std(0x8a3a2a, { roughness: .8 });
      onLand(22, 13, 170, 20, (x, y, z) => {
        if (Math.hypot(x + 90, z - 10) > 85 && Math.hypot(x - 60, z - 210) > 100) return false;
        const w = 6 + r() * 3, d = 5 + r() * 2, h = 4 + r() * 3, a = r() * TAU;
        inst(G.box, plaster, M(x, y + h / 2, z, w, h, d, a)); inst(G.roof, roofTile, M(x, y + h + 1.8, z, w * 1.1, 3.6, d * 1.1, a));
        for (const k of [-.5, 0, .5]) inst(G.box, beam, M(x + Math.cos(a) * k * w, y + h / 2, z - Math.sin(a) * k * w, .3, h, d + .05, a));
        const win = std(0xffd27a, { emissive: 0xffb040, emissiveIntensity: 1.2 }); inst(G.box, win, M(x + Math.sin(a) * (d / 2 + .02), y + h * .6, z + Math.cos(a) * (d / 2 + .02), 1, 1, .1, a), { cast: false });
      });
      const mx = -95, mz = 8, my = terrainH(mx, mz);
      inst(G.cyl, std(0xd8ccb0), M(mx, my + 7, mz, 4, 14, 4.5)); inst(G.cone, roofTile, M(mx, my + 16, mz, 5, 5, 5));
      const blades = new THREE.Group(); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(G.box, wood); b.scale.set(1.6, 11, .2); b.position.y = 5.5; const holder = new THREE.Group(); holder.rotation.z = k / 4 * TAU; holder.add(b); blades.add(holder); }
      blades.position.set(mx, my + 13, mz + 4.8); group.add(blades); updaters.push((dt, t) => { blades.rotation.z = t * .8; });
      const lanterns = [];
      for (let i = 0; i < 26; i++) { const l = add(sprite(flameTex, 0xffb060, 1.4), 0, 0, 0); lanterns.push({ l, x: -150 + r() * 130, z: -50 + r() * 120, ph: r() * 40 }); }
      updaters.push((dt, t) => lanterns.forEach(o => { const k = ((t + o.ph) % 40) / 40; o.l.position.set(o.x + Math.sin(t * .3 + o.ph) * 4, 18 + k * 110, o.z + Math.cos(t * .25 + o.ph) * 4); o.l.material.opacity = k < .1 ? k * 10 : 1 - Math.max(0, k - .7) / .3; }));
      // pine trees and rocks on the plateaus
      const pine = std(0x2a4a32, { flatShading: true }), trunk = std(0x4a3020);
      onLand(240, 7, 460, 25, (x, y, z) => { const h = 6 + r() * 8; inst(G.cylLow, trunk, M(x, y + 1, z, .3, 2, .3)); inst(G.cone, pine, M(x, y + h / 2 + 1, z, h * .32, h, h * .32)); inst(G.cone, pine, M(x, y + h * .85, z, h * .24, h * .6, h * .24)); });
      onLand(120, 6, 460, 25, (x, y, z) => inst(G.rock, stoneDark, M(x, y, z, 1 + r() * 2.5, .8 + r() * 2, 1 + r() * 2.5, r() * 6)));
    }
    // ---- the ruined chapel around the shortcut ----
    const sc = track.shortcuts[0];
    if (sc) {
      const ruin = std(0xb8b0a0, { roughness: 1, flatShading: true });
      for (let k = 2; k < sc.pts.length - 2; k += 3) {
        const p = sc.pts[k], o = sc.pts[k + 1], a = Math.atan2(o.x - p.x, o.z - p.z), cx = Math.cos(a), cz = -Math.sin(a);
        for (const sd of [-1, 1]) { const h = 2 + r() * 6; inst(G.box, ruin, M(p.x + cx * sd * (sc.width / 2 + 1.4), p.y + h / 2, p.z + cz * sd * (sc.width / 2 + 1.4), 1.2, h, 2.6, a)); }
        if (k % 9 === 2) { const arch = add(new THREE.Mesh(new THREE.TorusGeometry(sc.width / 2 + 1.4, .7, 8, 20, Math.PI), ruin), p.x, p.y + 5, p.z); arch.rotation.y = a + Math.PI / 2; arch.castShadow = true; }
      }
      const mid = sc.pts[Math.floor(sc.pts.length / 2)]; flame(mid.x, mid.y + 6.5, mid.z, 2.4, 0x8ab8ff);
    }
    // ---- waterfalls tumbling into the abyss ----
    {
      const wfTex = canvasTex(128, (g, s) => { g.fillStyle = 'rgba(200,225,255,.7)'; g.fillRect(0, 0, s, s); for (let k = 0; k < 50; k++) { g.fillStyle = `rgba(255,255,255,${.3 + r() * .5})`; g.fillRect(r() * s, 0, 1 + r() * 3, s); } }, 1);
      wfTex.repeat.set(2, 2);
      const wfMat = new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false });
      for (const [x, z, a, top] of [[286, 30, Math.PI / 2, 6], [258, -110, 2.2, 6], [-305, -30, -Math.PI / 2, 12], [40, -165, 0, 8]]) {
        const y = Math.max(top, terrainH(x, z)), f = add(new THREE.Mesh(new THREE.PlaneGeometry(10, y + 62), wfMat), x, (y - 62) / 2, z); f.rotation.y = a;
      }
      updaters.push((dt, t) => { wfTex.offset.y = (t * .8) % 1; });
    }
    // ---- the dragon: circles the dragon rock, flaps its wings and breathes fire now and then ----
    {
      const scales = std(0x7a1a22, { roughness: .5, metalness: .2 }), belly = std(0xd8a040, { roughness: .6 }), wingMat = new THREE.MeshStandardMaterial({ color: 0x5a1018, roughness: .7, side: THREE.DoubleSide });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe040, toneMapped: false });
      const makeDragon = (scale) => {
        const d = new THREE.Group(), part = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); m.castShadow = true; d.add(m); return m; };
        part(G.sphere, scales, 0, 0, 0, 2.2, 2, 5); part(G.sphere, belly, 0, -.8, .2, 1.7, 1.2, 4.2);
        for (let k = 0; k < 4; k++) part(G.sphere, scales, 0, .6 + k * .7, 4.4 + k * 1.3, 1.1 - k * .1, 1.1 - k * .1, 1.4);
        const head = part(G.box, scales, 0, 3.6, 9.6, 1.9, 1.5, 3); part(G.box, scales, 0, 3.1, 11.3, 1.4, .8, 1.6);
        for (const sd of [-1, 1]) { part(G.cone, belly, sd * .7, 4.8, 9, .3, 1.6, .3, -.6); part(G.sphere, eyeMat, sd * .8, 4, 10.6, .25, .25, .25); }
        for (let k = 0; k < 7; k++) part(G.sphere, scales, 0, -.2 - k * .1, -5 - k * 1.6, 1.2 - k * .15, 1 - k * .12, 1.2);
        part(G.cone, belly, 0, -1, -16.5, .8, 2, .3, -Math.PI / 2);
        for (let k = 0; k < 6; k++) part(G.cone, belly, 0, 1.8, -2 + k * 1.5, .3, 1, .3);
        const wings = [-1, 1].map(sd => { const w = new THREE.Group(), shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(12, 3); shape.lineTo(15, -2); shape.lineTo(10, -3); shape.lineTo(7, -6); shape.lineTo(3, -5); shape.lineTo(0, -4); shape.closePath();
          const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), wingMat); m.rotation.x = -Math.PI / 2; m.scale.x = sd; w.add(m); w.position.set(sd * 1.5, 1, 1.5); d.add(w); return w; });
        const fire = []; for (let k = 0; k < 10; k++) { const f = sprite(flameTex, 0xff8020, 2); f.visible = false; d.add(f); fire.push(f); }
        d.scale.setScalar(scale); d.userData = { wings, fire, head }; return d;
      };
      const dragons = [{ d: makeDragon(1.6), cx: -190, cz: -90, rad: 95, y: 42, sp: .16, ph: 0 }, { d: makeDragon(.9), cx: 40, cz: 260, rad: 160, y: 70, sp: -.1, ph: 2 }, { d: makeDragon(.7), cx: 300, cz: -260, rad: 120, y: 30, sp: .13, ph: 4 }];
      dragons.forEach(o => group.add(o.d));
      updaters.push((dt, t) => dragons.forEach((o, i) => {
        const a = o.ph + t * o.sp, x = o.cx + Math.cos(a) * o.rad, z = o.cz + Math.sin(a) * o.rad, dir = o.sp > 0 ? 1 : -1;
        o.d.position.set(x, o.y + Math.sin(t * .8 + o.ph) * 5, z); o.d.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir); o.d.rotation.z = -.25 * dir;
        const flap = Math.sin(t * 3 + o.ph) * .6; o.d.userData.wings[0].rotation.z = -flap; o.d.userData.wings[1].rotation.z = flap;
        const breathing = i === 0 && ((t + 3) % 9) < 1.6;
        o.d.userData.fire.forEach((f, k) => { f.visible = breathing; if (!breathing) return; const u = ((t * 2.5 + k / 10) % 1); f.position.set((Math.random() - .5) * u * 2, 3.1 - u * 2, 12 + u * 14); f.scale.setScalar(1.5 + u * 5); f.material.opacity = 1 - u; });
      }));
    }
    flock(36, 180, -60, 70, 5, 25, 0x18141c, 1.1, .5, 16);
    flock(30, -230, 40, 60, 10, 30, 0x18141c, 1, .55, 16);
    // ---- jagged spires on the dragon rock and around the abyss, mountains far away ----
    for (let i = 0; i < 70; i++) { const a = r() * TAU, d = 120 + r() * 380, x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 22)) continue; const h = terrainH(x, z); if (h > -20) continue; const s = 6 + r() * 12, top = -10 + r() * 30; inst(G.cone, stoneDark, M(x, (top + abyss) / 2, z, s, top - abyss, s, r() * 6)); }
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = 700 + r() * 500, h = 140 + r() * 200; inst(G.cone, std(0x4a4660, { flatShading: true }), M(Math.cos(a) * d, h / 2 - 90, Math.sin(a) * d, 90 + r() * 90, h, 90 + r() * 90, r()), { cast: false }); inst(G.cone, std(0xf0eef8), M(Math.cos(a) * d, h * .8 - 90, Math.sin(a) * d, 32, h * .3, 32), { cast: false }); }
    // a big moon rising behind the castle
    const moon = add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffe8c8, fog: false, toneMapped: false })), -200, 220, 900);
    add(sprite(glowTex('rgba(255,220,180,.5)', 'rgba(255,200,150,0)'), 0xffd0a0, 420, true, .6), -200, 220, 890);
    void moon;
    weather(140, 0xffc890, .2, -.25, 80, 30, 2);
  }

  // A strip along the road (offsets across, y above the road), only where keep(t) is true.
  function roadStrip(o0, o1, y, material, keep = () => true, step = 1) {
    const pos = [], uv = [], idx = [], n = Math.floor(track.points.length / step);
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = track.sample(t), h = track.heightAt(t);
      for (const o of [o0, o1]) { pos.push(s.x + s.nx * o, h + y, s.z + s.nz * o); uv.push(t * track.length / 10, o === o0 ? 0 : 1); }
      if (i < n && !track.inGap((i + .5) / n) && keep((i + .5) / n)) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material); group.add(m); return m;
  }

  // =====================================================================================
  function buildArctic() {
    shapedTerrain({
      seabed: -14, cliff: 1.1, landR: W / 2 + 15,
      extra: [[-30, 60, 1.2, 40], [90, 40, .8, 22], [-120, -60, 1, 26], [400, 200, 9, 70], [-420, -300, 12, 80], [100, 420, 6, 60], [-380, 260, 10, 70]],
      paint: (c, h, ny, d, x, z) => {
        const n = fbm(x * 2, z * 2) * .5 + .5;
        if (h < fallY - 1) c.setRGB(.12, .32, .42, THREE.SRGBColorSpace);
        else if (ny < .78) c.setRGB(.55 + n * .1, .8 + n * .08, .92, THREE.SRGBColorSpace);
        else c.setRGB(.9 + n * .06, .94 + n * .05, .98, THREE.SRGBColorSpace);
      },
      rough: .5,
    });
    waterPlane(0x123e5a, { opacity: .9, rough: .04, normal: .3, flow: [.002, .004] });
    const snow = std(0xf4f8fc, { roughness: .6 }), ice = std(0xa8e0f4, { roughness: .1, metalness: .1, transparent: true, opacity: .85, emissive: 0x2a6a8a, emissiveIntensity: .25 });
    const iceSolid = std(0xc8eefa, { roughness: .2, flatShading: true });
    // ---- drifting ice floes and big icebergs ----
    const floes = [];
    inWater(70, 10, 420, (x, z) => { const f = new THREE.Mesh(G.cylLow, snow); const s = 3 + r() * 8; f.scale.set(s, .8, s * (.6 + r() * .6)); f.position.set(x, fallY + .1, z); f.rotation.y = r() * 6; f.receiveShadow = true; group.add(f); floes.push([f, r() * 9, x, z]); });
    updaters.push((dt, t) => floes.forEach(([f, ph, x, z]) => { f.position.set(x + Math.sin(t * .05 + ph) * 3, fallY + .1 + Math.sin(t * .9 + ph) * .1, z + Math.cos(t * .04 + ph) * 3); f.rotation.y += dt * .01; }));
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = 300 + r() * 500, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 15 + r() * 40; if (!free(x, z, s + 10)) continue; inst(G.rock, iceSolid, M(x, fallY + s * .3, z, s, s * (.8 + r() * .8), s * (.7 + r() * .5), r() * 6), { cast: false }); }
    // ---- aurora: glowing ribbons that wave across the sky ----
    {
      const auroraTex = canvasTex(256, (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(160,80,255,0)'); gr.addColorStop(.35, 'rgba(140,90,255,.55)'); gr.addColorStop(.7, 'rgba(60,255,160,.9)'); gr.addColorStop(1, 'rgba(60,255,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(r() * s, 0, 2 + r() * 6, s); } }, 1);
      auroraTex.wrapS = THREE.RepeatWrapping; auroraTex.repeat.set(4, 1);
      const ribbons = [];
      for (let k = 0; k < 4; k++) {
        const geo = new THREE.PlaneGeometry(1400, 120, 120, 1), mat = new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: .75 });
        const m = new THREE.Mesh(geo, mat); m.position.set((k - 1.5) * 120, 210 + k * 30, -420 + k * 120); m.rotation.y = (k - 1.5) * .25; group.add(m);
        ribbons.push({ m, base: Float32Array.from(geo.attributes.position.array), ph: r() * 9 });
      }
      updaters.push((dt, t) => ribbons.forEach(o => {
        const p = o.m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const bx = o.base[i * 3]; p.setZ(i, Math.sin(bx * .006 + t * .35 + o.ph) * 60 + Math.sin(bx * .017 - t * .6) * 16); p.setY(i, o.base[i * 3 + 1] + Math.sin(bx * .01 + t * .5 + o.ph) * 14); }
        p.needsUpdate = true; o.m.material.opacity = .55 + Math.sin(t * .4 + o.ph) * .2; auroraTex.offset.x = t * .01;
      }));
    }
    // ---- penguins: waddling colonies, some sliding on their bellies ----
    {
      const black = std(0x1a1c22, { roughness: .5 }), white = std(0xf6f6f2), orange = std(0xff9a2a), pens = [];
      const colony = (cx, cz, n) => { for (let i = 0; i < n; i++) {
        const p = new THREE.Group(), b = new THREE.Mesh(G.sphere, black); b.scale.set(.42, .7, .38); b.position.y = .7; p.add(b);
        const w = new THREE.Mesh(G.sphere, white); w.scale.set(.32, .55, .3); w.position.set(0, .66, .14); p.add(w);
        const hd = new THREE.Mesh(G.sphere, black); hd.scale.setScalar(.27); hd.position.y = 1.42; p.add(hd);
        const bk = new THREE.Mesh(G.cone, orange); bk.scale.set(.07, .2, .07); bk.rotation.x = Math.PI / 2; bk.position.set(0, 1.4, .3); p.add(bk);
        for (const sd of [-1, 1]) { const fl = new THREE.Mesh(G.box, black); fl.scale.set(.06, .45, .2); fl.position.set(sd * .42, .78, 0); fl.rotation.z = sd * .3; p.add(fl); const ft = new THREE.Mesh(G.box, orange); ft.scale.set(.16, .05, .26); ft.position.set(sd * .14, .03, .1); p.add(ft); }
        p.traverse(o => { o.castShadow = true; }); const s = .9 + r() * .5; p.scale.setScalar(s);
        const x = cx + (r() - .5) * 16, z = cz + (r() - .5) * 16; group.add(p);
        pens.push({ p, x, z, ph: r() * 20, slide: r() < .2, dir: r() * TAU });
      } };
      onLand(7, 14, 300, 1.5, (x, y, z) => colony(x, z, 6 + Math.floor(r() * 6)));
      updaters.push((dt, t) => pens.forEach(o => {
        const k = ((t * .08 + o.ph) % 1), dist = o.slide ? 14 : 4, along = Math.sin(k * TAU) * dist;
        const x = o.x + Math.cos(o.dir) * along, z = o.z + Math.sin(o.dir) * along, y = Math.max(fallY, terrainH(x, z));
        o.p.position.set(x, y, z); o.p.rotation.y = Math.PI / 2 - o.dir + (Math.cos(k * TAU) < 0 ? Math.PI : 0);
        if (o.slide) { o.p.rotation.x = Math.PI / 2 * .9; o.p.position.y = y + .35; } else { o.p.rotation.z = Math.sin(t * 7 + o.ph) * .14; }
      }));
    }
    // ---- orcas breaching, a humpback whale blowing its spout ----
    {
      const black = std(0x15171c, { roughness: .3 }), white = std(0xf2f2f2, { roughness: .3 }), orcas = [];
      for (let i = 0; i < 4; i++) {
        const o = new THREE.Group(), b = new THREE.Mesh(G.sphere, black); b.scale.set(1.4, 1.3, 4.2); o.add(b);
        const bel = new THREE.Mesh(G.sphere, white); bel.scale.set(1.1, .9, 3.4); bel.position.y = -.45; o.add(bel);
        for (const sd of [-1, 1]) { const e = new THREE.Mesh(G.sphere, white); e.scale.set(.35, .25, .6); e.position.set(sd * 1.05, .4, 2.4); o.add(e); }
        const fin = new THREE.Mesh(G.cone, black); fin.scale.set(.25, 2.2, .9); fin.position.set(0, 1.9, -.4); o.add(fin);
        const tail = new THREE.Mesh(G.box, black); tail.scale.set(3.2, .2, 1); tail.position.z = -4.4; o.add(tail);
        group.add(o); orcas.push({ o, ph: r() * 10, cx: -60 + r() * 220, cz: -40 + r() * 120 });
      }
      updaters.push((dt, t) => orcas.forEach(w => {
        const k = ((t + w.ph) % 6) / 6, jump = k < .35, u = jump ? k / .35 : 0, along = (t * .1 + w.ph) % TAU;
        const x = w.cx + Math.cos(along) * 26, z = w.cz + Math.sin(along) * 26; if (terrainH(x, z) > fallY - 2) { w.o.visible = false; return; }
        w.o.visible = jump; w.o.position.set(x, fallY - 2 + (jump ? Math.sin(u * Math.PI) * 6 : -4), z); w.o.rotation.y = -along; w.o.rotation.x = jump ? (u - .5) * 1.6 : 0;
      }));
      const hump = new THREE.Group(), hb = new THREE.Mesh(G.sphere, std(0x3a4a5a, { roughness: .4 })); hb.scale.set(4, 2.4, 12); hump.add(hb);
      hump.position.set(300, fallY - .8, -40); group.add(hump);
      const spout = []; for (let k = 0; k < 14; k++) { const p = sprite(puffTex, 0xffffff, 2, false, .8); group.add(p); spout.push(p); }
      updaters.push((dt, t) => { hump.position.x = 300 + Math.sin(t * .03) * 80; hump.position.z = -40 + Math.cos(t * .03) * 60; hump.rotation.y = t * .03 + Math.PI / 2; hump.position.y = fallY - 1 + Math.sin(t * .5) * .5;
        const on = (t % 7) < 2.2; spout.forEach((p, k) => { p.visible = on; if (!on) return; const u = ((t * 1.4 + k / 14) % 1); p.position.set(hump.position.x + (Math.random() - .5) * u * 3, hump.position.y + 2 + u * 10, hump.position.z); p.scale.setScalar(1 + u * 4); p.material.opacity = (1 - u) * .8; }); });
    }
    // ---- seals on the floes, a polar bear on patrol ----
    const grey = std(0x8a8e96, { roughness: .4 });
    floes.slice(0, 14).forEach(([f], i) => { if (i % 2) return; const s = new THREE.Mesh(G.sphere, grey); s.scale.set(.6, .5, 1.6); s.position.y = .9; s.rotation.y = r() * 6; f.add(s); });
    {
      const fur = std(0xf2eee2, { roughness: .9 }), bear = new THREE.Group(), part = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(G.sphere, fur); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; bear.add(m); return m; };
      part(1.1, 1, 2, 0, 1.6, 0); part(.6, .6, .8, 0, 2, 1.9); const legs = [[-.6, .9], [.6, .9], [-.6, -1.1], [.6, -1.1]].map(([x, z]) => part(.3, .8, .3, x, .7, z));
      const nose = new THREE.Mesh(G.sphere, std(0x111111)); nose.scale.setScalar(.12); nose.position.set(0, 2, 2.65); bear.add(nose);
      group.add(bear); const bx = -30, bz = 60;
      updaters.push((dt, t) => { const a = t * .06, x = bx + Math.cos(a) * 26, z = bz + Math.sin(a) * 18; bear.position.set(x, Math.max(fallY, terrainH(x, z)), z); bear.rotation.y = -a; legs.forEach((l, k) => { l.position.y = .7 + Math.max(0, Math.sin(t * 6 + k * 1.6)) * .25; }); });
    }
    // ---- research station: containers, radar dish, wind turbine, snow cat ----
    {
      const sx = 80, sz = 230, sy = Math.max(fallY + .5, terrainH(sx, sz)), red = std(0xd8342c, { roughness: .6 }), steel = std(0x9aa0a8, { metalness: .6, roughness: .4 });
      for (let k = 0; k < 5; k++) inst(G.box, k % 2 ? red : std(0xf2a020), M(sx - 30 + k * 13, sy + 1.6, sz + (k % 2) * 6, 11, 3.2, 4.5, .1));
      const dish = new THREE.Group(), d = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 10, 0, TAU, 0, Math.PI / 3), std(0xf4f4f4, { side: THREE.DoubleSide })); d.rotation.x = -Math.PI / 2.4; dish.add(d);
      dish.position.set(sx + 40, sy + 9, sz); group.add(dish); inst(G.cyl, steel, M(sx + 40, sy + 4, sz, .5, 8, .5));
      const blades = new THREE.Group(); for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(G.box, std(0xffffff)); b.scale.set(.6, 13, .2); b.position.y = 6.5; const h = new THREE.Group(); h.rotation.z = k / 3 * TAU; h.add(b); blades.add(h); }
      blades.position.set(sx - 50, sy + 26, sz); group.add(blades); inst(G.cyl, std(0xf4f4f4), M(sx - 50, sy + 13, sz - 1, .7, 26, .7));
      const cat = new THREE.Group(), cb = new THREE.Mesh(G.box, red); cb.scale.set(2.6, 1.8, 4); cb.position.y = 1.6; cat.add(cb); const tr = new THREE.Mesh(G.box, std(0x222222)); tr.scale.set(3, .8, 4.4); tr.position.y = .5; cat.add(tr); group.add(cat);
      const light = sprite(glowTex('rgba(255,240,180,1)', 'rgba(255,200,80,0)'), 0xffe0a0, 3); cat.add(light); light.position.set(0, 1.6, 2.2);
      updaters.push((dt, t) => { dish.rotation.y = t * .4; blades.rotation.z = t * 1.2; const a = t * .05, x = sx + Math.cos(a) * 45, z = sz - 20 + Math.sin(a) * 25; cat.position.set(x, Math.max(fallY, terrainH(x, z)), z); cat.rotation.y = -a; });
      const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ map: textPanel([['APEX', 60, 40], ['POLAR', 40, 90]], 256, 128, '#1f6fe0', '#ffffff'), side: THREE.DoubleSide })), sx - 20, sy + 9, sz - 8);
      inst(G.cylLow, steel, M(sx - 21.5, sy + 4.5, sz - 8, .1, 9, .1)); updaters.push((dt, t) => { flag.rotation.y = Math.sin(t * 2.4) * .4; });
    }
    // ---- igloos, ice cave over the shortcut, icicles ----
    const halfDome = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2);
    onLand(10, 14, 300, 1.5, (x, y, z) => { const s = 3 + r() * 1.5; inst(halfDome, snow, M(x, y - .1, z, s, s * .85, s)); inst(G.box, std(0x2a3a4a), M(x + s * .9, y + .6, z, s * .5, 1.2, 1.1)); });
    const sc = track.shortcuts[0];
    if (sc) for (let k = 2; k < sc.pts.length - 2; k += 2) {
      const p = sc.pts[k], o = sc.pts[k + 1], a = Math.atan2(o.x - p.x, o.z - p.z), cx = Math.cos(a), cz = -Math.sin(a);
      for (const sd of [-1, 1]) inst(G.rock, iceSolid, M(p.x + cx * sd * (sc.width / 2 + 2.4), p.y + 2.6, p.z + cz * sd * (sc.width / 2 + 2.4), 2.8, 4.6 + r() * 2, 3, r() * 6));
      if (k > sc.pts.length * .25 && k < sc.pts.length * .75) { inst(G.box, ice, M(p.x, p.y + 6.6, p.z, sc.width + 6, 1.2, 3.2, a), { cast: false }); for (let j = 0; j < 3; j++) inst(G.cone, ice, M(p.x + cx * (r() - .5) * sc.width, p.y + 5.4, p.z + cz * (r() - .5) * sc.width, .25, 1.6, .25, 0, Math.PI), { cast: false }); }
    }
    // ---- a husky sled running along the shore ----
    {
      const sled = new THREE.Group(), wood = std(0x8a5a30); const base = new THREE.Mesh(G.box, wood); base.scale.set(1.4, .3, 3); base.position.y = .5; sled.add(base);
      const dogs = []; for (let k = 0; k < 4; k++) { const d = new THREE.Group(), b = new THREE.Mesh(G.sphere, std(k % 2 ? 0x6a6a72 : 0xd8d8d8)); b.scale.set(.35, .4, .8); b.position.y = .6; d.add(b); const h = new THREE.Mesh(G.sphere, b.material); h.scale.setScalar(.3); h.position.set(0, .9, .7); d.add(h); d.position.set((k % 2 - .5) * 1, 0, 3 + Math.floor(k / 2) * 1.8); sled.add(d); dogs.push(d); }
      group.add(sled);
      updaters.push((dt, t) => { const a = t * .045 + 2, x = -160 + Math.cos(a) * 70, z = 100 + Math.sin(a) * 40; sled.position.set(x, Math.max(fallY, terrainH(x, z)), z); sled.rotation.y = -a + Math.PI; dogs.forEach((d, k) => { d.position.y = Math.abs(Math.sin(t * 9 + k)) * .25; }); });
    }
    weather(700, 0xffffff, .22, 2.4, 80, 34, 1.4);
    flock(14, 0, 0, 200, 25, 40, 0xf4f4f4, 1.6, .2);
  }

  // =====================================================================================
  function buildRooftops() {
    const street = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: .6, metalness: .2,
      map: canvasTex(256, (g, s) => { g.fillStyle = '#1a1c22'; g.fillRect(0, 0, s, s); g.fillStyle = '#2c2f38'; g.fillRect(0, 0, s, 34); g.fillRect(0, 0, 34, s); g.fillStyle = '#d8c070'; for (let k = 40; k < s; k += 24) { g.fillRect(k, 16, 12, 2); g.fillRect(16, k, 2, 12); } }, 60) }));
    street.rotation.x = -Math.PI / 2; street.position.y = fallY - .05; street.receiveShadow = true; group.add(street);
    // facade texture: dark glass with lit windows
    const facade = (hue) => canvasTex(128, (g, s) => { g.fillStyle = `hsl(${hue},25%,12%)`; g.fillRect(0, 0, s, s); for (let y = 4; y < s; y += 12) for (let x = 4; x < s; x += 10) { const on = r() < .45; g.fillStyle = on ? `hsl(${40 + r() * 30},${70 + r() * 30}%,${55 + r() * 25}%)` : `hsl(${hue},30%,${18 + r() * 8}%)`; g.fillRect(x, y, 6, 7); } }, 1);
    const facades = [210, 260, 190, 30].map(h => { const t = facade(h); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: .9, roughness: .4, metalness: .3 }); });
    const roofMat = std(0x3a3d46, { roughness: .9 }), ledge = std(0x5a5e68, { roughness: .7 });
    // the buildings that carry the road: blocks along every land stretch, roofs just under the road
    const blocks = (pts, width) => { for (let i = 0; i < pts.length; i++) { const p = pts[i], h = p.y - .25; const m = facades[(Math.floor(i / 6)) % facades.length]; inst(G.box, m, M(p.x, h / 2 + fallY / 2, p.z, width, h - fallY, 10.5, p.a)); inst(G.box, roofMat, M(p.x, h - .05, p.z, width + .6, .3, 10.8, p.a), { cast: false }); } };
    const along = []; for (let d = 0; d < track.length; d += 8) { const t = d / track.length; if (track.inVoid(t)) continue; const s = track.sample(t); along.push({ x: s.x, z: s.z, y: track.heightAt(t), a: s.angle }); }
    blocks(along, W + 14);
    for (const sc of track.shortcuts) { const pts = []; for (let k = 0; k < sc.pts.length; k += 6) { const p = sc.pts[k], q = sc.pts[Math.min(sc.pts.length - 1, k + 1)]; pts.push({ x: p.x, z: p.z, y: p.y, a: Math.atan2(q.x - p.x, q.z - p.z) }); } blocks(pts, sc.width + 12); }
    // rooftop clutter beside the road: AC units, water tanks, antennas with blinking lights, vents
    const steel = std(0x8a909a, { metalness: .6, roughness: .4 }), tank = std(0x7a5a3a);
    const blink = []; const blinkTex = glowTex('rgba(255,60,60,1)', 'rgba(255,0,0,0)');
    alongRoad(14, 4.6, (x, y, z, s, side) => {
      const k = r(); if (k < .35) inst(G.box, steel, M(x, y + .7, z, 1.8, 1.4, 1.6, s.angle));
      else if (k < .5) { inst(G.cyl, tank, M(x, y + 3, z, 1.5, 3, 1.5)); inst(G.cone, tank, M(x, y + 5.2, z, 1.7, 1.4, 1.7)); for (const a of [0, 2.1, 4.2]) inst(G.cylLow, steel, M(x + Math.cos(a) * 1.2, y + .8, z + Math.sin(a) * 1.2, .1, 1.6, .1)); }
      else if (k < .62) { inst(G.cylLow, steel, M(x, y + 5, z, .12, 10, .12)); const b = add(sprite(blinkTex, 0xff3030, 1.6), x, y + 10.2, z); blink.push([b, r() * 6]); }
    });
    updaters.push((dt, t) => blink.forEach(([b, ph]) => { b.material.opacity = (Math.sin(t * 3 + ph) > .3) ? 1 : .1; }));
    // ---- the skyline all around: towers with lit windows, some taller than the road ----
    for (let i = 0; i < 420; i++) {
      const a = r() * TAU, d = 30 + Math.pow(r(), .7) * 650, x = Math.cos(a) * d, z = Math.sin(a) * d, w = 14 + r() * 22, dd = 14 + r() * 22;
      if (!free(x, z, Math.max(w, dd) / 2 + W / 2 + 6)) continue;
      const h = d < 120 ? 10 + r() * 22 : 20 + r() * (d > 300 ? 140 : 70), ry = Math.round(r() * 4) * Math.PI / 2 + (r() - .5) * .3;
      inst(G.box, facades[i % 4], M(x, h / 2 + fallY, z, w, h, dd, ry), { cast: false });
      inst(G.box, ledge, M(x, h + fallY + .3, z, w + .8, .6, dd + .8, ry), { cast: false });
      if (h > 80 && r() < .5) { inst(G.cylLow, steel, M(x, h + fallY + 8, z, .3, 16, .3), { cast: false }); const b = add(sprite(blinkTex, 0xff3030, 4), x, h + fallY + 16.5, z); blink.push([b, r() * 6]); }
    }
    // ---- neon signs on the roof edges, flickering ----
    const names = [['NEO RAMEN', '#ff4fd8'], ['PIXEL BAR', '#4fe8ff'], ['HYPERDRIVE', '#ffd04a'], ['SKYLINE HOTEL', '#ff7a3a'], ['KOMET KAFFEE', '#7aff6a'], ['TURBO ARCADE', '#c87aff'], ['NACHTEULE', '#ff4f6a'], ['VOLT', '#4fa8ff']];
    const neonMats = names.map(([n, c]) => new THREE.MeshBasicMaterial({ map: textPanel([[n, 96, 66]], 768, 128, 'rgba(0,0,0,0)', c), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    const signs = [];
    for (let d = 40, k = 0; d < track.length; d += 70 + r() * 40, k++) {
      const t = d / track.length; if (track.inVoid(t)) continue; const s = track.sample(t), side = k % 2 ? 1 : -1, off = W / 2 + 7.5, x = s.x + s.nx * side * off, z = s.z + s.nz * side * off, y = track.heightAt(t);
      const sg = add(new THREE.Mesh(new THREE.PlaneGeometry(10, 1.7), neonMats[k % neonMats.length]), x, y + 4.2, z); sg.lookAt(s.x, y + 4.2, s.z);
      inst(G.box, steel, M(x, y + 1.6, z, .2, 3.2, .2)); signs.push([sg, r() * 9]);
    }
    updaters.push((dt, t) => signs.forEach(([sg, ph]) => { const f = Math.sin(t * 23 + ph) > .96 || (t + ph) % 11 < .15; sg.visible = !f; }));
    // ---- traffic far below: streams of headlights and taillights moving along the streets ----
    {
      const n = 260, carGeo = new THREE.BoxGeometry(1.8, 1.2, 4), white = new THREE.MeshBasicMaterial({ color: 0xfff2d8, toneMapped: false }), red = new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false });
      const meshes = [new THREE.InstancedMesh(carGeo, white, n / 2), new THREE.InstancedMesh(carGeo, red, n / 2)]; meshes.forEach(m => { m.frustumCulled = false; group.add(m); });
      const cars = Array.from({ length: n }, (_, i) => ({ lane: Math.round((r() - .5) * 16) * 60 + (i % 2 ? 2.5 : -2.5), ns: r() < .5, off: r() * 1200, sp: (10 + r() * 8) * (i % 2 ? 1 : -1) }));
      const m4 = new THREE.Matrix4();
      updaters.push((dt, t) => cars.forEach((c, i) => { const p = ((c.off + t * c.sp) % 1200 + 1200) % 1200 - 600; const x = c.ns ? c.lane : p, z = c.ns ? p : c.lane; m4.makeRotationY(c.ns ? 0 : Math.PI / 2); m4.setPosition(x, fallY + .6, z); meshes[i % 2].setMatrixAt(i >> 1, m4); }));
      updaters.push(() => meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; }));
    }
    // ---- flying cars on air lanes, a blimp with a screen, a helicopter, searchlights, fireworks ----
    {
      const hover = [], hull = [std(0x2a2e3a, { metalness: .7, roughness: .3 }), std(0xd8d8e0, { metalness: .7, roughness: .3 }), std(0xff4a6a, { metalness: .5, roughness: .3 })];
      const under = glowTex('rgba(80,220,255,1)', 'rgba(0,160,255,0)');
      for (let i = 0; i < 34; i++) {
        const c = new THREE.Group(), b = new THREE.Mesh(G.sphere, hull[i % 3]); b.scale.set(1.3, .6, 2.6); c.add(b);
        const cab = new THREE.Mesh(G.sphere, std(0x6ad8ff, { metalness: .4, roughness: .1, emissive: 0x1a6a8a, emissiveIntensity: .5 })); cab.scale.set(.9, .5, 1.2); cab.position.set(0, .4, .3); c.add(cab);
        const g = sprite(under, 0x7ae8ff, 4); g.position.y = -.6; c.add(g); const tl = sprite(blinkTex, 0xff3030, 1.2); tl.position.z = -2.6; c.add(tl);
        group.add(c); hover.push({ c, rad: 120 + r() * 300, y: 45 + r() * 40, sp: (.03 + r() * .03) * (i % 2 ? 1 : -1), ph: r() * TAU, wob: r() * 9 });
      }
      updaters.push((dt, t) => hover.forEach(h => { const a = h.ph + t * h.sp; h.c.position.set(Math.cos(a) * h.rad, h.y + Math.sin(t + h.wob) * 1.5, Math.sin(a) * h.rad * .8); h.c.rotation.y = -a + (h.sp > 0 ? Math.PI : 0); h.c.rotation.z = Math.sin(t * 1.3 + h.wob) * .08; }));
      const screen = canvasTex(512, (g, s) => { g.fillStyle = '#080812'; g.fillRect(0, 0, s, s); g.font = '900 120px Arial'; g.fillStyle = '#ff5a36'; g.fillText('APEX RUSH', 20, 180); g.fillStyle = '#4fe8ff'; g.fillText('NEON GP', 60, 380); }, 1);
      screen.wrapS = THREE.RepeatWrapping;
      const blimp = new THREE.Group(), env = new THREE.Mesh(G.sphere, std(0xc8ccd4, { metalness: .3, roughness: .5 })); env.scale.set(9, 9, 28); blimp.add(env);
      for (const sd of [-1, 1]) { const sc2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 7), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false, side: THREE.DoubleSide })); sc2.rotation.y = Math.PI / 2; sc2.position.x = sd * 9.05; blimp.add(sc2); }
      const fin = new THREE.Mesh(G.box, std(0xff4a3a)); fin.scale.set(.4, 9, 6); fin.position.set(0, 4, -24); blimp.add(fin);
      group.add(blimp);
      updaters.push((dt, t) => { const a = t * .02; blimp.position.set(Math.cos(a) * 260, 105, Math.sin(a) * 200); blimp.rotation.y = -a; screen.offset.x = (t * .05) % 1; });
      const heli = new THREE.Group(), hb = new THREE.Mesh(G.sphere, std(0x1a2a4a, { metalness: .5 })); hb.scale.set(1.6, 1.5, 3); heli.add(hb);
      const tailb = new THREE.Mesh(G.box, hb.material); tailb.scale.set(.4, .4, 5); tailb.position.z = -4; heli.add(tailb);
      const rotor = new THREE.Mesh(G.box, std(0x111111)); rotor.scale.set(12, .08, .4); rotor.position.y = 1.7; heli.add(rotor);
      const beamGeo = new THREE.ConeGeometry(9, 60, 20, 1, true); beamGeo.translate(0, -30, 0);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xf0f4ff, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); beam.rotation.x = .35; heli.add(beam);
      group.add(heli); updaters.push((dt, t) => { const a = -t * .07; heli.position.set(Math.cos(a) * 170, 75, Math.sin(a) * 140); heli.rotation.y = -a + Math.PI; rotor.rotation.y = t * 30; });
      const lights = [];
      for (let i = 0; i < 8; i++) { const sg = new THREE.ConeGeometry(14, 260, 24, 1, true); sg.translate(0, 130, 0); const l = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: [0x9ad8ff, 0xff9ad8, 0xfff0b0][i % 3], transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); const a = i / 8 * TAU + .3; l.position.set(Math.cos(a) * 380, fallY, Math.sin(a) * 340); group.add(l); lights.push([l, r() * 9]); }
      updaters.push((dt, t) => lights.forEach(([l, ph]) => { l.rotation.z = Math.sin(t * .3 + ph) * .45; l.rotation.x = Math.cos(t * .23 + ph) * .3; }));
      const sparks = [];
      for (let i = 0; i < 4; i++) { const b = { parts: [], t: -r() * 6, x: 0, y: 0, z: 0, color: 0 }; for (let k = 0; k < 26; k++) { const p = sprite(glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), 0xffffff, 3); p.visible = false; group.add(p); b.parts.push({ p, dx: Math.random() - .5, dy: Math.random() - .3, dz: Math.random() - .5 }); } sparks.push(b); }
      updaters.push((dt) => sparks.forEach(b => {
        b.t += dt; if (b.t > 3.2) { b.t = 0; const a = r() * TAU, d = 250 + r() * 250; b.x = Math.cos(a) * d; b.z = Math.sin(a) * d; b.y = 120 + r() * 60; const col = new THREE.Color().setHSL(r(), 1, .6); b.parts.forEach(q => q.p.material.color.copy(col)); }
        b.parts.forEach(q => { q.p.visible = b.t > 0 && b.t < 2; if (!q.p.visible) return; const u = b.t / 2; q.p.position.set(b.x + q.dx * 70 * u, b.y + q.dy * 70 * u - u * u * 20, b.z + q.dz * 70 * u); q.p.material.opacity = 1 - u; });
      }));
    }
    weather(500, 0x9ab8ff, .12, 14, 60, 30, .2);
  }

  // =====================================================================================
  function buildGalaxy() {
    const add2 = (o) => { group.add(o); return o; };
    // ---- the road itself: neon edge strips that pulse, a glassy underside, sparks rising from the edges ----
    const neonA = new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false, side: THREE.DoubleSide }), neonB = new THREE.MeshBasicMaterial({ color: 0xff4fd8, toneMapped: false, side: THREE.DoubleSide });
    neonA.userData.live = neonB.userData.live = true;
    for (const sd of [-1, 1]) { roadStrip(sd * (W / 2 + .05), sd * (W / 2 + .45), .07, sd > 0 ? neonA : neonB); roadStrip(sd * (W / 2 + .5), sd * (W / 2 + .5), -1.1, new THREE.MeshBasicMaterial({ color: 0x2a1060, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false })); }
    const underTex = canvasTex(256, (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(90,40,200,.85)'); gr.addColorStop(.5, 'rgba(30,10,80,.5)'); gr.addColorStop(1, 'rgba(90,40,200,.85)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(255,255,255,${r() * .6})`; g.fillRect(r() * s, r() * s, 1.5, 1.5); } }, 1);
    roadStrip(-W / 2 - .45, W / 2 + .45, -.9, new THREE.MeshBasicMaterial({ map: underTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    // light pulses racing along the edges
    const pulses = [];
    for (let k = 0; k < 40; k++) { const p = sprite(glowTex('rgba(255,255,255,1)', 'rgba(120,220,255,0)'), k % 2 ? 0x7af4ff : 0xff7ae8, 2.4); group.add(p); pulses.push({ p, u: r(), side: k % 2 ? 1 : -1, sp: .012 + r() * .01 }); }
    updaters.push((dt, t) => {
      neonA.color.setHSL(.5 + Math.sin(t * .7) * .08, 1, .6); neonB.color.setHSL(.85 + Math.sin(t * .6) * .06, 1, .6);
      for (const q of pulses) { q.u = (q.u + q.sp * dt) % 1; const s = track.sample(q.u), y = track.heightAt(q.u); q.p.position.set(s.x + s.nx * q.side * (W / 2 + .3), y + .45, s.z + s.nz * q.side * (W / 2 + .3)); q.p.visible = !track.inGap(q.u); }
    });
    // ---- a spiral galaxy below the course, slowly turning ----
    {
      const N = 42000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const arm = i % 4, rad = Math.pow(r(), .55) * 1900, ang = arm / 4 * TAU + rad * .0042 + (r() - .5) * (.5 + 300 / (rad + 60));
        const sc = (r() - .5) * (40 + rad * .05);
        pos[i * 3] = Math.cos(ang) * rad + sc; pos[i * 3 + 2] = Math.sin(ang) * rad + sc; pos[i * 3 + 1] = (r() - .5) * (60 - Math.min(50, rad * .03));
        const k = rad / 1900; c.setHSL(k < .15 ? .1 : .58 + (arm % 2) * .25 + r() * .08, .8, .55 + (1 - k) * .3); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const gal = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4.5, vertexColors: true, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), fog: false, toneMapped: false }));
      gal.position.set(0, -320, 0); gal.rotation.x = .18; gal.frustumCulled = false; group.add(gal);
      const core = add(sprite(glowTex('rgba(255,230,190,1)', 'rgba(255,160,80,0)'), 0xffd8a8, 700, true, .9), 0, -320, 0); core.material.fog = false;
      updaters.push((dt, t) => { gal.rotation.y = t * .008; });
      // distant stars in every direction
      const S = 6000, sp = new Float32Array(S * 3); for (let i = 0; i < S; i++) { const u = r() * 2 - 1, a = r() * TAU, rr = 1400 + r() * 400, q = Math.sqrt(1 - u * u); sp[i * 3] = Math.cos(a) * q * rr; sp[i * 3 + 1] = u * rr; sp[i * 3 + 2] = Math.sin(a) * q * rr; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 3, color: 0xffffff, transparent: true, depthWrite: false, fog: false, map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), toneMapped: false }));
      stars.frustumCulled = false; group.add(stars); updaters.push((dt, t) => { stars.material.opacity = .75 + Math.sin(t * 2) * .1; });
    }
    // ---- nebula clouds ----
    const nebTex = (a, b) => canvasTex(256, (g, s) => { g.clearRect(0, 0, s, s); clouds(g, s, r, 40, a, 20, 80); clouds(g, s, r, 30, b, 10, 50); const gr = g.createRadialGradient(s / 2, s / 2, s * .2, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 1);
    const nebs = [];
    [['rgba(255,80,200,.35)', 'rgba(120,80,255,.3)'], ['rgba(60,200,255,.35)', 'rgba(80,255,180,.25)'], ['rgba(255,140,60,.3)', 'rgba(255,60,120,.3)']].forEach(([a, b], i) => {
      const tex = nebTex(a, b); for (let k = 0; k < 3; k++) { const n = sprite(tex, 0xffffff, 500 + r() * 400, true, .7); const ang = (i * 3 + k) / 9 * TAU + r(); n.position.set(Math.cos(ang) * 1000, -50 + r() * 300, Math.sin(ang) * 1000); n.material.fog = false; n.material.rotation = r() * 6; group.add(n); nebs.push([n, r() * 9]); }
    });
    updaters.push((dt, t) => nebs.forEach(([n, ph]) => { n.material.rotation += dt * .005; n.material.opacity = .55 + Math.sin(t * .2 + ph) * .15; }));
    // ---- the sun inside the spiral: pulsing glow, corona, looping flares ----
    {
      const sx = 150, sz = -90, sy = -18;
      const sun = add(new THREE.Mesh(new THREE.SphereGeometry(26, 40, 24), new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false })), sx, sy, sz);
      const sunTex = canvasTex(256, (g, s) => { g.fillStyle = '#ff9a20'; g.fillRect(0, 0, s, s); for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(255,${200 + r() * 55},${80 + r() * 100},${r() * .6})`; const rr = 2 + r() * 8; g.beginPath(); g.arc(r() * s, r() * s, rr, 0, TAU); g.fill(); } }, 2);
      sun.material.map = sunTex; sun.material.needsUpdate = true;
      const corona = [add(sprite(glowTex('rgba(255,220,120,.95)', 'rgba(255,120,20,0)'), 0xffb040, 130), sx, sy, sz), add(sprite(glowTex('rgba(255,150,60,.5)', 'rgba(255,60,0,0)'), 0xff7020, 260, true, .7), sx, sy, sz)];
      corona.forEach(c => { c.material.fog = false; });
      const flareMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .8, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
      const flares = []; for (let k = 0; k < 5; k++) { const f = add(new THREE.Mesh(new THREE.TorusGeometry(10 + r() * 8, 1.2, 8, 30, Math.PI), flareMat), sx, sy, sz); f.rotation.set(r() * 6, r() * 6, 0); f.userData.ph = r() * 9; flares.push(f); }
      updaters.push((dt, t) => { sunTex.offset.set(t * .01, t * .006); const k = 1 + Math.sin(t * 1.3) * .04; sun.scale.setScalar(k); corona[0].scale.setScalar(130 * (1 + Math.sin(t * 2) * .06)); flares.forEach(f => { const u = ((t * .25 + f.userData.ph) % 1); f.position.set(sx, sy, sz); f.scale.setScalar(1.2 + u * .9); f.material.opacity = (1 - u) * .8; f.rotation.y += dt * .3; }); });
    }
    // ---- planets: a ringed giant, a banded gas giant with a moon, a blue world ----
    {
      const bands = (cols) => canvasTex(256, (g, s) => { for (let y = 0; y < s; y += 4) { g.fillStyle = cols[Math.floor((Math.sin(y * .09) * .5 + .5) * cols.length) % cols.length]; g.fillRect(0, y, s, 4); } for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.ellipse(r() * s, r() * s, 20 + r() * 30, 3 + r() * 5, 0, 0, TAU); g.fill(); } }, 1);
      const planet = (x, y, z, rad, tex, ring) => {
        const p = add(new THREE.Mesh(new THREE.SphereGeometry(rad, 48, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: .8, emissive: 0x221133, emissiveIntensity: .3 })), x, y, z);
        if (ring) { const rg = new THREE.RingGeometry(rad * 1.4, rad * 2.3, 96, 1); const pos = rg.attributes.position, uv = rg.attributes.uv; for (let i = 0; i < pos.count; i++) { const d = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (d - rad * 1.4) / (rad * .9), .5); }
          const rt = canvasTex(256, (g, s) => { for (let x2 = 0; x2 < s; x2 += 2) { g.fillStyle = `rgba(${200 + r() * 55},${170 + r() * 60},${140 + r() * 60},${.2 + r() * .6})`; g.fillRect(x2, 0, 2, s); } }, 1);
          const ringM = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); ringM.rotation.x = -Math.PI / 2 + .45; p.add(ringM); }
        return p;
      };
      const giant = planet(-600, 180, -700, 150, bands(['#d8b080', '#c8905a', '#f0d8b0', '#a86a40']), true);
      const gas = planet(800, 60, 300, 110, bands(['#6a8aff', '#9ab8ff', '#4a5ad8', '#c8d8ff']), false);
      const blue = planet(-300, 260, 900, 70, bands(['#2a7ad8', '#3ab86a', '#2a6ac8', '#f4f8ff']), false);
      const moon = planet(0, 0, 0, 22, bands(['#aaaaaa', '#888888', '#cccccc']), false);
      updaters.push((dt, t) => { giant.rotation.y = t * .02; gas.rotation.y = t * .03; blue.rotation.y = t * .04; moon.position.set(800 + Math.cos(t * .05) * 230, 80, 300 + Math.sin(t * .05) * 230); });
    }
    // ---- a black hole with a spinning accretion disk ----
    {
      const bx = 700, by = 220, bz = -900;
      add(new THREE.Mesh(new THREE.SphereGeometry(55, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })), bx, by, bz);
      const diskTex = canvasTex(256, (g, s) => { for (let k = 0; k < 400; k++) { const a = r() * TAU, d = 40 + r() * 80; g.strokeStyle = `hsla(${20 + r() * 30},100%,${50 + r() * 40}%,${r() * .5})`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.arc(s / 2, s / 2, d, a, a + .6 + r()); g.stroke(); } }, 1);
      const disk = add(new THREE.Mesh(new THREE.RingGeometry(70, 240, 96, 1), new THREE.MeshBasicMaterial({ map: diskTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })), bx, by, bz);
      disk.rotation.x = -Math.PI / 2 + .35;
      const halo = add(sprite(glowTex('rgba(255,180,90,.7)', 'rgba(255,80,0,0)'), 0xffa050, 520, true, .6), bx, by, bz); halo.material.fog = false;
      updaters.push((dt, t) => { disk.rotation.z = t * .25; });
    }
    // ---- asteroid belt orbiting around the course ----
    {
      const belt = new THREE.Group(), rock = std(0x7a6a62, { flatShading: true, roughness: 1 }), rockGeo = new THREE.IcosahedronGeometry(1, 0);
      const n = 260, im = new THREE.InstancedMesh(rockGeo, rock, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < n; i++) { const a = r() * TAU, d = 380 + r() * 160, s = 1.5 + r() * 7; e.set(r() * 6, r() * 6, r() * 6); q.setFromEuler(e); m4.compose(new THREE.Vector3(Math.cos(a) * d, -30 + (r() - .5) * 60, Math.sin(a) * d), q, new THREE.Vector3(s, s * (.6 + r() * .6), s)); im.setMatrixAt(i, m4); }
      belt.add(im); group.add(belt); updaters.push((dt, t) => { belt.rotation.y = t * .01; });
    }
    // ---- space whales: huge, glowing and gentle, swimming past the course ----
    {
      const whaleTex = canvasTex(128, (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#1a2a80'); gr.addColorStop(1, '#5ae0ff'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(255,255,255,${r() * .8})`; g.beginPath(); g.arc(r() * s, r() * s, 1 + r() * 2.5, 0, TAU); g.fill(); } }, 1);
      const whaleMat = new THREE.MeshStandardMaterial({ map: whaleTex, emissive: 0x3a7aff, emissiveMap: whaleTex, emissiveIntensity: .8, transparent: true, opacity: .9, roughness: .4 });
      const whales = [];
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Group(), b = new THREE.Mesh(G.sphere, whaleMat); b.scale.set(9, 7, 30); w.add(b);
        const tail = new THREE.Group(), flk = new THREE.Mesh(G.box, whaleMat); flk.scale.set(22, .8, 7); flk.position.z = -6; tail.add(flk); tail.position.z = -28; w.add(tail);
        const fins = [-1, 1].map(sd => { const f = new THREE.Mesh(G.box, whaleMat); f.scale.set(14, .6, 5); f.position.set(sd * 13, -3, 6); f.rotation.z = sd * .4; w.add(f); return f; });
        const trail = []; for (let k = 0; k < 16; k++) { const p = sprite(glowTex('rgba(150,230,255,1)', 'rgba(80,120,255,0)'), 0x9ae8ff, 6, true, .7); group.add(p); trail.push(p); }
        group.add(w); whales.push({ w, tail, fins, trail, rad: 330 + i * 120, y: 50 + i * 35, sp: .025 - i * .004, ph: i * 2.1, hist: [] });
      }
      updaters.push((dt, t) => whales.forEach(o => {
        const a = o.ph + t * o.sp, x = Math.cos(a) * o.rad, z = Math.sin(a) * o.rad * .8, y = o.y + Math.sin(t * .3 + o.ph) * 12;
        o.w.position.set(x, y, z); o.w.rotation.y = -a + Math.PI; o.w.rotation.x = Math.cos(t * .3 + o.ph) * .08;
        o.tail.rotation.x = Math.sin(t * 1.4 + o.ph) * .35; o.fins.forEach((f, k) => { f.rotation.x = Math.sin(t * 1.4 + o.ph + k) * .2; });
        o.hist.unshift([x, y, z]); if (o.hist.length > 160) o.hist.pop();
        o.trail.forEach((p, k) => { const h = o.hist[Math.min(o.hist.length - 1, k * 10)]; p.position.set(h[0], h[1], h[2]); p.material.opacity = .6 * (1 - k / 16); p.scale.setScalar(8 - k * .4); });
      }));
    }
    // ---- comets and shooting stars ----
    {
      const comets = [];
      for (let i = 0; i < 6; i++) { const head = sprite(glowTex('rgba(255,255,255,1)', 'rgba(140,220,255,0)'), 0xcff4ff, 10); group.add(head); const tail = []; for (let k = 0; k < 14; k++) { const p = sprite(glowTex('rgba(160,230,255,.9)', 'rgba(80,140,255,0)'), 0x9ad8ff, 8, true, .6); group.add(p); tail.push(p); } comets.push({ head, tail, ph: r() * 20, a: r() * TAU, y: 120 + r() * 220 }); }
      updaters.push((dt, t) => comets.forEach(c => {
        const k = ((t + c.ph) % 14) / 14, on = k < .45, u = k / .45; c.head.visible = on; c.tail.forEach(p => { p.visible = on; }); if (!on) return;
        const dx = Math.cos(c.a), dz = Math.sin(c.a), x = -dx * 900 + dx * 1800 * u, z = -dz * 900 + dz * 1800 * u, y = c.y - u * 120;
        c.head.position.set(x, y, z); c.tail.forEach((p, i) => { p.position.set(x - dx * i * 9, y + i * .6, z - dz * i * 9); p.scale.setScalar(9 - i * .5); });
      }));
    }
    // ---- a ring-shaped space station turning slowly, with blinking lights ----
    {
      const st = new THREE.Group(), metal = std(0xc8ccd8, { metalness: .7, roughness: .3 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(70, 6, 12, 64), metal); st.add(ring);
      for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(G.cyl, metal); sp.scale.set(2, 140, 2); sp.rotation.z = k * Math.PI / 4; st.add(sp); }
      const hub = new THREE.Mesh(G.sphere, metal); hub.scale.setScalar(14); st.add(hub);
      const win = new THREE.Mesh(new THREE.TorusGeometry(70, 6.2, 4, 64), new THREE.MeshBasicMaterial({ color: 0xffe8a0, wireframe: true, toneMapped: false })); st.add(win);
      st.position.set(-520, 140, 420); st.rotation.x = 1.1; group.add(st);
      updaters.push((dt, t) => { st.rotation.z = t * .05; });
    }
    // ---- floating crystals near the road that turn and glow ----
    {
      const crystals = [], cmats = [0x7af4ff, 0xff7ae8, 0xb08aff, 0x7aff9a].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .7, roughness: .1, metalness: .3, flatShading: true, transparent: true, opacity: .9 }));
      const octa = new THREE.OctahedronGeometry(1, 0);
      for (let d = 20; d < track.length; d += 34) {
        const t = d / track.length, s = track.sample(t), side = r() < .5 ? -1 : 1, off = W / 2 + 10 + r() * 30, x = s.x + s.nx * side * off, z = s.z + s.nz * side * off;
        if (!free(x, z, W / 2 + 7)) continue;
        const c = add(new THREE.Mesh(octa, cmats[crystals.length % 4]), x, track.heightAt(t) + 2 + r() * 14, z); const sc = 1.5 + r() * 3; c.scale.set(sc, sc * 1.8, sc); crystals.push([c, r() * 9, c.position.y]);
      }
      updaters.push((dt, t) => crystals.forEach(([c, ph, y]) => { c.rotation.y = t * .6 + ph; c.position.y = y + Math.sin(t * .8 + ph) * 1.5; }));
    }
    // ---- the start gate: a ring of light over the road ----
    {
      const s = track.sample(30 / track.length), y = track.heightAt(30 / track.length);
      const gate = add(new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 3, .8, 12, 64), new THREE.MeshBasicMaterial({ color: 0x7af4ff, toneMapped: false })), s.x, y + 2, s.z);
      gate.rotation.y = s.angle;
      const gate2 = add(new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 4.6, .35, 8, 64), new THREE.MeshBasicMaterial({ color: 0xff7ae8, toneMapped: false })), s.x, y + 2, s.z); gate2.rotation.y = s.angle;
      updaters.push((dt, t) => { gate.rotation.z = t * .5; gate2.rotation.z = -t * .7; gate.material.color.setHSL((t * .05) % 1, 1, .65); });
    }
    weather(500, 0xe8e0ff, .25, .4, 90, 40, 3);
  }
}
