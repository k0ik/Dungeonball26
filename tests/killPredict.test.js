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

import { chooseVantage, seesOver } from '../src/killCutVantage.js';

test('the jump cut picks a spot on the usual camera side that sees your ball and the impact, clear of the balls', () => {
  const level = parseLevel('#############\n#...........#\n#...........#\n#...........#\n#.....S.....#\n#...........#\n#...........#\n#...........#\n#############');
  const hero = { x: 2.5, z: 4.5 };
  const impact = { x: 8.5, z: 4.5 };
  const toward = { x: 0.5, z: 0.866 }; // the usual camera looks from +z (down the screen)
  const spot = chooseVantage(level, [{ ...hero, radius: 0.3 }, { ...impact, radius: 0.3 }], hero, impact, { x: 1, z: 0 }, toward);
  assert.ok(spot, 'found one');
  assert.ok(spot.z > impact.z, `on the camera's side of the board, got ${JSON.stringify(spot)}`);
  assert.ok(seesOver(level, spot, spot.y, hero) && seesOver(level, spot, spot.y, impact));
});

test('a camera low behind a wall cannot see over it; a high one can', () => {
  const level = parseLevel('#######\n#.....#\n#..#..#\n#..S..#\n#######');
  assert.equal(seesOver(level, { x: 3.5, z: 1.5 }, 0.4, { x: 3.5, z: 3.5 }), false);
  assert.equal(seesOver(level, { x: 3.5, z: 1.5 }, 3, { x: 3.5, z: 3.5 }), true);
});

test('two enemies that already collided this shot are not predicted to hurt each other again', () => {
  const world = createWorld(room);
  const hero = createBall({ x: 1.5, z: 1.5, kind: 'hero', id: 'hero' });
  hero.atk = 1;
  const a = createEnemy({ x: 3.5, z: 3.5, level: 1, id: 'a' });
  const b = createEnemy({ x: 6.5, z: 3.5, level: 1, id: 'b' });
  a.hp = 1;
  b.hp = 1;
  a.vx = 6; // a rolls into b: a combo, 1 damage each, would kill both
  world.balls.push(hero, a, b);
  assert.ok(predictKill(world, hero, 1), 'a fresh shot: the combo kill is predicted');
  const used = { pairs: new Set(['a|b']), damaged: [], kills: 0 };
  assert.equal(predictKill(world, hero, 1, new Map(), null, used), null, 'that pair already met this shot: no kill');
});
