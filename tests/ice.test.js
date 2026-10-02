import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall, stepWorld, speedOf } from '../src/physics.js';
import { createEnemy } from '../src/combat.js';
import { createIce, meltIce, stepIce } from '../src/ice.js';
import { CONFIG } from '../src/config.js';

const room = parseLevel(`
############
#..........#
#..........#
#S.........#
############`);

const roll = (world, ice, move, steps = 120) => {
  for (let i = 0; i < steps; i++) {
    stepWorld(world);
    stepIce(world, room, ice, move);
    world.events.length = 0;
  }
};

test('a moving Ice ball ices every floor tile it crosses', () => {
  const world = createWorld(room);
  const e = createEnemy({ x: 1.5, z: 1.5, level: 1, id: 'i', type: 'ice' });
  e.vx = 6;
  world.balls.push(e);
  const ice = createIce();
  roll(world, ice, 1);
  assert.ok(ice.size >= 5, `${ice.size} puddles`);
  for (const p of ice.values()) assert.equal(p.row, 1);
  assert.ok(ice.has('1,1'));
});

test('a ball rolling onto a puddle is kicked once per puddle per move', () => {
  const ice = createIce();
  ice.set('3,2', { col: 3, row: 2, move: 1, boosted: new Set() });
  const run = (withIce) => {
    const world = createWorld(room);
    const b = createBall({ x: 1.5, z: 2.5, kind: 'hero', id: 'h' });
    b.vx = 4;
    world.balls.push(b);
    roll(world, withIce, 1, 60);
    return { b, speed: speedOf(b) };
  };
  const plain = run(createIce());
  const iced = run(ice);
  assert.ok(iced.speed > plain.speed + CONFIG.enemy.types.ice.puddleKick * 0.9);
  assert.ok(ice.get('3,2').boosted.has(iced.b));
});

test('puddles last out their move and the next, then melt', () => {
  const ice = createIce();
  ice.set('1,1', { col: 1, row: 1, move: 1, boosted: new Set(['x']) });
  meltIce(ice, 2);
  assert.ok(ice.has('1,1'));
  assert.equal(ice.get('1,1').boosted.size, 0);
  meltIce(ice, 3);
  assert.equal(ice.size, 0);
});
