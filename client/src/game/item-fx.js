import * as THREE from 'three';

// Visuals for the newer items: the protective bubble around a kart, ink blots on the screen,
// the sparkle where two karts swapped places and the spring under a jumping kart.
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
// Soap-film look: transparent in the middle, bright and rainbow-tinted at the rim.
function bubbleTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  for (let x = 0; x < 256; x++) { g.fillStyle = `hsla(${(x / 256) * 360},90%,75%,1)`; g.fillRect(x, 0, 1, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

export function createItemFx(scene) {
  const glow = glowTexture(), film = bubbleTexture();
  const bubbleGeo = new THREE.SphereGeometry(1.55, 32, 20);
  const bubbleMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { film: { value: film }, time: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D film; uniform float time; varying vec3 vN; varying vec3 vV; varying vec2 vUv; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); vec3 c = texture2D(film, vec2(vUv.x * 2.0 + vUv.y + time * .08, .5)).rgb; gl_FragColor = vec4(mix(vec3(.55,.85,1.0), c, .6) * (f * 1.1 + .06), f * .9 + .05); }',
  });
  const bubbles = new Map(), pops = [], sparkles = [];
  function bubble(key, c, ms) {
    let b = bubbles.get(key);
    const on = !!c && (c.bubbleT > 0 || c.bubble === true);
    if (!b) { if (!on) return; b = new THREE.Mesh(bubbleGeo, bubbleMat); b.renderOrder = 5; scene.add(b); bubbles.set(key, b); }
    b.visible = on; if (!on) return;
    const t = ms / 1000, k = 1 + Math.sin(t * 5 + key.length) * .03;
    b.position.set(c.x, (c.y || 0) + .62, c.z); b.scale.set(k * 1.05, k * .82, k * 1.25); b.rotation.y = (c.angle || 0);
    bubbleMat.uniforms.time.value = t;
  }
  // A ring of glints flying outward (bubble popped, swap).
  function burst(x, y, z, color, n = 16, speed = 6) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      const a = i / n * Math.PI * 2; s.position.set(x, y + .6, z); s.scale.setScalar(.7); scene.add(s);
      sparkles.push({ s, vx: Math.cos(a) * speed, vy: 2 + Math.random() * 3, vz: Math.sin(a) * speed, life: .8 });
    }
  }
  function pop(x, y, z) { burst(x, y, z, 0x9ae8ff, 20, 7); }
  // Confetti: little coloured paper squares tumbling down (race start, finish).
  const paperGeo = new THREE.PlaneGeometry(.18, .12), papers = [], paperCols = [0xff4a3a, 0xffd04a, 0x3ab8ff, 0x5ad86a, 0xff7ac2, 0xffffff].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  function confetti(x, y, z, n = 140, spread = 8) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(paperGeo, paperCols[i % paperCols.length]); m.position.set(x + (Math.random() - .5) * spread, y + 5 + Math.random() * 3, z + (Math.random() - .5) * spread); scene.add(m);
      papers.push({ m, vx: (Math.random() - .5) * 6, vy: 4 + Math.random() * 5, vz: (Math.random() - .5) * 6, sx: Math.random() * 9, sy: Math.random() * 9, life: 3 + Math.random() * 1.5 });
    }
  }
  function swapFx(x, y, z) { burst(x, y, z, 0xffd84a, 14, 4); burst(x, y, z, 0xff6ad8, 10, 2.5); }
  function tick(dt) {
    for (let i = papers.length - 1; i >= 0; i--) { const p = papers[i]; p.life -= dt; if (p.life <= 0) { scene.remove(p.m); papers.splice(i, 1); continue; } p.vy = Math.max(-2.2, p.vy - 9 * dt); p.vx *= Math.exp(-dt); p.vz *= Math.exp(-dt); p.m.position.x += (p.vx + Math.sin(p.life * 3) * .6) * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.m.rotation.x += p.sx * dt; p.m.rotation.y += p.sy * dt; }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const p = sparkles[i]; p.life -= dt;
      if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); sparkles.splice(i, 1); continue; }
      p.vy -= 9 * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt; p.s.material.opacity = Math.min(1, p.life * 1.6);
    }
    void pops;
  }
  function clear() { for (const b of bubbles.values()) b.visible = false; }

  // Ink: dark splats over the screen that drip and fade out over the last second and a half.
  const ink = document.createElement('div'); ink.id = 'inkOverlay'; ink.setAttribute('aria-hidden', 'true');
  ink.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const x = [18, 62, 38, 80, 8, 52, 28][i], y = [20, 14, 46, 52, 64, 72, 30][i], s = [30, 24, 34, 22, 20, 26, 16][i];
    const blobs = Array.from({ length: 9 }, () => { const a = Math.random() * 6.28, d = 20 + Math.random() * 18; return `<circle cx="${50 + Math.cos(a) * d}" cy="${50 + Math.sin(a) * d}" r="${6 + Math.random() * 10}"/>`; }).join('');
    return `<svg viewBox="0 0 100 100" style="left:${x - s / 2}%;top:${y - s / 2}%;width:${s}vw;height:${s}vw"><g fill="#160a24"><circle cx="50" cy="50" r="32"/>${blobs}<rect x="${44 + Math.random() * 8}" y="50" width="5" height="${30 + Math.random() * 18}" rx="2.5"/></g><circle cx="40" cy="40" r="6" fill="rgba(255,255,255,.18)"/></svg>`;
  }).join('');
  document.body.appendChild(ink);
  let shown = -1;
  function inkLevel(t) {
    const o = t > 0 ? Math.min(1, t / 1.5) * .94 : 0;
    if (Math.abs(o - shown) < .01) return; shown = o;
    ink.style.opacity = o.toFixed(2); ink.style.display = o > 0 ? 'block' : 'none';
  }
  return { bubble, pop, swapFx, tick, clear, inkLevel, confetti };
}
