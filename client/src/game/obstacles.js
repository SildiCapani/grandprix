// Moving obstacles: only on tracks where they fit the world.
// Everything is a pure function of the race clock, so every player (and the host's bots) sees the same thing online.
//   impact – something falls from the sky (cannonball, lava bomb, meteor). A red ring warns first.
//   cross  – something rolls / runs / flies across the road (boulder, rhino, snowball, hover car, whale).
//   zone   – one half of the road is dangerous for a moment (dragon fire, a kraken tentacle). It warns first.
// Positions are authored as [x, z] points like the rest of the track data and converted to track positions here.
const DEFS = {
  volcano: [{ type: 'impact', kind: 'lava', from: [165, 150], to: [318, 72], every: 5, warn: 1.7, count: 2, r: 2.6 }],
  canyon: [{ type: 'cross', kind: 'boulder', at: [214, -150], every: 7, dur: 3.4, r: 1.9 }, { type: 'cross', kind: 'boulder', at: [-184, -44], every: 8, dur: 3.4, r: 1.9, offset: 3 }],
  glacier: [{ type: 'cross', kind: 'snowball', at: [51, -40.8], every: 6.5, dur: 3, r: 2 }, { type: 'cross', kind: 'snowball', at: [-197.2, -102], every: 7, dur: 3, r: 2.2, offset: 2 }],
  jungle: [{ type: 'cross', kind: 'stoneball', at: [-20, 105], every: 7, dur: 3.2, r: 2.2 }, { type: 'cross', kind: 'stoneball', at: [222, 0], every: 8, dur: 3.2, r: 2.2, offset: 4 }],
  savanna: [{ type: 'cross', kind: 'rhino', at: [255, 0], every: 9, dur: 4.6, r: 1.9 }, { type: 'cross', kind: 'rhino', at: [-255, 0], every: 10, dur: 4.6, r: 1.9, offset: 5 }],
  moon: [{ type: 'impact', kind: 'meteor', from: [60, -120], to: [-150, -130], every: 6, warn: 1.8, count: 2, r: 2.4 }],
  pirate: [{ type: 'impact', kind: 'cannon', from: [205, 118], to: [210, -50], every: 4.6, warn: 1.6, count: 2, r: 2.4 },
    { type: 'zone', kind: 'tentacle', from: [232, -10], to: [231, -20], side: 'in', every: 7, warn: 1.4, dur: 1.6 }],
  candy: [{ type: 'cross', kind: 'donut', at: [90, 170], every: 6.5, dur: 3, r: 2.2 }, { type: 'cross', kind: 'donut', at: [-225, -188], every: 7, dur: 3, r: 2.2, offset: 3 },
    { type: 'cross', kind: 'gummy', at: [-10, 122], every: 9, dur: 5, r: 1.6, offset: 1 }],
  castle: [{ type: 'zone', kind: 'fire', from: [-172, -112], to: [-215, -144], side: 'alt', every: 7.5, warn: 1.6, dur: 1.8 },
    { type: 'zone', kind: 'fire', from: [-30, 168], to: [60, 162], side: 'alt', every: 9, warn: 1.6, dur: 1.6, offset: 4 }],
  arctic: [{ type: 'cross', kind: 'whale', at: [20, -100], every: 8, dur: 2.6, r: 2.6, arc: 3 }, { type: 'cross', kind: 'snowball', at: [-30, 176], every: 7, dur: 3, r: 2, offset: 2 }],
  rooftops: [{ type: 'cross', kind: 'hovercar', at: [110, -128], every: 5.5, dur: 2, r: 2, lift: 1.1 }, { type: 'cross', kind: 'hovercar', at: [-137, 46], every: 6.5, dur: 2, r: 2, lift: 1.1, offset: 3 }],
  galaxy: [{ type: 'impact', kind: 'meteor', from: [90, 182], to: [252, 0], every: 5, warn: 1.8, count: 2, r: 2.6 },
    { type: 'impact', kind: 'meteor', from: [-70, -205], to: [-160, -70], every: 5.5, warn: 1.8, count: 2, r: 2.6, offset: 2 }],
  // ocean cup: surf waves and a bouncing beach ball, jellyfish sinking onto the road and a sea turtle, black-smoker eruptions and a giant eel
  beach: [{ type: 'cross', kind: 'wave', at: [-80, 136], every: 7, dur: 3.2, r: 2.6 }, { type: 'cross', kind: 'wave', at: [30, 130], every: 8, dur: 3.2, r: 2.6, offset: 3.5 },
    { type: 'cross', kind: 'ball', at: [-100, -112], every: 6, dur: 2.6, r: 1.5, arc: 4, offset: 2 }],
  reef: [{ type: 'impact', kind: 'jelly', from: [-22, -182], to: [-182, -202], every: 5, warn: 1.9, count: 2, r: 2.2 },
    { type: 'cross', kind: 'turtle', at: [-60, 178], every: 9, dur: 5, r: 1.8, offset: 3 }],
  abyss: [{ type: 'zone', kind: 'vent', from: [40, -138], to: [-35, -126], side: 'alt', every: 6.5, warn: 1.4, dur: 1.6 },
    { type: 'cross', kind: 'eel', at: [-250, -40], every: 8, dur: 2.4, r: 2.2, lift: .6, offset: 3 }],
};

const wrap = v => ((v % 1) + 1) % 1;
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Converts a map's definitions into track positions (once per track).
export function buildObstacles(track) {
  const defs = DEFS[track.id] || [];
  return defs.map((d, i) => {
    const o = { ...d, index: i, offset: d.offset || 0 };
    if (d.at) o.t = track.nearest(d.at[0], d.at[1]).t;
    if (d.from) { o.tA = track.nearest(d.from[0], d.from[1]).t; o.span = wrap(track.nearest(d.to[0], d.to[1]).t - o.tA); if (o.span > .5) { o.tA = wrap(o.tA + o.span); o.span = 1 - o.span; } }
    return o;
  });
}

// Side of the road (+1 / -1) facing toward (in) or away from (out) the middle of the course.
function sideOf(track, t, which) {
  const s = track.sample(t), c = track.centre || { x: 0, z: 0 }, out = Math.sign((s.x - c.x) * s.nx + (s.z - c.z) * s.nz) || 1;
  return which === 'in' ? -out : out;
}

// Everything that is on (or about to hit) the road at `time`.
// Each hazard: { id, kind, type, x, y, z, r, hot (can hit now), warn (0…1 while warning), ...visual extras }
export function hazardsAt(track, obstacles, time) {
  const out = [], W = track.width, L = track.length;
  for (const o of obstacles) {
    const tt = time + o.offset, cycle = Math.floor(tt / o.every), ph = tt - cycle * o.every;
    if (o.type === 'impact') {
      for (let k = 0; k < o.count; k++) {
        const t = wrap(o.tA + o.span * hash(cycle * 7 + o.index, k)), s = track.sample(t), lane = (hash(cycle * 13 + o.index, k + 9) - .5) * (W - 2.4);
        const x = s.x + s.nx * lane, z = s.z + s.nz * lane, y = track.heightAt(t), delay = k * .45, p = ph - delay;
        if (p < 0 || p > o.warn + 1.1) continue;
        const warn = p < o.warn ? p / o.warn : 1, hot = p >= o.warn && p < o.warn + .35;
        out.push({ id: `${o.index}:${cycle}:${k}`, kind: o.kind, type: 'impact', x, y, z, r: o.r, hot, warn, fall: p < o.warn ? 1 - p / o.warn : 0, boom: p >= o.warn ? (p - o.warn) / 1.1 : 0, t, lane });
      }
    } else if (o.type === 'cross') {
      if (ph > o.dur) continue;
      const u = ph / o.dur, dir = cycle % 2 ? 1 : -1, reach = W / 2 + 9, lat = dir * (-reach + 2 * reach * u);
      const s = track.sample(o.t), y = track.heightAt(o.t), arc = o.arc ? Math.sin(u * Math.PI) * o.arc - o.arc * .35 : 0;
      const yy = y + (o.lift || 0) + arc;
      out.push({ id: `${o.index}:${cycle}`, kind: o.kind, type: 'cross', x: s.x + s.nx * lat, y: yy, z: s.z + s.nz * lat, r: o.r, hot: Math.abs(lat) < W / 2 + o.r * .5, warn: 0,
        heading: Math.atan2(s.nx * dir, s.nz * dir), roll: ph * 3.2, u, t: o.t, lane: lat, ground: y });
    } else if (o.type === 'zone') {
      if (ph > o.warn + o.dur) continue;
      const side = o.side === 'alt' ? (cycle % 2 ? 1 : -1) : o.side === 'in' || o.side === 'out' ? sideOf(track, o.tA + o.span / 2, o.side) : o.side || 1;
      const hot = ph >= o.warn, warn = hot ? 1 : ph / o.warn, n = Math.max(2, Math.round(o.span * L / 4.2));
      for (let k = 0; k <= n; k++) {
        const t = wrap(o.tA + o.span * k / n), s = track.sample(t), lane = side * W * .26;
        out.push({ id: `${o.index}:${cycle}:${k}`, kind: o.kind, type: 'zone', x: s.x + s.nx * lane, y: track.heightAt(t), z: s.z + s.nz * lane, r: W * .26, hot, warn, k, n, side, t, lane,
          life: hot ? (ph - o.warn) / o.dur : 0, angle: s.angle });
      }
    }
  }
  return out;
}

export const hasObstacles = id => !!DEFS[id];
