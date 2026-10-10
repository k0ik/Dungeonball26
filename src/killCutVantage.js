// Where the kill cam cuts to (design doc: "Kill cam"). A ring of camera
// spots round the impact, killCutRadius tiles out and killCutHeight up,
// kept to the side of the board the usual camera looks from (within
// killCutSpread of it), so faces and wall shading still read right. Each
// spot must see both your ball (where it is now) and the impact over the
// walls, and stand clear of every ball; of those, the best views your
// ball's path side-on (so it crosses the frame rather than coming straight
// at the lens), with your ball and the impact close together in view, from
// over open floor, near the usual camera's side. Returns null when no spot
// works (the kill cam then stays on the usual camera).

import { CONFIG } from './config.js';
import { tileAt } from './level.js';

const BALL_Y = CONFIG.ball.diameter / 2;

/** Can a camera at (p.x, h, p.z) see a ball centre at t over the walls (and half-walls)? */
export function seesOver(level, p, h, t) {
  const W = CONFIG.render.wallHeight;
  const dx = t.x - p.x;
  const dz = t.z - p.z;
  const n = Math.ceil(Math.hypot(dx, dz) / 0.1);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const tile = tileAt(level, Math.floor(p.x + dx * k), Math.floor(p.z + dz * k));
    const top = tile === 'wall' || tile === 'door' ? W : tile === 'half' ? W * CONFIG.render.halfWallShare : 0;
    if (top && h + (BALL_Y - h) * k < top + 0.05) return false;
  }
  return true;
}

/**
 * The best camera spot ({ x, z, y }) for the cut, or null. `hero` and
 * `impact` are ground points ({ x, z }); `heading` is your ball's direction
 * of travel; `toward` is the ground direction from the board toward the
 * usual camera; `balls` are kept clear of.
 */
export function chooseVantage(level, balls, hero, impact, heading, toward) {
  const C = CONFIG.camera;
  const base = Math.atan2(toward.z, toward.x);
  const spread = (C.killCutSpread * Math.PI) / 180;
  const fov = (C.killCutFov * Math.PI) / 180;
  const hl = Math.hypot(heading.x, heading.z) || 1;
  let best = null;
  for (let i = 0; i < C.killCutSpots; i++) {
    const off = -spread + (2 * spread * i) / (C.killCutSpots - 1);
    const p = { x: impact.x + Math.cos(base + off) * C.killCutRadius, z: impact.z + Math.sin(base + off) * C.killCutRadius, y: C.killCutHeight };
    if (p.x < 0.5 || p.z < 0.5 || p.x > level.width - 0.5 || p.z > level.height - 0.5) continue;
    if (!seesOver(level, p, p.y, hero) || !seesOver(level, p, p.y, impact)) continue;
    if (balls.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < C.killCutClear)) continue;
    // Side-on: the path across the line of sight, not along it.
    const vx = impact.x - p.x;
    const vz = impact.z - p.z;
    const vl = Math.hypot(vx, vz) || 1;
    const side = 1 - Math.abs((heading.x * vx + heading.z * vz) / (hl * vl));
    // Your ball and the impact close together in view (an angle well inside the field of view).
    const hx = hero.x - p.x;
    const hz = hero.z - p.z;
    const between = Math.acos(Math.max(-1, Math.min(1, (hx * vx + hz * vz) / ((Math.hypot(hx, hz) || 1) * vl))));
    if (between > fov * 0.9) continue;
    const t = tileAt(level, Math.floor(p.x), Math.floor(p.z));
    const overFloor = t === 'wall' || t === 'door' ? 0 : 1;
    const score = side + 0.3 * overFloor - 0.4 * (between / fov) - 0.2 * (Math.abs(off) / spread);
    if (!best || score > best.score) best = { ...p, score };
  }
  return best && { x: best.x, z: best.z, y: best.y };
}
