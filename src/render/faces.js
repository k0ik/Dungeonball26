// Face textures for the balls: drawn once on a 128px canvas and cached. The
// face is a camera-facing sprite set just in front of its sphere, so it always
// looks at you whichever way the ball rolls.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const cache = {};

function faceTexture(name, draw) {
  if (cache[name]) return cache[name];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = g.strokeStyle = `#${CONFIG.colors.enemyFace.toString(16).padStart(6, '0')}`;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (cache[name] = tex);
}

// --- Enemies ---------------------------------------------------------------

/** Unaware: the mockup's calm, slightly dumb face: tall oval eyes, a wobbly mouth. */
export const calmFace = () =>
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
export const angryFace = () =>
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

// --- Hero ------------------------------------------------------------------

/** At rest: confident: one brow cocked, one eye a little narrowed, a lopsided smirk. */
const confidentFace = () =>
  faceTexture('confident', (g) => {
    g.beginPath();
    g.ellipse(46, 54, 7, 11, 0, 0, Math.PI * 2);
    g.fill();
    // Right eye with a lowered, flat lid.
    g.beginPath();
    g.ellipse(82, 54, 7, 11, 0, 0, Math.PI * 2);
    g.save();
    g.clip();
    g.fillRect(70, 50, 24, 20);
    g.restore();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(36, 36);
    g.quadraticCurveTo(46, 26, 56, 34); // raised, arched brow
    g.moveTo(72, 40);
    g.lineTo(92, 40); // level brow
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(44, 84);
    g.quadraticCurveTo(70, 100, 92, 76); // smirk, higher on the right
    g.stroke();
  });

/** Aiming and on the move: determined: brows down, eyes narrowed, lips set. */
const determinedFace = () =>
  faceTexture('determined', (g) => {
    for (const x of [46, 82]) {
      g.beginPath();
      g.ellipse(x, 52, 8, 11, 0, 0, Math.PI); // lower half: a flat, focused lid
      g.fill();
    }
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(32, 36);
    g.lineTo(57, 45);
    g.moveTo(96, 36);
    g.lineTo(71, 45);
    g.stroke();
    g.beginPath();
    g.moveTo(48, 90);
    g.lineTo(82, 87);
    g.stroke();
  });

/** Hit: ouch: eyes squeezed shut, mouth open in a yelp. */
const ouchFace = () =>
  faceTexture('ouch', (g) => {
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(35, 40);
    g.lineTo(54, 51);
    g.lineTo(35, 62);
    g.moveTo(93, 40);
    g.lineTo(74, 51);
    g.lineTo(93, 62);
    g.stroke();
    g.beginPath();
    g.ellipse(64, 91, 11, 13, 0, 0, Math.PI * 2);
    g.fill();
  });

export const heroFaces = { confident: confidentFace, determined: determinedFace, ouch: ouchFace };

/** A camera-facing face sprite for a ball of radius `r`. */
export function faceSprite(texture, r, toCamera) {
  const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  face.scale.setScalar(r * 1.7);
  // On the sphere's tangent plane facing the camera, so the sphere never cuts it.
  face.position.set(0, r, 0).addScaledVector(toCamera, r * 1.02);
  return face;
}
