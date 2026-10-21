// Time-trial ghost: the best run on a track (per speed class and account) drives along as a see-through kart.
// A run is sampled ten times a second (position, height, heading, pitch) and stored compactly in this browser.
const STEP = .1;
const keyFor = (user, mapId, cc) => `apex-ghost:${(user || 'gast').toLowerCase()}:${mapId}:${cc}`;

export function loadGhost(user, mapId, cc) {
  try { const g = JSON.parse(localStorage.getItem(keyFor(user, mapId, cc)) || 'null'); return g && Array.isArray(g.d) && g.time > 0 ? g : null; } catch { return null; }
}

export function createGhostRecorder() {
  let rec = null, next = 0;
  return {
    begin() { rec = []; next = 0; },
    // Sample the player at the race clock.
    sample(p, elapsed) {
      if (!rec) return;
      while (elapsed >= next) { rec.push(Math.round(p.x * 10), Math.round((p.y || 0) * 10), Math.round(p.z * 10), Math.round(p.angle * 100), Math.round((p.pitch || 0) * 100)); next += STEP; }
    },
    // Store the run when it beat the old ghost. Returns true when it did.
    finish(user, mapId, cc, time, look) {
      if (!rec || !(time > 0)) return false;
      const old = loadGhost(user, mapId, cc);
      if (old && old.time <= time) { rec = null; return false; }
      try { localStorage.setItem(keyFor(user, mapId, cc), JSON.stringify({ time, step: STEP, ...look, d: rec })); } catch { rec = null; return false; }
      rec = null; return true;
    },
    stop() { rec = null; },
  };
}

// Interpolated pose of a stored ghost at race time t (null past its finish).
export function ghostPose(g, t) {
  const n = g.d.length / 5, f = t / (g.step || STEP), i = Math.floor(f);
  if (i >= n - 1) return null;
  const u = Math.max(0, f - i), a = Math.max(0, i) * 5, b = Math.min(n - 1, Math.max(0, i) + 1) * 5, d = g.d, lerp = (k) => (d[a + k] + (d[b + k] - d[a + k]) * u);
  let da = d[b + 3] - d[a + 3]; while (da > 314) da -= 628; while (da < -314) da += 628;
  return { x: lerp(0) / 10, y: lerp(1) / 10, z: lerp(2) / 10, angle: (d[a + 3] + da * u) / 100, pitch: lerp(4) / 100 };
}
