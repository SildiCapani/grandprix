// Client side of the account system: login/registration, the session token and a storage
// adapter that keeps the career in the account (server) instead of in this browser.
import { STORAGE_KEY } from './progression.js';

const TOKEN_KEY = 'apex-rush-session';
export const account = { user: null, token: null, profile: null, online: true };
let pushTimer = 0, pushing = false, pending = false;

const readToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const writeToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

async function api(path, { body, method = body ? 'POST' : 'GET' } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json', ...(account.token ? { authorization: 'Bearer ' + account.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new Error('Server nicht erreichbar. Läuft „npm run dev“ bzw. der Server?'), { offline: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Serverfehler (' + res.status + ')'), { status: res.status });
  return data;
}

function apply(data) {
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
// Last chance when the tab closes.
addEventListener('pagehide', () => {
  if (!account.token || !account.profile) return;
  try { navigator.sendBeacon('/api/profile', new Blob([JSON.stringify({ token: account.token, profile: account.profile })], { type: 'application/json' })); } catch {}
});

// Drop-in storage for loadProfile/saveProfile: the career belongs to the logged-in account.
export const accountStore = {
  getItem(key) { return key === STORAGE_KEY && account.profile ? JSON.stringify(account.profile) : null; },
  setItem(key, value) { if (key !== STORAGE_KEY) return; account.profile = JSON.parse(value); schedulePush(); },
  removeItem() {},
};
