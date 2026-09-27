// Orthographic camera at a fixed isometric tilt. It never rotates; its only zoom
// is automatic and driven by the hero's speed (design doc: "Dynamic zoom").

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const K = CONFIG.camera;

export function createCameraRig() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, K.distance * 3);
  const tilt = THREE.MathUtils.degToRad(K.tiltDeg);
  // Offset toward +z (the bottom of the level) and up, looking back at the target.
  const offset = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)).multiplyScalar(K.distance);
  const target = new THREE.Vector3();

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
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }

  applyFrustum();
  place();

  return {
    camera,
    get viewWidth() {
      return viewWidth;
    },
    setAspect(a) {
      aspect = a;
      applyFrustum();
    },
    lookAt(x, z) {
      target.set(x, 0, z);
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
