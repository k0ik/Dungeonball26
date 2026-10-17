import * as THREE from 'three';
import { AIM, PHYSICS, RENDER } from './config.js';
import { parseLevel } from './level.js';
import { createBall, step, isAtRest, predictPath } from './physics.js';
import { buildLevelMesh } from './render/levelMesh.js';
import { buildBallMesh, syncBallMesh } from './render/ballMesh.js';
import { createCamera, frameLevel } from './render/camera.js';
import { createAimVisuals } from './render/aimVisuals.js';
import { createAimInput } from './input.js';
import { createAudio } from './audio.js';
import { createDebug } from './debug.js';
import level1Text from './levels/01-first-shot.txt?raw';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));

const scene = new THREE.Scene();
scene.background = new THREE.Color(RENDER.colors.background);
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-3, 10, 6);
scene.add(sun);

const camera = createCamera();
scene.add(camera); // so the audio listener attached to it is part of the graph

const level = parseLevel(level1Text, 'First Shot');
scene.add(buildLevelMesh(level));

// Enemies, barrels and other entities are parsed but not simulated until their milestones (M3+).
const hero = createBall({ ...level.start, kind: 'hero' });
const balls = [hero];
const heroMesh = buildBallMesh(hero.radius, RENDER.colors.hero, RENDER.colors.heroStripe);
heroMesh.position.set(hero.x, hero.radius, hero.z);
scene.add(heroMesh);

const audio = createAudio(camera);
const aimVisuals = createAimVisuals(scene);
const debug = createDebug(scene);

// 'ready' = waiting for a shot; 'rolling' = balls in motion, input locked.
let phase = 'ready';

createAimInput({
  canvas,
  camera,
  getHero: () => hero,
  canAim: () => phase === 'ready',
  onChange(aim) {
    if (!aim) return aimVisuals.hide();
    const path = aim.cancelled
      ? null
      : predictPath(level, hero, aim.dirX * aim.speed, aim.dirZ * aim.speed, AIM.previewMaxTime);
    aimVisuals.update({ hero, fill: aim.fill, cancelled: aim.cancelled, path });
  },
  onFire(aim) {
    hero.vx = aim.dirX * aim.speed;
    hero.vz = aim.dirZ * aim.speed;
    phase = 'rolling';
    audio.launch(aim.fill);
  },
});
canvas.addEventListener('pointerdown', () => audio.unlock());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  frameLevel(camera, level, w / h);
}
window.addEventListener('resize', resize);
resize();

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, PHYSICS.step * PHYSICS.maxSubsteps);
  lastTime = now;

  if (phase === 'rolling') {
    accumulator += dt;
    const prevX = hero.x;
    const prevZ = hero.z;
    while (accumulator >= PHYSICS.step) {
      accumulator -= PHYSICS.step;
      for (const c of step(level, balls)) {
        if (c.type === 'wall') audio.bounce(c.speed, AIM.maxLaunchSpeed);
      }
    }
    syncBallMesh(heroMesh, hero, prevX, prevZ);
    if (isAtRest(balls)) {
      phase = 'ready';
      accumulator = 0;
    }
  }

  debug.update({ phase, balls });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Dev-only handle for poking at state from the console or browser tests.
if (import.meta.env.DEV) window.dungeonball = { level, hero, camera, getPhase: () => phase };
