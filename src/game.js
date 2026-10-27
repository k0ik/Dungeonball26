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
import { parseLevel, tileCenter, tileAt } from './level.js';
import { freeSpawn } from './spawn.js';
import { createWorld, createBall, stepWorld, isAtRest, speedOf, overlapsSolid, applyBumperKicks, applyRubberRebound, lineClear } from './physics.js';
import { predictKill } from './killPredict.js';
import { chooseVantage } from './killCutVantage.js';
import { setFaceView } from './render/faces.js';
import { createCombat, createEnemy } from './combat.js';
import { canSee, lungeClear } from './sight.js';
import { lungeVelocity, patrolMove, pickPatrollers, walkDistances, seekerMove } from './turns.js';
import { shotFromDrag, canGrab, previewPath } from './aim.js';
import { buildLevelView } from './render/levelView.js';
import { setSeeThrough } from './render/materials.js';
import { createBallView } from './render/ballView.js';
import { createEnemyView } from './render/enemyView.js';
import { createTurnRing } from './render/turnRing.js';
import { createOverlay } from './render/overlay.js';
import { createHud } from './render/hud.js';
import { createAimView } from './render/aimView.js';
import { createCameraRig } from './render/cameraRig.js';
import { createAudio } from './audio.js';
import { createObjects, resolveObjects, blastObjects } from './objects.js';
import { rollLoot, rollEnemyDrops, canCollect, collect, swingSword, endSwordShot, coinStreakBonus, hurtGold, splitGold } from './loot.js';
import { createObjectsView } from './render/objectsView.js';
import { createIceView } from './render/iceView.js';
import { createIce, meltIce, stepIce } from './ice.js';
import { createLooks } from './look.js';
import { createItemsView } from './render/itemsView.js';
import { createLighting } from './render/lighting.js';
import { createEffects } from './render/effects.js';
import { createDoorsView } from './render/doorsView.js';
import { openDoors } from './doors.js';
import { has, offerCards, takeCard } from './cards.js';

/** levels: [{ id, name, text }]. */
export function createGame(container, levels, startIndex = 0) {
  // --- Rendering -----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true }); // stencil: the pickup x-ray mask
  // Adaptive resolution (render.adaptive*): start sharp, step the pixel ratio
  // down while the frame rate stays low, so slower phones stay smooth.
  const perf = { ratio: Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio), frames: 0, time: 0, js: 0, worst: 0, settle: 1, shown: '' };
  renderer.setPixelRatio(perf.ratio);
  renderer.setClearColor(CONFIG.colors.background);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const lighting = createLighting(scene);

  const rig = createCameraRig();
  const overlay = createOverlay(container, rig.camera);
  // The kill cam's frame: a vignette and letterbox bars, shown while the cut is on (CSS, .kill-cut).
  const cutFrame = document.createElement('div');
  cutFrame.className = 'cut-frame';
  cutFrame.innerHTML = '<div class="cut-vignette"></div><div class="cut-bar top"></div><div class="cut-bar bottom"></div>';
  container.appendChild(cutFrame);
  const hud = createHud(container);
  const sfx = createAudio(rig.camera);

  // The hero persists across levels; the level, its world and its view don't.
  const hero = createBall({ x: 0, z: 0, kind: 'hero', id: 'hero' });
  Object.assign(hero, { atk: CONFIG.hero.atk, maxHp: CONFIG.hero.maxHp, hp: CONFIG.hero.maxHp, shield: false, sword: 0 });
  const heroView = createBallView(hero, { color: CONFIG.colors.hero, finish: CONFIG.render.heroFinish, toCamera: rig.toCamera });
  scene.add(heroView.object);
  overlay.addBar(hero, 'hero');

  const aimView = createAimView(rig.yaw);
  scene.add(aimView.object);
  // Red dashed rings under the enemies about to move, so you know where to look.
  const actorRings = new Map(); // enemy -> ring

  const combat = createCombat();
  const objectsView = createObjectsView(scene);
  const effects = createEffects(scene);
  const enemyColor = (b) => (b.type && CONFIG.enemy.types[b.type]?.color) ?? CONFIG.colors.enemy;
  const iceView = createIceView(scene);
  let ice = createIce(); // Ice balls' puddles (src/ice.js)
  const looks = createLooks(); // where faces look (src/look.js)
  const hasFace = (b) => b === hero || (b.kind === 'enemy' && !isTool(b));
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
    gold: 0, // coins you hold: earned, and spent at the peddler
    lvl: null, // this level's record for its bonuses (loadLevel)
    goldFraction: 0, // Bullionaire's leftover fraction of a gold, carried to the next pickup
    pendingPicks: [], // card picks waiting to open: seconds left for each (see updateCardPicks)
    cards: [], // trait cards held (ids), at most CONFIG.cards.slots
    returnBoost: 0, // seconds left of the camera's fast return to you
    shotCoins: 0, // coins taken this shot: the streak count (and the tick's pitch)
    keys: [], // colours of the keys you hold; this level only
    kicked: new Map(), // bumper kicks given this move: ball -> (bumper -> count)
    panned: false, // you dragged the map to look around; the view holds until you shoot
    entry: null, // HP, gear and gold when this level was entered; game over restores them
    moves: [], // this enemy phase: { enemy, kind: 'lunge' } or { enemy, kind: 'patrol', vx, vz, target }
    timer: 0,
    waited: 0, // seconds the acting enemy has waited for the camera
  };

  let levelIndex = -1;
  let level = null;
  let world = null;
  let start = null;
  let levelView = null;
  const viewDir = new THREE.Vector3(); // scratch for the see-through walls
  const bufSize = new THREE.Vector2(); // scratch for the particle sizes

  const enemies = () => world.balls.filter((b) => b.kind === 'enemy');
  /** Tool balls (Bomb, Gold ball) share the enemies' list but have no will. */
  const isTool = (b) => b.type === 'bomb' || b.type === 'gold';

  /** Draw an enemy (and its HP bar); it must already be in world.balls. */
  function addEnemyView(enemy) {
    const view = createEnemyView(enemy, rig.toCamera);
    scene.add(view.object);
    enemyViews.set(enemy, view);
    // A bomb can't be hurt (its fuse is its state); a Gold ball's bar counts its shots left.
    if (enemy.type === 'gold') overlay.addBar(enemy, 'gold');
    else if (enemy.type !== 'bomb') overlay.addBar(enemy);
  }

  /** Coins knocked loose from a Gold ball by an impact at `speed`: 1 to 4. */
  function impactCoins(speed) {
    const L = CONFIG.loot;
    return Math.max(1, Math.min(L.impactCoinsMax, Math.ceil(speed / L.impactCoinsPerSpeed)));
  }

  /**
   * Gold balls struck: the first knock in each move (by anything) bursts
   * coins out of it by how hard it was hit; after that it just leaves its trail.
   */
  function strikeGold() {
    for (const ev of world.events) {
      if (ev.type !== 'ball' || ev.speed < CONFIG.enemy.hitMinSpeed) continue;
      for (const g of [ev.a, ev.b]) {
        if (g.type !== 'gold' || g.struck || g.hp <= 0) continue;
        g.struck = true;
        scatterCoins(g.x, g.z, impactCoins(ev.speed));
        sfx.play('coin', 0.5, { pitch: 1.2 });
      }
    }
  }

  /** Gold balls: drop a coin for every `coinEvery` tiles each one rolls. */
  function rollGold(dt) {
    const G = CONFIG.enemy.types.gold;
    for (const g of enemies()) {
      if (g.type !== 'gold') continue;
      const d = Math.hypot(g.vx, g.vz) * dt;
      if (d === 0) continue;
      g.rolled = true; // it moved this move: counts against its shots
      g.trip = (g.trip ?? 0) + d;
      while (g.trip >= G.coinEvery) {
        g.trip -= G.coinEvery;
        world.items.push({ kind: 'coin', value: CONFIG.loot.stripCoinValue, x: g.x, z: g.z });
        sfx.play('coin', 0.15, { pitch: 1.5 + Math.random() * 0.3, minInterval: 0.05 });
      }
    }
  }

  /** A move (your shot or the enemy move) came to rest: each Gold ball that rolled used a shot; after its last it shatters. */
  function endMoveForGold() {
    for (const g of enemies()) {
      if (g.type !== 'gold') continue;
      g.struck = false; // its next first knock bursts coins again
      if (!g.rolled) continue;
      g.rolled = false;
      g.hp -= 1;
      if (g.hp > 0) {
        g.radius = CONFIG.enemy.types.gold.radiusByShotsLeft[g.hp - 1]; // it wears down: large, medium, small
        continue;
      }
      world.balls = world.balls.filter((b) => b !== g);
      enemyViews.get(g)?.die();
      overlay.removeBar(g);
      sfx.play('break', 0.9, { pitch: 1.3 });
      world.items.push({ kind: 'coin', value: CONFIG.loot.stripCoinValue, x: g.x, z: g.z }); // one last coin where it popped
    }
  }

  /**
   * A lit bomb (the first hit lights it, whoever's: red and blinking) goes
   * off where it comes to rest: once it has stood still for restDelay, its
   * fuse shortened to show it's about to blow. Every physics step.
   */
  function tickBombs(step) {
    const B = CONFIG.enemy.types.bomb;
    for (const bomb of enemies()) {
      if (bomb.type !== 'bomb' || bomb.fuse == null || !world.balls.includes(bomb)) continue;
      if (bomb.vx !== 0 || bomb.vz !== 0) {
        bomb.restT = 0;
        continue;
      }
      bomb.fuse = 0; // burning down
      bomb.restT = (bomb.restT ?? 0) + step;
      if (bomb.restT >= B.restDelay) handleOutcomes(combat.bombBlast(world, bomb, hero));
    }
  }

  /** A lit bomb still waiting to go off: the shot (or enemy move) isn't over until it has. */
  const bombsPending = () => enemies().some((e) => e.type === 'bomb' && e.fuse != null && world.balls.includes(e));

  function loadLevel(i) {
    levelIndex = (i + levels.length) % levels.length;
    const def = levels[levelIndex];
    hud.setMessage(def.message ?? null);
    // Any death scene in progress ends with the old level (respawn heals you).
    hud.hideScreen();
    state.killCam = null;
    state.killCut = null;
    state.deathShown = false;
    daggers.length = 0; // any still in flight go with the old level
    level = parseLevel(def.text, def.name);
    if (levelView) scene.remove(levelView);
    levelView = buildLevelView(level);
    scene.add(levelView);
    world = createWorld(level);
    ice = createIce();
    iceView.clear();
    world.balls.push(hero);
    world.statics = createObjects(level);
    // Floor pickups: kill coins, barrel loot, the level's keys and its coin strips.
    // With Locksmith, doors open without keys, so the keys don't appear.
    world.items = has(state.cards, 'locksmith') ? [] : level.keys.map((k) => ({ kind: 'key', color: k.color, ...tileCenter(k) }));
    for (const c of level.coins) world.items.push({ kind: 'coin', value: CONFIG.loot.stripCoinValue, ...tileCenter(c) });
    state.shotCoins = 0;
    state.keys = []; // unused keys don't carry over (and a game over takes them back)
    objectsView.build(world.statics);
    effects.clear();
    doorsView.build(level);
    applyCards(); // hero-side card effects (Athletic)

    for (const view of enemyViews.values()) {
      scene.remove(view.object);
      view.dispose();
    }
    enemyViews.clear();
    overlay.clearEnemies(hero);
    level.enemies.forEach((e, n) => {
      const E = CONFIG.enemy;
      const testing = E.testLevels.includes(def.id);
      // On the test levels: the type under test, with every other one a test tool ball.
      let type = testing && E.testTool && n % 2 ? E.testTool : testing ? E.testType : (e.type ?? null);
      if (type === 'random') {
        const types = Object.keys(E.types); // every built type, tool balls included
        type = types[Math.floor(Math.random() * types.length)];
      }
      const enemy = createEnemy({ ...tileCenter(e), level: e.level, id: `enemy${n}`, type });
      if (type === 'ghost') enemy.phased = Math.random() < 0.5; // ghosts don't blink in step: each starts solid or faded at random
      world.balls.push(enemy);
      addEnemyView(enemy);
    });

    level.golds.forEach((g, n) => {
      const gold = createEnemy({ ...tileCenter(g), level: 1, id: `gold${n}`, type: 'gold' });
      world.balls.push(gold);
      addEnemyView(gold);
    });

    // This level's record for its bonuses (a game over starts it again).
    state.lvl = {
      enemies: enemies().filter((e) => !isTool(e)).length,
      chests: world.statics.filter((s) => s.kind === 'chest').length,
      opened: 0,
      deaths: 0,
      seen: false,
      swept: false, // "All Enemies Vanquished" paid
      bonuses: [], // { name, gold }: every bonus earned here, for the Bonuses Earned screen
      kills: 0, // enemies killed so far (One-Hit Wonder needs none before its shot)
    };

    start = tileCenter(level.start);
    rig.setBounds(0, level.width, 0, level.height);
    state.entry = { hp: hero.hp, atk: hero.atk, shield: hero.shield, sword: hero.sword, gold: state.gold, cards: [...state.cards] };
    respawn();
    rig.snapTo(hero.x, hero.z);
    // Compile every shader the level needs now, not on first sight mid-shot
    // (a compile can stall a phone for a good fraction of a second).
    renderer.compile(scene, rig.camera);
    perf.settle = 1; // let the first second after a load pass before judging the frame rate
  }

  /** Put the hero back at the start. The board is left exactly as it is. */
  function respawn({ heal = false } = {}) {
    // At the start, or the nearest free tile if something has come to rest on it.
    const spot = freeSpawn(world, start, CONFIG.ball.diameter / 2, hero);
    hero.x = spot.x;
    hero.z = spot.z;
    hero.vx = hero.vz = 0;
    // Never come back at 0 HP: an enemy can't hurt a ball with none left, so
    // you'd be stuck unkillable (skipping a level mid-death used to do it).
    if (heal || hero.hp <= 0) hero.hp = hero.maxHp;
    hero.inert = false;
    hero.fallen = false;
    hero.fallTo = null;
    state.fellIn = false;
    hero.wobble = 0;
    hero.bledAt = null;
    heroView.setSkull(false);
    hero.radius = CONFIG.ball.diameter / 2;
    applyCards(); // its friction (Rollerskates)
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
  const aimPx = { x: 0, y: 0, heroX: 0, heroY: 0, unitsPerPx: 0 }; // the drag on screen, for shot power

  function pointerOn(plane, e, out, camera = rig.camera) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, out);
  }

  // On your turn, a drag that doesn't start on your ball pans the map, so
  // you can look around (keys, doors, the exit). The view then holds still
  // until you shoot or tap the ball's edge marker; to shoot you still drag
  // from the ball itself.
  const pan = { pointerId: null, grab: new THREE.Vector3(), moved: false };
  function stopPanning() {
    if (!state.panned) return;
    state.panned = false;
    state.returnBoost = CONFIG.camera.returnBoostSeconds; // glide back briskly
  }
  overlay.setHeroMarker(hero, stopPanning);

  canvas.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    if (state.phase !== 'aim' || state.aiming || pan.pointerId !== null || e.button > 0) return;
    if (!pointerOn(grabPlane, e, tmp) || !canGrab(hero, { x: tmp.x, z: tmp.z })) {
      if (!pointerOn(groundPlane, e, pan.grab)) return;
      pan.pointerId = e.pointerId;
      pan.moved = false;
      pan.startX = e.clientX;
      pan.startY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    state.aiming = true;
    state.shownShot = null; // nothing shown yet for this drag
    state.pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    aimCamera = rig.camera.clone();
    aimCamera.updateMatrixWorld();
    rig.beginAim(hero);
    pointerOn(groundPlane, e, state.pointer, aimCamera);
    // Power is measured on screen (see aimShot): where the ball is, and how
    // many tiles a pixel spans across the view, as the drag starts.
    const rect = canvas.getBoundingClientRect();
    tmp.set(hero.x, hero.radius, hero.z).project(aimCamera);
    aimPx.heroX = ((tmp.x + 1) / 2) * rect.width;
    aimPx.heroY = ((1 - tmp.y) / 2) * rect.height;
    aimPx.unitsPerPx = (aimCamera.right - aimCamera.left) / aimCamera.zoom / rect.width;
    aimPx.x = e.clientX - rect.left;
    aimPx.y = e.clientY - rect.top;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === pan.pointerId) {
      if (!pan.moved && Math.hypot(e.clientX - pan.startX, e.clientY - pan.startY) < CONFIG.camera.panStartPx) return;
      pan.moved = true;
      state.panned = true;
      // Keep the ground point you grabbed under your finger.
      if (pointerOn(groundPlane, e, tmp)) rig.panBy(pan.grab.x - tmp.x, pan.grab.z - tmp.z);
      return;
    }
    if (!state.aiming || e.pointerId !== state.pointerId) return;
    pointerOn(groundPlane, e, state.pointer, aimCamera);
    const rect = canvas.getBoundingClientRect();
    aimPx.x = e.clientX - rect.left;
    aimPx.y = e.clientY - rect.top;
  });

  /** The shot the current drag sets up: aimed on the ground, powered by the drag's length on screen. */
  function aimShot() {
    const px = Math.hypot(aimPx.x - aimPx.heroX, aimPx.y - aimPx.heroY);
    return shotFromDrag(hero, { x: state.pointer.x, z: state.pointer.z }, px * aimPx.unitsPerPx);
  }

  function endAim(e, fire) {
    if (e.pointerId === pan.pointerId) {
      pan.pointerId = null;
      return;
    }
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
      shot = aimShot();
    }
    if (shot.cancel || shot.speed <= CONFIG.physics.stopThreshold) return;
    hero.vx = shot.dirX * shot.speed;
    hero.vz = shot.dirZ * shot.speed;
    state.phase = 'shot';
    state.shots++;
    state.contacts = [{ x: hero.x, z: hero.z }]; // debugging: where the real shot touched things
    nextMove();
    combat.beginShot();
    // This shot's record, for its trick shots (and One-Hit Wonder).
    state.shotRec = { paid: new Set(), tricks: [], picked: new Set(), kills: 0, chests: 0, door: false, hitAt: new Map(), bounced: new Set(), comboKnocked: new Set(), cleanStart: state.lvl?.kills === 0 };
    // Shaman's Mask: each shot you take heals you.
    if (card('shamanMask') && hero.hp > 0 && hero.hp < hero.maxHp) {
      const heal = Math.min(CONFIG.cards.shamanHeal, hero.maxHp - hero.hp);
      hero.hp += heal;
      overlay.float(`+${heal} HP`, hero.x, hero.z, hero.radius * 2 + 0.2, 'heal', heroFollow());
    }
    // A new shot: the coin streak and the coin tick's pitch start over.
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
    const patrollers = pickPatrollers(enemies().filter((e) => !isTool(e) && e.type !== 'jekyll' && e.type !== 'seeker'));
    let toHero = null; // walking distances to you, for Seekers (worked out once, if any need it)
    const moves = [];
    const claimed = []; // patrol destinations already taken this round
    for (const enemy of enemies()) {
      if (isTool(enemy)) continue; // a tool ball only moves when something knocks it
      const from = { x: enemy.x, z: enemy.z }; // where it stands as the phase starts (camera framing)
      if (enemy.type === 'jekyll') {
        // Passive unless provoked; then it goes for the nearest ball it can see, friend or foe.
        if (!enemy.enraged) continue;
        const target = jekyllTarget(enemy);
        enemy.enraged = false; // its one attack (or chance to) is now; it calms down after
        if (target) moves.push({ enemy, from, kind: 'lunge', target });
        continue;
      }
      // A faded Ghost doesn't know it's harmless: it lunges like any enemy (and passes straight through).
      if (canSee(level, enemy, hero, world.balls, world.statics)) {
        if (lungeClear(level, enemy, hero)) moves.push({ enemy, from, kind: 'lunge' });
        else {
          // It sees you over a half-wall but can't roll through it: it works
          // its way round toward you instead, like a Seeker.
          toHero ??= walkDistances(level, hero.x, hero.z);
          const move = seekerMove(level, enemy, [...world.balls, ...claimed], toHero, Math.random, world.statics);
          if (!move) continue;
          moves.push({ enemy, from, kind: 'patrol', hunting: true, ...move });
          claimed.push({ x: move.target.x, z: move.target.z, radius: enemy.radius });
        }
      } else if (enemy.type === 'seeker') {
        // It can't see you but knows roughly where you are: it always moves, drifting your way.
        toHero ??= walkDistances(level, hero.x, hero.z);
        const move = seekerMove(level, enemy, [...world.balls, ...claimed], toHero, Math.random, world.statics);
        if (!move) continue;
        moves.push({ enemy, from, kind: 'patrol', ...move });
        claimed.push({ x: move.target.x, z: move.target.z, radius: enemy.radius });
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
      newRound();
      return;
    }
    combat.beginEnemyTurn(moves.map((m) => m.enemy));
    // Tap Shoes: each enemy that moves may be dodged. It's rolled now, but
    // only shows if it reaches you: you turn see-through as it arrives, it
    // passes straight through, and you're solid (and hittable) again once
    // it's clear (see watchDodges).
    hero.passThrough = card('tapShoes') ? new Set(moves.map((m) => m.enemy).filter(() => Math.random() < CONFIG.cards.tapShoesDodge)) : null;
    const lunge = moves.some((m) => m.kind === 'lunge');
    state.phase = 'enemyWait';
    state.timer = Math.max(lunge ? CONFIG.enemy.lungeTelegraph : CONFIG.enemy.patrolDelay, CONFIG.enemy.turnRingBeat);
    state.waited = 0;
  }

  /**
   * Where every face looks this frame (src/look.js). Your ball: where the
   * shot would go while aiming; the nearest moving enemy during the enemy
   * move. An enemy: the ball it's watching (you, or a Jekyll's target).
   */
  function updateLooks(dt, enemyMove) {
    const dirTo = (b, t) => (t ? { x: t.x - b.x, z: t.z - b.z } : null);
    let focus = null;
    if (state.aiming && state.shownShot && !state.shownShot.cancel) focus = { x: state.shownShot.dirX, z: state.shownShot.dirZ };
    else if (enemyMove) {
      let best = null;
      for (const e of enemies()) {
        if (speedOf(e) <= CONFIG.look.moveMin) continue;
        const d = Math.hypot(e.x - hero.x, e.z - hero.z);
        if (d <= CONFIG.look.watchRange && (!best || d < best.d)) best = { e, d };
      }
      focus = dirTo(hero, best?.e);
    }
    looks.update(hero, dt, focus, true);
    for (const e of enemies()) if (hasFace(e)) looks.update(e, dt, dirTo(e, e.watching), false);
  }

  /** A move starts (your shot or the enemy move): old ice puddles melt. */
  function nextMove() {
    state.move = (state.move ?? 0) + 1;
    state.kicked = new Map(); // each bumper kicks each ball a few times per move
    meltIce(ice, state.move);
  }

  /** Your turn comes round again: every Ghost switches between solid and faded. */
  function newRound() {
    // Poisoned Pen: poisoned enemies lose HP as each round starts, never below 1.
    for (const e of enemies()) {
      if (!e.poisoned || e.hp <= 1) continue;
      e.hp = Math.max(1, e.hp - CONFIG.cards.poisonDamage);
      overlay.float(`-${CONFIG.cards.poisonDamage}`, e.x, e.z, e.radius * 2 + 0.2, 'poison');
    }
    hero.passThrough = null; // Tap Shoes' dodges last one enemy move
    hero.passing = false;
    for (const e of enemies()) {
      if (e.type !== 'ghost') continue;
      if (e.phased) e.solidifying = true; // turns solid once nothing overlaps it (settleGhosts)
      else e.phased = true;
    }
    settleGhosts();
  }

  /**
   * A Ghost due to turn solid while a ball (you included) is inside it stays
   * faded until it's clear, so nothing is ever shoved out of a ghost.
   */
  function settleGhosts() {
    for (const g of enemies()) {
      if (!g.solidifying) continue;
      const blocked = world.balls.some((b) => b !== g && Math.hypot(b.x - g.x, b.z - g.z) < b.radius + g.radius);
      if (blocked) continue;
      g.solidifying = false;
      g.phased = false;
    }
  }

  /** The nearest ball an enraged Jekyll can see (you or another enemy), or null. */
  function jekyllTarget(jekyll) {
    let best = null;
    for (const b of world.balls) {
      if (b === jekyll || b.hp <= 0) continue;
      if (!canSee(level, jekyll, b, world.balls, world.statics)) continue;
      const d = Math.hypot(b.x - jekyll.x, b.z - jekyll.z);
      if (!best || d < best.d) best = { ball: b, d };
    }
    return best?.ball ?? null;
  }

  function launchEnemies() {
    let lunged = false;
    for (const m of state.moves) {
      if (m.enemy.hp <= 0) continue;
      if (m.enemy.type === 'sticky') {
        // It creeps there instead of launching: to its patrol spot, or to
        // where its target is now (it hits it on the way and stops creeping).
        const S = CONFIG.enemy.types.sticky;
        let to = m.kind === 'lunge' ? (m.target ?? hero) : m.target;
        let d = Math.hypot(to.x - m.enemy.x, to.z - m.enemy.z);
        if (d > S.crawlMax) {
          // Half as far as other enemies go: it creeps crawlMax toward you and stops.
          to = { x: m.enemy.x + ((to.x - m.enemy.x) / d) * S.crawlMax, z: m.enemy.z + ((to.z - m.enemy.z) / d) * S.crawlMax };
          d = S.crawlMax;
        }
        m.enemy.crawl = { x: to.x, z: to.z, speed: S.crawlSpeed, pulse: S.crawlPulse, hz: S.crawlPulseHz, t: 0, maxT: d / (S.crawlSpeed * (1 - S.crawlPulse * 0.5)) + 1 };
        if (m.kind === 'lunge') lunged = true;
        continue;
      }
      if (m.kind === 'lunge') {
        Object.assign(m.enemy, lungeVelocity(m.enemy, m.target ?? hero));
        lunged = true;
      } else {
        m.enemy.vx = m.vx;
        m.enemy.vz = m.vz;
      }
    }
    if (lunged) sfx.play('lunge', 0.9);
    state.phase = 'enemyMove';
    nextMove();
  }

  // Death scene: "You Died!" comes up over the board (it never darkens)
  // about halfway through your skull's roll, for at least deathScreenSeconds
  // and until the skull stops; input is blocked throughout. The respawn (or game-over restart) happens under it,
  // just before it lightens, and play carries on.
  function knockedOut({ fell = false } = {}) {
    state.phase = 'down';
    // Your ball becomes a bone-white skull that rolls on, bouncing off
    // everything but touching nothing: no hits, no barrels, chests or pickups.
    hero.inert = true;
    // (Fallen in a pit or lava: no skull; your own ball drops in, its face
    // turned to you with XX eyes.)
    if (!fell) heroView.setSkull(true);
    // You lose your gear now, and your artifacts: they're tossed up out of
    // the inventory and fall away off the screen.
    if (state.cards.length) {
      hud.tossCards(0.3);
      state.cards = [];
      applyCards();
    }
    hero.sword = 0;
    hero.atk = CONFIG.hero.atk; // and the sword's +3 with it
    hero.shield = false;
    // Smaller and slippery (restored on respawn).
    const H = CONFIG.hero;
    if (!fell) hero.radius = (CONFIG.ball.diameter / 2) * H.skullScale;
    hero.friction = H.skullFriction;
    // Flung on hard, the way it was going (any way at all if it was still);
    // unless it fell in a pit, when it's already gone.
    const v = fell ? 0 : speedOf(hero);
    const a = v > 0.05 ? Math.atan2(hero.vz, hero.vx) : Math.random() * Math.PI * 2;
    const launch = Math.min(H.skullLaunchMax, Math.max(H.skullLaunch, v * 1.2));
    if (!fell) {
      hero.vx = Math.cos(a) * launch;
      hero.vz = Math.sin(a) * launch;
      // It sheds its skin: a big spray of chips.
      effects.shed(hero.x, hero.z, Math.cos(a), Math.sin(a));
    }
    // Kill cam on you: tight on the skull as it's flung away (no slow motion);
    // then the skull camera follows it (see the framing).
    state.killCam = { x: hero.x, z: hero.z, left: CONFIG.camera.deathCamSeconds, hero: true };
    hitStop(CONFIG.effects.hitStopKill);
    // "You Died!" comes up about halfway through the roll: half the time a
    // ball at this speed takes to stop on this friction (bounces only make
    // it sooner), and at most halfway through the longest roll allowed.
    const stopIn = launch / (CONFIG.physics.friction * H.skullFriction);
    state.deathShown = false;
    state.downTime = 0;
    state.deathAt = Math.min(stopIn, H.skullRollMaxSeconds) * 0.4; // a bit under half: bounces cut rolls short
    state.timer = 0;
    state.aiming = false;
    aimView.hide();
    sfx.play(state.lives - 1 > 0 ? 'down' : 'gameover', 0.9);
  }

  /**
   * The skull is lumpy: its path wobbles as it rolls. Its heading turns at a
   * rate that wanders at random (a smooth random walk), more at speed.
   */
  function jiggleSkull(dt) {
    const H = CONFIG.hero;
    const v = speedOf(hero);
    if (v < 0.05) return;
    hero.wobble = ((hero.wobble ?? 0) + (Math.random() - 0.5) * H.skullJiggleKick) * Math.exp(-H.skullJiggleDamping * dt);
    const turn = hero.wobble * Math.min(1, v / 3) * dt;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    [hero.vx, hero.vz] = [hero.vx * c - hero.vz * s, hero.vx * s + hero.vz * c];
  }

  /**
   * Balls that fell in a pit or lava this step: an enemy dies (a kill for
   * combos, its coins lost with it), a tool ball is simply gone, and you
   * die whatever your HP (a skull just drops out of sight).
   */
  function handleFalls() {
    for (const ev of world.events) {
      if (ev.type !== 'fall') continue;
      const b = ev.ball;
      sfx.play('down', 0.5, { pitch: 1.4 });
      if (b === hero) {
        heroView.fall();
        state.fellIn = true;
        if (!hero.inert) {
          hero.hp = 0;
          hero.shield = false; // a shield doesn't save you from a fall
          knockedOut({ fell: true });
        }
      } else if (b.kind === 'enemy') {
        enemyViews.get(b)?.fall();
        overlay.removeBar(b);
        if (isTool(b)) world.balls = world.balls.filter((x) => x !== b);
        else {
          if (b.fallen === 'lava' && state.phase === 'shot') trick("Soup's On!");
          handleOutcomes(combat.fell(world, b));
        }
      } else {
        world.balls = world.balls.filter((x) => x !== b);
      }
    }
    world.events = world.events.filter((ev) => ev.type !== 'fall');
  }

  /** The skull leaves a trail of its shed metal skin on the floor as it rolls. */
  function bleedSkull() {
    const E = CONFIG.effects;
    const last = hero.bledAt ?? (hero.bledAt = { x: hero.x, z: hero.z });
    const d = Math.hypot(hero.x - last.x, hero.z - last.z);
    if (d < E.bloodSpacing) return;
    // Thicker and smeared a little longer when it's fast.
    effects.blood(hero.x, hero.z, E.bloodSize * (1 + Math.min(1, speedOf(hero) / 6) * 0.5));
    last.x = hero.x;
    last.z = hero.z;
  }

  function showDeathScreen() {
    state.deathShown = true;
    state.timer = CONFIG.hero.deathScreenSeconds;
    const left = state.lives - 1;
    hud.showScreen('You Died!', left > 0 ? `${left} ${left === 1 ? 'life remains' : 'lives remain'}` : 'Game Over');
  }

  function afterKnockout() {
    for (const b of world.balls) b.vx = b.vz = 0; // anything still rolling stops as you come back
    // Dying loses your artifacts (already tossed away at the knockout).
    state.cards = [];
    applyCards();
    state.lives--;
    if (state.lives > 0) {
      if (state.lvl) state.lvl.deaths++;
      respawn({ heal: true });
    } else {
      // Game over: the level starts from scratch, at full HP (as any respawn
      // is: you could have entered on 1 HP and been doomed to die again on
      // the first hit) and with the gold you entered it with, but no gear or
      // artifacts (the knockout took them).
      const { gold } = state.entry;
      const hp = hero.maxHp;
      state.cards = [];
      applyCards();
      // Doppleganger: +1 to the lives a game over restores.
      state.lives = CONFIG.hero.lives + (has(state.cards, 'doppleganger') ? 1 : 0);
      Object.assign(hero, { hp, atk: CONFIG.hero.atk, shield: false, sword: 0 });
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
  /**
   * Reaching the exit: no sudden stop. Your ball leaves the physics (other
   * balls roll on) and carries its momentum into the middle of the exit
   * tile, easing to a stop there (a damped spring); then it beams out in a
   * column of light, the screen fades, and the next level comes in
   * (updateExit, finishExit).
   */
  function reachExit() {
    state.clears++;
    state.aiming = false;
    aimView.hide();
    const col = Math.floor(hero.x);
    const row = Math.floor(hero.z);
    // The exit's own bonuses: paid now, shown on the Bonuses Earned screen (no callout).
    const B = CONFIG.bonuses;
    const L = state.lvl;
    if (L && !levels[levelIndex].test) {
      if (state.phase === 'shot' && combat.shotKills >= 1) trick('Parting Shot', false);
      if (!L.deaths) bonus('Unscathed', B.noDeaths, false);
      if (L.enemies && !L.seen) bonus('Ghost', B.unseen, false);
    }
    state.exit = { t: 0, vx: hero.vx, vz: hero.vz, cx: col + 0.5, cz: row + 0.5, beaming: false, fading: false };
    hero.vx = hero.vz = 0;
    hero.phased = true; // nothing bumps it now
    state.phase = 'exiting';
    sfx.play('exit', 0.8);
  }

  /**
   * A trick shot: a bonus (CONFIG.tricks), at most once per shot each, called
   * out under a "Trick Shot" eyebrow. One landed on your shot earns a bonus
   * turn as the shot comes to rest (R.tricks).
   */
  function trick(name, callout = true) {
    const R = state.shotRec;
    if (R) {
      if (R.paid.has(name)) return;
      R.paid.add(name);
      if (state.phase === 'shot') R.tricks.push(name);
    }
    bonus(name, CONFIG.tricks[name], callout, 'Trick Shot');
  }

  /**
   * A bonus: gold now, a callout naming it (unless `callout` is false: the
   * exit's own), and a line on the level's Bonuses Earned screen.
   */
  function bonus(name, gold, callout = true, eyebrow = '') {
    const got = addGold(gold);
    state.lvl?.bonuses.push({ name, gold: got });
    if (callout) {
      sfx.play('comboKill', 0.6, { pitch: 1.2 });
      hud.callout(name.endsWith('!') ? name : `${name}!`, '', got, '', eyebrow);
    }
  }

  function updateExit(dt) {
    const X = CONFIG.render;
    const e = state.exit;
    e.t += dt;
    // Glide into the middle of the tile: momentum fades as a spring pulls it in.
    const damp = Math.exp(-X.exitGlideDamping * dt);
    e.vx = e.vx * damp + (e.cx - hero.x) * X.exitGlidePull * dt;
    e.vz = e.vz * damp + (e.cz - hero.z) * X.exitGlidePull * dt;
    hero.x += e.vx * dt;
    hero.z += e.vz * dt;
    if (!e.beaming && e.t >= X.exitGlideSeconds) {
      e.beaming = true;
      heroView.beamOut();
    }
    const beamEnd = X.exitGlideSeconds + X.exitBeamSeconds;
    // A level from the editor fades out as before; otherwise the Bonuses
    // Earned screen comes up over the board as the beam ends (finishExit).
    if (levels[levelIndex].test && !e.fading && e.t >= beamEnd - X.exitFadeSeconds * 0.5) {
      e.fading = true;
      hud.fade(true, X.exitFadeSeconds);
    }
    if (e.t >= beamEnd + (levels[levelIndex].test ? X.exitFadeSeconds * 0.5 : 0)) finishExit();
  }

  function finishExit() {
    state.exit = null;
    hero.phased = false;
    // A level played from the level editor: no next level; reset it and hand back to the editor.
    if (levels[levelIndex].test) {
      hud.fade(false, CONFIG.render.exitFadeSeconds);
      loadLevel(levelIndex);
      hud.banner('Test complete!', 'Back to the editor', 1.2);
      api.onTestComplete?.();
      return;
    }
    // Bonuses Earned: the level's bonuses (already in your gold), listed one
    // by one over the darkened board; Continue goes on to the peddler.
    state.phase = 'score';
    let n = 0;
    hud.showBonuses(state.lvl?.bonuses ?? [], () => sfx.play(n++ % 2 ? 'blocked' : 'gear', 0.8, { pitch: 1 + 0.06 * n }), () => {
      hud.fade(true, 0.2);
      // Then the peddler (between levels), then the next level.
      if (levelIndex + 1 < levels.length) {
        openPeddler(() => {
          hud.fade(false, CONFIG.render.exitFadeSeconds);
          loadLevel(levelIndex + 1); // cards come from chests now, not here
          levelBanner();
        });
        return;
      }
      hud.fade(false, CONFIG.render.exitFadeSeconds);
      state.phase = 'won';
      state.timer = CONFIG.hero.runCompleteSeconds;
      sfx.play('win', 0.9);
      hud.showScreen('Run Complete!', `${state.gold} gold`, 'win');
    });
  }

  /** A fresh run from level 1: full HP, no gear, 3 lives, no gold, no cards. */
  function newRun() {
    Object.assign(hero, { atk: CONFIG.hero.atk, maxHp: CONFIG.hero.maxHp, hp: CONFIG.hero.maxHp, shield: false, sword: 0 });
    state.lives = CONFIG.hero.lives;
    state.gold = 0;
    state.goldFraction = 0;
    state.pendingPicks = [];
    dealStartingCards();
    loadLevel(0);
    hud.hideScreen();
    levelBanner();
  }

  // --- Cards -------------------------------------------------------------------
  /**
   * Cards come out of chests: each opened chest queues a pick that opens
   * once its coins have flown (chestPickDelay seconds of play). The pick
   * freezes the game mid-roll until you choose or skip; several queue up.
   */
  function updateCardPicks(dt) {
    if (!state.pendingPicks.length || hud.paused) return;
    state.pendingPicks[0] -= dt;
    if (state.pendingPicks[0] > 0) return;
    state.pendingPicks.shift();
    const [id] = offerCards(state.cards, Math.random, 1); // one card, not yet held
    if (!id) return;
    hud.showCardFind(id, state.cards, (replace) => {
      if (replace === false) return; // skipped
      takeArtifact(id, replace);
    });
  }

  /** Put artifact `id` in your hand (in place of `replace`, if given). Returns false if there was no room. */
  function takeArtifact(id, replace) {
    const hand = takeCard(state.cards, id, replace);
    if (!hand) return false;
    state.cards = hand;
    if (id === 'doppleganger') state.lives += 1; // kept even if the card is later replaced
    sfx.play('gear', 0.8);
    applyCards();
    // Chicken Heart: the extra max HP comes filled.
    if (id === 'chickenHeart' && hero.hp > 0) {
      hero.hp = Math.min(hero.maxHp, hero.hp + CONFIG.cards.chickenHeartHp);
      overlay.float(`+${CONFIG.cards.chickenHeartHp} HP`, hero.x, hero.z, hero.radius * 2 + 0.2, 'heal', heroFollow());
    }
    return true;
  }

  /**
   * The peddler, between levels: a supply shop (artifacts come only from
   * chests). Health, a shield, a sword or a 1-up, each at its price; an item
   * you couldn't use (full HP, gear you already hold) or can't afford is
   * greyed out. Gold carries over. Calls next() on Continue.
   */
  function openPeddler(next) {
    state.phase = 'shop';
    const heal = (it) => Math.ceil(it.heal * hero.maxHp);
    const text = (it) =>
      it.heal ? `+${heal(it)} HP (${Math.round(it.heal * 100)}% of max)` : it.id === 'sword' ? `+${CONFIG.loot.swordAtk} ATK for your next shot.` : it.text;
    const useless = (it) => (it.heal ? hero.hp >= hero.maxHp : it.id === 'shield' ? hero.shield : it.id === 'sword' ? !!hero.sword : false);
    const model = () => ({
      gold: state.gold,
      hp: hero.hp,
      maxHp: hero.maxHp,
      items: CONFIG.peddler.items.map((it) => ({ ...it, text: text(it), useless: useless(it), poor: state.gold < it.price })),
    });
    const shop = hud.showPeddler(model(), {
      buy(i) {
        const it = CONFIG.peddler.items[i];
        if (!it || useless(it) || state.gold < it.price) return;
        state.gold -= it.price;
        if (it.heal) hero.hp = Math.min(hero.maxHp, hero.hp + heal(it));
        else collect({ kind: it.id }, hero, state);
        sfx.play('gear', 0.8);
        shop.update(model());
      },
      leave() {
        shop.close();
        next();
      },
    });
  }

  const card = (id) => has(state.cards, id);

  /**
   * A new game's hand: empty, or (testing aid, CONFIG.cards.startDealt)
   * that many random cards already dealt. A dealt Doppleganger gives its life.
   */
  function dealStartingCards() {
    state.cards = offerCards([], Math.random, CONFIG.cards.startDealt);
    if (has(state.cards, 'doppleganger')) state.lives += 1;
    applyCards();
  }

  /**
   * Tap Shoes: an enemy rolled as dodged (hero.passThrough) passes through
   * you. While it overlaps you, you're see-through (hero.passing); the first
   * time it does, "Dodged!", and it's spent for this move. Once it's clear,
   * it's solid to you again.
   */
  const dodgeShown = new WeakSet();
  function watchDodges() {
    if (!hero.passThrough?.size) {
      hero.passing = false;
      return;
    }
    let passing = false;
    for (const e of hero.passThrough) {
      const near = Math.hypot(e.x - hero.x, e.z - hero.z) < e.radius + hero.radius + 0.05;
      if (near) {
        passing = true;
        if (!dodgeShown.has(e)) {
          dodgeShown.add(e);
          combat.spend(e);
          sfx.play('blocked', 0.7, { pitch: 1.3 });
          overlay.float('Dodged!', hero.x, hero.z, hero.radius * 2 + 0.2, 'gear', heroFollow());
        }
      } else if (dodgeShown.has(e)) {
        hero.passThrough.delete(e); // through and clear: you're solid to it again
        dodgeShown.delete(e);
      }
    }
    hero.passing = passing;
  }

  /** Effects that sit on the hero rather than being checked as they happen. */
  function applyCards() {
    const K = CONFIG.cards;
    hero.friction = card('athletic') ? K.athleticFriction : undefined;
    hero.maxHp = Math.max(1, CONFIG.hero.maxHp + (card('chickenHeart') ? K.chickenHeartHp : 0) - (card('shamanMask') ? K.shamanMaxHpLoss : 0));
    hero.hp = Math.min(hero.hp, hero.maxHp);
    hero.blastproof = card('bombSquad');
    hero.potionScale = card('doctorsOrders') ? K.doctorsOrdersHeal : 1;
    hero.sightScale = card('ninja') ? K.ninjaSight : 1;
  }

  /**
   * Add gold to the score (Bullionaire multiplies it, carrying the fraction
   * over so 1.5× is exact over time). Returns the whole gold added.
   */
  function addGold(n) {
    const total = n * (card('bullionaire') ? CONFIG.cards.bullionaire : 1) + state.goldFraction;
    const whole = Math.floor(total);
    state.goldFraction = total - whole;
    state.gold += whole;
    return whole;
  }

  /** Money Magnet: coins near the ball slide in to it (taken on contact as usual). */
  function pullCoins(dt) {
    if (!card('moneyMagnet') || hero.inert) return;
    const k = 1 - Math.exp(-CONFIG.cards.magnetPull * dt);
    for (const item of world.items) {
      if (item.kind !== 'coin' || item.fly || item.hot) continue;
      const d = Math.hypot(item.x - hero.x, item.z - hero.z);
      if (d > CONFIG.cards.magnetRadius) continue;
      item.x += (hero.x - item.x) * k;
      item.z += (hero.z - item.z) * k;
    }
  }

  // --- Events ------------------------------------------------------------------
  /**
   * Barrel loot lands on the floor where the barrel stood (or there's
   * nothing inside); roll over it to take it. Gold comes out as that many single coins, scattered.
   */
  function dropLoot(x, z) {
    const loot = rollLoot(Math.random, { gearWeight: card('junkHunter') ? CONFIG.cards.junkHunter : 1, potionWeight: card('doctorsBag') ? CONFIG.cards.doctorsBag : 1 });
    if (loot.kind === 'gold') {
      // Barrel gold fountains up like a chest's and is yours at once (no coins on the floor).
      itemsView.chestCoins(x, 0.3, z, loot.value);
      const gold = addGold(loot.value);
      overlay.float(`+${gold}`, hero.x, hero.z, hero.radius * 2 + 0.8, 'gold', heroFollow());
    }
    else if (loot.kind !== 'empty') world.items.push({ ...loot, x, z });
  }

  /**
   * Throw `n` single coins (the same coins as strips), plus any `extras`
   * (other pickups, by kind) and any `given` items as they are, out from
   * (x, z): each flies to a random clear spot at a
   * random distance, with a random arc height and flight time, so they land
   * one after another, and bounces once. A spot is clear if the item fits
   * there and the way to it crosses no wall, door or bumper; after a few
   * misses it just drops close by.
   */
  function scatterCoins(x, z, n, extras = [], given = []) {
    const L = CONFIG.loot;
    const r = CONFIG.objects.itemRadius;
    const blocked = (px, pz) =>
      overlapsSolid(level, px, pz, r) || world.statics.some((s) => Math.hypot(s.x - px, s.z - pz) < (s.radius ?? Math.hypot(s.halfX, s.halfZ)) + r);
    const rand = (a, b) => a + Math.random() * (b - a);
    const items = [...Array.from({ length: n }, () => ({ kind: 'coin', value: 1 })), ...extras.map((kind) => ({ kind })), ...given];
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

  /**
   * Move flying coins along their arcs; a coin can be taken once it has
   * landed. A coin knocked out of you (hot) then stays red for a moment before
   * it turns gold and can be taken.
   */
  function updateFlyingCoins(dt) {
    for (const item of world.items) {
      const f = item.fly;
      if (!f) {
        if (item.hot) item.hot = Math.max(0, item.hot - dt);
        continue;
      }
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

  /**
   * Failsafe: if balls have been moving for more than `stallSeconds` in a
   * row (something caught bouncing in a tight spot), drain their speed
   * steadily so the turn always ends.
   */
  function dampStalls(dt) {
    if (isAtRest(world)) {
      state.movingFor = 0;
      return;
    }
    state.movingFor = (state.movingFor ?? 0) + dt;
    if (state.movingFor < CONFIG.physics.stallSeconds) return;
    const k = Math.exp(-CONFIG.physics.stallDamping * dt);
    for (const b of world.balls) {
      b.vx *= k;
      b.vz *= k;
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
    if (state.phase === 'shot' && state.shotRec) {
      const R = state.shotRec;
      R.picked.add(item.kind === 'superPotion' ? 'potion' : item.kind);
      if (R.picked.has('sword') && R.picked.has('shield')) trick('Shopping Spree');
    }
    // A key flies to the middle of the screen, spinning, then into its HUD slot, instead of a label.
    if (item.kind === 'key') hud.flyKey(item.color, overlay.pagePoint(item.x, 0.4, item.z));
    else overlay.float(label, hero.x, hero.z, hero.radius * 2 + 0.8, PICKUP_STYLE[item.kind], heroFollow());
  }

  /**
   * A door opens when you come close holding its key, during your own shot
   * only: being knocked against it in the enemy move doesn't unlock it (an
   * enemy would otherwise roll straight through while it sinks).
   */
  function checkDoors() {
    if (state.phase !== 'shot') return;
    for (const door of openDoors(level, hero, state.keys, { noKeys: card('locksmith') })) {
      doorsView.open(door);
      sfx.play('door', 1);
      if (state.shotRec) {
        state.shotRec.door = true;
        if (state.shotRec.kills) trick('Door Prize');
      }
      overlay.float('Unlocked!', door.col + 0.5, door.row + 0.5, CONFIG.render.wallHeight + 0.3, 'gear');
    }
  }

  /**
   * A single coin: no label (a run of them would spam), just a tick that
   * rises in pitch with each coin this shot. Coins taken within one of your
   * shots, placed or dropped alike, make a streak: 5, 10 and 20 in one shot
   * each pay a bonus (Clean, Super and Mega Sweep).
   */
  function pickUpStripCoin(item) {
    addGold(item.value);
    effects.glint(item.x, item.z);
    itemsView.popCoin(item.x, item.z);
    if (state.phase !== 'shot') {
      sfx.play('coin', 0.45); // outside your shot (knocked about on the enemy turn): no streak
      return;
    }
    state.shotCoins++;
    sfx.play('coin', 0.45, { pitch: Math.min(2, 0.9 + 0.07 * state.shotCoins) });
    const streak = coinStreakBonus(state.shotCoins);
    if (streak) {
      const bonus = addGold(streak.bonus);
      sfx.play('sweep', 0.8);
      overlay.float(`${streak.name} +${bonus}`, hero.x, hero.z, hero.radius * 2 + 0.8, 'gold', heroFollow());
    }
  }

  /** Roll over a floor item to take it, once you can use it. */
  function checkPickups() {
    if (hero.inert) return; // a skull takes nothing
    const reach = hero.radius + CONFIG.objects.itemRadius;
    for (const item of [...world.items]) {
      if (item.fly || item.hot || Math.hypot(item.x - hero.x, item.z - hero.z) > reach || !canCollect(item, hero)) continue;
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
        effects.barrelBreak(obj.x, obj.z, CONFIG.colors.barrel);
        dropLoot(obj.x, obj.z);
      } else if (o.type === 'open') {
        if (state.lvl && ++state.lvl.opened === state.lvl.chests) bonus('All Treasures Looted', CONFIG.bonuses.allChests);
        if (state.phase === 'shot' && state.shotRec) {
          const R = state.shotRec;
          if (++R.chests >= 2) trick('Gold Digger');
          if (R.kills) trick('This is a Robbery');
        }
        sfx.play('chest', 0.9);
        objectsView.openChest(obj);
        itemsView.chestCoins(obj.x, 0.35, obj.z, o.gold); // one spinning coin per gold, popping out
        const gold = addGold(o.gold);
        // Over the ball (always on screen), not the chest, which may not be.
        overlay.float(`+${gold}`, hero.x, hero.z, hero.radius * 2 + 0.8, 'gold', heroFollow());
        // Every chest also holds a card: once its coins are out, the pick (see updateCardPicks).
        state.pendingPicks.push(CONFIG.cards.chestPickDelay);
      } else if (o.type === 'explode') {
        sfx.play('explode', 1);
        objectsView.remove(obj);
        objectsView.blast(obj.x, obj.z);
        lighting.flash(obj.x, obj.z);
        effects.explosion(obj.x, obj.z);
        hitStop(CONFIG.effects.hitStopBlast);
        looks.blast(level, obj.x, obj.z, world.balls, hasFace);
        if (o.victim) {
          // none when a bomb's blast set it off
          const hitHero = o.victim.kind === 'enemy' && combat.hasHitHero(o.victim);
          const outs = combat.explosion(world, o.victim, hero);
          if (o.victim.kind === 'enemy' && outs.some((x) => x.type === 'kill')) {
            // Barrel of Fun: on your shot, it died setting a red barrel off;
            // Backfire: on the enemy turn, it had just hit you.
            if (state.phase === 'shot') trick('Barrel of Fun');
            else if (hitHero) trick('Backfire');
          }
          handleOutcomes(outs);
        }
      }
    }
  }

  function handleEvents(outcomes, objectOutcomes = []) {
    const A = CONFIG.audio;
    const damaging = new Set(outcomes.map((o) => o.event).filter(Boolean));
    const objectHits = new Set(objectOutcomes.map((o) => o.obj));
    for (const ev of world.events) {
      // Bank Shot: a combo-knocked enemy (one an enemy you hit ran into) hits a barrel.
      if (ev.type === 'static' && state.phase === 'shot' && state.shotRec?.comboKnocked.has(ev.ball) && (ev.obj.kind === 'barrel' || ev.obj.kind === 'explosive')) trick('Bank Shot');
      const loud = Math.min(1, ev.speed / CONFIG.aim.maxLaunchSpeed);
      hitEffect(ev, damaging.has(ev));
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

  /** Dust off walls and bumpers, sparks where balls meet (tinted on a hit). */
  function hitEffect(ev, damaging) {
    if (ev.type === 'wall') {
      // The nearest point of the wall tile it hit, and the way it bounced off.
      const b = ev.ball;
      const cx = Math.max(ev.col, Math.min(ev.col + 1, b.x));
      const cz = Math.max(ev.row, Math.min(ev.row + 1, b.z));
      const d = Math.hypot(b.x - cx, b.z - cz) || 1;
      effects.wallHit(cx, cz, (b.x - cx) / d, (b.z - cz) / d, ev.speed);
    } else if (ev.type === 'static') {
      const b = ev.ball;
      const d = Math.hypot(b.x - ev.obj.x, b.z - ev.obj.z) || 1;
      const nx = (b.x - ev.obj.x) / d;
      const nz = (b.z - ev.obj.z) / d;
      effects.wallHit(b.x - nx * b.radius, b.z - nz * b.radius, nx, nz, ev.speed);
    } else if (ev.type === 'ball') {
      const { a, b, nx, nz } = ev;
      const other = a === hero ? b : b === hero ? a : null;
      const tint = damaging ? enemyColor(other ?? b) : null;
      effects.ballHit(a.x + nx * a.radius, a.z + nz * a.radius, nx, nz, ev.speed, tint);
    }
  }

  function handleOutcomes(outcomes) {
    // Labels about you ride along above your ball; labels over enemies stay put.
    const floatAt = (ball, text, cls, lift = 0) =>
      overlay.float(text, ball.x, ball.z, ball.radius * 2 + 0.2 + lift, cls, ball === hero ? heroFollow() : null);
    const zaps = [];
    let comboSounded = false;
    for (const o of outcomes) {
      if (o.type === 'hit' || o.type === 'combo') {
        if (o.type === 'hit') {
          sfx.play('hit', 0.9, { pitch: 0.95 + Math.random() * 0.1 });
          swingSword(hero); // this shot spends the sword (if you hold one)
        }
        else if (!comboSounded) {
          sfx.play('combo', 0.9);
          comboSounded = true;
        }
        if (o.amount) floatAt(o.target, `-${o.amount}`, o.type === 'combo' ? 'combo' : ''); // (a golem's split does no damage)
        if (o.amount && o.target.hp > 0) enemyViews.get(o.target)?.ouch(CONFIG.render.enemyOuchSeconds); // >.<
        if (o.type === 'hit' && state.phase === 'shot' && state.shotRec) {
          // Trick shots: Double Tap (two quick hits, the second kills) and
          // Boomerang (it bounced off another enemy since your last hit).
          const R = state.shotRec;
          const prev = R.hitAt.get(o.target);
          if (o.target.hp <= 0 && prev != null && world.time - prev <= CONFIG.doubleTapSeconds) trick('Double Tap');
          if (o.target.hp <= 0 && R.bounced.has(o.target)) trick('Boomerang');
          R.hitAt.set(o.target, world.time);
          R.bounced.delete(o.target);
        }
        if (o.type === 'combo' && state.phase === 'shot' && state.shotRec && o.event) {
          // An enemy you hit that then meets another: it may come back (Boomerang),
          // and the one it met is combo-knocked (Bank Shot, if it then hits a barrel).
          const R = state.shotRec;
          const other = o.event.a === o.target ? o.event.b : o.event.a;
          if (R.hitAt.has(o.target)) {
            R.bounced.add(o.target);
            R.comboKnocked.add(other);
          }
        }
        if (o.type === 'hit' && state.phase === 'shot') {
          // Poisoned Pen: an enemy you hit yourself is poisoned (see newRound).
          if (card('poisonedPen') && o.target.hp > 0 && !['golem', 'bomb', 'gold'].includes(o.target.type)) o.target.poisoned = true;
          // Bug Zapper (was Wizard's Staff): lightning from the enemy you hit
          // to those near it, once this batch is handled (a golem's pieces
          // need their views first).
          if (card('wizardStaff')) zaps.push(o.target);
        }
        // (A plain combo hit no longer gets a "Combo!" label: far too frequent to call out.)
      } else if (o.type === 'split') {
        // A golem breaks into two smaller ones (they're already on the board).
        sfx.play('crack', 1, { pitch: 0.7 });
        enemyViews.get(o.target)?.die();
        overlay.removeBar(o.target);
        for (const piece of o.pieces) if (piece.hp > 0 && world.balls.includes(piece)) addEnemyView(piece); // (not one already gone)
      } else if (o.type === 'lit') {
        sfx.play('crack', 0.8, { pitch: 1.6 }); // the fuse catches
      } else if (o.type === 'boom') {
        sfx.play('explode', 1);
        if (state.phase === 'enemyMove' || state.phase === 'enemyWait') blasts.push({ x: o.target.x, z: o.target.z, left: CONFIG.camera.enemyBlastBeat }); // the camera holds on it a beat
        objectsView.blast(o.target.x, o.target.z, CONFIG.enemy.types.bomb.blastRadius / 1.4);
        lighting.flash(o.target.x, o.target.z);
        effects.explosion(o.target.x, o.target.z, 1.4);
        hitStop(CONFIG.effects.hitStopBlast);
        looks.blast(level, o.target.x, o.target.z, world.balls, hasFace);
        enemyViews.get(o.target)?.die();
        // It also sets off red barrels and cracks or breaks barrels in reach.
        handleObjects(blastObjects(world, o.target.x, o.target.z, CONFIG.enemy.types.bomb.blastRadius));
      } else if (o.type === 'attack') {
        // A Jekyll's attack on another enemy: no "Combo!", it isn't yours.
        sfx.play('hit', 0.9, { pitch: 0.8 });
        floatAt(o.target, `-${o.amount}`, 'hurt');
        if (o.target.hp > 0) enemyViews.get(o.target)?.ouch(CONFIG.render.enemyOuchSeconds);
      } else if (o.type === 'blast') {
        if (o.amount) floatAt(o.target, `-${o.amount}`, 'hurt');
        if (o.amount && o.target !== hero && o.target.hp > 0) enemyViews.get(o.target)?.ouch(CONFIG.render.enemyOuchSeconds);
      } else if (o.type === 'kill') {
        sfx.play('kill', 0.9);
        // Kill cam: hold tight on it in slow motion (longer for a combo).
        const K = CONFIG.camera;
        // During your shot the kill cam (killCut) already slowed time ahead
        // of the impact; the kill starts its hold.
        if (state.killCut && state.killCut.hold == null) {
          state.killCut.hold = K.killCutHold;
          state.killCut.kx = o.target.x; // the jump cut turns to follow the burst
          state.killCut.kz = o.target.z;
        }
        // (No kill cam in the enemy turn: its camera is busy framing the movers.)
        if (state.phase === 'shot' && !K.killCut) {
          state.killCam = { x: o.target.x, z: o.target.z, left: (o.shotKills ?? 1) >= 2 ? K.comboSeconds : K.killSeconds };
        }
        if (!o.fell) {
          enemyViews.get(o.target)?.die();
          effects.kill(o.target.x, o.target.z, enemyColor(o.target));
        }
        hitStop(CONFIG.effects.hitStopKill);
        overlay.removeBar(o.target);
        // A kill pays gold worth the enemy's level, and now and then drops a
        // sword, shield or potion (not when it fell in a pit: it all falls with it).
        if (!o.fell) {
          // Its gold fountains up like a chest's and is yours at once; any
          // gear or potion it drops still lands on the floor to roll over.
          const n = o.target.level * CONFIG.loot.killGoldPerLevel;
          if (n > 0) {
            itemsView.chestCoins(o.target.x, 0.3, o.target.z, n);
            const gold = addGold(n);
            overlay.float(`+${gold}`, hero.x, hero.z, hero.radius * 2 + 0.8, 'gold', heroFollow());
          }
          scatterCoins(o.target.x, o.target.z, 0, rollEnemyDrops(Math.random, { potionScale: card('doctorsBag') ? CONFIG.cards.doctorsBag : 1 }));
        }
        if (!isTool(o.target) && state.lvl) state.lvl.kills++;
        // Trick shots that need a kill in this shot of yours.
        if (state.phase === 'shot' && state.shotRec) {
          const R = state.shotRec;
          R.kills++;
          if (R.picked.has('potion')) trick('Pit Stop');
          if (R.picked.has('sword')) trick('Bring a Sword to a Ball Fight');
          if (R.chests) trick('This is a Robbery');
          if (R.door) trick('Door Prize');
        }
        // Rogue's Dagger: each kill of your shot throws a dagger (a dagger's own kill doesn't).
        if (card('rogueDagger') && state.phase === 'shot' && !o.byDagger) throwDagger(o.target);
        // Vampirism: every kill heals you.
        if (card('vampirism') && hero.hp > 0 && hero.hp < hero.maxHp) {
          hero.hp = Math.min(hero.maxHp, hero.hp + CONFIG.cards.vampirismHeal);
          floatAt(hero, `+${CONFIG.cards.vampirismHeal} HP`, 'heal', 0.4);
        }
        if (o.shotKills >= 2 && state.phase === 'shot') {
          sfx.play('comboKill', 0.9);
          hud.callout(o.shotKills > 2 ? `Combo Kill ×${o.shotKills}!` : 'Combo Kill!'); // Double or Triple Kill, and the bonus turn, follow as the shot rests
        }
        // Every enemy dead (tool balls aside; a golem's pieces count).
        if (state.lvl && state.lvl.enemies && !state.lvl.swept && !enemies().some((e) => !isTool(e) && e.hp > 0)) {
          state.lvl.swept = true;
          bonus('All Enemies Vanquished', CONFIG.bonuses.allEnemies);
          // ...in one shot, from the start: One-Hit Wonder.
          if (state.phase === 'shot' && state.shotRec?.cleanStart && state.lvl.enemies >= 2) bonus('One-Hit Wonder', CONFIG.bonuses.oneHitWonder);
        }
      } else if (o.type === 'hurt') {
        sfx.play('hurt', 1);
        // Rattle the view: blasts hard, enemy hits by how hard they landed.
        const K = CONFIG.camera;
        rig.shake(o.event ? Math.min(1, K.shakeHit * (0.6 + (o.event.speed ?? 0) / 8)) : K.shakeBlast);
        heroView.flash();
        state.ouch = CONFIG.render.heroOuchSeconds;
        floatAt(hero, `-${o.amount}`, 'hurt');
        // Hit by an enemy, you used to lose a share of your gold, part of it
        // scattered around you to win back (red at first, see
        // updateFlyingCoins). Off now (loot.hurtDropsGold): coins are earned,
        // not found. Never from a blast.
        if (CONFIG.loot.hurtDropsGold && o.event && state.gold > 0) {
          const { lost, scattered } = hurtGold(state.gold);
          state.gold -= lost;
          const pieces = Math.min(scattered, CONFIG.loot.hurtCoinsMaxPieces);
          scatterCoins(hero.x, hero.z, 0, [], splitGold(scattered, pieces).map((value) => ({ kind: 'coin', value, hot: CONFIG.loot.hurtCoinRedSeconds + CONFIG.loot.hurtCoinFadeSeconds })));
        }
        if (hero.hp <= 0 && state.phase !== 'down') knockedOut();
      } else if (o.type === 'blocked') {
        sfx.play('blocked', 1);
        floatAt(hero, 'Blocked!', 'gear');
      } else if (o.type === 'immune') {
        floatAt(hero, 'Blast-proof!', 'gear');
      }
    }
    for (const src of zaps) zap(src);
  }

  // --- Camera ------------------------------------------------------------------
  /**
   * Drama (design doc: "Close calls and the kill cam"): spot close calls,
   * count down the kill cam, and ease the time scale toward slow motion while
   * either is on. Runs on real time; returns the time scale for this frame.
   */
  /** Hit-stop: freeze the action for a beat on a big hit (the camera keeps moving). */
  /**
   * The kill cam's look-ahead: during your shot, every few frames, run a
   * copy of the world a little way ahead; if a kill is coming within
   * killCutLead, slow time now so the impact plays out in slow motion.
   */
  /**
   * What the camera frames in the enemy turn (design doc: "Camerawork"):
   * during the wait, the enemies about to move; then every ball that's
   * moving (knocked balls, bombs and you included), each kept for
   * enemyLinger after it stops so the view doesn't lurch. Enemies coming for
   * you always count, and so do you while they are; any other move only
   * within enemyFrameRange of you. A lit bomb stays framed until it goes
   * off, and its blast for enemyBlastBeat after. With nothing else to show,
   * the closest enemy (with you, if you both fit): there's always an enemy
   * in view on the enemy turn.
   */
  const framed = new Map(); // ball -> real seconds it stays framed
  const blasts = []; // { x, z, left }: bomb blasts kept in frame a beat
  const daggers = []; // Rogue's Dagger: { target, left } in flight

  /**
   * Bug Zapper (was Wizard's Staff): lightning jumps from `src` (an enemy you just hit) to every
   * other enemy within reach with nothing solid between: each takes damage
   * (counting as a combo) and is pushed away from it. Zaps don't zap on.
   */
  function zap(src) {
    const K = CONFIG.cards;
    const near = enemies().filter((e) => e !== src && e.hp > 0 && !e.phased && Math.hypot(e.x - src.x, e.z - src.z) <= K.wizardRange && lineClear(level, src, e));
    if (!near.length) return;
    sfx.play('combo', 0.8, { pitch: 1.7 });
    for (const e of near) {
      const d = Math.hypot(e.x - src.x, e.z - src.z) || 1;
      e.vx += ((e.x - src.x) / d) * K.wizardPush;
      e.vz += ((e.z - src.z) / d) * K.wizardPush;
      effects.bolt(src.x, src.z, e.x, e.z);
      handleOutcomes(combat.strike(world, e, K.wizardDamage));
    }
  }

  /** Does any enemy see you right now (the same rule as the "!": a Jekyll only once it's enraged)? */
  function seenByAny() {
    return enemies().some((e) => !isTool(e) && e.hp > 0 && (e.type === 'jekyll' ? e.enraged : canSee(level, e, hero, world.balls, world.statics)));
  }

  /** Rogue's Dagger: after a kill, a dagger flies from you at the nearest other enemy you can see. */
  function throwDagger(killed) {
    const seen = enemies().filter((e) => e !== killed && e.hp > 0 && !e.phased && !isTool(e) && canSee(level, e, hero, world.balls, world.statics));
    if (!seen.length) return;
    const dist = (e) => Math.hypot(e.x - hero.x, e.z - hero.z);
    const target = seen.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const seconds = Math.max(0.12, dist(target) / CONFIG.cards.daggerSpeed);
    daggers.push({ target, left: seconds });
    effects.dagger(hero.x, hero.z, target, seconds);
    sfx.play('ball', 0.5, { pitch: 1.8 });
  }

  /** Daggers in flight land: damage, counted as a combo (a kill they make throws no dagger). */
  function updateDaggers(dt) {
    for (let i = daggers.length - 1; i >= 0; i--) {
      const d = daggers[i];
      if ((d.left -= dt) > 0) continue;
      daggers.splice(i, 1);
      if (d.target.hp <= 0 || !world.balls.includes(d.target)) continue;
      const out = combat.strike(world, d.target, CONFIG.cards.daggerDamage);
      for (const o of out) if (o.type === 'kill') o.byDagger = true;
      handleOutcomes(out);
    }
  }
  function enemyFraming(realDt) {
    const C = CONFIG.camera;
    const attackers = new Set(state.moves.filter((m) => (m.kind === 'lunge' && (!m.target || m.target === hero)) || m.hunting).map((m) => m.enemy));
    const counts = (b) => b === hero || attackers.has(b) || Math.hypot(b.x - hero.x, b.z - hero.z) <= C.enemyFrameRange;
    const points = [];
    if (state.phase === 'enemyWait') {
      framed.clear();
      for (const m of state.moves) if (m.enemy.hp > 0 && counts(m.enemy)) points.push(m.enemy);
    } else {
      for (const b of world.balls) {
        const litBomb = b.type === 'bomb' && b.fuse != null;
        if (((b.vx !== 0 || b.vz !== 0) && !b.fallen && counts(b)) || litBomb) framed.set(b, C.enemyLinger);
      }
      for (const [b, left] of framed) {
        if (left <= 0 || !world.balls.includes(b)) {
          framed.delete(b);
          continue;
        }
        if (b.vx === 0 && b.vz === 0) framed.set(b, left - realDt);
        points.push(b);
      }
      for (let i = blasts.length - 1; i >= 0; i--) {
        if ((blasts[i].left -= realDt) <= 0) blasts.splice(i, 1);
        else points.push(blasts[i]);
      }
    }
    // You, while an enemy is coming for you.
    if (points.length && [...attackers].some((e) => e.hp > 0) && !points.includes(hero)) points.push(hero);
    if (!points.length) {
      const closest = enemies()
        .filter((e) => e.hp > 0 && !isTool(e))
        .reduce((a, e) => (!a || Math.hypot(e.x - hero.x, e.z - hero.z) < Math.hypot(a.x - hero.x, a.z - hero.z) ? e : a), null);
      if (closest) points.push(closest, ...(rig.widthFor([closest, hero]) <= C.enemyMaxWidth ? [hero] : []));
    }
    return points;
  }

  // The jump cut's camera: a perspective view from a spot near the impact
  // (chooseVantage), turning to follow your ball and then the kill.
  const cutCam = new THREE.PerspectiveCamera(CONFIG.camera.killCutFov, 9 / 16, 0.05, 200);
  const cutLook = new THREE.Vector3();
  const faceDir = new THREE.Vector3();
  const BALL_Y = CONFIG.ball.diameter / 2;

  let predictTick = 0;
  function watchForKills() {
    const C = CONFIG.camera;
    if (!C.killCut || state.phase !== 'shot' || state.killCut || hero.inert) return;
    if (++predictTick % C.killCutEvery) return;
    const elastic = card('elasticity') ? { kick: CONFIG.cards.elasticityKick, perBumper: CONFIG.cards.elasticityKicksPerBumper } : null;
    const p = predictKill(world, hero, C.killCutLook, state.kicked, elastic, combat.shotState());
    if (!p || p.t > C.killCutLead) return;
    if (C.killCutWhich === 'combo' && combat.shotKills + p.index < 1) return;
    // Jump cut: to a spot that sees your ball and the impact. With none,
    // no kill cam at all: slow motion on the usual view, unframed, just
    // reads as a glitch. (It keeps looking: a spot may open up as you close in.)
    if (!C.killCutJump) return;
    const toward = { x: rig.toCamera.x, z: rig.toCamera.z };
    const spot = chooseVantage(level, world.balls, hero, { x: p.x, z: p.z }, { x: hero.vx, z: hero.vz }, toward);
    if (!spot) return;
    state.killCut = { target: p.target, x: p.x, z: p.z, at: world.time + p.t, hold: null, cam: spot };
    cutCam.position.set(spot.x, spot.y, spot.z);
    const s = C.killCutLeadShare;
    cutLook.set(hero.x + (p.x - hero.x) * s, BALL_Y, hero.z + (p.z - hero.z) * s);
    cutCam.lookAt(cutLook);
  }

  /** The jump cut's view this frame: on your ball until the kill, then on where it died (the loot bursting). */
  function aimCutCam(realDt) {
    const k = state.killCut;
    const s = CONFIG.camera.killCutLeadShare;
    const on = k.kx != null ? { x: k.kx, z: k.kz } : { x: hero.x + (k.x - hero.x) * s, z: hero.z + (k.z - hero.z) * s };
    const f = 1 - Math.exp(-CONFIG.camera.killCutTrack * realDt);
    cutLook.x += (on.x - cutLook.x) * f;
    cutLook.z += (on.z - cutLook.z) * f;
    cutLook.y = BALL_Y;
    cutCam.lookAt(cutLook);
  }

  function hitStop(seconds) {
    state.hitStop = Math.max(state.hitStop ?? 0, seconds);
  }

  function updateDrama(realDt) {
    const C = CONFIG.camera;
    const live = state.phase === 'shot' || state.phase === 'enemyMove';
    // Your own kill cam (a knockout) runs in the 'down' phase.
    if (state.killCam?.hero && state.phase === 'down') {
      state.killCam.left -= realDt;
      if (state.killCam.left <= 0) state.killCam = null;
    } else if (state.killCam) {
      state.killCam.left -= realDt;
      if (state.killCam.left <= 0 || !live) state.killCam = null;
    }
    // The kill cam's slow motion: from just before a predicted kill until
    // killCutHold after it (or a moment past when it was due, if it never came).
    if (state.killCut) {
      const k = state.killCut;
      if (!live) state.killCut = null;
      else if (k.hold != null) {
        k.hold -= realDt;
        if (k.hold <= 0) state.killCut = null;
      } else if (world.time > k.at + 0.3) state.killCut = null;
    }
    // A close call: you and an enemy about to meet (whichever is moving).
    let best = null;
    if (C.closeCalls && live && !hero.phased) {
      for (const e of enemies()) {
        if (e.hp <= 0 || e.phased || isTool(e)) continue;
        const dx = e.x - hero.x;
        const dz = e.z - hero.z;
        const d = Math.hypot(dx, dz);
        const gap = d - hero.radius - e.radius;
        const closing = ((hero.vx - e.vx) * dx + (hero.vz - e.vz) * dz) / (d || 1);
        if (gap > C.closeGap || closing < C.closeMinSpeed || gap / closing > C.closeTime) continue;
        if (!best || gap / closing < best.t) best = { enemy: e, t: gap / closing };
      }
    }
    if (best) state.closeCall = { enemy: best.enemy, left: C.closeHold };
    else if (state.closeCall) {
      state.closeCall.left -= realDt;
      if (state.closeCall.left <= 0 || !live) state.closeCall = null;
    }
    // (Your own kill cam at a knockout runs at full speed.)
    const target = state.killCut || (state.killCam && !state.killCam.hero) ? C.killSlow : state.closeCall ? C.closeSlow : 1;
    state.timeScale = (state.timeScale ?? 1) + (target - (state.timeScale ?? 1)) * (1 - Math.exp(-C.timeEaseRate * realDt));
    if (Math.abs(state.timeScale - 1) < 0.01 && target === 1) state.timeScale = 1;
    if (state.hitStop > 0) {
      state.hitStop -= realDt;
      return 0;
    }
    return state.timeScale;
  }

  // --- Debug overlay -----------------------------------------------------------
  // Performance readout: press p.
  const perfView = document.createElement('pre');
  perfView.className = 'perf';
  perfView.hidden = true;
  container.appendChild(perfView);

  /** Skip to the next level (n, or three quick taps on the gold counter); not mid-death or between levels. */
  function skipLevel() {
    if (['won', 'pick', 'exiting', 'down', 'score', 'shop'].includes(state.phase)) return;
    loadLevel(levelIndex + 1);
    levelBanner();
  }
  let goldTaps = [];
  container.querySelector('.hud-left').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault(); // no double-tap zoom or text selection eating the taps
    goldTaps = [...goldTaps.filter((t) => e.timeStamp - t < 900), e.timeStamp];
    if (goldTaps.length >= 3) {
      goldTaps = [];
      skipLevel();
    }
  });

  const debug = document.createElement('pre');
  debug.className = 'debug';
  debug.hidden = !new URLSearchParams(location.search).has('debug');
  container.appendChild(debug);

  window.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('editing')) return; // the level editor has the keyboard
    if (e.key === 'd' || e.key === '`') debug.hidden = !debug.hidden;
    if (e.key === 'p') perfView.hidden = !perfView.hidden;
    if (e.key === 'r' && state.phase === 'aim') respawn();
    if (e.key === 'n') skipLevel();
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
    // killCutFov is the angle across the screen: the vertical one follows from the shape.
    const across = THREE.MathUtils.degToRad(CONFIG.camera.killCutFov);
    cutCam.aspect = w / h;
    cutCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(across / 2) / Math.min(1, w / h)));
    cutCam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // --- Loop --------------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let fps = 60;

  /** Frame-rate bookkeeping, the adaptive resolution, and the perf readout. */
  function trackPerf(realDt, jsMs) {
    const R = CONFIG.render;
    perf.frames++;
    perf.time += realDt;
    perf.js += jsMs;
    perf.worst = Math.max(perf.worst, realDt);
    if (perf.time < R.adaptiveSeconds) return;
    const rate = perf.frames / perf.time;
    if (perf.settle > 0) perf.settle--;
    else if (R.adaptive && rate < R.adaptiveMinFps && perf.ratio > R.minPixelRatio && !document.hidden) {
      perf.ratio = Math.max(R.minPixelRatio, perf.ratio - R.adaptiveStep);
      renderer.setPixelRatio(perf.ratio);
      resize();
    }
    if (!perfView.hidden) {
      const c = renderer.domElement;
      perfView.textContent = [
        `${rate.toFixed(0)} fps  worst ${(perf.worst * 1000).toFixed(0)} ms`,
        `script ${(perf.js / perf.frames).toFixed(1)} ms/frame`,
        `res ×${perf.ratio.toFixed(2)}  ${c.width}×${c.height}`,
        `draws ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k`,
      ].join('\n');
    }
    perf.frames = 0;
    perf.time = 0;
    perf.js = 0;
    perf.worst = 0;
  }

  function frame(now) {
    // The level editor covers the game: stop simulating and drawing it
    // meanwhile (rendering the 3D board unseen behind the editor cost a phone
    // its whole GPU budget, and could bring the page down).
    if (document.body.classList.contains('editing')) {
      last = now;
      requestAnimationFrame(frame);
      return;
    }
    const frameStart = performance.now();
    // Paused (a card is open): time stands still, but the scene keeps drawing.
    const realDtRaw = (now - last) / 1000;
    const realDt = hud.paused ? 0 : Math.min(0.25, realDtRaw);
    last = now;
    fps += (1 / Math.max(realDt, 1e-3) - fps) * 0.05;
    // Slow motion (close calls and the kill cam): game time runs at
    // state.timeScale; the camera keeps real time so it stays smooth.
    watchForKills();
    const dt = realDt * updateDrama(realDt);
    // Faces turn to the active camera: the kill cam's while it's on. Along
    // its view direction (not toward its position from each ball): a face
    // sprite always lies flat to the screen, so only then does it sit flat
    // on its ball, instead of tilting into the sphere off the middle of a
    // wide close view.
    if (state.killCut?.cam) setFaceView(cutCam.getWorldDirection(faceDir).negate());
    else setFaceView(rig.toCamera);

    const step = CONFIG.physics.step;
    acc += dt;
    let steps = 0;
    while (acc >= step && steps < CONFIG.physics.maxStepsPerFrame) {
      watchDodges();
      // Stone Shoes: heavy while the enemies move, so their hits barely shift you.
      hero.mass = card('stoneShoes') && (state.phase === 'enemyMove' || state.phase === 'enemyWait') ? CONFIG.cards.stoneShoesMass : undefined;
      stepWorld(world, step);
      handleFalls();
      if (hero.inert) {
        jiggleSkull(step);
        bleedSkull();
      }
      stepIce(world, level, ice, state.move ?? 0);
      if (state.phase === 'shot' || state.phase === 'enemyMove') tickBombs(step);
      looks.noteHits(world.events, hasFace);
      rollGold(step);
      settleGhosts();
      dampStalls(step);
      if (state.phase === 'exiting') {
        // Beaming out: the other balls roll on, but nothing happens to you.
        world.events.length = 0;
        acc -= step;
        steps++;
        continue;
      }
      // Both read this step's events before handleEvents clears them.
      const outcomes = combat.resolve(world, hero);
      strikeGold();
      const objectOutcomes = resolveObjects(world, hero, Math.random, { heroBarrelHits: card('barrelOfFun') ? 1 : CONFIG.objects.barrelHits });
      // Rubber enemies: your ball comes off them at double speed, and they off you.
      const R = CONFIG.enemy.types.rubber;
      applyRubberRebound(world, hero, R.rebound, R.maxRebound);
      // Barrels kick every ball on like pinball bumpers; with Elasticity,
      // barrels, chests and enemies kick your ball, harder.
      applyBumperKicks(world, state.kicked, CONFIG.aim.maxLaunchSpeed, card('elasticity') ? { ball: hero, kick: CONFIG.cards.elasticityKick, perBumper: CONFIG.cards.elasticityKicksPerBumper } : null);
      if (state.phase === 'shot' && world.events.some((ev) => ev.ball === hero || ev.a === hero || ev.b === hero)) state.contacts?.push({ x: hero.x, z: hero.z });
      handleEvents(outcomes, objectOutcomes);
      checkPickups();
      checkDoors();
      if (state.phase !== 'down' && state.phase !== 'won' && state.phase !== 'pick' && state.phase !== 'exiting' && state.phase !== 'score' && state.phase !== 'shop' && tileAt(level, Math.floor(hero.x), Math.floor(hero.z)) === 'exit') {
        reachExit();
        break;
      }
      acc -= step;
      steps++;
    }
    if (steps === CONFIG.physics.maxStepsPerFrame) acc = 0;

    if (state.phase === 'exiting') updateExit(dt);
    switch (state.phase) {
      case 'shot':
        // Your shot came to rest: lit bombs go off first, and the shot
        // carries on (their blast counts toward it) until everything settles.
        if (isAtRest(world) && (bombsPending() || daggers.length)) break; // and daggers land
        if (isAtRest(world)) {
          endMoveForGold();
          // A sword breaks as the shot in which it hit an enemy comes to rest.
          if (endSwordShot(hero)) {
            overlay.float('Sword broke!', hero.x, hero.z, hero.radius * 2 + 1, 'gear', heroFollow());
            sfx.play('blocked', 0.6, { pitch: 0.8 });
          }
          // Double Kill or Triple Kill (3 or more), judged now the shot has played out.
          if (combat.shotKills >= 3) trick('Triple Kill');
          else if (combat.shotKills === 2) trick('Double Kill');
          // A trick shot (any number of them: one bonus turn, no stacking)
          // earns a bonus turn, as a pot does in pool: the enemy phase is
          // skipped and you shoot again. With Assassin's Boots, any kill
          // does, as long as no enemy sees where you stopped.
          const tricks = state.shotRec?.tricks ?? [];
          const unseenKill = card('balletShoes') && combat.shotKills >= 1 && !seenByAny();
          if (tricks.length || unseenKill) {
            state.phase = 'aim';
            newRound();
            // Every bonus turn says what earned it.
            const cause = tricks.length === 1 ? tricks[0] : tricks.length ? `${tricks.length} trick shots` : "Assassin's Boots";
            hud.callout('Bonus turn!', 'Shoot again', 0, cause);
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
        // (And a bomb's blast gets its beat on screen before your turn comes.)
        if (isAtRest(world) && !bombsPending() && !blasts.length) {
          state.moves = [];
          endMoveForGold();
          state.phase = 'aim';
          newRound();
          state.returnBoost = CONFIG.camera.returnBoostSeconds; // snap back to you quickly
        }
        break;
      case 'down': {
        // "You Died!" about halfway through the roll; you come back once it
        // has been up for deathScreenSeconds and the skull has stopped (or
        // the longest roll allowed is over).
        state.downTime += dt;
        // (Fallen in a pit: give the fall a moment to play.)
        const resting = speedOf(hero) <= CONFIG.physics.stopThreshold && (!state.fellIn || state.downTime >= CONFIG.render.fallSeconds);
        const stopped = resting || state.downTime >= CONFIG.hero.skullRollMaxSeconds;
        if (!state.deathShown) {
          if (state.downTime >= state.deathAt || stopped) showDeathScreen();
        } else if ((state.timer -= dt) <= 0 && stopped) afterKnockout();
        break;
      }
      case 'won':
        state.timer -= dt;
        if (state.timer <= 0) newRun();
        break;
    }

    let seePath = null;
    if (state.aiming) {
      const shot = aimShot();
      state.shownShot = shot; // what release will fire
      const others = world.balls.filter((b) => b !== hero);
      const preview = shot.cancel ? null : previewPath(level, hero, shot.dirX, shot.dirZ, shot.speed, others, world.statics, {
            kick: card('elasticity') ? CONFIG.cards.elasticityKick : 0,
            barrelHits: card('barrelOfFun') ? 1 : CONFIG.objects.barrelHits,
            ice,
            move: (state.move ?? 0) + 1,
          });
      aimView.show(hero, shot, preview, rig.viewWidth / rig.aimStartWidth);
      state.shownPreview = preview; // debugging: the path the preview showed
      seePath = preview?.points ?? null;
    } else if (state.phase === 'aim') {
      aimView.showTurn(hero, dt);
    } else {
      aimView.hide();
    }
    // While you aim, walls in front of your ball and aim path turn see-through.
    setSeeThrough(hero, seePath, rig.camera.getWorldDirection(viewDir), dt);

    // Red rings under every enemy moving this round, from the telegraph until
    // the moves end (when enemy.turnRings is on).
    const ringed = new Set(CONFIG.enemy.turnRings && (state.phase === 'enemyWait' || state.phase === 'enemyMove') ? state.moves.map((m) => m.enemy) : []);
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
      state.phase === 'down'
        ? 'dead'
        : state.ouch > 0
        ? 'ouch'
        : enemyTurn
          ? 'worried'
          : state.aiming || state.phase === 'shot'
            ? 'determined'
            : 'confident',
    );
    heroView.update(dt);
    objectsView.update(dt);
    updateDaggers(dt);
    effects.update(dt, renderer.getDrawingBufferSize(bufSize).y / ((rig.camera.top - rig.camera.bottom) / rig.camera.zoom));
    iceView.update(ice, state.move ?? 0, dt);
    doorsView.update(dt);
    objectsView.fadeChests(hero, state.aiming, dt);
    itemsView.sync(world.items);
    updateFlyingCoins(dt);
    updateCardPicks(dt);
    pullCoins(dt);
    itemsView.update(dt, rig.viewWidth / CONFIG.camera.baseViewWidth);
    for (const [enemy, view] of enemyViews) {
      view.update(dt);
      if (view.gone) {
        scene.remove(view.object);
        view.dispose();
        enemyViews.delete(enemy);
      }
    }

    // "!" over every enemy that can see you right now, even mid-shot. An
    // enemy that has already hit you this enemy move is spent: it calms down
    // and shows no "!" until everything rests, so the balls still rolling at
    // you that can hurt you stand out.
    const enemyMove = state.phase === 'enemyWait' || state.phase === 'enemyMove';
    const lungers = new Set(enemyMove ? state.moves.filter((m) => m.kind === 'lunge').map((m) => m.enemy) : []);
    for (const enemy of enemies()) {
      if (isTool(enemy)) continue; // tool balls never watch or attack, so no "!"
      if (hero.inert) {
        // You're knocked out: every enemy turns passive. Calm, no "!" (Jekylls
        // cool off too), but its eyes follow your rolling skull.
        enemy.watching = hero;
        enemy.enraged = false;
        overlay.setAlert(enemy, false, false);
        enemyViews.get(enemy)?.setAngry(false);
        continue;
      }
      if (enemy.type === 'jekyll') {
        // Calm and blind to you until provoked; enraged, it shows it (whoever it'll go for).
        // Once its attack connects (you or an enemy), it's spent and calm again.
        const lunging = lungers.has(enemy) && !combat.hasHitHero(enemy);
        const on = enemy.enraged || lunging;
        enemy.watching = on ? (jekyllTarget(enemy) ?? null) : null;
        overlay.setAlert(enemy, on, lunging);
        enemyViews.get(enemy)?.setAngry(on);
        continue;
      }
      // An enemy that has already hit you this enemy move is spent: no "!"
      // until everything rests (so the balls still rolling at you stand
      // out), but it stays angry for the rest of its turn, even knocked back.
      if (enemyMove && combat.hasHitHero(enemy)) {
        enemy.watching = hero;
        overlay.setAlert(enemy, false, false);
        enemyViews.get(enemy)?.setAngry(true);
        continue;
      }
      const lunging = lungers.has(enemy);
      const aware = lunging || canSee(level, enemy, hero, world.balls, world.statics);
      if (aware && state.lvl && state.phase !== 'exiting' && state.phase !== 'score') state.lvl.seen = true; // spotted: no "Never seen" bonus
      enemy.watching = aware ? hero : null;
      overlay.setAlert(enemy, aware, lunging);
      enemyViews.get(enemy)?.setAngry(aware);
    }

    updateLooks(dt, enemyMove);

    if (state.aiming) {
      // Aiming: zoom out with shot power, anchored on the ball.
      const fill = aimShot().fill;
      const from = rig.aimStartWidth;
      // Out with shot power, and always far enough to show the whole path.
      const byPower = from + (Math.max(from, CONFIG.camera.aimMaxWidth) - from) * fill;
      rig.aimZoom(hero, Math.max(byPower, seePath ? rig.aimFitWidth(hero, seePath) : 0), realDt);
    } else if (state.panned && state.phase !== 'aim') {
      state.panned = false; // you shot (or the turn moved on): follow the play again
    } else if (state.panned) {
      // Looking around the map (a drag off the ball): hold the view where you left it.
    } else {
      // Closeness (design doc: "Camerawork"): the camera stays on you.
      const C = CONFIG.camera;
      const boost = state.returnBoost > 0 ? C.returnBoost : 1;
      if (state.phase === 'down') {
        // Knocked out: closing in on your skull as it slows, ending with it
        // filling skullFill of the view.
        const tightest = (2 * hero.radius) / C.skullFill;
        // First the kill cam: tight on the skull, in slow motion.
        if (state.killCam?.hero) rig.focus(hero, C.killWidth, realDt, C.closeZoomRate);
        else rig.focus(hero, tightest + speedOf(hero) * C.skullSpeedWidth, realDt, C.skullZoomRate);
      } else if (state.phase === 'aim') {
        // Your turn, at rest: tight on your ball (restFill of the view);
        // aiming zooms out from here with power.
        rig.focus(hero, CONFIG.ball.diameter / C.restFill, realDt, C.restZoomRate, boost);
      } else {
        const fast = Math.min(1, speedOf(hero) / CONFIG.aim.maxLaunchSpeed);
        const tight = CONFIG.ball.diameter / C.restFill;
        const enemyTurn = state.phase === 'enemyWait' || state.phase === 'enemyMove';
        if (state.killCam && !enemyTurn) {
          // Kill cam: tight on the kill (and you, if you're close by).
          const k = state.killCam;
          const d = Math.hypot(hero.x - k.x, hero.z - k.z);
          const near = d < C.killWidth * 1.2;
          rig.focus(near ? { x: (hero.x + k.x) / 2, z: (hero.z + k.z) / 2 } : k, Math.max(C.killWidth, near ? d * 1.3 + 1.2 : 0), realDt, C.closeZoomRate);
        } else if (state.closeCall) {
          // Close call: tight on you and the enemy you're closing on.
          const e = state.closeCall.enemy;
          const d = Math.hypot(hero.x - e.x, hero.z - e.z);
          rig.focus({ x: (hero.x + e.x) / 2, z: (hero.z + e.z) / 2 }, Math.max(C.closeWidth, d * 1.3 + 1.2), realDt, C.closeZoomRate);
        } else if (enemyTurn) {
          // The enemy turn: frame what's moving (enemyFraming), as tight as
          // it can; nothing moving, back to you.
          const points = enemyFraming(realDt);
          state.framePoints = points; // debugging: what the camera is fitting
          if (points.length) rig.frame(points, tight, realDt, 1, C.enemyMaxWidth);
          else rig.focus(hero, tight, realDt, C.restZoomRate);
        } else {
          // Your shot (and the rest): centred on you, widening (fast) to keep
          // every moving ball in view, narrowing (slowly) after; speed pulls
          // it out a little too.
          const points = world.balls.filter((b) => b !== hero && (b.vx !== 0 || b.vz !== 0));
          state.framePoints = points; // debugging: what the camera is fitting
          rig.follow(hero, points, tight + (C.maxViewWidth - tight) * fast, C.maxFrameWidth, realDt, C.followZoomOutRate);
        }
      }
      if (state.returnBoost > 0) state.returnBoost = rig.settled ? 0 : state.returnBoost - dt;
    }
    rig.updateShake(realDt);
    lighting.update(realDt, hero, world.balls, world.statics, level.exits, level.lavas ?? []);
    // The kill cam's jump cut renders from its own camera; the HP bars and
    // labels (placed for the usual camera) hide meanwhile.
    const cutting = !!state.killCut?.cam;
    container.classList.toggle('kill-cut', cutting);
    lighting.setCut(cutting);
    if (cutting) aimCutCam(realDt);
    renderer.render(scene, cutting ? cutCam : rig.camera);
    overlay.setCamera(cutting ? cutCam : rig.camera); // your sword and shield stay beside you in the cut
    overlay.update();
    trackPerf(Math.min(0.25, realDtRaw), performance.now() - frameStart);
    hud.setGold(state.gold);
    hud.setKeys(state.keys);
    hud.setCards(state.cards);
    hud.setDanger(hero.hp > 0 && hero.hp <= CONFIG.render.dangerHp && hero.maxHp > CONFIG.render.dangerHp && state.phase !== 'down');
    // Whose turn it is, always shown: yours while you aim and your shot rolls,
    // the enemies' from the first enemy move until it's back to you.
    // (Not during your death scene: no "Enemy Turn" label pops up then.)
    if (state.phase !== 'down') hud.setTurn(['enemyWait', 'enemyMove'].includes(state.phase) ? 'enemy' : 'player');
    overlay.setGear(hero, {
      sword: hero.sword ? 'whole' : null,
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
        `enemies ${enemies().length} left   gold ${state.gold}   atk ${hero.atk}${hero.sword ? ` (sword ${hero.sword})` : ''}${hero.shield ? '  shield' : ''}`,
        `[d] debug  [r] respawn  [n] next level`,
      ].join('\n');
    }

    requestAnimationFrame(frame);
  }
  dealStartingCards();
  loadLevel(startIndex);
  levelBanner();
  requestAnimationFrame(frame);

  // Handy for poking at the game from the browser console.
  const api = {
    get level() {
      return level;
    },
    get world() {
      return world;
    },
    hero,
    heroView,
    objectsView,
    lighting,
    effects,
    state,
    rig,
    renderer,
    enemyViews, // debugging
    respawn,
    loadLevel,
    /** The level being played, as { id, name, text } (the level editor opens it). */
    get levelDef() {
      return levels[levelIndex];
    },
    /**
     * Play a level from the editor: it replaces the run's level with the same
     * id (for this session only), or is slotted in at the current place.
     */
    playLevel(def) {
      // Marked as a test: finishing it goes back to the editor, not on through the run.
      let i = levels.findIndex((l) => l.id === def.id);
      if (i < 0) levels.splice((i = levelIndex), 0, { ...def, test: true });
      else levels[i] = { ...levels[i], ...def, test: true };
      loadLevel(i);
      levelBanner();
    },
    onTestComplete: null, // set by main.js: reopen the level editor
  };
  return api;
}
