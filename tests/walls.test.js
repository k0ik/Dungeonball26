import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall, stepWorld, isAtRest, overlapsSolid } from '../src/physics.js';
import { insideWall } from '../src/wallGeometry.js';
import { CONFIG } from '../src/config.js';

const R = CONFIG.ball.diameter / 2;
const inside = (level, x, z) => insideWall(level.geometry, x, z, level.tiles[Math.floor(z)]?.[Math.floor(x)] === 'wall');

const pillarRoom = (round) =>
  parseLevel(`round: ${round}
#########
#.......#
#.......#
#.......#
#...#...#
#.......#
#.......#
#S......#
#########`);

test('square levels have no outline; a round setting builds one', () => {
  const square = parseLevel('###\n#S#\n###');
  assert.equal(square.geometry, undefined);
  assert.equal(parseLevel('round: 0\n###\n#S#\n###').geometry, undefined);
  assert.ok(pillarRoom(0.5).geometry);
  assert.throws(() => parseLevel('round: soft\n###\n#S#\n###'), /round/);
  assert.throws(() => parseLevel('bogus: 1\n###\n#S#\n###'), /unknown setting/);
});

test('max rounding turns a lone pillar into a round post', () => {
  const level = pillarRoom('max');
  // The pillar (4,4) has centre (4.5, 4.5): a circle of radius 0.5.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    assert.ok(inside(level, 4.5 + Math.cos(a) * 0.45, 4.5 + Math.sin(a) * 0.45), `inside at ${i}`);
    assert.ok(!inside(level, 4.5 + Math.cos(a) * 0.55, 4.5 + Math.sin(a) * 0.55), `outside at ${i}`);
  }
  // The tile's corner is open floor now; the square version keeps it.
  assert.ok(!overlapsSolid(level, 4.02, 4.02, 0.01));
  assert.ok(inside(level, 4.5, 4.5));
});

test("a room's corners curve in: max rounding on a 7x7 room makes it nearly round", () => {
  const level = pillarRoom(3);
  // Room interior spans x, z in [1, 8]; the corner tile at (1,1) is now inside the curve...
  assert.ok(inside(level, 1.2, 1.2));
  assert.ok(overlapsSolid(level, 1.5, 1.5, 0.05));
  // ...but the middle of a side is still a straight wall face.
  assert.ok(!inside(level, 4.5, 1.05));
  assert.ok(inside(level, 4.5, 0.95));
  // Out in the solid rock, far from any curve: still solid.
  assert.ok(overlapsSolid(parseLevel('round: 1\n#####\n#####\n##S##\n#####\n#####'), 0.5, 0.5, 0.1));
});

test('a ball bounces off a round post like a bumper, radially', () => {
  const level = pillarRoom('max');
  const world = createWorld(level);
  // Aim at the post's centre from the left, offset up a little: it glances off upward.
  const b = createBall({ x: 2, z: 4.3 });
  b.vx = 4;
  world.balls.push(b);
  let hit = null;
  for (let i = 0; i < 240 && !hit; i++) {
    stepWorld(world);
    hit = world.events.find((e) => e.type === 'wall');
  }
  assert.ok(hit, 'hit the post');
  assert.ok(b.vx < 0, 'bounced back');
  assert.ok(b.vz < 0, 'deflected up, off the curve');
  // Resting contact distance from the post centre is post radius + ball radius.
  assert.ok(Math.abs(Math.hypot(b.x - 4.5, b.z - 4.5) - (0.5 + R)) < 0.02);
});

test('a ball rolling into a rounded room corner stays in the room and keeps moving', () => {
  const level = pillarRoom(3);
  const world = createWorld(level);
  const b = createBall({ x: 2.5, z: 6.5 });
  b.vx = -3;
  b.vz = -6;
  world.balls.push(b);
  let t = 0;
  while (!isAtRest(world) && t < 10) {
    stepWorld(world);
    t += CONFIG.physics.step;
    assert.ok(!inside(level, b.x, b.z), 'centre never enters the wall');
  }
  assert.ok(world.events.some((e) => e.type === 'wall'));
});

test('diagonal wall tiles stay joined: no gap opens at their shared corner', () => {
  const level = parseLevel(`round: max
#######
#.....#
#..#..#
#...#.#
#S....#
#######`);
  // Tiles (3,2) and (4,3) touch at (4,3): the point stays solid.
  assert.ok(overlapsSolid(level, 4, 3, 0.05));
});

test('corners next to a door stay square', () => {
  const level = parseLevel(`round: max
#######
#..S..#
###R###
#.....#
#######`);
  // The wall right beside the door keeps its square corner.
  assert.ok(overlapsSolid(level, 2.97, 2.03, 0.01));
  assert.ok(overlapsSolid(level, 4.03, 2.03, 0.01));
  // The door itself is still solid.
  assert.ok(overlapsSolid(level, 3.5, 2.5, 0.1));
});

test('every shipped level still parses', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  for (const f of readdirSync('src/levels')) assert.ok(parseLevel(readFileSync(`src/levels/${f}`, 'utf8'), f).width > 0);
});

test('nothing in a rounded level starts buried in a curved wall', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  for (const f of readdirSync('src/levels')) {
    const level = parseLevel(readFileSync(`src/levels/${f}`, 'utf8'), f);
    if (!level.geometry) continue;
    const spots = [level.start, ...level.enemies, ...level.barrels, ...level.explosives, ...level.chests, ...level.keys, ...level.coins, ...level.exits];
    for (const s of spots) assert.ok(!overlapsSolid(level, s.col + 0.5, s.row + 0.5, R * 0.8), `${f}: something at column ${s.col + 1}, row ${s.row + 1} sits in a curved wall`);
  }
});
