// Kill prediction for the kill cam (design doc: "Kill cam"). The physics is
// deterministic, so a copy of the world run a short way ahead with the same
// rules (physics, combat, barrel and Rubber kicks) says whether your shot is
// about to kill an enemy, and when. Things it leaves out (barrels breaking,
// red barrels going off, ice and goop) can make it wrong now and then; it's
// run again every few frames, so a miss just means no kill cam that time.

import { CONFIG } from './config.js';
import { stepWorld, applyBumperKicks, applyRubberRebound } from './physics.js';
import { createCombat } from './combat.js';

/**
 * Run `world` forward up to `seconds` of game time on a copy. Returns the
 * first predicted kill, { target (the real enemy), x, z, t (seconds from
 * now), index (kills predicted before it in this look) }, or null.
 * `kicked` is the live per-move bumper kick record (copied, not changed).
 */
export function predictKill(world, hero, seconds, kicked = new Map(), elastic = null) {
  const real = new Map(); // copy -> original
  const copy = new Map(); // original -> copy
  const balls = world.balls.map((b) => {
    const c = { ...b, crawl: b.crawl && { ...b.crawl }, fallTo: b.fallTo && { ...b.fallTo } };
    real.set(c, b);
    copy.set(b, c);
    return c;
  });
  const w = { ...world, balls, events: [] };
  const h = copy.get(hero);
  const kicks = new Map();
  for (const [b, m] of kicked) if (copy.has(b)) kicks.set(copy.get(b), new Map(m));
  const combat = createCombat();
  combat.beginShot();
  const R = CONFIG.enemy.types.rubber;
  const step = CONFIG.physics.step;
  let kills = 0;
  for (let t = 0; t < seconds; t += step) {
    stepWorld(w, step);
    const outcomes = combat.resolve(w, h);
    applyRubberRebound(w, h, R.rebound, R.maxRebound);
    applyBumperKicks(w, kicks, CONFIG.aim.maxLaunchSpeed, elastic && { ...elastic, ball: h });
    w.events.length = 0;
    for (const o of outcomes) {
      if (o.type !== 'kill') continue;
      const target = real.get(o.target);
      if (target) return { target, x: o.target.x, z: o.target.z, t, index: kills };
      kills++; // a golem piece born in the prediction: counts toward a combo, no cam
    }
    if (w.balls.every((b) => b.vx === 0 && b.vz === 0)) break;
  }
  return null;
}
