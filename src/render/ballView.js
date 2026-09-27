// A toon ball with an inverted-hull outline, a blob shadow, and a stripe so
// rolling reads visually.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial } from './materials.js';

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.shadow,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

function stripedSphere(radius, base, stripe) {
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const pos = geo.attributes.position;
  const colors = [];
  const a = new THREE.Color(base);
  const b = new THREE.Color(stripe);
  for (let i = 0; i < pos.count; i++) {
    const c = Math.abs(pos.getY(i)) < radius * 0.35 ? b : a;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

export function createBallView(ball, { color, stripe }) {
  const r = ball.radius;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    stripe != null ? stripedSphere(r, color, stripe) : new THREE.SphereGeometry(r, 32, 20),
    toonMaterial(stripe != null ? 0xffffff : color, { vertexColors: stripe != null }),
  );
  body.position.y = r;
  // Tilt the stripe so it doesn't start edge-on to the camera.
  body.rotation.set(0.6, 0, 0.4);
  const outline = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), outlineHullMaterial);
  outline.scale.setScalar(CONFIG.render.outlineScale);
  outline.position.y = r;

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 24), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;

  group.add(shadow, outline, body);

  const axis = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let lastX = ball.x;
  let lastZ = ball.z;

  return {
    object: group,
    /** Sync to the simulation and roll by the distance moved since last frame. */
    update() {
      const dx = ball.x - lastX;
      const dz = ball.z - lastZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-6) {
        // Rolling axis is up × motion.
        axis.set(dz, 0, -dx).divideScalar(dist);
        q.setFromAxisAngle(axis, dist / r);
        body.quaternion.premultiply(q);
      }
      lastX = ball.x;
      lastZ = ball.z;
      group.position.set(ball.x, 0, ball.z);
    },
    /** Jump without rolling (respawn). */
    snap() {
      lastX = ball.x;
      lastZ = ball.z;
      group.position.set(ball.x, 0, ball.z);
    },
  };
}
