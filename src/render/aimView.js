// Aim visuals drawn on the ground plane in the 3D scene: the power ring and the
// dotted path preview with a small ring at the bend.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const A = CONFIG.aim;
const Y = 0.02; // just above the floor
const MAX_DOTS = 256;

function flat(mesh) {
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = Y;
  return mesh;
}

export function createAimView(yaw = 0) {
  const group = new THREE.Group();
  group.visible = false;

  const trackMat = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.ringTrack,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const fillMat = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.ringFill,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const dotMat = new THREE.MeshBasicMaterial({
    color: CONFIG.colors.aim,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const track = flat(new THREE.Mesh(new THREE.RingGeometry(A.ringInner, A.ringOuter, 64), trackMat));
  const fill = flat(new THREE.Mesh(new THREE.BufferGeometry(), fillMat));
  const bendRing = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 24), dotMat);
  bendRing.rotation.x = -Math.PI / 2;

  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(A.previewDotRadius, 12), dotMat, MAX_DOTS);
  dots.count = 0;
  dots.frustumCulled = false;

  const ringGroup = new THREE.Group();
  ringGroup.add(track, fill);
  // Turn the ring with the camera so it still fills from the top of the screen.
  ringGroup.rotation.y = yaw;
  group.add(ringGroup, dots, bendRing);

  let lastFill = -1;
  const m = new THREE.Matrix4();
  const flatRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();

  function setFill(f) {
    if (Math.abs(f - lastFill) < 0.002) return;
    lastFill = f;
    fill.geometry.dispose();
    // Fills clockwise from the top of the screen. The ring's local +y maps to
    // world -z, which ringGroup's yaw turns to screen up.
    const len = Math.max(f, 0.0001) * Math.PI * 2;
    fill.geometry = new THREE.RingGeometry(A.ringInner, A.ringOuter, 64, 1, Math.PI / 2 - len, len);
    fill.visible = f > 0;
  }

  return {
    object: group,
    hide() {
      group.visible = false;
    },
    /** shot: from shotFromDrag; path: from previewPath (or null when cancelled). */
    show(hero, shot, path) {
      group.visible = true;
      ringGroup.position.set(hero.x, 0, hero.z);
      setFill(shot.cancel ? 0 : shot.fill);

      let n = 0;
      bendRing.visible = false;
      if (path) {
        let carry = CONFIG.ball.diameter / 2 + 0.1; // start just outside the ball
        for (let s = 0; s + 1 < path.points.length; s++) {
          const a = path.points[s];
          const b = path.points[s + 1];
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          let t = carry;
          for (; t <= len && n < MAX_DOTS; t += A.previewDotSpacing) {
            p.set(a.x + ((b.x - a.x) * t) / len, Y, a.z + ((b.z - a.z) * t) / len);
            m.compose(p, flatRot, one);
            dots.setMatrixAt(n++, m);
          }
          carry = t - len;
        }
        if (path.bend) {
          bendRing.visible = true;
          bendRing.position.set(path.points[1].x, Y + 0.001, path.points[1].z);
        }
      }
      dots.count = n;
      dots.instanceMatrix.needsUpdate = true;
    },
  };
}
