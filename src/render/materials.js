import * as THREE from 'three';
import { CONFIG } from '../config.js';

let gradientMap = null;

/** Three-band ramp for the flat toon look. */
function toonGradient() {
  if (gradientMap) return gradientMap;
  const bands = new Uint8Array([110, 190, 255]);
  gradientMap = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function toonMaterial(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

export const outlineLineMaterial = new THREE.LineBasicMaterial({ color: CONFIG.colors.outline });

// Occlusion mask for the pickup x-ray (itemsView): walls and doors set
// stencil 1 where they're drawn, balls reset it to 0 over themselves, and the
// x-ray only draws where it's 1. So a pickup shows through a wall, but never
// through an enemy standing on it (or a ball in front of the wall).
function stencilWrite(material, ref) {
  Object.assign(material, {
    stencilWrite: true,
    stencilRef: ref,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  return material;
}
export const markOccluder = (material) => stencilWrite(material, 1);
export const clearOccluder = (material) => stencilWrite(material, 0);
/** Draw only over wall pixels (see markOccluder). */
export const onOccluder = (material) =>
  Object.assign(material, {
    stencilWrite: true, // enables the stencil test
    stencilRef: 1,
    stencilFunc: THREE.EqualStencilFunc,
    stencilZPass: THREE.KeepStencilOp,
  });

/** Inverted-hull outline: a slightly larger back-faced black copy. */
export const outlineHullMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.outline,
  side: THREE.BackSide,
});

let silverMatcap = null;

/**
 * Stylized chrome: a hand-drawn matcap (bright sky above a hard horizon, dark
 * ground below, a hot highlight and a darker rim), so the ball reads as polished
 * silver without an environment map. `color` tints it, like toonMaterial.
 */
export function silverMaterial(color = 0xffffff, extra = {}) {
  if (!silverMatcap) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    g.clip();
    const body = g.createLinearGradient(0, 0, 0, size);
    body.addColorStop(0, '#f6f8fb');
    body.addColorStop(0.46, '#c3c8d0');
    body.addColorStop(0.5, '#868c95'); // the horizon: chrome's hard reflection line
    body.addColorStop(0.62, '#aeb4bc');
    body.addColorStop(0.85, '#c3c8d0');
    body.addColorStop(1, '#6a7079');
    g.fillStyle = body;
    g.fillRect(0, 0, size, size);
    const rim = g.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(20,24,30,0.45)');
    g.fillStyle = rim;
    g.fillRect(0, 0, size, size);
    const hot = g.createRadialGradient(size * 0.36, size * 0.3, 0, size * 0.36, size * 0.3, size * 0.16);
    hot.addColorStop(0, 'rgba(255,255,255,1)');
    hot.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    hot.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hot;
    g.fillRect(0, 0, size, size);
    silverMatcap = new THREE.CanvasTexture(canvas);
    silverMatcap.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshMatcapMaterial({ color, matcap: silverMatcap, ...extra });
}
