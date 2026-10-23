import * as THREE from 'three';
import { sculpt } from './sculpt.js';
import { kit, critterMat, sE as E, sCp as Cp, sP as P } from './critters.js';

// Unlockable star drivers: clay-sculpted heads (see sculpt.js) with big glossy cartoon eyes.
// Every head is authored about 2 units wide around the origin, facing +z, and scaled down to driver size.
const W = 0xffffff, BK = 0x18161c, TAU = Math.PI * 2;
const RIM = new THREE.TorusGeometry(1, .09, 8, 28), BAND = new THREE.TorusGeometry(1, .1, 8, 36);
const ring = (n, f) => Array.from({ length: n }, (_, i) => f(i / n * TAU, i));

const HEADS = {
  shark(k) {
    const G = 0x5f86b4, B = 0xf2f6fa, M = 0x5a1426;
    k.addGeo('h', sculpt([
      E(G, 0, 0, 0, 1, .9, 1.05), E(G, 0, -.1, .7, .8, .62, .65),
      E(G, 0, .95, -.45, .13, .62, .5, [-.6, 0, 0], { k: .22 }),
      E(G, .98, -.25, -.15, .1, .36, .3, [0, 0, -.9], { k: .15 }), E(G, -.98, -.25, -.15, .1, .36, .3, [0, 0, .9], { k: .15 }),
      P(E(B, 0, -.6, .45, .9, .48, 1)), P(E(M, 0, -.3, 1.1, .62, .13, .34)),
    ], { k: .35, res: 46 }));
    for (const s of [-1, 1]) k.eye('h', [s * .5, .32, .85], .18, G, [s * .35, 0, .93]);
    for (let i = -3; i <= 3; i++) k.add('h', 'cone', B, [i * .14, -.2, 1.26 - Math.abs(i) * .05], [.06, .14, .06], [Math.PI, 0, 0]);
    for (const s of [-1, 1]) for (const d of [0, .14, .28]) k.add('h', 'box', 0x45648a, [s * .78, .05, -.15 - d], [.03, .26, .04], [0, s * .4, 0]);
  },
  lion(k) {
    const Y = 0xf0b040, M = 0xb84c18, L = 0xfff2cc;
    k.addGeo('h', sculpt([
      ...ring(12, a => E(M, Math.cos(a) * .95, Math.sin(a) * .95 + .05, -.35, .45, .45, .4)),
      E(M, 0, .05, -.55, .9, .9, .5),
      E(Y, 0, 0, .1, .82, .8, .82), E(L, 0, -.32, .72, .5, .36, .38),
      E(Y, .58, .66, .05, .22, .22, .12, null, { k: .1 }), E(Y, -.58, .66, .05, .22, .22, .12, null, { k: .1 }),
      E(0x4a2416, 0, -.06, 1.06, .2, .13, .1, null, { k: .06 }),
      P(E(0xff8aa0, 0, -.6, .9, .14, .08, .15)),
    ], { k: .3, res: 46 }));
    for (const s of [-1, 1]) k.eye('h', [s * .32, .24, .76], .15, Y, [s * .2, 0, 1]);
  },
  yeti(k) {
    const F = 0xf4f8ff, S = 0x8ecaf2;
    k.addGeo('h', sculpt([
      E(F, 0, .05, 0, 1, 1, .95),
      ...ring(9, a => E(F, Math.cos(a) * .8, .55 + Math.sin(a) * .2, Math.sin(a) * .6 - .2, .35, .35, .35)),
      E(S, 0, -.08, .6, .64, .62, .42, null, { k: .2 }),
      Cp(0xe8dcc0, [.55, .72, 0], [.98, 1.25, -.1], .16, .04, { k: .1 }), Cp(0xe8dcc0, [-.55, .72, 0], [-.98, 1.25, -.1], .16, .04, { k: .1 }),
      P(E(0x2a3a6a, 0, -.36, .95, .36, .14, .22)), P(E(W, 0, -.27, .97, .3, .045, .22)),
    ], { k: .3, res: 46 }));
    for (const s of [-1, 1]) k.eye('h', [s * .26, .14, .9], .14, null, [s * .1, 0, 1]);
  },
  owl(k) {
    const Br = 0x8a5634, Fd = 0xf4dcb2, Bk = 0xffb030;
    k.addGeo('h', sculpt([
      E(Br, 0, 0, 0, 1, .95, .9),
      Cp(Br, [.5, .62, 0], [.78, 1.25, -.12], .24, .05, { k: .15 }), Cp(Br, [-.5, .62, 0], [-.78, 1.25, -.12], .24, .05, { k: .15 }),
      P(E(Fd, .37, .08, .62, .44, .48, .4)), P(E(Fd, -.37, .08, .62, .44, .48, .4)),
      Cp(Bk, [0, 0, .85], [0, -.3, 1.04], .14, .03, { k: .05 }),
      P(E(0xc89a6a, 0, -.7, .5, .5, .25, .4)),
    ], { k: .25, res: 46 }));
    for (const s of [-1, 1]) { k.eye('h', [s * .37, .12, .86], .21, null, [s * .1, 0, 1]); k.add('h', RIM, 0xd8a640, [s * .37, .12, 1.0], .27); }
    k.add('h', 'cyl', 0xd8a640, [0, .14, 1.04], [.025, .22, .025], [0, 0, Math.PI / 2]);
  },
  parrot(k) {
    const R = 0xe8302a, Y = 0xffd23a, Bl = 0x2a7ae8;
    k.addGeo('h', sculpt([
      E(R, 0, 0, 0, .9, .95, .9),
      P(E(W, .5, -.02, .55, .32, .34, .26)), P(E(W, -.5, -.02, .55, .32, .34, .26)),
      Cp(0xf3e6c4, [0, .05, .72], [0, -.48, 1.18], .32, .06, { k: .06 }), E(0x3a3a3a, 0, -.32, .72, .22, .13, .22, null, { k: .05 }),
      P(E(Y, 0, -.75, .2, .7, .3, .7)), P(E(Bl, 0, -.95, -.2, .7, .25, .7)),
    ], { k: .25, res: 46 }));
    for (const s of [-1, 1]) k.eye('h', [s * .47, .25, .62], .15, null, [s * .55, 0, .82]);
    k.add('h', 'cyl', BK, [0, .82, 0], [1, .07, .78]).add('h', 'sphere', BK, [0, .9, 0], [.62, .38, .56]);
    for (const s of [-1, 1]) k.add('h', 'sphere', BK, [s * .78, .9, -.05], [.32, .2, .5], [0, 0, s * .5]);
    k.add('h', 'sphere', W, [0, 1.02, .5], .11).add('h', 'cyl', 0xffcf3a, [0, .86, 0], [.64, .06, .58]);
  },
  octo(k) {
    const Pu = 0xa04ae0, Sp = 0xd99aff;
    k.addGeo('h', sculpt([
      E(Pu, 0, .35, -.12, .86, 1.05, .86), E(Pu, 0, -.15, .25, .74, .6, .7),
      ...ring(6, a => Cp(Pu, [Math.cos(a) * .42, -.45, Math.sin(a) * .42 + .1], [Math.cos(a) * .78, -1.05, Math.sin(a) * .78 + .1], .2, .08)),
      P(E(Sp, .45, .85, .25, .16, .16, .16)), P(E(Sp, -.3, 1.05, .1, .2, .2, .2)), P(E(Sp, .1, .7, -.75, .22, .22, .22)), P(E(Sp, -.6, .45, -.4, .16, .16, .16)),
      P(E(0x4a1a6a, 0, -.32, .92, .16, .06, .1)),
    ], { k: .3, res: 48 }));
    for (const s of [-1, 1]) k.eye('h', [s * .32, .05, .82], .21, null, [s * .1, 0, 1]);
  },
  dino(k) {
    const O = 0xf08a3a, Fr = 0xffc04a, Hn = 0xfff4dc;
    k.addGeo('h', sculpt([
      E(O, 0, 0, .15, .75, .72, .95), E(O, 0, -.2, .95, .46, .4, .42),
      E(Fr, 0, .38, -.55, 1.15, .95, .18, [-.35, 0, 0], { k: .2 }),
      Cp(Hn, [.3, .55, .35], [.44, 1.2, .9], .12, .02, { k: .08 }), Cp(Hn, [-.3, .55, .35], [-.44, 1.2, .9], .12, .02, { k: .08 }),
      Cp(Hn, [0, .05, 1.15], [0, .45, 1.38], .12, .02, { k: .06 }),
      ...ring(7, a => P(E(0xff5a3a, Math.cos(a / 2 + .2) * .95, .38 + Math.sin(a / 2 + .2) * .8, -.45, .12, .12, .3))),
      P(E(0x6a2a10, 0, -.42, 1.12, .3, .04, .2)),
    ], { k: .25, res: 48 }));
    for (const s of [-1, 1]) k.eye('h', [s * .42, .28, .62], .15, null, [s * .4, 0, .9]);
  },
  unicorn(k) {
    const Wh = 0xfaf6ff, Au = 0xffd860, RB = [0xff5a6a, 0xffa53a, 0xffe14a, 0x5ad86a, 0x4ab0ff, 0xb46aff];
    k.addGeo('h', sculpt([
      E(Wh, 0, .15, 0, .75, .85, .8), E(Wh, 0, -.25, .65, .5, .45, .55),
      P(E(0xffc8e0, 0, -.4, 1.08, .42, .32, .25)),
      Cp(Wh, [.35, .78, -.1], [.45, 1.22, -.18], .15, .04, { k: .08 }), Cp(Wh, [-.35, .78, -.1], [-.45, 1.22, -.18], .15, .04, { k: .08 }),
      Cp(Au, [0, .85, .25], [0, 1.65, .6], .14, .02, { k: .05 }),
      ...RB.map((c, i) => E(c, 0, .95 - .3 * i, -.6 - .06 * i, .32, .3, .3, null, { k: .15 })),
      P(E(0xff8ab8, .5, -.15, .55, .14, .1, .1)), P(E(0xff8ab8, -.5, -.15, .55, .14, .1, .1)),
    ], { k: .25, res: 48 }));
    for (const s of [-1, 1]) k.eye('h', [s * .38, .26, .55], .16, null, [s * .45, 0, .88]);
  },
  ninja(k) {
    const Nv = 0x1e2238, Sk = 0xf2c8a0, Rd = 0xe02a3a;
    k.addGeo('h', sculpt([
      E(Nv, 0, 0, 0, .95, 1, .95),
      P(E(Sk, 0, .12, .75, .74, .22, .38)),
      Cp(Rd, [0, .45, -.9], [.35, .05, -1.5], .1, .07, { k: .05 }), Cp(Rd, [0, .45, -.9], [-.28, -.05, -1.42], .1, .07, { k: .05 }),
    ], { k: .2, res: 44 }));
    k.add('h', BAND, Rd, [0, .44, 0], [.88, .88, 1.6], [Math.PI / 2 - .12, 0, 0]);
    k.add('h', 'box', 0xc8ccd4, [0, .44, .96], [.22, .14, .04]);
    for (const s of [-1, 1]) k.eye('h', [s * .3, .12, .86], .13, Nv, [s * .1, 0, 1]);
  },
  magmo(k) {
    const Rk = 0x6e5650, Rk2 = 0x82665c;
    k.addGeo('h', sculpt([
      E(Rk, 0, 0, 0, 1, .9, .95),
      ...ring(6, (a, i) => E(i % 2 ? Rk2 : Rk, Math.cos(a) * .62, .45 + Math.sin(a * 2) * .15, Math.sin(a) * .5 - .35, .42, .36, .42)),
      E(Rk2, 0, .72, -.1, .5, .38, .5),
    ], { k: .25, res: 44 }));
    const gl = (p, s, r) => k.add('g', 'box', 0xffffff, p, s, r);
    gl([.45, .5, .72], [.06, .42, .06], [.5, .2, .5]); gl([-.55, .35, .7], [.06, .38, .06], [.4, .3, -.6]); gl([.85, -.1, .4], [.06, .4, .06], [0, .4, .3]); gl([-.15, .78, .55], [.06, .34, .06], [.6, 0, 1.1]);
    gl([0, -.4, .9], [.55, .1, .12]);
    for (const s of [-1, 1]) { k.add('g', 'sphere', 0xffffff, [s * .33, .12, .93], [.17, .13, .08]); k.add('h', 'box', 0x2a2020, [s * .33, .32, .92], [.36, .09, .1], [0, 0, -s * .3]); }
  },
  crystal(k) {
    const Ic = 0x8adcff;
    k.add('c', 'ico', Ic, [0, 0, 0], [.9, 1, .85]);
    ring(7, (a, i) => k.add('c', 'cone', i % 2 ? 0xc8f4ff : 0x6ac0ff, [Math.cos(a) * .45, .75 + (i % 2) * .1, Math.sin(a) * .45 - .1], [.16, .7 + (i % 3) * .15, .16], [Math.sin(a) * .5, 0, -Math.cos(a) * .5]));
    k.add('c', 'cone', 0xe8fcff, [0, 1.1, 0], [.2, 1, .2]);
    for (const s of [-1, 1]) k.eye('e', [s * .3, .1, .78], .16, null, [s * .1, 0, 1]);
    k.add('e', 'box', 0x1a4a7a, [0, -.35, .8], [.3, .05, .05]);
  },
  wizard(k) {
    const Sk = 0xf6d0b0, H = 0xff5ab0, Hat = 0x5a2ac8;
    k.addGeo('h', sculpt([
      E(Sk, 0, 0, .05, .8, .85, .8), E(Sk, 0, -.05, .86, .12, .12, .12, null, { k: .06 }),
      E(H, 0, .15, -.22, .95, .85, .8),
      Cp(H, [.7, 0, -.1], [.78, -.75, -.15], .3, .18), Cp(H, [-.7, 0, -.1], [-.78, -.75, -.15], .3, .18),
      P(E(0xffa0b8, .45, -.2, .62, .14, .1, .1)), P(E(0xffa0b8, -.45, -.2, .62, .14, .1, .1)),
      P(E(0xa02a3a, 0, -.42, .72, .18, .05, .15)),
    ], { k: .25, res: 46 }));
    k.add('h', 'cyl', Hat, [0, .68, -.05], [1.3, .07, 1.3]).add('h', 'cone', Hat, [0, 1.38, -.15], [.78, 1.35, .78], [-.22, 0, 0]);
    k.add('h', 'cyl', 0xffd23a, [0, .8, -.07], [.76, .1, .76]);
    for (const [x, y, z] of [[.3, 1.15, .4], [-.25, 1.5, .25], [.1, 1.8, .05]]) k.add('h', 'ico', 0xffe040, [x, y, z], .1);
    for (const s of [-1, 1]) k.eye('h', [s * .3, .12, .74], .15, null, [s * .1, 0, 1]);
  },
  bunny(k) {
    const Wb = 0xf6f2f0, Pk = 0xffa8c8;
    k.addGeo('h', sculpt([
      E(Wb, 0, 0, 0, .85, .8, .82), E(Wb, .32, -.3, .55, .35, .3, .3), E(Wb, -.32, -.3, .55, .35, .3, .3),
      Cp(Wb, [.3, .6, -.1], [.48, 1.75, -.28], .22, .16, { k: .12 }), Cp(Wb, [-.3, .6, -.1], [-.48, 1.75, -.28], .22, .16, { k: .12 }),
      P(Cp(Pk, [.31, .85, .08], [.46, 1.6, -.08], .11, .08)), P(Cp(Pk, [-.31, .85, .08], [-.46, 1.6, -.08], .11, .08)),
      E(Pk, 0, -.12, .86, .12, .09, .08, null, { k: .05 }),
    ], { k: .25, res: 48 }));
    k.add('h', 'box', W, [0, -.45, .8], [.22, .2, .06]).add('h', 'box', 0xd8d0d0, [0, -.45, .835], [.015, .2, .01]);
    for (const s of [-1, 1]) k.eye('h', [s * .33, .15, .68], .16, null, [s * .15, 0, 1]);
  },
  bee(k) {
    const Y = 0xffe040;
    k.addGeo('h', sculpt([
      E(Y, 0, 0, 0, .95, .9, .9),
      P(E(BK, 0, .45, -.35, 1.3, .16, 1.3, [.8, 0, 0])), P(E(BK, 0, .05, -.6, 1.3, .16, 1.3, [.8, 0, 0])),
      Cp(BK, [.25, .75, .1], [.55, 1.38, .3], .05, .04, { k: .05 }), Cp(BK, [-.25, .75, .1], [-.55, 1.38, .3], .05, .04, { k: .05 }),
      E(BK, .57, 1.42, .32, .13, .13, .13, null, { k: .05 }), E(BK, -.57, 1.42, .32, .13, .13, .13, null, { k: .05 }),
      P(E(0x6a3a10, 0, -.38, .82, .3, .05, .2)), P(E(0xffa060, .52, -.2, .62, .14, .1, .1)), P(E(0xffa060, -.52, -.2, .62, .14, .1, .1)),
    ], { k: .2, res: 46 }));
    for (const s of [-1, 1]) { k.eye('h', [s * .35, .14, .74], .2, null, [s * .1, 0, 1]); k.add('w', 'sphere', 0xdff4ff, [s * .9, .55, -.5], [.12, .6, .38], [0, s * .5, -s * .45]); }
  },
};

const crystalMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .08, metalness: .25, emissive: 0x2a7ac0, emissiveIntensity: .35 });
const MATS = { magmo: { g: critterMat('glow', 0xff7a1a) }, crystal: { c: crystalMat }, bee: { w: critterMat('glass', 0xffffff) } };

export const CLAY_DRIVERS = new Set(Object.keys(HEADS));
// Returns a group the size of a driver head (about 0.3 wide), or null for ids that are not clay drivers.
export function buildClayHead(id, size = .15) {
  const f = HEADS[id]; if (!f) return null;
  const k = kit(); f(k);
  const inner = k.build({}, MATS[id] || {}), g = new THREE.Group();
  // shared: the kart builder must not bake these meshes (it would drop their vertex colours)
  inner.traverse(o => { if (o.isMesh) o.userData.shared = true; });
  inner.scale.setScalar(size); g.add(inner); return g;
}
