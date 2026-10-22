import { MultiplayerSession } from './multiplayer.js';
import { Peer } from 'peerjs';
import { RelayPeer, RELAY_BROKERS, rankBrokers } from './mqtt-relay.js';

const APP = 'apex-rush-room-v1';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const roomId = code => `${APP}-${code}`;
const ICE_KEY = 'apex-rush-ice', RELAY_KEY = 'apex-rush-relay', UNI_KEY = 'apex-rush-unimode';
// Room codes that start with R use the server relay; the 2nd letter says which broker (A, B, C …).
const BROKER_LETTERS = 'SABC'; // S = own game server, A–C = public MQTT fallbacks
export const isRelayCode = code => /^R[SABC]/.test(code);
const store = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} } };

// Netzwerk-Einstellungen für strenge Netze (eduroam, Firmen-WLAN): eigener TURN-Server und Relay-Zwang.
export const networkSettings = {
  get custom() { return store.get(ICE_KEY); },
  set custom(v) { store.set(ICE_KEY, String(v || '').trim()); },
  get forceRelay() { return store.get(RELAY_KEY) === '1'; },
  set forceRelay(v) { store.set(RELAY_KEY, v ? '1' : ''); },
  // Uni-WLAN mode: all traffic via a server on port 443 instead of peer-to-peer. On by default.
  get uniMode() { return store.get(UNI_KEY) !== '0'; },
  set uniMode(v) { store.set(UNI_KEY, v ? '1' : '0'); },
};

// TURN REST credentials (RFC 7635 style): username = expiry:user, password = base64(HMAC-SHA1(secret, username)).
async function hmacCredential(secret, username) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// STUN finds the public address; TURN relays the data when two devices cannot reach each other
// directly – exactly what happens in university Wi-Fi with client isolation or blocked UDP.
export async function buildIceServers() {
  const servers = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
  const custom = networkSettings.custom;
  if (custom) {
    try {
      if (/^https:\/\//i.test(custom)) {
        // e.g. Metered: https://<app>.metered.live/api/v1/turn/credentials?apiKey=...
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 6000);
        const list = await (await fetch(custom, { signal: ctrl.signal })).json(); clearTimeout(t);
        if (Array.isArray(list)) servers.push(...list.filter(x => x && x.urls));
      } else {
        const parsed = JSON.parse(custom);
        servers.push(...(Array.isArray(parsed) ? parsed : [parsed]).filter(x => x && x.urls));
      }
    } catch (error) { console.warn('Eigener TURN-Zugang konnte nicht gelesen werden:', error); }
  }
  // Free public relay (Open Relay Project by Metered, static-auth endpoint) as a zero-setup fallback.
  try {
    if (globalThis.crypto?.subtle) {
      const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:apexrush`;
      const credential = await hmacCredential('openrelayprojectsecret', username);
      servers.push({ urls: ['turn:staticauth.openrelay.metered.ca:80', 'turn:staticauth.openrelay.metered.ca:80?transport=tcp',
        'turn:staticauth.openrelay.metered.ca:443', 'turns:staticauth.openrelay.metered.ca:443?transport=tcp'], username, credential });
    }
  } catch {}
  return servers;
}
export const iceFailedMessage = 'Direktverbindung blockiert: Dieses Netzwerk (z. B. eduroam) lässt Geräte nicht direkt miteinander sprechen, und auch der Relay-Server war nicht erreichbar. Lösung: alle in denselben Handy-Hotspot, oder unter „Wenn die Verbindung nicht klappt“ einen eigenen TURN-Zugang eintragen.';
const roomError = error => new Error(({
  'peer-unavailable': 'Diesen Raum gibt es nicht. Prüfe den Code und ob der Gastgeber seine Lobby geöffnet hat.',
  'unavailable-id': 'Dieser Raumcode ist bereits belegt. Bitte eine neue Lobby erstellen.',
  'network': 'Der Verbindungsdienst ist nicht erreichbar. Bitte Internet oder VPN prüfen und erneut versuchen.',
  'server-error': 'Der Verbindungsdienst ist gerade nicht erreichbar. Bitte erneut versuchen.',
  'socket-error': 'Die Verbindung zum Vermittlungsdienst ist unterbrochen. Bitte erneut versuchen.',
  'browser-incompatible': 'Dieser Browser unterstützt den Online-Modus nicht. Bitte einen aktuellen Chrome, Firefox oder Edge verwenden.',
})[error?.type] || error?.message || 'Die Online-Verbindung konnte nicht hergestellt werden.');

export function normalizeRoomCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 8 || [...code].some(char => !ALPHABET.includes(char))) throw new Error('Bitte den achtstelligen Raumcode eingeben, zum Beispiel ABCD-EFGH.');
  return code;
}
export const formatRoomCode = code => code ? `${code.slice(0, 4)}-${code.slice(4)}` : '';
function newCode(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = prefix + [...bytes].map(byte => ALPHABET[byte % ALPHABET.length]).join('').slice(prefix.length);
  if (!prefix && isRelayCode(code)) code = 'P' + code.slice(1); // direct codes never look like relay codes
  return code;
}

// PeerJS Cloud exchanges the SDP and ICE candidates automatically. The race
// protocol and host authority still use the existing direct WebRTC channels.
export class RoomMultiplayerSession extends MultiplayerSession {
  constructor(options = {}) { super(options); this._Peer = options.Peer || Peer; this._generation = 0; }
  _empty() { return {...super._empty(), roomCode: '', signaling: 'manual'}; }
  async hostRoom(options = {}) {
    await super.host(options);
    const generation = this._generation, relay = options.relay ?? networkSettings.uniMode;
    const tail = newCode().slice(2);
    let lastError = null;
    // Relay: try the brokers in order; the code tells guests which one answered.
    // Relay: measure every broker first and use the fastest one this network can reach.
    let order = RELAY_BROKERS.map((url, index) => ({ url, index, ms: 0 }));
    if (relay) { try { const ranked = await rankBrokers(); if (ranked.some(r => Number.isFinite(r.ms))) order = ranked; const own = order.find(r => r.index === 0 && Number.isFinite(r.ms)); if (own) order = [own, ...order.filter(r => r !== own)]; } catch {} this._state.brokerMs = Number.isFinite(order[0]?.ms) ? Math.round(order[0].ms) : null; }
    const attempts = relay ? order.filter(o => o.url).map(({ url, index }) => ({ code: 'R' + BROKER_LETTERS[index] + tail, url })) : [{ code: newCode(), url: null }];
    for (const { code, url } of attempts) {
      const id = roomId(code);
      this._relayUrl = url;
      Object.assign(this._state, {roomId: code, selfId: id, hostId: id, signaling: url ? 'relay' : 'cloud', route: url ? 'server' : ''});
      this._state.players[0].id = id;
      this._change();
      try {
        await this._openBroker(id);
        if (generation !== this._generation) throw new Error('Lobby-Erstellung abgebrochen.');
        this._state.roomCode = code; this._change(); return this.state;
      } catch (error) {
        lastError = error;
        if (generation !== this._generation) break;
        try { this._broker?.destroy(); } catch {} this._broker = null;
      }
    }
    if (generation === this._generation) this.leave();
    throw lastError || new Error('Der Verbindungsdienst ist nicht erreichbar.');
  }
  async joinRoom({code, name, color} = {}) {
    code = normalizeRoomCode(code);
    this.leave(true);
    const generation = this._generation, id = `${APP}-p-${crypto.randomUUID()}`, hostId = roomId(code);
    const relay = isRelayCode(code);
    this._relayUrl = relay ? RELAY_BROKERS[BROKER_LETTERS.indexOf(code[1])] : null;
    this._state = {...this._empty(), role: 'guest', status: 'connecting', roomId: code, roomCode: code,
      selfId: id, hostId, signaling: relay ? 'relay' : 'cloud', route: relay ? 'server' : '', players: [this._player(hostId, 'Gastgeber', '#42c9cb', false), this._player(id, name, color, true, this._look)]};
    this._begin(); this._change();
    try {
      await this._openBroker(id);
      if (generation !== this._generation) throw new Error('Beitritt abgebrochen.');
      await new Promise((resolve, reject) => {
        this._joinWaiter = {resolve, reject, timer: setTimeout(() => this._finishJoin(new Error(relay ? 'Der Gastgeber antwortet nicht über den Server. Prüfe den Raumcode und ob die Lobby noch offen ist.' : iceFailedMessage)), relay ? 20000 : 30000)};
        try { this._attachConnection(this._broker.connect(hostId, {reliable: true, serialization: 'json', metadata: {app: APP, room: code}})); }
        catch (error) { this._finishJoin(error); }
      });
      return this.state;
    } catch (error) { if (generation === this._generation) this.leave(); throw error; }
  }
  async _openBroker(id) {
    if (this._relayUrl) return this._openBrokerNow(id);
    this._iceServers = await buildIceServers();
    return this._openBrokerNow(id);
  }
  _openBrokerNow(id) {
    if (!this._Peer) return Promise.reject(new Error('Die Verbindungsbibliothek konnte nicht geladen werden. Bitte die aktuelle Spieldatei verwenden.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return; settled = true; clearTimeout(timer); this._brokerAbort = null;
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Der Verbindungsdienst antwortet nicht. Bitte Internet prüfen und erneut versuchen.')), 18000);
      this._brokerAbort = () => finish(new Error('Verbindung abgebrochen.'));
      let broker;
      try { broker = this._relayUrl ? new RelayPeer(id, { url: this._relayUrl, room: this._state.roomId }) : new this._Peer(id, {secure: true, debug: 0, config: {iceServers: this._iceServers || [{urls: 'stun:stun.l.google.com:19302'}],
        iceTransportPolicy: networkSettings.forceRelay ? 'relay' : 'all'}}); } catch (error) { finish(roomError(error)); return; }
      this._broker = broker;
      broker.on('open', () => { if (this._broker !== broker) return; finish(); if (this._state.error) {this._state.error = ''; this._change();} });
      broker.on('connection', connection => {
        if (this._broker !== broker || !this.isHost || connection.metadata?.app !== APP || connection.metadata?.room !== this._state.roomId) { connection.close(); return; }
        if (this._state.status !== 'lobby' || this._peers.size >= 7 || this._peers.has(connection.peer)) {
          connection.on('open', () => { connection.send(JSON.stringify({type: 'rejected', reason: this._state.status === 'lobby' ? 'Dieser Raum ist voll. Es können höchstens acht Fahrer mitspielen.' : 'Das Rennen läuft bereits. Bitte nach dem Rennen erneut beitreten.'})); setTimeout(() => connection.close(), 200); });
          return;
        }
        this._attachConnection(connection);
      });
      broker.on('error', error => {
        if (this._broker !== broker) return;
        const message = roomError(error); finish(message); this._finishJoin(message); this._error(message.message);
      });
      broker.on('disconnected', () => {
        if (this._broker !== broker) return;
        this._error('Verbindungsdienst unterbrochen. Bestehende Rennen laufen weiter; die Lobby wird erneut verbunden.');
        clearTimeout(this._brokerReconnect);
        this._brokerReconnect = setTimeout(() => { if (this._broker === broker && !broker.destroyed && broker.disconnected) { try { broker.reconnect(); } catch {} } }, 2000);
      });
    });
  }
  _attachConnection(connection) {
    const peer = {id: connection.peer, pc: {close: () => connection.close()}, ready: false, connected: false, accepted: true,
      connectSince: Date.now(), lastSeen: Date.now(), pendingPings: new Map()};
    const channel = {
      get readyState() { return connection.open ? 'open' : connection.dataChannel?.readyState || 'connecting'; },
      get bufferedAmount() { return connection.dataChannel?.bufferedAmount || 0; },
      send: data => connection.send(data), close: () => connection.close(),
    };
    this._peers.set(peer.id, peer); this._bindChannel(peer, channel);
    connection.on('open', () => channel.onopen?.());
    connection.on('data', data => channel.onmessage?.({data}));
    connection.on('close', () => channel.onclose?.());
    connection.on('error', () => channel.onerror?.());
    if (connection.open) queueMicrotask(() => channel.onopen?.());
    // Recognise a blocked network instead of waiting for a silent timeout.
    const watchIce = () => {
      const pc = connection.peerConnection;
      if (!pc) { if (!peer.connected) setTimeout(watchIce, 250); return; }
      const check = () => {
        const state = pc.iceConnectionState;
        if (state === 'failed') {
          if (!this.isHost) { this._finishJoin(new Error(iceFailedMessage)); this._error(iceFailedMessage); }
          else { this._error('Ein Mitspieler konnte nicht verbunden werden – das Netzwerk blockiert Direktverbindungen. Tipp: Handy-Hotspot oder eigener TURN-Zugang.'); }
          try { connection.close(); } catch {}
        }
        if (state === 'connected' || state === 'completed') this._routeInfo(pc);
      };
      pc.addEventListener('iceconnectionstatechange', check); check();
    };
    watchIce();
    return peer;
  }
  async _routeInfo(pc) {
    try {
      const stats = await pc.getStats(); let pair, local;
      stats.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
      if (!pair) stats.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
      if (pair) local = stats.get(pair.localCandidateId);
      const route = local?.candidateType === 'relay' ? 'relay' : 'direct';
      if (this._state.route !== route) { this._state.route = route; this._change(); }
    } catch {}
  }
  _awaitingHost(peer) { return this._state.signaling === 'manual' && super._awaitingHost(peer); }
  _message(peer, data) {
    if (!this.isHost && peer.id === this._state.hostId && data.type === 'rejected') {
      this._hostClosed(String(data.reason || 'Beitritt nicht möglich.').slice(0, 200)); return;
    }
    super._message(peer, data);
    if (!this.isHost && this._state.status === 'lobby') this._finishJoin();
  }
  _finishJoin(error) {
    const pending = this._joinWaiter; if (!pending) return;
    this._joinWaiter = null; clearTimeout(pending.timer);
    if (error) pending.reject(error); else pending.resolve();
  }
  _hostClosed(reason) { this._finishJoin(new Error(reason)); super._hostClosed(reason); }
  leave(silent = false) {
    this._generation = (this._generation || 0) + 1;
    const broker = this._broker; this._broker = null;
    this._brokerAbort?.(); this._finishJoin(new Error('Beitritt abgebrochen.'));
    clearTimeout(this._brokerReconnect); super.leave(silent);
    try { broker?.destroy(); } catch {}
  }
}
