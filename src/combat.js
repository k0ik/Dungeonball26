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
import { createBall, bounceOffFixed, lineClear } from './physics.js';
import { heroDamage } from './turns.js';

const E = CONFIG.enemy;

export function enemyMaxHp(level) {
  return E.hpPerLevel * level;
}

export function createEnemy({ x, z, level, id, type = null, stage = 0 }) {
  // An enemy type (CONFIG.enemy.types) changes one thing about it.
  const T = type ? CONFIG.enemy.types[type] : null;
  // Golems: a whole one unless a later `stage` is given (the pieces it splits into).
  const radius = type === 'golem' ? T.stageRadius[stage] : T?.radius;
  const ball = createBall({ x, z, kind: 'enemy', id, radius });
  if (type === 'golem') ball.stage = stage;
  ball.level = level;
  ball.type = type;
  if (T?.friction != null) ball.friction = T.friction;
  if (T?.mass != null) ball.mass = T.mass;
  ball.maxHp = type === 'golem' ? T.stageHp[stage] : Math.min(E.maxHp, enemyMaxHp(level) * (T?.hpScale ?? 1));
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

  let world = null; // the world being resolved (golems add their pieces to it)

  /**
   * Golem split: `enemy` leaves the board and two golems of the next stage take
   * its place, side by side across its path, each veering off along it at
   * its speed (as if they'd just been struck). The split itself doesn't hurt them.
   */
  function split(enemy, time, out, ev) {
    const G = E.types.golem;
    const stage = enemy.stage + 1;
    let speed = Math.hypot(enemy.vx, enemy.vz);
    // Direction: its new motion, else away from whatever hit it.
    let dx = enemy.vx;
    let dz = enemy.vz;
    if (speed < 1e-6) {
      const sign = ev && ev.b === enemy ? 1 : -1;
      dx = ev ? ev.nx * sign : 1;
      dz = ev ? ev.nz * sign : 0;
      speed = 0;
    }
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const r = G.stageRadius[stage];
    const pieces = [-1, 1].map((side, i) => {
      const piece = createEnemy({
        x: enemy.x - dz * side * (r + 0.01),
        z: enemy.z + dx * side * (r + 0.01),
        level: enemy.level,
        id: `${enemy.id}${'ab'[i]}`,
        type: 'golem',
        stage,
      });
      const a = side * G.spread;
      piece.vx = (dx * Math.cos(a) - dz * Math.sin(a)) * speed;
      piece.vz = (dx * Math.sin(a) + dz * Math.cos(a)) * speed;
      piece.lastHit = time; // the blow that split it doesn't land again on the pieces
      return piece;
    });
    enemy.hp = 0;
    world.balls = world.balls.filter((b) => b !== enemy).concat(pieces);
    out.push({ type: 'split', target: enemy, pieces });
  }

  function damage(enemy, amount, time, out, ev, kind) {
    // A bomb isn't hurt: the first hit (or blast) lights its fuse.
    if (enemy.type === 'bomb') {
      if (kind === 'hit') enemy.lastHit = time;
      out.push({ type: kind, target: enemy, amount: 0, event: ev, chain: 0 });
      if (enemy.fuse == null) {
        enemy.fuse = E.types.bomb.fuse;
        out.push({ type: 'lit', target: enemy });
      }
      return;
    }
    // A whole golem splits as soon as it's hit; a smaller one when it would die.
    if (enemy.type === 'golem' && enemy.stage < E.types.golem.stageHp.length - 1 && (enemy.stage === 0 || enemy.hp - amount <= 0)) {
      if (kind === 'hit') enemy.lastHit = time;
      if (!damagedThisShot.has(enemy)) damagedThisShot.add(enemy);
      out.push({ type: kind, target: enemy, amount: 0, event: ev, chain: 0 });
      split(enemy, time, out, ev);
      return;
    }
    enemy.hp = Math.max(0, enemy.hp - amount);
    if (enemy.type === 'jekyll' && enemy.hp > 0) enemy.enraged = true; // provoked: it attacks on the next enemy move
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
    /** True if `enemy` already landed its attack this enemy phase (on the hero, its shield, or, for a Jekyll, another enemy). */
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
    explosion(w, victim, hero) {
      world = w;
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
     * A lit bomb's fuse ran out: it explodes where it lies. Every ball within
     * the blast radius with no wall in between takes the blast damage (a
     * held shield takes it for the hero) and is pushed away; bombs caught in
     * it are lit. The bomb is gone (not a kill). Returns outcomes like resolve().
     */
    bombBlast(w, bomb, hero) {
      world = w;
      const out = [];
      const B = E.types.bomb;
      bomb.hp = 0;
      world.balls = world.balls.filter((b) => b !== bomb);
      // A bomb is a tool, not a creature: going off isn't a kill and drops nothing.
      out.push({ type: 'boom', target: bomb });
      for (const ball of [...world.balls]) {
        const dx = ball.x - bomb.x;
        const dz = ball.z - bomb.z;
        const d = Math.hypot(dx, dz);
        if (d > B.blastRadius || !lineClear(world.level, bomb, ball)) continue;
        const push = B.blastPush * (1 - d / B.blastRadius);
        if (d > 1e-6) {
          ball.vx += (dx / d) * push;
          ball.vz += (dz / d) * push;
        }
        if (ball === hero) {
          if (hero.shield) {
            hero.shield = false;
            out.push({ type: 'blocked', target: hero, source: 'explosion' });
          } else if (hero.hp > 0) {
            hero.hp = Math.max(0, hero.hp - B.blastDamage);
            out.push({ type: 'hurt', target: hero, amount: B.blastDamage, source: 'explosion' });
          }
        } else if (ball.kind === 'enemy' && ball.hp > 0) {
          damage(ball, B.blastDamage, world.time, out, null, 'blast');
        }
      }
      world.balls = world.balls.filter((ball) => ball.kind !== 'enemy' || ball.hp > 0);
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
    resolve(w, hero) {
      world = w;
      const out = [];
      const time = world.time;
      // Any real knock lights a bomb, in any phase and from any ball: you,
      // an enemy, or another bomb (so one knocked into another lights both).
      for (const ev of world.events) {
        if (ev.type !== 'ball' || ev.speed < E.hitMinSpeed) continue;
        for (const ball of [ev.a, ev.b]) {
          if (ball.type === 'bomb' && ball.fuse == null && ball.hp > 0) {
            ball.fuse = E.types.bomb.fuse;
            out.push({ type: 'lit', target: ball });
          }
        }
      }
      if (actors) {
        for (const ev of world.events) {
          if (ev.type !== 'ball' || ev.speed < E.hitMinSpeed) continue;
          // An enraged Jekyll can attack another enemy: its hit costs it 1 HP.
          const jekyll = [ev.a, ev.b].find((b) => b.type === 'jekyll' && actors.has(b) && !haveHit.has(b));
          const prey = jekyll && (jekyll === ev.a ? ev.b : ev.a);
          if (prey?.kind === 'enemy' && prey.hp > 0) {
            haveHit.add(jekyll);
            damage(prey, E.damageToHero, time, out, ev, 'combo');
            continue;
          }
          const actor = ev.a === hero ? ev.b : ev.b === hero ? ev.a : null;
          if (!actors.has(actor) || haveHit.has(actor) || hero.hp <= 0) continue;
          haveHit.add(actor);
          if (hero.shield) {
            hero.shield = false;
            out.push({ type: 'blocked', target: hero, source: actor, event: ev });
            continue;
          }
          const amount = heroDamage(actor);
          hero.hp = Math.max(0, hero.hp - amount);
          out.push({ type: 'hurt', target: hero, amount, source: actor, event: ev });
        }
        if (out.some((o) => o.type === 'kill')) world.balls = world.balls.filter((ball) => ball.kind !== 'enemy' || ball.hp > 0);
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
