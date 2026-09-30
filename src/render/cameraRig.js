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

/** Ground point -> screen-space coordinates (y is screen-down). */
function toScreen(p, { toward, right }, squash) {
  return { sx: p.x * right.x + p.z * right.z, sy: (p.x * toward.x + p.z * toward.z) * squash };
}

/** Screen-space coordinates -> ground point. */
function toGround(sx, sy, { toward, right }, squash) {
  const gy = sy / squash;
  return { x: right.x * sx + toward.x * gy, z: right.z * sx + toward.z * gy };
}

/**
 * Shift a framing so the view stays inside the level's on-screen outline
 * (`box`, in screen space) wherever the level is big enough to fill it, so
 * the camera doesn't show empty space past the level's edge. Pure.
 */
export function clampFraming(f, box, { yaw, elevation, aspect }) {
  const ax = axes(yaw);
  const squash = Math.sin(elevation);
  const { sx, sy } = toScreen(f, ax, squash);
  const halfW = f.width / 2;
  const halfH = f.width / aspect / 2;
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const cx = clamp(sx, box.minX + halfW, box.maxX - halfW);
  const cy = clamp(sy, box.minY + halfH, box.maxY - halfH);
  return { ...toGround(cx, cy, ax, squash), width: f.width };
}

/**
 * Where to look and how wide to be to fit `points` (ground {x, z}) on screen
 * with `padding` (screen units, i.e. tiles at the view plane) around them.
 * Pure, so it can be unit tested. Returns { x, z, width }.
 */
export function computeFraming(points, { yaw, elevation, aspect, minWidth, maxWidth, padding }) {
  const ax = axes(yaw);
  const squash = Math.sin(elevation); // ground depth is foreshortened on screen
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const { sx, sy } = toScreen(p, ax, squash);
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
  return { ...toGround(cx, cy, ax, squash), width };
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
  // The level's outline in screen space (see clampFraming).
  let box = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
  let aspect = 9 / 16;
  let viewWidth = K.baseViewWidth;
  // While aiming: the width at the press, and where the ball sat on screen
  // then, as a fraction of the view width from its centre.
  const aim = { width: K.baseViewWidth, fx: 0, fy: 0 };

  function applyFrustum() {
    const halfW = viewWidth / 2;
    const halfH = halfW / aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }

  function clampGoal() {
    Object.assign(goal, clampFraming(goal, box, { yaw, elevation, aspect }));
  }

  function place() {
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
    /** The level's ground rectangle; the view keeps inside its on-screen outline. */
    setBounds(minX, maxX, minZ, maxZ) {
      const ax = axes(yaw);
      const corners = [
        [minX, minZ],
        [maxX, minZ],
        [minX, maxZ],
        [maxX, maxZ],
      ].map(([x, z]) => toScreen({ x, z }, ax, Math.sin(elevation)));
      box = {
        minX: Math.min(...corners.map((c) => c.sx)),
        maxX: Math.max(...corners.map((c) => c.sx)),
        minY: Math.min(...corners.map((c) => c.sy)),
        maxY: Math.max(...corners.map((c) => c.sy)),
      };
    },
    /** Slide the view by (dx, dz) on the ground (a map drag), kept inside the level. */
    panBy(dx, dz) {
      Object.assign(goal, { x: target.x + dx, z: target.z + dz, width: viewWidth });
      clampGoal();
      target.x = goal.x;
      target.z = goal.z;
      place();
    },
    /** Jump straight to a ground point at the resting zoom. */
    snapTo(x, z) {
      Object.assign(goal, { x, z, width: K.baseViewWidth });
      clampGoal();
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
    /** `boost` multiplies the follow and zoom rates (the snappy return to your turn). */
    frame(points, minWidth, dt, boost = 1) {
      Object.assign(
        goal,
        computeFraming(points, { yaw, elevation, aspect, minWidth, maxWidth: K.maxFrameWidth, padding: K.framePadding }),
      );
      clampGoal();
      const k = 1 - Math.exp(-K.followRate * boost * dt);
      target.x += (goal.x - target.x) * k;
      target.z += (goal.z - target.z) * k;
      const rate = goal.width > viewWidth ? K.zoomOutRate : K.zoomInRate;
      viewWidth += (goal.width - viewWidth) * (1 - Math.exp(-rate * boost * dt));
      applyFrustum();
      place();
    },
    /** Start an aim drag: remember where `ball` sits on screen right now. */
    beginAim(ball) {
      const ax = axes(yaw);
      const squash = Math.sin(elevation);
      const b = toScreen(ball, ax, squash); // the ground point under the ball, where the ring is drawn
      const c = toScreen(target, ax, squash);
      // The view centre is the target, which sits at ball height: on screen it
      // is raised by y·cos(elevation) relative to its ground point.
      const cy = c.sy - target.y * Math.cos(elevation);
      Object.assign(aim, { width: viewWidth, fx: (b.sx - c.sx) / viewWidth, fy: (b.sy - cy) / viewWidth });
    },
    /** Width at the press, for scaling on-screen aim guides. */
    get aimStartWidth() {
      return aim.width;
    },
    /**
     * While aiming: ease toward `width`, zooming around the ball so it stays
     * at the same spot on screen (no panning, no level clamping).
     */
    aimZoom(ball, width, dt) {
      viewWidth += (width - viewWidth) * (1 - Math.exp(-K.aimZoomRate * dt));
      const ax = axes(yaw);
      const squash = Math.sin(elevation);
      const b = toScreen(ball, ax, squash);
      const c = toGround(b.sx - aim.fx * viewWidth, b.sy - aim.fy * viewWidth + target.y * Math.cos(elevation), ax, squash);
      target.x = c.x;
      target.z = c.z;
      Object.assign(goal, { x: c.x, z: c.z, width: viewWidth });
      applyFrustum();
      place();
    },
    /** The speed-based minimum width for a ball moving at `speed`. */
    /**
     * View width that keeps `center` in the middle of the screen and still
     * shows every point (with the usual padding), clamped to min..max.
     */
    widthAround(center, points, minWidth, maxWidth) {
      // Mirroring each point through the centre keeps the framing centred on it.
      const all = [center, ...points.flatMap((p) => [p, { x: 2 * center.x - p.x, z: 2 * center.z - p.z }])];
      return computeFraming(all, { yaw, elevation, aspect, minWidth, maxWidth, padding: K.framePadding }).width;
    },
    speedWidth(speed) {
      const t = Math.min(1, speed / CONFIG.aim.maxLaunchSpeed);
      return K.baseViewWidth + (K.maxViewWidth - K.baseViewWidth) * t;
    },
  };
}
