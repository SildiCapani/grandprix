import * as THREE from 'three';
import { sculpt } from './sculpt.js';
import { kit, sE as E, sCp as Cp, sP as P } from './critters.js';

// The drivers: grown-up racing characters with sculpted faces, real hair styles and their own race suits.
// buildDriver(id) returns a group in the kart's driver space (seat at the origin, looking along +z, steering wheel
// about 0.43 ahead at shoulder height) with userData.head (the part that turns and nods).
//
// `look`: skin, hair (colour), style (hair cut), eyes (iris colour), suit [main, accent], extras.
export const DRIVER_LOOKS = {
  marco: { skin: 0xd9a77e, hair: 0x2a1d16, grey: 0x8a8580, style: 'short', eyes: 0x5a3a1e, brows: 0x2a1d16, stubble: 0x5a4636, suit: [0xd8282f, 0xf4f1ea], gloves: 0x1a1a1e },
  yuna: { skin: 0xf2d2b8, hair: 0x101014, style: 'bob', eyes: 0x2a1a12, brows: 0x161214, lips: 0xc8706a, suit: [0xf6f7fa, 0x2a5ad8], gloves: 0x2a5ad8 },
  jax: { skin: 0xb98763, hair: 0x2a2018, style: 'buzz', eyes: 0x3a2a1a, brows: 0x2a2018, shades: true, earring: true, suit: [0x1c1d22, 0xff7a1a], gloves: 0x1c1d22 },
  lena: { skin: 0xf3d6c2, hair: 0xe8c66a, style: 'braid', eyes: 0x3a7ab0, brows: 0xb8955a, lips: 0xd07a78, goggles: true, suit: [0x2f9a4a, 0x1a1c20], gloves: 0x1a1c20 },
  diego: { skin: 0xa86e48, hair: 0x14100e, style: 'ponytail', eyes: 0x2a1a10, brows: 0x14100e, beard: 0x1e1612, suit: [0xff8a1a, 0x18181c], gloves: 0x18181c },
  amara: { skin: 0x6b4430, hair: 0x18120e, style: 'afro', eyes: 0x24160e, brows: 0x18120e, lips: 0x8a4a42, earring: true, suit: [0x6a2ac8, 0xf2c040], gloves: 0xf2c040 },
  sofia: { skin: 0xe2b590, hair: 0xb03a1e, style: 'curls', eyes: 0x4a6a3a, brows: 0x8a2e18, lips: 0xc85a5a, suit: [0x1aa8a0, 0xf6f4ee], gloves: 0xf6f4ee },
  kenji: { skin: 0xf0cfb0, hair: 0xd8dce4, style: 'spiky', eyes: 0x1e1a18, brows: 0x2a2a30, headband: 0xe0283a, suit: [0x14204a, 0x38e0ff], gloves: 0x38e0ff },
  viktor: { skin: 0xe8c0a8, hair: 0x9a9aa0, style: 'bald', eyes: 0x6a8aa0, brows: 0x8a8a90, beard: 0x8a8a90, scar: true, suit: [0x141416, 0xd8a832], gloves: 0xd8a832 },
  phantom: { helmet: true, suit: [0x101012, 0xe02a2a], gloves: 0x101012, visor: 0xe02a2a },
};
const WHITE = 0xf8f6f2;
const VISOR = (() => { const g = new THREE.SphereGeometry(1, 28, 12, -1.05, 2.1, 1.05, .78); g.rotateY(Math.PI / 2); return g; })();
const VISOR_MAT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .03, metalness: .6, clearcoat: 1, side: THREE.DoubleSide });
const HELMET_MAT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .18, metalness: .2, clearcoat: 1, clearcoatRoughness: .05 });
const RING = new THREE.TorusGeometry(1, .07, 8, 32), HOOP = new THREE.TorusGeometry(1, .18, 8, 16);

// ---------- head (author scale: about 2 units tall, centred on the skull, face towards +z) ----------
// Hair = paint on the scalp (clean hairline) plus volume shapes for thickness.
const scalp = (H, front = .42) => P(E(H, 0, front + .5, -.32, 1.02, .78 + (.42 - front) * .3, 1.0));
function hair(k, L) {
  const H = L.hair, out = [];
  switch (L.style) {
    case 'short': // short, slightly swept cut
      out.push(scalp(H), E(H, 0, .6, -.18, .9, .6, .93, null, { k: .1 }), E(H, .15, .78, .22, .55, .2, .42, [0, 0, -.2], { k: .1 }));
      break;
    case 'bob': // straight black bob with a fringe
      out.push(scalp(H, .3), E(H, 0, .45, -.16, .96, .78, .98, null, { k: .1 }), E(H, 0, .6, .6, .74, .22, .26, [-.25, 0, 0], { k: .08 }));
      for (const s of [-1, 1]) out.push(E(H, s * .82, -.2, -.08, .2, .62, .62, [0, 0, s * .05], { k: .12 }));
      out.push(E(H, 0, -.15, -.7, .8, .62, .3, null, { k: .12 }));
      break;
    case 'buzz': out.push(scalp(H, .48)); break;
    case 'braid':
      out.push(scalp(H, .4), E(H, 0, .6, -.18, .9, .6, .93, null, { k: .1 }), E(H, .1, .78, .4, .6, .18, .36, [0, 0, -.15], { k: .1 }));
      for (let i = 0; i < 6; i++) out.push(E(H, (i % 2 ? .04 : -.04), -.05 - i * .26, -.94 - i * .06, .2 - i * .015, .17, .17, null, { k: .05 }));
      out.push(E(0x2a2a2a, 0, -1.58, -1.32, .07, .07, .07, null, { k: .02 }));
      break;
    case 'ponytail':
      out.push(scalp(H, .4), E(H, 0, .6, -.18, .9, .6, .93, null, { k: .1 }), Cp(H, [0, .3, -.95], [0, -.75, -1.15], .2, .1, { k: .1 }), E(0xc83a1a, 0, .3, -.96, .12, .1, .1, null, { k: .02 }));
      break;
    case 'afro': {
      out.push(scalp(H, .4), E(H, 0, .85, -.4, 1.08, .8, 1.0, null, { k: .1 }));
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; out.push(E(H, Math.cos(a) * 1.0, .85 + Math.sin(a * 3) * .18, Math.sin(a) * .85 - .45, .3, .3, .3, null, { k: .12 })); }
      break;
    }
    case 'curls': {
      out.push(scalp(H, .36), E(H, 0, .55, -.18, .96, .7, .97, null, { k: .1 }));
      for (let i = 0; i < 12; i++) { const s = i % 2 ? 1 : -1, d = Math.floor(i / 2); out.push(E(H, s * (.8 + d * .03), .15 - d * .26, -.25 - d * .1, .24, .22, .24, null, { k: .1 })); }
      out.push(E(H, 0, -.35, -.8, .72, .8, .36, null, { k: .14 }));
      break;
    }
    case 'spiky':
      out.push(scalp(H, .42), E(H, 0, .6, -.18, .9, .6, .93, null, { k: .1 }));
      for (let i = 0; i < 9; i++) { const a = -1.2 + i * .3; out.push(Cp(H, [Math.sin(a) * .45, .9, Math.cos(a) * .2 - .25], [Math.sin(a) * .8, 1.25 + (i % 2) * .1, -.75 + Math.cos(a) * .1], .2, .04, { k: .1 })); }
      break;
    default: break; // bald
  }
  return out;
}

function head(k, L) {
  const S = L.skin;
  if (L.helmet) {
    k.addGeo('head', sculpt([E(L.suit[0], 0, .08, -.02, 1.08, 1.12, 1.12), Cp(L.suit[0], [0, -.55, .05], [0, -1.0, .1], .72, .66, { k: .25 }),
      P(E(L.suit[1], 0, .4, -.1, .16, 1.3, 1.3)), P(E(0x2a2a2e, 0, -.55, .95, .4, .1, .2))], { k: .3, res: 52 }));
    k.add('visor', VISOR, L.visor, [0, .12, .02], [1.13, 1.1, 1.17]);
    return;
  }
  const face = [
    E(S, 0, .14, -.05, .86, .9, .9), E(S, 0, -.4, .26, .7, .48, .64, null, { k: .3 }), E(S, 0, -.72, .48, .3, .18, .22, null, { k: .22 }),
    E(S, .42, -.12, .5, .3, .24, .26, null, { k: .25 }), E(S, -.42, -.12, .5, .3, .24, .26, null, { k: .25 }),
    E(S, 0, .32, .7, .62, .12, .2, null, { k: .18 }),                                   // brow ridge
    Cp(S, [0, .14, .8], [0, -.17, 1.02], .09, .13, { k: .1 }), E(S, 0, -.21, .93, .17, .1, .12, null, { k: .08 }), // nose
    E(S, .86, .02, -.02, .11, .25, .17, null, { k: .1 }), E(S, -.86, .02, -.02, .11, .25, .17, null, { k: .1 }), // ears
    Cp(S, [0, -.6, -.08], [0, -1.35, -.14], .38, .42, { k: .25 }),                     // neck
    E(0, .31, .11, .86, .17, .12, .1, null, { sub: true, k: .08 }), E(0, -.31, .11, .86, .17, .12, .1, null, { sub: true, k: .08 }), // eye sockets
    E(0, 0, -.44, .95, .2, .025, .06, null, { sub: true, k: .04 }),                       // mouth line
  ];
  if (L.stubble) face.push(P(E(L.stubble, 0, -.52, .42, .7, .42, .55)));
  if (L.beard) face.push(E(L.beard, 0, -.66, .45, .64, .4, .45, null, { k: .18 }), E(L.beard, 0, -.86, .5, .32, .26, .26, null, { k: .14 }));
  face.push(P(E(L.lips || 0xa8645c, 0, -.44, .86, .24, .05, .14)));
  if (L.goggles) face.push(P(E(0x3a2a1e, 0, .66, -.1, 1.3, .07, 1.3, [.45, 0, 0])));
  if (L.scar) face.push(P(E(0xc87a74, .42, .1, .72, .04, .3, .1, [0, 0, .3])));
  k.addGeo('head', sculpt([...face, ...hair(k, L)], { k: .25, res: 60 }));
  // eyes: white, coloured iris, pupil, glint, upper lid in skin colour
  for (const s of [-1, 1]) {
    const x = s * .31, y = .1, z = .72;
    k.add('head', 'eyeSphere', WHITE, [x, y, z], [.15, .11, .1]);
    k.add('head', 'eyeSphere', L.eyes, [x, y - .005, z + .075], [.085, .085, .045]);
    k.add('head', 'eyeSphere', 0x0a0a0a, [x, y - .005, z + .105], [.04, .04, .02]);
    k.add('head', 'lowSphere', WHITE, [x + .025, y + .03, z + .11], .012);
    k.add('head', 'sphere', S, [x, y + .075, z - .005], [.165, .07, .115], [-.25, 0, 0]);
    k.add('head', 'box', L.brows, [x + s * .02, y + .2, z + .04], [.26, .05, .06], [0, 0, -s * .1]);
  }
  if (L.shades) { for (const s of [-1, 1]) k.add('head', 'sphere', 0x101418, [s * .31, .1, .82], [.17, .12, .05]); k.add('head', 'box', 0x6a6a70, [0, .14, .86], [.2, .03, .03]); for (const s of [-1, 1]) k.add('head', 'box', 0x6a6a70, [s * .62, .14, .45], [.03, .03, .7], [0, s * .5, 0]); }
  if (L.goggles) { for (const s of [-1, 1]) { k.add('head', 'cyl', 0x5a4a3a, [s * .3, .7, .68], [.16, .1, .16], [1.25, 0, 0]); k.add('head', 'sphere', 0x8ad8ff, [s * .3, .75, .72], [.12, .05, .12], [1.25, 0, 0]); } k.add('head', 'box', 0x5a4a3a, [0, .72, .74], [.16, .05, .05]); }
  if (L.headband) k.add('head', RING, L.headband, [0, .4, -.04], [.92, .92, 1.6], [Math.PI / 2 - .15, 0, 0]);
  if (L.earring) for (const s of [-1, 1]) k.add('head', HOOP, 0xf2c040, [s * .9, -.3, .02], .08, [0, Math.PI / 2, 0]);
}

// ---------- body: race suit with stripes, collar and gloves (metres, seated) ----------
function body(k, L) {
  const [A, B] = L.suit;
  k.addGeo('body', sculpt([
    E(A, 0, .47, 0, .2, .17, .13), E(A, 0, .33, .01, .17, .12, .12), E(A, 0, .23, .03, .17, .07, .14),
    Cp(A, [-.18, .59, -.01], [.18, .59, -.01], .075, .075, { k: .06 }),
    Cp(A, [.09, .22, .04], [.11, .21, .32], .062, .052, { k: .04 }), Cp(A, [-.09, .22, .04], [-.11, .21, .32], .062, .052, { k: .04 }),
    Cp(B, [0, .63, -.02], [0, .66, -.01], .075, .07, { k: .03 }),                       // collar
    P(E(B, .17, .45, 0, .05, .28, .2)), P(E(B, -.17, .45, 0, .05, .28, .2)),              // side stripes
    P(E(B, 0, .55, .1, .2, .03, .06)), P(E(0x2a2a2e, 0, .42, .13, .012, .16, .02)),       // chest band + zipper
    P(E(0x1a1a1e, 0, .28, .1, .19, .025, .1)),                                            // belt
  ], { k: .07, cell: .011 }));
  // arms: shoulder → elbow → hands on the wheel
  for (const s of [-1, 1]) {
    const sh = [s * .2, .58, 0], el = [s * .25, .44, .2], wr = [s * .1, .5, .37];
    k.addGeo('body', sculpt([Cp(A, sh, el, .055, .048, { k: .03 }), Cp(A, el, wr, .046, .04, { k: .03 }), P(Cp(B, [sh[0] + s * .04, sh[1], sh[2]], [el[0] + s * .04, el[1], el[2]], .03, .03))], { k: .04, cell: .012 }));
    k.addGeo('body', sculpt([E(L.gloves, wr[0] + s * -.01, wr[1] + .01, wr[2] + .04, .045, .04, .055), Cp(L.gloves, [wr[0], wr[1], wr[2] - .02], [wr[0], wr[1], wr[2] + .02], .04, .04)], { k: .03, cell: .01 }));
  }
}

const cache = new Map();
// Builds the full driver (body + head). The head part is centred so it can nod and turn.
export function buildDriver(id) {
  const L = DRIVER_LOOKS[id] || DRIVER_LOOKS.marco;
  const k = kit(); body(k, L); head(k, L);
  const g = k.build({}, L.helmet ? { head: HELMET_MAT, visor: VISOR_MAT } : {});
  const bones = g.userData.bones, hd = new THREE.Group(), HS = .108;
  hd.position.set(0, .8, .01); g.add(hd);
  for (const key of ['head', 'visor']) { const m = bones[key]; if (!m) continue; g.remove(m); m.scale.setScalar(HS); m.position.set(0, 0, 0); hd.add(m); }
  g.traverse(o => { if (o.isMesh) { o.userData.shared = true; o.castShadow = true; } });
  g.userData.head = hd;
  return g;
}
// Head + shoulders only (portraits).
export function buildBust(id) {
  const d = buildDriver(id); return d;
}
export const isDriver = id => !!DRIVER_LOOKS[id];
