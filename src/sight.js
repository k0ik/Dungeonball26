// Line of sight (design doc: "Combat rules and formulas"). An enemy sees the
// hero when the hero is within sight range and a hero-width sweep from the
// enemy to the hero touches no wall, no other ball and no barrel or chest, so
// anything it can see it could really reach with a lunge.

import { CONFIG } from './config.js';
import { overlapsSolid } from './physics.js';

const SWEEP_STEP = 0.05; // tiles between wall checks along the sweep

/** Distance from point (px, pz) to segment a-b. */
function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Rough radius of a static bumper for sight and path checks. */
function staticRadius(s) {
  return s.shape === 'circle' ? s.radius : Math.hypot(s.halfX, s.halfZ);
}

/**
 * Does `enemy` see `hero`? `balls` is every ball on the board; any ball other
 * than these two that the sweep would hit blocks sight, as do `statics`.
 */
export function canSee(level, enemy, hero, balls, statics = []) {
  const dx = hero.x - enemy.x;
  const dz = hero.z - enemy.z;
  const dist = Math.hypot(dx, dz);
  if (dist > CONFIG.enemy.sightRange) return false;

  // Hero-width sweep against walls (slightly shrunk so resting against a
  // wall doesn't count as a hit at the very start).
  const r = hero.radius - 1e-3;
  const steps = Math.ceil(dist / SWEEP_STEP);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (overlapsSolid(level, enemy.x + dx * t, enemy.z + dz * t, r)) return false;
  }

  // ...and against other balls: blocked if the sweep's circle would touch one.
  for (const b of balls) {
    if (b === enemy || b === hero) continue;
    if (distToSegment(b.x, b.z, enemy.x, enemy.z, hero.x, hero.z) < b.radius + hero.radius) return false;
  }
  for (const s of statics) {
    if (distToSegment(s.x, s.z, enemy.x, enemy.z, hero.x, hero.z) < staticRadius(s) + hero.radius) return false;
  }
  return true;
}
