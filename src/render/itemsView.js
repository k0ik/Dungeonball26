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

// A fixed spin/bob offset per kind, so different kinds don't all move alike.
const KIND_PHASE = { coin: 0, potion: 1.1, superPotion: 2.3, shield: 3.4, sword: 4.2, key: 5.1, oneUp: 0.6 };

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
      // Standing on its pommel: pommel, grip, guard, then the blade, so the
      // whole hilt shows above the floor.
      const pommel = outlined(new THREE.SphereGeometry(0.035, 10, 8), C.coin, 1.2);
      pommel.position.y = 0.04;
      const grip = outlined(new THREE.BoxGeometry(0.035, 0.12, 0.035), 0x6b4423, 1.2);
      grip.position.y = 0.13;
      const guard = outlined(new THREE.BoxGeometry(0.16, 0.035, 0.04), C.coin, 1.2);
      guard.position.y = 0.205;
      const blade = outlined(new THREE.BoxGeometry(0.05, 0.34, 0.02), C.sword, 1.2);
      blade.position.y = 0.39;
      g.add(pommel, grip, guard, blade);
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
  const hurtCoinColor = new THREE.Color(C.hurtCoin);
  let t = 0;

  /** One show-only coin on an arc from `from` to `to`, starting after `delay` s (t < 0 waits). */
  function spark(from, to, height, dur, t0, drop = 0) {
    const g = itemMesh({ kind: 'coin' });
    g.visible = false;
    root.add(g);
    sparks.push({ g, body: g.children[0].children[1], from, to, height, dur, t: t0, drop }); // body: the coin's toon mesh (hull, body, x-ray)
  }

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
        const a = Math.random() * Math.PI * 2;
        const d = rand(L.chestCoinSpreadMin, L.chestCoinSpreadMax);
        spark({ x, y, z }, { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d }, rand(L.chestCoinHeightMin, L.chestCoinHeightMax), rand(L.chestCoinTimeMin, L.chestCoinTimeMax), -i * L.chestCoinStagger, 0.4);
      }
    },
    /** A coin you just took hops straight up, flashes white and vanishes, like the chest's. */
    popCoin(x, z) {
      spark({ x, y: 0.04, z }, { x, z }, CONFIG.loot.collectHopHeight, CONFIG.loot.collectHopTime, 0);
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
          s.from.y + s.height * 4 * u * (1 - u) * 1.15 - s.drop * u * u, // up, then (chest coins) falling a little below where they started
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
        // A coin knocked out of you is red, then fades softly to gold over
        // the last hurtCoinFadeSeconds of its wait, when it can be taken.
        if (item.kind === 'coin' && (item.hot || g.userData.hot)) {
          const [, body, xray] = g.children[0].children;
          if (!g.userData.hot) {
            g.userData.hot = true;
            xray.material = xray.material.clone(); // its own, to fade (the shared one stays gold)
          }
          const k = Math.min(1, (item.hot ?? 0) / CONFIG.loot.hurtCoinFadeSeconds); // 1 red .. 0 gold
          body.material.color.lerpColors(coinColor, hurtCoinColor, k);
          xray.material.color.copy(body.material.color);
          if (!item.hot) {
            g.userData.hot = false;
            xray.material.dispose();
            xray.material = xrayMaterial(C.coin);
          }
        }
        // Matching pickups on the floor move in step: every coin shares one
        // angle, every shield another, and so on (each kind with its own
        // offset), and bob together. A flying one spins fast.
        const kindPhase = KIND_PHASE[item.kind] ?? 0;
        if (item.fly) g.rotation.y += dt * 9;
        else g.rotation.y = t * (item.kind === 'coin' ? CONFIG.loot.coinSpin : CONFIG.loot.itemSpin) + kindPhase;
        g.position.x = item.x;
        g.position.z = item.z;
        g.position.y = item.fly ? flightHeight(item.fly) : 0.04 + Math.sin(t * 3 + kindPhase) * 0.03;
      }
    },
  };
}
