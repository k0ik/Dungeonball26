import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotFromDrag, canGrab, previewPath } from '../src/aim.js';
import { parseLevel } from '../src/level.js';
import { CONFIG } from '../src/config.js';

const A = CONFIG.aim;
const hero = { x: 5, z: 5, radius: CONFIG.ball.diameter / 2 };

test('releasing inside the inner ring cancels', () => {
  assert.equal(shotFromDrag(hero, { x: 5.3, z: 5 }).cancel, true);
});

test('pull-back fires the opposite way, power scales across the ring', () => {
  const half = shotFromDrag(hero, { x: 5, z: 5 + (A.ringInner + A.ringOuter) / 2 });
  assert.equal(half.cancel, false);
  assert.ok(Math.abs(half.fill - 0.5) < 1e-9);
  assert.ok(Math.abs(half.speed - A.maxLaunchSpeed / 2) < 1e-9);
  assert.ok(half.dirZ < -0.999, 'dragging toward +z launches toward -z');
  assert.equal(shotFromDrag(hero, { x: 1, z: 5 }).speed, A.maxLaunchSpeed, 'clamped at full');
});

test('grab only near the hero', () => {
  assert.ok(canGrab(hero, { x: 5.5, z: 5.5 }));
  assert.ok(!canGrab(hero, { x: 7, z: 5 }));
});

test('preview bends once off the first wall', () => {
  const level = parseLevel('#####\n#...#\n#.S.#\n#...#\n#####');
  const p = previewPath(level, { x: 2.5, z: 2.5, radius: hero.radius }, Math.SQRT1_2, -Math.SQRT1_2);
  assert.equal(p.bend, true);
  assert.equal(p.points.length, 3);
});
