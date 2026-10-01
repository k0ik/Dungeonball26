// Enemy-turn decisions (design doc: "Core loop and turn structure"): who acts
// next, and where a patrolling enemy heads. Pure functions, unit tested.

import { CONFIG } from './config.js';
import { tileAt } from './level.js';
import { overlapsSolid, staticContact } from './physics.js';

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

/**
 * The enemies allowed to patrol this round: a random `share` of them (rounded
 * up), so a round doesn't drag through every enemy's patrol. Enemies left out
 * still lunge if they can see the hero on their turn.
 */
export function pickPatrollers(enemies, share = E.patrolShare, rng = Math.random) {
  const pool = [...enemies];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, Math.ceil(pool.length * share)));
}

/** Velocity for a lunge: straight at the hero's current position. */
export function lungeVelocity(enemy, hero) {
  const dx = hero.x - enemy.x;
  const dz = hero.z - enemy.z;
  const d = Math.hypot(dx, dz) || 1;
  const speed = (enemy.type && E.types[enemy.type].lungeSpeed) ?? E.lungeSpeed;
  return { vx: (dx / d) * speed, vz: (dz / d) * speed };
}

function pathClear(level, statics, x0, z0, x1, z1, r) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / 0.1);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t };
    if (overlapsSolid(level, p.x, p.z, r)) return false;
    if (statics.some((s) => staticContact(p, s, r))) return false;
  }
  return true;
}

/**
 * Patrol: pick a random open floor tile within `patrolRadius` that no ball is
 * on and that the enemy can roll to in a straight line, then choose the speed
 * that friction brings to rest there (clamped to the patrol speed range).
 * Returns { vx, vz, target } or null to stay put.
 */
export function patrolMove(level, enemy, balls, rng = Math.random, statics = []) {
  const T = enemy.type ? E.types[enemy.type] : null;
  const R = T?.patrolRadius ?? E.patrolRadius;
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
      if (!pathClear(level, statics, enemy.x, enemy.z, x, z, enemy.radius - 1e-3)) continue;
      options.push({ x, z, d });
    }
  }
  if (!options.length) return null;
  const target = options[Math.floor(rng() * options.length)];
  // v² = 2·a·d brings a ball to rest exactly d away under constant friction.
  // (Its own friction: a Slider needs far less speed to glide as far.)
  const speed = Math.min(E.patrolSpeedMax, Math.max(E.patrolSpeedMin, Math.sqrt(2 * CONFIG.physics.friction * (enemy.friction ?? 1) * target.d)));
  return {
    vx: ((target.x - enemy.x) / target.d) * speed,
    vz: ((target.z - enemy.z) / target.d) * speed,
    target,
  };
}

/**
 * Walking distance in tiles from (x, z) to every tile, through open floor
 * (walls and closed doors block), 4-way. Returns a function (col, row) ->
 * distance, Infinity where unreachable.
 */
export function walkDistances(level, x, z) {
  const W = level.width;
  const dist = new Float64Array(W * level.height).fill(Infinity);
  const open = (c, r) => c >= 0 && r >= 0 && c < W && r < level.height && !['wall', 'door'].includes(level.tiles[r][c]);
  const c0 = Math.floor(x);
  const r0 = Math.floor(z);
  if (open(c0, r0)) {
    dist[r0 * W + c0] = 0;
    const queue = [[c0, r0]];
    for (let i = 0; i < queue.length; i++) {
      const [c, r] = queue[i];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (!open(nc, nr) || dist[nr * W + nc] !== Infinity) continue;
        dist[nr * W + nc] = dist[r * W + c] + 1;
        queue.push([nc, nr]);
      }
    }
  }
  return (c, r) => (c >= 0 && r >= 0 && c < W && r < level.height ? dist[r * W + c] : Infinity);
}

/**
 * A Seeker's patrol: of `tries` ordinary patrol moves, the one that ends
 * closest to the hero by walking distance (`toHero` from walkDistances).
 */
export function seekerMove(level, enemy, balls, toHero, rng = Math.random, statics = [], tries = E.types.seeker.tries) {
  let best = null;
  for (let i = 0; i < tries; i++) {
    const move = patrolMove(level, enemy, balls, rng, statics);
    if (!move) return null;
    const d = toHero(Math.floor(move.target.x), Math.floor(move.target.z));
    if (!best || d < best.d) best = { move, d };
  }
  return best.move;
}

/**
 * Damage the hero takes from an attacker's hit: a flat amount, whatever the
 * enemy's level (changed after playtesting from the doc's max(1, L − DEF)).
 */
export function heroDamage(attacker) {
  return (attacker?.type && E.types[attacker.type].damageToHero) ?? E.damageToHero;
}
