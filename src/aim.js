// Slingshot aim: press on the hero, drag away from the target, release to fire
// the opposite way. Everything is measured on the ground plane, in tiles.

import { CONFIG } from './config.js';
import { castCircle } from './physics.js';

const A = CONFIG.aim;

/**
 * Turn a drag point into a shot. `fill` is 0..1 across the power ring;
 * `cancel` is true while the pointer is inside the ring's inner edge.
 */
export function shotFromDrag(hero, pointer) {
  const dx = hero.x - pointer.x;
  const dz = hero.z - pointer.z;
  const dist = Math.hypot(dx, dz);
  if (dist < A.ringInner) return { cancel: true, fill: 0, speed: 0, dirX: 0, dirZ: 0 };
  const fill = Math.min(1, (dist - A.ringInner) / (A.ringOuter - A.ringInner));
  return { cancel: false, fill, speed: fill * A.maxLaunchSpeed, dirX: dx / dist, dirZ: dz / dist };
}

export function canGrab(hero, pointer) {
  return Math.hypot(pointer.x - hero.x, pointer.z - hero.z) <= A.grabRadius;
}

/**
 * Aim preview: a path to the first contact plus one reflected segment.
 * Returns { points: [start, bend, end], bend: boolean }.
 */
export function previewPath(level, hero, dirX, dirZ) {
  const first = castCircle(level, hero.x, hero.z, dirX, dirZ, hero.radius, A.previewMaxLength);
  const start = { x: hero.x, z: hero.z };
  const bend = { x: first.x, z: first.z };
  if (!first.normal) return { points: [start, bend], bend: false };

  const n = first.normal;
  const dot = dirX * n.x + dirZ * n.z;
  const rx = dirX - 2 * dot * n.x;
  const rz = dirZ - 2 * dot * n.z;
  const second = castCircle(level, first.x, first.z, rx, rz, hero.radius, A.previewBounceLength);
  return { points: [start, bend, { x: second.x, z: second.z }], bend: true };
}
