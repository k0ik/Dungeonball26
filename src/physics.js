// Custom 2D circle solver on the ground plane (x, z), fixed timestep.
// Walls are the level's solid tiles, treated as axis-aligned unit boxes.
// Statics are immovable bumpers inside the room (barrels, chests): circles or
// boxes that keep `bumperRestitution` of a ball's speed.

import { CONFIG } from './config.js';
import { isSolid } from './level.js';

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

  for (const b of balls) {
    const speed = speedOf(b);
    if (speed === 0) continue;
    const next = speed - P.friction * dt;
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
    for (const s of world.statics) resolveStatic(world, b, s);
    resolveWalls(world, b);
  }
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
  world.events.push({ type: 'static', ball: b, obj: s, speed: -vn });
}

function resolveBallPair(world, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const minDist = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist) return;

  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 > 0 ? dx / d : 1;
  const nz = d2 > 0 ? dz / d : 0;

  // Equal masses: split the positional correction.
  const push = (minDist - d) / 2;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;

  const approach = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (approach <= 0) return;
  const j = ((1 + P.ballRestitution) * approach) / 2;
  a.vx -= j * nx;
  a.vz -= j * nz;
  b.vx += j * nx;
  b.vz += j * nz;
  world.events.push({ type: 'ball', a, b, speed: approach });
}

/** Closest-point test of a circle against one solid tile. Returns contact or null. */
function tileContact(x, z, r, col, row) {
  const cx = Math.min(Math.max(x, col), col + 1);
  const cz = Math.min(Math.max(z, row), row + 1);
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
    { nx: -1, nz: 0, depth: x - col + r },
    { nx: 1, nz: 0, depth: col + 1 - x + r },
    { nx: 0, nz: -1, depth: z - row + r },
    { nx: 0, nz: 1, depth: row + 1 - z + r },
  ];
  faces.sort((p, q) => p.depth - q.depth);
  return { ...faces[0], d2: 0 };
}

function nearbySolidTiles(level, x, z, r) {
  const tiles = [];
  for (let row = Math.floor(z - r); row <= Math.floor(z + r); row++) {
    for (let col = Math.floor(x - r); col <= Math.floor(x + r); col++) {
      if (isSolid(level, col, row)) tiles.push({ col, row });
    }
  }
  return tiles;
}

function resolveWalls(world, b) {
  const tiles = nearbySolidTiles(world.level, b.x, b.z, b.radius);
  if (!tiles.length) return;
  // Resolve nearest tiles first so a ball sliding along a flat wall is pushed off
  // the face before the neighbouring tile's corner can give it a bogus normal.
  const dist2 = ({ col, row }) => {
    const cx = Math.min(Math.max(b.x, col), col + 1);
    const cz = Math.min(Math.max(b.z, row), row + 1);
    return (b.x - cx) ** 2 + (b.z - cz) ** 2;
  };
  tiles.sort((p, q) => dist2(p) - dist2(q));

  for (const { col, row } of tiles) {
    const c = tileContact(b.x, b.z, b.radius, col, row);
    if (!c) continue;
    b.x += c.nx * c.depth;
    b.z += c.nz * c.depth;
    const vn = b.vx * c.nx + b.vz * c.nz;
    if (vn >= 0) continue;
    // Reflect, then keep a fraction of the total speed ("keeps 90% of speed").
    b.vx = (b.vx - 2 * vn * c.nx) * P.wallRestitution;
    b.vz = (b.vz - 2 * vn * c.nz) * P.wallRestitution;
    world.events.push({ type: 'wall', ball: b, speed: -vn, col, row });
  }
}

/** True if a circle at (x, z) overlaps any solid tile. */
export function overlapsSolid(level, x, z, r) {
  return nearbySolidTiles(level, x, z, r).some(({ col, row }) => tileContact(x, z, r, col, row));
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
  for (const { col, row } of nearbySolidTiles(level, px, pz, r)) {
    const c = tileContact(px, pz, r, col, row);
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
