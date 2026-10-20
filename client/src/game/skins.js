import * as THREE from 'three';

// Kart skins: painted patterns on the bodywork. They unlock over time (level, races, wins, medals).
// `need` describes the unlock: { level } | { races } | { wins } | { golds } | { tracks } (any combination, all must hold).
export const SKINS = Object.freeze([
  { id: 'none', name: 'Werkslack', rarity: 'basis', need: {} },
  { id: 'stripes', name: 'Rennstreifen', rarity: 'gewöhnlich', need: { races: 1 } },
  { id: 'checker', name: 'Zielflagge', rarity: 'gewöhnlich', need: { races: 5 } },
  { id: 'camo', name: 'Tarnmuster', rarity: 'gewöhnlich', need: { level: 2 } },
  { id: 'flames', name: 'Flammen', rarity: 'selten', need: { wins: 1 } },
  { id: 'tiger', name: 'Tiger', rarity: 'selten', need: { level: 3 } },
  { id: 'pixel', name: 'Retro-Pixel', rarity: 'selten', need: { races: 15 } },
  { id: 'ice', name: 'Eiskristall', rarity: 'episch', need: { level: 4 } },
  { id: 'zebra', name: 'Zebra', rarity: 'episch', need: { golds: 3 } },
  { id: 'lightning', name: 'Blitzschlag', rarity: 'episch', need: { wins: 5 } },
  { id: 'lava', name: 'Lava', rarity: 'legendär', need: { level: 5, wins: 8 } },
  { id: 'synthwave', name: 'Neon-Grid', rarity: 'legendär', need: { tracks: 8 } },
  { id: 'galaxy', name: 'Galaxie', rarity: 'legendär', need: { level: 6 } },
  { id: 'dragon', name: 'Gold-Drache', rarity: 'mythisch', need: { level: 7, wins: 20 } },
].map(s => Object.freeze(s)));
export const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

// Progress numbers a skin can ask for, taken from the career profile.
export function skinProgress(profile, level) {
  const ach = profile?.achievements || [];
  return {
    level, races: profile?.races || 0, wins: profile?.wins || 0,
    golds: ach.filter(a => /:gold$/.test(a)).length,
    tracks: ach.filter(a => /:finish$/.test(a)).length,
  };
}
const LABEL = { level: n => 'Level ' + n, races: n => n + (n === 1 ? ' Rennen' : ' Rennen'), wins: n => n + (n === 1 ? ' Sieg' : ' Siege'), golds: n => n + '× Gold', tracks: n => n + ' Strecken beendet' };
export const skinRequirement = skin => Object.entries(skin.need).map(([k, v]) => LABEL[k](v)).join(' + ') || 'Immer frei';
export const skinUnlocked = (skin, progress) => Object.entries(skin.need).every(([k, v]) => (progress[k] || 0) >= v);

// ---------- textures ----------
const cache = new Map();
function canvas(size = 256) { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; }
function rnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();

const PAINTERS = {
  stripes(g, s, base) { g.fillStyle = base; g.fillRect(0, 0, s, s); g.fillStyle = '#ffffff'; g.fillRect(s * .36, 0, s * .1, s); g.fillRect(s * .54, 0, s * .1, s); g.fillStyle = '#111'; g.fillRect(s * .46, 0, s * .08, s); },
  checker(g, s) { const n = 8; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? '#111418' : '#f4f4ee'; g.fillRect(x * s / n, y * s / n, s / n, s / n); } },
  camo(g, s) {
    const r = rnd(7); g.fillStyle = '#5b6b3a'; g.fillRect(0, 0, s, s);
    for (const c of ['#3c4a26', '#7d7a4f', '#2a2f1c', '#6e8044']) for (let i = 0; i < 14; i++) { g.fillStyle = c; g.beginPath(); const x = r() * s, y = r() * s; g.ellipse(x, y, 14 + r() * 30, 9 + r() * 20, r() * 3, 0, 7); g.fill(); g.beginPath(); g.ellipse(x - s, y, 14, 9, 0, 0, 7); g.fill(); }
  },
  flames(g, s) {
    const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#1a0a08'); gr.addColorStop(1, '#3a0d08'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (const [col, h] of [['#ff3d10', .95], ['#ff9a1a', .72], ['#ffe14a', .48]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, s);
      for (let x = 0; x <= s; x += s / 8) { const tip = s * (1 - h * (.6 + .4 * Math.abs(Math.sin(x * .05)))); g.quadraticCurveTo(x + s / 32, tip + s * .25, x + s / 16, tip); g.quadraticCurveTo(x + s / 12, tip + s * .3, x + s / 8, s * (1 - h * .35)); }
      g.lineTo(s, s); g.fill();
    }
  },
  tiger(g, s) {
    g.fillStyle = '#f08a1c'; g.fillRect(0, 0, s, s); const r = rnd(11); g.fillStyle = '#16100c';
    for (let i = 0; i < 9; i++) { const y = (i + .5) * s / 9 + (r() - .5) * 8; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * .05 + i) * 6 - (x % 64 < 32 ? 4 : -2)); for (let x = s; x >= 0; x -= 16) g.lineTo(x, y + 5 + Math.sin(x * .07 + i) * 4); g.fill(); }
  },
  pixel(g, s) { const r = rnd(5), pal = ['#ff4fd8', '#3df5ff', '#ffe14d', '#7c4dff', '#1a1030']; const n = 16; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = pal[Math.floor(r() * (r() < .45 ? 5 : 2)) % 5]; g.fillRect(x * s / n, y * s / n, s / n, s / n); } },
  ice(g, s) {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#dff6ff'); gr.addColorStop(1, '#7cc8f2'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    const r = rnd(3); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const x = r() * s, y = r() * s, l = 20 + r() * 50; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l * .4, y + Math.sin(a) * l * .4); g.stroke(); } }
  },
  zebra(g, s) { g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, s, s); g.fillStyle = '#111'; for (let i = 0; i < 10; i++) { g.beginPath(); const x0 = i * s / 10; g.moveTo(x0, 0); g.bezierCurveTo(x0 + 30, s * .3, x0 - 20, s * .6, x0 + 18, s); g.lineTo(x0 + 34, s); g.bezierCurveTo(x0 + 6, s * .6, x0 + 46, s * .3, x0 + 16, 0); g.fill(); } },
  lightning(g, s) {
    g.fillStyle = '#121a3a'; g.fillRect(0, 0, s, s); const r = rnd(9);
    for (let b = 0; b < 4; b++) { g.strokeStyle = b % 2 ? '#8ad8ff' : '#fff36a'; g.lineWidth = 5; g.shadowColor = g.strokeStyle; g.shadowBlur = 10; g.beginPath(); let x = r() * s, y = 0; g.moveTo(x, y); while (y < s) { x += (r() - .5) * 60; y += 20 + r() * 30; g.lineTo(x, y); } g.stroke(); }
    g.shadowBlur = 0;
  },
  lava(g, s) {
    g.fillStyle = '#1b0f0d'; g.fillRect(0, 0, s, s); const r = rnd(13);
    for (let i = 0; i < 24; i++) { g.strokeStyle = `rgba(255,${80 + r() * 120},20,.95)`; g.lineWidth = 2 + r() * 4; g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - .5) * 70; y += (r() - .5) * 70; g.lineTo(x, y); } g.stroke(); }
  },
  synthwave(g, s) {
    const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#1a0638'); gr.addColorStop(1, '#3a0a5a'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#ff4fd8'; g.lineWidth = 3; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * s / 8, 0); g.lineTo(i * s / 8, s); g.stroke(); }
    g.strokeStyle = '#3df5ff'; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * s / 8); g.lineTo(s, i * s / 8); g.stroke(); }
  },
  galaxy(g, s) {
    g.fillStyle = '#07051a'; g.fillRect(0, 0, s, s); const r = rnd(21);
    for (const c of ['rgba(140,60,255,.55)', 'rgba(60,140,255,.45)', 'rgba(255,80,190,.4)']) for (let i = 0; i < 4; i++) { const x = r() * s, y = r() * s, rad = 40 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${.4 + r() * .6})`; const k = r() < .08 ? 2.5 : 1.2; g.fillRect(r() * s, r() * s, k, k); }
  },
  dragon(g, s) {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#7a5310'); gr.addColorStop(.5, '#ffd76a'); gr.addColorStop(1, '#8a5a12'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    const n = 8, w = s / n; g.strokeStyle = 'rgba(70,40,5,.75)'; g.lineWidth = 2;
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) { const cx = x * w + (y % 2 ? w / 2 : 0), cy = y * w * .8; g.beginPath(); g.arc(cx, cy, w * .55, 0, Math.PI); g.stroke(); g.fillStyle = 'rgba(255,240,180,.25)'; g.beginPath(); g.arc(cx, cy + w * .1, w * .3, 0, Math.PI); g.fill(); }
  },
};
// Emissive glow for the skins that should shine at night.
const GLOW = { lava: 1.1, synthwave: .9, lightning: .8, galaxy: .5 };

export function skinTexture(id, base = '#e34335') {
  if (!PAINTERS[id] || typeof document === 'undefined') return null;
  const key = id + base;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(256); PAINTERS[id](g, 256, base);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.userData.shared = true;
  cache.set(key, t); return t;
}
// Apply a skin to a car's paint materials (call after the car is built).
export function applySkin(materials, id, base) {
  const tex = skinTexture(id, base);
  if (!tex) return;
  const { paint, darkPaint } = materials;
  paint.map = tex; paint.color.set('#ffffff');
  if (GLOW[id]) { paint.emissiveMap = tex; paint.emissive.set('#ffffff'); paint.emissiveIntensity = GLOW[id]; }
  if (id === 'dragon') { paint.metalness = .9; paint.roughness = .25; }
  darkPaint.color.set(shade(id === 'none' ? base : ({ flames: '#5a1206', camo: '#2a2f1c', tiger: '#3a1a06', ice: '#4a8ab8', lava: '#2a0c06', synthwave: '#2a0848', galaxy: '#140a30', dragon: '#6a4410', checker: '#222', zebra: '#222', pixel: '#2a1050', lightning: '#0c1230', stripes: base })[id] || base, 1));
  paint.needsUpdate = true; darkPaint.needsUpdate = true;
}
// Small preview image for the garage.
export function skinPreview(id, base) {
  if (typeof document === 'undefined') return '';
  if (!PAINTERS[id]) return '';
  const [c, g] = canvas(96); g.scale(96 / 256, 96 / 256); PAINTERS[id](g, 256, base); return c.toDataURL();
}
