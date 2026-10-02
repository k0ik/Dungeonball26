// Ice puddles on the floor (src/ice.js): a pale, glassy rounded square on
// each iced tile. A fresh puddle is at its brightest; it fades to half in the
// move after it was laid, and fades out when it melts, so the trail visibly
// thaws rather than blinking away.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const R = CONFIG.render;

function roundedSquare(size, radius) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return new THREE.ShapeGeometry(s, 4).rotateX(-Math.PI / 2);
}

export function createIceView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const pool = roundedSquare(R.icePuddleSize, R.icePuddleCorner);
  const sheen = roundedSquare(R.icePuddleSize * 0.45, R.icePuddleCorner * 0.5).translate(-0.12, 0, -0.12);
  const views = new Map(); // puddle -> { g, materials, opacity, melting }

  function add(p) {
    const base = new THREE.MeshBasicMaterial({ color: CONFIG.colors.ice, transparent: true, opacity: 0, depthWrite: false });
    const glint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const g = new THREE.Group();
    const a = new THREE.Mesh(pool, base);
    const b = new THREE.Mesh(sheen, glint);
    a.renderOrder = b.renderOrder = 1;
    a.position.y = 0.006;
    b.position.y = 0.008;
    g.add(a, b);
    g.position.set(p.col + 0.5, 0, p.row + 0.5);
    root.add(g);
    views.set(p, { g, base, glint, opacity: 0, melting: false });
  }

  return {
    /** Match the puddles and ease each one's opacity toward its age's. */
    update(ice, move, dt) {
      const live = new Set(ice.values());
      for (const p of live) if (!views.has(p)) add(p);
      const k = 1 - Math.exp(-R.iceFadeRate * dt);
      for (const [p, v] of views) {
        const target = !live.has(p) ? 0 : p.move === move ? R.iceOpacity : R.iceOpacity * R.iceOldShare;
        v.opacity += (target - v.opacity) * k;
        v.base.opacity = v.opacity;
        v.glint.opacity = v.opacity * 0.6;
        if (!live.has(p) && v.opacity < 0.01) {
          root.remove(v.g);
          v.base.dispose();
          v.glint.dispose();
          views.delete(p);
        }
      }
    },
    /** A new level: drop every puddle at once. */
    clear() {
      for (const v of views.values()) {
        root.remove(v.g);
        v.base.dispose();
        v.glint.dispose();
      }
      views.clear();
    },
  };
}
