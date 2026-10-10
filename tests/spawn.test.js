import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall } from '../src/physics.js';
import { freeSpawn } from '../src/spawn.js';

const R = 0.325;

test('you come back at the start when it is free', () => {
  const level = parseLevel('#######\n#.....#\n#..S..#\n#.....#\n#######');
  const world = createWorld(level);
  assert.deepEqual(freeSpawn(world, { x: 3.5, z: 2.5 }, R), { x: 3.5, z: 2.5 });
});

test('an enemy resting on the start: you come back on the nearest free tile instead', () => {
  const level = parseLevel('#######\n#.....#\n#..S..#\n#.....#\n#######');
  const world = createWorld(level);
  world.balls.push(createBall({ x: 3.5, z: 2.5, kind: 'enemy', id: 'e' }));
  const spot = freeSpawn(world, { x: 3.5, z: 2.5 }, R);
  assert.equal(Math.abs(spot.x - 3.5) + Math.abs(spot.z - 2.5), 1, `a neighbouring tile, got ${JSON.stringify(spot)}`);
});

test('never through a wall, onto lava or onto the exit', () => {
  // Start in a dead end: walls either side, lava below, the exit above; the
  // only free tile you can walk to is past the exit.
  const level = parseLevel('#####\n#...#\n##X##\n##S##\n##~##\n#####');
  const world = createWorld(level);
  world.balls.push(createBall({ x: 2.5, z: 3.5, kind: 'enemy', id: 'e' }));
  const spot = freeSpawn(world, { x: 2.5, z: 3.5 }, R);
  assert.equal(spot.z, 1.5, `in the room past the exit, got ${JSON.stringify(spot)}`);
});
