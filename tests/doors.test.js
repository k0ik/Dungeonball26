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

test('the matching key opens a door within reach, for good, and is used up', () => {
  const level = parseLevel(TEXT);
  const keys = ['red'];
  assert.deepEqual(openDoors(level, hero(3.5, 5.2), keys), [], 'too far: 1.2 tiles');
  const opened = openDoors(level, hero(3.5, 4.4), keys);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].color, 'red');
  assert.ok(!isSolid(level, 3, 3), 'an open door is floor');
  assert.deepEqual(keys, []);
  assert.deepEqual(openDoors(level, hero(3.5, 4.4), ['red']), [], 'already open');
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
  assert.ok(canCollect(item, { hp: 10, maxHp: 10, shield: true, swordHits: 2 }));
  assert.equal(collect(item, {}, run), 'Red key');
  assert.deepEqual(run.keys, ['red']);
});
