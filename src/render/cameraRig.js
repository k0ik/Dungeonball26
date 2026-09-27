// Orthographic camera at the mockup's fixed angle: the grid turned `yawDeg` on
// screen, seen from `elevationDeg` above the ground. It never rotates.
//
// It frames the action (design doc: "Camera, HUD and presentation"): each
// frame the game hands it the points that matter (the hero at rest, every
// moving ball, the enemy taking its turn) and the camera eases its centre and
// zoom to fit them all with padding. The speed-based zoom sets the minimum
// width, so hard shots still pull the camera out.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const K = CONFIG.camera;

/** Screen-space axes on the ground plane for a given yaw. */
function axes(yaw) {
  // `toward` points from the view centre toward the camera (screen down),
  // `right` is screen right. With yaw > 0, +x runs down-right and +z runs
  // down-left on screen, as in the mockup.
  return {
    toward: { x: Math.sin(yaw), z: Math.cos(yaw) },
    right: { x: Math.cos(yaw), z: -Math.sin(yaw) },
  };
}

/**
 * Where to look and how wide to be to fit `points` (ground {x, z}) on screen
 * with `padding` (screen units, i.e. tiles at the view plane) around them.
 * Pure, so it can be unit tested. Returns { x, z, width }.
 */
export function computeFraming(points, { yaw, elevation, aspect, minWidth, maxWidth, padding }) {
  const { toward, right } = axes(yaw);
  const squash = Math.sin(elevation); // ground depth is foreshortened on screen
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const sx = p.x * right.x + p.z * right.z;
    const sy = (p.x * toward.x + p.z * toward.z) * squash;
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfW = (maxX - minX) / 2 + padding;
  const halfH = (maxY - minY) / 2 + padding;
  // Width must fit the spread across, and (via the aspect) the spread down.
  const width = Math.min(maxWidth, Math.max(minWidth, 2 * halfW, 2 * halfH * aspect));
  // Back from screen space to the ground point at the centre.
  const gy = cy / squash;
  return { x: right.x * cx + toward.x * gy, z: right.z * cx + toward.z * gy, width };
}

export function createCameraRig() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, K.distance * 3);
  const elevation = THREE.MathUtils.degToRad(K.elevationDeg);
  const yaw = THREE.MathUtils.degToRad(K.yawDeg);
  const { toward } = axes(yaw);
  const offset = new THREE.Vector3(toward.x, 0, toward.z)
    .multiplyScalar(Math.cos(elevation))
    .add(new THREE.Vector3(0, Math.sin(elevation), 0))
    .multiplyScalar(K.distance);

  // Aim at ball-centre height so a framed ball sits at screen centre.
  const target = new THREE.Vector3(0, CONFIG.ball.diameter / 2, 0);
  const goal = { x: 0, z: 0, width: K.baseViewWidth };
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

  function clampToBounds(p) {
    p.x = Math.min(Math.max(p.x, bounds.minX), bounds.maxX);
    p.z = Math.min(Math.max(p.z, bounds.minZ), bounds.maxZ);
  }

  function place() {
    clampToBounds(target);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }

  applyFrustum();
  place();

  return {
    camera,
    /** Yaw in radians, for ground-plane visuals that must stay screen-aligned. */
    yaw,
    /** Unit vector from the scene toward the camera. */
    toCamera: offset.clone().normalize(),
    get viewWidth() {
      return viewWidth;
    },
    /** True once the camera has (nearly) reached its current framing. */
    get settled() {
      return (
        Math.hypot(goal.x - target.x, goal.z - target.z) < K.settleDistance &&
        Math.abs(goal.width - viewWidth) < goal.width * K.settleZoom
      );
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
    /** Jump straight to a ground point at the resting zoom. */
    snapTo(x, z) {
      Object.assign(goal, { x, z, width: K.baseViewWidth });
      clampToBounds(goal);
      target.x = goal.x;
      target.z = goal.z;
      viewWidth = goal.width;
      applyFrustum();
      place();
    },
    /**
     * Ease toward framing `points`. `minWidth` is the narrowest allowed view
     * (the speed-based zoom); the framing only ever widens beyond it.
     */
    frame(points, minWidth, dt) {
      Object.assign(
        goal,
        computeFraming(points, { yaw, elevation, aspect, minWidth, maxWidth: K.maxFrameWidth, padding: K.framePadding }),
      );
      clampToBounds(goal);
      const k = 1 - Math.exp(-K.followRate * dt);
      target.x += (goal.x - target.x) * k;
      target.z += (goal.z - target.z) * k;
      const rate = goal.width > viewWidth ? K.zoomOutRate : K.zoomInRate;
      viewWidth += (goal.width - viewWidth) * (1 - Math.exp(-rate * dt));
      applyFrustum();
      place();
    },
    /** The speed-based minimum width for a ball moving at `speed`. */
    speedWidth(speed) {
      const t = Math.min(1, speed / CONFIG.aim.maxLaunchSpeed);
      return K.baseViewWidth + (K.maxViewWidth - K.baseViewWidth) * t;
    },
  };
}
