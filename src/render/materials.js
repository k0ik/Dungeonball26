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

/** Inverted-hull outline: a slightly larger back-faced black copy. */
export const outlineHullMaterial = new THREE.MeshBasicMaterial({
  color: CONFIG.colors.outline,
  side: THREE.BackSide,
});
