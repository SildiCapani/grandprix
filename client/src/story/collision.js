// Shared footprint maths for placement and driving. Box angles follow Three.js.
export function footprintDistance(c, x, z) {
  const dx = x - c.x, dz = z - c.z;
  if (c.r != null) return Math.max(0, Math.hypot(dx, dz) - c.r);
  const ca = Math.cos(c.ang || 0), sa = Math.sin(c.ang || 0);
  return Math.hypot(Math.max(0, Math.abs(dx * ca - dz * sa) - c.hx),
    Math.max(0, Math.abs(dx * sa + dz * ca) - c.hz));
}

export function overlapsHeight(body, collider, height = 1.8) {
  // Placement queries deliberately omit y and still check the entire footprint.
  return !Number.isFinite(body.y) || (body.y < collider.maxY && body.y + height > collider.minY);
}
