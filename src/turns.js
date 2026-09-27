// Enemy-turn decisions (design doc: "Core loop and turn structure"): who acts
// next, and where a patrolling enemy heads. Pure functions, unit tested.

import { CONFIG } from './config.js';
import { tileAt } from './level.js';
import { overlapsSolid } from './physics.js';

const E = CONFIG.enemy;

/** The untaken living enemy nearest the hero, or null when all have acted. */
export function nextActor(enemies, hero, taken) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.hp <= 0 || taken.has(e)) continue;
    const d = Math.hypot(e.x - hero.x, e.z - hero.z);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Velocity for a lunge: straight at the hero's current position. */
export function lungeVelocity(enemy, hero) {
  const dx = hero.x - enemy.x;
  const dz = hero.z - enemy.z;
  const d = Math.hypot(dx, dz) || 1;
  return { vx: (dx / d) * E.lungeSpeed, vz: (dz / d) * E.lungeSpeed };
}

function pathClear(level, x0, z0, x1, z1, r) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / 0.1);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (overlapsSolid(level, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r)) return false;
  }
  return true;
}

/**
 * Patrol: pick a random open floor tile within `patrolRadius` that no ball is
 * on and that the enemy can roll to in a straight line, then choose the speed
 * that friction brings to rest there (clamped to the patrol speed range).
 * Returns { vx, vz, target } or null to stay put.
 */
export function patrolMove(level, enemy, balls, rng = Math.random) {
  const R = E.patrolRadius;
  const col0 = Math.floor(enemy.x);
  const row0 = Math.floor(enemy.z);
  const options = [];
  for (let row = row0 - R; row <= row0 + R; row++) {
    for (let col = col0 - R; col <= col0 + R; col++) {
      if (col === col0 && row === row0) continue;
      if (tileAt(level, col, row) !== 'floor') continue;
      const x = col + 0.5;
      const z = row + 0.5;
      const d = Math.hypot(x - enemy.x, z - enemy.z);
      if (d > R) continue;
      if (balls.some((b) => b !== enemy && Math.hypot(b.x - x, b.z - z) < b.radius + enemy.radius)) continue;
      if (!pathClear(level, enemy.x, enemy.z, x, z, enemy.radius - 1e-3)) continue;
      options.push({ x, z, d });
    }
  }
  if (!options.length) return null;
  const target = options[Math.floor(rng() * options.length)];
  // v² = 2·a·d brings a ball to rest exactly d away under constant friction.
  const speed = Math.min(E.patrolSpeedMax, Math.max(E.patrolSpeedMin, Math.sqrt(2 * CONFIG.physics.friction * target.d)));
  return {
    vx: ((target.x - enemy.x) / target.d) * speed,
    vz: ((target.z - enemy.z) / target.d) * speed,
    target,
  };
}

/**
 * Damage the hero takes from an attacker's hit: a flat amount, whatever the
 * enemy's level (changed after playtesting from the doc's max(1, L − DEF)).
 */
export function heroDamage() {
  return E.damageToHero;
}
