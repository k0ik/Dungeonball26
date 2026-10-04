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
import { createWorld, createBall, stepWorld, isAtRest, speedOf, overlapsSolid, applyBumperKicks, applyRubberRebound } from './physics.js';
import { createCombat, createEnemy } from './combat.js';
import { canSee } from './sight.js';
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
  const hud = createHud(container);
  const sfx = createAudio(rig.camera);

  // The hero persists across levels; the level, its world and its view don't.
  const hero = createBall({ x: 0, z: 0, kind: 'hero', id: 'hero' });
  Object.assign(hero, { atk: CONFIG.hero.atk, maxHp: CONFIG.hero.maxHp, hp: CONFIG.hero.maxHp, shield: false, sword: 0 });
  const heroView = createBallView(hero, { color: CONFIG.colors.hero, silver: true, toCamera: rig.toCamera });
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
    gold: 0, // the score
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
    comboKillAt: -Infinity, // when the last "Combo Kill!" banner showed
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
   * Bomb fuses run on your shots: a bomb lit at any point is armed when your
   * next shot starts (its fuse burns shorter), and goes off when that shot
   * comes to rest. Bombs lit during that shot wait for the one after.
   */
  function armBombs() {
    for (const bomb of enemies()) {
      if (bomb.type === 'bomb' && bomb.fuse === 1) bomb.fuse = 0;
    }
  }

  /** Your shot came to rest: armed bombs go off. Returns true if any did. */
  function detonateArmed() {
    let boom = false;
    for (const bomb of enemies().filter((e) => e.type === 'bomb' && e.fuse === 0)) {
      if (!world.balls.includes(bomb)) continue; // already gone in another's blast
      boom = true;
      handleOutcomes(combat.bombBlast(world, bomb, hero));
    }
    return boom;
  }

  function loadLevel(i) {
    levelIndex = (i + levels.length) % levels.length;
    const def = levels[levelIndex];
    hud.setMessage(def.message ?? null);
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
      let type = testing && E.testTool && n % 2 ? E.testTool : testing ? E.testType : null;
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
    hero.x = start.x;
    hero.z = start.z;
    hero.vx = hero.vz = 0;
    if (heal) hero.hp = hero.maxHp;
    hero.inert = false;
    heroView.setSkull(false);
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
    armBombs(); // bombs lit before this shot go off when it comes to rest
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
        moves.push({ enemy, from, kind: 'lunge' });
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

  // Death screen: once your skull has rolled to a stop (at most
  // skullRollMaxSeconds), the screen darkens for deathScreenSeconds; input is
  // blocked throughout. The respawn (or game-over restart) happens under it,
  // just before it lightens, and play carries on.
  function knockedOut() {
    state.phase = 'down';
    // Your ball becomes a bone-white skull that rolls on, bouncing off
    // everything but touching nothing: no hits, no barrels, chests or pickups.
    hero.inert = true;
    heroView.setSkull(true);
    // You lose any gear you held (a game over too).
    hero.sword = 0;
    hero.shield = false;
    state.deathShown = false;
    state.timer = CONFIG.hero.skullRollMaxSeconds;
    state.aiming = false;
    aimView.hide();
    sfx.play(state.lives - 1 > 0 ? 'down' : 'gameover', 0.9);
  }

  function showDeathScreen() {
    state.deathShown = true;
    state.timer = CONFIG.hero.deathScreenSeconds;
    const left = state.lives - 1;
    hud.showScreen('You Died!', left > 0 ? `${left} ${left === 1 ? 'life remains' : 'lives remain'}` : 'Game Over');
  }

  function afterKnockout() {
    for (const b of world.balls) b.vx = b.vz = 0; // anything still rolling stops under the dark screen
    state.lives--;
    if (state.lives > 0) {
      respawn({ heal: true });
    } else {
      // Game over: the level starts from scratch, with the HP and gold you
      // entered it with, but no gear (the knockout took it).
      const { hp, atk, gold, cards } = state.entry;
      state.cards = [...cards];
      applyCards();
      // Doppleganger: +1 to the lives a game over restores.
      state.lives = CONFIG.hero.lives + (has(state.cards, 'doppleganger') ? 1 : 0);
      Object.assign(hero, { hp, atk, shield: false, sword: 0 });
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
    state.exit = { t: 0, vx: hero.vx, vz: hero.vz, cx: col + 0.5, cz: row + 0.5, beaming: false, fading: false };
    hero.vx = hero.vz = 0;
    hero.phased = true; // nothing bumps it now
    state.phase = 'exiting';
    sfx.play('exit', 0.8);
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
    if (!e.fading && e.t >= beamEnd - X.exitFadeSeconds * 0.5) {
      e.fading = true;
      hud.fade(true, X.exitFadeSeconds);
    }
    if (e.t >= beamEnd + X.exitFadeSeconds * 0.5) finishExit();
  }

  function finishExit() {
    state.exit = null;
    hero.phased = false;
    hud.fade(false, CONFIG.render.exitFadeSeconds);
    // A level played from the level editor: no next level; reset it and hand back to the editor.
    if (levels[levelIndex].test) {
      loadLevel(levelIndex);
      hud.banner('Test complete!', 'Back to the editor', 1.2);
      api.onTestComplete?.();
      return;
    }
    if (levelIndex + 1 < levels.length) {
      loadLevel(levelIndex + 1); // cards come from chests now, not here
      levelBanner();
      return;
    }
    state.phase = 'won';
    state.timer = CONFIG.hero.runCompleteSeconds;
    sfx.play('win', 0.9);
    hud.showScreen('Run Complete!', `${state.gold} gold`, 'win');
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
      const hand = takeCard(state.cards, id, replace);
      if (!hand) return;
      state.cards = hand;
      if (id === 'doppleganger') state.lives += 1; // kept even if the card is later replaced
      sfx.play('gear', 0.8);
      applyCards();
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

  /** Effects that sit on the hero rather than being checked as they happen. */
  function applyCards() {
    hero.friction = card('athletic') ? CONFIG.cards.athleticFriction : undefined;
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
    const loot = rollLoot(Math.random, { gearWeight: card('junkHunter') ? CONFIG.cards.junkHunter : 1 });
    if (loot.kind === 'gold') scatterCoins(x, z, loot.value);
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
        if (o.victim) handleOutcomes(combat.explosion(world, o.victim, hero)); // none when a bomb's blast set it off
      }
    }
  }

  function handleEvents(outcomes, objectOutcomes = []) {
    const A = CONFIG.audio;
    const damaging = new Set(outcomes.map((o) => o.event).filter(Boolean));
    const objectHits = new Set(objectOutcomes.map((o) => o.obj));
    for (const ev of world.events) {
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
        // Every enemy after the first one damaged this shot is a combo.
        if (o.chain >= 2) floatAt(o.target, 'Combo!', 'combo-label', 0.8);
      } else if (o.type === 'split') {
        // A golem breaks into two smaller ones (they're already on the board).
        sfx.play('crack', 1, { pitch: 0.7 });
        enemyViews.get(o.target)?.die();
        overlay.removeBar(o.target);
        for (const piece of o.pieces) addEnemyView(piece);
      } else if (o.type === 'lit') {
        sfx.play('crack', 0.8, { pitch: 1.6 }); // the fuse catches
      } else if (o.type === 'boom') {
        sfx.play('explode', 1);
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
      } else if (o.type === 'blast') {
        if (o.amount) floatAt(o.target, `-${o.amount}`, 'hurt');
      } else if (o.type === 'kill') {
        sfx.play('kill', 0.9);
        // Kill cam: hold tight on it in slow motion (longer for a combo).
        if (state.phase === 'shot' || state.phase === 'enemyMove') {
          const K = CONFIG.camera;
          state.killCam = { x: o.target.x, z: o.target.z, left: (o.shotKills ?? 1) >= 2 ? K.comboSeconds : K.killSeconds };
        }
        enemyViews.get(o.target)?.die();
        effects.kill(o.target.x, o.target.z, enemyColor(o.target));
        hitStop(CONFIG.effects.hitStopKill);
        overlay.removeBar(o.target);
        // A kill drops coins worth the enemy's level where it died.
        // A kill scatters coins worth the enemy's level around where it died,
        // and now and then a sword, shield or potion too.
        scatterCoins(o.target.x, o.target.z, o.target.level * CONFIG.loot.killGoldPerLevel, rollEnemyDrops());
        // Vampirism: every kill heals you.
        if (card('vampirism') && hero.hp > 0 && hero.hp < hero.maxHp) {
          hero.hp = Math.min(hero.maxHp, hero.hp + CONFIG.cards.vampirismHeal);
          floatAt(hero, `+${CONFIG.cards.vampirismHeal} HP`, 'heal', 0.4);
        }
        if (o.shotKills >= 2 && state.phase === 'shot') {
          sfx.play('comboKill', 0.9);
          state.comboKillAt = performance.now();
          hud.banner(o.shotKills > 2 ? `Combo Kill ×${o.shotKills}!` : 'Combo Kill!', 'Bonus turn: shoot again', 2);
        }
      } else if (o.type === 'hurt') {
        sfx.play('hurt', 1);
        // Rattle the view: blasts hard, enemy hits by how hard they landed.
        const K = CONFIG.camera;
        rig.shake(o.event ? Math.min(1, K.shakeHit * (0.6 + (o.event.speed ?? 0) / 8)) : K.shakeBlast);
        heroView.flash();
        state.ouch = CONFIG.render.heroOuchSeconds;
        floatAt(hero, `-${o.amount}`, 'hurt');
        // Hit by an enemy, you lose a share of your gold; part of it is
        // scattered around you to win back, red at first (see updateFlyingCoins).
        // Not from a blast.
        if (o.event && state.gold > 0) {
          const { lost, scattered } = hurtGold(state.gold);
          state.gold -= lost;
          const pieces = Math.min(scattered, CONFIG.loot.hurtCoinsMaxPieces);
          scatterCoins(hero.x, hero.z, 0, [], splitGold(scattered, pieces).map((value) => ({ kind: 'coin', value, hot: CONFIG.loot.hurtCoinRedSeconds + CONFIG.loot.hurtCoinFadeSeconds })));
        }
        if (hero.hp <= 0 && state.phase !== 'down') knockedOut();
      } else if (o.type === 'blocked') {
        sfx.play('blocked', 1);
        floatAt(hero, 'Blocked!', 'gear');
      }
    }
  }

  // --- Camera ------------------------------------------------------------------
  /**
   * Drama (design doc: "Close calls and the kill cam"): spot close calls,
   * count down the kill cam, and ease the time scale toward slow motion while
   * either is on. Runs on real time; returns the time scale for this frame.
   */
  /** Hit-stop: freeze the action for a beat on a big hit (the camera keeps moving). */
  function hitStop(seconds) {
    state.hitStop = Math.max(state.hitStop ?? 0, seconds);
  }

  function updateDrama(realDt) {
    const C = CONFIG.camera;
    const live = state.phase === 'shot' || state.phase === 'enemyMove';
    if (state.killCam) {
      state.killCam.left -= realDt;
      if (state.killCam.left <= 0 || !live) state.killCam = null;
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
    const target = state.killCam ? C.killSlow : state.closeCall ? C.closeSlow : 1;
    state.timeScale = (state.timeScale ?? 1) + (target - (state.timeScale ?? 1)) * (1 - Math.exp(-C.timeEaseRate * realDt));
    if (Math.abs(state.timeScale - 1) < 0.01 && target === 1) state.timeScale = 1;
    if (state.hitStop > 0) {
      state.hitStop -= realDt;
      return 0;
    }
    return state.timeScale;
  }

  // --- Debug overlay -----------------------------------------------------------
  // Performance readout: tap the gold counter three times quickly (or press p).
  const perfView = document.createElement('pre');
  perfView.className = 'perf';
  perfView.hidden = true;
  container.appendChild(perfView);
  let goldTaps = [];
  container.querySelector('.hud-left').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    goldTaps = [...goldTaps.filter((t) => e.timeStamp - t < 800), e.timeStamp];
    if (goldTaps.length >= 3) {
      perfView.hidden = !perfView.hidden;
      goldTaps = [];
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
    if (e.key === 'n' && state.phase !== 'won' && state.phase !== 'pick' && state.phase !== 'exiting') {
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
    const frameStart = performance.now();
    // Paused (a card is open): time stands still, but the scene keeps drawing.
    const realDtRaw = (now - last) / 1000;
    const realDt = hud.paused ? 0 : Math.min(0.25, realDtRaw);
    last = now;
    fps += (1 / Math.max(realDt, 1e-3) - fps) * 0.05;
    // Slow motion (close calls and the kill cam): game time runs at
    // state.timeScale; the camera keeps real time so it stays smooth.
    const dt = realDt * updateDrama(realDt);

    const step = CONFIG.physics.step;
    acc += dt;
    let steps = 0;
    while (acc >= step && steps < CONFIG.physics.maxStepsPerFrame) {
      stepWorld(world, step);
      stepIce(world, level, ice, state.move ?? 0);
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
      // Rubber enemies: your ball comes off them at double speed.
      const R = CONFIG.enemy.types.rubber;
      applyRubberRebound(world, hero, R.rebound, R.maxRebound);
      // Barrels kick every ball on like pinball bumpers; with Elasticity,
      // barrels, chests and enemies kick your ball, harder.
      applyBumperKicks(world, state.kicked, CONFIG.aim.maxLaunchSpeed, card('elasticity') ? { ball: hero, kick: CONFIG.cards.elasticityKick, perBumper: CONFIG.cards.elasticityKicksPerBumper } : null);
      if (state.phase === 'shot' && world.events.some((ev) => ev.ball === hero || ev.a === hero || ev.b === hero)) state.contacts?.push({ x: hero.x, z: hero.z });
      handleEvents(outcomes, objectOutcomes);
      checkPickups();
      checkDoors();
      if (state.phase !== 'down' && state.phase !== 'won' && state.phase !== 'pick' && state.phase !== 'exiting' && tileAt(level, Math.floor(hero.x), Math.floor(hero.z)) === 'exit') {
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
        // Your shot came to rest: armed bombs go off first, and the shot
        // carries on (their blast counts toward it) until everything settles.
        if (isAtRest(world) && detonateArmed()) break;
        if (isAtRest(world)) {
          endMoveForGold();
          // A sword breaks as the shot in which it hit an enemy comes to rest.
          if (endSwordShot(hero)) {
            overlay.float('Sword broke!', hero.x, hero.z, hero.radius * 2 + 1, 'gear', heroFollow());
            sfx.play('blocked', 0.6, { pitch: 0.8 });
          }
          // A combo kill (2+ enemies in one shot) earns a bonus turn: the
          // enemy phase is skipped and you shoot again.
          if (combat.shotKills >= 2) {
            state.phase = 'aim';
            newRound();
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
          endMoveForGold();
          state.phase = 'aim';
          newRound();
          state.returnBoost = CONFIG.camera.returnBoostSeconds; // snap back to you quickly
        }
        break;
      case 'down':
        state.timer -= dt;
        if (!state.deathShown) {
          // Let the skull roll to a stop before the screen darkens.
          if (speedOf(hero) <= CONFIG.physics.stopThreshold || state.timer <= 0) showDeathScreen();
        } else if (state.timer <= 0) afterKnockout();
        break;
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
      enemy.watching = aware ? hero : null;
      overlay.setAlert(enemy, aware, lunging);
      enemyViews.get(enemy)?.setAngry(aware);
    }

    updateLooks(dt, enemyMove);

    if (state.aiming) {
      // Aiming: zoom out with shot power, anchored on the ball.
      const fill = aimShot().fill;
      const from = rig.aimStartWidth;
      rig.aimZoom(hero, from + (Math.max(from, CONFIG.camera.aimMaxWidth) - from) * fill, realDt);
    } else if (state.panned && state.phase !== 'aim') {
      state.panned = false; // you shot (or the turn moved on): follow the play again
    } else if (state.panned) {
      // Looking around the map (a drag off the ball): hold the view where you left it.
    } else {
      // Closeness (design doc: "Camerawork"): the camera stays on you.
      const C = CONFIG.camera;
      const boost = state.returnBoost > 0 ? C.returnBoost : 1;
      if (state.phase === 'aim') {
        // Your turn, at rest: tight on your ball (restFill of the view);
        // aiming zooms out from here with power.
        rig.focus(hero, CONFIG.ball.diameter / C.restFill, realDt, C.restZoomRate, boost);
      } else {
        // Shots, enemy moves and the rest: centred on you, widening (fast)
        // to keep every moving ball in view, narrowing (slowly) after. In the
        // enemy phase also where the movers started and whatever a lunge is
        // going for. Speed pulls it out a little too, as before.
        const points = world.balls.filter((b) => b !== hero && (b.vx !== 0 || b.vz !== 0));
        if (state.phase === 'enemyWait' || state.phase === 'enemyMove') {
          for (const m of state.moves) {
            points.push(m.from);
            if (m.target && m.target !== hero) points.push(m.target);
          }
        }
        const fast = Math.min(1, speedOf(hero) / CONFIG.aim.maxLaunchSpeed);
        const tight = CONFIG.ball.diameter / C.restFill;
        if (state.killCam) {
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
        } else {
          rig.follow(hero, points, tight + (C.maxViewWidth - tight) * fast, C.maxFrameWidth, realDt);
        }
      }
      if (state.returnBoost > 0) state.returnBoost = rig.settled ? 0 : state.returnBoost - dt;
    }
    rig.updateShake(realDt);
    lighting.update(realDt, hero, world.balls, world.statics, level.exits);
    renderer.render(scene, rig.camera);
    overlay.update();
    trackPerf(Math.min(0.25, realDtRaw), performance.now() - frameStart);
    hud.setGold(state.gold);
    hud.setKeys(state.keys);
    hud.setCards(state.cards);
    hud.setDanger(hero.hp > 0 && hero.hp <= CONFIG.render.dangerHp && state.phase !== 'down');
    // Whose turn it is, always shown: yours while you aim and your shot rolls,
    // the enemies' from the first enemy move until it's back to you.
    hud.setTurn(['enemyWait', 'enemyMove', 'down'].includes(state.phase) ? 'enemy' : 'player');
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
