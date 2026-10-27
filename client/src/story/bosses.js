import * as THREE from 'three';
import { kit, krakenHead, tentacle, dragon, sE as E, sCp as Cp, sP as P, shiftParts } from '../game/critters.js';
import { sculpt } from '../game/sculpt.js';

// Boss fights of the story mode and the small models the missions use (drones, crates, totems, generators, stars, worm, avalanche).
// A boss gets a ctx from the story runtime: { scene, isl, player, aoe(), line(), lob(), homing(), hurt(), burst(), shake(), sfx(), say() }.
// Each boss: update(dt) · weak() → world position of the weak spot · weakR · vulnerable · hp / maxHp · hit() · dispose()

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const glowMat = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

// =====================================================================================================================
// small models
export function droneModel() {
  const k = kit(); k.add('body', 'sphere', 0x2a2440, [0, 0, 0], [1.1, .55, 1.1]); k.add('body', 'sphere', 0x5a3aff, [0, -.15, 0], [1.2, .2, 1.2]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + TAU / 8; k.add('body', 'cyl', 0x3a3448, [Math.cos(a) * 1.1, .1, Math.sin(a) * 1.1], [.08, .5, .08], [0, 0, Math.PI / 2]); }
  const g = k.build(); const eye = new THREE.Mesh(new THREE.SphereGeometry(.32, 12, 8), glowMat(0xff2a4a)); eye.position.set(0, -.05, 1); g.add(eye);
  const rotors = []; for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + TAU / 8, r = new THREE.Mesh(new THREE.BoxGeometry(1.3, .04, .18), new THREE.MeshStandardMaterial({ color: 0x1a1a22 })); r.position.set(Math.cos(a) * 1.6, .35, Math.sin(a) * 1.6); g.add(r); rotors.push(r); }
  g.userData.anim = t => rotors.forEach((r, i) => { r.rotation.y = t * 40 + i; });
  return g;
}
let crateTex = null;
function phantomTex() {
  if (crateTex) return crateTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#4a2a8a'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#2a1650'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118); g.beginPath(); g.moveTo(5, 5); g.lineTo(123, 123); g.stroke();
  g.fillStyle = '#c8b0ff'; g.font = '900 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('👻', 64, 66);
  crateTex = new THREE.CanvasTexture(c); crateTex.colorSpace = THREE.SRGBColorSpace; return crateTex;
}
export function targetModel(kind) {
  const g = new THREE.Group();
  if (kind === 'crate') { const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.MeshStandardMaterial({ map: phantomTex(), roughness: .7 })); m.position.y = 1.1; m.castShadow = true; g.add(m); g.userData.r = 1.6; }
  else if (kind === 'totem') {
    const st = new THREE.MeshStandardMaterial({ color: 0x6a5a8a, roughness: .8, flatShading: true });
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.2 - i * .2, 1.6, 2.2 - i * .2), st); b.position.y = .8 + i * 1.6; b.rotation.y = i * .3; b.castShadow = true; g.add(b);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), glowMat(0xb06aff)); e.position.set(s * .45, 1 + i * 1.6, (2.2 - i * .2) / 2 + .02); e.rotation.y = i * .3; g.add(e); } }
    const top = new THREE.Mesh(new THREE.ConeGeometry(1, 1.4, 4), st); top.position.y = 5.5; g.add(top); g.userData.r = 1.6;
  } else if (kind === 'generator') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a34, metalness: .6, roughness: .4 })); base.position.y = .6; g.add(base);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 3.4, 12), glowMat(0x9a6aff)); core.position.y = 2.6; g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, .18, 8, 24), new THREE.MeshStandardMaterial({ color: 0xc8c8d8, metalness: .8, roughness: .2 })); ring.position.y = 2.6; ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.anim = t => { ring.rotation.z = t * 3; ring.position.y = 2.6 + Math.sin(t * 2) * .8; }; g.userData.r = 2;
  }
  return g;
}
export function starModel(kind = 'star') {
  if (kind === 'crystal') { const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x3ab8ff, emissiveIntensity: .8, roughness: .1, metalness: .3, flatShading: true })); m.scale.y = 1.6; const g = new THREE.Group(); g.add(m); return g; }
  if (kind === 'gear') {
    const sh = new THREE.Shape(), n = 10; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, r = i % 2 ? .85 : 1.15; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const hole = new THREE.Path(); hole.absarc(0, 0, .35, 0, TAU, true); sh.holes.push(hole);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .3, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: .9, roughness: .25, emissive: 0x8a5a00, emissiveIntensity: .4 }));
    m.geometry.center(); const g = new THREE.Group(); g.add(m); return g;
  }
  const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i / 10 * TAU, r = i % 2 ? .5 : 1.2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .35, bevelEnabled: true, bevelSize: .1, bevelThickness: .1, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa000, emissiveIntensity: .6, metalness: .4, roughness: .3 }));
  m.geometry.center(); const g = new THREE.Group(); g.add(m); return g;
}
export function itemBoxModel() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 128, 128);
  ['#ff4a4a', '#ffd04a', '#5ad86a', '#3ab8ff', '#c44dff'].forEach((col, i) => gr.addColorStop(i / 4, col)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '900 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🚀', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: .9, emissive: 0xffffff, emissiveIntensity: .15, roughness: .2 }));
  const grp = new THREE.Group(); grp.add(m); return grp;
}
export function rocketModel() {
  const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, metalness: .4, roughness: .3 }));
  body.rotation.x = Math.PI / 2; g.add(body); const tip = new THREE.Mesh(new THREE.ConeGeometry(.22, .6, 10), new THREE.MeshStandardMaterial({ color: 0xe03a30 })); tip.rotation.x = Math.PI / 2; tip.position.z = 1.1; g.add(tip);
  const fl = new THREE.Mesh(new THREE.ConeGeometry(.28, 1.4, 10), glowMat(0xffa030)); fl.rotation.x = -Math.PI / 2; fl.position.z = -1.4; g.add(fl); return g;
}
// lobbed projectiles
export function projModel(kind) {
  const col = { ink: 0x2a1a3a, rock: 0x8a7a6a, fire: 0xff6a10, ice: 0xbfeaff, sand: 0xd8b880, lava: 0xff5a10 }[kind] || 0xffffff;
  const glow = kind === 'fire' || kind === 'lava';
  const m = new THREE.Mesh(kind === 'rock' ? new THREE.IcosahedronGeometry(1.4, 0) : new THREE.SphereGeometry(1.1, 14, 10), glow ? glowMat(col) : new THREE.MeshStandardMaterial({ color: col, roughness: .6, flatShading: kind === 'rock' || kind === 'ice' }));
  m.castShadow = true; const g = new THREE.Group(); g.add(m); return g;
}
export function wormModel() {
  const g = new THREE.Group(), segs = [], sand = new THREE.MeshStandardMaterial({ color: 0xc8965a, roughness: .9 }), ring = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: .9 });
  for (let i = 0; i < 16; i++) { const r = 4.2 - i * .16, s = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), sand); b.scale.set(1, 1, .8); b.castShadow = true; s.add(b); const rg = new THREE.Mesh(new THREE.TorusGeometry(r * .98, r * .12, 6, 20), ring); s.add(rg); g.add(s); segs.push(s); }
  // the head: open mouth with teeth
  const head = segs[0], mouth = new THREE.Mesh(new THREE.CircleGeometry(3.3, 20), new THREE.MeshBasicMaterial({ color: 0x3a0a0a })); mouth.position.z = 3.3; head.add(mouth);
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, t = new THREE.Mesh(new THREE.ConeGeometry(.35, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0xf4ecd8 })); t.position.set(Math.cos(a) * 3, Math.sin(a) * 3, 3.6); t.rotation.set(Math.PI / 2, 0, 0); t.lookAt(0, 0, 3.6); t.rotateX(Math.PI / 2); head.add(t); }
  g.userData.segs = segs; return g;
}
export function avalancheModel() {
  const g = new THREE.Group(), snow = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: .9 }), parts = [];
  for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + Math.random() * 3, 1), snow); m.position.set((Math.random() - .5) * 40, Math.random() * 8, (Math.random() - .5) * 8); m.castShadow = true; g.add(m); parts.push([m, Math.random() * 9]); }
  g.userData.anim = t => parts.forEach(([m, ph]) => { m.rotation.x = t * 2 + ph; m.position.y = 3 + Math.abs(Math.sin(t * 3 + ph)) * 5; });
  return g;
}

// =====================================================================================================================
// bosses
class BossBase {
  constructor(ctx, arena) { this.ctx = ctx; this.A = arena; this.t = 0; this.state = 'intro'; this.st = 0; this.vulnerable = false; this.hp = this.maxHp; this.group = new THREE.Group(); ctx.scene.add(this.group); }
  get phase2() { return this.hp <= this.maxHp / 2; }
  set(state) { this.state = state; this.st = 0; }
  hit() { this.hp = Math.max(0, this.hp - 1); this.flash = .25; }
  dispose() { this.ctx.scene.remove(this.group); }
  playerAngle(x, z) { const p = this.ctx.player; return Math.atan2(p.x - x, p.z - z); }
}

// ---------- KRAKE: lives in the sea next to the beach. Tentacles slam lines, ink balls rain down. Shoot the head when it surfaces.
export class Kraken extends BossBase {
  get maxHp() { return 8; }
  constructor(ctx, arena) {
    super(ctx, arena);
    const out = Math.atan2(arena.z, arena.x); this.out = out;
    this.bx = arena.x + Math.cos(out) * (arena.r + 32); this.bz = arena.z + Math.sin(out) * (arena.r + 32);
    this.head = krakenHead(); this.head.scale.setScalar(13); this.head.position.set(this.bx, -10, this.bz); this.head.rotation.y = Math.atan2(arena.x - this.bx, arena.z - this.bz); this.group.add(this.head);
    this.tents = [];
    for (let i = 0; i < 6; i++) { const t = tentacle(); t.scale.setScalar(4.2); const lat = (i - 2.5) * 13, d = arena.r + 4 + (i % 2) * 5, x = arena.x + Math.cos(out) * d - Math.sin(out) * lat, z = arena.z + Math.sin(out) * d + Math.cos(out) * lat; t.position.set(x, -2, z); this.group.add(t); this.tents.push({ m: t, slam: null, ph: i }); }
    this.headY = -16; this.cycle = 0;
  }
  weak() { return new THREE.Vector3(this.bx, this.headY + 12, this.bz); }
  get weakR() { return 12; }
  update(dt) {
    this.t += dt; this.st += dt; const c = this.ctx, p = c.player, fast = this.phase2 ? .75 : 1;
    // idle tentacle sway, slam animations
    for (const T of this.tents) {
      const m = T.m;
      if (T.slam) { const s = T.slam; s.t += dt; const k = s.t < s.delay ? -.2 + s.t / s.delay * .4 : s.t < s.delay + .25 ? lerp(.2, 1.55, (s.t - s.delay) / .25) : s.t < s.delay + 1.6 ? 1.55 : lerp(1.55, 0, Math.min(1, (s.t - s.delay - 1.6) / .8));
        m.rotation.set(0, s.ang, 0); m.rotation.order = 'YXZ'; m.rotation.x = k; m.userData.bend(.15 + Math.max(0, k) * .05, this.t); if (s.t > s.delay + 2.6) T.slam = null; }
      else { m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(p.x - m.position.x, p.z - m.position.z); m.rotation.x = Math.sin(this.t * 1.3 + T.ph) * .25 - .1; m.userData.bend(.4 + Math.sin(this.t * 2 + T.ph) * .3, this.t); }
      m.position.y = -2 + Math.sin(this.t * 1.7 + T.ph) * .4;
    }
    // head surfacing
    const up = this.state === 'surface' || this.state === 'intro'; this.headY = lerp(this.headY, up ? 3 : -16, Math.min(1, dt * (up ? 2.5 : 1.5)));
    this.head.position.y = this.headY + Math.sin(this.t * 1.5) * .5; this.head.rotation.y = Math.atan2(p.x - this.bx, p.z - this.bz);
    this.vulnerable = this.state === 'surface' && this.headY > -1;
    if (this.flash > 0) { this.flash -= dt; this.head.scale.setScalar(13 * (1 + this.flash * .3)); }
    switch (this.state) {
      case 'intro': if (this.st > 1 && c.go) this.set('slam'); break;
      case 'slam': {
        const n = this.phase2 ? 4 : 3;
        if (this.st > (this.slams || 0) * 1.6 * fast && (this.slams || 0) < n) {
          this.slams = (this.slams || 0) + 1; const T = this.tents[Math.floor(Math.random() * 6)]; if (T.slam) break;
          const ang = Math.atan2(p.x + p.vx * .5 - T.m.position.x, p.z + p.vz * .5 - T.m.position.z), len = 31;
          const delay = 1.25 * fast; T.slam = { t: 0, delay, ang };
          c.line({ x0: T.m.position.x, z0: T.m.position.z, ang, len, w: 7, delay, kind: 'slam' });
        }
        if (this.st > n * 1.6 * fast + 1.4) { this.slams = 0; this.set('ink'); }
        break;
      }
      case 'ink':
        if (!this.inked) { this.inked = true; const n = this.phase2 ? 6 : 4; for (let i = 0; i < n; i++) setTimeout(() => { if (this.disposed) return; const lead = .8 + Math.random() * .8, tx = p.x + p.vx * lead + (Math.random() - .5) * 10, tz = p.z + p.vz * lead + (Math.random() - .5) * 10; c.lob({ from: [this.bx, 10, this.bz], to: [tx, tz], time: 1.5 * fast, r: 5, kind: 'ink' }); }, i * 260); }
        if (this.st > 2.6) { this.inked = false; this.set('surface'); c.say('DER KOPF! FEUER!'); c.sfx('splash'); }
        break;
      case 'surface': if (this.st > (this.phase2 ? 3.6 : 4.6)) this.set('slam'); break;
    }
  }
  dispose() { this.disposed = true; super.dispose(); }
}

// ---------- TEMPELGOLEM: walks after you, smashes the ground around him (the core glows afterwards), throws boulders, charges in phase 2.
function golemModel() {
  const k = kit(), S = 0xa8a690, M = 0x6aa04a, D = 0x7a7868;
  k.addGeo('body', sculpt([E(S, 0, 0, 0, 2.2, 2.4, 1.6), E(M, 0, 1.6, -.4, 1.8, .8, 1.2), E(S, 0, -1.8, 0, 1.7, 1, 1.3), P(E(M, .8, .6, 1.2, .7, .6, .5)), P(E(M, -1, -.6, 1.1, .6, .5, .5))], { k: .5, res: 40 }));
  k.addGeo('head', sculpt([E(S, 0, 0, 0, 1.1, 1, 1), E(D, 0, .45, .6, 1, .3, .5), P(E(M, 0, .9, 0, .9, .3, .9))], { k: .3, res: 30 }));
  k.addGeo('aL', sculpt([Cp(S, [0, 0, 0], [0, -2.6, .2], .8, .7), E(D, 0, -3.2, .3, 1.1, .9, 1.1)], { k: .3, res: 30 }));
  k.addGeo('aR', sculpt([Cp(S, [0, 0, 0], [0, -2.6, .2], .8, .7), E(D, 0, -3.2, .3, 1.1, .9, 1.1)], { k: .3, res: 30 }));
  k.addGeo('lL', sculpt([Cp(D, [0, 0, 0], [0, -2.2, 0], .9, .8), E(D, 0, -2.5, .3, 1, .5, 1.3)], { k: .3, res: 26 }));
  k.addGeo('lR', sculpt([Cp(D, [0, 0, 0], [0, -2.2, 0], .9, .8), E(D, 0, -2.5, .3, 1, .5, 1.3)], { k: .3, res: 26 }));
  const pv = { head: [0, 3.2, .2], aL: [-2.6, 1.6, 0], aR: [2.6, 1.6, 0], lL: [-1, -2.4, 0], lR: [1, -2.4, 0] };
  const g = k.build(pv); shiftParts(g, pv);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.85, 16, 12), new THREE.MeshBasicMaterial({ color: 0x3aff9a, toneMapped: false })); core.position.set(0, .4, 1.45); g.add(core); g.userData.core = core;
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3aff9a, toneMapped: false })); e.position.set(s * .4, .1, .95); g.userData.bones.head.add(e); }
  return g;
}
export class Golem extends BossBase {
  get maxHp() { return 8; }
  constructor(ctx, arena) {
    super(ctx, arena); this.m = golemModel(); this.m.scale.setScalar(1.6); this.group.add(this.m);
    const a = Math.atan2(arena.z, arena.x); this.x = arena.x + Math.cos(a) * 18; this.z = arena.z + Math.sin(a) * 18; this.ang = 0; this.walk = 0;
  }
  weak() { const c = this.m.userData.core.getWorldPosition(new THREE.Vector3()); return c; }
  get weakR() { return 4; }
  update(dt) {
    this.t += dt; this.st += dt; const c = this.ctx, p = c.player, A = this.A, b = this.m.userData.bones, f = this.phase2 ? .75 : 1;
    const dp = Math.hypot(p.x - this.x, p.z - this.z), want = this.playerAngle(this.x, this.z);
    let speed = 0;
    switch (this.state) {
      case 'intro': if (this.st > 1 && c.go) this.set('walk'); break;
      case 'walk':
        this.ang += clamp(angDiff(want, this.ang), -dt * 1.5, dt * 1.5); speed = this.phase2 ? 7 : 5;
        if (dp < 20 && this.st > 1) { this.set('stomp'); c.aoe({ x: this.x, z: this.z, r: 17, delay: 1.3 * f, kind: 'slam' }); }
        else if (this.st > 4.5 * f) { this.set('throw'); }
        else if (this.phase2 && this.st > 3 && dp > 30 && Math.random() < dt * .4) { this.set('charge'); this.cAng = want; c.line({ x0: this.x, z0: this.z, ang: want, len: 70, w: 9, delay: 1.1, kind: 'charge' }); }
        break;
      case 'stomp': { const k = this.st / (1.3 * f); b.aL.rotation.x = b.aR.rotation.x = k < 1 ? -2.6 * k : lerp(-2.6, .4, Math.min(1, (this.st - 1.3 * f) * 6));
        if (this.st > 1.3 * f && !this.slammed) { this.slammed = true; c.shake(1.2); c.burst(this.x, c.isl.ground(this.x, this.z), this.z, 'dust'); c.sfx('slam'); }
        if (this.st > 1.4 * f) { this.vulnerable = true; }
        if (this.st > 1.3 * f + (this.phase2 ? 2.6 : 3.2)) { this.vulnerable = false; this.slammed = false; this.set('walk'); }
        break; }
      case 'throw':
        b.aR.rotation.x = this.st < .6 ? -2.8 * this.st / .6 : lerp(-2.8, .2, Math.min(1, (this.st - .6) * 5));
        if (this.st > .6 && !this.thrown) { this.thrown = true; const n = this.phase2 ? 3 : 2; for (let i = 0; i < n; i++) { const lead = .9 + i * .35; c.lob({ from: [this.x, 14, this.z], to: [p.x + p.vx * lead + (Math.random() - .5) * 6, p.z + p.vz * lead + (Math.random() - .5) * 6], time: 1.4, r: 6, kind: 'rock' }); } }
        if (this.st > 1.5) { this.thrown = false; this.set('walk'); }
        break;
      case 'charge':
        if (this.st > 1.1) { speed = 34; this.ang = this.cAng; if (Math.hypot(this.x - A.x, this.z - A.z) > A.r - 6 || this.st > 3.2) { this.set('dazed'); c.shake(1); c.sfx('slam'); } if (dp < 6) c.hurt('golem'); }
        break;
      case 'dazed': this.vulnerable = true; if (this.st > 2.4) { this.vulnerable = false; this.set('walk'); } break;
    }
    // move, stay in the arena
    this.x += Math.sin(this.ang) * speed * dt; this.z += Math.cos(this.ang) * speed * dt;
    const d = Math.hypot(this.x - A.x, this.z - A.z); if (d > A.r - 5) { this.x = A.x + (this.x - A.x) / d * (A.r - 5); this.z = A.z + (this.z - A.z) / d * (A.r - 5); }
    if (dp < 5.5 && this.state !== 'stomp') c.hurt('golem');
    this.walk += speed * dt * .25; b.lL.rotation.x = Math.sin(this.walk * 2) * .5; b.lR.rotation.x = -Math.sin(this.walk * 2) * .5;
    if (this.state === 'walk') { b.aL.rotation.x = -Math.sin(this.walk * 2) * .4; b.aR.rotation.x = Math.sin(this.walk * 2) * .4; }
    b.head.rotation.x = this.vulnerable ? .5 : 0;
    const gy = c.isl.ground(this.x, this.z); this.m.position.set(this.x, gy + 8.6 - (this.vulnerable ? 1.2 : 0), this.z); this.m.rotation.y = this.ang;
    const core = this.m.userData.core; core.material.color.setHex(this.vulnerable ? (Math.floor(this.t * 8) % 2 ? 0xffffff : 0x3aff9a) : 0x1a5a3a); core.scale.setScalar(this.vulnerable ? 1.3 : .9);
    if (this.flash > 0) this.flash -= dt;
  }
  get collider() { return { x: this.x, z: this.z, r: 4.5 }; }
}

// ---------- FROST-MECH: fires homing ice missiles, stomps, and charges in a straight line. If a charge ends at the edge it gets stuck: shoot the reactor.
function mechModel() {
  const k = kit(), W = 0xdce8f4, B = 0x3a5a8a, D = 0x2a2e3a;
  k.add('body', 'box', W, [0, 0, 0], [5, 3.6, 4]).add('body', 'box', B, [0, .2, 2.05], [4.4, 1.2, .2]).add('body', 'box', D, [0, -2.1, 0], [3.4, .8, 3]);
  k.add('body', 'cyl', D, [-3.1, .6, .6], [.9, 3, .9], [Math.PI / 2, 0, 0]).add('body', 'cyl', D, [3.1, .6, .6], [.9, 3, .9], [Math.PI / 2, 0, 0]);
  k.add('body', 'box', B, [0, 2.3, -.4], [2.6, 1.2, 2.4]);
  k.add('lL', 'box', D, [0, -1.8, 0], [1.2, 3.6, 1.4]).add('lL', 'box', W, [0, -3.8, .5], [1.8, .6, 2.6]);
  k.add('lR', 'box', D, [0, -1.8, 0], [1.2, 3.6, 1.4]).add('lR', 'box', W, [0, -3.8, .5], [1.8, .6, 2.6]);
  const pv = { lL: [-1.6, -2.4, 0], lR: [1.6, -2.4, 0] }, g = k.build(pv); shiftParts(g, pv);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(2, .35, .1), glowMat(0x5ae8ff)); eye.position.set(0, 2.4, .82); g.add(eye); g.userData.eye = eye;
  const reactor = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .8, 16), glowMat(0x2a6aff)); reactor.rotation.x = Math.PI / 2; reactor.position.set(0, .3, -2.3); g.add(reactor); g.userData.reactor = reactor;
  return g;
}
export class Mech extends BossBase {
  get maxHp() { return 10; }
  constructor(ctx, arena) { super(ctx, arena); this.m = mechModel(); this.m.scale.setScalar(1.5); this.group.add(this.m); this.x = arena.x; this.z = arena.z; this.ang = 0; this.walk = 0; }
  weak() { return this.m.userData.reactor.getWorldPosition(new THREE.Vector3()); }
  get weakR() { return 4.5; }
  update(dt) {
    this.t += dt; this.st += dt; const c = this.ctx, p = c.player, A = this.A, f = this.phase2 ? .8 : 1, b = this.m.userData.bones;
    const want = this.playerAngle(this.x, this.z), dp = Math.hypot(p.x - this.x, p.z - this.z); let speed = 0;
    switch (this.state) {
      case 'intro': if (this.st > 1 && c.go) this.set('walk'); break;
      case 'walk':
        this.ang += clamp(angDiff(want, this.ang), -dt * 1.2, dt * 1.2); speed = 4;
        if (dp < 16) { this.set('stomp'); c.aoe({ x: this.x, z: this.z, r: 15, delay: 1.1 * f, kind: 'ice' }); }
        else if (this.st > 2.4 * f) this.set(Math.random() < .5 ? 'missiles' : 'aim');
        break;
      case 'missiles':
        this.ang += clamp(angDiff(want, this.ang), -dt * 2, dt * 2);
        if (this.st > .5 && !this.fired) { this.fired = true; const n = this.phase2 ? 6 : 4; for (let i = 0; i < n; i++) setTimeout(() => { if (this.disposed) return; const s = i % 2 ? 1 : -1; c.homing({ from: [this.x + Math.cos(this.ang) * s * 4.6, 8, this.z - Math.sin(this.ang) * s * 4.6], ang: this.ang + s * .6, speed: 25, turn: 1.5, life: 5, kind: 'ice' }); }, i * 220); }
        if (this.st > 2.2) { this.fired = false; this.set('aim'); }
        break;
      case 'aim':
        this.ang += clamp(angDiff(want, this.ang), -dt * 3, dt * 3);
        if (!this.lineSet && this.st > .3) { this.lineSet = true; this.cAng = this.ang; c.line({ x0: this.x, z0: this.z, ang: this.cAng, len: A.r * 2.2, w: 9, delay: 1.2 * f, kind: 'charge' }); }
        if (this.st > .3 + 1.2 * f) { this.lineSet = false; this.set('charge'); c.sfx('boost'); }
        break;
      case 'charge':
        speed = 46; this.ang = this.cAng; if (dp < 6.5) c.hurt('mech');
        if (Math.hypot(this.x - A.x, this.z - A.z) > A.r - 5) { this.set('stuck'); c.shake(1.4); c.burst(this.x, 20, this.z, 'ice'); c.sfx('slam'); c.say('ER STECKT FEST! FEUER!'); }
        break;
      case 'stuck': this.vulnerable = true; if (this.st > (this.phase2 ? 3.4 : 4.2)) { this.vulnerable = false; this.set('walk'); } break;
      case 'stomp': if (this.st > 1.1 * f && !this.stomped) { this.stomped = true; c.shake(.8); c.sfx('slam'); } if (this.st > 1.8) { this.stomped = false; this.set('aim'); } break;
    }
    this.x += Math.sin(this.ang) * speed * dt; this.z += Math.cos(this.ang) * speed * dt;
    const d = Math.hypot(this.x - A.x, this.z - A.z); if (d > A.r - 4.5) { this.x = A.x + (this.x - A.x) / d * (A.r - 4.5); this.z = A.z + (this.z - A.z) / d * (A.r - 4.5); }
    if (dp < 5 && this.state !== 'charge' && this.state !== 'stuck') c.hurt('mech');
    this.walk += speed * dt * .2; b.lL.rotation.x = Math.sin(this.walk * 3) * .5; b.lR.rotation.x = -Math.sin(this.walk * 3) * .5;
    const gy = c.isl.ground(this.x, this.z), stuckTilt = this.state === 'stuck' ? .35 : 0;
    this.m.position.set(this.x, gy + 9.8 + (this.state === 'stomp' && this.st < 1.1 * f ? this.st * 3 : 0), this.z); this.m.rotation.set(stuckTilt, this.ang, 0);
    const r = this.m.userData.reactor; r.material.color.setHex(this.vulnerable ? (Math.floor(this.t * 8) % 2 ? 0xffffff : 0xff5a3a) : 0x2a6aff); r.scale.setScalar(this.vulnerable ? 1.35 : 1);
    this.m.userData.eye.material.color.setHex(this.state === 'aim' || this.state === 'charge' ? 0xff3a3a : 0x5ae8ff);
  }
  dispose() { this.disposed = true; super.dispose(); }
}

// ---------- MAGMA-DRACHE: circles over the crater spitting fireballs, dives along a line, lands on the rim and breathes fire. Shoot him while he rests.
export class Dragon extends BossBase {
  get maxHp() { return 12; }
  constructor(ctx, arena) {
    super(ctx, arena); this.m = dragon(0xb02a1a, 0xffa040, 0x3a1a1a); this.m.scale.setScalar(4.2); this.group.add(this.m);
    this.a = 0; this.x = arena.x; this.z = arena.z; this.y = arena.y + 40; this.ang = 0; this.geyserT = 3;
  }
  weak() { const h = this.m.userData.bones.head.getWorldPosition(new THREE.Vector3()); return h; }
  get weakR() { return 5.5; }
  update(dt) {
    this.t += dt; this.st += dt; const c = this.ctx, p = c.player, A = this.A, f = this.phase2 ? .75 : 1;
    let tx = this.x, ty = this.y, tz = this.z, flap = 3;
    switch (this.state) {
      case 'intro': this.a += dt * .4; tx = A.x + Math.cos(this.a) * 45; tz = A.z + Math.sin(this.a) * 45; ty = A.y + 34; if (this.st > 1.5 && c.go) this.set('circle'); break;
      case 'circle':
        this.a += dt * (this.phase2 ? .55 : .42); tx = A.x + Math.cos(this.a) * 46; tz = A.z + Math.sin(this.a) * 46; ty = A.y + 30;
        if (this.st > (this.shots || 0) * 1.1 * f + .8 && (this.shots || 0) < (this.phase2 ? 5 : 3)) { this.shots = (this.shots || 0) + 1; const lead = 1 + Math.random() * .6; c.lob({ from: [this.x, this.y, this.z], to: [p.x + p.vx * lead, p.z + p.vz * lead], time: 1.3, r: 6, kind: 'fire' }); c.sfx('fire'); }
        if (this.st > 5.5 * f) { this.shots = 0; this.set(Math.random() < .5 ? 'dive' : 'land'); }
        break;
      case 'dive': {
        if (!this.d) { const ang = Math.atan2(p.x - this.x, p.z - this.z); this.d = { ang, x0: this.x, z0: this.z }; c.line({ x0: this.x, z0: this.z, ang, len: 120, w: 10, delay: 1.2 * f, kind: 'fire' }); }
        const k = (this.st - 1.2 * f) / 1.6; if (k < 0) { tx = this.d.x0; tz = this.d.z0; ty = A.y + 30; }
        else { tx = this.d.x0 + Math.sin(this.d.ang) * 120 * Math.min(1, k); tz = this.d.z0 + Math.cos(this.d.ang) * 120 * Math.min(1, k); ty = A.y + 4 + Math.abs(k - .5) * 30; if (Math.hypot(p.x - this.x, p.z - this.z) < 7 && Math.abs(p.y - this.y) < 8) c.hurt('dragon'); }
        if (k > 1.1) { this.d = null; this.a = Math.atan2(this.z - A.z, this.x - A.x); this.set('circle'); }
        break; }
      case 'land': {
        if (!this.l) { const a = this.playerRim(); this.l = { x: A.x + Math.cos(a) * (A.r - 4), z: A.z + Math.sin(a) * (A.r - 4) }; }
        tx = this.l.x; tz = this.l.z; ty = c.isl.ground(tx, tz) + 5; flap = this.st < 1.5 ? 4 : 0;
        if (this.st > 1.6 && !this.breath) { this.breath = true; const ang = Math.atan2(p.x - tx, p.z - tz); this.bAng = ang; c.line({ x0: tx, z0: tz, ang, len: 60, w: 12, delay: 1.1 * f, kind: 'fire', linger: 1.4 }); }
        if (this.st > 1.6 + 1.1 * f + 1.4) this.vulnerable = true;
        if (this.st > 1.6 + 1.1 * f + 1.4 + (this.phase2 ? 3.4 : 4.4)) { this.vulnerable = false; this.breath = false; this.l = null; this.a = Math.atan2(this.z - A.z, this.x - A.x); this.set('circle'); }
        break; }
    }
    // phase 2: lava geysers around the crater
    if (this.phase2 && this.state !== 'intro') { this.geyserT -= dt; if (this.geyserT <= 0) { this.geyserT = 2.2; const a = Math.random() * TAU, r = A.inner + 6 + Math.random() * (A.r - A.inner - 10); c.aoe({ x: A.x + Math.cos(a) * r, z: A.z + Math.sin(a) * r, r: 7, delay: 1.2, kind: 'lava' }); } }
    const k = Math.min(1, dt * 2.2); const nx = lerp(this.x, tx, k), nz = lerp(this.z, tz, k);
    const mv = Math.hypot(nx - this.x, nz - this.z); if (mv > .01) this.ang = Math.atan2(nx - this.x, nz - this.z);
    if (this.state === 'land' && this.st > 1.4) this.ang += clamp(angDiff(this.bAng ?? this.ang, this.ang), -dt * 2, dt * 2);
    this.x = nx; this.z = nz; this.y = lerp(this.y, ty, k);
    this.m.position.set(this.x, this.y + (flap ? Math.sin(this.t * flap) * .6 : 0), this.z); this.m.rotation.y = this.ang;
    this.m.userData.anim(this.t, flap || .3);
    this.m.userData.bones.head.rotation.x = this.vulnerable ? .6 : 0;
  }
  playerRim() { const p = this.ctx.player; return Math.atan2(p.z - this.A.z, p.x - this.A.x) + Math.PI * (.6 + Math.random() * .8); }
}

export const BOSS_CLASSES = { kraken: Kraken, golem: Golem, mech: Mech, dragon: Dragon };
