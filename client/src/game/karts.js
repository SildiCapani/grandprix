// Kart classes, Mario-Kart style: every kart trades one strength for a weakness.
//  top   – top speed factor (straights)
//  accel – acceleration factor (restarts after hits, corner exits)
//  turn  – turning circle factor at speed (lower = tighter = better handling)
//  mass  – weight in collisions (heavy karts push light ones away)
//  drift – how fast power drifts charge their mini-turbos
//  offroad – share of top speed kept on rough ground (shortcuts) without a mushroom
// Balanced with the game's own AI as test driver (one flying lap per kart on all 18 tracks, 80–150 km/h):
// averages stay within about ±1.5 % of the Apex GT, and every specialist has tracks where it is the fastest –
// Bolide on fast tracks, Flitzer on twisty ones, Buggy wherever there are shortcuts. The GT is never the fastest
// but never far off. The Brummer trades a little lap time for winning every shoving match.
export const KARTS = Object.freeze([
  { id: 'allround', name: 'Apex GT', tag: 'ALLROUNDER', desc: 'Ausgewogen in allem. Der beste Einstieg.',
    top: 1, accel: 1, turn: 1, mass: 1, drift: 1, offroad: .4 },
  { id: 'bolide', name: 'Thunder Bolide', tag: 'SPEED', desc: 'Höchste Endgeschwindigkeit, träge in engen Kurven und beim Anfahren. Stark auf schnellen Strecken: Küste, Sternenbahn, Wolkeninseln, Mondbasis.',
    top: 1.018, accel: .78, turn: 1.33, mass: 1.1, drift: .85, offroad: .32 },
  { id: 'flitzer', name: 'Pixel Flitzer', tag: 'HANDLING', desc: 'Leicht und superwendig, zieht blitzschnell los. Weniger Topspeed, wird leicht weggerammt. Stark auf kurvigen Strecken: Neon Boulevard, Gletscherpass, Galaxie.',
    top: .993, accel: 1.35, turn: .52, mass: .75, drift: 1.1, offroad: .45 },
  { id: 'brummer', name: 'Iron Brummer', tag: 'GEWICHT', desc: 'Schwerer Panzer: schiebt alle zur Seite und lässt sich kaum abdrängen. Langsam beim Anfahren, sonst solide. Die Wahl für Rempeleien und Battles.',
    top: 1.003, accel: .78, turn: 1.12, mass: 1.75, drift: .95, offroad: .6 },
  { id: 'drifter', name: 'Neon Drifter', tag: 'DRIFT', desc: 'Lädt Mini-Turbos viel schneller auf. Wer viel driftet, ist auf langen Kurven vorn, z. B. im Canyon.',
    top: .99, accel: 1, turn: .98, mass: .95, drift: 1.45, offroad: .38 },
  { id: 'buggy', name: 'Rally Buggy', tag: 'OFFROAD', desc: 'Geländewagen mit Stollenreifen: fast volles Tempo im Gelände, auf Asphalt langsamer. Unschlagbar auf Strecken mit Abkürzungen: Dschungel, Pilzwald, Drachenburg.',
    top: .965, accel: 1.15, turn: .98, mass: 1.05, drift: .95, offroad: .8 },
].map(k => Object.freeze(k)));

export const kartById = id => KARTS.find(k => k.id === id) || KARTS[0];

// Stat bars for the garage (1 … 5).
export function kartStats(k) {
  const bar = (v, lo, hi) => Math.max(1, Math.min(5, Math.round(1 + (v - lo) / (hi - lo) * 4)));
  return [
    ['TEMPO', bar(k.top, .95, 1.025)],
    ['BESCHL.', bar(k.accel, .7, 1.4)],
    ['HANDLING', bar(2 - k.turn, 2 - 1.5, 2 - .5)],
    ['GEWICHT', bar(k.mass, .75, 1.75)],
    ['DRIFT', bar(k.drift, .85, 1.45)],
    ['OFFROAD', bar(k.offroad, .3, .85)],
  ];
}

// Wheels for the garage: they shift the kart's stats a little (multipliers, offroad is added).
//   look: r = radius factor, w = width factor, knob = offroad studs, rim = rim colour ('paint' = kart colour), tread = tyre colour
export const WHEELS = Object.freeze([
  { id: 'standard', name: 'Standard', tag: 'AUSGEWOGEN', desc: 'Die Serienräder. Keine Stärken, keine Schwächen.', level: 1,
    mod: {}, look: { r: 1, w: 1, knob: null, rim: 'paint' } },
  { id: 'slick', name: 'Slicks', tag: 'TEMPO', desc: 'Profillose Rennreifen: mehr Topspeed auf Asphalt, aber rutschig im Gelände.', level: 2,
    mod: { top: 1.022, offroad: -.08, turn: 1.03 }, look: { r: .95, w: 1.25, knob: false, rim: '#e8ecf0', band: '#ffd400' } },
  { id: 'studs', name: 'Stollen', tag: 'OFFROAD', desc: 'Grobe Stollen: im Gras und Sand kaum langsamer, auf der Straße etwas träger.', level: 2,
    mod: { top: .99, offroad: .2 }, look: { r: 1.08, w: 1.15, knob: true, rim: '#3a3a40' } },
  { id: 'drift', name: 'Drift-Räder', tag: 'DRIFT', desc: 'Weiche Mischung: Mini-Turbos laden deutlich schneller, dafür etwas weniger Grip.', level: 3,
    mod: { drift: 1.18, turn: .96, accel: .97 }, look: { r: .98, w: 1.05, knob: false, rim: '#ff4ad8', band: '#ff4ad8' } },
  { id: 'light', name: 'Leichtfelgen', tag: 'BESCHL.', desc: 'Superleicht: zieht schneller los, wird aber leichter weggerammt.', level: 4,
    mod: { accel: 1.12, mass: .9, top: .995 }, look: { r: .92, w: .85, knob: false, rim: '#3ab8ff', spokes: 3 } },
  { id: 'monster', name: 'Monster-Räder', tag: 'GEWICHT', desc: 'Riesige Ballonreifen: schwer, robust und gut im Gelände. Langsamer beim Anfahren.', level: 5,
    mod: { mass: 1.25, offroad: .12, accel: .93, top: 1.005 }, look: { r: 1.32, w: 1.45, knob: true, rim: '#ffd400' } },
  { id: 'gold', name: 'Goldräder', tag: 'LEGENDE', desc: 'Für echte Champions: ein bisschen besser in allem.', level: 8,
    mod: { top: 1.008, accel: 1.03, drift: 1.04, offroad: .03 }, look: { r: 1, w: 1.05, knob: false, rim: '#f2c040', band: '#f2c040', gold: true } },
].map(w => Object.freeze(w)));
export const wheelById = id => WHEELS.find(w => w.id === id) || WHEELS[0];
// Kart stats with a set of wheels on.
export function withWheels(k, wheelId) {
  const m = wheelById(wheelId).mod;
  return { ...k, top: k.top * (m.top || 1), accel: k.accel * (m.accel || 1), turn: k.turn * (m.turn || 1), mass: k.mass * (m.mass || 1), drift: k.drift * (m.drift || 1), offroad: Math.min(.95, k.offroad + (m.offroad || 0)) };
}
