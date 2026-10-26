import * as THREE from 'three';
import { buildDriver } from './drivers.js';
import { CUPS } from './cups.js';
import { MAPS } from './tracks.js';

// Drivers: who sits in the kart. All characters are original designs for Apex Rush.
// `need` works like the skins: { level } | { races } | { wins } | { golds } | { tracks } (admins have everything).
export const AVATARS = Object.freeze([
  { id: 'marco', name: 'Marco Bellini', tag: 'Der Veteran · 20 Jahre Rennerfahrung', need: {}, color: '#d8282f' },
  { id: 'yuna', name: 'Yuna Sato', tag: 'Präzision auf den Zentimeter', need: { level: 2 }, color: '#2a5ad8' },
  { id: 'jax', name: 'Jax Carter', tag: 'Straßenkönig aus Detroit', need: { level: 3 }, color: '#ff7a1a' },
  { id: 'lena', name: 'Lena Kraus', tag: 'Ingenieurin, baut ihr Kart selbst', need: { level: 4 }, color: '#2f9a4a' },
  { id: 'amara', name: 'Amara Okoye', tag: 'Drift-Queen von Lagos', need: { wins: 5 }, color: '#6a2ac8' },
  { id: 'diego', name: 'Diego Ruiz', tag: 'Hitzkopf mit Vollgas-Fuß', need: { level: 6 }, color: '#ff8a1a' },
  { id: 'sofia', name: 'Sofia Reyes', tag: 'Ex-Pilotin, fliegt durch Kurven', need: { cup: ['kueste', 100] }, color: '#1aa8a0', star: true },
  { id: 'kenji', name: 'Kenji Mori', tag: 'Nachtfahrer aus Tokio', need: { diamond: ['neon', 120] }, color: '#38e0ff', star: true },
  { id: 'viktor', name: 'Viktor Stahl', tag: 'Der Eiserne · dreifacher Champion', need: { cup: ['gipfel', 120] }, color: '#d8a832', star: true },
  { id: 'phantom', name: 'Phantom', tag: 'Niemand hat sein Gesicht gesehen', need: { allcups: 150 }, color: '#e02a2a', star: true },
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

// Portraits: the real 3D driver rendered once into a small image (head and shoulders), cached per driver.
let studio = null; const portraits = new Map();
function portraitURL(id, big = false) {
  const key = id + (big ? ':big' : '');
  if (portraits.has(key)) return portraits.get(key);
  let url = '';
  try {
    if (!studio) {
      const canvas = document.createElement('canvas'), r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(192, 192, false); r.toneMapping = THREE.NeutralToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(1.2, 1.6, 2); scene.add(key);
      const rim = new THREE.DirectionalLight(0x9adfff, 1.6); rim.position.set(-1.5, 1, -1.2); scene.add(rim);
      const cam = new THREE.PerspectiveCamera(22, 1, .01, 10); cam.position.set(.18, .86, .78); cam.lookAt(0, .76, 0);
      studio = { r, scene, cam };
    }
    const d = buildDriver(id); d.userData.head.rotation.y = .18; studio.scene.add(d);
    const S = big ? 360 : 192; studio.r.setSize(S, S, false);
    if (big) { studio.cam.fov = 30; studio.cam.position.set(.32, .82, 1.25); studio.cam.lookAt(0, .66, 0); } else { studio.cam.fov = 22; studio.cam.position.set(.18, .86, .78); studio.cam.lookAt(0, .76, 0); }
    studio.cam.updateProjectionMatrix();
    studio.r.render(studio.scene, studio.cam); url = studio.r.domElement.toDataURL('image/png');
    studio.scene.remove(d);
  } catch { url = ''; }
  portraits.set(key, url); return url;
}
// Small round portrait for menus and the standings.
export function avatarPortrait(id, big = false) {
  const a = avatarById(id), url = portraitURL(a.id, big);
  return `<figure class="avatar-svg avatar-img${big ? ' big' : ''}" style="--av:${a.color}">${url ? `<img src="${url}" alt="${a.name}">` : ''}</figure>`;
}
