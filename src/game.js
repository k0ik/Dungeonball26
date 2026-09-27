// The game loop and turn manager (design doc: "Core loop and turn structure").
//
// A round: you aim and shoot; once everything is at rest, each living enemy
// takes one turn, nearest to you first. An enemy that can see you lunges;
// otherwise it patrols. Everything settles between moves. If your HP hits 0
// you lose a life and respawn at the start, and the round ends there.
//
// Phases:
//   aim        at rest, input open
//   shot       your ball (and whatever it knocked) is rolling
//   enemyWait  the acting enemy's short telegraph before it moves
//   enemyMove  the acting enemy's move is rolling
//   down       you were knocked out; waiting to respawn

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { parseLevel, tileCenter, tileAt } from './level.js';
import { createWorld, createBall, stepWorld, isAtRest, speedOf } from './physics.js';
import { createCombat, createEnemy } from './combat.js';
import { canSee } from './sight.js';
import { nextActor, lungeVelocity, patrolMove, pickPatrollers } from './turns.js';
import { shotFromDrag, canGrab, previewPath } from './aim.js';
import { buildLevelView } from './render/levelView.js';
import { createBallView } from './render/ballView.js';
import { createEnemyView } from './render/enemyView.js';
import { createOverlay } from './render/overlay.js';
import { createHud } from './render/hud.js';
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
  const overlay = createOverlay(container, rig.camera);
  const hud = createHud(container);
  const sfx = createAudio(rig.camera);

  // The hero persists across levels; the level, its world and its view don't.
  const hero = createBall({ x: 0, z: 0, kind: 'hero', id: 'hero' });
  Object.assign(hero, { atk: CONFIG.hero.atk, maxHp: CONFIG.hero.maxHp, hp: CONFIG.hero.maxHp });
  const heroView = createBallView(hero, { color: CONFIG.colors.hero, stripe: CONFIG.colors.heroStripe });
  scene.add(heroView.object);
  overlay.addBar(hero, 'hero');

  const aimView = createAimView(rig.yaw);
  scene.add(aimView.object);

  const combat = createCombat();
  const enemyViews = new Map(); // enemy ball -> view

  const state = {
    phase: 'aim',
    aiming: false,
    pointerId: null,
    pointer: new THREE.Vector3(),
    shots: 0,
    clears: 0,
    lives: CONFIG.hero.lives,
    entryHp: hero.hp, // HP when this level was entered; game over restores it
    taken: new Set(), // enemies that have acted this round
    patrollers: new Set(), // enemies allowed to patrol this round
    actor: null, // the enemy whose turn it is
    plan: null, // its move: { kind: 'lunge' } or { kind: 'patrol', vx, vz, target }
    timer: 0,
    waited: 0, // seconds the acting enemy has waited for the camera
  };

  let levelIndex = -1;
  let level = null;
  let world = null;
  let start = null;
  let levelView = null;

  const enemies = () => world.balls.filter((b) => b.kind === 'enemy');

  function loadLevel(i) {
    levelIndex = (i + levels.length) % levels.length;
    const def = levels[levelIndex];
    level = parseLevel(def.text, def.name);
    if (levelView) scene.remove(levelView);
    levelView = buildLevelView(level);
    scene.add(levelView);
    world = createWorld(level);
    world.balls.push(hero);

    for (const view of enemyViews.values()) {
      scene.remove(view.object);
      view.dispose();
    }
    enemyViews.clear();
    overlay.clearEnemies(hero);
    level.enemies.forEach((e, n) => {
      const enemy = createEnemy({ ...tileCenter(e), level: e.level, id: `enemy${n}` });
      world.balls.push(enemy);
      const view = createEnemyView(enemy, rig.toCamera);
      scene.add(view.object);
      enemyViews.set(enemy, view);
      overlay.addBar(enemy);
    });

    start = tileCenter(level.start);
    rig.setBounds(0, level.width, 0, level.height);
    state.entryHp = hero.hp;
    respawn();
    rig.snapTo(hero.x, hero.z);
    hud.setLives(state.lives, CONFIG.hero.lives);
  }

  /** Put the hero back at the start. The board is left exactly as it is. */
  function respawn({ heal = false } = {}) {
    hero.x = start.x;
    hero.z = start.z;
    hero.vx = hero.vz = 0;
    if (heal) hero.hp = hero.maxHp;
    heroView.snap();
    state.phase = 'aim';
    state.aiming = false;
    state.actor = null;
    aimView.hide();
  }

  // --- Input -----------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Grab test uses the ball's centre height so pressing on the visible ball works.
  const grabPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hero.radius);
  const canvas = renderer.domElement;
  const tmp = new THREE.Vector3();

  // The camera zooms out with shot power while you aim. Drags are measured
  // against a frozen copy of the view from when you pressed (in effect, in
  // screen pixels), so the zoom never feeds back into the shot's power.
  let aimCamera = null;

  function pointerOn(plane, e, out, camera = rig.camera) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, out);
  }

  canvas.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    if (state.phase !== 'aim' || state.aiming || e.button > 0) return;
    if (!pointerOn(grabPlane, e, tmp) || !canGrab(hero, { x: tmp.x, z: tmp.z })) return;
    state.aiming = true;
    state.pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    aimCamera = rig.camera.clone();
    aimCamera.updateMatrixWorld();
    rig.beginAim(hero);
    pointerOn(groundPlane, e, state.pointer, aimCamera);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.aiming || e.pointerId !== state.pointerId) return;
    pointerOn(groundPlane, e, state.pointer, aimCamera);
  });

  function endAim(e, fire) {
    if (!state.aiming || e.pointerId !== state.pointerId) return;
    state.aiming = false;
    aimView.hide();
    if (!fire || state.phase !== 'aim') return;
    pointerOn(groundPlane, e, state.pointer, aimCamera);
    const shot = shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z });
    if (shot.cancel || shot.speed <= CONFIG.physics.stopThreshold) return;
    hero.vx = shot.dirX * shot.speed;
    hero.vz = shot.dirZ * shot.speed;
    state.phase = 'shot';
    state.shots++;
    combat.beginShot();
    sfx.play('launch', 0.4 + 0.6 * shot.fill, { pitch: 0.9 + 0.2 * shot.fill });
  }
  canvas.addEventListener('pointerup', (e) => endAim(e, true));
  canvas.addEventListener('pointercancel', (e) => endAim(e, false));

  // --- Turns -----------------------------------------------------------------
  function startEnemyPhase() {
    state.taken = new Set();
    state.patrollers = pickPatrollers(enemies());
    nextTurn();
  }

  /** Hand the turn to the nearest enemy that hasn't acted; back to you when none are left. */
  function nextTurn() {
    for (;;) {
      if (state.phase === 'down') return;
      const actor = nextActor(enemies(), hero, state.taken);
      state.actor = actor;
      if (!actor) {
        state.phase = 'aim';
        return;
      }
      state.taken.add(actor);
      combat.beginEnemyTurn(actor);

      // Sight is rechecked now, since earlier moves this round can change it.
      if (canSee(level, actor, hero, world.balls)) {
        state.plan = { kind: 'lunge' };
        state.phase = 'enemyWait';
        state.timer = CONFIG.enemy.lungeTelegraph;
        state.waited = 0;
        return;
      }

      // Only this round's chosen half patrol; the rest sit it out, unseen.
      if (!state.patrollers.has(actor)) continue;
      const move = patrolMove(level, actor, world.balls);
      if (!move) continue; // boxed in: it stays put this turn
      state.plan = { kind: 'patrol', ...move };
      state.phase = 'enemyWait';
      state.timer = CONFIG.enemy.patrolDelay;
      state.waited = 0;
      return;
    }
  }

  function launchActor() {
    const { actor, plan } = state;
    if (plan.kind === 'lunge') {
      Object.assign(actor, lungeVelocity(actor, hero));
      sfx.play('lunge', 0.9);
    } else {
      actor.vx = plan.vx;
      actor.vz = plan.vz;
    }
    state.phase = 'enemyMove';
  }

  function knockedOut() {
    state.phase = 'down';
    state.timer = CONFIG.hero.downPause;
    state.aiming = false;
    aimView.hide();
    sfx.play('down', 0.9);
    hud.banner('Knocked out!', state.lives > 1 ? 'Back to the start' : 'Last life gone');
  }

  function afterKnockout() {
    state.lives--;
    if (state.lives > 0) {
      respawn({ heal: true });
      sfx.play('respawn', 0.8);
      hud.banner(`${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left`, 'The board stays as you left it', 1.4);
    } else {
      // Game over: the level starts from scratch, with the HP you entered it with.
      state.lives = CONFIG.hero.lives;
      hero.hp = state.entryHp;
      sfx.play('gameover', 0.9);
      loadLevel(levelIndex);
      hud.banner('Game over', 'The level starts over', 2);
    }
    hud.setLives(state.lives, CONFIG.hero.lives);
  }

  // Reaching the exit ends the run at once, even mid-roll. For now there is
  // one level, so it starts over: hero back at the start, enemies reset.
  // HP and lives carry over, as they would between levels.
  function reachExit() {
    state.clears++;
    sfx.play('exit', 0.8);
    loadLevel(levelIndex);
    hud.banner('Exit!', 'The hall starts over', 1.2);
  }

  // --- Events ------------------------------------------------------------------
  function handleEvents(outcomes) {
    const A = CONFIG.audio;
    const damaging = new Set(outcomes.map((o) => o.event).filter(Boolean));
    for (const ev of world.events) {
      const loud = Math.min(1, ev.speed / CONFIG.aim.maxLaunchSpeed);
      if (ev.type === 'wall' && ev.speed >= A.minWallSoundSpeed) {
        sfx.play('wall', 0.25 + 0.75 * loud, { pitch: 0.9 + Math.random() * 0.2, minInterval: A.minWallSoundInterval });
      } else if (ev.type === 'ball' && !damaging.has(ev)) {
        sfx.play('ball', 0.3 + 0.7 * loud);
      }
    }
    world.events.length = 0;

    const floatAt = (ball, text, cls) => overlay.float(text, ball.x, ball.z, ball.radius * 2 + 0.2, cls);
    let comboSounded = false;
    for (const o of outcomes) {
      if (o.type === 'hit') {
        sfx.play('hit', 0.9, { pitch: 0.95 + Math.random() * 0.1 });
        floatAt(o.target, `-${o.amount}`);
      } else if (o.type === 'combo') {
        if (!comboSounded) sfx.play('combo', 0.9);
        comboSounded = true;
        floatAt(o.target, `-${o.amount}`, 'combo');
      } else if (o.type === 'kill') {
        sfx.play('kill', 0.9);
        enemyViews.get(o.target)?.die();
        overlay.removeBar(o.target);
      } else if (o.type === 'hurt') {
        sfx.play('hurt', 1);
        floatAt(hero, `-${o.amount}`, 'hurt');
        if (hero.hp <= 0) knockedOut();
      }
    }
  }

  // --- Camera ------------------------------------------------------------------
  /**
   * What the camera should keep in view right now: every moving ball, so no
   * collision or combo happens off screen; the enemy whose turn it is (and,
   * for a lunge, you, or for a patrol, where it's heading); otherwise you.
   */
  function framingPoints() {
    const moving = world.balls.filter((b) => b.vx !== 0 || b.vz !== 0);
    const { actor, plan } = state;
    switch (state.phase) {
      case 'enemyWait':
        return plan.kind === 'lunge' ? [actor, hero] : [actor, plan.target];
      case 'enemyMove':
        return moving.includes(actor) ? moving : [actor, ...moving];
      case 'shot':
        return moving.length ? moving : [hero];
      default:
        return [hero];
    }
  }

  // --- Debug overlay -----------------------------------------------------------
  const debug = document.createElement('pre');
  debug.className = 'debug';
  debug.hidden = !new URLSearchParams(location.search).has('debug');
  container.appendChild(debug);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === '`') debug.hidden = !debug.hidden;
    if (e.key === 'r' && state.phase === 'aim') respawn();
    if (e.key === 'n') loadLevel(levelIndex + 1);
  });

  // --- Layout ------------------------------------------------------------------
  // The column is sized in CSS (portrait aspect, capped at the window width);
  // the renderer follows the container's real size, so it self-corrects even
  // if the page is resized without a window resize event.
  container.style.setProperty('--max-aspect', CONFIG.render.maxAspect);
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    rig.setAspect(w / h);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // --- Loop --------------------------------------------------------------------
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
      handleEvents(combat.resolve(world, hero));
      if (state.phase !== 'down' && tileAt(level, Math.floor(hero.x), Math.floor(hero.z)) === 'exit') {
        reachExit();
        break;
      }
      acc -= step;
      steps++;
    }
    if (steps === CONFIG.physics.maxStepsPerFrame) acc = 0;

    switch (state.phase) {
      case 'shot':
        if (isAtRest(world)) startEnemyPhase();
        break;
      case 'enemyWait':
        // The enemy moves once its telegraph is done and the camera has
        // reached it (or it has waited long enough).
        state.timer -= dt;
        state.waited += dt;
        if (state.timer <= 0 && (rig.settled || state.waited >= CONFIG.enemy.enemyTurnMaxWait)) launchActor();
        break;
      case 'enemyMove':
        if (isAtRest(world)) nextTurn();
        break;
      case 'down':
        state.timer -= dt;
        if (state.timer <= 0 && isAtRest(world)) afterKnockout();
        break;
    }

    if (state.aiming) {
      const shot = shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z });
      const others = world.balls.filter((b) => b !== hero);
      const preview = shot.cancel ? null : previewPath(level, hero, shot.dirX, shot.dirZ, shot.speed, others);
      aimView.show(hero, shot, preview, rig.viewWidth / rig.aimStartWidth);
    } else if (state.phase === 'aim') {
      aimView.showTurn(hero, dt);
    } else {
      aimView.hide();
    }

    heroView.update();
    for (const [enemy, view] of enemyViews) {
      view.update(dt);
      if (view.gone) {
        scene.remove(view.object);
        view.dispose();
        enemyViews.delete(enemy);
      }
    }

    // "!" over every enemy that can see you right now, even mid-shot.
    const acting = state.phase === 'enemyWait' || state.phase === 'enemyMove' ? state.actor : null;
    for (const enemy of enemies()) {
      const lunging = enemy === acting && state.plan?.kind === 'lunge';
      overlay.setAlert(enemy, lunging || canSee(level, enemy, hero, world.balls), lunging);
    }

    if (state.aiming) {
      // Aiming: zoom out with shot power, anchored on the ball.
      const fill = shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z }).fill;
      const from = rig.aimStartWidth;
      rig.aimZoom(hero, from + (Math.max(from, CONFIG.camera.aimMaxWidth) - from) * fill, dt);
    } else {
      rig.frame(framingPoints(), rig.speedWidth(speedOf(hero)), dt);
    }
    renderer.render(scene, rig.camera);
    overlay.update();

    if (!debug.hidden) {
      debug.textContent = [
        `${level.name}  ${fps.toFixed(0)} fps`,
        `phase  ${state.aiming ? 'aiming' : state.phase}${state.actor ? ` (${state.actor.id})` : ''}`,
        `hero   ${hero.x.toFixed(2)}, ${hero.z.toFixed(2)}  hp ${hero.hp}/${hero.maxHp}  lives ${state.lives}`,
        `speed  ${speedOf(hero).toFixed(2)} tiles/s`,
        `view   ${rig.viewWidth.toFixed(2)} units`,
        `shots  ${state.shots}   exits  ${state.clears}`,
        `enemies ${enemies().length} left`,
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
