import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createBall, createWorld, stepWorld, isAtRest } from '../src/physics.js';
import { canSee } from '../src/sight.js';
import { nextActor, lungeVelocity, patrolMove, heroDamage } from '../src/turns.js';
import { createCombat, createEnemy } from '../src/combat.js';
import { CONFIG } from '../src/config.js';

const room = parseLevel(`
############
#..........#
#..........#
#....#.....#
#..........#
#S.........#
############`);

const hero = (x, z) => Object.assign(createBall({ x, z, kind: 'hero', id: 'hero' }), { hp: 10, maxHp: 10, atk: 1, def: 0 });
const enemy = (x, z, level = 1, id = 'e') => createEnemy({ x, z, level, id });

test('sight: open line within range', () => {
  const h = hero(1.5, 1.5);
  const e = enemy(6.5, 1.5);
  assert.equal(canSee(room, e, h, [h, e]), true);
});

test('sight: blocked by a wall', () => {
  const h = hero(3.5, 3.5);
  const e = enemy(8.5, 3.5); // wall at col 5, row 3 between them
  assert.equal(canSee(room, e, h, [h, e]), false);
});

test('sight: blocked by another enemy in the way', () => {
  const h = hero(1.5, 1.5);
  const e = enemy(6.5, 1.5);
  const blocker = enemy(4, 1.5, 1, 'b');
  assert.equal(canSee(room, e, h, [h, e, blocker]), false);
  const offLine = enemy(4, 3.5, 1, 'c');
  assert.equal(canSee(room, e, h, [h, e, offLine]), true);
});

test('sight: limited to the sight range', () => {
  const h = hero(1.5, 1.5);
  assert.equal(canSee(room, enemy(1.5 + CONFIG.enemy.sightRange - 0.1, 1.5), h, []), true);
  assert.equal(canSee(room, enemy(1.5 + CONFIG.enemy.sightRange + 0.2, 1.5), h, []), false);
});

test('sight: a hero-width sweep fits a one-tile gap', () => {
  const gap = parseLevel(`
#######
#.....#
###.###
#.....#
#S....#
#######`);
  const h = hero(3.5, 4.5);
  assert.equal(canSee(gap, enemy(3.5, 1.5), h, []), true, 'straight through the gap');
  assert.equal(canSee(gap, enemy(1.5, 1.5), h, []), false, 'diagonal clips the gap edge');
});

test('turn order: nearest untaken enemy first', () => {
  const h = hero(1.5, 1.5);
  const far = enemy(9, 1.5, 1, 'far');
  const near = enemy(3, 1.5, 1, 'near');
  const dead = Object.assign(enemy(2, 1.5, 1, 'dead'), { hp: 0 });
  const taken = new Set();
  assert.equal(nextActor([far, near, dead], h, taken), near);
  taken.add(near);
  assert.equal(nextActor([far, near, dead], h, taken), far);
  taken.add(far);
  assert.equal(nextActor([far, near, dead], h, taken), null);
});

test('lunge heads straight at the hero at lunge speed', () => {
  const v = lungeVelocity(enemy(5, 5), hero(2, 1));
  assert.ok(Math.abs(Math.hypot(v.vx, v.vz) - CONFIG.enemy.lungeSpeed) < 1e-9);
  assert.ok(v.vx < 0 && v.vz < 0);
});

test('patrol picks a free floor tile within range and rolls to rest near it', () => {
  const e = enemy(6.5, 2.5);
  let seed = 0.37;
  const rng = () => (seed = (seed * 9301 + 0.49297) % 1);
  for (let i = 0; i < 20; i++) {
    const move = patrolMove(room, e, [e], rng);
    assert.ok(move);
    assert.ok(move.target.d <= CONFIG.enemy.patrolRadius);
    const speed = Math.hypot(move.vx, move.vz);
    assert.ok(speed >= CONFIG.enemy.patrolSpeedMin - 1e-9 && speed <= CONFIG.enemy.patrolSpeedMax + 1e-9);
  }
  // Run one for real: it should come to rest close to its target.
  const world = createWorld(room);
  const move = patrolMove(room, e, [e], () => 0.5);
  e.vx = move.vx;
  e.vz = move.vz;
  world.balls.push(e);
  while (!isAtRest(world)) stepWorld(world);
  assert.ok(Math.hypot(e.x - move.target.x, e.z - move.target.z) < 0.8);
});

test('patrol stays put when boxed in', () => {
  const box = parseLevel('#####\n#S#.#\n#####');
  const e = enemy(1.5, 1.5);
  assert.equal(patrolMove(box, e, [e]), null);
});

test('hero damage is max(1, L - DEF)', () => {
  assert.equal(heroDamage(1, 0), 1);
  assert.equal(heroDamage(3, 0), 3);
  assert.equal(heroDamage(1, 1), 1);
  assert.equal(heroDamage(3, 1), 2);
});

test('enemy phase: only the attacker hurts the hero, once per turn', () => {
  const world = createWorld(room);
  const h = hero(3, 3);
  const attacker = enemy(4, 3, 3, 'a');
  const bystander = enemy(3, 4, 2, 'b');
  world.balls.push(h, attacker, bystander);
  const combat = createCombat();
  combat.beginEnemyTurn(attacker);
  world.events.push(
    { type: 'ball', a: bystander, b: h, speed: 5 },
    { type: 'ball', a: attacker, b: h, speed: 5 },
    { type: 'ball', a: h, b: attacker, speed: 5 },
    { type: 'ball', a: attacker, b: bystander, speed: 5 },
  );
  const out = combat.resolve(world, h);
  assert.deepEqual(out.map((o) => [o.type, o.amount]), [['hurt', 3]]);
  assert.equal(h.hp, 7);
  assert.equal(attacker.hp, 6, 'hero contact in the enemy phase does no damage');
  assert.equal(bystander.hp, 4, 'enemy-enemy contact in the enemy phase does no damage');
  combat.beginShot();
  world.events.push({ type: 'ball', a: attacker, b: h, speed: 5 });
  combat.resolve(world, h);
  assert.equal(h.hp, 7, 'no hero damage during your own shot');
});

test('enemy phase: a soft touch below the hit threshold does no damage', () => {
  const world = createWorld(room);
  const h = hero(3, 3);
  const attacker = enemy(4, 3, 1, 'a');
  const combat = createCombat();
  combat.beginEnemyTurn(attacker);
  world.events.push({ type: 'ball', a: attacker, b: h, speed: 1 });
  combat.resolve(world, h);
  assert.equal(h.hp, 10);
});
