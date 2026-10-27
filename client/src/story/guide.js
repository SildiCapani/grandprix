import * as THREE from 'three';

// GPS for the story mode: a glowing ribbon on the ground from the car to where you should go.
// Far targets are routed over the road network (Dijkstra on the road samples), near ones get a straight line over the terrain.
// Mission routes (rings, races, chases through the canyon) are followed exactly.
//   const gps = createGuide(scene, isl);  gps.target(x, z, color, {direct}) · gps.route(route, s0, s1, color) · gps.off() · gps.update(dt, t, player) · gps.path
export function createGuide(scene, isl) {
  // ----- road graph -----
  const nodes = [], CELL = 12, grid = new Map(), key = (i, j) => i * 100003 + j;
  for (const rd of isl.roads) {
    const base = nodes.length, n = rd.pts.length;
    rd.pts.forEach(p => nodes.push({ x: p.x, z: p.z, hw: rd.hw, rd, adj: [] }));
    const link = (a, b) => { const A = nodes[a], B = nodes[b], d = Math.hypot(A.x - B.x, A.z - B.z); A.adj.push(b, d); B.adj.push(a, d); };
    for (let k = 0; k < n - 1; k++) link(base + k, base + k + 1);
    if (rd.closed) link(base + n - 1, base);
  }
  nodes.forEach((nd, i) => { const k = key(Math.floor(nd.x / CELL), Math.floor(nd.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  // junctions: samples of two different roads that lie on top of each other
  nodes.forEach((A, i) => {
    const ci = Math.floor(A.x / CELL), cj = Math.floor(A.z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(key(ci + a, cj + b)) || []) {
      if (j <= i) continue; const B = nodes[j]; if (B.rd === A.rd) continue;
      const d = Math.hypot(A.x - B.x, A.z - B.z); if (d < Math.max(A.hw, B.hw) * .8 + 1) { A.adj.push(j, d); B.adj.push(i, d); }
    }
  });
  function nearestNode(x, z, reach) {
    let best = -1, bd = reach; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), R = Math.ceil(reach / CELL);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (const j of grid.get(key(ci + a, cj + b)) || []) { const d = Math.hypot(nodes[j].x - x, nodes[j].z - z); if (d < bd) { bd = d; best = j; } }
    return best < 0 ? null : { i: best, d: bd };
  }
  const dist = new Float64Array(nodes.length), prev = new Int32Array(nodes.length), heap = [];
  function shortest(from, to) {
    dist.fill(Infinity); prev.fill(-1); dist[from] = 0; heap.length = 0; push(0, from);
    while (heap.length) {
      const [d, u] = pop(); if (d > dist[u]) continue; if (u === to) break;
      const adj = nodes[u].adj; for (let k = 0; k < adj.length; k += 2) { const v = adj[k], nd = d + adj[k + 1]; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); } }
    }
    if (!isFinite(dist[to])) return null;
    const out = []; for (let u = to; u >= 0; u = prev[u]) out.push(u); out.reverse(); return { list: out, len: dist[to] };
  }
  function push(d, u) { heap.push([d, u]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } }
  function pop() { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; }

  // ----- the ribbon -----
  const MAXP = 420, STEP = 1.6, HALFW = 1.5;
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
    // soft glowing band with a bright core, chevrons pointing along +v (towards the target)
    const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.18, 'rgba(255,255,255,.35)'); gr.addColorStop(.5, 'rgba(255,255,255,.55)'); gr.addColorStop(.82, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(12, 46); g.lineTo(32, 20); g.lineTo(52, 46); g.lineTo(52, 58); g.lineTo(32, 32); g.lineTo(12, 58); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  const pos = new Float32Array(MAXP * 2 * 3), uv = new Float32Array(MAXP * 2 * 2), col = new Float32Array(MAXP * 2 * 4), idx = [];
  for (let k = 0; k < MAXP - 1; k++) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage)); geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffd23a, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  const ribbon = new THREE.Mesh(geo, mat); ribbon.frustumCulled = false; ribbon.renderOrder = 5; ribbon.visible = false; scene.add(ribbon);
  // a darker under-layer so the line also reads on snow and sand
  const under = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, vertexColors: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  under.frustumCulled = false; under.renderOrder = 4; under.visible = false; scene.add(under);
  // the target: a pulsing ring on the ground
  const pin = new THREE.Group();
  const pinRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 40), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); pinRing.rotation.x = -Math.PI / 2; pin.add(pinRing);
  const pinRing2 = pinRing.clone(); pinRing2.material = pinRing.material.clone(); pin.add(pinRing2);
  pin.visible = false; scene.add(pin);

  const want = { mode: null, x: 0, z: 0, color: new THREE.Color(0xffd23a), direct: false, route: null, s0: 0, s1: 0 };
  let path = [], recalc = 0, lastKey = '';
  const api = {
    get path() { return path; },
    get active() { return !!want.mode; },
    target(x, z, color = '#ffd23a', o = {}) { if (want.mode !== 'target' || Math.hypot(want.x - x, want.z - z) > 6 || want.direct !== !!o.direct) recalc = 0; Object.assign(want, { mode: 'target', x, z, direct: !!o.direct, pin: o.pin !== false }); want.color.set(color); },
    route(route, s0, s1, color = '#ffd23a') { if (want.route !== route) recalc = 0; Object.assign(want, { mode: 'route', route, s0, s1, pin: false }); want.color.set(color); },
    off() { want.mode = null; path = []; ribbon.visible = under.visible = pin.visible = false; },
    update(dt, t, pl) {
      if (!want.mode) return;
      recalc -= dt; if (recalc <= 0) { recalc = want.mode === 'route' ? .15 : .35; build(pl); }
      tex.offset.y = -t * 1.4;
      mat.color.copy(want.color); pinRing.material.color.copy(want.color); pinRing2.material.color.copy(want.color);
      const k = (t * .8) % 1; pinRing.scale.setScalar(1 + k * 1.6); pinRing.material.opacity = 1 - k; pinRing2.scale.setScalar(1 + ((k + .5) % 1) * 1.6); pinRing2.material.opacity = 1 - (k + .5) % 1;
    },
  };

  function build(pl) {
    let line;
    if (want.mode === 'route') {
      const R = want.route, P = R.pts; line = [[pl.x, pl.z]];
      for (const p of P) if (p.s > want.s0 + 3 && p.s < want.s1) line.push([p.x, p.z]);
      const e = at(R, want.s1); line.push([e.x, e.z]);
    } else {
      const direct = Math.hypot(want.x - pl.x, want.z - pl.z);
      line = [[pl.x, pl.z], [want.x, want.z]];
      if (!want.direct && direct > 70) {
        const a = nearestNode(pl.x, pl.z, 60), b = nearestNode(want.x, want.z, 140);
        if (a && b) { const r = shortest(a.i, b.i); if (r && r.len + a.d + b.d < direct * 3) line = [[pl.x, pl.z], ...r.list.map(i => [nodes[i].x, nodes[i].z]), [want.x, want.z]]; }
      }
    }
    path = line; draw(line, pl);
  }
  function at(R, s) { const P = R.pts; s = Math.max(0, Math.min(R.length, s)); let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; } const a = P[lo], b = P[hi], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }; }

  function draw(line, pl) {
    // resample evenly, starting a few metres in front of the car
    const pts = []; let carry = 0, total = 0, start = 3.5;
    for (let k = 0; k < line.length - 1 && pts.length < MAXP; k++) {
      const [x0, z0] = line[k], [x1, z1] = line[k + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-3) continue;
      let d = carry; while (d <= L && pts.length < MAXP) { const s = total + d; if (s >= start) pts.push([x0 + (x1 - x0) * d / L, z0 + (z1 - z0) * d / L, s]); d += STEP; }
      carry = d - L; total += L;
    }
    const end = line[line.length - 1]; if (pts.length < MAXP && total > start) pts.push([end[0], end[1], total]);
    const n = pts.length; if (n < 2) { ribbon.visible = under.visible = false; pin.visible = false; return; }
    const shown = pts[n - 1][2], last = n === MAXP ? shown : total;
    for (let k = 0; k < MAXP; k++) {
      const q = pts[Math.min(k, n - 1)], a = pts[Math.max(0, Math.min(k, n - 1) - 1)], b = pts[Math.min(n - 1, Math.min(k, n - 1) + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const y = isl.ground(q[0], q[1]) + .16, s = q[2];
      // fade in at the car, fade out at the end of what we draw, thin out with distance
      const fa = k >= n ? 0 : Math.min(1, (s - start) / 6) * Math.min(1, (last - s) / 5 + (n === MAXP ? 0 : .15)) * (1 - Math.min(.6, (s - start) / 900));
      for (const side of [0, 1]) {
        const sd = side ? 1 : -1, o = (k * 2 + side);
        pos[o * 3] = q[0] - tz * HALFW * sd; pos[o * 3 + 1] = y; pos[o * 3 + 2] = q[1] + tx * HALFW * sd;
        uv[o * 2] = side; uv[o * 2 + 1] = s / 3.2;
        col[o * 4] = col[o * 4 + 1] = col[o * 4 + 2] = 1; col[o * 4 + 3] = Math.max(0, fa);
      }
    }
    // additive blending ignores alpha, so the fade goes into the vertex colour as well
    for (let o = 0; o < MAXP * 2; o++) { const a = col[o * 4 + 3]; col[o * 4] = col[o * 4 + 1] = col[o * 4 + 2] = a; }
    geo.attributes.position.needsUpdate = geo.attributes.uv.needsUpdate = geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
    ribbon.visible = true; under.visible = true;
    if (want.pin && n < MAXP) { const e = line[line.length - 1]; pin.position.set(e[0], isl.ground(e[0], e[1]) + .25, e[1]); pin.visible = true; } else pin.visible = false;
  }
  return api;
}
