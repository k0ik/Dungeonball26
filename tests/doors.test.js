import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, isSolid } from '../src/level.js';
import { openDoors } from '../src/doors.js';
import { collect, canCollect } from '../src/loot.js';
import { canSee } from '../src/sight.js';
import { createBall } from '../src/physics.js';

const TEXT = `#########
#...X...#
#.......#
###R#####
#.......#
#.......#
#.r.S...#
#########`;

// Door at col 3, row 3: its tile spans z 3..4, so a hero at z 4.3 is 0.3 below it.
const hero = (x, z) => createBall({ x, z, kind: 'hero', id: 'hero' });

test('a door stays shut without its key', () => {
  const level = parseLevel(TEXT);
  const keys = ['blue'];
  assert.deepEqual(openDoors(level, hero(3.5, 4.3), keys), []);
  assert.ok(isSolid(level, 3, 3));
  assert.deepEqual(keys, ['blue'], 'a non-matching key is kept');
});

test('the matching key opens a door within reach, for good, and stays on the key ring', () => {
  const level = parseLevel(TEXT);
  const keys = ['red'];
  assert.deepEqual(openDoors(level, hero(3.5, 5.2), keys), [], 'too far: 1.2 tiles');
  const opened = openDoors(level, hero(3.5, 4.4), keys);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].color, 'red');
  assert.ok(!isSolid(level, 3, 3), 'an open door is floor');
  assert.deepEqual(keys, ['red']);
  assert.deepEqual(openDoors(level, hero(3.5, 4.4), ['red']), [], 'already open');
});

test('one key opens every door of its colour', () => {
  const level = parseLevel(`
#######
###R###
#.....#
###R###
#..S..#
#######`);
  const keys = ['red'];
  assert.equal(openDoors(level, hero(3.5, 3.4), keys).length, 1, 'the near one');
  assert.equal(openDoors(level, hero(3.5, 2.5), keys).length, 1, 'then the far one, with the same key');
  assert.deepEqual(keys, ['red']);
});

test('noKeys (the Locksmith card) opens any door without using a key', () => {
  const level = parseLevel(TEXT);
  const keys = [];
  assert.equal(openDoors(level, hero(3.5, 4.4), keys, { noKeys: true }).length, 1);
});

test('a closed door blocks sight; an open one does not', () => {
  const level = parseLevel(TEXT);
  const enemy = createBall({ x: 3.5, z: 1.5, kind: 'enemy', id: 'e' });
  const h = hero(3.5, 5.5);
  assert.equal(canSee(level, enemy, h, [enemy, h]), false);
  openDoors(level, hero(3.5, 4.4), ['red']);
  assert.equal(canSee(level, enemy, h, [enemy, h]), true);
});

test('a key is always collectable and goes on your key list', () => {
  const run = { gold: 0, lives: 3, keys: [] };
  const item = { kind: 'key', color: 'red' };
  assert.ok(canCollect(item, { hp: 10, maxHp: 10, shield: true, sword: 'ready' }));
  assert.equal(collect(item, {}, run), 'Red key');
  assert.deepEqual(run.keys, ['red']);
});

test('a closed door is a thin slab: a ball rolls into its indent before stopping', async () => {
  const { parseLevel } = await import('../src/level.js');
  const { createWorld, createBall, stepWorld } = await import('../src/physics.js');
  const { CONFIG } = await import('../src/config.js');
  const level = parseLevel(`#####
#.S.#
##R##
#...#
#####`);
  const world = createWorld(level);
  const b = createBall({ x: 2.5, z: 1.5 });
  b.vz = 3;
  world.balls.push(b);
  let reach = 0;
  for (let i = 0; i < 240; i++) {
    stepWorld(world);
    reach = Math.max(reach, b.z + b.radius);
  }
  assert.ok(reach > 2.2, `got past the tile edge (z 2) into the indent: ${reach}`);
  assert.ok(reach < 2.5 - CONFIG.objects.doorThickness / 2 + 0.01, `but not through the slab: ${reach}`);
});

test('a door between half-walls runs the way they do', () => {
  const level = parseLevel(`
#######
#..=..#
#..B..#
#..=..#
#..S..#
#######`);
  const shape = level.doorShapes.get(2 * level.width + 3);
  assert.ok(shape.halfZ > shape.halfX, 'north-south, in line with the half-walls above and below');
});
