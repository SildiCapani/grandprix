// Kart classes, Mario-Kart style: every kart trades one strength for a weakness.
//  top   – top speed factor (straights)
//  accel – acceleration factor (restarts after hits, corner exits)
//  turn  – turning circle factor at speed (lower = tighter = better handling)
//  mass  – weight in collisions (heavy karts push light ones away)
//  drift – how fast power drifts charge their mini-turbos
//  offroad – share of top speed kept on rough ground (shortcuts) without a mushroom
// Lap times on a mixed track end up within about ±1.5 %: the right kart depends on the track.
export const KARTS = Object.freeze([
  { id: 'allround', name: 'Apex GT', tag: 'ALLROUNDER', desc: 'Ausgewogen in allem. Der beste Einstieg.',
    top: 1, accel: 1, turn: 1, mass: 1, drift: 1, offroad: .4 },
  { id: 'bolide', name: 'Thunder Bolide', tag: 'SPEED', desc: 'Höchste Endgeschwindigkeit. Träge in engen Kurven und beim Anfahren.',
    top: 1.035, accel: .8, turn: 1.3, mass: 1.1, drift: .9, offroad: .32 },
  { id: 'flitzer', name: 'Pixel Flitzer', tag: 'HANDLING', desc: 'Leicht und wendig, zieht blitzschnell los. Weniger Topspeed, wird leicht weggerammt.',
    top: .97, accel: 1.35, turn: .72, mass: .75, drift: 1.1, offroad: .45 },
  { id: 'brummer', name: 'Iron Brummer', tag: 'GEWICHT', desc: 'Schwerer Panzer: schiebt alle zur Seite. Langsam beim Beschleunigen.',
    top: 1.02, accel: .75, turn: 1.12, mass: 1.75, drift: .95, offroad: .55 },
  { id: 'drifter', name: 'Neon Drifter', tag: 'DRIFT', desc: 'Lädt Mini-Turbos viel schneller auf. Für Drift-Profis.',
    top: .985, accel: 1.05, turn: .9, mass: .95, drift: 1.4, offroad: .38 },
  { id: 'buggy', name: 'Rally Buggy', tag: 'OFFROAD', desc: 'Geländewagen mit Stollenreifen: fast volles Tempo im Gelände. Auf Asphalt etwas langsamer.',
    top: .965, accel: 1.15, turn: .98, mass: 1.05, drift: .95, offroad: .88 },
].map(k => Object.freeze(k)));

export const kartById = id => KARTS.find(k => k.id === id) || KARTS[0];

// Stat bars for the garage (1 … 5).
export function kartStats(k) {
  const bar = (v, lo, hi) => Math.max(1, Math.min(5, Math.round(1 + (v - lo) / (hi - lo) * 4)));
  return [
    ['TEMPO', bar(k.top, .97, 1.035)],
    ['BESCHL.', bar(k.accel, .75, 1.35)],
    ['HANDLING', bar(2 - k.turn, 2 - 1.3, 2 - .72)],
    ['GEWICHT', bar(k.mass, .75, 1.75)],
    ['DRIFT', bar(k.drift, .9, 1.4)],
    ['OFFROAD', bar(k.offroad, .32, .88)],
  ];
}
