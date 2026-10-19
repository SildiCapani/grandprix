import * as THREE from 'three';

// Procedural surface textures (no downloads): every map is drawn once on a canvas
// and shared. Colour maps are sRGB, roughness/bump maps stay linear.
const cache = new Map();
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function canvasTexture(key, size, draw, { srgb = true, repeat = [1, 1] } = {}) {
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  seed = [...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 2147483646 + 1;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  t.userData.shared = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

function grain(g, size, count, colors, min = .5, max = 2) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[i % colors.length];
    const s = min + rnd() * (max - min);
    g.fillRect(rnd() * size, rnd() * size, s, s);
  }
}

function blotches(g, size, count, color, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size, y = rnd() * size, r = rMin + rnd() * (rMax - rMin);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// Polished terrazzo: pale base, stone chips, faint wear clouds.
export function terrazzo() {
  return {
    map: canvasTexture('terrazzo', 1024, (g, s) => {
      g.fillStyle = '#cfccc3'; g.fillRect(0, 0, s, s);
      blotches(g, s, 60, 'rgba(255,255,250,.10)', 40, 160);
      blotches(g, s, 40, 'rgba(120,118,108,.06)', 40, 140);
      grain(g, s, 26000, ['rgba(255,255,250,.35)', 'rgba(96,98,94,.28)', 'rgba(170,160,140,.30)', 'rgba(70,74,76,.22)'], .6, 3.4);
      grain(g, s, 1400, ['rgba(60,62,64,.45)', 'rgba(240,238,228,.6)', 'rgba(150,120,95,.35)'], 2, 6);
    }),
    roughnessMap: canvasTexture('terrazzo-r', 512, (g, s) => {
      g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, s, s);
      blotches(g, s, 70, 'rgba(150,150,150,.35)', 30, 130); // scuffed, less glossy patches
      grain(g, s, 6000, ['rgba(110,110,110,.5)', 'rgba(30,30,30,.5)'], .5, 2);
    }, { srgb: false }),
  };
}

// Board-marked architectural concrete.
export function concrete() {
  return {
    map: canvasTexture('concrete', 512, (g, s) => {
      g.fillStyle = '#c9c5bb'; g.fillRect(0, 0, s, s);
      blotches(g, s, 90, 'rgba(110,105,96,.10)', 20, 90);
      blotches(g, s, 50, 'rgba(255,255,250,.10)', 20, 80);
      for (let y = 0; y < s; y += 64) { g.fillStyle = 'rgba(90,88,82,.10)'; g.fillRect(0, y, s, 2); }
      grain(g, s, 16000, ['rgba(90,88,84,.18)', 'rgba(255,255,250,.18)'], .5, 1.6);
      grain(g, s, 300, ['rgba(70,68,64,.35)'], 1.5, 3); // air pores
    }),
    roughnessMap: canvasTexture('concrete-r', 256, (g, s) => {
      g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, s, s);
      grain(g, s, 5000, ['rgba(255,255,255,.4)', 'rgba(140,140,140,.4)'], .5, 2);
    }, { srgb: false }),
  };
}

// Fine plaster for the white gallery bands.
export function plaster() {
  return {
    map: canvasTexture('plaster', 256, (g, s) => {
      g.fillStyle = '#efeeea'; g.fillRect(0, 0, s, s);
      blotches(g, s, 30, 'rgba(200,198,190,.10)', 20, 60);
      grain(g, s, 7000, ['rgba(220,218,210,.35)', 'rgba(255,255,255,.4)'], .5, 1.4);
    }),
  };
}

// Indoor racing asphalt with exposed aggregate.
export function asphalt() {
  return {
    map: canvasTexture('asphalt', 512, (g, s) => {
      g.fillStyle = '#7d8183'; g.fillRect(0, 0, s, s);
      blotches(g, s, 50, 'rgba(40,44,46,.12)', 20, 90);
      grain(g, s, 42000, ['rgba(40,42,44,.45)', 'rgba(175,178,176,.40)', 'rgba(110,112,112,.5)', 'rgba(20,22,24,.35)'], .6, 2.4);
    }),
    roughnessMap: canvasTexture('asphalt-r', 256, (g, s) => {
      g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, s, s);
      grain(g, s, 9000, ['rgba(255,255,255,.5)', 'rgba(90,90,90,.5)'], .5, 1.8);
    }, { srgb: false }),
    bumpMap: canvasTexture('asphalt-b', 256, (g, s) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
      grain(g, s, 12000, ['rgba(255,255,255,.55)', 'rgba(0,0,0,.45)'], .6, 1.8);
    }, { srgb: false }),
  };
}

// Dark rubber laid down on the racing line, fading to both edges (alpha only).
export function rubberLine() {
  return canvasTexture('rubber', 256, (g, s) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s); // alpha maps read the green channel
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(.3, 'rgba(255,255,255,.55)');
    grad.addColorStop(.5, 'rgba(255,255,255,.75)'); grad.addColorStop(.7, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    grain(g, s, 3000, ['rgba(0,0,0,.3)'], 1, 3);
  }, { srgb: false });
}

// Woven carbon fibre.
export function carbon() {
  return canvasTexture('carbon', 128, (g, s) => {
    g.fillStyle = '#16191c'; g.fillRect(0, 0, s, s);
    const n = 16, w = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const grad = (x + y) % 2
        ? g.createLinearGradient(x * w, y * w, x * w + w, y * w)
        : g.createLinearGradient(x * w, y * w, x * w, y * w + w);
      grad.addColorStop(0, '#0f1114'); grad.addColorStop(.5, '#2b3036'); grad.addColorStop(1, '#0f1114');
      g.fillStyle = grad; g.fillRect(x * w, y * w, w, w);
    }
  }, { repeat: [3, 3] });
}

// Soft contact shadow under each car.
export function contactShadow() {
  return canvasTexture('contact', 128, (g, s) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,.9)'); grad.addColorStop(.55, 'rgba(255,255,255,.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
  }, { srgb: false });
}

// City windows for the skyline outside the glass hall.
export function facadeWindows(night) {
  return canvasTexture(night ? 'win-night' : 'win-day', 256, (g, s) => {
    g.fillStyle = night ? '#1b2230' : '#b9b6ae'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const lit = night ? rnd() < .38 : rnd() < .08;
      g.fillStyle = lit ? (rnd() < .7 ? '#ffd890' : '#cfe6ff') : night ? '#0d121b' : '#5b6f80';
      g.fillRect(x * 32 + 5, y * 16 + 3, 22, 10);
    }
  });
}
