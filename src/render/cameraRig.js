// Orthographic camera at the mockup's fixed angle: the grid turned `yawDeg` on
// screen, seen from `elevationDeg` above the ground. It never rotates. It eases
// to keep the hero centred (optionally with a deadzone), and its only zoom is
// automatic, driven by the hero's speed (design doc: "Camera, HUD and presentation").

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const K = CONFIG.camera;

export function createCameraRig() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, K.distance * 3);
  const elev = THREE.MathUtils.degToRad(K.elevationDeg);
  const yaw = THREE.MathUtils.degToRad(K.yawDeg);

  // Ground directions: `toward` points from the view centre toward the camera
  // (screen down), `right` is screen right. With yaw > 0, +x runs down-right
  // and +z runs down-left on screen, as in the mockup.
  const toward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const offset = toward
    .clone()
    .multiplyScalar(Math.cos(elev))
    .add(new THREE.Vector3(0, Math.sin(elev), 0))
    .multiplyScalar(K.distance);

  const target = new THREE.Vector3();
  const bounds = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
  let aspect = 9 / 16;
  let viewWidth = K.baseViewWidth;

  function applyFrustum() {
    const halfW = viewWidth / 2;
    const halfH = halfW / aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }

  function place() {
    target.x = Math.min(Math.max(target.x, bounds.minX), bounds.maxX);
    target.z = Math.min(Math.max(target.z, bounds.minZ), bounds.maxZ);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }

  applyFrustum();
  place();

  return {
    camera,
    /** Yaw in radians, for ground-plane visuals that must stay screen-aligned. */
    yaw,
    get viewWidth() {
      return viewWidth;
    },
    setAspect(a) {
      aspect = a;
      applyFrustum();
    },
    /** Keep the view centre over the level rectangle. */
    setBounds(minX, maxX, minZ, maxZ) {
      Object.assign(bounds, { minX, maxX, minZ, maxZ });
      place();
    },
    /** Jump straight to a ground point. */
    snapTo(x, z) {
      // Aim at ball-centre height so the ball itself sits at screen centre.
      target.set(x, CONFIG.ball.diameter / 2, z);
      place();
    },
    /**
     * Ease toward the hero. With a deadzone configured, the hero roams the
     * central deadzone freely and the camera only chases the overshoot.
     */
    follow(x, z, dt) {
      const dx = x - target.x;
      const dz = z - target.z;
      // Hero offset from the view centre in screen units (y is screen-down).
      const sx = dx * right.x + dz * right.z;
      const sy = (dx * toward.x + dz * toward.z) * Math.sin(elev);
      const halfW = (viewWidth / 2) * K.deadzoneWidth;
      const halfH = (viewWidth / aspect / 2) * K.deadzoneHeight;
      const ex = Math.sign(sx) * Math.max(0, Math.abs(sx) - halfW);
      const ey = Math.sign(sy) * Math.max(0, Math.abs(sy) - halfH);
      if (!ex && !ey) return;
      // Screen overshoot back to a ground move.
      const gy = ey / Math.sin(elev);
      const k = 1 - Math.exp(-K.followRate * dt);
      target.x += (right.x * ex + toward.x * gy) * k;
      target.z += (right.z * ex + toward.z * gy) * k;
      place();
    },
    /** Ease the frustum width toward the width for the hero's current speed. */
    updateZoom(heroSpeed, dt) {
      const t = Math.min(1, heroSpeed / CONFIG.aim.maxLaunchSpeed);
      const goal = K.baseViewWidth + (K.maxViewWidth - K.baseViewWidth) * t;
      const rate = goal > viewWidth ? K.zoomOutRate : K.zoomInRate;
      viewWidth += (goal - viewWidth) * (1 - Math.exp(-rate * dt));
      applyFrustum();
    },
  };
}
