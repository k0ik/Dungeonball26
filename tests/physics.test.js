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

test('friction stops a full-power ball in about 2.6 s', () => {
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
  assert.ok(t > 2.4 && t < 2.7, `stopped after ${t.toFixed(2)} s`);
  // Distance ≈ v²/2a ≈ 11.6 tiles.
  assert.ok(Math.abs(b.x - 1.5 - 81 / 7) < 0.2, `travelled ${(b.x - 1.5).toFixed(2)}`);
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
