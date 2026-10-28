// Dashed, slowly turning ring on the floor around a ball, marking whose turn
// it is: green around the hero while you can shoot, red around the enemy
// that's about to move (and while it moves).

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const A = CONFIG.aim;
const Y = 0.02; // just above the floor

export function createTurnRing(color, spin = A.turnRingSpin) {
  const ring = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: A.turnRingOpacity, depthWrite: false });
  const slot = (Math.PI * 2) / A.turnRingDashes;
  for (let i = 0; i < A.turnRingDashes; i++) {
    const geo = new THREE.RingGeometry(
      A.cancelRadius - A.turnRingWidth / 2,
      A.cancelRadius + A.turnRingWidth / 2,
      8,
      1,
      i * slot,
      slot * A.turnRingDashFill,
    ).rotateX(-Math.PI / 2);
    ring.add(new THREE.Mesh(geo, material));
  }
  ring.position.y = Y;
  ring.visible = false;

  return {
    object: ring,
    /** Show it around `ball`, turning a little each frame. */
    show(ball, dt) {
      ring.visible = true;
      ring.position.x = ball.x;
      ring.position.z = ball.z;
      ring.rotation.y -= spin * dt;
    },
    hide() {
      ring.visible = false;
    },
  };
}
