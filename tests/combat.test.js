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

test('enemies moving together can each hurt the hero once; a bystander cannot', () => {
  const hero = Object.assign(createBall({ x: 5, z: 5, kind: 'hero', id: 'hero' }), { hp: 10, maxHp: 10, atk: 1, shield: false });
  const a = createEnemy({ x: 4, z: 5, level: 1, id: 'a' });
  const b = createEnemy({ x: 6, z: 5, level: 3, id: 'b' });
  const idle = createEnemy({ x: 5, z: 4, level: 2, id: 'idle' });
  const world = { balls: [hero, a, b, idle], events: [], time: 0 };
  const combat = createCombat();
  combat.beginEnemyTurn([a, b]);
  const hit = (x) => world.events.push({ type: 'ball', a: x, b: hero, speed: 5 });
  hit(a);
  hit(b);
  hit(a); // a already hit this round
  hit(idle); // not moving this round
  const out = combat.resolve(world, hero);
  assert.deepEqual(out.map((o) => `${o.type}:${o.source.id}`), ['hurt:a', 'hurt:b']);
  assert.equal(hero.hp, 8);
  // Both are spent until the phase ends (the game drops their "!" meanwhile).
  assert.ok(combat.hasHitHero(a) && combat.hasHitHero(b) && !combat.hasHitHero(idle));
  combat.beginShot();
  assert.ok(!combat.hasHitHero(a), 'your next shot: nobody is spent');
});

test('a killing blow ricochets off the enemy instead of stopping dead', () => {
  const ctx = setup([{ x: 6, z: 4.5, level: 1 }]);
  const { world, hero, combat } = ctx;
  const enemy = world.balls.find((b) => b.kind === 'enemy');
  enemy.hp = 1; // one hit kills it
  hero.x = 4;
  hero.z = 4.5;
  hero.vx = 5;
  hero.vz = 0;
  combat.beginShot();
  let killed = false;
  for (let i = 0; i < 240 && !killed; i++) {
    stepWorld(world);
    killed = combat.resolve(world, hero).some((o) => o.type === 'kill');
    world.events.length = 0;
  }
  assert.ok(killed, 'the enemy died');
  assert.ok(hero.vx < -3, `the hero bounced back (vx ${hero.vx.toFixed(2)})`);
});

test('Golem: 1 of 4 HP splits into 2 of 2 HP when first hit; each of those into 2 of 1 HP when destroyed', () => {
  const ctx = setup([]);
  const { world, hero, combat } = ctx;
  const G = CONFIG.enemy.types.golem;
  const golem = createEnemy({ x: 6, z: 4.5, level: 1, id: 'g', type: 'golem' });
  assert.equal(golem.hp, 4);
  assert.equal(golem.radius, G.stageRadius[0]);
  world.balls.push(golem);
  const hit = (target) => {
    world.time += 1; // past every hit cooldown
    target.vx = 3; // moving off along the blow, as after a real impact
    target.vz = 0;
    world.events.push({ type: 'ball', a: hero, b: target, speed: 5, nx: 1, nz: 0 });
    const out = combat.resolve(world, hero);
    world.events.length = 0;
    return out;
  };
  const golems = () => world.balls.filter((b) => b.type === 'golem');
  let out = hit(golem);
  assert.ok(out.some((o) => o.type === 'split' && o.target === golem));
  assert.ok(!world.balls.includes(golem), 'the whole golem is gone');
  assert.deepEqual(golems().map((g) => [g.stage, g.hp]), [[1, 2], [1, 2]]);
  // The pieces roll off along the hit, veering apart, at its speed.
  const [p, q] = golems();
  assert.ok(p.vx > 0 && q.vx > 0 && Math.sign(p.vz) === -Math.sign(q.vz));
  assert.ok(Math.abs(Math.hypot(p.vx, p.vz) - 3) < 1e-9);
  // A 2-HP golem takes damage first, then splits when it would die.
  out = hit(p);
  assert.equal(p.hp, 1);
  assert.equal(golems().length, 2);
  out = hit(p);
  assert.ok(out.some((o) => o.type === 'split' && o.target === p));
  assert.deepEqual(golems().map((g) => g.hp).sort(), [1, 1, 2]);
  // A 1-HP golem just dies, and no kill was counted for the splits.
  const small = golems().find((g) => g.hp === 1);
  out = hit(small);
  assert.ok(out.some((o) => o.type === 'kill' && o.target === small));
  assert.deepEqual(golems().map((g) => g.hp).sort(), [1, 2]);
});

test('Bomb: a hit lights it without hurting it; its blast hurts and pushes what it reaches, walls shield, other bombs light', () => {
  const level = parseLevel(`
1##########
#.........#
#.....#...#
#S........#
###########`);
  const world = createWorld(level);
  const B = CONFIG.enemy.types.bomb;
  const hero = Object.assign(createBall({ x: 3.6, z: 3.5, kind: 'hero', id: 'hero' }), { atk: 1, hp: 10, maxHp: 10, shield: false });
  const bomb = createEnemy({ x: 4.5, z: 2.5, level: 1, id: 'bomb', type: 'bomb' });
  const near = createEnemy({ x: 4.5, z: 1.5, level: 1, id: 'near' }); // 1 tile away, open floor
  const behind = createEnemy({ x: 7.5, z: 2.5, level: 1, id: 'behind' }); // 3 tiles: out of reach anyway
  const other = createEnemy({ x: 5.5, z: 3.5, level: 1, id: 'other', type: 'bomb' });
  world.balls.push(hero, bomb, near, behind, other);
  const combat = createCombat();
  combat.beginShot();
  // Hit it: lit, not hurt.
  world.time = 1;
  world.events.push({ type: 'ball', a: hero, b: bomb, speed: 5, nx: 1, nz: 0 });
  let out = combat.resolve(world, hero);
  world.events.length = 0;
  assert.equal(bomb.hp, bomb.maxHp);
  assert.equal(bomb.fuse, B.fuse);
  assert.ok(out.some((o) => o.type === 'lit' && o.target === bomb));
  // Blow it up.
  out = combat.bombBlast(world, bomb, hero);
  assert.ok(!world.balls.includes(bomb));
  assert.ok(out.some((o) => o.type === 'boom' && o.target === bomb));
  assert.ok(!out.some((o) => o.type === 'kill' && o.target === bomb), 'a bomb going off is not a kill');
  assert.equal(near.hp, near.maxHp - B.blastDamage, 'caught in the open');
  assert.ok(near.vz < 0, 'pushed away from the blast');
  assert.equal(behind.hp, behind.maxHp, 'out of reach');
  assert.equal(hero.hp, 10 - B.blastDamage, 'the hero is caught too');
  assert.equal(other.fuse, B.fuse, 'another bomb in reach is lit, not set off');
  // A wall in between shields: diagonally across the corner of the wall tile at (6,2), well within reach.
  const w2 = createWorld(level);
  const b2 = createEnemy({ x: 5.6, z: 2.6, level: 1, id: 'b2', type: 'bomb' });
  const hid = createEnemy({ x: 6.4, z: 1.6, level: 1, id: 'hid' });
  assert.ok(Math.hypot(hid.x - b2.x, hid.z - b2.z) < B.blastRadius);
  w2.balls.push(hero, b2, hid);
  combat.bombBlast(w2, b2, hero);
  assert.equal(hid.hp, hid.maxHp, 'the wall took it');
});

test('Bomb: a bomb knocked into another lights both, even during the enemy move', () => {
  const ctx = setup([]);
  const { world, hero, combat } = ctx;
  const a = createEnemy({ x: 6, z: 4.5, level: 1, id: 'a', type: 'bomb' });
  const b = createEnemy({ x: 6.7, z: 4.5, level: 1, id: 'b', type: 'bomb' });
  world.balls.push(a, b);
  combat.beginEnemyTurn([]); // the enemy move: not your shot
  world.events.push({ type: 'ball', a, b, speed: 2, nx: 1, nz: 0 });
  const out = combat.resolve(world, hero);
  assert.equal(a.fuse, CONFIG.enemy.types.bomb.fuse);
  assert.equal(b.fuse, CONFIG.enemy.types.bomb.fuse);
  assert.equal(out.filter((o) => o.type === 'lit').length, 2);
});

test('Jekyll: a hit enrages it; on the enemy move its hit costs another enemy 1 HP, once', () => {
  const ctx = setup([]);
  const { world, hero, combat } = ctx;
  const j = createEnemy({ x: 6, z: 4.5, level: 2, id: 'j', type: 'jekyll' });
  const other = createEnemy({ x: 7, z: 4.5, level: 2, id: 'o' });
  world.balls.push(j, other);
  assert.ok(!j.enraged);
  world.time = 1;
  world.events.push({ type: 'ball', a: hero, b: j, speed: 5, nx: 1, nz: 0 });
  combat.resolve(world, hero);
  world.events.length = 0;
  assert.ok(j.enraged, 'provoked');
  assert.equal(j.hp, j.maxHp - 1);
  // Its attack, in the enemy move.
  combat.beginEnemyTurn([j]);
  world.events.push({ type: 'ball', a: j, b: other, speed: 6, nx: 1, nz: 0 });
  combat.resolve(world, hero);
  world.events.length = 0;
  assert.equal(other.hp, other.maxHp - 1);
  world.events.push({ type: 'ball', a: j, b: other, speed: 6, nx: 1, nz: 0 });
  combat.resolve(world, hero);
  assert.equal(other.hp, other.maxHp - 1, 'one attack per move');
});
