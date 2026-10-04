// Procedural textures (design doc: "Visuals: warmth and mood"), drawn on a
// canvas at load: flagstones for the floor and wall tops, stone courses for
// wall sides, planks and iron hoops for barrels, planks for chests, and a
// soft shade map that darkens the floor where it meets a wall. Surface
// textures are grey "multipliers": 0.8 is neutral (the shader scales by 1.25),
// so the baked colours stay as they were on average.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { tileAt } from '../level.js';

const T = CONFIG.textures;

/** Small seeded random, so the textures look the same every load. */
function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

const grey = (v) => {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${n},${n},${n})`;
};

/** Fine speckle over the whole canvas, `amount` either side of the base. */
function speckle(g, w, h, rand, amount, size = 2) {
  for (let i = 0; i < (w * h) / (size * size * 3); i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * amount})`;
    g.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), size, size);
  }
}

function toTexture(c, { repeat = true, color = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * Flagstones: rows of stones of random widths, each its own tone, with dark
 * grout and a little speckle. Covers `T.floorTiles` tiles each way, tiling.
 */
let stoneTex = null;
export function stoneTexture() {
  if (stoneTex) return stoneTex;
  const px = T.floorTiles * T.pxPerTile;
  const [c, g] = canvas(px, px);
  const rand = rng(7);
  g.fillStyle = grey(T.grout);
  g.fillRect(0, 0, px, px);
  const rows = T.floorTiles * 2; // half-tile courses
  const rowH = px / rows;
  const gap = T.groutPx;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * rowH * 2;
    while (x < px) {
      const w = rowH * (1 + rand() * 1.4);
      const tone = 0.8 + (rand() - 0.5) * T.stoneTone * 2;
      g.fillStyle = grey(tone);
      // Drawn twice across the seam so the texture wraps cleanly.
      for (const dx of [0, px]) {
        const x0 = x - dx;
        if (x0 + w < 0 || x0 > px) continue;
        g.beginPath();
        g.roundRect(x0 + gap / 2, r * rowH + gap / 2, w - gap, rowH - gap, gap);
        g.fill();
        // A faint lighter top edge and darker bottom edge: worn, slightly domed.
        g.fillStyle = `rgba(255,255,255,0.06)`;
        g.fillRect(x0 + gap, r * rowH + gap, w - gap * 2, rowH * 0.18);
        g.fillStyle = `rgba(0,0,0,0.07)`;
        g.fillRect(x0 + gap, r * rowH + rowH * 0.78, w - gap * 2, rowH * 0.18 - gap / 2);
        g.fillStyle = grey(tone);
      }
      x += w;
    }
  }
  speckle(g, px, px, rand, 0.12);
  stoneTex = toTexture(c);
  return stoneTex;
}

/**
 * Wall sides: courses of stone blocks, `T.wallCourses` rows up the wall's
 * height, joints staggered, two tiles wide (u) by the wall's height (v).
 */
let courseTex = null;
export function courseTexture() {
  if (courseTex) return courseTex;
  const w = 2 * T.pxPerTile;
  const h = T.pxPerTile;
  const [c, g] = canvas(w, h);
  const rand = rng(11);
  g.fillStyle = grey(T.grout * 0.9);
  g.fillRect(0, 0, w, h);
  const rows = T.wallCourses;
  const rowH = h / rows;
  const gap = T.groutPx;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rowH * 0.9 : 0;
    while (x < w) {
      const bw = rowH * (1.4 + rand() * 0.9);
      const right = Math.min(x + bw, w + rowH * 2);
      const tone = 0.8 + (rand() - 0.5) * T.stoneTone * 2.2;
      for (const dx of [0, w]) {
        g.fillStyle = grey(tone);
        g.fillRect(x - dx + gap / 2, r * rowH + gap / 2, right - x - gap, rowH - gap);
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(x - dx + gap / 2, r * rowH + gap / 2, right - x - gap, rowH * 0.15);
      }
      x = right;
    }
  }
  speckle(g, w, h, rand, 0.12);
  courseTex = toTexture(c);
  return courseTex;
}

/**
 * A barrel's side: vertical staves with dark seams and wood grain, two iron
 * hoops. A colour map (white = the material's colour) for the cylinder's
 * side UVs (u around, v up).
 */
let barrelTex = null;
export function barrelTexture() {
  if (barrelTex) return barrelTex;
  const [c, g] = canvas(256, 128);
  const rand = rng(3);
  const staves = 12;
  const sw = 256 / staves;
  for (let i = 0; i < staves; i++) {
    g.fillStyle = grey(0.86 + rand() * 0.14);
    g.fillRect(i * sw, 0, sw, 128);
    // Grain: thin wavy darker lines along the stave.
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const x0 = i * sw + 3 + rand() * (sw - 6);
      g.beginPath();
      g.moveTo(x0, 0);
      g.bezierCurveTo(x0 + 2, 40, x0 - 2, 88, x0 + 1, 128);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(i * sw, 0, 1.5, 128);
  }
  // Iron hoops near the top and bottom (v runs bottom to top; canvas y down).
  for (const y of [18, 98]) {
    g.fillStyle = 'rgb(70,66,62)';
    g.fillRect(0, y, 256, 11);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, y + 1, 256, 2);
  }
  barrelTex = toTexture(c, { color: true });
  barrelTex.wrapT = THREE.ClampToEdgeWrapping;
  return barrelTex;
}

/** A chest's wood: horizontal planks with seams and grain (a colour map). */
let chestTex = null;
export function chestTexture() {
  if (chestTex) return chestTex;
  const [c, g] = canvas(128, 128);
  const rand = rng(5);
  const planks = 4;
  const ph = 128 / planks;
  for (let i = 0; i < planks; i++) {
    g.fillStyle = grey(0.86 + rand() * 0.14);
    g.fillRect(0, i * ph, 128, ph);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 2; k++) {
      const y0 = i * ph + 4 + rand() * (ph - 8);
      g.beginPath();
      g.moveTo(0, y0);
      g.bezierCurveTo(40, y0 + 2, 88, y0 - 2, 128, y0 + 1);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, i * ph, 128, 1.5);
  }
  chestTex = toTexture(c, { color: true });
  return chestTex;
}

/**
 * Soft corner shading for a level: a small map, white over open floor and
 * black under walls, blurred, so the floor darkens toward every wall.
 * Rounded levels draw the true outline (`polys`, from loopPolygons); block
 * levels draw wall tiles. Returns { texture, rect } where rect maps world
 * (x, z) to the map's UVs: uv = (xz - rect.xy) * rect.zw.
 */
export function cornerShade(level, polys = null) {
  const ppt = T.shadePxPerTile;
  const pad = 2; // tiles of margin, so the blur doesn't wrap at the edges
  const w = (level.width + pad * 2) * ppt;
  const h = (level.height + pad * 2) * ppt;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  const X = (x) => (x + pad) * ppt;
  if (polys) {
    g.beginPath();
    for (const poly of polys) {
      poly.forEach((p, i) => (i ? g.lineTo(X(p.x), X(p.z)) : g.moveTo(X(p.x), X(p.z))));
      g.closePath();
    }
    g.fill('evenodd');
  } else {
    for (let row = 0; row < level.height; row++) {
      for (let col = 0; col < level.width; col++) {
        if (tileAt(level, col, row) !== 'wall') g.fillRect(X(col), X(row), ppt, ppt);
      }
    }
  }
  // Blur in a second canvas (a filter applies to what's drawn next).
  const [c2, g2] = canvas(w, h);
  g2.filter = `blur(${T.shadeBlurTiles * ppt}px)`;
  g2.drawImage(c, 0, 0);
  const texture = toTexture(c2, { repeat: false });
  texture.flipY = false; // canvas rows run with z
  return { texture, rect: new THREE.Vector4(-pad, -pad, 1 / (level.width + pad * 2), 1 / (level.height + pad * 2)) };
}

// The level's corner shade, swapped in by buildLevelView for each level.
const surfaceUniforms = {
  uStoneTex: { value: null },
  uCourseTex: { value: null },
  uShadeTex: { value: null },
  uShadeRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uShadeDepth: { value: 0 },
};
let blankShade = null;

/** Set (or clear, with null) the corner shade for the level being shown. */
export function setCornerShade(shade) {
  if (!blankShade) {
    const [c, g] = canvas(2, 2);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 2, 2);
    blankShade = toTexture(c, { repeat: false });
  }
  const old = surfaceUniforms.uShadeTex.value;
  if (old && old !== blankShade) old.dispose();
  surfaceUniforms.uShadeTex.value = shade?.texture ?? blankShade;
  if (shade) surfaceUniforms.uShadeRect.value.copy(shade.rect);
}

/**
 * Texture a flat floor or wall material (MeshBasicMaterial with baked vertex
 * colours) by world position, so the pattern follows any outline: `floor`
 * gets flagstones and the corner shade; `wall` gets flagstone caps on top
 * and stone courses up its sides (the side picked from the face's normal,
 * worked out from screen-space derivatives).
 */
export function stoneSurface(material, kind) {
  surfaceUniforms.uStoneTex.value = stoneTexture();
  surfaceUniforms.uCourseTex.value = courseTexture();
  surfaceUniforms.uShadeDepth.value = T.shadeDepth;
  if (!surfaceUniforms.uShadeTex.value) setCornerShade(null);
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.bind(material);
  const wall = kind === 'wall';
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, surfaceUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSurfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSurfWorld;
uniform sampler2D uStoneTex;
uniform sampler2D uCourseTex;
uniform sampler2D uShadeTex;
uniform vec4 uShadeRect;
uniform float uShadeDepth;
float surfaceTone() {
  vec3 p = vSurfWorld;
${
  wall
    ? `  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  if (abs(n.y) > 0.5) return texture2D(uStoneTex, p.xz / ${T.floorTiles.toFixed(1)}).r * 1.25;
  float u = abs(n.x) > abs(n.z) ? p.z : p.x;
  return texture2D(uCourseTex, vec2(u * 0.5, p.y / ${CONFIG.render.wallHeight.toFixed(3)})).r * 1.25;`
    : `  float stone = texture2D(uStoneTex, p.xz / ${T.floorTiles.toFixed(1)}).r * 1.25;
  float shade = texture2D(uShadeTex, (p.xz - uShadeRect.xy) * uShadeRect.zw).r;
  return stone * mix(1.0 - uShadeDepth, 1.0, shade);`
}
}`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= surfaceTone();');
  };
  material.customProgramCacheKey = () => `stone-${kind}|${prevKey()}`;
  return material;
}
