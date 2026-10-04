import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hurtGold, splitGold } from '../src/loot.js';

test('a hit takes 10% of your gold and scatters half of that', () => {
  assert.deepEqual(hurtGold(100), { lost: 10, scattered: 5 });
  assert.deepEqual(hurtGold(1000), { lost: 100, scattered: 50 });
  assert.deepEqual(hurtGold(15), { lost: 2, scattered: 1 });
  assert.deepEqual(hurtGold(1), { lost: 1, scattered: 1 });
  assert.deepEqual(hurtGold(0), { lost: 0, scattered: 0 });
});

test('scattered gold shares out among the coin pieces without losing any', () => {
  assert.deepEqual(splitGold(5, 5), [1, 1, 1, 1, 1]);
  const big = splitGold(50, 20);
  assert.equal(big.length, 20);
  assert.equal(big.reduce((a, b) => a + b, 0), 50);
  assert.ok(Math.max(...big) - Math.min(...big) <= 1);
});
