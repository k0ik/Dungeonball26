// Barrels, chests and red barrels (design doc: "Objects"). They're static
// bumpers in the physics world; this module turns contacts with them into
// game outcomes. Pure logic over physics events, unit tested.
//
// - Barrel: each contact at >= hitMinSpeed, from the hero or an enemy (say
//   one you knocked into it), cracks it one stage (with a short cooldown);
//   the second breaks it and its loot lands on the floor.
// - Chest: the hero's first contact opens it for 8-24 gold. It stays a bumper.
// - Red barrel: any contact, from the hero or an enemy, at any speed,
//   detonates it; the ball that touched it takes 1 flat damage.
// Contacts count in any phase (your shot or the enemy phase).

import { CONFIG } from './config.js';
import { createStaticCircle, createStaticBox, lineClear } from './physics.js';
import { tileCenter } from './level.js';
import { randomInt } from './loot.js';

const O = CONFIG.objects;

/** Build the level's bumpers. */
export function createObjects(level) {
  const statics = [];
  level.barrels.forEach((t, i) => {
    statics.push(Object.assign(createStaticCircle({ ...tileCenter(t), radius: O.barrelRadius, kind: 'barrel', id: `barrel${i}` }), { hits: 0, lastHit: -Infinity }));
  });
  level.explosives.forEach((t, i) => {
    statics.push(createStaticCircle({ ...tileCenter(t), radius: O.barrelRadius, kind: 'explosive', id: `explosive${i}` }));
  });
  level.chests.forEach((t, i) => {
    statics.push(Object.assign(createStaticBox({ ...tileCenter(t), halfX: O.chestHalfX, halfZ: O.chestHalfZ, kind: 'chest', id: `chest${i}` }), { opened: false }));
  });
  return statics;
}

/**
 * Turn this step's bumper contacts into outcomes, and remove broken barrels
 * and detonated red barrels from the world. Outcomes:
 *   { type: 'crack', obj, stage }   a barrel cracked (stage 1)
 *   { type: 'break', obj }          a barrel broke (roll its loot)
 *   { type: 'open', obj, gold }     a chest opened
 *   { type: 'explode', obj, victim } a red barrel went off on `victim`
 */
/**
 * A bomb's blast at (x, z) reaching `radius` (centre to the object's edge),
 * walls shielding: red barrels in reach go off (with no ball to hurt) and
 * barrels take a hit (crack, or break and drop their loot). Chests are
 * untouched. Outcomes as resolveObjects; spent objects leave the world.
 */
export function blastObjects(world, x, z, radius, { barrelHits = O.barrelHits } = {}) {
  const out = [];
  const gone = new Set();
  for (const s of world.statics) {
    if (s.kind !== 'explosive' && s.kind !== 'barrel') continue;
    if (Math.hypot(s.x - x, s.z - z) - s.radius > radius || !lineClear(world.level, { x, z }, s)) continue;
    if (s.kind === 'explosive') {
      gone.add(s);
      out.push({ type: 'explode', obj: s, victim: null });
    } else {
      s.lastHit = world.time;
      s.hits++;
      if (s.hits >= barrelHits) {
        gone.add(s);
        out.push({ type: 'break', obj: s });
      } else {
        out.push({ type: 'crack', obj: s, stage: s.hits });
      }
    }
  }
  if (gone.size) world.statics = world.statics.filter((s) => !gone.has(s));
  return out;
}

export function resolveObjects(world, hero, rng = Math.random, { barrelHits = O.barrelHits } = {}) {
  const out = [];
  const gone = new Set();
  for (const ev of world.events) {
    if (ev.type !== 'static' || gone.has(ev.obj)) continue;
    const s = ev.obj;
    if (s.kind === 'explosive') {
      gone.add(s);
      out.push({ type: 'explode', obj: s, victim: ev.ball });
    } else if (s.kind === 'barrel') {
      if (ev.speed < CONFIG.enemy.hitMinSpeed) continue;
      if (world.time - s.lastHit < O.barrelCooldown) continue;
      s.lastHit = world.time;
      s.hits++;
      if (s.hits >= barrelHits) {
        gone.add(s);
        out.push({ type: 'break', obj: s });
      } else {
        out.push({ type: 'crack', obj: s, stage: s.hits });
      }
    } else if (s.kind === 'chest') {
      if (ev.ball !== hero || s.opened) continue;
      s.opened = true;
      out.push({ type: 'open', obj: s, gold: randomInt(O.chestGoldMin, O.chestGoldMax, rng) });
    }
  }
  if (gone.size) world.statics = world.statics.filter((s) => !gone.has(s));
  return out;
}
