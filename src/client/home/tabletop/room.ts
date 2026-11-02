import * as THREE from "three";
import { Batch } from "../../scene/scenery.ts";
import { PALETTE } from "./build.ts";

// The room round the table (ADR 0014): a small corner of a sunlit creative
// room, kept quieter than the table. A window in the left wall explains the
// daylight; the back wall stands a little behind the table, with a few
// taped-up sketches; a short wall shelf on the right holds two parts boxes.
// Nothing here is a control or a function. Units are studs; y = 0 is the
// table's surface.

/** The table top: x ±w/2, z from z0 to z0 + d. */
export const TABLE = { w: 66, d: 38, z0: -22, thick: 1.6 };
export const FLOOR_Y = -88;
export const WALL_Z = -28;
/** The left wall's inner face, and the window in it. */
export const SIDE_X = -38;
export const WINDOW = { z0: -22, z1: -2, y0: 9, y1: 40 };

/** The table: a rounded top (drawn by TableScene with its grain), a darker edge band, an apron and four legs. */
export function tableTop(): THREE.BufferGeometry {
  const { w: W, d: D, z0 } = TABLE;
  const r = 2.4;
  const s = new THREE.Shape();
  const x0 = -W / 2;
  const x1 = W / 2;
  const y0 = z0;
  const y1 = z0 + D;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: TABLE.thick - 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.3, bevelSegments: 3, curveSegments: 8 });
  // the shape's y is the table's z; extrude downwards from the surface
  g.rotateX(Math.PI / 2);
  g.translate(0, -0.25, 0);
  return g;
}

export function tableFrame(): Batch {
  const b = new Batch();
  const { w: W, d: D, z0, thick } = TABLE;
  const zc = z0 + D / 2;
  // the apron, set in from the edge so the top's thickness shows
  b.box(PALETTE.woodEdge, W - 5, 3, 0.8, 0, -thick - 3, z0 + D - 2.2);
  b.box(PALETTE.woodEdge, W - 5, 3, 0.8, 0, -thick - 3, z0 + 2.2);
  for (const side of [-1, 1]) b.box(PALETTE.woodEdge, 0.8, 3, D - 5, side * (W / 2 - 2.2), -thick - 3, zc);
  for (const [x, z] of [[-W / 2 + 3, z0 + 3], [W / 2 - 3, z0 + 3], [-W / 2 + 3, z0 + D - 3], [W / 2 - 3, z0 + D - 3]]) {
    b.box(PALETTE.woodLeg, 2.4, -FLOOR_Y - thick, 2.4, x, FLOOR_Y, z);
  }
  return b;
}

/**
 * The walls and floor. The back wall stands a hand's width behind the table,
 * so the table's edge and its shadow show against it; a skirting board runs
 * along the bottom. The left wall has a window opening with a white frame,
 * a deep sill and one small plant.
 */
export function walls(): Batch {
  const b = new Batch();
  const T = 2;
  // back wall and skirting
  b.box(PALETTE.wall, 160, 160, T, 10, FLOOR_Y, WALL_Z - T / 2);
  b.box(PALETTE.wallDeep, 160, 5, 0.6, 10, FLOOR_Y, WALL_Z + 0.3);
  // floor
  b.box(PALETTE.floor, 160, 1, 140, 10, FLOOR_Y - 1, WALL_Z + 70);
  // left wall, built round the window opening
  const W = WINDOW;
  const x = SIDE_X - T / 2;
  const zFar = WALL_Z;
  const zNear = 80;
  b.box(PALETTE.wall, T, W.y0 - FLOOR_Y, zNear - zFar, x, FLOOR_Y, (zFar + zNear) / 2);
  b.box(PALETTE.wall, T, 80 - W.y1, zNear - zFar, x, W.y1, (zFar + zNear) / 2);
  b.box(PALETTE.wall, T, W.y1 - W.y0, W.z0 - zFar, x, W.y0, (zFar + W.z0) / 2);
  b.box(PALETTE.wall, T, W.y1 - W.y0, zNear - W.z1, x, W.y0, (W.z1 + zNear) / 2);
  b.box(PALETTE.wallDeep, 0.6, 5, zNear - zFar, SIDE_X + 0.3, FLOOR_Y, (zFar + zNear) / 2);
  return b;
}

/**
 * The window in the left wall: a white frame, two casements with a transom,
 * a deep sill and one small plant. It casts the frame's soft shadow into the
 * room; the plain walls round it don't, so the table stays in daylight.
 */
export function windowFrame(): Batch {
  const b = new Batch();
  const W = WINDOW;
  // the window: a white frame, two casements with a transom, a deep sill
  const cz = (W.z0 + W.z1) / 2;
  const fw = 0.9;
  for (const z of [W.z0 + fw / 2, W.z1 - fw / 2, cz]) b.box(PALETTE.frame, 1.4, W.y1 - W.y0, z === cz ? 0.6 : fw, SIDE_X - 1, W.y0, z);
  for (const y of [W.y0, W.y1 - fw, W.y0 + (W.y1 - W.y0) * 0.68]) b.box(PALETTE.frame, 1.4, y === W.y0 || y === W.y1 - fw ? fw : 0.6, W.z1 - W.z0, SIDE_X - 1, y, cz);
  b.box(PALETTE.frame, 4.2, 0.9, W.z1 - W.z0 + 3, SIDE_X + 1.1, W.y0 - 0.9, cz);
  // one small plant on the sill: a terracotta pot and a few leaves
  const potZ = W.z1 - 5;
  const potX = SIDE_X + 1.4;
  const pot = new THREE.CylinderGeometry(1.25, 0.95, 2.2, 18);
  pot.translate(potX, W.y0 + 1.1, potZ);
  b.add(PALETTE.pot, pot);
  for (const [dx, dz, s, h] of [[0, 0, 1.3, 2.6], [0.5, 0.8, 1.0, 2.1], [-0.4, -0.7, 0.9, 1.8]] as const) {
    const leaf = new THREE.SphereGeometry(s, 12, 9);
    leaf.scale(1, 1.25, 1);
    leaf.translate(potX + dx, W.y0 + 2.2 + h, potZ + dz);
    b.add(PALETTE.plant, leaf);
  }
  return b;
}

/**
 * A short wall shelf on the right, mostly out of frame, with two lidded
 * parts boxes; one lid sits ajar over a few coloured bricks. Plain and quiet:
 * the creation shelf on the table is where models are shown.
 */
export function storage(): Batch {
  const b = new Batch();
  const y = 8;
  const x0 = 25;
  b.box(PALETTE.cabinetTop, 26, 0.8, 5.5, x0 + 13, y, WALL_Z + 2.75);
  for (const bx of [x0 + 2, x0 + 22]) b.box(PALETTE.cabinet, 0.6, 2.4, 4, bx, y - 2.4, WALL_Z + 2);
  // box one: closed
  b.box(PALETTE.box, 7, 3.4, 4.4, x0 + 5.5, y + 0.8, WALL_Z + 2.8);
  b.box(PALETTE.boxLid, 7.3, 0.5, 4.7, x0 + 5.5, y + 4.2, WALL_Z + 2.8);
  // box two: the lid pushed back and tilted, bricks showing
  b.box(PALETTE.box, 7, 3.4, 4.4, x0 + 14, y + 0.8, WALL_Z + 2.8);
  const lid = new THREE.Matrix4().makeRotationX(-0.38).setPosition(x0 + 14, y + 4.4, WALL_Z + 1.2);
  b.box(PALETTE.boxLid, 7.3, 0.5, 4.7, 0, 0, 0, lid);
  for (const [dx, dz, c] of [[-2, 0.4, PALETTE.red], [-0.3, 1.2, PALETTE.yellow], [1.6, 0.6, PALETTE.blue], [0.4, -0.3, PALETTE.white]] as const) {
    b.box(c, 1.6, 0.8, 0.8, x0 + 14 + dx, y + 3.7, WALL_Z + 2.8 + dz);
  }
  return b;
}

/** Where the sketches hang on the back wall: centre, size and tilt. Their drawings are textures (TableScene). */
export const SKETCHES = [
  { kind: "roof", x: -27, y: 12.5, w: 6.5, h: 5, tilt: 0.05, tape: PALETTE.yellow },
  { kind: "window", x: -19.5, y: 14, w: 5, h: 6, tilt: -0.04, tape: PALETTE.blue },
  { kind: "swatch", x: -22, y: 7.2, w: 5.5, h: 3.4, tilt: 0.07, tape: PALETTE.red },
] as const;

/** The strips of coloured tape at each sketch's top corners. */
export function sketchTape(): Batch {
  const b = new Batch();
  for (const s of SKETCHES) {
    for (const side of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationZ(s.tilt + side * 0.5).setPosition(s.x + side * (s.w / 2 - 0.3), s.y + s.h / 2 - 0.25, WALL_Z + 0.08);
      b.box(s.tape, 1.6, 0.6, 0.06, 0, -0.3, 0, m);
    }
  }
  return b;
}
