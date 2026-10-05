// Text-grid level loader. One character per tile; the legend here must match
// the "Levels" table in docs/design.md.
//
// World coordinates: 1 unit = 1 tile. Tile (col, row) spans x in [col, col+1]
// and z in [row, row+1]; row 0 is the top line of the file (far from the camera).
//
// The whole grid must be ringed by walls. The top-left corner may hold a digit
// instead, the level's curviness: 1 keeps right-angled walls, 5 is the
// roundest, 3 halfway, 2 and 4 in between (a share of each corner's biggest
// possible curve: see buildWallGeometry). Without
// one, CONFIG.walls.defaultCurve applies. The corner is always a wall tile.

export const LEGEND = {
  '#': 'wall',
  '.': 'floor',
  S: 'start',
  X: 'exit',
  O: 'barrel',
  C: 'chest',
  E: 'explosive',
  '*': 'coin',
  $: 'gold', // a Gold ball (a tool ball)
  1: 'enemy',
  2: 'enemy',
  3: 'enemy',
  4: 'enemy',
  5: 'enemy',
  r: 'key',
  b: 'key',
  y: 'key',
  R: 'door',
  B: 'door',
  Y: 'door',
  _: 'pit', // a bottomless pit: any ball whose centre rolls over it falls in
  '~': 'lava', // a lava pit: the same, sunk below the floor with glowing lava
  u: 'divot', // a shallow dish that pulls rolling balls toward its centre
  n: 'bump', // a low mound that pushes rolling balls away from its centre
  '=': 'half', // a half-wall: blocks balls like a wall, but enemies see over it
};

import { CONFIG } from './config.js';
import { buildWallGeometry } from './wallGeometry.js';

const KEY_COLORS = { r: 'red', b: 'blue', y: 'yellow', R: 'red', B: 'blue', Y: 'yellow' };

/**
 * Parse a level text into a grid of base tiles plus entity spawn lists.
 * Base tiles are 'wall', 'floor', 'exit', 'door', 'half', 'pit', 'lava',
 * 'divot' or 'bump'; everything else sits on floor.
 * `requireStart: false` accepts a level with no start yet (the level editor's
 * outline preview of a half-drawn level).
 */
export function parseLevel(text, name = 'level', { requireStart = true } = {}) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd());
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) throw new Error(`${name}: level is empty`);

  // Curviness digit in the top-left corner (see the top of this file).
  let curve = CONFIG.walls.defaultCurve;
  if (/^\d/.test(lines[0])) {
    curve = Number(lines[0][0]);
    if (curve < 1 || curve > 5) throw new Error(`${name}: curviness (top-left corner) must be 1 to 5, not ${curve}`);
    lines[0] = '#' + lines[0].slice(1);
  }
  const width = lines[0].length;
  const height = lines.length;
  const tiles = [];
  const level = {
    name,
    curve,
    width,
    height,
    tiles,
    start: null,
    exits: [],
    enemies: [],
    barrels: [],
    explosives: [],
    chests: [],
    golds: [], // Gold balls
    keys: [],
    doors: [],
    coins: [], // single coins; touching ones form strips (coinStrips)
  };

  lines.forEach((line, row) => {
    if (line.length !== width) {
      throw new Error(`${name}: row ${row + 1} is ${line.length} tiles wide, expected ${width}`);
    }
    const tileRow = [];
    for (let col = 0; col < width; col++) {
      const ch = line[col];
      const kind = LEGEND[ch];
      if (!kind) throw new Error(`${name}: unknown tile '${ch}' at row ${row + 1}, column ${col + 1}`);
      const at = { col, row };
      let base = 'floor';
      switch (kind) {
        case 'wall':
          base = 'wall';
          break;
        case 'exit':
          base = 'exit';
          level.exits.push(at);
          break;
        case 'door':
          base = 'door';
          level.doors.push({ ...at, color: KEY_COLORS[ch] });
          break;
        case 'start':
          if (level.start) throw new Error(`${name}: more than one hero start 'S'`);
          level.start = at;
          break;
        case 'enemy':
          level.enemies.push({ ...at, level: Number(ch) });
          break;
        case 'key':
          level.keys.push({ ...at, color: KEY_COLORS[ch] });
          break;
        case 'barrel':
          level.barrels.push(at);
          break;
        case 'explosive':
          level.explosives.push(at);
          break;
        case 'chest':
          level.chests.push(at);
          break;
        case 'coin':
          level.coins.push(at);
          break;
        case 'gold':
          level.golds.push(at);
          break;
        case 'lava':
          (level.lavas ??= []).push(at);
          base = kind;
          break;
        case 'half':
        case 'pit':
        case 'divot':
        case 'bump':
          base = kind;
          break;
      }
      tileRow.push(base);
    }
    tiles.push(tileRow);
  });

  if (!level.start && requireStart) throw new Error(`${name}: no hero start 'S'`);
  // Each door is a slab across its tile, running the way the wall runs:
  // along x between walls to its left and right, else along z.
  const blocks = (c, r) => ['wall', 'door'].includes(tileAt(level, c, r));
  const half = CONFIG.objects.doorThickness / 2;
  level.doorShapes = new Map();
  for (const d of level.doors) {
    const alongX = (blocks(d.col - 1, d.row) && blocks(d.col + 1, d.row)) || !(blocks(d.col, d.row - 1) && blocks(d.col, d.row + 1));
    level.doorShapes.set(d.row * level.width + d.col, { halfX: alongX ? 0.5 : half, halfZ: alongX ? half : 0.5 });
  }
  // Only walls around the edge, so rooms never open onto the void.
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if ((row === 0 || col === 0 || row === height - 1 || col === width - 1) && tiles[row][col] !== 'wall') {
        throw new Error(`${name}: the edge must be all walls, but row ${row + 1}, column ${col + 1} isn't`);
      }
    }
  }
  // Rounded walls: physics, sight and drawing use this outline instead of square tiles.
  const share = (curve - 1) / 4; // of each corner's biggest possible curve
  level.share = share;
  if (share > 0) level.geometry = buildWallGeometry(level, share, CONFIG.walls.maxRound, placedSpots(level));
  return level;
}

/** Everything placed in the level, as tile centres with the clearance each needs from a wall. */
export function placedSpots(level) {
  const O = CONFIG.objects;
  const ball = CONFIG.ball.diameter / 2;
  const at = (list, clear) => list.map((t) => ({ x: t.col + 0.5, z: t.row + 0.5, clear }));
  return [
    ...at([level.start, ...level.enemies].filter(Boolean), ball),
    ...at([...level.barrels, ...level.explosives], O.barrelRadius),
    ...at(level.chests, Math.hypot(O.chestHalfX, O.chestHalfZ)),
    ...at([...level.keys, ...level.coins], O.itemRadius),
    ...at(level.exits, ball),
  ];
}

/**
 * Group the level's coins into strips: coins that touch side by side (not
 * diagonally) belong to the same strip. Returns a list of strips, each a list
 * of { col, row }.
 */
export function coinStrips(level) {
  const left = new Map(level.coins.map((c) => [`${c.col},${c.row}`, c]));
  const strips = [];
  for (const start of level.coins) {
    if (!left.has(`${start.col},${start.row}`)) continue;
    const strip = [];
    const stack = [start];
    left.delete(`${start.col},${start.row}`);
    while (stack.length) {
      const c = stack.pop();
      strip.push(c);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = `${c.col + dc},${c.row + dr}`;
        if (!left.has(id)) continue;
        stack.push(left.get(id));
        left.delete(id);
      }
    }
    strips.push(strip);
  }
  return strips;
}

export function tileAt(level, col, row) {
  if (row < 0 || row >= level.height || col < 0 || col >= level.width) return 'wall';
  return level.tiles[row][col];
}

/**
 * Solid for physics: walls, closed doors (an opened one becomes floor,
 * doors.js) and half-walls. `ignoreHalf` leaves half-walls out, for sight,
 * which passes over them.
 */
export function isSolid(level, col, row, ignoreHalf = false) {
  const t = tileAt(level, col, row);
  return t === 'wall' || t === 'door' || (t === 'half' && !ignoreHalf);
}

/** A hole a ball falls into: a bottomless pit or a lava pit. */
export const isHazard = (t) => t === 'pit' || t === 'lava';

/** Floor a ball rolls over (patrols may stop on it): plain floor, the exit, a divot or a bump. */
export const isFloorLike = (t) => t === 'floor' || t === 'exit' || t === 'divot' || t === 'bump';

export function tileCenter({ col, row }) {
  return { x: col + 0.5, z: row + 0.5 };
}
