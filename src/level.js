// Text-grid level loader. One character per tile; the legend here must match
// the "Levels" table in docs/design.md.
//
// World coordinates: 1 unit = 1 tile. Tile (col, row) spans x in [col, col+1]
// and z in [row, row+1]; row 0 is the top line of the file (far from the camera).

export const LEGEND = {
  '#': 'wall',
  '.': 'floor',
  S: 'start',
  X: 'exit',
  O: 'barrel',
  C: 'chest',
  E: 'explosive',
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
};

const KEY_COLORS = { r: 'red', b: 'blue', y: 'yellow', R: 'red', B: 'blue', Y: 'yellow' };

/**
 * Parse a level text into a grid of base tiles plus entity spawn lists.
 * Base tiles are 'wall', 'floor', 'exit' or 'door'; everything else sits on floor.
 */
export function parseLevel(text, name = 'level') {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd());
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) throw new Error(`${name}: level is empty`);

  const width = lines[0].length;
  const height = lines.length;
  const tiles = [];
  const level = {
    name,
    width,
    height,
    tiles,
    start: null,
    exits: [],
    enemies: [],
    barrels: [],
    explosives: [],
    chests: [],
    keys: [],
    doors: [],
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
      }
      tileRow.push(base);
    }
    tiles.push(tileRow);
  });

  if (!level.start) throw new Error(`${name}: no hero start 'S'`);
  return level;
}

export function tileAt(level, col, row) {
  if (row < 0 || row >= level.height || col < 0 || col >= level.width) return 'wall';
  return level.tiles[row][col];
}

/** Solid for physics and sight. Doors are closed until M6 opens them. */
export function isSolid(level, col, row) {
  const t = tileAt(level, col, row);
  return t === 'wall' || t === 'door';
}

export function tileCenter({ col, row }) {
  return { x: col + 0.5, z: row + 0.5 };
}
