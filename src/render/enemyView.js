// Enemy ball: a magenta toon sphere with an outline and a face that always
// looks at the camera, like the mockup. Enemies don't show rolling; the face
// is a camera-facing sprite set just in front of the sphere.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial } from './materials.js';

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.shadow,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

let faceTexture = null;

/** The mockup's calm face: two tall oval eyes and a slightly worried mouth. */
function calmFace() {
  if (faceTexture) return faceTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = g.strokeStyle = `#${CONFIG.colors.enemyFace.toString(16).padStart(6, '0')}`;
  for (const x of [46, 80]) {
    g.beginPath();
    g.ellipse(x, 50, 7, 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(42, 90);
  g.quadraticCurveTo(66, 78, 88, 96);
  g.stroke();
  faceTexture = new THREE.CanvasTexture(canvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  return faceTexture;
}

export function createEnemyView(ball, toCamera) {
  const r = ball.radius;
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), toonMaterial(CONFIG.colors.enemy));
  body.position.y = r;
  const outline = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), outlineHullMaterial);
  outline.scale.setScalar(CONFIG.render.outlineScale);
  outline.position.y = r;

  const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: calmFace(), transparent: true }));
  face.scale.setScalar(r * 1.7);
  // On the sphere's tangent plane facing the camera, so the sphere never cuts it.
  face.position.set(0, r, 0).addScaledVector(toCamera, r * 1.02);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 24), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;

  group.add(shadow, outline, body, face);

  let dying = -1;

  return {
    object: group,
    update(dt) {
      group.position.set(ball.x, 0, ball.z);
      if (dying >= 0) {
        // Pop: a quick swell, then shrink away.
        dying += dt;
        const t = dying / 0.25;
        const s = t < 0.3 ? 1 + t : Math.max(0, 1.3 * (1 - (t - 0.3) / 0.7));
        group.scale.setScalar(s);
        if (t >= 1) group.visible = false;
      }
    },
    die() {
      if (dying < 0) dying = 0;
    },
    get gone() {
      return dying >= 0.25;
    },
    dispose() {
      body.geometry.dispose();
      body.material.dispose();
      outline.geometry.dispose();
      face.material.dispose();
    },
  };
}
