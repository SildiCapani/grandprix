// Career data stays local to this browser. No accounts, timers or daily streaks.
export const STORAGE_KEY = 'apex-rush-career-v1';
const LEGACY_KEY = 'apex-rush-legacy-record';
// Tracks open up with the driver level (the XP is the level threshold: 500 = Lv 2, 1200 = Lv 3, 2200 = Lv 4, 3600 = Lv 5, 5500 = Lv 6, 8000 = Lv 7).
const MAPS = [{ id: 'coast', xp: 0 }, { id: 'canyon', xp: 0 }, { id: 'neon', xp: 500 }, { id: 'volcano', xp: 2200 }, { id: 'glacier', xp: 3600 }, { id: 'stars', xp: 5500 }, { id: 'jungle', xp: 500 }, { id: 'savanna', xp: 1200 }, { id: 'forest', xp: 1200 }, { id: 'sky', xp: 3600 }, { id: 'sakura', xp: 2200 }, { id: 'moon', xp: 8000 }, { id: 'pirate', xp: 500 }, { id: 'candy', xp: 1200 }, { id: 'castle', xp: 2200 }, { id: 'arctic', xp: 1200 }, { id: 'rooftops', xp: 3600 }, { id: 'galaxy', xp: 5500 }];
const MEDALS = ['none', 'bronze', 'silver', 'gold'];
const THRESHOLDS = [0, 500, 1200, 2200, 3600, 5500, 8000];
const TITLES = ['Rookie', 'Kurven-Talent', 'Drift-Pilot', 'Rennprofi', 'Apex-Jäger', 'Grand-Prix-Champion', 'Legende'];
// Records are kept per speed class: 'race' = 80 km/h, 'race100', 'race120', 'race150' …
const MODES = ['race', 'time', 'online', 'race100', 'time100', 'online100', 'race120', 'time120', 'online120', 'race150', 'time150', 'online150'];
const baseMode = m => String(m).replace(/\d+$/, '');
let resultCounter = 0;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isFinite(Number(value)) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(value)))) : 0;
const seconds = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const bounded = (value, max) => Math.min(max, count(value));
const medalRank = value => Math.max(0, MEDALS.indexOf(value));
const validMap = value => MAPS.some(map => map.id === value);
const normalizeMode = value => MODES.includes(value) ? value : 'race';
const stringList = value => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string' && item.length > 0 && item.length <= 160))] : [];

export function createProfile() {
  return { version: 2, totalXP: 0, totalPoints: 0, races: 0, wins: 0, records: {}, achievements: [], recentRaceIds: [], missions: [], missionSeq: 0, missionMaps: [] };
}

// ---------- career rewards (only when the career switch is on) ----------
export const MAP_XP = Object.freeze(Object.fromEntries(MAPS.map(map => [map.id, map.xp])));
export const KART_LEVEL = Object.freeze({ allround: 1, flitzer: 2, drifter: 3, buggy: 4, bolide: 5, brummer: 6 });
export const FINISHES = Object.freeze([
  { id: 'standard', name: 'LACK', level: 1 },
  { id: 'gold', name: 'GOLD', level: 3 },
  { id: 'chrome', name: 'CHROM', level: 5 },
  { id: 'neon', name: 'NEON', level: 7 },
]);
const levelOfXP = xp => THRESHOLDS.findIndex(t => t > xp) < 0 ? THRESHOLDS.length : THRESHOLDS.findIndex(t => t > xp);
// Everything that opens up at exactly this level, for the "unlocked" banners.
export function rewardsForLevel(level, names = {}) {
  const out = [];
  for (const [id, xp] of Object.entries(MAP_XP)) if (xp > 0 && levelOfXP(xp) === level) out.push({ kind: 'map', id, name: names[id] || id });
  for (const [id, lv] of Object.entries(KART_LEVEL)) if (lv > 1 && lv === level) out.push({ kind: 'kart', id, name: names[id] || id });
  for (const f of FINISHES) if (f.level > 1 && f.level === level) out.push({ kind: 'finish', id: f.id, name: 'Lack ' + f.name });
  return out;
}
// The next level that brings something new (or null when everything is open).
export function nextReward(level, names) {
  for (let lv = level + 1; lv <= 8; lv++) { const list = rewardsForLevel(lv, names); if (list.length) return { level: lv, list }; }
  return null;
}

// ---------- missions: three at a time, no timers; a finished one is replaced by the next ----------
const MISSION_POOL = [
  { id: 'wins', label: n => `Gewinne ${n} Grand Prix`, goal: 2, xp: 350 },
  { id: 'overtakes', label: n => `Überhole ${n} Gegner`, goal: 25, xp: 250 },
  { id: 'drift', label: n => `Drifte insgesamt ${n} Sekunden`, goal: 60, xp: 250 },
  { id: 'hits', label: n => `Triff ${n} Gegner mit Items`, goal: 6, xp: 250 },
  { id: 'podium', label: n => `Fahre ${n}× aufs Podium`, goal: 3, xp: 300 },
  { id: 'jumps', label: n => `Lande ${n} Sprünge`, goal: 12, xp: 250 },
  { id: 'coins', label: n => `Sammle ${n} Turbo-Chips`, goal: 30, xp: 250 },
  { id: 'maps', label: n => `Fahre auf ${n} verschiedenen Strecken`, goal: 3, xp: 250 },
  { id: 'clean', label: n => n > 1 ? `Beende ${n} Rennen ohne Wandkontakt` : 'Beende ein Rennen ohne Wandkontakt', goal: 1, xp: 300 },
  { id: 'gold', label: n => n > 1 ? `Hol dir ${n} Gold-Medaillen` : 'Hol dir eine Gold-Medaille', goal: 1, xp: 350 },
  { id: 'fast', label: n => n > 1 ? `Beende ${n} Rennen mit 120 km/h` : 'Beende ein Rennen mit 120 km/h', goal: 1, xp: 300 },
  { id: 'finish', label: n => `Beende ${n} Rennen`, goal: 4, xp: 200 },
];
// Every pass through the pool makes the goals 50 % bigger.
function makeMission(seq) {
  const base = MISSION_POOL[seq % MISSION_POOL.length], tier = Math.floor(seq / MISSION_POOL.length);
  return { id: base.id, seq, goal: Math.max(1, Math.round(base.goal * (1 + tier * .5))), progress: 0, xp: Math.round(base.xp * (1 + tier * .25)) };
}
function fillMissions(profile) {
  while (profile.missions.length < 3) {
    let m = makeMission(profile.missionSeq++);
    while (profile.missions.some(o => o.id === m.id)) m = makeMission(profile.missionSeq++);
    profile.missions.push(m);
  }
  return profile;
}
export function missionLabel(m) { return (MISSION_POOL.find(p => p.id === m.id)?.label || (() => m.id))(m.goal); }
export function activeMissions(value) { return fillMissions(sanitizeProfile(value)).missions; }
// Counts one finished race towards the missions. `race` = { position, mode, mapId, cc, medal, coins, collisions, resets,
// overtakes, hitsDealt, jumps, driftSeconds }. Returns the updated profile, completed missions and the XP they paid.
export function applyMissions(value, race) {
  const profile = fillMissions(sanitizeProfile(value)), done = [];
  const competitive = race.mode !== 'time';
  if (race.mapId && !profile.missionMaps.includes(race.mapId)) profile.missionMaps.push(race.mapId);
  const gain = {
    wins: competitive && race.position === 1 ? 1 : 0, podium: competitive && race.position <= 3 ? 1 : 0,
    overtakes: race.overtakes || 0, drift: race.driftSeconds || 0, hits: race.hitsDealt || 0, jumps: race.jumps || 0, coins: race.coins || 0,
    clean: !race.collisions && !race.resets ? 1 : 0, gold: race.medal === 'gold' ? 1 : 0, fast: race.cc >= 120 ? 1 : 0, finish: 1,
  };
  for (const m of profile.missions) {
    if (m.id === 'maps') m.progress = Math.min(m.goal, profile.missionMaps.length);
    else m.progress = Math.min(m.goal, m.progress + (gain[m.id] || 0));
  }
  let xp = 0;
  profile.missions = profile.missions.filter(m => {
    if (m.progress < m.goal) return true;
    done.push({ ...m, label: missionLabel(m) }); xp += m.xp; return false;
  });
  if (done.some(m => m.id === 'maps')) profile.missionMaps = [];
  profile.totalXP = Math.min(Number.MAX_SAFE_INTEGER, profile.totalXP + xp);
  return { profile: fillMissions(profile), done, xp };
}
const sanitizeMissions = value => Array.isArray(value) ? value.filter(m => object(m) && MISSION_POOL.some(p => p.id === m.id)).slice(0, 3)
  .map(m => ({ id: m.id, seq: count(m.seq), goal: Math.max(1, count(m.goal)), progress: count(m.progress), xp: count(m.xp) })) : [];

function sanitizeRecord(record) {
  if (!object(record)) return null;
  return {
    bestTime: seconds(record.bestTime ?? record.time),
    bestLap: seconds(record.bestLap),
    bestPoints: count(record.bestPoints),
    medal: MEDALS[medalRank(record.medal)],
    races: count(record.races),
    wins: Math.min(count(record.wins), count(record.races)),
  };
}

export function sanitizeProfile(value) {
  const profile = createProfile();
  if (!object(value)) return profile;
  profile.totalXP = count(value.totalXP);
  profile.totalPoints = count(value.totalPoints);
  profile.races = count(value.races);
  profile.wins = Math.min(count(value.wins), profile.races);
  profile.achievements = stringList(value.achievements);
  profile.recentRaceIds = stringList(value.recentRaceIds).slice(-20);
  profile.missions = sanitizeMissions(value.missions);
  profile.missionSeq = count(value.missionSeq);
  profile.missionMaps = stringList(value.missionMaps).filter(validMap);
  if (object(value.records)) for (const map of MAPS) {
    const modes = value.records[map.id];
    if (!object(modes)) continue;
    for (const mode of MODES) {
      const record = sanitizeRecord(modes[mode]);
      if (record) (profile.records[map.id] ??= {})[mode] = record;
    }
  }
  return profile;
}

export function getLevel(value) {
  const xp = count(value);
  let index = THRESHOLDS.findIndex(threshold => threshold > xp) - 1;
  let threshold, nextThreshold;
  if (xp < THRESHOLDS.at(-1)) {
    threshold = THRESHOLDS[index];
    nextThreshold = THRESHOLDS[index + 1];
  } else {
    // Beyond the authored ranks, every next level requires another 500 XP.
    const extra = xp - THRESHOLDS.at(-1);
    let n = Math.floor((-2750 + Math.sqrt(2750 ** 2 + 1000 * extra)) / 500);
    const extended = i => 8000 + 3000 * i + 250 * i * (i - 1);
    while (n > 0 && extended(n) > xp) n--;
    while (extended(n + 1) <= xp) n++;
    index = THRESHOLDS.length - 1 + n;
    threshold = extended(n);
    nextThreshold = extended(n + 1);
  }
  return {
    level: index + 1,
    title: TITLES[Math.min(index, TITLES.length - 1)],
    currentXP: xp - threshold,
    nextXP: nextThreshold - threshold,
    progress: Math.max(0, Math.min(1, (xp - threshold) / (nextThreshold - threshold))),
    threshold,
    nextThreshold,
  };
}

export function getUnlockedMaps(profile) {
  const xp = count(profile?.totalXP);
  return MAPS.filter(map => xp >= map.xp).map(map => map.id);
}

export function getMedal(map, time) {
  const raceTime = seconds(time);
  if (raceTime === null) return 'none';
  const pars = map?.parTimes;
  for (const [index, medal] of ['gold', 'silver', 'bronze'].entries()) {
    const par = seconds(Array.isArray(pars) ? pars[index] : pars?.[medal]);
    if (par !== null && raceTime <= par) return medal;
  }
  return 'none';
}

function makeRaceId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  return `race-${Date.now().toString(36)}-${(++resultCounter).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function calculateResult({ map, mode = 'race', time, bestLap, position = 8, stats = {}, coins = 0, raceId, completed = true } = {}) {
  const mapId = validMap(map?.id) ? map.id : 'coast';
  const raceMode = normalizeMode(mode);
  const competitive = baseMode(raceMode) === 'race' || baseMode(raceMode) === 'online';
  const raceTime = seconds(time);
  const finished = completed !== false && raceTime !== null;
  const safeStats = {
    collisions: count(stats?.collisions),
    driftSeconds: Math.min(8, Math.max(0, Number(stats?.driftSeconds) || 0)),
    boostSeconds: Math.max(0, Number.isFinite(Number(stats?.boostSeconds)) ? Number(stats.boostSeconds) : 0),
    resets: count(stats?.resets),
  };
  const safeCoins = bounded(coins, 36);
  const place = Math.max(1, bounded(position, 8) || 8);
  const medal = finished ? getMedal(map, raceTime) : 'none';
  const clean = finished && safeStats.collisions === 0 && safeStats.resets === 0;
  const podiumPoints = competitive ? [0, 500, 350, 250, 160, 100, 60, 30, 10][place] : 0;
  const medalPoints = { none: 0, bronze: 100, silver: 220, gold: 350 }[medal];
  const driftPoints = Math.floor(safeStats.driftSeconds * 25);
  const breakdown = finished ? [
    { label: 'Rennen beendet', points: 1000 },
    ...(competitive ? [{ label: `Platz ${place}`, points: podiumPoints }] : []),
    ...(medalPoints ? [{ label: `${{ gold: 'Gold', silver: 'Silber', bronze: 'Bronze' }[medal]}-Zeit`, points: medalPoints }] : []),
    ...(clean ? [{ label: 'Saubere Fahrt', points: 200 }] : []),
    ...(driftPoints ? [{ label: 'Drift-Stil · maximal 8 s', points: driftPoints }] : []),
    ...(safeCoins ? [{ label: `${safeCoins} Turbo-Chips`, points: safeCoins * 25 }] : []),
  ] : [];
  const points = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  const xp = finished ? 400 + ({ none: 0, bronze: 20, silver: 40, gold: 65 }[medal])
    + (competitive ? [0, 60, 40, 25, 15, 8, 4, 0, 0][place] : 0)
    + (clean ? 25 : 0) + Math.floor(safeStats.driftSeconds * 2.5) + safeCoins : 0;
  const challenges = [
    { id: `${mapId}:finish`, label: 'Erster Zieleinlauf', complete: finished },
    { id: `${mapId}:clean`, label: 'Ohne Kratzer ins Ziel', complete: clean },
    { id: `${mapId}:gold`, label: 'Gold-Zeit geknackt', complete: finished && medal === 'gold' },
    { id: `${mapId}:win`, label: 'Grand Prix gewonnen', complete: finished && competitive && place === 1 },
  ];
  return {
    raceId: typeof raceId === 'string' && raceId.trim() ? raceId.slice(0, 160) : makeRaceId(),
    mapId, mode: raceMode, completed: finished, time: raceTime,
    bestLap: seconds(bestLap), position: place, stats: safeStats, coins: safeCoins,
    points, xp, medal, breakdown, challenges,
  };
}

export function applyResult(value, result) {
  const profile = sanitizeProfile(value);
  const beforeMaps = getUnlockedMaps(profile);
  const beforeLevel = getLevel(profile.totalXP).level;
  const blank = { profile, newBest: false, newMedal: false, newMaps: [], levelUp: false, firstWin: false, newChallenges: [], pointsEarned: 0, xpEarned: 0, bonusBreakdown: [], duplicate: false };
  // Never grant points for an abandoned race or apply a finish event twice.
  if (!object(result) || !result.completed || seconds(result.time) === null || !validMap(result.mapId)
    || typeof result.raceId !== 'string' || !result.raceId) return blank;
  if (profile.recentRaceIds.includes(result.raceId)) return { ...blank, duplicate: true };
  const mode = normalizeMode(result.mode);
  const modes = profile.records[result.mapId] ??= {};
  const record = modes[mode] ??= { bestTime: null, bestLap: null, bestPoints: 0, medal: 'none', races: 0, wins: 0 };
  const newBest = record.bestTime === null || result.time < record.bestTime;
  const newMedal = medalRank(result.medal) > medalRank(record.medal);
  const win = (baseMode(mode) === 'race' || baseMode(mode) === 'online') && result.position === 1;
  const firstWin = win && !profile.achievements.includes(`${result.mapId}:win`);
  const newChallenges = (Array.isArray(result.challenges) ? result.challenges : []).filter(challenge =>
    challenge?.complete && typeof challenge.id === 'string'
    && ['finish', 'clean', 'gold', 'win'].some(type => challenge.id === `${result.mapId}:${type}`)
    && !profile.achievements.includes(challenge.id));
  const bonusBreakdown = [];
  let bonusXP = 0;
  for (const challenge of newChallenges) {
    profile.achievements.push(challenge.id);
    const type = challenge.id.split(':')[1];
    if (type === 'finish') { bonusBreakdown.push({ label: 'Kurs erstmals beendet', points: 200 }); bonusXP += 50; }
    if (type === 'clean') bonusBreakdown.push({ label: 'Challenge: Saubere Fahrt', points: 100 });
    if (type === 'gold') bonusBreakdown.push({ label: 'Challenge: Gold-Zeit', points: 150 });
  }
  const pointsEarned = count(result.points) + bonusBreakdown.reduce((sum, item) => sum + item.points, 0);
  const xpEarned = count(result.xp) + bonusXP;
  profile.totalXP = Math.min(Number.MAX_SAFE_INTEGER, profile.totalXP + xpEarned);
  profile.totalPoints = Math.min(Number.MAX_SAFE_INTEGER, profile.totalPoints + pointsEarned);
  profile.races++;
  if (win) profile.wins++;
  profile.recentRaceIds.push(result.raceId);
  profile.recentRaceIds = profile.recentRaceIds.slice(-20);
  if (newBest) record.bestTime = result.time;
  if (seconds(result.bestLap) !== null) record.bestLap = record.bestLap === null ? result.bestLap : Math.min(record.bestLap, result.bestLap);
  // Record hunting compares repeatable driving performance. Career challenges
  // still count toward lifetime points, but only pay once and cannot inflate PBs.
  record.bestPoints = Math.max(record.bestPoints, count(result.points));
  if (newMedal) record.medal = MEDALS[medalRank(result.medal)];
  record.races++;
  if (win) record.wins++;
  if (MAPS.every(map => profile.achievements.includes(`${map.id}:gold`)) && !profile.achievements.includes('all-gold')) profile.achievements.push('all-gold');
  return {
    ...blank, profile, newBest, newMedal, firstWin, newChallenges, pointsEarned, xpEarned, bonusBreakdown,
    newMaps: getUnlockedMaps(profile).filter(id => !beforeMaps.includes(id)),
    levelUp: getLevel(profile.totalXP).level > beforeLevel,
  };
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function readSaved(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return object(value) && (value.version === 2 || 'totalXP' in value || object(value.records)) ? sanitizeProfile(value) : null;
  } catch { return null; }
}

export function loadProfile(storage) {
  const target = resolveStorage(storage);
  const saved = readSaved(target);
  if (saved) return saved;
  const profile = createProfile();
  try {
    const oldTime = seconds(target?.getItem(LEGACY_KEY));
    if (oldTime !== null) profile.records.coast = { race: { bestTime: oldTime, bestLap: null, bestPoints: 0, medal: 'none', races: 0, wins: 0 } };
  } catch {}
  return profile;
}

function keepProgress(current, incoming) {
  // A stale tab or a malformed import must not wipe an existing career.
  for (const key of ['totalXP', 'totalPoints', 'races', 'wins']) incoming[key] = Math.max(current[key], incoming[key]);
  incoming.achievements = [...new Set([...current.achievements, ...incoming.achievements])];
  incoming.recentRaceIds = [...new Set([...current.recentRaceIds, ...incoming.recentRaceIds])].slice(-20);
  // Missions move forward only: keep whichever side is further along the sequence.
  if (current.missionSeq > incoming.missionSeq) { incoming.missions = current.missions; incoming.missionSeq = current.missionSeq; incoming.missionMaps = current.missionMaps; }
  for (const map of MAPS) for (const mode of MODES) {
    const old = current.records[map.id]?.[mode];
    if (!old) continue;
    const modes = incoming.records[map.id] ??= {};
    if (!modes[mode]) { modes[mode] = { ...old }; continue; }
    const record = modes[mode];
    for (const field of ['bestTime', 'bestLap']) if (old[field] !== null) record[field] = record[field] === null ? old[field] : Math.min(old[field], record[field]);
    for (const field of ['bestPoints', 'races', 'wins']) record[field] = Math.max(old[field], record[field]);
    record.medal = MEDALS[Math.max(medalRank(old.medal), medalRank(record.medal))];
  }
  return incoming;
}

export function saveProfile(profile, storage) {
  const target = resolveStorage(storage);
  if (!target || typeof target.setItem !== 'function') return false;
  try {
    let safe = sanitizeProfile(profile);
    const current = readSaved(target);
    if (current) safe = keepProgress(current, safe);
    target.setItem(STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch { return false; }
}
