// Story missions: six chapters, three tasks each, then a boss. Positions are written in world metres and snapped to the roads.
import { VOLCANO, LAKE } from './island.js';

export const CHAPTERS = [
  { id: 'city', n: 1, name: 'Port Apex', line: 'Das Phantom-Syndikat hat die Insel übernommen. Hol dir zuerst den Hafen zurück.', color: '#ff6a3d' },
  { id: 'beach', n: 2, name: 'Sonnenküste', line: 'An der Küste lauert etwas Großes im Wasser.', color: '#ffd04a' },
  { id: 'jungle', n: 3, name: 'Smaragdwald', line: 'Im Dschungel haben sie einen alten Tempel geweckt.', color: '#3ad070' },
  { id: 'canyon', n: 4, name: 'Rostcanyon', line: 'Unter dem Sand bewegt sich etwas.', color: '#e0703a' },
  { id: 'glacier', n: 5, name: 'Frostgipfel', line: 'Das Syndikat hat am Gletscher eine Kampfmaschine gebaut.', color: '#8ad8ff' },
  { id: 'volcano', n: 6, name: 'Glutberg', line: 'Phantom wartet am Vulkan. Das Finale.', color: '#ff3a1a' },
];

// kinds: rings · smash · collect · chase · escape · race · avalanche · worm · boss
export const MISSIONS = [
  // ---------- 1 · Port Apex ----------
  { id: 'c1a', ch: 'city', kind: 'rings', name: 'Hafen-Sprint', icon: '🏁', line: 'Alle Ringe durch die Stadt, gegen die Uhr.',
    route: [['ring', [-235, 560], [115, 600]], ['city3', [115, 600], [110, 385]]], spacing: 55, tight: 1.06 },
  { id: 'c1b', ch: 'city', kind: 'smash', name: 'Container-Chaos', icon: '💥', line: 'Ramm alle Phantom-Kisten am Hafen.',
    area: { x: 0, z: 672, rx: 230, rz: 26 }, count: 16, time: 62, start: ['docks', [-250, 650], 1] },
  { id: 'c1c', ch: 'city', kind: 'chase', name: 'Der Kurier', icon: '🎯', line: 'Ramm den Kurier dreimal, bevor er entkommt.',
    loop: [['ring', [-110, 585], [110, 600]], ['city3', [110, 600], [110, 470]], ['city1', [110, 470], [-110, 470]], ['city2', [-110, 470], [-110, 585]]],
    hits: 3, time: 75, target: { kart: 'flitzer', avatar: 'jax', color: '#2ad8ff', speed: .93 } },
  { id: 'c1x', ch: 'city', kind: 'race', boss: true, name: 'VIKTOR', title: 'Der Hafenkönig', icon: '👑', line: 'Insel-Sprint gegen Viktor. Er kippt Öl auf die Straße.',
    route: [['avenue', [0, 600], [10, 0]], ['west', [10, 0], [-600, 262]], ['ring', [-600, 262], [0, 612]]],
    rival: { kart: 'brummer', avatar: 'viktor', color: '#c8242a', speed: 1.0, ability: 'oil' } },

  // ---------- 2 · Sonnenküste ----------
  { id: 'c2a', ch: 'beach', kind: 'collect', name: 'Sternenstrand', icon: '⭐', line: 'Sammle alle Sterne, auch die in der Luft.',
    area: { x: 460, z: 470, r: 110 }, count: 16, air: 5, time: 58, start: ['beach', [290, 560], 1] },
  { id: 'c2b', ch: 'beach', kind: 'rings', name: 'Küstenpromenade', icon: '🏁', line: 'Am Strand entlang und die Küste hoch.',
    route: [['beach', [290, 560], [600, 420]], ['ring', [590, 385], [672, -60]]], spacing: 60, tight: 1.05 },
  { id: 'c2c', ch: 'beach', kind: 'escape', name: 'Drohnenalarm', icon: '🛸', line: 'Drei Phantom-Drohnen jagen dich. Halte 45 Sekunden durch.',
    area: { x: 470, z: 450, r: 170 }, time: 45, drones: 3, start: ['ring', [430, 525], 1] },
  { id: 'c2x', ch: 'beach', kind: 'boss', boss: 'kraken', name: 'KRAKE', title: 'Schrecken der Bucht', icon: '🐙', line: 'Sammle Torpedos aus den Kisten und triff den Kopf, wenn er auftaucht.',
    arena: { x: 444, z: 528, r: 50 } },

  // ---------- 3 · Smaragdwald ----------
  { id: 'c3a', ch: 'jungle', kind: 'rings', name: 'Dschungelpfad', icon: '🏁', line: 'Die Schleife durch den Urwald, gegen die Uhr.',
    route: [['west', [-200, 50], [-420, 140]], ['jungle', [-420, 140], [-480, 215], 'fw']], spacing: 50, tight: 1.06 },
  { id: 'c3b', ch: 'jungle', kind: 'smash', name: 'Phantom-Totems', icon: '🗿', line: 'Zehn Totems stecken im Wald. Find und ramm sie alle.',
    area: { x: -520, z: 130, r: 150 }, count: 10, time: 95, offroad: true, start: ['west', [-420, 140], 1] },
  { id: 'c3c', ch: 'jungle', kind: 'chase', name: 'Der Schmuggler', icon: '🎯', line: 'Der Schmuggler-Buggy ist schnell im Gelände. Dreimal rammen.',
    loop: [['jungle', 0, .995, 'fw']],
    hits: 3, time: 80, target: { kart: 'buggy', avatar: 'diego', color: '#3ad070', speed: .95 } },
  { id: 'c3x', ch: 'jungle', kind: 'boss', boss: 'golem', name: 'TEMPELGOLEM', title: 'Wächter aus Stein', icon: '🗿', line: 'Weich den Schlägen aus. Wenn sein Kern glüht: feuern!',
    arena: { x: -505, z: 235, r: 46 } },

  // ---------- 4 · Rostcanyon ----------
  { id: 'c4a', ch: 'canyon', kind: 'rings', name: 'Canyon-Lauf', icon: '🏁', line: 'Durch die Schlucht, während Felsen herabstürzen.',
    route: [['east', [220, -25], [672, -60]], ['ring', [672, -60], [665, 160]]], spacing: 55, tight: 1.05, hazard: 'rocks' },
  { id: 'c4b', ch: 'canyon', kind: 'collect', name: 'Wüstenschätze', icon: '⭐', line: 'Sterne zwischen den Tafelbergen.',
    area: { x: 560, z: -60, r: 140 }, count: 16, air: 3, time: 70, start: ['east', [400, -95], 1] },
  { id: 'c4c', ch: 'canyon', kind: 'chase', name: 'Wüstenfuchs', icon: '🎯', line: 'Der Wüstenfuchs fährt Bestzeit. Dreimal rammen.',
    loop: [['east', [400, -95], [672, -60]], ['ring', [672, -60], [610, -230]], ['ring', [610, -230], [480, -190]]],
    hits: 3, time: 80, open: true, target: { kart: 'drifter', avatar: 'lena', color: '#ff8a2a', speed: .97 } },
  { id: 'c4x', ch: 'canyon', kind: 'worm', boss: true, name: 'SANDWURM', title: 'König der Wüste', icon: '🪱', line: 'Er jagt dich durch den Canyon. Erreiche das Ziel!',
    route: [['east', [10, 0], [672, -60]], ['ring', [672, -60], [665, 160]]] },

  // ---------- 5 · Frostgipfel ----------
  { id: 'c5a', ch: 'glacier', kind: 'rings', name: 'Gipfelpass', icon: '🏁', line: 'Über den Pass, hoch und wieder runter.',
    route: [['glacier', [-200, -120], [-300, -560]], ['ring', [-300, -560], [-650, -170]]], spacing: 60, tight: 1.06 },
  { id: 'c5b', ch: 'glacier', kind: 'avalanche', name: 'Lawine!', icon: '🌨', line: 'Eine Lawine rollt hinter dir den Berg runter. Gas!',
    route: [['ring', [-430, -495], [-300, -560]], ['glacier', [-300, -560], [-200, 50]]] },
  { id: 'c5c', ch: 'glacier', kind: 'collect', name: 'Eiskristalle', icon: '💎', line: 'Kristalle auf dem gefrorenen See. Es ist glatt!',
    area: { x: LAKE.x, z: LAKE.z, r: LAKE.r - 8 }, count: 14, air: 0, time: 50, start: ['glacier', [-160, -250], 1] },
  { id: 'c5x', ch: 'glacier', kind: 'boss', boss: 'mech', name: 'FROST-MECH', title: 'Die Eisfestung', icon: '🤖', line: 'Lock ihn in einen Sturmangriff. Wenn er feststeckt: feuern!',
    arena: { x: LAKE.x, z: LAKE.z, r: LAKE.r - 4 } },

  // ---------- 6 · Glutberg ----------
  { id: 'c6a', ch: 'volcano', kind: 'rings', name: 'Lavalauf', icon: '🏁', line: 'Den Vulkan hoch, während Lavabrocken einschlagen.',
    route: [['volcano', 0, .97]], spacing: 60, tight: 1.07, hazard: 'lava' },
  { id: 'c6b', ch: 'volcano', kind: 'smash', name: 'Phantom-Generatoren', icon: '⚡', line: 'Acht Generatoren am Hang. Zerstör sie alle.',
    area: { x: VOLCANO.x, z: VOLCANO.z, r: 200, minR: 95 }, count: 8, time: 100, offroad: true, start: ['ring', [300, -160], 1] },
  { id: 'c6c', ch: 'volcano', kind: 'race', boss: true, name: 'PHANTOM', title: 'Der Anführer', icon: '👻', line: 'Bis zum Krater. Phantom legt Minen und wird unsichtbar.',
    route: [['ring', [130, -250], [480, -190]], ['volcano', 0, .97]], rival: { kart: 'bolide', avatar: 'phantom', color: '#6a3aff', speed: 1.03, ability: 'mines' } },
  { id: 'c6x', ch: 'volcano', kind: 'boss', boss: 'dragon', final: true, name: 'MAGMA-DRACHE', title: 'Herz des Vulkans', icon: '🐉', line: 'Das Finale. Wenn er landet: feuern!',
    arena: { x: VOLCANO.x, z: VOLCANO.z, r: 56, inner: VOLCANO.lavaR + 5 } },
];

export const missionById = id => MISSIONS.find(m => m.id === id);
export const chapterMissions = ch => MISSIONS.filter(m => m.ch === ch);
export const XP = { task: 150, boss: 500, final: 1500, star: 40 };

// ---------- unlock rules ----------
// chapter n is open once the boss of chapter n-1 is beaten; a chapter's final boss opens when its three tasks are done
export function openChapters(done) {
  const out = []; for (const c of CHAPTERS) { out.push(c.id); const last = chapterMissions(c.id).slice(-1)[0]; if (!done[last.id]) break; } return out;
}
export function missionOpen(m, done) {
  if (!openChapters(done).includes(m.ch)) return false;
  const list = chapterMissions(m.ch), i = list.indexOf(m);
  if (i < list.length - 1) {
    // the boss race of chapter 6 is the third "task", the dragon comes after it
    return true;
  }
  return list.slice(0, -1).every(q => done[q.id]);
}
export const storyDone = done => !!done.c6x;

// ---------- routes on the road network ----------
function nearestIdx(rd, x, z) { let best = 0, bd = 1e18; rd.pts.forEach((p, k) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = k; } }); return best; }
function segment(isl, roadId, from, to, force) {
  const rd = isl.roads.find(r => r.id === roadId), n = rd.pts.length;
  const a = typeof from === 'number' ? Math.round(from * (n - 1)) : nearestIdx(rd, from[0], from[1]);
  const b = typeof to === 'number' ? Math.round(to * (n - 1)) : nearestIdx(rd, to[0], to[1]);
  let dir = b >= a ? 1 : -1, count = Math.abs(b - a);
  if (rd.closed) { const fw = (b - a + n) % n; if (force === 'fw' || (!force && fw <= n / 2)) { dir = 1; count = fw; } else { dir = -1; count = n - fw; } }
  const out = []; for (let i = 0; i <= count; i++) { const p = rd.pts[((a + dir * i) % n + n) % n]; out.push({ x: p.x, y: p.y, z: p.z, hw: rd.hw }); }
  return out;
}
export function buildRoute(isl, segs) {
  const pts = [];
  for (const [id, a, b, f] of segs) { const s = segment(isl, id, a, b, f); if (pts.length) { const l = pts[pts.length - 1]; while (s.length && Math.hypot(s[0].x - l.x, s[0].z - l.z) < 2.5) s.shift(); } pts.push(...s); }
  let acc = 0; pts.forEach((p, k) => { if (k) acc += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z); p.s = acc; const q = pts[Math.min(pts.length - 1, k + 1)], o = pts[Math.max(0, k - 1)]; p.angle = Math.atan2(q.x - o.x, q.z - o.z); });
  return { pts, length: acc };
}
// position along a route (s in metres) → point
export function routeAt(route, s) {
  const P = route.pts; s = Math.max(0, Math.min(route.length, s));
  let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, angle: Math.atan2(b.x - a.x, b.z - a.z) || a.angle, hw: a.hw };
}
// progress of a car along a route: nearest point near the last known index
export function routeProgress(route, x, z, hint = 0) {
  const P = route.pts; let best = hint, bd = 1e18;
  for (let k = Math.max(0, hint - 40); k < Math.min(P.length, hint + 120); k++) { const d = (P[k].x - x) ** 2 + (P[k].z - z) ** 2; if (d < bd) { bd = d; best = k; } }
  return { k: best, s: P[best].s, d: Math.sqrt(bd) };
}
// mission start: where the player is put (route start, or a road point given in m.start)
export function missionStart(isl, m, route) {
  if (route) { const p = routeAt(route, 0), q = routeAt(route, 8); return { x: p.x, y: p.y, z: p.z, angle: Math.atan2(q.x - p.x, q.z - p.z) }; }
  if (m.start) { const [id, at, dir] = m.start, rd = isl.roads.find(r => r.id === id), k = nearestIdx(rd, at[0], at[1]), p = rd.pts[k]; return { x: p.x, y: p.y, z: p.z, angle: p.angle + (dir < 0 ? Math.PI : 0) }; }
  if (m.arena) { const A = m.arena, a = Math.atan2(-A.z, -A.x), d = A.r * .7, x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d; return { x, y: isl.ground(x, z), z, angle: Math.atan2(A.x - x, A.z - z) }; }
  return { ...isl.spawn };
}

// target speed at route position s: looks ahead for bends, keeps enough room to brake (lateral grip ~22 m/s², brakes ~18 m/s²)
export function routeSpeed(route, s, top) {
  let v = top; const a0 = routeAt(route, s).angle;
  for (const d of [8, 16, 26, 38, 52, 70]) {
    const p = routeAt(route, s + d), q = routeAt(route, s + d + 10), th = Math.abs(angDiff(q.angle, p.angle)) + 1e-4, R = 10 / th;
    const vc = Math.sqrt(22 * R), allowed = Math.sqrt(vc * vc + 2 * 18 * Math.max(0, d - 4)); if (allowed < v) v = allowed;
  }
  return Math.max(9, v);
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
// how long a clean, drift-free run takes (a quick simulation with the same physics) – the basis for the time limits
export function calibrate(isl, route, drive, kart = 'allround') {
  const { makeCar, stepCar, aiStep, TOP } = drive, c = makeCar({ kart }), s0 = routeAt(route, 0), s1 = routeAt(route, 8);
  Object.assign(c, { x: s0.x, z: s0.z, y: isl.ground(s0.x, s0.z), angle: Math.atan2(s1.x - s0.x, s1.z - s0.z) });
  let k = 0, t = 0;
  while (t < 600) { const pr = routeProgress(route, c.x, c.z, k); k = pr.k; if (pr.s >= route.length - 4) break; const a = routeAt(route, pr.s + 10 + c.speed * .35); stepCar(c, aiStep(c, a.x, a.z, routeSpeed(route, pr.s, TOP), .025), .025, isl); t += .025; }
  return t;
}
