// Where each face looks (design doc: "Faces look where they're going").
// Every frame the game works out, per ball with a face, a look: a direction
// on the ground ({ x, z, amount }), a direction on screen for idle glances
// ({ sx, sy, amount }; sy up), or null to face front. The views slide the face
// toward it (faces.js faceLook). Highest first:
//   1. a reaction, for reactSeconds: hit by a ball -> look at the hitter (it
//      keeps looking where it's going); near a red barrel or bomb going off
//      -> look at where it went off;
//   2. moving -> along its way, easing back to centre as it slows;
//   3. your ball while aiming -> where the shot would go; during the enemy
//      move -> the nearest moving enemy; an enemy that sees you -> you;
//   4. otherwise centre, with an idle glance now and then.

import { CONFIG } from './config.js';
import { speedOf, lineClear } from './physics.js';

const L = CONFIG.look;
const rand = (a, b) => a + Math.random() * (b - a);

export function createLooks() {
  const state = new WeakMap(); // ball -> { react, reactLeft, idle, glance }
  const of = (b) => {
    if (!state.has(b)) state.set(b, { react: null, reactLeft: 0, idle: rand(L.idleMin, L.idleMax), glance: null });
    return state.get(b);
  };

  /** Look at `target` (a ball, followed as it moves, or a fixed { x, z }) for reactSeconds. */
  function react(ball, target) {
    const s = of(ball);
    s.react = target;
    s.reactLeft = L.reactSeconds;
  }

  return {
    react,
    /**
     * After a physics step, before its events are cleared: whichever ball of
     * a colliding pair was struck (the one the other was moving into harder)
     * looks at the one that hit it. `hasFace` picks the balls that look.
     */
    noteHits(events, hasFace) {
      for (const ev of events) {
        if (ev.type !== 'ball' || !ev.before) continue;
        const { a, b, nx, nz, before } = ev;
        const aInto = before.avx * nx + before.avz * nz; // a's speed toward b
        const bInto = -(before.bvx * nx + before.bvz * nz); // b's speed toward a
        const [hitter, struck] = aInto >= bInto ? [a, b] : [b, a];
        if (hasFace(struck)) react(struck, hitter);
      }
    },
    /** Something went off at (x, z): every ball with a face nearby, with no wall between, looks at it. */
    blast(level, x, z, balls, hasFace) {
      for (const b of balls) {
        if (!hasFace(b) || Math.hypot(b.x - x, b.z - z) > L.blastRadius) continue;
        if (lineClear(level, b, { x, z })) react(b, { x, z });
      }
    },
    /**
     * Set `ball.look` for this frame. `focus` is its rule-3 target: a
     * direction { x, z } on the ground, or null. `isHero` picks the idle wait.
     */
    update(ball, dt, focus, isHero) {
      const s = of(ball);
      let look = null;
      if (s.reactLeft > 0) {
        s.reactLeft -= dt;
        const t = s.react;
        look = { x: t.x - ball.x, z: t.z - ball.z, amount: 1 };
      } else {
        const speed = speedOf(ball);
        if (speed > L.moveMin) look = { x: ball.vx, z: ball.vz, amount: Math.min(1, speed / L.moveFull) };
        else if (focus) look = { x: focus.x, z: focus.z, amount: 1 };
      }
      if (look && Math.hypot(look.x, look.z) < 1e-6) look = null;
      if (look) {
        // Busy: no glancing; after it, the wait starts over (yours the longer one).
        s.glance = null;
        s.idle = isHero ? L.heroIdleSeconds : rand(L.idleMin, L.idleMax);
      } else if (s.glance) {
        s.glance.left -= dt;
        look = s.glance.left > 0 ? s.glance.look : null;
        if (s.glance.left <= 0) {
          s.glance = null;
          s.idle = rand(L.idleMin, L.idleMax);
        }
      } else if ((s.idle -= dt) <= 0) {
        // A glance to a random hour on the clock face (12 is up on screen).
        const a = (Math.floor(Math.random() * 12) * Math.PI) / 6;
        s.glance = { left: L.glanceSeconds, look: { sx: Math.sin(a), sy: Math.cos(a), amount: 1 } };
        look = s.glance.look;
      }
      ball.look = look;
    },
  };
}
