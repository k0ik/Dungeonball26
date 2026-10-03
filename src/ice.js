// Ice puddles (design doc: "Enemy ideas", Ice). An Ice ball leaves an icy
// puddle on every floor tile it crosses while it moves; any ball rolling onto
// a puddle gets a kick of speed along its way, once per puddle per move. A
// puddle lasts out the move it was laid in and the next one, and melts at the
// start of the move after that: laid in your shot, it's there for the enemy
// move and gone when you next shoot; laid in the enemy move, it's there for
// your next shot. Pure rules, shared by the game and the aim preview.

import { CONFIG } from './config.js';
import { speedOf } from './physics.js';
import { isSolid } from './level.js';

const ICE = CONFIG.enemy.types.ice;
const STICKY = CONFIG.enemy.types.sticky;
const LAYS = { ice: 'ice', sticky: 'goop' }; // which balls lay which puddles

/** Puddles by tile: Map "col,row" -> { col, row, move, boosted: Set of balls }. */
export function createIce() {
  return new Map();
}

/** A copy for the aim preview: same puddles, nobody boosted yet. */
export function copyIce(ice) {
  return new Map([...ice].map(([k, p]) => [k, { ...p, boosted: new Set() }]));
}

/**
 * A new move starts (`move` counts your shots and enemy moves together):
 * melt the puddles laid two moves ago or earlier, and let every ball be
 * kicked again by the rest.
 */
export function meltIce(ice, move) {
  for (const [k, p] of ice) {
    const lasts = p.kind === 'goop' ? STICKY.puddleMoves : ICE.puddleMoves;
    if (move - p.move >= lasts + 1) ice.delete(k);
    else p.boosted.clear();
  }
}

/**
 * After a physics step: kick any moving ball that has just rolled onto an
 * ice puddle, drag any ball rolling over goop, and lay puddles under moving
 * Ice balls (ice) and Sticky Ickies (goop); a fresh puddle replaces one of
 * the other kind. `dt` is the step's length. Returns true if any puddle was
 * laid (so the view can redraw).
 */
export function stepIce(world, level, ice, move, dt = CONFIG.physics.step) {
  let laid = false;
  for (const b of world.balls) {
    if (b.phased) continue;
    const speed = speedOf(b);
    if (speed === 0) continue;
    const col = Math.floor(b.x);
    const row = Math.floor(b.z);
    const key = `${col},${row}`;
    let p = ice.get(key);
    if (p?.kind === 'goop') {
      // Goop: extra friction for as long as the ball is on it.
      const next = speed - STICKY.goopDrag * dt;
      const k = next <= CONFIG.physics.stopThreshold ? 0 : next / speed;
      b.vx *= k;
      b.vz *= k;
    } else if (p && !p.boosted.has(b)) {
      p.boosted.add(b);
      const next = Math.min(Math.max(speed, CONFIG.aim.maxLaunchSpeed), speed + ICE.puddleKick);
      b.vx *= next / speed;
      b.vz *= next / speed;
    }
    const kind = b.hp > 0 && LAYS[b.type];
    if (kind && !isSolid(level, col, row)) {
      if (!p || p.kind !== kind) {
        p = { col, row, move, kind, boosted: new Set() };
        ice.set(key, p);
        laid = true;
      } else if (p.move !== move) {
        p.move = move; // freshly laid: lasts from this move again
        laid = true;
      }
      p.boosted.add(b); // its own trail doesn't push it along
    }
  }
  return laid;
}
