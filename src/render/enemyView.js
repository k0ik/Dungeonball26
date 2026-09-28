// Enemy ball: a magenta toon sphere with an outline and a face that always
// looks at the camera, like the mockup. Enemies don't show rolling; the face
// is a camera-facing sprite set just in front of the sphere. It's calm while
// the enemy can't see the hero and turns angry while it can.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial } from './materials.js';

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.shadow,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

const faces = {};

/** Draw a 128px face texture once and cache it. */
function faceTexture(name, draw) {
  if (faces[name]) return faces[name];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = g.strokeStyle = `#${CONFIG.colors.enemyFace.toString(16).padStart(6, '0')}`;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (faces[name] = tex);
}

/** Unaware: the mockup's calm, slightly dumb face: tall oval eyes, a wobbly mouth. */
const calmFace = () =>
  faceTexture('calm', (g) => {
    for (const x of [46, 80]) {
      g.beginPath();
      g.ellipse(x, 50, 7, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(42, 90);
    g.quadraticCurveTo(66, 78, 88, 96);
    g.stroke();
  });

/** Sees you: the mockup's angry face: slanted eyes under hard brows, a bared grimace. */
const angryFace = () =>
  faceTexture('angry', (g) => {
    for (const [x, tilt] of [
      [45, 0.55],
      [83, -0.55],
    ]) {
      g.beginPath();
      g.ellipse(x, 56, 8, 11, tilt, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(30, 34);
    g.lineTo(56, 46);
    g.moveTo(98, 34);
    g.lineTo(72, 46);
    g.stroke();
    // Open, snarling mouth: flat top, rounded bottom.
    g.beginPath();
    g.moveTo(40, 84);
    g.lineTo(90, 80);
    g.quadraticCurveTo(70, 112, 44, 96);
    g.closePath();
    g.fill();
  });

export function createEnemyView(ball, toCamera) {
  const r = ball.radius;
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), toonMaterial(CONFIG.colors.enemy));
  body.position.y = r;
  const outline = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), outlineHullMaterial);
  outline.scale.setScalar(CONFIG.render.outlineScale);
  outline.position.y = r;

  const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: calmFace(), transparent: true }));
  let angry = false;
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
    /** Angry while it can see the hero, calm (and a bit dumb) otherwise. */
    setAngry(on) {
      if (on === angry) return;
      angry = on;
      face.material.map = on ? angryFace() : calmFace();
      face.material.needsUpdate = true;
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
