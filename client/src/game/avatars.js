import * as THREE from 'three';
import { buildClayHead } from './drivers-clay.js';
import { CUPS } from './cups.js';
import { MAPS } from './tracks.js';

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
  // Star drivers: won by cups (gold trophy at a speed class) or by diamond times in time trial.
  { id: 'bunny', name: 'Hopsi', tag: 'Schnellster Hase der Küste', need: { diamond: ['coast', 80] }, color: '#ffa8c8', star: true },
  { id: 'shark', name: 'Haijo', tag: 'Beißt sich durch jedes Feld', need: { cup: ['kueste', 100] }, color: '#5f86b4', star: true },
  { id: 'lion', name: 'Leo Mähne', tag: 'König der Savanne', need: { cup: ['wildnis', 100] }, color: '#f0b040', star: true },
  { id: 'parrot', name: 'Käpt\'n Pepe', tag: 'Papagei mit Piratenhut', need: { cup: ['abenteuer', 100] }, color: '#e8302a', star: true },
  { id: 'bee', name: 'Summsi', tag: 'Fliegt fast über die Strecke', need: { diamond: ['candy', 100] }, color: '#ffcc20', star: true },
  { id: 'yeti', name: 'Yuki', tag: 'Der Yeti vom Gipfel', need: { cup: ['gipfel', 120] }, color: '#8ecaf2', star: true },
  { id: 'owl', name: 'Prof. Uhu', tag: 'Kennt jede Ideallinie auswendig', need: { cup: ['sterne', 120] }, color: '#8a5634', star: true },
  { id: 'dino', name: 'Trixi', tag: 'Dreihorn mit Dickschädel', need: { goldcups: 3 }, color: '#f08a3a', star: true },
  { id: 'magmo', name: 'Magmo', tag: 'Glüht vor Ehrgeiz', need: { diamond: ['volcano', 100] }, color: '#ff7a1a', star: true },
  { id: 'ninja', name: 'Kage', tag: 'Lautlos und blitzschnell', need: { diamond: ['neon', 120] }, color: '#e02a3a', star: true },
  { id: 'crystal', name: 'Kristalla', tag: 'Aus ewigem Eis geschliffen', need: { diamond: ['glacier', 120] }, color: '#8adcff', star: true },
  { id: 'octo', name: 'Okto', tag: 'Acht Arme, null Bremse', need: { cup: ['kosmos', 150] }, color: '#a04ae0', star: true },
  { id: 'wizard', name: 'Merla', tag: 'Zaubert Abkürzungen herbei', need: { diamond: ['castle', 150] }, color: '#5a2ac8', star: true },
  { id: 'unicorn', name: 'Glitzer', tag: 'Die Legende: alle Cups auf 150', need: { allcups: 150 }, color: '#ff8ac0', star: true },
].map(a => Object.freeze(a)));
export const avatarById = id => AVATARS.find(a => a.id === id) || AVATARS[0];

// Diamond time: faster than platinum (platinum = 8 %, diamond = 13 % below the gold time of that speed class).
export const DIAMOND_FACTOR = .87;
export const diamondPar = (map, cc) => Math.round(map.parTimes.gold * (80 / cc) * DIAMOND_FACTOR);
// ctx = { progress (see skinProgress), cupTrophy(cupId, cc) → 'gold'|'silver'|'bronze'|'none', bestTime(mapId, cc) → seconds|null }
const NEED = {
  cup: ([id, cc], c) => c.cupTrophy(id, cc) === 'gold',
  goldcups: (n, c) => CUPS.reduce((a, cup) => a + ([80, 100, 120, 150].some(cc => c.cupTrophy(cup.id, cc) === 'gold') ? 1 : 0), 0) >= n,
  allcups: (cc, c) => CUPS.every(cup => c.cupTrophy(cup.id, cc) === 'gold'),
  diamond: ([id, cc], c) => { const m = MAPS.find(x => x.id === id), t = c.bestTime(id, cc); return !!m && t != null && t <= diamondPar(m, cc); },
};
export function avatarUnlocked(av, ctx) {
  return Object.entries(av.need).every(([k, v]) => NEED[k] ? NEED[k](v, ctx) : (ctx.progress[k] || 0) >= v);
}
const mapName = id => MAPS.find(m => m.id === id)?.name || id, cupName = id => CUPS.find(c => c.id === id)?.name || id;
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// Text for a locked driver, or null when the need is a plain one (level, races …) that skinRequirement() describes.
export function avatarRequirement(av) {
  const n = av.need;
  if (n.cup) return `${cupName(n.cup[0])} gewinnen (Gold) · ${n.cup[1]} km/h`;
  if (n.goldcups) return `${n.goldcups} verschiedene Cups mit Gold gewinnen`;
  if (n.allcups) return `Alle ${CUPS.length} Cups mit Gold · ${n.allcups} km/h`;
  if (n.diamond) { const m = MAPS.find(x => x.id === n.diamond[0]); return `💎 Diamant-Zeit im Zeitfahren · ${mapName(n.diamond[0])} · ${n.diamond[1]} km/h${m ? ' · unter ' + fmt(diamondPar(m, n.diamond[1])) : ''}`; }
  return null;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .45, ...o });
const sph = new THREE.SphereGeometry(1, 20, 14), cone = new THREE.ConeGeometry(1, 1, 12), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 14);

// A head (plus helmet / ears / antennae) facing +Z, about 0.3 units wide, centred on the neck.
export function buildAvatarHead(id) {
  const clay = buildClayHead(id); if (clay) return clay;
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
    bunny: '<path d="M20 26c-4-10-4-20 1-22 5 1 6 12 5 22zM44 26c4-10 4-20-1-22-5 1-6 12-5 22z" fill="#f6f2f0"/><path d="M22 22c-2-6-2-13 0-14 2 1 3 8 2 14zM42 22c2-6 2-13 0-14-2 1-3 8-2 14z" fill="#ffa8c8"/><circle cx="32" cy="38" r="18" fill="#f6f2f0"/><circle cx="25" cy="35" r="3" fill="#111"/><circle cx="39" cy="35" r="3" fill="#111"/><ellipse cx="32" cy="41" rx="3" ry="2.2" fill="#ff8ab0"/><rect x="29.5" y="44" width="5" height="5" rx="1" fill="#fff" stroke="#ddd" stroke-width=".6"/>',
    shark: '<path d="M32 4l8 14H26z" fill="#5f86b4"/><ellipse cx="32" cy="34" rx="22" ry="19" fill="#5f86b4"/><ellipse cx="32" cy="43" rx="18" ry="10" fill="#f2f6fa"/><path d="M18 40q14 9 28 0q-14 5-28 0z" fill="#5a1426"/><path d="M20 40l3 3 3-2 3 3 3-3 3 3 3-3 3 2 3-3" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="23" cy="29" r="4" fill="#fff"/><circle cx="41" cy="29" r="4" fill="#fff"/><circle cx="24" cy="30" r="2" fill="#111"/><circle cx="40" cy="30" r="2" fill="#111"/>',
    lion: '<circle cx="32" cy="33" r="27" fill="#b84c18"/><circle cx="32" cy="34" r="18" fill="#f0b040"/><ellipse cx="32" cy="42" rx="10" ry="7" fill="#fff2cc"/><ellipse cx="32" cy="38" rx="4" ry="2.6" fill="#4a2416"/><circle cx="25" cy="31" r="3" fill="#111"/><circle cx="39" cy="31" r="3" fill="#111"/>',
    parrot: '<ellipse cx="32" cy="18" rx="22" ry="7" fill="#18161c"/><ellipse cx="32" cy="14" rx="12" ry="8" fill="#18161c"/><circle cx="32" cy="12" r="2.4" fill="#fff"/><circle cx="32" cy="36" r="18" fill="#e8302a"/><circle cx="22" cy="36" r="6" fill="#fff"/><circle cx="42" cy="36" r="6" fill="#fff"/><circle cx="22" cy="34" r="2.6" fill="#111"/><circle cx="42" cy="34" r="2.6" fill="#111"/><path d="M27 38q5-4 10 0q0 10-5 14q-5-6-5-14z" fill="#f3e6c4"/><path d="M14 52h36" stroke="#ffd23a" stroke-width="4"/>',
    bee: '<path d="M22 14l-6-9M42 14l6-9" stroke="#18161c" stroke-width="2"/><circle cx="16" cy="5" r="3" fill="#18161c"/><circle cx="48" cy="5" r="3" fill="#18161c"/><ellipse cx="9" cy="26" rx="7" ry="11" fill="#dff4ff" opacity=".85"/><ellipse cx="55" cy="26" rx="7" ry="11" fill="#dff4ff" opacity=".85"/><circle cx="32" cy="34" r="20" fill="#ffcc20"/><path d="M14 26q18-10 36 0" stroke="#18161c" stroke-width="5" fill="none"/><circle cx="25" cy="34" r="5" fill="#fff"/><circle cx="39" cy="34" r="5" fill="#fff"/><circle cx="25" cy="35" r="2.6" fill="#111"/><circle cx="39" cy="35" r="2.6" fill="#111"/><path d="M26 44q6 4 12 0" stroke="#6a3a10" stroke-width="2" fill="none"/>',
    yeti: '<path d="M16 18l-6-10 10 6zM48 18l6-10-10 6z" fill="#e8dcc0"/><circle cx="32" cy="34" r="22" fill="#f4f8ff"/><ellipse cx="32" cy="38" rx="14" ry="13" fill="#8ecaf2"/><circle cx="26" cy="34" r="2.8" fill="#111"/><circle cx="38" cy="34" r="2.8" fill="#111"/><path d="M24 43q8 7 16 0z" fill="#2a3a6a"/><path d="M25 43.5h14" stroke="#fff" stroke-width="2"/>',
    owl: '<path d="M14 18l2-12 9 9zM50 18l-2-12-9 9z" fill="#8a5634"/><circle cx="32" cy="35" r="22" fill="#8a5634"/><circle cx="23" cy="32" r="9" fill="#f4dcb2"/><circle cx="41" cy="32" r="9" fill="#f4dcb2"/><circle cx="23" cy="32" r="5" fill="#fff" stroke="#2a2a30" stroke-width="2"/><circle cx="41" cy="32" r="5" fill="#fff" stroke="#2a2a30" stroke-width="2"/><circle cx="23" cy="32" r="2.4" fill="#111"/><circle cx="41" cy="32" r="2.4" fill="#111"/><path d="M28 31h8" stroke="#2a2a30" stroke-width="2"/><path d="M29 38h6l-3 6z" fill="#ffb030"/>',
    dino: '<path d="M8 30a24 22 0 0 1 48 0z" fill="#ffc04a"/><path d="M22 20l-3-12 7 10zM42 20l3-12-7 10z" fill="#fff4dc"/><ellipse cx="32" cy="38" rx="17" ry="16" fill="#f08a3a"/><path d="M30 46l2-8 2 8z" fill="#fff4dc"/><circle cx="24" cy="34" r="3" fill="#111"/><circle cx="40" cy="34" r="3" fill="#111"/><path d="M26 49q6 2 12 0" stroke="#6a2a10" stroke-width="2" fill="none"/>',
    magmo: '<path d="M10 36q0-26 22-27q22 1 22 27q0 18-22 19q-22-1-22-19z" fill="#4a3c3c"/><path d="M20 18l6 8M44 16l-4 10M48 34l-6 4" stroke="#ff7a1a" stroke-width="2.4"/><ellipse cx="24" cy="34" rx="4.5" ry="3.5" fill="#ffd040"/><ellipse cx="40" cy="34" rx="4.5" ry="3.5" fill="#ffd040"/><path d="M19 28l10 3M45 28l-10 3" stroke="#1a1414" stroke-width="2.6"/><rect x="24" y="43" width="16" height="3" rx="1.5" fill="#ff6a10"/>',
    ninja: '<circle cx="32" cy="34" r="22" fill="#1e2238"/><rect x="14" y="27" width="36" height="11" rx="5" fill="#f2c8a0"/><rect x="11" y="20" width="42" height="5" fill="#e02a3a"/><path d="M52 22l9 6-9 2z" fill="#e02a3a"/><path d="M21 31l8 2M43 31l-8 2" stroke="#1e2238" stroke-width="2"/><circle cx="25" cy="33" r="2.4" fill="#111"/><circle cx="39" cy="33" r="2.4" fill="#111"/>',
    crystal: '<path d="M22 16l4-12 4 12zM30 14l3-12 3 12zM38 16l4-10 2 12z" fill="#c8f4ff"/><path d="M32 12l20 14-6 26H18l-6-26z" fill="#8adcff"/><path d="M32 12l-8 40M32 12l8 40M12 26l40 0" stroke="#e8fcff" stroke-width="1" opacity=".7"/><circle cx="25" cy="32" r="4" fill="#fff"/><circle cx="39" cy="32" r="4" fill="#fff"/><circle cx="25" cy="33" r="2" fill="#111"/><circle cx="39" cy="33" r="2" fill="#111"/>',
    octo: '<path d="M14 46q-4 8-8 10M22 50q-2 8-6 10M42 50q2 8 6 10M50 46q4 8 8 10" stroke="#a04ae0" stroke-width="5" stroke-linecap="round" fill="none"/><ellipse cx="32" cy="28" rx="20" ry="24" fill="#a04ae0"/><circle cx="42" cy="14" r="3.5" fill="#d99aff"/><circle cx="22" cy="12" r="2.5" fill="#d99aff"/><circle cx="25" cy="34" r="5" fill="#fff"/><circle cx="39" cy="34" r="5" fill="#fff"/><circle cx="25" cy="35" r="2.6" fill="#111"/><circle cx="39" cy="35" r="2.6" fill="#111"/>',
    wizard: '<path d="M32 2l12 22H16z" fill="#5a2ac8"/><circle cx="36" cy="12" r="2" fill="#ffe040"/><circle cx="28" cy="18" r="1.6" fill="#ffe040"/><ellipse cx="32" cy="24" rx="22" ry="4" fill="#5a2ac8"/><path d="M12 30q0 22 8 24h24q8-2 8-24z" fill="#ff5ab0"/><circle cx="32" cy="36" r="14" fill="#f6d0b0"/><circle cx="27" cy="35" r="2.4" fill="#111"/><circle cx="37" cy="35" r="2.4" fill="#111"/><circle cx="24" cy="40" r="2.4" fill="#ffa0b8"/><circle cx="40" cy="40" r="2.4" fill="#ffa0b8"/><path d="M29 43q3 2 6 0" stroke="#a02a3a" stroke-width="1.6" fill="none"/>',
    unicorn: '<path d="M32 2l4 16h-8z" fill="#ffd860"/><path d="M50 14q8 14 2 34" stroke="#ff5a6a" stroke-width="5" fill="none"/><path d="M47 13q8 15 1 34" stroke="#ffe14a" stroke-width="4" fill="none"/><path d="M44 13q7 16 0 34" stroke="#4ab0ff" stroke-width="4" fill="none"/><ellipse cx="30" cy="32" rx="17" ry="18" fill="#faf6ff"/><path d="M18 18l2-9 6 7zM38 16l4-8 2 9z" fill="#faf6ff"/><ellipse cx="30" cy="46" rx="12" ry="8" fill="#ffc8e0"/><circle cx="24" cy="30" r="3" fill="#111"/><circle cx="36" cy="30" r="3" fill="#111"/>',
  };
  return `<svg viewBox="0 0 64 64" class="avatar-svg"><circle cx="32" cy="32" r="31" fill="#10242a"/>${P[id] || P.pilot}</svg>`;
}
