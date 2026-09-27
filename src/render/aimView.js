// Aim preview drawn on the ground plane in the 3D scene: a dashed path that
// ends where the shot would stop. The dash pattern encodes power, so there is
// no separate power ring. Small rings mark where the path bends.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const A = CONFIG.aim;
const Y = 0.02; // just above the floor
const MAX_DASHES = 400;
const MAX_BENDS = 4;

export function createAimView() {
  const group = new THREE.Group();
  group.visible = false;

  const material = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.aim,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  // Unit square lying flat, long along local +x; scaled per dash.
  const dashGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, material, MAX_DASHES);
  dashes.count = 0;
  dashes.frustumCulled = false;
  group.add(dashes);

  const bendRings = [];
  for (let i = 0; i < MAX_BENDS; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 24), material);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    bendRings.push(ring);
    group.add(ring);
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
    /** shot: from shotFromDrag; path: from previewPath, or null to show nothing (cancel). */
    show(shot, path) {
      group.visible = !!path;
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

      bendRings.forEach((ring, i) => {
        const p = i < path.bends ? path.points[i + 1] : null;
        ring.visible = !!p;
        if (p) ring.position.set(p.x, Y + 0.001, p.z);
      });
    },
  };
}
