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
// table (a phone recomposes the table rather than shrinking it). The room
// round the table is in room.ts.
//
// Units are studs (8 mm); y = 0 is the table's surface; the visitor sits at +z.

export const COURSE = 3 * PLATE;
const GAP = 0.03;

export const PALETTE = {
  red: "#d42a20",
  yellow: "#f5c01f",
  orange: "#e8833a",
  cream: "#f4ead3",
  white: "#f1efe9",
  blue: "#2b63b8",
  /** the house's walls: a pale blue, so white trim and the red roof read against them */
  houseWall: "#a3c2e4",
  green: "#3b9a55",
  leaf: "#68b96f",
  trunk: "#7a5235",
  tan: "#d9bf92",
  grey: "#a3a7ad",
  greyDark: "#80858c",
  baseplate: "#4ea85e",
  glass: "#bfe0f0",
  // matte things: wood, paper, plaster (TableScene gives them no sheen)
  woodEdge: "#c48f58",
  woodLeg: "#b07f4c",
  woodTray: "#ddb07a",
  woodTrayRim: "#c99862",
  wall: "#e7e6e2",
  wallDeep: "#d9d6cf",
  floor: "#bba791",
  frame: "#f3f2ee",
  cabinet: "#e1ded7",
  cabinetTop: "#cfc4b4",
  pot: "#c47650",
  plant: "#5f9e5e",
  paper: "#fcfaf4",
  paperEdge: "#dcd3c1",
  cork: "#d2a873",
  envelope: "#d8433a",
  envelopeFlap: "#c2372f",
  ink: "#2b2622",
  // plastic, but quiet: storage boxes in the background
  box: "#cfd9e2",
  boxLid: "#b8c8d6",
};

/** Colours drawn without plastic's sheen: wood, paper, plaster, terracotta. */
export const MATTE = new Set<string>([
  PALETTE.woodEdge,
  PALETTE.woodLeg,
  PALETTE.woodTray,
  PALETTE.woodTrayRim,
  PALETTE.wall,
  PALETTE.wallDeep,
  PALETTE.floor,
  PALETTE.frame,
  PALETTE.cabinet,
  PALETTE.cabinetTop,
  PALETTE.pot,
  PALETTE.plant,
  PALETTE.paper,
  PALETTE.paperEdge,
  PALETTE.cork,
  PALETTE.envelope,
  PALETTE.envelopeFlap,
]);

export type ObjectId = "creation" | "parts" | "sign" | "scenes" | "board" | "shelf" | "booklet" | "roofIdeas" | "nameplate" | "friends";

export interface Place {
  x: number;
  z: number;
  /** A turn about the vertical, in radians (positive turns the object's +z face towards +x). */
  rot?: number;
  /** Drawn larger than life: the narrow arrangement enlarges the working entrance. */
  scale?: number;
}

/**
 * Where each object stands, per arrangement. Three working places share the
 * table: the left seat works from the parts tray towards the house, with the
 * booklet open towards it; the right-hand side has roof samples beside the
 * house's open roof; the front seat is free, with a blank nameplate. The sign
 * stands at the front right corner, so its focused view looks across open
 * table towards the quiet end of the room. The house in the middle is
 * everyone's; the board, shelf and scene tray stand back, turned in.
 */
export const PLACES: Record<"wide" | "narrow", Record<ObjectId, Place>> = {
  wide: {
    creation: { x: 2.5, z: -5, rot: -0.5 },
    parts: { x: -11, z: 4.5, rot: 0.28 },
    sign: { x: 19.5, z: 11, rot: -0.14 },
    scenes: { x: -21, z: -8.5, rot: 0.36 },
    board: { x: -15, z: -19.5, rot: 0.22 },
    shelf: { x: 12, z: -17.5, rot: -0.26 },
    booklet: { x: -19.5, z: 12.5, rot: 0.28 },
    roofIdeas: { x: 11, z: -8, rot: -0.35 },
    nameplate: { x: 26.2, z: 9.6, rot: -0.3 },
    friends: { x: -27, z: 3.5, rot: 0.5 },
  },
  narrow: {
    creation: { x: 3, z: -3.5, rot: -0.5 },
    parts: { x: -12.5, z: 10, rot: 0.3 },
    sign: { x: 5.5, z: 13.4, rot: -0.3, scale: 1.45 },
    scenes: { x: -9.5, z: -7.5, rot: 0.22 },
    board: { x: -7.5, z: -19.5, rot: 0.16 },
    shelf: { x: 8.5, z: -18.5, rot: -0.22 },
    booklet: { x: 11.5, z: 5.5, rot: 0.2 },
    roofIdeas: { x: 11.5, z: -7, rot: -0.3 },
    nameplate: { x: 14.2, z: 11.2, rot: -0.4 },
    friends: { x: -4.5, z: 6.5, rot: 0.25 },
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

const turn = (rot: number, x: number, y: number, z: number) => new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);

// ---- brick primitives ---------------------------------------------------------

/** A brick with studs, sitting on y, its footprint's corner at (x, z). */
export function brick(b: Batch, colour: string, x: number, y: number, z: number, w: number, d: number, plates = 3, studs = true, m?: THREE.Matrix4): void {
  b.box(colour, w - GAP, plates * PLATE - GAP, d - GAP, x + w / 2, y, z + d / 2, m);
  if (studs) b.studs(colour, x, x + w, z, z + d, y + plates * PLATE - GAP, m);
}

/** A round 2×2 brick (a lighthouse course, a pot): a cylinder with four studs. */
function roundBrick(b: Batch, colour: string, x: number, y: number, z: number, r: number, plates = 3, studs = true): void {
  const g = new THREE.CylinderGeometry(r, r, plates * PLATE - GAP, 20);
  g.translate(x, y + (plates * PLATE - GAP) / 2, z);
  b.add(colour, g);
  if (studs) b.studs(colour, x - 1, x + 1, z - 1, z + 1, y + plates * PLATE - GAP);
}

/** A loose brick centred at (x, z), turned by `rot`; `onSide` tips it over, studs facing sideways. */
function looseBrick(b: Batch, colour: string, x: number, z: number, w: number, d: number, rot: number, plates = 3, y = 0, onSide = false): void {
  const h = plates * PLATE;
  const m = new THREE.Matrix4().makeRotationY(rot);
  if (onSide) {
    m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition(x, y + d / 2, z);
    brick(b, colour, -w / 2, -h / 2, -d / 2, w, d, plates, true, m);
    return;
  }
  m.setPosition(x, y, z);
  brick(b, colour, -w / 2, 0, -d / 2, w, d, plates, true, m);
}

/**
 * A 45° roof slope in its own frame: `len` studs along +x, falling towards
 * +z over `depth` studs from its high back edge at z = 0, with a row of
 * studs on the flat strip along the back. `m` places it.
 */
function slopeAt(b: Batch, colour: string, len: number, depth: number, m: THREE.Matrix4, studs = true): void {
  const h = COURSE - GAP;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(depth - GAP, 0);
  s.lineTo(depth - GAP, 0.16);
  s.lineTo(1, h);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len - GAP, bevelEnabled: false });
  // the shape's x (the fall) becomes +z; the extrusion runs along x
  g.rotateY(-Math.PI / 2);
  g.translate(len - GAP / 2, 0, GAP / 2);
  b.add(colour, g, m);
  if (studs) b.studs(colour, 0, len, 0, 1, h, m);
}

/** A slope running along x at (x, y, z), falling towards +z. */
function slope(b: Batch, colour: string, x: number, y: number, z: number, len: number, depth: number, m?: THREE.Matrix4): void {
  const t = new THREE.Matrix4().makeTranslation(x, y, z);
  slopeAt(b, colour, len, depth, m ? m.clone().multiply(t) : t);
}

/**
 * A roof slope running along z from z0 to z1, its high (inner) edge at
 * x = `inner`, falling outwards: towards −x on the left side, +x on the right.
 */
function roofRow(b: Batch, colour: string, side: -1 | 1, inner: number, y: number, z0: number, z1: number, studs: boolean, m?: THREE.Matrix4): void {
  // turned −90° the slope runs along +z and falls to −x; turned +90° it runs along −z and falls to +x
  const local = side < 0 ? turn(-Math.PI / 2, inner, y, z0) : turn(Math.PI / 2, inner, y, z1);
  slopeAt(b, colour, z1 - z0, 2, m ? m.clone().multiply(local) : local, studs);
}

/** An open tray: a floor, four walls and a rounded-over lip, centred on (x, z). */
function tray(b: Batch, floor: string, rim: string, x: number, z: number, w: number, d: number, h: number, m?: THREE.Matrix4): void {
  b.box(floor, w - 0.5, 0.3, d - 0.5, x, 0, z, m);
  const t = 0.42;
  for (const [ww, dd, dx, dz] of [[w, t, 0, -d / 2 + t / 2], [w, t, 0, d / 2 - t / 2], [t, d - 2 * t, -w / 2 + t / 2, 0], [t, d - 2 * t, w / 2 - t / 2, 0]] as const) {
    b.box(rim, ww, h, dd, x + dx, 0, z + dz, m);
  }
  // the lip: a slightly wider band round the top edge
  for (const [ww, dd, dx, dz] of [[w + 0.14, 0.56, 0, -d / 2 + 0.21], [w + 0.14, 0.56, 0, d / 2 - 0.21], [0.56, d - 0.84, -w / 2 + 0.21, 0], [0.56, d - 0.84, w / 2 - 0.21, 0]] as const) {
    b.box(rim, ww, 0.14, dd, x + dx, h - 0.04, z + dz, m);
  }
}

/** A window frame filling an opening along x, from x over width w: frame, mullion, glass, sill. */
function windowX(b: Batch, x: number, y: number, z: number, w: number, h: number, m?: THREE.Matrix4): void {
  b.box(PALETTE.white, w + 0.2, 0.24, 1.3, x + w / 2, y, z + 0.6, m);
  b.box(PALETTE.white, w - GAP, 0.2, 1, x + w / 2, y + h - 0.2, z + 0.5, m);
  for (const dx of [0.1, w - 0.1]) b.box(PALETTE.white, 0.2, h, 1, x + dx, y, z + 0.5, m);
  b.box(PALETTE.white, 0.12, h, 0.3, x + w / 2, y, z + 0.5, m);
  b.box(PALETTE.white, w - 0.3, 0.1, 0.3, x + w / 2, y + h / 2, z + 0.5, m);
  b.box(PALETTE.glass, w - 0.3, h - 0.44, 0.06, x + w / 2, y + 0.24, z + 0.5, m);
}

/** A little tree: a round trunk and stacked green bricks. */
function tree(b: Batch, x: number, y: number, z: number, scale = 1): void {
  const t = new THREE.CylinderGeometry(0.3 * scale, 0.36 * scale, 2 * scale, 10);
  t.translate(x, y + scale, z);
  b.add(PALETTE.trunk, t);
  brick(b, PALETTE.green, x - 1.5 * scale, y + 2 * scale, z - 1.5 * scale, 3 * scale, 3 * scale, 3, false);
  brick(b, PALETTE.leaf, x - 1 * scale, y + 2 * scale + COURSE, z - 1 * scale, 2 * scale, 2 * scale, 3, true);
}

// ---- the centre: a house in progress ---------------------------------------------

const Y0 = PLATE * 0.5;
export const BASEPLATE = { w: 16, d: 14 };
/** Walls at x = ±4; the front wall's face at z = 3, the back wall's at z = −4. */
const HW = 4;
const FRONT = 3;
const BACK = -4;
const ROOF_Y = Y0 + 5 * COURSE;
/** The roof's slopes overhang the gables by a stud at each end. */
const EAVE = { z0: BACK - 1, z1: FRONT + 1 };
const SEGMENTS: [number, number][] = [
  [EAVE.z0, EAVE.z0 + 3],
  [EAVE.z0 + 3, EAVE.z0 + 6],
  [EAVE.z0 + 6, EAVE.z1],
];

/**
 * One course of wall along an axis, skipping openings. Bricks are 2 and 4
 * long, staggered course by course; corner bricks on alternate courses are
 * white, like quoins.
 */
function wallRun(b: Batch, axis: "x" | "z", from: number, to: number, at: number, c: number, gaps: [number, number][], colour: (corner: boolean) => string): void {
  let p = from;
  let first = true;
  while (p < to) {
    const gap = gaps.find(([a, e]) => p >= a && p < e);
    if (gap) {
      p = gap[1];
      first = true;
      continue;
    }
    const next = Math.min(to, ...gaps.filter(([a]) => a > p).map(([a]) => a));
    const len = Math.min(next - p, first && c % 2 ? 1 : 2);
    const corner = (p === from || p + len === to) && c % 2 === 1;
    const col = colour(corner);
    if (axis === "x") brick(b, col, p, Y0 + c * COURSE, at, len, 1, 3, false);
    else brick(b, col, at, Y0 + c * COURSE, p, 1, len, 3, false);
    p += len;
    first = false;
  }
}

/**
 * A small house being built by more than one person. A grey foundation,
 * pale blue walls with white corners, a blue door and white windows, and a
 * stepped red roof on two gable walls. The left slope is finished to the
 * top; the right side is the one being worked on: two rows down, the next
 * drawn as a plan, and the stepped gables standing ready to carry the rest. The right wall's window opening is still empty: its window
 * stands ready on the baseplate beside it.
 */
export function creation(): Batch {
  const b = new Batch();
  const bx = BASEPLATE.w / 2;
  const bz = BASEPLATE.d / 2;
  b.box(PALETTE.baseplate, BASEPLATE.w - GAP, Y0, BASEPLATE.d - GAP, 0, 0, 0);
  b.studs(PALETTE.baseplate, -bx, bx, -bz, bz, Y0 - GAP);

  const door: [number, number] = [-3, -1];
  const winFront: [number, number] = [1, 3];
  const winSide: [number, number] = [-2, 0];
  for (let c = 0; c < 5; c++) {
    const colour = (corner: boolean) => (c === 0 ? PALETTE.grey : corner ? PALETTE.white : PALETTE.houseWall);
    const front: [number, number][] = [];
    if (c >= 1 && c <= 3) front.push(door);
    if (c >= 2 && c <= 3) front.push(winFront);
    const side: [number, number][] = c >= 2 && c <= 3 ? [winSide] : [];
    wallRun(b, "x", -HW, HW, FRONT - 1, c, front, colour);
    wallRun(b, "x", -HW, HW, BACK, c, [], colour);
    wallRun(b, "z", BACK + 1, FRONT - 1, -HW, c, side, colour);
    wallRun(b, "z", BACK + 1, FRONT - 1, HW - 1, c, side, colour);
  }
  // white lintels over the openings, flush with the wall
  b.box(PALETTE.white, 2.4, 0.22, 1.02, (door[0] + door[1]) / 2, Y0 + 4 * COURSE - 0.22, FRONT - 0.5);
  b.box(PALETTE.white, 2.4, 0.22, 1.02, (winFront[0] + winFront[1]) / 2, Y0 + 4 * COURSE - 0.22, FRONT - 0.5);
  // the door: a blue leaf in the opening, a yellow knob, two white steps
  b.box(PALETTE.blue, door[1] - door[0] - 0.14, 3 * COURSE - 0.24, 0.24, (door[0] + door[1]) / 2, Y0 + COURSE, FRONT - 0.42);
  b.box(PALETTE.yellow, 0.22, 0.22, 0.18, door[1] - 0.45, Y0 + COURSE + 1.6, FRONT - 0.24);
  brick(b, PALETTE.white, door[0] - 0.5, Y0, FRONT, door[1] - door[0] + 1, 1, 2);
  brick(b, PALETTE.white, door[0] - 0.5, Y0, FRONT + 1, door[1] - door[0] + 1, 1, 1);
  windowX(b, winFront[0], Y0 + 2 * COURSE, FRONT - 1, 2, 2 * COURSE);
  // the left wall's window; the right wall's opening waits for its window
  // turned so its sill faces out of the house (−x)
  windowX(b, 0, Y0 + 2 * COURSE, 0, 2, 2 * COURSE, turn(-Math.PI / 2, -HW + 1, 0, winSide[0]));

  // gables: front and back walls rise in steps under the roof line
  for (const z of [FRONT - 1, BACK]) {
    for (let j = 0; j < 3; j++) {
      for (let x = -3 + j; x < 3 - j; x += 2) brick(b, PALETTE.houseWall, x, ROOF_Y + j * COURSE, z, Math.min(2, 3 - j - x), 1, 3, false);
    }
  }
  // a round white vent in the front gable
  const vent = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 18);
  vent.rotateX(Math.PI / 2);
  vent.translate(0, ROOF_Y + COURSE * 1.5, FRONT + 0.06);
  b.add(PALETTE.white, vent);

  // the roof: rows of 45° slopes stepping in one stud per course, each row
  // laid end to end along the whole house, so a side reads as one plane
  const row = (side: -1 | 1, k: number, seg: number, studs: boolean) => roofRow(b, PALETTE.red, side, side * (HW - 1 - k), ROOF_Y + k * COURSE, SEGMENTS[seg][0], SEGMENTS[seg][1], studs);
  // left: finished to the top, its last row's studs along the ridge line
  for (let k = 0; k < 4; k++) for (let s = 0; s < 3; s++) row(-1, k, s, k === 3);
  // right: the construction side. Two full rows are down, studs up for the
  // next; above them the stepped gables stand ready to carry it
  for (let k = 0; k < 2; k++) for (let s = 0; s < 3; s++) row(1, k, s, k === 1);
  // a grey chimney through the finished slope
  for (let i = 0; i < 4; i++) brick(b, i % 2 ? PALETTE.greyDark : PALETTE.grey, -2.8, ROOF_Y + COURSE + i * COURSE, -3.3, 1, 1.2, 3, i === 3);

  // the right wall's window, on a plate beside the opening, ready to fit
  brick(b, PALETTE.white, HW + 1.5, Y0, -3, 1, 4, 1, false);
  windowX(b, 0, Y0 + PLATE, 0, 2, 2 * COURSE, turn(Math.PI / 2, HW + 1.5, 0, 0));
  // two wall bricks set down beside it
  brick(b, PALETTE.houseWall, HW + 3, Y0, 1.5, 1, 2, 3, true);
  brick(b, PALETTE.houseWall, HW + 3, Y0 + COURSE, 1.5, 1, 2, 3, true);

  // a path to the door, a flowerbed, a tree at the back
  brick(b, PALETTE.tan, door[0], Y0, FRONT + 2, 2, 2, 1, false);
  brick(b, PALETTE.green, 0.5, Y0, FRONT + 1.5, 3, 2, 1);
  for (const [fx, fz, col] of [[1.1, FRONT + 2.0, PALETTE.yellow], [2.0, FRONT + 2.9, PALETTE.red], [2.9, FRONT + 2.1, PALETTE.yellow]] as const) {
    const g = new THREE.CylinderGeometry(0.28, 0.28, 0.5, 12);
    g.translate(fx, Y0 + PLATE + 0.25, fz);
    b.add(col, g);
  }
  tree(b, -bx + 2, Y0, -bz + 2);
  return b;
}

/** The proposed slope: the next piece of the right roof, see-through like a plan in the game. */
export function proposedSlope(): THREE.BufferGeometry {
  const b = new Batch();
  roofRow(b, "plan", 1, HW - 3, ROOF_Y + 2 * COURSE, SEGMENTS[0][0], SEGMENTS[0][1], false);
  return b.build()[0].geometry;
}

// ---- around the house ----------------------------------------------------------

/** Two roof samples on plates: a red one like the house's, and a lower blue alternative. */
export function roofIdeas(): Batch {
  const b = new Batch();
  // red: a little gable of two rows meeting at a ridge
  brick(b, PALETTE.white, -4.2, 0, -1.5, 4, 3, 1, false);
  roofRow(b, PALETTE.red, -1, -2.2, PLATE, -1.5, 1.5, false);
  roofRow(b, PALETTE.red, 1, -2.2, PLATE, -1.5, 1.5, false);
  // blue: a single long slope leaning on a brick
  const m = turn(0.25, 2.6, 0, 0.4);
  brick(b, PALETTE.white, -1.4, 0, -1.2, 3, 2.4, 1, false, m);
  slope(b, PALETTE.blue, -1.4, PLATE, -1.2, 3, 2, m);
  return b;
}

/**
 * Loose pieces where people worked, in the table's frame: taken from the
 * tray towards the house, a slope set down near the roof samples, and a
 * pair stacked by the booklet. Few, each with a reason.
 */
export function loose(layout: "wide" | "narrow"): Batch {
  const b = new Batch();
  const list: [string, number, number, number, number, number, number?, number?, boolean?][] =
    layout === "wide"
      ? [
          [PALETTE.houseWall, -5.8, 8.4, 1, 2, 0.9],
          [PALETTE.houseWall, -4.3, 9.6, 1, 2, -0.3, 3, 0, true],
          [PALETTE.white, -7.4, 10.4, 1, 1, 0.4, 1],
          [PALETTE.red, 13.4, -2.6, 2, 1, -0.7],
          [PALETTE.blue, -13.2, 12.6, 2, 2, 0.2],
          [PALETTE.yellow, -13, 12.5, 2, 1, 0.55, 3, COURSE],
        ]
      : [
          [PALETTE.houseWall, 0.2, 9.8, 1, 2, 0.9],
          [PALETTE.houseWall, 1.8, 10.9, 1, 2, -0.3, 3, 0, true],
          [PALETTE.red, 13.4, -1.5, 2, 1, -0.7],
          [PALETTE.blue, 14.5, 8.6, 2, 2, 0.2],
          [PALETTE.yellow, 14.7, 8.5, 2, 1, 0.55, 3, COURSE],
        ];
  for (const [colour, x, z, w, d, rot, plates, y, onSide] of list) looseBrick(b, colour, x, z, w, d, rot, plates ?? 3, y ?? 0, onSide ?? false);
  return b;
}

/** The shared parts tray: wood, two compartments, sorted loosely: wall bricks, slopes, odds. */
export function partsTray(): Batch {
  const b = new Batch();
  tray(b, PALETTE.woodTray, PALETTE.woodTrayRim, 0, 0, 8, 5.4, 1.1);
  b.box(PALETTE.woodTrayRim, 0.36, 0.9, 4.6, 1, 0, 0);
  const f = 0.3;
  looseBrick(b, PALETTE.houseWall, -2.5, -1.3, 1, 2, 0.1, 3, f);
  looseBrick(b, PALETTE.houseWall, -1.3, -1.1, 1, 2, -0.15, 3, f);
  looseBrick(b, PALETTE.houseWall, -2.0, 1.0, 1, 2, 1.3, 3, f);
  looseBrick(b, PALETTE.white, -0.8, 0.9, 1, 1, 0.5, 3, f);
  looseBrick(b, PALETTE.houseWall, -2.2, -0.2, 1, 2, 0.3, 3, f + COURSE);
  slope(b, PALETTE.red, 1.7, f, -2.1, 2, 2);
  slope(b, PALETTE.red, 1.6, f, 0.2, 2, 2, turn(0.12, 0, 0, 0));
  brick(b, PALETTE.yellow, 2.4, f + COURSE, -1.6, 1, 1, 3);
  return b;
}

// ---- the sign: a nameplate on two feet -------------------------------------------

/** The sign, in its own frame; its face is a real button drawn on the board (TableScene.tsx). */
export const SIGN = { faceW: 5.6, faceH: 1.9, frameW: 7, frameH: 3.2, feetH: 2 * PLATE };
const boardY = SIGN.feetH;
export const signFaceY = boardY + SIGN.frameH / 2;
/** Just in front of the cream panel, in the sign's frame. */
export const signFaceZ = 0.12;
/** The sign's overall height, for its hit box and touch pad. */
export const signTop = boardY + SIGN.frameH + 0.2;

/**
 * A red brick frame round a cream panel, standing on two yellow feet. The
 * frame's bars are separate bricks, so the seams show; the bottom corners
 * are yellow, like the feet. A nameplate, not a billboard.
 */
export function sign(): Batch {
  const b = new Batch();
  const { frameW: w, frameH: h } = SIGN;
  for (const x of [-w / 2, w / 2 - 2]) brick(b, PALETTE.yellow, x, 0, -1, 2, 2, 2, false);
  // bottom and top bars, staggered so the seams don't line up
  for (const [x, len] of [[-3.5, 1], [-2.5, 2], [-0.5, 2], [1.5, 2]] as const) brick(b, PALETTE.red, x, boardY, -0.5, len, 1, 1, false);
  for (const [x, len] of [[-3.5, 2], [-1.5, 2], [0.5, 2], [2.5, 1]] as const) brick(b, PALETTE.red, x, boardY + h - PLATE, -0.5, len, 1, 1, true);
  // the sides: stacked 2-plate bricks, yellow at the bottom
  for (const x of [-w / 2, w / 2 - 0.6]) {
    for (let y = boardY + PLATE, i = 0; y < boardY + h - PLATE - 0.01; y += 2 * PLATE, i++) {
      brick(b, i === 0 ? PALETTE.yellow : PALETTE.red, x, y, -0.5, 0.6, 1, 2, false);
    }
  }
  b.box(PALETTE.cream, w - 1.2, h - 2 * PLATE, 0.6, 0, boardY + PLATE, -0.2);
  return b;
}

// ---- the scene tray ------------------------------------------------------------

export const SCENE_TRAY = { w: 12, d: 7.5 };
/** The one occupied slot, at the tray's left; the rest stays clear for later scenes. */
export const BEACH_SLOT = { x: -2.9, z: -0.2, w: 5, d: 6 };
/** The scene's name, on a low stand in front of its slot. */
export const SCENE_LABEL = { x: BEACH_SLOT.x, z: SCENE_TRAY.d / 2 + 1.1, w: 6, h: 1.3, y: 0.5 };

/** A wooden tray with room for several scene miniatures; only Beach Houses, the one playable scene, sits in it. */
export function sceneTray(): Batch {
  const b = new Batch();
  const { w, d } = SCENE_TRAY;
  tray(b, PALETTE.woodTray, PALETTE.woodTrayRim, 0, 0, w, d, 1.0);
  b.box(PALETTE.grey, BEACH_SLOT.w, 0.3, BEACH_SLOT.d, BEACH_SLOT.x, 0.3, BEACH_SLOT.z);
  // the name stand: a cream plate between two blue bricks on a blue plate
  const L = SCENE_LABEL;
  brick(b, PALETTE.blue, L.x - L.w / 2 - 1, 0, L.z - 0.6, L.w + 2, 1.2, 1, false);
  for (const s of [-1, 1]) brick(b, PALETTE.blue, L.x + s * (L.w / 2 + 0.5) - 0.5, PLATE, L.z - 0.5, 1, 1, 4, true);
  b.box(PALETTE.cream, L.w, L.h, 0.3, L.x, L.y, L.z);
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
  const s = 0.195;
  const m = new THREE.Matrix4().makeScale(s, s, s);
  m.setPosition(BEACH_SLOT.x - 11 * s, 0.6 + 0.6 * s, BEACH_SLOT.z - 8 * s);
  const out = new Batch();
  for (const { colour, geometry } of raw.build()) out.add(colour, geometry, m);
  return out;
}

// ---- the noticeboard -----------------------------------------------------------

export const BOARD = { w: 10, h: 6.4, y: 1.6 };
/** The header strip along the board's top, where its name is printed. */
export const BOARD_HEADER = { y: BOARD.y + BOARD.h - 1.75, h: 1.55, z: 0.32 };

/**
 * A cork board in a blue brick frame, on two feet. A cream header strip
 * carries its name. Its cards are neutral, pinned with round pins: a small
 * brick diagram, a lined card and a blank card, never a room or a person.
 */
export function noticeboard(): Batch {
  const b = new Batch();
  const { w, h, y } = BOARD;
  for (const side of [-1, 1]) brick(b, PALETTE.blue, side * (w / 2 - 1) - 1, 0, -1.4, 2, 2.8, 1);
  b.box(PALETTE.cork, w, h, 0.5, 0, y, 0);
  // the frame: sides of stacked bricks, top and bottom bars in three pieces each
  for (const side of [-1, 1]) for (let yy = PLATE, i = 0; yy < y + h; yy += COURSE, i++) b.box(PALETTE.blue, 0.95, Math.min(COURSE, y + h - yy) - GAP, 1.1, side * (w / 2 + 0.47), yy, 0);
  for (const [x, len] of [[-w / 2 - 1, 4], [-w / 2 + 3, 4], [-w / 2 + 7, 4]] as const) {
    brick(b, PALETTE.blue, x, y + h, -0.55, len, 1.1, 2, true);
    brick(b, PALETTE.blue, x, y - 2 * PLATE, -0.55, len, 1.1, 2, false);
  }
  b.box(PALETTE.cream, w - 1.0, BOARD_HEADER.h, 0.12, 0, BOARD_HEADER.y, 0.25);
  const pin = (colour: string, m: THREE.Matrix4, x: number, yy: number) => {
    const head = new THREE.SphereGeometry(0.26, 14, 10);
    head.scale(1, 1, 0.7);
    head.translate(x, yy, 0.2);
    b.add(colour, head, m);
  };
  const c1 = new THREE.Matrix4().makeRotationZ(0.05).setPosition(-2.6, y + 0.6, 0.27);
  b.box(PALETTE.paper, 3.2, 2.5, 0.05, 0, 0, 0, c1);
  b.box(PALETTE.red, 1.3, 0.55, 0.05, -0.3, 0.45, 0.04, c1);
  b.box(PALETTE.blue, 0.65, 0.55, 0.05, 0.75, 0.45, 0.04, c1);
  b.box(PALETTE.yellow, 2.0, 0.55, 0.05, 0.2, 1.1, 0.04, c1);
  pin(PALETTE.red, c1, 0, 2.15);
  const c2 = new THREE.Matrix4().makeRotationZ(-0.07).setPosition(1.3, y + 0.75, 0.27);
  b.box(PALETTE.paper, 2.7, 2.2, 0.05, 0, 0, 0, c2);
  for (let i = 0; i < 3; i++) b.box(PALETTE.paperEdge, 1.9, 0.09, 0.03, 0, 0.5 + i * 0.42, 0.04, c2);
  pin(PALETTE.blue, c2, 0, 1.9);
  const c3 = new THREE.Matrix4().makeRotationZ(0.1).setPosition(3.6, y + 0.35, 0.27);
  b.box(PALETTE.white, 1.4, 1.2, 0.05, 0, 0, 0, c3);
  pin(PALETTE.yellow, c3, 0, 1.0);
  return b;
}

// ---- the shelf -----------------------------------------------------------------

export const SHELF = { w: 12, h: 10.8, d: 3 };
/** The name board on top of the shelf. */
export const SHELF_HEADER = { y: SHELF.h + PLATE, h: 1.6, w: 8, z: 0.7 };

/**
 * A two-tier shelf: red brick sides, white boards, a pale back. A few small
 * sample models, built in the same bricks as the table's house: a cottage
 * and a tree above, a lighthouse below, and room left for more. They are
 * samples, not anybody's saved work.
 */
export function shelf(): Batch {
  const b = new Batch();
  const { w, h, d } = SHELF;
  for (const dx of [-w / 2, w / 2 - 1]) for (let y = 0, i = 0; y < h - 0.01; y += COURSE, i++) brick(b, PALETTE.red, dx, y, -d / 2, 1, d, 3, y + COURSE >= h - 0.01);
  b.box(PALETTE.cream, w - 2, h, 0.3, 0, 0, -d / 2 + 0.15);
  const boards = [0, 5.2, h - 0.5];
  for (const y of boards) b.box(PALETTE.white, w - 2, 0.5, d - 0.1, 0, y, 0);
  // the name board, standing on top on two red bricks
  const H = SHELF_HEADER;
  for (const s of [-1, 1]) brick(b, PALETTE.red, s * (H.w / 2 - 1) - 0.5, h, H.z - 0.5, 1, 1, 1, false);
  b.box(PALETTE.cream, H.w, H.h, 0.3, 0, H.y, H.z);

  // top tier: a cottage like the table's house, and a tree
  const t = 5.2 + 0.5;
  brick(b, PALETTE.green, -4.5, t, -1.2, 5, 3, 1, false);
  const cx = -2.5;
  for (let c = 0; c < 2; c++) {
    const y = t + PLATE + c * COURSE;
    brick(b, PALETTE.white, cx - 1.5, y, -1, 3, 1, 3, false);
    brick(b, PALETTE.white, cx - 1.5, y, 0, 1, 1, 3, false);
    brick(b, PALETTE.white, cx + 0.5, y, 0, 1, 1, 3, false);
  }
  b.box(PALETTE.blue, 0.8, 1.6, 0.12, cx, t + PLATE, 0.98);
  const ry = t + PLATE + 2 * COURSE;
  const m = new THREE.Matrix4().makeTranslation(cx, 0, 0);
  for (const side of [-1, 1] as const) roofRow(b, PALETTE.red, side, 0, ry, -1.2, 1.2, false, m);
  const r = new THREE.Matrix4().makeTranslation(cx, 0, 0);
  const rg = new THREE.Shape();
  rg.moveTo(-1.5, 0);
  rg.lineTo(1.5, 0);
  rg.lineTo(0, 1.15);
  rg.closePath();
  const rgg = new THREE.ExtrudeGeometry(rg, { depth: 2, bevelEnabled: false });
  rgg.translate(0, ry - 0.02, -1);
  b.add(PALETTE.white, rgg, r);
  tree(b, 1.4, t, -0.2, 0.7);

  // bottom tier: a lighthouse of round bricks, and space
  const lx = -3;
  const ly = 0.5;
  for (let i = 0; i < 3; i++) roundBrick(b, i % 2 ? PALETTE.white : PALETTE.red, lx, ly + i * COURSE, 0, 0.8, 3, false);
  const lamp = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 16);
  lamp.translate(lx, ly + 3 * COURSE + 0.225, 0);
  b.add(PALETTE.yellow, lamp);
  const cap = new THREE.ConeGeometry(0.75, 0.6, 16);
  cap.translate(lx, ly + 3 * COURSE + 0.75, 0);
  b.add(PALETTE.red, cap);
  return b;
}

// ---- the booklet ----------------------------------------------------------------

export const BOOKLET = { w: 10, d: 7, cover: 0.2, page: 0.55 };
/** The open pages' top surface, where the print lies (TableScene.tsx). */
export const bookletPageY = BOOKLET.cover + BOOKLET.page;

/**
 * An open instruction booklet: a blue hard cover, two thick page blocks with
 * their edges showing, and a crease at the fold. The print (a header, a house
 * and a building step) is a texture laid on the pages.
 */
export function booklet(): Batch {
  const b = new Batch();
  const { w, d, cover, page } = BOOKLET;
  b.box(PALETTE.blue, w + 0.5, cover, d + 0.45, 0, 0, 0);
  for (const side of [-1, 1]) {
    const cx = side * (w / 4 + 0.03);
    b.box(PALETTE.paper, w / 2 - 0.1, page, d, cx, cover, 0);
    // page edges: fine lines along the front and the outer edge
    for (let i = 1; i < 5; i++) {
      const y = cover + (i * page) / 5 - 0.012;
      b.box(PALETTE.paperEdge, w / 2 - 0.16, 0.022, 0.02, cx, y, d / 2 + 0.002);
      b.box(PALETTE.paperEdge, 0.02, 0.022, d - 0.06, side * (w / 2 - 0.02), y, 0);
    }
  }
  b.box(PALETTE.paperEdge, 0.12, 0.04, d, 0, cover + page - 0.03, 0);
  return b;
}

// ---- friends and the free seat ---------------------------------------------------

export const FRIENDS_LABEL = { w: 4.6, h: 1.3, y: 0.5, z: 1.9 };

/** A red envelope with a heart seal, and a small name stand in front of it. Names no one. */
export function friends(): Batch {
  const b = new Batch();
  // the envelope leans back against a brick, its flap and seal towards the room
  brick(b, PALETTE.yellow, -1, 0, -1.3, 2, 1, 3, true);
  const lean = new THREE.Matrix4().makeRotationX(1.05).setPosition(0, 0.05, 0.4);
  b.box(PALETTE.envelope, 5, 0.16, 3.4, 0, 0, -1.7, lean);
  const flap = new THREE.Shape();
  flap.moveTo(-2.5, 0);
  flap.lineTo(2.5, 0);
  flap.lineTo(0, 1.9);
  flap.closePath();
  const fg = new THREE.ExtrudeGeometry(flap, { depth: 0.06, bevelEnabled: false });
  fg.rotateX(Math.PI / 2);
  fg.translate(0, 0.22, 0);
  b.add(PALETTE.envelopeFlap, fg, lean.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -3.4)));
  const heart = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16);
  heart.translate(0, 0.28, -1.6);
  b.add(PALETTE.yellow, heart, lean);
  const L = FRIENDS_LABEL;
  brick(b, PALETTE.yellow, -L.w / 2 - 1, 0, L.z - 0.6, L.w + 2, 1.2, 1, false);
  for (const s of [-1, 1]) brick(b, PALETTE.red, s * (L.w / 2 + 0.5) - 0.5, PLATE, L.z - 0.5, 1, 1, 4, true);
  b.box(PALETTE.cream, L.w, L.h, 0.3, 0, L.y, L.z);
  return b;
}

/** One blank nameplate at the free seat: room for someone else. It names no one. */
export function nameplate(): Batch {
  const b = new Batch();
  const s = new THREE.Shape();
  s.moveTo(-0.85, 0);
  s.lineTo(0.85, 0);
  s.lineTo(0.12, 1.25);
  s.lineTo(-0.12, 1.25);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  g.rotateY(Math.PI / 2);
  g.translate(-2.5, 0.06, 0);
  b.add(PALETTE.cream, g);
  return b;
}

/** For the camera path check: rough boxes round the tall objects, in the table's frame. */
export function obstacles(layout: "wide" | "narrow"): THREE.Box3[] {
  const P = PLACES[layout];
  const box = (p: Place, hw: number, h: number, hd: number) => {
    const pts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(...at(p, sx * hw, 0, sz * hd))));
    return new THREE.Box3().setFromPoints([...pts, new THREE.Vector3(pts[0].x, h * (p.scale ?? 1), pts[0].z)]);
  };
  return [
    // the house itself (walls, roof, chimney and the tree behind), and its low baseplate
    box(P.creation, HW + 1.2, ROOF_Y + 4 * COURSE + 0.4, 5.8),
    box(P.creation, BASEPLATE.w / 2, 1.4, BASEPLATE.d / 2),
    box(P.board, 6, BOARD.y + BOARD.h + 1, 1.5),
    box(P.shelf, 6.5, SHELF_HEADER.y + SHELF_HEADER.h, 1.6),
    box(P.sign, 3.8, signTop + 0.4, 1.2),
    box(P.roofIdeas, 4.5, 2.6, 2),
    box(P.scenes, 6.2, 3.5, 4.8),
    box(P.friends, 3, 2, 2.5),
    box(P.booklet, BOOKLET.w / 2 + 0.3, 1.2, BOOKLET.d / 2 + 0.3),
    box(P.parts, 4.2, 1.6, 3),
  ];
}
