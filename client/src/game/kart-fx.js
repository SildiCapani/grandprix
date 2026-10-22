import * as THREE from 'three';

// Kart effects in one cheap particle system (two draw calls in total, however many karts are racing):
//   drift sparks (white → blue → orange → purple with the mini-turbo tier), tyre smoke while drifting,
//   dust on offroad ground, fire from the exhausts while boosting, a dust ring on landing and
//   dizzy stars circling the driver's head after a hit.
const MAX = 3000;
function system(scene, additive) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
    uniforms: { scale: { value: 600 } },
    vertexShader: 'attribute vec4 pcolor; attribute float psize; uniform float scale; varying vec4 vC; void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / max(.5, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: additive
      ? 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, r); a = a * a; gl_FragColor = vec4(vC.rgb * (1.0 + 1.5 * (1.0 - smoothstep(0.0, .5, r))), vC.a * a); }'
      : 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d) * 2.0; float a = 1.0 - smoothstep(.55, 1.0, r); gl_FragColor = vec4(vC.rgb * (.85 + .15 * (1.0 - r)), vC.a * a); }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5; scene.add(pts);
  return { pts, pos, col, size, list: [] };
}

const TIER = [0xffffff, 0x3fa9ff, 0xff8a1a, 0xc44dff].map(c => new THREE.Color(c));
const FIRE = [new THREE.Color(0xfff2a0), new THREE.Color(0xff8a20), new THREE.Color(0xff3a10)], BLUEFIRE = [new THREE.Color(0xe0f6ff), new THREE.Color(0x5ab8ff), new THREE.Color(0x2a5aff)];
const _c = new THREE.Color();

export function createKartFx(scene, opts = {}) {
  const add = system(scene, true), soft = system(scene, false);
  let dustColor = new THREE.Color(opts.dust ?? 0xd8c8a8);
  const last = new Map(), stars = new Map();
  const starTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.translate(32, 32); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 12 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fillStyle = '#ffe04a'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#ff9a1a'; g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

  function emit(sys, x, y, z, vx, vy, vz, life, size, grow, color, alpha, gravity = 0, drag = 0) {
    if (sys.list.length >= MAX) sys.list.shift();
    sys.list.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r: color.r, g: color.g, b: color.b, a: alpha, gravity, drag });
  }
  // Per kart and frame. c = car state (core player / rival / online target), car = its 3D model.
  function kart(key, car, c, ms, tier = 0) {
    const prev = last.get(key) ?? ms, dt = Math.min(.05, Math.max(0, (ms - prev) / 1000)); last.set(key, ms);
    if (!c || !car?.visible || dt <= 0) { const s = stars.get(key); if (s) s.visible = false; return; }
    const a = c.angle || 0, sa = Math.sin(a), ca = Math.cos(a), y0 = (c.y || 0), sp = Math.abs(c.speed || 0);
    const at = (side, back, up = 0) => [c.x + ca * side + sa * back, y0 + up, c.z - sa * side + ca * back];
    const ground = !(c.airT > 0) && !(c.fallT > 0);
    // drift: sparks from both rear wheels + tyre smoke
    if (c.drift && ground) {
      const col = TIER[Math.min(3, tier)], n = tier ? 3 + tier * 2 : 1;
      for (const side of [-.42, .42]) {
        const [x, y, z] = at(side, -.55, .08);
        for (let i = 0; i < n * dt * 60 * .5; i++) emit(add, x, y, z, (Math.random() - .5) * 3 - sa * 2, 1.5 + Math.random() * 3, (Math.random() - .5) * 3 - ca * 2, .25 + Math.random() * .25, tier ? .09 + tier * .02 : .06, -.1, col, 1, -12, 1);
        if (Math.random() < dt * 10) emit(soft, x, y + .1, z, (Math.random() - .5) * .6, .4 + Math.random() * .4, (Math.random() - .5) * .6, .6 + Math.random() * .4, .22, 1.3, _c.setRGB(.92, .92, .92), .32, .3, 1.5);
      }
    }
    // offroad dust
    if (c.offroad && ground && sp > 4 && Math.random() < dt * 22) { const [x, y, z] = at((Math.random() - .5) * .8, -.6, .15); emit(soft, x, y, z, -sa * 2 + (Math.random() - .5), .8 + Math.random(), -ca * 2 + (Math.random() - .5), .9, .4, 2.2, dustColor, .55, .3, 1.2); }
    // boost fire from the exhausts
    const boosting = c.boosting || c.turboT > 0 || c.shroomT > 0 || c.b;
    if (boosting && !(c.rocketT > 0)) {
      const pal = c.starT > 0 ? BLUEFIRE : FIRE;
      for (const side of [-.16, .16]) { const [x, y, z] = at(side, -.95, .4); for (let i = 0; i < dt * 60 * 1.5; i++) { const k = Math.random(); emit(add, x, y, z, -sa * (4 + sp * .3) + (Math.random() - .5), .4 + Math.random() * .6, -ca * (4 + sp * .3) + (Math.random() - .5), .18 + Math.random() * .12, .22, -.5, pal[k < .4 ? 0 : k < .8 ? 1 : 2], .9, 0, 2); } }
    }
    // landing: ring of dust
    const wasAir = car.userData._air > 0; car.userData._air = c.airT || 0;
    if (wasAir && !(c.airT > 0) && ground) for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; emit(soft, c.x + Math.cos(t) * .6, y0 + .1, c.z + Math.sin(t) * .6, Math.cos(t) * 3, .6, Math.sin(t) * 3, .6, .45, 1.4, c.offroad ? dustColor : _c.setRGB(.9, .9, .9), .5, 0, 3); }
    // dizzy stars after a hit / spin-out
    let s = stars.get(key); const dizzy = (c.spin > 0 || c.spinA > .2 || c.sp > .2);
    if (dizzy && !s) { s = new THREE.Group(); for (let i = 0; i < 3; i++) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false })); st.scale.setScalar(.32); s.add(st); } scene.add(s); stars.set(key, s); }
    if (s) { s.visible = dizzy; if (dizzy) { s.position.set(c.x, y0 + 1.35, c.z); s.children.forEach((st, i) => { const t = ms * .006 + i * Math.PI * 2 / 3; st.position.set(Math.cos(t) * .45, Math.sin(t * 2) * .05, Math.sin(t) * .45); }); } }
  }
  // Hit: a burst of hot sparks and a white puff ring. Item box: a rainbow sparkle.
  const RAINBOW = [0xff4a4a, 0xffd04a, 0x5ad86a, 0x3ab8ff, 0xc44dff].map(c => new THREE.Color(c));
  function burst(x, y, z, kind = 'hit') {
    const box = kind === 'box';
    for (let i = 0; i < (box ? 26 : 34); i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 5; emit(add, x, y + .6, z, Math.cos(a) * v, 2 + Math.random() * 5, Math.sin(a) * v, .45 + Math.random() * .3, box ? .16 : .14, -.3, box ? RAINBOW[i % 5] : (i % 3 ? FIRE[1] : FIRE[0]), 1, -9, 1.2); }
    if (!box) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; emit(soft, x + Math.cos(a) * .5, y + .4, z + Math.sin(a) * .5, Math.cos(a) * 4, .8, Math.sin(a) * 4, .5, .5, 1.6, _c.setRGB(1, 1, 1), .6, 0, 3); }
  }
  function step(sys, dt, camera) {
    const L = sys.list; let n = 0;
    for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.life -= dt; if (p.life <= 0) { L.splice(i, 1); continue; } const d = Math.exp(-p.drag * dt); p.vx *= d; p.vz *= d; p.vy = p.vy * d + p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
    for (const p of L) { const u = p.life / p.max; sys.pos[n * 3] = p.x; sys.pos[n * 3 + 1] = p.y; sys.pos[n * 3 + 2] = p.z; sys.col[n * 4] = p.r; sys.col[n * 4 + 1] = p.g; sys.col[n * 4 + 2] = p.b; sys.col[n * 4 + 3] = p.a * Math.min(1, u * 2.5); sys.size[n] = Math.max(.01, p.size * (1 + p.grow * (1 - u))); n++; }
    const g = sys.pts.geometry; g.setDrawRange(0, n);
    if (n) { g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true; g.attributes.psize.needsUpdate = true; }
    sys.pts.material.uniforms.scale.value = (camera ? innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) : 600) * Math.min(devicePixelRatio, 1);
  }
  function update(dt, camera) { step(add, dt, camera); step(soft, dt, camera); }
  function setDust(color) { dustColor = new THREE.Color(color); }
  function clear() { add.list.length = 0; soft.list.length = 0; for (const s of stars.values()) s.visible = false; last.clear(); }
  return { kart, update, setDust, clear, burst };
}
