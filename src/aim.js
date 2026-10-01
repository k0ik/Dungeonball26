// Slingshot aim: press on the hero, drag away from the target, release to fire
// the opposite way. Everything is measured on the ground plane, in tiles.

import { CONFIG } from './config.js';
import { createWorld, createBall, stepWorld, applyBumperKick } from './physics.js';
import { createCombat } from './combat.js';
import { resolveObjects } from './objects.js';

const A = CONFIG.aim;

/**
 * Turn a drag point into a shot. `fill` is 0..1 of full power;
 * `cancel` is true while the pointer is inside the cancel radius.
 */
export function shotFromDrag(hero, pointer) {
  const dx = hero.x - pointer.x;
  const dz = hero.z - pointer.z;
  const dist = Math.hypot(dx, dz);
  if (dist < A.cancelRadius) return { cancel: true, fill: 0, speed: 0, dirX: 0, dirZ: 0 };
  const fill = Math.min(1, (dist - A.cancelRadius) / (A.fullPowerDrag - A.cancelRadius));
  return { cancel: false, fill, speed: fill * A.maxLaunchSpeed, dirX: dx / dist, dirZ: dz / dist };
}

export function canGrab(hero, pointer) {
  return Math.hypot(pointer.x - hero.x, pointer.z - hero.z) <= A.grabRadius;
}

/**
 * Aim preview: run the shot through the real rules on a ghost ball, so the
 * path ends where the ball would stop, with the same friction and bounce
 * losses. Everything else is copied in, not shared: enemies (with their HP)
 * and barrels and chests (with their cracks), and the real combat and object
 * rules run on the copies, so a killing blow ricochets, a barrel on its
 * second crack breaks and gets out of the way, and a red barrel goes off,
 * exactly as in the real shot. It keeps up to `previewBounces` bounces and
 * ends at the next contact. `hero` supplies position, ATK, HP and friction;
 * `kick` and `barrelHits` carry card effects (Elasticity, Barrel of Fun).
 * Returns { points: [start, ...bends, end], bends: count, stopped }.
 */
export function previewPath(level, hero, dirX, dirZ, speed, others = [], statics = [], { kick = 0, barrelHits } = {}) {
  const world = createWorld(level);
  const ghost = Object.assign(createBall({ x: hero.x, z: hero.z, radius: hero.radius, kind: 'hero', id: 'ghost' }), {
    atk: hero.atk ?? 1,
    hp: hero.hp ?? 1,
    maxHp: hero.maxHp ?? 1,
    shield: hero.shield ?? false,
    friction: hero.friction, // the Athletic card
  });
  ghost.vx = dirX * speed;
  ghost.vz = dirZ * speed;
  world.balls.push(ghost);
  for (const o of others) {
    const copy = createBall({ x: o.x, z: o.z, radius: o.radius, kind: o.kind, id: o.id });
    if (o.kind === 'enemy') Object.assign(copy, { hp: o.hp, maxHp: o.maxHp, level: o.level, type: o.type, friction: o.friction, lastHit: -Infinity });
    world.balls.push(copy);
  }
  // Copies, so cracking or breaking one here never touches the real board.
  world.statics = statics.map((s) => ({ ...s, lastHit: -Infinity }));
  const combat = createCombat();
  combat.beginShot();
  const kicked = new Set(); // bumpers that have given their one Elasticity kick
  const touchesGhost = (ev) => ev.ball === ghost || ev.a === ghost || ev.b === ghost;

  const points = [{ x: hero.x, z: hero.z }];
  let bends = 0;
  const maxSteps = Math.ceil(A.previewMaxTime / CONFIG.physics.step);
  // Stop once the ghost rests; knocked obstacles may still be rolling.
  for (let i = 0; i < maxSteps && (ghost.vx !== 0 || ghost.vz !== 0); i++) {
    stepWorld(world);
    const hit = world.events.some(touchesGhost);
    combat.resolve(world, ghost);
    resolveObjects(world, ghost, () => 0.5, { barrelHits });
    if (kick) applyBumperKick(world, ghost, kick, CONFIG.aim.maxLaunchSpeed, kicked); // the Elasticity card
    world.events.length = 0;
    if (hit) {
      points.push({ x: ghost.x, z: ghost.z });
      if (++bends > A.previewBounces) return { points, bends: bends - 1, stopped: false };
    }
  }
  points.push({ x: ghost.x, z: ghost.z });
  return { points, bends, stopped: true };
}
