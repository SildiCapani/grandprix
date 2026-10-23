// Apex Rush game server
//  • serves the built game (folder dist/) over HTTP
//  • /ws: tiny publish/subscribe relay for online rooms (works through eduroam, port 80/443)
//  • /api: player accounts (login, saved career) – see accounts.js
// Start: npm start   (port from env PORT, default 3001)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadAccounts, handleApi } from './accounts.js';

const PORT = Number(process.env.PORT) || 3001;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const server = http.createServer(async (req, res) => {
  // The game may also be opened from a static host (e.g. Netlify) and talk to this server: allow cross-origin API calls.
  // Logins use a bearer token (no cookies), so any origin is fine.
  if (req.url.startsWith('/api')) {
    res.setHeader('access-control-allow-origin', req.headers.origin || '*');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('access-control-max-age', '86400'); res.setHeader('vary', 'origin');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  }
  if (await handleApi(req, res)) return;
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: topics.size, clients: wss.clients.size })); return; }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if (path.endsWith('/') || !(await stat(file).catch(() => null))?.isFile()) file = join(DIST, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Spiel nicht gebaut. Bitte zuerst "npm run build" ausführen (oder "npm run dev" zum Entwickeln).');
  }
});

// --- relay: topic → set of sockets ---
const topics = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024, perMessageDeflate: false });
wss.on('connection', ws => {
  ws.topics = new Set(); ws.isAlive = true; ws.budget = 400;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    if (--ws.budget < 0) return; // simple flood protection (refilled every second)
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (typeof m.topic !== 'string' || m.topic.length > 200 || !m.topic.startsWith('apexrush/')) return;
    if (m.op === 'sub') {
      if (ws.topics.size > 8) return;
      if (!topics.has(m.topic)) topics.set(m.topic, new Set());
      topics.get(m.topic).add(ws); ws.topics.add(m.topic);
    } else if (m.op === 'pub' && typeof m.msg === 'string') {
      const out = JSON.stringify({ topic: m.topic, msg: m.msg });
      for (const peer of topics.get(m.topic) || []) if (peer.readyState === 1) peer.send(out);
    }
  });
  ws.on('close', () => { for (const t of ws.topics) { const set = topics.get(t); set?.delete(ws); if (set && !set.size) topics.delete(t); } });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15000);
setInterval(() => { for (const ws of wss.clients) ws.budget = 400; }, 1000);

await loadAccounts();
server.listen(PORT, () => {
  console.log(`Apex Rush Server läuft: http://localhost:${PORT}`);
  console.log(`Online-Relay:           ws://localhost:${PORT}/ws`);
});
