import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, offerCards, takeCard, has } from '../src/cards.js';
import { rollLoot } from '../src/loot.js';
import { createWorld, createBall, createStaticCircle, stepWorld, applyBumperKick, speedOf } from '../src/physics.js';
import { parseLevel } from '../src/level.js';
import { CONFIG } from '../src/config.js';

test('the seven starting artifacts (Locksmith and Doppleganger are shelved)', () => {
  assert.deepEqual(
    CARDS.map((c) => c.name),
    [
      "Vampire's Tooth", 'Junk Detector', 'Magic Wallet', 'Wood Axe', 'Rollerskates', 'Moola Magnet',
      'Rubber Bumpers',
    ],
  );
});

test('an offer is 3 different cards, never one you hold', () => {
  const held = ['athletic', 'elasticity', 'vampirism'];
  for (let i = 0; i < 200; i++) {
    const offer = offerCards(held);
    assert.equal(offer.length, 3);
    assert.equal(new Set(offer).size, 3);
    assert.ok(offer.every((id) => !held.includes(id)));
  }
});

test('taking a card fills a free slot, or replaces the one you choose when full', () => {
  let hand = takeCard([], 'athletic');
  hand = takeCard(hand, 'elasticity');
  hand = takeCard(hand, 'vampirism');
  assert.deepEqual(hand, ['athletic', 'elasticity', 'vampirism']);
  assert.equal(takeCard(hand, 'bullionaire'), null, 'full: must choose one to replace');
  assert.deepEqual(takeCard(hand, 'bullionaire', 'elasticity'), ['athletic', 'bullionaire', 'vampirism']);
  assert.ok(has(hand, 'vampirism') && !has(hand, 'bullionaire'));
});

test('Junk Hunter doubles the sword and shield weights in barrels', () => {
  const count = (gearWeight) => {
    let seed = 11;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let gear = 0;
    for (let i = 0; i < 20000; i++) if (['sword', 'shield'].includes(rollLoot(rng, { gearWeight }).kind)) gear++;
    return gear / 20000;
  };
  const table = CONFIG.loot.table;
  const total = table.reduce((s, e) => s + e.weight, 0);
  const gearW = table.filter((e) => e.kind === 'sword' || e.kind === 'shield').reduce((s, e) => s + e.weight, 0);
  assert.ok(Math.abs(count(1) - gearW / total) < 0.01);
  assert.ok(Math.abs(count(2) - (2 * gearW) / (total + gearW)) < 0.01);
});

test('Elasticity kicks a ball off a barrel, but not off a wall', () => {
  const level = parseLevel('#######\n#.....#\n#.S...#\n#.....#\n#######');
  const world = createWorld(level);
  const ball = createBall({ x: 2.5, z: 2.5 });
  world.balls.push(ball);
  world.statics = [createStaticCircle({ x: 4.2, z: 2.5, radius: 0.34, kind: 'barrel', id: 'b' })];
  ball.vx = 4;
  let kicked = false;
  for (let i = 0; i < 120 && !kicked; i++) {
    stepWorld(world);
    const before = speedOf(ball);
    kicked = applyBumperKick(world, ball, 1.5, 9);
    if (kicked) assert.ok(Math.abs(speedOf(ball) - (before + 1.5)) < 1e-9);
    world.events.length = 0;
  }
  assert.ok(kicked, 'kicked off the barrel');
  // A wall bounce alone gets no kick.
  world.statics = [];
  ball.x = 4.5; ball.z = 2.5; ball.vx = 4; ball.vz = 0;
  for (let i = 0; i < 120; i++) {
    stepWorld(world);
    assert.equal(applyBumperKick(world, ball, 1.5, 9), false);
    world.events.length = 0;
  }
});

test('a found card can replace a held one even with a slot free', () => {
  assert.deepEqual(takeCard(['athletic'], 'elasticity', 'athletic'), ['elasticity']);
  assert.deepEqual(takeCard(['athletic'], 'elasticity'), ['athletic', 'elasticity']);
});
