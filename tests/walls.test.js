import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, placedSpots } from '../src/level.js';
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

test('walls are rounded by default; round: 0 keeps them square', () => {
  assert.ok(parseLevel('###\n#S#\n###').geometry);
  assert.equal(parseLevel('round: 0\n###\n#S#\n###').geometry, undefined);
  assert.ok(pillarRoom(0.5).geometry);
  assert.throws(() => parseLevel('round: soft\n###\n#S#\n###'), /round/);
  assert.throws(() => parseLevel('bogus: 1\n###\n#S#\n###'), /unknown setting/);
});

test("a room's corner curve shrinks to keep whatever sits in the corner clear", () => {
  const level = parseLevel(`round: max
#########
#C......#
#.......#
#.......#
#.......#
#......S#
#########`);
  const chest = placedSpots(level).find((s) => s.x === 1.5 && s.z === 1.5);
  assert.ok(!overlapsSolid(level, 1.5, 1.5, chest.clear - 1e-3), 'chest corner stays clear');
  assert.ok(!overlapsSolid(level, 7.5, 5.5, R - 1e-3), 'hero corner stays clear');
  // The empty corners still get the full curve.
  assert.ok(inside(level, 7.2, 1.2));
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
    for (const s of placedSpots(level)) {
      assert.ok(!overlapsSolid(level, s.x, s.z, s.clear - 1e-3), `${f}: something at column ${s.x + 0.5}, row ${s.z + 0.5} sits in a curved wall`);
    }
  }
});

test('a narrow corridor bend stays open: the outer curve is kept inside the corridor', () => {
  const level = parseLevel(`round: max
#########
#S......#
#######.#
#######.#
#######.#
#######.#
#########`);
  // The ball's centre along the corridor's middle, turning on a half-tile curve at the bend.
  const path = [];
  for (let x = 1.5; x <= 7; x += 0.05) path.push({ x, z: 1.5 });
  for (let a = 0; a <= Math.PI / 2; a += 0.05) path.push({ x: 7 + Math.sin(a) * 0.5, z: 2 - Math.cos(a) * 0.5 });
  for (let z = 2; z <= 5.5; z += 0.05) path.push({ x: 7.5, z });
  for (const p of path) assert.ok(!overlapsSolid(level, p.x, p.z, R), `blocked at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
  // Without the limit the outer curve (runs of 7 and 5) would be 2.5 tiles and close the bend.
  assert.ok(level.geometry.prims.every((p) => p.type !== 'arc' || p.convex || p.r <= 1));
});

test('in every level a ball can still roll to every exit and key', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const STEP = 0.125;
  for (const f of readdirSync('src/levels')) {
    const level = parseLevel(readFileSync(`src/levels/${f}`, 'utf8'), f);
    // Flood fill on a fine grid of ball positions; doors count as open (they unlock).
    const doors = level.doors;
    for (const d of doors) level.tiles[d.row][d.col] = 'floor';
    const W = Math.round(level.width / STEP);
    const H = Math.round(level.height / STEP);
    const seen = new Uint8Array(W * H);
    const fits = (i, j) => !overlapsSolid(level, (i + 0.5) * STEP, (j + 0.5) * STEP, R - 0.02);
    const cell = (x, z) => [Math.floor(x / STEP), Math.floor(z / STEP)];
    const [si, sj] = cell(level.start.col + 0.5, level.start.row + 0.5);
    const stack = [[si, sj]];
    seen[sj * W + si] = 1;
    while (stack.length) {
      const [i, j] = stack.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H || seen[b * W + a] || !fits(a, b)) continue;
        seen[b * W + a] = 1;
        stack.push([a, b]);
      }
    }
    for (const t of [...level.exits, ...level.keys]) {
      const [i, j] = cell(t.col + 0.5, t.row + 0.5);
      let hit = false;
      for (let dj = -2; dj <= 2 && !hit; dj++) for (let di = -2; di <= 2 && !hit; di++) hit = !!seen[(j + dj) * W + i + di];
      assert.ok(hit, `${f}: can't roll to column ${t.col + 1}, row ${t.row + 1}`);
    }
  }
});
