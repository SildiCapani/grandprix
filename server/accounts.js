// Player accounts: name + password (scrypt hash), login sessions and the saved career.
// Everything lives in one JSON file (DATA_DIR/accounts.json). Admins come from server/admins.json (or the ADMINS env variable).
// Free hosts like Render wipe the disk on every restart/deploy. Then set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// (free Upstash Redis database): the accounts are also stored there and loaded from there on start.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createProfile, sanitizeProfile, saveProfile, getLevel, STORAGE_KEY } from '../client/src/game/progression.js';
import { MAPS } from '../client/src/game/tracks.js';

const scrypt = promisify(scryptCb);
const HERE = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(HERE, 'data');
const FILE = join(DATA_DIR, 'accounts.json');
const ADMINS_FILE = join(HERE, 'admins.json');
const SESSION_DAYS = 60, MAX_SESSIONS = 8;
const CLOUD_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, ''), CLOUD_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const CLOUD_KEY = process.env.ACCOUNTS_KEY || 'apex-rush-accounts';
const cloudOn = !!(CLOUD_URL && CLOUD_TOKEN);
async function cloud(path, body) {
  const res = await fetch(CLOUD_URL + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + CLOUD_TOKEN }, body });
  if (!res.ok) throw new Error('Upstash HTTP ' + res.status);
  return res.json();
}
let cloudTimer = null, cloudBusy = Promise.resolve();
// Cloud copy: at most one upload every 2 seconds (logins and race results can come in bursts).
function cloudSave() {
  if (!cloudOn || cloudTimer) return;
  cloudTimer = setTimeout(() => { cloudTimer = null; cloudBusy = cloudBusy.then(() => cloud('/set/' + encodeURIComponent(CLOUD_KEY), JSON.stringify(db))).catch(e => console.error('Konten-Cloud-Speicher fehlgeschlagen:', e.message)); }, 2000);
}

const NAME_RE = /^[A-Za-z0-9ÄÖÜäöüß _.-]{3,16}$/;
const keyOf = name => String(name).trim().toLowerCase();

let db = { users: {} };
let writing = Promise.resolve(), dirty = false;

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = (await scrypt(String(password), salt, 64)).toString('hex');
  return { salt, hash };
}
async function checkPassword(user, password) {
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Writes are queued and atomic (temp file + rename), so a crash never leaves half a file.
function persist() {
  dirty = true;
  writing = writing.then(async () => {
    if (!dirty) return; dirty = false;
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(db));
    await rename(tmp, FILE);
  }).catch(e => console.error('Konten konnten nicht gespeichert werden:', e.message));
  cloudSave();
  return writing;
}

export async function loadAccounts() {
  try { db = JSON.parse(await readFile(FILE, 'utf8')); if (!db.users) db = { users: {} }; } catch { db = { users: {} }; }
  // The cloud copy wins: it survives restarts of free hosts that wipe the disk.
  if (cloudOn) {
    try {
      const { result } = await cloud('/get/' + encodeURIComponent(CLOUD_KEY));
      const remote = result ? JSON.parse(result) : null;
      if (remote?.users) { db = remote; console.log('Konten aus dem Cloud-Speicher (Upstash) geladen.'); }
      else console.log('Cloud-Speicher (Upstash) ist noch leer – die Konten werden ab jetzt dort gesichert.');
    } catch (e) { console.error('Cloud-Speicher (Upstash) nicht erreichbar, nutze die lokale Datei:', e.message); }
  } else console.log('Hinweis: kein Cloud-Speicher gesetzt (UPSTASH_REDIS_REST_URL / _TOKEN). Auf Render gehen Konten bei jedem Neustart verloren.');
  // Admin accounts from server/admins.json or the ADMINS env variable: [{ "name": "...", "password": "..." }]
  const adminSource = existsSync(ADMINS_FILE) ? readFileSync(ADMINS_FILE, 'utf8') : process.env.ADMINS || '';
  if (adminSource) {
    let admins = [];
    try { admins = JSON.parse(adminSource); } catch (e) { console.error('Admin-Liste (admins.json / ADMINS) ist kein gültiges JSON:', e.message); }
    for (const a of Array.isArray(admins) ? admins : []) {
      if (!a?.name || !a?.password || !NAME_RE.test(a.name)) continue;
      const k = keyOf(a.name), u = db.users[k] ??= { name: a.name.trim(), profile: createProfile(), sessions: [], createdAt: Date.now() };
      const same = u.hash && await checkPassword(u, a.password);
      if (!same) Object.assign(u, await hashPassword(a.password));
      u.admin = true;
    }
    for (const u of Object.values(db.users)) if (u.admin && !admins.some(a => a && keyOf(a.name) === keyOf(u.name))) u.admin = false;
  }
  await persist();
  const admins = Object.values(db.users).filter(u => u.admin).map(u => u.name);
  console.log(`Konten: ${Object.keys(db.users).length} · Admins: ${admins.join(', ') || 'keine (server/admins.json anlegen)'}`);
}

function newSession(user) {
  const token = randomBytes(24).toString('base64url');
  user.sessions = [...(user.sessions || []).filter(s => Date.now() - s.at < SESSION_DAYS * 864e5), { token, at: Date.now() }].slice(-MAX_SESSIONS);
  return token;
}
const publicUser = u => ({ name: u.name, admin: !!u.admin });
function userByToken(token) {
  if (!token || typeof token !== 'string') return null;
  for (const u of Object.values(db.users)) {
    const s = (u.sessions || []).find(s => s.token === token);
    if (s && Date.now() - s.at < SESSION_DAYS * 864e5) return u;
  }
  return null;
}


// Merge an uploaded career into the stored one with the game's own rules (progress never goes backwards).
function mergeProfile(user, incoming) {
  const store = { value: JSON.stringify(user.profile || createProfile()), getItem() { return this.value; }, setItem(_, v) { this.value = v; } };
  if (!saveProfile(sanitizeProfile(incoming), store)) return false;
  user.profile = JSON.parse(store.value);
  return true;
}

// Time-trial ghosts: kept apart from the accounts (they are big), one small file per player on disk and one
// Redis hash per player in the cloud ("apex-rush-ghosts:<name>", field "<map>:<cc>"). Only a faster run replaces one.
const GHOST_DIR = join(DATA_DIR, 'ghosts'), GHOST_CLOUD = k => (process.env.GHOSTS_KEY || 'apex-rush-ghosts') + ':' + k;
const ghostCache = new Map();
const ghostFile = k => join(GHOST_DIR, Buffer.from(k).toString('hex') + '.json');
async function ghostsOf(k) {
  if (ghostCache.has(k)) return ghostCache.get(k);
  let g = {};
  try { g = JSON.parse(await readFile(ghostFile(k), 'utf8')) || {}; } catch {}
  if (cloudOn) {
    try {
      const { result } = await cloud('/hgetall/' + encodeURIComponent(GHOST_CLOUD(k)));
      for (let i = 0; i + 1 < (result || []).length; i += 2) { try { const v = JSON.parse(result[i + 1]); if (v?.time > 0 && !(g[result[i]]?.time <= v.time)) g[result[i]] = v; } catch {} }
    } catch (e) { console.error('Ghosts aus dem Cloud-Speicher nicht ladbar:', e.message); }
  }
  ghostCache.set(k, g); return g;
}
const str = (v, n = 40) => typeof v === 'string' ? v.slice(0, n) : undefined;
function cleanGhost(g) {
  if (!g || typeof g !== 'object' || !Array.isArray(g.d)) return null;
  const time = +g.time, step = +g.step || .1;
  if (!(time > 0 && time < 3600) || !(step >= .02 && step <= 1)) return null;
  if (g.d.length < 10 || g.d.length > 200000 || g.d.length % 5 || !g.d.every(n => Number.isInteger(n) && Math.abs(n) < 1e7)) return null;
  return { time, step, kart: str(g.kart), skin: str(g.skin), avatar: str(g.avatar), color: str(g.color, 16), d: g.d };
}
async function saveGhost(k, field, ghost) {
  const all = await ghostsOf(k);
  if (all[field] && all[field].time <= ghost.time) return false;
  all[field] = ghost;
  try { await mkdir(GHOST_DIR, { recursive: true }); await writeFile(ghostFile(k), JSON.stringify(all)); } catch (e) { console.error('Ghost nicht gespeichert:', e.message); }
  if (cloudOn) try { await cloud('/hset/' + encodeURIComponent(GHOST_CLOUD(k)) + '/' + encodeURIComponent(field), JSON.stringify(ghost)); } catch (e) { console.error('Ghost-Cloud-Speicher fehlgeschlagen:', e.message); }
  return true;
}
// World ranking (time trial): the best run of every player per track + speed class, top 50 kept.
// Fed by ghost uploads, so every entry also has a ghost others can race against.
const BOARD_MAX = 50;
const peekBoard = field => db.boards?.[field] || [];
function boardOf(field) { db.boards ??= {}; return db.boards[field] ??= []; }
function boardEnter(field, name, time) {
  const list = boardOf(field), k = keyOf(name), old = list.find(e => keyOf(e.n) === k);
  if (old && old.t <= time) return false;
  if (old) Object.assign(old, { t: time, at: Date.now() }); else list.push({ n: name, t: time, at: Date.now() });
  list.sort((a, b) => a.t - b.t); list.length = Math.min(list.length, BOARD_MAX);
  return true;
}
// Rough cheat filter: nobody drives 3 laps 35 % under the gold time, and the recording must match the time.
function plausible(map, cc, ghost) {
  const m = MAPS.find(x => x.id === map); if (!m?.parTimes?.gold) return false;
  if (ghost.time < m.parTimes.gold * (80 / cc) * .65) return false;
  const dur = ghost.d.length / 5 * ghost.step;
  return Math.abs(dur - ghost.time) < 3;
}
const ghostField = (map, cc) => /^[a-z0-9_-]{1,40}$/i.test(String(map)) && Number.isInteger(+cc) && +cc > 0 && +cc < 1000 ? map + ':' + +cc : null;

function body(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('ungültige Daten')); } });
    req.on('error', reject);
  });
}
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Returns true when the request was an /api call (handled here).
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;
  const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '?';
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const route = req.method + ' ' + url.pathname;
    if (route === 'POST /api/register' || route === 'POST /api/login') {
      const { name, password } = await body(req);
      const clean = String(name || '').trim();
      if (!NAME_RE.test(clean)) return send(res, 400, { error: 'Name: 3–16 Zeichen (Buchstaben, Zahlen, Leerzeichen, _ . -).' }), true;
      if (typeof password !== 'string' || password.length < 6 || password.length > 100) return send(res, 400, { error: 'Passwort: mindestens 6 Zeichen.' }), true;
      const k = keyOf(clean);
      if (route === 'POST /api/register') {
        if (db.users[k]) return send(res, 409, { error: 'Diesen Namen gibt es schon.' }), true;
        const u = db.users[k] = { name: clean, ...(await hashPassword(password)), admin: false, profile: createProfile(), sessions: [], createdAt: Date.now() };
        const token = newSession(u); await persist();
        return send(res, 200, { token, user: publicUser(u), profile: u.profile }), true;
      }
      const u = db.users[k];
      if (!u || !(await checkPassword(u, password))) { return send(res, 401, { error: 'Name oder Passwort falsch.' }), true; }
      const token = newSession(u); await persist();
      return send(res, 200, { token, user: publicUser(u), profile: u.profile }), true;
    }
    // ---- public: world ranking, record ghosts, player profiles ----
    if (route === 'GET /api/board') {
      const field = ghostField(url.searchParams.get('map'), url.searchParams.get('cc'));
      if (!field) return send(res, 400, { error: 'Strecke ungültig.' }), true;
      const list = peekBoard(field), me = keyOf(url.searchParams.get('me') || '');
      const mine = me ? list.findIndex(e => keyOf(e.n) === me) : -1;
      return send(res, 200, { top: list.slice(0, 10).map(e => ({ name: e.n, time: e.t })), total: list.length, me: mine >= 0 ? { rank: mine + 1, time: list[mine].t } : null }), true;
    }
    if (route === 'GET /api/board/ghost') {
      const field = ghostField(url.searchParams.get('map'), url.searchParams.get('cc'));
      const name = url.searchParams.get('name') || (field ? peekBoard(field)[0]?.n : null);
      if (!field || !name || !db.users[keyOf(name)]) return send(res, 404, { error: 'Kein Geist.' }), true;
      const ghost = (await ghostsOf(keyOf(name)))[field] || null;
      return send(res, 200, { name: db.users[keyOf(name)].name, ghost }), true;
    }
    if (route === 'GET /api/player') {
      const u = db.users[keyOf(url.searchParams.get('name') || '')];
      if (!u) return send(res, 404, { error: 'Spieler nicht gefunden.' }), true;
      const p = u.profile || createProfile(), ranks = [];
      for (const [field, list] of Object.entries(db.boards || {})) { const i = list.findIndex(e => keyOf(e.n) === keyOf(u.name)); if (i >= 0) ranks.push({ field, rank: i + 1, time: list[i].t, of: list.length }); }
      ranks.sort((a, b) => a.rank - b.rank);
      return send(res, 200, { player: { name: u.name, admin: !!u.admin, since: u.createdAt || null, look: u.look || null, level: getLevel(p.totalXP).level,
        totalXP: p.totalXP, races: p.races, wins: p.wins, achievements: p.achievements, records: p.records, ranks: ranks.slice(0, 30) } }), true;
    }
    if (route === 'GET /api/players') {
      const q = keyOf(url.searchParams.get('q') || '');
      const list = Object.values(db.users).filter(u => !q || keyOf(u.name).includes(q)).map(u => ({ name: u.name, level: getLevel(u.profile?.totalXP || 0).level, wins: u.profile?.wins || 0 }))
        .sort((a, b) => b.level - a.level || b.wins - a.wins).slice(0, 30);
      return send(res, 200, { players: list }), true;
    }
    // everything below needs a session (header or, for sendBeacon, in the body)
    let data = req.method === 'POST' || req.method === 'PUT' ? await body(req, url.pathname === '/api/ghost' ? 2 * 1024 * 1024 : undefined) : {};
    const user = userByToken(auth || data.token);
    if (!user) return send(res, 401, { error: 'Bitte neu anmelden.' }), true;
    if (route === 'GET /api/me') return send(res, 200, { user: publicUser(user), profile: user.profile || createProfile() }), true;
    if (route === 'POST /api/logout') { user.sessions = (user.sessions || []).filter(s => s.token !== (auth || data.token)); await persist(); return send(res, 200, { ok: true }), true; }
    if (route === 'PUT /api/profile' || route === 'POST /api/profile') {
      if (!mergeProfile(user, data.profile)) return send(res, 400, { error: 'Fortschritt ungültig.' }), true;
      if (data.look && typeof data.look === 'object') { const w = (v, re) => typeof v === 'string' && re.test(v) ? v : undefined; user.look = { avatar: w(data.look.avatar, /^[a-z]{2,12}$/), kart: w(data.look.kart, /^[a-z0-9-]{2,16}$/), color: w(data.look.color, /^#[0-9a-f]{6}$/i) }; }
      await persist();
      return send(res, 200, { ok: true, profile: user.profile }), true;
    }
    if (route === 'GET /api/ghosts') {
      const all = await ghostsOf(keyOf(user.name)), ghosts = {};
      for (const [f, g] of Object.entries(all)) ghosts[f] = g.time;
      return send(res, 200, { ghosts }), true;
    }
    if (route === 'GET /api/ghost') {
      const field = ghostField(url.searchParams.get('map'), url.searchParams.get('cc'));
      if (!field) return send(res, 400, { error: 'Strecke ungültig.' }), true;
      return send(res, 200, { ghost: (await ghostsOf(keyOf(user.name)))[field] || null }), true;
    }
    if (route === 'PUT /api/ghost' || route === 'POST /api/ghost') {
      const field = ghostField(data.map, data.cc), ghost = cleanGhost(data.ghost);
      if (!field || !ghost) return send(res, 400, { error: 'Ghost ungültig.' }), true;
      const stored = await saveGhost(keyOf(user.name), field, ghost);
      let rank = 0;
      if (plausible(data.map, +data.cc, ghost)) { if (boardEnter(field, user.name, ghost.time)) await persist(); rank = boardOf(field).findIndex(e => keyOf(e.n) === keyOf(user.name)) + 1; }
      return send(res, 200, { ok: true, stored, rank }), true;
    }
    if (route === 'POST /api/password') {
      if (typeof data.password !== 'string' || data.password.length < 6) return send(res, 400, { error: 'Passwort: mindestens 6 Zeichen.' }), true;
      Object.assign(user, await hashPassword(data.password)); await persist();
      return send(res, 200, { ok: true }), true;
    }
    return send(res, 404, { error: 'Unbekannt.' }), true;
  } catch (e) {
    return send(res, 400, { error: e.message || 'Fehler' }), true;
  }
}

export { STORAGE_KEY };

// Render & co. stop the server with SIGTERM on every deploy: upload a pending change first.
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, async () => {
  if (cloudOn && cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; try { await cloud('/set/' + encodeURIComponent(CLOUD_KEY), JSON.stringify(db)); } catch (e) { console.error(e.message); } }
  await cloudBusy; process.exit(0);
});
