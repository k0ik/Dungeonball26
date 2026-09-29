// Floor pickups: coins (strip coins, and the ones kills and barrels scatter),
// barrel loot, and keys. Small bobbing, turning toon primitives so they read
// as collectable. A scattered coin flies out in an arc and bounces once
// (item.fly, advanced by the game) before it settles.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial, onOccluder } from './materials.js';

const C = CONFIG.colors;

// X-ray: wherever a wall stands between the camera and a pickup, the hidden
// part still shows as a flat see-through silhouette in the item's colour.
// GreaterDepth draws it only where something nearer is already drawn, and the
// stencil mask limits that to walls and doors (not a ball standing on it), so
// the visible part of the item looks the same as before.
const xrayMaterials = new Map();
function xrayMaterial(color) {
  if (!xrayMaterials.has(color)) {
    xrayMaterials.set(
      color,
      onOccluder(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: CONFIG.render.itemXrayOpacity,
          depthFunc: THREE.GreaterDepth,
          depthWrite: false,
        }),
      ),
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

function itemMesh(item) {
  const { kind } = item;
  const g = new THREE.Group();
  switch (kind) {
    case 'coin': {
      // A single coin, standing on edge and spinning, like a dot to eat.
      const coin = outlined(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), C.coin, 1.15);
      coin.rotation.x = Math.PI / 2;
      coin.position.y = 0.16;
      g.add(coin);
      break;
    }
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
    case 'key': {
      // Standing key: a ring bow, a shaft and two teeth, in the key's colour.
      const color = C.keys[item.color];
      const bow = outlined(new THREE.TorusGeometry(0.09, 0.03, 8, 20), color);
      bow.position.y = 0.36;
      const shaft = outlined(new THREE.BoxGeometry(0.04, 0.24, 0.04), color);
      shaft.position.y = 0.16;
      g.add(bow, shaft);
      for (const y of [0.07, 0.12]) {
        const tooth = outlined(new THREE.BoxGeometry(0.08, 0.035, 0.04), color);
        tooth.position.set(0.05, y, 0);
        g.add(tooth);
      }
      g.scale.setScalar(1.5); // keys matter more than coins: make them easy to spot
      break;
    }
    case 'oneUp': {
      const ball = outlined(new THREE.SphereGeometry(0.12, 16, 12), C.oneUpItem);
      ball.position.y = 0.12;
      g.add(ball);
      break;
    }
  }
  return g;
}

/** Height of a flying coin: one arc out, then a small bounce. */
function flightHeight(fly) {
  const u = Math.min(1, fly.t / fly.dur);
  const main = CONFIG.loot.scatterBounceAt;
  if (u < main) {
    const s = u / main;
    return 0.04 + fly.height * 4 * s * (1 - s);
  }
  const s = (u - main) / (1 - main);
  return 0.04 + fly.height * CONFIG.loot.scatterBounceHeight * 4 * s * (1 - s);
}

export function createItemsView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const views = new Map(); // item -> mesh group
  const sparks = []; // chest coins: show only, not pickups
  const white = new THREE.Color(0xffffff);
  const coinColor = new THREE.Color(C.coin);
  let t = 0;

  return {
    /**
     * A chest's gold as a fountain of the same spinning coins, one per gold:
     * they pop out of the open chest one after another on high arcs, and each
     * flashes white once and vanishes on the way down. Show only: the gold is
     * credited when the chest opens.
     */
    chestCoins(x, y, z, n) {
      const L = CONFIG.loot;
      const rand = (a, b) => a + Math.random() * (b - a);
      for (let i = 0; i < n; i++) {
        const g = itemMesh({ kind: 'coin' });
        g.visible = false;
        root.add(g);
        const a = Math.random() * Math.PI * 2;
        const d = rand(L.chestCoinSpreadMin, L.chestCoinSpreadMax);
        sparks.push({
          g,
          body: g.children[0].children[1], // the coin's toon mesh (hull, body, x-ray)
          from: { x, y, z },
          to: { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d },
          height: rand(L.chestCoinHeightMin, L.chestCoinHeightMax),
          dur: rand(L.chestCoinTimeMin, L.chestCoinTimeMax),
          t: -i * L.chestCoinStagger, // waits its turn to pop out
        });
      }
    },
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
        const g = itemMesh(item);
        g.position.set(item.x, 0, item.z);
        g.userData.phase = Math.random() * Math.PI * 2;
        root.add(g);
        views.set(item, g);
      }
    },
    update(dt) {
      t += dt;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.t += dt;
        if (s.t < 0) continue;
        const u = Math.min(1, s.t / s.dur);
        s.g.visible = true;
        s.g.position.set(
          s.from.x + (s.to.x - s.from.x) * u,
          s.from.y + s.height * 4 * u * (1 - u) * 1.15 - 0.4 * u * u, // up high, then falling a little below the rim
          s.from.z + (s.to.z - s.from.z) * u,
        );
        s.g.rotation.y += dt * 10;
        // The last stretch: a single white flash, swelling slightly, then gone.
        const flash = Math.max(0, (u - (1 - CONFIG.loot.chestCoinFlash)) / CONFIG.loot.chestCoinFlash);
        s.body.material.color.lerpColors(coinColor, white, Math.sin(Math.PI * Math.min(1, flash * 1.4)) ** 0.5 * (flash > 0 ? 1 : 0));
        s.g.scale.setScalar(1 + 0.5 * flash);
        if (u >= 1) {
          root.remove(s.g);
          s.body.material.dispose();
          sparks.splice(i, 1);
        }
      }
      for (const [item, g] of views) {
        g.rotation.y += dt * (item.fly ? 9 : 1.6); // spins fast while flying
        g.position.x = item.x;
        g.position.z = item.z;
        g.position.y = item.fly ? flightHeight(item.fly) : 0.04 + Math.sin(t * 3 + g.userData.phase) * 0.03;
      }
    },
  };
}
