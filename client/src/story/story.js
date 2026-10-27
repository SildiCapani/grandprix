import * as THREE from 'three';
import { createIsland, ZONES, SEA, glowTex, VOLCANO } from './island.js';
import * as DRIVE from './drive.js';
import { makeCar, stepCar, aiStep, turbo, spinOut, TOP, angleDiff } from './drive.js';
import { CHAPTERS, MISSIONS, missionById, chapterMissions, openChapters, missionOpen, buildRoute, routeAt, routeProgress, routeSpeed, calibrate, missionStart, XP, storyDone } from './missions.js';
import { BOSS_CLASSES, droneModel, targetModel, starModel, itemBoxModel, rocketModel, projModel, wormModel, avalancheModel } from './bosses.js';
import { createCar, animateCar } from '../game/car-model.js';
import { createKartFx } from '../game/kart-fx.js';
import { createGuide } from './guide.js';

// =====================================================================================================================
// Story mode "Apex-Insel": free roam on an open island, missions with stars, boss races, boss fights and chases.
// main.js hands over the renderer and input; this module owns its own scene, camera, HUD and save state.
//   const story = createStory({ renderer, audio, look, load, save, addXP, onExit });  story.open() / story.frame(dt, controls, ms) / story.key(k, down)
// =====================================================================================================================

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GEARS = 30;

export function createStory(opts) {
  const { renderer, audio } = opts;
  let built = false, active = false, scene, camera, isl, sun, hemi, sky, fx, root, mini, miniCtx;
  let player, playerModel, look = {};
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), mode: 0, shake: 0, fov: 64 };
  let state = load();
  let mode = 'free';          // free · card · count · mission · result · paused · map · intro
  let mission = null, rt = null, countdown = 0, cardFor = null, resultInfo = null, pauseFrom = 'free';
  let padCool = 0, elapsed = 0, lastSafe = null, safeT = 0, zoneNow = null, zoneBannerT = 0, respawnT = 0, fadeT = 0, timeT = 0;
  const npcs = new Set(), hazards = [], projectiles = [], rockets = [], boxes = [], debris = [], pops = [];
  let beacons = [], gears = [], gps, hearts = 3, ammo = 0, padPrev = [];
  let waypoint = null, gpsInfo = null, mapHover = null, mapListHover = null;
  const traffic = [];

  function load() {
    const s = opts.load?.() || {};
    return { done: { ...(s.done || {}) }, best: { ...(s.best || {}) }, gears: [...(s.gears || [])], seen: [...(s.seen || [])], pos: s.pos || null };
  }
  function save(xp = 0) { opts.save?.(JSON.parse(JSON.stringify(state)), xp); }

  // -------------------------------------------------------------------------------------------------------------------
  // build once
  function build() {
    built = true;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe1ea); scene.fog = new THREE.Fog(0xcfe1ea, 260, 1500);
    camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .3, 3200); camera.rotation.order = 'YXZ';
    hemi = new THREE.HemisphereLight(0xdcefff, 0x8a8a6a, .95); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff1d8, 3.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .05;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xd6ecff, .7); fill.position.set(-200, 120, -150); scene.add(fill);
    // sky dome
    sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2f74d6) }, horizon: { value: new THREE.Color(0xd8ebf5) }, ground: { value: new THREE.Color(0x2a8ab0) }, sunDir: { value: new THREE.Vector3(.5, .55, .35).normalize() }, sunColor: { value: new THREE.Color(0xfff4dc) } },
      vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 top,horizon,ground,sunColor,sunDir;varying vec3 vDir;void main(){vec3 d=normalize(vDir);float y=d.y;vec3 c=y>0.?mix(horizon,top,pow(y,.45)):mix(horizon,ground,pow(min(1.,-y*3.),.5));float s=max(dot(d,normalize(sunDir)),0.);c+=sunColor*(pow(s,1400.)*7.+pow(s,40.)*.4+pow(s,5.)*.14);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' }));
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
    // reflections from the sky
    const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); envScene.add(sky.clone()); scene.environment = pm.fromScene(envScene, .02).texture; scene.environmentIntensity = .8;

    isl = createIsland(); scene.add(isl.group);
    fx = createKartFx(scene);
    gps = createGuide(scene, isl);
    placeGears();
    spawnTraffic();
    buildWeather();
    buildHud();
  }

  // -------------------------------------------------------------------------------------------------------------------
  // HUD
  function buildHud() {
    root = document.createElement('div'); root.id = 'story'; root.hidden = true;
    root.innerHTML = `
      <div class="st-zone"><small id="stZoneCh"></small><b id="stZone"></b><span id="stProg"></span></div>
      <div class="st-mini"><canvas id="stMini" width="300" height="300"></canvas><i class="st-n">N</i></div>
      <div class="st-gps" id="stGps" hidden><span id="stGpsIcon"></span><div><small id="stGpsKind"></small><b id="stGpsName"></b></div><i id="stGpsDist"></i></div>
      <div class="st-obj" id="stObj" hidden><small id="stObjKind"></small><b id="stObjTitle"></b><span id="stObjText"></span><strong id="stObjTime"></strong><div class="st-boss" id="stBoss" hidden><em id="stBossName"></em><div><i id="stBossBar"></i></div></div></div>
      <div class="st-hearts" id="stHearts" hidden></div>
      <div class="st-ammo" id="stAmmo" hidden><span>🚀</span><b id="stAmmoN">0</b><small>E / LB</small></div>
      <div class="st-speed"><b id="stSpeed">0</b><small>KM/H</small><i id="stDrift"></i></div>
      <div class="st-prompt" id="stPrompt" hidden></div>
      <div class="st-banner" id="stBanner" hidden><small></small><b></b><span></span></div>
      <div class="st-count" id="stCount" hidden></div>
      <div class="st-toast" id="stToast" hidden></div>
      <div class="st-card" id="stCard" hidden></div>
      <div class="st-modal" id="stModal" hidden></div>
      <div class="st-fade" id="stFade"></div>
      <div class="st-keys">WASD fahren · Leertaste driften · E feuern · R zurück auf die Straße · M Karte (GPS setzen) · Esc Pause</div>`;
    document.body.appendChild(root);
    mini = root.querySelector('#stMini'); miniCtx = mini.getContext('2d');
    root.addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (!b) return; act(b.dataset.st, b.dataset.id); });
  }
  const $ = id => root.querySelector('#' + id);
  let toastT = 0, bannerT = 0;
  function toast(text, ms = 1600) { const t = $('stToast'); t.textContent = text; t.hidden = false; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); toastT = ms / 1000; }
  function banner(kicker, title, line = '', s = 3.2, color = '#ffd23a') { const b = $('stBanner'); b.querySelector('small').textContent = kicker; b.querySelector('b').textContent = title; b.querySelector('span').textContent = line; b.style.setProperty('--bc', color); b.hidden = false; b.classList.remove('in'); void b.offsetWidth; b.classList.add('in'); bannerT = s; }
  function fade(fn) { const f = $('stFade'); f.classList.add('on'); setTimeout(() => { fn(); f.classList.remove('on'); }, 360); }
  function sfx(type) { const map = { ring: 'lap', smash: 'hit', pick: 'boost', go: 'go', win: 'finish', fail: 'hit', hurt: 'hit', slam: 'hit', boost: 'boost', tick: 'tick', splash: 'hit', fire: 'boost' }; try { audio?.bleep?.(map[type] || 'tick'); } catch {} }

  // -------------------------------------------------------------------------------------------------------------------
  // open / close
  function open(lk = {}) {
    if (!built) build();
    look = { color: '#e34335', kart: 'allround', finish: 'standard', skin: 'none', avatar: 'marco', wheel: 'standard', glider: 'standard', ...lk };
    if (playerModel) scene.remove(playerModel);
    playerModel = createCar(look.color, '07', look.kart, look.finish, look.skin, look.avatar, look.wheel, look.glider); scene.add(playerModel);
    player = makeCar({ kart: look.kart, wheel: look.wheel, glider: look.glider });
    const s = state.pos || isl.spawn; Object.assign(player, { x: s.x, z: s.z, y: isl.ground(s.x, s.z), angle: s.angle || 0 });
    lastSafe = { x: player.x, z: player.z, angle: player.angle };
    active = true; root.hidden = false; document.body.classList.add('story-on'); mode = 'free';
    refreshBeacons(); snapCamera(); resize(); addEventListener('resize', resize);
    if (!state.seen.includes('intro')) { state.seen.push('intro'); save(); showIntro(); }
    else banner('STORY-MODUS', 'APEX-INSEL', nextHint(), 3);
  }
  function close() {
    endMission(true); active = false; if (root) root.hidden = true; document.body.classList.remove('story-on'); removeEventListener('resize', resize);
    state.pos = { x: player.x, z: player.z, angle: player.angle }; save();
    opts.onExit?.();
  }
  function resize() { if (!camera) return; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  function showIntro() {
    mode = 'intro';
    modal(`<div class="st-intro"><small>STORY-MODUS</small><h2>APEX-INSEL</h2><p>Das <b>Phantom-Syndikat</b> hat die Insel übernommen. Sechs Zonen, sechs Bosse.<br>Fahr frei herum, finde die Missionen (Lichtsäulen) und hol dir die Insel zurück.</p>
      <ul><li><b>🏁 Missionen</b> Lichtsäule anfahren, ENTER zum Starten</li><li><b>👑 Bosse</b> öffnen sich nach den drei Aufgaben einer Zone</li><li><b>⚙️ ${GEARS} goldene Zahnräder</b> sind auf der Insel versteckt</li><li><b>M</b> öffnet die Karte, <b>R</b> setzt dich auf die Straße zurück</li></ul>
      <button class="primary" data-st="closeintro">LOS GEHT'S</button></div>`);
  }
  function modal(html) { const m = $('stModal'); m.innerHTML = html; m.hidden = false; m.querySelector('button')?.focus(); }
  function closeModal() { $('stModal').hidden = true; }
  function nextHint() {
    const open = MISSIONS.filter(m => missionOpen(m, state.done) && !state.done[m.id]);
    if (!open.length) return storyDone(state.done) ? 'Die Insel gehört wieder dir. Hol dir alle Sterne!' : '';
    const ch = CHAPTERS.find(c => c.id === open[0].ch); return `Kapitel ${ch.n} · ${ch.name}: ${open.length} offene Mission${open.length > 1 ? 'en' : ''}`;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // beacons (mission markers) and gears
  const emojiTex = new Map();
  function emoji(e, bg = null) {
    const k = e + bg; if (emojiTex.has(k)) return emojiTex.get(k);
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, TAU); g.fill(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke(); }
    g.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojiTex.set(k, t); return t;
  }
  function refreshBeacons() {
    for (const b of beacons) scene.remove(b.g); beacons = [];
    for (const m of MISSIONS) {
      if (!missionOpen(m, state.done)) continue;
      const route = m.route ? buildRoute(isl, m.route) : m.loop ? buildRoute(isl, m.loop) : null, s = missionStart(isl, m, route);
      const ch = CHAPTERS.find(c => c.id === m.ch), done = state.done[m.id], col = new THREE.Color(m.boss ? '#ff3a4a' : ch.color);
      const g = new THREE.Group(), y = isl.ground(s.x, s.z);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 70, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: done ? .12 : .28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      pillar.position.y = 35; g.add(pillar);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, .25, 8, 40), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = .4; g.add(ring);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji(m.icon, m.boss ? '#c8242a' : ch.color), depthWrite: false })); icon.scale.setScalar(5); icon.position.y = 8; g.add(icon);
      if (done) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: starsTex(done), depthWrite: false })); st.scale.set(6, 2, 1); st.position.y = 11.5; g.add(st); }
      g.position.set(s.x, y, s.z); scene.add(g);
      beacons.push({ m, g, x: s.x, z: s.z, start: s, route, ring, icon, pillar });
    }
  }
  function starsTex(n) { const c = document.createElement('canvas'); c.width = 192; c.height = 64; const g = c.getContext('2d'); g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; for (let i = 0; i < 3; i++) { g.fillStyle = i < n ? '#ffd23a' : 'rgba(255,255,255,.35)'; g.fillText('★', 32 + i * 64, 34); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
  function placeGears() {
    // deterministic spots: hilltops, mesa tops, the crater rim, behind houses, the end of the pier, stunt jumps
    const spots = [], rnd = (() => { let s = 99; return () => (s = s * 16807 % 2147483647) / 2147483647; })();
    const fixed = [[0, 700], [290, 650], [-240, 690], [210, 120], [250, 230], [170, 100], [VOLCANO.x + 70, VOLCANO.z + 30], [VOLCANO.x - 60, VOLCANO.z - 50], [-470, -450], [-240, -250], [-560, 300], [-640, -20], [560, -60], [640, 60], [520, -200], [600, 400], [440, 400], [-100, 300], [100, -100], [-300, 120]];
    for (const [x, z] of fixed) spots.push([x, z]);
    while (spots.length < GEARS) { const a = rnd() * TAU, d = 120 + rnd() * 560, x = Math.cos(a) * d, z = Math.sin(a) * d; if (isl.terrainAt(x, z) > 3) spots.push([x, z]); }
    gears = spots.slice(0, GEARS).map(([x, z], i) => { const m = starModel('gear'); m.scale.setScalar(1.3); const y = isl.ground(x, z) + 2.2; m.position.set(x, y, z); scene.add(m);
      const id = 'g' + i, got = state.gears.includes(id); m.visible = !got; return { id, m, x, y, z, got }; });
  }

  // -------------------------------------------------------------------------------------------------------------------
  // zone weather: snow on the glacier, ash and embers at the volcano, dust in the canyon, pollen and leaves in the jungle
  let wx = null;
  const WX = { glacier: { col: 0xffffff, size: .35, fall: 3.2, drift: 1.4, op: .95, fog: 0xe4eef6, far: 900 }, volcano: { col: 0x4a4040, size: .3, fall: 1.2, drift: .8, op: .8, ember: true, fog: 0xb09a92, far: 800 }, canyon: { col: 0xe0b080, size: .22, fall: .2, drift: 6, op: .55, fog: 0xecd2b0, far: 1200 }, jungle: { col: 0xd8ff8a, size: .16, fall: -.2, drift: .6, op: .8, fog: 0xc8e0c0, far: 1000 }, beach: { col: 0xffffff, size: .1, fall: .1, drift: 2, op: .2, fog: 0xd4ecf4, far: 1500 }, city: { col: 0xffffff, size: .1, fall: .1, drift: 1, op: 0, fog: 0xcfe1ea, far: 1500 }, plains: { col: 0xfff4a0, size: .12, fall: -.1, drift: 1, op: .35, fog: 0xd2e6e8, far: 1500 } };
  function buildWeather() {
    const N = 1600, pos = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - .5) * 90;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: .3, map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, opacity: 0, color: 0xffffff });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
    const eN = 260, epos = new Float32Array(eN * 3); for (let i = 0; i < eN * 3; i++) epos[i] = (Math.random() - .5) * 90;
    const egeo = new THREE.BufferGeometry(); egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const emat = new THREE.PointsMaterial({ size: .45, map: glowTex('rgba(255,220,120,1)', 'rgba(255,80,0,0)'), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, color: 0xffa040 });
    const ember = new THREE.Points(egeo, emat); ember.frustumCulled = false; scene.add(ember);
    wx = { pts, mat, pos, ember, emat, epos, cur: { ...WX.city } };
  }
  function stepWeather(dt, t) {
    if (!wx) return; const z = (zoneNow || isl.zoneAt(player.x, player.z)).id, W = WX[z] || WX.city, c = wx.cur, k = Math.min(1, dt * .8);
    for (const key of ['size', 'fall', 'drift', 'op']) c[key] += (W[key] - c[key]) * k; wx.mat.color.lerp(new THREE.Color(W.col), k);
    wx.mat.size = c.size; wx.mat.opacity = c.op; scene.fog.color.lerp(new THREE.Color(W.fog), k * .5); scene.fog.far += (W.far - scene.fog.far) * k * .5; scene.background.copy(scene.fog.color); sky.material.uniforms.horizon.value.lerp(new THREE.Color(W.fog), k * .5); wx.emat.opacity += ((W.ember ? .9 : 0) - wx.emat.opacity) * k;
    const P = wx.pos, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, wrap = (v, o) => ((v - o + 45) % 90 + 90) % 90 - 45 + o;
    for (let i = 0; i < P.length; i += 3) { P[i] = wrap(P[i] + (Math.sin(t * .7 + i) * .5 + .5) * c.drift * dt, cx); P[i + 1] = wrap(P[i + 1] - c.fall * dt, cy); P[i + 2] = wrap(P[i + 2] + Math.cos(t * .5 + i) * c.drift * .4 * dt, cz); }
    wx.pts.geometry.attributes.position.needsUpdate = true;
    if (wx.emat.opacity > .01) { const E = wx.epos; for (let i = 0; i < E.length; i += 3) { E[i] = wrap(E[i] + Math.sin(t + i) * dt, cx); E[i + 1] = wrap(E[i + 1] + 2.5 * dt, cy); E[i + 2] = wrap(E[i + 2] + Math.cos(t + i) * dt, cz); } wx.ember.geometry.attributes.position.needsUpdate = true; }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // traffic: other karts cruising the ring road and the jungle loop (free roam only)
  function spawnTraffic() {
    const cols = ['#3ab8ff', '#ffd23a', '#5ad86a', '#ff8ad8', '#ffffff', '#ff8a2a', '#8a6aff', '#2ad8c8'], avs = ['yuna', 'jax', 'lena', 'diego', 'amara', 'sofia', 'kenji', 'marco'], karts = ['allround', 'flitzer', 'buggy', 'drifter', 'brummer', 'bolide'];
    const loops = [[buildRoute(isl, [['ring', 0, .999, 'fw']]), 6], [buildRoute(isl, [['jungle', 0, .995, 'fw']]), 2]];
    let i = 0;
    for (const [route, n] of loops) for (let q = 0; q < n; q++, i++) {
      const s0 = route.length * q / n, p = routeAt(route, s0), c = makeCar({ kart: karts[i % karts.length] });
      Object.assign(c, { x: p.x, z: p.z, y: p.y, angle: p.angle });
      const model = createCar(cols[i % cols.length], String(10 + i), karts[i % karts.length], 'standard', 'none', avs[i % avs.length]); scene.add(model);
      traffic.push({ c, model, route, k: route.pts.findIndex(pt => pt.s >= s0), mul: .7 + (i % 3) * .06, key: 'tr' + i });
    }
  }
  function stepTraffic(dt) {
    for (const n of traffic) {
      const c = n.c, R = n.route, pr = routeProgress(R, c.x, c.z, n.k); n.k = pr.k; if (n.k > R.pts.length - 8) n.k = 0;
      if (pr.d > 35) { const p = routeAt(R, pr.s); Object.assign(c, { x: p.x, z: p.z, y: p.y, angle: p.angle, vx: 0, vz: 0, speed: 5 }); }
      const a = routeAt(R, (pr.s + 10 + c.speed * .35) % R.length), nx = Math.cos(a.angle), nz = -Math.sin(a.angle);
      let want = routeSpeed(R, pr.s, TOP * n.mul);
      const dx = player.x - c.x, dz = player.z - c.z, fwd = dx * Math.sin(c.angle) + dz * Math.cos(c.angle), lat = Math.abs(dx * Math.cos(c.angle) - dz * Math.sin(c.angle));
      if (fwd > 0 && fwd < 14 && lat < 2.6) want = Math.min(want, Math.max(0, player.speed - 2));
      npcDrive(n, aiStep(c, a.x - nx * 3.6, a.z - nz * 3.6, want, dt), dt);
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // input
  function key(k, down, e) {
    if (!active) return false;
    if (!down) return true;
    if (e?.repeat) return true;
    if (k === 'escape' || k === 'p') { if (mode === 'paused') unpause(); else if (mode === 'map') closeMap(); else if (mode === 'card') closeCard(); else if (mode === 'intro') { closeModal(); mode = 'free'; } else if (mode !== 'result') pause(); return true; }
    if (k === 'm' || k === 'tab') { if (mode === 'map') closeMap(); else if (mode === 'free' || mode === 'paused') openMap(); e?.preventDefault?.(); return true; }
    if (k === 'enter') { if (mode === 'card') startMission(cardFor); else if (mode === 'result') resultContinue(); else if (mode === 'intro') { closeModal(); mode = 'free'; } else if (mode === 'free' && nearBeacon) openCard(nearBeacon); return true; }
    if (k === 'r') { if (mode === 'result') retry(); else if (mode === 'free' || mode === 'mission') resetToRoad(); return true; }
    if (k === 'e' || k === 'shift') { if (mode === 'mission') fireRocket(); return true; }
    if (k === 'c') { cam.mode = (cam.mode + 1) % 2; return true; }
    return true;
  }
  function pollButtons() {
    const g = [...(navigator.getGamepads?.() || [])].find(x => x && x.connected); if (!g) return;
    const b = g.buttons, down = i => !!(b[i]?.pressed || b[i]?.value > .5), edge = i => down(i) && !padPrev[i];
    if (edge(9)) key('escape', true); if (edge(8)) key('m', true); if (edge(3)) key(mode === 'mission' ? 'e' : 'enter', true); if (edge(4)) key('e', true); if (edge(11) || edge(10)) key(mode === 'result' ? 'r' : 'r', true);
    if (edge(0) && (mode === 'card' || mode === 'result' || mode === 'intro')) key('enter', true); if (edge(1)) { if (mode === 'card') closeCard(); else if (mode === 'result') key('r', true); }
    padPrev = b.map((_, i) => down(i));
  }
  function act(a, id) {
    if (a === 'closeintro') { closeModal(); mode = 'free'; banner('KAPITEL 1', 'PORT APEX', CHAPTERS[0].line, 4, CHAPTERS[0].color); }
    else if (a === 'start') startMission(cardFor); else if (a === 'cardclose') closeCard();
    else if (a === 'resume') unpause(); else if (a === 'abort') { resultInfo = null; endMission(); unpause(true); } else if (a === 'retry') retry(); else if (a === 'continue') resultContinue();
    else if (a === 'map') openMap(); else if (a === 'closemap') closeMap(); else if (a === 'exit') close(); else if (a === 'road') { unpause(); resetToRoad(); }
    else if (a === 'go') { const b = beacons.find(q => q.m.id === id); if (b) { closeMap(); teleport(b.start); } }
  }
  function pause() { pauseFrom = mode; mode = 'paused'; modal(`<div class="st-pause"><h2>PAUSE</h2><button class="primary" data-st="resume">WEITER</button>${mission ? '<button data-st="retry">MISSION NEU STARTEN</button><button data-st="abort">MISSION ABBRECHEN</button>' : '<button data-st="road">ZURÜCK AUF DIE STRASSE</button>'}<button data-st="map">KARTE</button><button data-st="exit">ZUM HAUPTMENÜ</button></div>`); }
  function unpause(toFree = false) { closeModal(); mode = toFree || !mission ? 'free' : pauseFrom === 'paused' ? 'mission' : pauseFrom; if (mode === 'card' || mode === 'map') mode = 'free'; }

  // -------------------------------------------------------------------------------------------------------------------
  // map
  function openMap() {
    if (mode === 'paused') closeModal();
    mode = 'map'; mapHover = mapListHover = null; const done = state.done, openC = openChapters(done);
    const rows = CHAPTERS.map(c => { const list = chapterMissions(c.id), isOpen = openC.includes(c.id);
      return `<div class="sm-ch ${isOpen ? '' : 'locked'}" style="--cc:${c.color}"><b>${c.n}. ${c.name}</b>${list.map(m => { const st = done[m.id] || 0, ok = missionOpen(m, done);
        return `<button class="sm-m ${st ? 'done' : ''} ${ok ? '' : 'lock'}" ${ok ? `data-st="go" data-id="${m.id}"` : 'disabled'} data-hover="${m.id}" title="${esc(m.line)}"><span>${m.icon}</span><em>${esc(m.name)}</em><i>${ok ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒'}</i></button>`; }).join('')}</div>`; }).join('');
    modal(`<div class="st-map"><div class="sm-left"><canvas id="stBigMap" width="1040" height="1040"></canvas><small><b>Klick</b> auf die Karte oder eine Mission: GPS-Route setzen · <b>Rechtsklick</b>: Wegpunkt löschen · Mission in der Liste: Schnellreise</small></div><div class="sm-right"><h2>APEX-INSEL</h2><div class="sm-stats"><span>⭐ ${Object.values(done).reduce((a, b) => a + b, 0)} / ${MISSIONS.length * 3}</span><span>⚙️ ${state.gears.length} / ${GEARS}</span></div>${rows}<button class="primary" data-st="closemap">SCHLIESSEN (M)</button></div></div>`);
    const c = $('stBigMap'), at = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height]; };
    c.addEventListener('mousemove', e => { mapHover = pickMap(...at(e)); c.style.cursor = mapHover ? 'pointer' : 'crosshair'; });
    c.addEventListener('mouseleave', () => { mapHover = null; });
    c.addEventListener('click', e => { const h = pickMap(...at(e)); if (h) { waypoint = { x: h.x, z: h.z, name: h.m.name }; sfx('tick'); toast(`GPS: ${h.m.icon} ${h.m.name}`, 1100); return; }
      const [wx, wz] = mapToWorld(...at(e)); if (isl.terrainAt(wx, wz) < SEA) { toast('Da ist nur Wasser.', 900); return; } const nr = isl.nearestRoad(wx, wz, 40);
      waypoint = nr && nr.d < 30 ? { x: nr.x, z: nr.z } : { x: wx, z: wz }; sfx('tick'); toast('📍 WEGPUNKT GESETZT', 1000); });
    c.addEventListener('contextmenu', e => { e.preventDefault(); if (waypoint) { waypoint = null; sfx('tick'); toast('Wegpunkt gelöscht', 900); } });
    $('stModal').querySelectorAll('[data-hover]').forEach(b => { b.addEventListener('mouseenter', () => mapListHover = b.dataset.hover); b.addEventListener('mouseleave', () => mapListHover = null); });
    drawBigMap(timeT);
  }
  function closeMap() { closeModal(); mode = 'free'; }
  // big map view: the whole island fits, with a margin of sea around it
  const MAPV = { x0: -830, z0: -830, size: 1660 };
  const mapP = (x, z, S) => [(x - MAPV.x0) / MAPV.size * S, (z - MAPV.z0) / MAPV.size * S];
  const mapToWorld = (u, v) => { const S = $('stBigMap').width; return [MAPV.x0 + u / S * MAPV.size, MAPV.z0 + v / S * MAPV.size]; };
  function pickMap(u, v) { const S = $('stBigMap').width; let best = null, bd = 30; for (const b of beacons) { const [x, y] = mapP(b.x, b.z, S); const d = Math.hypot(u - x, v - (y - 26)); if (d < bd) { bd = d; best = b; } } return best; }
  function drawBigMap(t = 0) {
    const c = $('stBigMap'); if (!c) return; const g = c.getContext('2d'), S = c.width, H = isl.HALF, P = (x, z) => mapP(x, z, S), sc = S / MAPV.size;
    // sea + island atlas
    g.fillStyle = '#145f9a'; g.fillRect(0, 0, S, S);
    const [ix, iy] = P(-H, -H); g.imageSmoothingEnabled = true; g.drawImage(isl.mapCanvas, ix, iy, H * 2 * sc, H * 2 * sc);
    // grid like a printed atlas
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.font = '800 15px Arial'; g.fillStyle = 'rgba(255,255,255,.45)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= 8; k++) { const w = -800 + k * 200, [u] = P(w, 0), [, v] = P(0, w); g.beginPath(); g.moveTo(u, 0); g.lineTo(u, S); g.moveTo(0, v); g.lineTo(S, v); g.stroke(); if (k < 8) { g.fillText('ABCDEFGH'[k], u + 100 * sc, 14); g.fillText(String(k + 1), 12, v + 100 * sc); } }
    // zone names; chapters still locked are greyed out
    const openC = openChapters(state.done);
    for (const Z of ZONES) { const [x, y] = P(Z.x, Z.z), ch = CHAPTERS.find(q => q.id === Z.id), locked = ch && !openC.includes(ch.id);
      g.save(); g.globalAlpha = locked ? .55 : 1; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      if (ch) { g.font = '900 13px Arial'; const kt = locked ? `🔒 KAPITEL ${ch.n}` : `KAPITEL ${ch.n}`, w = g.measureText(kt).width + 16; g.fillStyle = Z.color; roundRect(g, x - w / 2, y - 44, w, 20, 10); g.fill(); g.fillStyle = '#10161c'; g.fillText(kt, x, y - 29); }
      g.font = 'italic 1000 26px Arial'; g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = 'rgba(8,18,24,.75)'; g.strokeText(Z.name.toUpperCase(), x, y); g.fillStyle = '#fff'; g.fillText(Z.name.toUpperCase(), x, y); g.restore(); }
    // landmarks
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const L of isl.pois) { const [x, y] = P(L.x, L.z); g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(x, y, 13, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.stroke(); g.font = '15px sans-serif'; g.fillText(L.icon, x, y + 1);
      g.font = '800 12px Arial'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(8,18,24,.7)'; g.strokeText(L.name, x, y + 24); g.fillStyle = '#fff'; g.fillText(L.name, x, y + 24); }
    // gears already found
    for (const G of gears) if (G.got) { const [x, y] = P(G.x, G.z); g.font = '14px sans-serif'; g.fillText('⚙️', x, y); }
    // GPS route: soft glow, then marching dashes
    const path = gps.path;
    if (path.length > 1) { const col = gpsInfo?.color || '#4ad8ff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); path.forEach(([x, z], k) => { const [u, v] = P(x, z); k ? g.lineTo(u, v) : g.moveTo(u, v); });
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 11; g.stroke(); g.strokeStyle = col; g.lineWidth = 7; g.stroke(); g.setLineDash([10, 12]); g.lineDashOffset = -t * 40; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 3; g.stroke(); g.setLineDash([]); }
    // waypoint flag
    if (waypoint) { const [x, y] = P(waypoint.x, waypoint.z); pinShape(g, x, y, '#4ad8ff', 1.05); g.font = '18px sans-serif'; g.fillText('📍', x, y - 27); }
    // mission pins (teardrops), hovered one bigger with a label
    const hovId = mapHover?.m.id || mapListHover;
    const order = [...beacons].sort((a, b) => (a.m.id === hovId) - (b.m.id === hovId) || a.z - b.z);
    for (const b of order) { const [x, y] = P(b.x, b.z), ch = CHAPTERS.find(q => q.id === b.m.ch), done = state.done[b.m.id], hov = b.m.id === hovId, col = b.m.boss ? '#e0283a' : ch.color, k = hov ? 1.3 : done ? .8 : 1;
      if (!done) { const ph = ((t * .9 + b.x * .01) % 1 + 1) % 1; g.strokeStyle = col; g.globalAlpha = 1 - ph; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, 8 + ph * 22, (8 + ph * 22) * .5, 0, 0, TAU); g.stroke(); g.globalAlpha = 1; }
      pinShape(g, x, y, col, k); g.font = `${Math.round(19 * k)}px sans-serif`; g.fillText(b.m.icon, x, y - 27 * k);
      if (done) { g.font = '900 12px Arial'; g.fillStyle = '#ffd23a'; g.strokeStyle = '#10161c'; g.lineWidth = 3; const st = '★'.repeat(done); g.strokeText(st, x, y - 50 * k); g.fillText(st, x, y - 50 * k); }
      if (hov) { const kind = { rings: 'Zeitrennen', smash: 'Zerstören', collect: 'Sammeln', chase: 'Verfolgung', escape: 'Flucht', race: 'Bossrennen', avalanche: 'Flucht', worm: 'Boss-Jagd', boss: 'Bosskampf' }[b.m.kind], d = Math.round(Math.hypot(b.x - player.x, b.z - player.z));
        const l1 = `${b.m.icon} ${b.m.name}`, l2 = `${kind} · ${d} m · ${'★'.repeat(done || 0)}${'☆'.repeat(3 - (done || 0))}`; g.font = '900 17px Arial'; const w = Math.max(g.measureText(l1).width, 170) + 28, bx = clamp(x - w / 2, 8, S - w - 8), by = y - 128;
        g.fillStyle = 'rgba(12,22,30,.94)'; roundRect(g, bx, by, w, 54, 12); g.fill(); g.strokeStyle = col; g.lineWidth = 2.5; g.stroke(); g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText(l1, bx + 14, by + 19); g.font = '700 13px Arial'; g.fillStyle = '#b8ccd4'; g.fillText(l2, bx + 14, by + 39); g.textAlign = 'center'; } }
    // you
    { const [x, y] = P(player.x, player.z), ph = (t * 1.2) % 1; g.strokeStyle = 'rgba(255,255,255,' + (1 - ph) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 12 + ph * 26, 0, TAU); g.stroke();
      g.save(); g.translate(x, y); g.rotate(-player.angle + Math.PI); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8; g.fillStyle = '#fff'; g.strokeStyle = '#e34335'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, -17); g.lineTo(12, 12); g.lineTo(0, 6); g.lineTo(-12, 12); g.closePath(); g.fill(); g.shadowBlur = 0; g.stroke(); g.restore(); }
    // compass and scale bar
    { const x = S - 62, y = 84; g.fillStyle = 'rgba(12,22,30,.75)'; g.beginPath(); g.arc(x, y, 34, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#ff5a4a'; g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 7, y); g.lineTo(x - 7, y); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y + 26); g.lineTo(x + 7, y); g.lineTo(x - 7, y); g.fill(); g.font = '900 14px Arial'; g.fillStyle = '#ff5a4a'; g.fillText('N', x, y - 46); }
    { const L = 200 * sc, x = 26, y = S - 30; g.fillStyle = 'rgba(12,22,30,.75)'; roundRect(g, x - 12, y - 24, L + 24, 38, 8); g.fill(); g.fillStyle = '#fff'; g.fillRect(x, y, L / 2, 5); g.fillStyle = '#10161c'; g.fillRect(x + L / 2, y, L / 2, 5); g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x, y, L, 5); g.font = '800 12px Arial'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('0', x - 2, y - 10); g.textAlign = 'right'; g.fillText('200 m', x + L + 4, y - 10); g.textAlign = 'center'; }
    // soft vignette
    const vg = g.createRadialGradient(S / 2, S / 2, S * .35, S / 2, S / 2, S * .75); vg.addColorStop(0, 'rgba(0,10,20,0)'); vg.addColorStop(1, 'rgba(0,10,20,.45)'); g.fillStyle = vg; g.fillRect(0, 0, S, S);
  }
  function pinShape(g, x, y, col, k = 1) {
    g.save(); g.translate(x, y); g.scale(k, k);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 0, 8, 3.5, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-6, -10, -17, -16, -17, -27); g.arc(0, -27, 17, Math.PI, 0); g.bezierCurveTo(17, -16, 6, -10, 0, 0); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); g.restore();
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawMini() {
    const g = miniCtx, S = mini.width, R = S / 2, img = isl.mapCanvas, H = isl.HALF, view = 360 + clamp(Math.abs(player.speed) - 15, 0, 25) * 6, k = S / view, th = player.angle + Math.PI, cs = Math.cos(th), sn = Math.sin(th);
    mini.zoom = (mini.zoom || k) + (k - (mini.zoom || k)) * .05; const kk = mini.zoom;
    g.save(); g.clearRect(0, 0, S, S); g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.clip(); g.fillStyle = '#145f9a'; g.fillRect(0, 0, S, S);
    g.translate(R, R); g.rotate(th); g.scale(kk, kk); g.translate(-player.x, -player.z); g.imageSmoothingEnabled = true; g.drawImage(img, -H, -H, H * 2, H * 2);
    // GPS route on the minimap
    const path = gps.path;
    if (path.length > 1) { g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); path.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z));
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 11 / kk; g.stroke(); g.strokeStyle = gpsInfo?.color || (mission?.boss ? '#ff4a5a' : '#ffd23a'); g.lineWidth = 7 / kk; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.2 / kk; g.setLineDash([8 / kk, 9 / kk]); g.lineDashOffset = -timeT * 30 / kk; g.stroke(); g.setLineDash([]); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const proj = (wx, wz) => { const dx = wx - player.x, dz = wz - player.z; let x = (dx * cs - dz * sn) * kk, y = (dx * sn + dz * cs) * kk; const d = Math.hypot(x, y), m = R - 16, out = d > m; if (out) { x *= m / d; y *= m / d; } return [R + x, R + y, out]; };
    const dot = (wx, wz, col, r = 7) => { const [x, y] = proj(wx, wz); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!mission) { for (const b of beacons) { const [x, y, out] = proj(b.x, b.z), ch = CHAPTERS.find(c => c.id === b.m.ch), col = b.m.boss ? '#ff3a4a' : ch.color, done = state.done[b.m.id];
        g.fillStyle = col; g.beginPath(); g.arc(x, y, done ? 6 : out ? 8 : 12, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); if (!done && !out) { g.font = '14px sans-serif'; g.fillText(b.m.icon, x, y + 1); } }
      if (waypoint) { const [x, y] = proj(waypoint.x, waypoint.z); g.font = '22px sans-serif'; g.fillText('📍', x, y - 8); } }
    if (rt?.mapPoints) for (const [wx, wz, col] of rt.mapPoints()) dot(wx, wz, col, 6);
    // inner ring shadow
    const vg = g.createRadialGradient(R, R, R * .7, R, R, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = vg; g.fillRect(0, 0, S, S);
    g.restore();
    g.save(); g.translate(R, R); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6; g.fillStyle = '#fff'; g.strokeStyle = '#e34335'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -13); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath(); g.fill(); g.shadowBlur = 0; g.stroke(); g.restore();
    mini.parentElement.style.setProperty('--rot', th + 'rad');
  }

  // -------------------------------------------------------------------------------------------------------------------
  // cards, missions start / end
  let nearBeacon = null;
  function openCard(b) {
    cardFor = b.m; mode = 'card'; const m = b.m, ch = CHAPTERS.find(c => c.id === m.ch), st = state.done[m.id] || 0, best = state.best[m.id];
    const kind = { rings: 'ZEITRENNEN', smash: 'ZERSTÖREN', collect: 'SAMMELN', chase: 'VERFOLGUNG', escape: 'FLUCHT', race: 'BOSSRENNEN', avalanche: 'FLUCHT', worm: 'BOSS-VERFOLGUNGSJAGD', boss: 'BOSSKAMPF' }[m.kind];
    const c = $('stCard'); c.style.setProperty('--cc', m.boss ? '#ff3a4a' : ch.color);
    c.innerHTML = `<small>KAPITEL ${ch.n} · ${ch.name.toUpperCase()} · ${kind}</small><h3><span>${m.icon}</span>${esc(m.name)}</h3>${m.title ? `<em>${esc(m.title)}</em>` : ''}<p>${esc(m.line)}</p>
      <div class="sc-stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}${best != null ? `<i>Bestzeit ${fmt(best)}</i>` : ''}</div><div class="sc-btns"><button class="primary" data-st="start">START (ENTER)</button><button data-st="cardclose">WEITERFAHREN</button></div>`;
    c.hidden = false;
  }
  function closeCard() { $('stCard').hidden = true; mode = 'free'; cardSnooze = cardFor; cardFor = null; }
  let cardSnooze = null;
  function teleport(s) { fade(() => { Object.assign(player, { x: s.x, z: s.z, y: isl.ground(s.x, s.z), angle: s.angle, vx: 0, vz: 0, vy: 0, speed: 0, grounded: true, airT: 0, spinT: 0, drift: 0, turboT: 0 }); snapCamera(); }); }

  function startMission(m) {
    if (!m) return; $('stCard').hidden = true; cardFor = null; mission = m; mode = 'loading';
    fade(() => {
      disposeRuntime(); hearts = 3; ammo = 0;
      const b = beacons.find(q => q.m.id === m.id), route = b?.route || (m.route ? buildRoute(isl, m.route) : m.loop ? buildRoute(isl, m.loop) : null);
      const s = missionStart(isl, m, route);
      Object.assign(player, { x: s.x, z: s.z, y: isl.ground(s.x, s.z), angle: s.angle, vx: 0, vz: 0, vy: 0, speed: 0, grounded: true, airT: 0, spinT: 0, drift: 0, driftT: 0, turboT: 0, invuln: 0 });
      beacons.forEach(q => q.g.visible = false); gears.forEach(G => G.m.visible = false);
      rt = RUNTIME[m.kind](m, route); elapsed = 0; countdown = m.kind === 'boss' ? 4.2 : 3.2; tsPress = null; mode = 'count'; snapCamera();
      if (m.boss) banner(m.kind === 'boss' ? 'BOSSKAMPF' : 'BOSS', m.name, m.title || '', 3.4, '#ff3a4a'); else banner(m.icon + ' MISSION', m.name.toUpperCase(), m.line, 2.6, CHAPTERS.find(c => c.id === m.ch).color);
      $('stObj').hidden = false; $('stHearts').hidden = !rt.hearts; $('stAmmo').hidden = !rt.rockets; updateHearts();
    });
  }
  let tsPress = null;
  function finishMission(win, info = {}) {
    if (mode !== 'mission') return; mode = 'result';
    const m = mission, stars = win ? clamp(info.stars || 1, 1, 3) : 0, prev = state.done[m.id] || 0, first = win && !prev;
    let xp = 0; if (win) { if (first) xp += m.final ? XP.final : m.boss ? XP.boss : XP.task; if (stars > prev) xp += (stars - prev) * XP.star; state.done[m.id] = Math.max(prev, stars); if (info.time != null && (state.best[m.id] == null || info.time < state.best[m.id])) state.best[m.id] = +info.time.toFixed(2); }
    sfx(win ? 'win' : 'fail');
    const unlocked = []; if (first) { const before = new Set(beacons.map(b => b.m.id)); refreshBeacons(); beacons.forEach(b => { if (!before.has(b.m.id)) unlocked.push(b.m); }); }
    save(xp);
    const ch = CHAPTERS.find(c => c.id === m.ch);
    resultInfo = { win, m, unlocked };
    modal(`<div class="st-result ${win ? 'win' : 'fail'}" style="--cc:${m.boss ? '#ff3a4a' : ch.color}"><small>${m.icon} ${esc(m.name)}</small><h2>${win ? (m.boss ? 'BOSS BESIEGT!' : 'GESCHAFFT!') : 'GESCHEITERT'}</h2>
      ${win ? `<div class="sr-stars">${[0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="--d:${i * .18}s">★</i>`).join('')}</div>` : `<p class="sr-why">${esc(info.reason || '')}</p>`}
      <div class="sr-rows">${info.time != null ? `<span>Zeit <b>${fmt(info.time)}</b></span>` : ''}${info.detail ? `<span>${esc(info.detail)}</span>` : ''}${xp ? `<span class="xp">+${xp} XP</span>` : ''}${info.hint ? `<span class="hint">${esc(info.hint)}</span>` : ''}</div>
      ${unlocked.length ? `<div class="sr-unlock">${unlocked.map(u => `<b>NEU: ${u.icon} ${esc(u.name)}</b>`).join('')}</div>` : ''}
      <div class="sc-btns"><button class="primary" data-st="continue">${win ? 'WEITER (ENTER)' : 'NOCHMAL (ENTER)'}</button>${win ? '<button data-st="retry">NOCHMAL (R)</button>' : '<button data-st="continue2" data-st2="1">AUFGEBEN</button>'}</div></div>`);
    $('stModal').querySelector('[data-st2]')?.setAttribute('data-st', 'abort');
  }
  function resultContinue() {
    if (!resultInfo) return; const { win, m, unlocked } = resultInfo; resultInfo = null; closeModal();
    if (!win) { retry(); return; }
    endMission(); mode = 'free';
    if (m.final) { let n = 0; const fw = setInterval(() => { if (++n > 40 || !active) return clearInterval(fw); for (let k = 0; k < 2; k++) fx.burst(player.x + (Math.random() - .5) * 60, player.y + 18 + Math.random() * 20, player.z + (Math.random() - .5) * 60, 'box'); }, 150);
      banner('APEX-INSEL BEFREIT', 'DU HAST ES GESCHAFFT!', 'Das Phantom-Syndikat ist besiegt. Jetzt alle Sterne und Zahnräder?', 6, '#ffd23a'); return; }
    const nextCh = CHAPTERS.find(c => openChapters(state.done).includes(c.id) && !state.seen.includes('ch-' + c.id) && c.id !== 'city');
    if (nextCh) { state.seen.push('ch-' + nextCh.id); save(); banner('KAPITEL ' + nextCh.n, nextCh.name.toUpperCase(), nextCh.line, 4.5, nextCh.color); }
    else if (unlocked.some(u => u.boss)) { const u = unlocked.find(q => q.boss); banner('BOSS FREIGESCHALTET', u.name, 'Die rote Lichtsäule auf der Karte.', 3.5, '#ff3a4a'); }
  }
  function retry() { const m = mission; closeModal(); resultInfo = null; endMission(); mode = 'free'; if (m) startMission(m); }
  function endMission(silent = false) {
    disposeRuntime(); mission = null; if (!root) return;
    $('stObj').hidden = true; $('stHearts').hidden = true; $('stAmmo').hidden = true; $('stCount').hidden = true; $('stBoss').hidden = true;
    beacons.forEach(q => q.g.visible = true); gears.forEach(G => G.m.visible = !G.got); gps.off(); gpsInfo = null;
    if (!silent) player.invuln = 1;
  }
  function disposeRuntime() {
    rt?.dispose?.(); rt = null;
    for (const n of npcs) scene.remove(n.model); npcs.clear();
    for (const h of hazards) h.dispose?.(); hazards.length = 0;
    for (const p of projectiles) scene.remove(p.m); projectiles.length = 0;
    for (const r of rockets) scene.remove(r.m); rockets.length = 0;
    for (const b of boxes) scene.remove(b.m); boxes.length = 0;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // shared mission helpers: npcs, hazards (telegraphs), lobbed shots, homing missiles, rockets, item boxes, rings
  function spawnNpc(o) {
    const c = makeCar({ kart: o.kart }), model = createCar(o.color || '#888888', o.number || '00', o.kart || 'allround', 'standard', 'none', o.avatar || 'marco');
    Object.assign(c, { x: o.x, z: o.z, y: isl.ground(o.x, o.z), angle: o.angle || 0 }); scene.add(model);
    const n = { c, model, key: 'npc' + Math.random(), ghost: 0 }; npcs.add(n); return n;
  }
  function removeNpc(n) { scene.remove(n.model); npcs.delete(n); }
  const tgMat = (col) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
  const HZ_COL = { slam: 0xff3a3a, ink: 0x8a3aff, rock: 0xff7a2a, fire: 0xff5a10, lava: 0xff5a10, ice: 0x5ad8ff, charge: 0xff3a3a, sand: 0xffb040 };
  function aoe({ x, z, r, delay, kind = 'slam', onBoom }) {
    const y = isl.ground(x, z) + .15, col = HZ_COL[kind] || 0xff3a3a;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 40), tgMat(col)); disk.rotation.x = -Math.PI / 2; disk.position.set(x, y, z); disk.scale.setScalar(.01); scene.add(disk);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 48), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + .02, z); ring.scale.setScalar(r); scene.add(ring);
    const h = { t: 0, update(dt) { this.t += dt; const k = Math.min(1, this.t / delay); disk.scale.setScalar(r * k); disk.material.opacity = .2 + .25 * k + Math.sin(this.t * 20) * .05 * k;
        if (this.t >= delay && !this.boom) { this.boom = true; burst(x, y, z, kind); shakeNear(x, z, .8); if (Math.hypot(player.x - x, player.z - z) < r + .8 && player.y < y + 6) hurt(kind); onBoom?.(); }
        return this.t < delay + .15; }, dispose() { scene.remove(disk, ring); } };
    hazards.push(h); return h;
  }
  function line({ x0, z0, ang, len, w, delay, kind = 'slam', linger = 0 }) {
    const col = HZ_COL[kind] || 0xff3a3a, g = new THREE.Group(), sa = Math.sin(ang), ca = Math.cos(ang);
    const n = Math.ceil(len / 4), segs = [];
    for (let i = 0; i < n; i++) { const d = (i + .5) * len / n, x = x0 + sa * d, z = z0 + ca * d, y = isl.ground(x, z) + .2; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len / n + .1), tgMat(col)); m.rotation.x = -Math.PI / 2; m.rotation.z = ang; m.position.set(x, y, z); g.add(m); segs.push(m); }
    scene.add(g);
    const inside = () => { const dx = player.x - x0, dz = player.z - z0, u = dx * sa + dz * ca, v = dx * ca - dz * sa; return u > -1 && u < len + 1 && Math.abs(v) < w / 2 + .8; };
    const h = { t: 0, update(dt) { this.t += dt; const k = Math.min(1, this.t / delay); segs.forEach((m, i) => { m.material.opacity = (i / n < k ? .5 : .12) + Math.sin(this.t * 18) * .05; });
        if (this.t >= delay && !this.boom) { this.boom = true; for (let i = 0; i < n; i += 2) burst(x0 + sa * i * len / n, isl.ground(x0 + sa * i * len / n, z0 + ca * i * len / n), z0 + ca * i * len / n, kind); shakeNear(player.x, player.z, .6); }
        if (this.t >= delay && this.t <= delay + Math.max(.2, linger) && inside() && player.y < isl.ground(player.x, player.z) + 5) hurt(kind);
        if (linger && this.t > delay && this.t < delay + linger && Math.random() < .5) { const d = Math.random() * len; burst(x0 + sa * d, isl.ground(x0 + sa * d, z0 + ca * d) + 1, z0 + ca * d, kind); }
        return this.t < delay + Math.max(.3, linger); }, dispose() { scene.remove(g); } };
    hazards.push(h); return h;
  }
  function lob({ from, to, time, r, kind }) {
    const m = projModel(kind); m.position.set(...from); scene.add(m);
    const tx = to[0], tz = to[1], ty = isl.ground(tx, tz); aoe({ x: tx, z: tz, r, delay: time, kind });
    projectiles.push({ m, t: 0, time, from: new THREE.Vector3(...from), to: new THREE.Vector3(tx, ty, tz), kind });
  }
  function homing({ from, ang, speed, turn, life, kind }) {
    const m = projModel(kind); m.scale.set(.6, .6, 1.4); m.position.set(...from); scene.add(m);
    projectiles.push({ m, homing: true, ang, vy: 0, speed, turn, life, kind });
  }
  function stepProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.homing) {
        const m = p.m, want = Math.atan2(player.x - m.position.x, player.z - m.position.z); p.ang += clamp(angleDiff(want, p.ang), -p.turn * dt, p.turn * dt);
        m.position.x += Math.sin(p.ang) * p.speed * dt; m.position.z += Math.cos(p.ang) * p.speed * dt;
        const gy = isl.ground(m.position.x, m.position.z) + 1.4; m.position.y = lerp(m.position.y, gy, Math.min(1, dt * 2)); m.rotation.y = p.ang;
        p.life -= dt; if (Math.random() < dt * 30) fx.burst(m.position.x, m.position.y - .5, m.position.z, 'smoke');
        if (Math.hypot(player.x - m.position.x, player.z - m.position.z) < 2.4 && Math.abs(player.y - m.position.y) < 3) { hurt(p.kind); burst(m.position.x, m.position.y, m.position.z, p.kind); p.life = 0; }
        if (p.life <= 0) { if (p.life > -1) burst(m.position.x, m.position.y, m.position.z, p.kind); scene.remove(m); projectiles.splice(i, 1); }
        continue;
      }
      p.t += dt; const k = Math.min(1, p.t / p.time);
      p.m.position.lerpVectors(p.from, p.to, k); p.m.position.y += Math.sin(k * Math.PI) * (12 + p.from.distanceTo(p.to) * .25); p.m.rotation.x += dt * 4;
      if (k >= 1) { scene.remove(p.m); projectiles.splice(i, 1); }
    }
  }
  function burst(x, y, z, kind) {
    fx.burst(x, y, z, kind === 'ice' || kind === 'zap' ? 'zap' : kind === 'ink' || kind === 'smoke' || kind === 'sand' || kind === 'dust' ? 'smoke' : 'hit');
    if (kind === 'slam' || kind === 'rock' || kind === 'sand' || kind === 'dust') for (let i = 0; i < 5; i++) fx.burst(x + (Math.random() - .5) * 8, y, z + (Math.random() - .5) * 8, 'smoke');
  }
  function shakeNear(x, z, a) { const d = Math.hypot(player.x - x, player.z - z); cam.shake = Math.max(cam.shake, a * clamp(1 - d / 80, 0, 1)); }
  let hurtCool = 0;
  function hurt(kind) {
    if (hurtCool > 0 || player.invuln > 0 || mode !== 'mission') return;
    hurtCool = 1.4; spinOut(player, 1); cam.shake = Math.max(cam.shake, 1); sfx('hurt'); fx.burst(player.x, player.y, player.z, 'hit');
    if (rt?.hearts) { hearts--; updateHearts(); if (hearts <= 0) finishMission(false, { reason: 'Keine Herzen mehr.', hint: rt.failHint }); else toast(hearts === 1 ? 'LETZTES HERZ!' : 'AUTSCH!'); }
    rt?.onHurt?.(kind);
  }
  function updateHearts() { $('stHearts').innerHTML = [0, 1, 2].map(i => `<i class="${i < hearts ? 'on' : ''}">♥</i>`).join(''); }
  // rockets for boss fights
  function fireRocket() {
    if (!rt?.rockets || ammo <= 0 || mode !== 'mission') return;
    ammo--; $('stAmmoN').textContent = ammo; sfx('boost');
    const m = rocketModel(), a = player.angle; m.position.set(player.x + Math.sin(a) * 1.6, player.y + 1.2, player.z + Math.cos(a) * 1.6); scene.add(m);
    rockets.push({ m, ang: a, pitch: 0, speed: 72, life: 2.6 });
  }
  function stepRockets(dt) {
    const boss = rt?.boss;
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i], m = r.m; r.life -= dt;
      if (boss) { const w = boss.weak(), want = Math.atan2(w.x - m.position.x, w.z - m.position.z), d = angleDiff(want, r.ang); if (Math.abs(d) < 1.2) r.ang += clamp(d, -3 * dt, 3 * dt);
        const hd = Math.hypot(w.x - m.position.x, w.z - m.position.z); r.pitch = Math.atan2(w.y - m.position.y, Math.max(1, hd)); }
      m.position.x += Math.sin(r.ang) * Math.cos(r.pitch) * r.speed * dt; m.position.z += Math.cos(r.ang) * Math.cos(r.pitch) * r.speed * dt; m.position.y += Math.sin(r.pitch) * r.speed * dt;
      m.rotation.set(-r.pitch, r.ang, 0, 'YXZ'); if (Math.random() < dt * 40) fx.burst(m.position.x, m.position.y, m.position.z, 'smoke');
      let gone = r.life <= 0 || m.position.y < isl.ground(m.position.x, m.position.z) - .5;
      if (boss && !gone) { const w = boss.weak(); if (m.position.distanceTo(w) < boss.weakR) { gone = true;
        if (boss.vulnerable) { boss.hit(); burst(w.x, w.y, w.z, 'hit'); burst(w.x, w.y, w.z, 'fire'); cam.shake = .8; sfx('smash'); toast(boss.hp ? `TREFFER! ${boss.hp} übrig` : 'VOLLTREFFER!', 900); if (boss.hp === Math.floor(boss.maxHp / 2)) banner('PHASE 2', 'ER WIRD WÜTEND!', '', 2, '#ff3a4a'); }
        else { fx.burst(w.x, w.y, w.z, 'zap'); toast('ABGEPRALLT! Warte auf die Lücke.', 1100); } } }
      if (gone) { if (r.life > 0) fx.burst(m.position.x, m.position.y, m.position.z, 'hit'); scene.remove(m); rockets.splice(i, 1); }
    }
  }
  function placeBoxes(A, n = 5) {
    for (let i = 0; i < n; i++) { const a = i / n * TAU + .3, d = A.inner ? lerp(A.inner + 6, A.r - 6, .5) : A.r * .55, x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d, m = itemBoxModel(); m.position.set(x, isl.ground(x, z) + 1.6, z); scene.add(m); boxes.push({ m, x, z, cool: 0 }); }
  }
  function stepBoxes(dt, t) {
    for (const b of boxes) {
      b.cool = Math.max(0, b.cool - dt); b.m.visible = b.cool <= 0; b.m.rotation.set(t * .7, t, 0); b.m.position.y = isl.ground(b.x, b.z) + 1.6 + Math.sin(t * 2 + b.x) * .3;
      if (b.cool <= 0 && Math.hypot(player.x - b.x, player.z - b.z) < 2.8 && ammo < 4) { b.cool = 7; ammo = Math.min(4, ammo + 2); $('stAmmoN').textContent = ammo; sfx('pick'); fx.burst(b.x, b.m.position.y - 1, b.z, 'box'); toast('+2 RAKETEN 🚀', 800); }
    }
  }
  // rings for timed routes
  function makeRings(route, spacing, count) {
    const list = [], n = count || Math.max(2, Math.round(route.length / spacing));
    for (let i = 1; i <= n; i++) { const s = route.length * i / n - (i === n ? 2 : 0), p = routeAt(route, s), last = i === n;
      const g = new THREE.Group(), R = Math.max(6, p.hw + 1.2), col = last ? 0xffffff : 0xffd23a;
      const tor = new THREE.Mesh(new THREE.TorusGeometry(R, .45, 10, 48), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true })); g.add(tor);
      if (last) { const chk = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, 1.2), new THREE.MeshBasicMaterial({ map: checker(), side: THREE.DoubleSide })); chk.position.y = R * .55; g.add(chk); }
      g.position.set(p.x, p.y + R * .55, p.z); g.rotation.y = p.angle; scene.add(g); list.push({ g, tor, x: p.x, y: p.y, z: p.z, s, R, last }); }
    return list;
  }
  let checkerTex = null; function checker() { if (checkerTex) return checkerTex; const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d'); for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 4, j * 4, 4, 4); } checkerTex = new THREE.CanvasTexture(c); checkerTex.magFilter = THREE.NearestFilter; return checkerTex; }
  // GPS line on the ground (see guide.js); missions in gold, boss fights in red
  function guideTo(x, z, o = {}) { gps.target(x, z, o.color || (mission?.boss ? '#ff4a5a' : '#ffd23a'), o); }
  // timed par from an AI-like estimate: route length over a realistic average speed
  // limits come from a quick simulated drift-free run with the same physics: you need clean driving to make it, drift turbos for three stars
  const calCache = new Map();
  function aiTime(m, route) { if (!calCache.has(m.id)) calCache.set(m.id, calibrate(isl, route, DRIVE)); return calCache.get(m.id); }
  const parTime = (m, route) => Math.round(aiTime(m, route) * ((m.tight || 1.05) + .03) * 2) / 2;
  function timeStars(t, m, route) { const ai = aiTime(m, route); return t <= ai * .96 ? 3 : t <= ai * 1.01 ? 2 : 1; }

  // =================================================================================================================
  // mission runtimes
  const RUNTIME = {
    // ---- drive through every ring before the clock runs out
    rings(m, route) {
      const rings = makeRings(route, m.spacing || 55), limit = parTime(m, route); let next = 0;
      rings.forEach((r, i) => r.tor.material.opacity = i ? .45 : 1);
      let hzT = 2, pk = 0, pS = 0;
      return {
        update(dt) {
          const r = rings[next]; r.tor.rotation.z += dt * 2;
          const pr = routeProgress(route, player.x, player.z, pk); if (pr.d < 45) { pk = pr.k; pS = pr.s; gps.route(route, pS, rings[Math.min(next + 1, rings.length - 1)].s); } else guideTo(r.x, r.z);
          if (Math.hypot(player.x - r.x, player.z - r.z) < r.R + .5 && Math.abs(player.y - r.y) < r.R + 3) {
            sfx('ring'); fx.burst(r.x, r.y + 2, r.z, 'box'); scene.remove(r.g); next++;
            if (next >= rings.length) return finishMission(true, { time: elapsed, stars: timeStars(elapsed, m, route), detail: `Limit ${fmt(limit)} · ★★★ unter ${fmt(aiTime(m, route) * .96)}` });
            rings[next].tor.material.opacity = 1; if (rings[next + 1]) rings[next + 1].tor.material.opacity = .7;
            const left = limit - elapsed; if (left < 10) toast(`${left.toFixed(1)} s übrig!`, 900);
          }
          if (elapsed > limit) finishMission(false, { reason: 'Zeit abgelaufen.', hint: 'Drifte lange Kurven (Leertaste) für Mini-Turbos.' });
          // hazards: falling boulders in the canyon, lava bombs on the volcano
          if (m.hazard) { hzT -= dt; if (hzT <= 0) { hzT = m.hazard === 'lava' ? 1.2 : 1.6; const lead = .9 + Math.random() * .7, x = player.x + player.vx * lead + (Math.random() - .5) * 12, z = player.z + player.vz * lead + (Math.random() - .5) * 12; lob({ from: [x + 30, isl.ground(x, z) + 60, z - 20], to: [x, z], time: 1.3, r: 5, kind: m.hazard === 'lava' ? 'fire' : 'rock' }); } }
        },
        hud: () => ({ kind: 'ZEITRENNEN', title: m.name, text: `Ring ${Math.min(next + 1, rings.length)} / ${rings.length}`, time: limit - elapsed, warn: limit - elapsed < 10 }),
        mapPoints: () => rings.slice(next, next + 3).map((r, i) => [r.x, r.z, i ? 'rgba(255,210,58,.6)' : '#ffd23a']),
        dispose() { rings.forEach(r => scene.remove(r.g)); },
        failHint: 'Bleib auf der Straße und drifte durch die Kurven.',
      };
    },
    // ---- ram every target before time runs out
    smash(m) {
      const A = m.area, kind = m.ch === 'jungle' ? 'totem' : m.ch === 'volcano' ? 'generator' : 'crate', list = [];
      let tries = 0; const rnd = seeded(m.id);
      while (list.length < m.count && tries++ < 4000) {
        let x, z; if (A.rx) { x = A.x + (rnd() * 2 - 1) * A.rx; z = A.z + (rnd() * 2 - 1) * A.rz; } else { const a = rnd() * TAU, d = (A.minR || 0) + Math.sqrt(rnd()) * (A.r - (A.minR || 0)); x = A.x + Math.cos(a) * d; z = A.z + Math.sin(a) * d; }
        const y = isl.ground(x, z); if (y < SEA + 1.5 || list.some(q => Math.hypot(q.x - x, q.z - z) < 14)) continue;
        if (blocked(x, z)) continue;
        const g = targetModel(kind); g.position.set(x, y, z); g.rotation.y = rnd() * TAU; scene.add(g); list.push({ g, x, z, y, alive: true });
      }
      const limit = m.time; let left = list.length;
      return {
        update(dt, t) {
          let best = null, bd = 1e9;
          for (const q of list) { if (!q.alive) continue; q.g.userData.anim?.(t); const d = Math.hypot(player.x - q.x, player.z - q.z); if (d < bd) { bd = d; best = q; }
            if (d < 2.4 + (q.g.userData.r || 1.6) && Math.abs(player.y - q.y) < 4) { q.alive = false; left--; smashFx(q); sfx('smash'); player.speed *= .85; cam.shake = .5; toast(left ? `${left} übrig` : 'ALLE!', 700); } }
          if (best) guideTo(best.x, best.z);
          if (!left) return finishMission(true, { time: elapsed, stars: remainStars(limit - elapsed, limit) });
          if (elapsed > limit) finishMission(false, { reason: `Noch ${left} übrig.`, hint: 'Schau auf die Minikarte: violette Punkte sind die Ziele.' });
        },
        hud: () => ({ kind: 'ZERSTÖREN', title: m.name, text: `${list.length - left} / ${list.length}`, time: limit - elapsed, warn: limit - elapsed < 10 }),
        mapPoints: () => list.filter(q => q.alive).map(q => [q.x, q.z, '#b06aff']),
        dispose() { list.forEach(q => scene.remove(q.g)); },
      };
    },
    // ---- collect stars / crystals (some float above ramps)
    collect(m) {
      const A = m.area, rnd = seeded(m.id), list = [], kind = m.ch === 'glacier' ? 'crystal' : 'star';
      const ramps = isl.ramps.filter(R => Math.hypot(R.x - A.x, R.z - A.z) < A.r + 20).slice(0, m.air);
      for (const R of ramps) { const x = R.x + Math.sin(R.angle) * (R.len / 2 + 14), z = R.z + Math.cos(R.angle) * (R.len / 2 + 14); list.push({ x, z, y: R.y + R.h + 2.4 + R.h * .3, air: true }); }
      let tries = 0;
      while (list.length < m.count && tries++ < 4000) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * A.r, x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d, y = isl.ground(x, z); if (y < SEA + 1) continue; if (list.some(q => Math.hypot(q.x - x, q.z - z) < 12)) continue; if (blocked(x, z)) continue; list.push({ x, z, y: y + 1.6 }); }
      list.forEach(q => { q.g = starModel(kind); q.g.position.set(q.x, q.y, q.z); scene.add(q.g); q.alive = true; });
      const limit = m.time; let left = list.length;
      return {
        update(dt, t) {
          let best = null, bd = 1e9;
          for (const q of list) { if (!q.alive) continue; q.g.rotation.y = t * 2.5; q.g.position.y = q.y + Math.sin(t * 3 + q.x) * .3; const d = Math.hypot(player.x - q.x, player.z - q.z); if (d < bd) { bd = d; best = q; }
            if (d < 3 && Math.abs(player.y + .6 - q.y) < 3) { q.alive = false; left--; scene.remove(q.g); sfx('pick'); fx.burst(q.x, q.y - 1, q.z, 'box'); } }
          if (best) guideTo(best.x, best.z);
          if (!left) return finishMission(true, { time: elapsed, stars: remainStars(limit - elapsed, limit) });
          if (elapsed > limit) finishMission(false, { reason: `Noch ${left} übrig.`, hint: 'Die Sterne in der Luft erreichst du über die Rampen.' });
        },
        hud: () => ({ kind: 'SAMMELN', title: m.name, text: `${list.length - left} / ${list.length}`, time: limit - elapsed, warn: limit - elapsed < 10 }),
        mapPoints: () => list.filter(q => q.alive).map(q => [q.x, q.z, '#ffd23a']),
        dispose() { list.forEach(q => q.alive && scene.remove(q.g)); },
      };
    },
    // ---- chase: ram the target n times before it gets away
    chase(m, route) {
      const T = m.target, st = routeAt(route, 40), n = spawnNpc({ ...T, x: st.x, z: st.z, angle: st.angle }); n.k = 0; n.s = 40; n.lap = 0;
      let hits = 0, boostT = 4, escapeT = 0; const limit = m.time;
      return {
        update(dt) {
          const c = n.c, pr = routeProgress(route, c.x, c.z, n.k); n.k = pr.k; if (n.k > route.pts.length - 6) { n.k = 0; }
          const ahead = routeAt(route, (route.pts[n.k].s + 14 + c.speed * .5) % route.length), gap = Math.hypot(player.x - c.x, player.z - c.z);
          c.capMul = T.speed * (gap < 25 ? 1.03 : gap > 120 ? .9 : 1);
          const want = routeSpeed(route, route.pts[n.k].s, TOP * c.capMul);
          boostT -= dt; if (boostT <= 0 && c.spinT <= 0) { boostT = 5 + Math.random() * 4; turbo(c, 1, TOP * 1.12); }
          npcDrive(n, aiStep(c, ahead.x, ahead.z, want, dt), dt);
          guideTo(c.x, c.z, { color: '#ff4a5a', pin: false });
          if (gap < 3.4 && Math.abs(player.y - c.y) < 2.5 && c.invuln <= 0 && player.speed > 5) { hits++; spinOut(c, 1.4); c.invuln = 2.6; player.speed *= .8; sfx('smash'); fx.burst(c.x, c.y, c.z, 'hit'); cam.shake = .6; toast(hits < m.hits ? `TREFFER ${hits} / ${m.hits}` : 'ERWISCHT!', 800); }
          if (hits >= m.hits) return finishMission(true, { time: elapsed, stars: remainStars(limit - elapsed, limit) });
          if (gap > 230) { escapeT += dt; if (escapeT > 3) return finishMission(false, { reason: 'Er ist entkommen.', hint: 'Bleib dran: Drift-Turbos holen schnell auf.' }); } else escapeT = 0;
          if (elapsed > limit) finishMission(false, { reason: `Nur ${hits} von ${m.hits} Treffern.`, hint: 'Schneide Kurven ab, um ihn zu überholen.' });
        },
        hud: () => ({ kind: 'VERFOLGUNG', title: m.name, text: `Treffer ${hits} / ${m.hits} · ${Math.round(Math.hypot(player.x - n.c.x, player.z - n.c.z))} m`, time: limit - elapsed, warn: Math.hypot(player.x - n.c.x, player.z - n.c.z) > 170 }),
        mapPoints: () => [[n.c.x, n.c.z, '#ff3a4a']],
      };
    },
    // ---- escape: drones chase you, survive the clock
    escape(m) {
      const A = m.area, drones = []; let t0 = 0;
      for (let i = 0; i < m.drones; i++) { const g = droneModel(); g.scale.setScalar(1.3); const a = i / m.drones * TAU; g.position.set(player.x + Math.cos(a) * 70, player.y + 6, player.z + Math.sin(a) * 70); scene.add(g); drones.push({ g, vx: 0, vz: 0, cool: 0, ph: i * 2 }); }
      return {
        hearts: true,
        update(dt, t) {
          t0 += dt; const ramp = Math.min(1, t0 / 20);
          for (const d of drones) { const g = d.g; d.cool = Math.max(0, d.cool - dt);
            const lead = .6 + d.ph * .2, tx = player.x + player.vx * lead + Math.sin(t + d.ph) * 6, tz = player.z + player.vz * lead + Math.cos(t + d.ph) * 6;
            const dx = tx - g.position.x, dz = tz - g.position.z, dd = Math.hypot(dx, dz) || 1, sp = (d.cool > 0 ? 14 : TOP * (.86 + ramp * .14)) * (Math.hypot(player.x - A.x, player.z - A.z) > A.r ? 1.25 : 1);
            d.vx += (dx / dd * sp - d.vx) * Math.min(1, dt * 1.6); d.vz += (dz / dd * sp - d.vz) * Math.min(1, dt * 1.6);
            g.position.x += d.vx * dt; g.position.z += d.vz * dt; g.position.y = lerp(g.position.y, isl.ground(g.position.x, g.position.z) + 3 + Math.sin(t * 3 + d.ph) * .5, Math.min(1, dt * 3));
            g.rotation.y = Math.atan2(d.vx, d.vz); g.userData.anim(t);
            if (d.cool <= 0 && Math.hypot(player.x - g.position.x, player.z - g.position.z) < 3.2) { d.cool = 2.5; d.vx *= -.6; d.vz *= -.6; hurt('zap'); fx.burst(player.x, player.y + 1, player.z, 'zap'); }
          }
          if (Math.hypot(player.x - A.x, player.z - A.z) > A.r) guideTo(A.x, A.z); else gps.off();
          if (elapsed > m.time) finishMission(true, { time: elapsed, stars: hearts, detail: `${hearts} Herz${hearts > 1 ? 'en' : ''} übrig` });
        },
        hud: () => ({ kind: 'FLUCHT', title: m.name, text: Math.hypot(player.x - A.x, player.z - A.z) > A.r ? 'Zurück ins Gebiet!' : 'Weich den Drohnen aus!', time: m.time - elapsed }),
        mapPoints: () => drones.map(d => [d.g.position.x, d.g.position.z, '#ff3a4a']),
        dispose() { drones.forEach(d => scene.remove(d.g)); },
        failHint: 'Drifte scharf ab, Drohnen wenden schlecht.',
      };
    },
    // ---- boss race on an open route against a rival with tricks
    race(m, route) {
      const R = m.rival, st = routeAt(route, 0), side = st.hw * .45;
      Object.assign(player, { x: st.x + Math.cos(st.angle) * side, z: st.z - Math.sin(st.angle) * side }); player.y = isl.ground(player.x, player.z);
      const n = spawnNpc({ ...R, x: st.x - Math.cos(st.angle) * side, z: st.z + Math.sin(st.angle) * side, angle: st.angle }); n.k = 0; n.lane = -side;
      let pk = 0, pS = 0, abilT = 5, ghostT = 0, finishedRival = false; const drops = [];
      const finishS = route.length - 4;
      const gateEvery = 150, gates = []; for (let s = gateEvery; s < route.length - 20; s += gateEvery) gates.push(s);
      return {
        update(dt, t) {
          const pr = routeProgress(route, player.x, player.z, pk); if (pr.d < 40) { pk = pr.k; pS = Math.max(pS, pr.s); }
          const c = n.c, rr = routeProgress(route, c.x, c.z, n.k); n.k = rr.k; const rS = rr.s;
          // rubber band: a boss never runs away completely, but a perfect run beats him
          const diff = pS - rS, band = clamp(diff / 400, -.08, .06);
          const ahead = routeAt(route, rS + 12 + c.speed * .45), lane = n.lane + Math.sin(t * .4) * 2;
          c.capMul = R.speed * (1 + band); const want = routeSpeed(route, rS, TOP * c.capMul);
          if (!finishedRival) npcDrive(n, aiStep(c, ahead.x + Math.cos(ahead.angle) * lane, ahead.z - Math.sin(ahead.angle) * lane, want, dt), dt); else npcDrive(n, { throttle: 0, steer: 0 }, dt);
          if (rS >= finishS && !finishedRival) { finishedRival = true; if (pS < finishS) return finishMission(false, { reason: `${m.name} war schneller.`, hint: 'Drift-Turbos in jeder Kurve und die Abkürzungen nutzen.', time: elapsed }); }
          // tricks
          abilT -= dt;
          if (abilT <= 0 && !finishedRival) { abilT = R.ability === 'mines' ? 3.2 + Math.random() * 2 : 4 + Math.random() * 3;
            const back = 6, x = c.x - Math.sin(c.angle) * back, z = c.z - Math.cos(c.angle) * back, k = R.ability === 'mines' ? 'mine' : 'oil';
            const g = k === 'oil' ? (() => { const d = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: .05, metalness: .6, polygonOffset: true, polygonOffsetFactor: -3 })); d.rotation.x = -Math.PI / 2; return d; })()
              : (() => { const d = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xb06aff, toneMapped: false })); return d; })();
            g.position.set(x, isl.ground(x, z) + (k === 'oil' ? .1 : .8), z); scene.add(g); drops.push({ g, x, z, k, life: 25 }); }
          if (R.ability === 'mines' && diff > 50 && ghostT <= 0 && !finishedRival) { ghostT = 14; const p = routeAt(route, rS + 60); Object.assign(c, { x: p.x, z: p.z, y: p.y, angle: p.angle }); n.ghost = 1.2; toast('PHANTOM TELEPORTIERT!', 1000); fx.burst(p.x, p.y, p.z, 'zap'); }
          ghostT -= dt; if (n.ghost > 0) n.ghost -= dt;
          for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.life -= dt; if (d.k === 'mine') d.g.scale.setScalar(1 + Math.sin(t * 8) * .15);
            if (Math.hypot(player.x - d.x, player.z - d.z) < (d.k === 'oil' ? 2.8 : 2.2)) { if (d.k === 'mine') { burst(d.x, d.g.position.y, d.z, 'zap'); player.vy = 8; player.grounded = false; } spinOut(player, d.k === 'oil' ? .9 : 1.2); sfx('hurt'); d.life = 0; }
            if (d.life <= 0) { scene.remove(d.g); drops.splice(i, 1); } }
          gps.route(route, pS, Math.min(route.length, pS + 280), '#ff4a5a');
          if (pS >= finishS) { const margin = finishedRival ? 0 : (finishS - rS) / Math.max(10, c.speed); finishMission(true, { time: elapsed, stars: margin > 3 ? 3 : margin > 1 ? 2 : 1, detail: `Vorsprung ${margin.toFixed(1)} s` }); }
          this.pos = pS >= rS ? 1 : 2; this.gap = (pS - rS);
        },
        hud() { return { kind: 'BOSSRENNEN', title: `${m.name} · ${m.title}`, text: `${this.pos || 1}. Platz · ${Math.abs(Math.round(this.gap || 0))} m ${this.gap >= 0 ? 'vorne' : 'hinten'} · ${Math.max(0, Math.round(route.length - pS))} m bis zum Ziel`, time: null, elapsed: true }; },
        mapPoints: () => [[n.c.x, n.c.z, '#ff3a4a'], ...(() => { const p = routeAt(route, route.length); return [[p.x, p.z, '#ffffff']]; })()],
        dispose() { drops.forEach(d => scene.remove(d.g)); },
        start() { turbo(n.c, .6, TOP); },
      };
    },
    // ---- avalanche: a wall of snow follows the route behind you
    avalanche(m, route) {
      const wall = avalancheModel(); scene.add(wall); let wS = -48, pS = 0, pk = 0;
      const finishS = route.length - 4, gate = makeRings(route, 0, 1);
      return {
        update(dt, t) {
          const pr = routeProgress(route, player.x, player.z, pk); if (pr.d < 40) { pk = pr.k; pS = Math.max(pS, pr.s); }
          const v = elapsed < 2.5 ? 14 : TOP * (.86 + Math.min(.1, elapsed * .007)); wS += v * dt * (pS - wS > 110 ? 1.3 : 1);
          const p = routeAt(route, Math.max(0, wS)); wall.position.set(p.x, p.y, p.z); wall.rotation.y = p.angle; wall.userData.anim(t);
          if (Math.random() < dt * 20) fx.burst(p.x + (Math.random() - .5) * 30, p.y + 4, p.z, 'smoke');
          cam.shake = Math.max(cam.shake, clamp(1 - (pS - wS) / 60, 0, .7));
          gps.route(route, pS, Math.min(route.length, pS + 280), '#8ad8ff');
          if (wS >= pS - 3) return finishMission(false, { reason: 'Die Lawine hat dich erwischt.', hint: 'Nicht von der Straße abkommen: Tiefschnee bremst.' });
          if (pS >= finishS) finishMission(true, { time: elapsed, stars: pS - wS > 65 ? 3 : pS - wS > 32 ? 2 : 1, detail: `${Math.round(pS - wS)} m Vorsprung` });
        },
        hud: () => ({ kind: 'FLUCHT', title: m.name, text: `Lawine ${Math.max(0, Math.round(pS - wS))} m hinter dir · ${Math.max(0, Math.round(finishS - pS))} m bis ins Tal`, warn: pS - wS < 35 }),
        mapPoints: () => [[wall.position.x, wall.position.z, '#ffffff']],
        dispose() { scene.remove(wall); gate.forEach(r => scene.remove(r.g)); },
      };
    },
    // ---- the sand worm chases you through the canyon and erupts ahead
    worm(m, route) {
      const worm = wormModel(); scene.add(worm); let wS = -70, pS = 0, pk = 0, eruptT = 4, caughtT = 0;
      const finishS = route.length - 4, gate = makeRings(route, 0, 1);
      return {
        hearts: true,
        update(dt, t) {
          const pr = routeProgress(route, player.x, player.z, pk); if (pr.d < 45) { pk = pr.k; pS = Math.max(pS, pr.s); }
          const v = elapsed < 3 ? 10 : TOP * (.85 + Math.min(.14, elapsed * .005)); wS += v * dt * (pS - wS > 120 ? 1.35 : 1);
          // body: dives in and out of the sand along the route
          const segs = worm.userData.segs;
          segs.forEach((sg, i) => { const s = Math.max(0, wS - i * 3.2), p = routeAt(route, s), up = Math.sin(s * .06 - t * 1.2) * 7 + 2;
            sg.position.set(p.x + Math.cos(p.angle) * Math.sin(s * .04) * 4, p.y + up, p.z - Math.sin(p.angle) * Math.sin(s * .04) * 4); sg.rotation.y = p.angle; sg.rotation.x = -Math.cos(s * .06 - t * 1.2) * .5; });
          if (Math.random() < dt * 14) { const h = segs[0].position; fx.burst(h.x, h.y - 2, h.z, 'smoke'); }
          cam.shake = Math.max(cam.shake, clamp(1 - (pS - wS) / 50, 0, .6));
          eruptT -= dt; if (eruptT <= 0) { eruptT = 2.4 + Math.random() * 1.6; const p = routeAt(route, pS + 30 + player.speed * 1.2); const off = (Math.random() - .5) * p.hw; aoe({ x: p.x + Math.cos(p.angle) * off, z: p.z - Math.sin(p.angle) * off, r: 6.5, delay: 1.3, kind: 'sand' }); }
          caughtT -= dt;
          if (wS >= pS - 4 && caughtT <= 0) { caughtT = 2; hurt('worm'); wS = pS - 75; toast('ER HAT DICH ERWISCHT!', 1000); }
          gps.route(route, pS, Math.min(route.length, pS + 280), '#ff4a5a');
          if (pS >= finishS) finishMission(true, { time: elapsed, stars: hearts, detail: `${hearts} Herz${hearts > 1 ? 'en' : ''} übrig` });
        },
        hud: () => ({ kind: 'BOSS-VERFOLGUNGSJAGD', title: `${m.name} · ${m.title}`, text: `Wurm ${Math.max(0, Math.round(pS - wS))} m hinter dir · ${Math.max(0, Math.round(finishS - pS))} m bis zum Ausgang`, warn: pS - wS < 35 }),
        mapPoints: () => [[worm.userData.segs[0].position.x, worm.userData.segs[0].position.z, '#ff3a4a']],
        dispose() { scene.remove(worm); gate.forEach(r => scene.remove(r.g)); },
        failHint: 'Weiche den Sandfontänen aus (orange Kreise).',
      };
    },
    // ---- boss fight
    boss(m) {
      const A = { ...m.arena }; A.y = isl.ground(A.x + (A.inner ? A.inner + 8 : 0), A.z);
      const ctx = { scene, isl, player, aoe, line, lob, homing, hurt, burst, shake: a => cam.shake = Math.max(cam.shake, a), sfx, say: s => toast(s, 1400) };
      const boss = new BOSS_CLASSES[m.boss](ctx, A); placeBoxes(A, m.boss === 'dragon' ? 6 : 5); ammo = 0; $('stAmmoN').textContent = 0;
      $('stBoss').hidden = false; $('stBossName').textContent = `${m.name} · ${m.title}`;
      // an arena ring on the ground
      const ringM = new THREE.Mesh(new THREE.RingGeometry(A.r - .6, A.r, 96), new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: .5, side: THREE.DoubleSide, toneMapped: false })); ringM.rotation.x = -Math.PI / 2; ringM.position.set(A.x, A.y + .4, A.z); scene.add(ringM);
      return {
        hearts: true, rockets: true, boss, start() { ctx.go = true; },
        update(dt, t) {
          boss.update(dt);
          const bc = boss.collider; if (bc) { const dx = player.x - bc.x, dz = player.z - bc.z, d = Math.hypot(dx, dz); if (d < bc.r + 1.2 && d > .01) { player.x = bc.x + dx / d * (bc.r + 1.2); player.z = bc.z + dz / d * (bc.r + 1.2); player.speed *= .5; } }
          // keep the player in the arena (soft wall)
          const d = Math.hypot(player.x - A.x, player.z - A.z); if (d > A.r) { const k = A.r / d; player.x = A.x + (player.x - A.x) * k; player.z = A.z + (player.z - A.z) * k; const nx = (player.x - A.x) / A.r, nz = (player.z - A.z) / A.r, vn = player.vx * nx + player.vz * nz; if (vn > 0) { player.vx -= nx * vn * 1.5; player.vz -= nz * vn * 1.5; player.speed *= .7; } }
          if (A.inner && d < A.inner) { hurt('lava'); const a = Math.atan2(player.z - A.z, player.x - A.x); player.x = A.x + Math.cos(a) * (A.inner + 3); player.z = A.z + Math.sin(a) * (A.inner + 3); }
          stepBoxes(dt, t);
          $('stBossBar').style.width = (boss.hp / boss.maxHp * 100) + '%'; $('stBoss').classList.toggle('vul', boss.vulnerable);
          if (ammo === 0) { const b = boxes.filter(q => q.cool <= 0).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0]; if (b) guideTo(b.x, b.z, { direct: true, color: '#ffd23a' }); else gps.off(); } else { const w = boss.weak(); guideTo(w.x, w.z, { direct: true, pin: false }); }
          if (boss.hp <= 0) { cam.shake = 1.5; const w = boss.weak(); for (let i = 0; i < 6; i++) setTimeout(() => burst(w.x + (Math.random() - .5) * 10, w.y, w.z + (Math.random() - .5) * 10, 'fire'), i * 120); finishMission(true, { time: elapsed, stars: hearts, detail: `${hearts} Herz${hearts > 1 ? 'en' : ''} übrig` }); }
        },
        hud: () => ({ kind: 'BOSSKAMPF', title: m.name, text: ammo ? (boss.vulnerable ? 'JETZT FEUERN! (E)' : 'Warte auf die Lücke …') : 'Hol dir Raketen aus den Kisten', time: null, elapsed: true, hot: boss.vulnerable && ammo > 0 }),
        mapPoints: () => { const w = boss.weak(); return [[w.x, w.z, '#ff3a4a'], ...boxes.filter(b => b.cool <= 0).map(b => [b.x, b.z, '#ffd23a'])]; },
        dispose() { boss.dispose(); scene.remove(ringM); },
        failHint: { kraken: 'Rote Streifen = Tentakel. Quer davon wegfahren!', golem: 'Lock ihn an dich ran, dann flüchten: nach dem Stampfer glüht der Kern.', mech: 'Stell dich vor eine Wand: rennt er rein, steckt er fest.', dragon: 'Wenn er landet und Feuer speit, seitlich ausweichen und dann feuern.' }[m.boss],
      };
    },
  };
  function seeded(id) { let s = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483646 + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
  function blocked(x, z) { const b = { x, z, vx: 0, vz: 0 }; isl.collide(b, 2.5); return Math.hypot(b.x - x, b.z - z) > .01; }
  const remainStars = (left, limit) => left >= limit * .3 ? 3 : left >= limit * .15 ? 2 : 1;
  function curveSlowUnused(route, k) { const P = route.pts, a = P[Math.min(P.length - 1, k + 6)], b = P[Math.min(P.length - 1, k + 18)], c = P[k]; const t = Math.abs(angleDiff(Math.atan2(b.x - a.x, b.z - a.z), Math.atan2(a.x - c.x, a.z - c.z))); return clamp(1 - t * .55, .62, 1); }
  function smashFx(q) {
    scene.remove(q.g); fx.burst(q.x, q.y + 1, q.z, 'hit');
    const col = q.g.children[0]?.material?.color?.getHex?.() ?? 0x6a4aaa;
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .6), new THREE.MeshStandardMaterial({ color: col })); m.position.set(q.x, q.y + 1, q.z); scene.add(m); const a = Math.random() * TAU, v = 6 + Math.random() * 8; debris.push({ m, vx: Math.cos(a) * v + player.vx * .5, vy: 6 + Math.random() * 8, vz: Math.sin(a) * v + player.vz * .5, life: 1.6 }); }
  }
  function npcDrive(n, ctl, dt) {
    const c = n.c; stepCar(c, ctl, dt, isl);
    if (c.surface === 'water' && c.y < .3) { const nr = isl.nearestRoad(c.x, c.z, 200); if (nr) Object.assign(c, { x: nr.x, z: nr.z, y: nr.y, vx: 0, vz: 0, speed: 8 }); }
    // car vs player bump
    const dx = player.x - c.x, dz = player.z - c.z, d = Math.hypot(dx, dz);
    if (d < 2.3 && d > .01 && Math.abs(player.y - c.y) < 2) { const nx = dx / d, nz = dz / d, push = (2.3 - d) / 2; player.x += nx * push; player.z += nz * push; c.x -= nx * push; c.z -= nz * push; const rv = (player.vx - c.vx) * nx + (player.vz - c.vz) * nz; if (rv < 0) { player.vx -= nx * rv * .6; player.vz -= nz * rv * .6; c.vx += nx * rv * .6; c.vz += nz * rv * .6; } }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // the frame
  function resetToRoad() {
    const nr = isl.nearestRoad(player.x, player.z, 400) || isl.nearestRoad(lastSafe.x, lastSafe.z, 400);
    const p = nr || lastSafe; respawn({ x: p.x, z: p.z, angle: nr ? (Math.abs(angleDiff(nr.angle, player.angle)) < Math.PI / 2 ? nr.angle : nr.angle + Math.PI) : p.angle });
  }
  function respawn(s) { Object.assign(player, { x: s.x, z: s.z, y: isl.ground(s.x, s.z) + .5, angle: s.angle, vx: 0, vz: 0, vy: 0, speed: 0, grounded: false, airT: 0, spinT: 0, drift: 0, turboT: 0, invuln: 1.5 }); snapCamera(); }

  function frame(dt, controls, ms) {
    if (!active) return;
    pollButtons();
    const t = ms / 1000; timeT = t;
    toastT -= dt; if (toastT <= 0) $('stToast').hidden = true;
    bannerT -= dt; if (bannerT <= 0) $('stBanner').hidden = true;
    hurtCool = Math.max(0, hurtCool - dt);
    const live = mode === 'free' || mode === 'mission' || mode === 'count' || mode === 'card';
    if (live) {
      let ctl = { ...controls };
      if (mode === 'count') { ctl = { throttle: 0, steer: 0, brake: false }; countdown -= dt; if (controls.throttle > .5) { if (tsPress == null) tsPress = countdown; } else tsPress = null;
        const n = Math.ceil(countdown - .2); $('stCount').hidden = false; $('stCount').textContent = countdown > 3.2 ? '' : n > 0 ? n : 'LOS!';
        if ($('stCount').dataset.n !== String(n)) { $('stCount').dataset.n = n; if (n > 0 && n <= 3) sfx('tick'); $('stCount').classList.remove('pop'); void $('stCount').offsetWidth; $('stCount').classList.add('pop'); }
        if (countdown <= .2) { mode = 'mission'; sfx('go'); rt?.start?.(); setTimeout(() => { if ($('stCount').textContent === 'LOS!') $('stCount').hidden = true; }, 600);
          if (tsPress != null && tsPress >= .4 && tsPress <= 1.25) { turbo(player, tsPress >= .6 && tsPress <= 1 ? 1.4 : .8, TOP * 1.15); toast(tsPress >= .6 && tsPress <= 1 ? 'PERFEKTER TURBO-START!' : 'TURBO-START!', 1000); } } }
      if (mode === 'card') ctl = { throttle: 0, steer: 0, brake: true };
      // physics in small steps
      let rem = Math.min(dt, .1);
      while (rem > 1e-6) { const h = Math.min(.02, rem); rem -= h;
        const ev = stepCar(player, ctl, h, isl);
        for (const e of ev) {
          if (e === 'water' || e === 'lava') { burst(player.x, .5, player.z, e === 'lava' ? 'fire' : 'smoke'); toast(e === 'lava' ? 'LAVA!' : 'PLATSCH!', 900); if (mode === 'mission') { hurt(e); } if (mode !== 'result') respawnSafe(); break; }
          if (e === 'crash') { cam.shake = Math.max(cam.shake, .5); sfx('hit'); }
          if (e.startsWith('drift')) sfx('boost');
          if (e === 'bigland' && player.lastAir > 1.1 && mode === 'free') toast(`SPRUNG! ${player.lastAir.toFixed(1)} s`, 900);
        }
      }
      // npcs are driven by their runtime; free ones just animate
      if (mode === 'mission' && rt) { elapsed += dt; rt.update(dt, t); }
      else if (mode === 'count' && rt?.boss) rt.boss.update(dt, t);
      stepProjectiles(dt); stepRockets(dt);
      for (let i = hazards.length - 1; i >= 0; i--) if (!hazards[i].update(dt)) { hazards[i].dispose(); hazards.splice(i, 1); }
      for (let i = debris.length - 1; i >= 0; i--) { const d = debris[i]; d.life -= dt; d.vy -= 25 * dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt; d.m.rotation.x += dt * 6; const gy = isl.ground(d.m.position.x, d.m.position.z); if (d.m.position.y < gy + .3) { d.m.position.y = gy + .3; d.vy *= -.3; d.vx *= .6; d.vz *= .6; } if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); } }
      // boost pads
      padCool -= dt; if (padCool <= 0) for (const P of isl.pads) { const dx = player.x - P.x, dz = player.z - P.z, sa = Math.sin(P.angle), ca = Math.cos(P.angle); if (Math.abs(dx * sa + dz * ca) < P.len / 2 + .5 && Math.abs(dx * ca - dz * sa) < P.w / 2 + .6 && Math.abs(player.y - P.y) < 1.5) { padCool = .6; turbo(player, .9, TOP * 1.18); sfx('boost'); break; } }
      // safe point for respawns
      safeT -= dt; if (safeT <= 0 && player.grounded && player.surface === 'road' && player.spinT <= 0) { safeT = .8; lastSafe = { x: player.x, z: player.z, angle: player.angle }; }
      if (mode === 'free' || mode === 'card') { freeRoam(dt, t); stepTraffic(Math.min(dt, .05)); }
    }
    // models
    playerModel.position.set(player.x, player.y, player.z); playerModel.rotation.set(-player.pitch, player.angle + player.spinAngle, 0);
    playerModel.visible = !(player.invuln > 0 && player.spinT <= 0 && Math.floor(ms / 80) % 2 && mode !== 'result');
    animateCar(playerModel, player, dt); fx.kart('p', playerModel, player, ms, driftTierOf(player));
    for (const n of traffic) { n.model.visible = !mission; if (!mission) { n.model.position.set(n.c.x, n.c.y, n.c.z); n.model.rotation.set(-n.c.pitch, n.c.angle + n.c.spinAngle, 0); animateCar(n.model, n.c, dt); fx.kart(n.key, n.model, n.c, ms, 0); } }
    for (const n of npcs) { n.model.position.set(n.c.x, n.c.y, n.c.z); n.model.rotation.set(-n.c.pitch, n.c.angle + n.c.spinAngle, 0); n.model.visible = !(n.ghost > 0 && Math.floor(ms / 70) % 2); animateCar(n.model, n.c, dt); fx.kart(n.key, n.model, n.c, ms, 0); }
    for (const G of gears) if (G.m.visible) { G.m.rotation.y = t * 2; G.m.position.y = G.y + Math.sin(t * 2.5 + G.x) * .35; }
    for (const b of beacons) { b.ring.rotation.z = t; b.icon.position.y = 8 + Math.sin(t * 2 + b.x) * .5; b.pillar.material.opacity = (state.done[b.m.id] ? .1 : .24) + Math.sin(t * 3 + b.z) * .05; }
    isl.update(dt, t, camera, player);
    gps.update(dt, t, player);
    if (mode === 'map') { if (!mission) steerGps(); drawBigMap(t); }
    updateCamera(dt);
    stepWeather(dt, t);
    updateHud();
    if (audio?.update) try { audio.update(player, live); } catch {}
    renderer.render(scene, camera);
  }
  const driftTierOf = c => c.drift ? (c.driftT >= 2.8 ? 3 : c.driftT >= 1.7 ? 2 : c.driftT >= .75 ? 1 : 0) : 0;
  function respawnSafe() { respawn(lastSafe); }

  function freeRoam(dt, t) {
    // beacons
    nearBeacon = null; let nd = 1e9;
    for (const b of beacons) { const d = Math.hypot(player.x - b.x, player.z - b.z); if (d < 9 && d < nd) { nd = d; nearBeacon = b; } }
    if (cardSnooze && (!nearBeacon || nearBeacon.m !== cardSnooze)) cardSnooze = null;
    if (mode === 'free' && nearBeacon && nearBeacon.m !== cardSnooze && Math.abs(player.speed) < 14) openCard(nearBeacon);
    const pr = $('stPrompt'); if (nearBeacon && mode === 'free') { pr.hidden = false; pr.innerHTML = `<b>ENTER</b> ${nearBeacon.m.icon} ${esc(nearBeacon.m.name)}`; } else pr.hidden = true;
    // gears
    for (const G of gears) if (!G.got && Math.hypot(player.x - G.x, player.z - G.z) < 3.2 && Math.abs(player.y + 1 - G.y) < 3.5) {
      G.got = true; G.m.visible = false; state.gears.push(G.id); sfx('pick'); fx.burst(G.x, G.y - 1, G.z, 'box');
      const xp = state.gears.length === GEARS ? 800 : 30; save(xp); banner('ZAHNRAD GEFUNDEN', `⚙️ ${state.gears.length} / ${GEARS}`, `+${xp} XP`, 2.2, '#ffd23a');
    }
    // zone banner
    const z = isl.zoneAt(player.x, player.z); if (z !== zoneNow) { if (zoneNow && Date.now() - zoneBannerT > 8000) { banner('ZONE', z.name.toUpperCase(), '', 2, z.color); zoneBannerT = Date.now(); } zoneNow = z; }
    steerGps();
  }
  // GPS: your own waypoint from the map, otherwise the nearest open mission
  function steerGps() {
    if (waypoint && Math.hypot(waypoint.x - player.x, waypoint.z - player.z) < 14) { toast('ZIEL ERREICHT', 1100); sfx('ring'); waypoint = null; }
    const open = beacons.filter(b => !state.done[b.m.id]);
    const goal = waypoint || (open.length ? (b => ({ x: b.x, z: b.z, b }))(open.sort((a, c) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(c.x - player.x, c.z - player.z))[0]) : null);
    if (goal && !nearBeacon && Math.hypot(goal.x - player.x, goal.z - player.z) > 30) {
      const b = goal.b, ch = b && CHAPTERS.find(c => c.id === b.m.ch);
      gps.target(goal.x, goal.z, b ? (b.m.boss ? '#ff4a5a' : ch.color) : '#4ad8ff');
      gpsInfo = b ? { icon: b.m.icon, kind: b.m.boss ? 'BOSS' : 'MISSION', name: b.m.name, color: b.m.boss ? '#ff4a5a' : ch.color } : { icon: '📍', kind: 'WEGPUNKT', name: goal.name || 'Dein Ziel', color: '#4ad8ff' };
    } else { gps.off(); gpsInfo = null; }
  }

  function snapCamera() { const a = player.angle; cam.pos.set(player.x - Math.sin(a) * 8, player.y + 3.6, player.z - Math.cos(a) * 8); cam.look.set(player.x, player.y + 1, player.z); }
  function updateCamera(dt) {
    const bossCam = !!rt?.boss && mode === 'mission', a = player.angle + (player.drift ? player.drift * -.18 : 0), far = cam.mode || bossCam ? 12 : 7.6, hgt = cam.mode || bossCam ? 5.4 : 3.2;
    const tx = player.x - Math.sin(a) * far, tz = player.z - Math.cos(a) * far; let ty = player.y + hgt;
    const gy = isl.ground(tx, tz) + 1.2; if (ty < gy) ty = gy;
    const k = 1 - Math.exp(-dt * 6); cam.pos.x += (tx - cam.pos.x) * k; cam.pos.z += (tz - cam.pos.z) * k; cam.pos.y += (ty - cam.pos.y) * (1 - Math.exp(-dt * 4));
    let lookAt = new THREE.Vector3(player.x + Math.sin(player.angle) * 3, player.y + 1.2, player.z + Math.cos(player.angle) * 3);
    if (bossCam) lookAt.lerp(rt.boss.weak(), .18);
    if (mode === 'count' && rt?.boss && countdown > 1.4) { lookAt = rt.boss.weak(); const back = new THREE.Vector3(player.x, player.y, player.z).sub(lookAt).setY(0).normalize(); cam.pos.lerp(new THREE.Vector3(player.x + back.x * 9, player.y + 6, player.z + back.z * 9), 1 - Math.exp(-dt * 3)); }
    cam.look.lerp(lookAt, 1 - Math.exp(-dt * (mode === 'count' ? 3 : 10)));
    cam.shake = Math.max(0, cam.shake - dt * 1.6); const sh = cam.shake * cam.shake * .8;
    camera.position.set(cam.pos.x + (Math.random() - .5) * sh, cam.pos.y + (Math.random() - .5) * sh, cam.pos.z + (Math.random() - .5) * sh); camera.lookAt(cam.look);
    const fov = 64 + clamp((player.speed - TOP * .7) * .5, 0, 10) + (player.turboT > 0 ? 4 : 0); cam.fov += (fov - cam.fov) * k; camera.fov = cam.fov; camera.updateProjectionMatrix();
    sun.position.set(player.x + 120, player.y + 200, player.z + 80); sun.target.position.set(player.x, player.y, player.z); sky.position.copy(camera.position);
  }
  function updateHud() {
    $('stSpeed').textContent = Math.round(Math.abs(player.speed) * 3.6);
    const tier = driftTierOf(player); $('stDrift').className = tier ? 't' + tier : '';
    const z = zoneNow || isl.zoneAt(player.x, player.z); $('stZone').textContent = z.name; $('stZone').style.color = z.color;
    const ch = CHAPTERS.find(c => openChapters(state.done).slice(-1)[0] === c.id); $('stZoneCh').textContent = `KAPITEL ${ch.n}`;
    $('stProg').textContent = `⭐ ${Object.values(state.done).reduce((a, b) => a + b, 0)}  ⚙️ ${state.gears.length}/${GEARS}`;
    if (rt && (mode === 'mission' || mode === 'count')) { const h = rt.hud?.() || {};
      $('stObjKind').textContent = h.kind || ''; $('stObjTitle').textContent = h.title || ''; $('stObjText').textContent = h.text || '';
      $('stObjTime').textContent = h.time != null ? fmt(h.time) : h.elapsed ? fmt(elapsed) : ''; $('stObj').classList.toggle('warn', !!h.warn); $('stObj').classList.toggle('hot', !!h.hot); }
    const gi = (mode === 'free' || mode === 'card') && gps.active && gpsInfo; $('stGps').hidden = !gi;
    if (gi) { const path = gps.path; let L = 0; for (let k = 1; k < path.length; k++) L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
      $('stGps').style.setProperty('--gc', gi.color); $('stGpsIcon').textContent = gi.icon; let ahead = path[path.length - 1]; for (let k = 1, d = 0; k < path.length; k++) { d += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]); if (d > 18) { ahead = path[k]; break; } }
      const turn = L > 40 && Math.abs(angleDiff(Math.atan2(ahead[0] - player.x, ahead[1] - player.z), player.angle)) > 2.1; $('stGps').classList.toggle('turn', turn);
      $('stGpsKind').textContent = turn ? '↩ BITTE WENDEN' : gi.kind; $('stGpsName').textContent = gi.name; $('stGpsDist').textContent = L > 950 ? (L / 1000).toFixed(1) + ' km' : Math.round(L / 10) * 10 + ' m'; }
    drawMini();
  }

  return { open, close, frame, key, get active() { return active; }, get state() { return state; }, reload() { state = load(); if (built) refreshBeacons(); } };
}
