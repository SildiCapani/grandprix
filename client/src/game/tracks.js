// Six circuits, each with its own world. The last three are fully 3D: hills, bridges, a helix and jumps.
const wrap = v => ((v % 1) + 1) % 1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// v3: the whole hall (and every route) is scaled up so 8 cars fit side by side.
// Kept for compatibility: the worlds are authored at real scale now.
export const WORLD_SCALE = 1;
const WIDTH_SCALE = 1;
export const RAMP_LEN = 6, RAMP_H = .9;

// Helix for the space track: 1.25 turns around (170, -40), radius 55, climbing 10 m per turn.
const helix = (cx, cz, R, y0, pitch, from, to, step) => {
  const out = [];
  for (let a = from; a <= to + 1e-9; a += step) out.push([+(cx + R * Math.cos(a)).toFixed(1), +(cz - R * Math.sin(a)).toFixed(1), +(y0 + pitch * a / (Math.PI * 2)).toFixed(2)]);
  return out;
};
const VOLCANO = [[-150, -120, 0], [-75, -62, 0], [0, 0, 0], [80, 70, 1.5], [165, 150, 4], [255, 150, 6], [318, 72, 7.5], [326, -40, 8], [292, -120, 8.5],
  [214, -176, 9.5], [124, -150, 10.5], [62, -72, 11], [0, 0, 11], [-62, 72, 10.5], [-140, 150, 8], [-246, 168, 5], [-318, 104, 2.5], [-334, 4, 1], [-304, -100, 0], [-236, -158, 0]];
const GLACIER = [[-102, 144.5, 0], [0, 144.5, 0], [93.5, 144.5, 0], [161.5, 127.5, 1], [191.2, 80.8, 3], [144.5, 51, 5.5], [51, 51, 8], [-22.1, 51, 10.1], [-34, 51, 10.5], [-44.8, 46.5, 11.12], [-49.3, 35.7, 11.75], [-44.8, 24.9, 12.38], [-34, 20.4, 13], [-22.1, 20.4, 13.4], [51, 20.4, 16], [115.6, 20.4, 18.6], [127.5, 20.4, 19], [138.3, 15.9, 19.62], [142.8, 5.1, 20.25], [138.3, -5.7, 20.88], [127.5, -10.2, 21.5], [115.6, -10.2, 21.9], [51, -10.2, 24.5], [-13.6, -10.2, 26.6], [-25.5, -10.2, 27], [-36.3, -14.7, 27.62], [-40.8, -25.5, 28.25], [-36.3, -36.3, 28.88], [-25.5, -40.8, 29.5], [-13.6, -40.8, 29.9], [51, -40.8, 32], [127.5, -49.3, 35], [178.5, -85, 38], [181.9, -144.5, 40], [127.5, -182.8, 39.5], [34, -197.2, 36], [-68, -188.7, 30], [-144.5, -161.5, 24], [-197.2, -102, 17], [-222.7, -25.5, 11], [-222.7, 51, 6], [-197.2, 114.8, 2], [-153, 144.5, 0]];
const STARS = [[-200, 180, 0], [-60, 180, 0], [80, 180, 0], [186, 160, 2], [244, 92, 5.5], [238, 18, 8],
  ...helix(170, -40, 55, 10, 10, 0, Math.PI * 2.5, Math.PI / 4),
  [60, -118, 22], [-8, -126, 21], [-130, -138, 17], [-232, -96, 12], [-276, 60, 5], [-262, 126, 2]];

const JUNGLE = [[-170, 180], [-40, 180], [80, 180], [170, 165], [215, 120], [222, 60], [222, 0], [209.7, -34.7], [180, -47], [150.3, -34.7], [138, -5], [138, 60], [118, 100], [60, 110], [-20, 105], [-80, 90], [-105, 55], [-110, 0], [-122.3, -34.7], [-152, -47], [-181.7, -34.7], [-194, -5], [-194, 50], [-200, 110], [-215, 155]];
const SAVANNA = [[-170, 174.2], [-51, 174.2], [68, 174.2], [187, 154.7], [246.5, 85], [255, 0], [229.5, -93.5], [174.2, -136], [140.2, -153], [136, -187], [136, -221], [126.1, -245.1], [102, -255], [77.9, -245.1], [68, -221], [68, -170], [51, -127.5], [21.2, -93.5], [8.5, -51], [8.5, 17], [8.5, 51], [-1.4, 75.1], [-25.5, 85], [-49.6, 75.1], [-59.5, 51], [-59.5, 0], [-63.8, -76.5], [-93.5, -127.5], [-170, -146.2], [-229.5, -93.5], [-255, 0], [-242.2, 93.5], [-212.5, 153]];
// Cloud islands: a figure eight in the sky – the high loop flies over the low one, two jumps across open air.
const SKY = [[-200, 170, 0], [-70, 170, 0], [60, 170, 1], [160, 150, 3], [220, 90, 6], [230, 10, 9], [190, -60, 12], [110, -90, 14], [30, -60, 15], [-10, 10, 15],
  [-80, 80, 14], [-160, 60, 12], [-230, -20, 9], [-220, -120, 6], [-140, -170, 4], [-40, -160, 2], [40, -120, 1], [70, -30, 1], [60, 40, 1], [0, 100, 0],
  [-120, 115, 0], [-215, 108, 0], [-282, 122, 0], [-284, 163, 0]];
const SAKURA = [[0, 170], [120, 175], [200, 140], [230, 70], [200, 10], [140, -10], [110, -60], [140, -120], [210, -150], [230, -210], [170, -250], [80, -235],
  [30, -180], [-20, -120], [-90, -110], [-150, -160], [-220, -150], [-250, -80], [-210, -20], [-140, 18], [-185, 72], [-230, 130], [-150, 175]];
// Moon base: rolling regolith on stilts, three long low-gravity jumps over craters.
const MOON = [[-180, 160, 0], [-40, 165, 0], [100, 160, 2], [190, 120, 5], [230, 40, 8], [210, -50, 10], [150, -110, 10], [60, -120, 8], [0, -60, 6],
  [-60, -10, 6], [-120, -50, 8], [-150, -130, 10], [-230, -150, 9], [-280, -80, 6], [-270, 30, 3], [-240, 120, 1]];
const FOREST = [[-170, 175], [-40, 175], [90, 175], [180, 150], [225, 85], [215, 10], [170, -40], [100, -60], [62, -100], [70, -170], [20, -222], [-60, -218], [-112, -160], [-104, -95], [-130, -40], [-175, -12], [-200, -30], [-200, -80], [-200, -110], [-211.7, -138.3], [-240, -150], [-268.3, -138.3], [-280, -110], [-280, -40], [-282, 40], [-268, 118], [-228, 165]];

export const MAPS = Object.freeze([
  {
    id: 'coast', index: 0, name: 'Riviera Küstenring', subtitle: 'Meerblick · Palmen · schnelle Bögen an der Steilküste',
    width: 11, theme: 'day', unlockXP: 0, botScale: 1,
    nodes: [[0, 150], [110, 158], [205, 132], [252, 62], [236, -8], [178, -34], [138, -96], [156, -168], [96, -222],
      [4, -206], [-54, -150], [-118, -192], [-198, -176], [-246, -96], [-214, -20], [-252, 58], [-206, 128], [-108, 158]],
    parTimes: { gold: 232, silver: 262, bronze: 300 },
    boostPads: [0.02, 0.36, 0.7],
    sectors: [{ name: 'Strandpromenade', t: 0 }, { name: 'Leuchtturm-Kehre', t: 0.34 }, { name: 'Klippenbogen', t: 0.67 }],
  },
  {
    id: 'canyon', index: 1, name: 'Canyon Sunset', subtitle: 'Rote Tafelberge · Sanddünen · Sonnenuntergang',
    width: 10, theme: 'desert', unlockXP: 0, botScale: 1.06,
    nodes: [[0, 168], [138, 172], [228, 112], [198, 32], [252, -48], [214, -150], [112, -186], [58, -112], [-22, -132],
      [-74, -212], [-172, -202], [-234, -124], [-184, -44], [-244, 38], [-204, 140], [-104, 182]],
    parTimes: { gold: 245, silver: 278, bronze: 320 },
    boostPads: [0.025, 0.4, 0.74],
    sectors: [{ name: 'Mesa-Gerade', t: 0 }, { name: 'Dünen-Schikane', t: 0.33 }, { name: 'Felsbogen-Finale', t: 0.66 }],
  },
  {
    id: 'neon', index: 2, name: 'Neon Boulevard', subtitle: 'Nachtrennen · nasse Straßen · Häuserschluchten',
    width: 10.4, theme: 'night', unlockXP: 0, botScale: 1.12,
    nodes: [[0, 172], [150, 172], [184, 140], [184, 44], [152, 12], [64, 12], [32, -20], [32, -118], [64, -150], [160, -150],
      [206, -178], [214, -222], [180, -254], [-150, -254], [-198, -230], [-206, -190], [-200, -66], [-162, -34], [-104, -34], [-72, -2],
      [-72, 120], [-40, 164]],
    parTimes: { gold: 262, silver: 296, bronze: 340 },
    boostPads: [0.05, 0.42, 0.66],
    sectors: [{ name: 'Boulevard', t: 0 }, { name: 'Hafenviertel', t: 0.36 }, { name: 'Downtown-Finale', t: 0.68 }],
  },
  // ---- 3D circuits: nodes are [x, z, height] ----
  {
    id: 'volcano', index: 3, name: 'Vulkan Inferno', subtitle: 'Lavaflüsse · Achterbahn-Viadukt · Sprung über die Glut',
    width: 10.4, theme: 'volcano', unlockXP: 0, botScale: 1.14, deck: 'pillars',
    nodes: VOLCANO,
    jumps: [{ at: [326, -40], gap: 13 }],
    parTimes: { gold: 301, silver: 340, bronze: 389 },
    boostPads: [],
    sectors: [{ name: 'Glutkessel', t: 0 }, { name: 'Lava-Viadukt', t: 0.3 }, { name: 'Ascheabfahrt', t: 0.66 }],
  },
  {
    id: 'glacier', index: 4, name: 'Gletscherpass', subtitle: 'Serpentinen · Gipfelsprünge · Schneesturm',
    width: 10.4, theme: 'snow', unlockXP: 0, botScale: 1.16, deck: 'terrain',
    nodes: GLACIER,
    jumps: [{ at: [-102, -180], gap: 0 }, { at: [-223, -17], gap: 0 }],
    parTimes: { gold: 302, silver: 341, bronze: 390 },
    boostPads: [],
    sectors: [{ name: 'Talstation', t: 0 }, { name: 'Serpentinen', t: 0.22 }, { name: 'Gipfelabfahrt', t: 0.62 }],
  },
  {
    id: 'stars', index: 5, name: 'Sternenbahn', subtitle: 'Regenbogenstraße im All · Spirale · Sprünge ins Nichts',
    width: 10.8, theme: 'space', unlockXP: 0, botScale: 1.18, deck: 'float',
    nodes: STARS,
    jumps: [{ at: [-8, -126], gap: 15 }, { at: [-276, 60], gap: 12 }],
    parTimes: { gold: 260, silver: 294, bronze: 336 },
    boostPads: [],
    sectors: [{ name: 'Startrampe', t: 0 }, { name: 'Sternenspirale', t: 0.3 }, { name: 'Kometensturz', t: 0.66 }],
  },
  // ---- Offroad circuits: shortcuts cut through rough ground. Fast with a mushroom or an offroad kart. ----
  {
    id: 'jungle', index: 6, name: 'Dschungel-Tempel', subtitle: 'Zwei Abkürzungen durch Tempelruinen und Sumpf',
    width: 10.6, theme: 'jungle', unlockXP: 0, botScale: 1.1,
    nodes: JUNGLE,
    shortcuts: [{ path: [[222, 42], [196, 30], [164, 30], [138, 42]], width: 8, surface: 'mud' }, { path: [[-110, 30], [-136, 18], [-168, 18], [-194, 30]], width: 8, surface: 'mud' }],
    parTimes: { gold: 206, silver: 233, bronze: 266 },
    boostPads: [],
    sectors: [{ name: 'Lianenallee', t: 0 }, { name: 'Tempelkehre', t: 0.25 }, { name: 'Sumpfschleife', t: 0.6 }],
  },
  {
    id: 'savanna', index: 7, name: 'Savannen-Safari', subtitle: 'Weite Bögen · Staubpisten quer durchs Grasland',
    width: 11.5, theme: 'savanna', unlockXP: 0, botScale: 1.12,
    nodes: SAVANNA,
    shortcuts: [{ path: [[136, -174.2], [117.3, -185.3], [86.7, -185.3], [68, -174.2]], width: 9, surface: 'dirt' }, { path: [[8.5, 18.7], [-10.2, 30.6], [-40.8, 30.6], [-59.5, 18.7]], width: 9, surface: 'dirt' }],
    parTimes: { gold: 287, silver: 324, bronze: 370 },
    boostPads: [],
    sectors: [{ name: 'Akazienallee', t: 0 }, { name: 'Elefantenpfad', t: 0.3 }, { name: 'Löwenfelsen', t: 0.62 }],
  },
  {
    id: 'forest', index: 8, name: 'Pilzwald', subtitle: 'Riesenpilze · Waldlichtungen · Abkürzung über die Wiese',
    width: 10.4, theme: 'forest', unlockXP: 0, botScale: 1.14,
    nodes: FOREST,
    shortcuts: [{ path: [[98, -62], [60, -55], [20, -70], [-30, -85], [-70, -80], [-104, -92]], width: 8.5, surface: 'grass' }, { path: [[-200, -72], [-222, -84], [-258, -84], [-280, -72]], width: 8, surface: 'grass' }],
    parTimes: { gold: 260, silver: 294, bronze: 336 },
    boostPads: [],
    sectors: [{ name: 'Fliegenpilz-Allee', t: 0 }, { name: 'Moosgrund', t: 0.35 }, { name: 'Lichtung', t: 0.7 }],
  },
  // ---- Season 2 ----
  {
    id: 'sky', index: 9, name: 'Wolkeninseln', subtitle: 'Schwebende Inseln · Brücke über die eigene Strecke · Sprünge durch die Wolken',
    width: 10.8, theme: 'sky', unlockXP: 0, botScale: 1.16, deck: 'float',
    nodes: SKY,
    jumps: [{ at: [-226, -70], gap: 14 }, { at: [62, -60], gap: 12 }],
    parTimes: { gold: 313, silver: 353, bronze: 404 },
    boostPads: [],
    sectors: [{ name: 'Himmelstor', t: 0 }, { name: 'Wolkenbrücke', t: 0.33 }, { name: 'Sturzflug', t: 0.66 }],
  },
  {
    id: 'sakura', index: 10, name: 'Kirschblütental', subtitle: 'Torii-Tore · Pagode am See · Abkürzung durch den Bambushain',
    width: 10.6, theme: 'sakura', unlockXP: 0, botScale: 1.14,
    nodes: SAKURA,
    shortcuts: [{ path: [[-118, -128], [-150, -112], [-182, -78], [-212, -30]], width: 8.5, surface: 'grass' }],
    parTimes: { gold: 262, silver: 295, bronze: 337 },
    boostPads: [],
    sectors: [{ name: 'Blütenallee', t: 0 }, { name: 'Pagodenkurven', t: 0.36 }, { name: 'Bambushain', t: 0.66 }],
  },
  {
    id: 'moon', index: 11, name: 'Mondbasis Luna', subtitle: 'Wenig Schwerkraft · Kratersprünge · Kuppeln und Erde am Horizont',
    width: 10.8, theme: 'moon', unlockXP: 0, botScale: 1.18, deck: 'pillars', gravity: .55,
    nodes: MOON,
    jumps: [{ at: [5, 165], gap: 18 }, { at: [-5, -58], gap: 14 }, { at: [-279, -22], gap: 16 }],
    parTimes: { gold: 214, silver: 241, bronze: 276 },
    boostPads: [],
    sectors: [{ name: 'Landeplatz', t: 0 }, { name: 'Kraterfeld', t: 0.35 }, { name: 'Dunkle Seite', t: 0.68 }],
  },
].map(normalizeMap));

function normalizeMap(map) {
  return Object.freeze({ ...map, deck: map.deck || 'flat', jumps: Object.freeze(map.jumps || []), shortcuts: Object.freeze(map.shortcuts || []),
    width: +(map.width * WIDTH_SCALE).toFixed(2),
    nodes: Object.freeze(map.nodes.map(node => Object.freeze([node[0] * WORLD_SCALE, node[1] * WORLD_SCALE, node[2] || 0]))),
    boostPads: Object.freeze(map.boostPads || []),
    sectors: Object.freeze(map.sectors.map(sector => Object.freeze(sector))),
    parTimes: Object.freeze(map.parTimes),
  });
}

function catmull(nodes, i, u) {
  const n = nodes.length;
  const p0 = nodes[(i + n - 1) % n], p1 = nodes[i % n];
  const p2 = nodes[(i + 1) % n], p3 = nodes[(i + 2) % n];
  const u2 = u * u, u3 = u2 * u;
  const axis = a => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * u +
    (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * u2 +
    (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * u3);
  return { x: axis(0), z: axis(1), y: axis(2) };
}

function buildTrack(map) {
  // Arc-length resampling makes t usable for gates, AI, ranking and the minimap.
  const raw = Array.from({ length: map.nodes.length * 160 + 1 }, (_, i) =>
    catmull(map.nodes, Math.floor(i / 160), (i % 160) / 160));
  const rawLengths = [0];
  for (let i = 1; i < raw.length; i++) rawLengths.push(rawLengths[i - 1] +
    Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  const rawLength = rawLengths.at(-1);
  let rawIndex = 1;
  const count = Math.max(640, Math.round(rawLength / 1.25));
  const points = Object.freeze(Array.from({ length: count }, (_, i) => {
    const d = rawLength * i / count;
    while (rawLengths[rawIndex] < d) rawIndex++;
    const a = raw[rawIndex - 1], b = raw[rawIndex];
    const u = (d - rawLengths[rawIndex - 1]) / (rawLengths[rawIndex] - rawLengths[rawIndex - 1]);
    return Object.freeze({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: Math.max(0, a.y + (b.y - a.y) * u) });
  }));
  const lengths = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    lengths.push(lengths[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = lengths.at(-1);
  function sample(t) {
    const d = wrap(t) * length;
    let lo = 0, hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid + 1] <= d) lo = mid + 1; else hi = mid;
    }
    const a = points[lo], b = points[(lo + 1) % points.length];
    const u = (d - lengths[lo]) / (lengths[lo + 1] - lengths[lo]);
    const angle = Math.atan2(b.x - a.x, b.z - a.z);
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: a.y + (b.y - a.y) * u,
      angle, nx: Math.cos(angle), nz: -Math.sin(angle) };
  }
  function nearest(x, z) {
    let best = Infinity, result;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = a.x + dx * u, pz = a.z + dz * u;
      const ex = x - px, ez = z - pz, d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        const angle = Math.atan2(dx, dz);
        result = { x: px, z: pz, y: a.y + (b.y - a.y) * u, t: wrap((lengths[i] + Math.hypot(dx, dz) * u) / length),
          distance: Math.sqrt(d2), signedDistance: ex * Math.cos(angle) - ez * Math.sin(angle),
          angle, nx: Math.cos(angle), nz: -Math.sin(angle) };
      }
    }
    return result;
  }
  // Local search around a known track position: cheap enough for 8 cars per physics step.
  function nearestNear(x, z, t, span = 40) {
    if (!Number.isFinite(t)) return nearest(x, z);
    const n = points.length, c = Math.round(wrap(t) * n);
    let best = Infinity, result;
    for (let k = -span; k <= span; k++) {
      const i = ((c + k) % n + n) % n;
      const a = points[i], b = points[(i + 1) % n];
      const dx = b.x - a.x, dz = b.z - a.z;
      const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = a.x + dx * u, pz = a.z + dz * u;
      const ex = x - px, ez = z - pz, d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        const angle = Math.atan2(dx, dz);
        result = { x: px, z: pz, y: a.y + (b.y - a.y) * u, t: wrap((lengths[i] + Math.hypot(dx, dz) * u) / length),
          distance: Math.sqrt(d2), signedDistance: ex * Math.cos(angle) - ez * Math.sin(angle),
          angle, nx: Math.cos(angle), nz: -Math.sin(angle) };
      }
    }
    // Fall back to a full search if the car somehow left the local window.
    return best > 400 ? nearest(x, z) : result;
  }
  // Signed heading change over the next `metres` – used by the AI for braking and racing lines.
  function curvature(t, metres) {
    const a = sample(t), b = sample(t + metres / length);
    return Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle));
  }
  // Height of the road (without ramps) and its gradient.
  function heightAt(t) {
    const d = wrap(t) * length, i = Math.min(points.length - 1, Math.floor(d / length * points.length));
    let lo = i; while (lo > 0 && lengths[lo] > d) lo--; while (lo < points.length - 1 && lengths[lo + 1] <= d) lo++;
    const a = points[lo], b = points[(lo + 1) % points.length], u = (d - lengths[lo]) / Math.max(1e-6, lengths[lo + 1] - lengths[lo]);
    return a.y + (b.y - a.y) * u;
  }
  const slopeAt = t => (heightAt(t + 2 / length) - heightAt(t - 2 / length)) / 4;
  // Jump ramps: the lip sits at t; the 6 m before it rise to RAMP_H. After the lip a gap (no road) may follow.
  const jumps = map.jumps.map(j => { const n = nearest(j.at[0], j.at[1]); return Object.freeze({ t: n.t, gap: j.gap }); });
  const rampLift = t => { for (const j of jumps) { const ds = (wrap(t - j.t + .5) - .5) * length; if (ds > -RAMP_LEN && ds <= 0) return RAMP_H * (1 + ds / RAMP_LEN); } return 0; };
  const inGap = t => jumps.some(j => { const ds = (wrap(t - j.t + .5) - .5) * length; return j.gap > 0 && ds > 0 && ds < j.gap; });
  // Offroad shortcuts: corridors that leave the road at tA and rejoin at tB. Progress inside a corridor
  // is mapped linearly from tA to tB, so lap counting stays continuous and the cut really saves time.
  const shortcuts = map.shortcuts.map((sc, k) => {
    const a = nearest(sc.path[0][0], sc.path[0][1]), b = nearest(sc.path.at(-1)[0], sc.path.at(-1)[1]);
    const ctrl = [[a.x, a.z, 0], ...sc.path.slice(1, -1).map(p => [p[0], p[1], 0]), [b.x, b.z, 0]];
    // open Catmull-Rom through the control points (ends duplicated)
    const ext = [ctrl[0], ...ctrl, ctrl.at(-1)], raw = [];
    for (let i = 1; i < ext.length - 2; i++) for (let j = 0; j < 24; j++) {
      const u = j / 24, p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2], u2 = u * u, u3 = u2 * u;
      const ax = q => .5 * (2 * p1[q] + (-p0[q] + p2[q]) * u + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * u2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * u3);
      raw.push({ x: ax(0), z: ax(1) });
    }
    raw.push({ x: b.x, z: b.z });
    const cum = [0]; for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
    const len = cum.at(-1), span = wrap(b.t - a.t), ya = a.y, yb = b.y;
    const pts = raw.map((p, i) => Object.freeze({ ...p, u: cum[i] / len, y: ya + (yb - ya) * cum[i] / len }));
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    return Object.freeze({ index: k, tA: a.t, tB: b.t, span, len, width: sc.width, surface: sc.surface || 'dirt', pts, box: [x0 - sc.width, x1 + sc.width, z0 - sc.width, z1 + sc.width] });
  });
  // Nearest corridor point (or null when far from every shortcut).
  function shortcutAt(x, z) {
    let best = null, bd = Infinity;
    for (const sc of shortcuts) {
      if (x < sc.box[0] || x > sc.box[1] || z < sc.box[2] || z > sc.box[3]) continue;
      for (let i = 0; i < sc.pts.length - 1; i++) {
        const a = sc.pts[i], b = sc.pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-6;
        const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1), px = a.x + dx * u, pz = a.z + dz * u, d = Math.hypot(x - px, z - pz);
        if (d < bd) { bd = d; const angle = Math.atan2(dx, dz), uu = a.u + (b.u - a.u) * u;
          best = { sc, x: px, z: pz, y: a.y + (b.y - a.y) * u, u: uu, distance: d, angle, nx: Math.cos(angle), nz: -Math.sin(angle),
            signedDistance: (x - px) * Math.cos(angle) - (z - pz) * Math.sin(angle), t: wrap(sc.tA + uu * sc.span) }; }
      }
    }
    return best;
  }
  const sampleShortcut = (sc, u) => { u = clamp(u, 0, 1); const i = Math.min(sc.pts.length - 2, Math.floor(u * (sc.pts.length - 1)));
    let k = i; while (k > 0 && sc.pts[k].u > u) k--; while (k < sc.pts.length - 2 && sc.pts[k + 1].u < u) k++;
    const a = sc.pts[k], b = sc.pts[k + 1], f = (u - a.u) / Math.max(1e-6, b.u - a.u), angle = Math.atan2(b.x - a.x, b.z - a.z);
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f, angle, nx: Math.cos(angle), nz: -Math.sin(angle) }; };
  return Object.freeze({ ...map, points, length, sample, nearest, nearestNear, curvature, heightAt, slopeAt, jumps, rampLift, inGap, shortcuts, shortcutAt, sampleShortcut });
}

const TRACKS = new Map(MAPS.map(map => [map.id, buildTrack(map)]));
export function getTrack(id = 'coast') { return TRACKS.get(id) || TRACKS.get('coast'); }

// ---------- battle arena: a 44 m wide ring around a centre island, i.e. a round bowl with an island in the middle ----------
const ARENA_R = 32, ARENA_W = 44;
export const ARENA_MAP = normalizeMap({
  id: 'arena', index: 98, name: 'Neon-Arena', subtitle: 'Ballon-Battle · 8 Fahrer · 3 Ballons · letzter Fahrer gewinnt',
  width: ARENA_W, theme: 'arena', unlockXP: 0, botScale: 1.04,
  nodes: Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return [+(Math.sin(a) * ARENA_R).toFixed(2), +(Math.cos(a) * ARENA_R).toFixed(2), 0]; }),
  arena: { x: 0, z: 0, inner: ARENA_R - ARENA_W / 2, outer: ARENA_R + ARENA_W / 2 },
  parTimes: { gold: 999, silver: 999, bronze: 999 }, boostPads: [], sectors: [{ name: 'Arena', t: 0 }],
});
TRACKS.set(ARENA_MAP.id, buildTrack(ARENA_MAP));

// ---------- player-built tracks (editor) ----------
export const CUSTOM_ID = 'custom';
export const CUSTOM_THEMES = Object.freeze(['day', 'desert', 'night', 'volcano', 'snow', 'space', 'jungle', 'savanna', 'forest', 'sky', 'sakura', 'moon']);
const r1 = v => Math.round(v * 10) / 10;
// Editor definition → a full map entry. def = { name, theme, nodes: [[x, z, y]], jumps: [{ node, gap }] }
export function customMapFromDef(def) {
  const theme = CUSTOM_THEMES.includes(def.theme) ? def.theme : 'day';
  const nodes = def.nodes.map(n => [r1(n[0]), r1(n[1]), Math.max(0, r1(n[2] || 0))]);
  const lifted = nodes.some(n => n[2] > .3);
  const deck = theme === 'space' || theme === 'sky' ? 'float' : !lifted ? 'flat' : theme === 'snow' ? 'terrain' : 'pillars';
  const jumps = (def.jumps || []).filter(j => nodes[j.node]).map(j => ({ at: [nodes[j.node][0], nodes[j.node][1]], gap: Math.max(0, Math.min(18, Math.round(j.gap || 0))) }));
  let len = 0; for (let i = 0; i < nodes.length; i++) { const a = nodes[i], b = nodes[(i + 1) % nodes.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const lap = len / 19.5 * 3;
  return { id: CUSTOM_ID, index: 99, name: String(def.name || 'Eigene Strecke').slice(0, 40), subtitle: 'Eigene Strecke · gebaut im Editor',
    width: 10.6, theme, unlockXP: 0, botScale: 1.1, deck, nodes, jumps, shortcuts: [], custom: true,
    parTimes: { gold: Math.round(lap * 1.06), silver: Math.round(lap * 1.2), bronze: Math.round(lap * 1.38) },
    boostPads: [], sectors: [{ name: 'Start', t: 0 }, { name: 'Mitte', t: .33 }, { name: 'Finale', t: .66 }] };
}
export function buildCustomTrack(def) { const map = normalizeMap(customMapFromDef(def)); return { map, track: buildTrack(map) }; }
export function registerCustomTrack(def) { const built = buildCustomTrack(def); TRACKS.set(CUSTOM_ID, built.track); return built; }

// Quality check used by the editor: overlaps, tight turns, steep slopes, length.
export function analyzeTrack(T) {
  const P = T.points, n = P.length, L = T.length, conflicts = [], tight = [];
  let minR = Infinity, maxSlope = 0;
  for (let i = 0; i < n; i += 2) {
    const c = Math.abs(T.curvature(i / n, 6)), R = 6 / Math.max(c, 1e-6);
    if (R < minR) minR = R;
    if (R < 8) tight.push({ x: P[i].x, z: P[i].z });
    maxSlope = Math.max(maxSlope, Math.abs(T.slopeAt(i / n)));
  }
  for (let i = 0; i < n; i += 3) for (let j = i + 3; j < n; j += 3) {
    if (Math.min(j - i, n - (j - i)) * L / n < 40) continue;
    const a = P[i], b = P[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < T.width + 5 && Math.abs(a.y - b.y) < 6) conflicts.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  }
  const badJumps = T.jumps.filter(j => Math.abs(T.curvature(j.t - 15 / L, 30)) > .35).length;
  return { length: L, minRadius: minR, maxSlope, conflicts, tight, badJumps };
}

// Share codes: "APX1-" + base64url(JSON). Unicode-safe for track names.
export function encodeTrackCode(def) {
  const data = { v: 1, n: def.name, t: def.theme, p: def.nodes.map(n => [r1(n[0]), r1(n[1]), r1(n[2] || 0)]), j: (def.jumps || []).map(j => [j.node, j.gap]) };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return 'APX1-' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeTrackCode(code) {
  const m = String(code || '').trim().match(/^APX1-([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('Kein gültiger Strecken-Code (er beginnt mit APX1-).');
  const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  const nodes = Array.isArray(data.p) ? data.p.filter(p => Array.isArray(p) && p.slice(0, 3).every(Number.isFinite)).slice(0, 80) : [];
  if (nodes.length < 4) throw new Error('Die Strecke braucht mindestens 4 Punkte.');
  const clampXZ = v => Math.max(-600, Math.min(600, v));
  return { name: String(data.n || 'Geteilte Strecke').slice(0, 40), theme: CUSTOM_THEMES.includes(data.t) ? data.t : 'day',
    nodes: nodes.map(p => [clampXZ(p[0]), clampXZ(p[1]), Math.max(0, Math.min(40, p[2] || 0))]),
    jumps: (Array.isArray(data.j) ? data.j : []).filter(j => Array.isArray(j) && Number.isInteger(j[0]) && j[0] >= 0 && j[0] < nodes.length).map(j => ({ node: j[0], gap: Math.max(0, Math.min(18, +j[1] || 0)) })) };
}
