import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotFromDrag, canGrab, previewPath } from '../src/aim.js';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall, stepWorld, isAtRest, applyBumperKick, applyBumperKicks } from '../src/physics.js';
import { CONFIG } from '../src/config.js';

const A = CONFIG.aim;
const hero = { x: 5, z: 5, radius: CONFIG.ball.diameter / 2 };

test('releasing inside the cancel radius cancels', () => {
  assert.equal(shotFromDrag(hero, { x: 5.3, z: 5 }).cancel, true);
});

test('pull-back fires the opposite way, power scales with drag distance', () => {
  const half = shotFromDrag(hero, { x: 5, z: 5 + (A.cancelRadius + A.fullPowerDrag) / 2 });
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

const hall = parseLevel(['#'.repeat(40), '#S' + '.'.repeat(37) + '#', '#'.repeat(40)].join('\n'));

test('preview length follows shot power and ends where the ball stops', () => {
  const start = { x: 1.5, z: 1.5, radius: hero.radius };
  for (const speed of [2, 5, 8]) {
    const p = previewPath(hall, start, 1, 0, speed);
    assert.equal(p.stopped, true);
    assert.equal(p.bends, 0);
    // The real shot, for comparison.
    const world = createWorld(hall);
    const ball = createBall({ x: 1.5, z: 1.5 });
    ball.vx = speed;
    world.balls.push(ball);
    while (!isAtRest(world)) stepWorld(world);
    const end = p.points.at(-1);
    assert.ok(Math.abs(end.x - ball.x) < 1e-9, `speed ${speed}: preview ${end.x} vs shot ${ball.x}`);
  }
  const soft = previewPath(hall, start, 1, 0, 2).points.at(-1).x;
  const hard = previewPath(hall, start, 1, 0, 8).points.at(-1).x;
  assert.ok(hard > soft + 3);
});

test('preview shows one bounce, then stops at the next contact', () => {
  const box = parseLevel('#####\n#...#\n#.S.#\n#...#\n#####');
  const p = previewPath(box, { x: 2.5, z: 2.5, radius: hero.radius }, Math.SQRT1_2, -Math.SQRT1_2, A.maxLaunchSpeed);
  assert.equal(p.bends, 1);
  assert.equal(p.stopped, false);
  assert.equal(p.points.length, 3);
});

test('an enemy in the way bends the preview like a wall', () => {
  const start = { x: 1.5, z: 1.5, radius: hero.radius };
  const clear = previewPath(hall, start, 1, 0, 8);
  const blocked = previewPath(hall, start, 1, 0, 8, [{ x: 5, z: 1.5, radius: hero.radius }]);
  assert.equal(clear.bends, 0);
  assert.equal(blocked.bends, 1);
  assert.ok(blocked.points[1].x < 5 - hero.radius, 'bends at the enemy, not past it');
});

import { createStaticCircle } from '../src/physics.js';

test('a barrel in the way bends the preview', () => {
  const start = { x: 1.5, z: 1.5, radius: hero.radius };
  const barrel = createStaticCircle({ x: 5, z: 1.5, radius: 0.34, kind: 'barrel', id: 'b' });
  const p = previewPath(hall, start, 1, 0, 8, [], [barrel]);
  assert.equal(p.bends, 1);
  assert.ok(p.points[1].x < 5 - 0.34, 'bends at the barrel');
});

test('the preview matches the real shot, kills and barrels included', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseLevel: parse, tileCenter } = await import('../src/level.js');
  const { createObjects, resolveObjects } = await import('../src/objects.js');
  const { createCombat, createEnemy } = await import('../src/combat.js');
  const text = readFileSync(new URL('../src/levels/long-hall.txt', import.meta.url), 'utf8');
  for (let i = 0; i < 80; i++) {
    const level = parse(text);
    const world = createWorld(level);
    const hero = Object.assign(createBall({ ...tileCenter(level.start), kind: 'hero', id: 'hero' }), { hp: 10, maxHp: 10, atk: 1, shield: false });
    world.balls.push(hero);
    world.statics = createObjects(level);
    // Every other enemy dies in one hit, so killing blows (which ricochet) come up.
    level.enemies.forEach((e, n) => world.balls.push(Object.assign(createEnemy({ ...tileCenter(e), level: e.level, id: `e${n}` }), n % 2 ? {} : { hp: 1 })));
    const a = (i / 80) * Math.PI * 2;
    const speed = 3 + (i % 7);
    // Every third shot with Athletic and Elasticity, which the preview must include too.
    const cards = i % 3 === 0;
    if (cards) hero.friction = CONFIG.cards.athleticFriction;
    const kick = cards ? CONFIG.cards.elasticityKick : 0;
    const prev = previewPath(level, hero, Math.cos(a), Math.sin(a), speed, world.balls.filter((b) => b !== hero), world.statics, { kick });
    const combat = createCombat();
    combat.beginShot();
    hero.vx = Math.cos(a) * speed;
    hero.vz = Math.sin(a) * speed;
    const contacts = [{ x: hero.x, z: hero.z }];
    const kicks = new Map();
    for (let s = 0; s < 2000 && contacts.length < prev.points.length; s++) {
      stepWorld(world);
      const touched = world.events.some((ev) => ev.ball === hero || ev.a === hero || ev.b === hero);
      combat.resolve(world, hero);
      resolveObjects(world, hero);
      applyBumperKicks(world, kicks, CONFIG.aim.maxLaunchSpeed, kick ? { ball: hero, kick, perBumper: CONFIG.cards.elasticityKicksPerBumper } : null);
      world.events.length = 0;
      if (touched) contacts.push({ x: hero.x, z: hero.z });
      if (hero.vx === 0 && hero.vz === 0) contacts.push({ x: hero.x, z: hero.z });
    }
    const k = Math.min(contacts.length, prev.points.length) - 1;
    const err = Math.hypot(contacts[k].x - prev.points[k].x, contacts[k].z - prev.points[k].z);
    assert.ok(err < 0.01, `shot ${i} (angle ${a.toFixed(2)}, speed ${speed}) ends ${err.toFixed(2)} tiles from its preview`);
  }
});
