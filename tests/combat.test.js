import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/level.js';
import { createWorld, createBall, stepWorld, isAtRest } from '../src/physics.js';
import { createCombat, createEnemy, enemyMaxHp } from '../src/combat.js';
import { CONFIG } from '../src/config.js';

const room = parseLevel(['#'.repeat(20), ...Array(8).fill('#' + '.'.repeat(18) + '#'), '#'.repeat(20)].join('\n').replace('#.', '#S'));

function setup(enemies) {
  const world = createWorld(room);
  const hero = createBall({ x: 2, z: 4.5, kind: 'hero', id: 'hero' });
  hero.atk = 1;
  world.balls.push(hero);
  const list = enemies.map((e, i) => createEnemy({ ...e, id: `e${i}` }));
  world.balls.push(...list);
  const combat = createCombat();
  combat.beginShot();
  return { world, hero, list, combat };
}

function runShot(ctx, maxSeconds = 6) {
  const outcomes = [];
  for (let t = 0; t < maxSeconds && !(t > 0 && isAtRest(ctx.world)); t += CONFIG.physics.step) {
    stepWorld(ctx.world);
    outcomes.push(...ctx.combat.resolve(ctx.world, ctx.hero));
    ctx.world.events.length = 0;
  }
  return outcomes;
}

test('enemy HP is 2 x level', () => {
  assert.deepEqual([1, 2, 3].map(enemyMaxHp), [2, 4, 6]);
});

test('hero hit costs the enemy ATK HP, regardless of speed', () => {
  for (const speed of [5, 9]) {
    const ctx = setup([{ x: 5, z: 4.5, level: 2 }]);
    ctx.hero.vx = speed;
    const out = runShot(ctx, 2);
    const hits = out.filter((o) => o.type === 'hit');
    assert.equal(hits.length, 1, `speed ${speed}`);
    assert.equal(ctx.list[0].hp, 3);
  }
});

test('a slow roll-in at the tail end of a shot still lands a hit', () => {
  // Launched at 3 tiles/s, the hero reaches the enemy at under 1 tile/s.
  const ctx = setup([{ x: 5, z: 4.5, level: 1 }]);
  ctx.hero.vx = 3;
  runShot(ctx);
  assert.equal(ctx.list[0].hp, 1);
});

test('a barely-moving touch below the hit threshold does nothing', () => {
  const ctx = setup([{ x: 3, z: 4.5, level: 1 }]);
  ctx.hero.x = 3 - 0.66;
  ctx.hero.vx = 0.35; // just above the stop threshold, below the hit threshold
  runShot(ctx);
  assert.equal(ctx.list[0].hp, 2);
});

test('design doc combo: A hit into B, A takes 2 and dies, B takes 1', () => {
  const ctx = setup([
    { x: 5, z: 4.5, level: 1 },
    { x: 8, z: 4.5, level: 1 },
  ]);
  ctx.hero.vx = 8;
  const out = runShot(ctx);
  const [A, B] = ctx.list;
  assert.equal(A.hp, 0);
  assert.equal(B.hp, 1);
  assert.ok(out.some((o) => o.type === 'kill' && o.target === A));
  assert.ok(!ctx.world.balls.includes(A), 'dead enemy leaves the board');
  assert.ok(ctx.world.balls.includes(B));
});

test('an enemy pair trades damage only once per shot', () => {
  const ctx = setup([
    { x: 5, z: 4.5, level: 3 },
    { x: 6, z: 4.5, level: 3 },
  ]);
  // Force two separate impacts between the same pair within one shot.
  const [A, B] = ctx.list;
  ctx.world.events.push({ type: 'ball', a: A, b: B, speed: 5 }, { type: 'ball', a: B, b: A, speed: 5 });
  ctx.combat.resolve(ctx.world, ctx.hero);
  assert.equal(A.hp, 5);
  assert.equal(B.hp, 5);
  ctx.combat.beginShot();
  ctx.world.events.push({ type: 'ball', a: A, b: B, speed: 5 });
  ctx.combat.resolve(ctx.world, ctx.hero);
  assert.equal(A.hp, 4, 'a new shot allows the pair again');
});

test('hit cooldown stops rapid repeat hits; a later re-contact (e.g. a pin) lands again', () => {
  const ctx = setup([{ x: 5, z: 4.5, level: 3 }]);
  const [A] = ctx.list;
  const hit = () => {
    ctx.world.events.push({ type: 'ball', a: ctx.hero, b: A, speed: 4 });
    ctx.combat.resolve(ctx.world, ctx.hero);
    ctx.world.events.length = 0;
  };
  hit();
  ctx.world.time += 0.05;
  hit();
  assert.equal(A.hp, 5, 'second contact inside the cooldown ignored');
  ctx.world.time += CONFIG.enemy.hitCooldown;
  hit();
  assert.equal(A.hp, 4);
});

test('a slow combo still counts: a gently knocked enemy nudging another', () => {
  const ctx = setup([
    { x: 5, z: 4.5, level: 1 },
    { x: 6.1, z: 4.5, level: 1 },
  ]);
  ctx.hero.vx = 3.2; // slow shot: the knocked enemy reaches the other at well under 1.5 tiles/s
  const out = runShot(ctx);
  assert.equal(out.filter((o) => o.type === 'combo').length, 2, 'both enemies take the combo hit');
});

test('combo chain: the second enemy damaged in a shot is marked as a combo', () => {
  const ctx = setup([
    { x: 5, z: 4.5, level: 3 },
    { x: 8, z: 4.5, level: 3 },
  ]);
  ctx.hero.vx = 8;
  const out = runShot(ctx);
  const [A, B] = ctx.list;
  const firstHit = (e) => out.find((o) => (o.type === 'hit' || o.type === 'combo') && o.target === e && o.chain);
  assert.equal(firstHit(A).chain, 1, 'the first enemy damaged');
  assert.equal(firstHit(B).chain, 2, 'the second enemy damaged is the combo');
  assert.ok(out.filter((o) => o.target === A && o.chain).length === 1, 'an enemy is only counted once per shot');
});

test('combo kill: kills are counted per shot and reset on the next shot', () => {
  const ctx = setup([
    { x: 5, z: 4.5, level: 1 },
    { x: 8, z: 4.5, level: 1 },
  ]);
  ctx.list[1].hp = 1; // B already hurt, so the combo finishes it too
  ctx.hero.vx = 8;
  const out = runShot(ctx);
  const kills = out.filter((o) => o.type === 'kill');
  assert.deepEqual(kills.map((k) => k.shotKills), [1, 2]);
  assert.equal(ctx.combat.shotKills, 2);
  ctx.combat.beginShot();
  assert.equal(ctx.combat.shotKills, 0);
});
