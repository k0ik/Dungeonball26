// Effects (design doc: "Visuals: warmth and mood", Effects). One particle
// system (soft round sprites: sparks and glints glow additively, dust and
// splinters don't), 3D wooden debris for broken barrels, and floor marks:
// an expanding shockwave ring and a lasting scorch where something blew up.
// All of it is cosmetic; the simulation never sees it.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { toonMaterial } from './materials.js';

const E = CONFIG.effects;

function particleLayer(max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 100 } },
    vertexShader: `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying vec3 vColor;
varying float vAlpha;
uniform float uPx;
void main() {
  vColor = color;
  vAlpha = alpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, size * uPx);
}`,
    fragmentShader: `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = vAlpha * (1.0 - smoothstep(${additive ? '0.05' : '0.3'}, 0.5, r));
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 8; // after the walls and chests
  const parts = Array.from({ length: max }, () => ({ life: 0 }));
  let next = 0;
  return {
    points,
    material,
    spawn(p) {
      const slot = parts[next];
      next = (next + 1) % max;
      Object.assign(slot, p, { age: 0 });
    },
    update(dt) {
      let n = 0;
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.life = 0;
          continue;
        }
        const drag = Math.exp(-(p.drag ?? 2) * dt);
        p.vx *= drag;
        p.vz *= drag;
        p.vy = p.vy * drag - (p.gravity ?? 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.02) {
          p.y = 0.02;
          p.vy = Math.abs(p.vy) * 0.3;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
        const u = p.age / p.life;
        pos[n * 3] = p.x;
        pos[n * 3 + 1] = p.y;
        pos[n * 3 + 2] = p.z;
        col[n * 3] = p.r;
        col[n * 3 + 1] = p.g;
        col[n * 3 + 2] = p.b;
        size[n] = p.size * (p.grow ? 1 + u * p.grow : 1 - u * 0.5);
        alpha[n] = p.alpha * (1 - u) * (1 - u);
        n++;
      }
      geo.setDrawRange(0, n);
      for (const a of ['position', 'color', 'size', 'alpha']) geo.attributes[a].needsUpdate = true;
    },
    clear() {
      for (const p of parts) p.life = 0;
    },
  };
}

/** A soft dark disc for scorch marks. */
function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(10,6,4,0.85)');
  grad.addColorStop(0.55, 'rgba(14,9,6,0.55)');
  grad.addColorStop(1, 'rgba(14,9,6,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // A few darker blotches so it isn't a perfect circle.
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 26;
    g.fillStyle = 'rgba(8,5,3,0.35)';
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 6 + Math.random() * 10, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/** A soft, irregular splat, white (tinted by the material) for blood dabs. */
function bloodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const x = 32 + (Math.random() - 0.5) * 22;
    const y = 32 + (Math.random() - 0.5) * 22;
    const r = 8 + Math.random() * 12;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

export function createEffects(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const glow = particleLayer(E.maxParticles, true);
  const soft = particleLayer(E.maxParticles, false);
  root.add(glow.points, soft.points);
  const tmp = new THREE.Color();

  // Debris: little wooden staves that fly, tumble, bounce and settle, then shrink away.
  const STAVE = new THREE.BoxGeometry(0.2, 0.035, 0.07);
  const debrisMesh = new THREE.InstancedMesh(STAVE, toonMaterial(0xffffff), E.maxDebris);
  debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debrisMesh.count = 0;
  debrisMesh.frustumCulled = false;
  root.add(debrisMesh);
  const debris = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e3 = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();

  // Floor marks.
  const markGroup = new THREE.Group();
  root.add(markGroup);
  const scorchTex = scorchTexture();
  const scorchGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  const rings = [];
  const scorches = [];
  // Blood dabs (a ring buffer of floor decals, each with its own fade).
  const bloodTex = bloodTexture();
  const bloodPool = Array.from({ length: E.maxBlood }, () => {
    const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: bloodTex, color: E.bloodColor, transparent: true, depthWrite: false, opacity: 0 }));
    m.visible = false;
    m.renderOrder = 1;
    markGroup.add(m);
    m.userData.t = 0;
    return m;
  });
  let bloodNext = 0;
  const trailLight = new THREE.Color(E.bloodColorLight);

  const rand = (a, b) => a + Math.random() * (b - a);
  const colorOf = (hex) => tmp.set(hex);

  function burst(layer, x, y, z, n, { color, speed = [1, 3], up = [0.5, 2], life = [0.3, 0.6], size = [0.06, 0.12], gravity = 6, drag = 2, alpha = 1, grow = 0, spread = 0 }) {
    const c = colorOf(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(...speed);
      layer.spawn({
        x: x + Math.cos(a) * spread,
        y,
        z: z + Math.sin(a) * spread,
        vx: Math.cos(a) * s,
        vy: rand(...up),
        vz: Math.sin(a) * s,
        life: rand(...life),
        size: rand(...size),
        r: c.r,
        g: c.g,
        b: c.b,
        gravity,
        drag,
        alpha,
        grow,
      });
    }
  }

  function fan(layer, x, y, z, nx, nz, n, opts) {
    // Like burst, but thrown out mostly along (nx, nz).
    const c = colorOf(opts.color);
    const base = Math.atan2(nz, nx);
    for (let i = 0; i < n; i++) {
      const a = base + rand(-1, 1) * (opts.cone ?? 0.9);
      const s = rand(...(opts.speed ?? [1.5, 4]));
      layer.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: rand(...(opts.up ?? [0.3, 1.6])),
        vz: Math.sin(a) * s,
        life: rand(...(opts.life ?? [0.2, 0.45])),
        size: rand(...(opts.size ?? [0.04, 0.08])),
        r: c.r,
        g: c.g,
        b: c.b,
        gravity: opts.gravity ?? 8,
        drag: opts.drag ?? 3,
        alpha: opts.alpha ?? 1,
        grow: 0,
      });
    }
  }

  return {
    /** A ball hit a wall at (x, z), bouncing off along (nx, nz): a puff of dust. */
    wallHit(x, z, nx, nz, speed) {
      if (speed < E.minHitSpeed) return;
      const k = Math.min(1, speed / CONFIG.aim.maxLaunchSpeed);
      fan(soft, x, 0.08, z, nx, nz, Math.round(3 + 7 * k), {
        color: E.dustColor,
        speed: [0.3, 1.2 + k],
        up: [0.1, 0.6],
        life: [0.35, 0.7],
        size: [0.1, 0.2],
        gravity: 0.5,
        drag: 4,
        alpha: 0.45,
        cone: 1.3,
      });
      if (k > 0.5) fan(glow, x, 0.15, z, nx, nz, Math.round(4 * k), { color: E.sparkColor, speed: [2, 4.5], life: [0.12, 0.3], size: [0.03, 0.05] });
    },
    /** Two balls met at (x, z) with normal (nx, nz): sparks, tinted by `color` when it's a hit. */
    ballHit(x, z, nx, nz, speed, color = null) {
      if (speed < E.minHitSpeed) return;
      const k = Math.min(1, speed / CONFIG.aim.maxLaunchSpeed);
      const n = Math.round(4 + 10 * k);
      // Out to both sides of the contact, across the line of impact.
      fan(glow, x, 0.3, z, -nz, nx, n / 2, { color: E.sparkColor, speed: [1.5, 4 + 3 * k], life: [0.15, 0.35], size: [0.03, 0.06], cone: 0.7 });
      fan(glow, x, 0.3, z, nz, -nx, n / 2, { color: E.sparkColor, speed: [1.5, 4 + 3 * k], life: [0.15, 0.35], size: [0.03, 0.06], cone: 0.7 });
      if (color != null) burst(glow, x, 0.3, z, Math.round(4 + 6 * k), { color, speed: [0.6, 2.2], up: [0.3, 1.5], life: [0.25, 0.5], size: [0.06, 0.11], gravity: 3, alpha: 0.9 });
    },
    /** An enemy died at (x, z): a burst in its colour and a ring of sparkles. */
    kill(x, z, color) {
      burst(glow, x, 0.3, z, 22, { color, speed: [1.2, 3.5], up: [0.6, 2.4], life: [0.35, 0.75], size: [0.07, 0.14], gravity: 5, alpha: 0.95 });
      burst(glow, x, 0.3, z, 12, { color: E.sparkColor, speed: [2, 4.5], up: [0.5, 2], life: [0.2, 0.45], size: [0.03, 0.06] });
      burst(soft, x, 0.1, z, 6, { color: E.dustColor, speed: [0.3, 0.9], up: [0.1, 0.4], life: [0.5, 0.9], size: [0.15, 0.25], gravity: 0.3, drag: 3, alpha: 0.35, grow: 1 });
    },
    /** A barrel broke at (x, z): staves fly out and a puff of dust and splinters. */
    barrelBreak(x, z, color) {
      const c = colorOf(color);
      for (let i = 0; i < E.stavesPerBarrel; i++) {
        const a = (i / E.stavesPerBarrel) * Math.PI * 2 + rand(-0.3, 0.3);
        const s = rand(1.2, 2.6);
        const d = { x: x + Math.cos(a) * 0.15, y: rand(0.15, 0.45), z: z + Math.sin(a) * 0.15, vx: Math.cos(a) * s, vy: rand(1.5, 3), vz: Math.sin(a) * s, rx: rand(0, 6), ry: a, rz: rand(0, 6), wx: rand(-12, 12), wz: rand(-12, 12), age: 0, life: rand(1.6, 2.4), color: c.clone().multiplyScalar(rand(0.75, 1.1)) };
        if (debris.length >= E.maxDebris) debris.shift();
        debris.push(d);
      }
      burst(soft, x, 0.2, z, 10, { color: E.dustColor, speed: [0.4, 1.4], up: [0.2, 0.8], life: [0.5, 0.9], size: [0.14, 0.26], gravity: 0.5, drag: 3, alpha: 0.4, grow: 1 });
      burst(soft, x, 0.3, z, 10, { color, speed: [1, 3], up: [1, 2.5], life: [0.4, 0.7], size: [0.04, 0.07], gravity: 9 });
    },
    /** Something blew up at (x, z): sparks, embers, smoke, a shockwave ring and a scorch mark. */
    explosion(x, z, size = 1) {
      burst(glow, x, 0.35, z, Math.round(30 * size), { color: E.fireColor, speed: [2, 6 * size], up: [0.5, 3], life: [0.25, 0.6], size: [0.05, 0.1], gravity: 4 });
      burst(glow, x, 0.35, z, Math.round(14 * size), { color: E.emberColor, speed: [1, 3.5 * size], up: [2, 4.5], life: [0.6, 1.2], size: [0.03, 0.06], gravity: 5, drag: 1 });
      burst(soft, x, 0.3, z, Math.round(10 * size), { color: E.smokeColor, speed: [0.3, 1.2], up: [0.4, 1.2], life: [0.8, 1.4], size: [0.3, 0.5], gravity: -0.4, drag: 2, alpha: 0.45, grow: 1.5, spread: 0.3 });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: E.fireColor, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.set(x, 0.03, z);
      ring.renderOrder = 7;
      markGroup.add(ring);
      rings.push({ mesh: ring, t: 0, size });
      const scorch = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, opacity: 0 }));
      scorch.position.set(x, 0.006, z);
      scorch.rotation.y = Math.random() * Math.PI * 2;
      scorch.scale.setScalar(E.scorchSize * size);
      scorch.renderOrder = 1;
      markGroup.add(scorch);
      scorches.push({ mesh: scorch, t: 0 });
    },
    /**
     * Your knockout at (x, z), flung along (nx, nz): a big spray of the
     * ball's metal skin, flakes of silver bursting off (mostly along its way),
     * with a few bright glints among them.
     */
    shed(x, z, nx, nz) {
      fan(soft, x, 0.3, z, nx, nz, E.shedFlakes, { color: E.metalColor, speed: [1.5, 7.5], up: [1, 4.5], life: [0.7, 1.5], size: [0.07, 0.16], gravity: 9, drag: 1.5, cone: 1.6 });
      burst(soft, x, 0.3, z, Math.round(E.shedFlakes / 2), { color: E.metalDarkColor, speed: [1, 5], up: [1, 4], life: [0.7, 1.4], size: [0.05, 0.12], gravity: 9, drag: 1.5 });
      burst(glow, x, 0.35, z, Math.round(E.shedFlakes / 3), { color: 0xffffff, speed: [2, 6], up: [1, 3], life: [0.2, 0.5], size: [0.03, 0.06], gravity: 6 });
    },
    /**
     * Your skull rolling: a dab of the shed metal skin on the floor at (x, z), `size`
     * across, that soaks in and fades over effects.bloodSeconds.
     */
    blood(x, z, size) {
      const m = bloodPool[bloodNext];
      bloodNext = (bloodNext + 1) % bloodPool.length;
      m.position.set(x, 0.005 + bloodNext * 1e-6, z);
      m.rotation.y = Math.random() * Math.PI * 2;
      m.scale.set(size * (0.7 + Math.random() * 0.6), 1, size);
      m.material.opacity = E.bloodOpacity;
      // Each smear its own grey, from light to dark metal.
      m.material.color.set(E.bloodColorDark).lerp(trailLight, Math.random());
      m.visible = true;
      m.userData.t = 0;
    },
    /** A coin was picked up at (x, z): a small golden glint. */
    glint(x, z) {
      burst(glow, x, 0.3, z, 6, { color: E.glintColor, speed: [0.5, 1.6], up: [0.8, 2], life: [0.2, 0.4], size: [0.04, 0.08], gravity: 3 });
    },
    /** Remove everything (a new level). */
    clear() {
      glow.clear();
      soft.clear();
      debris.length = 0;
      for (const r of rings) markGroup.remove(r.mesh);
      for (const s of scorches) markGroup.remove(s.mesh);
      rings.length = 0;
      scorches.length = 0;
      for (const m of bloodPool) m.visible = false;
    },
    /** Advance everything; `pxPerUnit` is screen pixels per world unit (for particle sizes). */
    update(dt, pxPerUnit) {
      glow.material.uniforms.uPx.value = pxPerUnit * E.particleScale;
      soft.material.uniforms.uPx.value = pxPerUnit * E.particleScale;
      glow.update(dt);
      soft.update(dt);

      let n = 0;
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.age += dt;
        if (d.age >= d.life) {
          debris.splice(i, 1);
          continue;
        }
        if (d.y > 0.02 || Math.abs(d.vy) > 0.05) {
          d.vy -= 12 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.z += d.vz * dt;
          d.rx += d.wx * dt;
          d.rz += d.wz * dt;
          if (d.y < 0.02) {
            d.y = 0.02;
            d.vy = Math.abs(d.vy) < 1 ? 0 : -d.vy * 0.35;
            d.vx *= 0.5;
            d.vz *= 0.5;
            d.wx *= 0.4;
            d.wz *= 0.4;
            // Settle flat.
            if (d.vy === 0) d.rx = d.rz = 0;
          }
        }
      }
      for (const d of debris) {
        const fade = Math.min(1, (d.life - d.age) / 0.4);
        q.setFromEuler(e3.set(d.rx, d.ry, d.rz));
        m4.compose(v3.set(d.x, d.y, d.z), q, s3.setScalar(fade));
        debrisMesh.setMatrixAt(n, m4);
        debrisMesh.setColorAt(n, d.color);
        n++;
      }
      debrisMesh.count = n;
      debrisMesh.instanceMatrix.needsUpdate = true;
      if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;

      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        const u = r.t / E.ringSeconds;
        if (u >= 1) {
          markGroup.remove(r.mesh);
          r.mesh.material.dispose();
          rings.splice(i, 1);
          continue;
        }
        r.mesh.scale.setScalar(0.2 + E.ringRadius * r.size * (1 - (1 - u) ** 3));
        r.mesh.material.opacity = 0.8 * (1 - u);
      }
      for (const s of scorches) {
        s.t += dt;
        s.mesh.material.opacity = Math.min(1, s.t / 0.25);
      }
      for (const m of bloodPool) {
        if (!m.visible) continue;
        m.userData.t += dt;
        const u = m.userData.t / E.bloodSeconds;
        if (u >= 1) m.visible = false;
        else m.material.opacity = E.bloodOpacity * (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
      }
    },
  };
}
