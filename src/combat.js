// Combat rules (design doc: "Combat rules and formulas"). Pure logic over
// physics events, so it can be unit tested without rendering. Who takes damage
// depends on whose phase it is.
//
// Your shot:
// - Hero hits enemy: the enemy loses ATK HP on each fresh contact.
// - A knocked enemy hits another enemy: both lose 1 HP, once per pair per shot.
// Enemy phase:
// - Only the enemies moving this round (they all move at once) can hurt the
//   hero: 1 HP per hit, whatever its level, at most once each per round. A
//   held shield cancels one hit instead and is used up. No other contact deals damage.
// Red barrels (any phase): the ball that set one off takes 1 flat damage,
// ignoring ATK. A held shield absorbs it instead and is used up.
// Walls never deal damage.
// A hit only counts at an impact speed of at least `hitMinSpeed`, and each
// enemy has a short cooldown so a ball resting against it can't grind it down.
// Speed never changes the damage, only whether a contact counts.

import { CONFIG } from './config.js';
import { createBall, bounceOffFixed } from './physics.js';
import { heroDamage } from './turns.js';

const E = CONFIG.enemy;

export function enemyMaxHp(level) {
  return E.hpPerLevel * level;
}

export function createEnemy({ x, z, level, id, type = null }) {
  const ball = createBall({ x, z, kind: 'enemy', id });
  ball.level = level;
  // An enemy type (CONFIG.enemy.types) changes one thing about it.
  ball.type = type;
  const T = type ? CONFIG.enemy.types[type] : null;
  if (T?.friction != null) ball.friction = T.friction;
  ball.maxHp = enemyMaxHp(level);
  ball.hp = ball.maxHp;
  ball.lastHit = -Infinity;
  return ball;
}

export function createCombat() {
  let pairsThisShot = new Set();
  // Per shot, for combo feedback: enemies damaged so far (in order) and kills.
  let damagedThisShot = new Set();
  let killsThisShot = 0;
  let actors = null; // the enemies moving this enemy phase; null during your shot
  const haveHit = new Set(); // actors that already hurt the hero this phase

  function canTakeHit(enemy, time) {
    return enemy.hp > 0 && time - enemy.lastHit >= E.hitCooldown;
  }

  function damage(enemy, amount, time, out, ev, kind) {
    enemy.hp = Math.max(0, enemy.hp - amount);
    // The cooldown guards against the hero grinding; combos have their own
    // once-per-pair rule and don't start it.
    if (kind === 'hit') enemy.lastHit = time;
    // `chain` is this enemy's place among the distinct enemies damaged this
    // shot (1 for the first), or 0 if it was already damaged earlier.
    let chain = 0;
    if (!damagedThisShot.has(enemy)) {
      damagedThisShot.add(enemy);
      chain = damagedThisShot.size;
    }
    out.push({ type: kind, target: enemy, amount, event: ev, chain });
    if (enemy.hp === 0) out.push({ type: 'kill', target: enemy, shotKills: ++killsThisShot });
  }

  return {
    /** Enemies killed by the current (or last) shot. */
    get shotKills() {
      return killsThisShot;
    },
    /** True if `enemy` already hit the hero (or its shield) in the current enemy phase. */
    hasHitHero(enemy) {
      return !!actors && haveHit.has(enemy);
    },
    /** Call at each launch: the once-per-pair combo rule resets per shot. */
    beginShot() {
      pairsThisShot = new Set();
      damagedThisShot = new Set();
      killsThisShot = 0;
      actors = null;
    },
    /**
     * A red barrel went off on `victim`: 1 flat damage, ignoring ATK. If the
     * hero holds a shield, it takes the blast instead and is used up.
     * Returns outcomes like resolve(); a killed enemy leaves the board.
     */
    explosion(world, victim, hero) {
      const out = [];
      const amount = CONFIG.objects.explosiveDamage;
      if (victim === hero) {
        if (hero.shield) {
          hero.shield = false;
          out.push({ type: 'blocked', target: hero, source: 'explosion' });
        } else if (hero.hp > 0) {
          hero.hp = Math.max(0, hero.hp - amount);
          out.push({ type: 'hurt', target: hero, amount, source: 'explosion' });
        }
      } else if (victim.kind === 'enemy' && victim.hp > 0) {
        damage(victim, amount, world.time, out, null, 'blast');
        if (victim.hp === 0) world.balls = world.balls.filter((b) => b !== victim);
      }
      return out;
    },
    /**
     * Call as the enemy phase starts, with the enemies that move this round
     * (one, or a list: they all move at once). Each can hurt the hero at most
     * once.
     */
    beginEnemyTurn(enemies) {
      actors = new Set([].concat(enemies));
      haveHit.clear();
    },
    /**
     * Apply one physics step's events. `hero` carries `atk` and `hp`.
     * Dead enemies are removed from world.balls. Returns outcomes:
     * { type: 'hit' | 'combo', target, amount, event }, { type: 'kill', target }
     * and, in the enemy phase, { type: 'hurt', target: hero, amount, source, event }.
     */
    resolve(world, hero) {
      const out = [];
      const time = world.time;
      if (actors) {
        for (const ev of world.events) {
          if (ev.type !== 'ball' || ev.speed < E.hitMinSpeed) continue;
          const actor = ev.a === hero ? ev.b : ev.b === hero ? ev.a : null;
          if (!actors.has(actor) || haveHit.has(actor) || hero.hp <= 0) continue;
          haveHit.add(actor);
          if (hero.shield) {
            hero.shield = false;
            out.push({ type: 'blocked', target: hero, source: actor, event: ev });
            continue;
          }
          const amount = heroDamage();
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
          if (canTakeHit(enemy, time)) {
            damage(enemy, hero.atk, time, out, ev, 'hit');
            // A killing blow ricochets off the enemy as if it were solid.
            if (enemy.hp === 0 && ev.before) bounceOffFixed(ev, hero);
          }
          continue;
        }

        if (a.kind === 'enemy' && b.kind === 'enemy') {
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          if (pairsThisShot.has(key)) continue;
          pairsThisShot.add(key);
          damage(a, 1, time, out, ev, 'combo');
          damage(b, 1, time, out, ev, 'combo');
          if (ev.before && a.hp === 0 && b.hp > 0) bounceOffFixed(ev, b);
          if (ev.before && b.hp === 0 && a.hp > 0) bounceOffFixed(ev, a);
        }
      }
      if (out.some((o) => o.type === 'kill')) {
        world.balls = world.balls.filter((ball) => ball.kind !== 'enemy' || ball.hp > 0);
      }
      return out;
    },
  };
}
