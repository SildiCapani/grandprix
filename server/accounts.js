// Player accounts: name + password (scrypt hash), login sessions and the saved career.
// Everything lives in one JSON file (DATA_DIR/accounts.json). Admins come from server/admins.json.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createProfile, sanitizeProfile, saveProfile, STORAGE_KEY } from '../client/src/game/progression.js';

const scrypt = promisify(scryptCb);
const HERE = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(HERE, 'data');
const FILE = join(DATA_DIR, 'accounts.json');
const ADMINS_FILE = join(HERE, 'admins.json');
const SESSION_DAYS = 60, MAX_SESSIONS = 8;

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
  return writing;
}

export async function loadAccounts() {
  try { db = JSON.parse(await readFile(FILE, 'utf8')); if (!db.users) db = { users: {} }; } catch { db = { users: {} }; }
  // Admin accounts from server/admins.json: [{ "name": "...", "password": "..." }]
  if (existsSync(ADMINS_FILE)) {
    let admins = [];
    try { admins = JSON.parse(readFileSync(ADMINS_FILE, 'utf8')); } catch (e) { console.error('admins.json ist kein gültiges JSON:', e.message); }
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
    // everything below needs a session (header or, for sendBeacon, in the body)
    let data = req.method === 'POST' || req.method === 'PUT' ? await body(req) : {};
    const user = userByToken(auth || data.token);
    if (!user) return send(res, 401, { error: 'Bitte neu anmelden.' }), true;
    if (route === 'GET /api/me') return send(res, 200, { user: publicUser(user), profile: user.profile || createProfile() }), true;
    if (route === 'POST /api/logout') { user.sessions = (user.sessions || []).filter(s => s.token !== (auth || data.token)); await persist(); return send(res, 200, { ok: true }), true; }
    if (route === 'PUT /api/profile' || route === 'POST /api/profile') {
      if (!mergeProfile(user, data.profile)) return send(res, 400, { error: 'Fortschritt ungültig.' }), true;
      await persist();
      return send(res, 200, { ok: true, profile: user.profile }), true;
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
