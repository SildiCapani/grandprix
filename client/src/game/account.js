// Client side of the account system: login/registration, the session token and a storage
// adapter that keeps the career in the account (server) instead of in this browser.
import { STORAGE_KEY } from './progression.js';
import { SERVER, crossOrigin } from './server-url.js';

const TOKEN_KEY = 'apex-rush-session';
// guest: playing without an account – the career then lives in this browser (localStorage).
export const account = { user: null, token: null, profile: null, online: true, guest: false };
const GUEST_KEY = 'apex-rush-guest';
export const wasGuest = () => { try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; } };
export function playAsGuest() { account.guest = true; account.user = null; account.profile = null; try { localStorage.setItem(GUEST_KEY, '1'); } catch {} }
const local = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let pushTimer = 0, pushing = false, pending = false;

const readToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const writeToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

async function api(path, { body, method = body ? 'POST' : 'GET' } = {}) {
  let res;
  try {
    res = await fetch(SERVER + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(account.token ? { authorization: 'Bearer ' + account.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new Error('Server nicht erreichbar. Läuft „npm run dev“ bzw. der Server?'), { offline: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Serverfehler (' + res.status + ')'), { status: res.status });
  return data;
}

function apply(data) {
  account.guest = false; try { localStorage.removeItem(GUEST_KEY); } catch {}
  account.user = data.user; account.profile = data.profile || null;
  if (data.token) { account.token = data.token; writeToken(data.token); }
}

// Try the saved session. Resolves to true when logged in.
export async function restoreSession() {
  account.token = readToken();
  if (!account.token) return false;
  try { apply(await api('/me')); return true; }
  catch (e) { if (e.status === 401) { writeToken(null); account.token = null; } else throw e; return false; }
}
export async function login(name, password) { apply(await api('/login', { body: { name, password } })); }
export async function register(name, password) { apply(await api('/register', { body: { name, password } })); }
export async function logout() {
  await flushProfile();
  try { await api('/logout', { body: {} }); } catch {}
  writeToken(null); Object.assign(account, { user: null, token: null, profile: null });
}

// Upload the career a moment after it changed (several saves in a row become one request).
function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(flushProfile, 700); }
export async function flushProfile() {
  clearTimeout(pushTimer);
  if (!account.token || !account.profile) return;
  if (pushing) { pending = true; return; }
  pushing = true;
  try { const r = await api('/profile', { method: 'PUT', body: { profile: account.profile } }); if (r.profile) account.profile = r.profile; account.online = true; }
  catch (e) { account.online = false; setTimeout(schedulePush, 5000); }
  finally { pushing = false; if (pending) { pending = false; schedulePush(); } }
}
// Time-trial ghosts belong to the account too: they live on the server (one entry per track + speed class)
// and are cached in this browser, so the game can read them instantly.
const GHOST_PREFIX = user => `apex-ghost:${String(user).toLowerCase()}:`;
export async function uploadGhost(map, cc, ghost) {
  if (!account.token || !ghost) return false;
  try { const r = await api('/ghost', { method: 'PUT', body: { map, cc, ghost } }); return !!r.stored; } catch { return false; }
}
// After login: download ghosts that are better than (or missing in) this browser, upload the ones that are better here.
export async function syncGhosts() {
  if (!account.token || !account.user) return 0;
  let index;
  try { index = (await api('/ghosts')).ghosts || {}; } catch { return 0; }
  const prefix = GHOST_PREFIX(account.user.name), local = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(prefix)) { try { const g = JSON.parse(localStorage.getItem(k)); if (g?.time > 0) local[k.slice(prefix.length)] = g; } catch {} } } } catch {}
  let changed = 0;
  for (const [field, time] of Object.entries(index)) {
    if (local[field] && local[field].time <= time) continue;
    const [map, cc] = field.split(':');
    try { const { ghost } = await api('/ghost?map=' + encodeURIComponent(map) + '&cc=' + encodeURIComponent(cc)); if (ghost) { local[field] = null; localStorage.setItem(prefix + field, JSON.stringify(ghost)); changed++; } } catch {}
  }
  for (const [field, g] of Object.entries(local)) {
    if (!g || (index[field] && index[field] <= g.time)) continue;
    const [map, cc] = field.split(':'); await uploadGhost(map, +cc, g);
  }
  return changed;
}

// Last chance when the tab closes.
addEventListener('pagehide', () => {
  if (!account.token || !account.profile) return;
  try { navigator.sendBeacon(SERVER + '/api/profile', new Blob([JSON.stringify({ token: account.token, profile: account.profile })], { type: crossOrigin ? 'text/plain' : 'application/json' })); } catch {}
});

// Drop-in storage for loadProfile/saveProfile: the career belongs to the logged-in account.
export const accountStore = {
  getItem(key) { if (key !== STORAGE_KEY) return null; if (!account.user) return local.get(STORAGE_KEY); return account.profile ? JSON.stringify(account.profile) : null; },
  setItem(key, value) { if (key !== STORAGE_KEY) return; if (!account.user) { local.set(STORAGE_KEY, value); return; } account.profile = JSON.parse(value); schedulePush(); },
  removeItem() {},
};
