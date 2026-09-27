// Builds the static level geometry: the floor, short extruded walls and exit
// tiles. Colours are baked per face (flat, like the mockup) rather than lit.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { tileAt } from '../level.js';
import { outlineLineMaterial } from './materials.js';

const C = CONFIG.colors;

function pushQuad(pos, col, a, b, c, d, color) {
  // Two triangles a-b-c, a-c-d, wound counter-clockwise seen from outside.
  for (const v of [a, b, c, a, c, d]) pos.push(v[0], v[1], v[2]);
  for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
}

const flatMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

function meshFrom(pos, col) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, flatMaterial);
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
      const color = tile === 'exit' ? exitCol : (col + row) % 2 ? floorB : floorA;
      pushQuad(floorPos, floorCol, [col, 0, row + 1], [col + 1, 0, row + 1], [col + 1, 0, row], [col, 0, row], color);
    }
  }
  group.add(meshFrom(floorPos, floorCol));

  // Walls: top face per wall tile, side faces only where the neighbour is open,
  // so the merged outline traces the wall mass instead of every tile.
  const wallPos = [];
  const wallCol = [];
  const top = new THREE.Color(C.wallTop);
  const front = new THREE.Color(C.wallFront); // +z
  const side = new THREE.Color(C.wallSide); // +x
  const back = new THREE.Color(C.wallBack); // -z and -x
  const isWall = (c, r) => {
    const t = tileAt(level, c, r);
    return t === 'wall' || t === 'door';
  };
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
    const walls = meshFrom(wallPos, wallCol);
    group.add(walls);
    if (CONFIG.render.wallOutlines) {
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(walls.geometry, 30), outlineLineMaterial));
    }
  }

  return group;
}
