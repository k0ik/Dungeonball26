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
 * first predicted kill, { kind: 'kill', target (the real enemy), x, z, t
 * (seconds from now), index (kills predicted before it in this look) };
 * failing that, with `near` ({ gap, speed }), the closest near miss: your
 * ball shaving past an enemy within `gap` tiles, at `speed` tiles/s or more,
 * without touching it in the look ({ kind: 'near', target, x, z, t, gap });
 * or null.
 * `kicked` is the live per-move bumper kick record (copied, not changed);
 * `shot` is the live combat's shotState().
 */
export function predictKill(world, hero, seconds, kicked = new Map(), elastic = null, shot = null, near = null) {
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
  // Carry on from this shot so far: two enemies that already collided this
  // shot don't hurt each other again (a fresh record predicted kills that
  // never came).
  if (shot) combat.loadShotState(shot, (b) => copy.get(b));
  const R = CONFIG.enemy.types.rubber;
  const step = CONFIG.physics.step;
  let kills = 0;
  const shaves = new Map(); // enemy copy -> closest pass { gap, t, x, z }, or 'touched'
  for (let t = 0; t < seconds; t += step) {
    stepWorld(w, step);
    const outcomes = combat.resolve(w, h);
    applyRubberRebound(w, h, R.rebound, R.maxRebound);
    applyBumperKicks(w, kicks, CONFIG.aim.maxLaunchSpeed, elastic && { ...elastic, ball: h });
    if (near) {
      for (const ev of w.events) {
        if (ev.type === 'ball' && (ev.a === h || ev.b === h)) shaves.set(ev.a === h ? ev.b : ev.a, 'touched');
      }
      const v = Math.hypot(h.vx, h.vz);
      if (v >= near.speed) {
        for (const e of w.balls) {
          if (e.kind !== 'enemy' || e.hp <= 0 || e.phased || e.type === 'bomb' || e.type === 'gold' || shaves.get(e) === 'touched') continue;
          const gap = Math.hypot(e.x - h.x, e.z - h.z) - e.radius - h.radius;
          const best = shaves.get(e);
          if (gap > 0 && gap <= near.gap && (!best || gap < best.gap)) shaves.set(e, { gap, t, x: e.x, z: e.z });
        }
      }
    }
    w.events.length = 0;
    for (const o of outcomes) {
      if (o.type !== 'kill') continue;
      const target = real.get(o.target);
      if (target) return { kind: 'kill', target, x: o.target.x, z: o.target.z, t, index: kills };
      kills++; // a golem piece born in the prediction: counts toward a combo, no cam
    }
    if (w.balls.every((b) => b.vx === 0 && b.vz === 0)) break;
  }
  let best = null;
  for (const [e, s] of shaves) {
    if (s === 'touched' || !real.has(e)) continue;
    if (!best || s.gap < best.gap) best = { kind: 'near', target: real.get(e), x: s.x, z: s.z, t: s.t, gap: s.gap };
  }
  return best;
}
