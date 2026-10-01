// Enemy ball: a magenta toon sphere with an outline and a face that always
// looks at the camera, like the mockup. Enemies don't show rolling; the face
// is a camera-facing sprite set just in front of the sphere. It's calm while
// the enemy can't see the hero and turns angry while it can.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial, clearOccluder } from './materials.js';
import { calmFace, angryFace, faceSprite } from './faces.js';

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.shadow,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

export function createEnemyView(ball, toCamera) {
  const r = ball.radius;
  const group = new THREE.Group();

  const color = (ball.type && CONFIG.enemy.types[ball.type].color) ?? CONFIG.colors.enemy;
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), clearOccluder(toonMaterial(color)));
  body.position.y = r;
  const outline = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), outlineHullMaterial);
  outline.scale.setScalar(CONFIG.render.outlineScale);
  outline.position.y = r;

  // A bomb has no face: it's a thing, not a creature (it never attacks).
  const face = ball.type === 'bomb' || ball.type === 'gold' ? null : faceSprite(calmFace(), r, toCamera);
  let angry = false;

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 24), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;

  group.add(shadow, outline, body);
  if (face) group.add(face);

  // A bomb has a fuse on top (its shape cue, not just its colour). Once lit
  // the body turns red and a spark flickers at the fuse's tip; the fuse
  // burns shorter with each step, so the countdown reads without colour.
  let spark = null;
  let fuse = null;
  const FUSE_LEN = 0.22;
  if (ball.type === 'bomb') {
    fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, FUSE_LEN, 8).translate(0, FUSE_LEN / 2, 0), toonMaterial(0xc9b48a));
    fuse.position.set(0, r * 2 - 0.05, 0);
    fuse.rotation.z = -0.35;
    spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    spark.visible = false;
    fuse.add(spark);
    group.add(fuse);
  }
  let sparkT = 0;
  let ghostOpacity = ball.phased ? CONFIG.enemy.types.ghost.fadedOpacity : 1;

  let dying = -1;

  return {
    object: group,
    update(dt) {
      group.position.set(ball.x, 0, ball.z);
      if (ball.type === 'gold' && dying < 0) {
        // It shrinks as it wears down (its physics radius shrinks with it).
        const s = group.scale.x + (ball.radius / r - group.scale.x) * Math.min(1, dt * 6);
        group.scale.setScalar(s);
      }
      if (ball.type === 'ghost') {
        // Faded: see-through (its face too); solid otherwise. Eases between.
        const target = ball.phased ? CONFIG.enemy.types.ghost.fadedOpacity : 1;
        ghostOpacity += (target - ghostOpacity) * Math.min(1, dt * 8);
        const see = ghostOpacity < 0.99;
        for (const m of [body.material, face?.material]) {
          if (!m) continue;
          if (m.transparent !== see) {
            m.transparent = see;
            m.depthWrite = !see;
            m.needsUpdate = true; // switching to see-through needs a recompile
          }
          m.opacity = ghostOpacity;
        }
        // The black outline is a shell behind the ball: through a see-through
        // body it would read as a dark blob, so it goes while faded.
        outline.visible = !see;
      }
      if (ball.type === 'jekyll' && dying < 0) {
        // Enraged (or mid-attack): dark plum and swollen; calm: sage green.
        const J = CONFIG.enemy.types.jekyll;
        const hyde = angry;
        body.material.color.setHex(hyde ? J.enragedColor : color);
        const s = group.scale.x + ((hyde ? J.enragedScale : 1) - group.scale.x) * Math.min(1, dt * 10);
        group.scale.setScalar(s);
      }
      if (spark) {
        const lit = ball.fuse != null;
        spark.visible = lit;
        sparkT += dt;
        spark.scale.setScalar(1 + 0.35 * Math.sin(sparkT * 18)); // a steady flicker, not a flash
        // Full length until lit, shorter once lit, a stub once armed (it goes off as your shot stops).
        fuse.scale.y = !lit ? 1 : ball.fuse > 0 ? 0.6 : 0.3;
        spark.position.set(0, FUSE_LEN, 0);
        spark.scale.y /= fuse.scale.y; // keep the spark round on the squashed fuse
        body.material.color.setHex(lit ? CONFIG.enemy.types.bomb.litColor : color);
      }
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
      if (on === angry || !face) return;
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
      face?.material.dispose();
    },
  };
}
