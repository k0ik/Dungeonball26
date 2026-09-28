// Floor pickups: coins dropped by kills, and barrel loot you couldn't use yet
// (a potion at full HP, a shield while holding one). Small bobbing, turning
// toon primitives so they read as collectable.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial } from './materials.js';

const C = CONFIG.colors;

// X-ray: wherever a wall stands between the camera and a pickup, the hidden
// part still shows as a flat see-through silhouette in the item's colour.
// GreaterDepth draws it only where something nearer is already drawn, so the
// visible part of the item looks the same as before.
const xrayMaterials = new Map();
function xrayMaterial(color) {
  if (!xrayMaterials.has(color)) {
    xrayMaterials.set(
      color,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: CONFIG.render.itemXrayOpacity,
        depthFunc: THREE.GreaterDepth,
        depthWrite: false,
      }),
    );
  }
  return xrayMaterials.get(color);
}

function outlined(geo, color, scale = 1.12) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(geo, outlineHullMaterial);
  hull.scale.setScalar(scale);
  const xray = new THREE.Mesh(geo, xrayMaterial(color));
  xray.renderOrder = 10; // after the walls, so their depth is already there
  g.add(hull, new THREE.Mesh(geo, toonMaterial(color)), xray);
  return g;
}

function itemMesh(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'coins':
    case 'gold':
      for (let i = 0; i < 3; i++) {
        const coin = outlined(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 16), C.coin, 1.15);
        coin.position.set((i - 1) * 0.06, 0.02 + i * 0.04, (i % 2) * 0.03);
        g.add(coin);
      }
      break;
    case 'potion':
    case 'superPotion': {
      const r = kind === 'potion' ? 0.1 : 0.13;
      const color = kind === 'potion' ? C.potion : C.superPotion;
      const flask = outlined(new THREE.SphereGeometry(r, 16, 12), color);
      flask.position.y = r;
      const neck = outlined(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 10), 0xe8e8ee);
      neck.position.y = r * 2 + 0.03;
      g.add(flask, neck);
      break;
    }
    case 'shield': {
      const disc = outlined(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 20), C.shieldItem);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.17;
      g.add(disc);
      break;
    }
    case 'sword': {
      const blade = outlined(new THREE.BoxGeometry(0.05, 0.34, 0.02), C.sword, 1.2);
      blade.position.y = 0.26;
      const guard = outlined(new THREE.BoxGeometry(0.16, 0.035, 0.04), C.coin, 1.2);
      guard.position.y = 0.09;
      g.add(blade, guard);
      break;
    }
    case 'oneUp': {
      const ball = outlined(new THREE.SphereGeometry(0.12, 16, 12), C.hero);
      ball.position.y = 0.12;
      g.add(ball);
      break;
    }
  }
  return g;
}

export function createItemsView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const views = new Map(); // item -> mesh group
  let t = 0;

  return {
    /** Match the scene to the current list of floor items. */
    sync(items) {
      for (const [item, g] of views) {
        if (!items.includes(item)) {
          root.remove(g);
          views.delete(item);
        }
      }
      for (const item of items) {
        if (views.has(item)) continue;
        const g = itemMesh(item.kind);
        g.position.set(item.x, 0, item.z);
        g.userData.phase = Math.random() * Math.PI * 2;
        root.add(g);
        views.set(item, g);
      }
    },
    update(dt) {
      t += dt;
      for (const g of views.values()) {
        g.rotation.y += dt * 1.6;
        g.position.y = 0.04 + Math.sin(t * 3 + g.userData.phase) * 0.03;
      }
    },
  };
}
