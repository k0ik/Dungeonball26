// Aim preview drawn on the ground plane in the 3D scene: a dashed path that
// ends where the shot would stop. The dash pattern encodes power, so there is
// no power ring. While aiming, a faint circle and a small "x" just below the ball mark
// the cancel zone. Small hoops mark each bounce and where the path ends,
// whether the ball comes to rest there or hits something.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const A = CONFIG.aim;
const Y = 0.02; // just above the floor
const MAX_DASHES = 400;
const MAX_HOOPS = 6;

export function createAimView(yaw = 0) {
  const group = new THREE.Group();
  group.visible = false;

  const material = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.aim,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  // The dashed path and its bend rings; hidden in the cancel zone.
  const pathGroup = new THREE.Group();
  group.add(pathGroup);

  // Unit square lying flat, long along local +x; scaled per dash.
  const dashGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, material, MAX_DASHES);
  dashes.count = 0;
  dashes.frustumCulled = false;
  pathGroup.add(dashes);

  // Cancel marker: a thin circle at the cancel radius plus an "x" under the
  // ball, turned with the camera so the "x" stays upright on screen.
  const cancelMat = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.aim,
    transparent: true,
    opacity: A.cancelOpacity,
    depthWrite: false,
  });
  const cancelMark = new THREE.Group();
  cancelMark.rotation.y = yaw;
  cancelMark.position.y = Y;
  cancelMark.add(
    new THREE.Mesh(
      new THREE.RingGeometry(A.cancelRadius - A.ringWidth / 2, A.cancelRadius + A.ringWidth / 2, 72).rotateX(-Math.PI / 2),
      cancelMat,
    ),
  );
  // Centre the "x" on screen between the ball's lower edge and the near side
  // of the circle. The ball's silhouette bottom sits r(1 - cos e) below its
  // ground point on screen, which is that / sin e along the ground toward the camera.
  const elev = THREE.MathUtils.degToRad(CONFIG.camera.elevationDeg);
  const r = CONFIG.ball.diameter / 2;
  const ballEdge = (r * (1 - Math.cos(elev))) / Math.sin(elev);
  const xOffset = (ballEdge + A.cancelRadius) / 2; // local +z points toward the camera
  // Stretch along the view direction to undo the tilt's foreshortening, so
  // the "x" reads upright on screen instead of squashed.
  const xMark = new THREE.Group();
  xMark.position.z = xOffset;
  xMark.scale.z = 1 / Math.sin(elev);
  cancelMark.add(xMark);
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(
      new THREE.PlaneGeometry(A.cancelXHalfLength * 2, A.cancelXWidth).rotateX(-Math.PI / 2),
      cancelMat,
    );
    arm.rotation.y = angle;
    xMark.add(arm);
  }
  group.add(cancelMark);

  const hoops = [];
  for (let i = 0; i < MAX_HOOPS; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 24), material);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    hoops.push(ring);
    pathGroup.add(ring);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function addDash(n, ax, az, ux, uz, from, to) {
    const len = to - from;
    const mid = (from + to) / 2;
    pos.set(ax + ux * mid, Y, az + uz * mid);
    q.setFromAxisAngle(up, Math.atan2(-uz, ux));
    scale.set(len, 1, A.dashWidth);
    m.compose(pos, q, scale);
    dashes.setMatrixAt(n, m);
  }

  return {
    object: group,
    hide() {
      group.visible = false;
    },
    /** shot: from shotFromDrag; path: from previewPath, or null to hide the path (cancel). */
    show(hero, shot, path) {
      group.visible = true;
      cancelMark.position.x = hero.x;
      cancelMark.position.z = hero.z;
      cancelMat.opacity = shot.cancel ? A.cancelActiveOpacity : A.cancelOpacity;
      pathGroup.visible = !!path;
      if (!path) return;

      const dash = A.dashMin + (A.dashMax - A.dashMin) * shot.fill;
      const gap = A.gapMax + (A.gapMin - A.gapMax) * shot.fill;
      const period = dash + gap;

      // Walk the polyline, laying dashes by distance travelled so the pattern
      // flows continuously through bends.
      let n = 0;
      let travelled = 0;
      const skip = CONFIG.ball.diameter / 2 + 0.08; // start just outside the ball
      for (let s = 0; s + 1 < path.points.length && n < MAX_DASHES; s++) {
        const a = path.points[s];
        const b = path.points[s + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1e-6) continue;
        const ux = (b.x - a.x) / len;
        const uz = (b.z - a.z) / len;
        // First dash start at or after the segment start, on the global pattern.
        let start = Math.floor((travelled - skip) / period) * period + skip;
        for (; start < travelled + len && n < MAX_DASHES; start += period) {
          const from = Math.max(start, travelled, skip);
          const to = Math.min(start + dash, travelled + len);
          if (to > from) addDash(n++, a.x, a.z, ux, uz, from - travelled, to - travelled);
        }
        travelled += len;
      }
      dashes.count = n;
      dashes.instanceMatrix.needsUpdate = true;

      // Every point after the start: each bounce, then the end of the path.
      hoops.forEach((ring, i) => {
        const p = path.points[i + 1] ?? null;
        ring.visible = !!p;
        if (p) ring.position.set(p.x, Y + 0.001, p.z);
      });
    },
  };
}
