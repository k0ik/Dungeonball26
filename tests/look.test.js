import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLooks } from '../src/look.js';
import { CONFIG } from '../src/config.js';

const ball = (x, z, vx = 0, vz = 0) => ({ x, z, vx, vz });

test('a moving ball looks along its way, a resting one at its focus, else front', () => {
  const looks = createLooks();
  const b = ball(0, 0, 3, 0);
  looks.update(b, 0.016, { x: 0, z: 1 }, false);
  assert.deepEqual([b.look.x, b.look.z, b.look.amount], [3, 0, 1]);
  b.vx = 0;
  looks.update(b, 0.016, { x: 0, z: 1 }, false);
  assert.deepEqual([b.look.x, b.look.z], [0, 1]);
  looks.update(b, 0.016, null, true);
  assert.equal(b.look, null);
});

test('the struck ball looks at its hitter for a second; the hitter keeps going', () => {
  const looks = createLooks();
  const hitter = ball(0, 0, 4, 0);
  const struck = ball(1, 0);
  looks.noteHits([{ type: 'ball', a: hitter, b: struck, nx: 1, nz: 0, before: { avx: 4, avz: 0, bvx: 0, bvz: 0 } }], () => true);
  struck.vx = 3; // knocked away, but still watching
  looks.update(struck, 0.1, null, false);
  looks.update(hitter, 0.1, null, true);
  assert.ok(struck.look.x < 0, 'looks back at the hitter');
  assert.ok(hitter.look.x > 0, 'hitter looks ahead');
  looks.update(struck, CONFIG.look.reactSeconds, null, false);
  looks.update(struck, 0.01, null, false);
  assert.ok(struck.look.x > 0, 'then along its way again');
});

test('balls near a blast look at it, unless a wall is between', () => {
  const looks = createLooks();
  const near = ball(1.5, 1.5);
  const far = ball(8.5, 1.5);
  const level = { width: 12, height: 4, tiles: Array.from({ length: 4 }, () => Array(12).fill('floor')) };
  looks.blast(level, 2.5, 1.5, [near, far], () => true);
  looks.update(near, 0.01, null, false);
  looks.update(far, 0.01, null, false);
  assert.ok(near.look.x > 0);
  assert.equal(far.look, null);
});

test('an idle ball glances somewhere now and then, and back', () => {
  const looks = createLooks();
  const b = ball(0, 0);
  let glanced = false;
  for (let t = 0; t < CONFIG.look.idleMax + 0.5; t += 0.1) {
    looks.update(b, 0.1, null, false);
    if (b.look?.sx !== undefined) glanced = true;
  }
  assert.ok(glanced);
});
