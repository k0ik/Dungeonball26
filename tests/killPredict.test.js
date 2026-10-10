import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall } from '../src/physics.js';
import { createEnemy } from '../src/combat.js';
import { predictKill } from '../src/killPredict.js';

const room = parseLevel('###########\n#.........#\n#.........#\n#....S....#\n#.........#\n###########');

function setup(enemyHp) {
  const world = createWorld(room);
  const hero = createBall({ x: 2.5, z: 3.5, kind: 'hero', id: 'hero' });
  hero.atk = 1;
  hero.hp = 5;
  const enemy = createEnemy({ x: 6.5, z: 3.5, level: 1, id: 'e' });
  enemy.hp = enemyHp;
  world.balls.push(hero, enemy);
  hero.vx = 6;
  return { world, hero, enemy };
}

test('a shot about to kill an enemy is predicted, with the time to impact, without touching the real world', () => {
  const { world, hero, enemy } = setup(1);
  const p = predictKill(world, hero, 1);
  assert.ok(p, 'predicted');
  assert.equal(p.target, enemy);
  assert.ok(p.t > 0.4 && p.t < 0.7, `about 3.35 tiles at 6 tiles/s, got ${p.t}`);
  assert.equal(hero.x, 2.5, 'the real hero has not moved');
  assert.equal(enemy.hp, 1, 'the real enemy is unhurt');
});

test('no kill predicted when the hit would not kill, or it is too far ahead', () => {
  const tough = setup(3);
  assert.equal(predictKill(tough.world, tough.hero, 1), null);
  const { world, hero } = setup(1);
  assert.equal(predictKill(world, hero, 0.2), null, 'the impact is beyond the look-ahead');
});
