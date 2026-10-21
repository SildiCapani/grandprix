// Four-player, host-authoritative WebRTC sessions. Signalling stays in the
// invitation/answer codes; only car and race data travel over the data channels.
const MAP_IDS = new Set(['coast', 'canyon', 'neon', 'volcano', 'glacier', 'stars', 'jungle', 'savanna', 'forest', 'sky', 'sakura', 'moon', 'pirate', 'candy', 'castle', 'arctic', 'rooftops', 'galaxy']);
const KART_IDS = new Set(['allround', 'bolide', 'flitzer', 'brummer', 'drifter', 'buggy']);
const DEFAULT_COLOR = '#ee4b37';
const CAR_COLORS = ['#ee4b37', '#42c9cb', '#edc44b', '#9b87e5'];
const PREFIX = 'APX1-';
const MAX_CODE = 80000;
const MAX_MESSAGE = 24000;
const LIMIT = 8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = v => typeof v === 'number' && Number.isFinite(v);
const nameOf = v => String(v || 'Rookie Pilot').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) || 'Rookie Pilot';
const colorOf = v => /^#[\da-f]{6}$/i.test(v || '') ? v.toLowerCase() : DEFAULT_COLOR;
const idOf = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{5,64}$/.test(v);
const clone = v => JSON.parse(JSON.stringify(v));
function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}
function encode(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(code, type) {
  const raw = String(code || '').replace(/\s/g, '');
  if (raw.length > MAX_CODE || !raw.startsWith(PREFIX) || !/^[\w-]+$/.test(raw)) throw new Error('Ungültiger Verbindungscode. Bitte den vollständigen Code einfügen.');
  let data;
  try {
    const text = raw.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(text + '='.repeat((4 - text.length % 4) % 4));
    data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
  } catch { throw new Error('Dieser Verbindungscode ist beschädigt. Bitte neu kopieren.'); }
  if (!data || data.v !== 1 || data.type !== type || !idOf(data.roomId) || !idOf(data.peerId) || !idOf(data.hostId) || !MAP_IDS.has(data.mapId)
    || typeof data.name !== 'string' || data.name.length > 20 || typeof data.color !== 'string' || !/^#[\da-f]{6}$/i.test(data.color)
    || data.description?.type !== type || typeof data.description?.sdp !== 'string' || data.description.sdp.length > 55000
    || !data.description.sdp.startsWith('v=0')) throw new Error('Dieser Code gehört nicht zu einer gültigen Apex-Rush-Einladung.');
  return data;
}
function cleanCar(state) {
  if (!state || !['x', 'z', 'angle', 'speed', 'progress'].every(k => finite(state[k]))) return null;
  return {
    // Outdoor circuits span roughly ±260 m.
    x: clamp(state.x, -400, 400), z: clamp(state.z, -400, 400), angle: state.angle % (Math.PI * 2),
    speed: clamp(state.speed, -60, 60), steer: finite(state.steer) ? clamp(state.steer, -1, 1) : 0,
    vx: finite(state.vx) ? clamp(state.vx, -60, 60) : 0, vz: finite(state.vz) ? clamp(state.vz, -60, 60) : 0,
    bubble: state.bubble === true, ink: finite(state.ink) ? clamp(Math.floor(state.ink), 0, 999) : 0,
    y: finite(state.y) ? clamp(state.y, -60, 80) : 0, fallT: finite(state.fallT) ? clamp(state.fallT, 0, 4) : 0, pitch: finite(state.pitch) ? clamp(state.pitch, -1.2, 1.2) : 0,
    kart: KART_IDS.has(state.kart) ? state.kart : 'allround',
    skin: typeof state.skin === 'string' && /^[a-z]{2,12}$/.test(state.skin) ? state.skin : 'none',
    finish: ['standard', 'gold', 'chrome', 'neon'].includes(state.finish) ? state.finish : 'standard', mass: finite(state.mass) ? clamp(state.mass, .5, 2) : 1,
    trail: ['banana', 'green', 'red'].includes(state.trail) ? state.trail : null,
    star: state.star === true, rocket: state.rocket === true, spinA: finite(state.spinA) ? clamp(state.spinA, 0, 40) : 0,
    items: Array.isArray(state.items) ? state.items.slice(0, 12).filter(it => it && ['green', 'red', 'banana', 'blue'].includes(it.type) && finite(it.x) && finite(it.z))
      .map(it => ({type: it.type, x: clamp(it.x, -400, 400), z: clamp(it.z, -400, 400), y: finite(it.y) ? clamp(it.y, -5, 80) : 0, b: it.b === 1 ? 1 : undefined})) : [],
    // Host-simulated AI drivers (online fill-up) and item hits that guests report on them.
    bots: Array.isArray(state.bots) ? state.bots.slice(0, 7).filter(b => b && ['x', 'z', 'a', 's', 'p'].every(k => finite(b[k]))).map(b => ({
      n: finite(b.n) ? clamp(Math.floor(b.n), 0, 6) : 0, x: clamp(b.x, -400, 400), z: clamp(b.z, -400, 400), y: finite(b.y) ? clamp(b.y, -60, 80) : 0, fa: finite(b.fa) ? clamp(b.fa, 0, 4) : 0, pi: finite(b.pi) ? clamp(b.pi, -1.2, 1.2) : 0, a: b.a % (Math.PI * 2), s: clamp(b.s, -60, 60), bu: b.bu === 1 ? 1 : undefined,
      vx: finite(b.vx) ? clamp(b.vx, -70, 70) : 0, vz: finite(b.vz) ? clamp(b.vz, -70, 70) : 0, sp: finite(b.sp) ? clamp(b.sp, 0, 40) : 0, p: clamp(b.p, -.2, 4),
      st: b.st === true, rk: b.rk === true, tr: ['banana', 'green', 'red'].includes(b.tr) ? b.tr : undefined, b: b.b === true, dt: finite(b.dt) ? clamp(Math.floor(b.dt), 0, 3) : 0, dr: finite(b.dr) ? clamp(Math.sign(b.dr), -1, 1) : 0 })) : [],
    hits: Array.isArray(state.hits) ? state.hits.slice(0, 8).filter(h => h && typeof h.id === 'string' && h.id.length < 30 && finite(h.bot) && ['green', 'red', 'banana', 'star', 'blue', 'ink'].includes(h.k))
      .map(h => ({id: h.id, bot: clamp(Math.floor(h.bot), 0, 6), k: h.k})) : [],
    boosting: state.boosting === true, drifting: state.drifting === true,
    progress: clamp(state.progress, -.2, 4), lap: finite(state.lap) ? clamp(Math.floor(state.lap), 0, 4) : 0,
    elapsed: finite(state.elapsed) ? clamp(state.elapsed, 0, 1800) : 0,
  };
}
function cleanFinish(data) {
  if (!data || !finite(data.time) || data.time <= 0 || data.time > 1800) return null;
  const stats = {};
  if (data.stats && typeof data.stats === 'object') {
    for (const [key, value] of Object.entries(data.stats).slice(0, 20)) {
      if (/^[\w]{1,32}$/.test(key) && finite(value)) stats[key] = clamp(value, -1e6, 1e6);
    }
  }
  return {time: data.time, bestLap: finite(data.bestLap) && data.bestLap >= 0 ? clamp(data.bestLap, 0, 1800) : null,
    stats, coins: finite(data.coins) ? clamp(Math.floor(data.coins), 0, 10000) : 0};
}

export class MultiplayerSession {
  constructor({onChange = () => {}, onEvent = () => {}, onState = () => {}} = {}) {
    this.onChange = onChange; this.onEvent = onEvent; this.onState = onState;
    this._state = this._empty(); this._peers = new Map(); this._clockOffset = 0;
    this._timer = null; this._firstFinish = 0; this._lastPing = 0; this._disposed = false;
  }
  _empty() { return {role: 'idle', status: 'idle', roomId: '', selfId: '', hostId: '', mapId: 'coast', players: [], race: null, error: ''}; }
  get state() { return clone(this._state); }
  get isHost() { return this._state.role === 'host'; }
  get canStart() {
    const players = this._state.players;
    return this.isHost && this._state.status === 'lobby' && players.length >= 2 && players.every(p => p.connected && p.ready);
  }
  now() { return Date.now() + this._clockOffset; }
  _change() { this.onChange(this.state); }
  _error(message) { this._state.error = message; this._change(); }
  _player(id, name, color, connected = true) {
    return {id, name: nameOf(name), color: colorOf(color), ready: false, connected, progress: 0, finishedTime: null, dnf: false};
  }
  _begin() {
    this._disposed = false;
    this._timer = setInterval(() => this._tick(), 250);
  }
  async host({name, color, mapId = 'coast'} = {}) {
    this.leave(true); this._state = this._empty();
    if (!MAP_IDS.has(mapId)) throw new Error('Unbekannte Strecke.');
    const id = uid();
    this._state = {role: 'host', status: 'lobby', roomId: uid(), selfId: id, hostId: id, mapId,
      players: [this._player(id, name, color)], race: null, error: ''};
    this._clockOffset = 0; this._begin(); this._change();
    return this.state;
  }
  _createPeer(id) {
    if (!globalThis.RTCPeerConnection) throw new Error('Dieser Browser unterstützt WebRTC nicht. Bitte einen aktuellen Firefox, Chrome oder Edge verwenden.');
    const pc = new RTCPeerConnection({iceServers: [
      {urls: 'stun:stun.cloudflare.com:3478'}, {urls: 'stun:stun.l.google.com:19302'},
    ]});
    const peer = {id, pc, channel: null, ready: false, connected: false, accepted: false, timer: null, connectSince: 0, lastSeen: Date.now(), pendingPings: new Map()};
    this._peers.set(id, peer);
    pc.onconnectionstatechange = () => {
      if (!this._peers.has(id)) return;
      if (pc.connectionState === 'connecting' && !peer.connectSince) peer.connectSince = Date.now();
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // The guest already starts ICE while its answer is still being copied.
        // A native ICE failure here must not dismiss the answer-code screen.
        if (!this._awaitingHost(peer)) this._dropPeer(id, 'Die Direktverbindung ist abgebrochen.');
      }
      if (pc.connectionState === 'disconnected') peer.disconnectedAt = Date.now();
      if (pc.connectionState === 'connected') { peer.disconnectedAt = 0; peer.connectSince = 0; }
    };
    pc.ondatachannel = event => this._bindChannel(peer, event.channel);
    return peer;
  }
  _bindChannel(peer, channel) {
    if (peer.channel && peer.channel !== channel) { channel.close(); return; }
    peer.channel = channel;
    channel.onopen = () => {
      if (!this._peers.has(peer.id)) return;
      peer.connected = true; peer.connectSince = 0; peer.lastSeen = Date.now();
      if (!this.isHost) {
        const self = this._state.players.find(p => p.id === this._state.selfId);
        this._send(peer, {type: 'hello', name: self?.name, color: self?.color});
      }
    };
    channel.onmessage = event => {
      if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE || !this._peers.has(peer.id)) return;
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
      peer.lastSeen = Date.now(); this._message(peer, data);
    };
    channel.onclose = () => { if (!this._awaitingHost(peer)) this._dropPeer(peer.id, 'Die Verbindung zum Rennen wurde geschlossen.'); };
    channel.onerror = () => { if (channel.readyState !== 'open' && !this._awaitingHost(peer)) this._dropPeer(peer.id, 'Die Direktverbindung konnte nicht aufgebaut werden.'); };
  }
  _awaitingHost(peer) { return !this.isHost && this._state.status === 'connecting' && !peer.ready; }
  async _gather(pc) {
    if (pc.iceGatheringState !== 'complete') await new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); };
      const check = () => { if (pc.iceGatheringState === 'complete') done(); };
      pc.addEventListener('icegatheringstatechange', check); timer = setTimeout(done, 7000); check();
    });
    if (!pc.localDescription?.sdp) throw new Error('Es konnte kein Verbindungscode erstellt werden.');
    // An SDP with no gathered candidate cannot work with one-shot signalling.
    if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error('Keine Netzwerkverbindung für WebRTC gefunden. Bitte WLAN/VPN und Browser prüfen und einen neuen Code erstellen.');
    return {type: pc.localDescription.type, sdp: pc.localDescription.sdp};
  }
  _envelope(type, peerId, description) {
    const me = this._state.players.find(p => p.id === this._state.selfId);
    return {v: 1, type, roomId: this._state.roomId, peerId, hostId: this._state.hostId, mapId: this._state.mapId,
      name: me.name, color: me.color, description};
  }
  async createInvite() {
    if (!this.isHost || this._state.status !== 'lobby') throw new Error('Einladungen sind nur in der Gastgeber-Lobby möglich.');
    if (this._peers.size >= LIMIT - 1) throw new Error('Alle acht Startplätze sind belegt oder bereits eingeladen.');
    const peer = this._createPeer(uid());
    try {
      this._bindChannel(peer, peer.pc.createDataChannel('apex-rush', {ordered: true}));
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      const description = await this._gather(peer.pc);
      if (!this._peers.has(peer.id)) throw new Error('Die Einladung wurde abgebrochen.');
      return encode(this._envelope('offer', peer.id, description));
    } catch (error) { this._closePeer(peer.id); this._error(error.message); throw error; }
  }
  cancelPendingInvites() {
    if (!this.isHost || this._state.status !== 'lobby') return false;
    for (const [id, peer] of [...this._peers]) if (!peer.ready) this._closePeer(id);
    return true;
  }
  async join({code, name, color} = {}) {
    const invite = decode(code, 'offer');
    this.leave(true); this._state = this._empty(); this._clockOffset = 0;
    this._state = {role: 'guest', status: 'connecting', roomId: invite.roomId, selfId: invite.peerId, hostId: invite.hostId,
      mapId: invite.mapId, players: [this._player(invite.hostId, invite.name, invite.color, false), this._player(invite.peerId, name, color)], race: null, error: ''};
    this._begin(); this._change();
    let peer;
    try {
      peer = this._createPeer(invite.hostId);
      await peer.pc.setRemoteDescription(invite.description);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      const description = await this._gather(peer.pc);
      if (!this._peers.has(peer.id)) throw new Error('Die Verbindung wurde abgebrochen.');
      return encode(this._envelope('answer', invite.peerId, description));
    } catch (error) { if (peer) this._closePeer(peer.id); this._state.status = 'closed'; this._error(error.message); throw error; }
  }
  async acceptAnswer(code) {
    if (!this.isHost || this._state.status !== 'lobby') throw new Error('Die Gastgeber-Lobby ist nicht geöffnet.');
    const answer = decode(code, 'answer');
    const peer = this._peers.get(answer.peerId);
    if (answer.roomId !== this._state.roomId || answer.hostId !== this._state.selfId || !peer) throw new Error('Diese Antwort gehört zu einer anderen oder abgelaufenen Einladung.');
    if (peer.accepted) throw new Error('Diese Antwort wurde bereits verbunden.');
    try {
      peer.accepted = true; peer.pendingName = answer.name; peer.pendingColor = answer.color;
      peer.connectSince = Date.now();
      await peer.pc.setRemoteDescription(answer.description);
      this._state.error = ''; this._change();
    } catch (error) { this._dropPeer(peer.id, 'Antwort konnte nicht verbunden werden. Bitte eine neue Einladung erstellen.'); throw error; }
  }
  _send(peer, data, ephemeral = false) {
    if (!peer?.channel || peer.channel.readyState !== 'open') return false;
    if (ephemeral && peer.channel.bufferedAmount > 65536) return false;
    try { peer.channel.send(JSON.stringify(data)); return true; } catch { return false; }
  }
  _broadcast(data, except = '', ephemeral = false) {
    for (const peer of this._peers.values()) if (peer.id !== except && peer.ready) this._send(peer, data, ephemeral);
  }
  _roster() {
    this._broadcast({type: 'roster', players: this._state.players, mapId: this._state.mapId, status: this._state.status, race: this._state.race});
    this._change();
  }
  _message(peer, data) {
    if (this.isHost) {
      if (data.type === 'hello') {
        if (this._state.status !== 'lobby' || !peer.accepted) return;
        peer.ready = true;
        let player = this._state.players.find(p => p.id === peer.id);
        if (!player) {
          const used = new Set(this._state.players.map(p => p.color));
          const desired = colorOf(data.color);
          const color = used.has(desired) ? CAR_COLORS.find(c => !used.has(c)) || desired : desired;
          this._state.players.push(this._player(peer.id, data.name, color));
        }
        else player.connected = true;
        this._state.error = ''; this._roster();
        this._send(peer, {type: 'clock', now: Date.now()});
        return;
      }
      if (!peer.ready) return;
      if (data.type === 'ping' && finite(data.sent) && typeof data.token === 'string' && data.token.length < 64) {
        this._send(peer, {type: 'pong', sent: data.sent, token: data.token, hostTime: Date.now()}); return;
      }
      if (data.type === 'ready' && this._state.status === 'lobby') {
        const player = this._state.players.find(p => p.id === peer.id); if (player) { player.ready = data.ready === true; this._roster(); } return;
      }
      if (data.type === 'leave') { this._dropPeer(peer.id, 'Spieler hat das Rennen verlassen.'); return; }
      if (data.raceId !== this._state.race?.id || this._state.status !== 'racing') return;
      if (data.type === 'state') {
        const state = cleanCar(data.state); if (!state) return;
        const player = this._state.players.find(p => p.id === peer.id);
        if (!player || player.dnf || player.finishedTime !== null) return;
        player.progress = state.progress;
        this.onState({id: peer.id, state, receivedAt: this.now()});
        this._broadcast({type: 'state', raceId: data.raceId, id: peer.id, state}, peer.id, true);
      } else if (data.type === 'finish') this._finishPlayer(peer.id, cleanFinish(data.finish));
      return;
    }
    if (peer.id !== this._state.hostId) return;
    if (data.type === 'pong') {
      const sent = peer.pendingPings.get(data.token);
      if (finite(sent) && finite(data.hostTime)) {
        peer.pendingPings.delete(data.token); const rtt = Date.now() - sent;
        if (rtt >= 0 && rtt < 10000) { this._clockOffset = data.hostTime - (sent + rtt / 2); this._state.ping = Math.round(this._state.ping ? this._state.ping * .6 + rtt * .4 : rtt); }
      } return;
    }
    if (data.type === 'clock' && finite(data.now)) { this._clockOffset = data.now - Date.now(); return; }
    if (data.type === 'closed') { this._hostClosed('Der Gastgeber hat die Lobby geschlossen.'); return; }
    if (data.type === 'roster') {
      const players = this._cleanRoster(data.players);
      if (!players || !MAP_IDS.has(data.mapId) || !players.some(p => p.id === this._state.selfId)) return;
      const was = this._state.status;
      this._state.players = players; this._state.mapId = data.mapId; peer.ready = true;
      if (data.status === 'lobby') { this._state.status = 'lobby'; this._state.race = null; }
      this._state.error = ''; this._change();
      if (was === 'connecting') this._ping(peer);
      return;
    }
    if (!peer.ready) return;
    if (data.type === 'start' && idOf(data.race?.id) && finite(data.race.startAt)) {
      if (this._state.race?.id === data.race.id) return;
      this._state.status = 'racing'; this._state.race = {id: data.race.id, startAt: data.race.startAt, status: 'racing', cc: [80, 100, 120, 150].includes(data.race.cc) ? data.race.cc : 80};
      this._state.players.forEach(p => { p.progress = 0; p.finishedTime = null; p.dnf = false; });
      this._change(); this.onEvent({type: 'start', race: clone(this._state.race)}); return;
    }
    if (data.raceId !== this._state.race?.id) return;
    if (data.type === 'state' && this._state.status === 'racing' && data.id !== this._state.selfId) {
      const state = cleanCar(data.state), player = this._state.players.find(p => p.id === data.id);
      if (!state || !player) return;
      player.progress = state.progress;
      this.onState({id: data.id, state, receivedAt: this.now()});
    } else if (data.type === 'results' && Array.isArray(data.results)) {
      const results = this._cleanResults(data.results); if (!results) return;
      this._state.status = 'results'; this._state.race.status = 'results'; this._state.race.results = results;
      for (const result of results) {
        const player = this._state.players.find(p => p.id === result.id);
        if (player) { player.finishedTime = result.time; player.dnf = result.dnf; player.progress = result.progress; }
      }
      this._change(); this.onEvent({type: 'results', results: clone(results), race: clone(this._state.race)});
    }
  }
  _cleanRoster(raw) {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > LIMIT || new Set(raw.map(p => p?.id)).size !== raw.length) return null;
    if (raw.some(p => !p || !idOf(p.id) || typeof p.name !== 'string' || typeof p.color !== 'string')) return null;
    return raw.map(p => ({...this._player(p.id, p.name, p.color, p.connected === true), ready: p.ready === true,
      progress: finite(p.progress) ? clamp(p.progress, -.2, 4) : 0,
      finishedTime: finite(p.finishedTime) ? clamp(p.finishedTime, 0, 1800) : null, dnf: p.dnf === true}));
  }
  _cleanResults(raw) {
    if (raw.length !== this._state.players.length || new Set(raw.map(p => p?.id)).size !== raw.length) return null;
    const results = [];
    for (const [index, row] of raw.entries()) {
      const player = this._state.players.find(p => p.id === row?.id); if (!player) return null;
      const finish = cleanFinish(row);
      if (!row.dnf && !finish) return null;
      results.push({...player, ...(finish || {time: null, bestLap: null, stats: {}, coins: 0}),
        finishedTime: finish?.time ?? null, dnf: row.dnf === true, place: index + 1,
        progress: finite(row.progress) ? clamp(row.progress, 0, 4) : player.progress});
    }
    return results;
  }
  setReady(ready) {
    if (this._state.status !== 'lobby') return;
    if (this.isHost) { const me = this._state.players.find(p => p.id === this._state.selfId); me.ready = !!ready; this._roster(); }
    else this._send(this._peers.get(this._state.hostId), {type: 'ready', ready: !!ready});
  }
  setMap(mapId) {
    if (!this.isHost || this._state.status !== 'lobby' || !MAP_IDS.has(mapId)) return false;
    this._state.mapId = mapId; this._state.players.forEach(p => { p.ready = false; }); this._roster(); return true;
  }
  startRace(extra = {}) {
    if (!this.canStart) throw new Error('Mindestens zwei verbundene Fahrer müssen bereit sein.');
    this._state.status = 'racing'; this._state.error = ''; this._firstFinish = 0;
    this._state.race = {id: uid(), startAt: Date.now() + 4000, status: 'racing', cc: [80, 100, 120, 150].includes(extra.cc) ? extra.cc : 80};
    this._state.players.forEach(p => { p.progress = 0; p.finishedTime = null; p.dnf = false; delete p.finish; });
    // Offers without a completed handshake cannot join a race in progress.
    for (const [id, peer] of this._peers) if (!peer.ready) this._closePeer(id);
    const race = clone(this._state.race);
    this._broadcast({type: 'start', race}); this._change(); this.onEvent({type: 'start', race});
    return race;
  }
  publishState(raw) {
    if (this._state.status !== 'racing' || !this._state.race) return;
    const state = cleanCar(raw), self = this._state.players.find(p => p.id === this._state.selfId);
    if (!state || !self || self.dnf || self.finishedTime !== null) return;
    self.progress = state.progress;
    const data = {type: 'state', raceId: this._state.race.id, state};
    if (this.isHost) this._broadcast({...data, id: this._state.selfId}, '', true);
    else this._send(this._peers.get(this._state.hostId), data, true);
  }
  finishRace(raw) {
    if (this._state.status !== 'racing' || this.now() < this._state.race.startAt) return;
    const finish = cleanFinish(raw); if (!finish) return;
    if (this.isHost) this._finishPlayer(this._state.selfId, finish);
    else this._send(this._peers.get(this._state.hostId), {type: 'finish', raceId: this._state.race.id, finish});
  }
  _finishPlayer(id, finish) {
    if (!finish || this._state.status !== 'racing' || Date.now() < this._state.race.startAt) return;
    const player = this._state.players.find(p => p.id === id);
    if (!player || player.finishedTime !== null || player.dnf) return;
    player.finishedTime = finish.time; player.progress = 3; player.finish = finish;
    if (!this._firstFinish) this._firstFinish = Date.now();
    this._roster(); this._maybeFinish();
  }
  _maybeFinish() {
    if (!this.isHost || this._state.status !== 'racing') return;
    const allDone = this._state.players.every(p => p.finishedTime !== null || p.dnf);
    if (!allDone && !(this._firstFinish && Date.now() - this._firstFinish >= 30000) && Date.now() - this._state.race.startAt < 180000) return;
    const players = [...this._state.players].sort((a, b) => {
      if (a.finishedTime !== null && b.finishedTime !== null) return a.finishedTime - b.finishedTime;
      if (a.finishedTime !== null) return -1; if (b.finishedTime !== null) return 1;
      return b.progress - a.progress;
    });
    const results = players.map((p, index) => {
      if (p.finishedTime === null) p.dnf = true;
      const {finish, ...player} = p;
      return {...player, ...(finish || {time: null, bestLap: null, stats: {}, coins: 0}), place: index + 1};
    });
    this._state.status = 'results'; this._state.race.status = 'results'; this._state.race.results = results;
    this._broadcast({type: 'results', raceId: this._state.race.id, results});
    this._change(); this.onEvent({type: 'results', results: clone(results), race: clone(this._state.race)});
  }
  restartLobby() {
    if (!this.isHost || this._state.status !== 'results') return false;
    this._state.status = 'lobby'; this._state.race = null; this._firstFinish = 0;
    this._state.players = this._state.players.filter(p => p.connected).map(p => this._player(p.id, p.name, p.color));
    this._roster(); return true;
  }
  _ping(peer) {
    const sent = Date.now(), token = uid();
    peer.pendingPings.set(token, sent);
    for (const [key, value] of peer.pendingPings) if (sent - value > 10000) peer.pendingPings.delete(key);
    this._send(peer, {type: 'ping', token, sent});
  }
  _tick() {
    const now = Date.now();
    for (const [id, peer] of [...this._peers]) {
      // There is no deadline for the manual code exchange. Only monitor a
      // guest after the host has actually acknowledged its data-channel hello.
      if (this._awaitingHost(peer)) continue;
      const checkTimeout = this.isHost && peer.accepted && !peer.ready && peer.connectSince && now - peer.connectSince > 45000;
      if (checkTimeout || peer.disconnectedAt && now - peer.disconnectedAt > 10000 || peer.ready && now - peer.lastSeen > 20000) {
        this._dropPeer(id, 'Direktverbindung nicht möglich. Bitte einen neuen Code versuchen oder ein anderes WLAN verwenden. Manche Netze benötigen einen Relay-Server.');
      }
    }
    if (now - this._lastPing >= 2000) {
      this._lastPing = now;
      if (!this.isHost) { const peer = this._peers.get(this._state.hostId); if (peer?.ready) this._ping(peer); }
    }
    this._maybeFinish();
  }
  _closePeer(id) {
    const peer = this._peers.get(id); if (!peer) return;
    this._peers.delete(id); clearTimeout(peer.timer);
    if (peer.channel) { peer.channel.onclose = null; peer.channel.onmessage = null; peer.channel.onopen = null; peer.channel.onerror = null; try { peer.channel.close(); } catch {} }
    peer.pc.onconnectionstatechange = null; peer.pc.ondatachannel = null; try { peer.pc.close(); } catch {}
  }
  _dropPeer(id, reason) {
    if (!this._peers.has(id)) return;
    this._closePeer(id);
    if (!this.isHost) { this._hostClosed(reason); return; }
    const player = this._state.players.find(p => p.id === id);
    if (player) {
      if (this._state.status === 'racing' || this._state.status === 'results') { player.connected = false; if (player.finishedTime === null) player.dnf = true; }
      else this._state.players = this._state.players.filter(p => p.id !== id);
    }
    this._state.error = reason; this._roster(); this._maybeFinish();
  }
  _hostClosed(reason) {
    if (this._state.status === 'closed' || this._state.role === 'idle') return;
    for (const id of [...this._peers.keys()]) this._closePeer(id);
    clearInterval(this._timer); this._timer = null;
    this._state.status = 'closed'; this._state.error = reason;
    this._state.players.forEach(p => { p.connected = false; });
    this._change(); this.onEvent({type: 'closed', reason});
  }
  leave(silent = false) {
    const active = this._state.role !== 'idle' && this._state.status !== 'closed';
    if (this.isHost) this._broadcast({type: 'closed'});
    else if (active) this._send(this._peers.get(this._state.hostId), {type: 'leave'});
    for (const id of [...this._peers.keys()]) this._closePeer(id);
    clearInterval(this._timer); this._timer = null; this._state = this._empty(); this._clockOffset = 0; this._firstFinish = 0;
    if (!silent) this._change();
  }
}
