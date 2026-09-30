import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseLevel, isSolid, LEGEND, coinStrips } from '../src/level.js';

const levelsDir = new URL('../src/levels/', import.meta.url);

test('every shipped level parses', () => {
  for (const file of readdirSync(levelsDir).filter((f) => f.endsWith('.txt'))) {
    const level = parseLevel(readFileSync(new URL(file, levelsDir), 'utf8'), file);
    assert.ok(level.start, `${file} has a start`);
    assert.ok(level.exits.length > 0, `${file} has an exit`);
  }
});

test('level 1 matches the design doc: 12x33, enemies of levels 1 to 3', () => {
  const level = parseLevel(readFileSync(new URL('long-hall.txt', levelsDir), 'utf8'));
  assert.equal(level.width, 12);
  assert.equal(level.height, 33);
  assert.deepEqual([...new Set(level.enemies.map((e) => e.level))].sort(), [1, 2, 3]);
});

test('levels 2 and 3 match the design doc', () => {
  const b = parseLevel(readFileSync(new URL('breakables.txt', levelsDir), 'utf8'));
  assert.deepEqual([b.width, b.height], [9, 21]);
  assert.deepEqual(b.enemies.map((e) => e.level), [1, 1]);
  assert.equal(b.doors.length + b.keys.length, 0);
  const k = parseLevel(readFileSync(new URL('one-key.txt', levelsDir), 'utf8'));
  assert.deepEqual([k.width, k.height], [12, 21]);
  assert.deepEqual(k.enemies.map((e) => e.level).sort(), [1, 2]);
  assert.deepEqual(k.doors.map((d) => d.color), ['red']);
  assert.deepEqual(k.keys.map((d) => d.color), ['red']);
});

test('parses the illustrative level from the design doc', () => {
  const level = parseLevel(`#########
####X####
#.......#
#.......#
###R#####
#.......#
#.O.1.O.#
#.......#
#.C.r...#
#.......#
#...S...#
#########`);
  assert.deepEqual(level.start, { col: 4, row: 10 });
  assert.deepEqual(level.doors, [{ col: 3, row: 4, color: 'red' }]);
  assert.deepEqual(level.keys, [{ col: 4, row: 8, color: 'red' }]);
  assert.equal(level.barrels.length, 2);
  assert.equal(level.chests.length, 1);
  assert.ok(isSolid(level, 3, 4), 'closed door is solid');
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

/** Tiles reachable from the start by 4-way moves over non-solid tiles. */
function reachable(level) {
  const seen = new Set();
  const queue = [[level.start.col, level.start.row]];
  while (queue.length) {
    const [c, r] = queue.pop();
    const id = `${c},${r}`;
    if (seen.has(id) || isSolid(level, c, r)) continue;
    seen.add(id);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}

test('every shipped level can be finished: keys open doors, which reach more keys, and finally the exit', () => {
  for (const file of readdirSync(levelsDir).filter((f) => f.endsWith('.txt'))) {
    const level = parseLevel(readFileSync(new URL(file, levelsDir), 'utf8'), file);
    const exitReached = () => level.exits.some((e) => reachable(level).has(`${e.col},${e.row}`));
    assert.ok(!level.doors.length || !exitReached(), `${file}: the doors really guard the exit`);
    // Keep taking every key you can reach and opening its doors, until nothing changes.
    const held = new Set();
    for (let changed = true; changed; ) {
      changed = false;
      const seen = reachable(level);
      for (const k of level.keys) {
        if (held.has(k) || !seen.has(`${k.col},${k.row}`)) continue;
        held.add(k);
        changed = true;
        for (const d of level.doors) if (d.color === k.color) level.tiles[d.row][d.col] = 'floor';
      }
    }
    assert.equal(held.size, level.keys.length, `${file}: every key can be reached`);
    assert.ok(exitReached(), `${file}: exit reachable`);
  }
});

test('every exit is tucked into a one-tile alcove, open on one side only', () => {
  for (const file of readdirSync(levelsDir).filter((f) => f.endsWith('.txt'))) {
    const level = parseLevel(readFileSync(new URL(file, levelsDir), 'utf8'), file);
    for (const { col, row } of level.exits) {
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => !isSolid(level, col + dc, row + dr));
      assert.equal(open.length, 1, `${file}: exit at ${col},${row} has ${open.length} open sides`);
    }
  }
});

test('coins that touch side by side form one strip; diagonal or separate ones do not', () => {
  const level = parseLevel(`#######
#****.#
#.....#
#.*..*#
#..*.*#
#S...*#
#######`);
  assert.equal(level.coins.length, 9);
  assert.ok(!isSolid(level, 1, 1), 'a coin tile is floor');
  const sizes = coinStrips(level).map((s) => s.length).sort();
  // the row of 4, the column of 3, and two lone diagonal coins
  assert.deepEqual(sizes, [1, 1, 3, 4]);
});

test('every shipped level has a coin strip of 5 or more, enough for a Clean Sweep on its own', () => {
  for (const file of readdirSync(levelsDir).filter((f) => f.endsWith('.txt'))) {
    const level = parseLevel(readFileSync(new URL(file, levelsDir), 'utf8'), file);
    assert.ok(coinStrips(level).some((s) => s.length >= 5), file);
  }
});
