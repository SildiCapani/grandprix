import * as THREE from 'three';
import { sculpt } from './sculpt.js';
import { kit, critterMat, sE as E, sCp as Cp, sP as P, shiftParts } from './critters.js';

// Sea creatures for the ocean cup (beach, coral reef, deep-sea trench). Same clay style as critters.js:
// each returns a group facing +z with userData.anim(t, speed) for its movement.

const jellyMats = new Map();
function jellyMat(color) {
  if (!jellyMats.has(color)) jellyMats.set(color, new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, transparent: true, opacity: .62, roughness: .15, emissive: color, emissiveIntensity: .9, depthWrite: false, side: THREE.DoubleSide }));
  return jellyMats.get(color);
}

// Jellyfish: a glowing translucent bell that pulses, frilly arms and long trailing tentacles.
export function jellyfish(color = 0xff7ae8) {
  const k = kit(), light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), .55).getHex();
  k.addGeo('bell', sculpt([E(color, 0, .25, 0, 1, .72, 1), E(light, 0, -.12, 0, .92, .2, .92, null, { k: .2 }), P(E(light, 0, .45, 0, .55, .45, .55))], { k: .25, res: 40 }));
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; k.addGeo('arms', sculpt([Cp(light, [Math.cos(a) * .25, -.15, Math.sin(a) * .25], [Math.cos(a) * .35, -1.3, Math.sin(a) * .35], .13, .05)], { k: .1, res: 18 })); }
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.addGeo('tent', sculpt([Cp(color, [Math.cos(a) * .82, -.15, Math.sin(a) * .82], [Math.cos(a) * .7, -2.6 - (i % 3) * .5, Math.sin(a) * .7], .04, .02)], { k: .02, res: 14 })); }
  const m = jellyMat(color), g = k.build({}, { bell: m, arms: m, tent: m }, { shadow: false });
  g.userData.anim = (t) => { const b = g.userData.bones, p = Math.sin(t * 3); b.bell.scale.set(1 + p * .08, 1 - p * .12, 1 + p * .08); b.arms.rotation.y = t * .4; b.tent.scale.y = 1 + p * .06; b.tent.rotation.y = Math.sin(t * .8) * .2; };
  return g;
}

// Sea turtle: patterned shell, paddling flippers.
export function turtle() {
  const k = kit(), S = 0x6a8a3a, D = 0x4a5a2a, SK = 0x9ab86a, B = 0xe8d8a0, plates = [];
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; plates.push(P(E(D, Math.cos(a) * .55, .55, Math.sin(a) * .55 * 1.3, .2, .2, .24))); }
  k.addGeo('body', sculpt([E(S, 0, .3, 0, .95, .5, 1.25), E(B, 0, .02, 0, .9, .14, 1.15, null, { k: .1 }), P(E(0xb8a858, 0, .78, 0, .3, .12, .35)), ...plates, E(SK, 0, .2, -1.25, .18, .14, .3, null, { k: .1 })], { k: .2, res: 46 }));
  k.addGeo('head', sculpt([Cp(SK, [0, 0, 0], [0, .05, .5], .2, .24, { k: .1 }), E(SK, 0, .08, .62, .26, .22, .3)], { k: .15, res: 30 }));
  for (const s of [-1, 1]) k.eye('head', [s * .16, .16, .78], .06, null, [s * .5, 0, .8]);
  const fl = s => sculpt([E(SK, s * .5, 0, 0, .6, .06, .24, [0, s * .4, 0])], { res: 24 });
  k.addGeo('fL', fl(-1)); k.addGeo('fR', fl(1)); k.addGeo('bL', sculpt([E(SK, -.3, 0, 0, .32, .05, .18, [0, -.5, 0])], { res: 20 })); k.addGeo('bR', sculpt([E(SK, .3, 0, 0, .32, .05, .18, [0, .5, 0])], { res: 20 }));
  const pv = { head: [0, .25, 1.15], fL: [-.75, .15, .55], fR: [.75, .15, .55], bL: [-.6, .12, -.85], bR: [.6, .12, -.85] };
  const g = k.build(pv); shiftParts(g, pv);
  g.userData.anim = (t, sp = 1) => { const b = g.userData.bones, a = Math.sin(t * 3 * sp); b.fL.rotation.z = a * .6; b.fR.rotation.z = -a * .6; b.fL.rotation.y = a * .3; b.fR.rotation.y = -a * .3; b.bL.rotation.z = -a * .3; b.bR.rotation.z = a * .3; b.head.rotation.x = Math.sin(t * 1.3) * .15; };
  return g;
}

// Moray / glowing deep-sea eel: a long body of segments swimming in a wave.
export function eel(body = 0x2a3a5a, spots = 0x3af4e0) {
  const k = kit(), N = 9;
  k.addGeo('s0', sculpt([E(body, 0, 0, .1, .42, .4, .62), Cp(body, [0, -.05, .3], [0, -.18, .85], .3, .18, { k: .15 }), P(E(0xd8d0c0, 0, -.28, .55, .26, .1, .35)), ...[[.2, .2, .5], [-.2, .2, .5]].map(([x, y, z]) => P(E(spots, x, y, z, .07, .07, .07)))], { k: .2, res: 34 }));
  for (const s of [-1, 1]) k.eye('s0', [s * .25, .16, .62], .1, 0x1a2a3a, [s * .5, 0, .8]);
  for (let i = 0; i < 6; i++) k.add('s0', 'cone', 0xf4f0e8, [(i - 2.5) * .07, -.14, .82 - Math.abs(i - 2.5) * .02], [.025, .07, .025], [Math.PI, 0, 0]);
  for (let i = 1; i < N; i++) { const rr = .38 * (1 - i / (N + 2)); k.addGeo('s' + i, sculpt([E(body, 0, 0, -.35, rr, rr * .95, .5), P(E(spots, rr * .7, rr * .4, -.35, .06, .06, .06)), P(E(spots, -rr * .7, rr * .4, -.35, .06, .06, .06)), E(body, 0, rr * .9, -.35, .03, .18, .4, null, { k: .05 })], { k: .1, res: 22 })); }
  const pv = {}, parent = {}; for (let i = 0; i < N; i++) { pv['s' + i] = [0, 0, -i * .7]; if (i) parent['s' + i] = 's' + (i - 1); }
  const g = k.build(pv, { s0: critterMat('std') }, { parent }); shiftParts(g, pv);
  // nested bones: each segment sits .7 behind its parent
  for (let i = 1; i < N; i++) { const b = g.userData.bones['s' + i]; b.position.set(0, 0, -.7); }
  g.userData.anim = (t, sp = 1) => { for (let i = 0; i < N; i++) g.userData.bones['s' + i].rotation.y = Math.sin(t * 5 * sp - i * .8) * (i ? .32 : .15); };
  return g;
}

// Anglerfish: a huge dark fish with teeth and a glowing lure on a stalk.
export function anglerfish(lureColor = 0x9af8ff) {
  const k = kit(), B = 0x2a2230, D = 0x1a141e, T = 0xf0ece0;
  k.addGeo('body', sculpt([E(B, 0, 0, 0, 1.2, 1.05, 1.3), E(B, 0, -.2, .9, 1.05, .75, .7, null, { k: .4 }), Cp(B, [0, .1, -1], [0, .1, -2], .6, .15), E(D, 0, .2, -2.2, .1, .7, .5, null, { k: .1 }),
    E(D, 1.1, -.2, .2, .5, .1, .4, [0, .4, -.3], { k: .1 }), E(D, -1.1, -.2, .2, .5, .1, .4, [0, -.4, .3], { k: .1 }), P(E(0x0a060c, 0, -.35, 1.4, .8, .25, .3))], { k: .35, res: 46 }));
  for (let i = 0; i < 12; i++) { const x = (i - 5.5) * .13, up = i % 2 ? 1 : -1; k.add('body', 'cone', T, [x, -.35 + up * .1, 1.42 - Math.abs(x) * .25], [.04, .22, .04], [up > 0 ? Math.PI : 0, 0, 0]); }
  for (const s of [-1, 1]) k.eye('body', [s * .55, .35, 1.05], .16, D, [s * .4, 0, .9]);
  k.addGeo('stalk', sculpt([Cp(D, [0, 0, 0], [0, .9, .5], .05, .04), Cp(D, [0, .9, .5], [0, .8, 1.1], .04, .03)], { k: .05, res: 20 }));
  k.add('lure', 'sphere', 0xffffff, [0, .72, 1.16], .14);
  const pv = { stalk: [0, 1, .5], lure: [0, 1, .5] }, glow = new THREE.MeshBasicMaterial({ color: lureColor, toneMapped: false });
  const g = k.build(pv, { lure: glow }); shiftParts(g, pv);
  g.userData.anim = (t) => { const b = g.userData.bones; b.stalk.rotation.x = b.lure.rotation.x = Math.sin(t * 1.5) * .15; glow.color.setHSL(.5, 1, .6 + Math.sin(t * 4) * .15); };
  return g;
}

// Small reef fish for the schools (one merged mesh per fish).
export function reefFish(body = 0xffa020, stripe = 0xffffff) {
  const k = kit();
  k.addGeo('body', sculpt([E(body, 0, 0, 0, .18, .38, .5), Cp(body, [0, 0, -.4], [0, 0, -.65], .12, .04, { k: .08 }), E(body, 0, 0, -.8, .03, .3, .18, null, { k: .05 }), P(E(stripe, 0, 0, .1, .3, .5, .07)), P(E(stripe, 0, 0, -.3, .3, .5, .05))], { k: .12, res: 22 }));
  for (const s of [-1, 1]) k.add('body', 'eyeSphere', 0xffffff, [s * .12, .1, .3], .07).add('body', 'eyeSphere', 0x111111, [s * .15, .1, .32], .04);
  return k.build({}, {}, { shadow: false });
}
