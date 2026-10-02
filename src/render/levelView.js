// Builds the static level geometry: the floor, short extruded walls and exit
// tiles. Colours are baked per face (flat, like the mockup) rather than lit.
// Doors aren't part of it: doorsView draws them, so they can open.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { tileAt } from '../level.js';
import { loopPolygons } from '../wallGeometry.js';
import { outlineLineMaterial, markOccluder, seeThrough } from './materials.js';

const C = CONFIG.colors;
const W = CONFIG.walls;

function pushQuad(pos, col, a, b, c, d, color) {
  // Two triangles a-b-c, a-c-d, wound counter-clockwise seen from outside.
  for (const v of [a, b, c, a, c, d]) pos.push(v[0], v[1], v[2]);
  for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
}

const flatMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
// See-through where it hides the hero or the aim path. Walls then draw in the
// transparent pass: after the ground marks (aim path, rings) so those show
// through, before the pickup x-ray (renderOrder 10), which needs their depth.
const wallMaterial = seeThrough(markOccluder(new THREE.MeshBasicMaterial({ vertexColors: true })));
const WALL_ORDER = 5;

function meshFrom(pos, col, material = flatMaterial) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, material);
}

/**
 * A rounded level's exit: a green patch on the floor tile with all four
 * corners rounded by the level's curviness (at 5 it's a circle), wherever it
 * stands, in an alcove or in the open. Only the look: the whole tile is
 * still the exit.
 */
const exitMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); // laid flat face-down, so both sides
function roundedExit(level, col, row, color) {
  const r = 0.5 * level.share;
  const s = new THREE.Shape();
  const q = Math.PI / 2;
  s.moveTo(r, 0);
  s.lineTo(1 - r, 0);
  if (r) s.absarc(1 - r, r, r, -q, 0, false);
  s.lineTo(1, 1 - r);
  if (r) s.absarc(1 - r, 1 - r, r, 0, q, false);
  s.lineTo(r, 1);
  if (r) s.absarc(r, 1 - r, r, q, 2 * q, false);
  s.lineTo(0, r);
  if (r) s.absarc(r, r, r, 2 * q, 3 * q, false);
  const geo = new THREE.ShapeGeometry(s, 12).rotateX(Math.PI / 2); // shape y -> world z
  exitMaterial.color.copy(color);
  const mesh = new THREE.Mesh(geo, exitMaterial);
  mesh.position.set(col, 0.002, row);
  return mesh;
}

export function buildLevelView(level) {
  const group = new THREE.Group();
  const h = CONFIG.render.wallHeight;

  // Floor: one merged mesh, checkered by vertex colour. Walls get floor under them
  // too so there are no holes at the level edges.
  const floorPos = [];
  const floorCol = [];
  const floorA = new THREE.Color(C.floorA);
  const floorB = new THREE.Color(C.floorB);
  const exitCol = new THREE.Color(C.exit);
  for (let row = 0; row < level.height; row++) {
    for (let col = 0; col < level.width; col++) {
      const tile = tileAt(level, col, row);
      const color = tile === 'exit' && !level.geometry ? exitCol : (col + row) % 2 ? floorB : floorA;
      pushQuad(floorPos, floorCol, [col, 0, row + 1], [col + 1, 0, row + 1], [col + 1, 0, row], [col, 0, row], color);
      if (tile === 'exit' && level.geometry) group.add(roundedExit(level, col, row, exitCol));
    }
  }
  group.add(meshFrom(floorPos, floorCol));

  if (level.geometry) {
    addOutlineWalls(group, level, h);
    return group;
  }

  // Walls: top face per wall tile, side faces only where the neighbour is open,
  // so the merged outline traces the wall mass instead of every tile.
  const wallPos = [];
  const wallCol = [];
  const top = new THREE.Color(C.wallTop);
  const front = new THREE.Color(C.wallFront); // +z
  const side = new THREE.Color(C.wallSide); // +x
  const back = new THREE.Color(C.wallBack); // -z and -x
  const isWall = (c, r) => tileAt(level, c, r) === 'wall';
  for (let row = 0; row < level.height; row++) {
    for (let col = 0; col < level.width; col++) {
      if (!isWall(col, row)) continue;
      const x0 = col, x1 = col + 1, z0 = row, z1 = row + 1;
      pushQuad(wallPos, wallCol, [x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], top);
      if (!isWall(col, row + 1)) pushQuad(wallPos, wallCol, [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], front);
      if (!isWall(col, row - 1)) pushQuad(wallPos, wallCol, [x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], back);
      if (!isWall(col + 1, row)) pushQuad(wallPos, wallCol, [x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], side);
      if (!isWall(col - 1, row)) pushQuad(wallPos, wallCol, [x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], back);
    }
  }
  if (wallPos.length) {
    const walls = meshFrom(wallPos, wallCol, wallMaterial);
    walls.renderOrder = WALL_ORDER;
    group.add(walls);
    if (CONFIG.render.wallOutlines) {
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(walls.geometry, 30), outlineLineMaterial));
    }
  }

  return group;
}

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** A point just inside the open side of a loop's first piece. */
function floorSample(prim) {
  if (prim.type === 'seg') return { x: (prim.ax + prim.bx) / 2 + prim.nx * 0.01, z: (prim.az + prim.bz) / 2 + prim.nz * 0.01 };
  const d = prim.r + (prim.convex ? 0.01 : -0.01);
  return { x: prim.cx + prim.mx * d, z: prim.cz + prim.mz * d };
}

/**
 * Rounded walls: the outline loops extruded to wall height. Loops that go
 * round a wall mass (positive area in x, z) are shapes; loops that go round
 * open floor are holes in the smallest wall mass around them, or in the
 * level's bounding rectangle when none is. Faces are coloured by which way
 * they face, blending on curves, like the block walls.
 */
function addOutlineWalls(group, level, h) {
  const geom = level.geometry;
  const polys = loopPolygons(geom, (r) => Math.max(W.minChords, Math.ceil(r * W.chordsPerTile)));
  // A tiny fixed wobble on every point: grid-aligned outlines have many
  // exactly collinear points, and the triangulator can leave one sitting on
  // another triangle's long edge (a T-junction), which shows as a dotted
  // crack across the wall tops.
  let seed = 1;
  const wobble = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 4e-4;
  const toPath = (poly, path) => {
    // Shape space (x, -z), so rotating -90° about x stands it on the ground.
    poly.forEach((p, i) => {
      const x = p.x + wobble();
      const y = -p.z + wobble();
      if (i) path.lineTo(x, y);
      else path.moveTo(x, y);
    });
    path.closePath();
    return path;
  };
  const islands = [];
  const floors = [];
  polys.forEach((poly, i) => (signedArea(poly) > 0 ? islands : floors).push({ poly, area: Math.abs(signedArea(poly)), prims: geom.loops[i] }));
  const outer = new THREE.Shape();
  toPath(
    [
      { x: 0, z: 0 },
      { x: level.width, z: 0 },
      { x: level.width, z: level.height },
      { x: 0, z: level.height },
    ],
    outer,
  );
  const shapes = islands.map((isl) => ({ ...isl, shape: toPath(isl.poly, new THREE.Shape()) }));
  for (const f of floors) {
    const p = floorSample(f.prims[0]);
    let host = null;
    for (const s of shapes) if (pointInPolygon(s.poly, p.x, p.z) && (!host || s.area < host.area)) host = s;
    (host ? host.shape : outer).holes.push(toPath(f.poly, new THREE.Path()));
  }
  const geo = new THREE.ExtrudeGeometry([outer, ...shapes.map((s) => s.shape)], { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);

  const top = new THREE.Color(C.wallTop);
  const front = new THREE.Color(C.wallFront); // +z
  const side = new THREE.Color(C.wallSide); // +x
  const back = new THREE.Color(C.wallBack); // -z and -x
  const n = geo.attributes.normal;
  const colors = new Float32Array(n.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i);
    const ny = n.getY(i);
    const nz = n.getZ(i);
    if (Math.abs(ny) > 0.5) {
      c.copy(top);
    } else {
      const wf = Math.max(0, nz);
      const ws = Math.max(0, nx);
      const wb = Math.max(0, -nz) + Math.max(0, -nx);
      const sum = wf + ws + wb || 1;
      c.setRGB((front.r * wf + side.r * ws + back.r * wb) / sum, (front.g * wf + side.g * ws + back.g * wb) / sum, (front.b * wf + side.b * ws + back.b * wb) / sum);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');
  const walls = new THREE.Mesh(geo, wallMaterial);
  walls.renderOrder = WALL_ORDER;
  group.add(walls);
  if (CONFIG.render.wallOutlines) {
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), outlineLineMaterial));
  }
}
