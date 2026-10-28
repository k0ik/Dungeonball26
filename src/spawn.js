// Where your ball comes back after a knockout (design doc: "Respawn").
// Normally the level's start; but an enemy (or anything else) may have come
// to rest there, so it's the nearest free tile to the start instead: the
// closest by walking distance whose centre is clear of every ball, barrel
// and chest, skipping walls, doors, pits, lava and the exit.

import { tileAt, isSolid, isHazard } from './level.js';
import { overlapsSolid, staticContact } from './physics.js';

const CLEAR = 0.05; // tiles of extra room round the ball

/** The nearest free spot to `start` ({ x, z } at a tile centre) for a ball of radius `r`, ignoring `self`. */
export function freeSpawn(world, start, r, self = null) {
  const { level } = world;
  const free = (x, z) =>
    !overlapsSolid(level, x, z, r + CLEAR) &&
    world.balls.every((b) => b === self || b.fallen || Math.hypot(b.x - x, b.z - z) >= r + b.radius + CLEAR) &&
    world.statics.every((s) => !staticContact({ x, z }, s, r + CLEAR));
  if (free(start.x, start.z)) return { x: start.x, z: start.z };
  // Breadth-first out from the start tile, so the spot is the closest you
  // could walk to (never across a wall into the next room).
  const c0 = Math.floor(start.x);
  const r0 = Math.floor(start.z);
  const seen = new Set([`${c0},${r0}`]);
  const queue = [[c0, r0]];
  while (queue.length) {
    const [c, row] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [c + dc, row + dr];
      const id = `${n[0]},${n[1]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const t = tileAt(level, n[0], n[1]);
      if (isSolid(level, n[0], n[1]) || isHazard(t)) continue;
      queue.push(n);
      if (t === 'exit') continue; // passable, but never come back on the exit
      if (free(n[0] + 0.5, n[1] + 0.5)) return { x: n[0] + 0.5, z: n[1] + 0.5 };
    }
  }
  return { x: start.x, z: start.z }; // nowhere free at all: the start, as before
}
