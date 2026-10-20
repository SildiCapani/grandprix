// Track editor: draw a circuit top-down, lift points into bridges, set jumps, pick a world, test drive, share as a code.
import { buildCustomTrack, analyzeTrack, encodeTrackCode, decodeTrackCode, CUSTOM_THEMES } from './game/tracks.js';

const THEME_NAMES = { day: 'Küste', desert: 'Canyon', night: 'Neon-City', volcano: 'Vulkan', snow: 'Gletscher', space: 'Weltall', jungle: 'Dschungel',
  savanna: 'Savanne', forest: 'Pilzwald', sky: 'Wolkeninseln', sakura: 'Kirschblüten', moon: 'Mond' };
const STORE = 'apex-rush-tracks';
const DRAFT = 'apex-rush-track-draft';
const MIN_NODES = 4, MAX_NODES = 80;

export const STARTER_TRACK = Object.freeze({
  name: 'Meine erste Strecke', theme: 'day',
  nodes: [[-160, 120, 0], [0, 130, 0], [150, 110, 0], [210, 20, 0], [160, -90, 0], [40, -120, 0], [-60, -60, 0], [-170, -110, 0], [-230, 0, 0]],
  jumps: [],
});

const clone = def => JSON.parse(JSON.stringify(def));
const readStore = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeStore = list => { try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 30))); return true; } catch { return false; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createEditor({ onTest, onClose, toast }) {
  let def = null, built = null, report = null, selected = -1, open = false;
  const view = { x: 0, z: 0, k: 1 };
  const root = document.createElement('div');
  root.className = 'editor'; root.hidden = true;
  root.innerHTML = `
    <div class="ed-canvas"><canvas></canvas><div class="ed-help">Ziehen: Punkt verschieben · Klick auf die Strecke: Punkt einfügen · Rechtsklick/Entf: Punkt löschen · Ziehen im Leeren: verschieben · Mausrad: Zoom</div></div>
    <aside class="ed-panel">
      <div class="menu-kicker"><i></i> STRECKEN-EDITOR</div>
      <label class="ed-field"><small>NAME</small><input class="ed-name" maxlength="40"></label>
      <label class="ed-field"><small>WELT</small><select class="ed-theme">${CUSTOM_THEMES.map(t => `<option value="${t}">${THEME_NAMES[t]}</option>`).join('')}</select></label>
      <div class="ed-stats"></div>
      <div class="ed-node"></div>
      <div class="ed-warn"></div>
      <div class="ed-actions">
        <button class="primary" data-ed="test-race">TESTFAHRT · GRAND PRIX <span>↗</span></button>
        <button class="secondary" data-ed="test-time">Testfahrt allein (Zeitfahren)</button>
        <div class="ed-row"><button class="secondary" data-ed="save">Speichern</button><button class="secondary" data-ed="copy">Code kopieren</button><button class="secondary" data-ed="paste">Code laden</button></div>
        <div class="ed-row"><button class="secondary" data-ed="new">Neu</button><button class="secondary" data-ed="close">Zurück zum Menü</button></div>
      </div>
      <div class="ed-saved"></div>
    </aside>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const $ = sel => root.querySelector(sel);

  // ---------- model ----------
  function rebuild(save = true) {
    try { built = buildCustomTrack(def); report = analyzeTrack(built.track); }
    catch { built = null; report = null; }
    if (save) try { localStorage.setItem(DRAFT, JSON.stringify(def)); } catch {}
    renderPanel(); draw();
  }
  function problems() {
    if (!report) return [{ level: 'bad', text: 'Die Strecke lässt sich so nicht bauen.' }];
    const out = [];
    if (report.conflicts.length) out.push({ level: 'bad', text: `Die Strecke überschneidet sich (${report.conflicts.length} Stellen, rot markiert). Heb einen Teil mindestens 6 m an, dann wird es eine Brücke.` });
    if (report.length < 600) out.push({ level: 'bad', text: `Zu kurz: ${Math.round(report.length)} m. Mindestens 600 m.` });
    if (report.length > 4200) out.push({ level: 'bad', text: `Zu lang: ${Math.round(report.length)} m. Höchstens 4200 m.` });
    if (report.tight.length) out.push({ level: 'warn', text: `Sehr enge Kurve (Radius ${report.minRadius.toFixed(0)} m, gelb markiert). Fahrbar, aber zäh.` });
    if (report.maxSlope > .14) out.push({ level: 'warn', text: `Steile Rampe (${Math.round(report.maxSlope * 100)} %). Ab 14 % wirkt es unnatürlich.` });
    if (report.badJumps) out.push({ level: 'warn', text: 'Ein Sprung liegt in einer Kurve. Sprünge wirken am besten auf Geraden.' });
    return out;
  }
  const blocked = () => problems().some(p => p.level === 'bad');

  // ---------- panel ----------
  function renderPanel() {
    $('.ed-name').value = def.name; $('.ed-theme').value = def.theme;
    const L = report ? Math.round(report.length) : 0;
    $('.ed-stats').innerHTML = `<span><b>${L} m</b> pro Runde</span><span><b>${def.nodes.length}</b> Punkte</span><span><b>${def.jumps.length}</b> Sprünge</span>`;
    if (selected >= 0 && def.nodes[selected]) {
      const n = def.nodes[selected], jump = def.jumps.find(j => j.node === selected);
      $('.ed-node').innerHTML = `<div class="ed-node-title">PUNKT ${selected + 1}${selected === 0 ? ' · START' : ''}</div>
        <label class="ed-range"><small>HÖHE <b>${n[2].toFixed(1)} m</b></small><input type="range" min="0" max="30" step=".5" value="${n[2]}" data-node="height"></label>
        <label class="ed-check"><input type="checkbox" data-node="jump" ${jump ? 'checked' : ''}> Sprungschanze an diesem Punkt</label>
        ${jump ? `<label class="ed-range"><small>LÜCKE NACH DER SCHANZE <b>${jump.gap} m</b></small><input type="range" min="0" max="18" step="1" value="${jump.gap}" data-node="gap"></label>` : ''}
        <button class="secondary ed-del" data-ed="delete" ${def.nodes.length <= MIN_NODES ? 'disabled' : ''}>Punkt löschen</button>`;
    } else $('.ed-node').innerHTML = '<div class="ed-node-hint">Klick auf einen Punkt, um Höhe und Sprung einzustellen.</div>';
    const list = problems();
    $('.ed-warn').innerHTML = list.length ? list.map(p => `<p class="${p.level}">${p.level === 'bad' ? '✕' : '!'} ${p.text}</p>`).join('') : '<p class="ok">✓ Strecke ist fahrbereit.</p>';
    for (const b of root.querySelectorAll('[data-ed^="test"]')) b.disabled = blocked();
    const saved = readStore();
    $('.ed-saved').innerHTML = saved.length ? `<div class="ed-node-title">GESPEICHERTE STRECKEN</div>${saved.map((t, i) => `<div class="ed-saved-row"><button class="secondary" data-load="${i}">${esc(t.name)}</button><button class="ed-x" data-remove="${i}" aria-label="${esc(t.name)} löschen">✕</button></div>`).join('')}` : '';
  }

  // ---------- drawing ----------
  const toScreen = (x, z) => [canvas.width / 2 + (x - view.x) * view.k, canvas.height / 2 + (z - view.z) * view.k];
  const toWorld = (sx, sz) => [(sx - canvas.width / 2) / view.k + view.x, (sz - canvas.height / 2) / view.k + view.z];
  function fit() {
    const xs = def.nodes.map(n => n[0]), zs = def.nodes.map(n => n[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    view.x = (x0 + x1) / 2; view.z = (z0 + z1) / 2;
    view.k = Math.min(canvas.width / (x1 - x0 + 160), canvas.height / (z1 - z0 + 160));
  }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(200, r.width * dpr); canvas.height = Math.max(200, r.height * dpr);
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  }
  function draw() {
    if (!open) return;
    const W = canvas.width, H = canvas.height, dpr = Math.min(devicePixelRatio || 1, 2);
    ctx.fillStyle = '#10202a'; ctx.fillRect(0, 0, W, H);
    // grid: 20 m, every 100 m brighter
    const step = 20;
    const [wx0, wz0] = toWorld(0, 0), [wx1, wz1] = toWorld(W, H);
    for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) { const [sx] = toScreen(x, 0); ctx.strokeStyle = x % 100 ? '#ffffff0a' : '#ffffff1c'; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); }
    for (let z = Math.floor(wz0 / step) * step; z <= wz1; z += step) { const [, sz] = toScreen(0, z); ctx.strokeStyle = z % 100 ? '#ffffff0a' : '#ffffff1c'; ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(W, sz); ctx.stroke(); }
    if (built) {
      const P = built.track.points, wpx = built.track.width * view.k;
      // road ribbon, coloured by height (low = grey, high = orange); drawn low first so bridges sit on top
      const segs = P.map((p, i) => ({ a: p, b: P[(i + 1) % P.length] })).sort((u, v) => (u.a.y + u.b.y) - (v.a.y + v.b.y));
      ctx.lineCap = 'round';
      const stroke = (list, outline) => { for (const { a, b } of list) {
        const h = Math.min(1, (a.y + b.y) / 2 / 25), [ax, az] = toScreen(a.x, a.z), [bx, bz] = toScreen(b.x, b.z);
        ctx.strokeStyle = outline ? '#0a141a' : `rgb(${90 + h * 165},${96 + h * 40},${104 - h * 60})`; ctx.lineWidth = outline ? wpx + 4 * dpr : wpx;
        ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
      } };
      // outline then fill for the whole road, then the raised parts again on top so bridges read as bridges
      stroke(segs, true); stroke(segs, false);
      const raised = segs.filter(({ a }) => a.y > 3);
      if (raised.length) { stroke(raised, true); stroke(raised, false); }
      // jump gaps
      for (const j of built.track.jumps) {
        const s = built.track.sample(j.t), e = built.track.sample(j.t + Math.max(3, j.gap) / built.track.length);
        const [ax, az] = toScreen(s.x, s.z), [bx, bz] = toScreen(e.x, e.z);
        ctx.strokeStyle = '#39b8ff'; ctx.lineWidth = wpx * .8; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke(); ctx.setLineDash([]);
      }
      // start line with driving direction
      const s0 = built.track.sample(0), s1 = built.track.sample(14 / built.track.length);
      const [sx, sz] = toScreen(s0.x, s0.z), [ex, ez] = toScreen(s1.x, s1.z);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * dpr;
      const nx = s0.nx * built.track.width / 2 * view.k, nz = s0.nz * built.track.width / 2 * view.k;
      ctx.beginPath(); ctx.moveTo(sx - nx, sz - nz); ctx.lineTo(sx + nx, sz + nz); ctx.stroke();
      ctx.fillStyle = '#ff653d'; const ang = Math.atan2(ez - sz, ex - sx);
      ctx.beginPath(); ctx.moveTo(ex + Math.cos(ang) * 10 * dpr, ez + Math.sin(ang) * 10 * dpr); ctx.lineTo(ex + Math.cos(ang + 2.5) * 9 * dpr, ez + Math.sin(ang + 2.5) * 9 * dpr); ctx.lineTo(ex + Math.cos(ang - 2.5) * 9 * dpr, ez + Math.sin(ang - 2.5) * 9 * dpr); ctx.fill();
      // problem markers
      if (report) {
        for (const c of report.tight) { const [x, z] = toScreen(c.x, c.z); ctx.fillStyle = '#ffd04a55'; ctx.beginPath(); ctx.arc(x, z, 7 * dpr, 0, 7); ctx.fill(); }
        for (const c of report.conflicts) { const [x, z] = toScreen(c.x, c.z); ctx.fillStyle = '#ff3a3a88'; ctx.beginPath(); ctx.arc(x, z, 9 * dpr, 0, 7); ctx.fill(); }
      }
    }
    // control points
    def.nodes.forEach((n, i) => {
      const [x, z] = toScreen(n[0], n[1]), r = (i === selected ? 9 : 7) * dpr, jump = def.jumps.some(j => j.node === i);
      ctx.fillStyle = i === 0 ? '#ff653d' : jump ? '#39b8ff' : '#f5f5f0'; ctx.strokeStyle = i === selected ? '#ffd04a' : '#10202a'; ctx.lineWidth = 3 * dpr;
      ctx.beginPath(); ctx.arc(x, z, r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#10202a'; ctx.font = `900 ${8 * dpr}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, z + .5);
      if (n[2] > 0) { ctx.fillStyle = '#ffd04a'; ctx.font = `700 ${9 * dpr}px Arial`; ctx.fillText(`${n[2].toFixed(0)} m`, x, z - 15 * dpr); }
    });
  }

  // ---------- pointer interaction ----------
  let drag = null;
  const pointer = e => { const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width; return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
  function hitNode(sx, sz) {
    const dpr = canvas.width / canvas.getBoundingClientRect().width;
    let best = -1, bd = 14 * dpr;
    def.nodes.forEach((n, i) => { const [x, z] = toScreen(n[0], n[1]), d = Math.hypot(x - sx, z - sz); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  // Index after which a click on the road should insert a new point (nearest polygon edge).
  function nearestEdge(wx, wz) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < def.nodes.length; i++) {
      const a = def.nodes[i], b = def.nodes[(i + 1) % def.nodes.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const u = Math.max(0, Math.min(1, ((wx - a[0]) * dx + (wz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(wx - a[0] - dx * u, wz - a[1] - dz * u);
      if (d < bd) { bd = d; best = i; }
    }
    return { index: best, distance: bd };
  }
  function removeNode(i) {
    if (def.nodes.length <= MIN_NODES) { toast('Eine Strecke braucht mindestens 4 Punkte.'); return; }
    def.nodes.splice(i, 1);
    def.jumps = def.jumps.filter(j => j.node !== i).map(j => ({ ...j, node: j.node > i ? j.node - 1 : j.node }));
    selected = -1; rebuild();
  }
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); const [sx, sz] = pointer(e), i = hitNode(sx, sz); if (i >= 0) removeNode(i); });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const [sx, sz] = pointer(e), i = hitNode(sx, sz);
    drag = { i, sx, sz, vx: view.x, vz: view.z, moved: false };
    if (i >= 0) { selected = i; renderPanel(); draw(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const [sx, sz] = pointer(e);
    if (Math.hypot(sx - drag.sx, sz - drag.sz) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.i >= 0) { const [wx, wz] = toWorld(sx, sz); def.nodes[drag.i][0] = Math.round(wx); def.nodes[drag.i][1] = Math.round(wz); rebuild(false); }
    else { view.x = drag.vx - (sx - drag.sx) / view.k; view.z = drag.vz - (sz - drag.sz) / view.k; draw(); }
  });
  canvas.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.i >= 0) { if (d.moved) rebuild(); return; }
    if (d.moved) return;
    // a click (no drag) near the road inserts a point there
    const [wx, wz] = toWorld(d.sx, d.sz), edge = nearestEdge(wx, wz);
    if (edge.distance * view.k > 40 * (canvas.width / canvas.getBoundingClientRect().width)) { selected = -1; renderPanel(); draw(); return; }
    if (def.nodes.length >= MAX_NODES) { toast('Maximal 80 Punkte.'); return; }
    const a = def.nodes[edge.index], b = def.nodes[(edge.index + 1) % def.nodes.length];
    def.nodes.splice(edge.index + 1, 0, [Math.round(wx), Math.round(wz), +((a[2] + b[2]) / 2).toFixed(1)]);
    def.jumps = def.jumps.map(j => ({ ...j, node: j.node > edge.index ? j.node + 1 : j.node }));
    selected = edge.index + 1; rebuild();
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [sx, sz] = pointer(e), [wx, wz] = toWorld(sx, sz);
    view.k = Math.max(.25, Math.min(8, view.k * Math.exp(-e.deltaY * .0015)));
    const [nx, nz] = toWorld(sx, sz); view.x += wx - nx; view.z += wz - nz; draw();
  }, { passive: false });
  addEventListener('keydown', e => {
    if (!open || e.target.matches('input,select,textarea')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected >= 0) { e.preventDefault(); removeNode(selected); }
    if (e.key === 'Escape') close();
  });
  addEventListener('resize', () => { if (open) { resize(); draw(); } });

  // ---------- panel controls ----------
  $('.ed-name').addEventListener('input', e => { def.name = e.target.value.slice(0, 40); try { localStorage.setItem(DRAFT, JSON.stringify(def)); } catch {} });
  $('.ed-theme').addEventListener('change', e => { def.theme = e.target.value; rebuild(); });
  $('.ed-node').addEventListener('input', e => {
    const kind = e.target.dataset.node; if (!kind || selected < 0) return;
    if (kind === 'height') { def.nodes[selected][2] = +e.target.value; e.target.previousElementSibling.querySelector('b').textContent = (+e.target.value).toFixed(1) + ' m'; rebuild(false); }
    if (kind === 'gap') { const j = def.jumps.find(x => x.node === selected); if (j) { j.gap = +e.target.value; e.target.previousElementSibling.querySelector('b').textContent = j.gap + ' m'; } rebuild(false); }
  });
  $('.ed-node').addEventListener('change', e => {
    const kind = e.target.dataset.node; if (!kind || selected < 0) return;
    if (kind === 'jump') { if (e.target.checked) def.jumps.push({ node: selected, gap: 10 }); else def.jumps = def.jumps.filter(j => j.node !== selected); }
    rebuild();
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.load !== undefined) { const t = readStore()[+b.dataset.load]; if (t) { try { load(decodeTrackCode(t.code)); toast('GELADEN: ' + t.name); } catch (err) { toast(err.message); } } return; }
    if (b.dataset.remove !== undefined) { const list = readStore(); const [gone] = list.splice(+b.dataset.remove, 1); writeStore(list); renderPanel(); if (gone) toast('GELÖSCHT: ' + gone.name); return; }
    const a = b.dataset.ed;
    if (a === 'delete' && selected >= 0) removeNode(selected);
    if (a === 'test-race' || a === 'test-time') { if (blocked()) return; close(false); onTest(clone(def), a === 'test-race' ? 'race' : 'time'); }
    if (a === 'save') { const code = encodeTrackCode(def), list = readStore().filter(t => t.name !== def.name); list.unshift({ name: def.name, code, at: Date.now() }); toast(writeStore(list) ? 'GESPEICHERT: ' + def.name : 'Speichern blockiert'); renderPanel(); }
    if (a === 'copy') { const code = encodeTrackCode(def); try { await navigator.clipboard.writeText(code); toast('CODE KOPIERT · schick ihn deinen Freunden'); } catch { prompt('Strecken-Code zum Kopieren:', code); } }
    if (a === 'paste') { const code = prompt('Strecken-Code einfügen (beginnt mit APX1-):'); if (code) { try { load(decodeTrackCode(code)); toast('STRECKE GELADEN'); } catch (err) { toast(err.message); } } }
    if (a === 'new') { load(clone(STARTER_TRACK)); }
    if (a === 'close') close();
  });

  function load(next) { def = { name: next.name, theme: next.theme, nodes: next.nodes.map(n => [n[0], n[1], n[2] || 0]), jumps: (next.jumps || []).map(j => ({ ...j })) }; selected = -1; resize(); fit(); rebuild(); }
  function show(start) {
    open = true; root.hidden = false;
    let draft = null; try { draft = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch {}
    load(start || (draft && Array.isArray(draft.nodes) && draft.nodes.length >= MIN_NODES ? draft : clone(STARTER_TRACK)));
  }
  function close(notify = true) { open = false; root.hidden = true; if (notify) onClose(); }
  return { open: show, close, get isOpen() { return open; }, current: () => def && clone(def) };
}
