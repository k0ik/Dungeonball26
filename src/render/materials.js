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

// See-through walls: a wall or door fragment fades when the patch of ground
// it hides (along the camera's view) is near the hero or the aim path, so
// your ball and aimer are never lost behind a wall. The fade zone is a few
// capsules (segments with a radius) on the ground, set each frame.
const MAX_FADE = 4;
const fadeUniforms = {
  uFadeSeg: { value: Array.from({ length: MAX_FADE }, () => new THREE.Vector4()) },
  uFadeRad: { value: new Array(MAX_FADE).fill(0) },
  uFadeCount: { value: 0 },
  uFadeViewDir: { value: new THREE.Vector3(0, -1, 0) },
  uFadeOpacity: { value: CONFIG.render.seeThroughOpacity },
};

/** Make a wall or door material fade where it hides the hero or the aim path. */
export function seeThrough(material) {
  material.transparent = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fadeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFadeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFadeWorld;
uniform vec4 uFadeSeg[${MAX_FADE}];
uniform float uFadeRad[${MAX_FADE}];
uniform int uFadeCount;
uniform vec3 uFadeViewDir;
uniform float uFadeOpacity;
float seeThroughFade() {
  // The ground point this fragment hides.
  vec2 q = vFadeWorld.xz - uFadeViewDir.xz * (vFadeWorld.y / uFadeViewDir.y);
  float fade = 0.0;
  for (int i = 0; i < ${MAX_FADE}; i++) {
    if (i >= uFadeCount) break;
    vec2 a = uFadeSeg[i].xy;
    vec2 ab = uFadeSeg[i].zw - a;
    float t = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(q - a - ab * t);
    fade = max(fade, 1.0 - smoothstep(uFadeRad[i] * 0.6, uFadeRad[i], d));
  }
  return fade;
}`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= mix(1.0, uFadeOpacity, seeThroughFade());');
  };
  return material;
}

/**
 * Set the see-through zone: around the hero, and along the aim path's
 * points while aiming. `viewDir` is the camera's forward direction.
 */
export function setSeeThrough(hero, pathPoints, viewDir) {
  const R = CONFIG.render;
  const segs = fadeUniforms.uFadeSeg.value;
  const rads = fadeUniforms.uFadeRad.value;
  segs[0].set(hero.x, hero.z, hero.x, hero.z);
  rads[0] = R.seeThroughBallRadius;
  let n = 1;
  for (let i = 1; pathPoints && i < pathPoints.length && n < MAX_FADE; i++, n++) {
    const a = pathPoints[i - 1];
    const b = pathPoints[i];
    segs[n].set(a.x, a.z, b.x, b.z);
    rads[n] = R.seeThroughPathRadius;
  }
  fadeUniforms.uFadeCount.value = n;
  fadeUniforms.uFadeViewDir.value.copy(viewDir);
}

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
