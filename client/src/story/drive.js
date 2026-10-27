// Free-roam kart physics for the story mode. Same feel as the race (drift with mini-turbos, grip model, kart stats),
// but on an open heightfield: slopes slow you down, ramps launch you, the ground can be grass, sand, snow, ice …
// Used for the player and for every AI car (rivals, couriers, bosses).
import { kartById, withParts } from '../game/karts.js';

export const K = 1.45;                 // speed class of the open world (~116 km/h)
export const TOP = 80 / 3.6 * K;      // m/s
const G = 27;                          // arcade gravity
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angleDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const turnF = turn => 1 + (turn - 1) * 1.25 / K;
const turnRadius = (v, turn = 1) => 5.1 + Math.abs(v) * .45 * turnF(turn);
export const DRIFT_TIERS = [{ at: .75, time: .55, speed: 25.5 * K }, { at: 1.7, time: 1, speed: 27 * K }, { at: 2.8, time: 1.5, speed: 28.5 * K }];
const driftTier = t => t >= DRIFT_TIERS[2].at ? 3 : t >= DRIFT_TIERS[1].at ? 2 : t >= DRIFT_TIERS[0].at ? 1 : 0;
// how much of the top speed each ground keeps (the kart's offroad stat closes part of the gap) and how well the tyres grip
const SURF = { road: [1, 1], grass: [.8, .9], sand: [.7, .8], mud: [.72, .75], snow: [.76, .6], rock: [.86, .95], ice: [.96, .16], lava: [.5, .8], water: [.4, .5] };

export function makeCar(o = {}) {
  const k = withParts(kartById(o.kart || 'allround'), o.wheel || 'standard', o.glider || 'standard');
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, angle: 0, speed: 0, steer: 0, drift: 0, driftT: 0, drifting: false, turboT: 0, turboSpeed: 0,
    airT: 0, grounded: true, spinT: 0, spinAngle: 0, invuln: 0, boosting: false, surface: 'road', offroad: false, pitch: 0, roll: 0, slide: 0, stunT: 0,
    top: k.top, accel: k.accel, turn: k.turn, mass: k.mass, driftRate: k.drift, offroadF: k.offroad, capMul: 1, ...o };
}

export function turbo(c, time, speed) {
  if (c.turboT > 0 && c.turboSpeed > speed) { c.turboT = Math.max(c.turboT, time); return; }
  c.turboT = time; c.turboSpeed = speed; c.speed = Math.max(c.speed, speed * .96);
}
export const canUseBoostPad = c => c.grounded && c.speed > 3 && c.spinT <= 0;
export function spinOut(c, time = 1.1) { if (c.invuln > 0) return false; c.spinT = time; c.invuln = time + 1.2; c.drift = 0; c.driftT = 0; c.turboT = 0; return true; }

// One physics step. input: { throttle -1…1, steer -1…1, brake bool }. world: island. Returns events (array of strings).
export function stepCar(c, input, dt, world) {
  const ev = [];
  c.turboT = Math.max(0, c.turboT - dt); c.invuln = Math.max(0, c.invuln - dt); c.slide = Math.max(0, c.slide - dt); c.stunT = Math.max(0, c.stunT - dt);
  if (c.spinT > 0) { c.spinT = Math.max(0, c.spinT - dt); c.spinAngle += dt * TAU * 1.6; if (!c.spinT) c.spinAngle = 0; }
  const spinning = c.spinT > 0 || c.stunT > 0;
  const steerIn = spinning ? 0 : clamp(input.steer || 0, -1, 1), throttle = spinning ? 0 : clamp(input.throttle || 0, -1, 1), brake = !spinning && !!input.brake;
  c.steer += (steerIn - c.steer) * Math.min(1, dt * 10);
  const surf = SURF[c.surface] || SURF.road, ground = c.grounded;

  // power drift: brake + steer at speed; release fires the mini-turbo
  if (!c.drift) { if (brake && Math.abs(steerIn) > .3 && c.speed > 8 && ground) { c.drift = Math.sign(steerIn); c.driftT = 0; ev.push('driftstart'); } }
  else if (!brake || c.speed < 6 || spinning) { const tier = spinning ? 0 : driftTier(c.driftT); if (tier) { const d = DRIFT_TIERS[tier - 1]; turbo(c, d.time, d.speed); ev.push('drift' + tier); } c.drift = 0; c.driftT = 0; }
  else { const before = driftTier(c.driftT); if (ground) c.driftT += dt * (Math.sign(steerIn) === c.drift ? 1.15 : .75) * c.driftRate; const after = driftTier(c.driftT); if (after > before) ev.push('tier' + after); }
  c.drifting = !!c.drift;

  // engine
  if (ground) {
    const acc = (throttle < 0 && c.speed > 1 ? 26 : 17 * c.accel) * K;
    c.speed += throttle * acc * dt;
    c.speed *= Math.exp(-dt * (throttle === 0 ? .55 : .18));
    if (brake && !c.drift) c.speed = Math.sign(c.speed) * Math.max(0, Math.abs(c.speed) - 26 * dt);
    // slopes: rolling downhill speeds you up, climbing slows you down
    const sa = Math.sin(c.angle), ca = Math.cos(c.angle), ahead = world.ground(c.x + sa * 1.6, c.z + ca * 1.6), behind = world.ground(c.x - sa * 1.6, c.z - ca * 1.6), slope = clamp((ahead - behind) / 3.2, -1.2, 1.2);
    c.pitch += (Math.atan(slope) - c.pitch) * Math.min(1, dt * 10);
    c.speed -= G * .55 * Math.sin(Math.atan(slope)) * dt;
  } else c.speed *= Math.exp(-dt * .05);
  if (c.turboT > 0) c.speed = Math.max(c.speed, c.turboSpeed * .96);
  if (spinning) c.speed *= Math.exp(-dt * 2.4);
  const cap = c.turboT > 0 ? Math.max(c.turboSpeed, TOP * c.top) : TOP * c.top * c.capMul * (surf[0] + (1 - surf[0]) * c.offroadF * .7);
  if (c.speed > cap) c.speed -= (c.speed - cap) * Math.min(1, dt * (ground ? 2.6 : .3));
  c.speed = clamp(c.speed, -8, 60);
  c.boosting = c.turboT > 0;

  // steering (screen-right is world -X: same convention as the race)
  const yaw = c.drift ? -c.drift * c.speed / turnRadius(c.speed, c.turn) * (.62 + .66 * clamp(c.steer * c.drift, -1, 1)) : -c.steer * c.speed / turnRadius(c.speed, c.turn);
  c.angle += yaw * dt * (ground ? 1 : .35);
  if (!c.drift && ground) { const lat = Math.abs(yaw * c.speed), grip = 17 * K / turnF(c.turn); if (lat > grip) c.speed -= Math.sign(c.speed) * (lat - grip) * .3 * dt; }

  // tyres: velocity bends toward the heading (ice barely grips)
  const g = ground ? 1 - Math.exp(-dt * (c.drifting ? 9 : c.slide > 0 ? 2.6 : 15) * surf[1]) : 1 - Math.exp(-dt * .6);
  c.vx += (Math.sin(c.angle) * c.speed - c.vx) * g; c.vz += (Math.cos(c.angle) * c.speed - c.vz) * g;
  c.x += c.vx * dt; c.z += c.vz * dt;

  // the island edge
  const R = Math.hypot(c.x, c.z); if (R > 880) { c.x *= 880 / R; c.z *= 880 / R; }

  // obstacles (trees, houses, rocks)
  if (world.collide) { const hit = world.collide(c, 1.15); if (hit > 0) { c.speed = c.vx * Math.sin(c.angle) + c.vz * Math.cos(c.angle); if (hit > 6) { ev.push('crash'); c.slide = .3; } else if (hit > 1.5) ev.push('bump'); } }

  // height: follow the ground, or fly
  const gy = world.ground(c.x, c.z);
  if (c.grounded) {
    if (gy < c.y - .45 && c.vy > -2) { c.grounded = false; c.airT = 0; ev.push('takeoff'); }
    else { const vy = (gy - c.y) / dt; c.vy = clamp(vy, -30, 30); c.y = gy; }
  }
  if (!c.grounded) {
    c.airT += dt; c.vy -= G * dt; c.y += c.vy * dt;
    c.pitch += (clamp(-c.vy * .02, -.5, .5) - c.pitch) * Math.min(1, dt * 3);
    if (c.y <= gy) { const fall = -c.vy; c.y = gy; c.vy = 0; c.grounded = true; ev.push(c.airT > .55 ? 'bigland' : 'land'); if (fall > 22) c.speed *= .85; c.lastAir = c.airT; c.airT = 0; }
  }
  c.surface = world.surface(c.x, c.z, c.y);
  c.offroad = c.surface !== 'road';
  if (c.surface === 'water' && c.y < .3) ev.push('water');
  if (c.surface === 'lava' && c.grounded) ev.push('lava');
  return ev;
}

// AI: steer toward a point; returns controls. look = how far ahead to aim, speed target in m/s.
export function aiControls(c, tx, tz, want = TOP, { brakeTurn = true } = {}) {
  const ang = Math.atan2(tx - c.x, tz - c.z), diff = angleDiff(ang, c.angle);
  const steer = clamp(-diff * 2.2, -1, 1);
  let throttle = c.speed < want ? 1 : c.speed > want + 3 ? -.4 : 0;
  if (brakeTurn && Math.abs(diff) > 1.1 && c.speed > 12) throttle = -.6;
  return { steer, throttle, brake: false };
}
// AI with memory: backs out when stuck against a wall or a tree.
export function aiStep(c, tx, tz, want, dt) {
  if (c.revT > 0) { c.revT -= dt; return { throttle: -1, steer: c.revSteer, brake: false }; }
  const ctl = aiControls(c, tx, tz, want);
  if (Math.abs(c.speed) < 2.5 && ctl.throttle > 0 && !(c.spinT > 0)) { c.stuckT = (c.stuckT || 0) + dt; if (c.stuckT > .9) { c.stuckT = 0; c.revT = 1.1; c.revSteer = -ctl.steer || 1; } } else c.stuckT = 0;
  return ctl;
}
