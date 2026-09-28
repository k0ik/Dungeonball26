import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall, stepWorld, isAtRest } from '../src/physics.js';
import { createObjects, resolveObjects } from '../src/objects.js';
import { rollLoot, canCollect, collect, useSwordHit } from '../src/loot.js';
import { createCombat, createEnemy } from '../src/combat.js';
import { CONFIG } from '../src/config.js';

const level = parseLevel(`
############
#..........#
#.O..C..E..#
#..........#
#S.........#
############`);

function setup() {
  const world = createWorld(level);
  const hero = Object.assign(createBall({ x: 1.5, z: 4.5, kind: 'hero', id: 'hero' }), { hp: 10, maxHp: 10, atk: 1, shield: false, swordHits: 0 });
  world.balls.push(hero);
  world.statics = createObjects(level);
  return { world, hero, get: (kind) => world.statics.find((s) => s.kind === kind) };
}

const touch = (world, ball, obj, speed = 3) => world.events.push({ type: 'static', ball, obj, speed });

test('the level builds a barrel, a chest and a red barrel as bumpers', () => {
  const { world } = setup();
  assert.deepEqual(world.statics.map((s) => `${s.kind}:${s.shape}`).sort(), ['barrel:circle', 'chest:box', 'explosive:circle']);
});

test('a barrel cracks on each hero hit and breaks on the second', () => {
  const { world, hero, get } = setup();
  const barrel = get('barrel');
  const stages = [];
  for (let i = 0; i < 2; i++) {
    touch(world, hero, barrel);
    stages.push(...resolveObjects(world, hero).map((o) => o.type + (o.stage ?? '')));
    world.events.length = 0;
    world.time += 0.2;
  }
  assert.deepEqual(stages, ['crack1', 'break']);
  assert.ok(!world.statics.includes(barrel), 'a broken barrel leaves the board');
});

test('only the hero cracks barrels, and not within the cooldown', () => {
  const { world, hero, get } = setup();
  const barrel = get('barrel');
  const enemy = createEnemy({ x: 3, z: 2.5, level: 1, id: 'e' });
  touch(world, enemy, barrel);
  touch(world, hero, barrel);
  touch(world, hero, barrel); // same instant: inside the cooldown
  resolveObjects(world, hero);
  assert.equal(barrel.hits, 1);
});

test('a chest opens once, for 8 to 24 gold', () => {
  const { world, hero, get } = setup();
  const chest = get('chest');
  touch(world, hero, chest);
  const out = resolveObjects(world, hero);
  assert.equal(out.length, 1);
  assert.ok(out[0].gold >= CONFIG.objects.chestGoldMin && out[0].gold <= CONFIG.objects.chestGoldMax);
  world.events.length = 0;
  touch(world, hero, chest);
  assert.equal(resolveObjects(world, hero).length, 0, 'already open');
  assert.ok(world.statics.includes(chest), 'an open chest stays as a bumper');
});

test('a red barrel goes off on any contact, even a slow enemy touch, and hurts that ball', () => {
  const { world, hero, get } = setup();
  const red = get('explosive');
  const enemy = createEnemy({ x: 8.5, z: 3.2, level: 2, id: 'e' });
  world.balls.push(enemy);
  touch(world, enemy, red, 0.1);
  const [ev] = resolveObjects(world, hero);
  assert.equal(ev.type, 'explode');
  assert.equal(ev.victim, enemy);
  const combat = createCombat();
  combat.beginShot();
  const out = combat.explosion(world, enemy, hero);
  assert.equal(enemy.hp, 3);
  assert.equal(out[0].type, 'blast');
  assert.ok(!world.statics.includes(red));
});

test('a red barrel ignores the shield and can finish an enemy', () => {
  const { world, hero } = setup();
  hero.shield = true;
  const combat = createCombat();
  combat.explosion(world, hero, hero);
  assert.equal(hero.hp, 9);
  assert.equal(hero.shield, true, 'the shield is not used up by a blast');
  const enemy = Object.assign(createEnemy({ x: 5, z: 1.5, level: 1, id: 'e' }), { hp: 1 });
  world.balls.push(enemy);
  combat.beginShot();
  const out = combat.explosion(world, enemy, hero);
  assert.ok(out.some((o) => o.type === 'kill'));
  assert.ok(!world.balls.includes(enemy));
});

test('a held shield cancels an attacker hit and is used up', () => {
  const { world, hero } = setup();
  hero.shield = true;
  const attacker = createEnemy({ x: 3, z: 4.5, level: 3, id: 'a' });
  const combat = createCombat();
  combat.beginEnemyTurn(attacker);
  world.events.push({ type: 'ball', a: attacker, b: hero, speed: 5 });
  const out = combat.resolve(world, hero);
  assert.deepEqual(out.map((o) => o.type), ['blocked']);
  assert.equal(hero.hp, 10);
  assert.equal(hero.shield, false);
  combat.beginEnemyTurn(attacker);
  world.events.push({ type: 'ball', a: attacker, b: hero, speed: 5 });
  combat.resolve(world, hero);
  assert.equal(hero.hp, 9, 'the next hit lands');
});

test('loot rolls follow the table and gold is 1 to 5', () => {
  const counts = {};
  let seed = 0.123;
  const rng = () => (seed = (seed * 16807 + 0.3141) % 1);
  for (let i = 0; i < 4000; i++) {
    const l = rollLoot(rng);
    counts[l.kind] = (counts[l.kind] ?? 0) + 1;
    if (l.kind === 'gold') assert.ok(l.value >= 1 && l.value <= 5);
  }
  const share = (k) => counts[k] / 4000;
  assert.ok(Math.abs(share('gold') - 0.45) < 0.04, JSON.stringify(counts));
  assert.ok(Math.abs(share('potion') - 0.25) < 0.04);
  assert.ok(counts.oneUp > 0 && counts.sword > 0 && counts.superPotion > 0 && counts.shield > 0);
});

test('pickup rules: potions wait at full HP, shields do not stack', () => {
  const hero = { hp: 10, maxHp: 10, atk: 1, shield: false, swordHits: 0 };
  const run = { gold: 0, lives: 3 };
  assert.equal(canCollect({ kind: 'potion' }, hero), false);
  hero.hp = 4;
  assert.equal(collect({ kind: 'superPotion' }, hero, run), '+5 HP');
  assert.equal(hero.hp, 9);
  assert.equal(collect({ kind: 'superPotion' }, hero, run), '+5 HP');
  assert.equal(hero.hp, 10, 'capped at max');
  assert.equal(collect({ kind: 'shield' }, hero, run), 'Shield');
  assert.equal(canCollect({ kind: 'shield' }, hero), false, 'no stacking');
  collect({ kind: 'gold', value: 3 }, hero, run);
  collect({ kind: 'coins', value: 2 }, hero, run);
  collect({ kind: 'oneUp' }, hero, run);
  assert.deepEqual(run, { gold: 5, lives: 4 });
});

test('a real shot cracks a barrel through the physics', () => {
  const { world, hero, get } = setup();
  const barrel = get('barrel');
  hero.x = 2.5;
  hero.z = 4.5;
  hero.vz = -5;
  const out = [];
  while (!isAtRest(world)) {
    stepWorld(world);
    out.push(...resolveObjects(world, hero));
    world.events.length = 0;
  }
  assert.ok(out.some((o) => o.type === 'crack' && o.obj === barrel));
});

test('a sword gives +3 ATK for two hits: whole, then broken, then gone', () => {
  const hero = { hp: 10, maxHp: 10, atk: 1, shield: false, swordHits: 0 };
  const run = { gold: 0, lives: 3 };
  assert.equal(useSwordHit(hero), null, 'no sword, nothing to use');
  collect({ kind: 'sword' }, hero, run);
  assert.equal(hero.atk, 4);
  assert.equal(canCollect({ kind: 'sword' }, hero), false, 'a second sword waits while this one is whole');
  assert.equal(useSwordHit(hero), 'broken');
  assert.equal(hero.atk, 4, 'still +3 for the last hit');
  assert.equal(canCollect({ kind: 'sword' }, hero), true, 'a broken sword can be replaced');
  assert.equal(useSwordHit(hero), 'gone');
  assert.equal(hero.atk, 1);
  collect({ kind: 'sword' }, hero, run);
  useSwordHit(hero);
  collect({ kind: 'sword' }, hero, run); // replace the broken one
  assert.equal(hero.swordHits, 2);
  assert.equal(hero.atk, 4, 'replacing a broken sword does not stack ATK');
});
