// A toon ball with an inverted-hull outline, a blob shadow, and a stripe so
// rolling reads visually (`silver` swaps the toon shading for polished
// chrome). It can flash red when hit. Given `toCamera`, it also
// wears a camera-facing face (the hero's expressions, see faces.js).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, silverMaterial, outlineHullMaterial, clearOccluder } from './materials.js';
import { heroFaces, faceSprite, faceLook } from './faces.js';

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

export function createBallView(ball, { color, stripe, silver = false, toCamera = null }) {
  const r = ball.radius;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    stripe != null ? stripedSphere(r, color, stripe) : new THREE.SphereGeometry(r, 32, 20),
    // A ball hides pickups behind it for real: it clears the x-ray mask.
    clearOccluder((silver ? silverMaterial : toonMaterial)(stripe != null ? 0xffffff : color, { vertexColors: stripe != null })),
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

  // The face doesn't roll with the body: it always looks at the camera.
  const face = toCamera ? faceSprite(heroFaces.confident(), r, toCamera) : null;
  if (face) group.add(face);
  const lookFace = face ? faceLook(face, r, toCamera) : null; // slides toward ball.look (src/look.js)
  let expression = 'confident';

  const axis = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let lastX = ball.x;
  let lastZ = ball.z;

  // Hit flash: tint the ball red, fading back over hitFlashSeconds. The
  // material colour multiplies the ball's own colours, so red turns the white
  // body red (an emissive glow on top of white only reads as pale pink).
  const baseColor = body.material.color.clone();
  const flashColor = new THREE.Color(CONFIG.colors.hitFlash);
  let flashLeft = 0;
  let flashLevel = 0;

  return {
    object: group,
    flash() {
      flashLeft = CONFIG.render.hitFlashSeconds;
    },
    /** Show an expression: 'confident', 'determined', 'worried' or 'ouch'. */
    setExpression(name) {
      if (!face || name === expression) return;
      expression = name;
      face.material.map = heroFaces[name]();
      face.material.needsUpdate = true;
    },
    get expression() {
      return expression;
    },
    /** Current flash strength, 0..1 (for debugging and tests). */
    get flashLevel() {
      return flashLevel;
    },
    /** Sync to the simulation and roll by the distance moved since last frame. */
    update(dt = 0) {
      lookFace?.(ball.look, dt);
      if (flashLeft > 0 || flashLevel > 0) {
        flashLeft = Math.max(0, flashLeft - dt);
        flashLevel = flashLeft / CONFIG.render.hitFlashSeconds;
        body.material.color.lerpColors(baseColor, flashColor, flashLevel);
      }
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
