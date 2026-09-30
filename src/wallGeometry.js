// Rounded walls: turns a level's block walls into outlines of straight
// segments and quarter-circle arcs, used by physics, sight and rendering when
// the level asks for rounding (a curviness digit, 2 to 5, in its top-left corner).
//
// The outline traces every boundary between wall tiles and open tiles, then
// rounds each corner of it:
//   - convex corners (wall sticking out into a room) become round bumps;
//   - concave corners (a room's corners) become curved walls.
// Each corner's radius is the level setting, limited to half of the straight
// runs on either side, so neighbouring curves never overlap. Corners touching
// a door stay square, so doors still fit their openings. Doors themselves are
// not part of the outline: they keep their box collision (they can open).
//
// Coordinates are world (x, z), 1 unit = 1 tile, as in level.js.

const EPS = 1e-9;
// A point further than this from every outline piece is where the square
// tiles say it is: rounding only changes things close to the curves.
const NEAR = 2;

/** Every boundary edge between a wall tile and an open one, with a consistent winding. */
function boundaryEdges(level) {
  const isWall = (c, r) => r < 0 || r >= level.height || c < 0 || c >= level.width || level.tiles[r][c] === 'wall';
  const edges = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (isWall(c, r)) continue;
      // Each side facing a wall, walked in direction d so that the floor
      // normal n = (d.z, -d.x) points into this open tile.
      if (isWall(c, r - 1)) edges.push({ ax: c + 1, az: r, bx: c, bz: r }); // wall above: d = (-1, 0), n = (0, 1)
      if (isWall(c, r + 1)) edges.push({ ax: c, az: r + 1, bx: c + 1, bz: r + 1 }); // wall below: d = (1, 0), n = (0, -1)
      if (isWall(c - 1, r)) edges.push({ ax: c, az: r, bx: c, bz: r + 1 }); // wall left: d = (0, 1), n = (1, 0)
      if (isWall(c + 1, r)) edges.push({ ax: c + 1, az: r + 1, bx: c + 1, bz: r }); // wall right: d = (0, -1), n = (-1, 0)
    }
  }
  return edges;
}

/** Link the edges into closed loops of corner points (collinear runs merged). */
function traceLoops(edges) {
  const key = (x, z) => `${x},${z}`;
  const from = new Map(); // start point -> edges starting there (two at a checkerboard pinch)
  for (const e of edges) {
    e.dx = e.bx - e.ax;
    e.dz = e.bz - e.az;
    const k = key(e.ax, e.az);
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(e);
  }
  const loops = [];
  for (const first of edges) {
    if (first.used) continue;
    const path = [];
    let e = first;
    while (e && !e.used) {
      e.used = true;
      path.push(e);
      const next = from.get(key(e.bx, e.bz)).filter((o) => !o.used || o === first);
      if (next.length > 1) {
        // Two walls touching only at a corner: keep them joined (turn toward
        // the wall), as the square tiles did, so no gap opens between them.
        const cross = (o) => e.dx * o.dz - e.dz * o.dx;
        next.sort((p, q) => cross(p) - cross(q));
      }
      e = next[0];
      if (e === first) break;
    }
    // Corners: points where the direction changes.
    const pts = [];
    for (let i = 0; i < path.length; i++) {
      const prev = path[(i + path.length - 1) % path.length];
      const cur = path[i];
      if (prev.dx !== cur.dx || prev.dz !== cur.dz) pts.push({ x: cur.ax, z: cur.az, din: { x: prev.dx, z: prev.dz }, dout: { x: cur.dx, z: cur.dz } });
    }
    loops.push(pts);
  }
  return loops;
}

function touchesDoor(level, x, z) {
  for (const [c, r] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
    if (r >= 0 && r < level.height && c >= 0 && c < level.width && level.tiles[r][c] === 'door') return true;
  }
  return false;
}

/**
 * Build the rounded outline of a level's walls.
 * `round` is the corner radius in tiles (at most `maxRound`); each corner is
 * also limited by the straight runs either side of it.
 * `spots` ({ x, z, clear }) are things placed in the level: an inside curve
 * shrinks until each keeps `clear` tiles between its centre and the wall, so
 * nothing starts buried in a room's rounded corner.
 * Returns { loops, prims, bucket(x, z) } where each loop is a list of
 * primitives in order, and prims are:
 *   { type: 'seg', ax, az, bx, bz, nx, nz, len, capA, capB }  (n: floor normal)
 *   { type: 'arc', cx, cz, r, convex, a0, sweep, ... }          (quarter circle)
 */
export function buildWallGeometry(level, round, maxRound, spots = []) {
  const want = Math.min(round, maxRound);
  const loops = traceLoops(boundaryEdges(level)).map((pts) => {
    const n = pts.length;
    const lenTo = (i) => {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      return Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
    };
    // Radius of each corner.
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      p.convex = p.din.x * p.dout.z - p.din.z * p.dout.x > 0;
      p.r = touchesDoor(level, p.x, p.z) ? 0 : Math.min(want, lenTo((i + n - 1) % n) / 2, lenTo(i) / 2);
      if (!p.convex) p.r = clearOfSpots(p, Math.min(p.r, openSquare(level, p, p.r)), spots);
    }
    // Pieces: for each corner its arc (if rounded), then the straight run to the next corner.
    const prims = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      if (p.r > 0) prims.push(makeArc(p));
      const ax = p.x + p.dout.x * p.r;
      const az = p.z + p.dout.z * p.r;
      const bx = q.x - q.din.x * q.r;
      const bz = q.z - q.din.z * q.r;
      const len = Math.hypot(bx - ax, bz - az);
      if (len > EPS) {
        // Floor normal: the floor is on the left of the walking direction.
        prims.push({ type: 'seg', ax, az, bx, bz, dx: p.dout.x, dz: p.dout.z, nx: p.dout.z, nz: -p.dout.x, len, capA: p.r === 0 && p.convex, capB: q.r === 0 && q.convex });
      }
    }
    return prims;
  });

  const prims = loops.flat();
  // Bucket every piece into the tiles within NEAR of its bounding box.
  const buckets = new Map();
  for (const p of prims) {
    const [x0, z0, x1, z1] = p.type === 'seg' ? [Math.min(p.ax, p.bx), Math.min(p.az, p.bz), Math.max(p.ax, p.bx), Math.max(p.az, p.bz)] : [p.cx - p.r, p.cz - p.r, p.cx + p.r, p.cz + p.r];
    for (let r = Math.floor(z0 - NEAR); r <= Math.floor(z1 + NEAR); r++) {
      for (let c = Math.floor(x0 - NEAR); c <= Math.floor(x1 + NEAR); c++) {
        const k = r * 100000 + c;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(p);
      }
    }
  }
  const none = [];
  return {
    round: want,
    loops,
    prims,
    /** Pieces that could be within NEAR of a point in tile (floor(x), floor(z)). */
    near(x, z) {
      return buckets.get(Math.floor(z) * 100000 + Math.floor(x)) ?? none;
    },
  };
}

const SHRINK_STEP = 0.05;

/**
 * Size of the open square of tiles in the room's corner at concave corner p,
 * up to `limit`: the curve stays inside it, so it can't pinch a narrow bend
 * shut against the wall across from it (the inner corner of a corridor's turn).
 */
function openSquare(level, p, limit) {
  const open = (i, j) => {
    const x = p.x - p.din.x * (i + 0.5) + p.dout.x * (j + 0.5);
    const z = p.z - p.din.z * (i + 0.5) + p.dout.z * (j + 0.5);
    const c = Math.floor(x);
    const r = Math.floor(z);
    return r >= 0 && r < level.height && c >= 0 && c < level.width && level.tiles[r][c] !== 'wall' && level.tiles[r][c] !== 'door';
  };
  let k = 0;
  while (k < limit) {
    let ok = true;
    for (let i = 0; i <= k && ok; i++) ok = open(i, k) && open(k, i);
    if (!ok) break;
    k++;
  }
  return k;
}

/** The biggest radius up to `r` for concave corner `p` that keeps every spot clear of its curve. */
function clearOfSpots(p, r, spots) {
  for (const s of spots) {
    // Distances from the two walls meeting at the corner (both positive in the room).
    const a = -((s.x - p.x) * p.din.x + (s.z - p.z) * p.din.z);
    const b = (s.x - p.x) * p.dout.x + (s.z - p.z) * p.dout.z;
    if (a < 0 || b < 0) continue;
    const buried = (q) => a < q && b < q && Math.hypot(q - a, q - b) > q - s.clear;
    while (r > 0 && buried(r)) r = Math.max(0, r - SHRINK_STEP);
  }
  return r;
}

function makeArc(p) {
  // Tangent points on the incoming and outgoing runs; the centre sits r in
  // from both (inside the wall for a convex corner, in the room for a concave one).
  const t1x = p.x - p.din.x * p.r;
  const t1z = p.z - p.din.z * p.r;
  const cx = t1x + p.dout.x * p.r;
  const cz = t1z + p.dout.z * p.r;
  const a0 = Math.atan2(t1z - cz, t1x - cx);
  const t2x = p.x + p.dout.x * p.r;
  const t2z = p.z + p.dout.z * p.r;
  let sweep = Math.atan2(t2z - cz, t2x - cx) - a0;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  // Direction from the centre to the arc's middle, for the in-span test.
  const mid = a0 + sweep / 2;
  return { type: 'arc', cx, cz, r: p.r, convex: p.convex, a0, sweep, mx: Math.cos(mid), mz: Math.sin(mid) };
}

/**
 * Where piece `p` is closest to (x, z): { d, nx, nz, sign, inRange }.
 * (nx, nz) is the unit direction from the wall surface toward the floor at
 * that spot; sign is +1 if (x, z) is on the floor side, -1 inside the wall.
 * inRange is false when the closest spot is only a clamped end of the piece.
 */
export function closestOn(p, x, z) {
  if (p.type === 'seg') {
    const t = (x - p.ax) * p.dx + (z - p.az) * p.dz;
    const s = (x - p.ax) * p.nx + (z - p.az) * p.nz; // signed distance from the line
    if (t >= 0 && t <= p.len) return { d: Math.abs(s), nx: p.nx, nz: p.nz, sign: s >= 0 ? 1 : -1, inRange: true };
    const ex = t < 0 ? p.ax : p.bx;
    const ez = t < 0 ? p.az : p.bz;
    const d = Math.hypot(x - ex, z - ez);
    const sign = s >= 0 ? 1 : -1;
    return { d, nx: d > EPS ? ((x - ex) / d) * sign : p.nx, nz: d > EPS ? ((z - ez) / d) * sign : p.nz, sign, inRange: false, cap: t < 0 ? p.capA : p.capB };
  }
  const ox = x - p.cx;
  const oz = z - p.cz;
  const dc = Math.hypot(ox, oz);
  // In span: within the quarter turn around the arc's middle direction.
  const inRange = dc > EPS && (ox * p.mx + oz * p.mz) / dc >= Math.cos(Math.abs(p.sweep) / 2) - 1e-12;
  if (!inRange) return { d: Infinity, inRange: false };
  const out = dc - p.r; // > 0 outside the circle
  const sign = (p.convex ? out : -out) >= 0 ? 1 : -1;
  const ux = ox / dc;
  const uz = oz / dc;
  return { d: Math.abs(out), nx: p.convex ? ux : -ux, nz: p.convex ? uz : -uz, sign, inRange: true };
}

/**
 * Wall contacts of a circle at (x, z) with radius r: every piece it overlaps,
 * as { nx, nz, depth } with the normal pointing out of the wall. A centre
 * that has slipped inside the wall (less than r deep) is pushed back out.
 */
export function wallContacts(geom, x, z, r) {
  const out = [];
  for (const p of geom.near(x, z)) {
    const c = closestOn(p, x, z);
    if (c.d >= r) continue;
    // A clamped end is someone else's piece (the next arc or run), except
    // at a sharp outside corner, which only the ends can touch.
    if (!c.inRange && !c.cap) continue;
    out.push({ nx: c.nx, nz: c.nz, depth: c.sign > 0 ? r - c.d : r + c.d, prim: p });
  }
  return out;
}

/** True if the point (x, z) is inside a (rounded) wall. `tileIsWall` covers points far from any curve. */
export function insideWall(geom, x, z, tileIsWall) {
  let best = null;
  for (const p of geom.near(x, z)) {
    const c = closestOn(p, x, z);
    if (c.d === Infinity) continue;
    // Prefer an in-range piece on a tie: its side is reliable.
    if (!best || c.d < best.d - 1e-9 || (c.d < best.d + 1e-9 && c.inRange && !best.inRange)) best = c;
  }
  if (!best || best.d >= NEAR) return tileIsWall;
  return best.sign < 0;
}

/**
 * Flatten each loop into a polygon of (x, z) points (arcs split into short
 * chords), for drawing. `perQuarter(r)` is how many chords a quarter circle gets.
 */
export function loopPolygons(geom, perQuarter) {
  return geom.loops.map((loop) => {
    const pts = [];
    for (const p of loop) {
      if (p.type === 'seg') {
        pts.push({ x: p.ax, z: p.az });
      } else {
        const n = perQuarter(p.r);
        for (let i = 0; i < n; i++) {
          const a = p.a0 + (p.sweep * i) / n;
          pts.push({ x: p.cx + Math.cos(a) * p.r, z: p.cz + Math.sin(a) * p.r });
        }
      }
    }
    return pts;
  });
}
