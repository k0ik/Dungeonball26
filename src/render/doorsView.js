// Doors: a block in the key's colour filling the door tile, a little lower
// than the walls, with a darker frame and a keyhole on its faces so it
// doesn't read as a wall. Opening sinks it into the floor.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial, outlineHullMaterial, markOccluder } from './materials.js';

const H = CONFIG.render.wallHeight * 0.92;

function keyholeTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const base = new THREE.Color(color);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = `#${base.clone().multiplyScalar(0.55).getHexString()}`;
  g.lineWidth = 8;
  g.strokeRect(4, 4, 56, 56);
  g.fillStyle = '#1e1f21';
  g.beginPath();
  g.arc(32, 26, 7, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(28, 28);
  g.lineTo(36, 28);
  g.lineTo(39, 46);
  g.lineTo(25, 46);
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDoorsView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const views = new Map(); // door -> { group, t }

  return {
    /** Draw the level's doors (clearing any from the last level). */
    build(doors) {
      for (const v of views.values()) root.remove(v.group);
      views.clear();
      for (const door of doors) {
        const color = CONFIG.colors.keys[door.color];
        const geo = new THREE.BoxGeometry(0.98, H, 0.98);
        const side = markOccluder(toonMaterial(0xffffff, { map: keyholeTexture(color) }));
        const top = markOccluder(toonMaterial(new THREE.Color(color).multiplyScalar(1.1)));
        // Box faces: +x, -x, +y, -y, +z, -z.
        const body = new THREE.Mesh(geo, [side, side, top, top, side, side]);
        const hull = new THREE.Mesh(geo, outlineHullMaterial);
        hull.scale.setScalar(1.03);
        const group = new THREE.Group();
        group.add(hull, body);
        group.position.set(door.col + 0.5, H / 2, door.row + 0.5);
        root.add(group);
        views.set(door, { group, t: -1 });
      }
    },
    /** Start the door sinking into the floor; it's gone when done. */
    open(door) {
      const v = views.get(door);
      if (v && v.t < 0) v.t = 0;
    },
    update(dt) {
      for (const [door, v] of views) {
        if (v.t < 0) continue;
        v.t += dt / CONFIG.objects.doorOpenSeconds;
        const k = Math.min(1, v.t);
        v.group.scale.y = 1 - k;
        v.group.position.y = (H / 2) * (1 - k);
        if (k >= 1) {
          root.remove(v.group);
          views.delete(door);
        }
      }
    },
  };
}
