// Keys and doors (design doc: "Objects"). Pure rules over the level grid.
//
// A door is a solid, sight-blocking tile until the hero comes within
// `doorReach` of it holding the matching key; then it opens for good (its
// tile becomes floor, so physics, sight and patrols all see it open). The key
// stays on your key ring and opens every other door of its colour too. With
// `noKeys` (the Locksmith card, M7) any door opens.

import { CONFIG } from './config.js';

/** Distance from a point to the nearest point of tile (col, row). */
function distToTile(x, z, col, row) {
  const cx = Math.min(Math.max(x, col), col + 1);
  const cz = Math.min(Math.max(z, row), row + 1);
  return Math.hypot(x - cx, z - cz);
}

/**
 * Open every closed door the hero is close enough to and can unlock. `keys`
 * is the list of key colours held (kept: a key opens every door of its
 * colour). Returns the doors opened this call.
 */
export function openDoors(level, hero, keys, { noKeys = false } = {}) {
  const opened = [];
  for (const door of level.doors) {
    if (door.open) continue;
    if (distToTile(hero.x, hero.z, door.col, door.row) > CONFIG.objects.doorReach) continue;
    if (!noKeys && !keys.includes(door.color)) continue;
    door.open = true;
    level.tiles[door.row][door.col] = 'floor';
    opened.push(door);
  }
  return opened;
}
