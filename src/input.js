import * as THREE from 'three';
import { AIM } from './config.js';

// Slingshot aim: press on the hero, drag away from the target, release to fire the opposite way.
// Mouse and touch share one pointer path; pointers are raycast onto the ground plane.
export function createAimInput({ canvas, camera, getHero, canAim, onChange, onFire }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let pointerId = null;
  let aim = null;

  function project(e, planeY = 0) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    ground.constant = -planeY;
    return raycaster.ray.intersectPlane(ground, hit) ? { x: hit.x, z: hit.z } : null;
  }

  function measure(p) {
    const hero = getHero();
    const dx = p.x - hero.x;
    const dz = p.z - hero.z;
    const dist = Math.hypot(dx, dz);
    const fill = THREE.MathUtils.clamp((dist - AIM.ringInner) / (AIM.ringOuter - AIM.ringInner), 0, 1);
    const cancelled = dist < AIM.ringInner || fill === 0;
    // Launch direction is opposite the drag.
    const dirX = dist > 0 ? -dx / dist : 0;
    const dirZ = dist > 0 ? -dz / dist : 0;
    return { fill, cancelled, dirX, dirZ, speed: fill * AIM.maxLaunchSpeed };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (pointerId !== null || !canAim()) return;
    const hero = getHero();
    // Accept a press on the ball's visible body (raised by its radius) or its footprint.
    const near = [project(e, hero.radius), project(e, 0)].some(
      (p) => p && Math.hypot(p.x - hero.x, p.z - hero.z) <= AIM.pressRadius,
    );
    if (!near) return;
    pointerId = e.pointerId;
    canvas.setPointerCapture(pointerId);
    aim = { fill: 0, cancelled: true, dirX: 0, dirZ: 0, speed: 0 };
    onChange(aim);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const p = project(e);
    if (!p) return;
    aim = measure(p);
    onChange(aim);
  });

  function end(e, fire) {
    if (e.pointerId !== pointerId) return;
    const p = project(e);
    if (p) aim = measure(p);
    pointerId = null;
    const final = aim;
    aim = null;
    onChange(null);
    if (fire && final && !final.cancelled) onFire(final);
  }
  canvas.addEventListener('pointerup', (e) => end(e, true));
  canvas.addEventListener('pointercancel', (e) => end(e, false));

  return {
    get aiming() {
      return pointerId !== null;
    },
  };
}
