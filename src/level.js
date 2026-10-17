// Text-grid level loader. Keep LEGEND in sync with the table in docs/design.md.

export const LEGEND = {
  '#': { tile: 'wall' },
  '.': { tile: 'floor' },
  S: { tile: 'floor', entity: 'start' },
  X: { tile: 'exit' },
  O: { tile: 'floor', entity: 'barrel' },
  C: { tile: 'floor', entity: 'chest' },
  E: { tile: 'floor', entity: 'explosiveBarrel' },
  1: { tile: 'floor', entity: 'enemy', level: 1 },
  2: { tile: 'floor', entity: 'enemy', level: 2 },
  3: { tile: 'floor', entity: 'enemy', level: 3 },
  4: { tile: 'floor', entity: 'enemy', level: 4 },
  5: { tile: 'floor', entity: 'enemy', level: 5 },
  r: { tile: 'floor', entity: 'key', color: 'red' },
  b: { tile: 'floor', entity: 'key', color: 'blue' },
  y: { tile: 'floor', entity: 'key', color: 'yellow' },
  R: { tile: 'door', color: 'red' },
  B: { tile: 'door', color: 'blue' },
  Y: { tile: 'door', color: 'yellow' },
};

// Tile (col, row) covers [col, col+1] × [row, row+1] on the ground plane;
// x grows with col, z grows with row (row 0 is the far edge of the screen).
export function parseLevel(text, name = 'level') {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const tiles = [];
  const entities = [];
  let start = null;

  for (let row = 0; row < height; row++) {
    const tileRow = [];
    for (let col = 0; col < width; col++) {
      // Short rows are padded with walls so the level is always enclosed.
      const ch = lines[row][col] ?? '#';
      const def = LEGEND[ch];
      if (!def) throw new Error(`${name}: unknown tile '${ch}' at row ${row}, col ${col}`);
      tileRow.push(def.color ? { type: def.tile, color: def.color } : { type: def.tile });
      if (def.entity === 'start') {
        if (start) throw new Error(`${name}: more than one start 'S'`);
        start = { x: col + 0.5, z: row + 0.5 };
      } else if (def.entity) {
        const { tile, entity, ...rest } = def;
        entities.push({ type: entity, ...rest, x: col + 0.5, z: row + 0.5 });
      }
    }
    tiles.push(tileRow);
  }
  if (!start) throw new Error(`${name}: missing start 'S'`);

  return { name, width, height, tiles, entities, start };
}

export function tileAt(level, col, row) {
  if (row < 0 || row >= level.height || col < 0 || col >= level.width) return null;
  return level.tiles[row][col];
}

// Solid for physics. Doors are solid until opened (M6).
export function isSolid(level, col, row) {
  const t = tileAt(level, col, row);
  if (!t) return true; // outside the grid behaves like a wall
  return t.type === 'wall' || (t.type === 'door' && !t.open);
}
