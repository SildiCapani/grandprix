// Server relay for networks that block peer-to-peer (eduroam, company Wi-Fi).
// A tiny MQTT 3.1.1 client over secure WebSockets (port 443 like any HTTPS site)
// plus a PeerJS-compatible facade, so the lobby/race protocol stays unchanged.

// Index 0 is our own game server (same address the game was loaded from, path /ws).
// The public MQTT brokers are fallbacks when the game is opened without the server.
const ownServer = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
  ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws` : null;
export const RELAY_BROKERS = [
  ownServer(),
  'wss://mqtt.eclipseprojects.io:443/mqtt',   // Eclipse Foundation, port 443 → passes almost every firewall
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const isOwn = url => /\/ws$/.test(url);
const enc = new TextEncoder(), dec = new TextDecoder();

function varint(n) { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); return out; }
function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function packet(type, body) { return new Uint8Array([type, ...varint(body.length), ...body]); }

class MqttSocket {
  constructor(url, clientId, { onMessage, onClose, timeout = 8000 } = {}) {
    this.url = url; this.clientId = clientId; this.onMessage = onMessage; this.onClose = onClose; this.timeout = timeout;
    this._buf = new Uint8Array(0); this._pid = 1; this._subs = new Map(); this.connected = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = e => { if (done) return; done = true; clearTimeout(timer); try { this.ws?.close(); } catch {} reject(e); };
      const timer = setTimeout(() => fail(new Error('timeout')), this.timeout);
      try { this.ws = new WebSocket(this.url, ['mqtt']); } catch (e) { fail(e); return; }
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => {
        // CONNECT: protocol "MQTT" level 4, clean session, keep-alive 30 s
        this.ws.send(packet(0x10, [...str('MQTT'), 4, 0x02, 0, 30, ...str(this.clientId)]));
      };
      this.ws.onerror = () => fail(new Error('network'));
      this.ws.onclose = () => { this.connected = false; clearInterval(this._ping); if (!done) fail(new Error('closed')); else this.onClose?.(); };
      this.ws.onmessage = ev => {
        const chunk = new Uint8Array(ev.data), merged = new Uint8Array(this._buf.length + chunk.length);
        merged.set(this._buf); merged.set(chunk, this._buf.length); this._buf = merged;
        for (;;) {
          if (this._buf.length < 2) break;
          let mult = 1, len = 0, i = 1, byte;
          do { if (i >= this._buf.length) return; byte = this._buf[i++]; len += (byte & 127) * mult; mult *= 128; } while (byte & 128);
          if (this._buf.length < i + len) break;
          const type = this._buf[0] >> 4, flags = this._buf[0] & 15, body = this._buf.subarray(i, i + len);
          this._buf = this._buf.slice(i + len);
          if (type === 2) { // CONNACK
            if (body[1] !== 0) { fail(new Error('refused')); return; }
            done = true; clearTimeout(timer); this.connected = true;
            this._ping = setInterval(() => { try { this.ws.send(new Uint8Array([0xc0, 0])); } catch {} }, 20000);
            resolve();
          } else if (type === 9) { // SUBACK
            const id = (body[0] << 8) | body[1]; this._subs.get(id)?.(); this._subs.delete(id);
          } else if (type === 3) { // PUBLISH
            const tl = (body[0] << 8) | body[1], topic = dec.decode(body.subarray(2, 2 + tl));
            const qos = (flags >> 1) & 3, start = 2 + tl + (qos ? 2 : 0);
            this.onMessage?.(topic, dec.decode(body.subarray(start)));
          }
        }
      };
    });
  }
  subscribe(topic) {
    return new Promise(resolve => {
      const id = this._pid++ & 0xffff || 1; this._subs.set(id, resolve);
      this.ws.send(packet(0x82, [id >> 8, id & 255, ...str(topic), 0]));
      setTimeout(resolve, 4000);
    });
  }
  publish(topic, text) {
    if (!this.connected || this.ws.readyState !== 1) return false;
    const payload = enc.encode(text), head = str(topic), body = new Uint8Array(head.length + payload.length);
    body.set(head); body.set(payload, head.length);
    const len = varint(body.length), pkt = new Uint8Array(1 + len.length + body.length);
    pkt[0] = 0x30; pkt.set(len, 1); pkt.set(body, 1 + len.length);
    try { this.ws.send(pkt); return true; } catch { return false; }
  }
  close() { this.connected = false; clearInterval(this._ping); try { this.ws?.send(new Uint8Array([0xe0, 0])); this.ws?.close(); } catch {} }
}

// Same interface as MqttSocket, but for our own lightweight server (JSON pub/sub over WebSocket).
class JsonSocket {
  constructor(url, clientId, { onMessage, onClose, timeout = 6000 } = {}) { this.url = url; this.onMessage = onMessage; this.onClose = onClose; this.timeout = timeout; this.connected = false; }
  connect() {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; try { this.ws?.close(); } catch {} reject(new Error('timeout')); } }, this.timeout);
      try { this.ws = new WebSocket(this.url); } catch (e) { clearTimeout(timer); reject(e); return; }
      this.ws.onopen = () => { done = true; clearTimeout(timer); this.connected = true; resolve(); };
      this.ws.onerror = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('network')); } };
      this.ws.onclose = () => { const was = this.connected; this.connected = false; if (was) this.onClose?.(); };
      this.ws.onmessage = ev => { try { const m = JSON.parse(ev.data); if (m.topic) this.onMessage?.(m.topic, m.msg); } catch {} };
    });
  }
  subscribe(topic) { try { this.ws.send(JSON.stringify({ op: 'sub', topic })); } catch {} return Promise.resolve(); }
  publish(topic, text) { if (!this.connected || this.ws.readyState !== 1) return false; try { this.ws.send(JSON.stringify({ op: 'pub', topic, msg: text })); return true; } catch { return false; } }
  close() { this.connected = false; try { this.ws?.close(); } catch {} }
}
const socketFor = (url, id, opts) => isOwn(url) ? new JsonSocket(url, id, opts) : new MqttSocket(url, id, opts);

// --- PeerJS-like facade -------------------------------------------------
const safe = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');

class RelayConnection {
  constructor(peer, remoteId, metadata) {
    this._peer = peer; this.peer = remoteId; this.metadata = metadata; this.open = false;
    this.peerConnection = null; this.dataChannel = { readyState: 'connecting', bufferedAmount: 0 }; this._h = {};
  }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return this; }
  _emit(ev, ...a) { for (const fn of this._h[ev] || []) try { fn(...a); } catch (e) { console.error(e); } }
  _setOpen() { if (this.open) return; this.open = true; this.dataChannel.readyState = 'open'; clearTimeout(this._timer); this._emit('open'); }
  send(data) { if (this.open) this._peer._queue(this.peer, typeof data === 'string' ? data : JSON.stringify(data)); }
  close() { if (this._closed) return; this._closed = true; this._peer._post(this.peer, { t: 'x' }); this._remoteClosed(); }
  _remoteClosed() { this.open = false; this.dataChannel.readyState = 'closed'; this._peer.connections.delete(this.peer); this._emit('close'); }
}

export class RelayPeer {
  constructor(id, { url, room } = {}) {
    this.id = id; this.url = url; this.room = safe(room || 'lobby'); this.open = false; this.disconnected = false; this.destroyed = false;
    this.connections = new Map(); this._h = {}; this._out = new Map();
    queueMicrotask(() => this._start());
  }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return this; }
  _emit(ev, ...a) { for (const fn of this._h[ev] || []) try { fn(...a); } catch (e) { console.error(e); } }
  _topic(id) { return `apexrush/v1/${this.room}/${safe(id)}`; }
  async _start() {
    const clientId = 'ar' + Math.random().toString(36).slice(2, 14);
    this._mq = socketFor(this.url, clientId, { onMessage: (t, m) => this._incoming(t, m), onClose: () => this._lost() });
    try {
      await this._mq.connect();
      await this._mq.subscribe(this._topic(this.id));
      await this._mq.subscribe(`apexrush/v1/${this.room}/_all`);
      if (this.destroyed) return this._mq.close();
      this.open = true; this.disconnected = false; this._emit('open', this.id);
    } catch (e) {
      this._emit('error', { type: e.message === 'timeout' || e.message === 'network' || e.message === 'closed' ? 'network' : 'server-error', message: e.message });
    }
  }
  _lost() { if (this.destroyed) return; this.open = false; this.disconnected = true; this._emit('disconnected'); for (const c of [...this.connections.values()]) c._remoteClosed(); }
  reconnect() { if (!this.destroyed) this._start(); }
  destroy() { this.destroyed = true; for (const c of [...this.connections.values()]) c.close(); this._mq?.close(); }
  connect(remoteId, { metadata } = {}) {
    const c = new RelayConnection(this, remoteId, metadata); this.connections.set(remoteId, c);
    this._post(remoteId, { t: 'c', m: metadata });
    // Re-knock a few times in case the first message raced the host's subscription.
    let tries = 0; const knock = setInterval(() => { if (c.open || c._closed || ++tries > 3) return clearInterval(knock); this._post(remoteId, { t: 'c', m: metadata }); }, 2000);
    c._timer = setTimeout(() => { if (!c.open && !c._closed) this._emit('error', { type: 'peer-unavailable' }); }, 9000);
    return c;
  }
  _post(to, msg) { return this._mq?.publish(this._topic(to), JSON.stringify({ f: this.id, ...msg })); }
  // Identical payloads sent to several peers in one tick (host relays) go out as one multicast.
  _queue(to, data) {
    if (!this._out.has(data)) this._out.set(data, []);
    this._out.get(data).push(to);
    if (!this._flushQueued) { this._flushQueued = true; queueMicrotask(() => this._flush()); }
  }
  _flush() {
    this._flushQueued = false;
    for (const [data, list] of this._out) {
      if (list.length === 1) this._post(list[0], { t: 'd', d: data });
      else this._mq?.publish(`apexrush/v1/${this.room}/_all`, JSON.stringify({ f: this.id, t: 'd', to: list, d: data }));
    }
    this._out.clear();
  }
  _incoming(topic, text) {
    let msg; try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg.f !== 'string' || msg.f === this.id) return;
    if (msg.to && !msg.to.includes(this.id)) return;
    let c = this.connections.get(msg.f);
    if (msg.t === 'c') {
      if (c) { if (c.open) this._post(msg.f, { t: 'a' }); return; }
      c = new RelayConnection(this, msg.f, msg.m); this.connections.set(msg.f, c);
      this._emit('connection', c);
      queueMicrotask(() => { if (!c._closed && this.connections.get(msg.f) === c) { this._post(msg.f, { t: 'a' }); c._setOpen(); } });
    } else if (msg.t === 'a') { c?._setOpen(); }
    else if (msg.t === 'd') { if (c?.open) c._emit('data', msg.d); }
    else if (msg.t === 'x') { if (c) { c._closed = true; c._remoteClosed(); } }
  }
}

// Measures the round trip through each broker (publish → echo) and returns them fastest first.
export async function rankBrokers(timeout = 3500) {
  const probe = url => new Promise(resolve => {
    const id = 'ap' + Math.random().toString(36).slice(2, 12), topic = `apexrush/v1/_probe/${id}`;
    let t0 = 0, done = false;
    const finish = ms => { if (done) return; done = true; clearTimeout(timer); try { mq.close(); } catch {} resolve({ url, ms }); };
    if (!url) return resolve({ url, ms: Infinity });
    const mq = socketFor(url, id, { onMessage: (t) => { if (t === topic) finish(performance.now() - t0); }, timeout });
    const timer = setTimeout(() => finish(Infinity), timeout);
    mq.connect().then(() => mq.subscribe(topic)).then(() => { t0 = performance.now(); mq.publish(topic, 'ping'); }).catch(() => finish(Infinity));
  });
  const results = await Promise.all(RELAY_BROKERS.map(probe));
  return results.map((r, i) => ({ ...r, index: i })).sort((a, b) => a.ms - b.ms);
}
