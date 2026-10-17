import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLevel, isSolid } from '../src/level.js';
import { createBall, step, isAtRest, predictPath } from '../src/physics.js';
import { PHYSICS, AIM } from '../src/config.js';

const level1 = parseLevel(readFileSync(new URL('../src/levels/01-first-shot.txt', import.meta.url), 'utf8'), 'First Shot');

test('level 1 parses to 9×16 with a start, an exit and one level-1 enemy', () => {
  assert.equal(level1.width, 9);
  assert.equal(level1.height, 16);
  assert.deepEqual(level1.start, { x: 4.5, z: 14.5 });
  assert.equal(level1.tiles[1][4].type, 'exit');
  assert.deepEqual(level1.entities, [{ type: 'enemy', level: 1, x: 4.5, z: 7.5 }]);
  assert.ok(isSolid(level1, 0, 0));
  assert.ok(!isSolid(level1, 1, 1));
});

test('loader rejects unknown characters and a missing start', () => {
  assert.throws(() => parseLevel('###\n#S?\n###'), /unknown tile/);
  assert.throws(() => parseLevel('###\n#.#\n###'), /missing start/);
});

test('constant friction stops a full-power shot in about 2.6 s', () => {
  const open = parseLevel('#'.repeat(80) + '\n#S' + '.'.repeat(77) + '#\n' + '#'.repeat(80));
  const ball = createBall(open.start);
  ball.vx = AIM.maxLaunchSpeed;
  let t = 0;
  while (!isAtRest([ball])) {
    step(open, [ball]);
    t += PHYSICS.step;
  }
  assert.ok(t > 2.4 && t < 2.7, `stopped after ${t.toFixed(2)} s`);
  // Distance ≈ v²/2a = 81/7 ≈ 11.6 tiles.
  assert.ok(Math.abs(ball.x - open.start.x - 81 / 7) < 0.1);
});

test('wall bounce reflects and keeps 90% of speed', () => {
  const ball = createBall({ x: 4.5, z: 2 });
  ball.vz = -5;
  let contact, before;
  for (let i = 0; i < 120 && !contact; i++) {
    before = Math.hypot(ball.vx, ball.vz) - PHYSICS.friction * PHYSICS.step;
    contact = step(level1, [ball]).find((c) => c.type === 'wall');
  }
  assert.ok(contact);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vz) - before * PHYSICS.wallRestitution) < 1e-6);
  assert.ok(ball.vz > 0, 'moving away from the wall');
  assert.ok(ball.z >= 1 + ball.radius - 1e-9, 'pushed out of the wall');
});

test('a full-power shot never tunnels through walls', () => {
  for (let a = 0; a < 64; a++) {
    const ball = createBall(level1.start);
    ball.vx = Math.cos((a / 64) * Math.PI * 2) * AIM.maxLaunchSpeed;
    ball.vz = Math.sin((a / 64) * Math.PI * 2) * AIM.maxLaunchSpeed;
    while (!isAtRest([ball])) step(level1, [ball]);
    assert.ok(ball.x > 1 && ball.x < 8 && ball.z > 1 && ball.z < 15, `angle ${a} escaped to ${ball.x}, ${ball.z}`);
    assert.ok(!isSolid(level1, Math.floor(ball.x), Math.floor(ball.z)), `angle ${a} ended inside a wall`);
  }
});

test('equal-mass head-on collision transfers momentum', () => {
  const open = parseLevel('#######\n#S....#\n#######');
  const a = createBall({ x: 2, z: 1.5 });
  const b = createBall({ x: 3, z: 1.5 });
  a.vx = 4;
  let hit;
  for (let i = 0; i < 60 && !hit; i++) hit = step(open, [a, b]).find((c) => c.type === 'ball');
  assert.ok(hit);
  assert.ok(b.vx > a.vx && a.vx < 0.5);
});

test('preview path bends at the first wall contact and stops at the second', () => {
  const path = predictPath(level1, createBall(level1.start), AIM.maxLaunchSpeed, -AIM.maxLaunchSpeed / 2, AIM.previewMaxTime);
  assert.ok(path.bend, 'has a bend point');
  assert.ok(path.points.length > 2);
});
