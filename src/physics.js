// Custom 2D circle solver on the ground plane (x, z), fixed timestep.
// Walls are the level's solid tiles, treated as axis-aligned unit boxes, or,
// on a level with rounded walls, its outline of segments and arcs
// (wallGeometry.js); doors stay boxes either way.
// Statics are immovable bumpers inside the room (barrels, chests): circles or
// boxes that keep `bumperRestitution` of a ball's speed.

import { CONFIG } from './config.js';
import { isSolid, tileAt, isHazard } from './level.js';
import { wallContacts, insideWall } from './wallGeometry.js';

const P = CONFIG.physics;

export function createBall({ x, z, radius = CONFIG.ball.diameter / 2, kind = 'ball', id }) {
  return { id, kind, x, z, vx: 0, vz: 0, radius };
}

export function createWorld(level) {
  return { level, balls: [], statics: [], events: [], time: 0 };
}

/** An immovable round bumper (a barrel). */
export function createStaticCircle({ x, z, radius, kind, id }) {
  return { id, kind, shape: 'circle', x, z, radius };
}

/** An immovable box bumper (a chest), `halfX` by `halfZ` around (x, z). */
export function createStaticBox({ x, z, halfX, halfZ, kind, id }) {
  return { id, kind, shape: 'box', x, z, halfX, halfZ };
}

export function speedOf(ball) {
  return Math.hypot(ball.vx, ball.vz);
}

export function isAtRest(world) {
  return world.balls.every((b) => b.vx === 0 && b.vz === 0);
}

/** Advance the world one fixed step. Collision events are appended to world.events. */
export function stepWorld(world, dt = P.step) {
  const { balls } = world;
  world.time += dt;

  // Slopes: divots pull a ball toward their centre, bumps push it away.
  for (const b of balls) if (!b.fallen) applySlope(world, b, dt);
  // A ball that fell in slides on into the middle of the hole as it drops,
  // so it goes down clear of the rim instead of through it.
  for (const b of balls) {
    if (!b.fallen || !b.fallTo) continue;
    const k = 1 - Math.exp(-P.fallSlide * dt);
    b.x += (b.fallTo.x - b.x) * k;
    b.z += (b.fallTo.z - b.z) * k;
  }

  for (const b of balls) {
    if (b.fallen) continue;
    const speed = speedOf(b);
    if (speed === 0) continue;
    // A ball can carry its own friction scale (the Athletic card lowers the hero's).
    const next = speed - P.friction * (b.friction ?? 1) * dt;
    if (next < P.stopThreshold) {
      b.vx = 0;
      b.vz = 0;
      continue;
    }
    const k = next / speed;
    b.vx *= k;
    b.vz *= k;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
  }

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) resolveBallPair(world, balls[i], balls[j]);
  }

  for (const b of balls) {
    if (b.fallen) continue;
    for (const s of world.statics) resolveStatic(world, b, s);
    resolveWalls(world, b);
    // Into a pit or lava: once its centre is over the hole, it falls in.
    const t = tileAt(world.level, Math.floor(b.x), Math.floor(b.z));
    if (isHazard(t)) {
      b.fallen = t;
      b.vx = b.vz = 0;
      b.fallTo = { x: Math.floor(b.x) + 0.5, z: Math.floor(b.z) + 0.5 };
      world.events.push({ type: 'fall', ball: b, kind: t });
    }
  }
}

/**
 * Divot or bump under `b`: an acceleration toward (divot) or away from
 * (bump) the tile's centre, strongest at the rim of its round dish and
 * nothing at the very centre or past the rim. A ball at rest only starts
 * moving if the slope beats friction there.
 */
function applySlope(world, b, dt) {
  const col = Math.floor(b.x);
  const row = Math.floor(b.z);
  const t = tileAt(world.level, col, row);
  if (t !== 'divot' && t !== 'bump') return;
  const dx = b.x - (col + 0.5);
  const dz = b.z - (row + 0.5);
  const d = Math.hypot(dx, dz);
  if (d < 1e-4 || d > 0.5) return;
  const a = (t === 'divot' ? -P.divotPull : P.bumpPush) * (d / 0.5) * Math.sin(Math.PI * Math.min(1, d / 0.5));
  if (b.vx === 0 && b.vz === 0 && Math.abs(a) <= P.friction * (b.friction ?? 1)) return;
  b.vx += (dx / d) * a * dt;
  b.vz += (dz / d) * a * dt;
}

/**
 * Pinball kick (the Elasticity card): if `ball` bounced off a barrel, chest or
 * enemy in this step's events (walls don't count), add `kick` to its speed
 * along its new direction, up to `maxSpeed`. At most once per step, and each
 * bumper kicks at most `perBumper` times per shot: `kicked` (a Map from
 * bumper to kicks given, fresh each shot) keeps count, so a ball caught
 * between a bumper and a wall can't be kicked forever.
 */
export function applyBumperKick(world, ball, kick, maxSpeed, kicked = new Map(), perBumper = 1, accepts = () => true) {
  let bumper = null;
  for (const ev of world.events) {
    if (ev.type === 'static' && ev.ball === ball) bumper = ev.obj;
    else if (ev.type === 'ball' && (ev.a === ball || ev.b === ball) && (ev.a.kind === 'enemy' || ev.b.kind === 'enemy')) bumper = ev.a === ball ? ev.b : ev.a;
    else continue;
    if (!accepts(bumper)) {
      bumper = null;
      continue;
    }
    if ((kicked.get(bumper) ?? 0) < perBumper) break;
    bumper = null;
  }
  const speed = speedOf(ball);
  if (!bumper || speed === 0) return false;
  kicked.set(bumper, (kicked.get(bumper) ?? 0) + 1);
  const k = Math.min(maxSpeed, speed + kick) / speed;
  ball.vx *= k;
  ball.vz *= k;
  return true;
}

/**
 * Bumper kicks for every ball this step: barrels kick any ball
 * (physics.barrelKick); the ball holding Elasticity (`elastic`: { ball,
 * kick, perBumper }) is kicked instead by barrels, chests and enemies, at
 * the card's strength. `kicks` (Map ball -> Map bumper -> count, fresh each
 * move) keeps the per-bumper counts.
 */
export function applyBumperKicks(world, kicks, maxSpeed, elastic = null) {
  for (const b of world.balls) {
    if (!kicks.has(b)) kicks.set(b, new Map());
    if (elastic && b === elastic.ball) applyBumperKick(world, b, elastic.kick, maxSpeed, kicks.get(b), elastic.perBumper);
    else applyBumperKick(world, b, P.barrelKick, maxSpeed, kicks.get(b), P.barrelKicksPerBumper, (o) => o.kind === 'barrel');
  }
}

/**
 * Rubber enemies: if `ball` bounced off a Rubber enemy in this step's events,
 * multiply its speed by `factor` (along its new direction), up to `maxSpeed`.
 * At most once per step.
 */
export function applyRubberRebound(world, ball, factor, maxSpeed) {
  const hit = world.events.some((ev) => ev.type === 'ball' && (ev.a === ball || ev.b === ball) && (ev.a === ball ? ev.b : ev.a).type === 'rubber');
  const speed = speedOf(ball);
  if (!hit || speed === 0) return false;
  const k = Math.min(maxSpeed, speed * factor) / speed;
  if (k <= 1) return false;
  ball.vx *= k;
  ball.vz *= k;
  return true;
}

/** Contact normal and depth of a ball against a static, or null. */
export function staticContact(b, s, r = b.radius) {
  let cx = s.x;
  let cz = s.z;
  let reach = r;
  if (s.shape === 'circle') {
    reach = r + s.radius;
  } else {
    cx = Math.min(Math.max(b.x, s.x - s.halfX), s.x + s.halfX);
    cz = Math.min(Math.max(b.z, s.z - s.halfZ), s.z + s.halfZ);
  }
  const dx = b.x - cx;
  const dz = b.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= reach * reach) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-9) return { nx: 1, nz: 0, depth: reach }; // centre inside: push out along +x
  return { nx: dx / d, nz: dz / d, depth: reach - d };
}

function resolveStatic(world, b, s) {
  const c = staticContact(b, s);
  if (!c) return;
  b.x += c.nx * c.depth;
  b.z += c.nz * c.depth;
  const vn = b.vx * c.nx + b.vz * c.nz;
  if (vn >= 0) return;
  // Reflect, then keep a fraction of the total speed, like walls.
  b.vx = (b.vx - 2 * vn * c.nx) * P.bumperRestitution;
  b.vz = (b.vz - 2 * vn * c.nz) * P.bumperRestitution;
  if (b.inert) return; // your skull after a knockout: it bounces, but cracks, opens and sets off nothing
  world.events.push({ type: 'static', ball: b, obj: s, speed: -vn });
}

/**
 * Redo one side of a ball-ball impact as if the other ball had been a solid,
 * fixed bumper: `ball` (ev.a or ev.b) bounces off with its velocity from just
 * before the impact. Used when the impact kills the other ball, so a killing
 * blow ricochets instead of handing all its speed to a ball that then vanishes.
 */
export function bounceOffFixed(ev, ball) {
  const isA = ball === ev.a;
  const vx = isA ? ev.before.avx : ev.before.bvx;
  const vz = isA ? ev.before.avz : ev.before.bvz;
  // Normal pointing from `ball` into the other one.
  const nx = isA ? ev.nx : -ev.nx;
  const nz = isA ? ev.nz : -ev.nz;
  const vn = vx * nx + vz * nz;
  if (vn <= 0) return; // it wasn't moving into the other ball
  ball.vx = vx - (1 + P.ballRestitution) * vn * nx;
  ball.vz = vz - (1 + P.ballRestitution) * vn * nz;
}

function resolveBallPair(world, a, b) {
  if (a.phased || b.phased) return; // a faded Ghost: balls pass straight through
  if (a.fallen || b.fallen) return; // gone down a pit
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const minDist = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist) return;

  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 > 0 ? dx / d : 1;
  const nz = d2 > 0 ? dz / d : 0;

  // Split the positional correction by mass: a heavy ball (a Brute) gives
  // way less. Balls are mass 1 unless they carry their own.
  // An inert ball (your skull after a knockout) bounces off the other as if
  // it were fixed, and never moves it.
  const ia = b.inert && !a.inert ? 0 : 1 / (a.mass ?? 1);
  const ib = a.inert && !b.inert ? 0 : 1 / (b.mass ?? 1);
  const push = (minDist - d) / (ia + ib);
  a.x -= nx * push * ia;
  a.z -= nz * push * ia;
  b.x += nx * push * ib;
  b.z += nz * push * ib;

  const approach = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (approach <= 0) return;
  // Velocities just before the impact, kept on the event (see bounceOffFixed).
  const before = { avx: a.vx, avz: a.vz, bvx: b.vx, bvz: b.vz };
  const j = ((1 + P.ballRestitution) * approach) / (ia + ib);
  a.vx -= j * ia * nx;
  a.vz -= j * ia * nz;
  b.vx += j * ib * nx;
  b.vz += j * ib * nz;
  if (a.inert || b.inert) return; // no hit: no damage, no combo, no sound
  world.events.push({ type: 'ball', a, b, speed: approach, nx, nz, before });
}

/** A solid tile's box: the whole tile, or a closed door's slab across the middle of it. */
function tileBox(level, col, row) {
  const d = level.doorShapes?.get(row * level.width + col);
  if (d && tileAt(level, col, row) === 'door') return { x0: col + 0.5 - d.halfX, x1: col + 0.5 + d.halfX, z0: row + 0.5 - d.halfZ, z1: row + 0.5 + d.halfZ };
  return { x0: col, x1: col + 1, z0: row, z1: row + 1 };
}

/** Closest-point test of a circle against one solid tile. Returns contact or null. */
function tileContact(level, x, z, r, col, row) {
  const { x0, x1, z0, z1 } = tileBox(level, col, row);
  const cx = Math.min(Math.max(x, x0), x1);
  const cz = Math.min(Math.max(z, z0), z1);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, depth: r - d, d2 };
  }
  // Center inside the tile (shouldn't happen at our speeds): push out the nearest face.
  const faces = [
    { nx: -1, nz: 0, depth: x - x0 + r },
    { nx: 1, nz: 0, depth: x1 - x + r },
    { nx: 0, nz: -1, depth: z - z0 + r },
    { nx: 0, nz: 1, depth: z1 - z + r },
  ];
  faces.sort((p, q) => p.depth - q.depth);
  return { ...faces[0], d2: 0 };
}

/** Solid tiles a circle could touch: every wall and door tile, or only doors when the level has a rounded outline. */
function nearbySolidTiles(level, x, z, r) {
  const tiles = [];
  for (let row = Math.floor(z - r); row <= Math.floor(z + r); row++) {
    for (let col = Math.floor(x - r); col <= Math.floor(x + r); col++) {
      if (level.geometry ? tileAt(level, col, row) === 'door' : isSolid(level, col, row)) tiles.push({ col, row });
    }
  }
  return tiles;
}

function bounceOffWall(world, b, nx, nz, depth, col, row) {
  b.x += nx * depth;
  b.z += nz * depth;
  const vn = b.vx * nx + b.vz * nz;
  if (vn >= 0) return;
  // Reflect, then keep a fraction of the total speed ("keeps 90% of speed").
  b.vx = (b.vx - 2 * vn * nx) * P.wallRestitution;
  b.vz = (b.vz - 2 * vn * nz) * P.wallRestitution;
  world.events.push({ type: 'wall', ball: b, speed: -vn, col, row });
}

/** Rounded walls: push out of (and bounce off) each overlapped piece, deepest first, re-testing after each push. */
function resolveOutline(world, b) {
  const geom = world.level.geometry;
  const first = wallContacts(geom, b.x, b.z, b.radius);
  if (!first.length) return;
  first.sort((p, q) => q.depth - p.depth);
  for (const { prim } of first) {
    const c = wallContacts({ near: () => [prim] }, b.x, b.z, b.radius)[0];
    if (c) bounceOffWall(world, b, c.nx, c.nz, c.depth, Math.floor(b.x), Math.floor(b.z));
  }
}

function resolveWalls(world, b) {
  if (world.level.geometry) resolveOutline(world, b);
  const tiles = nearbySolidTiles(world.level, b.x, b.z, b.radius);
  if (!tiles.length) return;
  // Resolve nearest tiles first so a ball sliding along a flat wall is pushed off
  // the face before the neighbouring tile's corner can give it a bogus normal.
  const dist2 = ({ col, row }) => {
    const { x0, x1, z0, z1 } = tileBox(world.level, col, row);
    const cx = Math.min(Math.max(b.x, x0), x1);
    const cz = Math.min(Math.max(b.z, z0), z1);
    return (b.x - cx) ** 2 + (b.z - cz) ** 2;
  };
  tiles.sort((p, q) => dist2(p) - dist2(q));

  for (const { col, row } of tiles) {
    const c = tileContact(world.level, b.x, b.z, b.radius, col, row);
    if (c) bounceOffWall(world, b, c.nx, c.nz, c.depth, col, row);
  }
}

/** No wall between two points (a thin sweep, like sight's): what a blast can reach. */
export function lineClear(level, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(d / 0.1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (overlapsSolid(level, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.05)) return false;
  }
  return true;
}

/** True if a circle at (x, z) overlaps any solid tile (or rounded wall). */
export function overlapsSolid(level, x, z, r) {
  if (level.geometry) {
    if (insideWall(level.geometry, x, z, tileAt(level, Math.floor(x), Math.floor(z)) === 'wall')) return true;
    if (wallContacts(level.geometry, x, z, r).length) return true;
  }
  return nearbySolidTiles(level, x, z, r).some(({ col, row }) => tileContact(level, x, z, r, col, row));
}

/**
 * Sweep a circle from (x, z) along unit direction (dx, dz) until it touches a
 * solid tile or travels maxDist. Returns the resting contact position and the
 * surface normal there (normal is null when nothing was hit).
 */
export function castCircle(level, x, z, dx, dz, r, maxDist, step = CONFIG.aim.castStep) {
  let travelled = 0;
  while (travelled < maxDist) {
    const next = Math.min(travelled + step, maxDist);
    if (overlapsSolid(level, x + dx * next, z + dz * next, r)) {
      // Binary-search the exact touching distance between travelled and next.
      let lo = travelled;
      let hi = next;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (overlapsSolid(level, x + dx * mid, z + dz * mid, r)) hi = mid;
        else lo = mid;
      }
      const px = x + dx * lo;
      const pz = z + dz * lo;
      return { x: px, z: pz, dist: lo, normal: contactNormal(level, px, pz, r, dx, dz, hi - lo) };
    }
    travelled = next;
  }
  return { x: x + dx * maxDist, z: z + dz * maxDist, dist: maxDist, normal: null };
}

function contactNormal(level, x, z, r, dx, dz, eps) {
  // Nudge into contact and average the normals of every tile touched, so a
  // shot straight into a concave corner reflects back out of it.
  const px = x + dx * (eps + 1e-4);
  const pz = z + dz * (eps + 1e-4);
  let nx = 0;
  let nz = 0;
  if (level.geometry) {
    for (const c of wallContacts(level.geometry, px, pz, r)) {
      nx += c.nx * c.depth;
      nz += c.nz * c.depth;
    }
  }
  for (const { col, row } of nearbySolidTiles(level, px, pz, r)) {
    const c = tileContact(level, px, pz, r, col, row);
    if (c) {
      // Depth-weighted, so a neighbouring tile's corner barely grazed at a
      // seam doesn't tilt a flat wall's normal.
      nx += c.nx * c.depth;
      nz += c.nz * c.depth;
    }
  }
  const len = Math.hypot(nx, nz);
  return len ? { x: nx / len, z: nz / len } : { x: -dx, z: -dz };
}
