import * as THREE from 'three';
import { AIM, RENDER } from '../config.js';

// Power ring and dotted path preview, drawn on the ground plane in the 3D scene.
export function createAimVisuals(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const flat = (color, opacity) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

  // Ring geometry lies in XY; rotate onto the ground so geometry +y points to world -z (screen up).
  const track = new THREE.Mesh(new THREE.RingGeometry(AIM.ringInner, AIM.ringOuter, 64), flat(RENDER.colors.ringTrack, 0.12));
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.012;
  const innerEdge = new THREE.Mesh(
    new THREE.RingGeometry(AIM.ringInner - 0.02, AIM.ringInner, 64),
    flat(RENDER.colors.ringTrack, 0.45),
  );
  innerEdge.rotation.x = -Math.PI / 2;
  innerEdge.position.y = 0.013;
  const fillMat = flat(RENDER.colors.ringFill, 0.85);
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.014;
  const ring = new THREE.Group();
  ring.add(track, innerEdge, fill);
  group.add(ring);

  const maxDots = 120;
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.045, 12).rotateX(-Math.PI / 2), flat(RENDER.colors.preview, 0.9), maxDots);
  dots.count = 0;
  dots.position.y = 0.016;
  dots.frustumCulled = false;
  group.add(dots);

  const bendRing = new THREE.Mesh(
    new THREE.RingGeometry(AIM.previewBendRingRadius - 0.03, AIM.previewBendRingRadius, 32).rotateX(-Math.PI / 2),
    flat(RENDER.colors.preview, 0.9),
  );
  bendRing.position.y = 0.016;
  group.add(bendRing);

  let lastFill = -1;
  const m = new THREE.Matrix4();

  return {
    hide() {
      group.visible = false;
    },
    // state: { hero, fill (0..1), cancelled, path: { points, bend } | null }
    update({ hero, fill: amount, cancelled, path }) {
      group.visible = true;
      ring.position.set(hero.x, 0, hero.z);

      const shown = cancelled ? 0 : amount;
      if (shown !== lastFill) {
        lastFill = shown;
        fill.geometry.dispose();
        // Clockwise from the top: start at 90° and sweep negative.
        const sweep = Math.max(shown, 1e-4) * Math.PI * 2;
        fill.geometry = new THREE.RingGeometry(AIM.ringInner, AIM.ringOuter, 64, 1, Math.PI / 2 - sweep, sweep);
      }
      fill.visible = shown > 0;
      innerEdge.material.color.set(cancelled ? RENDER.colors.ringCancel : RENDER.colors.ringTrack);

      dots.count = 0;
      bendRing.visible = false;
      if (!path || cancelled) return;
      // Place dots at even arc-length spacing along the simulated path.
      let carry = AIM.previewDotSpacing;
      const pts = path.points;
      for (let i = 1; i < pts.length && dots.count < maxDots; i++) {
        const ax = pts[i - 1].x, az = pts[i - 1].z;
        const sx = pts[i].x - ax, sz = pts[i].z - az;
        const len = Math.hypot(sx, sz);
        let t = carry;
        while (t <= len && dots.count < maxDots) {
          m.makeTranslation(ax + (sx * t) / len, 0, az + (sz * t) / len);
          dots.setMatrixAt(dots.count++, m);
          t += AIM.previewDotSpacing;
        }
        carry = t - len;
      }
      dots.instanceMatrix.needsUpdate = true;
      if (path.bend) {
        bendRing.visible = true;
        bendRing.position.x = path.bend.x;
        bendRing.position.z = path.bend.z;
      }
    },
  };
}
