// Where the Apex Rush server (accounts /api and online relay /ws) lives.
// Served by our own Node server (Render, local, tunnel): same address as the page → ''.
// Opened from a static host (Netlify, GitHub Pages, …) there is no server next to the game,
// so it talks to the Render server instead. Change RENDER_SERVER if the Render address changes.
export const RENDER_SERVER = 'https://apex-rush-mwk2.onrender.com';
const STATIC_HOST = /(\.netlify\.app|\.github\.io|\.vercel\.app|\.pages\.dev)$/i;
const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SERVER_URL : '';
export const SERVER = (env || (typeof location !== 'undefined' && STATIC_HOST.test(location.hostname) ? RENDER_SERVER : '')).replace(/\/+$/, '');
export const crossOrigin = !!SERVER;
