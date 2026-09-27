import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseLevel, isSolid, LEGEND } from '../src/level.js';

const levelsDir = new URL('../src/levels/', import.meta.url);

test('every shipped level parses', () => {
  for (const file of readdirSync(levelsDir).filter((f) => f.endsWith('.txt'))) {
    const level = parseLevel(readFileSync(new URL(file, levelsDir), 'utf8'), file);
    assert.ok(level.start, `${file} has a start`);
    assert.ok(level.exits.length > 0, `${file} has an exit`);
  }
});

test('level 1 matches the design doc: 12x32, enemies of levels 1 to 3', () => {
  const level = parseLevel(readFileSync(new URL('long-hall.txt', levelsDir), 'utf8'));
  assert.equal(level.width, 12);
  assert.equal(level.height, 32);
  assert.deepEqual([...new Set(level.enemies.map((e) => e.level))].sort(), [1, 2, 3]);
});

test('parses the illustrative level from the design doc', () => {
  const level = parseLevel(`#########
#...X...#
#.......#
###R#####
#.......#
#.O.1.O.#
#.......#
#.C.r...#
#.......#
#...S...#
#########`);
  assert.deepEqual(level.start, { col: 4, row: 9 });
  assert.deepEqual(level.doors, [{ col: 3, row: 3, color: 'red' }]);
  assert.deepEqual(level.keys, [{ col: 4, row: 7, color: 'red' }]);
  assert.equal(level.barrels.length, 2);
  assert.equal(level.chests.length, 1);
  assert.ok(isSolid(level, 3, 3), 'closed door is solid');
  assert.ok(isSolid(level, -1, 0), 'out of bounds is solid');
  assert.ok(!isSolid(level, 4, 9), 'start is floor');
});

test('legend covers every character in the design doc table', () => {
  for (const ch of '#.SXOCE12345rbyRBY') assert.ok(LEGEND[ch], `legend has '${ch}'`);
});

test('rejects bad levels with a useful message', () => {
  assert.throws(() => parseLevel('###\n#S#\n##'), /row 3/);
  assert.throws(() => parseLevel('###\n#Q#\n###'), /unknown tile 'Q'/);
  assert.throws(() => parseLevel('###\n#.#\n###'), /no hero start/);
});
