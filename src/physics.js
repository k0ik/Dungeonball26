// Custom 2D circle solver on the ground plane (x, z). Rendering is 3D; this is not.
import { PHYSICS } from './config.js';
import { isSolid } from './level.js';

export function createBall({ x, z, radius = PHYSICS.ballDiameter / 2, kind = 'ball' }) {
  return { x, z, vx: 0, vz: 0, radius, kind };
}

export function speedOf(ball) {
  return Math.hypot(ball.vx, ball.vz);
}

export function isAtRest(balls) {
  return balls.every((b) => b.vx === 0 && b.vz === 0);
}

// Advance one fixed step. Returns contact events: { type: 'wall' | 'ball', a, b?, speed }.
export function step(level, balls, dt = PHYSICS.step) {
  const contacts = [];
  for (const ball of balls) {
    applyFriction(ball, dt);
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    collideWalls(level, ball, contacts);
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) collideBalls(balls[i], balls[j], contacts);
  }
  for (const ball of balls) {
    if (speedOf(ball) < PHYSICS.stopThreshold) ball.vx = ball.vz = 0;
  }
  return contacts;
}

function applyFriction(ball, dt) {
  const speed = speedOf(ball);
  if (speed === 0) return;
  const drop = PHYSICS.friction * dt;
  if (speed <= drop) {
    ball.vx = ball.vz = 0;
    return;
  }
  const k = (speed - drop) / speed;
  ball.vx *= k;
  ball.vz *= k;
}

function collideWalls(level, ball, contacts) {
  const r = ball.radius;
  const hits = [];
  for (let row = Math.floor(ball.z - r); row <= Math.floor(ball.z + r); row++) {
    for (let col = Math.floor(ball.x - r); col <= Math.floor(ball.x + r); col++) {
      if (!isSolid(level, col, row)) continue;
      const cx = Math.max(col, Math.min(ball.x, col + 1));
      const cz = Math.max(row, Math.min(ball.z, row + 1));
      const dx = ball.x - cx;
      const dz = ball.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) hits.push({ cx, cz, d2 });
    }
  }
  // Resolve the deepest overlap first so a flat wall made of several tiles acts as one surface.
  hits.sort((a, b) => a.d2 - b.d2);
  for (const { cx, cz } of hits) {
    let dx = ball.x - cx;
    let dz = ball.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist >= r) continue; // already pushed clear by an earlier tile
    let nx, nz;
    if (dist > 1e-9) {
      nx = dx / dist;
      nz = dz / dist;
    } else {
      // Center is exactly on the tile edge; push back against the velocity.
      const s = speedOf(ball) || 1;
      nx = -ball.vx / s;
      nz = -ball.vz / s;
    }
    ball.x += nx * (r - dist);
    ball.z += nz * (r - dist);
    const vn = ball.vx * nx + ball.vz * nz;
    if (vn < 0) {
      ball.vx -= 2 * vn * nx;
      ball.vz -= 2 * vn * nz;
      ball.vx *= PHYSICS.wallRestitution;
      ball.vz *= PHYSICS.wallRestitution;
      contacts.push({ type: 'wall', a: ball, speed: -vn, x: cx, z: cz });
    }
  }
}

function collideBalls(a, b, contacts) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const minDist = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist || d2 === 0) return;
  const dist = Math.sqrt(d2);
  const nx = dx / dist;
  const nz = dz / dist;
  const push = (minDist - dist) / 2;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  // Equal masses: exchange the normal components of velocity, scaled by restitution.
  const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (rel <= 0) return;
  const j = (rel * (1 + PHYSICS.ballRestitution)) / 2;
  a.vx -= j * nx;
  a.vz -= j * nz;
  b.vx += j * nx;
  b.vz += j * nz;
  contacts.push({ type: 'ball', a, b, speed: rel });
}

// Ghost-simulate a shot for the aim preview: the path to the first wall contact,
// plus one reflected segment. Returns { points: [{x,z}], bend: {x,z} | null }.
export function predictPath(level, from, vx, vz, maxTime) {
  const ghost = createBall({ x: from.x, z: from.z, radius: from.radius });
  ghost.vx = vx;
  ghost.vz = vz;
  const points = [{ x: ghost.x, z: ghost.z }];
  let bend = null;
  const steps = Math.ceil(maxTime / PHYSICS.step);
  for (let i = 0; i < steps; i++) {
    const contacts = step(level, [ghost]);
    points.push({ x: ghost.x, z: ghost.z });
    if (contacts.length) {
      if (bend) break; // stop at the second contact
      bend = { x: ghost.x, z: ghost.z };
    }
    if (ghost.vx === 0 && ghost.vz === 0) break;
  }
  return { points, bend };
}
