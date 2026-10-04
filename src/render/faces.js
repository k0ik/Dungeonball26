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

/** Enemy turn: worried: brows pinched up in the middle, wide eyes, a wobbly mouth, a bead of sweat. */
const worriedFace = () =>
  faceTexture('worried', (g) => {
    for (const x of [46, 82]) {
      g.beginPath();
      g.ellipse(x, 56, 7, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(33, 40);
    g.lineTo(56, 31); // inner ends raised: the opposite of the angry slant
    g.moveTo(95, 40);
    g.lineTo(72, 31);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(46, 94);
    g.bezierCurveTo(52, 86, 58, 86, 64, 92);
    g.bezierCurveTo(70, 98, 76, 98, 82, 90);
    g.stroke();
    // Sweat drop at the temple.
    g.fillStyle = '#6ec6ff';
    g.beginPath();
    g.moveTo(106, 30);
    g.quadraticCurveTo(114, 44, 106, 48);
    g.quadraticCurveTo(98, 44, 106, 30);
    g.fill();
  });

/** Knocked out: a skull: XX eyes, a grin of teeth. */
function drawDead(g) {
    g.lineWidth = 7;
    g.beginPath();
    for (const x of [46, 82]) {
      g.moveTo(x - 9, 45);
      g.lineTo(x + 9, 63);
      g.moveTo(x + 9, 45);
      g.lineTo(x - 9, 63);
    }
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(42, 88);
    g.lineTo(86, 88); // the jaw line
    for (const x of [51, 60, 69, 78]) {
      g.moveTo(x, 81);
      g.lineTo(x, 95); // teeth
    }
    g.stroke();
}
const deadFace = () => faceTexture('dead', drawDead);

let skullTex = null;
/**
 * The skull's face painted onto the ball itself (an equirectangular map for
 * a SphereGeometry), so it rolls and tumbles with the body instead of
 * turning to the camera: helpless, not in control. The face sits on the
 * sphere's local -z side (u = 0.75, on the equator), covering about 90°.
 */
export function skullTexture() {
  if (skullTex) return skullTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff'; // white: the material's colour tints it bone
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = g.strokeStyle = `#${CONFIG.colors.enemyFace.toString(16).padStart(6, '0')}`;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // The 128-unit face drawing, centred at u = 0.75 and enlarged so it fills
  // most of the side of the ball facing you.
  g.translate(384, 128);
  g.scale(1.7, 1.7);
  g.translate(-64, -64);
  drawDead(g);
  skullTex = new THREE.CanvasTexture(canvas);
  skullTex.colorSpace = THREE.SRGBColorSpace;
  return skullTex;
}

export const heroFaces = { confident: confidentFace, determined: determinedFace, ouch: ouchFace, worried: worriedFace, dead: deadFace };

/** A camera-facing face sprite for a ball of radius `r`. */
export function faceSprite(texture, r, toCamera) {
  // alphaTest: the sprite's empty corners must not write depth, or a wall
  // drawn after it (walls are in the transparent pass, for the see-through
  // zone) is cut away there, leaving a dark square corner behind the ball.
  const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.1 }));
  face.scale.setScalar(r * 1.7);
  // On the sphere's tangent plane facing the camera, so the sphere never cuts it.
  face.position.set(0, r, 0).addScaledVector(toCamera, r * 1.02);
  return face;
}

/**
 * Slide a face sprite (from faceSprite) toward where its ball looks:
 * returns update(look, dt), with `look` from src/look.js ({ x, z, amount } on
 * the ground, { sx, sy, amount } on screen, or null for front and centre).
 * The face moves within the plane facing the camera, so it stays in front of
 * the sphere, glides there, narrows a little along the look as if turning,
 * and goes no further than CONFIG.look.offset of the radius, so it never
 * leaves the ball's outline.
 */
export function faceLook(face, r, toCamera) {
  const L = CONFIG.look;
  const base = face.position.clone();
  const size = face.scale.x;
  const forward = toCamera.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  let cx = 0;
  let cy = 0;
  return (look, dt) => {
    let tx = 0;
    let ty = 0;
    if (look) {
      // A ground direction shows on screen along the isometric projection.
      const sx = look.sx ?? look.x * right.x + look.z * right.z;
      const sy = look.sy ?? look.x * up.x + look.z * up.z;
      const len = Math.hypot(sx, sy);
      if (len > 1e-6) {
        tx = (sx / len) * look.amount;
        ty = (sy / len) * look.amount;
      }
    }
    const k = dt > 0 ? 1 - Math.exp(-dt / L.ease) : 0;
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
    face.position.copy(base).addScaledVector(right, cx * L.offset * r).addScaledVector(up, cy * L.offset * r);
    face.scale.set(size * (1 - L.squash * Math.abs(cx)), size * (1 - L.squash * Math.abs(cy)), 1);
  };
}
