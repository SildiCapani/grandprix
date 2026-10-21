import * as THREE from 'three';

// Drivers: who sits in the kart. All characters are original designs for Apex Rush.
// `need` works like the skins: { level } | { races } | { wins } | { golds } | { tracks } (admins have everything).
export const AVATARS = Object.freeze([
  { id: 'pilot', name: 'Rennpilot', tag: 'Der Klassiker mit Helm', need: {}, color: '#f6cf42' },
  { id: 'fox', name: 'Flinn', tag: 'Flinker Fuchs', need: {}, color: '#ff7a2a' },
  { id: 'panda', name: 'Pia', tag: 'Gemütliche Panda-Dame', need: {}, color: '#f2f2f2' },
  { id: 'cat', name: 'Kater Mo', tag: 'Landet immer auf den Reifen', need: { level: 2 }, color: '#9aa0a8' },
  { id: 'robot', name: 'Robo-7', tag: 'Rechnet jede Ideallinie', need: { level: 3 }, color: '#a8b4c0' },
  { id: 'frog', name: 'Fridolin', tag: 'Frosch mit Sprungkraft', need: { level: 4 }, color: '#5ac83a' },
  { id: 'penguin', name: 'Frost', tag: 'Rutscht durch jede Kurve', need: { level: 5 }, color: '#1a1c22' },
  { id: 'alien', name: 'Zorx', tag: 'Von einem anderen Planeten', need: { level: 6 }, color: '#7aff6a' },
  { id: 'knight', name: 'Ritter Rolf', tag: 'Ehrenhaft und gepanzert', need: { level: 7 }, color: '#c8ccd4' },
  { id: 'astro', name: 'Nova', tag: 'Astronautin aus der Galaxie', need: { races: 25 }, color: '#f4f6fa' },
  { id: 'dragon', name: 'Drako', tag: 'Kleiner Drache, großes Feuer', need: { wins: 10 }, color: '#8a4ad8' },
].map(a => Object.freeze(a)));
export const avatarById = id => AVATARS.find(a => a.id === id) || AVATARS[0];

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .45, ...o });
const sph = new THREE.SphereGeometry(1, 20, 14), cone = new THREE.ConeGeometry(1, 1, 12), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 14);

// A head (plus helmet / ears / antennae) facing +Z, about 0.3 units wide, centred on the neck.
export function buildAvatarHead(id) {
  const g = new THREE.Group(), R = .15;
  const add = (geo, m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  const eyes = (y, z, sep, size, white = true, pupil = 0x111111) => { for (const s of [-1, 1]) { if (white) add(sph, std(0xffffff), s * sep, y, z, size, size * 1.1, size * .6); add(sph, std(pupil, { roughness: .2 }), s * sep, y, z + size * .45, size * .55, size * .6, size * .35); } };
  const black = std(0x15161a);
  switch (id) {
    case 'fox': {
      const fur = std(0xff7a2a), white = std(0xfff4e8);
      add(sph, fur, 0, 0, 0, R, R * .95, R);
      add(sph, white, 0, -R * .35, R * .62, R * .55, R * .4, R * .5);
      add(sph, black, 0, -R * .2, R * 1.05, R * .14, R * .11, R * .1);
      for (const s of [-1, 1]) { add(cone, fur, s * R * .55, R * 1.05, -R * .1, R * .3, R * .7, R * .2, 0, 0, -s * .25); add(cone, white, s * R * .55, R * .98, -R * .02, R * .16, R * .45, R * .1, 0, 0, -s * .25); }
      eyes(R * .2, R * .78, R * .38, R * .17, false); break;
    }
    case 'panda': {
      const w = std(0xf6f6f2);
      add(sph, w, 0, 0, 0, R, R * .95, R);
      for (const s of [-1, 1]) { add(sph, black, s * R * .7, R * .78, 0, R * .3, R * .3, R * .22); add(sph, black, s * R * .38, R * .12, R * .76, R * .24, R * .3, R * .16, 0, 0, s * .5); }
      eyes(R * .15, R * .88, R * .38, R * .11);
      add(sph, black, 0, -R * .2, R * .95, R * .14, R * .1, R * .1); break;
    }
    case 'cat': {
      const fur = std(0x9aa0a8), pink = std(0xff9ab8);
      add(sph, fur, 0, 0, 0, R, R * .92, R);
      for (const s of [-1, 1]) { add(cone, fur, s * R * .6, R * 1, 0, R * .3, R * .6, R * .2, 0, 0, -s * .3); add(cone, pink, s * R * .6, R * .95, R * .07, R * .15, R * .38, R * .08, 0, 0, -s * .3); for (const k of [-1, 1]) add(box, std(0xffffff), s * R * .62, -R * .2 + k * R * .08, R * .82, R * .7, R * .02, R * .02, 0, 0, s * k * .15); }
      eyes(R * .15, R * .8, R * .36, R * .17, true, 0x3ac85a);
      add(sph, pink, 0, -R * .12, R * .98, R * .11, R * .08, R * .08); break;
    }
    case 'robot': {
      const metal = std(0xa8b4c0, { metalness: .8, roughness: .3 }), glow = new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false }), red = new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false });
      add(box, metal, 0, 0, 0, R * 1.8, R * 1.6, R * 1.6);
      add(box, black, 0, R * .15, R * .81, R * 1.5, R * .45, R * .05);
      for (const s of [-1, 1]) { add(sph, glow, s * R * .4, R * .15, R * .84, R * .16, R * .12, R * .05); add(cyl, metal, s * R * .98, 0, 0, R * .22, R * .25, R * .22, 0, 0, Math.PI / 2); }
      add(box, std(0x707a86, { metalness: .8 }), 0, -R * .45, R * .81, R * .9, R * .12, R * .04);
      add(cyl, metal, 0, R * 1.1, 0, R * .05, R * .6, R * .05); add(sph, red, 0, R * 1.45, 0, R * .13, R * .13, R * .13); break;
    }
    case 'frog': {
      const skin = std(0x5ac83a, { roughness: .3 }), belly = std(0xd8f0a0);
      add(sph, skin, 0, 0, 0, R * 1.2, R * .8, R);
      add(sph, belly, 0, -R * .35, R * .45, R * .9, R * .4, R * .6);
      for (const s of [-1, 1]) { add(sph, skin, s * R * .55, R * .7, R * .3, R * .38, R * .38, R * .38); add(sph, std(0xffffff), s * R * .55, R * .78, R * .55, R * .25, R * .25, R * .18); add(sph, black, s * R * .55, R * .8, R * .7, R * .12, R * .14, R * .06); }
      add(box, std(0x2a6a1a), 0, -R * .12, R * .97, R * .9, R * .04, R * .05); break;
    }
    case 'penguin': {
      const w = std(0xf6f6f2), beak = std(0xff9a2a);
      add(sph, black, 0, 0, 0, R, R, R);
      add(sph, w, 0, -R * .05, R * .42, R * .75, R * .75, R * .62);
      eyes(R * .2, R * .95, R * .32, R * .13);
      add(cone, beak, 0, -R * .12, R * 1.15, R * .14, R * .35, R * .14, Math.PI / 2); break;
    }
    case 'alien': {
      const skin = std(0x7aff6a, { roughness: .35, emissive: 0x1a6a10, emissiveIntensity: .3 }), eye = std(0x0a0a10, { roughness: .05, metalness: .5 });
      add(sph, skin, 0, R * .2, 0, R * 1.05, R * 1.3, R * .95);
      for (const s of [-1, 1]) { add(sph, eye, s * R * .42, R * .2, R * .72, R * .32, R * .2, R * .18, 0, 0, -s * .5); add(cyl, skin, s * R * .45, R * 1.6, -R * .1, R * .04, R * .7, R * .04, 0, 0, -s * .35); add(sph, new THREE.MeshBasicMaterial({ color: 0xff4fd8, toneMapped: false }), s * R * .58, R * 1.95, -R * .1, R * .12, R * .12, R * .12); }
      add(box, std(0x2a6a20), 0, -R * .55, R * .78, R * .3, R * .03, R * .04); break;
    }
    case 'knight': {
      const steel = std(0xc8ccd4, { metalness: .9, roughness: .25 }), plume = std(0xd8202a, { roughness: .8 });
      add(cyl, steel, 0, -R * .05, 0, R * .95, R * 1.4, R * .95);
      add(sph, steel, 0, R * .65, 0, R * .95, R * .6, R * .95);
      add(box, black, 0, R * .15, R * .9, R * 1.1, R * .1, R * .1); add(box, black, 0, -R * .2, R * .9, R * .1, R * .45, R * .1);
      for (let k = 0; k < 5; k++) add(sph, plume, 0, R * (1.15 + k * .1), -R * (.2 + k * .25), R * .2, R * .35, R * .3, -.6); break;
    }
    case 'astro': {
      const white = std(0xf4f6fa, { roughness: .35 }), gold = new THREE.MeshPhysicalMaterial({ color: 0xffc040, metalness: 1, roughness: .05, clearcoat: 1 });
      add(sph, white, 0, 0, 0, R * 1.18, R * 1.12, R * 1.15);
      const v = add(new THREE.SphereGeometry(1, 20, 12, -1, 2, .9, 1.1), gold, 0, 0, R * .1, R * 1.2, R * 1.12, R * 1.15); v.rotation.y = Math.PI / 2;
      add(cyl, white, R * .8, R * .9, -R * .3, R * .04, R * .5, R * .04, 0, 0, -.3); add(sph, new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false }), R * .95, R * 1.18, -R * .3, R * .09, R * .09, R * .09); break;
    }
    case 'dragon': {
      const scales = std(0x8a4ad8, { roughness: .4 }), belly = std(0xffd04a), horn = std(0xf4ecd8);
      add(sph, scales, 0, 0, 0, R, R * .95, R);
      add(box, scales, 0, -R * .2, R * .85, R * .9, R * .55, R * .8);
      add(box, belly, 0, -R * .42, R * 1.1, R * .7, R * .12, R * .5);
      for (const s of [-1, 1]) { add(cone, horn, s * R * .5, R * 1, -R * .4, R * .14, R * .7, R * .14, -.7, 0, -s * .2); add(sph, new THREE.MeshBasicMaterial({ color: 0xffe040, toneMapped: false }), s * R * .45, R * .3, R * .72, R * .14, R * .16, R * .1); add(sph, black, s * R * .2, -R * .05, R * 1.27, R * .05, R * .05, R * .03); }
      for (let k = 0; k < 3; k++) add(cone, belly, 0, R * (.8 - k * .1), -R * (.6 + k * .3), R * .1, R * .35, R * .1, -1.2); break;
    }
  }
  return g;
}

// Small round portrait for menus and the standings.
export function avatarPortrait(id) {
  const P = {
    pilot: '<circle cx="32" cy="34" r="22" fill="#f6cf42"/><path d="M12 34a20 12 0 0 1 40 0v4H12z" fill="#0c1820"/><rect x="30" y="10" width="4" height="12" fill="#f6f1e2"/>',
    fox: '<path d="M14 20l6-14 10 12zM50 20l-6-14-10 12z" fill="#ff7a2a"/><circle cx="32" cy="34" r="20" fill="#ff7a2a"/><ellipse cx="32" cy="44" rx="12" ry="9" fill="#fff4e8"/><circle cx="25" cy="31" r="3" fill="#111"/><circle cx="39" cy="31" r="3" fill="#111"/><ellipse cx="32" cy="40" rx="3.5" ry="2.5" fill="#111"/>',
    panda: '<circle cx="15" cy="16" r="7" fill="#15161a"/><circle cx="49" cy="16" r="7" fill="#15161a"/><circle cx="32" cy="34" r="21" fill="#f6f6f2"/><ellipse cx="24" cy="32" rx="6" ry="7.5" fill="#15161a" transform="rotate(25 24 32)"/><ellipse cx="40" cy="32" rx="6" ry="7.5" fill="#15161a" transform="rotate(-25 40 32)"/><circle cx="24" cy="32" r="2" fill="#fff"/><circle cx="40" cy="32" r="2" fill="#fff"/><ellipse cx="32" cy="43" rx="4" ry="3" fill="#15161a"/>',
    cat: '<path d="M13 22l3-16 11 10zM51 22l-3-16-11 10z" fill="#9aa0a8"/><circle cx="32" cy="35" r="20" fill="#9aa0a8"/><ellipse cx="25" cy="32" rx="3.5" ry="4.5" fill="#3ac85a"/><ellipse cx="39" cy="32" rx="3.5" ry="4.5" fill="#3ac85a"/><path d="M29 41h6l-3 3z" fill="#ff9ab8"/><path d="M10 42l12-2M10 47l12-4M54 42l-12-2M54 47l-12-4" stroke="#fff" stroke-width="1.5"/>',
    robot: '<rect x="14" y="16" width="36" height="34" rx="5" fill="#a8b4c0"/><rect x="18" y="25" width="28" height="9" rx="3" fill="#15161a"/><circle cx="26" cy="29.5" r="3" fill="#5ff4ff"/><circle cx="38" cy="29.5" r="3" fill="#5ff4ff"/><rect x="24" y="40" width="16" height="3" fill="#707a86"/><rect x="31" y="6" width="2" height="10" fill="#a8b4c0"/><circle cx="32" cy="6" r="3" fill="#ff3030"/>',
    frog: '<circle cx="21" cy="20" r="8" fill="#5ac83a"/><circle cx="43" cy="20" r="8" fill="#5ac83a"/><ellipse cx="32" cy="38" rx="24" ry="16" fill="#5ac83a"/><circle cx="21" cy="19" r="5" fill="#fff"/><circle cx="43" cy="19" r="5" fill="#fff"/><circle cx="21" cy="20" r="2.5" fill="#111"/><circle cx="43" cy="20" r="2.5" fill="#111"/><path d="M18 42q14 8 28 0" stroke="#2a6a1a" stroke-width="2.5" fill="none"/>',
    penguin: '<circle cx="32" cy="33" r="21" fill="#1a1c22"/><ellipse cx="32" cy="37" rx="15" ry="15" fill="#f6f6f2"/><circle cx="26" cy="32" r="2.6" fill="#111"/><circle cx="38" cy="32" r="2.6" fill="#111"/><path d="M27 38h10l-5 7z" fill="#ff9a2a"/>',
    alien: '<path d="M22 14l-6-8M42 14l6-8" stroke="#7aff6a" stroke-width="2"/><circle cx="16" cy="6" r="3" fill="#ff4fd8"/><circle cx="48" cy="6" r="3" fill="#ff4fd8"/><ellipse cx="32" cy="32" rx="19" ry="24" fill="#7aff6a"/><ellipse cx="24" cy="31" rx="7" ry="4.5" fill="#0a0a10" transform="rotate(30 24 31)"/><ellipse cx="40" cy="31" rx="7" ry="4.5" fill="#0a0a10" transform="rotate(-30 40 31)"/><rect x="29" y="46" width="6" height="1.6" fill="#2a6a20"/>',
    knight: '<path d="M32 4c8 6 10 12 4 16" fill="none" stroke="#d8202a" stroke-width="7" stroke-linecap="round"/><path d="M14 30a18 16 0 0 1 36 0v22H14z" fill="#c8ccd4"/><rect x="16" y="31" width="32" height="4" fill="#15161a"/><rect x="30" y="35" width="4" height="12" fill="#15161a"/>',
    astro: '<circle cx="32" cy="33" r="23" fill="#f4f6fa"/><ellipse cx="32" cy="34" rx="16" ry="12" fill="#ffc040"/><ellipse cx="26" cy="30" rx="5" ry="3" fill="#fff" opacity=".6"/><path d="M50 18l6-8" stroke="#f4f6fa" stroke-width="2.5"/><circle cx="56" cy="9" r="3" fill="#5ff4ff"/>',
    dragon: '<path d="M20 16l-6-12 12 8zM44 16l6-12-12 8z" fill="#f4ecd8"/><circle cx="32" cy="32" r="19" fill="#8a4ad8"/><rect x="18" y="36" width="28" height="16" rx="7" fill="#8a4ad8"/><rect x="22" y="44" width="20" height="5" rx="2" fill="#ffd04a"/><circle cx="25" cy="30" r="3.5" fill="#ffe040"/><circle cx="39" cy="30" r="3.5" fill="#ffe040"/><circle cx="28" cy="47" r="1.3" fill="#15161a"/><circle cx="36" cy="47" r="1.3" fill="#15161a"/>',
  };
  return `<svg viewBox="0 0 64 64" class="avatar-svg"><circle cx="32" cy="32" r="31" fill="#10242a"/>${P[id] || P.pilot}</svg>`;
}
