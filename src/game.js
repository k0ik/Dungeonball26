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
//   won        you cleared the last level; the run-complete screen is up
//
// Levels (M6): the exit loads the next level. HP, gear, lives and gold carry
// over; keys don't. After the last level the run starts over.

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
import { createTurnRing } from './render/turnRing.js';
import { createOverlay } from './render/overlay.js';
import { createHud } from './render/hud.js';
import { createAimView } from './render/aimView.js';
import { createCameraRig } from './render/cameraRig.js';
import { createAudio } from './audio.js';
import { createObjects, resolveObjects } from './objects.js';
import { rollLoot, canCollect, collect, useSwordHit } from './loot.js';
import { createObjectsView } from './render/objectsView.js';
import { createItemsView } from './render/itemsView.js';
import { createDoorsView } from './render/doorsView.js';
import { openDoors } from './doors.js';

/** levels: [{ id, name, text }]. */
export function createGame(container, levels, startIndex = 0) {
  // --- Rendering -----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true }); // stencil: the pickup x-ray mask
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
  Object.assign(hero, { atk: CONFIG.hero.atk, maxHp: CONFIG.hero.maxHp, hp: CONFIG.hero.maxHp, shield: false, swordHits: 0 });
  const heroView = createBallView(hero, { color: CONFIG.colors.hero, stripe: CONFIG.colors.heroStripe, silver: true, toCamera: rig.toCamera });
  scene.add(heroView.object);
  overlay.addBar(hero, 'hero');

  const aimView = createAimView(rig.yaw);
  scene.add(aimView.object);
  // Red dashed ring under the enemy whose turn it is, so you know where to look.
  const actorRing = createTurnRing(CONFIG.colors.enemyTurnRing);
  scene.add(actorRing.object);

  const combat = createCombat();
  const objectsView = createObjectsView(scene);
  const itemsView = createItemsView(scene);
  const doorsView = createDoorsView(scene);
  const enemyViews = new Map(); // enemy ball -> view

  const state = {
    phase: 'aim',
    aiming: false,
    ouch: 0, // seconds left on the hero's "ouch" face
    pointerId: null,
    pointer: new THREE.Vector3(),
    shots: 0,
    clears: 0,
    lives: CONFIG.hero.lives,
    gold: 0, // the score
    keys: [], // colours of the keys you hold; this level only
    entry: null, // HP, gear and gold when this level was entered; game over restores them
    taken: new Set(), // enemies that have acted this round
    patrollers: new Set(), // enemies allowed to patrol this round
    actor: null, // the enemy whose turn it is
    plan: null, // its move: { kind: 'lunge' } or { kind: 'patrol', vx, vz, target }
    timer: 0,
    waited: 0, // seconds the acting enemy has waited for the camera
    comboKillAt: -Infinity, // when the last "Combo Kill!" banner showed
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
    world.statics = createObjects(level);
    // Floor pickups: kill coins, barrel loot, and the level's keys.
    world.items = level.keys.map((k) => ({ kind: 'key', color: k.color, ...tileCenter(k) }));
    state.keys = []; // unused keys don't carry over (and a game over takes them back)
    objectsView.build(world.statics);
    doorsView.build(level.doors);

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
    state.entry = { hp: hero.hp, atk: hero.atk, shield: hero.shield, swordHits: hero.swordHits, gold: state.gold };
    respawn();
    rig.snapTo(hero.x, hero.z);
  }

  /** Put the hero back at the start. The board is left exactly as it is. */
  function respawn({ heal = false } = {}) {
    hero.x = start.x;
    hero.z = start.z;
    hero.vx = hero.vz = 0;
    if (heal) hero.hp = hero.maxHp;
    state.ouch = 0;
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
      if (canSee(level, actor, hero, world.balls, world.statics)) {
        state.plan = { kind: 'lunge' };
        state.phase = 'enemyWait';
        state.timer = Math.max(CONFIG.enemy.lungeTelegraph, CONFIG.enemy.turnRingBeat);
        state.waited = 0;
        return;
      }

      // Only this round's chosen half patrol; the rest sit it out, unseen.
      if (!state.patrollers.has(actor)) continue;
      const move = patrolMove(level, actor, world.balls, Math.random, world.statics);
      if (!move) continue; // boxed in: it stays put this turn
      state.plan = { kind: 'patrol', ...move };
      state.phase = 'enemyWait';
      state.timer = Math.max(CONFIG.enemy.patrolDelay, CONFIG.enemy.turnRingBeat);
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

  // Death screen: input is blocked and the screen darkens for
  // deathScreenSeconds. The respawn (or game-over restart) happens under it,
  // just before it lightens, and play carries on.
  function knockedOut() {
    state.phase = 'down';
    state.timer = CONFIG.hero.deathScreenSeconds;
    state.aiming = false;
    aimView.hide();
    const left = state.lives - 1;
    sfx.play(left > 0 ? 'down' : 'gameover', 0.9);
    hud.showScreen('You Died!', left > 0 ? `${left} ${left === 1 ? 'life remains' : 'lives remain'}` : 'Game Over');
  }

  function afterKnockout() {
    for (const b of world.balls) b.vx = b.vz = 0; // anything still rolling stops under the dark screen
    state.lives--;
    if (state.lives > 0) {
      respawn({ heal: true });
    } else {
      // Game over: the level starts from scratch, with the HP, gear and gold
      // you entered it with.
      state.lives = CONFIG.hero.lives;
      const { hp, atk, shield, swordHits, gold } = state.entry;
      Object.assign(hero, { hp, atk, shield, swordHits });
      state.gold = gold;
      loadLevel(levelIndex);
    }
    rig.snapTo(hero.x, hero.z);
    hud.hideScreen();
    sfx.play('respawn', 0.8);
  }

  /** Short banner naming the level just entered. */
  function levelBanner() {
    hud.banner(levels[levelIndex].name, `Level ${levelIndex + 1} of ${levels.length}`, 1.8);
  }

  // Reaching the exit ends the level at once, even mid-roll, and loads the
  // next one. HP, gear, lives and gold carry over. After the last level the
  // run is complete: a screen shows your gold, then the run starts over.
  function reachExit() {
    state.clears++;
    if (levelIndex + 1 < levels.length) {
      sfx.play('exit', 0.8);
      loadLevel(levelIndex + 1);
      levelBanner();
      return;
    }
    for (const b of world.balls) b.vx = b.vz = 0;
    state.phase = 'won';
    state.timer = CONFIG.hero.runCompleteSeconds;
    state.aiming = false;
    aimView.hide();
    sfx.play('win', 0.9);
    hud.showScreen('Run Complete!', `${state.gold} gold`, 'win');
  }

  /** A fresh run from level 1: full HP, no gear, 3 lives, no gold. */
  function newRun() {
    Object.assign(hero, { atk: CONFIG.hero.atk, maxHp: CONFIG.hero.maxHp, hp: CONFIG.hero.maxHp, shield: false, swordHits: 0 });
    state.lives = CONFIG.hero.lives;
    state.gold = 0;
    loadLevel(0);
    hud.hideScreen();
    levelBanner();
  }

  // --- Events ------------------------------------------------------------------
  /** Barrel loot lands on the floor where the barrel stood; roll over it to take it. */
  function dropLoot(x, z) {
    world.items.push({ ...rollLoot(), x, z });
  }

  /** The ball labels about you should follow, or null to leave them in place (config). */
  const heroFollow = () => (CONFIG.render.heroLabelsFollowBall ? hero : null);

  const PICKUP_SOUND = { gold: 'coin', coins: 'coin', potion: 'potion', superPotion: 'potion', shield: 'gear', sword: 'gear', oneUp: 'oneUp', key: 'key' };
  const PICKUP_STYLE = { gold: 'gold', coins: 'gold', potion: 'heal', superPotion: 'heal', shield: 'gear', sword: 'gear', oneUp: 'gear', key: 'gear' };

  function pickUp(item) {
    const label = collect(item, hero, state);
    sfx.play(PICKUP_SOUND[item.kind], 0.8);
    overlay.float(label, hero.x, hero.z, hero.radius * 2 + 0.8, PICKUP_STYLE[item.kind], heroFollow());
  }

  /** A door opens when you come close holding its key. */
  function checkDoors() {
    // noKeys: the Locksmith card (M7) will turn this on.
    for (const door of openDoors(level, hero, state.keys, { noKeys: false })) {
      doorsView.open(door);
      sfx.play('door', 1);
      overlay.float('Unlocked!', door.col + 0.5, door.row + 0.5, CONFIG.render.wallHeight + 0.3, 'gear');
    }
  }

  /** Roll over a floor item to take it, once you can use it. */
  function checkPickups() {
    const reach = hero.radius + CONFIG.objects.itemRadius;
    for (const item of [...world.items]) {
      if (Math.hypot(item.x - hero.x, item.z - hero.z) > reach || !canCollect(item, hero)) continue;
      world.items.splice(world.items.indexOf(item), 1);
      pickUp(item);
    }
  }

  /** Barrels, chests and red barrels. */
  function handleObjects(outcomes) {
    for (const o of outcomes) {
      const { obj } = o;
      if (o.type === 'crack') {
        sfx.play('crack', 0.8, { pitch: 0.9 + 0.15 * o.stage });
        objectsView.crack(obj, o.stage);
      } else if (o.type === 'break') {
        sfx.play('break', 0.9);
        objectsView.remove(obj);
        dropLoot(obj.x, obj.z);
      } else if (o.type === 'open') {
        sfx.play('chest', 0.9);
        objectsView.openChest(obj);
        state.gold += o.gold;
        // Over the ball (always on screen), not the chest, which may not be.
        overlay.float(`+${o.gold}`, hero.x, hero.z, hero.radius * 2 + 0.8, 'gold', heroFollow());
      } else if (o.type === 'explode') {
        sfx.play('explode', 1);
        objectsView.remove(obj);
        objectsView.blast(obj.x, obj.z);
        handleOutcomes(combat.explosion(world, o.victim, hero));
      }
    }
  }

  function handleEvents(outcomes, objectOutcomes = []) {
    const A = CONFIG.audio;
    const damaging = new Set(outcomes.map((o) => o.event).filter(Boolean));
    const objectHits = new Set(objectOutcomes.map((o) => o.obj));
    for (const ev of world.events) {
      const loud = Math.min(1, ev.speed / CONFIG.aim.maxLaunchSpeed);
      const bump = ev.type === 'wall' || (ev.type === 'static' && !objectHits.has(ev.obj));
      if (bump && ev.speed >= A.minWallSoundSpeed) {
        sfx.play('wall', 0.25 + 0.75 * loud, { pitch: 0.9 + Math.random() * 0.2, minInterval: A.minWallSoundInterval });
      } else if (ev.type === 'ball' && !damaging.has(ev)) {
        sfx.play('ball', 0.3 + 0.7 * loud);
      }
    }
    world.events.length = 0;
    handleOutcomes(outcomes);
    handleObjects(objectOutcomes);
  }

  function handleOutcomes(outcomes) {
    // Labels about you ride along above your ball; labels over enemies stay put.
    const floatAt = (ball, text, cls, lift = 0) =>
      overlay.float(text, ball.x, ball.z, ball.radius * 2 + 0.2 + lift, cls, ball === hero ? heroFollow() : null);
    let comboSounded = false;
    for (const o of outcomes) {
      if (o.type === 'hit' || o.type === 'combo') {
        if (o.type === 'hit') {
          sfx.play('hit', 0.9, { pitch: 0.95 + Math.random() * 0.1 });
          // Each of your hits wears the sword: whole -> broken -> gone.
          const sword = useSwordHit(hero);
          if (sword === 'broken') floatAt(hero, 'Sword cracked', 'gear', 0.8);
          else if (sword === 'gone') {
            floatAt(hero, 'Sword broke!', 'gear', 0.8);
            sfx.play('blocked', 0.6, { pitch: 0.8 });
          }
        }
        else if (!comboSounded) {
          sfx.play('combo', 0.9);
          comboSounded = true;
        }
        floatAt(o.target, `-${o.amount}`, o.type === 'combo' ? 'combo' : '');
        // Every enemy after the first one damaged this shot is a combo.
        if (o.chain >= 2) floatAt(o.target, 'Combo!', 'combo-label', 0.8);
      } else if (o.type === 'blast') {
        floatAt(o.target, `-${o.amount}`, 'hurt');
      } else if (o.type === 'kill') {
        sfx.play('kill', 0.9);
        enemyViews.get(o.target)?.die();
        overlay.removeBar(o.target);
        // A kill drops coins worth the enemy's level where it died.
        world.items.push({ kind: 'coins', value: o.target.level * CONFIG.loot.killGoldPerLevel, x: o.target.x, z: o.target.z });
        if (o.shotKills >= 2 && state.phase === 'shot') {
          sfx.play('comboKill', 0.9);
          state.comboKillAt = performance.now();
          hud.banner(o.shotKills > 2 ? `Combo Kill ×${o.shotKills}!` : 'Combo Kill!', 'Bonus turn: shoot again', 2);
        }
      } else if (o.type === 'hurt') {
        sfx.play('hurt', 1);
        heroView.flash();
        state.ouch = CONFIG.render.heroOuchSeconds;
        floatAt(hero, `-${o.amount}`, 'hurt');
        if (hero.hp <= 0 && state.phase !== 'down') knockedOut();
      } else if (o.type === 'blocked') {
        sfx.play('blocked', 1);
        floatAt(hero, 'Blocked!', 'gear');
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
    if (e.key === 'n' && state.phase !== 'won') {
      loadLevel(levelIndex + 1);
      levelBanner();
    }
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
      // Both read this step's events before handleEvents clears them.
      const outcomes = combat.resolve(world, hero);
      handleEvents(outcomes, resolveObjects(world, hero));
      checkPickups();
      checkDoors();
      if (state.phase !== 'down' && state.phase !== 'won' && tileAt(level, Math.floor(hero.x), Math.floor(hero.z)) === 'exit') {
        reachExit();
        break;
      }
      acc -= step;
      steps++;
    }
    if (steps === CONFIG.physics.maxStepsPerFrame) acc = 0;

    switch (state.phase) {
      case 'shot':
        if (isAtRest(world)) {
          // A combo kill (2+ enemies in one shot) earns a bonus turn: the
          // enemy phase is skipped and you shoot again.
          if (combat.shotKills >= 2) {
            state.phase = 'aim';
            // The "Combo Kill!" banner already announced the bonus turn; only
            // remind you if the shot rolled on long after it.
            if (performance.now() - state.comboKillAt > CONFIG.render.bonusReminderAfter * 1000) {
              hud.banner('Bonus turn!', 'Shoot again', 1.3);
            }
            sfx.play('respawn', 0.7);
          } else {
            startEnemyPhase();
          }
        }
        break;
      case 'enemyWait':
        // The camera travels to the enemy first (or gives up after
        // enemyTurnMaxWait); then its red ring (and "!", for a lunge) stays
        // on screen for its telegraph before it moves.
        state.waited += dt;
        if (rig.settled || state.waited >= CONFIG.enemy.enemyTurnMaxWait) state.timer -= dt;
        if (state.timer <= 0) launchActor();
        break;
      case 'enemyMove':
        if (isAtRest(world)) nextTurn();
        break;
      case 'down':
        state.timer -= dt;
        if (state.timer <= 0) afterKnockout();
        break;
      case 'won':
        state.timer -= dt;
        if (state.timer <= 0) newRun();
        break;
    }

    if (state.aiming) {
      const shot = shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z });
      const others = world.balls.filter((b) => b !== hero);
      const preview = shot.cancel ? null : previewPath(level, hero, shot.dirX, shot.dirZ, shot.speed, others, world.statics);
      aimView.show(hero, shot, preview, rig.viewWidth / rig.aimStartWidth);
    } else if (state.phase === 'aim') {
      aimView.showTurn(hero, dt);
    } else {
      aimView.hide();
    }
    // The acting enemy's red ring: from its telegraph until its move ends.
    if ((state.phase === 'enemyWait' || state.phase === 'enemyMove') && state.actor) actorRing.show(state.actor, dt);
    else actorRing.hide();

    // Face: ouch just after a hit (and while down), determined while you aim
    // and while your shot rolls, confident otherwise.
    state.ouch = Math.max(0, state.ouch - dt);
    heroView.setExpression(
      state.ouch > 0 || state.phase === 'down' ? 'ouch' : state.aiming || state.phase === 'shot' ? 'determined' : 'confident',
    );
    heroView.update(dt);
    objectsView.update(dt);
    doorsView.update(dt);
    objectsView.fadeChests(hero, state.aiming, dt);
    itemsView.sync(world.items);
    itemsView.update(dt);
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
      const aware = lunging || canSee(level, enemy, hero, world.balls, world.statics);
      overlay.setAlert(enemy, aware, lunging);
      enemyViews.get(enemy)?.setAngry(aware);
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
    hud.setGold(state.gold);
    hud.setKeys(state.keys);
    // Whose turn it is, always shown: yours while you aim and your shot rolls,
    // the enemies' from the first enemy move until it's back to you.
    hud.setTurn(['enemyWait', 'enemyMove', 'down'].includes(state.phase) ? 'enemy' : 'player');
    overlay.setGear(hero, {
      sword: hero.swordHits >= CONFIG.loot.swordUses ? 'whole' : hero.swordHits > 0 ? 'broken' : null,
      shield: hero.shield,
    });

    if (!debug.hidden) {
      debug.textContent = [
        `${level.name}  ${fps.toFixed(0)} fps`,
        `phase  ${state.aiming ? 'aiming' : state.phase}${state.actor ? ` (${state.actor.id})` : ''}`,
        `hero   ${hero.x.toFixed(2)}, ${hero.z.toFixed(2)}  hp ${hero.hp}/${hero.maxHp}  lives ${state.lives}`,
        `speed  ${speedOf(hero).toFixed(2)} tiles/s`,
        `view   ${rig.viewWidth.toFixed(2)} units`,
        `shots  ${state.shots}   exits  ${state.clears}`,
        `enemies ${enemies().length} left   gold ${state.gold}   atk ${hero.atk}${hero.swordHits ? ` (sword ${hero.swordHits})` : ''}${hero.shield ? '  shield' : ''}`,
        `[d] debug  [r] respawn  [n] next level`,
      ].join('\n');
    }

    requestAnimationFrame(frame);
  }
  loadLevel(startIndex);
  levelBanner();
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
    heroView,
    objectsView,
    state,
    rig,
    respawn,
    loadLevel,
  };
}
