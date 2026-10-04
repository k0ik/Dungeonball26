// Barrels, red barrels and chests (static bumpers), plus the red barrel's
// blast. Procedural toon primitives with outlines, coloured like the mockup.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial, outlineLineMaterial } from './materials.js';
import { barrelTexture, chestTexture } from './textures.js';

const C = CONFIG.colors;
const O = CONFIG.objects;
const BARREL_HEIGHT = 0.62;
const CHEST_HEIGHT = 0.4;
const LID_HEIGHT = 0.2;

// Barrel look per crack stage: a barrel breaks on its second hit, so the one
// cracked stage is darker, shorter, faceted (few flat-shaded sides) and
// leaning, so damage reads at a glance.
const BARREL_STAGES = [
  { sides: 20, height: BARREL_HEIGHT, shade: 1, flat: false, lean: 0 },
  { sides: 7, height: BARREL_HEIGHT * 0.8, shade: 0.52, flat: true, lean: 0.14 },
];

function barrelGeometry(stage) {
  const { sides, height } = BARREL_STAGES[stage];
  return new THREE.CylinderGeometry(O.barrelRadius, O.barrelRadius * 0.9, height, sides);
}

function barrelMesh(side, top) {
  const group = new THREE.Group();
  const geo = barrelGeometry(0);
  // Staves and iron hoops round the side, planks on the lid (textures.js).
  const body = new THREE.Mesh(geo, [toonMaterial(side, { map: barrelTexture() }), toonMaterial(top, { map: chestTexture() }), toonMaterial(side)]);
  body.position.y = BARREL_HEIGHT / 2;
  const hull = new THREE.Mesh(geo, outlineHullMaterial);
  hull.scale.setScalar(1.06);
  hull.position.y = BARREL_HEIGHT / 2;
  group.add(hull, body);
  return { group, body, hull };
}

function chestMesh() {
  const group = new THREE.Group();
  const w = O.chestHalfX * 2;
  const d = O.chestHalfZ * 2;
  const mat = toonMaterial(C.chest, { map: chestTexture() }); // planks
  const band = toonMaterial(C.chestBand);
  // Its own outline material, so the whole chest can fade on its own.
  const lines = outlineLineMaterial.clone();

  // A hollow box, so an open chest shows its inside: four walls and a
  // floor, lined with darker wood. The outline traces the outer box.
  const T = 0.045; // wall thickness
  const base = new THREE.Group();
  const walls = [
    [w, CHEST_HEIGHT, T, 0, (d - T) / 2],
    [w, CHEST_HEIGHT, T, 0, -(d - T) / 2],
    [T, CHEST_HEIGHT, d - 2 * T, (w - T) / 2, 0],
    [T, CHEST_HEIGHT, d - 2 * T, -(w - T) / 2, 0],
  ];
  for (const [sx, sy, sz, x, z] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    wall.position.set(x, CHEST_HEIGHT / 2, z);
    base.add(wall);
  }
  // Inside: a box's back faces, so from above you see the far inner walls
  // and the floor, in a darker wood, and never its (missing) top.
  const inner = toonMaterial(new THREE.Color(C.chest).multiplyScalar(0.45), { side: THREE.BackSide });
  const lining = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * T - 0.002, CHEST_HEIGHT - 0.02, d - 2 * T - 0.002), inner);
  lining.position.y = CHEST_HEIGHT / 2 + 0.01;
  base.add(lining);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, CHEST_HEIGHT, d)), lines);
  outline.position.y = CHEST_HEIGHT / 2;
  base.add(outline);

  // The lid pivots on its back edge (-z, away from the camera).
  const hinge = new THREE.Group();
  hinge.position.set(0, CHEST_HEIGHT, -d / 2);
  const lidGeo = new THREE.BoxGeometry(w, LID_HEIGHT, d);
  const lid = new THREE.Mesh(lidGeo, mat);
  lid.position.set(0, LID_HEIGHT / 2, d / 2);
  lid.add(new THREE.LineSegments(new THREE.EdgesGeometry(lidGeo), lines));
  // The band wraps the lid just above its bottom edge. It must not share a
  // plane with any lid face, or the open lid's underside flickers (z-fighting).
  const strap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.02), band);
  strap.position.y = -LID_HEIGHT / 2 + 0.03 + 0.012;
  lid.add(strap);
  hinge.add(lid);

  group.add(base, hinge);
  // After the walls (renderOrder 5, see-through while aiming, see levelView):
  // a faded chest doesn't write depth, so a wall drawn after it would paint
  // over the parts of it that stand in front of that wall.
  group.traverse((o) => (o.renderOrder = 6));
  return { group, hinge, fadeMaterials: [mat, band, lines, inner], opacity: 1 };
}

export function createObjectsView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const views = new Map(); // static -> view state
  const blasts = [];
  const blastGeo = new THREE.SphereGeometry(1, 20, 14);

  return {
    /** Build meshes for a level's statics (replacing any previous level's). */
    build(statics) {
      for (const v of views.values()) root.remove(v.group);
      views.clear();
      for (const s of statics) {
        let v;
        if (s.kind === 'barrel') v = { ...barrelMesh(C.barrel, C.barrelTop), kind: s.kind };
        else if (s.kind === 'explosive') v = { ...barrelMesh(C.explosive, C.explosiveTop), kind: s.kind };
        else v = { ...chestMesh(), kind: s.kind };
        v.group.position.set(s.x, 0, s.z);
        v.shake = 0;
        v.pop = -1;
        v.open = 0;
        root.add(v.group);
        views.set(s, v);
      }
    },
    /** A barrel cracked: shake it and move it to the next damage stage. */
    crack(s, stage) {
      const v = views.get(s);
      if (!v) return;
      const look = BARREL_STAGES[Math.min(stage, BARREL_STAGES.length - 1)];
      v.shake = 0.25;
      const geo = barrelGeometry(Math.min(stage, BARREL_STAGES.length - 1));
      v.body.geometry.dispose();
      v.body.geometry = geo;
      v.hull.geometry = geo;
      v.body.position.y = v.hull.position.y = look.height / 2;
      v.body.material.forEach((m, i) => {
        m.color.setHex(i === 1 ? C.barrelTop : C.barrel).multiplyScalar(look.shade);
        m.flatShading = look.flat;
        m.needsUpdate = true;
      });
      // Lean in a random direction, pivoting at the base.
      const a = Math.random() * Math.PI * 2;
      v.group.rotation.set(Math.cos(a) * look.lean, 0, Math.sin(a) * look.lean);
    },
    /** A barrel broke or a red barrel went off: pop it out of the scene. */
    remove(s) {
      const v = views.get(s);
      if (v && v.pop < 0) v.pop = 0;
    },
    openChest(s) {
      const v = views.get(s);
      if (v) v.opening = true;
    },
    /** An expanding, fading fireball where a red barrel went off. */
    /** A fireball; `size` scales it (a bomb's blast is bigger than a red barrel's). */
    blast(x, z, size = 1) {
      const mesh = new THREE.Mesh(
        blastGeo,
        new THREE.MeshBasicMaterial({ color: C.explosion, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      mesh.position.set(x, 0.35, z);
      mesh.scale.setScalar(0.3 * size);
      root.add(mesh);
      blasts.push({ mesh, t: 0, size });
    },
    /**
     * While aiming, fade chests near the ball to see-through (and back once
     * you release), so a chest in front of the ball never hides it.
     */
    fadeChests(ball, aiming, dt) {
      const k = 1 - Math.exp(-10 * dt);
      for (const [s, v] of views) {
        if (s.kind !== 'chest') continue;
        const near = aiming && Math.hypot(s.x - ball.x, s.z - ball.z) < O.chestFadeRadius;
        v.opacity += ((near ? O.chestFadeOpacity : 1) - v.opacity) * k;
        const see = v.opacity < 0.995;
        for (const m of v.fadeMaterials) {
          if (m.transparent !== see) {
            m.transparent = see;
            m.depthWrite = !see;
            m.needsUpdate = true;
          }
          m.opacity = see ? v.opacity : 1;
        }
      }
    },
    update(dt) {
      for (const [s, v] of views) {
        if (v.shake > 0) {
          v.shake = Math.max(0, v.shake - dt);
          v.group.position.x = s.x + Math.sin(v.shake * 90) * 0.04 * (v.shake / 0.25);
        }
        if (v.opening && v.open < 1) {
          v.open = Math.min(1, v.open + dt * 4);
          v.hinge.rotation.x = -1.9 * (1 - (1 - v.open) ** 3);
        }
        if (v.pop >= 0) {
          v.pop += dt;
          const t = v.pop / 0.22;
          v.group.scale.setScalar(t < 0.3 ? 1 + t * 0.6 : Math.max(0, 1.18 * (1 - (t - 0.3) / 0.7)));
          if (t >= 1) {
            root.remove(v.group);
            views.delete(s);
          }
        }
      }
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i];
        b.t += dt;
        const t = b.t / 0.4;
        b.mesh.scale.setScalar((0.3 + 1.1 * Math.min(1, t) ** 0.5) * b.size);
        b.mesh.material.opacity = 0.85 * Math.max(0, 1 - t);
        if (t >= 1) {
          root.remove(b.mesh);
          b.mesh.material.dispose();
          blasts.splice(i, 1);
        }
      }
    },
  };
}
