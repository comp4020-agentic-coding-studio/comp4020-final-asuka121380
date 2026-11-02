import * as THREE from "three";
import { PLATE } from "../../scene/geometry.ts";
import { Batch, house } from "../../scene/scenery.ts";

// The tabletop's decoration, built from the same brick language as the game
// (ADR 0014): `Batch` merges everything of one colour into one mesh. Nothing
// here is a game part, a scene or saved work; it is a picture made of bricks.
// `scenery.ts` and `geometry.ts` are pure geometry (three.js only), so using
// them here starts no editor state.
//
// Units are studs. y = 0 is the table's surface; the visitor sits at +z.
// Each object is built around its own origin and placed by `PLACES`, which
// has a wide (landscape) and a narrow (portrait) arrangement of one table:
// a phone recomposes the table rather than shrinking the desktop view.

const COURSE = 3 * PLATE;
const GAP = 0.03;

export const PALETTE = {
  red: "#d9281e",
  yellow: "#f7c51e",
  cream: "#f4ead2",
  white: "#f6f3ec",
  blue: "#2d63ad",
  green: "#3f9b5a",
  leaf: "#57b36c",
  trunk: "#7a5235",
  wood: "#c99c6e",
  woodDark: "#a77a4f",
  woodSeam: "#b88b5e",
  wall: "#f1e6d0",
  skirting: "#e2d1b1",
  paper: "#fbf6ea",
  paperShade: "#ece1c9",
  cork: "#c89a63",
  baseplate: "#5fae6a",
  tray: "#e9e2d4",
  slot: "#b3875a",
};

export type ObjectId = "creation" | "parts" | "sign" | "scenes" | "board" | "shelf" | "friends" | "booklet";
export interface Place {
  x: number;
  z: number;
  /** A turn about the vertical, in radians. */
  rot?: number;
  /** Drawn larger than life: the narrow arrangement enlarges the working entrance. */
  scale?: number;
}

/**
 * Where each object stands, per arrangement. Wide: the full composition, read
 * left to right. Narrow: the same objects drawn in towards the centre and
 * stacked in depth so a portrait screen holds the whole table.
 */
export const PLACES: Record<"wide" | "narrow", Record<ObjectId, Place>> = {
  wide: {
    creation: { x: 0, z: 0 },
    parts: { x: 9, z: -0.5 },
    sign: { x: -11, z: 10 },
    scenes: { x: -17, z: -6.5 },
    board: { x: -5, z: -15 },
    shelf: { x: 11, z: -15.5 },
    friends: { x: 8, z: 9.5, rot: 0.16 },
    booklet: { x: 17.5, z: 3, rot: -0.3 },
  },
  narrow: {
    creation: { x: 1, z: -1.5 },
    parts: { x: 8.5, z: -4 },
    sign: { x: -5.5, z: 11.5, scale: 1.35 },
    scenes: { x: -9.5, z: -6.5 },
    board: { x: -5, z: -15 },
    shelf: { x: 7, z: -15.5 },
    friends: { x: 5, z: 12.5, rot: 0.16 },
    booklet: { x: 7, z: 5.5, rot: -0.3 },
  },
};

const placeMatrix = (p: Place): THREE.Matrix4 => new THREE.Matrix4().makeRotationY(p.rot ?? 0).setPosition(p.x, 0, p.z);

/** Moves a batch built around its own origin to where `p` puts it. */
export function placed(b: Batch, p: Place): Batch {
  const out = new Batch();
  const m = placeMatrix(p);
  for (const { colour, geometry } of b.build()) out.add(colour, geometry, m);
  return out;
}

/** A point in an object's own frame, in the table's frame. */
export function at(p: Place, x: number, y: number, z: number): [number, number, number] {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(placeMatrix(p));
  return [v.x, v.y, v.z];
}

/** One brick with studs, sitting on y, its footprint's corner at (x, z). */
export function brick(b: Batch, colour: string, x: number, y: number, z: number, w: number, d: number, plates = 3, studs = true, m?: THREE.Matrix4): void {
  b.box(colour, w - GAP, plates * PLATE - GAP, d - GAP, x + w / 2, y, z + d / 2, m);
  if (studs) b.studs(colour, x, x + w, z, z + d, y + plates * PLATE - GAP, m);
}

/** An open tray: a floor and four low rims, centred on (x, z). */
function tray(b: Batch, colour: string, rim: string, x: number, z: number, w: number, d: number, h: number): void {
  b.box(colour, w, 0.25, d, x, 0, z);
  for (const [ww, dd, dx, dz] of [[w, 0.35, 0, -d / 2 + 0.175], [w, 0.35, 0, d / 2 - 0.175], [0.35, d, -w / 2 + 0.175, 0], [0.35, d, w / 2 - 0.175, 0]] as const) {
    b.box(rim, ww, h, dd, x + dx, 0, z + dz);
  }
}

// ---- the room and the table ----------------------------------------------------

/** A plain warm wall behind the table, with a low rail: a room, not a backdrop. */
export function room(): Batch {
  const b = new Batch();
  b.box(PALETTE.wall, 260, 120, 1, 0, -60, -27);
  b.box(PALETTE.skirting, 260, 0.5, 0.6, 0, 3.5, -26.4);
  // the floor far below the top, in the table's shadow
  b.box("#8a6446", 260, 1, 200, 0, -42, 60);
  return b;
}

export const TABLE = { w: 54, d: 36 };

/** A thick wooden top with rounded corners and a few plank seams, on four legs. */
export function table(): Batch {
  const b = new Batch();
  const { w: W, d: D } = TABLE;
  const r = 2.4;
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
  const slab = new THREE.ExtrudeGeometry(top, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 3, curveSegments: 6 });
  slab.rotateX(Math.PI / 2);
  slab.translate(0, -0.3, 0);
  b.add(PALETTE.wood, slab);
  for (let z = -D / 2 + 6; z < D / 2 - 2; z += 6) b.box(PALETTE.woodSeam, W - 1.2, 0.02, 0.1, 0, -0.005, z);
  // an apron under the top's front and sides
  b.box(PALETTE.woodDark, W - 3, 3, 0.6, 0, -5, D / 2 - 1.2);
  for (const side of [-1, 1]) b.box(PALETTE.woodDark, 0.6, 3, D - 3, side * (W / 2 - 1.2), -5, 0);
  for (const [x, z] of [[-W / 2 + 2.5, -D / 2 + 2.5], [W / 2 - 2.5, -D / 2 + 2.5], [-W / 2 + 2.5, D / 2 - 2.5], [W / 2 - 2.5, D / 2 - 2.5]]) {
    b.box(PALETTE.woodDark, 2, 40, 2, x, -42, z);
  }
  return b;
}

// ---- the centre: an unfinished house on a baseplate ----------------------------

// the baseplate's corner, relative to the creation's own origin
const OX = -4;
const OZ = -5;
const Y0 = PLATE * 0.5;

/**
 * A small build in progress: a finished back wall, a half-built left wall, a
 * doorway, a path and a little tree, with room left for another person's
 * ideas. Illustrative only; it is no one's saved work.
 */
export function creation(): Batch {
  const b = new Batch();
  b.box(PALETTE.baseplate, 12 - GAP, Y0, 10 - GAP, OX + 6, 0, OZ + 5);
  b.studs(PALETTE.baseplate, OX, OX + 12, OZ, OZ + 10, Y0 - GAP);
  // back wall: four courses, cream with one red course; the last course
  // stops short, leaving a gap that a proposed brick fills
  for (let c = 0; c < 4; c++) {
    const colour = c === 2 ? PALETTE.red : PALETTE.cream;
    const top = c === 3;
    if (c === 3) {
      brick(b, colour, OX + 2, Y0 + c * COURSE, OZ + 2, 4, 1, 3, top);
    } else if (c % 2) {
      brick(b, colour, OX + 2, Y0 + c * COURSE, OZ + 2, 1, 1, 3, top);
      brick(b, colour, OX + 3, Y0 + c * COURSE, OZ + 2, 4, 1, 3, top);
      brick(b, colour, OX + 7, Y0 + c * COURSE, OZ + 2, 3, 1, 3, top);
    } else {
      brick(b, colour, OX + 2, Y0 + c * COURSE, OZ + 2, 4, 1, 3, top);
      brick(b, colour, OX + 6, Y0 + c * COURSE, OZ + 2, 4, 1, 3, top);
    }
  }
  // left wall: stepping down towards the front, still being built
  for (let c = 0; c < 3; c++) {
    for (let z = 3; z < 8 - c * 2; z += 2) brick(b, PALETTE.cream, OX + 2, Y0 + c * COURSE, OZ + z, 1, Math.min(2, 8 - c * 2 - z));
  }
  // right wall: two courses with a doorway near the front
  for (let c = 0; c < 2; c++) {
    brick(b, PALETTE.cream, OX + 9, Y0 + c * COURSE, OZ + 3, 1, 2);
    brick(b, c ? PALETTE.yellow : PALETTE.cream, OX + 9, Y0 + c * COURSE, OZ + 7, 1, 1);
  }
  brick(b, PALETTE.white, OX + 5, Y0, OZ + 8, 2, 2, 1);
  b.box(PALETTE.trunk, 0.8, 2.2, 0.8, OX + 11, Y0, OZ + 1);
  brick(b, PALETTE.green, OX + 10, Y0 + 2.2, OZ, 2, 2);
  brick(b, PALETTE.leaf, OX + 10.5, Y0 + 2.2 + COURSE, OZ + 0.5, 1, 1);
  return b;
}

/** The proposed brick fills the gap in the top course of the back wall: someone else's idea, not yet built. */
export const PROPOSED = { x: OX + 6, y: Y0 + 3 * COURSE, z: OZ + 2, w: 4, d: 1, h: COURSE };

/** A shallow parts tray with a few loose bricks, and two spare pieces on the table. */
export function partsTray(): Batch {
  const b = new Batch();
  tray(b, PALETTE.tray, PALETTE.tray, 0, 0, 6, 4.5, 0.9);
  brick(b, PALETTE.red, -2.4, 0.25, -1.7, 2, 1);
  brick(b, PALETTE.yellow, -0.1, 0.25, -1.5, 2, 2);
  brick(b, PALETTE.blue, -2.5, 0.25, 0.4, 2, 1, 1);
  brick(b, PALETTE.cream, 0.8, 0.25, 0.9, 1, 1);
  return b;
}

/** A spare piece on the table, centred on its own origin. */
export function spare(w: number, plates: number, colour: string): Batch {
  const b = new Batch();
  brick(b, colour, -w / 2, 0, -0.5, w, 1, plates);
  return b;
}

// ---- the sign ------------------------------------------------------------------

/** The sign's board, in its own frame; its face is the readable, clickable label (TableScene.tsx). */
export const SIGN = { faceW: 7, faceH: 3.2, postH: 2.4 };
export const signFaceY = PLATE + SIGN.postH + 0.4 + SIGN.faceH / 2;

/** A red-and-yellow brick-built sign: a white base plate, two yellow posts, a red board. */
export function sign(): Batch {
  const b = new Batch();
  const { faceW, faceH, postH } = SIGN;
  brick(b, PALETTE.white, -4, 0, -1.5, 8, 3, 1);
  for (const dx of [-2.6, 2.6]) brick(b, PALETTE.yellow, dx - 0.5, PLATE, -0.5, 1, 1, postH / PLATE, false);
  const y = PLATE + postH;
  b.box(PALETTE.red, faceW + 0.8, faceH + 0.8, 0.9, 0, y, 0);
  b.studs(PALETTE.red, -faceW / 2, faceW / 2, -0.5, 0.5, y + faceH + 0.8);
  // a yellow brick on top, set slightly off-centre: put there by hand
  brick(b, PALETTE.yellow, 1.5, y + faceH + 0.8, -0.5, 2, 1);
  return b;
}

// ---- the scene tray ------------------------------------------------------------

export const SCENE_TRAY = { w: 11, d: 7 };
/** The one occupied slot, at the tray's left; the rest stays clear for later scenes. */
export const BEACH_SLOT = { x: -2.7, z: 0, w: 4.6, d: 5.6 };

/**
 * A wooden tray with room for several scene miniatures. Only Beach Houses is
 * playable, so only it sits here; the empty slots stay plain wood, with no
 * shapes that could look like more scenes.
 */
export function sceneTray(): Batch {
  const b = new Batch();
  const { w, d } = SCENE_TRAY;
  tray(b, PALETTE.woodDark, PALETTE.wood, 0, 0, w, d, 0.9);
  b.box(PALETTE.cream, BEACH_SLOT.w, 0.1, BEACH_SLOT.d, BEACH_SLOT.x, 0.25, BEACH_SLOT.z);
  return b;
}

/**
 * Beach Houses in miniature: three of the scene's colourful neighbours, made
 * with the same house builder the game's scenery uses, facing a strip of sand
 * and sea. Scaled into the tray's one slot.
 */
export function beachMiniature(): Batch {
  const raw = new Batch();
  raw.merge(house({ x: 0, z: 0, w: 8, d: 6, storeys: 2, roofKind: "flat", wall: "#f5a3b7", base: "#e98aa1", trim: PALETTE.white, roof: "#c9c3bd", door: "#ff7059", openings: [{ face: "front", at: 1, kind: "door" }, { face: "front", at: 4, kind: "window", wide: true, storey: 1 }, { face: "front", at: 5, kind: "window" }] }));
  raw.merge(house({ x: 9, z: 0, w: 6, d: 6, storeys: 2, wall: "#2fb8ae", base: "#1f8f88", trim: "#ffd23f", roof: PALETTE.white, door: "#ffd23f", openings: [{ face: "front", at: 2, kind: "door" }, { face: "front", at: 2, kind: "window", storey: 1 }] }));
  raw.merge(house({ x: 16, z: 0, w: 6, d: 6, storeys: 1, wall: "#ffd23f", base: "#e4b520", trim: PALETTE.white, roof: "#ff7a5c", door: "#2a6fd1", openings: [{ face: "front", at: 2, kind: "door" }] }));
  raw.box("#efd7a4", 24, 0.6, 7, 11, -0.6, 9.5);
  raw.box("#5fb8d3", 24, 0.5, 3, 11, -0.6, 14.5);
  const s = 0.18;
  const m = new THREE.Matrix4().makeScale(s, s, s);
  m.setPosition(BEACH_SLOT.x - 11 * s, 0.35 + 0.6 * s, BEACH_SLOT.z - 8 * s);
  const out = new Batch();
  for (const { colour, geometry } of raw.build()) out.add(colour, geometry, m);
  return out;
}

// ---- the noticeboard -----------------------------------------------------------

export const BOARD = { w: 9, h: 6, y: 1.6 };
export const boardLabelY = BOARD.y + BOARD.h - 0.95;

/** A blue brick-framed cork board standing at the back. */
export function noticeboard(): Batch {
  const b = new Batch();
  const { w, h, y } = BOARD;
  brick(b, PALETTE.blue, -w / 2 - 1, 0, -1, w + 2, 2, 1);
  b.box(PALETTE.cork, w, h, 0.3, 0, y, 0);
  for (const side of [-1, 1]) b.box(PALETTE.blue, 0.9, h + 1.2, 0.9, side * (w / 2 + 0.45), PLATE, 0);
  b.box(PALETTE.blue, w + 1.8, 0.8, 0.9, 0, y + h, 0);
  b.studs(PALETTE.blue, -w / 2 - 1, w / 2 + 1, -0.5, 0.5, y + h + 0.8);
  b.box(PALETTE.blue, w + 1.8, 0.7, 0.9, 0, y - 0.7, 0);
  // the label strip across the top (the label is centred on boardLabelY), and two blank pinned cards
  b.box(PALETTE.paper, w - 1.2, 1.3, 0.08, 0, boardLabelY - 0.65, 0.19);
  b.box(PALETTE.paper, 2.6, 2.0, 0.06, -2.2, y + 1.0, 0.18);
  b.box(PALETTE.paperShade, 2.2, 1.7, 0.06, 1.8, y + 1.3, 0.18);
  b.box(PALETTE.red, 0.3, 0.3, 0.2, -2.2, y + 2.75, 0.25);
  b.box(PALETTE.yellow, 0.3, 0.3, 0.2, 1.8, y + 2.75, 0.25);
  return b;
}

// ---- the shelf -----------------------------------------------------------------

export const SHELF = { w: 10 };
export const shelfLabelY = 8.2;

/** A two-tier brick shelf with one small kept model, and room for more. */
export function shelf(): Batch {
  const b = new Batch();
  const { w } = SHELF;
  for (const dx of [-w / 2, w / 2 - 1]) brick(b, PALETTE.red, dx, 0, -1, 1, 2, 18);
  for (const y of [0, 3.2, 6.8]) b.box(PALETTE.cream, w - 2, 0.4, 2.2, 0, y, 0);
  b.box(PALETTE.cream, 6.4, 1.4, 0.3, 0, 7.5, 0.7);
  // one small finished model on the lower shelf: a reminder of a session
  brick(b, PALETTE.blue, -3.6, 3.6, -0.5, 2, 1);
  brick(b, PALETTE.yellow, -3.6, 3.6 + COURSE, -0.5, 1, 1);
  brick(b, PALETTE.white, -2.6, 3.6 + COURSE, -0.5, 1, 1);
  b.box(PALETTE.green, 1.4, 0.4, 1.4, -2.6, 0.4, 0);
  return b;
}

// ---- friends and the booklet ---------------------------------------------------

/** Where the nameplates stand, in the friends group's own frame. */
export const NAMEPLATE = { x: 4.6, z: -0.6, rot: -0.38 };

/** An envelope lying on the table, and two small nameplates beside it. */
export function friends(): Batch {
  const b = new Batch();
  b.box(PALETTE.paper, 5, 0.16, 3.2, 0, 0, 0);
  const flap = new THREE.Shape();
  flap.moveTo(-2.5, 1.6);
  flap.lineTo(2.5, 1.6);
  flap.lineTo(0, -0.2);
  flap.closePath();
  const g = new THREE.ExtrudeGeometry(flap, { depth: 0.04, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.2, 0);
  b.add(PALETTE.paperShade, g);
  b.box(PALETTE.red, 0.7, 0.1, 0.7, 0, 0.2, -0.1);
  // nameplates: 1×3 tiles on little stands, the second just behind the first
  for (const [dx, dz, colour] of [[0, 0, PALETTE.yellow], [0.5, -1.4, PALETTE.blue]] as const) {
    const pm = new THREE.Matrix4().makeRotationY(NAMEPLATE.rot).setPosition(NAMEPLATE.x + dx, 0, NAMEPLATE.z + dz);
    b.box(PALETTE.white, 1.2, PLATE, 0.7, 0, 0, 0, pm);
    b.box(colour, 2.8, 0.9, 0.24, 0, PLATE, 0, pm);
  }
  return b;
}

/** A closed instruction booklet, cover up. */
export function booklet(): Batch {
  const b = new Batch();
  b.box(PALETTE.paper, 4.4, 0.34, 5.8, 0, 0, 0);
  b.box(PALETTE.yellow, 4.5, 0.05, 5.9, 0, 0.34, 0);
  // a little drawing of three bricks on the lower half of the cover
  b.box(PALETTE.blue, 1.6, 0.06, 0.8, -0.5, 0.39, 1.0);
  b.box(PALETTE.red, 0.8, 0.06, 0.8, 0.9, 0.39, 1.0);
  b.box(PALETTE.white, 1.6, 0.06, 0.8, 0.1, 0.39, 1.9);
  return b;
}
