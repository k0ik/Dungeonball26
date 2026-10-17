import * as THREE from 'three';
import { RENDER } from '../config.js';
import { toon, outlineMaterial } from './materials.js';

// Builds the static level: floor tiles, extruded wall boxes, exit pad.
export function buildLevelMesh(level) {
  const group = new THREE.Group();
  const walls = [];
  const floors = [];
  let exit = null;
  for (let row = 0; row < level.height; row++) {
    for (let col = 0; col < level.width; col++) {
      const t = level.tiles[row][col];
      if (t.type === 'wall') walls.push([col, row]);
      else floors.push([col, row]);
      if (t.type === 'exit') exit = [col, row];
    }
  }

  const m = new THREE.Matrix4();
  const color = new THREE.Color();

  // Floor: thin instanced plates in a subtle checkerboard.
  const floorGeo = new THREE.BoxGeometry(1, 0.05, 1);
  floorGeo.translate(0.5, -0.025, 0.5);
  const floorMesh = new THREE.InstancedMesh(floorGeo, toon(0xffffff), floors.length);
  floors.forEach(([col, row], i) => {
    m.makeTranslation(col, 0, row);
    floorMesh.setMatrixAt(i, m);
    floorMesh.setColorAt(i, color.set((col + row) % 2 ? RENDER.colors.floorA : RENDER.colors.floorB));
  });
  group.add(floorMesh);

  // Walls: short boxes, each with an inverted-hull outline.
  const h = RENDER.wallHeight;
  const wallGeo = new THREE.BoxGeometry(1, h, 1);
  wallGeo.translate(0.5, h / 2, 0.5);
  const wallMesh = new THREE.InstancedMesh(wallGeo, toon(RENDER.colors.wall), walls.length);
  const wallOutline = new THREE.InstancedMesh(wallGeo, outlineMaterial, walls.length);
  walls.forEach(([col, row], i) => {
    m.makeTranslation(col, 0, row);
    wallMesh.setMatrixAt(i, m);
    wallOutline.setMatrixAt(i, m);
  });
  group.add(wallMesh, wallOutline);

  // Wall caps: a lighter top face so wall tops read clearly from above.
  const capGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  capGeo.translate(0.5, h + 0.001, 0.5);
  const capMesh = new THREE.InstancedMesh(capGeo, toon(RENDER.colors.wallTop), walls.length);
  walls.forEach(([col, row], i) => {
    m.makeTranslation(col, 0, row);
    capMesh.setMatrixAt(i, m);
  });
  group.add(capMesh);

  if (exit) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.04, 32),
      toon(RENDER.colors.exit, { emissive: RENDER.colors.exit, emissiveIntensity: 0.35 }),
    );
    pad.position.set(exit[0] + 0.5, 0.02, exit[1] + 0.5);
    group.add(pad);
  }

  return group;
}
