import * as THREE from 'three';
import { CAMERA, RENDER } from '../config.js';

// Fixed-angle orthographic camera looking up the level (toward -z).
// M0/M1: centered on the level. Deadzone follow and dynamic zoom arrive in M2.
export function createCamera() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA.distance * 2);
  const elev = THREE.MathUtils.degToRad(CAMERA.elevationDeg);
  camera.userData.offset = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev)).multiplyScalar(CAMERA.distance);
  return camera;
}

export function frameLevel(camera, level, aspect) {
  const elev = THREE.MathUtils.degToRad(CAMERA.elevationDeg);
  // How tall the level appears on screen, in tiles, after foreshortening.
  const projectedDepth = level.height * Math.sin(elev) + RENDER.wallHeight * Math.cos(elev);
  let halfW = Math.max(CAMERA.baseViewWidth, level.width + CAMERA.margin * 2) / 2;
  let halfH = halfW / aspect;
  const needH = projectedDepth / 2 + CAMERA.margin;
  if (halfH < needH) {
    halfH = needH;
    halfW = halfH * aspect;
  }
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();

  const target = new THREE.Vector3(level.width / 2, 0, level.height / 2);
  camera.position.copy(target).add(camera.userData.offset);
  camera.lookAt(target);
}
