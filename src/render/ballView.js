// A toon ball with an inverted-hull outline, a blob shadow, and a stripe so
// rolling reads visually (`silver` swaps the toon shading for polished
// chrome). It can flash red when hit. Given `toCamera`, it also
// wears a camera-facing face (the hero's expressions, see faces.js).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, silverMaterial, outlineHullMaterial, clearOccluder } from './materials.js';
import { heroFaces, faceSprite, faceLook, skullTexture } from './faces.js';

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
  const chrome = body.material;
  const baseColor = chrome.color.clone();
  // Knocked out (setSkull): the ball turns bone white.
  // Its face is painted on the ball (not the camera-facing sprite), so it
  // tumbles helplessly as the skull rolls.
  const bone = clearOccluder(toonMaterial(CONFIG.colors.skull, { map: skullTexture() }));
  const faceDir = new THREE.Vector3(0, 0, -1); // where skullTexture puts the face, in the body's frame
  const flashColor = new THREE.Color(CONFIG.colors.hitFlash);
  let flashLeft = 0;
  let flashLevel = 0;

  // Leaving by the exit (beamOut): a bit of magic. The ball is drawn up
  // into a soft golden glow, stretching and shrinking away, while a swirl
  // of sparkles spirals up around it. `root` holds the ball and the effect,
  // so the ball's own group can be scaled on its own.
  const root = new THREE.Group();
  root.add(group);
  const glowMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.exitBeam, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 1.2, 1, 24, 1, true).translate(0, 0.5, 0), glowMat);
  glow.visible = false;
  root.add(glow);
  const SPARKS = 16;
  const sparkMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.exitSpark, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparkGeo = new THREE.OctahedronGeometry(0.045);
  const sparks = Array.from({ length: SPARKS }, (_, i) => {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.userData = { a: (i / SPARKS) * Math.PI * 2, delay: (i % 4) * 0.08, speed: 0.8 + (i % 5) * 0.12 };
    m.visible = false;
    root.add(m);
    return m;
  });
  let beamT = -1; // seconds into the beam-out, or -1
  let fallT = -1; // seconds into a fall (pit or lava), or -1

  return {
    object: root,
    /** Start beaming out (the exit). It lasts CONFIG.render.exitBeamSeconds. */
    beamOut() {
      beamT = 0;
      glow.visible = true;
      for (const m of sparks) m.visible = true;
    },
    flash() {
      flashLeft = CONFIG.render.hitFlashSeconds;
    },
    /** Knocked out: a bone-white skull (on), or back to the ball's own look. */
    setSkull(on) {
      if ((body.material === bone) === on) return;
      body.material = on ? bone : chrome;
      if (face) face.visible = !on;
      group.scale.setScalar(on ? CONFIG.hero.skullScale : 1); // the skull is smaller
      // Start with the face turned to the camera, upright, so you see it
      // before it rolls away.
      if (on && toCamera) {
        q.setFromUnitVectors(faceDir, toCamera);
        body.quaternion.copy(q);
      }
    },
    /** Show an expression: 'confident', 'determined', 'worried', 'ouch' or 'dead'. */
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
        chrome.color.lerpColors(baseColor, flashColor, flashLevel);
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
      root.position.set(ball.x, 0, ball.z);
      if (fallT >= 0) {
        fallT += dt;
        const t = Math.min(1, fallT / CONFIG.render.fallSeconds);
        group.position.y = -t * t * 1.2;
        group.scale.setScalar(Math.max(0.001, (body.material === bone ? CONFIG.hero.skullScale : 1) * (1 - t * 0.6)));
        group.visible = t < 1;
      }
      if (beamT >= 0) {
        beamT += dt;
        const u = Math.min(1, beamT / CONFIG.render.exitBeamSeconds);
        const e = u * u; // eases in: slow to start, then gone
        group.scale.set(Math.max(0.001, 1 - e), 1 + 1.8 * e, Math.max(0.001, 1 - e));
        group.position.y = 0.6 * e; // drawn upward as it fades
        body.material.color.lerpColors(baseColor, new THREE.Color(CONFIG.colors.exitSpark), Math.min(1, u * 1.5));
        glow.scale.set(1, 0.3 + 2.2 * Math.min(1, u * 1.4), 1);
        glowMat.opacity = 0.55 * Math.sin(Math.PI * u);
        // Sparkles spiral up around the ball, twinkling in and out.
        sparkMat.opacity = Math.sin(Math.PI * u);
        for (const m of sparks) {
          const { a, delay, speed } = m.userData;
          const k = Math.max(0, beamT - delay) * speed;
          const ang = a + k * 7;
          const rad = r * (1.3 - 0.5 * Math.min(1, k));
          m.position.set(Math.cos(ang) * rad, r * 0.4 + k * 0.9, Math.sin(ang) * rad);
          m.rotation.set(k * 6, k * 9, 0);
        }
        group.visible = u < 1;
      }
    },
    /** Fell in a pit or lava: drop out of sight over CONFIG.render.fallSeconds. */
    fall() {
      fallT = 0;
    },
    /** Jump without rolling (respawn), and undo a beam-out. */
    snap() {
      fallT = -1;
      lastX = ball.x;
      lastZ = ball.z;
      root.position.set(ball.x, 0, ball.z);
      beamT = -1;
      glow.visible = false;
      glowMat.opacity = 0;
      for (const m of sparks) m.visible = false;
      group.scale.set(1, 1, 1);
      group.position.y = 0;
      group.visible = true;
      body.material.color.copy(baseColor);
    },
  };
}
