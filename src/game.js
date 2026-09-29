// The game loop and turn manager (design doc: "Core loop and turn structure").
//
// A round: you aim and shoot; once everything is at rest, the enemies move,
// all at once: any that can see you lunge, a random half of the rest patrol.
// Then everything settles and it's your shot again. If your HP hits 0 you
// lose a life and respawn at the start, and the round ends there.
//
// Phases:
//   aim        at rest, input open
//   shot       your ball (and whatever it knocked) is rolling
//   enemyWait  the enemies' short telegraph before they all move at once
//   enemyMove  the enemies' moves are rolling
//   down       you were knocked out; waiting to respawn
//   won        you cleared the last level; the run-complete screen is up
//
// Levels (M6): the exit loads the next level. HP, gear, lives and gold carry
// over; keys don't. After the last level the run starts over.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { parseLevel, tileCenter, tileAt, coinStrips } from './level.js';
import { createWorld, createBall, stepWorld, isAtRest, speedOf, overlapsSolid } from './physics.js';
import { createCombat, createEnemy } from './combat.js';
import { canSee } from './sight.js';
import { lungeVelocity, patrolMove, pickPatrollers } from './turns.js';
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
import { rollLoot, rollEnemyDrops, canCollect, collect, useSwordHit } from './loot.js';
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
  const heroView = createBallView(hero, { color: CONFIG.colors.hero, silver: true, toCamera: rig.toCamera });
  scene.add(heroView.object);
  overlay.addBar(hero, 'hero');

  const aimView = createAimView(rig.yaw);
  scene.add(aimView.object);
  // Red dashed rings under the enemies about to move, so you know where to look.
  const actorRings = new Map(); // enemy -> ring

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
    strips: [], // this level's coin strips: { size, thisShot }
    shotCoins: 0, // strip coins taken this shot (the tick's pitch)
    keys: [], // colours of the keys you hold; this level only
    entry: null, // HP, gear and gold when this level was entered; game over restores them
    moves: [], // this enemy phase: { enemy, kind: 'lunge' } or { enemy, kind: 'patrol', vx, vz, target }
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
    // Floor pickups: kill coins, barrel loot, the level's keys and its coin strips.
    world.items = level.keys.map((k) => ({ kind: 'key', color: k.color, ...tileCenter(k) }));
    state.strips = coinStrips(level).map((coins) => {
      const strip = { size: coins.length, thisShot: 0 };
      for (const c of coins) world.items.push({ kind: 'coin', value: CONFIG.loot.stripCoinValue, strip, ...tileCenter(c) });
      return strip;
    });
    state.shotCoins = 0;
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
    state.moves = [];
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
    state.shownShot = null; // nothing shown yet for this drag
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
    // Fire exactly the shot the preview last showed. Re-reading the release
    // point instead lets a finger's lift-off jitter nudge the angle, which a
    // long bank shot turns into a visible miss.
    let shot = state.shownShot;
    if (!shot) {
      pointerOn(groundPlane, e, state.pointer, aimCamera);
      shot = shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z });
    }
    if (shot.cancel || shot.speed <= CONFIG.physics.stopThreshold) return;
    hero.vx = shot.dirX * shot.speed;
    hero.vz = shot.dirZ * shot.speed;
    state.phase = 'shot';
    state.shots++;
    combat.beginShot();
    // A new shot: strip sweeps and the coin tick's pitch start over.
    for (const strip of state.strips) strip.thisShot = 0;
    state.shotCoins = 0;
    sfx.play('launch', 0.4 + 0.6 * shot.fill, { pitch: 0.9 + 0.2 * shot.fill });
  }
  canvas.addEventListener('pointerup', (e) => endAim(e, true));
  canvas.addEventListener('pointercancel', (e) => endAim(e, false));

  // --- Turns -----------------------------------------------------------------
  // The enemy phase is simultaneous. Once your shot is at rest, every enemy
  // decides at once from the board as your shot left it: any that can see you
  // will lunge, a random half of the rest patrol, and the others stay put.
  // After a short telegraph (red rings, "!"), they all launch together, and
  // it's your turn again once everything is at rest.
  function startEnemyPhase() {
    const patrollers = pickPatrollers(enemies());
    const moves = [];
    const claimed = []; // patrol destinations already taken this round
    for (const enemy of enemies()) {
      const from = { x: enemy.x, z: enemy.z }; // where it stands as the phase starts (camera framing)
      if (canSee(level, enemy, hero, world.balls, world.statics)) {
        moves.push({ enemy, from, kind: 'lunge' });
      } else if (patrollers.has(enemy)) {
        const move = patrolMove(level, enemy, [...world.balls, ...claimed], Math.random, world.statics);
        if (!move) continue; // boxed in: it stays put
        moves.push({ enemy, from, kind: 'patrol', ...move });
        claimed.push({ x: move.target.x, z: move.target.z, radius: enemy.radius });
      }
    }
    state.moves = moves;
    if (!moves.length) {
      state.phase = 'aim';
      return;
    }
    combat.beginEnemyTurn(moves.map((m) => m.enemy));
    const lunge = moves.some((m) => m.kind === 'lunge');
    state.phase = 'enemyWait';
    state.timer = Math.max(lunge ? CONFIG.enemy.lungeTelegraph : CONFIG.enemy.patrolDelay, CONFIG.enemy.turnRingBeat);
    state.waited = 0;
  }

  function launchEnemies() {
    let lunged = false;
    for (const m of state.moves) {
      if (m.enemy.hp <= 0) continue;
      if (m.kind === 'lunge') {
        Object.assign(m.enemy, lungeVelocity(m.enemy, hero));
        lunged = true;
      } else {
        m.enemy.vx = m.vx;
        m.enemy.vz = m.vz;
      }
    }
    if (lunged) sfx.play('lunge', 0.9);
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
  /**
   * Barrel loot lands on the floor where the barrel stood; roll over it to
   * take it. Gold comes out as that many single coins, scattered.
   */
  function dropLoot(x, z) {
    const loot = rollLoot();
    if (loot.kind === 'gold') scatterCoins(x, z, loot.value);
    else world.items.push({ ...loot, x, z });
  }

  /**
   * Throw `n` single coins (the same coins as strips), plus any `extras`
   * (other pickups), out from (x, z): each flies to a random clear spot at a
   * random distance, with a random arc height and flight time, so they land
   * one after another, and bounces once. A spot is clear if the item fits
   * there and the way to it crosses no wall, door or bumper; after a few
   * misses it just drops close by.
   */
  function scatterCoins(x, z, n, extras = []) {
    const L = CONFIG.loot;
    const r = CONFIG.objects.itemRadius;
    const blocked = (px, pz) =>
      overlapsSolid(level, px, pz, r) || world.statics.some((s) => Math.hypot(s.x - px, s.z - pz) < (s.radius ?? Math.hypot(s.halfX, s.halfZ)) + r);
    const rand = (a, b) => a + Math.random() * (b - a);
    const items = [...Array.from({ length: n }, () => ({ kind: 'coin', value: 1 })), ...extras.map((kind) => ({ kind }))];
    for (const item of items) {
      let to = null;
      for (let tries = 0; tries < 12 && !to; tries++) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(L.scatterMin, L.scatterMax);
        const tx = x + Math.cos(a) * d;
        const tz = z + Math.sin(a) * d;
        let clear = true;
        for (let k = 1; k <= 6 && clear; k++) clear = !blocked(x + (tx - x) * (k / 6), z + (tz - z) * (k / 6));
        if (clear) to = { x: tx, z: tz };
      }
      to ??= { x: x + rand(-0.15, 0.15), z: z + rand(-0.15, 0.15) };
      world.items.push({
        ...item,
        x,
        z,
        fly: { fromX: x, fromZ: z, toX: to.x, toZ: to.z, t: 0, dur: rand(L.scatterTimeMin, L.scatterTimeMax), height: rand(L.scatterHeightMin, L.scatterHeightMax) },
      });
    }
  }

  /** Move flying coins along their arcs; a coin can be taken once it has landed. */
  function updateFlyingCoins(dt) {
    for (const item of world.items) {
      const f = item.fly;
      if (!f) continue;
      f.t += dt;
      // Across the ground during the first arc; the bounce lands on the spot.
      const k = Math.min(1, f.t / (f.dur * CONFIG.loot.scatterBounceAt));
      item.x = f.fromX + (f.toX - f.fromX) * k;
      item.z = f.fromZ + (f.toZ - f.fromZ) * k;
      if (f.t >= f.dur) {
        delete item.fly;
        sfx.play('coin', 0.12, { pitch: 1.6 + Math.random() * 0.4, minInterval: 0.05 }); // a faint tink as it settles
      }
    }
  }

  /** The ball labels about you should follow, or null to leave them in place (config). */
  const heroFollow = () => (CONFIG.render.heroLabelsFollowBall ? hero : null);

  const PICKUP_SOUND = { potion: 'potion', superPotion: 'potion', shield: 'gear', sword: 'gear', oneUp: 'oneUp', key: 'key' };
  const PICKUP_STYLE = { potion: 'heal', superPotion: 'heal', shield: 'gear', sword: 'gear', oneUp: 'gear', key: 'gear' };

  function pickUp(item) {
    if (item.kind === 'coin') {
      pickUpStripCoin(item);
      return;
    }
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

  /**
   * A single coin: no label (a run of them would spam), just a tick that
   * rises in pitch with each coin this shot. Taking a whole strip within one
   * of your shots is a Clean Sweep, which pays a bonus. (Scattered coins
   * belong to no strip.)
   */
  function pickUpStripCoin(item) {
    collect(item, hero, state);
    itemsView.popCoin(item.x, item.z);
    state.shotCoins++;
    sfx.play('coin', 0.45, { pitch: Math.min(2, 0.9 + 0.07 * state.shotCoins) });
    const strip = item.strip;
    if (!strip) return;
    if (state.phase !== 'shot') {
      strip.thisShot = -Infinity; // picked up outside your shot: no sweep for this strip
      return;
    }
    strip.thisShot++;
    if (strip.thisShot === strip.size && strip.size >= CONFIG.loot.sweepMinCoins) {
      state.gold += CONFIG.loot.sweepBonus;
      sfx.play('sweep', 0.8);
      overlay.float(`Clean Sweep! +${CONFIG.loot.sweepBonus}`, hero.x, hero.z, hero.radius * 2 + 0.8, 'gold', heroFollow());
    }
  }

  /** Roll over a floor item to take it, once you can use it. */
  function checkPickups() {
    const reach = hero.radius + CONFIG.objects.itemRadius;
    for (const item of [...world.items]) {
      if (item.fly || Math.hypot(item.x - hero.x, item.z - hero.z) > reach || !canCollect(item, hero)) continue;
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
        itemsView.chestCoins(obj.x, 0.35, obj.z, o.gold); // one spinning coin per gold, popping out
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
        // A kill scatters coins worth the enemy's level around where it died,
        // and now and then a sword, shield or potion too.
        scatterCoins(o.target.x, o.target.z, o.target.level * CONFIG.loot.killGoldPerLevel, rollEnemyDrops());
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
   * What the camera should keep in view right now: during your shot, every
   * moving ball, so no collision or combo happens off screen; otherwise you
   * (the enemy phase included: it just pulls out a bit, see the frame call).
   */
  function framingPoints() {
    const moving = world.balls.filter((b) => b.vx !== 0 || b.vz !== 0);
    switch (state.phase) {
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
        if (state.timer <= 0) launchEnemies();
        break;
      case 'enemyMove':
        if (isAtRest(world)) {
          state.moves = [];
          state.phase = 'aim';
        }
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
      state.shownShot = shot; // what release will fire
      const others = world.balls.filter((b) => b !== hero);
      const preview = shot.cancel ? null : previewPath(level, hero, shot.dirX, shot.dirZ, shot.speed, others, world.statics);
      aimView.show(hero, shot, preview, rig.viewWidth / rig.aimStartWidth);
    } else if (state.phase === 'aim') {
      aimView.showTurn(hero, dt);
    } else {
      aimView.hide();
    }
    // Red rings under every enemy moving this round, from the telegraph until the moves end.
    const ringed = new Set(state.phase === 'enemyWait' || state.phase === 'enemyMove' ? state.moves.map((m) => m.enemy) : []);
    for (const enemy of ringed) {
      if (enemy.hp <= 0) continue;
      if (!actorRings.has(enemy)) {
        const ring = createTurnRing(CONFIG.colors.enemyTurnRing);
        scene.add(ring.object);
        actorRings.set(enemy, ring);
      }
      // Grown with the zoom so they keep their size on screen when the camera pulls out.
      actorRings.get(enemy).object.scale.setScalar(Math.max(1, rig.viewWidth / CONFIG.camera.baseViewWidth));
      actorRings.get(enemy).show(enemy, dt);
    }
    for (const [enemy, ring] of actorRings) {
      if (ringed.has(enemy) && enemy.hp > 0) continue;
      scene.remove(ring.object);
      actorRings.delete(enemy);
    }

    // Face: ouch just after a hit (and while down), worried through the enemy
    // turn, determined while you aim and while your shot rolls, confident otherwise.
    state.ouch = Math.max(0, state.ouch - dt);
    const enemyTurn = state.phase === 'enemyWait' || state.phase === 'enemyMove';
    heroView.setExpression(
      state.ouch > 0 || state.phase === 'down'
        ? 'ouch'
        : enemyTurn
          ? 'worried'
          : state.aiming || state.phase === 'shot'
            ? 'determined'
            : 'confident',
    );
    heroView.update(dt);
    objectsView.update(dt);
    doorsView.update(dt);
    objectsView.fadeChests(hero, state.aiming, dt);
    itemsView.sync(world.items);
    updateFlyingCoins(dt);
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
    const lungers = new Set(
      state.phase === 'enemyWait' || state.phase === 'enemyMove' ? state.moves.filter((m) => m.kind === 'lunge').map((m) => m.enemy) : [],
    );
    for (const enemy of enemies()) {
      const lunging = lungers.has(enemy);
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
      // Enemy phase: stay centred on you, pulled out only as far as it takes
      // to show where the moving enemies stood when the phase began, up to
      // enemyPhaseWidth; whatever else lands in view is a bonus.
      const enemyPhase = state.phase === 'enemyWait' || state.phase === 'enemyMove';
      let width = rig.speedWidth(speedOf(hero));
      if (enemyPhase) width = rig.widthAround(hero, state.moves.map((m) => m.from), width, CONFIG.camera.enemyPhaseWidth);
      rig.frame(framingPoints(), width, dt);
    }
    renderer.render(scene, rig.camera);
    overlay.update();
    hud.setGold(state.gold);
    hud.setKeys(state.keys);
    hud.setDanger(hero.hp > 0 && hero.hp <= CONFIG.render.dangerHp && state.phase !== 'down');
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
        `phase  ${state.aiming ? 'aiming' : state.phase}${state.moves.length ? ` (${state.moves.length} moving)` : ''}`,
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
