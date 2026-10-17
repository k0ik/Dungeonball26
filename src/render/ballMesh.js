import * as THREE from 'three';
import { toon, outlineMaterial } from './materials.js';

// A pool-style ball: solid color with a white stripe, so rolling is visible.
export function buildBallMesh(radius, color, stripeColor) {
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(color);
  const stripe = new THREE.Color(stripeColor);
  for (let i = 0; i < pos.count; i++) {
    const c = Math.abs(pos.getY(i)) < radius * 0.35 ? stripe : base;
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
  body.rotation.x = Math.PI / 2; // start with the stripe facing the camera
  group.add(body, new THREE.Mesh(geo, outlineMaterial));
  group.userData.body = body;
  group.position.y = radius;
  return group;
}

const axis = new THREE.Vector3();
const q = new THREE.Quaternion();

// Sync a mesh to its physics ball, rolling it by the distance travelled.
export function syncBallMesh(mesh, ball, prevX, prevZ) {
  const dx = ball.x - prevX;
  const dz = ball.z - prevZ;
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-6) {
    axis.set(dz, 0, -dx).normalize();
    q.setFromAxisAngle(axis, dist / ball.radius);
    mesh.userData.body.quaternion.premultiply(q);
  }
  mesh.position.x = ball.x;
  mesh.position.z = ball.z;
}
