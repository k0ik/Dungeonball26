// Barrels, red barrels and chests (static bumpers), plus the red barrel's
// blast. Procedural toon primitives with outlines, coloured like the mockup.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial, outlineLineMaterial } from './materials.js';

const C = CONFIG.colors;
const O = CONFIG.objects;
const BARREL_HEIGHT = 0.62;
const CHEST_HEIGHT = 0.4;
const LID_HEIGHT = 0.2;

function barrelMesh(side, top) {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(O.barrelRadius, O.barrelRadius * 0.9, BARREL_HEIGHT, 20);
  const body = new THREE.Mesh(geo, [toonMaterial(side), toonMaterial(top), toonMaterial(side)]);
  body.position.y = BARREL_HEIGHT / 2;
  const hull = new THREE.Mesh(geo, outlineHullMaterial);
  hull.scale.setScalar(1.06);
  hull.position.y = BARREL_HEIGHT / 2;
  group.add(hull, body);
  return { group, body };
}

function chestMesh() {
  const group = new THREE.Group();
  const w = O.chestHalfX * 2;
  const d = O.chestHalfZ * 2;
  const mat = toonMaterial(C.chest);
  const band = toonMaterial(C.chestBand);

  const baseGeo = new THREE.BoxGeometry(w, CHEST_HEIGHT, d);
  const base = new THREE.Mesh(baseGeo, mat);
  base.position.y = CHEST_HEIGHT / 2;
  base.add(new THREE.LineSegments(new THREE.EdgesGeometry(baseGeo), outlineLineMaterial));

  // The lid pivots on its back edge (-z, away from the camera).
  const hinge = new THREE.Group();
  hinge.position.set(0, CHEST_HEIGHT, -d / 2);
  const lidGeo = new THREE.BoxGeometry(w, LID_HEIGHT, d);
  const lid = new THREE.Mesh(lidGeo, mat);
  lid.position.set(0, LID_HEIGHT / 2, d / 2);
  lid.add(new THREE.LineSegments(new THREE.EdgesGeometry(lidGeo), outlineLineMaterial));
  const strap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.02), band);
  strap.position.y = -LID_HEIGHT / 2 + 0.03;
  lid.add(strap);
  hinge.add(lid);

  group.add(base, hinge);
  return { group, hinge };
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
    /** A barrel cracked: shake it and darken it a stage. */
    crack(s, stage) {
      const v = views.get(s);
      if (!v) return;
      v.shake = 0.25;
      const k = 1 - 0.18 * stage;
      v.body.material[0].color.setHex(C.barrel).multiplyScalar(k);
      v.body.material[1].color.setHex(C.barrelTop).multiplyScalar(k);
      v.body.rotation.z = (Math.random() - 0.5) * 0.12 * stage;
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
    blast(x, z) {
      const mesh = new THREE.Mesh(
        blastGeo,
        new THREE.MeshBasicMaterial({ color: C.explosion, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      mesh.position.set(x, 0.35, z);
      mesh.scale.setScalar(0.3);
      root.add(mesh);
      blasts.push({ mesh, t: 0 });
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
        b.mesh.scale.setScalar(0.3 + 1.1 * Math.min(1, t) ** 0.5);
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
