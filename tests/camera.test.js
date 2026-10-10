import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFraming, clampFraming } from '../src/render/cameraRig.js';

const opts = {
  yaw: (30 * Math.PI) / 180,
  elevation: (37 * Math.PI) / 180,
  aspect: 9 / 16,
  minWidth: 9,
  maxWidth: 22,
  padding: 2,
};

test('a single ball is centred at the minimum width', () => {
  const f = computeFraming([{ x: 4, z: 7 }], opts);
  assert.ok(Math.abs(f.x - 4) < 1e-9 && Math.abs(f.z - 7) < 1e-9);
  assert.equal(f.width, 9);
});

test('two balls are centred between them', () => {
  const f = computeFraming([{ x: 2, z: 10 }, { x: 6, z: 10 }], opts);
  assert.ok(Math.abs(f.x - 4) < 1e-9 && Math.abs(f.z - 10) < 1e-9);
});

test('balls spread across the screen widen the view to fit them with padding', () => {
  // Along the screen-right axis (cos yaw, -sin yaw), 12 tiles apart.
  const r = { x: Math.cos(opts.yaw), z: -Math.sin(opts.yaw) };
  const f = computeFraming([{ x: 0, z: 0 }, { x: 12 * r.x, z: 12 * r.z }], opts);
  assert.ok(Math.abs(f.width - (12 + 2 * opts.padding)) < 1e-9, `width ${f.width}`);
});

test('the view never exceeds the maximum width', () => {
  const f = computeFraming([{ x: 0, z: 0 }, { x: 40, z: 0 }], opts);
  assert.equal(f.width, 22);
});

test('a speed-based minimum still applies when balls are close', () => {
  const f = computeFraming([{ x: 3, z: 3 }], { ...opts, minWidth: 12 });
  assert.equal(f.width, 12);
});

test('the view is shifted to stay inside the level outline, never off a ball', () => {
  const box = { minX: 0, maxX: 20, minY: 0, maxY: 40 };
  // A ball near the bottom edge: the centre is pulled up so the view's bottom
  // edge sits on the level's, but the ball stays in view.
  const f = { x: 0, z: 0, width: 10 };
  const ax = { right: { x: Math.cos(opts.yaw), z: -Math.sin(opts.yaw) }, toward: { x: Math.sin(opts.yaw), z: Math.cos(opts.yaw) } };
  const squash = Math.sin(opts.elevation);
  // Build a ground point whose screen position is (10, 39).
  const gy = 39 / squash;
  f.x = ax.right.x * 10 + ax.toward.x * gy;
  f.z = ax.right.z * 10 + ax.toward.z * gy;
  const c = clampFraming(f, box, opts);
  const sy = (c.x * ax.toward.x + c.z * ax.toward.z) * squash;
  const halfH = 10 / opts.aspect / 2;
  assert.ok(Math.abs(sy - (40 - halfH)) < 1e-9, 'bottom edge of the view on the level edge');
  assert.ok(39 <= sy + halfH, 'the ball is still on screen');
});

test('a level smaller than the view is simply centred', () => {
  const c = clampFraming({ x: 1, z: 1, width: 50 }, { minX: 0, maxX: 4, minY: 0, maxY: 4 }, opts);
  const ax = { right: { x: Math.cos(opts.yaw), z: -Math.sin(opts.yaw) } };
  assert.ok(Math.abs(c.x * ax.right.x + c.z * ax.right.z - 2) < 1e-9);
});
