import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, offerCards, takeCard, has } from '../src/cards.js';
import { rollLoot } from '../src/loot.js';
import { createWorld, createBall, createStaticCircle, stepWorld, applyBumperKick, speedOf } from '../src/physics.js';
import { parseLevel } from '../src/level.js';
import { CONFIG } from '../src/config.js';

test('the artifacts in the pool (Locksmith and Doppleganger shelved, Value Vacuum and Sack of Plenty removed)', () => {
  assert.deepEqual(
    CARDS.map((c) => c.name),
    [
      'Leech in a Jar', "Warrior's Nose", "Cooper's Hammer", 'Skates of Rollering',
      'Bouncy Britches', 'Chicken Heart', 'Bomb Squad T-Shirt', "Doctor's Orders", "Assassin's Cloak", "Assassin's Boots",
      'Tap Shoes', "Warrior's Sword", "Warrior's Shield", "Doctor's Bottle", "Doctor's Bag", 'Bug Zapper',
      "Rogue's Dagger", 'Poisoned Pen', "Shaman's Mask", 'Stone Shoes',
    ],
  );
});

test("Doctor's Orders: potions heal twice as much", async () => {
  const { collect } = await import('../src/loot.js');
  const hero = { hp: 1, maxHp: 20, potionScale: CONFIG.cards.doctorsOrdersHeal };
  collect({ kind: 'potion' }, hero, { gold: 0 });
  assert.equal(hero.hp, 1 + CONFIG.loot.potionHeal * CONFIG.cards.doctorsOrdersHeal);
});

test("Assassin's Cloak: enemies see a shorter distance", async () => {
  const { canSee } = await import('../src/sight.js');
  const level = parseLevel(['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#S......#', '#########'].join('\n'));
  const enemy = createBall({ x: 4.5, z: 3, kind: 'enemy', id: 'e' });
  const hero = createBall({ x: 4.5, z: 3 + 5, kind: 'hero', id: 'h' });
  assert.ok(canSee(level, enemy, hero, [enemy, hero]), 'seen at 5 tiles');
  hero.sightScale = CONFIG.cards.ninjaSight;
  assert.ok(!canSee(level, enemy, hero, [enemy, hero]), 'unseen at 5 tiles with the cloak');
});

test('Bomb Squad T-Shirt: a red barrel does you no harm and leaves your shield', async () => {
  const { createCombat } = await import('../src/combat.js');
  const combat = createCombat();
  const hero = { kind: 'hero', hp: 5, maxHp: 5, shield: true, blastproof: true };
  const out = combat.explosion(createWorld(parseLevel('#####\n#S..#\n#####')), hero, hero);
  assert.equal(hero.hp, 5);
  assert.ok(hero.shield);
  assert.equal(out[0].type, 'immune');
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

test("Doctor's Bag doubles the potion weights in barrels and the potion chance in kill drops", async () => {
  const { rollEnemyDrops } = await import('../src/loot.js');
  const share = (opts, roll) => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (roll(rng, opts)) n++;
    return n / 20000;
  };
  const barrel = (rng, o) => ['potion', 'superPotion'].includes(rollLoot(rng, o).kind);
  const table = CONFIG.loot.table;
  const total = table.reduce((s, e) => s + e.weight, 0);
  const potW = table.filter((e) => e.kind === 'potion' || e.kind === 'superPotion').reduce((s, e) => s + e.weight, 0);
  assert.ok(Math.abs(share({ potionWeight: 2 }, barrel) - (2 * potW) / (total + potW)) < 0.01);
  const drop = (rng, o) => rollEnemyDrops(rng, o).some((k) => k.includes('otion'));
  assert.ok(Math.abs(share({ potionScale: 2 }, drop) - 2 * CONFIG.loot.enemyDrops.potion) < 0.01);
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
