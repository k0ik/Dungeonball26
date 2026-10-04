// Lighting (design doc: "Visuals: warmth and mood"). The floor and walls are
// flat-coloured and unlit, so they get light "pools" in their shader instead
// of real lights: a warm torch pool around your ball, tinted pools under
// enemies, a gold one under each closed chest, a low red one under red
// barrels, and a brief bright flash where something blows up. The rest of
// the board dims a little toward the ambient level. Pools are cheap (a short
// loop in the fragment shader), so only your ball (and each flash) carries a
// real point light, for the round objects it passes.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const L = CONFIG.lighting;
const MAX = L.maxPools;

const uniforms = {
  uPoolPos: { value: Array.from({ length: MAX }, () => new THREE.Vector3()) }, // x, z, radius
  uPoolCol: { value: Array.from({ length: MAX }, () => new THREE.Vector3()) }, // colour × strength
  uPoolCount: { value: 0 },
  uAmbient: { value: new THREE.Vector3(1, 1, 1) },
};

/**
 * Light a flat (MeshBasicMaterial) floor or wall material by the pools.
 * Chains any onBeforeCompile already set (seeThrough), and keys the program
 * cache so lit and unlit variants never share a shader.
 */
export function litByPools(material) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPoolWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPoolWorld;
uniform vec3 uPoolPos[${MAX}];
uniform vec3 uPoolCol[${MAX}];
uniform int uPoolCount;
uniform vec3 uAmbient;
vec3 poolLight() {
  vec3 light = uAmbient;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uPoolCount) break;
    float d = length(vPoolWorld.xz - uPoolPos[i].xy) / uPoolPos[i].z;
    float k = clamp(1.0 - d, 0.0, 1.0);
    light += uPoolCol[i] * k * k;
  }
  return light;
}`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= poolLight();');
  };
  material.customProgramCacheKey = () => `pools|${prevKey()}`;
  return material;
}

/**
 * The scene's lights and pools. `update(dt, hero, balls, statics, exits)` each frame
 * gathers the pools nearest your ball (up to lighting.maxPools) and eases
 * any flashes out; `flash(x, z)` marks an explosion.
 */
export function createLighting(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, L.ambientLight));
  const sun = new THREE.DirectionalLight(0xffffff, L.sunLight);
  sun.position.set(-4, 10, 6);
  scene.add(sun);
  // Your ball's torch, for the round objects nearby (barrels, enemies, chests).
  const torch = new THREE.PointLight(L.torchColor, L.torchLight, L.torchRadius, 1.2);
  scene.add(torch);
  // One shared real light for the latest flash.
  const flashLight = new THREE.PointLight(L.flashColor, 0, L.flashRadius, 1.2);
  scene.add(flashLight);

  uniforms.uAmbient.value.setScalar(L.ambient);
  const torchCol = new THREE.Color(L.torchColor);
  const flashCol = new THREE.Color(L.flashColor);
  const exitCol = new THREE.Color(L.exitColor);
  const tmp = new THREE.Color();
  let flashes = [];
  let clock = 0;
  const candidates = [];

  function add(x, z, radius, color, strength) {
    candidates.push({ x, z, radius, r: color.r * strength, g: color.g * strength, b: color.b * strength });
  }

  return {
    flash(x, z) {
      flashes.push({ x, z, t: 0 });
      flashLight.position.set(x, 1.2, z);
      flashLight.intensity = L.flashLight;
    },
    update(dt, hero, balls, statics, exits = []) {
      candidates.length = 0;
      flashes = flashes.filter((f) => (f.t += dt) < L.flashSeconds);
      for (const f of flashes) {
        const k = 1 - f.t / L.flashSeconds;
        add(f.x, f.z, L.flashPoolRadius, flashCol, L.flashPool * k * k);
      }
      flashLight.intensity = Math.max(0, flashLight.intensity - (L.flashLight * dt) / L.flashSeconds);
      add(hero.x, hero.z, L.torchPoolRadius, torchCol, L.torchPool);
      torch.position.set(hero.x, L.torchHeight, hero.z);
      for (const b of balls) {
        if (b.kind !== 'enemy' || b.dead) continue;
        const type = b.type && CONFIG.enemy.types[b.type];
        add(b.x, b.z, L.enemyPoolRadius, tmp.set(type?.color ?? CONFIG.colors.enemy), L.enemyPool);
      }
      // The exit glows green, pulsing slowly, so you can spot it from afar.
      clock += dt;
      const pulse = 1 - L.exitPulseDepth * 0.5 * (1 - Math.cos(clock * L.exitPulseHz * Math.PI * 2));
      for (const e of exits) add(e.col + 0.5, e.row + 0.5, L.exitPoolRadius, exitCol, L.exitPool * pulse);
      for (const s of statics) {
        if (s.kind === 'chest' && !s.opened) add(s.x, s.z, L.chestPoolRadius, tmp.set(CONFIG.colors.chestBand), L.chestPool);
        else if (s.kind === 'explosive') add(s.x, s.z, L.explosivePoolRadius, tmp.set(CONFIG.colors.explosive), L.explosivePool);
      }
      // Flashes and the torch first (they're added first), then the nearest
      // of the rest to your ball.
      const fixed = flashes.length + 1;
      const rest = candidates.slice(fixed).sort((a, b) => (a.x - hero.x) ** 2 + (a.z - hero.z) ** 2 - ((b.x - hero.x) ** 2 + (b.z - hero.z) ** 2));
      const chosen = candidates.slice(0, fixed).concat(rest).slice(0, MAX);
      chosen.forEach((p, i) => {
        uniforms.uPoolPos.value[i].set(p.x, p.z, p.radius);
        uniforms.uPoolCol.value[i].set(p.r, p.g, p.b);
      });
      uniforms.uPoolCount.value = chosen.length;
    },
  };
}
