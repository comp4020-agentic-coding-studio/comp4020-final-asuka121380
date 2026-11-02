import * as THREE from "three";
import { PLATE } from "../../scene/geometry.ts";
import { Batch, house } from "../../scene/scenery.ts";

// The tabletop's decoration, built in the game's brick language (ADR 0014):
// `Batch` merges everything of one colour into one mesh. Nothing here is a
// game part, a scene or saved work; it is a picture made of bricks.
// `scenery.ts` and `geometry.ts` are pure geometry, so using them starts no
// editor state and changes nothing the game draws.
//
// The story the table tells: two or three people have been building here and
// have just stepped away. Each object is built around its own origin and
// placed by `PLACES`, which has a wide and a narrow arrangement of the same
// table (a phone recomposes the table rather than shrinking it).
//
// Units are studs (8 mm); y = 0 is the table's surface; the visitor sits at +z.

const COURSE = 3 * PLATE;
const GAP = 0.03;

export const PALETTE = {
  red: "#d6261c",
  redDeep: "#b31d14",
  yellow: "#f6c31c",
  orange: "#f08a1c",
  cream: "#f3e9d2",
  white: "#f7f4ee",
  blue: "#2a62b6",
  green: "#3b9a55",
  leaf: "#61b86e",
  trunk: "#7a5235",
  tan: "#dcc49a",
  wood: "#e3cba6",
  woodEdge: "#c9a77b",
  woodLeg: "#b8946a",
  woodSeam: "#d6bb92",
  wall: "#f6efe2",
  floor: "#d9c3a2",
  paper: "#fdfaf3",
  paperShade: "#efe6d2",
  cork: "#d8b07c",
  baseplate: "#4fa860",
  tray: "#ece6da",
  glass: "#bfe0f0",
  ink: "#3a3330",
};

export type ObjectId = "creation" | "parts" | "sign" | "scenes" | "board" | "shelf" | "booklet" | "experiment" | "roofIdeas" | "nameplates";

export interface Place {
  x: number;
  z: number;
  /** A turn about the vertical, in radians (positive turns the object's +z face towards +x). */
  rot?: number;
  /** Drawn larger than life: the narrow arrangement enlarges the working entrance. */
  scale?: number;
}

/**
 * Where each object stands, per arrangement. The table is laid out around
 * three working positions: front-left (the shared parts tray), right (the
 * open booklet and an experiment), and an open front seat with blank
 * nameplates. The house in the middle connects them; the board and shelf
 * stand at the back, turned in towards the house.
 */
export const PLACES: Record<"wide" | "narrow", Record<ObjectId, Place>> = {
  wide: {
    creation: { x: 0, z: -3, rot: -0.14 },
    parts: { x: -9.5, z: 5, rot: 0.32 },
    sign: { x: -14.5, z: 10.5, rot: 0.34 },
    scenes: { x: -17, z: -7, rot: 0.24 },
    board: { x: -8, z: -16, rot: 0.16 },
    shelf: { x: 12.5, z: -15.5, rot: -0.26 },
    booklet: { x: 14, z: 2.5, rot: -0.42 },
    experiment: { x: 6.5, z: 7, rot: 0.5 },
    roofIdeas: { x: 9, z: -6.5, rot: -0.3 },
    nameplates: { x: 2.5, z: 11, rot: -0.06 },
  },
  narrow: {
    creation: { x: 1, z: -2.5, rot: -0.14 },
    parts: { x: -5.5, z: 6.5, rot: 0.32 },
    sign: { x: -4.5, z: 14, rot: 0.12, scale: 1.45 },
    scenes: { x: -10, z: -8, rot: 0.22 },
    board: { x: -5, z: -16.5, rot: 0.12 },
    shelf: { x: 8, z: -16.5, rot: -0.2 },
    booklet: { x: 9.5, z: 5, rot: -0.42 },
    experiment: { x: 9.5, z: 0, rot: 0.5 },
    roofIdeas: { x: 10, z: -8, rot: -0.3 },
    nameplates: { x: 6.5, z: 12.5, rot: -0.06 },
  },
};

export const placeMatrix = (p: Place): THREE.Matrix4 => {
  const s = p.scale ?? 1;
  return new THREE.Matrix4().makeRotationY(p.rot ?? 0).scale(new THREE.Vector3(s, s, s)).setPosition(p.x, 0, p.z);
};

/** A point in an object's own frame, in the table's frame. */
export function at(p: Place, x: number, y: number, z: number): [number, number, number] {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(placeMatrix(p));
  return [v.x, v.y, v.z];
}

/** A direction in an object's own frame (e.g. its face normal), in the table's frame. */
export function dir(p: Place, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot ?? 0).normalize();
}

// ---- brick primitives ---------------------------------------------------------

/** A brick with studs, sitting on y, its footprint's corner at (x, z). */
export function brick(b: Batch, colour: string, x: number, y: number, z: number, w: number, d: number, plates = 3, studs = true, m?: THREE.Matrix4): void {
  b.box(colour, w - GAP, plates * PLATE - GAP, d - GAP, x + w / 2, y, z + d / 2, m);
  if (studs) b.studs(colour, x, x + w, z, z + d, y + plates * PLATE - GAP, m);
}

/** A loose brick centred at (x, z), turned by `rot`; `onSide` tips it over, studs facing sideways. */
function looseBrick(b: Batch, colour: string, x: number, z: number, w: number, d: number, rot: number, plates = 3, y = 0, onSide = false): void {
  const h = plates * PLATE;
  const m = new THREE.Matrix4().makeRotationY(rot);
  if (onSide) {
    // tipped over onto its back face: studs point towards +z; it then lies
    // d tall and h deep, its centre d/2 above the table
    m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition(x, y + d / 2, z);
    brick(b, colour, -w / 2, -h / 2, -d / 2, w, d, plates, true, m);
    return;
  }
  m.setPosition(x, y, z);
  brick(b, colour, -w / 2, 0, -d / 2, w, d, plates, true, m);
}

/** A 45° slope of length `len` along x, falling towards +z from its back edge at z, studs along its back row. */
function slope(b: Batch, colour: string, x: number, y: number, z: number, len: number, depth: number, m?: THREE.Matrix4): void {
  const h = COURSE - GAP;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(depth - GAP, 0);
  s.lineTo(depth - GAP, 0.16);
  s.lineTo(1, h);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len - GAP, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(x + len - GAP / 2, y, z);
  b.add(colour, g, m);
  b.studs(colour, x, x + len, z, z + 1, y + h, m);
}

/** An open tray: a floor, four rims and a rounded lip, centred on (x, z). */
function tray(b: Batch, colour: string, rim: string, x: number, z: number, w: number, d: number, h: number): void {
  b.box(colour, w - 0.5, 0.25, d - 0.5, x, 0, z);
  const t = 0.3;
  for (const [ww, dd, dx, dz] of [[w, t, 0, -d / 2 + t / 2], [w, t, 0, d / 2 - t / 2], [t, d - 2 * t, -w / 2 + t / 2, 0], [t, d - 2 * t, w / 2 - t / 2, 0]] as const) {
    b.box(rim, ww, h, dd, x + dx, 0, z + dz);
  }
  for (const [ww, dd, dx, dz] of [[w + 0.1, 0.42, 0, -d / 2 + 0.15], [w + 0.1, 0.42, 0, d / 2 - 0.15], [0.42, d, -w / 2 + 0.15, 0], [0.42, d, w / 2 - 0.15, 0]] as const) {
    b.box(rim, ww, 0.12, dd, x + dx, h, z + dz);
  }
}

// ---- the room and the table ----------------------------------------------------

/** A pale plaster wall behind the table, and a floor far below: a room, never busy. */
export function room(): Batch {
  const b = new Batch();
  b.box(PALETTE.wall, 300, 140, 1, 0, -70, -30);
  b.box(PALETTE.floor, 300, 1, 220, 0, -46, 60);
  return b;
}

export const TABLE = { w: 56, d: 38 };

/** A thick pale-wood top with softly rounded corners and faint planks, on four legs. */
export function table(): Batch {
  const b = new Batch();
  const { w: W, d: D } = TABLE;
  const r = 2.6;
  const top = new THREE.Shape();
  top.moveTo(-W / 2 + r, -D / 2);
  top.lineTo(W / 2 - r, -D / 2);
  top.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + r);
  top.lineTo(W / 2, D / 2 - r);
  top.quadraticCurveTo(W / 2, D / 2, W / 2 - r, D / 2);
  top.lineTo(-W / 2 + r, D / 2);
  top.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - r);
  top.lineTo(-W / 2, -D / 2 + r);
  top.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + r, -D / 2);
  const slab = new THREE.ExtrudeGeometry(top, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 4, curveSegments: 8 });
  slab.rotateX(Math.PI / 2);
  slab.translate(0, -0.35, 0);
  b.add(PALETTE.wood, slab);
  for (let x = -W / 2 + 7; x < W / 2 - 3; x += 7) b.box(PALETTE.woodSeam, 0.08, 0.02, D - 1.4, x, -0.008, 0);
  b.box(PALETTE.woodEdge, W - 3.4, 3.2, 0.7, 0, -5.4, D / 2 - 1.4);
  for (const side of [-1, 1]) b.box(PALETTE.woodEdge, 0.7, 3.2, D - 3.4, side * (W / 2 - 1.4), -5.4, 0);
  for (const [x, z] of [[-W / 2 + 2.6, -D / 2 + 2.6], [W / 2 - 2.6, -D / 2 + 2.6], [-W / 2 + 2.6, D / 2 - 2.6], [W / 2 - 2.6, D / 2 - 2.6]]) {
    b.box(PALETTE.woodLeg, 2.2, 42, 2.2, x, -44, z);
  }
  return b;
}

// ---- the centre: a house in progress ---------------------------------------------

const BP = { x: -7, z: -6, w: 14, d: 12 };
const Y0 = PLATE * 0.5;
const H = { x: -5, z: -4, w: 9, d: 6 };

/** One course of a wall along x, from x0 to x1 at depth z, skipping `gaps`. */
function wallX(b: Batch, colour: string, x0: number, x1: number, z: number, c: number, gaps: [number, number][] = [], studs = false): void {
  let x = x0;
  let first = true;
  while (x < x1) {
    const gap = gaps.find(([a, e]) => x >= a && x < e);
    if (gap) {
      x = gap[1];
      first = true;
      continue;
    }
    const next = Math.min(x1, ...gaps.filter(([a]) => a > x).map(([a]) => a));
    const len = Math.min(next - x, first && c % 2 ? 2 : 4);
    brick(b, colour, x, Y0 + c * COURSE, z, len, 1, 3, studs);
    x += len;
    first = false;
  }
}

/** One course of a wall along z, from z0 to z1 at x. */
function wallZ(b: Batch, colour: string, z0: number, z1: number, x: number, c: number, gaps: [number, number][] = [], studs = false): void {
  let z = z0;
  let first = true;
  while (z < z1) {
    const gap = gaps.find(([a, e]) => z >= a && z < e);
    if (gap) {
      z = gap[1];
      first = true;
      continue;
    }
    const next = Math.min(z1, ...gaps.filter(([a]) => a > z).map(([a]) => a));
    const len = Math.min(next - z, first && c % 2 === 0 ? 2 : 4);
    brick(b, colour, x, Y0 + c * COURSE, z, 1, len, 3, studs);
    z += len;
    first = false;
  }
}

/** A window frame filling an opening along x, from x over width w: frame, mullion, glass, sill. */
function windowX(b: Batch, x: number, y: number, z: number, w: number, h: number, m?: THREE.Matrix4): void {
  b.box(PALETTE.white, w - GAP, 0.24, 1.2, x + w / 2, y, z + 0.55, m);
  b.box(PALETTE.white, w - GAP, 0.2, 1, x + w / 2, y + h - 0.2, z + 0.5, m);
  for (const dx of [0.1, w - 0.1]) b.box(PALETTE.white, 0.2, h, 1, x + dx, y, z + 0.5, m);
  b.box(PALETTE.white, 0.12, h, 0.3, x + w / 2, y, z + 0.5, m);
  b.box(PALETTE.glass, w - 0.3, h - 0.44, 0.06, x + w / 2, y + 0.24, z + 0.5, m);
}

/**
 * A small house being built by more than one person: cream walls on a white
 * course with a red band, a blue door with a step and a path, two windows,
 * a gable roof whose front slope is laid and whose back is still open, the
 * back-right corner still low, a flowerbed and a little tree. The missing
 * half of the roof is the invitation.
 */
export function creation(): Batch {
  const b = new Batch();
  b.box(PALETTE.baseplate, BP.w - GAP, Y0, BP.d - GAP, BP.x + BP.w / 2, 0, BP.z + BP.d / 2);
  b.studs(PALETTE.baseplate, BP.x, BP.x + BP.w, BP.z, BP.z + BP.d, Y0 - GAP);

  const front = H.z + H.d - 1;
  const back = H.z;
  const left = H.x;
  const right = H.x + H.w - 1;
  const door: [number, number] = [H.x + 2, H.x + 4];
  const winFront: [number, number] = [H.x + 5, H.x + 7];
  const winSide: [number, number] = [H.z + 2, H.z + 4];
  for (let c = 0; c < 5; c++) {
    const colour = c === 0 ? PALETTE.white : c === 1 ? PALETTE.red : PALETTE.cream;
    const top = c === 4;
    const gapsFront: [number, number][] = c < 4 ? [door] : [];
    if (c >= 1 && c <= 3) gapsFront.push(winFront);
    wallX(b, colour, left, right + 1, front, c, gapsFront, top);
    // back wall: full height for the left five studs, only three courses on the right
    if (c <= 2) wallX(b, colour, left, right + 1, back, c, [], c === 2);
    else wallX(b, colour, left, left + 5, back, c, [], top);
    wallZ(b, colour, back + 1, front, left, c, c >= 1 && c <= 3 ? [winSide] : [], top);
    // the right wall is three courses high so far
    if (c <= 2) wallZ(b, colour, back + 1, front, right, c, [], c === 2);
  }
  // lintel over the door and the front window
  brick(b, PALETTE.white, door[0], Y0 + 4 * COURSE - PLATE, front, winFront[1] - door[0], 1, 1, false);
  // the door: a blue leaf in the opening, a yellow knob, a white step
  b.box(PALETTE.blue, door[1] - door[0] - 0.14, 4 * COURSE - PLATE - 0.1, 0.22, (door[0] + door[1]) / 2, Y0, front + 0.58);
  b.box(PALETTE.yellow, 0.22, 0.22, 0.18, door[1] - 0.42, Y0 + 1.9, front + 0.76);
  brick(b, PALETTE.white, door[0] - 0.5, Y0, front + 1, door[1] - door[0] + 1, 1, 1);
  windowX(b, winFront[0], Y0 + COURSE, front, winFront[1] - winFront[0], 3 * COURSE);
  windowX(b, 0, Y0 + COURSE, 0, winSide[1] - winSide[0], 3 * COURSE, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(left + 1, 0, winSide[1]));

  // A gable roof over the full-height part (x from left to left+5), its
  // ridge running along x. The front slope is laid in two courses climbing to the ridge line; the
  // back slope is still open (a proposed slope waits there, see PROPOSED).
  const roofY = Y0 + 5 * COURSE;
  const ridgeZ = back + H.d / 2;
  // a white plate along the wall tops, as the roof's bed
  brick(b, PALETTE.white, left - 0.5, roofY, front - 0.2, 6, 1.2, 1, false);
  brick(b, PALETTE.white, left - 0.5, roofY, back - 0.3, 6, 1.2, 1, false);
  // front slope: two courses stepping up and in towards the ridge
  slope(b, PALETTE.red, left - 0.5, roofY + PLATE, front - 1.1, 6, 2);
  slope(b, PALETTE.red, left - 0.5, roofY + PLATE + COURSE, front - 2.1, 6, 2);
  // the left gable wall rises under the roof line, stepping in course by course
  brick(b, PALETTE.cream, left, roofY, back + 1, 1, H.d - 2, 3, false);
  brick(b, PALETTE.cream, left, roofY + COURSE, ridgeZ - 1.5, 1, 3, 3, false);
  brick(b, PALETTE.cream, left, roofY + 2 * COURSE, ridgeZ - 0.5, 1, 1, 3, true);

  // a flowerbed beside the path, and a path of tan plates to the door
  brick(b, PALETTE.green, H.x + 6, Y0, front + 1.3, 3, 2, 1);
  for (const [fx, fz, col] of [[H.x + 6.6, front + 1.8, PALETTE.yellow], [H.x + 7.5, front + 2.6, PALETTE.red], [H.x + 8.4, front + 1.9, PALETTE.yellow]] as const) {
    const g = new THREE.CylinderGeometry(0.28, 0.28, 0.5, 12);
    g.translate(fx, Y0 + PLATE + 0.25, fz);
    b.add(col, g);
  }
  brick(b, PALETTE.tan, door[0], Y0, front + 2, 2, 2, 1, false);
  brick(b, PALETTE.tan, door[0] - 0.3, Y0, front + 4, 2, 1.6, 1, false);
  // a little tree at the back corner of the plate
  const t = new THREE.CylinderGeometry(0.3, 0.36, 2, 10);
  t.translate(BP.x + BP.w - 1.6, Y0 + 1, BP.z + 1.6);
  b.add(PALETTE.trunk, t);
  brick(b, PALETTE.green, BP.x + BP.w - 2.6, Y0 + 2, BP.z + 0.6, 2, 2);
  brick(b, PALETTE.leaf, BP.x + BP.w - 2.1, Y0 + 2 + COURSE, BP.z + 1.1, 1, 1);
  return b;
}

/**
 * A proposed slope on the roof's open back side, drawn see-through like a
 * plan in the game: in the creation's frame, a slope falling towards −z.
 */
export const PROPOSED = { x: H.x - 0.5, y: Y0 + 5 * COURSE + PLATE, z: H.z + 0.1, len: 6, depth: 2 };

// ---- narrative props around the house -----------------------------------------

/** Two roof experiments compared side by side: a red one like the house's and a taller blue alternative. */
export function roofIdeas(): Batch {
  const b = new Batch();
  for (const [dx, colour] of [[-2.1, PALETTE.red], [2.0, PALETTE.blue]] as const) {
    brick(b, PALETTE.white, dx - 1.6, 0, -1.3, 3.2, 2.6, 1, false);
    slope(b, colour, dx - 1.5, PLATE, -0.6, 3, 2);
  }
  slope(b, PALETTE.blue, 0.5, PLATE + COURSE, -1.3, 3, 2);
  return b;
}

/** A window frame on a plate, waiting to be fitted, beside a little tree someone was trying out. */
export function experiment(): Batch {
  const b = new Batch();
  brick(b, PALETTE.white, -2.5, 0, -1, 4, 2, 1);
  windowX(b, -1.5, PLATE, -0.5, 2, 3 * COURSE);
  const base = new THREE.CylinderGeometry(0.9, 0.9, PLATE, 20);
  base.translate(2.6, PLATE / 2, 0.4);
  b.add(PALETTE.green, base);
  const trunk = new THREE.CylinderGeometry(0.22, 0.26, 1.3, 10);
  trunk.translate(2.6, PLATE + 0.65, 0.4);
  b.add(PALETTE.trunk, trunk);
  brick(b, PALETTE.leaf, 1.6, PLATE + 1.3, -0.6, 2, 2, 3);
  brick(b, PALETTE.green, 2.1, PLATE + 1.3 + COURSE, -0.1, 1, 1, 3);
  return b;
}

/**
 * Loose pieces where people worked, in the table's frame: taken from the
 * tray at the left seat, one set down while trying roofs, and a stacked pair
 * by the booklet. Few, with reasons.
 */
export function loose(layout: "wide" | "narrow"): Batch {
  const b = new Batch();
  if (layout === "wide") {
    looseBrick(b, PALETTE.yellow, -5.2, 8.6, 2, 1, 0.9);
    looseBrick(b, PALETTE.red, -4.0, 10.4, 2, 1, -0.35, 3, 0, true);
    looseBrick(b, PALETTE.white, -6.8, 10.8, 1, 1, 0.4, 1);
    looseBrick(b, PALETTE.red, 11.8, -1.6, 2, 1, -0.7);
    looseBrick(b, PALETTE.blue, 15.2, 8.6, 2, 2, 0.2);
    looseBrick(b, PALETTE.yellow, 15.4, 8.5, 2, 1, 0.55, 3, COURSE);
  } else {
    looseBrick(b, PALETTE.yellow, -0.6, 9.6, 2, 1, 0.9);
    looseBrick(b, PALETTE.red, 1.1, 11.4, 2, 1, -0.35, 3, 0, true);
    looseBrick(b, PALETTE.red, 13.2, -4, 2, 1, -0.7);
    looseBrick(b, PALETTE.blue, 13, 8.8, 2, 2, 0.2);
    looseBrick(b, PALETTE.yellow, 13.2, 8.7, 2, 1, 0.55, 3, COURSE);
  }
  return b;
}

/** The shared parts tray at the left seat: two compartments, sorted loosely. */
export function partsTray(): Batch {
  const b = new Batch();
  tray(b, PALETTE.tray, PALETTE.white, 0, 0, 7, 5, 1.0);
  b.box(PALETTE.white, 0.25, 0.8, 4.4, 0.6, 0, 0);
  looseBrick(b, PALETTE.red, -2.0, -1.2, 2, 1, 0.1, 3, 0.25);
  looseBrick(b, PALETTE.red, -1.5, 0.4, 2, 1, 1.2, 3, 0.25);
  looseBrick(b, PALETTE.cream, -2.2, 1.4, 2, 1, -0.2, 3, 0.25);
  looseBrick(b, PALETTE.yellow, -1.2, -0.3, 1, 1, 0.5, 3, 0.25 + COURSE);
  slope(b, PALETTE.red, 1.1, 0.25, -1.9, 2, 2);
  brick(b, PALETTE.blue, 1.2, 0.25, 0.4, 2, 1, 1);
  brick(b, PALETTE.white, 1.4, 0.25 + PLATE, 0.8, 2, 1, 1);
  return b;
}

// ---- the sign: a nameplate on a small stand ---------------------------------------

/** The sign, in its own frame; its face is a real button drawn on the board (TableScene.tsx). */
export const SIGN = { faceW: 5.6, faceH: 1.9, frameW: 7, frameH: 3.0, postH: 2.0 };
const boardY = PLATE + SIGN.postH;
export const signFaceY = boardY + SIGN.frameH / 2;
/** Just in front of the cream panel, in the sign's frame. */
export const signFaceZ = 0.12;
/** The sign's overall height, for its hit box and touch pad. */
export const signTop = boardY + SIGN.frameH + COURSE;

/**
 * A white base plate, two short yellow posts of stacked 1×1 bricks (the seams
 * show), a red frame of bricks round a cream panel, and a yellow cap brick
 * set slightly off-centre. A nameplate, not a billboard.
 */
export function sign(): Batch {
  const b = new Batch();
  const { frameW, frameH, postH } = SIGN;
  brick(b, PALETTE.white, -3.5, 0, -1, 7, 2, 1);
  // the last piece stops at the frame, never inside it
  for (const dx of [-2.5, 1.5]) for (let y = PLATE; y < boardY - 0.01; y += 2 * PLATE) brick(b, PALETTE.yellow, dx, y, -0.5, 1, 1, Math.min(2, Math.round((boardY - y) / PLATE)), false);
  brick(b, PALETTE.red, -frameW / 2, boardY, -0.5, frameW, 1, 1, false);
  brick(b, PALETTE.red, -frameW / 2, boardY + frameH - PLATE, -0.5, frameW, 1, 1, true);
  for (const dx of [-frameW / 2, frameW / 2 - 0.6]) for (let y = boardY + PLATE; y < boardY + frameH - PLATE - 0.01; y += PLATE * 2) brick(b, PALETTE.red, dx, y, -0.5, 0.6, 1, Math.min(2, (boardY + frameH - PLATE - y) / PLATE), false);
  b.box(PALETTE.cream, frameW - 1.2, frameH - 2 * PLATE, 0.6, 0, boardY + PLATE, -0.2);
  brick(b, PALETTE.yellow, 1, boardY + frameH, -0.5, 2, 1, 3);
  return b;
}

// ---- the scene tray ------------------------------------------------------------

export const SCENE_TRAY = { w: 11, d: 7 };
/** The one occupied slot, at the tray's left; the rest stays clear for later scenes. */
export const BEACH_SLOT = { x: -2.7, z: 0, w: 4.6, d: 5.6 };

/** A wooden tray with room for several scene miniatures; only Beach Houses, the one playable scene, sits in it. */
export function sceneTray(): Batch {
  const b = new Batch();
  const { w, d } = SCENE_TRAY;
  tray(b, PALETTE.woodEdge, PALETTE.wood, 0, 0, w, d, 0.9);
  b.box(PALETTE.cream, BEACH_SLOT.w, 0.1, BEACH_SLOT.d, BEACH_SLOT.x, 0.25, BEACH_SLOT.z);
  return b;
}

/** Beach Houses in miniature: three of the scene's neighbours made with the game's own house builder, facing sand and sea. */
export function beachMiniature(): Batch {
  const raw = new Batch();
  raw.merge(house({ x: 0, z: 0, w: 8, d: 6, storeys: 2, roofKind: "flat", wall: "#f5a3b7", base: "#e98aa1", trim: PALETTE.white, roof: "#c9c3bd", door: "#ff7059", openings: [{ face: "front", at: 1, kind: "door" }, { face: "front", at: 4, kind: "window", wide: true, storey: 1 }, { face: "front", at: 5, kind: "window" }] }));
  raw.merge(house({ x: 9, z: 0, w: 6, d: 6, storeys: 2, wall: "#2fb8ae", base: "#1f8f88", trim: "#ffd23f", roof: PALETTE.white, door: "#ffd23f", openings: [{ face: "front", at: 2, kind: "door" }, { face: "front", at: 2, kind: "window", storey: 1 }] }));
  raw.merge(house({ x: 16, z: 0, w: 6, d: 6, storeys: 1, wall: "#ffd23f", base: "#e4b520", trim: PALETTE.white, roof: "#ff7a5c", door: "#2a6fd1", openings: [{ face: "front", at: 2, kind: "door" }] }));
  raw.box("#f1dcae", 24, 0.6, 7, 11, -0.6, 9.5);
  raw.box("#5fb8d3", 24, 0.5, 3, 11, -0.6, 14.5);
  const s = 0.18;
  const m = new THREE.Matrix4().makeScale(s, s, s);
  m.setPosition(BEACH_SLOT.x - 11 * s, 0.35 + 0.6 * s, BEACH_SLOT.z - 8 * s);
  const out = new Batch();
  for (const { colour, geometry } of raw.build()) out.add(colour, geometry, m);
  return out;
}

// ---- the noticeboard -----------------------------------------------------------

export const BOARD = { w: 9, h: 6, y: 1.7 };
export const boardLabelY = BOARD.y + BOARD.h - 0.8;

/**
 * A blue brick-framed cork board on two feet. Its cards are neutral: a small
 * brick diagram, a lined card and a blank card, never a room or a person.
 */
export function noticeboard(): Batch {
  const b = new Batch();
  const { w, h, y } = BOARD;
  for (const side of [-1, 1]) brick(b, PALETTE.blue, side * (w / 2 - 0.5) - 1, 0, -1.2, 2, 2.4, 1);
  b.box(PALETTE.cork, w, h, 0.4, 0, y, 0);
  for (const side of [-1, 1]) for (let yy = PLATE; yy < y + h; yy += COURSE) b.box(PALETTE.blue, 0.95, Math.min(COURSE, y + h - yy) - GAP, 1, side * (w / 2 + 0.47), yy, 0);
  brick(b, PALETTE.blue, -w / 2 - 1, y + h, -0.5, w + 2, 1, 2, true);
  brick(b, PALETTE.blue, -w / 2 - 1, y - 2 * PLATE, -0.5, w + 2, 1, 2, false);
  b.box(PALETTE.paper, w - 1.4, 1.2, 0.06, 0, boardLabelY - 0.6, 0.23);
  const c1 = new THREE.Matrix4().makeRotationZ(0.06).setPosition(-2.3, y + 1.0, 0.24);
  b.box(PALETTE.paper, 2.8, 2.2, 0.05, 0, 0, 0, c1);
  b.box(PALETTE.red, 1.2, 0.5, 0.03, -0.3, 0.4, 0.04, c1);
  b.box(PALETTE.blue, 0.6, 0.5, 0.03, 0.6, 0.4, 0.04, c1);
  b.box(PALETTE.yellow, 1.8, 0.5, 0.03, 0.15, 1.0, 0.04, c1);
  b.box(PALETTE.red, 0.32, 0.32, 0.22, 0, 1.95, 0.05, c1);
  const c2 = new THREE.Matrix4().makeRotationZ(-0.08).setPosition(1.6, y + 1.3, 0.24);
  b.box(PALETTE.paperShade, 2.4, 1.9, 0.05, 0, 0, 0, c2);
  for (let i = 0; i < 3; i++) b.box("#cdbf9f", 1.6, 0.08, 0.02, 0, 0.5 + i * 0.4, 0.04, c2);
  b.box(PALETTE.yellow, 0.5, 0.28, 0.24, 0, 1.75, 0.05, c2);
  const c3 = new THREE.Matrix4().makeRotationZ(0.12).setPosition(3.3, y + 0.3, 0.24);
  b.box(PALETTE.white, 1.5, 1.1, 0.05, 0, 0, 0, c3);
  b.box(PALETTE.green, 0.26, 0.26, 0.22, 0, 0.95, 0.05, c3);
  return b;
}

// ---- the shelf -----------------------------------------------------------------

export const SHELF = { w: 11 };
export const shelfLabelY = 9.1;

/**
 * A two-tier brick shelf with a few small sample models: a red-roofed
 * cottage, a flower in a pot, and a little boat. Some space stays empty.
 * They are samples, not anybody's saved work.
 */
export function shelf(): Batch {
  const b = new Batch();
  const { w } = SHELF;
  for (const dx of [-w / 2, w / 2 - 1]) for (let y = 0; y < 8.4; y += COURSE) brick(b, PALETTE.red, dx, y, -1, 1, 2, 3, y + COURSE >= 8.4);
  for (const y of [0, 3.6, 7.6]) b.box(PALETTE.white, w - 2, 0.45, 2.3, 0, y, 0);
  b.box(PALETTE.cream, 6.8, 1.3, 0.3, 0, 8.45, 0.75);
  brick(b, PALETTE.white, -3.8, 0.45, -0.6, 3, 2, 3);
  b.box(PALETTE.blue, 0.6, 0.8, 0.06, -2.6, 0.55, 0.42);
  const roof = new THREE.Shape();
  roof.moveTo(-1.7, 0);
  roof.lineTo(1.7, 0);
  roof.lineTo(0, 1.2);
  roof.closePath();
  const rg = new THREE.ExtrudeGeometry(roof, { depth: 2.1, bevelEnabled: false });
  rg.translate(-2.3, 0.45 + COURSE, -0.65);
  b.add(PALETTE.red, rg);
  const pot = new THREE.CylinderGeometry(0.55, 0.42, 0.9, 16);
  pot.translate(2.6, 0.9, 0);
  b.add(PALETTE.orange, pot);
  const stem = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8);
  stem.translate(2.6, 1.85, 0);
  b.add(PALETTE.green, stem);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.SphereGeometry(0.26, 10, 8);
    const a = (i / 5) * Math.PI * 2;
    p.translate(2.6 + Math.cos(a) * 0.3, 2.45, Math.sin(a) * 0.3);
    b.add(PALETTE.yellow, p);
  }
  const hull = new THREE.Shape();
  hull.moveTo(-1.4, 0.5);
  hull.lineTo(1.6, 0.5);
  hull.lineTo(1.1, 0);
  hull.lineTo(-1.1, 0);
  hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 1.1, bevelEnabled: false });
  hg.translate(-2.2, 4.05, -0.55);
  b.add(PALETTE.blue, hg);
  b.box(PALETTE.white, 0.16, 1.4, 0.16, -2.2, 4.55, 0);
  const sail = new THREE.Shape();
  sail.moveTo(0, 0);
  sail.lineTo(0, 1.2);
  sail.lineTo(0.9, 0);
  sail.closePath();
  const sg = new THREE.ExtrudeGeometry(sail, { depth: 0.05, bevelEnabled: false });
  sg.translate(-2.1, 4.75, 0);
  b.add(PALETTE.white, sg);
  return b;
}

// ---- the booklet and the nameplates ---------------------------------------------

export const BOOKLET = { w: 9, d: 6, pageY: 0.46 };

/**
 * An open instruction booklet: two pages on a slight V over a yellow cover,
 * a spine, page edges, a step-number box, and a diagram of bricks stacking.
 */
export function booklet(): Batch {
  const b = new Batch();
  const { w, d } = BOOKLET;
  for (const side of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationZ(side * -0.04).setPosition((side * w) / 4, 0, 0);
    b.box(PALETTE.yellow, w / 2 + 0.15, 0.12, d + 0.3, 0, 0, 0, m);
    b.box(PALETTE.paper, w / 2 - 0.15, 0.3, d, 0, 0.12, 0, m);
    b.box(PALETTE.paperShade, w / 2 - 0.25, 0.04, 0.05, 0, 0.12, d / 2 - 0.02, m);
  }
  b.box(PALETTE.paperShade, 0.2, 0.38, d, 0, 0.06, 0);
  const rp = new THREE.Matrix4().makeRotationZ(0.04).setPosition(w / 4, BOOKLET.pageY, 0);
  b.box(PALETTE.ink, 0.8, 0.02, 0.8, -1.3, 0, -1.9, rp);
  b.box(PALETTE.blue, 2.0, 0.05, 0.9, 0.1, 0, 0.9, rp);
  b.box(PALETTE.red, 1.0, 0.05, 0.9, -0.4, 0, -0.1, rp);
  b.box(PALETTE.red, 1.0, 0.05, 0.9, 0.6, 0, -0.1, rp);
  b.box(PALETTE.yellow, 1.0, 0.05, 0.9, 0.1, 0, -1.1, rp);
  b.box(PALETTE.ink, 0.08, 0.02, 0.9, 1.3, 0, -1.3, rp);
  return b;
}

/** Two blank nameplates at the open front seat, with clear table round them: room for someone else. They name no one. */
export function nameplates(): Batch {
  const b = new Batch();
  for (const [dx, dz, rot, colour] of [[-1.7, 0, 0.06, PALETTE.white], [2.0, 0.5, -0.22, PALETTE.yellow]] as const) {
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(dx, 0, dz);
    b.box(PALETTE.white, 1.4, PLATE, 0.8, 0, 0, 0, m);
    b.box(colour, 3.0, 1.0, 0.26, 0, PLATE, 0.05, m);
  }
  return b;
}

/** For the camera path check: rough boxes round the tall objects, in the table's frame. */
export function obstacles(layout: "wide" | "narrow"): THREE.Box3[] {
  const P = PLACES[layout];
  const box = (p: Place, hw: number, h: number, hd: number) => {
    const pts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(...at(p, sx * hw, 0, sz * hd))));
    return new THREE.Box3().setFromPoints([...pts, new THREE.Vector3(pts[0].x, h * (p.scale ?? 1), pts[0].z)]);
  };
  return [box(P.creation, 7, 9.5, 6), box(P.board, 6, 9.4, 1.4), box(P.shelf, 6, 10, 1.4), box(P.sign, 3.8, signTop + 0.4, 1.2), box(P.experiment, 3.5, 3.8, 1.6), box(P.roofIdeas, 4, 2.8, 1.6)];
}
