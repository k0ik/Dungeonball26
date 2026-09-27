// Combat rules (design doc: "Combat rules and formulas"). Pure logic over
// physics events, so it can be unit tested without rendering. Who takes damage
// depends on whose phase it is.
//
// Your shot:
// - Hero hits enemy: the enemy loses ATK HP on each fresh contact.
// - A knocked enemy hits another enemy: both lose 1 HP, once per pair per shot.
// Enemy phase:
// - Only the enemy whose turn it is can hurt the hero: max(1, L − DEF), at
//   most once per turn. No other contact deals damage.
// Walls never deal damage.
// A hit only counts at an impact speed of at least `hitMinSpeed`, and each
// enemy has a short cooldown so a ball resting against it can't grind it down.
// Speed never changes the damage, only whether a contact counts.

import { CONFIG } from './config.js';
import { createBall } from './physics.js';
import { heroDamage } from './turns.js';

const E = CONFIG.enemy;

export function enemyMaxHp(level) {
  return E.hpPerLevel * level;
}

export function createEnemy({ x, z, level, id }) {
  const ball = createBall({ x, z, kind: 'enemy', id });
  ball.level = level;
  ball.maxHp = enemyMaxHp(level);
  ball.hp = ball.maxHp;
  ball.lastHit = -Infinity;
  return ball;
}

export function createCombat() {
  let pairsThisShot = new Set();
  let actor = null; // the enemy whose turn it is; null during your shot
  let actorHasHit = false;

  function canTakeHit(enemy, time) {
    return enemy.hp > 0 && time - enemy.lastHit >= E.hitCooldown;
  }

  function damage(enemy, amount, time, out, ev, kind) {
    enemy.hp = Math.max(0, enemy.hp - amount);
    // The cooldown guards against the hero grinding; combos have their own
    // once-per-pair rule and don't start it.
    if (kind === 'hit') enemy.lastHit = time;
    out.push({ type: kind, target: enemy, amount, event: ev });
    if (enemy.hp === 0) out.push({ type: 'kill', target: enemy });
  }

  return {
    /** Call at each launch: the once-per-pair combo rule resets per shot. */
    beginShot() {
      pairsThisShot = new Set();
      actor = null;
    },
    /** Call as each enemy starts its turn (lunge or patrol). */
    beginEnemyTurn(enemy) {
      actor = enemy;
      actorHasHit = false;
    },
    /**
     * Apply one physics step's events. `hero` carries `atk`, `def` and `hp`.
     * Dead enemies are removed from world.balls. Returns outcomes:
     * { type: 'hit' | 'combo', target, amount, event }, { type: 'kill', target }
     * and, in the enemy phase, { type: 'hurt', target: hero, amount, source, event }.
     */
    resolve(world, hero) {
      const out = [];
      const time = world.time;
      if (actor) {
        for (const ev of world.events) {
          if (actorHasHit || ev.type !== 'ball' || ev.speed < E.hitMinSpeed) continue;
          const pair = (ev.a === hero && ev.b === actor) || (ev.b === hero && ev.a === actor);
          if (!pair || hero.hp <= 0) continue;
          actorHasHit = true;
          const amount = heroDamage(actor.level, hero.def);
          hero.hp = Math.max(0, hero.hp - amount);
          out.push({ type: 'hurt', target: hero, amount, source: actor, event: ev });
        }
        return out;
      }
      for (const ev of world.events) {
        if (ev.type !== 'ball' || ev.speed < E.hitMinSpeed) continue;
        const { a, b } = ev;
        if (a.hp <= 0 || b.hp <= 0) continue;

        const enemy = a === hero ? b : b === hero ? a : null;
        if (enemy?.kind === 'enemy') {
          if (canTakeHit(enemy, time)) damage(enemy, hero.atk, time, out, ev, 'hit');
          continue;
        }

        if (a.kind === 'enemy' && b.kind === 'enemy') {
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          if (pairsThisShot.has(key)) continue;
          pairsThisShot.add(key);
          damage(a, 1, time, out, ev, 'combo');
          damage(b, 1, time, out, ev, 'combo');
        }
      }
      if (out.some((o) => o.type === 'kill')) {
        world.balls = world.balls.filter((ball) => ball.kind !== 'enemy' || ball.hp > 0);
      }
      return out;
    },
  };
}
