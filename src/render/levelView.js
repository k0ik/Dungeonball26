// Builds the static level geometry: the floor, short extruded walls and exit
// tiles. Colours are baked per face (flat, like the mockup), then lit only by
// the light pools (lighting.js).
// Doors aren't part of it: doorsView draws them, so they can open.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { tileAt, isHazard } from '../level.js';
import { loopPolygons, insideWall } from '../wallGeometry.js';
import { outlineLineMaterial, markOccluder, seeThrough } from './materials.js';
import { litByPools } from './lighting.js';
import { stoneSurface, cornerShade, setCornerShade } from './textures.js';

const C = CONFIG.colors;
const W = CONFIG.walls;

function pushQuad(pos, col, a, b, c, d, color) {
  // Two triangles a-b-c, a-c-d, wound counter-clockwise seen from outside.
  for (const v of [a, b, c, a, c, d]) pos.push(v[0], v[1], v[2]);
  for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
}

// Flagstones and corner shading (textures.js), lit by the light pools.
const flatMaterial = litByPools(stoneSurface(new THREE.MeshBasicMaterial({ vertexColors: true }), 'floor'));
// See-through where it hides the hero or the aim path. Walls then draw in the
// transparent pass: after the ground marks (aim path, rings) so those show
// through, before the pickup x-ray (renderOrder 10), which needs their depth.
const wallMaterial = litByPools(stoneSurface(seeThrough(markOccluder(new THREE.MeshBasicMaterial({ vertexColors: true }))), 'wall'));
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

// Holes: pits and lava, sunk below the floor. Their walls are unlit vertex
// colours fading down into the dark; lava has a glowing floor (and the
// lighting adds a glow around it).
const holeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const lavaMaterial = new THREE.MeshBasicMaterial({ color: C.lava });
function addHoles(group, level) {
  const R = CONFIG.render;
  const pos = [];
  const col = [];
  const lava = [];
  const lavaCol = [];
  const black = new THREE.Color(0x000000);
  const pitTop = new THREE.Color(C.pitRim);
  const lavaTop = new THREE.Color(C.lavaRim);
  const lavaLow = new THREE.Color(C.lava).multiplyScalar(0.45);
  const wall = (a, b, depth, top, bottom) => {
    // A side from the floor's edge a-b straight down to depth: top colour at the rim.
    for (const v of [[a, 0], [b, 0], [b, -depth], [a, 0], [b, -depth], [a, -depth]]) pos.push(v[0][0], v[1], v[0][1]);
    for (const y of [0, 0, 1, 0, 1, 1]) {
      const c = y ? bottom : top;
      col.push(c.r, c.g, c.b);
    }
  };
  for (let row = 0; row < level.height; row++) {
    for (let c = 0; c < level.width; c++) {
      const t = tileAt(level, c, row);
      if (!isHazard(t)) continue;
      const depth = t === 'lava' ? R.lavaDepth : R.pitDepth;
      const top = t === 'lava' ? lavaTop : pitTop;
      const bottom = t === 'lava' ? lavaLow : black;
      const x0 = c;
      const x1 = c + 1;
      const z0 = row;
      const z1 = row + 1;
      // A side wherever the neighbour isn't the same kind of hole.
      if (tileAt(level, c, row - 1) !== t) wall([x0, z0], [x1, z0], depth, top, bottom);
      if (tileAt(level, c, row + 1) !== t) wall([x1, z1], [x0, z1], depth, top, bottom);
      if (tileAt(level, c - 1, row) !== t) wall([x0, z1], [x0, z0], depth, top, bottom);
      if (tileAt(level, c + 1, row) !== t) wall([x1, z0], [x1, z1], depth, top, bottom);
      const floor = t === 'lava' ? lava : pos;
      const floorC = t === 'lava' ? lavaCol : col;
      for (const v of [[x0, z1], [x1, z1], [x1, z0], [x0, z1], [x1, z0], [x0, z0]]) floor.push(v[0], -depth, v[1]);
      if (t !== 'lava') for (let i = 0; i < 6; i++) floorC.push(0, 0, 0);
    }
  }
  if (pos.length) group.add(meshFrom(pos, col, holeMaterial));
  if (lava.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lava, 3));
    group.add(new THREE.Mesh(geo, lavaMaterial));
  }
}

/**
 * Half-walls: low blocks, one course of stone high (half a wall), coloured
 * and lit like the walls. A side only where the neighbour isn't solid.
 */
function addHalfWalls(group, level) {
  const h = CONFIG.render.wallHeight * CONFIG.render.halfWallShare;
  if (level.geometry) {
    // Rounded: the outline of walls and half-walls together, extruded low,
    // keeping only what's outside the full walls (so its faces don't fight
    // theirs): half-walls round where walls do and blend into the walls they join.
    if (level.solidGeometry !== level.geometry) addOutlineWalls(group, level, h, level.solidGeometry, true);
    return;
  }
  const pos = [];
  const col = [];
  const top = new THREE.Color(C.wallTop);
  const front = new THREE.Color(C.wallFront);
  const side = new THREE.Color(C.wallSide);
  const back = new THREE.Color(C.wallBack);
  const open = (c, r) => !['half', 'wall'].includes(tileAt(level, c, r));
  for (let row = 0; row < level.height; row++) {
    for (let c = 0; c < level.width; c++) {
      if (tileAt(level, c, row) !== 'half') continue;
      const x0 = c, x1 = c + 1, z0 = row, z1 = row + 1;
      pushQuad(pos, col, [x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], top);
      if (open(c, row + 1)) pushQuad(pos, col, [x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], front);
      if (open(c, row - 1)) pushQuad(pos, col, [x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], back);
      if (open(c + 1, row)) pushQuad(pos, col, [x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], side);
      if (open(c - 1, row)) pushQuad(pos, col, [x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], back);
    }
  }
  if (!pos.length) return;
  const mesh = meshFrom(pos, col, wallMaterial);
  mesh.renderOrder = WALL_ORDER;
  group.add(mesh);
  if (CONFIG.render.wallOutlines) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), outlineLineMaterial));
}

/** A divot (a shaded dish) or a bump (a lit mound) drawn on its floor tile. */
let slopeTextures = null;
function slopeDecal(kind, col, row) {
  if (!slopeTextures) {
    const make = (draw) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      draw(c.getContext('2d'));
      return new THREE.CanvasTexture(c);
    };
    slopeTextures = {
      // Dark in the middle, lit on the far rim: a dip.
      divot: make((g) => {
        const grad = g.createRadialGradient(64, 58, 4, 64, 64, 62);
        grad.addColorStop(0, 'rgba(0,0,0,0.55)');
        grad.addColorStop(0.75, 'rgba(0,0,0,0.18)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(64, 64, 52, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
      }),
      // Lit on top, shadowed round its base: a rise.
      bump: make((g) => {
        const grad = g.createRadialGradient(60, 56, 2, 64, 64, 62);
        grad.addColorStop(0, 'rgba(255,255,255,0.4)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.1)');
        grad.addColorStop(0.85, 'rgba(0,0,0,0.25)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
      }),
    };
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: slopeTextures[kind], transparent: true, depthWrite: false }),
  );
  mesh.position.set(col + 0.5, 0.004, row + 0.5);
  mesh.renderOrder = 1;
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
      if (isHazard(tile)) continue; // a hole: drawn by addHoles
      const color = tile === 'exit' && !level.geometry ? exitCol : (col + row) % 2 ? floorB : floorA;
      pushQuad(floorPos, floorCol, [col, 0, row + 1], [col + 1, 0, row + 1], [col + 1, 0, row], [col, 0, row], color);
      if (tile === 'divot' || tile === 'bump') group.add(slopeDecal(tile, col, row));
      if (tile === 'exit' && level.geometry) group.add(roundedExit(level, col, row, exitCol));
    }
  }
  group.add(meshFrom(floorPos, floorCol));
  addHoles(group, level);
  addHalfWalls(group, level);

  if (level.geometry) {
    const polys = addOutlineWalls(group, level, h);
    setCornerShade(cornerShade(level, polys));
    return group;
  }
  setCornerShade(cornerShade(level));

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

/** A polygon with a point added wherever an edge crosses a tile line. */
function splitAtTileLines(poly) {
  const out = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    out.push(a);
    const ts = [];
    for (const [p, q] of [[a.x, b.x], [a.z, b.z]]) {
      for (let k = Math.floor(Math.min(p, q)) + 1; k < Math.max(p, q); k++) {
        const t = (k - p) / (q - p);
        if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
      }
    }
    ts.sort((u, v) => u - v).forEach((t) => out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }));
  });
  return out;
}

/**
 * Remove the side faces of an extruded outline that run along a full wall's
 * own face (judged once per face, from the middle of its edge, so a face is
 * never left half drawn). Caps stay: inside a full wall they're hidden.
 */
function dropInsideWalls(geo, level) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const keep = [];
  for (let i = 0; i < pos.count; i += 3) {
    const nx = nrm.getX(i);
    const nz = nrm.getZ(i);
    if (Math.abs(nrm.getY(i)) >= 0.5) {
      keep.push(i, i + 1, i + 2);
      continue;
    }
    // Both triangles of a side face span the same edge: its middle is the
    // middle of their x and z extents.
    const xs = [pos.getX(i), pos.getX(i + 1), pos.getX(i + 2)];
    const zs = [pos.getZ(i), pos.getZ(i + 1), pos.getZ(i + 2)];
    const len = Math.hypot(nx, nz) || 1;
    const x = (Math.min(...xs) + Math.max(...xs)) / 2 - (nx / len) * 0.03;
    const z = (Math.min(...zs) + Math.max(...zs)) / 2 - (nz / len) * 0.03;
    if (!insideWall(level.geometry, x, z, tileAt(level, Math.floor(x), Math.floor(z)) === 'wall')) keep.push(i, i + 1, i + 2);
  }
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    const out = new Float32Array(keep.length * a.itemSize);
    keep.forEach((v, j) => {
      for (let k = 0; k < a.itemSize; k++) out[j * a.itemSize + k] = a.array[v * a.itemSize + k];
    });
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  geo.clearGroups();
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
function addOutlineWalls(group, level, h, geom = level.geometry, outsideWalls = false) {
  let polys = loopPolygons(geom, (r) => Math.max(W.minChords, Math.ceil(r * W.chordsPerTile)));
  // Half-walls: split every edge at tile lines, so each side face lies along
  // a single tile and is either all along a full wall (dropped) or not.
  if (outsideWalls) polys = polys.map(splitAtTileLines);
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
  if (outsideWalls) dropInsideWalls(geo, level);

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
  return polys;
}
