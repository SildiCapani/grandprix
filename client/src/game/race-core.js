import { getTrack, RAMP_H } from './tracks.js';
import { kartById } from './karts.js';

// Compact, dependency-free arcade physics. Units are metres and seconds.
// v5: faster cars (80 km/h top speed), no turbo meter – instead a kart-style
// item system: item boxes, star, mushroom, green shell, red shell and banana.
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = v => ((v % 1) + 1) % 1;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Legacy exports preserve the original default-track API.
const DEFAULT_TRACK = getTrack('coast');
export const TRACK = DEFAULT_TRACK.points;
export const TRACK_WIDTH = DEFAULT_TRACK.width;
export const TRACK_LENGTH = DEFAULT_TRACK.length;
export const sampleTrack = t => DEFAULT_TRACK.sample(t);
export const nearestTrack = (x, z) => DEFAULT_TRACK.nearest(x, z);

// ---- speeds (m/s) ----
export const TOP_SPEED = 80 / 3.6;          // 22.2 m/s without any item
export const STAR_SPEED = 100 / 3.6;        // 27.8 m/s with an active star
export const MUSHROOM_SPEED = 112 / 3.6;    // short kick from a mushroom
export const ROCKET_SPEED = 150 / 3.6;      // rocket autopilot (last two places only)
const ROCKET_TIME = 5;
const DRAFT_BONUS = 1.5;
// Speed class: 80 / 100 / 120 km/h. Every speed in the game scales by K = class / 80,
// so items, turbos, pads and AI stay exactly as strong relative to the base speed.
let K = 1;
export const SPEED_CLASSES = [80, 100, 120];
export const speedFactor = () => K;
const MAX_ANY = 33;
// Turning circle grows with speed: tight hairpins need braking, sweepers are flat out.
// The kart's `turn` factor widens (>1) or tightens (<1) the circle at speed.
const turnRadius = (v, turn = 1) => 5.1 + Math.abs(v) * 0.45 * turn;
// Tyre grip: cornering harder than this (lateral m/s²) scrubs speed. Power drifts never scrub.
const GRIP = 17, SCRUB = .3;
const scrub = (c, yawRate, dt) => {
  if (c.drift || c.airT > 0 || c.rocketT > 0) return;
  const lat = Math.abs(yawRate * c.speed), grip = GRIP * K / c.turn;
  if (lat > grip) c.speed -= Math.sign(c.speed) * (lat - grip) * SCRUB * dt;
};

// Car footprint: two overlapping circles along the body (nose is +Z).
export const CAR_RADIUS = 0.46;
const CIRCLE_OFFSETS = [0.42, -0.34];
const RESTITUTION = 0.32;

// ---- items ----
export const ITEM_TYPES = ['mushroom', 'banana', 'green', 'red', 'star', 'rocket'];
const STAR_TIME = 7, MUSHROOM_TIME = 1.3, SPIN_TIME = 1.15, ROULETTE_TIME = 1.1;
const BOX_RESPAWN = 3, BOX_RADIUS = 1.5, RAMP_LEN_BOX = 8;
const GREEN_SPEED = 40, RED_SPEED = 36, GREEN_BOUNCES = 3;
// ---- battle: balloons instead of laps ----
export const BATTLE_TIME = 150, BALLOONS = 3, MAX_BALLOONS = 5;
// Coin hunt: most coins after two minutes. Crown hunt: first to hold the crown for 20 s in total.
export const BATTLE_TYPES = ['balloons', 'coins', 'crown'];
export const COIN_TIME = 120, COIN_COUNT = 36, CROWN_GOAL = 20;
function rollBattleItem(rnd = Math.random) {
  const table = [['green', .3], ['red', .2], ['banana', .2], ['mushroom', .2], ['star', .1]];
  let x = rnd(); for (const [item, w] of table) { if ((x -= w) <= 0) return item; }
  return 'green';
}
// ---- power drift: hold longer for a stronger mini-turbo (blue → orange → purple) ----
export const DRIFT_TIERS = [{ at: .75, time: .55, speed: 25.5 }, { at: 1.7, time: 1.0, speed: 27 }, { at: 2.8, time: 1.5, speed: 28.5 }];
export const driftTier = t => t >= DRIFT_TIERS[2].at ? 3 : t >= DRIFT_TIERS[1].at ? 2 : t >= DRIFT_TIERS[0].at ? 1 : 0;
// ---- boost pads ----
const PAD_TIME = .8, PAD_SPEED = 26.2, PAD_LEN = 4.2, PAD_W = 3.2;
export function boostPadLayout(track) {
  const pads = [], L = track.length, rows = itemBoxLayout(track).map(b => b.t);
  const want = Math.max(5, Math.round(L / 260)), lanes = [-2.6, 0, 2.6, 1.3, -1.3];
  for (let k = 0; k < 400 && pads.length < want; k++) {
    const t = wrap(.035 + k / 400);
    if (Math.abs(track.curvature(t - 15 / L, 45)) > .13) continue;
    if (rows.some(r => Math.abs(wrap(t - r + .5) - .5) * L < 35)) continue;
    if (track.jumps.some(j => Math.abs(wrap(t - j.t + .5) - .5) * L < 30 + j.gap)) continue;
    if (pads.some(p => Math.abs(wrap(t - p.t + .5) - .5) * L < L / (want + 1.5))) continue;
    const s = track.sample(t), lane = Math.max(-(track.width / 2 - 2), Math.min(track.width / 2 - 2, lanes[pads.length % lanes.length]));
    pads.push({ t, lane, x: s.x + s.nx * lane, z: s.z + s.nz * lane, y: s.y, angle: s.angle, len: PAD_LEN, width: PAD_W });
  }
  return pads;
}
// Kart-style luck: the further back you are, the better the item.
function rollItem(frac, lastTwo = false, rnd = Math.random) {
  const table = lastTwo ? [['rocket', .3], ['star', .25], ['red', .2], ['mushroom', .25]]
    : frac < .2 ? [['banana', .45], ['green', .4], ['mushroom', .15]]
    : frac < .5 ? [['banana', .2], ['green', .3], ['red', .25], ['mushroom', .25]]
    : frac < .8 ? [['green', .15], ['red', .35], ['mushroom', .35], ['star', .15]]
    : [['red', .3], ['mushroom', .35], ['star', .35]];
  let x = rnd();
  for (const [item, w] of table) { if ((x -= w) <= 0) return item; }
  return table[table.length - 1][0];
}

// Seven rivals, each with its own pace, racecraft and temperament.
//  pace   – target top speed in m/s (player: 22.2, star 27.8)
//  corner – how much speed they carry through bends (0 cautious … 1 brave)
//  aggr   – 0 clean racer … 1 rammer who blocks and leans on you
//  itemIQ – how cleverly they time their items
export const RIVAL_ROSTER = Object.freeze([
  { name: 'Apex Phantom',      tag: 'PROFI',      color: 0x54e7c7, number: '03', pace: 22.9, corner: .85, aggr: .25, itemIQ: .9,  mass: 1.0 , kart: 'bolide' },
  { name: 'Brutus Motorsport', tag: 'SCHWER',     color: 0xffcf4a, number: '12', pace: 22.0, corner: .55, aggr: .55, itemIQ: .5,  mass: 1.45 , kart: 'brummer' },
  { name: 'Volt Hornets',      tag: 'HEISSSPORN', color: 0xbda0ff, number: '19', pace: 22.6, corner: .9,  aggr: .7,  itemIQ: .6,  mass: .95 , kart: 'flitzer' },
  { name: 'Iron Ramblers',     tag: 'RAMMBOCK',   color: 0xff5a8a, number: '26', pace: 21.7, corner: .6,  aggr: .95, itemIQ: .4,  mass: 1.3 , kart: 'brummer' },
  { name: 'Kobalt Racing',     tag: 'TAKTIKER',   color: 0x7ad35a, number: '31', pace: 22.3, corner: .75, aggr: .35, itemIQ: 1,   mass: 1.0 , kart: 'drifter' },
  { name: 'Nordlicht GP',      tag: 'VORSICHTIG', color: 0x5aa7ff, number: '44', pace: 21.2, corner: .45, aggr: .1,  itemIQ: .7,  mass: 1.05 , kart: 'allround' },
  { name: 'Comet Rookies',     tag: 'ROOKIE',     color: 0xff9a3d, number: '58', pace: 20.6, corner: .4,  aggr: .45, itemIQ: .3,  mass: .9 , kart: 'buggy' },
].map(r => Object.freeze(r)));

export const GRID_SIZE = RIVAL_ROSTER.length + 1;
export const PLAYER_GRID_SLOT = 4; // the player starts mid-pack: there is something to fight for

// Two-wide staggered grid behind the start line.
export function gridPlacement(track, slot) {
  const row = Math.floor(slot / 2), side = slot % 2 ? -1 : 1;
  const back = 3.2 + row * 4.6 + (slot % 2) * 2.3;
  const progress = -back / track.length;
  const s = track.sample(progress), lane = side * Math.min(1.9, track.width / 2 - 1.1);
  return { x: s.x + s.nx * lane, z: s.z + s.nz * lane, y: s.y, angle: s.angle, progress, t: wrap(progress) };
}

// Kart stats copied onto a body (player, bots).
const kartFields = id => { const k = kartById(id); return { kart: k.id, top: k.top, accel: k.accel, turn: k.turn, mass: k.mass, driftRate: k.drift, offroadF: k.offroad }; };
function makeBody(extra) {
  return { speed: 0, steer: 0, vx: 0, vz: 0, slide: 0, spin: 0, ghost: 0, y: 0, pitch: 0, airT: 0, airDur: 0, airY0: 0, airH: 0,
    top: 1, accel: 1, turn: 1, driftRate: 1, offroadF: .4, offroad: false, scY: 0, route: 0, scSeen: -1, kart: 'allround',
    item: null, pending: null, roulette: 0, starT: 0, shroomT: 0, spinT: 0, invuln: 0, spinAngle: 0, itemHold: 0,
    drift: 0, driftT: 0, turboT: 0, turboSpeed: 0, padCool: 0, rocketT: 0, rocketLane: 0, balloons: BALLOONS, out: false, hits: 0, ...extra };
}

// Item box rows, evenly spread over the lap (never right on the start line).
export function itemBoxLayout(track) {
  const rows = Math.max(4, Math.round(track.length / 330)), boxes = [];
  for (let r = 0; r < rows; r++) {
    let t = wrap(.07 + r / rows);
    // Never float a row of boxes over a jump gap or on a ramp: slide it to just past the landing.
    for (const j of track.jumps) { const ds = (wrap(t - j.t + .5) - .5) * track.length; if (ds > -RAMP_LEN_BOX && ds < j.gap + 8) t = wrap(j.t + (j.gap + 10) / track.length); }
    const s = track.sample(t), half = track.width / 2 - 1.5;
    for (let k = 0; k < 5; k++) {
      const lane = -half + k * (half * 2 / 4);
      boxes.push({ x: s.x + s.nx * lane, z: s.z + s.nz * lane, y: s.y, t, active: true, respawn: 0 });
    }
  }
  return boxes;
}

export class RaceCore {
  constructor(options = {}) {
    this.onEvent = options.onEvent || (() => {});
    this.track = getTrack(options.mapId);
    this.kartId = 'allround';
    this.reset();
  }

  emit(type, detail = {}) { this.onEvent({ type, ...detail }); }

  get playerProgress() { return this._playerTrackProgress; }
  get _vx() { return this.player.vx; }
  set _vx(v) { this.player.vx = v; }
  get _vz() { return this.player.vz; }
  set _vz(v) { this.player.vz = v; }

  setTrack(id) {
    this.track = getTrack(id);
    return this.reset();
  }

  reset() {
    const s = this.track.sample(0);
    this.status = 'ready';
    this.mode = 'race';
    this.countdown = 3;
    this.elapsed = 0;
    this.stats = { collisions: 0, driftSeconds: 0, boostSeconds: 0, resets: 0, rams: 0, overtakes: 0, hitsDealt: 0, hitsTaken: 0, jumps: 0 };
    this.lapsCompleted = 0;
    this.lap = 1;
    this.lapTimes = [];
    this.bestLap = null;
    this.finishedTime = null;
    this.position = 1;
    this.checkpointCount = 0;
    this.nextCheckpoint = 1;
    this.player = makeBody({ x: s.x, z: s.z, y: s.y, angle: s.angle, drifting: false, boosting: false, name: 'DU', isPlayer: true, ...kartFields(this.kartId) });
    this.rivals = [];
    // Other online players (positions from the network). Each client resolves its own car
    // against them, so both sides bounce off each other.
    this.externals = [];
    this.externalItems = [];
    this.itemsEnabled = false;
    this.keepBotsRacing = false;
    this.boxes = itemBoxLayout(this.track);
    this.pads = boostPadLayout(this.track);
    this.shells = [];
    this.bananas = [];
    this._uid = 1;
    this.rankFrac = null; // optional override (online): () => 0 … 1
    this._lastTrackT = 0;
    this._playerTrackProgress = 0;
    this._lapStartedAt = 0;
    this._nextGate = 1 / 8;
    this._wallCooldown = 0;
    this._bumpCooldown = 0;
    this._resumeStatus = 'racing';
    this._lastPosition = 1;
    return this;
  }

  setKart(id) { this.kartId = kartById(id).id; Object.assign(this.player, kartFields(this.kartId)); return this; }

  start(mode = 'race', mapId = this.track.id, { items, cc, kart, battle } = {}) {
    this.battleType = BATTLE_TYPES.includes(battle) ? battle : 'balloons';
    K = SPEED_CLASSES.includes(cc) ? cc / 80 : 1; this.cc = Math.round(K * 80);
    if (kart) this.kartId = kartById(kart).id;
    this.track = getTrack(mapId);
    this.reset();
    this.mode = mode === 'time' ? 'time' : mode === 'battle' ? 'battle' : 'race';
    this.itemsEnabled = items ?? this.mode === 'race';
    this.status = 'countdown';
    if (this.mode === 'race') {
      const g = gridPlacement(this.track, PLAYER_GRID_SLOT);
      Object.assign(this.player, { x: g.x, z: g.z, y: g.y, angle: g.angle });
      this._lastTrackT = g.t;
      this._playerTrackProgress = g.progress;
      const difficulty = 0.975 + (this.track.botScale - 1) * 0.6;
      let slot = 0;
      this.rivals = RIVAL_ROSTER.map((r, i) => {
        if (slot === PLAYER_GRID_SLOT) slot++;
        const p = gridPlacement(this.track, slot++);
        return makeBody({ ...r, ...kartFields(r.kart), pace: r.pace * difficulty * K * kartById(r.kart).top, index: i,
          x: p.x, z: p.z, y: p.y, angle: p.angle, progress: p.progress, t: p.t,
          lane: 0, laneTarget: 0, boosting: false, stuck: 0,
          mood: Math.random() * TAU, finished: false });
      });
      // Lane starts where the car is parked, so nobody swerves at the green light.
      for (const b of this.rivals) b.lane = b.laneTarget = this.track.nearest(b.x, b.z).signedDistance;
      this._lastPosition = this._computePosition();
    } else if (this.mode === 'battle') this._startBattle();
    return this;
  }

  // Battle: everybody spread around the arena ring, three balloons each, a clock instead of laps.
  _startBattle() {
    const T = this.track, n = RIVAL_ROSTER.length + 1, difficulty = 0.975 + (T.botScale - 1) * 0.6;
    const spot = i => { const t = i / n, s = T.sample(t), lane = (i % 2 ? -1 : 1) * T.width * .18; return { x: s.x + s.nx * lane, z: s.z + s.nz * lane, y: s.y, angle: s.angle, t }; };
    const p0 = spot(0);
    Object.assign(this.player, { x: p0.x, z: p0.z, y: p0.y, angle: p0.angle });
    this._lastTrackT = p0.t;
    this.rivals = RIVAL_ROSTER.map((r, i) => { const p = spot(i + 1);
      return makeBody({ ...r, ...kartFields(r.kart), pace: r.pace * difficulty * K * kartById(r.kart).top, index: i, x: p.x, z: p.z, y: p.y, angle: p.angle, t: p.t,
        progress: 0, lane: 0, laneTarget: 0, boosting: false, stuck: 0, mood: Math.random() * TAU, finished: false, aim: null, aimT: 0 }); });
    this.battleLeft = this.battleType === 'coins' ? COIN_TIME : BATTLE_TIME; this._outOrder = [];
    for (const c of [this.player, ...this.rivals]) Object.assign(c, { coins: 0, crownT: 0, balloons: this.battleType === 'balloons' ? BALLOONS : 0 });
    this.battleCoins = []; this.crown = null;
    if (this.battleType === 'coins') for (let i = 0; i < COIN_COUNT; i++) { const p = this._arenaSpot(); this.battleCoins.push({ id: this._uid++, x: p.x, z: p.z, y: 0, active: true, respawn: 0, loose: false }); }
    if (this.battleType === 'crown') { const s = this.track.sample(.5); this.crown = { x: s.x, z: s.z, y: s.y, holder: null, cool: 0, blocked: null }; }
    this.position = this._lastPosition = this._computePosition();
  }
  // A random free spot on the arena floor (between the island and the outer wall).
  _arenaSpot(minR = 3) {
    const A = this.track.arena || { x: 0, z: 0, inner: 10, outer: 54 }, a = Math.random() * TAU, r = A.inner + minR + Math.random() * (A.outer - A.inner - minR * 2);
    return { x: A.x + Math.cos(a) * r, z: A.z + Math.sin(a) * r };
  }
  _clampArena(x, z, m = 2) {
    const A = this.track.arena || { x: 0, z: 0, inner: 10, outer: 54 }, dx = x - A.x, dz = z - A.z, r = Math.hypot(dx, dz) || 1, rr = clamp(r, A.inner + m, A.outer - m);
    return { x: A.x + dx / r * rr, z: A.z + dz / r * rr };
  }

  // Online fill-up: the host simulates AI drivers on the given grid slots.
  addBots(placements) {
    const difficulty = 0.975 + (this.track.botScale - 1) * 0.6;
    this.rivals = placements.slice(0, RIVAL_ROSTER.length).map((p, i) => {
      const r = RIVAL_ROSTER[i];
      return makeBody({ ...r, ...kartFields(r.kart), pace: r.pace * difficulty * K * kartById(r.kart).top, index: i, x: p.x, z: p.z, y: p.y, angle: p.angle, progress: p.progress, t: p.t,
        lane: this.track.nearest(p.x, p.z).signedDistance, laneTarget: 0, boosting: false, stuck: 0, mood: Math.random() * TAU, finished: false });
    });
    this.keepBotsRacing = true;
    return this.rivals;
  }
  // Compact bot snapshot for the network.
  botsForNet() {
    return this.rivals.map(b => ({ n: b.index, x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(2), pi: +b.pitch.toFixed(3), a: +b.angle.toFixed(3), s: +b.speed.toFixed(2), vx: +b.vx.toFixed(2), vz: +b.vz.toFixed(2),
      sp: +(b.spinAngle || 0).toFixed(2), p: +b.progress.toFixed(4), st: b.starT > 0, rk: b.rocketT > 0, b: !!b.boosting, dt: b.drift ? driftTier(b.driftT) : 0, dr: b.drift || 0 }));
  }
  // A guest reported that its item hit one of our bots.
  remoteBotHit(index, kind) { const b = this.rivals.find(r => r.index === index); if (b) this._hit(b, kind, null); }

  pause() {
    if (this.status === 'racing' || this.status === 'countdown') {
      this._resumeStatus = this.status;
      this.status = 'paused';
    }
    return this;
  }

  resume() {
    if (this.status === 'paused') this.status = this._resumeStatus;
    return this;
  }

  respawn() {
    let n = this.track.nearestNear(this.player.x, this.player.z, this._lastTrackT);
    // In a shortcut: straighten up inside the corridor instead of teleporting back to the road.
    if (this.player.offroad) { const sc = this.track.shortcutAt(this.player.x, this.player.z); if (sc) n = { ...sc }; }
    // Never park a car in mid-air above a jump gap.
    for (const j of this.track.jumps) if (this.track.inGap(n.t) || (j.gap && Math.abs((wrap(n.t - j.t + .5) - .5) * this.track.length) < 7)) { const s = this.track.sample(j.t + (j.gap + 6) / this.track.length); n = { ...s, t: wrap(j.t + (j.gap + 6) / this.track.length) }; }
    if (this.status === 'racing') this.stats.resets++;
    Object.assign(this.player, { x: n.x, z: n.z, y: this.player.offroad ? n.y : this.track.heightAt(n.t), angle: n.angle, speed: 0, steer: 0, airT: 0,
      drifting: false, boosting: false, vx: 0, vz: 0, spin: 0, slide: 0, ghost: 1.2, spinT: 0, spinAngle: 0 });
    // Repositioning never awards gates or progress.
    this._lastTrackT = n.t;
    return this;
  }

  // Player presses E.
  useItem() { if (this.status === 'racing') return this._useItem(this.player); return false; }

  update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 0.5);
    const controls = {
      throttle: clamp(Number(input.throttle) || 0, -1, 1),
      steer: clamp(Number(input.steer) || 0, -1, 1),
      brake: !!input.brake,
    };
    while (remaining > 0.000001) {
      const step = Math.min(0.02, remaining);
      remaining -= step;
      if (this.status === 'countdown') {
        this.countdown = Math.max(0, this.countdown - step);
        if (this.countdown <= 0.000001) {
          this.countdown = 0;
          this.status = 'racing';
          this.emit('go');
        }
      } else if (this.status === 'racing') this._step(step, controls);
      else if (this.status === 'finished') { this._coast(step); if (this.rivals.length) { this._stepRivals(step); this._stepItems(step); } }
    }
  }

  // After the flag the kart rolls out along its lane instead of stopping dead. No gates or progress any more.
  _coast(dt) {
    const p = this.player, L = this.track.length;
    p.drift = 0; p.driftT = 0; p.drifting = false; p.turboT = 0; p.shroomT = 0; p.rocketT = 0; p.boosting = false;
    p.speed *= Math.exp(-dt * .85);
    if (Math.abs(p.speed) < .15) { p.speed = 0; p.vx = 0; p.vz = 0; p.steer = 0; return; }
    const road = this.track.nearestNear(p.x, p.z, this._lastTrackT), lane = clamp(road.signedDistance, -(this.track.width / 2 - 1.2), this.track.width / 2 - 1.2);
    const a = this.track.sample(road.t + (4 + Math.abs(p.speed) * .4) / L);
    const diff = angleDiff(Math.atan2(a.x + a.nx * lane - p.x, a.z + a.nz * lane - p.z), p.angle);
    p.angle += clamp(diff * 3, -1, 1) * Math.abs(p.speed) / turnRadius(p.speed, p.turn) * dt;
    p.steer += (clamp(-diff * 2, -1, 1) - p.steer) * Math.min(1, dt * 8);
    this._integrate(p, dt, false);
    const { here } = this._bound(p, road.t), prevT = this._lastTrackT;
    this._lastTrackT = here.t;
    this._height(p, prevT, here.t, dt);
  }

  // Shared tyre model: velocity bends toward the heading; lost grip after hits/drifts.
  _integrate(c, dt, drifting) {
    c.angle += c.spin * dt;
    c.spin *= Math.exp(-dt * 3.2);
    c.slide = Math.max(0, c.slide - dt);
    c.ghost = Math.max(0, c.ghost - dt);
    const grip = 1 - Math.exp(-dt * (drifting ? 9 : c.slide > 0 ? 2.6 : 15) * (this.track.grip || 1));
    c.vx += (Math.sin(c.angle) * c.speed - c.vx) * grip;
    c.vz += (Math.cos(c.angle) * c.speed - c.vz) * grip;
    c.x += c.vx * dt;
    c.z += c.vz * dt;
  }

  // Item timers that every car shares.
  _tickItems(c, dt) {
    c.starT = Math.max(0, c.starT - dt);
    c.shroomT = Math.max(0, c.shroomT - dt);
    c.invuln = Math.max(0, c.invuln - dt);
    if (c.spinT > 0) { c.spinT = Math.max(0, c.spinT - dt); c.spinAngle += dt * TAU / SPIN_TIME * 1.5; if (c.spinT === 0) c.spinAngle = 0; }
    if (c.roulette > 0) { c.roulette -= dt; if (c.roulette <= 0) { c.roulette = 0; c.item = c.pending; c.pending = null; c.itemHold = 0; if (c === this.player) this.emit('itemready', { item: c.item }); } }
    if (c.item) c.itemHold += dt;
    if (c.rocketT > 0) { c.rocketT = Math.max(0, c.rocketT - dt); if (c.rocketT === 0) { this._turbo(c, .9, 30 * K, 'rocketend'); if (c === this.player) this.emit('rocketend', {}); } }
    c.turboT = Math.max(0, c.turboT - dt);
    c.padCool = Math.max(0, c.padCool - dt);
    c.boosting = c.shroomT > 0 || c.turboT > 0 || c.rocketT > 0;
  }
  _turbo(c, time, speed, kind) {
    if (c.turboT > 0 && c.turboSpeed > speed) { c.turboT = Math.max(c.turboT, time); return; }
    c.turboT = time; c.turboSpeed = speed; c.speed = Math.max(c.speed, speed * .96);
    if (c === this.player) this.emit('turbo', { kind });
  }
  _pads(c) {
    if (c.padCool > 0) return;
    for (const p of this.pads) {
      const dx = c.x - p.x, dz = c.z - p.z, hx = Math.sin(p.angle), hz = Math.cos(p.angle);
      if (Math.abs(dx * hx + dz * hz) < p.len / 2 && Math.abs(dx * hz - dz * hx) < p.width / 2 && Math.abs(c.y - p.y) < 1) { c.padCool = .6; this._turbo(c, PAD_TIME, (PAD_SPEED * K), 'pad'); return; }
    }
  }
  _capFor(c, drafting) {
    if (c.rocketT > 0) return (ROCKET_SPEED * K);
    if (c.spinT > 0) return 4;
    if (c.shroomT > 0) return (MUSHROOM_SPEED * K);
    if (c.turboT > 0) return Math.max(c.turboSpeed, c.starT > 0 ? (STAR_SPEED * K) : 0);
    if (c.starT > 0) return (STAR_SPEED * K);
    // Crown hunt: the crown is heavy, its holder is a little slower so the others can catch up.
    return (TOP_SPEED * K) * (c.top || 1) * (this.crown?.holder === c ? .92 : 1) + (drafting ? (DRAFT_BONUS * K) : 0);
  }

  // Keeps a car inside the barriers; returns how hard it hit (0 if no contact).
  _wall(c, road) {
    const limit = this.track.width / 2 - 0.46;
    if (road.distance <= limit) return 0;
    const side = Math.sign(road.signedDistance) || 1;
    c.x = road.x + road.nx * side * limit;
    c.z = road.z + road.nz * side * limit;
    const outward = (c.vx * road.nx + c.vz * road.nz) * side;
    if (outward > 0) {
      c.vx -= road.nx * side * outward * 1.1;
      c.vz -= road.nz * side * outward * 1.1;
      return outward;
    }
    return 0;
  }

  _step(dt, input) {
    this.elapsed += dt;
    if (this.mode === 'battle') this.battleLeft = Math.max(0, this.battleLeft - dt);
    this._wallCooldown = Math.max(0, this._wallCooldown - dt);
    this._bumpCooldown = Math.max(0, this._bumpCooldown - dt);
    const p = this.player;
    this._tickItems(p, dt);
    if (p.rocketT > 0) { this._rocketStep(p, dt, this._lastTrackT); return this._afterMove(dt, p); }
    const spinning = p.spinT > 0;
    const steerIn = spinning ? 0 : input.steer, throttle = spinning ? 0 : input.throttle, brake = spinning ? false : input.brake;
    p.steer += (steerIn - p.steer) * Math.min(1, dt * 10);
    // Power drift: Space + steering starts it, releasing Space fires the mini-turbo.
    if (!p.drift) {
      if (brake && Math.abs(steerIn) > .3 && p.speed > 8 && !spinning) { p.drift = Math.sign(steerIn); p.driftT = 0; this.emit('driftstart', {}); }
    } else if (!brake || p.speed < 6 || spinning) {
      const tier = spinning ? 0 : driftTier(p.driftT);
      if (tier) { const d = DRIFT_TIERS[tier - 1]; this._turbo(p, d.time, d.speed * K, 'drift' + tier); }
      p.drift = 0; p.driftT = 0;
    } else {
      const before = driftTier(p.driftT);
      // Steering into the drift charges faster than steering out of it.
      p.driftT += dt * (Math.sign(steerIn) === p.drift ? 1.15 : .75) * p.driftRate;
      const after = driftTier(p.driftT);
      if (after > before) this.emit('drifttier', { tier: after });
    }
    p.drifting = !!p.drift;

    // Acceleration fades toward top speed; the kart's accel stat matters most from low speed.
    const acceleration = (throttle < 0 && p.speed > 1 ? 24 : 16 * p.accel) * K;
    p.speed += throttle * acceleration * dt;
    if (p.shroomT > 0) p.speed = Math.max(p.speed, (MUSHROOM_SPEED * K) * 0.97);
    if (p.starT > 0 && throttle > 0) p.speed += 8 * K * dt;
    p.speed *= Math.exp(-dt * (throttle === 0 ? 0.6 : 0.2));
    if (p.turboT > 0) p.speed = Math.max(p.speed, p.turboSpeed * .96);
    if (brake && !p.drift) {
      const slowing = 24 * dt;
      p.speed = Math.sign(p.speed) * Math.max(0, Math.abs(p.speed) - slowing);
    }
    if (spinning) p.speed *= Math.exp(-dt * 2.2);
    const drafting = this.mode !== 'battle' && this.rivals.length > 0 && this._draftFor(p, this._playerTrackProgress, this.rivals.map(b => ({ c: b, prog: b.progress })));
    if (drafting && throttle > 0) p.speed += 2.5 * dt;
    p.drafting = drafting;
    p.speed = clamp(p.speed, -6, this._capFor(p, drafting));
    this._offroadDrag(p, dt);
    if (Math.abs(p.speed) < 0.025 && !throttle) p.speed = 0;

    // The chase camera looks along local +Z, so screen-right is world -X.
    // In a drift the car keeps turning toward the drift side; steering only tightens or widens the arc.
    const yaw = p.drift ? -p.drift * p.speed / turnRadius(p.speed, p.turn) * (.62 + .66 * clamp(p.steer * p.drift, -1, 1)) : -p.steer * p.speed / turnRadius(p.speed, p.turn);
    // In the air the kart barely steers.
    p.angle += yaw * dt * (p.airT > 0 ? .35 : 1);
    scrub(p, yaw, dt);
    const roadBefore = this._locate(p, this._lastTrackT);
    const alignment = angleDiff(roadBefore.angle, p.angle);
    // A gentle centering assist stabilizes a straight line without steering the route.
    if (this.mode !== 'battle' && Math.abs(input.steer) < 0.08 && p.speed > 4 && Math.abs(alignment) < 0.6 && p.slide <= 0 && !spinning)
      p.angle += alignment * 0.22 * dt;
    this._integrate(p, dt, p.drifting);
    this._pads(p);

    this._afterMove(dt, p, roadBefore.t, true);
  }

  _afterMove(dt, p, hintT = this._lastTrackT, walls = false) {
    let road, hit = 0;
    if (walls) ({ here: road, hit } = this._bound(p, hintT)); else road = this._locate(p, hintT);
    if (hit > 0) {
      // Speed loss grows with the impact: brushing the barrier costs a few percent, a head-on hit up to a quarter.
      if (this._wallCooldown <= 0 && hit > 0.3) {
        p.speed *= 1 - clamp(hit * .035, .015, .24);
        if (hit > 3) p.driftT = Math.min(p.driftT, .2);
        this._wallCooldown = 0.35;
        this.stats.collisions++;
        this.emit('collision', { strength: hit, x: p.x, z: p.z, kind: 'wall' });
      }
    }

    const previousT = this._lastTrackT;
    let delta = road.t - previousT;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    this._lastTrackT = road.t;
    this._height(p, previousT, road.t, dt);
    // Reject teleports. Small jumps happen where the nearest point skips across a tight hairpin.
    if (Math.abs(delta) * this.track.length < 12.0) {
      this._playerTrackProgress += delta;
      if (delta * this.track.length > dt * 2 && p.speed > 2) {
        if (p.drifting && p.speed > 4) this.stats.driftSeconds += dt;
        if (p.boosting) this.stats.boostSeconds += dt;
      }
      const distanceToGate = wrap(this.nextCheckpoint / 8 - previousT);
      if (this.mode !== 'battle' && delta > 0 && distanceToGate > 1e-9 && distanceToGate <= delta + 1e-9)
        this._passGate();
    }

    this._stepRivals(dt);
    if (this.rivals.length) this._collideCars();
    if (this.externals.length) this._collideExternal();
    if (this.itemsEnabled) this._stepItems(dt);

    if (this.mode === 'battle') this._battleTick(dt);
    if (this.mode === 'battle' && this.status === 'racing') this._checkBattleEnd();
    if (this.status === 'racing' && this.rivals.length) {
      const pos = this._computePosition();
      if (pos < this._lastPosition) { this.stats.overtakes += this._lastPosition - pos; this.emit('overtake', { position: pos }); }
      this._lastPosition = pos;
      this.position = pos;
    }
  }

  // ---------- road, shortcut corridors and barriers ----------
  // Where is the car: on the road, or out in an offroad shortcut? Returns a road-like reference (x, z, t, angle, nx, nz, distance).
  _locate(c, hintT) {
    const T = this.track, road = T.nearestNear(c.x, c.z, hintT);
    c.offroad = false;
    if (!T.shortcuts.length || road.distance <= T.width / 2 + .2) return road;
    const s = T.shortcutAt(c.x, c.z);
    if (!s || s.distance > s.sc.width / 2 + .6 || s.distance > road.distance) return road;
    c.offroad = true; c.scY = s.y;
    return s;
  }
  _inCorridor(x, z, margin = .3) { if (!this.track.shortcuts.length) return false; const s = this.track.shortcutAt(x, z); return !!s && s.distance < s.sc.width / 2 - margin; }
  _push(c, ref, limit) {
    if (ref.distance <= limit) return 0;
    const side = Math.sign(ref.signedDistance) || 1;
    c.x = ref.x + ref.nx * side * limit; c.z = ref.z + ref.nz * side * limit;
    const outward = (c.vx * ref.nx + c.vz * ref.nz) * side;
    if (outward > 0) { c.vx -= ref.nx * side * outward * 1.1; c.vz -= ref.nz * side * outward * 1.1; return outward; }
    return 0;
  }
  // Barriers of the road and of the shortcut corridors (the corridors open the road wall at their ends).
  _bound(c, hintT) {
    const T = this.track, lim = T.width / 2 - .46, road = T.nearestNear(c.x, c.z, hintT);
    c.offroad = false;
    if (road.distance <= lim) return { here: road, hit: 0 };
    const s = T.shortcuts.length ? T.shortcutAt(c.x, c.z) : null;
    if (s) {
      const sl = s.sc.width / 2 - .46;
      if (s.distance <= sl || s.distance - sl < road.distance - lim) {
        const hit = this._push(c, s, sl), here = hit ? T.shortcutAt(c.x, c.z) : s;
        const r2 = hit ? T.nearestNear(c.x, c.z, road.t) : road;
        if (r2.distance > T.width / 2 + .2) { c.offroad = true; c.scY = here.y; return { here, hit }; }
        return { here: r2, hit };
      }
    }
    const hit = this._push(c, road, lim);
    return { here: hit ? T.nearestNear(c.x, c.z, road.t) : road, hit };
  }
  // Rough ground: without a mushroom, star or turbo the kart sinks to its offroad speed.
  _offroadDrag(c, dt) {
    if (!c.offroad || c.shroomT > 0 || c.starT > 0 || c.turboT > 0 || c.rocketT > 0) return;
    const cap = TOP_SPEED * K * c.offroadF;
    if (c.speed > cap) c.speed -= (c.speed - cap) * Math.min(1, dt * 2.6);
  }

  // ---------- height, ramps and jumps ----------
  _ground(t) { return this.track.heightAt(t) + this.track.rampLift(t); }
  _height(c, prevT, t, dt) {
    const T = this.track, L = T.length;
    let d = t - prevT; if (d > .5) d -= 1; if (d < -.5) d += 1;
    // Crossing a ramp lip launches the kart. Ramps also kick slow karts up to jump speed.
    if (c.airT <= 0 && !c.offroad && d > 0 && d * L < 12) for (const j of T.jumps) {
      const before = wrap(j.t - prevT), crossed = before > 1e-9 && before <= d + 1e-9;
      if (!crossed || c.rocketT > 0) continue;
      const v = Math.max(c.speed, (TOP_SPEED * K) * (j.gap ? .95 : .7));
      c.speed = v; c.vx = Math.sin(c.angle) * v; c.vz = Math.cos(c.angle) * v;
      // Low gravity (moon): the same jump flies higher and hangs longer in the air.
      const lg = 1 / (T.gravity || 1), hang = Math.sqrt(lg);
      c.airDur = clamp((((j.gap || 6) + 5) / v + .3) * hang, .55, 1.3 * hang); c.airT = c.airDur;
      c.airY0 = T.heightAt(j.t) + RAMP_H; c.airH = (1.1 + (j.gap || 3) * .13) * lg; c.drift = 0; c.driftT = 0; c.drifting = false;
      if (c === this.player) this.emit('jump', { gap: j.gap });
    }
    const ground = c.offroad ? c.scY : this._ground(t);
    if (c.airT > 0) {
      c.airT = Math.max(0, c.airT - dt);
      const u = 1 - c.airT / c.airDur, y = c.airY0 + (ground - c.airY0) * u + c.airH * 4 * u * (1 - u);
      const v = Math.max(4, Math.abs(c.speed)), dy = (ground - c.airY0) / c.airDur + c.airH * 4 * (1 - 2 * u) / c.airDur;
      c.pitch = Math.atan2(dy, v) * .8; c.y = y;
      if (c.airT === 0) { c.y = ground; this._turbo(c, .5, DRIFT_TIERS[0].speed * K, 'trick'); if (c === this.player) { if (this.status === 'racing') this.stats.jumps++; this.emit('land', {}); } }
      return;
    }
    // Hovering over a gap without air time (e.g. after a spin-out): float across.
    c.y = ground;
    const slope = T.slopeAt(t) + (T.rampLift(t) > 0 ? RAMP_H / 6 : 0);
    c.pitch += (Math.atan(slope) - c.pitch) * Math.min(1, dt * 10);
  }

  // True when car `c` sits 2.5–14 m behind another car, roughly in line with it.
  _draftFor(c, prog, list) {
    const L = this.track.length, hx = Math.sin(c.angle), hz = Math.cos(c.angle);
    for (const o of list) {
      if (o.c === c) continue;
      const ds = (o.prog - prog) * L;
      if (ds < 2.5 || ds > 14) continue;
      const dx = o.c.x - c.x, dz = o.c.z - c.z, along = dx * hx + dz * hz, lat = Math.abs(dx * hz - dz * hx);
      if (along > 2 && lat < 1.25) return true;
    }
    return false;
  }

  _computePosition() {
    if (this.mode === 'battle') return this._battlePlace(this.player);
    return 1 + this.rivals.filter(bot => bot.progress > this._playerTrackProgress).length;
  }

  // ---------- battle rules ----------
  // Alive cars rank by balloons, then hits; knocked-out cars behind them, the last one out first.
  _battlePlace(c) {
    const field = [this.player, ...this.rivals], alive = field.filter(o => !o.out);
    if (this.battleType === 'coins') return 1 + field.filter(o => o !== c && (o.coins > c.coins || (o.coins === c.coins && o.hits > c.hits))).length;
    if (this.battleType === 'crown') return 1 + field.filter(o => o !== c && (o.crownT > c.crownT + 1e-6 || (Math.abs(o.crownT - c.crownT) < 1e-6 && o.hits > c.hits))).length;
    if (!c.out) return 1 + alive.filter(o => o !== c && (o.balloons > c.balloons || (o.balloons === c.balloons && o.hits > c.hits))).length;
    const order = this._outOrder || [];
    return alive.length + (order.length - order.indexOf(c));
  }
  _battleStandings() { return [this.player, ...this.rivals].sort((a, b) => this._battlePlace(a) - this._battlePlace(b)); }
  _popBalloon(c, by) {
    c.balloons = Math.max(0, c.balloons - 1);
    if (by && by !== c) by.hits = (by.hits || 0) + 1;
    this.emit('balloon', { victim: c === this.player ? 'player' : c.name, by: by === this.player ? 'player' : by?.name || null, left: c.balloons, x: c.x, y: c.y, z: c.z, player: c === this.player || by === this.player });
    if (c.balloons > 0) return;
    c.out = true; c.ghost = 1e9; c.item = null; c.pending = null; c.roulette = 0; c.starT = 0; c.shroomT = 0;
    (this._outOrder ||= []).push(c);
    this.emit('out', { name: c === this.player ? 'DU' : c.name, player: c === this.player, by: by === this.player ? 'player' : by?.name || null });
  }
  // A hit in battle: what it costs depends on the variant.
  _battleHit(c, by) {
    if (this.battleType === 'balloons') return this._popBalloon(c, by);
    if (by && by !== c) by.hits = (by.hits || 0) + 1;
    if (this.battleType === 'coins') this._dropCoins(c, by);
    if (this.battleType === 'crown' && this.crown?.holder === c) this._dropCrown(c);
  }
  _dropCoins(c, by) {
    const n = Math.min(3, c.coins); if (!n) return;
    c.coins -= n;
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = 2.5 + Math.random() * 2, p = this._clampArena(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d);
      this.battleCoins.push({ id: this._uid++, x: p.x, z: p.z, y: c.y, active: true, respawn: 0, loose: true, owner: c, arm: .8 }); }
    this.emit('coinloss', { victim: c === this.player ? 'player' : c.name, by: by === this.player ? 'player' : by?.name || null, n, x: c.x, y: c.y, z: c.z });
  }
  _dropCrown(c) {
    const cr = this.crown, a = c.angle + Math.PI + (Math.random() - .5), p = this._clampArena(c.x + Math.sin(a) * 4, c.z + Math.cos(a) * 4);
    Object.assign(cr, { holder: null, x: p.x, z: p.z, y: c.y, cool: 1, blocked: c });
    this.emit('crowndrop', { victim: c === this.player ? 'player' : c.name, x: c.x, y: c.y, z: c.z });
  }
  _takeCrown(c, stolen = false) {
    Object.assign(this.crown, { holder: c, cool: 0, blocked: null });
    this.emit('crown', { by: c === this.player ? 'player' : c.name, stolen });
  }
  _battleTick(dt) {
    const cars = [this.player, ...this.rivals];
    if (this.battleType === 'coins') {
      for (let i = this.battleCoins.length - 1; i >= 0; i--) {
        const k = this.battleCoins[i];
        if (k.arm > 0) k.arm -= dt;
        if (!k.active) { if ((k.respawn -= dt) <= 0) { const p = this._arenaSpot(); Object.assign(k, { x: p.x, z: p.z, active: true }); } continue; }
        for (const c of cars) {
          if (k.arm > 0 && c === k.owner) continue;
          if (Math.abs(c.x - k.x) > 1.5 || Math.abs(c.z - k.z) > 1.5 || Math.hypot(c.x - k.x, c.z - k.z) > 1.4 || Math.abs(c.y - k.y) > 2.2) continue;
          c.coins++;
          if (c === this.player) this.emit('coin', { total: c.coins });
          if (k.loose) this.battleCoins.splice(i, 1); else { k.active = false; k.respawn = 6; }
          break;
        }
      }
    }
    if (this.battleType === 'crown' && this.crown) {
      const cr = this.crown;
      if (cr.holder) { cr.holder.crownT += dt; cr.x = cr.holder.x; cr.z = cr.holder.z; cr.y = cr.holder.y; }
      else {
        cr.cool = Math.max(0, cr.cool - dt);
        for (const c of cars) {
          if (c.out || c.spinT > 0 || (cr.cool > 0 && c === cr.blocked)) continue;
          if (Math.hypot(c.x - cr.x, c.z - cr.z) < 1.7 && Math.abs(c.y - cr.y) < 2.2) { this._takeCrown(c); break; }
        }
      }
    }
  }
  _checkBattleEnd() {
    const alive = [this.player, ...this.rivals].filter(o => !o.out);
    if (this.battleType !== 'balloons') {
      const crowned = this.battleType === 'crown' && [this.player, ...this.rivals].some(o => o.crownT >= CROWN_GOAL);
      if (!crowned && this.battleLeft > 0) return;
      this.status = 'finished'; this.finishedTime = this.elapsed; this.player.boosting = false;
      this.position = this._battlePlace(this.player);
      this.emit('finish', { time: this.elapsed, bestLap: null, position: this.position, battle: true, reason: crowned ? 'crown' : 'time', coins: this.player.coins, crownT: this.player.crownT, hits: this.player.hits });
      return;
    }
    if (!this.player.out && alive.length > 1 && this.battleLeft > 0) return;
    this.status = 'finished'; this.finishedTime = this.elapsed; this.player.boosting = false;
    this.position = this._battlePlace(this.player);
    this.emit('finish', { time: this.elapsed, bestLap: null, position: this.position, battle: true,
      reason: this.player.out ? 'out' : alive.length <= 1 ? 'last' : 'time', balloons: this.player.balloons, hits: this.player.hits });
  }
  _nearestFoe(c) {
    if (this.battleType === 'crown' && this.crown?.holder && this.crown.holder !== c) return this.crown.holder;
    let best = null, bd = Infinity;
    for (const o of [this.player, ...this.rivals]) { if (o === c || o.out) continue; const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  // Everyone in the race with their lap progress (player first).
  _field() {
    return [{ c: this.player, prog: this._playerTrackProgress }, ...this.rivals.map(b => ({ c: b, prog: b.progress }))];
  }
  _rankFrac(c) {
    if (c === this.player && this.rankFrac) return this.rankFrac();
    const field = this._field(), me = field.find(f => f.c === c);
    if (!me || field.length < 2) return .5;
    const ahead = field.filter(f => f.prog > me.prog).length;
    return ahead / (field.length - 1);
  }

  // ---------- items ----------
  _useItem(c) {
    if (!c.item || c.spinT > 0) return false;
    const item = c.item; c.item = null; c.itemHold = 0;
    const hx = Math.sin(c.angle), hz = Math.cos(c.angle);
    if (item === 'mushroom') { c.shroomT = MUSHROOM_TIME; c.speed = Math.max(c.speed, (MUSHROOM_SPEED * K) * .97); }
    else if (item === 'star') { c.starT = STAR_TIME; c.spinT = 0; c.spinAngle = 0; }
    else if (item === 'rocket') {
      const road = this.track.nearestNear(c.x, c.z, c === this.player ? this._lastTrackT : c.t);
      c.rocketT = ROCKET_TIME; c.rocketLane = road.signedDistance; c.spinT = 0; c.spinAngle = 0; c.drift = 0; c.driftT = 0; c.shroomT = 0;
    }
    else if (item === 'banana') {
      if (this.bananas.length > 40) this.bananas.shift();
      const bt = c === this.player ? this._lastTrackT : (c.t ?? 0);
      this.bananas.push({ id: this._uid++, x: c.x - hx * 2.2, z: c.z - hz * 2.2, y: this.track.heightAt(bt), owner: c, arm: 0.6 });
    } else if (item === 'green' || item === 'red') {
      const sp = item === 'green' ? (GREEN_SPEED * K) : (RED_SPEED * K), base = Math.max(0, c.speed);
      const shell = { id: this._uid++, type: item, x: c.x + hx * 1.6, z: c.z + hz * 1.6, y: c.y, vx: hx * (sp + base * .3), vz: hz * (sp + base * .3),
        owner: c, arm: 0.35, life: item === 'green' ? 9 : 12, bounces: 0, t: c === this.player ? this._lastTrackT : (c.t ?? 0), target: null };
      if (item === 'red') shell.target = this.mode === 'battle' ? this._nearestFoe(c) : this._carAhead(c);
      this.shells.push(shell);
    }
    this.emit('item', { item, by: c === this.player ? 'player' : 'bot', name: c.name });
    return item;
  }
  // Next car ahead in the standings (the one a red shell chases).
  _carAhead(c) {
    const field = this._field(), me = field.find(f => f.c === c);
    if (!me) return null;
    let best = null;
    for (const f of field) if (f.c !== c && f.prog > me.prog && (!best || f.prog < best.prog)) best = f;
    return best ? best.c : null;
  }
  // A car gets hit: spin on the spot, lose speed. Stars and fresh spins are immune.
  _hit(c, kind, by) {
    if (c.starT > 0 || c.rocketT > 0 || c.invuln > 0 || c.ghost > 0) return false;
    c.spinT = SPIN_TIME; c.invuln = SPIN_TIME + 1.0; c.spinAngle = 0;
    c.speed *= .2; c.vx *= .3; c.vz *= .3; c.shroomT = 0;
    if (c === this.player) this.stats.hitsTaken++;
    if (by === this.player && c !== this.player) this.stats.hitsDealt++;
    if (this.mode === 'battle') this._battleHit(c, by);
    this.emit('itemhit', { kind, victim: c === this.player ? 'player' : c.name, by: by === this.player ? 'player' : by?.name || null, x: c.x, z: c.z, player: c === this.player || by === this.player });
    return true;
  }
  _stepItems(dt) {
    const cars = [this.player, ...this.rivals];
    // item boxes
    for (const b of this.boxes) {
      if (!b.active) { b.respawn -= dt; if (b.respawn <= 0) b.active = true; continue; }
      for (const c of cars) {
        if (c.ghost > 0) continue;
        if (Math.abs(c.x - b.x) > BOX_RADIUS || Math.abs(c.z - b.z) > BOX_RADIUS || Math.abs(c.y - b.y) > 2.6) continue;
        if (Math.hypot(c.x - b.x, c.z - b.z) > BOX_RADIUS) continue;
        b.active = false; b.respawn = BOX_RESPAWN;
        if (!c.item && c.roulette <= 0) {
          const frac = this._rankFrac(c), n = c === this.player && this.rankFrac ? (this.onlineCount || 2) : this._field().length;
          c.pending = this.mode === 'battle' ? rollBattleItem() : rollItem(frac, n >= 3 && frac >= (n - 2.5) / (n - 1)); c.roulette = c === this.player ? ROULETTE_TIME : .6;
          if (c === this.player) this.emit('itembox', {});
        }
        break;
      }
    }
    const W = this.track.width;
    // shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt; s.arm -= dt;
      if (s.type === 'red') {
        const road = this.track.nearestNear(s.x, s.z, s.t); s.t = road.t;
        let tx, tz;
        const tgt = s.target;
        if (tgt && (this.mode === 'battle' ? !tgt.out : Math.hypot(tgt.x - s.x, tgt.z - s.z) < 26)) { tx = tgt.x; tz = tgt.z; }
        else if (this.mode === 'battle') { tx = s.x + s.vx; tz = s.z + s.vz; }
        else { const a = this.track.sample(s.t + 9 / this.track.length); tx = a.x; tz = a.z; }
        const want = Math.atan2(tx - s.x, tz - s.z), cur = Math.atan2(s.vx, s.vz);
        const ang = cur + clamp(angleDiff(want, cur), -5 * dt, 5 * dt);
        s.vx = Math.sin(ang) * (RED_SPEED * K); s.vz = Math.cos(ang) * (RED_SPEED * K);
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      const road = this.track.nearestNear(s.x, s.z, s.t); s.t = road.t;
      s.y += (this.track.heightAt(s.t) - s.y) * Math.min(1, dt * 12);
      const limit = W / 2 - 0.35;
      if (road.distance > limit && !this._inCorridor(s.x, s.z)) {
        if (s.type === 'red' && !s.target) { this.shells.splice(i, 1); this.emit('shellbreak', { x: s.x, z: s.z }); continue; }
        const side = Math.sign(road.signedDistance) || 1;
        s.x = road.x + road.nx * side * limit; s.z = road.z + road.nz * side * limit;
        const vn = s.vx * road.nx * side + s.vz * road.nz * side;
        if (vn > 0) { s.vx -= 2 * vn * road.nx * side; s.vz -= 2 * vn * road.nz * side; }
        s.bounces++;
        this.emit('shellbounce', { x: s.x, z: s.z });
        if (s.bounces > GREEN_BOUNCES) { this.shells.splice(i, 1); this.emit('shellbreak', { x: s.x, z: s.z }); continue; }
      }
      if (s.life <= 0) { this.shells.splice(i, 1); continue; }
      let gone = false;
      for (const c of cars) {
        if (c === s.owner && s.arm > 0) continue;
        if (c.ghost > 0) continue;
        if (Math.abs(c.x - s.x) > 1.2 || Math.abs(c.z - s.z) > 1.2 || Math.abs(c.y - s.y) > 1.3) continue;
        if (Math.hypot(c.x - s.x, c.z - s.z) < 1.05) { this._hit(c, s.type === 'red' ? 'red' : 'green', s.owner); gone = true; break; }
      }
      if (!gone) for (const e of this.externals) {
        if (Math.hypot(e.x - s.x, e.z - s.z) < 1.05 && Math.abs((e.y ?? s.y) - s.y) < 1.3) { gone = true; if (!e.star) this.emit('remotehit', { kind: s.type, target: e }); break; }
      }
      if (!gone) for (let j = this.bananas.length - 1; j >= 0; j--) {
        const b = this.bananas[j];
        if (Math.hypot(b.x - s.x, b.z - s.z) < .9) { this.bananas.splice(j, 1); gone = true; break; }
      }
      if (!gone) for (let j = this.shells.length - 1; j >= 0; j--) {
        const o = this.shells[j]; if (o === s) continue;
        if (Math.hypot(o.x - s.x, o.z - s.z) < .8) { this.shells.splice(Math.max(i, j), 1); this.shells.splice(Math.min(i, j), 1); i--; gone = 'both'; break; }
      }
      if (gone === true) { this.shells.splice(i, 1); }
    }
    // bananas
    for (let j = this.bananas.length - 1; j >= 0; j--) {
      const b = this.bananas[j]; b.arm -= dt;
      for (const c of cars) {
        if (c === b.owner && b.arm > 0) continue;
        if (Math.abs(c.x - b.x) > 1 || Math.abs(c.z - b.z) > 1 || Math.abs(c.y - b.y) > 1.1) continue;
        if (Math.hypot(c.x - b.x, c.z - b.z) < .95) { if (this._hit(c, 'banana', b.owner) || c.starT > 0) { this.bananas.splice(j, 1); } break; }
      }
    }
    // items thrown by online players hit me and (on the host) the AI drivers
    for (const it of this.externalItems) {
      for (const c of cars) if (Math.hypot(c.x - it.x, c.z - it.z) < (it.type === 'banana' ? .95 : 1.05) && Math.abs(c.y - (it.y ?? c.y)) < 1.3) this._hit(c, it.type, null);
    }
    // my bananas vs online players / remote AI drivers
    for (let j = this.bananas.length - 1; j >= 0; j--) {
      const b = this.bananas[j]; if (b.owner !== this.player || b.arm > 0) continue;
      const e = this.externals.find(e => Math.hypot(e.x - b.x, e.z - b.z) < .95 && !e.star && Math.abs((e.y ?? b.y) - b.y) < 1.1);
      if (e) { this.bananas.splice(j, 1); this.emit('remotehit', { kind: 'banana', target: e }); }
    }
  }

  // Rocket: the car flies along the centre line at 150 km/h for 5 s, no steering needed.
  _rocketStep(c, dt, t) {
    const L = this.track.length;
    c.rocketLane *= Math.exp(-dt * 4);
    const s = this.track.sample(t + (ROCKET_SPEED * K) * dt / L);
    c.x = s.x + s.nx * c.rocketLane; c.z = s.z + s.nz * c.rocketLane; c.angle = s.angle;
    c.speed = (ROCKET_SPEED * K); c.vx = Math.sin(s.angle) * (ROCKET_SPEED * K); c.vz = Math.cos(s.angle) * (ROCKET_SPEED * K);
    c.spin = 0; c.slide = 0; c.steer = 0; c.drift = 0; c.drifting = false;
  }
  // Items for the network: what this client owns.
  ownItemsForNet() {
    const mine = [];
    const ours = o => o === this.player || this.rivals.includes(o);
    for (const s of this.shells) if (ours(s.owner)) mine.push({ type: s.type, x: +s.x.toFixed(2), z: +s.z.toFixed(2), y: +s.y.toFixed(2) });
    for (const b of this.bananas) if (ours(b.owner) && b.arm <= 0) mine.push({ type: 'banana', x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(2) });
    return mine.slice(0, 12);
  }

  // ---------- AI drivers ----------
  _botItems(bot, bend, gap, dt) {
    if (!bot.item || bot.spinT > 0 || this.status !== 'racing') return;
    const hold = bot.itemHold, iq = bot.itemIQ, L = this.track.length;
    const field = this._field();
    const ahead = field.filter(f => f.c !== bot && f.prog > bot.progress && (f.prog - bot.progress) * L < 30);
    const behind = field.filter(f => f.c !== bot && f.prog < bot.progress && (bot.progress - f.prog) * L < 16);
    let use = false;
    switch (bot.item) {
      case 'star': case 'rocket': use = hold > .3; break;
      case 'mushroom': {
        // Save mushrooms for an upcoming shortcut, then fire them on the rough ground.
        const saving = !bot.route && hold < 14 && this.track.shortcuts.some(sc => wrap(sc.tA - bot.t) * L < 260);
        use = bot.route ? bot.offroad && hold > .1 : !saving && (bend < .15 && hold > .5 || hold > 6); break;
      }
      case 'red': use = hold > .8 && (this._carAhead(bot) || hold > 5); break;
      case 'green': {
        const hx = Math.sin(bot.angle), hz = Math.cos(bot.angle);
        const lined = ahead.some(f => { const dx = f.c.x - bot.x, dz = f.c.z - bot.z; return dx * hx + dz * hz > 3 && Math.abs(dx * hz - dz * hx) < 1.4; });
        use = (lined && bend < .3 && hold > .4) || hold > 10 - iq * 3; break;
      }
      case 'banana': use = (behind.length > 0 && hold > .5) || hold > 8; break;
    }
    if (use && Math.random() < .3 + iq * .7) this._useItem(bot);
  }

  _stepRivals(dt) {
    if (!this.rivals.length) return;
    if (this.mode === 'battle') return this._stepBattleBots(dt);
    const L = this.track.length, W = this.track.width, laneMax = W / 2 - 1.05;
    const p = this.player, playerProg = this._playerTrackProgress;
    const others = [{ c: p, prog: playerProg, isPlayer: true }, ...this.rivals.map(b => ({ c: b, prog: b.progress }))];
    for (const bot of this.rivals) {
      this._tickItems(bot, dt);
      if (bot.rocketT > 0) {
        this._rocketStep(bot, dt, bot.t);
        const rr = this.track.nearestNear(bot.x, bot.z, bot.t);
        let d = rr.t - bot.t; if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
        if (Math.abs(d) * L < 12.0) bot.progress += d;
        this._height(bot, bot.t, rr.t, dt);
        bot.t = rr.t; bot.lane = rr.signedDistance; bot.laneTarget = 0; bot.stuck = 0;
        if (this.itemsEnabled && bot.item && bot.itemHold > 1.5 && bot.item !== 'rocket') this._botItems(bot, 0, 0, dt);
        continue;
      }
      const road = this._locate(bot, bot.t);
      const lookT = road.t;
      // Pushed into a corridor by a bump: follow it to its end instead of steering at the road behind the corridor wall.
      if (road.sc && !bot.route) bot.route = road.sc.index + 1;
      // --- shortcuts: offroad karts always, others only with a mushroom or star ---
      for (const sc of this.track.shortcuts) {
        const ds = (wrap(sc.tA - bot.t + .5) - .5) * L;
        if (ds > 3 && ds < 40) { if (bot.scSeen !== sc.index && !bot.route) { bot.scSeen = sc.index;
          const boosted = bot.shroomT > .25 || bot.starT > 1, mush = this.itemsEnabled && bot.item === 'mushroom';
          if (bot.offroadF >= .8 || boosted || (mush && Math.random() < .25 + bot.itemIQ * .7)) bot.route = sc.index + 1; } }
        else if (bot.scSeen === sc.index && (ds < -20 || ds > 60)) bot.scSeen = -1;
      }
      // --- speed target from the radius of the coming bends ---
      const near = Math.abs(this.track.curvature(lookT + 2 / L, 12)), far = Math.abs(this.track.curvature(lookT + 12 / L, 18));
      const bend = Math.max(near, far * 0.85);
      const brave = 0.92 + bot.corner * 0.16;
      const tk = 0.45 * bot.turn, vNear = (12 / Math.max(near, 1e-3) * brave - 5.1) / tk, vFar = (18 / Math.max(far, 1e-3) * brave - 5.1) / tk + 6;
      // Grip limit: v² / R must stay near the kart's grip, or it scrubs speed.
      const vGrip = Math.sqrt(GRIP * K / bot.turn * 12 / Math.max(near, 1e-3) * (1.15 + bot.corner * .2));
      let target = Math.min(bot.pace, Math.max(7, Math.min(vNear, vFar, vGrip)));
      target *= 1 + Math.sin(this.elapsed * 0.5 + bot.mood) * 0.02;
      const gap = (bot.progress - playerProg) * L;
      if (this.status === 'racing') {
        if (gap < -90) target *= 1.05; else if (gap < -30) target *= 1.02;
      } else if (!this.keepBotsRacing) target = Math.min(target, 12 * K); // cool-down lap after the flag
      // --- racing line: inside of the coming bend ---
      const turn = this.track.curvature(lookT + 6 / L, 24);
      let lane = clamp(turn * 2.6, -1, 1) * laneMax * (0.45 + bot.corner * 0.45);
      // --- traffic: overtake, block, or lean on the player ---
      let blocked = 1;
      for (const o of others) {
        if (o.c === bot || o.c.ghost > 0) continue;
        const ds = (o.prog - bot.progress) * L;
        if (ds < -12 || ds > 18) continue;
        const oRoad = o.isPlayer ? this.track.nearestNear(o.c.x, o.c.z, this._lastTrackT) : null;
        const oLane = o.isPlayer ? oRoad.signedDistance : o.c.lane;
        const lat = oLane - bot.lane;
        if (ds > 0 && ds < 12 && Math.abs(lat) < 1.7) {
          const roomLeft = laneMax - oLane, roomRight = oLane + laneMax;
          lane = clamp(oLane + (roomLeft > roomRight ? 1.9 : -1.9), -laneMax, laneMax);
          if (ds < 5 && Math.abs(lat) < 1.1 && bot.aggr < 0.6 && bot.starT <= 0) blocked = Math.min(blocked, 0.92);
        }
        if (o.isPlayer && bot.starT <= 0) {
          if (ds < 0 && ds > -12 && bot.aggr > 0.3 && bend < 0.5) lane = lane * 0.4 + oLane * 0.6 * bot.aggr;
          else if (Math.abs(ds) < 2.6 && bot.aggr > 0.5) { lane = oLane - Math.sign(lat || 1) * (1.15 - bot.aggr * 0.55); target *= 1.03; }
        }
        // With a star: hunt the nearest car.
        if (bot.starT > 0 && ds > 0 && ds < 18) lane = oLane;
        // A starred car behind: get out of its way.
        if (o.c.starT > 0 && ds < 0 && ds > -16) lane = clamp(oLane + (oLane > 0 ? -2.6 : 2.6), -laneMax, laneMax);
      }
      // dodge bananas and incoming shells on my line
      for (const b of this.bananas) {
        const dx = b.x - bot.x, dz = b.z - bot.z, hx = Math.sin(bot.angle), hz = Math.cos(bot.angle);
        const along = dx * hx + dz * hz, lat = dx * hz - dz * hx;
        if (along > 2 && along < 18 && Math.abs(lat) < 1.6 && Math.random() < bot.itemIQ * .9 + .1) lane = clamp(bot.lane + (lat > 0 ? 1.8 : -1.8), -laneMax, laneMax);
      }
      // aim for boost pads on the straights ahead
      for (const pad of this.pads) {
        const ds = (wrap(pad.t - bot.t + .5) - .5) * L;
        if (ds > 8 && ds < 45 && bot.itemIQ > .35) { lane = pad.lane; break; }
      }
      if (this._draftFor(bot, bot.progress, others)) target += (DRAFT_BONUS * K) * .8;
      if (bot.offroad || bot.route) target = Math.min(bot.pace, Math.max(target, bot.pace * .9));
      bot.laneTarget = clamp(lane, -laneMax, laneMax);
      bot.lane += (bot.laneTarget - bot.lane) * Math.min(1, dt * 1.8);
      // --- steering toward a look-ahead point on the chosen lane ---
      let ahead = this.track.sample(lookT + (4.5 + Math.abs(bot.speed) * 0.42) / L), aimLane = bot.lane;
      if (bot.route) {
        const sc = this.track.shortcuts[bot.route - 1], look = 4.5 + Math.abs(bot.speed) * .42;
        const u = road.sc === sc ? road.u + look / sc.len : (look - (wrap(sc.tA - bot.t + .5) - .5) * L) / sc.len;
        if (road.sc === sc && road.u > .97) bot.route = 0;
        // Missed the entry: past the fork while still on the road. Aiming across the gap between road and corridor
        // would pin the bot against the barrier wedge, so give up the shortcut early.
        else if (road.sc !== sc && (wrap(bot.t - sc.tA + .5) - .5) * L > 4) bot.route = 0;
        else if (u > 0) { ahead = this.track.sampleShortcut(sc, Math.min(1.05, u)); aimLane = 0; }
      }
      const tx = ahead.x + ahead.nx * aimLane, tz = ahead.z + ahead.nz * aimLane;
      const want = Math.atan2(tx - bot.x, tz - bot.z);
      const diff = angleDiff(want, bot.angle);
      const maxYaw = Math.max(0.6, Math.abs(bot.speed)) / turnRadius(bot.speed, bot.turn);
      const spinning = bot.spinT > 0;
      if (!spinning) { const yr = clamp(diff * 3.2, -1, 1) * maxYaw * (bot.airT > 0 ? .35 : 1); bot.angle += yr * dt; scrub(bot, yr, dt); }
      bot.steer += (clamp(-diff * 2, -1, 1) - bot.steer) * Math.min(1, dt * 8);
      // --- items ---
      if (this.itemsEnabled) this._botItems(bot, bend, gap, dt);
      // --- throttle / brake ---
      target *= blocked;
      if (bot.starT > 0) target = Math.max(target, (STAR_SPEED * K) * .97);
      if (bot.shroomT > 0) target = (MUSHROOM_SPEED * K);
      if (bot.turboT > 0) target = Math.max(target, bot.turboSpeed);
      // Bots power-drift through long bends and cash in the mini-turbo on exit.
      if (!spinning && Math.abs(turn) > .38 && bot.speed > 12) { if (!bot.drift) { bot.drift = Math.sign(turn); bot.driftT = 0; } bot.driftT += dt * (.75 + bot.corner * .45) * bot.driftRate; }
      else if (bot.drift) { const tier = spinning ? 0 : driftTier(bot.driftT); if (tier) { const d = DRIFT_TIERS[tier - 1]; this._turbo(bot, d.time, d.speed * K, 'bot'); } bot.drift = 0; bot.driftT = 0; }
      bot.drifting = !!bot.drift;
      if (spinning) { bot.speed *= Math.exp(-dt * 2.2); }
      else if (bot.speed < target) bot.speed += (bot.shroomT > 0 || bot.turboT > 0 ? 40 : 16 * bot.accel) * K * dt;
      else bot.speed = Math.max(target, bot.speed - 22 * K * dt);
      bot.speed *= Math.exp(-dt * 0.2);
      bot.speed = clamp(bot.speed, -3, this._capFor(bot, true));
      this._offroadDrag(bot, dt);
      this._integrate(bot, dt, false);
      this._pads(bot);
      // --- barriers, progress, recovery ---
      const bounded = this._bound(bot, lookT);
      if (bounded.hit > 0.3) bot.speed *= 1 - clamp(bounded.hit * .035, .015, .15);
      const r2 = bounded.here;
      let d = r2.t - bot.t;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      if (Math.abs(d) * L < 12.0) bot.progress += d;
      this._height(bot, bot.t, r2.t, dt);
      bot.t = r2.t;
      if (bot.slide > 0 || spinning) bot.lane += (r2.signedDistance - bot.lane) * Math.min(1, dt * 6);
      const facingWrong = Math.abs(angleDiff(r2.angle, bot.angle)) > 1.9;
      bot.stuck = (this.status === 'racing' && !spinning && (Math.abs(bot.speed) < 1.2 || facingWrong)) ? bot.stuck + dt : 0;
      // Grinding along a barrier at walking pace never trips the speed check above: watch real progress as well.
      if (this.status !== 'racing' || spinning || bot.progress - (bot.stallFrom ?? -1) > 2.5 / L) { bot.stallFrom = bot.progress; bot.stallT = 0; }
      else if ((bot.stallT = (bot.stallT || 0) + dt) > 2.5) bot.stuck = 2;
      if (bot.stuck > 1.8) {
        let rt = bot.t;
        // Never park a bot in mid-air above a jump gap.
        for (const j of this.track.jumps) if (j.gap && this.track.inGap(rt)) rt = wrap(j.t + (j.gap + 6) / L);
        const s = this.track.sample(rt);
        bot.t = rt; bot.stallFrom = bot.progress; bot.stallT = 0;
        Object.assign(bot, { x: s.x, z: s.z, angle: s.angle, speed: 4, vx: Math.sin(s.angle) * 4, vz: Math.cos(s.angle) * 4,
          spin: 0, slide: 0, ghost: 1.6, stuck: 0, lane: 0, laneTarget: 0, route: 0, offroad: false });
      }
    }
  }

  // ---------- battle AI ----------
  // Arena bots hunt item boxes when empty-handed and the nearest rival otherwise. They steer around the centre island
  // by moving in polar coordinates: a slice of the way round the ring at a time, straight at the target once it is in view.
  _battleAim(bot) {
    const foes = [this.player, ...this.rivals].filter(o => o !== bot && !o.out), dist = o => Math.hypot(o.x - bot.x, o.z - bot.z);
    const nearestFoe = () => foes.reduce((b, o) => !b || dist(o) < dist(b) ? o : b, null);
    if (this.battleType === 'crown' && this.crown) {
      const h = this.crown.holder;
      if (h === bot) { const f = nearestFoe(); return f ? this._clampArena(2 * bot.x - f.x, 2 * bot.z - f.z, 5) : { x: -bot.x, z: -bot.z }; } // run away
      if (!h) return this.crown;
      if (!bot.item && bot.roulette <= 0) { const box = this.boxes.filter(b => b.active).reduce((b, o) => !b || dist(o) < dist(b) ? o : b, null); if (box && dist(box) < 14) return box; }
      return h;
    }
    if (this.battleType === 'coins') {
      const leader = foes.reduce((b, o) => !b || o.coins > b.coins ? o : b, null);
      if (bot.item && leader && leader.coins > bot.coins && dist(leader) < 25) return leader;
      let best = null, bd = Infinity;
      for (const k of this.battleCoins) if (k.active && !(k.arm > 0 && k.owner === bot)) { const d = dist(k) * (k.loose ? .6 : 1); if (d < bd) { bd = d; best = k; } }
      if (!bot.item && bot.roulette <= 0) { const box = this.boxes.filter(b => b.active).reduce((b, o) => !b || dist(o) < dist(b) ? o : b, null); if (box && dist(box) < bd * .5) return box; }
      return best || nearestFoe() || { x: 0, z: 30 };
    }
    if (!bot.item && bot.roulette <= 0) {
      let best = null, bd = Infinity;
      for (const b of this.boxes) if (b.active) { const d = Math.hypot(b.x - bot.x, b.z - bot.z); if (d < bd) { bd = d; best = b; } }
      if (best && bd < 70) return best;
    }
    let best = null, bd = Infinity;
    for (const o of [this.player, ...this.rivals]) {
      if (o === bot || o.out) continue;
      let d = Math.hypot(o.x - bot.x, o.z - bot.z); if (o === this.player) d *= 1.35 - bot.aggr * .35;
      if (d < bd) { bd = d; best = o; }
    }
    // a careful driver on its last balloon keeps its distance
    if (best && bot.balloons === 1 && bot.aggr < .5 && bd < 18) return { x: -best.x, z: -best.z };
    return best || { x: 0, z: 30 };
  }
  _battleItems(bot) {
    if (!bot.item || bot.spinT > 0) return;
    const hold = bot.itemHold, hx = Math.sin(bot.angle), hz = Math.cos(bot.angle);
    const foes = [this.player, ...this.rivals].filter(o => o !== bot && !o.out && o.ghost <= 0);
    const rel = o => { const dx = o.x - bot.x, dz = o.z - bot.z; return { along: dx * hx + dz * hz, lat: Math.abs(dx * hz - dz * hx), d: Math.hypot(dx, dz) }; };
    const ahead = foes.some(o => { const r = rel(o); return r.along > 3 && r.along < 30 && r.lat < 1.6; });
    const behind = foes.some(o => { const r = rel(o); return r.along < -2 && r.along > -14 && r.lat < 2; });
    const near = foes.some(o => rel(o).d < 40);
    let use = false;
    switch (bot.item) {
      case 'star': use = hold > .3; break;
      case 'red': use = near && hold > .5; break;
      case 'green': use = (ahead && hold > .3) || hold > 9; break;
      case 'banana': use = (behind && hold > .4) || hold > 7; break;
      case 'mushroom': use = (ahead && hold > .3) || hold > 6; break;
    }
    if (use && Math.random() < .25 + bot.itemIQ * .6) this._useItem(bot);
  }
  _stepBattleBots(dt) {
    const T = this.track, c0 = T.arena || { x: 0, z: 0, inner: 10, outer: 54 };
    for (const bot of this.rivals) {
      this._tickItems(bot, dt);
      if (bot.out) { bot.speed *= Math.exp(-dt * 3); this._integrate(bot, dt, false); bot.t = this._bound(bot, bot.t).here.t; continue; }
      const spinning = bot.spinT > 0;
      if ((bot.aimT -= dt) <= 0 || !bot.aim || bot.aim.out || bot.aim.active === false || (this.battleType === 'coins' && bot.aim.loose && !this.battleCoins.includes(bot.aim))) { bot.aimT = .6 + Math.random() * .6; bot.aim = this._battleAim(bot); }
      const tx = bot.aim.x - c0.x, tz = bot.aim.z - c0.z, bx = bot.x - c0.x, bz = bot.z - c0.z;
      const th = Math.atan2(bz, bx), tht = Math.atan2(tz, tx), dth = angleDiff(tht, th);
      let ax = bot.aim.x, az = bot.aim.z;
      if (Math.abs(dth) > .5) {
        const th2 = th + clamp(dth, -.55, .55), rr = clamp((Math.hypot(bx, bz) + Math.hypot(tx, tz)) / 2, c0.inner + 6, c0.outer - 5);
        ax = c0.x + Math.cos(th2) * rr; az = c0.z + Math.sin(th2) * rr;
      }
      const diff = angleDiff(Math.atan2(ax - bot.x, az - bot.z), bot.angle);
      const maxYaw = Math.max(0.6, Math.abs(bot.speed)) / turnRadius(bot.speed, bot.turn);
      if (!spinning) { const yr = clamp(diff * 3.2, -1, 1) * maxYaw * (bot.airT > 0 ? .35 : 1); bot.angle += yr * dt; scrub(bot, yr, dt); }
      bot.steer += (clamp(-diff * 2, -1, 1) - bot.steer) * Math.min(1, dt * 8);
      let target = bot.pace * (Math.abs(diff) > 1.2 ? .45 : Math.abs(diff) > .6 ? .75 : 1);
      if (bot.starT > 0) target = Math.max(target, (STAR_SPEED * K) * .97);
      if (bot.shroomT > 0) target = MUSHROOM_SPEED * K;
      if (bot.turboT > 0) target = Math.max(target, bot.turboSpeed);
      if (spinning) bot.speed *= Math.exp(-dt * 2.2);
      else if (bot.speed < target) bot.speed += (bot.shroomT > 0 || bot.turboT > 0 ? 40 : 16 * bot.accel) * K * dt;
      else bot.speed = Math.max(target, bot.speed - 22 * K * dt);
      bot.speed = clamp(bot.speed, -3, this._capFor(bot, false));
      bot.drifting = false;
      this._integrate(bot, dt, false);
      const bounded = this._bound(bot, bot.t);
      if (bounded.hit > 0.3) bot.speed *= 1 - clamp(bounded.hit * .035, .015, .15);
      this._height(bot, bot.t, bounded.here.t, dt);
      bot.t = bounded.here.t;
      if (this.itemsEnabled && this.status === 'racing') this._battleItems(bot);
      bot.stuck = (this.status === 'racing' && !spinning && Math.abs(bot.speed) < 1.2) ? bot.stuck + dt : 0;
      if (bot.stuck > 1.6) {
        const s = T.sample(bot.t), a = s.angle + (Math.random() < .5 ? Math.PI : 0);
        Object.assign(bot, { x: s.x, z: s.z, angle: a, speed: 4, vx: Math.sin(a) * 4, vz: Math.cos(a) * 4, spin: 0, slide: 0, ghost: 1.2, stuck: 0, aim: null });
      }
    }
  }

  // ---------- car-to-car contact ----------
  _collideCars() {
    const cars = [this.player, ...this.rivals];
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.ghost > 0 || b.ghost > 0 || Math.abs(a.y - b.y) > 1.6) continue;
      const dx0 = a.x - b.x, dz0 = a.z - b.z;
      if (dx0 * dx0 + dz0 * dz0 > 4) continue;
      let best = null;
      for (const oa of CIRCLE_OFFSETS) for (const ob of CIRCLE_OFFSETS) {
        const ax = a.x + Math.sin(a.angle) * oa, az = a.z + Math.cos(a.angle) * oa;
        const bx = b.x + Math.sin(b.angle) * ob, bz = b.z + Math.cos(b.angle) * ob;
        const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), pen = CAR_RADIUS * 2 - d;
        if (pen > 0 && (!best || pen > best.pen)) best = { pen, d, dx, dz, cx: (ax + bx) / 2, cz: (az + bz) / 2 };
      }
      if (!best) continue;
      // Battle: ramming someone with a mushroom boost steals one of their balloons.
      if (this.mode === 'battle' && (a.shroomT > 0) !== (b.shroomT > 0)) {
        const att = a.shroomT > 0 ? a : b, vic = att === a ? b : a;
        const hadCrown = this.crown?.holder === vic;
        if (this._hit(vic, 'ram', att)) {
          if (this.battleType === 'balloons' && att.balloons < MAX_BALLOONS) { att.balloons++; this.emit('steal', { by: att === this.player ? 'player' : att.name, victim: vic === this.player ? 'player' : vic.name, x: vic.x, z: vic.z }); }
          if (this.battleType === 'crown' && hadCrown) this._takeCrown(att, true);
        }
      }
      // Star power: whoever touches a starred car spins; the star car ploughs on.
      const pa = a.starT > 0 || a.rocketT > 0, pb = b.starT > 0 || b.rocketT > 0;
      if (pa !== pb) {
        const star = pa ? a : b, victim = star === a ? b : a;
        this._hit(victim, 'star', star);
        const nx = (victim.x - star.x) || 0.01, nz = (victim.z - star.z) || 0.01, l = Math.hypot(nx, nz);
        victim.vx += nx / l * 6; victim.vz += nz / l * 6; victim.x += nx / l * best.pen; victim.z += nz / l * best.pen;
        continue;
      }
      const nx = best.d > 1e-6 ? best.dx / best.d : Math.cos(a.angle), nz = best.d > 1e-6 ? best.dz / best.d : -Math.sin(a.angle);
      const ma = a.mass || 1, mb = b.mass || 1, ia = 1 / ma, ib = 1 / mb, sum = ia + ib;
      a.x += nx * best.pen * ia / sum; a.z += nz * best.pen * ia / sum;
      b.x -= nx * best.pen * ib / sum; b.z -= nz * best.pen * ib / sum;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel >= 0) continue;
      const jImp = -(1 + RESTITUTION) * rel / sum;
      a.vx += nx * jImp * ia; a.vz += nz * jImp * ia;
      b.vx -= nx * jImp * ib; b.vz -= nz * jImp * ib;
      for (const [c, sign, inv] of [[a, 1, ia], [b, -1, ib]]) {
        const fwd = c.vx * Math.sin(c.angle) + c.vz * Math.cos(c.angle);
        c.speed = clamp(fwd, -6, (MAX_ANY * K));
        const rx = best.cx - c.x, rz = best.cz - c.z;
        const torque = (rz * nx * sign - rx * nz * sign) * jImp * inv;
        c.spin = clamp(c.spin + torque * 1.6, -3.2, 3.2);
        if (jImp > 1.4) c.slide = Math.max(c.slide, Math.min(0.5, jImp * 0.08));
      }
      const involvesPlayer = a === this.player;
      if (jImp > 0.6 && (involvesPlayer || this._bumpCooldown <= 0)) {
        if (involvesPlayer) this.stats.rams++;
        this._bumpCooldown = 0.12;
        this.emit('bump', { strength: jImp, x: best.cx, z: best.cz, player: involvesPlayer,
          other: involvesPlayer ? b.name : null });
      }
    }
  }

  _collideExternal() {
    const p = this.player;
    if (p.ghost > 0) return;
    for (const e of this.externals) {
      if (e.ghost || Math.abs(p.y - (e.y ?? p.y)) > 1.6) continue;
      const dx0 = p.x - e.x, dz0 = p.z - e.z;
      if (dx0 * dx0 + dz0 * dz0 > 4) continue;
      let best = null;
      for (const oa of CIRCLE_OFFSETS) for (const ob of CIRCLE_OFFSETS) {
        const ax = p.x + Math.sin(p.angle) * oa, az = p.z + Math.cos(p.angle) * oa;
        const bx = e.x + Math.sin(e.angle) * ob, bz = e.z + Math.cos(e.angle) * ob;
        const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), pen = CAR_RADIUS * 2 - d;
        if (pen > 0 && (!best || pen > best.pen)) best = { pen, d, dx, dz, cx: (ax + bx) / 2, cz: (az + bz) / 2 };
      }
      if (!best) continue;
      if (e.star && p.starT <= 0 && p.rocketT <= 0) { this._hit(p, 'star', null); continue; }
      if ((p.starT > 0 || p.rocketT > 0) && !e.star) { if (!e._starHit || this.elapsed - e._starHit > 1.5) { e._starHit = this.elapsed; this.emit('remotehit', { kind: 'star', target: e }); } continue; }
      const nx = best.d > 1e-6 ? best.dx / best.d : Math.cos(p.angle), nz = best.d > 1e-6 ? best.dz / best.d : -Math.sin(p.angle);
      // Half the overlap here, the other half on the other player's screen.
      p.x += nx * best.pen * 0.55; p.z += nz * best.pen * 0.55;
      const rel = (p.vx - (e.vx || 0)) * nx + (p.vz - (e.vz || 0)) * nz;
      if (rel >= 0) continue;
      const ma = p.mass || 1, mb = e.mass || 1, jImp = -(1 + RESTITUTION) * rel / (1 / ma + 1 / mb) / ma; // heavy karts shove harder
      p.vx += nx * jImp; p.vz += nz * jImp;
      p.speed = clamp(p.vx * Math.sin(p.angle) + p.vz * Math.cos(p.angle), -6, (MAX_ANY * K));
      const rx = best.cx - p.x, rz = best.cz - p.z;
      p.spin = clamp(p.spin + (rz * nx - rx * nz) * jImp * 1.6, -3.2, 3.2);
      if (jImp > 1.4) p.slide = Math.max(p.slide, Math.min(0.5, jImp * 0.08));
      if (jImp > 0.6) { this.stats.rams++; this.emit('bump', { strength: jImp, x: best.cx, z: best.cz, player: true, other: e.name || 'Mitspieler' }); }
    }
  }

  _passGate() {
    this._nextGate += 1 / 8;
    this.checkpointCount++;
    this.nextCheckpoint = this.checkpointCount + 1;
    if (this.checkpointCount < 8) return;
    const lapTime = this.elapsed - this._lapStartedAt;
    this._lapStartedAt = this.elapsed;
    this.lapTimes.push(lapTime);
    this.bestLap = this.bestLap === null ? lapTime : Math.min(this.bestLap, lapTime);
    this.lapsCompleted++;
    this.checkpointCount = 0;
    this.nextCheckpoint = 1;
    this.lap = Math.min(3, this.lapsCompleted + 1);
    this.emit('lap', { lap: this.lapsCompleted, lapsCompleted: this.lapsCompleted, lapTime });
    if (this.lapsCompleted >= 3) {
      this.status = 'finished';
      this.finishedTime = this.elapsed;
      this.player.boosting = false;
      this.position = this._computePosition();
      this.emit('finish', { time: this.finishedTime, bestLap: this.bestLap, position: this.position });
    }
  }
}
