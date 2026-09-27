// Slingshot aim: press on the hero, drag away from the target, release to fire
// the opposite way. Everything is measured on the ground plane, in tiles.

import { CONFIG } from './config.js';
import { createWorld, createBall, stepWorld } from './physics.js';

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
 * losses. Other balls (enemies) are copied in as obstacles, so contacts with
 * them bend the path like walls. It keeps up to `previewBounces` bounces and
 * ends at the next contact.
 * Returns { points: [start, ...bends, end], bends: count, stopped }.
 */
export function previewPath(level, hero, dirX, dirZ, speed, others = []) {
  const world = createWorld(level);
  const ghost = createBall({ x: hero.x, z: hero.z, radius: hero.radius });
  ghost.vx = dirX * speed;
  ghost.vz = dirZ * speed;
  world.balls.push(ghost);
  for (const o of others) world.balls.push(createBall({ x: o.x, z: o.z, radius: o.radius }));
  const touchesGhost = (ev) => ev.ball === ghost || ev.a === ghost || ev.b === ghost;

  const points = [{ x: hero.x, z: hero.z }];
  let bends = 0;
  const maxSteps = Math.ceil(A.previewMaxTime / CONFIG.physics.step);
  // Stop once the ghost rests; knocked obstacles may still be rolling.
  for (let i = 0; i < maxSteps && (ghost.vx !== 0 || ghost.vz !== 0); i++) {
    stepWorld(world);
    const hit = world.events.some(touchesGhost);
    world.events.length = 0;
    if (hit) {
      points.push({ x: ghost.x, z: ghost.z });
      if (++bends > A.previewBounces) return { points, bends: bends - 1, stopped: false };
    }
  }
  points.push({ x: ghost.x, z: ghost.z });
  return { points, bends, stopped: true };
}
