// Slingshot aim: press on the hero, drag away from the target, release to fire
// the opposite way. Everything is measured on the ground plane, in tiles.

import { CONFIG } from './config.js';
import { createWorld, createBall, stepWorld, isAtRest } from './physics.js';

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
 * Aim preview: run the shot through the real physics on a ghost ball, so the
 * path ends where the ball would stop, with the same friction and bounce
 * losses. It keeps up to `previewBounces` bounces and ends at the next contact.
 * Returns { points: [start, ...bends, end], bends: count, stopped }.
 */
export function previewPath(level, hero, dirX, dirZ, speed) {
  const world = createWorld(level);
  const ghost = createBall({ x: hero.x, z: hero.z, radius: hero.radius });
  ghost.vx = dirX * speed;
  ghost.vz = dirZ * speed;
  world.balls.push(ghost);

  const points = [{ x: hero.x, z: hero.z }];
  let bends = 0;
  const maxSteps = Math.ceil(A.previewMaxTime / CONFIG.physics.step);
  for (let i = 0; i < maxSteps && !isAtRest(world); i++) {
    stepWorld(world);
    if (world.events.length) {
      world.events.length = 0;
      points.push({ x: ghost.x, z: ghost.z });
      if (++bends > A.previewBounces) return { points, bends: bends - 1, stopped: false };
    }
  }
  points.push({ x: ghost.x, z: ghost.z });
  return { points, bends, stopped: true };
}
