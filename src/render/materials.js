import * as THREE from 'three';
import { RENDER } from '../config.js';

// A 3-step gradient gives MeshToonMaterial its flat banded look.
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

// Inverted-hull outline: back faces of the mesh, pushed out along normals, drawn black.
export const outlineMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    thickness: { value: RENDER.outlineThickness },
    color: { value: new THREE.Color(RENDER.colors.outline) },
  },
  vertexShader: /* glsl */ `
    uniform float thickness;
    void main() {
      vec3 p = position + normal * thickness;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      #ifdef USE_INSTANCING
        mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      #endif
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    void main() { gl_FragColor = vec4(color, 1.0); }
  `,
});
