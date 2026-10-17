// Rounded pits and lava: on a rounded level (curviness 2 to 5) the corners of
// a pit or lava pool round off like the walls do, one tile corner at a time.
//   - A hole's own corner sticking out into the floor (both tiles beside it
//     open floor) rounds off: the floor fills the corner.
//   - A floor tile's corner sticking into a hole (the tiles beside it and the
//     one diagonal to it all the same kind of hole) rounds off: the hole
//     fills that corner of the floor tile (a fillet).
// The radius is half a tile at curviness 5 (a lone lava tile is a circle),
// scaled down with the level's curviness like the exit patch. Corners
// against walls, half-walls, doors or another kind of hole stay square.
//
// Physics (falling in) and drawing both read this, so a ball falls in exactly
// where the hole is drawn.

const kindAt = (level, col, row) =>
  row < 0 || row >= level.height || col < 0 || col >= level.width ? 'wall' : level.tiles[row][col];
const isHole = (t) => t === 'pit' || t === 'lava';
const isOpen = (t) => t === 'floor' || t === 'exit' || t === 'divot' || t === 'bump';

// A tile's corners, in order round the tile: 0 top-left (x0, z0), 1 top-right,
// 2 bottom-right, 3 bottom-left; (sx, sz) is the corner's side of the tile.
export const CORNERS = [
  { sx: -1, sz: -1 },
  { sx: 1, sz: -1 },
  { sx: 1, sz: 1 },
  { sx: -1, sz: 1 },
];

/**
 * Work out every rounded corner of the level's holes. Sets level.holeCorners:
 * a Map from `row * width * 4 + col * 4 + corner` to the kind of hole that
 * fills the corner region ('pit' or 'lava'), or 'floor' where the floor does;
 * and level.holeRadius. Nothing on a square level.
 */
export function roundHoles(level) {
  const r = 0.5 * (level.share ?? 0);
  level.holeRadius = r;
  level.holeCorners = null;
  if (r <= 0) return;
  const map = new Map();
  for (let row = 0; row < level.height; row++) {
    for (let col = 0; col < level.width; col++) {
      const t = kindAt(level, col, row);
      if (!isHole(t) && !isOpen(t)) continue;
      CORNERS.forEach(({ sx, sz }, i) => {
        const a = kindAt(level, col + sx, row);
        const b = kindAt(level, col, row + sz);
        const d = kindAt(level, col + sx, row + sz);
        if (isHole(t) && isOpen(a) && isOpen(b) && d !== t) map.set((row * level.width + col) * 4 + i, 'floor');
        else if (isOpen(t) && isHole(a) && a === b && b === d) map.set((row * level.width + col) * 4 + i, a);
      });
    }
  }
  level.holeCorners = map.size ? map : null;
}

/** What fills corner `i` of tile (col, row) if it's rounded ('floor', 'pit' or 'lava'), else null. */
export function cornerFill(level, col, row, i) {
  return level.holeCorners?.get((row * level.width + col) * 4 + i) ?? null;
}

/** The grid point of corner i of tile (col, row), and the centre of its curve. */
export function cornerGeometry(level, col, row, i) {
  const { sx, sz } = CORNERS[i];
  const r = level.holeRadius;
  const px = col + (sx > 0 ? 1 : 0);
  const pz = row + (sz > 0 ? 1 : 0);
  return { px, pz, cx: px - sx * r, cz: pz - sz * r, r, sx, sz };
}

/**
 * The hole under the point (x, z): 'pit', 'lava' or null, with the centre of
 * the hole tile it belongs to (where a ball that falls in sinks).
 */
export function holeAt(level, x, z) {
  const col = Math.floor(x);
  const row = Math.floor(z);
  const t = kindAt(level, col, row);
  if (level.holeCorners) {
    // The corner of this tile the point is in, and whether it's in its rounded-off part.
    const fx = x - col;
    const fz = z - row;
    const i = fz < 0.5 ? (fx < 0.5 ? 0 : 1) : fx < 0.5 ? 3 : 2;
    const fill = cornerFill(level, col, row, i);
    if (fill) {
      const g = cornerGeometry(level, col, row, i);
      const inSquare = Math.abs(x - g.px) < g.r && Math.abs(z - g.pz) < g.r;
      if (inSquare && Math.hypot(x - g.cx, z - g.cz) > g.r) {
        if (fill === 'floor') return null;
        return { kind: fill, x: col + g.sx + 0.5, z: row + g.sz + 0.5 }; // the diagonal hole tile
      }
    }
  }
  return isHole(t) ? { kind: t, x: col + 0.5, z: row + 0.5 } : null;
}

/**
 * The quarter-circle of a rounded corner as points, from where it leaves the
 * edge coming in to where it joins the edge going out (walking round the
 * tile in corner order). `n` chords.
 */
export function cornerArc(level, col, row, i, n) {
  const g = cornerGeometry(level, col, row, i);
  // Coming in along the edge from the previous corner, going out to the next.
  const prev = cornerGeometry(level, col, row, (i + 3) % 4);
  const next = cornerGeometry(level, col, row, (i + 1) % 4);
  const din = { x: Math.sign(g.px - prev.px), z: Math.sign(g.pz - prev.pz) };
  const dout = { x: Math.sign(next.px - g.px), z: Math.sign(next.pz - g.pz) };
  const a = { x: g.px - din.x * g.r, z: g.pz - din.z * g.r };
  const b = { x: g.px + dout.x * g.r, z: g.pz + dout.z * g.r };
  const a0 = Math.atan2(a.z - g.cz, a.x - g.cx);
  let a1 = Math.atan2(b.z - g.cz, b.x - g.cx);
  let sweep = a1 - a0;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const ang = a0 + (sweep * k) / n;
    pts.push({ x: g.cx + Math.cos(ang) * g.r, z: g.cz + Math.sin(ang) * g.r });
  }
  return { pts, px: g.px, pz: g.pz };
}

/** Tile (col, row)'s outline with the given corners rounded, as points in corner order. */
export function roundedTile(level, col, row, rounded, n) {
  const pts = [];
  for (let i = 0; i < 4; i++) {
    if (rounded(i)) pts.push(...cornerArc(level, col, row, i, n).pts);
    else {
      const g = cornerGeometry(level, col, row, i);
      pts.push({ x: g.px, z: g.pz });
    }
  }
  return pts;
}
