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
    if (move - p.move >= ICE.puddleMoves + 1) ice.delete(k);
    else p.boosted.clear();
  }
}

/**
 * After a physics step: kick any moving ball that has just rolled onto a
 * puddle, and lay puddles under moving Ice balls. Returns true if any
 * puddle was laid (so the view can redraw).
 */
export function stepIce(world, level, ice, move) {
  let laid = false;
  for (const b of world.balls) {
    if (b.phased) continue;
    const speed = speedOf(b);
    if (speed === 0) continue;
    const col = Math.floor(b.x);
    const row = Math.floor(b.z);
    const key = `${col},${row}`;
    let p = ice.get(key);
    if (p && !p.boosted.has(b)) {
      p.boosted.add(b);
      const next = Math.min(Math.max(speed, CONFIG.aim.maxLaunchSpeed), speed + ICE.puddleKick);
      b.vx *= next / speed;
      b.vz *= next / speed;
    }
    if (b.type === 'ice' && b.hp > 0 && !isSolid(level, col, row)) {
      if (!p) {
        p = { col, row, move, boosted: new Set() };
        ice.set(key, p);
        laid = true;
      } else if (p.move !== move) {
        p.move = move; // freshly iced: lasts from this move again
        laid = true;
      }
      p.boosted.add(b); // its own trail doesn't push it along
    }
  }
  return laid;
}
