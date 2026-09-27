import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFraming } from '../src/render/cameraRig.js';

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
