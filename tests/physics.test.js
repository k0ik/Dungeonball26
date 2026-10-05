import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall, stepWorld, isAtRest, speedOf, overlapsSolid, castCircle } from '../src/physics.js';
import { CONFIG } from '../src/config.js';

const room = parseLevel(`
###########
#.........#
#.........#
#.........#
#.........#
#....S....#
#.........#
#.........#
#.........#
###########`);

function run(world, seconds) {
  for (let t = 0; t < seconds; t += CONFIG.physics.step) stepWorld(world);
}

test('friction stops a full-power ball at the time and distance constant deceleration predicts', () => {
  const huge = parseLevel('#'.repeat(50) + '\n#S' + '.'.repeat(47) + '#\n' + '#'.repeat(50));
  const world = createWorld(huge);
  const b = createBall({ x: 1.5, z: 1.5 });
  b.vx = CONFIG.aim.maxLaunchSpeed;
  world.balls.push(b);
  let t = 0;
  while (!isAtRest(world) && t < 10) {
    stepWorld(world);
    t += CONFIG.physics.step;
  }
  // It counts as stopped once it drops below the stop threshold.
  const v = CONFIG.aim.maxLaunchSpeed;
  const a = CONFIG.physics.friction;
  const s = CONFIG.physics.stopThreshold;
  assert.ok(Math.abs(t - (v - s) / a) < 0.05, `stopped after ${t.toFixed(2)} s`);
  assert.ok(Math.abs(b.x - 1.5 - (v * v - s * s) / (2 * a)) < 0.2, `travelled ${(b.x - 1.5).toFixed(2)}`);
});

test('wall bounce reflects and keeps 90% of speed', () => {
  const world = createWorld(room);
  const b = createBall({ x: 5.5, z: 5.5 });
  b.vx = 8;
  world.balls.push(b);
  let bounced = null;
  for (let i = 0; i < 1000 && !bounced; i++) {
    const before = speedOf(b);
    stepWorld(world);
    const ev = world.events.find((e) => e.type === 'wall');
    if (ev) bounced = { before, after: speedOf(b), vx: b.vx };
  }
  assert.ok(bounced.vx < 0, 'moving back left');
  assert.ok(Math.abs(bounced.after / bounced.before - 0.9) < 0.02);
});

test('balls never end up inside walls, even at max speed into corners', () => {
  for (let a = 0; a < 360; a += 7) {
    const world = createWorld(room);
    const b = createBall({ x: 5.5, z: 5.5 });
    const rad = (a * Math.PI) / 180;
    b.vx = Math.cos(rad) * CONFIG.aim.maxLaunchSpeed;
    b.vz = Math.sin(rad) * CONFIG.aim.maxLaunchSpeed;
    world.balls.push(b);
    for (let i = 0; i < 400; i++) {
      stepWorld(world);
      assert.ok(!overlapsSolid(room, b.x, b.z, b.radius - 1e-6), `angle ${a} step ${i}`);
    }
  }
});

test('equal-mass head-on hit transfers momentum pool-style', () => {
  const world = createWorld(room);
  const a = createBall({ x: 3, z: 5.5 });
  const b = createBall({ x: 5, z: 5.5 });
  a.vx = 4;
  world.balls.push(a, b);
  for (let i = 0; i < 1000 && !world.events.some((e) => e.type === 'ball'); i++) stepWorld(world);
  // With restitution 0.9 the object ball takes 95% of the impact speed, the cue ball keeps 5%.
  assert.ok(Math.abs(a.vx / b.vx - 0.05 / 0.95) < 0.01, `a=${a.vx.toFixed(2)} b=${b.vx.toFixed(2)}`);
});

test('castCircle stops at the wall and reports its normal', () => {
  const r = CONFIG.ball.diameter / 2;
  const hit = castCircle(room, 5.5, 5.5, 1, 0, r, 40);
  assert.ok(Math.abs(hit.x - (10 - r)) < 0.01, `stopped at x=${hit.x}`);
  assert.deepEqual({ x: Math.round(hit.normal.x), z: Math.round(hit.normal.z) }, { x: -1, z: 0 });
});

import { createStaticCircle, createStaticBox, staticContact } from '../src/physics.js';

test('a ball bounces off a round bumper keeping 70% of its speed', () => {
  const world = createWorld(room);
  const b = createBall({ x: 3, z: 5.5 });
  b.vx = 5;
  world.balls.push(b);
  const barrel = createStaticCircle({ x: 5.5, z: 5.5, radius: 0.34, kind: 'barrel', id: 'b0' });
  world.statics.push(barrel);
  let ev = null;
  let before = 0;
  for (let i = 0; i < 400 && !ev; i++) {
    before = speedOf(b);
    stepWorld(world);
    ev = world.events.find((e) => e.type === 'static');
  }
  assert.ok(ev, 'hit the barrel');
  assert.equal(ev.obj, barrel);
  assert.ok(b.vx < 0, 'bounced back');
  assert.ok(Math.abs(speedOf(b) / before - CONFIG.physics.bumperRestitution) < 0.03);
  assert.equal(staticContact(b, barrel), null, 'pushed clear of it');
});

test('a ball bounces off a box bumper on the face it hits', () => {
  const world = createWorld(room);
  const b = createBall({ x: 5.5, z: 2 });
  b.vz = 5;
  world.balls.push(b);
  world.statics.push(createStaticBox({ x: 5.5, z: 5.5, halfX: 0.35, halfZ: 0.25, kind: 'chest', id: 'c0' }));
  for (let i = 0; i < 400 && !world.events.some((e) => e.type === 'static'); i++) stepWorld(world);
  assert.ok(b.vz < 0 && Math.abs(b.vx) < 1e-9, 'straight back off the flat face');
  assert.ok(b.z <= 5.5 - 0.25 - b.radius + 1e-9);
});

test('Elasticity: a ball pinned between a bumper and a wall is kicked three times, not forever', async () => {
  const { applyBumperKick, createStaticBox } = await import('../src/physics.js');
  const level = parseLevel('1######\n#S....#\n#######');
  const world = createWorld(level);
  // A chest just far enough from the right wall for the ball to rattle between them.
  world.statics.push(createStaticBox({ x: 4.3, z: 1.5, halfX: 0.36, halfZ: 0.28, kind: 'chest' }));
  const b = createBall({ x: 5.35, z: 1.5 });
  b.friction = CONFIG.cards.athleticFriction; // the Athletic card
  b.vx = 6;
  world.balls.push(b);
  const kicked = new Map();
  let kicks = 0;
  let t = 0;
  while (!isAtRest(world) && t < 30) {
    stepWorld(world);
    if (applyBumperKick(world, b, CONFIG.cards.elasticityKick, CONFIG.aim.maxLaunchSpeed, kicked, CONFIG.cards.elasticityKicksPerBumper)) kicks++;
    world.events.length = 0;
    t += CONFIG.physics.step;
  }
  assert.equal(kicks, CONFIG.cards.elasticityKicksPerBumper);
  assert.ok(isAtRest(world), `still bouncing after ${t.toFixed(1)} s`);
});

test('Rubber: your ball comes off a Rubber enemy at double the rebound speed (capped)', async () => {
  const { applyRubberRebound } = await import('../src/physics.js');
  const { createEnemy } = await import('../src/combat.js');
  const R = CONFIG.enemy.types.rubber;
  const rebound = (type) => {
    const world = createWorld(room);
    const hero = createBall({ x: 3, z: 5.5, kind: 'hero', id: 'h' });
    hero.vx = 3;
    const e = createEnemy({ x: 4.5, z: 5.3, level: 1, id: 'e', type });
    world.balls.push(hero, e);
    for (let i = 0; i < 120; i++) {
      stepWorld(world);
      if (world.events.some((ev) => ev.type === 'ball')) {
        applyRubberRebound(world, hero, R.rebound, R.maxRebound);
        return speedOf(hero);
      }
      world.events.length = 0;
    }
    throw new Error('no hit');
  };
  const plain = rebound(null);
  assert.ok(Math.abs(rebound('rubber') - Math.min(R.maxRebound, plain * R.rebound)) < 1e-9);
  // A full-power hit is capped.
  const world = createWorld(room);
  const hero = createBall({ x: 3, z: 5.5, kind: 'hero', id: 'h' });
  hero.vx = 12;
  world.events.push({ type: 'ball', a: hero, b: createEnemy({ x: 4, z: 5.5, level: 1, id: 'e', type: 'rubber' }) });
  applyRubberRebound(world, hero, R.rebound, R.maxRebound);
  assert.equal(speedOf(hero), R.maxRebound);
});

test('Brute: heavy, so it barely moves when you hit it and knocks you further than you knock it', async () => {
  const { createEnemy } = await import('../src/combat.js');
  const { heroDamage, lungeVelocity } = await import('../src/turns.js');
  const B = CONFIG.enemy.types.brute;
  const brute = createEnemy({ x: 5, z: 5.5, level: 2, id: 'b', type: 'brute' });
  assert.equal(brute.radius, B.radius);
  assert.equal(brute.mass, B.mass);
  assert.equal(brute.maxHp, Math.min(CONFIG.enemy.maxHp, CONFIG.enemy.hpPerLevel * 2 * B.hpScale));
  assert.equal(heroDamage(brute), B.damageToHero);
  assert.ok(Math.abs(Math.hypot(...Object.values(lungeVelocity(brute, { x: 1, z: 5.5 }))) - B.lungeSpeed) < 1e-9);
  // Head-on: the hero at 4 tiles/s into a resting brute.
  const world = createWorld(room);
  const hero = createBall({ x: 3, z: 5.5, kind: 'hero', id: 'h' });
  hero.vx = 4;
  world.balls.push(hero, brute);
  let ev;
  while (!(ev = world.events.find((e) => e.type === 'ball'))) stepWorld(world);
  const v = ev.before.avx; // the hero's speed at impact
  // Momentum is conserved, and the brute takes far less speed than an equal ball would (v · 0.95).
  assert.ok(Math.abs(hero.vx + B.mass * brute.vx - v) < 1e-6);
  assert.ok(brute.vx < v * 0.95 * 0.6);
  assert.ok(hero.vx < 0, 'you bounce back off it');
});

test('Ghost: while faded, balls pass straight through it', async () => {
  const { createEnemy } = await import('../src/combat.js');
  const run = (phased) => {
    const world = createWorld(room);
    const hero = createBall({ x: 2, z: 5.5, kind: 'hero', id: 'h' });
    hero.vx = 4;
    const g = createEnemy({ x: 4.5, z: 5.5, level: 1, id: 'g', type: 'ghost' });
    g.phased = phased;
    world.balls.push(hero, g);
    let hits = 0;
    for (let i = 0; i < 240; i++) {
      stepWorld(world);
      hits += world.events.filter((e) => e.type === 'ball').length;
      world.events.length = 0;
    }
    return { hits, heroX: hero.x, ghostX: g.x };
  };
  const solid = run(false);
  const faded = run(true);
  assert.ok(solid.hits > 0);
  assert.equal(faded.hits, 0);
  assert.ok(faded.heroX > 4.5 + 0.5, 'rolled right through');
  assert.equal(faded.ghostX, 4.5, 'and the ghost never moved');
});

test('an inert ball (your skull) bounces off balls and bumpers without moving or hitting them', () => {
  const world = createWorld(room);
  const skull = createBall({ x: 3, z: 5.5 });
  skull.inert = true;
  skull.vx = 4;
  const other = createBall({ x: 5, z: 5.5 });
  world.balls.push(skull, other);
  let events = 0;
  for (let i = 0; i < 300; i++) {
    stepWorld(world);
    events += world.events.filter((e) => e.type === 'ball').length;
    world.events.length = 0;
  }
  assert.equal(events, 0, 'no hit event');
  assert.equal(other.x, 5, 'the other ball never moves');
  assert.equal(other.vx, 0);
  assert.ok(skull.vx < 0 || skull.x < 4.5, 'the skull bounced back');

  const w2 = createWorld(room);
  const s2 = createBall({ x: 3, z: 5.5 });
  s2.inert = true;
  s2.vx = 5;
  w2.balls.push(s2);
  w2.statics.push(createStaticCircle({ x: 5.5, z: 5.5, radius: 0.34, kind: 'barrel', id: 'b0' }));
  let hit = false;
  for (let i = 0; i < 400; i++) {
    stepWorld(w2);
    hit ||= w2.events.some((e) => e.type === 'static');
    w2.events.length = 0;
  }
  assert.equal(hit, false, 'no bumper event: nothing cracks, opens or goes off');
  assert.ok(s2.vx <= 0, 'bounced off the barrel');
});

const holes = parseLevel(`
#########
#.......#
#.._....#
#.......#
#....u..#
#.......#
#..n....#
#S..~...#
#########`);

test('a ball whose centre rolls over a pit falls in (one fall event, then it stays put)', () => {
  const world = createWorld(holes);
  const b = createBall({ x: 1.5, z: 2.5 });
  b.vx = 3;
  world.balls.push(b);
  const falls = [];
  for (let i = 0; i < 240; i++) {
    stepWorld(world);
    falls.push(...world.events.filter((e) => e.type === 'fall'));
    world.events.length = 0;
  }
  assert.equal(falls.length, 1);
  assert.equal(falls[0].kind, 'pit');
  assert.ok(b.fallen && b.vx === 0 && Math.floor(b.x) === 3, 'it stopped in the pit');
});

test('lava swallows a ball too', () => {
  const world = createWorld(holes);
  const b = createBall({ x: 2.5, z: 7.5 });
  b.vx = 3;
  world.balls.push(b);
  let kind = null;
  for (let i = 0; i < 240 && !kind; i++) {
    stepWorld(world);
    kind = world.events.find((e) => e.type === 'fall')?.kind ?? null;
    world.events.length = 0;
  }
  assert.equal(kind, 'lava');
});

test('a divot bends a passing ball toward its centre; a bump bends it away', () => {
  const pass = (z) => {
    const world = createWorld(holes);
    const b = createBall({ x: 4.6, z });
    b.vx = 2;
    world.balls.push(b);
    for (let i = 0; i < 120; i++) stepWorld(world);
    return b.vz;
  };
  // The divot (5, 4) is centred on z = 4.5: a ball passing just above it (z 4.3) is pulled down (+z).
  assert.ok(pass(4.3) > 0.02, 'pulled toward the divot centre');
  // The bump (3, 6) is centred on z = 6.5: a ball passing just above it (z 6.3), starting on it, is pushed up (-z).
  const world = createWorld(holes);
  const b = createBall({ x: 3.2, z: 6.3 });
  b.vx = 1.5;
  world.balls.push(b);
  for (let i = 0; i < 60; i++) stepWorld(world);
  assert.ok(b.vz < -0.02, 'pushed away from the bump centre');
});

test('a ball at rest near a divot centre stays put (the slope there is weaker than friction)', () => {
  const world = createWorld(holes);
  const b = createBall({ x: 5.52, z: 4.5 });
  world.balls.push(b);
  for (let i = 0; i < 120; i++) stepWorld(world);
  assert.equal(b.x, 5.52);
});
