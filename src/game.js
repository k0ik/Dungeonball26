// M0–M2: render a level, shoot the hero around it, camera follows.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { parseLevel, tileCenter, tileAt } from './level.js';
import { createWorld, createBall, stepWorld, isAtRest, speedOf } from './physics.js';
import { shotFromDrag, canGrab, previewPath } from './aim.js';
import { buildLevelView } from './render/levelView.js';
import { createBallView } from './render/ballView.js';
import { createAimView } from './render/aimView.js';
import { createCameraRig } from './render/cameraRig.js';
import { createAudio } from './audio.js';

/** levels: [{ id, name, text }]. */
export function createGame(container, levels, startIndex = 0) {

  // --- Rendering -----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
  renderer.setClearColor(CONFIG.colors.background);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 10, 6);
  scene.add(sun);

  const rig = createCameraRig();

  // The hero persists across levels; the level, its world and its view don't.
  const hero = createBall({ x: 0, z: 0, kind: 'hero', id: 'hero' });
  const heroView = createBallView(hero, { color: CONFIG.colors.hero, stripe: CONFIG.colors.heroStripe });
  scene.add(heroView.object);

  const aimView = createAimView();
  scene.add(aimView.object);

  let levelIndex = -1;
  let level = null;
  let world = null;
  let start = null;
  let levelView = null;

  function loadLevel(i) {
    levelIndex = (i + levels.length) % levels.length;
    const def = levels[levelIndex];
    level = parseLevel(def.text, def.name);
    if (levelView) scene.remove(levelView);
    levelView = buildLevelView(level);
    scene.add(levelView);
    world = createWorld(level);
    world.balls.push(hero);
    start = tileCenter(level.start);
    rig.setBounds(0, level.width, 0, level.height);
    respawn();
    rig.snapTo(hero.x, hero.z);
  }

  const sfx = createAudio(rig.camera);

  // phase: 'aim' (at rest, input open) or 'rolling' (input locked)
  const state = { phase: 'aim', aiming: false, pointerId: null, pointer: new THREE.Vector3(), shots: 0, clears: 0 };

  // --- Input -----------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Grab test uses the ball's centre height so pressing on the visible ball works.
  const grabPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hero.radius);

  function pointerOn(plane, e, out) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, rig.camera);
    return raycaster.ray.intersectPlane(plane, out);
  }

  const canvas = renderer.domElement;
  const tmp = new THREE.Vector3();

  canvas.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    if (state.phase !== 'aim' || state.aiming || e.button > 0) return;
    if (!pointerOn(grabPlane, e, tmp) || !canGrab(hero, { x: tmp.x, z: tmp.z })) return;
    state.aiming = true;
    state.pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    pointerOn(groundPlane, e, state.pointer);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.aiming || e.pointerId !== state.pointerId) return;
    pointerOn(groundPlane, e, state.pointer);
  });

  function endAim(e, fire) {
    if (!state.aiming || e.pointerId !== state.pointerId) return;
    state.aiming = false;
    aimView.hide();
    if (!fire) return;
    pointerOn(groundPlane, e, state.pointer);
    const shot = shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z });
    if (shot.cancel || shot.speed <= CONFIG.physics.stopThreshold) return;
    hero.vx = shot.dirX * shot.speed;
    hero.vz = shot.dirZ * shot.speed;
    state.phase = 'rolling';
    state.shots++;
    sfx.play('launch', 0.4 + 0.6 * shot.fill, { pitch: 0.9 + 0.2 * shot.fill });
  }
  canvas.addEventListener('pointerup', (e) => endAim(e, true));
  canvas.addEventListener('pointercancel', (e) => endAim(e, false));

  // Reaching the exit ends the run at once, even mid-roll. For now there is
  // one level, so the hero goes straight back to its start.
  function reachExit() {
    state.clears++;
    sfx.play('exit', 0.8);
    respawn();
  }

  function respawn() {
    hero.x = start.x;
    hero.z = start.z;
    hero.vx = hero.vz = 0;
    heroView.snap();
    state.phase = 'aim';
    state.aiming = false;
    aimView.hide();
  }

  // --- Debug overlay -----------------------------------------------------------
  const debug = document.createElement('pre');
  debug.className = 'debug';
  debug.hidden = !new URLSearchParams(location.search).has('debug');
  container.appendChild(debug);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === '`') debug.hidden = !debug.hidden;
    if (e.key === 'r') respawn();
    if (e.key === 'n') loadLevel(levelIndex + 1);
  });

  // --- Layout ------------------------------------------------------------------
  function resize() {
    // Phones fill the screen; wider windows get a portrait column.
    const w = Math.min(window.innerWidth, window.innerHeight * CONFIG.render.maxAspect);
    const h = window.innerHeight;
    container.style.width = `${w}px`;
    container.style.height = `${h}px`;
    renderer.setSize(w, h);
    rig.setAspect(w / h);
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Loop --------------------------------------------------------------------
  function handleEvents() {
    const A = CONFIG.audio;
    for (const ev of world.events) {
      const loud = Math.min(1, ev.speed / CONFIG.aim.maxLaunchSpeed);
      if (ev.type === 'wall' && ev.speed >= A.minWallSoundSpeed) {
        sfx.play('wall', 0.25 + 0.75 * loud, { pitch: 0.9 + Math.random() * 0.2, minInterval: A.minWallSoundInterval });
      } else if (ev.type === 'ball') {
        sfx.play('ball', 0.3 + 0.7 * loud);
      }
    }
    world.events.length = 0;
  }

  let acc = 0;
  let last = performance.now();
  let fps = 60;

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    const step = CONFIG.physics.step;
    acc += dt;
    let steps = 0;
    while (acc >= step && steps < CONFIG.physics.maxStepsPerFrame) {
      stepWorld(world, step);
      handleEvents();
      if (tileAt(level, Math.floor(hero.x), Math.floor(hero.z)) === 'exit') {
        reachExit();
        break;
      }
      acc -= step;
      steps++;
    }
    if (steps === CONFIG.physics.maxStepsPerFrame) acc = 0;

    if (state.phase === 'rolling' && isAtRest(world)) state.phase = 'aim';

    if (state.aiming) {
      const shot = shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z });
      aimView.show(shot, shot.cancel ? null : previewPath(level, hero, shot.dirX, shot.dirZ, shot.speed));
    }

    heroView.update();
    rig.updateZoom(speedOf(hero), dt);
    rig.follow(hero.x, hero.z, dt);
    renderer.render(scene, rig.camera);

    if (!debug.hidden) {
      debug.textContent = [
        `${level.name}  ${fps.toFixed(0)} fps`,
        `phase  ${state.aiming ? 'aiming' : state.phase}`,
        `hero   ${hero.x.toFixed(2)}, ${hero.z.toFixed(2)}`,
        `speed  ${speedOf(hero).toFixed(2)} tiles/s`,
        `view   ${rig.viewWidth.toFixed(2)} units`,
        `shots  ${state.shots}   exits  ${state.clears}`,
        `[d] debug  [r] respawn  [n] next level`,
      ].join('\n');
    }

    requestAnimationFrame(frame);
  }
  loadLevel(startIndex);
  requestAnimationFrame(frame);

  // Handy for poking at the game from the browser console.
  return {
    get level() {
      return level;
    },
    get world() {
      return world;
    },
    hero,
    state,
    rig,
    respawn,
    loadLevel,
  };
}
